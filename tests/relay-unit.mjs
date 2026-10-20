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
const EXPECTED = 198;

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

let W = null, C = null, B = null, S = null, K = null, WORKER = null;

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
  /* `opts.worker` and `opts.env` stand in for the default Worker and the relay's env: a leg that lifts a line of the Worker, or counts
     the object lookups, passes its own. */
  const res = await (opts.worker || W).fetch(new Request((opts.scheme || "https") + "://relay.test" + p, init), opts.env || R.env);
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

/* The relay's env with the test root its team objects accept a grant under, and a create's body carrying a grant of that root. */
const relayEnv = o => S.relayEnv(Object.assign({ roots: K.ROOTS }, o || {}));
const createBody = (rt, lead, t, o) => K.createBody(rt, lead, t, bytes => signHex(lead, bytes), o);

/* A team with its lead, and two desks enrolled: `desk` by its branch id, `other` by its public key. */
async function world(opts) {
  const R = (opts && opts.R) || relayEnv(opts);
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
  return call(w.R, "POST", "/relay/v1/teams", { json: createBody(w.rt, lead, t, { extra }) });
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
    K = require(path.join(ROOT, "relay", "test", "grant-kit.cjs"));
    WORKER = await import(pathToFileURL(path.join(ROOT, "relay", "worker.mjs")).href);
    W = WORKER.routeWith(K.ROOTS, env => env.NOW());
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
      && Object.keys(team).sort().join() === "epoch,lead,paid,rt,until",
      "2a a lead makes its team, and the object keeps its id, the lead's key, the epoch floor and the grant's until and paid only");
    const v = { R: relayEnv(), rt: hex(16), lead: keyPair(false) };
    const marker = "TeamName" + hex(4);
    const named = await create(v, v.lead, 0, { name: marker, teamId: marker });
    check(named.status === 200 && named.json.rt === v.rt && dumpText(v).indexOf(marker) < 0 && text.indexOf("TeamName") < 0,
      "2b a name or a team id sent beside the create is never kept");
    const x = { R: relayEnv(), rt: hex(16), lead: keyPair(false) };
    const forged = await call(x.R, "POST", "/relay/v1/teams", { json: K.createBody(x.rt, x.lead, 0, bytes => signHex(keyPair(false), bytes)) });
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
    const askBlob = sealAsk(asker, 1);
    const askUp = await put(w, rs, askBlob, { extra: { pub: asker.pub } });
    const askSecond = await put(w, rs, sealAsk(asker, 2), { extra: { pub: asker.pub } });
    const afterUp = await helloAs(w, asker);
    const afterToken = afterUp.json && afterUp.json.session;
    const listed = await since(w, afterToken);
    const fetched = await getBlob(w, afterToken, askBlob.id);
    const heard = await socket(w, afterToken);
    const answer = B.seal({ relayTeamId: w.rt, epoch: 1, teamKey: crypto.randomBytes(32),
      writer: { keyId: w.lead.keyId, privateKey: w.lead.privateKey }, path: "join-answer.json", body: "joined", counter: 1,
      place: null, kind: "file", id: id3 });
    answer.place = "answer:" + id3;
    const posted = await put(w, lead, answer);
    const opened = await getBlob(w, afterToken, id3);
    const leadSees = await getBlob(w, lead, id3);
    const leadList = await since(w, lead);
    const onList = leadList.status === 200 && Array.isArray(leadList.json) && leadList.json.some(e => e.meta && e.meta.id === id3);
    check(refused(byUsurper, "no-hello") && askUp.status === 200 && refused(askSecond, "token-spent")
      && afterUp.status === 200 && afterUp.json.invite === true
      && refused(listed, "not-enrolled") && refused(fetched, "not-enrolled") && refused(heard, "not-enrolled")
      && posted.status === 200 && opened.status === 200 && opened.meta && opened.meta.place === "answer:" + id3
      && refused(leadSees, "missing") && leadList.status === 200 && !onList,
      "10g the session a bound key opens again makes the invitation's one upload, by that key alone, and once it is made that key"
      + " reads only the answer and a second upload is refused: another writer " + (byUsurper.json && byUsurper.json.error) + ", a second upload "
      + (askSecond.json && askSecond.json.error) + ", the key's hello after " + afterUp.status + ", the list " + listed.status
      + ", the join fetch " + fetched.status + ", the answer " + (opened.status) + (opened.json && opened.json.error ? " " + opened.json.error : ""));
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

  /* A key removed earlier uploads one join through an invitation registered after the removal, and nothing else.
     An invitation registered before the removal still refuses that upload. */
  async function boundHello(w, who, id, token) {
    const n = await challenge(w);
    return call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: { challenge: n, invite: token, inv: id,
      key: who.keyId, pub: who.pub, sig: signHex(who, C.helloBytes(w.rt, n, who.keyId)) } });
  }
  function sealJoin(w, who, counter, place) {
    return B.seal({ relayTeamId: w.rt, epoch: 1, teamKey: crypto.randomBytes(32),
      writer: { keyId: who.keyId, privateKey: who.privateKey }, path: "desks/" + place.slice(5) + "/join.json",
      body: "ask " + counter, counter, place, kind: "file" });
  }
  async function removedThen(after) {
    const w = await world();
    const token = hex(32), id = hex(16);
    if (!after) {
      await invites(w, [{ id, hash: sha(token) }], []);
      const hello = await boundHello(w, w.desk, id, token);
      await devices(w, w.devs.slice(1));
      return { w, hello, id };
    }
    await devices(w, w.devs.slice(1));
    w.R.clock.now += 1;
    await invites(w, [{ id, hash: sha(token) }], []);
    const hello = await boundHello(w, w.desk, id, token);
    return { w, hello, id };
  }
  /* What a lifted copy of relay/core.cjs hands the first exports object, which the team's module and the Worker keep: the object's
     factory and the three functions the Worker and the grant legs call, so a line lifted from any of them is lifted for all. */
  const ADOPTED = ["createCore", "judgeCreate", "grantWhy", "grantOk", "grantBytes", "delegationBytes", "create2Bytes", "ROOT_PUB"];
  const adopt = (live, fresh) => { for (const k of ADOPTED) live[k] = fresh[k]; };
  /* As liftCore, with a text swapped in place of a whole line lifted: for a guard that is part of a line. */
  async function swapCore(from, to, fn) {
    const src = path.join(ROOT, "relay", "core.cjs");
    const resolved = require.resolve(src);
    if (!heldCore) heldCore = require(resolved);
    const liveExports = heldCore;
    const beforeBytes = fs.readFileSync(src);
    const digest = sha(beforeBytes);
    let turned = false, detail = "swap text absent";
    try {
      const text = beforeBytes.toString("utf8");
      if (text.split(from).length === 2) {
        fs.writeFileSync(src, text.split(from).join(to));
        delete require.cache[resolved];
        adopt(liveExports, require(resolved));
        turned = await fn();
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) {
      detail = e && e.stack ? e.stack : String(e);
    } finally {
      fs.writeFileSync(src, beforeBytes);
      try {
        delete require.cache[resolved];
        adopt(liveExports, require(resolved));
      } catch { /* the next world loads the restored file */ }
    }
    return { turned, back: sha(fs.readFileSync(src)) === digest, detail };
  }
  /* The team's module keeps the first exports object. A later require, after the cache is cleared, is a new
     object, so every lift patches the first. */
  let heldCore = null;
  async function liftCore(tag, fn) {
    const src = path.join(ROOT, "relay", "core.cjs");
    const resolved = require.resolve(src);
    if (!heldCore) heldCore = require(resolved);
    const liveExports = heldCore;
    const beforeBytes = fs.readFileSync(src);
    const digest = sha(beforeBytes);
    let turned = false, detail = "plant line absent";
    try {
      const lines = beforeBytes.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf(tag) >= 0);
      if (at >= 0) {
        lines.splice(at, 1);
        fs.writeFileSync(src, lines.join("\n"));
        delete require.cache[resolved];
        adopt(liveExports, require(resolved));
        turned = await fn();
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) {
      detail = e && e.stack ? e.stack : String(e);
    } finally {
      fs.writeFileSync(src, beforeBytes);
      try {
        delete require.cache[resolved];
        adopt(liveExports, require(resolved));
      } catch { /* the next world loads the restored file */ }
    }
    return { turned, back: sha(fs.readFileSync(src)) === digest, detail };
  }
  /* R's env with every object lookup the Worker makes counted: gets.n is the number of teams.get calls. */
  function counted(R) {
    const gets = { n: 0 };
    const env = Object.assign({}, R.env, { TEAMS: { jurisdiction(j) {
      const s = R.env.TEAMS.jurisdiction(j);
      return s && { idFromName: n => s.idFromName(n), get: id => { gets.n++; return s.get(id); } };
    } } });
    return { env, gets };
  }
  /* A request through a Worker, with the object lookups it made counted. */
  async function countedCall(worker, R, method, p, o) {
    const c = counted(R);
    const r = await call(R, method, p, Object.assign({}, o, { worker, env: c.env }));
    return { r, gets: c.gets.n };
  }
  const viaWorker = (worker, R, body) => countedCall(worker, R, "POST", "/relay/v1/teams", { json: body });
  /* As liftCore for relay/worker.mjs, a module evaluated once per address: the edited file is imported under a query of its own and
     `fn` is handed that module, so the Worker the legs hold is untouched. `edit` maps the file's text to the edited text, or to null
     where what it means to change is absent; `lineLifted(tag)` is the edit that lifts the line carrying a plant tag. */
  let editedWorkers = 0;
  const lineLifted = tag => text => {
    const lines = text.split(/\n/);
    const at = lines.findIndex(l => l.indexOf(tag) >= 0);
    if (at < 0) return null;
    lines.splice(at, 1);
    return lines.join("\n");
  };
  async function editWorker(edit, fn) {
    const src = path.join(ROOT, "relay", "worker.mjs");
    const beforeBytes = fs.readFileSync(src);
    const digest = sha(beforeBytes);
    let turned = false, detail = "plant line absent";
    try {
      const edited = edit(beforeBytes.toString("utf8"));
      if (edited !== null) {
        fs.writeFileSync(src, edited);
        const mod = await import(pathToFileURL(src).href + "?edited=" + (++editedWorkers));
        turned = await fn(mod);
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) {
      detail = e && e.stack ? e.stack : String(e);
    } finally {
      fs.writeFileSync(src, beforeBytes);
    }
    return { turned, back: sha(fs.readFileSync(src)) === digest, detail };
  }
  {
    const x = await removedThen(true);
    const session = x.hello.json && x.hello.json.session;
    const resumed = await helloAs(x.w, x.w.desk);
    const quiet = await since(x.w, resumed.json && resumed.json.session);
    const blob = sealJoin(x.w, x.w.desk, 1, "desk:" + x.w.deskId);
    const rs = resumed.json && resumed.json.session;
    const up = await put(x.w, rs, blob, { extra: { pub: x.w.desk.pub } });
    const fetched = await getBlob(x.w, rs, blob.id);
    const sock = await socket(x.w, rs);
    const second = await put(x.w, rs, sealJoin(x.w, x.w.desk, 2, "desk:" + x.w.deskId), { extra: { pub: x.w.desk.pub } });
    /* Since board 922 the key's hello after the upload reopens the invitation's session, for the lead's answer alone: it is no
       key session, and it reads nothing of the team. */
    const later = await helloAs(x.w, x.w.desk);
    const laterSession = later.json && later.json.session;
    const laterList = laterSession ? await since(x.w, laterSession) : null;
    const said = r => (r && r.json && r.json.error) || (r && r.status);
    check(x.hello.status === 200 && x.hello.json.invite === true && resumed.status === 200 && resumed.json.invite === true
      && up.status === 200 && refused(quiet, "removed") && refused(fetched, "removed") && refused(sock, "removed")
      && refused(second, "token-spent") && later.status === 200 && later.json.invite === true && refused(laterList, "removed"),
      "962a a key removed earlier uploads one join through an invitation registered after its removal, and neither reads, nor uploads"
      + " again, nor opens a key session after: token " + said(x.hello) + ", resume " + said(resumed) + ", upload " + said(up)
      + ", list " + said(quiet) + ", fetch " + said(fetched) + ", socket " + said(sock) + ", second " + said(second)
      + ", key after " + said(later) + (later.json && later.json.invite === true ? " (the invitation's session)" : "") + ", its list " + said(laterList) + ", first session " + (session ? "open" : "none"));
    const early = await removedThen(false);
    const earlyBlob = sealJoin(early.w, early.w.desk, 1, "desk:" + early.w.deskId);
    const earlyUp = await put(early.w, early.hello.json && early.hello.json.session, earlyBlob, { extra: { pub: early.w.desk.pub } });
    check(early.hello.status === 200 && refused(earlyUp, "removed"),
      "962b the same key presenting an invitation registered before its removal is refused: upload " + said(earlyUp));
    /* Two guards stand on this upload since 962m: the removal marks the bound session removed, and the upload's own check
       refuses an invitation registered before the removal. Either alone holds, so both are lifted here. */
    const planted = await liftCore("plant:invite-removed", async () => {
      const inner = await liftCore("plant:withdraw-invite-sessions", async () => {
        const y = await removedThen(false);
        const place = "desk:k-" + hex(8);
        const yBlob = sealJoin(y.w, y.w.desk, 1, place);
        const yUp = await put(y.w, y.hello.json && y.hello.json.session, yBlob, { extra: { pub: y.w.desk.pub } });
        return y.hello.status === 200 && yUp.status === 200;
      });
      return inner.turned && inner.back;
    });
    check(planted.turned && planted.back, "962c lifting plant:invite-removed with plant:withdraw-invite-sessions accepts that earlier invitation's upload, and the file is put back: "
      + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
    const quietPlant = await liftCore("plant:rejoin-quiet", async () => {
      const y = await removedThen(true);
      const listed = await since(y.w, y.hello.json && y.hello.json.session);
      return y.hello.status === 200 && listed.status === 200;
    });
    check(quietPlant.turned && quietPlant.back, "962d lifting plant:rejoin-quiet lets that session list, and the file is put back: "
      + quietPlant.detail + ", sha " + (quietPlant.back ? "restored" : "differs"));

    /* A key removed after an invitation was registered, the token not yet used: its bound token hello is answered
       removed and spends nothing (edit 2 of the read of ae3b1c5). */
    const unusedFirst = async () => {
      const y = await world();
      const token = hex(32), id = hex(16);
      await invites(y, [{ id, hash: sha(token) }], []);
      y.R.clock.now += 1;
      await devices(y, y.devs.slice(1));
      const hello = await boundHello(y, y.desk, id, token);
      const inv = y.R.stores.get(y.rt).get("inv:" + id);
      return { hello, spent: !!(inv && inv.spent) };
    };
    const unused = await unusedFirst();
    check(refused(unused.hello, "removed") && !unused.spent,
      "962e a removed key's bound token hello on an invitation registered before the removal is answered removed, the token unspent: "
      + said(unused.hello) + ", spent " + unused.spent);
    const unusedPlant = await liftCore("plant:token-removed", async () => {
      const y = await unusedFirst();
      return y.hello.status === 200 || y.spent;
    });
    check(unusedPlant.turned && unusedPlant.back, "962f lifting plant:token-removed opens that hello or spends its token, and the file is put back: "
      + unusedPlant.detail + ", sha " + (unusedPlant.back ? "restored" : "differs"));

    /* A key removed while holding a bound, unuploaded invitation registered before the removal: its key hello is answered
       removed, never the invitation's session again (edit 3). */
    const heldFirst = async () => {
      const y = await removedThen(false);
      return helloAs(y.w, y.w.desk);
    };
    const heldHello = await heldFirst();
    check(refused(heldHello, "removed"),
      "962g a removed key holding a bound invitation registered before its removal is answered removed on a key hello: " + said(heldHello));
    const heldPlant = await swapCore("registeredAfter(held.inv, gone) && ", "", async () => {
      const r = await heldFirst();
      return r.status === 200 && !!r.json && r.json.invite === true;
    });
    check(heldPlant.turned && heldPlant.back, "962h dropping registeredAfter from the removed key's resume reopens that invitation's session, and the file is put back: "
      + heldPlant.detail + ", sha " + (heldPlant.back ? "restored" : "differs"));

    /* The two moments are ordered by the relay's own counter, not its clock (edit 4): a clock stepping back between a
       registration and a removal changes neither answer. */
    const stepBack = async before => {
      const y = await world();
      const token = hex(32), id = hex(16);
      if (before) {
        await invites(y, [{ id, hash: sha(token) }], []);
        y.R.clock.now -= MIN;
        await devices(y, y.devs.slice(1));
      } else {
        await devices(y, y.devs.slice(1));
        y.R.clock.now -= MIN;
        await invites(y, [{ id, hash: sha(token) }], []);
      }
      const hello = await boundHello(y, y.desk, id, token);
      const s = hello.json && hello.json.session;
      const up = s ? await put(y, s, sealJoin(y, y.desk, 1, "desk:" + y.deskId), { extra: { pub: y.desk.pub } }) : null;
      const inv = y.R.stores.get(y.rt).get("inv:" + id);
      return { hello, up, spent: !!(inv && inv.spent) };
    };
    const early2 = await stepBack(true);
    check(refused(early2.hello, "removed") && !early2.spent,
      "962i with the relay's clock stepped back a minute between an invitation and a removal, the removed key's token hello is answered removed, the token unspent: "
      + said(early2.hello) + ", spent " + early2.spent);
    const late2 = await stepBack(false);
    check(late2.hello.status === 200 && late2.hello.json.invite === true && !!late2.up && late2.up.status === 200,
      "962j with the clock stepped back a minute between a removal and a later invitation, that invitation opens and takes the one join: hello "
      + said(late2.hello) + ", upload " + said(late2.up));
    const clockPlant = await swapCore("Number.isSafeInteger(inv.ord) && Number.isSafeInteger(gone.ord) && inv.ord > gone.ord",
      "Number.isSafeInteger(inv.at) && Number.isSafeInteger(gone.at) && inv.at > gone.at", async () => {
        const r = await stepBack(true);
        return r.hello.status === 200 || r.spent;
      });
    check(clockPlant.turned && clockPlant.back, "962k ordering by the clock again opens that earlier invitation to the removed key, and the file is put back: "
      + clockPlant.detail + ", sha " + (clockPlant.back ? "restored" : "differs"));
    const gonePlant = await liftCore("plant:order-gone", async () => {
      const r = await stepBack(false);
      return refused(r.hello, "removed");
    });
    check(gonePlant.turned && gonePlant.back, "962l lifting plant:order-gone leaves a later invitation unordered after the removal, so it is refused, and the file is put back: "
      + gonePlant.detail + ", sha " + (gonePlant.back ? "restored" : "differs"));

    /* A desk enrolled as D binds an invitation's session, and the lead then withdraws D: that session reads nothing more,
       since, a blob and the socket each refused removed, as D's own hello is (Claude alpha's edit to 918, 2026-10-20). */
    const boundThenGone = async () => {
      const y = await world();
      const token = hex(32), id = hex(16);
      await invites(y, [{ id, hash: sha(token) }], []);
      const hello = await boundHello(y, y.desk, id, token);
      const s = hello.json && hello.json.session;
      const before = await since(y, s);
      await devices(y, y.devs.slice(1));
      return { hello, before, list: await since(y, s), fetched: await getBlob(y, s, hex(16)), sock: await socket(y, s),
        again: await helloAs(y, y.desk) };
    };
    const cut = await boundThenGone();
    check(cut.hello.status === 200 && cut.before.status === 200 && refused(cut.list, "removed") && refused(cut.fetched, "removed")
      && refused(cut.sock, "removed") && refused(cut.again, "removed"),
      "962m an invitation's session bound to a key the lead then withdraws reads nothing: list " + said(cut.list) + ", fetch "
      + said(cut.fetched) + ", socket " + said(cut.sock) + ", the key's own hello " + said(cut.again) + " (before the removal, list "
      + said(cut.before) + ")");
    const cutPlant = await liftCore("plant:withdraw-invite-sessions", async () => {
      const r = await boundThenGone();
      return r.list.status === 200;
    });
    check(cutPlant.turned && cutPlant.back, "962n lifting plant:withdraw-invite-sessions lets that session list again, and the file is put back: "
      + cutPlant.detail + ", sha " + (cutPlant.back ? "restored" : "differs"));
  }

  /* ---- 963: the code that runs on Cloudflare: sqlStore over real SQLite, RelayTeam's constructor, hibernating sockets ----
     Board 934 (5). relay/test/stand-ins.cjs runs teamObject over a memory store; here RelayTeam (relay/team.cjs) is built over
     relay/test/do-ctx.cjs, whose ctx.storage.sql is node:sqlite, so sqlStore's own SQL, its bounds and limit, runs as written.
     The store under test is the one RelayTeam's constructor hands the core, taken as it passes. */
  {
    const X = require(path.join(ROOT, "relay", "test", "do-ctx.cjs"));
    const TEAM_SRC = path.join(ROOT, "relay", "team.cjs");
    const CORE_SRC = path.join(ROOT, "relay", "core.cjs");
    const FFFF = String.fromCharCode(0xffff);
    const pad16 = n => String(n).padStart(16, "0");
    const idN = n => n.toString(16).padStart(32, "0");
    const keysOf = rows => rows.map(([k]) => k);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const T0 = require(TEAM_SRC);

    /* RelayTeam over a ctx, and the store it gave the core: createCore is wrapped on every copy of the core module the
       team module might hold, for the length of the constructor. The wrapper also hands the core the test root (`roots`, the one
       seam a leg has: RelayTeam's constructor passes none, so a team made in production is made under the vendor's root alone). */
    function raise(T, ctx, env) {
      const cores = [...new Set([C, require(CORE_SRC)])], reals = cores.map(c => c.createCore);
      let store = null;
      cores.forEach((c, i) => { c.createCore = deps => { store = deps.store; return reals[i](Object.assign({}, deps, { roots: K.ROOTS })); }; });
      try {
        const team = new T.RelayTeam(ctx, env);
        if (!store) throw new Error("the store RelayTeam built was not seen");
        return { team, store, ctx };
      } finally { cores.forEach((c, i) => { c.createCore = reals[i]; }); }
    }
    const sqlStoreOf = T => raise(T, X.doCtx(), { BLOBS: S.memoryBucket() }).store;

    /* The Worker's env with each team's object a RelayTeam over a ctx of its own, as the namespace makes them. */
    function sqlRelay(T) {
      const env = { BLOBS: S.memoryBucket(), NOW: () => Date.now() }, teams = new Map(), clock = { now: Date.now() };
      const scoped = {
        idFromName(name) { return { name: String(name) }; },
        get(id) {
          return { fetch: request => {
            if (!teams.has(id.name)) teams.set(id.name, raise(T, X.doCtx(), env));
            return teams.get(id.name).team.fetch(request);
          } };
        },
      };
      env.TEAMS = { jurisdiction(j) { return j === "eu" ? scoped : null; } };
      return { env, clock, teams, bucket: env.BLOBS };
    }
    const memoryRelay = () => { const R = relayEnv(); R.clock.now = Date.now(); return R; };

    /* ---- the store's own legs, run over the memory store and over sqlStore ---- */
    function listProbe(store) {
      for (const k of ["ab:1", "ab:2", "ab:3", "ab:", "ab", "ab9", "ab;", "aa:9", "ac:0", "a"]) store.put(k, { k, n: k.length });
      const out = {};
      out.prefix = keysOf(store.list("ab:"));
      out.wide = keysOf(store.list("ab"));
      out.value = store.list("ab:").map(([, v]) => v)[1];
      out.after = [keysOf(store.list("ab:", { after: "ab:2" })), keysOf(store.list("ab:", { after: "ab:3" })), keysOf(store.list("ab:", { after: "ab:0" }))];
      out.limit = [keysOf(store.list("ab:", { limit: 2 })), keysOf(store.list("ab:", { after: "ab:1", limit: 1 })), keysOf(store.list("ab:", { limit: 10 }))];
      for (let i = 1; i <= 25; i++) store.put("seq:" + pad16(i), idN(i));
      let after = "seq:" + pad16(0);
      const pages = [];
      for (let n = 0; n < 10; n++) {
        const page = store.list("seq:", { after, limit: 7 });
        if (!page.length) break;
        pages.push(page.map(([, v]) => v));
        after = page[page.length - 1][0];
      }
      out.walk = { sizes: pages.map(p => p.length), flat: [].concat(...pages) };
      return out;
    }
    const WANT = {
      prefix: ["ab:1", "ab:2", "ab:3"], wide: ["ab9", "ab:", "ab:1", "ab:2", "ab:3", "ab;"], value: { k: "ab:2", n: 4 },
      after: [["ab:3"], [], ["ab:1", "ab:2", "ab:3"]],
      limit: [["ab:1", "ab:2"], ["ab:2"], ["ab:1", "ab:2", "ab:3"]],
      walk: { sizes: [7, 7, 7, 4], flat: Array.from({ length: 25 }, (_, i) => idN(i + 1)) },
    };
    function kvProbe(store) {
      store.put("k1", { a: 1 });
      store.put("k1", { a: 2, s: "caf\u00e9 \"quoted\"" });
      const out = { over: store.get("k1"), absent: store.get("nope") === undefined };
      store.put("k2", [1, 2]);
      store.del("k2");
      store.del("never");
      out.deleted = store.get("k2") === undefined;
      out.keys = keysOf(store.list("k"));
      return out;
    }
    const WANT_KV = { over: { a: 2, s: "caf\u00e9 \"quoted\"" }, absent: true, deleted: true, keys: ["k1"] };
    function atomicProbe(store) {
      const out = {};
      out.value = store.atomic(() => { store.put("t1", 1); return "done"; });
      try { store.atomic(() => { store.put("t2", 1); store.put("t1", 99); throw new Error("stop"); }); out.threw = false; }
      catch (e) { out.threw = e.message; }
      out.t1 = store.get("t1");
      out.t2 = store.get("t2") === undefined;
      return out;
    }
    const WANT_ATOMIC = { value: "done", threw: "stop", t1: 1, t2: true };

    const memList = listProbe(S.memoryStore()), memKv = kvProbe(S.memoryStore()), memAtomic = atomicProbe(S.memoryStore());
    const sqlList = T => listProbe(sqlStoreOf(T)), sqlKv = T => kvProbe(sqlStoreOf(T)), sqlAtomic = T => atomicProbe(sqlStoreOf(T));

    const sl = sqlList(T0);
    const okA = (m, s) => same(m.prefix, WANT.prefix) && same(s.prefix, WANT.prefix) && same(m.wide, WANT.wide) && same(s.wide, WANT.wide)
      && same(m.value, WANT.value) && same(s.value, WANT.value);
    const okB = (m, s) => same(m.after, WANT.after) && same(s.after, WANT.after);
    const okC = (m, s) => same(m.limit, WANT.limit) && same(s.limit, WANT.limit);
    const okD = (m, s) => same(m.walk, WANT.walk) && same(s.walk, WANT.walk);
    check(okA(memList, sl),
      "963a list over sqlStore on real SQLite bounds its keys by the prefix as the memory store does: a key just outside it, below or above,"
      + " the prefix itself and a longer neighbour are not returned: " + JSON.stringify(sl.prefix) + ", wider prefix " + JSON.stringify(sl.wide));
    check(okB(memList, sl),
      "963b list's after resumes strictly after the key given, over sqlStore as over memory: after the middle key, after the last, and before the first: "
      + JSON.stringify(sl.after));
    check(okC(memList, sl),
      "963c list's limit cuts at the count, alone and with an after, over sqlStore as over memory: " + JSON.stringify(sl.limit));
    check(okD(memList, sl),
      "963d paging seq keys by after and a limit of 7 over sqlStore reads 25 rows as pages of " + sl.walk.sizes.join("+")
      + ", missing none, repeating none, in order, as the memory store does");
    const sk = sqlKv(T0);
    check(same(memKv, WANT_KV) && same(sk, WANT_KV),
      "963e sqlStore's put overwrites a key and keeps its JSON exactly, an absent key reads undefined and a deleted one is gone, as in memory: "
      + JSON.stringify(sk));
    const sa = sqlAtomic(T0);
    check(same(memAtomic, WANT_ATOMIC) && same(sa, WANT_ATOMIC),
      "963f sqlStore's atomic returns its function's value, and when the function throws it rolls every write back and rethrows, as in memory: "
      + JSON.stringify(sa));

    /* ---- the core's paths that read through list, over RelayTeam on real SQLite and over the memory object ---- */
    async function trace(w) {
      const out = {}, tail = r => r.json && r.json.error ? r.json.error : r.status;
      const ids = [4, 2, 5, 1, 3].map(idN), toks = {};
      for (const id of ids) toks[id] = hex(32);
      const added = await invites(w, ids.map(id => ({ id, hash: sha(toks[id]) })), []);
      const h2 = await tokenHello(w, idN(2), toks[idN(2)]), h4 = await tokenHello(w, idN(4), toks[idN(4)]);
      const lead = await sessionOf(w, w.lead), deskS = await sessionOf(w, w.desk);
      const states = async () => (await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/states", { token: lead })).json.states;
      const last = id => id.slice(-1);
      const before = await states();
      out.added = [added.status, h2.status, h4.status];
      out.states = before.map(s => last(s.id) + ":" + s.state);
      out.usedAt = before.filter(s => s.state === "used").map(s => typeof s.usedAt);
      const dropped = await invites(w, [], [idN(1), idN(2)]);
      out.dropped = [dropped.status, dropped.json.dropped.map(last), dropped.json.used.map(last)];
      const wrap = token => call(w.R, "GET", "/relay/v1/t/" + w.rt + "/wrap", { token });
      out.wraps = [tail(await wrap(h2.json.session)), tail(await wrap(h4.json.session))];
      out.states2 = (await states()).map(s => last(s.id) + ":" + s.state);
      const read = await since(w, deskS, 0);
      const gone = await devices(w, w.devs.slice(1));
      out.desk = [read.status, gone.status, tail(await since(w, deskS, 0))];
      for (let i = 1; i <= 3; i++) await put(w, lead, sealAs(w, w.lead, "guide" + i + ".ec", i));
      out.since = [];
      for (const n of [0, 1, 3]) out.since.push((await since(w, lead, n)).json.map(x => x.seq));
      return out;
    }
    const WANT_TRACE = {
      added: [200, 200, 200], states: ["1:unused", "2:used", "3:unused", "4:used", "5:unused"], usedAt: ["number", "number"],
      dropped: [200, ["1", "2"], ["2"]], wraps: ["no-hello", "missing"], states2: ["2:used", "3:unused", "4:used", "5:unused"],
      desk: [200, 200, "removed"], since: [[1, 2, 3], [2, 3], []],
    };
    async function pruneProbe(w, store, at) {
      const A = idN(0xa), B = idN(0xb), Cc = idN(0xc), D = idN(0xd), E = idN(0xe);
      const tomb = (id, t) => { store.put("kx:" + pad16(t) + ":" + id, "tomb"); store.put("tomb:" + id, { writer: "k-x", why: "superseded", until: t }); };
      tomb(Cc, at + 24 * 60 * 60 * 1000);
      tomb(A, at - 5000);
      tomb(B, at - 9000);
      const spent = (id, when) => store.put("inv:" + id, { hash: sha(id), fails: 0, spent: true, spentAt: when, uploaded: false, at: when, key: "k-x" });
      spent(D, at - C.KEEP_MS - 1000);
      spent(E, at - 1000);
      store.put("orphan:objects/x", 1);
      const lead = await sessionOf(w, w.lead);
      const r = await since(w, lead, 0);
      return { status: r.status, kx: store.list("kx:").map(([k]) => k.slice(20)), tombs: [A, B, Cc].map(id => store.get("tomb:" + id) !== undefined),
        spentOld: store.get("inv:" + D), spentNew: (store.get("inv:" + E) || {}).hash === sha(E), orphan: store.get("orphan:objects/x") === undefined,
        team: store.get("team") !== undefined };
    }
    const wantPrune = { status: 200, kx: [idN(0xc)], tombs: [false, false, true], spentOld: { spent: true }, spentNew: true, orphan: true, team: true };
    const traceSql = async T => trace(await world({ R: sqlRelay(T) }));
    const pruneSql = async T => { const R = sqlRelay(T), w = await world({ R }); return pruneProbe(w, R.teams.get(w.rt).store, Date.now()); };
    const traceMem = await trace(await world({ R: memoryRelay() }));
    const traceReal = await traceSql(T0);
    check(same(traceMem, WANT_TRACE) && same(traceReal, WANT_TRACE),
      "963g the invitation scans, the states, a withdrawal's sweep of sessions and since read through list over RelayTeam on real SQLite as over memory,"
      + " in key order: " + JSON.stringify(traceReal));
    const wm = await world({ R: memoryRelay() });
    const pm = await pruneProbe(wm, wm.R.stores.get(wm.rt), wm.R.clock.now), ps = await pruneSql(T0);
    check(same(pm, wantPrune) && same(ps, wantPrune),
      "963h prune, reading deletion records, spent invitations and orphans through list, drops the expired and keeps the rest and the team over RelayTeam on"
      + " real SQLite as over memory: " + JSON.stringify(ps));

    /* A since page across more rows than one: seeded to 1002 rows through the store, then one real upload as the 1003rd. */
    async function sincePages(T) {
      const R = sqlRelay(T), w = await world({ R }), store = R.teams.get(w.rt).store;
      store.atomic(() => {
        for (let i = 1; i <= 1002; i++) {
          const id = idN(0x100 + i);
          store.put("blob:" + id, { id, supersedes: null, epoch: 1, writer: w.lead.keyId, counter: i, del: false, size: 10, sig: "00", nonce: "00", seq: i, at: Date.now(), obj: "o/" + id });
          store.put("seq:" + pad16(i), id);
        }
        store.put("seq", 1002);
      });
      const lead = await sessionOf(w, w.lead);
      const first = (await since(w, lead, 0)).json.map(x => x.seq);
      const second = (await since(w, lead, 1000)).json.map(x => x.seq);
      const up = await put(w, lead, sealAs(w, w.lead, "guide.ec", 1));
      const third = (await since(w, lead, 1000)).json.map(x => x.seq);
      const walk = [];
      for (let after = 0, n = 0; n < 6; n++) {
        const page = (await since(w, lead, after)).json.map(x => x.seq);
        if (!page.length) break;
        walk.push(...page);
        after = page[page.length - 1];
      }
      return { first: [first.length, first[0], first[first.length - 1]], second, up: up.status, third,
        walk: [walk.length, walk.every((s, i) => s === i + 1)] };
    }
    const WANT_PAGES = { first: [1000, 1, 1000], second: [1001, 1002], up: 200, third: [1001, 1002, 1003], walk: [1003, true] };
    const pagesReal = await sincePages(T0);
    check(same(pagesReal, WANT_PAGES),
      "963i a since page over RelayTeam on real SQLite holds 1000 rows and the next resumes after the last, over 1003 rows, missing none: "
      + JSON.stringify(pagesReal));

    /* The constructor: a create and a since answered through fetch, and the same storage woken by a second construction. */
    const ask = async (team, method, p, o) => {
      const opts = o || {};
      const res = await team.fetch(new Request("https://relay.test" + p, { method, headers: opts.token ? { authorization: "Bearer " + opts.token } : {},
        body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined }));
      return { status: res.status, json: JSON.parse(await res.text()) };
    };
    async function bareTeam(T) {
      const ctx = X.doCtx(), env = { BLOBS: S.memoryBucket() }, { team } = raise(T, ctx, env);
      const rt = hex(16), lead = keyPair(false), t = Date.now(), base = "/relay/v1/t/" + rt;
      const made = await ask(team, "POST", "/relay/v1/teams", { json: createBody(rt, lead, t) });
      const n = (await ask(team, "POST", base + "/hello", { json: {} })).json.challenge;
      const ses = await ask(team, "POST", base + "/session", { json: { challenge: n, key: lead.keyId, sig: signHex(lead, C.helloBytes(rt, n, lead.keyId)) } });
      const token = ses.json.session;
      const none = await ask(team, "GET", base + "/since/0"), list = await ask(team, "GET", base + "/since/0", { token });
      const woken = raise(T, ctx, env).team;
      const again = await ask(woken, "GET", base + "/since/0", { token });
      const row = ctx.db.prepare("SELECT v FROM kv WHERE k = 'team'").all();
      return { made: [made.status, made.json.rt === rt], session: ses.status, none: [none.status, none.json.error], list: [list.status, list.json],
        again: [again.status, again.json], rows: row.length, lead: row.length === 1 && JSON.parse(row[0].v).lead.keyId === lead.keyId,
        tables: ctx.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name) };
    }
    const WANT_BARE = { made: [200, true], session: 200, none: [401, "no-hello"], list: [200, []], again: [200, []], rows: 1, lead: true, tables: ["kv"] };
    const bare = await bareTeam(T0);
    check(same(bare, WANT_BARE),
      "963j new RelayTeam(ctx, env) over real SQLite answers a create and a since through fetch, keeps the team in its kv table, and a second"
      + " construction over the same storage answers the same session: " + JSON.stringify(bare));

    /* Hibernating: the socket accepted onto the ctx with its attachment kept, announced to, and woken by a later construction. */
    async function hibernated(T) {
      const realResponse = globalThis.Response, hadPair = "WebSocketPair" in globalThis;
      const out = await X.withWorkersGlobals(async () => {
        const R = sqlRelay(T), w = await world({ R });
        const lead = await sessionOf(w, w.lead), desk = await sessionOf(w, w.desk), held = R.teams.get(w.rt), ctx = held.ctx;
        const res = await held.team.fetch(new Request("https://relay.test/relay/v1/t/" + w.rt + "/socket", { headers: { authorization: "Bearer " + lead, upgrade: "websocket" } }));
        const server = ctx.accepted[0];
        const made = { status: res.status, client: !!res.webSocket && res.webSocket.role === "client", accepted: ctx.accepted.length };
        made.attachment = server ? server.deserializeAttachment() : null;
        held.team = raise(T, ctx, R.env).team;
        if (server) {
          await held.team.webSocketMessage(server, JSON.stringify({ type: "ping" }));
          const up = await put(w, desk, sealAs(w, w.desk, "guide.ec", 1));
          made.upload = up.status;
          made.heard = server.sent.map(m => JSON.parse(m)).map(m => m.type === "new" ? [m.type, m.seq] : [m.type]);
          held.team.webSocketClose(server);
          made.closed = server.closed ? server.closed.code : null;
          made.listed = ctx.getWebSockets().length;
        }
        made.want = { ses: sha(lead), key: w.lead.keyId, inv: null };
        return made;
      });
      out.restored = globalThis.Response === realResponse && ("WebSocketPair" in globalThis) === hadPair;
      return out;
    }
    const sockOk = r => r.status === 101 && r.client && r.accepted === 1 && same(r.attachment, r.want) && same(r.heard, [["pong"], ["new", 1]])
      && r.upload === 200 && r.closed === 1000 && r.listed === 0 && r.restored;
    const hib = await hibernated(T0);
    check(sockOk(hib) && typeof WebSocketPair === "undefined",
      "963k a socket opened on RelayTeam is accepted through hibernating as a 101 with its client end, its attachment kept as the session's hash, key"
      + " and invitation, a construction woken over the same ctx answers its ping, an upload is announced to it, and its close ends its listing;"
      + " the globals stood in for are put back: " + JSON.stringify(hib));

    /* ---- plants: a guarded text of team.cjs swapped, the legs run over the swapped module, the file put back ---- */
    async function swapTeam(from, to, fn) {
      const resolved = require.resolve(TEAM_SRC);
      const beforeBytes = fs.readFileSync(TEAM_SRC);
      const digest = sha(beforeBytes);
      let turned = false, detail = "swap text absent";
      try {
        const text = beforeBytes.toString("utf8");
        if (text.split(from).length === 2) {
          fs.writeFileSync(TEAM_SRC, text.split(from).join(to));
          delete require.cache[resolved];
          turned = await fn(require(resolved));
          detail = turned ? "the checks lifted" : "a check still held";
        }
      } catch (e) {
        detail = e && e.stack ? e.stack : String(e);
      } finally {
        fs.writeFileSync(TEAM_SRC, beforeBytes);
        delete require.cache[resolved];
      }
      return { turned, back: sha(fs.readFileSync(TEAM_SRC)) === digest, detail };
    }
    const safe = async f => { try { return await f(); } catch { return null; } };
    const back = p => p.turned && p.back;
    const how = p => p.detail + ", sha " + (p.back ? "restored" : "differs");

    const pBound = await swapTeam("prefix + \"" + FFFF + "\"", "\"" + FFFF + "\"", async T => !okA(memList, sqlList(T)) && !same(await safe(() => pruneSql(T)), wantPrune)
      && !same(await safe(() => traceSql(T)), WANT_TRACE));
    check(back(pBound),
      "963l lifting the prefix from list's upper bound turns 963a, 963g and 963h red, and the file is put back: " + how(pBound));
    const pAfter = await swapTeam("opts && opts.after ? opts.after : prefix", "prefix", async T => {
      const l = sqlList(T);
      return !okB(memList, l) && !okD(memList, l) && !same(await safe(() => traceSql(T)), WANT_TRACE)
        && !same(await safe(() => sincePages(T)), WANT_PAGES);
    });
    check(back(pAfter),
      "963m lifting list's after turns 963b, 963d, 963g and 963i red, and the file is put back: " + how(pAfter));
    const pLimit = await swapTeam("opts && opts.limit ? opts.limit : -1", "-1", async T => !okC(memList, sqlList(T)) && !same(await safe(() => sincePages(T)), WANT_PAGES));
    check(back(pLimit),
      "963n lifting list's limit turns 963c and 963i red, and the file is put back: " + how(pLimit));
    const pPut = await swapTeam("DO UPDATE SET v = excluded.v", "DO NOTHING", async T => !same(sqlKv(T), WANT_KV));
    check(back(pPut),
      "963o lifting put's overwrite turns 963e red, and the file is put back: " + how(pPut));
    const pAtomic = await swapTeam("atomic(fn) { make(); return storage.transactionSync(fn); }", "atomic(fn) { return fn(); }", async T => !same(sqlAtomic(T), WANT_ATOMIC));
    check(back(pAtomic),
      "963p lifting atomic's transaction turns 963f red, and the file is put back: " + how(pAtomic));
    const pAttach = await swapTeam("pair[1].serializeAttachment(attachment);", "/* lifted */", async T => { const r = await safe(() => hibernated(T)); return !r || !sockOk(r); });
    check(back(pAttach),
      "963q lifting the attachment a hibernating socket keeps turns 963k red, and the file is put back: " + how(pAttach));
    const pAccept = await swapTeam("ctx.acceptWebSocket(pair[1]);", "/* lifted */", async T => { const r = await safe(() => hibernated(T)); return !r || !sockOk(r); });
    check(back(pAccept),
      "963r lifting the accept onto the ctx turns 963k red, and the file is put back: " + how(pAccept));

    /* ---- 968: a team never made costs the relay nothing, and no body is awaited before the team is known (board 934, the test
       architect's conditions 2 and 3), over RelayTeam on real SQLite through the Worker ---- */
    const delay = ms => new Promise(r => setTimeout(r, ms));
    const tablesOf = ctx => ctx.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
    const rowsOf = ctx => (tablesOf(ctx).indexOf("kv") > -1 ? ctx.db.prepare("SELECT k FROM kv").all().map(r => r.k) : []);
    const workerOver = mod => mod.routeWith(K.ROOTS, env => env.NOW());
    const swapped = (from, to) => t => (t.split(from).length === 2 ? t.split(from).join(to) : null);

    /* Every route a stranger can name, each with GET and POST (and the blob route's PUT), for an id nobody made. */
    function strangerCalls(rt) {
      const id = hex(16), tok = hex(32), p = "/relay/v1/t/" + rt;
      const meta = { v: 1, id, supersedes: null, epoch: 1, writer: "k-" + hex(8), counter: 1, del: false, sig: hex(64), nonce: hex(12), place: "root" };
      const out = [];
      for (const route of ["hello", "session", "devices", "invites", "socket", "wrap", "states", "since/0", "b/" + id]) {
        out.push(["GET", p + "/" + route, { token: tok }], ["POST", p + "/" + route, { token: tok, json: {} }]);
      }
      out.push(["PUT", p + "/b/" + id, { token: tok, meta, body: Buffer.alloc(8) }], ["GET", p + "/since/0", {}]);
      return out;
    }
    const neverMade = async T => {
      const R = sqlRelay(T), rt = hex(16), seen = [];
      for (const [method, p, o] of strangerCalls(rt)) { const w = await countedCall(W, R, method, p, o); seen.push(w.r.status); }
      const woken = [...R.teams.values()];
      return { calls: seen.length, bad: seen.filter(s => s < 400 || s >= 500).length, woke: woken.length, tables: [].concat(...woken.map(t => tablesOf(t.ctx))),
        rows: [].concat(...woken.map(t => rowsOf(t.ctx))) };
    };
    const nm = await neverMade(T0);
    const baseNever = nm.calls === 20 && nm.bad === 0 && nm.woke === 1 && nm.tables.length === 0 && nm.rows.length === 0;
    check(baseNever,
      "968a every route a stranger can name, by GET and by POST, for a team id never made is answered 4xx and leaves the object with no kv table and no row: "
      + JSON.stringify(nm));

    /* The table is made by the create, and the rows with it; a read before it leaves none. */
    const created = async T => {
      const R = sqlRelay(T), rt = hex(16), lead = keyPair(false), p = "/relay/v1/t/" + rt;
      await countedCall(W, R, "POST", p + "/hello", { json: {} });
      const held = R.teams.get(rt), before = [tablesOf(held.ctx), rowsOf(held.ctx)];
      const made = await viaWorker(W, R, createBody(rt, lead, Date.now()));
      const after = [tablesOf(held.ctx), rowsOf(held.ctx)];
      const again = await countedCall(W, R, "POST", p + "/hello", { json: {} });
      return { before, made: [made.r.status, made.gets], after, again: again.r.status };
    };
    const WANT_CREATED = { before: [[], []], made: [200, 1], after: [["kv"], ["team"]], again: 200 };
    const cr = await created(T0);
    check(same(cr, WANT_CREATED),
      "968b a read before the create leaves no table, the create makes the kv table and the team row through one object fetch, and the team then answers: " + JSON.stringify(cr));

    /* The store itself: a table that is not there reads as empty and is not made by a read or a delete; the first write makes it. */
    const lazyStore = T => {
      const { store, ctx } = raise(T, X.doCtx(), { BLOBS: S.memoryBucket() });
      const out = {};
      out.get = store.get("team") === undefined;
      out.list = [store.list("ses:").length, store.list("ses:", { after: "ses:5", limit: 3 }).length];
      store.del("team");
      out.untouched = tablesOf(ctx);
      store.put("k1", { a: 1 });
      out.written = [tablesOf(ctx), store.get("k1"), keysOf(store.list("k"))];
      return out;
    };
    const WANT_LAZY = { get: true, list: [0, 0], untouched: [], written: [["kv"], { a: 1 }, ["k1"]] };
    const lz = lazyStore(T0);
    check(same(lz, WANT_LAZY),
      "968c over real SQLite a store with no table reads a key as absent and a list as empty, a delete does nothing, none of them makes the table, and the first put does: "
      + JSON.stringify(lz));

    /* The Worker answers missing for any path or method outside the routes, and wakes no object to do it. */
    function outsideCalls(rt) {
      const p = "/relay/v1/t/" + rt, id = hex(16), methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"], out = [];
      const answers = { hello: ["POST"], session: ["POST"], devices: ["POST"], invites: ["POST"], socket: ["GET"], wrap: ["GET"], states: ["GET"],
        "since/0": ["GET"], ["b/" + id]: ["GET", "PUT"] };
      for (const [route, ok] of Object.entries(answers)) for (const m of methods) if (ok.indexOf(m) < 0) out.push([m, p + "/" + route]);
      for (const m of methods) {
        if (m !== "POST") out.push([m, "/relay/v1/teams"]);
        out.push([m, p + "/nowhere"], [m, p + "/"], [m, p], [m, p + "/hello/extra"], [m, p + "/since/x"], [m, p + "/b/" + id.slice(1)],
          [m, "/relay/v1/t/" + rt.slice(1) + "/hello"], [m, "/relay/v1/t/" + rt.toUpperCase() + "/hello"], [m, "/relay/v1/teams/"],
          [m, "/relay/v1/teams/x"], [m, "/relay/v2/t/" + rt + "/hello"]);
      }
      return out;
    }
    const outside = async (T, worker) => {
      const R = sqlRelay(T), madeRt = "ab" + hex(15), lead = keyPair(false);
      await viaWorker(W, R, createBody(madeRt, lead, Date.now()));
      let wrong = 0, fetched = 0, total = 0;
      for (const rt of [madeRt, "cd" + hex(15)]) {
        for (const [method, p] of outsideCalls(rt)) {
          const w = await countedCall(worker, R, method, p, {});
          total++;
          if (!refused(w.r, "missing")) wrong++;
          fetched += w.gets;
        }
      }
      return { total, wrong, fetched };
    };
    const out0 = await outside(T0, W);
    const baseOutside = out0.total > 100 && out0.wrong === 0 && out0.fetched === 0;
    check(baseOutside,
      "968d a path or a method outside the relay's routes, for a team made and one never made, is answered missing by the Worker with no object fetched: "
      + out0.total + " requests, " + out0.wrong + " not missing, " + out0.fetched + " object fetches");

    /* The Worker reads each POST body to its cap before it wakes the object: a body that never ends costs no object. */
    const stall = () => {
      let ctl;
      const reads = { n: 0 };
      const stream = new ReadableStream({ start(c) { ctl = c; }, pull() { reads.n++; } }, { highWaterMark: 0 });
      return { stream, reads, end() { try { ctl.error(new Error("the client went away")); } catch { /* closed already */ } } };
    };
    const bodyFirst = async (T, worker) => {
      const R = sqlRelay(T), rt = hex(16), lead = keyPair(false), out = {};
      await viaWorker(W, R, createBody(rt, lead, Date.now()));
      for (const route of ["hello", "session", "devices", "invites"]) {
        const c = counted(R), s = stall();
        let settled = false;
        const pending = call(R, "POST", "/relay/v1/t/" + rt + "/" + route, { body: s.stream, worker, env: c.env }).then(r => { settled = true; return r; }, () => { settled = true; return null; });
        await delay(150);
        const during = [c.gets.n, settled];
        s.end();
        const after = await Promise.race([pending, delay(3000).then(() => "hung")]);
        const big = await countedCall(worker, R, "POST", "/relay/v1/t/" + rt + "/" + route, { body: Buffer.alloc(300 * 1024) });
        out[route] = { during, after: after === "hung" ? "hung" : (after ? after.status : "reset"), gets: c.gets.n, big: [refused(big.r, "blob-size"), big.gets] };
      }
      const fine = await countedCall(worker, R, "POST", "/relay/v1/t/" + rt + "/hello", { json: {} });
      out.fine = [fine.r.status, fine.gets];
      return out;
    };
    const WANT_FIRST = { during: [0, false], after: 500, gets: 0, big: [true, 0] };
    const bodyHolds = r => ["hello", "session", "devices", "invites"].every(k => same(r[k], WANT_FIRST)) && same(r.fine, [200, 1]);
    const bf = await bodyFirst(T0, W);
    const baseBody = bodyHolds(bf);
    check(baseBody,
      "968e a POST body that never ends, to hello, session, devices or invites of a team that exists, is awaited by the Worker with no object fetched, and ends without waking one;"
      + " a body over the cap is refused blob-size with none; a short body reaches the object once: " + JSON.stringify(bf));

    /* The object checks the team before it reads a body: a stalled body for a team never made is never touched. */
    const objectFirst = async (T, made) => {
      const out = {};
      for (const route of ["session", "devices", "invites"]) {
        const env = { BLOBS: S.memoryBucket() }, { team } = raise(T, X.doCtx(), env), rt = hex(16);
        if (made) await ask(team, "POST", "/relay/v1/teams", { json: createBody(rt, keyPair(false), Date.now()) });
        const s = stall();
        let answer = "pending";
        const done = team.fetch(new Request("https://relay.test/relay/v1/t/" + rt + "/" + route, { method: "POST", body: s.stream, duplex: "half" }))
          .then(async res => { answer = [res.status, JSON.parse(await res.text()).error]; }, () => { answer = "threw"; });
        await Promise.race([done, delay(300)]);
        const early = answer, reads = s.reads.n;
        s.end();
        await Promise.race([done, delay(2000)]);
        out[route] = [early, reads > 0];
      }
      return out;
    };
    const ofNever = await objectFirst(T0, false);
    const ofMade = await objectFirst(T0, true);
    const baseFirst = ["session", "devices", "invites"].every(k => same(ofNever[k], [[403, "not-enrolled"], false]));
    const controlFirst = ["session", "devices", "invites"].every(k => ofMade[k][0] === "pending" && ofMade[k][1] === true);
    check(baseFirst && controlFirst,
      "968f the object answers not-enrolled to a session, devices or invites call for a team never made without touching its body, where for a team that exists it waits on the body: "
      + JSON.stringify(ofNever) + " against " + JSON.stringify(ofMade));

    /* RelayTeam's constructor passes no roots, so a create under the test root is refused by the object and leaves it with no table. */
    const bareRefused = async T => {
      const env = { BLOBS: S.memoryBucket() }, ctx = X.doCtx(), rt = hex(16), lead = keyPair(false);
      const team = new T.RelayTeam(ctx, env);
      const r = await ask(team, "POST", "/relay/v1/teams", { json: createBody(rt, lead, Date.now()) });
      return { status: r.status, error: r.json.error, tables: tablesOf(ctx) };
    };
    const br = await bareRefused(T0);
    const baseBare = same(br, { status: 403, error: "bad-grant", tables: [] });
    check(baseBare,
      "968g RelayTeam as the namespace builds it (no roots handed) trusts the vendor's root alone: a create under the test root is refused bad-grant and leaves no table: " + JSON.stringify(br));

    /* ---- plants for 968 ---- */
    const pCtor = await swapTeam("let made = false;", "let made = (sql.exec(MAKE), true);", async T => {
      const r = await safe(() => neverMade(T)), l = await safe(() => lazyStore(T));
      return !r || r.tables.length > 0 || !l || l.untouched.length > 0;
    });
    check(baseNever && same(lz, WANT_LAZY) && back(pCtor),
      "968h making the table in the constructor again (the old line) turns 968a and 968c red, and the file is put back: " + how(pCtor));
    const pGet = await swapTeam("if (!has()) return undefined;", "", async T => !same(await safe(() => neverMade(T)), nm) && !same(await safe(() => lazyStore(T)), WANT_LAZY));
    check(baseNever && back(pGet),
      "968i lifting the missing-table answer from get turns 968a and 968c red, and the file is put back: " + how(pGet));
    const pList = await swapTeam("if (!has()) return [];", "", async T => !same(await safe(() => lazyStore(T)), WANT_LAZY));
    check(same(lz, WANT_LAZY) && back(pList),
      "968j lifting the missing-table answer from list turns 968c red, and the file is put back: " + how(pList));
    const pDel = await swapTeam("if (!has()) return;", "", async T => !same(await safe(() => lazyStore(T)), WANT_LAZY));
    check(same(lz, WANT_LAZY) && back(pDel),
      "968k lifting the missing-table answer from del turns 968c red, and the file is put back: " + how(pDel));
    const pMake = await swapTeam("sql.exec(MAKE); made = true;", "made = true;", async T => !same(await safe(() => created(T)), WANT_CREATED) && !same(await safe(() => lazyStore(T)), WANT_LAZY));
    check(same(cr, WANT_CREATED) && same(lz, WANT_LAZY) && back(pMake),
      "968l never making the table turns 968b and 968c red, and the file is put back: " + how(pMake));
    const pRoute = await editWorker(swapped("if (!hit) return team.missing(); /* plant:worker-route */", ""), async mod => {
      const r = await safe(() => outside(T0, workerOver(mod)));
      return !r || r.wrong > 0 || r.fetched > 0;
    });
    check(baseOutside && pRoute.turned && pRoute.back,
      "968m lifting the Worker's route check lets paths and methods outside the routes past it, and the file is put back: " + pRoute.detail + ", sha " + (pRoute.back ? "restored" : "differs"));
    const pBody = await editWorker(swapped("if (request.method === \"POST\") { /* plant:worker-body */", "if (false) {"), async mod => {
      const r = await safe(() => bodyFirst(T0, workerOver(mod)));
      return !r || !bodyHolds(r);
    });
    check(baseBody && pBody.turned && pBody.back,
      "968n leaving a POST body unread in the Worker wakes the object while the body is still arriving, and the file is put back: " + pBody.detail + ", sha " + (pBody.back ? "restored" : "differs"));
    const pFirst = await swapTeam("if (what !== \"teams\" && !c.hasTeam(rt)) return refusedFor(\"not-enrolled\"); /* plant:team-first */", "", async T => {
      const r = await safe(() => objectFirst(T, false));
      return !r || !["session", "devices", "invites"].every(k => same(r[k], [[403, "not-enrolled"], false]));
    });
    check(baseFirst && back(pFirst),
      "968o lifting the object's team check before it reads turns 968f red, and the file is put back: " + how(pFirst));
    const pRoots = await swapTeam("clock: () => Date.now(), sockets: hibernating(ctx) }", "clock: () => Date.now(), sockets: hibernating(ctx), roots: [\"" + K.ROOT.pub + "\"] }", async T => !same(await safe(() => bareRefused(T)), { status: 403, error: "bad-grant", tables: [] }));
    check(baseBare && back(pRoots),
      "968p handing RelayTeam's object the test root turns 968g red, and the file is put back: " + how(pRoots));
  }

  /* ---- 17: a team is made only under a grant, judged in the Worker before any object wakes (board 935, slice G1) ---- */
  {
    const T0 = 1800000000000, SKEW = C.CALL_SKEW_MS, HOUR = K.HOUR, GD = K.DAY, SPAN = 45 * GD;
    const stray = () => { const k = keyPair(false); return { id: "stray-1", pub: k.pub, privateKey: k.privateKey }; };
    const ctxOf = () => ({ rt: hex(16), lead: keyPair(false), now: T0 });
    const bodyFor = (ctx, o) => K.createBody(ctx.rt, ctx.lead, ctx.now, bytes => signHex(ctx.lead, bytes), o);
    const fresh = () => { const R = relayEnv(); R.clock.now = T0; return R; };
    const teamOf = (R, rt) => { const st = R.stores.get(rt); return st ? st.get("team") : undefined; };
    /* The same body handed straight to the team's object, as the Worker would after judging it. */
    async function viaObject(R, rt, body) {
      const res = await R.object(rt).fetch(new Request("https://relay.test/relay/v1/teams", { method: "POST", body: JSON.stringify(body) }));
      let json = null;
      try { json = await res.json(); } catch { json = null; }
      return { status: res.status, json, meta: null, socket: null };
    }

    /* Each way a create can fail its grant, as the probes that must be refused (with the reason the relay answers and, where the
       grant itself is at fault, the short word of C.grantWhy) and the probes at the edge that must be made. A scene is true while
       the relay holds all of them: the Worker answers each refusal with no object fetched and nothing stored, the object answers
       the same body the same way and keeps nothing, and each edge probe reaches the object once and keeps the grant's until and paid. */
    const gf = (fields, o) => ctx => K.grantFor(ctx.lead.pub, ctx.now, Object.assign({ fields }, o || {}));
    const via = (viaOpts, o) => ctx => K.grantFor(ctx.lead.pub, ctx.now, Object.assign({ signer: K.DELEGATE,
      via: K.delegationFor(ctx.now, viaOpts) }, o || {}));
    const grantProbe = (short, make) => ctx => { const grant = make(ctx); return { grant, short, reason: "bad-grant", body: bodyFor(ctx, { grant }) }; };
    const ROWS = [
      { tag: "create-grant", say: "a create with no grant",
        bad: [ctx => ({ grant: undefined, short: "shape", reason: "bad-grant", body: bodyFor(ctx, { grant: null }) })] },
      { tag: "create-grant", say: "a create in today's bytes, the old label and no grant",
        bad: [ctx => ({ grant: undefined, short: "shape", reason: "bad-grant", body: { rt: ctx.rt, lead: { keyId: ctx.lead.keyId, pub: ctx.lead.pub },
          t: ctx.now, sig: signHex(ctx.lead, C.createBytes(ctx.rt, ctx.lead.keyId, ctx.now)) } })] },
      { tag: "grant-lead", say: "a grant that names another key",
        bad: [grantProbe("lead", ctx => K.grantFor(keyPair(false).pub, ctx.now))] },
      { tag: "grant-ended", say: "a grant that has ended (until before or at the relay's now)", edge: "a grant that ends a moment on",
        bad: [grantProbe("ended", gf({ issued: T0 - 10 * GD, until: T0 - 1 })), grantProbe("ended", gf({ until: T0 }))],
        good: [gf({ until: T0 + 1 })] },
      { tag: "grant-future", say: "a grant issued in the future (past the skew)", edge: "a grant issued at the skew",
        bad: [grantProbe("future", gf({ issued: T0 + SKEW + 1, until: T0 + SKEW + 1 + GD }))],
        good: [gf({ issued: T0 + SKEW, until: T0 + SKEW + GD })] },
      { tag: "grant-span", say: "a grant longer than 45 days, signed by the root or by a delegated key, or ending as it begins", edge: "a grant of exactly 45 days",
        bad: [grantProbe("span", gf({ issued: T0 - HOUR, until: T0 - HOUR + SPAN + 1 })),
          grantProbe("span", ctx => K.delegatedGrantFor(ctx.lead.pub, ctx.now, { fields: { issued: T0 - HOUR, until: T0 - HOUR + SPAN + 1 } })),
          grantProbe("span", gf({ issued: T0 - HOUR, until: T0 - HOUR }))],
        good: [gf({ issued: T0 - HOUR, until: T0 - HOUR + SPAN })] },
      { tag: "grant-sig", say: "a grant signed by a key the root did not certify, by the delegated key with no delegation, or changed after it was signed",
        bad: [grantProbe("signature", ctx => K.grantFor(ctx.lead.pub, ctx.now, { signer: stray() })),
          grantProbe("signature", ctx => K.grantFor(ctx.lead.pub, ctx.now, { signer: K.DELEGATE })),
          grantProbe("signature", ctx => { const g = K.grantFor(ctx.lead.pub, ctx.now); g.paid = !g.paid; return g; })] },
      { tag: "via-sig", say: "a delegation the root did not sign, or one the delegated key signed for itself",
        bad: [grantProbe("via-signature", via({ signer: stray() })), grantProbe("via-signature", via({ signer: K.DELEGATE }))] },
      { tag: "grant-may", say: "a delegation whose may lacks relay-grant",
        bad: [grantProbe("via-may", via({ fields: { may: ["licence-issue"] } }))] },
      { tag: "grant-window", say: "a grant outside its delegation's window", edge: "a grant that fills the window exactly",
        bad: [grantProbe("via-window", via({ fields: { until: T0 + 20 * GD } })), grantProbe("via-window", via({ fields: { from: T0 } }))],
        good: [via({ fields: { from: T0 - HOUR, until: T0 + 30 * GD } })] },
      { tag: "via-kind", say: "a delegation of another kind",
        bad: [grantProbe("via-kind", via({ fields: { kind: "etiuda-licence" } }))] },
      { tag: "grant-kind", say: "a licence-shaped document presented as a grant, otherwise made as one",
        bad: [grantProbe("kind", gf({ kind: "etiuda-licence" }))] },
      { tag: "grant-fields", say: "a grant carrying a field it does not allow",
        bad: [grantProbe("fields", gf({ note: "extra" }))] },
      { tag: "grant-format", say: "a grant of another format",
        bad: [grantProbe("shape", gf({ format: 2 }))] },
      { tag: "grant-paid", say: "a grant whose paid is neither true nor false, or is left out",
        bad: [grantProbe("shape", gf({ paid: "yes" })), grantProbe("shape", ctx => K.grantFor(ctx.lead.pub, ctx.now, { omit: ["paid"] }))] },
      { tag: "create-sig", say: "a grant lifted from another create, the lead's signature covering another grant's hash",
        bad: [ctx => { const grant = K.grantFor(ctx.lead.pub, ctx.now), other = K.grantFor(ctx.lead.pub, ctx.now, { fields: { paid: false } });
          return { grant, short: null, reason: "bad-signature", body: bodyFor(ctx, { grant, signedGrant: other }) }; }] },
      { tag: "create-sig", say: "a create signed in today's bytes beside a good grant",
        bad: [ctx => { const grant = K.grantFor(ctx.lead.pub, ctx.now);
          return { grant, short: null, reason: "bad-signature", body: bodyFor(ctx, { grant, bytes: C.createBytes(ctx.rt, ctx.lead.keyId, ctx.now) }) }; }] },
    ];
    async function scene(row, worker) {
      for (const make of row.bad || []) {
        const ctx = ctxOf(), p = make(ctx);
        if (p.short !== undefined && C.grantWhy(p.grant, ctx.lead.pub, ctx.now, K.ROOTS) !== p.short) return false;
        const R = fresh(), w = await viaWorker(worker, R, p.body);
        if (!refused(w.r, p.reason) || w.gets !== 0 || R.stores.has(ctx.rt)) return false;
        const R2 = fresh(), o = await viaObject(R2, ctx.rt, p.body);
        if (!refused(o, p.reason) || teamOf(R2, ctx.rt) !== undefined) return false;
      }
      for (const make of row.good || []) {
        const ctx = ctxOf(), grant = make(ctx), R = fresh();
        const w = await viaWorker(worker, R, bodyFor(ctx, { grant })), kept = teamOf(R, ctx.rt);
        if (w.r.status !== 200 || w.gets !== 1 || !kept || kept.until !== grant.until || kept.paid !== grant.paid) return false;
      }
      return true;
    }

    /* ---- 964: the root, the shared vector, and a team made under a grant ---- */
    const ROOT_LITERAL = "f78558260ad75c094052f936326a63bffb1a581ac8b91d898ae1fd01b61127ee";
    const rootHolds = () => C.ROOT_PUB === ROOT_LITERAL && /^[0-9a-f]{64}$/.test(C.ROOT_PUB) && C.ROOT_PUB !== K.ROOT.pub && K.ROOTS.indexOf(C.ROOT_PUB) < 0;
    const baseA = rootHolds();
    check(baseA,
      "964a the vendor's root is the constant ROOT_PUB of relay/core.cjs, the value the design names, and not the test root a leg builds the relay with");

    /* A core built with no roots trusts the constant alone: a create under the test root is refused as a grant that does not hold. */
    const noRoots = () => {
      const ctx = ctxOf(), store = S.memoryStore();
      const r = C.createCore({ store, clock: () => T0 }).create(ctx.rt, bodyFor(ctx, {}));
      return r.ok === false && r.reason === "bad-grant" && store.get("team") === undefined;
    };
    const baseB = noRoots();
    check(baseB,
      "964b a team object built with no roots trusts ROOT_PUB alone, so a create under the test root is refused bad-grant and keeps nothing");

    /* The default export is the Worker over the constant: given a create under the test root, at the real time, it refuses it for its signature. */
    const defaultRefuses = async worker => {
      const now = Date.now(), ctx = { rt: hex(16), lead: keyPair(false), now }, R = relayEnv();
      R.clock.now = now;
      const body = bodyFor(ctx, {});
      const w = await viaWorker(worker, R, body);
      return C.grantWhy(body.grant, ctx.lead.pub, now, [C.ROOT_PUB]) === "signature" && refused(w.r, "bad-grant") && w.gets === 0 && !R.stores.has(ctx.rt);
    };
    const baseC = await defaultRefuses(WORKER.default);
    check(baseC,
      "964c the Worker as deployed (its default export) takes the constant root and no other: a create under the test root is refused bad-grant with no object fetched");

    /* The shared vector (relay/test/grant-vector.json): the bytes each signer signed, built by hand when it was made, against the functions here. */
    const V = JSON.parse(fs.readFileSync(path.join(ROOT, "relay", "test", "grant-vector.json"), "utf8"));
    const pubKey = pub => crypto.createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(pub, "hex")]), format: "der", type: "spki" });
    const verifies = (pub, bytesHex, sig) => crypto.verify(null, Buffer.from(bytesHex, "hex"), pubKey(pub), Buffer.from(sig, "hex"));
    const vectorHolds = () => {
      const g = V.grants, c = V.create, text = hexs => Buffer.from(hexs, "hex").toString("utf8");
      return /TEST KEYS ONLY/.test(V.note) && text(g.root.bytes).startsWith("etiuda-relay-grant\n") && text(V.delegation.bytes).startsWith("etiuda-delegation\n")
        && text(c.bytes).startsWith("etiuda-relay-create-2\n" + c.rt + "\n" + c.keyId + "\n" + c.t + "\n")
        && C.grantBytes(g.root.grant).toString("hex") === g.root.bytes && C.grantBytes(g.delegated.grant).toString("hex") === g.delegated.bytes
        && C.delegationBytes(V.delegation.doc).toString("hex") === V.delegation.bytes
        && C.create2Bytes(c.rt, c.keyId, c.t, g[c.grant].grant).toString("hex") === c.bytes
        && verifies(V.root.pub, g.root.bytes, g.root.sig) && verifies(V.delegate.pub, g.delegated.bytes, g.delegated.sig)
        && verifies(V.root.pub, V.delegation.bytes, V.delegation.sig) && verifies(V.lead.pub, c.bytes, c.sig)
        && g.root.grant.sig.value === g.root.sig && g.delegated.grant.sig.value === g.delegated.sig && V.delegation.doc.sig.value === V.delegation.sig
        && C.grantOk(g.root.grant, V.lead.pub, V.now, [V.root.pub]) && C.grantOk(g.delegated.grant, V.lead.pub, V.now, [V.root.pub])
        && !C.grantOk(g.root.grant, V.lead.pub, V.now) && !C.grantOk(g.delegated.grant, V.lead.pub, V.now, [V.delegate.pub])
        && !C.grantOk(g.root.grant, V.lead.pub, g.root.grant.until, [V.root.pub]) && !C.grantOk(g.root.grant, K.ROOT.pub, V.now, [V.root.pub]);
    };
    const baseD = vectorHolds();
    check(baseD,
      "964d the shared vector holds: the grant, delegation and create bytes equal what its maker built by hand, each signature verifies, and grantOk takes both grants"
      + " under the vector's root and neither under the vendor's, nor at their end, nor for another lead");

    /* A team made under a grant keeps the grant's until and paid, and nothing else of it. */
    const madeUnder = async make => {
      const ctx = ctxOf(), grant = make(ctx), R = fresh(), w = await viaWorker(W, R, bodyFor(ctx, { grant })), kept = teamOf(R, ctx.rt);
      const dump = JSON.stringify(R.stores.get(ctx.rt).dump());
      const leaks = [grant.sig.value, grant.kind].concat(grant.via ? [grant.via.sig.value] : []).filter(s => dump.indexOf(s) > -1).length;
      return { w, kept, grant, ctx, leaks };
    };
    const keptFor = x => x.w.r.status === 200 && x.w.gets === 1 && !!x.kept && Object.keys(x.kept).sort().join() === "epoch,lead,paid,rt,until"
      && x.kept.until === x.grant.until && x.kept.paid === x.grant.paid && x.kept.lead.keyId === x.ctx.lead.keyId && x.leaks === 0;
    const byRoot = await madeUnder(gf({ paid: true })), byDelegate = await madeUnder(ctx => K.delegatedGrantFor(ctx.lead.pub, ctx.now, { fields: { paid: false } }));
    check(keptFor(byRoot) && byRoot.kept.paid === true,
      "964e a create under a grant signed by the root makes the team through the Worker with one object fetch, and the team keeps the grant's until and paid and nothing else of it");
    check(keptFor(byDelegate) && byDelegate.kept.paid === false,
      "964f a create under a grant signed by a delegated key, with the root's delegation inside it, makes the team the same way, keeping that grant's paid: false");
    /* The same lead creating again keeps the later until, and the paid of the grant that gave it. */
    const repeatHolds = async () => {
      const ctx = ctxOf(), R = fresh();
      const g = (days, paid) => K.grantFor(ctx.lead.pub, ctx.now, { fields: { until: ctx.now + days * GD, paid } });
      const make = async grant => { const w = await viaWorker(W, R, bodyFor(ctx, { grant })); return w.r.status === 200 ? teamOf(R, ctx.rt) : null; };
      const g1 = g(20, true), g2 = g(40, false), g3 = g(10, true), g4 = g(40, true);
      const a = await make(g1), b = await make(g2), c = await make(g3), d = await make(g4);
      return !!a && !!b && !!c && !!d && a.until === g1.until && a.paid === true && b.until === g2.until && b.paid === false
        && c.until === g2.until && c.paid === false && d.until === g2.until && d.paid === false;
    };
    const baseG = await repeatHolds();
    check(baseG,
      "964g a repeat create by the same lead keeps the later until with the paid of the grant that gave it: an earlier grant changes neither, an equal one keeps the first's paid");

    /* ---- 965: each way a create fails its grant is refused in the Worker before any object, and again by the object ---- */
    const letter = i => String.fromCharCode(97 + i);
    const sceneOk = [];
    for (let i = 0; i < ROWS.length; i++) {
      sceneOk[i] = await scene(ROWS[i], W);
      check(sceneOk[i],
        "965" + letter(i) + " " + ROWS[i].say + " is refused by the Worker with no object fetched and nothing stored, and by the object with nothing kept"
        + (ROWS[i].edge ? "; " + ROWS[i].edge + " is made, reaching the object once and keeping the grant's until and paid" : ""));
    }
    /* ---- 966: the line each one guards, lifted in turn, lets the same probes through, and the file is put back ---- */
    for (let i = 0; i < ROWS.length; i++) {
      const p = await liftCore("plant:" + ROWS[i].tag, async () => !(await scene(ROWS[i], W)));
      check(sceneOk[i] && p.turned && p.back, "966" + letter(i) + " lifting plant:" + ROWS[i].tag + " lets " + ROWS[i].say.split(",")[0] + " through, and the file is put back: "
        + p.detail + ", sha " + (p.back ? "restored" : "differs"));
    }

    /* ---- 967: the remaining plants ---- */
    const swapped = (from, to) => t => (t.split(from).length === 2 ? t.split(from).join(to) : null);
    const rootDecl = 'const ROOT_PUB = "' + ROOT_LITERAL + '";', testDecl = 'const ROOT_PUB = "' + K.ROOT.pub + '";';
    const rootPlant = await swapCore(rootDecl, testDecl, async () => !noRoots());
    check(baseB && rootPlant.turned && rootPlant.back, "967a changing ROOT_PUB to the test root lets a team object built with no roots take its grant, and the file is put back: "
      + rootPlant.detail + ", sha " + (rootPlant.back ? "restored" : "differs"));
    const rootRead = await swapCore(rootDecl, testDecl, async () => !rootHolds());
    check(baseA && rootRead.turned && rootRead.back, "967b changing ROOT_PUB makes 964a read another value, and the file is put back: "
      + rootRead.detail + ", sha " + (rootRead.back ? "restored" : "differs"));
    const workerRoot = await editWorker(swapped("export default routeWith([core.ROOT_PUB]);", 'export default routeWith(["' + K.ROOT.pub + '"]);'),
      async mod => !(await defaultRefuses(mod.default)));
    check(baseC && workerRoot.turned && workerRoot.back, "967c giving the default Worker the test root takes the test root's create to the object, and the file is put back: "
      + workerRoot.detail + ", sha " + (workerRoot.back ? "restored" : "differs"));
    const labelPlant = await swapCore('return Buffer.from(GRANT_KIND + "\\n" + canon(unsigned(grant)), "utf8");',
      'return Buffer.from(canon(unsigned(grant)), "utf8");', async () => !vectorHolds());
    check(baseD && labelPlant.turned && labelPlant.back, "967d dropping the grant's domain label from its signed bytes fails the vector, and the file is put back: "
      + labelPlant.detail + ", sha " + (labelPlant.back ? "restored" : "differs"));
    const delegLabel = await swapCore('return Buffer.from(DELEGATION_KIND + "\\n" + canon(unsigned(d)), "utf8");',
      'return Buffer.from(canon(unsigned(d)), "utf8");', async () => !vectorHolds());
    check(baseD && delegLabel.turned && delegLabel.back, "967e dropping the delegation's domain label from its signed bytes fails the vector, and the file is put back: "
      + delegLabel.detail + ", sha " + (delegLabel.back ? "restored" : "differs"));
    const createLabel = await swapCore('"etiuda-relay-create-2\\n" + rt', '"etiuda-relay-create\\n" + rt', async () => !vectorHolds());
    check(baseD && createLabel.turned && createLabel.back, "967f the create-2 label turned back to today's fails the vector, and the file is put back: "
      + createLabel.detail + ", sha " + (createLabel.back ? "restored" : "differs"));
    const untilPlant = await liftCore("plant:until-later", async () => !(await repeatHolds()));
    check(baseG && untilPlant.turned && untilPlant.back, "967g lifting plant:until-later lets an earlier grant's repeat create lower the team's until, and the file is put back: "
      + untilPlant.detail + ", sha " + (untilPlant.back ? "restored" : "differs"));
    const keptPlant = await swapCore("epoch: team ? team.epoch : 0, until, paid }", "epoch: team ? team.epoch : 0 }",
      async () => !keptFor(await madeUnder(gf({ paid: true }))));
    check(keptFor(byRoot) && keptPlant.turned && keptPlant.back, "967h leaving until and paid out of the team row fails the kept-grant leg, and the file is put back: "
      + keptPlant.detail + ", sha " + (keptPlant.back ? "restored" : "differs"));
    /* With the Worker's own line lifted a refused create wakes the object, which refuses it itself: the Worker's line is what spares the object. */
    const endedVia = async worker => {
      const ctx = ctxOf(), R = fresh(), grant = K.grantFor(ctx.lead.pub, ctx.now, { fields: { until: ctx.now - 1 } });
      const w = await viaWorker(worker, R, bodyFor(ctx, { grant }));
      return { gets: w.gets, refusedBad: refused(w.r, "bad-grant"), kept: teamOf(R, ctx.rt) };
    };
    const baseI = await endedVia(W);
    const workerPlant = await editWorker(lineLifted("plant:worker-grant"), async mod => {
      const w = await endedVia(mod.routeWith(K.ROOTS, env => env.NOW()));
      return w.gets === 1 && w.refusedBad && w.kept === undefined;
    });
    check(baseI.gets === 0 && baseI.refusedBad && baseI.kept === undefined && workerPlant.turned && workerPlant.back, "967i lifting plant:worker-grant makes a refused create wake its object once, which refuses it itself, and the file is put back: "
      + workerPlant.detail + ", sha " + (workerPlant.back ? "restored" : "differs"));
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
