"use strict";
/* What a leg needs to make a team on the relay once a create must carry a grant: the invented test root and delegated key of
   relay/test/grant-vector.json (test keys that sign nothing real), a grant and a delegation made over them with any fault a leg
   wants, and a create body signed in the create-2 bytes. The relay under test is built with ROOTS, never the vendor's root. */
const crypto = require("node:crypto");
const core = require("../core.cjs");
const V = require("./grant-vector.json");

const PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
const HOUR = 60 * 60 * 1000, DAY = 24 * HOUR;
const keyOf = (id, seed, pub) => ({ id, pub, privateKey: crypto.createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(seed, "hex")]), format: "der", type: "pkcs8" }) });
const ROOT = keyOf(V.root.id, V.root.seed, V.root.pub), DELEGATE = keyOf(V.delegate.id, V.delegate.seed, V.delegate.pub);
const ROOTS = [ROOT.pub];
const sign = (key, bytes) => crypto.sign(null, bytes, key.privateKey).toString("hex");

/* A grant for a lead's public key, valid around `now` unless a leg says otherwise. `fields` overrides or adds fields before the
   signing, `omit` leaves fields out, `via` names a delegation, `signer` is ROOT unless given and `keyId` is its id unless given. */
function grantFor(leadPub, now, o) {
  const opts = o || {};
  const grant = Object.assign({ kind: "etiuda-relay-grant", format: 1, lead: leadPub, issued: now - HOUR, until: now + 30 * DAY, paid: true }, opts.fields || {});
  if (opts.via !== undefined) grant.via = opts.via;
  for (const k of opts.omit || []) delete grant[k];
  const signer = opts.signer || ROOT;
  grant.sig = { alg: "ed25519", keyId: opts.keyId || signer.id, value: "" };
  grant.sig.value = sign(signer, core.grantBytes(grant));
  return grant;
}

/* A delegation of the test delegated key, signed by ROOT unless given another signer. */
function delegationFor(now, o) {
  const opts = o || {};
  const d = Object.assign({ kind: "etiuda-delegation", format: 1, key: { id: DELEGATE.id, pub: DELEGATE.pub }, may: ["relay-grant"],
    from: now - 10 * DAY, until: now + 100 * DAY }, opts.fields || {});
  const signer = opts.signer || ROOT;
  d.sig = { alg: "ed25519", keyId: signer.id, value: "" };
  d.sig.value = sign(signer, core.delegationBytes(d));
  return d;
}

/* A grant signed by the delegated key under a delegation from ROOT. */
const delegatedGrantFor = (leadPub, now, o) => grantFor(leadPub, now, Object.assign({ via: delegationFor(now), signer: DELEGATE }, o || {}));

/* A create's body: `lead` is { keyId, pub }, `signLead` signs bytes under the lead's key and answers 128 hex. `o.now` is the time
   the grant is made around (the create's t unless given), `o.grant` is a grant to carry in place of the good one (null carries
   none), `o.signedGrant` is the grant the signature covers, `o.bytes` the bytes it signs in place of the create-2 bytes. */
function createBody(rt, lead, t, signLead, o) {
  const opts = o || {};
  const now = opts.now !== undefined ? opts.now : t;
  const grant = opts.grant !== undefined ? opts.grant : grantFor(lead.pub, now, opts.grantOpts);
  const body = { rt, lead: { keyId: lead.keyId, pub: lead.pub }, t };
  if (grant !== null) body.grant = grant;
  const covered = opts.signedGrant !== undefined ? opts.signedGrant : grant;
  body.sig = signLead(opts.bytes || core.create2Bytes(rt, lead.keyId, t, covered));
  return Object.assign(body, opts.extra || {});
}

module.exports = { ROOT, DELEGATE, ROOTS, HOUR, DAY, grantFor, delegationFor, delegatedGrantFor, createBody };
