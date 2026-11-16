/* A PERSON'S STORE, SIMULATED: a seeded random walk over what people and computers do, searching for any order of events that loses a
 * person's work, mixes two accounts, sends what it should not, leaves computers that never agree, or leaves a computer believing it syncs
 * when it does not. Layer 1, the merge: shell/sync/sync.cjs as it runs on three computers of one person and a second account, over a
 * relay stand-in in memory, with stand-ins for the parts of shell/main.js that feed it (storeSyncLocal, storeSyncApply, patchDesk, the
 * account answers) and the page's eDeskTake (src/modules/storage.js). After each quiet point six invariants are read; a failing walk is
 * shrunk and printed with its seed.
 *     node tests/desk-sync-sim.mjs                  the fixed seeds, then 300 seeds from 1
 *     node tests/desk-sync-sim.mjs --seeds 2000      more seeds; --from <n> starts elsewhere
 *     node tests/desk-sync-sim.mjs --seed 17         one walk, every step printed; --steps 0,3,9 replays a shrunk one
 * Node builtins only, no window; nothing is written outside one scratch folder it makes and removes. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "desk-sync-sim-"));
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const ARGS = (() => {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) o[a[i].slice(2)] = a[i + 1] !== undefined && !a[i + 1].startsWith("--") ? a[++i] : "1";
  return o;
})();

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) { skipped++; console.log("  NOT RUN  " + line); }

const SYNC_PATH = path.join(ROOT, "shell", "sync", "sync.cjs");
const REF = require(SYNC_PATH);
const ST = require(path.join(ROOT, "shell", "sync", "store.cjs"));
/* The module the walk runs; REF stays the product's own, so a plant never judges itself. */
let SY = REF;

const T0 = Date.UTC(2026, 10, 16, 9);
const SPKI = Buffer.from("302a300506032b6570032100", "hex"), PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const clone = o => (o === null || o === undefined ? o : JSON.parse(JSON.stringify(o)));
const SAMPLE_NAME = "sample-catalog.ec";
const SAMPLE = JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "sample", sample: true, cards: [] });
const SETTING_KEYS = ["eTheme", "eUiLang", "eMotionOff"];
const LAYER = "e3f9a1~Pack";
const FILES = ["Harbour.ec", "Quay.ec"];
const MEMBERS = ["c1", "c2", "c3"];
const ACCOUNTS = ["A1", "A2"];
/* What a desk holds that never follows: each value must never reach a sync file, a placed file or the relay. */
const SECRETS = { team: "5ec7e7" + "a".repeat(58), folder: "C:/Users/someone/Documents/Etiuda", mirror: "mirrored-5ec7e7b0b0" };
const STATIC_KEYS = { eTeamKeys: JSON.stringify({ t1: SECRETS.team }), eCatalogFolder: SECRETS.folder, e3f9a1Stats: "{}", "e3f9a1~SharedFile": SECRETS.mirror };
const TOKEN_RE = /tok\d+z/g;

/* ---- the seeded generator: mulberry32, so a seed names one walk on every machine ---- */
function rngOf(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: n => Math.floor(next() * n), pick: arr => arr[Math.floor(next() * arr.length)], chance: p => next() < p };
}
const KINDS = [["set", 3], ["field", 4], ["fieldOwed", 3], ["land", 2], ["file", 3], ["unfile", 1], ["unsample", 1], ["sample", 1], ["cycle", 8],
  ["partial", 2], ["offline", 2], ["look", 2], ["failApply", 1], ["failKeep", 1], ["team", 1], ["big", 1], ["signOut", 1], ["signInOther", 1],
  ["signInBack", 1], ["answer", 2], ["quiet", 2], ["later", 1]];
const KIND_SUM = KINDS.reduce((s, k) => s + k[1], 0);
const FIELD_OPS = ["ov", "ovDel", "fav", "favDel", "note"];
function randomStep(r) {
  let x = r.next() * KIND_SUM, k = KINDS[0][0];
  for (const [name, wgt] of KINDS) { if (x < wgt) { k = name; break; } x -= wgt; }
  const account = ["signOut", "signInOther", "signInBack", "answer"].indexOf(k) >= 0;
  const st = { k, c: account && r.chance(0.6) ? 2 : r.int(3) };
  if (k === "set") st.key = r.pick(SETTING_KEYS);
  if (k === "field" || k === "fieldOwed") { st.op = r.pick(FIELD_OPS); st.m = r.pick(MEMBERS); }
  if (k === "file" || k === "unfile" || k === "big") st.name = r.pick(FILES);
  if (k === "answer") st.choice = r.pick(["mine", "start", "later"]);
  return st;
}
/* A walk: each computer signs in to the first account once, the first within its first four steps, the others anywhere in the walk's
   first two thirds, so a computer joins early, late, or before the first has uploaded anything. */
function stepsOf(seed, max) {
  const r = rngOf(seed), len = 9 + r.int(Math.max(1, max - 11));
  const joinAt = [r.int(4), r.int(Math.ceil(len * 0.67)), r.int(Math.ceil(len * 0.67))];
  const out = [];
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < 3; c++) if (joinAt[c] === i) out.push({ k: "join", c, cut: r.chance(0.3) });
    out.push(randomStep(r));
  }
  return out.map((s, i) => Object.assign(s, { at: i }));
}
function describe(st) {
  const extra = st.key || (st.op ? st.op + " " + st.m : "") || st.name || st.choice || (st.cut ? "cut" : "");
  return "#" + st.at + " " + st.k + " c" + st.c + (extra ? " " + extra : "");
}

/* ---- the world: three computers of one person, the relay in memory, the two accounts' stores ---- */
function keyFrom(bytes) {
  const privateKey = crypto.createPrivateKey({ key: Buffer.concat([PKCS8, bytes]), format: "der", type: "pkcs8" });
  const pub = crypto.createPublicKey(privateKey).export({ type: "spki", format: "der" }).subarray(SPKI.length).toString("hex");
  const id = "k-" + sha(Buffer.from(pub, "hex")).slice(0, 16);
  return { id, pub, privateKey, desk: id };
}
/* Stand-ins of the main.js guards the walk replicates, each named after its plant there; a plant here lifts one. */
const MODEL = { answerMineFresh: true };
function worldOf(seed) {
  const w = { seed, now: T0, ver: 0, tok: 0, stores: {}, relays: {}, comps: [], writes: [], allowed: { A1: new Set(), A2: new Set() }, stepNo: -1 };
  for (let i = 0; i < 3; i++) w.comps.push(computerOf(w, i));
  return w;
}
function computerOf(w, i) {
  const me = keyFrom(Buffer.from(sha("computer " + w.seed + " " + i), "hex"));
  const keys = Object.assign({ eTheme: "d" + i + "theme", eUiLang: "d" + i + "lang" }, STATIC_KEYS);
  return {
    i, me, desk: { keys, files: { [SAMPLE_NAME]: SAMPLE, "relay-mirror.json": JSON.stringify({ team: SECRETS.team }) }, big: new Set(), team: false },
    page: { map: Object.assign({}, keys), owed: new Set() }, kept: [], aside: [], online: true, seat: "", ever: false, s: { who: "", last: "", ask: "" },
    syncFile: null, sync: null, mirrors: new Map(), sent: new Map(), seen: new Map(), heldNow: [], pristineNow: [], failApply: false, keepFail: false,
    knows: new Map(), unattributed: [], mirrorRoot: path.join(WORK, "c" + i),
  };
}
function storeOf(w, X) {
  if (!w.stores[X]) {
    const h = sha("store " + w.seed + " " + X);
    w.stores[X] = { k: sha(h + "k"), s: sha(h + "s"), rt: h.slice(0, 32), url: "https://relay.test/relay/v1", devices: [], rev: 0, maker: "", ever: new Set() };
    w.relays[w.stores[X].rt] = new Map();
  }
  return w.stores[X];
}
const keysOf = st => ({ k: st.k, s: st.s, rt: st.rt, url: st.url, devices: st.devices.map(d => Object.assign({}, d)), rev: st.rev });
const token = w => "tok" + (++w.tok) + "z";

/* ---- the mirror and the relay channel, standing in: a cycle sends this computer's own place (whole files that changed, and a deletion
   of each it sent that is gone), takes every other listed computer's files that moved since, and runs onHere, as the channel does after
   a cycle that reached the relay. A partial cycle takes only the sync files, as a catalog's bytes arriving after its entry. ---- */
function mirrorMap(c, m) {
  let map = c.mirrors.get(m);
  if (!map) { map = new Map(); c.mirrors.set(m, map); }
  return map;
}
function memIO(c, m) {
  const map = mirrorMap(c, m);
  return { list: () => [...map.keys()], read: rel => (map.has(rel) ? Buffer.from(map.get(rel), "utf8") : null), write: (rel, text) => { map.set(rel, String(text)); }, remove: rel => { map.delete(rel); } };
}
function channelOf(w, c, opts) {
  const ch = { rt: opts.rt, mirror: opts.mirror, onHere: opts.onHere, roster: new Set(), running: false,
    program: { loadTeamFile: doc => { ch.roster = new Set(((doc && doc.roster) || []).map(r => r.desk.id)); } },
    kick() {}, start() { ch.running = true; }, stop: async () => { ch.running = false; }, idle: async () => {} };
  return ch;
}
function cycle(w, c, partial) {
  const ch = c.sync && c.sync.channel();
  if (!ch || !ch.running || !c.online) return false;
  const relay = w.relays[ch.rt] || (w.relays[ch.rt] = new Map());
  const map = mirrorMap(c, ch.mirror), mine = "desks/" + c.me.id + "/";
  let sent = c.sent.get(ch.mirror);
  if (!sent) { sent = new Map(); c.sent.set(ch.mirror, sent); }
  let seen = c.seen.get(ch.mirror);
  if (!seen) { seen = new Map(); c.seen.set(ch.mirror, seen); }
  for (const [rel, text] of map) {
    if (!rel.startsWith(mine) || sent.get(rel) === text) continue;
    relay.set(rel, { text, del: false, ver: ++w.ver });
    sent.set(rel, text);
  }
  for (const rel of [...sent.keys()]) if (!map.has(rel)) { relay.set(rel, { text: null, del: true, ver: ++w.ver }); sent.delete(rel); }
  for (const [rel, f] of relay) {
    const m = /^desks\/(k-[0-9a-f]{16})\//.exec(rel);
    if (!m || rel.startsWith(mine) || !ch.roster.has(m[1]) || (partial && !rel.endsWith("/sync.json")) || (seen.get(rel) || 0) >= f.ver) continue;
    if (f.del) map.delete(rel); else map.set(rel, f.text);
    seen.set(rel, f.ver);
  }
  ch.onHere();
  return true;
}

/* ---- the shell's side, as shell/main.js runs it: storeSyncLocal, storeSyncApply, storeSyncFile, patchDesk, deskSyncedTell ---- */
function syncLocal(c) {
  const held = [], pristine = [];
  c.heldNow = held; c.pristineNow = pristine;
  if (c.desk.team) { held.push("f:"); return SY.localItems(c.desk.keys, {}, held); }
  const files = {};
  for (const n of Object.keys(c.desk.files)) {
    if (!SY.CATALOG_RE.test(n)) continue;
    if (c.desk.big.has(n)) { held.push("f:" + n); continue; }
    files[n] = c.desk.files[n];
    if (files[n] === SAMPLE) pristine.push("f:" + n);
  }
  return SY.localItems(c.desk.keys, files, held);
}
/* A desk's items as the person sees them, every catalog in the person's own folder included (held, too big, or behind a team's folder). */
function itemsOf(keys, files) {
  const out = {};
  for (const k of Object.keys(keys || {})) {
    const v = keys[k];
    if (typeof v !== "string") continue;
    if (REF.SETTINGS.indexOf(k) >= 0) out["k:" + k] = v;
    else if (REF.LAYER_RE.test(k)) { const f = REF.fieldsOf(v); if (f) for (const p of Object.keys(f)) out["k:" + k + "#" + p] = f[p]; else out["k:" + k] = v; }
  }
  for (const n of Object.keys(files || {})) if (REF.CATALOG_RE.test(n)) out["f:" + n] = files[n];
  return out;
}
function syncApply(w, c, patch, copies) {
  const keys = {}, failed = [], blocked = new Set();
  const keepFails = c.keepFail && copies.length > 0, writeFails = c.failApply && Object.keys(patch).length > 0;
  if (keepFails) c.keepFail = false;
  if (writeFails) c.failApply = false;
  const before = itemsOf(c.desk.keys, c.desk.files);
  for (const cp of copies) {
    if (keepFails) { const at = cp.item.indexOf("#"); blocked.add(cp.item.startsWith("k:") && at > 0 ? cp.item.slice(0, at) : cp.item); }
    else c.kept.push({ item: cp.item, value: cp.value, by: cp.by, t: cp.t });
  }
  failed.push(...blocked);
  for (const item of Object.keys(patch)) {
    if (blocked.has(item)) continue;
    if (item.startsWith("k:")) keys[item.slice(2)] = patch[item];
    else if (!syncFile(c, item.slice(2), patch[item], writeFails)) failed.push(item);
  }
  if (Object.keys(keys).length) {
    if (writeFails) failed.push(...Object.keys(keys).map(k => "k:" + k));
    else { patchDesk(c, keys); deskSyncedTell(c, keys); }
  }
  learn(w, c, before);
  return failed;
}
function syncFile(c, name, text, fails) {
  if (c.desk.team || fails || !REF.CATALOG_RE.test(name)) return false;
  if (text === null) {
    if (has(c.desk.files, name)) { c.aside.push({ item: "f:" + name, value: c.desk.files[name] }); delete c.desk.files[name]; c.desk.big.delete(name); }
    return true;
  }
  c.desk.files[name] = text;
  c.desk.big.delete(name);
  return true;
}
function patchDesk(c, keys) { for (const k of Object.keys(keys)) { if (keys[k] === null) delete c.desk.keys[k]; else c.desk.keys[k] = keys[k]; } }
/* The page's eDeskTake: a key the page still owes keeps the page's value, which its own send carries. */
function deskSyncedTell(c, keys) {
  for (const k of Object.keys(keys)) {
    if (c.page.owed.has(k)) continue;
    if (keys[k] === null) delete c.page.map[k]; else c.page.map[k] = keys[k];
  }
}
/* The page's owed sends, landing: each key whole, as patchDesk takes it, then the merge a moment later (storeSyncSoon). */
function land(w, c) {
  if (!c.page.owed.size) return;
  const keys = {};
  for (const k of c.page.owed) keys[k] = has(c.page.map, k) ? c.page.map[k] : null;
  c.page.owed.clear();
  patchDesk(c, keys);
  mergeSoon(w, c);
}
function createSync(w, c) {
  c.sync = SY.createStoreSync({
    me: { id: c.me.id, pub: c.me.pub, privateKey: c.me.privateKey }, mirrorRoot: c.mirrorRoot,
    channel: opts => channelOf(w, c, opts), io: m => memIO(c, m),
    load: () => clone(c.syncFile), save: s => { c.syncFile = clone(s); },
    local: () => syncLocal(c), held: () => c.heldNow, pristine: () => c.pristineNow,
    apply: (patch, copies) => syncApply(w, c, patch, copies),
    pubOf: ST.pubOf, canonBytes: d => Buffer.from(JSON.stringify(d)), now: () => w.now,
  });
}
/* storeSyncSoon: a change on the desk merged a moment later, unless another account's answer is owed. */
function mergeSoon(w, c) {
  if (!c.sync || held(c)) return;
  w.now += 10;
  c.sync.merge();
}

/* ---- the accounts, as storeHeld, storeMine, storeForget and storeAnswerNow run them ---- */
function held(c) {
  const who = c.seat;
  if (!who) return false;
  const last = c.s.last || c.s.who;
  return !!last && (last !== who || c.s.ask === who);
}
/* What a desk holds when an account takes it as its own may enter that account's store. */
function adopt(w, c, X) {
  const all = [itemsOf(c.desk.keys, c.desk.files), itemsOf(c.page.map, {})];
  for (const items of all) for (const v of Object.values(items)) for (const t of String(v).match(TOKEN_RE) || []) w.allowed[X].add(t);
  for (const wr of c.unattributed) { wr.acct = X; for (const t of String(wr.value).match(TOKEN_RE) || []) w.allowed[X].add(t); }
  c.unattributed = [];
}
function look(w, c) {
  if (!c.seat || held(c) || !c.online) return;
  const st = storeOf(w, c.seat);
  if (!st.devices.some(d => d.id === c.me.id)) {
    if (!st.maker) st.maker = c.me.id;
    st.devices.push({ id: c.me.id, pub: c.me.pub, desk: c.me.desk });
    st.rev++;
    st.ever.add(c.me.id);
  }
  if (!c.sync) createSync(w, c);
  c.sync.turn({ state: "on", keys: keysOf(st), store: { cert: true } });
}
function signIn(w, c, X) {
  if (c.seat === X) return;
  c.seat = X;
  c.ever = true;
  if (held(c)) { c.s.ask = X; c.s.last = X; if (c.sync) c.sync.stop(); return; }
  if (c.s.last !== X) c.s.last = X;
  if (c.s.who !== X) { c.s.who = X; adopt(w, c, X); }
  look(w, c);
}
function signOut(w, c) {
  if (!c.seat) return;
  c.seat = "";
  if (c.sync) c.sync.stop();
}
function answer(w, c, choice) {
  if (!c.seat || !held(c)) return;
  const X = c.seat;
  if (choice === "later") return;
  if (choice === "mine" && c.s.who !== X) {
    c.knows = new Map();
    if (MODEL.answerMineFresh) { c.syncFile = { rt: "", ledger: {}, kept: [] }; if (c.sync) c.sync.stop(); c.sync = null; } /* model-plant:answer-mine-fresh */
  }
  if (choice === "start") {
    for (const [item, value] of Object.entries(itemsOf(c.desk.keys, c.desk.files))) c.aside.push({ item, value });
    if (!c.desk.team) for (const n of Object.keys(c.desk.files)) if (REF.CATALOG_RE.test(n)) { delete c.desk.files[n]; c.desk.big.delete(n); }
    const clear = {};
    for (const k of Object.keys(c.desk.keys)) if (REF.follows("k:" + k)) clear[k] = null;
    patchDesk(c, clear);
    deskSyncedTell(c, clear);
    c.syncFile = null; c.mirrors.clear(); c.sent.clear(); c.seen.clear(); c.knows = new Map();
    if (c.sync) c.sync.stop();
    c.sync = null;
  }
  c.s.who = X; c.s.last = X; c.s.ask = "";
  if (choice === "mine") adopt(w, c, X);
  look(w, c);
}

/* ---- what the person does, and what each write supersedes: a write is made over every write of that item this computer has held ---- */
function know(w, c, item, value) {
  let set = c.knows.get(item);
  if (!set) { set = new Set(); c.knows.set(item, set); }
  for (const wr of w.writes) if (wr.item === item && wr.value === value) { set.add(wr.id); for (const o of wr.over) set.add(o); }
}
function learn(w, c, before) {
  const after = itemsOf(c.desk.keys, c.desk.files);
  for (const item of new Set(Object.keys(before).concat(Object.keys(after)))) {
    const v = has(after, item) ? after[item] : null, was = has(before, item) ? before[item] : null;
    if (v !== was) know(w, c, item, v);
  }
}
function write(w, c, item, value) {
  const set = c.knows.get(item) || new Set();
  const acct = c.s.last || c.seat || "";
  const wr = { id: w.writes.length, item, value, comp: c.i, acct, over: new Set(set), step: w.stepNo, pre: !acct };
  w.writes.push(wr);
  set.add(wr.id);
  c.knows.set(item, set);
  if (acct) for (const t of String(value).match(TOKEN_RE) || []) w.allowed[acct].add(t);
  else c.unattributed.push(wr);
}
function setPage(w, c, key, v, owed) {
  if (v === null) delete c.page.map[key]; else c.page.map[key] = v;
  if (owed || c.page.owed.has(key)) c.page.owed.add(key);
  else { if (v === null) delete c.desk.keys[key]; else c.desk.keys[key] = v; mergeSoon(w, c); }
}
function editField(w, c, op, m, owed) {
  let p = {};
  try { p = JSON.parse(c.page.map[LAYER] || "{}") || {}; } catch { p = {}; }
  let item = null, value = null;
  if (op === "ov" || op === "note") {
    const f = op === "ov" ? "overrides" : "notes", t = token(w);
    p[f] = Object.assign({}, p[f], { [m]: t });
    item = "k:" + LAYER + "#" + f + "/" + m; value = JSON.stringify(t);
  } else if (op === "ovDel") {
    if (!p.overrides || !has(p.overrides, m)) return;
    delete p.overrides[m];
    if (!Object.keys(p.overrides).length) delete p.overrides;
    item = "k:" + LAYER + "#overrides/" + m;
  } else if (op === "fav") {
    const list = Array.isArray(p.favourites) ? p.favourites : [];
    if (list.indexOf(m) >= 0) return;
    p.favourites = list.concat([m]);
    item = "k:" + LAYER + "#favourites[]" + m; value = JSON.stringify(m);
  } else {
    const list = Array.isArray(p.favourites) ? p.favourites : [];
    if (list.indexOf(m) < 0) return;
    p.favourites = list.filter(x => x !== m);
    if (!p.favourites.length) delete p.favourites;
    item = "k:" + LAYER + "#favourites[]" + m;
  }
  write(w, c, item, value);
  setPage(w, c, LAYER, Object.keys(p).length ? JSON.stringify(p) : null, owed);
}
function editFile(w, c, name, text) {
  if (c.desk.team) return;
  c.desk.files[name] = text;
  c.desk.big.delete(name);
  write(w, c, "f:" + name, text);
  mergeSoon(w, c);
}
function removeFile(w, c, name) {
  if (c.desk.team || !has(c.desk.files, name)) return;
  delete c.desk.files[name];
  c.desk.big.delete(name);
  write(w, c, "f:" + name, null);
  mergeSoon(w, c);
}
const catalogText = (name, t) => JSON.stringify({ kind: "etiuda-catalog", format: 2, id: name.replace(/\.ec$/i, "").toLowerCase(), note: t, cards: [] });

function exec(w, st) {
  const c = w.comps[st.c];
  switch (st.k) {
    /* Online, the channel starts with a catch-up and the watcher sends the place its merge wrote a moment later: two cycles at once.
       A cut join is a computer that loses the network the moment it has signed in. */
    case "join": if (!c.ever) { signIn(w, c, "A1"); if (!st.cut) { cycle(w, c, false); cycle(w, c, false); } } break;
    case "set": { const v = token(w); write(w, c, "k:" + st.key, v); setPage(w, c, st.key, v, false); break; }
    case "field": editField(w, c, st.op, st.m, false); break;
    case "fieldOwed": editField(w, c, st.op, st.m, true); break;
    case "land": land(w, c); break;
    case "file": editFile(w, c, st.name, catalogText(st.name, token(w))); break;
    case "unfile": removeFile(w, c, st.name); break;
    case "unsample": removeFile(w, c, SAMPLE_NAME); break;
    case "sample": if (has(c.desk.files, SAMPLE_NAME)) editFile(w, c, SAMPLE_NAME, SAMPLE.replace("\"cards\":[]", "\"cards\":[],\"note\":\"" + token(w) + "\"")); break;
    case "cycle": cycle(w, c, false); break;
    case "partial": cycle(w, c, true); break;
    case "offline": c.online = !c.online; break;
    case "look": look(w, c); break;
    case "failApply": c.failApply = true; break;
    case "failKeep": c.keepFail = true; break;
    case "team": c.desk.team = !c.desk.team; mergeSoon(w, c); break;
    case "big": {
      if (c.desk.team || !has(c.desk.files, st.name)) break;
      const text = catalogText(st.name, token(w));
      c.desk.files[st.name] = text;
      if (c.desk.big.has(st.name)) c.desk.big.delete(st.name); else c.desk.big.add(st.name);
      write(w, c, "f:" + st.name, text);
      mergeSoon(w, c);
      break;
    }
    case "signOut": signOut(w, c); break;
    case "signInOther": if (c.ever && c.seat !== "A2") { signOut(w, c); signIn(w, c, "A2"); } break;
    case "signInBack": if (c.ever && c.seat !== "A1") { signOut(w, c); signIn(w, c, "A1"); } break;
    case "answer": answer(w, c, st.choice); break;
    case "later": w.now += 3600e3; break;
    case "quiet": break;
    default: throw new Error("no such step " + st.k);
  }
}

/* ---- a quiet point: faults cleared, every page's send landed, every computer signed in looks (as its daily renewal would), then
   cycles and merges until the relay moves no more ---- */
function quiet(w, final) {
  for (const c of w.comps) { c.failApply = false; c.keepFail = false; if (final) c.online = true; }
  for (const c of w.comps) land(w, c);
  for (let pass = 0; pass < 2; pass++) for (const c of w.comps) look(w, c);
  let still = 0;
  for (let round = 0; round < 12 && still < 2; round++) {
    const ver = w.ver;
    for (const c of w.comps) {
      if (!c.online || !c.sync || !c.sync.running()) continue;
      w.now += 1000;
      if (!held(c)) c.sync.merge();
      cycle(w, c, false);
    }
    still = w.ver === ver ? still + 1 : 0;
  }
  return invariants(w);
}

/* ---- the invariants ---- */
const heldBy = (list, item) => list.some(h => item === h || (h.endsWith(":") ? item.startsWith(h) : item.startsWith(h + "#")));
function syncedTo(w, X) {
  const st = w.stores[X];
  return st ? w.comps.filter(c => c.syncFile && c.syncFile.rt === st.rt) : [];
}
function relayTexts(w, st) {
  const out = [];
  for (const [rel, f] of w.relays[st.rt] || []) if (!f.del) out.push([rel, f.text, "relay"]);
  for (const c of w.comps) for (const [rel, text] of mirrorMap(c, path.join(c.mirrorRoot, st.rt))) out.push([rel, text, "c" + c.i + "'s mirror"]);
  return out;
}
function invariants(w) {
  const fails = [];
  const say = (inv, detail) => fails.push({ inv, detail });
  for (const X of ACCOUNTS) {
    const st = w.stores[X];
    if (!st) continue;
    /* (a) agreement: every computer that syncs to X holds the same value of every item that follows, held items and an untouched
       sample one side lacks aside. */
    const group = w.comps.filter(c => c.seat === X && !held(c) && c.online && c.sync && c.sync.running() && c.syncFile && c.syncFile.rt === st.rt);
    const view = c => {
      const h = [], files = {};
      if (c.desk.team) h.push("f:");
      else for (const n of Object.keys(c.desk.files)) { if (c.desk.big.has(n)) h.push("f:" + n); else files[n] = c.desk.files[n]; }
      return { items: REF.localItems(c.desk.keys, files, h), held: h };
    };
    for (let i = 1; i < group.length; i++) {
      const a = view(group[0]), b = view(group[i]);
      for (const item of new Set(Object.keys(a.items).concat(Object.keys(b.items)))) {
        if (heldBy(a.held, item) || heldBy(b.held, item)) continue;
        const va = has(a.items, item) ? a.items[item] : null, vb = has(b.items, item) ? b.items[item] : null;
        if (va === vb || (va === null && vb === SAMPLE) || (vb === null && va === SAMPLE)) continue;
        say("a", X + ": c" + group[0].i + " and c" + group[i].i + " never agree on " + item + ": " + JSON.stringify(va) + " against " + JSON.stringify(vb));
      }
    }
    /* (c) accounts apart: X's relay and mirrors hold no value written only under the other account, and no computer X never enrolled. */
    for (const [rel, text, where] of relayTexts(w, st)) {
      for (const t of String(text).match(TOKEN_RE) || []) if (!w.allowed[X].has(t)) say("c", X + ": " + where + " " + rel + " holds " + t + ", a value of the other account");
      if (!rel.endsWith("/sync.json")) continue;
      let j = null;
      try { j = JSON.parse(text); } catch { j = null; }
      if (!j || !j.items) continue;
      const ids = [j.by];
      for (const e of Object.values(j.items)) { ids.push(e.by); ids.push(...Object.keys(e.seen || {})); }
      for (const id of ids) if (!st.ever.has(id)) say("c", X + ": " + where + " " + rel + " names " + id + ", a computer of the other account");
    }
    for (const c of syncedTo(w, X)) {
      for (const e of Object.values(c.syncFile.ledger)) for (const id of [e.by, ...Object.keys(e.seen || {})]) if (!st.ever.has(id)) say("c", X + ": c" + c.i + "'s ledger names " + id + ", a computer of the other account");
    }
    /* (d) the allowlist: every file at the relay or in a computer's own place is a sync file or a catalog its sync file names, every item
       follows, and no value that never follows is in any of them. */
    const places = [];
    for (const [rel, f] of w.relays[st.rt] || []) if (!f.del) places.push([rel, f.text, "relay"]);
    for (const c of w.comps) for (const [rel, text] of mirrorMap(c, path.join(c.mirrorRoot, st.rt))) if (rel.startsWith("desks/" + c.me.id + "/")) places.push([rel, text, "c" + c.i + "'s place"]);
    const listedIn = (where, id) => { const s = places.find(p => p[2] === where && p[0] === "desks/" + id + "/sync.json"); try { return s ? JSON.parse(s[1]).items || {} : {}; } catch { return {}; } };
    for (const [rel, text, where] of places) {
      const m = /^desks\/(k-[0-9a-f]{16})\/(?:(sync\.json)|c\/[0-9a-f]{32}\.ec)$/.exec(rel);
      if (!m) { say("d", X + ": " + where + " holds " + rel + ", which is no sync file and no catalog"); continue; }
      for (const s of Object.values(SECRETS)) if (String(text).indexOf(s) >= 0) say("d", X + ": " + where + " " + rel + " carries a value that never follows");
      if (m[2]) { for (const item of Object.keys(listedIn(where, m[1]))) if (!REF.follows(item)) say("d", X + ": " + where + " " + rel + " names " + item + ", which does not follow"); }
      else if (!Object.keys(listedIn(where, m[1])).some(item => item.startsWith("f:") && REF.fileRel(m[1], item) === rel)) say("d", X + ": " + where + " holds " + rel + ", which its sync file names nowhere");
    }
    /* (e) bytes reachable: each catalog a listed computer's sync file names at the relay has its bytes at some listed computer's place
       while any computer still holds that file. */
    const relay = w.relays[st.rt] || new Map(), listed = st.devices.map(d => d.id);
    for (const id of listed) {
      const f = relay.get("desks/" + id + "/sync.json");
      if (!f || f.del) continue;
      let items = {};
      try { items = JSON.parse(f.text).items || {}; } catch { items = {}; }
      for (const [item, e] of Object.entries(items)) {
        if (!item.startsWith("f:") || !e.h) continue;
        const name = item.slice(2);
        if (!w.comps.some(c => has(c.desk.files, name) && sha(c.desk.files[name]) === e.h)) continue;
        if (listed.some(L => { const b = relay.get(REF.fileRel(L, item)); return b && !b.del && sha(b.text) === e.h; })) continue;
        say("e", X + ": " + item + " is listed by " + id + " at " + e.h.slice(0, 8) + ", a computer still holds it, and no listed place at the relay has its bytes");
      }
    }
    /* (f) the untouched sample: no computer that joined a store another made records it as its own write. */
    for (const c of syncedTo(w, X)) {
      const e = c.syncFile.ledger["f:" + SAMPLE_NAME];
      if (c.me.id !== st.maker && e && e.by === c.me.id && e.h === sha(SAMPLE)) say("f", X + ": c" + c.i + " joined the store c" + w.comps.findIndex(x => x.me.id === st.maker) + " made and recorded the untouched sample as its own write");
    }
  }
  /* (b) nothing lost: each write no later write was made over is the value that stands on a computer synced to its account or on its own
     computer, or a version kept or set aside on any; a removal stands where such a computer lacks the item. A setting is settled by the
     later write, so of a setting's writes made over none of each other one at least must stand. A setting or a removal written on a
     computer before it ever signed in is what it held before joining, which gives way to the store's by design (tests/desk-sync.mjs J1),
     so only its values are judged; one written after sign-in is the person's work in that account however late its first merge. */
  const over = new Set();
  for (const wr of w.writes) for (const o of wr.over) over.add(o);
  const groups = new Map();
  for (const wr of w.writes) {
    if (over.has(wr.id) || !wr.acct || (wr.pre && (wr.value === null || REF.isSetting(wr.item)))) continue;
    const g = wr.acct + " " + wr.item;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(wr);
  }
  const shown = new Map();
  const itemsNow = c => { if (!shown.has(c.i)) shown.set(c.i, [itemsOf(c.desk.keys, c.desk.files), itemsOf(c.page.map, {})]); return shown.get(c.i); };
  const stands = wr => {
    const holders = new Set(syncedTo(w, wr.acct).concat([w.comps[wr.comp]]));
    for (const c of holders) {
      const [desk, page] = itemsNow(c);
      if (wr.value === null ? !has(desk, wr.item) : desk[wr.item] === wr.value || page[wr.item] === wr.value) return true;
    }
    return w.comps.some(c => c.kept.concat(c.aside).some(k => k.item === wr.item && k.value === wr.value));
  };
  for (const list of groups.values()) {
    if (REF.isSetting(list[0].item)) { if (!list.some(stands)) say("b", list[0].acct + ": " + list[0].item + " lost every write made over none of the others, " + list.map(x => JSON.stringify(x.value) + " on c" + x.comp + " at #" + x.step).join(", ")); continue; }
    for (const wr of list) if (!stands(wr)) say("b", wr.acct + ": " + wr.item + " = " + JSON.stringify(wr.value) + ", written on c" + wr.comp + " at #" + wr.step + ", stands nowhere and is kept nowhere");
  }
  return fails;
}

/* ---- one walk, its shrinking, and the runs ---- */
function dump(w) {
  if (!ARGS.dump) return;
  const nl = "\n      ";
  for (const c of w.comps) console.log("    c" + c.i + " " + c.me.id + " seat " + c.seat + " online " + c.online + " running " + !!(c.sync && c.sync.running())
    + nl + "desk " + JSON.stringify(c.desk.keys) + " " + Object.keys(c.desk.files) + nl + "state " + JSON.stringify(c.syncFile)
    + nl + "mirror " + JSON.stringify([...mirrorMap(c, path.join(c.mirrorRoot, (c.syncFile || {}).rt || "-"))].filter(([r]) => r.endsWith("sync.json"))));
}
function runWalk(seed, steps, log) {
  const w = worldOf(seed);
  const at = (i, st, f) => ({ inv: f.inv, detail: f.detail, step: i, seed });
  try {
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      w.stepNo = st.at;
      w.now += 1000;
      exec(w, st);
      if (log) log("    " + describe(st));
      if (st.k === "quiet") { const f = quiet(w, false); if (f.length) { if (log) dump(w); return at(i, st, f[0]); } }
    }
    const f = quiet(w, true);
    if (f.length && log) dump(w);
    return f.length ? at(steps.length, null, f[0]) : null;
  } catch (e) {
    if (log && ARGS.dump) for (const c of w.comps) console.log("    c" + c.i + " " + c.me.id + " state " + JSON.stringify(c.syncFile) + "\n      mirror " + JSON.stringify([...mirrorMap(c, path.join(c.mirrorRoot, (c.syncFile || {}).rt || "-"))].filter(([r]) => r.endsWith("sync.json"))));
    return { inv: "x", detail: "threw " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e), step: -1, seed };
  }
}
function shrink(seed, steps, inv, budget) {
  let cur = steps.slice(), n = 2;
  while (cur.length > 1 && budget > 0) {
    const chunk = Math.ceil(cur.length / n);
    let cut = false;
    for (let s = 0; s < cur.length && budget > 0; s += chunk) {
      const cand = cur.slice(0, s).concat(cur.slice(s + chunk));
      budget--;
      const r = runWalk(seed, cand);
      if (r && r.inv === inv) { cur = cand; n = Math.max(2, n - 1); cut = true; break; }
    }
    if (!cut) { if (n >= cur.length) break; n = Math.min(cur.length, n * 2); }
  }
  return cur;
}
const MAX_STEPS = 40;
const INVARIANTS = { a: "agreement", b: "nothing lost", c: "accounts apart", d: "the allowlist", e: "bytes reachable", f: "the untouched sample", x: "the walk ran" };
const replay = (seed, steps) => "node tests/desk-sync-sim.mjs --seed " + seed + " --steps " + steps.map(s => s.at).join(",");

/* THE FIXED SEEDS: each reproduced a finding on the sync line at c77fc33c, red there, the invariant it broke first named; they run every
   time, beside the random ones. "Third pass" is the third Argon review of the line; "further" is a fault this walk found. */
const FIXED = [
  { seed: 1109, inv: "e", what: "third pass 1: a catalog folder held for a team removes this computer's catalog bytes from its place, its sync file still listing them" },
  { seed: 2614, inv: "b", what: "third pass 2: the page's whole write of a layer key it owed lands over a field the merge had just taken, and that field's removal travels" },
  { seed: 835, inv: "c", what: "third pass 2, its account half: a layer key the page owed lands after Start from my account, under the next account" },
  { seed: 1013, inv: "f", what: "third pass 3: a computer joining before the first computer's sync file arrives records the untouched sample as its own write" },
  { seed: 1750, inv: "b", what: "third pass 3: the same race, the joiner's defaults stamped now outranking the first computer's setting" },
  { seed: 435, inv: "x", what: "further: the same card starred on two computers leaves each entry made over the other, and every merge after throws" },
  { seed: 153, inv: "x", what: "further: the shipped sample removed on two computers, the same" },
  { seed: 1141, inv: "b", what: "further: a setting changed after sign-in but before the first cycle reaches the store is taken as held before joining and gives way" },
  { seed: 2371, inv: "b", what: "further: the same for the sample removed after sign-in" },
  { seed: 2002, inv: "c", what: "third pass 11 (can follow): a catalog saved signed out after another account was seated is merged into the first account's mirror" },
];

function main() {
  const t0 = Date.now();
  if (ARGS.seed !== undefined) {
    const seed = Number(ARGS.seed), all = stepsOf(seed, MAX_STEPS);
    const keep = ARGS.steps ? new Set(String(ARGS.steps).split(",").map(Number)) : null;
    const steps = keep ? all.filter(s => keep.has(s.at)) : all;
    console.log("  seed " + seed + ", " + steps.length + " steps");
    if (ARGS.shrink) {
      const r0 = runWalk(seed, steps);
      if (r0) { const short = shrink(seed, steps, r0.inv, 600); console.log("  shrunk to " + short.length + " steps; replay: " + replay(seed, short)); steps.splice(0, steps.length, ...short); }
    }
    const r = runWalk(seed, steps, l => console.log(l));
    check(!r, "seed " + seed + " holds every invariant" + (r ? ": (" + r.inv + ") " + INVARIANTS[r.inv] + " broken after " + (r.step < steps.length && r.step >= 0 ? describe(steps[r.step]) : "the last quiet point") + ": " + r.detail : ""));
    return;
  }
  /* --hunt <n>: every failing seed of n, one line each, for a builder looking for a seed of one kind. */
  if (ARGS.hunt !== undefined) {
    const from = Number(ARGS.from || 1);
    for (let seed = from; seed < from + Number(ARGS.hunt); seed++) {
      const s = stepsOf(seed, MAX_STEPS), r = runWalk(seed, s);
      if (r) console.log("  seed " + seed + " (" + r.inv + ") " + s.length + " steps [" + [...new Set(s.map(x => x.k))].sort().join(" ") + "]: " + r.detail.slice(0, 220));
    }
    return;
  }
  for (const f of FIXED) {
    const r = runWalk(f.seed, stepsOf(f.seed, MAX_STEPS));
    check(!r, "fixed seed " + f.seed + " (" + f.what + ") holds every invariant" + (r ? ": (" + r.inv + ")" + (r.inv === f.inv ? " as recorded" : ", not (" + f.inv + ") as recorded") + ": " + r.detail : ""));
  }
  const from = Number(ARGS.from || 1), count = Number(ARGS.seeds || 300);
  const firsts = {}, counts = {}, greens = [];
  let steps = 0;
  for (let seed = from; seed < from + count; seed++) {
    const s = stepsOf(seed, MAX_STEPS);
    steps += s.length;
    const r = runWalk(seed, s);
    if (!r) { greens.push(seed); continue; }
    counts[r.inv] = (counts[r.inv] || 0) + 1;
    if (!firsts[r.inv]) firsts[r.inv] = { seed, steps: s, r };
  }
  const ran = Date.now() - t0;
  console.log("  " + count + " seeds from " + from + ", " + steps + " steps, in " + ran + " ms");
  for (const inv of Object.keys(INVARIANTS)) {
    const f = firsts[inv];
    if (!f) { check(true, "(" + inv + ") " + INVARIANTS[inv] + " holds on every seed"); continue; }
    const short = shrink(f.seed, f.steps, inv, 400), again = runWalk(f.seed, short);
    check(false, "(" + inv + ") " + INVARIANTS[inv] + " broken on " + counts[inv] + " seed(s); the first, seed " + f.seed + ", shrunk to " + short.length + " steps: "
      + short.map(describe).join(", ") + ": " + (again ? again.detail : f.r.detail) + "; replay: " + replay(f.seed, short));
  }
  plants(greens);
  console.log("  wall-clock " + (Date.now() - t0) + " ms");
}

/* ---- the plants: for each invariant, one fault put into a copy of shell/sync/sync.cjs (or into the walk's own stand-in of a main.js
   guard, where the guard lives in main.js) turns it red on one of the random seeds that hold every invariant unplanted ---- */
function plants(green) {
  const swap = (from, to) => text => (text.split(from).length === 2 ? text.split(from).join(to) : null);
  const lift = tag => text => { const lines = text.split(/\n/), at = lines.findIndex(l => l.indexOf("/* plant:" + tag + " */") >= 0); if (at < 0) return null; lines.splice(at, 1); return lines.join("\n"); };
  const PLANTS = [
    ["a", "each computer keeps its own version of an item both changed in place", swap("const stay = top.reduce(", "const stay = mine && top.some(e => same(e, mine)) ? mine : top.reduce(")],
    ["b", "a computer's own earlier version not kept where the other's later one replaces it", swap(" ? ownOf(e, item) : valueOf(e, item); /* plant:keep-own */", " ? undefined : valueOf(e, item); /* plant:keep-own */")],
    ["c", "the sync state is not begun again where another account answers It is mine (main.js answer-mine-fresh, in the walk's stand-in)", "model:answerMineFresh"],
    ["d", "a team's keys follow", swap("return SETTINGS.indexOf(s.slice(2)) >= 0 || LAYER_RE.test(s.slice(2)); /* plant:follows */", "return SETTINGS.indexOf(s.slice(2)) >= 0 || LAYER_RE.test(s.slice(2)) || s === \"k:eTeamKeys\"; /* plant:follows */")],
    ["e", "a computer's place holds no catalog bytes", swap("if (item.startsWith(\"f:\") && has(after, item)) own[fileRel(me, item)] = after[item];", "if (item.startsWith(\"f:\") && has(after, item) && false) own[fileRel(me, item)] = after[item];")],
    ["f", "an untouched sample on a joining computer recorded as its own", lift("join-pristine")],
  ];
  const product = fs.readFileSync(SYNC_PATH, "utf8"), digest = sha(product);
  let n = 0;
  for (const [inv, what, change] of PLANTS) {
    const line = "plant (" + inv + ") " + INVARIANTS[inv] + ": " + what + ", turns it red on a seed that holds every invariant unplanted, and the product file is never written";
    if (PLANTS_OFF) { skip(line); continue; }
    let detail = "the plant line is absent", bit = false;
    const kept = SY;
    try {
      if (typeof change === "string") MODEL[change.slice(6)] = false;
      else {
        const next = change(product);
        if (next === null) throw new Error("the plant line is absent");
        const dir = path.join(WORK, "plant-" + (++n));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "sync.cjs"), next);
        SY = require(path.join(dir, "sync.cjs"));
      }
      detail = "no seed of " + green.length + " that hold every invariant unplanted turned it red";
      for (const seed of green) {
        const r = runWalk(seed, stepsOf(seed, MAX_STEPS));
        if (!r || r.inv !== inv) continue;
        bit = true;
        detail = "seed " + seed + " holds every invariant unplanted and breaks it planted: " + r.detail;
        break;
      }
    } catch (e) { detail = e && e.message ? e.message : String(e); }
    finally { SY = kept; MODEL.answerMineFresh = true; }
    check(bit && sha(fs.readFileSync(SYNC_PATH, "utf8")) === digest, line + ": " + detail);
  }
}

try { main(); }
catch (e) { check(false, "harness: " + (e && e.stack ? e.stack : e)); }
try { fs.rmSync(WORK, { recursive: true, force: true }); } catch { /* a temp folder */ }
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed);
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
