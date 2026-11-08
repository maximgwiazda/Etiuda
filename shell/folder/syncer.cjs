/* shell/folder/syncer.cjs - Background folder syncer for shared-folder teams.
 * Manages the background worker thread that watches and synchronizes a shared team folder
 * into the local mirror (<userData>/folder-mirror/<teamId>/).
 *
 * Board 945 stage 3 (b), slice 1.
 * D2: The worker only stages files into the mirror's .staging directory.
 * The main thread runs existing check functions on local bytes and renames into place or drops them.
 * No keys or pins are sent to the worker thread.
 * D4: Worker lists the shared folder every FOLDER_SYNC_CADENCE_MS (3000ms by default).
 * A folder watch event asks for a listing early via kick().
 * Both the two-equal-listings rule and two-listing removal scale with this cadence.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Worker } = require("node:worker_threads");

const FOLDER_SYNC_CADENCE_MS = 3000;
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
const SEALED_TEAM_RE = /^t-[0-9a-f]{16}$/;
const PENDING_MAX = 50;
const SHARE_ASK_MS = 10000;

function canonJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonJson).join(",") + "]";
  const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonJson(v[k])).join(",") + "}";
}

function signedBytesOf(doc) {
  const copy = {};
  Object.keys(doc).forEach(k => {
    if (k === "hash") return;
    if (k !== "sig") { copy[k] = doc[k]; return; }
    const s = doc.sig;
    if (s && typeof s === "object") {
      copy.sig = {};
      if (s.alg !== undefined) copy.sig.alg = s.alg;
      if (s.keyId !== undefined) copy.sig.keyId = s.keyId;
    }
  });
  return Buffer.from(canonJson(copy), "utf8");
}

function conflictSiblingName(canonical, name) {
  const c = path.basename(String(canonical || ""));
  const n = path.basename(String(name || ""));
  if (!c || !n) return false;
  const cExt = path.extname(c), nExt = path.extname(n);
  if (!cExt || cExt.toLowerCase() !== nExt.toLowerCase()) return false;
  const cStem = c.slice(0, -cExt.length), nStem = n.slice(0, -nExt.length);
  if (!cStem || nStem.length <= cStem.length) return false;
  if (nStem.slice(0, cStem.length).toLowerCase() !== cStem.toLowerCase()) return false;
  const tail = nStem.slice(cStem.length);
  if (/^( \(\d+\))+$/.test(tail)) return true;
  if (/^ \(.*conflicted copy.*\)$/i.test(tail)) return true;
  if (/^-(?!V\d+$)[A-Z0-9][A-Z0-9-]{2,62}$/.test(tail)) return true;
  if (/^\.sync-conflict-/.test(tail)) return true;
  if (/^(_conf\(\d+\))+$/i.test(tail)) return true;
  return false;
}

function isTeamConflict(rel) {
  const norm = String(rel || "").replace(/\\/g, "/");
  return norm.indexOf("/") < 0 && conflictSiblingName("etiuda-team.json", norm);
}


function teamRevOf(doc) {
  if (doc.rev === undefined) return 0;
  return Number.isSafeInteger(doc.rev) && doc.rev >= 0 ? doc.rev : null;
}

function teamChannelOf(doc) {
  const c = doc.channel;
  if (c === undefined) return { kind: "folder" };
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  if (c.kind === "folder") return { kind: "folder" };
  if (c.kind !== "relay" || typeof c.rt !== "string" || !/^[0-9a-f]{32}$/.test(c.rt) || typeof c.url !== "string"
    || c.url.length > 512 || !/^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?(?:\/[A-Za-z0-9._~-]+)*\/?$/.test(c.url)) return null;
  return { kind: "relay", rt: c.rt, url: c.url };
}

function branchIdOf(pub) {
  return "k-" + crypto.createHash("sha256").update(Buffer.from(String(pub), "hex")).digest("hex").slice(0, 16);
}

const JOIN_PREFIX = "etiuda-desk-join\n";
const JOIN_KIND = "etiuda-join";
const JOIN_HEX_RE = /^[0-9a-f]{64}$/;
function joinSignedBytes(doc) { return Buffer.concat([Buffer.from(JOIN_PREFIX, "utf8"), signedBytesOf(doc)]); }

function joinGenuine(doc, folder) {
  const d = doc && doc.desk, sig = doc && doc.sig;
  try {
    return !!folder && +doc.format === 1 && doc.kind === JOIN_KIND && SEALED_TEAM_RE.test(String(doc.team))
      && !!d && typeof d === "object" && d.id === folder && /^k-[0-9a-f]{16}$/.test(d.id) && JOIN_HEX_RE.test(String(d.key))
      && JOIN_HEX_RE.test(String(d.box)) && branchIdOf(d.key) === d.id
      && JOIN_HEX_RE.test(String(doc.commit))
      && !!sig && sig.alg === "Ed25519" && sig.keyId === d.id && /^[0-9a-f]{128}$/.test(String(sig.value))
      && crypto.verify(null, joinSignedBytes(doc), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(d.key, "hex")]),
        format: "der", type: "spki" }), Buffer.from(sig.value, "hex"));
  } catch { return false; }
}

function headSignedBytes(doc) {
  return Buffer.concat([Buffer.from("etiuda-relay-head\n", "utf8"), signedBytesOf(doc)]);
}

function headGenuine(doc, pin) {
  if (!doc || typeof doc !== "object" || !doc.sig || typeof doc.sig !== "object") return false;
  if (doc.v !== 1 || !pin || !pin.public) return false;
  if (!Number.isInteger(doc.epoch) || doc.epoch < 1 || !Number.isInteger(doc.rev) || doc.rev < 0 || !Number.isFinite(doc.t)) return false;
  const sig = doc.sig;
  if (sig.alg !== "Ed25519" || !/^[0-9a-f]{128}$/.test(String(sig.value || ""))) return false;
  try {
    const pubKey = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(pin.public, "hex")]), format: "der", type: "spki" });
    return crypto.verify(null, headSignedBytes(doc), pubKey, Buffer.from(sig.value, "hex"));
  } catch { return false; }
}

function isAllowedPath(rel) {
  const norm = String(rel || "").replace(/\\/g, "/");
  const parts = norm.split("/");
  if (parts.length === 1) {
    if (norm.endsWith(".ec")) return true;
    if (/^etiuda-team.*\.json$/i.test(norm)) return true;
    if (/^etiuda-head.*\.json$/i.test(norm)) return true;
    if (/^etiuda-ring.*\.json$/i.test(norm)) return true;
    if (/^etiuda-team-joins.*\.json$/i.test(norm)) return true;
    if (/^etiuda-team-pause.*\.json$/i.test(norm)) return true;
    if (/^stats-span.*\.json$/i.test(norm)) return true;
    return false;
  }
  if (parts[0] === "invites" && parts.length === 2) {
    return parts[1].endsWith(".wrap.json") || parts[1].endsWith(".refused.json");
  }
  if (parts[0] === "catalog-asks" && parts.length === 2) {
    return parts[1].endsWith(".json");
  }
  if (parts[0] === "desks" && parts.length === 3) {
    const deskId = parts[1];
    const file = parts[2];
    if (!/^k-[0-9a-f]{16}$/.test(deskId)) return false;
    if (file.endsWith(".ec")) return true;
    if (file === "stats.estat" || file === "join.json") return true;
    return false;
  }
  return false;
}

function ensureDir(p, io) {
  const dir = path.dirname(p);
  try { io.mkdir(dir); } catch {}
}

const defaultIO = {
  readdir: (dir) => fs.readdirSync(dir),
  stat: (p) => fs.statSync(p),
  readFile: (p, enc) => fs.readFileSync(p, enc),
  writeFile: (p, data) => fs.writeFileSync(p, data),
  unlink: (p) => fs.unlinkSync(p),
  mkdir: (dir) => fs.mkdirSync(dir, { recursive: true }),
  exists: (p) => fs.existsSync(p),
  rename: (from, to) => fs.renameSync(from, to)
};

const sha256hex = (bytes) => crypto.createHash("sha256").update(Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), "utf8")).digest("hex");
const normRel = (rel) => String(rel || "").replace(/\\/g, "/");

/* THE OUTBOX: what this desk wrote into the mirror and the share has not yet taken, one record a path ({owe, sha, del}),
   kept beside the mirror's files under a dot name neither walk lists, with the rev and counter floors. A record goes once
   the share holds exactly those bytes, or no file for a deletion. The floors never go down: an edition deleted and published
   again under the same name at a lower rev would stay out. That holds while Studio always raises rev. */
const OUTBOX_NAME = ".outbox.json";
const OUTBOX_KIND = "etiuda-folder-outbox";
const PRIMED_NAME = ".primed";
function readOutbox(mirror, io) {
  try {
    const doc = JSON.parse(io.readFile(path.join(mirror, OUTBOX_NAME), "utf8"));
    if (doc && doc.kind === OUTBOX_KIND && doc.owe && typeof doc.owe === "object") {
      return { owe: doc.owe, floors: doc.floors && typeof doc.floors === "object" ? doc.floors : {} };
    }
  } catch {}
  return { owe: {}, floors: {} };
}
function writeOutbox(mirror, st, io) {
  const file = path.join(mirror, OUTBOX_NAME);
  const tmp = file + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
  try { io.mkdir(mirror); } catch {}
  io.writeFile(tmp, JSON.stringify({ kind: OUTBOX_KIND, v: 1, owe: st.owe, floors: st.floors }));
  try { io.rename(tmp, file); } catch (e) { try { io.unlink(tmp); } catch {} throw e; }
}
function owedRecord(mirror, rel, io) {
  let bytes = null;
  try { bytes = io.readFile(path.join(mirror, rel)); } catch { bytes = null; }
  return bytes == null ? { owe: true, sha: null, del: true } : { owe: true, sha: sha256hex(bytes), del: false };
}
/* A write or a removal this desk made at `rel` in the mirror, owed to the share. False for a path Etiuda does not keep. */
function noteOwed(mirror, rel, io) {
  io = io || defaultIO;
  const norm = normRel(rel);
  if (!isAllowedPath(norm)) return false;
  const st = readOutbox(mirror, io);
  st.owe[norm] = owedRecord(mirror, norm, io);
  writeOutbox(mirror, st, io);
  return true;
}
function owedList(mirror, io) {
  const st = readOutbox(mirror, io || defaultIO);
  return Object.keys(st.owe).filter(k => st.owe[k] && st.owe[k].owe).map(k => ({ rel: k, sha: st.owe[k].sha || null, del: !!st.owe[k].del }));
}
function owedAt(mirror, rel, io) {
  const st = readOutbox(mirror, io || defaultIO);
  const rec = st.owe[normRel(rel)];
  return !!(rec && rec.owe);
}

const RENAME_BUSY = ["EPERM", "EACCES", "EBUSY"];
function pause(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} }
function renameRetrying(from, to, io) {
  for (let i = 1; ; i++) {
    try { io.rename(from, to); return; }
    catch (e) {
      if (i >= 20 || RENAME_BUSY.indexOf(e && e.code) < 0) throw e;
      pause(50);
    }
  }
}
/* Temp then rename beside the file, so the share never holds half a file under its name. */
function writeWhole(file, bytes, io) {
  const tmp = file + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
  try {
    io.writeFile(tmp, bytes);
    renameRetrying(tmp, file, io);
  } catch (e) {
    try { io.unlink(tmp); } catch {}
    throw e;
  }
}

/* The owed records written to the share: a file's bytes as the mirror holds them now, a removal as a removal. The share's
   folder must already be there, and only the folders below it are made, so a share that has gone away is never made again.
   A record whose bytes the mirror no longer holds is left: a later write is owed in its place. Off the main thread. */
function flushOwed(folder, mirror, items, io) {
  io = io || defaultIO;
  const out = [];
  let rootCode = "";
  try { if (!io.stat(folder).isDirectory()) rootCode = "ENOTDIR"; } catch (e) { rootCode = (e && e.code) || "EIO"; }
  for (const it of items || []) {
    const rel = normRel(it && it.rel);
    if (!isAllowedPath(rel)) continue;
    const del = !!it.del;
    if (rootCode) { out.push({ rel, sha: del ? null : it.sha, del, ok: false, code: rootCode }); continue; }
    const parts = rel.split("/");
    const dest = path.join(folder, ...parts);
    try {
      if (del) {
        try { io.unlink(dest); } catch (e) { if (!e || e.code !== "ENOENT") throw e; }
        out.push({ rel, sha: null, del: true, ok: true });
        continue;
      }
      const bytes = io.readFile(path.join(mirror, ...parts));
      const sha = sha256hex(bytes);
      if (sha !== it.sha) continue;
      for (let i = 1; i < parts.length; i++) {
        try { fs.mkdirSync(path.join(folder, ...parts.slice(0, i))); } catch (e) { if (!e || e.code !== "EEXIST") throw e; }
      }
      writeWhole(dest, bytes, io); /* plant:outbox-flush */
      let st = null;
      try { st = io.stat(dest); } catch {}
      out.push({ rel, sha, del: false, ok: true, size: st ? st.size : null, mtimeMs: st ? (st.mtimeMs || 0) : null });
    } catch (e) {
      out.push({ rel, sha: del ? null : it.sha, del, ok: false, code: (e && e.code) || "EIO" });
    }
  }
  return out;
}

/* ---- the shared catalog's compare and swap, against the share and off the main thread ----------------------------------
   The lock is `<name>.ec.lock` beside the file, taken by exclusive create; a lock older than SHARED_LOCK_MS is a desk that
   stopped mid-write and is taken over. Exclusive create is atomic only on a real share (SMB, a local disk): on a cloud-synced
   folder two desks can each take the lock before either sees the other's, and the outbox's owe and the conflict sibling then
   settle it. The lock is not a guarantee there. Begin holds the lock and answers the bytes there now; the caller judges them, then
   commits, which writes the share and the mirror before the lock goes, or lets the lock go. */
const SHARED_LOCK_MS = 30 * 1000;
function shareName(name) {
  const base = String(name || "");
  return base && base === path.basename(base) && /\.ec$/i.test(base) ? base : "";
}
function shareLock(file) {
  const lock = file + ".lock", token = crypto.randomBytes(16).toString("hex");
  const take = () => {
    const fd = fs.openSync(lock, "wx");
    try { fs.writeSync(fd, JSON.stringify({ kind: "etiuda-lock", token: token, at: Date.now() })); } finally { fs.closeSync(fd); }
  };
  try { take(); return { lock: lock, token: token }; }
  catch (e) { if (e.code !== "EEXIST") throw e; }
  let st = null;
  try { st = fs.statSync(lock); } catch { /* let go meanwhile */ }
  if (st && Date.now() - st.mtimeMs <= SHARED_LOCK_MS) return null;
  if (st) {
    const aside = lock + "." + token + ".stale";
    try { renameRetrying(lock, aside, defaultIO); } catch { return null; }
    try { fs.unlinkSync(aside); } catch { /* left beside it */ }
  }
  try { take(); return { lock: lock, token: token }; }
  catch (e) { if (e.code === "EEXIST") return null; throw e; }
}
function shareHolds(held) {
  try { return JSON.parse(fs.readFileSync(held.lock, "utf8")).token === held.token; } catch { return false; }
}
function shareRelease(held) {
  if (held && shareHolds(held)) { try { fs.unlinkSync(held.lock); } catch { /* stale in SHARED_LOCK_MS */ } }
}
/* {text} with "" for no file, or null where the share did not answer. */
function shareReadFile(folder, name) {
  const base = shareName(name);
  if (!base) return null;
  try { return { text: fs.readFileSync(path.join(folder, base), "utf8") }; }
  catch (e) { return e && e.code === "ENOENT" ? { text: "" } : null; }
}
function shareCasBegin(folder, name, sha, create) {
  const base = shareName(name);
  if (!base) return { done: true, result: { ok: false } };
  const file = path.join(folder, base);
  let held = null;
  try { held = shareLock(file); } catch { held = null; }
  if (!held) return { done: true, result: { ok: false, busy: true } };
  let now = "";
  try { now = fs.readFileSync(file, "utf8"); }
  catch (e) { if (!e || e.code !== "ENOENT") { shareRelease(held); return { done: true, result: { ok: false, busy: true } }; } }
  if (create && now) { shareRelease(held); return { done: true, result: { ok: false, taken: true } }; }
  let moved = false;
  if (!create && (!now || sha256hex(Buffer.from(now, "utf8")) !== String(sha || ""))) moved = true; /* plant:cas-share-compare */
  if (moved) {
    shareRelease(held);
    return { done: true, result: { ok: false, changed: true } };
  }
  held.file = file;
  held.base = base;
  return { held: held, now: now };
}
function shareCasCommit(held, mirror, text) {
  try {
    if (!held || !shareHolds(held)) return { ok: false, changed: true };
    writeWhole(held.file, Buffer.from(String(text), "utf8"), defaultIO);
    writeWhole(path.join(mirror, held.base), Buffer.from(String(text), "utf8"), defaultIO); /* plant:cas-mirror-back */
    let st = null;
    try { st = fs.statSync(held.file); } catch {}
    return { ok: true, size: st ? st.size : null, mtimeMs: st ? (st.mtimeMs || 0) : null };
  } catch (e) {
    return { ok: false, busy: true, code: (e && e.code) || "EIO" };
  } finally {
    shareRelease(held);
  }
}

function mirrorHasCatalog(mirror, catalogId, io, keyFor, openSealedFn) {
  if (io.exists(path.join(mirror, catalogId + ".ec"))) return true;
  try {
    const names = io.readdir(mirror);
    for (const name of names) {
      if (name.endsWith(".ec") && name !== "in-use.ec" && name !== "catalog-answer.ec") {
        try {
          const content = io.readFile(path.join(mirror, name), "utf8");
          if (content.indexOf('"' + catalogId + '"') >= 0) return true;
          let doc = null;
          try { doc = JSON.parse(content); } catch {}
          if (doc && doc.kind === "etiuda-sealed") {
            const key = typeof keyFor === "function" ? keyFor(doc.epoch) : null;
            if (key) {
              const openFn = typeof openSealedFn === "function" ? openSealedFn : null;
              const inner = openFn ? openFn(key, doc) : null;
              if (inner && inner.indexOf('"' + catalogId + '"') >= 0) return true;
            }
          }
        } catch {}
      }
    }
  } catch {}
  return false;
}

function teamAuthorizedKeys(folder, mirror, io, pin, authorizedKeys) {
  const keys = [];
  if (pin && pin.public) keys.push(pin.public);
  if (Array.isArray(authorizedKeys)) {
    for (const k of authorizedKeys) {
      if (k && keys.indexOf(k) < 0) keys.push(k);
    }
  } else if (typeof authorizedKeys === "function") {
    try {
      const extra = authorizedKeys();
      if (Array.isArray(extra)) {
        for (const k of extra) {
          if (k && keys.indexOf(k) < 0) keys.push(k);
        }
      }
    } catch {}
  }
  for (const dir of [mirror, folder]) {
    try {
      const ringFile = path.join(dir, "etiuda-ring.json");
      if (io.exists(ringFile)) {
        const doc = JSON.parse(io.readFile(ringFile, "utf8"));
        if (doc && Array.isArray(doc.keys)) {
          for (const k of doc.keys) {
            if (k && k.public && keys.indexOf(k.public) < 0) keys.push(k.public);
          }
        }
      }
    } catch {}
    try {
      const teamFile = path.join(dir, "etiuda-team.json");
      if (io.exists(teamFile)) {
        const tDoc = JSON.parse(io.readFile(teamFile, "utf8"));
        if (tDoc) {
          if (tDoc.lead && tDoc.lead.public && keys.indexOf(tDoc.lead.public) < 0) keys.push(tDoc.lead.public);
          if (tDoc.ring && Array.isArray(tDoc.ring.keys)) {
            for (const k of tDoc.ring.keys) {
              if (k && k.public && keys.indexOf(k.public) < 0) keys.push(k.public);
            }
          }
          if (Array.isArray(tDoc.handover)) {
            for (const h of tDoc.handover) {
              if (h && h.from && h.from.public && keys.indexOf(h.from.public) < 0) keys.push(h.from.public);
              if (h && h.to && h.to.public && keys.indexOf(h.to.public) < 0) keys.push(h.to.public);
            }
          }
        }
      }
    } catch {}
  }
  return keys;
}

function createFolderProgram(opts) {
  const team = opts.team;
  const folder = opts.folder;
  const mirror = opts.mirror;
  let pin = typeof opts.pin === "function" ? opts.pin() : opts.pin;
  const io = opts.io || defaultIO;
  const logger = typeof opts.logger === "function" ? opts.logger : (msg) => console.log(msg);
  const onStatus = typeof opts.onStatus === "function" ? opts.onStatus : () => {};
  const onChange = typeof opts.onChange === "function" ? opts.onChange : () => {};

  const checks = (opts && opts.checks) || {};
  const teamWhole = typeof checks.teamWhole === "function" ? checks.teamWhole : () => false;
  const openSealed = typeof checks.openSealed === "function" ? checks.openSealed : () => null;
  const catalogSigValid = typeof checks.catalogSigValid === "function" ? checks.catalogSigValid : () => false;
  const branchSignedBytes = typeof checks.branchSignedBytes === "function" ? checks.branchSignedBytes : () => Buffer.alloc(0);
  const deskFileGenuine = typeof checks.deskFileGenuine === "function" ? checks.deskFileGenuine : () => false;
  const handedTo = typeof checks.handedTo === "function" ? checks.handedTo : () => false;
  const handedPath = typeof checks.handedPath === "function" ? checks.handedPath : (doc, from) => [from];
  const forkSeen = typeof checks.forkSeen === "function" ? checks.forkSeen : () => null;
  const followed = []; // the leads this program moved its pin on from, oldest first
  /* The pin moves to a team file's lead along its handovers, each key passed through kept for the fork rule. */
  function follow(doc) {
    for (const k of handedPath(doc, pin)) if (!followed.some(f => f.public === k.public)) followed.push({ keyId: k.keyId, public: k.public });
    setPin({ keyId: doc.lead.keyId, public: doc.lead.public });
  }
  const leadsNow = () => (pin ? followed.filter(k => k.public !== pin.public).concat([{ keyId: pin.keyId, public: pin.public }]) : []);
  /* The lead key this program checks against, from the desk or along a handover. A new one clears every refusal judged under
     the one before, so those files are copied and judged again. True where the pin changed. */
  function setPin(next) {
    if (typeof next === "function") next = next();
    const to = next && next.public ? { keyId: next.keyId, public: next.public } : null;
    if ((!pin && !to) || (pin && to && pin.public === to.public && pin.keyId === to.keyId)) return false;
    pin = to;
    judgedAt++; /* plant:syncer-pin-forgets */
    return true;
  }

  let mirrorEpoch = 0;
  let mirrorRev = -1;
  let pending = []; // [{ kind, relPath, epoch, tmpPath, text, doc, size, mtimeMs }]
  const missingCount = new Map(); // relPath -> number of consecutive answered listings missing
  const knownMtimes = new Map(); // relPath -> { size, mtimeMs }
  const refusedMtimes = new Map(); // relPath -> { size, mtimeMs, at, epoch, key }
  let judgedAt = 0; // moves with what a refusal is judged against: the pin, the team file and the ring
  const dropped = new Set(); // refusals let go since the worker was last told, so it copies those files again
  /* A refused or parked copy is held: not copied from the share again while its size and mtime stay, and, for a refusal, while
     the pin, the team file, the ring and the key for its epoch stay as they were when it was judged. The mirror's own copy is
     never removed for it. The hold lives in memory, so "copied once" holds within one run: after a restart a held or parked
     file is copied once more, and a parked file waiting for its key is read again from the share (the test architect, 18:47). */
  function refuse(item, epoch) {
    if (!item || item.size == null) return;
    const ep = Number.isInteger(epoch) ? epoch : null;
    refusedMtimes.set(item.relPath, { size: item.size, mtimeMs: item.mtimeMs, at: judgedAt, epoch: ep, key: keyMark(ep) });
  }
  function keyMark(epoch) {
    if (epoch === null) return "";
    const k = typeof keyFor === "function" ? keyFor(epoch) : null;
    return k ? sha256hex(k) : "none";
  }
  function heldNow() {
    const out = [];
    for (const [rel, r] of Array.from(refusedMtimes.entries())) {
      if (r.at === judgedAt && r.key === keyMark(r.epoch)) { out.push({ rel, size: r.size, mtimeMs: r.mtimeMs }); continue; }
      refusedMtimes.delete(rel);
      knownMtimes.delete(rel);
      dropped.add(rel);
    }
    for (const p of pending) {
      if (p.size != null && !out.some(o => o.rel === p.relPath)) out.push({ rel: p.relPath, size: p.size, mtimeMs: p.mtimeMs }); /* plant:syncer-pending-held */
    }
    return out;
  }
  /* What the worker holds back from copying, and the paths whose refusals were let go since it was last told. */
  function held() {
    const list = heldNow();
    const forget = Array.from(dropped);
    dropped.clear();
    return { held: list, forget };
  }

  const fallbackKeys = new Map();
  if (opts.keys) {
    Object.keys(opts.keys).forEach(e => {
      const ep = parseInt(e, 10);
      let v = opts.keys[e];
      if (typeof v === "string") {
        if (/^[0-9a-f]{64}$/i.test(v)) v = Buffer.from(v, "hex");
        else {
          try { v = Buffer.from(v, "base64"); } catch {}
        }
      }
      if (Buffer.isBuffer(v) && v.length === 32) fallbackKeys.set(ep, v);
    });
  }

  const keyFor = typeof opts.keyFor === "function" ? opts.keyFor : (opts.keys ? (ep => fallbackKeys.get(ep) || null) : () => null); /* plant:syncer-live-key */

  // Sweep .staging and .pending directories at startup
  const stagingDir = path.join(mirror, ".staging");
  const pendingDir = path.join(mirror, ".pending");
  try {
    if (io.exists(stagingDir)) {
      const entries = io.readdir(stagingDir);
      for (const name of entries) {
        if (name.endsWith(".tmp")) {
          try { io.unlink(path.join(stagingDir, name)); /* plant:syncer-staging-sweep */ } catch {}
        }
      }
    }
    if (io.exists(pendingDir)) {
      const entries = io.readdir(pendingDir);
      for (const name of entries) {
        try { io.unlink(path.join(pendingDir, name)); } catch {}
      }
    }
  } catch {}

  // Read initial mirror state if present
  try {
    const mirrorTeamPath = path.join(mirror, "etiuda-team.json");
    if (io.exists(mirrorTeamPath)) {
      const tDoc = JSON.parse(io.readFile(mirrorTeamPath, "utf8"));
      if (tDoc && Number.isInteger(tDoc.epoch)) {
        mirrorEpoch = tDoc.epoch;
        mirrorRev = teamRevOf(tDoc) || 0;
      }
    }
  } catch {}

  /* ---- the outbox and the floors, read afresh at each use: the main thread may note a debt with noteOwed between scans */
  const saidWait = new Map(); // relPath -> the code last said for it
  function owe(rel) { return noteOwed(mirror, rel, io); }
  function owed() { return owedList(mirror, io); }
  function isOwed(rel) { return owedAt(mirror, rel, io); }
  function landed(results) {
    if (!Array.isArray(results) || !results.length) return;
    const st = readOutbox(mirror, io);
    let changed = false;
    for (const r of results) {
      const rec = r && st.owe[r.rel];
      if (!rec) continue;
      if (r.ok) {
        if (!!rec.del !== !!r.del || (!rec.del && rec.sha !== r.sha)) continue;
        delete st.owe[r.rel];
        changed = true;
        if (saidWait.has(r.rel)) { saidWait.delete(r.rel); logger("etiuda: " + r.rel + " has reached the team's folder " + folder); }
        if (!r.del && r.size != null) knownMtimes.set(r.rel, { size: r.size, mtimeMs: r.mtimeMs });
      } else if (rec.code !== r.code) {
        rec.code = r.code;
        changed = true;
        if (saidWait.get(r.rel) !== r.code) {
          saidWait.set(r.rel, r.code);
          logger("etiuda: " + r.rel + " is kept on this computer until the team's folder " + folder + " takes it (" + r.code + "), and is tried again");
        }
      }
    }
    if (changed) { try { writeOutbox(mirror, st, io); } catch {} }
  }
  /* A desk's catalog answer sealed to the lead's box for this team: judged by its place and its envelope alone, never opened. */
  function leadAnswerAt(relPath, doc) {
    const parts = normRel(relPath).split("/");
    let ok = parts.length === 3 && parts[0] === "desks" && /^k-[0-9a-f]{16}$/.test(parts[1]) && parts[2] === "catalog-answer.ec";
    ok = ok && !!doc && +doc.format === 1 && doc.kind === "etiuda-answer-sealed" && doc.team === team; /* plant:s0-syncer-lead */
    /* The envelope's shape as openAnswerLead reads it, so a stub never takes the place of an answer still to be read. */
    ok = ok && typeof doc.keyId === "string" && !!doc.keyId && /^[0-9a-f]{64}$/.test(String(doc.enc)) && /^(?:[0-9a-f]{2}){16,}$/.test(String(doc.ct)); /* plant:s0-syncer-shape */
    return ok;
  }
  /* The catalog a staged or mirrored .ec holds, opened where sealed, or null. */
  function catalogIn(text) {
    let doc = null;
    try { doc = JSON.parse(text); } catch { return null; }
    if (doc && doc.kind === "etiuda-sealed") {
      const key = typeof keyFor === "function" ? keyFor(doc.epoch) : null;
      const inner = key ? openSealed(key, doc) : null;
      try { return inner ? JSON.parse(inner) : null; } catch { return null; }
    }
    return doc && typeof doc === "object" ? doc : null;
  }
  /* (scope, id) at its path and the number that may only rise there: a root edition's rev under its signer, a desk file's
     rev, in-use's n. Per path, so an older edition the folder keeps under a name of its own still reaches the mirror. */
  function floorKeyOf(relPath, cat) {
    if (!cat || typeof cat !== "object") return null;
    const parts = normRel(relPath).split("/");
    if (parts[0] === "desks" && parts.length === 3) {
      if (parts[2] === "in-use.ec") return Number.isSafeInteger(cat.n) ? { key: "u|" + parts[1], val: cat.n } : null;
      if (parts[2] === "catalog-answer.ec" || typeof cat.id !== "string") return null;
      return { key: "d|" + parts[1] + "|" + cat.id + "|" + parts[2], val: Number.isSafeInteger(+cat.rev) ? +cat.rev : 0 };
    }
    if (parts.length === 1 && cat.kind === "etiuda-catalog" && typeof cat.id === "string") {
      const signer = cat.sig && typeof cat.sig.keyId === "string" ? cat.sig.keyId : "-";
      return { key: "r|" + signer + "|" + cat.id + "|" + parts[0], val: Number.isSafeInteger(+cat.rev) ? +cat.rev : 0 };
    }
    return null;
  }
  let floorsDirty = null;
  /* True where the copy may land: its number is at or above the floor kept for its (scope, id) and the copy the mirror holds. */
  function floorHolds(item, cat) {
    const k = floorKeyOf(item.relPath, cat);
    if (!k) return true;
    const st = floorsDirty || readOutbox(mirror, io);
    let floor = Number.isSafeInteger(st.floors[k.key]) ? st.floors[k.key] : null;
    try {
      const target = path.join(mirror, item.relPath);
      if (io.exists(target)) {
        const cur = floorKeyOf(item.relPath, catalogIn(io.readFile(target, "utf8")));
        if (cur && cur.key === k.key && (floor === null || cur.val > floor)) floor = cur.val;
      }
    } catch {}
    let below = false;
    if (floor !== null && k.val < floor) below = true; /* plant:edition-floor */
    if (below) {
      logger("etiuda: " + path.join(folder, item.relPath) + " is an older copy (" + k.val + ", below " + floor + ") than this desk holds, so nothing in it is used");
      refuse(item);
      try { io.unlink(item.tmpPath); } catch {}
      return false;
    }
    if (floor === null || k.val > floor) {
      floorsDirty = floorsDirty || st;
      floorsDirty.floors[k.key] = k.val;
    }
    return true;
  }

  function pushPending(item) {
    const existingIdx = pending.findIndex(p => p.relPath === item.relPath);
    if (existingIdx >= 0) {
      const old = pending[existingIdx];
      if (old.tmpPath && old.tmpPath !== item.tmpPath) {
        try { io.unlink(old.tmpPath); /* plant:syncer-pending-reuse */ } catch {}
      }
      pending[existingIdx] = item;
    } else {
      while (pending.length >= PENDING_MAX) {
        const evicted = pending.shift();
        if (evicted && evicted.tmpPath) {
          try { io.unlink(evicted.tmpPath); } catch {}
        }
        if (evicted && evicted.relPath) {
          try { io.unlink(path.join(pendingDir, evicted.relPath)); } catch {}
        }
      }
      pending.push(item);
    }
    if (item.kind === "ec" && item.relPath && (item.text || item.tmpPath)) {
      try {
        const dest = path.join(pendingDir, item.relPath);
        ensureDir(dest, io);
        const data = item.text || io.readFile(item.tmpPath, "utf8");
        io.writeFile(dest, data);
      } catch {}
    }
  }

  function walkFolder(baseDir, sub = "") {
    const out = new Map();
    const current = path.join(baseDir, sub);
    let entries = [];
    if (sub === "") {
      entries = io.readdir(current);
    } else {
      try {
        entries = io.readdir(current);
      } catch {
        return out;
      }
    }
    for (const name of entries) {
      if (name.startsWith(".") || name.endsWith(".tmp")) continue;
      const rel = sub ? path.join(sub, name).replace(/\\/g, "/") : name;
      const full = path.join(baseDir, rel);
      let st = null;
      try {
        st = io.stat(full);
      } catch {
        continue;
      }
      if (st.isDirectory && st.isDirectory()) {
        if (sub === "" && (name === "desks" || name === "invites" || name === "catalog-asks")) {
          const inner = walkFolder(baseDir, name);
          for (const [k, v] of inner.entries()) out.set(k, v);
        } else if (sub === "desks") {
          const inner = walkFolder(baseDir, path.join(sub, name));
          for (const [k, v] of inner.entries()) out.set(k, v);
        }
      } else {
        if (isAllowedPath(rel)) {
          out.set(rel, { size: st.size, mtimeMs: st.mtimeMs || 0 });
        }
      }
    }
    return out;
  }

  function walkMirror() {
    const out = new Set();
    function scan(sub = "") {
      const current = path.join(mirror, sub);
      let entries = [];
      try { entries = io.readdir(current); } catch { return; }
      for (const name of entries) {
        if (name.startsWith(".") || name.endsWith(".tmp")) continue;
        const rel = sub ? path.join(sub, name).replace(/\\/g, "/") : name;
        const full = path.join(mirror, rel);
        let st = null;
        try { st = io.stat(full); } catch { continue; }
        if (st.isDirectory && st.isDirectory()) {
          scan(rel);
        } else {
          out.add(rel);
        }
      }
    }
    scan();
    return out;
  }

  function applyScan(scanData) {
    if (!scanData || !scanData.answers) {
      onStatus({ folder, answers: false });
      return { answers: false, applied: [] };
    }
    onStatus({ folder, answers: true });

    const applied = [];
    floorsDirty = null;
    const listing = scanData.listing || [];
    let staged = scanData.staged || [];

    /* The team file and its conflict siblings staged together are one look: the desk says a lead key shown in two hands
       there (checks.forkSeen), and where the pin is handed to two keys none of them is taken, each read again at the next scan. */
    const teamItems = staged.filter(s => s.relPath === "etiuda-team.json" || isTeamConflict(s.relPath));
    if (pin && teamItems.length) {
      const docs = [];
      for (const s of teamItems) {
        try { const d = JSON.parse(io.readFile(s.tmpPath, "utf8")); if (d && teamWhole(d) && d.id === team) docs.push(d); } catch {}
      }
      const fork = docs.length ? forkSeen(docs, team, leadsNow()) : null;
      let neither = false;
      neither = !!fork && fork.kind === "two"; /* plant:syncer-fork-two */
      if (neither) {
        for (const s of teamItems) {
          knownMtimes.delete(s.relPath);
          try { io.unlink(s.tmpPath); } catch {}
        }
        staged = staged.filter(s => teamItems.indexOf(s) < 0);
      }
    }

    // Step 1: Team file check
    const teamStaged = staged.filter(s => s.relPath === "etiuda-team.json")[0];
    if (teamStaged) {
      let text = null;
      try { text = io.readFile(teamStaged.tmpPath, "utf8"); } catch {}
      if (text) {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        if (doc && teamWhole(doc) && doc.id === team) {
          let pinOk = true;
          const leadMatch = pin && doc.lead && doc.lead.public === pin.public && doc.lead.keyId === pin.keyId;
          let handedMatch = false;
          if (pin && doc.lead && handedTo(doc, pin)) {
            handedMatch = true; /* plant:syncer-team-handover */
            follow(doc);
          }
          if (pin && !leadMatch && !handedMatch) pinOk = false; /* plant:syncer-team-pin */
          if (pinOk) {
            const revVal = teamRevOf(doc);
            const channelVal = teamChannelOf(doc);
            if (revVal === null || channelVal === null) {
              const used = path.join(folder, "etiuda-team.json");
              logger("etiuda: " + used + " names a rev or a channel this desk does not read, so nothing in it is used");
              refuse(teamStaged);
              try { io.unlink(teamStaged.tmpPath); } catch {}
            } else {
              const rev = revVal || 0;
              const floor = typeof opts.floor === "function" ? opts.floor(team, doc.lead && doc.lead.public) : opts.floor;
              let olderEpoch = false, olderRevAtEpoch = false;
              let compEpoch = mirrorEpoch, compRev = mirrorRev;
              if (floor) {
                compEpoch = floor.epoch;
                compRev = floor.rev;
                olderEpoch = doc.epoch < compEpoch;
                olderRevAtEpoch = doc.epoch === compEpoch && rev < compRev;
              } else if (floor === null) {
                olderEpoch = false;
                olderRevAtEpoch = false;
              } else {
                olderEpoch = doc.epoch < mirrorEpoch;
                olderRevAtEpoch = doc.epoch === mirrorEpoch && rev < mirrorRev;
              }
              let revOk = true;
              if (olderEpoch || olderRevAtEpoch) revOk = false; /* plant:syncer-team-rev */
              if (revOk) {
                const mirrorTeamPath = path.join(mirror, "etiuda-team.json");
                ensureDir(mirrorTeamPath, io);
                io.rename(teamStaged.tmpPath, mirrorTeamPath); /* plant:syncer-team-atomic */
                applied.push("etiuda-team.json");
                judgedAt++;
                refusedMtimes.delete(teamStaged.relPath);
                mirrorEpoch = doc.epoch;
                mirrorRev = rev;
              } else {
                const why = olderEpoch
                  ? "key number " + doc.epoch + ", below " + compEpoch
                  : "rev " + rev + ", below " + compRev + " at key number " + doc.epoch;
                const used = path.join(folder, "etiuda-team.json");
                logger("etiuda: " + used + " is an older file of team " + doc.id + " than one this desk has heeded (" + why + "), so nothing in it is used");
                refuse(teamStaged);
                try { io.unlink(teamStaged.tmpPath); } catch {}
              }
            }
          } else {
            const used = path.join(folder, "etiuda-team.json");
            logger("etiuda: " + used + " is signed by a key other than the lead's this desk trusts for team " + doc.id + ", so nothing in it is used");
            refuse(teamStaged);
            try { io.unlink(teamStaged.tmpPath); } catch {}
          }
        } else if (doc && !teamWhole(doc)) {
          const used = path.join(folder, "etiuda-team.json");
          logger("etiuda: " + used + " is not a team file whole under its lead's key, so nothing in it is used");
          refuse(teamStaged);
          try { io.unlink(teamStaged.tmpPath); } catch {}
        } else {
          refuse(teamStaged);
          try { io.unlink(teamStaged.tmpPath); } catch {}
        }
      } else {
        refuse(teamStaged);
        try { io.unlink(teamStaged.tmpPath); } catch {}
      }
    }

    // Step 1b: Conflict siblings of team file
    const teamSiblingsStaged = staged.filter(s => isTeamConflict(s.relPath));
    for (const sibItem of teamSiblingsStaged) {
      let text = null;
      try { text = io.readFile(sibItem.tmpPath, "utf8"); } catch {}
      if (text) {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        if (doc && teamWhole(doc) && doc.id === team) {
          let pinOk = true;
          const leadMatch = pin && doc.lead && doc.lead.public === pin.public && doc.lead.keyId === pin.keyId;
          let handedMatch = false;
          if (pin && doc.lead && handedTo(doc, pin)) {
            handedMatch = true;
            follow(doc);
          }
          if (pin && !leadMatch && !handedMatch) pinOk = false;
          if (pinOk) {
            const rev = teamRevOf(doc) || 0;
            const olderEpoch = doc.epoch < mirrorEpoch;
            const olderRevAtEpoch = doc.epoch === mirrorEpoch && rev < mirrorRev;
            if (!olderEpoch && !olderRevAtEpoch) {
              const target = path.join(mirror, sibItem.relPath);
              ensureDir(target, io);
              io.rename(sibItem.tmpPath, target);
              applied.push(sibItem.relPath);
              judgedAt++;
              if (doc.epoch > mirrorEpoch) {
                mirrorEpoch = doc.epoch;
                mirrorRev = rev;
              } else if (doc.epoch === mirrorEpoch && rev > mirrorRev) {
                mirrorRev = rev;
              }
            } else {
              try { io.unlink(sibItem.tmpPath); } catch {}
            }
          } else {
            try { io.unlink(sibItem.tmpPath); } catch {}
          }
        } else {
          try { io.unlink(sibItem.tmpPath); } catch {}
        }
      } else {
        try { io.unlink(sibItem.tmpPath); } catch {}
      }
    }

    function drainPending() {
      const stillPending = [];
      for (const item of pending) {
        if (isOwed(item.relPath)) {
          if (item.tmpPath) { try { io.unlink(item.tmpPath); } catch {} }
          try { io.unlink(path.join(pendingDir, item.relPath)); } catch {}
          continue;
        }
        if (item.kind === "head") {
          let allEditionsPresent = true;
          if (item.doc && Array.isArray(item.doc.editions)) {
            for (const ed of item.doc.editions) {
              if (ed && ed.catalog && !mirrorHasCatalog(mirror, ed.catalog, io, keyFor, openSealed)) {
                allEditionsPresent = false;
                break;
              }
            }
          }
          if (allEditionsPresent) {
            const target = path.join(mirror, item.relPath);
            ensureDir(target, io);
            if (item.tmpPath && io.exists(item.tmpPath)) {
              io.rename(item.tmpPath, target);
            }
            applied.push(item.relPath);
          } else {
            stillPending.push(item);
          }
          continue;
        }

        // Default: sealed .ec file waiting for epoch / live key
        const key = typeof keyFor === "function" ? keyFor(item.epoch) : null;
        if (item.epoch <= mirrorEpoch && key) {
          let genuine = false, judged = null;
          try {
            const text = item.text || (item.tmpPath ? io.readFile(item.tmpPath, "utf8") : null);
            if (text) {
              const parsed = JSON.parse(text);
              if (parsed.kind === "etiuda-sealed") {
                const decrypted = openSealed(key, parsed);
                if (decrypted) {
                  const cat = JSON.parse(decrypted);
                  judged = cat;
                  const parts = item.relPath.replace(/\\/g, "/").split("/");
                  if (parts[0] === "desks" && parts.length === 3) {
                    const deskFolder = parts[1];
                    if (parts[2] === "in-use.ec") {
                      if (cat.kind === "etiuda-in-use" && deskFileGenuine(cat, deskFolder)) genuine = true;
                    } else if (parts[2] === "catalog-answer.ec") {
                      if (+cat.format === 1 && cat.kind === "etiuda-catalog-answer" && typeof cat.sha256 === "string" && cat.catalog) genuine = true;
                    } else {
                      if (deskFileGenuine(cat, deskFolder)) genuine = true;
                    }
                  } else if (cat && cat.kind === "etiuda-catalog") {
                    const authKeys = teamAuthorizedKeys(folder, mirror, io, pin, opts.authorizedKeys);
                    if (authKeys.some(pub => catalogSigValid(cat, pub))) {
                      genuine = true;
                    }
                  }
                }
              }
            }
          } catch {}

          if (genuine && !floorHolds(item, judged)) {
            try { io.unlink(path.join(pendingDir, item.relPath)); } catch {}
          } else if (genuine) {
            const target = path.join(mirror, item.relPath);
            ensureDir(target, io);
            if (item.tmpPath && io.exists(item.tmpPath)) {
              io.rename(item.tmpPath, target);
            } else if (item.text) {
              io.writeFile(target, item.text);
            }
            try { io.unlink(path.join(pendingDir, item.relPath)); } catch {}
            applied.push(item.relPath);
          } else {
            if (item.tmpPath) { try { io.unlink(item.tmpPath); } catch {} }
            try { io.unlink(path.join(pendingDir, item.relPath)); } catch {}
            refuse(item, item.epoch);
          }
        } else {
          stillPending.push(item);
        }
      }
      pending = stillPending;
    }

    // Step 2: Pending queue re-evaluation
    drainPending();

    // Step 3: Process remaining staged files
    for (const item of staged) {
      const relPath = item.relPath;
      if (relPath === "etiuda-team.json" || isTeamConflict(relPath)) continue;
      const tmpPath = item.tmpPath;
      let mayLand = true;
      if (isOwed(relPath)) mayLand = false; /* plant:outbox-owe-keep */
      if (!mayLand) {
        try { io.unlink(tmpPath); } catch {}
        continue;
      }
      let text = null;
      try { text = io.readFile(tmpPath, "utf8"); } catch {
        try { io.unlink(tmpPath); } catch {}
        continue;
      }

      if (relPath.endsWith(".ec")) {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        if (doc && doc.kind === "etiuda-sealed") {
          const key = typeof keyFor === "function" ? keyFor(doc.epoch) : null;
          let waitPending = false;
          if (doc.epoch > mirrorEpoch || !key) waitPending = true; /* plant:syncer-epoch-pending */
          if (waitPending) {
            pushPending({ kind: "ec", relPath, epoch: doc.epoch, tmpPath, text, size: item.size, mtimeMs: item.mtimeMs });
          } else {
            const decrypted = openSealed(key, doc);
            let genuine = false, cat = null;
            if (decrypted) {
              try { cat = JSON.parse(decrypted); } catch {}
              if (cat) {
                const parts = relPath.replace(/\\/g, "/").split("/");
                if (parts[0] === "desks" && parts.length === 3) {
                  const deskFolder = parts[1];
                  if (parts[2] === "in-use.ec") {
                    if (cat.kind === "etiuda-in-use" && deskFileGenuine(cat, deskFolder)) genuine = true;
                  } else if (parts[2] === "catalog-answer.ec") {
                    if (+cat.format === 1 && cat.kind === "etiuda-catalog-answer" && typeof cat.sha256 === "string" && cat.catalog) genuine = true;
                  } else {
                    if (deskFileGenuine(cat, deskFolder)) genuine = true;
                  }
                } else if (cat.kind === "etiuda-catalog") {
                  const authKeys = teamAuthorizedKeys(folder, mirror, io, pin, opts.authorizedKeys);
                  if (authKeys.some(pub => catalogSigValid(cat, pub))) {
                    genuine = true;
                  }
                }
              }
            }
            let sigOk = true;
            if (!genuine) sigOk = false; /* plant:syncer-edition-sig */
            if (!sigOk) {
              try { io.unlink(tmpPath); } catch {}
              refuse(item, doc.epoch); /* plant:syncer-refused-held */
              continue;
            }
            if (!floorHolds(item, cat)) continue;
            const target = path.join(mirror, relPath);
            ensureDir(target, io);
            io.rename(tmpPath, target);
            applied.push(relPath);
          }
        } else if (doc && +doc.format === 2 && doc.kind === "etiuda-catalog") {
          const parts = relPath.replace(/\\/g, "/").split("/");
          if (parts[0] === "desks" && parts.length === 3) {
            const deskFolder = parts[1];
            if (!deskFileGenuine(doc, deskFolder)) {
              try { io.unlink(tmpPath); } catch {}
              refuse(item);
              continue;
            }
            if (!floorHolds(item, doc)) continue;
            const target = path.join(mirror, relPath);
            ensureDir(target, io);
            io.rename(tmpPath, target);
            applied.push(relPath);
          } else if (parts.length === 1 && doc.desk && deskFileGenuine(doc, doc.desk.id)) {
            if (!floorHolds(item, doc)) continue;
            const target = path.join(mirror, relPath);
            ensureDir(target, io);
            io.rename(tmpPath, target);
            applied.push(relPath);
          } else {
            // Unsigned shared catalog (no doc.sig) or signed catalog
            const authKeys = teamAuthorizedKeys(folder, mirror, io, pin, opts.authorizedKeys);
            if (doc.sig && !authKeys.some(pub => catalogSigValid(doc, pub))) {
              try { io.unlink(tmpPath); } catch {}
              refuse(item);
              continue;
            }
            if (!floorHolds(item, doc)) continue;
            const target = path.join(mirror, relPath);
            ensureDir(target, io);
            io.rename(tmpPath, target);
            applied.push(relPath);
          }
        } else if (leadAnswerAt(relPath, doc)) {
          /* Sealed to the lead's box, so no desk opens it: it lands unread, as stats.estat does. */
          const target = path.join(mirror, relPath);
          ensureDir(target, io);
          io.rename(tmpPath, target);
          applied.push(relPath);
        } else {
          // Invalid or corrupt .ec file: drop copy
          try { io.unlink(tmpPath); } catch {}
          refuse(item);
          continue;
        }
      } else if (relPath === "etiuda-head.json") {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        if (doc && headGenuine(doc, pin)) {
          let waitEditions = false;
          if (doc.editions && Array.isArray(doc.editions)) {
            for (const ed of doc.editions) {
              if (ed && ed.catalog && !mirrorHasCatalog(mirror, ed.catalog, io, keyFor, openSealed)) {
                waitEditions = true; /* plant:syncer-head-wait */
                break;
              }
            }
          }
          if (waitEditions) {
            pushPending({ kind: "head", relPath, doc, tmpPath, size: item.size, mtimeMs: item.mtimeMs });
          } else {
            const target = path.join(mirror, relPath);
            ensureDir(target, io);
            io.rename(tmpPath, target);
            applied.push(relPath);
          }
        } else {
          try { io.unlink(tmpPath); } catch {}
          refuse(item);
          const target = path.join(mirror, relPath);
          if (io.exists(target)) {
            try { io.unlink(target); } catch {}
            applied.push(relPath);
          }
        }
      } else if (/^etiuda-ring.*\.json$/i.test(relPath)) {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        if (doc && +doc.format === 1 && doc.kind === "etiuda-ring" && Array.isArray(doc.keys)) {
          const target = path.join(mirror, relPath);
          ensureDir(target, io);
          io.rename(tmpPath, target);
          applied.push(relPath);
          judgedAt++;
        } else {
          try { io.unlink(tmpPath); } catch {}
        }
      } else if (/^etiuda-team-pause.*\.json$/i.test(relPath)) {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        if (doc && +doc.format === 1 && doc.kind === "etiuda-team-pause" && doc.team === team && typeof doc.paused === "boolean") {
          const target = path.join(mirror, relPath);
          ensureDir(target, io);
          io.rename(tmpPath, target);
          applied.push(relPath);
        } else {
          try { io.unlink(tmpPath); } catch {}
        }
      } else if (/^etiuda-team-joins.*\.json$/i.test(relPath)) {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        if (doc && +doc.format === 1 && doc.kind === "etiuda-team-joins" && doc.team === team && doc.lead && Array.isArray(doc.open)) {
          const target = path.join(mirror, relPath);
          ensureDir(target, io);
          io.rename(tmpPath, target);
          applied.push(relPath);
        } else {
          try { io.unlink(tmpPath); } catch {}
        }
      } else if (/^stats-span.*\.json$/i.test(relPath)) {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        if (doc && +doc.format === 1 && doc.kind === "etiuda-stats-span" && (typeof doc.span === "string" || Array.isArray(doc.spans))) {
          const target = path.join(mirror, relPath);
          ensureDir(target, io);
          io.rename(tmpPath, target);
          applied.push(relPath);
        } else {
          try { io.unlink(tmpPath); } catch {}
        }
      } else if (relPath.startsWith("invites/")) {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        let ok = false;
        if (relPath.endsWith(".wrap.json")) {
          if (doc && typeof doc === "object" && !Array.isArray(doc) && typeof doc.epoch === "number" && typeof doc.ct === "string") ok = true;
        } else if (relPath.endsWith(".refused.json")) {
          if (doc && +doc.format === 1 && doc.kind === "etiuda-invite-refused" && doc.team === team) ok = true;
        }
        if (ok) {
          const target = path.join(mirror, relPath);
          ensureDir(target, io);
          io.rename(tmpPath, target);
          applied.push(relPath);
        } else {
          try { io.unlink(tmpPath); } catch {}
        }
      } else if (relPath.startsWith("catalog-asks/") && relPath.endsWith(".json")) {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        let kindOk = doc && doc.kind === "etiuda-catalog-ask";
        if (doc && doc.kind === "etiuda-catalog-ask-withdrawn") kindOk = true; /* plant:syncer-ask-withdrawn */
        /* An ask of format 2 is one made under the lead's switch (shell/main.js ASK_CONTENT_FORMAT); a withdrawal stays format 1. */
        const formatOk = !!doc && (+doc.format === 1 || (+doc.format === 2 && doc.kind === "etiuda-catalog-ask"));
        if (formatOk && kindOk) {
          const target = path.join(mirror, relPath);
          ensureDir(target, io);
          io.rename(tmpPath, target);
          applied.push(relPath);
        } else {
          try { io.unlink(tmpPath); } catch {}
        }
      } else if (relPath.startsWith("desks/")) {
        const parts = relPath.replace(/\\/g, "/").split("/");
        if (parts.length === 3) {
          const deskId = parts[1];
          const fileName = parts[2];
          let ok = false;
          let doc = null;
          try { doc = JSON.parse(text); } catch {}
          if (fileName === "join.json") {
            if (doc && joinGenuine(doc, deskId)) ok = true;
          } else if (fileName === "stats.estat") {
            if (doc && +doc.format === 1 && doc.kind === "etiuda-stats-sealed" && doc.team === team) ok = true;
          }
          if (ok) {
            const target = path.join(mirror, relPath);
            ensureDir(target, io);
            io.rename(tmpPath, target);
            applied.push(relPath);
          } else {
            try { io.unlink(tmpPath); } catch {}
          }
        } else {
          try { io.unlink(tmpPath); } catch {}
        }
      } else {
        // Drop #1: non-allowlisted / non-Etiuda files are discarded
        try { io.unlink(tmpPath); } catch {}
      }
    }

    // Drain pending again in case editions landed in Step 3
    drainPending();

    // Step 4: Removals (only after 2 answered listings absent)
    const currentMirrorFiles = walkMirror();
    const listingMap = new Set(listing.map(entry => Array.isArray(entry) ? entry[0] : entry.relPath || entry));
    for (const relPath of currentMirrorFiles) {
      let stays = listingMap.has(relPath);
      if (isOwed(relPath)) stays = true; /* plant:outbox-owe-stay */
      if (stays) {
        missingCount.delete(relPath);
      } else {
        const count = (missingCount.get(relPath) || 0) + 1;
        missingCount.set(relPath, count);
        let eligibleForRemoval = true;
        if (count < 2) eligibleForRemoval = false; /* plant:syncer-two-absent-remove */
        if (eligibleForRemoval) {
          try { io.unlink(path.join(mirror, relPath)); /* plant:syncer-unlink */ } catch {}
          missingCount.delete(relPath);
          applied.push(relPath);
        }
      }
    }

    if (floorsDirty) {
      const st = readOutbox(mirror, io);
      for (const k of Object.keys(floorsDirty.floors)) {
        if (!Number.isSafeInteger(st.floors[k]) || floorsDirty.floors[k] > st.floors[k]) st.floors[k] = floorsDirty.floors[k];
      }
      try { writeOutbox(mirror, st, io); } catch {}
      floorsDirty = null;
    }
    /* The mark that this mirror has taken one answered listing: until then a desk under machine policy reads its folder. */
    let primed = false;
    try {
      if (!io.exists(path.join(mirror, PRIMED_NAME))) { io.writeFile(path.join(mirror, PRIMED_NAME), ""); primed = true; }
    } catch {}
    if (applied.length > 0 || primed) {
      onChange(primed ? { team, applied, primed: true } : { team, applied });
    }
    return { answers: true, applied };
  }

  function syncOnce() {
    if (typeof opts.pin === "function") setPin(opts.pin());
    const owing = owed();
    if (owing.length) landed(flushOwed(folder, mirror, owing, io));
    const stillOwed = new Set(owed().map(x => x.rel));
    let foundFiles = null;
    try {
      foundFiles = walkFolder(folder);
      if (!io.exists(folder)) throw new Error("listing failed");
    } catch (e) {
      return applyScan({ answers: false, listing: [], staged: [] });
    }

    const stagingDir = path.join(mirror, ".staging");
    try { io.mkdir(stagingDir); } catch {}

    const staged = [];
    const holds = new Map(heldNow().map(h => [h.rel, h]));
    for (const [relPath, st] of foundFiles.entries()) {
      if (stillOwed.has(relPath)) continue;
      const mirrorFile = path.join(mirror, relPath);
      let alreadyInMirror = false;
      const prev = knownMtimes.get(relPath);
      const hold = holds.get(relPath);
      if (hold && hold.size === st.size && hold.mtimeMs === st.mtimeMs) alreadyInMirror = true;
      else if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs && io.exists(mirrorFile)) alreadyInMirror = true;

      if (!alreadyInMirror) {
        const srcFile = path.join(folder, relPath);
        const rand = crypto.randomBytes(8).toString("hex");
        const tmpFile = path.join(stagingDir, rand + ".tmp");
        try {
          const data = io.readFile(srcFile);
          io.writeFile(tmpFile, data);
          staged.push({ relPath, tmpPath: tmpFile, size: st.size, mtimeMs: st.mtimeMs });
          knownMtimes.set(relPath, { size: st.size, mtimeMs: st.mtimeMs });
        } catch {
          try { io.unlink(tmpFile); } catch {}
        }
      }
    }

    return applyScan({
      answers: true,
      listing: Array.from(foundFiles.entries()),
      staged
    });
  }

  return {
    syncOnce,
    applyScan,
    owe,
    owed,
    isOwed,
    landed,
    setPin,
    held,
    noteShareStat: (rel, st) => { if (st && st.size != null) knownMtimes.set(normRel(rel), { size: st.size, mtimeMs: st.mtimeMs }); },
    state: () => ({ mirrorEpoch, mirrorRev, pendingLength: pending.length, missingCount: new Map(missingCount) })
  };
}

class FolderSyncerController {
  constructor(opts) {
    if (!opts || !opts.checks) throw new Error("Folder syncer created without the desk's checks"); /* plant:syncer-without-checks */
    this.team = opts.team;
    this.folder = opts.folder;
    this.mirror = opts.mirror;
    this.pin = opts.pin;
    this.keyFor = opts.keyFor;
    this.checks = opts.checks;
    this.useWorker = opts.useWorker !== false;
    this.onStatus = opts.onStatus;
    this.onChange = opts.onChange;
    this.onFail = opts.onFail;
    this.pollMs = opts.pollMs || FOLDER_SYNC_CADENCE_MS;
    this.worker = null;
    this.stopped = false;
    this.asked = 0;
    this.waits = new Map();

    // The program runs on the main thread to perform verification and applying
    this.program = createFolderProgram({
      team: this.team,
      folder: this.folder,
      mirror: this.mirror,
      pin: this.pin,
      keyFor: this.keyFor,
      checks: this.checks,
      logger: opts.logger,
      onStatus: this.onStatus,
      onChange: this.onChange
    });
  }

  start() {
    if (this.stopped) return;
    if (this.useWorker) {
      /* Started from its source text, not its path: a packaged desk holds this file inside app.asar, which fs reads,
         and a Worker's own loader need not (Argon's updates review of 2026-11-01, finding 1). The worker needs only
         Node's own modules, and this file's functions, which go in front of its source as `__syncerLib` rather than by a
         require the worker would resolve by path. */
      const workerScript = path.join(__dirname, "syncer-worker.cjs");
      const lib = "\"use strict\";\nconst __syncerLib = (function (module) { const exports = module.exports;\n"
        + fs.readFileSync(path.join(__dirname, "syncer.cjs"), "utf8") + "\nreturn module.exports; })({ exports: {} });\n";
      this.worker = new Worker(lib + fs.readFileSync(workerScript, "utf8"), { eval: true }); /* plant:syncer-worker-source */
      this.worker.on("error", (err) => { if (typeof this.onFail === "function") this.onFail(err); });
      this.worker.on("message", (msg) => {
        if (!msg) return;
        if (msg.type === "status") {
          if (typeof this.onStatus === "function") this.onStatus(msg);
        } else if (msg.type === "scan") {
          this.program.applyScan(msg);
          this.sendHeld();
        } else if (msg.type === "landed") {
          this.program.landed(msg.results);
        } else if (msg.type === "read" || msg.type === "cas") {
          this.answer(msg);
        }
      });
      // D2: only folder and mirror sent to worker; NO keys, NO pin
      this.worker.postMessage({
        type: "init",
        data: {
          folder: this.folder,
          mirror: this.mirror,
          pollMs: this.pollMs
        }
      });
    }
  }

  /* The copies the worker leaves on the share until they change, and the refusals let go since it was last told. */
  sendHeld() {
    if (!this.worker || this.stopped) return;
    const h = this.program.held();
    this.worker.postMessage({ type: "held", held: h.held, forget: h.forget }); /* plant:syncer-held-post */
  }
  /* The lead key the desk trusts now, taken by the running program; files refused under the one before are judged again. */
  setPin(pin) {
    this.pin = pin || null;
    if (this.program.setPin(this.pin)) this.sendHeld();
  }

  /* A write this desk made into the mirror at `rel`, handed to the outbox and sent to the share at once. */
  owe(rel) {
    if (!this.program.owe(rel)) return false;
    if (this.stopped) return true;
    this.kick();
    return true;
  }

  ask(msg, judge) {
    const id = ++this.asked;
    return new Promise(resolve => {
      const timer = setTimeout(() => this.settle(id, msg.type === "read" ? null : { ok: false, busy: true }), SHARE_ASK_MS);
      if (timer.unref) timer.unref();
      this.waits.set(id, { resolve, timer, judge });
      this.worker.postMessage(Object.assign({ id }, msg));
    });
  }
  settle(id, value) {
    const w = this.waits.get(id);
    if (!w) return;
    this.waits.delete(id);
    clearTimeout(w.timer);
    w.resolve(value);
  }
  answer(msg) {
    const w = this.waits.get(msg.id);
    if (msg.type === "read") { this.settle(msg.id, msg.got || null); return; }
    if (msg.held) {
      /* A lock answered after its ask gave up is let go at once. */
      if (!w) { if (this.worker) this.worker.postMessage({ type: "cas-abort", id: msg.id }); return; }
      let verdict = null;
      try { verdict = w.judge(msg.now); } catch { verdict = { result: { ok: false, busy: true } }; }
      if (verdict && typeof verdict.text === "string") this.worker.postMessage({ type: "cas-commit", id: msg.id, text: verdict.text });
      else { this.worker.postMessage({ type: "cas-abort", id: msg.id }); this.settle(msg.id, (verdict && verdict.result) || { ok: false }); }
      return;
    }
    if (msg.done) this.settle(msg.id, msg.result || { ok: false });
  }

  /* The shared catalog `name` as the share holds it now, read off the main thread: {text}, "" for no file, or null. */
  shareRead(name) {
    if (this.stopped) return Promise.resolve(null);
    if (!this.worker) return Promise.resolve(shareReadFile(this.folder, name));
    return this.ask({ type: "read", name: String(name || "") });
  }
  /* The compare and swap against the share: `judge(now)` answers {text} to write, or {result} to let the lock go with. */
  shareSwap(name, sha, create, judge) {
    if (this.stopped) return Promise.resolve({ ok: false, busy: true });
    if (!this.worker) {
      const begun = shareCasBegin(this.folder, name, sha, create);
      if (begun.done) return Promise.resolve(begun.result);
      let verdict = null;
      try { verdict = judge(begun.now); } catch { verdict = null; }
      if (!verdict || typeof verdict.text !== "string") { shareRelease(begun.held); return Promise.resolve((verdict && verdict.result) || { ok: false, busy: true }); }
      const done = shareCasCommit(begun.held, this.mirror, verdict.text);
      if (done.ok) this.program.noteShareStat(begun.held.base, done);
      return Promise.resolve(done);
    }
    return this.ask({ type: "cas", name: String(name || ""), sha: String(sha || ""), create: create === true }, judge);
  }

  kick() {
    if (this.stopped) return;
    if (this.worker) {
      this.worker.postMessage({ type: "kick" });
    } else if (this.program) {
      try { this.program.syncOnce(); } catch {}
    }
  }

  stop() {
    this.stopped = true;
    for (const id of Array.from(this.waits.keys())) this.settle(id, null);
    if (this.worker) {
      try {
        this.worker.postMessage({ type: "stop" });
        this.worker.terminate();
      } catch {}
      this.worker = null;
    }
  }
}

const syncerInstances = new Map();

function startFolderSyncer(opts) {
  const existing = syncerInstances.get(opts.team);
  if (existing) {
    if (existing.folder === opts.folder && !existing.stopped) {
      existing.setPin(opts.pin || null); /* plant:syncer-new-pin */
      existing.kick();
      return existing; /* plant:syncer-singleton */
    }
    existing.stop();
  }
  for (const [t, s] of syncerInstances.entries()) {
    if (t !== opts.team) {
      s.stop(); /* plant:syncer-team-change */
      syncerInstances.delete(t);
    }
  }
  const syncer = new FolderSyncerController(opts);
  syncerInstances.set(opts.team, syncer);
  syncer.start();
  return syncer;
}

function stopAllFolderSyncers() {
  for (const s of syncerInstances.values()) {
    s.stop();
  }
  syncerInstances.clear();
}

function folderMirrorOf(userData, teamId) {
  return path.join(userData, "folder-mirror", String(teamId));
}

module.exports = {
  FOLDER_SYNC_CADENCE_MS,
  conflictSiblingName,
  createFolderProgram,
  FolderSyncerController,
  createSyncer: startFolderSyncer,
  startFolderSyncer,
  stopAllFolderSyncers,
  folderMirrorOf,
  isAllowedPath,
  noteOwed,
  owedAt,
  owedList,
  flushOwed,
  shareReadFile,
  shareCasBegin,
  shareCasCommit,
  shareRelease,
  PRIMED_NAME
};
