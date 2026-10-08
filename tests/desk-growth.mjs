/* A long shift, in bare node: a desk that has kept three hundred days of counts, through the real
 * src/modules (storage, pack, desk-stats, pills-box, favourites) over the real shell/preload.js and
 * the real handlers of shell/main.js, electron stubbed, desk.json in a temp folder. What it holds: a
 * count or a resize sends main only the keys that changed, a count costs the same bytes on day three
 * hundred as on day one, the older days are written once a day and read back whole, a rebuild with
 * nothing departed walks no day, and an id no kept day names is let go without changing an answer.
 * Everything below is invented here; nothing comes from a catalog.
 *
 *   node tests/desk-growth.mjs         exit code is the number of failed checks, capped at 63
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const nodeRequire = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 16;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
const settle = async () => { await tick(); await tick(); await tick(); };

/* ---- the desk: a catalog of about 270 KB, 600 cards and 60 intents counted over DAYS days ---- */
const DAYS = 300, CARDS = 600, INTENTS = 60;
const p2 = v => String(v).padStart(2, "0");
const localYmd = x => x.getFullYear() + "-" + p2(x.getMonth() + 1) + "-" + p2(x.getDate());
const TODAY = localYmd(new Date());
const dayBefore = (s, n) => { const [y, m, d] = s.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d) - n * 864e5); return x.getUTCFullYear() + "-" + p2(x.getUTCMonth() + 1) + "-" + p2(x.getUTCDate()); };
const TOMORROW = dayBefore(TODAY, -1);
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
const cardIds = Array.from({ length: CARDS }, (_, i) => "c-card-" + i);
const intentIds = Array.from({ length: INTENTS }, (_, i) => "t:intent-" + i);
const catalog = JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "invented", cards: cardIds.map((id, i) => ({
  id, t: "Card " + i + " \"quoted\"", body: ("Invented line " + i + ", zażółć.\n").repeat(12) })) });
/* Two hundred ids at the front that no kept day names: what an edition that renamed its cards
   leaves behind. */
const retired = Array.from({ length: 200 }, (_, i) => "c-retired-" + i);
const dayIds = retired.concat(cardIds, intentIds);
const days = {};
for (let n = DAYS - 1; n >= 0; n--) {
  const b = { c: {}, i: {}, m: 3, l: { en: 40, pl: 30 } };
  for (let k = 0; k < 100; k++) b.c[retired.length + Math.floor(rnd() * CARDS)] = 1 + Math.floor(rnd() * 9);
  for (let k = 0; k < 20; k++) b.i[retired.length + CARDS + Math.floor(rnd() * INTENTS)] = 1 + Math.floor(rnd() * 9);
  days[dayBefore(TODAY, n)] = b;
}
const useCounts = {}, useAt = {}, intentCounts = {};
cardIds.forEach(id => { useCounts[id] = 5 + Math.floor(rnd() * 500); useAt[id] = TODAY; });
retired.forEach(id => { useAt[id] = dayBefore(TODAY, 350); });
intentIds.forEach(id => { intentCounts[id] = 5 + Math.floor(rnd() * 500); });
/* THE LAYOUT A DESK WAS WRITTEN IN BEFORE THE COUNTS HAD KEYS OF THEIR OWN: all of it in the pack. */
const packBefore = { v: 1, hidden: [], removed: [], custom: [], overrides: { [cardIds[0]]: { t: "Edited" } }, useCounts, useAt,
  intentCounts, searchMisses: 40, langs: { en: 900, pl: 700 }, days, dayIds, daysSince: dayBefore(TODAY, DAYS - 1),
  favourites: cardIds.slice(0, 10), cardOrder: cardIds.slice(0, 400), intentKeys: "tag" };

const UD = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-growth-"));
const DESK = path.join(UD, "desk.json");
/* The trap is written out at holdDesk in tests/desk-ipc.mjs. */
const holdDesk = on => {
  if (process.platform !== "win32") fs.chmodSync(UD, on ? 0o555 : 0o700);
  fs.chmodSync(DESK, on ? 0o444 : 0o666);
};
fs.writeFileSync(DESK, JSON.stringify({ kind: "etiuda-desk", schema: 1, app: "0.0.0", saved: new Date().toISOString(),
  keys: { eCatalog: catalog, ePack: JSON.stringify(packBefore), eTheme: "dark" } }));
const deskText = () => fs.readFileSync(DESK, "utf8");
const onDisk = () => JSON.parse(deskText()).keys || {};

/* ---- electron, as small as main.js needs; every desk channel's payload is kept ------------- */
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const onH = {}, invH = {};
const electron = {
  app: { getPath: () => UD, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
         whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
  ipcMain: { on: (ch, fn) => { onH[ch] = fn; }, handle: (ch, fn) => { invH[ch] = fn; } },
  BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert,
  screen: inert, shell: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
};
const said = [];
const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop };
const shellSrc = f => fs.readFileSync(path.join(ROOT, "shell", f), "utf8");
process.env.XDG_CURRENT_DESKTOP = "GNOME"; /* so the shell's Linux keyring switch (tests/shell-office.mjs 14) stays out, on any machine */
new Function("require", "__dirname", "__filename", "module", "exports", "console", shellSrc("main.js"))(
  n => (n === "electron" ? electron : nodeRequire(n)), path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"),
  { exports: {} }, {}, quiet);

const FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const sends = [];                                // {ch, text}: every desk write the page made
const deskCh = ch => /^etiuda:desk-(save|write|patch)/.test(ch);
const ev = () => ({ sender: { id: 1, once: noop }, senderFrame: FRAME, returnValue: undefined });
const ipcRenderer = {
  sendSync: (ch, ...a) => {
    if (ch === "etiuda:catalog") return null;
    if (ch === "etiuda:host") return { platform: "win32", backdrop: null, deskFile: DESK, home: UD };
    if (deskCh(ch)) sends.push({ ch, text: String(a[0]) });
    const e = ev(); onH[ch](e, ...a); return e.returnValue;
  },
  send: (ch, ...a) => { if (onH[ch]) onH[ch](ev(), ...a); },
  invoke: (ch, ...a) => {
    if (deskCh(ch)) sends.push({ ch, text: String(a[0]) });
    return new Promise(r => setImmediate(() => r(invH[ch] ? invH[ch](ev(), ...a) : undefined)));
  },
  on: noop,
};
const L = {};
const listen = (type, fn) => { (L[type] = L[type] || []).push(fn); };
const slot = { getBoundingClientRect: () => ({ height: 40 }) };
globalThis.window = { addEventListener: listen, removeEventListener: noop, innerWidth: 1200, innerHeight: 800 };
globalThis.document = { visibilityState: "visible", addEventListener: listen, removeEventListener: noop,
  querySelector: s => (s === "#pillsSlot" ? slot : null), getElementById: () => null, querySelectorAll: () => [],
  body: { classList: { contains: () => false } }, documentElement: { classList: { contains: () => false } } };
globalThis.addEventListener = listen;
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language: "en-US", languages: ["en-US"] } });
new Function("require", shellSrc("preload.js"))(n => (n === "electron"
  ? { contextBridge: { exposeInMainWorld: (k, v) => { window[k] = v; } }, ipcRenderer } : nodeRequire(n)));

/* How many characters the process serialises, main's share included: a count that rewrote the older
   days on every flush would show here even where nothing is sent. */
let serialised = 0;
const stringify = JSON.stringify;
JSON.stringify = function (...a) { const r = stringify.apply(JSON, a); if (typeof r === "string") serialised += r.length; return r; };
/* What one send named, and how many bytes crossed: a patch names its keys, a whole map all of them. */
const sentSince = at => sends.slice(at);
const bytesOf = list => list.reduce((n, s) => n + s.text.length, 0);
const keysOf = list => [...new Set(list.flatMap(s => Object.keys(JSON.parse(s.text))))].sort();
/* The oracle for a round trip, written here and not taken from pack.js: the days are the older
   days' key (the pack's own where there is none yet) with the newest from the counts' key over it. */
const fromDisk = () => {
  const k = onDisk(), j = v => { try { return JSON.parse(v || "null"); } catch { return null; } };
  const pk = j(k.ePack) || {}, st = j(k.eStats), older = j(k.eDays);
  if (!st) return { days: pk.days || {}, dayIds: pk.dayIds, useCounts: pk.useCounts };
  return { days: Object.assign({}, older || pk.days || {}, st.days || {}), dayIds: st.dayIds, useCounts: st.useCounts };
};
const J = v => JSON.stringify(v);

try {
  const S = await import(MOD("storage.js"));
  const P = await import(MOD("pack.js"));
  const D = await import(MOD("desk-stats.js"));
  const H = await import(MOD("hooks.js"));
  H.hooks.syncSampleMark = noop;
  const B = await import(MOD("pills-box.js"));
  P.loadPack();

  check(Object.keys(P.pack.days).length === DAYS && P.pack.dayIds.length === dayIds.length && onDisk().eCatalog === catalog,
    "1a THE CONTROL: the desk loaded as it was written, " + Object.keys(P.pack.days).length + " day(s), "
    + P.pack.dayIds.length + " id(s), the catalog on the disk (" + catalog.length + " characters)");

  /* A copy: its count, then the flush saveStats' timer runs. */
  const count = (id, at) => { D.bumpUse(P.pack, id, at); D.bumpLang(P.pack, "en", at); P.saveStats(); P.flushStats(); };
  let at = sends.length;
  count(cardIds[7]); await settle();
  const first = sentSince(at);
  check(fromDisk().days[TODAY] && J(fromDisk().days) === J(P.pack.days),
    "1b the first count after the load leaves on the disk every day the pack holds (" + Object.keys(fromDisk().days).length
    + " of " + Object.keys(P.pack.days).length + "), read back by the oracle above");
  const loaded = J(P.pack.days);
  P.loadPack();
  check(J(P.pack.days) === loaded && Object.keys(P.pack.days).length === DAYS,
    "1c and loadPack reads that desk back whole while its pack still holds the counts it was written with: "
    + Object.keys(P.pack.days).length + " day(s)");

  at = sends.length;
  let was = serialised;
  count(cardIds[8]); await settle();
  const day300 = sentSince(at), wrote300 = serialised - was;
  check(day300.length === 1 && J(keysOf(day300)) === J(["eStats"]),
    "2a a count on day " + DAYS + " sends main one write naming the counts' key alone: " + day300.length + " send(s), key(s) "
    + J(keysOf(day300)) + ", " + bytesOf(day300) + " character(s) where the desk is " + deskText().length);

  /* The same desk cut to its newest day and saved, then the same count again. */
  P.pack.days = { [TODAY]: P.pack.days[TODAY] };
  P.savePack(); await settle();
  at = sends.length;
  was = serialised;
  count(cardIds[9]); await settle();
  const day1 = sentSince(at), wrote1 = serialised - was;
  check(Math.abs(bytesOf(day300) - bytesOf(day1)) <= 64 && Math.abs(wrote300 - wrote1) <= 256,
    "2b and it costs the same on a desk holding one day: " + bytesOf(day300) + " character(s) sent and " + wrote300
    + " serialised on day " + DAYS + ", " + bytesOf(day1) + " and " + wrote1 + " on day 1");
  P.pack.days = Object.assign({}, days, P.pack.days);            // the year back, for what follows
  P.savePack(); await settle();

  /* A new day: the first count of it closes the day before, which moves to the older days' key. */
  const span = { engine: "x", period: { from: "2000-01-01", to: TODAY } };
  const answered = J(D.statsDoc(P.pack, span)), idsBefore = P.pack.dayIds.length;
  at = sends.length;
  count(cardIds[10], TOMORROW); await settle();
  const rolled = sentSince(at);
  at = sends.length;
  count(cardIds[11], TOMORROW); await settle();
  const next = sentSince(at);
  check(J(keysOf(rolled)) === J(["eDays", "eStats"]) && J(keysOf(next)) === J(["eStats"]),
    "3a the first count of a new day writes the older days once, and the next count does not: " + J(keysOf(rolled))
    + " then " + J(keysOf(next)));
  const back = fromDisk();
  check(J(back.days) === J(P.pack.days) && J(back.useCounts) === J(P.pack.useCounts),
    "3b and the disk still reads back as the pack: " + Object.keys(back.days).length + " day(s) against "
    + Object.keys(P.pack.days).length + ", the tallies " + (J(back.useCounts) === J(P.pack.useCounts) ? "equal" : "different"));
  const held = J({ days: P.pack.days, dayIds: P.pack.dayIds, useCounts: P.pack.useCounts });
  P.loadPack();
  check(J({ days: P.pack.days, dayIds: P.pack.dayIds, useCounts: P.pack.useCounts }) === held,
    "3c loadPack puts the pack, the counts and the older days back together as they were");

  /* The day made above let go of the retired ids; every answer over the kept days is unchanged. */
  check(idsBefore === dayIds.length && P.pack.dayIds.indexOf(retired[0]) < 0 && P.pack.dayIds.length <= CARDS + INTENTS
    && J(D.statsDoc(P.pack, span)) === answered,
    "4a an id no kept day names is let go when a day is made: " + idsBefore + " id(s) then "
    + P.pack.dayIds.length + ", and the answer up to the day before is " + (J(D.statsDoc(P.pack, span)) === answered ? "unchanged" : "CHANGED"));

  /* A rebuild asks what departed every time; with nothing departed it reads no day. */
  const raw = P.pack.days;
  let reads = 0;
  P.pack.days = new Proxy(raw, { get: (o, k) => { if (/^\d{4}-/.test(String(k))) reads++; return o[k]; } });
  const alive = new Set(cardIds);
  D.statsForgetCards(P.pack, id => alive.has(id));
  const firstReads = reads; reads = 0;
  D.statsForgetCards(P.pack, id => alive.has(id));
  const againReads = reads; reads = 0;
  alive.delete(cardIds[3]);
  D.statsForgetCards(P.pack, id => alive.has(id));
  const goneReads = reads;
  P.pack.days = raw;
  const left = Object.keys(raw).filter(d => { const k = P.pack.dayIds.indexOf(cardIds[3]); return k > -1 && raw[d].c[k] != null; }).length;
  check(firstReads > 0 && againReads === 0 && goneReads > 0 && left === 0,
    "5a a rebuild with nothing departed reads no day: " + firstReads + " day read(s) the first time, " + againReads
    + " the second; a card departing is walked (" + goneReads + ") and leaves no day holding it (" + left + ")");

  /* ---- a resize: sixty frames of a drag, one task each, then the width holds ---- */
  at = sends.length;
  const during = [];
  for (let f = 0; f < 60; f++) { window.innerWidth = 1200 - f; B.rememberPillsShape(); await tick(); await tick(); during.push(sends.length - at); }
  await tick(400); await settle();
  const drag = sentSince(at);
  check(during[during.length - 1] === 0 && drag.length === 1 && J(keysOf(drag)) === J(["eHdrPills"])
    && onDisk().eHdrPills === "1141x40",
    "6a a drag of sixty frames sends nothing while it moves and one write once it rests, naming the one key: "
    + during[during.length - 1] + " during, " + drag.length + " after, " + J(keysOf(drag)) + ", on the disk " + onDisk().eHdrPills);

  /* ---- main's file: the key map is JSON.stringify's own, byte for byte ---- */
  const text = deskText(), keysAt = text.indexOf(',"keys":');
  check(keysAt > 0 && text.slice(keysAt + 8, -1) === JSON.stringify(JSON.parse(text).keys),
    "7a the desk main wrote from a patch holds its keys exactly as JSON.stringify writes them ("
    + (text.length - keysAt - 9) + " character(s))");

  /* ---- a refusal: a patch main answers false is carried by the next send ---- */
  holdDesk(true);
  S.lsSet("eGrowthRefused", "1"); await settle();
  const troubled = S.eSaveTrouble() !== null;
  holdDesk(false);
  at = sends.length;
  S.lsSet("eGrowthLater", "2"); await settle();
  const carried = sentSince(at);
  check(troubled && J(keysOf(carried)) === J(["eGrowthLater", "eGrowthRefused"]) && onDisk().eGrowthRefused === "1"
    && S.eSaveTrouble() === null,
    "8a a key main refused rides the next write and lands with it: trouble " + (troubled ? "raised" : "not raised")
    + ", the next send named " + J(keysOf(carried)) + ", then " + (S.eSaveTrouble() === null ? "no trouble" : "still trouble"));

  /* ---- the tallies of a departed card go with it, its last-used day included ---- */
  const A = await import(MOD("app-state.js"));
  const F = await import(MOD("favourites.js"));
  A.setCards(cardIds.slice(0, 20).map(id => ({ id, c: "open", t: id })));
  let pruned = "threw";
  try { F.syncFavouritesMeta(); pruned = "ran"; } catch (e) { pruned = "threw " + String(e && e.message).slice(0, 80); }
  check(pruned === "ran" && P.pack.useAt[cardIds[19]] && !(cardIds[20] in P.pack.useAt) && !(retired[0] in P.pack.useAt)
    && !(cardIds[20] in P.pack.useCounts),
    "9a a card the catalog no longer holds takes its last-used day with its tally: " + pruned + ", "
    + Object.keys(P.pack.useAt).length + " last-used day(s) left for 20 cards");

  const errs = said.filter(l => /^ERR /.test(l));
  check(errs.length === 1 && /could not be written/.test(errs[0]),
    "9b main logged one error, the refusal planted above, and no other" + (errs.length !== 1 ? ": " + errs.length + ", first " + errs[0] : ""));
} catch (e) {
  failed++;
  console.log("  FAIL " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
} finally {
  try { holdDesk(false); } catch { /* not made */ }
  try { fs.rmSync(UD, { recursive: true, force: true }); } catch { /* reported below */ }
  check(!fs.existsSync(UD), "10a the temp desk folder is gone");
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
