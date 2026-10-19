"use strict";
/* The relay's blob rules, shared by both shells: the bytes, seal and open, the upload signature, the path and
   the writer's place, the counter and rev floors, the limits and the reasons. No I/O and no state: every key,
   floor and stamp list is the caller's, and every answer is a value. relay/test/target-contract.md is the
   contract for each byte. Trust is the caller's: a blob names its writer, and only a key the caller passes
   from the team file it verified is used to judge it. Nothing from outside makes this throw; seal() alone
   throws, on arguments that are its own caller's fault. */
const crypto = require("node:crypto");

const BLOB_MAX = 50 * 1024 * 1024;
const TEAM_MAX = 1024 * 1024 * 1024;
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60 * 1000;
const PAD_FLOOR = 4096;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const AAD_LABEL = "etiuda-relay-blob";
/* Neither a prefix of the engine's other signed prefixes nor one of them a prefix of this. */
const UPLOAD_PREFIX = "etiuda-relay-upload\n";
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

const REASONS = Object.freeze({
  "no-hello": "The relay serves a team only after a signed hello.",
  "not-enrolled": "That key is not enrolled for this team.",
  "hello-replay": "That hello has already been used.",
  "nonce-stale": "That challenge has expired.",
  "bad-signature": "That signature does not hold, so the file was left out.",
  "token-spent": "This invitation has already been used.",
  "token-tries": "This invitation has been tried too many times.",
  "removed": "That desk is no longer on the team.",
  "replay-counter": "An older copy of that file was left out.",
  "replay-rev": "An older team file was left out.",
  "wrong-team": "That team file is not this desk's pinned team.",
  "epoch": "That file names an epoch this team file does not carry.",
  "not-roster": "That key is not on the signed team file, so the file was left out.",
  "outside-place": "That file sits outside its writer's place, so it was left out.",
  "bad-path": "That path stays outside the team folder.",
  "blob-size": "That file is larger than the relay accepts.",
  "team-size": "The team has reached the space the relay keeps.",
  "rate": "That many uploads in a minute is more than the relay accepts.",
  "forged-delete": "A deletion needs its writer's signature, so nothing was removed.",
  "superseded": "An older blob of that chain is no longer served.",
  "expired": "That deletion record has passed its keep.",
  "missing": "The relay has no such blob.",
  "tmp": "A temporary file stays on this desk.",
  "echo": "A file just received stays as it is.",
});

function refusal(reason) {
  if (!Object.prototype.hasOwnProperty.call(REASONS, reason)) throw new TypeError("relay blob: no reason " + reason);
  return { ok: false, reason: reason, said: REASONS[reason], served: false };
}

const HEX32 = /^[0-9a-f]{32}$/;
const HEX24 = /^[0-9a-f]{24}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
/* A key id, a desk id and a team id take the engine's id shape, so none can carry a newline or a separator. */
const ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const isId = v => typeof v === "string" && ID_RE.test(v);
/* A desk id is an id the program can write: the same shape, and not a reserved device name such as con or nul. */
function isDeskId(v) {
  if (!isId(v)) return false;
  if (RESERVED.test(v)) return false; /* plant:desk-id */
  return true;
}
const isCount = v => Number.isSafeInteger(v) && v >= 1;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function bytesOf(v) {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  return null;
}

/* The associated data, or null where a field cannot be carried. `supersedes` absent is the line "-". */
function aadOf(fields) {
  if (!fields || typeof fields !== "object") return null;
  const rt = fields.relayTeamId, epoch = fields.epoch, id = fields.id, writer = fields.writerKeyId;
  const counter = fields.counter, sup = fields.supersedes == null ? null : fields.supersedes;
  if (typeof rt !== "string" || !HEX32.test(rt) || !isCount(epoch) || typeof id !== "string" || !HEX32.test(id)) return null;
  if ((sup !== null && (typeof sup !== "string" || !HEX32.test(sup))) || !isId(writer) || !isCount(counter)) return null;
  return Buffer.from([AAD_LABEL, rt, String(epoch), id, sup === null ? "-" : sup, writer, String(counter)].join("\n") + "\n", "utf8");
}

function padStep(n) {
  let step = PAD_FLOOR;
  while (step < n) step *= 2;
  return step;
}

function frame(doc) {
  const json = Buffer.from(JSON.stringify({ kind: doc.kind, path: doc.path, body: doc.body }), "utf8");
  const out = Buffer.alloc(padStep(4 + json.length));
  out.writeUInt32BE(json.length, 0);
  json.copy(out, 4);
  return out;
}

/* The frame's document, or null: the length inside the plaintext, the plaintext the least step that holds it,
   zeros after it, and the JSON exactly kind, path and body. */
function unframe(plain) {
  const p = bytesOf(plain);
  if (!p || p.length < 4) return null;
  const len = p.readUInt32BE(0);
  if (4 + len > p.length || padStep(4 + len) !== p.length) return null;
  for (let i = 4 + len; i < p.length; i++) if (p[i] !== 0) return null;
  let doc;
  try { doc = JSON.parse(UTF8.decode(p.subarray(4, 4 + len))); } catch { return null; }
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || Object.keys(doc).sort().join(",") !== "body,kind,path") return null;
  if ((doc.kind !== "file" && doc.kind !== "delete") || typeof doc.path !== "string" || typeof doc.body !== "string") return null;
  if (doc.kind === "delete" && doc.body !== "") return null;
  return { kind: doc.kind, path: doc.path, body: doc.body };
}

function publicKeyOf(hex) {
  if (typeof hex !== "string" || !HEX64.test(hex)) return null;
  try {
    return crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(hex, "hex")]), format: "der", type: "spki" });
  } catch { return null; }
}

function privateKeyOf(key) {
  try {
    const k = key instanceof crypto.KeyObject ? key
      : crypto.createPrivateKey({ key: typeof key === "string" ? Buffer.from(key, "hex") : key, format: "der", type: "pkcs8" });
    return k.type === "private" && k.asymmetricKeyType === "ed25519" ? k : null;
  } catch { return null; }
}

/* The prefixes a document of this protocol is signed under. The team file's own scheme carries none. A prefix
   outside this list is refused, so nothing but these can be verified. */
const SIGNED_PREFIXES = Object.freeze(["", "etiuda-relay-head\n", "etiuda-desk-branch\n"]);

/* A general Ed25519 verify of `bytes` under a public key as 64 hex, for a signature as 128 hex; false for anything else. */
function verifySig(publicHex, bytes, signatureHex) {
  try {
    const key = publicKeyOf(publicHex), b = bytesOf(bytes);
    if (!key || !b || typeof signatureHex !== "string" || !HEX128.test(signatureHex)) return false;
    return crypto.verify(null, b, key, Buffer.from(signatureHex, "hex"));
  } catch { return false; }
}

/* Verify `bytes` under one prefix from the list above. The prefix is concatenated in front, except the empty prefix,
   which is the team file's own scheme and adds nothing. Any other prefix is refused. */
function verifySigned(publicHex, prefix, bytes, signatureHex) {
  if (SIGNED_PREFIXES.indexOf(prefix) < 0) return false; /* plant:signed-prefix */
  const body = bytesOf(bytes);
  if (!body) return false;
  const covered = prefix ? Buffer.concat([Buffer.from(prefix, "utf8"), body]) : body;
  return verifySig(publicHex, covered, signatureHex);
}

function uploadBytes(aad, ciphertext) {
  return Buffer.concat([Buffer.from(UPLOAD_PREFIX, "utf8"), aad, ciphertext]);
}

function signUpload(privateKey, aad, ciphertext) {
  const key = privateKeyOf(privateKey), a = bytesOf(aad), c = bytesOf(ciphertext);
  if (!key || !a || !c) throw new TypeError("relay blob: an upload is signed with an Ed25519 private key over bytes");
  return crypto.sign(null, uploadBytes(a, c), key).toString("hex");
}

function verifyUpload(publicHex, aad, ciphertext, signatureHex) {
  try {
    const key = publicKeyOf(publicHex), a = bytesOf(aad), c = bytesOf(ciphertext);
    if (!key || !a || !c || typeof signatureHex !== "string" || !HEX128.test(signatureHex)) return false;
    return crypto.verify(null, uploadBytes(a, c), key, Buffer.from(signatureHex, "hex"));
  } catch { return false; }
}

/* `writer` is { keyId, privateKey }, the private key a KeyObject or PKCS8 DER as bytes or hex. The nonce is
   always fresh, the id fresh unless given, and `place` travels in the clear for the relay alone. */
function seal(opts) {
  const o = opts || {};
  const kind = o.kind === undefined ? "file" : o.kind;
  const id = o.id == null ? crypto.randomBytes(16).toString("hex") : o.id;
  const writer = o.writer || {};
  const fields = { relayTeamId: o.relayTeamId, epoch: o.epoch, id: id, supersedes: o.supersedes == null ? null : o.supersedes,
    writerKeyId: writer.keyId, counter: o.counter };
  const aad = aadOf(fields);
  const key = bytesOf(o.teamKey), priv = privateKeyOf(writer.privateKey);
  const body = kind === "delete" ? "" : (o.body === undefined ? "" : o.body);
  const place = o.place == null ? null : o.place;
  if (!aad) throw new TypeError("relay blob: seal was given a field the associated data cannot carry");
  if ((kind !== "file" && kind !== "delete") || typeof o.path !== "string" || typeof body !== "string")
    throw new TypeError("relay blob: seal takes a kind of file or delete, a path and a body as text");
  if (!key || key.length !== KEY_BYTES || !priv) throw new TypeError("relay blob: seal takes a 32-byte team key and an Ed25519 writer");
  if (place !== null && place !== "root" && !(typeof place === "string" && place.startsWith("desk:") && isId(place.slice(5))))
    throw new TypeError("relay blob: a place is root or desk:<desk id>");
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(frame({ kind: kind, path: o.path, body: body })), cipher.final(), cipher.getAuthTag()]);
  return {
    id: id, relayTeamId: fields.relayTeamId, epoch: fields.epoch, supersedes: fields.supersedes, writerKeyId: fields.writerKeyId,
    counter: fields.counter, place: place, deletion: kind === "delete", nonce: nonce.toString("hex"), ciphertext: ciphertext,
    signature: crypto.sign(null, uploadBytes(aad, ciphertext), priv).toString("hex"),
  };
}

/* A path key, by NTFS's rule. NTFS uppercases each UTF-16 code unit through one fixed
   table and compares those units. One unit goes in and one unit comes out: the table
   does not expand a unit into several (sharp s stays sharp s, the fi ligature stays a
   ligature) and it does not fold one character onto a different letter (the Kelvin
   sign stays the Kelvin sign, dotless i stays dotless i). toUpperCase is that simple
   map where it leaves one unit, except the runs in KEPT, which the table leaves
   unchanged, and the runs in FORCED, which the table uppercases and toUpperCase
   expands. Both lists were measured from RtlUpcaseUnicodeChar, the table NTFS
   compares with. A run is first unit, last unit, and for FORCED the uppercase of the
   first; every unit in the run maps by the same distance. A surrogate stays itself,
   so a character outside the basic plane is not folded. The key is the lowercase of
   that uppercase where the lowercase is one unit and uppercases back to the same
   unit, so a letter and its capital share a key and an ASCII name's key stays the
   lower one the maps already store (desks, guide.ec). */
const KEPT = [
  [0xb5, 0xb5], [0x131, 0x131], [0x17f, 0x17f], [0x19b, 0x19b], [0x1c5, 0x1c5], [0x1c8, 0x1c8],
  [0x1cb, 0x1cb], [0x1f2, 0x1f2], [0x23f, 0x240], [0x252, 0x252], [0x25c, 0x25c], [0x261, 0x261],
  [0x264, 0x266], [0x26a, 0x26a], [0x26c, 0x26c], [0x282, 0x282], [0x287, 0x287], [0x29d, 0x29e],
  [0x345, 0x345], [0x3c2, 0x3c2], [0x3d0, 0x3d1], [0x3d5, 0x3d6], [0x3f0, 0x3f1], [0x3f3, 0x3f3],
  [0x3f5, 0x3f5], [0x525, 0x525], [0x527, 0x527], [0x529, 0x529], [0x52b, 0x52b], [0x52d, 0x52d],
  [0x52f, 0x52f], [0x10d0, 0x10fa], [0x10fd, 0x10ff], [0x13f8, 0x13fd], [0x1c80, 0x1c88], [0x1c8a, 0x1c8a],
  [0x1d8e, 0x1d8e], [0x1e9b, 0x1e9b], [0x1fbe, 0x1fbe], [0x2c5f, 0x2c5f], [0x2cec, 0x2cec], [0x2cee, 0x2cee],
  [0x2cf3, 0x2cf3], [0x2d27, 0x2d27], [0x2d2d, 0x2d2d], [0xa661, 0xa661], [0xa699, 0xa699], [0xa69b, 0xa69b],
  [0xa791, 0xa791], [0xa793, 0xa794], [0xa797, 0xa797], [0xa799, 0xa799], [0xa79b, 0xa79b], [0xa79d, 0xa79d],
  [0xa79f, 0xa79f], [0xa7a1, 0xa7a1], [0xa7a3, 0xa7a3], [0xa7a5, 0xa7a5], [0xa7a7, 0xa7a7], [0xa7a9, 0xa7a9],
  [0xa7b5, 0xa7b5], [0xa7b7, 0xa7b7], [0xa7b9, 0xa7b9], [0xa7bb, 0xa7bb], [0xa7bd, 0xa7bd], [0xa7bf, 0xa7bf],
  [0xa7c1, 0xa7c1], [0xa7c3, 0xa7c3], [0xa7c8, 0xa7c8], [0xa7ca, 0xa7ca], [0xa7cd, 0xa7cd], [0xa7d1, 0xa7d1],
  [0xa7d7, 0xa7d7], [0xa7d9, 0xa7d9], [0xa7db, 0xa7db], [0xa7f6, 0xa7f6], [0xab53, 0xab53], [0xab70, 0xabbf],
];
const FORCED = [
  [0x1f80, 0x1f87, 0x1f88],
  [0x1f90, 0x1f97, 0x1f98],
  [0x1fa0, 0x1fa7, 0x1fa8],
  [0x1fb3, 0x1fb3, 0x1fbc],
  [0x1fc3, 0x1fc3, 0x1fcc],
  [0x1ff3, 0x1ff3, 0x1ffc],
];
function runAt(runs, u) {
  let lo = 0, hi = runs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const run = runs[mid];
    if (u < run[0]) hi = mid - 1;
    else if (u > run[1]) lo = mid + 1;
    else return run;
  }
  return null;
}
function upcaseUnit(u) {
  if (u >= 0xD800 && u <= 0xDFFF) return u;
  const forced = runAt(FORCED, u);
  if (forced) return forced[2] + (u - forced[0]);
  if (runAt(KEPT, u)) return u;
  const up = String.fromCharCode(u).toUpperCase();
  if (up.length !== 1) return u;
  return up.charCodeAt(0);
}
function ntfsKey(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const up = upcaseUnit(s.charCodeAt(i));
    const low = String.fromCharCode(up).toLowerCase();
    if (low.length === 1 && upcaseUnit(low.charCodeAt(0)) === up) out += low;
    else out += String.fromCharCode(up);
  }
  return out;
}
/* The full Unicode fold, which NTFS does not use. The assignment after it replaces
   that fold, and lifting the assignment returns it. */
function fold(s) {
  let key = s.toUpperCase().toLowerCase();
  key = ntfsKey(s); /* plant:ntfs-fold */
  return key;
}

/* { ok, path, segments, folded } for a path inside the mirror, `.` segments dropped and case kept, or bad-path. */
function checkPath(path) {
  const bad = refusal("bad-path");
  if (typeof path !== "string" || path === "") return bad;
  if (path.indexOf("\\") !== -1) return bad;
  if (path.charAt(0) === "/") return bad;
  if (/^[A-Za-z]:/.test(path)) return bad;
  if (path.indexOf(":") !== -1) return bad;
  const raw = path.split("/");
  if (raw.indexOf("..") !== -1) return bad;
  if (/[\u0000-\u001f\u007f<>"|?*]/.test(path)) return bad;
  const segments = [];
  for (const s of raw) {
    if (s === ".") continue;
    if (s === "") return bad;
    if (/[. ]$/.test(s)) return bad;
    if (RESERVED.test(s)) return bad;
    segments.push(s);
  }
  if (!segments.length) return bad;
  return { ok: true, path: segments.join("/"), segments: segments, folded: segments.map(fold) };
}

/* The one signer `trust` holds for that key id, or null. `trust` is { lead: { keyId, public }, desks: [{ deskId,
   keyId, public }] }, from a team file the caller verified; a key id it holds twice is held by nobody. */
function writerOf(trust, keyId) {
  if (!isId(keyId) || !trust || typeof trust !== "object") return null;
  const hits = [];
  const lead = trust.lead;
  if (lead && typeof lead === "object" && lead.keyId === keyId && publicKeyOf(lead.public))
    hits.push({ role: "lead", keyId: keyId, public: lead.public });
  for (const d of Array.isArray(trust.desks) ? trust.desks : []) {
    if (d && typeof d === "object" && d.keyId === keyId && isDeskId(d.deskId) && publicKeyOf(d.public))
      hits.push({ role: "desk", deskId: d.deskId, keyId: keyId, public: d.public });
  }
  return hits.length === 1 ? hits[0] : null;
}

/* Where that writer's file lands: the lead anywhere but desks/, a desk under desks/<its id>/ alone, written
   with its own id. Outside it a file is outside-place and a deletion forged-delete. */
function placeOf(path, role, kind) {
  const p = checkPath(path);
  if (!p.ok) return p;
  const outside = refusal(kind === "delete" ? "forged-delete" : "outside-place");
  if (!role || typeof role !== "object") return outside;
  if (role.role === "lead") return p.folded[0] === "desks" ? outside : { ok: true, path: p.path };
  if (role.role !== "desk" || !isId(role.deskId)) return outside;
  if (p.folded.length < 3 || p.folded[0] !== "desks" || p.folded[1] !== fold(role.deskId)) return outside;
  return { ok: true, path: ["desks", role.deskId].concat(p.segments.slice(2)).join("/") };
}

/* A floor map is the caller's plain object, kept across restarts, `{}` on a first run. An omitted map, and a
   floor that is not a count, fail closed: a caller that forgot its floors must not take a replay. */
function floorIn(map, key) {
  if (map == null) return null;
  if (typeof map !== "object") return null;
  if (!own(map, key)) return 0;
  const v = map[key];
  return Number.isSafeInteger(v) && v >= 0 ? v : null;
}

function raised(map, key, value) {
  const next = {};
  if (map && typeof map === "object") {
    for (const k of Object.keys(map)) if (k.startsWith("c\n") || k.startsWith("r\n")) next[k] = map[k];
  }
  const floor = floorIn(next, key);
  if (floor !== null && value > floor) next[key] = value;
  return next;
}

const counterKey = (writer, epoch) => "c\n" + writer + "\n" + epoch;
const revKey = t => "r\n" + t.teamId + "\n" + t.leadKeyId + "\n" + t.epoch;
const revShaped = t => !!t && typeof t === "object" && isId(t.teamId) && isId(t.leadKeyId) && isCount(t.epoch) && isCount(t.rev);

/* A counter above the floor kept for that writer and epoch, or replay-counter. */
function counterFresh(counters, writer, epoch, counter) {
  if (!isId(writer) || !isCount(epoch) || !isCount(counter)) return refusal("replay-counter");
  const floor = floorIn(counters, counterKey(writer, epoch));
  return floor !== null && counter > floor ? { ok: true } : refusal("replay-counter");
}

function raiseCounter(counters, writer, epoch, counter) {
  if (!isId(writer) || !isCount(epoch) || !isCount(counter)) return raised(counters, "", 0);
  return raised(counters, counterKey(writer, epoch), counter);
}

/* True when a higher epoch is already kept for this team and lead key. A key that is present refuses even when its
   floor value is not a count, so a damaged record fails closed. Keys that are not this pair's rev floors are ignored. */
function epochAbove(revs, t) {
  if (!revs || typeof revs !== "object") return false;
  const prefix = "r\n" + t.teamId + "\n" + t.leadKeyId + "\n";
  for (const k of Object.keys(revs)) {
    if (!own(revs, k) || k.length <= prefix.length || k.slice(0, prefix.length) !== prefix) continue;
    const rest = k.slice(prefix.length);
    if (!/^[0-9]+$/.test(rest)) continue;
    const ep = Number(rest);
    if (Number.isSafeInteger(ep) && ep > t.epoch) return true;
  }
  return false;
}

/* replay-rev when the file is not shaped, or when an older epoch than one already kept is offered. Otherwise null,
   and the caller applies the floor of this epoch. */
function olderEpoch(revs, t) {
  if (!revShaped(t)) return refusal("replay-rev");
  if (epochAbove(revs, t)) return refusal("replay-rev"); /* plant:epoch-above */
  return null;
}

/* A team file loaded: an older epoch than one already kept is replay-rev whatever its rev, and so is a rev that is
   not above the floor for its team, lead key and epoch. The floor is raised only when the file is taken. */
function revLoad(revs, t) {
  const blocked = olderEpoch(revs, t);
  if (blocked) return blocked;
  const floor = floorIn(revs, revKey(t));
  if (floor === null || t.rev <= floor) return refusal("replay-rev");
  return { ok: true, revs: raised(revs, revKey(t), t.rev) };
}

/* A team file a blob is judged under: at its own epoch's floor or above. A higher epoch kept beside it does not
   change this floor. An older epoch is refused when the file is loaded, not here. */
function revCurrent(revs, t) {
  if (!revShaped(t)) return refusal("replay-rev");
  const floor = floorIn(revs, revKey(t));
  return floor !== null && t.rev >= floor ? { ok: true } : refusal("replay-rev");
}

function checkBlobSize(size) {
  return Number.isSafeInteger(size) && size >= 0 && size <= BLOB_MAX ? { ok: true } : refusal("blob-size");
}

function checkTeamSize(used, size, max) {
  const cap = max === undefined ? TEAM_MAX : max;
  if (![used, size, cap].every(v => Number.isSafeInteger(v) && v >= 0) || used + size > cap) return refusal("team-size");
  return { ok: true, used: used + size };
}

/* `stamps` are one writer's upload times in ms; those in the sliding window count, and the 61st is refused. */
function checkRate(stamps, now) {
  if (!Number.isFinite(now)) return refusal("rate");
  const kept = (Array.isArray(stamps) ? stamps : []).filter(t => Number.isFinite(t) && now - t < RATE_WINDOW_MS);
  if (kept.length >= RATE_MAX) return refusal("rate");
  return { ok: true, stamps: kept.concat([now]) };
}

/* A program's first line for a blob it takes, in the order whose reasons the contract fixes. `relayTeamId`,
   `epoch` and `teamKey` are the pinned team's and its verified team file's, `trust` its signers, `counters`
   the floor map. Success carries the counters to keep; nothing is raised on a refusal. */
function openBlob(input) {
  try { return opened(input || {}); } catch { return refusal("bad-signature"); }
}

function opened(input) {
  const b = input.blob;
  if (!b || typeof b !== "object") return refusal("bad-signature");
  const ct = bytesOf(b.ciphertext);
  if (ct && ct.length > BLOB_MAX) return refusal("blob-size");
  const f = { relayTeamId: input.relayTeamId, epoch: b.epoch, id: b.id, supersedes: b.supersedes == null ? null : b.supersedes,
    writerKeyId: b.writerKeyId, counter: b.counter };
  const nonce = b.nonce, signature = b.signature;
  /* A blob may come without its team, as a fetch hands it; one that names another team fails closed. */
  if (b.relayTeamId != null && b.relayTeamId !== input.relayTeamId) return refusal("bad-signature");
  const aad = aadOf(f);
  if (!aad || !ct || ct.length < PAD_FLOOR + TAG_BYTES || padStep(ct.length - TAG_BYTES) !== ct.length - TAG_BYTES
    || typeof nonce !== "string" || !HEX24.test(nonce) || typeof signature !== "string" || !HEX128.test(signature))
    return refusal("bad-signature");
  const role = writerOf(input.trust, f.writerKeyId);
  if (!role) return refusal("not-roster");
  if (!verifyUpload(role.public, aad, ct, signature)) return refusal("bad-signature");
  if (!isCount(input.epoch) || f.epoch !== input.epoch) return refusal("epoch");
  const fresh = counterFresh(input.counters, f.writerKeyId, f.epoch, f.counter);
  if (!fresh.ok) return fresh;
  const key = bytesOf(input.teamKey);
  if (!key || key.length !== KEY_BYTES) return refusal("bad-signature");
  let plain;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "hex"), { authTagLength: TAG_BYTES });
    d.setAAD(aad);
    d.setAuthTag(ct.subarray(ct.length - TAG_BYTES));
    plain = Buffer.concat([d.update(ct.subarray(0, ct.length - TAG_BYTES)), d.final()]);
  } catch { return refusal("bad-signature"); }
  const doc = unframe(plain);
  if (!doc) return refusal("bad-signature");
  const place = placeOf(doc.path, role, doc.kind);
  if (!place.ok) return place;
  const out = { ok: true, kind: doc.kind, path: place.path, writerKeyId: f.writerKeyId, role: role.role, epoch: f.epoch,
    counter: f.counter, id: f.id, supersedes: f.supersedes, counters: raiseCounter(input.counters, f.writerKeyId, f.epoch, f.counter) };
  if (doc.kind === "delete") out.deleted = true;
  else out.body = doc.body;
  return out;
}

/* An invitation's wrap of one epoch's team key. The wrap key is 32 bytes of HKDF-SHA256 over the invitation's
   16-byte secret, salt empty, info etiuda-invite-wrap. The associated data is UTF-8 etiuda-invite-wrap, the relay
   team, the team id, the relay's invitation id and the epoch, each on its own line, so a wrap moved to any other
   of those does not open. ct is hex of a 12-byte nonce, then AES-256-GCM of the JSON {epoch, key} with key as 64
   hex, then the 16-byte tag. The relay keeps that ciphertext and cannot open it. A wrap whose epoch is not the
   team file's is refused before it is decrypted, and said with the epoch reason. */
const INVITE_WRAP_INFO = "etiuda-invite-wrap";

function inviteWrapKey(secretHex) {
  if (typeof secretHex !== "string" || !HEX32.test(secretHex)) return null;
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(secretHex, "hex"), Buffer.alloc(0), Buffer.from(INVITE_WRAP_INFO, "utf8"), 32));
}

function inviteWrapAad(fields) {
  if (!fields || typeof fields !== "object") return null;
  const rt = fields.relayTeamId, team = fields.teamId, inv = fields.invitationId, epoch = fields.epoch;
  if (typeof rt !== "string" || !HEX32.test(rt) || !isId(team) || typeof inv !== "string" || !HEX32.test(inv) || !isCount(epoch)) return null;
  return Buffer.from([INVITE_WRAP_INFO, rt, team, inv, String(epoch)].join("\n") + "\n", "utf8");
}

/* The team file the wrap is opened against, by its shape alone: this team, this relay, an epoch. The signature
   is the caller's, judged before the file is passed here, so a file is not trusted for naming its own signer. */
function inviteTeamDoc(doc, teamId, relayTeamId) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  if (doc.kind !== "etiuda-team" || doc.id !== teamId) return null;
  const c = doc.channel;
  if (!c || typeof c !== "object" || Array.isArray(c) || c.kind !== "relay") return null;
  if (c.rt !== undefined && c.relay !== undefined && c.rt !== c.relay) return null;
  const rt = c.rt !== undefined ? c.rt : c.relay;
  if (rt !== relayTeamId || !isCount(doc.epoch)) return null;
  return doc;
}

function sealInviteWrap(opts) {
  const o = opts || {};
  const epoch = o.epoch;
  const keyBytes = bytesOf(o.key) || (typeof o.key === "string" && HEX64.test(o.key) ? Buffer.from(o.key, "hex") : null);
  const given = bytesOf(o.wrapKey);
  const wrapKey = given && given.length === KEY_BYTES ? given : inviteWrapKey(o.secret);
  const aad = inviteWrapAad({ relayTeamId: o.relayTeamId, teamId: o.teamId, invitationId: o.invitationId, epoch: epoch });
  const nonce = o.nonce == null ? crypto.randomBytes(NONCE_BYTES) : bytesOf(o.nonce);
  if (!aad || !wrapKey || wrapKey.length !== KEY_BYTES || !keyBytes || keyBytes.length !== KEY_BYTES || !nonce || nonce.length !== NONCE_BYTES)
    throw new TypeError("relay blob: an invitation wrap takes a 32-byte team key, a 32-byte wrap key and fields the associated data can carry");
  const plain = Buffer.from(JSON.stringify({ epoch: epoch, key: keyBytes.toString("hex") }), "utf8");
  const cipher = crypto.createCipheriv("aes-256-gcm", wrapKey, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const ct = Buffer.concat([nonce, cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return { epoch: epoch, ct: ct.toString("hex") };
}

function openInviteWrap(wrapKey, input) {
  const o = input || {};
  const key = bytesOf(wrapKey);
  const wrap = o.wrap;
  const doc = inviteTeamDoc(o.teamDoc, o.teamId, o.relayTeamId);
  if (!key || key.length !== KEY_BYTES || !wrap || typeof wrap !== "object" || Array.isArray(wrap) || !doc) return refusal("bad-signature");
  if (!isCount(wrap.epoch) || typeof wrap.ct !== "string" || !/^[0-9a-f]+$/.test(wrap.ct) || wrap.ct.length % 2 !== 0 || wrap.ct.length < (NONCE_BYTES + TAG_BYTES) * 2)
    return refusal("bad-signature");
  if (wrap.epoch !== doc.epoch) return refusal("epoch"); /* plant:wrap-epoch */
  const aad = inviteWrapAad({ relayTeamId: o.relayTeamId, teamId: o.teamId, invitationId: o.invitationId, epoch: wrap.epoch });
  if (!aad) return refusal("bad-signature");
  const raw = Buffer.from(wrap.ct, "hex");
  let plain;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, NONCE_BYTES), { authTagLength: TAG_BYTES });
    d.setAAD(aad);
    d.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    plain = Buffer.concat([d.update(raw.subarray(NONCE_BYTES, raw.length - TAG_BYTES)), d.final()]);
  } catch { return refusal("bad-signature"); }
  let body;
  try { body = JSON.parse(UTF8.decode(plain)); } catch { return refusal("bad-signature"); }
  if (!body || typeof body !== "object" || Array.isArray(body) || body.epoch !== wrap.epoch || typeof body.key !== "string" || !HEX64.test(body.key))
    return refusal("bad-signature");
  return { ok: true, epoch: wrap.epoch, key: Buffer.from(body.key, "hex") };
}

/* The contract's open: the secret in, the team key out, or a refusal. The desk, which does not keep the secret,
   opens with the wrap key it derived at yes (openInviteWrap). */
function openWrap(input) {
  const i = input || {};
  const key = inviteWrapKey(i.secret);
  if (!key) return refusal("bad-signature");
  return openInviteWrap(key, i);
}

module.exports = {
  BLOB_MAX, TEAM_MAX, RATE_MAX, RATE_WINDOW_MS, PAD_FLOOR, NONCE_BYTES, TAG_BYTES, KEY_BYTES, AAD_LABEL, UPLOAD_PREFIX,
  REASONS, refusal, isId, isDeskId, aadOf, padStep, frame, unframe, uploadBytes, signUpload, verifyUpload, verifySigned, seal, openBlob,
  inviteWrapKey, inviteWrapAad, sealInviteWrap, openInviteWrap, openWrap,
  checkPath, writerOf, placeOf, counterFresh, raiseCounter, revLoad, revCurrent, checkBlobSize, checkTeamSize, checkRate,
};
