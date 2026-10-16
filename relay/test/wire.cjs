"use strict";

/* Byte rules the reference targets share. target-contract.md is the contract. */

const crypto = require("crypto");

const BLOB_MAX = 50 * 1024 * 1024;
const TEAM_MAX = 1024 * 1024 * 1024;
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60 * 1000;
const TOKEN_TRIES = 20;
const DELETE_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const NONCE_LIFE_MS = 5 * 60 * 1000;
const ECHO_MS = 60 * 60 * 1000;
const PAD_FLOOR = 4096;

const UPLOAD_PREFIX = Buffer.from("etiuda-relay-upload\n", "utf8");
const DESK_PREFIX = Buffer.from("etiuda-desk-branch\n", "utf8");
const HEAD_PREFIX = Buffer.from("etiuda-relay-head\n", "utf8");
const AAD_LABEL = "etiuda-relay-blob";
const HELLO_LABEL = "etiuda-relay-hello";
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

function randomId() {
  return crypto.randomBytes(16).toString("hex");
}

function teamKey() {
  return crypto.randomBytes(32);
}

function pathId(path) {
  return crypto.createHash("sha256").update(String(path), "utf8").digest("hex").slice(0, 32);
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function generateKey() {
  const pair = crypto.generateKeyPairSync("ed25519");
  const publicKey = Buffer.from(pair.publicKey.export({ type: "spki", format: "der" }).subarray(SPKI_ED25519.length)).toString("hex");
  const privateKey = pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("hex");
  return { keyId: publicKey, publicKey: publicKey, privateKey: privateKey };
}

function privateKeyOf(hex) {
  return crypto.createPrivateKey({ key: Buffer.from(hex, "hex"), type: "pkcs8", format: "der" });
}

function publicKeyOf(hex) {
  const raw = Buffer.from(String(hex), "hex");
  const spki = Buffer.concat([SPKI_ED25519, raw]);
  return crypto.createPublicKey({ key: spki, type: "spki", format: "der" });
}

function sign(privateHex, message) {
  return crypto.sign(null, message, privateKeyOf(privateHex)).toString("hex");
}

function verify(publicHex, message, signatureHex) {
  try {
    const sig = String(signatureHex || "");
    if (!/^[0-9a-f]{128}$/.test(sig)) return false;
    return crypto.verify(null, message, publicKeyOf(publicHex), Buffer.from(sig, "hex"));
  } catch (e) {
    return false;
  }
}

function canon(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (typeof v === "object") {
    const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

/* The bytes a team-file or head signature covers, sig.value omitted, the way the engine signs. */
function signedBytes(doc) {
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
  return Buffer.from(canon(copy), "utf8");
}

function signTeam(doc, privateHex) {
  const signed = Object.assign({}, doc, { sig: { alg: "Ed25519", keyId: doc.lead.keyId } });
  signed.sig.value = sign(privateHex, signedBytes(signed));
  return signed;
}

function teamGenuine(doc) {
  try {
    if (!doc || !doc.lead || !doc.sig) return false;
    return verify(doc.lead.keyId, signedBytes(doc), doc.sig.value);
  } catch (e) {
    return false;
  }
}

function signHead(fields, privateHex) {
  const doc = {
    kind: "etiuda-head",
    relay: fields.relay,
    epoch: fields.epoch,
    rev: fields.rev,
    time: fields.time,
    keyId: fields.keyId,
    sig: { alg: "Ed25519", keyId: fields.keyId },
  };
  doc.sig.value = sign(privateHex, Buffer.concat([HEAD_PREFIX, signedBytes(doc)]));
  return doc;
}

function headGenuine(doc) {
  try {
    if (!doc || !doc.sig) return false;
    return verify(doc.keyId, Buffer.concat([HEAD_PREFIX, signedBytes(doc)]), doc.sig.value);
  } catch (e) {
    return false;
  }
}

function aadBytes(blob, keep) {
  const k = keep || { team: true, epoch: true, id: true, counter: true };
  const parts = [AAD_LABEL];
  if (k.team) parts.push(String(blob.relayTeamId));
  if (k.epoch) parts.push(String(blob.epoch));
  if (k.id) parts.push(String(blob.id));
  if (k.supersedes !== false) parts.push(blob.supersedes ? String(blob.supersedes) : "-");
  parts.push(String(blob.writerKeyId));
  if (k.counter) parts.push(String(blob.counter));
  return Buffer.from(parts.join("\n") + "\n", "utf8");
}

function uploadMessage(aad, ciphertext) {
  return Buffer.concat([UPLOAD_PREFIX, aad, ciphertext]);
}

function deskMessage(body) {
  return Buffer.concat([DESK_PREFIX, body]);
}

function helloMessage(relayTeamId, nonce, keyId, keep) {
  const k = keep || { team: true };
  const parts = [HELLO_LABEL];
  if (k.team) parts.push(String(relayTeamId));
  parts.push(String(nonce));
  parts.push(String(keyId));
  return Buffer.from(parts.join("\n") + "\n", "utf8");
}

function padStep(n) {
  let len = n;
  if (len <= PAD_FLOOR) return PAD_FLOOR;
  let p = PAD_FLOOR;
  while (p < len) p *= 2;
  return p;
}

function frame(obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const step = padStep(4 + json.length);
  const buf = Buffer.alloc(step);
  buf.writeUInt32BE(json.length, 0);
  json.copy(buf, 4);
  return { buf: buf, plainLength: json.length, step: step };
}

function encrypt(teamKeyBytes, aad, framed) {
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", teamKeyBytes, nonce);
  c.setAAD(aad);
  const ciphertext = Buffer.concat([c.update(framed), c.final(), c.getAuthTag()]);
  return { nonce: nonce.toString("hex"), ciphertext: ciphertext };
}

function open(teamKeyBytes, aad, nonceHex, ciphertext) {
  const ct = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext);
  const d = crypto.createDecipheriv("aes-256-gcm", teamKeyBytes, Buffer.from(String(nonceHex), "hex"));
  d.setAAD(aad);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const padded = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  const len = padded.readUInt32BE(0);
  if (len < 0 || 4 + len > padded.length) throw new Error("frame");
  return JSON.parse(padded.subarray(4, 4 + len).toString("utf8"));
}

function pathClass(path) {
  const s = String(path);
  if (s.split("/").indexOf("..") !== -1) return "dotdot";
  if (/^[A-Za-z]:/.test(s)) return "drive";
  if (s.indexOf(":") !== -1) return "stream";
  if (s.charAt(0) === "/" || s.charAt(0) === "\\") return "absolute";
  if (s.indexOf("\\") !== -1) return "absolute";
  return "";
}

function pathInPlace(path, role) {
  const p = String(path);
  if (!role) return false;
  if (role.role === "lead") return p.indexOf("desks/") !== 0;
  const prefix = "desks/" + role.deskId + "/";
  return p.indexOf(prefix) === 0 && p.indexOf("..") === -1;
}

module.exports = {
  BLOB_MAX, TEAM_MAX, RATE_MAX, RATE_WINDOW_MS, TOKEN_TRIES, DELETE_KEEP_MS, NONCE_LIFE_MS, ECHO_MS, PAD_FLOOR,
  UPLOAD_PREFIX, DESK_PREFIX, HEAD_PREFIX, HELLO_LABEL, AAD_LABEL,
  randomId, teamKey, pathId, tokenHash, generateKey,
  sign, verify, canon, signedBytes,
  signTeam, teamGenuine, signHead, headGenuine,
  aadBytes, uploadMessage, deskMessage, helloMessage,
  padStep, frame, encrypt, open, pathClass, pathInPlace,
};
