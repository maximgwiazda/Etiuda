/* The relay's channel layer, shell/relay/channel.cjs, driven against the relay as built (relay/worker.mjs over
 * relay/test/stand-ins.cjs, in memory) with its mirrors in a scratch folder, and the desk's half in shell/main.js loaded
 * in bare node: a lead's files reach a desk's mirror whole, live and after the desk was offline, in the catch-up's order;
 * the desk's own file goes back after the catch-up; every forged, replayed, re-addressed, misplaced or hostile-path blob
 * is dropped and said and never written; a deletion lands only as its writer's signed record; the floors survive a
 * restart; a .tmp and an echo are never sent; nothing private reaches the relay in the clear; the joining bootstrap
 * (a request and a team file sealed under the invitation's own key, in a place of its own) serves the invited desk and
 * nobody else; a relay address is followed only where an invitation pinned the lead (board 907), a relay file's own
 * ring pinning nobody (900i inverted); and an epoch move (F1): every remaining desk, live or offline, reaches the new epoch
 * by its own copy of the team file, and the desk taken off opens nothing of it. Once that move is loaded, a new file the
 * dropped desk seals at the old epoch under the old team file is refused removed, through acceptBlob and through the
 * catch-up, and the kept desk's file at the new epoch is taken (944q, 944r); lifting that check accepts the old-epoch
 * file again (944s). A desk file is counted under the roster row for the key that signed it (944t); lifting that
 * check counts the place the blob carries (944u). A later rev of one epoch that leaves a desk off refuses its next
 * file removed, and a key never named stays not-roster (944v); lifting that check leaves the file not-roster (944w).
 * A desk blob waits for a key only at an epoch a verified lead blob has named, and only while the newest roster still
 * names that key (951f, 951g); lifting that check lets a thousand blobs past that epoch fill pending (951h). On a
 * relay team the desk also reads the
 * head the lead's Studio writes (etiuda-head.json): a genuine one is shown with its newest edition, when that edition
 * was published and how old the head itself is, an old one is shown as old and blocks nothing, and a forged, older or
 * other team's head is dropped and said. A folder team shows nothing new. A catch-up passes over a blob as the program's
 * own only where its own record shows it sent that id: a lead restored to a fresh profile catches up its team file and the
 * rest (970a), two programs holding one key apply each other's uploads (970b), a recorded upload is not fetched (970c), and
 * an own blob that is fetched does not overwrite an edit waiting to go up (970d, 970e) and, older than the last sent,
 * changes nothing (970f). Throwaway keys and invented words only;
 * nothing contacts a host.
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
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
/* Machine policy is none, but for 942h, which names a folder for the one desk it loads. */
const regOpts = { policy: null };
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"), regOpts);
const EXPECTED = 214;

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

const productWrites = [];
const isInside = (dir, target) => {
  const rel = path.relative(dir, path.resolve(target));
  return !rel.startsWith("..") && !path.isAbsolute(rel);
};
function noteWrite(target) {
  if (typeof target !== "string") return;
  const resolved = path.resolve(target);
  const inRoot = isInside(ROOT, resolved);
  const inLab = isInside(LAB, resolved);
  const inTmp = !isInside(os.tmpdir(), ROOT) && isInside(os.tmpdir(), resolved);
  if (inRoot && !inLab && !inTmp) {
    productWrites.push(path.relative(ROOT, resolved).replace(/\\/g, "/"));
  }
}
const origWriteFileSync = fs.writeFileSync.bind(fs);
const origRenameSync = fs.renameSync.bind(fs);
const origCopyFileSync = fs.copyFileSync.bind(fs);
fs.writeFileSync = function (file, ...args) {
  noteWrite(file);
  return origWriteFileSync(file, ...args);
};
fs.renameSync = function (oldPath, newPath, ...args) {
  noteWrite(newPath);
  return origRenameSync(oldPath, newPath, ...args);
};
fs.copyFileSync = function (src, dest, ...args) {
  noteWrite(dest);
  return origCopyFileSync(src, dest, ...args);
};

function filesUnder(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...filesUnder(full));
    else if (ent.isFile()) out.push(full);
  }
  return out;
}
const trackedProductFiles = [
  ...filesUnder(path.join(ROOT, "shell", "relay")),
  path.join(ROOT, "shell", "main.js"),
  path.join(ROOT, "src", "modules", "settings.js"),
];
const initialDigests = new Map();
for (const f of trackedProductFiles) {
  initialDigests.set(path.relative(ROOT, f).replace(/\\/g, "/"), sha(fs.readFileSync(f)));
}
function loadPlantedChannel(code) {
  const dir = fs.mkdtempSync(path.join(LAB, "channel-plant-"));
  fs.writeFileSync(path.join(dir, "channel.cjs"), code, "utf8");
  fs.writeFileSync(path.join(dir, "blob.cjs"), "module.exports = require(" + JSON.stringify(path.join(ROOT, "shell", "relay", "blob.cjs")) + ");\n", "utf8");
  return nodeRequire(path.join(dir, "channel.cjs"));
}
function loadPlantedBlob(code) {
  const dir = fs.mkdtempSync(path.join(LAB, "blob-plant-"));
  fs.writeFileSync(path.join(dir, "blob.cjs"), code, "utf8");
  return nodeRequire(path.join(dir, "blob.cjs"));
}
function loadPlantedBlobChannel(code) {
  const dir = fs.mkdtempSync(path.join(LAB, "blob-channel-plant-"));
  fs.writeFileSync(path.join(dir, "blob.cjs"), code, "utf8");
  fs.copyFileSync(path.join(ROOT, "shell", "relay", "channel.cjs"), path.join(dir, "channel.cjs"));
  return nodeRequire(path.join(dir, "channel.cjs"));
}
async function loadPlantedSettings(code) {
  const dir = fs.mkdtempSync(path.join(LAB, "settings-plant-"));
  const modulesUrl = pathToFileURL(path.join(ROOT, "src", "modules")).href;
  const rewritten = code.replace(/from "\.\//g, 'from "' + modulesUrl + '/');
  const target = path.join(dir, "settings.js");
  fs.writeFileSync(target, rewritten, "utf8");
  return import(pathToFileURL(target).href);
}
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

let C = null, B = null, S = null, W = null, core = null, K = null;
try {
  C = nodeRequire(path.join(ROOT, "shell", "relay", "channel.cjs"));
  B = nodeRequire(path.join(ROOT, "shell", "relay", "blob.cjs"));
  core = nodeRequire(path.join(ROOT, "relay", "core.cjs"));
  S = nodeRequire(path.join(ROOT, "relay", "test", "stand-ins.cjs"));
  K = nodeRequire(path.join(ROOT, "relay", "test", "grant-kit.cjs"));
  W = (await import(pathToFileURL(path.join(ROOT, "relay", "worker.mjs")).href)).routeWith(K.ROOTS, env => env.NOW());
} catch (e) {
  console.log("  FAIL harness: the channel layer or the relay did not load - " + (e && e.message));
}

/* ---- the relay in memory, and each program's way to it -------------------------------------------------------- */
const R = S && K ? S.relayEnv({ roots: K.ROOTS }) : null;
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
/* The lead's key id comes from its key (its branch id), as the relay now requires of a create. */
const LEAD = keyPair(true);
/* A create's body for LEAD: the grant of the test root the relay here is built with, and the create-2 signature. */
const createBody = (rt, t) => K.createBody(rt, LEAD, t, bytes => signHex(LEAD, bytes));
const DESK = keyPair(true), OTHER = keyPair(true), STRAY = keyPair(true), NEWD = keyPair(true), INTR = keyPair(false, LEAD.keyId);
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
/* The head the lead's Studio writes, signed over the head prefix plus the same canonical bytes as a team file. */
const HEAD_FILE = "etiuda-head.json";
function signHead(doc, key) {
  const o = JSON.parse(JSON.stringify(doc));
  const k = key || LEAD;
  o.sig = { alg: "Ed25519", keyId: k.keyId };
  o.sig.value = signHex(k, Buffer.concat([Buffer.from(C.HEAD_PREFIX, "utf8"), C.signedBytes(o)]));
  return JSON.stringify(o) + "\n";
}
function headWith(team, t, editions, v) {
  return signHead({ v: v === undefined ? 1 : v, team: team, epoch: 1, rev: 1, editions: editions, t: t });
}
function headBody(team, t, edition, published) {
  return headWith(team, t, [{ catalog: "quay-board", rev: 1, edition: edition, published: published }]);
}
function dayStamp(ms) {
  const d = new Date(ms), p = v => String(v).padStart(2, "0");
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
const shownText = s => String(s).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
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
  const made = await admin("POST", "/relay/v1/teams", createBody(RT, R.clock.now));
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
  /* The desk's own watch, prompted by the files it just wrote, settles first, so nothing but the socket can bring the next. */
  await wait(700);
  await desk.ch.idle();
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

  /* E7 through the relay: an older team file the lead's program sends again is refused by the rev floor, the newer kept. */
  const rev1 = read(lead.mirror, C.TEAM_NAME);
  put(lead.mirror, C.TEAM_NAME, teamText(2, [member(DESK), member(OTHER)]));
  await settle(lead);
  await settle(desk2);
  const rev2 = read(desk2.mirror, C.TEAM_NAME);
  const revFrom = desk2.said.length;
  put(lead.mirror, C.TEAM_NAME, rev1);
  await settle(lead);
  await settle(desk2);
  check(rev2 && JSON.parse(rev2).rev === 2 && desk2.said.slice(revFrom).some(l => l.indexOf(B.REASONS["replay-rev"]) >= 0)
    && read(desk2.mirror, C.TEAM_NAME) === rev2,
    "940s an older team file the lead's program sends again, at the same epoch, is refused by the rev floor and the newer stays (E7)");

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

  /* After the one upload the desk fetches only the lead's answer, so a forged copy put in the invitation's place is not
     fetched and not said. The team file stays as the invitation's own copy left it. */
  const forgedTeam = signDoc(JSON.parse(teamText(9, [member(NEWD)])), INTR);
  const fake = B.seal({ relayTeamId: RT, epoch: 1, teamKey: KI, writer: { keyId: LEAD.keyId, privateKey: INTR.privateKey },
    path: C.TEAM_NAME, body: JSON.stringify(forgedTeam), counter: Date.now() + 1e6, kind: "file" });
  inject({ id: fake.id, supersedes: null, epoch: 1, writer: LEAD.keyId, counter: fake.counter, del: false, sig: fake.signature, nonce: fake.nonce,
    place: "invite:" + INV, pub: INTR.pub }, fake.ciphertext);
  const forgedFrom = joinerSaid.length;
  const forgedLog = joiner.t.log.length;
  const teamBefore = read(joiner.mirror, C.TEAM_NAME);
  await settle(joiner);
  const forgedSaid = joinerSaid.slice(forgedFrom);
  const forgedFetch = joiner.t.log.slice(forgedLog).some(l => l.indexOf(fake.id) >= 0);
  const forgedFault = forgedSaid.some(l => l.indexOf(B.REASONS["bad-signature"]) >= 0 || l.indexOf("not enrolled") >= 0);
  check(!forgedFetch && !forgedFault && read(joiner.mirror, C.TEAM_NAME) === teamBefore,
    "941c after the one upload a forged copy in the invitation's place is not fetched and not said, and the team file stays: "
    + (forgedFetch ? "fetched" : "not fetched") + ", said " + JSON.stringify(forgedSaid));

  /* An invited desk not yet on the roster: from it the lead opens its own request alone, at most 64 KB. Put in by a hostile
     relay, since the relay itself takes one invitation upload of at most 64 KB. */
  const joinNow = read(lead2.mirror, "desks/" + NEWD.keyId + "/join.json");
  const askedFrom = lead2.said.length;
  const asked = (p, body, counter) => {
    const b = B.seal({ relayTeamId: RT, epoch: 1, teamKey: KI, writer: { keyId: NEWD.keyId, privateKey: NEWD.privateKey }, path: p, body,
      counter, place: "desk:" + NEWD.keyId, kind: "file" });
    inject({ id: b.id, supersedes: null, epoch: 1, writer: NEWD.keyId, counter: b.counter, del: false, sig: b.signature, nonce: b.nonce,
      pub: NEWD.pub }, b.ciphertext);
  };
  asked("desks/" + NEWD.keyId + "/in-use.ec", "{\"inUse\":\"not yet on the roster\"}\n", Date.now() + 2000);
  asked("desks/" + NEWD.keyId + "/join.json", "{\"pad\":\"" + "x".repeat(70 * 1024) + "\"}\n", Date.now() + 3000);
  await settle(lead2);
  const askedRefused = lead2.said.slice(askedFrom).filter(l => l.indexOf(B.REASONS["outside-place"]) >= 0).length;
  check(askedRefused >= 2 && read(lead2.mirror, "desks/" + NEWD.keyId + "/in-use.ec") === null
    && read(lead2.mirror, "desks/" + NEWD.keyId + "/join.json") === joinNow,
    "941f a desk invited and not yet on the roster has only its own request, at most 64 KB, opened by the lead: another file of its"
    + " place and a request over 64 KB, sealed under the invitation's key, are each dropped as outside-place: said " + askedRefused);

  /* Admitted: the lead adds the desk to the roster and enrols its key; the copy in the invitation's place follows. The desk,
     holding the team key once the roster names it, takes what waited for that key. */
  put(lead2.mirror, C.TEAM_NAME, teamText(3, [member(DESK), member(OTHER), member(NEWD)]));
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
  /* N4: a joining desk whose connection drops on its first PUT, its request, after the token's one session (950a), or which quits
     right then and runs again (950b), sends the request by itself without a new invitation: one token session in all, one upload
     at the relay, the invitation spent and marked uploaded, no failed try. */
  for (const quits of [false, true]) {
    const SEC9 = hex(16), INV9 = hex(16), TOK9 = hex(32), KI9 = C.inviteSealKey(SEC9);
    await invites([{ id: INV9, hash: sha(Buffer.from(TOK9, "utf8")) }], []);
    liveInvites.push({ id: INV9, key: KI9 });
    await settle(lead2);
    const J9 = keyPair(true), name9 = "joiner-n4-" + (quits ? "quit" : "drop");
    const rel9 = "desks/" + J9.keyId + "/join.json", body9 = "{\"kind\":\"etiuda-join\",\"note\":\"" + name9 + "\"}\n";
    const t9 = transport(name9);
    let puts = 0, tokenHellos = 0;
    const request = async (method, url, headers, body) => {
      if (method === "POST" && /\/session$/.test(String(url))) {
        try { if (JSON.parse(Buffer.from(body).toString("utf8")).invite !== undefined) tokenHellos++; } catch { /* not JSON */ }
      }
      if (method === "PUT" && ++puts === 1) throw new Error("the connection dropped");
      return t9.request(method, url, headers, body);
    };
    const opts9 = { keyFor: () => null, sealEpoch: () => null, invite: () => ({ inv: INV9, token: TOK9, seal: KI9 }), request, connect: t9.connect };
    let j9 = program(name9, J9, "desk:" + J9.keyId, opts9);
    put(j9.mirror, rel9, body9);
    j9.ch.start();
    await until(async () => { j9.ch.kick(); await j9.ch.idle(); return puts >= 1; }, 6000);
    const strandedFirst = read(lead2.mirror, rel9) === null;
    if (quits) {
      await j9.ch.stop();
      j9 = program(name9, J9, "desk:" + J9.keyId, opts9);
      j9.ch.start();
    }
    const atLead = await until(async () => { await settle(j9); await settle(lead2); return read(lead2.mirror, rel9) === body9; }, 8000);
    const rec = store().get("inv:" + INV9) || {};
    const uploads = entries().filter(([k, v]) => k.startsWith("blob:") && v.writer === J9.keyId).length;
    const used = j9.prog.state().tokenUsed === true;
    await j9.ch.stop();
    check(strandedFirst && atLead && puts >= 2 && tokenHellos === 1 && rec.spent === true && rec.uploaded === true && rec.fails === 0
      && uploads === 1 && used,
      (quits ? "950b" : "950a") + " a joining desk whose request was lost on its first PUT after the token's one session"
      + (quits ? ", and which quit then and ran again," : "") + " sends it by itself without a new invitation: request "
      + (atLead ? "at the lead" : "not at the lead") + ", PUTs " + puts + ", token sessions " + tokenHellos + ", uploads at the relay " + uploads
      + ", the invitation " + (rec.spent ? "spent" : "not spent") + (rec.uploaded ? " and uploaded" : "") + ", failed tries " + rec.fails
      + ", token used " + used + (strandedFirst ? "" : ", but the first PUT reached the lead"));
  }
  await desk2.ch.stop(); await other.ch.stop(); await lead2.ch.stop();
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

/* ---- an epoch move (F1 of the slice 1 review): every remaining desk reaches the new epoch by itself, live or offline,
   and the desk taken off opens nothing of it. The test architect's f1 reproduction is 944a, its control 944A. Each desk's
   shell is stood in for: its box an X25519 pair, its wrap of a team key sealed to that box here, and what heedTeam does
   (the key taken from its own wrap in the team file that landed) its onTeam. ---- */
const X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex");
function boxPair() {
  const p = crypto.generateKeyPairSync("x25519");
  return { pub: p.publicKey.export({ type: "spki", format: "der" }).subarray(X25519_SPKI.length).toString("hex"), priv: p.privateKey };
}
const agreeWith = box => peer => {
  try {
    return crypto.diffieHellman({ privateKey: box.priv,
      publicKey: crypto.createPublicKey({ key: Buffer.concat([X25519_SPKI, Buffer.from(String(peer), "hex")]), format: "der", type: "spki" }) });
  } catch { return null; }
};
const wrapInfo = (team, epoch, deskId) => Buffer.from("lab-wrap\n" + team + "\n" + epoch + "\n" + deskId, "utf8");
function wrapFor(key, boxPub, team, epoch, deskId) {
  const e = boxPair();
  const k = Buffer.from(crypto.hkdfSync("sha256", agreeWith(e)(boxPub), Buffer.alloc(0), wrapInfo(team, epoch, deskId), 32));
  const n = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", k, n);
  return { epoch, enc: e.pub, ct: n.toString("hex") + Buffer.concat([c.update(key), c.final(), c.getAuthTag()]).toString("hex") };
}
function unwrapWith(box, wrap, team, epoch, deskId) {
  try {
    if (!wrap || wrap.epoch !== epoch) return null;
    const k = Buffer.from(crypto.hkdfSync("sha256", agreeWith(box)(wrap.enc), Buffer.alloc(0), wrapInfo(team, epoch, deskId), 32));
    const raw = Buffer.from(wrap.ct, "hex"), d = crypto.createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(raw.length - 16));
    return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]);
  } catch { return null; }
}
try {
  if (!W) throw new Error("no relay to drive");
  const LB = boxPair();
  const makeTeam = async () => {
    const rt = hex(16);
    const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
    if (made.status !== 200) throw new Error("a team for the epoch move was not made: " + JSON.stringify(made.json));
    let rev = 0;
    return { rt, id: "t-" + hex(8), enrol: async (...keys) => {
      rev++;
      const list = keys.map(k => ({ id: k.keyId, pub: k.pub, desk: k.keyId })), t = R.clock.now;
      return admin("POST", "/relay/v1/t/" + rt + "/devices", { keys: list, rev, t, sig: signHex(LEAD, core.devicesBytes(rt, rev, t, list)) });
    } };
  };
  const teamDoc = (tm, epoch, rev, roster) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: tm.id, catalogs: ["lane-board"],
    lead: { keyId: LEAD.keyId, public: LEAD.pub, box: LB.pub }, sealed: true, exportsSealed: false, epoch, rev,
    channel: { kind: "relay", rt: tm.rt, url: URLV1 }, roster }, LEAD), null, 1) + "\n";
  const entry = (tm, d, key, epoch) => ({ desk: { id: d.k.keyId, key: d.k.pub, box: d.box.pub }, wrap: wrapFor(key, d.box.pub, tm.id, epoch, d.k.keyId) });
  const pinOf = tm => ({ teamId: tm.id, rt: tm.rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } });
  /* The lead: its keys held by epoch, sealing under the newest, its box's agreement lent, and every upload it makes kept
     here as a relay that kept everything would serve it. */
  function leadOf(tm, name, held, o) {
    const tl = transport(name), sent = [];
    const request = async (m, u, h, b) => {
      if (m === "PUT") sent.push({ meta: JSON.parse(Buffer.from(h["etiuda-blob"], "base64url").toString("utf8")), ct: Buffer.from(b) });
      return tl.request(m, u, h, b);
    };
    const p = program(name, LEAD, "root", Object.assign({ rt: tm.rt, pin: () => pinOf(tm), keyFor: e => held.get(e) || null,
      sealEpoch: () => Math.max(...held.keys()), agree: agreeWith(LB), request, connect: tl.connect }, o || {}));
    return Object.assign(p, { sent, held });
  }
  /* A desk: its keys held by epoch, its box, and its onTeam taking the key from its own wrap as heedTeam does. */
  function deskOf(tm, name, d, o) {
    const held = new Map(d.start || [[1, d.k1]]);
    const p = program(name, d.k, "desk:" + d.k.keyId, Object.assign({ rt: tm.rt, pin: () => pinOf(tm), watch: false,
      me: () => ({ keyId: d.k.keyId, public: d.k.pub, privateKey: d.k.privateKey, place: "desk:" + d.k.keyId, box: d.box.pub }),
      keyFor: e => held.get(e) || null, sealEpoch: () => Math.max(...held.keys()), agree: agreeWith(d.box),
      onTeam: () => heed(path.join(LAB, name), d, held, tm) }, o || {}));
    return Object.assign(p, { held });
  }
  function heed(mirror, d, held, tm) {
    let doc = null;
    try { doc = JSON.parse(read(mirror, C.TEAM_NAME)); } catch { return; }
    if (!doc || !Array.isArray(doc.roster)) return;
    const mine = doc.roster.find(r => r && r.desk && r.desk.id === d.k.keyId);
    const key = mine ? unwrapWith(d.box, mine.wrap, tm.id, doc.epoch, d.k.keyId) : null;
    if (key) held.set(doc.epoch, key);
  }
  const epochIn = dir => { try { return JSON.parse(read(dir, C.TEAM_NAME)).epoch; } catch { return null; } };
  const feedOf = (sent, from) => sent.slice(from).map((u, i) => ({ seq: 1e6 + i, meta: Object.assign({}, u.meta, { size: u.ct.length }), ct: u.ct }));
  const envOf = it => ({ id: it.meta.id, epoch: it.meta.epoch, supersedes: it.meta.supersedes, writerKeyId: it.meta.writer, counter: it.meta.counter,
    nonce: it.meta.nonce, signature: it.meta.sig, ciphertext: it.ct });
  const opensUnder = (tm, it, key) => B.openBlob({ blob: envOf(it), relayTeamId: tm.rt, epoch: it.meta.epoch, teamKey: key,
    trust: { lead: { keyId: LEAD.keyId, public: LEAD.pub }, desks: [] }, counters: {} }).ok;
  /* A desk's copy as the lead makes it; null on a tree without copies, so each leg there says red for itself. */
  const deskCopyOf = typeof C.deskCopyOf === "function" ? C.deskCopyOf : () => null;
  const copyOf = (tm, d) => deskCopyOf(agreeWith(LB)(d.box.pub), { rt: tm.rt, teamId: tm.id, leadKeyId: LEAD.keyId, leadBox: LB.pub,
    deskId: d.k.keyId, deskBox: d.box.pub });
  const wrapOf = (doc, d) => { const e = (doc && Array.isArray(doc.roster) ? doc.roster : []).find(r => r && r.desk && r.desk.id === d.k.keyId); return e ? e.wrap : null; };

  const KM1 = crypto.randomBytes(32), KM2 = crypto.randomBytes(32), KM3 = crypto.randomBytes(32);
  const desk = () => ({ k: keyPair(true), box: boxPair(), k1: KM1 });
  const D1 = desk(), D2 = desk(), D3 = desk();
  const tm = await makeTeam();
  await tm.enrol(D1.k, D2.k, D3.k);
  const lead = leadOf(tm, "f1-lead", new Map([[1, KM1]]));
  const d1 = deskOf(tm, "f1-d1", D1), d2 = deskOf(tm, "f1-d2", D2), d3 = deskOf(tm, "f1-d3", D3);
  put(lead.mirror, "lane.ec", "{\"note\":\"Lane Board edition one\"}\n");
  put(lead.mirror, C.TEAM_NAME, teamDoc(tm, 1, 1, [entry(tm, D1, KM1, 1), entry(tm, D2, KM1, 1), entry(tm, D3, KM1, 1)]));
  lead.ch.start();
  await settle(lead);
  d1.ch.start(); d2.ch.start(); d3.ch.start();
  await settle(d1, d2, d3);
  const allOne = [d1, d2, d3].every(d => epochIn(d.mirror) === 1 && read(d.mirror, "lane.ec") === "{\"note\":\"Lane Board edition one\"}\n");

  /* D3 goes offline; the lead takes D2 off: a new key, a roster without it, its device withdrawn, and new files under the new key. */
  d3.t.down = true;
  await d3.ch.stop();
  const atMove = lead.sent.length;
  lead.held.set(2, KM2);
  await tm.enrol(D1.k, D3.k);
  put(lead.mirror, C.TEAM_NAME, teamDoc(tm, 2, 1, [entry(tm, D1, KM2, 2), entry(tm, D3, KM2, 2)]));
  put(lead.mirror, "lane.ec", "{\"note\":\"Lane Board edition two\"}\n");
  put(lead.mirror, "after.ec", "{\"note\":\"written after the move\"}\n");
  await settle(lead);
  await settle(d1);
  let d1Doc = null;
  try { d1Doc = JSON.parse(read(d1.mirror, C.TEAM_NAME)); } catch { d1Doc = null; }
  const d1Wrap = wrapOf(d1Doc, D1);
  check(allOne && epochIn(d1.mirror) === 2 && !!d1Wrap && d1Wrap.epoch === 2 && d1.held.get(2) && d1.held.get(2).equals(KM2)
    && read(d1.mirror, "lane.ec") === "{\"note\":\"Lane Board edition two\"}\n" && read(d1.mirror, "after.ec") !== null && d1.prog.state().pending.length === 0,
    "944a f1: a live desk holding only the epoch-1 key opens the epoch-2 team file the lead sealed under the epoch-2 key, by its own copy, takes"
    + " the new key from its own wrap and loads what waited for it: mirror epoch " + epochIn(d1.mirror) + ", its wrap " + (d1Wrap ? "of epoch " + d1Wrap.epoch : "absent")
    + ", key " + (d1.held.get(2) ? "held" : "absent")
    + ", the new edition " + (read(d1.mirror, "lane.ec") === "{\"note\":\"Lane Board edition two\"}\n" ? "loaded" : "missing") + ", pending "
    + d1.prog.state().pending.length + " epochs [" + d1.prog.state().pending.map(p => p.epoch).join(",") + "]");

  /* The control, on a team of its own: the same epoch-2 file sealed under the key the desk already holds lands. The lead's
     channel no longer seals a team file under an epoch older than its own (944d), so the lead seals it here by hand. */
  {
    const tc = await makeTeam();
    const DC = desk();
    await tc.enrol(DC.k);
    const lc = leadOf(tc, "f1-ctl-lead", new Map([[1, KM1]]));
    const dc = deskOf(tc, "f1-ctl-desk", DC, { agree: undefined });
    put(lc.mirror, C.TEAM_NAME, teamDoc(tc, 1, 1, [entry(tc, DC, KM1, 1)]));
    lc.ch.start();
    await settle(lc);
    dc.ch.start();
    await settle(dc);
    const text2 = teamDoc(tc, 2, 1, [entry(tc, DC, KM2, 2)]);
    const b = B.seal({ relayTeamId: tc.rt, epoch: 1, teamKey: KM1, writer: { keyId: LEAD.keyId, privateKey: LEAD.privateKey }, path: C.TEAM_NAME,
      body: text2, counter: Date.now() + 5e6, kind: "file" });
    const s = R.stores.get(tc.rt), seq = (s.get("seq") || 0) + 1, obj = tc.rt + "/" + b.id + "/" + hex(8);
    R.bucket.objects.set(obj, Buffer.from(b.ciphertext));
    s.put("blob:" + b.id, { id: b.id, supersedes: null, epoch: 1, writer: LEAD.keyId, counter: b.counter, del: false, size: b.ciphertext.length,
      sig: b.signature, nonce: b.nonce, seq, at: R.clock.now, obj });
    s.put("seq:" + String(seq).padStart(16, "0"), b.id);
    s.put("seq", seq);
    await settle(dc);
    check(epochIn(dc.mirror) === 2 && read(dc.mirror, C.TEAM_NAME) === text2 && dc.held.get(2) && dc.prog.state().pending.length === 0,
      "944A f1-control: the same epoch-2 team file sealed under the epoch-1 key the desk already holds lands: mirror epoch " + epochIn(dc.mirror)
      + ", wrap " + (dc.held.get(2) ? "opened" : "not opened") + ", pending " + dc.prog.state().pending.length);
    await lc.ch.stop(); await dc.ch.stop();
  }

  /* Offline through the move and a later rev: D3 comes back and reaches the new epoch by itself on its next catch-up. */
  put(lead.mirror, C.TEAM_NAME, teamDoc(tm, 2, 2, [entry(tm, D1, KM2, 2), entry(tm, D3, KM2, 2)]));
  await settle(lead);
  d3.t.down = false;
  const d3b = deskOf(tm, "f1-d3", D3);
  d3b.ch.start();
  await settle(d3b);
  check(epochIn(d3b.mirror) === 2 && JSON.parse(read(d3b.mirror, C.TEAM_NAME)).rev === 2 && d3b.held.get(2) && d3b.held.get(2).equals(KM2)
    && read(d3b.mirror, "lane.ec") === "{\"note\":\"Lane Board edition two\"}\n" && read(d3b.mirror, "after.ec") !== null && d3b.prog.state().pending.length === 0,
    "944b a desk offline through the move and a later rev reaches the new epoch by itself on its next catch-up: mirror epoch " + epochIn(d3b.mirror)
    + ", key " + (d3b.held.get(2) ? "held" : "absent") + ", the new edition " + (read(d3b.mirror, "lane.ec") === "{\"note\":\"Lane Board edition two\"}\n" ? "loaded" : "missing")
    + ", pending " + d3b.prog.state().pending.length);

  /* D2, taken off: its own catch-up is refused, and everything the lead sent after the move, served to it by a relay that
     kept it all, opens nothing: not under the old key, not under its own copy's key. */
  const d2Said = d2.said.length;
  await settle(d2);
  const feed = feedOf(lead.sent, atMove);
  const own2 = deskCopyOf(agreeWith(D2.box)(LB.pub), { rt: tm.rt, teamId: tm.id, leadKeyId: LEAD.keyId, leadBox: LB.pub, deskId: D2.k.keyId, deskBox: D2.box.pub });
  /* Every key it can make: the old team key, and a copy key for each desk of the old roster it held, by its own agreement. */
  let old2 = null;
  try { old2 = JSON.parse(read(d2.mirror, C.TEAM_NAME)); } catch { old2 = null; }
  const tries2 = [KM1].concat((old2 && Array.isArray(old2.roster) ? old2.roster : []).map(e => deskCopyOf(agreeWith(D2.box)(LB.pub),
    { rt: tm.rt, teamId: tm.id, leadKeyId: LEAD.keyId, leadBox: LB.pub, deskId: e.desk.id, deskBox: e.desk.box })).filter(Boolean).map(c => c.key));
  const opened = feed.filter(it => tries2.some(k => opensUnder(tm, it, k))).length;
  const before2 = d2.written.length;
  d2.prog.applyBatch(feed, { keyFor: e => d2.held.get(e) || null, agree: agreeWith(D2.box), self: { place: "desk:" + D2.k.keyId, box: D2.box.pub },
    onTeam: () => heed(d2.mirror, D2, d2.held, tm) });
  check(feed.length >= 3 && tries2.length === 4 && opened === 0 && epochIn(d2.mirror) === 1 && !d2.held.get(2) && d2.written.length === before2 && read(d2.mirror, "after.ec") === null
    && read(d2.mirror, "lane.ec") === "{\"note\":\"Lane Board edition one\"}\n" && d2.said.slice(d2Said).some(l => l.indexOf(B.REASONS.removed) >= 0),
    "944c the desk taken off opens nothing of the new epoch: its catch-up refused as removed, and of the lead's " + feed.length + " uploads after the move,"
    + " served to it whole, " + opened + " open under any of the " + tries2.length + " keys it can make (the old team key, a copy key for each desk"
    + " of the old roster by its own agreement); mirror epoch " + epochIn(d2.mirror) + ", the new key "
    + (d2.held.get(2) ? "TAKEN" : "never held") + ", files written " + (d2.written.length - before2));
  const copy2 = copyOf(tm, D2);
  const live2 = copy2 ? R.stores.get(tm.rt).dump().map(([k, v]) => [k, JSON.parse(v)]).filter(([k, v]) => k.startsWith("blob:") && v.place === "invite:" + copy2.id) : [];
  check(!!copy2 && !!own2 && copy2.id === own2.id && live2.length === 1 && live2[0][1].del === true,
    "944h the copy the desk taken off had of the old file is superseded by the lead's signed deletion, the relay serving nothing else in its place: records "
    + live2.length + (live2.length ? ", deletion " + live2[0][1].del : ""));

  /* A second move, the lead writing the new team file before it holds the new key: nothing of it goes out under the old
     one, so the desk taken off at it, holding that old key, opens nothing; once the lead holds the key, the kept desk follows. */
  await d3b.ch.stop();
  await tm.enrol(D1.k);
  const atSecond = lead.sent.length;
  put(lead.mirror, C.TEAM_NAME, teamDoc(tm, 3, 1, [entry(tm, D1, KM3, 3)]));
  put(lead.mirror, "third.ec", "{\"note\":\"written at the third key\"}\n");
  await settle(lead);
  const waited = lead.said.some(l => l.indexOf("waits for the team key of epoch 3") >= 0);
  const early = feedOf(lead.sent, atSecond);
  d3b.prog.applyBatch(early, { keyFor: e => d3b.held.get(e) || null, agree: agreeWith(D3.box), self: { place: "desk:" + D3.k.keyId, box: D3.box.pub },
    onTeam: () => heed(d3b.mirror, D3, d3b.held, tm) });
  const d3Early = epochIn(d3b.mirror);
  lead.held.set(3, KM3);
  await settle(lead);
  await settle(d1);
  const all3 = feedOf(lead.sent, atSecond);
  d3b.prog.applyBatch(all3, { keyFor: e => d3b.held.get(e) || null, agree: agreeWith(D3.box), self: { place: "desk:" + D3.k.keyId, box: D3.box.pub },
    onTeam: () => heed(d3b.mirror, D3, d3b.held, tm) });
  check(waited && d3Early === 2 && epochIn(d3b.mirror) === 2 && !d3b.held.get(3) && read(d3b.mirror, "third.ec") === null
    && epochIn(d1.mirror) === 3 && read(d1.mirror, "third.ec") !== null && d1.prog.state().pending.length === 0,
    "944d a second move written before the lead holds its key: nothing of it goes out under the old key, the lead says it waits, and the desk taken"
    + " off at it, served all the lead sent, stays at epoch " + epochIn(d3b.mirror) + " without the new key; the kept desk reaches epoch " + epochIn(d1.mirror)
    + " and loads the new file " + (read(d1.mirror, "third.ec") !== null ? "whole" : "NOT"));

  /* The checks that make a blob open only under its own team, epoch and id hold for a copy too: D1's own copy served again
     under a new id, or under another epoch, is dropped and said; a copy not signed by the pinned lead is refused. */
  const copy1 = copyOf(tm, D1);
  const mine = copy1 ? lead.sent.slice(atSecond).filter(u => u.meta.place === "invite:" + copy1.id && !u.meta.del).pop() : null;
  const d1Said = d1.said.length, d1Team = read(d1.mirror, C.TEAM_NAME);
  const inj = (meta, ct) => {
    const s = R.stores.get(tm.rt), seq = (s.get("seq") || 0) + 1, obj = tm.rt + "/" + meta.id + "/" + hex(8);
    R.bucket.objects.set(obj, Buffer.from(ct));
    s.put("blob:" + meta.id, Object.assign({ supersedes: null, del: false, at: R.clock.now }, meta, { seq, obj, size: ct.length }));
    s.put("seq:" + String(seq).padStart(16, "0"), meta.id);
    s.put("seq", seq);
  };
  if (mine) {
    const base = { epoch: mine.meta.epoch, writer: LEAD.keyId, counter: mine.meta.counter, sig: mine.meta.sig, nonce: mine.meta.nonce, place: mine.meta.place };
    inj(Object.assign({}, base, { id: hex(16) }), mine.ct);
    inj(Object.assign({}, base, { id: hex(16), epoch: mine.meta.epoch + 1 }), mine.ct);
    const forged = signDoc(JSON.parse(teamDoc(tm, 3, 9, [entry(tm, D1, KM3, 3)])), INTR);
    const fake = B.seal({ relayTeamId: tm.rt, epoch: 3, teamKey: copy1.key, writer: { keyId: LEAD.keyId, privateKey: INTR.privateKey },
      path: C.TEAM_NAME, body: JSON.stringify(forged), counter: Date.now() + 9e6, kind: "file" });
    inj({ id: fake.id, epoch: 3, writer: LEAD.keyId, counter: fake.counter, sig: fake.signature, nonce: fake.nonce, place: mine.meta.place }, fake.ciphertext);
  }
  await settle(d1);
  const copySaid = d1.said.slice(d1Said).filter(l => l.indexOf("own copy") >= 0 && l.indexOf(B.REASONS["bad-signature"]) >= 0).length;
  check(!!mine && copySaid >= 3 && read(d1.mirror, C.TEAM_NAME) === d1Team,
    "944e a desk's own copy served again under a new id or another epoch, and one in its place not signed by the pinned lead, are each dropped and"
    + " said, the team file as it was: said " + copySaid);

  /* What the relay sees: no team id, catalog, box, wrap or team file name in the clear, and no copy's place a desk's id. */
  const seen = R.stores.get(tm.rt).dump().map(([k, v]) => k + "=" + v).join("\n") + [...R.bucket.objects.values()].map(b => b.toString("latin1")).join("\n");
  let leadDoc = null;
  try { leadDoc = JSON.parse(read(lead.mirror, C.TEAM_NAME)); } catch { leadDoc = null; }
  const markers = [tm.id, "lane-board", "Lane Board", "etiuda-team", LB.pub, D1.box.pub, D2.box.pub, D3.box.pub,
    (wrapOf(leadDoc, D1) || { enc: "no wrap read" }).enc];
  const places = R.stores.get(tm.rt).dump().map(([, v]) => JSON.parse(v)).filter(v => v && typeof v.place === "string").map(v => v.place);
  const named = places.filter(p => [D1, D2, D3].some(d => p.indexOf(d.k.keyId) >= 0 || p.indexOf(d.box.pub.slice(0, 32)) >= 0));
  check(markers.every(w => seen.indexOf(w) < 0) && places.length >= 3 && named.length === 0,
    "944f the relay keeps the copies and the moves in nothing it can read: none of " + markers.length + " markers in its store or bucket, "
    + places.length + " copy places, " + named.length + " naming a desk");
  await lead.ch.stop(); await d1.ch.stop(); await d2.ch.stop();

  /* ---- a desk admitted while offline (F6 of the slice 1 review): the test architect's f6 reproduction is 945a, its control
     945A. The desk asks by its invitation and goes offline; the lead admits it, lets the invitation go, and moves the team to
     a new key while it is still away; 45 days on it comes back. ---- */
  const DAY = 24 * 60 * 60 * 1000;
  async function admitWhileAway(name, o) {
    const tf = await makeTeam();
    const inv = hex(16), token = hex(32), seal = C.inviteSealKey(hex(16)), at = R.clock.now;
    const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }];
    await admin("POST", "/relay/v1/t/" + tf.rt + "/invites", { add, drop: [], t: at, sig: signHex(LEAD, core.invitesBytes(tf.rt, at, add, [])) });
    const live = [{ id: inv, key: seal }];
    const OLD = desk(), J = { k: keyPair(true), box: boxPair() };
    await tf.enrol(OLD.k);
    const lf = leadOf(tf, name + "-lead", new Map([[1, KM1]]), { inviteKeys: () => live });
    put(lf.mirror, "lane.ec", "{\"note\":\"Lane Board edition one\"}\n");
    put(lf.mirror, C.TEAM_NAME, teamDoc(tf, 1, 1, [entry(tf, OLD, KM1, 1)]));
    if (o.copyFirst) { lf.ch.start(); await settle(lf); }
    const invited = () => Object.assign({ inv, token, seal }, o.box ? { box: LB.pub } : {});
    const asking = deskOf(tf, name + "-desk", J, { invite: invited });
    put(asking.mirror, "desks/" + J.k.keyId + "/join.json", "{\"kind\":\"etiuda-join\",\"note\":\"asked from afar\"}\n");
    asking.ch.start();
    await settle(asking);
    const heldAtAsk = read(asking.mirror, C.TEAM_NAME) !== null;
    asking.t.down = true;
    await asking.ch.stop();
    if (!o.copyFirst) lf.ch.start();
    await settle(lf);
    const asked = read(lf.mirror, "desks/" + J.k.keyId + "/join.json") !== null;
    /* Admitted: on the roster with its wrap and its key enrolled; then the invitation spent, unless the control keeps it. */
    await tf.enrol(OLD.k, J.k);
    put(lf.mirror, C.TEAM_NAME, teamDoc(tf, 1, 2, [entry(tf, OLD, KM1, 1), entry(tf, J, KM1, 1)]));
    await settle(lf);
    if (!o.keepLive) live.length = 0;
    await settle(lf);
    /* Still away: the lead takes the other desk off with a new key and publishes under it. */
    lf.held.set(2, KM2);
    await tf.enrol(J.k);
    put(lf.mirror, C.TEAM_NAME, teamDoc(tf, 2, 1, [entry(tf, J, KM2, 2)]));
    put(lf.mirror, "lane.ec", "{\"note\":\"Lane Board edition two\"}\n");
    await settle(lf);
    const inviteCopy = R.stores.get(tf.rt).dump().map(([, v]) => JSON.parse(v)).some(v => v && v.place === "invite:" + inv && !v.del);
    R.clock.now += 45 * DAY;
    const back = deskOf(tf, name + "-desk", J, { invite: invited });
    back.ch.start();
    await settle(back);
    let doc = null;
    try { doc = JSON.parse(read(back.mirror, C.TEAM_NAME)); } catch { doc = null; }
    const out = { heldAtAsk, asked, inviteCopy, epoch: doc ? doc.epoch : null, rev: doc ? doc.rev : null, wrap: !!wrapOf(doc, J),
      key: !!back.held.get(2) && back.held.get(2).equals(KM2), edition: read(back.mirror, "lane.ec") === "{\"note\":\"Lane Board edition two\"}\n",
      pending: back.prog.state().pending.length };
    out.joined = out.epoch === 2 && out.wrap && out.key && out.edition;
    out.line = "asked holding " + (heldAtAsk ? "a team file" : "no team file") + ", request " + (asked ? "at the lead" : "missing")
      + ", the invitation's copy " + (inviteCopy ? "still served" : "let go") + "; back 45 days on: team file epoch " + out.epoch + " rev " + out.rev
      + ", wrap " + (out.wrap ? "present" : "absent") + ", the new key " + (out.key ? "held" : "absent") + ", the new edition "
      + (out.edition ? "loaded" : "missing") + ", pending " + out.pending;
    await back.ch.stop(); await lf.ch.stop();
    return out;
  }
  const f6 = await admitWhileAway("f6", { box: true });
  check(!f6.heldAtAsk && f6.asked && !f6.inviteCopy && f6.joined && f6.pending === 0,
    "945a f6: a desk admitted while offline, which asked before the lead put up any copy and so holds no team file, joins by itself when it"
    + " comes back after its invitation was let go and the team moved to a new key: by its own copy, found from the lead's box its invitation"
    + " names: " + f6.line);
  const f6c = await admitWhileAway("f6-ctl", { box: false, keepLive: true });
  check(!f6c.heldAtAsk && f6c.asked && f6c.inviteCopy && f6c.joined && f6c.pending === 0,
    "945A f6-control: while the invitation stays live the same desk joins by the invitation's copy, kept current by the lead: " + f6c.line);
  const f6b = await admitWhileAway("f6-held", { box: false, copyFirst: true });
  check(f6b.heldAtAsk && f6b.asked && !f6b.inviteCopy && f6b.joined,
    "945b a desk that read the invitation's copy before going offline joins the same way with an invitation naming no box, the lead's box"
    + " taken from the team file it holds (F1's copy alone): " + f6b.line);

  /* ---- the test architect's scenarios on F1 (his read of 2026-10-18), each a team of its own: a desk added after a move,
     a desk whose box changed, a desk taken off and put back inside the relay's 30-day keep and past it, each reaching the
     next epoch by its own copy with no step by anyone; a file deleted and written again past that keep (N3 of the outside
     review of 2026-10-18); and the binding of a copy's key and place to every field it names. ---- */
  const reached = (d, epoch, key, file, text) => epochIn(d.mirror) === epoch && !!d.held.get(epoch) && d.held.get(epoch).equals(key)
    && read(d.mirror, file) === text && d.prog.state().pending.length === 0;
  const where = (d, epoch, file, text) => "mirror epoch " + epochIn(d.mirror) + ", key " + (d.held.get(epoch) ? "held" : "absent")
    + ", the new file " + (read(d.mirror, file) === text ? "loaded" : "missing") + ", pending " + d.prog.state().pending.length;
  const atPlace = (rt, id) => R.stores.get(rt).dump().map(([k, v]) => [k, JSON.parse(v)]).filter(([k, v]) => k.startsWith("blob:") && v.place === "invite:" + id).map(([, v]) => v);

  /* S-add: a desk added at epoch 2 rev 2, its mirror and the epoch-2 key as an invitation leaves them; then a move to epoch 3. */
  {
    const ta = await makeTeam();
    const A1 = desk(), AN = Object.assign(desk(), { start: [[2, KM2]] });
    await ta.enrol(A1.k);
    const la = leadOf(ta, "s-add-lead", new Map([[1, KM1]]));
    put(la.mirror, C.TEAM_NAME, teamDoc(ta, 1, 1, [entry(ta, A1, KM1, 1)]));
    la.ch.start();
    await settle(la);
    la.held.set(2, KM2);
    put(la.mirror, C.TEAM_NAME, teamDoc(ta, 2, 1, [entry(ta, A1, KM2, 2)]));
    await settle(la);
    await ta.enrol(A1.k, AN.k);
    put(la.mirror, C.TEAM_NAME, teamDoc(ta, 2, 2, [entry(ta, A1, KM2, 2), entry(ta, AN, KM2, 2)]));
    await settle(la);
    const an = deskOf(ta, "s-add-desk", AN);
    an.ch.start();
    await settle(an);
    const atTwo = epochIn(an.mirror);
    la.held.set(3, KM3);
    await ta.enrol(AN.k);
    const ADDED = "{\"note\":\"Lane Board, written at the third key\"}\n";
    put(la.mirror, C.TEAM_NAME, teamDoc(ta, 3, 1, [entry(ta, AN, KM3, 3)]));
    put(la.mirror, "added.ec", ADDED);
    await settle(la);
    await settle(an);
    check(atTwo === 2 && reached(an, 3, KM3, "added.ec", ADDED),
      "944i S-add: a desk added at epoch 2 rev 2 holding only that epoch's key reaches epoch 3 by its own copy at the next move: at the add epoch "
      + atTwo + "; after the move " + where(an, 3, "added.ec", ADDED));
    await la.ch.stop(); await an.ch.stop();
  }

  /* S-box: a desk's box changes, the lead names the new box at rev 2, then a move; the copy at the old box's place is let go. */
  {
    const tb = await makeTeam();
    const B1 = desk(), BB = desk();
    await tb.enrol(B1.k, BB.k);
    const lb = leadOf(tb, "s-box-lead", new Map([[1, KM1]]));
    put(lb.mirror, C.TEAM_NAME, teamDoc(tb, 1, 1, [entry(tb, B1, KM1, 1), entry(tb, BB, KM1, 1)]));
    lb.ch.start();
    await settle(lb);
    const bb1 = deskOf(tb, "s-box-desk", BB);
    bb1.ch.start();
    await settle(bb1);
    await bb1.ch.stop();
    const BB2 = Object.assign({}, BB, { box: boxPair() });
    put(lb.mirror, C.TEAM_NAME, teamDoc(tb, 1, 2, [entry(tb, B1, KM1, 1), entry(tb, BB2, KM1, 1)]));
    await settle(lb);
    const bb2 = deskOf(tb, "s-box-desk", BB2);
    bb2.ch.start();
    await settle(bb2);
    lb.held.set(2, KM2);
    await tb.enrol(BB.k);
    const BOXED = "{\"note\":\"Lane Board, written after the box changed\"}\n";
    put(lb.mirror, C.TEAM_NAME, teamDoc(tb, 2, 1, [entry(tb, BB2, KM2, 2)]));
    put(lb.mirror, "boxed.ec", BOXED);
    await settle(lb);
    await settle(bb2);
    const oldCopy = copyOf(tb, BB), newCopy = copyOf(tb, BB2);
    const oldPlace = oldCopy ? atPlace(tb.rt, oldCopy.id) : [], newPlace = newCopy ? atPlace(tb.rt, newCopy.id) : [];
    check(reached(bb2, 2, KM2, "boxed.ec", BOXED) && oldPlace.length === 1 && oldPlace[0].del === true && newPlace.length === 1 && newPlace[0].del === false,
      "944j S-box: a desk whose box changed, the lead naming the new box at rev 2, reaches the next epoch by the copy at its new box's place: "
      + where(bb2, 2, "boxed.ec", BOXED) + "; the old box's place " + oldPlace.map(v => (v.del ? "a deletion" : "a copy")).join(", ")
      + ", the new box's " + newPlace.map(v => (v.del ? "a deletion" : "a copy")).join(", "));
    await lb.ch.stop(); await bb2.ch.stop();
  }

  /* S-readd and S-readd-late: a desk taken off at epoch 2 and put back at epoch 3 with the same box, the relay's clock moved
     on `days` between; a page of the lead's let go at the removal and written again at the re-add. */
  async function readd(name, days) {
    const tr = await makeTeam();
    const R1 = desk(), RR = desk();
    await tr.enrol(R1.k, RR.k);
    const lr = leadOf(tr, name + "-lead", new Map([[1, KM1]]));
    const PAGE = "{\"note\":\"Lane Board, a page\"}\n", AGAIN = "{\"note\":\"Lane Board, the page written again\"}\n";
    const BACK = "{\"note\":\"Lane Board, written at the re-add\"}\n";
    put(lr.mirror, "page.ec", PAGE);
    put(lr.mirror, C.TEAM_NAME, teamDoc(tr, 1, 1, [entry(tr, R1, KM1, 1), entry(tr, RR, KM1, 1)]));
    lr.ch.start();
    await settle(lr);
    const r1 = deskOf(tr, name + "-stays", R1), rr = deskOf(tr, name + "-desk", RR);
    r1.ch.start(); rr.ch.start();
    await settle(r1, rr);
    const one = epochIn(rr.mirror) === 1 && read(rr.mirror, "page.ec") === PAGE && read(r1.mirror, "page.ec") === PAGE;
    await rr.ch.stop();
    lr.held.set(2, KM2);
    await tr.enrol(R1.k);
    put(lr.mirror, C.TEAM_NAME, teamDoc(tr, 2, 1, [entry(tr, R1, KM2, 2)]));
    fs.unlinkSync(path.join(lr.mirror, "page.ec"));
    await settle(lr);
    await settle(r1);
    const copy = copyOf(tr, RR);
    const off = copy ? atPlace(tr.rt, copy.id) : [];
    const letGo = off.length === 1 && off[0].del === true && read(r1.mirror, "page.ec") === null;
    R.clock.now += days * DAY;
    await settle(lr, r1);
    lr.held.set(3, KM3);
    await tr.enrol(R1.k, RR.k);
    const saidAt = lr.said.length;
    put(lr.mirror, C.TEAM_NAME, teamDoc(tr, 3, 1, [entry(tr, R1, KM3, 3), entry(tr, RR, KM3, 3)]));
    put(lr.mirror, "page.ec", AGAIN);
    put(lr.mirror, "back.ec", BACK);
    await settle(lr);
    const quiet = lr.sent.length;
    await settle(lr);
    const rb = deskOf(tr, name + "-desk", RR);
    rb.ch.start();
    await settle(rb);
    await settle(r1);
    const on = copy ? atPlace(tr.rt, copy.id) : [];
    const out = { one, letGo, back: reached(rb, 3, KM3, "back.ec", BACK), again: read(r1.mirror, "page.ec") === AGAIN,
      onPlace: on.map(v => (v.del ? "a deletion" : "a copy")).join(", ") || "nothing", copyLive: on.length === 1 && on[0].del === false,
      quiet: lr.sent.length === quiet, waits: lr.said.slice(saidAt).filter(l => l.indexOf(B.REASONS.superseded) >= 0).length,
      where: where(rb, 3, "back.ec", BACK), extra: lr.sent.length - quiet };
    await lr.ch.stop(); await r1.ch.stop(); await rb.ch.stop();
    return out;
  }
  const inKeep = await readd("s-readd", 0);
  check(inKeep.one && inKeep.letGo && inKeep.back && inKeep.copyLive && inKeep.quiet,
    "944k S-readd: a desk taken off at epoch 2 and put back at epoch 3 with the same box reaches epoch 3 by its own copy: " + inKeep.where
    + "; its place holds " + inKeep.onPlace);
  const late = await readd("s-readd-late", 31);
  check(late.one && late.letGo && late.back && late.copyLive && late.quiet && late.waits === 0,
    "944m S-readd-late: the same, the relay's clock 31 days on before the re-add, its copy's deletion pruned past the keep: the desk reaches"
    + " epoch 3 by its own copy with no step by anyone and no upload repeated: " + late.where + "; its place holds " + late.onPlace
    + "; the lead said superseded " + late.waits + " time(s), uploads on a settled cycle " + late.extra);
  check(late.again && inKeep.again,
    "944o N3: a page the lead let go and wrote again 31 days on, its deletion pruned past the keep, reaches a desk that stayed, as it"
    + " does inside the keep: past the keep " + (late.again ? "arrived" : "NOT ARRIVED") + ", inside it " + (inKeep.again ? "arrived" : "NOT ARRIVED"));

  /* A copy's key and place are bound to every field deskCopyOf names: change any one alone and both change; a field with a
     newline or out of its shape, or an all-zero agreement, makes nothing; the same inputs make the same copy. */
  {
    const dh = crypto.randomBytes(32);
    const base = { rt: hex(16), teamId: "t-" + hex(8), leadKeyId: "lane-lead", leadBox: boxPair().pub, deskId: keyPair(true).keyId, deskBox: boxPair().pub };
    const alt = { rt: hex(16), teamId: "t-" + hex(8), leadKeyId: "lane-lead-two", leadBox: boxPair().pub, deskId: keyPair(true).keyId, deskBox: boxPair().pub };
    const a = deskCopyOf(dh, base), same = deskCopyOf(Buffer.from(dh), Object.assign({}, base));
    const moved = Object.keys(alt).map(k => [k, deskCopyOf(dh, Object.assign({}, base, { [k]: alt[k] }))]).concat([["dh", deskCopyOf(crypto.randomBytes(32), base)]]);
    const apart = moved.filter(([, c]) => !!a && !!c && c.id !== a.id && !c.key.equals(a.key)).map(([k]) => k);
    const ids = new Set(moved.map(([, c]) => (c ? c.id : "none")));
    const bent = Object.keys(base).filter(k => deskCopyOf(dh, Object.assign({}, base, { [k]: base[k] + "\n" })) === null);
    check(!!a && !!same && same.id === a.id && same.key.equals(a.key) && apart.length === 7 && ids.size === 7 && bent.length === 6
      && deskCopyOf(Buffer.alloc(32), base) === null && deskCopyOf(dh.subarray(0, 31), base) === null,
      "944n a copy's key and place are bound to the relay team, the team, the lead's key, the lead's box, the desk and the desk's box: of 7 inputs"
      + " each changed alone " + apart.length + " move both (" + apart.join(", ") + "); of 6 with a trailing newline " + bent.length
      + " make nothing; the same inputs " + (same && a && same.id === a.id ? "the same copy" : "ANOTHER") + "; an all-zero or short agreement nothing");
  }
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

/* ---- a refusal that lifts never stops a file (F4 of the slice 1 review): the test architect's f4 reproduction is 946a and
   946b, its control 946A. A desk's channel over a stand-in relay that answers each of its uploads as the leg says. ---- */
try {
  const FRT = hex(16), FPIN = { teamId: "t-" + hex(8), rt: FRT, lead: { keyId: LEAD.keyId, public: LEAD.pub } }, KF = crypto.randomBytes(32);
  const FREL = "desks/" + DESK.keyId + "/in-use.ec";
  const STATUS = { epoch: 409, "replay-counter": 409, superseded: 410, "blob-size": 413, "bad-path": 400 };
  const refusal = reason => ({ status: STATUS[reason] || 403, body: { error: reason, said: B.REASONS[reason] } });
  const TAKEN = { status: 200, body: { seq: 1, id: "0".repeat(32) } };
  /* `answers` for the uploads in turn, the last repeated, or a function of the upload's meta and the count before it;
     `cycles` catch-ups and flushes; `before` run on the channel before the first, `between` after it, `each` after every
     one with its index; a channel over the same record started again at the end where `restart` says so; `files` the
     mirror's, `who` and `place` the program's, `inviteKeys` a lead's live invitations; `blob` answering a fetch of one id,
     or null for the 404 every other fetch gets. */
  async function cycles(name, answers, o) {
    const x = o || {};
    const puts = [], said = [];
    const reply = (status, j) => ({ status, header: () => null, bytes: Buffer.from(JSON.stringify(j)) });
    const request = async (method, url, headers) => {
      const u = String(url);
      if (method === "POST" && u.endsWith("/hello")) return reply(200, { challenge: hex(16) });
      if (method === "POST" && u.endsWith("/session")) return reply(200, { session: hex(32) });
      if (method === "GET" && u.indexOf("/since/") >= 0) return reply(200, []);
      const got = method === "GET" && x.blob ? /\/b\/([0-9a-f]{32})$/.exec(u) : null;
      const a = got ? x.blob(got[1]) : null;
      if (a) return reply(a.status, a.body);
      if (method === "PUT") {
        const meta = JSON.parse(Buffer.from(headers["etiuda-blob"], "base64url").toString("utf8"));
        const a = typeof answers === "function" ? answers(meta, puts.length) : answers[Math.min(puts.length, answers.length - 1)];
        puts.push(u);
        return reply(a.status, a.body);
      }
      return reply(404, {});
    };
    const mirror = path.join(LAB, name), stateFile = path.join(LAB, name + ".json");
    const files = x.files || { [FREL]: "{\"inUse\":\"an honest edit\"}\n" };
    for (const rel of Object.keys(files)) put(mirror, rel, files[rel]);
    const who = x.who || DESK, place = x.place || "desk:" + DESK.keyId;
    const make = () => C.createChannel({ rt: FRT, url: URLV1, mirror, stateFile, watch: false, pollMs: 1e9, pin: () => FPIN,
      me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place }),
      keyFor: e => (e === 1 ? KF : null), sealEpoch: () => 1, request, connect: () => null, say: l => said.push(l),
      inviteKeys: x.inviteKeys ? () => x.inviteKeys : undefined });
    let ch = make();
    if (x.before) x.before(ch);
    const after = [];
    for (let i = 0; i < (x.cycles || 2); i++) {
      if (i === 0) ch.start(); else ch.kick();
      await ch.idle();
      after.push({ puts: puts.length, stopped: !!ch.program.state().refused[FREL] });
      if (i === 0 && x.between) x.between(ch);
      if (x.each) x.each(ch, i);
    }
    if (x.restart) { await ch.stop(); ch = make(); ch.start(); await ch.idle(); }
    const out = { after, puts: puts.length, sent: !!ch.program.state().sent[FREL], said, st: ch.program.state(),
      owed: ch.program.owed({ keyId: DESK.keyId, place: "desk:" + DESK.keyId }, { keyFor: e => (e === 1 ? KF : null) }).some(op => op.rel === FREL),
      waits: said.filter(l => l.indexOf(FREL + " waits, and goes once this lifts: ") === 0).length };
    await ch.stop();
    return out;
  }

  /* Each refusal that a later state of the team, or of the relay, can lift: refused twice, then taken. */
  const LIFTS = ["epoch", "team-size", "not-enrolled", "replay-counter", "removed", "token-spent", "superseded"];
  const lifted = [];
  for (const reason of LIFTS) {
    const r = await cycles("f4-" + reason, [refusal(reason), refusal(reason), TAKEN], { cycles: 3 });
    lifted.push({ reason, ok: r.after[0].puts === 1 && !r.after[0].stopped && !r.after[1].stopped && r.sent && !r.owed && r.waits === 1
      && r.said.some(l => l.indexOf(B.REASONS[reason]) >= 0), puts: r.puts, waits: r.waits, sent: r.sent, stopped: r.after[0].stopped });
  }
  const odd = await cycles("f4-teapot", [{ status: 418, body: {} }, TAKEN]);
  lifted.push({ reason: "an answer this layer does not know", ok: !odd.after[0].stopped && odd.sent && odd.waits === 1, puts: odd.puts, waits: odd.waits,
    sent: odd.sent, stopped: odd.after[0].stopped });
  check(lifted.every(l => l.ok),
    "946a f4: a refusal the relay may lift never stops the file: refused, it waits, is said once while it waits, and goes once the relay takes"
    + " it: " + lifted.map(l => l.reason + " " + (l.ok ? "sent" : "puts " + l.puts + ", said " + l.waits + ", stopped " + l.stopped + ", sent " + l.sent)).join("; "));

  /* The team's space as this desk counts it full before any upload; then room again, as when its own earlier file goes. */
  const full = await cycles("f4-space", [TAKEN], { before: ch => { ch.program.state().bytes = B.TEAM_MAX; }, between: ch => { ch.program.state().bytes = 0; } });
  check(full.after[0].puts === 0 && !full.after[0].stopped && full.waits === 1 && full.sent && full.puts === 1,
    "946b f4: the team's space found full before any upload stops nothing: the file waits, is said, and goes once there is room: puts before "
    + full.after[0].puts + ", stopped " + full.after[0].stopped + ", said " + full.waits + ", then " + (full.sent ? "sent" : "not sent"));

  const down = await cycles("f4-down", [{ status: 500, body: { error: "fault" } }, TAKEN]);
  check(!down.after[0].stopped && down.sent && down.puts === 2,
    "946A f4-control: HTTP 500 leaves the file owed and the next cycle sends it: stopped " + down.after[0].stopped + ", puts " + down.puts
    + ", " + (down.sent ? "sent" : "not sent"));

  /* A refusal the relay answers, of a path, a place, a signature or a size, does not stop the file (C2). It waits, is
     said once, and the next cycle sends it. A restart after that send keeps it sent and does not put it again. */
  const STOP = ["outside-place", "bad-path", "bad-signature", "blob-size"];
  const stops = [];
  for (const reason of STOP) {
    const r = await cycles("f4-stop-" + reason, [refusal(reason), TAKEN], { cycles: 2, restart: true });
    stops.push({ reason, ok: !r.after[0].stopped && r.after[0].puts === 1 && r.puts === 2 && r.sent && !r.owed
      && r.waits === 1 && !r.st.refused[FREL]
      && r.said.some(l => l === FREL + " waits, and goes once this lifts: " + B.REASONS[reason]),
      puts: r.puts, stopped: r.after[0].stopped, sent: r.sent, waits: r.waits });
  }
  check(stops.every(s => s.ok),
    "946c a refusal the relay answers does not stop that file: it waits, is said once, and the next cycle sends it, and a restart does not put it again: "
    + stops.map(s => s.reason + " " + (s.ok ? "sent" : "puts " + s.puts + ", stopped " + s.stopped + ", waits " + s.waits + ", sent " + s.sent)).join("; "));

  /* A refusal about the sender or the epoch sealed under ends the cycle's uploads at the first file it meets: five files
     owed and the refusal lasting three cycles, one upload a cycle, nothing stopped, and all five go once it lifts. */
  const FIVE = {};
  for (const n of ["in-use.ec", "a.ec", "b.ec", "c.ec", "d.ec"]) FIVE["desks/" + DESK.keyId + "/" + n] = "{\"note\":\"" + n + " written here\"}\n";
  const halted = [];
  for (const reason of ["epoch", "not-enrolled"]) {
    const r = await cycles("f4-halt-" + reason, [refusal(reason), refusal(reason), refusal(reason), TAKEN], { cycles: 4, files: FIVE });
    const per = r.after.map((a, i) => a.puts - (i ? r.after[i - 1].puts : 0));
    const sentNow = Object.keys(FIVE).filter(rel => r.st.sent[rel]).length;
    halted.push({ reason, per, sentNow, ok: per.join(",") === "1,1,1,5" && sentNow === 5 && Object.keys(r.st.refused).length === 0
      && r.said.filter(l => l.indexOf(" waits, and goes once this lifts: ") >= 0).length === 1 });
  }
  check(halted.every(h => h.ok),
    "946d a lasting refusal about the sender or the epoch costs one upload a cycle however many files are owed, and each goes once it lifts:"
    + " PUTs a cycle with five owed, " + halted.map(h => h.reason + " " + h.per.join(",") + ", then " + h.sentNow + " of 5 sent").join("; "));

  /* A lead's copy of the team file for an invitation, refused for a reason that can never lift, never stops the lead's own
     team file of the same bytes: the root upload waits once (a refusal that lifts), the copy is refused as outside its place
     every time, and the root file goes at the next cycle. */
  const fTeam = JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: FPIN.teamId, catalogs: ["quay-board"],
    lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev: 1,
    channel: { kind: "relay", rt: FRT, url: URLV1 }, roster: [] }, LEAD), null, 1) + "\n";
  let roots = 0;
  const copyStop = await cycles("f4-copy-stop", meta => (String(meta.place).startsWith("invite:") ? refusal("outside-place")
    : roots++ ? TAKEN : refusal("replay-counter")), { cycles: 2, who: LEAD, place: "root", files: { [C.TEAM_NAME]: fTeam },
    inviteKeys: [{ id: hex(16), key: crypto.randomBytes(32) }] });
  const rootSent = copyStop.st.sent[C.TEAM_NAME];
  const copyWaits = copyStop.said.filter(l => l.indexOf("a copy of " + C.TEAM_NAME + " for one desk or invitation waits, and goes once this lifts: "
    + B.REASONS["outside-place"]) === 0).length;
  check(roots === 2 && !!rootSent && rootSent.sha === sha(Buffer.from(fTeam, "utf8")) && !copyStop.st.refused[C.TEAM_NAME]
    && Object.keys(copyStop.st.sentInv).length === 0 && copyWaits === 1,
    "946e a copy of the team file refused for good never stops the lead's own team file of the same bytes: root uploads " + roots
    + ", the root file " + (rootSent ? "sent" : "NOT sent") + ", stopped " + (copyStop.st.refused[C.TEAM_NAME] ? "as " + copyStop.st.refused[C.TEAM_NAME].why : "never")
    + ", the copy's wait said " + copyWaits + " time(s)");

  /* The header's clause on a deletion the relay says was superseded (E1 of the test architect's read of cf90c15): the desk's
     file sent, deleted, and written again; the upload naming the deletion refused superseded, and the relay asked of that
     deletion's own id answering as `why` says. Superseded means a newer blob of the chain is live, so the file waits on its
     chain and no new chain starts (944p); were lapsed to drop its reason test, the file would go as a chain of its own and
     fork it, and 944p goes red. Its control 944P: answered expired, the deletion is forgotten and the file starts a chain. */
  const AGAIN = "{\"inUse\":\"written again after its deletion\"}\n";
  async function rewritten(name, why) {
    let del = null;
    const metas = [], asked = [];
    const r = await cycles(name, meta => {
      metas.push(meta);
      if (meta.del) { del = meta.id; return TAKEN; }
      return del && meta.supersedes === del ? refusal("superseded") : TAKEN;
    }, { cycles: 3, blob: id => (asked.push(id), id === del ? { status: 410, body: { error: why, said: B.REASONS[why] } } : null),
      each: (ch, i) => {
        if (i === 0) fs.unlinkSync(path.join(LAB, name, ...FREL.split("/")));
        if (i === 1) put(path.join(LAB, name), FREL, AGAIN);
      } });
    const after = del ? metas.slice(metas.findIndex(m => m.id === del) + 1) : [];
    const last = r.st.sent[FREL];
    return { del: !!del, asked: asked.filter(id => id === del).length, onDel: after.filter(m => m.supersedes === del).length,
      fresh: after.filter(m => !m.del && m.supersedes === null).length, lastDel: !!last && last.del === true && last.id === del,
      owed: r.owed, waits: r.waits };
  }
  const tell = x => "deletion " + (x.del ? "sent" : "NOT SENT") + ", asked of its id " + x.asked + ", uploads on it " + x.onDel
    + ", new chains " + x.fresh + ", the last sent " + (x.lastDel ? "still the deletion" : "not the deletion") + ", owed " + x.owed
    + ", said waiting " + x.waits;
  const sup = await rewritten("e1-superseded", "superseded");
  check(sup.del && sup.asked === 1 && sup.onDel === 1 && sup.fresh === 0 && sup.lastDel && sup.owed && sup.waits === 1,
    "944p a file written again after its deletion, the relay saying that deletion was superseded, waits on its chain and starts no new one: "
    + tell(sup));
  const exp = await rewritten("e1-expired", "expired");
  check(exp.del && exp.asked === 1 && exp.onDel === 1 && exp.fresh === 1 && !exp.lastDel && !exp.owed,
    "944P e1-control: the same answered expired forgets the deletion and the file goes as the first of a chain of its own: " + tell(exp));
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

/* ---- a refusal the relay answers is not a stop by content hash (C2, board 919). The lab relay answers the first
   PUT of a root .ec and of a desk's join.json with 400 bad-signature, then takes uploads. The next cycle puts both,
   and so does a program started again from the record that refusal left. ---- */
const C2_ROOT = "harbour.ec";
const C2_NOTE = "{\"kind\":\"etiuda-sealed\",\"note\":\"a harbour note\"}\n";
const C2_JOIN = "{\"kind\":\"etiuda-join\",\"note\":\"harbour desk\"}\n";
async function relayRefusal(mod, tag) {
  const running = [];
  const whyOf = (file, rel) => {
    let j = null;
    try { j = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return "unread"; }
    const r = j && j.refused ? j.refused[rel] : null;
    return r && r.why ? r.why : "none";
  };
  const memWhy = (prog, rel) => {
    const r = prog.state().refused[rel];
    return r && r.why ? r.why : "none";
  };
  const waitsFor = (said, rel) => said.filter(l => l.indexOf(rel + " waits, and goes once this lifts: ") === 0).length;
  async function oneTeam(label) {
    const rt = hex(16), teamId = "t-" + hex(8), deskKey = keyPair(true), key = crypto.randomBytes(32);
    const joinRel = "desks/" + deskKey.keyId + "/join.json";
    const t0 = R.clock.now;
    const made = await admin("POST", "/relay/v1/teams", createBody(rt, t0));
    if (made.status !== 200) return { detail: label + " team " + made.status, bad: true };
    const list = [{ id: deskKey.keyId, pub: deskKey.pub, desk: deskKey.keyId }], t1 = R.clock.now;
    const en = await admin("POST", "/relay/v1/t/" + rt + "/devices", { keys: list, rev: 1, t: t1,
      sig: signHex(LEAD, core.devicesBytes(rt, 1, t1, list)) });
    if (en.status !== 200) return { detail: label + " enrol " + en.status, bad: true };
    const pin = { teamId, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
    const stored = writer => {
      const s = R.stores.get(rt);
      if (!s) return 0;
      let n = 0;
      for (const [k, v] of s.dump()) {
        if (!k.startsWith("blob:")) continue;
        const rec = JSON.parse(v);
        if (rec.writer === writer && rec.del !== true) n++;
      }
      return n;
    };
    const attach = (slot, who, place, refuse) => {
      const net = transport(tag + "-" + label + "-" + slot + (refuse ? "-hold" : "-go"));
      const tally = { refused: 0, forwarded: 0 };
      const request = async (method, url, headers, body) => {
        if (method === "PUT" && refuse && tally.refused === 0) {
          tally.refused++;
          return { status: 400, header: () => null, bytes: Buffer.from(JSON.stringify({ error: "bad-signature", said: B.REASONS["bad-signature"] })) };
        }
        if (method === "PUT") tally.forwarded++;
        return net.request(method, url, headers, body);
      };
      const said = [];
      const mirror = path.join(LAB, tag + "-" + label + "-" + slot);
      const stateFile = path.join(LAB, tag + "-" + label + "-" + slot + ".json");
      const ch = mod.createChannel({
        rt, url: URLV1, mirror, stateFile, watch: false, pollMs: 1e9, pin: () => pin,
        me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place }),
        keyFor: e => (e === 1 ? key : null), sealEpoch: () => 1,
        request, connect: () => null, say: l => said.push(l),
      });
      running.push(ch);
      return { ch, said, tally, mirror, stateFile };
    };
    const lead = attach("lead", LEAD, "root", true);
    const desk = attach("desk", deskKey, "desk:" + deskKey.keyId, true);
    put(lead.mirror, C2_ROOT, C2_NOTE);
    put(desk.mirror, joinRel, C2_JOIN);
    lead.ch.start();
    desk.ch.start();
    await lead.ch.idle();
    await desk.ch.idle();
    const atRefusal = {
      lead: whyOf(lead.stateFile, C2_ROOT), desk: whyOf(desk.stateFile, joinRel),
      memLead: memWhy(lead.ch.program, C2_ROOT), memDesk: memWhy(desk.ch.program, joinRel),
      saidLead: waitsFor(lead.said, C2_ROOT), saidDesk: waitsFor(desk.said, joinRel),
      refused: lead.tally.refused + desk.tally.refused,
    };
    return { rt, deskKey, joinRel, lead, desk, atRefusal, stored, attach };
  }
  try {
    const cycle = await oneTeam("cycle");
    if (cycle.bad) return { c2: false, bug: false, detail: cycle.detail };
    cycle.lead.ch.kick();
    cycle.desk.ch.kick();
    await cycle.lead.ch.idle();
    await cycle.desk.ch.idle();
    const cycleOn = { lead: cycle.stored(LEAD.keyId), desk: cycle.stored(cycle.deskKey.keyId) };
    const cycleForward = cycle.lead.tally.forwarded + cycle.desk.tally.forwarded;
    await cycle.lead.ch.stop();
    await cycle.desk.ch.stop();

    const again = await oneTeam("restart");
    if (again.bad) return { c2: false, bug: false, detail: again.detail };
    await again.lead.ch.stop();
    await again.desk.ch.stop();
    const restarted = {
      lead: again.attach("lead", LEAD, "root", false),
      desk: again.attach("desk", again.deskKey, "desk:" + again.deskKey.keyId, false),
    };
    restarted.lead.ch.start();
    restarted.desk.ch.start();
    await restarted.lead.ch.idle();
    await restarted.desk.ch.idle();
    const restartOn = { lead: again.stored(LEAD.keyId), desk: again.stored(again.deskKey.keyId) };
    await restarted.lead.ch.stop();
    await restarted.desk.ch.stop();

    const a = cycle.atRefusal, b = again.atRefusal;
    const detail = "cycle: refused " + a.refused + ", forwarded " + cycleForward
      + ", record " + a.lead + "/" + a.desk + ", memory " + a.memLead + "/" + a.memDesk
      + ", waiting said " + a.saidLead + "/" + a.saidDesk
      + ", on the relay lead " + cycleOn.lead + " desk " + cycleOn.desk
      + "; restart: record at the refusal " + b.lead + "/" + b.desk
      + ", on the relay lead " + restartOn.lead + " desk " + restartOn.desk;
    const clear = w => w === "none";
    const held = w => w === "bad-signature";
    const c2 = a.refused === 2 && cycleForward === 2 && clear(a.lead) && clear(a.desk) && clear(a.memLead) && clear(a.memDesk)
      && a.saidLead === 1 && a.saidDesk === 1 && cycleOn.lead === 1 && cycleOn.desk === 1
      && clear(b.lead) && clear(b.desk) && restartOn.lead === 1 && restartOn.desk === 1;
    const bug = held(a.lead) && held(a.desk) && held(a.memLead) && held(a.memDesk) && cycleOn.lead === 0 && cycleOn.desk === 0
      && held(b.lead) && held(b.desk) && restartOn.lead === 0 && restartOn.desk === 0;
    return { c2, bug, detail };
  } finally {
    for (const ch of running) { try { await ch.stop(); } catch { /* already stopped */ } }
  }
}

try {
  const scene = await relayRefusal(C, "c2-" + hex(3));
  check(scene.c2,
    "919a a relay refusal of a root file and of join.json is not kept by content hash: the next cycle puts both, and a program"
    + " restarted from that record puts both: " + scene.detail);
} catch (e) {
  check(false, "harness (the leg 919a): " + (e && e.stack ? e.stack : e));
}

/* plant:relay-waits. Deleting that line, leaving the file valid script, keeps a relay refusal as a stop by content hash. */
{
  const src = path.join(ROOT, "shell", "relay", "channel.cjs");
  const before = fs.readFileSync(src);
  const digest = sha(before);
  let turned = false, detail = "plant line absent";
  try {
    const lines = before.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf("plant:relay-waits") >= 0);
    if (at >= 0) {
      lines.splice(at, 1);
      const lifted = loadPlantedChannel(lines.join("\n"));
      const scene = await relayRefusal(lifted, "c2p-" + hex(3));
      turned = scene.bug === true;
      detail = scene.detail;
    }
  } catch (e) {
    detail = e && e.message ? e.message : String(e);
  }
  const back = sha(fs.readFileSync(src)) === digest;
  check(turned && back, "919b lifting plant:relay-waits keeps the relay's refusal as a stop, and the product file is never written: "
    + detail + ", sha " + (back ? "restored" : "differs"));
}

/* ---- a blob the relay could not serve for a reason that can pass is fetched again (N6(3) of the review of F6, F4 and F9,
   the receive-side twin of F4): the test architect's probe is 947a, its control 947A. Only an answer that the blob is gone
   lets it go (947c). A lead's three files over the relay as built; a desk whose transport answers one fetch as the leg says. ---- */
try {
  if (!W) throw new Error("no relay to drive");
  const KN = crypto.randomBytes(32);
  const FILES = { "lane.ec": "{\"note\":\"Lane Board edition one\"}\n", "zz.ec": "{\"note\":\"a later root file\"}\n" };
  /* A team of its own with its lead's three files on the relay; a desk over it whose fetches of a blob go through `fault`
     (method, url, the count of fetches of that blob so far) answering a reply, or null to reach the relay. */
  async function laneTeam(name) {
    const rt = hex(16), teamId = "t-" + hex(8), D = keyPair(true);
    const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
    if (made.status !== 200) throw new Error("a team for N6 was not made: " + JSON.stringify(made.json));
    const list = [{ id: D.keyId, pub: D.pub, desk: D.keyId }], t = R.clock.now;
    await admin("POST", "/relay/v1/t/" + rt + "/devices", { keys: list, rev: 1, t, sig: signHex(LEAD, core.devicesBytes(rt, 1, t, list)) });
    const pin = { teamId, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
    const lead = program(name + "-lead", LEAD, "root", { rt, pin: () => pin, keyFor: e => (e === 1 ? KN : null) });
    put(lead.mirror, C.TEAM_NAME, JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: teamId, catalogs: ["lane-board"],
      lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev: 1,
      channel: { kind: "relay", rt, url: URLV1 }, roster: [member(D)] }, LEAD), null, 1) + "\n");
    for (const rel of Object.keys(FILES)) put(lead.mirror, rel, FILES[rel]);
    lead.ch.start();
    await settle(lead);
    await lead.ch.stop();
    const deskOn = (fault, o) => {
      const net = transport(name + "-net"), fetched = new Map();
      const request = async (method, url, headers, body) => {
        const m = /\/b\/([0-9a-f]{32})$/.exec(String(url));
        if (method === "GET" && m) {
          fetched.set(m[1], (fetched.get(m[1]) || 0) + 1);
          const f = fault(m[1], fetched.get(m[1]), fetched);
          if (f) return { status: f.status, header: () => null, bytes: Buffer.from(JSON.stringify(f.body)) };
        }
        return net.request(method, url, headers, body);
      };
      const d = program(name + "-desk", D, "desk:" + D.keyId, Object.assign({ rt, pin: () => pin, watch: false, keyFor: e => (e === 1 ? KN : null),
        request, connect: () => null }, o || {}));
      return Object.assign(d, { fetched });
    };
    return { rt, deskOn };
  }
  const landed = d => [C.TEAM_NAME].concat(Object.keys(FILES)).filter(rel => read(d.mirror, rel) !== null).join(",");
  const busy = { status: 503, body: { error: "fault" } }, gone = { status: 404, body: { error: "missing", said: B.REASONS.missing } };

  /* The probe's case: the second blob the desk fetches answered 503 once; four more cycles. */
  {
    const tm = await laneTeam("n6-busy");
    let failed = null;
    const d = tm.deskOn((id, n, fetched) => (!failed && fetched.size === 2 && n === 1 ? (failed = id, busy) : null));
    d.ch.start(); await d.ch.idle();
    await settle(d); d.ch.kick(); await d.ch.idle();
    const again = failed ? d.fetched.get(failed) : 0;
    check(!!failed && again >= 2 && landed(d) === [C.TEAM_NAME, "lane.ec", "zz.ec"].join(",") && read(d.mirror, "lane.ec") === FILES["lane.ec"],
      "947a n6c: a blob the relay answered 503 during a catch-up is fetched again and applied, and the files after it with it: fetched "
      + again + " time(s), the mirror holds " + landed(d));
    await d.ch.stop();
  }
  {
    const tm = await laneTeam("n6-ctl");
    const d = tm.deskOn(() => null);
    d.ch.start(); await d.ch.idle();
    check(landed(d) === [C.TEAM_NAME, "lane.ec", "zz.ec"].join(","), "947A n6c-control: with no fault one catch-up applies all three: " + landed(d));
    await d.ch.stop();
  }

  /* A blob left for want of a key, answered 503 when the key comes and it is fetched again: it stays pending and lands. */
  {
    const tm = await laneTeam("n6-pend");
    const held = new Map();
    let busied = 0;
    const d = tm.deskOn((id, n) => (n === 2 ? (busied++, busy) : null), { keyFor: e => held.get(e) || null });
    d.ch.start(); await d.ch.idle();
    const pendFirst = d.prog.state().pending.length;
    held.set(1, KN);
    d.ch.kick(); await d.ch.idle();
    const pendBusy = d.prog.state().pending.length;
    await settle(d);
    check(pendFirst === 3 && busied === 3 && pendBusy === 3 && d.prog.state().pending.length === 0 && landed(d) === [C.TEAM_NAME, "lane.ec", "zz.ec"].join(","),
      "947b a blob pending for its key and answered 503 when the key comes stays pending and lands at the next cycle: pending "
      + pendFirst + ", " + busied + " answered 503, pending then " + pendBusy + ", at the end " + d.prog.state().pending.length + ", the mirror holds " + landed(d));
    await d.ch.stop();
  }

  /* A blob the relay says is gone is let go: the catch-up moves past it, the files after it land, and it is not asked again. */
  {
    const tm = await laneTeam("n6-gone");
    let failed = null;
    const d = tm.deskOn((id, n, fetched) => (failed === id || (!failed && fetched.size === 2) ? (failed = id, gone) : null));
    d.ch.start(); await d.ch.idle();
    await settle(d);
    const asked = failed ? d.fetched.get(failed) : 0;
    check(!!failed && asked === 1 && landed(d).split(",").length === 2 && d.said.every(l => l.indexOf("The relay answered") < 0),
      "947c a blob the relay says is gone (404) is let go and the catch-up goes on past it: fetched " + asked + " time(s), the mirror holds " + landed(d));
    await d.ch.stop();
  }
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
  /* The second argument is either the shell source to load in place of SRC (a plant) or hooks (a fetch stand-in). */
  function loadDesk(ud, arg) {
    const hooks = arg && typeof arg === "object" ? arg : null;
    const source = typeof arg === "string" ? arg : SRC;
    const said = [], on = {}, invoke = {};
    const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop, info: noop };
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
      decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
    };
    const net = { fetch: (url, init) => {
      deskTransport.log.push((init && init.method) + " " + url);
      if (deskTransport.down) return Promise.reject(new Error("down"));
      if (hooks && typeof hooks.fetch === "function") { const alt = hooks.fetch(url, init); if (alt) return alt; }
      return relayFetch(url, init);
    } };
    const electron = {
      app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
        getVersion: () => "0.0.0", whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
      ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
      BrowserWindow: inert, Menu: inert, dialog: inert, net, protocol: inert, session: inert, shell: inert,
      screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage, powerMonitor: inert,
    };
    process.env.XDG_CURRENT_DESKTOP = "GNOME";
    const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
      source + "\nreturn { " + EXPOSE.join(", ") + " };")(
      n => (n === "electron" ? electron : nodeRequire(n)),
      path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
    const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
    const sync = (ch, ...args) => { const ev = eventFor(); if (on[ch]) on[ch](ev, ...args); return ev.returnValue; };
    const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
    return { api, ask, sync, said, ud, envelope };
  }
  const newDesk = (name, folder, hooks) => {
    const ud = path.join(LAB, name);
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: folder, eUiLang: "en" } }), "utf8");
    return loadDesk(ud, hooks);
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
  const made = await admin("POST", "/relay/v1/teams", createBody(RT2, R.clock.now));
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
  const codeOf = secret => {
    const mac = crypto.createHmac("sha256", Buffer.from(secret || SECRET, "hex")).update(Buffer.from(LEAD.pub, "hex")).digest();
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

  /* Slice 3, item 4: a read sends nothing, a no leaves the token, and yes asks for no check code. */
  async function relayInviteOn(rt, teamId) {
    const secret = hex(16), inv = hex(16), token = hex(32), at = R.clock.now;
    const hash = sha(Buffer.from(token, "utf8"));
    const res = await admin("POST", "/relay/v1/t/" + rt + "/invites", { add: [{ id: inv, hash: hash }], drop: [], t: at,
      sig: signHex(LEAD, core.invitesBytes(rt, at, [{ id: inv, hash: hash }], [])) });
    if (res.status !== 200) throw new Error("an invitation was not registered: " + JSON.stringify(res.json));
    const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team: teamId, relay: { rt: rt, url: URL2, token: token, inv: inv },
      lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret: secret }), "utf8").toString("base64url");
    return { secret: secret, inv: inv, token: token, text: text };
  }
  function loadFrom(text, ud) {
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
    const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
      text + "\nreturn { " + EXPOSE.join(", ") + " };")(
      n => (n === "electron" ? electron : nodeRequire(n)),
      path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
    const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
    return { api, ask, said, ud, envelope: () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8")) };
  }
  async function liftDesk(tag, fn) {
    const src = path.join(ROOT, "shell", "main.js");
    const beforeBytes = fs.readFileSync(src);
    const digest = sha(beforeBytes);
    let turned = false, detail = "plant line absent";
    try {
      const lines = beforeBytes.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf(tag) >= 0);
      if (at >= 0) {
        lines.splice(at, 1);
        const next = lines.join("\n");
        turned = await fn(next);
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) {
      detail = e && e.stack ? e.stack : String(e);
    }
    return { turned, back: sha(fs.readFileSync(src)) === digest, detail };
  }
  const quietInvite = await relayInviteOn(RT2, TEAM2);
  const beforeRead = deskTransport.log.length;
  const Dq = newDesk("join-quiet", path.join(LAB, "join-quiet-share"));
  fs.mkdirSync(path.join(LAB, "join-quiet-share"), { recursive: true });
  const readQ = await Dq.ask("etiuda:team-join", "read", quietInvite.text);
  const readCalls = deskTransport.log.length - beforeRead;
  const laterQ = await tokenHello(C, RT2, quietInvite.token, quietInvite.inv, keyPair(true));
  const yesInvite = await relayInviteOn(RT2, TEAM2);
  const Dy = newDesk("join-yes", path.join(LAB, "join-yes-share"));
  fs.mkdirSync(path.join(LAB, "join-yes-share"), { recursive: true });
  const offerY = await Dy.ask("etiuda:team-join", "read", yesInvite.text);
  const takenY = await Dy.ask("etiuda:team-join", "invite", yesInvite.text, "Desk Nine", "");
  const envY = Dy.envelope();
  const keptY = envY.teamJoin && envY.teamJoin.invite && envY.teamJoin.invite.relay;
  const secretKept = JSON.stringify(envY).indexOf(yesInvite.secret) >= 0;
  const oY = offerY && offerY.offer;
  check(readCalls === 0 && laterQ.online === true && laterQ.used === true && !!oY && oY.lead === "Ada Quay" && oY.team === TEAM2
    && oY.relay === "relay.test" && oY.code == null && takenY && !takenY.refused && !!keptY && typeof keptY.wrap === "string" && keptY.wrap !== ""
    && !secretKept,
    "964a before yes no relay call is made, a no leaves the token for a second computer, and yes asks for no check code: "
    + "calls on read " + readCalls + ", the token then " + (laterQ.online ? "opened" : "not opened")
    + ", offer " + JSON.stringify(oY && { lead: oY.lead, team: oY.team, relay: oY.relay, code: oY.code })
    + ", yes " + (takenY && takenY.refused ? "refused " + takenY.refused : "taken")
    + ", wrap " + (keptY && keptY.wrap ? "kept" : "absent") + ", secret " + (secretKept ? "kept" : "absent"));
  const codePlant = await liftDesk("plant:relay-code", async text => {
    const invP = await relayInviteOn(RT2, TEAM2);
    const ud = path.join(LAB, "join-plant-" + hex(4));
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: path.join(LAB, "join-plant-share"), eUiLang: "en" } }), "utf8");
    fs.mkdirSync(path.join(LAB, "join-plant-share"), { recursive: true });
    const Dp = loadFrom(text, ud);
    const refused = await Dp.ask("etiuda:team-join", "invite", invP.text, "Desk Nine", "");
    return !!(refused && refused.refused === "check");
  });
  check(codePlant.turned && codePlant.back,
    "964b lifting plant:relay-code refuses a relay yes that carries no check code, and the product file is never written: "
    + codePlant.detail + ", sha " + (codePlant.back ? "restored" : "differs"));

  /* Slice 3, item 5: the wrap's team key reads a catalog before the lead admits this desk, on its own relay team so the
     admission above still meets edition 1. This tree's relay has no wrap route; the stand-in below answers only this desk. */
  const RTW = hex(16), TEAMW = "t-" + hex(8), KW = crypto.randomBytes(32), URLW = URLV1;
  const madeW = await admin("POST", "/relay/v1/teams", createBody(RTW, R.clock.now));
  if (madeW.status !== 200) throw new Error("the wrap team was not made: " + JSON.stringify(madeW.json));
  const teamDocW = (rev, roster) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: TEAMW, catalogs: ["quay-board"],
    lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev: rev,
    channel: { kind: "relay", rt: RTW, url: URLW }, ring: RING, roster: roster || [] }, LEAD), null, 1) + "\n";
  const studioWMirror = path.join(LAB, "wrap-studio");
  const invitesW = [];
  const studioWT = transport("wrap-studio");
  const studioW = C.createChannel({ rt: RTW, url: URLW, mirror: studioWMirror, stateFile: path.join(LAB, "wrap-studio.json"),
    pin: () => ({ teamId: TEAMW, rt: RTW, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
    me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }),
    keyFor: e => (e === 1 ? KW : null), sealEpoch: () => 1, inviteKeys: () => invitesW,
    request: studioWT.request, connect: studioWT.connect, pollMs: 1e9 });
  put(studioWMirror, "board.ec", JSON.stringify(D.api.sealCatalog(KW, TEAMW, 1, catalogText(1))));
  put(studioWMirror, C.TEAM_NAME, teamDocW(1));
  studioW.start();
  await studioW.idle();
  async function inviteOnW(epoch) {
    const secret = hex(16), inv = hex(16), token = hex(32), hash = sha(Buffer.from(token, "utf8")), at = R.clock.now;
    const res = await admin("POST", "/relay/v1/t/" + RTW + "/invites", { add: [{ id: inv, hash: hash }], drop: [], t: at,
      sig: signHex(LEAD, core.invitesBytes(RTW, at, [{ id: inv, hash: hash }], [])) });
    if (res.status !== 200) throw new Error("a wrap invitation was not registered: " + JSON.stringify(res.json));
    invitesW.push({ id: inv, key: C.inviteSealKey(secret) });
    await studioW.kick(); await studioW.idle();
    const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team: TEAMW, relay: { rt: RTW, url: URLW, token: token, inv: inv },
      lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret: secret }), "utf8").toString("base64url");
    const wrap = B.sealInviteWrap({ secret: secret, relayTeamId: RTW, teamId: TEAMW, invitationId: inv, epoch: epoch, key: KW });
    return { text: text, wrap: wrap };
  }
  function deskOnWrap(name, wrap) {
    const folder = path.join(LAB, name + "-share");
    fs.mkdirSync(folder, { recursive: true });
    return newDesk(name, folder, { fetch: (url, init) => (init && init.method === "GET" && String(url).endsWith("/wrap")
      ? new Response(Buffer.from(JSON.stringify({ wrap: wrap }), "utf8"), { status: 200, headers: { "content-type": "application/json" } })
      : null) });
  }
  const invA = await inviteOnW(1);
  const markA = deskTransport.log.length;
  const Dw = deskOnWrap("wrap-read", invA.wrap);
  const takenA = await Dw.ask("etiuda:team-join", "invite", invA.text, "Desk Nine", "");
  const meA = await Dw.ask("etiuda:branch-identity", false);
  const joinA = "desks/" + meA.id + "/join.json";
  const mirrorA = path.join(Dw.ud, "relay", RTW);
  const readNow = await until(async () => {
    const ch = Dw.api.relayRun();
    if (ch) { ch.kick(); await ch.idle(); }
    return factsOf(Dw.api.readCatalog() || "") === 1;
  }, 8000);
  let atLead = false, later = false, still = false;
  if (readNow) {
    atLead = await until(async () => { await studioW.kick(); await studioW.idle(); return !!read(studioWMirror, joinA); }, 8000);
    put(studioWMirror, "board.ec", JSON.stringify(D.api.sealCatalog(KW, TEAMW, 1, catalogText(2))));
    await studioW.kick(); await studioW.idle();
    const chLater = Dw.api.relayRun();
    if (chLater) { chLater.kick(); await chLater.idle(); }
    later = factsOf(Dw.api.readCatalog() || "") === 2;
    still = !!read(studioWMirror, joinA) && !!read(mirrorA, joinA);
  }
  const putsA = deskTransport.log.slice(markA).filter(l => l.startsWith("PUT ") && l.indexOf("/t/" + RTW + "/") >= 0).length;
  check(!!takenA && !takenA.refused && readNow && putsA === 1 && atLead && !later && still,
    "965a yes opens the wrap and reads a catalog before the lead admits it, uploads join.json once, and a later catalog stays unread: "
    + "yes " + (takenA && takenA.refused ? "refused " + takenA.refused : "taken")
    + ", catalog " + (readNow ? "read" : "unread") + ", uploads " + putsA
    + ", at the lead " + (atLead ? "yes" : "no") + ", later " + (later ? "read" : "unread")
    + ", request " + (still ? "kept" : "gone"));
  const invE = await inviteOnW(2);
  const De = deskOnWrap("wrap-epoch", invE.wrap);
  const takenE = await De.ask("etiuda:team-join", "invite", invE.text, "Desk Nine", "");
  const saidEpoch = await until(async () => {
    const ch = De.api.relayRun();
    if (ch) { ch.kick(); await ch.idle(); }
    return De.said.some(l => l.indexOf(B.REASONS.epoch) >= 0);
  }, 8000);
  const unreadE = factsOf(De.api.readCatalog() || "") !== 1;
  check(!!takenE && !takenE.refused && saidEpoch && unreadE,
    "965b a wrap whose epoch is not the signed team file's is refused and said, and that catalog is not read: "
    + (saidEpoch ? "said" : "not said") + ", catalog " + (unreadE ? "unread" : "read"));
  function dropCopiedChannel() {
    const want = path.normalize(path.join(APP, "shell", "relay", "channel.cjs"));
    for (const k of Object.keys(nodeRequire.cache)) if (path.normalize(k) === want) delete nodeRequire.cache[k];
  }
  function freshChannel() {
    const file = path.join(APP, "shell", "relay", "channel.cjs");
    dropCopiedChannel();
    return nodeRequire(file);
  }
  async function liftChannel(tag, fn) {
    const file = path.join(ROOT, "shell", "relay", "channel.cjs");
    const copy = path.join(APP, "shell", "relay", "channel.cjs");
    const beforeBytes = fs.readFileSync(file);
    const digest = sha(beforeBytes);
    let turned = false, detail = "plant line absent";
    try {
      const lines = beforeBytes.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf(tag) >= 0);
      if (at >= 0) {
        lines.splice(at, 1);
        const next = lines.join("\n");
        fs.writeFileSync(copy, next);
        dropCopiedChannel();
        turned = await fn();
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) {
      detail = e && e.stack ? e.stack : String(e);
    } finally {
      fs.writeFileSync(copy, beforeBytes);
      dropCopiedChannel();
    }
    return { turned: turned, back: sha(fs.readFileSync(file)) === digest, detail: detail };
  }
  const openPlant = await liftChannel("plant:wrap-open", async () => {
    const invP = await inviteOnW(1);
    const Dp = deskOnWrap("wrap-plant", invP.wrap);
    const takenP = await Dp.ask("etiuda:team-join", "invite", invP.text, "Desk Nine", "");
    const end = Date.now() + 4000;
    while (Date.now() < end) {
      const ch = Dp.api.relayRun();
      if (ch) { ch.kick(); await ch.idle(); }
      if (factsOf(Dp.api.readCatalog() || "") === 1) return false;
      await wait(40);
    }
    return !!(takenP && !takenP.refused) && factsOf(Dp.api.readCatalog() || "") !== 1;
  });
  check(openPlant.turned && openPlant.back,
    "965c lifting plant:wrap-open leaves the catalog unread, and the product file is never written: "
    + openPlant.detail + ", sha " + (openPlant.back ? "restored" : "differs"));

  /* Board 922, E2. The wrap is asked for only on the invitation's own session, before its one upload. A wrap refused for its
     epoch, the upload, a restart, then enrolment, with the relay answering the wrap token-spent now that it has deleted it:
     the enrolled desk must not ask for the wrap again, and must still read the team. */
  async function plantChannel(edits, fn) {
    const file = path.join(ROOT, "shell", "relay", "channel.cjs");
    const copy = path.join(APP, "shell", "relay", "channel.cjs");
    const beforeBytes = fs.readFileSync(file);
    const digest = sha(beforeBytes);
    let turned = false, detail = "plant line absent";
    try {
      const lines = beforeBytes.toString("utf8").split(/\n/);
      const at = edits.map(e => lines.findIndex(l => l.indexOf(e.tag) >= 0));
      if (at.every(i => i >= 0)) {
        edits.forEach((e, k) => { lines[at[k]] = e.text; });
        const next = lines.filter(l => l !== null).join("\n");
        fs.writeFileSync(copy, next);
        dropCopiedChannel();
        turned = await fn();
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) {
      detail = e && e.stack ? e.stack : String(e);
    } finally {
      fs.writeFileSync(copy, beforeBytes);
      dropCopiedChannel();
    }
    return { turned: turned, back: sha(fs.readFileSync(file)) === digest, detail: detail };
  }
  let devRevW = 0, teamRevW = 1;
  const devKeysW = [];
  async function wrapRestart(label, edition) {
    const inv = await inviteOnW(2);
    const seen = { asks: 0, afterUpload: 0 };
    let mode = "serve", uploaded = false;
    const hooks = { fetch: (url, init) => {
      if (!(init && init.method === "GET" && String(url).endsWith("/wrap"))) return null;
      seen.asks += 1;
      if (uploaded) seen.afterUpload += 1;
      const body = mode === "serve" ? { wrap: inv.wrap } : { error: "token-spent" };
      return new Response(Buffer.from(JSON.stringify(body), "utf8"), { status: mode === "serve" ? 200 : 403, headers: { "content-type": "application/json" } });
    } };
    const folder = path.join(LAB, label + "-share");
    fs.mkdirSync(folder, { recursive: true });
    const first = newDesk(label, folder, hooks);
    const taken = await first.ask("etiuda:team-join", "invite", inv.text, "Desk Nine", "");
    const me = await first.ask("etiuda:branch-identity", false);
    const joinRel = "desks/" + me.id + "/join.json";
    const said = await until(async () => {
      const ch = first.api.relayRun();
      if (ch) { ch.kick(); await ch.idle(); }
      return first.said.some(l => l.indexOf(B.REASONS.epoch) >= 0);
    }, 8000);
    uploaded = await until(async () => {
      const ch = first.api.relayRun();
      if (ch) { ch.kick(); await ch.idle(); }
      await studioW.kick(); await studioW.idle();
      return !!read(studioWMirror, joinRel);
    }, 8000);
    const keptAfterUpload = !!((((first.envelope().teamJoin || {}).invite || {}).relay || {}).wrap);
    const stopFirst = first.api.relayRun();
    if (stopFirst) await stopFirst.stop();
    mode = "spent";
    const second = loadDesk(first.ud, hooks);
    const notYet = second.api.relayRun();
    if (notYet) { notYet.kick(); await notYet.idle(); }
    teamRevW += 1;
    devRevW += 1;
    devKeysW.push({ id: me.id, pub: me.key, desk: me.id });
    const entry = { desk: { id: me.id, key: me.key, box: me.box }, wrap: D.api.wrapTeamKey(KW, me.box, TEAMW, 1, me.id) };
    put(studioWMirror, "board.ec", JSON.stringify(D.api.sealCatalog(KW, TEAMW, 1, catalogText(edition))));
    put(studioWMirror, C.TEAM_NAME, teamDocW(teamRevW, [entry]));
    const t1 = R.clock.now, keys = devKeysW.slice();
    await admin("POST", "/relay/v1/t/" + RTW + "/devices", { keys: keys, rev: devRevW, t: t1, sig: signHex(LEAD, core.devicesBytes(RTW, devRevW, t1, keys)) });
    await studioW.kick(); await studioW.idle();
    const read2 = await until(async () => {
      const ch = second.api.relayRun();
      if (ch) { ch.kick(); await ch.idle(); }
      return factsOf(second.api.readCatalog() || "") === edition;
    }, 8000);
    const stopSecond = second.api.relayRun();
    if (stopSecond) await stopSecond.stop();
    return { taken: taken, said: said, uploaded: uploaded, keptAfterUpload: keptAfterUpload, read: read2, asks: seen.asks, afterUpload: seen.afterUpload };
  }
  const e2 = await wrapRestart("wrap-restart", 3);
  check(!!e2.taken && !e2.taken.refused && e2.said && e2.uploaded && !e2.keptAfterUpload && e2.read && e2.afterUpload === 0,
    "966a a wrap refused for its epoch, the one upload, a restart, then enrolment with the relay answering the wrap token-spent: the wrap key is"
    + " forgotten at the upload, the wrap is not asked for again, and the enrolled desk reads the team's edition: wrap "
    + (e2.said ? "refused and said" : "not refused") + ", upload " + (e2.uploaded ? "at the lead" : "absent")
    + ", wrap key " + (e2.keptAfterUpload ? "kept" : "forgotten") + ", asks after the upload " + e2.afterUpload
    + ", edition " + (e2.read ? "read" : "unread"));
  const PUT_BACK_REFUSED = '    const why = r.refused || refusalOf(r); if (why.reason === "token-spent") return why; wrapPhase = "none";';
  const e2Plant = await plantChannel([{ tag: "plant:S3-wrap-once", text: null }, { tag: "plant:S3-wrap-gone", text: null },
    { tag: "plant:S3-wrap-refused", text: PUT_BACK_REFUSED }], async () => {
    const again = await wrapRestart("wrap-restart-plant", 4);
    return !again.read;
  });
  check(e2Plant.turned && e2Plant.back,
    "966b putting back the wrap ask after the upload, the kept wrap key and the early return on token-spent leaves the enrolled desk reading nothing,"
    + " and the product file is never written: " + e2Plant.detail + ", sha " + (e2Plant.back ? "restored" : "differs"));
  /* The same on the channel alone, so that each line is held by a check of its own: before the upload a wrap answered
     token-spent stops nothing, and once the upload is made the key is not asked for the wrap again. */
  async function wrapStandIn(mod, label) {
    const rt = hex(16), who = keyPair(true), seal = crypto.randomBytes(32), inv = hex(16), token = hex(32), wrapKey = crypto.randomBytes(32);
    const mirror = path.join(LAB, label), stateFile = path.join(LAB, label + ".json");
    const n = { wrap1: 0, since1: 0, put1: 0, wrap2: 0, since2: 0 };
    let phase = 1;
    const request = async (method, url, headers, body) => {
      const u = String(url);
      const json = (obj, status) => ({ status: status || 200, header: () => null, bytes: Buffer.from(JSON.stringify(obj)) });
      if (method === "POST" && u.endsWith("/hello")) return json({ challenge: hex(16) });
      if (method === "POST" && u.endsWith("/session")) {
        const asked = JSON.parse(Buffer.from(body).toString("utf8"));
        if (phase === 1 && !asked.invite) return json({ error: "not-enrolled" }, 403);
        return json({ session: hex(32) });
      }
      if (method === "GET" && u.endsWith("/wrap")) { n["wrap" + phase] += 1; return json({ error: "token-spent" }, 403); }
      if (method === "GET" && u.indexOf("/since/") >= 0) { n["since" + phase] += 1; return json([]); }
      if (method === "PUT") { if (phase === 1) n.put1 += 1; return json({ ok: true }); }
      return json({ error: "missing" }, 404);
    };
    put(mirror, "desks/" + who.keyId + "/join.json", "{\"kind\":\"etiuda-join-request\"}\n");
    const make = () => mod.createChannel({ rt, url: URLV1, mirror, stateFile, watch: false, pollMs: 1e9,
      pin: () => ({ teamId: "t-wrap-stand-in", rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
      me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place: "desk:" + who.keyId }),
      invite: () => ({ inv, token, seal, wrapKey }),
      keyFor: () => null, sealEpoch: () => null, request, connect: null });
    let ch = make();
    try { ch.start(); await ch.idle(); } finally { await ch.stop(); }
    phase = 2;
    ch = make();
    try { ch.start(); await ch.idle(); } finally { await ch.stop(); }
    return n;
  }
  const standIn = await wrapStandIn(C, "wrap-stand-in");
  check(standIn.wrap1 === 1 && standIn.since1 === 1 && standIn.put1 === 1 && standIn.wrap2 === 0 && standIn.since2 >= 1,
    "966c before the upload a wrap answered token-spent stops nothing (the team is read and the request goes), and once the request has gone the wrap"
    + " is not asked for again: first cycle asks " + standIn.wrap1 + ", reads " + standIn.since1 + ", uploads " + standIn.put1
    + "; after the upload asks " + standIn.wrap2 + ", reads " + standIn.since2);
  const refusedPlant = await plantChannel([{ tag: "plant:S3-wrap-refused", text: PUT_BACK_REFUSED }], async () => {
    const lifted = freshChannel();
    const again = await wrapStandIn(lifted, "wrap-stand-in-refused");
    return again.since1 === 0 && again.put1 === 0;
  });
  check(refusedPlant.turned && refusedPlant.back,
    "966d putting back the early return on token-spent stops the first cycle before the team is read, and the product file is never written: "
    + refusedPlant.detail + ", sha " + (refusedPlant.back ? "restored" : "differs"));
  const oncePlant = await plantChannel([{ tag: "plant:S3-wrap-once", text: null }], async () => {
    const lifted = freshChannel();
    const again = await wrapStandIn(lifted, "wrap-stand-in-once");
    return again.wrap2 === 1;
  });
  check(oncePlant.turned && oncePlant.back,
    "966e lifting plant:S3-wrap-once asks for the wrap again after the upload, and the product file is never written: "
    + oncePlant.detail + ", sha " + (oncePlant.back ? "restored" : "differs"));
  /* Board 922, F1. A relay invitation the relay answers token-spent, or invite-ended, is kept with the request and said in its view,
     which the page draws, and not only in the console. */
  async function endedJoin(label, error) {
    const inv = await inviteOnW(1);
    const hooks = { fetch: (url, init) => (init && init.method === "POST" && String(url).endsWith("/session") && init.body
      && String(init.body).indexOf('"invite"') >= 0
      ? new Response(Buffer.from(JSON.stringify({ error: error }), "utf8"), { status: 403, headers: { "content-type": "application/json" } })
      : null) };
    const folder = path.join(LAB, label + "-share");
    fs.mkdirSync(folder, { recursive: true });
    const desk = newDesk(label, folder, hooks);
    const taken = await desk.ask("etiuda:team-join", "invite", inv.text, "Desk Nine", "");
    let view = null;
    const shown = await until(async () => {
      const ch = desk.api.relayRun();
      if (ch) { ch.kick(); await ch.idle(); }
      view = await desk.ask("etiuda:team-join", "view");
      return !!(view && view.join && view.join.state !== "waiting");
    }, 6000);
    const kept = (((((desk.envelope().teamJoin || {}).invite || {}).relay || {}).end)) || "";
    const again = loadDesk(desk.ud);
    const after = await again.ask("etiuda:team-join", "view");
    const stop = desk.api.relayRun();
    if (stop) await stop.stop();
    return { taken: taken, shown: shown, view: view, kept: kept, reloaded: after && after.join ? after.join.state : "none" };
  }
  const viewSays = (r, state) => !!(r.taken && !r.taken.refused && r.shown && r.view && r.view.join && r.view.join.state === state
    && r.view.join.invite && r.view.join.invite.relay === new URL(URLW).host && r.view.join.team === TEAMW);
  const usedJoin = await endedJoin("ended-used", "token-spent");
  check(viewSays(usedJoin, "used") && usedJoin.kept === "used" && usedJoin.reloaded === "used",
    "967a a relay invitation answered token-spent is said in the request's view, naming the relay, and kept with the request through a restart: view "
    + (usedJoin.view && usedJoin.view.join ? usedJoin.view.join.state : "none") + ", kept " + JSON.stringify(usedJoin.kept) + ", after a restart " + usedJoin.reloaded);
  const endedJoined = await endedJoin("ended-expired", "invite-ended");
  check(viewSays(endedJoined, "ended") && endedJoined.kept === "ended" && endedJoined.reloaded === "ended",
    "967b a relay invitation answered invite-ended is said in the request's view, naming the relay, and kept with the request through a restart: view "
    + (endedJoined.view && endedJoined.view.join ? endedJoined.view.join.state : "none") + ", kept " + JSON.stringify(endedJoined.kept) + ", after a restart " + endedJoined.reloaded);
  const usedLift = await liftChannel("plant:S3-page-used", async () => {
    const again = await endedJoin("ended-used-plant", "token-spent");
    return !again.shown && again.kept === "";
  });
  check(usedLift.turned && usedLift.back,
    "967c lifting plant:S3-page-used leaves the used invitation unsaid in the view, and the product file is never written: "
    + usedLift.detail + ", sha " + (usedLift.back ? "restored" : "differs"));
  const endedLift = await liftChannel("plant:S3-page-ended", async () => {
    const again = await endedJoin("ended-expired-plant", "invite-ended");
    return !again.shown && again.kept === "";
  });
  check(endedLift.turned && endedLift.back,
    "967d lifting plant:S3-page-ended leaves the expired invitation unsaid in the view, and the product file is never written: "
    + endedLift.detail + ", sha " + (endedLift.back ? "restored" : "differs"));
  dropCopiedChannel();
  await studioW.stop();

  /* The lead's answer, sealed to the desk's box. Joined is said once and the request stays. Refused is said on the request. */
  {
    const LBA = boxPair();
    const RTA = hex(16), TEAMA = "t-" + hex(8), KA = crypto.randomBytes(32);
    const madeA = await admin("POST", "/relay/v1/teams", createBody(RTA, R.clock.now));
    if (madeA.status !== 200) throw new Error("the answer team was not made: " + JSON.stringify(madeA.json));
    const invitesA = [];
    async function inviteA() {
      const secret = hex(16), inv = hex(16), token = hex(32), hash = sha(Buffer.from(token, "utf8")), at = R.clock.now;
      const res = await admin("POST", "/relay/v1/t/" + RTA + "/invites", { add: [{ id: inv, hash }], drop: [], t: at,
        sig: signHex(LEAD, core.invitesBytes(RTA, at, [{ id: inv, hash }], [])) });
      if (res.status !== 200) throw new Error("an answer invitation was not registered: " + JSON.stringify(res.json));
      invitesA.push({ id: inv, key: C.inviteSealKey(secret) });
      const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team: TEAMA, relay: { rt: RTA, url: URLV1, token, inv },
        lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay", box: LBA.pub }, secret }), "utf8").toString("base64url");
      return { inv, text };
    }
    const one = await inviteA(), two = await inviteA();
    const leadMirror = path.join(LAB, "answer-lead");
    const leadT = transport("answer-lead");
    const teamDocA = JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: TEAMA, catalogs: ["quay-board"],
      lead: { keyId: LEAD.keyId, public: LEAD.pub, box: LBA.pub }, sealed: true, exportsSealed: false, epoch: 1, rev: 1,
      channel: { kind: "relay", rt: RTA, url: URLV1 }, ring: RING, roster: [] }, LEAD), null, 1) + "\n";
    put(leadMirror, C.TEAM_NAME, teamDocA);
    const leadA = C.createChannel({ rt: RTA, url: URLV1, mirror: leadMirror, stateFile: path.join(LAB, "answer-lead.json"),
      pin: () => ({ teamId: TEAMA, rt: RTA, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
      me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root", box: LBA.pub }),
      agree: agreeWith(LBA), keyFor: e => (e === 1 ? KA : null), sealEpoch: () => 1, inviteKeys: () => invitesA,
      request: leadT.request, connect: leadT.connect, pollMs: 1e9 });
    leadA.start();
    await leadA.idle();
    async function takeOne(name, offer) {
      const folder = path.join(LAB, name + "-share");
      fs.mkdirSync(folder, { recursive: true });
      const desk = newDesk(name, folder);
      const taken = await desk.ask("etiuda:team-join", "invite", offer.text, "Desk Nine", "");
      const who = await desk.ask("etiuda:branch-identity", false);
      const rel = "desks/" + who.id + "/join.json";
      const landed = await until(async () => {
        const ch = desk.api.relayRun();
        if (ch) { ch.kick(); await ch.idle(); }
        await leadA.kick(); await leadA.idle();
        return !!read(leadMirror, rel);
      }, 8000);
      const doc = landed ? JSON.parse(read(leadMirror, rel)) : null;
      return { desk, taken, who, rel, doc };
    }
    const joined = await takeOne("answer-join", one);
    const wroteJoin = joined.doc ? await leadA.writeAnswer({ inv: one.inv, deskId: joined.doc.desk.id, deskBox: joined.doc.desk.box,
      leadBox: LBA.pub, answer: "joined" }) : { ok: false, reason: "no-request" };
    const markJ = deskTransport.log.length;
    let shownJ = null;
    await until(async () => {
      const ch = joined.desk.api.relayRun();
      if (ch) { ch.kick(); await ch.idle(); }
      const v = await joined.desk.ask("etiuda:team-join", "view");
      if (v && v.joined && v.joined.team === TEAMA) { shownJ = v; return true; }
      return false;
    }, 8000);
    const afterJ = deskTransport.log.slice(markJ).filter(l => l.indexOf("/t/" + RTA + "/") >= 0);
    const fetchedJ = afterJ.some(l => l.indexOf("/b/" + one.inv) >= 0);
    const listedJ = afterJ.some(l => l.indexOf("/since/") >= 0 || l.indexOf("/socket") >= 0);
    const keptJ = !!read(leadMirror, joined.rel) && !!read(path.join(joined.desk.ud, "relay", RTA), joined.rel);
    const refused = await takeOne("answer-refuse", two);
    const wroteNo = refused.doc ? await leadA.writeAnswer({ inv: two.inv, deskId: refused.doc.desk.id, deskBox: refused.doc.desk.box,
      leadBox: LBA.pub, answer: "refused" }) : { ok: false, reason: "no-request" };
    let shownNo = null;
    await until(async () => {
      const ch = refused.desk.api.relayRun();
      if (ch) { ch.kick(); await ch.idle(); }
      const v = await refused.desk.ask("etiuda:team-join", "view");
      if (v && v.join && v.join.state === "refused") { shownNo = v; return true; }
      return false;
    }, 8000);
    const keptNo = !!read(leadMirror, refused.rel);
    check(!!joined.taken && !joined.taken.refused && wroteJoin.ok === true && !!shownJ && shownJ.joined.team === TEAMA
      && keptJ && fetchedJ && !listedJ && !!refused.taken && !refused.taken.refused && wroteNo.ok === true
      && !!shownNo && shownNo.joined == null && keptNo,
      "922a the lead's answer is opened by the desk that asked: joined is said and the request stays, refused is said and the request stays: "
      + "joined " + (wroteJoin.ok ? "written" : (wroteJoin.reason || "not written"))
      + ", view " + (shownJ && shownJ.joined ? shownJ.joined.team : "none")
      + ", request " + (keptJ ? "kept" : "gone")
      + ", fetch " + (fetchedJ ? "the answer" : "absent") + (listedJ ? ", and a team read" : "")
      + "; refused " + (wroteNo.ok ? "written" : (wroteNo.reason || "not written"))
      + ", view " + (shownNo && shownNo.join ? shownNo.join.state : "none")
      + ", joined " + (shownNo && shownNo.joined ? "also said" : "not said")
      + ", request " + (keptNo ? "kept" : "gone"));
    await leadA.stop();
  }
  const devicePlant = await liftChannel("plant:S3-device", async () => {
    const CC = freshChannel();
    const rt = hex(16), who = keyPair(true), seal = crypto.randomBytes(32), teamKey = crypto.randomBytes(32);
    /* One invitation for the whole scene, as a desk holds one: its id is what the channel's per-invitation marks key on. */
    const devInvite = { inv: hex(16), token: hex(32), seal };
    const mirror = path.join(LAB, "device-plant");
    const puts = [];
    let sessions = 0;
    const request = async (method, url) => {
      const u = String(url);
      const json = (obj, status) => ({ status: status || 200, header: () => null, bytes: Buffer.from(JSON.stringify(obj)) });
      if (method === "POST" && u.endsWith("/hello")) return json({ challenge: hex(16) });
      if (method === "POST" && u.endsWith("/session")) {
        sessions += 1;
        const out = { session: hex(32) };
        if (sessions === 1) out.invite = true;
        return json(out);
      }
      if (method === "GET" && u.indexOf("/since/") >= 0) return json([]);
      if (method === "PUT") { puts.push(u); return json({ ok: true }); }
      return json({ error: "missing" }, 404);
    };
    put(mirror, "desks/" + who.keyId + "/join.json", "{\"kind\":\"etiuda-join-request\"}\n");
    let ch = null;
    try {
      ch = CC.createChannel({ rt, url: URLV1, mirror, stateFile: path.join(LAB, "device-plant.json"), watch: false, pollMs: 1e9,
        pin: () => ({ teamId: "t-device-plant", rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
        me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place: "desk:" + who.keyId }),
        invite: () => devInvite,
        keyFor: () => teamKey, sealEpoch: () => 1, request, connect: null });
      ch.start();
      await ch.idle();
      if (puts.length !== 1) throw new Error("join uploads " + puts.length + ", sessions " + sessions);
      put(mirror, "desks/" + who.keyId + "/note.txt", "A note after the request.\n");
      ch.kick();
      await ch.idle();
      return puts.length === 1;
    } finally {
      if (ch) await ch.stop();
    }
  });
  dropCopiedChannel();
  check(devicePlant.turned && devicePlant.back,
    "922c lifting plant:S3-device keeps the enrolled hello on the invitation's session, so a later file is not sent, and the product file is never written: "
    + devicePlant.detail + ", sha " + (devicePlant.back ? "restored" : "differs"));

  /* Past the session keep, the request is up and the key is not enrolled: the desk says it is waiting, not that the key
     failed. The clock moves; nothing here waits on the wall. */
  async function waitSaid(mod) {
    const rt = hex(16), who = keyPair(true), seal = crypto.randomBytes(32), inv = hex(16);
    const mirror = path.join(LAB, "wait-" + inv.slice(0, 8));
    const said = [], puts = [];
    let sessions = 0, now = 1700000000000, ch = null;
    const request = async (method, url) => {
      const u = String(url);
      const json = (obj, status) => ({ status: status || 200, header: () => null, bytes: Buffer.from(JSON.stringify(obj)) });
      if (method === "POST" && u.endsWith("/hello")) return json({ challenge: hex(16) });
      if (method === "POST" && u.endsWith("/session")) {
        sessions += 1;
        if (sessions === 1) return json({ session: hex(32), invite: true });
        return json({ error: "not-enrolled" }, 403);
      }
      if (method === "GET" && u.indexOf("/since/") >= 0) return json([]);
      if (method === "GET" && u.indexOf("/b/") >= 0) return json({ error: "missing" }, 404);
      if (method === "PUT") { puts.push(u); return json({ ok: true }); }
      return json({ error: "missing" }, 404);
    };
    put(mirror, "desks/" + who.keyId + "/join.json", "{\"kind\":\"etiuda-join-request\"}\n");
    try {
      ch = mod.createChannel({ rt, url: URLV1, mirror, stateFile: path.join(LAB, "wait-" + inv.slice(0, 8) + ".json"),
        watch: false, pollMs: 1e9, clock: () => now,
        pin: () => ({ teamId: "t-wait-said", rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
        me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place: "desk:" + who.keyId }),
        invite: () => ({ inv, token: hex(32), seal }),
        keyFor: () => null, sealEpoch: () => null, request, connect: null, say: l => said.push(l) });
      ch.start();
      await ch.idle();
      now += mod.SESSION_KEEP_MS + 1000;
      said.length = 0;
      ch.kick();
      await ch.idle();
      return { uploads: puts.length, said: said.slice() };
    } finally {
      if (ch) await ch.stop();
    }
  }
  const waiting = await waitSaid(C);
  const waitLine = "Waiting for the team's lead to let this desk in.";
  const namedWait = waiting.said.some(l => l.indexOf(waitLine) >= 0);
  const saidFault = waiting.said.some(l => l.indexOf("not enrolled") >= 0);
  check(waiting.uploads === 1 && namedWait && !saidFault,
    "922b past the session keep, invited and not enrolled, the desk says it is waiting for the lead: "
    + "uploads " + waiting.uploads + ", said " + JSON.stringify(waiting.said));
  const waitPlant = await liftChannel("plant:S3-wait", async () => {
    const lifted = freshChannel();
    const again = await waitSaid(lifted);
    return again.uploads === 1 && !again.said.some(l => l.indexOf(waitLine) >= 0);
  });
  dropCopiedChannel();
  check(waitPlant.turned && waitPlant.back,
    "922d lifting plant:S3-wait leaves the wait unsaid, and the product file is never written: "
    + waitPlant.detail + ", sha " + (waitPlant.back ? "restored" : "differs"));

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
  /* N1: the team key unwrapped is the end of the request, the Team cover never read: the request goes from both mirrors, the
     record keeps no join, and the desk follows its team file's address and not the invitation's. The next view says joined once. */
  {
    const doneN1 = await until(async () => { const ch = D.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); } await studio.kick(); await studio.idle();
      return read(mirror, joinRel) === null && read(studioMirror, joinRel) === null; }, 8000);
    const keptJ = Object.prototype.hasOwnProperty.call(D.envelope(), "teamJoin"), hereN1 = D.api.relayHere();
    const firstView = await D.ask("etiuda:team-join", "view"), secondView = await D.ask("etiuda:team-join", "view");
    const saidJoined = !!(firstView && firstView.joined && firstView.joined.team === TEAM2) && !!secondView && secondView.joined === null;
    check(doneN1 && !keptJ && hereN1 && hereN1.joining === false && hereN1.team === TEAM2 && saidJoined,
      "949a once its team key is unwrapped the desk is done with its request, the Team cover unread: the request "
      + (doneN1 ? "gone from both mirrors" : "desk " + (read(mirror, joinRel) === null ? "gone" : "there") + ", lead " + (read(studioMirror, joinRel) === null ? "gone" : "there"))
      + ", the record's join " + (keptJ ? "kept" : "gone") + ", following " + (hereN1 ? (hereN1.joining ? "the invitation" : "the team file") : "nothing")
      + ", the next view " + (saidJoined ? "said joined once" : "did not say joined once"));
  }
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
  /* The head the lead's Studio writes. An older t cannot replace a newer one, so the old head is put first. */
  let relayHeadShown = false;
  try {
    const headCh = () => D.api.relayRun();
    const newsOf = () => {
      const ch = headCh();
      const p = ch && ch.program;
      if (!p || typeof p.headNews !== "function") return null;
      try { return p.headNews(Date.now()); } catch { return null; }
    };
    const pump = async () => {
      await studio.kick(); await studio.idle();
      const ch = headCh();
      if (ch) { ch.kick(); await ch.idle(); }
    };
    let tookFn = null, pageMod = null, pageErr = "";
    const pageHtml = async leads => {
      try {
        if (!pageMod) {
          globalThis.window = globalThis.window || {};
          globalThis.document = globalThis.document || {};
          document.documentElement = document.documentElement || {};
          document.body = { classList: { contains: () => false, toggle() {}, add() {}, remove() {} }, appendChild: el => el };
          document.createElement = () => ({ className: "", id: "", style: {}, attrs: {}, innerHTML: "",
            setAttribute() {}, appendChild: el => el, classList: { add() {}, remove() {}, contains: () => false, toggle() {} } });
          document.getElementById = () => null;
          document.querySelector = () => null;
          document.querySelectorAll = () => [];
          document.addEventListener = () => {};
          document.removeEventListener = () => {};
          window.addEventListener = () => {};
          window.removeEventListener = () => {};
          globalThis.getComputedStyle = () => ({ fontSize: "16px" });
          globalThis.innerWidth = 1280;
          globalThis.innerHeight = 800;
          window.E_HOST = { teamJoin: () => Promise.resolve({ leads: [] }), onTeamJoin: fn => { tookFn = fn; } };
          const HK = await import(pathToFileURL(path.join(ROOT, "src", "modules", "hooks.js")).href);
          HK.hooks.render = () => {};
          const TJ = await import(pathToFileURL(path.join(ROOT, "src", "modules", "team-join.js")).href);
          const ST = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
          const SET = await import(pathToFileURL(path.join(ROOT, "src", "modules", "settings.js")).href);
          TJ.wireTeamJoin();
          await wait(40);
          pageMod = { ST, SET };
        }
        if (tookFn) tookFn({ leads: leads || [] });
        pageMod.ST.lsSet("eUiLang", "en");
        const en = shownText(pageMod.SET.settingsBodyHtml());
        pageMod.ST.lsSet("eUiLang", "pl");
        const pl = shownText(pageMod.SET.settingsBodyHtml());
        pageMod.ST.lsSet("eUiLang", "en");
        return { en, pl };
      } catch (e) {
        pageErr = e && e.stack ? e.stack : String(e);
        return { en: "", pl: "" };
      }
    };
    const leadsOf = async () => {
      const v = await D.ask("etiuda:team-join", "leads");
      return v && Array.isArray(v.leads) ? v.leads : [];
    };
    const teamLead = leads => leads.filter(l => l && l.team === TEAM2)[0] || null;
    const absent = newsOf();
    const stillLoaded = factsOf(D.api.readCatalog() || "") === 2;
    const oldT = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const oldText = headBody(TEAM2, oldT, "Quay two", "1 March 2026");
    const oldLanded = await until(async () => { put(studioMirror, HEAD_FILE, oldText); await pump(); return read(mirror, HEAD_FILE) === oldText; }, 8000);
    const oldNews = newsOf();
    const oldLeads = await leadsOf();
    const oldPage = await pageHtml(oldLeads);
    const oldSentence = "Newest edition Quay two, published 1 March 2026. The team's news: " + dayStamp(oldT);
    const oldPl = "Najnowsze wydanie Quay two, opublikowane 1 March 2026. Wiadomość zespołu: " + dayStamp(oldT);
    const noteRel = "desks/" + me.id + "/note.ec";
    const note = "Desk Nine still writes while the team's news is old.\n";
    put(mirror, noteRel, note);
    const noteSent = await until(async () => { await pump(); return read(studioMirror, noteRel) === note; }, 8000);
    const oldLead = teamLead(oldLeads);
    check(oldLanded && stillLoaded && absent && absent.shown === false && absent.blocked === false
      && oldNews && oldNews.shown === true && oldNews.blocked === false && oldNews.edition === "Quay two"
      && oldNews.published === "1 March 2026" && oldNews.ageMs > 2 * 24 * 60 * 60 * 1000
      && oldLead && oldLead.head && oldLead.head.edition === "Quay two"
      && oldPage.en.indexOf(oldSentence) >= 0 && oldPage.en.indexOf("just now") < 0
      && oldPage.pl.indexOf(oldPl) >= 0 && noteSent && factsOf(D.api.readCatalog() || "") === 2,
      "948b an old head is shown as old, with its edition and publish time, and nothing is blocked: the catalog still reads and a desk file still goes up: "
      + (oldLanded ? "landed" : "not in the mirror") + ", news " + (oldNews ? oldNews.edition + " blocked " + oldNews.blocked : "none")
      + ", note " + (noteSent ? "at the lead" : "not sent") + ", catalog " + factsOf(D.api.readCatalog() || "")
      + (pageErr ? " page " + pageErr.split("\n")[0] : ""));
    const freshT = Date.now();
    const freshText = headBody(TEAM2, freshT, "Quay three", "2 March 2026");
    const freshLanded = await until(async () => { put(studioMirror, HEAD_FILE, freshText); await pump(); return read(mirror, HEAD_FILE) === freshText; }, 8000);
    const freshNews = newsOf();
    const freshLeads = await leadsOf();
    const freshPage = await pageHtml(freshLeads);
    const freshLead = teamLead(freshLeads);
    const enFresh = freshPage.en.indexOf("Newest edition Quay three, published 2 March 2026. The team's news: ") >= 0
      && (freshPage.en.indexOf("The team's news: just now") >= 0 || freshPage.en.indexOf("The team's news: 1 min ago") >= 0);
    const plFresh = freshPage.pl.indexOf("Najnowsze wydanie Quay three, opublikowane 2 March 2026. Wiadomość zespołu: ") >= 0
      && (freshPage.pl.indexOf("Wiadomość zespołu: przed chwilą") >= 0 || freshPage.pl.indexOf("Wiadomość zespołu: 1 min temu") >= 0);
    relayHeadShown = enFresh && plFresh;
    check(freshLanded && freshNews && freshNews.shown === true && freshNews.blocked === false
      && freshNews.edition === "Quay three" && freshNews.published === "2 March 2026"
      && freshNews.ageMs >= 0 && freshNews.ageMs < 120000
      && freshLead && freshLead.head && freshLead.head.edition === "Quay three" && freshLead.head.published === "2 March 2026"
      && enFresh && plFresh,
      "948a a genuine head is shown with its edition, when it was published, and how old the head is: "
      + (freshNews ? freshNews.edition + " / " + freshNews.published + " / " + freshNews.ageMs + "ms" : "no news")
      + ", english " + enFresh + ", polish " + plFresh + (pageErr ? " page " + pageErr.split("\n")[0] : ""));
    const kept = read(mirror, HEAD_FILE);
    const forgedObj = JSON.parse(freshText);
    forgedObj.sig.value = (forgedObj.sig.value[0] === "a" ? "b" : "a") + forgedObj.sig.value.slice(1);
    const forgedText = JSON.stringify(forgedObj) + "\n";
    const forgedFrom = D.said.length;
    const forgedSaid = await until(async () => {
      put(studioMirror, HEAD_FILE, forgedText); await pump();
      return D.said.slice(forgedFrom).some(l => l.indexOf(B.REASONS["bad-signature"]) >= 0);
    }, 8000);
    check(forgedSaid && read(mirror, HEAD_FILE) === kept,
      "948c a forged head is dropped and said, and the mirror keeps the genuine one: "
      + (forgedSaid ? "said" : "not said") + ", mirror " + (read(mirror, HEAD_FILE) === kept ? "unchanged" : "changed"));
    const olderText = headBody(TEAM2, freshT - 60 * 1000, "Quay one", "1 March 2026");
    const olderFrom = D.said.length;
    const olderSaid = await until(async () => {
      put(studioMirror, HEAD_FILE, olderText); await pump();
      return D.said.slice(olderFrom).some(l => l.indexOf(B.REASONS["replay-counter"]) >= 0);
    }, 8000);
    check(olderSaid && read(mirror, HEAD_FILE) === kept,
      "948d an older head is dropped and said, and the newer stays: "
      + (olderSaid ? "said" : "not said") + ", mirror " + (read(mirror, HEAD_FILE) === kept ? "unchanged" : "changed"));
    const otherText = headBody("t-" + hex(8), Date.now(), "Quay four", "3 March 2026");
    const otherFrom = D.said.length;
    const otherSaid = await until(async () => {
      put(studioMirror, HEAD_FILE, otherText); await pump();
      return D.said.slice(otherFrom).some(l => l.indexOf(B.REASONS["wrong-team"]) >= 0);
    }, 8000);
    check(otherSaid && read(mirror, HEAD_FILE) === kept,
      "948e another team's head is dropped and said, and this team's stays: "
      + (otherSaid ? "said" : "not said") + ", mirror " + (read(mirror, HEAD_FILE) === kept ? "unchanged" : "changed"));
    /* A head of a version this desk does not read is dropped like a forged one, though the pinned lead signed it. On a program of
       its own, since the desk says a line once and 948c has said this one; the same head at v 1 then lands, as the control. */
    {
      const dir = path.join(LAB, "head-v2-" + hex(4));
      fs.mkdirSync(dir, { recursive: true });
      const said = [];
      const prog = C.createProgram({ io: C.diskIO(dir), pin: PIN2, say: l => said.push(l) });
      const team = JSON.parse(team2(2, []));
      const seal = (text, n) => B.seal({ relayTeamId: RT2, epoch: 1, teamKey: K2,
        writer: { keyId: LEAD.keyId, privateKey: LEAD.privateKey }, path: HEAD_FILE, body: text, counter: n, place: "root" });
      const tV = Date.now(), five = [{ catalog: "quay-board", rev: 1, edition: "Quay five", published: "4 March 2026" }];
      const genuine = headBody(TEAM2, tV - 1000, "Quay three", "2 March 2026");
      const v2Text = headWith(TEAM2, tV, five, 2), v1Text = headWith(TEAM2, tV, five, 1);
      const first = prog.acceptBlob({ blob: seal(genuine, 1), teamDoc: team, teamKey: K2 });
      const from = said.length;
      const v2 = prog.acceptBlob({ blob: seal(v2Text, 2), teamDoc: team, teamKey: K2 });
      const v2Said = said.slice(from).some(l => l.indexOf(B.REASONS["bad-signature"]) >= 0);
      const keptV = read(dir, HEAD_FILE) === genuine;
      const v1 = prog.acceptBlob({ blob: seal(v1Text, 3), teamDoc: team, teamKey: K2 });
      check(first.ok === true && v2.ok !== true && v2Said && keptV && v1.ok === true && read(dir, HEAD_FILE) === v1Text,
        "948i a head of a version this desk does not read, v 2, is dropped and said though the pinned lead signed it, and the mirror keeps"
        + " the genuine one; the same head at v 1 lands: v 2 " + (v2.ok === true ? "accepted" : "refused " + v2.reason) + ", said " + v2Said
        + ", mirror " + (keptV ? "unchanged" : "changed") + ", v 1 " + (v1.ok === true ? "landed" : "refused " + v1.reason));
    }
    /* Two editions in one head, in both orders: the greater rev's is the one shown, in the channel's news and the team row. */
    const fiveSix = [{ catalog: "quay-board", rev: 1, edition: "Quay five", published: "4 March 2026" },
      { catalog: "quay-board", rev: 2, edition: "Quay six", published: "5 March 2026" }];
    const tTwo = Date.now();
    const shownFor = async (text) => {
      const landed = await until(async () => { put(studioMirror, HEAD_FILE, text); await pump(); return read(mirror, HEAD_FILE) === text; }, 8000);
      const n = newsOf(), row = teamLead(await leadsOf());
      return { landed, news: n ? n.edition + " / " + n.published : "none", row: row && row.head ? row.head.edition + " / " + row.head.published : "none" };
    };
    const upOrder = await shownFor(headWith(TEAM2, tTwo, fiveSix));
    const downOrder = await shownFor(headWith(TEAM2, tTwo + 1, fiveSix.slice().reverse()));
    const six = "Quay six / 5 March 2026";
    check(upOrder.landed && downOrder.landed && upOrder.news === six && upOrder.row === six && downOrder.news === six && downOrder.row === six,
      "948j a head naming two editions shows the greater rev's, whichever is listed first: rev 1 then 2, news " + upOrder.news + ", row "
      + upOrder.row + "; rev 2 then 1, news " + downOrder.news + ", row " + downOrder.row
      + (upOrder.landed && downOrder.landed ? "" : ", not landed"));
    /* The t floor across a restart: the program's record is saved, a fresh program loads it, and an older head is still dropped. */
    {
      const dir = path.join(LAB, "head-restart-" + hex(4));
      fs.mkdirSync(dir, { recursive: true });
      const stateFile = dir + ".json", said = [];
      const save = s => fs.writeFileSync(stateFile, JSON.stringify(s));
      const load = () => { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return null; } };
      const team = JSON.parse(team2(2, []));
      const seal = (text, n) => B.seal({ relayTeamId: RT2, epoch: 1, teamKey: K2,
        writer: { keyId: LEAD.keyId, privateKey: LEAD.privateKey }, path: HEAD_FILE, body: text, counter: n, place: "root" });
      const tNew = Date.now();
      const newer = headBody(TEAM2, tNew, "Quay seven", "6 March 2026"), older = headBody(TEAM2, tNew - 60 * 1000, "Quay one", "1 March 2026");
      const before = C.createProgram({ io: C.diskIO(dir), pin: PIN2, say: l => said.push(l), save, load });
      const first = before.acceptBlob({ blob: seal(newer, 1), teamDoc: team, teamKey: K2 });
      const after = C.createProgram({ io: C.diskIO(dir), pin: PIN2, say: l => said.push(l), save, load });
      const second = after.acceptBlob({ blob: seal(older, 2), teamDoc: team, teamKey: K2 });
      const news = after.headNews(Date.now());
      const dropped = said.some(l => l.indexOf(B.REASONS["replay-counter"]) >= 0);
      check(first.ok === true && second.ok !== true && dropped && read(dir, HEAD_FILE) === newer && news.shown === true && news.edition === "Quay seven",
        "948k the newer head's t is kept with the program's record, so after a restart an older head is still dropped and said: newer "
        + first.ok + ", older " + (second.ok === true ? "accepted" : "refused " + second.reason) + ", said " + dropped
        + ", file " + (read(dir, HEAD_FILE) === newer ? "the newer" : "not the newer") + ", shown " + (news.shown ? news.edition : "nothing"));
    }
    /* plant:head-sig. Deleting that line, leaving the file valid script, lets a forged head through. */
    {
      const src = path.join(ROOT, "shell", "relay", "channel.cjs");
      const before = fs.readFileSync(src);
      const digest = sha(before);
      let turned = false, detail = "plant line absent";
      try {
        const lines = before.toString("utf8").split(/\n/);
        const at = lines.findIndex(l => l.indexOf("plant:head-sig") >= 0);
        if (at >= 0) {
          lines.splice(at, 1);
          const lifted = loadPlantedChannel(lines.join("\n"));
          const dir = path.join(LAB, "head-plant-" + hex(4));
          fs.mkdirSync(dir, { recursive: true });
          const said = [];
          const prog = lifted.createProgram({ io: lifted.diskIO(dir), pin: PIN2, say: l => said.push(l) });
          const team = JSON.parse(team2(2, []));
          const body = headBody(TEAM2, Date.now(), "Quay three", "2 March 2026");
          const seal = (text, n) => B.seal({ relayTeamId: RT2, epoch: 1, teamKey: K2,
            writer: { keyId: LEAD.keyId, privateKey: LEAD.privateKey }, path: HEAD_FILE, body: text, counter: n, place: "root" });
          const first = prog.acceptBlob({ blob: seal(body, 1), teamDoc: team, teamKey: K2 });
          const badObj = JSON.parse(body);
          badObj.sig.value = (badObj.sig.value[0] === "a" ? "b" : "a") + badObj.sig.value.slice(1);
          const badText = JSON.stringify(badObj) + "\n";
          const second = prog.acceptBlob({ blob: seal(badText, 2), teamDoc: team, teamKey: K2 });
          const wrote = read(dir, HEAD_FILE);
          turned = first.ok === true && second.ok === true && wrote === badText;
          detail = "genuine " + first.ok + ", forged accepted " + (second.ok === true) + ", file " + (wrote === badText ? "the forged one" : "not the forged one");
        }
      } catch (e) {
        detail = e && e.message ? e.message : String(e);
      }
      const back = sha(fs.readFileSync(src)) === digest;
      check(turned && back, "948g lifting plant:head-sig lets a forged head through, and the product file is never written: " + detail + ", sha " + (back ? "restored" : "differs"));
    }
    /* plant:head-show. Deleting that line, leaving the file valid script, drops the sentence. */
    {
      const src = path.join(ROOT, "src", "modules", "settings.js");
      const before = fs.readFileSync(src);
      const digest = sha(before);
      let turned = false, detail = "plant line absent";
      try {
        if (tookFn) tookFn({ leads: freshLeads });
        const lines = before.toString("utf8").split(/\n/);
        const at = lines.findIndex(l => l.indexOf("plant:head-show") >= 0);
        if (at >= 0 && pageMod) {
          lines.splice(at, 1);
          const SET2 = await loadPlantedSettings(lines.join("\n"));
          pageMod.ST.lsSet("eUiLang", "en");
          const html = shownText(SET2.settingsBodyHtml());
          turned = html.indexOf("Newest edition Quay three") < 0;
          detail = turned ? "the sentence is gone" : "the sentence is still there";
        }
      } catch (e) {
        detail = e && e.message ? e.message : String(e);
      }
      const back = sha(fs.readFileSync(src)) === digest;
      check(turned && back, "948h lifting plant:head-show drops the sentence, and the product file is never written: " + detail + ", sha " + (back ? "restored" : "differs"));
    }
    const shareH = path.join(LAB, "head-folder");
    fs.mkdirSync(shareH, { recursive: true });
    const H = newDesk("head-folder-desk", shareH);
    const hme = await H.ask("etiuda:branch-identity", true);
    const KH = crypto.randomBytes(32), TEAMH = "t-" + hex(8);
    const folderTeam = JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: TEAMH, catalogs: ["quay-board"],
      lead: { keyId: INTR.keyId, public: INTR.pub }, sealed: true, exportsSealed: false, epoch: 1, rev: 1,
      channel: { kind: "relay", rt: hex(16), url: "https://evil.test/relay/v1" },
      ring: { format: 1, kind: "etiuda-ring", keys: [{ catalog: "quay-board", keyId: INTR.keyId, alg: "Ed25519", public: INTR.pub }] },
      roster: [{ desk: { id: hme.id, key: hme.key, box: hme.box }, wrap: H.api.wrapTeamKey(KH, hme.box, TEAMH, 1, hme.id) }] }, INTR), null, 1) + "\n";
    fs.writeFileSync(path.join(shareH, C.TEAM_NAME), folderTeam);
    H.api.heedTeam();
    fs.writeFileSync(path.join(shareH, HEAD_FILE), headBody(TEAMH, Date.now(), "Quay three", "2 March 2026"));
    H.api.heedTeam();
    const hv = await H.ask("etiuda:team-join", "leads");
    const hleads = hv && Array.isArray(hv.leads) ? hv.leads : [];
    const hpage = await pageHtml(hleads);
    const noKey = hleads.length > 0 && hleads.every(l => !Object.prototype.hasOwnProperty.call(l, "head"));
    check(relayHeadShown && noKey && hpage.en.indexOf("Newest edition") < 0 && H.api.catalogFolder() === shareH,
      "948f a folder team shows nothing new, while the relay desk showed the head: leads " + hleads.length
      + ", head " + (noKey ? "absent" : "present") + ", sentence " + (hpage.en.indexOf("Newest edition") < 0 ? "absent" : "shown")
      + ", relay sentence " + relayHeadShown + ", folder " + (H.api.catalogFolder() === shareH ? "the share" : H.api.catalogFolder()));
    /* One desk that follows the relay team and also holds a folder team, as its record keeps them: the relay team's row carries
       the head in its mirror, and the folder team's row none. */
    {
      const udBoth = path.join(LAB, "head-both-desk"), mirrorBoth = path.join(udBoth, "relay", RT2);
      fs.mkdirSync(mirrorBoth, { recursive: true });
      const headNow = read(mirror, HEAD_FILE);
      fs.writeFileSync(path.join(mirrorBoth, HEAD_FILE), headNow);
      fs.writeFileSync(path.join(udBoth, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
        keys: { eCatalogFolder: shareH, eUiLang: "en" },
        teamPins: { [TEAM2]: { keyId: LEAD.keyId, public: LEAD.pub }, [TEAMH]: { keyId: INTR.keyId, public: INTR.pub } },
        teamPinFrom: { [TEAM2]: "invite" }, teamChannel: { [TEAM2]: { kind: "relay", rt: RT2, url: URL2 } },
        teamShown: { [TEAMH]: { folder: shareH } } }), "utf8");
      const BD = loadDesk(udBoth);
      await BD.ask("etiuda:branch-identity", true);
      const runBD = BD.api.relayRun();
      const bv = await BD.ask("etiuda:team-join", "leads");
      const bleads = bv && Array.isArray(bv.leads) ? bv.leads : [];
      const relayRow = bleads.filter(l => l && l.team === TEAM2)[0], folderRow = bleads.filter(l => l && l.team === TEAMH)[0];
      const relayHead = relayRow && relayRow.head ? relayRow.head.edition : "none";
      const folderHead = folderRow ? (Object.prototype.hasOwnProperty.call(folderRow, "head") ? "present" : "absent") : "no row";
      if (runBD) await runBD.stop();
      check(!!runBD && relayHead === "Quay six" && folderHead === "absent",
        "948l one desk following the relay team and holding a folder team: the relay team's row shows the head, the folder team's row"
        + " carries none: channel " + (runBD ? "running" : "none") + ", relay row " + relayHead + ", folder row's head " + folderHead);
    }
  } catch (e) {
    check(false, "948 the team's news: " + (e && e.stack ? e.stack : e));
  }
  /* F1 through the desk's own shell: the lead's Studio lends its box's agreement, takes a desk off with a new key, and this
     desk, holding only the first key, reaches the new epoch by itself: its own copy of the team file, its wrap opened by
     heedTeam, and the edition sealed under the new key loaded. */
  {
    await studio.stop();
    const lbox = crypto.generateKeyPairSync("x25519");
    const lboxPub = lbox.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
    const leadAgree = peer => { try { return crypto.diffieHellman({ privateKey: lbox.privateKey, publicKey: crypto.createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b656e032100", "hex"), Buffer.from(String(peer), "hex")]), format: "der", type: "spki" }) }); } catch { return null; } };
    const leadKeys = new Map([[1, K2]]);
    const studio2 = C.createChannel({ rt: RT2, url: URL2, mirror: studioMirror, stateFile: path.join(LAB, "studio.json"), pin: () => PIN2,
      me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }), keyFor: e => leadKeys.get(e) || null,
      sealEpoch: () => Math.max(...leadKeys.keys()), inviteKeys: () => liveInvites, agree: leadAgree, request: studioT.request, connect: studioT.connect, pollMs: 1e9 });
    const team2at = (epoch, rev, roster) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: TEAM2, catalogs: ["quay-board"],
      lead: { keyId: LEAD.keyId, public: LEAD.pub, box: lboxPub }, sealed: true, exportsSealed: false, epoch, rev,
      channel: { kind: "relay", rt: RT2, url: URL2 }, ring: RING, roster }, LEAD), null, 1) + "\n";
    const gone = keyPair(true), goneBox = crypto.generateKeyPairSync("x25519").publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
    const meEntry = (key, epoch) => ({ desk: { id: me.id, key: me.key, box: me.box }, wrap: D.api.wrapTeamKey(key, me.box, TEAM2, epoch, me.id) });
    put(studioMirror, C.TEAM_NAME, team2at(1, 3, [meEntry(K2, 1), { desk: { id: gone.keyId, key: gone.pub, box: goneBox },
      wrap: D.api.wrapTeamKey(K2, goneBox, TEAM2, 1, gone.keyId) }]));
    studio2.start();
    await studio2.idle(); studio2.kick(); await studio2.idle();
    const onRev3 = await until(async () => { const ch = D.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); }
      try { return JSON.parse(read(mirror, C.TEAM_NAME)).rev === 3; } catch { return false; } }, 8000);
    const KN2 = crypto.randomBytes(32);
    leadKeys.set(2, KN2);
    put(studioMirror, "board.ec", JSON.stringify(D.api.sealCatalog(KN2, TEAM2, 2, catalogText(3))));
    put(studioMirror, C.TEAM_NAME, team2at(2, 1, [meEntry(KN2, 2)]));
    studio2.kick(); await studio2.idle(); studio2.kick(); await studio2.idle();
    const moved = await until(async () => { const ch = D.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); }
      return factsOf(D.api.readCatalog() || "") === 3; }, 8000);
    const seenEpoch = (D.envelope().teamEpochSeen || {})[TEAM2];
    const chNow = D.api.relayRun();
    const pendingNow = chNow ? chNow.program.state().pending.length : -1;
    check(onRev3 && moved && seenEpoch === 2 && pendingNow === 0,
      "944g f1 in the desk's own shell: the lead takes another desk off with a new key, and this desk, holding only the first, opens its own copy of"
      + " the new team file, keeps the new key from its wrap and loads the edition sealed under it: " + (moved ? "edition 3 loaded" : "edition "
      + factsOf(D.api.readCatalog() || "") + " still") + ", epoch heeded " + seenEpoch + ", pending " + pendingNow);
    await studio2.stop();
  }
  const stopped = D.api.relayRun();
  if (stopped) await stopped.stop();
  await studio.stop();

  /* F6 through the desk's own shell: a relay invitation naming the lead's box. The desk asks before the lead's Studio has put
     any copy up, goes offline, is admitted, its invitation let go meanwhile, and joins by itself when it is back. */
  {
    const RT4 = hex(16), TEAM4 = "t-" + hex(8), K4 = crypto.randomBytes(32);
    const made4 = await admin("POST", "/relay/v1/teams", createBody(RT4, R.clock.now));
    if (made4.status !== 200) throw new Error("the team for 945c was not made");
    const SEC4 = hex(16), INV4 = hex(16), TOK4 = hex(32), KI4 = C.inviteSealKey(SEC4), t4 = R.clock.now;
    const add4 = [{ id: INV4, hash: sha(Buffer.from(TOK4, "utf8")) }];
    await admin("POST", "/relay/v1/t/" + RT4 + "/invites", { add: add4, drop: [], t: t4, sig: signHex(LEAD, core.invitesBytes(RT4, t4, add4, [])) });
    const lbox4 = crypto.generateKeyPairSync("x25519");
    const lbox4Pub = lbox4.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
    const agree4 = peer => { try { return crypto.diffieHellman({ privateKey: lbox4.privateKey, publicKey: crypto.createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b656e032100", "hex"), Buffer.from(String(peer), "hex")]), format: "der", type: "spki" }) }); } catch { return null; } };
    const PIN4 = { teamId: TEAM4, rt: RT4, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
    const team4 = (rev, roster) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: TEAM4, catalogs: ["quay-board"],
      lead: { keyId: LEAD.keyId, public: LEAD.pub, box: lbox4Pub }, sealed: true, exportsSealed: false, epoch: 1, rev,
      channel: { kind: "relay", rt: RT4, url: URL2 }, ring: RING, roster }, LEAD), null, 1) + "\n";
    const live4 = [{ id: INV4, key: KI4 }];
    const studio4T = transport("studio4"), studio4Mirror = path.join(LAB, "studio4-mirror");
    const studio4 = C.createChannel({ rt: RT4, url: URL2, mirror: studio4Mirror, stateFile: path.join(LAB, "studio4.json"), pin: () => PIN4,
      me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }), keyFor: e => (e === 1 ? K4 : null),
      sealEpoch: () => 1, inviteKeys: () => live4, agree: agree4, request: studio4T.request, connect: studio4T.connect, pollMs: 1e9 });
    fs.mkdirSync(path.join(LAB, "f6-share"), { recursive: true });
    const G = newDesk("f6-desk", path.join(LAB, "f6-share"));
    put(studio4Mirror, "board.ec", JSON.stringify(G.api.sealCatalog(K4, TEAM4, 1, catalogText(1))));
    put(studio4Mirror, C.TEAM_NAME, team4(1, []));
    const text4 = "etiuda-join:" + Buffer.from(JSON.stringify({ team: TEAM4, relay: { rt: RT4, url: URL2, token: TOK4, inv: INV4 },
      lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay", box: lbox4Pub }, secret: SEC4 }), "utf8").toString("base64url");
    const took = await G.ask("etiuda:team-join", "invite", text4, "Desk Eleven", codeOf(SEC4));
    const boxKept = (((G.envelope().teamJoin || {}).invite || {}).relay || {}).box === lbox4Pub;
    const gme = await G.ask("etiuda:branch-identity", false);
    const gMirror = path.join(G.ud, "relay", RT4);
    const byDesk = () => R.stores.get(RT4).dump().map(([, v]) => JSON.parse(v)).filter(v => v && v.writer === gme.id).length;
    const asked = await until(async () => { const ch = G.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); } return byDesk() > 0; }, 6000);
    const heldNone = read(gMirror, C.TEAM_NAME) === null;
    deskTransport.down = true;
    studio4.start();
    await studio4.idle(); studio4.kick(); await studio4.idle();
    const atLead = read(studio4Mirror, "desks/" + gme.id + "/join.json") !== null;
    const entry4 = { desk: { id: gme.id, key: gme.key, box: gme.box }, wrap: G.api.wrapTeamKey(K4, gme.box, TEAM4, 1, gme.id) };
    put(studio4Mirror, C.TEAM_NAME, team4(2, [entry4]));
    const t5 = R.clock.now, keys4 = [{ id: gme.id, pub: gme.key, desk: gme.id }];
    await admin("POST", "/relay/v1/t/" + RT4 + "/devices", { keys: keys4, rev: 1, t: t5, sig: signHex(LEAD, core.devicesBytes(RT4, 1, t5, keys4)) });
    studio4.kick(); await studio4.idle();
    live4.length = 0;
    studio4.kick(); await studio4.idle();
    const copyGone = !R.stores.get(RT4).dump().map(([, v]) => JSON.parse(v)).some(v => v && v.place === "invite:" + INV4 && !v.del);
    deskTransport.down = false;
    const joined = await until(async () => { const ch = G.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); }
      return factsOf(G.api.readCatalog() || "") === 1; }, 8000);
    check(!took.refused && boxKept && asked && heldNone && atLead && copyGone && joined,
      "945c f6 in the desk's own shell: a relay invitation naming the lead's box, the request sent before the lead put up any copy, the desk"
      + " offline while it is admitted and the invitation let go; back, it finds its own copy by that box and loads the edition: box "
      + (boxKept ? "kept" : "not kept") + ", request " + (asked ? "sent" : "not sent") + " holding " + (heldNone ? "no team file" : "a team file")
      + ", at the lead " + atLead + ", the invitation's copy " + (copyGone ? "let go" : "still served") + ", then "
      + (joined ? "edition 1 loaded" : "nothing loaded: " + G.said.filter(l => l.indexOf("relay") >= 0).slice(-2).join(" / ")));
    const g = G.api.relayRun();
    if (g) await g.stop();
    await studio4.stop();
  }

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

  /* The lead forgotten while a relay invitation waits: the request stays, and the desk goes back to its own folder. */
  const shareF = path.join(LAB, "forget-share");
  fs.mkdirSync(shareF, { recursive: true });
  const F = newDesk("forget-desk", shareF);
  const SECF = hex(16);
  const textF = "etiuda-join:" + Buffer.from(JSON.stringify({ team: TEAM2, relay: { rt: RT2, url: URL2, token: hex(32), inv: hex(16) },
    lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret: SECF }), "utf8").toString("base64url");
  const takenF = await F.ask("etiuda:team-join", "invite", textF, "Desk Ten", codeOf(SECF));
  const onMirror = F.api.catalogFolder() === path.join(F.ud, "relay", RT2);
  await F.ask("etiuda:team-join", "forget", TEAM2);
  const leftFor = F.api.catalogFolder();
  const runF = F.api.relayRun();
  check(!takenF.refused && onMirror && leftFor === shareF && !runF && !!F.envelope().teamJoin,
    "942g a lead forgotten while a relay invitation waits takes the desk off the mirror back to its folder, and no channel runs, the"
    + " request kept: on the mirror " + onMirror + ", then " + (leftFor === shareF ? "its folder" : leftFor) + ", channel " + (runF ? "running" : "none"));

  /* Machine policy names a folder while a followed relay exists: the folder wins and no channel starts. */
  if (process.platform !== "win32") {
    check(true, "942h not on this system: the desk reads machine policy from the Windows registry alone");
  } else {
    const shareP = path.join(LAB, "policy-share");
    fs.mkdirSync(shareP, { recursive: true });
    const udP = path.join(LAB, "policy-desk");
    fs.mkdirSync(udP, { recursive: true });
    fs.writeFileSync(path.join(udP, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
      keys: { eCatalogFolder: path.join(LAB, "policy-own"), eUiLang: "en" },
      teamPins: { [TEAM2]: { keyId: LEAD.keyId, public: LEAD.pub } }, teamPinFrom: { [TEAM2]: "invite" },
      teamChannel: { [TEAM2]: { kind: "relay", rt: RT2, url: URL2 } } }), "utf8");
    const BS = String.fromCharCode(92);
    regOpts.policy = ["Windows Registry Editor Version 5.00", "", "[HKEY_LOCAL_MACHINE" + BS + "SOFTWARE" + BS + "Policies" + BS + "Etiuda]",
      "\"TeamFolder\"=\"" + shareP.split(BS).join(BS + BS) + "\"", "", ""].join("\n");
    const P = loadDesk(udP);
    const folderP = P.api.catalogFolder();
    regOpts.policy = null;
    await P.ask("etiuda:branch-identity", true);
    const runP = P.api.relayRun();
    await wait(200);
    if (runP) await runP.stop();
    const relayLines = P.said.filter(l => l.indexOf("relay of team") >= 0).length;
    check(folderP === shareP && !runP && relayLines === 0 && P.said.some(l => l.indexOf("machine policy names the team folder") >= 0),
      "942h machine policy names a folder while a followed relay exists: the folder wins, no channel starts, and the desk says so:"
      + " folder " + (folderP === shareP ? "the policy's" : folderP) + ", channel " + (runP ? "running" : "none") + ", the channel's lines " + relayLines);
  }

  /* The epoch route: a program that has loaded an epoch move which leaves a desk off the roster. A new file that desk
     seals at the old epoch, under the old team file, must be refused removed. The kept desk's file at the new epoch is
     taken, and the file this program already took before the move stays. 944q is acceptBlob. 944r is the catch-up, which
     is how a desk file reaches the program the desk and Studio run. */
  {
    const row = k => ({ desk: { id: k.keyId, key: k.pub, box: "ab".repeat(32) } });
    const asFetch = b => ({ seq: b.counter, meta: { v: 1, id: b.id, supersedes: b.supersedes, epoch: b.epoch,
      writer: b.writerKeyId, counter: b.counter, del: false, sig: b.signature, nonce: b.nonce, place: b.place,
      size: b.ciphertext.length }, ct: b.ciphertext });
    function epochRoute(mod, mode) {
      const rt = hex(16), tm = "t-" + hex(8), gone = keyPair(true), stay = keyPair(true);
      const k1 = crypto.randomBytes(32), k2 = crypto.randomBytes(32);
      const pin = { teamId: tm, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
      const doc = (epoch, roster) => signDoc({ format: 1, kind: "etiuda-team", id: tm, catalogs: ["pebble-board"],
        lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch, rev: 1,
        channel: { kind: "relay", rt, url: URLV1 }, roster }, LEAD);
      const seal = (epoch, key, writer, rel, counter, body) => B.seal({ relayTeamId: rt, epoch, teamKey: key,
        writer: { keyId: writer.keyId, privateKey: writer.privateKey }, path: rel, body, counter, place: "desk:" + writer.keyId });
      const gonePath = "desks/" + gone.keyId + "/stats.estat", stayPath = "desks/" + stay.keyId + "/stats.estat";
      const oldDoc = doc(1, [row(gone), row(stay)]), newDoc = doc(2, [row(stay)]);
      const dir = path.join(LAB, "fk1-" + mode + "-" + hex(4));
      fs.mkdirSync(dir, { recursive: true });
      const said = [];
      const prog = mod.createProgram({ io: mod.diskIO(dir), pin, say: l => said.push(l) });
      const keyFor = e => (e === 1 ? k1 : e === 2 ? k2 : null);
      const loadedOld = prog.loadTeamFile(oldDoc);
      const beforeBlob = seal(1, k1, gone, gonePath, 1, "before");
      const stayBlob = seal(2, k2, stay, stayPath, 1, "kept-on");
      const lateBlob = seal(1, k1, gone, gonePath, 2, "late-after");
      const atNewBlob = seal(2, k2, gone, gonePath, 1, "late-new");
      const took = (batch, rel) => batch.applied.indexOf(rel) >= 0;
      const saidRemoved = from => said.slice(from).some(l => l.indexOf(B.REASONS.removed) >= 0);
      if (mode === "blob") {
        const before = prog.acceptBlob({ blob: beforeBlob, teamDoc: oldDoc, teamKey: k1 });
        const loadedNew = prog.loadTeamFile(newDoc);
        const stayR = prog.acceptBlob({ blob: stayBlob, teamDoc: newDoc, teamKey: k2 });
        const late = prog.acceptBlob({ blob: lateBlob, teamDoc: oldDoc, teamKey: k1 });
        const atNew = prog.acceptBlob({ blob: atNewBlob, teamDoc: newDoc, teamKey: k2 });
        return { loadedOld, loadedNew, before, stayR, late, atNew, goneBody: read(dir, gonePath), stayBody: read(dir, stayPath) };
      }
      const beforeBatch = prog.applyBatch([asFetch(beforeBlob)], { keyFor });
      const loadedNew = prog.loadTeamFile(newDoc);
      const stayBatch = prog.applyBatch([asFetch(stayBlob)], { keyFor });
      const lateFrom = said.length;
      const lateBatch = prog.applyBatch([asFetch(lateBlob)], { keyFor });
      const lateSaid = saidRemoved(lateFrom);
      const newFrom = said.length;
      const atNewBatch = prog.applyBatch([asFetch(atNewBlob)], { keyFor });
      const atNewSaid = saidRemoved(newFrom);
      const refused = (inBatch, rel, wasSaid) => ({ ok: took(inBatch, rel), reason: wasSaid ? "removed" : (took(inBatch, rel) ? "accepted" : "other"),
        said: wasSaid ? B.REASONS.removed : "" });
      return { loadedOld, loadedNew, before: { ok: took(beforeBatch, gonePath) }, stayR: { ok: took(stayBatch, stayPath) },
        late: refused(lateBatch, gonePath, lateSaid), atNew: refused(atNewBatch, gonePath, atNewSaid),
        goneBody: read(dir, gonePath), stayBody: read(dir, stayPath) };
    }
    const routeHolds = r => !!(r && r.loadedOld.ok === true && r.loadedNew.ok === true && r.before.ok === true
      && r.stayR.ok === true && r.stayBody === "kept-on" && r.late.ok === false && r.late.reason === "removed"
      && r.late.said === B.REASONS.removed && r.atNew.ok === false && r.atNew.reason === "removed" && r.goneBody === "before");
    const routeLine = r => !r ? "no result" : "old team " + (r.loadedOld.ok === true ? "loaded" : r.loadedOld.reason)
      + ", new team " + (r.loadedNew.ok === true ? "loaded" : r.loadedNew.reason)
      + ", before " + r.before.ok + ", kept " + (r.stayR.ok === true ? "taken" : r.stayR.reason) + " body " + JSON.stringify(r.stayBody)
      + ", late " + (r.late.ok === true ? "ACCEPTED" : r.late.reason) + ", at the new epoch " + (r.atNew.ok === true ? "ACCEPTED" : r.atNew.reason)
      + ", the earlier file " + JSON.stringify(r.goneBody);
    const blob = epochRoute(C, "blob"), desk = epochRoute(C, "desk");
    check(routeHolds(blob), "944q Q-k1-blob: after an epoch move drops the desk, acceptBlob refuses removed its new file sealed at the old"
      + " epoch under the old team file, and the same at the new epoch; the kept desk's epoch-2 file is taken; the file already taken stays: " + routeLine(blob));
    check(routeHolds(desk), "944r Q-k1-desk: the catch-up, which is how a desk file reaches the program the desk and Studio run, refuses that"
      + " same file removed, and the kept desk's epoch-2 file is taken: " + routeLine(desk));
    /* plant:fk1-removed. Deleting that line, leaving the file valid script, accepts the old-epoch file again. */
    {
      const src = path.join(ROOT, "shell", "relay", "channel.cjs");
      const beforeBytes = fs.readFileSync(src);
      const digest = sha(beforeBytes);
      let turned = false, detail = "plant line absent";
      try {
        const lines = beforeBytes.toString("utf8").split(/\n/);
        const at = lines.findIndex(l => l.indexOf("plant:fk1-removed") >= 0);
        if (at >= 0) {
          lines.splice(at, 1);
          const lifted = loadPlantedChannel(lines.join("\n"));
          const lateTaken = x => !!(x && x.loadedOld.ok === true && x.loadedNew.ok === true && x.before.ok === true
            && x.stayR.ok === true && x.stayBody === "kept-on" && x.late.ok === true && x.goneBody === "late-after");
          const plantedBlob = epochRoute(lifted, "plant-blob"), plantedDesk = epochRoute(lifted, "plant-desk");
          turned = lateTaken(plantedBlob) && lateTaken(plantedDesk);
          detail = "acceptBlob " + routeLine(plantedBlob) + "; catch-up " + routeLine(plantedDesk);
        }
      } catch (e) {
        detail = e && e.message ? e.message : String(e);
      }
      const back = sha(fs.readFileSync(src)) === digest;
      check(turned && back, "944s lifting plant:fk1-removed accepts the dropped desk's new file sealed at the old epoch, and the product file is never written: "
        + detail + ", sha " + (back ? "restored" : "differs"));
    }
  }

  /* C7, board 921. A desk takes a relay invitation, the invitation's copy lands, and cancel must leave that relay:
     relayHere is null, the folder is the one from before, and the channel has stopped. The desk holds no key. */
  try {
    /* The shell `src` loaded over the desk folder `ud` and the envelope already in it, as a restarted desk loads. */
    function deskLoad(ud, src, serve) {
      const said = [];
      const on = {}, invoke = {};
      const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop, info: noop };
      const safeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
        decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
      };
      const net = { fetch: (url, init) => { deskTransport.log.push(init.method + " " + url); if (deskTransport.down) return Promise.reject(new Error("down")); return (serve && serve(url, init)) || relayFetch(url, init); } };
      const electron = {
        app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
          getVersion: () => "0.0.0", whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
        ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
        BrowserWindow: inert, Menu: inert, dialog: inert, net, protocol: inert, session: inert, shell: inert,
        screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage, powerMonitor: inert,
      };
      process.env.XDG_CURRENT_DESKTOP = "GNOME";
      const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
        src + "\nreturn { " + EXPOSE.join(", ") + " };")(
        n => (n === "electron" ? electron : nodeRequire(n)),
        path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
      const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
      const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
      return { api, ask, said, ud, envelope };
    }
    function deskFrom(name, folder, src, held, serve) {
      const ud = path.join(LAB, name);
      fs.mkdirSync(ud, { recursive: true });
      fs.mkdirSync(folder, { recursive: true });
      /* `held` is what the desk's envelope already keeps before any invitation: a pin, a key, a leave record. */
      fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(Object.assign({ kind: "etiuda-desk", schema: 1,
        keys: { eCatalogFolder: folder, eUiLang: "en" } }, held || {})), "utf8");
      return deskLoad(ud, src, serve);
    }
    /* `opt.held(team, key, share)` is the envelope the desk starts with, `opt.keep` that it holds the team's key before the
       invitation, `opt.unpinned` that the invitation finds a pin already there and so makes none, and `opt.twice` that it
       takes the invitation a second time before cancelling. `opt.restart` stops the desk once the invitation's copy has
       landed and loads it again from the envelope on disk, after `opt.edit(envelope, team, key)` has changed that envelope;
       `opt.view` then asks only whether the restarted desk kept the request. `opt.wrap` serves the invitation's wrap, as slice 3's
       relay does, so the desk opens the team key on yes before the lead admits it and the scene waits for that key, and
       `opt.retake` takes the invitation a second time once that key is in. With no `opt` it is 921a's desk. */
    async function cancelScene(src, tag, opt) {
      opt = opt || {};
      const rt = hex(16), team = "t-" + hex(8), key = crypto.randomBytes(32);
      const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
      if (made.status !== 200) throw new Error("the team for " + tag + " was not made");
      const secret = hex(16), inv = hex(16), token = hex(32), sealKey = C.inviteSealKey(secret), t0 = R.clock.now;
      const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }];
      await admin("POST", "/relay/v1/t/" + rt + "/invites", { add, drop: [], t: t0,
        sig: signHex(LEAD, core.invitesBytes(rt, t0, add, [])) });
      const pin = { teamId: team, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
      const teamFile = JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: team, catalogs: ["quay-board"],
        lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev: 1,
        channel: { kind: "relay", rt, url: URLV1 }, ring: RING, roster: [] }, LEAD), null, 1) + "\n";
      const live = [{ id: inv, key: sealKey }];
      const wrapDoc = opt.wrap ? B.sealInviteWrap({ secret: secret, relayTeamId: rt, teamId: team, invitationId: inv, epoch: 1, key: key }) : null;
      const serve = wrapDoc ? (url, init) => (init && init.method === "GET" && String(url).endsWith("/wrap")
        ? new Response(Buffer.from(JSON.stringify({ wrap: wrapDoc }), "utf8"), { status: 200, headers: { "content-type": "application/json" } })
        : null) : null;
      const studioT = transport("c7-" + tag), studioMirror = path.join(LAB, "c7-studio-" + tag);
      const studio = C.createChannel({ rt, url: URLV1, mirror: studioMirror, stateFile: path.join(LAB, "c7-" + tag + ".json"),
        pin: () => pin, me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }),
        keyFor: e => (e === 1 ? key : null), sealEpoch: () => 1, inviteKeys: () => live,
        request: studioT.request, connect: studioT.connect, pollMs: 1e9 });
      const share = path.join(LAB, "c7-share-" + tag);
      fs.mkdirSync(share, { recursive: true });
      put(studioMirror, C.TEAM_NAME, teamFile);
      studio.start();
      await studio.idle();
      deskTransport.down = false;
      let D = deskFrom("c7-desk-" + tag, share, src, opt.held ? opt.held(team, key, share) : null, serve);
      const before = D.api.catalogFolder();
      const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team, relay: { rt, url: URLV1, token, inv },
        lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret }), "utf8").toString("base64url");
      const taken = await D.ask("etiuda:team-join", "invite", text, "Desk North", codeOf(secret));
      if (opt.twice) await D.ask("etiuda:team-join", "invite", text, "Desk North", codeOf(secret));
      const mirror = path.join(D.ud, "relay", rt);
      const landing = () => until(async () => {
        const ch = D.api.relayRun();
        if (ch) { ch.kick(); await ch.idle(); }
        await studio.kick(); await studio.idle();
        let env = {};
        try { env = D.envelope(); } catch { env = {}; }
        return read(mirror, C.TEAM_NAME) !== null && !!(env.teamChannel && env.teamChannel[team]) && !!(ch && ch.online())
          && (!opt.wrap || !!(env.teamKeys && env.teamKeys[team]));
      }, 8000);
      let landed = await landing();
      if (opt.retake) await D.ask("etiuda:team-join", "invite", text, "Desk North", codeOf(secret));
      let env = {};
      try { env = D.envelope(); } catch { env = {}; }
      const noKey = !env.teamKeys || !env.teamKeys[team];
      /* With the wrap served, it was asked for and the team's key is in the envelope. */
      const wrapAsked = deskTransport.log.some(l => l.indexOf("GET ") === 0 && l.indexOf(rt) >= 0 && l.endsWith("/wrap"));
      const keyIn = opt.wrap ? !noKey && wrapAsked : (opt.keep ? !noKey : noKey);
      const standing = !!env.teamJoin;
      const pinned = !!(env.teamJoin && env.teamJoin.invite && env.teamJoin.invite.pinned === true);
      if (opt.restart) {
        const old = D.api.relayRun();
        if (old) { try { await old.stop(); } catch { /* already stopped */ } }
        if (opt.edit) {
          const doc = D.envelope();
          opt.edit(doc, team, key);
          fs.writeFileSync(path.join(D.ud, "desk.json"), JSON.stringify(doc), "utf8");
        }
        D = deskLoad(D.ud, src, serve);
        if (opt.view) {
          const seen = await D.ask("etiuda:team-join", "read", "no invitation");
          try { await studio.stop(); } catch { /* already stopped */ }
          return { pre: !taken.refused && landed && noKey && standing && pinned === !opt.unpinned, kept: !!(seen && seen.join), team };
        }
        landed = landed && await landing();
      }
      const onMirror = D.api.catalogFolder() === mirror;
      const hereBefore = D.api.relayHere();
      const running = D.api.relayRun();
      const wasOnline = !!(running && running.online());
      await D.ask("etiuda:team-join", "cancel");
      const stopped = await until(() => !!(running && running.online() === false), 1500);
      const here = D.api.relayHere();
      const folder = D.api.catalogFolder();
      let after = {};
      try { after = D.envelope(); } catch { after = {}; }
      const still = running && running.online();
      if (running) { try { await running.stop(); } catch { /* already stopped */ } }
      try { await studio.stop(); } catch { /* already stopped */ }
      const pre = !taken.refused && before === share && landed && keyIn && standing && pinned === !opt.unpinned
        && onMirror && wasOnline && !!hereBefore;
      const said = D.said.filter(l => l.indexOf("relay") >= 0 || l.indexOf("team") >= 0).slice(-3).join(" / ");
      return { pre, here, folder, share, stopped, still: !!still, refused: taken && taken.refused, said, team, after,
        file: read(mirror, C.TEAM_NAME) !== null, named: !!(env.teamChannel && env.teamChannel[team]) };
    }
    const got = await cancelScene(fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8"), "leg");
    check(got.pre && got.here === null && got.folder === got.share && got.stopped,
      "921a a desk takes a relay invitation, the invitation's copy lands, and cancel puts the folder back and stops the channel: "
      + (got.pre ? "the copy had landed" : "the copy had not (" + (got.refused ? "refused " + got.refused : "file " + got.file + ", channel " + got.named) + ")")
      + ", relayHere " + (got.here === null ? "null" : "still answers")
      + ", folder " + (got.folder === got.share ? "the one from before" : "still the mirror")
      + ", channel " + (got.stopped ? "stopped" : "still running")
      + (got.said ? "; " + got.said : ""));
    /* plant:c7-cancel. Deleting that line, leaving the file valid script, leaves the pin, the mirror and the channel. */
    const mainFile = path.join(ROOT, "shell", "main.js");
    const beforeBytes = fs.readFileSync(mainFile);
    const digest = sha(beforeBytes);
    let turned = false, detail = "plant line absent";
    try {
      const lines = beforeBytes.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:c7-cancel") >= 0);
      if (at >= 0) {
        lines.splice(at, 1);
        const lifted = await cancelScene(lines.join("\n"), "plant");
        turned = lifted.pre && lifted.here !== null && lifted.folder !== lifted.share && lifted.stopped === false;
        detail = (lifted.pre ? "the copy had landed" : "the copy had not (" + (lifted.refused ? "refused " + lifted.refused : "file " + lifted.file + ", channel " + lifted.named) + ")")
          + ", relayHere " + (lifted.here === null ? "null" : "answers")
          + ", folder " + (lifted.folder === lifted.share ? "back" : "the mirror")
          + ", channel " + (lifted.stopped ? "stopped" : "running");
      }
    } catch (e) {
      detail = e && e.message ? e.message : String(e);
    }
    const back = sha(fs.readFileSync(mainFile)) === digest;
    check(turned && back, "921b lifting plant:c7-cancel leaves the relay pin, the mirror and the channel after cancel, and the product file is never written: "
      + detail + ", sha " + (back ? "restored" : "differs"));

    /* Board 921, the test architect's edits. Cancel before admission puts back what the invitation changed, whatever the desk
       held before it, so each scene starts the desk from a different envelope. A leg reads the envelope the cancel wrote. */
    const LEFT_AT = "2026-09-01T08:30:00.000Z";
    const leadPin = { keyId: LEAD.keyId, public: LEAD.pub };
    const sealedKey = k => Buffer.from(Buffer.from(k.toString("base64"), "utf8").map(b => b ^ 0x5a)).toString("base64");
    const slot = (g, name) => (g.after[name] || {})[g.team];
    const barredHere = g => Array.isArray(g.after.teamBarred) && g.after.teamBarred.indexOf(g.team) >= 0;
    /* A folder invitation (E1): the desk works in its own folder `own`, takes an invitation naming `yard`, and cancels. The
       request it writes lands on the yard and the desk's own folder setting moves there; Cancel puts both back. */
    async function folderScene(src, tag, opt) {
      opt = opt || {};
      const team = "t-" + hex(8), secret = hex(16);
      const own = path.join(LAB, "c8-own-" + tag), yard = path.join(LAB, "c8-yard-" + tag);
      fs.mkdirSync(yard, { recursive: true });
      const D = deskFrom("c8-desk-" + tag, own, src, opt.held ? opt.held(team) : null);
      const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team, folder: yard,
        lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret }), "utf8").toString("base64url");
      const requests = () => {
        try { return fs.readdirSync(path.join(yard, "desks")).filter(d => fs.existsSync(path.join(yard, "desks", d, "join.json"))).length; }
        catch { return 0; }
      };
      const taken = await D.ask("etiuda:team-join", "invite", text, "Desk North", codeOf(secret));
      if (opt.twice) await D.ask("etiuda:team-join", "invite", text, "Desk North", codeOf(secret));
      let env = {};
      try { env = D.envelope(); } catch { env = {}; }
      const pre = !taken.refused && requests() === 1 && !!env.teamJoin && env.keys.eCatalogFolder === yard && D.api.catalogFolder() === yard
        && JSON.stringify((env.teamPins || {})[team]) === JSON.stringify(leadPin)
        && !!(env.teamShown && env.teamShown[team] && env.teamShown[team].folder === yard)
        && !(env.teamLeft && env.teamLeft[team]) && !(Array.isArray(env.teamBarred) && env.teamBarred.indexOf(team) >= 0);
      await D.ask("etiuda:team-join", "cancel");
      let after = {};
      try { after = D.envelope(); } catch { after = {}; }
      return { pre, team, own, yard, after, refused: taken && taken.refused, folder: D.api.catalogFolder(),
        set: after.keys && after.keys.eCatalogFolder, asks: requests() };
    }
    const asked = {
      pin: { held: team => ({ teamPins: { [team]: leadPin } }), unpinned: true },
      left: { held: team => ({ teamLeft: { [team]: LEFT_AT }, teamBarred: [team] }) },
      key: { held: (team, key) => ({ teamPins: { [team]: leadPin }, teamKeys: { [team]: { 1: sealedKey(key) } } }), keep: true, unpinned: true },
      twice: { twice: true },
      fresh: { folder: true },
      ftwice: { folder: true, twice: true },
      fleft: { folder: true, held: team => ({ teamLeft: { [team]: LEFT_AT }, teamBarred: [team] }) },
      /* E2: the desk is stopped and loaded again from desk.json between the invitation and the Cancel. Its envelope held a pin
         that came by an answered request and the team it showed, so the snapshot read back carries every table beforeKept checks. */
      restart: { restart: true, unpinned: true, held: (team, key, share) => ({ teamPins: { [team]: leadPin }, teamPinFrom: { [team]: "answer" },
        teamShown: { [team]: { lead: "Ada Quay", folder: share } } }) },
      /* A key newer than the one held at the invitation, which the invitation's wrap did not give, is in the envelope when the
         desk comes back: what the roster's wrap gives on admission, which the join does not list as wrapped (921n). */
      admit: { restart: true, edit: (doc, team, key) => { doc.teamKeys = Object.assign({}, doc.teamKeys, { [team]: { 1: sealedKey(key) } }); } },
      /* A snapshot whose mark is not a count. */
      tamper: { restart: true, view: true, edit: doc => { doc.teamJoin.invite.before.epoch = "1"; } },
      /* E4: slice 3's ordinary flow. The invitation's wrap is served, so the desk opens the team key on yes, before the lead
         admits it. A desk that had left the team (921u), one that held its pin and its shown team and the key (921v), one stopped
         and loaded again between the wrap and the Cancel (921w) and one that takes the invitation a second time after the wrap
         (921y) each cancel before admission. */
      wrap: { wrap: true, held: team => ({ teamLeft: { [team]: LEFT_AT }, teamBarred: [team] }) },
      wraphold: { wrap: true, keep: true, unpinned: true, held: (team, key, share) => ({ teamPins: { [team]: leadPin }, teamPinFrom: { [team]: "answer" },
        teamShown: { [team]: { lead: "Ada Quay", folder: share } }, teamKeys: { [team]: { 1: sealedKey(key) } } }) },
      wraprestart: { wrap: true, restart: true, unpinned: true, held: (team, key, share) => ({ teamPins: { [team]: leadPin }, teamPinFrom: { [team]: "answer" },
        teamShown: { [team]: { lead: "Ada Quay", folder: share } } }) },
      wrapretake: { wrap: true, retake: true },
      /* The list of epochs the wrap gave a key for is not a list of counts. */
      wrapbad: { restart: true, view: true, edit: doc => { doc.teamJoin.invite.relay.wrapped = "1"; } },
    };
    const runScene = (src, tag, name) => (asked[name].folder ? folderScene : cancelScene)(src, tag, asked[name]);
    const gone = g => g.here === null && g.folder === g.share && g.stopped;
    const folderBack = g => g.folder === g.own && g.set === g.own && g.asks === 0 && g.after.teamJoin === undefined
      && slot(g, "teamShown") === undefined && slot(g, "teamChannel") === undefined && slot(g, "teamPinFrom") === undefined;
    const verdict = {
      pin: g => gone(g) && JSON.stringify(slot(g, "teamPins")) === JSON.stringify(leadPin) && slot(g, "teamPinFrom") === undefined
        && slot(g, "teamShown") === undefined && slot(g, "teamChannel") === undefined,
      left: g => gone(g) && slot(g, "teamLeft") === LEFT_AT && barredHere(g) && slot(g, "teamPins") === undefined,
      key: g => gone(g) && JSON.stringify(slot(g, "teamPins")) === JSON.stringify(leadPin) && slot(g, "teamPinFrom") === undefined
        && slot(g, "teamShown") === undefined && slot(g, "teamChannel") === undefined && !!slot(g, "teamKeys") && g.after.teamJoin === undefined,
      twice: g => gone(g) && slot(g, "teamPins") === undefined && slot(g, "teamPinFrom") === undefined && slot(g, "teamShown") === undefined
        && slot(g, "teamChannel") === undefined,
      fresh: g => folderBack(g) && slot(g, "teamPins") === undefined,
      ftwice: g => folderBack(g) && slot(g, "teamPins") === undefined,
      fleft: g => folderBack(g) && slot(g, "teamPins") === undefined && slot(g, "teamLeft") === LEFT_AT && barredHere(g),
      restart: g => gone(g) && JSON.stringify(slot(g, "teamPins")) === JSON.stringify(leadPin) && slot(g, "teamPinFrom") === "answer"
        && !!slot(g, "teamShown") && slot(g, "teamShown").lead === "Ada Quay" && slot(g, "teamShown").folder === g.share
        && slot(g, "teamChannel") === undefined && g.after.teamJoin === undefined,
      admit: g => g.here !== null && g.folder !== g.share && g.still && !g.stopped && JSON.stringify(slot(g, "teamPins")) === JSON.stringify(leadPin)
        && slot(g, "teamPinFrom") === "invite" && !!slot(g, "teamChannel") && !!slot(g, "teamKeys") && g.after.teamJoin === undefined,
      tamper: g => g.kept === false,
      /* E4. Back to the folder and off the relay, the leave record and the bar again, nothing else the invitation set, and no key from its wrap. */
      wrap: g => gone(g) && slot(g, "teamPins") === undefined && slot(g, "teamPinFrom") === undefined && slot(g, "teamShown") === undefined
        && slot(g, "teamChannel") === undefined && slot(g, "teamLeft") === LEFT_AT && barredHere(g) && slot(g, "teamKeys") === undefined
        && g.after.teamJoin === undefined,
      wraphold: g => verdict.restart(g) && typeof (slot(g, "teamKeys") || {})[1] === "string",
      wraprestart: g => verdict.restart(g) && slot(g, "teamKeys") === undefined,
      wrapretake: g => gone(g) && slot(g, "teamPins") === undefined && slot(g, "teamPinFrom") === undefined && slot(g, "teamShown") === undefined
        && slot(g, "teamChannel") === undefined && slot(g, "teamLeft") === undefined && !barredHere(g) && slot(g, "teamKeys") === undefined
        && g.after.teamJoin === undefined,
      wrapbad: g => g.kept === false,
    };
    const told = g => (g.pre ? "the copy had landed" : "the copy had not (" + (g.refused ? "refused " + g.refused : "file " + g.file + ", channel " + g.named) + ")")
      + ", relayHere " + (g.here === null ? "null" : "answers")
      + ", folder " + (g.folder === g.share ? "the share" : "the mirror")
      + ", channel " + (g.stopped ? "stopped" : "running")
      + ", pin " + (slot(g, "teamPins") ? "kept" : "gone")
      + ", from " + (slot(g, "teamPinFrom") || "gone")
      + ", shown " + (slot(g, "teamShown") ? "kept" : "gone")
      + ", channel named " + (slot(g, "teamChannel") ? "yes" : "no")
      + ", key " + (slot(g, "teamKeys") ? "kept" : "gone")
      + ", left " + (slot(g, "teamLeft") ? "kept" : "gone")
      + ", barred " + (barredHere(g) ? "yes" : "no")
      + ", join " + (g.after.teamJoin === undefined ? "gone" : "standing");
    const toldFolder = g => (g.pre ? "the invitation had been taken" : "the invitation had not (" + (g.refused ? "refused " + g.refused : "its state was not as taken") + ")")
      + ", folder " + (g.folder === g.own ? "the one from before" : g.folder === g.yard ? "the invited one" : "another")
      + ", setting " + (g.set === g.own ? "back" : g.set === g.yard ? "the invited one" : "other")
      + ", request " + (g.asks ? "still on the share" : "off the share")
      + ", pin " + (slot(g, "teamPins") ? "kept" : "gone")
      + ", shown " + (slot(g, "teamShown") ? "kept" : "gone")
      + ", left " + (slot(g, "teamLeft") ? "kept" : "gone")
      + ", barred " + (barredHere(g) ? "yes" : "no")
      + ", join " + (g.after.teamJoin === undefined ? "gone" : "standing");
    const scenes = {};
    for (const name of Object.keys(asked)) scenes[name] = await runScene(fs.readFileSync(mainFile, "utf8"), name, name);
    check(scenes.pin.pre && verdict.pin(scenes.pin),
      "921c a desk that held the lead's pin before the invitation, and cancels before it is admitted, is off the relay with the pin still there"
      + " and the invitation's from, folder and channel gone: " + told(scenes.pin));
    check(scenes.left.pre && verdict.left(scenes.left),
      "921d a desk that had left the team, and cancels the invitation before it is admitted, has its leave record and its bar again: "
      + told(scenes.left));
    check(scenes.key.pre && verdict.key(scenes.key),
      "921e a desk that held the team's key before a relay invitation, and cancels it, goes back to the folder and the shown team it had, off the relay,"
      + " keeping its pin and its key: " + told(scenes.key));
    check(scenes.twice.pre && verdict.twice(scenes.twice),
      "921f a desk that takes the same invitation twice and cancels is back as it was before the first: " + told(scenes.twice));
    check(scenes.fresh.pre && verdict.fresh(scenes.fresh),
      "921j a desk that takes a folder invitation and cancels it before the lead admits it is back as before: the pin, the shown team and the request on the"
      + " share gone, and its own folder setting again: " + toldFolder(scenes.fresh));
    check(scenes.ftwice.pre && verdict.ftwice(scenes.ftwice),
      "921k a desk that takes the same folder invitation twice and cancels is back as it was before the first: " + toldFolder(scenes.ftwice));
    check(scenes.fleft.pre && verdict.fleft(scenes.fleft),
      "921l a desk that had left the team, and cancels a folder invitation before it is admitted, has its leave record and its bar again: " + toldFolder(scenes.fleft));
    check(scenes.restart.pre && verdict.restart(scenes.restart),
      "921m a desk stopped and loaded again from desk.json between a relay invitation and its Cancel reads the snapshot back and still puts back the pin,"
      + " where it came from, the shown team and the folder: " + told(scenes.restart));
    check(scenes.admit.pre && verdict.admit(scenes.admit),
      "921n a desk that keeps a key newer than the one it held at the invitation which the invitation's wrap did not give (one the roster's wrap gave),"
      + " and cancels, is left on the relay as the invitation set it: " + told(scenes.admit));
    check(scenes.tamper.pre && verdict.tamper(scenes.tamper),
      "921o a snapshot whose mark of the key held is not a count is not read back from desk.json, and the request that carried it is not kept: the request "
      + (scenes.tamper.kept ? "was kept" : "was dropped"));
    check(scenes.wrap.pre && verdict.wrap(scenes.wrap),
      "921u a desk that had left the team, takes a relay invitation whose wrap opens the team key on yes, and cancels before the lead admits it, has all seven"
      + " things back (the pin, where it came from, the shown team, the channel, the leave record, the bar and its folder) and no key from that wrap in the envelope: "
      + told(scenes.wrap));
    check(scenes.wraphold.pre && verdict.wraphold(scenes.wraphold),
      "921v a desk that held the team's key before the invitation, and cancels after the invitation's wrap opened that epoch again, has its pin, where it came from,"
      + " its shown team and its key: " + told(scenes.wraphold));
    check(scenes.wraprestart.pre && verdict.wraprestart(scenes.wraprestart),
      "921w a desk stopped and loaded again from desk.json after the invitation's wrap opened the team key still forgets that key on Cancel and puts back the pin,"
      + " where it came from, the shown team and the folder: " + told(scenes.wraprestart));
    check(scenes.wrapbad.pre && verdict.wrapbad(scenes.wrapbad),
      "921x a list of the epochs the wrap gave a key for that is not a list of counts is not read back from desk.json, and the request that carried it is not kept: the request "
      + (scenes.wrapbad.kept ? "was kept" : "was dropped"));
    check(scenes.wrapretake.pre && verdict.wrapretake(scenes.wrapretake),
      "921y a desk that takes the invitation a second time after its wrap opened the team key, and cancels, is back as it was before the first, with no key from that wrap: "
      + told(scenes.wrapretake));

    /* The plants. Each leg above is red where the line it guards is lifted, the file is read back from disk and put back byte for byte. */
    async function planted(edit, names) {
      const bytes = fs.readFileSync(mainFile), sum = sha(bytes), got = {};
      let said = "plant line absent";
      try {
        const text = edit(bytes.toString("utf8"));
        if (text !== null) {
          said = "";
          for (const name of names) got[name] = await runScene(text, "plant-" + name, name);
        }
      } catch (e) {
        said = e && e.message ? e.message : String(e);
      }
      return { got, said, back: sha(fs.readFileSync(mainFile)) === sum };
    }
    const red = (r, names) => names.every(n => r.got[n] && r.got[n].pre && !verdict[n](r.got[n]));
    const redTold = (r, names) => r.said || names.map(n => n + " " + (r.got[n] ? (r.got[n].pre ? (verdict[n](r.got[n]) ? "green" : "red") : "not reached") : "not run")).join(", ");
    const dropLine = mark => text => { const lines = text.split(/\n/), at = lines.findIndex(l => l.indexOf(mark) >= 0); if (at < 0) return null; lines.splice(at, 1); return lines.join("\n"); };
    const swapText = (mark, part, to) => text => { const lines = text.split(/\n/), at = lines.findIndex(l => l.indexOf(mark) >= 0); if (at < 0 || lines[at].indexOf(part) < 0) return null; lines[at] = lines[at].replace(part, to); return lines.join("\n"); };
    const dropText = (mark, part) => swapText(mark, part, "");
    const lifted = await planted(dropLine("plant:c7-cancel"), ["pin", "left", "twice", "key", "fresh"]);
    check(red(lifted, ["pin", "left", "twice", "key", "fresh"]) && lifted.back,
      "921g lifting plant:c7-cancel reddens 921c, 921d, 921e, 921f and 921j, and the product file is never written: " + redTold(lifted, ["pin", "left", "twice", "key", "fresh"]) + ", sha " + (lifted.back ? "restored" : "differs"));
    const clause = await planted(dropText("plant:c7-cancel", " && newestEpoch(j.team, wrapped) === (b.epoch || 0)"), ["admit"]);
    check(red(clause, ["admit"]) && clause.back,
      "921h lifting the clause that holds the restore to a desk with no newer key than at the invitation reddens 921n, and the product file is never written: " + redTold(clause, ["admit"]) + ", sha " + (clause.back ? "restored" : "differs"));
    const chain = await planted(dropText("plant:c7-chain", "kept || "), ["twice", "ftwice"]);
    check(red(chain, ["twice", "ftwice"]) && chain.back,
      "921i lifting plant:c7-chain, the snapshot the first invitation took, reddens 921f and 921k, and the product file is never written: " + redTold(chain, ["twice", "ftwice"]) + ", sha " + (chain.back ? "restored" : "differs"));
    const mark = await planted(dropText("plant:c7-mark", ", epoch: newestEpoch(team)"), ["key"]);
    check(red(mark, ["key"]) && mark.back,
      "921p lifting plant:c7-mark, the key held at the invitation, reddens 921e, and the product file is never written: " + redTold(mark, ["key"]) + ", sha " + (mark.back ? "restored" : "differs"));
    const folderSnap = await planted(swapText("plant:c8-before", "inviteBeforeFor(parsed.team, keptJoin)", "undefined"), ["fresh", "ftwice", "fleft"]);
    check(red(folderSnap, ["fresh", "ftwice", "fleft"]) && folderSnap.back,
      "921q lifting plant:c8-before, the snapshot a folder invitation takes, reddens 921j, 921k and 921l, and the product file is never written: " + redTold(folderSnap, ["fresh", "ftwice", "fleft"]) + ", sha " + (folderSnap.back ? "restored" : "differs"));
    const ownSet = await planted(dropLine("plant:c8-own"), ["fresh"]);
    check(red(ownSet, ["fresh"]) && ownSet.back,
      "921r lifting plant:c8-own, the folder setting put back, reddens 921j, and the product file is never written: " + redTold(ownSet, ["fresh"]) + ", sha " + (ownSet.back ? "restored" : "differs"));
    const kept = await planted(swapText("plant:c7-kept", "beforeKept(inv.before)", "false"), ["restart"]);
    check(red(kept, ["restart"]) && kept.back,
      "921s lifting plant:c7-kept, so the envelope refuses every snapshot, reddens 921m, and the product file is never written: " + redTold(kept, ["restart"]) + ", sha " + (kept.back ? "restored" : "differs"));
    const epoch = await planted(swapText("plant:c7-epoch", "(Number.isInteger(b.epoch) && b.epoch >= 0)", "true"), ["tamper"]);
    check(red(epoch, ["tamper"]) && epoch.back,
      "921t lifting plant:c7-epoch, the check that the mark is a count, reddens 921o, and the product file is never written: " + redTold(epoch, ["tamper"]) + ", sha " + (epoch.back ? "restored" : "differs"));
    const markLift = await planted(dropLine("plant:e4-mark"), ["wrap", "wraprestart", "wrapretake"]);
    check(red(markLift, ["wrap", "wraprestart", "wrapretake"]) && markLift.back,
      "921z lifting plant:e4-mark, the epoch the wrap gave marked in the join, reddens 921u, 921w and 921y, and the product file is never written: " + redTold(markLift, ["wrap", "wraprestart", "wrapretake"]) + ", sha " + (markLift.back ? "restored" : "differs"));
    const hadLift = await planted(dropText("plant:e4-mark", " && !had"), ["wraphold"]);
    check(red(hadLift, ["wraphold"]) && hadLift.back,
      "921aa lifting the clause that leaves a key the desk held before unmarked reddens 921v, and the product file is never written: " + redTold(hadLift, ["wraphold"]) + ", sha " + (hadLift.back ? "restored" : "differs"));
    const skipLift = await planted(swapText("plant:c7-cancel", "newestEpoch(j.team, wrapped)", "newestEpoch(j.team)"), ["wrap", "wraprestart", "wrapretake"]);
    check(red(skipLift, ["wrap", "wraprestart", "wrapretake"]) && skipLift.back,
      "921ab lifting the leaving out of the wrap's epochs when Cancel compares with the mark reddens 921u, 921w and 921y, and the product file is never written: " + redTold(skipLift, ["wrap", "wraprestart", "wrapretake"]) + ", sha " + (skipLift.back ? "restored" : "differs"));
    const forgetLift = await planted(dropLine("plant:e4-forget"), ["wrap", "wraprestart", "wrapretake"]);
    check(red(forgetLift, ["wrap", "wraprestart", "wrapretake"]) && forgetLift.back,
      "921ac lifting plant:e4-forget, the wrap's keys let go on Cancel, reddens 921u, 921w and 921y, and the product file is never written: " + redTold(forgetLift, ["wrap", "wraprestart", "wrapretake"]) + ", sha " + (forgetLift.back ? "restored" : "differs"));
    const wrappedLift = await planted(swapText("plant:e4-wrapped", "(Array.isArray(r.wrapped) && r.wrapped.length <= 64 && r.wrapped.every(n => Number.isInteger(n) && n >= 1))", "true"), ["wrapbad"]);
    check(red(wrappedLift, ["wrapbad"]) && wrappedLift.back,
      "921ad lifting plant:e4-wrapped, the check that the wrap's epochs are counts, reddens 921x, and the product file is never written: " + redTold(wrappedLift, ["wrapbad"]) + ", sha " + (wrappedLift.back ? "restored" : "differs"));
    const gaveLift = await planted(dropLine("plant:e4-chain"), ["wrapretake"]);
    check(red(gaveLift, ["wrapretake"]) && gaveLift.back,
      "921ae lifting plant:e4-chain, the epochs the first invitation's wrap gave kept by the second, reddens 921y, and the product file is never written: " + redTold(gaveLift, ["wrapretake"]) + ", sha " + (gaveLift.back ? "restored" : "differs"));

    /* C6, board 923: a desk that already keeps the key of the team's epoch takes an invitation, and the lead admits it at that
       epoch with the next rev. Admission does not rotate the key, so the join finishes on the roster that names this desk with
       a wrap it opened. `named` is a yard whose rev 1, heeded before the invitation, already names this desk: a roster read
       before the request is never its answer, and the join waits for the lead's rev 2. */
    async function heldJoin(src, tag, named) {
      const team = "t-" + hex(8), secret = hex(16), key = crypto.randomBytes(32);
      const own = path.join(LAB, "c6-own-" + tag), yard = path.join(LAB, "c6-yard-" + tag);
      fs.mkdirSync(yard, { recursive: true });
      const doc = (rev, roster) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: team, catalogs: ["quay-board"],
        lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev, roster }, LEAD), null, 1) + "\n";
      const D = deskFrom("c6-desk-" + tag, own, src, Object.assign({ teamPins: { [team]: leadPin }, teamKeys: { [team]: { 1: sealedKey(key) } } },
        named ? { teamRevSeen: { [team]: { [LEAD.pub]: { epoch: 1, rev: 1 } } } } : {}));
      const pre = await D.ask("etiuda:branch-identity", true);
      const entryOf = () => ({ desk: { id: pre.id, key: pre.key, box: pre.box }, wrap: D.api.wrapTeamKey(key, pre.box, team, 1, pre.id) });
      put(yard, C.TEAM_NAME, doc(1, named ? [entryOf()] : []));
      const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team, folder: yard,
        lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret }), "utf8").toString("base64url");
      const taken = await D.ask("etiuda:team-join", "invite", text, "Desk North", codeOf(secret));
      const joinAt = path.join(yard, "desks", pre.id, "join.json");
      const asked = !taken.refused && fs.existsSync(joinAt) && !!D.envelope().teamJoin && D.envelope().teamJoin.held === 1;
      D.api.heedTeam();
      await D.ask("etiuda:team-join", "view");
      const waited = fs.existsSync(joinAt) && !!D.envelope().teamJoin;
      put(yard, C.TEAM_NAME, doc(2, [entryOf()]));
      D.api.heedTeam();
      const view = await D.ask("etiuda:team-join", "view");
      return { asked, waited, refused: taken.refused, gone: !fs.existsSync(joinAt), join: D.envelope().teamJoin, joined: !!(view && view.joined && view.joined.team === team) };
    }
    const heldTold = g => (g.asked ? "asked" : "not asked" + (g.refused ? " (refused " + g.refused + ")" : "")) + ", before rev 2 the request "
      + (g.waited ? "waited" : "was let go") + ", after it join.json " + (g.gone ? "deleted" : "still there") + ", the join " + (g.join ? "standing" : "gone")
      + ", said " + (g.joined ? "joined" : "nothing");
    const heldOk = g => g.asked && g.gone && !g.join && g.joined;
    try {
      const mainNow = fs.readFileSync(mainFile, "utf8");
      const h = await heldJoin(mainNow, "held", false);
      check(heldOk(h), "923c a desk holding the key of the team's epoch takes an invitation, and the lead's next rev at that epoch names it with a wrap it opens: the join finishes: " + heldTold(h));
      const n = await heldJoin(mainNow, "named", true);
      check(heldOk(n) && n.waited, "923d a roster heeded before the invitation that already names this desk does not finish the join, and the lead's rev 2 does: " + heldTold(n));
      const nameBytes = sha(fs.readFileSync(mainFile));
      const liftedNamed = dropLine("plant:c6-named")(mainNow);
      const ln = liftedNamed === null ? null : await heldJoin(liftedNamed, "plant-held", false);
      check(!!ln && ln.asked && !heldOk(ln) && sha(fs.readFileSync(mainFile)) === nameBytes,
        "923e lifting plant:c6-named reddens 923c, and the product file is never written: " + (ln ? heldTold(ln) : "plant line absent"));
      const liftedFresh = swapText("plant:c6-fresh", "raised && ", "")(mainNow);
      const lf = liftedFresh === null ? null : await heldJoin(liftedFresh, "plant-named", true);
      check(!!lf && !lf.refused && !lf.waited && sha(fs.readFileSync(mainFile)) === nameBytes,
        "923f lifting plant:c6-fresh finishes the join on the roster heeded before the invitation, reddening 923d, and the product file is never written: " + (lf ? heldTold(lf) : "plant line absent"));
    } catch (e) {
      check(false, "harness (the legs 923c): " + (e && e.stack ? e.stack : e));
    }
  } catch (e) {
    check(false, "harness (the legs 921a to 921ae): " + (e && e.stack ? e.stack : e));
  }

  /* A desk that left a relay team, was removed after, and is invited again. Leaving sets the mirror's team file aside,
     so the old wrap is not read on the way back in and the new request is not thrown away. */
  async function relayLeft(make) {
    const rt = hex(16), team = "t-" + hex(8), key = crypto.randomBytes(32);
    const secret = hex(16), inv = hex(16), token = hex(32);
    const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
    if (made.status !== 200) return { fail: "team " + JSON.stringify(made.json) };
    const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }];
    const t0 = R.clock.now;
    const invited = await admin("POST", "/relay/v1/t/" + rt + "/invites", { add, drop: [], t: t0,
      sig: signHex(LEAD, core.invitesBytes(rt, t0, add, [])) });
    if (invited.status !== 200) return { fail: "invite " + JSON.stringify(invited.json) };
    const tag = rt.slice(0, 8);
    const mirrorL = path.join(LAB, "961-lead-" + tag);
    const leadT = transport("961-lead-" + tag);
    const live = [{ id: inv, key: C.inviteSealKey(secret) }];
    const lead = C.createChannel({ rt, url: URLV1, mirror: mirrorL, stateFile: path.join(LAB, "961-lead-" + tag + ".json"),
      pin: () => ({ teamId: team, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
      me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }),
      keyFor: e => (e === 1 ? key : null), sealEpoch: () => 1, inviteKeys: () => live.slice(),
      request: leadT.request, connect: leadT.connect, pollMs: 1e9, watch: false });
    const textOf = (rev, roster) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: team, catalogs: ["quay-board"],
      lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev,
      channel: { kind: "relay", rt, url: URLV1 }, ring: RING, roster }, LEAD), null, 1) + "\n";
    put(mirrorL, C.TEAM_NAME, textOf(1, []));
    lead.start();
    await lead.idle();
    const share = path.join(LAB, "961-share-" + tag);
    fs.mkdirSync(share, { recursive: true });
    const H = make(share, tag);
    const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team, relay: { rt, url: URLV1, token, inv },
      lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret }), "utf8").toString("base64url");
    const taken = await H.ask("etiuda:team-join", "invite", text, "Desk Twelve", codeOf(secret));
    const me = await H.ask("etiuda:branch-identity", false);
    const joinRel = me ? "desks/" + me.id + "/join.json" : "";
    const asked = await until(async () => {
      const ch = H.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); }
      await lead.kick(); await lead.idle();
      return !!joinRel && !!read(mirrorL, joinRel);
    }, 8000);
    /* The first request as the lead holds it. It stays in the lead's mirror, so the second is told from it by its body and
       by the invitation it names. */
    const inviteOf = text => { try { const d = JSON.parse(text); return d && d.invite && typeof d.invite.id === "string" ? d.invite.id : null; } catch { return null; } };
    const firstBody = asked && joinRel ? read(mirrorL, joinRel) : null;
    const firstInvite = firstBody === null ? null : inviteOf(firstBody);
    if (me) {
      const entry = { desk: { id: me.id, key: me.key, box: me.box }, wrap: H.api.wrapTeamKey(key, me.box, team, 1, me.id) };
      put(mirrorL, C.TEAM_NAME, textOf(2, [entry]));
      const t1 = R.clock.now, keys = [{ id: me.id, pub: me.key, desk: me.id }];
      await admin("POST", "/relay/v1/t/" + rt + "/devices", { keys, rev: 1, t: t1,
        sig: signHex(LEAD, core.devicesBytes(rt, 1, t1, keys)) });
      await lead.kick(); await lead.idle();
    }
    const admitted = await until(async () => {
      const ch = H.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); }
      const held = (H.envelope().teamKeys || {})[team];
      return !!(held && held[1]);
    }, 8000);
    await H.ask("etiuda:team-join", "leave", team);
    /* Leaving asks the shell to stop the channel on its next turn (relaySoon), and a person takes the next invitation long
       after that. Taken in the same turn, the invitation finds the old channel still there, holding the key that is about
       to be removed, and keeps it. */
    await wait(50);
    const teamFile = path.join(H.ud, "relay", rt, C.TEAM_NAME);
    const parked = !fs.existsSync(teamFile) && fs.existsSync(teamFile + ".aside");
    R.clock.now += 1;
    put(mirrorL, C.TEAM_NAME, textOf(3, []));
    await lead.kick(); await lead.idle();
    const t2 = R.clock.now;
    await admin("POST", "/relay/v1/t/" + rt + "/devices", { keys: [], rev: 2, t: t2,
      sig: signHex(LEAD, core.devicesBytes(rt, 2, t2, [])) });
    R.clock.now += 1;
    const secret2 = hex(16), inv2 = hex(16), token2 = hex(32);
    const add2 = [{ id: inv2, hash: sha(Buffer.from(token2, "utf8")) }];
    const t3 = R.clock.now;
    await admin("POST", "/relay/v1/t/" + rt + "/invites", { add: add2, drop: [], t: t3,
      sig: signHex(LEAD, core.invitesBytes(rt, t3, add2, [])) });
    live.length = 0;
    live.push({ id: inv2, key: C.inviteSealKey(secret2) });
    const text2 = "etiuda-join:" + Buffer.from(JSON.stringify({ team, relay: { rt, url: URLV1, token: token2, inv: inv2 },
      lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret: secret2 }), "utf8").toString("base64url");
    const again = await H.ask("etiuda:team-join", "invite", text2, "Desk Twelve", codeOf(secret2));
    const sent2 = await until(async () => {
      const ch = H.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); }
      await lead.kick(); await lead.idle();
      const body = joinRel ? read(mirrorL, joinRel) : null;
      return firstInvite !== null && body !== null && body !== firstBody && inviteOf(body) !== null && inviteOf(body) !== firstInvite;
    }, 8000);
    const ch = H.api.relayRun(); if (ch) await ch.stop();
    await lead.stop();
    return { taken: !taken.refused, asked, admitted, parked, again: again && !again.refused, sent2, teamFile };
  }
  try {
    const left = await relayLeft((share, tag) => newDesk("961-desk-" + tag, share));
    check(left.taken && left.asked && left.admitted && left.parked && left.again && left.sent2,
      "961f a desk that left, was removed, and is invited again sends its request: taken " + left.taken
      + ", first request " + (left.asked ? "at the lead" : "missing") + ", admitted " + left.admitted
      + ", the old team file " + (left.parked ? "set aside" : "still in the mirror")
      + ", the new request " + (left.sent2 ? "at the lead, other than the first" : "missing, or the first still there"));
  } catch (e) {
    check(false, "961f harness: " + (e && e.stack ? e.stack : e));
  }
  {
    const src = path.join(APP, "shell", "main.js");
    const beforeBytes = fs.readFileSync(src);
    const digest = sha(beforeBytes);
    let turned = false, detail = "plant line absent";
    try {
      const lines = beforeBytes.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:leave-aside") >= 0);
      if (at >= 0) {
        lines.splice(at, 1);
        const spliced = lines.join("\n");
        const out = await relayLeft((share, tag) => {
          const ud = path.join(LAB, "961g-desk-" + tag);
          fs.mkdirSync(ud, { recursive: true });
          fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
            keys: { eCatalogFolder: share, eUiLang: "en" } }));
          return loadDesk(ud, spliced);
        });
        turned = out.admitted === true && out.parked === false && fs.existsSync(out.teamFile);
        detail = "admitted " + out.admitted + ", team file " + (out.parked ? "set aside" : "still in the mirror");
      }
    } catch (e) {
      detail = e && e.message ? e.message : String(e);
    }
    const back = sha(fs.readFileSync(src)) === digest;
    check(turned && back, "961g lifting plant:leave-aside leaves the old team file in the mirror, and the product file is never written: "
      + detail + ", sha " + (back ? "restored" : "differs"));
  }
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

check(regStand.held(), "942f every reg call was answered by the stand-in (" + regStand.said() + ")");

/* F8. A joining desk seals its one request at an epoch a verified lead blob named. A header the relay lists moves
   leadEpoch only once the pinned lead's upload signature verifies. F7, the program's half: a blob is parked to wait
   for a key only after that signature verifies under a writer this program trusts, so a forged future epoch cannot
   fill pending or push an honest wait out. */
{
  const LEAD8 = keyPair(false, "lane-lead");
  const DESK8 = keyPair(true);
  const rt8 = hex(16), team8 = "t-" + hex(8);
  const pin8 = { teamId: team8, rt: rt8, lead: { keyId: LEAD8.keyId, public: LEAD8.pub } };
  const SEAL8 = crypto.randomBytes(32), INV8 = hex(16), TOKEN8 = hex(32);
  const leadW = { keyId: LEAD8.keyId, privateKey: LEAD8.privateKey };
  function net8(forged) {
    const puts = [];
    const id = hex(16);
    const ct = Buffer.from("forged");
    const meta = { v: 1, id, writer: LEAD8.keyId, epoch: 999999, counter: 1, size: ct.length,
      sig: "ab".repeat(64), nonce: "cd".repeat(12), supersedes: null, del: false };
    const b64 = Buffer.from(JSON.stringify(meta), "utf8").toString("base64url");
    const request = async (method, url, headers, body) => {
      const u = String(url);
      const ok = j => ({ status: 200, header: () => null, bytes: Buffer.from(JSON.stringify(j)) });
      if (method === "POST" && u.endsWith("/hello")) return ok({ challenge: "ab".repeat(16) });
      if (method === "POST" && u.endsWith("/session")) {
        const parsed = JSON.parse(body.toString("utf8"));
        /* A key-only hello is not enrolled. The token hello also names this desk's key, and that one is the invitation's session. */
        if (parsed.invite) return ok({ session: "cd".repeat(32) });
        if (parsed.key) return { status: 403, header: () => null, bytes: Buffer.from(JSON.stringify({ error: "not-enrolled", said: "That key is not enrolled for this team." })) };
        return ok({ session: "cd".repeat(32) });
      }
      if (method === "GET" && u.includes("/since/")) return ok(forged ? [{ seq: 1, meta }] : []);
      if (method === "GET" && u.includes("/b/")) return { status: 200, header: n => (n === "etiuda-blob" ? b64 : null), bytes: ct };
      if (method === "PUT") {
        puts.push(JSON.parse(Buffer.from(headers["etiuda-blob"], "base64url").toString("utf8")));
        return ok({ seq: 1, id: "ok" });
      }
      return { status: 404, header: () => null, bytes: Buffer.from("{}") };
    };
    return { request, puts };
  }
  async function join8(forged) {
    const tag = forged ? "bug" : "ctl";
    const mirror = path.join(LAB, "f8-" + tag);
    const rel = "desks/" + DESK8.keyId + "/join.json";
    fs.mkdirSync(path.join(mirror, "desks", DESK8.keyId), { recursive: true });
    C.writeWhole(path.join(mirror, ...rel.split("/")), "{\"kind\":\"join\"}\n");
    const n = net8(forged);
    const ch = C.createChannel({
      rt: rt8, url: URLV1, mirror, stateFile: path.join(LAB, "f8-" + tag + ".json"),
      watch: false, pollMs: 1e9, pin: () => pin8,
      me: () => ({ keyId: DESK8.keyId, public: DESK8.pub, privateKey: DESK8.privateKey, place: "desk:" + DESK8.keyId }),
      keyFor: () => null, sealEpoch: () => null,
      invite: () => ({ inv: INV8, token: TOKEN8, seal: SEAL8 }),
      request: n.request, connect: () => null, say() {},
    });
    ch.start();
    await ch.idle();
    await ch.stop();
    return { epoch: n.puts[0] ? n.puts[0].epoch : null, leadEpoch: ch.program.state().leadEpoch, puts: n.puts.length };
  }
  const control8 = await join8(false);
  check(control8.epoch === 1 && control8.leadEpoch === 0 && control8.puts === 1,
    "951a f8-control with no forged header, join.json is sealed at epoch " + control8.epoch
    + " (leadEpoch " + control8.leadEpoch + ", puts " + control8.puts + ")");
  const forged8 = await join8(true);
  check(forged8.epoch === 1 && forged8.leadEpoch === 0 && forged8.puts === 1,
    "951b f8 a forged lead header must not raise the epoch a join is sealed at: sealed " + forged8.epoch
    + ", leadEpoch " + forged8.leadEpoch + ", puts " + forged8.puts);

  const prog8 = C.createProgram({
    io: { read() { return null; }, write() {}, remove() {}, list() { return []; } },
    pin: pin8, clock: () => 1700000000000, save() {}, say() {},
  });
  const signed2 = B.seal({ relayTeamId: rt8, epoch: 2, teamKey: crypto.randomBytes(32), writer: leadW,
    path: "guide.ec", body: "v", counter: 1, place: "root" });
  const itemOf = (b, seq) => ({ seq, ct: b.ciphertext, meta: { v: 1, id: b.id, writer: b.writerKeyId, epoch: b.epoch,
    counter: b.counter, size: b.ciphertext.length, sig: b.signature, nonce: b.nonce, supersedes: b.supersedes, del: !!b.deletion } });
  const lie = { seq: 2, ct: Buffer.from("forged"), meta: { v: 1, id: hex(16), writer: LEAD8.keyId, epoch: 999999, counter: 1,
    size: 6, sig: "ab".repeat(64), nonce: "cd".repeat(12), supersedes: null, del: false } };
  prog8.applyBatch([itemOf(signed2, 1), lie], { keyFor: () => null });
  check(prog8.state().leadEpoch === 2,
    "951e f8 a verified lead blob raises the lead's epoch and a forged header beside it does not: leadEpoch " + prog8.state().leadEpoch);

  const K1 = crypto.randomBytes(32);
  const prog7 = C.createProgram({
    io: { read() { return null; }, write() {}, remove() {}, list() { return []; } },
    pin: pin8, clock: () => 1700000000000, save() {}, say() {},
  });
  const ctx7 = { keyFor: e => (e === 1 ? K1 : null) };
  const good = B.seal({ relayTeamId: rt8, epoch: 1, teamKey: K1, writer: leadW, path: "guide.ec", body: "v", counter: 1, place: "root" });
  const bad = Object.assign({}, good, { id: hex(16), signature: "aa".repeat(64), counter: 2 });
  prog7.applyBatch([itemOf(bad, 1)], ctx7);
  const afterBad = prog7.state().pending.map(p => p.id);
  check(afterBad.length === 0,
    "951c f7-control a bad signature at an epoch the desk holds is not pending (" + afterBad.length + ")");
  const waiting = B.seal({ relayTeamId: rt8, epoch: 2, teamKey: K1, writer: leadW, path: "hold.ec", body: "wait", counter: 1, place: "root" });
  const junk = [];
  for (let i = 0; i < 1000; i++) {
    const id = hex(16);
    const ct = Buffer.from("x");
    junk.push({ seq: 10 + i, ct, meta: { v: 1, id, writer: LEAD8.keyId, epoch: 999999, counter: 1, size: ct.length,
      sig: "ab".repeat(64), nonce: "cd".repeat(12), supersedes: null, del: false } });
  }
  prog7.applyBatch([itemOf(waiting, 2)].concat(junk), ctx7);
  const pending = prog7.state().pending;
  const kept = pending.some(p => p.id === waiting.id);
  const forgedN = pending.filter(p => p.epoch === 999999).length;
  check(kept && forgedN === 0 && pending.length === 1,
    "951d f7 a forged epoch must not be pending and must not evict a real wait: pending " + pending.length
    + ", forged " + forgedN + ", real id kept " + kept);
}

/* The writer's row, a same-epoch removal, and board 910: a desk blob parks only at an epoch a verified lead blob
   has named, and only under a key the newest roster still names. */
{
  const memoryIo = { read() { return null; }, write() {}, remove() {}, list() { return []; } };
  const rowOf = k => ({ desk: { id: k.keyId, key: k.pub, box: "ab".repeat(32) } });
  function teamDoc(tm, rt, epoch, rev, roster) {
    return signDoc({ format: 1, kind: "etiuda-team", id: tm, catalogs: ["pebble-board"],
      lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch, rev,
      channel: { kind: "relay", rt, url: URLV1 }, roster }, LEAD);
  }
  function counted(mod) {
    const rt = hex(16), tm = "t-" + hex(8), signer = keyPair(true), other = keyPair(true);
    const pin = { teamId: tm, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
    const doc = teamDoc(tm, rt, 1, 1, [rowOf(signer), rowOf(other)]);
    const key = crypto.randomBytes(32);
    const rel = "desks/" + signer.keyId + "/stats.estat";
    const blob = B.seal({ relayTeamId: rt, epoch: 1, teamKey: key,
      writer: { keyId: signer.keyId, privateKey: signer.privateKey }, path: rel, body: "counted", counter: 1,
      place: "desk:" + other.keyId });
    const prog = mod.createProgram({ io: memoryIo, pin, say() {} });
    const loaded = prog.loadTeamFile(doc);
    const r = prog.acceptBlob({ blob, teamDoc: doc, teamKey: key });
    return { loaded, r, signer: signer.keyId, other: other.keyId };
  }
  const held = counted(C);
  check(held.loaded.ok === true && held.r.ok === true && held.r.keyId === held.signer && held.r.deskId === held.signer
    && held.r.deskId !== held.other && held.r.rev === 1 && held.r.epoch === 1,
    "944t a desk file is counted under the roster row for the key that signed it, not under a place the blob carries: desk "
    + held.r.deskId + ", key " + held.r.keyId + ", the other desk " + held.other
    + (held.r.ok === true ? "" : " (" + held.r.reason + ")"));

  function sameEpoch(mod) {
    const rt = hex(16), tm = "t-" + hex(8);
    const gone = keyPair(true), stay = keyPair(true), stranger = keyPair(true);
    const pin = { teamId: tm, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
    const key = crypto.randomBytes(32);
    const seal = (writer, rel, counter, body) => B.seal({ relayTeamId: rt, epoch: 1, teamKey: key,
      writer: { keyId: writer.keyId, privateKey: writer.privateKey }, path: rel, body, counter, place: "desk:" + writer.keyId });
    const gonePath = "desks/" + gone.keyId + "/stats.estat";
    const stayPath = "desks/" + stay.keyId + "/stats.estat";
    const strayPath = "desks/" + stranger.keyId + "/stats.estat";
    const dir = path.join(LAB, "s2r-" + hex(4));
    fs.mkdirSync(dir, { recursive: true });
    const prog = mod.createProgram({ io: mod.diskIO(dir), pin, say() {} });
    const doc1 = teamDoc(tm, rt, 1, 1, [rowOf(gone), rowOf(stay)]);
    const doc2 = teamDoc(tm, rt, 1, 2, [rowOf(stay)]);
    const loaded1 = prog.loadTeamFile(doc1);
    const before = prog.acceptBlob({ blob: seal(gone, gonePath, 1, "before"), teamDoc: doc1, teamKey: key });
    const loaded2 = prog.loadTeamFile(doc2);
    const prior = (((prog.state().trust || {})["1"] || {}).prior) || [];
    const priorHas = prior.some(d => d.keyId === gone.keyId);
    const saved = mod.stateOf(JSON.parse(JSON.stringify(prog.state())));
    const priorKept = ((((saved.trust || {})["1"] || {}).prior) || []).some(d => d.keyId === gone.keyId);
    const after = prog.acceptBlob({ blob: seal(gone, gonePath, 2, "after"), teamDoc: doc2, teamKey: key });
    const stray = prog.acceptBlob({ blob: seal(stranger, strayPath, 1, "stray"), teamDoc: doc2, teamKey: key });
    const kept = prog.acceptBlob({ blob: seal(stay, stayPath, 1, "kept"), teamDoc: doc2, teamKey: key });
    return { loaded1, loaded2, before, after, stray, kept, priorHas, priorKept,
      goneBody: read(dir, gonePath), stayBody: read(dir, stayPath), strayBody: read(dir, strayPath) };
  }
  const moved = sameEpoch(C);
  const movedHolds = moved.loaded1.ok === true && moved.loaded2.ok === true && moved.before.ok === true
    && moved.after.ok === false && moved.after.reason === "removed" && moved.after.said === B.REASONS.removed
    && moved.goneBody === "before" && moved.priorHas && moved.priorKept
    && moved.stray.ok === false && moved.stray.reason === "not-roster" && moved.strayBody === null
    && moved.kept.ok === true && moved.stayBody === "kept";
  check(movedHolds, "944v a later rev of the same epoch that leaves a desk off refuses its next file removed, the earlier file stays,"
    + " a key never named stays not-roster, and the prior roster survives a reload: after "
    + (moved.after.ok === true ? "ACCEPTED" : moved.after.reason) + ", body " + JSON.stringify(moved.goneBody)
    + ", prior " + (moved.priorHas ? "kept" : "missing") + " reloaded " + (moved.priorKept ? "kept" : "missing")
    + ", stranger " + (moved.stray.ok === true ? "ACCEPTED" : moved.stray.reason)
    + ", the other desk " + (moved.kept.ok === true ? "taken" : moved.kept.reason));

  function itemOf(b, seq) {
    return { seq, ct: b.ciphertext, meta: { v: 1, id: b.id, writer: b.writerKeyId, epoch: b.epoch, counter: b.counter,
      size: b.ciphertext.length, sig: b.signature, nonce: b.nonce, supersedes: b.supersedes, del: !!b.deletion } };
  }
  function parkArm(mod, arm) {
    const rt = hex(16), tm = "t-" + hex(8), desk = keyPair(true), other = keyPair(true);
    const pin = { teamId: tm, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
    const said = [];
    const prog = mod.createProgram({ io: memoryIo, pin, clock: () => 1700000000000, save() {}, say: l => said.push(l) });
    const l1 = prog.loadTeamFile(teamDoc(tm, rt, 1, 1, arm === "member" ? [rowOf(desk)] : [rowOf(desk), rowOf(other)]));
    const l2 = arm === "removed" ? prog.loadTeamFile(teamDoc(tm, rt, 2, 1, [rowOf(other)])) : { ok: true };
    const waitEpoch = arm === "removed" ? 3 : 2;
    const leadW = { keyId: LEAD.keyId, privateKey: LEAD.privateKey };
    const deskW = { keyId: desk.keyId, privateKey: desk.privateKey };
    const waiting = B.seal({ relayTeamId: rt, epoch: waitEpoch, teamKey: crypto.randomBytes(32), writer: leadW,
      path: "hold.ec", body: "wait", counter: 1, place: "root" });
    const near = B.seal({ relayTeamId: rt, epoch: waitEpoch, teamKey: crypto.randomBytes(32), writer: deskW,
      path: "desks/" + desk.keyId + "/in-use.ec", body: "near", counter: 1, place: "desk:" + desk.keyId });
    const junk = [];
    for (let i = 0; i < 1000; i++) {
      const b = B.seal({ relayTeamId: rt, epoch: 999999, teamKey: crypto.randomBytes(32), writer: deskW,
        path: "desks/" + desk.keyId + "/n" + i + ".ec", body: "x", counter: i + 1, place: "desk:" + desk.keyId });
      junk.push(itemOf(b, 10 + i));
    }
    const keys = new Map([[1, crypto.randomBytes(32)]]);
    if (arm === "removed") keys.set(2, crypto.randomBytes(32));
    prog.applyBatch([itemOf(waiting, 2), itemOf(near, 3)].concat(junk), { keyFor: e => keys.get(e) || null });
    const pending = prog.state().pending;
    return { loaded: l1.ok === true && l2.ok === true, pending: pending.length,
      junk: pending.filter(p => p.epoch === 999999).length, honest: pending.some(p => p.id === waiting.id),
      near: pending.some(p => p.id === near.id), leadEpoch: prog.state().leadEpoch, said: said.length };
  }
  const memberPark = parkArm(C, "member");
  const removedPark = parkArm(C, "removed");
  const parkLine = p => "pending " + p.pending + ", junk " + p.junk + ", honest " + p.honest + ", in-epoch " + p.near
    + ", leadEpoch " + p.leadEpoch + ", said " + p.said + (p.loaded ? "" : ", team file not loaded");
  check(memberPark.loaded && memberPark.pending === 2 && memberPark.junk === 0 && memberPark.honest && memberPark.near
    && memberPark.leadEpoch === 2 && memberPark.said === 1000,
    "951f board 910 member: a desk the newest roster still names may wait at the epoch a verified lead blob named, and a"
    + " thousand blobs past that epoch are dropped and said: " + parkLine(memberPark));
  check(removedPark.loaded && removedPark.pending === 1 && removedPark.junk === 0 && removedPark.honest && !removedPark.near
    && removedPark.leadEpoch === 3 && removedPark.said === 1001,
    "951g board 910 removed: a desk the newest roster leaves off does not wait at that epoch, and the same thousand do not"
    + " fill pending: " + parkLine(removedPark));

  function liftPlant(tag, fn) {
    const src = path.join(ROOT, "shell", "relay", "channel.cjs");
    const beforeBytes = fs.readFileSync(src);
    const digest = sha(beforeBytes);
    let turned = false, detail = "plant line absent";
    try {
      const lines = beforeBytes.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf(tag) >= 0);
      if (at >= 0) {
        lines.splice(at, 1);
        const lifted = loadPlantedChannel(lines.join("\n"));
        turned = fn(lifted);
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) {
      detail = e && e.message ? e.message : String(e);
    }
    return { turned, back: sha(fs.readFileSync(src)) === digest, detail };
  }
  const countPlant = liftPlant("plant:s2-count", mod => {
    const x = counted(mod);
    return x.loaded.ok === true && x.r.ok === true && x.r.deskId === x.other && x.r.keyId === x.signer;
  });
  check(countPlant.turned && countPlant.back, "944u lifting plant:s2-count counts the file under the place the blob carries, and the product file is never written: "
    + countPlant.detail + ", sha " + (countPlant.back ? "restored" : "differs"));
  const removePlant = liftPlant("plant:s2-remove", mod => {
    const x = sameEpoch(mod);
    return x.loaded1.ok === true && x.before.ok === true && x.after.ok === false && x.after.reason === "not-roster"
      && x.goneBody === "before" && x.stray.reason === "not-roster";
  });
  check(removePlant.turned && removePlant.back, "944w lifting plant:s2-remove leaves the dropped desk's file not-roster, and the product file is never written: "
    + removePlant.detail + ", sha " + (removePlant.back ? "restored" : "differs"));
  const parkPlant = liftPlant("plant:pending-roster", mod => {
    const x = parkArm(mod, "member");
    return x.loaded && x.pending === 1000 && x.junk === 1000 && x.honest === false;
  });
  check(parkPlant.turned && parkPlant.back, "951h lifting plant:pending-roster lets a thousand blobs past the lead's epoch fill pending and push the"
    + " honest wait out, and the product file is never written: " + parkPlant.detail + ", sha " + (parkPlant.back ? "restored" : "differs"));
}

/* ---- a withheld older epoch must not roll a file back (S1). A desk that holds both epochs' keys catches up the
   epoch-2 edition; the relay then serves the epoch-1 blob of that path it had held back. The mirror keeps the epoch-2
   bytes. Lifting the stale line writes the epoch-1 bytes over them. ---- */
async function liftChannel(tag, fn) {
  const src = path.join(ROOT, "shell", "relay", "channel.cjs");
  const beforeBytes = fs.readFileSync(src);
  const digest = sha(beforeBytes);
  let turned = false, detail = "plant line absent";
  try {
    const lines = beforeBytes.toString("utf8").split(/\n/);
    /* A tag, or a list of tags whose lines are lifted together (953c: the guards of one edit are three). */
    const at = (Array.isArray(tag) ? tag : [tag]).map(tg => lines.findIndex(l => l.indexOf(tg) >= 0));
    if (at.every(i => i >= 0)) {
      at.sort((x, y) => y - x).forEach(i => lines.splice(i, 1));
      const lifted = loadPlantedChannel(lines.join("\n"));
      turned = await fn(lifted);
      detail = turned ? "the check lifted" : "the check still held";
    }
  } catch (e) {
    detail = e && e.stack ? e.stack : String(e);
  }
  return { turned, back: sha(fs.readFileSync(src)) === digest, detail };
}
function relayStore(rt) { return R.stores.get(rt); }
function blobsOn(rt, writer) {
  return relayStore(rt).dump().map(([k, v]) => [k, JSON.parse(v)]).filter(([k, v]) => k.startsWith("blob:") && v.writer === writer).map(([, v]) => v);
}
async function freshTeam(keys) {
  const rt = hex(16), id = "t-" + hex(8);
  const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
  if (made.status !== 200) throw new Error("a team was not made: " + JSON.stringify(made.json));
  const list = keys.map(k => ({ id: k.keyId, pub: k.pub, desk: k.keyId })), t = R.clock.now;
  const enrolled = await admin("POST", "/relay/v1/t/" + rt + "/devices", { keys: list, rev: 1, t,
    sig: signHex(LEAD, core.devicesBytes(rt, 1, t, list)) });
  if (enrolled.status !== 200) throw new Error("a desk was not enrolled: " + JSON.stringify(enrolled.json));
  return { rt, id };
}
function teamBody(tm, epoch, rev, roster) {
  return JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: tm.id, catalogs: ["quay-board"],
    lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch, rev,
    channel: { kind: "relay", rt: tm.rt, url: URLV1 }, ring: RING, roster }, LEAD), null, 1) + "\n";
}
/* A program on a team of its own. `mod` is the channel layer, so a plant can pass the copy it lifted. */
function opened(mod, name, tm, who, place, o) {
  const x = o || {};
  const t = transport(name), said = [];
  const mirror = path.join(LAB, name);
  const ch = mod.createChannel(Object.assign({
    rt: tm.rt, url: URLV1, mirror, stateFile: path.join(LAB, name + ".json"),
    pin: () => ({ teamId: tm.id, rt: tm.rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
    me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place }),
    request: t.request, connect: t.connect, pollMs: 1e9, watch: false,
    say: l => said.push(l),
  }, x));
  return { name, ch, t, said, mirror, prog: ch.program };
}
/* The lead seals guide.ec at epoch 1, that blob is held back, the desk catches up the epoch-2 edition, and the held
   blob is then served. True where the mirror still reads the epoch-2 bytes. */
async function withheldEpoch(mod) {
  const k1 = crypto.randomBytes(32), k2 = crypto.randomBytes(32);
  const deskKey = keyPair(true);
  const tm = await freshTeam([deskKey]);
  const pinLead = { keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" };
  let sealAt = 1;
  const keys = new Map([[1, k1], [2, k2]]);
  const sent = [];
  const leadT = transport("s1-lead-" + tm.rt.slice(0, 8));
  const leadReq = async (m, u, h, b) => {
    if (m === "PUT" && h && h["etiuda-blob"]) sent.push({ meta: JSON.parse(Buffer.from(h["etiuda-blob"], "base64url").toString("utf8")), ct: Buffer.from(b) });
    return leadT.request(m, u, h, b);
  };
  const lead = opened(mod, "s1-lead-" + tm.rt.slice(0, 8), tm, LEAD, "root", {
    me: () => pinLead, keyFor: e => keys.get(e) || null, sealEpoch: () => sealAt, request: leadReq, connect: leadT.connect,
  });
  const OLD = "old-epoch-1\n", NEW = "new-epoch-2\n";
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(deskKey)]));
  put(lead.mirror, "guide.ec", OLD);
  lead.ch.start();
  await settle(lead);
  const guide = sent.filter(u => u.meta && u.meta.writer === LEAD.keyId).pop();
  const s = relayStore(tm.rt), rec = guide ? s.get("blob:" + guide.meta.id) : null;
  const held = rec ? Buffer.from(R.bucket.objects.get(rec.obj)) : null;
  if (rec) { s.del("blob:" + rec.id); s.del("seq:" + String(rec.seq).padStart(16, "0")); }
  sealAt = 2;
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 2, 1, [member(deskKey)]));
  put(lead.mirror, "guide.ec", NEW);
  await settle(lead);
  const desk = opened(mod, "s1-desk-" + tm.rt.slice(0, 8), tm, deskKey, "desk:" + deskKey.keyId, {
    keyFor: e => keys.get(e) || null, sealEpoch: () => 2,
  });
  desk.ch.start();
  await settle(desk);
  const caught = read(desk.mirror, "guide.ec") === NEW;
  if (rec && held) {
    const seq = (s.get("seq") || 0) + 1, obj = tm.rt + "/" + rec.id + "/" + hex(8);
    R.bucket.objects.set(obj, held);
    s.put("blob:" + rec.id, Object.assign({}, rec, { seq, obj }));
    s.put("seq:" + String(seq).padStart(16, "0"), rec.id);
    s.put("seq", seq);
  }
  await settle(desk);
  const kept = read(desk.mirror, "guide.ec");
  await lead.ch.stop();
  await desk.ch.stop();
  return { caught, kept, withheld: !!rec && !!held };
}
try {
  const up = await withheldEpoch(C);
  check(up.caught && up.withheld && up.kept === "new-epoch-2\n",
    "952a a desk holding both epochs' keys catches up an epoch-2 edition, and the relay then serves the withheld epoch-1 blob of the same path: the mirror keeps the epoch-2 bytes: "
    + (up.caught ? "caught up" : "epoch 2 missing") + ", withheld " + (up.withheld ? "served after" : "not held") + ", mirror " + JSON.stringify(up.kept));
  const planted = await liftChannel("plant:stale-epoch", async mod => {
    const x = await withheldEpoch(mod);
    return x.caught && x.withheld && x.kept === "old-epoch-1\n";
  });
  check(planted.turned && planted.back, "952b lifting plant:stale-epoch writes the withheld epoch-1 bytes over the epoch-2 edition, and the product file is never written: "
    + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the leg 952a): " + (e && e.stack ? e.stack : e));
}

/* ---- a desk's own copy lands its team file before the lead's other blobs of the batch open (C9, board 923). A desk
   offline across an epoch move comes back to one page holding its copy of the new team file and the lead's files sealed
   under the new key: the key its wrap gives opens them in the same pass, so each blob is fetched once. ---- */
async function copyOnce(mod) {
  const LBX = boxPair(), k1 = crypto.randomBytes(32), k2 = crypto.randomBytes(32);
  const D = { k: keyPair(true), box: boxPair() };
  const tm = await freshTeam([D.k]);
  const tag = tm.rt.slice(0, 8);
  const docAt = (epoch, rev, key) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: tm.id, catalogs: ["lane-board"],
    lead: { keyId: LEAD.keyId, public: LEAD.pub, box: LBX.pub }, sealed: true, exportsSealed: false, epoch, rev,
    channel: { kind: "relay", rt: tm.rt, url: URLV1 },
    roster: [{ desk: { id: D.k.keyId, key: D.k.pub, box: D.box.pub }, wrap: wrapFor(key, D.box.pub, tm.id, epoch, D.k.keyId) }] }, LEAD), null, 1) + "\n";
  const leadKeys = new Map([[1, k1]]);
  const lead = opened(mod, "c9-lead-" + tag, tm, LEAD, "root", { keyFor: e => leadKeys.get(e) || null,
    sealEpoch: () => Math.max(...leadKeys.keys()), agree: agreeWith(LBX) });
  put(lead.mirror, C.TEAM_NAME, docAt(1, 1, k1));
  put(lead.mirror, "lane.ec", "{\"note\":\"Lane Board edition one\"}\n");
  lead.ch.start();
  await settle(lead);
  const held = new Map([[1, k1]]), name = "c9-desk-" + tag;
  const deskNow = () => opened(mod, name, tm, D.k, "desk:" + D.k.keyId, {
    me: () => ({ keyId: D.k.keyId, public: D.k.pub, privateKey: D.k.privateKey, place: "desk:" + D.k.keyId, box: D.box.pub }),
    keyFor: e => held.get(e) || null, sealEpoch: () => Math.max(...held.keys()), agree: agreeWith(D.box),
    onTeam: () => {
      let doc = null;
      try { doc = JSON.parse(read(path.join(LAB, name), C.TEAM_NAME)); } catch { return; }
      const mine = doc && Array.isArray(doc.roster) ? doc.roster.find(r => r && r.desk && r.desk.id === D.k.keyId) : null;
      const k = mine ? unwrapWith(D.box, mine.wrap, tm.id, doc.epoch, D.k.keyId) : null;
      if (k) held.set(doc.epoch, k);
    } });
  const first = deskNow();
  first.ch.start();
  await settle(first);
  const atOne = JSON.parse(read(first.mirror, C.TEAM_NAME) || "{}").epoch === 1;
  await first.ch.stop();
  leadKeys.set(2, k2);
  put(lead.mirror, C.TEAM_NAME, docAt(2, 1, k2));
  put(lead.mirror, "lane.ec", "{\"note\":\"Lane Board edition two\"}\n");
  put(lead.mirror, "after.ec", "{\"note\":\"written after the move\"}\n");
  await settle(lead);
  const back = deskNow();
  back.ch.start();
  await settle(back);
  const gets = new Map();
  for (const l of back.t.log) if (/^GET b\/[0-9a-f]{32}$/.test(l)) gets.set(l, (gets.get(l) || 0) + 1);
  const out = { atOne, epoch: JSON.parse(read(back.mirror, C.TEAM_NAME) || "{}").epoch, key: !!held.get(2),
    lane: read(back.mirror, "lane.ec") === "{\"note\":\"Lane Board edition two\"}\n", after: read(back.mirror, "after.ec") !== null,
    fetched: gets.size, twice: [...gets.values()].filter(n => n > 1).length, pending: back.prog.state().pending.length };
  await back.ch.stop();
  await lead.ch.stop();
  return out;
}
try {
  const o = await copyOnce(C);
  check(o.atOne && o.epoch === 2 && o.key && o.lane && o.after && o.pending === 0 && o.fetched > 0 && o.twice === 0,
    "923g a desk back from an epoch move fetches its own copy of the new team file and the lead's files sealed under the new key once each, and opens them in that one pass: epoch "
    + o.epoch + ", key " + (o.key ? "held" : "absent") + ", the new edition " + (o.lane ? "loaded" : "missing") + ", after.ec " + (o.after ? "loaded" : "missing")
    + ", " + o.fetched + " blobs fetched, " + o.twice + " of them more than once, pending " + o.pending);
  const copyPlant = await liftChannel("plant:copy-first", async mod => {
    const x = await copyOnce(mod);
    return x.epoch === 2 && x.lane && x.after && x.twice > 0;
  });
  check(copyPlant.turned && copyPlant.back, "923h lifting plant:copy-first opens the lead's new-epoch files before the copy's team file lands, so each is fetched again, and the product file is never written: "
    + copyPlant.detail + ", sha " + (copyPlant.back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the leg 923g): " + (e && e.stack ? e.stack : e));
}

/* ---- an edit of this program's own file, one cycle (S2). The catch-up skips what this desk, or the lead, just sent,
   so the cycle that the edit starts does not write the older bytes back over it. Three cycles would hide the loss:
   the second would consume the program's own blob before the edit. The edit has three guards now: the record that shows
   the blob sent (plant:own-skip), the refusal of a blob not later than the last one sent (plant:own-older), and the edit
   kept where the mirror holds neither the blob's bytes nor the last sent (plant:own-edit); 953c lifts all three. ---- */
async function once(p) { p.ch.kick(); await p.ch.idle(); }
async function keptEdit(mod) {
  const k1 = crypto.randomBytes(32);
  const deskKey = keyPair(true);
  const tm = await freshTeam([deskKey]);
  const keys = new Map([[1, k1]]);
  const tag = tm.rt.slice(0, 8);
  let leadSent = 0, deskSent = 0;
  const leadT = transport("s2-lead-" + tag);
  const lead = opened(mod, "s2-lead-" + tag, tm, LEAD, "root", {
    keyFor: e => keys.get(e) || null, sealEpoch: () => 1,
    request: async (m, u, h, b) => { if (m === "PUT") leadSent++; return leadT.request(m, u, h, b); }, connect: leadT.connect,
  });
  const E1 = "e1\n", E2 = "e2\n", V1 = "v1\n", V2 = "v2\n";
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(deskKey)]));
  lead.ch.start();
  await lead.ch.idle();
  put(lead.mirror, "guide.ec", E1);
  await once(lead);
  put(lead.mirror, "guide.ec", E2);
  leadSent = 0;
  await once(lead);
  const leadOnEdit = leadSent;
  const deskT = transport("s2-desk-" + tag);
  const desk = opened(mod, "s2-desk-" + tag, tm, deskKey, "desk:" + deskKey.keyId, {
    keyFor: e => keys.get(e) || null, sealEpoch: () => 1,
    request: async (m, u, h, b) => { if (m === "PUT") deskSent++; return deskT.request(m, u, h, b); }, connect: deskT.connect,
  });
  desk.ch.start();
  await desk.ch.idle();
  const guideAtDesk = read(desk.mirror, "guide.ec");
  const rel = "desks/" + deskKey.keyId + "/in-use.ec";
  put(desk.mirror, rel, V1);
  await once(desk);
  put(desk.mirror, rel, V2);
  deskSent = 0;
  await once(desk);
  await once(lead);
  const out = { leadMirror: read(lead.mirror, "guide.ec"), guideAtDesk, deskOfLead: read(desk.mirror, "guide.ec"),
    leadSent: leadOnEdit, deskMirror: read(desk.mirror, rel), leadOfDesk: read(lead.mirror, rel), deskSent };
  await lead.ch.stop();
  await desk.ch.stop();
  return out;
}
try {
  const edit = await keptEdit(C);
  check(edit.deskMirror === "v2\n" && edit.leadOfDesk === "v2\n" && edit.deskSent === 1,
    "953a a desk's own file is sent, edited, and one cycle run: the edit is kept and sent: mirror " + JSON.stringify(edit.deskMirror)
    + ", at the lead " + JSON.stringify(edit.leadOfDesk) + ", uploads on that cycle " + edit.deskSent);
  check(edit.leadMirror === "e2\n" && edit.deskOfLead === "e2\n" && edit.guideAtDesk === "e2\n" && edit.leadSent === 1,
    "953b the lead's edition is sent, edited, and one cycle run: the edit is kept and sent: mirror " + JSON.stringify(edit.leadMirror)
    + ", at the desk " + JSON.stringify(edit.deskOfLead) + ", uploads on that cycle " + edit.leadSent);
  const planted = await liftChannel(["plant:own-skip", "plant:own-older", "plant:own-edit"], async mod => {
    const x = await keptEdit(mod);
    return x.deskMirror === "v1\n" && x.leadOfDesk === "v1\n" && x.deskSent === 0
      && x.leadMirror === "e1\n" && x.deskOfLead === "e1\n" && x.leadSent === 0;
  });
  check(planted.turned && planted.back, "953c lifting plant:own-skip, plant:own-older and plant:own-edit together writes the sent copy over the edit, on the desk and on the lead, and the product file is never written: "
    + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the leg 953a): " + (e && e.stack ? e.stack : e));
}

/* ---- a catch-up skips a blob as this computer's own only when this computer's own record shows it wrote that id, never
   because the writer is this key (board 932 (2), engine half). A lead restored to a fresh profile has no record, so it
   fetches its team file and its other files back; one key on two computers has two records, so each fetches the other's
   uploads. An own blob fetched this way is judged and applied as anyone's is: one not later than what this computer last
   sent for that path is refused as older and changes nothing, and one that would overwrite an edit still waiting to go up
   leaves the edit where it is and becomes the blob that edit replaces. ---- */
const OWN_G1 = "guide one, written before the profile was lost\n", OWN_G2 = "guide two, an edit made on the new profile\n";
const OWN_N1 = "notes, kept beside the guide\n";
async function ownSetup(mod) {
  const deskKey = keyPair(true), keys = new Map([[1, crypto.randomBytes(32)]]);
  const tm = await freshTeam([deskKey]);
  const tag = tm.rt.slice(0, 8);
  const mk = (name, place) => opened(mod, name + "-" + tag, tm, LEAD, place || "root", { keyFor: e => keys.get(e) || null, sealEpoch: () => 1 });
  return { tm, mk, teamText: teamBody(tm, 1, 1, [member(deskKey)]) };
}
const putsOf = p => p.t.log.filter(l => /^PUT b\//.test(l)).length;
const liveBy = (tm, writer) => blobsOn(tm.rt, writer).filter(v => !v.del).length;
/* The lead uploads its team file, a guide and a note, and its profile is lost: a new profile of the same key, an empty
   mirror and an empty record, catches up. */
async function ownRestore(mod) {
  const { tm, mk, teamText } = await ownSetup(mod);
  const first = mk("own-r1");
  put(first.mirror, C.TEAM_NAME, teamText);
  put(first.mirror, "guide.ec", OWN_G1);
  put(first.mirror, "notes.ec", OWN_N1);
  first.ch.start();
  await first.ch.idle();
  await once(first);
  const uploaded = liveBy(tm, LEAD.keyId);
  await first.ch.stop();
  const again = mk("own-r2");
  again.ch.start();
  await again.ch.idle();
  await once(again);
  const back = { team: read(again.mirror, C.TEAM_NAME) === teamText, guide: read(again.mirror, "guide.ec") === OWN_G1,
    notes: read(again.mirror, "notes.ec") === OWN_N1 };
  const putsAtRestore = putsOf(again);
  put(again.mirror, "guide.ec", OWN_G2);
  await once(again);
  const chain = liveBy(tm, LEAD.keyId);
  await again.ch.stop();
  return { uploaded, back, restored: back.team && back.guide && back.notes, putsAtRestore, chain, said: again.said };
}
/* One key on two computers, each with a mirror and a record of its own. */
async function ownTwo(mod) {
  const { tm, mk, teamText } = await ownSetup(mod);
  const a = mk("own-t1"), b = mk("own-t2");
  put(a.mirror, C.TEAM_NAME, teamText);
  put(a.mirror, "guide.ec", OWN_G1);
  a.ch.start(); b.ch.start();
  await a.ch.idle(); await b.ch.idle();
  await once(a);
  await once(b);
  const second = { guide: read(b.mirror, "guide.ec"), team: read(b.mirror, C.TEAM_NAME) };
  put(a.mirror, "guide.ec", OWN_G2);
  await once(a);
  await once(b);
  const edited = read(b.mirror, "guide.ec");
  put(b.mirror, "guide.ec", "guide three, from the second computer\n");
  put(b.mirror, "second.ec", "a file only the second computer wrote\n");
  await once(b);
  await once(a);
  const out = { first: second.guide === OWN_G1 && second.team === teamText, edited: edited === OWN_G2,
    back: read(a.mirror, "guide.ec") === "guide three, from the second computer\n"
      && read(a.mirror, "second.ec") === "a file only the second computer wrote\n",
    chain: liveBy(tm, LEAD.keyId), said: a.said.concat(b.said) };
  out.crossed = out.first && out.edited && out.back;
  await a.ch.stop(); await b.ch.stop();
  return out;
}
/* A program's own upload, in its record, is not fetched again. */
async function ownRecorded(mod) {
  const { mk, teamText } = await ownSetup(mod);
  const lead = mk("own-s1");
  put(lead.mirror, C.TEAM_NAME, teamText);
  put(lead.mirror, "guide.ec", OWN_G1);
  lead.ch.start();
  await lead.ch.idle();
  await once(lead);
  const since = lead.t.log.length;
  await once(lead);
  const after = lead.t.log.slice(since);
  await lead.ch.stop();
  return { listed: after.some(l => /^GET since\//.test(l)), fetched: after.filter(l => /^GET b\//.test(l)).length,
    puts: after.filter(l => /^PUT b\//.test(l)).length, guide: read(lead.mirror, "guide.ec") };
}
/* A restored profile whose mirror already holds a newer edit of the guide: the edit stays, goes up, and replaces the blob
   it was not told of. A third profile then reads the edit from the relay. */
async function ownKeptRestore(mod) {
  const { tm, mk, teamText } = await ownSetup(mod);
  const first = mk("own-k1");
  put(first.mirror, C.TEAM_NAME, teamText);
  put(first.mirror, "guide.ec", OWN_G1);
  first.ch.start();
  await first.ch.idle();
  await once(first);
  await first.ch.stop();
  const again = mk("own-k2");
  put(again.mirror, "guide.ec", OWN_G2);
  again.ch.start();
  await again.ch.idle();
  await once(again);
  await once(again);
  const mirror = read(again.mirror, "guide.ec"), team = read(again.mirror, C.TEAM_NAME) === teamText, puts = putsOf(again);
  const chain = liveBy(tm, LEAD.keyId);
  await again.ch.stop();
  const third = mk("own-k3");
  third.ch.start();
  await third.ch.idle();
  await once(third);
  const relayHolds = read(third.mirror, "guide.ec");
  await third.ch.stop();
  return { mirror, team, puts, chain, relayHolds };
}
/* One key on two computers: the second's upload arrives while the first holds an edit not yet sent. */
async function ownKeptTwo(mod) {
  const { tm, mk, teamText } = await ownSetup(mod);
  const a = mk("own-w1"), b = mk("own-w2");
  put(a.mirror, C.TEAM_NAME, teamText);
  put(a.mirror, "guide.ec", OWN_G1);
  a.ch.start(); b.ch.start();
  await a.ch.idle(); await b.ch.idle();
  await once(a);
  await once(b);
  const fromB = "the second computer's guide\n", fromA = "the first computer's edit, not yet sent\n";
  put(b.mirror, "guide.ec", fromB);
  await once(b);
  put(a.mirror, "guide.ec", fromA);
  await once(a);
  const keptA = read(a.mirror, "guide.ec");
  await once(b);
  const out = { keptA, atB: read(b.mirror, "guide.ec"), chain: liveBy(tm, LEAD.keyId), fromA };
  await a.ch.stop(); await b.ch.stop();
  return out;
}
/* An own blob older than the one this program last sent for its path, put back by a relay that kept it: fetched, judged as
   anyone's is, refused as older, and nothing is changed. */
async function ownOlder(mod) {
  const { tm, mk, teamText } = await ownSetup(mod);
  const lead = mk("own-o1");
  put(lead.mirror, C.TEAM_NAME, teamText);
  put(lead.mirror, "guide.ec", OWN_G1);
  lead.ch.start();
  await lead.ch.idle();
  await once(lead);
  const s = relayStore(tm.rt);
  const id1 = lead.prog.state().sent["guide.ec"].id, rec1 = s.get("blob:" + id1), ct1 = Buffer.from(R.bucket.objects.get(rec1.obj));
  put(lead.mirror, "guide.ec", OWN_G2);
  await once(lead);
  const seq = (s.get("seq") || 0) + 1, obj = tm.rt + "/" + id1 + "/" + hex(8);
  R.bucket.objects.set(obj, ct1);
  s.put("blob:" + id1, Object.assign({}, rec1, { seq, obj }));
  s.put("seq:" + String(seq).padStart(16, "0"), id1);
  s.put("seq", seq);
  const st = lead.prog.state(), mark = () => JSON.stringify({ sent: st.sent, applied: st.applied, counters: st.counters, bytes: st.bytes });
  const before = mark(), at = lead.t.log.length;
  await once(lead);
  const fetched = lead.t.log.slice(at).some(l => l === "GET b/" + id1);
  const out = { fetched, mirror: read(lead.mirror, "guide.ec"), unchanged: mark() === before, puts: lead.t.log.slice(at).filter(l => /^PUT b\//.test(l)).length };
  await lead.ch.stop();
  return out;
}
try {
  const r = await ownRestore(C);
  check(r.uploaded === 3 && r.restored && r.putsAtRestore === 0 && r.chain === 3,
    "970a a lead restored to a fresh profile (the same key, an empty record, an empty mirror) catches up its own team file and its other files, sends nothing for them, and its next edit replaces the blob it caught up instead of forking the chain: uploaded " + r.uploaded
    + ", team " + r.back.team + ", guide " + r.back.guide + ", notes " + r.back.notes + ", uploads at the restore " + r.putsAtRestore + ", live blobs after the edit " + r.chain);
  const t = await ownTwo(C);
  check(t.crossed && t.chain === 3,
    "970b two programs holding one key each apply the other's upload, in both directions and again after an edit, and the relay keeps one blob for each of the three files: first " + t.first
    + ", edit " + t.edited + ", back " + t.back + ", live blobs " + t.chain);
  const k = await ownRecorded(C);
  check(k.listed && k.fetched === 0 && k.puts === 0 && k.guide === OWN_G1,
    "970c a program's own upload, in its record, is listed on the next catch-up and not fetched, and nothing is sent or changed: listed " + k.listed + ", fetched " + k.fetched + ", uploads " + k.puts);
  const e = await ownKeptRestore(C);
  check(e.mirror === OWN_G2 && e.team && e.puts === 1 && e.chain === 2 && e.relayHolds === OWN_G2,
    "970d an own blob fetched on a restored profile does not overwrite a newer edit already in its mirror: the edit stays, goes up once as the replacement of that blob, and a third profile reads it from the relay: mirror "
    + JSON.stringify(e.mirror) + ", uploads " + e.puts + ", live blobs " + e.chain + ", the relay holds " + JSON.stringify(e.relayHolds));
  const w = await ownKeptTwo(C);
  check(w.keptA === w.fromA && w.atB === w.fromA && w.chain === 2,
    "970e the second computer's upload does not overwrite the first's edit still waiting to go up: the edit stays, replaces that upload, and reaches the second computer: first " + JSON.stringify(w.keptA)
    + ", second " + JSON.stringify(w.atB) + ", live blobs " + w.chain);
  const o = await ownOlder(C);
  check(o.fetched && o.mirror === OWN_G2 && o.unchanged && o.puts === 0,
    "970f an own blob older than the one last sent for its path, put back by the relay, is fetched, refused as older and changes nothing: fetched " + o.fetched + ", mirror "
    + JSON.stringify(o.mirror) + ", record and floors " + (o.unchanged ? "unchanged" : "changed") + ", uploads " + o.puts);
  const recordPlant = await liftChannel("plant:own-record", async mod => {
    const x = await ownRestore(mod), y = await ownTwo(mod);
    return !x.restored && !y.crossed;
  });
  check(recordPlant.turned && recordPlant.back, "970g lifting plant:own-record skips every blob this key wrote, so the restored profile catches up nothing and the two computers never meet, and the product file is never written: "
    + recordPlant.detail + ", sha " + (recordPlant.back ? "restored" : "differs"));
  const olderPlant = await liftChannel("plant:own-older", async mod => (await ownOlder(mod)).mirror === OWN_G1);
  check(olderPlant.turned && olderPlant.back, "970h lifting plant:own-older writes the older own blob over the newer guide, and the product file is never written: "
    + olderPlant.detail + ", sha " + (olderPlant.back ? "restored" : "differs"));
  const editPlant = await liftChannel("plant:own-edit", async mod => {
    const x = await ownKeptRestore(mod), y = await ownKeptTwo(mod);
    return x.mirror !== OWN_G2 && y.keptA !== y.fromA;
  });
  check(editPlant.turned && editPlant.back, "970i lifting plant:own-edit writes the fetched own blob over the edit waiting to go up, on the restored profile and on the first computer, and the product file is never written: "
    + editPlant.detail + ", sha " + (editPlant.back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the legs 970a): " + (e && e.stack ? e.stack : e));
}

/* ---- a page whose fetch fails part way is applied only where it can be judged whole (C3, board 923). The lead names a
   second desk at rev 2, that desk sends a file, and the lead writes rev 3, which buries rev 2: the first desk, offline
   meanwhile, is listed the second desk's file and then rev 3, whose fetch the relay answers 503 once. The desk file is
   not judged against rev 1, which does not name its writer, and lands at the next cycle. ---- */
async function pageWhole(mod) {
  const key = crypto.randomBytes(32), D1 = keyPair(true), D2 = keyPair(true);
  const tm = await freshTeam([D1, D2]);
  const tag = tm.rt.slice(0, 8), keyFor = e => (e === 1 ? key : null);
  const lead = opened(mod, "c3-lead-" + tag, tm, LEAD, "root", { keyFor, sealEpoch: () => 1 });
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(D1)]));
  lead.ch.start();
  await settle(lead);
  let failId = null, failed = 0;
  const t1 = transport("c3-d1-" + tag);
  const request = async (m, u, h, b) => {
    if (m === "GET" && failId && failed === 0 && String(u).endsWith("/b/" + failId)) {
      failed++;
      return { status: 503, header: () => null, bytes: Buffer.from(JSON.stringify({ error: "fault" })) };
    }
    return t1.request(m, u, h, b);
  };
  const deskOne = () => opened(mod, "c3-d1-" + tag, tm, D1, "desk:" + D1.keyId, { keyFor, sealEpoch: () => 1, request, connect: t1.connect });
  const first = deskOne();
  first.ch.start();
  await settle(first);
  const atRev1 = JSON.parse(read(first.mirror, C.TEAM_NAME) || "{}").rev === 1;
  await first.ch.stop();
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 2, [member(D1), member(D2)]));
  await settle(lead);
  const REL = "desks/" + D2.keyId + "/stats.estat", BODY = "{\"counted\":2}\n";
  const d2 = opened(mod, "c3-d2-" + tag, tm, D2, "desk:" + D2.keyId, { keyFor, sealEpoch: () => 1 });
  put(d2.mirror, REL, BODY);
  d2.ch.start();
  await settle(d2);
  await d2.ch.stop();
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 3, [member(D1), member(D2)]));
  await settle(lead);
  const live = blobsOn(tm.rt, LEAD.keyId).filter(v => !v.del && !v.gone).sort((a, b) => b.seq - a.seq);
  const deskBlob = blobsOn(tm.rt, D2.keyId).filter(v => !v.del).sort((a, b) => b.seq - a.seq)[0];
  failId = live.length ? live[0].id : null;
  const listedBefore = !!deskBlob && !!live.length && deskBlob.seq < live[0].seq;
  const back = deskOne();
  back.ch.start();
  await settle(back);
  const out = { atRev1, listedBefore, failed, rev: JSON.parse(read(back.mirror, C.TEAM_NAME) || "{}").rev, landed: read(back.mirror, REL) === BODY,
    fetchedDesk: deskBlob ? t1.log.filter(l => l === "GET b/" + deskBlob.id).length : 0 };
  await back.ch.stop();
  await lead.ch.stop();
  return out;
}
try {
  const w = await pageWhole(C);
  check(w.atRev1 && w.listedBefore && w.failed === 1 && w.rev === 3 && w.landed,
    "923a a desk file listed before the lead's newer team file, whose fetch the relay answers 503 once, is not judged against the older roster that does not name its writer, and lands at the next cycle: "
    + (w.listedBefore ? "listed before rev 3" : "not listed before rev 3") + ", 503 answered " + w.failed + ", the mirror's rev " + w.rev
    + ", the desk file " + (w.landed ? "landed" : "missing") + " after " + w.fetchedDesk + " fetch(es)");
  const wholePlant = await liftChannel("plant:page-whole", async mod => {
    const x = await pageWhole(mod);
    return x.listedBefore && x.failed === 1 && x.rev === 3 && !x.landed;
  });
  check(wholePlant.turned && wholePlant.back, "923b lifting plant:page-whole judges the desk file against the older roster and loses it, and the product file is never written: "
    + wholePlant.detail + ", sha " + (wholePlant.back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the legs 923a): " + (e && e.stack ? e.stack : e));
}

/* ---- a joining desk that also owes another file. Only join.json may be sealed under the invitation, so the other
   file cannot spend that one upload. in-use.ec is listed before join.json. ---- */
async function joinFirst(mod) {
  const k1 = crypto.randomBytes(32);
  const deskKey = keyPair(true);
  const tm = await freshTeam([]);
  const secret = hex(16), inv = hex(16), token = hex(32), ki = C.inviteSealKey(secret);
  const at = R.clock.now;
  const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }];
  const made = await admin("POST", "/relay/v1/t/" + tm.rt + "/invites", { add, drop: [], t: at,
    sig: signHex(LEAD, core.invitesBytes(tm.rt, at, add, [])) });
  if (made.status !== 200) throw new Error("an invitation was not made: " + JSON.stringify(made.json));
  const tag = tm.rt.slice(0, 8);
  const lead = opened(mod, "s3-lead-" + tag, tm, LEAD, "root", {
    keyFor: e => (e === 1 ? k1 : null), sealEpoch: () => 1, inviteKeys: () => [{ id: inv, key: ki }],
  });
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, []));
  lead.ch.start();
  await lead.ch.idle();
  const desk = opened(mod, "s3-desk-" + tag, tm, deskKey, "desk:" + deskKey.keyId, {
    keyFor: () => null, sealEpoch: () => null, invite: () => ({ inv, token, seal: ki }),
  });
  const relJoin = "desks/" + deskKey.keyId + "/join.json";
  const relUse = "desks/" + deskKey.keyId + "/in-use.ec";
  const JOIN = "{\"kind\":\"etiuda-join\",\"note\":\"asking\"}\n";
  const USE = "{\"inUse\":\"a file owed beside the request\"}\n";
  put(desk.mirror, relUse, USE);
  put(desk.mirror, relJoin, JOIN);
  desk.ch.start();
  await desk.ch.idle();
  await once(lead);
  const uploads = relayStore(tm.rt).dump().map(([k, v]) => [k, JSON.parse(v)])
    .filter(([k, v]) => k.startsWith("blob:") && v.writer === deskKey.keyId).length;
  const rec = relayStore(tm.rt).get("inv:" + inv) || {};
  const out = { joinAtLead: read(lead.mirror, relJoin), useAtLead: read(lead.mirror, relUse), uploads,
    uploaded: rec.uploaded === true, invited: desk.prog.state().invited === true, join: JOIN };
  await lead.ch.stop();
  await desk.ch.stop();
  return out;
}
try {
  const joined = await joinFirst(C);
  check(joined.joinAtLead === joined.join && joined.useAtLead === null && joined.uploads === 1 && joined.uploaded && joined.invited,
    "954a a joining desk owing another file in its place still sends join.json as its invitation's one upload: the request "
    + (joined.joinAtLead === joined.join ? "at the lead" : "not at the lead") + ", the other file "
    + (joined.useAtLead === null ? "not taken" : "taken") + ", uploads " + joined.uploads
    + ", the invitation " + (joined.uploaded ? "uploaded" : "not uploaded"));
  const planted = await liftChannel("plant:invite-join", async mod => {
    const x = await joinFirst(mod);
    return x.joinAtLead === null && x.useAtLead === null && x.uploads === 1 && x.uploaded;
  });
  check(planted.turned && planted.back, "954b lifting plant:invite-join lets the other file spend the invitation's one upload, and the product file is never written: "
    + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the leg 954a): " + (e && e.stack ? e.stack : e));
}

/* ---- a token hello the relay answers 500. The token stays unused, so the next cycle sends it and the request goes.
   The answer is a status, not a throw, so the cycle does not retry by itself. ---- */
async function tokenKept(mod) {
  const k1 = crypto.randomBytes(32);
  const deskKey = keyPair(true);
  const tm = await freshTeam([]);
  const secret = hex(16), inv = hex(16), token = hex(32), ki = C.inviteSealKey(secret);
  const at = R.clock.now;
  const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }];
  const made = await admin("POST", "/relay/v1/t/" + tm.rt + "/invites", { add, drop: [], t: at,
    sig: signHex(LEAD, core.invitesBytes(tm.rt, at, add, [])) });
  if (made.status !== 200) throw new Error("an invitation was not made: " + JSON.stringify(made.json));
  const tag = tm.rt.slice(0, 8);
  const lead = opened(mod, "s4-lead-" + tag, tm, LEAD, "root", {
    keyFor: e => (e === 1 ? k1 : null), sealEpoch: () => 1, inviteKeys: () => [{ id: inv, key: ki }],
  });
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, []));
  lead.ch.start();
  await lead.ch.idle();
  const deskT = transport("s4-desk-" + tag);
  let tokenPosts = 0;
  const desk = opened(mod, "s4-desk-" + tag, tm, deskKey, "desk:" + deskKey.keyId, {
    keyFor: () => null, sealEpoch: () => null, invite: () => ({ inv, token, seal: ki }),
    connect: deskT.connect,
    request: async (m, u, h, b) => {
      if (m === "POST" && /\/session$/.test(String(u))) {
        let body = null;
        try { body = JSON.parse(Buffer.from(b || "").toString("utf8")); } catch { body = null; }
        if (body && body.invite !== undefined) {
          tokenPosts++;
          if (tokenPosts === 1) return { status: 500, header: () => null, bytes: Buffer.from("down") };
        }
      }
      return deskT.request(m, u, h, b);
    },
  });
  const relJoin = "desks/" + deskKey.keyId + "/join.json";
  const JOIN = "{\"kind\":\"etiuda-join\",\"note\":\"after a refused hello\"}\n";
  put(desk.mirror, relJoin, JOIN);
  desk.ch.start();
  await desk.ch.idle();
  const afterFirst = { used: desk.prog.state().tokenUsed === true, posts: tokenPosts, join: read(lead.mirror, relJoin) };
  await once(desk);
  await once(lead);
  const uploads = relayStore(tm.rt).dump().map(([k, v]) => [k, JSON.parse(v)])
    .filter(([k, v]) => k.startsWith("blob:") && v.writer === deskKey.keyId).length;
  const out = { afterFirst, posts: tokenPosts, joinAtLead: read(lead.mirror, relJoin), uploads,
    used: desk.prog.state().tokenUsed === true, join: JOIN };
  await lead.ch.stop();
  await desk.ch.stop();
  return out;
}
try {
  const kept = await tokenKept(C);
  check(!kept.afterFirst.used && kept.afterFirst.posts === 1 && kept.afterFirst.join === null
    && kept.posts === 2 && kept.joinAtLead === kept.join && kept.uploads === 1 && kept.used,
    "955a a first token hello answered 500 leaves the token unused, and the next try sends it: after the 500, token "
    + (kept.afterFirst.used ? "used" : "unused") + ", hellos " + kept.afterFirst.posts + "; on the next try, hellos " + kept.posts
    + ", the request " + (kept.joinAtLead === kept.join ? "at the lead" : "not at the lead") + ", uploads " + kept.uploads);
  const planted = await liftChannel("plant:token-kept", async mod => {
    const x = await tokenKept(mod);
    return x.afterFirst.used && x.afterFirst.posts === 1 && x.posts === 1 && x.joinAtLead === null && x.uploads === 0;
  });
  check(planted.turned && planted.back, "955b lifting plant:token-kept marks the token used on the 500, so the next try never sends it, and the product file is never written: "
    + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the leg 955a): " + (e && e.stack ? e.stack : e));
}

/* ---- an older epoch's team file is a replay (F5): never loaded, and never written over a newer file the mirror
   already holds, even where this program has no applied record for it. A lower rev at the same epoch, and a newer
   epoch, stay as they are. Judging a blob under an older epoch's own floor stays as it is. ---- */
try {
  const K2 = crypto.randomBytes(32);
  const roster = [member(DESK)];
  const doc = (epoch, rev) => JSON.parse(teamText(rev, roster, { epoch }));
  const writer = { keyId: LEAD.keyId, privateKey: LEAD.privateKey };
  const teamBlob = (text, epoch, counter, key) => B.seal({ relayTeamId: RT, epoch, teamKey: key, writer,
    path: C.TEAM_NAME, body: text, counter, place: "root" });
  const item = (blob, seq) => ({ seq, ct: blob.ciphertext, meta: { v: 1, id: blob.id, writer: blob.writerKeyId,
    epoch: blob.epoch, counter: blob.counter, size: blob.ciphertext.length, sig: blob.signature, nonce: blob.nonce,
    supersedes: blob.supersedes, del: !!blob.deletion } });
  const ctx = { keyFor: e => (e === 2 ? K2 : e === 1 ? K1 : null) };
  const quiet = { read() { return null; }, write() {}, remove() {}, list() { return []; } };
  const clock = () => 1700000000000;

  const bare = C.createProgram({ io: quiet, pin: PIN, clock, save() {} });
  const loaded1 = bare.loadTeamFile(doc(1, 1));
  const loaded2 = bare.loadTeamFile(doc(2, 1));
  const back = bare.loadTeamFile(doc(1, 2));
  const same = bare.loadTeamFile(doc(2, 1));
  check(loaded1.ok === true && loaded2.ok === true && back.reason === "replay-rev",
    "956c a team file of an older epoch is replay-rev on load: "
    + [loaded1.ok, loaded2.ok, back.reason || back.ok].join(" "));
  check(same.reason === "replay-rev",
    "956d a lower or equal rev at the same epoch is still replay-rev: " + (same.reason || same.ok));

  const root = path.join(LAB, "f5-hold-" + hex(4));
  fs.mkdirSync(root, { recursive: true });
  const said = [];
  const mirror = C.diskIO(root, C.writeWhole);
  const held = C.createProgram({ io: mirror, pin: PIN, clock, save() {}, say: l => said.push(l) });
  const text2 = teamText(1, roster, { epoch: 2 });
  mirror.write(C.TEAM_NAME, text2);
  const rolled = held.applyBatch([item(teamBlob(teamText(2, roster, { epoch: 1 }), 1, 1, K1), 1)], ctx);
  let nowEpoch = null;
  try { nowEpoch = JSON.parse(fs.readFileSync(path.join(root, C.TEAM_NAME), "utf8")).epoch; } catch { nowEpoch = null; }
  const saidReplay = said.some(l => l.indexOf(B.REASONS["replay-rev"]) >= 0);
  check(nowEpoch === 2 && rolled.applied.length === 0 && saidReplay,
    "956a a team file already on disk at epoch 2, with no applied record, stays epoch 2 and the older blob is said as a replay: now "
    + nowEpoch + ", applied " + JSON.stringify(rolled.applied) + ", said " + saidReplay);

  const root2 = path.join(LAB, "f5-applied-" + hex(4));
  fs.mkdirSync(root2, { recursive: true });
  const set = C.createProgram({ io: C.diskIO(root2, C.writeWhole), pin: PIN, clock, save() {} });
  const landed = set.applyBatch([item(teamBlob(text2, 2, 5, K2), 1)], ctx);
  const again = set.applyBatch([item(teamBlob(teamText(2, roster, { epoch: 1 }), 1, 1, K1), 2)], ctx);
  const stayed = JSON.parse(fs.readFileSync(path.join(root2, C.TEAM_NAME), "utf8")).epoch;
  check(landed.applied.indexOf(C.TEAM_NAME) >= 0 && stayed === 2 && again.applied.length === 0,
    "956b once the channel applied epoch 2, the older blob does not replace it: stayed epoch " + stayed
    + ", first applied " + JSON.stringify(landed.applied) + ", again " + JSON.stringify(again.applied));
} catch (e) {
  check(false, "harness (the legs 956a to 956d): " + (e && e.stack ? e.stack : e));
}

/* plant:epoch-hold. Deleting that line, leaving the file valid script, writes an older epoch over the newer file on disk. */
{
  const src = path.join(ROOT, "shell", "relay", "channel.cjs");
  const before = fs.readFileSync(src);
  const digest = sha(before);
  let turned = false, detail = "plant line absent";
  try {
    const lines = before.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf("plant:epoch-hold") >= 0);
    if (at >= 0) {
      lines.splice(at, 1);
      const lifted = loadPlantedChannel(lines.join("\n"));
      const root = path.join(LAB, "f5-plant-" + hex(4));
      fs.mkdirSync(root, { recursive: true });
      const mirror = lifted.diskIO(root, lifted.writeWhole);
      const prog = lifted.createProgram({ io: mirror, pin: PIN, clock: () => 1700000000000, save() {} });
      const roster = [member(DESK)];
      const text2 = teamText(1, roster, { epoch: 2 });
      const older = teamText(2, roster, { epoch: 1 });
      mirror.write(lifted.TEAM_NAME, text2);
      const writer = { keyId: LEAD.keyId, privateKey: LEAD.privateKey };
      const blob = B.seal({ relayTeamId: RT, epoch: 1, teamKey: K1, writer,
        path: lifted.TEAM_NAME, body: older, counter: 1, place: "root" });
      const one = { seq: 1, ct: blob.ciphertext, meta: { v: 1, id: blob.id, writer: blob.writerKeyId,
        epoch: blob.epoch, counter: blob.counter, size: blob.ciphertext.length, sig: blob.signature, nonce: blob.nonce,
        supersedes: blob.supersedes, del: !!blob.deletion } };
      const ctx = { keyFor: e => (e === 1 ? K1 : null) };
      prog.applyBatch([one], ctx);
      let now = null;
      try { now = JSON.parse(fs.readFileSync(path.join(root, lifted.TEAM_NAME), "utf8")).epoch; } catch { now = null; }
      turned = now === 1;
      detail = "disk epoch " + now;
    }
  } catch (e) {
    detail = e && e.message ? e.message : String(e);
  }
  const back = sha(fs.readFileSync(src)) === digest;
  check(turned && back, "956e lifting plant:epoch-hold writes the older epoch over the newer file, and the product file is never written: "
    + detail + ", sha " + (back ? "restored" : "differs"));
}

/* ---- a path that differs only in case is one file (F3). The same path in the same case is already stale. Pending
   carries no path, so a pending row is not a fourth map of paths. ---- */
try {
  const root = path.join(LAB, "f3-case-" + hex(4));
  fs.mkdirSync(root, { recursive: true });
  const prog = C.createProgram({ io: C.diskIO(root, C.writeWhole), pin: PIN, clock: () => 1700000000000, save() {} });
  const writer = { keyId: LEAD.keyId, privateKey: LEAD.privateKey };
  const K2 = crypto.randomBytes(32);
  const ctx = { keyFor: e => (e === 2 ? K2 : e === 1 ? K1 : null) };
  const seal = (p, body, epoch, counter, key) => B.seal({ relayTeamId: RT, epoch, teamKey: key, writer,
    path: p, body, counter, place: "root" });
  const item = (blob, seq) => ({ seq, ct: blob.ciphertext, meta: { v: 1, id: blob.id, writer: blob.writerKeyId,
    epoch: blob.epoch, counter: blob.counter, size: blob.ciphertext.length, sig: blob.signature, nonce: blob.nonce,
    supersedes: blob.supersedes, del: !!blob.deletion } });
  const first = prog.applyBatch([item(seal("guide.ec", "v2", 2, 10, K2), 1)], ctx);
  const same = prog.applyBatch([item(seal("guide.ec", "v1", 1, 1, K1), 2)], ctx);
  const afterSame = fs.readFileSync(path.join(root, "guide.ec"), "utf8");
  check(afterSame === "v2" && same.applied.length === 0 && first.applied.indexOf("guide.ec") >= 0,
    "957a the same path in the same case stays stale: disk " + JSON.stringify(afterSame) + ", applied " + same.applied.length);
  const crossed = prog.applyBatch([item(seal("Guide.ec", "v1", 1, 1, K1), 3)], ctx);
  let diskName = null, diskBody = null;
  for (const n of fs.readdirSync(root)) {
    if (n.toLowerCase() === "guide.ec") { diskName = n; diskBody = fs.readFileSync(path.join(root, n), "utf8"); }
  }
  check(diskBody === "v2" && diskName === "guide.ec" && crossed.applied.length === 0,
    "957b an older blob under another case does not replace the newer file: name " + JSON.stringify(diskName)
    + " body " + JSON.stringify(diskBody) + ", applied " + JSON.stringify(crossed.applied));

  const sentId = hex(16), inv = hex(16), pend = hex(16);
  const loaded = C.stateOf({
    kind: "etiuda-relay-channel", v: 1,
    applied: {
      "guide.ec": { writer: LEAD.keyId, epoch: 1, counter: 1, id: "a", at: 1, sha: "aa", del: false },
      "Guide.ec": { writer: LEAD.keyId, epoch: 2, counter: 4, id: "b", at: 2, sha: "bb", del: false },
    },
    sent: { "GUIDE.ec": { id: sentId, epoch: 2, counter: 4, sha: "bb", size: 2, del: false } },
    refused: { "Guide.ec": { sha: "cc", why: "bad-path" } },
    sentInv: { [inv]: { "Guide.ec": { id: hex(16), epoch: 1, counter: 2, sha: "dd", size: 2, del: false } } },
    pending: [{ seq: 3, id: pend, epoch: 1, writer: LEAD.keyId, floor: 0 }],
  });
  const appliedKeys = Object.keys(loaded.applied);
  const sentKeys = Object.keys(loaded.sent);
  const refusedKeys = Object.keys(loaded.refused);
  const invKeys = Object.keys((loaded.sentInv[inv]) || {});
  const laterApplied = loaded.applied["guide.ec"];
  const quiet = { read() { return null; }, write() {}, remove() {}, list() { return []; } };
  const said = [];
  const maps = C.createProgram({ io: quiet, pin: PIN, clock: () => 1, save() {}, say: l => said.push(l) });
  const blobOf = id => ({ id, epoch: 1, counter: 1, ciphertext: Buffer.alloc(8) });
  maps.sentOut({ rel: "Guide.ec", kind: "file", sha: "aa" }, blobOf(hex(16)));
  maps.sentOut({ rel: "guide.ec", kind: "file", sha: "bb" }, blobOf(hex(16)));
  maps.refusedOut({ rel: "GUIDE.ec", sha: "cc" }, { reason: "bad-path", said: B.REASONS["bad-path"] });
  maps.refusedOut({ rel: "guide.ec", sha: "dd" }, { reason: "bad-path", said: B.REASONS["bad-path"] });
  const sentLive = Object.keys(maps.state().sent).filter(k => k.toLowerCase() === "guide.ec");
  const refusedLive = Object.keys(maps.state().refused).filter(k => k.toLowerCase() === "guide.ec");
  const from = said.length;
  maps.refusedOut({ rel: "guide.ec" }, { reason: "epoch", said: "held" });
  maps.refusedOut({ rel: "Guide.ec" }, { reason: "epoch", said: "held" });
  const waits = said.slice(from).filter(l => l.indexOf("waits") >= 0).length;
  check(appliedKeys.length === 1 && appliedKeys[0] === "guide.ec" && laterApplied && laterApplied.epoch === 2
    && sentKeys.length === 1 && sentKeys[0] === "guide.ec"
    && refusedKeys.length === 1 && refusedKeys[0] === "guide.ec"
    && invKeys.length === 1 && invKeys[0] === "guide.ec"
    && loaded.pending.length === 1 && !("path" in loaded.pending[0])
    && sentLive.length === 1 && refusedLive.length === 1 && waits === 1,
    "957c case-distinct paths are one file in applied, sent, refused and a copy's sent map, and a wait is said once: applied "
    + JSON.stringify(appliedKeys) + " epoch " + (laterApplied && laterApplied.epoch) + ", sent " + JSON.stringify(sentKeys)
    + ", refused " + JSON.stringify(refusedKeys) + ", copy " + JSON.stringify(invKeys)
    + ", pending " + loaded.pending.length + ", live sent " + sentLive.length + ", live refused " + refusedLive.length
    + ", waits " + waits);
} catch (e) {
  check(false, "harness (the legs 957a to 957d): " + (e && e.stack ? e.stack : e));
}

/* plant:path-key. Deleting that line, leaving the file valid script, lets an older blob under another case replace the file. */
{
  const src = path.join(ROOT, "shell", "relay", "channel.cjs");
  const before = fs.readFileSync(src);
  const digest = sha(before);
  let turned = false, detail = "plant line absent";
  try {
    const lines = before.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf("plant:path-key") >= 0);
    if (at >= 0) {
      lines.splice(at, 1);
      const lifted = loadPlantedChannel(lines.join("\n"));
      const root = path.join(LAB, "f3-plant-" + hex(4));
      fs.mkdirSync(root, { recursive: true });
      const prog = lifted.createProgram({ io: lifted.diskIO(root, lifted.writeWhole), pin: PIN, clock: () => 1700000000000, save() {} });
      const writer = { keyId: LEAD.keyId, privateKey: LEAD.privateKey };
      const K2 = crypto.randomBytes(32);
      const ctx = { keyFor: e => (e === 2 ? K2 : e === 1 ? K1 : null) };
      const seal = (p, body, epoch, counter, key) => B.seal({ relayTeamId: RT, epoch, teamKey: key, writer,
        path: p, body, counter, place: "root" });
      const item = (blob, seq) => ({ seq, ct: blob.ciphertext, meta: { v: 1, id: blob.id, writer: blob.writerKeyId,
        epoch: blob.epoch, counter: blob.counter, size: blob.ciphertext.length, sig: blob.signature, nonce: blob.nonce,
        supersedes: blob.supersedes, del: !!blob.deletion } });
      prog.applyBatch([item(seal("guide.ec", "v2", 2, 10, K2), 1)], ctx);
      prog.applyBatch([item(seal("Guide.ec", "v1", 1, 1, K1), 2)], ctx);
      /* Any case variant on disk holding v1, or more than one variant, is the harm: one file on a case-folding disk,
         two on a case-sensitive one (the test architect's condition 1 of 2026-10-19). */
      const variants = fs.readdirSync(root).filter(n => n.toLowerCase() === "guide.ec");
      const bodies = variants.map(n => fs.readFileSync(path.join(root, n), "utf8"));
      turned = bodies.indexOf("v1") >= 0 || variants.length > 1;
      detail = "case variants " + JSON.stringify(variants) + ", bodies " + JSON.stringify(bodies);
    }
  } catch (e) {
    detail = e && e.message ? e.message : String(e);
  }
  const back = sha(fs.readFileSync(src)) === digest;
  check(turned && back, "957d lifting plant:path-key lets the older case replace the file, and the product file is never written: "
    + detail + ", sha " + (back ? "restored" : "differs"));
}

/* A mirror that keeps every name as given, so two names differing only in case can sit side by side.
   A case-folding disk cannot hold that pair; this stand-in can. */
function exactNames(entries) {
  const store = new Map(entries);
  return {
    read(rel) { return store.has(rel) ? Buffer.from(store.get(rel)) : null; },
    write(rel, text) { store.set(rel, Buffer.isBuffer(text) ? text : Buffer.from(String(text), "utf8")); },
    remove(rel) { store.delete(rel); },
    list() { return [...store.keys()]; },
  };
}
const LEAD_ME = { keyId: LEAD.keyId, place: "root" };
function oweFiles(prog) {
  return prog.owed(LEAD_ME, null).filter(op => op.kind === "file");
}
function markSent(prog, ops, n) {
  for (const op of ops) prog.sentOut(op, { id: hex(16), epoch: 1, counter: n, ciphertext: Buffer.alloc(4) });
}

/* ---- two names of one path on a case-sensitive stand-in (board 912). A cycle owes one of them, later cycles owe
   nothing until that file changes, and the other is said once as staying on this computer. One file per path is
   unchanged. ---- */
try {
  const said = [];
  const io = exactNames([["Guide.ec", "alpha"], ["guide.ec", "beta"]]);
  const prog = C.createProgram({ io, pin: PIN, clock: () => 1700000000000, save() {}, say: l => said.push(l) });
  const first = oweFiles(prog);
  markSent(prog, first, 1);
  const quiet = [oweFiles(prog), oweFiles(prog), oweFiles(prog)];
  const sentRel = first.length === 1 ? first[0].rel : "";
  const otherRel = sentRel === "Guide.ec" ? "guide.ec" : sentRel === "guide.ec" ? "Guide.ec" : "";
  if (sentRel) io.write(sentRel, "gamma");
  const changed = oweFiles(prog);
  markSent(prog, changed, 2);
  const after = oweFiles(prog);
  const stays = said.filter(l => l.indexOf("stays on this computer") >= 0 && l.indexOf("is not text") < 0);
  const quietNone = quiet.every(ops => ops.length === 0);
  check(first.length === 1 && otherRel !== "" && quietNone && after.length === 0
    && changed.length === 1 && changed[0].rel === sentRel && changed[0].body === "gamma"
    && stays.length === 1 && stays[0].indexOf(otherRel) >= 0,
    "958a two case variants of one path owe one file, then nothing until that file changes, and the other is said once as staying: first "
    + JSON.stringify(first.map(op => op.rel)) + ", quiet " + quiet.map(ops => ops.length).join(" ")
    + ", changed " + JSON.stringify(changed.map(op => op.rel)) + " then " + after.length
    + ", said " + stays.length + " " + JSON.stringify(stays));
} catch (e) {
  check(false, "harness (the leg 958a): " + (e && e.stack ? e.stack : e));
}
try {
  const said = [];
  const io = exactNames([["page.ec", "one"]]);
  const prog = C.createProgram({ io, pin: PIN, clock: () => 1700000000000, save() {}, say: l => said.push(l) });
  const first = oweFiles(prog);
  markSent(prog, first, 1);
  const second = oweFiles(prog);
  const stays = said.filter(l => l.indexOf("stays on this computer") >= 0);
  check(first.length === 1 && first[0].rel === "page.ec" && first[0].body === "one" && second.length === 0 && stays.length === 0,
    "958b one file per path is unchanged: ops " + first.length + " then " + second.length + ", said " + stays.length);
} catch (e) {
  check(false, "harness (the leg 958b): " + (e && e.stack ? e.stack : e));
}

/* plant:case-one. Deleting that line, leaving the file valid script, owes a case variant on later cycles again. */
{
  const src = path.join(ROOT, "shell", "relay", "channel.cjs");
  const before = fs.readFileSync(src);
  const digest = sha(before);
  let turned = false, detail = "plant line absent";
  try {
    const lines = before.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf("plant:case-one") >= 0);
    if (at >= 0) {
      lines.splice(at, 1);
      const lifted = loadPlantedChannel(lines.join("\n"));
      const io = exactNames([["Guide.ec", "alpha"], ["guide.ec", "beta"]]);
      const prog = lifted.createProgram({ io, pin: PIN, clock: () => 1700000000000, save() {} });
      const names = [];
      let looping = false;
      for (let n = 0; n < 5; n++) {
        const ops = prog.owed(LEAD_ME, null).filter(op => op.kind === "file");
        if (ops.length > 1 || (n > 0 && ops.length > 0)) looping = true;
        for (const op of ops) {
          names.push(op.rel);
          prog.sentOut(op, { id: hex(16), epoch: 1, counter: n + 1, ciphertext: Buffer.alloc(4) });
        }
      }
      turned = looping;
      detail = "sent " + JSON.stringify(names);
    }
  } catch (e) {
    detail = e && e.message ? e.message : String(e);
  }
  const back = sha(fs.readFileSync(src)) === digest;
  check(turned && back, "958c lifting plant:case-one sends a case variant on later cycles, and the product file is never written: "
    + detail + ", sha " + (back ? "restored" : "differs"));
}

/* ---- four pairs NTFS holds as two files (board 915), and one pair it holds as one file (board 916).
   Sharp s against ss, dotless i against i, the fi ligature against fi, and the Kelvin sign against k:
   each pair is two path keys, so a cycle owes both names and says neither as staying. The iota-subscript
   pair, U+1F80 against U+1F88, is one key, so one name is owed and the other is said as staying. ---- */
const PAIRS_915 = [
  ["Stra\u00dfe.ec", "Strasse.ec"],
  ["\u0131dea.ec", "idea.ec"],
  ["\ufb01le.ec", "file.ec"],
  ["\u212aelvin.ec", "kelvin.ec"],
];
const PAIR_916 = ["\u1f80x.ec", "\u1f88x.ec"];
try {
  const said = [];
  const entries = [];
  for (const [a, b] of PAIRS_915) entries.push([a, "one"], [b, "two"]);
  entries.push([PAIR_916[0], "sub"], [PAIR_916[1], "cap"]);
  const io = exactNames(entries);
  const prog = C.createProgram({ io, pin: PIN, clock: () => 1700000000000, save() {}, say: l => said.push(l) });
  const first = oweFiles(prog);
  const owed = new Set(first.map(op => op.rel));
  const keys = PAIRS_915.map(([a, b]) => {
    const ka = B.checkPath(a), kb = B.checkPath(b);
    return [ka.ok ? ka.folded.join("/") : "bad", kb.ok ? kb.folded.join("/") : "bad"];
  });
  const forced = PAIR_916.map(name => {
    const p = B.checkPath(name);
    return p.ok ? p.folded.join("/") : "bad";
  });
  const distinct = keys.every(([a, b]) => a !== b);
  const shared = forced[0] !== "bad" && forced[0] === forced[1];
  const fourOwed = PAIRS_915.every(([a, b]) => owed.has(a) && owed.has(b));
  const forcedOwed = PAIR_916.filter(name => owed.has(name));
  const forcedHeld = PAIR_916.filter(name => !owed.has(name));
  const stays = said.filter(l => l.indexOf("stays on this computer") >= 0 && l.indexOf("is not text") < 0);
  const stayHit = forcedHeld.length === 1 && stays.length === 1 && stays[0].indexOf(forcedHeld[0]) >= 0;
  check(distinct && shared && fourOwed && forcedOwed.length === 1 && first.length === 9 && stayHit,
    "959a the four pairs have two path keys and the iota-subscript pair has one: keys "
    + JSON.stringify(keys) + ", shared " + JSON.stringify(forced)
    + ", owed " + JSON.stringify(first.map(op => op.rel)) + ", said " + stays.length);
} catch (e) {
  check(false, "harness (the leg 959a): " + (e && e.stack ? e.stack : e));
}

/* plant:ntfs-fold. Deleting that line, leaving the file valid script, folds the four pairs together again. */
{
  const src = path.join(ROOT, "shell", "relay", "blob.cjs");
  const channel = path.join(ROOT, "shell", "relay", "channel.cjs");
  const before = fs.readFileSync(src);
  const digest = sha(before);
  let turned = false, detail = "plant line absent";
  try {
    const lines = before.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf("plant:ntfs-fold") >= 0);
    if (at >= 0) {
      lines.splice(at, 1);
      const lifted = loadPlantedBlobChannel(lines.join("\n"));
      const entries = [];
      for (const [a, b] of PAIRS_915) entries.push([a, "one"], [b, "two"]);
      const io = exactNames(entries);
      const prog = lifted.createProgram({ io, pin: PIN, clock: () => 1700000000000, save() {} });
      const ops = prog.owed(LEAD_ME, null).filter(op => op.kind === "file");
      turned = ops.length < entries.length;
      detail = "owed " + ops.length + " " + JSON.stringify(ops.map(op => op.rel));
    }
  } catch (e) {
    detail = e && e.message ? e.message : String(e);
  }
  const back = sha(fs.readFileSync(src)) === digest;
  check(turned && back, "959b lifting plant:ntfs-fold gives the four pairs one key again, and the product file is never written: "
    + detail + ", sha " + (back ? "restored" : "differs"));
}

/* The iota-subscript pair shares a key even when the runtime's own case maps throw. A fold that
   still calls toUpperCase or toLowerCase fails this leg. */
try {
  const upper = String.prototype.toUpperCase, lower = String.prototype.toLowerCase;
  let share = false, guide = false, apart = false, detail = "";
  try {
    String.prototype.toUpperCase = function () { throw new Error("toUpperCase"); };
    String.prototype.toLowerCase = function () { throw new Error("toLowerCase"); };
    const foldOf = rel => { const p = B.checkPath(rel); return p.ok ? p.folded.join("/") : "bad"; };
    const g1 = foldOf(PAIR_916[0]), g2 = foldOf(PAIR_916[1]);
    const a = foldOf("Guide.ec"), b = foldOf("guide.ec");
    const k1 = foldOf("\u212aelvin.ec"), k2 = foldOf("kelvin.ec");
    share = g1 !== "bad" && g1 === g2;
    guide = a === "guide.ec" && b === "guide.ec";
    apart = k1 !== "bad" && k2 !== "bad" && k1 !== k2;
    detail = "greek " + g1 + " " + g2 + ", guide " + a + " " + b + ", kelvin " + k1 + " " + k2;
  } finally {
    String.prototype.toUpperCase = upper;
    String.prototype.toLowerCase = lower;
  }
  check(share && guide && apart,
    "961a the iota-subscript pair shares one key, Guide and guide share guide.ec, and the Kelvin sign stays apart from k, with the runtime case maps standing aside: "
    + detail);
} catch (e) {
  check(false, "harness (the leg 961a): " + (e && e.stack ? e.stack : e));
}

/* plant:upcase-table. Deleting that line, leaving the file valid script, leaves each unit itself,
   so the iota-subscript pair no longer shares a key. */
try {
  const src = path.join(ROOT, "shell", "relay", "blob.cjs");
  const channel = path.join(ROOT, "shell", "relay", "channel.cjs");
  const before = fs.readFileSync(src);
  const digest = sha(before);
  let turned = false, detail = "plant line absent";
  try {
    const lines = before.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf("plant:upcase-table") >= 0);
    if (at >= 0) {
      lines.splice(at, 1);
      const lifted = loadPlantedBlob(lines.join("\n"));
      const g1 = lifted.checkPath(PAIR_916[0]), g2 = lifted.checkPath(PAIR_916[1]);
      const a = g1.ok ? g1.folded.join("/") : "bad", b = g2.ok ? g2.folded.join("/") : "bad";
      turned = a !== "bad" && b !== "bad" && a !== b;
      detail = "keys " + a + " " + b;
    }
  } catch (e) {
    detail = e && e.message ? e.message : String(e);
  }
  const back = sha(fs.readFileSync(src)) === digest;
  check(turned && back, "961b lifting plant:upcase-table gives the iota-subscript pair two keys, and the product file is never written: "
    + detail + ", sha " + (back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the leg 961b): " + (e && e.stack ? e.stack : e));
}

/* A desk's relay socket closes. The channel sees that close, and the lead's next edition still arrives by the poll,
   which runs only while the desk holds no socket. */
try {
  const k1 = crypto.randomBytes(32);
  const deskKey = keyPair(true);
  const tm = await freshTeam([deskKey]);
  const keys = new Map([[1, k1]]);
  const tag = tm.rt.slice(0, 8);
  const ONE = "{\"kind\":\"etiuda-sealed\",\"note\":\"quay edition one\"}\n";
  const TWO = "{\"kind\":\"etiuda-sealed\",\"note\":\"quay edition two\"}\n";
  const lead = opened(C, "960-lead-" + tag, tm, LEAD, "root", {
    keyFor: e => keys.get(e) || null, sealEpoch: () => 1,
  });
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(deskKey)]));
  put(lead.mirror, "guide.ec", ONE);
  lead.ch.start();
  await settle(lead);
  const deskT = transport("960-desk-" + tag);
  let handle = null;
  const connect = (url, headers, on) => { handle = deskT.connect(url, headers, on); return handle; };
  const desk = opened(C, "960-desk-" + tag, tm, deskKey, "desk:" + deskKey.keyId, {
    keyFor: e => keys.get(e) || null, sealEpoch: () => 1,
    request: deskT.request, connect, pollMs: 300,
  });
  desk.ch.start();
  await settle(desk);
  const had = read(desk.mirror, "guide.ec") === ONE;
  const socketUp = await until(() => desk.ch.socketOpen(), 5000);
  if (handle) handle.close();
  const seenClosed = await until(() => !desk.ch.socketOpen(), 3000);
  put(lead.mirror, "guide.ec", TWO);
  await settle(lead);
  const caught = await until(() => read(desk.mirror, "guide.ec") === TWO, 10000);
  check(had && socketUp && seenClosed && caught,
    "960a a desk whose relay socket closes still receives the lead's next edition by the poll: first edition "
    + (had ? "in the mirror" : "missing") + ", socket opened " + socketUp + ", seen closed " + seenClosed
    + ", the next edition arrived " + caught);
  await desk.ch.stop();
  await lead.ch.stop();
} catch (e) {
  check(false, "harness (the leg 960a): " + (e && e.stack ? e.stack : e));
}

/* A batch that holds the Kelvin sign name and kelvin.ec lands both. They are two files on NTFS, and
   two path keys. Keying the batch by toLowerCase drops one of them. */
async function kelvinBatch(mod) {
  const k1 = crypto.randomBytes(32);
  const deskKey = keyPair(true);
  const tm = await freshTeam([deskKey]);
  const keys = new Map([[1, k1]]);
  const tag = tm.rt.slice(0, 8);
  const signName = "\u212aelvin.ec";
  const SIGN = "sign-body\n", ASCII = "ascii-body\n";
  const lead = opened(mod, "962-lead-" + tag, tm, LEAD, "root", {
    keyFor: e => keys.get(e) || null, sealEpoch: () => 1,
  });
  put(lead.mirror, mod.TEAM_NAME, teamBody(tm, 1, 1, [member(deskKey)]));
  put(lead.mirror, signName, SIGN);
  put(lead.mirror, "kelvin.ec", ASCII);
  lead.ch.start();
  await settle(lead);
  const desk = opened(mod, "962-desk-" + tag, tm, deskKey, "desk:" + deskKey.keyId, {
    keyFor: e => keys.get(e) || null, sealEpoch: () => 1,
  });
  desk.ch.start();
  await settle(desk);
  const sign = read(desk.mirror, signName);
  const ascii = read(desk.mirror, "kelvin.ec");
  await desk.ch.stop();
  await lead.ch.stop();
  return { sign, ascii, SIGN, ASCII };
}
try {
  const got = await kelvinBatch(C);
  check(got.sign === got.SIGN && got.ascii === got.ASCII,
    "962a a batch lands both the Kelvin sign name and kelvin.ec: sign " + JSON.stringify(got.sign)
    + ", ascii " + JSON.stringify(got.ascii));
} catch (e) {
  check(false, "harness (the leg 962a): " + (e && e.stack ? e.stack : e));
}
try {
  const planted = await liftChannel("plant:land-fold", async mod => {
    const x = await kelvinBatch(mod);
    return (x.sign === x.SIGN) !== (x.ascii === x.ASCII);
  });
  check(planted.turned && planted.back, "962b lifting plant:land-fold drops one of the Kelvin sign name and kelvin.ec, and the product file is never written: "
    + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the leg 962b): " + (e && e.stack ? e.stack : e));
}

/* A second invitation for the same team, after the first was used and withdrawn. The old id stays spent. */
async function addInvite(rt, id, token, drop) {
  const add = [{ id, hash: sha(Buffer.from(token, "utf8")) }];
  const at = R.clock.now;
  return admin("POST", "/relay/v1/t/" + rt + "/invites", { add, drop: drop || [], t: at,
    sig: signHex(LEAD, core.invitesBytes(rt, at, add, drop || [])) });
}
async function secondInvite(mod) {
  const k1 = crypto.randomBytes(32);
  const deskKey = keyPair(true);
  const tm = await freshTeam([]);
  const inv1 = hex(16), token1 = hex(32), ki1 = C.inviteSealKey(hex(16));
  const inv2 = hex(16), token2 = hex(32), ki2 = C.inviteSealKey(hex(16));
  if ((await addInvite(tm.rt, inv1, token1)).status !== 200) throw new Error("the first invitation was not made");
  const tag = tm.rt.slice(0, 8);
  const live = [{ id: inv1, key: ki1 }];
  let current = { inv: inv1, token: token1, seal: ki1 };
  const lead = opened(mod, "961a-lead-" + tag, tm, LEAD, "root", {
    keyFor: e => (e === 1 ? k1 : null), sealEpoch: () => 1, inviteKeys: () => live.slice(),
  });
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, []));
  lead.ch.start();
  await lead.ch.idle();
  const desk = opened(mod, "961a-desk-" + tag, tm, deskKey, "desk:" + deskKey.keyId, {
    keyFor: () => null, sealEpoch: () => null, invite: () => current,
  });
  const rel = "desks/" + deskKey.keyId + "/join.json";
  const JOIN1 = "{\"kind\":\"etiuda-join\",\"note\":\"first ask\"}\n";
  const JOIN2 = "{\"kind\":\"etiuda-join\",\"note\":\"second ask\"}\n";
  const JOIN3 = "{\"kind\":\"etiuda-join\",\"note\":\"old id again\"}\n";
  put(desk.mirror, rel, JOIN1);
  desk.ch.start();
  await desk.ch.idle();
  await once(lead);
  const first = read(lead.mirror, rel) === JOIN1;
  const moved = await addInvite(tm.rt, inv2, token2, [inv1]);
  live.length = 0;
  live.push({ id: inv2, key: ki2 });
  current = { inv: inv2, token: token2, seal: ki2 };
  put(desk.mirror, rel, JOIN2);
  await once(desk);
  await once(lead);
  const second = read(lead.mirror, rel);
  const st = desk.prog.state();
  const ids = st.tokenUsedIds || {};
  current = { inv: inv1, token: token1, seal: ki1 };
  put(desk.mirror, rel, JOIN3);
  await once(desk);
  await once(lead);
  const third = read(lead.mirror, rel);
  const out = { first, moved: moved.status === 200, second, join2: JOIN2, third, join3: JOIN3,
    spent: ids[inv1] === true, tokenUsed: st.tokenUsed === true };
  await lead.ch.stop();
  await desk.ch.stop();
  return out;
}
/* Removed at the same epoch, then one join through an invitation registered after that, and not through one from before. */
async function rejoinDesk(mod) {
  const k1 = crypto.randomBytes(32), k2 = crypto.randomBytes(32);
  const deskKey = keyPair(true);
  const tm = await freshTeam([deskKey]);
  const tag = tm.rt.slice(0, 8);
  const invOld = hex(16), tokenOld = hex(32), kiOld = C.inviteSealKey(hex(16));
  const inv2 = hex(16), token2 = hex(32), ki2 = C.inviteSealKey(hex(16));
  if ((await addInvite(tm.rt, invOld, tokenOld)).status !== 200) throw new Error("the earlier invitation was not made");
  const keys = new Map([[1, k1], [2, k2]]);
  let sealAt = 1;
  const live = [];
  let current = null;
  const lead = opened(mod, "961c-lead-" + tag, tm, LEAD, "root", {
    keyFor: e => keys.get(e) || null, sealEpoch: () => sealAt, inviteKeys: () => live.slice(),
  });
  const doc1 = JSON.parse(teamBody(tm, 1, 1, [member(deskKey)]));
  const doc2 = JSON.parse(teamBody(tm, 1, 2, []));
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(deskKey)]));
  lead.prog.loadTeamFile(doc1);
  lead.ch.start();
  await lead.ch.idle();
  const desk = opened(mod, "961c-desk-" + tag, tm, deskKey, "desk:" + deskKey.keyId, {
    keyFor: e => keys.get(e) || null, sealEpoch: () => 1, invite: () => current,
  });
  desk.ch.start();
  await settle(lead, desk);
  await desk.ch.stop();
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 2, []));
  lead.prog.loadTeamFile(doc2);
  await once(lead);
  const tDrop = R.clock.now;
  const dropped = await admin("POST", "/relay/v1/t/" + tm.rt + "/devices", { keys: [], rev: 2, t: tDrop,
    sig: signHex(LEAD, core.devicesBytes(tm.rt, 2, tDrop, [])) });
  R.clock.now += 1;
  if ((await addInvite(tm.rt, inv2, token2)).status !== 200) throw new Error("the later invitation was not made");
  live.push({ id: inv2, key: ki2 });
  current = { inv: inv2, token: token2, seal: ki2 };
  const rel = "desks/" + deskKey.keyId + "/join.json";
  const JOIN = "{\"kind\":\"etiuda-join\",\"note\":\"back\"}\n";
  const OLD = "{\"kind\":\"etiuda-join\",\"note\":\"too early\"}\n";
  put(desk.mirror, rel, JOIN);
  desk.ch.start();
  await desk.ch.idle();
  await once(lead);
  const atLead = read(lead.mirror, rel) === JOIN;
  current = { inv: invOld, token: tokenOld, seal: kiOld };
  put(desk.mirror, rel, OLD);
  await once(desk);
  await once(lead);
  const oldHeld = read(lead.mirror, rel) === JOIN;
  const back = [{ id: deskKey.keyId, pub: deskKey.pub, desk: deskKey.keyId }];
  const tBack = R.clock.now;
  await admin("POST", "/relay/v1/t/" + tm.rt + "/devices", { keys: back, rev: 3, t: tBack,
    sig: signHex(LEAD, core.devicesBytes(tm.rt, 3, tBack, back)) });
  sealAt = 2;
  const GUIDE = "epoch-two\n";
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 2, 1, [member(deskKey)]));
  lead.prog.loadTeamFile(JSON.parse(teamBody(tm, 2, 1, [member(deskKey)])));
  put(lead.mirror, "guide.ec", GUIDE);
  await once(lead);
  current = null;
  await once(desk);
  await once(desk);
  let named = false;
  try {
    const doc = JSON.parse(read(desk.mirror, C.TEAM_NAME));
    named = doc.epoch === 2 && Array.isArray(doc.roster) && doc.roster.some(row => row.desk && row.desk.id === deskKey.keyId);
  } catch { named = false; }
  const guide = read(desk.mirror, "guide.ec") === GUIDE;
  const out = { atLead, oldHeld, admitted: named && guide, dropped: dropped.status === 200, guide: read(desk.mirror, "guide.ec") };
  await lead.ch.stop();
  await desk.ch.stop();
  return out;
}
try {
  const again = await secondInvite(C);
  check(again.first && again.moved && again.second === again.join2 && again.spent && again.tokenUsed && again.third === again.join2,
    "961l a new invitation is unspent after an earlier one was used and withdrawn, and the old id stays spent: first "
    + (again.first ? "at the lead" : "missing") + ", second " + (again.second === again.join2 ? "at the lead" : JSON.stringify(again.second))
    + ", old id " + (again.spent ? "spent" : "not spent") + ", token used " + again.tokenUsed
    + ", presenting the old id " + (again.third === again.join2 ? "changes nothing" : "wrote " + JSON.stringify(again.third)));
  const planted = await liftChannel("plant:token-by-id", async mod => {
    const x = await secondInvite(mod);
    return x.first && x.moved && x.second !== x.join2;
  });
  check(planted.turned && planted.back, "961m lifting plant:token-by-id blocks the new invitation, and the product file is never written: "
    + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
  const back = await rejoinDesk(C);
  check(back.dropped && back.atLead && back.oldHeld && back.admitted,
    "961c a removed desk uploads one join through an invitation registered after its removal, not through an earlier one, and is admitted"
    + " at the new epoch: join " + (back.atLead ? "at the lead" : "missing") + ", the earlier invitation "
    + (back.oldHeld ? "refused" : "not refused") + ", epoch 2 " + (back.admitted ? "in the mirror" : "missing, guide " + JSON.stringify(back.guide)));
  const removed = await liftChannel("plant:removed-token", async mod => {
    const x = await rejoinDesk(mod);
    return x.atLead === false;
  });
  check(removed.turned && removed.back, "961d lifting plant:removed-token sends no join after removal, and the product file is never written: "
    + removed.detail + ", sha " + (removed.back ? "restored" : "differs"));
  const asked = await liftChannel("plant:ask-rejoin", async mod => {
    const x = await rejoinDesk(mod);
    return x.atLead === false;
  });
  check(asked.turned && asked.back, "961e lifting plant:ask-rejoin leaves the lead's mirror without the join, and the product file is never written: "
    + asked.detail + ", sha " + (asked.back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the leg 961l): " + (e && e.stack ? e.stack : e));
}

/* One channel across two invitations (board 918). A desk's invitation session serves one upload; after it the desk asks each
   cycle whether the lead has enrolled its key, and a second invitation gets a session of its own. The first invitation
   stays registered here (nothing withdraws it), so the relay does not close its session and the channel must not reuse it. */
async function invitedDesk(mod, name) {
  const k1 = crypto.randomBytes(32);
  const deskKey = keyPair(true);
  const tm = await freshTeam([]);
  const tag = tm.rt.slice(0, 8);
  const inv1 = hex(16), token1 = hex(32), ki1 = C.inviteSealKey(hex(16));
  if ((await addInvite(tm.rt, inv1, token1)).status !== 200) throw new Error("the first invitation was not made");
  const live = [{ id: inv1, key: ki1 }];
  let current = { inv: inv1, token: token1, seal: ki1 };
  const lead = opened(mod, name + "-lead-" + tag, tm, LEAD, "root", {
    keyFor: e => (e === 1 ? k1 : null), sealEpoch: () => 1, inviteKeys: () => live.slice(),
  });
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, []));
  lead.ch.start();
  await lead.ch.idle();
  const desk = opened(mod, name + "-desk-" + tag, tm, deskKey, "desk:" + deskKey.keyId, {
    keyFor: () => null, sealEpoch: () => null, invite: () => current,
  });
  const rel = "desks/" + deskKey.keyId + "/join.json";
  const JOIN1 = "{\"kind\":\"etiuda-join\",\"note\":\"first ask\"}\n";
  put(desk.mirror, rel, JOIN1);
  desk.ch.start();
  await desk.ch.idle();
  await once(lead);
  return { tm, deskKey, lead, desk, rel, live, inv1, first: read(lead.mirror, rel) === JOIN1, take: c => { current = c; } };
}
/* The first request lands and the first invitation's one upload is made. The lead then registers a second invitation and
   withdraws nothing, the desk takes it and writes a second request. */
async function heldInvite(mod) {
  const x = await invitedDesk(mod, "961h");
  const inv2 = hex(16), token2 = hex(32), ki2 = C.inviteSealKey(hex(16));
  const JOIN2 = "{\"kind\":\"etiuda-join\",\"note\":\"second ask\"}\n";
  const added = await addInvite(x.tm.rt, inv2, token2);
  x.live.push({ id: inv2, key: ki2 });
  x.take({ inv: inv2, token: token2, seal: ki2 });
  put(x.desk.mirror, x.rel, JOIN2);
  await once(x.desk);
  await once(x.lead);
  const s = relayStore(x.tm.rt), r1 = s.get("inv:" + x.inv1), r2 = s.get("inv:" + inv2);
  const out = { first: x.first, added: added.status === 200, second: read(x.lead.mirror, x.rel), join2: JOIN2,
    used1: !!(r1 && r1.uploaded), spent2: !!(r2 && r2.spent), used2: !!(r2 && r2.uploaded) };
  await x.lead.ch.stop();
  await x.desk.ch.stop();
  return out;
}
/* The first request lands and the lead enrols the desk's key. The desk's next cycle, with no change to the invitation. */
async function keyTurn(mod) {
  const x = await invitedDesk(mod, "961j");
  /* Before the key is enrolled, a cycle after the upload fetches the lead's answer and nothing of the team (no since call). */
  const pre = x.desk.t.log.length;
  await once(x.desk);
  const asked = x.desk.t.log.slice(pre).some(l => /since/.test(String(l)));
  const list = [{ id: x.deskKey.keyId, pub: x.deskKey.pub, desk: x.deskKey.keyId }], t = R.clock.now;
  const enrolled = await admin("POST", "/relay/v1/t/" + x.tm.rt + "/devices", { keys: list, rev: 2, t,
    sig: signHex(LEAD, core.devicesBytes(x.tm.rt, 2, t, list)) });
  const mark = x.desk.t.log.length;
  await once(x.desk);
  const out = { first: x.first, asked, enrolled: enrolled.status === 200, hello: x.desk.t.log.slice(mark).indexOf("POST hello") >= 0,
    keyed: relayStore(x.tm.rt).dump().some(([k, v]) => k.startsWith("ses:") && JSON.parse(v).key === x.deskKey.keyId) };
  await x.lead.ch.stop();
  await x.desk.ch.stop();
  return out;
}
try {
  const held = await heldInvite(C);
  check(held.first && held.added && held.used1 && held.second === held.join2 && held.spent2 && held.used2,
    "961h one channel holds the first invitation's session after its upload, the lead registers a second invitation and withdraws nothing,"
    + " and the second request goes by a session of the second invitation's own: first request " + (held.first ? "at the lead" : "missing")
    + ", first invitation " + (held.used1 ? "used" : "not used") + ", second request "
    + (held.second === held.join2 ? "at the lead" : JSON.stringify(held.second)) + ", second invitation "
    + (held.spent2 ? "spent" : "not spent") + " and " + (held.used2 ? "used" : "not used"));
  const reused = await liftChannel("plant:new-invite-session", async mod => {
    const x = await heldInvite(mod);
    return x.first && x.added && x.used1 && x.second !== x.join2 && !x.spent2 && !x.used2;
  });
  check(reused.turned && reused.back, "961i lifting plant:new-invite-session sends the second request over the first invitation's spent session,"
    + " which the relay refuses, and the product file is never written: " + reused.detail + ", sha " + (reused.back ? "restored" : "differs"));
  const older = await liftChannel("plant:fresh-first", async mod => {
    const x = await heldInvite(mod);
    return x.first && x.used1 && !x.used2;
  });
  check(older.turned && older.back, "961n lifting plant:fresh-first takes the first invitation's session, which the relay still gives the bound key for"
    + " the lead's answer, so the second request never goes, and the product file is never written: " + older.detail + ", sha " + (older.back ? "restored" : "differs"));
  const turn = await keyTurn(C);
  check(turn.first && !turn.asked && turn.enrolled && turn.hello && turn.keyed,
    "961j after its invited upload the desk's next session is its key session: the lead enrols the key, and the desk's next cycle says hello with it"
    + " and the relay holds a session for that key: first request " + (turn.first ? "at the lead" : "missing") + ", before enrolment " + (turn.asked ? "asked for the team's files" : "the answer alone") + ", key " + (turn.enrolled ? "enrolled" : "not enrolled")
    + ", hello " + (turn.hello ? "sent" : "not sent") + ", key session " + (turn.keyed ? "held" : "not held"));
  const stayed = await liftChannel("plant:invite-id-sent", async mod => {
    const x = await keyTurn(mod);
    return x.first && x.asked;
  });
  /* Since slice 3 the relay ends an invitation's sessions when it enrols the bound key, so the turn to the key session no longer
     rests on this line alone; what it alone keeps is the answer-only cycle between the upload and the enrolment. */
  check(stayed.turned && stayed.back, "961k lifting plant:invite-id-sent leaves the desk, after its upload and before its key is enrolled, asking"
    + " the relay for the team's files where it should fetch the lead's answer alone, and the product file is never written: " + stayed.detail + ", sha " + (stayed.back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the leg 961h): " + (e && e.stack ? e.stack : e));
}

/* ---- slice 3, item 1: the wrap's key, its associated data, and openWrap. The epoch line is the plant. ---- */
function liftBlob(tag, fn) {
  const src = path.join(ROOT, "shell", "relay", "blob.cjs");
  const beforeBytes = fs.readFileSync(src);
  const digest = sha(beforeBytes);
  let turned = false, detail = "plant line absent";
  try {
    const lines = beforeBytes.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf(tag) >= 0);
    if (at >= 0) {
      lines.splice(at, 1);
      turned = fn(loadPlantedBlob(lines.join("\n")));
      detail = turned ? "the check lifted" : "the check still held";
    }
  } catch (e) {
    detail = e && e.stack ? e.stack : String(e);
  }
  return { turned, back: sha(fs.readFileSync(src)) === digest, detail };
}
function wrapTeamDoc(id, rt, epoch) {
  return { format: 1, kind: "etiuda-team", id: id, epoch: epoch, rev: 1, channel: { kind: "relay", rt: rt, url: URLV1 } };
}
try {
  const secret = hex(16), rt = hex(16), team = "t-" + hex(8), inv = hex(16), epoch = 3;
  const teamKey = crypto.randomBytes(32);
  const nonce = Buffer.alloc(12, 9);
  const key = B.inviteWrapKey(secret);
    const expectKey = Buffer.from(crypto.hkdfSync("sha256", Buffer.from(secret, "hex"), Buffer.alloc(0), Buffer.from("etiuda-invite-wrap", "utf8"), 32));
    const aad = B.inviteWrapAad({ relayTeamId: rt, teamId: team, invitationId: inv, epoch: epoch });
    const expectAad = Buffer.from(["etiuda-invite-wrap", rt, team, inv, String(epoch)].join("\n") + "\n", "utf8");
    const wrap = B.sealInviteWrap({ secret: secret, relayTeamId: rt, teamId: team, invitationId: inv, epoch: epoch, key: teamKey, nonce: nonce });
    const raw = Buffer.from(wrap.ct, "hex");
    const dec = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12), { authTagLength: 16 });
    dec.setAAD(expectAad);
    dec.setAuthTag(raw.subarray(raw.length - 16));
    const plain = Buffer.concat([dec.update(raw.subarray(12, raw.length - 16)), dec.final()]).toString("utf8");
    const wantPlain = JSON.stringify({ epoch: epoch, key: teamKey.toString("hex") });
    const doc = wrapTeamDoc(team, rt, epoch);
    const opened = B.openWrap({ secret: secret, relayTeamId: rt, teamId: team, invitationId: inv, wrap: wrap, teamDoc: doc });
    const blind = wrap.ct.indexOf(teamKey.toString("hex")) < 0;
    check(!!key && key.equals(expectKey) && key.length === 32 && !!aad && aad.equals(expectAad) && wrap.epoch === epoch
      && plain === wantPlain && opened.ok === true && Buffer.isBuffer(opened.key) && opened.key.equals(teamKey) && blind,
      "968a the wrap key, its associated data and the sealed JSON are the bytes item 1 names, and openWrap reads the team key back: "
      + (key && key.equals(expectKey) ? "key matches" : "key differs")
      + ", associated data " + (aad && aad.equals(expectAad) ? "matches" : "differs")
      + ", plaintext " + (plain === wantPlain ? "matches" : JSON.stringify(plain))
      + ", opened " + (opened.ok === true ? "yes" : (opened.reason || opened.ok))
      + ", the ciphertext holds the key " + (blind ? "nowhere" : "in the clear"));
    const otherTeam = "t-" + hex(8), otherRt = hex(16), otherInv = hex(16);
    const movedInv = B.openWrap({ secret: secret, relayTeamId: rt, teamId: team, invitationId: otherInv, wrap: wrap, teamDoc: doc });
    const movedTeam = B.openWrap({ secret: secret, relayTeamId: rt, teamId: otherTeam, invitationId: inv, wrap: wrap, teamDoc: wrapTeamDoc(otherTeam, rt, epoch) });
    const movedRelay = B.openWrap({ secret: secret, relayTeamId: otherRt, teamId: team, invitationId: inv, wrap: wrap, teamDoc: wrapTeamDoc(team, otherRt, epoch) });
    const movedEpoch = B.openWrap({ secret: secret, relayTeamId: rt, teamId: team, invitationId: inv, wrap: { epoch: epoch + 1, ct: wrap.ct }, teamDoc: wrapTeamDoc(team, rt, epoch + 1) });
    const still = B.openWrap({ secret: secret, relayTeamId: rt, teamId: team, invitationId: inv, wrap: wrap, teamDoc: doc });
    check(!movedInv.ok && !movedTeam.ok && !movedRelay.ok && !movedEpoch.ok && still.ok === true && still.key.equals(teamKey),
      "968b a wrap moved to another invitation, team, relay team or epoch does not open, and the unmoved one does: "
      + [movedInv.reason || movedInv.ok, movedTeam.reason || movedTeam.ok, movedRelay.reason || movedRelay.ok, movedEpoch.reason || movedEpoch.ok].join(" ")
      + ", unmoved " + (still.ok === true ? "opens" : (still.reason || still.ok)));
    const wrong = B.openWrap({ secret: secret, relayTeamId: rt, teamId: team, invitationId: inv, wrap: wrap, teamDoc: wrapTeamDoc(team, rt, epoch + 2) });
    check(wrong.ok === false && wrong.reason === "epoch" && wrong.said === B.REASONS.epoch,
      "968c a wrap whose epoch is not the team file's is refused and said: " + (wrong.reason || wrong.ok) + ", " + JSON.stringify(wrong.said));
    const planted = liftBlob("plant:wrap-epoch", mod => {
      const w = mod.sealInviteWrap({ secret: secret, relayTeamId: rt, teamId: team, invitationId: inv, epoch: epoch, key: teamKey, nonce: nonce });
      const got = mod.openWrap({ secret: secret, relayTeamId: rt, teamId: team, invitationId: inv, wrap: w, teamDoc: wrapTeamDoc(team, rt, epoch + 2) });
      return got.ok === true && Buffer.isBuffer(got.key) && got.key.equals(teamKey);
    });
  check(planted.turned && planted.back,
    "968d lifting plant:wrap-epoch opens that wrap, and the product file is never written: " + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the legs 968a): " + (e && e.stack ? e.stack : e));
}

/* ---- slice 3, item 2: a token hello that binds no key is not sent; a second use is said as already used. ---- */
const INVITE_USED_NEW = "This invitation has already been used. Ask your lead for a new one.";
const INVITE_USED_OLD = "This invitation has already been used.";
async function relayTeam() {
  const rt = hex(16);
  const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
  if (made.status !== 200) throw new Error("a team was not made: " + made.status);
  return rt;
}
async function registerInvite(rt, id, token) {
  const t = R.clock.now, hash = sha(Buffer.from(token, "utf8"));
  const res = await admin("POST", "/relay/v1/t/" + rt + "/invites", { add: [{ id: id, hash: hash }], drop: [], t: t,
    sig: signHex(LEAD, core.invitesBytes(rt, t, [{ id: id, hash: hash }], [])) });
  if (res.status !== 200) throw new Error("an invitation was not registered: " + JSON.stringify(res.json));
}
async function tokenHello(mod, rt, token, inv, who) {
  const said = [];
  const place = who ? "desk:" + who.keyId : "desk:k-hollow";
  const extra = {
    invite: () => ({ inv: inv, token: token, seal: crypto.randomBytes(32) }),
    say: l => said.push(l),
  };
  if (!who) extra.me = () => ({ keyId: "k-" + hex(8), public: hex(32), place: place });
  const desk = opened(mod, "tok-" + hex(4), { rt: rt, id: "t-" + hex(8) }, who || LEAD, place, extra);
  desk.ch.start();
  await desk.ch.idle();
  const sessions = desk.t.log.filter(l => l.indexOf("POST session") === 0).length;
  const used = desk.prog.state().tokenUsed === true;
  const online = desk.ch.online();
  await desk.ch.stop();
  return { sessions: sessions, used: used, said: said, online: online };
}
try {
  const rt = await relayTeam(), token = hex(32), inv = hex(16);
  await registerInvite(rt, inv, token);
  const bare = await tokenHello(C, rt, token, inv, null);
  const later = await tokenHello(C, rt, token, inv, keyPair(true));
  check(bare.sessions === 0 && bare.used === false && later.online === true && later.used === true,
    "969a a token hello that binds no key is not sent and spends nothing, and a later hello that binds a key spends the token: "
    + "bare sessions " + bare.sessions + ", bare used " + bare.used + ", later online " + later.online + ", later used " + later.used);
  const bindPlant = await liftChannel("plant:invite-bind", async mod => {
    const rt2 = await relayTeam(), token2 = hex(32), inv2 = hex(16);
    await registerInvite(rt2, inv2, token2);
    const a = await tokenHello(mod, rt2, token2, inv2, null);
    const b = await tokenHello(mod, rt2, token2, inv2, keyPair(true));
    /* The relay refuses a token hello that binds no key and spends nothing (plant:S3-unbound). The client line is what
       stops the hello being sent; lifting it sends the hello, and a later hello that does bind still comes online. */
    return a.sessions >= 1 && a.used === false && b.online === true && b.used === true
      && a.said.some(l => l.indexOf(B.REASONS["bad-signature"]) >= 0);
  });
  check(bindPlant.turned && bindPlant.back,
    "969b lifting plant:invite-bind sends the unbound hello, the relay refuses it and the token stays unspent, and the product file is never written: "
    + bindPlant.detail + ", sha " + (bindPlant.back ? "restored" : "differs"));
  const rt3 = await relayTeam(), token3 = hex(32), inv3 = hex(16);
  await registerInvite(rt3, inv3, token3);
  const first = await tokenHello(C, rt3, token3, inv3, keyPair(true));
  const again = await tokenHello(C, rt3, token3, inv3, keyPair(true));
  const saidNew = again.said.some(l => l.indexOf(INVITE_USED_NEW) >= 0);
  check(first.online === true && saidNew,
    "969c a second key is told the invitation was already used: first online " + first.online + ", said " + JSON.stringify(again.said));
  const saidPlant = await liftChannel("plant:invite-used", async mod => {
    const rt4 = await relayTeam(), token4 = hex(32), inv4 = hex(16);
    await registerInvite(rt4, inv4, token4);
    await tokenHello(mod, rt4, token4, inv4, keyPair(true));
    const b = await tokenHello(mod, rt4, token4, inv4, keyPair(true));
    return b.said.some(l => l.indexOf(INVITE_USED_OLD) >= 0) && !b.said.some(l => l.indexOf(INVITE_USED_NEW) >= 0);
  });
  check(saidPlant.turned && saidPlant.back,
    "969d lifting plant:invite-used says the old sentence, and the product file is never written: "
    + saidPlant.detail + ", sha " + (saidPlant.back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the legs 969a): " + (e && e.stack ? e.stack : e));
}

/* ---- slice 3, item 3: a token hello the relay ends is said as expired, and the token stays unspent. ---- */
const INVITE_ENDED_NEW = "This invitation has expired. Ask your lead for a new one.";
const INVITE_ENDED_OLD = "The relay answered 403.";
async function endedHello(mod) {
  const rt = await relayTeam(), token = hex(32), inv = hex(16);
  await registerInvite(rt, inv, token);
  const who = keyPair(true), said = [], tag = hex(4);
  const deskT = transport("end-" + tag);
  const desk = opened(mod, "end-" + tag, { rt: rt, id: "t-" + hex(8) }, who, "desk:" + who.keyId, {
    invite: () => ({ inv: inv, token: token, seal: crypto.randomBytes(32) }),
    say: l => said.push(l),
    connect: deskT.connect,
    request: async (m, u, h, b) => {
      if (m === "POST" && /\/session$/.test(String(u))) {
        let body = null;
        try { body = JSON.parse(Buffer.from(b || "").toString("utf8")); } catch { body = null; }
        if (body && typeof body.invite === "string") {
          return { status: 403, header: () => null, bytes: Buffer.from(JSON.stringify({ error: "invite-ended" })) };
        }
      }
      return deskT.request(m, u, h, b);
    },
  });
  desk.ch.start();
  await desk.ch.idle();
  const used = desk.prog.state().tokenUsed === true;
  await desk.ch.stop();
  const later = await tokenHello(mod, rt, token, inv, keyPair(true));
  return { used: used, said: said, laterOnline: later.online === true, laterUsed: later.used === true };
}
try {
  const ended = await endedHello(C);
  const saidNew = ended.said.some(l => l.indexOf(INVITE_ENDED_NEW) >= 0);
  check(ended.used === false && saidNew && ended.laterOnline && ended.laterUsed,
    "963a a token hello the relay ends is said as expired, the token stays unspent, and a later hello spends it: "
    + "used " + ended.used + ", said " + JSON.stringify(ended.said) + ", later online " + ended.laterOnline
    + ", later used " + ended.laterUsed);
  const endedPlant = await liftChannel("plant:invite-ended", async mod => {
    const x = await endedHello(mod);
    /* The reason table carries the same sentence as the special return, so lifting the line does not bring the old
       403 wording back. The token still stays unspent and a later hello still spends it. */
    return x.used === false && x.laterOnline && x.laterUsed
      && x.said.some(l => l.indexOf(INVITE_ENDED_NEW) >= 0) && !x.said.some(l => l.indexOf(INVITE_ENDED_OLD) >= 0);
  });
  check(endedPlant.turned && endedPlant.back,
    "963b lifting plant:invite-ended still says the invitation has expired, because the reason table carries that sentence, and the product file is never written: "
    + endedPlant.detail + ", sha " + (endedPlant.back ? "restored" : "differs"));
} catch (e) {
  check(false, "harness (the legs 963a): " + (e && e.stack ? e.stack : e));
}

/* ---- the harness through the product, relay step 3's relay and this channel layer, on the routine chain ---- */
{
  const r = spawnSync(process.execPath, [path.join("relay", "test", "attacks.mjs")], { cwd: ROOT, encoding: "utf8",
    env: Object.assign({}, process.env, { RELAY_TARGET: path.join("relay", "test", "targets", "product.cjs") }), timeout: 300000 });
  /* Slice 2 on the real channel, the same list as relay-unit 16a. Empty once each attack is green; a listed id that
     passes, or a failure that is not listed, reddens this check. */
  const SLICE2_OPEN = [];
  const lines = (r.stdout || "").split(/\r?\n/);
  const m = /^#counts ok=(\d+) fail=(\d+)$/m.exec(r.stdout || "");
  const ok = m ? Number(m[1]) : -1, bad = m ? Number(m[2]) : -1;
  const failIds = lines.filter(l => l.startsWith("FAIL ")).map(l => l.slice(5).split(" ")[0]);
  const okIds = lines.filter(l => l.startsWith("ok ")).map(l => l.slice(3).split(" ")[0]);
  const want = SLICE2_OPEN.slice().sort(), got = failIds.slice().sort();
  const same = got.length === want.length && got.every((id, i) => id === want[i]);
  const listedOk = okIds.filter(id => SLICE2_OPEN.indexOf(id) !== -1);
  const complete = !!m && ok >= 79 && ok === okIds.length && bad === failIds.length && r.status === bad && listedOk.length === 0;
  const missing = want.filter(id => got.indexOf(id) === -1), extra = got.filter(id => SLICE2_OPEN.indexOf(id) === -1);
  check(same && complete, "943a the harness through the product, relay/test/attacks.mjs with relay/test/targets/product.cjs: "
    + ok + " ok, " + bad + " failed, exit " + r.status + (same && SLICE2_OPEN.length ? ", open " + SLICE2_OPEN.join(" ") : "")
    + (missing.length ? ", missing " + missing.join(" ") : "") + (extra.length ? ", extra " + extra.join(" ") : "")
    + (listedOk.length ? ", listed-but-ok " + listedOk.join(" ") : ""));
}
{
  const changed = [];
  for (const [rel, digest] of initialDigests.entries()) {
    try {
      if (sha(fs.readFileSync(path.join(ROOT, rel))) !== digest) changed.push(rel);
    } catch {
      changed.push(rel);
    }
  }
  check(productWrites.length === 0 && changed.length === 0, "943b no leg wrote a product file: " + productWrites.length + " write(s) into the repository" + (productWrites.length ? " (" + [...new Set(productWrites)].join(" ") + ")" : "") + ", and every file under shell/relay/, shell/main.js and src/modules/settings.js ends with the sha256 it began with" + (changed.length ? "; changed: " + changed.join(" ") : ""));
}
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
