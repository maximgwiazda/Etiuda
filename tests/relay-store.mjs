/* A PERSON'S STORE AT THE RELAY: the store grant, the store certificate and the service's notice. node tests/relay-store.mjs
 * Over relay/worker.mjs on relay/test/stand-ins.cjs, as relay-unit runs it. C11: a key enrolled with the store's lead key S, holding
 * no current store certificate for the person's code, opens no session and reads no blob. Each guard lifted in a copy turns its named
 * leg red, and no product file is written. Node builtins only, no window. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "relay-store-plants-"));
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 54;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) { skipped++; console.log("  SKIP  " + line); }

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 10, 16, 9);
const CODE = "ABCDEFGHJKMNPQRS", OTHER = "BCDEFGHJKMNPQRST";
const SPKI = Buffer.from("302a300506032b6570032100", "hex");
const hex = n => crypto.randomBytes(n).toString("hex");
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const b64url = s => Buffer.from(s, "utf8").toString("base64url");
function keyPair(branch) {
  const p = crypto.generateKeyPairSync("ed25519");
  const pub = p.publicKey.export({ type: "spki", format: "der" }).subarray(SPKI.length).toString("hex");
  return { keyId: branch ? "k-" + sha(Buffer.from(pub, "hex")).slice(0, 16) : pub, pub, privateKey: p.privateKey };
}
const signHex = (key, bytes) => crypto.sign(null, bytes, key.privateKey).toString("hex");

let B = null, C = null, S = null, K = null, W = null, TEAM_COPY = null;

async function call(R, method, p, o) {
  const opts = o || {};
  const headers = {};
  if (opts.token) headers.authorization = "Bearer " + opts.token;
  if (opts.meta) headers["etiuda-blob"] = b64url(JSON.stringify(opts.meta));
  const init = { method, headers };
  const body = opts.json !== undefined ? JSON.stringify(opts.json) : opts.body;
  if (body !== undefined && method !== "GET") { init.body = body; init.duplex = "half"; }
  const res = await W.fetch(new Request("https://relay.test" + p, init), R.env);
  const bytes = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(bytes.toString("utf8")); } catch { json = null; }
  return { status: res.status, json };
}
const said = r => (r && r.json && r.json.error) || (r && r.status);
const refused = (r, reason) => !!r && r.status === 403 && !!r.json && r.json.error === reason && r.json.said === B.REASONS[reason];
const opened = r => !!r && r.status === 200 && !!r.json && /^[0-9a-f]{64}$/.test(String(r.json.session));
const brief = o => JSON.stringify(o);
const safe = async fn => { try { return await fn(); } catch (e) { return { ok: false, detail: "threw " + (e && e.message ? e.message : e) }; } };

/* The service's delegation: it may sign licences (so certificates) and relay grants (so grants and notices), as the licence service's does. */
const viaAt = (at, may, key) => K.delegationFor(at, { fields: Object.assign({ may: may || ["licence", "relay-grant"] }, key ? { key: { id: key.id, pub: key.pub } } : {}) });
function storeGrant(leadPub, code, at, o) {
  const opts = o || {};
  const signer = opts.signer || K.DELEGATE;
  const g = Object.assign({ kind: "etiuda-store-grant", format: 1, lead: leadPub, code, issued: at, until: at + 30 * DAY, paid: true,
    via: opts.via || viaAt(at, null, opts.signer) }, opts.fields || {});
  for (const k of opts.omit || []) delete g[k];
  g.sig = { alg: "ed25519", keyId: signer.id, value: "" };
  g.sig.value = signHex(opts.forger || signer, opts.bytes ? opts.bytes(g) : C.grantBytes(g));
  return g;
}
function storeCert(deskPub, code, issued, span, o) {
  const opts = o || {};
  const signer = opts.signer || K.DELEGATE;
  const c = Object.assign({ kind: "etiuda-store-certificate", format: 1, desk: deskPub, code, issued, until: issued + span,
    via: opts.via || viaAt(issued, ["licence"], opts.signer) }, opts.fields || {});
  c.sig = { alg: "Ed25519", keyId: signer.id, value: "" };
  c.sig.value = signHex(opts.forger || signer, C.storeCertBytes(c));
  return c;
}
function noticeOf(rt, code, issued, o) {
  const opts = o || {};
  const signer = opts.signer || K.DELEGATE;
  const n = Object.assign({ kind: "etiuda-service-notice", format: 1, what: "store-end", rt, code, issued,
    via: opts.via || viaAt(issued, null, opts.signer) }, opts.fields || {});
  n.sig = { alg: "ed25519", keyId: signer.id, value: "" };
  n.sig.value = signHex(opts.forger || signer, C.noticeBytes(n));
  return n;
}
function serviceKey() {
  const k = keyPair(false);
  return { id: "svc-" + k.pub.slice(0, 12), pub: k.pub, privateKey: k.privateKey };
}
function revokedText(keys) {
  const doc = { kind: "etiuda-revocations", format: 1, serial: 1, keys: keys.slice().sort(), sig: { alg: "ed25519", keyId: K.ROOT.id, value: "" } };
  doc.sig.value = crypto.sign(null, C.revocationBytes(doc), K.ROOT.privateKey).toString("hex");
  return JSON.stringify(doc);
}

const envOf = () => S.relayEnv(Object.assign({ roots: K.ROOTS }, TEAM_COPY ? { team: TEAM_COPY } : {}));
const createAs = (R, rt, lead, grant) => call(R, "POST", "/relay/v1/teams", { json: K.createBody(rt, lead, R.clock.now, b => signHex(lead, b), { grant }) });
/* The list signed by the lead; on a store also by one of the person's computers (desk a unless `o.by`) with its store certificate
   (a current one for the person unless `o.seat`; `o.bare` sends neither, `o.signer` signs in `o.by`'s place). */
function devicesOf(w, keys, o) {
  const opts = o || {}, rev = w.rev + 1, t = w.R.clock.now;
  const json = { keys, rev, t, sig: signHex(w.lead, C.devicesBytes(w.rt, rev, t, keys)) };
  if (w.code && !opts.bare) {
    const by = opts.by || w.desks.a;
    json.seat = opts.seat !== undefined ? opts.seat : storeCert(by.pub, w.code, t, DAY);
    json.by = { pub: by.pub, sig: signHex(opts.signer || by, C.storeDevicesBytes(w.rt, rev, t, keys)) };
  }
  return call(w.R, "POST", "/relay/v1/t/" + w.rt + "/devices", { json })
    .then(r => { if (r.status === 200) w.rev = rev; return r; });
}
const listOf = (w, names) => names.map(n => ({ id: w.desks[n].keyId, pub: w.desks[n].pub, desk: w.desks[n].place }));
/* A person's store: S its lead, made by a store grant for `code`, with desks a and b enrolled by S and each holding a store certificate. */
async function storeTeam(o) {
  const opts = o || {};
  const R = envOf();
  R.clock.now = opts.at || T0;
  const w = { R, rt: hex(16), lead: keyPair(false), rev: 0, desks: {}, code: opts.code || CODE, teamKey: crypto.randomBytes(32) };
  w.made = await createAs(R, w.rt, w.lead, storeGrant(w.lead.pub, w.code, R.clock.now));
  for (const n of ["a", "b"]) w.desks[n] = Object.assign(keyPair(true), { place: "k-" + hex(8) });
  w.enrolled = await devicesOf(w, listOf(w, ["a", "b"]));
  if (w.made.status !== 200 || w.enrolled.status !== 200) throw new Error("the store was not made: " + said(w.made) + " " + said(w.enrolled));
  for (const n of ["a", "b"]) w.desks[n].cert = storeCert(w.desks[n].pub, w.code, R.clock.now, DAY);
  return w;
}
/* An ordinary team of a lead, made by a relay grant, with desk a enrolled. */
async function ordinaryTeam() {
  const R = envOf();
  R.clock.now = T0;
  const w = { R, rt: hex(16), lead: keyPair(false), rev: 0, desks: { a: Object.assign(keyPair(true), { place: "k-" + hex(8) }) } };
  w.made = await createAs(R, w.rt, w.lead, K.delegatedGrantFor(w.lead.pub, R.clock.now, { via: viaAt(R.clock.now) }));
  w.enrolled = await devicesOf(w, listOf(w, ["a"]));
  if (w.made.status !== 200 || w.enrolled.status !== 200) throw new Error("the team was not made: " + said(w.made) + " " + said(w.enrolled));
  return w;
}
async function hello(w, key, seat, extra) {
  const ch = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/hello", { json: {} });
  const n = ch.json && ch.json.challenge;
  const body = Object.assign({ challenge: n, key: key.keyId, pub: key.pub, sig: signHex(key, C.helloBytes(w.rt, n, key.keyId)) }, extra || {});
  if (seat !== undefined) body.seat = seat;
  return call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: body });
}
async function upload(w, name, token) {
  const d = w.desks[name];
  const blob = B.seal({ relayTeamId: w.rt, epoch: 1, teamKey: w.teamKey, writer: { keyId: d.keyId, privateKey: d.privateKey }, path: "settings.json",
    body: "sealed settings", counter: 1, place: "desk:" + d.place, kind: "file" });
  const meta = { v: 1, id: blob.id, supersedes: blob.supersedes, epoch: blob.epoch, writer: blob.writerKeyId, counter: blob.counter, del: blob.deletion,
    sig: blob.signature, nonce: blob.nonce, place: blob.place };
  const r = await call(w.R, "PUT", "/relay/v1/t/" + w.rt + "/b/" + blob.id, { token, meta, body: blob.ciphertext });
  return { r, id: blob.id };
}
const objectsOf = w => [...w.R.bucket.objects.keys()].filter(k => k.startsWith(w.rt + "/"));
const rowsOf = w => (w.R.stores.get(w.rt) ? w.R.stores.get(w.rt).dump() : []);
const postNotice = (w, n, rt) => call(w.R, "POST", "/relay/v1/t/" + (rt || w.rt) + "/notice", { json: { notice: n } });

async function main() {
  try {
    B = require(path.join(ROOT, "shell", "relay", "blob.cjs"));
    C = require(path.join(ROOT, "relay", "core.cjs"));
    S = require(path.join(ROOT, "relay", "test", "stand-ins.cjs"));
    K = require(path.join(ROOT, "relay", "test", "grant-kit.cjs"));
    const WORKER = await import(pathToFileURL(path.join(ROOT, "relay", "worker.mjs")).href);
    W = WORKER.routeWith(K.ROOTS, env => env.NOW());
  } catch (e) { check(false, "0a the relay's modules load - " + e.message); return; }
  check(C.STORE_CERT_SPAN_MS === DAY && C.STORE_GRANT_KIND === "etiuda-store-grant" && C.NOTICE_KIND === "etiuda-service-notice",
    "0b a store certificate runs at most one day, and the store grant and the notice are kinds of their own");

  /* ---- the scenes. Each answers { ok, detail }. ---- */

  /* A store made by a store grant: desk a, with a current store certificate for the person's code, opens a session, uploads, lists and reads. */
  async function opensScene() {
    const w = await storeTeam();
    const s = await hello(w, w.desks.a, w.desks.a.cert);
    const up = opened(s) ? await upload(w, "a", s.json.session) : { r: { status: 0 } };
    const list = opened(s) ? await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/0", { token: s.json.session }) : { status: 0 };
    const got = up.r.status === 200 ? await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/b/" + up.id, { token: s.json.session }) : { status: 0 };
    const ok = opened(s) && up.r.status === 200 && list.status === 200 && got.status === 200;
    return { ok, detail: brief({ session: said(s), upload: up.r.status, since: list.status, blob: got.status }) };
  }
  /* C11: a key X enrolled with S (as anyone reading the folder's file could) opens no session: with no certificate, with a current one
     for another person's code, or with desk a's; and with no session it reads no blob. Desk a still opens. */
  async function enrolledByFileScene() {
    const w = await storeTeam();
    const sa = await hello(w, w.desks.a, w.desks.a.cert);
    const up = opened(sa) ? await upload(w, "a", sa.json.session) : { id: hex(16), r: { status: 0 } };
    w.desks.x = Object.assign(keyPair(true), { place: "k-" + hex(8) });
    const enrol = await devicesOf(w, listOf(w, ["a", "b", "x"]));
    const x = w.desks.x, now = w.R.clock.now;
    const none = await hello(w, x);
    const otherCode = await hello(w, x, storeCert(x.pub, OTHER, now, DAY));
    const aCert = await hello(w, x, w.desks.a.cert);
    const blob = await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/b/" + up.id, {});
    const list = await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/0", {});
    const again = await hello(w, w.desks.a, w.desks.a.cert);
    const ok = up.r.status === 200 && enrol.status === 200 && refused(none, "seat-lapsed") && refused(otherCode, "seat-lapsed") && refused(aCert, "seat-lapsed")
      && blob.status !== 200 && list.status !== 200 && opened(again);
    return { ok, detail: brief({ enrolled: enrol.status, noCertificate: said(none), otherPerson: said(otherCode), anotherDesks: said(aCert),
      blobWithoutSession: blob.status, listWithoutSession: list.status, deskA: said(again) }) };
  }
  /* The store's lead key S opens no session, with or without a certificate for its own key. */
  async function leadScene() {
    const w = await storeTeam();
    const bare = await hello(w, w.lead);
    const withCert = await hello(w, w.lead, storeCert(w.lead.pub, w.code, w.R.clock.now, DAY));
    return { ok: refused(bare, "not-enrolled") && refused(withCert, "not-enrolled"), detail: brief({ bare: said(bare), withCertificate: said(withCert) }) };
  }
  /* A store certificate that is not current, of another kind, spanning more than a day, forged, under a delegation that may not sign
     licences, or signed by a revoked service key, is each refused seat-lapsed; a fresh one opens. */
  async function certScene() {
    const w = await storeTeam(), a = w.desks.a, now = w.R.clock.now;
    const tries = {};
    tries.kind = await hello(w, a, storeCert(a.pub, w.code, now, DAY, { fields: { kind: "etiuda-seat-certificate" } }));
    tries.span = await hello(w, a, storeCert(a.pub, w.code, now, DAY + MIN));
    const stranger = keyPair(false);
    tries.forged = await hello(w, a, storeCert(a.pub, w.code, now, DAY, { forger: stranger }));
    tries.mayNot = await hello(w, a, storeCert(a.pub, w.code, now, DAY, { via: viaAt(now, ["relay-grant"]) }));
    const svc = serviceKey();
    w.R.env.REVOKED = revokedText([svc.pub]);
    tries.revoked = await hello(w, a, storeCert(a.pub, w.code, now, DAY, { signer: svc }));
    delete w.R.env.REVOKED;
    const old = a.cert;
    w.R.clock.now = old.until;
    tries.lapsed = await hello(w, a, old);
    const fresh = await hello(w, a, storeCert(a.pub, w.code, w.R.clock.now, DAY));
    const ok = Object.values(tries).every(r => refused(r, "seat-lapsed")) && opened(fresh);
    const out = {};
    for (const [k, r] of Object.entries(tries)) out[k] = said(r);
    out.fresh = said(fresh);
    return { ok, detail: brief(out) };
  }
  /* A store takes no invitation and opens no door: both routes, signed by S, are refused not-enrolled. */
  async function noDoorScene() {
    const w = await storeTeam(), t = w.R.clock.now;
    const inv = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/invites", { json: { add: [], drop: [], t, sig: signHex(w.lead, C.invitesBytes(w.rt, t, [], [])) } });
    const refs = [hex(16)];
    const door = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/door", { json: { refs, t, sig: signHex(w.lead, C.doorBytes(w.rt, t, refs)) } });
    return { ok: refused(inv, "not-enrolled") && refused(door, "not-enrolled"), detail: brief({ invites: said(inv), door: said(door) }) };
  }
  /* A store's computer list signed by S alone (as anyone holding the folder's file could) is refused; so is one whose computer holds
     no current store certificate for the person, holds another person's, a lapsed one, or did not sign it; the person's own takes. */
  async function listScene() {
    const w = await storeTeam(), now = w.R.clock.now, x = keyPair(true);
    x.place = "k-" + hex(8);
    w.desks.x = x;
    const keys = listOf(w, ["a", "b", "x"]), tries = {};
    tries.bare = await devicesOf(w, keys, { bare: true });
    tries.noCert = await devicesOf(w, keys, { seat: null });
    tries.otherPerson = await devicesOf(w, keys, { seat: storeCert(w.desks.a.pub, OTHER, now, DAY) });
    tries.notSigned = await devicesOf(w, keys, { signer: x });
    tries.lapsed = await devicesOf(w, keys, { seat: storeCert(w.desks.a.pub, w.code, now - DAY, DAY) });
    const good = await devicesOf(w, keys);
    const ok = Object.values(tries).every(r => refused(r, "seat-lapsed")) && good.status === 200;
    const out = {};
    for (const [k, r] of Object.entries(tries)) out[k] = said(r);
    out.good = good.status;
    return { ok, detail: brief(out) };
  }
  /* A store stays a store and a team a team: a relay grant renews no store and moves no store's lead; a store grant renews no team; a
     repeat create of the store under a store grant for another person is refused, and for its own person taken. */
  async function stickyScene() {
    const w = await storeTeam(), now = w.R.clock.now;
    const relayRenew = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/grant", { json: { grant: K.delegatedGrantFor(w.lead.pub, now, { via: viaAt(now), fields: { until: now + 40 * DAY } }) } });
    const to = keyPair(false);
    const leadBody = { to: { keyId: to.keyId, pub: to.pub }, t: now, sig: signHex(w.lead, C.leadBytes(w.rt, to.keyId, to.pub, now)),
      grant: K.delegatedGrantFor(to.pub, now, { via: viaAt(now) }) };
    const relayLead = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/lead", { json: leadBody });
    const otherCreate = await createAs(w.R, w.rt, w.lead, storeGrant(w.lead.pub, OTHER, now, { fields: { until: now + 40 * DAY } }));
    const otherRenew = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/grant", { json: { grant: storeGrant(w.lead.pub, OTHER, now, { fields: { until: now + 41 * DAY } }) } });
    const ownCreate = await createAs(w.R, w.rt, w.lead, storeGrant(w.lead.pub, w.code, now, { fields: { until: now + 42 * DAY } }));
    const o = await ordinaryTeam();
    const storeOnTeam = await call(o.R, "POST", "/relay/v1/t/" + o.rt + "/grant", { json: { grant: storeGrant(o.lead.pub, CODE, now, { fields: { until: now + 40 * DAY } }) } });
    const ok = refused(relayRenew, "bad-grant") && refused(relayLead, "bad-grant") && refused(otherCreate, "bad-grant") && refused(otherRenew, "bad-grant")
      && ownCreate.status === 200 && refused(storeOnTeam, "bad-grant");
    return { ok, detail: brief({ relayGrantRenewsStore: said(relayRenew), relayGrantMovesLead: said(relayLead), otherPersonCreate: said(otherCreate),
      otherPersonRenew: said(otherRenew), ownPersonCreate: ownCreate.status, storeGrantRenewsTeam: said(storeOnTeam) }) };
  }
  /* A store grant out of shape is refused at the create: no code, a code not of the code's shape, seats beside it, or signed over the
     relay grant's label. */
  async function grantShapeScene() {
    const R = envOf();
    R.clock.now = T0;
    const now = T0, tries = {};
    const lead = () => keyPair(false);
    let l = lead();
    tries.noCode = await createAs(R, hex(16), l, storeGrant(l.pub, CODE, now, { omit: ["code"] }));
    l = lead();
    tries.badCode = await createAs(R, hex(16), l, storeGrant(l.pub, "abc", now));
    l = lead();
    tries.seats = await createAs(R, hex(16), l, storeGrant(l.pub, CODE, now, { fields: { seats: { licence: hex(16), live: now } } }));
    l = lead();
    tries.label = await createAs(R, hex(16), l, storeGrant(l.pub, CODE, now, { bytes: g => Buffer.from("etiuda-relay-grant\n" + C.canon(Object.assign({}, g, { sig: { alg: g.sig.alg, keyId: g.sig.keyId } })), "utf8") }));
    l = lead();
    const good = await createAs(R, hex(16), l, storeGrant(l.pub, CODE, now));
    const ok = Object.values(tries).every(r => refused(r, "bad-grant")) && good.status === 200;
    const out = {};
    for (const [k, r] of Object.entries(tries)) out[k] = said(r);
    out.good = good.status;
    return { ok, detail: brief(out) };
  }
  /* The service's store-end: answered ok, every object of the store deleted before the answer, the storage left holding only the
     "ended" mark (and the instant of its sweep, where the relay keeps one), the hello and a held session refused, and a create of the same id under S and a good store grant refused. */
  async function endScene() {
    const w = await storeTeam();
    const s = await hello(w, w.desks.a, w.desks.a.cert);
    const up = opened(s) ? await upload(w, "a", s.json.session) : { r: { status: 0 } };
    const before = objectsOf(w).length;
    const end = await postNotice(w, noticeOf(w.rt, w.code, w.R.clock.now));
    const after = objectsOf(w).length, rows = rowsOf(w).map(([k, v]) => k + "=" + (typeof v === "string" && v.startsWith("\"") ? JSON.parse(v) : v));
    const held = await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/0", { token: s.json && s.json.session });
    const ch = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/hello", { json: {} });
    const again = await createAs(w.R, w.rt, w.lead, storeGrant(w.lead.pub, w.code, w.R.clock.now));
    const twice = await postNotice(w, noticeOf(w.rt, w.code, w.R.clock.now));
    const ok = up.r.status === 200 && before >= 1 && end.status === 200 && end.json.ok === true && end.json.what === "store-end" && after === 0
      && rows.filter(r => !r.startsWith("sweptAt=")).join() === "swept=ended" && held.status !== 200 && refused(ch, "not-enrolled") && refused(again, "swept-other-lead") && refused(twice, "not-enrolled");
    return { ok, detail: brief({ upload: up.r.status, objectsBefore: before, end: said(end), objectsAfter: after, rows, heldSession: held.status,
      hello: said(ch), createAgain: said(again), secondNotice: said(twice) }) };
  }
  /* A notice the relay must not take, each refused bad-grant and leaving the store whole (its row, its object, desk a's session): of
     another kind, a kind it does not know, for another id, stale, issued before the store was made (the relay's clock stepped back),
     under a delegation that may not grant, forged, from a revoked key, for another person; and a good notice for a lead's own team. */
  async function noticeRefusedScene() {
    const w = await storeTeam(), made = w.R.clock.now, tries = {};
    w.R.clock.now = made + HOUR;
    const now = w.R.clock.now;
    const s = await hello(w, w.desks.a, w.desks.a.cert);
    await upload(w, "a", s.json && s.json.session);
    tries.kind = await postNotice(w, noticeOf(w.rt, w.code, now, { fields: { kind: "etiuda-other-notice" } }));
    tries.what = await postNotice(w, noticeOf(w.rt, w.code, now, { fields: { what: "store-wipe" } }));
    tries.rt = await postNotice(w, noticeOf(hex(16), w.code, now));
    tries.stale = await postNotice(w, noticeOf(w.rt, w.code, now - 10 * MIN));
    tries.mayNot = await postNotice(w, noticeOf(w.rt, w.code, now, { via: viaAt(now, ["licence"]) }));
    tries.forged = await postNotice(w, noticeOf(w.rt, w.code, now, { forger: keyPair(false) }));
    const svc = serviceKey();
    w.R.env.REVOKED = revokedText([svc.pub]);
    tries.revoked = await postNotice(w, noticeOf(w.rt, w.code, now, { signer: svc }));
    delete w.R.env.REVOKED;
    tries.person = await postNotice(w, noticeOf(w.rt, OTHER, now));
    w.R.clock.now = made - 2 * MIN;
    tries.beforeStore = await postNotice(w, noticeOf(w.rt, w.code, made - 6 * MIN));
    w.R.clock.now = now;
    const o = await ordinaryTeam();
    tries.team = await postNotice(o, noticeOf(o.rt, CODE, o.R.clock.now));
    const whole = !!rowsOf(w).find(([k]) => k === "team") && objectsOf(w).length >= 1 && !!rowsOf(o).find(([k]) => k === "team");
    const still = await hello(w, w.desks.a, w.desks.a.cert);
    const ok = Object.values(tries).every(r => refused(r, "bad-grant")) && whole && opened(still);
    const out = {};
    for (const [k, r] of Object.entries(tries)) out[k] = said(r);
    Object.assign(out, { whole, deskA: said(still) });
    return { ok, detail: brief(out) };
  }

  /* ---- the legs ---- */
  const results = {};
  const leg = async (id, scene, line) => {
    const r = await safe(scene);
    results[id] = r;
    check(r.ok === true, id + " " + line + ": " + r.detail);
    return r;
  };
  /* st5: a store's own schedule. A store made sixty days before the person's seat goes, renewed once a day by the service's grant rule
     (store/grant: ending at the trial's or the paid licence's end and at most the relay's longest span on, paid where it is no trial, none
     once the seat is gone), its alarm rung each day as the runtime rings it. `days` from the seat going to the instant the row says it is
     swept, `emptied` the day the row was found gone. */
  const L5 = 60;
  async function scheduleRun(seat) {
    const R = envOf();
    R.clock.now = T0;
    const L = T0 + L5 * DAY, s = seat(L), trial = s.trialEnds != null, lead = keyPair(false), rt = hex(16);
    const grantAt = at => storeGrant(lead.pub, CODE, at, { fields: { until: Math.min(trial ? s.trialEnds : s.paidUntil, at + C.GRANT_MAX_MS), paid: !trial } });
    const made = await createAs(R, rt, lead, grantAt(T0));
    if (made.status !== 200) throw new Error("the store was not made: " + said(made));
    let renewed = 0;
    for (let d = 1; T0 + d * DAY < L; d++) {
      R.clock.now = T0 + d * DAY;
      const r = await call(R, "POST", "/relay/v1/t/" + rt + "/grant", { json: { grant: grantAt(R.clock.now) } });
      if (r.status === 200) renewed++;
      await R.ring(rt);
    }
    const row = () => (R.stores.get(rt) ? R.stores.get(rt).get("team") : null);
    const at = row(), swept = at ? C.lapseOf(at, L).swept : null;
    let emptied = null;
    for (let d = 1; d <= 200 && emptied === null; d++) { R.clock.now = L + d * DAY; await R.ring(rt); if (!row()) emptied = d; }
    return { renewed, days: swept === null ? null : (swept - L) / DAY, emptied };
  }
  const schedule = (seat, want) => async () => {
    const r = await scheduleRun(seat);
    return { ok: r.renewed === L5 - 1 && r.days === want && r.emptied === want, detail: brief(r) };
  };
  const LEGS = [
    ["st1a", opensScene, "a store made by a store grant: a desk with a current store certificate for the person's code opens a session, uploads, lists and reads"],
    ["C11", enrolledByFileScene, "a key enrolled with the folder's S, holding no current store certificate for the person's code (none, another person's, another desk's), opens no session and reads no blob; the person's desk still opens"],
    ["st2b", leadScene, "the store's lead key S opens no session, with or without a certificate"],
    ["st2c", certScene, "a store certificate lapsed, of another kind, over a day, forged, under a delegation that may not sign licences, or from a revoked service key, is refused seat-lapsed; a fresh one opens"],
    ["st2d", noDoorScene, "a store takes no invitation and opens no door"],
    ["st2e", listScene, "a store's computer list signed by S alone, or by a computer without a current store certificate for the person, or not signed by that computer, is refused; the person's own takes"],
    ["st3a", stickyScene, "a store stays a store and a team a team, and a store's person never changes"],
    ["st3b", grantShapeScene, "a store grant without its code, with a code out of shape, with seats, or signed over the relay grant's label is refused at the create"],
    ["st4a", endScene, "the service's store-end deletes every object before it answers, leaves only the ended mark, and the id is never made again"],
    ["st4b", noticeRefusedScene, "a notice of another kind, an unknown kind, another id, stale, older than the store, under a delegation that may not grant, forged, revoked, for another person, or for a lead's team, is refused and the store stays whole"],
    ["st5t", schedule(L => ({ trialEnds: L }), 29), "a trial that ends: the store is swept 30 days after its last grant was issued, the day before, so 29 days on"],
    ["st5u", schedule(L => ({ trialEnds: L + 40 * DAY }), 40), "a trial seat freed 40 days before the trial would end: swept at its last grant's end, 40 days on, the one case past 30 days after the last grant"],
    ["st5p", schedule(L => ({ paidUntil: L }), 89), "a paid licence that ends: swept 90 days after the last grant was issued, 89 days on"],
    ["st5f", schedule(L => ({ paidUntil: L + 365 * DAY }), 89), "a paid seat freed with the licence running: swept 90 days after the last grant was issued, 89 days on"],
  ];
  for (const [id, scene, line] of LEGS) await leg(id, scene, line);

  /* ---- the plants: each guard lifted in a copy turns its named leg red, and the product file is never written ---- */
  const forwardTo = file => "module.exports = require(" + JSON.stringify(file) + ");\n";
  let copies = 0;
  function copyOf(files) {
    const dir = path.join(WORK, "p" + (++copies));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
    return dir;
  }
  const PRODUCT = { core: path.join(ROOT, "relay", "core.cjs"), team: path.join(ROOT, "relay", "team.cjs"), blob: path.join(ROOT, "shell", "relay", "blob.cjs") };
  const ADOPTED = ["createCore", "judgeCreate", "grantWhy", "grantOk", "judgeLead", "certWhy", "storeCertWhy", "noticeWhy", "grantBytes"];
  async function lifted(file, tag, fn) {
    const digest = sha(fs.readFileSync(PRODUCT[file])), kept = {};
    for (const k of ADOPTED) kept[k] = C[k];
    let turned = false, detail = "plant line absent";
    try {
      const lines = fs.readFileSync(PRODUCT[file], "utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("/* plant:" + tag + " */") >= 0);
      if (at >= 0) {
        lines.splice(at, 1);
        if (file === "core") {
          const dir = copyOf({ "relay/core.cjs": lines.join("\n"), "shell/relay/blob.cjs": forwardTo(PRODUCT.blob) });
          const fresh = require(path.join(dir, "relay", "core.cjs"));
          for (const k of ADOPTED) C[k] = fresh[k];
        } else {
          const dir = copyOf({ "relay/team.cjs": lines.join("\n"), "relay/core.cjs": forwardTo(PRODUCT.core), "shell/relay/blob.cjs": forwardTo(PRODUCT.blob) });
          TEAM_COPY = require(path.join(dir, "relay", "team.cjs"));
        }
        const r = await safe(fn);
        turned = r.ok !== true;
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) { detail = e && e.stack ? e.stack.split("\n")[0] : String(e); }
    finally { for (const k of ADOPTED) C[k] = kept[k]; TEAM_COPY = null; }
    return { turned, back: sha(fs.readFileSync(PRODUCT[file])) === digest, detail };
  }
  const scenes = Object.fromEntries(LEGS.map(([id, scene]) => [id, scene]));
  const PLANTS = [
    ["core", "store-session", "C11", "a store's desk session asks no store certificate"],
    ["core", "store-cert", "C11", "a store certificate is not judged"],
    ["core", "store-code", "C11", "a certificate for another person's code opens the store"],
    ["core", "store-cert-desk", "C11", "another desk's certificate opens"],
    ["core", "store-lead-hello", "st2b", "S opens a session"],
    ["core", "store-cert-kind", "st2c", "a certificate of another kind opens"],
    ["core", "store-cert-span", "st2c", "a certificate over a day opens"],
    ["core", "store-cert-ended", "st2c", "a lapsed certificate opens"],
    ["core", "store-cert-sig", "st2c", "a forged certificate opens"],
    ["core", "store-cert-revoked", "st2c", "a revoked key's certificate opens"],
    ["core", "store-no-invites", "st2d", "a store takes invitations"],
    ["core", "store-no-door", "st2d", "a store opens a door"],
    ["core", "store-devices", "st2e", "S alone writes a store's computer list"],
    ["core", "store-devices-sig", "st2e", "the certificate's computer need not sign the list"],
    ["core", "store-kind-fits", "st3a", "a grant of the other kind fits"],
    ["core", "store-code-fits", "st3a", "a store grant for another person fits"],
    ["core", "store-create-fits", "st3a", "a repeat create asks no fit"],
    ["core", "store-renew-fits", "st3a", "a renewal asks no fit"],
    ["core", "store-lead-fits", "st3a", "a lead move asks no fit"],
    ["core", "store-grant-code", "st3b", "a store grant's code is not shaped"],
    ["core", "notice-sweeps", "st4a", "an ended store is not swept"],
    ["core", "notice-ended-mark", "st4a", "an ended store's id keeps S's mark, so S makes it again"],
    ["core", "store-ended-create", "st4a", "an ended id is made again"],
    ["team", "notice-sweep-now", "st4a", "the notice answers before the store is gone"],
    ["core", "notice-judged", "st4b", "a notice is not judged"],
    ["core", "notice-kind", "st4b", "a notice of another kind is taken"],
    ["core", "notice-what", "st4b", "an unknown kind of notice is taken"],
    ["core", "notice-rt", "st4b", "a notice for another id is taken"],
    ["core", "notice-fresh", "st4b", "a stale notice is taken"],
    ["core", "notice-via", "st4b", "a delegation that may not grant signs a notice"],
    ["core", "notice-sig", "st4b", "a forged notice is taken"],
    ["core", "notice-revoked", "st4b", "a revoked key's notice is taken"],
    ["core", "notice-code", "st4b", "a notice for another person ends the store, or one ends a lead's team"],
    ["core", "notice-after-store", "st4b", "a notice older than the store ends it"],
    ["core", "store-schedule", "st5f", "a store swept by the team rule, 90 days after its last grant's end"],
    ["core", "store-issue-renew", "st5p", "a renewal that moves nothing else keeps the first issue, so the store goes sooner than 90 days after the last"],
  ];
  for (const [file, tag, id, what] of PLANTS) {
    const line = "p " + id + " lifting plant:" + tag + " in a copy of relay/" + file + ".cjs turns " + id + " red (" + what + "), and the product file is never written";
    if (PLANTS_OFF) { skip(line); continue; }
    const base = results[id] && results[id].ok === true;
    const p = await lifted(file, tag, scenes[id]);
    check(base && p.turned && p.back, line + ": " + p.detail + ", sha " + (p.back ? "unchanged" : "CHANGED"));
  }
  check(PLANTS.length + LEGS.length + 4 === EXPECTED, "0c the floor counts every leg and plant: " + (PLANTS.length + LEGS.length + 4) + " of " + EXPECTED);
  /* The ordinary team's paths stay as they were: a grant that is not a store's still makes, renews and opens as before. */
  const o = await safe(async () => {
    const w = await ordinaryTeam();
    const s = await hello(w, w.desks.a);
    const r = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/grant", { json: { grant: K.delegatedGrantFor(w.lead.pub, T0, { via: viaAt(T0), fields: { until: T0 + 40 * DAY } }) } });
    return { ok: opened(s) && r.status === 200, detail: brief({ session: said(s), renew: r.status }) };
  });
  check(o.ok === true, "o1 an ordinary team made by a relay grant opens a desk's session with no certificate and renews: " + o.detail);
  const lead = await safe(async () => {
    const w = await ordinaryTeam();
    const s = await hello(w, w.lead);
    return { ok: opened(s), detail: said(s) };
  });
  check(lead.ok === true, "o2 an ordinary team's lead still opens its own session: " + lead.detail);
}

try { await main(); }
catch (e) { check(false, "harness: " + (e && e.stack ? e.stack : e)); }
try { fs.rmSync(WORK, { recursive: true, force: true }); } catch { /* a temp folder */ }
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
