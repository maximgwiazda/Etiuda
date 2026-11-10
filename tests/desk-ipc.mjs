/* The desk's write path, all three hops, in bare node: src/modules/storage.js over the real
 * shell/preload.js over the real handlers of shell/main.js, electron stubbed, desk.json in a temp
 * folder. What it holds: a write never waits on the disk, a burst is one send, and a document
 * leaving or hiding right after a write has put it on the disk before the event returns, and none
 * puts back a desk the rescue's Reset has cleared. The Reset also empties the tabs' session, in the
 * page and in main, and the preload sends a link's address to main for a primary or middle click only.
 * The last section is the desk's own file in the catalog folder: its key pair behind a stand-in for
 * safeStorage, a signed catalog under desks/<branch id>/ after an edit, and nothing else touched.
 * And the window's close (closing asks once while a conversation is in progress, 2026-10-12): held and the page asked,
 * let go by the page's answer, a second close, silence, a lost page or a quit, and the preload's two ends of the pipe.
 * 952g, last: a theme chosen on the theme button survives a restart through the path that now saves it, the page's
 * unwaited send and, for a quit straight after the press, the flush on pagehide; each restart is a fresh copy of the
 * page's modules reading the desk back through main's own handler, and the window's material follows the file.
 *
 *   node tests/desk-ipc.mjs            exit code is the number of failed checks, capped at 63
 */
process.removeAllListeners("warning");
process.on("warning", () => {});
const OUT = [];
const writeOut = process.stdout.write.bind(process.stdout);
process.stdout.write = (c, ...a) => { OUT.push(String(c)); return writeOut(c, ...a); };

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD = (n, q) => pathToFileURL(path.join(ROOT, "src", "modules", n)).href + "?" + q;
const nodeRequire = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 127;
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
const tick = ms => new Promise(r => setTimeout(r, ms || 0));

/* ---- electron, as small as main.js needs at load and at a desk write ---------------------- */
const UD = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-ipc-"));
const DESK = path.join(UD, "desk.json");
/* A desk.json no write can replace. Windows refuses a rename over a read-only file; elsewhere the
   rename asks only the folder, so the folder is held read-only too (which root ignores). */
const holdDesk = on => {
  if (process.platform !== "win32") fs.chmodSync(UD, on ? 0o555 : 0o700);
  fs.chmodSync(DESK, on ? 0o444 : 0o666);
};
const onDisk = () => { try { return JSON.parse(fs.readFileSync(DESK, "utf8")).keys || {}; } catch { return {}; } };
const said = [];
const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: () => {} };
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
/* A window the hold can be driven on. fromWebContents stays the inert stand-in the other legs
   already talk to; only a window this file builds records the close createWindow registers. */
const madeWins = [];
function RecWin(opts) {
  this.opts = opts || {};
  this.listeners = {};
  this.sent = [];
  this.closes = 0;
  this.bounds = { x: this.opts.x || 0, y: this.opts.y || 0, width: this.opts.width || 0, height: this.opts.height || 0 };
  const self = this;
  this.webContents = {
    id: madeWins.length + 1, etiudaLost: null,
    send: (ch, ...args) => { self.sent.push(ch); (self.sentEvents = self.sentEvents || []).push({ ch, args }); },
    on: (k, fn) => { (self.wc[k] = self.wc[k] || []).push(fn); },
    once: (k, fn) => { self.webContents.on(k, fn); },
    setWindowOpenHandler: () => {}, getURL: () => "", getZoomLevel: () => 0, setZoomLevel: () => {}, reload: () => {},
  };
  this.wc = {};
  madeWins.push(this);
}
RecWin.prototype.on = function (k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); };
RecWin.prototype.once = function (k, fn) { this.on(k, fn); };
RecWin.prototype.close = function () { this.closes++; };
RecWin.prototype.isDestroyed = function () { return false; };
RecWin.prototype.isMaximized = function () { return false; };
RecWin.prototype.isMinimized = function () { return false; };
RecWin.prototype.getBounds = function () { return Object.assign({}, this.bounds); };
RecWin.prototype.getNormalBounds = function () { return this.getBounds(); };
RecWin.prototype.setBounds = function (b) { if (b) Object.assign(this.bounds, b); };
["show", "showInactive", "focus", "hide", "maximize", "unmaximize", "minimize", "restore", "loadFile", "destroy"].forEach(n => {
  RecWin.prototype[n] = function () {};
});
RecWin.fromWebContents = () => inert;
RecWin.getAllWindows = () => madeWins;
const onHandlers = {}, invokeHandlers = {}, appOn = {};
let appQuits = 0, loginApplied = null;
const madeNotes = [], madeTrays = [];
const electron = {
  app: { getPath: () => UD, setPath: noop, requestSingleInstanceLock: () => false, quit: () => { appQuits++; }, on: (k, fn) => { appOn[k] = fn; }, getVersion: () => "0.0.0",
         getLocale: () => "en", getPreferredSystemLanguages: () => ["en"],
         whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop, hasSwitch: () => false } },
  ipcMain: { on: (ch, fn) => { onHandlers[ch] = fn; }, handle: (ch, fn) => { invokeHandlers[ch] = fn; } },
  BrowserWindow: RecWin, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert,
  screen: inert, shell: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
};
/* safeStorage as far as main.js asks of it: a reversible sealing that shows nothing of what it holds. */
let sealOk = true, decryptFails = null, keyring = "gnome_libsecret";
const safeStorage = {
  isEncryptionAvailable: () => sealOk,
  getSelectedStorageBackend: () => keyring,
  encryptString: s => { if (!sealOk) throw new Error("encryption is not available"); return Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)); },
  decryptString: b => { if (!sealOk || (decryptFails && Buffer.from(b).toString("base64") === decryptFails)) throw new Error("cannot decrypt for this account"); return Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"); },
};
electron.safeStorage = safeStorage;
electron.app.getLoginItemSettings = () => loginApplied || { openAtLogin: false, args: [] };
electron.app.setLoginItemSettings = (s) => { loginApplied = s; };
electron.app.setAppUserModelId = (id) => { electron.app._aumid = id; };
electron.app.setJumpList = (categories) => { electron.app._jumpList = categories; return { result: "ok" }; };
electron.app.getJumpListSettings = () => ({ minItems: 0 });
function FakeNotification(opts) {
  this.opts = opts || {};
  this.handlers = {};
  madeNotes.push(this);
}
FakeNotification.prototype.on = function (ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); };
FakeNotification.prototype.show = function () { this.shown = true; };
FakeNotification.isSupported = () => true;
electron.Notification = FakeNotification;
function FakeTray(icon) {
  if (FakeTray.throwOnCreate) throw new Error("planted tray failure");
  this.icon = icon;
  this.tip = "";
  this.menu = null;
  this.handlers = {};
  madeTrays.push(this);
}
FakeTray.prototype.setToolTip = function (tip) { this.tip = tip; };
FakeTray.prototype.setContextMenu = function (menu) { this.menu = menu; };
FakeTray.prototype.on = function (ev, fn) { this.handlers[ev] = fn; };
FakeTray.prototype.destroy = function () { this.dead = true; };
electron.Tray = FakeTray;
electron.Menu = { setApplicationMenu: noop, buildFromTemplate(tpl) { const items = tpl.slice(); return { items: items, template: items, popup() {} }; } };
electron.nativeImage = { createFromPath(p) { return { path: p, isEmpty: () => false }; } };
const fakeRequire = n => (n === "electron" ? electron : nodeRequire(n));
const shellSrc = f => fs.readFileSync(path.join(ROOT, "shell", f), "utf8");
/* main.js is evaluated as a function body, so one line appended to it hands the test the retry that Electron's events call. */
const mainTest = {};
/* Loaded as a GNOME desktop on any machine, so the keyring switch and its line (tests/shell-office.mjs 14) stay out of this file. */
const desktopWas = process.env.XDG_CURRENT_DESKTOP;
process.env.XDG_CURRENT_DESKTOP = "GNOME";
new Function("require", "__dirname", "__filename", "module", "exports", "console", "__test",
  shellSrc("main.js") + "\n__test.tryHeldBranches = tryHeldBranches; __test.catalogChanged = catalogChanged; __test.sealsForReal = sealsForReal; __test.closeHeld = closeHeld; __test.closeAnswered = closeAnswered; __test.wireHold = wireHold; __test.closeFromRefusal = closeFromRefusal; __test.createWindow = createWindow; __test.CLOSE_WAIT_MS = CLOSE_WAIT_MS; if (typeof tabsFile === 'function') __test.tabsFile = tabsFile; if (typeof writeSavedTabs === 'function') __test.writeSavedTabs = writeSavedTabs; if (typeof readSavedTabs === 'function') __test.readSavedTabs = readSavedTabs; if (typeof sessionHeld !== 'undefined') __test.sessionHeld = sessionHeld; if (typeof handleUpdateClose === 'function') __test.handleUpdateClose = handleUpdateClose; __test.setQuitting = v => { quitting = !!v; }; __test.windowFile = windowFile; if (typeof setQuitOnClose === 'function') __test.setQuitOnClose = setQuitOnClose; if (typeof trayQuit === 'function') __test.trayQuit = trayQuit; if (typeof ensureTray === 'function') __test.ensureTray = ensureTray; if (typeof onSecondInstance === 'function') __test.onSecondInstance = onSecondInstance; if (typeof launchHidden === 'function') __test.launchHidden = launchHidden; if (typeof syncJumpList === 'function') __test.syncJumpList = syncJumpList; if (typeof catalogFolder === 'function') __test.catalogFolder = catalogFolder; if (typeof offerFile === 'function') __test.offerFile = offerFile; if (typeof recordRecentCatalog === 'function') __test.recordRecentCatalog = recordRecentCatalog; if (typeof rebuildTrayMenu === 'function') __test.rebuildTrayMenu = rebuildTrayMenu; if (typeof dispatchColdStartArgs === 'function') __test.dispatchColdStartArgs = dispatchColdStartArgs; if (typeof trayIcon === 'function') __test.trayIcon = trayIcon; if (typeof deskTray !== 'undefined') __test.resetTray = () => { deskTray = null; };")(
  fakeRequire, path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet, mainTest);
const quitsAtBoot = appQuits;
if (desktopWas === undefined) delete process.env.XDG_CURRENT_DESKTOP; else process.env.XDG_CURRENT_DESKTOP = desktopWas;

/* ---- the renderer's side of the pipe. The desk's channels go to main's own handlers; the
   catalog and the host are answered here, because this file is about the desk. ------------- */
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const sent = { sync: {}, invoke: {}, send: {}, args: {} };
const bump = (o, ch) => { o[ch] = (o[ch] || 0) + 1; };
const eventFor = frame => ({ sender: { id: 1, once: noop }, senderFrame: frame, returnValue: undefined });
const ipcRenderer = {
  sendSync: (ch, ...args) => {
    bump(sent.sync, ch);
    sent.args[ch] = args;
    if (ch === "etiuda:catalog") return null;
    if (ch === "etiuda:host") return { platform: "win32", backdrop: null, deskFile: DESK, home: UD };
    const e = eventFor(ENGINE_FRAME);
    onHandlers[ch](e, ...args);
    return e.returnValue;
  },
  send: (ch, ...args) => { bump(sent.send, ch); if (onHandlers[ch]) onHandlers[ch](eventFor(ENGINE_FRAME), ...args); },
  /* Across a process boundary: the handler runs after the caller's task, never inside it. */
  invoke: (ch, ...args) => {
    bump(sent.invoke, ch);
    return new Promise(r => setImmediate(() => r(invokeHandlers[ch] ? invokeHandlers[ch](eventFor(ENGINE_FRAME), ...args) : undefined)));
  },
  on: noop,
};
const listeners = { window: {}, document: {} };
const listen = where => (type, fn) => { (listeners[where][type] = listeners[where][type] || []).push(fn); };
const fire = (where, type) => (listeners[where][type] || []).forEach(fn => fn({ type }));
globalThis.window = { addEventListener: listen("window"), removeEventListener: noop };
globalThis.document = { visibilityState: "visible", addEventListener: listen("document"), removeEventListener: noop };
const contextBridge = { exposeInMainWorld: (k, v) => { window[k] = v; }, executeInMainWorld: noop };
new Function("require", shellSrc("preload.js"))(n => (n === "electron" ? { contextBridge, ipcRenderer } : nodeRequire(n)));
const REAL_HOST = window.E_HOST;
/* Every listener the preload put on the window or the document, kept before the Reset legs empty the table. */
const linkListeners = {};
["window", "document"].forEach(w => Object.keys(listeners[w]).forEach(t => { linkListeners[t] = (linkListeners[t] || []).concat(listeners[w][t]); }));

let COPY = "";
try {
  const S = await import(MOD("storage.js", "ipc"));
  /* The engine sends a patch where the host takes one, and the whole map where it does not. */
  const syncSaves = () => (sent.sync["etiuda:desk-save"] || 0) + (sent.sync["etiuda:desk-patch-save"] || 0);
  const asyncSaves = () => (sent.invoke["etiuda:desk-write"] || 0) + (sent.invoke["etiuda:desk-patch"] || 0);

  check(sent.sync["etiuda:desk"] === 1 && S.lsGet("eIpcNone") === null,
    "1a THE CONTROL: the load was handed its desk once, synchronously, through main's own handler");

  const beforeSync = syncSaves();
  S.lsSet("eIpcA", "1");
  check(syncSaves() === beforeSync && asyncSaves() === 0 && S.lsGet("eIpcA") === "1",
    "1b a write waits on nothing: no synchronous send, nothing sent yet, and read back from the local copy ("
    + (syncSaves() - beforeSync) + " sync, " + asyncSaves() + " async)");
  check(onDisk().eIpcA === undefined,
    "1c and it is not on the disk when lsSet returns, so the send really was deferred");

  for (let i = 0; i < 50; i++) S.lsSet("eIpcBurst", "v" + i);
  S.lsSet("eIpcGone", "x"); S.lsDel("eIpcGone");
  await tick(5); await tick(5);
  const k1 = onDisk();
  check(asyncSaves() === 1 && syncSaves() === beforeSync,
    "1d a burst of 53 writes in one task is one asynchronous send (" + asyncSaves() + " async, "
    + (syncSaves() - beforeSync) + " sync)");
  check(k1.eIpcA === "1" && k1.eIpcBurst === "v49" && !("eIpcGone" in k1),
    "1e and main put the burst's last state on the disk: eIpcA " + k1.eIpcA + ", eIpcBurst " + k1.eIpcBurst
    + ", eIpcGone " + ("eIpcGone" in k1 ? "present" : "absent"));
  check(S.eSaveTrouble() === null && S.eLastSaved() > 0,
    "1f main's answer was heard: no trouble, and a last-saved time");

  /* A quit, a reload and a closed window all pass through pagehide before the document goes. */
  S.lsSet("eIpcLast", "quit");
  const pendingBefore = onDisk().eIpcLast;
  fire("window", "pagehide");
  const atQuit = onDisk().eIpcLast;
  check(pendingBefore === undefined && atQuit === "quit",
    "1g a document leaving right after a write has it on the disk before pagehide returns (before "
    + pendingBefore + ", after " + atQuit + ")");
  const syncAtQuit = syncSaves(), asyncAtQuit = asyncSaves();
  await tick(5); await tick(5);
  check(syncAtQuit === beforeSync + 1 && asyncSaves() === asyncAtQuit,
    "1h through one synchronous send, and the deferred one it replaced is never sent after it");

  S.lsSet("eIpcHide", "min");
  document.visibilityState = "hidden";
  fire("document", "visibilitychange");
  check(onDisk().eIpcHide === "min", "1i a window hidden right after a write has it on the disk too");
  document.visibilityState = "visible";
  fire("window", "pagehide");
  check(syncSaves() === syncAtQuit + 1, "1j a pagehide with nothing pending sends nothing");

  const own = S.lsSet("eIpcOwn", "cat", true);
  check(own === true && onDisk().eIpcOwn === "cat" && syncSaves() === syncAtQuit + 2,
    "1k a caller that speaks for its own failure is answered by the disk, synchronously, as storeCatalog needs");

  const asyncBefore = asyncSaves();
  S.lsSet("eIpcBurst", "v49"); S.lsDel("eIpcNever");
  await tick(5); await tick(5);
  check(asyncSaves() === asyncBefore && syncSaves() === syncAtQuit + 2,
    "1l a value written again unchanged, and a key deleted that was never there, send nothing");

  document.visibilityState = "hidden";
  S.lsSet("eIpcHidden", "1"); S.lsSet("eIpcHidden2", "2");
  const inTask = asyncSaves();
  await null;
  check(inTask === asyncBefore && asyncSaves() === asyncBefore + 1,
    "1m in a hidden window, where timers are throttled, the burst is sent when its task ends, once, and waits on no timer");
  document.visibilityState = "visible";
  await tick(5); await tick(5);

  /* ---- main's handler, on its own -------------------------------------------------------- */
  const h = invokeHandlers["etiuda:desk-write"];
  const stranger = h ? h(eventFor({ parent: null, url: "https://example.com/etiuda.html" }), JSON.stringify({ eIpcX: "1" })) : null;
  check(typeof h === "function" && stranger === false && onDisk().eIpcX === undefined,
    "2a main's asynchronous handler refuses a document that is not the engine, and writes nothing");
  const mine = h ? h(eventFor(ENGINE_FRAME), JSON.stringify(Object.assign({}, onDisk(), { eIpcY: "2" }))) : null;
  check(mine === true && onDisk().eIpcY === "2",
    "2b and for the engine it has written the file by the time it answers");
  const errs = said.filter(l => /^ERR /.test(l));
  check(!errs.length, "2c main logged no error through any of it" + (errs.length ? ": " + errs.length + ", first " + errs[0] : ""));

  /* A read-only desk.json is a rename Windows refuses however long it is asked, which is main
     answering false, the way a file held by a scanner past the shell's patience is. */
  holdDesk(true);
  S.lsSet("eIpcRefused", "1");
  await tick(5); await tick(5);
  const troubleAfterRefusal = S.eSaveTrouble();
  holdDesk(false);
  const syncBeforeLeave = syncSaves();
  fire("window", "pagehide");
  check(troubleAfterRefusal !== null && syncSaves() === syncBeforeLeave + 1
    && onDisk().eIpcRefused === "1" && S.eSaveTrouble() === null,
    "2d a write main answered false is sent again when the page leaves, and lands: trouble "
    + (troubleAfterRefusal ? "raised" : "not raised") + ", " + (syncSaves() - syncBeforeLeave)
    + " sync send(s) at pagehide, on the disk " + onDisk().eIpcRefused);

  /* ---- the notice, against a host whose answers this file holds ----------------------------- */
  let release = [], heldSaves = 0;
  window.E_HOST = { deskFile: "C:/lab/desk.json", deskRead: () => "{}", deskSave: () => { heldSaves++; return true; },
                    deskWrite: () => new Promise(r => release.push(r)) };
  const N = await import(MOD("storage.js", "notice"));
  N.lsSet("eLate", "1"); await tick(5);
  N.lsSet("eOwn", "1", true);
  release.forEach(r => r(false)); release = [];
  await tick(5);
  const stale = N.eSaveTrouble();
  N.lsSet("eLate", "2"); await tick(5);
  release.forEach(r => r(false)); release = [];
  await tick(5);
  const refused = N.eSaveTrouble();
  check(stale === null && refused && refused.since > 0,
    "3a a refusal heard after a later write landed is stale and ignored; a refusal of the latest raises the notice ("
    + JSON.stringify(stale) + ", " + JSON.stringify(refused) + ")");

  N.lsSet("eInFlight", "1"); await tick(5);
  const unanswered = release.length, savesBefore = heldSaves;
  fire("window", "pagehide");
  check(unanswered === 1 && heldSaves === savesBefore + 1,
    "3b a send main has not answered yet is sent again, synchronously, when the page leaves");

  /* ---- the rescue's Reset, the boot guard's own clearState sliced from the template, over the
     real host, with the app's storage and pack loaded as a boot that failed late leaves them --- */
  window.E_HOST = REAL_HOST;
  listeners.window = {}; listeners.document = {};
  globalThis.addEventListener = window.addEventListener;
  /* A person's own layer of a catalog (cards and stars), e<ns>~Pack: the Reset must not take it (board D7b, 2026-11-10). */
  const OWN_LAYER = "e1abc~Pack", OWN_BODY = JSON.stringify({ cards: { "c-own": { title: "a card the person wrote" } }, favs: ["c-own"] });
  invokeHandlers["etiuda:desk-write"](eventFor(ENGINE_FRAME), JSON.stringify(Object.assign({}, onDisk(), { "e~carried": "1", [OWN_LAYER]: OWN_BODY })));
  const P = await import(pathToFileURL(path.join(ROOT, "src", "modules", "pack.js")).href);
  const R = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  Object.assign(window, R);                        // as main.js puts every export on the page
  R.lsSet("eResetPlanted", "x");
  P.saveStats();
  check(R.lsGet("eResetPlanted") === "x" && onDisk().eResetPlanted === undefined && onDisk().eIpcA === "1"
    && (listeners.window.beforeunload || []).length === 1,
    "5a THE CONTROL: a desk write is pending, a stats flush is armed on beforeunload, and the old desk is on the disk");
  const tpl = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  const slice = name => {
    const at = tpl.indexOf("function " + name + "(");
    let i = tpl.indexOf("\x7b", at), depth = 0;
    for (; i < tpl.length; i++) { const c = tpl[i]; if (c === "\x7b") depth++; else if (c === "\x7d" && !--depth) break; }
    if (at < 0 || i >= tpl.length) throw new Error("the template carries no function " + name);
    return tpl.slice(at, i + 1);
  };
  let ssCleared = 0;
  const lsStub = { length: 0, key: () => null, removeItem: noop }, ssStub = { clear: () => { ssCleared++; } };
  const TAB = "eResetTab";
  const mainTab = () => {
    const m = mainTest.sessionHeld && mainTest.sessionHeld.get(1);
    return m && m.has(TAB) ? m.get(TAB) : null;
  };
  const tabPlanted = window.E_HOST.session("set", TAB, "the customer's name") === true && window.E_HOST.session("get", TAB) === "the customer's name" && mainTab() === "the customer's name";
  const clearState = new Function("window", "localStorage", "sessionStorage",
    slice("hostDesk") + "\n" + slice("clearState") + "\nreturn clearState;")(window, lsStub, ssStub);
  check(tabPlanted && ssCleared === 0,
    "5a2 THE CONTROL: the tabs' session in main holds a plant before the Reset, and the page's own sessionStorage has not been cleared yet");
  clearState(true);
  const tabsAfter = window.E_HOST.session("get", TAB);
  fire("window", "beforeunload");
  fire("window", "pagehide");
  await tick(5); await tick(5);
  const left = onDisk(), stayed = Object.keys(left).filter(k => /^e(?:[A-Z]|[0-9a-z]+~)/.test(k) && !/^e[0-9a-z]+~Pack$/.test(k));
  check(left[OWN_LAYER] === OWN_BODY,
    "5b2 the Reset keeps the person's own layer of a catalog, their cards and stars (" + OWN_LAYER + "): "
    + (left[OWN_LAYER] === OWN_BODY ? "kept byte for byte" : "GONE (" + JSON.stringify(left[OWN_LAYER]) + ")"));
  check(!stayed.length && left["e~carried"] === "1",
    "5b the Reset's cleared desk is what remains after the page leaves: " + stayed.length + " app key(s) back on the disk"
    + (stayed.length ? " (" + stayed.slice(0, 4).join(", ") + ")" : "") + ", the carried mark " + left["e~carried"]);
  check(ssCleared === 1,
    "5c the Reset clears the page's own sessionStorage, once: " + ssCleared + " call(s)");
  check(tabsAfter === null && mainTab() === null,
    "5d and it clears the tabs main holds, so a customer's name does not outlive the Reset: the plant reads back " + JSON.stringify(tabsAfter)
    + ", main holds " + JSON.stringify(mainTab()));
  /* The #reset hatch clears with no desk: it runs before the app does, and a customer's name must not outlive it either. */
  const planted2 = window.E_HOST.session("set", TAB, "the customer's name") === true && window.E_HOST.session("get", TAB) === "the customer's name";
  clearState(false);
  const hatchTabs = window.E_HOST.session("get", TAB);
  check(planted2 && hatchTabs === null && mainTab() === null && ssCleared === 2,
    "5e the #reset hatch's clearState(false) clears the tabs too, in main and in the page: planted " + planted2 + ", the plant reads back "
    + JSON.stringify(hatchTabs) + ", main holds " + JSON.stringify(mainTab()) + ", sessionStorage cleared " + ssCleared + " time(s) in all");

  /* ---- the same Reset when the app never loaded: no eResetClear on the page, so the boot guard edits the desk file
     itself (clearState's host branch); the person's own layer stays there too (board D7b). */
  {
    invokeHandlers["etiuda:desk-write"](eventFor(ENGINE_FRAME), JSON.stringify({ eSomeSetting: "1", [OWN_LAYER]: OWN_BODY, "e~carried": "1" }));
    const bare = { E_HOST: REAL_HOST };
    const clearBare = new Function("window", "localStorage", "sessionStorage",
      slice("hostDesk") + "\n" + slice("ownLayer") + "\n" + slice("clearState") + "\nreturn clearState;")(bare, lsStub, { clear: noop });
    clearBare(true);
    await tick(5);
    const after = onDisk();
    check(after[OWN_LAYER] === OWN_BODY && after.eSomeSetting === undefined && after["e~carried"] === "1",
      "5b3 with no app loaded, the boot guard's own Reset clears the settings on the desk file and keeps the person's own layer: "
      + JSON.stringify({ own: after[OWN_LAYER] === OWN_BODY, setting: after.eSomeSetting, carried: after["e~carried"] }));
  }

  /* ---- what the start-failure banner offers. The boot guard clears the app's state once by itself and reloads; a
     crash that comes back after that is the code's, not the settings', and a Reset that clears them again and reloads
     into the same fault does nothing (Max's install of 2026-11-10, "ePackEpoch is not a function"). So the template
     decides: storage unusable is "broken", a first crash is "damaged" (Reset offered), a crash after the silent
     repair is "fault" (no Reset, nothing said about settings). */
  {
    let kindOf = null, err = "";
    try { kindOf = new Function(slice("rescueKind") + "\nreturn rescueKind;")(); } catch (e) { err = String(e && e.message || e); }
    /* [broken, tries, inHost, resetTried]: storage broken; a first crash; the app after the silent repair with no Reset
       pressed yet (the repair never reached the desk's saved settings); the app after Reset too; a browser after the repair. */
    const cases = [[true, 0, true, false], [true, 1, false, false], [false, 0, true, false], [false, 1, true, false],
                   [false, 1, true, true], [false, 1, false, false], [false, 2, false, false]];
    const got = kindOf ? cases.map(c => kindOf.apply(null, c)) : [];
    const banner = (() => { try { return slice("banner"); } catch (e) { return ""; } })();
    const layer2 = tpl.slice(tpl.indexOf('window.addEventListener("error"'), tpl.indexOf('window.addEventListener("error"') + 600);
    check(JSON.stringify(got) === JSON.stringify(["broken", "broken", "damaged", "damaged", "fault", "fault", "fault"])
      && /rescueKind\(\s*broken\s*,\s*tries\s*,\s*inHost\s*,\s*rescueTried\(\)\s*\)/.test(banner) && /kind\s*===\s*"damaged"/.test(banner)
      && /clearState\(true\);\s*try\{\s*sessionStorage\.setItem\("eRescueTried","1"\)/.test(banner)
      && /var tried=rescueTried\(\);[\s\S]*clearState\(false\);[\s\S]*if\(tried\) sessionStorage\.setItem\("eRescueTried","1"\)/.test(layer2),
      "5f the banner's kind: a first crash offers Reset; in the app, the first banner after the silent repair still offers"
      + " the Reset that reaches the desk's settings and marks it after clearing; only a crash after that Reset, or after the"
      + " repair in a browser, is the code's, with no Reset; unusable storage still says so: " + (err || JSON.stringify(got)));
  }

  /* ---- a click on a link, at the preload's two listeners: only a middle click, besides the primary
     one, hands its address to main, and so licenses it; a right click on a link is a context menu ---- */
  const LINK = "https://links.invalid/right-click-probe";
  const press = (type, button) => {
    const before = sent.sync["etiuda:link-click"] || 0;
    const ev = { type, button, isTrusted: true, composedPath: () => [{ localName: "span" }, { localName: "a", href: LINK }, { localName: "body" }] };
    (linkListeners[type] || []).forEach(fn => fn(ev));
    return (sent.sync["etiuda:link-click"] || 0) - before;
  };
  const primary = press("click", 0), middle = press("auxclick", 1);
  check(linkListeners.click.length === 1 && linkListeners.auxclick.length === 1 && primary === 1 && middle === 1
    && sent.args["etiuda:link-click"][0] === LINK,
    "6a THE CONTROL: the preload holds one click and one auxclick listener, a trusted primary click and a trusted middle click on a link each send its address to main: "
    + primary + " and " + middle + " send(s)");
  const right = press("auxclick", 2);
  check(right === 0,
    "6b a right click on a link (auxclick, button 2) sends nothing to main, so it licenses no address: " + right + " send(s)");
  /* The pointer and the mouse at every button that is not the primary or the middle: no listener of the preload may send. */
  const DRIVEN = ["pointerdown", "pointerup", "mousedown", "mouseup", "auxclick", "contextmenu"];
  const mouseLike = Object.keys(linkListeners).filter(t => /click|mouse|pointer|contextmenu|touch|drag|drop/.test(t));
  const undriven = mouseLike.filter(t => DRIVEN.indexOf(t) < 0 && t !== "click");
  const sends = [];
  for (const b of [2, 3, 4]) for (const t of DRIVEN) { const n = press(t, b); if (n) sends.push(t + " " + b + " x" + n); }
  check(undriven.length === 0 && sends.length === 0,
    "6c no other button on any mouse or pointer event the preload listens to (" + mouseLike.join(", ") + ") sends a link to main: buttons 2, 3 and 4 over "
    + DRIVEN.length + " event types, " + sends.length + " send(s)" + (sends.length ? " (" + sends.join(", ") + ")" : "")
    + ", listener types not driven " + JSON.stringify(undriven));

  /* ---- the desk's own file in the catalog folder. The page modules run for real over the real
     preload and the real handlers; safeStorage is the sealing stand-in above; the catalog and the
     layer are invented here. Every file is read back from the disk the way another desk or Studio
     would find it, and the signature is checked with node's own Ed25519 over the engine's own
     signed bytes, so the shell's canonical form is held to the engine's. --------------------- */
  const FOLDER = path.join(UD, "Etiuda");
  fs.mkdirSync(FOLDER, { recursive: true });
  const fake = () => {
    const store = Object.create(null);
    return new Proxy(function () {}, {
      get: (t, k) => k in store ? store[k] : (k === Symbol.toPrimitive ? () => "" : (k === "length" ? 0
        : (["contains", "matches", "hasAttribute"].includes(k) ? () => false : fake()))),
      set: (t, k, v) => { store[k] = v; return true; },
      apply: () => fake(), has: () => true });
  };
  Object.assign(window, { innerWidth: 1280, innerHeight: 800 });
  globalThis.innerHeight = 800;
  globalThis.getComputedStyle = () => fake();
  globalThis.addEventListener = (...a) => window.addEventListener(...a);
  globalThis.removeEventListener = (...a) => window.removeEventListener(...a);
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
  globalThis.document = new Proxy({}, { set: () => true, get: (t, k) => (k === "readyState" ? "complete"
    : k === "visibilityState" ? "visible" : (k === "addEventListener" || k === "removeEventListener") ? noop : fake()) });
  /* A copy of the modules, so this section meets a page that has never been Reset: the latch the rescue
     sets in storage.js never comes down in the instance the Reset legs used. */
  COPY = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-ipc-modules-"));
  fs.cpSync(path.join(ROOT, "src", "modules"), COPY, { recursive: true });
  const PLAIN = n => pathToFileURL(path.join(COPY, n)).href;
  const HK = await import(PLAIN("hooks.js"));
  const slots = [...fs.readFileSync(path.join(ROOT, "src", "modules", "hooks.js"), "utf8")
    .match(/const SLOTS = \[([\s\S]*?)\];/)[1].matchAll(/"(\w+)"/g)].map(m => m[1]);
  slots.forEach(k => { HK.hooks[k] = noop; });
  const CT = await import(PLAIN("catalog.js"));
  const ST = await import(PLAIN("storage.js"));
  const PK = await import(PLAIN("pack.js"));
  const DM = await import(PLAIN("dom.js")); DM.grabDom();
  const CF = await import(PLAIN("catalog-file.js"));
  const CB = await import(PLAIN("catalog-boot.js"));
  const RB = await import(PLAIN("rebuild.js"));
  const FV = await import(PLAIN("favourites.js"));
  const V2 = await import(PLAIN("catalog-v2.js"));
  HK.hooks.syncSampleMark = CF.syncSampleMark;
  HK.hooks.syncFavouritesMeta = FV.syncFavouritesMeta;

  /* Absent in a build without the desk file, so the legs below read red there rather than stop the run. */
  const writeBranch = typeof CF.writeDeskBranch === "function" ? CF.writeDeskBranch : async () => false;
  const asHost = (f, ...a) => (typeof REAL_HOST[f] === "function" ? REAL_HOST[f](...a) : Promise.resolve(null));
  const SPKI = Buffer.from("302a300506032b6570032100", "hex");
  const PREFIX = Buffer.from("etiuda-desk-branch\n");
  const pubOf = hex => crypto.createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(hex, "hex")]), format: "der", type: "spki" });
  const verifies = (d, prefixed = true) => {
    try {
      return crypto.verify(null, Buffer.concat([prefixed ? PREFIX : Buffer.alloc(0), Buffer.from(V2.v2SignedBytes(d))]),
        pubOf(d.desk.key), Buffer.from(d.sig.value, "hex"));
    } catch { return false; }
  };
  const sha = buf => crypto.createHash("sha256").update(buf).digest("hex");
  const deskDir = path.join(FOLDER, "desks");
  const listing = dir => { try { return fs.readdirSync(dir); } catch { return []; } };
  const walk = dir => listing(dir).flatMap(n => { const f = path.join(dir, n);
    return fs.statSync(f).isDirectory() ? walk(f) : [f]; });
  const envelope = () => JSON.parse(fs.readFileSync(DESK, "utf8"));

  const origin = {
    format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 4, langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: ["a", "b", "c"].map(x => ({ id: "c-" + x, shelf: "t-op", bodyShape: "plain",
      title: { en: "Card " + x + " za\u017c\u00f3\u0142\u0107" }, body: { en: "Body " + x + ", \"quoted\".\nSecond line." } }))
  };
  const AG = await import(PLAIN("agent.js"));
  AG.setAgentName("Ala K.");
  const hex1 = sha(Buffer.from("lamp-shop")).slice(0, 8), ownName = "lamps-" + hex1 + ".ec";
  const loaded = CT.parseCatalogFile(JSON.stringify(origin));
  CF.activateCatalog(loaded, { file: "lamps.ec" });
  CB.applyBootCatalog();
  PK.resetPack(); PK.pack.baseCards = null; RB.rebuildCards();
  const edit = title => { PK.pack.overrides = { "c-a": { t: title } }; PK.savePack(); RB.rebuildCards(); };

  const pin = "sha256:" + sha(V2.v2SignedBytes(origin));
  const kept = JSON.parse(ST.lsGet(CT.E_CATALOG_STORE) || "{}");
  check(kept.pin === pin && kept.id === "lamp-shop",
    "77a the edition the desk loaded is pinned as it is stored: sha256 over the engine's signed bytes of the file read, "
    + "computed here by node's own hash (stored " + String(kept.pin).slice(0, 15) + ", expected " + pin.slice(0, 15) + ")");

  await tick(30);
  check(!fs.existsSync(deskDir) && !("branch" in envelope()) && !walk(UD).some(f => /desks/.test(f)),
    "77b THE CONTROL: a catalog loaded and nothing edited has made no key and no file: no desks folder, no branch in the envelope");

  const deskIdBefore = envelope().desk;
  const peekNone = await asHost("branchIdentity", false);
  check(peekNone === null && !("branch" in envelope()),
    "81a asked not to make one, the identity answers nothing where there is no key, and makes none (answer " + JSON.stringify(peekNone) + ")");
  sealOk = false;
  edit("Edited A");
  await tick(30);
  const keysBefore = Object.keys(envelope().keys).sort().join();
  const noSeal = await writeBranch();
  check(noSeal === false && !fs.existsSync(deskDir) && !("branch" in envelope()),
    "77c where Windows cannot seal a key, an edit makes no key and writes no file, and no plain key is kept instead (answer " + noSeal
    + ", desks folder " + fs.existsSync(deskDir) + ", branch in the envelope " + ("branch" in envelope()) + ")");
  sealOk = true;

  /* With no keyring Electron on Linux seals with a key built into itself, which is no seal; see sealsForReal. */
  const asks = [["linux", "basic_text"], ["linux", "unknown"], ["linux", "gnome_libsecret"], ["linux", "kwallet6"], ["win32", "basic_text"]];
  const seals = asks.map(([p, b]) => mainTest.sealsForReal({ isEncryptionAvailable: () => true, getSelectedStorageBackend: () => b }, p));
  check(seals.join() === "false,false,true,true,true",
    "77c1 only a named keyring seals on Linux, and Windows never asks which (" + asks.map((a, i) => a.join(" ") + " " + seals[i]).join(", ") + ")");
  const platformWas = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "linux" });
  keyring = "basic_text";
  let plain = null;
  try { edit("Edited A"); await tick(30); plain = await writeBranch(); }
  finally { Object.defineProperty(process, "platform", platformWas); keyring = "gnome_libsecret"; }
  check(plain === false && !fs.existsSync(deskDir) && !("branch" in envelope())
      && said.some(l => /^ERR etiuda: no keyring answers/.test(l))
      && said.some(l => /^ERR etiuda: no keyring answers.*; to have one, install GNOME Keyring \(the gnome-keyring package\) or KDE Wallet, sign in again and open the desk$/.test(l))
      && said.some(l => /^ERR etiuda: keyring backend [a-z_0-9]+, encryption available (true|false)$/.test(l)),
    "77c2 on Linux with no keyring an edit makes no key and writes no file, says how to have one, and names the backend and the"
    + " availability it was given (answer " + plain
    + ", desks folder " + fs.existsSync(deskDir) + ", branch in the envelope " + ("branch" in envelope()) + ")");

  await tick(1800);
  const names = listing(deskDir);
  const myId = names.length === 1 ? names[0] : "";
  const file = path.join(deskDir, myId, listing(path.join(deskDir, myId))[0] || ownName);
  check(/^k-[0-9a-f]{16}$/.test(myId) && fs.existsSync(file) && path.basename(file) === ownName,
    "77d the desk writes its own file by itself, shortly after the layer saves: desks/<branch id>/<stem>-<8 hex>.ec after an edit (folders "
    + JSON.stringify(names) + ")");
  const readOwn = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
  const bytesOwn = () => { try { return fs.readFileSync(file); } catch { return Buffer.alloc(0); } };
  const timeOwn = () => { try { return fs.statSync(file).mtimeMs; } catch { return 0; } };
  const titleOf = (d, i) => (((d.cards || [])[i] || {}).title || {}).en;
  const d1 = readOwn();
  const peekMine = await asHost("branchIdentity", false);
  check(!!peekMine && peekMine.id === myId && peekMine.key === d1.desk.key && Object.keys(peekMine).sort().join() === "box,id,key",
    "81b and where there is one it answers the public halves of that pair, and nothing else (" + JSON.stringify(peekMine && peekMine.id) + ")");

  check(!!d1.desk && d1.desk.id === myId && d1.desk.id === "k-" + sha(Buffer.from(String(d1.desk.key), "hex")).slice(0, 16)
    && /^[0-9a-f]{64}$/.test(d1.desk.key) && /^[0-9a-f]{64}$/.test(d1.desk.box) && d1.desk.key !== d1.desk.box && d1.desk.name === "Ala K.",
    "77e the header names the desk by its key: the folder, desk.id and sha256 of desk.key agree, both public halves are 64 hex, and the name is the agent's as typed ("
    + JSON.stringify(d1.desk && d1.desk.id) + ")");
  check(!!d1.grew && d1.grew.id === "lamp-shop" && d1.grew.rev === 4 && d1.grew.sha === pin && d1.rev === 1
    && d1.modified === true && d1.id !== "lamp-shop" && V2.v2Problems(d1).length === 0,
    "77f grew pins the loaded edition (id, rev 4, the sha above), the file is its first edition, a modified catalog of its own id, and the engine's reader finds no problem in it ("
    + V2.v2Problems(d1).slice(0, 1).join("") + ")");
  check(verifies(d1) && V2.v2ContentHash(d1) === d1.hash,
    "77g the signature verifies with desk.key under the desk prefix over the engine's signed bytes, and the hash is the engine's own");
  const tampered = JSON.parse(JSON.stringify(d1)); if (tampered.cards) tampered.cards[1].title.en = "Card B!";
  check(!verifies(d1, false) && !verifies(tampered) && !verifies(Object.assign({}, d1, { sig: Object.assign({}, d1.sig, { value: "00".repeat(64) }) })),
    "77h THE CONTROL for 77g: without the prefix, with one word of a card changed and with a wrong signature the same check refuses");
  check(titleOf(d1, 0) === "Edited A" && titleOf(d1, 1) === "Card b za\u017c\u00f3\u0142\u0107" && (d1.cards || []).length === 3,
    "77i the file holds the layer's edit and the edition's other cards as they were");

  edit("Edited A again");
  const ok2 = await writeBranch();
  const d2 = readOwn();
  check(ok2 === true && d2.rev === 2 && titleOf(d2, 0) === "Edited A again" && verifies(d2) && listing(path.join(deskDir, myId)).join() === ownName,
    "77j a second edit raises rev to 2 in the same file, signed again (rev " + d2.rev + ", files " + listing(path.join(deskDir, myId)).join() + ")");

  const before = bytesOwn(), mtime0 = timeOwn();
  await tick(20);
  PK.pack.favourites = ["c-b"]; PK.pack.hidden = ["c-c"];
  PK.pack.useCounts = { "c-a": 7, "c-b": 3 }; PK.pack.useAt = { "c-a": "2026-10-01", "c-b": "2026-10-01" }; PK.pack.intentCounts = { x: 2 };
  PK.savePack(); RB.rebuildCards();
  const ok3 = await writeBranch();
  check(ok3 === true && before.length > 0 && Buffer.compare(bytesOwn(), before) === 0 && timeOwn() === mtime0,
    "77k a star, a hide and the counts change nothing in the file: the same bytes and the same time, rev " + readOwn().rev);
  /* CLEAR LOCAL CHANGES TAKES EVERY CHANGE TO THE CONTENT (Maxim, 2026-11-09 20:31: "to clear any local changes at the
     computer, restoring content to the "fabric" state"): the edit, the star and the hide go and the counts stay, and with
     nothing left to share the write after it takes the desk's own file out of the share. The start in place is modelled by
     its three steps that read the layer; the storage and the file are put back after. */
  const LM = await import(PLAIN("local-memory.js"));
  const keysNow = () => ST.lsKeys().reduce((o, k) => { o[k] = ST.lsGet(k); return o; }, {});
  const heldKeys = keysNow(), bytesHeld = bytesOwn(), revHeld = readOwn().rev;
  let cleared = true;
  try { LM.clearLocalMemory(); } catch (e) { cleared = String(e && e.message || e); }
  PK.resetPack(); PK.loadPack(); RB.rebuildCards();
  const rClear = await writeBranch();
  const layerAfter = { stars: PK.pack.favourites.length, hides: PK.pack.hidden.length, counted: Object.keys(PK.pack.useCounts).length,
    edit: (PK.pack.overrides["c-a"] || {}).t || null };
  check(cleared === true && bytesHeld.length > 0 && !fs.existsSync(file) && layerAfter.edit === null
      && layerAfter.stars === 0 && layerAfter.hides === 0,
    "77k1 Clear local changes takes the edit, the star and the hide from the layer, and the write after it takes the desk's own"
    + " file (rev " + revHeld + " before) out of the share (clear " + JSON.stringify(cleared) + ", write " + rClear + ", file there "
    + fs.existsSync(file) + ", " + JSON.stringify(layerAfter) + ")");
  check(layerAfter.counted === 2,
    "77k2 THE CONTROL for 77k1: the same clear kept the counts, which are not a change to the content ("
    + JSON.stringify(layerAfter) + ")");
  Object.keys(keysNow()).forEach(k => { if (!(k in heldKeys)) ST.lsDel(k); });
  Object.keys(heldKeys).forEach(k => ST.lsSet(k, heldKeys[k]));
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytesHeld);
  PK.resetPack(); PK.loadPack(); RB.rebuildCards();
  PK.pack.favourites = []; PK.pack.hidden = []; PK.pack.useCounts = {}; PK.pack.useAt = {}; PK.pack.intentCounts = {}; PK.savePack();

  /* The private halves: read the sealed envelope back through the stand-in, and look for what they are everywhere the desk can be seen. */
  const br = envelope().branch || { sign: { pub: "", priv: "" }, box: { pub: "", priv: "" } };
  const seedHex = (() => { try {
    return crypto.createPrivateKey({ key: Buffer.from(safeStorage.decryptString(Buffer.from(br.sign.priv, "base64")), "base64"),
      format: "der", type: "pkcs8" }).export({ type: "pkcs8", format: "der" }).subarray(-32).toString("hex"); } catch { return ""; } })();
  const secrets = [seedHex, Buffer.from(seedHex, "hex").toString("base64"),
    safeStorage.decryptString(Buffer.from(br.sign.priv, "base64")), safeStorage.decryptString(Buffer.from(br.box.priv, "base64"))].filter(Boolean);
  const answers = [JSON.stringify(await asHost("branchIdentity")), JSON.stringify(await asHost("writeBranch", "lamps-" + hex1, JSON.stringify(d2)))];
  const formsOf = pairs => {
    const out = [];
    for (const p of pairs) for (const h of [p.sign, p.box]) {
      let der = null;
      try { der = Buffer.from(safeStorage.decryptString(Buffer.from(h.priv, "base64")), "base64"); } catch { continue; }
      const key = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
      const seed = der.subarray(-32);
      [seed, der].forEach(b => { out.push(b.toString("hex"), b.toString("base64").replace(/=+$/, ""), b.toString("base64url")); });
      out.push(key.export({ format: "jwk" }).d);
    }
    return out;
  };
  const hitsIn = (texts, forms) => { let n = 0; for (const t of texts) { const lo = t.toLowerCase(); for (const f of forms) if (t.indexOf(f) >= 0 || (/^[0-9a-f]+$/.test(f) && lo.indexOf(f) >= 0)) n++; } return n; };
  const liveForms = formsOf([br]);
  const seen = () => walk(UD).map(f => fs.readFileSync(f, "latin1")).concat(said, JSON.stringify(sent), OUT.join(""), JSON.stringify(d2), answers);
  check(secrets.length === 4 && liveForms.length === 14 && hitsIn(["planted " + liveForms[liveForms.length - 1]], liveForms) >= 1 && hitsIn(seen(), liveForms) === 0
    && Buffer.from(br.sign.priv, "base64").toString("utf8").indexOf(secrets[2]) < 0,
    "77l the private halves never leave the sealed envelope: both halves in every form (seed and pkcs8, each in hex, base64 and base64url, and the JWK d), " + liveForms.length
    + " forms searched in all " + walk(UD).length + " files under the desk, the log, every argument the page sent, this run's own output and the answers, none found, and the search finds one planted");
  const signsAsDesk = (() => { try {
    const key = crypto.createPrivateKey({ key: Buffer.from(secrets[2], "base64"), format: "der", type: "pkcs8" });
    return crypto.verify(null, Buffer.from("x"), pubOf(br.sign.pub), crypto.sign(null, Buffer.from("x"), key)); } catch { return false; } })();
  check(signsAsDesk && br.sign.pub === d2.desk.key && br.box.pub === d2.desk.box,
    "77m THE CONTROL for 77l: what the envelope seals is the private half of the public key in the file, so the search had something to find");

  /* Another desk's folder, ten edits. */
  const other = path.join(deskDir, "k-ffffffffffffffff");
  fs.mkdirSync(other, { recursive: true });
  const planted = path.join(other, ownName);
  fs.writeFileSync(planted, "{\"planted\":\"another desk's own file\"}\n");
  const longAgo = new Date("2020-01-01T00:00:00Z");
  fs.utimesSync(planted, longAgo, longAgo);
  const plantedBytes = fs.readFileSync(planted), plantedTime = fs.statSync(planted).mtimeMs;
  for (let i = 0; i < 10; i++) { edit("Round " + i); await writeBranch(); }
  const d3 = readOwn();
  check(Buffer.compare(fs.readFileSync(planted), plantedBytes) === 0 && fs.statSync(planted).mtimeMs === plantedTime
    && d3.rev === 12 && titleOf(d3, 0) === "Round 9" && listing(other).join() === ownName,
    "77n THE CONTROL: a file planted in another desk's folder keeps its bytes and its time across ten edits, while the desk's own went from rev 2 to "
    + d3.rev + " (planted time " + plantedTime + ")");

  /* What the host will sign and where it will write. */
  const asked = (stem, text) => asHost("writeBranch", stem, text);
  const foreign = Object.assign({}, d3, { desk: Object.assign({}, d3.desk, { id: "k-ffffffffffffffff" }) });
  const strangerKey = Object.assign({}, d3, { desk: Object.assign({}, d3.desk, { key: "ab".repeat(32) }) });
  const rA = await asked("lamps-" + hex1, JSON.stringify(foreign)), rB = await asked("lamps-" + hex1, JSON.stringify(strangerKey));
  const rC = await asked("..\\..\\evil-" + hex1, JSON.stringify(d3)), rD = await asked("../evil-" + hex1, JSON.stringify(d3)), rE = await asked("", JSON.stringify(d3));
  check([rA, rB, rC, rD, rE].every(r => r && r.ok === false) && !walk(UD).some(f => /evil/.test(f))
    && Buffer.compare(fs.readFileSync(planted), plantedBytes) === 0,
    "77o the host signs only a catalog that names this desk and writes only under its own folder: another desk's id, another key, two paths out of the folder and an empty name are each refused, and nothing named evil exists");

  /* A catalog folder that does not answer. */
  const away = FOLDER + ".away";
  fs.renameSync(FOLDER, away);
  edit("While away");
  const rAway = await writeBranch();
  const remade = fs.existsSync(FOLDER);
  if (fs.existsSync(FOLDER)) fs.rmSync(FOLDER, { recursive: true, force: true });
  fs.renameSync(away, FOLDER);
  const rBack = await writeBranch();
  const d4 = readOwn();
  check(rAway === false && !remade && rBack === true && titleOf(d4, 0) === "While away" && d4.rev === 13 && verifies(d4),
    "77p a catalog folder that is not there is not made again for the write, and the next write after it returns carries the latest edit (away " + rAway
    + ", folder remade " + remade + ", back " + rBack + ", rev " + d4.rev + ")");

  /* A layer holding nothing an export would carry takes the file away. */
  PK.pack.overrides = {}; PK.savePack(); RB.rebuildCards();
  const rGone = await writeBranch();
  check(rGone === true && !fs.existsSync(file) && fs.existsSync(planted),
    "77q when the layer holds no exportable change the desk removes its own file, and only its own (file present " + fs.existsSync(file)
    + ", the planted one present " + fs.existsSync(planted) + ")");

  /* With no host. */
  const shareNow = () => walk(FOLDER).map(f => f + ":" + fs.statSync(f).size).sort().join("|");
  const shareBefore = shareNow();
  window.E_HOST = undefined;
  edit("No host");
  const rNone = await writeBranch();
  let exported = null;
  window.showSaveFilePicker = async () => ({ name: "out.ec", createWritable: async () => ({ write: async t => { exported = t; }, close: async () => {} }) });
  await CF.exportCatalog();
  const x = exported ? JSON.parse(exported) : {};
  exported = null;
  await CF.exportCatalog();
  const x2 = exported ? JSON.parse(exported) : {};
  const sameShape = j => JSON.stringify(Object.keys(j)) + JSON.stringify((j.cards || []).map(c => Object.keys(c)));
  check(rNone === false && shareNow() === shareBefore,
    "77r THE CONTROL: with no host an edit writes nothing, anywhere in the catalog folder (answer " + rNone + ")");
  await tick(30);
  const keysAfter = Object.keys(envelope().keys).sort().join();
  check(/^d[0-9a-f]{32}$/.test(String(deskIdBefore)) && envelope().desk === deskIdBefore && String(deskIdBefore).indexOf(myId.slice(2)) < 0 && myId !== deskIdBefore
    && keysAfter === keysBefore,
    "77s the statistics id is the d<hex> one it was, apart from the branch id, and the desk adds no key to the desk it keeps its layer in (id " + String(envelope().desk).slice(0, 5) + "..., " + keysAfter.split(",").length + " keys before and after)");
  check(!!exported && x.id !== "lamp-shop" && !/^k-/.test(x.id) && x.id !== x2.id && x.rev === 1 && x.modified === true
    && !("grew" in x) && !("desk" in x) && !("sig" in x) && x.cards[0].title.en === "No host" && sameShape(x) === sameShape(x2),
    "77t and Export is still a new catalog, plain: a new id each time, rev " + x.rev + ", no grew, no desk, no signature, the edit in it");

  /* ---- the retry, the name of the file, and a key pair that can never open again. The host is back. */
  window.E_HOST = REAL_HOST;
  const mainText = shellSrc("main.js");
  const bodyOf = (text, name) => {
    const at = text.indexOf("function " + name + "(");
    let i = text.indexOf("\x7b", at), depth = 0;
    for (; i < text.length; i++) { const c = text[i]; if (c === "\x7b") depth++; else if (c === "\x7d" && !--depth) break; }
    return at < 0 ? "" : text.slice(at, i + 1);
  };
  const noComments = t => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const callsRetry = body => /\btryHeldBranches\(\)/.test(noComments(body));
  const loadLine = mainText.split("\n").filter(l => l.indexOf("on(\"did-finish-load\"") >= 0 && l.indexOf("tryLiveStats") >= 0)[0] || "";
  edit("Held for the folder event");
  await writeBranch();
  fs.renameSync(FOLDER, FOLDER + ".away");
  edit("Held for the folder event, second");
  const rhe = await writeBranch();
  if (fs.existsSync(FOLDER)) fs.rmSync(FOLDER, { recursive: true, force: true });
  fs.renameSync(FOLDER + ".away", FOLDER);
  const beforeEvt = titleOf(readOwn(), 0);
  mainTest.catalogChanged(null);
  const afterEvt = titleOf(readOwn(), 0);
  check(rhe === false && beforeEvt === "Held for the folder event" && afterEvt === "Held for the folder event, second"
      && callsRetry(loadLine) && !callsRetry(loadLine.replace("tryHeldBranches();", "/* tryHeldBranches(); */")),
    "77u the folder-changed event itself, driven, writes the held edit (before " + JSON.stringify(beforeEvt) + ", after " + JSON.stringify(afterEvt)
    + "), and the page-load handler calls the retry in code, where a call kept in a comment does not count");

  edit("Held edit");
  fs.renameSync(FOLDER, FOLDER + ".away");
  const rHeld = await writeBranch();
  if (fs.existsSync(FOLDER)) fs.rmSync(FOLDER, { recursive: true, force: true });
  fs.renameSync(FOLDER + ".away", FOLDER);
  const before77v = titleOf(readOwn(), 0);
  mainTest.tryHeldBranches();
  const d5 = readOwn();
  check(rHeld === false && before77v !== "Held edit" && titleOf(d5, 0) === "Held edit" && verifies(d5),
    "77v the folder back and no new edit, the retry puts the held edit in the file (answer while away " + rHeld + ", the file before the retry held " + JSON.stringify(before77v)
    + ", after: " + JSON.stringify(titleOf(d5, 0)) + ", rev " + d5.rev + ")");

  /* Two catalogs with one stem. */
  const hex2 = sha(Buffer.from("lamp-two")).slice(0, 8);
  const two = Object.assign({}, origin, { id: "lamp-two", rev: 7 });
  CF.activateCatalog(CT.parseCatalogFile(JSON.stringify(two)), { file: "lamps.ec" });
  CB.applyBootCatalog();
  PK.resetPack(); PK.pack.baseCards = null; RB.rebuildCards();
  edit("Two");
  await writeBranch();
  const ownDir = path.join(deskDir, myId);
  const docsOf = () => listing(ownDir).map(n => ({ n, d: JSON.parse(fs.readFileSync(path.join(ownDir, n), "utf8")) }));
  const pair = docsOf();
  check(pair.length === 2 && pair.every(e => /^lamps-[0-9a-f]{8}\.ec$/.test(e.n) && e.n === "lamps-" + e.d.id.slice(-8) + ".ec"
      && e.d.id.slice(-8) === sha(Buffer.from(e.d.grew.id)).slice(0, 8) && verifies(e.d))
    && pair.map(e => e.d.grew.id).sort().join() === "lamp-shop,lamp-two" && new Set(pair.map(e => e.n)).size === 2,
    "77w two catalogs with one stem are two files, each named by its own 8 hex, ending its own id, each growing from its own catalog and signed ("
    + pair.map(e => e.n + " from " + e.d.grew.id).join(", ") + ")");

  /* A rename of the grown-from file. */
  const rev2 = (pair.filter(e => e.d.grew.id === "lamp-two")[0] || { d: {} }).d.rev;
  ST.nsSet("CatalogFrom", "renamed.ec");
  edit("Two again");
  await writeBranch();
  const after = docsOf(), ofTwo = after.filter(e => e.d.grew.id === "lamp-two");
  check(after.length === 2 && ofTwo.length === 1 && ofTwo[0].n === "renamed-" + hex2 + ".ec" && ofTwo[0].d.rev === rev2 + 1
      && titleOf(ofTwo[0].d, 0) === "Two again" && after.some(e => e.n === ownName)
      && Buffer.compare(fs.readFileSync(planted), plantedBytes) === 0 && fs.statSync(planted).mtimeMs === plantedTime,
    "77x a rename of the grown-from file leaves exactly one own file for it, with its edition carried on (" + after.map(e => e.n + " rev " + e.d.rev).join(", ")
    + "), the other catalog's file and the file planted in another desk's folder as they were");

  /* A key pair that can never open again. */
  const pairBefore = JSON.stringify(envelope().branch);
  sealOk = false;
  edit("Two while sealing is unavailable");
  const rUnavail = await writeBranch();
  sealOk = true;
  check(rUnavail === false && JSON.stringify(envelope().branch) === pairBefore && !("branchOld" in envelope()),
    "77y THE CONTROL for 77z: where encryption is only unavailable nothing is made and nothing is replaced: the pair in the envelope is as it was and none is kept aside (answer " + rUnavail + ")");

  const oldBranch = envelope().branch, oldFolderFiles = listing(ownDir).join();
  decryptFails = oldBranch.sign.priv;
  edit("Two after the key was lost");
  const rNew = await writeBranch();
  edit("Two once more");
  await writeBranch();
  const idNow = await asHost("branchIdentity");
  const newDir = path.join(deskDir, idNow ? idNow.id : "none");
  const newDoc = (() => { try { return JSON.parse(fs.readFileSync(path.join(newDir, "renamed-" + hex2 + ".ec"), "utf8")); } catch { return {}; } })();
  const env = envelope();
  check(rNew === true && !!idNow && idNow.id !== myId && newDoc.desk && newDoc.desk.id === idNow.id && verifies(newDoc) && titleOf(newDoc, 0) === "Two once more"
      && newDoc.rev === 2 && JSON.stringify(env.branchOld) === JSON.stringify([oldBranch]) && env.branch.sign.pub !== oldBranch.sign.pub
      && listing(ownDir).join() === oldFolderFiles
      && said.filter(l => /branch key could not be opened/.test(l)).length === 1,
    "77z a pair the envelope throws on is replaced: a new identity (" + (idNow ? idNow.id : "none") + ", not " + myId + "), its file written and signed, the old pair kept aside in the envelope ("
    + (env.branchOld || []).length + "), the old desk's files left as they were, and the log says it once ("
    + said.filter(l => /branch key could not be opened/.test(l)).length + ")");
  decryptFails = null;

  /* ---- Clement's named edits and the rulings that came with them: a star and a hide on an unedited layer,
     a file whose signature alone is spoiled, every form of every private half, the edition after a removal, and the
     category fields. The state is the one the legs above leave: the second catalog, the replaced pair. */
  const CM = await import(PLAIN("content-model.js"));
  const CI = await import(PLAIN("cat-identity.js"));
  const IC = await import(PLAIN("icons.js"));
  const IID = await import(PLAIN("intent-id.js"));
  const CR = await import(PLAIN("cat-roles.js"));
  const ownNow = path.join(newDir, "renamed-" + hex2 + ".ec");
  const readNew = () => { try { return JSON.parse(fs.readFileSync(ownNow, "utf8")); } catch { return {}; } };
  const exportNow = async () => {
    window.E_HOST = undefined; exported = null;
    try { await CF.exportCatalog(); } finally { window.E_HOST = REAL_HOST; }
    return exported ? JSON.parse(exported) : {};
  };
  const exportBody = j => { const c = JSON.parse(JSON.stringify(j)); delete c.id; delete c.hash; return JSON.stringify(c); };
  const clearLayer = () => {
    PK.pack.favourites = []; PK.pack.hidden = []; PK.pack.useCounts = {}; PK.pack.useAt = {}; PK.pack.intentCounts = {}; PK.pack.overrides = {};
    PK.savePack(); RB.rebuildCards();
  };

  /* A star and a hide on an unedited layer make no file. */
  clearLayer();
  await writeBranch();
  const goneNow = !fs.existsSync(ownNow);
  PK.pack.favourites = ["c-b"]; PK.pack.hidden = ["c-c"]; PK.savePack(); RB.rebuildCards();
  const rStar = await writeBranch();
  check(goneNow && rStar === true && listing(newDir).filter(n => n.indexOf(hex2) >= 0).length === 0,
    "78a on an unedited layer a star and a hide make no file, and the file an edit had made is gone first (removed " + goneNow + ", files " + JSON.stringify(listing(newDir)) + ")");
  clearLayer();

  /* A file whose signature alone is spoiled is written again at the next save, with no edit. */
  edit("Signature target");
  await writeBranch();
  const sigOnly = readNew(); sigOnly.sig = Object.assign({}, sigOnly.sig, { value: "00".repeat(64) });
  fs.writeFileSync(ownNow, JSON.stringify(sigOnly, null, 1));
  const rS = await writeBranch();
  const afterS = readNew();
  check(rS === true && !verifies(sigOnly) && verifies(afterS) && afterS.rev === sigOnly.rev + 1 && titleOf(afterS, 0) === "Signature target",
    "78b an own file whose signature alone was spoiled is written again at the next save, with no edit: verifies " + verifies(afterS) + ", rev " + sigOnly.rev + " to " + afterS.rev);

  /* Every form of every private half, the pair kept aside included. */
  const idAns = await asHost("branchIdentity");
  const envNow = envelope();
  const pairsNow = [envNow.branch].concat(envNow.branchOld || []);
  const hay = () => walk(UD).map(f => fs.readFileSync(f, "latin1")).concat(said, JSON.stringify(sent), OUT.join(""), JSON.stringify(idAns));
  const allForms = formsOf(pairsNow);
  check(allForms.length === 28 && hitsIn(["x" + allForms[allForms.length - 1] + "x"], allForms) >= 1 && hitsIn(hay(), allForms) === 0
      && Object.keys(idAns || {}).sort().join() === "box,id,key",
    "78c four private halves (the live pair and the one kept aside) in every form, seed and pkcs8 each in hex, base64, base64url, and the JWK d: " + allForms.length
    + " forms, found " + hitsIn(hay(), allForms) + " times in every file under the desk, the log, every sent argument, this run's own output and the identity answer, and a planted one is found; the identity answer's keys are " + Object.keys(idAns || {}).sort().join());

  /* The edition after a removal. */
  const catRev = async (id, rev) => {
    const o = Object.assign({}, origin, { id, rev });
    CF.activateCatalog(CT.parseCatalogFile(JSON.stringify(o)), { file: id + ".ec" });
    CB.applyBootCatalog(); PK.resetPack(); PK.pack.baseCards = null; RB.rebuildCards();
  };
  const revOf = async id => {
    const n = listing(newDir).filter(f => f.indexOf(sha(Buffer.from(id)).slice(0, 8)) >= 0)[0];
    try { return JSON.parse(fs.readFileSync(path.join(newDir, n), "utf8")).rev; } catch { return 0; }
  };
  await catRev("lamp-rev", 1);
  const idRev = idAns.id + "-" + sha(Buffer.from("lamp-rev")).slice(0, 8);
  for (let i = 0; i < 5; i++) { edit("Rev " + i); await writeBranch(); }
  const rev5 = await revOf("lamp-rev");
  PK.pack.overrides = {}; PK.savePack(); RB.rebuildCards();
  await writeBranch();
  const afterRemoval = { files: listing(newDir).filter(f => f.indexOf(sha(Buffer.from("lamp-rev")).slice(0, 8)) >= 0).length, kept: envelope().branchRevs && envelope().branchRevs[idRev] };
  edit("Rev again");
  await writeBranch();
  const rev6 = await revOf("lamp-rev");
  check(rev5 === 5 && afterRemoval.files === 0 && afterRemoval.kept === 5 && rev6 === 6,
    "78d rev 5, then the layer emptied and the file removed, then a new edit gives rev 6: the envelope keeps the edition past the removal (" + rev5 + ", files after removal "
    + afterRemoval.files + ", kept " + afterRemoval.kept + ", then " + rev6 + ")");
  await catRev("lamp-rev-two", 1);
  edit("Another catalog");
  await writeBranch();
  check(await revOf("lamp-rev-two") === 1 && (envelope().branchRevs || {})[idRev] === 6,
    "78e THE CONTROL for 78d: a second desk file id starts at 1 (" + await revOf("lamp-rev-two") + "), and the first one's entry stands at " + (envelope().branchRevs || {})[idRev]);

  /* The category fields. A catalog in English and Polish, two shelves, one request. */
  const par = {
    format: 2, kind: "etiuda-catalog", id: "lamp-par", rev: 3, langs: [{ code: "en", label: "EN" }, { code: "pl", label: "PL" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers", pl: "Otwieracze" } }, { id: "t-sp", kind: "shelf", label: { en: "Spare", pl: "Zapas" } },
      { id: "t-r1", kind: "request", clause: { en: "a refund", pl: "zwrot" }, action: { en: "raised it", pl: "zlozono" }, topic: { en: "the refund", pl: "zwrot" } }],
    cards: ["a", "b", "c"].map(x => ({ id: "c-" + x, shelf: "t-op", bodyShape: "plain", requests: x === "a" ? ["t-r1"] : undefined,
      title: { en: "Card " + x, pl: "Karta " + x }, body: { en: "Body " + x + ".", pl: "Tresc " + x + "." } }))
  };
  const hexP = sha(Buffer.from("lamp-par")).slice(0, 8);
  const parFile = () => { const n = listing(newDir).filter(f => f.indexOf(hexP) >= 0)[0]; try { return JSON.parse(fs.readFileSync(path.join(newDir, n), "utf8")); } catch { return null; } };
  CF.activateCatalog(CT.parseCatalogFile(JSON.stringify(par)), { file: "par.ec" });
  CB.applyBootCatalog(); IID.snapshotBaseIntents(); PK.resetPack(); PK.pack.baseCards = null; RB.rebuildCards();
  /* Absent in a build without the category check, so its legs read red there. */
  const holdsNow = typeof CF.deskBranchHolds === "function" ? CF.deskBranchHolds : () => false;
  const kCat = "t-op";
  const baseExport = await exportNow();
  const labelOf = (j, k) => ((j.tags || []).filter(t => t.id === k)[0] || {});
  const settle = async () => { PK.savePack(); RB.rebuildCards(); await writeBranch(); };

  PK.pack.catLabelsPl = Object.assign({}, PK.pack.catLabelsPl, { [kCat]: "Otwieracze nowe" });
  await settle();
  const fPl = parFile();
  check(!CF.catalogEdited() && holdsNow() && !!fPl && labelOf(fPl, kCat).label.pl === "Otwieracze nowe" && verifies(fPl)
      && labelOf(await exportNow(), kCat).label.pl === "Otwieracze nowe",
    "78f a rename of a category in Polish alone gives a file, which Export agrees with, though the watermark's test (catalogEdited) reads false (file " + !!fPl + ", label "
    + JSON.stringify(fPl && labelOf(fPl, kCat).label)  + ")");
  PK.pack.catLabelsPl = {};
  await settle();

  const icons = Object.keys(IC.CAT_ICONS), baseIcon = labelOf(baseExport, kCat).icon;
  const pickIcon = icons.filter(k => k !== baseIcon)[0];
  PK.pack.catIcons = { [kCat]: pickIcon };
  await settle();
  const fIc = parFile();
  check(!CF.catalogEdited() && !!fIc && labelOf(fIc, kCat).icon === pickIcon && baseIcon !== pickIcon && verifies(fIc),
    "78g an icon change alone gives a file (" + baseIcon + " to " + pickIcon + ", file " + !!fIc + ")");
  PK.pack.catIcons = {};
  await settle();

  const baseHue = labelOf(baseExport, kCat).hue;
  const pickHue = [0, 1, 2, 3, 4, 6, 7, 8].filter(n => CI.hueIsOffered(n) && n !== baseHue)[0];
  PK.pack.catColors = { [kCat]: pickHue };
  await settle();
  const fCo = parFile();
  check(!CF.catalogEdited() && !!fCo && labelOf(fCo, kCat).hue === pickHue && baseHue !== pickHue && verifies(fCo),
    "78h a colour change alone gives a file (" + baseHue + " to " + pickHue + ", file " + !!fCo + ")");
  PK.pack.catColors = {};
  await settle();

  /* THE CONTROL: the category editor saved with nothing changed. */
  const none = parFile();
  PK.pack.catIcons[kCat] = CI.catIconKey(kCat); PK.pack.catColors[kCat] = CI.catSlot(kCat); delete PK.pack.catLabelsPl[kCat];
  await settle();
  const exportSaved = await exportNow();
  check(none === null && !holdsNow() && parFile() === null && exportBody(exportSaved) === exportBody(baseExport),
    "78i THE CONTROL: the category editor saved with nothing changed gives no file, and Export equals an unedited Export apart from its id and hash (file " + !!parFile()
    + ", holds " + holdsNow() + ", exports equal " + (exportBody(exportSaved) === exportBody(baseExport)) + ")");
  PK.pack.catIcons = {}; PK.pack.catColors = {};
  await settle();

  /* PARITY: a change to each of LOOSE_FIELDS makes the check true and Export differ. */
  const looseFields = ["overrides", "custom", "removed", "removedCats", "intentRemoved", "catLabels", "catLabelsPl", "customCats", "catRoles", "catIcons", "catColors",
    "intentOverrides", "intentCustom", "facts", "who", "cardOrder"];
  const clauseKey = CM.intentFieldKey("clause", "en");
  const plant = {
    overrides: () => ({ "c-a": { t: "Changed" } }),
    custom: () => [{ id: "u:parity", c: "t-op", t: "Mine", en: "Mine body" }],
    removed: () => ["c-b"],
    removedCats: () => ["t-sp"],
    intentRemoved: () => [IID.intentIdAt(0)],
    catLabels: () => ({ [kCat]: "Openers changed" }),
    catLabelsPl: () => ({ [kCat]: "Otwieracze zmienione" }),
    customCats: () => ({ uc_parity: "A new shelf" }),
    catRoles: () => ({ [kCat]: { always: true } }),
    catIcons: () => ({ [kCat]: pickIcon }),
    catColors: () => ({ [kCat]: pickHue }),
    intentOverrides: () => ({ [IID.intentIdAt(0)]: { [clauseKey]: "a changed clause" } }),
    intentCustom: () => [{ id: "ui:parity", [clauseKey]: "a custom request" }],
    facts: () => "Some facts of its own",
    who: () => ["Alpha", "Beta"],
    cardOrder: () => ["c-c", "c-b", "c-a"]
  };
  const parity = [];
  const baseBody = exportBody(await exportNow());
  for (const f of looseFields) {
    const was = PK.pack[f], orderWas = PK.pack.cardOrder.slice();
    PK.pack[f] = plant[f]();
    if (f === "catRoles") CR.refreshCatRoles && CR.refreshCatRoles();
    PK.savePack(); RB.rebuildCards();
    const holds = holdsNow(), differs = exportBody(await exportNow()) !== baseBody;
    parity.push(f + ":" + (holds ? "holds" : "NOT held") + "," + (differs ? "differs" : "SAME export"));
    PK.pack[f] = was;
    if (f !== "cardOrder") PK.pack.cardOrder = orderWas;
    if (f === "catRoles") CR.refreshCatRoles && CR.refreshCatRoles();
    PK.savePack(); RB.rebuildCards();
  }
  check(parity.length === 16 && parity.every(l => /:holds,differs$/.test(l)) && !holdsNow(),
    "78j parity: a change to each of the 16 fields the loose mark reads makes deskBranchHolds true and Export differ, and put back it is false again (" + parity.filter(l => !/:holds,differs$/.test(l)).join("; ") + (parity.every(l => /:holds,differs$/.test(l)) ? "all 16" : "") + ")");

  /* 78f's twin. The catalog declares a third language, past the primary and not Polish, and the
     rename is in that language alone. */
  const third = {
    format: 2, kind: "etiuda-catalog", id: "lamp-third", rev: 3,
    langs: [{ code: "en", label: "EN" }, { code: "pl", label: "PL" }, { code: "uk", label: "UK" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers", pl: "Otwieracze", uk: "Third shelf" } },
      { id: "t-sp", kind: "shelf", label: { en: "Spare", pl: "Zapas", uk: "Spare shelf" } },
      { id: "t-r1", kind: "request", clause: { en: "a refund", pl: "zwrot" }, action: { en: "raised it", pl: "zlozono" }, topic: { en: "the refund", pl: "zwrot" } }],
    cards: ["a", "b", "c"].map(x => ({ id: "c-" + x, shelf: "t-op", bodyShape: "plain", requests: x === "a" ? ["t-r1"] : undefined,
      title: { en: "Card " + x, pl: "Karta " + x }, body: { en: "Body " + x + ".", pl: "Tresc " + x + "." } }))
  };
  const hexT = sha(Buffer.from("lamp-third")).slice(0, 8);
  const thirdFile = () => { const n = listing(newDir).filter(f => f.indexOf(hexT) >= 0)[0]; try { return JSON.parse(fs.readFileSync(path.join(newDir, n), "utf8")); } catch { return null; } };
  CF.activateCatalog(CT.parseCatalogFile(JSON.stringify(third)), { file: "third.ec" });
  CB.applyBootCatalog(); IID.snapshotBaseIntents(); PK.resetPack(); PK.pack.baseCards = null; RB.rebuildCards();
  PK.pack["catLabels:uk"] = { [kCat]: "Third shelf renamed" };
  await settle();
  const fUk = thirdFile();
  check(!CF.catalogEdited() && holdsNow() && !!fUk && labelOf(fUk, kCat).label.uk === "Third shelf renamed" && verifies(fUk)
      && labelOf(await exportNow(), kCat).label.uk === "Third shelf renamed",
    "78l a rename of a category in a third language alone gives a file, which Export agrees with, though the watermark's test (catalogEdited) reads false (file " + !!fUk + ", label "
    + JSON.stringify(fUk && labelOf(fUk, kCat).label) + ")");
  delete PK.pack["catLabels:uk"];
  await settle();

  /* Four open tabs survive an edition load. */
  {
    const fourDocs = {
      format: 2, kind: "etiuda-catalog", id: "lamp-tabs", rev: 1,
      langs: [{ code: "en", label: "EN" }],
      tags: [
        { id: "t-op", kind: "shelf", label: { en: "Openers" } },
        { id: "t-r1", kind: "request", clause: { en: "a refund" }, action: { en: "refund" }, topic: { en: "refund" } },
        { id: "t-r2", kind: "request", clause: { en: "a status" }, action: { en: "status" }, topic: { en: "status" } },
        { id: "t-r3", kind: "request", clause: { en: "a delivery" }, action: { en: "delivery" }, topic: { en: "delivery" } },
        { id: "t-r4", kind: "request", clause: { en: "an invoice" }, action: { en: "invoice" }, topic: { en: "invoice" } }
      ],
      cards: ["a", "b", "c", "d"].map(x => ({ id: "c-" + x, shelf: "t-op", bodyShape: "plain",
        title: { en: "Card " + x }, body: { en: "Body " + x + "." } }))
    };
    CF.activateCatalog(CT.parseCatalogFile(JSON.stringify(fourDocs)), { file: "tabs.ec" });
    CB.applyBootCatalog(); IID.snapshotBaseIntents(); PK.resetPack(); PK.pack.baseCards = null; RB.rebuildCards();
    const tabsPlanted = {
      v: 1, activeTabId: "tab-1",
      tabs: [
        { id: "tab-1", pax: "Anna", path: ["c-a", "c-b"], log: [{ id: "c-a", at: 1, l: "en", b: 0 }], intentIdxs: [0] },
        { id: "tab-2", pax: "Bob", path: ["c-b", "c-c"], log: [{ id: "c-b", at: 2, l: "en", b: 0 }], intentIdxs: [1] },
        { id: "tab-3", pax: "Celia", path: ["c-c", "c-d"], log: [{ id: "c-d", at: 3, l: "en", b: 0 }], intentIdxs: [2] },
        { id: "tab-4", pax: "David", path: ["c-d", "c-a"], log: [{ id: "c-d", at: 4, l: "en", b: 0 }], intentIdxs: [3] }
      ]
    };
    ST.ssSet("eSessionTabs", JSON.stringify(tabsPlanted));

    const threeDocs = {
      format: 2, kind: "etiuda-catalog", id: "lamp-tabs", rev: 2,
      langs: [{ code: "en", label: "EN" }],
      tags: [
        { id: "t-op", kind: "shelf", label: { en: "Openers" } },
        { id: "t-r1", kind: "request", clause: { en: "a refund" }, action: { en: "refund" }, topic: { en: "refund" } },
        { id: "t-r2", kind: "request", clause: { en: "a status" }, action: { en: "status" }, topic: { en: "status" } },
        { id: "t-r4", kind: "request", clause: { en: "an invoice" }, action: { en: "invoice" }, topic: { en: "invoice" } }
      ],
      cards: ["a", "b", "c"].map(x => ({ id: "c-" + x, shelf: "t-op", bodyShape: "plain",
        title: { en: "Card " + x }, body: { en: "Body " + x + "." } }))
    };
    CF.activateCatalog(CT.parseCatalogFile(JSON.stringify(threeDocs)), { file: "tabs.ec" });
    CB.applyBootCatalog(); IID.snapshotBaseIntents(); PK.resetPack(); PK.pack.baseCards = null; RB.rebuildCards();

    const tabsAfter = JSON.parse(ST.ssGet("eSessionTabs") || "null");
    const tabsOk = !!(tabsAfter && Array.isArray(tabsAfter.tabs) && tabsAfter.tabs.length === 4
      && tabsAfter.tabs[0].pax === "Anna" && tabsAfter.tabs[0].path.join() === "c-a,c-b" && tabsAfter.tabs[0].log.map(e => e.id).join() === "c-a" && tabsAfter.tabs[0].intentIdxs.join() === "0"
      && tabsAfter.tabs[1].pax === "Bob" && tabsAfter.tabs[1].path.join() === "c-b,c-c" && tabsAfter.tabs[1].log.map(e => e.id).join() === "c-b" && tabsAfter.tabs[1].intentIdxs.join() === "1"
      && tabsAfter.tabs[2].pax === "Celia" && tabsAfter.tabs[2].path.join() === "c-c" && tabsAfter.tabs[2].log.length === 0 && tabsAfter.tabs[2].intentIdxs.length === 0
      && tabsAfter.tabs[3].pax === "David" && tabsAfter.tabs[3].path.join() === "c-a" && tabsAfter.tabs[3].log.length === 0 && tabsAfter.tabs[3].intentIdxs.join() === "2");

    check(tabsOk,
      "78m four open tabs, each with a name, history and an intent, survive a load of an edition that keeps some of their cards and intents and drops one of each");
  }

  /* A tab change within the 250 ms debounce survives an edition load. */
  {
    const TB = await import(PLAIN("tabs.js"));
    TB.initTabs();
    DM.pax.value = "Eleanor";
    TB.scheduleTabSave();
    TB.tabPathStep("c-c", { l: "en", b: 0 });

    const nextDocs = {
      format: 2, kind: "etiuda-catalog", id: "lamp-tabs", rev: 3,
      langs: [{ code: "en", label: "EN" }],
      tags: [
        { id: "t-op", kind: "shelf", label: { en: "Openers" } },
        { id: "t-r1", kind: "request", clause: { en: "a refund" }, action: { en: "refund" }, topic: { en: "refund" } },
        { id: "t-r2", kind: "request", clause: { en: "a status" }, action: { en: "status" }, topic: { en: "status" } },
        { id: "t-r4", kind: "request", clause: { en: "an invoice" }, action: { en: "invoice" }, topic: { en: "invoice" } }
      ],
      cards: ["a", "b", "c"].map(x => ({ id: "c-" + x, shelf: "t-op", bodyShape: "plain",
        title: { en: "Card " + x }, body: { en: "Body " + x + "." } }))
    };
    CF.activateCatalog(CT.parseCatalogFile(JSON.stringify(nextDocs)), { file: "tabs.ec" });
    CB.applyBootCatalog(); IID.snapshotBaseIntents(); PK.resetPack(); PK.pack.baseCards = null; RB.rebuildCards();

    const tabsAfterDebounce = JSON.parse(ST.ssGet("eSessionTabs") || "null");
    const debouncedOk = !!(tabsAfterDebounce && Array.isArray(tabsAfterDebounce.tabs)
      && tabsAfterDebounce.tabs[0].pax === "Eleanor"
      && tabsAfterDebounce.tabs[0].path.join() === "c-a,c-b,c-c"
      && tabsAfterDebounce.tabs[0].log.some(e => e.id === "c-c"));

    check(debouncedOk,
      "78n a tab change within the quarter-second debounce survives a load of a new edition");
  }

  /* 78o: a tab switch: zero sendSync (counted in preload), one drawIntentRail, and the time to first frame measured. */
  {
    const TB = await import(PLAIN("tabs.js"));
    const twoTabs = {
      activeTabId: "tab-1",
      tabs: [
        { id: "tab-1", lang: "en", pax: "First", intentIdxs: [], cats: [] },
        { id: "tab-2", lang: "en", pax: "Second", intentIdxs: [], cats: [] }
      ]
    };
    ST.ssSet("eSessionTabs", JSON.stringify(twoTabs));
    TB.initTabs();

    let railDraws = 0;
    let langUIDraws = 0;
    let tailCancels = 0;
    const wasRail = HK.hooks.drawIntentRail;
    const wasLang = HK.hooks.applyLangUI;
    HK.hooks.drawIntentRail = () => { railDraws++; };
    HK.hooks.applyLangUI = (l, mode) => {
      if (mode === "tail") { tailCancels++; return; }
      langUIDraws++;
      railDraws++;
    };
    const syncOf = () => sent.sync["etiuda:session"] || 0;
    const sendOf = () => (sent.send && sent.send["etiuda:session"]) || 0;
    const allSync = () => Object.values(sent.sync).reduce((n, v) => n + v, 0);

    const syncBefore = syncOf(), sendBefore = sendOf(), allBefore = allSync();
    const t0 = performance.now();
    TB.switchTab("tab-2");
    const sameMs = Math.round((performance.now() - t0) * 100) / 100;
    const sameSync = syncOf() - syncBefore, sameSend = sendOf() - sendBefore, sameAll = allSync() - allBefore;
    const sameRail = railDraws, sameLang = langUIDraws, sameTail = tailCancels;

    const back = TB.tabs.find(t => t.id === "tab-1");
    back.lang = "pl";
    const railAt = railDraws, langAt = langUIDraws, syncAt = syncOf(), sendAt = sendOf(), allAt = allSync();
    const t2 = performance.now();
    TB.switchTab("tab-1");
    const langMs = Math.round((performance.now() - t2) * 100) / 100;
    const langSync = syncOf() - syncAt, langSend = sendOf() - sendAt, langAll = allSync() - allAt;
    const langRail = railDraws - railAt, langLang = langUIDraws - langAt;

    HK.hooks.drawIntentRail = wasRail;
    HK.hooks.applyLangUI = wasLang;

    /* The width the ten-step loop stopped on, walked here on a straight flex line, against
       settleBarWidth. alpha 0.3 is the row the staircase's comment names (seven tenths handed back). */
    const floor = 40, alpha = 0.3;
    const walk = (from, o0) => {
      let bw = from, o = o0;
      for (let i = 0; i < 10 && o > 0.5 && bw > floor; i++) {
        const next = Math.max(floor, bw - Math.ceil(o * 1.5));
        if (next === bw) break;
        o -= alpha * (bw - next);
        bw = next;
      }
      return bw;
    };
    const widthMiss = [];
    for (const pair of [[500, 10], [800, 40], [400, 1], [300, 0.4], [200, 80]]) {
      const from = pair[0], o0 = pair[1];
      const probed = Math.max(floor, from - Math.ceil(o0 * 1.5));
      const moved = from - probed;
      const o1 = moved > 0 ? o0 - alpha * moved : o0;
      const got = TB.settleBarWidth(from, o0, probed, o1, floor);
      const want = walk(from, o0);
      if (got !== want) widthMiss.push(from + ":" + got + "<>" + want);
    }

    const ok78o = sameSync === 0 && sameAll === 0 && sameRail === 1 && sameLang === 0 && sameTail === 1 && sameSend === 1
      && langSync === 0 && langAll === 0 && langRail === 1 && langLang === 1 && langSend === 1
      && widthMiss.length === 0;
    check(ok78o,
      "78o a tab switch: zero sendSync (counted in preload), one drawIntentRail, and the time to first frame measured before and after: "
      + "same lang " + sameSync + " sendSync (" + sameAll + " of any channel), " + sameSend + " async, " + sameRail + " rail, "
      + sameLang + " lang UI, " + sameTail + " tail, " + sameMs + " ms; "
      + "other lang " + langSync + " sendSync (" + langAll + " of any channel), " + langSend + " async, " + langRail + " rail, "
      + langLang + " lang UI, " + langMs + " ms; widths " + (widthMiss.length ? widthMiss.join(" ") : "match"));
  }

  /* A catalog taken while the identity is asked: the write that began over the one before, its file already made. */
  await catRev("lamp-swap-one", 1);
  edit("Swap, first");
  await writeBranch();
  const swapFile = path.join(newDir, "lamp-swap-one-" + sha(Buffer.from("lamp-swap-one")).slice(0, 8) + ".ec");
  const swapBytes = (() => { try { return fs.readFileSync(swapFile); } catch { return Buffer.alloc(0); } })();
  const swapTime = (() => { try { return fs.statSync(swapFile).mtimeMs; } catch { return 0; } })();
  edit("Swap, second");
  const dirSwap = listing(newDir).join(), runSwap = writeBranch();
  await catRev("lamp-swap-two", 1);
  const rSwap = await runSwap;
  await tick(5); await tick(5);
  const swapNow = (() => { try { return JSON.parse(fs.readFileSync(swapFile, "utf8")); } catch { return {}; } })();
  check(rSwap === false && swapBytes.length > 0 && (() => { try { return Buffer.compare(fs.readFileSync(swapFile), swapBytes) === 0 && fs.statSync(swapFile).mtimeMs === swapTime; } catch { return false; } })()
      && listing(newDir).join() === dirSwap,
    "78k a catalog taken while the identity is asked writes nothing: the file of the catalog before keeps its bytes and its time, and no file is added (answer " + rSwap
    + ", that file now rev " + swapNow.rev + " titled " + JSON.stringify(titleOf(swapNow, 0)) + ", folder " + (listing(newDir).join() === dirSwap ? "unchanged" : "changed") + ")");

  /* ---- a catalog made from nothing on a desk: no catalog loaded, an edit, and the desk's own file with no grew. The id it
     stands in for the grown-from one is minted once and kept with the loose layer, which a load erases; the file stays. */
  ST.lsDel(CT.E_CATALOG_STORE);
  CB.applyBootCatalog(); PK.resetPack(); PK.pack.baseCards = null; RB.rebuildCards();
  const looseIds = () => ST.lsKeys().filter(k => /LooseId$/.test(k)).map(k => ST.lsGet(k));
  const madeFiles = () => listing(newDir).filter(n => /^Etiuda catalog-[0-9a-f]{8}\.ec$/.test(n));
  const madeDoc = n => { try { return JSON.parse(fs.readFileSync(path.join(newDir, n), "utf8")); } catch { return {}; } };
  const make = title => { PK.pack.custom = [{ id: "u:made", c: Object.keys(CM.CATS)[0], t: title, en: title + ", the body." }]; PK.savePack(); RB.rebuildCards(); };
  const dirBefore82 = listing(newDir).join();
  const r82a = await writeBranch();
  check(!CB.catalogLoaded() && !CF.deskBranchHolds() && r82a === false && looseIds().length === 0 && listing(newDir).join() === dirBefore82,
    "82a THE CONTROL: on the empty desk with nothing made, a write makes no file and mints no id (answer " + r82a + ", ids " + looseIds().length + ")");

  make("Made here");
  const r82b = await writeBranch();
  const m1 = madeFiles(), minted = looseIds()[0] || "", hexM = sha(Buffer.from(minted)).slice(0, 8), dM1 = madeDoc(m1[0]);
  check(r82b === true && looseIds().length === 1 && /^c-[a-z0-9]{16}$/.test(minted) && m1.length === 1 && m1[0] === "Etiuda catalog-" + hexM + ".ec"
      && dM1.id === idAns.id + "-" + hexM && !("grew" in dM1) && !!dM1.desk && dM1.desk.id === idAns.id && dM1.rev === 1 && dM1.modified === true
      && verifies(dM1) && V2.v2Problems(dM1).length === 0 && (dM1.cards || []).length === 1 && titleOf(dM1, 0) === "Made here",
    "82b an edit on an empty desk writes one file with no grew: <stem>-<8 hex of a catalog id minted once>.ec, its id the branch id and the same 8 hex, "
    + "first edition, signed, and the engine's reader finds no problem in it (files " + JSON.stringify(m1) + ", grew " + ("grew" in dM1) + ", rev " + dM1.rev
    + ", " + V2.v2Problems(dM1).slice(0, 1).join("") + ")");

  make("Made here again");
  const r82c = await writeBranch();
  const m2 = madeFiles(), dM2 = madeDoc(m2[0]);
  check(r82c === true && m2.length === 1 && m2[0] === m1[0] && dM2.id === dM1.id && dM2.rev === 2 && !("grew" in dM2) && verifies(dM2)
      && titleOf(dM2, 0) === "Made here again" && looseIds().join() === minted,
    "82c a second edit raises its rev in the same file, under the same minted id (files " + JSON.stringify(m2) + ", rev " + dM2.rev + ")");

  /* Load anyway, pressed in the bubble the load raises; a document that keeps what is set on what it makes. */
  const madePath = path.join(newDir, m2[0] || "none");
  const bytesMade = () => { try { return fs.readFileSync(madePath); } catch { return Buffer.alloc(0); } };
  const timeMade = () => { try { return fs.statSync(madePath).mtimeMs; } catch { return 0; } };
  const madeBytes = bytesMade(), madeTime = timeMade();
  const docWas = globalThis.document, made82 = [];
  const kept82 = () => { const st = {}; return new Proxy(function () {}, {
    get: (t, k) => (k in st ? st[k] : k === "querySelector" ? (s => st["q" + s] || (st["q" + s] = kept82()))
      : k === Symbol.toPrimitive ? () => "" : k === "length" ? 0 : (["contains", "matches", "hasAttribute"].includes(k) ? () => false : fake())),
    set: (t, k, v) => { st[k] = v; return true; }, apply: () => fake(), has: () => true }); };
  globalThis.document = new Proxy({}, { set: () => true, get: (t, k) => (k === "createElement" ? () => { const e = kept82(); made82.push(e); return e; }
    : k === "getElementById" ? () => null : k === "readyState" ? "complete" : k === "visibilityState" ? "visible"
    : (k === "addEventListener" || k === "removeEventListener") ? noop : fake()) });
  let pressed82 = false;
  try {
    CF.activateCatalog(CT.parseCatalogFile(JSON.stringify(Object.assign({}, origin, { id: "lamp-anew", rev: 2 }))), { file: "anew.ec" });
    const bubble = made82.filter(e => e.id === "eLoose")[0], loadAnyway = bubble && bubble["q#eLooseLoad"];
    if (loadAnyway && typeof loadAnyway.onclick === "function") { loadAnyway.onclick(); pressed82 = true; }
  } finally { globalThis.document = docWas; }
  CB.applyBootCatalog(); PK.resetPack(); PK.pack.baseCards = null; RB.rebuildCards();
  await writeBranch();
  check(pressed82 && CB.catalogLoaded() && looseIds().length === 0 && madeFiles().join() === m2.join()
      && madeBytes.length > 0 && Buffer.compare(bytesMade(), madeBytes) === 0 && timeMade() === madeTime,
    "82d after Load anyway the file is still there with the same bytes and time, and the minted id went with the loose layer (pressed " + pressed82
    + ", loaded " + CB.catalogLoaded() + ", ids " + looseIds().length + ", files " + JSON.stringify(madeFiles()) + ")");

  edit("Over the catalog loaded");
  await writeBranch();
  const hexA = sha(Buffer.from("lamp-anew")).slice(0, 8);
  check(listing(newDir).some(n => n === "anew-" + hexA + ".ec") && madeBytes.length > 0 && Buffer.compare(bytesMade(), madeBytes) === 0
      && timeMade() === madeTime && madeFiles().join() === m2.join(),
    "82e and the desk stops writing it: an edit over the catalog loaded writes that catalog's own file, and the one made from nothing keeps its bytes and its time");

  /* ---- Clement's named edits for 82: the layer emptied again, a load landing while the identity is asked, and an id the
     desk cannot keep. Each starts on the empty desk, whose minted id the load in 82d took with the layer. */
  const toEmpty = () => { ST.lsDel(CT.E_CATALOG_STORE); CB.applyBootCatalog(); PK.resetPack(); PK.pack.baseCards = null; RB.rebuildCards(); };
  const idsOnDisk = () => Object.keys(onDisk()).filter(k => /LooseId$/.test(k));
  const landed = async () => { await tick(5); await tick(5); };
  /* A write starts, and before the identity answers, Load anyway is pressed in the bubble the load raises. */
  const loadDuring = async (id, fileName) => {
    const run = writeBranch(), docWas = globalThis.document, made = [];
    let pressed = false;
    globalThis.document = new Proxy({}, { set: () => true, get: (t, k) => (k === "createElement" ? () => { const e = kept82(); made.push(e); return e; }
      : k === "getElementById" ? () => null : k === "readyState" ? "complete" : k === "visibilityState" ? "visible"
      : (k === "addEventListener" || k === "removeEventListener") ? noop : fake()) });
    try {
      CF.activateCatalog(CT.parseCatalogFile(JSON.stringify(Object.assign({}, origin, { id, rev: 1 }))), { file: fileName });
      const bubble = made.filter(e => e.id === "eLoose")[0], go = bubble && bubble["q#eLooseLoad"];
      if (go && typeof go.onclick === "function") { go.onclick(); pressed = true; }
    } finally { globalThis.document = docWas; }
    CB.applyBootCatalog(); PK.resetPack(); PK.pack.baseCards = null; RB.rebuildCards();
    const answer = await run;
    await landed();
    return { pressed, answer, loaded: CB.catalogLoaded(), ids: looseIds().length + idsOnDisk().length };
  };

  /* The first write: nothing minted yet when the load lands. */
  toEmpty();
  make("Made, and a load lands");
  const dirRace1 = listing(newDir).join();
  const race1 = await loadDuring("lamp-race-one", "race-one.ec");
  const folder1 = listing(newDir).join() === dirRace1 ? "unchanged" : "changed";
  const race1Ok = race1.pressed && race1.loaded && race1.answer === false && race1.ids === 0 && folder1 === "unchanged";

  toEmpty();
  make("Made to be taken back");
  await writeBranch();
  const m3 = madeFiles().filter(n => m2.indexOf(n) < 0), id3 = looseIds()[0] || "", made3 = path.join(newDir, m3[0] || "none");
  PK.pack.custom = []; PK.savePack(); RB.rebuildCards();
  const r82f = await writeBranch();
  check(m3.length === 1 && m3[0] === "Etiuda catalog-" + sha(Buffer.from(id3)).slice(0, 8) + ".ec" && !CF.deskBranchHolds() && r82f === true
      && !fs.existsSync(made3) && looseIds().join() === id3,
    "82f the empty desk emptied again: with nothing left that it made, the file it made is removed and the minted id is kept (answer " + r82f
    + ", file present " + fs.existsSync(made3) + ", ids " + looseIds().length + ")");

  /* The second write: the file made and its id kept when the load lands. */
  make("Made again");
  await writeBranch();
  const bytes3 = (() => { try { return fs.readFileSync(made3); } catch { return Buffer.alloc(0); } })(), time3 = (() => { try { return fs.statSync(made3).mtimeMs; } catch { return 0; } })();
  make("Made again, and a load lands");
  const dirRace2 = listing(newDir).join();
  const race2 = await loadDuring("lamp-race-two", "race-two.ec");
  const kept3 = (() => { try { return Buffer.compare(fs.readFileSync(made3), bytes3) === 0 && fs.statSync(made3).mtimeMs === time3; } catch { return false; } })();
  const folder2 = listing(newDir).join() === dirRace2 ? "unchanged" : "changed";
  const race2Ok = race2.pressed && race2.loaded && race2.answer === false && race2.ids === 0 && bytes3.length > 0 && kept3 && folder2 === "unchanged";
  check(race1Ok && race2Ok,
    "82g a load landing while the identity is asked writes nothing: before the first write no id is minted and no file made, and after it the file made keeps its bytes and its time ("
    + "first " + JSON.stringify(race1) + ", folder " + folder1 + "; second " + JSON.stringify(race2) + ", folder " + folder2 + ", file kept " + kept3 + ")");

  /* An id that cannot be kept: desk.json read-only, the lever 2d uses, before the first write on the empty desk. */
  toEmpty();
  make("Made where the id cannot be kept");
  await landed();
  const dirRO = listing(newDir);
  let rRO = null, idsRO = -1, dirDuring = "";
  holdDesk(true);
  try { rRO = await writeBranch(); idsRO = looseIds().length; dirDuring = listing(newDir).join(); }
  finally { holdDesk(false); }
  const rBackRO = await writeBranch();
  await landed();
  const newRO = listing(newDir).filter(n => dirRO.indexOf(n) < 0), idRO = looseIds()[0] || "";
  check(rRO === false && idsRO === 0 && dirDuring === dirRO.join() && rBackRO === true && looseIds().length === 1 && idsOnDisk().length === 1
      && newRO.length === 1 && newRO[0] === "Etiuda catalog-" + sha(Buffer.from(idRO)).slice(0, 8) + ".ec",
    "82h where the minted id cannot be saved the desk makes no file and keeps no id, and once it can, the next write makes one file named by the id kept (answer "
    + rRO + ", ids " + idsRO + ", then " + rBackRO + ", new files " + JSON.stringify(newRO) + ")");
  /* ---- THE WINDOW'S CLOSE. A window as far as the hold asks of it: what it sends, and how often it is closed.
     Quit on close is on for these legs: the product's default is Stay in the tray, and that would hide where these legs ask. */
  if (typeof mainTest.setQuitOnClose === "function") mainTest.setQuitOnClose(true);
  const winFor = () => {
    const id = madeWins.length + 1;
    const w = { sent: [], closes: 0, webContents: { id, send: ch => w.sent.push(ch), etiudaLost: null },
      isDestroyed: () => false, close() { w.closes++; } };
    madeWins.push(w);
    return w;
  };
  const closeEv = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
  const H = (w) => { const e = closeEv(); const held = mainTest.closeHeld(w, e); return (held ? "held" : "free") + (e.prevented ? "!" : ""); };
  const wa = winFor();
  const a1 = H(wa), sentA = wa.sent.join();
  mainTest.closeAnswered(wa, "asked");
  await tick(1700);
  const quietA = wa.closes;
  mainTest.closeAnswered(wa, "stay");
  const a2 = H(wa);
  mainTest.closeAnswered(wa, "asked");
  mainTest.closeAnswered(wa, "close");
  const a3 = [wa.closes, H(wa)].join("/");
  check(a1 === "held!" && sentA === "etiuda:ask-close" && quietA === 0 && a2 === "held!" && a3 === "1/free",
    "1012d1 a close is held and the page asked; once it has asked, nothing closes the window but the person's answer: Cancel leaves the next close held again, Close Etiuda closes it, and that close is let go ("
    + [a1, sentA, quietA, a2, a3].join(" ") + ")");
  /* 1012d4, before d2's quit, which leaves the shell quitting for the rest of this file (Clément's read, hole 2): a window
     already let go is let go again with nothing asked; the hold's own wiring, driven on a window that keeps its listeners
     (hole 3); a page loaded again after it was lost holds again (note a); and createWindow wires the hold, read from its
     text with the comments taken out. */
  const wf = winFor();
  wf.etiudaCloseOk = true;
  const already = [H(wf), wf.sent.length].join("/");
  const wired = winFor(), heardWin = {};
  wired.on = (k, fn) => { heardWin[k] = fn; };
  let placeKept = 0;
  mainTest.wireHold(wired, () => { placeKept++; });
  const e1 = closeEv(); heardWin.close(e1);
  const first = [e1.prevented, wired.sent.join(), placeKept].join("/");
  mainTest.closeAnswered(wired, "stay");
  (heardWin["session-end"] || noop)();
  const e2 = closeEv(); heardWin.close(e2);
  const afterEnd = [e2.prevented, placeKept].join("/");
  const refusalWin = winFor(), heardRef = {};
  refusalWin.on = (k, fn) => { heardRef[k] = fn; };
  mainTest.wireHold(refusalWin, noop);
  refusalWin.close = function () { this.closes++; const e = closeEv(); heardRef.close(e); this.lastPrevented = e.prevented; };
  mainTest.closeFromRefusal(refusalWin);
  const fromRefusal = [refusalWin.closes, refusalWin.lastPrevented, refusalWin.sent.length].join("/");
  /* a close already held, asking, or answered "asked", is let go when the session ends */
  const askingEnd = [];
  for (const answered of [null, "asked"]) {
    const w = winFor(), on = {};
    w.on = (k, fn) => { on[k] = fn; };
    mainTest.wireHold(w, noop);
    on.close(closeEv());
    if (answered) mainTest.closeAnswered(w, answered);
    (on["session-end"] || noop)();
    askingEnd.push(w.closes);
  }
  const back = winFor();
  back.webContents.etiudaLost = { reason: "crashed", back: true };
  const backHeld = H(back);
  const MAIN_CODE = shellSrc("main.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const inCreate = MAIN_CODE.slice(MAIN_CODE.indexOf("function createWindow("), MAIN_CODE.indexOf("function createWindow(") + 20000);
  /* The hold is driven, not matched. A dead `if (false) wireHold(win, ` still matches the old
     regex and registers nothing; the window this stand-in built has no close that asks. The
     watch is stood in for the call only, so the drive does not arm a watch on the tree. */
  const realWatch = fs.watch;
  fs.watch = () => ({ on() { return this; }, close() {} });
  let drivenHold = false, driveWhy = "";
  try {
    const before = madeWins.length;
    mainTest.createWindow();
    const heldWin = madeWins.slice(before).reverse().find(w => (w.listeners.close || []).length);
    const ev = closeEv();
    if (heldWin) heldWin.listeners.close.forEach(fn => fn(ev));
    drivenHold = !!(heldWin && ev.prevented && heldWin.sent.indexOf("etiuda:ask-close") >= 0);
  } catch (e) {
    driveWhy = String(e && e.stack || e).split("\n")[0];
  } finally {
    fs.watch = realWatch;
  }
  const textWired = drivenHold && /closeFromRefusal\(win\)/.test(inCreate) && /lost\.back = true/.test(inCreate);
  check(already === "free/0" && first === "true/etiuda:ask-close/0" && afterEnd === "false/1" && fromRefusal === "1/false/0"
        && backHeld === "held!" && textWired && askingEnd.join() === "1,1",
    "1012d4 a window already let go is let go with nothing asked; the hold's wiring holds the window's close and asks, and"
    + " lets it go at the end of the Windows session; the refusal page's Close is never held; a page loaded again after it"
    + " was lost holds again; a close held and asking, or answered asked, is let go when the session ends; and createWindow"
    + " drives the hold (" + [already, first, afterEnd, fromRefusal, backHeld, textWired, askingEnd.join(","), driveWhy].join(" ") + ")");
  /* The constant's name is not the timer. closeHeld is driven with setTimeout stood in, and the
     delay it records has to be 1500. A literal 1600 at that call leaves the constant at 1500 and
     still fails here. */
  const realSetTimeout = globalThis.setTimeout;
  const delays = [];
  globalThis.setTimeout = (fn, ms, ...rest) => {
    delays.push(ms);
    return realSetTimeout(fn, ms, ...rest);
  };
  let delaySeen = null;
  try {
    const wt = winFor();
    H(wt);
    delaySeen = delays.length === 1 ? delays[0] : delays.join(",");
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  check(mainTest.CLOSE_WAIT_MS === 1500 && delaySeen === 1500,
    "1012d5 a silent page is let go at 1500 ms, so a wait written as 1600 is already past the hold (constant "
    + mainTest.CLOSE_WAIT_MS + ", timer " + delaySeen + ")");

  /* 1152f, 1152g, 1152h, 1152i, 1152j, 1152k: Updates 8 / Row A7: A silent update never strands a desk.
     Only the installer's explicit signal (--update-close) skips the modal when safeStorage is available,
     saving all open windows' tabs in sealed format to disk; every other close asks as ruled. */
  let altF4Asked = false;
  try {
    const wAlt = winFor();
    const fakeEv = closeEv();
    const sm = new Map();
    sm.set("eSessionTabs", JSON.stringify({ v: 1, tabs: [{ id: "t-1", pax: "Customer A", intentBox: "Draft A" }], activeTabId: "t-1" }));
    mainTest.sessionHeld.set(wAlt.webContents.id, sm);
    const held = mainTest.closeHeld(wAlt, fakeEv);
    const sentAsk = wAlt.sent.some(s => (typeof s === "string" ? s : s.ch) === "etiuda:ask-close");
    const tf = mainTest.tabsFile();
    const noFile = !fs.existsSync(tf);
    altF4Asked = held && fakeEv.prevented && sentAsk && wAlt.closes === 0 && noFile;
    mainTest.sessionHeld.delete(wAlt.webContents.id);
  } catch (e) { altF4Asked = false; }
  check(altF4Asked,
    "1152f an Alt+F4-shaped close with no installer signal still asks");

  let signalSealed = false;
  try {
    const wSig = winFor();
    const fakeEv = closeEv();
    const draftText = "Known secret draft string for A7";
    const sm = new Map();
    sm.set("eSessionTabs", JSON.stringify({ v: 1, tabs: [{ id: "t-1", pax: "Customer A", intentBox: draftText }], activeTabId: "t-1" }));
    mainTest.sessionHeld.set(wSig.webContents.id, sm);
    const handled = typeof mainTest.handleUpdateClose === "function" && mainTest.handleUpdateClose();
    const tf = mainTest.tabsFile();
    const fileExists = fs.existsSync(tf);
    const rawBytes = fileExists ? fs.readFileSync(tf) : Buffer.alloc(0);
    const draftAbsent = !rawBytes.includes(draftText) && !rawBytes.includes("Customer A");
    const heldUnderSignal = mainTest.closeHeld(wSig, fakeEv);
    signalSealed = !!(handled && fileExists && draftAbsent && !heldUnderSignal && !fakeEv.prevented && wSig.closes >= 1);
    mainTest.sessionHeld.delete(wSig.webContents.id);
  } catch (e) { signalSealed = false; }
  check(signalSealed,
    "1152g the installer's signal gives no modal, a sealed file, and a known draft string absent from its bytes");

  let restoredOk = false;
  try {
    if (typeof mainTest.readSavedTabs === "function" && typeof mainTest.tabsFile === "function") {
      const tf = mainTest.tabsFile();
      const readBack = mainTest.readSavedTabs();
      const unlinked = !fs.existsSync(tf);
      const parsed = readBack && JSON.parse(readBack);
      restoredOk = !!(parsed && parsed.tabs && parsed.tabs[0].pax === "Customer A" && parsed.tabs[0].intentBox === "Known secret draft string for A7" && unlinked);
    }
  } catch (e) { restoredOk = false; }
  check(restoredOk,
    "1152h the next start reads the saved tabs from disk, unlinks the file, and restores the draft");

  let twoWindowsKept = false;
  try {
    const w1 = winFor(), w2 = winFor();
    const sm1 = new Map(), sm2 = new Map();
    sm1.set("eSessionTabs", JSON.stringify({ v: 1, tabs: [{ id: "t-w1", pax: "Customer Window1", intentBox: "Draft 1" }], activeTabId: "t-w1" }));
    sm2.set("eSessionTabs", JSON.stringify({ v: 1, tabs: [{ id: "t-w2", pax: "Customer Window2", intentBox: "Draft 2" }], activeTabId: "t-w2" }));
    mainTest.sessionHeld.set(w1.webContents.id, sm1);
    mainTest.sessionHeld.set(w2.webContents.id, sm2);
    mainTest.handleUpdateClose();
    const readBack = mainTest.readSavedTabs();
    const parsed = readBack && JSON.parse(readBack);
    const hasW1 = parsed && parsed.tabs && parsed.tabs.some(t => t.pax === "Customer Window1");
    const hasW2 = parsed && parsed.tabs && parsed.tabs.some(t => t.pax === "Customer Window2");
    twoWindowsKept = !!(hasW1 && hasW2 && parsed.tabs.length >= 2);
  } catch (e) { twoWindowsKept = false; }
  check(twoWindowsKept,
    "1152i two windows keep both sets of tabs across an installer close and restore");

  let noSealingAsks = false;
  try {
    sealOk = false;
    const wNoSeal = winFor();
    const fakeEv = closeEv();
    const sm = new Map();
    sm.set("eSessionTabs", JSON.stringify({ v: 1, tabs: [{ id: "t-ns", pax: "Customer NoSeal", intentBox: "Draft NS" }], activeTabId: "t-ns" }));
    mainTest.sessionHeld.set(wNoSeal.webContents.id, sm);
    const handled = mainTest.handleUpdateClose();
    const tf = mainTest.tabsFile();
    const noFile = !fs.existsSync(tf);
    const held = mainTest.closeHeld(wNoSeal, fakeEv);
    noSealingAsks = !handled && noFile && held && fakeEv.prevented;
  } catch (e) { noSealingAsks = false; }
  finally { sealOk = true; }
  check(noSealingAsks,
    "1152j when sealing is unavailable the desk writes nothing and falls back to the ask");

  let plantDraft = false;
  try {
    const MAIN_SRC = shellSrc("main.js");
    plantDraft = MAIN_SRC.indexOf("plant:installer-keeps-draft") >= 0;
  } catch (e) { plantDraft = false; }
  check(plantDraft,
    "1152k plant:installer-keeps-draft guards the tab session persistence at external close");

  let writeFailAsks = false;
  try {
    const wFail = winFor();
    const fakeEv = closeEv();
    const sm = new Map();
    sm.set("eSessionTabs", JSON.stringify({ v: 1, tabs: [{ id: "t-wf", pax: "Customer WriteFail", intentBox: "Draft WriteFail" }], activeTabId: "t-wf" }));
    mainTest.sessionHeld.set(wFail.webContents.id, sm);
    const origWriteFileSync = fs.writeFileSync;
    fs.writeFileSync = () => { throw new Error("Planted disk failure"); };
    let handled = true;
    try {
      handled = mainTest.handleUpdateClose();
    } catch (_) {
      handled = false;
    } finally {
      fs.writeFileSync = origWriteFileSync;
    }
    const held = mainTest.closeHeld(wFail, fakeEv);
    writeFailAsks = !handled && wFail.closes === 0 && !wFail.etiudaInstallerClose && held && fakeEv.prevented && wFail.sent.includes("etiuda:ask-close");
    mainTest.sessionHeld.delete(wFail.webContents.id);
  } catch (e) { writeFailAsks = false; }
  check(writeFailAsks,
    "1152o a planted write failure closes nothing and asks");

  let decryptLeavesFile = false;
  try {
    const tf = mainTest.tabsFile();
    const fakePayload = safeStorage.encryptString(JSON.stringify({ v: 1, windows: [{ id: 1, tabs: [{ id: "t-df", pax: "Customer DecFail", intentBox: "Draft DecFail" }], activeTabId: "t-df" }] }));
    fs.writeFileSync(tf, fakePayload);
    decryptFails = Buffer.from(fakePayload).toString("base64");
    const readBack = mainTest.readSavedTabs();
    const fileStillThere = fs.existsSync(tf);
    decryptLeavesFile = fileStillThere && readBack === "";
    try { fs.unlinkSync(tf); } catch (_) {}
  } catch (e) { decryptLeavesFile = false; }
  finally { decryptFails = null; }
  check(decryptLeavesFile,
    "1152p a failed decrypt leaves the file");

  /* D6. Stay hides and tells once. Quit from the tray seals the tabs and quits. The installer's close, the end of
     the session, a refusal and a quit never hide. A close whose tray cannot be created is not hidden. Reset of the
     login item is the preload's send. A launch with --hidden does not show the window. The tray menu uses the desk's
     words. */
  const watchStub = () => ({ on() { return this; }, close() {} });
  /* Before any successful tray: ensureTray keeps the first one it made, so a later throw would never be asked. */
  let d6NoTray = false, d6NoTrayWhy = "";
  try {
    if (typeof mainTest.setQuitOnClose === "function") mainTest.setQuitOnClose(false);
    FakeTray.throwOnCreate = true;
    const saidBefore = said.length;
    const notesBefore = madeNotes.length;
    const traysBefore = madeTrays.length;
    const w = winFor();
    w.hides = 0;
    w.hide = () => { w.hides++; };
    const e = closeEv();
    const held = mainTest.closeHeld(w, e);
    const asked = (w.sent || []).indexOf("etiuda:ask-close") >= 0;
    const trayErr = said.slice(saidBefore).some(s => s.indexOf("the tray could not be created") >= 0);
    d6NoTray = held === true && e.prevented === true && w.hides === 0 && asked && trayErr
      && madeNotes.length === notesBefore && madeTrays.length === traysBefore;
    if (!d6NoTray) d6NoTrayWhy = JSON.stringify({ held: held, prevented: e.prevented, hides: w.hides, asked: asked, trayErr: trayErr, notes: madeNotes.length - notesBefore, trays: madeTrays.length - traysBefore });
    mainTest.closeAnswered(w, "stay");
  } catch (err) { d6NoTrayWhy = String(err && err.message || err).split("\n")[0]; }
  finally { FakeTray.throwOnCreate = false; }
  check(d6NoTray, "D6-no-tray a close is not hidden when the tray cannot be created, and the page is asked (" + d6NoTrayWhy + ")");
  let d6Stay = false, d6StayWhy = "";
  try {
    if (typeof mainTest.setQuitOnClose === "function") mainTest.setQuitOnClose(false);
    const placeFile = mainTest.windowFile();
    fs.writeFileSync(placeFile, JSON.stringify({ x: 3, y: 4, width: 5, height: 6, maximized: false }));
    const w = winFor();
    w.hides = 0; w.shows = 0;
    w.hide = () => { w.hides++; };
    w.show = () => { w.shows++; };
    w.focus = () => {};
    w.isMinimized = () => false;
    const notesBefore = madeNotes.length;
    const e1 = closeEv();
    const held = mainTest.closeHeld(w, e1);
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(placeFile, "utf8")); } catch { meta = {}; }
    const note = madeNotes[madeNotes.length - 1];
    const clicks = (note && note.handlers && note.handlers.click) || [];
    clicks.forEach(fn => fn());
    const e2 = closeEv();
    mainTest.closeHeld(w, e2);
    const title = note && note.opts && note.opts.title;
    const body = note && note.opts && note.opts.body;
    d6Stay = held === true && e1.prevented === true && w.hides === 2 && w.shows === 1
      && madeNotes.length === notesBefore + 1 && meta.x === 3 && meta.trayTold === true
      && title === "Etiuda keeps running in the tray"
      && body === "Its shortcut still works and the team's updates still arrive. To quit, right-click the tray icon and choose Quit Etiuda; Settings, under General, can make closing the window quit instead."
      && Array.isArray(note.opts.actions) && note.opts.actions.length === 0;
    if (!d6Stay) d6StayWhy = JSON.stringify({ held: held, prevented: e1.prevented, hides: w.hides, shows: w.shows, notes: madeNotes.length - notesBefore, title: title, x: meta.x, told: meta.trayTold });
  } catch (e) { d6StayWhy = String(e && e.message || e).split("\n")[0]; }
  check(d6Stay, "D6-stay the first close hides and tells once, the click opens the window, and a later close does not tell again (" + d6StayWhy + ")");

  let d6Never = false, d6NeverWhy = "";
  try {
    if (typeof mainTest.setQuitOnClose === "function") mainTest.setQuitOnClose(false);
    const w = winFor();
    w.hides = 0;
    w.hide = () => { w.hides++; };
    const heard = {};
    w.on = (k, fn) => { heard[k] = fn; };
    mainTest.wireHold(w, () => {});
    const plain = closeEv();
    heard.close(plain);
    const hid = w.hides === 1 && plain.prevented === true;
    w.etiudaInstallerClose = true;
    const inst = closeEv();
    heard.close(inst);
    const instOk = inst.prevented === false && w.hides === 1;
    const sess = winFor();
    sess.hides = 0;
    sess.hide = () => { sess.hides++; };
    const heardS = {};
    sess.on = (k, fn) => { heardS[k] = fn; };
    mainTest.wireHold(sess, () => {});
    (heardS["session-end"] || noop)();
    const sessEv = closeEv();
    heardS.close(sessEv);
    const sessOk = sessEv.prevented === false && sess.hides === 0;
    const ref = winFor();
    ref.hides = 0;
    ref.hide = () => { ref.hides++; };
    const heardR = {};
    ref.on = (k, fn) => { heardR[k] = fn; };
    mainTest.wireHold(ref, () => {});
    ref.close = function () { this.closes++; const ev = closeEv(); heardR.close(ev); this.lastPrevented = ev.prevented; };
    mainTest.closeFromRefusal(ref);
    const refOk = ref.closes === 1 && ref.lastPrevented === false && ref.hides === 0 && ref.sent.length === 0;
    const q = winFor();
    q.hides = 0;
    q.hide = () => { q.hides++; };
    mainTest.setQuitting(true);
    const qEv = closeEv();
    const qHeld = mainTest.closeHeld(q, qEv);
    const quitOk = qHeld === false && qEv.prevented === false && q.hides === 0;
    mainTest.setQuitting(false);
    d6Never = hid && instOk && sessOk && refOk && quitOk;
    if (!d6Never) d6NeverWhy = JSON.stringify({ hid: hid, instOk: instOk, sessOk: sessOk, refOk: refOk, quitOk: quitOk, hides: w.hides });
  } catch (e) { d6NeverWhy = String(e && e.message || e).split("\n")[0]; }
  check(d6Never, "D6-never-hide Stay hides an ordinary close, and the installer, the session ending, a refusal and a quit do not (" + d6NeverWhy + ")");

  let d6Quit = false, d6QuitWhy = "";
  try {
    if (typeof mainTest.trayQuit !== "function") d6QuitWhy = "no trayQuit";
    else {
      const w = winFor();
      const sm = new Map();
      sm.set("eSessionTabs", JSON.stringify({ v: 1, tabs: [{ id: "t-tray", pax: "Tray Person", intentBox: "Tray draft" }], activeTabId: "t-tray" }));
      mainTest.sessionHeld.set(w.webContents.id, sm);
      const q0 = appQuits;
      const asks = () => madeWins.reduce((n, win) => n + (win.sent || []).filter(ch => ch === "etiuda:ask-close").length, 0);
      const asks0 = asks();
      const sealed = mainTest.trayQuit() === true;
      const tf = mainTest.tabsFile();
      const raw = fs.existsSync(tf) ? fs.readFileSync(tf) : Buffer.alloc(0);
      const text = raw.toString("utf8");
      const sealedOk = sealed && appQuits === q0 + 1 && asks() === asks0 && text.indexOf("Tray draft") < 0 && text.indexOf("Tray Person") < 0 && raw.length > 0;
      try { fs.unlinkSync(tf); } catch { /* none */ }
      sealOk = false;
      const q1 = appQuits;
      const asked = mainTest.trayQuit() === false && asks() === asks0 + 1 && appQuits === q1;
      sealOk = true;
      mainTest.setQuitting(false);
      mainTest.sessionHeld.delete(w.webContents.id);
      d6Quit = sealedOk && asked;
      if (!d6Quit) d6QuitWhy = JSON.stringify({ sealedOk: sealedOk, asked: asked, quits: appQuits - q0, bytes: raw.length });
    }
  } catch (e) { d6QuitWhy = String(e && e.message || e).split("\n")[0]; sealOk = true; mainTest.setQuitting(false); }
  check(d6Quit, "D6-quit-tabs Quit from the tray seals the open tabs and quits, and where the seal fails it asks and does not quit (" + d6QuitWhy + ")");

  let d6Update = false, d6UpdateWhy = "";
  try {
    if (typeof mainTest.setQuitOnClose === "function") mainTest.setQuitOnClose(false);
    const w = winFor();
    w.hides = 0;
    w.hide = () => { w.hides++; };
    const heard = {};
    w.on = (k, fn) => { heard[k] = fn; };
    mainTest.wireHold(w, () => {});
    const plain = closeEv();
    heard.close(plain);
    const hid = w.hides === 1 && plain.prevented === true;
    w.close = function () {
      this.closes++;
      const ev = closeEv();
      (heard.close || noop)(ev);
      this.lastPrevented = ev.prevented;
      if (!ev.prevented && appOn["window-all-closed"]) appOn["window-all-closed"]();
    };
    const q0 = appQuits;
    if (hid && typeof mainTest.onSecondInstance === "function") mainTest.onSecondInstance(["--update-close"]);
    d6Update = hid && w.hides === 1 && w.lastPrevented === false && appQuits > q0;
    if (!d6Update) d6UpdateWhy = JSON.stringify({ hid: hid, hides: w.hides, prevented: w.lastPrevented, quits: appQuits - q0, second: typeof mainTest.onSecondInstance });
  } catch (e) { d6UpdateWhy = String(e && e.message || e).split("\n")[0]; }
  check(d6Update, "D6-update-close an installer close of a window that had hidden still ends the process (" + d6UpdateWhy + ")");

  let d6Login = false, d6LoginWhy = "";
  try {
    if (typeof REAL_HOST.setLoginItem !== "function") d6LoginWhy = "no setLoginItem";
    else {
      loginApplied = { openAtLogin: true, args: ["--hidden"] };
      REAL_HOST.setLoginItem(false);
      d6Login = !!loginApplied && loginApplied.openAtLogin === false && Array.isArray(loginApplied.args) && loginApplied.args.length === 0;
      if (!d6Login) d6LoginWhy = JSON.stringify(loginApplied);
    }
  } catch (e) { d6LoginWhy = String(e && e.message || e).split("\n")[0]; }
  check(d6Login, "D6-login Reset's turn-off reaches Windows as a login item with no hidden argument (" + d6LoginWhy + ")");

  let d6Hidden = false, d6HiddenWhy = "";
  const realWatchD6 = fs.watch;
  fs.watch = watchStub;
  process.argv.push("--hidden");
  try {
    const before = madeWins.length;
    mainTest.createWindow();
    const w = madeWins[madeWins.length - 1];
    let shows = 0;
    w.show = () => { shows++; };
    (w.listeners["ready-to-show"] || []).forEach(fn => fn());
    const told = (w.sent || []).indexOf("etiuda:shown") >= 0;
    const launchShows = shows;
    let secondHidden = false, secondOpen = false;
    if (launchShows === 0 && told && typeof mainTest.onSecondInstance === "function") {
      mainTest.onSecondInstance(["--hidden"]);
      secondHidden = shows === 0;
      mainTest.onSecondInstance(["Etiuda"]);
      secondOpen = shows === 1;
    }
    d6Hidden = launchShows === 0 && told && secondHidden && secondOpen;
    if (!d6Hidden) d6HiddenWhy = JSON.stringify({ shows: launchShows, told: told, secondHidden: secondHidden, secondOpen: secondOpen, made: madeWins.length - before });
  } catch (e) { d6HiddenWhy = String(e && e.message || e).split("\n")[0]; }
  finally { fs.watch = realWatchD6; process.argv.pop(); }
  check(d6Hidden, "D6-hidden a launch with --hidden does not show the window, a second hidden launch does not either, and an ordinary second launch does (" + d6HiddenWhy + ")");

  let d6Menu = false, d6MenuWhy = "";
  const realWatchMenu = fs.watch;
  fs.watch = watchStub;
  try {
    if (typeof mainTest.ensureTray !== "function") d6MenuWhy = "no ensureTray";
    else {
      mainTest.createWindow();
      const w = madeWins[madeWins.length - 1];
      let shows = 0;
      w.show = () => { shows++; };
      w.focus = () => {};
      w.isMinimized = () => false;
      const tray = mainTest.ensureTray();
      const labels = (tray && tray.menu && tray.menu.template || []).map(item => item.type === "separator" ? "|" : item.label);
      const want = ["Open Etiuda", "Bring the replies over any window\tCtrl+Shift+Space", "Notifications: on", "Settings", "|", "Quit Etiuda"];
      const notes = (tray && tray.menu && tray.menu.template || []).find(item => item.label === "Notifications: on");
      if (notes && notes.click) notes.click();
      const labels2 = (tray && tray.menu && tray.menu.template || []).map(item => item.label);
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(mainTest.windowFile(), "utf8")); } catch { meta = {}; }
      if (tray && tray.handlers && tray.handlers.click) tray.handlers.click();
      const opened = shows === 1;
      shows = 0;
      const settingsItem = (tray && tray.menu && tray.menu.template || []).find(item => item.label === "Settings");
      if (settingsItem && settingsItem.click) settingsItem.click();
      const went = (w.sent || []).indexOf("etiuda:tray-go") >= 0 && shows === 1;
      d6Menu = !!tray && tray.tip === "Etiuda" && JSON.stringify(labels) === JSON.stringify(want)
        && labels2.indexOf("Notifications: off") >= 0 && meta.trayNotes === false && opened && went;
      if (!d6Menu) d6MenuWhy = JSON.stringify({ tip: tray && tray.tip, labels: labels, labels2: labels2, notes: meta.trayNotes, opened: opened, went: went });
    }
  } catch (e) { d6MenuWhy = String(e && e.message || e).split("\n")[0]; }
  finally { fs.watch = realWatchMenu; }
  check(d6Menu, "D6-menu the tray offers Open, the replies shortcut, notifications, Settings and Quit, and a click opens the window (" + d6MenuWhy + ")");

  /* 973. LINUX DESK TRAY PNG AND LOGIN ITEM OFF WINDOWS */
  /* 973a. PNG exists and carries PNG signature */
  const trayPngPath = path.join(ROOT, "shell", "etiuda-tray.png");
  const pngExists = fs.existsSync(trayPngPath);
  let pngSig = false;
  if (pngExists) {
    const b = fs.readFileSync(trayPngPath);
    pngSig = b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
      && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
  }
  check(pngExists && pngSig, "973a shell/etiuda-tray.png exists and carries the PNG signature");

  /* 973b. Package file list in electron-builder.js carries the PNG for Linux */
  let pkgHasPng = false;
  try {
    delete nodeRequire.cache[nodeRequire.resolve("../electron-builder.js")];
    const bld = nodeRequire(path.join(ROOT, "electron-builder.js"));
    /* The root list carries it, and no platform-level `files` exists to stand in for the root list on Linux. */
    const files = bld.files || [];
    pkgHasPng = files.includes("shell/etiuda-tray.png") && files.includes("shell/main.js")
      && !(bld.linux && bld.linux.files) && !(bld.win && bld.win.files);
  } catch {}
  check(pkgHasPng, "973b shell/etiuda-tray.png is in electron-builder.js's root file list beside shell/main.js, with no platform-level list");

  /* 973c. Tray built from PNG on linux and .ico on win32 */
  const origPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  let trayLinuxOk = false, trayWinOk = false;
  try {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const iconLinux = typeof mainTest.trayIcon === "function" ? mainTest.trayIcon() : null;
    trayLinuxOk = !!iconLinux && String(iconLinux.path || "").endsWith("etiuda-tray.png");

    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    const iconWin = typeof mainTest.trayIcon === "function" ? mainTest.trayIcon() : null;
    trayWinOk = !!iconWin && String(iconWin.path || "").endsWith("etiuda.ico");
  } finally {
    Object.defineProperty(process, "platform", origPlatform);
  }
  check(trayLinuxOk && trayWinOk, "973c on linux the tray is built from etiuda-tray.png and on win32 from etiuda.ico ("
    + JSON.stringify({ trayLinuxOk, trayWinOk }) + ")");

  /* 973d. With linux the Settings row is absent and the act refused, with win32 present and working */
  let settingsLinuxRowAbsent = false, actRefused = false;
  let settingsWinRowPresent = false, actAccepted = false;
  const docWas973 = globalThis.document;
  const csWas973 = globalThis.getComputedStyle;
  const rafWas973 = globalThis.requestAnimationFrame;
  const clsOn973 = s => ({ contains: c => s.has(c), add: c => s.add(c), remove: c => s.delete(c), toggle: (c, v) => (v ? s.add(c) : s.delete(c)) });
  if (!globalThis.getComputedStyle) globalThis.getComputedStyle = () => ({ borderLeftWidth: "0", paddingLeft: "0", borderRightWidth: "0", paddingRight: "0", marginLeft: "0" });
  if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = fn => { fn(); return 0; };
  globalThis.document = {
    visibilityState: "visible",
    addEventListener: listen("document"),
    removeEventListener: noop,
    body: { classList: clsOn973(new Set()) },
    documentElement: { style: { setProperty() {}, removeProperty() {} }, classList: clsOn973(new Set()), setAttribute() {}, getAttribute: () => null, addEventListener() {} },
  };
  try {
    const SET = await import(PLAIN("settings.js"));

    // Linux
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    window.E_HOST = Object.assign({}, REAL_HOST, { platform: "linux" });
    const linuxSecs = SET.settingsSections();
    const linuxGen = linuxSecs.find(s => s.id === "general");
    const linuxHasStartWin = !!linuxGen && linuxGen.groups.some(g => (g.rows || []).some(r => r && r.key === "startwin"));
    settingsLinuxRowAbsent = !linuxHasStartWin;

    loginApplied = null;
    REAL_HOST.setLoginItem(true);
    actRefused = loginApplied === null;

    // Win32
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    window.E_HOST = Object.assign({}, REAL_HOST, { platform: "win32" });
    const winSecs = SET.settingsSections();
    const winGen = winSecs.find(s => s.id === "general");
    const winHasStartWin = !!winGen && winGen.groups.some(g => (g.rows || []).some(r => r && r.key === "startwin"));
    settingsWinRowPresent = winHasStartWin;

    loginApplied = null;
    REAL_HOST.setLoginItem(true);
    actAccepted = !!loginApplied && loginApplied.openAtLogin === true;
  } finally {
    Object.defineProperty(process, "platform", origPlatform);
    REAL_HOST.setLoginItem(false);
    loginApplied = null;
    window.E_HOST = REAL_HOST;
    globalThis.document = docWas973;
    globalThis.getComputedStyle = csWas973;
    globalThis.requestAnimationFrame = rafWas973;
  }
  check(settingsLinuxRowAbsent && actRefused && settingsWinRowPresent && actAccepted,
    "973d with linux the Settings row is absent and the act refused, with win32 present and working ("
    + JSON.stringify({ settingsLinuxRowAbsent, actRefused, settingsWinRowPresent, actAccepted }) + ")");

  /* 973e. Plant the platform choice of the tray image, red with plants on */
  if (PLANTS_OFF) {
    skip("973e lifting plant:tray-platform turns the tray icon on linux back to etiuda.ico");
  } else {
    let plantRed = false;
    try {
      const origSrc = shellSrc("main.js");
      const marker = "/* plant:tray-platform */";
      if (origSrc.includes(marker)) {
        const lines = origSrc.split("\n");
        const idx = lines.findIndex(l => l.includes(marker));
        lines.splice(idx, 1);
        const mutatedSrc = lines.join("\n");
        const plantTest = {};
        const isolatedElectron = Object.assign({}, electron, {
          app: Object.assign({}, electron.app, { on: noop, whenReady: () => new Promise(noop) }),
          ipcMain: Object.assign({}, electron.ipcMain, { on: noop, handle: noop }),
          Tray: function (icon) { this.icon = icon; },
        });
        const isolatedReq = n => (n === "electron" ? isolatedElectron : nodeRequire(n));
        new Function("require", "__dirname", "__filename", "module", "exports", "console", "__test",
          mutatedSrc + "\nif (typeof ensureTray === 'function') __test.ensureTray = ensureTray; if (typeof trayIcon === 'function') __test.trayIcon = trayIcon;")(
          isolatedReq, path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet, plantTest);
        Object.defineProperty(process, "platform", { value: "linux", configurable: true });
        try {
          const tray = plantTest.ensureTray();
          plantRed = !!tray && !!tray.icon && String(tray.icon.path || "").endsWith("etiuda.ico");
        } finally {
          Object.defineProperty(process, "platform", origPlatform);
        }
      }
    } catch {}
    check(plantRed, "973e lifting plant:tray-platform turns the tray icon on linux back to etiuda.ico");
  }

  /* D8. THE JUMP LIST AND SECOND-INSTANCE ARGUMENTS */
  let d8JumpList = false, d8JumpListWhy = "";
  try {
    if (typeof mainTest.syncJumpList !== "function") {
      d8JumpListWhy = "no syncJumpList";
    } else {
      const catDir = typeof mainTest.catalogFolder === "function" ? mainTest.catalogFolder() : UD;
      const filesCreated = [];
      /* 1. Shared folder holds other files from colleagues/lead that this desk never opened */
      const colleagueFiles = [
        path.join(catDir, "colleague-lead.ec"),
        path.join(catDir, "colleague-team.ec"),
      ];
      for (const cf of colleagueFiles) {
        fs.writeFileSync(cf, JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "lead-c", rev: 1, cards: [] }));
        filesCreated.push(cf);
      }

      /* 2. This desk opens seven catalog files in sequence (1 to 7) */
      mainTest.createWindow();
      const w = madeWins[madeWins.length - 1];
      const openedFiles = [];
      for (let i = 1; i <= 7; i++) {
        const fp = path.join(UD, "desk-open-" + i + ".ec");
        fs.writeFileSync(fp, JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "open-" + i, rev: 1, cards: [] }));
        filesCreated.push(fp);
        openedFiles.push(fp);
        mainTest.offerFile(w, fp);
      }

      electron.app._jumpList = null;
      mainTest.syncJumpList();
      const jl = electron.app._jumpList;
      if (!Array.isArray(jl)) {
        d8JumpListWhy = "jumpList is not an array: " + typeof jl;
      } else {
        const tasksCat = jl.find(c => c.type === "tasks");
        const recentCat = jl.find(c => c.type === "custom");
        const taskItems = tasksCat ? tasksCat.items : [];
        const taskTitles = taskItems.map(t => t.title);
        const taskArgs = taskItems.map(t => t.args);
        const tasksMatch = taskItems.length === 4
          && taskArgs[0] === "--picker" && taskTitles[0] === "Bring the replies over any window"
          && taskArgs[1] === "--new-tab" && taskTitles[1] === "New tab"
          && taskArgs[2] === "--library" && taskTitles[2] === "Library"
          && taskArgs[3] === "--settings" && taskTitles[3] === "Settings";
        const recentItems = recentCat ? recentCat.items : [];

        /* Only the files this desk opened, newest first, at most five:
           desk-open-7.ec down to desk-open-3.ec, none of the colleague files */
        const recentMatch1 = recentCat && recentCat.name === "Recent catalogs"
          && recentItems.length === 5
          && recentItems[0].args.indexOf("desk-open-7.ec") >= 0
          && recentItems[1].args.indexOf("desk-open-6.ec") >= 0
          && recentItems[2].args.indexOf("desk-open-5.ec") >= 0
          && recentItems[3].args.indexOf("desk-open-4.ec") >= 0
          && recentItems[4].args.indexOf("desk-open-3.ec") >= 0
          && recentItems.every(item => colleagueFiles.every(cf => item.args.indexOf(path.basename(cf)) < 0));

        /* 3. A file this desk opened and that is now gone drops out:
           delete desk-open-7.ec, sync again -> desk-open-6.ec down to desk-open-2.ec */
        fs.unlinkSync(openedFiles[6]);
        mainTest.syncJumpList();
        const jl2 = electron.app._jumpList;
        const recentCat2 = jl2 ? jl2.find(c => c.type === "custom") : null;
        const recentItems2 = recentCat2 ? recentCat2.items : [];
        const recentMatch2 = recentCat2 && recentItems2.length === 5
          && recentItems2[0].args.indexOf("desk-open-6.ec") >= 0
          && recentItems2[1].args.indexOf("desk-open-5.ec") >= 0
          && recentItems2[2].args.indexOf("desk-open-4.ec") >= 0
          && recentItems2[3].args.indexOf("desk-open-3.ec") >= 0
          && recentItems2[4].args.indexOf("desk-open-2.ec") >= 0
          && recentItems2.every(item => item.args.indexOf("desk-open-7.ec") < 0);

        d8JumpList = tasksMatch && recentMatch1 && recentMatch2;
        if (!d8JumpList) {
          d8JumpListWhy = JSON.stringify({ tasksMatch, recentMatch1, recentMatch2, recentItems, recentItems2 });
        }
      }
      /* Clean up created test catalog files */
      for (const fp of filesCreated) {
        try { fs.unlinkSync(fp); } catch {}
      }
    }
  } catch (e) { d8JumpListWhy = String(e && e.message || e).split("\n")[0]; }
  check(d8JumpList, "D8-jump-list on a folder team whose shared folder holds other files, the jump list lists only the files this desk opened, newest first, at most five; a file this desk opened and that is now gone drops out (" + d8JumpListWhy + ")");

  let d8Args = false, d8ArgsWhy = "";
  try {
    mainTest.createWindow();
    const w = madeWins[madeWins.length - 1];
    let shows = 0;
    w.show = () => { shows++; };
    w.focus = () => {};
    w.isMinimized = () => false;

    /* 1. --settings */
    shows = 0;
    w.sent = [];
    w.sentEvents = [];
    mainTest.onSecondInstance(["--settings"]);
    const settingsOk = shows === 1 && (w.sentEvents || []).some(e => e.ch === "etiuda:tray-go" && e.args[0] === "settings");

    /* 2. --library */
    shows = 0;
    w.sent = [];
    w.sentEvents = [];
    mainTest.onSecondInstance(["--library"]);
    const libraryOk = shows === 1 && (w.sentEvents || []).some(e => e.ch === "etiuda:tray-go" && e.args[0] === "library");

    /* 3. --new-tab */
    shows = 0;
    w.sent = [];
    w.sentEvents = [];
    mainTest.onSecondInstance(["--new-tab"]);
    const newTabOk = shows === 1 && (w.sentEvents || []).some(e => e.ch === "etiuda:tray-go" && e.args[0] === "new-tab");

    /* 4. --picker: toggles picker, does not show main desk window */
    shows = 0;
    w.sent = [];
    w.sentEvents = [];
    mainTest.onSecondInstance(["--picker"]);
    const pickerOk = shows === 0 && w.sent.indexOf("etiuda:pick-ask") >= 0;

    d8Args = settingsOk && libraryOk && newTabOk && pickerOk;
    if (!d8Args) {
      d8ArgsWhy = JSON.stringify({ settingsOk, libraryOk, newTabOk, pickerOk, shows, sent: w.sent, events: w.sentEvents });
    }
  } catch (e) { d8ArgsWhy = String(e && e.message || e).split("\n")[0]; }
  check(d8Args, "D8-args --settings, --library, --new-tab, --picker do their act in a running desk (" + d8ArgsWhy + ")");

  /* Finding 3: Cold start with Jump List tasks dispatches them once main window loads */
  let d8ColdStart = false, d8ColdStartWhy = "";
  try {
    if (typeof mainTest.dispatchColdStartArgs !== "function") {
      d8ColdStartWhy = "no dispatchColdStartArgs function in main";
    } else {
      mainTest.createWindow();
      const w = madeWins[madeWins.length - 1];
      const origArgv = process.argv;
      try {
        /* 1. Cold start with --settings */
        process.argv = ["etiuda.exe", "--settings"];
        w.sentEvents = [];
        mainTest.dispatchColdStartArgs(w);
        const coldSettings = (w.sentEvents || []).some(e => e.ch === "etiuda:tray-go" && e.args[0] === "settings");

        /* 2. Cold start with --new-tab */
        process.argv = ["etiuda.exe", "--new-tab"];
        w.sentEvents = [];
        mainTest.dispatchColdStartArgs(w);
        const coldNewTab = (w.sentEvents || []).some(e => e.ch === "etiuda:tray-go" && e.args[0] === "new-tab");

        /* 3. Cold start with --library */
        process.argv = ["etiuda.exe", "--library"];
        w.sentEvents = [];
        mainTest.dispatchColdStartArgs(w);
        const coldLibrary = (w.sentEvents || []).some(e => e.ch === "etiuda:tray-go" && e.args[0] === "library");

        /* 4. Host handles kind === "new-tab" */
        const hostSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "host.js"), "utf8");
        const hostHandlesNewTab = hostSrc.includes('kind==="new-tab"') || hostSrc.includes('kind === "new-tab"');

        d8ColdStart = coldSettings && coldNewTab && coldLibrary && hostHandlesNewTab;
        if (!d8ColdStart) d8ColdStartWhy = JSON.stringify({ coldSettings, coldNewTab, coldLibrary, hostHandlesNewTab });
      } finally {
        process.argv = origArgv;
      }
    }
  } catch (e) { d8ColdStartWhy = String(e && e.message || e).split("\n")[0]; }
  check(d8ColdStart, "D8-cold-start cold start dispatches --settings, --library, --new-tab, --picker and host handles new-tab (" + d8ColdStartWhy + ")");

  /* Finding 11: Interface language change rebuilds tray menu and syncs jump list */
  let d8LangTraySync = false, d8LangTraySyncWhy = "";
  try {
    /* Seen through the harness's own Electron stubs, never through a seam in the shell: the live tray's rebuilt menu and
       the jump list the shell last handed app.setJumpList. */
    const liveTray = () => madeTrays.filter(t => !t.dead).slice(-1)[0] || null;
    const labels = () => { const t = liveTray(); return t && t.menu && t.menu.items ? t.menu.items.map(i => i && i.label).filter(Boolean).join("|") : ""; };
    const jump = () => JSON.stringify(electron.app._jumpList || null);
    const before = { menu: labels(), jump: jump() };
    ipcRenderer.sendSync("etiuda:desk-save", JSON.stringify({ eUiLang: "pl" }));
    const pl = { menu: labels(), jump: jump() };
    ipcRenderer.sendSync("etiuda:desk-patch-save", JSON.stringify({ eUiLang: "en" }));
    const en = { menu: labels(), jump: jump() };
    d8LangTraySync = !!liveTray() && pl.menu.indexOf("Otwórz Etiudę") >= 0 && en.menu.indexOf("Open Etiuda") >= 0
      && pl.jump !== en.jump && pl.jump !== "null";
    if (!d8LangTraySync) d8LangTraySyncWhy = JSON.stringify({ tray: !!liveTray(), before: before.menu.slice(0, 60), pl: pl.menu.slice(0, 60), en: en.menu.slice(0, 60), jumpChanged: pl.jump !== en.jump });
  } catch (e) { d8LangTraySyncWhy = String(e && e.message || e).split("\n")[0]; }
  check(d8LangTraySync, "D8-lang-tray-sync changing eUiLang rebuilds tray menu and syncs jump list (" + d8LangTraySyncWhy + ")");

  let d8FileOffered = false, d8FileOfferedWhy = "";
  try {
    mainTest.createWindow();
    const w = madeWins[madeWins.length - 1];
    let shows = 0;
    w.show = () => { shows++; };
    w.focus = () => {};
    w.isMinimized = () => false;

    const testCatPath = path.join(UD, "offer-test.ec");
    fs.writeFileSync(testCatPath, JSON.stringify({ format: 2, id: "test-offered-id", rev: 1, cards: [] }));
    shows = 0;
    w.sent = [];
    w.sentEvents = [];
    mainTest.onSecondInstance([testCatPath]);
    const offeredOk = w.sent.indexOf("etiuda:catalog-file") >= 0 && shows === 1;
    /* Verify it is only offered and not automatically taken/loaded */
    const notTaken = w.sent.indexOf("etiuda:catalog-taken") < 0;
    d8FileOffered = offeredOk && notTaken;
    if (!d8FileOffered) {
      d8FileOfferedWhy = JSON.stringify({ offeredOk, notTaken, shows, sent: w.sent });
    }
    try { fs.unlinkSync(testCatPath); } catch {}
  } catch (e) { d8FileOfferedWhy = String(e && e.message || e).split("\n")[0]; }
  check(d8FileOffered, "D8-file-offered a file argument is offered, never loaded (" + d8FileOfferedWhy + ")");

  if (typeof mainTest.setQuitOnClose === "function") mainTest.setQuitOnClose(true);
  mainTest.setQuitting(false);

  /* D7. Notifications: a lead-signed edition offered while the window is hidden toasts once;
     the same while focused does not; a refused or unsigned file never toasts;
     a new team catalog in the listing toasts once; each switch silences its kind;
     a click shows the window on the offer or the Library tab. */
  let d7Offer = false, d7OfferWhy = "";
  let d7Focused = false, d7FocusedWhy = "";
  let d7Unsigned = false, d7UnsignedWhy = "";
  let d7Listing = false, d7ListingWhy = "";
  let d7Nameless = false, d7NamelessWhy = "";
  let d7Switches = false, d7SwitchesWhy = "";
  let d7Click = false, d7ClickWhy = "";
  let d7Asked = false, d7AskedWhy = "";
  let d7NoEdition = false, d7NoEditionWhy = "";
  let d7NonLead = false, d7NonLeadWhy = "";

  const CO = await import(PLAIN("catalog-offer.js"));
  const TJ = await import(PLAIN("team-join.js"));
  const d7LeadPair = crypto.generateKeyPairSync("ed25519");
  const d7PubHex = d7LeadPair.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const d7KeyId = "lead-key-1";
  const d7Fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "shell", "sample-catalog.ec"), "utf8"));

  const d7Sign = (doc, key, keyId) => {
    const out = JSON.parse(JSON.stringify(doc));
    delete out.hash;
    out.sig = { alg: V2.V2_SIG_ALG, keyId: keyId || d7KeyId };
    out.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(out)), key).toString("hex");
    const parsed = CT.parseCatalogFile(JSON.stringify(out));
    if (doc.rev != null) parsed.rev = doc.rev;
    if (doc.edition != null) parsed.edition = doc.edition;
    if (doc.version != null) parsed.version = doc.version;
    return parsed;
  };

  const docWasD7 = globalThis.document;
  const iwWas = globalThis.innerWidth, ihWas = globalThis.innerHeight;
  globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
  try {
    ST.lsSet("eUiLang", "en");
    d7Fixture.rev = 1;
    CT.storeCatalog(d7Fixture);
    ST.nsSet("CatalogTrust", "valid");
    ST.nsSet("CatalogSigner", d7KeyId);
    ST.nsSet("CatalogSignerPub", d7PubHex);
    REAL_HOST.setTrayNotes(true);
    mainTest.createWindow();
    const w = madeWins[madeWins.length - 1];
    w.hides = 0; w.shows = 0;
    w.hide = () => { w.hides++; };
    w.show = () => { w.shows++; };
    w.focus = () => {};
    w.isMinimized = () => false;
    w.isVisible = () => false;
    w.isFocused = () => false;

    REAL_HOST.catalogLeads = () => Promise.resolve([{ keyId: d7KeyId, public: d7PubHex }]);
    REAL_HOST.teamJoin = (op) => ({ leads: [{ team: "team-alpha", lead: "Anna", print: "1234" }] });
    let d7JoinCb = null;
    REAL_HOST.onTeamJoin = (fn) => { d7JoinCb = fn; };
    TJ.wireTeamJoin();
    if (d7JoinCb) d7JoinCb({ leads: [{ team: "team-alpha", lead: "Anna", print: "1234" }] });

    globalThis.document = new Proxy({}, {
      set: () => true,
      get: (t, k) => (
        k === "readyState" ? "complete"
        : k === "visibilityState" ? "visible"
        : (k === "addEventListener" || k === "removeEventListener") ? noop
        : k === "getElementById" ? () => null
        : k === "body" ? { appendChild: noop, removeChild: noop, classList: { contains: () => false, add: noop, remove: noop, toggle: noop } }
        : fake()
      )
    });

    const notesStart = madeNotes.length;
    const signedCat = d7Sign(Object.assign({}, d7Fixture, { rev: 2, edition: "2" }), d7LeadPair.privateKey);

    // 1. Lead-signed edition offered while window is hidden toasts once
    CO.eOfferCatalogDialog(signedCat, { file: "catalog-alpha.ec", asked: false });
    /* The toast follows an asynchronous check of the lead, so it is waited for (up to 3 s) rather than given a fixed
       100 ms: under load it came later, note1 was then the previous leg's tray notice, and D7-offer and D7-click both
       read the wrong note (fold 26 and fold 30 landings). The 100 ms after it still catches a second toast. */
    for (let waited = 0; madeNotes.length === notesStart && waited < 3000; waited += 25) await tick(25);
    await tick(100);

    const note1 = madeNotes[madeNotes.length - 1];
    const n1Ok = madeNotes.length === notesStart + 1;
    const title1 = note1 && note1.opts && note1.opts.title;
    const body1 = note1 && note1.opts && note1.opts.body;
    const target1 = note1 && note1.opts && note1.opts.target;

    // Second call for same edition must toast once
    CO.eOfferCatalogDialog(signedCat, { file: "catalog-alpha.ec", asked: false });
    await tick(100);
    const n1Once = madeNotes.length === notesStart + 1;

    d7Offer = n1Ok && n1Once && title1 === "Anna published a new edition"
      && body1.indexOf("edition 2") >= 0 && body1.indexOf("Nothing is loaded until it is looked at.") >= 0;
    if (!d7Offer) d7OfferWhy = JSON.stringify({ n1Ok, n1Once, notes: madeNotes.length - notesStart, title: title1, body: body1 });

    // 2. Focused window does not toast
    const notesBeforeFocused = madeNotes.length;
    w.isFocused = () => true;
    w.isVisible = () => true;
    const signedCat2 = d7Sign(Object.assign({}, d7Fixture, { rev: 3, edition: "3" }), d7LeadPair.privateKey);
    CO.eOfferCatalogDialog(signedCat2, { file: "catalog-beta.ec", asked: false });
    await tick(100);
    d7Focused = madeNotes.length === notesBeforeFocused;
    if (!d7Focused) d7FocusedWhy = JSON.stringify({ notesAdded: madeNotes.length - notesBeforeFocused });

    // 3. Refused or unsigned file never toasts
    w.isFocused = () => false;
    w.isVisible = () => false;
    const notesBeforeUnsigned = madeNotes.length;
    const unsignedCat = JSON.parse(JSON.stringify(d7Fixture));
    delete unsignedCat.sig;
    CO.eOfferCatalogDialog(CT.parseCatalogFile(JSON.stringify(unsignedCat)), { file: "unsigned.ec", asked: false });
    await tick(100);
    d7Unsigned = madeNotes.length === notesBeforeUnsigned;
    if (!d7Unsigned) d7UnsignedWhy = JSON.stringify({ notesAdded: madeNotes.length - notesBeforeUnsigned });

    // 4. New team catalog in listing toasts once
    const notesBeforeListing = madeNotes.length;
    const newListing = [{ name: "catalog-gamma.ec", id: "k-team-gamma", sha: "sha-gamma-1", rev: 1, mtime: Date.now() }];
    if (typeof CO.onCatalogListing === "function") {
      CO.onCatalogListing(newListing);
    }
    await tick(100);

    const noteList = madeNotes[madeNotes.length - 1];
    const nListOk = madeNotes.length === notesBeforeListing + 1;
    const titleList = noteList && noteList.opts && noteList.opts.title;
    const bodyList = noteList && noteList.opts && noteList.opts.body;

    if (typeof CO.onCatalogListing === "function") {
      CO.onCatalogListing(newListing);
    }
    await tick(100);
    const nListOnce = madeNotes.length === notesBeforeListing + 1;

    d7Listing = nListOk && nListOnce && titleList === "A new catalog from Anna"
      && bodyList.indexOf("is in the Library, ready to open.") >= 0;
    if (!d7Listing) d7ListingWhy = JSON.stringify({ nListOk, nListOnce, notes: madeNotes.length - notesBeforeListing, title: titleList, body: bodyList });

    // 4b. A lead the team file gives no name: the copywriter's nameless titles in both languages, never a stand-in name
    if (d7JoinCb) d7JoinCb({ leads: [{ team: "team-alpha", lead: "", print: "1234" }] });
    const nlTitles = [];
    for (const [lang, n] of [["en", 4], ["pl", 5]]) {
      ST.lsSet("eUiLang", lang);
      const before = madeNotes.length;
      CO.eOfferCatalogDialog(d7Sign(Object.assign({}, d7Fixture, { rev: n, edition: String(n) }), d7LeadPair.privateKey), { file: "catalog-nl-" + lang + ".ec", asked: false });
      await tick(100);
      const a = madeNotes.length === before + 1 ? madeNotes[madeNotes.length - 1].opts.title : null;
      if (typeof CO.onCatalogListing === "function") CO.onCatalogListing([{ name: "catalog-nl-" + lang + ".ec", id: "k-team-nl-" + lang, sha: "sha-nl-" + lang, rev: 1, mtime: Date.now() }]);
      await tick(100);
      const b = madeNotes.length === before + 2 ? madeNotes[madeNotes.length - 1].opts.title : null;
      nlTitles.push(a, b);
    }
    ST.lsSet("eUiLang", "en");
    if (d7JoinCb) d7JoinCb({ leads: [{ team: "team-alpha", lead: "Anna", print: "1234" }] });
    d7Nameless = nlTitles.join("|") === ["The team's lead published a new edition", "A new catalog from the team's lead",
      "Nowe wydanie od lidera zespołu", "Nowy katalog od lidera zespołu"].join("|");
    if (!d7Nameless) d7NamelessWhy = JSON.stringify(nlTitles);

    // 5. Each switch silences its kind
    const notesBeforeSwitches = madeNotes.length;
    ST.lsSet("eNotifyEditionOff", "1");
    const signedCat4 = d7Sign(Object.assign({}, d7Fixture, { rev: 4, edition: "4" }), d7LeadPair.privateKey);
    CO.eOfferCatalogDialog(signedCat4, { file: "catalog-delta.ec", asked: false });
    await tick(100);
    const silEdition = madeNotes.length === notesBeforeSwitches;
    ST.lsDel("eNotifyEditionOff");

    ST.lsSet("eNotifyCatalogOff", "1");
    const listing2 = [{ name: "catalog-epsilon.ec", id: "k-team-eps", sha: "sha-eps-1", rev: 1, mtime: Date.now() }];
    if (typeof CO.onCatalogListing === "function") {
      CO.onCatalogListing(listing2);
    }
    await tick(100);
    const silCatalog = madeNotes.length === notesBeforeSwitches;
    ST.lsDel("eNotifyCatalogOff");

    REAL_HOST.setTrayNotes(false);
    const signedCat5 = d7Sign(Object.assign({}, d7Fixture, { rev: 5, edition: "5" }), d7LeadPair.privateKey);
    CO.eOfferCatalogDialog(signedCat5, { file: "catalog-zeta.ec", asked: false });
    await tick(100);
    const silMaster = madeNotes.length === notesBeforeSwitches;
    REAL_HOST.setTrayNotes(true);

    d7Switches = silEdition && silCatalog && silMaster;
    if (!d7Switches) d7SwitchesWhy = JSON.stringify({ silEdition, silCatalog, silMaster, notesAdded: madeNotes.length - notesBeforeSwitches });

    // 6. Click shows window on offer or Library tab
    w.shows = 0;
    const sentBeforeClick = w.sent.length;
    if (note1 && note1.handlers && note1.handlers.click) {
      note1.handlers.click.forEach(fn => fn());
    }
    const offerClicked = w.shows === 1 && w.sent.indexOf("etiuda:tray-go") >= 0;

    w.shows = 0;
    if (noteList && noteList.handlers && noteList.handlers.click) {
      noteList.handlers.click.forEach(fn => fn());
    }
    const libraryClicked = w.shows === 1 && w.sent.indexOf("etiuda:tray-go") >= 0;

    d7Click = offerClicked && libraryClicked;
    if (!d7Click) d7ClickWhy = JSON.stringify({ offerClicked, libraryClicked, shows: w.shows, sent: w.sent.slice(sentBeforeClick) });

    // 7. Asked or reopened offer shows no toast
    const notesBeforeAsked = madeNotes.length;
    const signedCatAsked = d7Sign(Object.assign({}, d7Fixture, { rev: 10, edition: "10" }), d7LeadPair.privateKey);
    CO.eOfferCatalogDialog(signedCatAsked, { file: "catalog-asked.ec", asked: true });
    await tick(100);
    const silAsked = madeNotes.length === notesBeforeAsked;

    const notesBeforeReopened = madeNotes.length;
    const signedCatReopened = d7Sign(Object.assign({}, d7Fixture, { rev: 11, edition: "11" }), d7LeadPair.privateKey);
    CO.eOfferCatalogDialog(signedCatReopened, { file: "catalog-reopened.ec", asked: false, reopened: true });
    await tick(100);
    const silReopened = madeNotes.length === notesBeforeReopened;

    d7Asked = silAsked && silReopened;
    if (!d7Asked) d7AskedWhy = JSON.stringify({ silAsked, silReopened, notesAdded: madeNotes.length - notesBeforeAsked });

    // 8. Catalog with no edition name shows no number
    const notesBeforeNoEd = madeNotes.length;
    const signedCatNoEd = d7Sign(Object.assign({}, d7Fixture, { rev: 7, edition: "", version: "7" }), d7LeadPair.privateKey);
    delete signedCatNoEd.edition;
    CO.eOfferCatalogDialog(signedCatNoEd, { file: "catalog-noed.ec", asked: false });
    await tick(100);
    const noteNoEd = madeNotes[madeNotes.length - 1];
    const bodyNoEd = (noteNoEd && noteNoEd.opts && noteNoEd.opts.body) || "";
    const noEdToasted = madeNotes.length === notesBeforeNoEd + 1;
    const noEdNoNum = !/[0-9]/.test(bodyNoEd) && bodyNoEd.indexOf("edition") < 0;
    d7NoEdition = noEdToasted && noEdNoNum && bodyNoEd.indexOf("Nothing is loaded until it is looked at.") >= 0;
    if (!d7NoEdition) d7NoEditionWhy = JSON.stringify({ noEdToasted, noEdNoNum, body: bodyNoEd });

    // 9. Valid signature from a non-lead key shows no "published" toast
    const nonLeadPair = crypto.generateKeyPairSync("ed25519");
    const nonLeadPubHex = nonLeadPair.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
    const ringWithNonLead = JSON.stringify({ [d7Fixture.id || ""]: { "non-lead-key": nonLeadPubHex } });
    REAL_HOST.catalogRing = () => Promise.resolve(ringWithNonLead);
    const notesBeforeNonLead = madeNotes.length;
    const signedNonLead = d7Sign(Object.assign({}, d7Fixture, { rev: 12, edition: "12" }), nonLeadPair.privateKey, "non-lead-key");
    CO.eOfferCatalogDialog(signedNonLead, { file: "catalog-nonlead.ec", asked: false });
    await tick(100);
    d7NonLead = madeNotes.length === notesBeforeNonLead;
    if (!d7NonLead) d7NonLeadWhy = JSON.stringify({ notesAdded: madeNotes.length - notesBeforeNonLead });
    REAL_HOST.catalogRing = () => Promise.resolve("");
  } catch (err) {
    const msg = String(err && err.message || err).split("\n")[0];
    if (!d7OfferWhy) d7OfferWhy = msg;
    if (!d7FocusedWhy) d7FocusedWhy = msg;
    if (!d7UnsignedWhy) d7UnsignedWhy = msg;
    if (!d7ListingWhy) d7ListingWhy = msg;
    if (!d7SwitchesWhy) d7SwitchesWhy = msg;
    if (!d7ClickWhy) d7ClickWhy = msg;
    if (!d7AskedWhy) d7AskedWhy = msg;
    if (!d7NoEditionWhy) d7NoEditionWhy = msg;
    if (!d7NonLeadWhy) d7NonLeadWhy = msg;
  } finally {
    ST.lsDel("eUiLang");
    ST.nsDel("Catalog");
    globalThis.document = docWasD7;
    globalThis.innerWidth = iwWas;
    globalThis.innerHeight = ihWas;
  }

  check(d7Offer, "D7-offer a lead-signed edition offered while the window is hidden toasts once (" + d7OfferWhy + ")");
  check(d7Focused, "D7-focused the same while focused does not (" + d7FocusedWhy + ")");
  check(d7Unsigned, "D7-unsigned a refused or unsigned file never toasts (" + d7UnsignedWhy + ")");
  check(d7Listing, "D7-listing a new team catalog in the listing toasts once (" + d7ListingWhy + ")");
  check(d7Nameless, "D7-nameless a lead with no name gets the nameless titles in both languages, never a stand-in name (" + d7NamelessWhy + ")");
  check(d7Switches, "D7-switches each switch silences its kind (" + d7SwitchesWhy + ")");
  check(d7Click, "D7-click a click shows the window on the offer or the Library tab (" + d7ClickWhy + ")");
  check(d7Asked, "D7-asked an asked or reopened offer shows no toast (" + d7AskedWhy + ")");
  check(d7NoEdition, "D7-no-edition a catalog with no edition name shows no number (" + d7NoEditionWhy + ")");
  check(d7NonLead, "D7-non-lead a valid signature from a non-lead key shows no \"published\" toast (" + d7NonLeadWhy + ")");

  const wb = winFor(), wc = winFor(), wd = winFor(), we = winFor();
  const b = [H(wb), H(wb)].join("/");
  H(wc); mainTest.closeAnswered(wc, "none");
  const noneAtOnce = wc.closes;
  H(wd);
  await tick(1600);
  we.webContents.etiudaLost = { reason: "crashed" };
  const lost = H(we);
  /* THE QUIT STAYS LAST among the close legs: it leaves this shell quitting, so a close leg after it would see every
     window let go and prove nothing. */
  (appOn["before-quit"] || noop)();
  const quit = H(winFor());
  check(b === "held!/free" && noneAtOnce === 1 && wd.closes === 1 && lost === "free" && quit === "free",
    "1012d2 never held: a second close while the page asks, a page with nothing in progress, a page silent past the wait, a page that is gone, and a quit ("
    + [b, noneAtOnce, wd.closes, lost, quit].join(" ") + ")");
  const heardOn = {}, wasOn = ipcRenderer.on, wasSend = ipcRenderer.send, answered = [];
  ipcRenderer.on = (ch, fn) => { heardOn[ch] = fn; };
  ipcRenderer.send = (ch, ...args) => { answered.push(ch + ":" + args.join()); };
  let askedHere = 0;
  try {
    REAL_HOST.onAskClose(() => { askedHere++; });
    if (heardOn["etiuda:ask-close"]) heardOn["etiuda:ask-close"]({}, "ignored");
    REAL_HOST.closeAnswer("stay");
  } finally { ipcRenderer.on = wasOn; ipcRenderer.send = wasSend; }
  check(askedHere === 1 && answered.join() === "etiuda:close-answer:stay" && typeof onHandlers["etiuda:close-answer"] === "function",
    "1012d3 the preload hands the page the shell's question and sends its answer on the channel main listens to ("
    + askedHere + ", " + JSON.stringify(answered) + ")");

  /* 952g. THE CHOSEN THEME SURVIVES A RESTART. A page is copies of theme.js and its four neighbours in a folder of its own,
     so each load is a fresh storage.js reading the desk through the preload and main's handler, as a restart does. The
     first load boots on the system's dark, takes a press, lets the send land and is closed with nothing pending; the
     second boots on the file, takes a press and is quit straight after it; the third boots on the file again. */
  const themeLab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-ipc-theme-"));
  let themeLoads = 0;
  const docWas952 = globalThis.document, mmWas = globalThis.matchMedia;
  const themePage = async lift => {
    const dir = path.join(themeLab, "p" + (++themeLoads));
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "package.json"), '{"type":"module"}');
    for (const f of ["theme.js", "storage.js", "motion.js", "dom.js", "hooks.js"]) {
      let text = fs.readFileSync(path.join(ROOT, "src", "modules", f), "utf8");
      if (lift && f === "theme.js") {
        const ls = text.split("\n"), at = ls.findIndex(l => l.indexOf(lift) >= 0);
        if (at < 0) throw new Error(lift + " is not in theme.js");
        ls.splice(at, 1); text = ls.join("\n");
      }
      fs.writeFileSync(path.join(dir, f), text);
    }
    const root = { dataset: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, style: {} };
    const btn = { onclick: null }, icon = { dataset: {}, style: {} };
    globalThis.document = { visibilityState: "visible", addEventListener: listen("document"), removeEventListener: noop, documentElement: root,
      querySelector: sel => sel === "#theme" ? btn : sel === "#theme svg" ? icon : null };
    const T = await import(pathToFileURL(path.join(dir, "theme.js")).href);
    T.applyTheme(); T.wireThemeBtn();
    return { shown: () => root.dataset.theme, press: () => btn.onclick() };
  };
  const restartRun = async lift => {
    fs.writeFileSync(DESK, JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: {} }));
    globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    try {
      const a = await themePage(lift), booted = a.shown();
      a.press(); const asked = a.shown();
      await tick(5); await tick(5);
      const material = electron.nativeTheme.themeSource, landed = onDisk().eTheme || null;
      fire("window", "pagehide");
      const b = await themePage(lift), after = b.shown();
      b.press(); const asked2 = b.shown();
      fire("window", "pagehide");
      const c = await themePage(lift), after2 = c.shown();
      return { booted, asked, landed, material, after, asked2, after2 };
    } finally {
      globalThis.document = docWas952;
      globalThis.matchMedia = mmWas;
    }
  };
  let R952 = null;
  try { R952 = await restartRun(null); } catch (x) { R952 = { error: String(x && x.message || x) }; }
  check(!!R952 && R952.booted === "dark" && R952.asked === "light" && R952.landed === "light" && R952.material === "light"
    && R952.after === "light" && R952.asked2 === "dark" && R952.after2 === "dark",
    "952g a theme chosen on the button survives a restart: sent without waiting it is on the disk and the material follows,"
    + " the next start boots on it, and a choice quit straight after the press is flushed and the start after boots on that ("
    + JSON.stringify(R952) + ")");
  if (PLANTS_OFF) skip("952g lifting plant:theme-choice-saved loses the choice at the restart");
  else {
    let L952 = null;
    try { L952 = await restartRun("plant:theme-choice-saved"); } catch (x) { L952 = { error: String(x && x.message || x) }; }
    check(!!L952 && !L952.error && L952.asked === "light" && L952.after === "dark",
      "952g lifting plant:theme-choice-saved loses the choice at the restart (" + JSON.stringify(L952) + ")");
  }
  try { fs.rmSync(themeLab, { recursive: true, force: true }); } catch { /* a temp folder */ }
} catch (e) {
  failed++;
  console.log("  FAIL " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
} finally {
  try { fs.rmSync(UD, { recursive: true, force: true }); } catch { /* reported below */ }
  try { if (COPY) fs.rmSync(COPY, { recursive: true, force: true }); } catch { /* a temp folder */ }
  check(!fs.existsSync(UD), "4a the temp desk folder is gone");
}

console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
/* 1153: EVERY SYNC SEND IS ANSWERED. ipcRenderer.sendSync waits for e.returnValue for ever, so a handler without one stops the
   page's thread for good (Max, 2026-11-04 11:44: Eject froze the desk until the process was killed). Read from the two
   files, so a channel added tomorrow is held too; tests/eject-desk.js is the window that shows it. */
{
  const unanswered = (pre, main) => Array.from(new Set(Array.from(pre.matchAll(/sendSync\(\s*"([^"]+)"/g), m => m[1])))
    .filter(ch => {
      const at = main.indexOf('ipcMain.on("' + ch + '"');
      if (at < 0) return true;
      const end = main.indexOf("\n});", at);
      return main.slice(at, end < 0 ? undefined : end).indexOf("e.returnValue") < 0;
    });
  check(unanswered('sendSync("a"); sendSync("b");', 'ipcMain.on("a", (e) => {\n  e.returnValue = 1;\n});\nipcMain.on("b", (e) => {\n  go();\n});\n')
    .join() === "b", "1153a the reading finds a handler that never answers, in planted text");
  const left = unanswered(shellSrc("preload.js"), shellSrc("main.js"));
  const channels = (shellSrc("preload.js").match(/sendSync\(\s*"/g) || []).length;
  check(channels >= 11 && left.length === 0,
    "1153b every sync channel of the preload has a handler that answers: " + channels + " send(s), unanswered " + JSON.stringify(left));
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
