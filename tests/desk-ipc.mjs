/* The desk's write path, all three hops, in bare node: src/modules/storage.js over the real
 * shell/preload.js over the real handlers of shell/main.js, electron stubbed, desk.json in a temp
 * folder. What it holds: a write never waits on the disk, a burst is one send, and a document
 * leaving or hiding right after a write has put it on the disk before the event returns, and none
 * puts back a desk the rescue's Reset has cleared. The Reset also empties the tabs' session, in the
 * page and in main, and the preload sends a link's address to main for a primary or middle click only.
 * The last section is the desk's own file in the catalog folder: its key pair behind a stand-in for
 * safeStorage, a signed catalog under desks/<branch id>/ after an edit, and nothing else touched.
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
const EXPECTED = 65;

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
/* safeStorage as far as main.js asks of it: a reversible sealing that shows nothing of what it holds. */
let sealOk = true, decryptFails = null;
const safeStorage = {
  isEncryptionAvailable: () => sealOk,
  encryptString: s => { if (!sealOk) throw new Error("encryption is not available"); return Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)); },
  decryptString: b => { if (!sealOk || (decryptFails && Buffer.from(b).toString("base64") === decryptFails)) throw new Error("cannot decrypt for this account"); return Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"); },
};
electron.safeStorage = safeStorage;
const fakeRequire = n => (n === "electron" ? electron : nodeRequire(n));
const shellSrc = f => fs.readFileSync(path.join(ROOT, "shell", f), "utf8");
/* main.js is evaluated as a function body, so one line appended to it hands the test the retry that Electron's events call. */
const mainTest = {};
new Function("require", "__dirname", "__filename", "module", "exports", "console", "__test",
  shellSrc("main.js") + "\n__test.tryHeldBranches = tryHeldBranches; __test.catalogChanged = catalogChanged;")(
  fakeRequire, path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet, mainTest);

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

  /* ---- the desk's own file in the catalog folder. The page modules run for real over the real
     preload and the real handlers; safeStorage is the sealing stand-in above; the catalog and the
     layer are invented here. Every file is read back from the disk the way another desk or Studio
     would find it, and the signature is checked with node's own Ed25519 over the engine's own
     signed bytes, so the shell's canonical form is held to the engine's. --------------------- */
  const FOLDER = path.join(UD, "Etiuda");
  fs.mkdirSync(FOLDER, { recursive: true });
  const fake = () => new Proxy(function () {}, {
    get: (t, k) => k === Symbol.toPrimitive ? () => "" : (k === "length" ? 0
      : (["contains", "matches", "hasAttribute"].includes(k) ? () => false : fake())),
    apply: () => fake(), set: () => true, has: () => true });
  Object.assign(window, { innerWidth: 1280, innerHeight: 800 });
  globalThis.innerHeight = 800;
  globalThis.getComputedStyle = () => fake();
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
  sealOk = false;
  edit("Edited A");
  await tick(30);
  const keysBefore = Object.keys(envelope().keys).sort().join();
  const noSeal = await writeBranch();
  check(noSeal === false && !fs.existsSync(deskDir) && !("branch" in envelope()),
    "77c where Windows cannot seal a key, an edit makes no key and writes no file, and no plain key is kept instead (answer " + noSeal
    + ", desks folder " + fs.existsSync(deskDir) + ", branch in the envelope " + ("branch" in envelope()) + ")");
  sealOk = true;

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
  const loadLine = mainText.split("\n").filter(l => l.indexOf("on(\"did-finish-load\"") >= 0 && l.indexOf("tryAnswerRequest") >= 0)[0] || "";
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
} catch (e) {
  failed++;
  console.log("  FAIL " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
} finally {
  try { fs.rmSync(UD, { recursive: true, force: true }); } catch { /* reported below */ }
  try { if (COPY) fs.rmSync(COPY, { recursive: true, force: true }); } catch { /* a temp folder */ }
  check(!fs.existsSync(UD), "4a the temp desk folder is gone");
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
