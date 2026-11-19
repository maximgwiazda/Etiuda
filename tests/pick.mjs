/* The picker over the chat, in bare node: the real src/modules answering, the real shell/preload.js
 * carrying, and the real shell/main.js holding the hotkey and writing the clipboard, electron
 * stubbed. What only Electron can prove (Windows holding the combination, the focus going back to
 * the window underneath) is tests/pick-desk.js's, and this file says so rather than pretending.
 *
 *   node tests/pick.mjs            exit code is the number of failed checks, capped at 63
 *
 * THE ORACLES. The desk's own copy is run beside the picker's, copyEntrySel over the same block
 * with the clipboard stubbed, and the two texts are compared: that is the claim, "copies exactly
 * what the desk's own copy would". The combination rule is held to the sentence written over
 * hotkeyRefusal in shell/main.js, one case per clause. Everything else is structure: which window
 * a message is answered from, what reaches the clipboard, where the picker is put.
 *
 * THE PAGE'S OWN SCRIPT IS RUN (section 4): the exact script the picker's document carries, the one
 * its policy names by hash, over a stand-in of its two elements, with key presses as plain objects.
 * Before 2026-09-29 it was only read, and five faults planted in its keys all left this file green.
 *
 * WHAT THE SHELL MAY NOT DO (section 5) is read from its text with the comments blanked: no API that
 * reads another window, the screen or the clipboard, or presses keys itself; no key bound to the clipboard;
 * one clipboard write, and one clipboard read, at the picker's open; no module or program it did not have. Its one program that presses a key, the
 * caret helper, is read too (5f): Ctrl+V into the window in front at the press, and nothing it reads. Those are the brief's "must hold", and a scan is the only node form of
 * an absence. Strings are NOT blanked, so a name in a command line counts.
 *
 * NO CONTENT. The cards below are invented here and hold nobody's words.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createSeatLab, createSigninGuard } from "./seat-lab.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const nodeRequire = createRequire(import.meta.url);
nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"), { policy: null });
/* The floor: every check below runs, or the file says it did not complete. */
const EXPECTED = 166 + (process.env.ETIUDA_PLANTS === "off" ? 0 : 12);

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
const until = async (fn, ms) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < (ms || 30000)) await tick(5); return fn(); };

/* ---- a page's globals, as few as the modules need to run --------------------------------- */
const SYSTEM = ["en-US"];
Object.defineProperty(globalThis, "navigator", { configurable: true,
  value: { get language() { return SYSTEM[0]; }, get languages() { return SYSTEM; }, clipboard: null } });
const els = { "#pax": { value: "Anna Nowak" }, "#roleSel": { value: "" }, "#intent": { value: "" }, "#seg": { querySelectorAll: () => [], querySelector: () => null },
  "#list": { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: { removeProperty() {}, setProperty() {} }, querySelector: () => null, querySelectorAll: () => [], replaceChildren() {}, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }) },
  "#toast": { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, textContent: "", innerHTML: "", getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }) } };
const bodyClasses = new Set();
globalThis.window = { innerWidth: 1280, innerHeight: 800, isSecureContext: true, addEventListener() {}, removeEventListener() {} };
globalThis.document = {
  querySelector: s => els[s] || null, getElementById: id => els["#" + id] || null, querySelectorAll: () => [],
  createElement: () => ({ getContext: () => ({}), style: {}, classList: { add() {}, remove() {}, toggle() {} }, content: { firstChild: null } }),
  createDocumentFragment: () => ({ appendChild() {} }),
  createRange: () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }) }),
  documentElement: { dataset: {}, classList: { contains: () => false } },
  body: { classList: { contains: c => bodyClasses.has(c), add: c => bodyClasses.add(c), remove: c => bodyClasses.delete(c), toggle() {} } },
  addEventListener() {}, removeEventListener() {}, visibilityState: "visible",
};
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });

/* The hooks boot() fills: the few a copy reaches, as nothing, since no list is drawn here. */
const HK = await import(MOD("hooks.js"));
[
  "runShortcut", "syncSampleMark", "syncSaveNotice", "importCatalogHere", "loadCatalogFromFolder",
  "offerPickedCatalog", "openManage", "mgCardsIn", "openCategoryEditor", "openIntentEditor",
  "segFolded", "applyLangUI", "clearSearchQuery", "updateIntentPlaceholder", "clearIntents",
  "pickIntent", "intentPickedLine", "onRailMQChange", "rebuildCards", "render",
  "closeSettingsMenu", "syncSettingsMenu", "endTour", "startTour", "tourActive",
  "openSettings", "cardOrderTouched", "railDecorate", "drawIntentRail", "syncRailGeometry",
  "scheduleRailGeometry", "setIntentHidden", "syncIntentOrder", "toggleIntentFavourite",
  "syncFavouritesMeta", "ensureCustomCat", "syncAddFab", "syncNextDock", "openCardEditor",
  "flushPillState", "markEntrySel", "listEntryEls", "hideCard", "captureRail", "railRelKeys",
  "railEchoRedraw", "capturePills", "drawPillsCore", "shedSnap", "shedStage", "shedAnimate",
  "shedHold", "shedHolding", "shedWordmarkW", "cardFillKey", "keepPoolAcross", "restartDesk"
].forEach(k => { HK.hooks[k] = () => {}; });
const Dom = await import(MOD("dom.js"));
Dom.grabDom();
const AS = await import(MOD("app-state.js"));
const PK = await import(MOD("pack.js"));
const ST = await import(MOD("storage.js"));
const CE = await import(MOD("copy-entry.js"));
const PICK = await import(MOD("pick.js"));
const SGN = await import(MOD("signin.js"));
const SET = await import(MOD("settings.js"));
const SP = await import(MOD("spell.js"));
const DS = await import(MOD("desk-stats.js"));
const RD = await import(MOD("render.js"));
const LS = await import(MOD("lang-seg.js"));
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
const TB = await import(MOD("tabs.js"));
els["#intent"].classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
["drawPillsCore", "drawIntentRail", "applyLangUI", "updateIntentPlaceholder", "scheduleRailGeometry", "syncNextDock"].forEach(k => { HK.hooks[k] = () => {}; });
/* The desk loads its shortcut bindings at boot; the picker is handed them as the agent set them. */
const SCM = await import(MOD("shortcuts.js"));
if (typeof HK.hooks.segFolded !== "function") HK.hooks.segFolded = () => false;
SCM.loadShortcuts();

/* Invented cards. A greeting-and-name line opens two of them, as a real reply's first line would. */
const CARDS = [
  { id: "c-lamp", c: "orders", t: "Lamp delivery", en: "{GREET} {PAX},\nYour lamp leaves the workshop on Monday." },
  { id: "c-shade", c: "orders", t: "Shade colours", alt: 1, en: "The shade comes in linen.\n\nThe shade comes in paper." },
  { id: "c-sign", c: "care", t: "Care of brass", en: "Brass wants a dry cloth.\n{AGENT}" },
  { id: "c-away", c: "care", t: "Workshop closed", _hidden: true, en: "The workshop rests on Sundays." },
];
AS.putLang("en");
AS.setCards(CARDS.map(c => Object.assign({}, c)));
PK.pack.custom = [];
const uses = id => ((PK.pack.useCounts || {})[id] | 0);

/* The desk's own keyboard copy of a block, with the clipboard caught rather than written. */
function deskCopy(id, vi) {
  let got = null;
  navigator.clipboard = { writeText: t => { got = t; return { then() {} }; } };
  AS.putEntrySel({ id: id, vi: vi });
  CE.copyEntrySel(false);
  navigator.clipboard = null;
  return got;
}
/* And its Shift+Enter, the other language's copy of the same block. */
function deskCopyOther(id, vi) {
  let got = null;
  navigator.clipboard = { writeText: t => { got = t; return { then() {} }; } };
  AS.putEntrySel({ id: id, vi: vi });
  CE.copyEntrySel(true);
  navigator.clipboard = null;
  return got;
}
let LAB = null;
const pickAnswer = (op, arg) => PICK.answerPick(op, JSON.stringify(arg || {}));

try {
  console.log("[1/7] the desk's side: what the picker is shown and what its copy makes");
  /* Section 1 drives answerPick directly before the shell starts in section 2; seat signin.js with a working view. */
  const s1Now = Date.now();
  const s1View = { offered: ["lab"], signedIn: "lab", code: "ABCDEFGHJKMNPQRS", works: true, now: s1Now, until: s1Now + 86400000, registered: true, holding: { on: "trial", ends: s1Now + 86400000 } };
  globalThis.window.E_HOST = { signinState: () => s1View };
  SGN.signinNow();
  ST.lsSet("eNameAsked", "1");
  ST.lsSet("eAgent", "Kate");

  const lampPick = pickAnswer("copy", { id: "c-lamp", vi: 0 });
  const lampDesk = deskCopy("c-lamp", 0);
  check(!!lampPick && lampPick.text === lampDesk && /Anna/.test(lampDesk) && !/\x7b/.test(lampDesk),
    "1a the picker's copy of a block is the desk's own copy of it, greeting and customer's name filled ("
    + (lampPick && lampPick.text === lampDesk ? "equal" : "DIFFERENT") + ", " + String(lampDesk).length + " characters)");
  const signPick = pickAnswer("copy", { id: "c-sign", vi: 0 }), signDesk = deskCopy("c-sign", 0);
  check(!!signPick && signPick.text === signDesk && /Kate$/.test(signDesk),
    "1b and so is a signed one, the agent's name in its place");
  const shadePick = pickAnswer("copy", { id: "c-shade", vi: 1 }), shadeDesk = deskCopy("c-shade", 1);
  check(!!shadePick && shadePick.text === shadeDesk && /paper/.test(shadeDesk) && !/linen/.test(shadeDesk),
    "1c and the second of two alternatives is that alternative alone");

  const before = uses("c-lamp");
  pickAnswer("copy", { id: "c-lamp", vi: 0 });
  check(uses("c-lamp") === before + 1, "1d a copy through the picker is counted as a copy: " + before + " to " + uses("c-lamp"));

  const open = pickAnswer("open");
  const ids = r => (r || []).map(x => x.id + "/" + x.vi).join(" ");
  check(open && open.last && open.last.id === "c-lamp" && open.last.vi === 0,
    "1e the reply copied last is offered again at the top: " + (open && open.last ? open.last.id : "none"));
  check(pickAnswer("copy", { last: true }).text === lampDesk,
    "1f and the repeat copies it afresh for the chat in front");
  const got1g = ids(open.rows), shadeAt = got1g.split(" ").indexOf("c-shade/0");
  check(got1g.split(" ").sort().join(" ") === "c-lamp/0 c-shade/0 c-shade/1 c-sign/0" && got1g.split(" ")[shadeAt + 1] === "c-shade/1",
    "1g with nothing typed the rows are the desk's list, one per copyable block and a card's blocks together: " + got1g);
  const rowOf = id => open.rows.find(r => r.id + "/" + r.vi === id) || {};
  check(rowOf("c-lamp/0").x === "Your lamp leaves the workshop on Monday." && rowOf("c-shade/0").tag === "1/2" && rowOf("c-sign/0").tag === "",
    "1h a row's excerpt skips a line of tokens alone, and an alternative says which it is: \"" + rowOf("c-lamp/0").x + "\", " + rowOf("c-shade/0").tag);

  const found = pickAnswer("find", { q: "brass" });
  check(ids(found.rows) === "c-sign/0", "1i typing narrows it by the desk's own search: " + ids(found.rows));
  check(ids(pickAnswer("find", { q: "sundays" }).rows) === "", "1j a put-away card is not found even by its own words");
  AS.setCats(["care"]);
  const shelf = ids(pickAnswer("find", { q: "" }).rows), anyShelf = ids(pickAnswer("find", { q: "lamp" }).rows);
  AS.setCats([]);
  check(shelf === "c-sign/0" && anyShelf === "c-lamp/0",
    "1k at rest it keeps the category chosen, and a query searches them all, as the desk's box does: " + shelf + " | " + anyShelf);
  const many = [];
  for (let i = 0; i < 12; i++) many.push({ id: "c-m" + i, c: "orders", t: "Brass note " + i, en: "Brass note " + i + "." });
  AS.setCards(CARDS.map(c => Object.assign({}, c)).concat(many));
  const brass = pickAnswer("find", { q: "brass" });
  check(brass.rows.length === 13 && brass.count === "13 replies",
    "1l the list holds every reply found, past the nine number keys, and says how many: " + brass.rows.length + " row(s), \"" + brass.count + "\"");
  AS.setCards(CARDS.map(c => Object.assign({}, c)));

  ST.lsDel("eNameAsked"); ST.lsDel("eAgent");
  const counted = uses("c-sign");
  let ask = null;
  try { ask = pickAnswer("copy", { id: "c-sign", vi: 0 }); } catch (e) { ask = { threw: String(e && e.message) }; }
  check(ask && ask.ask && ask.ask.id === "c-sign" && !("text" in ask) && uses("c-sign") === counted,
    "1m a reply signing with a name never given is handed back to the desk to ask, and not counted: " + JSON.stringify(ask));
  ST.lsSet("eNameAsked", "1");

  const ev = (code, mods) => Object.assign({ code: code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }, mods || {});
  const got = [SET.hotkeyFromEvent(ev("Space", { ctrlKey: true, shiftKey: true })),
    SET.hotkeyFromEvent(ev("KeyE", { ctrlKey: true, altKey: true })), SET.hotkeyFromEvent(ev("ShiftLeft", { shiftKey: true })),
    SET.hotkeyFromEvent(ev("KeyK", { metaKey: true })), SET.hotkeyFromEvent(ev("Slash", { ctrlKey: true }))];
  check(JSON.stringify(got) === JSON.stringify(["Control+Shift+Space", "Control+Alt+E", null, "Super+K", null]),
    "1n Settings names a key press in the host's spelling, AltGr as the Control and Alt it is: " + JSON.stringify(got));

  /* The repeat of a reply of two blocks is the block copied, not the card's first. */
  pickAnswer("copy", { id: "c-shade", vi: 1 });
  const again = pickAnswer("copy", { last: true });
  check(!!again && again.text === shadeDesk && !/linen/.test(again.text),
    "1o the repeat of the second of two blocks copies that block again: " + JSON.stringify(again && again.text));

  /* The desk's "Searched for" note belongs to its own box. A typo in the box is recorded; a typo in
     the picker is corrected for the picker and leaves the note as the box left it. */
  els["#intent"].value = "workhop";
  SP.cardSearchTerms();
  const noteBefore = JSON.stringify(SP.eSpellFix);
  const typo = pickAnswer("find", { q: "dleivery" });
  const noteAfter = JSON.stringify(SP.eSpellFix);
  els["#intent"].value = "";
  check(/workshop/.test(noteBefore) && ids(typo.rows) === "c-lamp/0" && noteAfter === noteBefore,
    "1p a typo in the picker is corrected for it and leaves the desk's note alone: " + ids(typo.rows) + ", " + noteAfter);

  /* A copy through the picker is a copy by the desk's own rule: the rail's offer is taken. */
  AS.setRailMarkUsed(false);
  pickAnswer("copy", { id: "c-sign", vi: 0 });
  check(AS.railMarkUsed === true, "1q a copy through the picker takes the rail's offer: " + AS.railMarkUsed);

  /* A reply that commits the firm is offered with its stamp, as the desk's own lists draw it: the row says so and the
     page is given the words for it. A row of a card that does not commit is what it was, to the key. */
  AS.setCards(CARDS.map(c => Object.assign({}, c)).concat([{ id: "c-oath", c: "orders", t: "Oath", en: "It ships today.", commits: 1 }]));
  const oathRows = pickAnswer("open"), oathRow = oathRows.rows.find(r => r.id === "c-oath") || {}, lampRow = oathRows.rows.find(r => r.id === "c-lamp") || {};
  AS.setCards(CARDS.map(c => Object.assign({}, c)));
  check(oathRow.commits === 1 && oathRows.words.stamp === "Commits the firm",
    "1r a reply that commits the firm is offered marked, and the page is given the desk's words for the mark: " + JSON.stringify([oathRow.commits, oathRows.words.stamp]));
  check(Object.keys(lampRow).join(",") === "id,vi,t,x,tag",
    "1s control: the row of a reply that does not commit carries no mark and no key it did not: " + Object.keys(lampRow).join(","));
  const whoRes = pickAnswer("who", { name: "Jan Kowalski" });
  const lampAfterWho = pickAnswer("copy", { id: "c-lamp", vi: 0 });
  const deskPax = document.getElementById("pax");
  check(whoRes && whoRes.who === "" && deskPax && deskPax.value === "Jan Kowalski"
    && lampAfterWho && /Jan Kowalski/.test(lampAfterWho.text) && !/Anna/.test(lampAfterWho.text),
    "1t setting the customer name through the picker fills the desk's name and the replies, and with no conversation open the answer names none: "
    + JSON.stringify([whoRes && whoRes.who, deskPax && deskPax.value, lampAfterWho && lampAfterWho.text]));
  pickAnswer("who", { name: "Anna Nowak" });

  /* ---- 2. the shell --------------------------------------------------------------------- */
  console.log("\n[2/7] the shell: the hotkey, the relay and the clipboard");
  LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-pick-"));
  const UD = path.join(LAB, "user-data"), DOCS = path.join(LAB, "documents");
  fs.mkdirSync(UD, { recursive: true }); fs.mkdirSync(DOCS, { recursive: true });
  const signinGuard = createSigninGuard({ dirs: [LAB, ROOT], labelRoot: LAB });
  const seatLab = createSeatLab({ labDir: LAB });
  /* The shell reads a catalog from the folder above itself, so it is loaded beside copies of the two
     folders it needs and never above the checkout: an ignored file at a checkout's root is then not
     in this world. */
  const APP = path.join(LAB, "app");
  ["shell", "engine"].forEach(d => fs.cpSync(path.join(ROOT, d), path.join(APP, d), { recursive: true }));
  fs.writeFileSync(path.join(UD, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
    keys: { eCatalogFolder: path.join(LAB, "catalogs") } }), "utf8");

  const anything = over => { const p = new Proxy(function () {}, {
    get: (t, k) => (over && k in over) ? over[k] : (k === "then" || k === Symbol.iterator || k === Symbol.toPrimitive) ? undefined : p,
    set: () => true, apply: () => p, construct: () => p }); return p; };
  const wins = [];
  let madeAPicker = null;
  let wcN = 0;
  function makeWin(opts) {
    const w = { opts: opts, calls: [], visible: false, destroyed: false, focused: false, bounds: null, on: {}, sent: [] };
    const wcOn = {}, wcOnce = {};
    const fire = (ev, ...a) => { (wcOnce[ev] || []).splice(0).forEach(fn => fn(...a)); (wcOn[ev] || []).forEach(fn => fn(...a)); };
    w.webContents = anything({ id: ++wcN, send: (...a) => { w.sent.push(a); if (w.route) w.route(...a); },
      on: (ev, fn) => { (wcOn[ev] = wcOn[ev] || []).push(fn); }, once: (ev, fn) => { (wcOnce[ev] = wcOnce[ev] || []).push(fn); },
      setWindowOpenHandler: () => {}, getURL: () => "" });
    const note = (k, fn) => (...a) => { w.calls.push(k); return fn ? fn(...a) : undefined; };
    const self = anything({
      webContents: w.webContents,
      on: (ev, fn) => { (w.on[ev] = w.on[ev] || []).push(fn); }, once: (ev, fn) => { (w.on[ev] = w.on[ev] || []).push(fn); },
      isDestroyed: () => w.destroyed, isVisible: () => w.visible, isMinimized: () => false, isMaximized: () => false,
      show: note("show", () => { w.visible = true; }), focus: note("focus", () => { w.focused = true; }),
      showInactive: note("showInactive", () => { w.visible = true; }), setIgnoreMouseEvents: v => { w.ignore = !!v; },
      hide: note("hide", () => { w.visible = false; w.focused = false; }),
      blur: note("blur", () => { w.focused = false; (w.on.blur || []).forEach(fn => fn()); }),
      destroy: note("destroy", () => { w.destroyed = true; }), restore: note("restore"), center: note("center"),
      setBounds: b => { w.bounds = b; }, getBounds: () => w.bounds || { x: 0, y: 0, width: 1280, height: 880 },
      loadFile: note("loadFile", () => setImmediate(() => fire("did-finish-load"))),
      loadURL: note("loadURL", u => { w.url = u; setImmediate(() => fire("did-finish-load")); }),
    });
    w.self = self;
    w.fire = fire;
    wins.push(w);
    /* A window's preload runs as it is made, before its page has loaded: so does its stand-in. */
    if (((opts.webPreferences || {}).additionalArguments || []).indexOf("--etiuda-picker") > -1 && madeAPicker) madeAPicker(w);
    return self;
  }
  const BW = new Proxy(function () {}, { construct: (t, a) => makeWin(a[0] || {}),
    get: (t, k) => k === "fromWebContents" ? (wc => { const w = wins.find(x => x.webContents === wc); return w ? w.self : null; })
      : k === "getAllWindows" ? () => wins.filter(x => !x.destroyed).map(x => x.self) : undefined });
  const held = new Map(), taken = new Set(["Control+Shift+F9"]), clip = [];
  /* THE CARET HELPER is never run here: its calls are recorded, with how many calls the picker had seen
     at the time, and answered as the helper would. Only Windows has one; elsewhere none is asked. */
  const caret = { there: true, front: "4242 1", runs: [], pickerCalls: () => -1, fail: false, sel: null };
  const cpReal = nodeRequire("node:child_process");
  const cpStub = Object.assign({}, cpReal, { execFile: (file, args, opts, done) => {
    caret.runs.push({ file: String(file), args: (args || []).map(String), at: caret.pickerCalls() });
    /* The selection. A string is editable words. An object is {fact, text} or {code}. "hang" never answers.
       A number, or nothing, is that exit (1 when nothing is selected). The fact is the helper's first line. */
    if (args && args[0] === "selection") {
      const sel = caret.sel;
      if (sel === "hang") return;
      setImmediate(() => {
        if (sel && typeof sel === "object") {
          if ("code" in sel) done(Object.assign(new Error("exit"), { code: sel.code }), "", "");
          else done(null, String(sel.fact == null ? "" : sel.fact) + "\n" + String(sel.text == null ? "" : sel.text), "");
          return;
        }
        if (typeof sel === "string") { done(null, "ed\n" + sel, ""); return; }
        done(Object.assign(new Error("exit"), { code: sel == null ? 1 : sel }), "", "");
      });
      return;
    }
    setImmediate(() => done(caret.fail && args && args[0] === "paste" ? Object.assign(new Error("refused"), { code: 3 }) : null,
      args && args[0] === "which" ? caret.front : "", ""));
  } });
  let suspended = null, clipReads = 0, clipHeld = "", clipAsPromise = false, clipNever = false;
  const onH = {}, invH = {};
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  let cursor = { x: 300, y: 200 };
  const electron = {
    app: { getPath: n => (n === "documents" ? DOCS : UD), setPath() {}, requestSingleInstanceLock: () => true, quit() {},
      on() {}, getVersion: () => "0.0.0", whenReady: () => Promise.resolve(), getLocale: () => "en-US",
      commandLine: { appendSwitch() {} },
      getPreferredSystemLanguages: () => ["en-US"] },
    ipcMain: { on: (ch, fn) => { onH[ch] = fn; }, handle: (ch, fn) => { invH[ch] = fn; } },
    BrowserWindow: BW, Menu: anything(), dialog: anything(), net: seatLab.net(), protocol: anything(), session: anything(),
    clipboard: { writeText: t => clip.push(t), readText: () => { clipReads++; return clipNever ? new Promise(() => {}) : clipAsPromise ? Promise.resolve(clipHeld) : clipHeld; } },
    globalShortcut: { register: (a, fn) => { if (taken.has(a)) return false; held.set(a, fn); return true; },
      unregister: a => { held.delete(a); }, unregisterAll: () => held.clear(), setSuspended: v => { suspended = !!v; } },
    screen: { getCursorScreenPoint: () => cursor, getDisplayNearestPoint: () => ({ workArea: area }),
      getAllDisplays: () => [{ bounds: area, workArea: area }], getPrimaryDisplay: () => ({ workArea: area }) },
    shell: seatLab.labShell(), systemPreferences: { on() {}, getAccentColor: () => "" },
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => "gnome_libsecret",
      encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
      decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
    },
    nativeTheme: { themeSource: "system", shouldUseDarkColors: false }, powerMonitor: { on() {} },
  };
  const said = [];
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn() {} };
  const SRC = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
  const listed = [];
  const written = [];
  const noteWrite = data => { try { written.push(Buffer.isBuffer(data) ? data.toString("utf8") : String(data == null ? "" : data)); } catch (e) { written.push(""); } };
  const shellFs = new Proxy(signinGuard.shellFs, {
    get(t, k) {
      if (k === "writeFileSync") return (p, data, ...rest) => { noteWrite(data); return t.writeFileSync(p, data, ...rest); };
      if (k === "appendFileSync") return (p, data, ...rest) => { noteWrite(data); return t.appendFileSync(p, data, ...rest); };
      if (k === "readdirSync") return (p, ...rest) => (listed.push(path.resolve(String(p)).toLowerCase()), t.readdirSync(p, ...rest));
      if (k === "existsSync") return p => /[\\/]caret\.exe$/i.test(String(p)) ? caret.there : t.existsSync(p);
      return Reflect.get(t, k, t);
    },
  });
  const EXPOSE = ["hotkeyRefusal", "pickerPlace", "pickerGrow", "pickClipText", "PICK_SIZE", "HOTKEY_DEFAULT"];
  process.env.XDG_CURRENT_DESKTOP = "GNOME"; /* so the shell's Linux keyring switch (tests/shell-office.mjs 14) stays out, on any machine */
  const SH = seatLab.withSigninLab(() => new Function("require", "__dirname", "__filename", "module", "exports", "console",
    SRC + "\nreturn { " + EXPOSE.map(n => n + ": " + n).join(", ")
    + ", __rw: { config: f => { deskAiConfig = f; }, result: t => { pickReworded = t; } } };")(
    n => (n === "electron" ? electron : (n === "node:fs" || n === "fs") ? shellFs : n === "node:child_process" ? cpStub : nodeRequire(n)),
    path.join(APP, "shell"), path.join(APP, "shell", "main.js"),
    { exports: {} }, {}, quiet));

  const refusals = {
    "Control+Shift+Space": "", "Control+Alt+E": "altgr", "Control+Alt+Shift+F13": "altgr", "Shift+A": "bare", "F5": "bare",
    "Alt+Space": "system", "Alt+Shift+K": "system", "Alt+F4": "system", "Control+C": "used", "Control+7": "used",
    "Control+Shift+E": "used", "Alt+K": "used", "Control+Space": "used", "Control+F5": "used", "Control+Shift+5": "",
    "Control+Shift+F5": "", "Alt+F5": "", "F13": "", "Shift+F20": "", "Super+K": "shape", "Control+Slash": "shape",
    "Control+Control+K": "shape", "": "shape" };
  const wrong = Object.keys(refusals).filter(k => SH.hotkeyRefusal(k) !== refusals[k]);
  check(wrong.length === 0, "2a the combination rule answers its written clauses, " + Object.keys(refusals).length
    + " cases" + (wrong.length ? ", wrong: " + wrong.map(k => k + "=" + SH.hotkeyRefusal(k)).join(" ") : ""));

  await until(() => wins.length > 0 && held.size > 0);
  const desk = wins[0];
  check(held.size === 1 && held.has("Control+Shift+Space") && SH.HOTKEY_DEFAULT === "Control+Shift+Space",
    "2b a desk that never chose holds the default once the window is up: held " + held.size
    + " [" + [...held.keys()].join(" ") + "], has the default " + held.has("Control+Shift+Space")
    + ", named default " + SH.HOTKEY_DEFAULT);

  /* The desk's page: the real preload over main's own handlers, and the real modules behind it. */
  const ENGINE = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
  const deskOn = {};
  const deskEvent = () => ({ sender: desk.webContents, senderFrame: ENGINE, returnValue: undefined });
  const pageOf = (argv, ipc) => {
    const page = {};
    const had = process.argv.slice();
    if (argv) process.argv.push(argv);
    try {
      new Function("require", fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8"))(n => (n === "electron"
        ? { contextBridge: { exposeInMainWorld: (k, v) => { page[k] = v; }, executeInMainWorld() {} }, ipcRenderer: ipc, webUtils: {} }
        : nodeRequire(n)));
    } finally { process.argv.length = 0; had.forEach(a => process.argv.push(a)); }
    return page;
  };
  const deskPage = pageOf(null, {
    sendSync: (ch, ...a) => { const e = deskEvent(); if (onH[ch]) onH[ch](e, ...a); return e.returnValue; },
    send: (ch, ...a) => { if (onH[ch]) onH[ch](deskEvent(), ...a); },
    invoke: (ch, ...a) => Promise.resolve(invH[ch] ? invH[ch](deskEvent(), ...a) : undefined),
    on: (ch, fn) => { deskOn[ch] = fn; },
  });
  desk.route = (ch, ...a) => { if (deskOn[ch]) setImmediate(() => deskOn[ch]({}, ...a)); };
  check(!!deskPage.E_HOST && typeof deskPage.E_HOST.onPickAsk === "function" && !deskPage.E_PICK,
    "2c the desk's page is given the desk's bridge with the picker's questions on it, and not the picker's");
  deskPage.E_HOST.onPickAsk((op, arg) => JSON.stringify(PICK.answerPick(op, arg)));

  const st = deskPage.E_HOST.hotkeyState();
  const tryTaken = await deskPage.E_HOST.setHotkey("Control+Shift+F9");
  const afterTaken = [...held.keys()].join(" ");
  const tryUsed = await deskPage.E_HOST.setHotkey("Control+Shift+E");
  const tryFree = await deskPage.E_HOST.setHotkey("Control+Shift+F10");
  check(st.accel === "Control+Shift+Space" && st.held && tryTaken.why === "taken" && afterTaken === "Control+Shift+Space"
    && tryUsed.why === "used" && tryFree.ok === true && [...held.keys()].join(" ") === "Control+Shift+F10",
    "2d a combination Windows refuses leaves the one held before, the rule's refusal says why, and a free one is held: "
    + [tryTaken.why, afterTaken, tryUsed.why, tryFree.ok, [...held.keys()].join(" ")].join(", "));
  deskPage.E_HOST.pauseHotkey(true);
  const paused = suspended;
  deskPage.E_HOST.pauseHotkey(false);
  check(paused === true && suspended === false, "2e Settings pauses the hotkey while it listens for keys, and lets it go");
  deskPage.E_HOST.pauseHotkey(true);
  const setWhilePaused = await deskPage.E_HOST.setHotkey("Control+Shift+F11");
  check(setWhilePaused.ok === true && suspended === false && held.has("Control+Shift+F11"),
    "2r a combination set while Settings listens is held and the pause is let go with it: " + JSON.stringify(setWhilePaused) + ", paused " + suspended);
  onH["etiuda:desk-patch-save"](deskEvent(), JSON.stringify({ eHotkey: "" }));
  const off = held.size;
  onH["etiuda:desk-patch-save"](deskEvent(), JSON.stringify({ eHotkey: null }));
  check(off === 0 && [...held.keys()].join(" ") === "Control+Shift+Space",
    "2f the hotkey follows the desk: an empty key is off, and no key is the default again (" + off + " held when off)");

  const deskAdapter = {
    ud: UD,
    sync: (ch, ...a) => { const e = deskEvent(); if (onH[ch]) onH[ch](e, ...a); return e.returnValue; },
    ask: (ch, ...a) => Promise.resolve(invH[ch] ? invH[ch](deskEvent(), ...a) : undefined),
  };
  /* Before the desk holds a seat (both before sign-in and signed in with none), the hotkey focuses the desk and opens no picker. */
  {
    const runUnseated = async (srcText, tag) => {
      const ud2 = path.join(LAB, "unseated-" + tag);
      fs.mkdirSync(ud2, { recursive: true });
      fs.writeFileSync(path.join(ud2, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
        keys: { eCatalogFolder: path.join(LAB, "catalogs") } }), "utf8");
      const wins2 = [], held2 = new Map(), on2 = {}, inv2 = {};
      const makeWin2 = () => {
        const w = { calls: [], sent: [], visible: false, destroyed: false, focused: false };
        const note = (k, fn) => (...a) => { w.calls.push(k); return fn ? fn(...a) : undefined; };
        w.webContents = anything({ id: wins2.length + 1, send: (...a) => { w.sent.push(a); }, on() {}, once() {}, setWindowOpenHandler() {}, getURL: () => "" });
        w.self = anything({
          webContents: w.webContents, on() {}, once() {}, isDestroyed: () => w.destroyed, isVisible: () => w.visible,
          isMinimized: () => false, isMaximized: () => false, show: note("show", () => { w.visible = true; }),
          focus: note("focus", () => { w.focused = true; }), showInactive: note("showInactive"), hide: note("hide"),
          destroy: note("destroy", () => { w.destroyed = true; }), restore: note("restore"), center: note("center"),
          setBounds() {}, getBounds: () => ({ x: 0, y: 0, width: 1280, height: 880 }),
          loadFile: note("loadFile"), loadURL: note("loadURL"),
        });
        wins2.push(w);
        return w.self;
      };
      const BW2 = new Proxy(function () {}, { construct: () => makeWin2(),
        get: (t, k) => k === "fromWebContents" ? () => null : k === "getAllWindows" ? () => wins2.map(x => x.self) : undefined });
      const el2 = Object.assign({}, electron, {
        app: Object.assign({}, electron.app, { getPath: n => (n === "documents" ? DOCS : ud2) }),
        ipcMain: { on: (ch, fn) => { on2[ch] = fn; }, handle: (ch, fn) => { inv2[ch] = fn; } },
        BrowserWindow: BW2,
        clipboard: { writeText() {}, readText: () => "" },
        globalShortcut: { register: (a, fn) => { held2.set(a, fn); return true; }, unregister: a => held2.delete(a), unregisterAll: () => held2.clear(), setSuspended() {} },
        shell: seatLab.labShell(),
      });
      seatLab.withSigninLab(() => new Function("require", "__dirname", "__filename", "module", "exports", "console", srcText)(
        n => (n === "electron" ? el2 : (n === "node:fs" || n === "fs") ? signinGuard.shellFs : n === "node:child_process" ? cpStub : nodeRequire(n)),
        path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet));
      await until(() => wins2.length > 0 && held2.has("Control+Shift+Space"), 5000);
      const d = wins2[0];
      d.calls.length = 0; d.sent.length = 0;
      held2.get("Control+Shift+Space")();
      await tick(30);
      return { wins: wins2.length, focused: d.calls.includes("show") && d.calls.includes("focus"),
        askedPick: d.sent.some(a => a[0] === "etiuda:pick-ask") };
    };
    desk.calls.length = 0; desk.sent.length = 0;
    held.get("Control+Shift+Space")();
    await tick(30);
    const beforeSignin = { wins: wins.length, focused: desk.calls.includes("show") && desk.calls.includes("focus"),
      askedPick: desk.sent.some(a => a[0] === "etiuda:pick-ask") };
    await seatLab.seatDesk(deskAdapter, { none: true });
    desk.calls.length = 0; desk.sent.length = 0;
    held.get("Control+Shift+Space")();
    await tick(30);
    const signedNoSeat = { wins: wins.length, focused: desk.calls.includes("show") && desk.calls.includes("focus"),
      askedPick: desk.sent.some(a => a[0] === "etiuda:pick-ask") };
    check(beforeSignin.wins === 1 && beforeSignin.focused && !beforeSignin.askedPick
      && signedNoSeat.wins === 1 && signedNoSeat.focused && !signedNoSeat.askedPick,
      "2g0 on a desk with no seat (before sign-in or signed in with none), the hotkey brings the desk's own window forward and opens no picker: "
      + JSON.stringify({ beforeSignin, signedNoSeat }));
    if (process.env.ETIUDA_PLANTS === "off") console.log("  SKIP  2g0p lifting plant:pick-works opens a picker on an unseated desk (ETIUDA_PLANTS=off)");
    else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const mainBytes = fs.readFileSync(mainPath);
      const lines = SRC.split("\n");
      const hits = lines.filter(l => l.indexOf("plant:pick-works") >= 0);
      const lifted = lines.filter(l => l.indexOf("plant:pick-works") < 0).join("\n");
      const ctrl = await runUnseated(SRC, "ctrl");
      const planted = hits.length === 1 ? await runUnseated(lifted, "plant") : null;
      const sameFile = fs.readFileSync(mainPath).equals(mainBytes);
      check(hits.length === 1 && ctrl.wins === 1 && ctrl.focused && !ctrl.askedPick
        && !!planted && !planted.focused && (planted.wins > 1 || planted.askedPick) && sameFile,
        "2g0p lifting plant:pick-works lets the hotkey open a picker on a desk with no seat instead of focusing the desk: "
        + JSON.stringify({ hits: hits.length, ctrl, planted, sha: sameFile ? "restored" : "differs" }));
    }
  }
  await seatLab.seatDesk(deskAdapter, { force: true, expectWorks: true });
  globalThis.window.E_HOST = deskPage.E_HOST;
  deskPage.E_HOST.onSignin(v => SGN.signinChanged(v, false));
  SGN.signinNow();

  /* The hotkey, as Windows would call it. */
  ST.lsSet("eAgent", "Kate");
  cursor = { x: 300, y: 200 };
  const opened = [];
  let pw = null, pickerPage = null;
  const pickerOn = {};
  const pickerEvent = () => ({ sender: pw.webContents, senderFrame: { parent: null, url: "data:text/html" }, returnValue: undefined });
  madeAPicker = w => {
    pw = w;
    pickerPage = pageOf("--etiuda-picker", {
      sendSync: () => { throw new Error("the picker's page made a synchronous call"); },
      send: (ch, ...a) => { if (onH[ch]) onH[ch](pickerEvent(), ...a); },
      invoke: (ch, ...a) => Promise.resolve(invH[ch] ? invH[ch](pickerEvent(), ...a) : undefined),
      on: (ch, fn) => { pickerOn[ch] = fn; },
    });
    w.route = (ch, ...a) => { if (pickerOn[ch]) setImmediate(() => pickerOn[ch]({}, ...a)); };
    pickerPage.E_PICK.onOpen(text => { opened.push(JSON.parse(text)); pickerPage.E_PICK.ready(); });
  };
  held.get("Control+Shift+Space")();
  await until(() => !!pw);
  const pickerArgs = pw.opts.webPreferences.additionalArguments || [];
  check(!!pickerPage.E_PICK && !pickerPage.E_HOST && pickerArgs.indexOf("--etiuda-picker") > -1
    && pw.opts.webPreferences.sandbox === true && pw.opts.webPreferences.contextIsolation === true && pw.opts.skipTaskbar === true,
    "2g the picker is a sandboxed window of its own, told so on its command line, and its page gets only the picker's bridge: "
    + "E_PICK " + !!pickerPage.E_PICK + ", E_HOST " + !!pickerPage.E_HOST
    + ", flag " + (pickerArgs.indexOf("--etiuda-picker") > -1)
    + ", sandbox " + pw.opts.webPreferences.sandbox
    + ", contextIsolation " + pw.opts.webPreferences.contextIsolation
    + ", skipTaskbar " + pw.opts.skipTaskbar);
  await until(() => pw.visible && pw.focused);
  const want = SH.pickerPlace(cursor, area, SH.PICK_SIZE);
  check(opened.length === 1 && opened[0].rows.length === 4 && pw.visible && pw.focused
    && pw.calls.indexOf("show") > -1 && JSON.stringify(pw.bounds) === JSON.stringify(want),
    "2h the hotkey fills the picker from the desk's page, puts it by the pointer, and shows it focused only once it has drawn: "
    + "opened " + opened.length + ", rows " + (opened[0] ? opened[0].rows.length : "none")
    + ", visible " + pw.visible + ", focused " + pw.focused
    + ", show " + (pw.calls.indexOf("show") > -1) + ", bounds " + JSON.stringify(pw.bounds));
  check(clipReads === 1, "2h2 that one opening reads the clipboard once: " + clipReads);
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  const secret = "zebraquill please mend the lantern glass today";
  const writesAtSecret = written.length, saidAtSecret = said.length, sentAtSecret = desk.sent.length, readsAtSecret = clipReads;
  clipHeld = secret;
  held.get("Control+Shift+Space")();
  await until(() => opened.length >= 2 && pw.visible);
  const openAsks = desk.sent.slice(sentAtSecret).filter(a => a[0] === "etiuda:pick-ask" && a[2] === "open").map(a => String(a[3] || ""));
  const askedBlob = desk.sent.slice(sentAtSecret).map(a => JSON.stringify(a)).join("\n");
  const openObj = opened[opened.length - 1];
  const kept = written.slice(writesAtSecret).join("\n") + "\n" + said.slice(saidAtSecret).join("\n") + "\n"
    + JSON.stringify(openObj) + "\n" + askedBlob + "\n" + openAsks.join("\n") + "\n" + pw.sent.map(a => JSON.stringify(a)).join("\n");
  check(clipReads === readsAtSecret + 1 && openAsks.indexOf('{"profiles":1}') > -1 && !("profiles" in openObj) && !("suggest" in openObj)
    && kept.indexOf(secret) < 0,
    "2h3 a message is asked for as profiles only, and its text reaches neither the page, a log nor the disk: reads "
    + (clipReads - readsAtSecret) + ", profiles key " + ("profiles" in openObj) + ", suggest key " + ("suggest" in openObj)
    + ", text kept " + (kept.indexOf(secret) > -1));
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  clipHeld = "X7K2P9";
  const sentCode = desk.sent.length, openedCode = opened.length;
  held.get("Control+Shift+Space")();
  await until(() => opened.length > openedCode && pw.visible);
  const codeAsks = desk.sent.slice(sentCode).filter(a => a[0] === "etiuda:pick-ask").map(a => String(a[3] || ""));
  const codeOpen = opened[opened.length - 1];
  check(codeAsks.indexOf("{}") > -1 && !("suggest" in codeOpen) && Object.keys(codeOpen).join(",") === Object.keys(opened[0]).join(","),
    "2h4 a booking code leaves the picker the same shape as the empty open: " + Object.keys(codeOpen).join(","));

  /* Row 2: The strip never suggests from Etiuda's own reply, and counts a message once. */
  const CM_R2 = await import(MOD("content-model.js"));
  const IID_R2 = await import(MOD("intent-id.js"));
  const langsOrig_R2 = CM_R2.CONTENT_LANGS.slice();
  const swEnOrig_R2 = CM_R2.SW_STORE && CM_R2.SW_STORE.en ? CM_R2.SW_STORE.en.slice() : [];
  const intentsOrig_R2 = IID_R2.baseIntentsSnapshot ? IID_R2.baseIntentsSnapshot() : null;
  CM_R2.setContentLangs(["en"]);
  CM_R2.SW_STORE.en.length = 0;
  CM_R2.SW_STORE.en.push("lantern");
  CM_R2.setIntentIds(["wick"]);
  IID_R2.snapshotBaseIntents();
  AS.setCards(CARDS.map(c => Object.assign({}, c, c.id === "c-lamp" ? { requests: ["t:wick"] } : {})));

  clipHeld = secret;
  const opensBeforeR2 = desk.sent.filter(a => a[0] === "etiuda:pick-ask" && a[2] === "suggest-open").length;
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  const opensAfterR2 = desk.sent.filter(a => a[0] === "etiuda:pick-ask" && a[2] === "suggest-open").length;
  const threeOpensCount = opensAfterR2 - opensBeforeR2;

  await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-lamp", vi: 0 }));
  clipHeld = clip[clip.length - 1];
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  const ownOpenObj = opened[opened.length - 1];
  const ownSuggestOpenCalls = desk.sent.filter(a => a[0] === "etiuda:pick-ask" && a[2] === "suggest-open").length - opensAfterR2;
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  check(threeOpensCount === 1 && (!ownOpenObj.suggest || !ownOpenObj.suggest.length) && ownSuggestOpenCalls === 0,
    "6p copy a reply, then open the picker again: no strip, no count. Three opens on one customer message give one count");

  /* 6r etiuda:own-text takes a string within its cap and nothing else. A non-string that would read as a customer's message
     if turned into one, and an over-long string, are not noted: the message still shows its strip, as it would had the page
     never sent them. */
  const fresh6r = secret + " Thank you.";
  onH["etiuda:own-text"](deskEvent(), "x".repeat(300001));
  onH["etiuda:own-text"](deskEvent(), { toString: () => fresh6r });
  clipHeld = fresh6r;
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  const afterBad = opened[opened.length - 1];
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  check(!!(afterBad.suggest && afterBad.suggest.length),
    "6r own-text takes a string within its cap only: after a non-string and a 300,001-character send, a customer's message still"
    + " shows its strip: " + JSON.stringify((afterBad.suggest || []).length));

  /* 6s. Electron 44 on Linux answers clipboard.readText() with a Promise (Claude gamma's Ubuntu walk, 2026-11-09); the
     shell read it as "[object Promise]", so a copied message was never suggested there. The same message, read through a
     Promise, shows its strip. */
  clipAsPromise = true;
  clipHeld = fresh6r + " Again.";
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  const viaPromise = opened[opened.length - 1];
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  clipAsPromise = false;
  check(!!(viaPromise.suggest && viaPromise.suggest.length),
    "6s a clipboard that answers with a Promise, as on Linux, still shows a customer's message its strip: "
    + JSON.stringify((viaPromise.suggest || []).length));

  /* 6t. A clipboard read that never settles must not lock the picker: it opens after the wait with no message strip, and
     opens again on the next press. */
  clipNever = true;
  const t6 = Date.now();
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  const neverOpenMs = Date.now() - t6;
  const neverOpen = opened[opened.length - 1];
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  clipNever = false;
  clipHeld = "";
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  const reopened = pw.visible;
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  check(!(neverOpen.suggest && neverOpen.suggest.length) && reopened && neverOpenMs < 5000,
    "6t a clipboard read that never settles opens the picker after the wait with no strip, and the next press opens it again: "
    + neverOpenMs + " ms, reopened " + reopened);

  /* Row 7: Two presses with an unchanged pack build the model once, counted by a stand-in, and the open's IPC payload is under 1 KB. */
  let modelBuilds = 0;
  if (typeof PICK.setSuggestModelStandIn === "function") {
    PICK.setSuggestModelStandIn(() => { modelBuilds++; });
  }
  clipHeld = "zebraquill please mend the lantern glass today";
  const sentAtRow7 = desk.sent.length;
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  const press1Builds = modelBuilds;
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  const openAnswersRow7 = desk.sent.slice(sentAtRow7).filter(a => a[0] === "etiuda:pick-ask" && a[2] === "open");
  const lastOpenAnswer = openAnswersRow7[openAnswersRow7.length - 1];
  const lastOpenPayload = lastOpenAnswer ? JSON.stringify(lastOpenAnswer).length : 0;
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  check(press1Builds === 1 && modelBuilds === 1 && lastOpenPayload < 1024,
    "6q two presses with an unchanged pack build the model once, counted by a stand-in, and the open's IPC payload is under 1 KB: builds "
    + modelBuilds + ", payload " + lastOpenPayload + "B");

  CM_R2.setContentLangs(langsOrig_R2);
  if (CM_R2.SW_STORE && CM_R2.SW_STORE.en) {
    CM_R2.SW_STORE.en.length = 0;
    swEnOrig_R2.forEach(w => CM_R2.SW_STORE.en.push(w));
  }
  if (intentsOrig_R2) {
    CM_R2.setIntentIds(intentsOrig_R2);
    IID_R2.snapshotBaseIntents();
  }
  AS.setCards(CARDS.map(c => Object.assign({}, c)));

  clipHeld = "";

  const found2 = JSON.parse(await pickerPage.E_PICK.find("brass"));
  check(ids(found2.rows) === "c-sign/0", "2i a query from the picker is answered by the desk's own search: " + ids(found2.rows));

  const whoRes2 = JSON.parse(await pickerPage.E_PICK.who("Jan Kowalski", ""));
  const lampAfterWho2 = deskCopy("c-lamp", 0);
  const deskPax2 = document.getElementById("pax");
  const doc2 = decodeURIComponent(String(pw.url || ""));
  const whoInputInDoc = /<input\s+id="who"[^>]*hidden/.test(doc2);
  const whoKeydown = /key\s*===\s*"Tab"[\s\S]*?who\.focus\(\)/.test(doc2) && /who\.addEventListener\("blur"/.test(doc2);
  check(typeof pickerPage.E_PICK.who === "function" && whoRes2 && whoRes2.who === "" && deskPax2 && deskPax2.value === "Jan Kowalski"
    && lampAfterWho2 && /Jan Kowalski/.test(lampAfterWho2) && !/Anna/.test(lampAfterWho2) && whoInputInDoc && whoKeydown,
    "2I setting the customer name through the picker's bridge fills the desk's name and replies, and #who in the picker is an input: "
    + JSON.stringify([whoRes2 && whoRes2.who, deskPax2 && deskPax2.value, lampAfterWho2 && lampAfterWho2.slice(0, 30)]));
  await pickerPage.E_PICK.who("Anna Nowak", "");

  /* In the picker, clearing and retyping the customer name never wipes the open conversation's
     path and history; only the finished name on Enter reaches the desk. */
  TB.tabs.splice(0, TB.tabs.length);
  ST.ssSet(TB.TAB_KEY, "null");
  TB.initTabs();
  const tb2 = TB.tabs[0];
  deskPax2.value = "Jan Kowalski";
  deskPax2.oninput = () => TB.scheduleTabSave();
  TB.scheduleTabSave();
  TB.tabPathStep("c-lamp", { l: "en", b: 0 });
  const pathBefore = tb2.path.slice(), logLenBefore = tb2.log.length;

  const script2 = (/<script>([\s\S]*?)<\/script>/.exec(doc2) || [])[1] || "";
  const whoEvents = {};
  const whoInputEl = {
    value: "Jan Kowalski", hidden: false, title: "", focus() {},
    addEventListener: (t, fn) => { whoEvents[t] = fn; }
  };
  const qInputEl = {
    value: "", placeholder: "", focus() {}, setAttribute() {},
    addEventListener: () => {}
  };
  const rowsBoxEl = { innerHTML: "", scrollTop: 0, setAttribute() {}, querySelectorAll: () => [], addEventListener: () => {} };
  const pickerDocStandin = {
    getElementById: id => (id === "who" ? whoInputEl : id === "q" ? qInputEl : id === "rows" ? rowsBoxEl : null),
    documentElement: { style: { setProperty() {} }, dataset: {}, classList: { toggle() {} }, lang: "" }
  };
  new Function("window", "document", script2)({
    E_PICK: {
      who: (name, q) => Promise.resolve(JSON.stringify(PICK.answerPick("who", JSON.stringify({ name, q })))),
      find: () => Promise.resolve(JSON.stringify({ rows: [] })),
      close: () => {},
      ready: () => {},
      onOpen: () => {}
    }
  }, pickerDocStandin);

  whoInputEl.value = "";
  if (whoEvents.input) whoEvents.input();
  await tick(10);
  whoInputEl.value = "Janina";
  if (whoEvents.input) whoEvents.input();
  await tick(10);
  if (whoEvents.keydown) whoEvents.keydown({ key: "Enter", preventDefault() {} });
  await tick(10);

  check(tb2.path.length === pathBefore.length && tb2.path[0] === "c-lamp"
    && tb2.log.length === logLenBefore && deskPax2.value === "Janina",
    "2J in the picker, the name is cleared and retyped (input events with an empty value in between), then Enter: the conversation's path and history stay, and the desk's name is the retyped one: "
    + JSON.stringify([tb2.path, tb2.log.length, deskPax2.value]));

  /* The picker's name field shows and sends the desk's own name, #pax's value, whole; never the tab's label. */
  TB.tabs.splice(0, TB.tabs.length);
  ST.ssSet(TB.TAB_KEY, "null");
  TB.initTabs();
  const tb3 = TB.tabs[0];
  deskPax2.value = "Jan Kowalski";
  deskPax2.oninput = () => TB.scheduleTabSave();
  TB.scheduleTabSave();

  let onOpen3 = null;
  const whoEvents3 = {};
  const whoInputEl3 = {
    value: "", hidden: false, title: "", focus() {},
    addEventListener: (t, fn) => { whoEvents3[t] = fn; }
  };
  const qInputEl3 = {
    value: "", placeholder: "", focus() {}, setAttribute() {},
    addEventListener: () => {}
  };
  const rowsBoxEl3 = { innerHTML: "", scrollTop: 0, setAttribute() {}, querySelectorAll: () => [], addEventListener: () => {} };
  const pickerDocStandin3 = {
    getElementById: id => (id === "who" ? whoInputEl3 : id === "q" ? qInputEl3 : id === "rows" ? rowsBoxEl3 : null),
    documentElement: { style: { setProperty() {} }, dataset: {}, classList: { toggle() {} }, lang: "" }
  };
  new Function("window", "document", script2)({
    E_PICK: {
      who: (name, q) => Promise.resolve(JSON.stringify(PICK.answerPick("who", JSON.stringify({ name, q })))),
      find: () => Promise.resolve(JSON.stringify({ rows: [] })),
      close: () => {},
      ready: () => {},
      onOpen: fn => { onOpen3 = fn; }
    }
  }, pickerDocStandin3);

  onOpen3(JSON.stringify(PICK.answerPick("open")));
  const openedValue = whoInputEl3.value;
  whoInputEl3.value = "Jan Kowalsky";
  if (whoEvents3.keydown) whoEvents3.keydown({ key: "Enter", preventDefault() {} });
  await tick(10);

  check(openedValue === "Jan Kowalski" && deskPax2.value === "Jan Kowalsky" && whoInputEl3.value === "Jan Kowalsky",
    "2K the picker's name field shows the desk's own name whole at open and keeping edits on Enter updates the desk: "
    + JSON.stringify([openedValue, deskPax2.value, whoInputEl3.value]));

  deskPax2.value = "Anna Nowak";
  delete deskPax2.oninput;
  TB.tabs.splice(0, TB.tabs.length);

  const expect = deskCopy("c-lamp", 0);
  const copied = await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-lamp", vi: 0 }));
  const lastClip = clip[clip.length - 1];
  const hideAt = pw.calls.lastIndexOf("hide"), blurAt = pw.calls.lastIndexOf("blur");
  check(copied === true && lastClip === SH.pickClipText(expect, process.platform) && !pw.visible,
    "2j Enter puts the desk's own text on the clipboard, in the line ends the desk's copy writes on this platform, and the picker goes");
  check(blurAt > -1 && blurAt < hideAt, "2k it gives the focus up before it hides, so the window underneath takes it back");

  const clips = clip.length;
  const fromDesk = await invH["etiuda:pick-copy"](deskEvent(), JSON.stringify({ id: "c-lamp", vi: 0 }));
  onH["etiuda:pick-answer"](pickerEvent(), 1, JSON.stringify({ text: "planted" }));
  check(fromDesk === false && clip.length === clips, "2l the picker's channels answer the picker's window alone");

  const openedAtSecond = opened.length;
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  check(!pw.visible && opened.length === openedAtSecond + 1, "2m a second press while it stands closes it: visible " + pw.visible + ", opened " + (opened.length - openedAtSecond));

  ST.lsDel("eNameAsked"); ST.lsDel("eAgent");
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  desk.calls.length = 0;
  const sentBefore = desk.sent.length;
  const asked = await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-sign", vi: 0 }));
  const askSent = desk.sent.slice(sentBefore).filter(a => a[0] === "etiuda:pick-ask" && a[2] === "ask");
  check(asked === false && !pw.visible && desk.calls.indexOf("focus") > -1 && clip.length === clips
    && askSent.length === 1 && askSent[0][3] === JSON.stringify({ id: "c-sign", vi: 0 }),
    "2n a reply that needs the agent's name first sends the agent to the desk's own window, asks the desk there, and writes nothing: "
    + "asked " + asked + ", visible " + pw.visible + ", focus " + (desk.calls.indexOf("focus") > -1)
    + ", clip " + clip.length + " of " + clips + ", ask " + (askSent.length ? askSent[0][3] : "never asked"));
  ST.lsSet("eNameAsked", "1");

  /* Clicking away is a blur the shell did not ask for: the picker hides and hands nothing back. */
  held.get("Control+Shift+Space")();
  await until(() => pw.visible && pw.focused);
  const callsAt = pw.calls.length;
  desk.calls.length = 0;
  (pw.on.blur || []).forEach(fn => fn());
  const away = pw.calls.slice(callsAt);
  check(!pw.visible && away.join(" ") === "hide" && desk.calls.indexOf("focus") < 0,
    "2s clicking away hides the picker, and neither gives the focus up again nor calls the desk forward: visible " + pw.visible
    + ", calls " + (away.join(" ") || "nothing") + ", desk focus " + (desk.calls.indexOf("focus") > -1));

  /* B-3a2a step 4: a picker opened before a stop cannot read, copy, paste or reword once the desk stops working;
     closing the picker still works, and the page refuses askDesk directly without reading catalog or bumping stats. */
  {
    held.get("Control+Shift+Space")();
    await until(() => pw.visible);
    SH.__rw.config(() => ({ provider: "openai", endpoint: "", model: "m", key: "k", managed: {} }));
    SH.__rw.result("Reworded before stop.");
    const stopCallsAt = pw.calls.length;
    await deskAdapter.ask("etiuda:signin-out");
    SGN.signinNow();
    const stopCalls = pw.calls.slice(stopCallsAt);
    const hiddenOnStop = pw.visible === false && stopCalls.join(" ") === "hide";
    const asksBefore = desk.sent.filter(a => a[0] === "etiuda:pick-ask").length;
    const clipsBefore = clip.length;
    const caretBefore = caret.runs.length;
    const usesBefore = uses("c-lamp");
    const rFind = JSON.parse(await pickerPage.E_PICK.find("lamp"));
    const rWho = JSON.parse(await pickerPage.E_PICK.who("Jan", "lamp"));
    const rTab = JSON.parse(await pickerPage.E_PICK.tab("tabNext"));
    const rLang = JSON.parse(await pickerPage.E_PICK.lang());
    const rIntent = JSON.parse(await pickerPage.E_PICK.takeSuggest("i-0", false));
    const rRows = JSON.parse(await pickerPage.E_PICK.rowsOf("i-0"));
    const rCopy = await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-lamp", vi: 0 }));
    const rPut = await pickerPage.E_PICK.put();
    const rReword = await pickerPage.E_PICK.reword({ act: "spelling", words: "draft" });
    const asksAfter = desk.sent.filter(a => a[0] === "etiuda:pick-ask").length;
    const emptyList = o => !!o && Array.isArray(o.rows) && o.rows.length === 0 && o.count === "";
    const ipcBlocked = hiddenOnStop && asksAfter === asksBefore && clip.length === clipsBefore
      && caret.runs.length === caretBefore && uses("c-lamp") === usesBefore
      && [rFind, rWho, rTab, rLang, rIntent, rRows].every(emptyList)
      && rCopy === false && rPut === false && !!rReword && rReword.ok === false;
    /* Page side directly: answerPick refuses when deskWorks() is false. */
    const pgFind = pickAnswer("find", { q: "lamp" });
    const pgCopy = pickAnswer("copy", { id: "c-lamp", vi: 0 });
    const pgOpen = pickAnswer("open", {});
    const pageBlocked = emptyList(pgFind) && pgCopy === null && pgOpen === null && uses("c-lamp") === usesBefore;
    /* Close still works while stopped. */
    pickerPage.E_PICK.close();
    const closeWorks = pw.visible === false;
    SH.__rw.config(() => null);
    SH.__rw.result("");
    await seatLab.seatDesk(deskAdapter, { force: true, expectWorks: true });
    SGN.signinNow();
    check(ipcBlocked && pageBlocked && closeWorks,
      "2g1 a picker opened before a stop hides without forcing focus, cannot find, switch, copy, paste or reword once stopped; page refuses askDesk; close still works: "
      + JSON.stringify({ hiddenOnStop, stopCalls, ipcBlocked, pageBlocked, closeWorks, asks: asksAfter - asksBefore, clips: clip.length - clipsBefore }));

    /* B-3a2b check 6: stop push hides a visible picker with hidePicker(false) (no blur), leaves a hidden picker untouched,
       and a working-desk push leaves a visible picker open. */
    const hidAt = pw.calls.length;
    await deskAdapter.ask("etiuda:signin-out");
    const hiddenUnchanged = pw.visible === false && pw.calls.slice(hidAt).length === 0;
    await seatLab.seatDesk(deskAdapter, { force: true, expectWorks: true });
    SGN.signinNow();
    held.get("Control+Shift+Space")();
    await until(() => pw.visible);
    const workAt = pw.calls.length;
    await deskAdapter.ask("etiuda:signin-check");
    const workingUnchanged = pw.visible === true && pw.calls.slice(workAt).length === 0;
    const visAt = pw.calls.length;
    desk.calls.length = 0;
    await deskAdapter.ask("etiuda:signin-out");
    const visCalls = pw.calls.slice(visAt);
    const visHidden = pw.visible === false && visCalls.join(" ") === "hide" && desk.calls.indexOf("focus") < 0;
    const afterFind = JSON.parse(await pickerPage.E_PICK.find("lamp"));
    const afterRefused = emptyList(afterFind);
    if (pw.visible) pickerPage.E_PICK.close();
    await seatLab.seatDesk(deskAdapter, { force: true, expectWorks: true });
    SGN.signinNow();
    check(hiddenUnchanged && workingUnchanged && visHidden && afterRefused,
      "2g2 B-3a2b: stop push hides visible picker with hidePicker(false) without blur and later pick IPC refuses; hidden picker and working desk see no change: "
      + JSON.stringify({ hiddenUnchanged, workingUnchanged, visHidden, visCalls, afterRefused }));

    if (process.env.ETIUDA_PLANTS === "off") {
      console.log("  SKIP  2g1p1 lifting plant:picker-ipc-works lets a stopped picker copy and find (ETIUDA_PLANTS=off)");
      console.log("  SKIP  2g1p2 lifting plant:pick-ask-works lets answerPick return cards while stopped (ETIUDA_PLANTS=off)");
      console.log("  SKIP  2g2p1 lifting plant:stop-hide-picker leaves a visible picker open after stop (ETIUDA_PLANTS=off)");
    } else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const mainBytes = fs.readFileSync(mainPath);
      const mainLines = SRC.split("\n");
      const pIdx = mainLines.findIndex(l => l.indexOf("plant:picker-ipc-works") >= 0);
      let ipcTurned = false;
      if (pIdx >= 0) {
        const plantedLines = mainLines.slice();
        plantedLines.splice(pIdx, 1);
        const udP = path.join(LAB, "picker-ipc-plant");
        fs.mkdirSync(udP, { recursive: true });
        fs.writeFileSync(path.join(udP, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: path.join(LAB, "catalogs") } }), "utf8");
        const winsP = [], onP = {}, invP = {}, clipP = [];
        const mkW = () => {
          const w = { calls: [], sent: [], visible: false, destroyed: false, focused: false, on: {} };
          const wcOnce = {}, wcOn = {};
          const fire = (ev, ...a) => { (wcOnce[ev] || []).splice(0).forEach(fn => fn(...a)); (wcOn[ev] || []).forEach(fn => fn(...a)); };
          w.webContents = anything({ id: winsP.length + 1, send: (...a) => { w.sent.push(a); if (w.route) w.route(...a); },
            on: (ev, fn) => { (wcOn[ev] = wcOn[ev] || []).push(fn); }, once: (ev, fn) => { (wcOnce[ev] = wcOnce[ev] || []).push(fn); },
            setWindowOpenHandler() {}, getURL: () => "" });
          w.self = anything({ webContents: w.webContents, on: (ev, fn) => { (w.on[ev] = w.on[ev] || []).push(fn); }, once() {},
            isDestroyed: () => w.destroyed, isVisible: () => w.visible, isMinimized: () => false, isMaximized: () => false,
            show: () => { w.visible = true; }, focus: () => { w.focused = true; }, hide: () => { w.visible = false; },
            blur() {}, destroy: () => { w.destroyed = true; }, restore() {}, center() {}, setBounds() {}, getBounds: () => ({ x: 0, y: 0, width: 600, height: 424 }),
            loadFile: () => setImmediate(() => fire("did-finish-load")), loadURL: () => setImmediate(() => fire("did-finish-load")) });
          winsP.push(w);
          return w.self;
        };
        const heldP = new Map();
        const elP = Object.assign({}, electron, {
          app: Object.assign({}, electron.app, { getPath: n => (n === "documents" ? DOCS : udP) }),
          ipcMain: { on: (ch, fn) => { onP[ch] = fn; }, handle: (ch, fn) => { invP[ch] = fn; } },
          BrowserWindow: new Proxy(function () {}, { construct: () => mkW(),
            get: (t, k) => k === "fromWebContents" ? () => null : k === "getAllWindows" ? () => winsP.map(x => x.self) : undefined }),
          clipboard: { writeText: t => clipP.push(t), readText: () => "" },
          globalShortcut: { register: (a, fn) => { heldP.set(a, fn); return true; }, unregister: a => heldP.delete(a), unregisterAll: () => heldP.clear(), setSuspended() {} },
          shell: seatLab.labShell(),
        });
        seatLab.withSigninLab(() => new Function("require", "__dirname", "__filename", "module", "exports", "console", plantedLines.join("\n"))(
          n => (n === "electron" ? elP : (n === "node:fs" || n === "fs") ? signinGuard.shellFs : n === "node:child_process" ? cpStub : nodeRequire(n)),
          path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet));
        await until(() => winsP.length > 0 && heldP.has("Control+Shift+Space"), 5000);
        const dP = winsP[0];
        const dEvP = () => ({ sender: dP.webContents, senderFrame: ENGINE, returnValue: undefined });
        dP.route = (ch, n, op, arg) => {
          if (ch === "etiuda:pick-ask") setImmediate(() => onP["etiuda:pick-answer"](dEvP(), n, JSON.stringify(op === "open" ? { rows: [], words: {}, look: {} } : op === "copy" ? { text: "leaked" } : { rows: [{ id: "c-lamp" }], count: "1" })));
        };
        const adP = { ud: udP, sync: (ch, ...a) => { const e = dEvP(); if (onP[ch]) onP[ch](e, ...a); return e.returnValue; },
          ask: (ch, ...a) => Promise.resolve(invP[ch] ? invP[ch](dEvP(), ...a) : undefined) };
        await seatLab.seatDesk(adP, { force: true, expectWorks: true });
        heldP.get("Control+Shift+Space")();
        await until(() => winsP.length > 1, 5000);
        const pW = winsP[1];
        const pEvP = () => ({ sender: pW.webContents, senderFrame: { parent: null, url: "data:text/html" }, returnValue: undefined });
        await adP.ask("etiuda:signin-out");
        const leakedCopy = await invP["etiuda:pick-copy"](pEvP(), JSON.stringify({ id: "c-lamp", vi: 0 }));
        ipcTurned = leakedCopy === true && clipP.length === 1;
      }
      check(pIdx >= 0 && ipcTurned && fs.readFileSync(mainPath).equals(mainBytes),
        "2g1p1 lifting plant:picker-ipc-works lets a stopped picker copy through etiuda:pick-copy: " + JSON.stringify({ hit: pIdx >= 0, ipcTurned }));

      const pickPath = path.join(ROOT, "src", "modules", "pick.js");
      const pickBytes = fs.readFileSync(pickPath);
      const pickLines = pickBytes.toString("utf8").split("\n");
      const pkIdx = pickLines.findIndex(l => l.indexOf("plant:pick-ask-works") >= 0);
      let pkTurned = false;
      if (pkIdx >= 0) {
        const pl = pickLines.slice();
        pl.splice(pkIdx, 1);
        const dirUrl = pathToFileURL(path.join(ROOT, "src", "modules")).href + "/";
        const mod = await import("data:text/javascript;base64," + Buffer.from(pl.join("\n").replace(/from "\.\//g, 'from "' + dirUrl)).toString("base64"));
        SGN.signinChanged({ offered: ["lab"], signedIn: "", works: false, registered: true, online: true }, false);
        const leaked = mod.answerPick("find", JSON.stringify({ q: "lamp" }));
        pkTurned = !!leaked && Array.isArray(leaked.rows) && leaked.rows.length > 0;
        SGN.signinNow();
      }
      check(pkIdx >= 0 && pkTurned && fs.readFileSync(pickPath).equals(pickBytes),
        "2g1p2 lifting plant:pick-ask-works lets answerPick return cards while deskWorks() is false: " + JSON.stringify({ hit: pkIdx >= 0, pkTurned }));

      const hIdx = mainLines.findIndex(l => l.indexOf("plant:stop-hide-picker") >= 0);
      let hideTurned = false;
      if (hIdx >= 0) {
        const plantedLines = mainLines.slice();
        plantedLines.splice(hIdx, 1);
        const udH = path.join(LAB, "picker-hide-plant");
        fs.mkdirSync(udH, { recursive: true });
        fs.writeFileSync(path.join(udH, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: path.join(LAB, "catalogs") } }), "utf8");
        const winsH = [], onH = {}, invH = {};
        const mkWH = () => {
          const w = { calls: [], sent: [], visible: false, destroyed: false, focused: false, on: {} };
          const wcOnce = {}, wcOn = {};
          const fire = (ev, ...a) => { (wcOnce[ev] || []).splice(0).forEach(fn => fn(...a)); (wcOn[ev] || []).forEach(fn => fn(...a)); };
          w.webContents = anything({ id: winsH.length + 1, send: (...a) => { w.sent.push(a); if (w.route) w.route(...a); },
            on: (ev, fn) => { (wcOn[ev] = wcOn[ev] || []).push(fn); }, once: (ev, fn) => { (wcOnce[ev] = wcOnce[ev] || []).push(fn); },
            setWindowOpenHandler() {}, getURL: () => "" });
          w.self = anything({ webContents: w.webContents, on: (ev, fn) => { (w.on[ev] = w.on[ev] || []).push(fn); }, once() {},
            isDestroyed: () => w.destroyed, isVisible: () => w.visible, isMinimized: () => false, isMaximized: () => false,
            show: () => { w.visible = true; }, focus: () => { w.focused = true; }, hide: () => { w.visible = false; },
            blur() {}, destroy: () => { w.destroyed = true; }, restore() {}, center() {}, setBounds() {}, getBounds: () => ({ x: 0, y: 0, width: 600, height: 424 }),
            loadFile: () => setImmediate(() => fire("did-finish-load")), loadURL: () => setImmediate(() => fire("did-finish-load")) });
          winsH.push(w);
          return w.self;
        };
        const heldH = new Map();
        const elH = Object.assign({}, electron, {
          app: Object.assign({}, electron.app, { getPath: n => (n === "documents" ? DOCS : udH) }),
          ipcMain: { on: (ch, fn) => { onH[ch] = fn; }, handle: (ch, fn) => { invH[ch] = fn; } },
          BrowserWindow: new Proxy(function () {}, { construct: () => mkWH(),
            get: (t, k) => k === "fromWebContents" ? () => null : k === "getAllWindows" ? () => winsH.map(x => x.self) : undefined }),
          clipboard: { writeText() {}, readText: () => "" },
          globalShortcut: { register: (a, fn) => { heldH.set(a, fn); return true; }, unregister: a => heldH.delete(a), unregisterAll: () => heldH.clear(), setSuspended() {} },
          shell: seatLab.labShell(),
        });
        seatLab.withSigninLab(() => new Function("require", "__dirname", "__filename", "module", "exports", "console", plantedLines.join("\n"))(
          n => (n === "electron" ? elH : (n === "node:fs" || n === "fs") ? signinGuard.shellFs : n === "node:child_process" ? cpStub : nodeRequire(n)),
          path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet));
        await until(() => winsH.length > 0 && heldH.has("Control+Shift+Space"), 5000);
        const dH = winsH[0];
        const dEvH = () => ({ sender: dH.webContents, senderFrame: ENGINE, returnValue: undefined });
        dH.route = (ch, n, op) => {
          if (ch === "etiuda:pick-ask") setImmediate(() => onH["etiuda:pick-answer"](dEvH(), n, JSON.stringify({ rows: [], words: {}, look: {} })));
        };
        const adH = { ud: udH, sync: (ch, ...a) => { const e = dEvH(); if (onH[ch]) onH[ch](e, ...a); return e.returnValue; },
          ask: (ch, ...a) => Promise.resolve(invH[ch] ? invH[ch](dEvH(), ...a) : undefined) };
        await seatLab.seatDesk(adH, { force: true, expectWorks: true });
        heldH.get("Control+Shift+Space")();
        await until(() => winsH.length > 1 && winsH[1].visible, 5000);
        await adH.ask("etiuda:signin-out");
        hideTurned = winsH[1].visible === true;
      }
      check(hIdx >= 0 && hideTurned && fs.readFileSync(mainPath).equals(mainBytes),
        "2g2p1 lifting plant:stop-hide-picker leaves a visible picker open after stop: " + JSON.stringify({ hit: hIdx >= 0, hideTurned }));
    }
  }

  /* A desk that answers nothing (a card gone, a page mid-reload) leaves the clipboard as it was. */
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  const clipsNow = clip.length;
  const gone = await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-gone", vi: 0 }));
  check(gone === false && clip.length === clipsNow && pw.visible,
    "2t a copy the desk cannot answer writes nothing and leaves the picker standing: gone " + gone
    + ", written " + (clip.length - clipsNow) + ", visible " + pw.visible);
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);

  /* THE CARET. On Windows the press asks the helper which window is in front before the picker shows, and a pick
     has it press Ctrl+V there, started before the picker gives the front up; the reply is on the clipboard either way.
     Elsewhere nothing is run and the agent pastes. */
  const WIN = process.platform === "win32";
  const J = JSON.stringify;
  caret.pickerCalls = () => pw.calls.length;
  const pressHotkey = async () => { held.get("Control+Shift+Space")(); await until(() => pw.visible); };
  const runsOf = (from, verb) => caret.runs.slice(from).filter(r => r.args[0] === verb);
  caret.there = true; caret.front = "4242 " + (process.pid + 1);
  let from = caret.runs.length;
  await pressHotkey();
  const showAt = pw.calls.lastIndexOf("show");
  const whichRuns = runsOf(from, "which");
  const clipsCaret = clip.length;
  const put = await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-lamp", vi: 0 }));
  const pastes = runsOf(from, "paste"), blurAt2 = pw.calls.lastIndexOf("blur");
  check(put === true && clip.length === clipsCaret + 1 && !pw.visible && (WIN
      ? whichRuns.length === 1 && whichRuns[0].at <= showAt && pastes.length === 1 && J(pastes[0].args) === J(["paste", "4242"])
        && pastes[0].at <= blurAt2 && /caret\.exe$/i.test(pastes[0].file) && whichRuns[0].file === pastes[0].file
      : caret.runs.length - from === 0),
    "2w " + (WIN ? "the press asks the caret helper which window is in front before the picker shows, and the pick puts the reply"
      + " on the clipboard and has the helper press Ctrl+V in that window before the picker gives the front up: " + J(caret.runs.slice(from).map(r => r.args))
      : "not Windows: no helper is asked, and the pick puts the reply on the clipboard for the agent to paste"));

  caret.front = "4343 " + process.pid;
  from = caret.runs.length;
  await pressHotkey();
  await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-lamp", vi: 0 }));
  check(runsOf(from, "paste").length === 0 && (!WIN || runsOf(from, "which").length === 1),
    "2x a window of this program's own in front at the press is no target, so nothing is pressed: " + J(caret.runs.slice(from).map(r => r.args)));

  caret.front = "4242 " + (process.pid + 1);
  from = caret.runs.length;
  await pressHotkey();
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  await pressHotkey();
  (pw.on.blur || []).forEach(fn => fn());
  await until(() => !pw.visible);
  check(runsOf(from, "paste").length === 0,
    "2y a picker closed by a second press or by clicking away presses nothing: " + J(caret.runs.slice(from).map(r => r.args)));

  caret.there = false;
  from = caret.runs.length;
  const clipsGone = clip.length;
  await pressHotkey();
  const putGone = await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-lamp", vi: 0 }));
  check(putGone === true && clip.length === clipsGone + 1 && caret.runs.length === from,
    "2z with no helper beside the program nothing is run, and the reply waits on the clipboard as before: " + (caret.runs.length - from) + " run(s)");
  caret.there = true;

  /* 2s1 to 2s4: THE SELECTION FIRST (Quick replies on the selection, Max's ruling 2026-11-15). The helper answers the words
     selected: the picker shows them in its box and suggests from them, the clipboard is not read, and nothing is written to
     it at the press. Nothing selected, a refusal (a password field) or no answer within about 300 ms: the clipboard as
     before. The selected words reach the picker's page and nowhere else: not the desk's page, a log or the disk. */
  {
    const SEL = "zebraquill please mend the lantern glass today. Thank you, Ola.", CLIP = "the kettle brews tea for the guests";
    const opening = async sel => {
      caret.sel = sel; clipHeld = CLIP;
      const r0 = clipReads, c0 = clip.length, o0 = opened.length, w0 = written.length, s0 = said.length, d0 = desk.sent.length, t0 = Date.now();
      held.get("Control+Shift+Space")();
      await until(() => opened.length > o0 && pw.visible, 5000);
      const o = opened[opened.length - 1] || {};
      const ms = Date.now() - t0;
      const ask = desk.sent.slice(d0).filter(a => a[0] === "etiuda:pick-ask" && a[2] === "open").map(a => String(a[3] || ""))[0] || "";
      const elsewhere = written.slice(w0).join("\n") + said.slice(s0).join("\n") + desk.sent.slice(d0).map(a => JSON.stringify(a)).join("\n");
      held.get("Control+Shift+Space")();
      await until(() => !pw.visible);
      return { selected: o.selected || "", asked: ask, reads: clipReads - r0, writes: clip.length - c0, ms,
        leaked: elsewhere.indexOf("lantern glass today. Thank you, Ola.") > -1 };
    };
    caret.there = true;
    const got = await opening(SEL), none = await opening(null), refused = await opening(6), hung = await opening("hang");
    caret.sel = null; clipHeld = "";
    const J2 = JSON.stringify;
    if (WIN) {
      check(got.selected === SEL && got.asked !== "{}" && /profiles|epoch/.test(got.asked) && got.reads === 0 && got.writes === 0 && !got.leaked,
        "2s1 a selection opens the picker on those words and asks the desk for what suggests from a message, read without the clipboard and written nowhere else, and nothing goes on the"
        + " clipboard at the press: " + J2(got));
      check(none.selected === "" && none.reads === 1 && none.writes === 0 && refused.selected === "" && refused.reads === 1 && refused.writes === 0,
        "2s2 nothing selected, or the helper refusing the control, opens on the clipboard as before: " + J2({ none, refused }));
      check(hung.selected === "" && hung.reads === 1 && hung.writes === 0 && hung.ms < 1500,
        "2s3 a helper that does not answer gives way to the clipboard within its wait: " + J2(hung));
    } else {
      check(got.selected === "" && got.reads === 1, "2s1 not Windows: no helper, so the clipboard as before: " + J2(got));
      check(true, "2s2 not Windows: no helper to refuse");
      check(true, "2s3 not Windows: no helper to wait for");
    }
    /* 2s4: the two plants, each run on the function it guards, sliced from shell/main.js: the wait lifted leaves the opening
       waiting on a helper that never answers, and the selection's branch rewritten never uses the words. */
    if (process.env.ETIUDA_PLANTS === "off") console.log("  SKIP  2s4 the selection's two plants (ETIUDA_PLANTS=off)");
    else {
      const decl = (src, name) => { const at = src.indexOf("function " + name + "("); let i = src.indexOf("{", at), d = 0;
        for (; i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}" && --d === 0) break; } return at < 0 ? "" : src.slice(at, i + 1); };
      const SELSRC = decl(SRC, "caretSelection"), TOGGLE = decl(SRC, "pickToggle");
      const waitLine = SELSRC.split("\n").filter(l => l.indexOf("plant:selection-wait") >= 0);
      const lifted = SELSRC.split("\n").filter(l => l.indexOf("plant:selection-wait") < 0).join("\n");
      const runSel = src => new Function("caretTool", "execFile", "MESSAGE_MAX_CHARS", "CARET_SELECTION_MS", src + "\nreturn caretSelection();")(
        () => "caret.exe", () => {}, 1500, 300);
      const settles = p => Promise.race([p.then(() => true), new Promise(r => setTimeout(() => r(false), 1200))]);
      const keptWait = await settles(runSel(SELSRC)), liftedWait = waitLine.length === 1 ? await settles(runSel(lifted)) : true;
      const firstLine = TOGGLE.split("\n").filter(l => l.indexOf("plant:selection-first") >= 0);
      const rewritten = TOGGLE.split("\n").map(l => l.indexOf("plant:selection-first") >= 0 ? l.replace("if (words)", "if (false)") : l).join("\n");
      const runToggle = async src => {
        const calls = [];
        new Function("pickWin", "pickOpening", "theWindow", "hidePickNote", "pickPress", "pickTarget", "caretWhich", "caretSelection",
          "withClipText", "pickWithClip", "hidePicker", "pickTrace", "signinWorksNow", "focusDesk", src + "\npickToggle();")(
          null, false, { isDestroyed: () => false }, () => {}, 0, null,
          () => Promise.resolve(null), () => Promise.resolve({ words: "the words", editable: true, fact: "editable", reason: "" }),
          then => then("the clipboard"),
          (p, w, text, sel, editable) => calls.push([text, sel, editable]), () => {}, () => {}, () => true, () => {});
        await tick(20);
        return calls;
      };
      const kept = await runToggle(TOGGLE), wrong = firstLine.length === 1 ? await runToggle(rewritten) : [["the words", true, true]];
      check(keptWait && !liftedWait && J2(kept) === J2([["the words", true, true]]) && J2(wrong) === J2([["the clipboard", false, null]]),
        "2s4 lifting plant:selection-wait leaves the opening waiting on a silent helper, and rewriting plant:selection-first opens on the"
        + " clipboard over a selection: " + J2({ keptWait, liftedWait, kept, wrong }));
    }
  }

  /* 2e1 to 2e5: WHETHER THOSE WORDS CAN BE EDITED. The helper's first line is the fact. The shell carries it beside the
     words as editable (true, false or null) and appends one trace line: the time, which of the three, and for unknown the
     reason. The stand-in's words are searched for in the trace and are not there. */
  {
    const traceAt = path.join(UD, "pick-trace.txt");
    const traceText = () => fs.existsSync(traceAt) ? fs.readFileSync(traceAt, "utf8") : "";
    const LINE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) quick reply: (read-only|editable|unknown \((no selection|no text pattern|not supported|mixed|contradicted|clipboard|timeout|refused)\))$/;
    const WORD = "quillfern";
    const saidFact = raw => { const line = String(raw || "").replace(/\n$/, ""); const m = LINE.exec(line); return m ? m[2] : "BAD " + JSON.stringify(line); };
    const openFact = async sel => {
      const before = traceText();
      caret.sel = sel; clipHeld = "the kettle brews tea for the guests";
      const r0 = clipReads, o0 = opened.length, t0 = Date.now();
      held.get("Control+Shift+Space")();
      await until(() => opened.length > o0 && pw.visible, 5000);
      const o = opened[opened.length - 1] || {};
      const ms = Date.now() - t0;
      const after = traceText();
      const added = after.startsWith(before) ? after.slice(before.length) : after;
      held.get("Control+Shift+Space")();
      await until(() => !pw.visible);
      return { selected: "selected" in o ? o.selected : "", editable: "editable" in o ? o.editable : "missing",
        reads: clipReads - r0, ms, added };
    };
    if (WIN) {
      const ro = await openFact({ fact: "ro", text: WORD + " read only" });
      const ed = await openFact({ fact: "ed", text: WORD + " can edit" });
      check(ro.editable === false && ro.selected === WORD + " read only" && saidFact(ro.added) === "read-only" && ro.reads === 0
        && ed.editable === true && ed.selected === WORD + " can edit" && saidFact(ed.added) === "editable" && ed.reads === 0
        && traceText().indexOf(WORD) < 0,
        "2e1 a read-only selection and an editable one each open on those words with that fact, and the trace names which, without the words: "
        + JSON.stringify({ ro: { editable: ro.editable, fact: saidFact(ro.added) }, ed: { editable: ed.editable, fact: saidFact(ed.added) } }));
      const mx = await openFact({ fact: "u mixed", text: WORD + " mixed" });
      const ns = await openFact({ fact: "u unsupported", text: WORD + " unsupported" });
      const cx = await openFact({ fact: "u contradicted", text: WORD + " contradicted" });
      check(mx.editable === null && mx.selected === WORD + " mixed" && saidFact(mx.added) === "unknown (mixed)" && mx.reads === 0
        && ns.editable === null && ns.selected === WORD + " unsupported" && saidFact(ns.added) === "unknown (not supported)"
        && cx.editable === null && cx.selected === WORD + " contradicted" && saidFact(cx.added) === "unknown (contradicted)"
        && traceText().indexOf(WORD) < 0,
        "2e2 mixed, unsupported and contradicted keep the words, carry unknown, and the trace names the reason, without the words: "
        + JSON.stringify({ mx: saidFact(mx.added), ns: saidFact(ns.added), cx: saidFact(cx.added) }));
      const e1 = await openFact({ code: 1 }), e2 = await openFact({ code: 2 }), e3 = await openFact({ code: 3 });
      const e6 = await openFact({ code: 6 }), e70 = await openFact({ code: 70 });
      const bad = await openFact({ fact: "guessed", text: WORD + " guessed" }), hang = await openFact("hang");
      check(e1.selected === "" && e1.editable === null && e1.reads === 1 && saidFact(e1.added) === "unknown (no selection)"
        && e2.selected === "" && e2.editable === null && saidFact(e2.added) === "unknown (no selection)"
        && e3.selected === "" && e3.editable === null && e3.reads === 1 && saidFact(e3.added) === "unknown (no text pattern)"
        && e6.selected === "" && e6.editable === null && e6.reads === 1 && saidFact(e6.added) === "unknown (refused)"
        && e70.selected === "" && e70.editable === null && e70.reads === 1 && saidFact(e70.added) === "unknown (clipboard)"
        && bad.selected === "" && bad.editable === null && bad.reads === 1 && saidFact(bad.added) === "unknown (clipboard)"
        && hang.selected === "" && hang.editable === null && hang.reads === 1 && hang.ms < 1500 && saidFact(hang.added) === "unknown (timeout)"
        && traceText().indexOf(WORD) < 0,
        "2e3 no selection, no text pattern, a refusal, a failed helper, a line the shell does not know, and no answer within 300 ms are unknown,"
        + " and the trace names which: " + JSON.stringify({ e1: saidFact(e1.added), e2: saidFact(e2.added), e3: saidFact(e3.added),
          e6: saidFact(e6.added), e70: saidFact(e70.added), bad: saidFact(bad.added), hang: saidFact(hang.added), ms: hang.ms }));
      const text = traceText();
      const lines = text.split("\n").filter(l => l.length);
      const badLines = lines.filter(l => !LINE.test(l));
      const bounds = /const PICK_TRACE_FILE = "pick-trace\.txt", PICK_TRACE_MAX_BYTES = 64 \* 1024, PICK_TRACE_RUN_LINES = 2000;/.test(SRC);
      check(lines.length > 0 && badLines.length === 0 && text.indexOf(WORD) < 0 && text.indexOf("zebraquill") < 0 && bounds,
        "2e4 every trace line is the time and the fact alone, the stand-in's words are not in the file, and the file is kept like the tray's: "
        + lines.length + " line(s), " + badLines.length + " bad, bounds " + bounds);
    } else {
      check(true, "2e1 not Windows: no helper, so the fact is unknown");
      check(true, "2e2 not Windows: no helper to leave a fact unknown");
      check(true, "2e3 not Windows: no helper to refuse or to time out");
      check(true, "2e4 not Windows: no helper, so no trace of a selection");
    }
    caret.sel = null; clipHeld = "";
    if (process.env.ETIUDA_PLANTS === "off") console.log("  NOT RUN  2e5 the editability field's two plants (ETIUDA_PLANTS=off)");
    else {
      const decl = (src, name) => { const at = src.indexOf("function " + name + "("); let i = src.indexOf("{", at), d = 0;
        for (; i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}" && --d === 0) break; } return at < 0 ? "" : src.slice(at, i + 1); };
      const FACT = decl(SRC, "readSelectionFact"), LINEF = decl(SRC, "pickFactLine");
      const fieldHits = FACT.split("\n").filter(l => l.indexOf("plant:editable-field") >= 0);
      const factMut = FACT.replace("editable: false", "editable: null");
      const runFact = src => src ? new Function("MESSAGE_MAX_CHARS", src + "\nreturn readSelectionFact;")(1500) : () => null;
      const keptF = FACT ? runFact(FACT)("ro\n" + WORD) : null;
      const turnedF = fieldHits.length === 1 && factMut !== FACT ? runFact(factMut)("ro\n" + WORD) : null;
      const from = 'const allowed = reason === "no selection" || reason === "no text pattern" || reason === "not supported" || reason === "mixed" || reason === "contradicted" || reason === "clipboard" || reason === "timeout" || reason === "refused"; /* plant:editable-trace */';
      const traceHits = LINEF.split("\n").filter(l => l.indexOf("plant:editable-trace") >= 0);
      const lineMut = LINEF.replace(from, 'const allowed = true; /* plant:editable-trace */');
      const runLine = src => src ? new Function(src + "\nreturn pickFactLine;")() : () => "";
      const keptL = LINEF ? runLine(LINEF)("unknown", WORD) : "";
      const leaked = traceHits.length === 1 && lineMut !== LINEF ? runLine(lineMut)("unknown", WORD) : "";
      check(fieldHits.length === 1 && keptF && keptF.editable === false && keptF.words === WORD
        && turnedF && turnedF.editable === null && turnedF.words === WORD
        && traceHits.length === 1 && keptL === "unknown (clipboard)" && leaked.indexOf(WORD) >= 0,
        "2e5 rewriting plant:editable-field reports a read-only selection as unknown, and rewriting plant:editable-trace lets the reason carry the words: "
        + JSON.stringify({ field: fieldHits.length, kept: keptF && keptF.editable, turned: turnedF && turnedF.editable, trace: traceHits.length, keptL, leaked }));
    }
  }

  /* NO KEY READS THE CLIPBOARD. Alt+V is pressed on both windows as Electron delivers a key: nothing is read,
     no channel the shell opens is the clipboard's, and neither page's bridge offers a read. Openings read once
     each, above; this sweep must not add another. */
  const readsAtSweep = clipReads;
  const ALT_V = { type: "keyDown", alt: true, control: false, meta: false, shift: false, code: "KeyV", isAutoRepeat: false };
  desk.fire("before-input-event", {}, ALT_V);
  pw.fire("before-input-event", {}, ALT_V);
  /* Every registered handler is then called, once for each window, so a read armed by the press and paid out
     under any name shows in clipReads; a handler that throws or hangs on empty arguments has read nothing. */
  for (const ch of Object.keys(invH)) for (const ev of [deskEvent(), pickerEvent()])
    await Promise.race([Promise.resolve().then(() => invH[ch](ev)).catch(() => {}), tick(40)]);
  const clipDoors = Object.keys(invH).concat(Object.keys(onH)).filter(ch => /clip/i.test(ch));
  const clipVerbs = Object.keys(deskPage.E_HOST).concat(Object.keys(pickerPage.E_PICK)).filter(k => /clip/i.test(k));
  check(clipReads === readsAtSweep && clipDoors.length === 0 && clipVerbs.length === 0,
    "2v Alt+V on the desk's window and in the picker reads nothing, no channel is the clipboard's, and neither page is given a read: "
    + JSON.stringify({ reads: clipReads, channels: clipDoors, verbs: clipVerbs }));

  /* ---- 7, THE SHELL'S HALF (board 901), run here while the shell stands: the word after a pick, said where the
     picker stood in a window that takes neither the focus nor a click; the desk's own door; and Shift+Enter. ---- */
  {
    const notes = () => wins.filter(w => w.opts && w.opts.focusable === false && !w.destroyed);
    const noteDoc = w => decodeURIComponent(String(w.url || "").replace(/^data:text\/html;charset=utf-8,/, ""));
    const said = pickAnswer("open").words;
    const noteSays = w => (/<\/svg>([^<]*)<\/body>/.exec(noteDoc(w)) || [])[1] || "";
    /* 2v called every handler with nothing, which turned the hotkey off, toggled the language and signed out; all are restored. */
    await deskPage.E_HOST.setHotkey("Control+Shift+Space");
    AS.putLang("en");
    LS.cancelLangTail();
    await seatLab.seatDesk(deskAdapter, { force: true, expectWorks: true });
    SGN.signinNow();
    caret.there = true; caret.front = "4242 " + (process.pid + 1); caret.fail = false;
    await pressHotkey();
    const placed = Object.assign({}, pw.bounds);
    await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-lamp", vi: 0 }));
    await until(() => notes().length === 1 && notes()[0].visible);
    const nw = notes()[0] || { opts: {}, calls: [] };
    const first = noteSays(nw), doc = noteDoc(nw);
    const policy = (/Content-Security-Policy" content="([^"]*)"/.exec(doc) || [])[1] || "";
    check(nw.visible && nw.opts.focusable === false && nw.opts.transparent === true && nw.opts.alwaysOnTop === true && nw.ignore === true
      && nw.calls.indexOf("showInactive") > -1 && nw.calls.indexOf("show") < 0 && nw.calls.indexOf("focus") < 0 && !nw.focused
      && !!nw.bounds && nw.bounds.x === placed.x && nw.bounds.y === placed.y && first === (WIN ? said.pasted : said.copied)
      && /default-src 'none'/.test(policy) && /script-src 'none'/.test(policy) && !/<script/.test(doc),
      "7i a pick says what it did where the picker stood, in a window that takes neither the focus nor a click and runs no script: \""
      + first + "\" at " + JSON.stringify(nw.bounds && { x: nw.bounds.x, y: nw.bounds.y }) + (WIN ? ", the helper having pressed Ctrl+V" : ", no helper here")
      + " " + JSON.stringify({
        visible: nw.visible, focusable: nw.opts.focusable, transparent: nw.opts.transparent, alwaysOnTop: nw.opts.alwaysOnTop,
        ignore: nw.ignore, showInactive: nw.calls.indexOf("showInactive") > -1, show: nw.calls.indexOf("show") > -1,
        focusCall: nw.calls.indexOf("focus") > -1, focused: nw.focused,
        x: nw.bounds && nw.bounds.x, y: nw.bounds && nw.bounds.y, placedX: placed.x, placedY: placed.y,
        word: first, want: WIN ? said.pasted : said.copied,
        defaultSrc: /default-src 'none'/.test(policy), scriptSrc: /script-src 'none'/.test(policy), script: /<script/.test(doc)
      }));

    caret.fail = true;
    await pressHotkey();
    const hidAtPress = !nw.visible;
    await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-lamp", vi: 0 }));
    await until(() => nw.visible);
    const refused = noteSays(nw);
    caret.fail = false; caret.there = false;
    await pressHotkey();
    await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-lamp", vi: 0 }));
    await until(() => nw.visible);
    const absent = noteSays(nw);
    caret.there = true;
    check(hidAtPress && refused === said.copied && absent === said.copied && said.copied === "Copied, press Ctrl+V" && notes().length === 1,
      "7j where the helper could not press Ctrl+V, or there is none, the word is that the reply waits for Ctrl+V; a new press takes"
      + " the last word down first, and one window says them all: " + JSON.stringify([refused, absent, hidAtPress, notes().length]));

    if (pw.visible) { held.get("Control+Shift+Space")(); await until(() => !pw.visible); }
    const opensBefore = opened.length;
    onH["etiuda:pick-show"](pickerEvent());
    await tick(20);
    const fromPickerSelf = pw.visible;
    onH["etiuda:pick-show"](deskEvent());
    await until(() => pw.visible && pw.focused);
    const fromDesk = pw.visible && opened.length === opensBefore + 1;
    onH["etiuda:pick-show"](deskEvent());
    await tick(20);
    check(!fromPickerSelf && fromDesk && pw.visible && opened.length === opensBefore + 1 && typeof deskPage.E_HOST.openPicker === "function"
      && !pickerPage.E_PICK.openPicker,
      "7k the desk's own door opens the picker by the pointer as the hotkey does, and a second knock leaves it standing; the picker's"
      + " page cannot knock: " + JSON.stringify({
        fromPicker: fromPickerSelf, fromDesk: fromDesk, visible: pw.visible, opened: opened.length - opensBefore,
        deskDoor: typeof deskPage.E_HOST.openPicker, pickerDoor: !!pickerPage.E_PICK.openPicker
      }));

    AS.setCards(CARDS.map(c => Object.assign({}, c)).concat([{ id: "c-kettle", c: "orders", t: "Kettle", alt: 1,
      en: "{GREET} {PAX},\nThe kettle leaves on Monday.\n\nThe kettle leaves on Friday.", pl: "Kettle words in the second language." }]));
    const wantOther = deskCopyOther("c-kettle", 0);
    const sentAt = desk.sent.length, clipAt = clip.length;
    const tookOther = await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-kettle", vi: 0, other: 1 }));
    const askedOther = desk.sent.slice(sentAt).filter(a => a[0] === "etiuda:pick-ask" && a[2] === "copy").map(a => a[3]);
    check(tookOther === true && clip.length === clipAt + 1 && clip[clip.length - 1] === SH.pickClipText(wantOther, process.platform)
      && /second language/.test(wantOther) && askedOther.join() === JSON.stringify({ id: "c-kettle", vi: 0, other: 1 }),
      "7l Shift+Enter in the picker puts the desk's own Shift+Enter copy on the clipboard, the shell asking the desk for the other"
      + " language: " + askedOther.join());
    AS.setCards(CARDS.map(c => Object.assign({}, c)));
  }

  /* 7rw1 to 7rw5: ENTER AFTER A REWORD, the second ending. The shell offers the foot only while a configuration is in force and
     keeps the last result an opening asked for; Enter puts it on the clipboard, the picker steps aside, and the helper reads the
     selection again as at the opening: the same words still selected, its one key is pressed; otherwise the result waits on the
     clipboard and the note says so. No model is asked: the configuration and the result go in through the test's own door. */
  {
    const notes = () => wins.filter(w => w.opts && w.opts.focusable === false && !w.destroyed);
    const noteDoc = w => decodeURIComponent(String(w.url || "").replace(/^data:text\/html;charset=utf-8,/, ""));
    const noteSays = w => (/<\/svg>([^<]*)<\/body>/.exec(noteDoc(w)) || [])[1] || "";
    const words = pickAnswer("open").words;
    const RW_SEL = "hi sorry for late reply, we check your order tomorow", RW_OUT = "Hi, sorry for the late reply.\nWe will check it tomorrow.";
    const putRun = async (atOpen, atPut, result, config) => {
      SH.__rw.config(() => config === undefined ? { provider: "openai", endpoint: "https://api.openai.com/v1/", model: "m", key: "k", managed: {} } : config);
      caret.there = true; caret.front = "4242 " + (process.pid + 1); caret.fail = false; caret.sel = atOpen; clipHeld = "";
      if (pw.visible) { held.get("Control+Shift+Space")(); await until(() => !pw.visible); }
      const o0 = opened.length;
      held.get("Control+Shift+Space")();
      await until(() => opened.length > o0 && pw.visible, 5000);
      const o = opened[opened.length - 1] || {};
      if (result) SH.__rw.result(result);
      caret.sel = atPut;
      const r0 = caret.runs.length, c0 = clip.length;
      const got = await pickerPage.E_PICK.put();
      await tick(30);
      const nw = notes()[0];
      return { offered: o.reword || null, got, runs: caret.runs.slice(r0).map(r => r.args.join(" ")), clip: clip.slice(c0), hidden: !pw.visible,
        note: nw && nw.visible ? noteSays(nw) : "" };
    };
    const same = await putRun(RW_SEL, RW_SEL, RW_OUT), moved = await putRun(RW_SEL, "a customer's message", RW_OUT);
    const fromClip = await putRun(null, RW_SEL, RW_OUT), empty = await putRun(RW_SEL, RW_SEL, ""), off = await putRun(RW_SEL, RW_SEL, "", null);
    SH.__rw.config(() => null);
    caret.sel = null;
    const wantClip = SH.pickClipText(RW_OUT, process.platform);
    if (WIN) {
      check(same.offered && same.offered.host === "api.openai.com" && same.got === true && JSON.stringify(same.runs) === JSON.stringify(["selection", "paste 4242"])
        && JSON.stringify(same.clip) === JSON.stringify([wantClip]) && same.hidden && same.note === words.pasted,
        "7rw1 the same words still selected: the result goes on the clipboard, the picker steps aside, the selection is read again and the one key"
        + " pressed, and the note says it was pasted: " + JSON.stringify(same));
      check(moved.got === false && JSON.stringify(moved.runs) === JSON.stringify(["selection"]) && JSON.stringify(moved.clip) === JSON.stringify([wantClip])
        && moved.hidden && moved.note === words.copied,
        "7rw2 another selection by then: nothing is pressed, the result waits on the clipboard, and the note says so in the desk's own words: " + JSON.stringify(moved));
    } else {
      check(same.got === false && same.runs.length === 0 && JSON.stringify(same.clip) === JSON.stringify([wantClip]), "7rw1 not Windows: no helper, the result on the clipboard: " + JSON.stringify(same));
      check(true, "7rw2 not Windows: no selection to read again");
    }
    check(fromClip.got === false && fromClip.runs.filter(r => r === "selection" || r.indexOf("paste") === 0).length === 0
      && fromClip.runs.indexOf("paste 4242") < 0 && JSON.stringify(fromClip.clip) === JSON.stringify([wantClip]) && fromClip.note === words.copied,
      "7rw3 an opening on the clipboard, nothing selected, reads no selection at Enter and presses nothing: the result waits on the clipboard: " + JSON.stringify(fromClip));
    check(empty.got === false && empty.clip.length === 0 && empty.runs.filter(r => r !== "which" && r !== "selection").length === 0
      && off.offered === null && off.got === false && off.clip.length === 0,
      "7rw4 with no result kept nothing is written or pressed, and without a configuration the foot is not offered: " + JSON.stringify({ empty, off: off.offered }));
    if (process.env.ETIUDA_PLANTS === "off") console.log("  SKIP  7rw5 plant:reword-put-same (ETIUDA_PLANTS=off)");
    else {
      /* The handler alone, sliced from shell/main.js and run on stand-ins, with the same-words test rewritten to always. */
      const at = SRC.indexOf('ipcMain.handle("etiuda:pick-put", (e) => {'), end = SRC.indexOf("\n});\n", at);
      const body = at < 0 || end < 0 ? "" : SRC.slice(SRC.indexOf("{", at) + 1, end);
      const runPut = async src => {
        const ran = [];
        const fn = new Function("e", "fromPicker", "pickerWorks", "pickReworded", "pickClipText", "pickSelectedNow", "pickTarget", "noteOwnText", "clipboard", "hidePicker",
          "showPickNote", "REWORD_PUT_WAIT_MS", "caretSelection", "caretPaste", src);
        const got = await fn({}, () => true, () => true, RW_OUT, t => t, RW_SEL, "4242", () => {}, { writeText: () => ran.push("write") }, () => ran.push("hide"),
          p => ran.push("note " + p), 1, () => Promise.resolve({ words: "a customer's message" }), () => ran.push("paste"));
        return { got, ran };
      };
      const lines = body.split("\n").filter(l => l.indexOf("plant:reword-put-same") >= 0);
      const kept = await runPut(body), planted = await runPut(body.split("\n").map(l => l.indexOf("plant:reword-put-same") >= 0 ? "    const same = true;" : l).join("\n"));
      check(lines.length === 1 && kept.ran.indexOf("paste") < 0 && planted.ran.indexOf("paste") > -1,
        "7rw5 with plant:reword-put-same rewritten to always, another selection is pasted over and 7rw2 would be red: " + JSON.stringify({ kept, planted }));
    }
  }

  cursor = { x: 1900, y: 1000 };
  const edge = SH.pickerPlace(cursor, area, SH.PICK_SIZE), small = SH.pickerPlace({ x: 10, y: 10 }, { x: 0, y: 0, width: 400, height: 300 }, SH.PICK_SIZE);
  check(edge.x + edge.width <= 1920 && edge.y + edge.height <= 1000 - 18 && edge.y >= 0 && small.width === 400 && small.height === 300,
    "2o at the screen's corner it opens above the pointer and inside the work area, and a small screen shrinks it: "
    + JSON.stringify(edge) + " " + JSON.stringify(small));
  check(SH.pickClipText("a\nb\r\nc", "win32") === "a\r\nb\r\nc" && SH.pickClipText("a\nb", "linux") === "a\nb",
    "2p the line ends are Windows' pair there and left alone elsewhere");
  /* The tour's step in the window: taller by the bubble's room, grown upwards so the rows stay where they opened, and held
     inside the work area where there is no room above. */
  const opened2q = { x: 300, y: 500, width: 600, height: 424 }, wa = { x: 0, y: 0, width: 1920, height: 1040 };
  const grown = SH.pickerGrow(opened2q, 188, wa), high = SH.pickerGrow({ x: 300, y: 40, width: 600, height: 424 }, 188, wa),
    tiny = SH.pickerGrow({ x: 0, y: 0, width: 400, height: 300 }, 188, { x: 0, y: 0, width: 400, height: 300 });
  check(grown.y === 312 && grown.height === 612 && grown.y + grown.height === opened2q.y + opened2q.height && grown.x === 300 && grown.width === 600
    && high.y === 0 && high.height === 612 && tiny.height === 300 && tiny.y === 0,
    "2p2 while the tour's step stands in it the window grows upwards by the bubble's room, its rows where they opened, inside the work area: "
    + JSON.stringify([grown, high, tiny]));

  /* The folder the shell takes for its app root is the lab's copy, and the checkout's own root is
     never listed, so no file a checkout happens to hold there can reach the boot. */
  const appListed = listed.includes(path.resolve(APP).toLowerCase()), rootListed = listed.includes(path.resolve(ROOT).toLowerCase());
  check(appListed && !rootListed,
    "2u the app root the shell lists is the lab's own, and the checkout's root is never listed: app root listed "
    + appListed + ", checkout root listed " + rootListed);

  desk.on.closed.forEach(fn => fn());
  check(pw.destroyed, "2q the picker goes with the desk's window, so the app can quit");

  /* ---- 3. what the page is ---------------------------------------------------------------- */
  console.log("\n[3/7] the picker's page");
  const doc = decodeURIComponent(String(pw.url || "").replace(/^data:text\/html;charset=utf-8,/, ""));
  const script = (/<script>([\s\S]*?)<\/script>/.exec(doc) || [])[1] || "";
  const hash = "'sha256-" + nodeRequire("node:crypto").createHash("sha256").update(script, "utf8").digest("base64") + "'";
  const policy = (/Content-Security-Policy" content="([^"]*)"/.exec(doc) || [])[1] || "";
  check(/default-src 'none'/.test(policy) && policy.indexOf("script-src " + hash) > -1 && (doc.match(/<script/g) || []).length === 1,
    "3a the page runs one script, the one its policy names by hash, and reaches nothing else");
  check(!/\b(require|process|ipcRenderer)\b/.test(script) && /window\.E_PICK/.test(script),
    "3b that script speaks to the shell through E_PICK alone");
  check(/\.on\{background:color-mix\(in srgb,var\(--accent\) 20%,transparent\)\}/.test(doc) && /forced-colors:active/.test(doc)
    && /prefers-reduced-motion/.test(doc),
    "3c the marked row wears the desk's mark, and high contrast and reduced motion are answered");
  /* The list scrolls inside the picker rather than growing past it or cutting its last rows off: the first #rows rule, the
     list itself, shrinks in its column and scrolls up and down, and no shorthand in it hides the overflow. */
  const rowsRule = (/#rows\{([^}]*)\}/.exec(doc) || [])[1] || "";
  check(/(^|;)min-height:0(;|$)/.test(rowsRule) && /(^|;)overflow-y:auto(;|$)/.test(rowsRule) && !/(^|;)overflow:/.test(rowsRule),
    "3d the list scrolls inside the picker, its rule shrinking in the column and scrolling up and down with no overflow"
    + " shorthand to hide it: " + JSON.stringify(rowsRule));

  /* ---- 4. the page's own script, run ---------------------------------------------------- */
  console.log("\n[4/7] the picker's page, its script run over a stand-in of its two elements");
  const pageL = {};
  const qEl = { value: "", placeholder: "", focus() {}, setAttribute() {}, addEventListener: (t, fn) => { pageL["q:" + t] = fn; } };
  let boxHtml = "";
  const boxEl = { set innerHTML(v) { boxHtml = v; }, get innerHTML() { return boxHtml; }, setAttribute() {}, querySelectorAll: () => [],
    addEventListener: (t, fn) => { pageL["box:" + t] = fn; } };
  const pcalls = [];
  let pOpen = null, pFound = [];
  const pWin = { E_PICK: { find: () => Promise.resolve(JSON.stringify({ rows: pFound })),
    copy: s => { pcalls.push("copy " + s); }, close: () => { pcalls.push("close"); }, ready: () => {}, onOpen: fn => { pOpen = fn; } } };
  const pDoc = { getElementById: id => (id === "q" ? qEl : id === "rows" ? boxEl : null),
    documentElement: { style: { setProperty() {} }, dataset: {}, classList: { toggle() {} }, lang: "" } };
  new Function("window", "document", script)(pWin, pDoc);
  check(typeof pOpen === "function" && typeof pageL["q:keydown"] === "function" && typeof pageL["box:click"] === "function",
    "4a the page's script, run as its document carries it, listens to its box and its rows");
  const R = id => ({ id: id, vi: 0, t: "T " + id, x: "x", tag: "" });
  const pRows = [R("a"), R("b"), R("c")];
  const press = (k, code, ctrl) => { let prevented = false;
    pageL["q:keydown"]({ key: k, code: code || "", ctrlKey: !!ctrl, altKey: false, metaKey: false, preventDefault: () => { prevented = true; } });
    return prevented; };
  const lastCall = () => pcalls[pcalls.length - 1] || "nothing";
  const reopen = () => { pcalls.length = 0; qEl.value = ""; pOpen(JSON.stringify({ rows: pRows, last: R("b"), words: { again: "again" } })); };
  reopen();
  check(/^<li[^>]*id="r0"[^>]*title="again"/.test(boxHtml) && /<li[^>]*id="r1"[^>]*class="on"/.test(boxHtml),
    "4b at rest the reply copied last is the first row, and the row after it is marked");
  press("Enter", "Enter");
  check(lastCall() === 'copy {"id":"a","vi":0}', "4c Enter at rest copies the row marked, the row after the reply copied last: " + lastCall());
  reopen(); press("ArrowDown", "ArrowDown"); press("Enter", "Enter");
  check(lastCall() === 'copy {"id":"c","vi":0}', "4d a step down and Enter copies the row marked: " + lastCall());
  reopen(); press("1", "Digit1", true);
  check(lastCall() === 'copy {"id":"a","vi":0}', "4e Ctrl+1 copies the row numbered 1: " + lastCall());
  reopen(); press("2", "Numpad2", true);
  check(lastCall() === 'copy {"id":"c","vi":0}', "4f Ctrl+2 copies the row numbered 2, the reply copied last taking no number: " + lastCall());
  reopen(); press("ArrowDown", "ArrowDown"); press("ArrowDown", "ArrowDown"); press("0", "Digit0", true);
  check(lastCall() === 'copy {"last":true}', "4g Ctrl+0 copies the reply copied last wherever the mark is: " + lastCall());
  reopen(); press("Escape", "Escape");
  check(lastCall() === "close" && pcalls.length === 1, "4h Escape closes and copies nothing: " + pcalls.join(" | "));
  reopen();
  check(press("Tab", "Tab") && pcalls.length === 0, "4i Tab stays in the box and copies nothing");
  reopen(); press("1", "Digit1", false);
  check(pcalls.length === 0, "4j a digit without Control is typed, and copies nothing");
  reopen(); press("ArrowUp", "ArrowUp"); press("Enter", "Enter");
  check(lastCall() === 'copy {"last":true}', "4k a step up from the marked row moves to the reply copied last: " + lastCall());
  /* The other end of the same ring (board 818): as many steps down as there are rows comes back to the first, the reply
     copied last. A list that stopped at its last row would copy that row instead. */
  reopen();
  const shownRows = (boxHtml.match(/<li\b/g) || []).length;
  for (let i = 0; i < shownRows; i++) press("ArrowDown", "ArrowDown");
  press("Enter", "Enter");
  check(shownRows === 3 && lastCall() === 'copy {"id":"a","vi":0}',
    "4n a full turn down wraps back to the marked row: " + shownRows + " row(s), " + shownRows + " step(s) down, then " + lastCall());
  reopen();
  pageL["box:click"]({ target: { closest: () => ({ dataset: { i: "1" } }) } });
  check(lastCall() === 'copy {"id":"a","vi":0}', "4l a click on a row copies that row: " + lastCall());

  /* 4s1 to 4s4: THE WORDS SELECTED ON THE SCREEN (Quick replies on the selection). The page is run again over a stand-in that
     also holds the note under the box. The words stand in the box with the note, and the box counts as at rest while they do:
     the strip of what the shell suggested for them stands as for a copied message (a step up from the first row reaches it,
     and Enter takes it, the agent's act), and nothing is searched or taken by itself. Typing over them hides the note and
     searches what is typed. 4s4 changes each of the two plants in a copy of the script and expects its leg red. */
  let runSelPage = null;
  {
    const SEL = "my parcel has not arrived and the tracking says nothing";
    const runSel = async (scriptText, o, h) => {
      const L = {}, q2 = { value: "", placeholder: "", focus() {}, setAttribute() {}, addEventListener: (t, fn) => { L[t] = fn; } };
      let html = "";
      const box2 = { set innerHTML(v) { html = v; }, get innerHTML() { return html; }, setAttribute() {}, querySelectorAll: () => [], addEventListener() {} };
      const note = { hidden: true, textContent: "" };
      const calls = [], looked = [];
      let onOpen = null;
      const W = { E_PICK: {
        rowsOf: id => { looked.push(id); return Promise.resolve(JSON.stringify(h && h.rowsOf ? h.rowsOf(id) : { rows: [R("rows-" + id)], count: "1 reply" })); },
        find: qy => { calls.push("find " + qy); return Promise.resolve(JSON.stringify({ rows: [R("found")] })); },
        takeSuggest: id => { calls.push("take " + id); return Promise.resolve(JSON.stringify({ rows: [R("s1")] })); },
        copy: w => { calls.push("copy " + w); }, close() {}, ready() {}, onOpen: fn => { onOpen = fn; } } };
      const D = { getElementById: id => (id === "q" ? q2 : id === "rows" ? box2 : id === "sel" ? note : null),
        documentElement: { style: { setProperty() {} }, dataset: {}, classList: { toggle() {} }, lang: "" } };
      new Function("window", "document", scriptText)(W, D);
      const key = k => L.keydown({ key: k, code: k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, preventDefault() {} });
      onOpen(JSON.stringify(Object.assign({ rows: pRows, words: { selected: "The words you selected. Type to change them.", none: "none" } }, o)));
      await tick(5);
      const opened = { box: q2.value, note: note.hidden ? "" : note.textContent, calls: calls.slice(), looked: looked.slice(), html: html };
      if (h && h.stop) { await tick(5); return { opened, key, calls, looked, html: () => html, tick5: () => tick(5) }; }
      key("ArrowUp"); key("Enter");
      await tick(5);
      const stepped = calls.slice(opened.calls.length);
      onOpen(JSON.stringify(Object.assign({ rows: pRows, words: { selected: "The words you selected. Type to change them." } }, o)));
      await tick(5);
      const c0 = calls.length;
      q2.value = SEL + " please";
      if (L.input) L.input();
      await tick(5);
      key("ArrowUp"); key("Enter");
      await tick(5);
      return { opened, stepped, edited: { note: note.hidden ? "" : note.textContent, calls: calls.slice(c0) } };
    };
    runSelPage = runSel;
    const SUGGEST = [{ id: "t:post", name: "Post" }, { id: "t:lamp", name: "Lamps" }];
    const withSel = await runSel(script, { selected: SEL, suggest: SUGGEST });
    const plain = await runSel(script, {});
    const J3 = JSON.stringify;
    check(withSel.opened.box === SEL && withSel.opened.note === "The words you selected. Type to change them." && withSel.opened.calls.length === 0,
      "4s1 the words selected stand in the box with the note under it, and nothing is searched or taken by itself: " + J3(withSel.opened));
    check(J3(withSel.stepped) === J3(["take t:lamp"]),
      "4s2 while they stand, the strip of what the shell suggested for them is there: a step up from the first row and Enter take it: " + J3(withSel.stepped));
    check(withSel.edited.note === "" && withSel.edited.calls[0] === "find " + SEL + " please" && withSel.edited.calls.indexOf("take t:lamp") < 0
      && plain.opened.box === "" && plain.opened.note === "",
      "4s3 typing over the words hides the note and searches what is typed, the strip gone; an opening on no selection has an empty box and"
      + " no note: " + J3({ edited: withSel.edited, plain: plain.opened }));
    if (process.env.ETIUDA_PLANTS === "off") console.log("  SKIP  4s4 the page's two plants (ETIUDA_PLANTS=off)");
    else {
      const lines = script.split("\n");
      const marks = ["pick-selected-box", "pick-selected-rest"].map(tag => lines.filter(l => l.indexOf("plant:" + tag) >= 0).length);
      const noBox = lines.filter(l => l.indexOf("plant:pick-selected-box") < 0).join("\n");
      const from = " || (!!chosen && q.value === chosen)";
      const noRest = lines.map(l => (l.indexOf("plant:pick-selected-rest") >= 0 ? l.replace(from, "") : l)).join("\n");
      const b1 = await runSel(noBox, { selected: SEL, suggest: SUGGEST }), b2 = await runSel(noRest, { selected: SEL, suggest: SUGGEST });
      check(J3(marks) === "[1,1]" && noRest !== script && b1.opened.box === "" && J3(b2.stepped) !== J3(["take t:lamp"]),
        "4s4 lifting plant:pick-selected-box leaves the box empty, and rewriting plant:pick-selected-rest hides the strip behind the words: "
        + J3({ marks, box: b1.opened.box, stepped: b2.stepped }));
    }
    const sameFace = (a, b) => a.opened.box === b.opened.box && a.opened.note === b.opened.note
      && J3(a.stepped) === J3(b.stepped) && J3(a.edited) === J3(b.edited);
    const onEdit = await runSel(script, { selected: SEL, suggest: SUGGEST, editable: true });
    const offEdit = await runSel(script, { selected: SEL, suggest: SUGGEST, editable: false });
    const unkEdit = await runSel(script, { selected: SEL, suggest: SUGGEST, editable: null });
    const holds = /let mayEdit = null;/.test(script)
      && /mayEdit = o\.editable === true \? true : o\.editable === false \? false : null;/.test(script);
    check(withSel.opened.box === onEdit.opened.box && withSel.opened.note === onEdit.opened.note
      && sameFace(onEdit, offEdit) && sameFace(offEdit, unkEdit) && holds,
      "4e1 the page stores whether the selection can be edited, and the box, the note and the strip stay as they were for true, false and unknown: "
      + J3({ box: onEdit.opened.box, note: onEdit.opened.note, holds }));
  }

  /* 4r1 to 4r5: THE REPLIES FOUND FOR THE SELECTED MESSAGE ARE THE ROWS (Quick replies on the selection). The product owner,
     2026-11-15: "1-quick-replies-on-the-selection.png and 2-reword-on-a-card.png are perfect, by the way!"; the head of the
     office's criterion: "opening on a message shows those rows at once; nothing is taken and nothing is counted until the agent
     picks a row, and the pick then counts as a pick does today." The page asks the desk for the first suggestion's replies
     (rowsOf) and draws them; it takes nothing, searches nothing and copies nothing by itself, and a pick of a row is the
     one copy a pick is. The desk's side of it, that the lookup changes nothing, is 6o2 below. 4r5 changes each of two plants in a
     copy of the script and expects 4r1 red. */
  {
    const SEL = "my parcel has not arrived and the tracking says nothing";
    const SG = [{ id: "t:post", name: "Post" }, { id: "t:lamp", name: "Lamps" }];
    const J4 = JSON.stringify;
    const two = id => ({ rows: [R(id + "-1"), R(id + "-2")], count: "2 replies" });
    const rowsRun = (scriptText, o, h) => runSelPage(scriptText, o, Object.assign({ stop: true, rowsOf: two }, h || {}));
    const on = await rowsRun(script, { selected: SEL, suggest: SG });
    const shown = d => (d.html().match(/T [\w:-]+/g) || []).join("|");
    check(J4(on.looked) === '["t:post"]' && shown(on) === "T t:post-1|T t:post-2" && on.calls.length === 0,
      "4r1 opening on selected words with suggestions shows the first suggestion's replies as the rows at once, and nothing is taken, searched or copied: "
      + J4({ looked: on.looked, rows: shown(on), calls: on.calls }));
    on.key("ArrowDown"); on.key("Enter");
    await on.tick5();
    check(J4(on.calls) === '["copy {\\"id\\":\\"t:post-2\\",\\"vi\\":0}"]',
      "4r2 the arrow keys walk the rows as they walk the resting list, and Enter on one is the one copy a pick is, nothing else sent: " + J4(on.calls));
    const none = await rowsRun(script, { selected: SEL, suggest: [] });
    const noSel = await rowsRun(script, { suggest: SG });
    check(none.looked.length === 0 && shown(none) === "T a|T b|T c" && noSel.looked.length === 0 && shown(noSel) === "T a|T b|T c",
      "4r3 with no suggestions, or with no selected words, the rows are the resting list and the desk is not asked: "
      + J4({ none: [none.looked, shown(none)], noSel: [noSel.looked, shown(noSel)] }));
    const typed = await rowsRun(script, { selected: SEL, suggest: SG });
    check(typed.opened.box === SEL, "4r4 control: the words still stand in the box beside the rows: " + J4(typed.opened.box));
    if (process.env.ETIUDA_PLANTS === "off") console.log("  NOT RUN  4r5 the page's two plants (ETIUDA_PLANTS=off)");
    else {
      const lines = script.split("\n");
      const marks = ["pick-rows-look", "pick-rows-take"].map(tag => lines.filter(l => l.indexOf("plant:" + tag) >= 0).length);
      const noLook = lines.filter(l => l.indexOf("plant:pick-rows-look") < 0).join("\n");
      const autoTake = lines.map(l => (l.indexOf("plant:pick-rows-take") >= 0 ? l.replace("/* plant:pick-rows-take */", "P.takeSuggest(first, false);") : l)).join("\n");
      const p1 = await rowsRun(noLook, { selected: SEL, suggest: SG }), p2 = await rowsRun(autoTake, { selected: SEL, suggest: SG });
      check(J4(marks) === "[1,1]" && noLook !== script && autoTake !== script && shown(p1) === "T a|T b|T c" && p2.calls.indexOf("take t:post") > -1,
        "4r5 lifting the lookup leaves the resting list, and a lookup that takes the suggestion sends the take 4r1 holds absent: " + J4({ marks, lifted: shown(p1), taken: p2.calls }));
    }
  }

  /* 4w1 to 4w3: THE WINDOW'S TWO FIELDS SAY WHAT THEY ARE FOR (the product owner's testing note 12). The words are the
     desk's, the copywriter's, in both languages; the page puts them in the fields as placeholders and nothing else: a
     placeholder is interface text, so it fills no value and selects nothing, and what a person types does. */
  {
    const J4 = JSON.stringify;
    const runWho = async (pl, selected) => {
      SYSTEM[0] = pl ? "pl-PL" : "en-US";
      const opening = pickAnswer("open", {});
      SYSTEM[0] = "en-US";
      const L = {}, q2 = { value: "", placeholder: "", focus() {}, setAttribute() {}, addEventListener: (t, fn) => { L[t] = fn; } };
      const who = { value: "", placeholder: "", title: "", hidden: true, focus() {}, addEventListener() {} };
      const note = { hidden: true, textContent: "" };
      const box2 = { set innerHTML(v) {}, get innerHTML() { return ""; }, setAttribute() {}, querySelectorAll: () => [], addEventListener() {} };
      let onOpen = null;
      const W = { E_PICK: { find: () => Promise.resolve("{}"), copy() {}, close() {}, ready() {}, onOpen: fn => { onOpen = fn; } } };
      const D = { getElementById: id => (id === "q" ? q2 : id === "rows" ? box2 : id === "who" ? who : id === "sel" ? note : null),
        documentElement: { style: { setProperty() {} }, dataset: {}, classList: { toggle() {} }, lang: "" } };
      new Function("window", "document", script)(W, D);
      onOpen(JSON.stringify(Object.assign({}, opening, selected ? { selected: selected } : {})));
      await tick(5);
      return { q: { value: q2.value, placeholder: q2.placeholder }, who: { value: who.value, placeholder: who.placeholder }, note: note.hidden };
    };
    const en = await runWho(false, ""), pl = await runWho(true, ""), typed = await runWho(false, "a word of mine");
    check(en.q.placeholder === "Type a word to find a reply" && en.who.placeholder === "customer's name"
      && en.q.value === "" && en.who.value === "" && en.note === true,
      "4w1 in English, with both fields empty, the search box says what it is for and so does the name field, and neither is filled or selected: " + J4(en));
    check(pl.q.placeholder === "Wpisz s\u0142owo, by znale\u017a\u0107 odpowied\u017a" && pl.who.placeholder === "imi\u0119 klienta"
      && pl.q.value === "" && pl.who.value === "" && pl.note === true,
      "4w2 in Polish, the same two, the copywriter's words exactly: " + J4(pl));
    check(typed.q.value === "a word of mine" && typed.q.placeholder === en.q.placeholder && typed.note === false,
      "4w3 with words in the box the box holds those words and nothing else (the placeholder is only what shows while it is empty): " + J4(typed));
  }

  /* THE LEG (board 952, waste 3b): typing in the global picker filters in the picker;
     a keystroke in the picker sends no IPC, by count. The answer's first frame is measured. */
  let findCalls = 0;
  const origFind = pWin.E_PICK.find;
  pWin.E_PICK.find = (q) => { findCalls++; return origFind(q); };
  const bankCard = (id, hay, ord) => ({ band: 1, ord: ord, lift: 0, aff: 0, favMul: 1, hay: hay,
    fields: { title: hay, keys: "", meta: "", body: "" },
    words: { title: [hay], keys: [], meta: [], body: [] }, uniq: [hay], rows: [R(id)] });
  if (performance.clearMarks) performance.clearMarks();
  if (performance.clearMeasures) performance.clearMeasures();
  pcalls.length = 0; qEl.value = "";
  pOpen(JSON.stringify({ rows: [R("brass"), R("linen")], words: { again: "again" }, cap: 50,
    bank: [bankCard("brass", "brass", 0), bankCard("linen", "linen", 1)],
    vocab: [["brass", 1], ["linen", 1]],
    tally: { one: "{N} reply", many: "{N} replies", few: "{N} replies", shown: "{SHOWN} of {COUNT}" } }));
  findCalls = 0;
  qEl.value = "br";
  pageL["q:input"]();
  const marked = performance.getEntriesByName ? performance.getEntriesByName("pick-answer") : [];
  const answerMs = marked.length ? marked[marked.length - 1].duration : -1;
  console.log("4t pick-answer " + (answerMs >= 0 ? answerMs.toFixed(4) : "n/a") + " ms, calls " + findCalls);
  check(findCalls === 0 && /T brass/.test(boxHtml) && !/T linen/.test(boxHtml),
    "4t a keystroke in the picker sends no IPC, by count: " + findCalls + " call(s), " + (answerMs >= 0 ? answerMs.toFixed(4) : "n/a") + " ms");
  pWin.E_PICK.find = origFind;
  reopen();

  reopen(); qEl.value = "br"; pFound = [R("c"), R("a")]; pageL["q:input"]();
  await tick(5);
  press("Enter", "Enter");
  check(lastCall() === 'copy {"id":"c","vi":0}' && !/title="again"/.test(boxHtml),
    "4m with a query the first row found is marked, and the reply copied last steps aside: " + lastCall());
  /* A row marked as committing is drawn with the stamp after its title, the words for it its tooltip; a row not marked is
     drawn without one. */
  const sworn = Object.assign(R("s"), { commits: 1 });
  pcalls.length = 0; qEl.value = ""; pOpen(JSON.stringify({ rows: [sworn, R("p")], words: { stamp: "Commits the firm" } }));
  const lis = boxHtml.split("</li>").filter(x => x.indexOf("<li") > -1);
  const stampAfterTitle = (lis[0] || "").indexOf('<span class="t">T s</span><span class="st" title="Commits the firm"><svg') > -1;
  check(stampAfterTitle && (lis[0].match(/class="st"/g) || []).length === 1,
    "4o a row of a reply that commits the firm wears the stamp straight after its title, the desk's words as its tooltip: " + JSON.stringify((lis[0] || "").slice(0, 160)));
  check(lis.length === 2 && lis[1].indexOf('class="st"') < 0,
    "4p control: the row beside it, not marked, wears none: " + lis.length + " row(s), " + (lis[1] || "").indexOf('class="st"'));
  const sgHost = { el: null, insertBefore(el) { this.el = el; } };
  boxEl.parentNode = sgHost;
  pDoc.createElement = tag => {
    const el = { tagName: tag, id: "", className: "", title: "", textContent: "", type: "", children: [], attrs: {},
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === "id") this.id = String(v); },
      getAttribute(k) { return this.attrs[k] || ""; },
      appendChild(c) { this.children.push(c); return c; },
      remove() {}, addEventListener() {} };
    return el;
  };
  pWin.E_PICK.takeSuggest = (id, multi) => {
    pcalls.push("take " + id + " " + (multi ? 1 : 0));
    return Promise.resolve(JSON.stringify({ rows: pRows, count: "4 replies", picked: [id] }));
  };
  pcalls.length = 0;
  pOpen(JSON.stringify({ rows: pRows, suggest: [{ id: "t:wick", name: "lantern", score: 4 }], words: { suggest: "Suggested", suggestTip: "tip" } }));
  const sgText = sgHost.el ? sgHost.el.children.map(c => c.textContent).join(" ") : "";
  check(!!sgHost.el && sgHost.el.id === "sg" && /lantern/.test(sgText),
    "4q suggestions are drawn above the rows, by name: " + JSON.stringify(sgText));
  press("ArrowUp", "ArrowUp");
  press("Enter", "Enter");
  check(lastCall() === "take t:wick 0", "4r a step up from the first row marks a suggestion, and Enter takes it: " + lastCall());
  await Promise.resolve();
  press("Enter", "Enter");
  const sgBtnPressed = sgHost.el && sgHost.el.children.find(c => c.getAttribute && c.getAttribute("data-id") === "t:wick");
  check(lastCall() === 'copy {"id":"a","vi":0}' && sgBtnPressed && sgBtnPressed.getAttribute("aria-pressed") === "true",
    "4s up, then Enter, then Enter copies row 0 and leaves the intent picked, counted once: " + lastCall());

  /* ---- 5. what the shell may not do -------------------------------------------------------- */
  console.log("\n[5/7] what the shell may not do, read from its text with the comments taken out");
  /* THE COMMENTS ARE TAKEN OUT BY A PARSER, esbuild's own, which reprints the program without them and with its
     whitespace squeezed (a plain reprint keeps some comments it attaches to a property). The pattern used before took
     "/*" inside a string for a comment's start, so a read written between a "/*" string and a "*\/" string was blanked
     with them and stayed green (board 818). Strings and template expressions survive, so a name in a command line
     still counts. Where a name must be read as CODE only, split-guard's masker, proved by its own self-test, blanks
     the strings as well; it keeps every offset, so a place found in the one is read in the other. */
  const ESB = nodeRequire("esbuild");
  const { mask } = await import(pathToFileURL(path.join(ROOT, "tools", "split-guard", "bridge.mjs")).href);
  const blank = s => ESB.transformSync(s, { loader: "js", legalComments: "none", charset: "utf8", minifyWhitespace: true }).code;
  const PRE = fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8");
  /* The shell is main.js, the preload and every file main.js requires from beside itself, read as one text. */
  const BESIDE = [...SRC.matchAll(/require\(path\.join\(__dirname, ((?:"[\w.-]+", )*"[\w.-]+")\)\)/g)]
    .map(m => m[1].replace(/"/g, "").split(", ").join("/"));
  /* And what those require from beside themselves: the relay's channel layer takes its blob rules from shell/relay/. */
  for (const n of BESIDE.slice()) for (const m of fs.readFileSync(path.join(ROOT, "shell", n), "utf8").matchAll(/require\("\.\/([\w.-]+)"\)/g)) {
    const near = path.posix.join(path.posix.dirname(n), m[1]);
    if (BESIDE.indexOf(near) < 0) BESIDE.push(near);
  }
  const shellCode = [SRC, PRE].concat(BESIDE.map(n => fs.readFileSync(path.join(ROOT, "shell", n), "utf8"))).map(blank).join("\n");
  const shellBare = mask(shellCode);
  const modDir = path.join(ROOT, "src", "modules");
  const engineCode = fs.readdirSync(modDir).filter(f => f.endsWith(".js")).map(f => blank(fs.readFileSync(path.join(modDir, f), "utf8")))
    .concat(blank(fs.readFileSync(path.join(ROOT, "src", "main.js"), "utf8"))).join("\n");
  const engineBare = mask(engineCode);
  const FORBID = /desktopCapturer|capturePage|getSources|getDisplayMedia|getUserMedia|clipboard\s*\.\s*read|clipboard-read|readText|readHTML|readImage|readRTF|readBookmark|readBuffer|readFindText|availableFormats|sendInputEvent|SendKeys|SendInput|keybd_event|mouse_event|SetWindowsHookEx|GetForegroundWindow|GetWindowText|WindowFromPoint|AttachThreadInput|uiohook|iohook|robotjs|nut-js|UIAutomation/g;
  /* The one read is the picker's open. A second site still matches once that one is hidden. */
  const clipSites = shellCode.match(/clipboard\s*\.\s*readText\s*\(\s*\)/g) || [];
  const planted = shellCode.replace("clipboard.readText()", "clipboard.readText();clipboard.readText()");
  const plantedSites = (planted.match(/clipboard\s*\.\s*readText\s*\(\s*\)/g) || []).length;
  const plantedReach = (planted.replace("clipboard.readText()", "clipboard.kept()").match(FORBID) || []).length;
  const scored = shellCode.replace("clipboard.readText()", "clipboard.kept()");
  const reach = (scored + "\n" + engineCode).match(FORBID) || [];
  /* EVERY HANDLE ON THE CLIPBOARD IS ONE OF THE KNOWN ONES (board 818): a read through another name, as
     `const { clipboard: cb } = require("electron")` then `cb.read(...)`, names no API the list above knows. In the
     shell the name stands only as a member of a `require("electron")` destructure, taken whole, and before its one
     write; the electron module is never held whole or indexed. In the engine it is `navigator.clipboard`, tested or
     written, and `navigator` itself is only ever read by a plain member name, so `navigator["clip"+"board"]` is a
     handle too. Each place is found in the text with its strings blanked, so prose that says "clipboard" is not one. */
  const at = (bare, re) => { const out = []; let m; re.lastIndex = 0; while ((m = re.exec(bare))) out.push(m.index); return out; };
  const spans = [];
  { const re = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*"electron"\s*\)/g; let m;
    while ((m = re.exec(shellCode))) spans.push([m.index, m.index + m[0].length]); }
  const inSpan = i => spans.some(s => i >= s[0] && i < s[1]);
  const oddHandles = at(shellBare, /\bclipboard\b(?!-)/g).filter(i => {
    if (shellCode.startsWith("clipboard.writeText(", i)) return false;
    if (shellCode.startsWith("clipboard.readText(", i)) return false;
    return !(inSpan(i) && /[{,]\s*$/.test(shellCode.slice(i - 2, i)) && /^clipboard\s*[,}]/.test(shellCode.slice(i, i + 11)));
  }).map(i => shellCode.slice(i, i + 24))
    .concat(at(shellBare, /\brequire\s*\(/g).filter(i => /^require\(\s*"electron"\s*\)/.test(shellCode.slice(i, i + 22)) && !inSpan(i)
      && !/^require\(\s*"electron"\s*\)\s*\.\s*(?!clipboard\b)[A-Za-z_$]/.test(shellCode.slice(i, i + 40))).map(i => shellCode.slice(i, i + 30)))
    .concat(at(engineBare, /\bclipboard\b(?!-)/g).filter(i => !(/navigator\.$/.test(engineCode.slice(i - 10, i))
      && /^clipboard(&&|\.writeText\()/.test(engineCode.slice(i, i + 21)))).map(i => engineCode.slice(Math.max(0, i - 10), i + 24)))
    .concat(at(engineBare, /\bnavigator\b(?!\s*\.\s*[A-Za-z_$])/g).map(i => engineCode.slice(Math.max(0, i - 10), i + 24)));
  check(reach.length === 0 && oddHandles.length === 0 && /clipboard/.test(shellCode) && /writeText/.test(shellCode),
    "5a no API in the shell or the engine reads another window, the screen or the clipboard, or presses a key itself, and the clipboard is"
    + " reached through no other name: " + (reach.concat(oddHandles).join(", ") || "none"));
  check(clipSites.length === 1 && plantedSites === 2 && plantedReach > 0,
    "5aa the shell reads the clipboard at one place, the picker's open, and a second read is refused: "
    + clipSites.length + " site(s), planted " + plantedSites + ", forbid hits " + plantedReach);
  const writes = shellCode.match(/clipboard\s*\.\s*write\w*\s*\(/g) || [];
  /* Two places since Enter after a reword: the desk's own copy, and the reword's result the shell itself kept (pickReworded). */
  const putSite = /const text=pickClipText\(pickReworded,process\.platform\),was=pickSelectedNow,target=pickTarget;pickReworded="";noteOwnText\(text\);clipboard\.writeText\(text\);hidePicker\(true\);/.test(shellCode);
  check(writes.length === 2 && /clipboard\.writeText\(pickClipText\(v\.text,\s*process\.platform\)\)/.test(shellCode) && putSite
    && (shellBare.match(/clipboard\.writeText\(/g) || []).length === 2,
    "5b the shell writes the clipboard at two places, the desk's own text and the reword's result it kept: " + writes.length + " write site(s), the put's " + putSite);
  /* Board 945 stage 3 (b) slice 1: background syncer worker in shell/folder/syncer.cjs and node:worker_threads */
  const MODS = ["electron", "node:child_process", "node:path", "node:fs", "node:os", "node:crypto", "node:zlib",
    "node:worker_threads", "./folder/syncer.cjs",
    /* Board 989: node:tls, only to add the system's roots to Node's own; it reaches no window, screen, clipboard or key. */
    "node:tls",
    /* Board 980 stage 3: node:http, only for the sign-in's loopback on 127.0.0.1 while the person signs in (tests/desk-signin.mjs). */
    "node:http",
    /* node:net and node:stream, only in shell/proxy-net.cjs: the relay socket's tunnel through a proxy, and a call's answer read as a stream. */
    "node:net", "node:stream",
    /* A person's store's key life: node:crypto alone, its requests through what the shell hands it; no window, screen, clipboard or key. */
    "./sync/store.cjs",
    /* Its sync: node:crypto, node:fs and node:path over the store's own mirror; no window, screen, clipboard or key. */
    "./sync/sync.cjs",
    "./win-proxy.cjs", "./proxy-net.cjs", "./page-watch.cjs", "./clip-suggest.cjs", "./desk-ai.cjs", "./desk-reset.cjs", "./tray.cjs", "./embed/suggest.cjs", "./core.cjs", "./relay/channel.cjs", "./blob.cjs"];
  /* 5c AS A JUDGEMENT OF A TEXT, so a planted copy can be judged the same way. WIDENED 2026-11-15 by the lead engineer
     (Claudius) on the test architect's word: win-proxy.cjs reads Windows' proxy again without waiting (execFile), so two
     files now take execFile beside execFileSync and there are three asynchronous calls (the caret's two and win-proxy's one).
     The program set is unchanged: win-proxy's one execFile call is pinned to REG_TOOL by its own text. WIDENED again the same
     day by the lead engineer (Claudius delta5) on the test architect's edit to review 28: the desk AI's minute look at machine
     policy runs without waiting, so four asynchronous calls, main.js's one beside the caret's pinned to REG_TOOL exporting
     POLICY_KEY by its own text. */
  const judge5c = (shellCode, shellBare, winSrc) => {
    const reqs = (shellCode.match(/\brequire\s*\(\s*[^)]*\)/g) || []).map(r => r.replace(/^require\s*\(\s*|\s*\)$/g, "").replace(/^["']|["']$/g, ""))
      .map(r => { const m = /^path\.join\(__dirname,((?:"[\w.-]+",)*"[\w.-]+)$/.exec(r); return m ? "./" + m[1].replace(/"/g, "").split(",").join("/") : r; });
    const strange = reqs.filter(r => MODS.indexOf(r) < 0);
    const cps = [...shellCode.matchAll(/\{([^}]*)\}\s*=\s*require\(\s*"node:child_process"\s*\)/g)];
    const cp = cps[0] || null;
    /* EVERY PROGRAM BY A CONSTANT HELD HERE TO ITS FIXED PATH, never a bare name a PATH search resolves (board 880, 2026-10-13):
       the registry tool for the proxy, policy and theme reads, and dbus-send on Linux, which Studio already runs at its fixed
       path. A bare "reg" or "dbus-send" runs whatever a directory earlier in PATH holds under that name. */
    const regTool = /\bconst REG_TOOL="C:\\\\Windows\\\\System32\\\\reg\.exe"/.test(shellCode);
    const busTool = /\bconst BUS_TOOL="\/usr\/bin\/dbus-send"/.test(shellCode);
    const runs = shellCode.match(/(?<![.\w])(execFileSync|execFile|execSync|exec|spawnSync|spawn|fork)\s*\(\s*("[^"]*"|[^,)]*)/g) || [];
    const programs = runs.map(r => r.replace(/^[^(]*\(\s*/, ""));
    /* ONE HANDLE ON child_process, and the one name it gives is only ever called (board 818): a second
       `require("node:child_process")` held whole and called as `.spawn(...)` passed the call pattern above, which reads
       a bare name only. So the module is required once in each file that runs a program, its one name is mentioned
       once more per call and nowhere else, and no other loader (a dynamic import, createRequire, a binding) is in the
       shell at all. */
    const cpRequires = (shellCode.match(/\brequire\s*\(\s*"(?:node:)?child_process"\s*\)/g) || []).length;
    /* THE GUARD NAMES ITS CALLEE (shell/win-proxy.cjs, regOpts): each reg call passes its options as regOpts(execFileSync, ...) or
     regOpts(execFile, ...), one more mention of that name per guarded call and nowhere else. */
  const guardSync = (shellBare.match(/\bregOpts\(\s*execFileSync\s*,/g) || []).length, guardAsync = (shellBare.match(/\bregOpts\(\s*execFile\s*,/g) || []).length;
  const runMentions = (shellBare.match(/\bexecFileSync\b/g) || []).length - guardSync, runCalls = (shellBare.match(/\bexecFileSync\s*\(/g) || []).length;
    /* THE CARET HELPER'S CALLS, execFile in main.js alone: its program is `tool`, bound only to caretTool(), whose two
       places are caret.exe beside the asar and in build/, and its name is mentioned once in the require and once per call.
       WIDENED 2026-11-15 by the lead engineer (Claudius delta5) by exactly one call, the selection's (Quick replies on the
       selection): with the two widenings above that is five asynchronous calls, three bindings of tool, caretTool named four times. */
    const asyncMentions = (shellBare.match(/\bexecFile\b/g) || []).length - guardAsync, asyncCalls = (shellBare.match(/\bexecFile\s*\(/g) || []).length;
    const toolBinds = shellCode.match(/\bconst tool=caretTool\(\);/g) || [], toolNames = (shellBare.match(/\btool\b/g) || []).length;
    const caretToolNames = (shellBare.match(/\bcaretTool\b/g) || []).length;
    const caretPlaces = /function caretTool\(\)\{if\(process\.platform!=="win32"\)return null;const at=app\.isPackaged\?path\.join\(process\.resourcesPath,"caret\.exe"\):path\.join\(__dirname,"\.\.","dist","\.caret","caret\.exe"\);return fs\.existsSync\(at\)\?at:null\}/.test(shellCode);
    const loaders = shellBare.match(/\bimport\s*\(|\bprocess\s*\.\s*(?:binding|_linkedBinding|dlopen)\b|\bcreateRequire\b|\bmodule\s*\.\s*require\b|\brequire\s*\.\s*(?:cache|main)\b/g) || [];
    const cpNames = cps.map(m => m[1].split(",").map(x => x.trim()).sort().join(","));
    const winCalls = (winSrc.match(/\bexecFile\s*\(/g) || []).length, winPinned = winCalls === 1 && /\bexecFile\s*\(\s*REG_TOOL\b/.test(winSrc);
    const outside = shellCode.split(winSrc).join("");
    const mainRegLater = (outside.match(/\bexecFile\s*\(\s*REG_TOOL\b/g) || []).length;
    const policyPinned = mainRegLater === 1 && /\bexecFile\s*\(\s*REG_TOOL\s*,\s*\[\s*"export"\s*,\s*POLICY_KEY\s*,/.test(outside);
    return { ok: reqs.length > 0 && strange.length === 0 && cps.length === cpRequires && cpNames.every(n => n === "execFileSync" || n === "execFile,execFileSync") && cpNames.filter(n => n !== "execFileSync").length === 2 && asyncCalls === 5 && asyncMentions === asyncCalls + 2 && toolBinds.length === 3 && caretPlaces && caretToolNames === 4 && toolNames === toolBinds.length * 3 && programs.length > 0 && programs.every(p => (p === "REG_TOOL" && regTool) || p === "tool" /* Linux alone: three questions to the session bus about the keyring, none about a window, the screen, the clipboard or a key (tests/shell-office.mjs 14) */ || (p === "BUS_TOOL" && busTool)) && cpRequires === 2 && runMentions === runCalls + cpRequires && loaders.length === 0 && winPinned && policyPinned,
      say: "5c the shell loads no module and runs no program it did not have (every one is read against the must-hold before it joins): " + (strange.join(", ") || reqs.length + " requires known") + "; " + (cp ? cp[1].trim() : "no child_process") + " runs " + (programs.join(", ") || "nothing") + "; child_process required " + cpRequires + " time(s), its name mentioned " + runMentions + " time(s) for " + runCalls + " call(s)" + (loaders.length ? "; other loaders " + loaders.join(", ") : "") + "; win-proxy's execFile call(s) " + winCalls + (winPinned ? " to REG_TOOL" : " NOT PINNED to REG_TOOL")
        + "; main.js's REG_TOOL execFile call(s) " + mainRegLater + (policyPinned ? " exporting POLICY_KEY" : " NOT PINNED to exporting POLICY_KEY") };
  };
  const WIN_SRC = blank(fs.readFileSync(path.join(ROOT, "shell", "win-proxy.cjs"), "utf8"));
  const five = judge5c(shellCode, shellBare, WIN_SRC);
  /* Two plants, judged on copies of the text: win-proxy's call given another program, and a second call added there. */
  const PLANTS_OFF_5C = process.env.ETIUDA_PLANTS === "off";
  const plant5c = (from, to) => { const w = WIN_SRC.replace(from, to), c = shellCode.split(WIN_SRC).join(w);
    return w !== WIN_SRC && c !== shellCode && !judge5c(c, mask(c), w).ok; };
  /* And two on main.js's own: its policy look given another key, and a second call to REG_TOOL beside it. */
  const plantMain = (from, to) => { const c = shellCode.replace(from, to); return c !== shellCode && !judge5c(c, mask(c), WIN_SRC).ok; };
  const p5 = PLANTS_OFF_5C ? null : [plant5c(/\bexecFile\(REG_TOOL\b/, 'execFile("cmd.exe"'),
    plant5c(/\bexecFile\(REG_TOOL,/, "execFile(REG_TOOL,[]);execFile(REG_TOOL,"),
    plantMain(/\bexecFile\(REG_TOOL,\["export",POLICY_KEY,/, 'execFile(REG_TOOL,["export",USER_KEY,'),
    plantMain(/\bexecFile\(REG_TOOL,\["export",POLICY_KEY,/, 'execFile(REG_TOOL,[]);execFile(REG_TOOL,["export",POLICY_KEY,')];
  check(five.ok && (p5 === null || p5.every(Boolean)),
    five.say + (p5 === null ? "; plants NOT RUN (ETIUDA_PLANTS=off)" : "; plants another program " + (p5[0] ? "red" : "MISSED") + ", a second call " + (p5[1] ? "red" : "MISSED")
      + ", the policy look on another key " + (p5[2] ? "red" : "MISSED") + ", a second REG_TOOL call in main.js " + (p5[3] ? "red" : "MISSED")));
  /* THE PAGE IS GRANTED ONE PERMISSION, the clipboard's write, and every handler that could grant another answers
     from that list alone (board 818): "clipboard-read" added to the list stayed green, since no API name is in it.
     The list is named three times, its declaration and its two handlers, and nowhere else, so
     `Array.prototype.push.call(ALLOWED, ...)` or an alias of it is a change at run time too. */
  const allowDecl = shellCode.match(/\bALLOWED\s*=\s*\[([^\]]*)\]/g) || [];
  const allowList = allowDecl.length === 1 ? /\[([^\]]*)\]/.exec(allowDecl[0])[1].split(",").map(s => s.trim().replace(/^["'`]|["'`]$/g, "")).filter(Boolean) : [];
  const allowMoved = (shellBare.match(/\bALLOWED\s*(?:\.\s*(?:push|unshift|splice|concat|fill|length)\b|\[)/g) || [])
    .concat((shellBare.match(/\bALLOWED\b/g) || []).length === 3 ? [] : ["the list named other than at its declaration and its two handlers"]);
  const permHandlers = shellCode.match(/\bset(?:Permission\w*|Device\w*|DisplayMedia\w*|Bluetooth\w*|USBProtected\w*)Handler\b/g) || [];
  const reqFrom = /\bsetPermissionRequestHandler\(\((\w+),(\w+),(\w+)\)=>\3\(ALLOWED\.indexOf\(\2\)>-1\)\)/.test(shellCode);
  const chkFrom = /\bsetPermissionCheckHandler\(\((\w+),(\w+)\)=>ALLOWED\.indexOf\(\2\)>-1\)/.test(shellCode);
  check(allowList.join(",") === "clipboard-sanitized-write" && allowMoved.length === 0 && reqFrom && chkFrom
    && permHandlers.sort().join(",") === "setPermissionCheckHandler,setPermissionRequestHandler",
    "5d the page is granted the clipboard's write and nothing else, and both permission handlers answer from that list: "
    + JSON.stringify(allowList) + (allowMoved.length ? ", the list changed at run time" : "") + ", handlers " + (permHandlers.join(", ") || "none")
    + (reqFrom && chkFrom ? ", both from the list" : ", NOT both from the list"));
  /* NO KEY IS BOUND TO THE CLIPBOARD: no handler in the shell, the picker's page or the engine names the V key's
     code, read with the strings kept, since a key code is a string. */
  const keyV = (shellCode + " " + engineCode).match(/KeyV/g) || [];
  const keysSeen = (engineCode.match(/"Key[A-Z]"/g) || []).length;
  check(keyV.length === 0 && keysSeen > 0 && /Digit/.test(shellCode),
    "5e no handler in the shell, the picker's page or the engine is bound to the V key: " + keyV.length + " named, where the"
    + " same reading finds " + keysSeen + " other letter keys in the engine and the picker's digits in the shell");

  /* THE CARET HELPER, the one program that presses a key, read as source: the C# electron-builder.js compiles. It calls
     seven Windows functions, none of which reads a window's text or the clipboard, and the presses it makes are the
     Control key's and the V key's alone. */
  /* The C# is read with its strings blanked before its comments are taken out, so "a//b" hides nothing. Every import is
     user32's own function under its own name; the keys pressed are read by their values, Control and V; and the text
     names no library beyond its four usings, which -noconfig in electron-builder.js makes true at the compile too. */
  const CS_RAW = fs.readFileSync(path.join(ROOT, "shell", "caret.cs"), "utf8");
  const CS = CS_RAW.replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/\/\/[^\n]*/g, "");
  const attrs = CS_RAW.match(/\[[^\]\n]*DllImport[^\]\n]*\]/g) || [];
  const attrsOk = attrs.every(a => a === '[DllImport("user32.dll")]' || a === '[DllImport("user32.dll", SetLastError = true)]');
  const imports = [...CS.matchAll(/\[DllImport\(""(?:, SetLastError = true)?\)\]\s*static extern \w+ (\w+)\(/g)].map(m => m[1]).sort();
  const dllCount = (CS.match(/DllImport/g) || []).length;
  const usings = (CS.match(/^using [\w.]+;/gm) || []).sort();
  const csForbid = CS.replace(/^using [\w.]+;/gm, "").match(/\bSystem\.|\bProcess\b|SendKeys|Clipboard|Activator|GetTypeFromProgID|\bAssembly\b|GetDelegateForFunctionPointer|EntryPoint|GetWindowText|SendMessage|PostMessage|SetWindowsHookEx|keybd_event|mouse_event|AttachThreadInput/g) || [];
  const vk = {};
  for (const m of CS.matchAll(/\b(VK_\w+) = (0x[0-9A-Fa-f]+)/g)) vk[m[1]] = parseInt(m[2], 16);
  const keyCalls = [...CS.matchAll(/\bKey\(([^,()]*),/g)].map(m => m[1].trim());
  const pressed = keyCalls.filter(k => k !== "int vk");
  const pressedValues = [...new Set(pressed.map(k => /^VK_\w+$/.test(k) ? vk[k] : NaN))].sort((a, b) => a - b);
  const builder = fs.readFileSync(path.join(ROOT, "electron-builder.js"), "utf8");
  const builds = /path\.resolve\(__dirname, "shell", "caret\.cs"\)/.test(builder) && /"-noconfig"/.test(builder) && /"-r:System\.dll"/.test(builder)
    && /"-r:UIAutomationClient\.dll", "-r:UIAutomationTypes\.dll"/.test(builder) && (builder.match(/"-r:[^"]+"/g) || []).length === 3;
  /* WIDENED 2026-11-15 by the lead engineer (Claudius delta5) for Quick replies on the selection (Max's ruling, decisions
     2026-11-15 16:28): the helper reads the focused control's selected text through UI Automation. Exactly that is added:
     three usings (System.Text, System.Windows.Automation and its .Text), the two UI Automation client libraries at the
     compile, and a read that names only the focused element, its password flag, the text pattern, the selection and its
     text, and nothing that sets, selects, scrolls, moves or invokes; a password field is refused before any text is read.
     WIDENED again the same day for whether those words can be edited: the range's IsReadOnly attribute, the Value pattern's
     IsReadOnly (not its value), and the control type. Twenty names where there were nine. Nothing that changes a control. */
  const uiaRead = cs => {
    const uiaNames = [...new Set(cs.match(/\b(?:AutomationElement|TextPattern|TextPatternRange|ValuePattern|ControlType)\b(?:\.\w+)?|\.(?:FocusedElement|TryGetCurrentPattern|GetSelection|GetText|GetAttributeValue|IsPassword|IsReadOnly)\b/g) || [])].sort();
    const uiaWrites = cs.match(/\b(?:SetValue|InvokePattern|SelectionItemPattern|SelectionPattern|AddToSelection|RemoveFromSelection|SetFocus|ScrollIntoView|ExpandCollapsePattern|TogglePattern|Invoke|Move\w*|ExpandToEnclosingUnit|RangeFromPoint|FromPoint|FromHandle|TreeWalker|FindAll|FindFirst|GetVisibleRanges|DocumentRange|Select)\b\s*\(?/g) || [];
    const valueRead = /\.Current\.Value\b|\bSetValue\b|\bValueProperty\b/.test(cs);
    const passwordFirst = /if \(e\.Current\.IsPassword\) return 6;\s*object found;\s*if \(!e\.TryGetCurrentPattern\(TextPattern\.Pattern, out found\)\) return 3;/.test(cs);
    return { uiaNames, uiaWrites, valueRead, passwordFirst, ok: J(uiaNames) === J(UIA_NAMES) && uiaWrites.length === 0 && !valueRead && passwordFirst };
  };
  const UIA_NAMES = [".GetAttributeValue", ".GetSelection", ".GetText", ".IsPassword", ".IsReadOnly", ".TryGetCurrentPattern",
    "AutomationElement", "AutomationElement.FocusedElement", "AutomationElement.NotSupported", "ControlType", "ControlType.Document",
    "ControlType.Edit", "ControlType.Text", "TextPattern", "TextPattern.IsReadOnlyAttribute", "TextPattern.MixedAttributeValue",
    "TextPattern.Pattern", "TextPatternRange", "ValuePattern", "ValuePattern.Pattern"].sort();
  const { uiaNames, uiaWrites, valueRead, passwordFirst } = uiaRead(CS);
  check(J(imports) === J(["GetAsyncKeyState", "GetForegroundWindow", "GetWindowThreadProcessId", "IsWindow", "MapVirtualKey", "SendInput",
      "SetForegroundWindow"]) && dllCount === imports.length && attrs.length === imports.length && attrsOk
    && J(usings) === J(["using System.Diagnostics;", "using System.Runtime.InteropServices;", "using System.Threading;", "using System;",
      "using System.Text;", "using System.Windows.Automation;", "using System.Windows.Automation.Text;"].sort())
    && uiaRead(CS).ok
    && csForbid.length === 0 && keyCalls.length === 5 && (CS.match(/\bKey\(/g) || []).length === 5 && pressed.length === 4 && pressed.every(k => /^VK_\w+$/.test(k))
    && J(pressedValues) === J([0x11, 0x56]) && builds,
    "5f the caret helper electron-builder.js compiles, with -noconfig, calls " + imports.length + " user32 functions by their own names,"
    + " uses no library beyond its seven usings, reads the selection through UI Automation naming " + uiaNames.length + " members and"
    + (uiaWrites.length ? " ALSO " + uiaWrites.join(", ") : " nothing that changes a control")
    + (valueRead ? ", READS the value" : ", the value unread")
    + (passwordFirst ? ", a password field refused first," : ", NO password refusal first,")
    + " and presses the keys 0x" + pressedValues.map(v => (v || 0).toString(16)).join(" and 0x")
    + " (Control, V) in " + pressed.length + " presses" + (csForbid.length ? "; also names " + csForbid.join(", ") : ""));
  /* Two plants on copies of the helper's text: the password refusal lifted, and the focus set before the read. */
  if (process.env.ETIUDA_PLANTS === "off") console.log("  SKIP  5fp the helper's two plants (ETIUDA_PLANTS=off)");
  else {
    const lifted = CS.replace("if (e.Current.IsPassword) return 6;", ""), focused = CS.replace("object found;", "e.SetFocus(); object found;");
    check(lifted !== CS && focused !== CS && !uiaRead(lifted).ok && !uiaRead(focused).ok,
      "5fp the helper's read with its password refusal lifted, and with the focus set before it, each fails 5f's reading");
  }
  /* THE HELPER'S OWN CHECK, run where the C# compiler is: caret.cs compiled into a scratch folder as electron-builder.js compiles
     it, and its check verb, which touches no window, prints the selection's cap over a fixed text as UTF-8, then the editability
     rule. No window of this computer is read.
     The rule, one row per cell. attr is the range's IsReadOnly (ro true, ed false, ns not supported, mx mixed). second is one
     opinion: Value.IsReadOnly when that pattern is present, otherwise ControlType.Text as read-only; Edit and Document stay
     silent. "?" is that opinion split (Value says editable, the type is Text). Agree, or a definite attribute with a silent
     second: that answer. They disagree, the range is mixed, or the attribute is missing and the second is silent: unknown.
       fact ro ro ro                  fact ro ed ? contradicted     fact ro . ro              fact ro ? ? contradicted
       fact ed ro ? contradicted      fact ed ed ed                 fact ed . ed              fact ed ? ? contradicted
       fact ns ro ro                  fact ns ed ed                 fact ns . ? not-supported fact ns ? ? not-supported
       fact mx ro ? mixed             fact mx ed ? mixed            fact mx . ? mixed         fact mx ? ? mixed
     The second opinion on its own, value then control type:
       second ro text ro   second ro edit ro   second ro doc ro   second ro other ro
       second ed text ?    second ed edit ed   second ed doc ed   second ed other ed
       second . text ro    second . edit .     second . doc .     second . other . */
  const FACT_ROWS = [
    "fact ro ro ro", "fact ro ed ? contradicted", "fact ro . ro", "fact ro ? ? contradicted",
    "fact ed ro ? contradicted", "fact ed ed ed", "fact ed . ed", "fact ed ? ? contradicted",
    "fact ns ro ro", "fact ns ed ed", "fact ns . ? not-supported", "fact ns ? ? not-supported",
    "fact mx ro ? mixed", "fact mx ed ? mixed", "fact mx . ? mixed", "fact mx ? ? mixed",
    "second ro text ro", "second ro edit ro", "second ro doc ro", "second ro other ro",
    "second ed text ?", "second ed edit ed", "second ed doc ed", "second ed other ed",
    "second . text ro", "second . edit .", "second . doc .", "second . other ."];
  {
    const csc = path.join(process.env.WINDIR || "C:/Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
    let said5h = "no C# compiler here, so not compiled";
    let ok5h = process.platform !== "win32" || !fs.existsSync(csc);
    if (!ok5h) {
      const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-caret-check-")), exe = path.join(lab, "caret.exe");
      try {
        const { spawnSync } = nodeRequire("node:child_process");
        const made = spawnSync(csc, ["-noconfig", "-nologo", "-optimize", "-target:winexe", "-platform:anycpu", "-r:System.dll",
          "-lib:" + path.join(path.dirname(csc), "WPF"), "-r:UIAutomationClient.dll", "-r:UIAutomationTypes.dll", "-out:" + exe,
          path.join(ROOT, "shell", "caret.cs")], { encoding: "utf8", windowsHide: true, timeout: 60000 });
        const ran = made.status === 0 ? spawnSync(exe, ["check"], { windowsHide: true, timeout: 10000 }) : null;
        const out = ran && ran.stdout ? ran.stdout.toString("utf8") : "";
        const want = "Za\u017C\u00F3\u0142\u0107 g\u0119\u015Bl\u0105 ja\u017A\u0144 " + "x".repeat(1481);
        const capOk = out.startsWith(want + "\n");
        const tableOk = out.slice(want.length + 1) === FACT_ROWS.join("\n");
        ok5h = !!ran && ran.status === 0 && capOk && tableOk;
        said5h = made.status !== 0 ? "did not compile: " + String(made.stdout || made.stderr).split("\n")[0]
          : "check exit " + (ran && ran.status) + ", cap " + (capOk ? "held" : "NOT held") + ", " + FACT_ROWS.length
            + " rows " + (tableOk ? "held" : "NOT held");
      } finally { fs.rmSync(lab, { recursive: true, force: true }); }
    }
    check(ok5h, "5fs the caret helper compiles as electron-builder.js compiles it, and its window-free check caps a text at 1500 characters in"
      + " UTF-8 and prints the editability rule, Polish whole and no character cut in half: " + said5h);
  }
  /* The contradicted cell, rewritten to agree, is a different rule: check then prints read-only where the two opinions disagree. */
  if (process.env.ETIUDA_PLANTS === "off") console.log("  NOT RUN  5fq the editability rule's plant (ETIUDA_PLANTS=off)");
  else {
    const csc = path.join(process.env.WINDIR || "C:/Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
    const raw = fs.readFileSync(path.join(ROOT, "shell", "caret.cs"), "utf8");
    const from = 'return "? contradicted"; // plant:fact-contradict';
    const hits = raw.split("\n").filter(l => l.indexOf("plant:fact-contradict") >= 0);
    const mutant = raw.replace(from, 'return "ro"; // plant:fact-contradict');
    let turned = false, said = hits.length === 1 ? "marked" : "marker missing";
    if (hits.length === 1 && mutant !== raw && (process.platform !== "win32" || !fs.existsSync(csc))) {
      turned = true;
      said = "no compiler; the marked return is present and the mutation differs";
    } else if (hits.length === 1 && mutant !== raw) {
      const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-caret-plant-")), exe = path.join(lab, "caret.exe"), cs = path.join(lab, "caret.cs");
      try {
        fs.writeFileSync(cs, mutant, "utf8");
        const { spawnSync } = nodeRequire("node:child_process");
        const made = spawnSync(csc, ["-noconfig", "-nologo", "-optimize", "-target:winexe", "-platform:anycpu", "-r:System.dll",
          "-lib:" + path.join(path.dirname(csc), "WPF"), "-r:UIAutomationClient.dll", "-r:UIAutomationTypes.dll", "-out:" + exe, cs],
          { encoding: "utf8", windowsHide: true, timeout: 60000 });
        const ran = made.status === 0 ? spawnSync(exe, ["check"], { windowsHide: true, timeout: 10000 }) : null;
        const lines = ran && ran.stdout ? ran.stdout.toString("utf8").split("\n") : [];
        turned = lines.indexOf("fact ro ed ro") >= 0 && lines.indexOf("fact ro ed ? contradicted") < 0;
        said = made.status !== 0 ? "mutant did not compile: " + String(made.stdout || made.stderr).split("\n")[0]
          : "mutant check " + (turned ? "prints read-only for a contradiction" : "did not turn: " + lines.filter(l => l.indexOf("fact ro ed") === 0).join(" | "));
      } finally { fs.rmSync(lab, { recursive: true, force: true }); }
    }
    check(hits.length === 1 && mutant !== raw && turned,
      "5fq rewriting plant:fact-contradict so a read-only attribute and an editable second opinion agree makes check print read-only there: " + said);
  }
  /* THE PASTE IS STARTED FROM TWO PLACES: the copy, right after its clipboard write, and Enter after a reword, so no other handler presses a key. */
  const pasteNames = (shellBare.match(/\bcaretPaste\b/g) || []).length;
  const pasteAfterWrite = /clipboard\.writeText\(pickClipText\(v\.text,process\.platform\)\);caretPaste\(pickTarget,showPickNote\);hidePicker\(true\);/.test(shellCode);
  /* And Enter after a reword, only once the selection read again is the opening's. */
  const pasteAfterSame = /const same=!!\(got&&got\.words\)&&lf\(got\.words\)===lf\(was\);if\(same\)caretPaste\(target,showPickNote\);else showPickNote\(false\);/.test(shellCode);
  check(pasteNames === 3 && pasteAfterWrite && pasteAfterSame,
    "5g the caret helper's paste is started from two places: the copy, right after its clipboard write and before the picker hides, and Enter after a reword once the selection read again is the opening's: "
    + pasteNames + " mention(s) of caretPaste, " + (pasteAfterWrite ? "after the write" : "NOT after the write"));

  /* THE PACKAGE HOLDS EVERY FILE THE SHELL LOADS (Argon's updates review of 2026-11-01, finding 1: the folder mirror's syncer
     was required by the shell and missing from the builder's `files`, so a packaged desk on a folder team had no syncer). From
     shell/main.js, every file reached by a relative require or named as a worker script, followed through the files it reaches,
     is in electron-builder.js's `files`; and the three hand-written allowlists (tools/release.mjs, tests/shell-smoke.js,
     tests/reinstall.js) state that same list, sorted. */
  const reached = [], toRead = ["shell/main.js"];
  while (toRead.length) {
    const rel = toRead.shift();
    if (reached.indexOf(rel) >= 0) continue;
    reached.push(rel);
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8"), dir = path.posix.dirname(rel);
    const named = [...text.matchAll(/require\(\s*path\.join\(\s*__dirname\s*,((?:\s*"[\w.-]+"\s*,?)+)\)\s*\)/g)]
      .map(m => m[1].match(/"[\w.-]+"/g).map(s => s.slice(1, -1)).join("/"))
      .concat([...text.matchAll(/require\(\s*"(\.\/[\w./-]+)"\s*\)/g)].map(m => m[1].slice(2)))
      .concat([...text.matchAll(/path\.join\(\s*__dirname\s*,\s*"([\w.-]+-worker\.cjs)"\s*\)/g)].map(m => m[1]));
    for (const n of named) {
      const at = path.posix.normalize(dir + "/" + n);
      if (fs.existsSync(path.join(ROOT, at)) && reached.indexOf(at) < 0) toRead.push(at);
    }
  }
  const filesAt = builder.indexOf("files:");
  const filesList = filesAt < 0 ? [] : (builder.slice(filesAt, builder.indexOf("]", filesAt)).match(/"[\w./-]+"/g) || []).map(s => s.slice(1, -1));
  const missing = reached.filter(r => filesList.indexOf(r) < 0);
  const sortedFiles = filesList.slice().sort();
  const releaseText = fs.readFileSync(path.join(ROOT, "tools", "release.mjs"), "utf8");
  const expAt = releaseText.indexOf("const expected = [");
  const releaseList = expAt < 0 ? [] : (releaseText.slice(expAt, releaseText.indexOf("]", expAt)).match(/'[\w./-]+'/g) || []).map(s => s.slice(1, -1));
  const joined = sortedFiles.join(",");
  const smokeOk = fs.readFileSync(path.join(ROOT, "tests", "shell-smoke.js"), "utf8").indexOf('"' + joined + '"') >= 0;
  const reinstallOk = fs.readFileSync(path.join(ROOT, "tests", "reinstall.js"), "utf8").indexOf('"' + joined + '"') >= 0;
  /* The worker is started from its source text, which holds only while it reaches nothing by path: Node's own modules alone. */
  const workerCode = fs.readFileSync(path.join(ROOT, "shell", "folder", "syncer-worker.cjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const workerReach = [...workerCode.matchAll(/require\(\s*([^)]*)\)/g)].map(m => m[1].trim()).filter(r => !/^"node:[\w/]+"$/.test(r))
    .concat((workerCode.match(/\b__dirname\b|\b__filename\b/g) || []));
  check(reached.indexOf("shell/folder/syncer-worker.cjs") >= 0 && missing.length === 0
    && J(releaseList) === J(sortedFiles) && smokeOk && reinstallOk && workerReach.length === 0,
    "5h the package holds every file the shell loads (" + reached.length + " reached from shell/main.js; missing from the builder's files: "
    + (missing.join(", ") || "none") + "), and release.mjs " + (J(releaseList) === J(sortedFiles) ? "states" : "does NOT state")
    + ", shell-smoke " + (smokeOk ? "states" : "does NOT state") + " and reinstall " + (reinstallOk ? "states" : "does NOT state")
    + " the same " + sortedFiles.length + " files");
  /* 5i. A picture the shell reads beside itself at run time (the tray's, by a file name held in a variable, which 5h's
     require walk cannot see) is in the builder's files too: the desk shipped without its tray picture on 2026-11-09. */
  const mainText = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
  const pictures = [...new Set([...mainText.matchAll(/"([\w.-]+\.(?:ico|png))"/g)].map(m => "shell/" + m[1]))];
  /* A picture main.js names that is not under shell/ at all (renamed or deleted) would fail only at run time. */
  const picturesAbsent = pictures.filter(rel => !fs.existsSync(path.join(ROOT, rel)));
  const picturesMissing = pictures.filter(rel => filesList.indexOf(rel) < 0);
  check(pictures.indexOf("shell/etiuda.ico") >= 0 && picturesMissing.length === 0 && picturesAbsent.length === 0,
    "5i every picture shell/main.js names beside itself is under shell/ and in the builder's files (" + pictures.length
    + " named; not in the files: " + (picturesMissing.join(", ") || "none") + "; not on disk: " + (picturesAbsent.join(", ") || "none") + ")");

  /* ---- 6. the most used replies first, on this desk's own last 28 days ------------------- */
  console.log("\n[6/7] the most used replies first: the picker at rest, a search, and what stays as it was");
  /* Each scenario is a desk of its own: a fresh pack, so the day's count is made afresh for it. */
  const ago = n => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - n * 864e5).toISOString().slice(0, 10); };
  const fillers = n => Array.from({ length: n }, (_, i) => ({ id: "c-f" + i, c: "orders", t: "Filler " + i, en: "Filler reply " + i + "." }));
  const deskOf = extra => { PK.resetPack(); AS.setCats([]); AS.setIntentIdxs([]); AS.setCards(fillers(12).concat(extra || [])); };
  const A = { id: "c-a", c: "orders", t: "Alpha", en: "Alpha reply." }, B = { id: "c-b", c: "orders", t: "Bravo", en: "Bravo reply." };
  const GONE = { id: "c-gone", c: "orders", t: "Gone", _hidden: true, en: "Gone reply." };
  const copies = (id, n, day) => { for (let i = 0; i < n; i++) DS.bumpUse(PK.pack, id, day || ago(0)); };
  const rest = () => ids(PICK.pickRows("").slice(0, 9));
  const first9 = Array.from({ length: 9 }, (_, i) => "c-f" + i + "/0").join(" ");
  const fRows = (from, to) => Array.from({ length: to - from }, (_, i) => "c-f" + (from + i) + "/0").join(" ");

  deskOf([A, B, GONE]);
  check(rest() === first9,
    "6a with no copy counted the picker at rest is the desk's list, its first nine rows in catalog order: " + rest());
  deskOf([A, B, GONE]); copies("c-a", 3); copies("c-b", 1);
  check(rest() === "c-a/0 c-b/0 " + fRows(0, 7),
    "6b copies counted for two replies below the first nine bring them to the top, most copied first, the rest after in their order: " + rest());
  deskOf([A, B, GONE]); copies("c-f10", 2); copies("c-b", 2); copies("c-a", 1);
  check(rest() === "c-f10/0 c-b/0 c-a/0 " + fRows(0, 6),
    "6c equal counts keep the desk's order between them: " + rest());
  deskOf([A, B, GONE]); copies("c-gone", 9); copies("c-a", 1);
  check(rest() === "c-a/0 " + fRows(0, 8) && rest().indexOf("c-gone") < 0,
    "6d a put-away reply is not offered whatever its count: " + rest());
  deskOf([A, B, GONE]); copies("c-a", 50, ago(29));
  check(rest() === first9,
    "6e fifty copies dated 29 days back lift nothing: " + rest());
  deskOf([A, B, GONE]); copies("c-a", 50, ago(27));
  check(rest() === "c-a/0 " + fRows(0, 8),
    "6E and the same copies dated 27 days back do: " + rest());
  deskOf([A, Object.assign({}, B, { alt: 1, en: "Bravo one.\n\nBravo two." }), GONE]); copies("c-a", 2); copies("c-b", 1);
  check(rest() === "c-a/0 c-b/0 c-b/1 " + fRows(0, 6),
    "6f a counted reply with two blocks brings both, together: " + rest());
  deskOf([A, B, GONE]); copies("c-a", 3);
  const held0 = rest();
  const uses0 = uses("c-b");
  for (let i = 0; i < 30; i++) pickAnswer("copy", { id: "c-b", vi: 0 });
  check(held0 === "c-a/0 " + fRows(0, 8) && rest() === held0 && uses("c-b") === uses0 + 30,
    "6g thirty copies made while the desk works are counted but move nothing under the hand: " + uses("c-b") + " counted, " + rest());
  deskOf([A, B, GONE]); copies("c-a", 3); copies("c-b", 30);
  check(rest() === "c-b/0 c-a/0 " + fRows(0, 7),
    "6G and a desk that starts with those copies already counted offers them first: " + rest());

  /* A search: the sheet's example, six replies to one word, none counted until the fifth is. */
  const six = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"].map((w, i) => ({ id: "c-r" + (i + 1), c: "orders", t: "Refund " + w, en: "Reply " + (i + 1) + "." }));
  const find = q => RD.rankedCards(SP.cardSearchTerms(q), () => true);
  const rIds = r => r.hits.map(m => m.id).join(" ");
  deskOf([]); AS.setCards(six.map(c => Object.assign({}, c)));
  check(rIds(find("refund")) === "c-r1 c-r2 c-r3 c-r4 c-r5 c-r6",
    "6H a search with no copy counted is the desk's order: " + rIds(find("refund")));
  deskOf([]); AS.setCards(six.map(c => Object.assign({}, c))); copies("c-r5", 38);
  check(rIds(find("refund")) === "c-r1 c-r2 c-r5 c-r3 c-r4 c-r6",
    "6h the fifth of six matches, copied 38 times, lifts three places to a key of 2, and lands third behind the second, which stood ahead: " + rIds(find("refund")));
  check(ids(PICK.pickRows("refund")) === "c-r1/0 c-r2/0 c-r5/0 c-r3/0 c-r4/0 c-r6/0",
    "6i and the picker's search is the same order, the list and the picker sharing it: " + ids(PICK.pickRows("refund")));
  deskOf([]); AS.setCards(six.map(c => Object.assign({}, c))); copies("c-r4", 12); copies("c-r6", 28);
  check(rIds(find("refund")) === "c-r1 c-r2 c-r4 c-r3 c-r6 c-r5",
    "6j twelve copies lift a reply two places and twenty-eight three, a tie in the key going to the one that stood ahead: " + rIds(find("refund")));

  /* The tier line: a body-only match is never above a title match, whatever it has been copied. */
  const tiered = [{ id: "c-t1", c: "orders", t: "Refund timing", en: "Reply one." }, { id: "c-t2", c: "orders", t: "Refund steps", en: "Reply two." },
    { id: "c-body", c: "orders", t: "Delivery note", en: "Ask about the refund when it arrives." }];
  deskOf([]); AS.setCards(tiered.map(c => Object.assign({}, c))); copies("c-body", 500);
  const tr = find("refund");
  check(rIds(tr) === "c-t1 c-t2 c-body" && tr.sc.get(tr.hits[2]).tier > tr.sc.get(tr.hits[1]).tier,
    "6k a body-only match copied 500 times stays below every title match: " + rIds(tr) + ", tiers " + tr.hits.map(m => tr.sc.get(m).tier).join("/"));
  const sameTier = () => { deskOf([]); AS.setCards(tiered.map(c => Object.assign({}, c, c.id === "c-body" ? { t: "Refund note" } : {}))); };
  sameTier(); const tierBase = rIds(find("refund"));
  sameTier(); copies("c-body", 500);
  check(tierBase.split(" ")[0] !== "c-body" && rIds(find("refund")).split(" ")[0] === "c-body",
    "6K the same 500 on a card that matches in its title does lift it, from " + tierBase + " to " + rIds(find("refund")));

  /* The intent band: a card unlinked to the chosen intent is never above a linked one. */
  const banded = [{ id: "c-l1", c: "orders", t: "Refund one", allIntents: true, en: "Reply one." }, { id: "c-l2", c: "orders", t: "Refund two", allIntents: true, en: "Reply two." },
    { id: "c-u", c: "orders", t: "Refund three", en: "Reply three." }];
  deskOf([]); AS.setCards(banded.map(c => Object.assign({}, c))); AS.setIntentIdxs([0]); copies("c-u", 500);
  const br = find("refund");
  check(rIds(br) === "c-l1 c-l2 c-u" && br.sc.get(br.hits[0]).band === 0 && br.sc.get(br.hits[2]).band === 1,
    "6l a card outside the chosen intent copied 500 times stays below the linked ones: " + rIds(br) + ", bands " + br.hits.map(m => br.sc.get(m).band).join("/"));
  AS.setIntentIdxs([]);
  deskOf([]); AS.setCards(banded.map(c => Object.assign({}, c))); const bandBase = rIds(find("refund"));
  deskOf([]); AS.setCards(banded.map(c => Object.assign({}, c))); copies("c-u", 500);
  check(bandBase.split(" ")[0] !== "c-u" && rIds(find("refund")).split(" ")[0] === "c-u",
    "6L and with no intent chosen the same card is on its tier's footing and does rise, from " + bandBase + " to " + rIds(find("refund")));

  /* The desk's own list is not the picker's: counts leave its resting order exactly as it was. */
  deskOf([A, B]);
  const resting = RD.rankedCards([], () => true).hits.map(m => m.id).join(" ");
  deskOf([A, B]); copies("c-b", 40); copies("c-a", 9);
  check(RD.rankedCards([], () => true).hits.map(m => m.id).join(" ") === resting && resting.split(" ").slice(-2).join(" ") === "c-a c-b",
    "6m the desk's resting list is the same order with copies counted as without: " + resting.split(" ").slice(-3).join(" "));

  /* Row 1: On a desk where an unlinked card has 5 copies and the linked one has 0, taking the suggestion puts the linked card at row 0. */
  const bandedRow1 = [
    { id: "c-linked", c: "orders", t: "Linked reply", en: "Linked text.", intents: ["t:wick"] },
    { id: "c-unlinked", c: "orders", t: "Unlinked reply", en: "Unlinked text." }
  ];
  CM_R2.SW_STORE.en.push("lantern");
  CM_R2.setIntentIds(["wick"]);
  IID_R2.snapshotBaseIntents();
  deskOf([]); AS.setCards(bandedRow1.map(c => Object.assign({}, c)));
  copies("c-unlinked", 5);
  AS.setIntentIdxs([]);
  /* 6o2: THE REPLIES OF A SUGGESTION, LOOKED AT AND NOT TAKEN. On the same desk, the lookup answers the rows a take would, the
     linked card first, and leaves everything a take changes as it found it: the desk's chosen intents, the statistics' take
     count and intent counts, the copies counted, the desk's page. The measure is one function, and the plant runs the real
     take through it to show it sees a take. The page is then run over this desk (6o3): it draws these rows and sends
     no take. */
  const desk6 = () => JSON.stringify({ sel: AS.intentIdxs.slice(), taken: PK.pack.suggestTaken | 0, intents: PK.pack.intentCounts || null, use: PK.pack.useCounts || null });
  const before6 = desk6();
  const looked6 = pickAnswer("suggest-rows", { id: "t:wick" });
  const after6 = desk6();
  const stranger6 = pickAnswer("suggest-rows", { id: "t:nothing" });
  check(looked6 && looked6.rows && looked6.rows[0] && looked6.rows[0].id === "c-linked" && typeof looked6.count === "string"
    && after6 === before6 && stranger6 === null && desk6() === before6,
    "6o2 the lookup returns the linked card at row 0 as a take would, and changes nothing: the desk's chosen intents, the take count, the intent counts and the copies counted are as they were, and an unknown id answers null: "
    + JSON.stringify({ rows: looked6 && looked6.rows ? looked6.rows.map(r => r.id) : null, same: after6 === before6 }));
  if (process.env.ETIUDA_PLANTS === "off") console.log("  NOT RUN  6o2p the lookup's measure against a real take (ETIUDA_PLANTS=off)");
  else {
    pickAnswer("suggest-take", { id: "t:wick" });
    const afterTake6 = desk6();
    AS.setIntentIdxs([]);
    check(afterTake6 !== before6 && JSON.parse(afterTake6).taken === (JSON.parse(before6).taken | 0) + 1,
      "6o2p plant: the same measure sees a real take (one more taken, the intent chosen), so 6o2's equal reading is not a blind one: " + afterTake6);
    PK.pack.suggestTaken = JSON.parse(before6).taken;
    PK.pack.intentCounts = JSON.parse(before6).intents;
  }
  const desk6run = await runSelPage(script, { selected: "where is my lamp", suggest: [{ id: "t:wick", name: "Wick" }] },
    { stop: true, rowsOf: id => pickAnswer("suggest-rows", { id: id }) });
  check(desk6run.opened.looked.join() === "t:wick" && /Linked reply/.test(desk6run.html()) && desk6run.calls.length === 0 && desk6() === before6,
    "6o3 the page over this desk draws the linked card's reply as its row, sends nothing, and the desk is as it was: " + desk6run.html().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 120));
  const tookRow1 = pickAnswer("suggest-take", { id: "t:wick" });
  check(tookRow1 && tookRow1.rows && tookRow1.rows[0] && tookRow1.rows[0].id === "c-linked",
    "6o on a desk where an unlinked card has 5 copies and the linked one has 0, taking the suggestion puts the linked card at row 0: "
    + (tookRow1 && tookRow1.rows ? tookRow1.rows.map(r => r.id).join(" ") : "none"));
  AS.setIntentIdxs([]);
  PK.resetPack();
  CM_R2.SW_STORE.en.length = 0;
  if (intentsOrig_R2) {
    CM_R2.setIntentIds(intentsOrig_R2);
    IID_R2.snapshotBaseIntents();
  }

  TB.tabs.splice(0, TB.tabs.length);
  ST.ssSet(TB.TAB_KEY, "null");
  TB.initTabs();
  const whoTab = pickAnswer("who", { name: "Jan Kowalski" });
  const tabNow = TB.activeTabName();
  check(whoTab && whoTab.who === tabNow && tabNow === "Jan" && !/Anna/.test(tabNow),
    "1u with a conversation open, the picker's answer is that conversation's own label, which now carries the name (the first name, as a tab shows it): " + JSON.stringify([whoTab && whoTab.who, tabNow]));
  pickAnswer("who", { name: "Anna Nowak" });
  const SEQ = { id: "c-seq", c: "orders", t: "Sequence", alt: 1, seq: 1, en: "Step 1\n\nStep 2\n\nStep 3", next: [{ to: "c-b" }] };
  deskOf([SEQ, A, B]);
  rest();
  pickAnswer("copy", { id: "c-seq", vi: 0 });
  const afterStep1 = ids(PICK.pickRows("").slice(0, 3));
  SEQ._hidden = true;
  const hideSeq = ids(PICK.pickRows("").slice(0, 2));
  SEQ._hidden = false;
  B.c = "care";
  AS.setCats(["orders"]);
  const catFollow = ids(PICK.pickRows("").slice(0, 2));
  AS.setCats([]);
  B.c = "orders";
  pickAnswer("copy", { id: "c-seq", vi: 1 });
  const afterStep2 = ids(PICK.pickRows("").slice(0, 3));
  pickAnswer("copy", { id: "c-seq", vi: 2 });
  const afterStep3 = ids(PICK.pickRows("").slice(0, 3));
  check(afterStep1 === "c-seq/1 c-b/0 c-f0/0" && hideSeq === "c-b/0 c-f0/0" && catFollow === "c-seq/1 c-f0/0"
    && afterStep2 === "c-seq/2 c-b/0 c-f0/0" && afterStep3.startsWith("c-b/0"),
    "6n at rest the picker surfaces the active conversation's next step and follow-up chain ahead of most-used replies, leaving hidden and out-of-category cards out: "
    + afterStep1 + " | " + afterStep2 + " | " + afterStep3 + " | " + hideSeq + " | " + catFollow);

  /* ---- 7. the after-batch (board 901) ------------------------------------------------------- */
  console.log("\n[7/7] the list grouped and counted, the keys as they work, the conversation named, the hotkey made known");
  {
  /* A list that scrolls: every reply found, PICK_ROWS of them at most, counted in replies as the desk counts them. */
  deskOf([]);
  AS.setCards(Array.from({ length: 60 }, (_, i) => ({ id: "c-k" + i, c: "orders", t: "Kettle " + i, en: "Kettle reply " + i + "." })));
  const capped = pickAnswer("find", { q: "kettle" }), resting = pickAnswer("open");
  AS.setCards([{ id: "c-solo", c: "orders", t: "Solo", en: "Solo reply." },
    { id: "c-trio", c: "orders", t: "Trio", alt: 1, en: "Trio one.\n\nTrio two.\n\nTrio three." }]);
  const solo = pickAnswer("find", { q: "solo" }).count, trio = pickAnswer("find", { q: "trio" }).count, nothing = pickAnswer("find", { q: "zzqx" }).count;
  ST.lsSet("eUiLang", "pl");
  const plCounts = [pickAnswer("find", { q: "solo" }).count, pickAnswer("find", { q: "trio" }).count];
  AS.setCards(Array.from({ length: 60 }, (_, i) => ({ id: "c-k" + i, c: "orders", t: "Kettle " + i, en: "Kettle reply " + i + "." })));
  plCounts.push(pickAnswer("find", { q: "kettle" }).count);
  ST.lsDel("eUiLang");
  check(capped.rows.length === 50 && capped.count === "50 of 60 replies" && resting.rows.length === 50 && resting.count === "50 of 60 replies"
    && solo === "1 reply" && trio === "3 replies" && nothing === "" && plCounts.join("|") === "1 odpowiedź|3 odpowiedzi|50 z 60 odpowiedzi",
    "7a the list carries every reply up to fifty, past the nine number keys, and its count says how many of how many, in Polish too: "
    + JSON.stringify([capped.rows.length, capped.count, solo, trio, nothing, plCounts]));

  /* Shift+Enter is the desk's own Shift+Enter (copyEntrySel(true)): the next language, the same block or its last. */
  const KETTLE = { id: "c-kettle", c: "orders", t: "Kettle", alt: 1,
    en: "{GREET} {PAX},\nThe kettle leaves on Monday.\n\nThe kettle leaves on Friday.", pl: "Kettle words in the second language." };
  deskOf([KETTLE]);
  const txt = v => (v && typeof v.text === "string") ? v.text : null;
  const o0 = txt(pickAnswer("copy", { id: "c-kettle", vi: 0, other: 1 })), d0 = deskCopyOther("c-kettle", 0);
  const o1 = txt(pickAnswer("copy", { id: "c-kettle", vi: 1, other: 1 })), d1 = deskCopyOther("c-kettle", 1);
  const s1 = txt(pickAnswer("copy", { id: "c-kettle", vi: 1 })), e1 = deskCopy("c-kettle", 1);
  pickAnswer("copy", { id: "c-kettle", vi: 1 });
  const lastOther = txt(pickAnswer("copy", { last: true, other: 1 }));
  const plUses = ((PK.pack.useCounts || {})["c-kettle"] | 0);
  /* The desk's own key copies nothing there either, and says so in a toast this stand-in has no room for. */
  const noOther = [txt(pickAnswer("copy", { id: "c-f0", vi: 0, other: 1 })), null];
  check(o0 === d0 && /second language/.test(o0 || "") && o1 === d1 && o1 === o0 && s1 === e1 && /Friday/.test(s1 || "") && lastOther === o0
    && plUses > 0 && noOther[0] === noOther[1],
    "7b Shift+Enter copies what the desk's own Shift+Enter copies: the other language, at the same block or its last, the reply copied"
    + " last included, and nothing where the desk has nothing: " + JSON.stringify([o0 === d0, o1 === d1, s1 === e1, lastOther === o0, noOther]));

  /* The page's words for its keys and its note, each line holding {KEY} where its key goes; the other language by code. */
  const w7 = pickAnswer("open").words;
  AS.putLang("pl");
  const wPl = pickAnswer("open").words.keyOther;
  AS.putLang("en");
  const CM = await import(MOD("content-model.js"));
  const langsWere = CM.CONTENT_LANGS.slice();
  CM.setContentLangs(["en"]);
  const wOne = pickAnswer("open").words.keyOther;
  CM.setContentLangs(langsWere);
  check(w7.keyCopy === "{KEY} copies, and pastes where it can" && w7.keyOther === "{KEY} in PL" && wPl === "{KEY} in EN" && wOne === "" && w7.keyClose === "{KEY} closes"
    && w7.pasted === "Pasted" && w7.copied === "Copied, press Ctrl+V" && w7.who === "Etiuda fills the reply in for this conversation",
    "7c the page is given the words for its keys and its note, the other language named by its code, and none where there is one: "
    + JSON.stringify([w7.keyCopy, w7.keyOther, wPl, wOne, w7.keyClose, w7.pasted, w7.copied]));

  /* THE PAGE, run again over a stand-in that holds the chip, the count and the legend too. */
  const pg = {};
  let focusedEl = null;
  const mk = () => ({ value: "", placeholder: "", hidden: false, title: "", textContent: "", innerHTML: "", attrs: {}, focus() { focusedEl = this; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, querySelectorAll: () => [], addEventListener: (t, fn) => { pg[t] = fn; } });
  const els7 = { q: mk(), rows: mk(), who: mk(), lang: mk(), count: mk(), keys: mk() };
  els7.lang.hidden = true;
  els7.q.addEventListener = (t, fn) => { pg["q:" + t] = fn; };
  els7.rows.addEventListener = (t, fn) => { pg["box:" + t] = fn; };
  els7.who.addEventListener = (t, fn) => { pg["who:" + t] = fn; };
  els7.lang.addEventListener = (t, fn) => { pg["lang:" + t] = fn; };
  const sent7 = [];
  let open7 = null, found7 = { rows: [], count: "" };
  const pick7 = { find: () => Promise.resolve(JSON.stringify(found7)),
    tab: id => Promise.resolve(JSON.stringify(pickAnswer("tab", { id }))),
    who: (name, q) => Promise.resolve(JSON.stringify(pickAnswer("who", { name, q }))),
    lang: () => Promise.resolve(JSON.stringify(pickAnswer("lang", {}))),
    copy: s => { sent7.push(s); }, close: () => {}, ready: () => {}, onOpen: fn => { open7 = fn; } };
  new Function("window", "document", script)({ E_PICK: pick7 },
    { getElementById: id => els7[id] || null, documentElement: { style: { setProperty() {} }, dataset: {}, classList: { toggle() {} }, lang: "" } });
  const row = (id, vi, extra) => Object.assign({ id: id, vi: vi, t: "T " + id, x: "x " + id + vi, tag: "" }, extra || {});
  const W7 = { again: "again", stamp: "Commits the firm", who: "Filled for", langTitle: "Click to switch replies to the next language", keyCopy: "{KEY} copies", keyOther: "{KEY} in PL", keyClose: "{KEY} closes" };
  const openWith = (rows, extra) => { sent7.length = 0; els7.q.value = ""; open7(JSON.stringify(Object.assign({ rows: rows, words: W7 }, extra || {}))); };
  const key7 = (k, code, mods) => { pg["q:keydown"](Object.assign({ key: k, code: code || k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false,
    preventDefault() {} }, mods || {})); return sent7[sent7.length - 1] || "nothing"; };
  const grp = [row("a", 0), row("g", 0, { tag: "1/3", commits: 1 }), row("g", 1, { tag: "2/3", commits: 1 }), row("g", 2, { tag: "3/3", commits: 1 }), row("c", 0)];
  openWith(grp, { last: row("a", 0), count: "5 replies", who: "Marta", name: "Marta" });
  const h7 = els7.rows.innerHTML, lis7 = h7.split("</li>").filter(x => x.indexOf("<li") > -1);
  const shape = lis7.map(li => (/class="grp"/.test(li) ? "head:" + ((/<span class="t">([^<]*)</.exec(li) || [])[1]) + (/class="st"/.test(li) ? "+st" : "")
    : ((/<kbd>([^<]*)<\/kbd>/.exec(li) || [])[1] || "-") + (/class="in/.test(li) ? " in " + ((/<span class="g">([^<]*)</.exec(li) || [])[1]) : "")
      + (/class="in[^"]*"/.test(li) && /<span class="t">/.test(li) ? " TITLE-AGAIN" : ""))).join(" | ");
  const ctrl2 = key7("2", "Digit2", { ctrlKey: true });
  check(shape === "Ctrl+0 | head:T g+st | Ctrl+1 in 1/3 | Ctrl+2 in 2/3 | Ctrl+3 in 3/3 | Ctrl+4" && ctrl2 === '{"id":"g","vi":1}',
    "7d a card of several replies is one group, its title and stamp once over its replies, each by its tag; every row shows its key as Ctrl"
    + " and its digit, the reply copied last Ctrl+0, and Ctrl+2 takes the row that shows it: " + shape + " / " + ctrl2);

  openWith(grp, { last: row("a", 0), count: "5 replies", who: "Marta", name: "Marta" });
  const sEnterRest = key7("Enter", "Enter", { shiftKey: true });
  openWith(grp, { last: row("a", 0) });
  key7("ArrowDown", "ArrowDown");
  const sEnter = key7("Enter", "Enter", { shiftKey: true });
  openWith(grp, { last: row("a", 0) });
  const sDigit = key7("3", "Digit3", { ctrlKey: true, shiftKey: true });
  openWith(grp, { last: row("a", 0) });
  pg["box:click"]({ shiftKey: true, target: { closest: () => ({ dataset: { i: "4" } }) } });
  const sClick = sent7[sent7.length - 1];
  openWith(grp, { last: row("a", 0) });
  const plain = key7("Enter", "Enter");
  check(sEnterRest === '{"id":"g","vi":0,"other":1}' && sEnter === '{"id":"g","vi":1,"other":1}' && sDigit === '{"id":"g","vi":2,"other":1}'
    && sClick === '{"id":"c","vi":0,"other":1}' && plain === '{"id":"g","vi":0}',
    "7e Shift with Enter, with Ctrl and a digit, or with a click takes the row in the other language; without Shift nothing changes: "
    + [sEnterRest, sEnter, sDigit, sClick, plain].join(" "));

  openWith(grp, { last: row("a", 0), count: "5 replies", who: "Marta", name: "Marta" });
  const foot = [els7.count.textContent, els7.keys.innerHTML, els7.who.hidden, els7.who.title, els7.who.value === "Marta"];
  found7 = { rows: [row("c", 0)], count: "1 reply" };
  els7.q.value = "c"; pg["q:input"]();
  await tick(5);
  const afterFind = els7.count.textContent;
  found7 = { rows: [], count: "" };
  els7.q.value = "zz"; pg["q:input"]();
  await tick(5);
  const afterNone = els7.count.textContent;
  open7(JSON.stringify({ rows: grp, words: Object.assign({}, W7, { keyOther: "" }), count: "5 replies", who: "" }));
  const lone = [els7.keys.innerHTML, els7.who.hidden];
  check(foot[0] === "5 replies" && foot[1] === "<span><kbd>Enter</kbd> copies</span><span><kbd>Shift+Enter</kbd> in PL</span><span><kbd>Esc</kbd> closes</span>"
    && foot[2] === false && foot[3] === "Filled for" && foot[4] && afterFind === "1 reply" && afterNone === ""
    && lone[0] === "<span><kbd>Enter</kbd> copies</span><span><kbd>Esc</kbd> closes</span>" && lone[1] === true,
    "7f under the list the count follows what is found and the keys are shown as they work, Shift+Enter only where there is another"
    + " language; the chip names the conversation the reply is filled for, and hides where there is none: " + JSON.stringify([foot, afterFind, afterNone, lone]));

  const twenty = Array.from({ length: 20 }, (_, i) => row("p" + i, 0));
  openWith(twenty);
  const pages = [];
  for (let i = 0; i < 3; i++) { key7("PageDown", "PageDown"); pages.push((/id="r(\d+)"[^>]*class="on"/.exec(els7.rows.innerHTML) || [])[1]); }
  const bottom = key7("Enter", "Enter");
  for (let i = 0; i < 3; i++) { key7("PageUp", "PageUp"); pages.push((/id="r(\d+)"[^>]*class="on"/.exec(els7.rows.innerHTML) || [])[1]); }
  const chips = (els7.rows.innerHTML.match(/<kbd>Ctrl\+\d<\/kbd>/g) || []).length;
  check(pages.join(",") === "8,16,19,11,3,0" && bottom === '{"id":"p19","vi":0}' && chips === 9,
    "7g Page Down and Page Up move the mark eight rows and stop at either end, and only the first nine rows carry a key: "
    + pages.join(",") + ", " + bottom + ", " + chips + " key(s)");

  /* THE HOTKEY MADE KNOWN: a combination another program holds is said when the desk is up, with the way to another. */
  const H7 = await import(MOD("host.js"));
  const HKS = await import(MOD("hooks.js"));
  const madeEls = [], byIdEls = {};
  const el7 = tag => { const e = { tagName: tag, children: [], className: "", textContent: "", attrs: {}, style: {},
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); c.parentNode = this; if (c.id) byIdEls[c.id] = c; return c; },
    remove() { this.gone = true; if (this.id && byIdEls[this.id] === this) delete byIdEls[this.id]; }, get firstChild() { return this.children.filter(c => !c.gone)[0] || null; },
    getBoundingClientRect: () => ({ bottom: 40 }) }; madeEls.push(e); return e; };
  const docWas = globalThis.document, addWas = globalThis.addEventListener, hostWas = globalThis.window.E_HOST, openWas = HKS.hooks.openSettings;
  let settingsAt = null;
  const host7 = st => { globalThis.window.E_HOST = { hotkeyState: () => st, openPicker: () => {} }; };
  const textOf = n => (n.textContent || "") + n.children.map(textOf).join("");
  const notice7 = st => {
    Object.keys(byIdEls).forEach(k => delete byIdEls[k]);
    host7(st);
    PICK.hotkeyNotice();
    return byIdEls.eHotkeyNote || null;
  };
  let taken7, held7, none7, acted = "";
  try {
    globalThis.addEventListener = () => {};
    globalThis.removeEventListener = () => {};
    globalThis.document = Object.assign({}, docWas, { createElement: el7, createTextNode: s => ({ textContent: s, children: [] }),
      getElementById: id => byIdEls[id] || null,
      querySelector: s => (s === ".row" ? { getBoundingClientRect: () => ({ bottom: 40 }) } : null),
      body: Object.assign({}, docWas.body, { appendChild: c => { if (c.id) byIdEls[c.id] = c; return c; } }) });
    HKS.hooks.openSettings = at => { settingsAt = at; };
    const d = notice7({ accel: "Control+Shift+Space", held: false, taken: true });
    taken7 = d ? textOf(d) : "none";
    const acts = d ? d.children.find(c => c.className === "tour-actions") : null, go = acts ? acts.children[0] : null;
    if (go && go.onclick) { go.onclick(); acted = (d.gone ? "gone" : "standing") + "/" + settingsAt; }
    held7 = notice7({ accel: "Control+Shift+Space", held: true, taken: false });
    globalThis.window.E_HOST = undefined;
    Object.keys(byIdEls).forEach(k => delete byIdEls[k]);
    PICK.hotkeyNotice();
    none7 = byIdEls.eHotkeyNote || null;
  } finally {
    globalThis.document = docWas; globalThis.addEventListener = addWas; delete globalThis.removeEventListener; HKS.hooks.openSettings = openWas;
    if (hostWas === undefined) delete globalThis.window.E_HOST; else globalThis.window.E_HOST = hostWas;
  }
  check(taken7 === "Ctrl+Shift+Space belongs to another program just now. A combination of Etiuda's own, chosen in Settings, opens Quick replies over any window.Choose a combinationDismiss"
    && acted === "gone/keys" && held7 === null && none7 === null && H7.eHotkeyLabel("Control+Alt+F9") === "Ctrl+Alt+F9",
    "7h a combination another program holds is said when the desk is up, naming it, with a button to Settings' keys that takes the"
    + " notice down; one held, or no host, says nothing: " + JSON.stringify([taken7, acted, !!held7, !!none7]));

  /* THE MENU'S ROW, where the host has a picker: its name and the combination held, and a click that opens it. */
  const HM = await import(MOD("header-menus.js"));
  const mrow = { hidden: true, innerHTML: "", title: "" };
  const menuEl = { hidden: false, contains: () => false, querySelectorAll: () => [] };
  const btnEl = { classList: { add() {}, remove() {} }, setAttribute() {} };
  const elsWere = Object.assign({}, els), hostWas2 = globalThis.window.E_HOST, addWas2 = globalThis.addEventListener;
  let pickerOpened = 0;
  let rows7 = [], titles7 = [], clicked = "";
  const rowFor = st => {
    globalThis.window.E_HOST = st === undefined ? undefined : Object.assign({ hotkeyState: () => st },
      st && st.noDoor ? {} : { openPicker: () => { pickerOpened++; } });
    HM.syncSettingsMenu();
    titles7.push(mrow.title);
    return mrow.hidden ? "hidden" : mrow.innerHTML;
  };
  try {
    Object.assign(els, { "#menuPicker": mrow, "#settingsMenu": menuEl, "#settingsBtn": btnEl, "#moreBtn": {}, "#moreMenu": { hidden: true } });
    globalThis.addEventListener = () => {};
    rows7 = [rowFor({ accel: "Control+Shift+Space", held: true, taken: false }), rowFor({ accel: "Control+Shift+Space", held: false, taken: true }),
      rowFor({ accel: "", held: false, taken: false, noDoor: true }), rowFor(undefined)];
    rowFor({ accel: "Control+Shift+Space", held: true, taken: false });
    HM.wireHeaderMenus();
    menuEl.hidden = false;
    menuEl.onclick({ target: { closest: () => ({ dataset: { act: "picker" } }) } });
    clicked = pickerOpened + "/" + (menuEl.hidden ? "shut" : "open");
  } finally {
    Object.keys(els).forEach(k => { if (!(k in elsWere)) delete els[k]; });
    globalThis.addEventListener = addWas2;
    if (hostWas2 === undefined) delete globalThis.window.E_HOST; else globalThis.window.E_HOST = hostWas2;
  }
  const pickerMark = '<svg class="sx-ic" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4.5h6v6M20.5 4.5l-6 6M10.5 20.5h-6v-6M4.5 20.5l6-6"/></svg>';
  const titleHeld = "The replies beside the pointer, over any program: Ctrl+Shift+Space brings them from anywhere, and Settings is where the combination is changed.";
  const titleNotHeld = "The replies beside the pointer, over any program; a combination that brings them from anywhere is chosen in Settings.";
  check(rows7.join(" | ") === pickerMark + "<span>Quick replies</span> | "
    + pickerMark + "<span>Quick replies</span> | hidden | hidden"
    && titles7[0] === titleHeld && titles7[1] === titleNotHeld && clicked === "1/shut",
    "7m the Menu has a row for the picker without kbd, and its tooltip names the live combination when held ("
    + rows7.join(" | ") + " / " + clicked + ")");

  /* THE TOUR'S STEP, the table and its helpers sliced out of tour.js and run over a scope of stand-ins, as tests/test.js runs it. */
  const TSRC = fs.readFileSync(path.join(ROOT, "src", "modules", "tour.js"), "utf8");
  const between = (src, a, b) => { const i = src.indexOf(a), j = i < 0 ? -1 : src.indexOf(b, i); return i < 0 || j < 0 ? "" : src.slice(i, j); };
  let hk7 = null, actsHeard = 0, doorKnocks = 0;
  const own7 = { eHotkey: () => hk7, eHotkeyLabel: H7.eHotkeyLabel, esc: s => String(s), t: s => s, tourActSoon: () => { actsHeard++; },
    eOpenPicker: () => { doorKnocks++; return true; }, menuTarget: () => ({}), menuSide: () => "left" };
  const scope7 = new Proxy({}, { has: (o, k) => typeof k === "string",
    get: (o, k) => k === Symbol.unscopables ? undefined : k in own7 ? own7[k] : k in globalThis ? globalThis[k] : () => undefined,
    set: (o, k, v) => { own7[k] = v; return true; } });
  let TT = null;
  try {
    TT = new Function("scope", "with(scope){\n" + between(TSRC, "let tourPicks=", "// The wheel waits") + "\n"
      + between(TSRC, "const TOUR_STEPS=[", "\n];\n") + "\n];\nreturn { TOUR_STEPS, tourHeardPick };\n}")(scope7);
  } catch (e) { TT = null; }
  const tids = TT ? TT.TOUR_STEPS.map(s => s.id) : [], ps = TT ? TT.TOUR_STEPS.find(s => s.id === "picker") : null,
    pi = TT ? TT.TOUR_STEPS.find(s => s.id === "pickerIn") : null;
  let tourSays = "no step";
  if (ps && pi) {
    const whens = [null, { accel: "Control+Shift+Space", held: false, taken: true }, { accel: "Control+Shift+Space", held: true, taken: false }]
      .map(h => { hk7 = h; return ps.when(); });
    const chipsSeen = (ps.body().match(/<kbd>Ctrl<\/kbd>\+<kbd>Shift<\/kbd>\+<kbd>Space<\/kbd>/g) || []).length;
    own7.tourRunning = true;
    own7.tourIdx = tids.indexOf("menu");
    TT.tourHeardPick();
    const doneElse = ps.done(), piElse = pi.when();
    own7.tourIdx = tids.indexOf("picker");
    const doneBefore = ps.done(), piBefore = pi.when();
    TT.tourHeardPick();
    const doneAfter = ps.done(), piAfter = pi.when();
    tourSays = JSON.stringify([tids.indexOf("picker") - tids.indexOf("menu"), tids.indexOf("pickerIn") - tids.indexOf("picker"),
      whens, chipsSeen, doneElse, piElse, doneBefore, piBefore, doneAfter, piAfter, !ps.open, actsHeard, doorKnocks,
      ps.title, pi.title, ps.menu, pi.menu, ps.side === own7.menuSide, !!pi.elsewhere && !pi.sel]);
  }
  const resets = /function showTourStep\(i\)\{[\s\S]*?if\(step\.id!=="pickerIn"\) tourPickerOpened=false;[\s\S]*?\n\}/.test(TSRC);
  const heard = /if\(op==="open"\)\{\s*try\{ tourHeardPick\(\); \}catch\(e\)\{\}/.test(fs.readFileSync(path.join(ROOT, "src", "modules", "pick.js"), "utf8"));
  check(tourSays === JSON.stringify([1, 1, [false, false, true], 2, false, false, false, false, true, true, true, 1, 0,
    "Quick replies", "Quick replies", true, true, true, true]) && resets && heard,
    "7n the tour has a step for the picker straight after the Menu's and the window's own step after it, carried by the window's page, without opening the picker on Next: " + tourSays + (resets ? "" : ", NO reset at each step")
    + (heard ? "" : ", the picker's opening NOT heard"));

  /* The global picker switches and opens conversations with the desk's own tab keys. */
  TB.tabs.splice(0, TB.tabs.length);
  ST.ssSet(TB.TAB_KEY, "null");
  TB.initTabs();
  const deskPax = document.getElementById("pax");
  deskPax.value = "Anna Nowak";
  TB.scheduleTabSave();
  TB.addTab();
  deskPax.value = "Jan Kowalski";
  TB.scheduleTabSave();
  const tabBefore = TB.activeTabName();
  const openTab = pickAnswer("open");
  open7(JSON.stringify(openTab));
  const whoBefore = els7.who.value;
  key7("Tab", "Tab", { ctrlKey: true });
  await tick(10);
  const tabAfter = TB.activeTabName();
  const deskPaxAfter = deskPax.value;
  const whoAfter = els7.who.value;
  check(tabBefore === "Jan" && whoBefore === "Jan Kowalski" && tabAfter === "Anna" && deskPaxAfter === "Anna Nowak" && whoAfter === "Anna Nowak",
    "7o with two conversations on the desk, the default Ctrl+Tab in the picker brings the other conversation to the front of the desk and the picker's field shows its name: "
    + JSON.stringify([tabBefore, whoBefore, tabAfter, deskPaxAfter, whoAfter]));

  focusedEl = null;
  key7("t", "KeyT", { ctrlKey: true });
  await tick(10);
  const deskPaxAfterNew = deskPax.value;
  const whoAfterNew = els7.who.value;
  check(TB.tabs.length === 3 && deskPaxAfterNew === "" && whoAfterNew === "" && focusedEl === els7.who,
    "7p Ctrl+T opens a new conversation on the desk, the field is empty and focused: "
    + JSON.stringify([TB.tabs.length, deskPaxAfterNew, whoAfterNew, focusedEl === els7.who]));

  /* A name typed in the picker and not yet sent reaches the conversation it was typed for before a tab key switches. */
  open7(JSON.stringify(pickAnswer("open")));
  const left7 = TB.tabs[TB.tabs.length - 1], leftName7 = TB.activeTabName();
  els7.who.value = "Marek Lis";
  if (pg["who:keydown"]) pg["who:keydown"]({ key: "Tab", code: "Tab", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, preventDefault() {} });
  await tick(10);
  check(left7.pax === "Marek Lis" && TB.activeTabName() !== leftName7 && els7.who.value === "Anna Nowak",
    "7v a name typed in the picker and not yet sent stays with the conversation it was typed for when Ctrl+Tab switches: "
    + JSON.stringify([left7.pax, leftName7, TB.activeTabName(), els7.who.value]));

  const tabsCount7 = TB.tabs.length;
  const tabActive7 = TB.activeTabName();
  const outside7 = pickAnswer("tab", { id: "tabClose" });
  const bogus7 = pickAnswer("tab", { id: "other" });
  const empty7 = pickAnswer("tab", {});
  check(outside7 === null && bogus7 === null && empty7 === null && TB.tabs.length === tabsCount7 && TB.activeTabName() === tabActive7,
    "7q op \"tab\" with an id outside the three runs nothing and answers null: "
    + JSON.stringify([outside7, bogus7, empty7, TB.tabs.length === tabsCount7, TB.activeTabName() === tabActive7]));

  /* The agent's own bindings reach the picker: a rebound new-tab key and a cleared next-tab key, never the defaults. */
  ST.lsSet("eShortcuts", JSON.stringify({ tabNew: { code: "KeyN", key: "n", ctrl: 1, alt: 0, shift: 1, meta: 0 },
    tabNext: { code: "", key: "", ctrl: 0, alt: 0, shift: 0, meta: 0 } }));
  SCM.loadShortcuts();
  const bound7 = (pickAnswer("open") || {}).chords || {};
  ST.lsDel("eShortcuts");
  SCM.loadShortcuts();
  const newAt7 = (bound7.tabNew || [])[0] || {}, nextAt7 = (bound7.tabNext || [])[0] || {};
  check(newAt7.code === "KeyN" && newAt7.shift === 1 && !nextAt7.code && !nextAt7.key,
    "7r the picker is handed the agent's own tab keys, a rebound one as rebound and a cleared one as cleared: "
    + JSON.stringify([newAt7, nextAt7]));

  /* The global picker shows the conversation's language and switches it with a click. */
  const TWO_LANG = [
    { id: "c-tl", c: "orders", t: "Delivery note", en: "Your package leaves today.", pl: "Twoja paczka wyrusza dzisiaj." }
  ];
  deskOf(TWO_LANG);
  AS.putLang("en");
  const openAns7 = pickAnswer("open");
  open7(JSON.stringify(openAns7));
  const openLangOk = openAns7 && openAns7.lang === "en" && openAns7.langs === 2;
  const badgeBefore = [els7.lang.hidden, els7.lang.textContent];
  const rowsBeforeEn = els7.rows.innerHTML.indexOf("Your package leaves today.") > -1;
  if (typeof pg["lang:click"] === "function") pg["lang:click"]();
  await tick(10);
  const deskLangAfter = AS.lang;
  const badgeAfter = [els7.lang.hidden, els7.lang.textContent];
  const rowsAfterPl = els7.rows.innerHTML.indexOf("Twoja paczka wyrusza dzisiaj.") > -1;
  check(openLangOk && badgeBefore[0] === false && badgeBefore[1] === "EN" && rowsBeforeEn
    && deskLangAfter === "pl" && badgeAfter[0] === false && badgeAfter[1] === "PL" && rowsAfterPl && focusedEl === els7.q,
    "7s with a two-language catalog the open answer's lang is the desk's and the badge shows its code; a click switches the desk's lang to the other, and the rows and the badge then show the other language: "
    + JSON.stringify([openAns7 && openAns7.lang, badgeBefore, deskLangAfter, badgeAfter, focusedEl === els7.q]));

  LS.cancelLangTail();
  const langsOrig = CM.CONTENT_LANGS.slice();
  CM.setContentLangs(["en"]);
  AS.putLang("en");
  const openOne7 = pickAnswer("open");
  open7(JSON.stringify(openOne7));
  const badgeHiddenOne = els7.lang.hidden;
  const langBeforeOne = AS.lang;
  const langAnsOne = pickAnswer("lang", {});
  const langAfterOne = AS.lang;
  CM.setContentLangs(langsOrig);
  check(openOne7 && openOne7.langs === 1 && badgeHiddenOne === true && langAnsOne && langAnsOne.langs === 1 && langBeforeOne === "en" && langAfterOne === "en",
    "7t with a one-language catalog the badge is hidden and op \"lang\" changes nothing: "
    + JSON.stringify([badgeHiddenOne, langBeforeOne, langAfterOne]));

  els7.q.value = "/";
  key7("/", "Slash");
  await tick(10);
  check(els7.q.value === "/" && AS.lang === "en",
    "7u the slash typed into #q stays in #q and switches nothing: "
    + JSON.stringify([els7.q.value, AS.lang]));

  /* The keystroke's rows are the desk's own find: the same excerpts and the same count, and the find is not asked. */
  els["#intent"].value = "";
  AS.putLang("en");
  AS.setIntentIdxs([]);
  const xOf = html => [...String(html || "").matchAll(/<span class="x">([^<]*)<\/span>/g)].map(m => m[1]);
  let hops = 0;
  const findWas = pick7.find;
  pick7.find = q => { hops++; return findWas(q); };
  const mismatches = [];
  const expectFind = (label, q) => {
    const want = pickAnswer("find", { q: q });
    const before = hops;
    els7.q.value = q;
    pg["q:input"]();
    const gotX = xOf(els7.rows.innerHTML).join(" | ");
    const wantX = (want.rows || []).map(r => r.x).join(" | ");
    const gotC = els7.count.textContent;
    if (gotX !== wantX || gotC !== (want.count || "") || hops !== before)
      mismatches.push(label + " [" + gotC + " / " + (want.count || "") + "] " + gotX + " != " + wantX + " hops " + (hops - before));
  };
  const prep = list => { PK.resetPack(); AS.setCats([]); AS.setIntentIdxs([]); AS.setCards(list.map(c => Object.assign({}, c))); };
  const openNow = () => { SP.dropCatalogVocab(); open7(JSON.stringify(pickAnswer("open"))); };
  const bagPl = { id: "c-bag", c: "orders", t: "Bagaz", en: "Bagaż travels today." };
  const sampleCards = CARDS.map(c => Object.assign({}, c)).concat([bagPl]);
  prep(sampleCards);
  openNow();
  let queries7w = 0;
  const trackFind = (label, q) => { queries7w++; expectFind(label, q); };
  const typoOf = w => {
    if (w.length >= 2) {
      const i = w.length >= 3 ? 1 : 0;
      const ch = w.split("");
      const tmp = ch[i]; ch[i] = ch[i + 1]; ch[i + 1] = tmp;
      const s = ch.join("");
      if (s !== w) return s;
    }
    return w.slice(0, -1) + (w.endsWith("x") ? "y" : "x");
  };
  const sampleVocab = [...SP.catalogVocab().keys()].sort();
  sampleVocab.forEach(w => {
    trackFind("vocab:" + w, w);
    trackFind("typo:" + w, typoOf(w));
  });
  ["zzqx"].forEach(q => trackFind(q, q));
  if (!pickAnswer("find", { q: "dleivery" }).rows.some(r => r.id === "c-lamp")) mismatches.push("dleivery missed the lamp");
  if (!pickAnswer("find", { q: "bagaz" }).rows.some(r => r.id === "c-bag")) mismatches.push("bagaz missed the bag");
  queries7w++;
  const emptyWant = pickAnswer("find", { q: "" });
  const emptyHops = hops;
  els7.q.value = "";
  pg["q:input"]();
  if (els7.count.textContent !== (emptyWant.count || "") || hops !== emptyHops) mismatches.push("empty count " + els7.count.textContent + " != " + (emptyWant.count || ""));
  els7.who.value = "Zofia Zielinska";
  pg["who:blur"]();
  await tick(0);
  trackFind("who", "zofia");
  const six = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"].map((w, i) => ({ id: "c-r" + (i + 1), c: "orders", t: "Refund " + w, en: "Reply " + (i + 1) + "." }));
  prep(six);
  copies("c-r5", 38);
  openNow();
  trackFind("lift", "refund");
  if (ids(pickAnswer("find", { q: "refund" }).rows) !== "c-r1/0 c-r2/0 c-r5/0 c-r3/0 c-r4/0 c-r6/0") mismatches.push("lift order " + ids(pickAnswer("find", { q: "refund" }).rows));
  const tiered = [{ id: "c-t1", c: "orders", t: "Refund timing", en: "Reply one." }, { id: "c-t2", c: "orders", t: "Refund steps", en: "Reply two." },
    { id: "c-body", c: "orders", t: "Delivery note", en: "Ask about the refund when it arrives." }];
  prep(tiered);
  copies("c-body", 500);
  openNow();
  trackFind("tier", "refund");
  if (ids(pickAnswer("find", { q: "refund" }).rows) !== "c-t1/0 c-t2/0 c-body/0") mismatches.push("tier order " + ids(pickAnswer("find", { q: "refund" }).rows));
  const banded = [{ id: "c-l1", c: "orders", t: "Refund one", allIntents: true, en: "Reply one." }, { id: "c-l2", c: "orders", t: "Refund two", allIntents: true, en: "Reply two." },
    { id: "c-u", c: "orders", t: "Refund three", en: "Reply three." }];
  prep(banded);
  AS.setIntentIdxs([0]);
  copies("c-u", 500);
  openNow();
  trackFind("band", "refund");
  if (ids(pickAnswer("find", { q: "refund" }).rows) !== "c-l1/0 c-l2/0 c-u/0") mismatches.push("band order " + ids(pickAnswer("find", { q: "refund" }).rows));
  AS.setIntentIdxs([]);
  const kettles = Array.from({ length: 60 }, (_, i) => ({ id: "c-k" + i, c: "orders", t: "Kettle " + i, en: "Kettle reply " + i + "." }));
  prep(kettles);
  openNow();
  trackFind("cap", "kettle");
  const capDesk = pickAnswer("find", { q: "kettle" });
  if (capDesk.rows.length !== 50 || capDesk.count !== "50 of 60 replies") mismatches.push("cap desk " + capDesk.rows.length + " " + capDesk.count);
  ST.lsSet("eUiLang", "pl");
  openNow();
  trackFind("pl", "kettle");
  if (pickAnswer("find", { q: "kettle" }).count !== "50 z 60 odpowiedzi") mismatches.push("pl desk " + pickAnswer("find", { q: "kettle" }).count);
  ST.lsDel("eUiLang");
  AS.putLang("en");
  AS.setCards(CARDS.map(c => Object.assign({}, c)));
  SP.dropCatalogVocab();
  pick7.find = findWas;
  check(mismatches.length === 0 && hops === 0,
    "7w a keystroke filters on the rows the open handed over, the same excerpts and the same count as the desk, and still no IPC: "
    + (mismatches.length ? mismatches.slice(0, 3).join(" || ") : "matched (" + queries7w + " queries)") + ", hops " + hops);

  /* 7x ranking constants (weights, tiers, PROX, fold table) in shell/main.js match src/modules */
  {
    const parseObj = txt => {
      try { return (new Function("return (" + txt + ")"))(); } catch { return null; }
    };
    const readConstantsDiffs = (shellSrc, wordsSrc, scoringSrc, scoreSrc) => {
      const deskFoldMatch = wordsSrc.match(/const\s+FOLD\s*=\s*(\{[\s\S]*?\n\s*\};)/);
      const deskFold = deskFoldMatch ? parseObj(deskFoldMatch[1].replace(/;\s*$/, "")) : null;
      const pageFoldMatch = shellSrc.match(/const\s+FOLD\s*=\s*(\{[\s\S]*?\n\s*\};)/);
      const pageFold = pageFoldMatch ? parseObj(pageFoldMatch[1].replace(/;\s*$/, "")) : null;

      const deskWeightMatch = scoringSrc.match(/const\s+FIELD_WEIGHT\s*=\s*(\{[\s\S]*?\});/);
      const deskWeights = deskWeightMatch ? parseObj(deskWeightMatch[1].replace(/;\s*$/, "")) : null;
      const pageWeightMatch = shellSrc.match(/const\s+WEIGHT\s*=\s*(\{[\s\S]*?\});/);
      const pageWeights = pageWeightMatch ? parseObj(pageWeightMatch[1].replace(/;\s*$/, "")) : null;

      const deskProxBonusMatch = scoringSrc.match(/const\s+PROX_BONUS\s*=\s*(\d+);/);
      const deskProxBonus = deskProxBonusMatch ? +deskProxBonusMatch[1] : null;
      const deskProxFieldMatch = scoringSrc.match(/const\s+PROX_FIELD\s*=\s*(\{[\s\S]*?\});/);
      const deskProxField = deskProxFieldMatch ? parseObj(deskProxFieldMatch[1].replace(/;\s*$/, "")) : null;

      const pageProxBonusMatch = shellSrc.match(/\bPROX\s*=\s*(\d+)/);
      const pageProxBonus = pageProxBonusMatch ? +pageProxBonusMatch[1] : null;
      const pageProxFieldMatch = shellSrc.match(/const\s+PROX_FIELD\s*=\s*(\{[\s\S]*?\});/);
      const pageProxField = pageProxFieldMatch ? parseObj(pageProxFieldMatch[1].replace(/;\s*$/, "")) : null;

      const deskQual = {
        exact: +(scoringSrc.match(/\bQ_EXACT\s*=\s*(\d+)/) || [])[1],
        prefix: +(scoringSrc.match(/\bQ_PREFIX\s*=\s*(\d+)/) || [])[1],
        loose: +(scoringSrc.match(/\bQ_LOOSE\s*=\s*(\d+)/) || [])[1],
        sameField: +(scoringSrc.match(/\bSAME_FIELD_BONUS\s*=\s*([\d.]+)/) || [])[1],
        adjacent: +(scoringSrc.match(/\bADJACENT_BONUS\s*=\s*(\d+)/) || [])[1],
        titleStart: +(scoringSrc.match(/\bTITLE_START_BONUS\s*=\s*(\d+)/) || [])[1],
        tierRule: /tier:\s*strong\s*\?\s*0\s*:\s*1/.test(scoreSrc)
      };

      const pageQual = {
        exact: +(shellSrc.match(/\bQ_EXACT\s*=\s*(\d+)/) || [])[1],
        prefix: +(shellSrc.match(/\bQ_PREFIX\s*=\s*(\d+)/) || [])[1],
        loose: +(shellSrc.match(/\bQ_LOOSE\s*=\s*(\d+)/) || [])[1],
        sameField: +(shellSrc.match(/\bSAME_FIELD\s*=\s*([\d.]+)/) || [])[1],
        adjacent: +(shellSrc.match(/\bADJACENT\s*=\s*(\d+)/) || [])[1],
        titleStart: +(shellSrc.match(/\bTITLE_START\s*=\s*(\d+)/) || [])[1],
        tierRule: /tier:\s*strong\s*\?\s*0\s*:\s*1/.test(shellSrc)
      };

      const diffs = [];
      if (JSON.stringify(deskFold) !== JSON.stringify(pageFold)) diffs.push("fold table differs");
      if (JSON.stringify(deskWeights) !== JSON.stringify(pageWeights)) diffs.push("weights differ: " + JSON.stringify(deskWeights) + " vs " + JSON.stringify(pageWeights));
      if (deskProxBonus !== pageProxBonus || JSON.stringify(deskProxField) !== JSON.stringify(pageProxField)) {
        diffs.push("PROX differs: desk bonus=" + deskProxBonus + " field=" + JSON.stringify(deskProxField) + " vs page bonus=" + pageProxBonus + " field=" + JSON.stringify(pageProxField));
      }
      if (JSON.stringify(deskQual) !== JSON.stringify(pageQual)) diffs.push("tiers/qualities differ: " + JSON.stringify(deskQual) + " vs " + JSON.stringify(pageQual));

      return diffs;
    };

    const mainPath = path.join(ROOT, "shell", "main.js");
    const shellBytes = fs.readFileSync(mainPath);
    const shellSrc = shellBytes.toString("utf8");
    const wordsSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "words.js"), "utf8");
    const scoringSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "scoring.js"), "utf8");
    const scoreSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "card-score.js"), "utf8");

    const realDiffs = readConstantsDiffs(shellSrc, wordsSrc, scoringSrc, scoreSrc);

    // Scratch plant test: modify page copy WEIGHT in a temp copy, never in checkout
    let plantTurned = false;
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "plant-pick-const-"));
    try {
      const scratchFile = path.join(scratchDir, "main.js");
      const lines = shellSrc.split("\n");
      const at = lines.findIndex(l => l.indexOf("plant:pick-weight") >= 0);
      if (at >= 0) {
        lines[at] = lines[at].replace(/title:\s*10/, "title: 99");
        fs.writeFileSync(scratchFile, lines.join("\n"), "utf8");
        const plantedSrc = fs.readFileSync(scratchFile, "utf8");
        const plantedDiffs = readConstantsDiffs(plantedSrc, wordsSrc, scoringSrc, scoreSrc);
        plantTurned = plantedDiffs.length > 0 && /weights differ/.test(plantedDiffs[0]);
      }
    } finally {
      try { fs.rmSync(scratchDir, { recursive: true, force: true }); } catch {}
    }

    const sameFile = fs.readFileSync(mainPath).equals(shellBytes);
    check(realDiffs.length === 0 && plantTurned && sameFile,
      "7x ranking constants in shell/main.js match src/modules (and lifting plant:pick-weight turns red): "
      + (realDiffs.length ? realDiffs.join("; ") : "matched") + ", plant " + (plantTurned ? "turned" : "missed") + ", sha " + (sameFile ? "restored" : "differs"));
  }
  const gReport = signinGuard.report("2sg", true);
  check(gReport.ok, gReport.line);
  signinGuard.restore();
  }
} catch (e) {
  failed++;
  console.log("  FAIL the run threw: " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
}

try { if (LAB) fs.rmSync(LAB, { recursive: true, force: true }); } catch { /* a leftover in the temp folder */ }
const complete = asserted >= EXPECTED;
console.log("\n#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
console.log(complete && !failed ? "RESULT: ok " + asserted + " check(s)"
  : "RESULT: FAIL " + failed + " failed" + (complete ? "" : ", and only " + asserted + " of " + EXPECTED + " ran"));
process.exit(Math.min(63, failed + (complete ? 0 : 1)));
