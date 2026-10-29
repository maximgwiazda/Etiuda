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
   newer epoch where an older loaded roster named the key. A later rev of an epoch that leaves off a key an earlier rev
   named removes it too. A desk file is counted under the roster row for the key that signed it, and a place the blob
   carries does not choose the folder or the row. A blob that passes is written into the mirror whole, by the atomic
   write the shell uses on a share; one that fails is dropped and said, never written. A deletion is only a signed
   record from the path's writer (E3), and a blob the
   relay stops serving deletes nothing. A blob it could not serve for a reason that can pass is fetched again, the catch-up
   resuming from it at the next cycle; only an answer that the blob is gone lets it go. A catch-up applies the team file
   first, then the other root files, then the desks', so nothing is judged against a roster older than the batch. The
   floors (each writer's counter per epoch, the team file's rev per team, lead key and epoch) and the place in the relay's
   sequence survive a restart.

   ITS OWN BLOBS (board 932 (2)). A blob is passed over in the catch-up as this computer's own only when this computer's own
   record shows it sent that blob id (the last upload of each path and of each copy), never because its writer is this key:
   a profile restored with no record fetches the team file and the rest back, and one key on two computers fetches the
   other's uploads. A blob of this key that the record does not show is judged and applied as anyone's is, and once more
   against the record: not later than what this computer last sent for the path, it is older and changes nothing; later,
   but the mirror holds neither its bytes nor what was last sent there, an edit is waiting to go up, which stays, the blob
   becoming the one that edit replaces. Else it is written and recorded as sent, so the next edit replaces it and the chain
   stays one. The record is the sent paths as before; no field is added, and a state written earlier reads as it did.

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

   THE LEAD'S ANSWER. After its one upload, an invitation's session fetches a single blob and nothing else of the team:
   answer:<invitation id>, which the lead writes on its own session, sealed to the desk's box. The desk opens that blob
   with its own box and says joined or refused. It does not list the team and it does not keep a socket on that session.
   Once the key is enrolled, the next hello is a device session and the invitation's token is dropped.

   THE LEAD'S EPOCH (F8 of the slice 1 review). A desk joining by invitation seals its one request at the newest epoch a
   verified lead blob has named. The relay's header names a writer and an epoch before any signature is checked, and that
   header moves nothing: leadEpoch rises only once the pinned lead's upload signature on the blob verifies.

   PENDING (F7 of the slice 1 review, and the roster follow-up). A blob is parked to wait for a key only once that same
   signature verifies. A desk key is parked only at an epoch a verified lead blob has named, and only while the newest
   roster still names that key. Anything else is dropped and said, and cannot fill the pending list or push an honest wait out.

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
/* What a desk says when its token hello is answered token-spent. An upload refused token-spent keeps the contract
   sentence: that refusal can lift (F4), and blob.REASONS stays the older wording. */
const INVITE_USED_SAID = "This invitation has already been used. Ask your lead for a new one.";
/* What a desk says when its token hello is answered invite-ended. The token is not spent: the end bounds an unused
   invitation only. This tree's relay does not say it yet; the desk says it when the answer names that error. */
const INVITE_ENDED_SAID = "This invitation has expired. Ask your lead for a new one.";
/* The label of a desk's own copy of the team file: its key and its place from one agreement of two boxes (deskCopyOf). */
const DESK_COPY_INFO = "etiuda-relay-desk-copy";
/* The label of the lead's answer to one invitation. One key, 32 bytes, and no place id: the blob's id is the invitation's. */
const ANSWER_INFO = "etiuda-join-answer";
const ANSWER_NAME = "join-answer.json";
/* The page shows this while a relay request waits. After the one upload the channel says the same line, once, where an
   enrolment fault would have been said. */
const WAITING_SAID = "Waiting for the team's lead to let this desk in. Nothing more is needed here, and the team's catalogs are already open to work with.";
const INVITE_UPLOAD_MAX = 64 * 1024;
const SINCE_MAX = 1000;
const PENDING_MAX = 1000;
const TAKEN_MAX = 4096;
const SESSION_KEEP_MS = 25 * 60 * 1000;
const SETTLE_MS = 300;
const POLL_MS = 60 * 1000;
const COUNTER_RETRY_MS = 60 * 1000;
const PING_MS = 30 * 1000;
const RETRY_MIN_MS = 2000, RETRY_MAX_MS = 60 * 1000;
const TMP_RE = /\.tmp$/i;
const HEX32 = /^[0-9a-f]{32}$/, HEX64 = /^[0-9a-f]{64}$/;
/* The relay's stamp of one copy of a team, told at each session (relay/core.cjs create). */
const MADE_RE = /^[0-9a-f]{16}$/;
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/* Reasons a judgement this program makes before an upload may record as a stop by content hash, and which a record
   read back may keep. Not text, a limit allowUpload holds, and a path check are that kind of judgement. A refusal the
   relay answers is not recorded, whatever its reason (C2): the file stays owed and goes again at the next cycle, and
   at a new session or a start. The program says once that it waits. */
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

/* THE LAPSE. A session's reply and since's etiuda-lapse header tell where the team stands by its grants: {state, until,
   readOnly, swept}, state one of LAPSE_STATES (relay/core.cjs lapseOf). A hello's until less RELAY_CHALLENGE_MS is the
   relay's own time when it answered, so the step is judged by the relay's clock and not this computer's. */
const LAPSE_STATES = ["working", "read-only", "lapsed", "gone", "unknown"];
const RELAY_CHALLENGE_MS = 5 * 60 * 1000;
const instantOrNull = v => v === null || Number.isSafeInteger(v);
/* The lapse as told, or null where it is not that shape. */
function lapseKept(v) {
  if (!table(v) || LAPSE_STATES.indexOf(v.state) < 0 || !instantOrNull(v.until) || !instantOrNull(v.readOnly) || !instantOrNull(v.swept)) return null;
  return { state: v.state, until: v.until, readOnly: v.readOnly, swept: v.swept };
}
/* The step a lapse is at by the relay's time `now`: "grace" (working past the grant's end, read-only from readOnly),
   "read-only", "lapsed" (renewal alone) or "gone"; null while the team works inside its grant, or where nothing was told. */
function lapseStep(lapse, now) {
  const l = lapseKept(lapse);
  if (!l) return null;
  if (l.state !== "working") return l.state;
  if (l.until === null || l.readOnly === null || !Number.isFinite(now)) return null;
  let inside = false;
  inside = now < l.until; /* plant:lapse-inside */
  return inside ? null : "grace";
}
/* The key every path map uses. The same fold as checkPath, so a path that differs only in case is one file.
   A path checkPath refuses keeps the text it was given, and is not folded into another file. */
function pathKey(rel) {
  const p = B.checkPath(String(rel || ""));
  if (p.ok) return p.folded.join("/"); /* plant:path-key */
  return String(rel || "");
}

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

/* The wrap key of the same secret, under etiuda-invite-wrap. The desk derives it at yes and does not keep the secret. */
function inviteWrapKey(secretHex) { return B.inviteWrapKey(secretHex); }

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

/* The key the lead's answer is sealed under: 32 bytes of HKDF-SHA256 over the same agreement as a desk's copy, salt
   empty. `dh` is that agreement; an all-zero agreement makes nothing. The rest binds it to this invitation alone:
   the relay team, the invitation's id, the desk's id, the desk's box and the lead's box, all public. */
function answerKey(dh, f) {
  const d = toBytes(dh);
  if (!d || d.length !== 32 || d.every(b => b === 0)) return null;
  if (!table(f) || !HEX32.test(String(f.rt)) || !HEX32.test(String(f.inv)) || !/^k-[0-9a-f]{16}$/.test(String(f.deskId))
    || !HEX64.test(String(f.deskBox)) || !HEX64.test(String(f.leadBox))) return null;
  const info = Buffer.from([ANSWER_INFO, f.rt, f.inv, f.deskId, f.deskBox, f.leadBox].join("\n") + "\n", "utf8");
  return Buffer.from(crypto.hkdfSync("sha256", d, Buffer.alloc(0), info, 32));
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
  const lead = table(p.lead) ? p.lead : (table(p) && p.keyId && p.public ? { keyId: p.keyId, public: p.public } : {});
  if (typeof p.teamId !== "string" || !p.teamId || !B.isId(lead.keyId)
    || typeof lead.public !== "string" || !HEX64.test(lead.public)) return null;
  const rt = typeof p.rt === "string" && p.rt ? p.rt : null;
  return { teamId: p.teamId, rt: rt, lead: { keyId: lead.keyId, public: lead.public } };
}

/* A writer's place as blob.cjs judges it: the lead's everything but desks/, a desk's desks/<its id>/ and below. */
function inPlace(place, rel) {
  const role = place === "root" ? { role: "lead" }
    : typeof place === "string" && place.startsWith("desk:") ? { role: "desk", deskId: place.slice(5) } : null;
  return !!role && B.placeOf(rel, role, "file").ok;
}

/* ---- the mirror on disk ---------------------------------------------------------------------------------------- */

const RENAME_BUSY = ["EPERM", "EACCES", "EBUSY"];
const RENAME_RETRIES = 60;
const RENAME_WAIT_MS = 50;
function renamePatiently(from, to) {
  for (let i = 1; ; i++) {
    try { fs.renameSync(from, to); return; }
    catch (e) {
      if (i >= RENAME_RETRIES || RENAME_BUSY.indexOf(e.code) < 0) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_WAIT_MS);
    }
  }
}
/* Temp file then rename, as the shell writes a share. The shell passes its own writeReplacing in; this is the same act for
   a host that has none. The temp name is unique per write, fsynced before rename, and unlinked on failure. */
let tempCount = 0;
function writeWhole(file, text) {
  /* This process, a count of its own writes and random bytes: no thread id, since the shell loads no module it did not
     have (pick 5c). */
  tempCount = (tempCount + 1) % 1e9;
  const tmp = file + "." + process.pid + "." + tempCount + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
  try {
    fs.writeFileSync(tmp, text, "utf8");
    const fd = fs.openSync(tmp, "r+");
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    renamePatiently(tmp, file);
  }
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
    refused: {}, own: 0, bytes: 0, leadEpoch: 0, pending: [], tokenUsed: false, invited: false,
    tokenUsedIds: {}, invitedIds: {}, replyLostIds: {}, lostBlobs: {}, unkeptIds: {}, headT: null, lapse: null, skew: 0, made: null, suspect: false,
    pin: null, chain: null };
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
  s.lapse = lapseKept(x.lapse);
  if (Number.isSafeInteger(x.skew)) s.skew = x.skew;
  if (typeof x.made === "string" && MADE_RE.test(x.made)) s.made = x.made;
  s.suspect = x.suspect === true; /* plant:remade-ask-kept */
  s.tokenUsed = x.tokenUsed === true;
  s.invited = x.invited === true;
  const p = pinOf(x.pin);
  if (p) s.pin = p;
  if (Array.isArray(x.chain)) {
    s.chain = x.chain.filter(c => table(c) && B.isId(c.keyId) && HEX64.test(String(c.public)))
      .map(c => ({ keyId: c.keyId, public: c.public }));
  }
  const idSet = m => {
    const out = {};
    if (table(m)) for (const k of Object.keys(m)) if (HEX32.test(k) && m[k] === true) out[k] = true;
    return out;
  };
  s.tokenUsedIds = idSet(x.tokenUsedIds);
  s.invitedIds = idSet(x.invitedIds);
  s.replyLostIds = idSet(x.replyLostIds);
  if (table(x.lostBlobs)) for (const k of Object.keys(x.lostBlobs)) if (HEX32.test(k) && HEX32.test(String(x.lostBlobs[k] || ""))) s.lostBlobs[k] = String(x.lostBlobs[k]);
  s.unkeptIds = idSet(x.unkeptIds);
  for (const [name, prefix] of [["counters", "c\n"], ["revs", "r\n"]]) {
    if (table(x[name])) for (const k of Object.keys(x[name])) if (k.startsWith(prefix) && count(x[name][k])) s[name][k] = x[name][k];
  }
  if (table(x.trust)) for (const e of Object.keys(x.trust)) {
    const t = x.trust[e];
    if (/^[1-9][0-9]*$/.test(e) && table(t) && count(t.rev) && Array.isArray(t.desks)) {
      const row = d => table(d) && B.isId(d.deskId) && B.isId(d.keyId) && HEX64.test(String(d.public));
      const map = d => ({ deskId: d.deskId, keyId: d.keyId, public: d.public });
      s.trust[e] = { rev: t.rev, desks: t.desks.filter(row).map(map),
        prior: Array.isArray(t.prior) ? t.prior.filter(row).map(map) : [] };
    }
  }
  if (table(x.applied)) for (const k of Object.keys(x.applied)) {
    const a = x.applied[k];
    if (table(a) && B.isId(a.writer) && isCount(a.epoch) && isCount(a.counter) && typeof a.at === "number") {
      const key = pathKey(k);
      const rec = { writer: a.writer, epoch: a.epoch, counter: a.counter, id: String(a.id || ""), at: a.at,
        sha: typeof a.sha === "string" ? a.sha : null, del: a.del === true };
      if (!s.applied[key] || later(rec, s.applied[key])) s.applied[key] = rec;
    }
  }
  if (table(x.taken)) for (const k of Object.keys(x.taken)) {
    const t = x.taken[k];
    if (HEX32.test(k) && table(t) && typeof t.path === "string" && B.isId(t.writer)) s.taken[k] = { path: t.path, writer: t.writer };
  }
  const sentOf = m => {
    const o = {};
    if (table(m)) for (const k of Object.keys(m)) {
      const v = m[k];
      if (table(v) && HEX32.test(String(v.id)) && isCount(v.epoch) && isCount(v.counter) && count(v.size)) {
        const key = pathKey(k);
        const rec = { id: v.id, epoch: v.epoch, counter: v.counter, sha: typeof v.sha === "string" ? v.sha : null, size: v.size, del: v.del === true };
        if (v.owe === true) rec.owe = true;
        if (!o[key] || later(rec, o[key])) o[key] = rec;
      }
    }
    return o;
  };
  s.sent = sentOf(x.sent);
  if (table(x.sentInv)) for (const h of Object.keys(x.sentInv)) if (HEX32.test(h)) s.sentInv[h] = sentOf(x.sentInv[h]);
  /* A file stopped is kept with the refusal that stopped it; a record of any other, one written before F4 included, is let
     go, so a file a refusal that lifts once stopped goes again. */
  if (table(x.refused)) for (const k of Object.keys(x.refused)) {
    const r = x.refused[k];
    if (table(r) && typeof r.sha === "string" && STOPS.concat(["not-text"]).indexOf(r.why) >= 0) {
      const key = pathKey(k);
      if (!s.refused[key]) s.refused[key] = { sha: r.sha, why: r.why }; /* plant:refused-kept */
    }
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
    if (!best || e.rev >= best.rev) best = { catalog: e.catalog, rev: e.rev, edition: e.edition, published: published };
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
  let pin = pinOf((st && st.pin) || o.pin);
  const rates = new Map();
  /* What waits on a refusal that lifts, by path or copy, with the reason last said for it, so a wait is said once. */
  const waiting = new Map();
  /* A case variant left beside the one file its folded path sends, so that variant is said once. */
  const stayed = new Set();

  function chainLeads() {
    const out = [];
    const seen = new Set();
    const add = k => {
      if (k && B.isId(k.keyId) && HEX64.test(String(k.public)) && !seen.has(k.keyId)) {
        seen.add(k.keyId);
        out.push({ keyId: k.keyId, public: k.public });
      }
    };
    if (pin && pin.lead) add(pin.lead);
    if (Array.isArray(st.chain)) for (const k of st.chain) add(k);
    return out;
  }
  function isLeadKey(keyId) {
    return chainLeads().some(l => l.keyId === keyId);
  }
  function leadSigned(bytes, sigValue, prefix) {
    for (const l of chainLeads()) {
      if (B.verifySigned(l.public, prefix, bytes, sigValue)) return true;
    }
    return false;
  }
  const persist = () => { try { save(st); } catch (e) { say("the relay's record could not be kept - " + (e && e.message)); } };
  const revKey = t => ({ teamId: pin.teamId, leadKeyId: pin.lead.keyId, epoch: t.epoch, rev: t.rev });
  function leadTrust(desks) {
    const t = { lead: { keyId: pin.lead.keyId, public: pin.lead.public }, desks: desks || [] };
    t.leads = chainLeads(); /* plant:chain-trust */
    return t;
  }
  const dropSaid = (what, r) => { say(what + ": " + r.said); return r; };

  function setPin(p) {
    pin = pinOf(p);
    return pin ? { ok: true } : R("not-enrolled");
  }

  function followHandover(t) {
    if (!t) return;
    if (t.chain) st.chain = t.chain;
    if (t.handed) {
      pin = { teamId: pin.teamId, rt: pin.rt, lead: { keyId: t.doc.lead.keyId, public: t.doc.lead.public } }; /* plant:team-pin-move */
      st.pin = pin; /* plant:team-pin-save */
    }
  }

  /* A team file judged under the pin or a genuine handover: signed by the pinned lead's key or a new lead the handover
     proves; this team and this relay; an epoch and a rev. */
  function teamJudged(doc) {
    if (!pin) return R("wrong-team");
    if (!table(doc) || !table(doc.sig)) return R("bad-signature");
    let bytes;
    try { bytes = signedBytes(doc); } catch { return R("bad-signature"); }
    const lead = doc.lead;
    const leadDiffers = !lead || typeof lead !== "object" || lead.keyId !== pin.lead.keyId || lead.public !== pin.lead.public;
    if (leadDiffers && !B.handedTo(doc, pin.lead)) return R("bad-signature"); /* plant:team-handover */
    const signerPub = leadDiffers ? (lead && lead.public) : pin.lead.public;
    if (!B.verifySigned(signerPub, "", bytes, doc.sig.value)) return R("bad-signature"); /* plant:team-sig */
    const chain = B.genuineChain(doc, pin.lead) || (st && st.chain) || [{ keyId: pin.lead.keyId, public: pin.lead.public }];
    const isRelay = table(doc.channel) && doc.channel.kind === "relay";
    if (doc.kind !== "etiuda-team" || doc.id !== pin.teamId || (isRelay ? relayOf(doc) !== pin.rt : relayOf(doc) !== null)) return R("wrong-team"); /* plant:team-own */
    if (!isCount(doc.epoch) || (isRelay ? !isCount(doc.rev) : (doc.rev !== undefined && (!Number.isSafeInteger(doc.rev) || doc.rev < 0)))) return R("replay-rev");
    return { ok: true, doc, epoch: doc.epoch, rev: doc.rev, handed: leadDiffers, chain };
  }

  /* The head the lead's Studio writes. The pinned lead's signature over the head prefix, and this team's name.
     An older t than one already kept is left out. Whatever it says, the desk is not blocked. */
  function headJudged(body, floor) {
    if (!pin) return R("wrong-team");
    let doc = null;
    try { doc = JSON.parse(String(body).replace(/^\uFEFF/, "")); } catch { doc = null; }
    if (!table(doc) || !table(doc.sig)) return R("bad-signature");
    let bytes;
    try { bytes = signedBytes(doc); } catch { return R("bad-signature"); }
    if (!leadSigned(bytes, doc.sig.value, HEAD_PREFIX)) return R("bad-signature"); /* plant:head-sig */
    if (doc.v !== 1) return R("bad-signature");
    if (doc.team !== pin.teamId) return R("wrong-team");
    if (!isCount(doc.epoch) || !isCount(doc.rev) || !Number.isFinite(doc.t)) return R("bad-signature");
    const edition = newestEdition(doc.editions);
    if (!edition) return R("bad-signature");
    if (floor && Number.isFinite(st.headT) && doc.t < st.headT) return R("replay-counter");
    return { ok: true, t: doc.t, edition: edition.edition, published: edition.published, epoch: doc.epoch, rev: doc.rev };
  }

  /* The roster of this epoch at this rev. A higher rev keeps the keys the rev it replaces named, so leaving one off is a removal. */
  function keepTrust(t) {
    const had = st.trust[t.epoch];
    if (had && had.rev > t.rev) return;
    const desks = rosterOf(t.doc);
    const prior = had && Array.isArray(had.prior) ? had.prior.slice() : [];
    if (had && t.rev > had.rev) for (const d of had.desks || []) if (!prior.some(p => p.keyId === d.keyId)) prior.push(d);
    st.trust[t.epoch] = { rev: t.rev, desks, prior };
  }

  /* The contract's load: a team file above the rev floor for its team, lead key and epoch, the floor then raised. */
  function loadTeamFile(doc) {
    const t = teamJudged(doc);
    if (!t.ok) return t;
    followHandover(t);
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
      if (!Number.isSafeInteger(e) || e >= topEpoch) continue;
      const row = st.trust[k];
      if ((row.desks || []).some(d => d.keyId === writerKeyId)) return true;
      if ((row.prior || []).some(d => d.keyId === writerKeyId)) return true;
    }
    return false;
  }

  /* Once a newer epoch is loaded, a key it does not name is removed at every older epoch, so a file that key seals
     under the old team file is refused. At the newer epoch the same key is removed where an older loaded roster named
     it, and a later rev of one epoch removes a key an earlier rev of that epoch named. A stranger stays not-roster. */
  function removedAfterMove(writerKeyId, epoch, opened) {
    if (!pin || isLeadKey(writerKeyId) || !isCount(epoch)) return null;
    const top = newestRoster();
    if (!top || epoch > top.epoch) return null;
    if (top.desks.some(d => d.keyId === writerKeyId)) return null;
    const namedBefore = namedOnOlder(writerKeyId, top.epoch);
    if (epoch < top.epoch) return (opened || namedBefore) ? R("removed") : null; /* plant:fk1-removed */
    if (epoch !== top.epoch) return null;
    const row = st.trust[String(epoch)];
    const droppedHere = !!row && (row.prior || []).some(d => d.keyId === writerKeyId)
      && !(row.desks || []).some(d => d.keyId === writerKeyId);
    if (namedBefore || droppedHere) return R("removed"); /* plant:s2-remove */
    return null;
  }

  /* One blob judged: blob.cjs's first line under `trust` at `epoch` with `key`, against `floors`; a key the newest
     loaded epoch leaves off its roster is then removed, at an older epoch and at the newest where an older roster named
     it; then a supersedes that names a blob this program took must name one of the same path and writer. */
  function judge(blob, trust, epoch, key, floors, asked) {
    const r = B.openBlob({ blob, relayTeamId: pin.rt, epoch, teamKey: key, trust, counters: floors });
    if (r.ok || r.reason === "not-roster") {
      const writer = r.ok ? r.writerKeyId : (blob && blob.writerKeyId);
      const at = r.ok ? r.epoch : (isCount(blob && blob.epoch) ? blob.epoch : epoch);
      const ask = asked === true && r.ok && (r.kind === "delete" || (r.kind === "file" && Buffer.byteLength(r.body, "utf8") <= INVITE_UPLOAD_MAX))
        && r.path.toLowerCase() === ("desks/" + writer + "/join.json").toLowerCase();
      let gone = removedAfterMove(writer, at, r.ok);
      if (ask) gone = null; /* plant:ask-rejoin */
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
  function land(r, own) {
    const key = pathKey(r.path);
    const prev = has(st.applied, key) ? st.applied[key] : null;
    if (prev && prev.writer === r.writerKeyId && !later(r, prev)) return { ok: true, path: r.path, stale: true }; /* plant:stale-epoch */
    const held = own === true ? ownHeld(r, key) : null;
    if (held) return held;
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
    st.applied[key] = { writer: r.writerKeyId, epoch: r.epoch, counter: r.counter, id: r.id, at: clock(),
      sha: r.kind === "delete" ? null : sha256(Buffer.from(r.body, "utf8")), del: r.kind === "delete" };
    remember(r.id, { path: r.path, writer: r.writerKeyId });
    if (r.path === TEAM_NAME && r.kind === "file") st.leadEpoch = Math.max(st.leadEpoch, r.epoch);
    if (own === true) sentFrom(r, key);
    persist();
    return r.kind === "delete" ? { ok: true, deleted: true, path: r.path } : { ok: true, path: r.path };
  }

  /* A blob of this program's own key that its record does not show it sent, judged against that record before it is written.
     Not later than the last upload recorded for the path: older, and nothing changes. Later, but the mirror holds neither
     its bytes nor the bytes last sent there: an edit waits to go up. That edit stays; the blob is taken as the last sent,
     so the edit's upload replaces it and the path keeps one chain. Null: it is written as any blob is. The record keeps one
     upload a path, and the relay keeps one live blob a chain and takes a key's counters in order, so an older own blob is
     only ever one a relay put back or a fork a lost state left. */
  function ownHeld(r, key) {
    const base = has(st.sent, key) ? st.sent[key] : null;
    if (base && !later(r, base)) return { ok: true, path: r.path, stale: true }; /* plant:own-older */
    const now = io.read(r.path);
    const have = now == null ? null : sha256(toBytes(now));
    const want = r.kind === "delete" ? null : sha256(Buffer.from(r.body, "utf8"));
    const sent = base && !base.del ? base.sha : null;
    const edit = have !== want && have !== sent;
    if (edit) { sentFrom(r, key); persist(); return { ok: true, path: r.path, stale: true, kept: true }; } /* plant:own-edit */
    return null;
  }

  /* A counter this key already used, whether the blob landed or a newer one of its path passed over it. The next upload
     has to clear it, or the relay refuses the file as an older copy. */
  function noteOwn(r) {
    if (isCount(r && r.counter)) st.own = Math.max(st.own, r.counter); /* plant:own-counter */
  }

  /* This program's record taken to show it sent this blob, as sentOut does for an upload: the path's last upload, the bytes
     the team holds of it, and a counter the next upload will pass. */
  function sentFrom(r, key) {
    const was = has(st.sent, key) ? st.sent[key] : null;
    const rec = { id: r.id, epoch: r.epoch, counter: r.counter, sha: r.kind === "delete" ? null : sha256(Buffer.from(r.body, "utf8")),
      size: Number.isSafeInteger(r.size) && r.size >= 0 ? r.size : 0, del: r.kind === "delete" };
    st.sent[key] = rec;
    st.bytes = Math.max(0, st.bytes - (was ? was.size : 0)) + rec.size;
    delete st.refused[key];
    noteOwn(r);
  }

  /* The blob ids this program's record shows it sent: the last upload of each path and of each invitation's or desk's copy. */
  function wroteIds() {
    const ids = new Set();
    for (const k of Object.keys(st.sent)) ids.add(st.sent[k].id);
    for (const h of Object.keys(st.sentInv)) for (const k of Object.keys(st.sentInv[h])) ids.add(st.sentInv[h][k].id);
    return ids;
  }
  const ownOf = (c, r) => !!c && typeof c.mine === "string" && c.mine === r.writerKeyId;

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
    const landed = land(r);
    if (!landed.ok || landed.stale || landed.deleted) return landed;
    return receipt(r, t, b);
  }

  /* The roster row for the signing key. The place on the blob is the relay's word, and it does not choose the row. */
  function receipt(r, t, blob) {
    const row = rosterOf(t.doc).find(d => d.keyId === r.writerKeyId);
    let deskId = blob && typeof blob.place === "string" && blob.place.startsWith("desk:") ? blob.place.slice(5) : null;
    if (row) deskId = row.deskId; /* plant:s2-count */
    if (!row && r.role === "lead") deskId = null;
    return { ok: true, path: r.path, keyId: r.writerKeyId, deskId: deskId, rev: t.rev, epoch: t.epoch };
  }

  /* A team file arriving through the relay: the lead's, judged as a team file before it is written. The same bytes as the
     mirror's are nothing new; a lower or equal rev of other bytes is a replay, and so is an older epoch than the file
     the mirror already holds, whatever its rev. */
  function landTeam(r, ctx) {
    let doc = null;
    try { doc = JSON.parse(r.body.replace(/^\uFEFF/, "")); } catch { doc = null; }
    const t = teamJudged(doc);
    if (!t.ok) return t;
    followHandover(t);
    const sha = sha256(Buffer.from(r.body, "utf8"));
    const prev = has(st.applied, TEAM_NAME) ? st.applied[TEAM_NAME] : null;
    if (prev && !prev.del && prev.sha === sha) {
      st.counters = B.raiseCounter(st.counters, r.writerKeyId, r.epoch, r.counter);
      /* After a start over, this key's own team file of the same bytes, newer than the one recorded, is the one the relay holds. */
      const mine = has(st.sent, TEAM_NAME) ? st.sent[TEAM_NAME] : null;
      if (ownOf(ctx, r) && mine && mine.owe === true && later(r, mine)) sentFrom(r, TEAM_NAME);
      persist();
      return { ok: true, path: TEAM_NAME, same: true };
    }
    const held = heldTeam();
    if (held && t.epoch < held.epoch) return R("replay-rev"); /* plant:epoch-hold */
    const lr = B.revLoad(st.revs, revKey(t));
    if (!lr.ok) return lr; /* plant:team-rev */
    const landed = land(r, ownOf(ctx, r));
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
    if (t) { followHandover(t); keepTrust(t); }
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

  /* The public key of a writer this program trusts: the pinned lead, any key on its handover chain, or a desk one roster it already holds names, and
     only where that key id is a single public key. A public key the blob itself carries is not trust. */
  function trustedPub(writer) {
    if (!pin || !B.isId(writer)) return null;
    const lead = chainLeads().find(l => l.keyId === writer);
    if (lead) return lead.public;
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
    const lead = isLeadKey(m.writer);
    const rostered = known && st.trust[m.epoch].desks.some(d => d.keyId === m.writer);
    /* A key the roster already names, by a yes the relay refused, still asks or withdraws under the invitation's key. */
    let asking = !rostered;
    asking = !rostered || st.trust[m.epoch].desks.some(d => d.keyId === m.writer && d.public === m.pub); /* plant:e4-rostered-ask */
    if (!lead && asking && ctx && Array.isArray(ctx.inviteKeys) && typeof m.pub === "string" && HEX64.test(m.pub)
      && branchIdOf(m.pub) === m.writer) {
      for (const k of ctx.inviteKeys) out.push({ key: k.key, trust: leadTrust([{ deskId: m.writer, keyId: m.writer, public: m.pub }]), asked: true });
    }
    if (key && (lead || known)) out.push({ key, trust: leadTrust(known ? st.trust[m.epoch].desks : []) });
    else if (key) out.push({ key, refuse: "epoch" });
    return { tries: out, missing: !key };
  }

  /* A desk blob waits for a key only at an epoch a verified lead blob has named, and only under a key the newest
     roster still names. The lead's own blob may wait at the epoch it has just named. */
  function mayPark(it) {
    const m = it && it.meta;
    if (!pin || !m || !isCount(m.epoch) || m.epoch > st.leadEpoch) return false;
    if (isLeadKey(m.writer)) return true;
    const top = newestRoster();
    return !!top && top.desks.some(d => d.keyId === m.writer);
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
    if (typeof m.pub === "string" && !isLeadKey(m.writer) && !(ctx && Array.isArray(ctx.inviteKeys))
      && !(has(st.trust, String(m.epoch)) && st.trust[m.epoch].desks.some(d => d.keyId === m.writer))) { unpend(m.id); return null; } /* plant:request-pass */
    const t = triesFor(m, ctx);
    let last = null;
    for (const x of t.tries) {
      if (x.refuse) { last = R(x.refuse); break; }
      const r = judge(blob, x.trust, m.epoch, x.key, floors, x.asked === true);
      /* The request, or its own deletion when the desk that asked withdraws it. */
      if (r.ok && x.asked && !((r.kind === "delete" || (r.kind === "file" && Buffer.byteLength(r.body, "utf8") <= INVITE_UPLOAD_MAX)) /* plant:e4-lead-withdraw */
        && r.path.toLowerCase() === ("desks/" + m.writer + "/join.json").toLowerCase())) { last = R("outside-place"); break; }
      if (r.ok) { r.size = blob.ciphertext.length; return { it, r }; }
      last = r;
      if (r.reason !== "bad-signature") break;
    }
    if (t.missing && signedUpload(it) && (!last || last.reason === "bad-signature")) {
      if (!mayPark(it)) { unpend(m.id); dropSaid("a file from " + m.writer, R("epoch")); return null; } /* plant:pending-roster */
      pend(it, floors0); return null; /* plant:pending-sig */
    }
    unpend(m.id);
    dropSaid("a file from " + m.writer, last || R("bad-signature"));
    return null;
  }

  /* AN INVITATION'S OWN PLACE (the joining bootstrap, slice 3'wrap in small), AND A DESK'S OWN COPY: what the lead sealed
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
    if (!isLeadKey(m.writer)) { dropSaid(seal.what, R("not-roster")); return null; }
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

  /* The newest of each path in `list` (by epoch, then counter), the rest of that path left: older copies in one batch.
     The key is the path key, the same fold as the mirror. toLowerCase would join the Kelvin sign with k and drop one
     of them. The assignment after the lowercase key replaces it, and lifting the assignment returns that lowercase. */
  function landNewest(list, out, ctx) {
    const best = new Map();
    let keyOf = x => x.r.path.toLowerCase();
    keyOf = x => pathKey(x.r.path); /* plant:land-fold */
    for (const x of list) {
      const k = keyOf(x);
      const had = best.get(k);
      if (!had || later(x.r, had.r)) best.set(k, x);
    }
    for (const x of list) {
      if (best.get(keyOf(x)) !== x) {
        /* Passed over, and still this key's: its counter is one the relay will not take again. */
        if (ownOf(ctx, x.r)) noteOwn(x.r);
        unpend(x.r.id); continue;
      }
      unpend(x.r.id);
      const landed = land(x.r, ownOf(ctx, x.r));
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
      if (isLeadKey(it.meta.writer) && signedUpload(it)) st.leadEpoch = Math.max(st.leadEpoch, it.meta.epoch); /* plant:lead-epoch */
      (isLeadKey(it.meta.writer) ? lead : rest).push(it);
    }
    const isTeam = x => x.r.kind === "file" && x.r.path === TEAM_NAME;
    let topTeam = null;
    const landTop = list => {
      const teams = list.filter(isTeam);
      for (const x of teams) unpend(x.r.id);
      if (!teams.length) return;
      const top = teams.reduce((a, b) => (later(b.r, a.r) ? b : a));
      /* A team file passed over for a newer one still used this key's counter. */
      for (const x of teams) if (x !== top && ownOf(ctx, x.r)) noteOwn(x.r);
      if (topTeam && !later(top.r, topTeam.r)) return;
      topTeam = top;
      const landed = landTeam(top.r, ctx); /* plant:team-first */
      if (!landed.ok) dropSaid(TEAM_NAME, landed);
      else if (!landed.same && !landed.stale && !out.team) { out.team = true; out.applied.push(TEAM_NAME); }
    };
    /* An invitation's place and a desk's own copy first: the team file either brings is landed, and its key heeded, before
       the lead's other blobs are opened, so those sealed under that key open in this pass rather than wait to be fetched again. */
    const placed = [];
    let first = () => false;
    first = it => typeof it.meta.place === "string" && it.meta.place.startsWith("invite:"); /* plant:copy-first */
    for (const it of lead) { if (first(it)) { const x = openOne(it, floors0, ctx); if (x) placed.push(x); } }
    landTop(placed);
    const opened = [];
    for (const it of lead) { if (!first(it)) { const x = openOne(it, floors0, ctx); if (x) opened.push(x); } }
    landTop(opened);
    landNewest(opened.filter(x => !isTeam(x)), out, ctx);
    const desks = [];
    for (const it of rest) { const x = openOne(it, floors0, ctx); if (x) desks.push(x); }
    landNewest(desks, out, ctx);
    persist();
    return out;
  }

  /* ---- out ---- */

  function considerOutgoing(rel, bytes) {
    const name = String(rel || "");
    if (TMP_RE.test(name)) return { send: false, reason: "tmp", said: B.REASONS.tmp }; /* plant:out-tmp */
    const key = pathKey(name);
    const a = has(st.applied, key) ? st.applied[key] : null;
    let echo = !!a && !a.del && clock() - a.at < ECHO_MS;
    if (echo && bytes != null) echo = sha256(toBytes(bytes)) === a.sha;
    if (echo) return { send: false, reason: "echo", said: B.REASONS.echo }; /* plant:out-echo */
    return { send: true };
  }

  /* What this program owes the relay from its own place: each whole file whose bytes differ from the last it sent, and a
     deletion for each it sent that is gone. Two paths that differ only in case are one file: the first listed is sent,
     and each other is said once as staying on this computer. On the lead's side, the team file once more under each live
     invitation's key, and once more for each desk its roster names, under that desk's copy key. */
  function owed(me, ctx) {
    const ops = [];
    if (!pin || !me) return ops;
    const here = new Map();
    for (const rel of io.list()) {
      if (TMP_RE.test(rel) || !inPlace(me.place, rel)) continue;
      const p = B.checkPath(rel);
      if (!p.ok) continue;
      const relKey = pathKey(p.path);
      /* Two names differing only in case are one file. The first listed is the one sent; each other is said once and stays. */
      if (here.has(relKey)) { if (!stayed.has(p.path)) { stayed.add(p.path); say(p.path + " stays on this computer"); } continue; } /* plant:case-one */
      here.set(relKey, p.path);
      const bytes = io.read(p.path);
      if (bytes == null) continue;
      const sha = sha256(bytes);
      const was = has(st.sent, relKey) ? st.sent[relKey] : null;
      if (was && !was.del && was.sha === sha && was.owe !== true) continue;
      const stopped = has(st.refused, relKey) ? st.refused[relKey] : null;
      if (stopped && stopped.sha === sha) continue; /* plant:refused-skip */
      if (!considerOutgoing(p.path, bytes).send) continue;
      let text;
      try { text = UTF8.decode(bytes); }
      catch { say(p.path + " is not text, so it stays on this computer"); st.refused[relKey] = { sha, why: "not-text" }; continue; }
      ops.push({ rel: p.path, kind: "file", body: text, sha });
    }
    for (const rel of Object.keys(st.sent)) {
      const was = st.sent[rel];
      if (!was.del && !here.has(pathKey(rel)) && inPlace(me.place, rel)) ops.push({ rel, kind: "delete", body: "", sha: null }); /* plant:out-delete */
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
        if (!was || was.del || was.sha !== sha || was.owe === true)
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
    const k = pathKey(op.rel);
    if (op.invite) { const h = op.invite.id; return has(st.sentInv, h) && has(st.sentInv[h], k) ? st.sentInv[h][k] : null; }
    return has(st.sent, k) ? st.sent[k] : null;
  }

  function lostBlob(id) {
    const key = String(id || "");
    const blob = st.lostBlobs[key];
    if (HEX32.test(key) && st.replyLostIds[key] === true && HEX32.test(String(blob || ""))) return String(blob);
    return null;
  }

  /* A file owed, sealed and signed: the next counter, the blob it replaces named so the relay keeps one per chain.
     An invitation upload retried after a lost reply is sealed under that upload's id. */
  function sealOut(op, me, sealing) {
    const was = lastSent(op);
    let held = null;
    held = op.byInvite ? lostBlob(op.inviteId) : null; /* plant:lost-id */
    const blob = B.seal({ relayTeamId: pin.rt, epoch: sealing.epoch, teamKey: sealing.key, writer: { keyId: me.keyId, privateKey: me.privateKey },
      path: op.rel, body: op.body, counter: nextCounter(), place: op.place ? null : me.place, kind: op.kind, supersedes: was ? was.id : null,
      id: op.id || held || null });
    if (op.place) blob.place = op.place;
    return blob;
  }

  function sentOut(op, blob) {
    const rec = { id: blob.id, epoch: blob.epoch, counter: blob.counter, sha: op.sha, size: blob.ciphertext.length, del: op.kind === "delete" };
    const was = lastSent(op);
    const k = pathKey(op.rel);
    if (op.invite) {
      const h = op.invite.id;
      st.sentInv[h] = Object.assign({}, st.sentInv[h] || {}, { [k]: rec });
    } else {
      st.sent[k] = rec;
      st.bytes = Math.max(0, st.bytes - (was ? was.size : 0)) + rec.size;
      delete st.refused[k];
    }
    waiting.delete(op.invite ? "invite:" + op.invite.id : k);
    if (op.byInvite) {
      st.invited = true;
      if (HEX32.test(String(op.inviteId || ""))) st.invitedIds[String(op.inviteId)] = true; /* plant:invite-id-sent */
      if (HEX32.test(String(op.inviteId || ""))) delete st.replyLostIds[String(op.inviteId)];
      if (HEX32.test(String(op.inviteId || ""))) delete st.lostBlobs[String(op.inviteId)];
    }
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
    const k = pathKey(op.rel);
    if (op.invite) {
      delete st.sentInv[op.invite.id][k];
      if (!Object.keys(st.sentInv[op.invite.id]).length) delete st.sentInv[op.invite.id];
    } else {
      delete st.sent[k];
      st.bytes = Math.max(0, st.bytes - was.size);
    }
    persist();
    return true;
  }

  /* An upload refused. A refusal the relay answers (relayAnswer) always waits: those bytes stay owed and go again at
     the next cycle, and at a new session or a start, because that refusal is not kept by content hash (C2). A copy of
     the team file always waits, so its refusal never stops the lead's own team file of the same bytes. A judgement this
     program makes before the upload, a limit allowUpload holds among them, stops the file until its bytes change when
     the reason is one no later send of those bytes can lift. Each is said, a wait once while it lasts. True where it waits. */
  function refusedOut(op, r, relayAnswer) {
    const key = op.invite ? "invite:" + op.invite.id : pathKey(op.rel);
    let waits = !!op.invite;
    if (relayAnswer) waits = true; /* plant:relay-waits */
    if (STOPS.indexOf(r.reason) < 0) waits = true; /* plant:refused-waits */
    if (waits) {
      if (waiting.get(key) !== r.reason) {
        waiting.set(key, r.reason);
        say((op.invite ? "a copy of " + op.rel + " for one desk or invitation" : op.rel) + " waits, and goes once this lifts: " + r.said);
      }
      return true;
    }
    waiting.delete(key);
    if (op.sha) st.refused[pathKey(op.rel)] = { sha: op.sha, why: r.reason };
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

  /* The head shown by its signed time, never as a block: only one the pinned lead or genuine predecessor signed for this relay. */
  function showFreshness(input) {
    const i = input || {};
    const none = { shown: false, blocked: false, time: null, epoch: null, rev: null, ageMs: null };
    const head = i.head;
    if (!pin || !table(head) || !table(head.sig)) return none;
    const lead = chainLeads().find(l => l.keyId === head.keyId);
    if (!lead || head.relay !== pin.rt) return none;
    let bytes;
    try { bytes = signedBytes(head); } catch { return none; }
    if (!B.verifySigned(lead.public, HEAD_PREFIX, bytes, head.sig.value) || !Number.isFinite(head.time)) return none;
    const now = Number.isFinite(i.now) ? i.now : clock();
    return { shown: true, blocked: false, time: head.time, epoch: head.epoch, rev: head.rev, ageMs: now - head.time };
  }

  /* On the relay the ring is the signed team file's own, or none; a ring file beside it is never read (E4). */
  function readRing(input) {
    const i = input || {};
    const doc = i.teamDoc;
    const isRelay = table(doc) && table(doc.channel) && doc.channel.kind === "relay";
    if (table(doc)) {
      const t = teamJudged(doc);
      if (t.ok && table(doc.ring)) return { source: "team", ring: doc.ring };
    }
    if (isRelay) return { source: "none", ring: null };
    return { source: i.looseRing ? "loose" : "none", ring: i.looseRing || null };
  }

  function readMirror(rel) {
    const b = io.read(rel);
    return b == null ? null : toBytes(b).toString("utf8");
  }

  const api = {
    setPin, pinned: () => pin, leads: () => chainLeads(), loadTeamFile, holdTeam, acceptBlob, applyBatch, considerOutgoing, owed, sealOut, sentOut, refusedOut,
    sentDeletion, unchain, wroteIds, allowUpload, showFreshness, headNews, readRing, readMirror, nextCounter, teamEpoch,
    state: () => st,
    setSeq(n) { if (Number.isSafeInteger(n) && n > st.seq) { st.seq = n; persist(); } },
    markTokenUsed(id) {
      st.tokenUsed = true;
      if (HEX32.test(String(id || ""))) st.tokenUsedIds[String(id)] = true;
      persist();
    },
    tokenSpent(id) { return HEX32.test(String(id || "")) && st.tokenUsedIds[String(id)] === true; },
    inviteSent(id) { return HEX32.test(String(id || "")) && st.invitedIds[String(id)] === true; },
    /* The invitation's one upload went out and no reply came back. A later token-spent on that same upload counts as sent.
       The blob id kept is the first lost reply's, the one the relay holds. */
    markReplyLost(id, blobId) {
      if (HEX32.test(String(id || ""))) {
        const key = String(id);
        st.replyLostIds[key] = true;
        if (!HEX32.test(String(st.lostBlobs[key] || "")) && HEX32.test(String(blobId || ""))) st.lostBlobs[key] = String(blobId);
      }
      persist();
    },
    replyLost(id) { return HEX32.test(String(id || "")) && st.replyLostIds[String(id)] === true; },
    /* The request withdrawn at the relay: the invitation counts as not asked again, so a request written anew goes as the first. */
    unmarkInvited(id) {
      if (HEX32.test(String(id || ""))) delete st.invitedIds[String(id)];
      st.invited = false;
      persist();
    },
    /* The relay refused this invitation's withdrawal for good. The deletion is no longer owed, and a later cycle does not ask again. */
    forgetSent(rel) {
      const k = pathKey(rel);
      const was = has(st.sent, k) ? st.sent[k] : null;
      if (!was) return;
      st.bytes = Math.max(0, st.bytes - (was.size || 0));
      delete st.sent[k];
      delete st.refused[k];
      waiting.delete(k);
      persist();
    },
    markUnkept(id) {
      if (HEX32.test(String(id || ""))) st.unkeptIds[String(id)] = true;
      persist();
    },
    unkept(id) { return HEX32.test(String(id || "")) && st.unkeptIds[String(id)] === true; },
    heldTeam,
    /* The lapse last told, and the relay's clock less this computer's at the last hello. */
    lapse: () => (st.lapse ? Object.assign({}, st.lapse) : null),
    skew: () => st.skew,
    tellLapse(l) {
      const k = lapseKept(l);
      if (!k || JSON.stringify(k) === JSON.stringify(st.lapse)) return;
      st.lapse = k;
      persist();
    },
    /* Kept on disk only once it moves by more than a minute, so a session's few milliseconds write nothing. */
    setSkew(n) {
      if (!Number.isSafeInteger(n)) return;
      const far = Math.abs(n - st.skew) > 60 * 1000;
      st.skew = n;
      if (far) persist();
    },
    pending: () => st.pending.slice(),
    unpend(id) { unpend(id); persist(); },
    /* The relay's copy of the team made again under the same id, after a sweep: its sequence starts over and it holds none of
       this program's uploads. The place in the sequence goes back to the start, and every file this program last sent is owed
       again with the bytes it sent kept, so a newer blob of the same key the catch-up finds is taken as newer and never as an
       edit waiting here; one the relay still lists, or a newer one taken, is owed no more. The mirror, the floors and the
       trust are kept; the lapse is told again by the next session. */
    forgetRelay() {
      st.seq = 0; /* plant:remade-seq */
      const owedAgain = m => { for (const k of Object.keys(m)) if (!m[k].del) m[k] = Object.assign({}, m[k], { owe: true }); }; /* plant:remade-owe */
      owedAgain(st.sent);
      for (const h of Object.keys(st.sentInv)) owedAgain(st.sentInv[h]);
      st.pending = [];
      st.lapse = null;
      persist();
    },
    /* A blob of this program's own record the relay lists: it holds that upload, so the file is not owed again. */
    stillHeld(id) {
      const clear = m => { for (const k of Object.keys(m)) if (m[k].id === id && m[k].owe === true) { m[k] = Object.assign({}, m[k]); delete m[k].owe; return true; } return false; };
      let hit = clear(st.sent);
      for (const h of Object.keys(st.sentInv)) hit = clear(st.sentInv[h]) || hit;
      if (hit) persist();
    },
    /* Whether this program has met the blob `id`: applied it, taken it, or sent it. */
    knows(id) {
      if (has(st.taken, id) || wroteIds().has(id)) return true;
      return Object.keys(st.applied).some(k => st.applied[k].id === id);
    },
    /* What a session tells of the copy: its stamp `made`, and `passed`, whether the lapse last told says the team was swept or its
       sweep day has gone by. A stamp other than the one kept is a copy made anew: the program starts over at once. A stamp kept
       for the first time by a program that has been here before, or no stamp where the lapse says swept, is a question for the
       relay's list (copyIsNew). Each is kept on disk before the session's lapse is told, so it outlives a quit. */
    copyMade(made, passed) {
      const m = typeof made === "string" && MADE_RE.test(made) ? made : null;
      let changed = false;
      changed = !!m && !!st.made && m !== st.made; /* plant:remade-made */
      if (changed) { api.forgetRelay(); st.made = m; persist(); return; }
      const been = st.seq > 0 || Object.keys(st.sent).length > 0;
      if (m && !st.made) { st.made = m; if (been) st.suspect = true; persist(); return; }
      if (!m && passed) { st.suspect = true; persist(); }
    },
    suspect: () => st.suspect === true,
    settled() { if (st.suspect) { st.suspect = false; persist(); } },
    raiseOwn(counter) {
      if (Number.isSafeInteger(counter)) {
        st.own = Math.max(st.own, counter);
        persist();
      }
    },
  };
  return api;
}

/* ---- the channel: the relay and the mirror's watch ------------------------------------------------------------- */

/* `o`: rt, url (https, ending /relay/v1), mirror, stateFile; me() as {keyId, public, privateKey, place, box}, box a desk's
   X25519 public key as 64 hex; pin() as {teamId, rt, lead}; keyFor(epoch) a team key or null; sealEpoch() the epoch to seal
   under; invite() on a desk joining by invitation as {inv, token, seal, box}, box the lead's box as 64 hex where the
   invitation names it; inviteKeys() on the lead's side, the live
   invitations as {id, key}; agree(box) the 32-byte X25519 agreement of this program's own box with another's, given as 64
   hex, or null: the lead's with a desk's, a desk's with the lead's, for a desk's own copy of the team file and for the
   lead's answer; onAnswer(answer) on a desk, "joined" or "refused", once the lead's answer opens; request(method,
   url, headers, body) answering {status, header(name), bytes} and throwing where the relay does not answer; connect(url,
   headers, {message, close}) a socket or null; write(abs, text) the shell's atomic write; say(line); onTeam() after a team
   file lands; onRemoved() once, when the relay refuses this desk as removed and the shell is listening, after which
   the channel stops asking; clock. */
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
  let session = null, sock = null, running = false, busy = null, again = false, backoff = RETRY_MIN_MS, answerHeld = null, answerDue = null;
  /* How long a join keeps asking after the relay says the team is not there yet, from the first such answer. */
  const ENROL_WAIT_MS = 5 * 60 * 1000;
  let enrolWaitFrom = 0, removedTold = false;
  /* need: not fetched. held: fetched, waiting for the team file. opened: the team key was handed on. none: this relay
     keeps no wrap (a 404), said as nothing. bad: the wrap did not open, said once. */
  let wrapPhase = "need", wrapHeld = null;
  let watchers = [], settle = null, retryTimer = null, counterTimer = null, pollTimer = null, pingTimer = null, watchMode = "";
  let counterOwed = false;
  /* A floor is taken only if it leaves room: at most 100 years of ms past this program's clock. */
  const COUNTER_AHEAD_MAX_MS = 100 * 365.25 * 24 * 60 * 60 * 1000;
  let floorlessFile = null, floorlessTries = 0;

  function takeFloor(floor) {
    if (floor === undefined) return false;
    let past = false;
    past = !Number.isSafeInteger(floor) || floor < 1 || floor > clock() + COUNTER_AHEAD_MAX_MS; /* plant:floor-bound */
    if (past) {
      sayOnce("the relay named a counter floor past the bound, so that was not taken"); /* draft words: copywriter */
      return false;
    }
    prog.raiseOwn(floor); /* plant:take-floor */
    return true;
  }
  const said = new Set();
  const sayOnce = line => { if (!said.has(line)) { said.add(line); say(line); } };

  function ctx() {
    const inv = typeof o.invite === "function" ? o.invite() : null;
    const who = typeof o.agree === "function" ? me() : null;
    return {
      agree: typeof o.agree === "function" ? peer => o.agree(peer) : null,
      self: who && typeof who.place === "string" ? { place: who.place, box: typeof who.box === "string" ? who.box : "" } : null,
      mine: mineId(),
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
  /* The key id of this program's own signing key, or null: a blob it names as writer is this key's. */
  function mineId() {
    const w = me();
    return w && typeof w.keyId === "string" && w.keyId ? w.keyId : null;
  }

  function refusalOf(r) {
    const j = r && r.json;
    const reason = j && typeof j.error === "string" && has(B.REASONS, j.error) ? j.error : null;
    if (!reason) return { ok: false, reason: "status-" + (r ? r.status : 0), said: "The relay answered " + (r ? r.status : 0) + ".", served: false };
    const out = R(reason);
    if (j && j.floor !== undefined) out.floor = j.floor;
    return out;
  }

  /* THE LAPSE, kept with the program's record so a restart still knows it, and handed on through onLapse(view) whenever
     the view changes. */
  let viewSaid = null;
  const relayNow = () => clock() + prog.skew();
  function lapseView() {
    const l = prog.lapse(), step = lapseStep(l, relayNow());
    return step ? { step, until: l.until, readOnly: l.readOnly, swept: l.swept } : null;
  }
  function noteStep() {
    const v = lapseView(), text = JSON.stringify(v);
    if (text === viewSaid) return;
    viewSaid = text;
    if (typeof o.onLapse === "function") o.onLapse(v);
  }
  function told(l) {
    prog.tellLapse(l);
    noteStep();
  }
  /* Every session starts here, a refused one included, so the relay's time is read even once the team has stopped. */
  async function hello() {
    const ch = await call("POST", "hello", { json: {} });
    if (ch.status === 200 && ch.json && Number.isSafeInteger(ch.json.until)) prog.setSkew(ch.json.until - RELAY_CHALLENGE_MS - clock()); /* plant:lapse-clock */
    return ch;
  }
  /* The relay refuses a session, since or a blob as team-lapsed once the team stops: lapsed to its sweep and gone after,
     with the dates last told. Once swept, at the first call past that day, it knows no team and says not-enrolled. */
  function refusedLapse(why) {
    const last = prog.lapse();
    const past = !!last && last.swept !== null && relayNow() >= last.swept;
    let stopped = false;
    stopped = why.reason === "team-lapsed"; /* plant:lapse-refused */
    if (stopped) told(Object.assign({ until: null, readOnly: null, swept: null }, last, { state: past ? "gone" : "lapsed" }));
    else if (why.reason === "not-enrolled" && past) told(Object.assign({}, last, { state: "gone" })); /* plant:lapse-swept */
    else if (why.reason === "not-enrolled" && (!last || last.state === "unknown")) told({ state: "unknown", until: null, readOnly: null, swept: null }); /* plant:lapse-unknown */
  }
  /* A session opened for a team the relay last said was swept, or whose sweep day has passed by the relay's clock, may meet
     a copy the relay made anew. That is only a question: the cycle asks the relay before anything is fetched (copyIsNew). */
  function sessionOpened(json) {
    const l = prog.lapse();
    const passed = !!l && (l.state === "gone" || (l.swept !== null && relayNow() >= l.swept)); /* plant:remade-seen */
    prog.copyMade(json && json.made, passed);
  }
  /* The relay's own evidence: its list from the start names no blob this program has met. A team renewed before its sweep
     still lists them (the team file at least), and keeps its place in the sequence; a copy made anew lists none, and this
     program starts over with it (forgetRelay). A list it does not give leaves the question for the next cycle. */
  async function copyIsNew() {
    const r = await authed("GET", "since/0");
    if (r.status !== 200 || !Array.isArray(r.json)) return null;
    let known = false;
    known = r.json.some(e => table(e) && table(e.meta) && prog.knows(String(e.meta.id))); /* plant:remade-known */
    return !known;
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
    let lapse = null;
    const lh = res && typeof res.header === "function" ? res.header("etiuda-lapse") : null;
    if (typeof lh === "string" && lh) { try { lapse = JSON.parse(Buffer.from(lh, "base64url").toString("utf8")); } catch { lapse = null; } }
    return { status: res.status, json, bytes, meta, lapse };
  }

  /* A session by this program's own key, or, where the relay does not know that key yet, by the invitation's token, which
     the relay spends at its first use. */
  async function openSession() {
    session = null;
    let ch = await hello();
    if (ch.status !== 200 || !ch.json || !HEX32.test(String(ch.json.challenge))) return refusalOf(ch);
    const who = me();
    let why = R("not-enrolled");
    const inv = typeof o.invite === "function" ? o.invite() : null;
    const freshInvite = !!(inv && HEX32.test(String(inv.inv)) && prog.tokenSpent(inv.inv) === false);
    if (who && who.privateKey) {
      const sig = crypto.sign(null, helloBytes(o.rt, ch.json.challenge, who.keyId), who.privateKey).toString("hex");
      const r = await call("POST", "session", { json: { challenge: ch.json.challenge, key: who.keyId, pub: who.public, sig } });
      /* An invitation's session for this key is an earlier invitation's where a fresh one waits unspent and this program
         has used one before: since slice 3 the relay answers a bound key with its invitation's session after the upload too
         (for the lead's answer alone), so taking it would hold the desk there and never spend the fresh token, and the fresh
         token's hello comes first. With no earlier use recorded, it is this invitation's own, resumed (N4). */
      const usedBefore = prog.state().tokenUsed === true || prog.state().invited === true;
      let olderInvite = false;
      olderInvite = !!(r.json && r.json.invite === true && freshInvite && usedBefore); /* plant:fresh-first */
      if (r.status === 200 && r.json && HEX64.test(String(r.json.session)) && !olderInvite) {
        /* The invitation's session again, where this key was bound by the token's one session and the request is not yet in
           (N4): a request lost on the way, or a quit before it went, is sent again without the token. */
        session = { token: r.json.session, at: clock(), by: r.json.invite === true ? "invite" : "key" }; /* plant:n4-resume */
        sessionOpened(r.json);
        told(r.json.lapse); /* plant:lapse-cleared */
        if (session.by === "invite" && inv && HEX32.test(String(inv.inv))) session.inv = String(inv.inv);
        return { ok: true };
      }
      if (!olderInvite) why = refusalOf(r);
      /* The relay spent that challenge on the session it opened, so the fresh token's hello asks for another. */
      if (olderInvite) {
        ch = await hello();
        if (ch.status !== 200 || !ch.json || !HEX32.test(String(ch.json.challenge))) return refusalOf(ch);
      }
    }
    if (why.reason === "removed" && freshInvite) why = R("not-enrolled"); /* plant:removed-token */
    if (why.reason !== "not-enrolled") return why;
    let spent = prog.state().tokenUsed === true;
    if (inv && prog.tokenSpent(inv.inv) === false && HEX32.test(String(inv.inv))) spent = false; /* plant:token-by-id */
    if (!inv || spent || !HEX32.test(String(inv.inv)) || typeof inv.token !== "string") return why;
    /* A token hello that binds no key is not sent. Sending it would spend the invitation with nobody bound to it. */
    let bind = {};
    const canBind = who && who.privateKey && HEX64.test(String(who.public));
    if (canBind) bind = { key: who.keyId, pub: who.public, sig: crypto.sign(null, helloBytes(o.rt, ch.json.challenge, who.keyId), who.privateKey).toString("hex") };
    else return why; /* plant:invite-bind */
    const r = await call("POST", "session", { json: Object.assign({ challenge: ch.json.challenge, invite: inv.token, inv: inv.inv }, bind) });
    if (r.status === 200 && r.json && HEX64.test(String(r.json.session))) {
      prog.markTokenUsed(inv.inv);
      session = { token: r.json.session, at: clock(), by: "invite", inv: String(inv.inv) };
      sessionOpened(r.json);
      told(r.json.lapse);
      return { ok: true };
    }
    const t = refusalOf(r);
    const ended = !!(r.json && r.json.error === "invite-ended");
    if (ended) inviteEnd("ended"); /* plant:S3-page-ended */
    if (ended) return { ok: false, reason: "invite-ended", said: INVITE_ENDED_SAID, served: false }; /* plant:invite-ended */
    if (t.reason === "removed") { inviteEnd("removed"); return t; } /* plant:h35-removed-end */
    if (t.reason !== "token-spent") return t; /* plant:token-kept */
    prog.markTokenUsed(inv.inv);
    t.said = INVITE_USED_SAID; /* plant:invite-used */
    inviteEnd("used"); /* plant:S3-page-used */
    return t;
  }

  /* The relay has refused this invitation's token, as spent ("used"), past its end ("ended"), or made before this desk
     was removed ("removed"). The shell keeps that with the request, which is where the page reads it. */
  function inviteEnd(kind) {
    if (typeof o.onInviteEnd === "function") o.onInviteEnd(kind);
  }

  /* A session by this program's own key. Where the relay still answers for the invitation, the session stays the
     invitation's; a device session replaces it once the key is enrolled. */
  async function keySession() {
    const who = me();
    if (!who || !who.privateKey) return R("not-enrolled");
    const ch = await hello();
    if (ch.status !== 200 || !ch.json || !HEX32.test(String(ch.json.challenge))) return refusalOf(ch);
    const sig = crypto.sign(null, helloBytes(o.rt, ch.json.challenge, who.keyId), who.privateKey).toString("hex");
    const r = await call("POST", "session", { json: { challenge: ch.json.challenge, key: who.keyId, pub: who.public, sig } });
    if (r.status !== 200 || !r.json || !HEX64.test(String(r.json.session))) return refusalOf(r);
    let device = false;
    device = r.json.invite !== true; /* plant:S3-device */
    if (device) dropSocket();
    session = { token: r.json.session, at: clock(), by: device ? "key" : "invite" };
    sessionOpened(r.json);
    told(r.json.lapse);
    if (!device && HEX32.test(String(ctx().inviteId || ""))) session.inv = String(ctx().inviteId);
    return { ok: true };
  }

  /* An invitation's session serves one upload. After that, each cycle asks whether this key is enrolled: a device
     session goes on as any desk's, and the invitation's session reads only the lead's answer. */
  /* This invitation's one request is up: by its id where the invitation names one (board 918, so a fresh invitation after an
     earlier one sends its own request), else by the program's one mark. */
  function invitedNow() {
    const id = ctx().inviteId;
    return id ? prog.inviteSent(id) === true : prog.state().invited === true;
  }

  async function ensureSession() {
    const id = ctx().inviteId;
    /* A session of another invitation's, where this one is fresh: its own session is opened (board 918). */
    if (session && session.by === "invite" && id && session.inv !== id && prog.tokenSpent(id) === false && prog.inviteSent(id) === false) return openSession(); /* plant:new-invite-session */
    if (session && session.by === "invite" && (id ? prog.inviteSent(id) === true : prog.state().invited === true)) {
      const k = await keySession();
      if (k.ok) return k;
      /* Not enrolled yet is the wait, said by the answer fetch, not a fault. */
      if (k.reason === "not-enrolled") return { ok: true };
      return k;
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

  /* Everything after this program's place in the sequence, fetched, then judged and applied in the catch-up's order. A blob
     is passed over only where this program's own record shows it sent that id: the mirror holds it. One of this key's that
     the record does not show is fetched, and the program judges it as it judges anyone's (board 932 (2)). */
  async function catchUp() {
    const who = me();
    for (let round = 0; round < 1000; round++) {
      const st = prog.state();
      const wrote = prog.wroteIds();
      const r = await authed("GET", "since/" + st.seq);
      if (r.status !== 200 || !Array.isArray(r.json)) {
        const why = r.refused || refusalOf(r);
        /* A key removed earlier holds an invitation's session that may not list. Its one request still goes. */
        if (session && session.by === "invite" && why.reason === "removed") return { ok: true };
        /* The list is refused once that upload has landed. The retry still goes, and token-spent there counts as sent. */
        if (session && session.by === "invite" && why.reason === "not-enrolled" && prog.replyLost(session.inv)) return { ok: true };
        return why;
      }
      told(r.lapse); /* plant:lapse-since-told */
      const items = [];
      let top = st.seq;
      for (const e of r.json) {
        if (!table(e) || !Number.isSafeInteger(e.seq) || e.seq <= top || !table(e.meta)) continue;
        const before = top;
        top = e.seq;
        const m = e.meta;
        let own = !!who && m.writer === who.keyId;
        own = wrote.has(m.id); /* plant:own-record */
        if (own) prog.stillHeld(m.id);
        if (own) continue; /* plant:own-skip */
        if (!Number.isSafeInteger(m.size) || m.size < 0 || !HEX32.test(String(m.id))) { sayOnce("a file the relay listed was left out: " + B.REASONS["bad-signature"]); continue; }
        if (m.size > B.BLOB_MAX) { say("a file from " + m.writer + " was left out: " + B.REASONS["blob-size"]); continue; } /* plant:in-size-listed */
        const got = await authed("GET", "b/" + m.id);
        /* Not served for a reason that can pass (see gone): what came before it is applied and the next cycle asks from it.
           Where the lead has a blob listed from here on, which may be the team file a desk's file is judged under, the
           page applies only up to its first desk file and the next cycle asks from that file. */
        if (got.status !== 200 && !gone(got)) {
          const leadId = prog.pinned() ? prog.pinned().lead.keyId : "";
          let cut = -1;
          if (r.json.some(x => table(x) && table(x.meta) && Number.isSafeInteger(x.seq) && x.seq >= e.seq && x.meta.writer === leadId))
            cut = items.findIndex(x => x.meta.writer !== leadId); /* plant:page-whole */
          prog.applyBatch(cut < 0 ? items : items.slice(0, cut), ctx());
          prog.setSeq(cut < 0 ? before : items[cut].seq - 1);
          return got.refused || refusalOf(got); /* plant:fetch-kept */
        }
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
      const c = ctx(), inv = c.inviteSeal, st = prog.state();
      const mine = ("desks/" + who.place.slice(5) + "/join.json").toLowerCase();
      let sent = st.invited === true;
      if (c.inviteId && prog.inviteSent(c.inviteId) === false) sent = false; /* plant:invited-by-id */
      if (!inv || sent || op.kind !== "file" || op.rel.toLowerCase() !== mine || Buffer.byteLength(op.body, "utf8") > INVITE_UPLOAD_MAX) return null; /* plant:invite-join */
      return { epoch: Math.max(1, st.leadEpoch), key: inv, byInvite: true };
    }
    const e = typeof o.sealEpoch === "function" ? o.sealEpoch() : null;
    const key = isCount(e) && typeof o.keyFor === "function" ? o.keyFor(e) : null;
    if (isCount(e) && e < floor) return null; /* plant:seal-floor */
    return key ? { epoch: e, key } : null;
  }

  /* One file owed, sealed, held to the limits and put: {ok}; {lim} where a limit held it; {r, why, blob} where the relay
     did not take it. The blob stays, so a retry the relay already holds can be recorded as sent. */
  async function upload(op, who, sealing) {
    const blob = prog.sealOut(op, who, sealing);
    const lim = prog.allowUpload(blob, who.keyId);
    if (!lim.ok) return { lim };
    const meta = { v: 1, id: blob.id, supersedes: blob.supersedes, epoch: blob.epoch, writer: blob.writerKeyId, counter: blob.counter,
      del: blob.deletion, sig: blob.signature, nonce: blob.nonce, place: blob.place };
    if (sealing.byInvite) meta.pub = who.public;
    const r = await authed("PUT", "b/" + blob.id, { meta, bytes: blob.ciphertext });
    if (r.status === 200) { prog.sentOut(op, blob); return { ok: true }; }
    return { r, why: r.refused || refusalOf(r), blob };
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

  /* A replay-counter refusal has already kept its counter, so one timer tries that upload again inside a minute.
     A further refusal starts the same wait. A success, a stop or a halt clears it. */
  function scheduleCounterRetry() {
    if (!running) return;
    clearTimeout(counterTimer);
    let stopRetries = false;
    stopRetries = floorlessTries >= 3; /* plant:counter-backoff */
    if (stopRetries) return;
    counterTimer = setTimeout(() => { counterTimer = null; kick(); }, COUNTER_RETRY_MS);
    if (counterTimer.unref) counterTimer.unref();
  }
  function clearCounterRetry() {
    clearTimeout(counterTimer);
    counterTimer = null;
  }

  async function flush() {
    const who = me();
    if (!who || !who.privateKey) return { ok: true };
    const floor = prog.teamEpoch();
    let sawReplay = false;
    for (const op of prog.owed(who, ctx())) {
      const sealing = sealingFor(op, who, floor);
      if (!sealing) {
        const e = typeof o.sealEpoch === "function" ? o.sealEpoch() : null;
        if (isCount(e) && e < floor) sayOnce("what this computer sends waits for the team key of epoch " + floor + ", which its team file names");
        continue;
      }
      op.byInvite = !!sealing.byInvite;
      if (sealing.byInvite) op.inviteId = ctx().inviteId;
      let u = await upload(op, who, sealing);
      if (u.why && u.why.reason === "superseded" && await lapsed(op)) u = await upload(op, who, sealing); /* plant:unchain */
      if (u.ok && op.byInvite) forgetWrap(); /* plant:S3-wrap-gone */
      if (u.ok) { floorlessFile = null; floorlessTries = 0; continue; }
      if (u.lim) { if (u.lim.reason === "rate") { if (sawReplay) scheduleCounterRetry(); return u.lim; } prog.refusedOut(op, u.lim); continue; }
      if (u.r.status === 0 || u.r.status >= 500 || ["rate", "no-hello", "nonce-stale", "hello-replay"].indexOf(u.why.reason) >= 0) {
        /* The invitation's one upload, and no reply: the relay may already hold it, and a later token-spent is that upload. */
        if (op.byInvite && u.r.status === 0) prog.markReplyLost(op.inviteId, u.blob && u.blob.id);
        if (sawReplay) scheduleCounterRetry();
        return u.why;
      }
      /* The invitation's one upload whose reply was lost: the relay already has it, and token-spent on the retry is that
         upload. It counts as sent, the wrap is forgotten, and the next cycle reads the answer. */
      let spentSent = false;
      spentSent = !!(op.byInvite && u.why && u.why.reason === "token-spent" && u.blob && prog.replyLost(op.inviteId)); /* plant:spent-sent */
      if (spentSent) { prog.sentOut(op, u.blob); forgetWrap(); continue; }
      /* true: the relay answered. That refusal waits; it is not kept by content hash. */
      const waits = prog.refusedOut(op, u.why, true);
      if (u.why && u.why.reason === "replay-counter") {
        sawReplay = true; /* plant:counter-retry */
        const fileKey = op.invite ? "invite:" + op.invite.id : pathKey(op.rel);
        const taken = takeFloor(u.why.floor);
        if (taken) {
          floorlessFile = null;
          floorlessTries = 0;
        } else {
          if (floorlessFile === fileKey) floorlessTries += 1;
          else { floorlessFile = fileKey; floorlessTries = 1; }
        }
      }
      if (waits && HALTS.indexOf(u.why.reason) >= 0) { floorlessFile = null; floorlessTries = 0; counterOwed = false; clearCounterRetry(); return { ok: true }; }
    }
    counterOwed = sawReplay;
    if (sawReplay || answerDue) scheduleCounterRetry();
    else clearCounterRetry();
    return { ok: true };
  }

  function onAnnounce(text) {
    let m = null;
    try { m = JSON.parse(String(text)); } catch { m = null; }
    if (table(m) && m.type === "new") kick(); /* plant:socket-kick */
  }

  function dropSocket() {
    if (!sock) return;
    const s = sock;
    sock = null;
    clearInterval(pingTimer);
    pingTimer = null;
    try { s.close(); } catch { /* gone */ }
  }

  function ensureSocket() {
    /* After the one upload the invitation's session fetches its answer and does not listen. */
    if (session && session.by === "invite" && invitedNow()) { dropSocket(); return; }
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

  /* The invitation's wrap, fetched once the session is open, and only until the invitation's one upload: after it the wrap
     is not asked for and its key is forgotten, since the relay deletes the wrap and an enrolled desk reads the team through
     the roster's wrap. This tree's relay has no wrap route, so a 404 is said as nothing. No answer, or a 500, stays "need"
     and is asked again. No refusal of this ask stops the cycle: a spent or ended token is the hello's refusal, said where
     the hello is made, and here it only means there is no wrap to read. */
  async function pullWrap() {
    const inv = typeof o.invite === "function" ? o.invite() : null;
    const key = inv && toBytes(inv.wrapKey);
    if (!key || key.length !== 32 || wrapPhase !== "need") return { ok: true };
    if (invitedNow()) { forgetWrap(); return { ok: true }; } /* plant:S3-wrap-once */
    const r = await authed("GET", "wrap");
    if (r.status === 200 && table(r.json) && table(r.json.wrap)) { wrapHeld = r.json.wrap; wrapPhase = "held"; return { ok: true }; }
    if (!r.status || r.status >= 500) return { ok: true };
    wrapPhase = "none"; /* plant:S3-wrap-refused */
    return { ok: true };
  }

  /* The invitation's one upload is the end of the wrap: it is not asked for again and the shell is told to let its key go.
     Said again after a restart, where the program remembers the upload and the shell may still hold the key. */
  function forgetWrap() {
    wrapPhase = "none";
    wrapHeld = null;
    if (typeof o.onWrapGone === "function") o.onWrapGone();
  }

  /* Opened against the team file this program holds. openInviteWrap refuses an epoch that file does not carry before it
     decrypts. The team key is handed to the shell, which keeps it and forgets the wrap key. A refusal is said once and
     the key is not installed; the invitation's one upload still goes. */
  async function openHeldWrap() {
    if (wrapPhase !== "held") return { ok: true };
    const inv = typeof o.invite === "function" ? o.invite() : null;
    const key = inv && toBytes(inv.wrapKey);
    const team = prog.heldTeam();
    if (!key || key.length !== 32 || !team || !team.doc) return { ok: true };
    const opened = B.openInviteWrap(key, { wrap: wrapHeld, teamDoc: team.doc, teamId: team.doc.id, relayTeamId: o.rt, invitationId: inv.inv });
    if (!opened.ok) { wrapPhase = "bad"; wrapHeld = null; sayOnce(opened.said); return { ok: true }; }
    if (typeof o.onTeamKey === "function") o.onTeamKey(opened.epoch, opened.key); /* plant:wrap-open */
    wrapPhase = "opened";
    wrapHeld = null;
    return { ok: true };
  }

  /* The lead's answer opened, or null. The counters it returns are not kept: the blob is not a team file. A bad blob is
     not a halt. */
  function openAnswer(r, inv, invId) {
    const who = me();
    const pin = typeof o.pin === "function" ? o.pin() : null;
    const lead = pin && pin.lead;
    if (!who || !HEX64.test(String(who.box)) || !lead || !HEX64.test(String(inv && inv.box)) || !table(r.meta)) return null;
    const m = r.meta;
    if (m.id !== invId || !toBytes(r.bytes)) return null;
    const dh = typeof o.agree === "function" ? o.agree(inv.box) : null;
    const key = answerKey(dh, { rt: o.rt, inv: invId, deskId: who.keyId, deskBox: who.box, leadBox: inv.box });
    if (!key) return null;
    const blob = { id: m.id, epoch: m.epoch, supersedes: m.supersedes == null ? null : m.supersedes, writerKeyId: m.writer,
      counter: m.counter, nonce: m.nonce, signature: m.sig, ciphertext: toBytes(r.bytes) };
    const got = B.openBlob({ blob, relayTeamId: o.rt, epoch: m.epoch, teamKey: key, trust: { lead: { keyId: lead.keyId, public: lead.public } }, counters: {} });
    if (!got.ok || got.kind !== "file" || got.path !== ANSWER_NAME || got.writerKeyId !== lead.keyId) return null;
    let doc = null;
    try { doc = JSON.parse(got.body); } catch { doc = null; }
    if (!doc || doc.v !== 1 || doc.kind !== "etiuda-join-answer" || (doc.answer !== "joined" && doc.answer !== "refused")) return null;
    if (doc.inv !== invId || doc.desk !== who.keyId) return null;
    return doc.answer;
  }

  /* After the upload: one fetch, of the answer, on the session already held. Anything else, including a missing answer,
     leaves the mirror as it is. */
  async function pullAnswer() {
    const inv = typeof o.invite === "function" ? o.invite() : null;
    const invId = inv && HEX32.test(String(inv.inv)) ? String(inv.inv) : "";
    if (!invId || !session || answerHeld) return { ok: true };
    const r = await call("GET", "b/" + invId, { auth: true });
    const answer = r.status === 200 ? openAnswer(r, inv, invId) : null;
    if (!answer) sayOnce(WAITING_SAID); /* plant:S3-wait */
    if (!answer) return { ok: true };
    answerHeld = invId;
    if (typeof o.onAnswer === "function") o.onAnswer(answer);
    return { ok: true };
  }

  /* The lead writes its answer on its own session. The blob's id is the invitation's, and its place is set after the
     signature, as an invitation's copy is. It is not a file of the mirror. */
  async function writeAnswer(spec) {
    const who = me();
    const s = spec || {};
    if (!who || !who.privateKey || who.place !== "root") return R("not-enrolled");
    if ((s.answer !== "joined" && s.answer !== "refused") || !HEX32.test(String(s.inv))
      || !/^k-[0-9a-f]{16}$/.test(String(s.deskId)) || !HEX64.test(String(s.deskBox)) || !HEX64.test(String(s.leadBox)))
      return R("bad-path");
    const dh = typeof o.agree === "function" ? o.agree(s.deskBox) : null;
    const key = answerKey(dh, { rt: o.rt, inv: String(s.inv), deskId: s.deskId, deskBox: s.deskBox, leadBox: s.leadBox });
    if (!key) return R("bad-signature");
    const named = typeof o.sealEpoch === "function" ? o.sealEpoch() : null;
    const epoch = isCount(named) ? named : 1;
    const body = JSON.stringify({ v: 1, kind: "etiuda-join-answer", answer: s.answer, inv: String(s.inv), desk: s.deskId });
    const blob = prog.sealOut({ rel: ANSWER_NAME, kind: "file", body, sha: null, place: "answer:" + s.inv, id: String(s.inv) }, who, { epoch, key });
    const lim = prog.allowUpload(blob, who.keyId);
    if (!lim.ok) return lim;
    const meta = { v: 1, id: blob.id, supersedes: blob.supersedes, epoch: blob.epoch, writer: blob.writerKeyId, counter: blob.counter,
      del: blob.deletion, sig: blob.signature, nonce: blob.nonce, place: blob.place };
    const r = await authed("PUT", "b/" + blob.id, { meta, bytes: blob.ciphertext });
    if (r.status === 200) { answerDue = null; floorlessFile = null; floorlessTries = 0; if (!counterOwed) clearCounterRetry(); return { ok: true }; }
    const why = r.refused || refusalOf(r);
    if (why && why.reason === "replay-counter") {
      answerDue = { answer: s.answer, inv: String(s.inv), deskId: s.deskId, deskBox: s.deskBox, leadBox: s.leadBox }; /* plant:answer-retry */
      const taken = takeFloor(why.floor);
      if (taken) {
        floorlessFile = null;
        floorlessTries = 0;
      } else {
        const fileKey = "answer:" + s.inv;
        if (floorlessFile === fileKey) floorlessTries += 1;
        else { floorlessFile = fileKey; floorlessTries = 1; }
      }
    }
    if (why && HALTS.indexOf(why.reason) >= 0) { answerDue = null; floorlessFile = null; floorlessTries = 0; counterOwed = false; clearCounterRetry(); return why; }
    if (answerDue) scheduleCounterRetry();
    return why;
  }

  /* The request withdrawn: where this desk's own request is owed as a deletion after its one upload, that deletion goes on
     the invitation's session under the invitation's key, superseding the request, and the invitation counts as not asked.
     Null where none is owed. */
  async function withdrawOwed() {
    const who = me(), c = ctx();
    if (c.inviteId && prog.unkept(c.inviteId)) return { ok: true };
    if (!who || !who.privateKey || !c.inviteSeal || typeof who.place !== "string") return null;
    const mine = ("desks/" + who.place.slice(5) + "/join.json").toLowerCase();
    const op = prog.owed(who, c).find(x => x.kind === "delete" && x.rel.toLowerCase() === mine);
    if (!op) return null;
    const u = await upload(op, who, { epoch: Math.max(1, prog.state().leadEpoch), key: c.inviteSeal });
    if (!u.ok) {
      const why = u.lim || u.why;
      let spent = false;
      spent = !!(why && why.reason === "token-spent"); /* plant:c5-unkept */
      if (spent) {
        prog.forgetSent(op.rel);
        if (c.inviteId) prog.markUnkept(c.inviteId);
        if (typeof o.onWithdrawUnkept === "function") o.onWithdrawUnkept();
        return { ok: true };
      }
      let held = false;
      held = !!(why && why.reason === "team-lapsed"); /* plant:c5-held */
      if (held) {
        if (typeof o.onWithdrawHeld === "function") o.onWithdrawHeld();
        return why;
      }
      return why;
    }
    prog.unmarkInvited(c.inviteId);
    answerHeld = null;
    if (typeof o.onWithdrawn === "function") o.onWithdrawn();
    return { ok: true };
  }

  async function cycle() {
    const s = await ensureSession();
    if (!s.ok) { refusedLapse(s); return s; }
    if (session && session.by === "invite" && invitedNow()) {
      const w = await withdrawOwed(); /* plant:e4-withdraw-send */
      return w || pullAnswer();
    }
    /* No request of this invitation stands at the relay, so a withdrawal the shell waits on has nothing left to take back. */
    if (session && session.by === "invite" && typeof o.onWithdrawn === "function") o.onWithdrawn();
    const w = await pullWrap();
    if (!w.ok) return w;
    if (prog.suspect()) {
      const fresh = await copyIsNew();
      if (fresh === true) prog.forgetRelay();
      if (fresh !== null) prog.settled();
    }
    const c = await catchUp(); /* plant:catch-up-first */
    if (!c.ok) { refusedLapse(c); return c; }
    await openHeldWrap();
    await retryPending();
    const f = await flush();
    if (answerDue) await writeAnswer(answerDue);
    ensureSocket();
    return f;
  }

  /* A not-enrolled answer for an invitation the relay has not taken yet: the team or the token is still on its way.
     A swept team that the relay no longer knows is not this wait, and neither is an invitation already spent. */
  function awaitingEnrol(r) {
    if (!r || r.ok || r.reason !== "not-enrolled") return false;
    const inv = typeof o.invite === "function" ? o.invite() : null;
    if (!inv || !HEX32.test(String(inv.inv)) || prog.tokenSpent(inv.inv) !== false) return false;
    const last = prog.lapse();
    if (last && last.swept !== null && relayNow() >= last.swept) return false;
    if (!enrolWaitFrom) enrolWaitFrom = clock();
    return clock() - enrolWaitFrom <= ENROL_WAIT_MS;
  }
  /* The relay has taken this desk off the team. Stop asking. The shell says so; a channel with no listener keeps the
     poll it had, so a new invitation registered after the removal can still be tried (961c). */
  function hushRemoved() {
    running = false;
    clearTimeout(retryTimer);
    clearInterval(pollTimer);
    clearInterval(pingTimer);
    dropSocket();
    session = null;
    if (!removedTold) { removedTold = true; o.onRemoved(); }
  }
  function kick() {
    if (!running) return;
    if (busy) { again = true; return; }
    busy = (async () => {
      do {
        again = false;
        try {
          const r = await cycle();
          if (r && r.ok) {
            enrolWaitFrom = 0;
            backoff = RETRY_MIN_MS;
            if (typeof o.onHere === "function") o.onHere();
          }
          else if (r && r.reason === "removed" && typeof o.onRemoved === "function") {
            /* The bearer in hand was refused. One fresh hello, on the relay's own evidence: a success means the key is on the team again. */
            session = null;
            const resumed = await openSession(); /* plant:h35-fresh-hello */
            if (resumed && resumed.ok) {
              const followed = await cycle();
              if (followed && followed.ok) {
                enrolWaitFrom = 0;
                backoff = RETRY_MIN_MS;
                if (typeof o.onHere === "function") o.onHere();
                return;
              }
            }
            hushRemoved(); return; /* plant:h35-removed-hush */
          }
          else if (awaitingEnrol(r)) {
            clearTimeout(retryTimer);
            if (running) { retryTimer = setTimeout(kick, backoff); if (retryTimer.unref) retryTimer.unref(); } /* plant:h35-enrol-retry */
            backoff = Math.min(backoff * 2, RETRY_MAX_MS);
          } else {
            backoff = RETRY_MIN_MS;
            if (r && !r.ok && r.reason) sayOnce("the relay: " + r.said);
          }
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
    pollTimer = setInterval(() => { noteStep(); if (!sock) kick(); }, pollMs);
    if (pollTimer.unref) pollTimer.unref();
    kick();
  }

  async function stop() {
    running = false;
    clearTimeout(settle); clearTimeout(retryTimer); clearCounterRetry(); clearInterval(pollTimer); clearInterval(pingTimer);
    closeWatchers();
    floorlessFile = null;
    floorlessTries = 0;
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
    /* The session is this key's own: the relay has enrolled it. */
    enrolled: () => !!session && session.by === "key",
    socketOpen: () => !!sock,
    writeAnswer,
    lapse: lapseView,
  };
}

module.exports = {
  TEAM_NAME, ECHO_MS, BRANCH_PREFIX, HEAD_PREFIX, INVITE_SEAL_INFO, DESK_COPY_INFO, ANSWER_INFO, ANSWER_NAME, INVITE_UPLOAD_MAX,
  SESSION_KEEP_MS, WAITING_SAID, LAPSE_STATES, RELAY_CHALLENGE_MS,
  lapseKept, lapseStep,
  canon, signedBytes, helloBytes, inviteSealKey, inviteWrapKey, deskCopyOf, answerKey, relayOf, rosterOf, branchIdOf, inPlace, diskIO, writeWhole, stateOf,
  createProgram, createChannel, newestEdition,
  /* The two signature kinds, each under its own prefix, so neither verifies as the other (E5). */
  verifyUploadSignature: (publicKey, payload, signature) => B.verifyUpload(publicKey, Buffer.alloc(0), toBytes(payload), signature),
  verifyDeskSignature: (publicKey, body, signature) => {
    const b = toBytes(body);
    return !!b && B.verifySigned(publicKey, BRANCH_PREFIX, b, signature);
  },
};
