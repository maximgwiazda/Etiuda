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
 * other team's head is dropped and said. A folder team shows nothing new. Throwaway keys and invented words only;
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
const EXPECTED = 104;

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
    const made = await admin("POST", "/relay/v1/teams", { rt, lead: { keyId: LEAD.keyId, pub: LEAD.pub }, t: R.clock.now,
      sig: signHex(LEAD, core.createBytes(rt, LEAD.keyId, R.clock.now)) });
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

  /* A refusal that can never lift still stops the file, says so, and holds across a restart. */
  const STOP = ["outside-place", "bad-path", "bad-signature", "blob-size"];
  const stops = [];
  for (const reason of STOP) {
    const r = await cycles("f4-stop-" + reason, [refusal(reason), TAKEN], { cycles: 2, restart: true });
    stops.push({ reason, ok: r.after[0].stopped && r.puts === 1 && !r.sent && !r.owed && r.waits === 0
      && r.said.some(l => l === FREL + " was not sent: " + B.REASONS[reason]), puts: r.puts });
  }
  check(stops.every(s => s.ok),
    "946c a refusal that can never lift still stops that file, says so, and holds across a restart, the same bytes never sent again: "
    + stops.map(s => s.reason + " " + (s.ok ? "stopped" : "puts " + s.puts)).join("; "));

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
    const made = await admin("POST", "/relay/v1/teams", { rt, lead: { keyId: LEAD.keyId, pub: LEAD.pub }, t: R.clock.now,
      sig: signHex(LEAD, core.createBytes(rt, LEAD.keyId, R.clock.now)) });
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
          fs.writeFileSync(src, lines.join("\n"));
          const resolved = nodeRequire.resolve(src);
          delete nodeRequire.cache[resolved];
          const lifted = nodeRequire(src);
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
      } finally {
        fs.writeFileSync(src, before);
        try { delete nodeRequire.cache[nodeRequire.resolve(src)]; nodeRequire(src); } catch { /* the copy this suite holds is untouched */ }
      }
      const back = sha(fs.readFileSync(src)) === digest;
      check(turned && back, "948g lifting plant:head-sig lets a forged head through, and the file is put back: " + detail + ", sha " + (back ? "restored" : "differs"));
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
          fs.writeFileSync(src, lines.join("\n"));
          const SET2 = await import(pathToFileURL(src).href + "?plant=" + Date.now());
          pageMod.ST.lsSet("eUiLang", "en");
          const html = shownText(SET2.settingsBodyHtml());
          turned = html.indexOf("Newest edition Quay three") < 0;
          detail = turned ? "the sentence is gone" : "the sentence is still there";
        }
      } catch (e) {
        detail = e && e.message ? e.message : String(e);
      } finally {
        fs.writeFileSync(src, before);
      }
      const back = sha(fs.readFileSync(src)) === digest;
      check(turned && back, "948h lifting plant:head-show drops the sentence, and the file is put back: " + detail + ", sha " + (back ? "restored" : "differs"));
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
    const made4 = await admin("POST", "/relay/v1/teams", { rt: RT4, lead: { keyId: LEAD.keyId, pub: LEAD.pub }, t: R.clock.now,
      sig: signHex(LEAD, core.createBytes(RT4, LEAD.keyId, R.clock.now)) });
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
          fs.writeFileSync(src, lines.join("\n"));
          const resolved = nodeRequire.resolve(src);
          delete nodeRequire.cache[resolved];
          const lifted = nodeRequire(src);
          const lateTaken = x => !!(x && x.loadedOld.ok === true && x.loadedNew.ok === true && x.before.ok === true
            && x.stayR.ok === true && x.stayBody === "kept-on" && x.late.ok === true && x.goneBody === "late-after");
          const plantedBlob = epochRoute(lifted, "plant-blob"), plantedDesk = epochRoute(lifted, "plant-desk");
          turned = lateTaken(plantedBlob) && lateTaken(plantedDesk);
          detail = "acceptBlob " + routeLine(plantedBlob) + "; catch-up " + routeLine(plantedDesk);
        }
      } catch (e) {
        detail = e && e.message ? e.message : String(e);
      } finally {
        fs.writeFileSync(src, beforeBytes);
        try { delete nodeRequire.cache[nodeRequire.resolve(src)]; nodeRequire(src); } catch { /* the copy this suite holds is untouched */ }
      }
      const back = sha(fs.readFileSync(src)) === digest;
      check(turned && back, "944s lifting plant:fk1-removed accepts the dropped desk's new file sealed at the old epoch, and the file is put back: "
        + detail + ", sha " + (back ? "restored" : "differs"));
    }
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
        fs.writeFileSync(src, lines.join("\n"));
        const resolved = nodeRequire.resolve(src);
        delete nodeRequire.cache[resolved];
        turned = fn(nodeRequire(src));
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) {
      detail = e && e.message ? e.message : String(e);
    } finally {
      fs.writeFileSync(src, beforeBytes);
      try { delete nodeRequire.cache[nodeRequire.resolve(src)]; nodeRequire(src); } catch { /* the copy this suite holds is untouched */ }
    }
    return { turned, back: sha(fs.readFileSync(src)) === digest, detail };
  }
  const countPlant = liftPlant("plant:s2-count", mod => {
    const x = counted(mod);
    return x.loaded.ok === true && x.r.ok === true && x.r.deskId === x.other && x.r.keyId === x.signer;
  });
  check(countPlant.turned && countPlant.back, "944u lifting plant:s2-count counts the file under the place the blob carries, and the file is put back: "
    + countPlant.detail + ", sha " + (countPlant.back ? "restored" : "differs"));
  const removePlant = liftPlant("plant:s2-remove", mod => {
    const x = sameEpoch(mod);
    return x.loaded1.ok === true && x.before.ok === true && x.after.ok === false && x.after.reason === "not-roster"
      && x.goneBody === "before" && x.stray.reason === "not-roster";
  });
  check(removePlant.turned && removePlant.back, "944w lifting plant:s2-remove leaves the dropped desk's file not-roster, and the file is put back: "
    + removePlant.detail + ", sha " + (removePlant.back ? "restored" : "differs"));
  const parkPlant = liftPlant("plant:pending-roster", mod => {
    const x = parkArm(mod, "member");
    return x.loaded && x.pending === 1000 && x.junk === 1000 && x.honest === false;
  });
  check(parkPlant.turned && parkPlant.back, "951h lifting plant:pending-roster lets a thousand blobs past the lead's epoch fill pending and push the"
    + " honest wait out, and the file is put back: " + parkPlant.detail + ", sha " + (parkPlant.back ? "restored" : "differs"));
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
    const at = lines.findIndex(l => l.indexOf(tag) >= 0);
    if (at >= 0) {
      lines.splice(at, 1);
      fs.writeFileSync(src, lines.join("\n"));
      const resolved = nodeRequire.resolve(src);
      delete nodeRequire.cache[resolved];
      turned = await fn(nodeRequire(src));
      detail = turned ? "the check lifted" : "the check still held";
    }
  } catch (e) {
    detail = e && e.stack ? e.stack : String(e);
  } finally {
    fs.writeFileSync(src, beforeBytes);
    try { delete nodeRequire.cache[nodeRequire.resolve(src)]; nodeRequire(src); } catch { /* the copy this suite holds is untouched */ }
  }
  return { turned, back: sha(fs.readFileSync(src)) === digest, detail };
}
function relayStore(rt) { return R.stores.get(rt); }
function blobsOn(rt, writer) {
  return relayStore(rt).dump().map(([k, v]) => [k, JSON.parse(v)]).filter(([k, v]) => k.startsWith("blob:") && v.writer === writer).map(([, v]) => v);
}
async function freshTeam(keys) {
  const rt = hex(16), id = "t-" + hex(8);
  const made = await admin("POST", "/relay/v1/teams", { rt, lead: { keyId: LEAD.keyId, pub: LEAD.pub }, t: R.clock.now,
    sig: signHex(LEAD, core.createBytes(rt, LEAD.keyId, R.clock.now)) });
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
  check(planted.turned && planted.back, "952b lifting plant:stale-epoch writes the withheld epoch-1 bytes over the epoch-2 edition, and the file is put back: "
    + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
} catch (e) {
  check(false, "952a harness: " + (e && e.stack ? e.stack : e));
}

/* ---- an edit of this program's own file, one cycle (S2). The catch-up skips what this desk, or the lead, just sent,
   so the cycle that the edit starts does not write the older bytes back over it. Three cycles would hide the loss:
   the second would consume the program's own blob before the edit. ---- */
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
  const planted = await liftChannel("plant:own-skip", async mod => {
    const x = await keptEdit(mod);
    return x.deskMirror === "v1\n" && x.leadOfDesk === "v1\n" && x.deskSent === 0
      && x.leadMirror === "e1\n" && x.deskOfLead === "e1\n" && x.leadSent === 0;
  });
  check(planted.turned && planted.back, "953c lifting plant:own-skip writes the sent copy over the edit, on the desk and on the lead, and the file is put back: "
    + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
} catch (e) {
  check(false, "953a harness: " + (e && e.stack ? e.stack : e));
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
  check(planted.turned && planted.back, "954b lifting plant:invite-join lets the other file spend the invitation's one upload, and the file is put back: "
    + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
} catch (e) {
  check(false, "954a harness: " + (e && e.stack ? e.stack : e));
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
  check(planted.turned && planted.back, "955b lifting plant:token-kept marks the token used on the 500, so the next try never sends it, and the file is put back: "
    + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
} catch (e) {
  check(false, "955a harness: " + (e && e.stack ? e.stack : e));
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
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
