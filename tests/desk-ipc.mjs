/* The desk's write path, all three hops, in bare node: src/modules/storage.js over the real
 * shell/preload.js over the real handlers of shell/main.js, electron stubbed, desk.json in a temp
 * folder. What it holds: a write never waits on the disk, a burst is one send, and a document
 * leaving or hiding right after a write has put it on the disk before the event returns.
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
const EXPECTED = 19;

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
         whenReady: () => new Promise(noop) },
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
const sent = { sync: {}, invoke: {} };
const bump = (o, ch) => { o[ch] = (o[ch] || 0) + 1; };
const eventFor = frame => ({ sender: { id: 1, once: noop }, senderFrame: frame, returnValue: undefined });
const ipcRenderer = {
  sendSync: (ch, ...args) => {
    bump(sent.sync, ch);
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

try {
  const S = await import(MOD("storage.js", "ipc"));
  const syncSaves = () => sent.sync["etiuda:desk-save"] || 0;
  const asyncSaves = () => sent.invoke["etiuda:desk-write"] || 0;

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
