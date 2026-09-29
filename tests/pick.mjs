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
const EXPECTED = 34;

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
const pickAnswer = (op, arg) => PICK.answerPick(op, JSON.stringify(arg || {}));

try {
  console.log("[1/3] the desk's side: what the picker is shown and what its copy makes");
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

  /* ---- 2. the shell --------------------------------------------------------------------- */
  console.log("\n[2/3] the shell: the hotkey, the relay and the clipboard");
  const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-pick-"));
  const UD = path.join(LAB, "user-data"), DOCS = path.join(LAB, "documents");
  fs.mkdirSync(UD, { recursive: true }); fs.mkdirSync(DOCS, { recursive: true });
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
    wins.push(w);
    /* A window's preload runs as it is made, before its page has loaded: so does its stand-in. */
    if (((opts.webPreferences || {}).additionalArguments || []).indexOf("--etiuda-picker") > -1 && madeAPicker) madeAPicker(w);
    return self;
  }
  const BW = new Proxy(function () {}, { construct: (t, a) => makeWin(a[0] || {}),
    get: (t, k) => k === "fromWebContents" ? (wc => { const w = wins.find(x => x.webContents === wc); return w ? w.self : null; })
      : k === "getAllWindows" ? () => wins.filter(x => !x.destroyed).map(x => x.self) : undefined });
  const held = new Map(), taken = new Set(["Control+Shift+F9"]), clip = [];
  let suspended = null;
  const onH = {}, invH = {};
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  let cursor = { x: 300, y: 200 };
  const electron = {
    app: { getPath: n => (n === "documents" ? DOCS : UD), setPath() {}, requestSingleInstanceLock: () => true, quit() {},
      on() {}, getVersion: () => "0.0.0", whenReady: () => Promise.resolve(), getLocale: () => "en-US",
      getPreferredSystemLanguages: () => ["en-US"] },
    ipcMain: { on: (ch, fn) => { onH[ch] = fn; }, handle: (ch, fn) => { invH[ch] = fn; } },
    BrowserWindow: BW, Menu: anything(), dialog: anything(), net: anything(), protocol: anything(), session: anything(),
    clipboard: { writeText: t => clip.push(t) },
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
  const EXPOSE = ["hotkeyRefusal", "pickerPlace", "pickClipText", "PICK_SIZE", "HOTKEY_DEFAULT"];
  const SH = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    SRC + "\nreturn { " + EXPOSE.map(n => n + ": " + n).join(", ") + " };")(
    n => (n === "electron" ? electron : nodeRequire(n)), path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"),
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
  const asked = await pickerPage.E_PICK.copy(JSON.stringify({ id: "c-sign", vi: 0 }));
  check(asked === false && !pw.visible && desk.calls.indexOf("focus") > -1 && clip.length === clips,
    "2n a reply that needs the agent's name first sends the agent to the desk's own window, and writes nothing");
  ST.lsSet("eNameAsked", "1");

  cursor = { x: 1900, y: 1000 };
  const edge = SH.pickerPlace(cursor, area, SH.PICK_SIZE), small = SH.pickerPlace({ x: 10, y: 10 }, { x: 0, y: 0, width: 400, height: 300 }, SH.PICK_SIZE);
  check(edge.x + edge.width <= 1920 && edge.y + edge.height <= 1000 - 18 && edge.y >= 0 && small.width === 400 && small.height === 300,
    "2o at the screen's corner it opens above the pointer and inside the work area, and a small screen shrinks it: "
    + JSON.stringify(edge) + " " + JSON.stringify(small));
  check(SH.pickClipText("a\nb\r\nc", "win32") === "a\r\nb\r\nc" && SH.pickClipText("a\nb", "linux") === "a\nb",
    "2p the line ends are Windows' pair there and left alone elsewhere");

  desk.on.closed.forEach(fn => fn());
  check(pw.destroyed, "2q the picker goes with the desk's window, so the app can quit");

  /* ---- 3. what the page is ---------------------------------------------------------------- */
  console.log("\n[3/3] the picker's page");
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
} catch (e) {
  failed++;
  console.log("  FAIL the run threw: " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
}

const complete = asserted >= EXPECTED;
console.log("\n#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
console.log(complete && !failed ? "RESULT: ok " + asserted + " check(s)"
  : "RESULT: FAIL " + failed + " failed" + (complete ? "" : ", and only " + asserted + " of " + EXPECTED + " ran"));
process.exit(Math.min(63, failed + (complete ? 0 : 1)));
