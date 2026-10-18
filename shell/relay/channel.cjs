"use strict";
/* THE RELAY'S CHANNEL LAYER, the same code for both shells: the desk's shell requires it, and Studio takes it through its
   pin. It keeps a local mirror of the team folder in step with the relay, so every reader and writer above it works on
   the mirror as it works on a share, and nothing above it changes (the design note's section 1).

   OUT: a whole file this program writes in its own place in the mirror is sealed under the team key, signed and uploaded.
   A .tmp, the name an atomic write uses before its rename, is never sent; neither is a file the layer itself wrote from a
   download (an echo). What waits while the relay does not answer is the outbox: the files of this program's own place
   whose bytes differ from what it last sent, which go after the catch-up. Each upload names the blob it replaces, so the
   relay keeps one per chain. A file written again after its deletion names that deletion; where the relay has let the
   deletion go, its keep over, it refuses the name as superseded and says of the deletion's own id that it expired. No blob
   of that chain is served then, so the program forgets the deletion and the file goes at once as the first of a chain of
   its own, a file of its own place and a desk's copy alike, with no step by anyone (S-readd-late and N3 of the reviews
   of F1). Where the relay says the deletion was superseded instead, a newer blob of the chain is live, and the file
   waits as any refusal that lifts.

   IN: each blob is fetched and judged through blob.cjs, the trust taken only from the signed team file this program holds
   (E1, E2): the lead's key is the pin, the desks' keys the signed roster of the blob's epoch, and the relay's own list is
   never read. Once a newer epoch is loaded, a key it leaves off its roster is removed at every older epoch, and at the
   newer epoch where an older loaded roster named the key. A blob that passes is written into the mirror whole, by the
   atomic write the shell uses on a share; one that
   fails is dropped and said, never written. A deletion is only a signed record from the path's writer (E3), and a blob the
   relay stops serving deletes nothing. A blob it could not serve for a reason that can pass is fetched again, the catch-up
   resuming from it at the next cycle; only an answer that the blob is gone lets it go. A catch-up applies the team file
   first, then the other root files, then the desks', so nothing is judged against a roster older than the batch. The
   floors (each writer's counter per epoch, the team file's rev per team, lead key and epoch) and the place in the relay's
   sequence survive a restart.

   AN EPOCH MOVE (F1 of the slice 1 review). The team file of a new epoch carries each remaining desk's wrap of the new key,
   and at the root it is sealed under that key, which a desk holding only the old one cannot open. So the lead also seals
   the team file once for each desk its roster names, under a key only the lead and that desk can make: the X25519
   agreement of the lead's box (the file's lead.box) and the desk's (its roster entry's box), through HKDF bound to this
   relay, team, lead key, desk and both boxes. Each such copy sits in a place of its own named by that agreement too.
   What the relay cannot tell: whose a copy is from its place or its bytes, the place being 128 bits of HKDF output only
   that agreement makes; anything inside a copy; and anything from a fetch, since every desk fetches every blob listed.
   What it can tell: that a place is a copy of the lead's and how many there are, which its own device list already
   gives; that a copy pads to the size of the team file at the root; and, since a place stays the same for as long as
   both boxes do, which place first took a copy just after an enrolment it was told of, or took the lead's deletion just
   after a withdrawal, and so, by timing, whose that place is. A desk opens only its own, under the pinned lead's signature,
   takes the team file from it and so its own wrap, and loads what waited for the new key, with no step by anyone. A desk
   taken off the roster gets no copy of any later file, and its last one is superseded by the lead's signed deletion; and
   nothing any program sends is sealed under an epoch older than the team file it holds, so the new team file never goes
   out under the old key. Each shell keeps its box's private key and lends only the agreement (`agree`).

   A DESK ADMITTED WHILE OFFLINE (F6). A desk joining by invitation finds its own copy before it holds any team file: its
   invitation names the lead's box beside the lead's key, so the place and key of its copy are known from the moment it
   asks. The lead lets the invitation's copy go once the invitation is spent, and the desk, back however long after, opens
   the newest team file from its own copy, under the pinned lead's signature, as any desk does after a move. The box the
   signed team file names wins once the desk holds one; the invitation's serves only before that.

   THE LEAD'S EPOCH (F8 of the slice 1 review). A desk joining by invitation seals its one request at the newest epoch a
   verified lead blob has named. The relay's header names a writer and an epoch before any signature is checked, and that
   header moves nothing: leadEpoch rises only once the pinned lead's upload signature on the blob verifies.

   PENDING (F7 of the slice 1 review). A blob is parked to wait for a key only once that same signature verifies under a
   writer this program already trusts, the pinned lead or a desk a roster it holds names. A forged blob, or one from a
   writer it does not trust, is dropped and said, and cannot fill the pending list or push an honest wait out.

   Two halves. createProgram is synchronous and talks to nobody: it judges, writes the mirror and says what it owes; the
   harness's adapter drives it directly. createChannel talks to the relay (the hello, a session re-opened when it lapses,
   since and the blobs, the uploads, the socket's announcements) and watches the mirror. Nothing private leaves unsealed:
   the path and the bytes travel only inside the ciphertext. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const B = require("./blob.cjs");

const TEAM_NAME = "etiuda-team.json";
const HEAD_NAME = "etiuda-head.json";
const STATE_KIND = "etiuda-relay-channel";
/* A file received is an echo, not a change of this program's, for an hour after it was written, unless its bytes moved. */
const ECHO_MS = 60 * 60 * 1000;
const BRANCH_PREFIX = "etiuda-desk-branch\n";
const HEAD_PREFIX = "etiuda-relay-head\n";
const HELLO_LABEL = "etiuda-relay-hello";
/* The key a desk joining by invitation seals its one request under, and reads the lead's team file with, before it holds
   the team key: HKDF-SHA256 of the invitation's 128-bit secret, which only the lead and the invited hold. */
const INVITE_SEAL_INFO = "etiuda-relay-invite-seal";
/* The label of a desk's own copy of the team file: its key and its place from one agreement of two boxes (deskCopyOf). */
const DESK_COPY_INFO = "etiuda-relay-desk-copy";
const INVITE_UPLOAD_MAX = 64 * 1024;
const SINCE_MAX = 1000;
const PENDING_MAX = 1000;
const TAKEN_MAX = 4096;
const SESSION_KEEP_MS = 25 * 60 * 1000;
const SETTLE_MS = 300;
const POLL_MS = 60 * 1000;
const PING_MS = 30 * 1000;
const RETRY_MIN_MS = 2000, RETRY_MAX_MS = 60 * 1000;
const TMP_RE = /\.tmp$/i;
const HEX32 = /^[0-9a-f]{32}$/, HEX64 = /^[0-9a-f]{64}$/;
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/* An upload refused (F4 of the slice 1 review). These refusals no later state of the team can lift: the path, the place, the
   bytes or their signature are wrong in themselves, so the same bytes are refused again however long they wait. The file
   stops until its bytes change, and the program says so. Any other refusal waits: the epoch, the team's space, an
   enrolment, a counter, a chain, or an answer this layer does not know. The file stays owed and goes again at the next
   cycle, and the program says once that it waits. */
const STOPS = ["bad-path", "forged-delete", "outside-place", "blob-size", "bad-signature", "not-roster", "wrong-team", "tmp", "echo"];
/* Waits about who sends or the epoch it seals under, which every other file of the cycle meets too: the cycle's uploads stop
   at the first and go again at the next cycle. */
const HALTS = ["epoch", "not-enrolled", "removed", "token-spent"];
/* A fetch answered 404 or 410 says the blob is gone (missing, superseded, expired), and it is let go. Any other answer, a
   fault, a limit or a session refused among them, can pass: the blob stays owed and is fetched again. */
const gone = r => r.status === 404 || r.status === 410;

const R = B.refusal;
const isCount = v => Number.isSafeInteger(v) && v >= 1;
const has = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const table = v => !!v && typeof v === "object" && !Array.isArray(v);
const sha256 = b => crypto.createHash("sha256").update(b).digest("hex");
const branchIdOf = pub => "k-" + sha256(Buffer.from(pub, "hex")).slice(0, 16);
const toBytes = v => (Buffer.isBuffer(v) ? v : v instanceof Uint8Array ? Buffer.from(v.buffer, v.byteOffset, v.byteLength)
  : typeof v === "string" ? Buffer.from(v, "utf8") : null);
const later = (a, b) => a.epoch > b.epoch || (a.epoch === b.epoch && a.counter > b.counter);

/* The canonical form the engine signs a document in, and the bytes its signature covers: `hash` left out, `sig` folded to
   its alg and keyId. The same as shell/main.js's signedBytesOf. */
function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
}
function signedBytes(doc) {
  const copy = {};
  for (const k of Object.keys(doc)) {
    if (k === "hash") continue;
    if (k !== "sig") { copy[k] = doc[k]; continue; }
    const s = doc.sig;
    if (s && typeof s === "object") {
      copy.sig = {};
      if (s.alg !== undefined) copy.sig.alg = s.alg;
      if (s.keyId !== undefined) copy.sig.keyId = s.keyId;
    }
  }
  return Buffer.from(canon(copy), "utf8");
}

function helloBytes(rt, nonce, keyId) {
  return Buffer.from([HELLO_LABEL, rt, nonce, keyId].join("\n") + "\n", "utf8");
}

function inviteSealKey(secretHex) {
  if (typeof secretHex !== "string" || !HEX32.test(secretHex)) return null;
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(secretHex, "hex"), Buffer.alloc(0), Buffer.from(INVITE_SEAL_INFO, "utf8"), 32));
}

/* A desk's own copy of the team file: {id, key}, the 32-hex id of its place (`invite:<id>`, the shape the relay takes
   from a lead) and the 32-byte key it is sealed under, or null. `dh` is the X25519 agreement of the lead's box and the
   desk's, which only the lead and that desk can make; an all-zero agreement, a low-order key's, makes nothing. The rest
   binds it: the relay team, the team, the lead's key id, the lead's box, the desk's id and the desk's box, all public. */
function deskCopyOf(dh, f) {
  const d = toBytes(dh);
  if (!d || d.length !== 32 || d.every(b => b === 0)) return null;
  if (!table(f) || !HEX32.test(String(f.rt)) || !B.isId(f.teamId) || !B.isId(f.leadKeyId) || !HEX64.test(String(f.leadBox))
    || !/^k-[0-9a-f]{16}$/.test(String(f.deskId)) || !HEX64.test(String(f.deskBox))) return null;
  const info = Buffer.from([DESK_COPY_INFO, f.rt, f.teamId, f.leadKeyId, f.leadBox, f.deskId, f.deskBox].join("\n") + "\n", "utf8");
  const okm = Buffer.from(crypto.hkdfSync("sha256", d, Buffer.alloc(0), info, 48));
  return { id: okm.subarray(32).toString("hex"), key: okm.subarray(0, 32) };
}

/* The relay team id a team file's channel names: `rt`, as the engine writes it, or `relay`, as the harness's contract
   writes it; null where neither, or where both are given and differ. */
function relayOf(doc) {
  const c = doc && doc.channel;
  if (!table(c) || c.kind !== "relay") return null;
  if (c.rt !== undefined && c.relay !== undefined && c.rt !== c.relay) return null;
  const rt = c.rt !== undefined ? c.rt : c.relay;
  return typeof rt === "string" && rt ? rt : null;
}

/* The desks a signed roster names with their keys: the engine's entry {desk: {id, key, box}, wrap}, its id the branch id of
   its key, or the contract's {deskId, keyId}, its key id the public key. Nothing else is read from it. */
function rosterOf(doc) {
  const out = [];
  for (const r of Array.isArray(doc && doc.roster) ? doc.roster : []) {
    if (!table(r)) continue;
    if (table(r.desk)) {
      const id = String(r.desk.id || ""), pub = String(r.desk.key || "");
      if (/^k-[0-9a-f]{16}$/.test(id) && HEX64.test(pub) && branchIdOf(pub) === id) out.push({ deskId: id, keyId: id, public: pub });
    } else if (B.isId(r.deskId) && typeof r.keyId === "string" && HEX64.test(r.keyId)) {
      out.push({ deskId: r.deskId, keyId: r.keyId, public: r.keyId });
    }
  }
  return out;
}

function pinOf(p) {
  if (!table(p)) return null;
  const lead = table(p.lead) ? p.lead : {};
  if (typeof p.teamId !== "string" || !p.teamId || typeof p.rt !== "string" || !p.rt || !B.isId(lead.keyId)
    || typeof lead.public !== "string" || !HEX64.test(lead.public)) return null;
  return { teamId: p.teamId, rt: p.rt, lead: { keyId: lead.keyId, public: lead.public } };
}

/* A writer's place as blob.cjs judges it: the lead's everything but desks/, a desk's desks/<its id>/ and below. */
function inPlace(place, rel) {
  const role = place === "root" ? { role: "lead" }
    : typeof place === "string" && place.startsWith("desk:") ? { role: "desk", deskId: place.slice(5) } : null;
  return !!role && B.placeOf(rel, role, "file").ok;
}

/* ---- the mirror on disk ---------------------------------------------------------------------------------------- */

const RENAME_BUSY = ["EPERM", "EACCES", "EBUSY"];
function renamePatiently(from, to) {
  for (let i = 1; ; i++) {
    try { fs.renameSync(from, to); return; }
    catch (e) {
      if (i >= 10 || RENAME_BUSY.indexOf(e.code) < 0) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}
/* Temp file then rename, as the shell writes a share. The shell passes its own writeReplacing in; this is the same act for
   a host that has none. */
function writeWhole(file, text) {
  const tmp = file + ".tmp";
  try { fs.writeFileSync(tmp, text, "utf8"); renamePatiently(tmp, file); }
  catch (e) { try { fs.unlinkSync(tmp); } catch { /* never made */ } throw e; }
}

/* The mirror as files under `root`: read, write whole and remove by a relative path blob.cjs's checkPath accepts and that
   resolves inside the root (E6), and the list of every file under it. */
function diskIO(root, writeFile) {
  const base = path.resolve(root);
  const put = typeof writeFile === "function" ? writeFile : writeWhole;
  const at = rel => {
    const p = B.checkPath(rel);
    if (!p.ok) return null;
    const abs = path.resolve(base, ...p.segments);
    return abs.startsWith(base + path.sep) ? abs : null;
  };
  return {
    root: base,
    read(rel) { const a = at(rel); if (!a) return null; try { return fs.readFileSync(a); } catch { return null; } },
    write(rel, text) {
      const a = at(rel);
      if (!a) throw new Error("that path stays outside the mirror");
      fs.mkdirSync(path.dirname(a), { recursive: true });
      put(a, text);
    },
    remove(rel) {
      const a = at(rel);
      if (!a) return;
      try { fs.unlinkSync(a); } catch (e) { if (e.code !== "ENOENT") throw e; }
    },
    list() {
      const out = [];
      const walk = (dir, rel, depth) => {
        if (depth > 16) return;
        let names = [];
        try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const d of names) {
          const r = rel ? rel + "/" + d.name : d.name;
          if (d.isDirectory()) walk(path.join(dir, d.name), r, depth + 1);
          else if (d.isFile()) out.push(r);
        }
      };
      walk(base, "", 0);
      return out;
    },
  };
}

function readState(file) {
  if (!file) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

/* ---- the program: judges, writes the mirror, says what it owes ---------------------------------------------------- */

function freshState() {
  return { kind: STATE_KIND, v: 1, seq: 0, counters: {}, revs: {}, trust: {}, applied: {}, taken: {}, sent: {}, sentInv: {},
    refused: {}, own: 0, bytes: 0, leadEpoch: 0, pending: [], tokenUsed: false, invited: false, headT: null };
}

/* A state read back, field by field: what is not its shape is dropped, so a damaged file costs that field and no more. */
function stateOf(x) {
  const s = freshState();
  if (!table(x) || x.kind !== STATE_KIND || x.v !== 1) return s;
  const count = v => Number.isSafeInteger(v) && v >= 0;
  if (count(x.seq)) s.seq = x.seq;
  if (count(x.own)) s.own = x.own;
  if (count(x.bytes)) s.bytes = x.bytes;
  if (count(x.leadEpoch)) s.leadEpoch = x.leadEpoch;
  if (Number.isFinite(x.headT)) s.headT = x.headT;
  s.tokenUsed = x.tokenUsed === true;
  s.invited = x.invited === true;
  for (const [name, prefix] of [["counters", "c\n"], ["revs", "r\n"]]) {
    if (table(x[name])) for (const k of Object.keys(x[name])) if (k.startsWith(prefix) && count(x[name][k])) s[name][k] = x[name][k];
  }
  if (table(x.trust)) for (const e of Object.keys(x.trust)) {
    const t = x.trust[e];
    if (/^[1-9][0-9]*$/.test(e) && table(t) && count(t.rev) && Array.isArray(t.desks))
      s.trust[e] = { rev: t.rev, desks: t.desks.filter(d => table(d) && B.isId(d.deskId) && B.isId(d.keyId) && HEX64.test(String(d.public)))
        .map(d => ({ deskId: d.deskId, keyId: d.keyId, public: d.public })) };
  }
  if (table(x.applied)) for (const k of Object.keys(x.applied)) {
    const a = x.applied[k];
    if (table(a) && B.isId(a.writer) && isCount(a.epoch) && isCount(a.counter) && typeof a.at === "number")
      s.applied[k] = { writer: a.writer, epoch: a.epoch, counter: a.counter, id: String(a.id || ""), at: a.at,
        sha: typeof a.sha === "string" ? a.sha : null, del: a.del === true };
  }
  if (table(x.taken)) for (const k of Object.keys(x.taken)) {
    const t = x.taken[k];
    if (HEX32.test(k) && table(t) && typeof t.path === "string" && B.isId(t.writer)) s.taken[k] = { path: t.path, writer: t.writer };
  }
  const sentOf = m => {
    const o = {};
    if (table(m)) for (const k of Object.keys(m)) {
      const v = m[k];
      if (table(v) && HEX32.test(String(v.id)) && isCount(v.epoch) && isCount(v.counter) && count(v.size))
        o[k] = { id: v.id, epoch: v.epoch, counter: v.counter, sha: typeof v.sha === "string" ? v.sha : null, size: v.size, del: v.del === true };
    }
    return o;
  };
  s.sent = sentOf(x.sent);
  if (table(x.sentInv)) for (const h of Object.keys(x.sentInv)) if (HEX32.test(h)) s.sentInv[h] = sentOf(x.sentInv[h]);
  /* A file stopped is kept with the refusal that stopped it; a record of any other, one written before F4 included, is let
     go, so a file a refusal that lifts once stopped goes again. */
  if (table(x.refused)) for (const k of Object.keys(x.refused)) {
    const r = x.refused[k];
    if (table(r) && typeof r.sha === "string" && STOPS.concat(["not-text"]).indexOf(r.why) >= 0) s.refused[k] = { sha: r.sha, why: r.why }; /* plant:refused-kept */
  }
  if (Array.isArray(x.pending)) s.pending = x.pending.filter(p => table(p) && count(p.seq) && HEX32.test(String(p.id))
    && isCount(p.epoch) && B.isId(p.writer) && count(p.floor)).slice(-PENDING_MAX)
    .map(p => ({ seq: p.seq, id: p.id, epoch: p.epoch, writer: p.writer, floor: p.floor }));
  return s;
}

/* A short text the desk may show from a head: nothing hidden in it, and not so long that one head fills the row. */
function headTextOk(s, max) {
  return typeof s === "string" && s.length >= 1 && s.length <= max && !/[\u0000-\u001f\u007f]/.test(s);
}
/* The newest edition a head names. The greatest rev wins, and the last of a tie. One entry that is not well shaped
   refuses the whole head, so a desk never shows a mixture. */
function newestEdition(list) {
  if (!Array.isArray(list) || !list.length) return null;
  let best = null;
  for (const e of list) {
    if (!table(e) || !B.isId(e.catalog) || !Number.isSafeInteger(e.rev) || e.rev < 0) return null;
    let published = e.published;
    if (typeof published === "number" && Number.isFinite(published)) published = String(published);
    if (!headTextOk(e.edition, 120) || !headTextOk(published, 80)) return null;
    if (!best || e.rev >= best.rev) best = { rev: e.rev, edition: e.edition, published: published };
  }
  return best;
}

function createProgram(opts) {
  const o = opts || {};
  const io = o.io;
  const clock = typeof o.clock === "function" ? o.clock : Date.now;
  const say = typeof o.say === "function" ? o.say : () => {};
  const save = typeof o.save === "function" ? o.save : () => {};
  const teamMax = Number.isSafeInteger(o.teamMax) ? o.teamMax : B.TEAM_MAX;
  let st = stateOf(typeof o.load === "function" ? o.load() : null);
  let pin = pinOf(o.pin);
  const rates = new Map();
  /* What waits on a refusal that lifts, by path or copy, with the reason last said for it, so a wait is said once. */
  const waiting = new Map();

  const persist = () => { try { save(st); } catch (e) { say("the relay's record could not be kept - " + (e && e.message)); } };
  const revKey = t => ({ teamId: pin.teamId, leadKeyId: pin.lead.keyId, epoch: t.epoch, rev: t.rev });
  const leadTrust = desks => ({ lead: { keyId: pin.lead.keyId, public: pin.lead.public }, desks: desks || [] });
  const dropSaid = (what, r) => { say(what + ": " + r.said); return r; };

  function setPin(p) {
    pin = pinOf(p);
    return pin ? { ok: true } : R("not-enrolled");
  }

  /* A team file judged under the pin alone: signed by the pinned lead's key, never one the file names; this team and this
     relay; an epoch and a rev. */
  function teamJudged(doc) {
    if (!pin) return R("wrong-team");
    if (!table(doc) || !table(doc.sig)) return R("bad-signature");
    let bytes;
    try { bytes = signedBytes(doc); } catch { return R("bad-signature"); }
    if (!B.verifySig(pin.lead.public, bytes, doc.sig.value)) return R("bad-signature"); /* plant:team-sig */
    if (doc.kind !== "etiuda-team" || doc.id !== pin.teamId || relayOf(doc) !== pin.rt) return R("wrong-team"); /* plant:team-own */
    if (!isCount(doc.epoch) || !isCount(doc.rev)) return R("replay-rev");
    return { ok: true, doc, epoch: doc.epoch, rev: doc.rev };
  }

  /* The head the lead's Studio writes. The pinned lead's signature over the head prefix, and this team's name.
     An older t than one already kept is left out. Whatever it says, the desk is not blocked. */
  function headJudged(body, floor) {
    if (!pin) return R("wrong-team");
    let doc = null;
    try { doc = JSON.parse(String(body).replace(/^\uFEFF/, "")); } catch { doc = null; }
    if (!table(doc) || !table(doc.sig)) return R("bad-signature");
    let bytes;
    try { bytes = Buffer.concat([Buffer.from(HEAD_PREFIX, "utf8"), signedBytes(doc)]); } catch { return R("bad-signature"); }
    if (!B.verifySig(pin.lead.public, bytes, doc.sig.value)) return R("bad-signature"); /* plant:head-sig */
    if (doc.v !== 1) return R("bad-signature");
    if (doc.team !== pin.teamId) return R("wrong-team");
    if (!isCount(doc.epoch) || !isCount(doc.rev) || !Number.isFinite(doc.t)) return R("bad-signature");
    const edition = newestEdition(doc.editions);
    if (!edition) return R("bad-signature");
    if (floor && Number.isFinite(st.headT) && doc.t < st.headT) return R("replay-counter");
    return { ok: true, t: doc.t, edition: edition.edition, published: edition.published, epoch: doc.epoch, rev: doc.rev };
  }

  function keepTrust(t) {
    const had = st.trust[t.epoch];
    if (!had || had.rev <= t.rev) st.trust[t.epoch] = { rev: t.rev, desks: rosterOf(t.doc) };
  }

  /* The contract's load: a team file above the rev floor for its team, lead key and epoch, the floor then raised. */
  function loadTeamFile(doc) {
    const t = teamJudged(doc);
    if (!t.ok) return t;
    const r = B.revLoad(st.revs, revKey(t));
    if (!r.ok) return r; /* plant:rev-load */
    st.revs = r.revs;
    keepTrust(t);
    persist();
    return { ok: true, rev: t.rev };
  }

  /* The newest roster this program has loaded, or null before any team file is kept. */
  function newestRoster() {
    let best = 0, desks = null;
    for (const k of Object.keys(st.trust)) {
      const e = Number(k);
      if (!Number.isSafeInteger(e) || e < best) continue;
      best = e;
      desks = st.trust[k].desks;
    }
    return best >= 1 ? { epoch: best, desks: desks || [] } : null;
  }

  function namedOnOlder(writerKeyId, topEpoch) {
    for (const k of Object.keys(st.trust)) {
      const e = Number(k);
      if (Number.isSafeInteger(e) && e < topEpoch && (st.trust[k].desks || []).some(d => d.keyId === writerKeyId)) return true;
    }
    return false;
  }

  /* Once a newer epoch is loaded, a key it does not name is removed at every older epoch, so a file that key seals
     under the old team file is refused. At the newer epoch the same key is removed only where an older loaded roster
     named it. A stranger, never named, stays not-roster. The lead's key is the pin. */
  function removedAfterMove(writerKeyId, epoch, opened) {
    if (!pin || writerKeyId === pin.lead.keyId || !isCount(epoch)) return null;
    const top = newestRoster();
    if (!top || epoch > top.epoch) return null;
    if (top.desks.some(d => d.keyId === writerKeyId)) return null;
    const namedBefore = namedOnOlder(writerKeyId, top.epoch);
    if (epoch < top.epoch) return (opened || namedBefore) ? R("removed") : null; /* plant:fk1-removed */
    if (epoch !== top.epoch) return null;
    if (namedBefore) return R("removed");
    return null;
  }

  /* One blob judged: blob.cjs's first line under `trust` at `epoch` with `key`, against `floors`; a key the newest
     loaded epoch leaves off its roster is then removed, at an older epoch and at the newest where an older roster named
     it; then a supersedes that names a blob this program took must name one of the same path and writer. */
  function judge(blob, trust, epoch, key, floors) {
    const r = B.openBlob({ blob, relayTeamId: pin.rt, epoch, teamKey: key, trust, counters: floors });
    if (r.ok || r.reason === "not-roster") {
      const writer = r.ok ? r.writerKeyId : (blob && blob.writerKeyId);
      const at = r.ok ? r.epoch : (isCount(blob && blob.epoch) ? blob.epoch : epoch);
      const gone = removedAfterMove(writer, at, r.ok);
      if (gone) return gone;
    }
    if (!r.ok) return r;
    if (r.supersedes !== null && has(st.taken, r.supersedes)) {
      const was = st.taken[r.supersedes];
      if (was.writer !== r.writerKeyId || was.path.toLowerCase() !== r.path.toLowerCase()) return R("outside-place"); /* plant:chain-same */
    }
    return r;
  }

  function remember(id, rec) {
    st.taken[id] = rec;
    const ids = Object.keys(st.taken);
    for (let i = 0; i < ids.length - TAKEN_MAX; i++) delete st.taken[ids[i]];
  }

  /* A judged blob into the mirror, whole, by the host's atomic write; a deletion removes the file. The writer's floor rises
     only once the mirror holds it. */
  function land(r) {
    const prev = has(st.applied, r.path) ? st.applied[r.path] : null;
    if (prev && prev.writer === r.writerKeyId && !later(r, prev)) return { ok: true, path: r.path, stale: true };
    /* Judged before the write, and said here: the batch's landing of a root file does not say a refusal of its own.
       The counter stays where it was, so a later genuine head is not refused as a replay of one that was left out.
       A deletion keeps the t already taken, so the same older head does not come back after the file is gone. */
    let head = null;
    if (r.path === HEAD_NAME && r.kind === "file") {
      head = headJudged(r.body, true);
      if (!head.ok) return dropSaid(HEAD_NAME, head);
    }
    try {
      if (r.kind === "delete") io.remove(r.path);
      else io.write(r.path, r.body);
    } catch (e) {
      say(r.path + " could not be written into the mirror - " + (e && e.message));
      return { ok: false, reason: "unwritten", said: "That file could not be written into the mirror.", served: false };
    }
    if (head) st.headT = head.t;
    st.counters = B.raiseCounter(st.counters, r.writerKeyId, r.epoch, r.counter); /* plant:floor-raise */
    st.applied[r.path] = { writer: r.writerKeyId, epoch: r.epoch, counter: r.counter, id: r.id, at: clock(),
      sha: r.kind === "delete" ? null : sha256(Buffer.from(r.body, "utf8")), del: r.kind === "delete" };
    remember(r.id, { path: r.path, writer: r.writerKeyId });
    if (r.path === TEAM_NAME && r.kind === "file") st.leadEpoch = Math.max(st.leadEpoch, r.epoch);
    persist();
    return r.kind === "delete" ? { ok: true, deleted: true, path: r.path } : { ok: true, path: r.path };
  }

  /* A team file this program is told to judge by, as a caller holding it: signed under the pin for this team and relay,
     its rev at or above the floor. Its roster becomes the trust of its epoch; the floor is not raised. */
  function holdTeam(doc) {
    const t = teamJudged(doc);
    if (!t.ok) return t;
    const cur = B.revCurrent(st.revs, revKey(t));
    if (!cur.ok) return cur;
    keepTrust(t);
    persist();
    return { ok: true, epoch: t.epoch };
  }

  /* The contract's accept: the team file passed is judged under the pin and its rev at or above the floor, and the blob is
     judged under that file's roster and epoch (blob.cjs refuses one over the size cap before anything else). */
  function acceptBlob(input) {
    const i = input || {};
    const b = i.blob;
    const t = teamJudged(i.teamDoc);
    if (!t.ok) return t;
    const cur = B.revCurrent(st.revs, revKey(t));
    if (!cur.ok) return cur; /* plant:rev-current */
    const r = judge(b, leadTrust(rosterOf(t.doc)), t.epoch, i.teamKey, st.counters);
    if (!r.ok) return r;
    if (r.path === TEAM_NAME && r.kind === "file") {
      const landed = landTeam(r, null);
      return landed.ok ? { ok: true, path: r.path } : landed;
    }
    return land(r);
  }

  /* A team file arriving through the relay: the lead's, judged as a team file before it is written. The same bytes as the
     mirror's are nothing new; a lower or equal rev of other bytes is a replay. */
  function landTeam(r, ctx) {
    let doc = null;
    try { doc = JSON.parse(r.body.replace(/^\uFEFF/, "")); } catch { doc = null; }
    const t = teamJudged(doc);
    if (!t.ok) return t;
    const sha = sha256(Buffer.from(r.body, "utf8"));
    const prev = has(st.applied, TEAM_NAME) ? st.applied[TEAM_NAME] : null;
    if (prev && !prev.del && prev.sha === sha) {
      st.counters = B.raiseCounter(st.counters, r.writerKeyId, r.epoch, r.counter);
      persist();
      return { ok: true, path: TEAM_NAME, same: true };
    }
    const lr = B.revLoad(st.revs, revKey(t));
    if (!lr.ok) return lr; /* plant:team-rev */
    const landed = land(r);
    if (!landed.ok || landed.stale) return landed;
    st.revs = lr.revs;
    keepTrust(t);
    persist();
    if (ctx && typeof ctx.onTeam === "function") {
      try { ctx.onTeam(); } catch (e) { say("the team file could not be heeded - " + (e && e.message)); }
    }
    return landed;
  }

  /* The roster of the team file the mirror holds, where the pinned lead signed it for this team and relay: on the lead's
     side its own file, on a desk's the one landTeam wrote. A rev below one already kept for its epoch changes nothing. */
  function trustFromMirror() {
    const t = heldTeam();
    if (t) keepTrust(t);
    return t;
  }

  /* The team file the mirror holds, judged under the pin, or null. */
  function heldTeam() {
    const b = io.read(TEAM_NAME);
    return b ? judgedBytes(b) : null;
  }
  function judgedBytes(b) {
    let doc = null;
    try { doc = JSON.parse(toBytes(b).toString("utf8").replace(/^\uFEFF/, "")); } catch { return null; }
    const t = teamJudged(doc);
    return t.ok ? t : null;
  }

  /* ---- a desk's own copy of the team file (the header's EPOCH MOVE) ---- */

  function copyFor(ctx, peerBox, leadBox, deskId, deskBox) {
    let dh = null;
    try { dh = ctx.agree(peerBox); } catch { dh = null; }
    return deskCopyOf(dh, { rt: pin.rt, teamId: pin.teamId, leadKeyId: pin.lead.keyId, leadBox, deskId, deskBox });
  }

  /* On the lead's side: one copy for each desk the roster of the team file being sent names, by that entry's own box, and
     for nobody else, so a desk taken off the roster has none of this file or any later one. */
  function deskCopies(doc, ctx) {
    const out = [];
    if (!ctx || typeof ctx.agree !== "function" || !table(doc.lead) || !HEX64.test(String(doc.lead.box))) return out;
    for (const r of Array.isArray(doc.roster) ? doc.roster : []) {
      if (!table(r) || !table(r.desk) || !HEX64.test(String(r.desk.box)) || !rosterOf({ roster: [r] }).length) continue;
      const c = copyFor(ctx, r.desk.box, doc.lead.box, r.desk.id, r.desk.box);
      if (c) out.push({ id: c.id, key: c.key, desk: r.desk.id }); /* plant:desk-copies */
    }
    return out;
  }

  /* On a desk's side: the place and key of its own copy, from the lead's box in the team file it holds and its own box;
     before it holds a team file naming one, from the lead's box its invitation names (F6). */
  function ownCopy(held, ctx) {
    const self = ctx && ctx.self;
    if (!self || typeof ctx.agree !== "function" || typeof self.place !== "string" || !self.place.startsWith("desk:")) return null;
    let box = held && table(held.doc.lead) && HEX64.test(String(held.doc.lead.box)) ? held.doc.lead.box : null;
    if (!box && HEX64.test(String(ctx.inviteBox))) box = ctx.inviteBox; /* plant:invite-box */
    return box ? copyFor(ctx, box, box, self.place.slice(5), self.box) : null;
  }

  /* The epoch of the team file this program holds, or 0: nothing it sends is sealed under an older one. */
  function teamEpoch() {
    const t = heldTeam();
    return t ? t.epoch : 0;
  }

  /* The envelope a fetch hands over, or null where its metadata is not well formed or its size is not the ciphertext's. */
  function envelopeOf(it) {
    const m = it && it.meta, ct = it && toBytes(it.ct);
    if (!table(m) || m.v !== 1 || !ct || m.size !== ct.length || !HEX32.test(String(m.id))) return null;
    return { id: m.id, epoch: m.epoch, supersedes: m.supersedes == null ? null : m.supersedes, writerKeyId: m.writer,
      counter: m.counter, nonce: m.nonce, signature: m.sig, ciphertext: ct };
  }

  function floorAt(floors, writer, epoch) {
    const k = "c\n" + writer + "\n" + epoch;
    return has(floors, k) && Number.isSafeInteger(floors[k]) ? floors[k] : 0;
  }
  function floorsWith(floors, writer, epoch, value) {
    const out = Object.assign({}, floors);
    out["c\n" + writer + "\n" + epoch] = value;
    return out;
  }

  function pend(it, floors) {
    const m = it.meta;
    if (st.pending.some(p => p.id === m.id)) return;
    st.pending.push({ seq: it.seq, id: m.id, epoch: m.epoch, writer: m.writer,
      floor: it.floor !== undefined ? it.floor : floorAt(floors, m.writer, m.epoch) });
    while (st.pending.length > PENDING_MAX) {
      const gone = st.pending.shift();
      say("a file from " + gone.writer + " waited too long for its key and was let go");
    }
  }
  const unpend = id => { st.pending = st.pending.filter(p => p.id !== id); };

  /* The public key of a writer this program trusts: the pinned lead, or a desk one roster it already holds names, and
     only where that key id is a single public key. A public key the blob itself carries is not trust. */
  function trustedPub(writer) {
    if (!pin || !B.isId(writer)) return null;
    if (writer === pin.lead.keyId) return pin.lead.public;
    const pubs = [];
    for (const e of Object.keys(st.trust)) {
      for (const d of st.trust[e].desks) {
        if (d.keyId === writer && pubs.indexOf(d.public) < 0) pubs.push(d.public);
      }
    }
    return pubs.length === 1 ? pubs[0] : null;
  }

  /* The upload signature over this fetched blob's header and ciphertext, under a trusted writer. The team key is not
     required: the signature is the writer's, and the ciphertext may still be waiting for a key (F8, F7). */
  function signedUpload(it) {
    const m = it && it.meta, ct = toBytes(it && it.ct);
    const pub = m && trustedPub(m.writer);
    if (!pub || !ct) return false;
    const aad = B.aadOf({ relayTeamId: pin.rt, epoch: m.epoch, id: m.id, supersedes: m.supersedes == null ? null : m.supersedes,
      writerKeyId: m.writer, counter: m.counter });
    return !!aad && B.verifyUpload(pub, aad, ct, m.sig);
  }

  /* The keys and trust one blob is tried under, in order: the team key of its own epoch under the roster of that epoch (a
     desk's file needs that roster; the lead's needs only the pin); then, before this program holds that key, the
     invitation's seal key under the pin alone; on the lead's side, a live invitation's key for a desk not on the roster,
     self-certified by the public key the upload carried. */
  function triesFor(m, ctx) {
    const out = [];
    const key = ctx && typeof ctx.keyFor === "function" ? ctx.keyFor(m.epoch) : null;
    const known = has(st.trust, String(m.epoch));
    const lead = m.writer === pin.lead.keyId;
    const rostered = known && st.trust[m.epoch].desks.some(d => d.keyId === m.writer);
    if (!lead && !rostered && ctx && Array.isArray(ctx.inviteKeys) && typeof m.pub === "string" && HEX64.test(m.pub)
      && branchIdOf(m.pub) === m.writer) {
      for (const k of ctx.inviteKeys) out.push({ key: k.key, trust: leadTrust([{ deskId: m.writer, keyId: m.writer, public: m.pub }]), asked: true });
    }
    if (key && (lead || known)) out.push({ key, trust: leadTrust(known ? st.trust[m.epoch].desks : []) });
    else if (key) out.push({ key, refuse: "epoch" });
    return { tries: out, missing: !key };
  }

  /* One fetched blob opened, or pending where this program holds no key it could open under yet, or dropped and said. */
  function openOne(it, floors0, ctx) {
    const blob = envelopeOf(it);
    const m = it.meta;
    if (!blob) { dropSaid("a file from the relay", R("bad-signature")); return null; }
    const floors = it.floor !== undefined ? floorsWith(floors0, m.writer, m.epoch, it.floor) : floors0;
    if (typeof m.place === "string" && m.place.startsWith("invite:")) return openInvited(it, blob, floors, ctx);
    /* A request a desk joining by invitation sent, its key carried beside it (the relay marks only an invitation's upload so):
       the lead's to open; any other program passes over it and says nothing, as it passes over an invitation's place. */
    if (typeof m.pub === "string" && m.writer !== pin.lead.keyId && !(ctx && Array.isArray(ctx.inviteKeys))
      && !(has(st.trust, String(m.epoch)) && st.trust[m.epoch].desks.some(d => d.keyId === m.writer))) { unpend(m.id); return null; } /* plant:request-pass */
    const t = triesFor(m, ctx);
    let last = null;
    for (const x of t.tries) {
      if (x.refuse) { last = R(x.refuse); break; }
      const r = judge(blob, x.trust, m.epoch, x.key, floors);
      if (r.ok && x.asked && !(r.kind === "file" && r.path.toLowerCase() === ("desks/" + m.writer + "/join.json").toLowerCase()
        && Buffer.byteLength(r.body, "utf8") <= INVITE_UPLOAD_MAX)) { last = R("outside-place"); break; }
      if (r.ok) return { it, r };
      last = r;
      if (r.reason !== "bad-signature") break;
    }
    if (t.missing && signedUpload(it) && (!last || last.reason === "bad-signature")) { pend(it, floors0); return null; } /* plant:pending-sig */
    unpend(m.id);
    dropSaid("a file from " + m.writer, last || R("bad-signature"));
    return null;
  }

  /* AN INVITATION'S OWN PLACE (the joining bootstrap, slice 3's wrap in small), AND A DESK'S OWN COPY: what the lead sealed
     under one invitation's key alone, or under one desk's copy key alone, the team file for the desk that holds that key to
     read before it holds the team key of the file's epoch. The relay can tell the two apart, an invitation's place being
     an id on its own list of invitations, but not whose a desk's copy is (the header's EPOCH MOVE). A program that holds
     neither key for that place passes over it and says nothing: it is not its file, and one it cannot open there is
     expected. The desk that holds it opens it under that key and the pinned lead's signature alone, and takes from it the
     team file and nothing else; a deletion there is the relay's keep for the copy, never applied to the mirror. */
  function openInvited(it, blob, floors, ctx) {
    const m = it.meta;
    const seal = sealOf(m.place.slice(7), ctx);
    if (!seal || m.del === true) return null; /* plant:invite-pass */
    if (m.writer !== pin.lead.keyId) { dropSaid(seal.what, R("not-roster")); return null; }
    const r = judge(blob, leadTrust([]), m.epoch, seal.key, floors);
    if (!r.ok) { dropSaid(seal.what, r); return null; } /* plant:invite-judge */
    if (r.kind !== "file" || r.path !== TEAM_NAME) { dropSaid(seal.what, R("outside-place")); return null; }
    return { it, r };
  }
  function sealOf(id, ctx) {
    if (!ctx) return null;
    if (ctx.inviteSeal && ctx.inviteId === id) return { key: ctx.inviteSeal, what: "a file in this desk's invitation" };
    if (ctx.own && ctx.own.id === id) return { key: ctx.own.key, what: "this desk's own copy of the team file" }; /* plant:own-copy */
    return null;
  }

  /* The newest of each path in `list` (by epoch, then counter), the rest of that path left: older copies in one batch. */
  function landNewest(list, out) {
    const best = new Map();
    for (const x of list) {
      const k = x.r.path.toLowerCase();
      const had = best.get(k);
      if (!had || later(x.r, had.r)) best.set(k, x);
    }
    for (const x of list) {
      if (best.get(x.r.path.toLowerCase()) !== x) { unpend(x.r.id); continue; }
      unpend(x.r.id);
      const landed = land(x.r);
      if (landed.ok && !landed.stale) out.applied.push(x.r.path);
    }
  }

  /* A batch from the relay in its order: the lead's blobs opened first, the newest team file applied, then the lead's other
     root files, then the desks' files judged under the roster that team file gave. Counters are judged against the floors
     as they stood when the batch began, so the order of application cannot refuse a blob the order of upload would take;
     a path takes only its newest blob of the batch. */
  function applyBatch(items, ctx0) {
    const out = { applied: [], team: false };
    if (!pin) return out;
    const held = trustFromMirror();
    /* A desk's own copy is named once a batch, from the team file it holds as the batch begins. */
    const ctx = ctx0 ? Object.assign({}, ctx0, { own: ownCopy(held, ctx0) }) : ctx0;
    const floors0 = Object.assign({}, st.counters);
    const lead = [], rest = [];
    for (const it of items || []) {
      if (!it || !table(it.meta)) continue;
      if (it.meta.writer === pin.lead.keyId && signedUpload(it)) st.leadEpoch = Math.max(st.leadEpoch, it.meta.epoch); /* plant:lead-epoch */
      (it.meta.writer === pin.lead.keyId ? lead : rest).push(it);
    }
    const opened = [];
    for (const it of lead) { const x = openOne(it, floors0, ctx); if (x) opened.push(x); }
    const teams = opened.filter(x => x.r.kind === "file" && x.r.path === TEAM_NAME);
    if (teams.length) {
      const top = teams.reduce((a, b) => (later(b.r, a.r) ? b : a));
      for (const x of teams) unpend(x.r.id);
      const landed = landTeam(top.r, ctx); /* plant:team-first */
      if (!landed.ok) dropSaid(TEAM_NAME, landed);
      else if (!landed.same && !landed.stale) { out.team = true; out.applied.push(TEAM_NAME); }
    }
    landNewest(opened.filter(x => !(x.r.kind === "file" && x.r.path === TEAM_NAME)), out);
    const desks = [];
    for (const it of rest) { const x = openOne(it, floors0, ctx); if (x) desks.push(x); }
    landNewest(desks, out);
    persist();
    return out;
  }

  /* ---- out ---- */

  function considerOutgoing(rel, bytes) {
    const name = String(rel || "");
    if (TMP_RE.test(name)) return { send: false, reason: "tmp", said: B.REASONS.tmp }; /* plant:out-tmp */
    const p = B.checkPath(name);
    const key = p.ok ? p.path : name;
    const a = has(st.applied, key) ? st.applied[key] : null;
    let echo = !!a && !a.del && clock() - a.at < ECHO_MS;
    if (echo && bytes != null) echo = sha256(toBytes(bytes)) === a.sha;
    if (echo) return { send: false, reason: "echo", said: B.REASONS.echo }; /* plant:out-echo */
    return { send: true };
  }

  /* What this program owes the relay from its own place: each whole file whose bytes differ from the last it sent, and a
     deletion for each it sent that is gone. On the lead's side, the team file once more under each live invitation's key,
     and once more for each desk its roster names, under that desk's copy key. */
  function owed(me, ctx) {
    const ops = [];
    if (!pin || !me) return ops;
    const here = new Map();
    for (const rel of io.list()) {
      if (TMP_RE.test(rel) || !inPlace(me.place, rel)) continue;
      const p = B.checkPath(rel);
      if (!p.ok) continue;
      here.set(p.path.toLowerCase(), p.path);
      const bytes = io.read(p.path);
      if (bytes == null) continue;
      const sha = sha256(bytes);
      const was = has(st.sent, p.path) ? st.sent[p.path] : null;
      if (was && !was.del && was.sha === sha) continue;
      const stopped = has(st.refused, p.path) ? st.refused[p.path] : null;
      if (stopped && stopped.sha === sha) continue; /* plant:refused-skip */
      if (!considerOutgoing(p.path, bytes).send) continue;
      let text;
      try { text = UTF8.decode(bytes); }
      catch { say(p.path + " is not text, so it stays on this computer"); st.refused[p.path] = { sha, why: "not-text" }; continue; }
      ops.push({ rel: p.path, kind: "file", body: text, sha });
    }
    for (const rel of Object.keys(st.sent)) {
      const was = st.sent[rel];
      if (!was.del && !here.has(rel.toLowerCase()) && inPlace(me.place, rel)) ops.push({ rel, kind: "delete", body: "", sha: null }); /* plant:out-delete */
    }
    const agrees = !!ctx && typeof ctx.agree === "function";
    if (me.place === "root" && ctx && (Array.isArray(ctx.inviteKeys) || agrees)) {
      const bytes = here.has(TEAM_NAME) ? io.read(TEAM_NAME) : null;
      const held = bytes ? judgedBytes(bytes) : null;
      const copies = (Array.isArray(ctx.inviteKeys) ? ctx.inviteKeys : []).concat(held ? deskCopies(held.doc, ctx) : []);
      const live = new Set();
      for (const k of copies) {
        live.add(k.id);
        const was = has(st.sentInv, k.id) ? st.sentInv[k.id][TEAM_NAME] : null;
        if (!bytes) continue;
        const sha = sha256(bytes);
        if (!was || was.del || was.sha !== sha)
          ops.push({ rel: TEAM_NAME, kind: "file", body: bytes.toString("utf8"), sha, invite: k, place: "invite:" + k.id });
      }
      /* An invitation no longer live, its desk enrolled or the invitation dropped, or a desk the roster no longer names: its
         copy superseded by a deletion. Where desks have copies, never while the lead's own team file does not read, so no
         desk's copy is let go for want of it. */
      if (!agrees || held) for (const id of Object.keys(st.sentInv)) {
        const was = st.sentInv[id][TEAM_NAME];
        if (!live.has(id) && was && !was.del)
          ops.push({ rel: TEAM_NAME, kind: "delete", body: "", sha: null, invite: { id, key: null }, place: "invite:" + id }); /* plant:invite-drop */
      }
    }
    return ops;
  }

  function nextCounter() {
    st.own = Math.max(st.own + 1, Math.floor(clock()));
    persist();
    return st.own;
  }

  function lastSent(op) {
    if (op.invite) { const h = op.invite.id; return has(st.sentInv, h) && has(st.sentInv[h], op.rel) ? st.sentInv[h][op.rel] : null; }
    return has(st.sent, op.rel) ? st.sent[op.rel] : null;
  }

  /* A file owed, sealed and signed: the next counter, the blob it replaces named so the relay keeps one per chain. */
  function sealOut(op, me, sealing) {
    const was = lastSent(op);
    const blob = B.seal({ relayTeamId: pin.rt, epoch: sealing.epoch, teamKey: sealing.key, writer: { keyId: me.keyId, privateKey: me.privateKey },
      path: op.rel, body: op.body, counter: nextCounter(), place: op.place ? null : me.place, kind: op.kind, supersedes: was ? was.id : null });
    if (op.place) blob.place = op.place;
    return blob;
  }

  function sentOut(op, blob) {
    const rec = { id: blob.id, epoch: blob.epoch, counter: blob.counter, sha: op.sha, size: blob.ciphertext.length, del: op.kind === "delete" };
    const was = lastSent(op);
    if (op.invite) {
      const h = op.invite.id;
      st.sentInv[h] = Object.assign({}, st.sentInv[h] || {}, { [op.rel]: rec });
    } else {
      st.sent[op.rel] = rec;
      st.bytes = Math.max(0, st.bytes - (was ? was.size : 0)) + rec.size;
      delete st.refused[op.rel];
    }
    waiting.delete(op.invite ? "invite:" + op.invite.id : op.rel);
    if (op.byInvite) st.invited = true;
    persist();
  }

  /* A chain the relay let go (the header's OUT): the id of the deletion this program last sent for that path or copy, where
     the file owed there now is one written again after it; else null. */
  function sentDeletion(op) {
    const was = lastSent(op);
    return op.kind === "file" && was && was.del ? was.id : null;
  }
  /* That deletion forgotten, the relay having said it lapsed: the file goes as the first of a chain of its own. True where
     it was still the last this program sent there. */
  function unchain(op, id) {
    const was = lastSent(op);
    if (op.kind !== "file" || !was || !was.del || was.id !== id) return false;
    if (op.invite) {
      delete st.sentInv[op.invite.id][op.rel];
      if (!Object.keys(st.sentInv[op.invite.id]).length) delete st.sentInv[op.invite.id];
    } else {
      delete st.sent[op.rel];
      st.bytes = Math.max(0, st.bytes - was.size);
    }
    persist();
    return true;
  }

  /* An upload refused: one that cannot lift (STOPS) stops that file until its bytes change; any other waits, the file left
     owed for the next cycle (F4). Each is said, a wait once while it lasts. A copy of the team file the lead owes a desk or
     an invitation always waits, so its refusal never stops the lead's own team file of the same bytes. True where it waits. */
  function refusedOut(op, r) {
    const key = op.invite ? "invite:" + op.invite.id : op.rel;
    let waits = !!op.invite;
    if (STOPS.indexOf(r.reason) < 0) waits = true; /* plant:refused-waits */
    if (waits) {
      if (waiting.get(key) !== r.reason) {
        waiting.set(key, r.reason);
        say((op.invite ? "a copy of " + op.rel + " for one desk or invitation" : op.rel) + " waits, and goes once this lifts: " + r.said);
      }
      return true;
    }
    waiting.delete(key);
    if (op.sha) st.refused[op.rel] = { sha: op.sha, why: r.reason };
    persist();
    say(op.rel + " was not sent: " + r.said);
    return false;
  }

  /* The contract's limits before an upload: the blob's size, the team's space as this program counts it, the rate. */
  function allowUpload(blob, deviceId, keep) {
    const ct = blob && toBytes(blob.ciphertext);
    const size = ct ? ct.length : 0;
    const big = B.checkBlobSize(size);
    if (!big.ok) return big; /* plant:out-size */
    const team = B.checkTeamSize(st.bytes, size, teamMax);
    if (!team.ok) return team; /* plant:out-team */
    const id = String(deviceId || "device");
    const rate = B.checkRate(rates.get(id), clock());
    if (!rate.ok) return rate; /* plant:out-rate */
    rates.set(id, rate.stamps);
    if (keep === true) st.bytes = team.used;
    return { ok: true };
  }

  /* The head in this mirror, read again and verified. A missing or bad file shows nothing, and nothing is blocked. */
  function headNews(now) {
    const none = { shown: false, blocked: false, time: null, epoch: null, rev: null, ageMs: null, edition: null, published: null };
    if (!pin) return none;
    const raw = io.read(HEAD_NAME);
    if (raw == null) return none;
    let text;
    try { text = UTF8.decode(toBytes(raw)); } catch { return none; }
    const h = headJudged(text, false);
    if (!h.ok) return none;
    const at = Number.isFinite(now) ? now : clock();
    return { shown: true, blocked: false, time: h.t, epoch: h.epoch, rev: h.rev, ageMs: at - h.t,
      edition: h.edition, published: h.published };
  }

  /* The head shown by its signed time, never as a block: only one the pinned lead signed for this relay. */
  function showFreshness(input) {
    const i = input || {};
    const none = { shown: false, blocked: false, time: null, epoch: null, rev: null, ageMs: null };
    const head = i.head;
    if (!pin || !table(head) || !table(head.sig)) return none;
    if (head.keyId !== pin.lead.keyId || head.relay !== pin.rt) return none;
    let bytes;
    try { bytes = Buffer.concat([Buffer.from(HEAD_PREFIX, "utf8"), signedBytes(head)]); } catch { return none; }
    if (!B.verifySig(pin.lead.public, bytes, head.sig.value) || !Number.isFinite(head.time)) return none;
    const now = Number.isFinite(i.now) ? i.now : clock();
    return { shown: true, blocked: false, time: head.time, epoch: head.epoch, rev: head.rev, ageMs: now - head.time };
  }

  /* On the relay the ring is the signed team file's own, or none; a ring file beside it is never read (E4). */
  function readRing(input) {
    const i = input || {};
    const doc = i.teamDoc;
    if (!(table(doc) && table(doc.channel) && doc.channel.kind === "relay"))
      return { source: i.looseRing ? "loose" : "none", ring: i.looseRing || null };
    const t = teamJudged(doc);
    return t.ok && table(doc.ring) ? { source: "team", ring: doc.ring } : { source: "none", ring: null };
  }

  function readMirror(rel) {
    const b = io.read(rel);
    return b == null ? null : toBytes(b).toString("utf8");
  }

  return {
    setPin, pinned: () => pin, loadTeamFile, holdTeam, acceptBlob, applyBatch, considerOutgoing, owed, sealOut, sentOut, refusedOut,
    sentDeletion, unchain, allowUpload, showFreshness, headNews, readRing, readMirror, nextCounter, teamEpoch,
    state: () => st,
    setSeq(n) { if (Number.isSafeInteger(n) && n > st.seq) { st.seq = n; persist(); } },
    markTokenUsed() { st.tokenUsed = true; persist(); },
    pending: () => st.pending.slice(),
    unpend(id) { unpend(id); persist(); },
  };
}

/* ---- the channel: the relay and the mirror's watch ------------------------------------------------------------- */

/* `o`: rt, url (https, ending /relay/v1), mirror, stateFile; me() as {keyId, public, privateKey, place, box}, box a desk's
   X25519 public key as 64 hex; pin() as {teamId, rt, lead}; keyFor(epoch) a team key or null; sealEpoch() the epoch to seal
   under; invite() on a desk joining by invitation as {inv, token, seal, box}, box the lead's box as 64 hex where the
   invitation names it; inviteKeys() on the lead's side, the live
   invitations as {id, key}; agree(box) the 32-byte X25519 agreement of this program's own box with another's, given as 64
   hex, or null: the lead's with a desk's, a desk's with the lead's, for a desk's own copy of the team file; request(method,
   url, headers, body) answering {status, header(name), bytes} and throwing where the relay does not answer; connect(url,
   headers, {message, close}) a socket or null; write(abs, text) the shell's atomic write; say(line); onTeam() after a team
   file lands; clock. */
function createChannel(opts) {
  const o = opts || {};
  const mirror = path.resolve(o.mirror);
  const clock = typeof o.clock === "function" ? o.clock : Date.now;
  const say = typeof o.say === "function" ? o.say : () => {};
  const io = o.io || diskIO(mirror, o.write);
  const stateFile = o.stateFile;
  const saveState = s => {
    const text = JSON.stringify(s);
    if (typeof o.write === "function") o.write(stateFile, text); else writeWhole(stateFile, text);
  };
  const prog = createProgram({ io, clock, say, load: () => readState(stateFile), save: stateFile ? saveState : null, pin: o.pin && o.pin() });
  const base = String(o.url || "").replace(/\/+$/, "") + "/t/" + o.rt + "/";
  const pollMs = Number.isFinite(o.pollMs) ? o.pollMs : POLL_MS;
  let session = null, sock = null, running = false, busy = null, again = false, backoff = RETRY_MIN_MS;
  let watchers = [], settle = null, retryTimer = null, pollTimer = null, pingTimer = null, watchMode = "";
  const said = new Set();
  const sayOnce = line => { if (!said.has(line)) { said.add(line); say(line); } };

  function ctx() {
    const inv = typeof o.invite === "function" ? o.invite() : null;
    const who = typeof o.agree === "function" ? me() : null;
    return {
      agree: typeof o.agree === "function" ? peer => o.agree(peer) : null,
      self: who && typeof who.place === "string" ? { place: who.place, box: typeof who.box === "string" ? who.box : "" } : null,
      keyFor: e => (typeof o.keyFor === "function" ? o.keyFor(e) : null),
      inviteSeal: inv && toBytes(inv.seal) && inv.seal.length === 32 ? toBytes(inv.seal) : null,
      inviteId: inv && HEX32.test(String(inv.inv)) ? inv.inv : null,
      inviteBox: inv && HEX64.test(String(inv.box)) ? inv.box : null,
      inviteKeys: typeof o.inviteKeys === "function" ? (o.inviteKeys() || [])
        .filter(k => table(k) && HEX32.test(String(k.id)) && toBytes(k.key) && toBytes(k.key).length === 32)
        .map(k => ({ id: k.id, key: toBytes(k.key) })) : null,
      onTeam: () => { if (typeof o.onTeam === "function") o.onTeam(); },
    };
  }
  const me = () => (typeof o.me === "function" ? o.me() : null);

  function refusalOf(r) {
    const j = r && r.json;
    const reason = j && typeof j.error === "string" && has(B.REASONS, j.error) ? j.error : null;
    return reason ? R(reason) : { ok: false, reason: "status-" + (r ? r.status : 0), said: "The relay answered " + (r ? r.status : 0) + ".", served: false };
  }

  async function call(method, rel, c) {
    const x = c || {};
    const headers = {};
    if (x.auth && session) headers.authorization = "Bearer " + session.token;
    if (x.meta) headers["etiuda-blob"] = Buffer.from(JSON.stringify(x.meta), "utf8").toString("base64url");
    let body;
    if (x.json !== undefined) { body = Buffer.from(JSON.stringify(x.json), "utf8"); headers["content-type"] = "application/json"; }
    if (x.bytes) { body = x.bytes; headers["content-type"] = "application/octet-stream"; }
    const res = await o.request(method, base + rel, headers, body);
    const bytes = toBytes(res && res.bytes) || Buffer.alloc(0);
    let json = null, meta = null;
    try { json = JSON.parse(bytes.toString("utf8")); } catch { json = null; }
    const h = res && typeof res.header === "function" ? res.header("etiuda-blob") : null;
    if (typeof h === "string" && h) { try { meta = JSON.parse(Buffer.from(h, "base64url").toString("utf8")); } catch { meta = null; } }
    return { status: res.status, json, bytes, meta };
  }

  /* A session by this program's own key, or, where the relay does not know that key yet, by the invitation's token, which
     the relay spends at its first use. */
  async function openSession() {
    session = null;
    const ch = await call("POST", "hello", { json: {} });
    if (ch.status !== 200 || !ch.json || !HEX32.test(String(ch.json.challenge))) return refusalOf(ch);
    const who = me();
    let why = R("not-enrolled");
    if (who && who.privateKey) {
      const sig = crypto.sign(null, helloBytes(o.rt, ch.json.challenge, who.keyId), who.privateKey).toString("hex");
      const r = await call("POST", "session", { json: { challenge: ch.json.challenge, key: who.keyId, sig } });
      if (r.status === 200 && r.json && HEX64.test(String(r.json.session))) {
        /* The invitation's session again, where this key was bound by the token's one session and the request is not yet in
           (N4): a request lost on the way, or a quit before it went, is sent again without the token. */
        session = { token: r.json.session, at: clock(), by: r.json.invite === true ? "invite" : "key" }; /* plant:n4-resume */
        return { ok: true };
      }
      why = refusalOf(r);
      if (why.reason !== "not-enrolled") return why;
    }
    const inv = typeof o.invite === "function" ? o.invite() : null;
    if (!inv || prog.state().tokenUsed || !HEX32.test(String(inv.inv)) || typeof inv.token !== "string") return why;
    /* The token's hello names this desk's key and is signed by it, so the relay binds that key to the invitation it spends. */
    const bind = who && who.privateKey && /^[0-9a-f]{64}$/.test(String(who.public))
      ? { key: who.keyId, pub: who.public, sig: crypto.sign(null, helloBytes(o.rt, ch.json.challenge, who.keyId), who.privateKey).toString("hex") }
      : {};
    const r = await call("POST", "session", { json: Object.assign({ challenge: ch.json.challenge, invite: inv.token, inv: inv.inv }, bind) });
    if (r.status === 200 && r.json && HEX64.test(String(r.json.session))) {
      prog.markTokenUsed();
      session = { token: r.json.session, at: clock(), by: "invite" };
      return { ok: true };
    }
    const t = refusalOf(r);
    if (t.reason === "token-spent") prog.markTokenUsed();
    return t;
  }

  /* A session by this program's own key alone, the one held kept where the relay does not know that key yet. */
  async function keySession() {
    const who = me();
    if (!who || !who.privateKey) return R("not-enrolled");
    const ch = await call("POST", "hello", { json: {} });
    if (ch.status !== 200 || !ch.json || !HEX32.test(String(ch.json.challenge))) return refusalOf(ch);
    const sig = crypto.sign(null, helloBytes(o.rt, ch.json.challenge, who.keyId), who.privateKey).toString("hex");
    const r = await call("POST", "session", { json: { challenge: ch.json.challenge, key: who.keyId, sig } });
    if (r.status !== 200 || !r.json || !HEX64.test(String(r.json.session))) return refusalOf(r);
    session = { token: r.json.session, at: clock(), by: "key" };
    return { ok: true };
  }

  /* An invitation's session serves one upload; once that is made, each cycle asks whether the lead has enrolled this key. */
  async function ensureSession() {
    if (session && session.by === "invite" && prog.state().invited) {
      const k = await keySession();
      if (k.ok || k.reason !== "not-enrolled") return k;
    }
    if (session && clock() - session.at < SESSION_KEEP_MS) return { ok: true };
    return openSession();
  }

  /* A call under the session; a 401 re-opens it once, since a session lapses after 30 minutes. */
  async function authed(method, rel, c) {
    const s = await ensureSession();
    if (!s.ok) return { status: 0, refused: s };
    let r = await call(method, rel, Object.assign({ auth: true }, c));
    if (r.status === 401) {
      const again = await openSession();
      if (!again.ok) return { status: 0, refused: again };
      r = await call(method, rel, Object.assign({ auth: true }, c));
    }
    return r;
  }

  /* Everything after this program's place in the sequence, fetched, then judged and applied in the catch-up's order. Its
     own uploads are skipped: the mirror already holds them. */
  async function catchUp() {
    const who = me();
    for (let round = 0; round < 1000; round++) {
      const st = prog.state();
      const r = await authed("GET", "since/" + st.seq);
      if (r.status !== 200 || !Array.isArray(r.json)) return r.refused || refusalOf(r);
      const items = [];
      let top = st.seq;
      for (const e of r.json) {
        if (!table(e) || !Number.isSafeInteger(e.seq) || e.seq <= top || !table(e.meta)) continue;
        const before = top;
        top = e.seq;
        const m = e.meta;
        if (who && m.writer === who.keyId) continue;
        if (!Number.isSafeInteger(m.size) || m.size < 0 || !HEX32.test(String(m.id))) { sayOnce("a file the relay listed was left out: " + B.REASONS["bad-signature"]); continue; }
        if (m.size > B.BLOB_MAX) { say("a file from " + m.writer + " was left out: " + B.REASONS["blob-size"]); continue; } /* plant:in-size-listed */
        const got = await authed("GET", "b/" + m.id);
        /* Not served for a reason that can pass (see gone): what came before it is applied and the next cycle asks from it. */
        if (got.status !== 200 && !gone(got)) { prog.applyBatch(items, ctx()); prog.setSeq(before); return got.refused || refusalOf(got); } /* plant:fetch-kept */
        if (got.status !== 200) continue;
        items.push({ seq: e.seq, meta: table(got.meta) && got.meta.id === m.id ? got.meta : m, ct: got.bytes });
      }
      prog.applyBatch(items, ctx());
      prog.setSeq(top);
      if (r.json.length < SINCE_MAX) return { ok: true };
    }
    return { ok: true };
  }

  /* Blobs left for want of a key, fetched again once a key for their epoch is held, each judged against the floor that
     stood when it first arrived. */
  async function retryPending() {
    const c = ctx();
    const ready = prog.pending().filter(p => c.keyFor(p.epoch));
    if (!ready.length) return;
    const items = [];
    for (const p of ready) {
      const got = await authed("GET", "b/" + p.id);
      if (got.status === 200 && table(got.meta) && got.meta.id === p.id) items.push({ seq: p.seq, meta: got.meta, ct: got.bytes, floor: p.floor });
      else if (got.status === 200 || gone(got)) prog.unpend(p.id); /* plant:pending-kept */
    }
    if (items.length) prog.applyBatch(items, c);
  }

  /* What a file owed is sealed under: the team key of the newest epoch held; before that, on a desk joining by invitation,
     its one request under the invitation's key at the lead's newest epoch the relay listed. Under a team key, never an
     epoch older than the team file this program holds (`floor`), so a desk taken off at that file's move, holding the old
     key, opens nothing sent after it, the new team file above all. A copy in an invitation's or a desk's own place goes as
     it is: nobody else holds its key, and the deletion that lets one go names only the team file and carries no body.
     Null: it waits. */
  function sealingFor(op, who, floor) {
    if (op.invite) {
      const e = typeof o.sealEpoch === "function" ? o.sealEpoch() : null;
      const key = op.invite.key || (isCount(e) && typeof o.keyFor === "function" ? o.keyFor(e) : null);
      return isCount(e) && key ? { epoch: e, key } : null;
    }
    if (session && session.by === "invite") {
      const inv = ctx().inviteSeal, st = prog.state();
      const mine = ("desks/" + who.place.slice(5) + "/join.json").toLowerCase();
      if (!inv || st.invited || op.kind !== "file" || op.rel.toLowerCase() !== mine || Buffer.byteLength(op.body, "utf8") > INVITE_UPLOAD_MAX) return null;
      return { epoch: Math.max(1, st.leadEpoch), key: inv, byInvite: true };
    }
    const e = typeof o.sealEpoch === "function" ? o.sealEpoch() : null;
    const key = isCount(e) && typeof o.keyFor === "function" ? o.keyFor(e) : null;
    if (isCount(e) && e < floor) return null; /* plant:seal-floor */
    return key ? { epoch: e, key } : null;
  }

  /* One file owed, sealed, held to the limits and put: {ok}; {lim} where a limit held it; {r, why} where the relay did not
     take it. */
  async function upload(op, who, sealing) {
    const blob = prog.sealOut(op, who, sealing);
    const lim = prog.allowUpload(blob, who.keyId);
    if (!lim.ok) return { lim };
    const meta = { v: 1, id: blob.id, supersedes: blob.supersedes, epoch: blob.epoch, writer: blob.writerKeyId, counter: blob.counter,
      del: blob.deletion, sig: blob.signature, nonce: blob.nonce, place: blob.place };
    if (sealing.byInvite) meta.pub = who.public;
    const r = await authed("PUT", "b/" + blob.id, { meta, bytes: blob.ciphertext });
    if (r.status === 200) { prog.sentOut(op, blob); return { ok: true }; }
    return { r, why: r.refused || refusalOf(r) };
  }

  /* A file written again after its deletion, refused as superseded: true where the relay says of that deletion's own id that
     its keep is over, or that it is gone, and the program has forgotten it. No blob of that chain is served then, so the
     file goes as the first of a chain of its own and forks nothing. Where the relay says the deletion was superseded, a
     newer blob of the chain is live, and the file waits as any refusal that lifts. */
  async function lapsed(op) {
    const id = prog.sentDeletion(op);
    if (!id) return false;
    const got = await authed("GET", "b/" + id);
    if (got.status === 200) return false;
    const why = got.refused || refusalOf(got);
    return (why.reason === "expired" || why.reason === "missing") && prog.unchain(op, id);
  }

  async function flush() {
    const who = me();
    if (!who || !who.privateKey) return { ok: true };
    const floor = prog.teamEpoch();
    for (const op of prog.owed(who, ctx())) {
      const sealing = sealingFor(op, who, floor);
      if (!sealing) {
        const e = typeof o.sealEpoch === "function" ? o.sealEpoch() : null;
        if (isCount(e) && e < floor) sayOnce("what this computer sends waits for the team key of epoch " + floor + ", which its team file names");
        continue;
      }
      op.byInvite = !!sealing.byInvite;
      let u = await upload(op, who, sealing);
      if (u.why && u.why.reason === "superseded" && await lapsed(op)) u = await upload(op, who, sealing); /* plant:unchain */
      if (u.ok) continue;
      if (u.lim) { if (u.lim.reason === "rate") return u.lim; prog.refusedOut(op, u.lim); continue; }
      if (u.r.status === 0 || u.r.status >= 500 || ["rate", "no-hello", "nonce-stale", "hello-replay"].indexOf(u.why.reason) >= 0) return u.why;
      if (prog.refusedOut(op, u.why) && HALTS.indexOf(u.why.reason) >= 0) return { ok: true };
    }
    return { ok: true };
  }

  function onAnnounce(text) {
    let m = null;
    try { m = JSON.parse(String(text)); } catch { m = null; }
    if (table(m) && m.type === "new") kick(); /* plant:socket-kick */
  }

  function ensureSocket() {
    if (sock || !running || !session || typeof o.connect !== "function") return;
    const url = base.replace(/^https:/, "wss:") + "socket";
    let s = null;
    const handlers = {
      message: onAnnounce,
      close: () => { if (sock === s) { sock = null; clearInterval(pingTimer); pingTimer = null; if (running) setTimeout(kick, RETRY_MIN_MS); } },
    };
    try { s = o.connect(url, { authorization: "Bearer " + session.token }, handlers); } catch { s = null; }
    sock = s || null;
    if (sock && typeof sock.send === "function") {
      clearInterval(pingTimer);
      pingTimer = setInterval(() => { try { sock && sock.send(JSON.stringify({ type: "ping" })); } catch { /* the close says it */ } }, PING_MS);
      if (pingTimer.unref) pingTimer.unref();
    }
  }

  async function cycle() {
    const s = await ensureSession();
    if (!s.ok) return s;
    const c = await catchUp(); /* plant:catch-up-first */
    if (!c.ok) return c;
    await retryPending();
    const f = await flush();
    ensureSocket();
    return f;
  }

  function kick() {
    if (!running) return;
    if (busy) { again = true; return; }
    busy = (async () => {
      do {
        again = false;
        try {
          const r = await cycle();
          backoff = RETRY_MIN_MS;
          if (r && !r.ok && r.reason) sayOnce("the relay: " + r.said);
        } catch (e) {
          session = null;
          sayOnce("the relay does not answer, so this computer works on its mirror and keeps what it owes - " + (e && e.message));
          clearTimeout(retryTimer);
          if (running) { retryTimer = setTimeout(kick, backoff); if (retryTimer.unref) retryTimer.unref(); }
          backoff = Math.min(backoff * 2, RETRY_MAX_MS);
        }
      } while (again && running);
    })().finally(() => { busy = null; });
  }

  /* The mirror's watch: recursive where the platform has it (Windows; Linux on Node 20 and later), else one watch per
     folder, the tree walked again after each change so a new folder is watched too. Either way an event is only a prompt:
     the next cycle reads the files. */
  function onEvent(ev, name) {
    if (name && TMP_RE.test(String(name))) return;
    clearTimeout(settle);
    settle = setTimeout(() => { if (watchMode === "each") watchEach(); kick(); }, SETTLE_MS);
    if (settle.unref) settle.unref();
  }
  function closeWatchers() { for (const w of watchers) { try { w.close(); } catch { /* gone */ } } watchers = []; }
  function watchEach() {
    closeWatchers();
    const dirs = [];
    const walk = (d, depth) => {
      dirs.push(d);
      if (depth > 16) return;
      let names = [];
      try { names = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const n of names) if (n.isDirectory()) walk(path.join(d, n.name), depth + 1);
    };
    walk(mirror, 0);
    for (const d of dirs) {
      try { const w = fs.watch(d, onEvent); w.on("error", () => {}); watchers.push(w); } catch { /* the poll covers it */ }
    }
  }
  function watchMirror() {
    closeWatchers();
    if (o.watch === false) { watchMode = "none"; return; }
    if (o.watch !== "each") {
      try {
        const w = fs.watch(mirror, { recursive: true }, onEvent);
        w.on("error", () => {});
        watchers.push(w);
        watchMode = "recursive";
        return;
      } catch (e) {
        if (e && e.code !== "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM") say("the mirror " + mirror + " is not watched - " + e.message);
      }
    }
    watchMode = "each";
    watchEach();
  }

  function start() {
    if (running) return;
    fs.mkdirSync(mirror, { recursive: true });
    running = true;
    watchMirror();
    pollTimer = setInterval(() => { if (!sock) kick(); }, pollMs);
    if (pollTimer.unref) pollTimer.unref();
    kick();
  }

  async function stop() {
    running = false;
    clearTimeout(settle); clearTimeout(retryTimer); clearInterval(pollTimer); clearInterval(pingTimer);
    closeWatchers();
    if (sock) { try { sock.close(); } catch { /* gone */ } sock = null; }
    session = null;
    if (busy) await busy;
  }

  return {
    start, stop, kick,
    idle: async () => { while (busy) await busy; },
    program: prog, mirror, rt: o.rt,
    watchMode: () => watchMode,
    online: () => !!session,
    socketOpen: () => !!sock,
  };
}

module.exports = {
  TEAM_NAME, ECHO_MS, BRANCH_PREFIX, HEAD_PREFIX, INVITE_SEAL_INFO, DESK_COPY_INFO, INVITE_UPLOAD_MAX,
  canon, signedBytes, helloBytes, inviteSealKey, deskCopyOf, relayOf, rosterOf, branchIdOf, inPlace, diskIO, writeWhole, stateOf,
  createProgram, createChannel,
  /* The two signature kinds, each under its own prefix, so neither verifies as the other (E5). */
  verifyUploadSignature: (publicKey, payload, signature) => B.verifyUpload(publicKey, Buffer.alloc(0), toBytes(payload), signature),
  verifyDeskSignature: (publicKey, body, signature) => {
    const b = toBytes(body);
    return !!b && B.verifySig(publicKey, Buffer.concat([Buffer.from(BRANCH_PREFIX, "utf8"), b]), signature);
  },
};
