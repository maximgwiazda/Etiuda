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

/* Case folded both ways, so a letter whose capital is ASCII compares as that letter. */
const fold = s => s.toUpperCase().toLowerCase();

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

module.exports = {
  BLOB_MAX, TEAM_MAX, RATE_MAX, RATE_WINDOW_MS, PAD_FLOOR, NONCE_BYTES, TAG_BYTES, KEY_BYTES, AAD_LABEL, UPLOAD_PREFIX,
  REASONS, refusal, isId, isDeskId, aadOf, padStep, frame, unframe, uploadBytes, signUpload, verifyUpload, verifySigned, seal, openBlob,
  checkPath, writerOf, placeOf, counterFresh, raiseCounter, revLoad, revCurrent, checkBlobSize, checkTeamSize, checkRate,
};
