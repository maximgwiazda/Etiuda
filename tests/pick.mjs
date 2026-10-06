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
 * reads another window, the screen or the clipboard, or presses keys; no key bound to the clipboard; one
 * clipboard write; no module or program it did not have. Those are the brief's "must hold", and a scan is the only node form of
 * an absence. Strings are NOT blanked, so a name in a command line counts.
 *
 * NO CONTENT. The cards below are invented here and hold nobody's words.
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
/* The floor: every check below runs, or the file says it did not complete. */
const EXPECTED = 83;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
const until = async (fn, ms) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < (ms || 3000)) await tick(5); return fn(); };

/* ---- a page's globals, as few as the modules need to run --------------------------------- */
const SYSTEM = ["en-US"];
Object.defineProperty(globalThis, "navigator", { configurable: true,
  value: { get language() { return SYSTEM[0]; }, get languages() { return SYSTEM; }, clipboard: null } });
const els = { "#pax": { value: "Anna Nowak" }, "#roleSel": { value: "" }, "#intent": { value: "" } };
const bodyClasses = new Set();
globalThis.window = { innerWidth: 1280, innerHeight: 800, isSecureContext: true, addEventListener() {}, removeEventListener() {} };
globalThis.document = {
  querySelector: s => els[s] || null, getElementById: id => els["#" + id] || null, querySelectorAll: () => [],
  createElement: () => ({ getContext: () => ({}), style: {}, classList: { add() {}, remove() {}, toggle() {} } }),
  createRange: () => ({}), documentElement: { dataset: {}, classList: { contains: () => false } },
  body: { classList: { contains: c => bodyClasses.has(c), add: c => bodyClasses.add(c), remove: c => bodyClasses.delete(c), toggle() {} } },
  addEventListener() {}, removeEventListener() {}, visibilityState: "visible",
};
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);

/* The hooks boot() fills: the few a copy reaches, as nothing, since no list is drawn here. */
const HK = await import(MOD("hooks.js"));
["railDecorate", "syncSampleMark", "markEntrySel", "render"].forEach(k => { HK.hooks[k] = () => {}; });
const Dom = await import(MOD("dom.js"));
Dom.grabDom();
const AS = await import(MOD("app-state.js"));
const PK = await import(MOD("pack.js"));
const ST = await import(MOD("storage.js"));
const CE = await import(MOD("copy-entry.js"));
const PICK = await import(MOD("pick.js"));
const SET = await import(MOD("settings.js"));
const SP = await import(MOD("spell.js"));
const DS = await import(MOD("desk-stats.js"));
const RD = await import(MOD("render.js"));

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
let LAB = null;
const pickAnswer = (op, arg) => PICK.answerPick(op, JSON.stringify(arg || {}));

try {
  console.log("[1/6] the desk's side: what the picker is shown and what its copy makes");
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
  check(pickAnswer("find", { q: "brass" }).rows.length === 9, "1l the list holds nine rows, one for each number key");
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

  /* ---- 2. the shell --------------------------------------------------------------------- */
  console.log("\n[2/6] the shell: the hotkey, the relay and the clipboard");
  LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-pick-"));
  const UD = path.join(LAB, "user-data"), DOCS = path.join(LAB, "documents");
  fs.mkdirSync(UD, { recursive: true }); fs.mkdirSync(DOCS, { recursive: true });
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
  let suspended = null, clipReads = 0;
  const onH = {}, invH = {};
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  let cursor = { x: 300, y: 200 };
  const electron = {
    app: { getPath: n => (n === "documents" ? DOCS : UD), setPath() {}, requestSingleInstanceLock: () => true, quit() {},
      on() {}, getVersion: () => "0.0.0", whenReady: () => Promise.resolve(), getLocale: () => "en-US",
      commandLine: { appendSwitch() {} },
      getPreferredSystemLanguages: () => ["en-US"] },
    ipcMain: { on: (ch, fn) => { onH[ch] = fn; }, handle: (ch, fn) => { invH[ch] = fn; } },
    BrowserWindow: BW, Menu: anything(), dialog: anything(), net: anything(), protocol: anything(), session: anything(),
    clipboard: { writeText: t => clip.push(t), readText: () => { clipReads++; return ""; } },
    globalShortcut: { register: (a, fn) => { if (taken.has(a)) return false; held.set(a, fn); return true; },
      unregister: a => { held.delete(a); }, unregisterAll: () => held.clear(), setSuspended: v => { suspended = !!v; } },
    screen: { getCursorScreenPoint: () => cursor, getDisplayNearestPoint: () => ({ workArea: area }),
      getAllDisplays: () => [{ bounds: area, workArea: area }], getPrimaryDisplay: () => ({ workArea: area }) },
    shell: anything(), systemPreferences: { on() {}, getAccentColor: () => "" },
    nativeTheme: { themeSource: "system", shouldUseDarkColors: false }, powerMonitor: { on() {} },
  };
  const said = [];
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn() {} };
  const SRC = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
  const listed = [];
  const shellFs = Object.create(fs);
  shellFs.readdirSync = (p, ...rest) => (listed.push(path.resolve(String(p)).toLowerCase()), fs.readdirSync(p, ...rest));
  const EXPOSE = ["hotkeyRefusal", "pickerPlace", "pickClipText", "PICK_SIZE", "HOTKEY_DEFAULT"];
  const SH = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    SRC + "\nreturn { " + EXPOSE.map(n => n + ": " + n).join(", ") + " };")(
    n => (n === "electron" ? electron : (n === "node:fs" || n === "fs") ? shellFs : nodeRequire(n)), path.join(APP, "shell"), path.join(APP, "shell", "main.js"),
    { exports: {} }, {}, quiet);

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
    "2b a desk that never chose holds the default once the window is up: " + [...held.keys()].join(" "));

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
  check(!!pickerPage.E_PICK && !pickerPage.E_HOST && (pw.opts.webPreferences.additionalArguments || []).indexOf("--etiuda-picker") > -1
    && pw.opts.webPreferences.sandbox === true && pw.opts.webPreferences.contextIsolation === true && pw.opts.skipTaskbar === true,
    "2g the picker is a sandboxed window of its own, told so on its command line, and its page gets only the picker's bridge");
  await until(() => pw.visible && pw.focused);
  const want = SH.pickerPlace(cursor, area, SH.PICK_SIZE);
  check(opened.length === 1 && opened[0].rows.length === 4 && pw.visible && pw.focused
    && pw.calls.indexOf("show") > -1 && JSON.stringify(pw.bounds) === JSON.stringify(want),
    "2h the hotkey fills the picker from the desk's page, puts it by the pointer, and shows it focused only once it has drawn: "
    + JSON.stringify(pw.bounds));

  const found2 = JSON.parse(await pickerPage.E_PICK.find("brass"));
  check(ids(found2.rows) === "c-sign/0", "2i a query from the picker is answered by the desk's own search: " + ids(found2.rows));

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

  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);
  check(!pw.visible && opened.length === 2, "2m a second press while it stands closes it");

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
    + (askSent.length ? askSent[0][3] : "never asked"));
  ST.lsSet("eNameAsked", "1");

  /* Clicking away is a blur the shell did not ask for: the picker hides and hands nothing back. */
  held.get("Control+Shift+Space")();
  await until(() => pw.visible && pw.focused);
  const callsAt = pw.calls.length;
  desk.calls.length = 0;
  (pw.on.blur || []).forEach(fn => fn());
  const away = pw.calls.slice(callsAt);
  check(!pw.visible && away.join(" ") === "hide" && desk.calls.indexOf("focus") < 0,
    "2s clicking away hides the picker, and neither gives the focus up again nor calls the desk forward: " + (away.join(" ") || "nothing"));

  /* A desk that answers nothing (a card gone, a page mid-reload) leaves the clipboard as it was. */
  held.get("Control+Shift+Space")();
  await until(() => pw.visible);
  const clipsNow = clip.length;
  const gone = await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-gone", vi: 0 }));
  check(gone === false && clip.length === clipsNow && pw.visible,
    "2t a copy the desk cannot answer writes nothing and leaves the picker standing: " + (clip.length - clipsNow) + " written");
  held.get("Control+Shift+Space")();
  await until(() => !pw.visible);

  /* NO KEY READS THE CLIPBOARD. Alt+V is pressed on both windows as Electron delivers a key: nothing is read,
     no channel the shell opens is the clipboard's, and neither page's bridge offers a read. */
  const ALT_V = { type: "keyDown", alt: true, control: false, meta: false, shift: false, code: "KeyV", isAutoRepeat: false };
  desk.fire("before-input-event", {}, ALT_V);
  pw.fire("before-input-event", {}, ALT_V);
  /* Every registered handler is then called, once for each window, so a read armed by the press and paid out
     under any name shows in clipReads; a handler that throws or hangs on empty arguments has read nothing. */
  for (const ch of Object.keys(invH)) for (const ev of [deskEvent(), pickerEvent()])
    await Promise.race([Promise.resolve().then(() => invH[ch](ev)).catch(() => {}), tick(40)]);
  const clipDoors = Object.keys(invH).concat(Object.keys(onH)).filter(ch => /clip/i.test(ch));
  const clipVerbs = Object.keys(deskPage.E_HOST).concat(Object.keys(pickerPage.E_PICK)).filter(k => /clip/i.test(k));
  check(clipReads === 0 && clipDoors.length === 0 && clipVerbs.length === 0,
    "2v Alt+V on the desk's window and in the picker reads nothing, no channel is the clipboard's, and neither page is given a read: "
    + JSON.stringify({ reads: clipReads, channels: clipDoors, verbs: clipVerbs }));

  cursor = { x: 1900, y: 1000 };
  const edge = SH.pickerPlace(cursor, area, SH.PICK_SIZE), small = SH.pickerPlace({ x: 10, y: 10 }, { x: 0, y: 0, width: 400, height: 300 }, SH.PICK_SIZE);
  check(edge.x + edge.width <= 1920 && edge.y + edge.height <= 1000 - 18 && edge.y >= 0 && small.width === 400 && small.height === 300,
    "2o at the screen's corner it opens above the pointer and inside the work area, and a small screen shrinks it: "
    + JSON.stringify(edge) + " " + JSON.stringify(small));
  check(SH.pickClipText("a\nb\r\nc", "win32") === "a\r\nb\r\nc" && SH.pickClipText("a\nb", "linux") === "a\nb",
    "2p the line ends are Windows' pair there and left alone elsewhere");

  /* The folder the shell takes for its app root is the lab's copy, and the checkout's own root is
     never listed, so no file a checkout happens to hold there can reach the boot. */
  const appListed = listed.includes(path.resolve(APP).toLowerCase()), rootListed = listed.includes(path.resolve(ROOT).toLowerCase());
  check(appListed && !rootListed,
    "2u the app root the shell lists is the lab's own, and the checkout's root is never listed: app root listed "
    + appListed + ", checkout root listed " + rootListed);

  desk.on.closed.forEach(fn => fn());
  check(pw.destroyed, "2q the picker goes with the desk's window, so the app can quit");

  /* ---- 3. what the page is ---------------------------------------------------------------- */
  console.log("\n[3/6] the picker's page");
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

  /* ---- 4. the page's own script, run ---------------------------------------------------- */
  console.log("\n[4/6] the picker's page, its script run over a stand-in of its two elements");
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
  check(/^<li[^>]*id="r0"[^>]*class="on"[^>]*title="again"/.test(boxHtml), "4b at rest the reply copied last is the first row, and marked");
  press("Enter", "Enter");
  check(lastCall() === 'copy {"last":true}', "4c Enter at rest copies the reply copied last again: " + lastCall());
  reopen(); press("ArrowDown", "ArrowDown"); press("Enter", "Enter");
  check(lastCall() === 'copy {"id":"a","vi":0}', "4d a step down and Enter copies the row marked: " + lastCall());
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
  check(lastCall() === 'copy {"id":"c","vi":0}', "4k a step up from the first row wraps to the last: " + lastCall());
  /* The other end of the same ring (board 818): as many steps down as there are rows comes back to the first, the reply
     copied last. A list that stopped at its last row would copy that row instead. */
  reopen();
  const shownRows = (boxHtml.match(/<li\b/g) || []).length;
  for (let i = 0; i < shownRows; i++) press("ArrowDown", "ArrowDown");
  press("Enter", "Enter");
  check(shownRows === 3 && lastCall() === 'copy {"last":true}',
    "4n a step down from the last row wraps to the first: " + shownRows + " row(s), " + shownRows + " step(s) down, then " + lastCall());
  reopen();
  pageL["box:click"]({ target: { closest: () => ({ dataset: { i: "1" } }) } });
  check(lastCall() === 'copy {"id":"a","vi":0}', "4l a click on a row copies that row: " + lastCall());
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

  /* ---- 5. what the shell may not do -------------------------------------------------------- */
  console.log("\n[5/6] what the shell may not do, read from its text with the comments taken out");
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
  const shellCode = blank(SRC) + "\n" + blank(PRE);
  const shellBare = mask(shellCode);
  const modDir = path.join(ROOT, "src", "modules");
  const engineCode = fs.readdirSync(modDir).filter(f => f.endsWith(".js")).map(f => blank(fs.readFileSync(path.join(modDir, f), "utf8")))
    .concat(blank(fs.readFileSync(path.join(ROOT, "src", "main.js"), "utf8"))).join("\n");
  const engineBare = mask(engineCode);
  const FORBID = /desktopCapturer|capturePage|getSources|getDisplayMedia|getUserMedia|clipboard\s*\.\s*read|clipboard-read|readText|readHTML|readImage|readRTF|readBookmark|readBuffer|readFindText|availableFormats|sendInputEvent|SendKeys|SendInput|keybd_event|mouse_event|SetWindowsHookEx|GetForegroundWindow|GetWindowText|WindowFromPoint|AttachThreadInput|uiohook|iohook|robotjs|nut-js|UIAutomation/g;
  const reach = (shellCode + "\n" + engineCode).match(FORBID) || [];
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
    return !(inSpan(i) && /[{,]\s*$/.test(shellCode.slice(i - 2, i)) && /^clipboard\s*[,}]/.test(shellCode.slice(i, i + 11)));
  }).map(i => shellCode.slice(i, i + 24))
    .concat(at(shellBare, /\brequire\s*\(/g).filter(i => /^require\(\s*"electron"\s*\)/.test(shellCode.slice(i, i + 22)) && !inSpan(i)
      && !/^require\(\s*"electron"\s*\)\s*\.\s*(?!clipboard\b)[A-Za-z_$]/.test(shellCode.slice(i, i + 40))).map(i => shellCode.slice(i, i + 30)))
    .concat(at(engineBare, /\bclipboard\b(?!-)/g).filter(i => !(/navigator\.$/.test(engineCode.slice(i - 10, i))
      && /^clipboard(&&|\.writeText\()/.test(engineCode.slice(i, i + 21)))).map(i => engineCode.slice(Math.max(0, i - 10), i + 24)))
    .concat(at(engineBare, /\bnavigator\b(?!\s*\.\s*[A-Za-z_$])/g).map(i => engineCode.slice(Math.max(0, i - 10), i + 24)));
  check(reach.length === 0 && oddHandles.length === 0 && /clipboard/.test(shellCode) && /writeText/.test(shellCode),
    "5a no API in the shell or the engine reads another window, the screen or the clipboard, or presses a key, and the clipboard is"
    + " reached through no other name: " + (reach.concat(oddHandles).join(", ") || "none"));
  const writes = shellCode.match(/clipboard\s*\.\s*write\w*\s*\(/g) || [];
  check(writes.length === 1 && /clipboard\.writeText\(pickClipText\(v\.text,\s*process\.platform\)\)/.test(shellCode)
    && (shellBare.match(/clipboard\.writeText\(/g) || []).length === 1,
    "5b the shell writes the clipboard at one place, the desk's own text: " + writes.length + " write site(s)");
  const MODS = ["electron", "node:child_process", "node:path", "node:fs", "node:os", "node:crypto", "node:zlib"];
  const reqs = (shellCode.match(/\brequire\s*\(\s*[^)]*\)/g) || []).map(r => r.replace(/^require\s*\(\s*|\s*\)$/g, "").replace(/^["']|["']$/g, ""));
  const strange = reqs.filter(r => MODS.indexOf(r) < 0);
  const cp = /\{([^}]*)\}\s*=\s*require\(\s*"node:child_process"\s*\)/.exec(shellCode);
  const runs = shellCode.match(/(?<![.\w])(execFileSync|execFile|execSync|exec|spawnSync|spawn|fork)\s*\(\s*("[^"]*"|[^,)]*)/g) || [];
  const programs = runs.map(r => r.replace(/^[^(]*\(\s*/, ""));
  /* ONE HANDLE ON child_process, and the one name it gives is only ever called (board 818): a second
     `require("node:child_process")` held whole and called as `.spawn(...)` passed the call pattern above, which reads
     a bare name only. So the module is required once, its one name is mentioned once more per call and nowhere else,
     and no other loader (a dynamic import, createRequire, a binding) is in the shell at all. */
  const cpRequires = (shellCode.match(/\brequire\s*\(\s*"(?:node:)?child_process"\s*\)/g) || []).length;
  const runMentions = (shellBare.match(/\bexecFileSync\b/g) || []).length, runCalls = (shellBare.match(/\bexecFileSync\s*\(/g) || []).length;
  const loaders = shellBare.match(/\bimport\s*\(|\bprocess\s*\.\s*(?:binding|_linkedBinding|dlopen)\b|\bcreateRequire\b|\bmodule\s*\.\s*require\b|\brequire\s*\.\s*(?:cache|main)\b/g) || [];
  check(reqs.length > 0 && strange.length === 0 && !!cp && cp[1].trim() === "execFileSync"
    && programs.length > 0 && programs.every(p => p === '"reg"' || p === '"C:\\\\Windows\\\\System32\\\\reg.exe"')
    && cpRequires === 1 && runMentions === runCalls + 1 && loaders.length === 0,
    "5c the shell loads no module and runs no program it did not have (every one is read against the must-hold before it joins): "
    + (strange.join(", ") || reqs.length + " requires known") + "; " + (cp ? cp[1].trim() : "no child_process") + " runs " + (programs.join(", ") || "nothing")
    + "; child_process required " + cpRequires + " time(s), its name mentioned " + runMentions + " time(s) for " + runCalls + " call(s)"
    + (loaders.length ? "; other loaders " + loaders.join(", ") : ""));
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

  /* ---- 6. the most used replies first, on this desk's own last 28 days ------------------- */
  console.log("\n[6/6] the most used replies first: the picker at rest, a search, and what stays as it was");
  /* Each scenario is a desk of its own: a fresh pack, so the day's count is made afresh for it. */
  const ago = n => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - n * 864e5).toISOString().slice(0, 10); };
  const fillers = n => Array.from({ length: n }, (_, i) => ({ id: "c-f" + i, c: "orders", t: "Filler " + i, en: "Filler reply " + i + "." }));
  const deskOf = extra => { PK.resetPack(); AS.setCats([]); AS.setIntentIdxs([]); AS.setCards(fillers(12).concat(extra || [])); };
  const A = { id: "c-a", c: "orders", t: "Alpha", en: "Alpha reply." }, B = { id: "c-b", c: "orders", t: "Bravo", en: "Bravo reply." };
  const GONE = { id: "c-gone", c: "orders", t: "Gone", _hidden: true, en: "Gone reply." };
  const copies = (id, n, day) => { for (let i = 0; i < n; i++) DS.bumpUse(PK.pack, id, day || ago(0)); };
  const rest = () => ids(PICK.pickRows(""));
  const first9 = Array.from({ length: 9 }, (_, i) => "c-f" + i + "/0").join(" ");
  const fRows = (from, to) => Array.from({ length: to - from }, (_, i) => "c-f" + (from + i) + "/0").join(" ");

  deskOf([A, B, GONE]);
  check(rest() === first9,
    "6a with no copy counted the picker at rest is the desk's list, nine rows in catalog order: " + rest());
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
