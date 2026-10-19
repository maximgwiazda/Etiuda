/* The relay, relay/worker.mjs and its team object, driven in memory over relay/test/stand-ins.cjs with no Workers
 * runtime: each endpoint's success and each of its refusals, word for word as relay/test/target-contract.md writes
 * them; sessions expiring; a withdrawn key losing its session at once; a superseded blob dropped; a deletion record
 * kept 30 days and then refused; every limit; a commit judged again after the R2 write; a chain that keeps one blob;
 * nothing kept that names a path, a body or a team; and the harness, relay/test/attacks.mjs, through relay-product.
 *
 *     node tests/relay-unit.mjs        exit code is the number of failed checks, capped at 63; 78 where it did not complete
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 100;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const SPKI = Buffer.from("302a300506032b6570032100", "hex");
const MIN = 60 * 1000, DAY = 24 * 60 * MIN;
const hex = n => crypto.randomBytes(n).toString("hex");
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const b64url = s => Buffer.from(s, "utf8").toString("base64url");
function keyPair(branch) {
  const p = crypto.generateKeyPairSync("ed25519");
  const pub = p.publicKey.export({ type: "spki", format: "der" }).subarray(SPKI.length).toString("hex");
  const keyId = branch ? "k-" + sha(Buffer.from(pub, "hex")).slice(0, 16) : pub;
  return { keyId, pub, privateKey: p.privateKey };
}
const signHex = (key, bytes) => crypto.sign(null, bytes, key.privateKey).toString("hex");

let W = null, C = null, B = null, S = null;

function metaOf(blob, extra) {
  return Object.assign({ v: 1, id: blob.id, supersedes: blob.supersedes, epoch: blob.epoch, writer: blob.writerKeyId,
    counter: blob.counter, del: blob.deletion, sig: blob.signature, nonce: blob.nonce, place: blob.place }, extra || {});
}

async function call(R, method, p, o) {
  const opts = o || {};
  const headers = {};
  if (opts.token) headers.authorization = "Bearer " + opts.token;
  if (opts.meta) headers["etiuda-blob"] = typeof opts.meta === "string" ? opts.meta : b64url(JSON.stringify(opts.meta));
  if (opts.upgrade !== false && /\/socket$/.test(p)) headers.upgrade = "websocket";
  if (opts.length != null) headers["content-length"] = String(opts.length);
  const body = opts.json !== undefined ? JSON.stringify(opts.json) : opts.body;
  const init = { method, headers };
  if (body !== undefined && method !== "GET") { init.body = body; init.duplex = "half"; }
  const res = await W.fetch(new Request((opts.scheme || "https") + "://relay.test" + p, init), R.env);
  const bytes = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(bytes.toString("utf8")); } catch { json = null; }
  const mh = res.headers.get("etiuda-blob");
  let meta = null;
  try { meta = mh ? JSON.parse(Buffer.from(mh, "base64url").toString("utf8")) : null; } catch { meta = null; }
  return { status: res.status, json, bytes, meta, socket: res.headers.get("x-stand-in-socket") };
}

const refused = (r, reason) => !!r && r.status >= 400 && r.status < 500 && !!r.json && r.json.error === reason
  && r.json.said === B.REASONS[reason] && Object.keys(r.json).sort().join() === "error,said" && !r.meta && !r.socket;

/* A team with its lead, and two desks enrolled: `desk` by its branch id, `other` by its public key. */
async function world(opts) {
  const R = S.relayEnv(opts);
  const w = { R, rt: hex(16), lead: keyPair(false), desk: keyPair(true), other: keyPair(false), rev: 0, devs: [] };
  w.deskId = "k-" + hex(8);
  w.otherId = "k-" + hex(8);
  const made = await create(w, w.lead, R.clock.now);
  if (made.status !== 200) throw new Error("the team was not made: " + JSON.stringify(made.json));
  w.devs = [{ id: w.desk.keyId, pub: w.desk.pub, desk: w.deskId }, { id: w.other.keyId, pub: w.other.pub, desk: w.otherId }];
  const enrolled = await devices(w, w.devs);
  if (enrolled.status !== 200) throw new Error("the desks were not enrolled: " + JSON.stringify(enrolled.json));
  return w;
}
function create(w, lead, t, extra) {
  const sig = signHex(lead, C.createBytes(w.rt, lead.keyId, t));
  return call(w.R, "POST", "/relay/v1/teams", { json: Object.assign({ rt: w.rt, lead: { keyId: lead.keyId, pub: lead.pub }, t, sig }, extra || {}) });
}
function devices(w, keys, o) {
  const opts = o || {};
  const rev = opts.rev != null ? opts.rev : w.rev + 1;
  const t = opts.t != null ? opts.t : w.R.clock.now;
  const signer = opts.signer || w.lead;
  const sig = signHex(signer, C.devicesBytes(w.rt, rev, t, keys));
  return call(w.R, "POST", "/relay/v1/t/" + w.rt + "/devices", { json: { keys, rev, t, sig } }).then(r => {
    if (r.status === 200) w.rev = rev;
    return r;
  });
}
function invites(w, add, drop, o) {
  const opts = o || {};
  const t = opts.t != null ? opts.t : w.R.clock.now;
  const sig = signHex(opts.signer || w.lead, C.invitesBytes(w.rt, t, add, drop));
  return call(w.R, "POST", "/relay/v1/t/" + w.rt + "/invites", { json: { add, drop, t, sig } });
}
async function challenge(w, rt) {
  const r = await call(w.R, "POST", "/relay/v1/t/" + (rt || w.rt) + "/hello", { json: {} });
  return r.status === 200 ? r.json.challenge : null;
}
async function helloAs(w, key, o) {
  const opts = o || {};
  const rt = opts.rt || w.rt;
  const nonce = opts.nonce || await challenge(w, rt);
  const sig = opts.sig !== undefined ? opts.sig : signHex(opts.signer || key, C.helloBytes(opts.signedRt || rt, nonce, key.keyId));
  const body = { challenge: nonce, key: key.keyId, sig };
  if (opts.pub) body.pub = opts.pub;
  return call(w.R, "POST", "/relay/v1/t/" + rt + "/session", { json: body });
}
async function tokenHello(w, inv, token, nonce, key) {
  const n = nonce || await challenge(w);
  const who = key || keyPair(true);
  const body = { challenge: n, invite: token, inv, key: who.keyId, pub: who.pub,
    sig: signHex(who, C.helloBytes(w.rt, n, who.keyId)) };
  return call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: body });
}
async function sessionOf(w, key) {
  const r = await helloAs(w, key);
  if (r.status !== 200) throw new Error("no session: " + JSON.stringify(r.json));
  return r.json.session;
}
function sealAs(w, writer, p, counter, extra) {
  const place = writer === w.lead ? "root" : writer === w.other ? "desk:" + w.otherId : "desk:" + w.deskId;
  return B.seal(Object.assign({ relayTeamId: w.rt, epoch: 1, teamKey: w.teamKey || (w.teamKey = crypto.randomBytes(32)),
    writer: { keyId: writer.keyId, privateKey: writer.privateKey }, path: p, body: "body " + counter, counter, place, kind: "file" },
    extra || {}));
}
function put(w, token, blob, o) {
  const opts = o || {};
  return call(w.R, "PUT", "/relay/v1/t/" + w.rt + "/b/" + (opts.pathId || blob.id),
    { token, meta: opts.meta || metaOf(blob, opts.extra), body: opts.body || blob.ciphertext, length: opts.length });
}
const since = (w, token, n) => call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/" + (n || 0), { token });
const getBlob = (w, token, id) => call(w.R, "GET", "/relay/v1/t/" + w.rt + "/b/" + id, { token });
const socket = (w, token, o) => call(w.R, "GET", "/relay/v1/t/" + w.rt + "/socket", Object.assign({ token }, o || {}));
const dumpText = w => JSON.stringify(w.R.stores.get(w.rt).dump());
const sent = (w, id) => { const ws = w.R.hubs.get(w.rt).byId(id); return ws ? ws.sent.map(m => JSON.parse(m)) : null; };
const wsOf = (w, id) => { for (const hub of w.R.hubs.values()) { const f = hub.open.concat([]).find(s => s.id === id); if (f) return f; } return null; };

async function main() {
  try {
    B = require(path.join(ROOT, "shell", "relay", "blob.cjs"));
    C = require(path.join(ROOT, "relay", "core.cjs"));
    S = require(path.join(ROOT, "relay", "test", "stand-ins.cjs"));
    W = (await import(pathToFileURL(path.join(ROOT, "relay", "worker.mjs")).href)).default;
  } catch (e) { check(false, "0a the relay's modules load - " + e.message); return; }

  /* ---- 1: the bytes and the routes ---- */
  {
    const rt = hex(16), n = hex(16);
    const hello = C.helloBytes(rt, n, "k-abc").toString("utf8");
    const made = C.createBytes(rt, "lead-1", 5).toString("utf8");
    const devs = C.devicesBytes(rt, 3, 7, [{ pub: "b", id: "a", desk: "c" }]).toString("utf8");
    const invs = C.invitesBytes(rt, 9, [{ id: "x", hash: "y" }], ["z"]).toString("utf8");
    const labels = ["etiuda-relay-create\n", "etiuda-relay-devices\n", "etiuda-relay-invites\n", "etiuda-relay-hello\n",
      B.UPLOAD_PREFIX, "etiuda-relay-head\n", "etiuda-desk-branch\n"];
    const prefixFree = labels.every((a, i) => labels.every((b, j) => i === j || !b.startsWith(a)));
    check(hello === "etiuda-relay-hello\n" + rt + "\n" + n + "\nk-abc\n" && made === "etiuda-relay-create\n" + rt + "\nlead-1\n5"
      && devs === "etiuda-relay-devices\n" + rt + "\n3\n7\n" + '[{"desk":"c","id":"a","pub":"b"}]'
      && invs === "etiuda-relay-invites\n" + rt + "\n9\n" + '{"add":[{"hash":"y","id":"x"}],"drop":["z"]}' && prefixFree,
    "1a the hello is the contract's four lines, create, devices and invites the protocol's, the JSON canonical, and no label a prefix of another or of the upload, head or desk-file prefix");
    const w = await world();
    const routes = await Promise.all([
      call(w.R, "GET", "/relay/v1/t/" + w.rt + "/nowhere"), call(w.R, "GET", "/relay/v2/teams"),
      call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/0?x=1"), call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/0", { scheme: "http" }),
      call(w.R, "GET", "/relay/v1/t/" + w.rt + "/hello"), call(w.R, "DELETE", "/relay/v1/t/" + w.rt + "/b/" + hex(16)),
      call(w.R, "GET", "/relay/v1/teams")]);
    check(routes.every(r => r.status === 404 && refused(r, "missing")),
      "1b an unknown path, another version, a query, plain http and a wrong method are each missing: " + routes.map(r => r.status).join(","));
    check(w.R.asked.length > 0 && w.R.asked.every(j => j === "eu"), "1c every team object is asked of the EU jurisdiction: " + JSON.stringify([...new Set(w.R.asked)]));
  }

  /* ---- 2: create ---- */
  {
    const w = await world();
    const text = dumpText(w);
    const team = w.R.stores.get(w.rt).get("team");
    check(!!team && team.rt === w.rt && team.lead.keyId === w.lead.keyId && team.lead.pub === w.lead.pub
      && Object.keys(team).sort().join() === "epoch,lead,rt",
      "2a a lead makes its team, and the object keeps its id, the lead's key and the epoch floor only");
    const v = { R: S.relayEnv(), rt: hex(16), lead: keyPair(false) };
    const marker = "TeamName" + hex(4);
    const named = await create(v, v.lead, 0, { name: marker, teamId: marker });
    check(named.status === 200 && named.json.rt === v.rt && dumpText(v).indexOf(marker) < 0 && text.indexOf("TeamName") < 0,
      "2b a name or a team id sent beside the create is never kept");
    const x = { R: S.relayEnv(), rt: hex(16), lead: keyPair(false) };
    const forged = await call(x.R, "POST", "/relay/v1/teams", { json: { rt: x.rt, lead: { keyId: x.lead.keyId, pub: x.lead.pub }, t: 0,
      sig: signHex(keyPair(false), C.createBytes(x.rt, x.lead.keyId, 0)) } });
    check(refused(forged, "bad-signature") && (x.R.stores.get(x.rt) || S.memoryStore()).get("team") === undefined,
      "2c a create signed by another key is refused, and nothing is kept");
    const late = await create(x, x.lead, -5 * MIN - 1), early = await create(x, x.lead, 5 * MIN + 1);
    check(refused(late, "nonce-stale") && refused(early, "nonce-stale"), "2d a create more than 5 minutes off the relay's clock either way is refused");
    const thief = keyPair(false);
    const taken = await create(w, thief, w.R.clock.now);
    const still = await devices(w, w.devs.slice(0, 1));
    const thiefCall = await devices(w, [], { signer: thief, rev: 50 });
    check(refused(taken, "not-enrolled") && still.status === 200 && refused(thiefCall, "bad-signature"),
      "2e another lead's create of a team already made is refused, and the first lead still holds it");
    const again = await create(w, w.lead, w.R.clock.now);
    const kept = w.R.stores.get(w.rt).get("dev:" + w.desk.keyId);
    check(again.status === 200 && !!kept, "2f the same create sent again answers as before and leaves the team as it was");
    const shapes = await Promise.all([
      call(x.R, "POST", "/relay/v1/teams", { json: { rt: "short", lead: { keyId: x.lead.keyId, pub: x.lead.pub }, t: 0, sig: "00" } }),
      call(x.R, "POST", "/relay/v1/teams", { body: "{not json" }),
      call(x.R, "POST", "/relay/v1/teams", { json: { rt: x.rt, lead: { keyId: x.lead.keyId, pub: "zz" }, t: 0, sig: "00" } })]);
    check(shapes.every(r => refused(r, "bad-signature")), "2g a create that is not well formed is refused as a signature that does not hold");
    const huge = await call(x.R, "POST", "/relay/v1/teams", { json: { rt: x.rt, pad: "x".repeat(300 * 1024) } });
    const hugeDevs = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/devices", { json: { keys: [], pad: "x".repeat(300 * 1024) } });
    check(refused(huge, "blob-size") && refused(hugeDevs, "blob-size"), "2h a request body over 256 KB is refused as larger than the relay accepts");
  }

  /* ---- 3: devices ---- */
  {
    const w = await world();
    const a = await helloAs(w, w.desk), b = await helloAs(w, w.other);
    check(a.status === 200 && b.status === 200 && w.rev === 1, "3a the lead enrols two desks, one by its branch id and one by its public key, and each then makes a hello");
    const bySelf = await devices(w, w.devs, { signer: w.desk });
    check(refused(bySelf, "bad-signature"), "3b an enrolled set signed by a desk is refused");
    const stale = await devices(w, w.devs, { t: w.R.clock.now - 5 * MIN - 1 });
    check(refused(stale, "nonce-stale"), "3c an enrolled set more than 5 minutes old is refused");
    const same = await devices(w, w.devs, { rev: 1 }), lower = await devices(w, w.devs, { rev: 0 });
    check(refused(same, "replay-rev") && refused(lower, "replay-rev"), "3d an enrolled set at or below the last rev is refused");
    const odd = keyPair(false);
    const bad = await Promise.all([
      devices(w, [{ id: "k-" + hex(8), pub: odd.pub, desk: "k-" + hex(8) }]),
      devices(w, [{ id: w.lead.keyId, pub: w.lead.pub, desk: "k-" + hex(8) }]),
      devices(w, [w.devs[0], w.devs[0]]),
      devices(w, [{ id: odd.keyId, pub: odd.pub, desk: "Desk One" }])]);
    check(bad.every(r => refused(r, "bad-signature")) && w.rev === 1,
      "3e a key whose id is neither its public key nor its branch id, the lead's own key, a key twice or a desk id out of shape is refused");
    const many = [];
    for (let i = 0; i < 1001; i++) { const k = keyPair(false); many.push({ id: k.keyId, pub: k.pub, desk: "k-" + i.toString(16).padStart(6, "0") }); }
    const full = await devices(w, many);
    check(refused(full, "team-size") && w.rev === 1, "3f more than 1000 enrolled keys are refused");

    const lead = await sessionOf(w, w.lead), deskS = a.json.session, otherS = b.json.session;
    const up = await put(w, lead, sealAs(w, w.lead, "guide.ec", 1));
    const sub = await socket(w, deskS);
    const subOther = await socket(w, otherS);
    const ws = wsOf(w, sub.socket);
    const gone = await devices(w, w.devs.slice(1));
    const reads = await Promise.all([since(w, deskS), getBlob(w, deskS, up.json.id), socket(w, deskS),
      put(w, deskS, sealAs(w, w.desk, "desks/" + w.deskId + "/join.json", 1))]);
    const again = await helloAs(w, w.desk);
    const otherStill = await since(w, otherS);
    check(gone.status === 200 && reads.every(r => refused(r, "removed")) && refused(again, "removed") && otherStill.status === 200,
      "3g a withdrawn key's open session answers removed at once for the list, a blob, the socket and an upload, its new hello is removed, and the other desk is still served");
    check(!!ws && !!ws.closed && ws.closed.code === 4403 && !wsOf(w, sub.socket) && !!wsOf(w, subOther.socket),
      "3h a withdrawn key's socket is closed at once, and the other desk's stays open");
    const nobody = { R: w.R, rt: hex(16), lead: w.lead, rev: 0 };
    const noTeam = await Promise.all([devices(nobody, w.devs), invites(nobody, [{ id: hex(16), hash: sha(hex(32)) }], []),
      helloAs(nobody, w.lead, { nonce: hex(16) })]);
    check(noTeam.every(r => refused(r, "not-enrolled")), "3j an enrolled set, invitations or a session for a team never made is refused");
    const back = await devices(w, w.devs);
    const fresh = await helloAs(w, w.desk);
    const old = await since(w, deskS);
    check(back.status === 200 && fresh.status === 200 && refused(old, "removed"),
      "3i a key enrolled again opens a new session, and the session it held when withdrawn stays removed");
  }

  /* ---- 4: invites ---- */
  {
    const w = await world();
    const token = hex(32), id = hex(16);
    const added = await invites(w, [{ id, hash: sha(token) }], []);
    const opened = await tokenHello(w, id, token);
    check(added.status === 200 && opened.status === 200 && /^[0-9a-f]{64}$/.test(opened.json.session) && dumpText(w).indexOf(token) < 0,
      "4a the lead adds an invitation by its token's sha256, the token opens a session, and the token itself is kept nowhere");
    const forged = await invites(w, [{ id: hex(16), hash: sha(hex(32)) }], [], { signer: w.desk });
    check(refused(forged, "bad-signature"), "4b invitations signed by a desk are refused");
    const stale = await invites(w, [{ id: hex(16), hash: sha(hex(32)) }], [], { t: w.R.clock.now - 5 * MIN - 1 });
    check(refused(stale, "nonce-stale"), "4c invitations more than 5 minutes old are refused");
    const add2 = [{ id: hex(16), hash: sha(hex(32)) }];
    const first = await invites(w, add2, []);
    const replayed = await invites(w, add2, []);
    const sameMs = await invites(w, [{ id: hex(16), hash: sha(hex(32)) }], []);
    check(first.status === 200 && refused(replayed, "replay-counter") && sameMs.status === 200,
      "4d the same invitations call sent twice is refused the second time, and another call in the same millisecond is taken");
    w.R.clock.now += 6 * MIN;
    const late = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/invites", { json: { add: add2, drop: [], t: 0,
      sig: signHex(w.lead, C.invitesBytes(w.rt, 0, add2, [])) } });
    check(refused(late, "nonce-stale"), "4e that call replayed once its 5 minutes have passed is still refused");
    const lots = [];
    for (let i = 0; i < 198; i++) lots.push({ id: hex(16), hash: sha(hex(32)) });
    const to200 = await invites(w, lots, []);
    const over = await invites(w, [{ id: hex(16), hash: sha(hex(32)) }], []);
    check(to200.status === 200 && refused(over, "team-size"), "4f two hundred live invitations are kept and the next is refused");
    const t2 = hex(32), id2 = hex(16);
    await invites(w, [{ id: id2, hash: sha(t2) }], lots.slice(0, 1).map(x => x.id));
    const s2 = await tokenHello(w, id2, t2);
    const sub = await socket(w, s2.json.session);
    const ws = wsOf(w, sub.socket);
    const dropped = await invites(w, [], [id2]);
    const after = await since(w, s2.json.session);
    const reopen = await tokenHello(w, id2, t2);
    check(dropped.status === 200 && refused(after, "no-hello") && refused(reopen, "token-spent") && !!ws && !!ws.closed,
      "4g a dropped invitation's session ends, its socket closes, and its token opens nothing, refused as spent since it was used (F9)");
    const shapes = await Promise.all([invites(w, [{ id: hex(16), hash: "abc" }], []), invites(w, [{ id: "x", hash: sha("a") }], []),
      invites(w, [], ["nothex"])]);
    check(shapes.every(r => refused(r, "bad-signature")), "4h an invitation or a drop out of shape is refused");
  }

  /* ---- 5: challenges ---- */
  {
    const w = await world();
    w.R.clock.now = 1000;
    const r = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/hello", { json: {} });
    check(r.status === 200 && /^[0-9a-f]{32}$/.test(r.json.challenge) && r.json.until === 1000 + 5 * MIN
      && Object.keys(r.json).sort().join() === "challenge,until", "5a a challenge is 16 random bytes in hex, living 5 minutes");
    const nobody = hex(16);
    const none = await call(w.R, "POST", "/relay/v1/t/" + nobody + "/hello", { json: {} });
    const keptNothing = !w.R.stores.get(nobody) || w.R.stores.get(nobody).dump().length === 0;
    check(refused(none, "not-enrolled") && keptNothing, "5b a challenge for a team never made is refused, and nothing is kept for it");
    const firstNonce = await challenge(w);
    for (let i = 0; i < 256; i++) await challenge(w);
    const live = w.R.stores.get(w.rt).list("ch:").length;
    const oldest = await helloAs(w, w.desk, { nonce: firstNonce });
    check(live === 256 && refused(oldest, "hello-replay"), "5c past 256 live challenges the oldest is let go: " + live + " kept");
  }

  /* ---- 6: a session by key ---- */
  {
    const w = await world();
    w.R.clock.now = 7000;
    const s = await helloAs(w, w.desk);
    check(s.status === 200 && /^[0-9a-f]{64}$/.test(s.json.session) && s.json.until === 7000 + 30 * MIN
      && dumpText(w).indexOf(s.json.session) < 0 && !!w.R.stores.get(w.rt).get("ses:" + sha(s.json.session)),
      "6a a desk's signed hello opens a session of 30 minutes, kept by its sha256 alone");
    const unknown = await helloAs(w, w.desk, { nonce: hex(16) });
    const n = await challenge(w);
    const once = await helloAs(w, w.desk, { nonce: n }), twice = await helloAs(w, w.desk, { nonce: n });
    check(refused(unknown, "hello-replay") && once.status === 200 && refused(twice, "hello-replay"),
      "6b a challenge the relay never issued, or one already used, is refused");
    const n5 = await challenge(w);
    w.R.clock.now += 5 * MIN;
    const at5 = await helloAs(w, w.desk, { nonce: n5 });
    const n6 = await challenge(w);
    w.R.clock.now += 5 * MIN + 1;
    const past = await helloAs(w, w.desk, { nonce: n6 });
    check(at5.status === 200 && refused(past, "nonce-stale"), "6c a challenge opens a session at 5 minutes and is refused one millisecond later");
    const stranger = keyPair(false);
    const notOn = await helloAs(w, stranger);
    check(refused(notOn, "not-enrolled"), "6d a hello by a key never enrolled is refused");
    const n7 = await challenge(w);
    const forged = await helloAs(w, w.desk, { nonce: n7, signer: w.other });
    const honest = await helloAs(w, w.desk, { nonce: n7 });
    check(refused(forged, "bad-signature") && honest.status === 200, "6e a forged hello is refused and leaves its challenge to the honest one");
    const named = await helloAs(w, w.desk, { signer: stranger, pub: stranger.pub });
    check(refused(named, "bad-signature"), "6f a public key the caller names is not the key that judges the hello");
    const elsewhere = await helloAs(w, w.desk, { signedRt: hex(16) });
    check(refused(elsewhere, "bad-signature"), "6g a hello signed for another team is refused");
    const lead = await helloAs(w, w.lead), leadForged = await helloAs(w, w.lead, { signer: w.desk });
    check(lead.status === 200 && refused(leadForged, "bad-signature"), "6h the lead's own hello opens a session, and one naming the lead's key signed by another is refused");
    await devices(w, w.devs.slice(1));
    const outs = await Promise.all([helloAs(w, w.desk, { sig: "" }), helloAs(w, w.desk, { signer: w.other }),
      helloAs(w, w.desk, { sig: "00".repeat(64) }), helloAs(w, w.desk, { signer: w.other, pub: w.other.pub })]);
    const genuine = await helloAs(w, w.desk);
    check(outs.every(r => refused(r, "bad-signature")) && refused(genuine, "removed"),
      "6i a removed key's hello unsigned, forged, zeroed or under a named key is a bad signature, and only a genuine one says removed");
    const v = await world();
    const firstS = await sessionOf(v, v.other);
    for (let i = 0; i < 1024; i++) { v.R.clock.now += 1; await sessionOf(v, v.other); }
    const liveS = v.R.stores.get(v.rt).list("ses:").length;
    const evicted = await since(v, firstS);
    check(liveS === 1024 && refused(evicted, "no-hello"), "6j past 1024 live sessions the one nearest its end is let go: " + liveS + " kept");
  }

  /* ---- 7: a session by invitation ---- */
  {
    const w = await world();
    const token = hex(32), id = hex(16);
    await invites(w, [{ id, hash: sha(token) }], []);
    const first = await tokenHello(w, id, token), second = await tokenHello(w, id, token);
    check(first.status === 200 && refused(second, "token-spent"), "7a an invitation's token opens one session and is then spent");
    const t2 = hex(32), id2 = hex(16);
    await invites(w, [{ id: id2, hash: sha(t2) }], []);
    const wrong = await tokenHello(w, id2, hex(32)), hashed = await tokenHello(w, id2, sha(t2));
    const right = await tokenHello(w, id2, t2);
    check(refused(wrong, "not-enrolled") && refused(hashed, "not-enrolled") && right.status === 200,
      "7b a wrong token, or the stored hash presented as the token, is refused, and the right token still opens");
    const t3 = hex(32), id3 = hex(16);
    await invites(w, [{ id: id3, hash: sha(t3) }], []);
    let twentieth = null;
    for (let i = 1; i <= 20; i++) twentieth = await tokenHello(w, id3, "wrong-" + i);
    const locked = await tokenHello(w, id3, t3);
    check(refused(twentieth, "not-enrolled") && refused(locked, "token-tries"),
      "7c after 20 wrong tokens the right one is refused as tried too many times, and the twentieth was still a wrong token");
    const stray = await tokenHello(w, hex(16), t3);
    check(refused(stray, "not-enrolled"), "7d an invitation the relay does not hold opens nothing");

    /* F9 of the slice 1 review: a spent invitation stays spent past the 30-day keep, whether the lead sends its id again or
       not, and the relay keeps of it only that it was spent. The test architect's f9 reproduction is 7e, its control 7E. */
    const t5 = hex(32), id5 = hex(16);
    await invites(w, [{ id: id5, hash: sha(t5) }], []);
    const used = await tokenHello(w, id5, t5);
    w.R.clock.now += 1000;
    const again = await invites(w, [{ id: id5, hash: sha(t5) }], []);
    const early = await tokenHello(w, id5, t5);
    check(used.status === 200 && again.status === 200 && refused(early, "token-spent"),
      "7E f9-control: before the keep is over a spent invitation's token is refused as spent, the lead sending its id again included");
    w.R.clock.now += C.KEEP_MS + 1;
    const pruned = await since(w, await sessionOf(w, w.lead));
    const late = await tokenHello(w, id5, t5);
    w.R.clock.now += 1000;
    const revive = await invites(w, [{ id: id5, hash: sha(t5) }], []);
    const after = await tokenHello(w, id5, t5);
    const kept = w.R.stores.get(w.rt).get("inv:" + id5);
    check(pruned.status === 200 && refused(late, "token-spent") && revive.status === 200 && refused(after, "token-spent")
      && JSON.stringify(kept) === "{\"spent\":true}",
      "7e f9: past the 30-day keep, its prune run, a spent invitation's token is still refused as spent, the lead sending its id again makes"
      + " it live in no way, and the relay keeps of it only that it was spent: " + (late.json && late.json.error) + ", then "
      + (after.json && after.json.error || "a session") + ", kept " + JSON.stringify(kept));
    const t6 = hex(32), id6 = hex(16), t7 = hex(32), id7 = hex(16);
    await invites(w, [{ id: id6, hash: sha(t6) }, { id: id7, hash: sha(t7) }], []);
    const used6 = await tokenHello(w, id6, t6);
    w.R.clock.now += 1000;
    await invites(w, [], [id6, id7]);
    w.R.clock.now += 1000;
    const back = await invites(w, [{ id: id6, hash: sha(t6) }, { id: id7, hash: sha(t7) }], []);
    const spent6 = await tokenHello(w, id6, t6), fresh7 = await tokenHello(w, id7, t7);
    check(used6.status === 200 && back.status === 200 && refused(spent6, "token-spent") && fresh7.status === 200
      && JSON.stringify(w.R.stores.get(w.rt).get("inv:" + id6)) === "{\"spent\":true}",
      "7f a spent invitation the lead drops and then sends again stays spent, kept as only that it was spent, while one dropped unused may"
      + " be sent again and opens: " + (spent6.json && spent6.json.error || "a session") + ", the unused " + fresh7.status);
  }

  /* ---- 8: reads are gated, and a session ends ---- */
  {
    const w = await world();
    const lead = await sessionOf(w, w.lead);
    const up = await put(w, lead, sealAs(w, w.lead, "guide.ec", 1));
    const bare = await Promise.all([since(w, null), getBlob(w, null, up.json.id), socket(w, null),
      since(w, hex(32)), getBlob(w, hex(32), up.json.id), socket(w, hex(32))]);
    check(bare.every(r => r.status === 401 && refused(r, "no-hello")),
      "8a with no session, or a session the relay never issued, the list, a blob and the socket each serve nothing");
    const v = await world();
    const vs = await sessionOf(v, v.desk);
    const cross = await Promise.all([since(w, vs), getBlob(w, vs, up.json.id), socket(w, vs)]);
    check(cross.every(r => refused(r, "no-hello")), "8b a session of another team serves nothing here");
    const desk = await sessionOf(w, w.desk);
    w.R.clock.now += 30 * MIN;
    const at30 = await since(w, desk);
    w.R.clock.now += 1;
    const ended = await Promise.all([since(w, desk), getBlob(w, desk, up.json.id), socket(w, desk),
      put(w, desk, sealAs(w, w.desk, "desks/" + w.deskId + "/a.ec", 1))]);
    check(at30.status === 200 && ended.every(r => refused(r, "no-hello")),
      "8c a session serves at 30 minutes and nothing one millisecond later: the list, a blob, the socket and an upload");

    const x = await world();
    const xs = await sessionOf(x, x.lead);
    const b1 = sealAs(x, x.lead, "a.ec", 1), b2 = sealAs(x, x.lead, "b.ec", 2), b3 = sealAs(x, x.lead, "c.ec", 3, { supersedes: b1.id });
    const u1 = await put(x, xs, b1), u2 = await put(x, xs, b2), u3 = await put(x, xs, b3);
    const all = await since(x, xs), tail = await since(x, xs, u2.json.seq), none = await since(x, xs, u3.json.seq);
    const fields = "counter,del,epoch,id,nonce,sig,size,supersedes,v,writer";
    check(u1.status === 200 && u3.status === 200 && Array.isArray(all.json) && all.json.length === 2
      && all.json[0].meta.id === b2.id && all.json[1].meta.id === b3.id && all.json[0].seq < all.json[1].seq
      && all.json.every(e => Object.keys(e).sort().join() === "meta,seq" && Object.keys(e.meta).sort().join() === fields)
      && tail.json.length === 1 && tail.json[0].meta.id === b3.id && none.json.length === 0,
      "8d the list is oldest first after the seq asked, each entry its seq and the served fields alone, a superseded blob left out");
    const g = await getBlob(x, xs, b2.id);
    const miss = await getBlob(x, xs, hex(16));
    check(g.status === 200 && g.bytes.equals(b2.ciphertext) && !!g.meta && g.meta.sig === b2.signature && g.meta.nonce === b2.nonce
      && g.meta.counter === 2 && g.meta.writer === x.lead.keyId && g.meta.size === b2.ciphertext.length && g.meta.supersedes === null
      && refused(miss, "missing"), "8e a blob is served byte for byte with its metadata, and an id the relay does not hold is missing");

    const y = await world();
    let ys = await sessionOf(y, y.lead);
    let okAll = true;
    for (let i = 1; i <= 1001; i++) {
      if (i % 60 === 0) { y.R.clock.now += MIN + 1; ys = await sessionOf(y, y.lead); }
      const r = await put(y, ys, sealAs(y, y.lead, "n" + i + ".ec", i));
      if (r.status !== 200) { okAll = false; break; }
    }
    const page = await since(y, ys), rest = await since(y, ys, 1000);
    check(okAll && page.json.length === 1000 && page.json[999].seq === 1000 && rest.json.length === 1 && rest.json[0].seq === 1001,
      "8f the list answers at most 1000 entries, and the next page begins after the last: " + (page.json ? page.json.length : "none"));
  }

  /* ---- 9: an upload ---- */
  {
    const w = await world();
    const lead = await sessionOf(w, w.lead), desk = await sessionOf(w, w.desk), other = await sessionOf(w, w.other);
    const subDesk = await socket(w, desk), subOther = await socket(w, other), subLead = await socket(w, lead);
    const blob = sealAs(w, w.desk, "desks/" + w.deskId + "/in-use.ec", 1);
    const up = await put(w, desk, blob);
    const rec = w.R.stores.get(w.rt).get("blob:" + blob.id);
    check(up.status === 200 && up.json.id === blob.id && up.json.seq === 1 && Object.keys(up.json).sort().join() === "id,seq"
      && !!rec && w.R.bucket.objects.get(rec.obj).equals(blob.ciphertext),
      "9a a desk's upload in its place is kept, the ciphertext in the bucket byte for byte, and answered with its seq and id");
    const toOther = sent(w, subOther.socket), toLead = sent(w, subLead.socket), toSelf = sent(w, subDesk.socket);
    check(toOther.length === 1 && JSON.stringify(toOther[0]) === JSON.stringify({ type: "new", seq: 1, id: blob.id, size: 4112 })
      && toLead.length === 1 && toSelf.length === 0, "9b every other session's socket hears the seq, the id and the size alone, and the writer's own hears nothing");
    const noSession = await put(w, null, sealAs(w, w.desk, "desks/" + w.deskId + "/a.ec", 2));
    const notYours = await put(w, other, sealAs(w, w.desk, "desks/" + w.deskId + "/a.ec", 2));
    check(refused(noSession, "no-hello") && refused(notYours, "no-hello"), "9c an upload with no session, or under another key's session, is refused");
    const deskRoot = await put(w, desk, sealAs(w, w.desk, "guide.ec", 2, { place: "root" }));
    const leadDesk = await put(w, lead, sealAs(w, w.lead, "x.ec", 1, { place: "desk:" + w.deskId }));
    const deskOther = await put(w, desk, sealAs(w, w.desk, "x.ec", 2, { place: "desk:" + w.otherId }));
    check(refused(deskRoot, "outside-place") && refused(leadDesk, "outside-place") && refused(deskOther, "outside-place"),
      "9d a place the writer is not enrolled for is refused: a desk at the root, the lead at a desk, a desk at another's");
    const b2 = sealAs(w, w.desk, "desks/" + w.deskId + "/b.ec", 2);
    const shapes = await Promise.all([put(w, desk, b2, { meta: "!!" }), put(w, desk, b2, { meta: b64url("[1]") }),
      put(w, desk, b2, { meta: metaOf(b2, { v: 2 }) }), put(w, desk, b2, { pathId: hex(16) }),
      put(w, desk, b2, { meta: metaOf(b2, { counter: "2" }) }), put(w, desk, b2, { meta: metaOf(b2, { supersedes: b2.id }) })]);
    check(shapes.every(r => refused(r, "bad-signature")), "9e metadata that will not parse, another version, an id apart from the path, a counter as text or a blob superseding itself is refused");
    const broken = Object.assign({}, b2, { signature: b2.signature.slice(0, -1) + (b2.signature.endsWith("a") ? "b" : "a") });
    const movedId = metaOf(b2, { id: hex(16) });
    const moved = await Promise.all([put(w, desk, broken), put(w, desk, b2, { meta: movedId, pathId: movedId.id }),
      put(w, desk, b2, { meta: metaOf(b2, { epoch: 2 }) }), put(w, desk, b2, { meta: metaOf(b2, { counter: 9 }) }),
      put(w, desk, b2, { meta: metaOf(b2, { supersedes: hex(16) }) })]);
    check(moved.every(r => refused(r, "bad-signature")),
      "9f a broken signature, or the id, epoch, counter or supersedes moved off what was signed, is refused");
    const forged = sealAs(w, w.lead, "guide.ec", 100);
    forged.signature = forged.signature.slice(0, -1) + (forged.signature.endsWith("0") ? "1" : "0");
    const f = await put(w, lead, forged), real = await put(w, lead, sealAs(w, w.lead, "guide.ec", 1));
    check(refused(f, "bad-signature") && real.status === 200, "9g a forged upload at counter 100 leaves the floor where it was, so the lead's counter 1 is then taken");
    const equal = await put(w, desk, sealAs(w, w.desk, "desks/" + w.deskId + "/c.ec", 1)), lower = await put(w, lead, sealAs(w, w.lead, "x.ec", 1));
    const otherFirst = await put(w, other, sealAs(w, w.other, "desks/" + w.otherId + "/a.ec", 1));
    check(refused(equal, "replay-counter") && refused(lower, "replay-counter") && otherFirst.status === 200,
      "9h a counter at or below its writer's last is refused, and the floor is the writer's own");
    const reused = await put(w, desk, sealAs(w, w.desk, "desks/" + w.deskId + "/c.ec", 5, { id: blob.id }));
    check(refused(reused, "replay-counter"), "9i an id the team already holds is refused, whatever the counter");
    const leadBlob = sealAs(w, w.lead, "notes.ec", 2);
    await put(w, lead, leadBlob);
    const theirs = await put(w, desk, sealAs(w, w.desk, "desks/" + w.deskId + "/d.ec", 6, { supersedes: leadBlob.id }));
    const ownNext = await put(w, desk, sealAs(w, w.desk, "desks/" + w.deskId + "/in-use.ec", 7, { supersedes: blob.id }));
    const deskBlob = sealAs(w, w.other, "desks/" + w.otherId + "/b.ec", 2);
    await put(w, other, deskBlob);
    const leadOver = await put(w, lead, sealAs(w, w.lead, "y.ec", 3, { supersedes: deskBlob.id }));
    const theirsBuried = await put(w, desk, sealAs(w, w.desk, "desks/" + w.deskId + "/e.ec", 8, { supersedes: deskBlob.id }));
    check(refused(theirs, "outside-place") && ownNext.status === 200 && leadOver.status === 200 && refused(theirsBuried, "outside-place"),
      "9j a desk may supersede only its own chain, and the lead any; another writer's superseded id is still not the desk's");
    const e2 = await put(w, lead, sealAs(w, w.lead, "team.json", 1, { epoch: 2 }));
    const behind = await put(w, other, sealAs(w, w.other, "desks/" + w.otherId + "/c.ec", 3));
    const atTwo = await put(w, other, sealAs(w, w.other, "desks/" + w.otherId + "/c.ec", 1, { epoch: 2 }));
    check(e2.status === 200 && refused(behind, "epoch") && atTwo.status === 200,
      "9k once the lead uploads at epoch 2 an upload at epoch 1 is refused, and a new epoch's counter starts again at 1");

    const sizer = sealAs(w, w.lead, "s.ec", 99);
    const t = await world({ limits: { teamMax: 2 * sizer.ciphertext.length } });
    const ts = await sessionOf(t, t.lead);
    const t1 = sealAs(t, t.lead, "a.ec", 1);
    const okA = await put(t, ts, t1), okB = await put(t, ts, sealAs(t, t.lead, "b.ec", 2));
    const full = await put(t, ts, sealAs(t, t.lead, "c.ec", 3));
    const freed = await put(t, ts, sealAs(t, t.lead, "c.ec", 4, { supersedes: t1.id }));
    check(okA.status === 200 && okB.status === 200 && refused(full, "team-size") && freed.status === 200,
      "9l the team's bytes past its cap are refused, and a superseded blob gives its bytes back");
    const r = await world();
    const rs = await sessionOf(r, r.lead);
    let sixty = true;
    for (let i = 1; i <= 60; i++) if ((await put(r, rs, sealAs(r, r.lead, "g.ec", i))).status !== 200) sixty = false;
    const hot = await put(r, rs, sealAs(r, r.lead, "g.ec", 61));
    const deskOk = await put(r, await sessionOf(r, r.desk), sealAs(r, r.desk, "desks/" + r.deskId + "/a.ec", 1));
    r.R.clock.now += MIN + 1;
    const cool = await put(r, rs, sealAs(r, r.lead, "g.ec", 62));
    check(sixty && refused(hot, "rate") && deskOk.status === 200 && cool.status === 200,
      "9m sixty uploads a minute are taken, the next is refused, another writer is not held by it, and the window slides");

    let pulled = 0;
    const lie = new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(16)); c.close(); } }, { highWaterMark: 0 });
    const declared = await put(w, desk, sealAs(w, w.desk, "desks/" + w.deskId + "/big.ec", 20), { body: lie, length: B.BLOB_MAX + 1 });
    check(refused(declared, "blob-size") && declared.status === 413 && pulled === 0, "9n a body declared over 50 MB is refused unread");
    let streamed = 0;
    const piece = Buffer.alloc(1024 * 1024, 7);
    const flood = new ReadableStream({ pull(c) { if (streamed >= 60 * 1024 * 1024) { c.close(); return; } streamed += piece.length; c.enqueue(new Uint8Array(piece)); } },
      { highWaterMark: 0 });
    const big = await put(w, desk, sealAs(w, w.desk, "desks/" + w.deskId + "/big.ec", 21), { body: flood });
    check(refused(big, "blob-size") && streamed <= B.BLOB_MAX + 4 * piece.length,
      "9o a body streamed past 50 MB with no length declared is refused, read no further than the cap: " + (streamed >> 20) + " MB read");
  }

  /* F7, the relay's half. A desk's upload at an epoch the team has not reached is refused. The lead's own upload is
     what raises the stored epoch, and a desk at that epoch is still taken. */
  {
    const w = await world();
    const lead = await sessionOf(w, w.lead);
    const raised = await put(w, lead, sealAs(w, w.lead, "guide.ec", 1));
    const team = w.R.stores.get(w.rt).get("team");
    check(raised.status === 200 && !!team && team.epoch === 1,
      "9p f7-setup a lead upload at epoch 1 is kept and the stored team epoch is " + (team ? team.epoch : "none"));
    const desk = await sessionOf(w, w.desk);
    const high = await put(w, desk, sealAs(w, w.desk, "desks/" + w.deskId + "/branch.ec", 1, { epoch: 999999 }));
    const atOne = await put(w, desk, sealAs(w, w.desk, "desks/" + w.deskId + "/kept.ec", 1));
    check(refused(high, "epoch") && atOne.status === 200,
      "9q f7 a desk upload at an epoch the team has not reached is refused, and one at the team's epoch is kept: high "
      + (high.status === 200 ? "accepted" : (high.json && high.json.error)) + ", at the team's epoch " + atOne.status);
  }

  /* ---- 10: the one invitation upload ---- */
  {
    const w = await world();
    const token = hex(32), id = hex(16), joiner = keyPair(true), newDesk = "k-" + hex(8);
    await invites(w, [{ id, hash: sha(token) }], []);
    const s = (await tokenHello(w, id, token, null, joiner)).json.session;
    const sealJoin = (who, counter, extra) => B.seal(Object.assign({ relayTeamId: w.rt, epoch: 1, teamKey: crypto.randomBytes(32),
      writer: { keyId: who.keyId, privateKey: who.privateKey }, path: "desks/" + newDesk + "/join.json", body: "ask", counter,
      place: "desk:" + newDesk, kind: "file" }, extra || {}));
    const tooBig = await put(w, s, sealJoin(joiner, 1, { body: "x".repeat(70 * 1024) }), { extra: { pub: joiner.pub } });
    const rootJoin = await put(w, s, sealJoin(joiner, 1, { place: "root" }), { extra: { pub: joiner.pub } });
    const taken = await put(w, s, sealJoin(joiner, 1, { place: "desk:" + w.deskId }), { extra: { pub: joiner.pub } });
    const enrolledVia = await put(w, s, B.seal({ relayTeamId: w.rt, epoch: 1, teamKey: crypto.randomBytes(32),
      writer: { keyId: w.desk.keyId, privateKey: w.desk.privateKey }, path: "desks/" + w.deskId + "/x.json", body: "x", counter: 1,
      place: "desk:" + w.deskId, kind: "file" }), { extra: { pub: w.desk.pub } });
    const liar = keyPair(false);
    const mismatch = await put(w, s, sealJoin({ keyId: joiner.keyId, privateKey: liar.privateKey }, 1), { extra: { pub: liar.pub } });
    const join = sealJoin(joiner, 1);
    const ok = await put(w, s, join, { extra: { pub: joiner.pub } });
    const second = await put(w, s, sealJoin(joiner, 2), { extra: { pub: joiner.pub } });
    check(ok.status === 200 && refused(second, "token-spent"), "10a an invitation's session makes one upload, by a writer not enrolled at a desk place nobody holds, and no second");
    check(refused(tooBig, "blob-size") && refused(rootJoin, "outside-place") && refused(taken, "outside-place"),
      "10b an invitation's upload over 64 KB, at the root or at an enrolled desk's place is refused");
    check(refused(enrolledVia, "no-hello") && refused(mismatch, "bad-signature"),
      "10c an enrolled key uploads only under its own hello, and a writer whose id does not come from its public key is refused");
    const lead = await sessionOf(w, w.lead);
    const read = await getBlob(w, lead, join.id);
    check(read.status === 200 && read.meta.pub === joiner.pub && read.meta.writer === joiner.keyId, "10d the lead reads the join file with the public key it was signed under");
    const t2 = hex(32), id2 = hex(16);
    await invites(w, [{ id: id2, hash: sha(t2) }], []);
    const s2 = (await tokenHello(w, id2, t2, null, w.desk)).json.session;
    await devices(w, w.devs.slice(1));
    const removedVia = await put(w, s2, B.seal({ relayTeamId: w.rt, epoch: 1, teamKey: crypto.randomBytes(32),
      writer: { keyId: w.desk.keyId, privateKey: w.desk.privateKey }, path: "desks/k-new/x.json", body: "x", counter: 3,
      place: "desk:k-" + hex(8), kind: "file" }), { extra: { pub: w.desk.pub } });
    check(refused(removedVia, "removed"), "10e a withdrawn key cannot come back through an invitation's session");

    /* N4: the token's one session binds the desk's key where the hello names it and is signed by it. Until the one upload, that
       key's own hello opens the invitation's session again, the session before it let go; the token stays spent. */
    const t3 = hex(32), id3 = hex(16), asker = keyPair(true), askDesk = "k-" + hex(8);
    await invites(w, [{ id: id3, hash: sha(t3) }], []);
    const n3 = await challenge(w);
    const bound = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: { challenge: n3, invite: t3, inv: id3,
      key: asker.keyId, pub: asker.pub, sig: signHex(asker, C.helloBytes(w.rt, n3, asker.keyId)) } });
    const tokenAgain = await tokenHello(w, id3, t3);
    const resumed = await helloAs(w, asker);
    const strangerKey = await helloAs(w, keyPair(true));
    const firstGone = await since(w, bound.json && bound.json.session);
    check(bound.status === 200 && bound.json.invite === true && refused(tokenAgain, "token-spent") && resumed.status === 200
      && resumed.json.invite === true && refused(strangerKey, "not-enrolled") && refused(firstGone, "no-hello"),
      "10f a token hello signed by the desk's key binds it: that key's own hello opens the invitation's session again, marked as the"
      + " invitation's, and lets the one before it go, while the token stays spent and another key opens nothing: "
      + (resumed.json && resumed.json.error || "resumed") + ", the token " + (tokenAgain.json && tokenAgain.json.error));
    const sealAsk = (who, counter) => B.seal({ relayTeamId: w.rt, epoch: 1, teamKey: crypto.randomBytes(32),
      writer: { keyId: who.keyId, privateKey: who.privateKey }, path: "desks/" + askDesk + "/join.json", body: "ask", counter,
      place: "desk:" + askDesk, kind: "file" });
    const usurper = keyPair(true);
    const rs = resumed.json && resumed.json.session;
    const byUsurper = await put(w, rs, sealAsk(usurper, 1), { extra: { pub: usurper.pub } });
    const askUp = await put(w, rs, sealAsk(asker, 1), { extra: { pub: asker.pub } });
    const askSecond = await put(w, rs, sealAsk(asker, 2), { extra: { pub: asker.pub } });
    const afterUp = await helloAs(w, asker);
    check(refused(byUsurper, "no-hello") && askUp.status === 200 && refused(askSecond, "token-spent") && refused(afterUp, "not-enrolled"),
      "10g the session a bound key opens again makes the invitation's one upload, by that key alone, and once it is made the key opens"
      + " nothing until it is enrolled: another writer " + (byUsurper.json && byUsurper.json.error) + ", a second upload "
      + (askSecond.json && askSecond.json.error) + ", the key's hello after " + (afterUp.json && afterUp.json.error));
    const t4 = hex(32), id4 = hex(16), unsigned = keyPair(true);
    await invites(w, [{ id: id4, hash: sha(t4) }], []);
    const n4 = await challenge(w);
    const loose = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: { challenge: n4, invite: t4, inv: id4,
      key: unsigned.keyId, pub: unsigned.pub, sig: signHex(keyPair(true), C.helloBytes(w.rt, n4, unsigned.keyId)) } });
    const looseKey = await helloAs(w, unsigned);
    const held4 = w.R.stores.get(w.rt).get("inv:" + id4) || {};
    const n4b = await challenge(w);
    const later = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: { challenge: n4b, invite: t4, inv: id4,
      key: unsigned.keyId, pub: unsigned.pub, sig: signHex(unsigned, C.helloBytes(w.rt, n4b, unsigned.keyId)) } });
    check(refused(loose, "bad-signature") && refused(looseKey, "not-enrolled") && held4.spent !== true && !("key" in held4)
      && later.status === 200 && later.json.invite === true,
      "10h a token hello naming a key it is not signed by is refused and spends nothing, and a later hello signed by that key opens");

    /* The resume's own signature (C1 of the test architect's read of cf90c15): a hello naming a bound key, signed by another
       key or by none, opens nothing and lets no session go, so the desk's resumed session still lists. Were the resume to stop
       verifying its hello under the bound key, anyone who knew that key's id would open the invitation's session and knock the
       desk's out, and 10i goes red. */
    const t5 = hex(32), id5 = hex(16), binder = keyPair(true);
    await invites(w, [{ id: id5, hash: sha(t5) }], []);
    const n5 = await challenge(w);
    const bind5 = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: { challenge: n5, invite: t5, inv: id5,
      key: binder.keyId, pub: binder.pub, sig: signHex(binder, C.helloBytes(w.rt, n5, binder.keyId)) } });
    const own = await helloAs(w, binder);
    const forged = await helloAs(w, binder, { signer: keyPair(true) });
    const bare = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: { challenge: await challenge(w), key: binder.keyId } });
    const stillLists = await since(w, own.json && own.json.session);
    check(bind5.status === 200 && own.status === 200 && own.json.invite === true && refused(forged, "not-enrolled")
      && refused(bare, "not-enrolled") && stillLists.status === 200,
      "10i a hello naming a bound key, signed by another key or by none, opens nothing and lets no session go: the forged one "
      + (forged.json && forged.json.error || "OPENED A SESSION") + ", the unsigned one " + (bare.json && bare.json.error || "OPENED A SESSION")
      + ", the desk's resumed session then listing " + stillLists.status);
  }

  /* A bound key's resume ends when the invitation's 30-day keep does, whether or not a list has pruned the record by then (C2
     of the test architect's read of cf90c15): two keys bound at the same moment; one resumes a minute inside the keep, the
     other a minute past it with no list between; the session opened inside the keep then tries the one upload past the keep,
     before a list prunes the record and after. */
  {
    const w = await world();
    async function bindTo(who) {
      const token = hex(32), id = hex(16);
      await invites(w, [{ id, hash: sha(token) }], []);
      const n = await challenge(w);
      const r = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: { challenge: n, invite: token, inv: id,
        key: who.keyId, pub: who.pub, sig: signHex(who, C.helloBytes(w.rt, n, who.keyId)) } });
      return { id, ok: r.status === 200 && r.json.invite === true };
    }
    const early = keyPair(true), late = keyPair(true), earlyDesk = "k-" + hex(8);
    const a = await bindTo(early), b = await bindTo(late);
    w.R.clock.now += C.KEEP_MS - MIN;
    const inside = await helloAs(w, early);
    w.R.clock.now += 2 * MIN;
    const past = await helloAs(w, late);
    const ask = counter => B.seal({ relayTeamId: w.rt, epoch: 1, teamKey: crypto.randomBytes(32),
      writer: { keyId: early.keyId, privateKey: early.privateKey }, path: "desks/" + earlyDesk + "/join.json", body: "ask", counter,
      place: "desk:" + earlyDesk, kind: "file" });
    const s = inside.json && inside.json.session;
    const unpruned = await put(w, s, ask(1), { extra: { pub: early.pub } });
    const listed = await since(w, await sessionOf(w, w.lead));
    const kept = w.R.stores.get(w.rt).get("inv:" + a.id);
    const pruned = await put(w, s, ask(2), { extra: { pub: early.pub } });
    const said = r => (r.json && r.json.error) || String(r.status);
    check(a.ok && b.ok && inside.status === 200 && inside.json.invite === true && refused(past, "not-enrolled")
      && refused(unpruned, "token-spent") && listed.status === 200 && JSON.stringify(kept) === "{\"spent\":true}"
      && refused(pruned, "token-spent"),
      "10j a bound key's resume ends when the invitation's 30-day keep does, a list between or not: a minute inside the keep "
      + said(inside) + ", a minute past it with no list between " + said(past) + "; the session opened inside the keep uploads past"
      + " it " + said(unpruned) + " before a list and " + said(pruned) + " after the list kept " + JSON.stringify(kept));
  }

  /* ---- 11: chains and deletions ---- */
  {
    const w = await world();
    const lead = await sessionOf(w, w.lead), desk = await sessionOf(w, w.desk);
    const first = sealAs(w, w.lead, "guide.ec", 1);
    await put(w, lead, first);
    const objFirst = w.R.stores.get(w.rt).get("blob:" + first.id).obj;
    const bytesBefore = w.R.stores.get(w.rt).get("bytes");
    const next = await put(w, lead, sealAs(w, w.lead, "guide.ec", 2, { supersedes: first.id }));
    const old = await getBlob(w, desk, first.id), list = await since(w, desk);
    check(next.status === 200 && refused(old, "superseded") && !w.R.bucket.objects.has(objFirst) && w.R.stores.get(w.rt).get("bytes") === bytesBefore
      && list.json.length === 1 && list.json[0].meta.supersedes === first.id,
      "11a a superseded blob leaves the bucket, gives back its bytes, drops off the list and answers superseded");
    w.R.clock.now += 30 * DAY;
    const keptTomb = await getBlob(w, await sessionOf(w, w.desk), first.id);
    w.R.clock.now += 1;
    const ds = await sessionOf(w, w.desk);
    await put(w, ds, sealAs(w, w.desk, "desks/" + w.deskId + "/tick.ec", 1));
    const goneTomb = await getBlob(w, ds, first.id);
    check(refused(keptTomb, "superseded") && refused(goneTomb, "missing"), "11b a superseded id answers superseded for 30 days, and missing after");

    const x = await world();
    const xl = await sessionOf(x, x.lead);
    const del = sealAs(x, x.lead, "notes.ec", 1, { kind: "delete" });
    const up = await put(x, xl, del);
    const obj = x.R.stores.get(x.rt).get("blob:" + del.id).obj;
    const listed = await since(x, xl);
    x.R.clock.now += 30 * DAY;
    const s30 = await sessionOf(x, x.lead);
    const at30 = await getBlob(x, s30, del.id);
    x.R.clock.now += 1;
    const s31 = await sessionOf(x, x.lead);
    const after = await getBlob(x, s31, del.id), afterList = await since(x, s31);
    check(up.status === 200 && listed.json.length === 1 && listed.json[0].meta.del === true && at30.status === 200 && at30.meta.del === true
      && refused(after, "expired") && afterList.json.length === 0,
      "11c a deletion record is listed and served for 30 days, and refused as expired one millisecond later");
    await put(x, s31, sealAs(x, x.lead, "tick.ec", 2));
    const still = await getBlob(x, s31, del.id);
    check(!x.R.bucket.objects.has(obj) && refused(still, "expired"), "11d an expired deletion record's object leaves the bucket, and its id still answers expired");
    x.R.clock.now += 30 * DAY + 1;
    const s61 = await sessionOf(x, x.lead);
    await put(x, s61, sealAs(x, x.lead, "tick.ec", 3));
    const finally_ = await getBlob(x, s61, del.id);
    check(refused(finally_, "missing"), "11e a further 30 days on, the deletion record's id is missing");
  }

  /* ---- 12: the commit is judged again after the bucket's write ---- */
  {
    const w = await world();
    const desk = await sessionOf(w, w.desk);
    const p = "desks/" + w.deskId + "/in-use.ec";
    const one = sealAs(w, w.desk, p, 3), two = sealAs(w, w.desk, p, 3, { body: "other" });
    const gate = w.R.bucket.hold();
    const firstP = put(w, desk, one);
    await gate.parked;
    const second = await put(w, desk, two);
    gate.release();
    const first = await firstP;
    const objs = [...w.R.bucket.objects.keys()].filter(k => k.indexOf("/" + one.id + "/") > -1);
    check(second.status === 200 && refused(first, "replay-counter") && objs.length === 0 && !w.R.stores.get(w.rt).get("blob:" + one.id),
      "12a of two uploads at one counter, the one that commits first stands, and the other is refused and its object deleted");
    const gate2 = w.R.bucket.hold();
    const heldP = put(w, desk, sealAs(w, w.desk, p, 9));
    await gate2.parked;
    await devices(w, w.devs.slice(1));
    gate2.release();
    const held = await heldP;
    const left = [...w.R.bucket.objects.keys()].length;
    check(refused(held, "removed") && left === 1, "12b a key withdrawn while its upload sits in the bucket is refused at the commit, and the object deleted");
    const v = await world();
    const vl = await sessionOf(v, v.lead);
    const b = sealAs(v, v.lead, "guide.ec", 1);
    v.R.bucket.failPuts(1);
    const fault = await put(v, vl, b);
    const retry = await put(v, vl, b);
    check(fault.status === 500 && !!fault.json && fault.json.error === "fault" && retry.status === 200,
      "12c a bucket that refuses the write leaves nothing kept and no floor raised, so the same blob then goes up");

    /* A supersedes naming an id already superseded would fork the chain: refused as superseded, in turn and in a race. */
    const u = await world();
    const ul = await sessionOf(u, u.lead), ud = await sessionOf(u, u.desk);
    const live = ids => ids.filter(id => !!u.R.stores.get(u.rt).get("blob:" + id)).length;
    const dp = "desks/" + u.deskId + "/in-use.ec";
    const x1 = sealAs(u, u.desk, dp, 1);
    await put(u, ud, x1);
    const s2 = sealAs(u, u.desk, dp, 2, { supersedes: x1.id }), s3 = sealAs(u, u.desk, dp, 3, { supersedes: x1.id });
    const a2 = await put(u, ud, s2), a3 = await put(u, ud, s3);
    const x2 = sealAs(u, u.desk, dp, 4);
    await put(u, ud, x2);
    const d5 = sealAs(u, u.desk, dp, 5, { supersedes: x2.id }), l1 = sealAs(u, u.lead, "guide.ec", 1, { supersedes: x2.id });
    const b5 = await put(u, ud, d5), b1 = await put(u, ul, l1);
    check(a2.status === 200 && refused(a3, "superseded") && live([s2.id, s3.id]) === 1
      && b5.status === 200 && refused(b1, "superseded") && live([d5.id, l1.id]) === 1,
      "12d an upload superseding an id already superseded is refused as superseded, one writer's two in turn and a desk's then"
      + " the lead's, so a chain keeps one blob");
    const x3 = sealAs(u, u.desk, dp, 6);
    await put(u, ud, x3);
    const gate3 = u.R.bucket.hold();
    const d7 = sealAs(u, u.desk, dp, 7, { supersedes: x3.id });
    const d7P = put(u, ud, d7);
    await gate3.parked;
    const l2 = sealAs(u, u.lead, "guide.ec", 2, { supersedes: x3.id });
    const c2 = await put(u, ul, l2);
    gate3.release();
    const c7 = await d7P;
    const d7objs = [...u.R.bucket.objects.keys()].filter(k => k.indexOf("/" + d7.id + "/") > -1);
    check(c2.status === 200 && refused(c7, "superseded") && d7objs.length === 0 && live([d7.id, l2.id]) === 1,
      "12e a desk's upload parked at the bucket while the lead supersedes the same id is refused at the commit as superseded,"
      + " and its object deleted");
  }

  /* ---- 13: what the relay keeps and says ---- */
  {
    const w = await world();
    const lead = await sessionOf(w, w.lead);
    const mp = "PathMark/" + hex(6), mb = "BodyMark" + hex(6);
    const blob = sealAs(w, w.lead, mp, 1, { body: mb });
    const up = await put(w, lead, blob, { extra: { path: mp, body: mb, name: mb, teamId: mb } });
    const text = dumpText(w);
    check(up.status === 200 && text.indexOf(mp) < 0 && text.indexOf(mb) < 0 && text.indexOf("PathMark") < 0,
      "13a a path, a body or a name sent beside an upload's metadata is never kept");
    const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
    const FORBIDDEN = /\bconsole\b|createDecipheriv|\bopenBlob\b|\bunframe\b|\bdecrypt/;
    const srcs = ["core.cjs", "team.cjs", "worker.mjs"].map(f => strip(fs.readFileSync(path.join(ROOT, "relay", f), "utf8")));
    const control = FORBIDDEN.test(strip("const x = 1;\nconsole.log(x);")) && !FORBIDDEN.test(strip("/* console.log */ const y = 2;"));
    check(srcs.every(s => !FORBIDDEN.test(s)) && control,
      "13b the relay's sources log nothing and open no blob, by a scan with comments stripped that finds a planted call and not a commented one");
  }

  /* ---- 14: sockets ---- */
  {
    const w = await world();
    const desk = await sessionOf(w, w.desk), lead = await sessionOf(w, w.lead);
    const sub = await socket(w, desk);
    const ws = wsOf(w, sub.socket);
    const obj = w.R.object(w.rt);
    await obj.webSocketMessage(ws, JSON.stringify({ type: "ping" }));
    check(ws.sent.length === 1 && ws.sent[0] === JSON.stringify({ type: "pong" }), "14a a ping on the socket is answered with a pong");
    const noUpgrade = await socket(w, desk, { upgrade: false });
    check(refused(noUpgrade, "missing"), "14b a socket asked without the websocket upgrade is missing");
    w.R.clock.now += 30 * MIN + 1;
    const fresh = await sessionOf(w, w.lead);
    await put(w, fresh, sealAs(w, w.lead, "guide.ec", 1));
    check(ws.sent.length === 1 && !!ws.closed && ws.closed.code === 4401 && !!lead,
      "14c a socket whose session has ended hears no announcement and is closed at the next");
  }

  /* ---- 15: a restarted object ---- */
  {
    const w = await world();
    const lead = await sessionOf(w, w.lead);
    await put(w, lead, sealAs(w, w.lead, "guide.ec", 2));
    const token = hex(32), id = hex(16);
    await invites(w, [{ id, hash: sha(token) }], []);
    await tokenHello(w, id, token);
    w.R.restart();
    const replay = await put(w, lead, sealAs(w, w.lead, "guide.ec", 2));
    const next = await put(w, lead, sealAs(w, w.lead, "guide.ec", 3));
    const oldRev = await devices(w, w.devs, { rev: w.rev });
    const spent = await tokenHello(w, id, token);
    check(refused(replay, "replay-counter") && next.status === 200 && refused(oldRev, "replay-rev") && refused(spent, "token-spent"),
      "15a after a restart the counter and rev floors and a spent invitation hold, and the session still serves until its time");
  }

  /* ---- a reserved device name is not enrolled. writerOf would refuse it, so the relay refuses it too. ---- */
  {
    const w = await world();
    const rev = w.rev;
    const conKey = keyPair(true), nulKey = keyPair(true), ordinaryKey = keyPair(true);
    const ordinaryId = "k-" + hex(8);
    const con = await devices(w, [{ id: conKey.keyId, pub: conKey.pub, desk: "con" }]);
    const nul = await devices(w, [{ id: nulKey.keyId, pub: nulKey.pub, desk: "nul" }]);
    const ok = await devices(w, w.devs.concat([{ id: ordinaryKey.keyId, pub: ordinaryKey.pub, desk: ordinaryId }]));
    const store = w.R.stores.get(w.rt);
    const got = store.get("dev:" + ordinaryKey.keyId);
    check(refused(con, "bad-signature") && refused(nul, "bad-signature") && store.get("dev:" + conKey.keyId) === undefined
      && store.get("dev:" + nulKey.keyId) === undefined && ok.status === 200 && w.rev === rev + 1
      && !!got && got.desk === ordinaryId,
      "3k a desk id of con or nul is refused, the rev unchanged by either, and an ordinary desk id still enrols: con "
      + (con.json && con.json.error) + ", nul " + (nul.json && nul.json.error) + ", rev " + w.rev);
  }

  /* ---- 16: the harness through this relay, on the routine chain ---- */
  {
    /* Slice 2 on the real channel, the same list as relay-channel 943a. Empty once each attack is green. */
    const SLICE2_OPEN = [];
    const r = spawnSync(process.execPath, [path.join("relay", "test", "attacks.mjs")], { cwd: ROOT, encoding: "utf8",
      env: Object.assign({}, process.env, { RELAY_TARGET: path.join("relay", "test", "targets", "relay-product.cjs") }), timeout: 300000 });
    const lines = (r.stdout || "").split(/\r?\n/);
    const m = /^#counts ok=(\d+) fail=(\d+)$/m.exec(r.stdout || "");
    const ok = m ? Number(m[1]) : -1, bad = m ? Number(m[2]) : -1;
    const failIds = lines.filter(l => l.startsWith("FAIL ")).map(l => l.slice(5).split(" ")[0]);
    const okIds = lines.filter(l => l.startsWith("ok ")).map(l => l.slice(3).split(" ")[0]);
    const want = SLICE2_OPEN.slice().sort();
    const got = failIds.slice().sort();
    const same = got.length === want.length && got.every((id, i) => id === want[i]);
    const listedOk = okIds.filter(id => SLICE2_OPEN.indexOf(id) !== -1);
    const complete = !!m && ok === okIds.length && bad === failIds.length && r.status === bad && listedOk.length === 0;
    const missing = want.filter(id => got.indexOf(id) === -1);
    const extra = got.filter(id => SLICE2_OPEN.indexOf(id) === -1);
    check(same && complete, "16a the harness through relay-product, relay/test/attacks.mjs: " + ok + " ok, " + bad
      + " failed, exit " + r.status
      + (same && SLICE2_OPEN.length ? ", open " + SLICE2_OPEN.join(" ") : "")
      + (missing.length ? ", missing " + missing.join(" ") : "")
      + (extra.length ? ", extra " + extra.join(" ") : "")
      + (listedOk.length ? ", listed-but-ok " + listedOk.join(" ") : ""));
  }
}

try { await main(); }
catch (e) { check(false, "harness: " + (e && e.stack ? e.stack : e)); }
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
/* CAPPED AT 63, as every driver here: an exit code is read modulo 256. */
process.exit(Math.min(failed, 63));
