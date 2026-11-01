/* Records one release's requests to the relay, once, as relay/test/previous/<release>.json, from the relay of that release:
 * every route with its success and a refusal or two, a session ended by the clock, a lapse and its folder move, a renewal and
 * a handover, under throwaway keys made from fixed seeds and a fixed clock. Run on the release's own tree, never edited after.
 *
 *     node relay/test/previous/record.mjs <release>        refuses where that file is already there
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { placeholders, send, socketsSaid, signText } from "./replay.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);
const B = require(path.join(ROOT, "shell", "relay", "blob.cjs"));
const C = require(path.join(ROOT, "relay", "core.cjs"));
const S = require(path.join(ROOT, "relay", "test", "stand-ins.cjs"));
const K = require(path.join(ROOT, "relay", "test", "grant-kit.cjs"));
const WORKER = await import(pathToFileURL(path.join(ROOT, "relay", "worker.mjs")).href);

const release = String(process.argv[2] || "");
if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9a-f]{8}$/.test(release)) {
  console.error("record: name the release as <date>-<8 hex of its commit>, e.g. 2026-11-01-59713def");
  process.exit(2);
}
const OUT = path.join(HERE, release + ".json");
if (fs.existsSync(OUT)) { console.error("record: " + OUT + " is there already, and a fixture is never written twice"); process.exit(2); }

const MIN = 60 * 1000, DAY = 24 * 60 * MIN, T0 = Date.UTC(2026, 10, 1, 9, 0, 0);
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const SPKI = Buffer.from("302a300506032b6570032100", "hex");
/* A throwaway key from a fixed seed: the lead and a desk named by its public key, a desk by its branch id. */
function key(name, branch) {
  const seed = sha("etiuda relay fixture " + name);
  const priv = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(seed, "hex")]), format: "der", type: "pkcs8" });
  const pub = crypto.createPublicKey(priv).export({ type: "spki", format: "der" }).subarray(SPKI.length).toString("hex");
  return { name, seed, pub, keyId: branch ? "k-" + sha(Buffer.from(pub, "hex")).slice(0, 16) : pub, privateKey: priv };
}
const lead = key("lead", false), desk = key("desk", true), other = key("other", false), joiner = key("joiner", true);
const thief = key("thief", false), next = key("next", false);
const keys = Object.fromEntries([lead, desk, other, joiner, thief, next].map(k => [k.name, { seed: k.seed, pub: k.pub, keyId: k.keyId }]));
const signHex = (k, bytes) => crypto.sign(null, bytes, k.privateKey).toString("hex");
const rt = sha("etiuda relay fixture team").slice(0, 32), deskId = "k-" + sha("desk id").slice(0, 16), otherId = "k-" + sha("other id").slice(0, 16);
const teamKey = Buffer.from(sha("etiuda relay fixture team key"), "hex");
const P = "/relay/v1/t/" + rt;

const W = WORKER.routeWith(K.ROOTS, env => env.NOW());
const R = S.relayEnv({ roots: K.ROOTS });
const ph = placeholders(), seen = new Map(), steps = [];
let lastSession = null, lastChallenge = null;

async function step(what, at, req, sign) {
  R.clock.now = at;
  const res = await send(W, R, req);
  ph.bindFrom(res);
  const sent = {};
  for (const [id, msgs] of Object.entries(socketsSaid(R, seen))) sent[ph.out(id)] = ph.out(msgs);
  const row = { what, at, req: ph.out(req) };
  if (sign) row.sign = { key: sign.key, field: "sig", text: ph.out(sign.text) };
  row.res = ph.out(res);
  if (Object.keys(sent).length) row.sent = sent;
  steps.push(row);
  if (res.json && typeof res.json.session === "string") lastSession = res.json.session;
  if (res.json && typeof res.json.challenge === "string") lastChallenge = res.json.challenge;
  console.log(String(steps.length).padStart(3) + " " + res.status + " " + (res.json && res.json.error ? res.json.error + " " : "") + what);
  return res;
}
const post = (p, json, token) => ({ method: "POST", path: p, headers: Object.assign({ "content-type": "application/json" }, token ? { authorization: "Bearer " + token } : {}), body: { json } });
const get = (p, token, extra) => ({ method: "GET", path: p, headers: Object.assign(token ? { authorization: "Bearer " + token } : {}, extra || {}) });
const metaOf = (blob, extra) => Object.assign({ v: 1, id: blob.id, supersedes: blob.supersedes, epoch: blob.epoch, writer: blob.writerKeyId,
  counter: blob.counter, del: blob.deletion, sig: blob.signature, nonce: blob.nonce, place: blob.place }, extra || {});
const putReq = (token, blob, extra) => ({ method: "PUT", path: P + "/b/" + blob.id,
  headers: token ? { authorization: "Bearer " + token } : {}, blob: metaOf(blob, extra), body: { hex: blob.ciphertext.toString("hex") } });
const sealAs = (writer, p, counter, place, extra) => B.seal(Object.assign({ relayTeamId: rt, epoch: 1, teamKey,
  id: sha("blob " + p + " " + counter + " " + writer.name).slice(0, 32),
  writer: { keyId: writer.keyId, privateKey: writer.privateKey }, path: p, body: "body " + counter, counter, place, kind: "file" }, extra || {}));
/* A hello: the challenge asked for, then the session opened over it, its signature covering the frozen text. */
async function hello(what, at, who, extra, signer) {
  await step("a challenge for " + what, at, post(P + "/hello", {}));
  const c = lastChallenge;
  const text = C.helloBytes(rt, c, who.keyId).toString("utf8");
  const body = Object.assign({ challenge: c, key: who.keyId, pub: who.pub, sig: signHex(signer || who, Buffer.from(text, "utf8")) }, extra || {});
  return step(what, at, post(P + "/session", body), { key: (signer || who).name, text });
}

const createBody = (k, t, o) => K.createBody(rt, { keyId: k.keyId, pub: k.pub }, t, bytes => signHex(k, bytes), o);
await step("the lead makes the team, under a grant that ends a day later", T0, post("/relay/v1/teams", createBody(lead, T0, { grantOpts: { fields: { paid: true, until: T0 + DAY } } })));
await step("the same create again", T0 + 1000, post("/relay/v1/teams", createBody(lead, T0 + 1000, { grantOpts: { fields: { paid: true, until: T0 + DAY } } })));
await step("another lead's create of that team", T0 + 2000, post("/relay/v1/teams", createBody(thief, T0 + 2000)));
const devs = [{ id: desk.keyId, pub: desk.pub, desk: deskId }, { id: other.keyId, pub: other.pub, desk: otherId }];
const devicesBody = (list, rev, t) => ({ keys: list, rev, t, sig: signHex(lead, C.devicesBytes(rt, rev, t, list)) });
await step("the lead enrols two desks", T0 + 3000, post(P + "/devices", devicesBody(devs, 1, T0 + 3000)));
await step("the same rev of the list again", T0 + 4000, post(P + "/devices", devicesBody(devs, 1, T0 + 4000)));
await hello("the desk by its branch id", T0 + 5000, desk);
const deskS = lastSession;
await hello("the other desk by its public key", T0 + 6000, other);
const otherS = lastSession;
await hello("the lead", T0 + 7000, lead);
const leadS = lastSession;
await hello("a desk whose signature another key made", T0 + 8000, desk, {}, thief);
await hello("a key the team never enrolled", T0 + 9000, joiner);
await step("the desk's socket", T0 + 10000, get(P + "/socket", deskS, { upgrade: "websocket" }));
await step("a socket with no session", T0 + 10500, get(P + "/socket", null, { upgrade: "websocket" }));
const g1 = sealAs(lead, "guide.ec", 1, "root");
await step("the lead's file at the root", T0 + 11000, putReq(leadS, g1));
const own = sealAs(desk, "desks/" + deskId + "/own.ec", 1, "desk:" + deskId);
await step("the desk's own file in its place", T0 + 12000, putReq(deskS, own));
await step("the desk's file at the root, outside its place", T0 + 13000, putReq(deskS, sealAs(desk, "loose.ec", 2, "root")));
await step("a file with no session", T0 + 14000, putReq(null, sealAs(lead, "nobody.ec", 9, "root")));
await step("what the desk has not read", T0 + 15000, get(P + "/since/0", deskS));
await step("the lead's file, read by the desk", T0 + 16000, get(P + "/b/" + g1.id, deskS));
const g2 = sealAs(lead, "guide.ec", 2, "root", { supersedes: g1.id });
await step("the lead's file superseded", T0 + 17000, putReq(leadS, g2));
await step("the superseded file read", T0 + 18000, get(P + "/b/" + g1.id, deskS));
await step("a counter the lead has used", T0 + 19000, putReq(leadS, sealAs(lead, "again.ec", 2, "root")));
const gone = B.seal({ relayTeamId: rt, epoch: 1, teamKey, id: sha("blob delete guide").slice(0, 32), supersedes: g2.id,
  writer: { keyId: lead.keyId, privateKey: lead.privateKey }, path: "guide.ec", counter: 3, place: "root", kind: "delete" });
await step("the lead's file deleted", T0 + 20000, putReq(leadS, gone));
await step("what the desk has not read since the first", T0 + 21000, get(P + "/since/1", deskS));
const invId = sha("invitation").slice(0, 32), token = sha("invitation token");
const add = [{ id: invId, hash: sha(token), wrap: { epoch: 1, ct: sha("wrap").slice(0, 48) } }];
await step("the lead adds an invitation with its wrap", T0 + 22000, post(P + "/invites", { add, drop: [], t: T0 + 22000, sig: signHex(lead, C.invitesBytes(rt, T0 + 22000, add, [])) }));
await hello("the invited key, with its token", T0 + 23000, joiner, { invite: token, inv: invId });
const joinS = lastSession;
await step("the invitation's wrap", T0 + 24000, get(P + "/wrap", joinS));
await step("the invitations' states, for the lead", T0 + 25000, get(P + "/states", leadS));
await step("the invitations' states, for a desk", T0 + 25500, get(P + "/states", deskS));
const place = "desk:k-" + sha("joiner place").slice(0, 16);
const ask = B.seal({ relayTeamId: rt, epoch: 1, teamKey, id: sha("blob join").slice(0, 32), writer: { keyId: joiner.keyId, privateKey: joiner.privateKey },
  path: "desks/" + place.slice(5) + "/join.json", body: "ask 1", counter: 1, place, kind: "file" });
await step("the invited key's one upload", T0 + 26000, putReq(joinS, ask, { pub: joiner.pub }));
await step("a session past its thirty minutes", T0 + 31 * MIN, get(P + "/since/0", deskS));
await step("the lead drops the other desk", T0 + 31 * MIN, post(P + "/devices", devicesBody(devs.slice(0, 1), 2, T0 + 31 * MIN)));
await step("the dropped desk's session", T0 + 31 * MIN + 1000, get(P + "/since/0", otherS));
await hello("the dropped desk again", T0 + 31 * MIN + 2000, other);
const T1 = T0 + 32 * DAY;
await hello("the lead, 31 days after the grant ended", T1, lead);
const lapsedS = lastSession;
await step("a file while the team reads only", T1 + 1000, putReq(lapsedS, sealAs(lead, "late.ec", 4, "root")));
await step("the team file moved to the folder while it reads only", T1 + 2000, putReq(lapsedS, sealAs(lead, "etiuda-team.json", 5, "root"), { channel: { kind: "folder" } }));
await step("the lead renews the grant", T1 + 3000, post(P + "/grant", { grant: K.grantFor(lead.pub, T1 + 3000, { fields: { until: T1 + 30 * DAY } }) }));
await step("a file once renewed", T1 + 4000, putReq(lapsedS, sealAs(lead, "renewed.ec", 6, "root")));
const leadBytes = Buffer.from("etiuda-relay-lead\n" + rt + "\n" + next.keyId + "\n" + next.pub + "\n" + (T1 + 5000), "utf8");
await step("the lead hands the team to a new lead", T1 + 5000, post(P + "/lead", { to: { keyId: next.keyId, pub: next.pub }, t: T1 + 5000,
  sig: signHex(lead, leadBytes), grant: K.grantFor(next.pub, T1 + 5000) }));
await hello("the new lead", T1 + 6000, next);
await step("the former lead's session", T1 + 7000, get(P + "/since/0", lapsedS));
await step("a path no route answers", T1 + 8000, get(P + "/nowhere"));
await step("a method a route does not answer", T1 + 8000, { method: "DELETE", path: P + "/b/" + g1.id, headers: {} });
await step("another version's path", T1 + 8000, get("/relay/v2/teams"));

const fixture = {
  header: [
    "The requests the relay of release " + release + " answered, kept frozen: tests/relay-unit.mjs sends each again to the relay as it",
    "stands and requires the same answer (the version policy's point 2). Never edit this file. A placeholder ($challenge1$, $session1$,",
    "$socket1$, $made1$) is a value the relay chose; a step's sign is the text its signature covers, made again over the new challenge.",
    "To add the next release's: on that release's tree, once it is deployed, run node relay/test/previous/record.mjs <date>-<8 hex of",
    "its commit>, commit the new file beside this one, and keep this one until the stated period for the previous protocol is over.",
  ],
  release,
  keys,
  steps,
};
fs.writeFileSync(OUT, JSON.stringify(fixture, null, 1) + "\n", "utf8");
console.log("record: " + steps.length + " steps written to " + path.relative(ROOT, OUT));
