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
 * rest (970a), two programs holding one key apply each other's uploads (970b), a recorded upload is not fetched in the
 * cycle that lists it (970c), and an own blob that is fetched does not overwrite an edit waiting to go up (970d, 970e)
 * and, older than the last sent, changes nothing (970f). A clock behind the relay still uploads once a superseded own
 * blob has raised the counter (970o). An answer the list does not serve can raise the same floor, and a second program
 * whose clock never reaches that counter stays refused: the known limit until the relay names the floor (970r).
 * The lead's own channel takes, inside the relay's grace for a removed desk, what that desk sealed before the lead held the
 * roster that leaves it off, and refuses removed what it sealed after or what comes past the grace (1165a to 1165d); a desk clock
 * running a few minutes ahead still has its last file before the removal taken (1165h). The grace adds and never replaces: a
 * file the lead held before the removal stays as it was, and a new path lands (1165j, 1165k).
 * A replay-counter refusal is tried again within a minute, an outbox file (970s) and an invitation's answer (970u). An invitation
 * upload whose reply was lost is counted as sent when the retry is
 * refused token-spent (966f), under the id the relay holds as asked however many replies were lost, so Cancel's withdrawal
 * is admitted (966h). A desk on a relay team past its grant is told each step of the lapse once, with its dates, in a
 * notice and on the team's row in Settings: working past the grant's end, read-only, a trial's team stopped and the relay's
 * copy removed; a team inside its grant shows nothing, and no step removes anything from the desk (978). Throwaway keys and
 * invented words only;
 * nothing contacts a host.
 *
 *     node tests/relay-channel.mjs     exit code is the number of failed checks, capped at 63; 78 where it did not complete
 *
 * The shell runs from a copy of shell/ in a temp folder, as tests/rollback-floor.mjs runs it. The window variable is never
 * set. ETIUDA_TEST_OFFSCREEN is 1, so a desk that opens its window is placed aside and never shown.
 * Machine policy is the stand-in in tests/reg-stand.cjs, set to none.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});
process.env.ETIUDA_TEST_OFFSCREEN = "1";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLab } from "./lab-owner.mjs";
import { createSeatLab, createSigninGuard } from "./seat-lab.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
/* Machine policy is none, but for 942h, which names a folder for the one desk it loads. */
const regOpts = { policy: null };
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"), regOpts);
const EXPECTED = 578 - 18 + 3 - 2 + 1; /* fold 129: 533 at the merge base + 45 (fold 128's join link key, and the channel's no older replace, same and cross epoch) - 18 retired with the folder team + 3 asserted again on a relay team (P4's own count, its line in d8d8a5ae) - 2 retired with the check code and the folder invitation (P2: 964b, 923e) + 1 asserted again on a relay team (P1: 939f, the lead's folder-channel team file refused; 939g keeps its place) */

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) {
  skipped++;
  console.log("  SKIP  " + line);
}
/* A check that held what a folder team did, retired with it: its fixtures still run, its answer is not asked, and EXPECTED is without it.
   Each is named in the comment above it, with why. */
let retired = 0;
function retire(ok, line) {
  retired++;
  console.log("  RETIRED " + line);
}
function markPart(id) {
  if (globalThis.__rcPart) console.log("#part " + globalThis.__rcPart.id + " " + (Date.now() - globalThis.__rcPart.t));
  globalThis.__rcPart = id ? { id: id, t: Date.now() } : null;
}
/* One part, or several separated by commas. Empty runs every part, which is the release run. */
const ONLY = new Set(String(process.env.RELAY_CHANNEL_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean));
const DESK_PARTS = new Set(["pDesk", "pLeadKey", "p962s5", "p962s6", "p944g", "p921", "p961re", "p978", "p989d", "p932m", "p939", "p987"]);
function partOn(id) {
  return ONLY.size === 0 || ONLY.has(id);
}
function deskOn() {
  if (ONLY.size === 0) return true;
  for (const id of ONLY) if (DESK_PARTS.has(id)) return true;
  return false;
}
/* A narrowed run can await a stop while nothing else holds the loop (the relay-studio stop). */
const onlyHold = ONLY.size ? setInterval(() => {}, 1000) : null;
function releaseOnlyHold() {
  if (onlyHold) clearInterval(onlyHold);
}

const LAB = createLab("etiuda-relay-channel-", {
  keepEnv: "ETIUDA_RELAY_CHANNEL_KEEP",
  stopEnv: "ETIUDA_RELAY_CHANNEL_STOP",
});
const URLV1 = "https://relay.test/relay/v1";
const hex = n => crypto.randomBytes(n).toString("hex");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const SPKI = Buffer.from("302a300506032b6570032100", "hex");

const productWrites = [];
const legSigninWrites = [];
const shellSigninWrites = [];
const isInside = (dir, target) => {
  const rel = path.relative(dir, path.resolve(target));
  return !rel.startsWith("..") && !path.isAbsolute(rel);
};
const signinGuard = createSigninGuard({
  dirs: [LAB, ROOT],
  labelRoot: LAB,
  onWrite(resolved) {
    const inRoot = isInside(ROOT, resolved);
    const inLab = isInside(LAB, resolved);
    const inTmp = !isInside(os.tmpdir(), ROOT) && isInside(os.tmpdir(), resolved);
    if (inRoot && !inLab && !inTmp) {
      productWrites.push(path.relative(ROOT, resolved).replace(/\\/g, "/"));
    }
  },
});

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
  const end = Date.now() + (ms || 30000);
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

let C = null, B = null, S = null, W = null, core = null, K = null, teamMod = null;
try {
  C = nodeRequire(path.join(ROOT, "shell", "relay", "channel.cjs"));
  B = nodeRequire(path.join(ROOT, "shell", "relay", "blob.cjs"));
  core = nodeRequire(path.join(ROOT, "relay", "core.cjs"));
  teamMod = nodeRequire(path.join(ROOT, "relay", "team.cjs"));
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
  const out = { status: res.status, json: JSON.parse(Buffer.from(await res.arrayBuffer()).toString("utf8") || "null") };
  /* This file makes far more than 25 teams with one lead key, and it never sweeps them. The product counts live teams
     per key. Giving the place back leaves the team where it is. It only stops this file's own creates filling the list. */
  if (teamMod && method === "POST" && p === "/relay/v1/teams" && out.status === 200 && json && json.lead && typeof json.rt === "string")
    await R.object("lead:" + json.lead.keyId).fetch(teamMod.leadRequest({ op: "release", rt: json.rt }));
  return out;
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
  return headWith(team, t, [{ catalog: "quay-board", rev: 2, edition: edition, published: published }]);
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

const seatFor = (who, now) => K.certFor(who.pub, hex(16), Math.max(1, now != null ? now : R.clock.now), core.CERT_SPAN_MS);
/* A program over the relay: the lead's (place root) or a desk's (place desk:<id>), its mirror and record in the lab. */
function program(name, who, place, o) {
  const x = o || {};
  const t = transport(name), said = [], written = [];
  const mirror = path.join(LAB, name);
  const ch = (x.mod || C).createChannel(Object.assign({
    rt: RT, url: URLV1, mirror, stateFile: path.join(LAB, name + ".json"),
    pin: () => PIN,
    me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place }),
    keyFor: e => (e === 1 ? K1 : null), sealEpoch: () => 1,
    request: t.request, connect: t.connect, pollMs: 1e9,
    write: (f, text) => { if (!f.endsWith(".json") || f.startsWith(mirror + path.sep)) written.push(path.relative(mirror, f).split(path.sep).join("/")); C.writeWhole(f, text); },
    say: l => said.push(l),
  }, who && who.keyId !== LEAD.keyId ? { seat: () => seatFor(who) } : {}, x));
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

if (partOn("p940")) {
  try {
    markPart("p940");
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
        Buffer.from(JSON.stringify({ challenge: ch, key: who.keyId, pub: who.pub, sig: signHex(who, C.helloBytes(RT, ch, who.keyId)), seat: seatFor(who) })));
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
    const eachSent = await until(() => idsBy(OTHER.keyId).length > eachBefore, 30000);
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
      await until(async () => { j9.ch.kick(); await j9.ch.idle(); return puts >= 1; }, 30000);
      const strandedFirst = read(lead2.mirror, rel9) === null;
      if (quits) {
        await j9.ch.stop();
        j9 = program(name9, J9, "desk:" + J9.keyId, opts9);
        j9.ch.start();
      }
      const atLead = await until(async () => { await settle(j9); await settle(lead2); return read(lead2.mirror, rel9) === body9; }, 30000);
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
if (partOn("p944")) {
  try {
    markPart("p944");
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
}

/* ---- a refusal that lifts never stops a file (F4 of the slice 1 review): the test architect's f4 reproduction is 946a and
   946b, its control 946A. A desk's channel over a stand-in relay that answers each of its uploads as the leg says. ---- */
if (partOn("p946")) {
  try {
    markPart("p946");
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
      const make = () => (x.chan || C).createChannel({ rt: FRT, url: URLV1, mirror, stateFile, watch: false, pollMs: 1e9, pin: () => FPIN, room: x.room,
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

    /* A room hook that throws, the caller's fault, costs no file: the flush goes on to every file owed, as the channel treats its
       other hooks. Its plant, the hook called bare in a copy of the channel, leaves the files after the first unsent. */
    const roomThrows = async chan => {
      const r = await cycles(chan ? "f4-room-bare" : "f4-room-throws", [TAKEN], { cycles: 1, files: FIVE, chan,
        room: () => { throw new Error("a caller's hook that throws"); } }).catch(e => ({ error: e && e.message }));
      return r.error ? r : { puts: r.puts, sent: Object.keys(FIVE).filter(rel => r.st.sent[rel]).length };
    };
    const rooms = await roomThrows(null);
    check(rooms.puts === 5 && rooms.sent === 5, "946f a room hook that throws aborts nothing: one flush sends all five owed files: " + JSON.stringify(rooms));
    if (PLANTS_OFF) skip("946F the room hook called bare in a copy of the channel leaves files unsent");
    else {
      const text = fs.readFileSync(path.join(ROOT, "shell", "relay", "channel.cjs"), "utf8");
      const from = "const room = typeof o.room === \"function\" ? r => { try { o.room(r); } catch { /* the caller's own fault */ } } : () => {}; /* plant:room-wrapped */";
      let bare = { error: "the plant's anchor is absent" };
      if (text.split(from).length === 2) {
        const dir = path.join(LAB, "room-plant");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "channel.cjs"), text.split(from).join("const room = typeof o.room === \"function\" ? o.room : () => {};"));
        fs.copyFileSync(path.join(ROOT, "shell", "relay", "blob.cjs"), path.join(dir, "blob.cjs"));
        bare = await roomThrows(nodeRequire(path.join(dir, "channel.cjs")));
      }
      check(!!bare.error || (bare.sent < 5), "946F the room hook called bare in a copy of the channel leaves files unsent: " + JSON.stringify(bare));
    }

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
      const ch = mod.createChannel(Object.assign({
        rt, url: URLV1, mirror, stateFile, watch: false, pollMs: 1e9, pin: () => pin,
        me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place }),
        keyFor: e => (e === 1 ? key : null), sealEpoch: () => 1,
        request, connect: () => null, say: l => said.push(l),
      }, who.keyId !== LEAD.keyId ? { seat: () => seatFor(who) } : {}));
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

if (partOn("p919")) {
  try {
    markPart("p919");
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
}

/* ---- a blob the relay could not serve for a reason that can pass is fetched again (N6(3) of the review of F6, F4 and F9,
   the receive-side twin of F4): the test architect's probe is 947a, its control 947A. Only an answer that the blob is gone
   lets it go (947c). A lead's three files over the relay as built; a desk whose transport answers one fetch as the leg says. ---- */
if (partOn("p947")) {
  try {
    markPart("p947");
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
}

/* ---- the desk's half: shell/main.js loaded in bare node, its relay reached through the same in-memory relay ---- */
if (deskOn()) try {
  markPart("pDesk");
  if (!W) throw new Error("no relay to drive");
  const APP = path.join(LAB, "app");
  fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
  const SRC = fs.readFileSync(path.join(APP, "shell", "main.js"), "utf8");
  const EXPOSE = ["sealCatalog", "wrapTeamKey", "readCatalog", "catalogFolder", "relayRun", "relayHere", "heedTeam", "relayProbe", "relayProbeNext",
    "readSpanText", "spanDocument", "spanGenuine", "pinnedLead", "createWindow", "folderSyncerRun",
    "signedSha", "catalogDocIn", "noteHanded", "writeInUse", "inUseCatalogId", "pickEdition", "catalogRead", "acceptLink"];
  const noop = () => {};
  const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
  /* Chromium with no proxy configured answers DIRECT, so a desk's socket goes straight to the relay: proxy-net treats a lookup
     that answers nothing as no route at all (review 7 finding 2), so the desk shells below take this session, not inert. */
  const directSession = { defaultSession: new Proxy({ resolveProxy: () => Promise.resolve("DIRECT") }, { get: (t, k) => (k in t ? t[k] : inert) }) };
  const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
  const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });
  let deskTransport = transport("main");
  /* What each desk fetch to a relay asked of Chromium beside its bytes: 942i holds that none sends the session's credentials. */
  const deskInits = [];
  const noteInit = (url, init) => { if (String(url).indexOf("/relay/v1/") >= 0) deskInits.push({ url: String(url), credentials: init ? init.credentials : undefined }); };
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
  const seatLab = createSeatLab({
    labDir: LAB,
    rootKey: K.ROOT,
    signer: K.DELEGATE,
    clock: () => R.clock.now,
  });
  /* The second argument is either the shell source to load in place of SRC (a plant) or hooks (a fetch stand-in, or `app`:
     a copy of shell/ to load from, as a planted channel needs). */
  async function loadDesk(ud, arg) {
    const hooks = arg && typeof arg === "object" ? arg : null;
    const clockNow = () => (hooks && typeof hooks.clock === "function" ? hooks.clock() : R.clock.now);
    const source = typeof arg === "string" ? arg : hooks && typeof hooks.source === "string" ? hooks.source : SRC;
    const shellDir = hooks && typeof hooks.app === "string" ? hooks.app : path.join(APP, "shell");
    const said = [], on = {}, invoke = {};
    const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop, info: noop };
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
      decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
    };
    const net = { fetch: (url, init) => {
      const lab = seatLab.labFetch(url, init, clockNow());
      if (lab) return lab;
      deskTransport.log.push((init && init.method) + " " + url);
      noteInit(url, init);
      if (deskTransport.down) return Promise.reject(new Error("down"));
      if (hooks && typeof hooks.fetch === "function") { const alt = hooks.fetch(url, init); if (alt) return alt; }
      return relayFetch(url, init);
    } };
    const electron = {
      app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
        getVersion: () => "0.0.0", whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
      ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
      BrowserWindow: inert, Menu: inert, dialog: inert, net, protocol: inert, session: directSession, shell: seatLab.labShell(),
      screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage, powerMonitor: inert,
    };
    process.env.XDG_CURRENT_DESKTOP = "GNOME";
    const api = seatLab.withSigninLab(() => new Function("require", "__dirname", "__filename", "module", "exports", "console",
      source + "\nreturn { " + EXPOSE.join(", ") + " };")(
      n => (n === "electron" ? electron : (n === "node:fs" || n === "fs") ? signinGuard.shellFs : nodeRequire(n)),
      shellDir, path.join(shellDir, "main.js"), { exports: {} }, {}, quiet));
    const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
    const sync = (ch, ...args) => { const ev = eventFor(); if (on[ch]) on[ch](ev, ...args); return ev.returnValue; };
    const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
    const desk = { api, ask, sync, said, ud, envelope };
    await seatLab.seatDesk(desk);
    return desk;
  }
  const newDesk = async (name, folder, hooks) => {
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
  const D = await newDesk("main-desk", path.join(LAB, "main-share"));
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
  const sent = await until(async () => { await studio.kick(); await studio.idle(); return !!read(studioMirror, joinRel); }, 30000);
  check(!!offer && offer.offer && offer.offer.relay === "relay.test" && !taken.refused && folderNow === mirror && sent
    && read(mirror, C.TEAM_NAME) === read(studioMirror, C.TEAM_NAME),
    "942a a desk takes a relay invitation: its team folder is the mirror, it reads the team file sealed for that invitation, and its"
    + " request reaches the lead's mirror as its one invitation upload: folder " + (folderNow === mirror ? "the mirror" : folderNow)
    + ", request " + (sent ? "at the lead" : "missing") + (taken.refused ? ", refused " + taken.refused : ""));
  const omitted = deskInits.filter(x => x.credentials === "omit").length;
  check(deskInits.length > 0 && omitted === deskInits.length,
    "942i every fetch the desk made to the relay omits the session's credentials: " + omitted + " of " + deskInits.length);
  if (PLANTS_OFF) skip("942j lifting plant:relay-credentials sends a relay fetch that does not omit credentials");
  else {
    const lift = await liftDesk("plant:relay-credentials", async (next) => {
      const from = deskInits.length;
      const inv = await relayInviteOn(RT2, TEAM2);
      fs.mkdirSync(path.join(LAB, "cred-plant-share"), { recursive: true });
      const P = await newDesk("cred-plant", path.join(LAB, "cred-plant-share"), { source: next });
      await P.ask("etiuda:team-join", "invite", inv.text, "Desk Ten", codeOf(inv.secret));
      const got = deskInits.slice(from);
      return got.length > 0 && got.some(x => x.credentials !== "omit");
    });
    check(lift.turned && lift.back, "942j lifting plant:relay-credentials sends a relay fetch that does not omit credentials: " + lift.detail
      + (lift.back ? "" : ", shell/main.js changed on disk"));
  }

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
    const net = { fetch: (url, init) => { deskTransport.log.push(init.method + " " + url); noteInit(url, init); if (deskTransport.down) return Promise.reject(new Error("down")); return relayFetch(url, init); } };
    const electron = {
      app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
        getVersion: () => "0.0.0", whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
      ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
      BrowserWindow: inert, Menu: inert, dialog: inert, net, protocol: inert, session: directSession, shell: inert,
      screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage, powerMonitor: inert,
    };
    const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
      text + "\nreturn { " + EXPOSE.join(", ") + " };")(
      n => (n === "electron" ? electron : (n === "node:fs" || n === "fs") ? signinGuard.shellFs : nodeRequire(n)),
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
  let RTW, TEAMW, KW, URLW, teamDocW, studioWMirror, invitesW, studioW;
  if (partOn("pDesk")) {
  const quietInvite = await relayInviteOn(RT2, TEAM2);

  
  const Dq = await newDesk("join-quiet", path.join(LAB, "join-quiet-share"));

  
  fs.mkdirSync(path.join(LAB, "join-quiet-share"), { recursive: true });

  
  const beforeRead = deskTransport.log.length;

  
  const readQ = await Dq.ask("etiuda:team-join", "read", quietInvite.text);

  
  const readCalls = deskTransport.log.length - beforeRead;

  
  const laterQ = await tokenHello(C, RT2, quietInvite.token, quietInvite.inv, keyPair(true));

  
  const yesInvite = await relayInviteOn(RT2, TEAM2);

  
  const Dy = await newDesk("join-yes", path.join(LAB, "join-yes-share"));

  
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

  
  /* RETIRED, P2 (no check code is asked of a yes): 964b, "lifting plant:relay-code refuses a relay yes that carries no check code, and the product file is never written". The shell has no check code and names no refusal for one (tests/folder-join-gone.mjs fjg2), and the plant left with the line it lifted. 964a above holds that yes asks for none. */
  retire(true, "964b lifting plant:relay-code refuses a relay yes that carries no check code, and the product file is never written");


  /* Slice 3, item 5: the wrap's team key reads a catalog before the lead admits this desk, on its own relay team so the
     admission above still meets edition 1. This tree's relay has no wrap route; the stand-in below answers only this desk. */
  
  RTW = hex(16), TEAMW = "t-" + hex(8), KW = crypto.randomBytes(32), URLW = URLV1;

  
  const madeW = await admin("POST", "/relay/v1/teams", createBody(RTW, R.clock.now));

  
  if (madeW.status !== 200) throw new Error("the wrap team was not made: " + JSON.stringify(madeW.json));

  
  teamDocW = (rev, roster) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: TEAMW, catalogs: ["quay-board"],
      lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev: rev,
      channel: { kind: "relay", rt: RTW, url: URLW }, ring: RING, roster: roster || [] }, LEAD), null, 1) + "\n";

  
  studioWMirror = path.join(LAB, "wrap-studio");

  
  invitesW = [];

  
  const studioWT = transport("wrap-studio");

  
  studioW = C.createChannel({ rt: RTW, url: URLW, mirror: studioWMirror, stateFile: path.join(LAB, "wrap-studio.json"),
      pin: () => ({ teamId: TEAMW, rt: RTW, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
      me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }),
      keyFor: e => (e === 1 ? KW : null), sealEpoch: () => 1, inviteKeys: () => invitesW,
      request: studioWT.request, connect: studioWT.connect, pollMs: 1e9 });

  
  put(studioWMirror, "board.ec", JSON.stringify(D.api.sealCatalog(KW, TEAMW, 1, catalogText(1))));

  
  put(studioWMirror, C.TEAM_NAME, teamDocW(1));

  
  studioW.start();

  
  await studioW.idle();
  }
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
  async function deskOnWrap(name, wrap) {
    const folder = path.join(LAB, name + "-share");
    fs.mkdirSync(folder, { recursive: true });
    return newDesk(name, folder, { fetch: (url, init) => (init && init.method === "GET" && String(url).endsWith("/wrap")
      ? new Response(Buffer.from(JSON.stringify({ wrap: wrap }), "utf8"), { status: 200, headers: { "content-type": "application/json" } })
      : null) });
  }
  if (partOn("pDesk")) {
  const invA = await inviteOnW(1);

  
  const markA = deskTransport.log.length;

  
  const Dw = await deskOnWrap("wrap-read", invA.wrap);

  
  const takenA = await Dw.ask("etiuda:team-join", "invite", invA.text, "Desk Nine", "");

  
  const meA = await Dw.ask("etiuda:branch-identity", false);

  
  const joinA = "desks/" + meA.id + "/join.json";

  
  const mirrorA = path.join(Dw.ud, "relay", RTW);

  
  const readNow = await until(async () => {
      const ch = Dw.api.relayRun();
      if (ch) { ch.kick(); await ch.idle(); }
      return factsOf(Dw.api.readCatalog() || "") === 1;
    }, 30000);

  
  let atLead = false, later = false, still = false;

  
  if (readNow) {
      atLead = await until(async () => { await studioW.kick(); await studioW.idle(); return !!read(studioWMirror, joinA); }, 30000);
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

  
  const De = await deskOnWrap("wrap-epoch", invE.wrap);

  
  const takenE = await De.ask("etiuda:team-join", "invite", invE.text, "Desk Nine", "");

  
  const saidEpoch = await until(async () => {
      const ch = De.api.relayRun();
      if (ch) { ch.kick(); await ch.idle(); }
      return De.said.some(l => l.indexOf(B.REASONS.epoch) >= 0);
    }, 30000);

  
  const unreadE = factsOf(De.api.readCatalog() || "") !== 1;

  
  check(!!takenE && !takenE.refused && saidEpoch && unreadE,
      "965b a wrap whose epoch is not the signed team file's is refused and said, and that catalog is not read: "
      + (saidEpoch ? "said" : "not said") + ", catalog " + (unreadE ? "unread" : "read"));
  }
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
  /* A relay link with both its lead key id and its public key replaced, the id remade from the new key, which the desk's own reading
     cannot tell from the genuine one. Its token hello names the lead key the desk pinned, and the relay refuses it as not the team's
     lead before the token is spent; the desk lets the join and its pin go and says so in the link's sentence; the genuine invitation,
     the same token, then joins under the real lead (jlk3). Each new line, lifted alone, turns that red (jlk4). */
  if (partOn("pLeadKey")) {
    const LINK_KEY_EN = "This invitation link does not match its team's lead: it may be damaged or altered, or the team may have a new lead since it was sent. Nothing was used or sent. A new link from the team's lead, or an invitation to this account's email address, works.";
    const LINK_KEY_PL = "Ten link z zaproszeniem nie zgadza się z liderem zespołu: mógł zostać uszkodzony albo zmieniony, albo zespół ma już innego lidera niż w chwili wysłania. Niczego nie użyto ani nie wysłano. Zadziała nowy link od lidera zespołu albo zaproszenie na adres e-mail tego konta.";
    let leadRuns = 0;
    async function leadKeyRun(source) {
      const genuine = await relayInviteOn(RT2, TEAM2);
      const fake = keyPair(false);
      const doc = JSON.parse(Buffer.from(genuine.text.slice("etiuda-join:".length), "base64url").toString("utf8"));
      doc.lead = { keyId: "studio-" + sha(Buffer.from(fake.pub, "hex")).slice(0, 16), public: fake.pub, name: "Ada Quay" };
      const crafted = "etiuda-join:" + Buffer.from(JSON.stringify(doc), "utf8").toString("base64url");
      const n = leadRuns++;
      const share = path.join(LAB, "lead-key-share-" + n);
      fs.mkdirSync(share, { recursive: true });
      const Dl = await newDesk("lead-key-" + n, share, source ? { source } : undefined);
      const row = () => R.stores.get(RT2).get("inv:" + genuine.inv);
      const drive = async () => { const ch = Dl.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); } };
      const craftedTaken = await Dl.ask("etiuda:team-join", "invite", crafted, "Desk Eleven", "");
      const pinnedFake = !!(Dl.envelope().teamPins && Dl.envelope().teamPins[TEAM2] && Dl.envelope().teamPins[TEAM2].public === fake.pub);
      const letGo = await until(async () => { await drive(); const env = Dl.envelope(); return !env.teamJoin && !(env.teamPins && env.teamPins[TEAM2]); }, 8000);
      const r1 = row();
      const unspent = !!r1 && !r1.spent;
      const said = Dl.said.some(l => l.indexOf(LINK_KEY_EN) >= 0 && l.indexOf(LINK_KEY_PL) >= 0);
      const genuineTaken = await Dl.ask("etiuda:team-join", "invite", genuine.text, "Desk Eleven", "");
      const spent = await until(async () => { await drive(); const r = row(); return !!r && r.spent === true; }, 8000);
      const env2 = Dl.envelope();
      const pin2 = env2.teamPins && env2.teamPins[TEAM2];
      const joined = !!(env2.teamJoin && env2.teamJoin.team === TEAM2) && !!pin2 && pin2.public === LEAD.pub && !(env2.teamJoin.invite.relay.end);
      const ok = !!craftedTaken && !craftedTaken.refused && pinnedFake && letGo && unspent && said
        && !!genuineTaken && !genuineTaken.refused && spent && joined;
      const note = "crafted " + (craftedTaken && craftedTaken.refused ? "refused " + craftedTaken.refused : "taken")
        + (pinnedFake ? ", pinned to its key" : ", not pinned to its key") + ", " + (letGo ? "join and pin let go" : "join or pin kept")
        + ", token " + (unspent ? "unspent" : "spent") + ", " + (said ? "said" : "not said")
        + "; genuine " + (genuineTaken && genuineTaken.refused ? "refused " + genuineTaken.refused : "taken") + ", token " + (spent ? "spent" : "unspent")
        + ", " + (joined ? "joined under the lead" : "not joined under the lead");
      return { ok, note };
    }
    const leadNow = await leadKeyRun();
    check(leadNow.ok,
      "jlk3 a relay link with its lead key id and public key both replaced is taken, its token hello names the pinned key, and the relay refuses it "
      + "before the token is spent; the desk lets the join and the pin go and says so, and the genuine invitation then joins under its lead: " + leadNow.note);
    if (PLANTS_OFF) skip("jlk4 lifting each new line (the pinned key lent, sent, the refusal ended, the join let go, the invitation undone) turns jlk3 red");
    else {
      const notes = [];
      let turned = true;
      for (const tag of ["plant:token-lead-pin", "plant:lead-other-join", "plant:lead-other-undo"]) {
        let note = "";
        const p = await liftDesk(tag, async next => { const r = await leadKeyRun(next); note = r.note; return !r.ok; });
        turned = turned && p.turned && p.back;
        notes.push(tag + " " + (p.turned ? "the check lifted" : p.detail.split("\n")[0]) + " (" + note + ")" + (p.back ? "" : ", shell/main.js changed"));
      }
      for (const tag of ["plant:token-lead-sent", "plant:lead-other-end"]) {
        let note = "";
        const p = await liftChannel(tag, async () => { const r = await leadKeyRun(); note = r.note; return !r.ok; });
        turned = turned && p.turned && p.back;
        notes.push(tag + " " + (p.turned ? "the check lifted" : p.detail.split("\n")[0]) + " (" + note + ")" + (p.back ? "" : ", channel.cjs changed"));
      }
      check(turned, "jlk4 lifting each new line alone turns jlk3 red: " + notes.join("; "));
    }
  }
  if (partOn("pDesk")) {
  const openPlant = await liftChannel("plant:wrap-open", async () => {
      const invP = await inviteOnW(1);
      const Dp = await deskOnWrap("wrap-plant", invP.wrap);
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
  }

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
  let devRevW, teamRevW, devKeysW;
  if (partOn("pDesk")) {
  devRevW = 0, teamRevW = 1;

  
  devKeysW = [];
  }
  async function wrapRestart(label, edition, readCeiling) {
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
    const first = await newDesk(label, folder, hooks);
    const taken = await first.ask("etiuda:team-join", "invite", inv.text, "Desk Nine", "");
    const me = await first.ask("etiuda:branch-identity", false);
    const joinRel = "desks/" + me.id + "/join.json";
    const said = await until(async () => {
      const ch = first.api.relayRun();
      if (ch) { ch.kick(); await ch.idle(); }
      return first.said.some(l => l.indexOf(B.REASONS.epoch) >= 0);
    }, 30000);
    uploaded = await until(async () => {
      const ch = first.api.relayRun();
      if (ch) { ch.kick(); await ch.idle(); }
      await studioW.kick(); await studioW.idle();
      return !!read(studioWMirror, joinRel);
    }, 30000);
    const keptAfterUpload = !!((((first.envelope().teamJoin || {}).invite || {}).relay || {}).wrap);
    const stopFirst = first.api.relayRun();
    if (stopFirst) await stopFirst.stop();
    mode = "spent";
    const second = await loadDesk(first.ud, hooks);
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
    }, readCeiling || 30000);
    const stopSecond = second.api.relayRun();
    if (stopSecond) await stopSecond.stop();
    return { taken: taken, said: said, uploaded: uploaded, keptAfterUpload: keptAfterUpload, read: read2, asks: seen.asks, afterUpload: seen.afterUpload };
  }
  const PUT_BACK_REFUSED = '    const why = r.refused || refusalOf(r); if (why.reason === "token-spent") return why; wrapPhase = "none";';
  if (partOn("pDesk")) {
  const e2 = await wrapRestart("wrap-restart", 3);

  
  check(!!e2.taken && !e2.taken.refused && e2.said && e2.uploaded && !e2.keptAfterUpload && e2.read && e2.afterUpload === 0,
      "966a a wrap refused for its epoch, the one upload, a restart, then enrolment with the relay answering the wrap token-spent: the wrap key is"
      + " forgotten at the upload, the wrap is not asked for again, and the enrolled desk reads the team's edition: wrap "
      + (e2.said ? "refused and said" : "not refused") + ", upload " + (e2.uploaded ? "at the lead" : "absent")
      + ", wrap key " + (e2.keptAfterUpload ? "kept" : "forgotten") + ", asks after the upload " + e2.afterUpload
      + ", edition " + (e2.read ? "read" : "unread"));

  
  const e2Plant = await plantChannel([{ tag: "plant:S3-wrap-once", text: null }, { tag: "plant:S3-wrap-gone", text: null },
      { tag: "plant:S3-wrap-refused", text: PUT_BACK_REFUSED }], async () => {
      const again = await wrapRestart("wrap-restart-plant", 4, 8000);
      return !again.read;
    });

  
  check(e2Plant.turned && e2Plant.back,
      "966b putting back the wrap ask after the upload, the kept wrap key and the early return on token-spent leaves the enrolled desk reading nothing,"
      + " and the product file is never written: " + e2Plant.detail + ", sha " + (e2Plant.back ? "restored" : "differs"));
  }
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
  if (partOn("pDesk")) {
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
  }
  /* Board 922, F1. A relay invitation the relay answers token-spent, or invite-ended, is kept with the request and said in its view,
     which the page draws, and not only in the console. */
  async function endedJoin(label, error, shownCeiling) {
    const inv = await inviteOnW(1);
    const hooks = { fetch: (url, init) => (init && init.method === "POST" && String(url).endsWith("/session") && init.body
      && String(init.body).indexOf('"invite"') >= 0
      ? new Response(Buffer.from(JSON.stringify({ error: error }), "utf8"), { status: 403, headers: { "content-type": "application/json" } })
      : null) };
    const folder = path.join(LAB, label + "-share");
    fs.mkdirSync(folder, { recursive: true });
    const desk = await newDesk(label, folder, hooks);
    const taken = await desk.ask("etiuda:team-join", "invite", inv.text, "Desk Nine", "");
    let view = null;
    const shown = await until(async () => {
      const ch = desk.api.relayRun();
      if (ch) { ch.kick(); await ch.idle(); }
      view = await desk.ask("etiuda:team-join", "view");
      return !!(view && view.join && view.join.state !== "waiting");
    }, shownCeiling || 30000);
    const kept = (((((desk.envelope().teamJoin || {}).invite || {}).relay || {}).end)) || "";
    const again = await loadDesk(desk.ud);
    const after = await again.ask("etiuda:team-join", "view");
    const stop = desk.api.relayRun();
    if (stop) await stop.stop();
    return { taken: taken, shown: shown, view: view, kept: kept, reloaded: after && after.join ? after.join.state : "none" };
  }
  if (partOn("pDesk")) {
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
      const again = await endedJoin("ended-used-plant", "token-spent", 6000);
      return !again.shown && again.kept === "";
    });

  
  check(usedLift.turned && usedLift.back,
      "967c lifting plant:S3-page-used leaves the used invitation unsaid in the view, and the product file is never written: "
      + usedLift.detail + ", sha " + (usedLift.back ? "restored" : "differs"));

  
  const endedLift = await liftChannel("plant:S3-page-ended", async () => {
      const again = await endedJoin("ended-expired-plant", "invite-ended", 6000);
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
        const desk = await newDesk(name, folder);
        const taken = await desk.ask("etiuda:team-join", "invite", offer.text, "Desk Nine", "");
        const who = await desk.ask("etiuda:branch-identity", false);
        const rel = "desks/" + who.id + "/join.json";
        const landed = await until(async () => {
          const ch = desk.api.relayRun();
          if (ch) { ch.kick(); await ch.idle(); }
          await leadA.kick(); await leadA.idle();
          return !!read(leadMirror, rel);
        }, 30000);
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
      }, 30000);
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
      }, 30000);
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
  }

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
  if (partOn("pDesk")) {
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

  
  await studio.kick();
 
  await studio.idle();

  
  liveInvites.length = 0;

  
  const loaded = await until(async () => {
      const ch = D.api.relayRun();
      if (ch) { ch.kick(); await ch.idle(); }
      return factsOf(D.sync("etiuda:catalog") || "") === 1;
    }, 30000);

  
  check(loaded && JSON.stringify((D.envelope().teamPinFrom || {})[TEAM2]) === "\"invite\"",
      "942b admitted, the desk reads its team on the relay, keeps the team key from its wrap and loads the edition the lead put in Studio's"
      + " mirror: " + (loaded ? "edition 1 loaded" : "not loaded") + ", the pin from " + JSON.stringify((D.envelope().teamPinFrom || {})[TEAM2]));

  /* N1: the team key unwrapped is the end of the request, the Team cover never read: the request goes from both mirrors, the
     record keeps no join, and the desk follows its team file's address and not the invitation's. The next view says joined once. */
  
  {
      const doneN1 = await until(async () => { const ch = D.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); } await studio.kick(); await studio.idle();
        return read(mirror, joinRel) === null && read(studioMirror, joinRel) === null; }, 30000);
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
      return read(studioMirror, joinRel) === null; }, 30000);

  
  check(gone, "942c the desk's request, removed once it is admitted, goes from the lead's mirror by its signed deletion: " + (gone ? "removed" : "still there"));


  /* Offline: the desk keeps working on its mirror, then catches up. */
  
  deskTransport.down = true;

  
  put(studioMirror, "board.ec", JSON.stringify(D.api.sealCatalog(K2, TEAM2, 1, catalogText(2))));

  
  await studio.kick();
 
  await studio.idle();

  
  const ch1 = D.api.relayRun();
 
  if (ch1) { ch1.kick(); await ch1.idle(); }

  /* The page's next read, as the mirror's watch would prompt it in the app. */
  
  const whileDown = factsOf(D.api.readCatalog() || "");

  
  deskTransport.down = false;

  
  const caught = await until(async () => { const ch = D.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); } return factsOf(D.api.readCatalog() || "") === 2; }, 30000);

  
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
            pageMod = { ST, SET, TJ };
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
      const oldLanded = await until(async () => { put(studioMirror, HEAD_FILE, oldText); await pump(); return read(mirror, HEAD_FILE) === oldText; }, 30000);
      const oldNews = newsOf();
      const oldLeads = await leadsOf();
      const oldPage = await pageHtml(oldLeads);
      const oldSentence = "Newest edition Quay two, published 1 March 2026. The team's news: " + dayStamp(oldT);
      const oldPl = "Najnowsze wydanie Quay two, opublikowane 1 March 2026. Wiadomość zespołu: " + dayStamp(oldT);
      const noteRel = "desks/" + me.id + "/note.ec";
      const note = "Desk Nine still writes while the team's news is old.\n";
      put(mirror, noteRel, note);
      const noteSent = await until(async () => { await pump(); return read(studioMirror, noteRel) === note; }, 30000);
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
      const freshLanded = await until(async () => { put(studioMirror, HEAD_FILE, freshText); await pump(); return read(mirror, HEAD_FILE) === freshText; }, 30000);
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
      }, 30000);
      check(forgedSaid && read(mirror, HEAD_FILE) === kept,
        "948c a forged head is dropped and said, and the mirror keeps the genuine one: "
        + (forgedSaid ? "said" : "not said") + ", mirror " + (read(mirror, HEAD_FILE) === kept ? "unchanged" : "changed"));
      const olderText = headBody(TEAM2, freshT - 60 * 1000, "Quay one", "1 March 2026");
      const olderFrom = D.said.length;
      const olderSaid = await until(async () => {
        put(studioMirror, HEAD_FILE, olderText); await pump();
        return D.said.slice(olderFrom).some(l => l.indexOf(B.REASONS["replay-counter"]) >= 0);
      }, 30000);
      check(olderSaid && read(mirror, HEAD_FILE) === kept,
        "948d an older head is dropped and said, and the newer stays: "
        + (olderSaid ? "said" : "not said") + ", mirror " + (read(mirror, HEAD_FILE) === kept ? "unchanged" : "changed"));
      const otherText = headBody("t-" + hex(8), Date.now(), "Quay four", "3 March 2026");
      const otherFrom = D.said.length;
      const otherSaid = await until(async () => {
        put(studioMirror, HEAD_FILE, otherText); await pump();
        return D.said.slice(otherFrom).some(l => l.indexOf(B.REASONS["wrong-team"]) >= 0);
      }, 30000);
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
        const landed = await until(async () => { put(studioMirror, HEAD_FILE, text); await pump(); return read(mirror, HEAD_FILE) === text; }, 30000);
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
      /* cfu2e to cfu2g, the page's half of the copy the channel kept: the row the shell sends carries the copy's file name, the page
         keeps it through its own reading of the answer and prints one sentence a copy in the desk's language, and prints none of it
         where the row names none. KEPT_EN and KEPT_PL, and the count line in kam1, are the copywriter's words. */
      {
        const cfuFile = "guide (conflicted copy 2026-11-22).ec";
        const KEPT_EN = cfuFile + " was not sent to the team: the team's edition had changed in the meantime, from another computer or from an earlier send of this one. It is kept beside the catalog in the team's folder on this computer, and can be opened and published again if it is the edition wanted.";
        const KEPT_PL = "Pliku " + cfuFile + " nie wysłano zespołowi: wydanie zespołu zmieniło się w międzyczasie, z innego komputera albo po wcześniejszym wysłaniu z tego. Plik zostaje obok katalogu w folderze zespołu na tym komputerze; można go otworzyć i opublikować ponownie, jeśli to właściwe wydanie.";
        const KEPT_ANY_EN = "was not sent to the team: the team's edition had changed", KEPT_ANY_PL = "nie wysłano zespołowi: wydanie zespołu";
        const withKept = leads => (leads || []).map(l => l && l.team === TEAM2 ? Object.assign({}, l, { keptApart: [cfuFile] }) : l);
        const withPage = await pageHtml(withKept(freshLeads));
        const noPage = await pageHtml(freshLeads);
        check(withPage.en.indexOf(KEPT_EN) >= 0 && withPage.pl.indexOf(KEPT_PL) >= 0 && noPage.en.indexOf(KEPT_ANY_EN) < 0 && noPage.pl.indexOf(KEPT_ANY_PL) < 0,
          "cfu2e a team row that names a kept copy shows, in English and in Polish, that the copy was kept on this computer and not sent, and a row that names none shows nothing of it: en "
          + (withPage.en.indexOf(KEPT_EN) >= 0) + ", pl " + (withPage.pl.indexOf(KEPT_PL) >= 0) + ", none-row en " + (noPage.en.indexOf(KEPT_ANY_EN) >= 0)
          + ", none-row pl " + (noPage.pl.indexOf(KEPT_ANY_PL) >= 0) + (pageErr ? " page " + pageErr.split("\n")[0] : ""));
        /* The page's modules copied whole beside a lifted line, loaded as a second page that reads the same row. */
        const liftedPage = async (file, tag, leadsFn) => {
          const lines = fs.readFileSync(path.join(ROOT, "src", "modules", file), "utf8").split(/\n/);
          const at = lines.findIndex(l => l.indexOf(tag) >= 0);
          if (at < 0) return null;
          lines.splice(at, 1);
          const dir = fs.mkdtempSync(path.join(LAB, "page-plant-"));
          fs.cpSync(path.join(ROOT, "src", "modules"), dir, { recursive: true });
          fs.writeFileSync(path.join(dir, file), lines.join("\n"), "utf8");
          const at2 = n => pathToFileURL(path.join(dir, n)).href;
          const HK2 = await import(at2("hooks.js"));
          HK2.hooks.render = () => {};
          const TJ2 = await import(at2("team-join.js")), ST2 = await import(at2("storage.js")), SET2 = await import(at2("settings.js"));
          let took2 = null;
          const host = window.E_HOST;
          window.E_HOST = { teamJoin: () => Promise.resolve({ leads: [] }), onTeamJoin: fn => { took2 = fn; } };
          TJ2.wireTeamJoin();
          await wait(40);
          window.E_HOST = host;
          if (took2) took2({ leads: (leadsFn || withKept)(freshLeads) });
          ST2.lsSet("eUiLang", "en");
          return shownText(SET2.settingsBodyHtml());
        };
        if (PLANTS_OFF) {
          skip("cfu2f lifting plant:kept-apart-shown leaves the kept copy off the team's row on the page");
          skip("cfu2g lifting plant:kept-apart-kept drops the kept copy from the row the page keeps");
        } else {
          let shownEn = null, keptEn = null, err = "";
          try { shownEn = await liftedPage("settings.js", "plant:kept-apart-shown"); keptEn = await liftedPage("team-join.js", "plant:kept-apart-kept"); } catch (e) { err = e && e.stack ? e.stack : String(e); }
          check(shownEn !== null && shownEn.indexOf("Newest edition Quay three") >= 0 && shownEn.indexOf(KEPT_ANY_EN) < 0 && !err, "cfu2f lifting plant:kept-apart-shown leaves the kept copy off the team's row on the page (FAIL cfu2e): "
            + (shownEn === null ? "plant line absent" : "sentence " + (shownEn.indexOf(KEPT_ANY_EN) >= 0 ? "still there" : "gone")) + (err ? " " + err.split("\n")[0] : ""));
          check(keptEn !== null && keptEn.indexOf("Newest edition Quay three") >= 0 && keptEn.indexOf(KEPT_ANY_EN) < 0 && !err, "cfu2g lifting plant:kept-apart-kept drops the kept copy from the row the page keeps (FAIL cfu2e): "
            + (keptEn === null ? "plant line absent" : "sentence " + (keptEn.indexOf(KEPT_ANY_EN) >= 0 ? "still there" : "gone")) + (err ? " " + err.split("\n")[0] : ""));
        }
        /* kam1: past the three copies the row names, one sentence counts the rest, in English and Polish, after the three; none where
           the row counts none. */
        const MORE_EN = "More files kept the same way: 2.", MORE_PL = "Więcej plików zachowanych w ten sam sposób: 2.";
        const three = ["a (conflicted copy 2026-11-22).ec", "b (conflicted copy 2026-11-22).ec", cfuFile];
        const withMore = leads => (leads || []).map(l => l && l.team === TEAM2 ? Object.assign({}, l, { keptApart: three, keptApartMore: 2 }) : l);
        const morePage = await pageHtml(withMore(freshLeads));
        const after = (h, a, b) => h.indexOf(a) >= 0 && h.indexOf(b) > h.indexOf(a);
        check(after(morePage.en, KEPT_EN, MORE_EN) && after(morePage.pl, KEPT_PL, MORE_PL) && withPage.en.indexOf("More files kept the same way") < 0
          && withPage.pl.indexOf("Więcej plików zachowanych") < 0,
          "kam1a a team row that names three kept copies and counts two more shows the three sentences and then the count, in English and in Polish, and a row that counts none shows no count: en "
          + after(morePage.en, KEPT_EN, MORE_EN) + ", pl " + after(morePage.pl, KEPT_PL, MORE_PL) + ", none-count en " + (withPage.en.indexOf("More files kept the same way") >= 0)
          + (pageErr ? " page " + pageErr.split("\n")[0] : ""));
        if (PLANTS_OFF) {
          skip("kam1b lifting plant:kept-apart-more-shown leaves the count off the page");
          skip("kam1c lifting plant:kept-apart-more-kept drops the count from the row the page keeps");
        } else {
          let ms = null, mk = null, merr = "";
          try { ms = await liftedPage("team-join.js", "plant:kept-apart-more-shown", withMore); mk = await liftedPage("team-join.js", "plant:kept-apart-more-kept", withMore); } catch (e) { merr = e && e.stack ? e.stack : String(e); }
          const noCount = h => h !== null && h.indexOf(KEPT_EN) >= 0 && h.indexOf("More files kept the same way") < 0;
          check(noCount(ms) && !merr, "kam1b lifting plant:kept-apart-more-shown leaves the count off the page (FAIL kam1a): " + (ms === null ? "plant line absent" : "count " + (noCount(ms) ? "gone" : "still there or row missing")) + (merr ? " " + merr.split("\n")[0] : ""));
          check(noCount(mk) && !merr, "kam1c lifting plant:kept-apart-more-kept drops the count from the row the page keeps (FAIL kam1a): " + (mk === null ? "plant line absent" : "count " + (noCount(mk) ? "gone" : "still there or row missing")) + (merr ? " " + merr.split("\n")[0] : ""));
        }
      }
      /* 962 stage 5, T4, the page's half of the head per catalog: the row keeps each catalog's entry the shell kept, and the note
         under the team's name counts only the team's other catalogs whose edition is newer than the one loaded here. */
      {
        const ONE = "Another catalog of the team has a newer edition.";
        const quayAt = newer => ({ catalog: "quay-board", rev: 3, edition: "Quay three", published: "2 March 2026", newer });
        const pebbleAt = newer => ({ catalog: "pebble-board", rev: 5, edition: "Pebble five", published: "4 March 2026", newer });
        const stoneAt = newer => ({ catalog: "stone-board", rev: 2, edition: "Stone two", published: "6 March 2026", newer });
        const withHead = (editions, named) => (freshLeads || []).map(l => l && l.team === TEAM2 ? Object.assign({}, l, { head: { t: Date.now(),
          editions, edition: named.edition, published: named.published } }) : l);
        const pageOf = async (editions, named, inUse) => {
          const was = window.E_CATALOG;
          if (inUse) window.E_CATALOG = { id: inUse };
          try {
            const page = await pageHtml(withHead(editions, named));
            const row = pageMod && pageMod.TJ ? pageMod.TJ.teamLeads().filter(l => l && l.team === TEAM2)[0] : null;
            return { en: page.en, pl: page.pl, row };
          } finally { window.E_CATALOG = was; }
        };
        const says = (p, s) => p.en.indexOf(s) >= 0;
        const headSaid = p => says(p, "Newest edition Quay three, published 2 March 2026. The team's news: ");
        const counted = p => says(p, ONE) ? "one" : /Other catalogs of the team with a newer edition: \d+\./.test(p.en) ? p.en.match(/a newer edition: (\d+)\./)[1] : "none";
        const two = await pageOf([quayAt(false), pebbleAt(true)], quayAt(false));
        const listed = two.row && two.row.head && Array.isArray(two.row.head.editions) ? two.row.head.editions : [];
        const entry = id => listed.filter(e => e.catalog === id)[0] || null;
        check(listed.length === 2 && !!entry("quay-board") && entry("quay-board").rev === 3 && entry("quay-board").newer === false
          && !!entry("pebble-board") && entry("pebble-board").rev === 5 && entry("pebble-board").newer === true && two.row.head.catalog === "quay-board",
          "962t4a the team's row keeps both catalogs' entries as the shell kept them, the one the note names marked: "
          + (listed.length ? listed.map(e => e.catalog + "@" + e.rev + (e.newer ? "+" : "")).join(",") : "no list") + ", named "
          + (two.row && two.row.head ? two.row.head.catalog : "no head") + (pageErr ? " page " + pageErr.split("\n")[0] : ""));
        const ownNewer = await pageOf([quayAt(true), pebbleAt(false)], quayAt(true));
        const three = await pageOf([pebbleAt(true), quayAt(false), stoneAt(true)], quayAt(false));
        check(headSaid(two) && counted(two) === "one" && headSaid(ownNewer) && counted(ownNewer) === "none" && headSaid(three) && counted(three) === "2"
          && says(three, "Other catalogs of the team with a newer edition: 2."),
          "962t4b the note names the catalog in use's edition and counts only the team's other catalogs with a newer edition: another newer "
          + counted(two) + ", only the one in use newer " + counted(ownNewer) + ", two others newer of three " + counted(three));
        const both = await pageOf([quayAt(false), pebbleAt(false)], quayAt(false));
        const bothPl = both.pl.indexOf("Najnowsze wydanie Quay three, opublikowane 2 March 2026. Wiadomość zespołu: ") >= 0;
        check(headSaid(both) && counted(both) === "none" && bothPl && both.en.indexOf(" newer edition") < 0,
          "962t4c once both catalogs are loaded the note says nothing of the other, and still names the edition: count " + counted(both)
          + ", sentence " + headSaid(both) + ", polish " + bothPl);
        /* Two catalogs published on the same day carry the same edition and date, so the named one is the catalog in use. */
        const twin = newer => ({ catalog: "pebble-board", rev: 5, edition: "Quay three", published: "2 March 2026", newer });
        const usedOld = await pageOf([quayAt(false), twin(true)], quayAt(false), "quay-board");
        const usedNew = await pageOf([quayAt(false), twin(true)], quayAt(false), "pebble-board");
        check(counted(usedOld) === "one" && counted(usedNew) === "none" && usedOld.row && usedOld.row.head.catalog === "quay-board"
          && usedNew.row && usedNew.row.head.catalog === "pebble-board",
          "962t4d of two catalogs with the same edition and date, the note names the one in use and counts the other: quay in use "
          + counted(usedOld) + ", pebble in use " + counted(usedNew));
        /* plant:head-newer. Deleting that line, leaving the file valid script, counts the team's other catalogs whether or not they are newer. */
        const src = path.join(ROOT, "src", "modules", "settings.js");
        const before = fs.readFileSync(src);
        const digest = sha(before);
        let turned = false, detail = "plant line absent";
        try {
          const lines = before.toString("utf8").split(/\n/);
          const at = lines.findIndex(l => l.indexOf("plant:head-newer") >= 0);
          if (at >= 0 && pageMod) {
            lines.splice(at, 1);
            const SET3 = await loadPlantedSettings(lines.join("\n"));
            if (tookFn) tookFn({ leads: withHead([quayAt(false), pebbleAt(false)], quayAt(false)) });
            pageMod.ST.lsSet("eUiLang", "en");
            const html = shownText(SET3.settingsBodyHtml());
            turned = html.indexOf(ONE) >= 0;
            detail = turned ? "the loaded catalog is counted" : "nothing counted";
          }
        } catch (e) {
          detail = e && e.message ? e.message : String(e);
        }
        const back = sha(fs.readFileSync(src)) === digest;
        check(turned && back, "962t4e lifting plant:head-newer counts a catalog already loaded (FAIL 962t4c), and the product file is never written: "
          + detail + ", sha " + (back ? "restored" : "differs"));
        if (tookFn) tookFn({ leads: freshLeads });
      }
      const shareH = path.join(LAB, "head-folder");
      fs.mkdirSync(shareH, { recursive: true });
      const H = await newDesk("head-folder-desk", shareH);
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
      /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring and epoch were read off its team file in the share; a held folder team shows its row and nothing newer, and the relay desk's head checks hold what a team shows. It said what its sentence below says. */
      retire(relayHeadShown && noKey && hpage.en.indexOf("Newest edition") < 0 && H.api.catalogFolder() === shareH,
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
        /* The row keeps only catalogs the team file lists (962 stage 5), so the record holds the team file the head is read against. */
        fs.writeFileSync(path.join(mirrorBoth, C.TEAM_NAME), read(mirror, C.TEAM_NAME));
        fs.writeFileSync(path.join(udBoth, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
          keys: { eCatalogFolder: shareH, eUiLang: "en" },
          teamPins: { [TEAM2]: { keyId: LEAD.keyId, public: LEAD.pub }, [TEAMH]: { keyId: INTR.keyId, public: INTR.pub } },
          teamPinFrom: { [TEAM2]: "invite" }, teamChannel: { [TEAM2]: { kind: "relay", rt: RT2, url: URL2 } },
          teamShown: { [TEAMH]: { folder: shareH } } }), "utf8");
        const BD = await loadDesk(udBoth);
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
      /* 962s5g3, the relay, after 948l has read the head it shows: an entry below the rev this desk has loaded of that catalog is left off the row, though the channel took the head. */
      const belowS5 = await shownFor(headWith(TEAM2, tTwo + 2, [{ catalog: "quay-board", rev: 1, edition: "Quay one again", published: "1 March 2026" }]));
      check(belowS5.landed && belowS5.news === "Quay one again / 1 March 2026" && belowS5.row === "none",
        "962s5g3 on the relay, a head naming only an edition below the one this desk has loaded is left off the team row: news " + belowS5.news + ", row " + belowS5.row);
    } catch (e) {
      check(false, "948 the team's news: " + (e && e.stack ? e.stack : e));
    }
  }
  /* A desk that follows one relay team and holds the team file and the head in the team's relay mirror, read through the desk's own shell:
     the row `etiuda:team-join leads` gives for the team, its head. The desk is offline (every fetch to the relay fails), so nothing lands in
     the mirror but what this puts there; the head is read from the mirror by the channel's headNews and judged by the shell's headView.
     `o`: tag, team (id), teamText, rt, channel, head, files ([name, text]), revs ({catalog: rev} the desk has loaded), src (a planted shell). */
  let relayRowN = 0;
  const relayHeadRow = async o => {
    const ud = path.join(LAB, o.tag + "-" + (++relayRowN) + "-" + hex(3)), mir = path.join(ud, "relay", o.rt), elsewhere = path.join(ud, "share");
    fs.mkdirSync(mir, { recursive: true }); fs.mkdirSync(elsewhere, { recursive: true });
    fs.writeFileSync(path.join(mir, C.TEAM_NAME), o.teamText);
    for (const [n, t] of o.files || []) fs.writeFileSync(path.join(mir, n), t);
    if (o.head) fs.writeFileSync(path.join(mir, HEAD_FILE), o.head);
    const revs = {};
    for (const id of Object.keys(o.revs || {})) revs[id] = { [LEAD.pub]: o.revs[id] };
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: elsewhere, eUiLang: "en" },
      teamPins: { [o.team]: { keyId: LEAD.keyId, public: LEAD.pub } }, teamPinFrom: { [o.team]: "invite" }, teamChannel: { [o.team]: o.channel },
      teamShown: { [o.team]: { folder: mir, relay: "relay.test" } }, catalogRevs: revs }), "utf8");
    const FD = await loadDesk(ud, { source: o.src || SRC, fetch: () => Promise.reject(new Error("offline")) });
    await FD.ask("etiuda:branch-identity", true);
    const run = FD.api.relayRun();
    try {
      const v = await FD.ask("etiuda:team-join", "leads");
      const row = (v && Array.isArray(v.leads) ? v.leads : []).filter(l => l && l.team === o.team)[0];
      return row && row.head ? row.head : null;
    } finally {
      if (run) await run.stop();
    }
  };
  if (partOn("p962s5")) {
  markPart("p962s5");

  /* ---- 962 stage 5 (the design's 3.2 and 3.3) on a relay team's row, through the desk's own shell: the head per catalog ----
     MOVED, P4 (no folder is read as a team). These scenes ran on a folder team: its team file and head in the desk's folder-mirror, the row read off
     that folder. headView's rules (a head's entries kept per catalog, an unlisted catalog dropped, an entry below the rev the desk has seen dropped,
     `newer` only above what the desk has loaded) now serve relay teams alone, so the same checks run on a desk that follows the team over the
     relay, relayHeadRow above. Each keeps its id and its sentence, "a folder team" now "a relay team"; the old sentence stands in the comment
     at its place. Their plant lifts (head-listed, folder-head-older, head-loaded) are lifted on these scenes. 962s5r2f and 962s5t4, and the plants
     folder-head-ahead and folder-head-epoch, are retired: the folder's time and epoch floors left the shell, and the relay's own are 962s5r and 962s5t
     in the channel's part below. */

  try {
      const TMF = "t-" + hex(8), RTS = hex(16), CHS = { kind: "relay", rt: RTS, url: URLV1 };
      const teamS5 = JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: TMF, catalogs: ["pebble-board", "quay-board"],
        lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev: 1, channel: CHS, ring: RING, roster: [] }, LEAD), null, 1) + "\n";
      const catOf = (id, rev) => {
        const o = { format: 2, kind: "etiuda-catalog", id, rev, name: "Board " + id, date: "2026-03-0" + Math.min(rev, 9),
          langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
          cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" }, body: { en: "Good day, edition " + rev + "." } }] };
        o.sig = { alg: "Ed25519", keyId: LEAD.keyId };
        o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), LEAD.privateKey).toString("hex");
        return JSON.stringify(o, null, 1) + "\n";
      };
      const pe = (rev, ed) => ({ catalog: "pebble-board", rev, edition: ed || "Pebble " + rev, published: rev + " March 2026" });
      const qe = (rev, ed) => ({ catalog: "quay-board", rev, edition: ed || "Quay " + rev, published: rev + " April 2026" });
      /* A desk pinned to the relay team, its mirror holding the team file, the head and any `files`; `revs` its handed revs. */
      const rowOf = (head, o) => relayHeadRow(Object.assign({ tag: "s5-head", team: TMF, teamText: teamS5, rt: RTS, channel: CHS, head }, o || {}));
      const shownS5 = h => !h ? "none" : (h.edition || "-") + " [" + (Array.isArray(h.editions) ? h.editions.map(e => e.catalog + "@" + e.rev + (e.newer ? "+" : "")).join(",") : "no list") + "]";
      const entryOf = (h, id) => h && Array.isArray(h.editions) ? h.editions.filter(e => e.catalog === id)[0] || null : null;
      const now = Date.now();

      /* 962s5d: both catalogs' entries kept, the second's newer edition beside the first's higher rev. Old sentence: "a folder team's head naming two
         catalogs keeps both entries, the second's newer edition beside the first's higher rev". */
      const d = await rowOf(signHead({ v: 1, team: TMF, epoch: 1, rev: 1, editions: [pe(5, "Pebble five"), qe(2, "Quay two")], t: now }));
      check(!!d && d.edition === "Pebble five" && (d.editions || []).length === 2 && !!entryOf(d, "quay-board") && entryOf(d, "quay-board").newer === true
        && entryOf(d, "pebble-board").newer === true,
        "962s5d a relay team's head naming two catalogs keeps both entries, the second's newer edition beside the first's higher rev: " + shownS5(d));
      /* 962s5f: an entry for a catalog the team file does not list is dropped. Old sentence: "an entry for a catalog the team file does not list is
         dropped from the row" (on a folder team). */
      const fScene = src => rowOf(signHead({ v: 1, team: TMF, epoch: 1, rev: 1, editions: [pe(5), { catalog: "stone-board", rev: 9, edition: "Stone nine", published: "9 May 2026" }], t: now }), { src });
      const f = await fScene();
      check(!!f && (f.editions || []).length === 1 && !entryOf(f, "stone-board") && f.edition === "Pebble 5",
        "962s5f on a relay team, an entry for a catalog the team file does not list is dropped from the row: " + shownS5(f));
      /* 962s5g: an entry below the rev this desk has seen of that catalog is dropped; a higher one is kept. Old sentence: "on a folder team, an entry
         below the rev this desk has of that catalog is dropped and a higher one kept". */
      const gScene = src => rowOf(signHead({ v: 1, team: TMF, epoch: 1, rev: 1, editions: [pe(5), qe(2)], t: now }), { revs: { "quay-board": 3 }, src });
      const g = await gScene();
      const gUp = await rowOf(signHead({ v: 1, team: TMF, epoch: 1, rev: 1, editions: [pe(5), qe(4)], t: now }), { revs: { "quay-board": 3 } });
      check(!!g && !entryOf(g, "quay-board") && !!entryOf(g, "pebble-board") && !!gUp && !!entryOf(gUp, "quay-board") && entryOf(gUp, "quay-board").newer === true,
        "962s5g on a relay team, an entry below the rev this desk has of that catalog is dropped and a higher one kept: below " + shownS5(g) + ", above " + shownS5(gUp));
      /* 962s5p: newer is false for a rev the desk has loaded and true above it; a file sitting unread in the mirror is not loaded. Old sentence: "an entry
         the desk has loaded is not newer, one above it is, and a file unread in the mirror does not count as loaded" (on a folder team). */
      const pScene = src => rowOf(signHead({ v: 1, team: TMF, epoch: 1, rev: 1, editions: [pe(5), qe(3)], t: now }),
        { revs: { "pebble-board": 5 }, files: [["quay.ec", catOf("quay-board", 3)]], src });
      const p = await pScene();
      check(!!p && !!entryOf(p, "pebble-board") && entryOf(p, "pebble-board").newer === false && !!entryOf(p, "quay-board") && entryOf(p, "quay-board").newer === true,
        "962s5p on a relay team, an entry the desk has loaded is not newer, one above it is, and a file unread in the mirror does not count as loaded: " + shownS5(p));
      /* RETIRED, P4 (no folder is read as a team): 962s5r2f, "on a folder team, a head dated beyond now plus ten minutes is not shown and leaves the floor, so
         the genuine head after it shows", and 962s5t4, "on a folder team, a head below the epoch of the team file the mirror holds is left out, and one at it
         shows", with their plants folder-head-ahead (962s5r4) and folder-head-epoch (962s5t5), whose lines left shell/main.js. The relay's own time and epoch
         floors are held by 962s5r and 962s5t in the channel's part. */
      retire(true, "962s5r2f on a folder team, a head dated beyond now plus ten minutes is not shown and leaves the floor, so the genuine head after it shows");
      retire(true, "962s5t4 on a folder team, a head below the epoch of the team file the mirror holds is left out, and one at it shows");
      retire(true, "962s5r4 lifting plant:folder-head-ahead shows the head from ahead and refuses the genuine one (FAIL 962s5r2f)");
      retire(true, "962s5t5 lifting plant:folder-head-epoch shows the head below the team file's epoch (FAIL 962s5t4)");
      if (PLANTS_OFF) {
        skip("962s5f2 lifting plant:head-listed keeps the unlisted catalog's entry");
        skip("962s5g2 lifting plant:folder-head-older keeps the entry below the desk's rev");
        skip("962s5p2 lifting plant:head-loaded calls the loaded rev newer");
      } else {
        const lifted = tag => { const lines = SRC.split(/\n/), at = lines.findIndex(l => l.indexOf(tag) >= 0); if (at < 0) return null; lines.splice(at, 1); return lines.join("\n"); };
        const s1 = lifted("plant:head-listed"), s2 = lifted("plant:folder-head-older"), s3 = lifted("plant:head-loaded");
        const f2 = s1 ? await fScene(s1) : null, g2 = s2 ? await gScene(s2) : null, p2 = s3 ? await pScene(s3) : null;
        check(!!f2 && !!entryOf(f2, "stone-board"), "962s5f2 lifting plant:head-listed keeps the unlisted catalog's entry (FAIL 962s5f): " + (s1 ? shownS5(f2) : "plant line absent"));
        check(!!g2 && !!entryOf(g2, "quay-board"), "962s5g2 lifting plant:folder-head-older keeps the entry below the desk's rev (FAIL 962s5g): " + (s2 ? shownS5(g2) : "plant line absent"));
        check(!!p2 && !!entryOf(p2, "pebble-board") && entryOf(p2, "pebble-board").newer === true, "962s5p2 lifting plant:head-loaded calls the loaded rev newer (FAIL 962s5p): "
          + (s3 ? shownS5(p2) : "plant line absent"));
      }
    } catch (e) {
      check(false, "962 stage 5 on a relay team's row: " + (e && e.stack ? e.stack : e));
    }
  }
  if (partOn("p962s6")) {
  markPart("p962s6");

  /* ---- 962 stage 6 (E6): a catalog leaves the team. The desk keeps it loaded, withdraws its team-key working copies of it at
     the team file's landing, and shows no head entry for it. ----
     MOVED, P4 (no folder is read as a team): each scene ran by folder and by relay; the folder halves are retired and the relay halves, which passed
     unasserted in the retired lines, are asserted here with their plant lifts on the relay scenes. 962s6e6b3 (the restart variant) was only ever run by
     folder; it is run by relay now. */

  try {
      const catOf = (id, rev) => {
        const o = { format: 2, kind: "etiuda-catalog", id, rev, name: "Board " + id, date: "2026-03-0" + Math.min(rev, 9),
          langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
          cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" }, body: { en: "Good day, edition " + rev + "." } }] };
        o.sig = { alg: "Ed25519", keyId: LEAD.keyId };
        o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), LEAD.privateKey).toString("hex");
        return JSON.stringify(o, null, 1) + "\n";
      };
      const pe = (rev, ed) => ({ catalog: "pebble-board", rev, edition: ed || "Pebble " + rev, published: rev + " March 2026" });
      const qe = (rev, ed) => ({ catalog: "quay-board", rev, edition: ed || "Quay " + rev, published: rev + " April 2026" });
      const entryOf = (h, id) => h && Array.isArray(h.editions) ? h.editions.filter(e => e.catalog === id)[0] || null : null;
      const shownS6 = h => !h ? "none" : (h.edition || "-") + " [" + (Array.isArray(h.editions) ? h.editions.map(e => e.catalog + "@" + e.rev + (e.newer ? "+" : "")).join(",") : "no list") + "]";
      const lifted6 = tag => { const lines = SRC.split(/\n/), at = lines.findIndex(l => l.indexOf(tag) >= 0); if (at < 0) return null; lines.splice(at, 1); return lines.join("\n"); };
      const encE6 = s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)).toString("base64");
      const teamE6 = (id, catalogs, rev, me, D, key, channel) => JSON.stringify(signDoc(Object.assign({ format: 1, kind: "etiuda-team", id, catalogs,
        lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev,
        roster: me ? [{ desk: { id: me.id, key: me.key, box: me.box }, wrap: D.api.wrapTeamKey(key, me.box, id, 1, me.id) }] : [] },
        channel ? { channel } : {}), LEAD), null, 1) + "\n";

      /* E6c: a head still naming B after B leaves names nothing on the row. On a relay team (the old scene was a folder team's). */
      const TME6 = "t-" + hex(8), RT6 = hex(16), CH6 = { kind: "relay", rt: RT6, url: URLV1 };
      const rowOf = (head, team, src) => relayHeadRow({ tag: "s6-head", team: TME6, teamText: team, rt: RT6, channel: CH6, head, src });
      const e6cScene = async src => {
        const after = teamE6(TME6, ["pebble-board"], 2, null, null, null, CH6), empty = teamE6(TME6, [], 3, null, null, null, CH6), now = Date.now();
        const onlyB = signHead({ v: 1, team: TME6, epoch: 1, rev: 1, editions: [qe(2, "Quay two")], t: now });
        const both = signHead({ v: 1, team: TME6, epoch: 1, rev: 1, editions: [pe(5, "Pebble five"), qe(2, "Quay two")], t: now });
        return { onlyB: await rowOf(onlyB, after, src), both: await rowOf(both, after, src), empty: await rowOf(onlyB, empty, src) };
      };
      const c6 = await e6cScene();
      check(c6.onlyB == null && !!c6.both && !entryOf(c6.both, "quay-board") && c6.both.edition === "Pebble five" && c6.empty == null,
        "962s6e6c on a relay team, a head still naming B after B leaves names nothing on the row: only B " + shownS6(c6.onlyB)
        + ", both " + shownS6(c6.both) + ", empty team " + shownS6(c6.empty));

      /* A desk on a sealed relay team listing B (quay-board) and A (pebble-board), holding both editions as the lead sealed them, working
         in B, with a working copy grown from each. (It was by folder or by relay: `kind` stays, and only "relay" is run.) */
      const e6Desk = async (kind, src) => {
        const ud = path.join(LAB, "e6-" + kind + "-" + hex(3)), share = path.join(LAB, "e6-" + kind + "-share-" + hex(3));
        const team = "t-" + hex(8), rt = hex(16), key = crypto.randomBytes(32);
        const channel = { kind: "relay", rt, url: URLV1 };
        const mir = path.join(ud, "relay", rt);
        fs.mkdirSync(share, { recursive: true }); fs.mkdirSync(mir, { recursive: true });
        fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
          keys: { eCatalogFolder: share, eUiLang: "en" }, teamPins: { [team]: { keyId: LEAD.keyId, public: LEAD.pub } },
          teamKeys: { [team]: { 1: encE6(key.toString("base64")) } }, teamPinFrom: { [team]: "invite" }, teamChannel: { [team]: channel } }), "utf8");
        const D = await loadDesk(ud, src);
        const me = await D.ask("etiuda:branch-identity", true);
        const put6 = text => { fs.writeFileSync(path.join(mir, C.TEAM_NAME), text); };
        const land = text => { put6(text); D.api.heedTeam(); };
        land(teamE6(team, ["quay-board", "pebble-board"], 1, me, D, key, channel));
        const texts = { "quay-board": catOf("quay-board", 1), "pebble-board": catOf("pebble-board", 1) };
        const opened = {};
        for (const id of Object.keys(texts)) {
          const env = JSON.stringify(D.api.sealCatalog(key, team, 1, texts[id]));
          fs.writeFileSync(path.join(mir, id + ".ec"), env);
          opened[id] = D.api.catalogRead(env).json;
          D.api.noteHanded(opened[id], "folder");
        }
        const pinB = D.api.signedSha(D.api.catalogDocIn(texts["quay-board"]));
        D.api.writeInUse(pinB, null);
        const deskDir = path.join(mir, "desks", me.id);
        const copy = async (tail, grewId) => {
          const doc = { format: 2, kind: "etiuda-catalog", id: me.id + "-" + tail, rev: 1, name: "Desk copy " + tail, date: "2026-04-03",
            langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
            cards: [{ id: "c-desk", shelf: "t-op", bodyShape: "plain", title: { en: "Desk" }, body: { en: "A desk copy waits on the bench." } }],
            desk: { id: me.id, key: me.key, box: me.box, name: "North desk" },
            grew: { id: grewId, rev: 1, sha: D.api.signedSha(D.api.catalogDocIn(texts[grewId])) } };
          const w = await D.ask("etiuda:branch-write", "desk-" + tail, JSON.stringify(doc));
          return { ok: !!w && w.ok === true, file: path.join(deskDir, "desk-" + tail + ".ec") };
        };
        const sealedThere = file => { try { return JSON.parse(fs.readFileSync(file, "utf8")).kind === "etiuda-sealed"; } catch { return false; } };
        return { D, me, team, key, channel, land, put6, copy, sealedThere, inUse: path.join(deskDir, "in-use.ec"), texts, opened, ud, mir };
      };

      /* E6b: the landing of a team file that no longer lists B withdraws the desk's team-key working copy of B from the mirror, with
         no ask and no restart; the copy of A, still listed, and the in-use note stay. */
      /* restart: the lead drops B while the desk is closed, and the desk starts on the new file. */
      const e6bScene = async (kind, src, restart) => {
        const d = await e6Desk(kind, src);
        const b = await d.copy("b6b6b6b6", "quay-board"), a = await d.copy("a6a6a6a6", "pebble-board");
        const before = b.ok && a.ok && d.sealedThere(b.file) && d.sealedThere(a.file) && fs.existsSync(d.inUse);
        d.land(teamE6(d.team, ["quay-board", "pebble-board"], 2, d.me, d.D, d.key, d.channel));
        const sameList = fs.existsSync(b.file);
        if (restart) {
          d.put6(teamE6(d.team, ["pebble-board"], 3, d.me, d.D, d.key, d.channel));
          const D2 = await loadDesk(d.ud, src);
          await D2.ask("etiuda:branch-identity", false);
          D2.api.heedTeam();
        } else d.land(teamE6(d.team, ["pebble-board"], 3, d.me, d.D, d.key, d.channel));
        return { before, sameList, bGone: !fs.existsSync(b.file), aKept: fs.existsSync(a.file), inUseKept: fs.existsSync(d.inUse) };
      };
      const b6ok = r => r.before && r.sameList && r.bGone && r.aKept && r.inUseKept;
      const b6r = await e6bScene("relay");
      /* 962s6e6b, the relay half, asserted. Old sentence (folder and relay together): "a team file that stops listing B withdraws the desk's team-key working
         copy of B at its landing, no ask and no restart; A's copy and the in-use note stay". */
      check(b6ok(b6r),
        "962s6e6b on a relay team, a team file that stops listing B withdraws the desk's team-key working copy of B at its landing, no ask and no restart; A's copy and the in-use note stay: "
        + JSON.stringify(b6r));
      const b6s = await e6bScene("relay", undefined, true);
      /* 962s6e6b3, new by relay (it was only ever run by folder, and retired): a desk started after the lead dropped B. */
      check(b6ok(b6s), "962s6e6b3 on a relay team, a desk started after the lead dropped B withdraws its team-key working copy of B at its first heed of the new file, no ask; A's copy and the in-use note stay: " + JSON.stringify(b6s));

      /* E6a: working in B, the desk keeps B loaded when B leaves the team and B's file leaves the mirror, this run and across a
         restart; a pick among the team's other catalogs then chooses none. */
      const e6aScene = async (kind, src) => {
        const d = await e6Desk(kind, src);
        const kept = path.join(d.ud, "catalog-loaded.txt");
        const inB = D2 => D2.api.inUseCatalogId() === "quay-board" && fs.existsSync(kept) && fs.readFileSync(kept, "utf8") === d.opened["quay-board"];
        const before = inB(d.D);
        fs.unlinkSync(path.join(d.mir, "quay-board.ec"));
        d.land(teamE6(d.team, ["pebble-board"], 2, d.me, d.D, d.key, d.channel));
        const live = inB(d.D);
        const D2 = await loadDesk(d.ud, src);
        await D2.ask("etiuda:branch-identity", false);
        const restart = inB(D2);
        const pick = D2.api.pickEdition([{ file: "pebble-board.ec", data: JSON.parse(d.texts["pebble-board"]) }]);
        return { before, live, restart, pickNone: pick === null };
      };
      const a6ok = r => r.before && r.live && r.restart && r.pickNone;
      const a6r = await e6aScene("relay");
      /* 962s6e6a, the relay half, asserted. Old sentence (folder and relay together): "a desk working in B keeps B loaded when B leaves its team and B's file
         leaves the mirror, this run and across a restart, and picks none of the rest". */
      check(a6ok(a6r),
        "962s6e6a on a relay team, a desk working in B keeps B loaded when B leaves its team and B's file leaves the mirror, this run and across a restart, and picks none of the rest: "
        + JSON.stringify(a6r));

      /* cfu1: the lead's own desk opens the team's edition, never the copy the channel kept beside it. In the relay mirror a
         conflict-named copy of a catalog loses to the file it is a copy of whatever its rev (the copy is the computer's own
         parallel edition, and it never went to the team); in a folder a copy that leads still opens, and on a tie the canonical
         name wins. The file the desk picks is read from the list pickEdition is given, in either order. */
      const cfuName = "quay-board", cfuCopy = cfuName + " (conflicted copy 2026-11-22).ec", cfuCanon = cfuName + ".ec";
      /* A desk that holds a team through a shared folder (a pin, no relay, no channel), P4's held folder team: the folder is where its files are and no relay mirror is
         anywhere, so the channel's kept-copy rule has no place to apply. e6Desk("folder") is a relay desk now (P4 left its name), so the folder half is built here. */
      const cfuFolderDesk = async src => {
        const ud = path.join(LAB, "cfu-folder-" + hex(3)), share = path.join(LAB, "cfu-folder-share-" + hex(3)), team = "t-" + hex(8);
        fs.mkdirSync(share, { recursive: true }); fs.mkdirSync(ud, { recursive: true });
        fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: share, eUiLang: "en" },
          teamPins: { [team]: { keyId: LEAD.keyId, public: LEAD.pub } }, teamPinFrom: { [team]: "invite" }, teamShown: { [team]: { folder: share, lead: "Quay lead" } } }), "utf8");
        const D = await loadDesk(ud, src);
        await D.ask("etiuda:branch-identity", true);
        return { D, mir: share };
      };
      const cfuPick = async (kind, copyRev, canonRev, src) => {
        const d = kind === "folder" ? await cfuFolderDesk(src) : await e6Desk(kind, src), out = [];
        const item = (name, rev) => ({ file: path.join(d.mir, name), data: JSON.parse(catOf(cfuName, rev)) });
        for (const order of [[item(cfuCopy, copyRev), item(cfuCanon, canonRev)], [item(cfuCanon, canonRev), item(cfuCopy, copyRev)]]) {
          const got = d.D.api.pickEdition(order);
          out.push(got ? path.basename(got.file) : null);
        }
        return out;
      };
      const cu1 = { relayLead: await cfuPick("relay", 3, 2), relayTie: await cfuPick("relay", 2, 2), folderLead: await cfuPick("folder", 3, 2), folderTie: await cfuPick("folder", 2, 2) };
      const both = (o, want) => o.length === 2 && o[0] === want && o[1] === want;
      check(both(cu1.relayLead, cfuCanon) && both(cu1.relayTie, cfuCanon),
        "cfu1a in the relay mirror the lead's desk opens the team's edition and not the conflict copy beside it, the copy at rev 3 against the team's rev 2, and at the same rev, whichever the order: "
        + JSON.stringify({ lead: cu1.relayLead, tie: cu1.relayTie }));
      check(both(cu1.folderLead, cfuCopy) && both(cu1.folderTie, cfuCanon),
        "cfu1b in a shared folder a conflict copy at the higher rev still opens, as before, and at the same rev the file named as the catalog does: "
        + JSON.stringify({ lead: cu1.folderLead, tie: cu1.folderTie }));
      if (PLANTS_OFF) {
        skip("cfu1c lifting plant:pick-copy-last opens the copy that leads in the relay mirror");
        skip("cfu1d lifting plant:pick-tie-canonical opens the first of two files at the same rev in a folder");
      } else {
        const sc = lifted6("plant:pick-copy-last"), pc = sc ? await cfuPick("relay", 3, 2, sc) : null;
        check(!!pc && pc.indexOf(cfuCopy) >= 0, "cfu1c lifting plant:pick-copy-last opens the copy that leads in the relay mirror (FAIL cfu1a): " + (sc ? JSON.stringify(pc) : "plant line absent"));
        const st = lifted6("plant:pick-tie-canonical"), pt = st ? await cfuPick("folder", 2, 2, st) : null;
        check(!!pt && pt.indexOf(cfuCopy) >= 0, "cfu1d lifting plant:pick-tie-canonical opens the first of two files at the same rev in a folder (FAIL cfu1b): " + (st ? JSON.stringify(pt) : "plant line absent"));
      }

      /* kct1: in the relay mirror only the channel's own tail, " (conflicted copy <date>[ n])", marks a copy that never opens over
         the team's file. A name with any other tail a sync client might use ("-FINAL" reads like a computer's) is a catalog file
         like any other there, and its higher rev opens. */
      const kctPick = async (aName, aRev, bName, bRev, src) => {
        const d = await e6Desk("relay", src), out = [];
        const item = (name, rev) => ({ file: path.join(d.mir, name), data: JSON.parse(catOf(cfuName, rev)) });
        for (const order of [[item(aName, aRev), item(bName, bRev)], [item(bName, bRev), item(aName, aRev)]]) {
          const got = d.D.api.pickEdition(order);
          out.push(got ? path.basename(got.file) : null);
        }
        return out;
      };
      const kctFinal = cfuName + "-FINAL.ec", kctNumbered = cfuName + " (conflicted copy 2026-11-22 2).ec";
      const kc1 = { final: await kctPick(kctFinal, 3, cfuCanon, 2), copy: await kctPick(kctNumbered, 3, cfuCanon, 2) };
      check(both(kc1.final, kctFinal) && both(kc1.copy, cfuCanon),
        "kct1a in the relay mirror a file named " + kctFinal + " at rev 3 opens over " + cfuCanon + " at rev 2, and the channel's own conflicted copy at rev 3 still does not, whichever the order: "
        + JSON.stringify(kc1));
      if (PLANTS_OFF) skip("kct1b lifting plant:pick-kept-tail reads any sync client's tail as the channel's copy");
      else {
        const sk = lifted6("plant:pick-kept-tail"), pk = sk ? await kctPick(kctFinal, 3, cfuCanon, 2, sk) : null;
        check(!!pk && pk.indexOf(cfuCanon) >= 0, "kct1b lifting plant:pick-kept-tail reads any sync client's tail as the channel's copy, so rev 2 opens (FAIL kct1a): " + (sk ? JSON.stringify(pk) : "plant line absent"));
      }

      /* cfu2c: the team's row names the copy the channel kept (the program's list, by file name, in the mirror) for as long as it
         sits there as kept. The stop is put in the channel's record as keepApart puts it (cfu2a drives the real parallel edit),
         because a desk that met one needs two computers of one key; the row is read through the shell's own answer. */
      const cfuRow = async (src, extra) => {
        const d = await e6Desk("relay", src), ch = d.D.api.relayRun();
        const bytes = catOf(cfuName, 3);
        for (const name of [cfuCopy].concat(extra || [])) {
          fs.writeFileSync(path.join(d.mir, name), bytes);
          if (ch) ch.program.state().refused[name] = { sha: sha(Buffer.from(bytes, "utf8")), why: "kept-apart" };
        }
        const rowNow = async () => {
          const v = await d.D.ask("etiuda:team-join", "leads");
          const r = ((v && v.leads) || []).filter(l => l && l.team === d.team)[0];
          return r ? (extra ? { names: r.keptApart || null, more: r.keptApartMore === undefined ? null : r.keptApartMore } : (r.keptApart || null)) : undefined;
        };
        if (extra) return { running: !!ch, row: await rowNow() };
        const shown = await rowNow();
        fs.unlinkSync(path.join(d.mir, cfuCopy));
        return { running: !!ch, shown, gone: await rowNow() };
      };
      const cu2 = await cfuRow();
      check(cu2.running && JSON.stringify(cu2.shown) === JSON.stringify([cfuCopy]) && cu2.gone === null,
        "cfu2c the team's row in the shell's answer names the conflict copy the channel kept, by its file name, and names none once the copy is removed: "
        + JSON.stringify(cu2));
      if (PLANTS_OFF) skip("cfu2d lifting plant:kept-apart-row leaves the copy off the team's row");
      else {
        const sr = lifted6("plant:kept-apart-row"), pr = sr ? await cfuRow(sr) : null;
        check(!!pr && pr.running && pr.shown === null, "cfu2d lifting plant:kept-apart-row leaves the copy off the team's row (FAIL cfu2c): " + (sr ? JSON.stringify(pr) : "plant line absent"));
      }
      /* kam2: with five copies kept, the shell's row names three and counts the other two; with one, it counts none (cfu2c). */
      const kamExtra = [1, 2, 3, 4].map(n => cfuName + " (conflicted copy 2026-11-22 " + (n + 1) + ").ec");
      const km2 = await cfuRow(undefined, kamExtra);
      check(km2.running && km2.row && Array.isArray(km2.row.names) && km2.row.names.length === 3 && km2.row.more === 2,
        "kam2a with five copies kept the team's row in the shell's answer names three and counts two more: " + JSON.stringify(km2));
      if (PLANTS_OFF) skip("kam2b lifting plant:kept-apart-more-row leaves the count off the team's row");
      else {
        const sm = lifted6("plant:kept-apart-more-row"), pm = sm ? await cfuRow(sm, kamExtra) : null;
        check(!!pm && pm.running && pm.row && pm.row.names && pm.row.names.length === 3 && pm.row.more === null,
          "kam2b lifting plant:kept-apart-more-row leaves the count off the team's row (FAIL kam2a): " + (sm ? JSON.stringify(pm) : "plant line absent"));
      }

      if (PLANTS_OFF) {
        skip("962s6e6c2 lifting plant:head-listed keeps naming B on the row");
        skip("962s6e6b2 lifting plant:s6-withdraw-unlisted leaves B's working copy in the mirror");
        skip("962s6e6b4 lifting plant:s6-withdraw-first leaves B's working copy in the mirror across the restart");
        skip("962s6e6a2 lifting plant:pick-in-use-gone unloads B for the team's other catalog");
      } else {
        const sc = lifted6("plant:head-listed"), pc = sc ? await e6cScene(sc) : null;
        check(!!pc && (!!pc.onlyB || !!entryOf(pc.both, "quay-board")), "962s6e6c2 lifting plant:head-listed keeps naming B on the row (FAIL 962s6e6c): "
          + (sc ? "only B " + shownS6(pc.onlyB) + ", both " + shownS6(pc.both) : "plant line absent"));
        const sb = lifted6("plant:s6-withdraw-unlisted"), pb = sb ? await e6bScene("relay", sb) : null;
        check(!!pb && pb.before && !pb.bGone, "962s6e6b2 lifting plant:s6-withdraw-unlisted leaves B's working copy in the mirror (FAIL 962s6e6b): "
          + (sb ? JSON.stringify(pb) : "plant line absent"));
        const sf = lifted6("plant:s6-withdraw-first"), pf = sf ? await e6bScene("relay", sf, true) : null;
        check(!!pf && pf.before && !pf.bGone, "962s6e6b4 lifting plant:s6-withdraw-first leaves B's working copy in the mirror across the restart (FAIL 962s6e6b3): "
          + (sf ? JSON.stringify(pf) : "plant line absent"));
        const sa = lifted6("plant:pick-in-use-gone"), pa = sa ? await e6aScene("relay", sa) : null;
        check(!!pa && pa.before && !pa.pickNone, "962s6e6a2 lifting plant:pick-in-use-gone unloads B for the team's other catalog (FAIL 962s6e6a): "
          + (sa ? JSON.stringify(pa) : "plant line absent"));
      }
    } catch (e) {
      check(false, "962 stage 6 (E6): " + (e && e.stack ? e.stack : e));
    }
  }
  if (partOn("p944g")) {
  markPart("p944g");

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
        try { return JSON.parse(read(mirror, C.TEAM_NAME)).rev === 3; } catch { return false; } }, 30000);
      const KN2 = crypto.randomBytes(32);
      leadKeys.set(2, KN2);
      put(studioMirror, "board.ec", JSON.stringify(D.api.sealCatalog(KN2, TEAM2, 2, catalogText(3))));
      put(studioMirror, C.TEAM_NAME, team2at(2, 1, [meEntry(KN2, 2)]));
      studio2.kick(); await studio2.idle(); studio2.kick(); await studio2.idle();
      const moved = await until(async () => { const ch = D.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); }
        return factsOf(D.api.readCatalog() || "") === 3; }, 30000);
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
      const G = await newDesk("f6-desk", path.join(LAB, "f6-share"));
      put(studio4Mirror, "board.ec", JSON.stringify(G.api.sealCatalog(K4, TEAM4, 1, catalogText(1))));
      put(studio4Mirror, C.TEAM_NAME, team4(1, []));
      const text4 = "etiuda-join:" + Buffer.from(JSON.stringify({ team: TEAM4, relay: { rt: RT4, url: URL2, token: TOK4, inv: INV4 },
        lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay", box: lbox4Pub }, secret: SEC4 }), "utf8").toString("base64url");
      const took = await G.ask("etiuda:team-join", "invite", text4, "Desk Eleven", codeOf(SEC4));
      const boxKept = (((G.envelope().teamJoin || {}).invite || {}).relay || {}).box === lbox4Pub;
      const gme = await G.ask("etiuda:branch-identity", false);
      const gMirror = path.join(G.ud, "relay", RT4);
      const byDesk = () => R.stores.get(RT4).dump().map(([, v]) => JSON.parse(v)).filter(v => v && v.writer === gme.id).length;
      const asked = await until(async () => { const ch = G.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); } return byDesk() > 0; }, 30000);
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
        return factsOf(G.api.readCatalog() || "") === 1; }, 30000);
      check(!took.refused && boxKept && asked && heldNone && atLead && copyGone && joined,
        "945c f6 in the desk's own shell: a relay invitation naming the lead's box, the request sent before the lead put up any copy, the desk"
        + " offline while it is admitted and the invitation let go; back, it finds its own copy by that box and loads the edition: box "
        + (boxKept ? "kept" : "not kept") + ", request " + (asked ? "sent" : "not sent") + " holding " + (heldNone ? "no team file" : "a team file")
        + ", at the lead " + atLead + ", the invitation's copy " + (copyGone ? "let go" : "still served") + ", then "
        + (joined ? "edition 1 loaded" : "nothing loaded: " + G.said.filter(l => l.indexOf("relay") >= 0).slice(-2).join(" / ")));
      /* The first day's F3 at admission: the same desk, the invitation's copy never read, names the team's catalog to its page once
         it holds the key, so an empty desk opens it with nothing pressed (the page's half is tests/team-join.mjs 987e). */
      let namedG = null;
      await until(async () => { const ch = G.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); }
        const v = await G.ask("etiuda:team-join", "view"); if (v && v.opens) namedG = v; return !!namedG; }, 30000);
      check(!!namedG && namedG.opens.team === TEAM4 && namedG.opens.file === "board.ec",
        "987m admitted with no invitation's copy, the relay desk's view names the team's catalog for its page to open: "
        + (namedG ? JSON.stringify(namedG.opens) : "nothing named"));
      const g = G.api.relayRun();
      if (g) await g.stop();
      await studio4.stop();
    }


  /* Board 907: a lead pinned by its own file's vouching is never followed to a relay address. */
  
  const EVIL = "https://evil.test/relay/v1";

  
  const share = path.join(LAB, "self-share");

  
  fs.mkdirSync(share, { recursive: true });

  
  const E = await newDesk("self-desk", share);

  
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

  
  /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring and epoch were read off its team file in the share; a held folder team shows its row and nothing newer, and the relay desk's head checks hold what a team shows. It said what its sentence below says. */
  retire(!ringPinned && wrapPinned && E.api.catalogFolder() === share && !runE && foreign.length === 0
      && E.said.some(l => l.indexOf("does not follow that address") >= 0),
      "942e board 907: a relay file's own ring pins nobody (900i inverted), and a lead pinned by a key it wrapped for this desk, as on a"
      + " folder, is never followed to the relay address it names: ring " + (ringPinned ? "pinned" : "no pin") + ", wrap " + (wrapPinned ? "pinned" : "no pin")
      + ", folder " + (E.api.catalogFolder() === share ? "the share" : E.api.catalogFolder()) + ", calls to the named address " + foreign.length);


  /* The lead forgotten while a relay invitation waits, before the lead has taken it: the relay holds nothing of this desk to
     withdraw, so the request goes with the lead (leave-while-waiting), and the desk goes back to its own folder. */
  
  const shareF = path.join(LAB, "forget-share");

  
  fs.mkdirSync(shareF, { recursive: true });

  
  const F = await newDesk("forget-desk", shareF);

  
  const SECF = hex(16);

  
  const textF = "etiuda-join:" + Buffer.from(JSON.stringify({ team: TEAM2, relay: { rt: RT2, url: URL2, token: hex(32), inv: hex(16) },
      lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret: SECF }), "utf8").toString("base64url");

  
  const takenF = await F.ask("etiuda:team-join", "invite", textF, "Desk Ten", codeOf(SECF));

  
  const onMirror = F.api.catalogFolder() === path.join(F.ud, "relay", RT2);

  
  await F.ask("etiuda:team-join", "forget", TEAM2);

  
  const leftFor = F.api.catalogFolder();

  
  const runF = F.api.relayRun();

  
  const keptF = !!F.envelope().teamJoin;

  
  check(!takenF.refused && onMirror && leftFor === shareF && !runF && !keptF,
      "942g a lead forgotten while a relay invitation waits, before the lead has taken it, takes the desk off the mirror back to its"
      + " folder, no channel runs, and the request goes with the lead: on the mirror " + onMirror + ", then "
      + (leftFor === shareF ? "its folder" : leftFor) + ", channel " + (runF ? "running" : "none") + ", request " + (keptF ? "kept" : "gone"));


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
      const P = await loadDesk(udP);
      const folderP = P.api.catalogFolder();
      regOpts.policy = null;
      await P.ask("etiuda:branch-identity", true);
      const runP = P.api.relayRun();
      await wait(200);
      if (runP) await runP.stop();
      const relayLines = P.said.filter(l => l.indexOf("relay of team") >= 0).length;
      /* RETIRED, P4 (no folder is read as a team): machine policy's TeamFolder is not read, so no policy names a folder that could win over a
         followed relay. It said what its sentence below says. */
      retire(folderP === shareP && !runP && relayLines === 0 && P.said.some(l => l.indexOf("machine policy names the team folder") >= 0),
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
  }

  if (partOn("p921")) {
  markPart("p921");

  /* C7, board 921. A desk takes a relay invitation and the invitation's copy lands. Cancel after the relay has accepted
     withdraws the request at the relay and keeps whatever the invitation gave (hold 4, E4): the desk stays on the mirror and the channel keeps
     running. A folder invitation, and a relay invitation the relay has not accepted, still puts back what it changed. */
  
  try {
      /* The shell `src` loaded over the desk folder `ud` and the envelope already in it, as a restarted desk loads. */
      async function deskLoad(ud, src, serve) {
        const said = [];
        const sent = [];
        const on = {}, invoke = {};
        const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop, info: noop };
        const safeStorage = {
          isEncryptionAvailable: () => true,
          encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
          decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
        };
        const net = { fetch: (url, init) => { const lab = seatLab.labFetch(url, init, R.clock.now); if (lab) return lab; deskTransport.log.push(init.method + " " + url); if (deskTransport.down) return Promise.reject(new Error("down")); return (serve && serve(url, init)) || relayFetch(url, init); } };
        /* A person's desk has a window, and the folder syncer starts only then (catalogFolderChanged returns while
           theWindow is unset). This window is never shown: it records what the page is sent. */
        function DeskWindow() {
          const win = {
            webContents: {
              id: 1,
              send(ch, payload) { sent.push({ ch: ch, payload: payload }); },
              on() { return this; },
              once() { return this; },
              setWindowOpenHandler() {},
              getURL() { return "file:///C:/lab/engine/etiuda.html"; },
              getZoomLevel() { return 0; },
              setZoomLevel() {},
            },
            setBounds() {},
            getBounds() { return { x: 0, y: 0, width: 1280, height: 880 }; },
            getNormalBounds() { return { x: 0, y: 0, width: 1280, height: 880 }; },
            isDestroyed() { return false; },
            isMaximized() { return false; },
            isMinimized() { return false; },
            isVisible() { return false; },
            show() {}, showInactive() {}, focus() {}, close() {}, destroy() {}, maximize() {},
            loadFile() {},
            /* The shell under test is loaded from a lab that holds no built page, so since build on demand it loads its
               own "not built yet" document through loadURL; this window records what the page is sent, not what it shows. */
            loadURL() {},
            setTitle() {},
            once() { return win; },
            on() { return win; },
          };
          return win;
        }
        DeskWindow.getAllWindows = () => [];
        DeskWindow.fromWebContents = () => null;
        const screen = {
          getAllDisplays: () => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }],
          getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
        };
        const electron = {
          app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
            getVersion: () => "0.0.0", whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
          ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
          BrowserWindow: DeskWindow, Menu: inert, dialog: inert, net, protocol: inert, session: directSession, shell: seatLab.labShell(),
          screen, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage, powerMonitor: inert,
        };
        process.env.XDG_CURRENT_DESKTOP = "GNOME";
        const api = seatLab.withSigninLab(() => new Function("require", "__dirname", "__filename", "module", "exports", "console",
          src + "\nreturn { " + EXPOSE.join(", ") + " };")(
          n => (n === "electron" ? electron : (n === "node:fs" || n === "fs") ? signinGuard.shellFs : nodeRequire(n)),
          path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet));
        const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
        const sync = (ch, ...args) => { const ev = eventFor(); if (on[ch]) on[ch](ev, ...args); return ev.returnValue; };
        const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
        const desk = { api, ask, sync, said, sent, ud, envelope };
        await seatLab.seatDesk(desk);
        return desk;
      }
      async function deskFrom(name, folder, src, held, serve) {
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
        let D = await deskFrom("c7-desk-" + tag, share, src, opt.held ? opt.held(team, key, share) : null, serve);
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
        }, 30000);
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
          D = await deskLoad(D.ud, src, serve);
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
        await until(() => !!(running && running.online() === false), 1500);
        /* Kept is still the desk's channel, and kicked it says hello again: a withdrawal lets its session go (the seat's life on the
           channel), so offline for a moment is not stopped. */
        let stopped = !running || D.api.relayRun() !== running;
        if (!stopped) { running.kick(); stopped = !(await until(() => running.online() === true, 3000)); }
        const here = D.api.relayHere();
        const folder = D.api.catalogFolder();
        let after = {};
        try { after = D.envelope(); } catch { after = {}; }
        const still = running && running.online();
        if (running) { try { await running.stop(); } catch { /* already stopped */ } }
        try { await studio.stop(); } catch { /* already stopped */ }
        const pre = !taken.refused && (before === share || before === path.join(D.ud, "folder-mirror", team)) && landed && keyIn && standing && pinned === !opt.unpinned
          && onMirror && wasOnline && !!hereBefore;
        const said = D.said.filter(l => l.indexOf("relay") >= 0 || l.indexOf("team") >= 0).slice(-3).join(" / ");
        return { pre, here, folder, share, stopped, still: !!still, refused: taken && taken.refused, said, team, after,
          file: read(mirror, C.TEAM_NAME) !== null, named: !!(env.teamChannel && env.teamChannel[team]) };
      }
      const got = await cancelScene(fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8"), "leg");
      const gotStays = !!(got.after && got.after.teamJoin && got.after.teamJoin.invite && got.after.teamJoin.invite.relay
        && got.after.teamJoin.invite.relay.withdrawn === true);
      check(got.pre && got.here !== null && got.folder !== got.share && got.stopped === false && gotStays,
        "921a a desk takes a relay invitation, the invitation's copy lands, and cancel after the relay has accepted withdraws the request and keeps the mirror and the channel: "
        + (got.pre ? "the copy had landed" : "the copy had not (" + (got.refused ? "refused " + got.refused : "file " + got.file + ", channel " + got.named) + ")")
        + ", relayHere " + (got.here === null ? "null" : "answers")
        + ", folder " + (got.folder === got.share ? "the one from before" : "the mirror")
        + ", channel " + (got.stopped ? "stopped" : "running")
        + ", withdrawn " + (gotStays ? "yes" : "no")
        + (got.said ? "; " + got.said : ""));
      /* plant:h35-keep. Deleting that line puts the folder back and stops the channel, which is what Cancel did before a relay acceptance was kept. */
      const mainFile = path.join(ROOT, "shell", "main.js");
      const beforeBytes = fs.readFileSync(mainFile);
      const digest = sha(beforeBytes);
      let turned = false, detail = "plant line absent";
      try {
        const lines = beforeBytes.toString("utf8").split(/\n/);
        const at = lines.findIndex(l => l.indexOf("plant:h35-keep") >= 0);
        if (at >= 0) {
          lines.splice(at, 1);
          const lifted = await cancelScene(lines.join("\n"), "plant");
          turned = lifted.pre && lifted.here === null && lifted.folder === lifted.share && lifted.stopped === true;
          detail = (lifted.pre ? "the copy had landed" : "the copy had not (" + (lifted.refused ? "refused " + lifted.refused : "file " + lifted.file + ", channel " + lifted.named) + ")")
            + ", relayHere " + (lifted.here === null ? "null" : "answers")
            + ", folder " + (lifted.folder === lifted.share ? "back" : "the mirror")
            + ", channel " + (lifted.stopped ? "stopped" : "running");
        }
      } catch (e) {
        detail = e && e.message ? e.message : String(e);
      }
      const back = sha(fs.readFileSync(mainFile)) === digest;
      check(turned && back, "921b lifting plant:h35-keep puts the folder back and stops the channel after a relay the relay has accepted, and the product file is never written: "
        + detail + ", sha " + (back ? "restored" : "differs"));

      /* Board 921, the test architect's edits. Cancel before admission puts back what the invitation changed, whatever the desk
         held before it, so each scene starts the desk from a different envelope. A leg reads the envelope the cancel wrote. */
      const LEFT_AT = "2026-09-01T08:30:00.000Z";
      const leadPin = { keyId: LEAD.keyId, public: LEAD.pub };
      const sealedKey = k => Buffer.from(Buffer.from(k.toString("base64"), "utf8").map(b => b ^ 0x5a)).toString("base64");
      const slot = (g, name) => (g.after[name] || {})[g.team];
      const barredHere = g => Array.isArray(g.after.teamBarred) && g.after.teamBarred.indexOf(g.team) >= 0;
      /* A folder invitation (E1): the desk works in its own folder `own`, takes an invitation naming `yard`, and cancels. The
         request it writes lands on the yard and the desk's own folder setting moves there; Cancel puts both back. While the
         invitation is held, the catalog the desk reads is the mirror of that team, not the yard. */
      async function folderScene(src, tag, opt) {
        opt = opt || {};
        const team = "t-" + hex(8), secret = hex(16);
        const own = path.join(LAB, "c8-own-" + tag), yard = path.join(LAB, "c8-yard-" + tag);
        fs.mkdirSync(yard, { recursive: true });
        const D = await deskFrom("c8-desk-" + tag, own, src, opt.held ? opt.held(team) : null);
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
        const mirror = path.join(D.ud, "folder-mirror", team);
        const pre = !taken.refused && requests() === 1 && !!env.teamJoin && env.keys.eCatalogFolder === yard && D.api.catalogFolder() === mirror
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
      /* A relay cancel after the relay has accepted: the request is withdrawn, the mirror stays, the channel stays. */
      const relayStays = g => {
        const r = g.after && g.after.teamJoin && g.after.teamJoin.invite && g.after.teamJoin.invite.relay;
        return !!(r && r.withdrawn === true);
      };
      const keptOn = g => g.here !== null && g.folder !== g.share && g.stopped === false && relayStays(g);
      const verdict = {
        pin: g => keptOn(g) && JSON.stringify(slot(g, "teamPins")) === JSON.stringify(leadPin) && slot(g, "teamPinFrom") === "invite"
          && !!slot(g, "teamShown") && !!slot(g, "teamChannel"),
        left: g => keptOn(g) && slot(g, "teamLeft") === undefined && !barredHere(g)
          && JSON.stringify(slot(g, "teamPins")) === JSON.stringify(leadPin) && slot(g, "teamPinFrom") === "invite"
          && !!slot(g, "teamChannel"),
        key: g => keptOn(g) && !!slot(g, "teamKeys") && JSON.stringify(slot(g, "teamPins")) === JSON.stringify(leadPin)
          && slot(g, "teamPinFrom") === "invite" && !!slot(g, "teamChannel"),
        twice: g => keptOn(g) && JSON.stringify(slot(g, "teamPins")) === JSON.stringify(leadPin)
          && slot(g, "teamPinFrom") === "invite" && !!slot(g, "teamChannel"),
        fresh: g => folderBack(g) && slot(g, "teamPins") === undefined,
        ftwice: g => folderBack(g) && slot(g, "teamPins") === undefined,
        fleft: g => folderBack(g) && slot(g, "teamPins") === undefined && slot(g, "teamLeft") === LEFT_AT && barredHere(g),
        restart: g => keptOn(g) && JSON.stringify(slot(g, "teamPins")) === JSON.stringify(leadPin) && slot(g, "teamPinFrom") === "invite"
          && !!slot(g, "teamShown") && slot(g, "teamShown").lead === "Ada Quay" && slot(g, "teamShown").folder !== g.share
          && !!slot(g, "teamChannel"),
        admit: g => keptOn(g) && !!slot(g, "teamKeys") && JSON.stringify(slot(g, "teamPins")) === JSON.stringify(leadPin)
          && slot(g, "teamPinFrom") === "invite" && !!slot(g, "teamChannel"),
        tamper: g => g.kept === false,
        /* E4. The wrap's key stays and the leave stays lifted, because the relay has accepted, and the request is withdrawn. */
        wrap: g => keptOn(g) && !!slot(g, "teamKeys") && slot(g, "teamLeft") === undefined && !barredHere(g)
          && JSON.stringify(slot(g, "teamPins")) === JSON.stringify(leadPin) && slot(g, "teamPinFrom") === "invite"
          && !!slot(g, "teamChannel"),
        wraphold: g => keptOn(g) && typeof (slot(g, "teamKeys") || {})[1] === "string" && slot(g, "teamPinFrom") === "invite",
        wraprestart: g => keptOn(g) && !!slot(g, "teamKeys") && slot(g, "teamPinFrom") === "invite"
          && !!slot(g, "teamShown") && slot(g, "teamShown").lead === "Ada Quay",
        wrapretake: g => keptOn(g) && !!slot(g, "teamKeys") && slot(g, "teamLeft") === undefined && !barredHere(g)
          && slot(g, "teamPinFrom") === "invite" && !!slot(g, "teamChannel"),
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
        + ", join " + (g.after.teamJoin === undefined ? "gone" : "standing")
        + ", withdrawn " + (relayStays(g) ? "yes" : "no");
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
        "921c a desk that held the lead's pin before a relay invitation the relay has accepted, and cancels, withdraws the request and stays on the relay: "
        + told(scenes.pin));
      check(scenes.left.pre && verdict.left(scenes.left),
        "921d a desk that had left the team, and cancels a relay invitation the relay has accepted, stays on the relay and the leave stays lifted: "
        + told(scenes.left));
      check(scenes.key.pre && verdict.key(scenes.key),
        "921e a desk that held the team's key before a relay invitation the relay has accepted, and cancels, keeps that key, withdraws the request and stays on the relay: "
        + told(scenes.key));
      check(scenes.twice.pre && verdict.twice(scenes.twice),
        "921f a desk that takes the same relay invitation twice, and cancels after the relay has accepted, withdraws the request and stays on the relay: "
        + told(scenes.twice));
      /* RETIRED, P2 (join by a shared folder is removed, the sizing's piece): the check holds a folder invitation taken, cancelled or finished through the share; no folder is read as a team, so it is retired with P4 and not left red. It said what its sentence below says. */
      retire(scenes.fresh.pre && verdict.fresh(scenes.fresh),
        "921j a desk that takes a folder invitation and cancels it before the lead admits it is back as before: the pin, the shown team and the request on the"
        + " share gone, and its own folder setting again: " + toldFolder(scenes.fresh));
      /* RETIRED, P2 (join by a shared folder is removed, the sizing's piece): the check holds a folder invitation taken, cancelled or finished through the share; no folder is read as a team, so it is retired with P4 and not left red. It said what its sentence below says. */
      retire(scenes.ftwice.pre && verdict.ftwice(scenes.ftwice),
        "921k a desk that takes the same folder invitation twice and cancels is back as it was before the first: " + toldFolder(scenes.ftwice));
      /* RETIRED, P2 (join by a shared folder is removed, the sizing's piece): the check holds a folder invitation taken, cancelled or finished through the share; no folder is read as a team, so it is retired with P4 and not left red. It said what its sentence below says. */
      retire(scenes.fleft.pre && verdict.fleft(scenes.fleft),
        "921l a desk that had left the team, and cancels a folder invitation before it is admitted, has its leave record and its bar again: " + toldFolder(scenes.fleft));
      check(scenes.restart.pre && verdict.restart(scenes.restart),
        "921m a desk stopped and loaded again from desk.json between a relay invitation and its Cancel, after the relay has accepted, withdraws the request and stays on the relay: "
        + told(scenes.restart));
      check(scenes.admit.pre && verdict.admit(scenes.admit),
        "921n a desk that keeps a key newer than the one it held at the invitation which the invitation's wrap did not give, and cancels after the relay has accepted,"
        + " withdraws the request, keeps the key and stays on the relay: " + told(scenes.admit));
      check(scenes.tamper.pre && verdict.tamper(scenes.tamper),
        "921o a snapshot whose mark of the key held is not a count is not read back from desk.json, and the request that carried it is not kept: the request "
        + (scenes.tamper.kept ? "was kept" : "was dropped"));
      check(scenes.wrap.pre && verdict.wrap(scenes.wrap),
        "921u a desk that had left the team, takes a relay invitation whose wrap opens the team key, and cancels after the relay has accepted, keeps that key, withdraws the request"
        + " and the leave stays lifted: " + told(scenes.wrap));
      check(scenes.wraphold.pre && verdict.wraphold(scenes.wraphold),
        "921v a desk that held the team's key before the invitation, and cancels after the wrap opened that epoch and the relay has accepted, keeps the key and withdraws the request: "
        + told(scenes.wraphold));
      check(scenes.wraprestart.pre && verdict.wraprestart(scenes.wraprestart),
        "921w a desk stopped and loaded again from desk.json after the invitation's wrap opened the team key, and cancels after the relay has accepted, keeps that key and withdraws the request: "
        + told(scenes.wraprestart));
      check(scenes.wrapbad.pre && verdict.wrapbad(scenes.wrapbad),
        "921x a list of the epochs the wrap gave a key for that is not a list of counts is not read back from desk.json, and the request that carried it is not kept: the request "
        + (scenes.wrapbad.kept ? "was kept" : "was dropped"));
      check(scenes.wrapretake.pre && verdict.wrapretake(scenes.wrapretake),
        "921y a desk that takes the invitation a second time after its wrap opened the team key, and cancels after the relay has accepted, keeps that key and withdraws the request: "
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
      const liftedKeep = await planted(dropLine("plant:h35-keep"), ["pin", "left", "twice", "key"]);
      const liftedCancel = await planted(dropLine("plant:c7-cancel"), ["fresh"]);
      /* RETIRED, P2 (join by a shared folder is removed, the sizing's piece): the check holds a folder invitation taken, cancelled or finished through the share; no folder is read as a team, so it is retired with P4 and not left red. It said what its sentence below says. */
      retire(red(liftedKeep, ["pin", "left", "twice", "key"]) && red(liftedCancel, ["fresh"]) && liftedKeep.back && liftedCancel.back,
        "921g lifting plant:h35-keep reddens 921c, 921d, 921e and 921f, and lifting plant:c7-cancel reddens 921j, and the product file is never written: "
        + redTold(liftedKeep, ["pin", "left", "twice", "key"]) + "; " + redTold(liftedCancel, ["fresh"])
        + ", sha " + (liftedKeep.back && liftedCancel.back ? "restored" : "differs"));
      const clause = await planted(dropLine("plant:h35-keep"), ["admit"]);
      check(red(clause, ["admit"]) && clause.back,
        "921h lifting plant:h35-keep reddens 921n, because a relay cancel after acceptance no longer reaches the epoch clause, and the product file is never written: "
        + redTold(clause, ["admit"]) + ", sha " + (clause.back ? "restored" : "differs"));
      const chain = await planted(dropText("plant:c7-chain", "kept || "), ["ftwice"]);
      /* RETIRED, P2 (join by a shared folder is removed, the sizing's piece): the check holds a folder invitation taken, cancelled or finished through the share; no folder is read as a team, so it is retired with P4 and not left red. It said what its sentence below says. */
      retire(red(chain, ["ftwice"]) && chain.back,
        "921i lifting plant:c7-chain, the snapshot the first folder invitation took, reddens 921k; a relay cancel after acceptance does not consult it, and the product file is never written: "
        + redTold(chain, ["ftwice"]) + ", sha " + (chain.back ? "restored" : "differs"));
      const mark = await planted(dropLine("plant:h35-keep"), ["key"]);
      check(red(mark, ["key"]) && mark.back,
        "921p lifting plant:h35-keep reddens 921e: the key held at the invitation is no longer what holds a relay cancel after acceptance, and the product file is never written: "
        + redTold(mark, ["key"]) + ", sha " + (mark.back ? "restored" : "differs"));
      const folderSnap = await planted(swapText("plant:c8-before", "inviteBeforeFor(parsed.team, keptJoin)", "undefined"), ["fresh", "ftwice", "fleft"]);
      /* RETIRED, P2 (join by a shared folder is removed, the sizing's piece): the check holds a folder invitation taken, cancelled or finished through the share; no folder is read as a team, so it is retired with P4 and not left red. It said what its sentence below says. */
      retire(red(folderSnap, ["fresh", "ftwice", "fleft"]) && folderSnap.back,
        "921q lifting plant:c8-before, the snapshot a folder invitation takes, reddens 921j, 921k and 921l, and the product file is never written: " + redTold(folderSnap, ["fresh", "ftwice", "fleft"]) + ", sha " + (folderSnap.back ? "restored" : "differs"));
      const ownSet = await planted(dropLine("plant:c8-own"), ["fresh"]);
      /* RETIRED, P2 (join by a shared folder is removed, the sizing's piece): the check holds a folder invitation taken, cancelled or finished through the share; no folder is read as a team, so it is retired with P4 and not left red. It said what its sentence below says. */
      retire(red(ownSet, ["fresh"]) && ownSet.back,
        "921r lifting plant:c8-own, the folder setting put back, reddens 921j, and the product file is never written: " + redTold(ownSet, ["fresh"]) + ", sha " + (ownSet.back ? "restored" : "differs"));
      const kept = await planted(swapText("plant:c7-kept", "beforeKept(inv.before)", "false"), ["restart"]);
      check(red(kept, ["restart"]) && kept.back,
        "921s lifting plant:c7-kept, so the envelope refuses every snapshot, reddens 921m, and the product file is never written: " + redTold(kept, ["restart"]) + ", sha " + (kept.back ? "restored" : "differs"));
      const epoch = await planted(swapText("plant:c7-epoch", "(Number.isInteger(b.epoch) && b.epoch >= 0)", "true"), ["tamper"]);
      check(red(epoch, ["tamper"]) && epoch.back,
        "921t lifting plant:c7-epoch, the check that the mark is a count, reddens 921o, and the product file is never written: " + redTold(epoch, ["tamper"]) + ", sha " + (epoch.back ? "restored" : "differs"));
      const markLift = await planted(dropLine("plant:h35-keep"), ["wrap", "wraprestart", "wrapretake"]);
      check(red(markLift, ["wrap", "wraprestart", "wrapretake"]) && markLift.back,
        "921z lifting plant:h35-keep reddens 921u, 921w and 921y: the wrap's mark is no longer what holds a cancel after the relay has accepted, and the product file is never written: "
        + redTold(markLift, ["wrap", "wraprestart", "wrapretake"]) + ", sha " + (markLift.back ? "restored" : "differs"));
      const hadLift = await planted(dropLine("plant:h35-keep"), ["wraphold"]);
      check(red(hadLift, ["wraphold"]) && hadLift.back,
        "921aa lifting plant:h35-keep reddens 921v: a key the desk already held is no longer what holds a cancel after the relay has accepted, and the product file is never written: "
        + redTold(hadLift, ["wraphold"]) + ", sha " + (hadLift.back ? "restored" : "differs"));
      const skipLift = await planted(dropLine("plant:h35-keep"), ["wrap", "wraprestart", "wrapretake"]);
      check(red(skipLift, ["wrap", "wraprestart", "wrapretake"]) && skipLift.back,
        "921ab lifting plant:h35-keep reddens 921u, 921w and 921y: Cancel after acceptance no longer compares the wrap's epochs with the mark, and the product file is never written: "
        + redTold(skipLift, ["wrap", "wraprestart", "wrapretake"]) + ", sha " + (skipLift.back ? "restored" : "differs"));
      const forgetLift = await planted(dropLine("plant:h35-keep"), ["wrap", "wraprestart", "wrapretake"]);
      check(red(forgetLift, ["wrap", "wraprestart", "wrapretake"]) && forgetLift.back,
        "921ac lifting plant:h35-keep reddens 921u, 921w and 921y: the wrap's keys are no longer forgotten on a cancel after the relay has accepted, and the product file is never written: "
        + redTold(forgetLift, ["wrap", "wraprestart", "wrapretake"]) + ", sha " + (forgetLift.back ? "restored" : "differs"));
      const wrappedLift = await planted(swapText("plant:e4-wrapped", "(Array.isArray(r.wrapped) && r.wrapped.length <= 64 && r.wrapped.every(n => Number.isInteger(n) && n >= 1))", "true"), ["wrapbad"]);
      check(red(wrappedLift, ["wrapbad"]) && wrappedLift.back,
        "921ad lifting plant:e4-wrapped, the check that the wrap's epochs are counts, reddens 921x, and the product file is never written: " + redTold(wrappedLift, ["wrapbad"]) + ", sha " + (wrappedLift.back ? "restored" : "differs"));
      const gaveLift = await planted(dropLine("plant:h35-keep"), ["wrapretake"]);
      check(red(gaveLift, ["wrapretake"]) && gaveLift.back,
        "921ae lifting plant:h35-keep reddens 921y: the epochs the first wrap gave are no longer what holds a second invitation's cancel after the relay has accepted, and the product file is never written: "
        + redTold(gaveLift, ["wrapretake"]) + ", sha " + (gaveLift.back ? "restored" : "differs"));

      /* C6, board 923: a desk that already keeps the key of the team's epoch takes an invitation, and the lead admits it at that
         epoch with the next rev. Admission does not rotate the key, so the join finishes on the roster that names this desk with
         a wrap it opened. The lead's file is written only on the share. The desk's window is open, so the folder syncer copies
         each rev into the mirror and the heed that follows is the one the page is offered. Nothing is planted in the mirror.
         `named` is a yard whose rev 1 already names this desk, and the floor kept from before the invitation is that rev: a
         roster read before the request is never its answer, and the join waits for the lead's rev 2. */
      async function heldJoin(src, tag, named) {
        const team = "t-" + hex(8), secret = hex(16), key = crypto.randomBytes(32);
        const own = path.join(LAB, "c6-own-" + tag), yard = path.join(LAB, "c6-yard-" + tag);
        fs.mkdirSync(yard, { recursive: true });
        const doc = (rev, roster) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: team, catalogs: ["quay-board"],
          lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev, roster }, LEAD), null, 1) + "\n";
        const D = await deskFrom("c6-desk-" + tag, own, src, Object.assign({ teamPins: { [team]: leadPin }, teamKeys: { [team]: { 1: sealedKey(key) } } },
          named ? { teamRevSeen: { [team]: { [LEAD.pub]: { epoch: 1, rev: 1 } } } } : {}));
        D.api.createWindow();
        const pre = await D.ask("etiuda:branch-identity", true);
        const entryOf = () => ({ desk: { id: pre.id, key: pre.key, box: pre.box }, wrap: D.api.wrapTeamKey(key, pre.box, team, 1, pre.id) });
        put(yard, C.TEAM_NAME, doc(1, named ? [entryOf()] : []));
        const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team, folder: yard,
          lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret }), "utf8").toString("base64url");
        const taken = await D.ask("etiuda:team-join", "invite", text, "Desk North", codeOf(secret));
        const joinAt = path.join(yard, "desks", pre.id, "join.json");
        const mirrorTeam = path.join(D.ud, "folder-mirror", team, C.TEAM_NAME);
        const mirrorRev = () => { try { return JSON.parse(fs.readFileSync(mirrorTeam, "utf8")).rev; } catch { return 0; } };
        const asked = !taken.refused && fs.existsSync(joinAt) && !!D.envelope().teamJoin && D.envelope().teamJoin.held === 1;
        const sawFirst = await until(() => mirrorRev() >= 1, 8000);
        const waited = fs.existsSync(joinAt) && !!D.envelope().teamJoin;
        put(yard, C.TEAM_NAME, doc(2, [entryOf()]));
        const sawNext = await until(() => mirrorRev() >= 2, 8000);
        const view = await D.ask("etiuda:team-join", "view");
        const toldJoin = (D.sent || []).some(s => s.ch === "etiuda:team-join" && s.payload && s.payload.joined && s.payload.joined.team === team);
        const joined = !!(view && view.joined && view.joined.team === team) || toldJoin;
        try { const s = D.api.folderSyncerRun(); if (s && s.stop) s.stop(); } catch { /* already stopped */ }
        return { asked, waited, refused: taken.refused, gone: !fs.existsSync(joinAt), join: D.envelope().teamJoin, joined: joined, brought: sawFirst && sawNext };
      }
      const heldTold = g => (g.asked ? "asked" : "not asked" + (g.refused ? " (refused " + g.refused + ")" : "")) + ", before rev 2 the request "
        + (g.waited ? "waited" : "was let go") + ", after it join.json " + (g.gone ? "deleted" : "still there") + ", the join " + (g.join ? "standing" : "gone")
        + ", the mirror " + (g.brought ? "took both revs" : "missed a rev")
        + ", said " + (g.joined ? "joined" : "nothing");
      const heldOk = g => g.asked && g.gone && !g.join && g.joined && g.brought;
      try {
        const mainNow = fs.readFileSync(mainFile, "utf8");
        const h = await heldJoin(mainNow, "held", false);
        /* RETIRED, P2 (join by a shared folder is removed, the sizing's piece): the check holds a folder invitation taken, cancelled or finished through the share; no folder is read as a team, so it is retired with P4 and not left red. It said what its sentence below says. */
        retire(heldOk(h), "923c a desk holding the key of the team's epoch takes an invitation, and the lead's next rev, written on the share and brought into the mirror by the folder syncer, names it with a wrap it opens: the join finishes: " + heldTold(h));
        const n = await heldJoin(mainNow, "named", true);
        /* RETIRED, P2 (join by a shared folder is removed, the sizing's piece): the check holds a folder invitation taken, cancelled or finished through the share; no folder is read as a team, so it is retired with P4 and not left red. It said what its sentence below says. */
        retire(heldOk(n) && n.waited, "923d a roster heeded before the invitation that already names this desk does not finish the join, and the lead's rev 2, brought into the mirror by the folder syncer, does: " + heldTold(n));
        const nameBytes = sha(fs.readFileSync(mainFile));
        const liftedNamed = dropLine("plant:c6-named")(mainNow);
        const ln = liftedNamed === null ? null : await heldJoin(liftedNamed, "plant-held", false);
        /* RETIRED, P2: 923e lifted the plant of 923c and 923d, which hold a folder invitation taken through the share (retired above); no such invitation is taken, so the lift has nothing to redden. */
        retire(!!ln && ln.asked && !heldOk(ln) && sha(fs.readFileSync(mainFile)) === nameBytes,
          "923e lifting plant:c6-named reddens 923c, and the product file is never written: " + (ln ? heldTold(ln) : "plant line absent"));
        const liftedFresh = swapText("plant:c6-fresh", "raised && ", "")(mainNow);
        const lf = liftedFresh === null ? null : await heldJoin(liftedFresh, "plant-named", true);
        /* RETIRED, P2 (join by a shared folder is removed, the sizing's piece): the check holds a folder invitation taken, cancelled or finished through the share; no folder is read as a team, so it is retired with P4 and not left red. It said what its sentence below says. */
        retire(!!lf && !lf.refused && !lf.waited && sha(fs.readFileSync(mainFile)) === nameBytes,
          "923f lifting plant:c6-fresh finishes the join on the roster heeded before the invitation, reddening 923d, and the product file is never written: " + (lf ? heldTold(lf) : "plant line absent"));
      } catch (e) {
        check(false, "harness (the legs 923c): " + (e && e.stack ? e.stack : e));
      }

      /* Holds 3 and 4. A desk the lead has taken off the relay is told and stops asking. An invitation registered before that
         removal is refused without being spent, and the card says a new one is needed. Cancelling after the relay has accepted
         withdraws the request and keeps the key. */
      const mainNow = fs.readFileSync(mainFile, "utf8");
      const enrolDesk = async (rt, rev, list) => {
        R.clock.now += 1;
        const t = R.clock.now;
        return admin("POST", "/relay/v1/t/" + rt + "/devices", { keys: list, rev, t, sig: signHex(LEAD, core.devicesBytes(rt, rev, t, list)) });
      };
      const invRec = (rt, inv) => {
        let raw = null;
        try { raw = R.stores.get(rt).get("inv:" + inv); } catch { raw = null; }
        if (raw == null) return null;
        return typeof raw === "string" ? JSON.parse(raw) : raw;
      };
      try {
        const rt = hex(16), team = "t-" + hex(8), key = crypto.randomBytes(32), share = path.join(LAB, "h35-removed-share");
        R.clock.now += 1;
        const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
        const D = await deskFrom("h35-removed", share, mainNow, { teamPins: { [team]: leadPin }, teamPinFrom: { [team]: "answer" },
          teamChannel: { [team]: { kind: "relay", rt, url: URLV1 } }, teamKeys: { [team]: { 1: sealedKey(key) } },
          teamShown: { [team]: { lead: "Ada Quay", folder: share } } });
        const me = await D.ask("etiuda:branch-identity", true);
        const row = me && me.id ? [{ id: me.id, pub: me.key, desk: me.id }] : [];
        const enrolled = row.length ? await enrolDesk(rt, 1, row) : { status: 0 };
        deskTransport.down = false;
        const online = await until(async () => {
          const c = D.api.relayRun();
          if (c) { c.kick(); await c.idle(); }
          return !!(c && c.online());
        }, 30000);
        const dropped = await enrolDesk(rt, 2, []);
        const ch = D.api.relayRun();
        if (ch) { ch.kick(); await ch.idle(); }
        const view = await D.ask("etiuda:team-join", "state");
        const lead = view && Array.isArray(view.leads) ? view.leads.filter(l => l.team === team)[0] : null;
        const told = !!(lead && lead.removed === true && lead.relayRemoved === true);
        const mark = deskTransport.log.length;
        if (ch) { ch.kick(); await ch.idle(); }
        const grew = deskTransport.log.length - mark;
        const quiet = grew === 0;
        const goneHere = await until(() => D.api.relayHere() === null, 30000);
        try { await D.ask("etiuda:team-join", "leave", team); } catch { /* the measurements above stand */ }
        if (ch) { try { await ch.stop(); } catch { /* already stopped */ } }
        check(made.status === 200 && enrolled.status === 200 && dropped.status === 200 && online && told && quiet && goneHere,
          "993a a desk the lead removed is told, stops asking the relay, and no longer follows it: made " + made.status
          + ", enrol " + enrolled.status + ", removed " + dropped.status + ", online " + online
          + ", told " + (told ? "yes" : (lead ? JSON.stringify({ removed: lead.removed, relayRemoved: lead.relayRemoved }) : "no lead"))
          + ", quiet " + quiet + " (further asks " + grew + "), here " + (goneHere ? "quiet" : "still answers"));
      } catch (e) {
        check(false, "993a threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const lines = mainNow.split(/\n/);
        const at = lines.findIndex(l => l.indexOf("= true; /* plant:h35-gone */") >= 0);
        let turned = false, detail = "plant line absent";
        if (at >= 0) {
          lines.splice(at, 1);
          const rt = hex(16), team = "t-" + hex(8), key = crypto.randomBytes(32), share = path.join(LAB, "h35-gone-share");
          R.clock.now += 1;
          await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
          const D = await deskFrom("h35-gone", share, lines.join("\n"), { teamPins: { [team]: leadPin }, teamPinFrom: { [team]: "answer" },
            teamChannel: { [team]: { kind: "relay", rt, url: URLV1 } }, teamKeys: { [team]: { 1: sealedKey(key) } },
            teamShown: { [team]: { lead: "Ada Quay", folder: share } } });
          const me = await D.ask("etiuda:branch-identity", true);
          const row = me && me.id ? [{ id: me.id, pub: me.key, desk: me.id }] : [];
          if (row.length) await enrolDesk(rt, 1, row);
          deskTransport.down = false;
          await until(async () => {
            const c = D.api.relayRun();
            if (c) { c.kick(); await c.idle(); }
            return !!(c && c.online());
          }, 30000);
          await enrolDesk(rt, 2, []);
          const ch = D.api.relayRun();
          if (ch) { ch.kick(); await ch.idle(); }
          const mark = deskTransport.log.length;
          const grew = await until(() => deskTransport.log.length > mark, 30000);
          const here = D.api.relayHere();
          const view = await D.ask("etiuda:team-join", "state");
          const lead = view && Array.isArray(view.leads) ? view.leads.filter(l => l.team === team)[0] : null;
          const told = !!(lead && lead.removed === true && lead.relayRemoved === true);
          turned = !told && here !== null && grew;
          detail = "told " + (told ? "yes" : "no") + ", here " + (here ? "answers" : "null") + ", transport " + (grew ? "grew" : "quiet");
          try { await D.ask("etiuda:team-join", "leave", team); } catch { /* quench the plant-lifted restart */ }
          const live = D.api.relayRun();
          if (live) { try { await live.stop(); } catch { /* already stopped */ } }
        }
        const back = sha(fs.readFileSync(mainFile)) === sha(Buffer.from(mainNow));
        check(turned && back, "993c lifting plant:h35-gone, the desk still follows: the window stays untold, relayHere answers, and the transport grows (FAIL 993c the desk does not follow after the removal: transport quiet): "
          + detail + ", sha " + (back ? "restored" : "differs"));
      } catch (e) {
        check(false, "993c threw: " + (e && e.stack ? e.stack : e));
      }
      /* Remove, re-add, and the next edition lands. The leg asks relayRun itself, so it does not wait out the minute's probe. */
      async function readdScene(src, tag, ceiling) {
        const rt = hex(16), team = "t-" + hex(8), key = crypto.randomBytes(32), share = path.join(LAB, "h35-readd-" + tag);
        R.clock.now += 1;
        const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
        const pin = { teamId: team, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
        const teamFile = rev => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: team, catalogs: ["quay-board"],
          lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev,
          channel: { kind: "relay", rt, url: URLV1 }, ring: RING, roster: [] }, LEAD), null, 1) + "\n";
        const studioT = transport("h35-readd-" + tag), studioMirror = path.join(LAB, "h35-readd-studio-" + tag);
        const studio = C.createChannel({ rt, url: URLV1, mirror: studioMirror, stateFile: path.join(LAB, "h35-readd-" + tag + ".json"),
          pin: () => pin, me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }),
          keyFor: e => (e === 1 ? key : null), sealEpoch: () => 1, inviteKeys: () => [],
          request: studioT.request, connect: studioT.connect, pollMs: 1e9 });
        const D = await deskFrom("h35-readd-desk-" + tag, share, src, { teamPins: { [team]: leadPin }, teamPinFrom: { [team]: "answer" },
          teamChannel: { [team]: { kind: "relay", rt, url: URLV1 } }, teamKeys: { [team]: { 1: sealedKey(key) } },
          teamShown: { [team]: { lead: "Ada Quay", folder: share } } });
        const me = await D.ask("etiuda:branch-identity", true);
        const row = me && me.id ? [{ id: me.id, pub: me.key, desk: me.id }] : [];
        const enrolled = row.length ? await enrolDesk(rt, 1, row) : { status: 0 };
        put(studioMirror, "board.ec", JSON.stringify(D.api.sealCatalog(key, team, 1, catalogText(1))));
        put(studioMirror, C.TEAM_NAME, teamFile(1));
        studio.start();
        await studio.idle();
        deskTransport.down = false;
        const first = await until(async () => {
          const c = D.api.relayRun();
          if (c) { c.kick(); await c.idle(); }
          return !!(c && c.online() && factsOf(D.api.readCatalog() || "") === 1);
        }, 30000);
        const dropped = await enrolDesk(rt, 2, []);
        const ch0 = D.api.relayRun();
        if (ch0) { ch0.kick(); await ch0.idle(); }
        const hushed = await until(() => D.api.relayHere() === null, 30000);
        put(studioMirror, "board.ec", JSON.stringify(D.api.sealCatalog(key, team, 1, catalogText(2))));
        put(studioMirror, C.TEAM_NAME, teamFile(2));
        await studio.kick(); await studio.idle();
        const whileHushed = factsOf(D.api.readCatalog() || "");
        const back = await enrolDesk(rt, 3, row);
        const standing = R.stores.get(rt).dump().some(([k, v]) => {
          if (!String(k).startsWith("ses:")) return false;
          let s = null;
          try { s = JSON.parse(v); } catch { s = null; }
          return !!(s && s.removed === true && s.key === me.id);
        });
        const followed = await until(async () => {
          const c = D.api.relayHere() === null ? D.api.relayProbe() : D.api.relayRun();
          if (c) { c.kick(); await c.idle(); }
          return D.api.relayHere() !== null && factsOf(D.api.readCatalog() || "") === 2;
        }, ceiling || 30000);
        let env = {};
        try { env = D.envelope(); } catch { env = {}; }
        const gone = !!(env.teamRelayGone && env.teamRelayGone[team]);
        const here = D.api.relayHere();
        const rev = factsOf(D.api.readCatalog() || "");
        try { await D.ask("etiuda:team-join", "leave", team); } catch { /* quench */ }
        const live = D.api.relayRun();
        if (live) { try { await live.stop(); } catch { /* already stopped */ } }
        try { await studio.stop(); } catch { /* already stopped */ }
        return { made: made.status, enrolled: enrolled.status, dropped: dropped.status, back: back.status,
          first, hushed, whileHushed, standing, followed, gone, here: here !== null, rev, id: me && me.id };
      }
      try {
        const g = await readdScene(mainNow, "land");
        const landed = g.made === 200 && g.enrolled === 200 && g.dropped === 200 && g.back === 200 && g.first && g.hushed
          && g.whileHushed !== 2 && !g.standing && g.followed && !g.gone && g.here && g.rev === 2;
        check(landed, "993j a desk the lead removed and then enrols again follows on the relay's own evidence, keeps no removed session, and the next edition lands: "
          + JSON.stringify(g));
      } catch (e) {
        check(false, "993j threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const lines = mainNow.split(/\n/);
        const at = lines.findIndex(l => l.indexOf("plant:h35-return") >= 0);
        let turned = false, detail = "plant line absent";
        if (at >= 0) {
          lines.splice(at, 1);
          const g = await readdScene(lines.join("\n"), "plant", 8000);
          turned = g.first && g.hushed && g.back === 200 && !g.here && g.rev !== 2;
          detail = "here " + (g.here ? "answers" : "null") + ", rev " + g.rev + ", first " + g.first;
        }
        const back = sha(fs.readFileSync(mainFile)) === sha(Buffer.from(mainNow));
        check(turned && back, "993k lifting plant:h35-return leaves the desk hushed after a fresh hello, so the next edition does not land (FAIL 993j a desk the lead removed and then enrols again follows on the relay's own evidence, keeps no removed session, and the next edition lands: relayHere null, rev not 2): "
          + detail + ", sha " + (back ? "restored" : "differs"));
      } catch (e) {
        check(false, "993k threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const rt = hex(16), team = "t-" + hex(8), share = path.join(LAB, "h35-old-share");
        R.clock.now += 1;
        const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
        const D = await deskFrom("h35-old", share, mainNow, null);
        const me = await D.ask("etiuda:branch-identity", true);
        const row = me && me.id ? [{ id: me.id, pub: me.key, desk: me.id }] : [];
        const enrolled = row.length ? await enrolDesk(rt, 1, row) : { status: 0 };
        const secret = hex(16), inv = hex(16), token = hex(32);
        R.clock.now += 1;
        const tInv = R.clock.now;
        const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }];
        const invited = await admin("POST", "/relay/v1/t/" + rt + "/invites", { add, drop: [], t: tInv,
          sig: signHex(LEAD, core.invitesBytes(rt, tInv, add, [])) });
        const dropped = await enrolDesk(rt, 2, []);
        const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team, relay: { rt, url: URLV1, token, inv },
          lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret }), "utf8").toString("base64url");
        deskTransport.down = false;
        const taken = await D.ask("etiuda:team-join", "invite", text, "Desk North", codeOf(secret));
        const ch = D.api.relayRun();
        if (ch) { ch.kick(); await ch.idle(); }
        const view = await D.ask("etiuda:team-join", "state");
        const rec = invRec(rt, inv);
        const unspent = !!(rec && rec.spent !== true);
        const state = view && view.join ? view.join.state : "none";
        if (ch) { try { await ch.stop(); } catch { /* already stopped */ } }
        check(made.status === 200 && enrolled.status === 200 && invited.status === 200 && dropped.status === 200
          && !taken.refused && state === "removed" && unspent,
          "993d an invitation registered before this desk was removed is refused without being spent, and the desk says a new one is needed: "
          + "made " + made.status + ", enrol " + enrolled.status + ", invite " + invited.status + ", removed " + dropped.status
          + ", refused " + (taken && taken.refused ? taken.refused : "no") + ", state " + state + ", token " + (unspent ? "unspent" : "spent"));
      } catch (e) {
        check(false, "993d threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const kept = await cancelScene(mainNow, "h35keep", { wrap: true });
        const relay = kept.after && kept.after.teamJoin && kept.after.teamJoin.invite && kept.after.teamJoin.invite.relay;
        const keyKept = !!(kept.after && kept.after.teamKeys && kept.after.teamKeys[kept.team]);
        const staying = kept.here !== null && kept.stopped === false && keyKept && !!(relay && relay.withdrawn === true);
        check(kept.pre && staying,
          "993f cancelling a join the relay has already accepted withdraws the request and keeps the key the invitation gave: "
          + (kept.pre ? "the copy had landed" : "the copy had not")
          + ", relayHere " + (kept.here === null ? "null" : "answers")
          + ", channel " + (kept.stopped ? "stopped" : "running")
          + ", key " + (keyKept ? "kept" : "gone")
          + ", withdrawn " + (relay && relay.withdrawn === true ? "yes" : "no"));
      } catch (e) {
        check(false, "993f threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const lines = mainNow.split(/\n/);
        const at = lines.findIndex(l => l.indexOf("plant:h35-keep") >= 0);
        let turned = false, detail = "plant line absent";
        if (at >= 0) {
          lines.splice(at, 1);
          const lifted = await cancelScene(lines.join("\n"), "h35keep-plant", { wrap: true });
          const keyKept = !!(lifted.after && lifted.after.teamKeys && lifted.after.teamKeys[lifted.team]);
          turned = !!(lifted.pre && lifted.here === null && lifted.stopped === true && !keyKept);
          detail = (lifted.pre ? "the copy had landed" : "the copy had not")
            + ", relayHere " + (lifted.here === null ? "null" : "answers")
            + ", channel " + (lifted.stopped ? "stopped" : "running")
            + ", key " + (keyKept ? "kept" : "gone");
        }
        const back = sha(fs.readFileSync(mainFile)) === sha(Buffer.from(mainNow));
        check(turned && back, "993g lifting plant:h35-keep forgets the key and stops the channel (FAIL 993f cancelling a join the relay has already accepted withdraws the request and keeps the key the invitation gave: relayHere null, channel stopped, key gone, withdrawn no): "
          + detail + ", sha " + (back ? "restored" : "differs"));
      } catch (e) {
        check(false, "993g threw: " + (e && e.stack ? e.stack : e));
      }
      /* E4 through the real channel and relay. A desk takes a relay invitation with its wrap, and its request reaches the lead's
         mirror. Cancel withdraws it: the lead's mirror loses it, and the lead's yes on its way (the key in a new set, a team file
         whose roster names the desk with its wrap) neither enrols the key nor admits the desk. Ask again sends the request anew, the
         lead's mirror holds it again, and the lead's yes then admits the desk with no new invitation. `Cs` is the lead's channel layer. */
      async function withdrawScene(src, tag, Cs, opt) {
        opt = opt || {};
        const cap = opt.cap || 30000;
        const viewCap = opt.viewCap || 30000;
        const rt = hex(16), team = "t-" + hex(8), key = crypto.randomBytes(32), key2 = crypto.randomBytes(32);
        let epochNow = 1;
        R.clock.now += 1;
        const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
        const secret = hex(16), inv = hex(16), token = hex(32), t0 = R.clock.now;
        const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }];
        await admin("POST", "/relay/v1/t/" + rt + "/invites", { add, drop: [], t: t0, sig: signHex(LEAD, core.invitesBytes(rt, t0, add, [])) });
        const pin = { teamId: team, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
        const teamFile = (rev, roster, epoch) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: team, catalogs: ["quay-board"],
          lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: epoch || 1, rev,
          channel: { kind: "relay", rt, url: URLV1 }, ring: RING, roster }, LEAD), null, 1) + "\n";
        const live = [{ id: inv, key: C.inviteSealKey(secret) }];
        const wrapDoc = B.sealInviteWrap({ secret: secret, relayTeamId: rt, teamId: team, invitationId: inv, epoch: 1, key: key });
        const serve = (url, init) => (init && init.method === "GET" && String(url).endsWith("/wrap")
          ? new Response(Buffer.from(JSON.stringify({ wrap: wrapDoc }), "utf8"), { status: 200, headers: { "content-type": "application/json" } }) : null);
        const studioT = transport("e4-" + tag), studioMirror = path.join(LAB, "e4-studio-" + tag);
        const studio = Cs.createChannel({ rt, url: URLV1, mirror: studioMirror, stateFile: path.join(LAB, "e4-" + tag + ".json"),
          pin: () => pin, me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }),
          keyFor: e => (e === 1 ? key : e === 2 ? key2 : null), sealEpoch: () => epochNow, inviteKeys: () => live,
          request: studioT.request, connect: studioT.connect, pollMs: 1e9 });
        put(studioMirror, C.TEAM_NAME, teamFile(1, []));
        studio.start();
        await studio.idle();
        deskTransport.down = false;
        const share = path.join(LAB, "e4-share-" + tag);
        const D = await deskFrom("e4-desk-" + tag, share, src, null, serve);
        const me = await D.ask("etiuda:branch-identity", true);
        const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team, relay: { rt, url: URLV1, token, inv },
          lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret }), "utf8").toString("base64url");
        const taken = await D.ask("etiuda:team-join", "invite", text, "Desk North", codeOf(secret));
        const asked = path.join(studioMirror, "desks", me.id, "join.json");
        const both = async () => { const ch = D.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); } await studio.kick(); await studio.idle(); };
        const envNow = () => { try { return D.envelope(); } catch { return {}; } };
        const first = await until(async () => { await both(); const e = envNow(); return fs.existsSync(asked) && !!(e.teamKeys && e.teamKeys[team]); }, 30000);
        /* The lead moves the team to a new key while the request waits, as a removal or a cancelled invitation does. */
        let moved = 1;
        if (opt.move) {
          epochNow = 2;
          put(studioMirror, C.TEAM_NAME, teamFile(2, [], 2));
          await studio.kick(); await studio.idle();
          const t = R.stores.get(rt).get("team");
          moved = (typeof t === "string" ? JSON.parse(t) : t || {}).epoch;
        }
        const cancelled = await D.ask("etiuda:team-join", "cancel");
        const early = !!(cancelled && cancelled.join && cancelled.join.withdrawn === true);
        /* Ask again before the relay has taken the withdrawal, with the relay out of reach: the same request stands, and nothing is owed. */
        if (opt.again) {
          deskTransport.down = true;
          const off = D.api.relayRun();
          if (off) { off.kick(); await off.idle(); }
          await D.ask("etiuda:team-join", "ask", "", "Desk North");
          deskTransport.down = false;
          for (let i = 0; i < 3; i++) await both();
          const ch = D.api.relayRun();
          const owes = ch ? ch.program.owed({ keyId: me.id, place: "desk:" + me.id }, null).filter(op => /join\.json$/i.test(op.rel)).length : -1;
          const row = invRec(rt, inv) || {}, e = envNow(), r = e.teamJoin && e.teamJoin.invite && e.teamJoin.invite.relay;
          const out = { made: made.status, first, early, standing: fs.existsSync(asked), owes, withdrawnAtRelay: row.withdrawn === true, asked: row.uploaded === true,
            clean: !!r && r.withdrawing === undefined && r.withdrawn === undefined };
          const lv = D.api.relayRun();
          try { await D.ask("etiuda:team-join", "leave", team); } catch { /* quench */ }
          if (lv) { try { await lv.stop(); } catch { /* already stopped */ } }
          try { await studio.stop(); } catch { /* already stopped */ }
          return out;
        }
        const gone = await until(async () => { await both(); return !fs.existsSync(asked); }, cap);
        const takenView = await until(async () => { await both(); const v = await D.ask("etiuda:team-join", "view"); return !!(v && v.join && v.join.withdrawn === true); }, viewCap);
        if (opt.move) {
          const yesMoved = await enrolDesk(rt, 1, [{ id: me.id, pub: me.key, desk: me.id }]);
          let joinedMoved = false;
          for (let i = 0; i < 3; i++) {
            await both();
            const v = await D.ask("etiuda:team-join", "view");
            if (v && v.joined) joinedMoved = true;
          }
          const out = { made: made.status, first, moved, early, gone, takenView, yes: yesMoved.status, enrolled: !!R.stores.get(rt).get("dev:" + me.id),
            joined: joinedMoved };
          const lv = D.api.relayRun();
          try { await D.ask("etiuda:team-join", "leave", team); } catch { /* quench */ }
          if (lv) { try { await lv.stop(); } catch { /* already stopped */ } }
          try { await studio.stop(); } catch { /* already stopped */ }
          return out;
        }
        const row = [{ id: me.id, pub: me.key, desk: me.id }];
        const entry = { desk: { id: me.id, key: me.key, box: me.box }, wrap: D.api.wrapTeamKey(key, me.box, team, 1, me.id) };
        const yes = await enrolDesk(rt, 1, row);
        put(studioMirror, C.TEAM_NAME, teamFile(2, [entry]));
        await studio.kick(); await studio.idle();
        let joinedEarly = false;
        for (let i = 0; i < 3; i++) {
          await both();
          const v = await D.ask("etiuda:team-join", "view");
          if (v && v.joined) joinedEarly = true;
        }
        const e1 = envNow();
        const enrolledEarly = !!R.stores.get(rt).get("dev:" + me.id);
        const kept = !!(e1.teamJoin && e1.teamJoin.invite && e1.teamJoin.invite.relay && e1.teamJoin.invite.relay.withdrawn === true
          && e1.teamKeys && e1.teamKeys[team]);
        await D.ask("etiuda:team-join", "ask", "", "Desk North");
        const back = await until(async () => { await both(); return fs.existsSync(asked); }, cap);
        const yes2 = await enrolDesk(rt, 2, row);
        put(studioMirror, C.TEAM_NAME, teamFile(3, [entry]));
        await studio.kick(); await studio.idle();
        let joined = false;
        await until(async () => {
          await both();
          const v = await D.ask("etiuda:team-join", "view");
          if (v && v.joined && v.joined.team === team) joined = true;
          return joined;
        }, cap);
        const e2 = envNow();
        const live2 = D.api.relayRun();
        try { await D.ask("etiuda:team-join", "leave", team); } catch { /* quench */ }
        if (live2) { try { await live2.stop(); } catch { /* already stopped */ } }
        try { await studio.stop(); } catch { /* already stopped */ }
        return { made: made.status, taken: !taken.refused, first, early, takenView, gone, yes: yes.status, joinedEarly, enrolledEarly, kept,
          back, yes2: yes2.status, joined, after: !e2.teamJoin };
      }
      const withdrawA = g => g.made === 200 && g.taken && g.first && !g.early && g.gone && g.takenView && g.yes === 403 && !g.joinedEarly && !g.enrolledEarly && g.kept;
      const withdrawB = g => withdrawA(g) && g.back && g.yes2 === 200 && g.joined && g.after;
      let e4 = null;
      try {
        e4 = await withdrawScene(mainNow, "leg", C);
        check(withdrawA(e4), "995g a desk cancels a request the relay has accepted: the card says withdrawn only once the relay has taken it, the lead's mirror loses"
          + " the request, and the lead's yes on its way neither enrols the key nor admits the desk, which keeps its key and its join: " + JSON.stringify(e4));
        check(withdrawB(e4), "995h after that withdrawal Ask again puts the request back in the lead's mirror, and the lead's yes then admits the desk with no new invitation: "
          + JSON.stringify(e4));
      } catch (e) {
        check(false, "995gh threw, so 995g did not run: " + (e && e.stack ? e.stack : e));
        check(false, "995gh threw, so 995h did not run");
      }
      check(!!e4 && e4.early === false && e4.takenView === true && e4.gone === true,
        "996d the plain path still says the withdrawal is pending until the relay takes it, and then says it is withdrawn: "
        + JSON.stringify(e4 && { early: e4.early, takenView: e4.takenView, gone: e4.gone }));
      try {
        const lifted = dropLine("plant:e4-not-joined")(mainNow);
        let turned = false, detail = "plant line absent";
        if (lifted !== null) {
          const g = await withdrawScene(lifted, "plant-joined", C, { cap: 8000 });
          turned = g.first && g.gone && g.joinedEarly;
          detail = "joined early " + g.joinedEarly;
        }
        const backSha = sha(fs.readFileSync(mainFile)) === sha(Buffer.from(mainNow));
        check(turned && backSha, "995i lifting plant:e4-not-joined admits the withdrawn desk on the roster of the lead's yes on its way (FAIL 995g: the desk is admitted): "
          + detail + ", sha " + (backSha ? "restored" : "differs"));
      } catch (e) {
        check(false, "995i threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const lifted = dropLine("plant:e4-ask-again-desk")(mainNow);
        let turned = false, detail = "plant line absent";
        if (lifted !== null) {
          const g = await withdrawScene(lifted, "plant-again", C, { cap: 8000 });
          turned = withdrawA(g) && !g.back && !g.joined;
          detail = "asked back " + g.back + ", joined " + g.joined;
        }
        const backSha = sha(fs.readFileSync(mainFile)) === sha(Buffer.from(mainNow));
        check(turned && backSha, "995j lifting plant:e4-ask-again-desk leaves Ask again unsent after a withdrawal, so the lead never sees the request again (FAIL 995h: not asked back): "
          + detail + ", sha " + (backSha ? "restored" : "differs"));
      } catch (e) {
        check(false, "995j threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const chFile = path.join(ROOT, "shell", "relay", "channel.cjs"), chText = fs.readFileSync(chFile, "utf8");
        const lifted = swapText("plant:e4-lead-withdraw", 'r.kind === "delete" || ', '')(chText);
        let turned = false, detail = "plant line absent";
        if (lifted !== null) {
          const g = await withdrawScene(mainNow, "plant-lead", loadPlantedChannel(lifted), { cap: 8000 });
          turned = g.first && !g.gone;
          detail = "the lead's mirror " + (g.gone ? "lost the request" : "kept the request");
        }
        const backSha = sha(fs.readFileSync(chFile)) === sha(Buffer.from(chText));
        check(turned && backSha, "995k lifting plant:e4-lead-withdraw leaves the request in the lead's mirror after the withdrawal (FAIL 995g: the lead's mirror keeps it): "
          + detail + ", sha " + (backSha ? "restored" : "differs"));
      } catch (e) {
        check(false, "995k threw: " + (e && e.stack ? e.stack : e));
      }

      try {
        const chFile = path.join(ROOT, "shell", "relay", "channel.cjs"), chText = fs.readFileSync(chFile, "utf8");
        const lifted = dropLine("plant:e4-rostered-ask")(chText);
        let turned = false, detail = "plant line absent";
        if (lifted !== null) {
          const g = await withdrawScene(mainNow, "plant-rostered", loadPlantedChannel(lifted), { cap: 8000 });
          turned = withdrawA(g) && !g.back;
          detail = "asked back " + g.back;
        }
        const backSha = sha(fs.readFileSync(chFile)) === sha(Buffer.from(chText));
        check(turned && backSha, "995n lifting plant:e4-rostered-ask leaves the lead unable to open the request asked again once its roster names the desk (FAIL 995h: not asked back): "
          + detail + ", sha " + (backSha ? "restored" : "differs"));
      } catch (e) {
        check(false, "995n threw: " + (e && e.stack ? e.stack : e));
      }

      /* G2: the lead moves the team's epoch while the request waits, and the desk, reading only its answer, never learns it. Cancel
         still withdraws the request: the relay takes the deletion at the request's epoch, the card says withdrawn once it has, the
         lead's mirror loses the request, and the lead's yes does not enrol or admit the desk. */
      const movedOk = g => g.made === 200 && g.first && g.moved === 2 && !g.early && g.gone && g.takenView && g.yes === 403 && !g.enrolled && !g.joined;
      try {
        const g = await withdrawScene(mainNow, "moved", C, { move: true });
        check(movedOk(g), "995r a desk cancels after the lead moved the team to a new epoch: the relay takes the withdrawal, the card says withdrawn once it has,"
          + " the lead's mirror loses the request, and the lead's yes neither enrols nor admits the desk: " + JSON.stringify(g));
      } catch (e) {
        check(false, "995r threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const lifted = dropLine("plant:g2-taken")(mainNow);
        let turned = false, detail = "plant line absent";
        if (lifted !== null) {
          const g = await withdrawScene(lifted, "plant-taken", C, { move: true, cap: 8000, viewCap: 4000 });
          turned = g.first && g.gone && !g.takenView;
          detail = "lead's mirror " + (g.gone ? "lost the request" : "kept it") + ", card withdrawn " + g.takenView;
        }
        const backSha = sha(fs.readFileSync(mainFile)) === sha(Buffer.from(mainNow));
        check(turned && backSha, "995s lifting plant:g2-taken never says the withdrawal was taken, though the relay took it (FAIL 995r: the card does not say withdrawn): "
          + detail + ", sha " + (backSha ? "restored" : "differs"));
      } catch (e) {
        check(false, "995s threw: " + (e && e.stack ? e.stack : e));
      }
      /* N1: Ask again before the relay has taken the withdrawal. */
      const againOk = g => g.made === 200 && g.first && !g.early && g.standing && g.owes === 0 && !g.withdrawnAtRelay && g.asked && g.clean;
      try {
        const g = await withdrawScene(mainNow, "again", C, { again: true });
        check(againOk(g), "995t Ask again pressed before the relay took the withdrawal leaves the request that was sent standing with the lead, nothing owed and"
          + " no withdrawal pending: " + JSON.stringify(g));
      } catch (e) {
        check(false, "995t threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const lifted = swapText("plant:n1-same-request", "j.invite.relay.withdrawing !== true", "true")(mainNow);
        let turned = false, detail = "plant line absent";
        if (lifted !== null) {
          const g = await withdrawScene(lifted, "plant-again", C, { again: true });
          turned = g.first && g.standing && g.owes > 0;
          detail = "owes " + g.owes;
        }
        const backSha = sha(fs.readFileSync(mainFile)) === sha(Buffer.from(mainNow));
        check(turned && backSha, "995u lifting plant:n1-same-request writes a new request the invitation's session will not send, so it stays owed (FAIL 995t: owed): "
          + detail + ", sha " + (backSha ? "restored" : "differs"));
      } catch (e) {
        check(false, "995u threw: " + (e && e.stack ? e.stack : e));
      }

      /* A withdrawal late in the invitation's life. `spent`: the invitation is past the relay's keep, so the deletion is refused for good.
         `held`: the team is read-only, which this relay lets a withdrawal through; with `older`, the desk's uploads are answered
         team-lapsed until the lead renews, as a relay from before that rule answers, so the deletion waits and goes after the renewal.
         The session that sends it is opened while the team still works, and the clock then steps across the line inside its half hour. */
      async function lateWithdraw(kind, older) {
        const MIN = 60 * 1000;
        const rt = hex(16), team = "t-" + hex(8), key = crypto.randomBytes(32);
        R.clock.now += 1;
        const born = R.clock.now;
        const made = await admin("POST", "/relay/v1/teams", createBody(rt, born));
        const readOnlyAt = born + 30 * K.DAY + core.WORK_AFTER_MS;
        if (kind === "held") R.clock.now = readOnlyAt - 2 * MIN;
        const secret = hex(16), inv = hex(16), token = hex(32), t0 = R.clock.now;
        const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }];
        await admin("POST", "/relay/v1/t/" + rt + "/invites", { add, drop: [], t: t0, sig: signHex(LEAD, core.invitesBytes(rt, t0, add, [])) });
        const pin = { teamId: team, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
        const teamFile = JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: team, catalogs: ["quay-board"],
          lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev: 1,
          channel: { kind: "relay", rt, url: URLV1 }, ring: RING, roster: [] }, LEAD), null, 1) + "\n";
        const live = [{ id: inv, key: C.inviteSealKey(secret) }];
        const wrapDoc = B.sealInviteWrap({ secret: secret, relayTeamId: rt, teamId: team, invitationId: inv, epoch: 1, key: key });
        let refusing = false;
        const lapsedSaid = Buffer.from(JSON.stringify({ error: "team-lapsed", said: B.REASONS["team-lapsed"] }), "utf8");
        const serve = (url, init) => (init && init.method === "GET" && String(url).endsWith("/wrap")
          ? new Response(Buffer.from(JSON.stringify({ wrap: wrapDoc }), "utf8"), { status: 200, headers: { "content-type": "application/json" } })
          : refusing && init && init.method === "PUT" && /\/b\/[0-9a-f]{32}$/.test(String(url))
            ? new Response(lapsedSaid, { status: 403, headers: { "content-type": "application/json" } }) : null);
        const studioT = transport("c5-" + kind), studioMirror = path.join(LAB, "c5-studio-" + kind + "-" + rt.slice(0, 4));
        const studio = C.createChannel({ rt, url: URLV1, mirror: studioMirror, stateFile: path.join(LAB, "c5-" + kind + "-" + rt.slice(0, 4) + ".json"),
          pin: () => pin, me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }),
          keyFor: () => key, sealEpoch: () => 1, inviteKeys: () => live,
          request: studioT.request, connect: studioT.connect, pollMs: 1e9 });
        put(studioMirror, C.TEAM_NAME, teamFile);
        studio.start();
        await studio.idle();
        deskTransport.down = false;
        const share = path.join(LAB, "c5-share-" + kind + "-" + rt.slice(0, 4));
        const D = await deskFrom("c5-desk-" + kind + "-" + rt.slice(0, 4), share, mainNow, null, serve);
        const me = await D.ask("etiuda:branch-identity", true);
        const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team, relay: { rt, url: URLV1, token, inv },
          lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret }), "utf8").toString("base64url");
        await D.ask("etiuda:team-join", "invite", text, "Desk North", codeOf(secret));
        const asked = path.join(studioMirror, "desks", me.id, "join.json");
        const both = async () => { const ch = D.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); } await studio.kick(); await studio.idle(); };
        const first = await until(async () => { await both(); return fs.existsSync(asked); }, 30000);
        if (kind === "spent") {
          R.clock.now = t0 + core.KEEP_MS - 2 * MIN;
          /* The person checks the seat a month on: the shell holds its renewals to an hour of this computer's clock, which the relay's
             month did not move, and a press to thirty seconds after the last (the sign-in's own), so the leg waits those out. */
          await new Promise(r => setTimeout(r, 31 * 1000));
          await D.ask("etiuda:signin-check");
          await both();
          R.clock.now = t0 + core.KEEP_MS + MIN;
        } else {
          R.clock.now = readOnlyAt + MIN;
          refusing = older === true;
        }
        await D.ask("etiuda:team-join", "cancel");
        await both();
        const view = await D.ask("etiuda:team-join", "view");
        const row = invRec(rt, inv) || {};
        const ch = D.api.relayRun();
        const owes = ch ? ch.program.owed({ keyId: me.id, place: "desk:" + me.id }, null).filter(op => /join\.json$/i.test(op.rel)).length : -1;
        let renewed = 0, after = null, gone = false;
        if (kind === "held") {
          refusing = false;
          const grant = await admin("POST", "/relay/v1/t/" + rt + "/grant", { grant: K.grantFor(LEAD.pub, R.clock.now) });
          renewed = grant.status;
          gone = await until(async () => { await both(); return !fs.existsSync(asked); }, 30000);
          after = await D.ask("etiuda:team-join", "view");
        }
        const standing = fs.existsSync(asked);
        const stop = D.api.relayRun();
        if (stop) { try { await stop.stop(); } catch { /* already stopped */ } }
        try { await studio.stop(); } catch { /* already stopped */ }
        const j = view && view.join || {};
        const n = after && after.join || {};
        return { made: made.status, first, owes, standing, uploaded: row.uploaded === true, withdrawnAtRelay: row.withdrawn === true,
          unkept: j.unkept === true, withdrawing: j.withdrawing === true, withdrawn: j.withdrawn === true, readonly: j.readonly === true,
          renewed, gone, taken: n.withdrawn === true && n.withdrawing !== true && n.readonly !== true && n.unkept !== true };
      }
      function dropChannelLine(mark) {
        const lines = fs.readFileSync(path.join(ROOT, "shell", "relay", "channel.cjs"), "utf8").split(/\n/);
        const at = lines.findIndex(l => l.indexOf(mark) >= 0);
        if (at < 0) return null;
        lines.splice(at, 1);
        return lines.join("\n");
      }
      async function withPlantedChannel(text, fn) {
        const copy = path.join(APP, "shell", "relay", "channel.cjs");
        const before = fs.readFileSync(copy);
        const drop = () => { for (const k of Object.keys(nodeRequire.cache)) if (path.normalize(k) === path.normalize(copy)) delete nodeRequire.cache[k]; };
        try {
          fs.writeFileSync(copy, text);
          drop();
          return await fn();
        } finally {
          fs.writeFileSync(copy, before);
          drop();
        }
      }
      let spent = null;
      try {
        spent = await lateWithdraw("spent");
        const ended = spent.made === 200 && spent.first && spent.unkept && !spent.withdrawing && !spent.withdrawn
          && spent.standing && !spent.withdrawnAtRelay && spent.owes === 0;
        check(ended, "996b a withdrawal the relay refuses for good ends the waiting, the request stays with the lead and nothing more is owed: " + JSON.stringify(spent));
      } catch (e) {
        check(false, "996b threw: " + (e && e.stack ? e.stack : e));
      }
      let held = null;
      try {
        held = await lateWithdraw("held", true);
        const waiting = held.made === 200 && held.first && held.withdrawing && held.readonly && !held.unkept && !held.withdrawn
          && held.uploaded && !held.withdrawnAtRelay && held.owes === 1;
        const moved = waiting && held.renewed === 200 && held.gone && held.taken;
        check(moved, "996c a withdrawal a relay from before the let-go rule refuses as read-only stays owed, and once the lead renews the relay takes it and"
          + " the card moves on: " + JSON.stringify(held));
      } catch (e) {
        check(false, "996c threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const now = await lateWithdraw("held");
        const taken = now.made === 200 && now.first && now.withdrawn && !now.withdrawing && !now.readonly && !now.unkept
          && !now.uploaded && now.withdrawnAtRelay && now.owes === 0 && !now.standing;
        check(taken, "996j a withdrawal while the relay is read-only is taken at once, since a lapse never holds a desk letting itself go: the card says"
          + " withdrawn, nothing is owed and the request is gone from the lead's mirror: " + JSON.stringify(now));
      } catch (e) {
        check(false, "996j threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const lifted = dropChannelLine("plant:c5-unkept");
        let turned = false, detail = "plant line absent";
        if (lifted !== null) {
          const g = await withPlantedChannel(lifted, () => lateWithdraw("spent"));
          turned = g.first && !g.unkept && g.withdrawing && !g.withdrawnAtRelay && g.owes > 0;
          detail = "unkept " + g.unkept + ", withdrawing " + g.withdrawing + ", owes " + g.owes;
        }
        const backSha = sha(fs.readFileSync(path.join(ROOT, "shell", "relay", "channel.cjs"))) === sha(fs.readFileSync(path.join(APP, "shell", "relay", "channel.cjs")));
        check(turned && backSha, "996e lifting plant:c5-unkept leaves the desk waiting on a withdrawal the relay has refused for good (FAIL 996b: the waiting does not end): "
          + detail + ", sha " + (backSha ? "restored" : "differs"));
      } catch (e) {
        check(false, "996e threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const lifted = dropChannelLine("plant:c5-held");
        let turned = false, detail = "plant line absent";
        if (lifted !== null) {
          const g = await withPlantedChannel(lifted, () => lateWithdraw("held", true));
          turned = g.first && g.withdrawing && !g.readonly && !g.withdrawnAtRelay;
          detail = "readonly " + g.readonly + ", withdrawing " + g.withdrawing + ", at the relay " + g.withdrawnAtRelay;
        }
        const backSha = sha(fs.readFileSync(path.join(ROOT, "shell", "relay", "channel.cjs"))) === sha(fs.readFileSync(path.join(APP, "shell", "relay", "channel.cjs")));
        check(turned && backSha, "996f lifting plant:c5-held leaves a read-only withdrawal saying it goes shortly (FAIL 996c: the card does not say the relay is read-only): "
          + detail + ", sha " + (backSha ? "restored" : "differs"));
      } catch (e) {
        check(false, "996f threw: " + (e && e.stack ? e.stack : e));
      }

      /* The lead's yes enrols the key while this desk still holds the invitation's session, and the withdrawal goes on that session.
         Enrolling drops the session in the same write, so the relay answers no-hello and the past-keep sentence is never said.
         The yes is applied as that withdrawal is handed up: a yes any earlier lets the next cycle open a device session first. */
      const PAST_KEEP = "The relay no longer holds this request, so it could not be withdrawn there. The team's lead may still see it until it expires. To join after all, a new invitation from the team's lead is needed.";
      function blobMetaOf(init) {
        const h = init && init.headers;
        if (!h) return null;
        let raw = "";
        if (typeof h.get === "function") raw = h.get("etiuda-blob") || "";
        else for (const k of Object.keys(h)) if (k.toLowerCase() === "etiuda-blob") raw = h[k];
        if (!raw) return null;
        try { return JSON.parse(Buffer.from(String(raw), "base64url").toString("utf8")); } catch { return null; }
      }
      async function enrolThenWithdraw(src, tag) {
        const rt = hex(16), team = "t-" + hex(8), key = crypto.randomBytes(32);
        let me = null;
        R.clock.now += 1;
        const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
        const secret = hex(16), inv = hex(16), token = hex(32), t0 = R.clock.now;
        const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }];
        await admin("POST", "/relay/v1/t/" + rt + "/invites", { add, drop: [], t: t0, sig: signHex(LEAD, core.invitesBytes(rt, t0, add, [])) });
        const pin = { teamId: team, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
        const teamFile = (rev, roster) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: team, catalogs: ["quay-board"],
          lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev,
          channel: { kind: "relay", rt, url: URLV1 }, ring: RING, roster }, LEAD), null, 1) + "\n";
        const live = [{ id: inv, key: C.inviteSealKey(secret) }];
        const wrapDoc = B.sealInviteWrap({ secret: secret, relayTeamId: rt, teamId: team, invitationId: inv, epoch: 1, key: key });
        const seen = { yes: 0, sessions: null, deletion: null, armed: false };
        const serve = async (url, init) => {
          if (init && init.method === "GET" && String(url).endsWith("/wrap"))
            return new Response(Buffer.from(JSON.stringify({ wrap: wrapDoc }), "utf8"), { status: 200, headers: { "content-type": "application/json" } });
          const meta = blobMetaOf(init);
          if (seen.armed && seen.yes === 0 && init && init.method === "PUT" && meta && meta.del === true && String(meta.place || "").indexOf("desk:") === 0) {
            const en = await enrolDesk(rt, 1, [{ id: me.id, pub: me.key, desk: me.id }]);
            seen.yes = en.status;
            try { seen.sessions = R.stores.get(rt).list("ses:").length; } catch { seen.sessions = null; }
            const res = await relayFetch(url, init);
            let error = "";
            try {
              const body = await res.clone().json();
              error = body && body.error ? String(body.error) : "";
            } catch { error = ""; }
            seen.deletion = { status: res.status, error: error };
            return res;
          }
          return relayFetch(url, init);
        };
        const studioT = transport("g996-" + tag), studioMirror = path.join(LAB, "g996-studio-" + tag);
        const studio = C.createChannel({ rt, url: URLV1, mirror: studioMirror, stateFile: path.join(LAB, "g996-" + tag + ".json"),
          pin: () => pin, me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }),
          keyFor: () => key, sealEpoch: () => 1, inviteKeys: () => live,
          request: studioT.request, connect: studioT.connect, pollMs: 1e9 });
        put(studioMirror, C.TEAM_NAME, teamFile(1, []));
        studio.start();
        await studio.idle();
        deskTransport.down = false;
        const share = path.join(LAB, "g996-share-" + tag);
        const D = await deskFrom("g996-desk-" + tag, share, src, null, serve);
        try {
          me = await D.ask("etiuda:branch-identity", true);
          const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team, relay: { rt, url: URLV1, token, inv },
            lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret }), "utf8").toString("base64url");
          await D.ask("etiuda:team-join", "invite", text, "Desk North", codeOf(secret));
          const asked = path.join(studioMirror, "desks", me.id, "join.json");
          const both = async () => { const ch = D.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); } await studio.kick(); await studio.idle(); };
          const envNow = () => { try { return D.envelope(); } catch { return {}; } };
          const cardOf = async () => {
            const view = await D.ask("etiuda:team-join", "view");
            const j = view && view.join || {};
            const ch = D.api.relayRun();
            const relay = envNow().teamJoin && envNow().teamJoin.invite && envNow().teamJoin.invite.relay || {};
            return { view, joined: !!(view && view.joined && view.joined.team === team), unkept: j.unkept === true,
              withdrawing: j.withdrawing === true, withdrawn: j.withdrawn === true, enrolled: !!(ch && ch.enrolled()), marked: relay.unkept === true };
          };
          const first = await until(async () => { await both(); const e = envNow(); return fs.existsSync(asked) && !!(e.teamKeys && e.teamKeys[team]); }, 30000);
          const ch0 = D.api.relayRun();
          const heldInvite = !!(ch0 && ch0.online() && !ch0.enrolled());
          seen.armed = true;
          await D.ask("etiuda:team-join", "cancel");
          let before = null, said = false;
          for (let i = 0; i < 8; i++) {
            await both();
            before = await cardOf();
            if (before.unkept || before.marked) said = true;
            if (seen.deletion) break;
          }
          const entry = { desk: { id: me.id, key: me.key, box: me.box }, wrap: D.api.wrapTeamKey(key, me.box, team, 1, me.id) };
          put(studioMirror, C.TEAM_NAME, teamFile(2, [entry]));
          await studio.kick(); await studio.idle();
          let joined = false;
          await until(async () => {
            await both();
            const c = await cardOf();
            if (c.unkept || c.marked) said = true;
            if (c.joined) joined = true;
            return joined;
          }, 30000);
          const enrolled = !!R.stores.get(rt).get("dev:" + me.id);
          return { made: made.status, first, heldInvite, yes: seen.yes, enrolled, sessions: seen.sessions, before: before && {
            joined: before.joined, unkept: before.unkept, withdrawing: before.withdrawing, withdrawn: before.withdrawn,
            enrolled: before.enrolled, marked: before.marked }, joined, said, past: said ? PAST_KEEP : "", deletion: seen.deletion };
        } finally {
          const stop = D && D.api.relayRun();
          if (stop) { try { await stop.stop(); } catch { /* already stopped */ } }
          try { await studio.stop(); } catch { /* already stopped */ }
        }
      }
      const holds996g = g => !!(g && g.made === 200 && g.first === true && g.heldInvite === true && g.yes === 200 && g.enrolled === true
        && g.sessions === 1 && g.before && g.before.unkept === false && g.joined === true && g.said === false && g.past === ""
        && g.deletion && g.deletion.status === 401 && g.deletion.error === "no-hello");
      try {
        const g = await enrolThenWithdraw(mainNow, "leg");
        check(holds996g(g), "996g the lead's yes enrols the key, then this desk withdraws on the invitation it still holds: the desk joins and the past-keep sentence is never said: " + JSON.stringify(g));
      } catch (e) {
        check(false, "996g threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const coreFile = path.join(ROOT, "relay", "core.cjs");
        const coreDigest = sha(fs.readFileSync(coreFile));
        const lines = fs.readFileSync(coreFile, "utf8").split(/\n/);
        const at = lines.findIndex(l => l.indexOf("plant:enrol-sessions") >= 0);
        let turned = false, detail = "plant line absent";
        const liveCore = nodeRequire(coreFile);
        const savedCore = liveCore.createCore;
        if (at >= 0) {
          lines.splice(at, 1);
          const dir = fs.mkdtempSync(path.join(LAB, "core-plant-"));
          fs.mkdirSync(path.join(dir, "relay"), { recursive: true });
          fs.mkdirSync(path.join(dir, "shell", "relay"), { recursive: true });
          fs.writeFileSync(path.join(dir, "relay", "core.cjs"), lines.join("\n"));
          fs.writeFileSync(path.join(dir, "shell", "relay", "blob.cjs"), "module.exports = require(" + JSON.stringify(path.join(ROOT, "shell", "relay", "blob.cjs")) + ");\n");
          const planted = nodeRequire(path.join(dir, "relay", "core.cjs"));
          liveCore.createCore = planted.createCore;
          try {
            const g = await enrolThenWithdraw(mainNow, "plant");
            turned = !!(g && g.first === true && g.yes === 200 && g.sessions !== 1 && g.said === true && g.past === PAST_KEEP
              && g.deletion && g.deletion.error === "token-spent" && !holds996g(g));
            detail = JSON.stringify(g);
          } finally {
            liveCore.createCore = savedCore;
          }
        }
        const backSha = sha(fs.readFileSync(coreFile)) === coreDigest;
        check(turned && backSha, "996h lifting plant:enrol-sessions leaves the invitation session alive, so the withdrawal reaches the desk as a refusal and 996g's claim fails, and the product file is never written: "
          + detail + ", sha " + (backSha ? "restored" : "differs"));
      } catch (e) {
        check(false, "996h threw: " + (e && e.stack ? e.stack : e));
      }

      /* C1: a desk the lead removed probes the relay less often each time, from a minute towards an hour, and a desk enrolled again
         follows on the next probe, its pace back to a minute. Each probe is asked through relayProbe, so no leg waits. */
      async function backoffScene(src, tag) {
        const rt = hex(16), team = "t-" + hex(8), key = crypto.randomBytes(32), share = path.join(LAB, "c1-share-" + tag);
        R.clock.now += 1;
        await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
        const D = await deskFrom("c1-" + tag, share, src, { teamPins: { [team]: leadPin }, teamPinFrom: { [team]: "answer" },
          teamChannel: { [team]: { kind: "relay", rt, url: URLV1 } }, teamKeys: { [team]: { 1: sealedKey(key) } },
          teamShown: { [team]: { lead: "Ada Quay", folder: share } } });
        const me = await D.ask("etiuda:branch-identity", true);
        const row = [{ id: me.id, pub: me.key, desk: me.id }];
        await enrolDesk(rt, 1, row);
        deskTransport.down = false;
        const online = await until(async () => { const c = D.api.relayRun(); if (c) { c.kick(); await c.idle(); } return !!(c && c.online()); }, 30000);
        await enrolDesk(rt, 2, []);
        const c0 = D.api.relayRun();
        if (c0) { c0.kick(); await c0.idle(); }
        const hushed = await until(() => D.api.relayHere() === null, 30000);
        /* What relaySoon does, three times: the halted channel waits for the probe. */
        const mark = deskTransport.log.length;
        for (let i = 0; i < 3; i++) { const x = D.api.relayRun(); if (x) await x.idle(); }
        const quiet = deskTransport.log.length === mark;
        const waits = [D.api.relayProbeNext()];
        for (let i = 0; i < 7; i++) {
          const c = D.api.relayProbe();
          if (c) await c.idle();
          waits.push(D.api.relayProbeNext());
        }
        await enrolDesk(rt, 3, row);
        const c = D.api.relayProbe();
        if (c) await c.idle();
        const followed = await until(async () => { const x = D.api.relayRun(); if (x) { x.kick(); await x.idle(); } return D.api.relayHere() !== null; }, 30000);
        const reset = D.api.relayProbeNext();
        try { await D.ask("etiuda:team-join", "leave", team); } catch { /* quench */ }
        const live = D.api.relayRun();
        if (live) { try { await live.stop(); } catch { /* already stopped */ } }
        return { online, hushed, quiet, waits, followed, reset };
      }
      const MINUTE = 60 * 1000;
      const paced = g => g.online && g.hushed && g.quiet && JSON.stringify(g.waits) === JSON.stringify([1, 2, 4, 8, 16, 32, 60, 60].map(n => n * MINUTE))
        && g.followed && g.reset === MINUTE;
      try {
        const g = await backoffScene(mainNow, "leg");
        check(paced(g), "995l a desk the lead removed asks the relay at no other call, probes after a minute, then twice as long after each probe up to an hour, and once"
          + " enrolled again follows on the next probe with its pace back to a minute: " + JSON.stringify(g));
      } catch (e) {
        check(false, "995l threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const lifted = dropLine("plant:c1-backoff")(mainNow);
        let turned = false, detail = "plant line absent";
        if (lifted !== null) {
          const g = await backoffScene(lifted, "plant");
          turned = g.online && g.hushed && g.waits.every(w => w === MINUTE);
          detail = "waits " + JSON.stringify(g.waits);
        }
        const backSha = sha(fs.readFileSync(mainFile)) === sha(Buffer.from(mainNow));
        check(turned && backSha, "995m lifting plant:c1-backoff keeps every probe a minute apart (FAIL 995l: the waits do not grow): " + detail + ", sha " + (backSha ? "restored" : "differs"));
      } catch (e) {
        check(false, "995m threw: " + (e && e.stack ? e.stack : e));
      }
      try {
        const lifted = dropLine("plant:n2-hush-wait")(mainNow);
        let turned = false, detail = "plant line absent";
        if (lifted !== null) {
          const g = await backoffScene(lifted, "plant-hush");
          turned = g.online && g.hushed && !g.quiet;
          detail = "quiet " + g.quiet;
        }
        const backSha = sha(fs.readFileSync(mainFile)) === sha(Buffer.from(mainNow));
        check(turned && backSha, "995v lifting plant:n2-hush-wait restarts the halted channel at every call while hushed (FAIL 995l: not quiet): "
          + detail + ", sha " + (backSha ? "restored" : "differs"));
      } catch (e) {
        check(false, "995v threw: " + (e && e.stack ? e.stack : e));
      }
    } catch (e) {
      check(false, "harness (the legs 921a to 921ae): " + (e && e.stack ? e.stack : e));
    }
  }

  if (partOn("p961re")) {
  markPart("p961re");
}
  /* A desk that left a relay team, was removed after, and is invited again. Leaving sets the mirror's team file aside,
     so the old wrap is not read on the way back in and the new request is not thrown away. */
  async function relayLeft(make, sentCeiling) {
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
    const H = await make(share, tag);
    const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team, relay: { rt, url: URLV1, token, inv },
      lead: { keyId: LEAD.keyId, public: LEAD.pub, name: "Ada Quay" }, secret }), "utf8").toString("base64url");
    const taken = await H.ask("etiuda:team-join", "invite", text, "Desk Twelve", codeOf(secret));
    const me = await H.ask("etiuda:branch-identity", false);
    const joinRel = me ? "desks/" + me.id + "/join.json" : "";
    const asked = await until(async () => {
      const ch = H.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); }
      await lead.kick(); await lead.idle();
      return !!joinRel && !!read(mirrorL, joinRel);
    }, 30000);
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
    }, 30000);
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
    }, sentCeiling || 30000);
    const ch = H.api.relayRun(); if (ch) await ch.stop();
    await lead.stop();
    return { taken: !taken.refused, asked, admitted, parked, again: again && !again.refused, sent2, teamFile };
  }
  if (partOn("p961re")) {
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
          }, 8000);
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
  }
  if (partOn("p978")) {
  markPart("p978");

  /* ---- 978: the lapse at the desk (the test architect's C1 on G2). A relay of its own whose clock the legs move, a paid
     team and a trial's team on it, each followed by a desk loaded from its record (pinned by an invitation, its key
     enrolled), and the page's team-join and Settings over that desk's shell. Each step is shown once with its dates, a
     second sync at the same step shows nothing new, a dismissal is kept by the shell and the team's row still says it, a
     team inside its grant shows nothing, and nothing on the desk is removed by any step. ---- */
  
  {
      const RL = S.relayEnv({ roots: K.ROOTS });
      const DAYMS = K.DAY, MIN = 60 * 1000, BASE = Date.UTC(2026, 2, 2, 12);
      RL.clock.now = BASE;
      /* The desks' clock moves with the relay's, as two real clocks do; each desk's channel takes Date.now when it is made. */
      const realNow = Date.now;
      let jump = 0;
      const at = ms => { jump += ms - RL.clock.now; RL.clock.now = ms; };
      const lfetch = (url, init) => {
        const i = Object.assign({}, init);
        if (i.body && i.method !== "GET") i.duplex = "half"; else delete i.body;
        return W.fetch(new Request(url, i), RL.env);
      };
      const ladmin = async (method, p, json) => {
        const res = await lfetch("https://relay.test" + p, { method, headers: { "content-type": "application/json" },
          body: Buffer.from(JSON.stringify(json), "utf8") });
        return { status: res.status, json: JSON.parse(Buffer.from(await res.arrayBuffer()).toString("utf8") || "null") };
      };
      const day = (ms, lang) => new Intl.DateTimeFormat(lang === "pl" ? "pl" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));
      /* The page's DOM, as much of it as a lasting notice and Settings touch; each notice of the lapse is counted as it lands. */
      const nodes = new Map();
      let lapseMade = 0;
      const mk = tag => ({ tag, id: "", className: "", textContent: "", type: "", children: [], attrs: {}, style: {}, parent: null, onclick: null,
        classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
        setAttribute(k, v) { this.attrs[k] = String(v); },
        appendChild(c) { c.parent = this; this.children.push(c); if (c.id) nodes.set(c.id, c); if (c.id === "eTeamLapse") lapseMade++; return c; },
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); if (this.id && nodes.get(this.id) === this) nodes.delete(this.id); this.parent = null; },
        get firstChild() { return this.children[0] || null; } });
      const textOf = e => (e.textContent || "") + (e.children || []).map(textOf).join("");
      const was = { WebSocket: globalThis.WebSocket, document: globalThis.document, window: globalThis.window,
        add: globalThis.addEventListener, remove: globalThis.removeEventListener, style: globalThis.getComputedStyle };
      const desks = [];
      try {
        Date.now = () => realNow() + jump;
        /* The desk's socket stays open and silent, so every cycle below is one a leg asked for. */
        globalThis.WebSocket = class { constructor() { this.readyState = 1; } send() {} close() {} };
        globalThis.window = globalThis.window || {};
        globalThis.document = { body: mk("body"), documentElement: mk("html"), createElement: mk,
          createTextNode: s => ({ textContent: String(s), children: [] }), getElementById: id => nodes.get(id) || null,
          querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
        globalThis.addEventListener = () => {};
        globalThis.removeEventListener = () => {};
        globalThis.getComputedStyle = () => ({ fontSize: "16px" });
        let pageDesk = null, took = null;
        window.E_HOST = { teamJoin: (...a) => (pageDesk ? pageDesk.desk.ask("etiuda:team-join", ...a) : Promise.resolve(null)), onTeamJoin: fn => { took = fn; } };
        const mod = n => import(pathToFileURL(path.join(ROOT, "src", "modules", n)).href);
        const HK = await mod("hooks.js");
        HK.hooks.render = () => {};
        const ST = await mod("storage.js"), TJ = await mod("team-join.js"), SET = await mod("settings.js");
        TJ.wireTeamJoin();
        await wait(20);

        /* A team on this relay with its grant's `fields`, and a desk following it with two files in its mirror: one of its own
           place and one at the root. */
        async function lapseTeam(name, fields) {
          const rt = hex(16), team = "t-" + hex(8);
          const made = await ladmin("POST", "/relay/v1/teams", K.createBody(rt, LEAD, RL.clock.now, bytes => signHex(LEAD, bytes), { grantOpts: { fields } }));
          if (made.status !== 200) throw new Error(name + " was not made: " + JSON.stringify(made.json));
          const ud = path.join(LAB, "978-" + name);
          fs.mkdirSync(ud, { recursive: true });
          fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eUiLang: "en" },
            teamPins: { [team]: { keyId: LEAD.keyId, public: LEAD.pub } }, teamPinFrom: { [team]: "invite" },
            teamChannel: { [team]: { kind: "relay", rt, url: URLV1 } }, teamShown: { [team]: { lead: "Ada Quay" } } }), "utf8");
          const desk = await loadDesk(ud, { fetch: lfetch, clock: () => RL.clock.now });
          const me = await desk.ask("etiuda:branch-identity", true);
          const t = RL.clock.now, keys = [{ id: me.id, pub: me.key, desk: me.id }];
          const en = await ladmin("POST", "/relay/v1/t/" + rt + "/devices", { keys, rev: 1, t, sig: signHex(LEAD, core.devicesBytes(rt, 1, t, keys)) });
          if (en.status !== 200) throw new Error(name + "'s desk was not enrolled: " + JSON.stringify(en.json));
          const mirror = path.join(ud, "relay", rt);
          put(mirror, "desks/" + me.id + "/note.ec", "A note of this desk's own, kept through every step.\n");
          put(mirror, "guide.ec", "A file at the root, kept through every step.\n");
          const d = { name, rt, team, desk, me, mirror, ud };
          desks.push(d);
          return d;
        }
        const pumpL = async d => { const ch = d.desk.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); } return ch; };
        const rowOf = async d => {
          const v = await d.desk.ask("etiuda:team-join", "leads");
          return ((v && v.leads) || []).filter(l => l && l.team === d.team)[0] || null;
        };
        /* The shell's view handed to the page, as the push after a step hands it. */
        const feed = async d => { pageDesk = d; const v = await d.desk.ask("etiuda:team-join", "state"); took(v); await wait(10); return v; };
        const notice = () => { const n = nodes.get("eTeamLapse"); return n && n.children[0] ? textOf(n.children[0]) : ""; };
        const settings = lang => { ST.lsSet("eUiLang", lang); const h = shownText(SET.settingsBodyHtml()); ST.lsSet("eUiLang", "en"); return h; };
        const dismiss = async () => {
          const n = nodes.get("eTeamLapse");
          /* Dismiss is the notice's last button, whatever language it was drawn in. */
          const buttons = [];
          (function walk(e) { if (e.tag === "button") buttons.push(e); for (const c of e.children || []) walk(c); })(n || { children: [] });
          const b = buttons[buttons.length - 1] || null;
          if (b) b.onclick();
          await wait(30);
          return !!b;
        };
        const filesOf = dir => filesUnder(dir).map(f => path.relative(dir, f).split(path.sep).join("/") + "=" + sha(fs.readFileSync(f))).sort();
        const STAY = "The catalogs on this desk stay as they are and work as before.";
        const TITLES = ["The team's relay is due for renewal", "The team's relay is read-only until renewed",
          "The team's relay has stopped", "The relay no longer holds the team's copy",
          "The relay does not know the team just now"];
        const UNKNOWN_BODY_EN = "The catalogs on this desk stay as they are and work as before; nothing new arrives through the relay. Either the relay cleared the team's copy after its licence ended, or the team has not reached the relay yet. When the team is back on the relay, this desk follows by itself while it is still in the team; nothing is needed here.";
        const UNKNOWN_BODY_PL = "Katalogi na tym stanowisku zostają bez zmian i działają jak dotąd; przez przekaźnik nie przychodzi nic nowego. Przekaźnik usunął kopię zespołu po wygaśnięciu licencji albo zespół jeszcze do niego nie dotarł. Gdy zespół wróci na przekaźnik, to stanowisko dołączy samo, o ile nadal należy do zespołu; tutaj nic nie trzeba robić.";

        const paid = await lapseTeam("paid", { paid: true, until: BASE + 30 * DAYMS });
        const trial = await lapseTeam("trial", { paid: false, until: BASE + 14 * DAYMS });

        /* Inside both grants. */
        at(BASE + DAYMS);
        await pumpL(paid); await pumpL(trial);
        const before = { paid: filesOf(paid.mirror), trial: filesOf(trial.mirror) };
        const pinsOf = d => { const e = d.desk.envelope(); return JSON.stringify([e.teamPins, e.teamChannel, e.teamPinFrom]); };
        const pinsBefore = { paid: pinsOf(paid), trial: pinsOf(trial) };
        const insideRows = [await rowOf(paid), await rowOf(trial)];
        const insideTold = [paid, trial].map(d => { const p = d.desk.api.relayRun().program; return p.lapse() ? p.lapse().state : "none"; });
        await feed(paid);
        const insideNotice = notice(), insideMade = lapseMade, insideSettings = settings("en");
        await feed(trial);
        const insideNotice2 = notice(), insideSettings2 = settings("en");
        check(insideRows.every(r => r && !Object.prototype.hasOwnProperty.call(r, "lapse")) && insideTold.join() === "working,working"
          && insideMade === 0 && !insideNotice && !insideNotice2 && TITLES.every(s => insideSettings.indexOf(s) < 0 && insideSettings2.indexOf(s) < 0),
          "978a a team working inside its grant shows nothing new: the relay told both teams " + insideTold.join(" and ") + ", rows "
          + insideRows.map(r => (r ? (r.lapse ? "lapse " + r.lapse.step : "no lapse") : "missing")).join(" / ") + ", notices " + insideMade
          + ", Settings " + (TITLES.some(s => insideSettings.indexOf(s) >= 0 || insideSettings2.indexOf(s) >= 0) ? "names a lapse" : "names none"));

        /* The trial's team stops at its end; the paid team is still inside its grant. */
        at(BASE + 20 * DAYMS);
        await pumpL(trial); await pumpL(paid);
        const trialRow = await rowOf(trial), paidStill = await rowOf(paid);
        const madeB = lapseMade;
        ST.lsSet("eUiLang", "pl");
        await feed(trial);
        ST.lsSet("eUiLang", "en");
        const trialPl = "Przekaźnik zespołu jest wstrzymany Licencja albo okres próbny, z którym działał, dobiegły końca. Katalogi na tym"
          + " stanowisku zostają bez zmian i działają jak dotąd. Przekaźnik przechowuje kopię zespołu do dnia " + day(BASE + 44 * DAYMS, "pl")
          + ". Lider zespołu może go uruchomić ponownie w Studiu, z licencją.";
        const trialNotice = notice(), trialMade = lapseMade - madeB, trialSetEn = settings("en"), trialSetPl = settings("pl");
        const trialRowEn = trialSetEn.indexOf(TITLES[2]) >= 0 && trialSetEn.indexOf("The licence or trial it came with") < 0;
        const trialRowPl = trialSetPl.indexOf("Przekaźnik zespołu jest wstrzymany") >= 0;
        check(!!trialRow && !!trialRow.lapse && trialRow.lapse.step === "lapsed" && trialRow.lapse.until === BASE + 14 * DAYMS
          && trialRow.lapse.swept === BASE + 44 * DAYMS && trialRow.lapse.seen === false && !!paidStill && !paidStill.lapse
          && trialMade === 1 && trialNotice === trialPl && trialRowEn && trialRowPl,
          "978b a trial's team stopped at its end is shown once with the day the relay's copy goes, here in Polish, and the team's row in"
          + " Settings carries the title in both languages: row " + JSON.stringify(trialRow && trialRow.lapse) + ", the paid team " + (paidStill && !paidStill.lapse ? "shows nothing" : "shows a lapse")
          + ", notices " + trialMade + ", text " + JSON.stringify(trialNotice) + ", Settings en " + trialRowEn + ", pl " + trialRowPl);
        await dismiss();

        /* The paid team past its grant's end: still working, until read-only. */
        at(BASE + 35 * DAYMS);
        await pumpL(paid);
        const graceRow = await rowOf(paid);
        const madeC = lapseMade;
        await feed(paid);
        const graceEn = TITLES[0] + " It fell due on " + day(BASE + 30 * DAYMS) + ". Everything works as before until " + day(BASE + 60 * DAYMS)
          + "; after that the catalogs on this desk stay as they are, but nothing new passes between this desk and the team until the relay is"
          + " renewed. The team's lead renews it in Studio; nothing is needed here.";
        const rowSays = (title, body) => { const h = settings("en"); return h.indexOf(title) >= 0 && h.indexOf(body) < 0; };
        const graceNotice = notice(), graceMade = lapseMade - madeC;
        check(!!graceRow && !!graceRow.lapse && graceRow.lapse.step === "grace" && graceRow.lapse.until === BASE + 30 * DAYMS
          && graceRow.lapse.readOnly === BASE + 60 * DAYMS && graceRow.lapse.swept === BASE + 120 * DAYMS && graceMade === 1 && graceNotice === graceEn
          && rowSays(TITLES[0], "It fell due"),
          "978c a paid team past its grant's end and still working is shown once, with the day it fell due and the day it turns read-only: row "
          + JSON.stringify(graceRow && graceRow.lapse) + ", notices " + graceMade + ", text " + JSON.stringify(graceNotice));

        /* The same step at the next sync. */
        await pumpL(paid);
        const againRow = await rowOf(paid);
        await feed(paid);
        await feed(paid);
        check(lapseMade - madeC === 1 && notice() === graceEn && JSON.stringify(againRow) === JSON.stringify(graceRow),
          "978d a second sync at the same step shows nothing new: notices at this step " + (lapseMade - madeC) + ", the one on screen "
          + (notice() === graceEn ? "unchanged" : JSON.stringify(notice())) + ", row " + (JSON.stringify(againRow) === JSON.stringify(graceRow) ? "unchanged" : JSON.stringify(againRow)));

        /* Dismissed: the shell keeps it, the next sync shows nothing, and the team's row still says where the team stands. */
        const dismissed = await dismiss();
        await pumpL(paid);
        await feed(paid);
        const seenRow = await rowOf(paid), kept = (paid.desk.envelope().teamLapseSeen || {})[paid.team];
        check(dismissed && kept === "grace:" + (BASE + 30 * DAYMS) && !!seenRow && !!seenRow.lapse && seenRow.lapse.seen === true
          && !notice() && lapseMade - madeC === 1 && rowSays(TITLES[0], "It fell due"),
          "978e a dismissed notice is kept by the shell, the next sync shows it no more, and the team's row in Settings still says it: kept "
          + JSON.stringify(kept) + ", row seen " + (seenRow && seenRow.lapse ? seenRow.lapse.seen : "no lapse") + ", notice "
          + (notice() ? "on screen" : "gone") + ", Settings " + (rowSays(TITLES[0], "It fell due") ? "says it" : "silent"));

        /* Read-only, told by since on a session opened while the team still worked. */
        at(BASE + 60 * DAYMS - 10 * MIN);
        await pumpL(paid);
        at(BASE + 60 * DAYMS + 10 * MIN);
        await pumpL(paid);
        const roRow = await rowOf(paid);
        const madeF = lapseMade;
        await feed(paid);
        await feed(paid);
        const roEn = TITLES[1] + " The catalogs on this desk stay as they are and work as before; nothing new passes between this desk and the team."
          + " The relay keeps the team's copy until " + day(BASE + 120 * DAYMS) + ". The team's lead renews it in Studio.";
        const roNotice = notice(), roMade = lapseMade - madeF;
        check(!!roRow && !!roRow.lapse && roRow.lapse.step === "read-only" && roRow.lapse.swept === BASE + 120 * DAYMS && roRow.lapse.seen === false
          && roMade === 1 && roNotice === roEn && rowSays(TITLES[1], "The relay keeps"),
          "978f read-only, told on since within a session the team opened while working, is shown once with the day the relay's copy goes: row "
          + JSON.stringify(roRow && roRow.lapse) + ", notices " + roMade + ", text " + JSON.stringify(roNotice));
        await dismiss();

        /* Past the sweep's day: the relay sweeps the team at the first call and knows it no more. */
        at(BASE + 120 * DAYMS + 10 * MIN);
        await pumpL(paid);
        const goneRow = await rowOf(paid);
        const madeG = lapseMade;
        await feed(paid);
        const goneEn = TITLES[3] + " " + STAY + " If the team's lead renews the licence, this desk rejoins by itself while it is still in the team; nothing is needed here.";
        const goneNotice = notice();
        const sweptDump = RL.stores.get(paid.rt).dump();
        const sweptStore = sweptDump.length;
        /* The mark and the instant it dates from (relay/core.cjs wipe), and nothing else of the team. */
        const sweptOnly = sweptStore === 2 && sweptDump[0][0] === "swept" && sweptDump[1][0] === "sweptAt";
        at(BASE + 121 * DAYMS);
        await pumpL(paid);
        await feed(paid);
        const laterRow = await rowOf(paid);
        check(!!goneRow && !!goneRow.lapse && goneRow.lapse.step === "gone" && sweptOnly && !!laterRow && !!laterRow.lapse
          && laterRow.lapse.step === "gone" && lapseMade - madeG === 1 && goneNotice === goneEn && notice() === goneEn,
          "978g past its sweep's day the team is shown once as removed from the relay, the relay keeps the lead's public key alone, and it stays so at the next sync: "
          + (goneRow && goneRow.lapse ? goneRow.lapse.step : "no lapse") + ", the relay's rows " + sweptStore + ", a day later "
          + (laterRow && laterRow.lapse ? laterRow.lapse.step : "no lapse") + ", notices " + (lapseMade - madeG) + ", text " + JSON.stringify(goneNotice));

        /* Nothing on either desk was removed by any step: every file of the mirror, and the record's pins. A copy short of one
           file is read as changed, so the comparison reads. */
        const after = { paid: filesOf(paid.mirror), trial: filesOf(trial.mirror) };
        const same = (a, b) => a.every(x => b.indexOf(x) >= 0);
        const control = same(before.paid, before.paid.slice(1)) === false;
        check(before.paid.length >= 2 && before.trial.length >= 2 && same(before.paid, after.paid) && same(before.trial, after.trial)
          && pinsOf(paid) === pinsBefore.paid && pinsOf(trial) === pinsBefore.trial && control,
          "978h no step removes anything from the desk: the mirror's files " + before.paid.length + " and " + before.trial.length
          + (same(before.paid, after.paid) && same(before.trial, after.trial) ? ", all still there with the same bytes" : ", not all still there")
          + ", the pins " + (pinsOf(paid) === pinsBefore.paid && pinsOf(trial) === pinsBefore.trial ? "kept" : "changed")
          + ", the comparison " + (control ? "reads a missing file" : "blind"));

        /* (a) a not-enrolled refusal with no stored lapse tells the new step, and the Settings row and the notice say the title and body, in English and in Polish. */
        const unmadeRt = hex(16), unmadeTeam = "t-" + hex(8);
        const unmadeUd = path.join(LAB, "978-unmade");
        fs.mkdirSync(unmadeUd, { recursive: true });
        fs.writeFileSync(path.join(unmadeUd, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eUiLang: "en" },
          teamPins: { [unmadeTeam]: { keyId: LEAD.keyId, public: LEAD.pub } }, teamPinFrom: { [unmadeTeam]: "invite" },
          teamChannel: { [unmadeTeam]: { kind: "relay", rt: unmadeRt, url: URLV1 } }, teamShown: { [unmadeTeam]: { lead: "Ada Quay" } } }), "utf8");
        let blockSince = false;
        const unmadeDesk = await loadDesk(unmadeUd, { clock: () => RL.clock.now, fetch: (url, init) => {
          if (blockSince && url.indexOf("/since/") >= 0) {
            return Promise.resolve(new Response(JSON.stringify({ error: "temporary" }), { status: 503, headers: { "content-type": "application/json" } }));
          }
          return lfetch(url, init);
        } });
        const unmadeMe = await unmadeDesk.ask("etiuda:branch-identity", true);
        const unmade = { name: "unmade", rt: unmadeRt, team: unmadeTeam, desk: unmadeDesk, me: unmadeMe, ud: unmadeUd };
        desks.push(unmade);
        await pumpL(unmade);
        const uRow = await rowOf(unmade);
        const madeI = lapseMade;
        await feed(unmade);
        const unmadeNoticeEn = notice();
        const unmadeSetEn = settings("en");
        const unmadeSetPl = settings("pl");
        const up = document.getElementById("eTeamLapse");
        if (up) up.remove();
        ST.lsSet("eUiLang", "pl");
        await feed(unmade);
        const unmadeNoticePl = notice();
        ST.lsSet("eUiLang", "en");
        check(!!uRow && !!uRow.lapse && uRow.lapse.step === "unknown" && uRow.lapse.until === null
          && lapseMade - madeI === 2
          && unmadeNoticeEn === TITLES[4] + " " + UNKNOWN_BODY_EN
          && unmadeNoticePl === "Przekaźnik nie zna teraz tego zespołu " + UNKNOWN_BODY_PL
          && unmadeSetEn.indexOf(TITLES[4]) >= 0 && unmadeSetPl.indexOf("Przekaźnik nie zna teraz tego zespołu") >= 0,
          "978i a not-enrolled refusal with no stored lapse tells unknown, and Settings and notice say the title and body in English and Polish: row "
          + JSON.stringify(uRow && uRow.lapse) + ", notice en " + (unmadeNoticeEn === TITLES[4] + " " + UNKNOWN_BODY_EN ? "match" : JSON.stringify(unmadeNoticeEn))
          + ", notice pl " + (unmadeNoticePl === "Przekaźnik nie zna teraz tego zespołu " + UNKNOWN_BODY_PL ? "match" : JSON.stringify(unmadeNoticePl))
          + ", settings en " + (unmadeSetEn.indexOf(TITLES[4]) >= 0) + ", pl " + (unmadeSetPl.indexOf("Przekaźnik nie zna teraz tego zespołu") >= 0));
        await dismiss();

        /* (b) a not-enrolled refusal past a stored sweep still tells gone, as today. */
        await pumpL(trial);
        const trialSwept = await rowOf(trial);
        check(!!trialSwept && !!trialSwept.lapse && trialSwept.lapse.step === "gone",
          "978j a not-enrolled refusal past a stored sweep still tells gone, as today: row "
          + JSON.stringify(trialSwept && trialSwept.lapse));

        /* (c) a session the relay accepts afterwards clears the new step. */
        const madeUnmade = await ladmin("POST", "/relay/v1/teams", K.createBody(unmadeRt, LEAD, RL.clock.now, bytes => signHex(LEAD, bytes), { grantOpts: { fields: { paid: true, until: RL.clock.now + 30 * DAYMS } } }));
        if (madeUnmade.status !== 200) throw new Error("unmade team was not made: " + JSON.stringify(madeUnmade.json));
        const unmadeKeys = [{ id: unmadeMe.id, pub: unmadeMe.key, desk: unmadeMe.id }];
        const enUnmade = await ladmin("POST", "/relay/v1/t/" + unmadeRt + "/devices", { keys: unmadeKeys, rev: 1, t: RL.clock.now, sig: signHex(LEAD, core.devicesBytes(unmadeRt, 1, RL.clock.now, unmadeKeys)) });
        if (enUnmade.status !== 200) throw new Error("unmade desk was not enrolled: " + JSON.stringify(enUnmade.json));
        blockSince = true;
        await pumpL(unmade);
        await feed(unmade);
        const clearedRow = await rowOf(unmade);
        const chLapse = unmade.desk.api.relayRun() ? unmade.desk.api.relayRun().lapse() : null;
        check(!!uRow && !!uRow.lapse && uRow.lapse.step === "unknown" && !chLapse && !!clearedRow && !clearedRow.lapse && !notice() && settings("en").indexOf(TITLES[4]) < 0,
          "978k a session the relay accepts afterwards clears the new step: row "
          + JSON.stringify(clearedRow && clearedRow.lapse) + ", notice " + (notice() ? "shown" : "gone")
          + ", settings " + (settings("en").indexOf(TITLES[4]) >= 0 ? "says lapse" : "clear"));
      } catch (e) {
        check(false, "978 the lapse at the desk: " + (e && e.stack ? e.stack : e));
      } finally {
        for (const d of desks) { try { const ch = d.desk.api.relayRun(); if (ch) await ch.stop(); } catch { /* stopped */ } }
        Date.now = realNow;
        globalThis.WebSocket = was.WebSocket;
        globalThis.document = was.document;
        globalThis.window = was.window;
        globalThis.addEventListener = was.add;
        globalThis.removeEventListener = was.remove;
        globalThis.getComputedStyle = was.style;
      }
    }
  }

  if (partOn("p989d")) {
  markPart("p989d");

  /* ---- 989: a network whose gateway refuses the relay's push socket, at the desk. The desk's own shell on the relay of
     this file, its WebSocket a stand-in that closes before it opens, as a socket refused at its handshake does: the team's
     row in Settings says, in both languages, that updates arrive about once a minute, with its hover; once a socket opens,
     the row says nothing of it. ---- */
  {
    const LINE_EN = "On this network the team's updates arrive about once a minute, not live.";
    const LINE_PL = "W tej sieci aktualizacje zespołu docierają mniej więcej co minutę, a nie na bieżąco.";
    const TIP_EN = "This network does not let the live connection to the relay through, so Etiuda asks the relay about once a minute instead. Nothing is lost, and nothing needs doing.";
    const TIP_PL = "Ta sieć nie przepuszcza połączenia na żywo z przekaźnikiem, więc Etiuda pyta przekaźnik mniej więcej co minutę. Nic nie ginie i nic nie trzeba robić.";
    const realNow = Date.now;
    let jump = 0, opens = 0, tries = 0, refuse = true, desk = null;
    const was = { WebSocket: globalThis.WebSocket, document: globalThis.document, window: globalThis.window, style: globalThis.getComputedStyle };
    try {
      Date.now = () => realNow() + jump;
      globalThis.WebSocket = class {
        constructor() {
          tries++;
          this.readyState = 0;
          setImmediate(() => {
            if (refuse) { this.readyState = 3; if (this.onerror) this.onerror({}); if (this.onclose) this.onclose({}); return; }
            this.readyState = 1; opens++; if (this.onopen) this.onopen({});
          });
        }
        send() {}
        close() { this.readyState = 3; }
      };
      globalThis.window = globalThis.window || {};
      const cls = { contains: () => false, add() {}, remove() {}, toggle() {} };
      globalThis.document = { body: { appendChild: c => c, classList: cls }, documentElement: { classList: cls, dataset: {}, style: {} }, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild: c => c, setAttribute() {} }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
      globalThis.getComputedStyle = () => ({ fontSize: "16px" });
      let took = null;
      window.E_HOST = { teamJoin: (...a) => (desk ? desk.ask("etiuda:team-join", ...a) : Promise.resolve(null)), onTeamJoin: fn => { took = fn; } };
      const mod = n => import(pathToFileURL(path.join(ROOT, "src", "modules", n)).href);
      const HK = await mod("hooks.js");
      HK.hooks.render = () => {};
      const ST = await mod("storage.js"), TJ = await mod("team-join.js"), SET = await mod("settings.js");
      TJ.wireTeamJoin();
      await wait(20);

      const rt = hex(16), team = "t-" + hex(8);
      const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
      if (made.status !== 200) throw new Error("the team was not made: " + JSON.stringify(made.json));
      const ud = path.join(LAB, "989-desk");
      fs.mkdirSync(ud, { recursive: true });
      fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eUiLang: "en" },
        teamPins: { [team]: { keyId: LEAD.keyId, public: LEAD.pub } }, teamPinFrom: { [team]: "invite" },
        teamChannel: { [team]: { kind: "relay", rt, url: URLV1 } }, teamShown: { [team]: { lead: "Ada Quay" } } }), "utf8");
      desk = await loadDesk(ud);
      const me = await desk.ask("etiuda:branch-identity", true);
      const t = R.clock.now, keys = [{ id: me.id, pub: me.key, desk: me.id }];
      const en = await admin("POST", "/relay/v1/t/" + rt + "/devices", { keys, rev: 1, t, sig: signHex(LEAD, core.devicesBytes(rt, 1, t, keys)) });
      if (en.status !== 200) throw new Error("the desk was not enrolled: " + JSON.stringify(en.json));
      const pump = async () => { const ch = desk.api.relayRun(); if (ch) { ch.kick(); await ch.idle(); } await wait(30); return ch; };
      const rowOf = async () => {
        const v = await desk.ask("etiuda:team-join", "leads");
        return ((v && v.leads) || []).filter(l => l && l.team === team)[0] || null;
      };
      const settings = async lang => {
        took(await desk.ask("etiuda:team-join", "state"));
        await wait(10);
        ST.lsSet("eUiLang", lang);
        const h = shownText(SET.settingsBodyHtml());
        ST.lsSet("eUiLang", "en");
        return h;
      };
      const says = (h, line, tip) => h.indexOf(line) >= 0 && h.indexOf('title="' + tip + '"') >= 0;

      await pump(); await pump();
      await until(async () => { const r = await rowOf(); return !!r && r.asking === true; }, 8000);
      const ch = desk.api.relayRun();
      const downRow = await rowOf(), downEn = await settings("en"), downPl = await settings("pl");
      check(!!ch && ch.online() && opens === 0 && tries >= 1 && !!downRow && downRow.asking === true
        && says(downEn, LINE_EN, TIP_EN) && says(downPl, LINE_PL, TIP_PL),
        "989f a desk whose push socket is refused twice before it opens, while its asks are answered, says so on the team's row in"
        + " Settings, in English and in Polish, with its hover: online " + !!(ch && ch.online()) + ", sockets tried " + tries
        + ", opened " + opens + ", row " + (downRow ? (downRow.asking === true ? "asking" : "not asking") : "missing")
        + ", en " + says(downEn, LINE_EN, TIP_EN) + ", pl " + says(downPl, LINE_PL, TIP_PL));

      /* The gateway lets the socket through; the next minute's ask tries it again. */
      refuse = false;
      jump += 61 * 1000;
      await pump();
      const upRow = await rowOf(), upEn = await settings("en"), upPl = await settings("pl");
      const wasSaid = !!downRow && downRow.asking === true && says(downEn, LINE_EN, TIP_EN);
      check(wasSaid && opens >= 1 && !!upRow && upRow.asking !== true && upEn.indexOf(LINE_EN) < 0 && upEn.indexOf(TIP_EN) < 0
        && upPl.indexOf(LINE_PL) < 0 && upPl.indexOf(TIP_PL) < 0,
        "989g once a socket opens, the line the team's row said goes, in either language: said before " + wasSaid + ", opened " + opens
        + ", row " + (upRow ? (upRow.asking === true ? "asking" : "not asking") : "missing")
        + ", en " + (upEn.indexOf(LINE_EN) >= 0 ? "says it" : "clear") + ", pl " + (upPl.indexOf(LINE_PL) >= 0 ? "says it" : "clear"));
    } catch (e) {
      check(false, "989 the push socket at the desk: " + (e && e.stack ? e.stack : e));
    } finally {
      try { const c = desk && desk.api.relayRun(); if (c) await c.stop(); } catch { /* stopped */ }
      Date.now = realNow;
      globalThis.WebSocket = was.WebSocket;
      globalThis.document = was.document;
      globalThis.window = was.window;
      globalThis.getComputedStyle = was.style;
    }
  }
  }

  if (partOn("p932m")) {
  markPart("p932m");
}
  /* ---- 932m, board 931 (7) item 9: a synced relay desk keeps its channel when only the pin moves. The lead hands the team
     to a new key on the relay and in a team file whose handover the pinned lead signed; the desk's channel takes that file,
     the desk's pin follows it, and relayRun returns the same channel, never stopped, which takes the next file the new lead
     signs. The scene runs on the shell as it stands and, for 932n, on the shell with plant:ho9-keep-channel lifted. ---- */
  async function keptScene(source, tag) {
    const out = { asked: false, synced: false, moved: 0, handed: false, same: false, stops: 0, after: false, pinNow: "", followed: "", notes: [] };
    const rt = hex(16), team = "t-" + hex(8), key = crypto.randomBytes(32), NEXT = keyPair(true);
    const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
    if (made.status !== 200) throw new Error("the team was not made: " + JSON.stringify(made.json));
    const docOf = (rev, roster, lead, handover) => {
      const o = { format: 1, kind: "etiuda-team", id: team, catalogs: ["quay-board"], lead: { keyId: lead.keyId, public: lead.pub },
        sealed: true, exportsSealed: false, epoch: 1, rev, channel: { kind: "relay", rt, url: URLV1 }, ring: RING, roster };
      if (handover) o.handover = handover;
      o.sig = { alg: "Ed25519", keyId: lead.keyId };
      o.sig.value = signHex(lead, C.signedBytes(o));
      return JSON.stringify(o, null, 1) + "\n";
    };
    /* The lead's Studio: one channel, whose key is the new lead's once the relay has moved the team to it. */
    let leadKey = LEAD;
    const invs = [], sMirror = path.join(LAB, tag + "-studio"), sT = transport(tag + "-studio");
    const studioH = C.createChannel({ rt, url: URLV1, mirror: sMirror, stateFile: path.join(LAB, tag + "-studio.json"),
      pin: () => ({ teamId: team, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
      me: () => ({ keyId: leadKey.keyId, public: leadKey.pub, privateKey: leadKey.privateKey, place: "root" }),
      keyFor: e => (e === 1 ? key : null), sealEpoch: () => 1, inviteKeys: () => invs,
      request: sT.request, connect: sT.connect, pollMs: 1e9 });
    const ud = path.join(LAB, tag + "-desk"), share = path.join(LAB, tag + "-share");
    fs.mkdirSync(ud, { recursive: true });
    fs.mkdirSync(share, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: share, eUiLang: "en" } }), "utf8");
    const Dk = await loadDesk(ud, source);
    let ch = null, counting = true;
    try {
      put(sMirror, "board.ec", JSON.stringify(Dk.api.sealCatalog(key, team, 1, catalogText(1))));
      put(sMirror, C.TEAM_NAME, docOf(1, [], LEAD));
      studioH.start();
      await studioH.idle();
      const inv = await relayInviteOn(rt, team);
      invs.push({ id: inv.inv, key: C.inviteSealKey(inv.secret) });
      await studioH.kick(); await studioH.idle();
      const taken = await Dk.ask("etiuda:team-join", "invite", inv.text, "Desk Nine", "");
      if (!taken || taken.refused) throw new Error("the invitation was refused: " + JSON.stringify(taken));
      const me = await Dk.ask("etiuda:branch-identity", false);
      const mirror = path.join(ud, "relay", rt);
      const pump = async () => {
        const c = Dk.api.relayRun();
        if (c) { c.kick(); await c.idle(); }
        await studioH.kick(); await studioH.idle();
      };
      out.asked = await until(async () => { await pump(); return !!read(sMirror, "desks/" + me.id + "/join.json"); }, 30000);
      /* The lead admits it: the roster with its wrap, the device enrolled, the invitation let go. */
      const entry = { desk: { id: me.id, key: me.key, box: me.box }, wrap: Dk.api.wrapTeamKey(key, me.box, team, 1, me.id) };
      put(sMirror, C.TEAM_NAME, docOf(2, [entry], LEAD));
      const t1 = R.clock.now, keys = [{ id: me.id, pub: me.key, desk: me.id }];
      await admin("POST", "/relay/v1/t/" + rt + "/devices", { keys, rev: 1, t: t1, sig: signHex(LEAD, core.devicesBytes(rt, 1, t1, keys)) });
      await studioH.kick(); await studioH.idle();
      invs.length = 0;
      out.synced = await until(async () => {
        await pump();
        const h = Dk.api.relayHere();
        return factsOf(Dk.api.readCatalog() || "") === 1 && !!h && h.joining === false
          && (Dk.envelope().teamPins || {})[team] && Dk.envelope().teamPins[team].public === LEAD.pub;
      }, 30000);
      if (!out.synced) return out;
      /* The channel the synced desk runs, its stop counted from here on. */
      ch = Dk.api.relayRun();
      if (ch) {
        const stop = ch.stop;
        ch.stop = function () { if (counting) out.stops++; return stop.apply(this, arguments); };
      }
      /* The handover. The team file the new lead signs, carrying the step the pinned lead signed, goes up from the lead's
         Studio while the relay still knows the old key; the desk's channel takes it and the desk's pin follows it. Then the
         relay moves the team to the new key, signed by the old one. (Put up under the new key's own session, that file is
         left out by the desk as from a key not on the team file it holds, so the order here is the one a desk can follow.) */
      const step = { format: 1, kind: "etiuda-team-handover", team, from: { keyId: LEAD.keyId, public: LEAD.pub },
        to: { keyId: NEXT.keyId, public: NEXT.pub }, sig: { alg: "Ed25519", keyId: LEAD.keyId } };
      step.sig.value = signHex(LEAD, Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), C.signedBytes(step)]));
      put(sMirror, C.TEAM_NAME, docOf(3, [entry], NEXT, [step]));
      await studioH.kick(); await studioH.idle();
      out.handed = await until(async () => {
        await pump();
        const p = (Dk.envelope().teamPins || {})[team];
        return !!p && p.public === NEXT.pub;
      }, 30000);
      if (!out.handed) out.notes.push("rev at the desk " + (JSON.parse(read(mirror, C.TEAM_NAME) || "{}").rev) + ", at the lead " + (JSON.parse(read(sMirror, C.TEAM_NAME) || "{}").rev)
        + "; desk " + Dk.said.slice(-4).join(" / "));
      R.clock.now += 1;
      const tMove = R.clock.now;
      const moveBytes = Buffer.from("etiuda-relay-lead\n" + rt + "\n" + NEXT.keyId + "\n" + NEXT.pub + "\n" + tMove, "utf8");
      const moveRes = await admin("POST", "/relay/v1/t/" + rt + "/lead", { to: { keyId: NEXT.keyId, pub: NEXT.pub }, t: tMove,
        sig: signHex(LEAD, moveBytes), grant: K.grantFor(NEXT.pub, tMove) });
      out.moved = moveRes.status;
      if (moveRes.status !== 200) { out.notes.push("move " + JSON.stringify(moveRes.json)); return out; }
      leadKey = NEXT;
      /* The next file the new lead signs, on the channel the desk runs now. */
      const AFTER = "after the handover, " + tag + "\n";
      put(sMirror, "after.ec", AFTER);
      await studioH.kick(); await studioH.idle();
      out.after = await until(async () => { await pump(); return read(mirror, "after.ec") === AFTER; }, 30000);
      if (!out.after) out.notes.push("after.ec at the lead " + (read(sMirror, "after.ec") !== null) + "; studio " + sT.log.slice(-4).join(" ")
        + "; desk " + Dk.said.slice(-3).join(" / "));
      const now = Dk.api.relayRun();
      out.same = !!ch && now === ch;
      const pinned = now && now.program && typeof now.program.pinned === "function" ? now.program.pinned() : null;
      out.followed = pinned && pinned.lead && pinned.lead.public === NEXT.pub ? "the new lead" : pinned && pinned.lead ? "another key" : "nothing";
      const p = (Dk.envelope().teamPins || {})[team];
      out.pinNow = p && p.public === NEXT.pub ? "the new lead" : p ? "another key" : "none";
      return out;
    } finally {
      counting = false;
      try { await studioH.stop(); } catch { /* stopped */ }
      try { const c = Dk.api.relayRun(); if (c) await c.stop(); } catch { /* stopped */ }
      try { if (ch) await ch.stop(); } catch { /* stopped */ }
    }
  }
  if (partOn("p932m")) {
  {
      let k = null, err = "";
      try { k = await keptScene(SRC, "ho9-kept"); } catch (e) { err = e && e.stack ? e.stack : String(e); }
      check(!!k && k.asked && k.synced && k.moved === 200 && k.handed && k.same && k.stops === 0 && k.after
        && k.pinNow === "the new lead" && k.followed === "the new lead",
        "932m a synced relay desk keeps its channel when only the pin moves: after a genuine handover the channel relayRun"
        + " returns is " + (k && k.same ? "the same one" : "another one") + ", stopped " + (k ? k.stops : "?") + " time(s), the desk's pin "
        + (k ? k.pinNow : "?") + ", the channel's " + (k ? k.followed : "?") + ", the next file the new lead signs "
        + (k && k.after ? "taken" : "not taken") + (k ? ", synced " + k.synced + ", move " + k.moved + (k.notes.length ? ", " + k.notes.join("; ") : "") : "")
        + (err ? ", " + err : ""));
      const kept = await liftDesk("plant:ho9-keep-channel", async text => {
        const p = await keptScene(text, "ho9-plant");
        /* Lifted, the handover still lands and the file is still taken, so only the channel kept turns. */
        return p.synced && p.handed && p.after && p.pinNow === "the new lead" && (!p.same || p.stops > 0);
      });
      check(kept.turned && kept.back, "932n lifting plant:ho9-keep-channel rebuilds the channel when only the pin moved, and the product"
        + " file is never written: " + kept.detail + ", sha " + (kept.back ? "restored" : "differs"));
    }
}
  if (partOn("p939")) {
  markPart("p939");
}
  /* ---- 939, a relay desk's live path (Argon's relay review of 2026-11-01, findings 2 and 3 (1), as the test architect
     conditioned them at 01:43), and board 931 (7) item 7's fork rule on the same path. Each scene is a shell desk joined by
     invitation and synced, driven through relayRun, createChannel and catchUp against the in-memory relay, with the lead's
     Studio a channel of its own; "away" is the desk's transport down. A plant is lifted from a copy of shell/ the desk loads,
     and the product file is only read. A compound plant carries one tag on every site it lifts, and each line carrying it is
     removed at once; `sites` counts them, a tag matched whole so that it is never read inside a longer one. ---- */
  async function liftApp(tag, fn) {
    const src = path.join(ROOT, "shell", "relay", "channel.cjs");
    const beforeBytes = fs.readFileSync(src), digest = sha(beforeBytes);
    let turned = false, detail = "plant line absent", sites = 0;
    try {
      /* A tag, or a list of tags lifted together: every tag must find its line. */
      const tags = Array.isArray(tag) ? tag : [tag];
      const lines = beforeBytes.toString("utf8").split(/\n/);
      const marks = l => l.match(/plant:[\w-]+/g) || [];
      const kept = lines.filter(l => !marks(l).some(m => tags.indexOf(m) >= 0));
      sites = lines.length - kept.length;
      if (sites > 0 && tags.every(tg => lines.some(l => marks(l).indexOf(tg) >= 0))) {
        const dir = fs.mkdtempSync(path.join(LAB, "app-plant-"));
        fs.cpSync(path.join(APP, "shell"), path.join(dir, "shell"), { recursive: true });
        fs.writeFileSync(path.join(dir, "shell", "relay", "channel.cjs"), kept.join("\n"), "utf8");
        turned = await fn(path.join(dir, "shell"));
        detail = (sites > 1 ? sites + " sites lifted, " : "") + (turned ? "the check lifted" : "the check still held");
      }
    } catch (e) {
      detail = e && e.stack ? e.stack : String(e);
    }
    return { turned, back: sha(fs.readFileSync(src)) === digest, detail, sites };
  }
  /* An upload made by hand under `who`'s own session, as a program holding that key could make it. */
  async function putRaw(rt, who, b) {
    const t = transport("raw-" + hex(3));
    const h = await t.request("POST", URLV1 + "/t/" + rt + "/hello", {}, Buffer.from("{}"));
    const challenge = JSON.parse(h.bytes.toString()).challenge;
    const ses = await t.request("POST", URLV1 + "/t/" + rt + "/session", { "content-type": "application/json" },
      Buffer.from(JSON.stringify(Object.assign({ challenge, key: who.keyId, pub: who.pub, sig: signHex(who, C.helloBytes(rt, challenge, who.keyId)) },
        who.keyId !== LEAD.keyId ? { seat: seatFor(who) } : {}))));
    const token = JSON.parse(ses.bytes.toString()).session;
    const meta = { v: 1, id: b.id, supersedes: b.supersedes, epoch: b.epoch, writer: b.writerKeyId, counter: b.counter, del: b.deletion,
      sig: b.signature, nonce: b.nonce, place: b.place };
    const r = await t.request("PUT", URLV1 + "/t/" + rt + "/b/" + b.id,
      { authorization: "Bearer " + token, "etiuda-blob": Buffer.from(JSON.stringify(meta)).toString("base64url") }, b.ciphertext);
    return r.status;
  }
  /* One relay team: its lead's Studio, whose team file names the lead's box, and a desk joined by invitation and synced to its
     edition, head and span. `app`: the copy of shell/ the desk loads, or loadDesk's hooks. */
  async function relayDeskScene(tag, app) {
    const rt = hex(16), team = "t-" + hex(8), keys = new Map([[1, crypto.randomBytes(32)]]);
    const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
    if (made.status !== 200) throw new Error("the team was not made: " + JSON.stringify(made.json));
    const s = { rt, team, keys, lead: LEAD, box: boxPair(), invs: [] };
    s.boxNow = s.box;
    const ringOf = leads => ({ format: 1, kind: "etiuda-ring", keys: leads.map(k => ({ catalog: "quay-board", keyId: k.keyId, alg: "Ed25519", public: k.pub })) });
    s.doc = f => {
      const lead = f.lead || LEAD;
      const d = { format: 1, kind: "etiuda-team", id: team, catalogs: ["quay-board"], lead: { keyId: lead.keyId, public: lead.pub, box: (f.box || s.box).pub },
        sealed: true, exportsSealed: false, epoch: f.epoch || 1, rev: f.rev, channel: f.channel || { kind: "relay", rt, url: URLV1 },
        ring: ringOf(f.ring || [LEAD]), roster: f.roster || [] };
      if (f.handover) d.handover = f.handover;
      d.sig = { alg: "Ed25519", keyId: lead.keyId };
      d.sig.value = signHex(lead, C.signedBytes(d));
      return JSON.stringify(d, null, 1) + "\n";
    };
    s.catalog = (rev, key, word) => {
      const o = { format: 2, kind: "etiuda-catalog", id: "quay-board", rev, name: "Quay Board", date: "2026-03-0" + rev,
        langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
        cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" }, body: { en: "Good day, " + word + "." } }] };
      o.sig = { alg: "Ed25519", keyId: key.keyId };
      o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), key.privateKey).toString("hex");
      return JSON.stringify(o, null, 1) + "\n";
    };
    s.head = (key, epoch, rev, edition) => signHead({ v: 1, team, epoch, rev, t: Date.now(),
      editions: [{ catalog: "quay-board", rev: 1, edition, published: "1 November 2026" }] }, key);
    s.span = (key, span) => {
      const d = { format: 1, kind: "etiuda-stats-span", span: span || "rolling-30", sig: { alg: "Ed25519", keyId: key.keyId } };
      d.sig.value = signHex(key, Buffer.concat([Buffer.from("etiuda-stats-span\n", "utf8"), C.signedBytes(d)]));
      return JSON.stringify(d, null, 1) + "\n";
    };
    s.step = (from, to) => {
      const st = { format: 1, kind: "etiuda-team-handover", team, from: { keyId: from.keyId, public: from.pub },
        to: { keyId: to.keyId, public: to.pub }, sig: { alg: "Ed25519", keyId: from.keyId } };
      st.sig.value = signHex(from, Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), C.signedBytes(st)]));
      return st;
    };
    /* The relay moves the team to `next`, signed by the lead it names now; the lead's Studio then writes as `next`. */
    s.handTo = async next => {
      R.clock.now += 1;
      const t = R.clock.now;
      const bytes = Buffer.from("etiuda-relay-lead\n" + rt + "\n" + next.keyId + "\n" + next.pub + "\n" + t, "utf8");
      const res = await admin("POST", "/relay/v1/t/" + rt + "/lead", { to: { keyId: next.keyId, pub: next.pub }, t, sig: signHex(s.lead, bytes),
        grant: K.grantFor(next.pub, t) });
      if (res.status === 200) s.lead = next;
      return res.status;
    };
    s.sMirror = path.join(LAB, tag + "-studio");
    const sT = transport(tag + "-studio");
    /* Every upload the lead's Studio makes, kept as a relay that kept everything would serve it (939j reads them as a thief would). */
    s.sent = [];
    s.request = async (m, u, h, b) => {
      if (m === "PUT") s.sent.push({ meta: JSON.parse(Buffer.from(h["etiuda-blob"], "base64url").toString("utf8")), ct: Buffer.from(b) });
      return sT.request(m, u, h, b);
    };
    s.studio = C.createChannel({ rt, url: URLV1, mirror: s.sMirror, stateFile: path.join(LAB, tag + "-studio.json"),
      pin: () => ({ teamId: team, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
      me: () => ({ keyId: s.lead.keyId, public: s.lead.pub, privateKey: s.lead.privateKey, place: "root" }),
      keyFor: e => keys.get(e) || null, sealEpoch: () => Math.max(...keys.keys()), inviteKeys: () => s.invs,
      agree: peer => agreeWith(s.boxNow)(peer), request: s.request, connect: sT.connect, pollMs: 1e9 });
    s.ud = path.join(LAB, tag + "-desk");
    s.share = path.join(LAB, tag + "-share");
    fs.mkdirSync(s.ud, { recursive: true });
    fs.mkdirSync(s.share, { recursive: true });
    fs.writeFileSync(path.join(s.ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: s.share, eUiLang: "en" } }), "utf8");
    /* An object is hooks for loadDesk, or { src } for a planted shell source (the leave route's 987v). */
    s.Dk = await loadDesk(s.ud, app ? (typeof app === "object" ? (typeof app.src === "string" ? app.src : app) : { app }) : undefined);
    s.stop = async () => {
      deskTransport.down = false;
      try { await s.studio.stop(); } catch { /* stopped */ }
      try { const c = s.Dk.api.relayRun(); if (c) await c.stop(); } catch { /* stopped */ }
    };
    try {
      const key1 = keys.get(1);
      put(s.sMirror, "board.ec", JSON.stringify(s.Dk.api.sealCatalog(key1, team, 1, s.catalog(1, LEAD, "edition one"))));
      put(s.sMirror, HEAD_FILE, s.head(LEAD, 1, 1, "First edition"));
      put(s.sMirror, "stats-span.json", s.span(LEAD));
      put(s.sMirror, C.TEAM_NAME, s.doc({ rev: 1 }));
      s.studio.start();
      await s.studio.idle();
      const inv = await relayInviteOn(rt, team);
      s.invs.push({ id: inv.inv, key: C.inviteSealKey(inv.secret) });
      await s.studio.kick(); await s.studio.idle();
      const taken = await s.Dk.ask("etiuda:team-join", "invite", inv.text, "Desk Nine", "");
      if (!taken || taken.refused) throw new Error("the invitation was refused: " + JSON.stringify(taken));
      s.me = await s.Dk.ask("etiuda:branch-identity", false);
      s.mirror = path.join(s.ud, "relay", rt);
      s.pump = async () => {
        const c = s.Dk.api.relayRun();
        if (c) { c.kick(); await c.idle(); }
        await s.studio.kick(); await s.studio.idle();
      };
      const asked = await until(async () => { await s.pump(); return !!read(s.sMirror, "desks/" + s.me.id + "/join.json"); }, 30000);
      s.entry = (key, epoch) => ({ desk: { id: s.me.id, key: s.me.key, box: s.me.box }, wrap: s.Dk.api.wrapTeamKey(key, s.me.box, team, epoch, s.me.id) });
      put(s.sMirror, C.TEAM_NAME, s.doc({ rev: 2, roster: [s.entry(key1, 1)] }));
      const t1 = R.clock.now, dk = [{ id: s.me.id, pub: s.me.key, desk: s.me.id }];
      await admin("POST", "/relay/v1/t/" + rt + "/devices", { keys: dk, rev: 1, t: t1, sig: signHex(LEAD, core.devicesBytes(rt, 1, t1, dk)) });
      await s.studio.kick(); await s.studio.idle();
      s.invs.length = 0;
      s.synced = asked && await until(async () => {
        await s.pump();
        const h = s.Dk.api.relayHere(), p = (s.Dk.envelope().teamPins || {})[team];
        return factsOf(s.Dk.api.readCatalog() || "") === 1 && !!h && h.joining === false && !!p && p.public === LEAD.pub
          && read(s.mirror, HEAD_FILE) !== null && read(s.mirror, "stats-span.json") !== null;
      }, 30000);
    } catch (e) {
      await s.stop();
      throw e;
    }
    return s;
  }
  /* What the desk shows now: whose its pin is, whose edition it opens and of which rev, the head's edition, the epoch of the
     team file in its mirror, and whether the span in its mirror is `span` and verifies under the lead it follows. */
  function deskNow(s, lead, span) {
    const D = s.Dk, p = (D.envelope().teamPins || {})[s.team];
    let cat = null;
    try { cat = JSON.parse(D.api.readCatalog() || "null"); } catch { cat = null; }
    const c = D.api.relayRun();
    let n = null;
    try { n = c && c.program ? c.program.headNews(Date.now()) : null; } catch { n = null; }
    let epoch = null;
    try { epoch = JSON.parse(read(s.mirror, C.TEAM_NAME)).epoch; } catch { epoch = null; }
    const text = read(s.mirror, "stats-span.json");
    let spanOk = false;
    try {
      const doc = text === span ? D.api.spanDocument(text) : null, pl = D.api.pinnedLead();
      spanOk = !!doc && !!pl && pl.public === lead.pub && D.api.spanGenuine(doc, pl) === true;
    } catch { spanOk = false; }
    return { pin: p && p.public === lead.pub ? "the new lead" : p && p.public === LEAD.pub ? "the old lead" : p ? "another key" : "none",
      edition: cat && cat.sig ? (cat.sig.keyId === lead.keyId ? "re-signed" : "the old one") + " rev " + cat.rev : "none",
      head: n && n.edition ? n.edition : "none", epoch, span: spanOk };
  }

  /* 939a, finding 2 (1) and (2): the lead hands the team to a new key on the relay, then writes as that key the team file
     carrying the step the old key signed, and the edition, head and span re-signed under it, each replacing the old key's
     blob of its path. The new key has a box of its own, as Studio makes one. */
  async function handoverOnline(tag, app, ceiling) {
    const out = { synced: false, moved: 0, now: null, notes: [] };
    const s = await relayDeskScene(tag, app);
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const NEXT = keyPair(true), key1 = s.keys.get(1);
      out.moved = await s.handTo(NEXT);
      if (out.moved !== 200) return out;
      s.boxNow = boxPair();
      const span = s.span(NEXT);
      put(s.sMirror, C.TEAM_NAME, s.doc({ rev: 3, roster: [s.entry(key1, 1)], lead: NEXT, box: s.boxNow, handover: [s.step(LEAD, NEXT)], ring: [LEAD, NEXT] }));
      put(s.sMirror, "board.ec", JSON.stringify(s.Dk.api.sealCatalog(key1, s.team, 1, s.catalog(1, NEXT, "edition one"))));
      put(s.sMirror, HEAD_FILE, s.head(NEXT, 1, 3, "Handover edition"));
      put(s.sMirror, "stats-span.json", span);
      await s.studio.kick(); await s.studio.idle();
      const done = n => n.pin === "the new lead" && n.edition === "re-signed rev 1" && n.head === "Handover edition" && n.span;
      await until(async () => { await s.pump(); return done(deskNow(s, NEXT, span)); }, ceiling || 30000);
      out.now = deskNow(s, NEXT, span);
      out.ok = done(out.now);
      if (!out.ok) out.notes.push("desk " + s.Dk.said.slice(-3).join(" / "));
      return out;
    } finally {
      await s.stop();
    }
  }
  /* 939d, finding 2 (3): the desk is away while the lead hands the team to a new key and then moves it to a new team key. The
     lead keeps the team's box across the handover; Studio does not yet (the report says what it must change). */
  async function handoverAway(tag, app, ceiling) {
    const out = { synced: false, moved: 0, now: null, notes: [] };
    const s = await relayDeskScene(tag, app);
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const NEXT = keyPair(true), key1 = s.keys.get(1);
      deskTransport.down = true;
      out.moved = await s.handTo(NEXT);
      if (out.moved !== 200) return out;
      const step = s.step(LEAD, NEXT);
      put(s.sMirror, C.TEAM_NAME, s.doc({ rev: 3, roster: [s.entry(key1, 1)], lead: NEXT, handover: [step], ring: [LEAD, NEXT] }));
      put(s.sMirror, "board.ec", JSON.stringify(s.Dk.api.sealCatalog(key1, s.team, 1, s.catalog(1, NEXT, "edition one"))));
      put(s.sMirror, HEAD_FILE, s.head(NEXT, 1, 3, "Handover edition"));
      put(s.sMirror, "stats-span.json", s.span(NEXT));
      await s.studio.kick(); await s.studio.idle();
      const key2 = crypto.randomBytes(32);
      s.keys.set(2, key2);
      const span = s.span(NEXT, "this-month");
      put(s.sMirror, C.TEAM_NAME, s.doc({ epoch: 2, rev: 1, roster: [s.entry(key2, 2)], lead: NEXT, handover: [step], ring: [LEAD, NEXT] }));
      put(s.sMirror, "board.ec", JSON.stringify(s.Dk.api.sealCatalog(key2, s.team, 2, s.catalog(2, NEXT, "edition two"))));
      put(s.sMirror, HEAD_FILE, s.head(NEXT, 2, 1, "Second key edition"));
      put(s.sMirror, "stats-span.json", span);
      await s.studio.kick(); await s.studio.idle();
      deskTransport.down = false;
      const done = n => n.pin === "the new lead" && n.epoch === 2 && n.edition === "re-signed rev 2" && n.head === "Second key edition" && n.span;
      await until(async () => { await s.pump(); return done(deskNow(s, NEXT, span)); }, ceiling || 30000);
      out.now = deskNow(s, NEXT, span);
      out.ok = done(out.now);
      if (!out.ok) out.notes.push("desk " + s.Dk.said.slice(-3).join(" / "));
      return out;
    } finally {
      await s.stop();
    }
  }
  /* 939j, finding 2 (3) for a key that may be in other hands (Max's ruling of 2026-11-01 06:13): the lead hands the team to a new
     key that makes a fresh box, then moves it to a new team key, while the desk is away. The desk, holding only the old box's
     public half, does not open the new lead's copies, and stays on the old lead and the first key. And the old key's holder,
     with the old box, the first team key and the old signing key, opens nothing uploaded from the epoch move on: no blob under
     the first key, and no copy it can agree for the desk with the old box. The same search with the box the lead used finds
     the desk's copy and opens it, so a miss is a miss and not a search that finds nothing. `keep` (939k): the lead keeps the
     old box, as 939d does, and the old key's holder then finds and opens the desk's copy of the new key's file. */
  function aesOpens(it, rt, key) {
    try {
      const ct = it.ct, k = Buffer.from(key);
      const aad = B.aadOf({ relayTeamId: rt, epoch: it.meta.epoch, id: it.meta.id, supersedes: it.meta.supersedes, writerKeyId: it.meta.writer, counter: it.meta.counter });
      if (!aad || k.length !== B.KEY_BYTES || ct.length < B.TAG_BYTES || !/^[0-9a-f]{24}$/.test(String(it.meta.nonce))) return false;
      const d = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(it.meta.nonce, "hex"), { authTagLength: B.TAG_BYTES });
      d.setAAD(aad);
      d.setAuthTag(ct.subarray(ct.length - B.TAG_BYTES));
      Buffer.concat([d.update(ct.subarray(0, ct.length - B.TAG_BYTES)), d.final()]);
      return true;
    } catch { return false; }
  }
  async function handoverAwayFresh(tag, keep) {
    const out = { synced: false, moved: 0, now: null, notes: [], after: 0, underOld: 0, oldCopies: 0, oldCopyOpens: 0, newCopies: 0, newCopyOpens: 0 };
    const s = await relayDeskScene(tag);
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const NEXT = keyPair(true), key1 = s.keys.get(1), OLDBOX = s.box;
      deskTransport.down = true;
      out.moved = await s.handTo(NEXT);
      if (out.moved !== 200) return out;
      if (!keep) s.boxNow = boxPair();
      const step = s.step(LEAD, NEXT);
      put(s.sMirror, C.TEAM_NAME, s.doc({ rev: 3, roster: [s.entry(key1, 1)], lead: NEXT, box: s.boxNow, handover: [step], ring: [LEAD, NEXT] }));
      put(s.sMirror, "board.ec", JSON.stringify(s.Dk.api.sealCatalog(key1, s.team, 1, s.catalog(1, NEXT, "edition one"))));
      put(s.sMirror, HEAD_FILE, s.head(NEXT, 1, 3, "Handover edition"));
      put(s.sMirror, "stats-span.json", s.span(NEXT));
      await s.studio.kick(); await s.studio.idle();
      const atMove = s.sent.length;
      const key2 = crypto.randomBytes(32);
      s.keys.set(2, key2);
      const span = s.span(NEXT, "this-month");
      put(s.sMirror, C.TEAM_NAME, s.doc({ epoch: 2, rev: 1, roster: [s.entry(key2, 2)], lead: NEXT, box: s.boxNow, handover: [step], ring: [LEAD, NEXT] }));
      put(s.sMirror, "board.ec", JSON.stringify(s.Dk.api.sealCatalog(key2, s.team, 2, s.catalog(2, NEXT, "edition two"))));
      put(s.sMirror, HEAD_FILE, s.head(NEXT, 2, 1, "Second key edition"));
      put(s.sMirror, "stats-span.json", span);
      await s.studio.kick(); await s.studio.idle();
      /* What the old key's holder can reach of everything uploaded from the epoch move on. */
      const after = s.sent.slice(atMove).filter(u => !u.meta.del);
      out.after = after.length;
      out.underOld = after.filter(u => aesOpens(u, s.rt, key1)).length;
      const copyWith = (box, writer) => C.deskCopyOf(agreeWith(box)(s.me.box), { rt: s.rt, teamId: s.team, leadKeyId: writer.keyId, leadBox: box.pub,
        deskId: s.me.id, deskBox: s.me.box });
      const copies = box => [LEAD, NEXT].map(w => copyWith(box, w)).filter(Boolean);
      out.oldCopies = copies(OLDBOX).reduce((n, c) => n + after.filter(u => u.meta.place === "invite:" + c.id).length, 0);
      out.oldCopyOpens = copies(OLDBOX).reduce((n, c) => n + after.filter(u => u.meta.place === "invite:" + c.id && aesOpens(u, s.rt, c.key)).length, 0);
      out.newCopies = copies(s.boxNow).reduce((n, c) => n + after.filter(u => u.meta.place === "invite:" + c.id).length, 0);
      out.newCopyOpens = copies(s.boxNow).reduce((n, c) => n + after.filter(u => u.meta.place === "invite:" + c.id && aesOpens(u, s.rt, c.key)).length, 0);
      deskTransport.down = false;
      const settled = n => keep ? n.pin === "the new lead" && n.epoch === 2 : false;
      await until(async () => { await s.pump(); return settled(deskNow(s, NEXT, span)); }, keep ? 30000 : 2500);
      out.now = deskNow(s, NEXT, span);
      return out;
    } finally {
      await s.stop();
    }
  }
  /* 939l, the test architect's condition on the lead box (2026-11-01 07:07): the scene of 939j, the desk away across a handover
     to a key with a fresh box and the next key change, now with work of its own: a new file in its own place written while
     away and another once back, as its writers put a branch file or its statistics there. Left behind, it puts nothing up
     (every PUT it makes from its return on is counted), says the copywriter's line once over several cycles, and gives the
     team's row the notice until the agent dismisses it. `keep` (939L, the control): the old box kept, the desk follows and its
     files go up. `app`: a copy of shell/ or loadDesk's hooks, for a plant. */
  /* The away half of 939l's scene, shared by its ways out (939q, 939r): handed to NEXT and moved to the second key while the
     desk is away, a file written in its own place then and another once back, each followed by three pumps. */
  async function strandAway(s, keep) {
    const a = { moved: 0, NEXT: keyPair(true), key2: null, step: null, oldBox: s.box, own: "desks/" + s.me.id + "/", mark: 0 };
    const NEXT = a.NEXT, key1 = s.keys.get(1);
    deskTransport.down = true;
    a.moved = await s.handTo(NEXT);
    if (a.moved !== 200) return a;
    if (!keep) s.boxNow = boxPair();
    const step = a.step = s.step(LEAD, NEXT);
    put(s.sMirror, C.TEAM_NAME, s.doc({ rev: 3, roster: [s.entry(key1, 1)], lead: NEXT, box: s.boxNow, handover: [step], ring: [LEAD, NEXT] }));
    put(s.sMirror, "board.ec", JSON.stringify(s.Dk.api.sealCatalog(key1, s.team, 1, s.catalog(1, NEXT, "edition one"))));
    await s.studio.kick(); await s.studio.idle();
    const key2 = a.key2 = crypto.randomBytes(32);
    s.keys.set(2, key2);
    put(s.sMirror, C.TEAM_NAME, s.doc({ epoch: 2, rev: 1, roster: [s.entry(key2, 2)], lead: NEXT, box: s.boxNow, handover: [step], ring: [LEAD, NEXT] }));
    put(s.sMirror, "board.ec", JSON.stringify(s.Dk.api.sealCatalog(key2, s.team, 2, s.catalog(2, NEXT, "edition two"))));
    await s.studio.kick(); await s.studio.idle();
    put(s.mirror, a.own + "away.json", JSON.stringify({ written: "while away" }) + "\n");
    a.mark = deskTransport.log.length;
    deskTransport.down = false;
    for (let i = 0; i < 3; i++) await s.pump();
    put(s.mirror, a.own + "back.json", JSON.stringify({ written: "once back" }) + "\n");
    for (let i = 0; i < 3; i++) await s.pump();
    return a;
  }
  async function strandedScene(tag, keep, app) {
    const out = { synced: false, moved: 0, puts: 0, said: 0, epoch: null, pin: "", row: null, rowAfter: null, saidRestart: -1, putsRestart: -1 };
    const s = await relayDeskScene(tag, app);
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const a = await strandAway(s, keep);
      out.moved = a.moved;
      if (out.moved !== 200) return out;
      const NEXT = a.NEXT, mark = a.mark;
      if (keep) await until(async () => { await s.pump(); return deskTransport.log.slice(mark).filter(l => l.startsWith("PUT ") && l.indexOf("/t/" + s.rt + "/b/") >= 0).length >= 2; }, 30000);
      out.puts = deskTransport.log.slice(mark).filter(l => l.startsWith("PUT ") && l.indexOf("/t/" + s.rt + "/b/") >= 0).length;
      out.said = s.Dk.said.filter(l => l.indexOf(C.STRANDED_SAID || "the line is not exported") >= 0).length;
      try { out.epoch = JSON.parse(read(s.mirror, C.TEAM_NAME)).epoch; } catch { out.epoch = null; }
      const p = (s.Dk.envelope().teamPins || {})[s.team];
      out.pin = p && p.public === NEXT.pub ? "the new lead" : p && p.public === LEAD.pub ? "the old lead" : "none";
      const rowOf = v => ((v && v.leads) || []).find(r => r.team === s.team) || null;
      const row = rowOf(await s.Dk.ask("etiuda:team-join", "leads"));
      out.row = row ? (row.stranded ? JSON.stringify(row.stranded) : "none") : "no row";
      if (row && row.stranded) {
        await s.Dk.ask("etiuda:team-join", "stranded-seen", s.team);
        const after = rowOf(await s.Dk.ask("etiuda:team-join", "leads"));
        out.rowAfter = after ? (after.stranded ? JSON.stringify(after.stranded) : "none") : "no row";
      }
      /* The desk started again on the same profile: the line is not said again, and still nothing goes up. */
      const was = s.Dk.api.relayRun();
      if (was) await was.stop();
      s.Dk = await loadDesk(s.ud, app ? (typeof app === "object" ? app : { app }) : undefined);
      const again = deskTransport.log.length;
      for (let i = 0; i < 3; i++) await s.pump();
      out.saidRestart = s.Dk.said.filter(l => l.indexOf(C.STRANDED_SAID || "the line is not exported") >= 0).length;
      out.putsRestart = deskTransport.log.slice(again).filter(l => l.startsWith("PUT ") && l.indexOf("/t/" + s.rt + "/b/") >= 0).length;
      return out;
    } finally {
      await s.stop();
    }
  }
  /* The new lead's invitation for the team, registered on the relay under NEXT's signature and naming its box. */
  async function nextInvite(s, a) {
    const NEXT = a.NEXT, secret = hex(16), inv = hex(16), token = hex(32), at = R.clock.now;
    const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }];
    const reg = await admin("POST", "/relay/v1/t/" + s.rt + "/invites", { add, drop: [], t: at, sig: signHex(NEXT, core.invitesBytes(s.rt, at, add, [])) });
    if (reg.status !== 200) throw new Error("the new lead's invitation was not registered: " + JSON.stringify(reg.json));
    s.invs.push({ id: inv, key: C.inviteSealKey(secret) });
    return "etiuda-join:" + Buffer.from(JSON.stringify({ team: s.team, relay: { rt: s.rt, url: URLV1, token, inv },
      lead: { keyId: NEXT.keyId, public: NEXT.pub, name: "Ada Quay", box: s.boxNow.pub }, secret }), "utf8").toString("base64url");
  }
  /* 939q and 939r, the test architect's E1 on the lead box (2026-11-01 07:47): the ways out of being left behind, each from
     939l's scene once the desk is left. "invite" (939q): the agent leaves the team and takes the new lead's invitation; the
     lead writes its team file again, and the desk finds its copy by the invitation's box. "recopy" (939r): the lead puts up one copy for the desk at the place the box the desk holds names, as
     a program holding that box and the new key could. Either way the desk's two files reach the lead's mirror, opened. */
  async function strandedWayOut(tag, way, app, ceiling) {
    const out = { synced: false, moved: 0, before: "", taken: "", recopy: 0, arrived: false, said: 0, epoch: null, pin: "", row: "" };
    const s = await relayDeskScene(tag, app);
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const a = await strandAway(s, false);
      out.moved = a.moved;
      if (out.moved !== 200) return out;
      const NEXT = a.NEXT;
      const rowOf = v => ((v && v.leads) || []).find(r => r.team === s.team) || null;
      const row0 = rowOf(await s.Dk.ask("etiuda:team-join", "leads"));
      out.before = row0 && row0.stranded ? "left behind" : "not left behind";
      if (way === "invite") {
        const text = await nextInvite(s, a);
        const asked = read(s.sMirror, a.own + "join.json");
        await s.Dk.ask("etiuda:team-join", "leave", s.team);
        /* As 961f: the channel stops on the shell's next turn after a leave, and a person takes the invitation after that. */
        await wait(50);
        const again = await s.Dk.ask("etiuda:team-join", "invite", text, "Desk Nine", "");
        out.taken = again && again.refused ? "refused " + again.refused : "taken";
        await until(async () => { await s.pump(); const j = read(s.sMirror, a.own + "join.json"); return j !== null && j !== asked; }, 8000);
        put(s.sMirror, C.TEAM_NAME, s.doc({ epoch: 2, rev: 2, roster: [s.entry(a.key2, 2)], lead: NEXT, box: s.boxNow, handover: [a.step], ring: [LEAD, NEXT] }));
        await s.studio.kick(); await s.studio.idle();
      } else {
        const copy = C.deskCopyOf(agreeWith(a.oldBox)(s.me.box), { rt: s.rt, teamId: s.team, leadKeyId: NEXT.keyId, leadBox: a.oldBox.pub,
          deskId: s.me.id, deskBox: s.me.box });
        /* Sealed as the channel seals a copy (sealOut): no place in the seal, the copy's place on the blob. */
        const b = B.seal({ relayTeamId: s.rt, epoch: 2, teamKey: copy.key, writer: { keyId: NEXT.keyId, privateKey: NEXT.privateKey },
          path: C.TEAM_NAME, body: read(s.sMirror, C.TEAM_NAME), counter: Date.now(), place: null, kind: "file" });
        b.place = "invite:" + copy.id;
        out.recopy = await putRaw(s.rt, NEXT, b);
      }
      const arrived = () => read(s.sMirror, a.own + "away.json") !== null && read(s.sMirror, a.own + "back.json") !== null;
      await until(async () => { await s.pump(); return arrived(); }, ceiling || 30000);
      out.arrived = arrived();
      out.said = s.Dk.said.filter(l => l.indexOf(C.STRANDED_SAID || "the line is not exported") >= 0).length;
      try { out.epoch = JSON.parse(read(s.mirror, C.TEAM_NAME)).epoch; } catch { out.epoch = null; }
      const p = (s.Dk.envelope().teamPins || {})[s.team];
      out.pin = p && p.public === NEXT.pub ? "the new lead" : p && p.public === LEAD.pub ? "the old lead" : "none";
      const row = rowOf(await s.Dk.ask("etiuda:team-join", "leads"));
      out.row = row ? (row.stranded ? JSON.stringify(row.stranded) : "none") : "no row";
      if (!out.arrived) out.notes = "desk " + s.Dk.said.slice(-3).join(" / ");
      return out;
    } finally {
      await s.stop();
    }
  }
  /* 939s to 939v, the test architect's ruling on the left-behind desk's invitation (2026-11-01 11:29): from 939l's scene the desk
     pastes the new lead's invitation as it stands, with no leave first. It is offered and taken, the lead writes its team file
     again at the second key, the desk finds its copy by the invitation's box, as in 939q, and the team's row shows the new lead's key to compare (the print is leadPrint's, sha256 of the public half).
     `answer` "matches" (939s): "It matches", and the desk's two files reach the lead's mirror, opened. "differs" (939t): "It does
     not match" as the leave route sends it since Max's ruling of 06:13 (op "leave"): the team is left with no bar, and the same
     invitation read again is offered, naming the leave. From the yes until the answer the desk's files stay here (the test
     architect, 2026-11-01 11:51, E1): every PUT the desk makes is counted from the yes and from admission, and the lead's mirror is
     read after three more cycles once admitted. */
  let printOf;
  if (partOn("p939")) {
  printOf = pub => sha(Buffer.from(pub, "hex")).slice(0, 16);
  }
  async function strandedPaste(tag, answer, app) {
    const out = { synced: false, moved: 0, before: "", read: "", taken: "", key: "", upFirst: false, arrived: false,
      epoch: null, pin: "", row: "", left: false, again: "", putsYes: -1, putsAdmitted: -1, putsEnd: -1, atLeadEnd: false };
    const putsFrom = mark => deskTransport.log.slice(mark).filter(l => l.startsWith("PUT ") && l.indexOf("/t/" + s.rt + "/b/") >= 0).length;
    const s = await relayDeskScene(tag, app);
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const a = await strandAway(s, false);
      out.moved = a.moved;
      if (out.moved !== 200) return out;
      const NEXT = a.NEXT;
      const rowOf = v => ((v && v.leads) || []).find(r => r.team === s.team) || null;
      const row0 = rowOf(await s.Dk.ask("etiuda:team-join", "leads"));
      out.before = row0 && row0.stranded ? "left behind" : "not left behind";
      const text = await nextInvite(s, a);
      const seen = await s.Dk.ask("etiuda:team-join", "read", text);
      out.read = seen && seen.refused ? "refused " + seen.refused : seen && seen.offer ? "offered" : "neither";
      const yesMark = deskTransport.log.length;
      const taken = await s.Dk.ask("etiuda:team-join", "invite", text, "Desk Nine", "");
      out.taken = taken && taken.refused ? "refused " + taken.refused : "taken";
      if (out.taken !== "taken") return out;
      for (let i = 0; i < 3; i++) await s.pump();
      put(s.sMirror, C.TEAM_NAME, s.doc({ epoch: 2, rev: 2, roster: [s.entry(a.key2, 2)], lead: NEXT, box: s.boxNow, handover: [a.step], ring: [LEAD, NEXT] }));
      await s.studio.kick(); await s.studio.idle();
      let row = null;
      await until(async () => { await s.pump(); row = rowOf(await s.Dk.ask("etiuda:team-join", "leads")); return !!row && row.admitted === true; }, 30000);
      out.key = !row ? "no row" : !row.admitted ? "not admitted" : row.print === printOf(NEXT.pub) && row.seen === false ? "the new lead's, to compare"
        : row.print === printOf(LEAD.pub) ? "the old lead's" : "another, seen " + row.seen;
      const arrived = () => read(s.sMirror, a.own + "away.json") !== null && read(s.sMirror, a.own + "back.json") !== null;
      const admitMark = deskTransport.log.length;
      for (let i = 0; i < 3; i++) await s.pump();
      out.upFirst = arrived();
      out.putsYes = putsFrom(yesMark);
      out.putsAdmitted = putsFrom(admitMark);
      if (answer === "matches") {
        await s.Dk.ask("etiuda:team-join", "seen", s.team);
        await until(async () => { await s.pump(); return arrived(); }, 30000);
        out.arrived = arrived();
      } else {
        await s.Dk.ask("etiuda:team-join", "leave", s.team);
        await wait(50);
        for (let i = 0; i < 3; i++) await s.pump();
        out.putsEnd = putsFrom(yesMark);
        out.atLeadEnd = read(s.sMirror, a.own + "away.json") !== null || read(s.sMirror, a.own + "back.json") !== null;
        const env = s.Dk.envelope();
        out.left = !!(env.teamLeft && env.teamLeft[s.team]);
        const later = await s.Dk.ask("etiuda:team-join", "read", text);
        out.again = later && later.refused ? "refused " + later.refused : later && later.offer ? "offered" + (later.offer.left ? ", the leave named" : "") : "neither";
      }
      try { out.epoch = JSON.parse(read(s.mirror, C.TEAM_NAME)).epoch; } catch { out.epoch = null; }
      const p = (s.Dk.envelope().teamPins || {})[s.team];
      out.pin = p && p.public === NEXT.pub ? "the new lead" : p && p.public === LEAD.pub ? "the old lead" : "none";
      const after = rowOf(await s.Dk.ask("etiuda:team-join", "leads"));
      out.row = after ? (after.seen ? "seen" : "not seen") + (after.stranded ? ", left behind" : "") : "no row";
      return out;
    } finally {
      await s.stop();
    }
  }
  /* 939u, the control: a desk that is not left behind, offered another lead's invitation for its team, refuses it as "pinned" at
     the read and at the yes, and keeps its pin. The invitation is never registered: the refusal comes before any call. */
  async function pasteControl(tag) {
    const out = { synced: false, read: "", taken: "", pin: "", left: false, row: "" };
    const s = await relayDeskScene(tag);
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const ELSE = keyPair(true);
      const text = "etiuda-join:" + Buffer.from(JSON.stringify({ team: s.team, relay: { rt: s.rt, url: URLV1, token: hex(32), inv: hex(16) },
        lead: { keyId: ELSE.keyId, public: ELSE.pub, name: "Ada Quay", box: boxPair().pub }, secret: hex(16) }), "utf8").toString("base64url");
      const seen = await s.Dk.ask("etiuda:team-join", "read", text);
      out.read = seen && seen.refused ? "refused " + seen.refused : seen && seen.offer ? "offered" : "neither";
      const taken = await s.Dk.ask("etiuda:team-join", "invite", text, "Desk Nine", "");
      out.taken = taken && taken.refused ? "refused " + taken.refused : "taken";
      const env = s.Dk.envelope(), p = (env.teamPins || {})[s.team];
      out.pin = p && p.public === LEAD.pub ? "the old lead" : p && p.public === ELSE.pub ? "the other lead" : "none";
      out.left = !!(env.teamLeft && env.teamLeft[s.team]);
      const row = ((await s.Dk.ask("etiuda:team-join", "leads")).leads || []).find(r => r.team === s.team) || null;
      out.row = row ? (row.stranded ? "left behind" : "not left behind") : "no row";
      return out;
    } finally {
      await s.stop();
    }
  }
  /* 939z and 939za, the test architect's point 3 on the lead box (2026-11-01 11:51): the request is written before the old pin is
     let go. From 939l's scene the desk pastes the new lead's invitation while a folder stands where its request is written (in the
     invitation's mirror, the desk's own place), so the write fails: the yes is refused as "silent", the desk is still left behind
     with its notice, under the old lead, not left, its two files kept here and none put up. The folder taken away (and the request
     the first join wrote put back), the same paste is taken. */
  async function strandedAskFails(tag, app) {
    const out = { synced: false, moved: 0, before: "", taken: "", row: "", pin: "", left: false, kept: false, atLead: false, puts: -1, said: -1, again: "" };
    const s = await relayDeskScene(tag, app);
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const a = await strandAway(s, false);
      out.moved = a.moved;
      if (out.moved !== 200) return out;
      const rowOf = v => ((v && v.leads) || []).find(r => r.team === s.team) || null;
      const row0 = rowOf(await s.Dk.ask("etiuda:team-join", "leads"));
      out.before = row0 && row0.stranded ? "left behind" : "not left behind";
      const text = await nextInvite(s, a);
      const jf = path.join(s.mirror, "desks", s.me.id, "join.json"), aside = jf + ".lab-aside";
      if (fs.existsSync(jf)) fs.renameSync(jf, aside);
      fs.mkdirSync(jf);
      const mark = deskTransport.log.length;
      const taken = await s.Dk.ask("etiuda:team-join", "invite", text, "Desk Nine", "");
      out.taken = taken && taken.refused ? "refused " + taken.refused : "taken";
      await wait(50);
      for (let i = 0; i < 3; i++) await s.pump();
      out.puts = deskTransport.log.slice(mark).filter(l => l.startsWith("PUT ") && l.indexOf("/t/" + s.rt + "/b/") >= 0).length;
      const env = s.Dk.envelope(), p = (env.teamPins || {})[s.team];
      out.pin = p && p.public === LEAD.pub ? "the old lead" : p && p.public === a.NEXT.pub ? "the new lead" : "none";
      out.left = !!(env.teamLeft && env.teamLeft[s.team]);
      const row = rowOf(await s.Dk.ask("etiuda:team-join", "leads"));
      out.row = row ? (row.stranded ? "left behind" : "not left behind") : "no row";
      out.kept = read(s.mirror, a.own + "away.json") !== null && read(s.mirror, a.own + "back.json") !== null;
      out.atLead = read(s.sMirror, a.own + "away.json") !== null || read(s.sMirror, a.own + "back.json") !== null;
      out.said = s.Dk.said.filter(l => l.indexOf(C.STRANDED_SAID || "the line is not exported") >= 0).length;
      fs.rmdirSync(jf);
      if (fs.existsSync(aside)) fs.renameSync(aside, jf);
      const again = await s.Dk.ask("etiuda:team-join", "invite", text, "Desk Nine", "");
      out.again = again && again.refused ? "refused " + again.refused : "taken";
      return out;
    } finally {
      await s.stop();
    }
  }
  /* 939zb and 939zc, the test architect's catch on the merge (2026-11-01 12:06): a desk is judged left behind only after a catch-up
     that read the whole list, never one that ran out at the round cap. The scene of 939L (the old box kept, so a whole read follows
     the new key), with one more copy by the new key at the second epoch for a desk not in this scene. The desk's list is served
     through a stand-in (the hooks' fetch) that puts the new key's root files of the second epoch and that copy first, then a
     million entries that are left out as of no size (1000 pages of 1000, the cap), then the rest in the relay's own order: the
     handover, this desk's own copy and the files after them. Every since/ the desk asks while the stand-in is armed is counted.
     After one cycle the desk has read exactly to the cap, has not been judged left behind and has said nothing; the cycles after
     read on, follow the new key at the second epoch, and say nothing. */
  async function strandCapped(tag, app) {
    const out = { synced: false, moved: 0, extra: 0, rounds: 0, reached: -1, saidCap: -1, leftCap: "", said: -1, pin: "", epoch: null, row: "" };
    const PAGE = 1000, CAP = PAGE * 1000;
    const v = { armed: false, first: null, list: null, base: 0, N: 0, realTop: 0, rounds: 0, reached: 0, onCap: null, atCap: null };
    const junk = seq => ({ seq, meta: { id: "left-out-" + seq, size: -1 } });
    const answer = async (page, from) => {
      const h = {};
      if (from && from.headers.get("etiuda-lapse")) h["etiuda-lapse"] = from.headers.get("etiuda-lapse");
      return new Response(JSON.stringify(page), { status: 200, headers: h });
    };
    const capFetch = (url, init) => {
      const m = /\/t\/[0-9a-f]{32}\/since\/(\d+)$/.exec(String(url));
      if (!v.armed || !m || !init || init.method !== "GET") return null;
      return (async () => {
        const at = Number(m[1]);
        if (!v.list) {
          const res = await relayFetch(url, init);
          const real = await res.json();
          v.base = at;
          v.realTop = real.length ? real[real.length - 1].seq : at;
          const first = real.filter(e => v.first(e.meta)), rest = real.filter(e => !v.first(e.meta));
          v.list = { first, rest };
          v.N = CAP + rest.length;
        }
        if (at < v.base) return relayFetch(url, init);
        /* The first ask past the cap opens the next catch-up: what the capped one left is read here, before anything more is served. */
        if (at === v.base + CAP && !v.atCap && v.onCap) v.atCap = v.onCap();
        if (at >= v.base + v.N) {
          const real = String(url).replace(/\/since\/\d+$/, "/since/" + (at - v.base - v.N + v.realTop));
          const res = await relayFetch(real, init);
          const page = (await res.json()).map(e => Object.assign({}, e, { seq: e.seq - v.realTop + v.base + v.N }));
          return answer(page, res);
        }
        const page = [];
        for (let i = at - v.base; i < v.N && page.length < PAGE; i++) {
          const seq = v.base + i + 1;
          if (i < v.list.first.length) page.push(Object.assign({}, v.list.first[i], { seq }));
          else if (i < CAP) page.push(junk(seq));
          else page.push(Object.assign({}, v.list.rest[i - CAP], { seq }));
        }
        v.rounds++;
        if (page.length) v.reached = Math.max(v.reached, page[page.length - 1].seq - v.base);
        return answer(page, null);
      })();
    };
    const s = await relayDeskScene(tag, app ? { app, fetch: capFetch } : { fetch: capFetch });
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const NEXT = keyPair(true), key1 = s.keys.get(1);
      deskTransport.down = true;
      out.moved = await s.handTo(NEXT);
      if (out.moved !== 200) return out;
      const step = s.step(LEAD, NEXT);
      put(s.sMirror, C.TEAM_NAME, s.doc({ rev: 3, roster: [s.entry(key1, 1)], lead: NEXT, box: s.boxNow, handover: [step], ring: [LEAD, NEXT] }));
      put(s.sMirror, "board.ec", JSON.stringify(s.Dk.api.sealCatalog(key1, s.team, 1, s.catalog(1, NEXT, "edition one"))));
      await s.studio.kick(); await s.studio.idle();
      const key2 = crypto.randomBytes(32);
      s.keys.set(2, key2);
      put(s.sMirror, C.TEAM_NAME, s.doc({ epoch: 2, rev: 1, roster: [s.entry(key2, 2)], lead: NEXT, box: s.boxNow, handover: [step], ring: [LEAD, NEXT] }));
      put(s.sMirror, "board.ec", JSON.stringify(s.Dk.api.sealCatalog(key2, s.team, 2, s.catalog(2, NEXT, "edition two"))));
      await s.studio.kick(); await s.studio.idle();
      const extra = hex(16);
      const b = B.seal({ relayTeamId: s.rt, epoch: 2, teamKey: crypto.randomBytes(32), writer: { keyId: NEXT.keyId, privateKey: NEXT.privateKey },
        path: C.TEAM_NAME, body: read(s.sMirror, C.TEAM_NAME), counter: Date.now(), place: null, kind: "file" });
      b.place = "invite:" + extra;
      out.extra = await putRaw(s.rt, NEXT, b);
      const said = () => s.Dk.said.filter(l => l.indexOf(C.STRANDED_SAID || "the line is not exported") >= 0).length;
      v.first = m => !!m && m.writer === NEXT.keyId && m.epoch === 2 && (m.place === undefined || m.place === null || m.place === "root" || m.place === "invite:" + extra);
      v.onCap = () => {
        const c = s.Dk.api.relayRun();
        return { rounds: v.rounds, reached: v.reached, said: said(), left: c && typeof c.stranded === "function" && c.stranded() ? "left behind" : "not left behind" };
      };
      v.armed = true;
      deskTransport.down = false;
      await until(async () => { await s.pump(); return !!v.atCap; }, 30000);
      if (v.atCap) { out.rounds = v.atCap.rounds; out.reached = v.atCap.reached; out.saidCap = v.atCap.said; out.leftCap = v.atCap.left; }
      const done = () => { const p = (s.Dk.envelope().teamPins || {})[s.team]; let e = null; try { e = JSON.parse(read(s.mirror, C.TEAM_NAME)).epoch; } catch { e = null; } return !!p && p.public === NEXT.pub && e === 2; };
      await until(async () => { await s.pump(); return done(); }, 30000);
      out.said = said();
      const p = (s.Dk.envelope().teamPins || {})[s.team];
      out.pin = p && p.public === NEXT.pub ? "the new lead" : p && p.public === LEAD.pub ? "the old lead" : "none";
      try { out.epoch = JSON.parse(read(s.mirror, C.TEAM_NAME)).epoch; } catch { out.epoch = null; }
      const row = ((await s.Dk.ask("etiuda:team-join", "leads")).leads || []).find(r => r.team === s.team) || null;
      out.row = row ? (row.stranded ? "left behind" : "not left behind") : "no row";
      return out;
    } finally {
      v.armed = false;
      await s.stop();
    }
  }
  /* 939f, finding 3 (1), as it stands with the move to a shared folder removed: the lead puts the team file up at a higher rev naming a folder
     channel, and the same file in its own mirror and in the folder the desk's catalog folder was before joining. The relay's channel judges a
     team file by its pin, and a file that does not name this relay is no file of this team (plant:team-own), so the desk refuses it at the door
     and stays on the relay. What is read back is the desk's mirror, its catalog folder and its team channel after a few rounds of catching up. */
  async function toFolder(tag, app) {
    const out = { synced: false, folder: "", channel: "", mirrorRev: null, mirrorChannel: "" };
    const s = await relayDeskScene(tag, app);
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const moved = s.doc({ rev: 3, roster: [s.entry(s.keys.get(1), 1)], channel: { kind: "folder" } });
      put(s.share, C.TEAM_NAME, moved);
      put(s.share, "board.ec", read(s.sMirror, "board.ec"));
      put(s.sMirror, C.TEAM_NAME, moved);
      await s.studio.kick(); await s.studio.idle();
      for (let i = 0; i < 4; i++) await s.pump();
      const here = s.Dk.api.catalogFolder(), env = s.Dk.envelope();
      out.folder = here === s.mirror ? "the relay's mirror" : String(here);
      const ch = (env.teamChannel || {})[s.team];
      out.channel = ch ? ch.kind : "none";
      try { const d = JSON.parse(read(s.mirror, C.TEAM_NAME)); out.mirrorRev = d.rev; out.mirrorChannel = (d.channel && d.channel.kind) || "none"; } catch { out.mirrorRev = null; }
      return out;
    } finally {
      await s.stop();
    }
  }
  /* 939h, item 7 on the relay. The relay moves its lead only on the signature of the lead it names now (933p), so a second
     successor reaches a desk only as a team file of a chain of its own put up under K1 while the relay still names K1. Here
     someone else holding K1 puts up such a file handing K1 to K3; the team's lead then moves the relay to K2 and writes K2's
     file under K2. A desk away meanwhile catches up both in one look. */
  async function forkOnRelay(tag, app, ceiling) {
    const out = { synced: false, thief: 0, moved: 0, pin: "", channelPin: "", fork: "", said: 0, rev: 0 };
    const s = await relayDeskScene(tag, app);
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const K2 = keyPair(true), K3 = keyPair(true), key1 = s.keys.get(1);
      deskTransport.down = true;
      const k3File = s.doc({ rev: 3, roster: [s.entry(key1, 1)], lead: K3, handover: [s.step(LEAD, K3)], ring: [LEAD, K3] });
      out.thief = await putRaw(s.rt, LEAD, B.seal({ relayTeamId: s.rt, epoch: 1, teamKey: key1, writer: { keyId: LEAD.keyId, privateKey: LEAD.privateKey },
        path: C.TEAM_NAME, body: k3File, counter: Date.now() + 5e6, place: "root", kind: "file" }));
      out.moved = await s.handTo(K2);
      put(s.sMirror, C.TEAM_NAME, s.doc({ rev: 3, roster: [s.entry(key1, 1)], lead: K2, handover: [s.step(LEAD, K2)], ring: [LEAD, K2] }));
      await s.studio.kick(); await s.studio.idle();
      deskTransport.down = false;
      const two = C.FORK_SAID ? C.FORK_SAID.two : null;
      const twoSaid = () => (two ? s.Dk.said.filter(l => l.indexOf(two) >= 0).length : 0);
      await until(async () => { await s.pump(); return twoSaid() > 0; }, ceiling || 30000);
      for (let i = 0; i < 2; i++) await s.pump();
      const p = (s.Dk.envelope().teamPins || {})[s.team];
      const name = k => (k && k.public === LEAD.pub ? "K1" : k && k.public === K2.pub ? "K2" : k && k.public === K3.pub ? "K3" : "none");
      out.pin = name(p);
      const c = s.Dk.api.relayRun(), pinned = c && c.program ? c.program.pinned() : null;
      out.channelPin = name(pinned && pinned.lead);
      const st = c && c.program ? c.program.state() : null;
      out.fork = st && st.fork ? st.fork.kind : "none";
      out.said = twoSaid();
      try { out.rev = JSON.parse(read(s.mirror, C.TEAM_NAME)).rev; } catch { out.rev = 0; }
      out.ok = out.thief === 200 && out.moved === 200 && out.pin === "K1" && out.channelPin === "K1" && out.fork === "two" && out.said >= 1 && out.rev === 2;
      /* The team's row, which the shell composes from the channel's fork for the page's notice (it was held for a folder team by team-desk's
         14bm, 14bq and 14cd, which a relay team's row is not read from): the fork it shows, and what the agent's dismissal keeps. */
      const rowOf = async () => ((((await s.Dk.ask("etiuda:team-join", "leads")) || {}).leads) || []).find(l => l.team === s.team) || null;
      const shownOf = r => (r && r.fork ? r.fork.kind + "/" + (r.fork.seen ? "seen" : "new") : "none");
      out.row = shownOf(await rowOf());
      await s.Dk.ask("etiuda:team-join", "fork-seen", s.team);
      const after = await rowOf(), kept = (s.Dk.envelope().teamForks || {})[s.team];
      out.dismissed = shownOf(after);
      out.keptFork = !!kept && !!after && !!after.fork && kept.seen === after.fork.key;
      return out;
    } finally {
      await s.stop();
    }
  }
  /* 994, the test architect's ruling on desk trust 2 and 3 (2026-11-01 16:02). A stand-in for the desk's since/ asks (the hooks'
     fetch), armed once the scene is set: the entries `v.first` picks are served first, then `v.pad` entries left out as of no
     size, then the rest in the relay's own order, and past them the relay itself. A blob `v.once` names is served at its first
     fetch and answered 404 after, as a superseded blob is. `v.padTo`: the pad that ends the left-out entries there. `v.pages`
     counts the since/ pages served from the stand-in. */
  function padFetch(v) {
    const PAGE = 1000;
    const junk = seq => ({ seq, meta: { id: "left-out-" + seq, size: -1 } });
    const answer = (page, from) => {
      const h = {};
      if (from && from.headers.get("etiuda-lapse")) h["etiuda-lapse"] = from.headers.get("etiuda-lapse");
      return new Response(JSON.stringify(page), { status: 200, headers: h });
    };
    return (url, init) => {
      if (!v.armed || !init || init.method !== "GET") return null;
      const b = /\/t\/[0-9a-f]{32}\/b\/([0-9a-f]{32})$/.exec(String(url));
      if (b && v.once && b[1] === v.once) {
        if (!v.served) { v.served = true; return null; }
        return Promise.resolve(new Response("", { status: 404 }));
      }
      const m = /\/t\/[0-9a-f]{32}\/since\/(\d+)$/.exec(String(url));
      if (!m) return null;
      return (async () => {
        const at = Number(m[1]);
        if (!v.list) {
          const res = await relayFetch(url, init);
          const real = await res.json();
          v.base = at;
          v.realTop = real.length ? real[real.length - 1].seq : at;
          v.list = { first: real.filter(e => v.first(e.meta)), rest: real.filter(e => !v.first(e.meta)) };
          if (v.padTo) v.pad = v.padTo - v.list.first.length;
          v.N = v.list.first.length + v.pad + v.list.rest.length;
        }
        if (at < v.base) return relayFetch(url, init);
        if (at >= v.base + v.N) {
          const real = String(url).replace(/\/since\/\d+$/, "/since/" + (at - v.base - v.N + v.realTop));
          const res = await relayFetch(real, init);
          const page = (await res.json()).map(e => Object.assign({}, e, { seq: e.seq - v.realTop + v.base + v.N }));
          return answer(page, res);
        }
        const F = v.list.first.length, page = [];
        for (let i = at - v.base; i < v.N && page.length < PAGE; i++) {
          const seq = v.base + i + 1;
          if (i < F) page.push(Object.assign({}, v.list.first[i], { seq }));
          else if (i < F + v.pad) page.push(junk(seq));
          else page.push(Object.assign({}, v.list.rest[i - F - v.pad], { seq }));
        }
        v.pages = (v.pages || 0) + 1;
        return answer(page, null);
      })();
    };
  }
  let sealTeam;
  if (partOn("p939")) {
  sealTeam = (s, who, body, counter) => B.seal({ relayTeamId: s.rt, epoch: 1, teamKey: s.keys.get(1), writer: { keyId: who.keyId, privateKey: who.privateKey },
      path: C.TEAM_NAME, body, counter, place: "root", kind: "file" });
  }
  /* 994a, finding 2: the desk is away while the old lead puts up a team file of its own whose counter is later than the
     handover's (its clock ahead), and the lead then hands the team to a new key, which writes the team file carrying the step
     and the edition, head and span re-signed under it. Both team files reach the desk in one since page. 994c, the next file
     tried (`broken`): what the old key puts up instead names the new key with the genuine step, but its own signature does not
     verify, so it is the first handover tried and is refused. */
  async function handoverUnderOld(tag, broken, app, ceiling) {
    const out = { synced: false, old: 0, moved: 0, now: null, notes: [] };
    const s = await relayDeskScene(tag, app);
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const NEXT = keyPair(true), key1 = s.keys.get(1);
      deskTransport.down = true;
      let first = s.doc({ rev: 3, roster: [s.entry(key1, 1)] });
      if (broken) {
        const bad = JSON.parse(s.doc({ rev: 4, roster: [s.entry(key1, 1)], lead: NEXT, handover: [s.step(LEAD, NEXT)], ring: [LEAD, NEXT] }));
        bad.sig.value = (bad.sig.value[0] === "0" ? "1" : "0") + bad.sig.value.slice(1);
        first = JSON.stringify(bad, null, 1) + "\n";
      }
      out.old = await putRaw(s.rt, LEAD, sealTeam(s, LEAD, first, Date.now() + 5e6));
      out.moved = await s.handTo(NEXT);
      if (out.old !== 200 || out.moved !== 200) return out;
      s.boxNow = boxPair();
      const span = s.span(NEXT);
      put(s.sMirror, C.TEAM_NAME, s.doc({ rev: 3, roster: [s.entry(key1, 1)], lead: NEXT, box: s.boxNow, handover: [s.step(LEAD, NEXT)], ring: [LEAD, NEXT] }));
      put(s.sMirror, "board.ec", JSON.stringify(s.Dk.api.sealCatalog(key1, s.team, 1, s.catalog(1, NEXT, "edition one"))));
      put(s.sMirror, HEAD_FILE, s.head(NEXT, 1, 3, "Handover edition"));
      put(s.sMirror, "stats-span.json", span);
      await s.studio.kick(); await s.studio.idle();
      deskTransport.down = false;
      const done = n => n.pin === "the new lead" && n.edition === "re-signed rev 1" && n.head === "Handover edition" && n.span;
      await until(async () => { await s.pump(); return done(deskNow(s, NEXT, span)); }, ceiling || 30000);
      out.now = deskNow(s, NEXT, span);
      out.ok = done(out.now);
      if (!out.ok) out.notes.push("desk " + s.Dk.said.slice(-3).join(" / "));
      return out;
    } finally {
      await s.stop();
    }
  }
  /* 994e and 994g, finding 3: someone else holding K1 puts up a team file handing K1 to K3 (939h's thief); then more than a page
     of listings; then the team's lead moves the relay to K2 and writes K2's file under K2. The desk, away meanwhile, reads the
     two on different pages of one catch-up. `gone`: the thief's blob is served once, then answered as superseded, so the short
     page holds K2's file alone and only the steps the catch-up kept show the fork. */
  async function forkAcrossPages(tag, gone, app) {
    const out = { synced: false, thief: 0, moved: 0, pages: 0, pin: "", channelPin: "", fork: "", said: 0, rev: 0 };
    const v = { armed: false, pad: 1500 };
    const s = await relayDeskScene(tag, app ? { app, fetch: padFetch(v) } : { fetch: padFetch(v) });
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const K2 = keyPair(true), K3 = keyPair(true), key1 = s.keys.get(1);
      deskTransport.down = true;
      const k3 = sealTeam(s, LEAD, s.doc({ rev: 3, roster: [s.entry(key1, 1)], lead: K3, handover: [s.step(LEAD, K3)], ring: [LEAD, K3] }), Date.now() + 5e6);
      out.thief = await putRaw(s.rt, LEAD, k3);
      out.moved = await s.handTo(K2);
      put(s.sMirror, C.TEAM_NAME, s.doc({ rev: 3, roster: [s.entry(key1, 1)], lead: K2, handover: [s.step(LEAD, K2)], ring: [LEAD, K2] }));
      await s.studio.kick(); await s.studio.idle();
      v.first = m => !!m && m.id === k3.id;
      if (gone) v.once = k3.id;
      v.armed = true;
      deskTransport.down = false;
      const two = C.FORK_SAID ? C.FORK_SAID.two : null;
      const twoSaid = () => (two ? s.Dk.said.filter(l => l.indexOf(two) >= 0).length : 0);
      const name = k => (k && k.public === LEAD.pub ? "K1" : k && k.public === K2.pub ? "K2" : k && k.public === K3.pub ? "K3" : "none");
      const c = () => s.Dk.api.relayRun();
      const settled = () => { const p = (s.Dk.envelope().teamPins || {})[s.team]; return twoSaid() > 0 || (!!p && p.public !== LEAD.pub); };
      await until(async () => { await s.pump(); return settled(); }, 30000);
      for (let i = 0; i < 3; i++) await s.pump();
      out.pages = v.pages || 0;
      out.pin = name((s.Dk.envelope().teamPins || {})[s.team]);
      const pinned = c() && c().program ? c().program.pinned() : null;
      out.channelPin = name(pinned && pinned.lead);
      const st = c() && c().program ? c().program.state() : null;
      out.fork = st && st.fork ? st.fork.kind : "none";
      out.said = twoSaid();
      try { out.rev = JSON.parse(read(s.mirror, C.TEAM_NAME)).rev; } catch { out.rev = 0; }
      out.ok = out.thief === 200 && out.moved === 200 && out.pages >= 2 && out.pin === "K1" && out.channelPin === "K1" && out.fork === "two"
        && out.said === 1 && out.rev === 2;
      return out;
    } finally {
      v.armed = false;
      await s.stop();
    }
  }
  /* 994i, the control: the lead hands the team to a new key, which writes the team file carrying the step and the edition, head
     and span re-signed under it, all on the desk's first page, and then more than a page of listings. The desk, away meanwhile,
     follows once its catch-up reads the short page, and takes what the new key wrote on the first page. */
  async function handoverAcrossPages(tag, app, ceiling) {
    const out = { synced: false, moved: 0, pages: 0, now: null, notes: [] };
    const v = { armed: false, pad: 1500 };
    const s = await relayDeskScene(tag, app ? { app, fetch: padFetch(v) } : { fetch: padFetch(v) });
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const NEXT = keyPair(true), key1 = s.keys.get(1);
      deskTransport.down = true;
      out.moved = await s.handTo(NEXT);
      if (out.moved !== 200) return out;
      s.boxNow = boxPair();
      const span = s.span(NEXT);
      put(s.sMirror, C.TEAM_NAME, s.doc({ rev: 3, roster: [s.entry(key1, 1)], lead: NEXT, box: s.boxNow, handover: [s.step(LEAD, NEXT)], ring: [LEAD, NEXT] }));
      put(s.sMirror, "board.ec", JSON.stringify(s.Dk.api.sealCatalog(key1, s.team, 1, s.catalog(1, NEXT, "edition one"))));
      put(s.sMirror, HEAD_FILE, s.head(NEXT, 1, 3, "Handover edition"));
      put(s.sMirror, "stats-span.json", span);
      await s.studio.kick(); await s.studio.idle();
      v.first = m => !!m && m.writer === NEXT.keyId;
      v.armed = true;
      deskTransport.down = false;
      const done = n => n.pin === "the new lead" && n.edition === "re-signed rev 1" && n.head === "Handover edition" && n.span;
      await until(async () => { await s.pump(); return done(deskNow(s, NEXT, span)); }, ceiling || 30000);
      out.pages = v.pages || 0;
      out.now = deskNow(s, NEXT, span);
      out.ok = out.pages >= 2 && done(out.now);
      if (!out.ok) out.notes.push("desk " + s.Dk.said.slice(-3).join(" / "));
      return out;
    } finally {
      v.armed = false;
      await s.stop();
    }
  }
  /* 994l, the epoch hold (the test architect, 2026-11-01 16:48): someone else holding K1 puts up a team file at the first epoch
     handing K1 to K3, and the lead then moves the team to a second key. The desk, away meanwhile, is served the second epoch's
     files first, then a page of entries left out, then the stale handover, so its mirror holds the second epoch when the handover
     is judged: it is refused and the pin stays. */
  async function staleHandover(tag, app) {
    const out = { synced: false, thief: 0, pages: 0, pin: "", channelPin: "", epoch: 0, lead: "" };
    const v = { armed: false, pad: 1000 };
    const s = await relayDeskScene(tag, app ? { app, fetch: padFetch(v) } : { fetch: padFetch(v) });
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const K3 = keyPair(true), key1 = s.keys.get(1), key2 = crypto.randomBytes(32);
      deskTransport.down = true;
      out.thief = await putRaw(s.rt, LEAD, sealTeam(s, LEAD, s.doc({ rev: 3, roster: [s.entry(key1, 1)], lead: K3, handover: [s.step(LEAD, K3)], ring: [LEAD, K3] }), Date.now() + 5e6));
      s.keys.set(2, key2);
      put(s.sMirror, C.TEAM_NAME, s.doc({ epoch: 2, rev: 1, roster: [s.entry(key2, 2)] }));
      await s.studio.kick(); await s.studio.idle();
      v.first = m => !!m && m.writer === LEAD.keyId && m.epoch === 2;
      v.armed = true;
      deskTransport.down = false;
      const name = k => (k && k.public === LEAD.pub ? "K1" : k && k.public === K3.pub ? "K3" : "none");
      const look = () => {
        out.pin = name((s.Dk.envelope().teamPins || {})[s.team]);
        const c = s.Dk.api.relayRun(), pinned = c && c.program ? c.program.pinned() : null;
        out.channelPin = name(pinned && pinned.lead);
        try { const d = JSON.parse(read(s.mirror, C.TEAM_NAME)); out.epoch = d.epoch; out.lead = d.lead.keyId === K3.keyId ? "K3" : d.lead.keyId === LEAD.keyId ? "K1" : "another"; } catch { out.epoch = 0; }
        out.pages = v.pages || 0;
        return out.pages >= 2 && (out.channelPin !== "K1" || out.epoch === 2);
      };
      await until(async () => { await s.pump(); return look(); }, 30000);
      for (let i = 0; i < 3; i++) await s.pump();
      look();
      out.ok = out.thief === 200 && out.pages >= 2 && out.pin === "K1" && out.channelPin === "K1" && out.epoch === 2 && out.lead === "K1";
      return out;
    } finally {
      v.armed = false;
      await s.stop();
    }
  }
  /* 994n, a restart (the test architect, 2026-11-01 16:48): the new key's handover and what it wrote are on the desk's first page,
     then entries left out to the round cap, so the first catch-up holds the handover and stops there. The next catch-up's first ask
     is answered 503 until the desk is stopped and loaded again from its user data; its fresh channel, built from the saved state,
     then reads the short page and follows. */
  async function heldAcrossRestart(tag, app, ceiling) {
    const out = { synced: false, moved: 0, pages: 0, held: -1, now: null, notes: [] };
    const CAP = 1000 * 1000;
    const v = { armed: false, pad: 0, padTo: CAP, refused: false, again: false };
    const pad = padFetch(v);
    const hooks = Object.assign(app ? { app } : {}, { fetch: (url, init) => {
      const m = /\/t\/[0-9a-f]{32}\/since\/(\d+)$/.exec(String(url));
      if (v.armed && m && v.list && Number(m[1]) === v.base + CAP && !v.again) { v.refused = true; return Promise.resolve(new Response("{}", { status: 503 })); }
      return pad(url, init);
    } });
    const s = await relayDeskScene(tag, hooks);
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const NEXT = keyPair(true), key1 = s.keys.get(1);
      deskTransport.down = true;
      out.moved = await s.handTo(NEXT);
      if (out.moved !== 200) return out;
      s.boxNow = boxPair();
      const span = s.span(NEXT);
      put(s.sMirror, C.TEAM_NAME, s.doc({ rev: 3, roster: [s.entry(key1, 1)], lead: NEXT, box: s.boxNow, handover: [s.step(LEAD, NEXT)], ring: [LEAD, NEXT] }));
      put(s.sMirror, "board.ec", JSON.stringify(s.Dk.api.sealCatalog(key1, s.team, 1, s.catalog(1, NEXT, "edition one"))));
      put(s.sMirror, HEAD_FILE, s.head(NEXT, 1, 3, "Handover edition"));
      put(s.sMirror, "stats-span.json", span);
      await s.studio.kick(); await s.studio.idle();
      v.first = m => !!m && m.writer === NEXT.keyId;
      v.armed = true;
      deskTransport.down = false;
      const firstLoad = s.Dk;
      await until(async () => { if (!v.refused) await s.pump(); return v.refused; }, 60000);
      out.pages = v.pages || 0;
      const c1 = firstLoad.api.relayRun();
      out.held = c1 && c1.program ? c1.program.ahead().length : -1;
      if (c1) await c1.stop();
      v.again = true;
      s.Dk = await loadDesk(s.ud, hooks);
      const done = n => n.pin === "the new lead" && n.edition === "re-signed rev 1" && n.head === "Handover edition" && n.span;
      await until(async () => { await s.pump(); return done(deskNow(s, NEXT, span)); }, ceiling || 30000);
      out.now = deskNow(s, NEXT, span);
      out.ok = v.refused && out.pages === 1000 && out.held === 1 && done(out.now);
      if (!out.ok) out.notes.push("desk " + s.Dk.said.slice(-3).join(" / "));
      return out;
    } finally {
      v.armed = false;
      await s.stop();
    }
  }
  let nowText, sceneText;
  if (partOn("p939")) {
  nowText = n => (n ? "pin " + n.pin + ", edition " + n.edition + ", head " + n.head + ", team file epoch " + n.epoch + ", span " + (n.span ? "taken" : "not taken") : "nothing");

  
  sceneText = (x, err) => (x ? "synced " + x.synced + ", relay move " + x.moved + ", " + nowText(x.now) + (x.notes.length ? ", " + x.notes.join("; ") : "") : "") + (err ? ", " + err : "");
  }
  async function run(fn, ...args) { try { return { x: await fn(...args), err: "" }; } catch (e) { return { x: null, err: e && e.stack ? e.stack : String(e) }; } }
  if (partOn("p939")) {
  {
      const a = await run(handoverOnline, "939a");
      check(!!a.x && a.x.ok === true,
        "939a an online joined relay desk follows a handover the lead makes on the relay and then as the new key, and opens the edition, head and"
        + " span re-signed under it: " + sceneText(a.x, a.err));
      const b = await liftApp("plant:handed-first", async app => { const x = await handoverOnline("939b", app, 8000); return x.synced && x.moved === 200 && x.now && x.now.pin === "the old lead"; });
      check(b.turned && b.back, "939b lifting plant:handed-first leaves the desk on the old lead, the new key's team file dropped as from no roster,"
        + " and the product file is never written: " + b.detail + ", sha " + (b.back ? "restored" : "differs"));
      const c = await liftApp("plant:chain-handed", async app => {
        const x = await handoverOnline("939c", app, 8000);
        return x.synced && x.now && x.now.pin === "the new lead" && x.now.edition !== "re-signed rev 1" && x.now.head !== "Handover edition";
      });
      check(c.turned && c.back, "939c lifting plant:chain-handed follows the handover but refuses the re-signed edition and head as outside-place,"
        + " and the product file is never written: " + c.detail + ", sha " + (c.back ? "restored" : "differs"));
      const d = await run(handoverAway, "939d");
      check(!!d.x && d.x.ok === true,
        "939d a desk away across a handover and an epoch move, the lead keeping the team's box, finds its own copy under the new key, follows"
        + " it and opens the second key's edition, head and span: " + sceneText(d.x, d.err));
      const e = await liftApp("plant:copy-by-writer", async app => { const x = await handoverAway("939e", app, 8000); return x.synced && x.moved === 200 && x.now && x.now.pin === "the old lead" && x.now.epoch === 1; });
      check(e.turned && e.back, "939e lifting plant:copy-by-writer leaves the desk that was away on the old lead and the first key, its copy"
        + " unfound, and the product file is never written: " + e.detail + ", sha " + (e.back ? "restored" : "differs"));
      const j = await run(handoverAwayFresh, "939j", false);
      const jText = x => (x ? "synced " + x.synced + ", relay move " + x.moved + ", " + nowText(x.now) + ", uploads from the epoch move " + x.after
        + ", opened under the first key " + x.underOld + ", copies found with the old box " + x.oldCopies + " (opened " + x.oldCopyOpens
        + "), with the box the lead used " + x.newCopies + " (opened " + x.newCopyOpens + ")" : "");
      check(!!j.x && j.x.synced && j.x.moved === 200 && !!j.x.now && j.x.now.pin === "the old lead" && j.x.now.epoch === 1
        && j.x.now.head !== "Second key edition" && j.x.after > 0 && j.x.underOld === 0 && j.x.oldCopies === 0 && j.x.oldCopyOpens === 0
        && j.x.newCopies >= 1 && j.x.newCopyOpens >= 1,
        "939j a desk away across a handover to a key with a fresh box and an epoch move does not open the new lead's copies with the old box,"
        + " and the old key's holder opens nothing uploaded from the epoch move on, where the box the lead used finds the desk's copy: "
        + jText(j.x) + (j.err ? ", " + j.err : ""));
      const k = await run(handoverAwayFresh, "939k", true);
      check(!!k.x && k.x.synced && k.x.moved === 200 && k.x.underOld === 0 && k.x.oldCopies >= 1 && k.x.oldCopyOpens >= 1 && !!k.x.now
        && k.x.now.pin === "the new lead" && k.x.now.epoch === 2,
        "939k the same scene with the old box kept: the desk follows (as 939d), and the old key's holder finds and opens the desk's copy of the"
        + " new key's file with the old box, the trade the fresh box closes: " + jText(k.x) + (k.err ? ", " + k.err : ""));
      const lText = x => (x ? "synced " + x.synced + ", relay move " + x.moved + ", uploads from its return " + x.puts + ", line said " + x.said
        + ", team file epoch " + x.epoch + ", pin " + x.pin + ", row " + x.row + (x.rowAfter ? ", dismissed " + x.rowAfter : "")
        + ", after a restart said " + x.saidRestart + " and uploads " + x.putsRestart : "");
      const left = x => !!x && x.synced && x.moved === 200;
      const l = await run(strandedScene, "939l-left", false);
      check(left(l.x) && l.x.puts === 0 && l.x.said === 1 && l.x.epoch === 1 && l.x.pin === "the old lead" && l.x.row === "{\"seen\":false}"
        && l.x.rowAfter === "{\"seen\":true}" && l.x.saidRestart === 0 && l.x.putsRestart === 0,
        "939l a desk left behind by a handover to a key with a fresh box and the key change after it puts nothing up, its own new files kept"
        + " here, says the copywriter's line once, and shows it on the team's row until dismissed: " + lText(l.x) + (l.err ? ", " + l.err : ""));
      const L = await run(strandedScene, "939L-kept", true);
      check(left(L.x) && L.x.puts >= 2 && L.x.said === 0 && L.x.epoch === 2 && L.x.pin === "the new lead" && L.x.row === "none",
        "939L control: with the old box kept the desk follows the new key, says nothing of being left behind, and both its files go up: "
        + lText(L.x) + (L.err ? ", " + L.err : ""));
      const m = await liftApp("plant:stranded-judge", async app => { const x = await strandedScene("939m", false, app); return left(x) && x.puts > 0 && x.said === 0 && x.row === "none"; });
      check(m.turned && m.back, "939m lifting plant:stranded-judge never takes the desk as left behind: it puts its files up under the old key"
        + " and says nothing, and the product file is never written: " + m.detail + ", sha " + (m.back ? "restored" : "differs"));
      const n = await liftApp("plant:stranded-hold", async app => { const x = await strandedScene("939n", false, app); return left(x) && x.puts > 0 && x.said === 1; });
      check(n.turned && n.back, "939n lifting plant:stranded-hold says the line but still puts the desk's files up under the old key, and the"
        + " product file is never written: " + n.detail + ", sha " + (n.back ? "restored" : "differs"));
      const o = await liftApp("plant:stranded-said", async app => { const x = await strandedScene("939o", false, app); return left(x) && x.puts === 0 && x.said === 0; });
      check(o.turned && o.back, "939o lifting plant:stranded-said holds the files but never says why, and the product file is never written: "
        + o.detail + ", sha " + (o.back ? "restored" : "differs"));
      const p = await liftDesk("plant:stranded-row", async text => { const x = await strandedScene("939p", false, { source: text }); return left(x) && x.puts === 0 && x.said === 1 && x.row === "none"; });
      check(p.turned && p.back, "939p lifting plant:stranded-row holds the files and says the line, but the team's row carries no notice, and the"
        + " product file is never written: " + p.detail + ", sha " + (p.back ? "restored" : "differs"));
      const wText = x => (x ? "synced " + x.synced + ", relay move " + x.moved + ", " + x.before
        + (x.taken ? ", after leaving " + x.taken : "") + (x.recopy ? ", the re-copy put " + x.recopy : "") + ", its two files "
        + (x.arrived ? "at the lead" : "not at the lead") + ", line said " + x.said + ", team file epoch " + x.epoch + ", pin " + x.pin + ", row " + x.row
        + (x.notes ? ", " + x.notes : "") : "");
      const freed = x => left(x) && x.before === "left behind" && x.arrived && x.said === 1 && x.epoch === 2 && x.pin === "the new lead" && x.row === "none";
      const q = await run(strandedWayOut, "939q-invite", "invite");
      check(freed(q.x) && q.x.taken === "taken",
        "939q a desk left behind that leaves the team and takes the new lead's invitation finds its copy, follows the new key, puts its own files"
        + " up and loses the row's notice: " + wText(q.x) + (q.err ? ", " + q.err : ""));
      const r = await run(strandedWayOut, "939r-recopy", "recopy");
      check(freed(r.x) && r.x.recopy === 200,
        "939r a desk left behind whose copy the lead puts up again at the place its box names lands the new key's team file, follows it, puts"
        + " its own files up and loses the row's notice: " + wText(r.x) + (r.err ? ", " + r.err : ""));
      const w = await liftApp("plant:stranded-out-invite", async app => {
        const x = await strandedWayOut("939w", "invite", app, 8000);
        return left(x) && x.before === "left behind" && x.taken === "taken" && !x.arrived && x.row === "{\"seen\":false}";
      });
      check(w.turned && w.back && w.sites === 2, "939w lifting plant:stranded-out-invite, both lines that end the state for 939q at once (a pin to"
        + " another lead found at load, and a team file landed at the epoch above), keeps the desk left behind after it leaves and takes"
        + " the invitation, its files not at the lead, and the product file is never written: " + w.detail + ", sites " + w.sites + ", sha "
        + (w.back ? "restored" : "differs"));
      const x2 = await liftApp("plant:stranded-out-recopy", async app => {
        const x = await strandedWayOut("939x", "recopy", app, 8000);
        return left(x) && x.before === "left behind" && x.recopy === 200 && !x.arrived && x.row === "{\"seen\":false}";
      });
      check(x2.turned && x2.back && x2.sites === 2, "939x lifting plant:stranded-out-recopy, both lines that end the state for 939r at once (following"
        + " a handover, and a team file landed at the epoch above), keeps the desk left behind after the lead's re-copy, its files not at the"
        + " lead, and the product file is never written: " + x2.detail + ", sites " + x2.sites + ", sha " + (x2.back ? "restored" : "differs"));
      const pText = x => (x ? "synced " + x.synced + ", relay move " + x.moved + ", " + x.before + ", read " + x.read + ", yes " + x.taken
        + (x.taken === "taken" ? ", key shown " + x.key + ", files at the lead before the answer " + x.upFirst + ", uploads from the yes to the answer "
          + x.putsYes + " (from admission " + x.putsAdmitted + ")" : "") + (x.putsEnd >= 0 ? ", uploads from the yes to the end " + x.putsEnd
          + ", files at the lead at the end " + x.atLeadEnd : "")
        + (x.arrived ? ", its two files at the lead" : "") + (x.again ? ", left " + x.left + ", read again " + x.again : "")
        + ", team file epoch " + x.epoch + ", pin " + x.pin + ", row " + x.row : "");
      const pasted = x => left(x) && x.before === "left behind" && x.read === "offered" && x.taken === "taken" && x.key === "the new lead's, to compare";
      const s2 = await run(strandedPaste, "939s-match", "matches");
      check(pasted(s2.x) && !s2.x.upFirst && s2.x.putsYes === 0 && s2.x.arrived && s2.x.epoch === 2 && s2.x.pin === "the new lead" && s2.x.row === "seen",
        "939s a desk left behind pastes the new lead's invitation as it stands: offered and taken, the lead's key shown to compare once admitted,"
        + " its own files kept here until It matches and only then up, and it follows the new lead: " + pText(s2.x) + (s2.err ? ", " + s2.err : ""));
      const t2 = await run(strandedPaste, "939t-differ", "differs");
      check(pasted(t2.x) && !t2.x.upFirst && t2.x.putsYes === 0 && t2.x.putsEnd === 0 && !t2.x.atLeadEnd && t2.x.left && t2.x.pin === "none"
        && t2.x.row === "no row" && t2.x.again === "offered, the leave named",
        "939t the same paste, and on It does not match (the leave route) nothing went up, the team is left with no bar, and the invitation read"
        + " again is offered: " + pText(t2.x) + (t2.err ? ", " + t2.err : ""));
      const u2 = await run(pasteControl, "939u-control");
      check(!!u2.x && u2.x.synced && u2.x.row === "not left behind" && u2.x.read === "refused pinned" && u2.x.taken === "refused pinned"
        && u2.x.pin === "the old lead" && !u2.x.left,
        "939u control: a desk that is not left behind, offered another lead's invitation for its team, refuses it as pinned at the read and at"
        + " the yes, and keeps its pin: " + (u2.x ? "synced " + u2.x.synced + ", row " + u2.x.row + ", read " + u2.x.read + ", yes " + u2.x.taken
        + ", pin " + u2.x.pin + ", left " + u2.x.left : "") + (u2.err ? ", " + u2.err : ""));
      const v2 = await liftDesk("plant:stranded-invite", async text => {
        const x = await strandedPaste("939v", "matches", { source: text });
        return left(x) && x.before === "left behind" && x.read === "refused pinned" && x.taken === "refused pinned";
      });
      check(v2.turned && v2.back, "939v lifting plant:stranded-invite refuses the left-behind desk's paste as pinned at the read and the yes,"
        + " and the product file is never written: " + v2.detail + ", sha " + (v2.back ? "restored" : "differs"));
      const y2 = await liftApp("plant:stranded-match-hold", async app => {
        const x = await strandedPaste("939y", "matches", app);
        return pasted(x) && x.upFirst === true && x.putsYes > 0;
      });
      check(y2.turned && y2.back, "939y lifting plant:stranded-match-hold lets the left-behind desk's files reach the new lead once admitted,"
        + " before It matches is answered, and the product file is never written: " + y2.detail + ", sha " + (y2.back ? "restored" : "differs"));
      const zText = x => (x ? "synced " + x.synced + ", relay move " + x.moved + ", " + x.before + ", yes " + x.taken + ", row " + x.row + ", pin "
        + x.pin + ", left " + x.left + ", its files kept here " + x.kept + ", at the lead " + x.atLead + ", uploads " + x.puts + ", line said "
        + x.said + ", pasted again " + x.again : "");
      const z2 = await run(strandedAskFails, "939z-ask-fails");
      check(!!z2.x && left(z2.x) && z2.x.before === "left behind" && z2.x.taken === "refused silent" && z2.x.row === "left behind"
        && z2.x.pin === "the old lead" && !z2.x.left && z2.x.kept && !z2.x.atLead && z2.x.puts === 0 && z2.x.said === 1 && z2.x.again === "taken",
        "939z a desk left behind whose request cannot be written is told nothing was written and stays as it was: left behind with its notice,"
        + " under the old lead, its files here and none up; pasted again once the place is free, it is taken: " + zText(z2.x) + (z2.err ? ", " + z2.err : ""));
      const za = await liftDesk("plant:stranded-ask-first", async text => {
        const x = await strandedAskFails("939za", { source: text });
        return left(x) && x.taken === "refused silent" && x.left && x.pin === "none";
      });
      check(za.turned && za.back, "939za lifting plant:stranded-ask-first lets the old lead go before the request is written, so the failed write"
        + " leaves a desk that has left the team with no request, and the product file is never written: " + za.detail + ", sha "
        + (za.back ? "restored" : "differs"));
      const cText = x => (x ? "synced " + x.synced + ", relay move " + x.moved + ", the extra copy put " + x.extra + ", pages read by the capped catch-up "
        + x.rounds + " to entry " + x.reached + ", the next catch-up opening on line said " + x.saidCap + " and " + x.leftCap + "; at the end line said " + x.said
        + ", pin " + x.pin + ", team file epoch " + x.epoch + ", row " + x.row : "");
      const zb = await run(strandCapped, "939zb-cap");
      check(!!zb.x && left(zb.x) && zb.x.extra === 200 && zb.x.rounds === 1000 && zb.x.reached === 1000000 && zb.x.saidCap === 0
        && zb.x.leftCap === "not left behind" && zb.x.said === 0 && zb.x.pin === "the new lead" && zb.x.epoch === 2 && zb.x.row === "not left behind",
        "939zb a desk whose catch-up stops at the round cap, the new lead's handover and its own copy not yet read, is not judged left behind;"
        + " the next cycles read on and follow the new key: " + cText(zb.x) + (zb.err ? ", " + zb.err : ""));
      const zc = await liftApp("plant:stranded-whole", async app => { const x = await strandedScene("939zc", false, app); return left(x) && x.puts > 0 && x.said === 0 && x.row === "none"; });
      check(zc.turned && zc.back, "939zc lifting plant:stranded-whole, the judgement on the short page, never takes 939l's desk as left behind: it"
        + " puts its files up under the old key and says nothing, and the product file is never written: " + zc.detail + ", sha "
        + (zc.back ? "restored" : "differs"));
      const f = await run(toFolder, "939f");
      check(!!f.x && f.x.synced && f.x.folder === "the relay's mirror" && f.x.channel === "relay" && f.x.mirrorRev === 2 && f.x.mirrorChannel === "relay",
        "939f a relay desk whose lead puts up a team file at a higher rev naming a shared folder refuses it as wrong-team and stays on the relay: its mirror's team file stays at rev 2 and names"
        + " the relay, its catalog folder stays the relay's mirror and its team channel stays the relay (it was: the desk takes the folder): "
        + (f.x ? "synced " + f.x.synced + ", catalog folder " + f.x.folder + ", team channel " + f.x.channel + ", mirror team file rev " + f.x.mirrorRev + " channel " + f.x.mirrorChannel : "")
        + (f.err ? ", " + f.err : ""));
      const g = await liftApp("plant:team-own", async app => { const x = await toFolder("939g", app); return x.synced && x.mirrorRev === 3 && x.mirrorChannel === "folder"; });
      check(g.turned && g.back, "939g lifting plant:team-own lets the lead's folder-channel team file into the desk's mirror, where 939f refuses it, and the product"
        + " file is never written: " + g.detail + ", sha " + (g.back ? "restored" : "differs"));
      const h = await run(forkOnRelay, "939h");
      check(!!h.x && h.x.ok === true,
        "939h through the relay, a desk that catches up K1 handed to K2 and to K3 in one look follows neither, keeps its pin and team file, and"
        + " says so: " + (h.x ? "synced " + h.x.synced + ", the K3 file by K1 " + h.x.thief + ", relay move to K2 " + h.x.moved + ", desk pin "
        + h.x.pin + ", channel pin " + h.x.channelPin + ", fork " + h.x.fork + ", said " + h.x.said + ", team file rev " + h.x.rev : "") + (h.err ? ", " + h.err : ""));
      const i = await liftApp("plant:fork-two", async app => { const x = await forkOnRelay("939i", app, 8000); return x.synced && x.thief === 200 && x.moved === 200 && x.channelPin !== "K1"; });
      check(i.turned && i.back, "939i lifting plant:fork-two on the same path follows one of K1's two successors, and the product file is never written: "
        + i.detail + ", sha " + (i.back ? "restored" : "differs"));
      /* The row's fork for a relay team, end to end (team-desk's 14bm, 14bq and 14cd held it for a folder team's row, retired with the folder team). */
      check(!!h.x && h.x.row === "two/new" && h.x.dismissed === "two/seen" && h.x.keptFork === true,
        "939h2 the team's row carries the fork the relay channel saw, once and not yet dismissed, and the agent's dismissal marks that fork seen on the row and is kept"
        + " in the desk's record for it: row " + (h.x ? h.x.row + ", after the dismissal " + h.x.dismissed + ", kept " + h.x.keptFork : "") + (h.err ? ", " + h.err : ""));
      if (PLANTS_OFF) skip("939h3 lifting plant:fork-row in a scratch copy of shell/main.js keeps the fork from the team's row");
      else {
        const r3 = await liftDesk("plant:fork-row", async next => { const x = await forkOnRelay("939h3", { src: next }, 8000); return x.synced && x.row === "none"; });
        check(r3.turned && r3.back, "939h3 lifting plant:fork-row in a scratch copy of shell/main.js keeps the fork from the team's row, so the notice never shows, and the product file is never written: "
          + r3.detail + ", sha " + (r3.back ? "restored" : "differs"));
      }
      if (PLANTS_OFF) skip("939h4 lifting plant:fork-seen in a scratch copy of shell/main.js forgets the dismissal");
      else {
        const r4 = await liftDesk("plant:fork-seen", async next => { const x = await forkOnRelay("939h4", { src: next }, 8000); return x.synced && x.row === "two/new" && x.dismissed !== "two/seen"; });
        check(r4.turned && r4.back, "939h4 lifting plant:fork-seen in a scratch copy of shell/main.js forgets the dismissal, so the notice shows again, and the product file is never written: "
          + r4.detail + ", sha " + (r4.back ? "restored" : "differs"));
      }
    }

  
  {
      const a = await run(handoverUnderOld, "994a", false);
      check(!!a.x && a.x.ok === true,
        "994a a desk away while the old lead puts up a team file with a later counter and the lead then hands the team to a new key, both"
        + " in one since page, follows the handover and opens the new key's edition, head and span: the old lead's file " + (a.x ? a.x.old : "?")
        + ", " + sceneText(a.x, a.err));
      if (PLANTS_OFF) skip("994b lifting plant:handed-wins with plant:page-ends lets the old lead's later counter win the page, so the desk stays on the old lead");
      else {
        /* With plant:page-ends: a page with items is never the last now, so the two meet in one look only where a short page is. */
        const b = await liftApp(["plant:handed-wins", "plant:page-ends"], async app => { const x = await handoverUnderOld("994b", false, app, 8000); return x.synced && x.old === 200 && x.moved === 200 && !!x.now && x.now.pin === "the old lead"; });
        check(b.turned && b.back, "994b lifting plant:handed-wins with plant:page-ends lets the old lead's later counter win the page, so the desk stays on the old lead,"
          + " and the product file is never written: " + b.detail + ", sha " + (b.back ? "restored" : "differs"));
      }
      const c = await run(handoverUnderOld, "994c", true);
      check(!!c.x && c.x.ok === true,
        "994c a team file the old key put up naming the new key with the genuine step but not verifying, its counter later than the"
        + " handover's in the same since page, is refused and the genuine handover is landed next: the refused file " + (c.x ? c.x.old : "?")
        + ", " + sceneText(c.x, c.err));
      if (PLANTS_OFF) skip("994d lifting plant:team-next stops at the refused file, so the desk stays on the old lead");
      else {
        const d = await liftApp("plant:team-next", async app => { const x = await handoverUnderOld("994d", true, app, 8000); return x.synced && x.old === 200 && x.moved === 200 && !!x.now && x.now.pin === "the old lead"; });
        check(d.turned && d.back, "994d lifting plant:team-next stops at the refused file, so the desk stays on the old lead, and the product file is"
          + " never written: " + d.detail + ", sha " + (d.back ? "restored" : "differs"));
      }
      const fText = x => (x ? "synced " + x.synced + ", the K3 file by K1 " + x.thief + ", relay move to K2 " + x.moved + ", pages from the stand-in "
        + x.pages + ", desk pin " + x.pin + ", channel pin " + x.channelPin + ", fork " + x.fork + ", said " + x.said + ", team file rev " + x.rev : "");
      const e = await run(forkAcrossPages, "994e", false);
      check(!!e.x && e.x.ok === true,
        "994e a desk away while K1 is handed to K3, then more than a page of listings, then K1 to K2, reads the two on different pages of one"
        + " catch-up, follows neither, keeps its pin and team file, and says the fork once: " + fText(e.x) + (e.err ? ", " + e.err : ""));
      if (PLANTS_OFF) skip("994f lifting plant:ahead-defer follows K3 from the first page before the catch-up has read its short page");
      else {
        const f = await liftApp("plant:ahead-defer", async app => { const x = await forkAcrossPages("994f", false, app); return x.synced && x.thief === 200 && x.moved === 200 && x.pages >= 2 && x.channelPin === "K3"; });
        check(f.turned && f.back, "994f lifting plant:ahead-defer follows K3 from the first page before the catch-up has read its short page, and the"
          + " product file is never written: " + f.detail + ", sha " + (f.back ? "restored" : "differs"));
      }
      const g = await run(forkAcrossPages, "994g", true);
      check(!!g.x && g.x.ok === true,
        "994g the same scene with the K3 file gone from the relay by the short page: the steps the catch-up kept still show the fork, and the"
        + " desk follows neither and says it once: " + fText(g.x) + (g.err ? ", " + g.err : ""));
      if (PLANTS_OFF) skip("994h lifting plant:ahead-steps forgets the first page's steps, so the desk follows K2 alone from the short page");
      else {
        const h = await liftApp("plant:ahead-steps", async app => { const x = await forkAcrossPages("994h", true, app); return x.synced && x.thief === 200 && x.moved === 200 && x.pages >= 2 && x.channelPin === "K2"; });
        check(h.turned && h.back, "994h lifting plant:ahead-steps forgets the first page's steps, so the desk follows K2 alone from the short page, and"
          + " the product file is never written: " + h.detail + ", sha " + (h.back ? "restored" : "differs"));
      }
      const pText = x => (x ? "pages from the stand-in " + x.pages + ", " : "") + sceneText(x, "");
      const i = await run(handoverAcrossPages, "994i");
      check(!!i.x && i.x.ok === true,
        "994i control: one genuine handover on the first page of a catch-up, then more than a page of listings, is followed once the short page"
        + " is read, and what the new key wrote on the first page is taken: " + pText(i.x) + (i.err ? ", " + i.err : ""));
      if (PLANTS_OFF) skip("994j lifting plant:ahead-land never lands the held handover, so the desk stays on the old lead");
      else {
        const j = await liftApp("plant:ahead-land", async app => { const x = await handoverAcrossPages("994j", app, 8000); return x.synced && x.moved === 200 && x.pages >= 2 && !!x.now && x.now.pin === "the old lead"; });
        check(j.turned && j.back, "994j lifting plant:ahead-land never lands the held handover, so the desk stays on the old lead, and the product file"
          + " is never written: " + j.detail + ", sha " + (j.back ? "restored" : "differs"));
      }
      if (PLANTS_OFF) skip("994k lifting plant:ahead-park with plant:item-held and plant:later-hold drops what the new key wrote on the first page, so the desk follows without its head");
      else {
        /* Paired: stage 5's kept head (plant:item-held) also carries the new key's head across the pages, so ahead-park alone is redundancy;
           and a page's files held for the last page (plant:later-hold) carry them too. */
        const k = await liftApp(["plant:ahead-park", "plant:item-held", "plant:later-hold"], async app => { const x = await handoverAcrossPages("994k", app, 8000); return x.synced && x.moved === 200 && !!x.now && x.now.pin === "the new lead" && x.now.head !== "Handover edition"; });
        check(k.turned && k.back, "994k lifting plant:ahead-park with plant:item-held and plant:later-hold drops what the new key wrote on the first page, so the desk follows without its head,"
          + " and the product file is never written: " + k.detail + ", sha " + (k.back ? "restored" : "differs"));
      }
      const lText = x => (x ? "synced " + x.synced + ", the K3 file by K1 " + x.thief + ", pages from the stand-in " + x.pages + ", desk pin "
        + x.pin + ", channel pin " + x.channelPin + ", the mirror's team file epoch " + x.epoch + " by " + x.lead : "");
      const l = await run(staleHandover, "994l");
      check(!!l.x && l.x.ok === true,
        "994l a handover at the first epoch, judged after the desk's mirror has taken the team's second epoch, is refused by the epoch hold"
        + " and the pin stays: " + lText(l.x) + (l.err ? ", " + l.err : ""));
      if (PLANTS_OFF) skip("994m lifting plant:hold-before-move reads the mirror under the moved pin, so the stale handover lands and the desk follows K3");
      else {
        const m = await liftApp("plant:hold-before-move", async app => { const x = await staleHandover("994m", app); return x.synced && x.thief === 200 && x.pages >= 2 && x.channelPin === "K3"; });
        check(m.turned && m.back, "994m lifting plant:hold-before-move reads the mirror under the moved pin, so the stale handover lands and the desk"
          + " follows K3, and the product file is never written: " + m.detail + ", sha " + (m.back ? "restored" : "differs"));
      }
      const rText = x => (x ? "pages to the cap " + x.pages + ", held at the stop " + x.held + ", " : "") + sceneText(x, "");
      const n = await run(heldAcrossRestart, "994n");
      check(!!n.x && n.x.ok === true,
        "994n a desk stopped at the round cap with a handover held, loaded again from its user data and reaching the short page, follows it and"
        + " takes what the new key wrote: " + rText(n.x) + (n.err ? ", " + n.err : ""));
      if (PLANTS_OFF) skip("994o lifting plant:ahead-kept loses the held handover at the restart, so the desk stays on the old lead");
      else {
        const o = await liftApp("plant:ahead-kept", async app => { const x = await heldAcrossRestart("994o", app, 8000); return x.synced && x.moved === 200 && x.held === 1 && !!x.now && x.now.pin === "the old lead"; });
        check(o.turned && o.back, "994o lifting plant:ahead-kept loses the held handover at the restart, so the desk stays on the old lead, and the product"
          + " file is never written: " + o.detail + ", sha " + (o.back ? "restored" : "differs"));
      }
    }
  }
  if (partOn("p987")) {
  markPart("p987");
}
  /* ---- 987t, It does not match, once confirmed, leaves the team as Settings' Leave this team does (the ruling of 2026-11-01
     06:13, the test architect's leg of 06:14): a relay desk joined by invitation, its page the engine's own team-join.js over
     its shell, confirms It does not match and leaves, keys and pin forgotten and no bar; a later invitation for the same team
     asks again and, admitted, shows the lead's key; It does not match leaves again, and It matches joins. `M` is the page
     module, `app` what relayDeskScene loads. ---- */
  async function leaveRouteScene(tag, M, app) {
    const out = { synced: false };
    const s = await relayDeskScene(tag, app);
    globalThis.window = globalThis.window || {};
    globalThis.document = globalThis.document || {};
    const docWas = { querySelector: document.querySelector, querySelectorAll: document.querySelectorAll, body: document.body };
    let hooksWas = null;
    try {
      out.synced = !!s.synced;
      if (!out.synced) return out;
      const ops = [];
      let took = () => {};
      document.documentElement = document.documentElement || {};
      document.body = document.body || { classList: { contains: () => false, toggle() {}, add() {}, remove() {} }, appendChild: el => el };
      document.querySelectorAll = () => [];
      document.querySelector = () => null;
      document.addEventListener = document.addEventListener || (() => {});
      document.removeEventListener = document.removeEventListener || (() => {});
      window.addEventListener = window.addEventListener || (() => {});
      window.removeEventListener = window.removeEventListener || (() => {});
      window.E_HOST = { onTeamJoin: fn => { took = fn; }, teamJoin: (op, file, name, four) => { ops.push(op); return s.Dk.ask("etiuda:team-join", op, file, name, four); } };
      const ST = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
      const HK = await import(pathToFileURL(path.join(ROOT, "src", "modules", "hooks.js")).href);
      const AS = await import(pathToFileURL(path.join(ROOT, "src", "modules", "app-state.js")).href);
      HK.hooks.render = () => {};
      hooksWas = { load: HK.hooks.loadCatalogFromFolder, hooks: HK.hooks };
      HK.hooks.loadCatalogFromFolder = () => {};
      AS.setCards([]);
      ST.lsSet("eUiLang", "en");
      const el = (attrs, value) => ({ value: value || "", hasAttribute: a => Object.prototype.hasOwnProperty.call(attrs, a),
        getAttribute: a => (Object.prototype.hasOwnProperty.call(attrs, a) ? attrs[a] : null) });
      const press = act => { const b = el({ "data-join": act }); M.wireTeamJoinEmpty({ querySelectorAll: () => [b] }); return Promise.resolve(b.onclick && b.onclick()); };
      const refresh = async () => { M.wireTeamJoin(); await wait(40); return shownText(M.teamJoinEmptyHtml()); };
      const key1 = s.keys.get(1);
      let rev = 2;
      const held = () => {
        const env = s.Dk.envelope();
        return { pin: !!(env.teamPins || {})[s.team], keys: !!(env.teamKeys || {})[s.team], left: !!(env.teamLeft || {})[s.team],
          barred: (env.teamBarred || []).indexOf(s.team) >= 0, seen: (env.teamSeen || []).indexOf(s.team) >= 0 };
      };
      const leadOf = async () => {
        const v = await s.Dk.ask("etiuda:team-join", "leads");
        return (v && Array.isArray(v.leads) ? v.leads : []).filter(l => l && l.team === s.team)[0] || null;
      };
      /* The key card: the lead's key in four groups, It matches and It does not match. */
      const keyCard = async () => {
        const page = await refresh(), l = await leadOf();
        const groups = l && l.print ? M.leadKeyText(l.print) : "";
        return !!groups && page.indexOf("You are on the team") >= 0 && page.indexOf(groups) >= 0
          && page.indexOf('data-join="seen"') >= 0 && page.indexOf('data-join="forget"') >= 0;
      };
      /* It does not match, then the confirmation's Leave this team: what the shell was sent, and what the desk keeps after. */
      const mismatch = async () => {
        const mark = ops.length;
        await press("forget");
        const asked = shownText(M.teamJoinEmptyHtml()).indexOf("Leave this team on this desk?") >= 0;
        const first = ops.slice(mark).filter(o => o === "leave" || o === "forget").length;
        await press("forget");
        await wait(50);
        return { asked, first, sent: ops.slice(mark).filter(o => o === "leave" || o === "forget"), after: held() };
      };
      /* The same team invites the desk again: its link opened, confirmed on the page, and the desk admitted by the lead over the relay. */
      const invite = async () => {
        R.clock.now += 1;
        const inv = await relayInviteOn(s.rt, s.team);
        s.invs.push({ id: inv.inv, key: C.inviteSealKey(inv.secret) });
        await s.studio.kick(); await s.studio.idle();
        /* P2: no paste box; the invitation arrives as the link the lead sends, which the shell offers and the page confirms. */
        M.wireTeamJoin();
        const got = s.Dk.api.acceptLink("etiuda:join#" + inv.text.slice("etiuda-join:".length));
        if (got && got.offer) took({ offer: got.offer });
        const offer = M.inviteHeld();
        const confirm = shownText(M.teamJoinEmptyHtml());
        const r = { offered: !!(offer && offer.offer), again: confirm.indexOf("Join it again?") >= 0, joined: false, card: false };
        if (!r.offered) { await press("back"); return r; }
        const joinRel = "desks/" + s.me.id + "/join.json", was = read(s.sMirror, joinRel);
        await press("invite");
        await until(async () => { await s.pump(); const now = read(s.sMirror, joinRel); return !!now && now !== was; }, 8000);
        rev += 1;
        put(s.sMirror, C.TEAM_NAME, s.doc({ rev, roster: [s.entry(key1, 1)] }));
        await s.studio.kick(); await s.studio.idle();
        r.joined = await until(async () => {
          await s.pump();
          const h = held(), here = s.Dk.api.relayHere();
          return h.pin && h.keys && !!here && here.joining === false;
        }, 30000);
        s.invs.length = 0;
        r.card = r.joined && await keyCard();
        return r;
      };
      out.card0 = await keyCard();
      out.leave1 = await mismatch();
      out.invite1 = await invite();
      out.leave2 = out.invite1.card ? await mismatch() : null;
      out.invite2 = out.leave2 ? await invite() : null;
      if (out.invite2 && out.invite2.card) {
        const mark = ops.length;
        await press("seen");
        const page = await refresh();
        out.match = { sent: ops.slice(mark).filter(o => o !== "state" && o !== "held" && o !== "content"), after: held(),
          card: page.indexOf("You are on the team") >= 0, catalog: factsOf(s.Dk.api.readCatalog() || "") === 1 };
      }
      const left = x => !!x && x.asked && x.first === 0 && x.sent.length === 1 && x.sent[0] === "leave"
        && !x.after.pin && !x.after.keys && x.after.left;
      const back = x => !!x && x.offered && x.again && x.joined && x.card;
      out.ok = out.card0 && left(out.leave1) && back(out.invite1) && left(out.leave2) && back(out.invite2)
        && !!out.match && out.match.sent.join() === "seen" && out.match.after.pin && out.match.after.keys && out.match.after.seen
        && !out.match.after.barred && !out.match.after.left && !out.match.card && out.match.catalog;
      return out;
    } finally {
      document.querySelector = docWas.querySelector;
      document.querySelectorAll = docWas.querySelectorAll;
      document.body = docWas.body;
      if (hooksWas) hooksWas.hooks.loadCatalogFromFolder = hooksWas.load;
      await s.stop();
    }
  }
  if (partOn("p987")) {
  const leaveText = x => {
      if (!x) return "no scene";
      const lv = v => (v ? "asked " + v.asked + ", at the first press " + v.first + ", sent " + (v.sent.join("+") || "nothing")
        + ", pin " + (v.after.pin ? "kept" : "gone") + ", keys " + (v.after.keys ? "kept" : "gone") + ", leave " + (v.after.left ? "kept" : "none")
        + ", bar " + (v.after.barred ? (v.after.left ? "with a leave" : "with no leave") : "none") : "not reached");
      const iv = v => (v ? (v.offered ? "offered" + (v.again ? " as Join it again" : " without Join it again") : "refused") + ", admitted " + v.joined
        + ", key shown " + v.card : "not reached");
      return "synced " + x.synced + "; key shown " + x.card0 + "; first leave: " + lv(x.leave1) + "; invited again: " + iv(x.invite1)
        + "; second leave: " + lv(x.leave2) + "; invited a third time: " + iv(x.invite2) + "; It matches: "
        + (x.match ? "sent " + x.match.sent.join("+") + ", pin " + x.match.after.pin + ", seen " + x.match.after.seen + ", bar " + x.match.after.barred
          + ", key card " + (x.match.card ? "still shown" : "gone") + ", catalog " + (x.match.catalog ? "reads" : "does not read") : "not reached");
    };

  
  {
      const TJm = await import(pathToFileURL(path.join(ROOT, "src", "modules", "team-join.js")).href + "?leave-route");
      const t = await run(leaveRouteScene, "987t", TJm);
      check(!!t.x && t.x.ok === true,
        "987t It does not match, once confirmed, leaves the team as Settings' Leave this team does: keys and pin forgotten, no bar; a later"
        + " invitation for the same team asks again and, admitted, shows the lead's key; It does not match leaves again, and It matches joins: "
        + leaveText(t.x) + (t.err ? ", " + t.err : ""));
      if (PLANTS_OFF) skip("987u lifting plant:mismatch-leaves leaves the team on the desk after the confirmation");
      else {
        const file = path.join(ROOT, "src", "modules", "team-join.js"), before = fs.readFileSync(file);
        let turned = false, detail = "plant line absent";
        try {
          const lines = before.toString("utf8").split(/\n/), at = lines.findIndex(l => l.indexOf("plant:mismatch-leaves") >= 0);
          if (at >= 0) {
            lines.splice(at, 1);
            const dir = fs.mkdtempSync(path.join(LAB, "leave-route-plant-"));
            const modulesUrl = pathToFileURL(path.join(ROOT, "src", "modules")).href;
            fs.writeFileSync(path.join(dir, "team-join.js"), lines.join("\n").replace(/from "\.\//g, 'from "' + modulesUrl + "/"), "utf8");
            const planted = await import(pathToFileURL(path.join(dir, "team-join.js")).href);
            const u = await run(leaveRouteScene, "987u", planted);
            turned = !!u.x && u.x.synced && !!u.x.leave1 && u.x.leave1.sent.length === 0 && u.x.leave1.after.pin;
            detail = leaveText(u.x) + (u.err ? ", " + u.err : "");
          }
        } catch (e) {
          detail = e && e.stack ? e.stack : String(e);
        }
        check(turned && fs.readFileSync(file).equals(before), "987u lifting plant:mismatch-leaves, the confirmation's Leave this team sends nothing"
          + " and the team stays on the desk (FAIL 987t), and the product file is never written: " + detail);
      }
      if (PLANTS_OFF) skip("987v lifting plant:leave-remembers bars the team, so a later invitation is refused");
      else {
        const v = await liftDesk("plant:leave-remembers", async next => {
          const x = await run(leaveRouteScene, "987v", TJm, { src: next });
          return !!x.x && x.x.synced && !!x.x.leave1 && x.x.leave1.sent.join() === "leave" && x.x.leave1.after.barred
            && !x.x.leave1.after.left && !!x.x.invite1 && !x.x.invite1.offered;
        });
        check(v.turned && v.back, "987v lifting plant:leave-remembers, the leave keeps no date, so the team stays barred and a later invitation"
          + " is refused (FAIL 987t), and the product file is never written: " + v.detail + ", sha " + (v.back ? "restored" : "differs"));
      }
    }
  }

  if (!partOn("p944g")) {
    try { await studio.stop(); } catch { /* already stopped */ }
    try { const left = D.api.relayRun(); if (left) await left.stop(); } catch { /* already stopped */ }
  }
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

  if (partOn("p942f")) {
  markPart("p942f");
  /* Alone, nothing has read policy, and an empty counter is not a pass.
     One export of the desk's key, through the stand-in, before the audit. */
  if (process.platform === "win32" && regStand.total() < 1) {
    const file = path.join(LAB, "942f-policy.reg");
    try {
      nodeRequire("node:child_process").execFileSync("C:\\Windows\\System32\\reg.exe",
        ["export", "HKLM\\SOFTWARE\\Policies\\Etiuda", file, "/y"],
        { windowsHide: true, timeout: 5000, stdio: "ignore" });
    } catch { /* the key is not there; the stand-in counted the export */ }
    try { fs.unlinkSync(file); } catch { /* never written */ }
  }

  check(regStand.held(), "942f every reg call was answered by the stand-in (" + regStand.said() + ")");
  }

/* F8. A joining desk seals its one request at an epoch a verified lead blob named. A header the relay lists moves
   leadEpoch only once the pinned lead's upload signature verifies. F7, the program's half: a blob is parked to wait
   for a key only after that signature verifies under a writer this program trusts, so a forged future epoch cannot
   fill pending or push an honest wait out. */
  if (partOn("p951")) {
  markPart("p951");


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
  }, who && who.keyId !== LEAD.keyId ? { seat: () => seatFor(who) } : {}, x));
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
if (partOn("p952")) {
  try {
    markPart("p952");
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
}

/* ---- 994p, the epoch order (the test architect, 2026-11-01 17:26): a desk holding both epochs' keys, its mirror on the first
   epoch, is away while K1's holder puts up a first-epoch team file handing K1 to K3 and the lead then moves the team to the
   second epoch. Both team files come back in one since page: the desk lands the second epoch under the pin and does not follow
   K3. `mod` is the channel layer the desk loads; the lead keeps the product's. ---- */
async function rawUpload(rt, who, b) {
  const t = transport("raw-" + hex(3));
  const h = await t.request("POST", URLV1 + "/t/" + rt + "/hello", {}, Buffer.from("{}"));
  const challenge = JSON.parse(h.bytes.toString()).challenge;
  const ses = await t.request("POST", URLV1 + "/t/" + rt + "/session", { "content-type": "application/json" },
    Buffer.from(JSON.stringify(Object.assign({ challenge, key: who.keyId, pub: who.pub, sig: signHex(who, C.helloBytes(rt, challenge, who.keyId)) },
      who.keyId !== LEAD.keyId ? { seat: seatFor(who) } : {}))));
  const token = JSON.parse(ses.bytes.toString()).session;
  const meta = { v: 1, id: b.id, supersedes: b.supersedes, epoch: b.epoch, writer: b.writerKeyId, counter: b.counter, del: b.deletion,
    sig: b.signature, nonce: b.nonce, place: b.place };
  const r = await t.request("PUT", URLV1 + "/t/" + rt + "/b/" + b.id,
    { authorization: "Bearer " + token, "etiuda-blob": Buffer.from(JSON.stringify(meta)).toString("base64url") }, b.ciphertext);
  return r.status;
}
async function staleInOnePage(mod) {
  const out = { first: 0, thief: 0, leadPin: "", pin: "", epoch: 0, lead: "", pages: 0 };
  const k1 = crypto.randomBytes(32), k2 = crypto.randomBytes(32), keys = new Map([[1, k1], [2, k2]]);
  const deskKey = keyPair(true), K3 = keyPair(true);
  const tm = await freshTeam([deskKey]);
  let sealAt = 1;
  const lead = opened(C, "994p-lead-" + tm.rt.slice(0, 8), tm, LEAD, "root", {
    me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }),
    keyFor: e => keys.get(e) || null, sealEpoch: () => sealAt,
  });
  const desk = opened(mod, "994p-desk-" + tm.rt.slice(0, 8), tm, deskKey, "desk:" + deskKey.keyId, { keyFor: e => keys.get(e) || null, sealEpoch: () => 2 });
  const name = k => (k && k.keyId === LEAD.keyId ? "K1" : k && k.keyId === K3.keyId ? "K3" : "none");
  try {
    put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(deskKey)]));
    lead.ch.start();
    await settle(lead);
    desk.ch.start();
    await settle(desk);
    try { out.first = JSON.parse(read(desk.mirror, C.TEAM_NAME)).epoch; } catch { out.first = 0; }
    desk.t.down = true;
    const step = { format: 1, kind: "etiuda-team-handover", team: tm.id, from: { keyId: LEAD.keyId, public: LEAD.pub },
      to: { keyId: K3.keyId, public: K3.pub }, sig: { alg: "Ed25519", keyId: LEAD.keyId } };
    step.sig.value = signHex(LEAD, Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), C.signedBytes(step)]));
    const doc = { format: 1, kind: "etiuda-team", id: tm.id, catalogs: ["quay-board"], lead: { keyId: K3.keyId, public: K3.pub },
      sealed: true, exportsSealed: false, epoch: 1, rev: 2, channel: { kind: "relay", rt: tm.rt, url: URLV1 }, ring: RING,
      roster: [member(deskKey)], handover: [step], sig: { alg: "Ed25519", keyId: K3.keyId } };
    doc.sig.value = signHex(K3, C.signedBytes(doc));
    out.thief = await rawUpload(tm.rt, LEAD, B.seal({ relayTeamId: tm.rt, epoch: 1, teamKey: k1, writer: { keyId: LEAD.keyId, privateKey: LEAD.privateKey },
      path: C.TEAM_NAME, body: JSON.stringify(doc, null, 1) + "\n", counter: Date.now() + 5e6, place: "root", kind: "file" }));
    sealAt = 2;
    put(lead.mirror, C.TEAM_NAME, teamBody(tm, 2, 1, [member(deskKey)]));
    await settle(lead);
    out.leadPin = name(lead.prog.pinned() && lead.prog.pinned().lead);
    desk.t.down = false;
    await settle(desk);
    out.pages = desk.t.log.filter(l => /since\//.test(l)).length;
    out.pin = name(desk.prog.pinned() && desk.prog.pinned().lead);
    try { const d = JSON.parse(read(desk.mirror, C.TEAM_NAME)); out.epoch = d.epoch; out.lead = name(d.lead); } catch { out.epoch = 0; }
    out.ok = out.first === 1 && out.thief === 200 && out.leadPin === "K1" && out.pin === "K1" && out.epoch === 2 && out.lead === "K1";
    return out;
  } finally {
    await lead.ch.stop();
    await desk.ch.stop();
  }
}
if (partOn("p994p")) {
  try {
    markPart("p994p");
    const pText = x => "the desk's first epoch " + x.first + ", the K3 file by K1 " + x.thief + ", the lead's own pin " + x.leadPin + ", desk pin " + x.pin
      + ", the mirror's team file epoch " + x.epoch + " by " + x.lead;
    const p = await staleInOnePage(C);
    check(p.ok === true, "994p a first-epoch handover to K3 and the pinned lead's own move to the second epoch in one since page, the desk's mirror"
      + " on the first: the desk lands the second epoch under the pin and does not follow K3: " + pText(p));
    if (PLANTS_OFF) skip("994q lifting plant:epoch-first with plant:page-ends puts the stale handover first, so the desk follows K3");
    else {
      /* With plant:page-ends: a page with items is never the last now, so the two meet in one look only where a short page is. */
      const q = await liftChannel(["plant:epoch-first", "plant:page-ends"], async mod => { const x = await staleInOnePage(mod); return x.first === 1 && x.thief === 200 && x.leadPin === "K1" && x.pin === "K3"; });
      check(q.turned && q.back, "994q lifting plant:epoch-first with plant:page-ends puts the stale handover first, so the desk follows K3, and the product file is never"
        + " written: " + q.detail + ", sha " + (q.back ? "restored" : "differs"));
    }
  } catch (e) {
    check(false, "harness (the leg 994p): " + (e && e.stack ? e.stack : e));
  }
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
if (partOn("p923g")) {
  try {
    markPart("p923g");
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
}

/* ---- an edit of this program's own file, one cycle (S2). The catch-up skips what this desk, or the lead, just sent,
   so the cycle that the edit starts does not write the older bytes back over it. Three cycles would hide the loss:
   the second would consume the program's own blob before the edit. The edit has three guards now: the record that shows
   the blob sent (plant:own-skip), the refusal of a blob not later than the last one sent (plant:own-older), and the edit
   kept as a copy where the mirror holds neither the blob's bytes nor the last sent (plant:own-apart); 953c lifts all three. ---- */
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
    leadSent: leadOnEdit, deskMirror: read(desk.mirror, rel), leadOfDesk: read(lead.mirror, rel), deskSent,
    copies: fs.readdirSync(lead.mirror).concat(fs.readdirSync(path.join(desk.mirror, "desks", deskKey.keyId))).filter(n => /conflicted copy/.test(n)).length };
  await lead.ch.stop();
  await desk.ch.stop();
  return out;
}
if (partOn("p953")) {
  try {
    markPart("p953");
    const edit = await keptEdit(C);
    check(edit.deskMirror === "v2\n" && edit.leadOfDesk === "v2\n" && edit.deskSent === 1,
      "953a a desk's own file is sent, edited, and one cycle run: the edit is kept and sent: mirror " + JSON.stringify(edit.deskMirror)
      + ", at the lead " + JSON.stringify(edit.leadOfDesk) + ", uploads on that cycle " + edit.deskSent);
    check(edit.leadMirror === "e2\n" && edit.deskOfLead === "e2\n" && edit.guideAtDesk === "e2\n" && edit.leadSent === 1,
      "953b the lead's edition is sent, edited, and one cycle run: the edit is kept and sent: mirror " + JSON.stringify(edit.leadMirror)
      + ", at the desk " + JSON.stringify(edit.deskOfLead) + ", uploads on that cycle " + edit.leadSent);
    const planted = await liftChannel(["plant:own-skip", "plant:own-older", "plant:own-apart"], async mod => {
      const x = await keptEdit(mod);
      return x.deskMirror === "v1\n" && x.leadOfDesk === "v1\n" && x.deskSent === 0
        && x.leadMirror === "e1\n" && x.deskOfLead === "e1\n" && x.leadSent === 0 && x.copies === 0;
    });
    check(planted.turned && planted.back, "953c lifting plant:own-skip, plant:own-older and plant:own-apart together writes the sent copy over the edit and keeps no copy of it, on the desk and on the lead, and the product file is never written: "
      + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the leg 953a): " + (e && e.stack ? e.stack : e));
  }
}


/* ---- a catch-up skips a blob as this computer's own only when this computer's own record shows it wrote that id, never
   because the writer is this key (board 932 (2), engine half). A lead restored to a fresh profile has no record, so it
   fetches its team file and its other files back; one key on two computers has two records, so each fetches the other's
   uploads. An own blob fetched this way is judged and applied as anyone's is: one not later than what this computer last
   sent for that path is refused as older and changes nothing, and one that would overwrite an edit still waiting to go up
   is written, the edit kept beside it as a conflict copy that is never sent (the relay's blob stays live; nor1 below). ---- */

  const OWN_G1 = "guide one, written before the profile was lost\n", OWN_G2 = "guide two, an edit made on the new profile\n";


  const OWN_N1 = "notes, kept beside the guide\n";


  const OWN_LOW = "guide at epoch two, a low counter\n";
async function ownSetup(mod) {
  const deskKey = keyPair(true), keys = new Map([[1, crypto.randomBytes(32)]]);
  const tm = await freshTeam([deskKey]);
  const tag = tm.rt.slice(0, 8);
  const mk = (name, place) => opened(mod, name + "-" + tag, tm, LEAD, place || "root", { keyFor: e => keys.get(e) || null, sealEpoch: () => 1 });
  return { tm, mk, deskKey, keys, teamText: teamBody(tm, 1, 1, [member(deskKey)]) };
}
  const putsOf = p => p.t.log.filter(l => /^PUT b\//.test(l)).length;


  const liveBy = (tm, writer) => blobsOn(tm.rt, writer).filter(v => !v.del).length;
  /* The bytes of the one conflict copy of guide.ec in a mirror, or null where there is none or more than one. */
  const keptCopy = dir => { const n = fs.readdirSync(dir).filter(x => /^guide \(conflicted copy[^)]*\)\.ec$/.test(x)); return n.length === 1 ? read(dir, n[0]) : null; };
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
/* A program's own upload, in its record, is not fetched in the cycle that lists it. The cycle after that one lists
   nothing new, so a count taken there stays at zero even when the record-based skip is gone. */
async function ownRecorded(mod) {
  const { mk, teamText } = await ownSetup(mod);
  const lead = mk("own-s1");
  put(lead.mirror, C.TEAM_NAME, teamText);
  put(lead.mirror, "guide.ec", OWN_G1);
  lead.ch.start();
  await lead.ch.idle();
  const since = lead.t.log.length;
  await once(lead);
  const after = lead.t.log.slice(since);
  await lead.ch.stop();
  return { listed: after.some(l => /^GET since\//.test(l)), fetched: after.filter(l => /^GET b\//.test(l)).length,
    puts: after.filter(l => /^PUT b\//.test(l)).length, guide: read(lead.mirror, "guide.ec") };
}
/* Two programs on one key. The first seals its team file and its guide under a clock the relay then holds as the floor.
   A newer epoch of the guide, a lower counter, is put beside it so the catch-up passes over the high counter. The second
   program's clock is behind that floor: its next upload is taken the first time only when the passed-over blob raised it. */
async function ownClockBehind(mod) {
  const k1 = crypto.randomBytes(32), k2 = crypto.randomBytes(32);
  const tm = await freshTeam([]);
  const tag = tm.rt.slice(0, 8);
  const keys = new Map([[1, k1], [2, k2]]);
  const keyFor = e => keys.get(e) || null;
  const high = 10000000;
  const a = opened(mod, "own-c1-" + tag, tm, LEAD, "root", { keyFor, sealEpoch: () => 1, clock: () => high });
  put(a.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, []));
  put(a.mirror, "guide.ec", OWN_G1);
  a.ch.start();
  await a.ch.idle();
  const sentA = a.prog.state().sent;
  const teamCounter = sentA[C.TEAM_NAME] ? sentA[C.TEAM_NAME].counter : 0;
  const guideCounter = sentA["guide.ec"] ? sentA["guide.ec"].counter : 0;
  const low = B.seal({ relayTeamId: tm.rt, epoch: 2, teamKey: k2, writer: { keyId: LEAD.keyId, privateKey: LEAD.privateKey },
    path: "guide.ec", body: OWN_LOW, counter: 50, place: "root" });
  const s = relayStore(tm.rt), seq = (s.get("seq") || 0) + 1, obj = tm.rt + "/" + low.id + "/" + hex(8);
  R.bucket.objects.set(obj, Buffer.from(low.ciphertext));
  s.put("blob:" + low.id, { id: low.id, supersedes: null, epoch: 2, writer: LEAD.keyId, counter: 50, del: false,
    size: low.ciphertext.length, sig: low.signature, nonce: low.nonce, seq, at: R.clock.now, obj });
  s.put("seq:" + String(seq).padStart(16, "0"), low.id);
  s.put("seq", seq);
  await a.ch.stop();
  const b = opened(mod, "own-c2-" + tag, tm, LEAD, "root", { keyFor, sealEpoch: () => 1, clock: () => 1000 });
  b.ch.start();
  await b.ch.idle();
  const ownAtCatch = b.prog.state().own, guide = read(b.mirror, "guide.ec");
  const before = b.t.log.filter(l => /^PUT b\//.test(l)).length;
  put(b.mirror, "second.ec", "a file the second program writes\n");
  await once(b);
  const sentSecond = b.prog.state().sent["second.ec"];
  const out = { ownAtCatch, guide, teamCounter, guideCounter, puts: b.t.log.filter(l => /^PUT b\//.test(l)).length - before,
    took: !!(sentSecond && sentSecond.counter > guideCounter), said: b.said.slice() };
  await b.ch.stop();
  return out;
}
/* A restored profile whose mirror already holds an edit of the guide its record never sent: the relay's guide is written, the
   edit is kept beside it as a conflict copy and not sent. A third profile then reads the relay's guide. */
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
  const chain = liveBy(tm, LEAD.keyId), copy = keptCopy(again.mirror);
  await again.ch.stop();
  const third = mk("own-k3");
  third.ch.start();
  await third.ch.idle();
  await once(third);
  const relayHolds = read(third.mirror, "guide.ec");
  await third.ch.stop();
  return { mirror, team, puts, chain, relayHolds, copy };
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
  const out = { keptA, atB: read(b.mirror, "guide.ec"), chain: liveBy(tm, LEAD.keyId), fromA, fromB, copyA: keptCopy(a.mirror), copyB: keptCopy(b.mirror) };
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
if (partOn("p970")) {
  try {
    markPart("p970");
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
      "970c a program's own upload, in its record, is listed in the next cycle and not fetched in that cycle, and nothing is sent or changed: listed " + k.listed + ", fetched " + k.fetched + ", uploads " + k.puts);
    const skipPlant = await liftChannel("plant:own-skip", async mod => {
      const x = await ownRecorded(mod);
      return x.listed && x.fetched > 0;
    });
    check(skipPlant.turned && skipPlant.back, "970q lifting plant:own-skip fetches the program's own upload in the cycle that lists it, and the product file is never written: "
      + skipPlant.detail + ", sha " + (skipPlant.back ? "restored" : "differs"));
    const e = await ownKeptRestore(C);
    check(e.mirror === OWN_G1 && e.copy === OWN_G2 && e.team && e.puts === 0 && e.chain === 2 && e.relayHolds === OWN_G1,
      "970d an own blob fetched on a restored profile whose mirror holds an edit its record never sent: the relay's blob is written and stays live, the edit is kept beside it as a conflict copy and goes nowhere, and a third profile reads the relay's: mirror "
      + JSON.stringify(e.mirror) + ", copy " + JSON.stringify(e.copy) + ", uploads " + e.puts + ", live blobs " + e.chain + ", the relay holds " + JSON.stringify(e.relayHolds));
    const w = await ownKeptTwo(C);
    check(w.keptA === w.fromB && w.copyA === w.fromA && w.atB === w.fromB && w.copyB === null && w.chain === 2,
      "970e the second computer's upload, met by the first's edit still waiting to go up, stays live: the first takes it, keeps its edit beside it as a conflict copy, and sends nothing over it: first " + JSON.stringify(w.keptA)
      + ", its copy " + JSON.stringify(w.copyA) + ", second " + JSON.stringify(w.atB) + ", copy at the second " + JSON.stringify(w.copyB) + ", live blobs " + w.chain);
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
    const editPlant = await liftChannel("plant:own-apart", async mod => {
      const x = await ownKeptRestore(mod), y = await ownKeptTwo(mod);
      return x.mirror === OWN_G1 && x.copy === null && y.keptA === y.fromB && y.copyA === null;
    });
    check(editPlant.turned && editPlant.back, "970i lifting plant:own-apart writes the fetched own blob over the edit waiting to go up and keeps no copy, on the restored profile and on the first computer, and the product file is never written: "
      + editPlant.detail + ", sha " + (editPlant.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the legs 970a): " + (e && e.stack ? e.stack : e));
  }
}

if (partOn("p970o")) {
  try {
    markPart("p970o");
    const c = await ownClockBehind(C);
    check(c.guide === OWN_LOW && c.teamCounter < c.guideCounter && c.ownAtCatch >= c.guideCounter && c.took && c.puts === 1,
      "970o two programs on one key, the second's clock behind the counter the relay holds: the catch-up passes over an own blob whose counter is the high one, that counter is raised, and the second's next upload is taken the first time: mirror "
      + JSON.stringify(c.guide) + ", team counter " + c.teamCounter + ", guide counter " + c.guideCounter + ", own after the catch-up " + c.ownAtCatch
      + ", uploads " + c.puts + ", taken " + c.took);
    const clockPlant = await liftChannel("plant:own-counter", async mod => {
      const x = await ownClockBehind(mod);
      return x.guide === OWN_LOW && x.ownAtCatch < x.guideCounter && !x.took
        && x.said.some(l => l.indexOf(B.REASONS["replay-counter"]) >= 0);
    });
    check(clockPlant.turned && clockPlant.back, "970p lifting plant:own-counter leaves the counter short of the blob the catch-up passed over, so the second program's upload is refused as an older copy, and the product file is never written: "
      + clockPlant.detail + ", sha " + (clockPlant.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the leg 970o): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- one key on two computers, the first offline (Studio publish B1, engine half). Both hold rev 1. The first, offline, writes
   its own rev 2 from that mirror; the second publishes its rev 2 to the relay. When the first reconnects, the relay's rev 2 stays
   live and becomes the first computer's file too, and the first computer's own rev 2 is kept beside it under a sync client's
   conflict name, said once, and never sent, a restart included. Invented editions only. ---- */
const NOR_R1 = "{\"kind\":\"etiuda-catalog\",\"rev\":1,\"note\":\"the edition both computers hold\"}\n";
const NOR_B2 = "{\"kind\":\"etiuda-catalog\",\"rev\":2,\"note\":\"published on the second computer\"}\n";
const NOR_A2 = "{\"kind\":\"etiuda-catalog\",\"rev\":2,\"note\":\"written on the first computer while it was offline\"}\n";
async function parallelOffline(mod) {
  const { tm, mk, teamText } = await ownSetup(mod);
  const a = mk("nor-a"), b = mk("nor-b");
  put(a.mirror, C.TEAM_NAME, teamText);
  put(a.mirror, "guide.ec", NOR_R1);
  a.ch.start(); b.ch.start();
  await a.ch.idle(); await b.ch.idle();
  await once(a);
  await once(b);
  const bothR1 = read(a.mirror, "guide.ec") === NOR_R1 && read(b.mirror, "guide.ec") === NOR_R1;
  a.t.down = true;
  put(a.mirror, "guide.ec", NOR_A2);
  await once(a);
  put(b.mirror, "guide.ec", NOR_B2);
  await once(b);
  a.t.down = false;
  const at = a.t.log.length;
  await once(a);
  await once(a);
  const putsBack = a.t.log.slice(at).filter(l => /^PUT b\//.test(l)).length;
  await once(b);
  const copies = fs.readdirSync(a.mirror).filter(n => n !== "guide.ec" && /\.ec$/.test(n));
  const copy = copies.length === 1 ? copies[0] : null;
  const out = { bothR1, putsBack, copies, copy, copyBytes: copy ? read(a.mirror, copy) : null, guideA: read(a.mirror, "guide.ec"),
    guideB: read(b.mirror, "guide.ec"), copyAtB: copy ? read(b.mirror, copy) : null, chain: liveBy(tm, LEAD.keyId),
    said: a.said.filter(l => l.indexOf("guide.ec") >= 0 && !!copy && l.indexOf(copy) >= 0).length };
  await a.ch.stop();
  /* The same computer started again on its record: the copy still goes nowhere. */
  const again = mk("nor-a");
  again.ch.start();
  await again.ch.idle();
  await once(again);
  out.putsRestart = putsOf(again);
  await again.ch.stop();
  await b.ch.stop();
  const third = mk("nor-c");
  third.ch.start();
  await third.ch.idle();
  await once(third);
  out.relayHolds = read(third.mirror, "guide.ec");
  out.copyAtThird = copy ? read(third.mirror, copy) : null;
  await third.ch.stop();
  /* What the program lists as kept beside the team's edition (keptApart), read from the first computer's record on a program that
     is never started, so nothing it does is sent: the copy as it was kept, the same copy edited (it would go up, so it is not
     listed), and the copy removed. */
  const listed = p => (typeof p.prog.keptApart === "function" ? p.prog.keptApart() : null);
  const fourth = mk("nor-a");
  out.listedKept = copy ? listed(fourth) : null;
  if (copy) put(fourth.mirror, copy, NOR_A2 + "edited afterwards\n");
  out.listedEdited = copy ? listed(fourth) : null;
  if (copy) fs.unlinkSync(path.join(fourth.mirror, copy));
  out.listedGone = copy ? listed(fourth) : null;
  return out;
}
/* One key on two computers, the first offline, and a root file both change: the team file (by epoch and rev) or the head (by its
   time). The first writes its edit `mine` from the file both hold; the second sends `theirs`. When the first reconnects, the newer of
   the two stands at the relay, on both computers and at a third profile, the relay's at a tie; the one passed over is said once on the
   first and kept in its record (rootClash); no conflict copy is written beside either. `kind` is "team" or "head"; for the team file
   `mine` and `theirs` are revs, and the two rosters differ by one desk each, so a tie is two different files. */
async function rootParallel(mod, kind, mine, theirs) {
  const { tm, mk, deskKey, keys, teamText } = await ownSetup(mod);
  const dA = keyPair(true), dB = keyPair(true), base = Date.now() - 60000;
  /* A desk of the team, by its own key: one following from the start, and one opened only at the end, as a joiner. */
  const deskOf = n => opened(mod, n + "-" + tm.rt.slice(0, 8), tm, deskKey, "desk:" + deskKey.keyId, { keyFor: e => keys.get(e) || null, sealEpoch: () => 1 });
  const name = kind === "head" ? HEAD_FILE : C.TEAM_NAME;
  const head = (t, ed) => headWith(tm.id, t, [{ catalog: "quay-board", rev: 2, edition: ed, published: "1 March 2026" }]);
  const first = kind === "head" ? head(base, "Quay one") : null;
  const A = kind === "head" ? head(base + mine, "Quay from the first") : teamBody(tm, 1, mine, [member(deskKey), member(dA)]);
  const Bt = kind === "head" ? head(base + theirs, "Quay from the second") : teamBody(tm, 1, theirs, [member(deskKey), member(dB)]);
  const a = mk("rp-a"), b = mk("rp-b");
  put(a.mirror, C.TEAM_NAME, teamText);
  if (first) put(a.mirror, HEAD_FILE, first);
  const dk = kind === "team" ? deskOf("rp-d") : null;
  a.ch.start(); b.ch.start();
  await a.ch.idle(); await b.ch.idle();
  await once(a);
  await once(b);
  if (dk) { dk.ch.start(); await dk.ch.idle(); await once(dk); }
  const both = kind === "head" ? read(a.mirror, HEAD_FILE) === first && read(b.mirror, HEAD_FILE) === first
    : read(a.mirror, C.TEAM_NAME) === teamText && read(b.mirror, C.TEAM_NAME) === teamText;
  a.t.down = true;
  put(a.mirror, name, A);
  await once(a);
  put(b.mirror, name, Bt);
  await once(b);
  if (dk) await once(dk);
  a.t.down = false;
  const at = a.t.log.length, said0 = a.said.length;
  await once(a);
  await once(a);
  await once(b);
  await once(a);
  if (dk) await once(dk);
  const which = v => (v === A ? "the first's" : v === Bt ? "the second's" : v === null ? "none" : "other");
  const clash = typeof a.prog.rootClash === "function" ? a.prog.rootClash() : null;
  const out = { both, atA: which(read(a.mirror, name)), atB: which(read(b.mirror, name)),
    putsBack: a.t.log.slice(at).filter(l => /^PUT b\//.test(l)).length,
    copies: fs.readdirSync(a.mirror).concat(fs.readdirSync(b.mirror)).filter(n => /conflicted copy/.test(n)),
    said: a.said.slice(said0).filter(l => l.indexOf(name) >= 0 && l.indexOf("changed on this computer and on another at once") >= 0),
    clash: clash ? clash.map(c => ({ path: c.path, kept: c.kept, here: c.here, team: c.team })) : null,
    dropped: clash ? clash.map(c => c.dropped) : null, ids: { dA: dA.keyId, dB: dB.keyId } };
  out.atDesk = dk ? which(read(dk.mirror, name)) : null;
  if (dk) await dk.ch.stop();
  await a.ch.stop(); await b.ch.stop();
  /* The first started again on its record: the clash is still there to tell, and nothing more goes up. */
  const again = mk("rp-a");
  out.clashRestart = typeof again.prog.rootClash === "function" ? again.prog.rootClash().map(c => c.path + ":" + c.kept) : null;
  const third = mk("rp-c");
  third.ch.start();
  await third.ch.idle();
  await once(third);
  out.atThird = which(read(third.mirror, name));
  await third.ch.stop();
  if (kind === "team") {
    const late = deskOf("rp-e");
    late.ch.start();
    await late.ch.idle();
    await once(late);
    out.atLateDesk = which(read(late.mirror, name));
    await late.ch.stop();
  }
  return out;
}
const rootTold = (x, path, kept, here, team) => !!x.clash && x.clash.length === 1 && x.clash[0].path === path && x.clash[0].kept === kept
  && JSON.stringify(x.clash[0].here) === JSON.stringify(here) && JSON.stringify(x.clash[0].team) === JSON.stringify(team) && x.said.length === 1
  && JSON.stringify(x.clashRestart) === JSON.stringify([path + ":" + kept]);
if (partOn("pNor")) {
  try {
    markPart("pNor");
    const n = await parallelOffline(C);
    check(n.bothR1 && n.putsBack === 0 && n.relayHolds === NOR_B2 && n.guideB === NOR_B2 && n.guideA === NOR_B2 && n.chain === 2,
      "nor1a the second computer's rev 2 stays live when the first, which wrote its own rev 2 offline from rev 1, reconnects: uploads from the first after it reconnects "
      + n.putsBack + ", the relay holds " + JSON.stringify(n.relayHolds) + ", the second's file " + JSON.stringify(n.guideB)
      + ", the first's file " + JSON.stringify(n.guideA) + ", live blobs " + n.chain);
    check(!!n.copy && n.copyBytes === NOR_A2 && /^guide \(.*conflicted copy.*\)\.ec$/.test(n.copy),
      "nor1b the first computer's own rev 2 is kept beside the live one, whole, under a sync client's conflict name of guide.ec: copies " + JSON.stringify(n.copies)
      + ", its bytes " + JSON.stringify(n.copyBytes));
    check(!!n.copy && n.copyAtB === null && n.copyAtThird === null && n.putsBack === 0 && n.putsRestart === 0,
      "nor1c the kept copy is never sent, before or after a restart: at the second computer " + JSON.stringify(n.copyAtB) + ", at a third profile "
      + JSON.stringify(n.copyAtThird) + ", uploads after reconnecting " + n.putsBack + ", after the restart " + n.putsRestart);
    check(n.said === 1, "nor1d the first computer says once that guide.ec changed on two computers and where its own copy is kept: lines " + n.said);
    check(!!n.copy && JSON.stringify(n.listedKept) === JSON.stringify([n.copy]) && JSON.stringify(n.listedEdited) === "[]" && JSON.stringify(n.listedGone) === "[]",
      "cfu2a the first computer's program lists the copy it kept, from its record after a restart, and no longer once the copy is edited (it would go up) or removed: kept "
      + JSON.stringify(n.listedKept) + ", edited " + JSON.stringify(n.listedEdited) + ", removed " + JSON.stringify(n.listedGone));
    if (PLANTS_OFF) skip("cfu2b lifting plant:kept-apart-listed lists nothing of the copy kept");
    else {
      const p = await liftChannel("plant:kept-apart-listed", async mod => { const x = await parallelOffline(mod); return !!x.copy && JSON.stringify(x.listedKept) === "[]"; });
      check(p.turned && p.back, "cfu2b lifting plant:kept-apart-listed lists nothing of the copy kept, and the product file is never written: "
        + p.detail + ", sha " + (p.back ? "restored" : "differs"));
    }
    if (PLANTS_OFF) skip("nor1e lifting plant:own-parallel sends the first computer's rev 2 over the second's");
    else {
      const p = await liftChannel("plant:own-parallel", async mod => (await parallelOffline(mod)).relayHolds === NOR_A2);
      check(p.turned && p.back, "nor1e lifting plant:own-parallel sends the first computer's rev 2 over the second's, which the relay then no longer serves, and the product file is never written: "
        + p.detail + ", sha " + (p.back ? "restored" : "differs"));
    }
    if (PLANTS_OFF) skip("nor1f lifting plant:own-apart writes the second computer's rev 2 over the first's and keeps no copy");
    else {
      const p = await liftChannel("plant:own-apart", async mod => {
        const x = await parallelOffline(mod);
        return x.relayHolds === NOR_B2 && x.guideA === NOR_B2 && x.copies.length === 0;
      });
      check(p.turned && p.back, "nor1f lifting plant:own-apart writes the second computer's rev 2 over the first's and keeps no copy, and the product file is never written: "
        + p.detail + ", sha " + (p.back ? "restored" : "differs"));
    }
    /* tse1: the team file in one epoch, by rev; tse2: the head, by its time. */
    const T = C.TEAM_NAME;
    const t1 = await rootParallel(C, "team", 2, 3);
    check(t1.both && t1.atA === "the second's" && t1.atB === "the second's" && t1.atThird === "the second's" && t1.putsBack === 0 && t1.copies.length === 0,
      "cfu3a tse1a the first computer's unsent team file at rev 2 never buries the second's rev 3 of the same epoch: the relay, the second computer and a third profile keep rev 3, the first takes it and sends nothing over it, and no copy is written: first "
      + t1.atA + ", second " + t1.atB + ", third " + t1.atThird + ", uploads after reconnecting " + t1.putsBack + ", copies " + JSON.stringify(t1.copies));
    check(rootTold(t1, T, "team", { epoch: 1, rev: 2 }, { epoch: 1, rev: 3 }),
      "tse1b the first computer's rev 2 is not silently lost: said once, and kept in its record as passed over for the team's rev 3, after a restart too: "
      + JSON.stringify({ clash: t1.clash, said: t1.said.length, restart: t1.clashRestart }));
    const t2 = await rootParallel(C, "team", 3, 3);
    check(t2.atA === "the second's" && t2.atB === "the second's" && t2.atThird === "the second's" && t2.putsBack === 0 && rootTold(t2, T, "team", { epoch: 1, rev: 3 }, { epoch: 1, rev: 3 }),
      "tse1c two different team files at the same rev: the relay's (the second's) stands everywhere, and the first's is said and kept as passed over: first "
      + t2.atA + ", second " + t2.atB + ", third " + t2.atThird + ", uploads " + t2.putsBack + ", clash " + JSON.stringify(t2.clash));
    const t3 = await rootParallel(C, "team", 4, 3);
    check(t3.atA === "the first's" && t3.atB === "the first's" && t3.atThird === "the first's" && t3.putsBack === 1 && t3.copies.length === 0
      && rootTold(t3, T, "here", { epoch: 1, rev: 4 }, { epoch: 1, rev: 3 }),
      "tse1d the first computer's unsent team file at rev 4, newer than the second's rev 3, goes up once and stands everywhere, and the second's is said and kept as passed over: first "
      + t3.atA + ", second " + t3.atB + ", third " + t3.atThird + ", uploads " + t3.putsBack + ", clash " + JSON.stringify(t3.clash));
    check(t1.atDesk === "the second's" && t1.atLateDesk === "the second's" && t3.atDesk === "the first's" && t3.atLateDesk === "the first's",
      "tse1g a desk of the team, following throughout, and a desk opened afterwards as a joiner, both hold the newer team file: rev 3 against the first's rev 2 "
      + JSON.stringify({ following: t1.atDesk, joiner: t1.atLateDesk }) + ", the first's rev 4 against rev 3 " + JSON.stringify({ following: t3.atDesk, joiner: t3.atLateDesk }));
    const h1 = await rootParallel(C, "head", 1000, 2000), h2 = await rootParallel(C, "head", 3000, 2000);
    check(h1.atA === "the second's" && h1.atB === "the second's" && h1.atThird === "the second's" && h1.putsBack === 0 && h1.clash && h1.clash.length === 1 && h1.clash[0].kept === "team" && h1.said.length === 1
      && h2.atA === "the first's" && h2.atB === "the first's" && h2.atThird === "the first's" && h2.putsBack === 1 && h2.clash && h2.clash.length === 1 && h2.clash[0].kept === "here",
      "tse2a the head both computers wrote: the newer by its time stands at the relay, on both and at a third profile, the relay's where it is the newer and the first's where it is, and the other is said and kept: older here "
      + JSON.stringify({ a: h1.atA, b: h1.atB, c: h1.atThird, puts: h1.putsBack, clash: h1.clash && h1.clash.map(c => c.kept) }) + ", newer here "
      + JSON.stringify({ a: h2.atA, b: h2.atB, c: h2.atThird, puts: h2.putsBack, clash: h2.clash && h2.clash.map(c => c.kept) }));
    if (PLANTS_OFF) {
      skip("tse1e lifting plant:own-root-newer keeps the first computer's older team file and sends it over the second's");
      skip("cfu3b lifting plant:own-edit writes the relay's older team file over the first computer's newer edit");
      skip("tse1f lifting plant:root-clash passes over the first computer's team file in silence");
    } else {
      const p1 = await liftChannel("plant:own-root-newer", async mod => (await rootParallel(mod, "team", 2, 3)).atThird === "the first's");
      check(p1.turned && p1.back, "tse1e lifting plant:own-root-newer keeps the first computer's older team file and sends it over the second's, which a third profile then reads, and the product file is never written: "
        + p1.detail + ", sha " + (p1.back ? "restored" : "differs"));
      const p2 = await liftChannel("plant:own-edit", async mod => (await rootParallel(mod, "team", 4, 3)).atA === "the second's");
      check(p2.turned && p2.back, "cfu3b lifting plant:own-edit writes the relay's older team file over the first computer's newer edit, and the product file is never written: "
        + p2.detail + ", sha " + (p2.back ? "restored" : "differs"));
      const p3 = await liftChannel("plant:root-clash", async mod => { const x = await rootParallel(mod, "team", 2, 3); return x.atA === "the second's" && x.said.length === 0 && JSON.stringify(x.clash) === "[]"; });
      check(p3.turned && p3.back, "tse1f lifting plant:root-clash passes over the first computer's team file in silence, nothing said or kept, and the product file is never written: "
        + p3.detail + ", sha " + (p3.back ? "restored" : "differs"));
    }
    if (PLANTS_OFF) skip("nor1g lifting plant:apart-kept forgets at a restart that the copy stays, so it is sent");
    else {
      const p = await liftChannel("plant:apart-kept", async mod => {
        const x = await parallelOffline(mod);
        return x.putsRestart > 0 && x.copyAtThird === NOR_A2;
      });
      check(p.turned && p.back, "nor1g lifting plant:apart-kept forgets at a restart that the copy stays, so it is sent, and the product file is never written: "
        + p.detail + ", sha " + (p.back ? "restored" : "differs"));
    }
  } catch (e) {
    check(false, "harness (the leg nor1a): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- one lead key on two computers across an epoch move (tce). The first moves the team's epoch while offline, taking one desk
   off; the second, meanwhile, edits the team file at the old epoch and sends it with a copy for each desk its roster names. When
   the first reconnects, the newer by epoch then rev stands: the relay's main team file, the second computer, each remaining desk's
   own copy and a desk restored afterwards all reach the epoch-2 file, the desk taken off is never brought back and opens none of
   it, and the second's edit is said once on the first and kept in its clash record. Keys of both epochs are made here. ---- */
async function crossEpoch(mod) {
  const LB = boxPair(), KM1 = crypto.randomBytes(32), KM2 = crypto.randomBytes(32);
  const rt = hex(16), tm = { rt, id: "t-" + hex(8) };
  const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
  if (made.status !== 200) throw new Error("a team for the cross-epoch leg was not made: " + JSON.stringify(made.json));
  let devRev = 0;
  const enrol = async (...ks) => {
    devRev++;
    const list = ks.map(k => ({ id: k.keyId, pub: k.pub, desk: k.keyId })), t = R.clock.now;
    return admin("POST", "/relay/v1/t/" + rt + "/devices", { keys: list, rev: devRev, t, sig: signHex(LEAD, core.devicesBytes(rt, devRev, t, list)) });
  };
  const tag = rt.slice(0, 8);
  const pinOf = () => ({ teamId: tm.id, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } });
  const doc = (epoch, rev, roster) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: tm.id, catalogs: ["quay-board"],
    lead: { keyId: LEAD.keyId, public: LEAD.pub, box: LB.pub }, sealed: true, exportsSealed: false, epoch, rev,
    channel: { kind: "relay", rt, url: URLV1 }, ring: RING, roster }, LEAD), null, 1) + "\n";
  const entry = (d, key, epoch) => ({ desk: { id: d.k.keyId, key: d.k.pub, box: d.box.pub }, wrap: wrapFor(key, d.box.pub, tm.id, epoch, d.k.keyId) });
  const desk = () => ({ k: keyPair(true), box: boxPair() });
  const D1 = desk(), D2 = desk(), D3 = desk(), D4 = desk();
  /* A computer of the lead's key: the one box, keys held by epoch, sealing under the newest. */
  const leadOf = (name, held) => Object.assign(program(name + "-" + tag, LEAD, "root", { mod, rt, pin: pinOf, keyFor: e => held.get(e) || null,
    sealEpoch: () => Math.max(...held.keys()), agree: agreeWith(LB) }), { held });
  /* A desk: its own box, and its onTeam taking the key from its own wrap. */
  const deskOf = (name, d, start) => {
    const held = new Map(start || [[1, KM1]]), mirror = path.join(LAB, name + "-" + tag);
    const heed = () => {
      let t = null;
      try { t = JSON.parse(read(mirror, C.TEAM_NAME)); } catch { return; }
      const mine = t && Array.isArray(t.roster) ? t.roster.find(r => r && r.desk && r.desk.id === d.k.keyId) : null;
      const key = mine ? unwrapWith(d.box, mine.wrap, tm.id, t.epoch, d.k.keyId) : null;
      if (key) held.set(t.epoch, key);
    };
    return Object.assign(program(name + "-" + tag, d.k, "desk:" + d.k.keyId, { mod, rt, pin: pinOf, watch: false,
      me: () => ({ keyId: d.k.keyId, public: d.k.pub, privateKey: d.k.privateKey, place: "desk:" + d.k.keyId, box: d.box.pub }),
      keyFor: e => held.get(e) || null, sealEpoch: () => Math.max(...held.keys()), agree: agreeWith(d.box), onTeam: heed }), { held });
  };
  const of = text => { try { const t = JSON.parse(text); return { epoch: t.epoch, rev: t.rev, d3: t.roster.some(r => r.desk.id === D3.k.keyId), d4: t.roster.some(r => r.desk.id === D4.k.keyId) }; } catch { return null; } };
  const at = p => of(read(p.mirror, C.TEAM_NAME));
  await enrol(D1.k, D2.k, D3.k);
  const ONE = doc(1, 1, [entry(D1, KM1, 1), entry(D2, KM1, 1), entry(D3, KM1, 1)]);
  const a = leadOf("tce-a", new Map([[1, KM1]])), b = leadOf("tce-b", new Map([[1, KM1]]));
  const d1 = deskOf("tce-d1", D1), d2 = deskOf("tce-d2", D2), d3 = deskOf("tce-d3", D3);
  put(a.mirror, C.TEAM_NAME, ONE);
  a.ch.start(); await settle(a);
  b.ch.start(); await settle(b);
  d1.ch.start(); d2.ch.start(); d3.ch.start();
  await settle(d1, d2, d3);
  const allOne = [a, b, d1, d2, d3].every(p => read(p.mirror, C.TEAM_NAME) === ONE);
  /* The first, offline, takes D3 off: a new key, a roster without D3. */
  a.t.down = true;
  a.held.set(2, KM2);
  const MOVED = doc(2, 1, [entry(D1, KM2, 2), entry(D2, KM2, 2)]);
  put(a.mirror, C.TEAM_NAME, MOVED);
  await settle(a);
  /* The second, at the old epoch, adds D4 and sends it, with a copy for each desk its roster names. */
  const EDIT = doc(1, 2, [entry(D1, KM1, 1), entry(D2, KM1, 1), entry(D3, KM1, 1), entry(D4, KM1, 1)]);
  put(b.mirror, C.TEAM_NAME, EDIT);
  await settle(b);
  await settle(d1, d2, d3);
  const tookEdit = [d1, d2, d3].map(p => at(p));
  /* The first reconnects. Its Studio sends the device list of the newer file; the second's Studio holds the epoch-2 key, as the
     lead's own records give it (outside the channel). */
  a.t.down = false;
  await enrol(D1.k, D2.k);
  b.held.set(2, KM2);
  const said0 = a.said.length, puts0 = a.t.log.length;
  await settle(a);
  await settle(b);
  await settle(d1, d2, d3);
  await settle(a, b, d1, d2, d3);
  const clash = typeof a.prog.rootClash === "function" ? a.prog.rootClash().map(c => ({ path: c.path, kept: c.kept, here: c.here, team: c.team, dropped: c.dropped })) : null;
  const out = { allOne, tookEdit, atA: at(a), atB: at(b), atD1: at(d1), atD2: at(d2), atD3: at(d3), d3Key2: !!d3.held.get(2),
    d1Key2: !!d1.held.get(2), d2Key2: !!d2.held.get(2), clash,
    said: a.said.slice(said0).filter(l => l.indexOf(C.TEAM_NAME) >= 0 && l.indexOf("changed on this computer and on another at once") >= 0),
    waitsA: a.said.slice(said0).filter(l => l.indexOf(B.REASONS.superseded) >= 0).length,
    putsBack: a.t.log.slice(puts0).filter(l => /^PUT b\//.test(l)).length };
  /* A desk's upload after the reconnect is taken, sealed at the new epoch, and reaches the lead. */
  const NOTE = "{\"inUse\":\"quay-board after the move\"}\n";
  const d1s = d1.said.length;
  put(d1.mirror, "desks/" + D1.k.keyId + "/in-use.ec", NOTE);
  await settle(d1);
  await settle(a);
  out.deskUp = read(a.mirror, "desks/" + D1.k.keyId + "/in-use.ec") === NOTE;
  out.deskRefused = d1.said.slice(d1s).length;
  await a.ch.stop(); await b.ch.stop(); await d1.ch.stop(); await d2.ch.stop(); await d3.ch.stop();
  /* The first started again on its record: the clash is still there to tell, and nothing more goes up. */
  const again = leadOf("tce-a", new Map([[1, KM1], [2, KM2]]));
  out.clashRestart = typeof again.prog.rootClash === "function" ? again.prog.rootClash().map(c => c.path + ":" + c.kept) : null;
  out.droppedRestart = typeof again.prog.rootClash === "function" ? again.prog.rootClash().map(c => c.dropped) : null;
  out.ids = { d3: D3.k.keyId, d4: D4.k.keyId };
  /* The relay's main team file, read by a fresh profile of the lead's key holding both keys, which makes no desk's copy. */
  const third = Object.assign(program("tce-c-" + tag, LEAD, "root", { mod, rt, pin: pinOf, keyFor: e => (e === 1 ? KM1 : e === 2 ? KM2 : null),
    sealEpoch: () => 2 }), {});
  third.ch.start(); await settle(third);
  out.atRelay = at(third);
  await third.ch.stop();
  /* A desk opened afterwards on a fresh profile, holding both keys as its own records would, reads the relay's main team file. */
  const late = deskOf("tce-d2r", D2, [[1, KM1], [2, KM2]]);
  late.ch.start(); await settle(late);
  out.atLate = at(late);
  await late.ch.stop();
  /* The second computer, started again, is not left out of step: its next edit, made as its Studio makes one from the team file
     it holds (the next rev, D4 added back), goes up and stands at the relay. */
  const b2 = leadOf("tce-b", new Map([[1, KM1], [2, KM2]]));
  b2.ch.start(); await settle(b2);
  let hold = null;
  try { hold = JSON.parse(read(b2.mirror, C.TEAM_NAME)); } catch { hold = null; }
  if (hold) {
    const k = hold.epoch === 2 ? KM2 : KM1, keep = hold.roster.filter(r => r.desk.id !== D4.k.keyId).map(r => [D1, D2, D3].find(d => d.k.keyId === r.desk.id));
    put(b2.mirror, C.TEAM_NAME, doc(hold.epoch, hold.rev + 1, keep.map(d => entry(d, k, hold.epoch)).concat([entry(D4, k, hold.epoch)])));
  }
  await settle(b2);
  out.bNextWaits = b2.said.filter(l => l.indexOf(C.TEAM_NAME) >= 0 && l.indexOf("waits") >= 0).length;
  await b2.ch.stop();
  const fourth = program("tce-f-" + tag, LEAD, "root", { mod, rt, pin: pinOf, keyFor: e => (e === 1 ? KM1 : e === 2 ? KM2 : null), sealEpoch: () => 2 });
  fourth.ch.start(); await settle(fourth);
  out.atRelayNext = at(fourth);
  await fourth.ch.stop();
  return out;
}
/* The control: one computer of the lead's key that sent its epoch-2 team file. An own team file at epoch 1, later by its counter,
   that the relay serves afterwards is older than the last sent, so it is refused as before, the mirror keeps epoch 2, nothing is
   sent and nothing is kept as a clash. */
async function crossEpochSent(mod) {
  const KM1 = crypto.randomBytes(32), KM2 = crypto.randomBytes(32), D = keyPair(true);
  const tm = await freshTeam([D]);
  const held = new Map([[1, KM1]]);
  const a = opened(mod, "tce-s-" + tm.rt.slice(0, 8), tm, LEAD, "root", { keyFor: e => held.get(e) || null, sealEpoch: () => Math.max(...held.keys()) });
  put(a.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(D)]));
  a.ch.start(); await a.ch.idle(); await once(a);
  held.set(2, KM2);
  const MOVED = teamBody(tm, 2, 1, [member(D)]);
  put(a.mirror, C.TEAM_NAME, MOVED);
  await once(a);
  const sentAt2 = a.prog.state().sent[C.TEAM_NAME] && a.prog.state().sent[C.TEAM_NAME].epoch === 2;
  const b = B.seal({ relayTeamId: tm.rt, epoch: 1, teamKey: KM1, writer: { keyId: LEAD.keyId, privateKey: LEAD.privateKey }, path: C.TEAM_NAME,
    body: teamBody(tm, 1, 2, [member(D)]), counter: Date.now() + 5e6, kind: "file" });
  const s = relayStore(tm.rt), seq = (s.get("seq") || 0) + 1, obj = tm.rt + "/" + b.id + "/" + hex(8);
  R.bucket.objects.set(obj, Buffer.from(b.ciphertext));
  s.put("blob:" + b.id, { id: b.id, supersedes: null, epoch: 1, writer: LEAD.keyId, counter: b.counter, del: false, size: b.ciphertext.length,
    sig: b.signature, nonce: b.nonce, seq, at: R.clock.now, obj });
  s.put("seq:" + String(seq).padStart(16, "0"), b.id);
  s.put("seq", seq);
  const at = a.t.log.length, said0 = a.said.length;
  await once(a); await once(a);
  const out = { sentAt2, fetched: a.t.log.slice(at).some(l => l === "GET b/" + b.id), kept: read(a.mirror, C.TEAM_NAME) === MOVED,
    puts: a.t.log.slice(at).filter(l => /^PUT b\//.test(l)).length, clash: a.prog.rootClash ? a.prog.rootClash().length : null,
    replay: a.said.slice(said0).some(l => l.indexOf(B.REASONS["replay-rev"]) >= 0) };
  await a.ch.stop();
  return out;
}
if (partOn("pTce")) {
  try {
    markPart("pTce");
    const T = C.TEAM_NAME;
    const x = await crossEpoch(C);
    const two = o => !!o && o.epoch === 2 && o.rev === 1 && o.d3 === false;
    check(x.allOne && JSON.stringify(x.tookEdit.map(o => o && o.rev)) === "[2,2,2]" && two(x.atA) && two(x.atRelay) && two(x.atB) && two(x.atD1) && two(x.atD2)
      && x.putsBack >= 1 && x.waitsA === 0,
      "tce1a the first computer's epoch move, made offline while the second edited the team file at the old epoch, stands after the reconnect: the relay's main team file, the second computer and each remaining desk hold epoch 2 rev 1: "
      + JSON.stringify({ first: x.atA, relay: x.atRelay, second: x.atB, d1: x.atD1, d2: x.atD2, uploads: x.putsBack, waits: x.waitsA }));
    const files = [x.atA, x.atRelay, x.atB, x.atD1, x.atD2, x.atLate];
    check(files.every(o => !!o && o.d3 === false) && !x.d3Key2 && !!x.atD3 && x.atD3.epoch === 1,
      "tce1b the desk the newer file took off is not brought back: no file the relay, either computer or a remaining desk holds names it, and it holds no epoch-2 key: "
      + JSON.stringify({ names: files.map(o => o && o.d3), key: x.d3Key2, itsFile: x.atD3 }));
    check(rootTold(x, T, "here", { epoch: 2, rev: 1 }, { epoch: 1, rev: 2 }),
      "tce1c the second computer's edit at the old epoch, passed over, is said once on the first and kept in its clash record, after a restart too: "
      + JSON.stringify({ clash: x.clash, said: x.said.length, restart: x.clashRestart }));
    check(x.d1Key2 && x.d2Key2 && x.deskUp && x.deskRefused === 0 && two(x.atLate),
      "tce1d each remaining desk takes the epoch-2 key from its own copy and its upload afterwards reaches the lead, and a desk opened afterwards reads epoch 2 from the relay: "
      + JSON.stringify({ d1Key: x.d1Key2, d2Key: x.d2Key2, upload: x.deskUp, said: x.deskRefused, late: x.atLate }));
    const same = await rootParallel(C, "team", 3, 3);
    check(JSON.stringify(x.clash && x.clash.map(c => c.dropped)) === JSON.stringify([[x.ids.d3, x.ids.d4].sort()])
      && JSON.stringify(x.droppedRestart) === JSON.stringify([[x.ids.d3, x.ids.d4].sort()])
      && JSON.stringify(same.dropped) === JSON.stringify([[same.ids.dA]]),
      "tce1h the clash record names each member the passed-over file has and the standing one does not, so a member the second computer added is not withdrawn in silence: across the move "
      + JSON.stringify({ dropped: x.clash && x.clash.map(c => c.dropped), restart: x.droppedRestart, want: [x.ids.d3, x.ids.d4].sort() })
      + ", two files at one rev " + JSON.stringify({ dropped: same.dropped, want: [same.ids.dA] }));
    const nx = x.atRelayNext;
    check(!!nx && nx.epoch === 2 && nx.rev === 2 && nx.d4 === true && nx.d3 === false && x.bNextWaits === 0,
      "tce1g the second computer is not left out of step: started again, its next edit, made from the team file it holds, goes up and stands at the relay at epoch 2, without the desk taken off: "
      + JSON.stringify({ relay: nx, waits: x.bNextWaits }));
    const c = await crossEpochSent(C);
    check(c.sentAt2 && c.fetched && c.kept && c.puts === 0 && c.clash === 0 && c.replay,
      "tce1f the control: an own epoch-1 team file the relay serves after this computer sent epoch 2 is refused as before, the mirror keeps epoch 2, nothing is sent or kept as a clash: "
      + JSON.stringify(c));
    if (PLANTS_OFF) skip("tce1i lifting plant:clash-dropped keeps no member of the passed-over file");
    else {
      const p = await liftChannel("plant:clash-dropped", async mod => { const y = await crossEpoch(mod); return !!y.clash && y.clash.length === 1 && y.clash[0].dropped === undefined; });
      check(p.turned && p.back, "tce1i lifting plant:clash-dropped keeps no member of the passed-over file in the clash record, and the product file is never written: "
        + p.detail + ", sha " + (p.back ? "restored" : "differs"));
    }
    if (PLANTS_OFF) skip("tce1e lifting plant:own-epoch-ahead leaves the relay's main team file at the old epoch");
    else {
      const p = await liftChannel("plant:own-epoch-ahead", async mod => { const y = await crossEpoch(mod); return !!y.atRelay && y.atRelay.epoch === 1 && y.atB.epoch === 1; });
      check(p.turned && p.back, "tce1e lifting plant:own-epoch-ahead leaves the relay's main team file and the second computer at the old epoch, and the product file is never written: "
        + p.detail + ", sha " + (p.back ? "restored" : "differs"));
    }
  } catch (e) {
    check(false, "harness (the legs tce1a): " + (e && e.stack ? e.stack : e));
  }
}

/* The lead's answer is not on the list (relay/core.cjs since drops an answer place). Its counter still raises the
   writer's floor. A second program on the same key, its clock behind that counter, learns only the counters the list
   serves. 970o is taken on the first upload because the high counter is on a blob the catch-up opens. Here the clock
   stays below that floor, so a retry cannot take the upload. That is the known limit until the relay names the floor. */
async function answerFloor(mod) {
  const low = 1000, high = 10000000;
  let clock = low;
  const teamKey = crypto.randomBytes(32);
  const tm = await freshTeam([]);
  const tag = tm.rt.slice(0, 8);
  const box = boxPair();
  const a = opened(mod, "ans-a-" + tag, tm, LEAD, "root", {
    clock: () => clock, agree: () => Buffer.alloc(32, 7), keyFor: () => teamKey, sealEpoch: () => 1,
    me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root", box: box.pub }),
  });
  let b = null;
  const out = { ans: null, teamCounter: 0, floor: 0, ownAtCatch: 0, tookFirst: false, tookSecond: false, said: [] };
  try {
    put(a.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, []));
    a.ch.start();
    await a.ch.idle();
    await once(a);
    const sentTeam = a.prog.state().sent[C.TEAM_NAME];
    out.teamCounter = sentTeam ? sentTeam.counter : 0;
    clock = high;
    out.ans = await a.ch.writeAnswer({ inv: hex(16), deskId: "k-" + "ab".repeat(8), deskBox: "cd".repeat(32),
      leadBox: box.pub, answer: "joined" });
    const counters = relayStore(tm.rt).get("counters") || {};
    out.floor = Number(counters["c\n" + LEAD.keyId + "\n1"]) || 0;
    await a.ch.stop();
    b = opened(mod, "ans-b-" + tag, tm, LEAD, "root", {
      clock: () => low, keyFor: () => teamKey, sealEpoch: () => 1,
    });
    b.ch.start();
    await b.ch.idle();
    out.ownAtCatch = b.prog.state().own;
    put(b.mirror, "second.ec", "a file the second program writes\n");
    await once(b);
    const first = b.prog.state().sent["second.ec"];
    out.tookFirst = !!(first && first.counter > out.floor);
    await once(b);
    const second = b.prog.state().sent["second.ec"];
    out.tookSecond = !!(second && second.counter > out.floor);
    out.said = b.said.slice();
  } finally {
    try { await a.ch.stop(); } catch { /* already stopped */ }
    if (b) try { await b.ch.stop(); } catch { /* already stopped */ }
  }
  return out;
}
if (partOn("p970r")) {
  try {
    markPart("p970r");
    const c = await answerFloor(C);
    const replay = c.said.some(l => l.indexOf(B.REASONS["replay-counter"]) >= 0);
    check(c.ans && c.ans.ok === true && c.floor > c.teamCounter && c.ownAtCatch >= c.teamCounter && c.ownAtCatch < c.floor && !c.tookFirst && c.tookSecond,
      "970r the relay names the floor: an answer the list does not serve raises it, the first upload cycle takes the floor from the refusal, and the next cycle clears the retry: answer "
      + (c.ans && c.ans.ok ? "written" : (c.ans && c.ans.reason) || "none")
      + ", team counter " + c.teamCounter + ", floor " + c.floor + ", own after the catch-up " + c.ownAtCatch
      + ", first cycle " + (c.tookFirst ? "taken" : "refused") + ", next cycle " + (c.tookSecond ? "taken" : "refused")
      + (replay ? ", said replay-counter" : ""));
  } catch (e) {
    check(false, "harness (the leg 970r): " + (e && e.stack ? e.stack : e));
  }
}


/* A replay-counter refusal whose next seal clears the floor. The clock stays put, as 970o does, so the seal climbs by one.
   The mirror is not edited again and no socket note arrives. The channel's own timer, one per channel and inside a minute,
   is run when it is armed, so the wait is not spent on the wall. */

  const COUNTER_MINUTE_MS = 60 * 1000;
function mirrorSnap(dir) {
  return filesUnder(dir).map(f => path.relative(dir, f).split(path.sep).join("/") + " " + sha(fs.readFileSync(f))).sort().join("\n");
}
function putFloor(rt, writer, value) {
  const s = relayStore(rt), cur = s.get("counters") || {}, next = {};
  for (const k of Object.keys(cur)) next[k] = cur[k];
  next["c\n" + writer + "\n1"] = value;
  s.put("counters", next);
}
async function withMinute(run) {
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout, bag = [];
  globalThis.setTimeout = (fn, ms, ...rest) => {
    const id = realSet(fn, ms, ...rest);
    bag.push({ id: id, fn: fn, ms: ms, dead: false });
    return id;
  };
  globalThis.clearTimeout = id => {
    bag.forEach(t => { if (t.id === id) t.dead = true; });
    return realClear(id);
  };
  const pending = from => bag.filter((t, i) => i >= from && !t.dead && t.ms > 0 && t.ms <= COUNTER_MINUTE_MS);
  const fire = t => { t.dead = true; realClear(t.id); t.fn(); };
  try { return await run({ pending, fire, mark: () => bag.length }); }
  finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
}
async function counterRetry(mod, kind) {
  const clock = 1000, teamKey = crypto.randomBytes(32), box = boxPair();
  const tm = await freshTeam([]);
  const tag = tm.rt.slice(0, 8), inv = hex(16), name = "cr-" + kind + "-" + tag;
  const t = transport(name);
  let notes = 0;
  const connect = (url, headers, on) => t.connect(url, headers, {
    message(text) {
      let m = null;
      try { m = JSON.parse(String(text)); } catch { m = null; }
      if (m && m.type === "new") notes += 1;
      on.message(text);
    },
    close() { on.close(); },
  });
  const desk = opened(mod, name, tm, LEAD, "root", {
    clock: () => clock, keyFor: () => teamKey, sealEpoch: () => 1, agree: () => Buffer.alloc(32, 7),
    request: t.request, connect,
    me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root", box: box.pub }),
  });
  const out = { refused: false, took: false, delay: [], notes: 0, mirrorSame: false, open: false, floor: 0, own: 0, counter: null, still: -1 };
  try {
    return await withMinute(async ({ pending, fire, mark }) => {
      put(desk.mirror, mod.TEAM_NAME, teamBody(tm, 1, 1, []));
      desk.ch.start();
      await desk.ch.idle();
      await until(() => desk.ch.socketOpen(), 30000);
      const raised = desk.prog.state().own + 1;
      putFloor(tm.rt, LEAD.keyId, raised);
      out.floor = raised;
      if (kind === "file") put(desk.mirror, "owed.ec", "a file the desk still owes\n");
      /* Timers armed by the refusal itself, not the waits that opened the socket. */
      const marked = mark();
      if (kind === "answer") {
        const first = await desk.ch.writeAnswer({ inv, deskId: "k-" + "ab".repeat(8), deskBox: "cd".repeat(32),
          leadBox: box.pub, answer: "joined" });
        out.refused = !!(first && first.ok !== true && first.reason === "replay-counter");
      } else {
        desk.ch.kick();
        await desk.ch.idle();
        const sent = desk.prog.state().sent["owed.ec"];
        out.refused = !sent && desk.said.some(l => l.indexOf(B.REASONS["replay-counter"]) >= 0);
      }
      out.own = desk.prog.state().own;
      out.open = desk.ch.socketOpen() === true;
      const armed = pending(marked);
      out.delay = armed.map(row => row.ms);
      const snap = mirrorSnap(desk.mirror);
      if (armed.length === 1) { fire(armed[0]); await desk.ch.idle(); }
      out.mirrorSame = mirrorSnap(desk.mirror) === snap;
      out.notes = notes;
      out.still = pending(marked).length;
      if (kind === "answer") {
        const rec = relayStore(tm.rt).get("blob:" + inv);
        out.counter = rec ? rec.counter : null;
      } else {
        const sent = desk.prog.state().sent["owed.ec"];
        out.counter = sent ? sent.counter : null;
      }
      out.took = typeof out.counter === "number" && out.counter > out.floor;
      return out;
    });
  } catch (e) {
    out.threw = e && e.stack ? e.stack : String(e);
    return out;
  } finally {
    try { await desk.ch.stop(); } catch { /* already stopped */ }
  }
}
function counterTold(x) {
  if (x && x.threw) return "threw " + String(x.threw).split("\n")[0];
  return "refused " + !!(x && x.refused) + ", delay " + JSON.stringify(x && x.delay) + ", mirror " + (x && x.mirrorSame ? "unchanged" : "changed")
    + ", socket " + (x && x.open ? "open" : "shut") + ", notes " + (x && x.notes) + ", still " + (x && x.still)
    + ", floor " + (x && x.floor) + ", own " + (x && x.own) + ", counter " + (x && x.counter) + ", taken " + !!(x && x.took);
}
if (partOn("p970s")) {
  try {
    markPart("p970s");
    const x = await counterRetry(C, "file");
    check(!x.threw && x.refused && x.own === x.floor && x.took && x.mirrorSame && x.notes === 0 && x.open
      && x.delay.length === 1 && x.delay[0] > 0 && x.delay[0] <= COUNTER_MINUTE_MS && x.still === 0,
      "970s a refused upload whose next seal clears the counter is sent within a minute, with the mirror unchanged and no socket note: " + counterTold(x));
    const planted = await liftChannel("plant:counter-retry", async mod => {
      const y = await counterRetry(mod, "file");
      return !y.threw && y.refused && y.notes === 0 && y.mirrorSame && !y.took;
    });
    check(planted.turned && planted.back, "970t lifting plant:counter-retry leaves that upload refused, and the product file is never written: "
      + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the leg 970s): " + (e && e.stack ? e.stack : e));
  }
}
if (partOn("p970u")) {
  try {
    markPart("p970u");
    const x = await counterRetry(C, "answer");
    check(!x.threw && x.refused && x.own === x.floor && x.took && x.mirrorSame && x.notes === 0 && x.open
      && x.delay.length === 1 && x.delay[0] > 0 && x.delay[0] <= COUNTER_MINUTE_MS && x.still === 0,
      "970u an invitation's answer refused replay-counter is sent again within a minute, with the mirror unchanged and no socket note: " + counterTold(x));
    const planted = await liftChannel("plant:answer-retry", async mod => {
      const y = await counterRetry(mod, "answer");
      return !y.threw && y.refused && y.notes === 0 && y.mirrorSame && !y.took;
    });
    check(planted.turned && planted.back, "970v lifting plant:answer-retry leaves that answer refused, and the product file is never written: "
      + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the leg 970u): " + (e && e.stack ? e.stack : e));
  }
}
async function floorPastBound(mod) {
  const clock = 1000, teamKey = crypto.randomBytes(32);
  const tm = await freshTeam([]);
  const tag = tm.rt.slice(0, 8), name = "fpb-" + tag;
  const t = transport(name);
  const desk = opened(mod, name, tm, LEAD, "root", {
    clock: () => clock, keyFor: () => teamKey, sealEpoch: () => 1,
    request: t.request,
    me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }),
  });
  const out = { refused: false, ownBefore: 0, ownAfter: 0, saidBound: false };
  try {
    put(desk.mirror, mod.TEAM_NAME, teamBody(tm, 1, 1, []));
    desk.ch.start();
    await desk.ch.idle();
    out.ownBefore = desk.prog.state().own;
    putFloor(tm.rt, LEAD.keyId, Number.MAX_SAFE_INTEGER - 10);
    put(desk.mirror, "owed.ec", "a file\n");
    desk.ch.kick();
    await desk.ch.idle();
    out.ownAfter = desk.prog.state().own;
    out.saidBound = desk.said.some(l => l.indexOf("the relay named a counter floor beyond what this desk accepts, so it was not taken") >= 0);
    out.refused = !desk.prog.state().sent["owed.ec"] && desk.said.some(l => l.indexOf(B.REASONS["replay-counter"]) >= 0);
  } finally {
    try { await desk.ch.stop(); } catch { /* already stopped */ }
  }
  return out;
}
if (partOn("p970w")) {
  try {
    markPart("p970w");
    const x = await floorPastBound(C);
    check(x.refused && x.ownAfter === x.ownBefore + 1 && x.ownAfter < Number.MAX_SAFE_INTEGER - 10 && x.saidBound,
      "970w a floor past the bound leaves the counter unchanged by the refusal, and is refused and said: before "
      + x.ownBefore + ", after " + x.ownAfter + ", said " + x.saidBound);
    const planted = await liftChannel("plant:floor-bound", async mod => {
      const y = await floorPastBound(mod);
      return y.ownAfter === Number.MAX_SAFE_INTEGER - 10;
    });
    check(planted.turned && planted.back, "970x lifting plant:floor-bound takes the floor past the bound into the counter, and the product file is never written: "
      + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the leg 970w): " + (e && e.stack ? e.stack : e));
  }
}
async function floorlessBackoff(mod) {
  const clock = 1000, teamKey = crypto.randomBytes(32);
  const tm = await freshTeam([]);
  const tag = tm.rt.slice(0, 8), name = "flb-" + tag;
  const t = transport(name);
  const desk = opened(mod, name, tm, LEAD, "root", {
    clock: () => clock, keyFor: () => teamKey, sealEpoch: () => 1,
    request: t.request,
    me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root" }),
  });
  const out = { delays: [], pendingAfterThird: -1 };
  try {
    return await withMinute(async ({ pending, fire, mark }) => {
      put(desk.mirror, mod.TEAM_NAME, teamBody(tm, 1, 1, []));
      desk.ch.start();
      await desk.ch.idle();
      putFloor(tm.rt, LEAD.keyId, Number.MAX_SAFE_INTEGER - 10);
      put(desk.mirror, "owed.ec", "a file\n");
      let marked = mark();
      desk.ch.kick();
      await desk.ch.idle();
      for (let i = 0; i < 3; i++) {
        const armed = pending(marked);
        if (armed.length === 1) {
          out.delays.push(armed[0].ms);
          if (i < 2) {
            marked = mark();
            fire(armed[0]);
            await desk.ch.idle();
          }
        }
      }
      out.pendingAfterThird = pending(marked).length;
      return out;
    });
  } finally {
    try { await desk.ch.stop(); } catch { /* already stopped */ }
  }
}
if (partOn("p970y")) {
  try {
    markPart("p970y");
    const x = await floorlessBackoff(C);
    check(x.delays.length === 2 && x.delays[0] === COUNTER_MINUTE_MS && x.delays[1] === COUNTER_MINUTE_MS && x.pendingAfterThird === 0,
      "970y three floorless replay-counter refusals set no timer after three tries, so the desk stops until the next kick: delays "
      + JSON.stringify(x.delays) + ", pending after third " + x.pendingAfterThird);
    const planted = await liftChannel("plant:counter-backoff", async mod => {
      const y = await floorlessBackoff(mod);
      return y.pendingAfterThird === 1;
    });
    check(planted.turned && planted.back, "970z lifting plant:counter-backoff leaves a counter timer pending after three tries, and the product file is never written: "
      + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the leg 970y): " + (e && e.stack ? e.stack : e));
  }
}

/* An invitation's one upload whose reply never came back. The next cycle is told the token is spent, which is that upload
   already held: it counts as sent, the wrap is forgotten, and the cycle after reads the answer. */
async function lostReply(mod, label) {
  const rt = hex(16), who = keyPair(true), seal = crypto.randomBytes(32), inv = hex(16), token = hex(32);
  const mirror = path.join(LAB, label), stateFile = path.join(LAB, label + ".json");
  const n = { put: 0, since: 0, answer: 0, gone: 0 };
  const request = async (method, url, headers, body) => {
    const u = String(url);
    const json = (obj, status) => ({ status: status || 200, header: () => null, bytes: Buffer.from(JSON.stringify(obj)) });
    if (method === "POST" && u.endsWith("/hello")) return json({ challenge: hex(16) });
    if (method === "POST" && u.endsWith("/session")) {
      const asked = JSON.parse(Buffer.from(body).toString("utf8"));
      if (asked.invite) return json({ session: hex(32) });
      return json({ session: hex(32), invite: true });
    }
    if (method === "GET" && u.indexOf("/since/") >= 0) {
      n.since += 1;
      if (n.put >= 1) return json({ error: "not-enrolled" }, 403);
      return json([]);
    }
    if (method === "PUT") {
      n.put += 1;
      if (n.put === 1) return { status: 0, header: () => null, bytes: Buffer.alloc(0) };
      return json({ error: "token-spent" }, 403);
    }
    if (method === "GET" && u.endsWith("/b/" + inv)) { n.answer += 1; return json({ error: "missing" }, 404); }
    return json({ error: "missing" }, 404);
  };
  put(mirror, "desks/" + who.keyId + "/join.json", "{\"kind\":\"etiuda-join-request\"}\n");
  const ch = mod.createChannel({ rt, url: URLV1, mirror, stateFile, watch: false, pollMs: 1e9,
    pin: () => ({ teamId: "t-lost-reply", rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
    me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place: "desk:" + who.keyId, box: hex(32) }),
    invite: () => ({ inv, token, seal }),
    onWrapGone: () => { n.gone += 1; },
    keyFor: () => null, sealEpoch: () => null, request, connect: null });
  ch.start();
  await ch.idle();
  ch.kick();
  await ch.idle();
  const sinceAtSent = n.since;
  ch.kick();
  await ch.idle();
  const marked = ch.program.state().invited === true && ch.program.inviteSent(inv) === true;
  await ch.stop();
  return { put: n.put, sinceAfter: n.since - sinceAtSent, answer: n.answer, gone: n.gone, marked };
}
if (partOn("p966f")) {
  try {
    markPart("p966f");
    const lost = await lostReply(C, "lost-reply");
    check(lost.put === 2 && lost.sinceAfter === 0 && lost.answer === 1 && lost.marked && lost.gone === 1,
      "966f an upload refused token-spent on the invitation's own session, after a send whose reply was lost, is counted as sent: the wrap is forgotten, the request is marked and the answer is read: uploads "
      + lost.put + ", since after it was marked " + lost.sinceAfter + ", answer reads " + lost.answer + ", wrap forgotten " + lost.gone + ", marked " + lost.marked);
    const spentPlant = await liftChannel("plant:spent-sent", async mod => {
      const x = await lostReply(mod, "lost-reply-plant");
      return !x.marked && x.answer === 0 && x.gone === 0;
    });
    check(spentPlant.turned && spentPlant.back, "966g lifting plant:spent-sent leaves that refusal a halt, so the request is not marked, the wrap is kept and the answer is not read, and the product file is never written: "
      + spentPlant.detail + ", sha " + (spentPlant.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the leg 966f): " + (e && e.stack ? e.stack : e));
  }
}

/* The same lost reply, driven through the relay's own core. The first upload lands and its reply is dropped, and so is
   each further reply up to `losses`; the next answer is token-spent and is counted as sent. Cancel then removes the
   request, and the withdrawal is admitted only where the id recorded as sent is the one the relay holds as asked. */
async function lostWithdraw(mod, label, losses) {
  const rt = hex(16), who = keyPair(true), secret = hex(16), inv = hex(16), token = hex(32);
  const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
  if (made.status !== 200) throw new Error("a team was not made: " + JSON.stringify(made.json));
  const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }], at = R.clock.now;
  const reg = await admin("POST", "/relay/v1/t/" + rt + "/invites", { add, drop: [], t: at,
    sig: signHex(LEAD, core.invitesBytes(rt, at, add, [])) });
  if (reg.status !== 200) throw new Error("an invitation was not registered: " + JSON.stringify(reg.json));
  const rel = "desks/" + who.keyId + "/join.json";
  const mirror = path.join(LAB, label);
  const t = transport(label);
  let dropped = 0;
  const request = async (method, url, headers, body) => {
    const res = await t.request(method, url, headers, body);
    if (method === "PUT" && dropped < losses) { dropped += 1; return { status: 0, header: () => null, bytes: Buffer.alloc(0) }; }
    return res;
  };
  put(mirror, rel, "{\"kind\":\"etiuda-join-request\"}\n");
  const ch = mod.createChannel({
    rt, url: URLV1, mirror, stateFile: path.join(LAB, label + ".json"), watch: false, pollMs: 1e9,
    pin: () => ({ teamId: "t-" + rt.slice(0, 8), rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
    me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place: "desk:" + who.keyId }),
    invite: () => ({ inv, token, seal: mod.inviteSealKey(secret) }),
    seat: () => seatFor(who),
    keyFor: () => null, sealEpoch: () => null, request, connect: null,
  });
  try {
    ch.start();
    await ch.idle();
    for (let i = 0; i < losses; i++) { ch.kick(); await ch.idle(); }
    const sent = ch.program.state().sent[rel];
    const asked = (R.stores.get(rt).get("inv:" + inv) || {}).asked || null;
    const recorded = sent ? sent.id : null;
    fs.unlinkSync(path.join(mirror, "desks", who.keyId, "join.json"));
    ch.kick();
    await ch.idle();
    const row = R.stores.get(rt).get("inv:" + inv) || {};
    return { recorded, asked, same: !!(recorded && recorded === asked), withdrawn: row.withdrawn === true && row.asked === recorded };
  } finally {
    await ch.stop();
  }
}
if (partOn("p966h")) {
  try {
    markPart("p966h");
    const one = await lostWithdraw(C, "lost-withdraw-1", 1);
    const two = await lostWithdraw(C, "lost-withdraw-2", 2);
    check(one.same && one.withdrawn && two.same && two.withdrawn,
      "966h an invitation upload whose reply was lost, and a retry refused token-spent, is recorded under the id the relay holds as asked, however many replies were lost, and Cancel's withdrawal is admitted: one lost reply, recorded "
      + one.recorded + ", asked " + one.asked + ", withdrawn " + one.withdrawn + "; two lost replies, recorded "
      + two.recorded + ", asked " + two.asked + ", withdrawn " + two.withdrawn);
    const lostPlant = await liftChannel("plant:lost-id", async mod => {
      const x = await lostWithdraw(mod, "lost-withdraw-plant", 1);
      return !!(x.recorded && x.asked && x.recorded !== x.asked && x.withdrawn === false);
    });
    check(lostPlant.turned && lostPlant.back, "966i lifting plant:lost-id seals the retry under a fresh id, so the relay refuses the withdrawal, and the product file is never written: "
      + lostPlant.detail + ", sha " + (lostPlant.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the leg 966h): " + (e && e.stack ? e.stack : e));
  }
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
if (partOn("p923a")) {
  try {
    markPart("p923a");
    const w = await pageWhole(C);
    check(w.atRev1 && w.listedBefore && w.failed === 1 && w.rev === 3 && w.landed,
      "923a a desk file listed before the lead's newer team file, whose fetch the relay answers 503 once, is not judged against the older roster that does not name its writer, and lands at the next cycle: "
      + (w.listedBefore ? "listed before rev 3" : "not listed before rev 3") + ", 503 answered " + w.failed + ", the mirror's rev " + w.rev
      + ", the desk file " + (w.landed ? "landed" : "missing") + " after " + w.fetchedDesk + " fetch(es)");
    const wholePlant = await liftChannel(["plant:page-whole", "plant:later-hold"], async mod => {
      const x = await pageWhole(mod);
      return x.listedBefore && x.failed === 1 && x.rev === 3 && !x.landed;
    });
    check(wholePlant.turned && wholePlant.back, "923b lifting plant:page-whole with plant:later-hold judges the desk file against the older roster and loses it, and the product file is never written: "
      + wholePlant.detail + ", sha " + (wholePlant.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the legs 923a): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- pg2: a catch-up lands the same mirror whatever the page size (the test architect's criterion for finding 1 of the relay
   review, 2026-11-16), and the end of the list is an empty page, so a relay that cuts its pages loses nothing ("fewer than a
   full page means there is no more", his criterion for his own finding). Each scene runs on a relay of its own whose page is a
   few items (limits.sinceMax) or the ordinary 1,000; a "cut" relay is that relay with plant:since-fill lifted, since as it
   served before it read past a row it leaves out. The client "as built before" is this file with plant:page-ends and
   plant:listed-ends lifted and its SINCE_MAX set to the relay's page. ---- */
const PG_DAY = 24 * 60 * 60 * 1000;
let pgCutTeam = null;
function pgTeamModule() {
  if (pgCutTeam) return pgCutTeam;
  const text = fs.readFileSync(path.join(ROOT, "relay", "core.cjs"), "utf8").split(/\n/);
  const at = text.findIndex(l => l.indexOf("plant:since-fill") >= 0);
  if (at < 0) throw new Error("plant:since-fill is absent");
  text.splice(at, 1);
  const dir = fs.mkdtempSync(path.join(LAB, "relay-cut-"));
  fs.mkdirSync(path.join(dir, "relay"));
  fs.mkdirSync(path.join(dir, "shell", "relay"), { recursive: true });
  fs.writeFileSync(path.join(dir, "relay", "core.cjs"), text.join("\n"));
  fs.copyFileSync(path.join(ROOT, "relay", "team.cjs"), path.join(dir, "relay", "team.cjs"));
  fs.writeFileSync(path.join(dir, "shell", "relay", "blob.cjs"), "module.exports = require(" + JSON.stringify(path.join(ROOT, "shell", "relay", "blob.cjs")) + ");\n");
  pgCutTeam = nodeRequire(path.join(dir, "relay", "team.cjs"));
  return pgCutTeam;
}
/* A relay of its own: `page` items a page (0, the ordinary), `cut` as since served before it filled its pages. */
function pgRelay(page, cut) {
  const o = { roots: K.ROOTS };
  if (page) o.limits = { sinceMax: page };
  if (cut) o.team = pgTeamModule();
  const RL = S.relayEnv(o);
  RL.clock.now = Date.UTC(2026, 9, 1, 12);
  const lfetch = (url, init) => {
    const i = Object.assign({}, init);
    if (i.body && i.method !== "GET") i.duplex = "half"; else delete i.body;
    return W.fetch(new Request(url, i), RL.env);
  };
  const x = { RL, shift: 0 };
  x.admin = async (method, p, json) => {
    const res = await lfetch("https://relay.test" + p, { method, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify(json), "utf8") });
    return { status: res.status, json: JSON.parse(Buffer.from(await res.arrayBuffer()).toString("utf8") || "null") };
  };
  /* A transport over this relay, its calls logged; `fail(method, rel)` true answers that call 503; `alter(method, rel, name, value)`
     answers a response header in place of the relay's, as a proxy between desk and relay might. */
  x.transport = (fail, alter) => {
    const t = { log: [] };
    t.request = async (method, url, headers, body) => {
      const rel = String(url).replace(/^https:\/\/[^/]+\/relay\/v1\/t\/[0-9a-f]{32}\//, "");
      t.log.push(method + " " + rel);
      if (fail && fail(method, rel)) return { status: 503, header: () => null, bytes: Buffer.from(JSON.stringify({ error: "fault" })) };
      const res = await lfetch(url, { method, headers, body });
      const bytes = Buffer.from(await res.arrayBuffer());
      return { status: res.status, header: n => (alter ? alter(method, rel, n, res.headers.get(n)) : res.headers.get(n)), bytes, socket: null };
    };
    return t;
  };
  x.team = async (rt, id, keys) => {
    const t = RL.clock.now;
    const made = await x.admin("POST", "/relay/v1/teams", K.createBody(rt, LEAD, t, b => signHex(LEAD, b), { grantOpts: { fields: { until: t + 44 * PG_DAY } } }));
    if (made.status !== 200) throw new Error("a team was not made: " + JSON.stringify(made.json));
    return x.enrol(rt, keys, 1);
  };
  x.enrol = async (rt, keys, rev) => {
    const list = keys.map(k => ({ id: k.keyId, pub: k.pub, desk: k.keyId })), t = RL.clock.now;
    const r = await x.admin("POST", "/relay/v1/t/" + rt + "/devices", { keys: list, rev, t, sig: signHex(LEAD, core.devicesBytes(rt, rev, t, list)) });
    if (r.status !== 200) throw new Error("desks were not enrolled: " + JSON.stringify(r.json));
  };
  x.jump = ms => { RL.clock.now += ms; x.shift += ms; };
  x.top = rt => RL.stores.get(rt).get("seq") || 0;
  return x;
}
function pgProgram(mod, x, name, tm, who, place, o) {
  const t = x.transport(o && o.fail, o && o.alter), said = [];
  const mirror = path.join(LAB, name);
  const request = (method, url, headers, body) => {
    if (who && who.keyId !== LEAD.keyId && method === "POST" && String(url).endsWith("/session") && body) {
      try {
        const parsed = JSON.parse(Buffer.from(body).toString("utf8"));
        if (parsed && parsed.pub && parsed.seat === undefined) {
          parsed.seat = seatFor(who, x.RL.clock.now);
          body = Buffer.from(JSON.stringify(parsed), "utf8");
        }
      } catch { /* pass through as given */ }
    }
    return t.request(method, url, headers, body);
  };
  const ch = mod.createChannel(Object.assign({
    rt: tm.rt, url: URLV1, mirror, stateFile: path.join(LAB, name + ".json"),
    pin: () => ({ teamId: tm.id, rt: tm.rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
    me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place }),
    keyFor: e => (e === 1 ? tm.key : null), sealEpoch: () => 1,
    request, connect: null, pollMs: 1e9, watch: false, clock: () => Date.now() + x.shift,
    say: l => said.push(l),
  }, who && who.keyId !== LEAD.keyId ? { seat: () => seatFor(who, x.RL.clock.now) } : {}, o && o.more));
  return { name, ch, t, said, mirror, prog: ch.program };
}
/* The mirror as path and sha256, the team file's rev, the pending count, the held count, and whether the place reached the top. */
function pgPrint(p, top) {
  const files = [];
  const walk = (dir, rel) => {
    let names = [];
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of names) {
      const r = rel ? rel + "/" + d.name : d.name;
      if (d.isDirectory()) walk(path.join(dir, d.name), r);
      else files.push(r + " " + sha(fs.readFileSync(path.join(dir, d.name))).slice(0, 12));
    }
  };
  walk(p.mirror, "");
  const st = p.prog.state();
  return { files: files.sort(), pending: st.pending.length, later: (st.later || []).length, atTop: st.seq === top, seq: st.seq, top };
}
const pgSame = (a, b) => JSON.stringify([a.files, a.pending, a.later, a.atTop]) === JSON.stringify([b.files, b.pending, b.later, b.atTop]);
/* A copy of this file with the lines tagged lifted, and SINCE_MAX set to `page` where given. */
function pgLift(tags, page) {
  const src = fs.readFileSync(path.join(ROOT, "shell", "relay", "channel.cjs"), "utf8");
  const lines = src.split(/\n/);
  const at = tags.map(tg => lines.findIndex(l => l.indexOf(tg) >= 0));
  if (!at.every(i => i >= 0)) return null;
  at.sort((a, b) => b - a).forEach(i => lines.splice(i, 1));
  let text = lines.join("\n");
  if (page) {
    if (text.split("const SINCE_MAX = 1000;").length !== 2) return null;
    text = text.replace("const SINCE_MAX = 1000;", "const SINCE_MAX = " + page + ";");
  }
  return loadPlantedChannel(text);
}
async function pgPlant(tags, page, fn) {
  const file = path.join(ROOT, "shell", "relay", "channel.cjs"), digest = sha(fs.readFileSync(file));
  let turned = false, detail = "plant line absent";
  try {
    const mod = pgLift(tags, page);
    if (mod) { turned = await fn(mod); detail = turned ? "the check lifted" : "the check still held"; }
  } catch (e) { detail = e && e.stack ? e.stack : String(e); }
  return { turned, back: sha(fs.readFileSync(file)) === digest, detail: String(detail).split("\n")[0] };
}

/* The scene of finding 1, at a page of `page` items. The lead names D0 and D1 at rev 1; D1 syncs and goes away. The lead answers a
   join request, D0 sends a file, the lead names D2 at rev 2, D2 sends a file, the lead writes eight files and then rev 3, which
   buries rev 2: D1, back, is listed D0's and D2's files pages before the team file that names D2. Then a desk new to the team,
   named at rev 4, joins from nothing. `stop`: D1's first cycle back meets a 503 on rev 3 and the program is closed and opened
   again before it reads on. Where D1 is back (not the program opened again after it, `again`): `strip`, every blob it fetches
   comes without its description header; `other`, D0's file comes once described as another id; `relistFail`, after the restart
   the list read again from just before D0's file is answered 503 once; `peek`, the place and the held rows after its first cycle. */
async function pgAway(mod, page, cut, o) {
  const opts = o || {};
  const x = pgRelay(page, cut);
  const D0 = opts.keys[0], D1 = opts.keys[1], D2 = opts.keys[2], D3 = opts.keys[3];
  const tm = { rt: opts.rt, id: opts.id, key: opts.key };
  await x.team(tm.rt, tm.id, [D0, D1, D2]);
  const tag = (page || "all") + (cut ? "c" : "") + "-" + hex(4);
  const lead = pgProgram(C, x, "pg-lead-" + tag, tm, LEAD, "root", { more: { agree: () => opts.dh } });
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(D0), member(D1)]));
  lead.ch.start();
  await settle(lead);
  const d1Name = "pg-d1-" + tag;
  const first = pgProgram(mod, x, d1Name, tm, D1, "desk:" + D1.keyId);
  first.ch.start();
  await settle(first);
  await first.ch.stop();
  await lead.ch.writeAnswer({ answer: "joined", inv: opts.inv, deskId: D3.keyId, deskBox: "ab".repeat(32), leadBox: "cd".repeat(32) });
  const d0 = pgProgram(C, x, "pg-d0-" + tag, tm, D0, "desk:" + D0.keyId);
  put(d0.mirror, "desks/" + D0.keyId + "/stats.estat", "{\"counted\":0}\n");
  d0.ch.start();
  await settle(d0);
  await d0.ch.stop();
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 2, [member(D0), member(D1), member(D2)]));
  await settle(lead);
  const d2 = pgProgram(C, x, "pg-d2-" + tag, tm, D2, "desk:" + D2.keyId);
  put(d2.mirror, "desks/" + D2.keyId + "/stats.estat", "{\"counted\":2}\n");
  d2.ch.start();
  await settle(d2);
  await d2.ch.stop();
  for (let i = 0; i < 8; i++) put(lead.mirror, "pad/p" + i + ".ec", "pad " + i + "\n");
  await settle(lead);
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 3, [member(D0), member(D1), member(D2)]));
  await settle(lead);
  const blobs = x.RL.stores.get(tm.rt).dump().map(([k, v]) => [k, JSON.parse(v)]).filter(([k]) => k.startsWith("blob:")).map(([, v]) => v);
  const of = w => blobs.filter(v => v.writer === w && !v.del).sort((a, b) => b.seq - a.seq)[0] || null;
  /* The team file is the lead's newest file here: rev 3, written after the eight pads. */
  const b0 = of(D0.keyId), b2 = of(D2.keyId), teamNow = of(LEAD.keyId);
  const out = { order: !!(b0 && b2 && teamNow && b0.seq < b2.seq && b2.seq < teamNow.seq) };
  let failed = 0;
  const fail = opts.stop ? (m, rel) => m === "GET" && teamNow && rel === "b/" + teamNow.id && failed++ === 0 : null;
  let others = 0;
  const alter = (opts.strip || opts.other) ? (m, rel, name, value) => {
    if (name !== "etiuda-blob" || m !== "GET" || !rel.startsWith("b/")) return value;
    if (opts.other && b0 && rel === "b/" + b0.id && value && others++ === 0) {
      const meta = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      return Buffer.from(JSON.stringify(Object.assign(meta, { id: hex(16) })), "utf8").toString("base64url");
    }
    return opts.strip ? null : value;
  } : null;
  const d0file = "desks/" + D0.keyId + "/stats.estat", d2file = "desks/" + D2.keyId + "/stats.estat";
  const look = p => { const st = p.prog.state(); return { later: (st.later || []).length, past: !!b2 && st.seq > b2.seq, missing0: read(p.mirror, d0file) === null, missing2: read(p.mirror, d2file) === null }; };
  let back = pgProgram(mod, x, d1Name, tm, D1, "desk:" + D1.keyId, { fail, alter });
  const logs = [back.t.log];
  back.ch.start();
  if (opts.stop) {
    await back.ch.idle();
    const st = back.prog.state();
    out.paused = { failed, later: (st.later || []).length, past: !!b2 && st.seq > b2.seq, missing: read(back.mirror, "desks/" + D2.keyId + "/stats.estat") === null };
    await back.ch.stop();
    let relistFailed = 0;
    const failAfter = opts.relistFail ? (m, rel) => m === "GET" && !!b0 && rel === "since/" + (b0.seq - 1) && relistFailed++ === 0 : null;
    back = pgProgram(mod, x, d1Name, tm, D1, "desk:" + D1.keyId, { fail: failAfter, alter });
    logs.push(back.t.log);
    back.ch.start();
    if (opts.relistFail) { await back.ch.idle(); out.relisted = Object.assign({ failed: relistFailed }, look(back)); }
  } else if (opts.peek || opts.other) {
    await back.ch.idle();
    out.peek = Object.assign({ others }, look(back));
  }
  await settle(back);
  out.d1 = pgPrint(back, x.top(tm.rt));
  out.d1look = look(back);
  out.relists = b0 && b2 ? [].concat(...logs).filter(l => l === "GET since/" + (b0.seq - 1) || l === "GET since/" + (b2.seq - 1)).length : -1;
  out.fetched0 = b0 ? [].concat(...logs).filter(l => l === "GET b/" + b0.id).length : -1;
  out.since = back.t.log.filter(l => l.startsWith("GET since/")).length;
  await back.ch.stop();
  const again = pgProgram(mod, x, d1Name, tm, D1, "desk:" + D1.keyId);
  again.ch.start();
  await settle(again);
  out.restarted = pgPrint(again, x.top(tm.rt));
  await again.ch.stop();
  await x.enrol(tm.rt, [D0, D1, D2, D3], 2);
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 4, [member(D0), member(D1), member(D2), member(D3)]));
  await settle(lead);
  const d3 = pgProgram(mod, x, "pg-d3-" + tag, tm, D3, "desk:" + D3.keyId);
  d3.ch.start();
  await settle(d3);
  out.d3 = pgPrint(d3, x.top(tm.rt));
  await d3.ch.stop();
  await lead.ch.stop();
  out.d2file = d2file;
  out.d0file = d0file;
  return out;
}
const pgHas = (pr, rel) => pr.files.some(f => f.startsWith(rel + " "));
/* The test architect's scene for his own finding, in small: the lead's answer, then nine files; D1 syncs, is away thirty days, and
   relists the whole team against a relay whose page is four. What D1's mirror holds after. */
async function pgRelist(mod, cut, o) {
  const opts = o || {};
  const x = pgRelay(4, cut);
  const D1 = opts.keys[1];
  const tm = { rt: hex(16), id: "t-" + hex(8), key: crypto.randomBytes(32) };
  await x.team(tm.rt, tm.id, [D1]);
  const tag = (cut ? "c" : "m") + "-" + hex(4);
  const lead = pgProgram(C, x, "pgr-lead-" + tag, tm, LEAD, "root", { more: { agree: () => crypto.randomBytes(32) } });
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(D1)]));
  lead.ch.start();
  await settle(lead);
  await lead.ch.writeAnswer({ answer: "joined", inv: hex(16), deskId: keyPair(true).keyId, deskBox: "ab".repeat(32), leadBox: "cd".repeat(32) });
  for (let i = 0; i < 9; i++) put(lead.mirror, "pad/p" + i + ".ec", "pad " + i + "\n");
  await settle(lead);
  await lead.ch.stop();
  const name = "pgr-d1-" + tag;
  let d = pgProgram(C, x, name, tm, D1, "desk:" + D1.keyId);
  d.ch.start();
  for (let i = 0; i < 6 && d.prog.state().seq < x.top(tm.rt); i++) await settle(d);
  const before = pgPrint(d, x.top(tm.rt));
  await d.ch.stop();
  x.jump(30 * PG_DAY);
  d = pgProgram(mod, x, name, tm, D1, "desk:" + D1.keyId);
  d.ch.start();
  await settle(d);
  const after = pgPrint(d, x.top(tm.rt));
  const listed = d.t.log.filter(l => l === "GET since/0").length;
  await d.ch.stop();
  const pads = pr => pr.files.filter(f => f.startsWith("pad/")).length;
  return { before: pads(before), after: pads(after), atTop: before.atTop, listed, lost: pads(before) - pads(after) };
}

if (partOn("p_pg2")) {
  try {
    markPart("p_pg2");
    const keys = [keyPair(true), keyPair(true), keyPair(true), keyPair(true)];
    const fixed = { keys, rt: hex(16), id: "t-" + hex(8), key: crypto.randomBytes(32), inv: hex(16), dh: crypto.randomBytes(32) };
    const small = await pgAway(C, 4, false, fixed);
    const all = await pgAway(C, 0, false, fixed);
    const cutSmall = await pgAway(C, 4, true, fixed);
    const lines = p => "D2's file " + (pgHas(p, small.d2file) ? "landed" : "missing") + ", " + p.files.length + " file(s), pending " + p.pending + ", held " + p.later
      + ", seq " + (p.atTop ? "at the top" : p.seq + " of " + p.top);
    check(small.order && all.order && pgHas(all.d1, small.d2file) && pgSame(small.d1, all.d1) && pgSame(cutSmall.d1, all.d1),
      "pg2a a desk away across more files than a page, the team file that names a writer on a later page than its file: the same mirror,"
      + " pending list and place at a page of four, at a page of four from a relay that cuts its pages, and at the ordinary page: four, " + lines(small.d1)
      + "; cut, " + lines(cutSmall.d1) + "; ordinary, " + lines(all.d1));
    check(pgSame(small.restarted, all.d1) && pgSame(cutSmall.restarted, all.d1) && pgSame(all.restarted, all.d1),
      "pg2b after a restart and three cycles the mirrors are as they were: four, " + lines(small.restarted) + "; ordinary, " + lines(all.restarted));
    check(pgHas(all.d3, small.d2file) && pgSame(small.d3, all.d3) && pgSame(cutSmall.d3, all.d3),
      "pg2c a desk new to the team, joining from nothing, lands the same mirror at a page of four, cut and not, and at the ordinary page: four, "
      + lines(small.d3) + "; ordinary, " + lines(all.d3));
    const stopFixed = Object.assign({}, fixed, { stop: true });
    const halted = await pgAway(C, 4, false, stopFixed);
    check(small.fetched0 === 1 && all.fetched0 === 1 && halted.fetched0 === 1,
      "pg2d a file whose writer the desk's roster names is fetched once, at the last page, and not on its own page as well, a catch-up stopped"
      + " and restarted between included: four, " + small.fetched0 + " fetch(es); ordinary, " + all.fetched0 + "; stopped, " + halted.fetched0);
    const p = halted.paused || {};
    check(p.failed === 1 && p.later > 0 && p.past && p.missing && pgSame(halted.d1, all.d1),
      "pg2e a catch-up stopped by a 503 on the team file after its first pages, closed and opened again: the desk file waits held with the"
      + " place past it (held " + p.later + ", place past it " + !!p.past + ", in the mirror " + !p.missing + "), and lands after the restart: " + lines(halted.d1));
    const hold = await pgPlant(["plant:later-hold", "plant:later-listed"], 0, async mod => {
      const y = await pgAway(mod, 4, false, fixed);
      return !pgHas(y.d1, small.d2file) && !pgSame(y.d1, all.d1);
    });
    check(hold.turned && hold.back, "pg2f lifting plant:later-hold with plant:later-listed judges each page against the roster"
      + " the desk holds then, and D2's file is lost at a page of four: " + hold.detail + ", sha " + (hold.back ? "restored" : "differs"));
    const listedOnly = await pgPlant(["plant:later-listed"], 0, async mod => (await pgAway(mod, 4, false, stopFixed)).fetched0 === 2);
    check(listedOnly.turned && listedOnly.back, "pg2g lifting plant:later-listed fetches the named writer's file on its own page, and again at the last once a restart has let its bytes go: "
      + listedOnly.detail + ", sha " + (listedOnly.back ? "restored" : "differs"));
    const keptOff = await pgPlant(["plant:later-kept"], 0, async mod => {
      const y = await pgAway(mod, 4, false, stopFixed);
      return !pgHas(y.d1, small.d2file);
    });
    check(keptOff.turned && keptOff.back, "pg2h lifting plant:later-kept forgets the held file at the restart, and it is lost: "
      + keptOff.detail + ", sha " + (keptOff.back ? "restored" : "differs"));
    const endsOff = await pgPlant(["plant:page-ends"], 4, async mod => {
      const y = await pgAway(mod, 4, true, fixed);
      return !pgHas(y.d1, small.d2file);
    });
    check(endsOff.turned && endsOff.back, "pg2i lifting plant:page-ends takes the relay's cut page of three for the last, and D2's file is lost: "
      + endsOff.detail + ", sha " + (endsOff.back ? "restored" : "differs"));

    /* His own finding: a relist thirty days on, against a relay that cuts its pages and one that does not. */
    const relist = await pgRelist(C, true, fixed);
    check(relist.before === 9 && relist.atTop && relist.listed === 1 && relist.lost === 0,
      "pg2j thirty days away, the whole team relisted from a relay that cuts its first page to three: nothing is removed (" + relist.before + " files before, "
      + relist.after + " after, relisted " + relist.listed + " time(s))");
    const braceList = await pgPlant(["plant:reconcile-top"], 0, async mod => (await pgRelist(mod, true, fixed)).lost === 0);
    const braceTop = await pgPlant(["plant:listed-ends"], 4, async mod => (await pgRelist(mod, true, fixed)).lost === 0);
    check(braceList.turned && braceTop.turned && braceList.back && braceTop.back, "pg2k each brace holds alone against the cut relay: with plant:reconcile-top"
      + " lifted the list read to an empty page loses nothing (" + braceList.detail + "), and with plant:listed-ends lifted the cut list stops below the"
      + " desk's place and reconcile removes nothing (" + braceTop.detail + ")");
    let lostBoth = 0;
    const both = await pgPlant(["plant:reconcile-top", "plant:listed-ends", "plant:page-ends"], 4, async mod => { lostBoth = (await pgRelist(mod, true, fixed)).lost; return lostBoth > 0; });
    check(both.turned && both.back, "pg2l lifting both braces, the client as built before, against the cut relay removes " + lostBoth + " live file(s): "
      + both.detail + ", sha " + (both.back ? "restored" : "differs"));
    let lostMended = -1;
    const mended = await pgPlant(["plant:reconcile-top", "plant:listed-ends", "plant:page-ends"], 4, async mod => { lostMended = (await pgRelist(mod, false, fixed)).lost; return lostMended === 0; });
    check(mended.turned && mended.back, "pg2m the client as built before, against the relay that fills its pages: nothing is removed (" + lostMended + "): "
      + mended.detail + ", sha " + (mended.back ? "restored" : "differs"));
    /* reconcile on its own: a list whose top is below the program's place removes nothing. */
    const direct = async mod => {
      const dir = fs.mkdtempSync(path.join(LAB, "pg-top-"));
      const io = C.diskIO(dir);
      const prog = mod.createProgram({ io, pin: PIN, clock: Date.now });
      const st = prog.state();
      for (let i = 1; i <= 4; i++) {
        io.write("pad/p" + i + ".ec", "pad " + i + "\n");
        st.applied["pad/p" + i + ".ec"] = { writer: LEAD.keyId, epoch: 1, counter: i, id: hex(16), at: Date.now(), sha: sha(Buffer.from("pad " + i + "\n")), del: false };
      }
      st.seq = 40;
      const list = [{ seq: 3, meta: { id: st.applied["pad/p1.ec"].id } }];
      return { dropped: prog.reconcile(list).length, left: io.list().length };
    };
    const kept = await direct(C);
    const topOff = await pgPlant(["plant:reconcile-top"], 0, async mod => (await direct(mod)).dropped === 3);
    check(kept.dropped === 0 && kept.left === 4 && topOff.turned && topOff.back, "pg2n reconcile given a list that stops at seq 3, the program's place 40: nothing"
      + " removed (" + kept.dropped + " dropped, " + kept.left + " left); lifting plant:reconcile-top removes the three it does not name: "
      + topOff.detail + ", sha " + (topOff.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the legs pg2): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- pg3: THE CLIENT IN THE FIELD AGAINST THIS RELAY'S since (the test architect, 2026-11-17; Claude alpha's question of that night,
   whether the old client had ever been run against the new since, which decides whether the relay's half may deploy ahead of a
   client installer). The client is shell/relay/channel.cjs of engine abc58e9f, the desk build in use when the paging mend was
   made, kept as a fixture with its sha256 held here (a "before" read from a moving ref stops being one). It ends a catch-up and a
   relist at a page of fewer than SINCE_MAX items, so it is served rightly only by a relay whose short page is the last. Its
   SINCE_MAX is set to the relay's page of four in a scratch copy, as pg2's client "as built before" is, so the rule is met with
   ten files and not a thousand. The scene: the lead's answer, which since leaves out, then nine files. ---- */
const PG3_FIXTURE = { file: path.join(ROOT, "tests", "fixtures", "relay-channel-abc58e9f.cjs.txt"), from: "abc58e9f",
  sha256: "012f1fd1ccaada1d0e530e80dfaa791dbde9f5e2d7fbaaed9218325ad01c47a6" };
function pg3Client(page) {
  let text;
  try { text = fs.readFileSync(PG3_FIXTURE.file, "utf8").replace(/\r\n/g, "\n"); } catch { return { why: "the fixture is absent" }; }
  if (sha(Buffer.from(text, "utf8")) !== PG3_FIXTURE.sha256) return { why: "the fixture is not the bytes captured from " + PG3_FIXTURE.from };
  if (text.split("const SINCE_MAX = 1000;").length !== 2 || text.split("r.json.length < SINCE_MAX").length !== 3)
    return { why: "the fixture does not end a list at a page of fewer than SINCE_MAX items, in the catch-up and in the relist" };
  return { mod: loadPlantedChannel(text.replace("const SINCE_MAX = 1000;", "const SINCE_MAX = " + page + ";")) };
}
/* A desk new to the team catches up from nothing, with client `mod`, on a relay whose page is four (`cut`: as since served before
   it filled its pages): what its mirror holds beside what the client of this tree holds on the same relay. */
async function pg3Join(mod, cut) {
  const x = pgRelay(4, cut);
  const DO = keyPair(true), DN = keyPair(true);
  const tm = { rt: hex(16), id: "t-" + hex(8), key: crypto.randomBytes(32) };
  await x.team(tm.rt, tm.id, [DO, DN]);
  const tag = (cut ? "c" : "m") + "-" + hex(4);
  const lead = pgProgram(C, x, "pg3-lead-" + tag, tm, LEAD, "root", { more: { agree: () => crypto.randomBytes(32) } });
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(DO), member(DN)]));
  lead.ch.start();
  await settle(lead);
  await lead.ch.writeAnswer({ answer: "joined", inv: hex(16), deskId: keyPair(true).keyId, deskBox: "ab".repeat(32), leadBox: "cd".repeat(32) });
  for (let i = 0; i < 9; i++) put(lead.mirror, "pad/p" + i + ".ec", "pad " + i + "\n");
  await settle(lead);
  await lead.ch.stop();
  const top = x.top(tm.rt);
  const run = async (m, who, name) => {
    const d = pgProgram(m, x, name + tag, tm, who, "desk:" + who.keyId);
    d.ch.start();
    await settle(d);
    const first = pgPrint(d, top);
    /* Its later cycles, as a running desk makes them: a client that stopped short reads on. */
    for (let i = 0; i < 6 && d.prog.state().seq < top; i++) await settle(d);
    const after = pgPrint(d, top);
    const since = d.t.log.filter(l => l.startsWith("GET since/")).length;
    await d.ch.stop();
    return { first, after, since };
  };
  const old = await run(mod, DO, "pg3-old-"), now = await run(C, DN, "pg3-now-");
  const pads = pr => pr.files.filter(f => f.startsWith("pad/"));
  return { oldFirst: pads(old.first).length, oldAfter: pads(old.after).length, oldAtTop: old.after.atTop, oldPending: old.after.pending,
    nowAfter: pads(now.after).length, same: JSON.stringify(pads(old.after)) === JSON.stringify(pads(now.after)) && pads(now.after).length === 9,
    teamSame: old.after.files.filter(f => f.startsWith(C.TEAM_NAME + " ")).join() === now.after.files.filter(f => f.startsWith(C.TEAM_NAME + " ")).join(),
    since: old.since };
}

if (partOn("p_pg3")) {
  try {
    markPart("p_pg3");
    const held = pg3Client(4);
    check(!!held.mod, "pg3a the client of engine " + PG3_FIXTURE.from + " is held as a fixture by its sha256, and ends a list at a page of fewer than SINCE_MAX items in its catch-up and its relist: "
      + (held.mod ? "held" : held.why));
    if (held.mod) {
      const keys = [keyPair(true), keyPair(true)];
      const joined = await pg3Join(held.mod, false);
      check(joined.oldFirst === 9 && joined.oldAfter === 9 && joined.oldAtTop && joined.oldPending === 0 && joined.same && joined.teamSame,
        "pg3b that client, new to a team whose first page holds the lead's answer, catches up from this relay with every file, and its mirror is the one"
        + " this tree's client holds: " + joined.oldFirst + " of 9 once it settles, " + joined.oldAfter + " of 9 after its later cycles, " + (joined.oldAtTop ? "at the top" : "short of the top")
        + ", pending " + joined.oldPending + ", the same files " + (joined.same ? "yes" : "no") + ", the same team file " + (joined.teamSame ? "yes" : "no") + ", " + joined.since + " since request(s)");
      const relisted = await pgRelist(held.mod, false, { keys });
      check(relisted.atTop && relisted.before === 9 && relisted.listed >= 1 && relisted.lost === 0,
        "pg3c that client, away thirty days, relists the whole team against this relay and removes nothing: " + relisted.lost + " of " + relisted.before
        + " removed, the list asked from the start " + relisted.listed + " time(s)");
      /* The control: the same client and the same relist against a relay that cuts its pages, which is what it was served by before
         the mend. It must show the fault, or pg3c would pass on any relay. (Its catch-up from nothing reads on at its next cycles
         and ends whole on either relay, so the relist is where a cut page costs it files.) */
      const cutRelist = await pgRelist(held.mod, true, { keys });
      check(cutRelist.atTop && cutRelist.before === 9 && cutRelist.lost > 0,
        "pg3d the control: against a relay that cuts its pages the same client's relist removes files it should keep: "
        + cutRelist.lost + " of " + cutRelist.before + " removed");
    } else for (const id of ["pg3b", "pg3c", "pg3d"]) check(false, id + " not run: " + held.why);
  } catch (e) {
    check(false, "harness (the legs pg3): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- pg4: a file a catch-up held is let go only once it lands, is refused with a word said, or the relay says it is gone (the
   test architect's criterion for the paging mend's return, 2026-11-17). A blob answered 200 without its description header, as a
   proxy or gateway between desk and relay may leave it, lands under the description the catch-up listed where that is in hand,
   under the relay's list read again where it is not, and otherwise stays held for the next catch-up; one described as another id
   is a fault, not a file. The scenes are pg2's (pgAway), D1 back through a stand-in that strips the header on purpose. ---- */
if (partOn("p_pg4")) {
  try {
    markPart("p_pg4");
    const keys = [keyPair(true), keyPair(true), keyPair(true), keyPair(true)];
    const fixed = { keys, rt: hex(16), id: "t-" + hex(8), key: crypto.randomBytes(32), inv: hex(16), dh: crypto.randomBytes(32) };
    const all = await pgAway(C, 0, false, fixed);
    const small = await pgAway(C, 4, false, fixed);
    const strip = Object.assign({}, fixed, { strip: true }), stopStrip = Object.assign({}, strip, { stop: true });
    const lines = p => "D0's file " + (pgHas(p, all.d0file) ? "landed" : "missing") + ", D2's file " + (pgHas(p, all.d2file) ? "landed" : "missing")
      + ", " + p.files.length + " file(s), held " + p.later + ", seq " + (p.atTop ? "at the top" : p.seq + " of " + p.top);
    const inHand = await pgAway(C, 4, false, strip);
    check(pgHas(all.d1, all.d0file) && pgSame(inHand.d1, all.d1) && inHand.since === small.since,
      "pg4a every blob answered without its description, at a page of four: the file held unfetched for the last page lands under the"
      + " description its page listed, the same mirror as the ordinary page, and the list is read no more often (" + inHand.since + " lists, "
      + small.since + " with the header): " + lines(inHand.d1));
    const restart = await pgAway(C, 4, false, stopStrip);
    check(pgSame(restart.d1, all.d1) && pgSame(restart.restarted, all.d1) && restart.relists >= 1,
      "pg4b a row held by a catch-up stopped by a 503, the program closed and opened again before its last page, every blob then answered"
      + " without its description: the relay's list is read again from just before the held row (" + restart.relists + " time(s)) and the held"
      + " files land: " + lines(restart.d1));
    const relistFail = await pgAway(C, 4, false, Object.assign({}, stopStrip, { relistFail: true }));
    const rf = relistFail.relisted || {};
    check(rf.failed === 1 && rf.later >= 1 && rf.past && rf.missing0 && pgSame(relistFail.d1, all.d1),
      "pg4c that list read again answered 503 once: the held files stay held with the place past them (held " + rf.later + ", D0's file in the mirror "
      + !rf.missing0 + "), and land at the next catch-up: " + lines(relistFail.d1));
    const other = await pgAway(C, 4, false, Object.assign({}, fixed, { other: true }));
    const ot = other.peek || {};
    check(ot.others === 1 && ot.later >= 1 && ot.missing0 && pgSame(other.d1, all.d1),
      "pg4d D0's held file answered once with another id's description is a fault, not a file: it stays held (held " + ot.later + ", in the mirror "
      + !ot.missing0 + "), and lands once the relay answers it as itself: " + lines(other.d1));
    const ordinary = await pgAway(C, 0, false, strip);
    check(pgSame(ordinary.d1, all.d1),
      "pg4e at the ordinary page, every blob answered without its description: D2's file, fetched on its own page, is judged under the description"
      + " its page listed (plant:listed-meta), and D0's, held to the last page, lands as in pg4a: " + lines(ordinary.d1));
    /* With the list not read again, a row whose description is not in hand stays held, and lands once the header comes. */
    let stays = null;
    const relistOff = await pgPlant(["plant:later-relist"], 0, async mod => {
      stays = await pgAway(mod, 4, false, stopStrip);
      return !pgSame(stays.d1, all.d1);
    });
    const sl = (stays && stays.d1look) || {};
    check(relistOff.turned && relistOff.back && sl.later >= 1 && sl.missing0 && sl.past && pgSame(stays.restarted, all.d1),
      "pg4f lifting plant:later-relist turns pg4b, and the held files then stay held, never let go (held " + sl.later + ", D0's file in the mirror "
      + !sl.missing0 + ", place past them " + !!sl.past + "), and land at the next catch-up once the header passes: " + relistOff.detail
      + ", sha " + (relistOff.back ? "restored" : "differs") + (stays ? "; after, " + lines(stays.restarted) : ""));
    const LIFTS = [
      ["pg4a", ["plant:later-described"], "the description in hand is passed over and the list read again", async mod => (await pgAway(mod, 4, false, strip)).since !== small.since],
      ["pg4f", ["plant:later-relist", "plant:later-stay"], "the held files are let go in silence and never land", async mod => !pgHas((await pgAway(mod, 4, false, stopStrip)).restarted, all.d0file)],
      ["pg4d", ["plant:later-other"], "the file described as another id is let go", async mod => !pgHas((await pgAway(mod, 4, false, Object.assign({}, fixed, { other: true }))).restarted, all.d0file)],
      ["pg4e", ["plant:listed-meta"], "a blob without its description is left out", async mod => !pgSame((await pgAway(mod, 0, false, strip)).d1, all.d1)],
    ];
    let n = 0;
    for (const [leg, tags, say, turns] of LIFTS) {
      const p = await pgPlant(tags, 0, turns);
      check(p.turned && p.back, "pg4" + String.fromCharCode(103 + n++) + " lifting " + tags.join(" with ") + " turns " + leg + " red (" + say + "): "
        + p.detail + ", sha " + (p.back ? "restored" : "differs"));
    }
  } catch (e) {
    check(false, "harness (the legs pg4): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- pg5: a relist that reconcile did not judge (the list's top below st.seq) is not stamped as done; it is asked
   again no sooner than a day after it was last asked and no later than the first catch-up after that day, until one is
   judged; a judged relist is stamped as today. ---- */
async function scenePg5(mod) {
  const x = pgRelay(0, false);
  const D0 = keyPair(true), DA = keyPair(true);
  const tm = { rt: hex(16), id: "t-" + hex(8), key: crypto.randomBytes(32) };
  const RETIRED = "retracted before the month away\n", NEWEST = "a live file written once back\n";
  const HOUR = 60 * 60 * 1000;
  await x.team(tm.rt, tm.id, [D0, DA]);
  const tag = "pg5-" + hex(4);
  const lead = pgProgram(mod, x, "pg5-lead-" + tag, tm, LEAD, "root");
  const d0 = pgProgram(mod, x, "pg5-d0-" + tag, tm, D0, "desk:" + D0.keyId);
  const da = pgProgram(mod, x, "pg5-da-" + tag, tm, DA, "desk:" + DA.keyId);
  const t0 = x.RL.clock.now;
  try {
    put(lead.mirror, mod.TEAM_NAME, teamBody(tm, 1, 1, [member(D0), member(DA)]));
    put(lead.mirror, "lane.ec", "{\"note\":\"Lane Board edition one\"}\n");
    put(lead.mirror, "retired.ec", RETIRED);
    lead.ch.start(); d0.ch.start(); da.ch.start();
    await settle(lead, d0, da);

    /* Day 1: da stops, then lead retracts retired.ec (no newer live file follows it). */
    await da.ch.stop();
    x.jump(PG_DAY);
    fs.unlinkSync(path.join(lead.mirror, "retired.ec"));
    await settle(lead, d0);
    await lead.ch.stop();
    await d0.ch.stop();

    /* Day 32 (> 29d keep, deletion > 30d expired): da returns, relists once, reconcile does not judge (top < st.seq). */
    x.jump(31 * PG_DAY);
    const n0 = da.t.log.length;
    da.ch.start();
    await settle(da);
    const relist1 = da.t.log.slice(n0).filter(c => c === "GET since/0").length;
    const stamp1 = da.prog.state().listed;
    const retired1 = read(da.mirror, "retired.ec") === RETIRED;

    /* Less than a day later (+12h): no relist is asked. */
    x.jump(12 * HOUR);
    const n1 = da.t.log.length;
    await settle(da);
    const relistUnderDay = da.t.log.slice(n1).filter(c => c === "GET since/0").length;

    /* More than a day after the first ask (+13h, total +25h): still no live file, asks again and still does not stamp. */
    x.jump(13 * HOUR);
    const n2 = da.t.log.length;
    await settle(da);
    const relistOverDay = da.t.log.slice(n2).filter(c => c === "GET since/0").length;
    const stamp2 = da.prog.state().listed;
    const savedMid = read(LAB, da.name + ".json");

    /* Less than a day after the second ask (+12h): no relist is asked. */
    x.jump(12 * HOUR);
    const n3 = da.t.log.length;
    await settle(da);
    const relistUnderDay2 = da.t.log.slice(n3).filter(c => c === "GET since/0").length;

    /* More than a day after the second ask (+13h, total +25h), with a live file written: first catch-up judges, drops retired.ec, and stamps. */
    x.jump(13 * HOUR);
    lead.ch.start();
    await settle(lead);
    put(lead.mirror, "newest.ec", NEWEST);
    await settle(lead);
    await lead.ch.stop();
    const n4 = da.t.log.length;
    da.ch.kick();
    await da.ch.idle();
    const relistJudged = da.t.log.slice(n4).filter(c => c === "GET since/0").length;
    const retiredAfter = read(da.mirror, "retired.ec");
    const newestAfter = read(da.mirror, "newest.ec");
    const stampJudged = da.prog.state().listed;

    /* More than a day after the judged relist (+25h): stamped as done, so no relist is asked. */
    x.jump(25 * HOUR);
    const n5 = da.t.log.length;
    await settle(da);
    const relistAfterJudged = da.t.log.slice(n5).filter(c => c === "GET since/0").length;

    return {
      BASE: t0, DAYMS: PG_DAY, relist1, stamp1, retired1, relistUnderDay, relistOverDay, stamp2,
      relistUnderDay2, relistJudged, retiredAfter, newestAfter, stampJudged, relistAfterJudged,
      savedMid,
    };
  } finally {
    await da.ch.stop();
    await d0.ch.stop();
    await lead.ch.stop();
  }
}

if (partOn("p_pg5")) {
  try {
    markPart("p_pg5");
    const s = await scenePg5(C);
    const notStampedBefore = Number.isSafeInteger(s.stamp1) && s.stamp1 < s.BASE + s.DAYMS
      && Number.isSafeInteger(s.stamp2) && s.stamp2 < s.BASE + s.DAYMS;
    const stampedAfter = Number.isSafeInteger(s.stampJudged) && s.stampJudged >= s.BASE + 34 * s.DAYMS;
    check(s.relist1 === 1 && s.retired1 && notStampedBefore && s.relistUnderDay === 0
      && s.relistOverDay === 1 && s.relistUnderDay2 === 0 && s.relistJudged === 1
      && s.retiredAfter === null && s.newestAfter === "a live file written once back\n"
      && stampedAfter && s.relistAfterJudged === 0,
      "pg5a an unjudged relist (list top below st.seq) is not stamped, is not asked again before a day, is asked on the first catch-up"
      + " past a day, and once a live file lets reconcile judge, removes the retracted file and stamps: "
      + JSON.stringify({ relist1: s.relist1, under: s.relistUnderDay, over: s.relistOverDay, under2: s.relistUnderDay2,
        judged: s.relistJudged, afterJudged: s.relistAfterJudged, retiredAfter: s.retiredAfter,
        stamp1Delta: s.stamp1 - s.BASE, stampJudgedDelta: s.stampJudged - s.BASE }));
    const oldShape = { kind: "etiuda-relay-channel", v: 1, seq: 5, listed: s.BASE };
    const inNew = C.stateOf(oldShape, s.BASE + 32 * s.DAYMS);
    const oldClient = pg3Client(1000);
    const midObj = s.savedMid ? JSON.parse(s.savedMid) : null;
    const inOld = oldClient.mod && midObj ? oldClient.mod.stateOf(midObj, s.BASE + 33 * s.DAYMS) : null;
    check(inNew.listed === s.BASE && inNew.listedAsked === null && !!inOld && inOld.seq === midObj.seq && inOld.listed === midObj.listed,
      "pg5b a state file written before this change reads its listed stamp in the new program, and a state file with an unjudged ask reads"
      + " its sequence and listed stamp in the old client: inNew=" + JSON.stringify({ listed: inNew.listed, listedAsked: inNew.listedAsked })
      + ", inOld=" + (inOld ? JSON.stringify({ seq: inOld.seq, listed: inOld.listed }) : "none"));
    const unjudgedOff = await pgPlant(["plant:relist-unjudged"], 0, async mod => {
      const r = await scenePg5(mod);
      return r.relistOverDay === 0 && r.retiredAfter !== null;
    });
    check(unjudgedOff.turned && unjudgedOff.back, "pg5c lifting plant:relist-unjudged stamps the unjudged relist as done, so no retry runs"
      + " past a day and the retracted file stays: " + unjudgedOff.detail + ", sha " + (unjudgedOff.back ? "restored" : "differs"));
    const dayOff = await pgPlant(["plant:relist-day"], 0, async mod => {
      const r = await scenePg5(mod);
      return r.relistUnderDay > 0;
    });
    check(dayOff.turned && dayOff.back, "pg5d lifting plant:relist-day drops the one-day wait, so a catch-up less than a day later relists"
      + " again: " + dayOff.detail + ", sha " + (dayOff.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the legs pg5): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- pg6: retryPending (a file that waited for its key) leaves the pending list only where it landed, the relay said
   gone, or it was refused; a 200 without its description is judged under a description from relistHeld or stays
   pending, and one naming another id stays pending and is said once. ---- */
async function scenePg6(mod, opts) {
  const o = opts || {};
  const x = pgRelay(0, false);
  const D1 = keyPair(true);
  const tm = { rt: hex(16), id: "t-" + hex(8), key: crypto.randomBytes(32) };
  const key2 = crypto.randomBytes(32);
  await x.team(tm.rt, tm.id, [D1]);
  const tag = "pg6-" + hex(4);
  const keys = new Map([[1, tm.key], [2, key2]]);
  let leadEpoch = 1;
  const lead = pgProgram(C, x, "pg6-lead-" + tag, tm, LEAD, "root", {
    more: { keyFor: e => keys.get(e) || null, sealEpoch: () => leadEpoch },
  });
  const d1Keys = new Map([[1, tm.key]]);
  let mode = "normal", otherCount = 0, relistFailed = 0, targetId = null, relistRel = null;
  const fail = (m, rel) => {
    if (mode === "relistFail" && m === "GET" && relistRel && rel === relistRel && relistFailed++ === 0) return true;
    return false;
  };
  const alter = (m, rel, name, value) => {
    if (name !== "etiuda-blob" || m !== "GET" || !rel.startsWith("b/")) return value;
    if (mode === "strip" || mode === "relistFail") return null;
    if (mode === "other" && targetId && rel === "b/" + targetId && value && otherCount++ === 0) {
      const meta = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      return Buffer.from(JSON.stringify(Object.assign(meta, { id: hex(16) })), "utf8").toString("base64url");
    }
    return value;
  };
  const d1 = pgProgram(mod, x, "pg6-d1-" + tag, tm, D1, "desk:" + D1.keyId, {
    fail, alter, more: { keyFor: e => d1Keys.get(e) || null, sealEpoch: () => 1 },
  });
  try {
    put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(D1)]));
    lead.ch.start();
    await settle(lead);
    d1.ch.start();
    await settle(d1);

    /* Epoch 2 team file and two epoch-2 files while d1 holds only epoch 1's key: all wait in d1's pending list. */
    leadEpoch = 2;
    put(lead.mirror, C.TEAM_NAME, teamBody(tm, 2, 1, [member(D1)]));
    put(lead.mirror, "pad/ep2a.ec", "epoch two file a\n");
    put(lead.mirror, "pad/ep2b.ec", "epoch two file b\n");
    await settle(lead);
    await settle(d1);
    const blobs = x.RL.stores.get(tm.rt).dump().map(([k, v]) => [k, JSON.parse(v)]).filter(([k]) => k.startsWith("blob:")).map(([, v]) => v);
    const ep2Blobs = blobs.filter(v => v.writer === LEAD.keyId && v.epoch === 2 && !v.del).sort((a, b) => a.seq - b.seq);
    const ep2aBlob = ep2Blobs[1] || null;
    targetId = ep2aBlob ? ep2aBlob.id : null;
    relistRel = ep2Blobs[0] ? "since/" + (ep2Blobs[0].seq - 1) : null;
    const pendBefore = d1.prog.state().pending.length;

    if (o.supersede) {
      /* Supersede the first pending blob while d1 still has not retried, so GET b/<old> returns 410 gone. */
      put(lead.mirror, "pad/ep2a.ec", "epoch two file a v2\n");
      await settle(lead);
    }

    /* Now d1 holds key 2, and its transport strips or swaps headers during retryPending. */
    d1Keys.set(2, key2);
    mode = o.mode || "strip";
    const logFrom = d1.t.log.length;
    d1.ch.kick();
    await d1.ch.idle();
    const firstCalls = d1.t.log.slice(logFrom);
    const relists = relistRel ? firstCalls.filter(l => l === "GET " + relistRel).length : 0;
    const mid = {
      pending: d1.prog.state().pending.length,
      a: read(d1.mirror, "pad/ep2a.ec"),
      b: read(d1.mirror, "pad/ep2b.ec"),
      said: d1.said.slice(),
    };

    /* Next cycle with normal headers: anything still pending lands. */
    mode = "normal";
    await settle(d1);
    return {
      pendBefore, relists, relistFailed, otherCount, mid,
      afterPending: d1.prog.state().pending.length,
      afterA: read(d1.mirror, "pad/ep2a.ec"),
      afterB: read(d1.mirror, "pad/ep2b.ec"),
      said: d1.said.slice(),
    };
  } finally {
    await d1.ch.stop();
    await lead.ch.stop();
  }
}

if (partOn("p_pg6")) {
  try {
    markPart("p_pg6");
    const strip = await scenePg6(C, { mode: "strip" });
    check(strip.pendBefore >= 2 && strip.mid.pending === 0 && strip.relists === 1
      && strip.mid.a === "epoch two file a\n" && strip.mid.b === "epoch two file b\n",
      "pg6a retryPending with every header stripped reads the list again once (" + strip.relists + ") and lands both pending files: "
      + JSON.stringify({ before: strip.pendBefore, midPending: strip.mid.pending, a: !!strip.mid.a, b: !!strip.mid.b }));
    const rfail = await scenePg6(C, { mode: "relistFail" });
    check(rfail.relistFailed === 1 && rfail.mid.pending >= 2 && rfail.mid.a === null && rfail.afterPending === 0
      && rfail.afterA === "epoch two file a\n" && rfail.afterB === "epoch two file b\n",
      "pg6b retryPending with headers stripped and the relist answered 503 once keeps the pending rows and lands them next cycle: "
      + JSON.stringify({ before: rfail.pendBefore, midPending: rfail.mid.pending, afterPending: rfail.afterPending, a: !!rfail.afterA }));
    const other = await scenePg6(C, { mode: "other" });
    const otherSaid = other.mid.said.some(l => l.indexOf("another file's description") >= 0);
    check(other.otherCount === 1 && other.mid.pending >= 1 && other.mid.a === null && otherSaid
      && other.afterPending === 0 && other.afterA === "epoch two file a\n",
      "pg6c retryPending answered once with another id's header stays pending, says the fault once, and lands next cycle: "
      + JSON.stringify({ midPending: other.mid.pending, otherSaid, afterPending: other.afterPending, a: !!other.afterA }));
    const relistOff = await pgPlant(["plant:pending-relist"], 0, async mod => {
      const r = await scenePg6(mod, { mode: "strip" });
      return r.mid.a === null;
    });
    check(relistOff.turned && relistOff.back, "pg6d lifting plant:pending-relist turns pg6a red (headerless pending files never land): "
      + relistOff.detail + ", sha " + (relistOff.back ? "restored" : "differs"));
    const otherOff = await pgPlant(["plant:pending-other"], 0, async mod => {
      const r = await scenePg6(mod, { mode: "other" });
      return !r.mid.said.some(l => l.indexOf("another file's description") >= 0);
    });
    check(otherOff.turned && otherOff.back, "pg6e lifting plant:pending-other turns pg6c red (other-id answer not refused as OTHER_FILE): "
      + otherOff.detail + ", sha " + (otherOff.back ? "restored" : "differs"));
    const keptOff = await pgPlant(["plant:pending-kept"], 0, async mod => {
      const r = await scenePg6(mod, { mode: "normal", supersede: true });
      return r.afterPending > 0;
    });
    check(keptOff.turned && keptOff.back, "pg6f lifting plant:pending-kept leaves a superseded (410 gone) pending row stuck in pending: "
      + keptOff.detail + ", sha " + (keptOff.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the legs pg6): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- pg7: the ahead loop on the last page (held handovers) judges a 200 without its description under the listed
   description or relistHeld, rather than failing catchUp; one naming another id is the OTHER_FILE fault. ---- */
async function scenePg7(mod, opts) {
  const o = opts || {};
  const x = pgRelay(4, false);
  const D0 = keyPair(true), D1 = keyPair(true), NEXT = keyPair(true);
  const tm = { rt: hex(16), id: "t-" + hex(8), key: crypto.randomBytes(32) };
  await x.team(tm.rt, tm.id, [D0, D1]);
  const tag = "pg7-" + hex(4);
  let activeLead = LEAD;
  const lead = pgProgram(C, x, "pg7-lead-" + tag, tm, LEAD, "root", {
    more: { me: () => ({ keyId: activeLead.keyId, public: activeLead.pub, privateKey: activeLead.privateKey, place: "root" }) },
  });
  const d0 = pgProgram(C, x, "pg7-d0-" + tag, tm, D0, "desk:" + D0.keyId);
  const d1Name = "pg7-d1-" + tag;
  let d1 = pgProgram(mod, x, d1Name, tm, D1, "desk:" + D1.keyId);
  try {
    put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(D0), member(D1)]));
    lead.ch.start();
    await settle(lead);
    d0.ch.start();
    d1.ch.start();
    await settle(d0, d1);
    await d1.ch.stop();
    /* One file before the handover so handBlob.seq - 1 is past d1's starting seq. */
    put(d0.mirror, "desks/" + D0.keyId + "/pre.ec", "before handover\n");
    await settle(d0);

    /* Hand over the team to NEXT, then write files across more than a page of 4 so the handover is held in ahead. */
    const t = x.RL.clock.now;
    const moveRes = await x.admin("POST", "/relay/v1/t/" + tm.rt + "/lead", {
      to: { keyId: NEXT.keyId, pub: NEXT.pub }, t,
      sig: signHex(LEAD, Buffer.from("etiuda-relay-lead\n" + tm.rt + "\n" + NEXT.keyId + "\n" + NEXT.pub + "\n" + t, "utf8")),
      grant: K.grantFor(NEXT.pub, t),
    });
    if (moveRes.status !== 200) throw new Error("handover failed: " + JSON.stringify(moveRes.json));
    activeLead = NEXT;
    const step = { format: 1, kind: "etiuda-team-handover", team: tm.id,
      from: { keyId: LEAD.keyId, public: LEAD.pub }, to: { keyId: NEXT.keyId, public: NEXT.pub },
      sig: { alg: "Ed25519", keyId: LEAD.keyId } };
    step.sig.value = signHex(LEAD, Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), C.signedBytes(step)]));
    const handDoc = { format: 1, kind: "etiuda-team", id: tm.id, catalogs: ["quay-board"],
      lead: { keyId: NEXT.keyId, public: NEXT.pub }, sealed: true, exportsSealed: false, epoch: 1, rev: 2,
      channel: { kind: "relay", rt: tm.rt, url: URLV1 },
      ring: { format: 1, kind: "etiuda-ring", keys: [{ catalog: "quay-board", keyId: NEXT.keyId, alg: "Ed25519", public: NEXT.pub }] },
      handover: [step], roster: [member(D0), member(D1)] };
    handDoc.sig = { alg: "Ed25519", keyId: NEXT.keyId };
    handDoc.sig.value = signHex(NEXT, C.signedBytes(handDoc));
    put(lead.mirror, C.TEAM_NAME, JSON.stringify(handDoc, null, 1) + "\n");
    await settle(lead);
    for (let i = 0; i < 4; i++) put(d0.mirror, "desks/" + D0.keyId + "/p" + i + ".ec", "handover pad " + i + "\n");
    await settle(d0);
    await d0.ch.stop();
    await lead.ch.stop();

    const blobs = x.RL.stores.get(tm.rt).dump().map(([k, v]) => [k, JSON.parse(v)]).filter(([k]) => k.startsWith("blob:")).map(([, v]) => v);
    const handBlob = blobs.find(v => v.writer === NEXT.keyId && !v.del);
    const relistRel = handBlob ? "since/" + (handBlob.seq - 1) : null;

    let mode = o.stop ? "normal" : (o.mode || "strip"), otherCount = 0, relistFailed = 0, page2Failed = 0;
    const alter = (m, rel, name, value) => {
      if (name !== "etiuda-blob" || m !== "GET" || !rel.startsWith("b/")) return value;
      if (mode === "strip" || mode === "relistFail") return null;
      if (mode === "other" && handBlob && rel === "b/" + handBlob.id && value && otherCount++ === 0) {
        const meta = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
        return Buffer.from(JSON.stringify(Object.assign(meta, { id: hex(16) })), "utf8").toString("base64url");
      }
      return value;
    };
    const startSeq = d1.prog.state().seq;
    const failPage2 = o.stop ? (m, rel) => m === "GET" && rel.startsWith("since/") && rel !== "since/" + startSeq && page2Failed++ === 0 : null;
    d1 = pgProgram(mod, x, d1Name, tm, D1, "desk:" + D1.keyId, { fail: failPage2, alter });
    d1.ch.start();
    if (o.stop) {
      await d1.ch.idle();
      const pausedAhead = d1.prog.ahead().length;
      await d1.ch.stop();
      mode = o.mode || "strip";
      const failAfter = mode === "relistFail" ? (m, rel) => m === "GET" && relistRel && rel === relistRel && relistFailed++ === 0 : null;
      d1 = pgProgram(mod, x, d1Name, tm, D1, "desk:" + D1.keyId, { fail: failAfter, alter });
      const fromAfter = d1.t.log.length;
      d1.ch.start();
      await d1.ch.idle();
      const midRelists = relistRel ? d1.t.log.slice(fromAfter).filter(l => l === "GET " + relistRel).length : 0;
      const mid = {
        ahead: d1.prog.ahead().length,
        pin: d1.prog.pinned() ? d1.prog.pinned().lead.keyId : "",
        p3: read(d1.mirror, "desks/" + D0.keyId + "/p3.ec"),
      };
      mode = "normal";
      await settle(d1);
      return {
        pausedAhead, midRelists, relistFailed, otherCount, mid,
        pin: d1.prog.pinned() ? d1.prog.pinned().lead.keyId : "",
        ahead: d1.prog.ahead().length,
        p3: read(d1.mirror, "desks/" + D0.keyId + "/p3.ec"),
        nextId: NEXT.keyId,
        said: d1.said.slice(),
      };
    }

    const from = d1.t.log.length;
    await d1.ch.idle();
    const firstRelists = relistRel ? d1.t.log.slice(from).filter(l => l === "GET " + relistRel).length : 0;
    const mid = {
      ahead: d1.prog.ahead().length,
      pin: d1.prog.pinned() ? d1.prog.pinned().lead.keyId : "",
      p3: read(d1.mirror, "desks/" + D0.keyId + "/p3.ec"),
      said: d1.said.slice(),
    };
    mode = "normal";
    await settle(d1);
    return {
      firstRelists, otherCount, mid,
      pin: d1.prog.pinned() ? d1.prog.pinned().lead.keyId : "",
      ahead: d1.prog.ahead().length,
      p3: read(d1.mirror, "desks/" + D0.keyId + "/p3.ec"),
      nextId: NEXT.keyId,
      said: d1.said.slice(),
    };
  } finally {
    await d1.ch.stop();
    await d0.ch.stop();
    await lead.ch.stop();
  }
}

if (partOn("p_pg7")) {
  try {
    markPart("p_pg7");
    const strip = await scenePg7(C, { mode: "strip" });
    check(strip.mid.ahead === 0 && strip.mid.pin === strip.nextId && strip.mid.p3 === "handover pad 3\n" && strip.firstRelists === 0,
      "pg7a held handover across pages with every header stripped lands under its listed description with no extra list read ("
      + strip.firstRelists + "): " + JSON.stringify(strip.mid));
    const restart = await scenePg7(C, { mode: "strip", stop: true });
    check(restart.pausedAhead === 1 && restart.midRelists >= 1 && restart.mid.ahead === 0
      && restart.mid.pin === restart.nextId && restart.mid.p3 === "handover pad 3\n",
      "pg7b held handover across a restart with every header stripped reads the list again (" + restart.midRelists + ") and finishes the catch-up: "
      + JSON.stringify(restart.mid));
    const rfail = await scenePg7(C, { mode: "relistFail", stop: true });
    check(rfail.relistFailed === 1 && rfail.mid.ahead === 1 && rfail.mid.pin !== rfail.nextId
      && rfail.ahead === 0 && rfail.pin === rfail.nextId && rfail.p3 === "handover pad 3\n",
      "pg7c that relist answered 503 once keeps the handover held and finishes next cycle: "
      + JSON.stringify({ midAhead: rfail.mid.ahead, afterAhead: rfail.ahead, p3: !!rfail.p3 }));
    const other = await scenePg7(C, { mode: "other", stop: true });
    const otherSaid = other.said.some(l => l.indexOf("another file's description") >= 0);
    check(other.otherCount === 1 && other.mid.ahead === 1 && other.mid.pin !== other.nextId && otherSaid
      && other.ahead === 0 && other.pin === other.nextId && other.p3 === "handover pad 3\n",
      "pg7d held handover answered once with another id's header faults as OTHER_FILE, keeps ahead, and finishes next cycle: "
      + JSON.stringify({ midAhead: other.mid.ahead, otherSaid, afterAhead: other.ahead }));
    const descOff = await pgPlant(["plant:ahead-described"], 0, async mod => {
      const r = await scenePg7(mod, { mode: "strip" });
      return r.firstRelists > 0;
    });
    check(descOff.turned && descOff.back, "pg7e lifting plant:ahead-described turns pg7a red (reads the list again instead of using listed): "
      + descOff.detail + ", sha " + (descOff.back ? "restored" : "differs"));
    const relistOff = await pgPlant(["plant:ahead-relist"], 0, async mod => {
      const r = await scenePg7(mod, { mode: "strip", stop: true });
      return r.mid.pin !== r.nextId;
    });
    check(relistOff.turned && relistOff.back, "pg7f lifting plant:ahead-relist turns pg7b red (headerless handover across restart never finishes): "
      + relistOff.detail + ", sha " + (relistOff.back ? "restored" : "differs"));
    const otherOff = await pgPlant(["plant:ahead-other"], 0, async mod => {
      const r = await scenePg7(mod, { mode: "other", stop: true });
      return !r.said.some(l => l.indexOf("another file's description") >= 0);
    });
    check(otherOff.turned && otherOff.back, "pg7g lifting plant:ahead-other turns pg7d red (other-id answer not refused as OTHER_FILE): "
      + otherOff.detail + ", sha " + (otherOff.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the legs pg7): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- pg8: on the ordinary path, a 200 whose description names another file is the OTHER_FILE fault (nothing judged,
   nothing let go, said once), not a fallback to the listing; only a missing header falls back (plant:listed-meta). ---- */
async function scenePg8(mod, opts) {
  const o = opts || {};
  const x = pgRelay(0, false);
  const D1 = keyPair(true);
  const tm = { rt: hex(16), id: "t-" + hex(8), key: crypto.randomBytes(32) };
  await x.team(tm.rt, tm.id, [D1]);
  const tag = "pg8-" + hex(4);
  const lead = pgProgram(C, x, "pg8-lead-" + tag, tm, LEAD, "root");
  let mode = "normal", otherCount = 0, targetId = null, swapId = null;
  const alter = (m, rel, name, value) => {
    if (name !== "etiuda-blob" || m !== "GET" || !rel.startsWith("b/")) return value;
    if (mode === "strip") return null;
    if (mode === "other" && targetId && rel === "b/" + targetId && value && otherCount++ === 0) {
      const meta = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      return Buffer.from(JSON.stringify(Object.assign(meta, { id: swapId || hex(16) })), "utf8").toString("base64url");
    }
    return value;
  };
  const d1 = pgProgram(mod, x, "pg8-d1-" + tag, tm, D1, "desk:" + D1.keyId, { alter });
  try {
    put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(D1)]));
    lead.ch.start();
    await settle(lead);
    d1.ch.start();
    await settle(d1);
    await d1.ch.stop();

    put(lead.mirror, "pad/first.ec", "ordinary first\n");
    await settle(lead);
    put(lead.mirror, "pad/target.ec", "ordinary target\n");
    await settle(lead);
    put(lead.mirror, "pad/after.ec", "ordinary after\n");
    await settle(lead);
    await lead.ch.stop();

    const blobs = x.RL.stores.get(tm.rt).dump().map(([k, v]) => [k, JSON.parse(v)]).filter(([k]) => k.startsWith("blob:")).map(([, v]) => v);
    const live = blobs.filter(v => v.writer === LEAD.keyId && !v.del).sort((a, b) => a.seq - b.seq);
    const firstBlob = live[live.length - 3], targetBlob = live[live.length - 2];
    swapId = firstBlob ? firstBlob.id : hex(16);
    targetId = targetBlob ? targetBlob.id : null;
    const targetSeq = targetBlob ? targetBlob.seq : 0;

    mode = o.mode || "other";
    d1.ch.start();
    await d1.ch.idle();
    const mid = {
      seq: d1.prog.state().seq,
      first: read(d1.mirror, "pad/first.ec"),
      target: read(d1.mirror, "pad/target.ec"),
      after: read(d1.mirror, "pad/after.ec"),
      said: d1.said.slice(),
    };

    mode = "normal";
    await settle(d1);
    return {
      otherCount, targetSeq, mid,
      seq: d1.prog.state().seq,
      top: x.top(tm.rt),
      first: read(d1.mirror, "pad/first.ec"),
      target: read(d1.mirror, "pad/target.ec"),
      after: read(d1.mirror, "pad/after.ec"),
      said: d1.said.slice(),
    };
  } finally {
    await d1.ch.stop();
    await lead.ch.stop();
  }
}

if (partOn("p_pg8")) {
  try {
    markPart("p_pg8");
    const other = await scenePg8(C, { mode: "other" });
    const otherSaid = other.mid.said.filter(l => l.indexOf("another file's description") >= 0);
    const afterSaid = other.said.filter(l => l.indexOf("another file's description") >= 0);
    check(other.otherCount === 1 && other.mid.first === "ordinary first\n" && other.mid.target === null
      && other.mid.after === null && other.mid.seq < other.targetSeq && otherSaid.length === 1
      && afterSaid.length === 1 && other.seq === other.top
      && other.target === "ordinary target\n" && other.after === "ordinary after\n",
      "pg8a ordinary path answered once with another id's header faults as OTHER_FILE, keeps seq before it, says the fault once, and lands next cycle: "
      + JSON.stringify({ midSeq: other.mid.seq, targetSeq: other.targetSeq, midTarget: !!other.mid.target,
        midAfter: !!other.mid.after, saidCount: afterSaid.length, afterTarget: !!other.target }));
    const strip = await scenePg8(C, { mode: "strip" });
    check(strip.mid.first === "ordinary first\n" && strip.mid.target === "ordinary target\n"
      && strip.mid.after === "ordinary after\n" && strip.mid.said.length === 0,
      "pg8b ordinary path with every header missing falls back to the listed description and lands all files: "
      + JSON.stringify({ first: !!strip.mid.first, target: !!strip.mid.target, after: !!strip.mid.after, said: strip.mid.said.length }));
    const otherOff = await pgPlant(["plant:listed-other"], 0, async mod => {
      const r = await scenePg8(mod, { mode: "other" });
      return r.mid.seq >= r.targetSeq && !r.mid.said.some(l => l.indexOf("another file's description") >= 0);
    });
    check(otherOff.turned && otherOff.back, "pg8c lifting plant:listed-other turns pg8a red (falls back to listed and lets seq past): "
      + otherOff.detail + ", sha " + (otherOff.back ? "restored" : "differs"));
    const metaOff = await pgPlant(["plant:listed-meta"], 0, async mod => {
      const r = await scenePg8(mod, { mode: "strip" });
      return r.mid.target === null;
    });
    check(metaOff.turned && metaOff.back, "pg8d lifting plant:listed-meta turns pg8b red (missing header on ordinary path left out): "
      + metaOff.detail + ", sha " + (metaOff.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the legs pg8): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- pg9: a blob header that names the right id and does not open (size wrong, or v 2) counts as no description
   in landLater and on the ordinary page: the list entry is judged, and where the list entry does not open either, a
   held row stays in later and nothing says it landed. ---- */
async function scenePg9Held(mod, opts) {
  const o = opts || {};
  const x = pgRelay(4, false);
  const D0 = keyPair(true), D1 = keyPair(true);
  const tm = { rt: hex(16), id: "t-" + hex(8), key: crypto.randomBytes(32) };
  await x.team(tm.rt, tm.id, [D0, D1]);
  const tag = "pg9h-" + hex(4);
  const lead = pgProgram(C, x, "pg9h-lead-" + tag, tm, LEAD, "root");
  const d0 = pgProgram(C, x, "pg9h-d0-" + tag, tm, D0, "desk:" + D0.keyId);
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(D0), member(D1)]));
  lead.ch.start();
  await settle(lead);
  let d1 = pgProgram(mod, x, "pg9h-d1-" + tag, tm, D1, "desk:" + D1.keyId);
  d1.ch.start();
  await settle(d1);
  await d1.ch.stop();

  const d0file = "desks/" + D0.keyId + "/stats.estat", d0body = "{\"counted\":9}\n";
  put(d0.mirror, d0file, d0body);
  d0.ch.start();
  await settle(d0);
  await d0.ch.stop();
  for (let i = 0; i < 6; i++) put(lead.mirror, "pad/p" + i + ".ec", "pad " + i + "\n");
  await settle(lead);
  await lead.ch.stop();

  const blobs = x.RL.stores.get(tm.rt).dump().map(([k, v]) => [k, JSON.parse(v)]).filter(([k]) => k.startsWith("blob:")).map(([, v]) => v);
  const b0 = blobs.find(v => v.writer === D0.keyId && !v.del);
  const mutateMeta = m => {
    if (o.mode === "size") return Object.assign({}, m, { size: m.size + 1 });
    if (o.mode === "v2") return Object.assign({}, m, { v: 2 });
    return m;
  };
  let active = true;
  const baseT = x.transport(null, (m, rel, name, value) => {
    if (!active || name !== "etiuda-blob" || m !== "GET" || !b0 || rel !== "b/" + b0.id || !value) return value;
    const meta = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return Buffer.from(JSON.stringify(mutateMeta(meta)), "utf8").toString("base64url");
  });
  const request = async (method, url, headers, body) => {
    const res = await baseT.request(method, url, headers, body);
    const rel = String(url).replace(/^https:\/\/[^/]+\/relay\/v1\/t\/[0-9a-f]{32}\//, "");
    if (active && o.corruptList && method === "GET" && rel.startsWith("since/") && b0 && res.status === 200) {
      const arr = JSON.parse(res.bytes.toString("utf8"));
      const next = arr.map(e => (e && e.meta && e.meta.id === b0.id ? Object.assign({}, e, { meta: mutateMeta(e.meta) }) : e));
      return Object.assign({}, res, { bytes: Buffer.from(JSON.stringify(next), "utf8") });
    }
    return res;
  };
  d1 = pgProgram(mod, x, "pg9h-d1-" + tag, tm, D1, "desk:" + D1.keyId, { more: { request } });
  try {
    d1.ch.start();
    await d1.ch.idle();
    const mid = {
      d0: read(d1.mirror, d0file),
      later: d1.prog.later().map(h => h.id),
      seq: d1.prog.state().seq,
      top: x.top(tm.rt),
      said: d1.said.slice(),
    };
    active = false;
    await settle(d1);
    return {
      b0Id: b0 ? b0.id : null,
      d0body,
      mid,
      afterD0: read(d1.mirror, d0file),
      afterLater: d1.prog.later().length,
      afterSeq: d1.prog.state().seq,
      top: x.top(tm.rt),
      said: d1.said.slice(),
    };
  } finally {
    await d1.ch.stop();
    await d0.ch.stop();
    await lead.ch.stop();
  }
}

async function scenePg9Ordinary(mod) {
  const x = pgRelay(0, false);
  const D1 = keyPair(true);
  const tm = { rt: hex(16), id: "t-" + hex(8), key: crypto.randomBytes(32) };
  await x.team(tm.rt, tm.id, [D1]);
  const tag = "pg9o-" + hex(4);
  const lead = pgProgram(C, x, "pg9o-lead-" + tag, tm, LEAD, "root");
  put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(D1)]));
  lead.ch.start();
  await settle(lead);
  let d1 = pgProgram(mod, x, "pg9o-d1-" + tag, tm, D1, "desk:" + D1.keyId);
  d1.ch.start();
  await settle(d1);
  await d1.ch.stop();

  put(lead.mirror, "pad/badsize.ec", "bad size body\n");
  await settle(lead);
  put(lead.mirror, "pad/badver.ec", "bad version body\n");
  await settle(lead);
  await lead.ch.stop();

  const blobs = x.RL.stores.get(tm.rt).dump().map(([k, v]) => [k, JSON.parse(v)]).filter(([k]) => k.startsWith("blob:")).map(([, v]) => v);
  const live = blobs.filter(v => v.writer === LEAD.keyId && !v.del).sort((a, b) => a.seq - b.seq);
  const bSize = live[live.length - 2], bVer = live[live.length - 1];
  const alter = (m, rel, name, value) => {
    if (name !== "etiuda-blob" || m !== "GET" || !rel.startsWith("b/") || !value) return value;
    const meta = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (bSize && rel === "b/" + bSize.id) return Buffer.from(JSON.stringify(Object.assign(meta, { size: meta.size + 1 })), "utf8").toString("base64url");
    if (bVer && rel === "b/" + bVer.id) return Buffer.from(JSON.stringify(Object.assign(meta, { v: 2 })), "utf8").toString("base64url");
    return value;
  };
  d1 = pgProgram(mod, x, "pg9o-d1-" + tag, tm, D1, "desk:" + D1.keyId, { alter });
  try {
    d1.ch.start();
    await d1.ch.idle();
    return {
      badSize: read(d1.mirror, "pad/badsize.ec"),
      badVer: read(d1.mirror, "pad/badver.ec"),
      seq: d1.prog.state().seq,
      top: x.top(tm.rt),
      said: d1.said.slice(),
    };
  } finally {
    await d1.ch.stop();
    await lead.ch.stop();
  }
}

async function scenePg9PendingSig(mod) {
  const x = pgRelay(0, false);
  const D1 = keyPair(true);
  const tm = { rt: hex(16), id: "t-" + hex(8), key: crypto.randomBytes(32) };
  const key2 = crypto.randomBytes(32);
  await x.team(tm.rt, tm.id, [D1]);
  const tag = "pg9p-" + hex(4);
  const keys = new Map([[1, tm.key], [2, key2]]);
  let leadEpoch = 1;
  const lead = pgProgram(C, x, "pg9p-lead-" + tag, tm, LEAD, "root", { more: { keyFor: e => keys.get(e) || null, sealEpoch: () => leadEpoch } });
  const d1Keys = new Map([[1, tm.key]]);
  let tamper = false, targetId = null;
  const alter = (m, rel, name, value) => {
    if (!tamper || name !== "etiuda-blob" || m !== "GET" || !targetId || rel !== "b/" + targetId || !value) return value;
    const meta = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return Buffer.from(JSON.stringify(Object.assign(meta, { sig: "00".repeat(64) })), "utf8").toString("base64url");
  };
  const d1 = pgProgram(mod, x, "pg9p-d1-" + tag, tm, D1, "desk:" + D1.keyId, { alter, more: { keyFor: e => d1Keys.get(e) || null, sealEpoch: () => 1 } });
  try {
    put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, [member(D1)]));
    lead.ch.start();
    await settle(lead);
    d1.ch.start();
    await settle(d1);

    leadEpoch = 2;
    put(lead.mirror, C.TEAM_NAME, teamBody(tm, 2, 1, [member(D1)]));
    put(lead.mirror, "pad/pend.ec", "pending sig test\n");
    await settle(lead);
    await settle(d1);
    const blobs = x.RL.stores.get(tm.rt).dump().map(([k, v]) => [k, JSON.parse(v)]).filter(([k]) => k.startsWith("blob:")).map(([, v]) => v);
    const ep2 = blobs.filter(v => v.writer === LEAD.keyId && v.epoch === 2 && !v.del).sort((a, b) => a.seq - b.seq);
    targetId = ep2[1] ? ep2[1].id : null;
    const beforePend = d1.prog.state().pending.length;

    d1Keys.set(2, key2);
    tamper = true;
    d1.ch.kick();
    await d1.ch.idle();
    return {
      beforePend,
      afterPend: d1.prog.state().pending.length,
      file: read(d1.mirror, "pad/pend.ec"),
      said: d1.said.slice(),
    };
  } finally {
    await d1.ch.stop();
    await lead.ch.stop();
  }
}

if (partOn("p_pg9")) {
  try {
    markPart("p_pg9");
    const hSize = await scenePg9Held(C, { mode: "size" });
    check(hSize.mid.d0 === hSize.d0body && hSize.mid.later.length === 0 && hSize.mid.seq === hSize.mid.top && hSize.mid.said.length === 0,
      "pg9a held file answered 200 with size one more than the body is judged under its list entry and lands: "
      + JSON.stringify({ landed: hSize.mid.d0 === hSize.d0body, later: hSize.mid.later.length, atTop: hSize.mid.seq === hSize.mid.top, said: hSize.mid.said.length }));
    const hV2 = await scenePg9Held(C, { mode: "v2" });
    check(hV2.mid.d0 === hV2.d0body && hV2.mid.later.length === 0 && hV2.mid.seq === hV2.mid.top && hV2.mid.said.length === 0,
      "pg9b held file answered 200 with v 2 is judged under its list entry and lands: "
      + JSON.stringify({ landed: hV2.mid.d0 === hV2.d0body, later: hV2.mid.later.length, atTop: hV2.mid.seq === hV2.mid.top, said: hV2.mid.said.length }));
    const hBoth = await scenePg9Held(C, { mode: "size", corruptList: true });
    check(hBoth.mid.d0 === null && hBoth.mid.later.indexOf(hBoth.b0Id) >= 0 && !hBoth.mid.said.some(l => l.indexOf("left out") >= 0)
      && hBoth.afterD0 === hBoth.d0body && hBoth.afterLater === 0,
      "pg9c held file whose header and list entry both fail envelopeOf stays in later with nothing landed or refused, and lands once normal: "
      + JSON.stringify({ midLanded: hBoth.mid.d0 !== null, stillHeld: hBoth.mid.later.indexOf(hBoth.b0Id) >= 0, afterLanded: hBoth.afterD0 === hBoth.d0body, afterLater: hBoth.afterLater }));
    const ord = await scenePg9Ordinary(C);
    check(ord.badSize === "bad size body\n" && ord.badVer === "bad version body\n" && ord.seq === ord.top && ord.said.length === 0,
      "pg9d ordinary page answered 200 with size one more than the body or v 2 falls back to its list entry and lands both: "
      + JSON.stringify({ badSize: ord.badSize === "bad size body\n", badVer: ord.badVer === "bad version body\n", atTop: ord.seq === ord.top, said: ord.said.length }));
    const pend = await scenePg9PendingSig(C);
    check(pend.beforePend >= 2 && pend.afterPend === 0 && pend.file === null && pend.said.some(l => l.indexOf("signature") >= 0),
      "pg9e control: a pending row whose header opens and whose signature then fails is refused and unpended as today: "
      + JSON.stringify({ before: pend.beforePend, after: pend.afterPend, file: pend.file, said: pend.said }));
    const pLaterEnv = await pgPlant(["plant:later-envelope"], 0, async mod => {
      const a = await scenePg9Held(mod, { mode: "size" });
      const b = await scenePg9Held(mod, { mode: "v2" });
      return a.mid.d0 === null && b.mid.d0 === null;
    });
    check(pLaterEnv.turned && pLaterEnv.back, "pg9f lifting plant:later-envelope turns pg9a and pg9b red (unopenable header lets held files go): "
      + pLaterEnv.detail + ", sha " + (pLaterEnv.back ? "restored" : "differs"));
    const pLaterList = await pgPlant(["plant:later-listed-envelope"], 0, async mod => {
      const c = await scenePg9Held(mod, { mode: "size", corruptList: true });
      return c.mid.later.indexOf(c.b0Id) < 0;
    });
    check(pLaterList.turned && pLaterList.back, "pg9g lifting plant:later-listed-envelope turns pg9c red (unopenable list entry lets held file go): "
      + pLaterList.detail + ", sha " + (pLaterList.back ? "restored" : "differs"));
    const pOrdEnv = await pgPlant(["plant:listed-envelope"], 0, async mod => {
      const d = await scenePg9Ordinary(mod);
      return d.badSize === null || d.badVer === null;
    });
    check(pOrdEnv.turned && pOrdEnv.back, "pg9h lifting plant:listed-envelope turns pg9d red (unopenable header on ordinary page drops file): "
      + pOrdEnv.detail + ", sha " + (pOrdEnv.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the legs pg9): " + (e && e.stack ? e.stack : e));
  }
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
if (partOn("p954")) {
  try {
    markPart("p954");
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
if (partOn("p955")) {
  try {
    markPart("p955");
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
}

/* ---- an older epoch's team file is a replay (F5): never loaded, and never written over a newer file the mirror
   already holds, even where this program has no applied record for it. A lower rev at the same epoch, and a newer
   epoch, stay as they are. Judging a blob under an older epoch's own floor stays as it is. ---- */
if (partOn("p956")) {
  try {
    markPart("p956");
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
}

/* ---- a path that differs only in case is one file (F3). The same path in the same case is already stale. Pending
   carries no path, so a pending row is not a fourth map of paths. ---- */
if (partOn("p957")) {
  try {
    markPart("p957");
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
if (partOn("p958a")) {
  try {
    markPart("p958a");
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
}
if (partOn("p958b")) {
  try {
    markPart("p958b");
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
if (partOn("p959")) {
  try {
    markPart("p959");
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
}

/* The iota-subscript pair shares a key even when the runtime's own case maps throw. A fold that
   still calls toUpperCase or toLowerCase fails this leg. */
if (partOn("p961a")) {
  try {
    markPart("p961a");
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
}

/* plant:upcase-table. Deleting that line, leaving the file valid script, leaves each unit itself,
   so the iota-subscript pair no longer shares a key. */
if (partOn("p961b")) {
  try {
    markPart("p961b");
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
}

/* A desk's relay socket closes. The channel sees that close, and the lead's next edition still arrives by the poll,
   which runs only while the desk holds no socket. */
if (partOn("p960")) {
  try {
    markPart("p960");
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
    const socketUp = await until(() => desk.ch.socketOpen(), 30000);
    if (handle) handle.close();
    /* The close is waited for as long as the edition is: the leg's subject is the poll after it, and a loaded machine was
       seen to take over 3 s to notice (the release profile and a whole run, 2026-10-29). A desk that never notices still fails. */
    const closeAt = Date.now();
    const seenClosed = await until(() => !desk.ch.socketOpen(), 10000);
    const closeMs = Date.now() - closeAt;
    put(lead.mirror, "guide.ec", TWO);
    await settle(lead);
    const caught = await until(() => read(desk.mirror, "guide.ec") === TWO, 10000);
    check(had && socketUp && seenClosed && caught,
      "960a a desk whose relay socket closes still receives the lead's next edition by the poll: first edition "
      + (had ? "in the mirror" : "missing") + ", socket opened " + socketUp + ", seen closed " + seenClosed
      + " in " + closeMs + " ms, the next edition arrived " + caught);
    await desk.ch.stop();
    await lead.ch.stop();
  } catch (e) {
    check(false, "harness (the leg 960a): " + (e && e.stack ? e.stack : e));
  }
}

/* 989: a push socket refused before it opens, as behind a gateway that inspects encrypted traffic, or one that never opens.
   After two such failures in a row the channel asks on its poll and tries the socket again with each ask, not in a loop of
   its own; it says the socket is down while its asks are answered and up again once one opens. A connector that does not say when its socket opens keeps
   the reconnect it had. */
if (partOn("p989")) {
  markPart("p989");
  const scene = async (tag, mode, pollMs) => {
    const deskKey = keyPair(true);
    const tm = await freshTeam([deskKey]);
    const k1 = crypto.randomBytes(32);
    const s = { tries: 0, told: [], mode, handles: [] };
    const connect = (url, headers, on) => {
      s.tries++;
      const m = s.mode;
      const h = { send() {}, close() {} };
      if (m !== "silent") h.opens = true;
      if (m === "refuse" || m === "silent") setImmediate(() => on.close());
      else if (m === "open") setImmediate(() => { if (typeof on.open === "function") on.open(); });
      s.handles.push(h);
      return h;
    };
    const name = "989-" + tag + "-" + tm.rt.slice(0, 8);
    s.p = opened(C, name, tm, deskKey, "desk:" + deskKey.keyId, {
      keyFor: e => (e === 1 ? k1 : null), sealEpoch: () => 1, connect, pollMs,
      onSocket: () => s.told.push(typeof s.p.ch.pushDown === "function" ? s.p.ch.pushDown() : "none"),
    });
    s.asks = () => s.p.t.log.length;
    s.down = () => typeof s.p.ch.pushDown === "function" ? s.p.ch.pushDown() : "none";
    return s;
  };
  try {
    {
      const s = await scene("loop", "refuse", 1e9);
      s.p.ch.start();
      await settle(s.p);
      await wait(7000);
      const tries = s.tries, down = s.down(), online = s.p.ch.online(), asks = s.asks();
      await s.p.ch.stop();
      check(tries === 2 && down === true && online === true,
        "989a a socket refused before it opens is tried once more and then not in a loop of its own, and after those two the"
        + " channel says it is down while its asks are answered: tried " + tries + " time(s) and " + asks + " request(s) in 7 s with no"
        + " poll due, online " + online + ", down " + down);
    }
    {
      const s = await scene("poll", "refuse", 400);
      s.p.ch.start();
      await settle(s.p);
      const asksAt = s.asks(), triesAt = s.tries;
      await wait(1600);
      const asked = s.asks() - asksAt, tried = s.tries - triesAt, down = s.down();
      await s.p.ch.stop();
      check(asked >= 3 && tried >= 2 && down === true,
        "989b with the socket refused, the channel asks on its poll and tries the socket again with each ask: "
        + asked + " request(s) and " + tried + " socket(s) in 1.6 s at a 400 ms poll, down " + down);
    }
    {
      const s = await scene("hang", "hang", 400);
      s.p.ch.start();
      await settle(s.p);
      const asksAt = s.asks();
      await wait(1600);
      const asked = s.asks() - asksAt, tries = s.tries, down = s.down();
      await s.p.ch.stop();
      check(asked >= 3 && tries >= 2 && down === true,
        "989c a socket that never opens and never closes does not stop the asking, and is given up and tried again: "
        + asked + " request(s) in 1.6 s at a 400 ms poll, " + tries + " socket(s), down " + down);
    }
    {
      const s = await scene("back", "refuse", 300);
      s.p.ch.start();
      await settle(s.p);
      const wasDown = await until(() => s.down() === true, 5000) && s.down();
      s.mode = "open";
      const up = await until(() => s.down() === false, 5000);
      const told = s.told.join(",");
      await s.p.ch.stop();
      check(wasDown === true && up && /^true(,true)*,false$/.test(told),
        "989d once a socket opens the channel says it is up, and tells the shell each turn: down first " + wasDown
        + ", up " + up + ", told " + (told || "nothing"));
    }
    {
      const s = await scene("old", "silent", 1e9);
      s.p.ch.start();
      await settle(s.p);
      await wait(3000);
      const tries = s.tries, down = s.down();
      await s.p.ch.stop();
      check(tries >= 2 && down === false,
        "989e a connector that does not say when its socket opens keeps the reconnect after a close and is never said down: "
        + "tried " + tries + " time(s) in 3 s, down " + down);
    }
  } catch (e) {
    check(false, "harness (the leg 989a): " + (e && e.stack ? e.stack : e));
  }
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
if (partOn("p962a")) {
  try {
    markPart("p962a");
    const got = await kelvinBatch(C);
    check(got.sign === got.SIGN && got.ascii === got.ASCII,
      "962a a batch lands both the Kelvin sign name and kelvin.ec: sign " + JSON.stringify(got.sign)
      + ", ascii " + JSON.stringify(got.ascii));
  } catch (e) {
    check(false, "harness (the leg 962a): " + (e && e.stack ? e.stack : e));
  }
}
if (partOn("p962b")) {
  try {
    markPart("p962b");
    const planted = await liftChannel("plant:land-fold", async mod => {
      const x = await kelvinBatch(mod);
      return (x.sign === x.SIGN) !== (x.ascii === x.ASCII);
    });
    check(planted.turned && planted.back, "962b lifting plant:land-fold drops one of the Kelvin sign name and kelvin.ec, and the product file is never written: "
      + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "harness (the leg 962b): " + (e && e.stack ? e.stack : e));
  }
}

/* Two names the path key joins are one file: the batch lands the newest only, and applied
   names that one. An exact path as the key of the batch names both, while the mirror
   still holds the newest. */
if (partOn("p925")) {
  try {
    markPart("p925");
    const writer = { keyId: LEAD.keyId, privateKey: LEAD.privateKey };
    const K2 = crypto.randomBytes(32);
    const ctx = { keyFor: e => (e === 2 ? K2 : e === 1 ? K1 : null) };
    const seal = (p, body, epoch, counter, key) => B.seal({ relayTeamId: RT, epoch, teamKey: key, writer,
      path: p, body, counter, place: "root" });
    const item = (blob, seq) => ({ seq, ct: blob.ciphertext, meta: { v: 1, id: blob.id, writer: blob.writerKeyId,
      epoch: blob.epoch, counter: blob.counter, size: blob.ciphertext.length, sig: blob.signature, nonce: blob.nonce,
      supersedes: blob.supersedes, del: !!blob.deletion } });
    const batches = [
      ["Guide.ec", "old", "guide.ec", "new"],
      ["Guide.ec", "new", "guide.ec", "old"],
      ["CAF\u00c9.ec", "old", "caf\u00e9.ec", "new"],
      ["\u1f88x.ec", "new", "\u1f80x.ec", "old"],
    ];
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-relay-land-"));
    const rows = [];
    try {
      for (const [n1, b1, n2, b2] of batches) {
        const dir = path.join(root, "b" + rows.length);
        fs.mkdirSync(dir);
        const prog = C.createProgram({ io: C.diskIO(dir, C.writeWhole), pin: PIN, clock: () => 1700000000000, save() {} });
        const newer = b1 === "new" ? n1 : n2;
        const first = seal(n1, b1, b1 === "new" ? 2 : 1, 1, b1 === "new" ? K2 : K1);
        const second = seal(n2, b2, b2 === "new" ? 2 : 1, 1, b2 === "new" ? K2 : K1);
        const batch = prog.applyBatch([item(first, 1), item(second, 2)], ctx);
        const names = fs.readdirSync(dir).map(n => ({ n, body: fs.readFileSync(path.join(dir, n), "utf8") }));
        const one = names.length === 1 && names[0].n === newer && names[0].body === "new"
          && batch.applied.length === 1 && batch.applied[0] === newer;
        rows.push({ newer, one, applied: batch.applied, names });
      }
      check(rows.length === batches.length && rows.every(r => r.one),
        "925a two names the path key joins land as one file, the newest, and applied names only that one: "
        + rows.map(r => JSON.stringify(r.newer) + " applied " + JSON.stringify(r.applied)
          + " disk " + JSON.stringify(r.names)).join("; "));
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* this leg's folder, already gone */ }
    }
  } catch (e) {
    check(false, "harness (the leg 925a): " + (e && e.stack ? e.stack : e));
  }


/* The path key's joined classes, and pairs it keeps apart, checked against this volume.
   The volume is the oracle. On Windows the files are created and removed here; on another
   system this leg does not run. */

  if (process.platform !== "win32") {
    check(true, "925b not on this system: this leg did not run, the volume's uppercase table is read on Windows alone");
  } else {
    let dir = null;
    try {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-relay-upcase-"));
      const nameOf = u => "a" + String.fromCharCode(u) + "z.t";
      const keyOfUnit = u => {
        const p = B.checkPath(nameOf(u));
        if (!p.ok || p.segments.length !== 1) return null;
        return p.folded[0];
      };
      const byKey = new Map();
      for (let u = 0; u < 65536; u++) {
        if (u >= 0xD800 && u <= 0xDFFF) continue;
        const k = keyOfUnit(u);
        if (k == null) continue;
        let g = byKey.get(k);
        if (!g) { g = []; byKey.set(k, g); }
        g.push(u);
      }
      const joins = [];
      for (const g of byKey.values()) if (g.length >= 2) joins.push(g);
      /* Kept apart by the path key, so the volume must keep each pair as two files. */
      const hazards = [
        [0x212a, 0x6b], [0x131, 0x69], [0xa7ce, 0xa7cf], [0xa7d2, 0xa7d3],
        [0xa7d4, 0xa7d5], [0x3c2, 0x3c3], [0xdf, 0x73], [0x61, 0x62],
      ];
      const apart = [];
      for (const [a, b] of hazards) {
        const ka = keyOfUnit(a), kb = keyOfUnit(b);
        if (ka && kb && ka !== kb) apart.push([a, b]);
      }
      const units = new Set();
      for (const g of joins) for (const u of g) units.add(u);
      for (const [a, b] of apart) { units.add(a); units.add(b); }
      const idOf = new Map();
      for (const u of units) {
        const abs = path.join(dir, nameOf(u));
        fs.writeFileSync(abs, "x");
        const st = fs.statSync(abs, { bigint: true });
        idOf.set(u, st.dev.toString() + ":" + st.ino.toString());
      }
      if ([...idOf.values()].every(id => id.endsWith(":0"))) throw new Error("the file index was 0");
      const badJoins = [];
      for (const g of joins) {
        const ids = new Set(g.map(u => idOf.get(u)));
        if (ids.size !== 1) badJoins.push(g.map(u => u.toString(16)).join("+"));
      }
      const badApart = [];
      for (const [a, b] of apart) {
        if (idOf.get(a) === idOf.get(b)) badApart.push(a.toString(16) + "+" + b.toString(16));
      }
      check(joins.length > 0 && apart.length > 0 && badJoins.length === 0 && badApart.length === 0,
        "925b the volume agrees with the path key: " + joins.length + " joined classes, " + apart.length
        + " pairs kept apart, " + badJoins.length + " joined classes the volume held as more than one file"
        + (badJoins.length ? " (" + badJoins.slice(0, 4).join(", ") + ")" : "")
        + ", " + badApart.length + " apart pairs the volume held as one file"
        + (badApart.length ? " (" + badApart.slice(0, 4).join(", ") + ")" : ""));
    } catch (e) {
      check(false, "harness (the leg 925b): " + (e && e.stack ? e.stack : e));
    } finally {
      if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* this leg's folder, already gone */ } }
    }
  }
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
if (partOn("p961l")) {
  try {
    markPart("p961l");
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
if (partOn("p961h")) {
  try {
    markPart("p961h");
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
if (partOn("p968")) {
  try {
    markPart("p968");
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
if (partOn("p969")) {
  try {
    markPart("p969");
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
if (partOn("p963")) {
  try {
    markPart("p963");
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
}

/* ---- 981: the desk hears a revoked service key, and a list that does not verify changes nothing ---- */
  if (partOn("p981")) {
  markPart("p981");


  {
    const REVOKED_SAID = "That grant was signed by a revoked key, so the relay did not take it.";
    const T0R = 1700000000000;
    function revText(keys) {
      const doc = { kind: "etiuda-revocations", format: 1, serial: 1, keys: keys.slice().sort(),
        sig: { alg: "ed25519", keyId: K.ROOT.id, value: "" } };
      doc.sig.value = crypto.sign(null, Buffer.from("etiuda-revocations\n" + doc.serial + "\n" + doc.keys.join(","), "utf8"), K.ROOT.privateKey).toString("hex");
      return JSON.stringify(doc);
    }
    function corrupt(text) {
      const doc = JSON.parse(text);
      doc.sig.value = (doc.sig.value[0] === "a" ? "b" : "a") + doc.sig.value.slice(1);
      return JSON.stringify(doc);
    }
    async function ask(RL, method, p, json) {
      const init = { method, headers: { "content-type": "application/json" }, body: JSON.stringify(json), duplex: "half" };
      const res = await W.fetch(new Request("https://relay.test" + p, init), RL.env);
      const bytes = Buffer.from(await res.arrayBuffer());
      let parsed = null;
      try { parsed = JSON.parse(bytes.toString("utf8")); } catch { parsed = null; }
      return { status: res.status, json: parsed };
    }
    async function heard(o) {
      const RL = S.relayEnv({ roots: K.ROOTS });
      RL.clock.now = T0R;
      const rt = hex(16);
      const opts = o || {};
      if (opts.list !== undefined) RL.env.REVOKED = opts.list;
      const spec = {};
      if (opts.root !== true) spec.grant = K.delegatedGrantFor(LEAD.pub, T0R);
      const made = await ask(RL, "POST", "/relay/v1/teams", K.createBody(rt, LEAD, T0R, bytes => signHex(LEAD, bytes), spec));
      if (opts.thenList !== undefined) RL.env.REVOKED = opts.thenList;
      const who = keyPair(true);
      const request = async (method, url, headers, body) => {
        const init = { method, headers: headers || {} };
        if (body && method !== "GET") { init.body = body; init.duplex = "half"; }
        const res = await W.fetch(new Request(String(url), init), RL.env);
        const bytes = Buffer.from(await res.arrayBuffer());
        return { status: res.status, header: n => res.headers.get(n), bytes, socket: res.headers.get("x-stand-in-socket") };
      };
      const desk = opened(C, "981-" + rt.slice(0, 8), { rt, id: "t-" + hex(8) }, who, "desk:" + who.keyId, {
        request, connect: () => ({ send() {}, close() {} }), seat: () => seatFor(who, RL.clock.now),
      });
      let said = [];
      try { desk.ch.start(); await desk.ch.idle(); said = desk.said.slice(); }
      finally { await desk.ch.stop(); }
      const hello = await ask(RL, "POST", "/relay/v1/t/" + rt + "/hello", {});
      return { made: made.status, madeError: made.json && made.json.error, said, hello: hello.status, helloError: hello.json && hello.json.error };
    }
    try {
      const a = await heard({ thenList: revText([K.DELEGATE.pub]) });
      const aSaid = a.said.some(l => l === "the relay: " + REVOKED_SAID);
      check(a.made === 200 && a.hello === 403 && a.helloError === "revoked" && aSaid && B.REASONS.revoked === REVOKED_SAID,
        "981a a desk whose team's grant was signed by a revoked service key is told that, at hello: made " + a.made
        + ", hello " + a.hello + " " + a.helloError + ", said " + JSON.stringify(a.said));
      const b = await heard({});
      check(b.made === 200 && b.hello === 200 && b.said.every(l => l.indexOf(REVOKED_SAID) < 0),
        "981b the same delegated grant with no list set is taken, and the desk is not told of a revoked key: made " + b.made
        + ", hello " + b.hello + " " + b.helloError + ", said " + JSON.stringify(b.said));
      const bad = corrupt(revText([K.DELEGATE.pub]));
      const g = await heard({ list: bad });
      const gText = JSON.stringify(g);
      check(g.made === 200 && g.hello === 200 && g.said.every(l => l.indexOf(REVOKED_SAID) < 0) && gText.indexOf(JSON.parse(bad).sig.value) < 0,
        "981c a list with a bad signature is ignored: the desk still opens and nothing of the list is said: made " + g.made
        + ", hello " + g.hello + " " + g.helloError + ", said " + JSON.stringify(g.said));
      const h = await heard({ root: true, list: revText([K.ROOT.pub, K.DELEGATE.pub]) });
      check(h.made === 200 && h.hello === 200 && h.said.every(l => l.indexOf(REVOKED_SAID) < 0),
        "981d a root-signed grant is taken while the list is set, and the desk is not told of a revoked key: made " + h.made
        + ", hello " + h.hello + " " + h.helloError + ", said " + JSON.stringify(h.said));
    } catch (e) {
      check(false, "981 harness: " + (e && e.stack ? e.stack : e));
    }
  }
  }
  

/* ---- 990 and 991: the team after the sweep (Claude alpha's ruling of 2026-10-25, option (b)). Each scene runs on a relay of
   its own whose clock the legs move, with the channel module it is handed, so a plant below runs the same scene over a planted
   copy. 990: a paid team with two desks; past the sweep the relay holds nothing of it, and the lead takes one desk off while it
   is gone, with a new key; nothing is made again until the renewal. Renewed, the lead makes the space again under the same id and
   enrols the roster as it stands: the kept desk starts over with the relay by itself and reads the team again, the one taken off
   reaches nothing, and no file of any mirror goes at any step. 991: the lead on two computers with one key, the second off while
   the first publishes a newer edition: back after the old sweep day of a team renewed and never swept, it does not start over
   (991a); back after a sweep and a renewal the first one made, it starts over and still takes the newer edition rather than
   sending its older one (991b). ---- */

  let scenes9 = 0;
function relay9() {
  const RS = S.relayEnv({ roots: K.ROOTS });
  const DAYMS = K.DAY, BASE = Date.UTC(2026, 4, 4, 12);
  RS.clock.now = BASE;
  const realNow = Date.now;
  let jump = 0;
  const sfetch = (url, init) => {
    const i = Object.assign({}, init);
    if (i.body && i.method !== "GET") i.duplex = "half"; else delete i.body;
    return W.fetch(new Request(url, i), RS.env);
  };
  const admin9 = async (method, p, json) => {
    const res = await sfetch("https://relay.test" + p, { method, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify(json), "utf8") });
    return { status: res.status, json: JSON.parse(Buffer.from(await res.arrayBuffer()).toString("utf8") || "null") };
  };
  /* A program's way to this relay, each call kept in `log` as "<method> <route>". */
  const way = log => async (method, url, headers, body) => {
    log.push(method + " " + String(url).replace(/^https:\/\/[^/]+\/relay\/v1\/t\/[0-9a-f]{32}\//, ""));
    const res = await sfetch(url, { method, headers, body });
    return { status: res.status, header: n => res.headers.get(n), bytes: Buffer.from(await res.arrayBuffer()) };
  };
  const tm = { rt: hex(16), id: "t-" + hex(8) }, LB9 = boxPair(), K9 = new Map([[1, crypto.randomBytes(32)]]);
  const pin9 = () => ({ teamId: tm.id, rt: tm.rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } });
  const doc9 = (epoch, ds) => JSON.stringify(signDoc({ format: 1, kind: "etiuda-team", id: tm.id, catalogs: ["lane-board"],
    lead: { keyId: LEAD.keyId, public: LEAD.pub, box: LB9.pub }, sealed: true, exportsSealed: false, epoch, rev: 1,
    channel: { kind: "relay", rt: tm.rt, url: URLV1 }, roster: ds.map(d => ({ desk: { id: d.k.keyId, key: d.k.pub, box: d.box.pub },
      wrap: wrapFor(K9.get(epoch), d.box.pub, tm.id, epoch, d.k.keyId) })) }, LEAD), null, 1) + "\n";
  const enrol9 = async (rev, ...ds) => {
    const list = ds.map(d => ({ id: d.k.keyId, pub: d.k.pub, desk: d.k.keyId })), t = RS.clock.now;
    return admin9("POST", "/relay/v1/t/" + tm.rt + "/devices", { keys: list, rev, t, sig: signHex(LEAD, core.devicesBytes(tm.rt, rev, t, list)) });
  };
  const store9 = () => RS.stores.get(tm.rt);
  /* What the relay holds of the lead's, by path: each live blob of its key opened under the team key of its epoch. */
  const leadFiles = () => {
    const s = store9(), out = {};
    if (!s) return out;
    for (const [k, v] of s.dump()) {
      if (!k.startsWith("blob:")) continue;
      const m = JSON.parse(v);
      if (m.writer !== LEAD.keyId || m.del) continue;
      const ct = RS.bucket.objects.get(m.obj);
      const r = ct ? B.openBlob({ blob: { id: m.id, epoch: m.epoch, supersedes: m.supersedes, writerKeyId: m.writer, counter: m.counter, nonce: m.nonce,
        signature: m.sig, ciphertext: ct }, relayTeamId: tm.rt, epoch: m.epoch, teamKey: K9.get(m.epoch) || Buffer.alloc(32),
        trust: { lead: { keyId: LEAD.keyId, public: LEAD.pub }, desks: [] }, counters: {} }) : null;
      if (r && r.ok && r.kind === "file") out[r.path] = r.body;
    }
    return out;
  };
  const liveBy = keyId => { const s = store9(); return s ? s.dump().filter(([k, v]) => k.startsWith("blob:") && JSON.parse(v).writer === keyId && !JSON.parse(v).del).length : 0; };
  const progs = [];
  const lead9 = (mod, name, more) => {
    const log = [];
    const p = program(name, LEAD, "root", Object.assign({ mod, rt: tm.rt, pin: pin9, request: way(log), connect: () => null, watch: false,
      keyFor: e => K9.get(e) || null, sealEpoch: () => Math.max(...K9.keys()), agree: agreeWith(LB9) }, more || {}));
    progs.push(p);
    return Object.assign(p, { log });
  };
  /* `cut`, where given: once armed, the first call after a session opens throws, as a computer shut down there would leave it. */
  const desk9 = (mod, name, d, cut, more) => {
    const held = new Map([[1, K9.get(1)]]), mirror = path.join(LAB, name), log = [], base9 = way(log);
    const request = async (...a) => {
      if (cut && cut.armed && cut.seen) { cut.done = true; throw new Error("this computer was shut down"); }
      const res = await base9(...a);
      if (cut && cut.armed && a[0] === "POST" && /\/session$/.test(String(a[1])) && res.status === 200) cut.seen = true;
      return res;
    };
    const p = program(name, d.k, "desk:" + d.k.keyId, Object.assign({ mod, rt: tm.rt, pin: pin9, request, connect: () => null, watch: false,
      seat: () => seatFor(d.k, RS.clock.now),
      me: () => ({ keyId: d.k.keyId, public: d.k.pub, privateKey: d.k.privateKey, place: "desk:" + d.k.keyId, box: d.box.pub }),
      keyFor: e => held.get(e) || null, sealEpoch: () => Math.max(...held.keys()), agree: agreeWith(d.box),
      onTeam: () => {
        let doc = null;
        try { doc = JSON.parse(read(mirror, C.TEAM_NAME)); } catch { return; }
        const mine = (doc && Array.isArray(doc.roster) ? doc.roster : []).find(r => r && r.desk && r.desk.id === d.k.keyId);
        const key = mine ? unwrapWith(d.box, mine.wrap, tm.id, doc.epoch, d.k.keyId) : null;
        if (key) held.set(doc.epoch, key);
      } }, more || {}));
    progs.push(p);
    return Object.assign(p, { held, log });
  };
  /* The team row as a relay from before the copy's stamp keeps it. */
  const unstamp = () => { const s = store9(), row = s ? s.get("team") : null; if (row && row.made) { delete row.made; s.put("team", row); } };
  return { RS, DAYMS, BASE, tm, K9, doc9, enrol9, admin9, store9, leadFiles, liveBy, lead9, desk9, unstamp, progs, tag: "s" + (++scenes9),
    at: ms => { jump += ms - RS.clock.now; RS.clock.now = ms; },
    clockOn: () => { Date.now = () => realNow() + jump; },
    done: async () => { for (const p of progs) { try { await p.ch.stop(); } catch { /* stopped */ } } Date.now = realNow; } };
}
  const names9 = dir => filesUnder(dir).map(f => path.relative(dir, f).split(path.sep).join("/")).sort();


  const epoch9 = dir => { try { return JSON.parse(read(dir, C.TEAM_NAME)).epoch; } catch { return null; } };


  const ED9 = ["{\"note\":\"Lane Board edition one\"}\n", "{\"note\":\"Lane Board edition two\"}\n"];

async function scene990(mod) {
  const X = relay9(), { tm, BASE, DAYMS } = X;
  const DK = { k: keyPair(true), box: boxPair() }, DE = { k: keyPair(true), box: boxPair() };
  const NOTE = "A note of the kept desk's own.\n", AFTER = "Written by the kept desk after the renewal.\n";
  const devOf = d => { const s = X.store9(); return !!s && s.get("dev:" + d.k.keyId) !== undefined; };
  try {
    X.clockOn();
    const made = await X.admin9("POST", "/relay/v1/teams", createBody(tm.rt, X.RS.clock.now));
    const enrolled = await X.enrol9(1, DK, DE);
    if (made.status !== 200 || enrolled.status !== 200) throw new Error("the team was not made: " + JSON.stringify([made.json, enrolled.json]));
    const lead = X.lead9(mod, "990-lead-" + X.tag), dk = X.desk9(mod, "990-kept-" + X.tag, DK), de = X.desk9(mod, "990-off-" + X.tag, DE);
    put(lead.mirror, C.TEAM_NAME, X.doc9(1, [DK, DE]));
    put(lead.mirror, "lane.ec", ED9[0]);
    lead.ch.start(); dk.ch.start(); de.ch.start();
    await settle(lead, dk, de);
    put(dk.mirror, "desks/" + DK.k.keyId + "/note.ec", NOTE);
    await settle(dk, lead);
    const working = read(dk.mirror, "lane.ec") === ED9[0] && read(de.mirror, "lane.ec") === ED9[0]
      && read(lead.mirror, "desks/" + DK.k.keyId + "/note.ec") === NOTE;
    const before = { lead: names9(lead.mirror), dk: names9(dk.mirror), de: names9(de.mirror) };

    /* Past the sweep (the grant ended at day 30, read-only to day 120): the first call sweeps the team. The store keeps
       the lead's public key alone, the mark a later create under another key is refused by. */
    X.at(BASE + 121 * DAYMS);
    await settle(lead, dk, de);
    const markOnly = () => {
      const s = X.store9();
      if (!s) return { ok: false, rows: "none" };
      const d = s.dump();
      let pub = null;
      try { pub = d.length === 2 && d[1][0] === "sweptAt" ? JSON.parse(d[0][1]) : null; } catch { pub = null; }
      return { ok: d.length === 2 && d[0][0] === "swept" && pub === LEAD.pub, rows: d.map(e => e[0]).join(",") || "empty" };
    };
    const sweptNow = markOnly();
    const swept = sweptNow.ok;
    const goneAt = [dk, de, lead].map(p => (p.ch.lapse() ? p.ch.lapse().step : "none"));
    /* While it is gone the lead takes the second desk off, with a new key; nothing is made again before the renewal. */
    X.K9.set(2, crypto.randomBytes(32));
    put(lead.mirror, C.TEAM_NAME, X.doc9(2, [DK]));
    X.at(BASE + 123 * DAYMS);
    await settle(lead, dk, de);
    const stillNow = markOnly();
    const stillSwept = stillNow.ok;

    /* Renewed: the space made again under the same id by the lead's signed create, the roster as it stands enrolled, and a
       new edition published. Nothing is done for either desk. */
    X.at(BASE + 125 * DAYMS);
    const again = await X.admin9("POST", "/relay/v1/teams", createBody(tm.rt, X.RS.clock.now));
    const enrolledAgain = await X.enrol9(1, DK);
    put(lead.mirror, "lane.ec", ED9[1]);
    await settle(lead, dk, de);
    await settle(lead, dk, de);
    put(dk.mirror, "desks/" + DK.k.keyId + "/after.ec", AFTER);
    await settle(dk, lead);
    const files = X.leadFiles(), paths = Object.keys(files).sort();
    const back = again.status === 200 && enrolledAgain.status === 200 && paths.indexOf(C.TEAM_NAME) >= 0 && files["lane.ec"] === ED9[1];
    const keptReads = read(dk.mirror, "lane.ec") === ED9[1] && epoch9(dk.mirror) === 2 && dk.held.has(2) && dk.ch.online() && dk.ch.lapse() === null;
    const keptSends = read(lead.mirror, "desks/" + DK.k.keyId + "/after.ec") === AFTER && X.liveBy(DK.k.keyId) >= 2;
    const a = { ok: working && swept && goneAt.join() === "gone,gone,gone" && stillSwept && back && keptReads && keptSends,
      line: "before " + working + ", swept " + swept + " (rows " + sweptNow.rows + ", told " + goneAt.join(" ") + "), still swept before the renewal " + stillSwept + " (rows " + stillNow.rows + ")"
        + "; made again under the same id " + again.status + " and enrolled " + enrolledAgain.status + ", the lead's files back at the relay "
        + JSON.stringify(paths) + "; the kept desk reads the new edition and the new key's team file " + keptReads + " (seq " + dk.prog.state().seq
        + ") and its files reach the lead, the one from before the sweep sent again, " + keptSends + " (" + X.liveBy(DK.k.keyId) + " live)" };

    const offOut = !devOf(DE) && !de.ch.online() && read(de.mirror, "lane.ec") === ED9[0] && epoch9(de.mirror) === 1 && !!de.ch.lapse() && de.ch.lapse().step === "gone";
    const after = { lead: names9(lead.mirror), dk: names9(dk.mirror), de: names9(de.mirror) };
    const kept = ["lead", "dk", "de"].every(n => before[n].length >= 2 && before[n].every(f => after[n].indexOf(f) >= 0));
    const short = new Set(before.dk.slice(1)), control = before.dk.some(f => !short.has(f));
    const b = { ok: offOut && kept && control,
      line: "enrolled " + devOf(DE) + ", online " + de.ch.online() + ", its edition " + (read(de.mirror, "lane.ec") === ED9[0] ? "the old one" : "changed")
        + ", its team file's epoch " + epoch9(de.mirror) + ", told " + (de.ch.lapse() ? de.ch.lapse().step : "nothing") + "; the files "
        + JSON.stringify([before.lead.length, before.dk.length, before.de.length]) + (kept ? " all still there" : " not all still there")
        + ", the comparison " + (control ? "reads a missing file" : "blind") };
    return { a, b };
  } finally {
    await X.done();
  }
}

/* The lead on two computers, one key: the first (the one that stays) publishes edition one, the second takes it and goes off.
   `swept`: past the sweep, the first makes the space again and publishes edition two; else the team is renewed before its sweep
   and the first publishes edition two. The second comes back after the old sweep day. */
async function scene991(mod, swept, noStamp) {
  const X = relay9(), { tm, BASE, DAYMS } = X;
  try {
    X.clockOn();
    const made = await X.admin9("POST", "/relay/v1/teams", createBody(tm.rt, X.RS.clock.now));
    if (made.status !== 200) throw new Error("the team was not made: " + JSON.stringify(made.json));
    if (noStamp) X.unstamp();
    const first = X.lead9(mod, "991-first-" + X.tag), second = X.lead9(mod, "991-second-" + X.tag);
    /* A start over is the program forgetting the relay; a whole list after a long absence (1162) is not one. */
    let over = 0;
    const forget = second.prog.forgetRelay;
    second.prog.forgetRelay = () => { over += 1; return forget(); };
    put(first.mirror, C.TEAM_NAME, X.doc9(1, []));
    put(first.mirror, "lane.ec", ED9[0]);
    first.ch.start();
    await settle(first);
    second.ch.start();
    await settle(second);
    const both = read(second.mirror, "lane.ec") === ED9[0];
    await second.ch.stop();
    if (swept) {
      X.at(BASE + 121 * DAYMS);
      await settle(first);
      X.at(BASE + 122 * DAYMS);
      await X.admin9("POST", "/relay/v1/teams", createBody(tm.rt, X.RS.clock.now));
      if (noStamp) X.unstamp();
    } else {
      X.at(BASE + 100 * DAYMS);
      await X.admin9("POST", "/relay/v1/t/" + tm.rt + "/grant", { grant: K.grantFor(LEAD.pub, X.RS.clock.now) });
    }
    put(first.mirror, "lane.ec", ED9[1]);
    await settle(first);
    const published = X.leadFiles()["lane.ec"] === ED9[1];
    /* The second computer back, past the old sweep day (day 120). */
    X.at(BASE + 126 * DAYMS);
    const from = second.log.length;
    second.ch.start();
    await settle(second, first);
    await settle(second, first);
    const calls = second.log.slice(from);
    const since0 = calls.filter(c => c === "GET since/0").length, puts = calls.filter(c => c.indexOf("PUT ") === 0).length;
    const kept = X.leadFiles()["lane.ec"] === ED9[1] && read(first.mirror, "lane.ec") === ED9[1] && read(second.mirror, "lane.ec") === ED9[1];
    return { both, published, kept, since0, puts, over, swept: !!swept };
  } finally {
    await X.done();
  }
}
/* A copy of the channel with one marked line replaced by `text`, handed to `fn`; the product file is only read. */
async function swapChannel(tag, text, fn) {
  const src = path.join(ROOT, "shell", "relay", "channel.cjs");
  const beforeBytes = fs.readFileSync(src), digest = sha(beforeBytes);
  let turned = false, detail = "plant line absent";
  try {
    const lines = beforeBytes.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf(tag) >= 0);
    if (at >= 0) {
      lines[at] = text;
      turned = await fn(loadPlantedChannel(lines.join("\n")));
      detail = turned ? "the check lifted" : "the check still held";
    }
  } catch (e) {
    detail = e && e.stack ? e.stack : String(e);
  }
  return { turned, back: sha(fs.readFileSync(src)) === digest, detail };
}
/* A desk of a team swept and made again, with the relay's stamp of its copy or (`o.noStamp`) a relay from before it. `o.quit`: the
   desk shuts down at its first call after the session the renewal lets it open, and starts again. `o.noLapse`: it kept no lapse
   (closed through the whole lapse); `o.noMade`: nor any stamp, as a record from before the stamp. Each reads the edition published
   after the renewal. */
async function scene992(mod, o) {
  const x = o || {}, X = relay9(), { tm, BASE, DAYMS } = X;
  const D = { k: keyPair(true), box: boxPair() }, name = "992-desk-" + X.tag, stateAt = path.join(LAB, name + ".json");
  try {
    X.clockOn();
    const made = await X.admin9("POST", "/relay/v1/teams", createBody(tm.rt, X.RS.clock.now));
    await X.enrol9(1, D);
    if (made.status !== 200) throw new Error("the team was not made: " + JSON.stringify(made.json));
    if (x.noStamp) X.unstamp();
    const stamp1 = (X.store9().get("team") || {}).made || null;
    const lead = X.lead9(mod, "992-lead-" + X.tag), desk = X.desk9(mod, name, D);
    put(lead.mirror, C.TEAM_NAME, X.doc9(1, [D]));
    put(lead.mirror, "lane.ec", ED9[0]);
    lead.ch.start(); desk.ch.start();
    await settle(lead, desk);
    const working = read(desk.mirror, "lane.ec") === ED9[0];
    X.at(BASE + 121 * DAYMS);
    await settle(lead, desk);
    /* A swept store keeps the lead's public key and the instant it dates from alone. An empty store is a team never made. */
    const sweptRows = X.store9() ? X.store9().dump() : [];
    let sweptPub = null;
    try { sweptPub = sweptRows.length === 2 && sweptRows[1][0] === "sweptAt" ? JSON.parse(sweptRows[0][1]) : null; } catch { sweptPub = null; }
    const swept = sweptRows.length === 2 && sweptRows[0][0] === "swept" && sweptPub === LEAD.pub;
    await desk.ch.stop();
    const kept = JSON.parse(fs.readFileSync(stateAt, "utf8"));
    if (x.noLapse) delete kept.lapse;
    if (x.noMade) delete kept.made;
    fs.writeFileSync(stateAt, JSON.stringify(kept));
    X.at(BASE + 125 * DAYMS);
    await X.admin9("POST", "/relay/v1/teams", createBody(tm.rt, X.RS.clock.now));
    if (x.noStamp) X.unstamp();
    const stamp2 = (X.store9().get("team") || {}).made || null;
    await X.enrol9(1, D);
    put(lead.mirror, "lane.ec", ED9[1]);
    await settle(lead);
    let quitAt = "no quit";
    if (x.quit) {
      const cut = { armed: true, seen: false, done: false };
      const once = X.desk9(mod, name, D, cut);
      once.ch.start();
      await settle(once);
      await once.ch.stop();
      quitAt = cut.done ? "shut down after the session" : "never cut";
    }
    const again = X.desk9(mod, name, D);
    again.ch.start();
    await settle(again, lead);
    await settle(again, lead);
    const reads = read(again.mirror, "lane.ec") === ED9[1];
    const stamps = x.noStamp ? stamp1 === null && stamp2 === null : !!stamp1 && !!stamp2 && stamp1 !== stamp2;
    return { ok: working && swept && reads && stamps && (!x.quit || quitAt === "shut down after the session"),
      line: "before " + working + ", swept " + swept + ", the copy's stamp " + (x.noStamp ? "untold" : stamp1 && stamp2 && stamp1 !== stamp2 ? "new" : "the same")
        + ", " + quitAt + ", the desk reads the edition published after the renewal " + reads + " (seq " + again.prog.state().seq + ")" };
  } finally {
    await X.done();
  }
}
if (partOn("p990")) {
  try {
    markPart("p990");
    const s990 = await scene990(C);
    check(s990.a.ok, "990a a team renewed after its sweep comes back by itself: " + s990.a.line);
    check(s990.b.ok, "990b the desk taken off while the team was gone is not admitted after the renewal, and nothing on any mirror was removed at any step: " + s990.b.line);
    const seen = await liftChannel("plant:remade-seen", async mod => !(await scene990(mod)).a.ok);
    check(seen.turned && seen.back, "990c lifting plant:remade-seen, the desk never starts over with the relay's new copy, and 990a goes red: " + seen.detail
      + ", sha " + (seen.back ? "restored" : "differs"));
    const gone = await swapChannel("plant:remade-seq", "      st.seq = 0; for (const f of io.list()) io.remove(f);", async mod => !(await scene990(mod)).b.ok);
    check(gone.turned && gone.back, "990d a start over planted to remove the mirror's files at plant:remade-seq turns 990b red: " + gone.detail
      + ", sha " + (gone.back ? "restored" : "differs"));

    const r1 = await scene991(C, false);
    check(r1.both && r1.published && r1.kept && r1.over === 0 && r1.since0 === 1 && r1.puts === 0,
      "991a the lead's second computer, back after the old sweep day of a team renewed and never swept, hears the copy's stamp unchanged, does not start over and"
      + " takes the newer edition: both had edition one " + r1.both + ", the first published edition two " + r1.published + ", edition two on the relay"
      + " and on both computers " + r1.kept + ", starts over " + r1.over + ", lists from the start " + r1.since0 + " (the whole list after its absence), uploads " + r1.puts);
    const r2 = await scene991(C, true);
    check(r2.both && r2.published && r2.kept && r2.over === 1 && r2.since0 === 1 && r2.puts === 0,
      "991b the lead's second computer, back after a sweep and the first's renewal, starts over with the new copy and still takes the newer edition,"
      + " sending nothing older: both had edition one " + r2.both + ", the first published edition two " + r2.published + ", edition two on the relay"
      + " and on both computers " + r2.kept + ", starts over " + r2.over + ", lists from the start " + r2.since0 + ", uploads " + r2.puts);
    const r3 = await scene991(C, false, true);
    const known = await liftChannel("plant:remade-known", async mod => { const x = await scene991(mod, false, true); return x.over !== 0; });
    check(r3.kept && r3.over === 0 && r3.since0 === 2 && r3.puts === 0 && known.turned && known.back, "991c with a relay from before the copy's stamp, the second computer"
      + " asks the relay's list once and keeps its place (edition two everywhere " + r3.kept + ", starts over " + r3.over + ", lists from the start " + r3.since0 + ", the question and the whole list after its absence, uploads " + r3.puts
      + "); lifting plant:remade-known, it starts over with a copy the relay kept: " + known.detail + ", sha " + (known.back ? "restored" : "differs"));
    const owe = await swapChannel("plant:remade-owe",
      "      const owedAgain = m => { for (const k of Object.keys(m)) if (!m[k].del) m[k] = Object.assign({}, m[k], { sha: null }); };",
      async mod => { const x = await scene991(mod, true); return !x.kept || x.puts > 0; });
    check(owe.turned && owe.back, "991d a start over that forgets the bytes last sent at plant:remade-owe sends the older edition over the newer and turns 991b red: "
      + owe.detail + ", sha " + (owe.back ? "restored" : "differs"));
    const q1 = await scene992(C, { quit: true });
    check(q1.ok, "992a a desk shut down between the session that told the renewal and its first catch-up still starts over with the copy made anew: " + q1.line);
    const q2 = await scene992(C, { quit: true, noStamp: true });
    check(q2.ok, "992b the same with a relay that tells no stamp: the question the lapse raised is kept on disk and asked after the restart: " + q2.line);
    const q3 = await scene992(C, { noLapse: true });
    check(q3.ok, "992c a desk that kept no lapse, closed through the whole lapse, starts over by the copy's new stamp: " + q3.line);
    const q4 = await scene992(C, { noLapse: true, noMade: true });
    check(q4.ok, "992d a desk that kept neither a lapse nor a stamp asks the relay's list once and starts over: " + q4.line);
    const made9 = await liftChannel("plant:remade-made", async mod => !(await scene992(mod, { noLapse: true })).ok);
    check(made9.turned && made9.back, "992e lifting plant:remade-made, a desk with no lapse stays on its old place in the sequence, and 992c goes red: "
      + made9.detail + ", sha " + (made9.back ? "restored" : "differs"));
    const asked9 = await liftChannel("plant:remade-ask-kept", async mod => !(await scene992(mod, { quit: true, noStamp: true })).ok);
    check(asked9.turned && asked9.back, "992f lifting plant:remade-ask-kept, the question is lost with the shut down, and 992b goes red: "
      + asked9.detail + ", sha " + (asked9.back ? "restored" : "differs"));
  } catch (e) {
    check(false, "990 and 991 the team after the sweep: " + (e && e.stack ? e.stack : e));
  }
}

/* A4, the standing door (board 980): a desk whose person signed in knocks with its seat certificate, its one request sealed to the
   lead's box reaches the lead's mirror, and the lead's answer reaches the desk, with no invitation and nobody acting at the desk. */
const X_SPKI = Buffer.from("302a300506032b656e032100", "hex");
function xPair() {
  const p = crypto.generateKeyPairSync("x25519");
  return { pub: p.publicKey.export({ type: "spki", format: "der" }).subarray(X_SPKI.length).toString("hex"), privateKey: p.privateKey };
}
const xAgree = (mine, peer) => crypto.diffieHellman({ privateKey: mine.privateKey,
  publicKey: crypto.createPublicKey({ key: Buffer.concat([X_SPKI, Buffer.from(String(peer), "hex")]), format: "der", type: "spki" }) });
function certA4(deskPub, ref, now) {
  const issued = Math.max(1, now - K.HOUR);
  const c = { kind: "etiuda-seat-certificate", format: 1, licence: ref, desk: deskPub, person: hex(32), code: "ABCDEFGHJKMNPQRS", issued,
    until: issued + 20 * K.DAY, via: K.delegationFor(now, { fields: { may: ["licence"] } }) };
  c.sig = { alg: "Ed25519", keyId: K.DELEGATE.id, value: "" };
  c.sig.value = crypto.sign(null, core.certBytes(c), K.DELEGATE.privateKey).toString("hex");
  return c;
}
/* `atDoor`: the desk writes its request only when the relay names its id (onDoor), carrying that id, as the desk shell does
   (shell/main.js signinDoorKept); else the request stands in the mirror before the desk starts. */
async function sceneA4(mod, atDoor) {
  const rt = hex(16), pinTeam = "t-" + hex(8), ref = hex(16), who = keyPair(true), leadBox = xPair(), deskBox = xPair();
  R.clock.now += 1;
  const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
  R.clock.now += 1;
  const t = R.clock.now;
  const opened = await admin("POST", "/relay/v1/t/" + rt + "/door", { refs: [ref], t, sig: signHex(LEAD, core.doorBytes(rt, t, [ref])) });
  const pinOf = () => ({ teamId: pinTeam, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } });
  const door = { door: certA4(who.pub, ref, R.clock.now), box: leadBox.pub, inv: "" };
  const answers = [], said = [];
  const tD = transport("a4-desk"), tL = transport("a4-lead");
  const deskMirror = path.join(LAB, "a4-desk-" + rt), leadMirror = path.join(LAB, "a4-lead-" + rt);
  const JOIN = "{\"kind\":\"etiuda-join\",\"note\":\"" + "DoorAsk" + hex(6) + "\"}\n";
  let doorJoin = "";
  const desk = mod.createChannel({ rt, url: URLV1, mirror: deskMirror, stateFile: deskMirror + ".json", pin: pinOf,
    me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place: "desk:" + who.keyId, box: deskBox.pub }),
    agree: peer => xAgree(deskBox, peer), keyFor: () => null, sealEpoch: () => null,
    invite: () => door, seat: () => door.door, onAnswer: a => answers.push(a),
    onDoor: id => {
      door.inv = id;
      if (atDoor && !doorJoin) { doorJoin = JSON.stringify(Object.assign({ door: id }, JSON.parse(JOIN))) + "\n"; put(deskMirror, "desks/" + who.keyId + "/join.json", doorJoin); }
    },
    request: tD.request, connect: tD.connect, pollMs: 1e9, watch: false, say: l => said.push(String(l)) });
  const lead = mod.createChannel({ rt, url: URLV1, mirror: leadMirror, stateFile: leadMirror + ".json", pin: pinOf,
    me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root", box: leadBox.pub }),
    agree: peer => xAgree(leadBox, peer), keyFor: e => (e === 1 ? K1 : null), sealEpoch: () => 1, inviteKeys: () => [],
    request: tL.request, connect: tL.connect, pollMs: 1e9, watch: false });
  if (!atDoor) put(deskMirror, "desks/" + who.keyId + "/join.json", JOIN);
  const round = async ch => { for (let i = 0; i < 3; i++) { ch.kick(); await ch.idle(); } };
  desk.start();
  await round(desk);
  const askedAt = door.inv;
  lead.start();
  await round(lead);
  const reached = read(leadMirror, "desks/" + who.keyId + "/join.json");
  const text = relayStore(rt).dump().map(([k, v]) => k + "=" + v).join("\n") + [...R.bucket.objects.values()].map(b => b.toString("latin1")).join("\n");
  const wrote = /^[0-9a-f]{32}$/.test(askedAt) ? await lead.writeAnswer({ answer: "joined", inv: askedAt, deskId: who.keyId, deskBox: deskBox.pub, leadBox: leadBox.pub }) : { ok: false };
  await round(desk);
  try { await desk.stop(); } catch { /* already stopped */ }
  try { await lead.stop(); } catch { /* already stopped */ }
  const marker = JSON.parse(JOIN).note;
  const want = atDoor ? doorJoin : JOIN;
  const named = !atDoor || (want !== "" && JSON.parse(want).door === askedAt);
  return { made: made.status, opened: opened.status, door: askedAt, reached: reached === want, named, blind: text.indexOf(marker) < 0, wrote: !!wrote.ok,
    answers, ok: made.status === 200 && opened.status === 200 && /^[0-9a-f]{32}$/.test(askedAt) && reached === want && named && text.indexOf(marker) < 0
      && !!wrote.ok && answers.length === 1 && answers[0] === "joined" };
}
/* A door request turned away (board 980, the door-finding's words): a desk knocking at a door shut to its licence is told "turned"
   once a renewed certificate is refused there too, in the same round, and so is one whose request the lead dropped, at its next round;
   a desk let in at an open door is told nothing. Each desk renews as the shell's would, to a certificate issued later. */
async function sceneA4Turned(mod) {
  const rt = hex(16), pinTeam = "t-" + hex(8), ref = hex(16), leadBox = xPair();
  R.clock.now += 1;
  const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
  R.clock.now += 1;
  const t = R.clock.now;
  const opened = await admin("POST", "/relay/v1/t/" + rt + "/door", { refs: [ref], t, sig: signHex(LEAD, core.doorBytes(rt, t, [ref])) });
  const pinOf = () => ({ teamId: pinTeam, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } });
  const deskAt = (name, licence) => {
    const who = keyPair(true), box = xPair(), tr = transport("a4t-" + name), mirror = path.join(LAB, "a4t-" + name + "-" + rt);
    const door = { door: certA4(who.pub, licence, R.clock.now), box: leadBox.pub, inv: "" }, ends = [];
    let renewals = 0;
    const ch = mod.createChannel({ rt, url: URLV1, mirror, stateFile: mirror + ".json", pin: pinOf,
      seat: () => door.door, seatRenew: async () => { door.door = certA4(who.pub, licence, R.clock.now + (++renewals)); },
      me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place: "desk:" + who.keyId, box: box.pub }),
      agree: peer => xAgree(box, peer), keyFor: () => null, sealEpoch: () => null, invite: () => door, onDoor: id => { door.inv = id; },
      onInviteEnd: kind => ends.push(kind), request: tr.request, connect: tr.connect, pollMs: 1e9, watch: false, say: () => {} });
    return { ch, door, ends };
  };
  const round = async ch => { for (let i = 0; i < 3; i++) { ch.kick(); await ch.idle(); } };
  const shut = deskAt("shut", hex(16)), open = deskAt("open", ref);
  shut.ch.start(); open.ch.start();
  await round(shut.ch); await round(open.ch);
  const shutEnds = shut.ends.slice(), openNamed = /^[0-9a-f]{32}$/.test(open.door.inv), openQuiet = open.ends.length === 0;
  R.clock.now += 1;
  const at = R.clock.now;
  const dropped = openNamed ? await admin("POST", "/relay/v1/t/" + rt + "/invites", { add: [], drop: [open.door.inv], t: at,
    sig: signHex(LEAD, core.invitesBytes(rt, at, [], [open.door.inv])) }) : { status: 0 };
  await round(open.ch);
  for (const d of [shut, open]) { try { await d.ch.stop(); } catch { /* already stopped */ } }
  const ok = made.status === 200 && opened.status === 200 && shutEnds.length >= 1 && shutEnds.every(k => k === "turned") && !shut.door.inv
    && openNamed && openQuiet && dropped.status === 200 && open.ends.length >= 1 && open.ends.every(k => k === "turned");
  return { made: made.status, opened: opened.status, shutEnds, openNamed, openQuiet, dropped: dropped.status, openEnds: open.ends, ok };
}
/* A door request taken back (board 980, decision 33): the desk's request is up and in the lead's mirror; the desk then drops it from
   its own mirror and its invite() names the request's id and the lead's box with no certificate (door: null), as the desk shell does
   while a door join is withdrawing (shell/main.js signinDoorInvite). The key's own hello resumes the request's session, the deletion
   goes under the door's seal, the lead's mirror loses the request, and no door hello is sent again. `restart`: the withdrawal is
   made by a new channel on the same mirror and state, as after the shell rebuilds it (a sign out, a restart). */
async function sceneA4Withdraw(mod, restart) {
  const rt = hex(16), pinTeam = "t-" + hex(8), ref = hex(16), who = keyPair(true), leadBox = xPair(), deskBox = xPair();
  R.clock.now += 1;
  const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
  R.clock.now += 1;
  const t = R.clock.now;
  const opened = await admin("POST", "/relay/v1/t/" + rt + "/door", { refs: [ref], t, sig: signHex(LEAD, core.doorBytes(rt, t, [ref])) });
  const pinOf = () => ({ teamId: pinTeam, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } });
  let door = { door: certA4(who.pub, ref, R.clock.now), box: leadBox.pub, inv: "" };
  const tD = transport("a4w-desk"), tL = transport("a4w-lead");
  let knocks = 0, withdrawn = 0;
  const plain = tD.request;
  tD.request = (method, url, headers, body) => {
    if (method === "POST" && /\/session$/.test(String(url)) && body && /"door":\{/.test(Buffer.from(body).toString("utf8"))) knocks++;
    return plain(method, url, headers, body);
  };
  const deskMirror = path.join(LAB, "a4w-desk-" + rt), leadMirror = path.join(LAB, "a4w-lead-" + rt), rel = "desks/" + who.keyId + "/join.json";
  const JOIN = "{\"kind\":\"etiuda-join\",\"note\":\"" + "DoorBack" + hex(6) + "\"}\n";
  const deskOf = () => mod.createChannel({ rt, url: URLV1, mirror: deskMirror, stateFile: deskMirror + ".json", pin: pinOf,
    me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place: "desk:" + who.keyId, box: deskBox.pub }),
    agree: peer => xAgree(deskBox, peer), keyFor: () => null, sealEpoch: () => null, invite: () => door,
    onDoor: id => { if (!door.inv) { door.inv = id; put(deskMirror, rel, JSON.stringify(Object.assign({ door: id }, JSON.parse(JOIN))) + "\n"); } },
    onWithdrawn: () => { withdrawn++; },
    request: tD.request, connect: tD.connect, pollMs: 1e9, watch: false, say: () => {} });
  const lead = mod.createChannel({ rt, url: URLV1, mirror: leadMirror, stateFile: leadMirror + ".json", pin: pinOf,
    me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root", box: leadBox.pub }),
    agree: peer => xAgree(leadBox, peer), keyFor: e => (e === 1 ? K1 : null), sealEpoch: () => 1, inviteKeys: () => [],
    request: tL.request, connect: tL.connect, pollMs: 1e9, watch: false });
  const round = async ch => { for (let i = 0; i < 3; i++) { ch.kick(); await ch.idle(); } };
  let desk = deskOf();
  desk.start();
  await round(desk);
  lead.start();
  await round(lead);
  const reached = read(leadMirror, rel) !== null, asked = door.inv, knocked = knocks;
  if (restart) { try { await desk.stop(); } catch { /* already stopped */ } desk = deskOf(); }
  door = { door: null, box: leadBox.pub, inv: asked };
  try { fs.unlinkSync(path.join(deskMirror, ...rel.split("/"))); } catch { /* never written */ }
  if (restart) desk.start();
  await round(desk);
  await round(lead);
  /* What stays waiting for a lead: the relay's record of the request, whether it still serves the request to a lead that catches up
     afresh, whether it takes the lead's yes to it, and whether the lead that fetched it before still holds it: the relay serves the
     desk's box beside the deletion (relay/core.cjs admitWithdraw), so that lead opens the deletion and its mirror lets the request go. */
  const rec = (() => { try { return JSON.parse(relayStore(rt).dump().find(([k]) => k === "inv:" + asked)[1]); } catch { return null; } })();
  const freshMirror = path.join(LAB, "a4w-fresh-" + rt), tF = transport("a4w-fresh");
  const fresh = mod.createChannel({ rt, url: URLV1, mirror: freshMirror, stateFile: freshMirror + ".json", pin: pinOf,
    me: () => ({ keyId: LEAD.keyId, public: LEAD.pub, privateKey: LEAD.privateKey, place: "root", box: leadBox.pub }),
    agree: peer => xAgree(leadBox, peer), keyFor: e => (e === 1 ? K1 : null), sealEpoch: () => 1, inviteKeys: () => [],
    request: tF.request, connect: tF.connect, pollMs: 1e9, watch: false });
  fresh.start();
  await round(fresh);
  const unseen = read(freshMirror, rel) === null;
  const yes = await lead.writeAnswer({ answer: "joined", inv: asked, deskId: who.keyId, deskBox: deskBox.pub, leadBox: leadBox.pub });
  const leadKept = read(leadMirror, rel) !== null;
  for (const ch of [desk, lead, fresh]) { try { await ch.stop(); } catch { /* already stopped */ } }
  const ok = made.status === 200 && opened.status === 200 && /^[0-9a-f]{32}$/.test(asked) && reached && knocked === 1 && withdrawn >= 1
    && !!rec && rec.withdrawn === true && unseen && !(yes && yes.ok) && !leadKept && knocks === 1;
  return { made: made.status, opened: opened.status, asked: !!asked, reached, knocked, withdrawn, recWithdrawn: !!rec && rec.withdrawn === true, unseen,
    yesRefused: !(yes && yes.ok), why: yes && yes.reason, knocks, leadKept, ok };
}
if (partOn("pA4")) {
  try {
    markPart("pA4");
    for (const restart of [false, true]) {
      const w = await sceneA4Withdraw(C, restart);
      check(w.ok, (restart ? "a4k" : "a4j") + " a door request up at the lead's is taken back " + (restart ? "by a new channel on the same mirror, as after a sign out or a restart, " : "")
        + "with no certificate: the key's hello resumes the request's session, the deletion goes under the door's seal, the relay holds the request withdrawn, serves it to no lead catching up, refuses the lead's yes to it, and the lead that fetched it lets it go, and no door hello is sent again: " + JSON.stringify(w));
    }
    if (PLANTS_OFF) skip("a4l lifting plant:e4-withdraw-send, the door request stays for the lead to take, and a4j goes red");
    else {
      const p = await liftChannel("plant:e4-withdraw-send", async mod => !(await sceneA4Withdraw(mod, false)).ok);
      check(p.turned && p.back, "a4l lifting plant:e4-withdraw-send, the door request stays for the lead to take, and a4j goes red: "
        + p.detail.split("\n")[0] + ", sha " + (p.back ? "restored" : "differs"));
    }
    const a = await sceneA4(C);
    check(a.ok, "a4c a desk whose person signed in knocks at the team's standing door with its seat certificate and no invitation: the relay"
      + " names its request, the request sealed to the lead's box reaches the lead's mirror, the relay's rows and bucket never hold its"
      + " text, and the lead's answer reaches the desk as joined: " + JSON.stringify(a));
    const g = await sceneA4(C, true);
    check(g.ok, "a4g the desk writes its request only when the relay names its id, carrying that id, and its one upload still reaches the"
      + " lead's mirror whole and is answered joined, with no relay change: " + JSON.stringify(g));
    const h = await sceneA4Turned(C);
    check(h.ok, "a4h a desk knocking at a door shut to its licence is told turned once its renewed certificate is refused there too, one whose"
      + " door request the lead dropped is told turned at its next round, and one let in at an open door is told nothing: " + JSON.stringify(h));
    if (PLANTS_OFF) skip("a4i lifting plant:door-turned, a door request turned away is never told, and a4h goes red");
    else {
      const p = await liftChannel("plant:door-turned", async mod => !(await sceneA4Turned(mod)).ok);
      check(h.ok && p.turned && p.back, "a4i lifting plant:door-turned, a door request turned away is never told, and a4h goes red: "
        + p.detail.split("\n")[0] + ", sha " + (p.back ? "restored" : "differs"));
    }
    const A4_PLANTS = [
      ["plant:door-session", "a4d lifting plant:door-session, a desk with a certificate never knocks, and a4c goes red"],
      ["plant:door-wait", "a4e lifting plant:door-wait, a door session's refused list ends the cycle before the request goes, and a4c goes red"],
      ["plant:door-open-lead", "a4f lifting plant:door-open-lead, the lead cannot open a request at the door, and a4c goes red"],
    ];
    for (const [tag, line] of A4_PLANTS) {
      if (PLANTS_OFF) { skip(line); continue; }
      const p = await liftChannel(tag, async mod => !(await sceneA4(mod)).ok);
      check(a.ok && p.turned && p.back, line + ": " + p.detail.split("\n")[0] + ", sha " + (p.back ? "restored" : "differs"));
    }
  } catch (e) {
    check(false, "a4c the standing door threw: " + (e && e.stack ? e.stack : e));
  }
}

/* Hold 5. A join whose team is not on the relay yet is asked again until the lead's sync lands, and is not called unenrolled while it waits. */
if (partOn("p993")) {
  try {
    markPart("p993");
    const rt = hex(16), who = keyPair(true), secret = hex(16), inv = hex(16), token = hex(32), pinTeam = "t-" + hex(8);
    const tport = transport("h35-enrol");
    const orig = tport.request;
    let hellos = 0;
    const said = [];
    tport.request = async (method, url, headers, body) => {
      if (method === "POST" && String(url).endsWith("/hello")) hellos++;
      return orig(method, url, headers, body);
    };
    const ch = C.createChannel({
      rt, url: URLV1, mirror: path.join(LAB, "h35-enrol"), stateFile: path.join(LAB, "h35-enrol.json"),
      pin: () => ({ teamId: pinTeam, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
      me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place: "desk:" + who.keyId }),
      invite: () => ({ inv, token, seal: C.inviteSealKey(secret) }),
      seat: () => seatFor(who),
      request: tport.request, connect: tport.connect, pollMs: 1e9, watch: false, say: l => said.push(String(l)),
    });
    ch.start();
    await ch.idle();
    const first = hellos;
    R.clock.now += 1;
    const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
    R.clock.now += 1;
    const tInv = R.clock.now;
    const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }];
    const invited = await admin("POST", "/relay/v1/t/" + rt + "/invites", { add, drop: [], t: tInv,
      sig: signHex(LEAD, core.invitesBytes(rt, tInv, add, [])) });
    const again = await until(() => hellos >= first + 1, 30000);
    const on = await until(() => ch.online(), 30000);
    const named = said.some(l => l.indexOf("not enrolled") >= 0);
    try { await ch.stop(); } catch { /* already stopped */ }
    check(made.status === 200 && invited.status === 200 && first >= 1 && again && on && !named,
      "993h a join the relay has not enrolled yet is asked again until the lead's team is there, and is not said as unenrolled while it waits: "
      + "team " + made.status + ", invite " + invited.status + ", hello " + first + ", again " + again + ", online " + on
      + ", said " + (named ? "unenrolled" : "quiet"));
  } catch (e) {
    check(false, "993h threw: " + (e && e.stack ? e.stack : e));
  }


/* The same three refusals with the channel's own line lifted. The shell's plants (993c, 993g) cover the window; these cover the channel. */

  const hushPlant = await liftChannel("plant:h35-removed-hush", async mod => {
    const rt = hex(16), who = keyPair(true), pinTeam = "t-" + hex(8);
    const tport = transport("h35-hush");
    R.clock.now += 1;
    const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
    if (made.status !== 200) throw new Error("team " + made.status);
    const list = [{ id: who.keyId, pub: who.pub, desk: who.keyId }];
    R.clock.now += 1;
    let t = R.clock.now;
    const enrolled = await admin("POST", "/relay/v1/t/" + rt + "/devices", { keys: list, rev: 1, t,
      sig: signHex(LEAD, core.devicesBytes(rt, 1, t, list)) });
    if (enrolled.status !== 200) throw new Error("enrol " + enrolled.status);
    const ch = mod.createChannel({
      rt, url: URLV1, mirror: path.join(LAB, "h35-hush"), stateFile: path.join(LAB, "h35-hush.json"),
      pin: () => ({ teamId: pinTeam, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
      me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place: "desk:" + who.keyId }),
      seat: () => seatFor(who),
      onRemoved() {},
      request: tport.request, connect: tport.connect, pollMs: 1e9, watch: false,
    });
    ch.start();
    const on = await until(() => ch.online(), 30000);
    if (!on) { try { await ch.stop(); } catch { /* already stopped */ } throw new Error("never online"); }
    R.clock.now += 1;
    t = R.clock.now;
    const dropped = await admin("POST", "/relay/v1/t/" + rt + "/devices", { keys: [], rev: 2, t,
      sig: signHex(LEAD, core.devicesBytes(rt, 2, t, [])) });
    if (dropped.status !== 200) { try { await ch.stop(); } catch { /* already stopped */ } throw new Error("remove " + dropped.status); }
    ch.kick();
    await ch.idle();
    const mark = tport.log.length;
    ch.kick();
    await ch.idle();
    const grew = tport.log.length - mark;
    try { await ch.stop(); } catch { /* already stopped */ }
    if (grew === 0) throw new Error("still quiet after the second ask, log " + tport.log.length);
    return true;
  });


  check(hushPlant.turned && hushPlant.back,
    "993b lifting plant:h35-removed-hush keeps asking after the relay removed this desk (FAIL 993a a desk the lead removed is told, stops asking the relay, and no longer follows it: told {\"removed\":false}, here still answers): "
    + hushPlant.detail + ", sha " + (hushPlant.back ? "restored" : "differs"));



  const endPlant = await liftChannel("plant:h35-removed-end", async mod => {
    const rt = hex(16), who = keyPair(true), pinTeam = "t-" + hex(8);
    const secret = hex(16), inv = hex(16), token = hex(32);
    const tport = transport("h35-end");
    R.clock.now += 1;
    const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
    if (made.status !== 200) throw new Error("team " + made.status);
    const list = [{ id: who.keyId, pub: who.pub, desk: who.keyId }];
    R.clock.now += 1;
    let t = R.clock.now;
    const enrolled = await admin("POST", "/relay/v1/t/" + rt + "/devices", { keys: list, rev: 1, t,
      sig: signHex(LEAD, core.devicesBytes(rt, 1, t, list)) });
    if (enrolled.status !== 200) throw new Error("enrol " + enrolled.status);
    R.clock.now += 1;
    const tInv = R.clock.now;
    const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }];
    const invited = await admin("POST", "/relay/v1/t/" + rt + "/invites", { add, drop: [], t: tInv,
      sig: signHex(LEAD, core.invitesBytes(rt, tInv, add, [])) });
    if (invited.status !== 200) throw new Error("invite " + invited.status);
    R.clock.now += 1;
    t = R.clock.now;
    const dropped = await admin("POST", "/relay/v1/t/" + rt + "/devices", { keys: [], rev: 2, t,
      sig: signHex(LEAD, core.devicesBytes(rt, 2, t, [])) });
    if (dropped.status !== 200) throw new Error("remove " + dropped.status);
    let kind = "";
    const ch = mod.createChannel({
      rt, url: URLV1, mirror: path.join(LAB, "h35-end"), stateFile: path.join(LAB, "h35-end.json"),
      pin: () => ({ teamId: pinTeam, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
      me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place: "desk:" + who.keyId }),
      invite: () => ({ inv, token, seal: mod.inviteSealKey(secret) }),
      seat: () => seatFor(who),
      onInviteEnd(k) { kind = String(k); },
      onRemoved() {},
      request: tport.request, connect: tport.connect, pollMs: 1e9, watch: false,
    });
    ch.start();
    await ch.idle();
    let raw = null;
    try { raw = R.stores.get(rt).get("inv:" + inv); } catch { raw = null; }
    const rec = raw == null ? null : (typeof raw === "string" ? JSON.parse(raw) : raw);
    const unspent = !!(rec && rec.spent !== true);
    const asked = tport.log.some(l => String(l).indexOf("session") >= 0);
    try { await ch.stop(); } catch { /* already stopped */ }
    if (!(kind === "" && unspent && asked)) throw new Error("kind " + (kind || "none") + ", token " + (unspent ? "unspent" : "spent") + ", asked " + asked);
    return true;
  });


  check(endPlant.turned && endPlant.back,
    "993e lifting plant:h35-removed-end never tells the desk the old invitation was refused (FAIL 993d an invitation registered before this desk was removed is refused without being spent, and the desk says a new one is needed: state waiting, token unspent): "
    + endPlant.detail + ", sha " + (endPlant.back ? "restored" : "differs"));



  const retryPlant = await liftChannel("plant:h35-enrol-retry", async mod => {
    const rt = hex(16), who = keyPair(true), secret = hex(16), inv = hex(16), token = hex(32), pinTeam = "t-" + hex(8);
    const tport = transport("h35-retry");
    const orig = tport.request;
    let hellos = 0;
    tport.request = async (method, url, headers, body) => {
      if (method === "POST" && String(url).endsWith("/hello")) hellos++;
      return orig(method, url, headers, body);
    };
    const ch = mod.createChannel({
      rt, url: URLV1, mirror: path.join(LAB, "h35-retry"), stateFile: path.join(LAB, "h35-retry.json"),
      pin: () => ({ teamId: pinTeam, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } }),
      me: () => ({ keyId: who.keyId, public: who.pub, privateKey: who.privateKey, place: "desk:" + who.keyId }),
      invite: () => ({ inv, token, seal: mod.inviteSealKey(secret) }),
      seat: () => seatFor(who),
      request: tport.request, connect: tport.connect, pollMs: 1e9, watch: false,
    });
    ch.start();
    await ch.idle();
    const first = hellos;
    R.clock.now += 1;
    const made = await admin("POST", "/relay/v1/teams", createBody(rt, R.clock.now));
    if (made.status !== 200) { try { await ch.stop(); } catch { /* already stopped */ } throw new Error("team " + made.status); }
    R.clock.now += 1;
    const tInv = R.clock.now;
    const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }];
    const invited = await admin("POST", "/relay/v1/t/" + rt + "/invites", { add, drop: [], t: tInv,
      sig: signHex(LEAD, core.invitesBytes(rt, tInv, add, [])) });
    if (invited.status !== 200) { try { await ch.stop(); } catch { /* already stopped */ } throw new Error("invite " + invited.status); }
    const again = await until(() => hellos >= first + 1, 8000);
    try { await ch.stop(); } catch { /* already stopped */ }
    if (again) throw new Error("still asked, hellos " + hellos);
    if (first < 1) throw new Error("no first hello");
    return true;
  });


  check(retryPlant.turned && retryPlant.back,
    "993i lifting plant:h35-enrol-retry does not ask again (FAIL 993h a join the relay has not enrolled yet is asked again until the lead's team is there, and is not said as unenrolled while it waits: hello 1, again false, online false, said unenrolled): "
    + retryPlant.detail + ", sha " + (retryPlant.back ? "restored" : "differs"));
}

/* ---- 932 a lead's key handed over, the desk's relay channel follows it (design section 2, K1, K2) ---- */
  if (partOn("p932")) {
  markPart("p932");
}
if (partOn("p938")) {
  {
    function makeHandoverStep(teamId, fromLead, toLead) {
      const s = {
        format: 1,
        kind: "etiuda-team-handover",
        team: teamId,
        from: { keyId: fromLead.keyId, public: fromLead.pub },
        to: { keyId: toLead.keyId, public: toLead.pub },
        sig: { alg: "Ed25519", keyId: fromLead.keyId },
      };
      s.sig.value = signHex(fromLead, Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), C.signedBytes(s)]));
      return s;
    }
    function teamDocWith(tm, rt, lead, epoch, rev, roster, handover) {
      const doc = {
        format: 1,
        kind: "etiuda-team",
        id: tm,
        catalogs: ["pebble-board"],
        lead: { keyId: lead.keyId, public: lead.pub, box: "ab".repeat(32) },
        sealed: true,
        exportsSealed: false,
        epoch,
        rev,
        channel: { kind: "relay", rt, url: URLV1 },
        roster: roster || [],
      };
      if (handover) doc.handover = handover;
      doc.sig = { alg: "Ed25519", keyId: lead.keyId };
      doc.sig.value = signHex(lead, C.signedBytes(doc));
      return doc;
    }

    const tm = "t-" + hex(8), rt = hex(16);
    const lead1 = keyPair(false), lead2 = keyPair(false);
    const pin = { teamId: tm, rt, lead: { keyId: lead1.keyId, public: lead1.pub } };
    const dir = path.join(LAB, "ho-932a-" + hex(4));
    fs.mkdirSync(dir, { recursive: true });
    const prog = C.createProgram({ io: C.diskIO(dir, C.writeWhole), pin, save() {}, say() {} });

    const doc1 = teamDocWith(tm, rt, lead1, 1, 1, []);
    prog.loadTeamFile(doc1);

    const step1 = makeHandoverStep(tm, lead1, lead2);
    const doc2 = teamDocWith(tm, rt, lead2, 1, 2, [], [step1]);
    const l2 = prog.loadTeamFile(doc2);

    const K1 = crypto.randomBytes(32);
    const head2 = signHead({ v: 1, team: tm, epoch: 1, rev: 2, editions: [{ catalog: "pebble-board", rev: 1, edition: "Second edition", published: "10 March 2026" }], t: Date.now() }, lead2);
    const h2 = prog.acceptBlob({
      blob: B.seal({ relayTeamId: rt, epoch: 1, teamKey: K1, writer: { keyId: lead2.keyId, privateKey: lead2.privateKey }, path: HEAD_FILE, body: head2, counter: 1, place: "root", kind: "file" }),
      teamDoc: doc2,
      teamKey: K1,
    });
    const news = prog.headNews(Date.now());
    check(l2.ok === true && prog.pinned().lead.keyId === lead2.keyId && h2.ok === true && news.edition === "Second edition",
      "932a a handover file lands and the next head, signed by the new key, is taken: landed " + l2.ok + ", pinned " + (prog.pinned() && prog.pinned().lead.keyId === lead2.keyId) + ", head " + h2.ok + ", edition " + news.edition);

    const lead3 = keyPair(false), stranger = keyPair(false);
    const noStep = teamDocWith(tm, rt, lead3, 1, 3, []);
    const rNoStep = prog.loadTeamFile(noStep);

    const badSignerStep = makeHandoverStep(tm, stranger, lead3);
    const badStepDoc = teamDocWith(tm, rt, lead3, 1, 3, [], [badSignerStep]);
    const rBadStep = prog.loadTeamFile(badStepDoc);

    const keys9 = [lead2];
    for (let i = 0; i < 9; i++) keys9.push(keyPair(false));
    const chain9 = [];
    for (let i = 0; i < 9; i++) chain9.push(makeHandoverStep(tm, keys9[i], keys9[i + 1]));
    const docChain9 = teamDocWith(tm, rt, keys9[9], 1, 3, [], chain9);
    const rChain9 = prog.loadTeamFile(docChain9);

    check(rNoStep.reason === "bad-signature" && rBadStep.reason === "bad-signature" && rChain9.reason === "bad-signature" && prog.pinned().lead.keyId === lead2.keyId,
      "932b a file naming a new lead with no step, a step signed by a third key, or a chain of 9 is refused, and the pin does not move: nostep " + rNoStep.reason + ", badstep " + rBadStep.reason + ", chain9 " + rChain9.reason + ", pinned " + (prog.pinned().lead.keyId === lead2.keyId));

    const dirC = path.join(LAB, "ho-932c-" + hex(4));
    fs.mkdirSync(dirC, { recursive: true });
    let stateC = null;
    const saveC = st => { stateC = JSON.parse(JSON.stringify(st)); };
    const loadC = () => stateC;
    const progBefore = C.createProgram({ io: C.diskIO(dirC, C.writeWhole), pin: { teamId: tm, rt, lead: { keyId: lead1.keyId, public: lead1.pub } }, save: saveC, load: loadC });
    progBefore.loadTeamFile(doc2);
    const beforePin = progBefore.pinned();
    const progAfter = C.createProgram({ io: C.diskIO(dirC, C.writeWhole), pin: { teamId: tm, rt, lead: { keyId: lead1.keyId, public: lead1.pub } }, save: saveC, load: loadC });
    const afterPin = progAfter.pinned();
    check(beforePin && beforePin.lead.keyId === lead2.keyId && afterPin && afterPin.lead.keyId === lead2.keyId && afterPin.lead.public === lead2.pub,
      "932c a desk restarted after landing keeps the moved pin: before " + (beforePin && beforePin.lead.keyId) + ", after " + (afterPin && afterPin.lead.keyId));

    const tmD = "t-" + hex(8), rtD = hex(16);
    const lA = keyPair(false), lB = keyPair(false), lC = keyPair(false);
    const pinD = { teamId: tmD, rt: rtD, lead: { keyId: lA.keyId, public: lA.pub } };
    const dirD = path.join(LAB, "ho-932d-" + hex(4));
    fs.mkdirSync(dirD, { recursive: true });
    const progD = C.createProgram({ io: C.diskIO(dirD, C.writeWhole), pin: pinD, save() {}, say() {} });
    const stepAB = makeHandoverStep(tmD, lA, lB);
    const stepBC = makeHandoverStep(tmD, lB, lC);
    const docTwoSteps = teamDocWith(tmD, rtD, lC, 1, 3, [], [stepAB, stepBC]);
    const resD = progD.loadTeamFile(docTwoSteps);
    const pinnedD = progD.pinned();
    check(resD.ok === true && pinnedD && pinnedD.lead.keyId === lC.keyId && pinnedD.lead.public === lC.pub,
      "932d a desk two handovers behind follows both steps at once: loaded " + resD.ok + ", pinned " + (pinnedD && pinnedD.lead.keyId));

    const tmE = "t-" + hex(8), rtE = hex(16);
    const oldLead = keyPair(false), newLead = keyPair(false), strangerLead = keyPair(false);
    const dirE = path.join(LAB, "ho-932e-" + hex(4));
    fs.mkdirSync(dirE, { recursive: true });
    const KE = crypto.randomBytes(32);
    const guideBlob = B.seal({ relayTeamId: rtE, epoch: 1, teamKey: KE, writer: { keyId: oldLead.keyId, privateKey: oldLead.privateKey }, path: "guide.ec", body: "guide published by old lead\n", counter: 1, place: "root", kind: "file" });
    const oldHead = signHead({ v: 1, team: tmE, epoch: 1, rev: 1, editions: [{ catalog: "quay-board", rev: 1, edition: "First edition", published: "1 March 2026" }], t: 1000000 }, oldLead);
    const oldHeadBlob = B.seal({ relayTeamId: rtE, epoch: 1, teamKey: KE, writer: { keyId: oldLead.keyId, privateKey: oldLead.privateKey }, path: HEAD_FILE, body: oldHead, counter: 2, place: "root", kind: "file" });
    const strangerBlob = B.seal({ relayTeamId: rtE, epoch: 1, teamKey: KE, writer: { keyId: strangerLead.keyId, privateKey: strangerLead.privateKey }, path: "stranger.ec", body: "stranger\n", counter: 3, place: "root", kind: "file" });
    const stepE = makeHandoverStep(tmE, oldLead, newLead);
    const docE = teamDocWith(tmE, rtE, newLead, 1, 2, [], [stepE]);
    const pinE = { teamId: tmE, rt: rtE, lead: { keyId: newLead.keyId, public: newLead.pub } };
    const progE = C.createProgram({ io: C.diskIO(dirE, C.writeWhole), pin: pinE, save() {}, say() {} });
    progE.loadTeamFile(docE);
    const rGuide = progE.acceptBlob({ blob: guideBlob, teamDoc: docE, teamKey: KE });
    const rHead = progE.acceptBlob({ blob: oldHeadBlob, teamDoc: docE, teamKey: KE });
    const rStranger = progE.acceptBlob({ blob: strangerBlob, teamDoc: docE, teamKey: KE });
    const guideRead = progE.readMirror("guide.ec");
    const headNewsE = progE.headNews(2000000);
    /* The head clause inverted by 962 stage 5 (the design's 3.3): a head is the current lead's news, so one the old lead signed is left out. */
    check(rGuide.ok === true && guideRead === "guide published by old lead\n" && rHead.ok !== true && rHead.reason === "bad-signature" && headNewsE.shown === false
      && rStranger.ok === false && rStranger.reason === "not-roster",
      "932e a desk joining after the move reads a catalog the old lead published before it, and not the head the old lead signed; a blob by a key on no chain is still refused: guide "
      + (guideRead === "guide published by old lead\n") + ", head " + (rHead.ok === true ? "taken" : rHead.reason) + ", shown " + headNewsE.shown + ", stranger " + rStranger.reason);

    const tmF = "t-" + hex(8), rtF = hex(16);
    const oldF = keyPair(false), newF = keyPair(false);
    const pinF = { teamId: tmF, rt: rtF, lead: { keyId: oldF.keyId, public: oldF.pub } };
    const dirF = path.join(LAB, "ho-932f-" + hex(4));
    fs.mkdirSync(dirF, { recursive: true });
    const progF = C.createProgram({ io: C.diskIO(dirF, C.writeWhole), pin: pinF, save() {}, say() {} });
    const stepF = makeHandoverStep(tmF, oldF, newF);
    const docF = teamDocWith(tmF, rtF, newF, 1, 2, [], [stepF]);
    const resF = progF.loadTeamFile(docF);
    const pinAfterF = progF.pinned();
    check(resF.ok === true && pinAfterF && pinAfterF.lead.keyId === newF.keyId && pinAfterF.lead.public === newF.pub,
      "932f an invitation made before the move pins the old lead, and the joiner follows the chain at its first team file: admitted " + resF.ok + ", followed " + (pinAfterF && pinAfterF.lead.keyId === newF.keyId));

    markPart("p962head");
    /* ---- 962 stage 5: the head per catalog, and its trust (the design's 3.2 and 3.3, with the test architect's second read) ---- */
    {
      const tmS = "t-" + hex(8), rtS = hex(16), KS = crypto.randomBytes(32);
      const leadS1 = keyPair(false), leadS2 = keyPair(false);
      const pinS = { teamId: tmS, rt: rtS, lead: { keyId: leadS1.keyId, public: leadS1.pub } };
      const docS1 = teamDocWith(tmS, rtS, leadS1, 1, 1, []);
      const docS2 = teamDocWith(tmS, rtS, leadS2, 1, 2, [], [makeHandoverStep(tmS, leadS1, leadS2)]);
      const edA = (rev, ed) => ({ catalog: "pebble-board", rev, edition: ed || "Pebble " + rev, published: rev + " March 2026" });
      const edB = (rev, ed) => ({ catalog: "quay-board", rev, edition: ed || "Quay " + rev, published: rev + " April 2026" });
      const headS = (t, editions, key, epoch) => signHead({ v: 1, team: tmS, epoch: epoch || 1, rev: 1, editions, t }, key || leadS1);
      const sealS = (body, n, writer, path2, epoch) => B.seal({ relayTeamId: rtS, epoch: epoch || 1, teamKey: KS,
        writer: { keyId: (writer || leadS1).keyId, privateKey: (writer || leadS1).privateKey }, path: path2 || HEAD_FILE, body, counter: n, place: "root", kind: "file" });
      const progS = (mod, o) => {
        const m = mod || C;
        const dir = path.join(LAB, "s5-" + hex(4)); fs.mkdirSync(dir, { recursive: true });
        const p = m.createProgram(Object.assign({ io: m.diskIO(dir, m.writeWhole), pin: pinS, save() {}, say() {} }, o || {}));
        p.loadTeamFile(docS1);
        return p;
      };
      const putHead = (p, body, n, writer, doc) => p.acceptBlob({ blob: sealS(body, n, writer), teamDoc: doc || docS1, teamKey: KS });

      /* 962s5e: one entry not well shaped refuses the whole head; headEditions keeps one entry a catalog, the greatest rev and the last of a tie. */
      const headEds = typeof C.headEditions === "function" ? C.headEditions : () => "absent";
      const eds = headEds([edB(2, "Quay two"), edA(4), edB(2, "Quay two again"), edA(3), edB(1)]);
      const bent = headEds([edA(4), { catalog: "quay-board", rev: -1, edition: "x", published: "y" }]);
      const pE = progS();
      const rE = putHead(pE, headS(Date.now(), [edA(4), { catalog: "quay-board", rev: 2, edition: "", published: "2 April 2026" }]), 1);
      check(JSON.stringify(eds) === JSON.stringify([edA(4), edB(2, "Quay two again")]) && bent === null && rE.ok !== true && rE.reason === "bad-signature"
        && pE.readMirror(HEAD_FILE) === null,
        "962s5e a head with one entry not well shaped is refused whole, and headEditions keeps one entry a catalog by greatest rev, the last of a tie, sorted:"
        + " editions " + JSON.stringify(Array.isArray(eds) ? eds.map(e => e.catalog + "@" + e.rev + ":" + e.edition) : eds) + ", bent " + JSON.stringify(bent) + ", head " + rE.reason);

      /* 962s5q: after the handover only the new lead's head holds; one the old lead signed is refused, said once like any refused head. */
      const qSaid = [];
      const pQ = progS(null, { say: l => qSaid.push(l) });
      pQ.loadTeamFile(docS2);
      const rQold = putHead(pQ, headS(Date.now(), [edA(2)], leadS1), 1, leadS1, docS2);
      const qNews = pQ.headNews(Date.now());
      check(pQ.pinned().lead.keyId === leadS2.keyId && rQold.ok !== true && rQold.reason === "bad-signature" && qNews.shown === false
        && qSaid.filter(l => l.indexOf(HEAD_FILE) === 0).length === 1,
        "962s5q a head signed by the lead's key before the handover is refused once the pin has moved, and said once: head "
        + (rQold.ok === true ? "taken" : rQold.reason) + ", shown " + qNews.shown + ", said " + qSaid.filter(l => l.indexOf(HEAD_FILE) === 0).length);
      const qPlant = await liftChannel("plant:head-pin-only", async mod => {
        const p = progS(mod);
        p.loadTeamFile(docS2);
        const r = putHead(p, headS(Date.now(), [edA(2)], leadS1), 1, leadS1, docS2);
        return r.ok === true && p.headNews(Date.now()).shown === true;
      });
      check(qPlant.turned && qPlant.back, "962s5q2 lifting plant:head-pin-only takes the old lead's head after the handover (FAIL 962s5q): "
        + qPlant.detail + ", sha " + (qPlant.back ? "restored" : "differs"));
      /* showFreshness, the same rule: the pinned lead's signature only. */
      const freshOf = (key, time) => {
        const o = { keyId: key.keyId, relay: rtS, epoch: 1, rev: 2, time };
        o.sig = { alg: "Ed25519", keyId: key.keyId };
        o.sig.value = signHex(key, Buffer.concat([Buffer.from(C.HEAD_PREFIX, "utf8"), C.signedBytes(o)]));
        return o;
      };
      const fOld = pQ.showFreshness({ head: freshOf(leadS1, 5000), now: 6000 }), fNew = pQ.showFreshness({ head: freshOf(leadS2, 5000), now: 6000 });
      check(fOld.shown === false && fNew.shown === true,
        "962s5q3 the head's freshness shows only under the pinned lead, never a key before the handover: old " + fOld.shown + ", new " + fNew.shown);
      const fPlant = await liftChannel("plant:fresh-pin-only", async mod => {
        const p = progS(mod);
        p.loadTeamFile(docS2);
        return p.showFreshness({ head: freshOf(leadS1, 5000), now: 6000 }).shown === true;
      });
      check(fPlant.turned && fPlant.back, "962s5q4 lifting plant:fresh-pin-only shows the old lead's freshness after the handover (FAIL 962s5q3): "
        + fPlant.detail + ", sha " + (fPlant.back ? "restored" : "differs"));

      /* 962s5z (the test architect's second read, change 1): the new lead's head, arriving before the team file that hands over,
         is refused for its key and judged again once that file lands; it is in the mirror before anything reads the news. */
      const zScene = mod => {
        const m = mod || C;
        const p = progS(m);
        const early = putHead(p, headS(Date.now(), [edA(3, "Pebble from the new lead")], leadS2), 1, leadS1);
        const before = p.readMirror(HEAD_FILE);
        const team = p.acceptBlob({ blob: sealS(JSON.stringify(docS2), 2, leadS2, C.TEAM_NAME), teamDoc: docS2, teamKey: KS });
        const after = p.readMirror(HEAD_FILE);
        return { early, before, team, after, news: p.headNews(Date.now()), pinned: p.pinned().lead.keyId === leadS2.keyId };
      };
      const z = zScene();
      const zSaid = s => "early " + (s.early.ok === true ? "taken" : s.early.reason) + ", mirror before " + (s.before ? "holds it" : "none")
        + ", team " + (s.team.ok === true ? "landed" : s.team.reason) + ", pinned " + s.pinned + ", mirror after " + (s.after ? "holds it" : "none")
        + ", news " + (s.news.shown ? s.news.edition : "none");
      check(z.early.ok !== true && z.before === null && z.team.ok === true && z.pinned && !!z.after && z.news.shown === true && z.news.edition === "Pebble from the new lead",
        "962s5z a head the new lead signed, arriving before the handover's team file, is refused and then shown once that file lands: " + zSaid(z));
      const zHeld = await liftChannel("plant:head-held", async mod => { const s = zScene(mod); return s.team.ok === true && s.news.shown === false; });
      check(zHeld.turned && zHeld.back, "962s5z2 lifting plant:head-held drops the early head for good (FAIL 962s5z): " + zHeld.detail + ", sha " + (zHeld.back ? "restored" : "differs"));
      const zTeam = await liftChannel("plant:head-again-team", async mod => { const s = zScene(mod); return s.team.ok === true && s.after === null; });
      check(zTeam.turned && zTeam.back, "962s5z3 lifting plant:head-again-team leaves the early head out of the mirror when the team file lands (FAIL 962s5z): "
        + zTeam.detail + ", sha " + (zTeam.back ? "restored" : "differs"));

      /* 962s5r, the relay: a head dated more than ten minutes ahead is refused, not floored; a genuine head then lands; and the
         refused one shows once the clock reaches it. */
      const rScene = mod => {
        let now = 10 * 24 * 3600 * 1000;
        const p = progS(mod, { clock: () => now });
        const ahead = putHead(p, headS(now + 11 * 60 * 1000, [edA(5, "Pebble from ahead")]), 1);
        const tAfterAhead = p.state().headT;
        const genuine = putHead(p, headS(now, [edA(4, "Pebble now")]), 2);
        const shownNow = p.headNews(now);
        /* With no later head, the one refused for its time shows once the clock reaches it. */
        let now2 = 10 * 24 * 3600 * 1000;
        const q = progS(mod, { clock: () => now2 });
        const ahead2 = putHead(q, headS(now2 + 11 * 60 * 1000, [edA(5, "Pebble from ahead")]), 1);
        const shownBefore = q.headNews(now2);
        now2 += 12 * 60 * 1000;
        const shownLater = q.headNews(now2);
        return { ahead, tAfterAhead, genuine, shownNow, ahead2, shownBefore, shownLater };
      };
      const r = rScene();
      const rSaid = s => "ahead " + (s.ahead.ok === true ? "taken" : s.ahead.reason) + ", headT after " + s.tAfterAhead + ", genuine "
        + (s.genuine.ok === true ? "landed" : s.genuine.reason) + ", shown " + (s.shownNow.shown ? s.shownNow.edition : "none")
        + "; alone " + (s.ahead2.ok === true ? "taken" : s.ahead2.reason) + ", shown before " + (s.shownBefore.shown ? s.shownBefore.edition : "none")
        + ", once the clock reaches it " + (s.shownLater.shown ? s.shownLater.edition : "none");
      check(r.ahead.ok !== true && r.ahead.reason === "head-ahead" && r.tAfterAhead === null && r.genuine.ok === true && r.shownNow.edition === "Pebble now"
        && r.ahead2.ok !== true && r.shownBefore.shown === false && r.shownLater.edition === "Pebble from ahead",
        "962s5r a relay head dated beyond now plus ten minutes is refused and leaves the floor where it was, a genuine head lands, and with none later the refused one shows once the clock reaches it: " + rSaid(r));
      const rAhead = await liftChannel("plant:head-ahead", async mod => { const s = rScene(mod); return s.ahead.ok === true && s.genuine.ok !== true; });
      check(rAhead.turned && rAhead.back, "962s5r2 lifting plant:head-ahead takes the head from ahead and refuses every genuine head after it (FAIL 962s5r): "
        + rAhead.detail + ", sha " + (rAhead.back ? "restored" : "differs"));
      const rClock = await liftChannel("plant:head-again-clock", async mod => { const s = rScene(mod); return s.ahead2.ok !== true && s.shownLater.shown === false; });
      check(rClock.turned && rClock.back, "962s5r3 lifting plant:head-again-clock never shows the refused head once the clock reaches it (FAIL 962s5r): "
        + rClock.detail + ", sha " + (rClock.back ? "restored" : "differs"));

      /* 962s5s: a floor from the future, persisted before the fix, is dropped when the record is read, so a genuine head lands. */
      const sScene = mod => {
        const m = mod || C;
        const now = Date.now();
        const s0 = progS(m).state();
        const kept = JSON.parse(JSON.stringify(s0));
        kept.headT = now + 24 * 3600 * 1000;
        const p = progS(m, { load: () => kept, clock: () => now });
        const t0 = p.state().headT;
        const genuine = putHead(p, headS(now, [edA(2)]), 1);
        return { t0, genuine };
      };
      const sR = sScene();
      check(sR.t0 === null && sR.genuine.ok === true,
        "962s5s a head floor a day ahead, kept in the record, is dropped when it is read, and a genuine head lands: floor " + sR.t0 + ", head "
        + (sR.genuine.ok === true ? "landed" : sR.genuine.reason));
      const sPlant = await liftChannel("plant:head-t-load", async mod => { const s = sScene(mod); return s.t0 !== null && s.genuine.ok !== true; });
      check(sPlant.turned && sPlant.back, "962s5s2 lifting plant:head-t-load keeps the floor from the future and refuses the genuine head (FAIL 962s5s): "
        + sPlant.detail + ", sha " + (sPlant.back ? "restored" : "differs"));

      /* 962s5t: a head below the newest epoch the lead has named is left out. */
      const tScene = mod => {
        const m = mod || C;
        const p = progS(m);
        p.loadTeamFile(teamDocWith(tmS, rtS, leadS1, 2, 1, []));
        const low = putHead(p, headS(Date.now(), [edA(2)], leadS1, 1), 1);
        return { low, shown: p.headNews(Date.now()).shown };
      };
      const tR = tScene();
      check(tR.low.ok !== true && tR.low.reason === "epoch" && tR.shown === false,
        "962s5t a head at epoch 1, once a team file of epoch 2 is held, is left out: head " + (tR.low.ok === true ? "taken" : tR.low.reason) + ", shown " + tR.shown);
      const tPlant = await liftChannel("plant:head-epoch", async mod => { const s = tScene(mod); return s.low.ok === true; });
      check(tPlant.turned && tPlant.back, "962s5t2 lifting plant:head-epoch takes the head below the lead's epoch (FAIL 962s5t): "
        + tPlant.detail + ", sha " + (tPlant.back ? "restored" : "differs"));
      /* ---- round two, the test architect's read of e9ed3b33 ---- */
      const fetchOf = (b, seq) => ({ seq, ct: b.ciphertext, meta: { v: 1, id: b.id, supersedes: b.supersedes, epoch: b.epoch, writer: b.writerKeyId,
        counter: b.counter, del: false, sig: b.signature, nonce: b.nonce, place: b.place, size: b.ciphertext.length } });
      /* 962s5z4: the catch-up, two polls. The new lead's own upload of its head comes on the first page, before any team file names it;
         the handover's team file on the next. The head shows once that file lands. Each page goes through applyBatch, as createChannel
         hands it each page of since/<seq>. */
      /* The cursor moves past each page (setSeq, as the catch-up does), and the desk restarts between the head and the team file.
         `junk`: a later head-shaped blob from a key that never leads comes between. */
      const z4Scene = (mod, junk) => {
        const m = mod || C;
        let kept = null;
        const save = st => { kept = JSON.parse(JSON.stringify(st)); };
        const p = progS(m, { save, load: () => kept });
        const ctx = { keyFor: e => (e === 1 ? KS : null) };
        const head = sealS(headS(Date.now(), [edA(7, "Pebble the new lead wrote")], leadS2), 1, leadS2);
        const first = p.applyBatch([fetchOf(head, 10)], ctx, { whole: true });
        p.setSeq(10);
        if (junk) {
          const stray = keyPair(false);
          p.applyBatch([fetchOf(sealS(headS(Date.now(), [edA(9, "Pebble from nobody")], stray), 1, stray), 11)], ctx, { whole: true });
          p.setSeq(11);
        }
        const between = p.headNews(Date.now());
        const q = progS(m, { save, load: () => kept });
        const team = sealS(JSON.stringify(docS2), 2, leadS2, C.TEAM_NAME);
        const second = q.applyBatch([fetchOf(team, 12)], ctx, { whole: true });
        q.setSeq(12);
        return { first: first.applied.slice(), between: between.shown, second: second.applied.slice(), pinned: q.pinned().lead.keyId === leadS2.keyId,
          seq: q.state().seq, news: q.headNews(Date.now()) };
      };
      const z4 = z4Scene();
      const z4Said = s => "first page " + JSON.stringify(s.first) + ", shown between " + s.between + ", second page " + JSON.stringify(s.second)
        + ", pinned " + s.pinned + ", news " + (s.news.shown ? s.news.edition : "none");
      check(z4.between === false && z4.pinned && z4.news.shown === true && z4.news.edition === "Pebble the new lead wrote",
        "962s5z4 the new lead's own head on one page of the catch-up, the cursor past it and the desk restarted, and the team file that hands over on the next: the head shows once that file lands: " + z4Said(z4));
      const z7 = z4Scene(null, true);
      check(z7.pinned && z7.news.shown === true && z7.news.edition === "Pebble the new lead wrote",
        "962s5z7 a later head-shaped blob from a key that never leads neither takes nor clears the kept head: " + z4Said(z7));
      const z7Plant = await liftChannel("plant:item-keep", async mod => { const s = z4Scene(mod, true); return s.pinned && s.news.shown === false; });
      check(z7Plant.turned && z7Plant.back, "962s5z8 lifting plant:item-keep lets the stray blob take the slot, and the new lead's head is lost (FAIL 962s5z7): "
        + z7Plant.detail + ", sha " + (z7Plant.back ? "restored" : "differs"));
      const z4Held = await liftChannel("plant:item-held", async mod => { const s = z4Scene(mod); return s.pinned && s.news.shown === false; });
      check(z4Held.turned && z4Held.back, "962s5z5 lifting plant:item-held drops the new lead's head for good (FAIL 962s5z4): " + z4Held.detail + ", sha " + (z4Held.back ? "restored" : "differs"));
      const z4Again = await liftChannel("plant:item-again", async mod => { const s = z4Scene(mod); return s.pinned && s.news.shown === false; });
      check(z4Again.turned && z4Again.back, "962s5z6 lifting plant:item-again never opens the kept head once its writer leads (FAIL 962s5z4): " + z4Again.detail + ", sha " + (z4Again.back ? "restored" : "differs"));

      /* 962s5r5: a head refused for its time survives a restart, and shows once the clock reaches it. */
      const r5Scene = mod => {
        const m = mod || C;
        let now = 20 * 24 * 3600 * 1000, kept = null;
        const save = st => { kept = JSON.parse(JSON.stringify(st)); };
        const before = progS(m, { clock: () => now, save, load: () => kept });
        const ahead = putHead(before, headS(now + 11 * 60 * 1000, [edA(8, "Pebble kept across a restart")]), 1);
        const after = progS(m, { clock: () => now, save, load: () => kept });
        now += 12 * 60 * 1000;
        return { ahead, news: after.headNews(now) };
      };
      const r5 = r5Scene();
      check(r5.ahead.ok !== true && r5.ahead.reason === "head-ahead" && r5.news.shown === true && r5.news.edition === "Pebble kept across a restart",
        "962s5r5 a head refused for its time is kept with the record, so after a restart it shows once the clock reaches it: refused "
        + r5.ahead.reason + ", then " + (r5.news.shown ? r5.news.edition : "none"));
      const r5Plant = await liftChannel("plant:held-head-load", async mod => { const s = r5Scene(mod); return s.news.shown === false; });
      check(r5Plant.turned && r5Plant.back, "962s5r6 lifting plant:held-head-load loses the held head at the restart (FAIL 962s5r5): " + r5Plant.detail + ", sha " + (r5Plant.back ? "restored" : "differs"));

      /* 962s5t3: a chain key's upload naming a high epoch raises the lead's epoch but lands no team file, and does not silence the
         current lead's head: the floor is the newest team file held. */
      const t3Scene = mod => {
        const m = mod || C;
        const s0 = JSON.parse(JSON.stringify(progS(m).state()));
        s0.leadEpoch = 9;
        const p = progS(m, { load: () => s0 });
        const r = putHead(p, headS(Date.now(), [edA(3, "Pebble at the team file's epoch")], leadS1, 1), 1);
        return { r, news: p.headNews(Date.now()) };
      };
      const t3 = t3Scene();
      check(t3.r.ok === true && t3.news.edition === "Pebble at the team file's epoch",
        "962s5t3 a lead epoch of 9 that no team file carries leaves the current lead's head at the team file's epoch 1 shown: head "
        + (t3.r.ok === true ? "landed" : t3.r.reason) + ", news " + (t3.news.shown ? t3.news.edition : "none"));
    }

    const pHandover = await liftChannel("plant:team-handover", async mod => {
      const dirP = path.join(LAB, "plant-ho-" + hex(4)); fs.mkdirSync(dirP, { recursive: true });
      const p = mod.createProgram({ io: mod.diskIO(dirP, mod.writeWhole), pin: pin, save() {}, say() {} });
      p.loadTeamFile(doc1);
      const bad = p.loadTeamFile(badStepDoc);
      return bad.ok === true;
    });
    check(pHandover.turned && pHandover.back, "932g lifting plant:team-handover accepts an unhanded lead change, and the product file is never written: "
      + pHandover.detail + ", sha " + (pHandover.back ? "restored" : "differs"));

    const pPinMove = await liftChannel("plant:team-pin-move", async mod => {
      const dirP = path.join(LAB, "plant-pm-" + hex(4)); fs.mkdirSync(dirP, { recursive: true });
      const p = mod.createProgram({ io: mod.diskIO(dirP, mod.writeWhole), pin: pin, save() {}, say() {} });
      p.loadTeamFile(doc1);
      p.loadTeamFile(doc2);
      return p.pinned() && p.pinned().lead.keyId === lead1.keyId;
    });
    check(pPinMove.turned && pPinMove.back, "932h lifting plant:team-pin-move leaves the pin at the old lead, and the product file is never written: "
      + pPinMove.detail + ", sha " + (pPinMove.back ? "restored" : "differs"));

    const pPinSave = await liftChannel("plant:team-pin-save", async mod => {
      const dirP = path.join(LAB, "plant-ps-" + hex(4)); fs.mkdirSync(dirP, { recursive: true });
      let s = null;
      const p = mod.createProgram({ io: mod.diskIO(dirP, mod.writeWhole), pin: pin, save: st => { s = JSON.parse(JSON.stringify(st)); }, load: () => s });
      p.loadTeamFile(doc1);
      p.loadTeamFile(doc2);
      const p2 = mod.createProgram({ io: mod.diskIO(dirP, mod.writeWhole), pin: pin, save: st => { s = JSON.parse(JSON.stringify(st)); }, load: () => s });
      return p2.pinned() && p2.pinned().lead.keyId === lead1.keyId;
    });
    check(pPinSave.turned && pPinSave.back, "932i lifting plant:team-pin-save does not persist the moved pin across restart, and the product file is never written: "
      + pPinSave.detail + ", sha " + (pPinSave.back ? "restored" : "differs"));

    const pChainTrust = await liftChannel("plant:chain-trust", async mod => {
      const dirP = path.join(LAB, "plant-ct-" + hex(4)); fs.mkdirSync(dirP, { recursive: true });
      const p = mod.createProgram({ io: mod.diskIO(dirP, mod.writeWhole), pin: pinE, save() {}, say() {} });
      p.loadTeamFile(docE);
      const r = p.acceptBlob({ blob: guideBlob, teamDoc: docE, teamKey: KE });
      return r.ok === false;
    });
    check(pChainTrust.turned && pChainTrust.back, "932j lifting plant:chain-trust refuses blobs signed by the old lead after the move, and the product file is never written: "
      + pChainTrust.detail + ", sha " + (pChainTrust.back ? "restored" : "differs"));

    const tmK = "t-" + hex(8), rtK = hex(16);
    const lK1 = keyPair(false), lK2 = keyPair(false);
    const pinK = { teamId: tmK, rt: rtK, lead: { keyId: lK1.keyId, public: lK1.pub } };
    const dirK = path.join(LAB, "ho-932k-" + hex(4));
    fs.mkdirSync(dirK, { recursive: true });
    const KK = crypto.randomBytes(32);
    const progK = C.createProgram({ io: C.diskIO(dirK, C.writeWhole), pin: pinK, save() {}, say() {} });

    const docK1 = teamDocWith(tmK, rtK, lK1, 1, 1, []);
    const bK1 = B.seal({
      relayTeamId: rtK, epoch: 1, teamKey: KK,
      writer: { keyId: lK1.keyId, privateKey: lK1.privateKey },
      path: C.TEAM_NAME, body: JSON.stringify(docK1), counter: 1, place: "root", kind: "file",
    });
    const rK1 = progK.acceptBlob({ blob: bK1, teamDoc: docK1, teamKey: KK });

    const bG1 = B.seal({
      relayTeamId: rtK, epoch: 1, teamKey: KK,
      writer: { keyId: lK1.keyId, privateKey: lK1.privateKey },
      path: "guide.ec", body: "guide v1\n", counter: 2, place: "root", kind: "file",
    });
    const rG1 = progK.acceptBlob({ blob: bG1, teamDoc: docK1, teamKey: KK });

    const stepK = makeHandoverStep(tmK, lK1, lK2);
    const docK2 = teamDocWith(tmK, rtK, lK2, 1, 2, [], [stepK]);
    const bK2 = B.seal({
      relayTeamId: rtK, epoch: 1, teamKey: KK,
      writer: { keyId: lK2.keyId, privateKey: lK2.privateKey },
      path: C.TEAM_NAME, body: JSON.stringify(docK2), counter: 3, place: "root", kind: "file",
      supersedes: bK1.id,
    });
    const rK2 = progK.acceptBlob({ blob: bK2, teamDoc: docK2, teamKey: KK });

    const headK2 = signHead({ v: 1, team: tmK, epoch: 1, rev: 2, editions: [{ catalog: "pebble-board", rev: 1, edition: "Handover edition", published: "30 October 2026" }], t: Date.now() }, lK2);
    const bHeadK2 = B.seal({
      relayTeamId: rtK, epoch: 1, teamKey: KK,
      writer: { keyId: lK2.keyId, privateKey: lK2.privateKey },
      path: HEAD_FILE, body: headK2, counter: 4, place: "root", kind: "file",
    });
    const rHeadK2 = progK.acceptBlob({ blob: bHeadK2, teamDoc: docK2, teamKey: KK });
    const newsK = progK.headNews(Date.now());

    const bG2 = B.seal({
      relayTeamId: rtK, epoch: 1, teamKey: KK,
      writer: { keyId: lK2.keyId, privateKey: lK2.privateKey },
      path: "guide.ec", body: "guide v2\n", counter: 5, place: "root", kind: "file",
      supersedes: bG1.id,
    });
    const rG2 = progK.acceptBlob({ blob: bG2, teamDoc: docK2, teamKey: KK });
    /* The old key, after the handover, taking back the file the new lead now holds. */
    const bG3 = B.seal({
      relayTeamId: rtK, epoch: 1, teamKey: KK,
      writer: { keyId: lK1.keyId, privateKey: lK1.privateKey },
      path: "guide.ec", body: "guide v3\n", counter: 6, place: "root", kind: "file",
      supersedes: bG2.id,
    });
    const rG3 = progK.acceptBlob({ blob: bG3, teamDoc: docK2, teamKey: KK });

    check(rK1.ok === true && rG1.ok === true && rK2.ok === true && progK.pinned().lead.keyId === lK2.keyId
      && rHeadK2.ok === true && newsK.edition === "Handover edition"
      && rG2.ok === true && progK.readMirror("guide.ec") === "guide v2\n" && rG3.ok === false && rG3.reason === "outside-place",
      "932k a synced relay desk follows a handover, the new lead's re-signed root file replaces the old key's, and the old key cannot take"
      + " it back: synced " + rK1.ok + ", handed " + rK2.ok
      + ", pinned " + (progK.pinned() && progK.pinned().lead.keyId === lK2.keyId)
      + ", head " + rHeadK2.ok + ", edition " + newsK.edition + ", re-signed " + (rG2.ok ? "taken" : rG2.reason)
      + ", the old key's " + (rG3.ok ? "taken" : rG3.reason));

    const pChainSame = await liftChannel("plant:chain-same", async mod => {
      const dirP = path.join(LAB, "plant-cs-" + hex(4)); fs.mkdirSync(dirP, { recursive: true });
      const p = mod.createProgram({ io: mod.diskIO(dirP, mod.writeWhole), pin: pinE, save() {}, say() {} });
      p.loadTeamFile(docE);
      /* The writer change no handover covers: a key earlier in the chain taking over the pinned lead's file. */
      const b1 = B.seal({ relayTeamId: rtE, epoch: 1, teamKey: KE, writer: { keyId: newLead.keyId, privateKey: newLead.privateKey }, path: "guide.ec", body: "v1\n", counter: 10, place: "root", kind: "file" });
      const r1 = p.acceptBlob({ blob: b1, teamDoc: docE, teamKey: KE });
      if (!r1.ok) return false;
      const b2 = B.seal({ relayTeamId: rtE, epoch: 1, teamKey: KE, writer: { keyId: oldLead.keyId, privateKey: oldLead.privateKey }, path: "guide.ec", body: "v2\n", counter: 11, place: "root", kind: "file", supersedes: b1.id });
      const r2 = p.acceptBlob({ blob: b2, teamDoc: docE, teamKey: KE });
      return r2.ok === true;
    });
    check(pChainSame.turned && pChainSame.back, "932l lifting plant:chain-same lets a key earlier in the chain take over the pinned lead's file, and the product file is never written: "
      + pChainSame.detail + ", sha " + (pChainSame.back ? "restored" : "differs"));

    markPart("p938");
    /* ---- a lead key in two hands (board 931 (7), the test architect's condition 2 of 2026-11-01): a desk never follows a stolen
       key into a fork, and says when it sees one. K1 handed to K2 and to K3 are two successors of one key. ---- */
    async function liftBlobChannel(tag, fn) {
      const src = path.join(ROOT, "shell", "relay", "blob.cjs");
      const beforeBytes = fs.readFileSync(src);
      const digest = sha(beforeBytes);
      let turned = false, detail = "plant line absent";
      try {
        const lines = beforeBytes.toString("utf8").split(/\n/);
        const at = lines.findIndex(l => l.indexOf(tag) >= 0);
        if (at >= 0) {
          lines.splice(at, 1);
          turned = await fn(loadPlantedBlobChannel(lines.join("\n")));
          detail = turned ? "the check lifted" : "the check still held";
        }
      } catch (e) { detail = e && e.stack ? e.stack : String(e); }
      return { turned, back: sha(fs.readFileSync(src)) === digest, detail };
    }
    /* A step as makeHandoverStep makes it, but signed by `by`, so one can name K1 as the signer without K1 having signed. */
    function stepBy(teamId, from, to, by) {
      const s = { format: 1, kind: "etiuda-team-handover", team: teamId, from: { keyId: from.keyId, public: from.pub },
        to: { keyId: to.keyId, public: to.pub }, sig: { alg: "Ed25519", keyId: from.keyId } };
      s.sig.value = signHex(by, Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), C.signedBytes(s)]));
      return s;
    }
    /* A desk pinned to K1 that has loaded the team's first file. `mod` is the channel module, the product's or a planted copy. */
    function forkDesk(mod) {
      const tmX = "t-" + hex(8), rtX = hex(16), k1 = keyPair(false), k2 = keyPair(false), k3 = keyPair(false);
      const dirX = path.join(LAB, "ho-938m-" + hex(4));
      fs.mkdirSync(dirX, { recursive: true });
      const said = [], tolds = [];
      let saved = null;
      const open = () => mod.createProgram({ io: mod.diskIO(dirX, mod.writeWhole), pin: { teamId: tmX, rt: rtX, lead: { keyId: k1.keyId, public: k1.pub } },
        save: s => { saved = JSON.parse(JSON.stringify(s)); }, load: () => saved, say: l => said.push(l), onFork: () => tolds.push(1) });
      const prog = open();
      const file = (lead, rev, steps) => teamDocWith(tmX, rtX, lead, 1, rev, [], steps);
      prog.loadTeamFile(file(k1, 1));
      return { tm: tmX, k1, k2, k3, prog, open, said, tolds, file, dir: dirX };
    }
    /* One after the other: the desk follows K1 to K2, then sees a genuine K1 to K3 file. */
    function laterScene(mod) {
      const d = forkDesk(mod);
      const toK2 = d.prog.loadTeamFile(d.file(d.k2, 2, [makeHandoverStep(d.tm, d.k1, d.k2)]));
      const k3File = d.file(d.k3, 3, [makeHandoverStep(d.tm, d.k1, d.k3)]);
      const first = d.prog.loadTeamFile(k3File);
      const saidFirst = d.said.length;
      const again = d.prog.loadTeamFile(k3File);
      const reopened = d.open().loadTeamFile(k3File);
      return Object.assign(d, { toK2, first, again, reopened, saidFirst });
    }
    /* Two at once: both successors of K1 in one look. */
    function twoScene(mod) {
      const d = forkDesk(mod);
      const docs = [d.file(d.k2, 2, [makeHandoverStep(d.tm, d.k1, d.k2)]), d.file(d.k3, 2, [makeHandoverStep(d.tm, d.k1, d.k3)])];
      const mirrorBefore = d.prog.readMirror(C.TEAM_NAME);
      const look = d.prog.loadTeamFiles(docs);
      const saidFirst = d.said.length;
      const again = d.prog.loadTeamFiles(docs.slice().reverse());
      const reopened = d.open().loadTeamFiles(docs);
      return Object.assign(d, { look, again, reopened, saidFirst, mirrorBefore, docs });
    }
    const sameIds = (v, a) => !!v && JSON.stringify(v.to.slice().sort()) === JSON.stringify(a.slice().sort());

    const ls = laterScene(C);
    check(ls.toK2.ok === true && ls.first.ok === false && ls.first.reason === "bad-signature" && ls.prog.pinned().lead.keyId === ls.k2.keyId
      && ls.again.reason === "bad-signature" && ls.saidFirst === 1 && ls.said.length === 1 && /someone else's hands/.test(ls.said[0]) && ls.tolds.length === 1
      && !!ls.prog.fork() && ls.prog.fork().kind === "later" && ls.prog.fork().from === ls.k1.keyId && sameIds(ls.prog.fork(), [ls.k3.keyId])
      && ls.reopened.reason === "bad-signature" && ls.said.length === 1 && ls.tolds.length === 1,
      "938m a desk that followed K1 to K2 and later sees a genuine K1 to K3 file stays on K2 and says the fork once, not at every look, a restart included: followed "
      + ls.toK2.ok + ", K3 file " + ls.first.reason + ", pinned K2 " + (ls.prog.pinned().lead.keyId === ls.k2.keyId) + ", said " + ls.said.length + ", shown " + ls.tolds.length);

    try {
      const ts = twoScene(C);
      check(ts.look.ok === false && ts.look.reason === "fork" && ts.prog.pinned().lead.keyId === ts.k1.keyId && ts.prog.readMirror(C.TEAM_NAME) === ts.mirrorBefore
        && ts.again.reason === "fork" && ts.reopened.reason === "fork" && ts.prog.pinned().lead.keyId === ts.k1.keyId
        && ts.saidFirst === 1 && ts.said.length === 1 && /two different new keys/.test(ts.said[0]) && ts.tolds.length === 1
        && !!ts.prog.fork() && ts.prog.fork().kind === "two" && ts.prog.fork().from === ts.k1.keyId && sameIds(ts.prog.fork(), [ts.k2.keyId, ts.k3.keyId]),
        "938n a desk pinned to K1 that sees K1 handed to K2 and to K3 in one look follows neither, keeps its pin and the file it has, and says so once: "
        + ts.look.reason + ", pinned K1 " + (ts.prog.pinned().lead.keyId === ts.k1.keyId) + ", mirror kept " + (ts.prog.readMirror(C.TEAM_NAME) === ts.mirrorBefore) + ", said " + ts.said.length);
    } catch (e) {
      check(false, "938n a desk pinned to K1 that sees K1 handed to K2 and to K3 in one look follows neither, keeps its pin and the file it has, and says so once: " + (e && e.message ? e.message : String(e)));
    }

    /* A forged second successor: the K1 to K3 step is not K1's signature. */
    try {
      const fd = forkDesk(C);
      const strangerF = keyPair(false);
      const forged = stepBy(fd.tm, fd.k1, fd.k3, strangerF);
      const fdK2 = fd.prog.loadTeamFile(fd.file(fd.k2, 2, [makeHandoverStep(fd.tm, fd.k1, fd.k2)]));
      const fdForged = fd.prog.loadTeamFile(fd.file(fd.k3, 3, [forged]));
      const fp = forkDesk(C);
      const fpLook = fp.prog.loadTeamFiles([fp.file(fp.k2, 2, [makeHandoverStep(fp.tm, fp.k1, fp.k2)]), fp.file(fp.k3, 2, [stepBy(fp.tm, fp.k1, fp.k3, strangerF)])]);
      check(fdK2.ok === true && fdForged.ok === false && fdForged.reason === "bad-signature" && fd.prog.pinned().lead.keyId === fd.k2.keyId
        && fd.said.length === 0 && fd.tolds.length === 0 && fd.prog.fork() === null
        && fpLook.ok === true && fp.prog.pinned().lead.keyId === fp.k2.keyId && fp.said.length === 0 && fp.tolds.length === 0 && fp.prog.fork() === null,
        "938o a second successor whose step K1 did not sign shows no fork: refused as before " + fdForged.reason + ", said " + fd.said.length
        + "; in one look with the genuine K1 to K2 file the desk follows K2 and says nothing, said " + fp.said.length);
    } catch (e) {
      check(false, "938o a second successor whose step K1 did not sign shows no fork: " + (e && e.message ? e.message : String(e)));
    }

    /* Two at once in one file: K1's two genuine steps in the handovers of a single team file, in either order. */
    function oneFileTwo(mod, k3First) {
      const d = forkDesk(mod);
      const steps = [makeHandoverStep(d.tm, d.k1, d.k2), makeHandoverStep(d.tm, d.k1, d.k3)];
      const r = d.prog.loadTeamFile(d.file(d.k3, 2, k3First ? steps.reverse() : steps));
      return Object.assign(d, { r });
    }
    try {
      const of2 = [oneFileTwo(C, false), oneFileTwo(C, true)];
      check(of2.every(d => d.r.ok === false && d.r.reason === "fork" && d.prog.pinned().lead.keyId === d.k1.keyId && d.said.length === 1
          && /two different new keys/.test(d.said[0]) && d.tolds.length === 1 && !!d.prog.fork() && d.prog.fork().kind === "two"),
        "938u a desk pinned to K1 given one team file whose handovers hand K1 to K2 and to K3 follows neither, in either order of the steps, and says so once: "
        + of2.map(d => d.r.reason + ", pinned K1 " + (d.prog.pinned().lead.keyId === d.k1.keyId) + ", said " + d.said.length).join("; "));
    } catch (e) {
      check(false, "938u a desk pinned to K1 given one team file whose handovers hand K1 to K2 and to K3 follows neither, in either order of the steps, and says so once: " + (e && e.message ? e.message : String(e)));
    }
    const pForkFile = await liftChannel("plant:fork-file-two", mod => {
      const d = oneFileTwo(mod, true);
      return d.r.ok === true && d.prog.pinned().lead.keyId === d.k3.keyId;
    });
    check(pForkFile.turned && pForkFile.back, "938v lifting plant:fork-file-two follows one file that hands K1 to two keys, and the product file is never written: "
      + pForkFile.detail + ", sha " + (pForkFile.back ? "restored" : "differs"));

    const pForkIn = await liftBlobChannel("plant:fork-in", mod => {
      const a = laterScene(mod), b = twoScene(mod);
      return a.said.length === 0 && a.prog.fork() === null && b.said.length === 0 && b.prog.pinned().lead.keyId !== b.k1.keyId;
    });
    check(pForkIn.turned && pForkIn.back, "938p lifting plant:fork-in in blob.cjs shows no fork, so the desk says nothing of K1 handed on twice and follows one of two successors, and the product file is never written: "
      + pForkIn.detail + ", sha " + (pForkIn.back ? "restored" : "differs"));
    const pForkLater = await liftChannel("plant:fork-later", mod => {
      const a = laterScene(mod);
      return a.first.reason === "bad-signature" && a.said.length === 0 && a.prog.fork() === null;
    });
    check(pForkLater.turned && pForkLater.back, "938q lifting plant:fork-later leaves a genuine K1 to K3 file refused without a word, and the product file is never written: "
      + pForkLater.detail + ", sha " + (pForkLater.back ? "restored" : "differs"));
    const pForkSaid = await liftChannel("plant:fork-said", mod => {
      const a = laterScene(mod);
      return a.prog.fork() !== null && a.said.length === 0;
    });
    check(pForkSaid.turned && pForkSaid.back, "938r lifting plant:fork-said sees the fork and says nothing of it, and the product file is never written: "
      + pForkSaid.detail + ", sha " + (pForkSaid.back ? "restored" : "differs"));
    const pForkOnce = await liftChannel("plant:fork-once", mod => {
      const a = laterScene(mod);
      return a.said.length > 1 && a.tolds.length > 1;
    });
    check(pForkOnce.turned && pForkOnce.back, "938s lifting plant:fork-once says the same fork at every look, and the product file is never written: "
      + pForkOnce.detail + ", sha " + (pForkOnce.back ? "restored" : "differs"));
    const pForkTwo = await liftChannel("plant:fork-two", mod => {
      const b = twoScene(mod);
      return b.prog.pinned().lead.keyId !== b.k1.keyId;
    });
    check(pForkTwo.turned && pForkTwo.back, "938t lifting plant:fork-two follows one of two successors of K1 seen in one look, and the product file is never written: "
      + pForkTwo.detail + ", sha " + (pForkTwo.back ? "restored" : "differs"));
  }
}

/* ---- 1162: a computer back after the relay's deletion keep (Argon's relay review of 2026-11-01, finding 5, the test architect's
   condition). The relay keeps a deletion 30 days, then lists neither the file nor its deletion. On day 1 the lead retracts two
   catalogs and a joining desk withdraws its ask; the second computer of the lead has edited one of those catalogs while off. A
   desk back on day 11 learns by the deletion records, as it always has, with no whole list. A desk and the lead's second computer
   back on day 32 list the whole team and drop what it no longer names: the desk keeps the live catalog and its own note, and the
   second computer keeps its edit, which goes up, and sends no deletion back. ---- */
async function scene1162(mod) {
  const X = relay9(), { tm, BASE, DAYMS } = X;
  const DK = { k: keyPair(true), box: boxPair() }, DW = { k: keyPair(true), box: boxPair() }, NEW = { k: keyPair(true), box: boxPair() };
  const inv = hex(16), token = hex(32), seal = mod.inviteSealKey(hex(16));
  const RETIRED = "{\"note\":\"Lane Board retired\"}\n", NOTES = "{\"note\":\"Lane Board notes\"}\n";
  const EDIT = "{\"note\":\"Lane Board notes, edited on the second computer\"}\n", ASK = "{\"kind\":\"etiuda-join-request\"}\n";
  const MINE = "A note of the desk's own.\n", askRel = "desks/" + NEW.k.keyId + "/join.json", mineRel = "desks/" + DK.k.keyId + "/note.ec";
  /* The lead's deletions the relay still serves: a deletion past its 30 days stays a row until a list buries it, and is served no more. */
  const leadDels = () => { const s = X.store9(); return s ? s.dump().map(([k, v]) => [k, JSON.parse(v)]).filter(([k, m]) => k.startsWith("blob:") && m.writer === LEAD.keyId && m.del
    && X.RS.clock.now - m.at <= 30 * DAYMS).length : 0; };
  try {
    X.clockOn();
    const made = await X.admin9("POST", "/relay/v1/teams", createBody(tm.rt, X.RS.clock.now));
    const enrolled = await X.enrol9(1, DK, DW);
    const add = [{ id: inv, hash: sha(Buffer.from(token, "utf8")) }], at = X.RS.clock.now;
    const reg = await X.admin9("POST", "/relay/v1/t/" + tm.rt + "/invites", { add, drop: [], t: at, sig: signHex(LEAD, core.invitesBytes(tm.rt, at, add, [])) });
    if (made.status !== 200 || enrolled.status !== 200 || reg.status !== 200) throw new Error("the team was not made: " + JSON.stringify([made.json, enrolled.json, reg.json]));
    const inviteKeys = () => [{ id: inv, key: seal }];
    const lead = X.lead9(mod, "1162-lead-" + X.tag, { inviteKeys }), second = X.lead9(mod, "1162-second-" + X.tag, { inviteKeys });
    const dk = X.desk9(mod, "1162-away-" + X.tag, DK), dw = X.desk9(mod, "1162-week-" + X.tag, DW);
    const nd = X.desk9(mod, "1162-new-" + X.tag, NEW, null, { invite: () => ({ inv, token, seal }) });
    put(lead.mirror, C.TEAM_NAME, X.doc9(1, [DK, DW]));
    put(lead.mirror, "lane.ec", ED9[0]);
    put(lead.mirror, "retired.ec", RETIRED);
    put(lead.mirror, "notes.ec", NOTES);
    lead.ch.start();
    await settle(lead);
    put(nd.mirror, askRel, ASK);
    for (const p of [second, dk, dw, nd]) p.ch.start();
    await settle(nd, lead, second, dk, dw);
    put(dk.mirror, mineRel, MINE);
    await settle(dk, lead, second, dw);
    const before = read(second.mirror, askRel) === ASK && read(second.mirror, "retired.ec") === RETIRED && read(second.mirror, "notes.ec") === NOTES
      && read(dk.mirror, "retired.ec") === RETIRED && read(dw.mirror, "retired.ec") === RETIRED && read(lead.mirror, askRel) === ASK;
    await second.ch.stop();
    await dk.ch.stop();
    await dw.ch.stop();

    X.at(BASE + DAYMS);
    fs.unlinkSync(path.join(lead.mirror, "retired.ec"));
    fs.unlinkSync(path.join(lead.mirror, "notes.ec"));
    fs.unlinkSync(path.join(nd.mirror, ...askRel.split("/")));
    await settle(nd, lead);
    await settle(nd, lead);
    const retracted = read(lead.mirror, askRel) === null && !X.leadFiles()["retired.ec"] && !X.leadFiles()["notes.ec"];
    put(second.mirror, "notes.ec", EDIT);

    X.at(BASE + 11 * DAYMS);
    const wFrom = dw.log.length;
    dw.ch.start();
    await settle(dw);
    const week = { retired: read(dw.mirror, "retired.ec"), lane: read(dw.mirror, "lane.ec") === ED9[0],
      whole: dw.log.slice(wFrom).filter(c => c === "GET since/0").length };

    X.at(BASE + 32 * DAYMS);
    const delsBefore = leadDels(), kFrom = dk.log.length;
    dk.ch.start();
    second.ch.start();
    await settle(dk, second);
    await settle(dk, second);
    const desk = { retired: read(dk.mirror, "retired.ec"), lane: read(dk.mirror, "lane.ec") === ED9[0], mine: read(dk.mirror, mineRel) === MINE,
      whole: dk.log.slice(kFrom).filter(c => c === "GET since/0").length };
    const files = X.leadFiles();
    const two = { retired: read(second.mirror, "retired.ec"), ask: read(second.mirror, askRel), notes: read(second.mirror, "notes.ec") === EDIT,
      lane: read(second.mirror, "lane.ec") === ED9[0], up: files["notes.ec"] === EDIT, back: !files["retired.ec"], dels: leadDels() - delsBefore };
    return {
      setup: before && retracted,
      week: week.retired === null && week.lane && week.whole === 0,
      desk: desk.retired === null && desk.lane && desk.mine && desk.whole >= 1,
      two: two.retired === null && two.ask === null && two.notes && two.lane && two.up && two.back && two.dels === 0,
      detail: JSON.stringify({ before, retracted, week, desk, two }),
    };
  } finally {
    await X.done();
  }
}
/* The team file is never dropped by that list: a program whose record names a team file and a catalog the list does not name
   drops the catalog alone. */
function teamKept(mod) {
  const TEXT = "{\"kind\":\"etiuda-team\"}\n", LANE = "{\"note\":\"Lane Board\"}\n";
  const files = new Map([[C.TEAM_NAME, Buffer.from(TEXT)], ["lane.ec", Buffer.from(LANE)]]);
  const io = { read: r => (files.has(r) ? files.get(r) : null), write: (r, t) => files.set(r, Buffer.from(t)), remove: r => files.delete(r), list: () => [...files.keys()] };
  const row = (body, counter) => ({ writer: LEAD.keyId, epoch: 1, counter, id: hex(16), at: 1, sha: sha(Buffer.from(body)) });
  const state = { kind: "etiuda-relay-channel", v: 1, seq: 9, applied: { [C.TEAM_NAME]: row(TEXT, 1), "lane.ec": row(LANE, 2) } };
  const prog = mod.createProgram({ io, load: () => state });
  /* A whole list reaches the program's place (reconcile refuses one that stops below it) and names neither file. */
  const dropped = prog.reconcile([{ seq: 9, meta: { id: hex(16) } }]);
  return { ok: dropped.length === 1 && dropped[0] === "lane.ec" && files.has(C.TEAM_NAME) && !files.has("lane.ec"), dropped };
}
if (partOn("p1162")) {
  try {
    markPart("p1162");
    const s = await scene1162(C);
    check(s.setup && s.desk, "1162a a desk back on day 32 lists the whole team and drops the catalog the lead retracted on day 1, whose deletion the relay"
      + " has let go, and keeps the live catalog and its own note: " + s.detail);
    check(s.setup && s.two, "1162b the lead's second computer back on day 32 drops the retracted catalog and the ask a joining desk withdrew, keeps the"
      + " catalog it edited while off, which goes up, and sends no deletion back: " + s.detail);
    check(s.setup && s.week, "1162c a desk back on day 11, inside the keep, learns of the retraction by its deletion record and lists nothing whole: " + s.detail);
    const t = teamKept(C);
    check(t.ok, "1162d that list never drops the team file: a record naming a team file and a catalog the list does not name drops the catalog alone: "
      + JSON.stringify(t.dropped));
    const lifts = [
      ["plant:listed-behind", "1162a", "the desk back on day 32 keeps the retracted catalog", async mod => !(await scene1162(mod)).desk],
      ["plant:reconcile-edit", "1162b", "the second computer's edit is dropped with the retracted catalogs", async mod => !(await scene1162(mod)).two],
      ["plant:reconcile-sent", "1162b", "the second computer sends a deletion of the retracted catalog back", async mod => !(await scene1162(mod)).two],
      ["plant:reconcile-team", "1162d", "the team file is dropped", async mod => !teamKept(mod).ok],
    ];
    let n = 0;
    for (const [tag, leg, say, turns] of lifts) {
      const p = await liftChannel(tag, turns);
      check(p.turned && p.back, "1162" + String.fromCharCode(101 + n++) + " lifting " + tag + " turns " + leg + " red (" + say + "), and the product file is never written: "
        + p.detail.split("\n")[0] + ", sha " + (p.back ? "restored" : "differs"));
    }
  } catch (e) {
    check(false, "harness (the leg 1162a): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- relay triage 5, the relay half (the test architect, 2026-11-01 13:26): the relay holds a removed desk's blobs for the
   lead for REMOVED_KEEP_MS, and the lead's own channel takes, through createChannel and catchUp, what that desk sealed before
   the lead held the roster that leaves it off, inside that grace (1165a). A file the desk seals after it is refused removed
   (1165b, fifteen minutes after, past the ten a desk clock may run ahead), and so is the earlier file once the lead's clock is
   past the grace while the relay still serves it (1165c). A hostile relay serving the same held blob to another desk does not
   get it taken there (1165d). A desk whose clock runs three minutes ahead has its file before the removal taken (1165h). ---- */
async function removedGrace(mod, arm) {
  const k1 = crypto.randomBytes(32), gone = keyPair(true), stay = keyPair(true);
  const tm = await freshTeam([gone, stay]);
  const tag = arm + "-" + tm.rt.slice(0, 8);
  const keyFor = e => (e === 1 ? k1 : null);
  let ahead = 0, deskAhead = arm === "fast" || arm === "lift-ahead" ? 3 * 60 * 1000 : 0;
  const lead = opened(mod, "1165-lead-" + tag, tm, LEAD, "root", { keyFor, sealEpoch: () => 1, clock: () => Date.now() + ahead });
  const desk = opened(mod, "1165-desk-" + tag, tm, gone, "desk:" + gone.keyId, { keyFor, sealEpoch: () => 1, clock: () => Date.now() + deskAhead });
  const other = opened(mod, "1165-other-" + tag, tm, stay, "desk:" + stay.keyId, { keyFor, sealEpoch: () => 1 });
  const doc1 = teamBody(tm, 1, 1, [member(gone), member(stay)]), doc2 = teamBody(tm, 1, 2, [member(stay)]);
  put(lead.mirror, C.TEAM_NAME, doc1);
  lead.prog.loadTeamFile(JSON.parse(doc1));
  lead.ch.start();
  desk.ch.start();
  other.ch.start();
  await settle(lead, desk, other);
  /* Neither the lead nor the other desk runs a cycle of its own until the relay has taken the removal. */
  await lead.ch.stop();
  await other.ch.stop();
  const stats = "desks/" + gone.keyId + "/stats.estat", late = "desks/" + gone.keyId + "/late.ec";
  const BEFORE = "sealed-before\n", AFTER = "sealed-after\n";
  put(desk.mirror, stats, BEFORE);
  await once(desk);
  await wait(5);
  /* Studio's removal: the team file without the desk, in the lead's mirror and held by its channel. */
  put(lead.mirror, C.TEAM_NAME, doc2);
  lead.prog.loadTeamFile(JSON.parse(doc2));
  await wait(5);
  /* Fifteen minutes after the removal by the lead's clock, as the desk's clock reads it. */
  deskAhead = 15 * 60 * 1000;
  put(desk.mirror, late, AFTER);
  await once(desk);
  await desk.ch.stop();
  const t = R.clock.now, keep = [{ id: stay.keyId, pub: stay.pub, desk: stay.keyId }];
  const dropped = await admin("POST", "/relay/v1/t/" + tm.rt + "/devices", { keys: keep, rev: 2, t,
    sig: signHex(LEAD, core.devicesBytes(tm.rt, 2, t, keep)) });
  const s = relayStore(tm.rt);
  const held = s.dump().filter(([k]) => k.startsWith("held:")).map(([, v]) => JSON.parse(v));
  if (arm === "past") ahead = core.REMOVED_KEEP_MS + 60 * 60 * 1000;
  const from = lead.said.length;
  lead.ch.start();
  await once(lead);
  const leadSaid = lead.said.slice(from).filter(l => l.indexOf(B.REASONS.removed) >= 0).length;
  /* The hostile relay: each held blob put back on the list every desk reads, then the other desk catches up. */
  for (const h of held) {
    const seq = (s.get("seq") || 0) + 1, rec = Object.assign({}, h, { seq });
    delete rec.heldUntil;
    s.put("blob:" + h.id, rec);
    s.put("seq:" + String(seq).padStart(16, "0"), h.id);
    s.put("seq", seq);
  }
  const otherFrom = other.said.length;
  other.ch.start();
  await once(other);
  const otherSaid = other.said.slice(otherFrom).filter(l => l.indexOf(B.REASONS.removed) >= 0).length;
  const out = { dropped: dropped.status === 200, held: held.length, before: read(lead.mirror, stats), after: read(lead.mirror, late),
    leadSaid, otherTeam: read(other.mirror, C.TEAM_NAME) === doc2, otherBefore: read(other.mirror, stats), otherSaid,
    keepSame: C.REMOVED_KEEP_MS === core.REMOVED_KEEP_MS };
  await lead.ch.stop();
  await other.ch.stop();
  out.line = "relay removal " + (out.dropped ? "taken" : "refused") + ", held on the relay " + out.held + ", the lead's mirror: sealed before "
    + JSON.stringify(out.before) + ", sealed after " + JSON.stringify(out.after) + ", said removed " + out.leadSaid
    + "; the other desk: team file " + (out.otherTeam ? "the removal's" : "not the removal's") + ", sealed before " + JSON.stringify(out.otherBefore)
    + ", said removed " + out.otherSaid + "; grace " + (out.keepSame ? "the relay's" : "differs from the relay's");
  return out;
}
/* THE GRACE ADDS, IT NEVER REPLACES. The lead holds the desk's file; the desk seals a later version of it and a new file, both
   before the removal; the lead's catch-up after it refuses the first, says so, keeps its copy, and takes the second. */
async function graceHeld(mod, arm) {
  const k1 = crypto.randomBytes(32), gone = keyPair(true), stay = keyPair(true);
  const tm = await freshTeam([gone, stay]);
  const tag = arm + "-" + tm.rt.slice(0, 8);
  const keyFor = e => (e === 1 ? k1 : null);
  const lead = opened(mod, "1165j-lead-" + tag, tm, LEAD, "root", { keyFor, sealEpoch: () => 1 });
  const desk = opened(mod, "1165j-desk-" + tag, tm, gone, "desk:" + gone.keyId, { keyFor, sealEpoch: () => 1 });
  const doc1 = teamBody(tm, 1, 1, [member(gone), member(stay)]), doc2 = teamBody(tm, 1, 2, [member(stay)]);
  put(lead.mirror, C.TEAM_NAME, doc1);
  lead.prog.loadTeamFile(JSON.parse(doc1));
  lead.ch.start();
  desk.ch.start();
  await settle(lead, desk);
  const stats = "desks/" + gone.keyId + "/stats.estat", fresh = "desks/" + gone.keyId + "/in-use.ec";
  put(desk.mirror, stats, "the-record\n");
  await once(desk);
  await settle(lead, desk);
  const had = read(lead.mirror, stats);
  await lead.ch.stop();
  if (arm.indexOf("delete") >= 0) fs.unlinkSync(path.join(desk.mirror, ...stats.split("/")));
  else put(desk.mirror, stats, "written-over\n");
  put(desk.mirror, fresh, "last-file\n");
  await once(desk);
  await wait(5);
  put(lead.mirror, C.TEAM_NAME, doc2);
  lead.prog.loadTeamFile(JSON.parse(doc2));
  await wait(5);
  await desk.ch.stop();
  const t = R.clock.now, keep = [{ id: stay.keyId, pub: stay.pub, desk: stay.keyId }];
  const dropped = await admin("POST", "/relay/v1/t/" + tm.rt + "/devices", { keys: keep, rev: 2, t,
    sig: signHex(LEAD, core.devicesBytes(tm.rt, 2, t, keep)) });
  const from = lead.said.length;
  lead.ch.start();
  await once(lead);
  const said = lead.said.slice(from).filter(l => l.indexOf(B.REASONS.removed) >= 0).length;
  const out = { dropped: dropped.status === 200, had, record: read(lead.mirror, stats), fresh: read(lead.mirror, fresh), said };
  await lead.ch.stop();
  out.line = "the lead held " + JSON.stringify(out.had) + " before the removal and holds " + JSON.stringify(out.record)
    + "; the new path " + JSON.stringify(out.fresh) + "; said removed " + out.said;
  return out;
}
  const graceKept = x => x.dropped && x.had === "the-record\n" && x.record === "the-record\n" && x.said >= 1;


  const graceNew = x => x.dropped && x.fresh === "last-file\n";


  const graceTaken = x => x.dropped && x.held === 2 && x.keepSame && x.before === "sealed-before\n";


  const graceAfter = x => x.dropped && x.held === 2 && x.after === null && x.leadSaid >= 1;


  const gracePast = x => x.dropped && x.held === 2 && x.keepSame && x.before === null && x.after === null && x.leadSaid >= 2;


  const graceFast = x => graceTaken(x) && graceAfter(x);


  const graceOnly = x => x.otherTeam && x.otherBefore === null && x.otherSaid >= 1;
if (partOn("p1165")) {
  try {
    markPart("p1165");
    const g = await removedGrace(C, "within");
    check(graceTaken(g), "1165a the lead's channel takes, in its catch-up inside the grace, the file a removed desk sealed before the lead held"
      + " the roster that leaves it off, which the relay holds for the lead alone: " + g.line);
    check(graceAfter(g), "1165b the same catch-up refuses removed the file that desk sealed after the lead held that roster: " + g.line);
    const p = await removedGrace(C, "past");
    check(gracePast(p), "1165c past the grace by the lead's clock, the relay still serving both, the lead's catch-up refuses removed the file"
      + " sealed before as well: " + p.line);
    check(graceOnly(g), "1165d a hostile relay serving the held file to another desk on the list it reads: that desk's catch-up refuses it"
      + " removed: " + g.line);
    const f = await removedGrace(C, "fast");
    check(graceFast(f), "1165h a desk whose clock runs three minutes ahead of the lead's has the file it sealed before the removal taken, and"
      + " its file sealed fifteen minutes after is still refused removed: " + f.line);
    const h = await graceHeld(C, "held");
    check(graceKept(h), "1165j inside the grace a removed desk's later version of a file the lead held before the removal is refused and said,"
      + " and the earlier copy stays the record: " + h.line);
    check(graceNew(h), "1165k and a new path it sealed before the removal lands: " + h.line);
    const d = await graceHeld(C, "delete");
    check(graceKept(d), "1165m the same by deletion: a delete blob on the held path inside the grace is refused and said, and the earlier copy"
      + " stays the record: " + d.line);
    const lifts = [
      ["plant:grace-held",
        "1165l lifting plant:grace-held turns 1165j red (the removed desk writes over its own record)",
        async mod => !graceKept(await graceHeld(mod, "lift-held"))],
      ["plant:lead-grace-before",
        "1165e lifting plant:lead-grace-before turns 1165b red (the file sealed after the removal is taken)",
        async mod => !graceAfter(await removedGrace(mod, "lift-before"))],
      ["plant:lead-grace-window",
        "1165f lifting plant:lead-grace-window turns 1165c red (the file sealed before is taken past the grace)",
        async mod => !gracePast(await removedGrace(mod, "lift-window"))],
      ["plant:lead-grace-only",
        "1165g lifting plant:lead-grace-only turns 1165d red (the other desk takes the held file)",
        async mod => !graceOnly(await removedGrace(mod, "lift-only"))],
      ["plant:lead-grace-ahead",
        "1165i lifting plant:lead-grace-ahead turns 1165h red (the file sealed three minutes ahead before the removal is refused)",
        async mod => !graceTaken(await removedGrace(mod, "lift-ahead"))],
    ];
    for (const [tagName, name, turns] of lifts) {
      if (PLANTS_OFF) { skip(name); continue; }
      const q = await liftChannel(tagName, turns);
      check(q.turned && q.back, name + ", and the product file is never written: " + q.detail.split("\n")[0] + ", sha " + (q.back ? "restored" : "differs"));
    }
  } catch (e) {
    check(false, "harness (the leg 1165a): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- finding (2): a file put back to bytes received within ECHO_MS after an edit was sent is not an echo ---- */
async function sceneF2(mod) {
  const k1 = crypto.randomBytes(32), deskKey = keyPair(true);
  const tm = await freshTeam([deskKey]);
  const tag = tm.rt.slice(0, 8), MIN = 60 * 1000;
  let now = Date.now();
  const clock = () => now;
  const keyFor = e => (e === 1 ? k1 : null);
  const V1 = "guide V1, received\n", V2 = "guide V2, a local edit\n";
  const a = opened(mod, "f2-a-" + tag, tm, LEAD, "root", { keyFor, sealEpoch: () => 1, clock, connect: null });
  const b = opened(mod, "f2-b-" + tag, tm, LEAD, "root", { keyFor, sealEpoch: () => 1, clock, connect: null });
  const desk = opened(mod, "f2-d-" + tag, tm, deskKey, "desk:" + deskKey.keyId, { keyFor, sealEpoch: () => 1, clock, connect: null });
  const doc1 = teamBody(tm, 1, 1, [member(deskKey)]);
  put(a.mirror, C.TEAM_NAME, doc1);
  put(a.mirror, "guide.ec", V1);
  a.ch.start(); b.ch.start(); desk.ch.start();
  await a.ch.idle(); await b.ch.idle(); await desk.ch.idle();
  await once(a); await once(b); await once(desk);
  const echoInitial = b.prog.considerOutgoing("guide.ec", Buffer.from(V1));
  const deskEcho = desk.prog.considerOutgoing("guide.ec", Buffer.from(V1));
  const putsBefore = putsOf(b);

  /* +10 min: b edits V1 -> V2 and sends V2. */
  now += 10 * MIN;
  put(b.mirror, "guide.ec", V2);
  await once(b);
  const putsAfterEdit = putsOf(b);
  await once(b);
  const putsStillEdit = putsOf(b);
  await once(a);
  const aSawV2 = read(a.mirror, "guide.ec") === V2;

  /* +20 min (still inside ECHO_MS): b puts V1 back; must be sent, not withheld as an echo. */
  now += 10 * MIN;
  put(b.mirror, "guide.ec", V1);
  const wordPutBack = b.prog.considerOutgoing("guide.ec", Buffer.from(V1));
  await once(b);
  const putsAfterBack = putsOf(b);
  await once(a);
  const aSawV1Back = read(a.mirror, "guide.ec") === V1;

  await a.ch.stop(); await b.ch.stop(); await desk.ch.stop();
  return {
    echoInitialOk: echoInitial.send === false && echoInitial.reason === "echo" && putsBefore === 0,
    deskEchoOk: deskEcho.send === false && deskEcho.reason === "echo",
    editedOk: putsAfterEdit === 1 && putsStillEdit === 1 && aSawV2,
    putBackSent: wordPutBack.send === true && putsAfterBack === 2 && aSawV1Back,
    detail: JSON.stringify({ echoInitial, deskEcho, putsAfterEdit, putsStillEdit, putsAfterBack, wordPutBack, aSawV2, aSawV1Back }),
  };
}
if (partOn("pF2")) {
  try {
    markPart("pF2");
    const s = await sceneF2(C);
    check(s.echoInitialOk && s.deskEchoOk,
      "f2a a received file not changed since landing still counts as an echo and is not sent: "
      + s.detail);
    check(s.editedOk && s.putBackSent,
      "f2b a file edited, sent, and put back within ECHO_MS to the earlier received bytes is sent to the team rather than withheld as an echo: "
      + s.detail);
    if (PLANTS_OFF) skip("f2c lifting plant:sent-newer turns f2b red (putting back V1 within ECHO_MS is withheld as an echo)");
    else {
      const p = await liftChannel("plant:sent-newer", async mod => !(await sceneF2(mod)).putBackSent);
      check(p.turned && p.back, "f2c lifting plant:sent-newer turns f2b red (putting back V1 within ECHO_MS is withheld as an echo), and the product file is never written: "
        + p.detail + ", sha " + (p.back ? "restored" : "differs"));
    }
  } catch (e) {
    check(false, "harness (the leg f2a): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- finding (4): superseded path identity uses pathKey rather than toLowerCase ---- */
async function sceneF4Sigma(mod) {
  const k1 = crypto.randomBytes(32), deskKey = keyPair(true);
  const tm = await freshTeam([deskKey]);
  const tag = tm.rt.slice(0, 8);
  const keyFor = e => (e === 1 ? k1 : null);
  const OLD = "\u0391\u0398\u0397\u039d\u0391\u03a3 2.ec";
  const NEW = "\u03b1\u03b8\u03b7\u03bd\u03b1\u03c3 2.ec";
  const lead = opened(mod, "f4s-lead-" + tag, tm, LEAD, "root", { keyFor, sealEpoch: () => 1, connect: null });
  const desk = opened(mod, "f4s-desk-" + tag, tm, deskKey, "desk:" + deskKey.keyId, { keyFor, sealEpoch: () => 1, connect: null });
  put(lead.mirror, mod.TEAM_NAME, teamBody(tm, 1, 1, [member(deskKey)]));
  put(lead.mirror, OLD, "one\n");
  lead.ch.start(); desk.ch.start();
  await lead.ch.idle(); await desk.ch.idle();
  await once(lead); await once(desk);
  const landedOld = read(desk.mirror, OLD) === "one\n";

  fs.renameSync(path.join(lead.mirror, OLD), path.join(lead.mirror, NEW));
  put(lead.mirror, NEW, "two\n");
  await once(lead);
  const beforeSaid = desk.said.length;
  await once(desk);
  const newSaid = desk.said.slice(beforeSaid);
  const landedNew = read(desk.mirror, NEW) === "two\n" && !newSaid.some(l => l.indexOf(B.REASONS["outside-place"]) >= 0);

  await lead.ch.stop(); await desk.ch.stop();
  return {
    ok: landedOld && landedNew,
    landedOld, landedNew, newSaid, body: read(desk.mirror, NEW),
  };
}
function sceneF4Kelvin(mod) {
  const k1 = crypto.randomBytes(32), deskKey = keyPair(true);
  const tm = "t-" + hex(8), rt = hex(16);
  const pinK = { teamId: tm, rt, lead: { keyId: LEAD.keyId, public: LEAD.pub } };
  const doc = signDoc({ format: 1, kind: "etiuda-team", id: tm, catalogs: ["quay-board"],
    lead: { keyId: LEAD.keyId, public: LEAD.pub }, sealed: true, exportsSealed: false, epoch: 1, rev: 1,
    channel: { kind: "relay", rt, url: URLV1 }, ring: RING, roster: [member(deskKey)] }, LEAD);
  const dir = path.join(LAB, "f4k-" + hex(4));
  fs.mkdirSync(dir, { recursive: true });
  const prog = mod.createProgram({ io: mod.diskIO(dir, mod.writeWhole), pin: pinK, save() {}, say() {} });
  prog.loadTeamFile(doc);
  const p1 = "desks/" + deskKey.keyId + "/k.ec", p2 = "desks/" + deskKey.keyId + "/\u212a.ec";
  const b1 = B.seal({ relayTeamId: rt, epoch: 1, teamKey: k1, writer: { keyId: deskKey.keyId, privateKey: deskKey.privateKey },
    path: p1, body: "one\n", counter: 1, place: "desk:" + deskKey.keyId, kind: "file" });
  const r1 = prog.acceptBlob({ blob: b1, teamDoc: doc, teamKey: k1 });
  const b2 = B.seal({ relayTeamId: rt, epoch: 1, teamKey: k1, writer: { keyId: deskKey.keyId, privateKey: deskKey.privateKey },
    path: p2, body: "two\n", counter: 2, place: "desk:" + deskKey.keyId, kind: "file", supersedes: b1.id });
  const r2 = prog.acceptBlob({ blob: b2, teamDoc: doc, teamKey: k1 });
  return {
    ok: r1.ok === true && r2.ok === false && r2.reason === "outside-place"
      && prog.readMirror(p1) === "one\n" && prog.readMirror(p2) === null,
    r1, r2, kBody: prog.readMirror(p1), kelvinBody: prog.readMirror(p2),
  };
}
if (partOn("pF4")) {
  try {
    markPart("pF4");
    const s = await sceneF4Sigma(C);
    check(s.ok, "f4a renaming a root file from capital sigma before a space or digit to lower case (same pathKey) is accepted on the desk: "
      + JSON.stringify({ landedOld: s.landedOld, landedNew: s.landedNew, body: s.body, newSaid: s.newSaid }));
    const k = sceneF4Kelvin(C);
    check(k.ok, "f4b superseding k.ec with Kelvin sign (\\u212a.ec, distinct pathKey) is refused as outside-place: "
      + JSON.stringify({ r1: k.r1.ok, r2: k.r2, kBody: k.kBody, kelvinBody: k.kelvinBody }));
    if (PLANTS_OFF) skip("f4c lifting plant:chain-path-fold turns f4a and f4b red (sigma update refused and Kelvin cross-path supersede accepted)");
    else {
      const p = await liftChannel("plant:chain-path-fold", async mod => !(await sceneF4Sigma(mod)).ok && !sceneF4Kelvin(mod).ok);
      check(p.turned && p.back, "f4c lifting plant:chain-path-fold turns f4a and f4b red (sigma update refused and Kelvin cross-path supersede accepted), and the product file is never written: "
        + p.detail + ", sha " + (p.back ? "restored" : "differs"));
    }
  } catch (e) {
    check(false, "harness (the leg f4a): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- finding (8): a relisting never removes what a lead or colleague kept of a removed desk ---- */
async function sceneF8(mod) {
  const X = relay9(), { tm, BASE, DAYMS } = X;
  const DR = { k: keyPair(true), box: boxPair() }, DK = { k: keyPair(true), box: boxPair() }, DA = { k: keyPair(true), box: boxPair() };
  const STATS = "desk statistics kept across removal\n", DK_OLD = "active desk file retracted later\n";
  const RETIRED = "lead file retracted later\n", NEWEST = "the newest live file in the team\n";
  const statsRel = "desks/" + DR.k.keyId + "/stats.estat", dkOldRel = "desks/" + DK.k.keyId + "/old.ec";
  const afterRel = "desks/" + DR.k.keyId + "/after.ec";
  try {
    X.clockOn();
    const made = await X.admin9("POST", "/relay/v1/teams", createBody(tm.rt, X.RS.clock.now));
    const enrolled = await X.enrol9(1, DR, DK, DA);
    if (made.status !== 200 || enrolled.status !== 200) throw new Error("the team was not made: " + JSON.stringify([made.json, enrolled.json]));
    const lead = X.lead9(mod, "f8-lead-" + X.tag);
    const dr = X.desk9(mod, "f8-rem-" + X.tag, DR);
    const dk = X.desk9(mod, "f8-keep-" + X.tag, DK);
    const da = X.desk9(mod, "f8-away-" + X.tag, DA);
    put(lead.mirror, mod.TEAM_NAME, X.doc9(1, [DR, DK, DA]));
    put(lead.mirror, "lane.ec", ED9[0]);
    put(lead.mirror, "retired.ec", RETIRED);
    lead.ch.start();
    await settle(lead);
    dr.ch.start(); dk.ch.start(); da.ch.start();
    await settle(dr, dk, da, lead);
    put(dr.mirror, statsRel, STATS);
    put(dk.mirror, dkOldRel, DK_OLD);
    await settle(dr, dk, da, lead);
    const before = read(lead.mirror, statsRel) === STATS && read(dk.mirror, statsRel) === STATS && read(da.mirror, statsRel) === STATS
      && read(lead.mirror, "retired.ec") === RETIRED && read(da.mirror, "retired.ec") === RETIRED
      && read(lead.mirror, dkOldRel) === DK_OLD && read(da.mirror, dkOldRel) === DK_OLD;

    /* Day 1: da stops before both retractions; lead removes DR (team file rev 2 + /devices drop) and retracts retired.ec; dk retracts dkOldRel. */
    await da.ch.stop();
    X.at(BASE + DAYMS);
    await dr.ch.stop();
    const doc2Raw = JSON.parse(X.doc9(1, [DK, DA]));
    doc2Raw.rev = 2;
    const doc2Obj = signDoc(doc2Raw, LEAD);
    const doc2 = JSON.stringify(doc2Obj, null, 1) + "\n";
    put(lead.mirror, mod.TEAM_NAME, doc2);
    fs.unlinkSync(path.join(lead.mirror, "retired.ec"));
    fs.unlinkSync(path.join(dk.mirror, ...dkOldRel.split("/")));
    const dropped = await X.enrol9(2, DK, DA);
    await settle(lead, dk);
    /* The newest row in the team is a LIVE file, written after the day's deletions. Without it the deletions are the newest
       rows, they have expired by day 32, the relisted list then stops below each program's place in the sequence, and
       reconcile removes nothing from such a list (plant:reconcile-top, 2026-11-16): f8a would hold for that reason and not
       for the one it names, and f8d's plant could not turn it. */
    put(lead.mirror, "newest.ec", NEWEST);
    await settle(lead, dk);
    const newestLanded = read(dk.mirror, "newest.ec") === NEWEST;
    const stoppedHeld = read(da.mirror, "retired.ec") === RETIRED && read(da.mirror, dkOldRel) === DK_OLD;
    await lead.ch.stop();
    await dk.ch.stop();

    /* Day 32 (> LISTED_KEEP_MS = 29 days, and > REMOVED_KEEP_MS = 7 days): relisting runs on lead, dk, and da. */
    X.at(BASE + 32 * DAYMS);
    const leadFrom = lead.log.length, dkFrom = dk.log.length, daFrom = da.log.length;
    lead.ch.start(); dk.ch.start(); da.ch.start();
    await settle(lead, dk, da);
    const leadWhole = lead.log.slice(leadFrom).filter(c => c === "GET since/0").length;
    const dkWhole = dk.log.slice(dkFrom).filter(c => c === "GET since/0").length;
    const daWhole = da.log.slice(daFrom).filter(c => c === "GET since/0").length;
    const keptAfter = {
      leadStats: read(lead.mirror, statsRel) === STATS,
      dkStats: read(dk.mirror, statsRel) === STATS,
      daStats: read(da.mirror, statsRel) === STATS,
      leadLane: read(lead.mirror, "lane.ec") === ED9[0],
      dkLane: read(dk.mirror, "lane.ec") === ED9[0],
      daLane: read(da.mirror, "lane.ec") === ED9[0],
    };
    const activeRemoved = {
      leadRetired: read(lead.mirror, "retired.ec") === null,
      dkRetired: read(dk.mirror, "retired.ec") === null,
      daRetired: read(da.mirror, "retired.ec") === null,
      leadDkOld: read(lead.mirror, dkOldRel) === null,
      dkDkOld: read(dk.mirror, dkOldRel) === null,
      daDkOld: read(da.mirror, dkOldRel) === null,
    };

    /* A removed writer's new file (even injected/accepted directly) still does not land on lead, dk, or da. */
    const afterBlob = B.seal({ relayTeamId: tm.rt, epoch: 1, teamKey: X.K9.get(1),
      writer: { keyId: DR.k.keyId, privateKey: DR.k.privateKey },
      path: afterRel, body: "new after removal\n", counter: Date.now() + 60 * 60 * 1000,
      place: "desk:" + DR.k.keyId, kind: "file" });
    const leadNew = lead.prog.acceptBlob({ blob: afterBlob, teamDoc: doc2Obj, teamKey: X.K9.get(1) });
    const dkNew = dk.prog.acceptBlob({ blob: afterBlob, teamDoc: doc2Obj, teamKey: X.K9.get(1) });
    const daNew = da.prog.acceptBlob({ blob: afterBlob, teamDoc: doc2Obj, teamKey: X.K9.get(1) });
    const newRefused = leadNew.ok === false && leadNew.reason === "removed"
      && dkNew.ok === false && dkNew.reason === "removed"
      && daNew.ok === false && daNew.reason === "removed"
      && read(lead.mirror, afterRel) === null && read(dk.mirror, afterRel) === null && read(da.mirror, afterRel) === null;

    return {
      setup: before && stoppedHeld && newestLanded && dropped.status === 200 && leadWhole >= 1 && dkWhole >= 1 && daWhole >= 1,
      kept: keptAfter.leadStats && keptAfter.dkStats && keptAfter.daStats
        && keptAfter.leadLane && keptAfter.dkLane && keptAfter.daLane,
      activeGone: activeRemoved.leadRetired && activeRemoved.dkRetired && activeRemoved.daRetired
        && activeRemoved.leadDkOld && activeRemoved.dkDkOld && activeRemoved.daDkOld,
      newRefused,
      detail: JSON.stringify({ before, stoppedHeld, newestLanded, dropped: dropped.status, leadWhole, dkWhole, daWhole, keptAfter, activeRemoved, leadNew, dkNew, daNew }),
    };
  } finally {
    await X.done();
  }
}
async function liftReconcileRemove(fn) {
  const src = path.join(ROOT, "shell", "relay", "channel.cjs");
  const beforeBytes = fs.readFileSync(src);
  const digest = sha(beforeBytes);
  const target = "try { if (rel) io.remove(rel); } catch (e) { say(rel + \" could not be removed from the mirror - \" + (e && e.message)); continue; }";
  let turned = false, detail = "reconcile removal line absent";
  try {
    const text = beforeBytes.toString("utf8");
    if (text.split(target).length === 2) {
      const lifted = loadPlantedChannel(text.split(target).join("continue;"));
      turned = await fn(lifted);
      detail = turned ? "the check lifted" : "the check still held";
    }
  } catch (e) {
    detail = e && e.stack ? e.stack : String(e);
  }
  return { turned, back: sha(fs.readFileSync(src)) === digest, detail };
}
if (partOn("pF8")) {
  try {
    markPart("pF8");
    const s = await sceneF8(C);
    check(s.setup && s.kept,
      "f8a after more than 29 days away, a relisting keeps the files a lead and remaining desk kept of a removed desk: " + s.detail);
    check(s.setup && s.activeGone,
      "f8b the same relisting still removes retracted files of the lead and an active rostered desk once their deletions are no longer listed: " + s.detail);
    check(s.newRefused,
      "f8c a removed writer's new file still does not land (refused removed): " + s.detail);
    if (PLANTS_OFF) {
      skip("f8d lifting plant:reconcile-removed turns f8a red (relisting deletes the removed desk's kept file)");
      skip("f8e lifting reconcile's removal of an unlisted live file turns f8b red (a stopped desk keeps retracted files after relist)");
    } else {
      const p = await liftChannel("plant:reconcile-removed", async mod => !(await sceneF8(mod)).kept);
      check(p.turned && p.back, "f8d lifting plant:reconcile-removed turns f8a red (relisting deletes the removed desk's kept file), and the product file is never written: "
        + p.detail + ", sha " + (p.back ? "restored" : "differs"));
      let liftedF8 = null;
      const q = await liftReconcileRemove(async mod => {
        liftedF8 = await sceneF8(mod);
        return liftedF8.setup && !liftedF8.activeGone;
      });
      check(q.turned && q.back, "f8e lifting reconcile's removal of an unlisted live file turns f8b red (a stopped desk keeps retracted files after relist), and the product file is never written: "
        + q.detail + (liftedF8 ? " " + liftedF8.detail : "") + ", sha " + (q.back ? "restored" : "differs"));
    }
  } catch (e) {
    check(false, "harness (the leg f8a): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- honest rejoin inside the seven-day hold (review finding 3): a desk that joined by invitation, was admitted (its
   join.json deleted), is removed, and is invited back inside the hold; its new request names that held deletion, is taken,
   reaches the lead's mirror, and the held row stays for the lead. ---- */
async function liftCore(tag, fn) {
  const src = path.join(ROOT, "relay", "core.cjs");
  const beforeBytes = fs.readFileSync(src);
  const digest = sha(beforeBytes);
  const origCreateCore = core.createCore;
  let turned = false, detail = "plant line absent";
  try {
    const lines = beforeBytes.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf(tag) >= 0);
    if (at >= 0) {
      lines.splice(at, 1);
      const dir = fs.mkdtempSync(path.join(LAB, "core-plant-"));
      fs.mkdirSync(path.join(dir, "relay"), { recursive: true });
      fs.mkdirSync(path.join(dir, "shell", "relay"), { recursive: true });
      fs.writeFileSync(path.join(dir, "relay", "core.cjs"), lines.join("\n"), "utf8");
      fs.writeFileSync(path.join(dir, "shell", "relay", "blob.cjs"), "module.exports = require(" + JSON.stringify(path.join(ROOT, "shell", "relay", "blob.cjs")) + ");\n", "utf8");
      const lifted = nodeRequire(path.join(dir, "relay", "core.cjs"));
      core.createCore = lifted.createCore;
      turned = await fn();
      detail = turned ? "the check lifted" : "the check still held";
    }
  } catch (e) {
    detail = e && e.stack ? e.stack : String(e);
  } finally {
    core.createCore = origCreateCore;
  }
  return { turned, back: sha(fs.readFileSync(src)) === digest, detail };
}

async function rejoinScene() {
  const tm = await freshTeam([]);
  const tag = tm.rt.slice(0, 8);
  const k1 = crypto.randomBytes(32), deskKey = keyPair(true);
  const inv1 = hex(16), token1 = hex(32), ki1 = C.inviteSealKey(hex(16));
  const inv2 = hex(16), token2 = hex(32), ki2 = C.inviteSealKey(hex(16));
  const addInvite = (id, token) => {
    const add = [{ id, hash: sha(Buffer.from(token, "utf8")) }], t = R.clock.now;
    return admin("POST", "/relay/v1/t/" + tm.rt + "/invites", { add, drop: [], t, sig: signHex(LEAD, core.invitesBytes(tm.rt, t, add, [])) });
  };
  const setDevices = (keys, rev) => {
    const t = R.clock.now;
    return admin("POST", "/relay/v1/t/" + tm.rt + "/devices", { keys, rev, t, sig: signHex(LEAD, core.devicesBytes(tm.rt, rev, t, keys)) });
  };
  const inv1Res = await addInvite(inv1, token1);
  const live = [{ id: inv1, key: ki1 }];
  let current = { inv: inv1, token: token1, seal: ki1 };
  const puts = [];
  const deskT = transport("rv3-desk-" + tag);
  const deskReq = async (m, u, h, b) => {
    const res = await deskT.request(m, u, h, b);
    if (m === "PUT" && h && h["etiuda-blob"]) {
      puts.push({
        meta: JSON.parse(Buffer.from(h["etiuda-blob"], "base64url").toString("utf8")),
        status: res.status,
        said: Buffer.from(res.bytes).toString("utf8"),
      });
    }
    return res;
  };
  const lead = opened(C, "rv3-lead-" + tag, tm, LEAD, "root", {
    keyFor: e => (e === 1 ? k1 : null), sealEpoch: () => 1, inviteKeys: () => live.slice(),
  });
  const desk = opened(C, "rv3-desk-" + tag, tm, deskKey, "desk:" + deskKey.keyId, {
    keyFor: e => (e === 1 ? k1 : null), sealEpoch: () => 1, invite: () => current,
    request: deskReq, connect: deskT.connect,
  });
  try {
    const rel = "desks/" + deskKey.keyId + "/join.json";
    const firstAsk = "{\"kind\":\"etiuda-join\",\"note\":\"first\"}\n";
    const backAsk = "{\"kind\":\"etiuda-join\",\"note\":\"back\"}\n";
    put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 1, []));
    lead.prog.loadTeamFile(JSON.parse(teamBody(tm, 1, 1, [])));
    lead.ch.start();
    await lead.ch.idle();
    put(desk.mirror, rel, firstAsk);
    desk.ch.start();
    await desk.ch.idle();
    await once(lead);
    const firstAtLead = read(lead.mirror, rel) === firstAsk;

    /* Admitted: the key enrolled, the team file names the desk, and its join.json is deleted. */
    R.clock.now += 1000;
    const yes = await setDevices([{ id: deskKey.keyId, pub: deskKey.pub, desk: deskKey.keyId }], 2);
    put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 2, [member(deskKey)]));
    lead.prog.loadTeamFile(JSON.parse(teamBody(tm, 1, 2, [member(deskKey)])));
    await once(lead);
    current = null;
    await desk.ch.stop();
    desk.ch.start();
    await desk.ch.idle();
    fs.unlinkSync(path.join(desk.mirror, ...rel.split("/")));
    R.clock.now += 1000;
    await once(desk);
    await once(desk);
    const s = relayStore(tm.rt);
    const delBlobs = s.list("blob:").map(([, m]) => m).filter(m => m.writer === deskKey.keyId && m.del === true);
    const delId = delBlobs.length === 1 ? delBlobs[0].id : null;
    await once(lead);
    const leadCleared = read(lead.mirror, rel) === null;

    /* Removed: the lead drops the desk, and the relay holds that deletion for the lead. */
    R.clock.now += 1000;
    put(lead.mirror, C.TEAM_NAME, teamBody(tm, 1, 3, []));
    lead.prog.loadTeamFile(JSON.parse(teamBody(tm, 1, 3, [])));
    await once(lead);
    const off = await setDevices([], 3);
    const heldBefore = s.list("held:").map(([, h]) => h);
    const heldRowBefore = delId ? s.get("held:" + delId) : null;
    const heldForLead = !!delId && heldBefore.length === 1 && !!heldRowBefore && heldRowBefore.del === true
      && heldRowBefore.writer === deskKey.keyId && R.bucket.objects.has(heldRowBefore.obj);
    await desk.ch.stop();

    /* Invited back inside the hold: the new request names the held deletion, is taken, and reaches the lead's mirror. */
    R.clock.now += 60000;
    const inv2Res = await addInvite(inv2, token2);
    live.push({ id: inv2, key: ki2 });
    current = { inv: inv2, token: token2, seal: ki2 };
    const mark = puts.length;
    put(desk.mirror, rel, backAsk);
    desk.ch.start();
    await desk.ch.idle();
    await once(desk);
    await once(lead);
    const reask = puts.slice(mark);
    const namesHeld = reask.length >= 1 && !!delId && reask[0].meta.supersedes === delId && reask[0].meta.del === false;
    const taken = reask.length >= 1 && reask.some(p => p.status === 200);
    const atLead = read(lead.mirror, rel) === backAsk;
    const heldRowAfter = delId ? s.get("held:" + delId) : null;
    const heldKept = !!heldRowAfter && heldRowAfter.id === delId && heldRowAfter.del === true
      && heldRowAfter.writer === deskKey.keyId && R.bucket.objects.has(heldRowAfter.obj);
    const setup = inv1Res.status === 200 && firstAtLead && yes.status === 200 && leadCleared && off.status === 200 && inv2Res.status === 200;
    const detail = JSON.stringify({
      setup: { inv1: inv1Res.status, firstAtLead, yes: yes.status, leadCleared, off: off.status, inv2: inv2Res.status },
      delId,
      heldBefore: heldBefore.length,
      reask: reask.map(p => ({ sup: p.meta.supersedes, del: p.meta.del, status: p.status, said: p.status === 200 ? "" : p.said })),
      atLead,
      heldKept,
    });
    return { setup, heldForLead, namesHeld, taken, atLead, heldKept, detail };
  } finally {
    try { await desk.ch.stop(); } catch { /* already stopped */ }
    try { await lead.ch.stop(); } catch { /* already stopped */ }
  }
}

if (partOn("pRv3")) {
  try {
    markPart("pRv3");
    const r = await rejoinScene();
    check(r.setup && r.heldForLead, "rv3f after a desk that joined by invitation is admitted (its join.json deleted) and removed, the relay holds its deleted request for the lead: " + r.detail);
    check(r.setup && r.namesHeld, "rv3g the re-invited desk's new request inside the hold names that held deletion as what it supersedes: " + r.detail);
    check(r.setup && r.taken, "rv3h the re-invited desk's new request is taken by the relay: " + r.detail);
    check(r.setup && r.atLead, "rv3i the re-invited desk's new join.json reaches the lead's mirror on the lead's next look: " + r.detail);
    check(r.setup && r.heldKept, "rv3j the held deletion row is still there for the lead afterwards: " + r.detail);
    if (PLANTS_OFF) skip("rv3k lifting plant:invite-held turns rv3j red (the re-invited request lets go of the held deletion)");
    else {
      const p = await liftCore("plant:invite-held", async () => {
        const x = await rejoinScene();
        return x.setup && x.heldForLead && x.namesHeld && x.taken && x.atLead && !x.heldKept;
      });
      check(r.heldKept && p.turned && p.back, "rv3k lifting plant:invite-held turns rv3j red (the re-invited request lets go of the held deletion), and the product file is never written: "
        + p.detail.split("\n")[0] + ", sha " + (p.back ? "restored" : "differs"));
    }
  } catch (e) {
    check(false, "harness (the leg rv3f): " + (e && e.stack ? e.stack : e));
  }
}

/* ---- the harness through the product, relay step 3's relay and this channel layer, on the routine chain ---- */
  if (partOn("p943")) {
  markPart("p943");


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
  const g943c = signinGuard.report("943c", deskOn());
  check(g943c.ok, g943c.line);
}
markPart(null);
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (!ONLY.size && asserted + skipped !== EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  releaseOnlyHold();
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
releaseOnlyHold();
process.exit(Math.min(failed, 63));
