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
  return false;
}

function isTeamConflict(rel) {
  const norm = String(rel || "").replace(/\\/g, "/");
  return norm.indexOf("/") < 0 && conflictSiblingName("etiuda-team.json", norm);
}

function teamWhole(doc) {
  const lead = doc && doc.lead, sig = doc && doc.sig;
  try {
    return +doc.format === 1 && doc.kind === "etiuda-team" && SEALED_TEAM_RE.test(String(doc.id)) && Number.isInteger(doc.epoch)
      && doc.epoch >= 1 && Array.isArray(doc.roster) && !!lead && typeof lead === "object" && typeof lead.keyId === "string"
      && /^[0-9a-f]{64}$/.test(String(lead.public)) && (lead.box === undefined || /^[0-9a-f]{64}$/.test(lead.box))
      && !!sig && sig.keyId === lead.keyId && /^[0-9a-f]{128}$/.test(String(sig.value))
      && crypto.verify(null, signedBytesOf(doc), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(lead.public, "hex")]),
        format: "der", type: "spki" }), Buffer.from(sig.value, "hex"));
  } catch { return false; }
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

function sealedAad(team, epoch) {
  return Buffer.from("etiuda-sealed\n" + team + "\n" + epoch, "utf8");
}

function openSealed(teamKey, doc) {
  try {
    if (!Buffer.isBuffer(teamKey) || teamKey.length !== 32) return null;
    if (!doc || typeof doc !== "object" || +doc.format !== 2 || doc.kind !== "etiuda-sealed") return null;
    if (!SEALED_TEAM_RE.test(String(doc.team)) || !Number.isInteger(doc.epoch) || doc.epoch < 1) return null;
    const nonce = String(doc.nonce), hex = String(doc.ct);
    if (!/^[0-9a-f]{24}$/.test(nonce) || !/^[0-9a-f]*$/.test(hex) || hex.length % 2 || hex.length < 32) return null;
    const ct = Buffer.from(hex, "hex");
    const d = crypto.createDecipheriv("aes-256-gcm", teamKey, Buffer.from(nonce, "hex"), { authTagLength: 16 });
    d.setAAD(sealedAad(doc.team, doc.epoch));
    d.setAuthTag(ct.subarray(ct.length - 16));
    return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString("utf8");
  } catch { return null; }
}

function catalogSigValid(data, pinPublic) {
  const sig = data && data.sig;
  if (!data || !sig || sig.alg !== "Ed25519" || !/^[0-9a-f]{128}$/.test(String(sig.value || ""))) return false;
  if (!/^[0-9a-f]{64}$/.test(String(pinPublic || ""))) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(pinPublic, "hex")]), format: "der", type: "spki" });
    return crypto.verify(null, signedBytesOf(data), key, Buffer.from(String(sig.value), "hex"));
  } catch { return false; }
}

const BRANCH_PREFIX = "etiuda-desk-branch\n";

function branchSignedBytes(doc) {
  return Buffer.concat([Buffer.from(BRANCH_PREFIX, "utf8"), signedBytesOf(doc)]);
}

function branchIdOf(pub) {
  return "k-" + crypto.createHash("sha256").update(Buffer.from(String(pub), "hex")).digest("hex").slice(0, 16);
}

function deskFileGenuine(data, folder) {
  const d = data && data.desk, sig = data && data.sig;
  try {
    return !!folder && !!d && typeof d === "object" && d.id === folder && /^k-[0-9a-f]{16}$/.test(d.id)
      && /^[0-9a-f]{64}$/.test(String(d.key)) && branchIdOf(d.key) === d.id
      && !!sig && sig.alg === "Ed25519" && sig.keyId === d.id && /^[0-9a-f]{128}$/.test(String(sig.value))
      && crypto.verify(null, branchSignedBytes(data), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(d.key, "hex")]),
        format: "der", type: "spki" }), Buffer.from(sig.value, "hex"));
  } catch { return false; }
}

const HANDOVER_PREFIX = "etiuda-team-handover\n";
const HANDOVER_KIND = "etiuda-team-handover", HANDOVER_STEPS = 8;
function handoverSignedBytes(doc) { return Buffer.concat([Buffer.from(HANDOVER_PREFIX, "utf8"), signedBytesOf(doc)]); }

function handoverGenuine(s, teamId, from) {
  const to = s && s.to, sig = s && s.sig;
  try {
    return !!s && typeof s === "object" && +s.format === 1 && s.kind === HANDOVER_KIND && s.team === teamId
      && !!to && typeof to.keyId === "string" && /^[0-9a-f]{64}$/.test(String(to.public)) && to.public !== from.public
      && !!sig && sig.alg === "Ed25519" && /^[0-9a-f]{128}$/.test(String(sig.value))
      && crypto.verify(null, handoverSignedBytes(s), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(from.public, "hex")]),
        format: "der", type: "spki" }), Buffer.from(sig.value, "hex"));
  } catch { return false; }
}

function handedTo(doc, pin) {
  const list = Array.isArray(doc.handover) ? doc.handover : [];
  let at = pin;
  for (let step = 0; step < HANDOVER_STEPS; step++) {
    const s = list.find(x => handoverGenuine(x, doc.id, at));
    if (!s) return false;
    at = { keyId: s.to.keyId, public: s.to.public };
    if (at.keyId === doc.lead.keyId && at.public === doc.lead.public) return true;
  }
  return false;
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

function mirrorHasCatalog(mirror, catalogId, io, keyFor) {
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
              const inner = openSealed(key, doc);
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

  let mirrorEpoch = 0;
  let mirrorRev = -1;
  let pending = []; // [{ kind, relPath, epoch, tmpPath, text, doc }]
  const missingCount = new Map(); // relPath -> number of consecutive answered listings missing
  const knownMtimes = new Map(); // relPath -> { size, mtimeMs }
  const refusedMtimes = new Map(); // relPath -> { size, mtimeMs }

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
    const listing = scanData.listing || [];
    const staged = scanData.staged || [];

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
            pin = { keyId: doc.lead.keyId, public: doc.lead.public };
          }
          if (pin && !leadMatch && !handedMatch) pinOk = false; /* plant:syncer-team-pin */
          if (pinOk) {
            const revVal = teamRevOf(doc);
            const channelVal = teamChannelOf(doc);
            if (revVal === null || channelVal === null) {
              const used = path.join(folder, "etiuda-team.json");
              logger("etiuda: " + used + " names a rev or a channel this desk does not read, so nothing in it is used");
              refusedMtimes.set(teamStaged.relPath, { size: teamStaged.size, mtimeMs: teamStaged.mtimeMs });
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
                refusedMtimes.delete(teamStaged.relPath);
                mirrorEpoch = doc.epoch;
                mirrorRev = rev;
              } else {
                const why = olderEpoch
                  ? "key number " + doc.epoch + ", below " + compEpoch
                  : "rev " + rev + ", below " + compRev + " at key number " + doc.epoch;
                const used = path.join(folder, "etiuda-team.json");
                logger("etiuda: " + used + " is an older file of team " + doc.id + " than one this desk has heeded (" + why + "), so nothing in it is used");
                refusedMtimes.set(teamStaged.relPath, { size: teamStaged.size, mtimeMs: teamStaged.mtimeMs });
                try { io.unlink(teamStaged.tmpPath); } catch {}
              }
            }
          } else {
            const used = path.join(folder, "etiuda-team.json");
            logger("etiuda: " + used + " is signed by a key other than the lead's this desk trusts for team " + doc.id + ", so nothing in it is used");
            refusedMtimes.set(teamStaged.relPath, { size: teamStaged.size, mtimeMs: teamStaged.mtimeMs });
            try { io.unlink(teamStaged.tmpPath); } catch {}
          }
        } else if (doc && !teamWhole(doc)) {
          const used = path.join(folder, "etiuda-team.json");
          logger("etiuda: " + used + " is not a team file whole under its lead's key, so nothing in it is used");
          refusedMtimes.set(teamStaged.relPath, { size: teamStaged.size, mtimeMs: teamStaged.mtimeMs });
          try { io.unlink(teamStaged.tmpPath); } catch {}
        } else {
          refusedMtimes.set(teamStaged.relPath, { size: teamStaged.size, mtimeMs: teamStaged.mtimeMs });
          try { io.unlink(teamStaged.tmpPath); } catch {}
        }
      } else {
        refusedMtimes.set(teamStaged.relPath, { size: teamStaged.size, mtimeMs: teamStaged.mtimeMs });
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
            pin = { keyId: doc.lead.keyId, public: doc.lead.public };
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
        if (item.kind === "head") {
          let allEditionsPresent = true;
          if (item.doc && Array.isArray(item.doc.editions)) {
            for (const ed of item.doc.editions) {
              if (ed && ed.catalog && !mirrorHasCatalog(mirror, ed.catalog, io, keyFor)) {
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
          let genuine = false;
          try {
            const text = item.text || (item.tmpPath ? io.readFile(item.tmpPath, "utf8") : null);
            if (text) {
              const parsed = JSON.parse(text);
              if (parsed.kind === "etiuda-sealed") {
                const decrypted = openSealed(key, parsed);
                if (decrypted) {
                  const cat = JSON.parse(decrypted);
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

          if (genuine) {
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
            pushPending({ kind: "ec", relPath, epoch: doc.epoch, tmpPath, text });
            const target = path.join(mirror, relPath);
            if (io.exists(target)) {
              try { io.unlink(target); } catch {}
              applied.push(relPath);
            }
          } else {
            const decrypted = openSealed(key, doc);
            let genuine = false;
            if (decrypted) {
              let cat = null;
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
              const target = path.join(mirror, relPath);
              if (io.exists(target)) {
                try { io.unlink(target); } catch {}
                applied.push(relPath);
              }
              continue;
            }
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
              continue;
            }
            const target = path.join(mirror, relPath);
            ensureDir(target, io);
            io.rename(tmpPath, target);
            applied.push(relPath);
          } else if (parts.length === 1 && doc.desk && deskFileGenuine(doc, doc.desk.id)) {
            const target = path.join(mirror, relPath);
            ensureDir(target, io);
            io.rename(tmpPath, target);
            applied.push(relPath);
          } else {
            // Unsigned shared catalog (no doc.sig) or signed catalog
            const authKeys = teamAuthorizedKeys(folder, mirror, io, pin, opts.authorizedKeys);
            if (doc.sig && !authKeys.some(pub => catalogSigValid(doc, pub))) {
              try { io.unlink(tmpPath); } catch {}
              continue;
            }
            const target = path.join(mirror, relPath);
            ensureDir(target, io);
            io.rename(tmpPath, target);
            applied.push(relPath);
          }
        } else {
          // Invalid or corrupt .ec file: drop copy
          try { io.unlink(tmpPath); } catch {}
          continue;
        }
      } else if (relPath === "etiuda-head.json") {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        if (doc && headGenuine(doc, pin)) {
          let waitEditions = false;
          if (doc.editions && Array.isArray(doc.editions)) {
            for (const ed of doc.editions) {
              if (ed && ed.catalog && !mirrorHasCatalog(mirror, ed.catalog, io, keyFor)) {
                waitEditions = true; /* plant:syncer-head-wait */
                break;
              }
            }
          }
          if (waitEditions) {
            pushPending({ kind: "head", relPath, doc, tmpPath });
          } else {
            const target = path.join(mirror, relPath);
            ensureDir(target, io);
            io.rename(tmpPath, target);
            applied.push(relPath);
          }
        } else {
          try { io.unlink(tmpPath); } catch {}
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
        if (doc && +doc.format === 1 && (doc.kind === "etiuda-catalog-ask" || doc.kind === "etiuda-catalog-ask-withdrawn")) {
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
      if (listingMap.has(relPath)) {
        missingCount.delete(relPath);
      } else {
        const count = (missingCount.get(relPath) || 0) + 1;
        missingCount.set(relPath, count);
        let eligibleForRemoval = true;
        if (count < 2) eligibleForRemoval = false; /* plant:syncer-two-absent-remove */
        if (eligibleForRemoval) {
          try { io.unlink(path.join(mirror, relPath)); } catch {}
          missingCount.delete(relPath);
          applied.push(relPath);
        }
      }
    }

    if (applied.length > 0) {
      onChange({ team, applied });
    }
    return { answers: true, applied };
  }

  function syncOnce() {
    if (typeof opts.pin === "function") pin = opts.pin();
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
    for (const [relPath, st] of foundFiles.entries()) {
      const mirrorFile = path.join(mirror, relPath);
      let alreadyInMirror = false;
      const prev = knownMtimes.get(relPath);
      const prevRef = refusedMtimes.get(relPath);
      if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs && (io.exists(mirrorFile) || (prevRef && prevRef.size === st.size && prevRef.mtimeMs === st.mtimeMs))) {
        alreadyInMirror = true;
      }

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
    state: () => ({ mirrorEpoch, mirrorRev, pendingLength: pending.length, missingCount: new Map(missingCount) })
  };
}

class FolderSyncerController {
  constructor(opts) {
    this.team = opts.team;
    this.folder = opts.folder;
    this.mirror = opts.mirror;
    this.pin = opts.pin;
    this.keyFor = opts.keyFor;
    this.useWorker = opts.useWorker !== false;
    this.onStatus = opts.onStatus;
    this.onChange = opts.onChange;
    this.pollMs = opts.pollMs || FOLDER_SYNC_CADENCE_MS;
    this.worker = null;
    this.stopped = false;

    // The program runs on the main thread to perform verification and applying
    this.program = createFolderProgram({
      team: this.team,
      folder: this.folder,
      mirror: this.mirror,
      pin: this.pin,
      keyFor: this.keyFor,
      logger: opts.logger,
      onStatus: this.onStatus,
      onChange: this.onChange
    });
  }

  start() {
    if (this.stopped) return;
    if (this.useWorker) {
      const workerScript = path.join(__dirname, "syncer-worker.cjs");
      this.worker = new Worker(workerScript);
      this.worker.on("message", (msg) => {
        if (!msg) return;
        if (msg.type === "status") {
          if (typeof this.onStatus === "function") this.onStatus(msg);
        } else if (msg.type === "scan") {
          this.program.applyScan(msg);
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
  startFolderSyncer,
  stopAllFolderSyncers,
  folderMirrorOf
};
