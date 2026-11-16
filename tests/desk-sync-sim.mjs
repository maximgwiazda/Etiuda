/* A PERSON'S STORE, SIMULATED: a seeded random walk over what people and computers do, searching for any order of events that loses a
 * person's work, mixes two accounts, sends what it should not, leaves computers that never agree, or leaves a computer believing it syncs
 * when it does not. Layer 1, the merge: shell/sync/sync.cjs as it runs on three computers of one person and a second account, over a
 * relay stand-in in memory, with stand-ins for the parts of shell/main.js that feed it (storeSyncLocal, storeSyncApply, patchDesk, the
 * account answers) and the page's eDeskTake (src/modules/storage.js). After each quiet point six invariants are read; a failing walk is
 * shrunk and printed with its seed.
 *     node tests/desk-sync-sim.mjs                  the fixed seeds, then 300 seeds from 1
 *     node tests/desk-sync-sim.mjs --seeds 2000      more seeds; --from <n> starts elsewhere
 *     node tests/desk-sync-sim.mjs --seed 17         one walk, every step printed; --steps 0,3,9 replays a shrunk one, --shrink shrinks it
 *     node tests/desk-sync-sim.mjs --hunt 3000       every failing seed of 3000, one line each
 * Layer 2, enrolment (below), runs after it: --enrol-seed <n> prints one interleaving, --enrol-seeds <n> runs more, --layer 1 or 2 one alone.
 * Node builtins only, no window; nothing is written outside one scratch folder it makes and removes. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

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
let ST = require(path.join(ROOT, "shell", "sync", "store.cjs"));
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
  if (seed >= ACCOUNT_FROM) return stepsOfAccount(seed);
  const r = rngOf(seed), len = 9 + r.int(Math.max(1, max - 11));
  const joinAt = [r.int(4), r.int(Math.ceil(len * 0.67)), r.int(Math.ceil(len * 0.67))];
  const out = [];
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < 3; c++) if (joinAt[c] === i) out.push({ k: "join", c, cut: r.chance(0.3) });
    out.push(randomStep(r));
  }
  return out.map((s, i) => Object.assign(s, { at: i }));
}
/* THE ACCOUNT QUESTION'S WALKS (seeds from ACCOUNT_FROM): computer 0 alone in the first account, or with computer 1 beside it; the
   person works, signs out, the second account signs in on computer 0 and answers one of three ways and works, signs out, and the first
   account comes back and answers one of three ways and works; ordinary edits and cycles between, nothing failing. Every pair of
   answers on one and on two computers, in seeded orders. */
const ACCOUNT_FROM = 1000000, ACCOUNT_SEEDS = 180;
const ACCOUNT_NOISE = ["set", "field", "field", "fieldOwed", "land", "file", "file", "unfile", "cycle", "cycle", "look"];
function stepsOfAccount(seed) {
  const r = rngOf(seed), n = seed - ACCOUNT_FROM, two = n % 2 === 1, answers = ["start", "mine", "later"];
  const second = answers[Math.floor(n / 2) % 3], first = answers[Math.floor(n / 6) % 3];
  const out = [], on = two ? [0, 1] : [0];
  const work = (k, cs) => { for (let i = 0; i < k; i++) { const st = randomStep(r); st.k = r.pick(ACCOUNT_NOISE); st.c = r.pick(cs); if (st.k === "set") st.key = r.pick(SETTING_KEYS); if (st.k === "field" || st.k === "fieldOwed") { st.op = r.pick(FIELD_OPS); st.m = r.pick(MEMBERS); } if (st.k === "file" || st.k === "unfile") st.name = r.pick(FILES); out.push(st); } };
  out.push({ k: "join", c: 0, cut: false });
  work(2 + r.int(4), [0]);
  if (two) { out.push({ k: "join", c: 1, cut: false }); work(1 + r.int(3), on); }
  out.push({ k: "quiet", c: 0 });
  out.push({ k: "signInOther", c: 0 });
  out.push({ k: "answer", c: 0, choice: second });
  work(1 + r.int(3), on);
  out.push({ k: "quiet", c: 0 });
  out.push({ k: "signInBack", c: 0 });
  out.push({ k: "answer", c: 0, choice: first });
  work(1 + r.int(3), on);
  return out.map((st, i) => Object.assign(st, { at: i }));
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
  const w = { seed, now: T0, ver: 0, tok: 0, stores: {}, relays: {}, comps: [], writes: [], allowed: { A1: new Set(), A2: new Set() }, stepNo: -1, promised: [] };
  for (let i = 0; i < 3; i++) w.comps.push(computerOf(w, i));
  return w;
}
function computerOf(w, i) {
  const me = keyFrom(Buffer.from(sha("computer " + w.seed + " " + i), "hex"));
  const keys = Object.assign({ eTheme: "d" + i + "theme", eUiLang: "d" + i + "lang" }, STATIC_KEYS);
  return {
    i, me, desk: { keys, files: { [SAMPLE_NAME]: SAMPLE, "relay-mirror.json": JSON.stringify({ team: SECRETS.team }) }, big: new Set(), team: false },
    page: { map: Object.assign({}, keys), owed: new Set(), seen: 0, behind: new Map(), win: [] }, bridge: null, kept: [], aside: [], online: true, seat: "", ever: false, s: { who: "", last: "", ask: "" },
    syncFile: null, sync: null, mirrors: new Map(), sent: new Map(), seen: new Map(), heldNow: [], pristineNow: [], failApply: false, keepFail: false,
    knows: new Map(), unattributed: [], ledgerSaw: new Set(), mirrorRoot: path.join(WORK, "c" + i),
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
    if (!m || !ch.roster.has(m[1]) || (partial && !rel.endsWith("/sync.json")) || (seen.get(rel) || 0) >= f.ver) continue;
    /* This computer's own blob comes back only where the mirror holds no file of that path and this channel state never sent it
       (shell/relay/channel.cjs ownHeld): a computer whose state was begun again finds its earlier place; an edit waiting stays. */
    if (rel.startsWith(mine)) { if (!f.del && !map.has(rel) && !sent.has(rel)) { map.set(rel, f.text); sent.set(rel, f.text); } seen.set(rel, f.ver); continue; }
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
    if (c.seatHeld) c.seatHeld.add("f:" + n);
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
    else {
      const ledger = c.sync ? c.sync.state().ledger : {}, pre = {};
      for (const k of Object.keys(keys)) { pre[k] = {}; for (const item of SY.keyItems(k, c.desk.keys[k], keys[k])) pre[k][item] = has(ledger, item) ? ledger[item] : null; }
      patchDesk(c, keys);
      deskSyncedTell(c, keys, pre);
    }
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
/* deskSyncedTell, numbered by the product's desk bridge (sync.cjs createDeskBridge), and the page's eDeskTake: a key the page still owes
   keeps the page's value, which its own send carries, and stays behind at the tell before (storage.js eDeskBehind). */
const bridgeOf = c => c.bridge || (c.bridge = SY.createDeskBridge());
function deskSyncedTell(c, keys, pre, every) {
  const n = bridgeOf(c).tell(keys, pre, every);
  for (const k of c.page.owed) if (!c.page.behind.has(k)) c.page.behind.set(k, c.page.seen);
  for (const k of Object.keys(keys)) {
    if (c.page.owed.has(k)) continue;
    if (keys[k] === null) delete c.page.map[k]; else c.page.map[k] = keys[k];
    c.page.behind.delete(k);
  }
  c.page.seen = n;
}
/* The page's write, as patchDesk takes it from the page: the bridge judges it by the tells taken, what the sync took behind a copy that
   never held it is taken again (untake), a key cleared whole stays so and the page is told again. */
function pageWrite(w, c, keys) {
  const took = {};
  for (const k of Object.keys(keys)) took[k] = c.page.behind.has(k) ? c.page.behind.get(k) : c.page.seen;
  const r = bridgeOf(c).write(c.i, Object.keys(keys), took);
  for (const k of r.dropped) delete keys[k];
  patchDesk(c, keys);
  if (c.sync && Object.keys(r.rewind).length) c.sync.untake(r.rewind);
  if (r.dropped.length) deskSyncedTell(c, Object.fromEntries(r.dropped.map(k => [k, has(c.desk.keys, k) ? c.desk.keys[k] : null])));
}
/* The page's owed sends, landing: each key whole, as patchDesk takes it, then the merge a moment later (storeSyncSoon). */
function land(w, c) {
  if (!c.page.owed.size) return;
  const keys = {};
  for (const k of c.page.owed) keys[k] = has(c.page.map, k) ? c.page.map[k] : null;
  /* A field written while its key was owed and landing at the value the desk already holds changes nothing: the person undid their
     own unsent edit (a star and its removal), so that last write is no work of theirs to keep, and writes the computer never saw stand. */
  const deskNow = itemsOf(c.desk.keys, {}), landing = itemsOf(keys, {}), lastOf = new Map();
  for (const wr of c.page.win) lastOf.set(wr.item, wr);
  for (const wr of lastOf.values()) {
    const v = has(landing, wr.item) ? landing[wr.item] : null, was = has(deskNow, wr.item) ? deskNow[wr.item] : null;
    if (wr.value === v && v === was) wr.cancel = true;
  }
  c.page.win = [];
  c.page.owed.clear();
  pageWrite(w, c, keys);
  mergeSoon(w, c);
}
function createSync(w, c) {
  c.sync = SY.createStoreSync({
    me: { id: c.me.id, pub: c.me.pub, privateKey: c.me.privateKey }, mirrorRoot: c.mirrorRoot,
    channel: opts => channelOf(w, c, opts), io: m => memIO(c, m),
    load: () => clone(c.syncFile), save: s => { c.syncFile = clone(s); for (const [item, e] of Object.entries(s.ledger || {})) if (e && e.h) c.ledgerSaw.add(item + " " + e.h); },
    local: () => syncLocal(c), held: () => c.heldNow, pristine: () => c.pristineNow,
    apply: (patch, copies) => syncApply(w, c, patch, copies),
    pubOf: ST.pubOf, canonBytes: d => Buffer.from(JSON.stringify(d)), now: () => w.now,
  });
}
/* storeSyncSoon: a change on the desk merged a moment later, unless another account's answer is owed. */
function mergeSoon(w, c) {
  if (!c.sync || held(c) || !c.seat) return; /* model-plant:store-seated-merge */
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
  if (c.s.who !== X) {
    c.s.who = X; adopt(w, c, X); if (!c.sync) createSync(w, c);
    /* Seated with every catalog held for a team: the catalogs read after are counted, so a removal of one never read is known. */
    const fresh = c.sync.seated(); /* model-plant:store-seated */
    c.seatHeld = fresh && c.desk.team ? new Set() : null;
  }
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
  /* The page sends every write it owes before it answers (src/modules/signin.js syncAnswer, eDeskFlush). */
  land(w, c); /* model-plant:answer-flush */
  /* (j) is judged against what the account's store held at the relay as the person answered. */
  w.promised.push({ X, c: c.i, step: w.stepNo, choice, held: storeHeldNow(w, X), entries: storeEntriesNow(w, X) });
  /* The desk claimed: what another account wrote here (an account that came and went, or one seated while the question waited) and
     never sent to its own store is handed to the account answering It is mine, by that person's answer, and judged as that account's,
     made over what that account had written here before it. */
  const desk = itemsOf(c.desk.keys, c.desk.files);
  if (choice === "mine") {
    const sent = new Map();
    for (const wr of w.writes) {
      if (wr.comp !== c.i || !wr.acct || wr.acct === X || wr.claimed) continue;
      if (!sent.has(wr.acct)) sent.set(wr.acct, storeHeldNow(w, wr.acct));
      const inStore = sent.get(wr.acct).get(wr.item), here = has(desk, wr.item) ? desk[wr.item] : null;
      if (wr.value === null || here !== wr.value) continue;
      /* On the desk as the person claims it, it stands over what this account wrote here before it, sent to its own store or not. */
      for (const y of w.writes) if (y.comp === c.i && y.acct === X && y.item === wr.item && y.step < wr.step) wr.over.add(y.id);
      if (!(inStore && inStore.has(sha(wr.value)))) { wr.claimed = true; wr.claimedBy = X; }
    }
  }
  if (choice === "mine" && c.s.who !== X) {
    /* The person sees what the desk holds as they claim it: a later write here is made over those values, as far as they are this
       account's own writes; another account's stay unanswered for, so its copy is still judged. */
    c.knows = new Map();
    for (const [item, value] of Object.entries(desk)) {
      const set = new Set();
      for (const wr of w.writes) if (wr.item === item && wr.value === value && (wr.acct === X || wr.claimedBy === X)) { set.add(wr.id); for (const o of wr.over) set.add(o); }
      if (set.size) c.knows.set(item, set);
    }
    knowRemovals(w, c, X, desk);
    c.seatHeld = null;
    if (MODEL.answerMineFresh) { c.syncFile = { rt: "", ledger: {}, kept: [] }; if (c.sync) c.sync.stop(); c.sync = null; } /* model-plant:answer-mine-fresh */
  }
  if (choice === "start") {
    for (const [item, value] of Object.entries(itemsOf(c.desk.keys, c.desk.files))) c.aside.push({ item, value });
    if (!c.desk.team) for (const n of Object.keys(c.desk.files)) if (REF.CATALOG_RE.test(n)) { delete c.desk.files[n]; c.desk.big.delete(n); }
    const clear = {};
    for (const k of Object.keys(c.desk.keys)) if (REF.follows("k:" + k)) clear[k] = null;
    patchDesk(c, clear);
    deskSyncedTell(c, clear, null, k => SY.follows("k:" + k));
    c.syncFile = null; c.mirrors.clear(); c.sent.clear(); c.seen.clear(); c.knows = new Map(); c.seatHeld = null;
    knowRemovals(w, c, X, itemsOf(c.desk.keys, c.desk.files));
    if (c.sync) c.sync.stop();
    c.sync = null;
  }
  c.s.who = X; c.s.last = X; c.s.ask = "";
  if (choice === "mine") adopt(w, c, X);
  look(w, c);
}

/* At an answer the person sees each item the desk lacks: where a removal of that account stands for it, a later write here is made over
   that removal, as over a value seen. */
function knowRemovals(w, c, X, desk) {
  for (const wr of w.writes) {
    if (wr.acct !== X || wr.value !== null || has(desk, wr.item)) continue;
    let set = c.knows.get(wr.item);
    if (!set) { set = new Set(); c.knows.set(wr.item, set); }
    set.add(wr.id);
    for (const o of wr.over) set.add(o);
  }
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
  /* Written while the account question waits unanswered: what the desk held when it is claimed (J1; the last Argon read's finding 3). */
  const wr = { id: w.writes.length, item, value, comp: c.i, acct, over: new Set(set), step: w.stepNo, pre: !acct || held(c) };
  w.writes.push(wr);
  set.add(wr.id);
  c.knows.set(item, set);
  if (acct) for (const t of String(value).match(TOKEN_RE) || []) w.allowed[acct].add(t);
  else c.unattributed.push(wr);
  return wr;
}
function setPage(w, c, key, v, owed) {
  if (v === null) delete c.page.map[key]; else c.page.map[key] = v;
  if (owed || c.page.owed.has(key)) c.page.owed.add(key);
  else { pageWrite(w, c, { [key]: v }); mergeSoon(w, c); }
}
function editField(w, c, op, m, owed) {
  let p = {};
  try { p = JSON.parse(c.page.map[LAYER] || "{}") || {}; } catch { p = {}; }
  let item = null, value = null, was = null;
  if (op === "ov" || op === "note") {
    const f = op === "ov" ? "overrides" : "notes", t = token(w);
    p[f] = Object.assign({}, p[f], { [m]: t });
    item = "k:" + LAYER + "#" + f + "/" + m; value = JSON.stringify(t);
  } else if (op === "ovDel") {
    if (!p.overrides || !has(p.overrides, m)) return;
    was = JSON.stringify(p.overrides[m]);
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
    was = JSON.stringify(m);
    p.favourites = list.filter(x => x !== m);
    if (!p.favourites.length) delete p.favourites;
    item = "k:" + LAYER + "#favourites[]" + m;
  }
  const wr = write(w, c, item, value);
  if (was !== null) wr.was = was;
  if (owed || c.page.owed.has(LAYER)) c.page.win.push(wr);
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
  const was = c.desk.files[name];
  delete c.desk.files[name];
  c.desk.big.delete(name);
  const wr = write(w, c, "f:" + name, null);
  wr.was = was;
  /* A catalog held for a team when its account was seated, removed before any read of the desk saw it: as a removal before joining. */
  if (c.seatHeld && !c.seatHeld.has("f:" + name)) wr.pre = true;
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
/* What an account's store holds at the relay: each item a listed computer's sync.json names with a value, and the hashes named. */
function storeHeldNow(w, X) {
  const st = w.stores[X], out = new Map();
  if (!st) return out;
  const ids = new Set(st.devices.map(d => d.id));
  for (const [rel, f] of w.relays[st.rt] || []) {
    const m = /^desks\/(k-[0-9a-f]{16})\/sync\.json$/.exec(rel);
    if (!m || f.del || !ids.has(m[1])) continue;
    let d = null;
    try { d = JSON.parse(f.text); } catch { continue; }
    for (const [item, e] of Object.entries((d && d.items) || {})) {
      if (!e || typeof e.h !== "string") continue;
      if (!out.has(item)) out.set(item, new Set());
      out.get(item).add(e.h);
    }
  }
  return out;
}
/* The entries an account's store holds at the relay, by item: each listed computer's sync.json entry. */
function storeEntriesNow(w, X) {
  const st = w.stores[X], out = new Map();
  if (!st) return out;
  const ids = new Set(st.devices.map(d => d.id));
  for (const [rel, f] of w.relays[st.rt] || []) {
    const m = /^desks\/(k-[0-9a-f]{16})\/sync\.json$/.exec(rel);
    if (!m || f.del || !ids.has(m[1])) continue;
    let d = null;
    try { d = JSON.parse(f.text); } catch { continue; }
    for (const [item, e] of Object.entries((d && d.items) || {})) {
      if (!e || typeof e.by !== "string" || !Number.isSafeInteger(e.t)) continue;
      if (!out.has(item)) out.set(item, []);
      out.get(item).push({ h: e.h, by: e.by, t: e.t, seen: e.seen || {} });
    }
  }
  return out;
}
/* Whether store entry n stands over entry e by the merge's rule: a setting by the later write; otherwise the same computer's later entry
   or one whose seen covers e. */
const entryOver = (item, n, e) => (REF.isSetting(item) ? n.t > e.t || (n.t === e.t && n.by > e.by) : n.by === e.by ? n.t > e.t : has(n.seen, e.by) && n.seen[e.by] >= e.t);
function invariants(w) {
  const fails = [];
  const say = (inv, detail) => fails.push({ inv, detail });
  /* (j) the store keeps: after a person answers the account question with "It is mine" or "Start from my account", every value the
     account's store held at the relay as they answered is still held there, or stands on that computer, unless a person of that account
     wrote that item since. A computer's sync state begun again never empties the account's copy of what this computer once sent
     (the last Argon read's finding 1: theirs() skipping this computer's own place). Copies set aside on the computer do not count: the
     store is the account's copy. */
  for (const p of w.promised) {
    const X = p.X, c = w.comps[p.c], now = storeHeldNow(w, X), desk = itemsOf(c.desk.keys, c.desk.files);
    const survives = (item, h) => (now.has(item) && now.get(item).has(h)) || (has(desk, item) && sha(desk[item]) === h);
    for (const [item, hs] of p.held) for (const h of hs) {
      if (survives(item, h)) continue;
      /* An item the store held under two values keeps the one standing: the other had given way (a setting's, or a version kept on
         the computer whose write gave way), which (b) judges write by write. (j) asks that the account's copy is not emptied. */
      if ([...hs].some(o => survives(item, o))) continue;
      /* The store moved on by the merge's rule: every entry that held this value is stood over by one the store holds now (seed 469). */
      const was = ((p.entries && p.entries.get(item)) || []).filter(e => e.h === h), ents = storeEntriesNow(w, X).get(item) || [];
      if (was.length && was.every(e => ents.some(n => n.h !== h && entryOver(item, n, e)))) continue;
      /* The item changed by that account's person: after the answer; claimed with it; or on another computer before it, not yet in
         the store as they answered. */
      if (w.writes.some(x => x.item === item && ((x.acct === X && x.step > p.step) || x.claimedBy === X
        || (x.acct === X && x.comp !== p.c && x.step < p.step && (x.value === null ? hs.size > 0 : !hs.has(sha(x.value))))))) continue;
      say("j", X + ": " + item + " at " + h.slice(0, 8) + " was in the store when c" + p.c + " answered " + p.choice + " at #" + p.step + ", and is now neither in the store nor on c" + p.c);
    }
  }
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
  const over = new Set(), overAt = new Map();
  for (const wr of w.writes) for (const o of wr.over) { over.add(o); overAt.set(o, Math.min(overAt.has(o) ? overAt.get(o) : Infinity, wr.step)); }
  /* A write whose very value the person replaced on another computer, by a write made after it, is no distinct work lost: the same
     bytes were on that screen and the person wrote over them (one person's computers: a star on one, the same star and its removal on
     another, seed 107). Writes of the same account only, and only those made before the write over the twin. */
  /* Such a write and the first write over its twin are one act of the person's in two places: each is satisfied where the other stands,
     and lost only where neither does (seeds 1638, 2830: the twin's removal made before any merge saw it, the other star standing). */
  const alt = new Map(), altAdd = (a, b) => { if (!alt.has(a)) alt.set(a, new Set()); alt.get(a).add(b); };
  for (const wr of w.writes) {
    if (over.has(wr.id) || wr.value === null) continue;
    for (const twin of w.writes.filter(x => x !== wr && over.has(x.id) && x.acct === wr.acct && x.item === wr.item && x.value === wr.value && overAt.get(x.id) > wr.step))
      for (const y of w.writes) if (y.over.has(twin.id) && y.step === overAt.get(twin.id) && y.item === wr.item && y.acct === wr.acct) { altAdd(wr.id, y.id); altAdd(y.id, wr.id); }
  }
  const groups = new Map();
  for (const wr of w.writes) {
    if (over.has(wr.id) || wr.cancel || wr.claimed || !wr.acct || (wr.pre && (wr.value === null || REF.isSetting(wr.item)))) continue;
    const g = wr.acct + " " + wr.item;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(wr);
  }
  const shown = new Map();
  const itemsNow = c => { if (!shown.has(c.i)) shown.set(c.i, [itemsOf(c.desk.keys, c.desk.files), itemsOf(c.page.map, {})]); return shown.get(c.i); };
  const holdersOf = wr => new Set(syncedTo(w, wr.acct).concat([w.comps[wr.comp]]));
  /* A value of the item standing on a holder's desk or page, or held in the account's store. */
  const valueStands = (wr, v) => [...holdersOf(wr)].some(c => { const [desk, page] = itemsNow(c); return desk[wr.item] === v || page[wr.item] === v; })
    || !!(storeHeldNow(w, wr.acct).get(wr.item) || new Set()).has(sha(v));
  /* A removal is judged by the writes it was made over, the value it took away among them: it holds where none of those values stands,
     and a value standing in their place is another write's, made over none of them (seeds 902, 2341, 2439: a catalog made and removed
     before the first merge, another computer's of that name standing). Only where no merge on its computer ever recorded one of those
     values: one recorded makes the removal a change the merge sees, which meets the other write as a conflict and is kept as a version
     (seeds 195, 1433 with removals not kept). */
  const removalHolds = wr => {
    const vals = new Set(wr.was !== undefined && wr.was !== null ? [wr.was] : []);
    for (const o of wr.over) { const x = w.writes[o]; if (x.item === wr.item && x.value !== null) vals.add(x.value); }
    if (!vals.size || [...vals].some(v => valueStands(wr, v) || w.comps[wr.comp].ledgerSaw.has(wr.item + " " + sha(v)))) return false;
    const now = new Set();
    for (const c of holdersOf(wr)) for (const items of itemsNow(c)) if (has(items, wr.item)) now.add(items[wr.item]);
    return w.writes.every(x => x.item !== wr.item || x.value === null || !now.has(x.value) || ![...x.over].some(o => wr.over.has(o)));
  };
  const standsAlone = wr => {
    const holders = holdersOf(wr);
    for (const c of holders) {
      const [desk, page] = itemsNow(c);
      if (wr.value === null ? !has(desk, wr.item) : desk[wr.item] === wr.value || page[wr.item] === wr.value) return true;
    }
    /* Held in its account's store at the relay, though no computer syncs that account now (another account took the last one). */
    { const held = storeHeldNow(w, wr.acct).get(wr.item), st = w.stores[wr.acct]; if (st && (wr.value === null ? !held : !!held && held.has(sha(wr.value)))) return true; }
    if (w.comps.some(c => c.kept.concat(c.aside).some(k => k.item === wr.item && k.value === wr.value))) return true;
    return wr.value === null && removalHolds(wr);
  };
  const stands = wr => standsAlone(wr) || [...(alt.get(wr.id) || [])].some(id => standsAlone(w.writes[id]));
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
const INVARIANTS = { a: "agreement", b: "nothing lost", c: "accounts apart", d: "the allowlist", e: "bytes reachable", f: "the untouched sample", j: "the store keeps", x: "the walk ran" };
const replay = (seed, steps) => "node tests/desk-sync-sim.mjs --seed " + seed + " --steps " + steps.map(s => s.at).join(",");

/* THE FIXED SEEDS: each reproduced a finding on the sync line at c77fc33c (1000000: at bc147559), red there, the invariant it broke first named; they run every
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
  { seed: 888, inv: "b", what: "further (red at 215f8f18): a joining computer's first merge whose desk write fails loses its join marks (sync.cjs unapplied), so its setting held before joining is taken as a fresh write and the person's later setting on another computer gives way" },
  { seed: 1000000, inv: "j", what: "last read 1 (an account walk, red at bc147559): an account alone on a computer comes back after another account and answers Start from my account; its fresh state skips this computer's own place and empties the account's store" },
];

async function main() {
  const t0 = Date.now();
  if (Object.keys(ARGS).some(a => a.startsWith("enrol-")) || ARGS.layer === "2") { await layer2(); return; }
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
  /* The account question's walks, each pair of answers on one and on two computers. */
  const acct = { n: 0, steps: 0, first: null, counts: {} };
  for (let seed = ACCOUNT_FROM; seed < ACCOUNT_FROM + ACCOUNT_SEEDS; seed++) {
    const s = stepsOf(seed, MAX_STEPS), r = runWalk(seed, s);
    acct.n++; acct.steps += s.length;
    if (!r) { greens.push(seed); continue; }
    acct.counts[r.inv] = (acct.counts[r.inv] || 0) + 1;
    if (!acct.first) acct.first = { seed, steps: s, r };
  }
  if (!acct.first) check(true, "the account question: " + acct.n + " walks (every pair of answers, one and two computers) hold every invariant");
  else {
    const f = acct.first, short = shrink(f.seed, f.steps, f.r.inv, 400), again = runWalk(f.seed, short);
    check(false, "the account question: " + Object.entries(acct.counts).map(([k, v]) => "(" + k + ") " + v).join(", ") + " of " + acct.n + " walks broken; the first, seed " + f.seed + ", (" + f.r.inv + ") shrunk to " + short.length + " steps: "
      + short.map(describe).join(", ") + ": " + (again ? again.detail : f.r.detail) + "; replay: " + replay(f.seed, short));
  }
  const ran = Date.now() - t0;
  console.log("  " + count + " seeds from " + from + ", " + steps + " steps, and " + acct.n + " account walks of " + acct.steps + " steps, in " + ran + " ms");
  for (const inv of Object.keys(INVARIANTS)) {
    const f = firsts[inv];
    if (!f) { check(true, "(" + inv + ") " + INVARIANTS[inv] + " holds on every seed"); continue; }
    const short = shrink(f.seed, f.steps, inv, 400), again = runWalk(f.seed, short);
    check(false, "(" + inv + ") " + INVARIANTS[inv] + " broken on " + counts[inv] + " seed(s); the first, seed " + f.seed + ", shrunk to " + short.length + " steps: "
      + short.map(describe).join(", ") + ": " + (again ? again.detail : f.r.detail) + "; replay: " + replay(f.seed, short));
  }
  plants(greens);
  console.log("  layer 1 wall-clock " + (Date.now() - t0) + " ms");
  if (ARGS.layer !== "1") await layer2();
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
    ["j", "a computer whose sync state was begun again does not take its own earlier place in (the last read's finding 1)", swap('const ownDoc = state.ownTake === true ? syncRead(String(io.read(syncRel(o.me.id)) || ""), o.me.id) : null;', "const ownDoc = null;")],
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

/* ======== LAYER 2, ENROLMENT: shell/sync/store.cjs storeLook on two or three computers at once, over one folder stand-in, the licence
   service standing in, and the relay itself in memory (relay/worker.mjs on relay/test/stand-ins.cjs, as tests/desk-store.mjs runs it).
   Every request a look makes waits at a gate, and a seeded scheduler lets one through at a time, so the looks interleave at every
   await. The look is run as storeLookRun runs it (shell/main.js): each step asked only while the look's account and switch stand
   (ours), and `made` kept by its rule. Seeded faults: a folder request unreached, the switch moved during a look. After the racing
   looks, each computer still on looks once more alone, as its next renewal would; then three invariants:
   (g) believed enrolled: a look that says on finds its computer enrolled at the relay as it answers, and after the calm looks every
       computer on is enrolled at the relay and listed in the folder's key file;
   (h) the switch: no look writes keys, keeps keys or asks the service or relay after the switch moved under it;
   (i) made kept: a computer whose fresh key file stands in the folder keeps it as made until a look of its own finds it on. ---- */
let RC = null, RS = null, RK = null, RW = null;
async function relayLoad() {
  RC = require(path.join(ROOT, "relay", "core.cjs"));
  RS = require(path.join(ROOT, "relay", "test", "stand-ins.cjs"));
  RK = require(path.join(ROOT, "relay", "test", "grant-kit.cjs"));
  const WORKER = await import(pathToFileURL(path.join(ROOT, "relay", "worker.mjs")).href);
  RW = WORKER.routeWith(RK.ROOTS, env => env.NOW());
}
const CODE = "ABCDEFGHJKMNPQRS", DAY = 24 * 3600e3;
const INVARIANTS2 = { g: "believed enrolled", h: "the switch", i: "made kept", x: "the looks ran" };
const signWith = (privateKey, bytes) => crypto.sign(null, bytes, privateKey).toString("hex");
const sKey = seed => crypto.createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(seed, "hex")]), format: "der", type: "pkcs8" });
const via = at => RK.delegationFor(at, { fields: { may: ["licence", "relay-grant"] } });
const MODEL2 = { lookOurs: true };
async function relayCall(R, method, p, json) {
  const body = json === undefined ? undefined : JSON.stringify(json);
  const res = await RW.fetch(new Request("https://relay.test/relay/v1" + p, { method, headers: { "content-type": "application/json" }, body, duplex: "half" }), R.env);
  return { status: res.status, json: await res.json().catch(() => null) };
}
/* The relay's answer as storeRelayPost reads it: ok, or its error, "relay" where it says none. */
const relayAnswer = r => (r.status === 200 ? { ok: true } : { ok: false, why: r.json && typeof r.json.error === "string" ? r.json.error.slice(0, 40) : "relay" });
async function relayOp(e, c, what, keys, arg) {
  const R = e.R, t = R.clock.now;
  if (what === "create") {
    const sPub = ST.pubOf(keys.s);
    return relayAnswer(await relayCall(R, "POST", "/teams", { rt: keys.rt, lead: { keyId: sPub, pub: sPub }, t, grant: arg, sig: signWith(sKey(keys.s), RC.create2Bytes(keys.rt, sPub, t, arg)) }));
  }
  if (what === "renew") return relayAnswer(await relayCall(R, "POST", "/t/" + keys.rt + "/grant", { grant: arg }));
  const list = keys.devices.map(d => ({ id: d.id, pub: d.pub, desk: d.desk }));
  return relayAnswer(await relayCall(R, "POST", "/t/" + keys.rt + "/devices", { keys: list, rev: keys.rev, t, sig: signWith(sKey(keys.s), RC.devicesBytes(keys.rt, keys.rev, t, list)),
    seat: arg, by: { pub: c.me.pub, sig: signWith(c.me.privateKey, RC.storeDevicesBytes(keys.rt, keys.rev, t, list)) } }));
}
/* The licence service, as tests/desk-sync.mjs stands it in: a grant that says it replaces ends the person's other stores. */
async function grantOp(e, c, rt, sPub, extra) {
  const now = e.R.clock.now;
  if (extra && extra.replace === true) for (const old of [...e.svcKept].filter(x => x !== rt)) {
    const n = { kind: "etiuda-service-notice", format: 1, what: "store-end", rt: old, code: CODE, issued: now, via: via(now), sig: { alg: "ed25519", keyId: RK.DELEGATE.id, value: "" } };
    n.sig.value = signWith(RK.DELEGATE.privateKey, RC.noticeBytes(n));
    await relayCall(e.R, "POST", "/t/" + old + "/notice", { notice: n });
    e.svcKept.delete(old);
  }
  e.svcKept.add(rt);
  const g = { kind: "etiuda-store-grant", format: 1, lead: sPub, code: CODE, issued: now, until: now + 30 * DAY, paid: true, via: via(now), sig: { alg: "ed25519", keyId: RK.DELEGATE.id, value: "" } };
  g.sig.value = signWith(RK.DELEGATE.privateKey, RC.grantBytes(g));
  const cert = { kind: "etiuda-store-certificate", format: 1, desk: c.me.pub, code: CODE, issued: now, until: now + DAY, via: RK.delegationFor(now, { fields: { may: ["licence"] } }),
    sig: { alg: "Ed25519", keyId: RK.DELEGATE.id, value: "" } };
  cert.sig.value = signWith(RK.DELEGATE.privateKey, RC.storeCertBytes(cert));
  return { grant: g, store: cert };
}
/* OneDrive's App Folder, as tests/desk-store.mjs stands it in: no token is no answer, a create over a file is refused. */
function folderAsk(e, c, method, url, headers, body, late) {
  const json = (status, o) => ({ status, bytes: Buffer.from(JSON.stringify(o)) });
  if (e.faulty && e.r.chance(e.faultP)) { e.trace.push("c" + c.i + " folder " + method + " unreached"); throw new TypeError("fetch failed"); }
  if (!/^Bearer \S+$/.test(String(headers && headers.authorization))) return json(401, { error: { code: "InvalidAuthenticationToken" } });
  if (method === "GET" && url === ST.GRAPH) return json(200, { id: "approot" });
  const file = ST.GRAPH + ":/" + ST.KEY_FILE + ":/content";
  if (method === "GET" && url === file) { e.trace.push("c" + c.i + " folder read " + folderSays(e.folder.text)); return e.folder.text === null ? json(404, { error: { code: "itemNotFound" } }) : { status: 200, bytes: Buffer.from(e.folder.text) }; }
  if (method === "PUT" && url.startsWith(file)) {
    if (/conflictBehavior=fail$/.test(url) && e.folder.text !== null) { e.trace.push("c" + c.i + " folder create refused"); return json(409, { error: { code: "nameAlreadyExists" } }); }
    const was = e.folder.text, text = Buffer.from(body).toString("utf8"), k = ST.keyRead(text);
    e.folder.text = text;
    e.trace.push("c" + c.i + " folder write " + folderSays(text));
    if (k && !e.seenRts.has(k.rt)) e.madeBy.set(k.rt, c.i);
    if (k) e.seenRts.add(k.rt);
    if (late) e.effects.push("c" + c.i + " wrote the key file after the switch moved");
    return json(was === null ? 201 : 200, { id: "f" });
  }
  return json(400, { error: { code: "invalidRequest" } });
}
function folderSays(text) {
  if (text === null) return "none";
  if (ST.endedRead(text)) return "ended";
  const k = ST.keyRead(text);
  return k ? k.rt.slice(0, 6) + " rev " + k.rev + " [" + k.devices.map(d => d.id.slice(2, 6)).join(",") + "]" : "unreadable";
}
const gated = (e, c, label, fn) => new Promise((res, rej) => e.pending.push({ c, label, fn, res, rej }));
const deviceIds = keys => "[" + keys.devices.map(d => d.id.slice(2, 6)).join(",") + "] rev " + keys.rev;
/* One look as storeLookRun runs it; null where the switch moved under it, as it answers. */
async function lookRun(e, c) {
  const at = c.switchNo, ours = () => c.switchNo === at && c.on, moved = () => c.switchNo !== at;
  const step = (label, fn, refused) => async (...a) => {
    if (MODEL2.lookOurs && !ours()) return refused; /* model-plant:store-look-steps */
    const late = moved();
    const r = await gated(e, c, label, () => fn(...a));
    if (late) e.effects.push("c" + c.i + " " + label + " after the switch moved");
    return r;
  };
  const io = {
    folder: ST.folderFor("microsoft", { ask: (m, u, h, b) => { const late = moved(); return gated(e, c, "folder " + m, () => folderAsk(e, c, m, u, h, b, late)); },
      token: () => (!MODEL2.lookOurs || ours() ? "access-" + c.i : "") }),
    local: () => clone(c.sealed),
    keep: k => { if (MODEL2.lookOurs && !ours()) return; if (moved()) e.effects.push("c" + c.i + " kept keys after the switch moved"); c.sealed = clone(k); },
    grant: step("grant", async (rt, sPub, extra) => { const g = await grantOp(e, c, rt, sPub, extra); e.trace.push("c" + c.i + " grant " + rt.slice(0, 6) + (extra && extra.replace ? " replacing" : "")); return g; }, { why: "unreached" }),
    relay: {
      create: step("relay create", async (k, g) => { const r = await relayOp(e, c, "create", k, g); e.trace.push("c" + c.i + " relay create " + k.rt.slice(0, 6) + " " + (r.ok ? "ok" : r.why)); return r; }, { ok: false, why: "relay" }),
      renew: step("relay renew", async (k, g) => { const r = await relayOp(e, c, "renew", k, g); e.trace.push("c" + c.i + " relay renew " + k.rt.slice(0, 6) + " " + (r.ok ? "ok" : r.why)); return r; }, { ok: false, why: "relay" }),
      devices: step("relay devices", async (k, cert) => { const r = await relayOp(e, c, "devices", k, cert); e.trace.push("c" + c.i + " relay devices " + deviceIds(k) + " " + (r.ok ? "ok" : r.why)); return r; }, { ok: false, why: "relay" }),
    },
    me: { id: c.me.id, pub: c.me.pub, desk: c.me.desk }, url: "https://relay.test/relay/v1",
    rand: n => Buffer.from(Array.from({ length: n }, () => e.r.int(256))), fresh: c.fresh, made: c.made, lost: c.lost,
  };
  const look = await ST.storeLook(io);
  if (!ours()) return null;
  c.made = (look.state === "paused" || look.state === "unavailable") && look.made === true && look.keys ? look.keys.rt : look.state === "on" ? "" : c.made;
  c.lost = look.state === "paused" && typeof look.lost === "string" ? look.lost : look.state === "on" ? "" : c.lost || ""; /* the shell's own rule, store.cjs lost */
  if (look.state === "ended") { c.on = false; c.sealed = null; }
  if (look.state === "on") { c.fresh = false; c.onFor.add(look.keys.rt); }
  c.last = look;
  return look;
}
function afterLook(e, c, look) {
  e.trace.push("c" + c.i + " look " + (look ? look.state + (look.why ? " " + look.why : "") + (look.keys ? " " + look.keys.rt.slice(0, 6) : "") : "dropped, the switch moved") + (c.made ? ", made " + c.made.slice(0, 6) : ""));
  if (!look) return;
  if (look.state === "on") {
    const row = e.R.stores.get(look.keys.rt);
    if (!row || !row.get("dev:" + c.me.id)) e.fails.push({ inv: "g", detail: "c" + c.i + "'s look says on for " + look.keys.rt.slice(0, 6) + " and the relay does not hold it enrolled" });
  }
  const k = e.folder.text ? ST.keyRead(e.folder.text) : null;
  for (const [rt, by] of e.madeBy) if (by === c.i && k && k.rt === rt && !c.onFor.has(rt) && c.made !== rt)
    e.fails.push({ inv: "i", detail: "c" + c.i + " made " + rt.slice(0, 6) + ", which stands in the folder, and its look answered " + look.state + (look.why ? " " + look.why : "") + " keeping made as " + JSON.stringify(c.made.slice(0, 6)) });
}
async function race(e, cs) {
  let live = cs.length, idle = 0;
  const runs = cs.map(c => lookRun(e, c).then(look => afterLook(e, c, look), err => { e.fails.push({ inv: "x", detail: "c" + c.i + "'s look threw " + (err && err.stack ? err.stack.split("\n").slice(0, 3).join(" | ") : err) }); })
    .finally(() => { live--; }));
  while (live > 0) {
    await new Promise(r => setImmediate(r));
    if (!e.pending.length) { if (++idle > 200) { e.fails.push({ inv: "x", detail: "a look waits on nothing" }); break; } continue; }
    idle = 0;
    e.ops++;
    if (e.switchOp === e.ops && e.comps[e.switchWho].on) { e.comps[e.switchWho].switchNo++; e.comps[e.switchWho].on = false; e.trace.push("c" + e.switchWho + " switch moved"); }
    const op = e.pending.splice(e.faulty ? e.r.int(e.pending.length) : 0, 1)[0];
    e.R.clock.now += 1000;
    try { op.res(await op.fn()); } catch (err) { op.rej(err); }
  }
  await Promise.all(runs);
}
async function enrolWalk(seed) {
  const r = rngOf((seed * 2654435761) >>> 0);
  const R = RS.relayEnv({ roots: RK.ROOTS });
  R.clock.now = T0;
  const e = { seed, r, R, folder: { text: null }, pending: [], effects: [], fails: [], trace: [], madeBy: new Map(), seenRts: new Set(), svcKept: new Set(),
    faulty: false, faultP: 0, ops: 0, switchOp: -1, switchWho: 0, comps: [] };
  const n = 2 + r.int(2);
  for (let i = 0; i < n; i++) e.comps.push({ i, me: keyFrom(Buffer.from(sha("enrol " + seed + " " + i), "hex")), sealed: null, made: "", switchNo: 0, on: true, fresh: false, onFor: new Set(), last: null });
  e.scenario = r.pick(["first", "join", "ended", "gone"]);
  e.trace.push("scenario " + e.scenario + ", " + n + " computers");
  if (e.scenario === "join" || e.scenario === "ended") {
    await race(e, [e.comps[0]]);
    if (e.scenario === "ended" && n > 2) await race(e, [e.comps[1]]);
    if (e.scenario === "ended") {
      const k = ST.keyRead(e.folder.text);
      e.folder.text = ST.endedText(k.rt);
      for (const c of e.comps) c.fresh = r.chance(0.5);
      e.trace.push("turned off everywhere; fresh here: " + (e.comps.filter(c => c.fresh).map(c => "c" + c.i).join(",") || "none"));
    }
  }
  if (e.scenario === "gone") {
    const k = ST.freshKeys(nb => Buffer.from(Array.from({ length: nb }, () => r.int(256))), "https://relay.test/relay/v1");
    k.devices = e.comps.slice(0, 2).map(c => ({ id: c.me.id, pub: c.me.pub, desk: c.me.desk }));
    k.rev = 2;
    e.folder.text = ST.keyText(k);
    e.seenRts.add(k.rt);
    for (const c of e.comps.slice(0, 2)) c.sealed = clone(k);
    e.trace.push("a store the relay swept: " + folderSays(e.folder.text));
  }
  e.faulty = true;
  e.faultP = [0, 0.1, 0.25][r.int(3)];
  e.switchOp = r.chance(0.3) ? 1 + r.int(14) : -1;
  e.switchWho = r.int(n);
  await race(e, e.comps.filter(c => c.on));
  if (e.effects.length) e.fails.push({ inv: "h", detail: e.effects[0] });
  e.faulty = false;
  for (const c of e.comps) if (c.on) await race(e, [c]);
  const k = e.folder.text ? ST.keyRead(e.folder.text) : null;
  for (const c of e.comps) {
    if (!c.on || !c.last || c.last.state !== "on") continue;
    const rt = c.last.keys.rt, row = R.stores.get(rt);
    if (!row || !row.get("dev:" + c.me.id)) e.fails.push({ inv: "g", detail: "after the calm looks c" + c.i + " says on for " + rt.slice(0, 6) + " and the relay does not hold it enrolled" });
    if (!k || k.rt !== rt || !k.devices.some(d => d.pub === c.me.pub)) e.fails.push({ inv: "g", detail: "after the calm looks c" + c.i + " says on for " + rt.slice(0, 6) + " and the folder's key file does not list it (" + folderSays(e.folder.text) + ")" });
  }
  return e;
}
/* THE FIXED ENROLMENT SEEDS, as FIXED above. */
const FIXED2 = [
  { seed: 50, inv: "g", what: "third pass 6: two computers enrol from one folder read; the later's list is refused as replay-rev, taken as enrolled, and it says on" },
  { seed: 22, inv: "i", what: "third pass 8: a store the relay swept is made afresh, the key file's read-back fails, and made is lost" },
  { seed: 16, inv: "i", what: "third pass 8: the same over an ended mark, sync turned on here" },
];
async function layer2() {
  const t0 = Date.now();
  await relayLoad();
  if (ARGS["enrol-seed"] !== undefined) {
    const e = await enrolWalk(Number(ARGS["enrol-seed"]));
    for (const l of e.trace) console.log("    " + l);
    check(!e.fails.length, "enrolment seed " + e.seed + " holds every invariant" + (e.fails.length ? ": (" + e.fails[0].inv + ") " + INVARIANTS2[e.fails[0].inv] + ": " + e.fails[0].detail : ""));
    return;
  }
  if (ARGS["enrol-hunt"] !== undefined) {
    for (let seed = 1; seed <= Number(ARGS["enrol-hunt"]); seed++) {
      const e = await enrolWalk(seed);
      if (e.fails.length) console.log("  enrolment seed " + seed + " " + e.scenario + " (" + e.fails[0].inv + "): " + e.fails[0].detail.slice(0, 200));
    }
    return;
  }
  for (const f of FIXED2) {
    const e = await enrolWalk(f.seed), x = e.fails[0];
    check(!x, "fixed enrolment seed " + f.seed + " (" + f.what + ") holds every invariant" + (x ? ": (" + x.inv + ")" + (x.inv === f.inv ? " as recorded" : ", not (" + f.inv + ") as recorded") + ": " + x.detail : ""));
  }
  const count = Number(ARGS["enrol-seeds"] || 200), firsts = {}, counts = {}, greens = [];
  for (let seed = 1; seed <= count; seed++) {
    const e = await enrolWalk(seed);
    if (!e.fails.length) { greens.push(seed); continue; }
    for (const inv of new Set(e.fails.map(f => f.inv))) { counts[inv] = (counts[inv] || 0) + 1; if (!firsts[inv]) firsts[inv] = e; }
  }
  console.log("  " + count + " enrolment seeds in " + (Date.now() - t0) + " ms");
  for (const inv of Object.keys(INVARIANTS2)) {
    const e = firsts[inv];
    if (!e) { check(true, "(" + inv + ") " + INVARIANTS2[inv] + " holds on every enrolment seed"); continue; }
    check(false, "(" + inv + ") " + INVARIANTS2[inv] + " broken on " + counts[inv] + " enrolment seed(s); the first, seed " + e.seed + ": " + e.fails.find(f => f.inv === inv).detail
      + "; its order: " + e.trace.join("; ") + "; replay: node tests/desk-sync-sim.mjs --enrol-seed " + e.seed);
  }
  await plants2(greens);
}
/* For each enrolment invariant, one fault in a copy of shell/sync/store.cjs (or in the walk's stand-in of storeLookRun's ours() steps,
   which live in main.js) turns it red on a seed that holds every invariant unplanted. */
async function plants2(green) {
  const STORE_PATH = path.join(ROOT, "shell", "sync", "store.cjs");
  const product = fs.readFileSync(STORE_PATH, "utf8"), digest = sha(product);
  const swap = (from, to) => text => (text.split(from).length === 2 ? text.split(from).join(to) : null);
  const PLANTS = [
    ["g", "a relay that refuses this computer's list for any reason taken as enrolled", swap("      if (d.ok) break;\n", "      break;\n")],
    ["h", "the look's steps asked whatever the switch did (main.js store-look-steps, in the walk's stand-in)", "model:lookOurs"],
    ["i", "a fresh store never named made", swap("made = keys.rt === fresh.rt; /* plant:made */", "made = false; /* plant:made */")],
  ];
  let n = 0;
  const kept = ST;
  for (const [inv, what, change] of PLANTS) {
    const line = "plant (" + inv + ") " + INVARIANTS2[inv] + ": " + what + ", turns it red on an enrolment seed that holds every invariant unplanted, and the product file is never written";
    if (PLANTS_OFF) { skip(line); continue; }
    let bit = false, detail = "no seed of " + green.length + " that hold every invariant unplanted turned it red";
    try {
      if (typeof change === "string") MODEL2[change.slice(6)] = false;
      else {
        const next = change(product);
        if (next === null) throw new Error("the plant line is absent");
        const dir = path.join(WORK, "plant2-" + (++n));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "store.cjs"), next);
        ST = require(path.join(dir, "store.cjs"));
      }
      for (const seed of green) {
        const e = await enrolWalk(seed), x = e.fails.find(f => f.inv === inv);
        if (!x) continue;
        bit = true;
        detail = "seed " + seed + " holds every invariant unplanted and breaks it planted: " + x.detail;
        break;
      }
    } catch (err) { detail = err && err.message ? err.message : String(err); }
    finally { ST = kept; MODEL2.lookOurs = true; }
    check(bit && sha(fs.readFileSync(STORE_PATH, "utf8")) === digest, line + ": " + detail);
  }
}

try { await main(); }
catch (e) { check(false, "harness: " + (e && e.stack ? e.stack : e)); }
try { fs.rmSync(WORK, { recursive: true, force: true }); } catch { /* a temp folder */ }
/* The whole run's checks: each fixed seed, each invariant over the random seeds, and each plant, of both layers. */
const EXPECTED = FIXED.length + Object.keys(INVARIANTS).length + 6 + FIXED2.length + Object.keys(INVARIANTS2).length + 3;
const whole = !Object.keys(ARGS).some(a => ["seed", "hunt", "layer", "enrol-seed", "enrol-hunt"].indexOf(a) >= 0);
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + (whole ? " expected=" + EXPECTED : ""));
if (whole && asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
