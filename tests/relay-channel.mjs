/* The relay's channel layer, shell/relay/channel.cjs, driven against the relay as built (relay/worker.mjs over
 * relay/test/stand-ins.cjs, in memory) with its mirrors in a scratch folder, and the desk's half in shell/main.js loaded
 * in bare node: a lead's files reach a desk's mirror whole, live and after the desk was offline, in the catch-up's order;
 * the desk's own file goes back after the catch-up; every forged, replayed, re-addressed, misplaced or hostile-path blob
 * is dropped and said and never written; a deletion lands only as its writer's signed record; the floors survive a
 * restart; a .tmp and an echo are never sent; nothing private reaches the relay in the clear; the joining bootstrap
 * (a request and a team file sealed under the invitation's own key, in a place of its own) serves the invited desk and
 * nobody else; and a relay address is followed only where an invitation pinned the lead (board 907), a relay file's own
 * ring pinning nobody (900i inverted). Throwaway keys and invented words only; nothing contacts a host.
 *
 *     node tests/relay-channel.mjs     exit code is the number of failed checks, capped at 63; 78 where it did not complete
 *
 * The shell runs from a copy of shell/ in a temp folder, as tests/rollback-floor.mjs runs it. No window variable is set.
 * Machine policy is the stand-in in tests/reg-stand.cjs, set to none.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"));
const EXPECTED = 29;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-relay-channel-"));
const URLV1 = "https://relay.test/relay/v1";
const hex = n => crypto.randomBytes(n).toString("hex");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const SPKI = Buffer.from("302a300506032b6570032100", "hex");
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms) {
  const end = Date.now() + (ms || 4000);
  for (;;) {
    let v = false;
    try { v = await fn(); } catch { v = false; }
    if (v) return true;
    if (Date.now() > end) return false;
    await wait(20);
  }
}
function keyPair(branch, keyId) {
  const p = crypto.generateKeyPairSync("ed25519");
  const pub = p.publicKey.export({ type: "spki", format: "der" }).subarray(SPKI.length).toString("hex");
  return { keyId: keyId || (branch ? "k-" + sha(Buffer.from(pub, "hex")).slice(0, 16) : pub), pub, privateKey: p.privateKey };
}
const signHex = (key, bytes) => crypto.sign(null, bytes, key.privateKey).toString("hex");

let C = null, B = null, S = null, W = null, core = null;
try {
  C = nodeRequire(path.join(ROOT, "shell", "relay", "channel.cjs"));
  B = nodeRequire(path.join(ROOT, "shell", "relay", "blob.cjs"));
  core = nodeRequire(path.join(ROOT, "relay", "core.cjs"));
  S = nodeRequire(path.join(ROOT, "relay", "test", "stand-ins.cjs"));
  W = (await import(pathToFileURL(path.join(ROOT, "relay", "worker.mjs")).href)).default;
} catch (e) {
  console.log("  FAIL harness: the channel layer or the relay did not load - " + (e && e.message));
}

/* ---- the relay in memory, and each program's way to it -------------------------------------------------------- */
const R = S ? S.relayEnv() : null;
const foreign = [];
function findSocket(id) {
  for (const hub of R.hubs.values()) { const s = hub.byId(id); if (s) return s; }
  return null;
}
async function relayFetch(url, init) {
  const u = new URL(url);
  if (u.host !== "relay.test") { foreign.push(url); throw new Error("no such host in the lab"); }
  const i = Object.assign({}, init);
  if (i.body && i.method !== "GET") i.duplex = "half"; else delete i.body;
  return W.fetch(new Request(url, i), R.env);
}
/* A program's transport: its calls logged, and `down` making the relay not answer it. */
function transport(name) {
  const t = { name, down: false, log: [] };
  t.request = async (method, url, headers, body) => {
    t.log.push(method + " " + String(url).replace(/^https:\/\/[^/]+\/relay\/v1\/t\/[0-9a-f]{32}\//, ""));
    if (t.down) throw new Error("the stand-in relay does not answer " + name);
    const res = await relayFetch(url, { method, headers, body });
    const bytes = Buffer.from(await res.arrayBuffer());
    return { status: res.status, header: n => res.headers.get(n), bytes, socket: res.headers.get("x-stand-in-socket") };
  };
  t.connect = (url, headers, on) => {
    if (t.down) return null;
    let ws = null, closed = false;
    const handle = { send() {}, close() { closed = true; if (ws) ws.close(1000, ""); } };
    t.request("GET", String(url).replace(/^wss:/, "https:"), Object.assign({ upgrade: "websocket" }, headers)).then(r => {
      ws = r.status === 200 && r.socket && !closed ? findSocket(r.socket) : null;
      if (!ws) { setImmediate(on.close); return; }
      const send = ws.send, close = ws.close;
      ws.send = m => { send.call(ws, m); setImmediate(() => on.message(String(m))); };
      ws.close = (c, why) => { close.call(ws, c, why); setImmediate(on.close); };
    }, () => setImmediate(on.close));
    return handle;
  };
  return t;
}
async function admin(method, p, json) {
  const res = await relayFetch("https://relay.test" + p, { method, headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify(json), "utf8") });
  return { status: res.status, json: JSON.parse(Buffer.from(await res.arrayBuffer()).toString("utf8") || "null") };
}

/* ---- the team: its lead, its desks, its key and its files ------------------------------------------------------- */
const LEAD = keyPair(false, "quay-lead");
const DESK = keyPair(true), OTHER = keyPair(true), STRAY = keyPair(true), NEWD = keyPair(true), INTR = keyPair(false, "quay-lead");
const TEAM = "t-" + hex(8), RT = hex(16), K1 = crypto.randomBytes(32);
const RING = { format: 1, kind: "etiuda-ring", keys: [{ catalog: "quay-board", keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.pub }] };
const PIN = { teamId: TEAM, rt: RT, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
const member = k => ({ desk: { id: k.keyId, key: k.pub, box: "cd".repeat(32) } });
function signDoc(doc, key) {
  const o = JSON.parse(JSON.stringify(doc));
  o.sig = { alg: "Ed25519", keyId: LEAD.keyId };
  o.sig.value = signHex(key, C.signedBytes(o));
  return o;
}
const teamText = (rev, roster, more) => JSON.stringify(signDoc(Object.assign({ format: 1, kind: "etiuda-team", id: TEAM,
  catalogs: ["quay-board"], lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev,
  channel: { kind: "relay", rt: RT, url: URLV1 }, ring: RING, roster }, more || {}), LEAD), null, 1) + "\n";
let devRev = 0;
const enrolled = new Map();
async function enrol(...keys) {
  for (const k of keys) enrolled.set(k.keyId, { id: k.keyId, pub: k.pub, desk: k.keyId });
  devRev++;
  const list = [...enrolled.values()];
  const t = R.clock.now;
  return admin("POST", "/relay/v1/t/" + RT + "/devices", { keys: list, rev: devRev, t, sig: signHex(LEAD, core.devicesBytes(RT, devRev, t, list)) });
}
async function invites(add, drop) {
  const t = R.clock.now;
  return admin("POST", "/relay/v1/t/" + RT + "/invites", { add, drop, t, sig: signHex(LEAD, core.invitesBytes(RT, t, add, drop)) });
}
const put = (dir, rel, text) => { const f = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(f), { recursive: true }); C.writeWhole(f, text); };
const read = (dir, rel) => { try { return fs.readFileSync(path.join(dir, ...rel.split("/")), "utf8"); } catch { return null; } };
const store = () => R.stores.get(RT);
/* The team's storage as the relay keeps it, each value parsed from the text it is stored as. */
const entries = () => store().dump().map(([k, v]) => [k, JSON.parse(v)]);
const relayText = () => store().dump().map(([k, v]) => k + "=" + v).join("\n")
  + [...R.bucket.objects.values()].map(b => b.toString("latin1")).join("\n");

/* A program over the relay: the lead's (place root) or a desk's (place desk:<id>), its mirror and record in the lab. */
function program(name, who, place, o) {
  const x = o || {};
  const t = transport(name), said = [], written = [];
  const mirror = path.join(LAB, name);
  const ch = C.createChannel(Object.assign({
    rt: RT, url: URLV1, mirror, stateFile: path.join(LAB, name + ".json"),
    pin: () => PIN,
    me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place }),
    keyFor: e => (e === 1 ? K1 : null), sealEpoch: () => 1,
    request: t.request, connect: t.connect, pollMs: 1e9,
    write: (f, text) => { if (!f.endsWith(".json") || f.startsWith(mirror + path.sep)) written.push(path.relative(mirror, f).split(path.sep).join("/")); C.writeWhole(f, text); },
    say: l => said.push(l),
  }, x));
  return { name, ch, t, said, written, mirror, prog: ch.program };
}
async function settle(...ps) { for (let i = 0; i < 3; i++) for (const p of ps) { p.ch.kick(); await p.ch.idle(); } }

/* A hostile relay: a stored record copied, changed or put back under a new place in the sequence. */
function inject(meta, ct) {
  const s = store(), seq = (s.get("seq") || 0) + 1, obj = RT + "/" + meta.id + "/" + hex(8);
  R.bucket.objects.set(obj, Buffer.from(ct));
  s.put("blob:" + meta.id, Object.assign({ supersedes: null, del: false, seq, at: R.clock.now, obj, size: ct.length }, meta, { seq, obj, size: ct.length }));
  s.put("seq:" + String(seq).padStart(16, "0"), meta.id);
  s.put("seq", seq);
}
function recordOf(id) {
  const rec = store().get("blob:" + id);
  return rec ? { rec, ct: R.bucket.objects.get(rec.obj) } : null;
}
function idsBy(writer) {
  return entries().filter(([k, v]) => k.startsWith("blob:") && v.writer === writer).map(([, v]) => v);
}

try {
  if (!W) throw new Error("no relay to drive");
  const made = await admin("POST", "/relay/v1/teams", { rt: RT, lead: { keyId: LEAD.keyId, pub: LEAD.pub }, t: R.clock.now,
    sig: signHex(LEAD, core.createBytes(RT, LEAD.keyId, R.clock.now)) });
  if (made.status !== 200) throw new Error("the team was not made on the relay: " + JSON.stringify(made.json));
  await enrol(DESK, OTHER);

  const lead = program("lead", LEAD, "root");
  const desk = program("desk", DESK, "desk:" + DESK.keyId);
  const other = program("other", OTHER, "desk:" + OTHER.keyId, { watch: false });
  lead.ch.start(); other.ch.start();

  /* ---- the lead's files reach a desk whole, in the catch-up's order, and nothing private in the clear ---- */
  const EDITION = "{\"kind\":\"etiuda-sealed\",\"note\":\"Quay Board edition one, a sealed text\"}\n";
  put(lead.mirror, "guide.ec", EDITION);
  put(lead.mirror, C.TEAM_NAME, teamText(1, [member(DESK), member(OTHER)]));
  await settle(lead);
  put(other.mirror, "desks/" + OTHER.keyId + "/in-use.ec", "{\"inUse\":\"quay-board one\"}\n");
  await settle(other);
  const leadUploads = idsBy(LEAD.keyId).length, otherUploads = idsBy(OTHER.keyId).length;
  desk.ch.start();
  await settle(desk);
  const order = desk.written.filter(w => !w.endsWith(".json") || w === C.TEAM_NAME);
  check(read(desk.mirror, "guide.ec") === EDITION && read(desk.mirror, C.TEAM_NAME) === read(lead.mirror, C.TEAM_NAME)
    && read(desk.mirror, "desks/" + OTHER.keyId + "/in-use.ec") === "{\"inUse\":\"quay-board one\"}\n" && leadUploads === 2 && otherUploads === 1,
    "940a the lead's team file and edition, and a colleague's file, reach a desk's mirror whole through the relay: lead uploads "
    + leadUploads + ", the colleague's " + otherUploads + ", the edition " + (read(desk.mirror, "guide.ec") === EDITION ? "byte for byte" : "missing or changed"));
  check(order.join(",") === [C.TEAM_NAME, "guide.ec", "desks/" + OTHER.keyId + "/in-use.ec"].join(","),
    "940b a catch-up applies the team file first, then the other root files, then the desks', whatever the relay's order: " + order.join(", "));
  const clear = relayText();
  const leaks = ["guide.ec", "Quay Board", "quay-board", TEAM, "in-use", "etiuda-team", "inUse"].filter(w => clear.indexOf(w) >= 0);
  check(leaks.length === 0 && clear.length > 0, "940c the relay keeps no path, no body and no team id in the clear, its store and bucket read whole: "
    + (leaks.length ? "found " + leaks.join(", ") : "none of seven markers"));

  /* ---- live: an announcement on the socket brings the next edition with no ask of the desk's own ---- */
  const socketUp = await until(() => desk.ch.socketOpen());
  put(lead.mirror, "guide.ec", EDITION.replace("one", "two"));
  await settle(lead);
  const live = await until(() => read(desk.mirror, "guide.ec") === EDITION.replace("one", "two"));
  check(socketUp && live, "940d live: the relay's announcement on the desk's socket brings the lead's next edition into its mirror, the desk asking nothing on a timer: "
    + (live ? "arrived" : "not arrived") + ", socket " + (socketUp ? "open" : "closed"));

  /* ---- offline: the desk works on its mirror; its own file waits and goes after the catch-up ---- */
  desk.t.down = true;
  await desk.ch.stop();
  desk.ch.start();
  put(desk.mirror, "desks/" + DESK.keyId + "/join.json", "{\"kind\":\"etiuda-join\",\"note\":\"a desk asking\"}\n");
  await wait(400);
  await desk.ch.idle();
  const heldBack = idsBy(DESK.keyId).length;
  put(lead.mirror, "guide.ec", EDITION.replace("one", "three"));
  await settle(lead);
  const before = desk.t.log.length;
  desk.t.down = false;
  await settle(desk);
  await settle(lead);
  const after = desk.t.log.slice(before);
  const sinceAt = after.findIndex(l => /^GET since\//.test(l)), putAt = after.findIndex(l => /^PUT b\//.test(l));
  check(heldBack === 0 && desk.said.some(l => l.indexOf("does not answer") >= 0) && read(desk.mirror, "guide.ec") === EDITION.replace("one", "three")
    && read(lead.mirror, "desks/" + DESK.keyId + "/join.json") === "{\"kind\":\"etiuda-join\",\"note\":\"a desk asking\"}\n",
    "940e offline: the desk's own file waits in its outbox while the relay does not answer, and both ways arrive once it does: uploads while down "
    + heldBack + ", the edition " + (read(desk.mirror, "guide.ec") === EDITION.replace("one", "three") ? "caught up" : "missing")
    + ", the request " + (read(lead.mirror, "desks/" + DESK.keyId + "/join.json") ? "in the lead's mirror" : "missing"));
  check(sinceAt >= 0 && putAt > sinceAt, "940f the outbox goes after the catch-up: since at call " + sinceAt + ", the upload at call " + putAt);

  /* ---- a .tmp and an echo are never sent ---- */
  put(desk.mirror, "desks/" + DESK.keyId + "/notes.ec.tmp", "half a file\n");
  fs.writeFileSync(path.join(desk.mirror, "desks", DESK.keyId, "draft.tmp"), "an atomic write's name\n");
  put(desk.mirror, "local-note.ec", "written at the root of the desk's mirror, the lead's place\n");
  await settle(desk);
  const deskUploads = idsBy(DESK.keyId).length;
  const tmpWord = desk.prog.considerOutgoing("desks/" + DESK.keyId + "/x.ec.tmp");
  check(deskUploads === 1 && tmpWord.send === false && tmpWord.reason === "tmp",
    "940g a .tmp in the desk's own place, and a file at the root of its mirror, which is the lead's place, are never sealed or sent: uploads by"
    + " the desk " + deskUploads + " (its one request), the word " + tmpWord.reason);
  const echoSame = desk.prog.considerOutgoing("guide.ec", Buffer.from(EDITION.replace("one", "three")));
  const echoMoved = desk.prog.considerOutgoing("guide.ec", Buffer.from("a local change"));
  const leadOwn = idsBy(LEAD.keyId).length;
  put(desk.mirror, "guide.ec", read(desk.mirror, "guide.ec"));
  await settle(desk);
  check(echoSame.send === false && echoSame.reason === "echo" && echoMoved.send === true && idsBy(DESK.keyId).length === 1 && idsBy(LEAD.keyId).length === leadOwn,
    "940h a file the layer wrote from a download is an echo and is not sent back, while other bytes under its name are a change: "
    + echoSame.reason + " / " + (echoMoved.send ? "send" : echoMoved.reason) + ", desk uploads after rewriting it " + idsBy(DESK.keyId).length);

  /* ---- what a hostile relay or a colleague sends wrong is dropped and said, never written ---- */
  const leadBlobs = idsBy(LEAD.keyId).filter(r => !r.del);
  const genuine = recordOf(leadBlobs[leadBlobs.length - 1].id);
  const saidBefore = desk.said.length;
  const forgedCt = Buffer.from(genuine.ct); forgedCt[forgedCt.length - 1] ^= 1;
  const forgedId = hex(16), movedId = hex(16);
  inject(Object.assign({}, genuine.rec, { id: forgedId, supersedes: null }), forgedCt);
  inject(Object.assign({}, genuine.rec, { id: movedId, supersedes: null }), genuine.ct);
  const sealOther = (p, counter, kind) => B.seal({ relayTeamId: RT, epoch: 1, teamKey: K1, writer: { keyId: OTHER.keyId, privateKey: OTHER.privateKey },
    path: p, body: kind === "delete" ? "" : "from a colleague", counter, place: "desk:" + OTHER.keyId, kind: kind || "file" });
  const metaOf = b => ({ v: 1, id: b.id, supersedes: b.supersedes, epoch: b.epoch, writer: b.writerKeyId, counter: b.counter, del: b.deletion,
    sig: b.signature, nonce: b.nonce, place: b.place });
  const putAs = async (prog, b) => {
    const s = await prog.t.request("POST", URLV1 + "/t/" + RT + "/hello", {}, Buffer.from("{}"));
    const ch = JSON.parse(s.bytes.toString()).challenge;
    const who = prog === other ? OTHER : STRAY;
    const ses = await prog.t.request("POST", URLV1 + "/t/" + RT + "/session", { "content-type": "application/json" },
      Buffer.from(JSON.stringify({ challenge: ch, key: who.keyId, sig: signHex(who, C.helloBytes(RT, ch, who.keyId)) })));
    const token = JSON.parse(ses.bytes.toString()).session;
    const r = await prog.t.request("PUT", URLV1 + "/t/" + RT + "/b/" + b.id,
      { authorization: "Bearer " + token, "etiuda-blob": Buffer.from(JSON.stringify(metaOf(b))).toString("base64url") }, b.ciphertext);
    return r.status;
  };
  const c0 = Date.now();
  const misplaced = await putAs(other, sealOther("guide.ec", c0 + 1));
  const hostile = await putAs(other, sealOther("desks/" + OTHER.keyId + "/../../evil.ec", c0 + 2));
  const drive = await putAs(other, sealOther("C:/evil.ec", c0 + 3));
  const forgedDelete = await putAs(other, sealOther("guide.ec", c0 + 4, "delete"));
  await settle(desk);
  const words = desk.said.slice(saidBefore);
  const sayingOf = reason => words.filter(l => l.indexOf(B.REASONS[reason]) >= 0).length;
  check([misplaced, hostile, drive, forgedDelete].every(s => s === 200) && sayingOf("bad-signature") >= 2 && sayingOf("outside-place") >= 1
    && sayingOf("bad-path") >= 2 && sayingOf("forged-delete") >= 1 && read(desk.mirror, "guide.ec") === EDITION.replace("one", "three")
    && read(path.dirname(desk.mirror), "evil.ec") === null && !fs.existsSync(path.join(desk.mirror, "C:")),
    "940i a forged and a re-addressed blob (a hostile relay's), a colleague's file at the root, a path climbing out of the mirror, a drive path and"
    + " a colleague's deletion of the lead's edition are each dropped and said, and the mirror is as it was: said bad-signature " + sayingOf("bad-signature")
    + ", outside-place " + sayingOf("outside-place") + ", bad-path " + sayingOf("bad-path") + ", forged-delete " + sayingOf("forged-delete"));

  /* A genuine edition served again under a new id. */
  const replaySaid = desk.said.length;
  inject(Object.assign({}, genuine.rec, { id: hex(16), supersedes: null, counter: genuine.rec.counter }), genuine.ct);
  await settle(desk);
  check(desk.said.slice(replaySaid).some(l => l.indexOf(B.REASONS["bad-signature"]) >= 0 || l.indexOf(B.REASONS["replay-counter"]) >= 0)
    && read(desk.mirror, "guide.ec") === EDITION.replace("one", "three"),
    "940j a genuine edition served again under a new id is refused: the id is under its signature, so a move never opens");

  /* A replay the signature does hold: the lead's edition at its own id, served again after the desk took a newer one. */
  const stash = recordOf(genuine.rec.id);
  put(lead.mirror, "guide.ec", EDITION.replace("one", "four"));
  await settle(lead);
  await settle(desk);
  const replayed = desk.said.length;
  store().del("tomb:" + stash.rec.id);
  inject(Object.assign({}, stash.rec), stash.ct);
  await settle(desk);
  check(desk.said.slice(replayed).some(l => l.indexOf(B.REASONS["replay-counter"]) >= 0) && read(desk.mirror, "guide.ec") === EDITION.replace("one", "four"),
    "940k an older genuine edition the relay serves again is refused by the writer's counter, and the newer stays: "
    + (read(desk.mirror, "guide.ec") === EDITION.replace("one", "four") ? "newer kept" : "older written"));

  /* The floors survive a restart: the same replay after the layer is made again from its record. */
  await desk.ch.stop();
  const desk2 = program("desk", DESK, "desk:" + DESK.keyId);
  desk2.ch.start();
  await settle(desk2);
  const afterRestart = desk2.said.length;
  inject(Object.assign({}, stash.rec, { seq: 0 }), stash.ct);
  await settle(desk2);
  check(desk2.said.slice(afterRestart).some(l => l.indexOf(B.REASONS["replay-counter"]) >= 0) && read(desk2.mirror, "guide.ec") === EDITION.replace("one", "four"),
    "940l after a restart the counter floor kept in the layer's record refuses the same replay, and the newer edition stays");

  /* E2: a key the relay enrolled that the signed roster does not carry writes nothing here. */
  await enrol(STRAY);
  const stray = program("stray", STRAY, "desk:" + STRAY.keyId, { watch: false });
  put(stray.mirror, "desks/" + STRAY.keyId + "/in-use.ec", "a stranger's file\n");
  stray.ch.start();
  await settle(stray);
  const strayUp = idsBy(STRAY.keyId).length;
  const strayed = desk2.said.length;
  /* The roster with the stranger added and the lead's old signature, put into the mirror where the program reads its team. */
  const genuineTeam = read(desk2.mirror, C.TEAM_NAME);
  const tampered = JSON.parse(genuineTeam);
  tampered.roster = tampered.roster.concat([member(STRAY)]);
  fs.writeFileSync(path.join(desk2.mirror, C.TEAM_NAME), JSON.stringify(tampered));
  await settle(desk2);
  fs.writeFileSync(path.join(desk2.mirror, C.TEAM_NAME), genuineTeam);
  check(strayUp === 1 && desk2.said.slice(strayed).some(l => l.indexOf(B.REASONS["not-roster"]) >= 0) && read(desk2.mirror, "desks/" + STRAY.keyId + "/in-use.ec") === null,
    "940m a key the relay enrolled, and a roster that names it under the lead's old signature, are not believed: its file is dropped as not"
    + " on the signed roster (E2)");
  await stray.ch.stop();

  /* A colleague's blob naming the lead's edition as the chain it replaces, put in by a hostile relay, is refused. */
  const edition = recordOf(idsBy(LEAD.keyId).filter(r => !r.del).sort((a, b) => b.seq - a.seq)[0].id);
  const chained = B.seal({ relayTeamId: RT, epoch: 1, teamKey: K1, writer: { keyId: OTHER.keyId, privateKey: OTHER.privateKey },
    path: "desks/" + OTHER.keyId + "/in-use.ec", body: "replacing the lead's edition", counter: Date.now() + 5000, place: "desk:" + OTHER.keyId,
    kind: "file", supersedes: edition.rec.id });
  const chainedFrom = desk2.said.length;
  inject({ id: chained.id, supersedes: chained.supersedes, epoch: 1, writer: OTHER.keyId, counter: chained.counter, del: false, sig: chained.signature,
    nonce: chained.nonce }, chained.ciphertext);
  await settle(desk2);
  check(desk2.said.slice(chainedFrom).some(l => l.indexOf(B.REASONS["outside-place"]) >= 0)
    && read(desk2.mirror, "desks/" + OTHER.keyId + "/in-use.ec") !== "replacing the lead's edition",
    "940r a colleague's blob that names the lead's edition as the chain it replaces is refused as outside its place");

  /* Deletions: the writer's signed record removes the file; a blob the relay stops serving deletes nothing. */
  put(lead.mirror, "notes.ec", "a note the lead keeps\n");
  await settle(lead);
  await settle(desk2);
  const hadNotes = read(desk2.mirror, "notes.ec") === "a note the lead keeps\n";
  const notesId = entries().filter(([k, v]) => k.startsWith("blob:") && v.writer === LEAD.keyId && !v.del).map(([, v]) => v).sort((a, b) => b.seq - a.seq)[0].id;
  const s = store(), notesRec = s.get("blob:" + notesId);
  s.del("blob:" + notesId); s.del("seq:" + String(notesRec.seq).padStart(16, "0"));
  put(lead.mirror, "other.ec", "something else\n");
  await settle(lead);
  await settle(desk2);
  const keptWhenWithheld = read(desk2.mirror, "notes.ec") === "a note the lead keeps\n";
  check(hadNotes && keptWhenWithheld, "940n a file the relay stops serving stays in the mirror: nothing is deleted but by a signed record (E3)");
  fs.unlinkSync(path.join(lead.mirror, "guide.ec"));
  await settle(lead);
  await settle(desk2);
  check(read(desk2.mirror, "guide.ec") === null && idsBy(LEAD.keyId).some(r => r.del),
    "940o the lead's signed deletion record removes the file from the desk's mirror, and the relay keeps the record");

  /* Limits are the program's too: a listed blob over 50 MB is not fetched. */
  const big = recordOf(idsBy(LEAD.keyId).filter(r => !r.del)[0].id);
  const bigId = hex(16);
  inject(Object.assign({}, big.rec, { id: bigId }), big.ct);
  store().put("blob:" + bigId, Object.assign({}, store().get("blob:" + bigId), { size: B.BLOB_MAX + 1 }));
  const bigFrom = desk2.t.log.length;
  await settle(desk2);
  check(!desk2.t.log.slice(bigFrom).some(l => l.indexOf(bigId) >= 0) && desk2.said.some(l => l.indexOf(B.REASONS["blob-size"]) >= 0),
    "940p a blob the relay lists at more than 50 MB is not fetched, and is said (E6)");

  /* The watch: on this platform recursive; one watch per folder where recursion is missing, a new folder watched too. */
  const each = program("each", OTHER, "desk:" + OTHER.keyId, { watch: "each", stateFile: path.join(LAB, "each.json") });
  each.ch.start();
  await settle(each);
  const eachBefore = idsBy(OTHER.keyId).length;
  put(each.mirror, "desks/" + OTHER.keyId + "/deep/stats.estat", "{\"counted\":3}\n");
  const eachSent = await until(() => idsBy(OTHER.keyId).length > eachBefore, 6000);
  check(desk2.ch.watchMode() === (process.platform === "linux" && Number(process.versions.node.split(".")[0]) < 20 ? "each" : "recursive")
    && each.ch.watchMode() === "each" && eachSent,
    "940q the mirror's watch is " + desk2.ch.watchMode() + " here (node " + process.versions.node + "), and with one watch per folder a file in a new"
    + " folder is still sent with no ask: " + (eachSent ? "sent" : "not sent"));
  await each.ch.stop();

  /* ---- the joining bootstrap: the invitation's own place ---- */
  const SECRET = hex(16), INV = hex(16), TOKEN = hex(32), KI = C.inviteSealKey(SECRET);
  await invites([{ id: INV, hash: sha(Buffer.from(TOKEN, "utf8")) }], []);
  const liveInvites = [{ id: INV, key: KI }];
  await lead.ch.stop();
  const lead2 = program("lead", LEAD, "root", { inviteKeys: () => liveInvites });
  lead2.ch.start();
  await settle(lead2);
  const copies = entries().filter(([k, v]) => k.startsWith("blob:") && v.place === "invite:" + INV);
  const joinerSaid = [];
  const joiner = program("joiner", NEWD, "desk:" + NEWD.keyId, { keyFor: () => null, sealEpoch: () => null,
    invite: () => ({ inv: INV, token: TOKEN, seal: KI }), say: l => joinerSaid.push(l) });
  put(joiner.mirror, "desks/" + NEWD.keyId + "/join.json", "{\"kind\":\"etiuda-join\",\"note\":\"invited\"}\n");
  joiner.ch.start();
  await settle(joiner);
  await settle(lead2);
  check(copies.length === 1 && read(joiner.mirror, C.TEAM_NAME) === read(lead2.mirror, C.TEAM_NAME) && read(joiner.mirror, "other.ec") === null
    && read(lead2.mirror, "desks/" + NEWD.keyId + "/join.json") === "{\"kind\":\"etiuda-join\",\"note\":\"invited\"}\n",
    "941a a desk holding the invitation reads the team file the lead sealed under that invitation's key, and its one request reaches the lead's"
    + " mirror, before it holds the team key: copies in the invitation's place " + copies.length + ", its request "
    + (read(lead2.mirror, "desks/" + NEWD.keyId + "/join.json") ? "in the lead's mirror" : "missing"));
  const quiet = desk2.said.length;
  await settle(desk2);
  check(desk2.said.slice(quiet).length === 0 && desk2.prog.state().pending.length === 0,
    "941b a desk not joining by that invitation passes over its place and says nothing: lines " + desk2.said.slice(quiet).length);

  /* A forged copy under the invitation's key, not signed by the pinned lead. */
  const forgedTeam = signDoc(JSON.parse(teamText(9, [member(NEWD)])), INTR);
  const fake = B.seal({ relayTeamId: RT, epoch: 1, teamKey: KI, writer: { keyId: LEAD.keyId, privateKey: INTR.privateKey },
    path: C.TEAM_NAME, body: JSON.stringify(forgedTeam), counter: Date.now() + 1e6, kind: "file" });
  inject({ id: fake.id, supersedes: null, epoch: 1, writer: LEAD.keyId, counter: fake.counter, del: false, sig: fake.signature, nonce: fake.nonce,
    place: "invite:" + INV, pub: INTR.pub }, fake.ciphertext);
  const forgedFrom = joinerSaid.length;
  const teamBefore = read(joiner.mirror, C.TEAM_NAME);
  await settle(joiner);
  check(joinerSaid.slice(forgedFrom).some(l => l.indexOf(B.REASONS["bad-signature"]) >= 0) && read(joiner.mirror, C.TEAM_NAME) === teamBefore,
    "941c a copy in the invitation's place sealed under its key but not signed by the pinned lead is refused and said, the team file as it was");

  /* Admitted: the lead adds the desk to the roster and enrols its key; the copy in the invitation's place follows. The desk,
     holding the team key once the roster names it, takes what waited for that key. */
  put(lead2.mirror, C.TEAM_NAME, teamText(2, [member(DESK), member(OTHER), member(NEWD)]));
  await enrol(NEWD);
  await settle(lead2);
  let admitted = false;
  await joiner.ch.stop();
  const joined = program("joiner", NEWD, "desk:" + NEWD.keyId, { keyFor: e => (admitted && e === 1 ? K1 : null), sealEpoch: () => (admitted ? 1 : null),
    invite: () => ({ inv: INV, token: TOKEN, seal: KI }),
    onTeam: () => { admitted = (read(path.join(LAB, "joiner"), C.TEAM_NAME) || "").indexOf(NEWD.keyId) >= 0; } });
  joined.ch.start();
  await settle(joined);
  check(admitted && read(joined.mirror, "other.ec") === "something else\n" && joined.prog.state().pending.length === 0,
    "941d the admitted desk reads the team file that names it, holds the team key, and takes the editions that waited for it, each against"
    + " the floor it met when it first arrived: " + (read(joined.mirror, "other.ec") ? "taken" : "still waiting") + ", pending " + joined.prog.state().pending.length);
  await joined.ch.stop();

  /* The invitation let go once the desk holds the key: its copy superseded by the lead's signed deletion. */
  const lastCopy = lead2.prog.state().sentInv[INV][C.TEAM_NAME].id;
  const servedBefore = !!store().get("blob:" + lastCopy);
  liveInvites.length = 0;
  await settle(lead2);
  const copyNow = store().get("blob:" + lastCopy);
  const deletion = entries().filter(([k, v]) => k.startsWith("blob:") && v.place === "invite:" + INV && v.del && v.supersedes === lastCopy);
  check(servedBefore && !copyNow && deletion.length === 1, "941e the invitation let go, the lead supersedes its copy with a signed deletion: copy "
    + (copyNow ? "still served" : "no longer served") + ", deletion records " + deletion.length);
  await desk2.ch.stop(); await other.ch.stop(); await lead2.ch.stop();
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

/* ---- the desk's half: shell/main.js loaded in bare node, its relay reached through the same in-memory relay ---- */
try {
  if (!W) throw new Error("no relay to drive");
  const APP = path.join(LAB, "app");
  fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
  const SRC = fs.readFileSync(path.join(APP, "shell", "main.js"), "utf8");
  const EXPOSE = ["sealCatalog", "wrapTeamKey", "readCatalog", "catalogFolder", "relayRun", "relayHere", "heedTeam"];
  const noop = () => {};
  const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
  const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
  const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });
  let deskTransport = transport("main");
  globalThis.WebSocket = class {
    constructor(url, opts) {
      this.readyState = 1;
      this.h = deskTransport.connect(url, (opts && opts.headers) || {}, {
        message: m => { if (this.onmessage) this.onmessage({ data: m }); },
        close: () => { this.readyState = 3; if (this.onclose) this.onclose(); },
      });
      if (!this.h) setImmediate(() => { this.readyState = 3; if (this.onclose) this.onclose(); });
    }
    send() {}
    close() { if (this.h) this.h.close(); }
  };
  function loadDesk(ud) {
    const said = [], on = {}, invoke = {};
    const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop, info: noop };
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
      decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
    };
    const net = { fetch: (url, init) => { deskTransport.log.push(init.method + " " + url); if (deskTransport.down) return Promise.reject(new Error("down")); return relayFetch(url, init); } };
    const electron = {
      app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
        getVersion: () => "0.0.0", whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
      ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
      BrowserWindow: inert, Menu: inert, dialog: inert, net, protocol: inert, session: inert, shell: inert,
      screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage, powerMonitor: inert,
    };
    process.env.XDG_CURRENT_DESKTOP = "GNOME";
    const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
      SRC + "\nreturn { " + EXPOSE.join(", ") + " };")(
      n => (n === "electron" ? electron : nodeRequire(n)),
      path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
    const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
    const sync = (ch, ...args) => { const ev = eventFor(); if (on[ch]) on[ch](ev, ...args); return ev.returnValue; };
    const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
    return { api, ask, sync, said, ud, envelope };
  }
  const newDesk = (name, folder) => {
    const ud = path.join(LAB, name);
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: folder, eUiLang: "en" } }), "utf8");
    return loadDesk(ud);
  };
  const V2 = await import(pathToFileURL(path.join(ROOT, "src", "modules", "catalog-v2.js")).href);
  const catalogText = (rev, key) => {
    const o = { format: 2, kind: "etiuda-catalog", id: "quay-board", rev, name: "Quay Board", date: "2026-03-0" + rev,
      langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
      cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" }, body: { en: "Good day, edition " + rev + "." } }] };
    o.sig = { alg: "Ed25519", keyId: LEAD.keyId };
    o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), (key || LEAD).privateKey).toString("hex");
    return JSON.stringify(o, null, 1) + "\n";
  };
  const factsOf = text => { try { return JSON.parse(text).rev; } catch { return null; } };

  /* A second team on the relay, for the desk joining by invitation. */
  const RT2 = hex(16), TEAM2 = "t-" + hex(8), K2 = crypto.randomBytes(32);
  const made = await admin("POST", "/relay/v1/teams", { rt: RT2, lead: { keyId: LEAD.keyId, pub: LEAD.pub }, t: R.clock.now,
    sig: signHex(LEAD, core.createBytes(RT2, LEAD.keyId, R.clock.now)) });
  if (made.status !== 200) throw new Error("the second team was not made");
  const SECRET = hex(16), INV = hex(16), TOKEN = hex(32), KI = C.inviteSealKey(SECRET);
  const t0 = R.clock.now;
  await admin("POST", "/relay/v1/t/" + RT2 + "/invites", { add: [{ id: INV, hash: sha(Buffer.from(TOKEN, "utf8")) }], drop: [], t: t0,
    sig: signHex(LEAD, core.invitesBytes(RT2, t0, [{ id: INV, hash: sha(Buffer.from(TOKEN, "utf8")) }], [])) });
  const URL2 = URLV1;
  const PIN2 = { teamId: TEAM2, rt: RT2, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
  const team2 = (rev, roster) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: TEAM2, catalogs: ["quay-board"],
    lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev,
    channel: { kind: "relay", rt: RT2, url: URL2 }, ring: RING, roster }, LEAD), null, 1) + "\n";
  const liveInvites = [{ id: INV, key: KI }];
  const studioT = transport("studio");
  const studioMirror = path.join(LAB, "studio-mirror");
  const studio = C.createChannel({ rt: RT2, url: URL2, mirror: studioMirror, stateFile: path.join(LAB, "studio.json"), pin: () => PIN2,
    me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }), keyFor: e => (e === 1 ? K2 : null),
    sealEpoch: () => 1, inviteKeys: () => liveInvites, request: studioT.request, connect: studioT.connect, pollMs: 1e9 });
  const D = newDesk("main-desk", path.join(LAB, "main-share"));
  fs.mkdirSync(path.join(LAB, "main-share"), { recursive: true });
  const SEALED = D.api.sealCatalog(K2, TEAM2, 1, catalogText(1));
  put(studioMirror, "board.ec", JSON.stringify(SEALED));
  put(studioMirror, C.TEAM_NAME, team2(1, []));
  studio.start();
  await studio.idle();
  const inviteText = "etiuda-join:" + Buffer.from(JSON.stringify({ team: TEAM2, relay: { rt: RT2, url: URL2, token: TOKEN, inv: INV },
    lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret: SECRET }), "utf8").toString("base64url");
  const codeOf = () => {
    const mac = crypto.createHmac("sha256", Buffer.from(SECRET, "hex")).update(Buffer.from(LEAD.pub, "hex")).digest();
    return String(mac.readUIntBE(0, 6) % 100000).padStart(5, "0");
  };
  const offer = await D.ask("etiuda:team-join", "read", inviteText);
  const taken = await D.ask("etiuda:team-join", "invite", inviteText, "Desk Nine", codeOf());
  const mirror = path.join(D.ud, "relay", RT2);
  const folderNow = D.api.catalogFolder();
  const me = await D.ask("etiuda:branch-identity", false);
  const joinRel = "desks/" + me.id + "/join.json";
  const sent = await until(async () => { await studio.kick(); await studio.idle(); return !!read(studioMirror, joinRel); }, 6000);
  check(!!offer && offer.offer && offer.offer.relay === "relay.test" && !taken.refused && folderNow === mirror && sent
    && read(mirror, C.TEAM_NAME) === read(studioMirror, C.TEAM_NAME),
    "942a a desk takes a relay invitation: its team folder is the mirror, it reads the team file sealed for that invitation, and its"
    + " request reaches the lead's mirror as its one invitation upload: folder " + (folderNow === mirror ? "the mirror" : folderNow)
    + ", request " + (sent ? "at the lead" : "missing") + (taken.refused ? ", refused " + taken.refused : ""));

  /* The lead admits it: the roster with its wrap, the device enrolled, the invitation let go. */
  const entry = { desk: { id: me.id, key: me.key, box: me.box }, wrap: D.api.wrapTeamKey(K2, me.box, TEAM2, 1, me.id) };
  put(studioMirror, C.TEAM_NAME, team2(2, [entry]));
  const t1 = R.clock.now, keys2 = [{ id: me.id, pub: me.key, desk: me.id }];
  await admin("POST", "/relay/v1/t/" + RT2 + "/devices", { keys: keys2, rev: 1, t: t1, sig: signHex(LEAD, core.devicesBytes(RT2, 1, t1, keys2)) });
  await studio.kick(); await studio.idle();
  liveInvites.length = 0;
  const loaded = await until(async () => {
    const ch = D.api.relayRun();
    if (ch) { ch.kick(); await ch.idle(); }
    return factsOf(D.sync("etiuda:catalog") || "") === 1;
  }, 8000);
  check(loaded && JSON.stringify((D.envelope().teamPinFrom || {})[TEAM2]) === "\"invite\"",
    "942b admitted, the desk reads its team on the relay, keeps the team key from its wrap and loads the edition the lead put in Studio's"
    + " mirror: " + (loaded ? "edition 1 loaded" : "not loaded") + ", the pin from " + JSON.stringify((D.envelope().teamPinFrom || {})[TEAM2]));
  await D.ask("etiuda:team-join", "view");
  const gone = await until(async () => { const ch = D.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); } await studio.kick(); await studio.idle();
    return read(studioMirror, joinRel) === null; }, 8000);
  check(gone, "942c the desk's request, removed once it is admitted, goes from the lead's mirror by its signed deletion: " + (gone ? "removed" : "still there"));

  /* Offline: the desk keeps working on its mirror, then catches up. */
  deskTransport.down = true;
  put(studioMirror, "board.ec", JSON.stringify(D.api.sealCatalog(K2, TEAM2, 1, catalogText(2))));
  await studio.kick(); await studio.idle();
  const ch1 = D.api.relayRun(); if (ch1) { ch1.kick(); await ch1.idle(); }
  /* The page's next read, as the mirror's watch would prompt it in the app. */
  const whileDown = factsOf(D.api.readCatalog() || "");
  deskTransport.down = false;
  const caught = await until(async () => { const ch = D.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); } return factsOf(D.api.readCatalog() || "") === 2; }, 8000);
  check(whileDown === 1 && caught, "942d after being offline the desk loads the edition published meanwhile, having worked on its mirror: while down "
    + whileDown + ", then " + (caught ? 2 : "not caught up: the mirror's edition " + (read(mirror, "board.ec") === read(studioMirror, "board.ec")
      ? "is the lead's" : "is not the lead's") + ", the desk read " + factsOf(D.api.readCatalog() || "") + "; "
      + D.said.filter(l => l.indexOf("relay") >= 0).slice(-3).join(" / ")));
  const stopped = D.api.relayRun();
  if (stopped) await stopped.stop();
  await studio.stop();

  /* Board 907: a lead pinned by its own file's vouching is never followed to a relay address. */
  const EVIL = "https://evil.test/relay/v1";
  const share = path.join(LAB, "self-share");
  fs.mkdirSync(share, { recursive: true });
  const E = newDesk("self-desk", share);
  const eme = await E.ask("etiuda:branch-identity", true);
  const KE = crypto.randomBytes(32), TEAM3 = "t-" + hex(8), RT3 = hex(16);
  const selfTeam = (roster, ring) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: TEAM3, catalogs: ["quay-board"],
    lead: { keyId: INTR.keyId, public: INTR.pub }, sealed: true, exportsSealed: false, epoch: 1, rev: 1,
    channel: { kind: "relay", rt: RT3, url: EVIL }, ring, roster }, INTR), null, 1) + "\n";
  const intrRing = { format: 1, kind: "etiuda-ring", keys: [{ catalog: "quay-board", keyId: INTR.keyId, alg: "Ed25519", public: INTR.pub }] };
  fs.writeFileSync(path.join(share, C.TEAM_NAME), selfTeam([], intrRing));
  E.api.heedTeam();
  const ringPinned = !!(E.envelope().teamPins || {})[TEAM3];
  fs.writeFileSync(path.join(share, C.TEAM_NAME), selfTeam([{ desk: { id: eme.id, key: eme.key, box: eme.box }, wrap: E.api.wrapTeamKey(KE, eme.box, TEAM3, 1, eme.id) }], intrRing));
  fs.utimesSync(path.join(share, C.TEAM_NAME), Date.now() / 1000 + 5, Date.now() / 1000 + 5);
  E.api.heedTeam();
  const wrapPinned = !!(E.envelope().teamPins || {})[TEAM3];
  const runE = E.api.relayRun();
  await wait(300);
  check(!ringPinned && wrapPinned && E.api.catalogFolder() === share && !runE && foreign.length === 0
    && E.said.some(l => l.indexOf("does not follow that address") >= 0),
    "942e board 907: a relay file's own ring pins nobody (900i inverted), and a lead pinned by a key it wrapped for this desk, as on a"
    + " folder, is never followed to the relay address it names: ring " + (ringPinned ? "pinned" : "no pin") + ", wrap " + (wrapPinned ? "pinned" : "no pin")
    + ", folder " + (E.api.catalogFolder() === share ? "the share" : E.api.catalogFolder()) + ", calls to the named address " + foreign.length);
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

check(regStand.held(), "942f every reg call was answered by the stand-in (" + regStand.said() + ")");
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
