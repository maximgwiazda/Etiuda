"use strict";
/* Writes relay/test/grant-vector.json: the shared vector for a relay grant. Every key in it is invented from a plain sentence
   and signs nothing real. The bytes are built here by hand, with a canon of this file's own, so the vector does not lean on
   the functions it checks. Ed25519 is deterministic, so a run writes the same file again.

       node relay/test/grant-vector-make.cjs
*/
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI = Buffer.from("302a300506032b6570032100", "hex");
const seedOf = words => crypto.createHash("sha256").update(words, "utf8").digest("hex");
function keyOf(seed) {
  const privateKey = crypto.createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(seed, "hex")]), format: "der", type: "pkcs8" });
  const pub = crypto.createPublicKey(privateKey).export({ type: "spki", format: "der" }).subarray(SPKI.length).toString("hex");
  return { seed, pub, privateKey };
}
const sign = (key, bytes) => crypto.sign(null, bytes, key.privateKey).toString("hex");

/* Sorted-key JSON, written out here again. */
function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
}
const without = doc => Object.assign({}, doc, { sig: { alg: doc.sig.alg, keyId: doc.sig.keyId } });

const DAY = 24 * 60 * 60 * 1000;
const root = keyOf(seedOf("etiuda relay grant vector: the invented test root, which signs nothing real"));
const delegate = keyOf(seedOf("etiuda relay grant vector: the invented delegated key, which signs nothing real"));
const lead = keyOf(seedOf("etiuda relay grant vector: the invented lead, which signs nothing real"));
const now = 1800000000000;

const delegation = {
  kind: "etiuda-delegation", format: 1, key: { id: "test-delegate-1", pub: delegate.pub }, may: ["relay-grant"],
  from: now - 10 * DAY, until: now + 100 * DAY, sig: { alg: "ed25519", keyId: "test-root-1", value: "" },
};
const delegationBytes = Buffer.from("etiuda-delegation\n" + canon(without(delegation)), "utf8");
delegation.sig.value = sign(root, delegationBytes);

function grantOf(signer, signerId, extra) {
  const grant = Object.assign({ kind: "etiuda-relay-grant", format: 1, lead: lead.pub, issued: now - DAY, until: now + 30 * DAY, paid: true,
    sig: { alg: "ed25519", keyId: signerId, value: "" } }, extra || {});
  const bytes = Buffer.from("etiuda-relay-grant\n" + canon(without(grant)), "utf8");
  grant.sig.value = sign(signer, bytes);
  return { grant, bytes: bytes.toString("hex"), sig: grant.sig.value };
}
const byRoot = grantOf(root, "test-root-1");
const byDelegate = grantOf(delegate, "test-delegate-1", { paid: false, via: delegation });

/* The lead's key id comes from its key, as the relay requires: the branch id the shell makes of it, "k-" and 16 hex of the key's sha256. */
const leadKeyId = "k-" + crypto.createHash("sha256").update(Buffer.from(lead.pub, "hex")).digest("hex").slice(0, 16);
const create = { rt: "00112233445566778899aabbccddeeff", keyId: leadKeyId, t: now };
const createBytes = Buffer.from("etiuda-relay-create-2\n" + create.rt + "\n" + create.keyId + "\n" + create.t + "\n"
  + crypto.createHash("sha256").update(Buffer.from(byRoot.bytes, "hex")).digest("hex"), "utf8");

const vector = {
  note: "TEST KEYS ONLY. Every seed below was made up from a plain sentence for this file and signs nothing real. The root here is not the vendor's root. "
    + "Seeds are the Ed25519 private halves as 64 hex, pubs the public halves. Each bytes field is the hex of what its signer signed.",
  root: { id: "test-root-1", seed: root.seed, pub: root.pub },
  delegate: { id: "test-delegate-1", seed: delegate.seed, pub: delegate.pub },
  lead: { keyId: create.keyId, seed: lead.seed, pub: lead.pub },
  now,
  delegation: { doc: delegation, bytes: delegationBytes.toString("hex"), sig: delegation.sig.value },
  grants: { root: byRoot, delegated: byDelegate },
  create: { rt: create.rt, keyId: create.keyId, t: create.t, grant: "root", bytes: createBytes.toString("hex"), sig: sign(lead, createBytes) },
};
fs.writeFileSync(path.join(__dirname, "grant-vector.json"), JSON.stringify(vector, null, 2) + "\n");
console.log("wrote grant-vector.json");
