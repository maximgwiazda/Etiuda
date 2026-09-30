/* The desk's write path, all three hops, in bare node: src/modules/storage.js over the real
 * shell/preload.js over the real handlers of shell/main.js, electron stubbed, desk.json in a temp
 * folder. What it holds: a write never waits on the disk, a burst is one send, and a document
 * leaving or hiding right after a write has put it on the disk before the event returns, and none
 * puts back a desk the rescue's Reset has cleared. The Reset also empties the tabs' session, in the
 * page and in main, and the preload sends a link's address to main for a primary or middle click only.
 *
 *   node tests/desk-ipc.mjs            exit code is the number of failed checks, capped at 63
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD = (n, q) => pathToFileURL(path.join(ROOT, "src", "modules", n)).href + "?" + q;
const nodeRequire = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 29;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
const tick = ms => new Promise(r => setTimeout(r, ms || 0));

/* ---- electron, as small as main.js needs at load and at a desk write ---------------------- */
const UD = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-ipc-"));
const DESK = path.join(UD, "desk.json");
const onDisk = () => { try { return JSON.parse(fs.readFileSync(DESK, "utf8")).keys || {}; } catch { return {}; } };
const said = [];
const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: () => {} };
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const onHandlers = {}, invokeHandlers = {};
const electron = {
  app: { getPath: () => UD, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
         whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
  ipcMain: { on: (ch, fn) => { onHandlers[ch] = fn; }, handle: (ch, fn) => { invokeHandlers[ch] = fn; } },
  BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert,
  screen: inert, shell: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
};
const fakeRequire = n => (n === "electron" ? electron : nodeRequire(n));
const shellSrc = f => fs.readFileSync(path.join(ROOT, "shell", f), "utf8");
new Function("require", "__dirname", "__filename", "module", "exports", "console", shellSrc("main.js"))(
  fakeRequire, path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet);

/* ---- the renderer's side of the pipe. The desk's channels go to main's own handlers; the
   catalog and the host are answered here, because this file is about the desk. ------------- */
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const sent = { sync: {}, invoke: {}, args: {} };
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
  send: (ch, ...args) => { if (onHandlers[ch]) onHandlers[ch](eventFor(ENGINE_FRAME), ...args); },
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
  fs.chmodSync(DESK, 0o444);
  S.lsSet("eIpcRefused", "1");
  await tick(5); await tick(5);
  const troubleAfterRefusal = S.eSaveTrouble();
  fs.chmodSync(DESK, 0o666);
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
  invokeHandlers["etiuda:desk-write"](eventFor(ENGINE_FRAME), JSON.stringify(Object.assign({}, onDisk(), { "e~carried": "1" })));
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
  const tabPlanted = window.E_HOST.session("set", TAB, "the customer's name") === true && window.E_HOST.session("get", TAB) === "the customer's name";
  const clearState = new Function("window", "localStorage", "sessionStorage",
    slice("hostDesk") + "\n" + slice("clearState") + "\nreturn clearState;")(window, lsStub, ssStub);
  check(tabPlanted && ssCleared === 0,
    "5a2 THE CONTROL: the tabs' session in main holds a plant before the Reset, and the page's own sessionStorage has not been cleared yet");
  clearState(true);
  const tabsAfter = window.E_HOST.session("get", TAB);
  fire("window", "beforeunload");
  fire("window", "pagehide");
  await tick(5); await tick(5);
  const left = onDisk(), stayed = Object.keys(left).filter(k => /^e(?:[A-Z]|[0-9a-z]+~)/.test(k));
  check(!stayed.length && left["e~carried"] === "1",
    "5b the Reset's cleared desk is what remains after the page leaves: " + stayed.length + " app key(s) back on the disk"
    + (stayed.length ? " (" + stayed.slice(0, 4).join(", ") + ")" : "") + ", the carried mark " + left["e~carried"]);
  check(ssCleared === 1,
    "5c the Reset clears the page's own sessionStorage, once: " + ssCleared + " call(s)");
  check(tabsAfter === null,
    "5d and it clears the tabs main holds, so a customer's name does not outlive the Reset: the plant reads back " + JSON.stringify(tabsAfter));
  /* The #reset hatch clears with no desk: it runs before the app does, and a customer's name must not outlive it either. */
  const planted2 = window.E_HOST.session("set", TAB, "the customer's name") === true && window.E_HOST.session("get", TAB) === "the customer's name";
  clearState(false);
  const hatchTabs = window.E_HOST.session("get", TAB);
  check(planted2 && hatchTabs === null && ssCleared === 2,
    "5e the #reset hatch's clearState(false) clears the tabs too, in main and in the page: planted " + planted2 + ", the plant reads back "
    + JSON.stringify(hatchTabs) + ", sessionStorage cleared " + ssCleared + " time(s) in all");

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
} catch (e) {
  failed++;
  console.log("  FAIL " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
} finally {
  try { fs.rmSync(UD, { recursive: true, force: true }); } catch { /* reported below */ }
  check(!fs.existsSync(UD), "4a the temp desk folder is gone");
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
