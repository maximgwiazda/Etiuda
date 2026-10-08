/* The shell under what an office desk meets, driven in bare node: the real shell/main.js with
 * electron stubbed and node:fs wrapped, so that a file another program is holding can be planted
 * where the shell writes, and a catalog the engine refuses where it reads. No window and no
 * browser: each load is a fresh evaluation of the file, and what the checks call is the file's
 * own functions and IPC handlers; the engine's half of a refusal is its own modules, imported. Leg 7
 * calls every IPC channel the shell registers with a message from a page that is not the engine.
 *
 *   node tests/shell-office.mjs        exit code is the number of failed checks, capped at 63
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import realFs from "node:fs";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 101;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = realFs.mkdtempSync(path.join(os.tmpdir(), "etiuda-shell-office-"));
const SRC = realFs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
/* The shell reads a catalog from the folder above itself, so it is loaded beside copies of the two
   folders it needs and never above the checkout: an ignored file at a checkout's root is then not
   in this world. */
const APP = path.join(LAB, "app");
["shell", "engine"].forEach(d => realFs.cpSync(path.join(ROOT, d), path.join(APP, d), { recursive: true }));
/* The shell's own names, handed back by a line added after its source: nothing is exported from
   main.js, and a slice would test a copy of one function rather than the file as it runs. */
const EXPOSE = ["renamePatiently", "writeReplacing", "saveWindowPlace", "windowFile", "readCatalog", "channelHash",
  "SAMPLE_EDITIONS", "catalogChanged", "sendListing", "spellingFromPackage", "chromiumDesktop", "keyringSwitch"];

/* node:fs with a hook per call: `ctl.renameSync = (real, ...args) => ...` decides that call,
   and a call without a hook goes to the real one. `ctl.any` sees every synchronous call first,
   with its name, which is how a folder that does not answer is planted: a call into it throws
   and is counted, where on a desk it would have waited out the network's timeout. */
const HOOKED = ["renameSync", "readdirSync", "statSync", "readFileSync", "existsSync", "mkdirSync", "writeFileSync", "watch"];
function wrapFs(ctl) {
  const f = Object.create(realFs);
  HOOKED.forEach(n => { f[n] = (...a) => {
    if (ctl.any) ctl.any(n, a[0]);
    return ctl[n] ? ctl[n](realFs[n].bind(realFs), ...a) : realFs[n](...a);
  }; });
  const promises = Object.create(realFs.promises);
  promises.stat = (...a) => (ctl.pstat ? ctl.pstat(...a) : realFs.promises.stat(...a));
  Object.defineProperty(f, "promises", { value: promises });
  return f;
}
function busy(code) { const e = new Error(code + ": the file is held by another program"); e.code = code; return e; }

/* Timers the checks fire by hand, handed to main.js in place of the globals, so a 30-second
   retry is a line of the test rather than half a minute of it. */
function fakeClock() {
  let n = 0;
  const pending = new Map();
  return {
    setTimeout: (fn, ms) => { const id = { n: ++n, ms: ms, fn: fn }; pending.set(id.n, id); return id; },
    clearTimeout: id => { if (id && id.n) pending.delete(id.n); },
    due: ms => [...pending.values()].filter(t => t.ms === ms),
    fire: ms => { const ts = [...pending.values()].filter(t => t.ms === ms); ts.forEach(t => { pending.delete(t.n); t.fn(); }); return ts.length; },
  };
}
/* A stand-in for anything Electron returns, answering every property with itself, except what
   `over` names. isDestroyed is named wherever the shell asks it, since a stand-in is truthy. */
function anything(over) {
  const p = new Proxy(function () {}, {
    get: (t, k) => (over && k in over) ? over[k] : (k === "then" || k === Symbol.iterator || k === Symbol.toPrimitive) ? undefined : p,
    set: () => true, apply: () => p, construct: () => p,
  });
  return p;
}

let loads = 0;
/* WINDOWS' PROXY KEY AS REG PRINTS IT, planted where the shell asks, so no leg reads this machine's own
   settings and none writes them: the key's values, a blank line, then its subkeys. */
const REG_TOOL = "C:\\Windows\\System32\\reg.exe";
const REG_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const regDump = values => ["", REG_KEY, ...values.map(([n, ty, v]) => "    " + n + "    " + ty + "    " + v), "",
  REG_KEY + "\\Connections", REG_KEY + "\\Wpad", ""].join("\r\n");
const QUIET = regDump([["CertificateRevocation", "REG_DWORD", "0x1"], ["ProxyEnable", "REG_DWORD", "0x0"],
  ["User Agent", "REG_SZ", "Mozilla/4.0 (compatible; MSIE 8.0; Win32)"]]);
/* opts.reg: what the key reads as (text, or an Error for a reg that fails). opts.ready: app.whenReady resolves,
   so the shell boots as far as its window; opts.clock: the
   fake timers above; opts.desk: keys written into desk.json before the shell reads it; opts.src:
   the source to run in place of main.js; opts.app: the folder it runs from; opts.onLine: switches
   on its command line; opts.paths and opts.dialogs: arrays that take the setPath calls and the save dialogs it opens;
   opts.session: the electron session in place of the stand-in; opts.order: an array a window's construction is pushed to;
   opts.bus: the session bus dbus-send meets, a function of its arguments (leg 14); opts.env: variables set while the file loads (null removes one), over XDG_CURRENT_DESKTOP=GNOME, so the keyring switch of
   leg 14 is asked for only where a leg names a desktop that wants it. */
function loadShell(opts) {
  const o = opts || {};
  const dir = path.join(LAB, "load" + (++loads));
  const UD = path.join(dir, "user-data"), DOCS = path.join(dir, "documents");
  realFs.mkdirSync(UD, { recursive: true });
  realFs.mkdirSync(DOCS, { recursive: true });
  if (o.desk) realFs.writeFileSync(path.join(UD, "desk.json"),
    JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: o.desk }), "utf8");
  const said = [];
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: () => {} };
  const noop = () => {};
  const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
  const on = {}, invoke = {}, power = {}, sent = [], switches = [], removed = [];
  const onLine = new Set(o.onLine || []);
  const wc = anything({ send: (...a) => { sent.push(a); }, id: 7 });
  const win = anything({ isDestroyed: () => false, webContents: wc });
  const electron = {
    app: { getPath: n => (n === "documents" ? DOCS : UD), setPath: (k, v) => { if (o.paths) o.paths.push([k, v]); }, requestSingleInstanceLock: () => !!o.ready,
           quit: noop, on: noop, getVersion: () => "0.0.0",
           commandLine: { appendSwitch: (...a) => { switches.push(a); }, hasSwitch: k => onLine.has(k),
                          removeSwitch: k => { if (onLine.delete(k)) removed.push(k); } },
           whenReady: () => (o.ready ? Promise.resolve() : new Promise(noop)) },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: o.ready ? new Proxy(function () {}, { construct: () => { if (o.order) o.order.push(["window"]); return win; },
      get: (t, k) => (k === "fromWebContents" ? () => win : k === "getAllWindows" ? () => [win] : undefined) }) : inert,
    Menu: inert, dialog: o.dialogs ? { showSaveDialog: async (...a) => { o.dialogs.push(a); return { canceled: true }; } } : inert, net: inert, protocol: o.ready ? anything() : inert,
    session: o.session || (o.ready ? anything() : inert),
    screen: inert, shell: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
    powerMonitor: { on: (ev, fn) => { power[ev] = fn; } },
  };
  const ctl = {};
  const fs = wrapFs(ctl);
  const regCalls = [], busCalls = [];
  const cp = { execFileSync: (file, args, opt) => {
    /* The session bus as opts.bus answers it (a function of dbus-send's arguments); none, as on Windows, throws. */
    if (file === "dbus-send") { busCalls.push(args); if (!o.bus) throw new Error("no session bus"); return o.bus(args); }
    if (file !== REG_TOOL) return nodeRequire("node:child_process").execFileSync(file, args, opt);
    regCalls.push([file, args, opt]);
    if (o.reg instanceof Error) throw o.reg;
    return o.reg === undefined ? QUIET : o.reg;
  } };
  const clock = o.clock || { setTimeout: setTimeout, clearTimeout: clearTimeout };
  /* A file of the shell's own that main.js requires from beside itself is evaluated here too, so the
     stand-ins above reach its own requires: the planted reg tool is the proxy reader's. */
  const own = {};
  const ownModule = n => { const m = { exports: {} };
    new Function("require", "module", "exports", "__dirname", "__filename", realFs.readFileSync(n, "utf8"))(fakeRequire, m, m.exports, path.dirname(n), n);
    return m.exports; };
  const fakeRequire = n => (n === "electron" ? electron : (n === "node:fs" || n === "fs") ? fs : n === "node:child_process" ? cp
    : (path.isAbsolute(n) && /\.cjs$/.test(n)) ? (own[n] || (own[n] = ownModule(n))) : nodeRequire(n));
  const env = Object.assign({ XDG_CURRENT_DESKTOP: "GNOME" }, o.env || {}), envWas = {};
  for (const k of Object.keys(env)) { envWas[k] = process.env[k]; if (env[k] === null) delete process.env[k]; else process.env[k] = env[k]; }
  let api;
  try {
  api = new Function("require", "__dirname", "__filename", "module", "exports", "console", "setTimeout", "clearTimeout",
    (o.src || SRC) + "\nreturn { " + EXPOSE.map(n => n + ": typeof " + n + " === 'undefined' ? undefined : " + n).join(", ") + " };")(
    fakeRequire, path.join(o.app || APP, "shell"), path.join(o.app || APP, "shell", "main.js"), { exports: {} }, {}, quiet,
    clock.setTimeout, clock.clearTimeout);
  } finally {
    for (const k of Object.keys(envWas)) { if (envWas[k] === undefined) delete process.env[k]; else process.env[k] = envWas[k]; }
  }
  const ENGINE = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
  const ipc = (ch, ...args) => { const e = { sender: { id: 1, once: noop }, senderFrame: ENGINE, returnValue: undefined };
    if (on[ch]) on[ch](e, ...args); return e.returnValue; };
  const ask = (ch, ...args) => invoke[ch]({ sender: { id: 1 }, senderFrame: ENGINE }, ...args);
  return { api, ctl, said, ipc, ask, on, invoke, UD, DOCS, deskFile: path.join(UD, "desk.json"), power, sent, win, switches, removed, regCalls, busCalls };
}
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
/* Invented from nothing, as every fixture here is. The refused one names a shelf that is not
   there, which v2Problems refuses and the shell's format check cannot see. */
function goodCatalog() {
  return { format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 1, name: "Lamp Shop", date: "2026-01-09",
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" }, body: { en: "Good day." } }] };
}
function refusedCatalog() {
  const c = goodCatalog();
  c.name = "Lamp Shop, edited by hand";
  c.date = "2026-01-10";
  c.cards[0].shelf = "t-nowhere";
  return c;
}
const keysOn = f => { try { return JSON.parse(realFs.readFileSync(f, "utf8")).keys || {}; } catch { return null; } };

try {
  /* ---- 1. a file another program holds: Windows refuses a rename over it while it is open --- */
  {
    const S = loadShell();
    let renames = 0;
    S.ctl.renameSync = (real, a, b) => { renames++; return real(a, b); };
    const given = JSON.parse(S.ipc("etiuda:desk"));
    const ok = S.ipc("etiuda:desk-save", JSON.stringify(Object.assign({}, given, { eOfficeA: "1" })));
    check(ok === true && keysOn(S.deskFile).eOfficeA === "1" && renames === 1,
      "1a THE CONTROL: a desk save with nothing holding the file lands with one rename (" + renames + ")");

    let refusals = ["EPERM", "EBUSY"];
    renames = 0;
    S.ctl.renameSync = (real, a, b) => { renames++; if (refusals.length) throw busy(refusals.shift()); return real(a, b); };
    const ok2 = S.ipc("etiuda:desk-save", JSON.stringify(Object.assign({}, given, { eOfficeA: "1", eOfficeB: "2" })));
    check(ok2 === true && keysOn(S.deskFile).eOfficeB === "2" && renames === 3,
      "1b a rename refused as busy twice is asked again and the save lands: " + renames + " rename(s), answered " + ok2);

    renames = 0;
    S.ctl.renameSync = (real, a, b) => { renames++; throw busy("EACCES"); };
    const t0 = Date.now();
    const ok3 = S.ipc("etiuda:desk-save", JSON.stringify(Object.assign({}, given, { eOfficeC: "3" })));
    const waited = Date.now() - t0;
    const kept = keysOn(S.deskFile);
    check(ok3 === false && renames === 10 && waited < 2000 && kept && kept.eOfficeB === "2" && !("eOfficeC" in kept)
      && !realFs.existsSync(S.deskFile + ".tmp"),
      "1c a file held past the shell's patience: " + renames + " asks in " + waited + " ms, answered " + ok3
      + ", the desk on the disk as it was, " + (realFs.existsSync(S.deskFile + ".tmp") ? "a" : "no") + " temp file left");

    renames = 0;
    S.ctl.renameSync = (real, a, b) => { renames++; throw busy("ENOSPC"); };
    const ok4 = S.ipc("etiuda:desk-save", JSON.stringify(Object.assign({}, given, { eOfficeD: "4" })));
    check(ok4 === false && renames === 1,
      "1d a refusal that is not a busy file is not asked again: " + renames + " rename(s), answered " + ok4);

    let placeRenames = 0;
    S.ctl.renameSync = (real, a, b) => { placeRenames++; if (placeRenames === 1) throw busy("EPERM"); return real(a, b); };
    const win = { isDestroyed: () => false, isMinimized: () => false, isSnapped: () => false,
                  getNormalBounds: () => ({ x: 10, y: 20, width: 900, height: 700 }), getBounds: () => null };
    S.api.saveWindowPlace(win, false);
    let place = null;
    try { place = JSON.parse(realFs.readFileSync(S.api.windowFile(), "utf8")); } catch { /* checked below */ }
    check(!!place && place.width === 900 && placeRenames === 2,
      "1e the window's place is asked again the same way: " + placeRenames + " rename(s), width " + (place && place.width));
    /* Every other rename in the shell: the export's is the same writeReplacing, and the one left
       is rotateDesk's slot shift, whose failure is an empty slot by design. */
    const direct = SRC.split("\n").filter(l => /\bfs\.renameSync\(/.test(l) && !/^\s*(\/\/|\*)/.test(l)).length;
    check(direct === 2,
      "1f fs.renameSync is called at two lines of shell/main.js, renamePatiently's and rotateDesk's: " + direct);
  }

  /* ---- 2. a catalog the shell's check passes and the engine's refuses ------------------------
     The shell tests the format's pair; the engine runs v2Problems. A shelf naming nothing is one
     difference: the newer file below passes the first and fails the second. */
  {
    const S = loadShell();
    const folder = path.join(S.DOCS, "Etiuda");
    realFs.mkdirSync(folder, { recursive: true });
    const OLD = path.join(folder, "lamps-old.ec"), NEW = path.join(folder, "lamps-new.ec");
    realFs.writeFileSync(OLD, JSON.stringify(goodCatalog()), "utf8");
    realFs.writeFileSync(NEW, JSON.stringify(refusedCatalog()), "utf8");
    realFs.utimesSync(OLD, new Date(2026, 0, 1), new Date(2026, 0, 1));
    realFs.utimesSync(NEW, new Date(2026, 0, 2), new Date(2026, 0, 2));
    const nameOf = json => { try { return JSON.parse(json).name; } catch { return null; } };
    const first = S.ipc("etiuda:catalog");
    check(nameOf(first) === refusedCatalog().name,
      "2a THE CONTROL: the shell hands the newest file, which its own check passes: " + (nameOf(first) === refusedCatalog().name));
    const stranger = S.ipc("etiuda:catalog-refused", "lamps-old.ec");
    check(stranger === null && nameOf(S.api.readCatalog()) === refusedCatalog().name,
      "2b a refusal naming a file other than the one handed passes nothing over");
    const next = S.ipc("etiuda:catalog-refused", "lamps-new.ec");
    check(!!next && nameOf(next.json) === goodCatalog().name && next.file === "lamps-old.ec" && next.in === folder
      && next.builtIn === false && next.mtime === Math.round(realFs.statSync(OLD).mtimeMs),
      "2c the engine's refusal of it is answered with the older sound edition, and where it came from: "
      + (next ? next.file + ", in the catalog folder " + (next.in === folder) + ", dated " + (next.mtime > 0) : "null"));
    const rows = await S.ask("etiuda:catalog-files");
    const row = n => rows.filter(r => r.name === n)[0] || {};
    check(row("lamps-new.ec").cards === -1 && row("lamps-new.ec").macros === -1 && row("lamps-old.ec").cards === 1,
      "2d the Library's row for the refused file says it would not read (cards " + row("lamps-new.ec").cards
      + "), the sound one keeps its counts (" + row("lamps-old.ec").cards + ")");
    check(nameOf(S.api.readCatalog()) === goodCatalog().name,
      "2e a later read, the watch's, still passes the refused file over");
    realFs.utimesSync(NEW, new Date(2026, 0, 3), new Date(2026, 0, 3));
    check(nameOf(S.api.readCatalog()) === refusedCatalog().name,
      "2f saved again, it is read again: a fixed file is not held against its next edition");
  }

  /* ---- 3. the engine's half: src/modules/catalog.js and host.js over a stub host ------------ */
  {
    const calls = [];
    globalThis.window = {
      E_CATALOG: refusedCatalog(),
      E_HOST: { catalogFile: "lamps-new.ec", catalogIn: "C:/lab/Etiuda", catalogMtime: 2, catalogBuiltIn: false, openedWith: true,
                catalogRefused: n => { calls.push(n); return { json: JSON.stringify(goodCatalog()), file: "lamps-old.ec",
                                                               in: "C:/lab/Etiuda", builtIn: false, mtime: 1 }; } },
    };
    const C = await import(MOD("catalog.js"));
    const H = await import(MOD("host.js"));
    const got = C.eCatalog();
    check(!!got && got.version === goodCatalog().date && calls.join() === "lamps-new.ec"
      && C.eCatalogRefusedNames().join() === "lamps-new.ec",
      "3a a handed catalog the engine refuses is named to the host once, and the next one it hands is the catalog read: "
      + (got ? "edition " + got.version : "null") + ", host told " + calls.length + " time(s)");
    check(H.eCatalogFile() === "lamps-old.ec" && H.eCatalogMtime() === 1 && H.eCatalogIn() === "C:/lab/Etiuda"
      && H.eOpenedWith() === false,
      "3b and the host's facts follow the file handed in its place: " + H.eCatalogFile() + ", dated " + H.eCatalogMtime()
      + ", opened-with " + H.eOpenedWith());

    globalThis.window = { E_CATALOG: refusedCatalog(), E_HOST: { catalogFile: "lamps-new.ec" } };
    const C2 = await import(MOD("catalog.js") + "?no-refusal-channel");
    check(C2.eCatalog() === null && C2.eCatalogRefusedNames().join() === "lamps-new.ec",
      "3c a host with no refusal channel still has the refusal recorded, for the boot to say");
    globalThis.window = { E_CATALOG: goodCatalog(), E_HOST: { catalogFile: "lamps-old.ec",
      catalogRefused: n => { calls.push("again " + n); return null; } } };
    const C3 = await import(MOD("catalog.js") + "?sound");
    check(!!C3.eCatalog() && C3.eCatalogRefusedNames().length === 0 && calls.length === 1,
      "3d THE CONTROL: a sound catalog is read as it stands, and the host is told nothing");
  }

  /* ---- 4. a catalog folder that does not answer: a share off the VPN, or across a sleep -------
     The shell boots as far as its window. The share is a real folder; "down" is planted by making
     the asynchronous stat never settle and every synchronous call into the folder throw, counted,
     where on a desk each would have waited out the network's timeout. */
  {
    /* A real stat settles on the thread pool, so the wait is time as well as turns of the loop. */
    const settle = async () => {
      for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
      await new Promise(r => setTimeout(r, 40));
      for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
    };
    let shares = 0;
    const boot = (down) => {
      const share = path.join(LAB, "share" + (++shares));
      realFs.mkdirSync(share, { recursive: true });
      realFs.writeFileSync(path.join(share, "lamps.ec"), JSON.stringify(goodCatalog()), "utf8");
      const clock = fakeClock();
      const S = loadShell({ ready: true, clock: clock, desk: { eCatalogFolder: share } });
      const st = { down: down, touched: [], watchers: [], hung: [] };
      const inShare = p => typeof p === "string" && path.resolve(p).toLowerCase().indexOf(share.toLowerCase()) === 0;
      S.ctl.any = (n, p) => {
        if (n === "existsSync" || !(st.down && inShare(p))) return;
        st.touched.push(n);
        throw Object.assign(new Error("the share did not answer"), { code: "ETIMEDOUT" });
      };
      // existsSync answers rather than throws, as it does on a desk once the timeout has passed.
      S.ctl.existsSync = (real, p) => ((st.down && inShare(p)) ? (st.touched.push("existsSync"), false) : real(p));
      /* A stat into the share waits until the share's state changes, and then fails as the
         network's own timeout would. */
      S.ctl.pstat = (p, ...rest) => (st.down && inShare(p)
        ? new Promise((res, rej) => st.hung.push(() => rej(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }))))
        : realFs.promises.stat(p, ...rest));
      st.back = () => { st.down = false; st.hung.splice(0).forEach(f => f()); };
      S.ctl.watch = (real, dir) => { const w = new EventEmitter(); w.close = () => {}; w.dir = dir; st.watchers.push(w); return w; };
      return { S, st, clock, share, onShare: () => st.watchers.filter(w => w.dir === share) };
    };
    const named = json => { try { return JSON.parse(json).name; } catch { return null; } };

    const up = boot(false);
    await settle();
    check(up.onShare().length === 1 && named(up.S.ipc("etiuda:catalog")) === goodCatalog().name,
      "4a THE CONTROL: a folder that answers boots the window, is watched, and its catalog is handed");

    const d = boot(true);
    await settle();
    // The window's first act is to watch its folders, so a watch on any of them is the window.
    const beforeLimit = d.st.watchers.length > 0;
    const fired = d.clock.fire(3000);
    await settle();
    const handed = d.S.ipc("etiuda:catalog");
    const host = d.S.ipc("etiuda:host");
    const rows = await d.S.ask("etiuda:catalog-files");
    const read = await d.S.ask("etiuda:catalog-read", "lamps.ec");
    check(!beforeLimit && fired === 1 && d.st.watchers.length > 0,
      "4b a folder that does not answer holds the window for the ask's limit and no longer: window before the limit "
      + beforeLimit + ", after it " + (d.st.watchers.length > 0));
    check(d.st.touched.length === 0 && handed === null && !!host && rows.length === 0 && read && read.text === ""
      && d.onShare().length === 0,
      "4c and while it does not answer, nothing touches it synchronously: " + d.st.touched.length + " call(s)"
      + (d.st.touched.length ? " (" + d.st.touched.slice(0, 4).join(", ") + ")" : "")
      + ", the boot's catalog, host answer, Library listing and Load all answered empty");
    const beforeListing = d.st.touched.length;
    (d.S.api.sendListing || (() => {}))(d.S.win, true);
    check(d.st.touched.length === beforeListing && d.S.sent.filter(a => a[0] === "etiuda:catalog-listing").length === 0,
      "80g and nothing is sent, and nothing touched, while the folder does not answer: the listing is read where the folder answers, as the Library's is ("
      + (d.st.touched.length - beforeListing) + " call(s), " + d.S.sent.filter(a => a[0] === "etiuda:catalog-listing").length + " send(s))");
    const atDoors = d.st.touched.length;
    const ring = await d.S.ask("etiuda:catalog-ring");
    const door = await d.S.ask("etiuda:open-catalog-folder");
    check(d.st.touched.length === atDoors && ring === "" && door === false,
      "4j nor do the ring's door and the folder's: " + (d.st.touched.length - atDoors) + " call(s)"
      + (d.st.touched.length > atDoors ? " (" + d.st.touched.slice(atDoors).join(", ") + ")" : "")
      + ", ring " + JSON.stringify(ring) + ", folder opened " + door);
    const warned = d.S.said.filter(l => /catalog folder .* did not answer/.test(l)).length;
    check(warned === 1 && d.clock.due(30000).length === 1,
      "4d it is said once in the log, and asked again on a timer: " + warned + " line(s), "
      + d.clock.due(30000).length + " retry pending");

    d.st.back();
    await settle();
    const req = { format: 1, kind: "etiuda-request", id: "req-office", issued: "2026-09-01",
      from: "2026-09-01", to: "2026-09-27", expires: "2099-01-01" };
    req.hash = d.S.api.channelHash(req);
    realFs.writeFileSync(path.join(d.share, "etiuda-request.ereq"), JSON.stringify(req), "utf8");
    d.clock.fire(30000);
    await settle();
    const offered = d.S.sent.filter(a => a[0] === "etiuda:catalog-file").map(a => named(a[1]));
    const asked = d.S.sent.filter(a => a[0] === "etiuda:stats-ask").map(a => a[1] && a[1].id);
    check(d.onShare().length === 1 && offered.join() === goodCatalog().name && asked.join() === "req-office",
      "4e when it answers again it is watched, what it holds is offered, and the statistics request is answered: watch "
      + d.onShare().length + ", offered " + offered.length + ", asked " + asked.join());

    /* The file the desk writes for a request, from a text the page sends (board 814, S2): the shell
       rebuilds it field by field, so what the page's statsDoc carries reaches the file only where
       the shell copies it. Each case is a desk of its own, asked and answered as 4e's was. */
    const answerWith = async (sent) => {
      const a = boot(true);
      await settle();
      a.clock.fire(3000);
      await settle();
      a.st.back();
      await settle();
      const rq = { format: 1, kind: "etiuda-request", id: "req-pairs", issued: "2026-09-01",
        from: "2026-09-01", to: "2026-09-27", expires: "2099-01-01" };
      rq.hash = a.S.api.channelHash(rq);
      realFs.writeFileSync(path.join(a.share, "etiuda-request.ereq"), JSON.stringify(rq), "utf8");
      realFs.mkdirSync(path.join(a.share, "stats"), { recursive: true });
      a.clock.fire(30000);
      await settle();
      const res = await a.S.ask("etiuda:stats-write", JSON.stringify(Object.assign(
        { engine: "2.0.0", cards: [{ id: "c-a", n: 2, at: "2026-09-02" }], intents: [], misses: 0, langs: { en: 2 } }, sent)));
      const names = realFs.readdirSync(path.join(a.share, "stats")).filter(n => /\.estat$/.test(n));
      let doc = null;
      try { doc = JSON.parse(realFs.readFileSync(path.join(a.share, "stats", names[0]), "utf8")); } catch { doc = null; }
      const rehash = doc ? a.S.api.channelHash(doc) : "";
      return { ok: !!(res && res.ok), files: names.length, doc, hashOk: !!doc && doc.hash === rehash };
    };
    const withPair = await answerWith({ pairs: [{ from: "c-a", to: "c-m", n: 3, name: "smuggled" }] });
    check(withPair.ok && withPair.files === 1 && withPair.hashOk
      && JSON.stringify(withPair.doc && withPair.doc.pairs) === JSON.stringify([{ from: "c-a", to: "c-m", n: 3 }]),
      "4v the statistics answer carries the pairs the page counted into the file, each row rebuilt as from, to and n, under the file's hash: "
      + (withPair.doc ? "pairs " + JSON.stringify(withPair.doc.pairs) : "no file") + ", hash " + withPair.hashOk);
    const noPairs = await answerWith({});
    check(noPairs.ok && noPairs.files === 1 && noPairs.hashOk && !("pairs" in noPairs.doc)
      && Object.keys(noPairs.doc).sort().join() === "cards,desk,engine,format,hash,intents,kind,langs,misses,period,sync",
      "4w THE TWIN: a desk with no pairs writes the file it always wrote, with no pairs key: "
      + (noPairs.doc ? Object.keys(noPairs.doc).sort().join() : "no file"));
    const emptyPairs = await answerWith({ pairs: [{ from: "c-a", to: "", n: 1 }, { from: "c-a", to: "c-b", n: 0 }, { from: 5, to: "c-b", n: 1 }, null] });
    check(emptyPairs.ok && emptyPairs.files === 1 && !("pairs" in emptyPairs.doc),
      "4x a pairs list with no row that survives writes no key, not an empty one: "
      + (emptyPairs.doc ? "pairs " + JSON.stringify(emptyPairs.doc.pairs) : "no file"));

    const armed = d.onShare().length;
    const first = d.onShare()[0];
    if (first) first.emit("error", Object.assign(new Error("the network name is no longer available"), { code: "EPERM" }));
    const soon = d.clock.fire(1000);
    await settle();
    check(soon === 1 && d.onShare().length === armed + 1,
      "4f a watch that stops is armed again: " + soon + " retry fired, " + (d.onShare().length - armed) + " new watch");

    const beforeResume = d.onShare().length;
    if (typeof d.S.power.resume === "function") d.S.power.resume();
    await settle();
    check(d.onShare().length === beforeResume + 1,
      "4g a resume from sleep arms the watch again at once: " + (d.onShare().length - beforeResume) + " new watch");

    d.S.ctl.watch = () => { throw Object.assign(new Error("access is denied"), { code: "EPERM" }); };
    if (typeof d.S.power.resume === "function") d.S.power.resume();
    await settle();
    d.clock.fire(30000);
    await settle();
    const noWatch = d.S.said.filter(l => l.indexOf("no watch on " + d.share) > -1).length;
    check(noWatch === 1 && d.clock.due(30000).length === 1,
      "4h a folder that answers but refuses a watch is asked again on the timer, said once: "
      + noWatch + " line(s), " + d.clock.due(30000).length + " retry pending");

    d.S.ctl.watch = (real, dir) => { const w = new EventEmitter(); w.close = () => {}; w.dir = dir; d.st.watchers.push(w); return w; };
    d.st.down = true;
    const touchedBefore = d.st.touched.length;
    if (typeof d.S.power.resume === "function") d.S.power.resume();
    const rowsAtWake = await d.S.ask("etiuda:catalog-files");
    d.clock.fire(3000);
    await settle();
    const rowsAfter = await d.S.ask("etiuda:catalog-files");
    const downLines = d.S.said.filter(l => /catalog folder .* did not answer/.test(l)).length;
    check(d.st.touched.length === touchedBefore && rowsAtWake.length === 0 && rowsAfter.length === 0
      && d.clock.due(30000).length === 1 && downLines === 2,
      "4i a resume with the share gone reads nothing from it, waking or after the ask's limit, says so and asks again: "
      + (d.st.touched.length - touchedBefore) + " call(s), " + downLines + " line(s) in all, "
      + d.clock.due(30000).length + " retry pending");

    /* A share that has just timed out fails every call at once for a while, then waits out the
       timeout again: the first ask is failed as that timeout, and the retry lands in the window. */
    const r = boot(true);
    await settle();
    r.clock.fire(3000);
    await settle();
    r.S.ctl.pstat = (p, ...rest) => (r.st.down && typeof p === "string" && p.toLowerCase().indexOf(r.share.toLowerCase()) === 0
      ? Promise.reject(Object.assign(new Error("unknown error"), { code: "UNKNOWN" })) : realFs.promises.stat(p, ...rest));
    r.st.hung.splice(0).forEach(f => f());
    await settle();
    r.clock.fire(30000);
    await settle();
    const back = r.S.said.filter(l => /answers again/.test(l)).length;
    check(r.st.touched.length === 0 && back === 0 && r.clock.due(30000).length === 1,
      "4p a share still down whose next ask fails at once is not read as answering: " + r.st.touched.length
      + " sync call(s)" + (r.st.touched.length ? " (" + r.st.touched.slice(0, 5).join(", ") + ")" : "") + ", "
      + back + " 'answers again' line(s), " + r.clock.due(30000).length + " retry pending");

    /* A folder that is not there, on a disk that answers, has answered: a first run's own folder. */
    const firstClock = fakeClock();
    const fresh = loadShell({ ready: true, clock: firstClock });
    fresh.ctl.watch = (real, dir) => { const w = new EventEmitter(); w.close = () => {}; w.dir = dir; return w; };
    const own = path.join(fresh.DOCS, "Etiuda");
    const ownBefore = realFs.existsSync(own);
    await settle();
    const ownDown = fresh.said.filter(l => /catalog folder .* did not answer/.test(l)).length;
    check(!ownBefore && realFs.existsSync(own) && ownDown === 0 && firstClock.due(30000).length === 0,
      "4q a folder that is not there on a disk that answers is an answer, so a first run makes its own folder: made "
      + realFs.existsSync(own) + ", " + ownDown + " 'did not answer' line(s)");

    /* Not there, and nor is the place it sits in: the whole server is down, whatever the code says. */
    const gone = boot(true);
    const above = path.dirname(gone.share).toLowerCase();
    gone.S.ctl.pstat = (p, ...rest) => {
      const at = typeof p === "string" ? path.resolve(p).toLowerCase() : "";
      return (gone.st.down && (at.indexOf(gone.share.toLowerCase()) === 0 || at === above))
        ? Promise.reject(Object.assign(new Error("no such file or directory"), { code: "ENOENT" }))
        : realFs.promises.stat(p, ...rest);
    };
    await settle();
    const goneDown = gone.S.said.filter(l => /catalog folder .* did not answer/.test(l)).length;
    check(gone.st.touched.length === 0 && goneDown === 1 && gone.clock.due(30000).length === 1,
      "4r a folder that is not there where its parent does not answer either is not an answer: " + gone.st.touched.length
      + " sync call(s)" + (gone.st.touched.length ? " (" + gone.st.touched.slice(0, 5).join(", ") + ")" : "") + ", "
      + goneDown + " 'did not answer' line(s), " + gone.clock.due(30000).length + " retry pending");

    /* The folder the shell takes for its app root is the lab's copy, and the checkout's own root is
       never listed, so no file a checkout happens to hold there can change a leg above. */
    const listed = [];
    const K = loadShell({ ready: true, clock: fakeClock() });
    K.ctl.readdirSync = (real, p, ...rest) => (listed.push(path.resolve(String(p)).toLowerCase()), real(p, ...rest));
    K.ctl.watch = () => { const w = new EventEmitter(); w.close = () => {}; return w; };
    await settle();
    K.ipc("etiuda:catalog");
    check(listed.includes(path.resolve(APP).toLowerCase()) && !listed.includes(path.resolve(ROOT).toLowerCase()),
      "4s the app root the shell lists is the lab's own, and the checkout's root is never listed: app root listed "
      + listed.includes(path.resolve(APP).toLowerCase()) + ", checkout root listed " + listed.includes(path.resolve(ROOT).toLowerCase()));
  }

  /* ---- 5. the samples a first run gives, and which copy of a name is read ----------------------
     A first run copies every catalog the shell ships into the default Documents/Etiuda, once per
     desk; a file of the same name there is the one read and listed, whatever its bytes. Booted as far
     as the window over a Documents folder of the lab's own. */
  {
    const settle = async () => {
      for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
      await new Promise(r => setTimeout(r, 40));
      for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
    };
    const SHIPPED = realFs.readdirSync(path.join(ROOT, "shell")).filter(n => /\.ec$/i.test(n)).sort();
    const shippedBytes = n => realFs.readFileSync(path.join(ROOT, "shell", n));
    const start = async (desk, before) => {
      const S = loadShell({ ready: true, clock: fakeClock(), desk: desk });
      S.ctl.watch = () => { const w = new EventEmitter(); w.close = () => {}; return w; };
      const own = path.join(S.DOCS, "Etiuda");
      if (before) { realFs.mkdirSync(own, { recursive: true }); before(own); }
      await settle();
      let keys = {};
      try { keys = JSON.parse(realFs.readFileSync(S.deskFile, "utf8")).keys || {}; } catch { /* no desk written */ }
      const files = realFs.existsSync(own) ? realFs.readdirSync(own).sort() : ["<no folder>"];
      return { S, own, keys, files };
    };

    const first = await start();
    const same = first.files.join(",") === SHIPPED.join(",")
      && SHIPPED.every(n => realFs.readFileSync(path.join(first.own, n)).equals(shippedBytes(n)));
    check(SHIPPED.length > 0 && same && first.keys["e~sampled"] === "1",
      "5a a first run puts a copy of every catalog the shell ships into Documents/Etiuda, byte for byte, and writes"
      + " the desk, so the next run is not a first one: " + JSON.stringify({ shipped: SHIPPED, folder: first.files, given: first.keys["e~sampled"] }));

    const later = await start({ eTheme: "dark" });
    check(later.files.length === 0,
      "5b a desk that already has a file gives nothing, so an update gives no sample and a copy the person deleted stays deleted: "
      + JSON.stringify(later.files));

    const edited = Buffer.concat([shippedBytes(SHIPPED[0]), Buffer.from(" ")]);
    const theirs = await start(undefined, own => realFs.writeFileSync(path.join(own, SHIPPED[0]), edited));
    const read = await theirs.S.ask("etiuda:catalog-read", SHIPPED[0]);
    check(realFs.readFileSync(path.join(theirs.own, SHIPPED[0])).equals(edited) && theirs.keys["e~sampled"] === "1"
          && !!read && read.text === edited.toString("utf8"),
      "5c a file already there under a shipped name is left as it is, and it is the copy read: kept "
      + realFs.readFileSync(path.join(theirs.own, SHIPPED[0])).equals(edited) + ", read "
      + (!!read && read.text === edited.toString("utf8")));

    const rows = (await first.S.ask("etiuda:catalog-files")).filter(f => f.name === SHIPPED[0]);
    const plain = r => r.builtIn === false && !("replaces" in r);
    check(rows.length === 1 && plain(rows[0]) && rows[0].sample === true,
      "5d the copy a first run gave is the one the Library lists, once, as a plain row: byte for byte the shipped copy,"
      + " it is not the shipped one, the listing names no copy it stands in for, and it is still known as the sample: "
      + JSON.stringify(rows.map(r => ({ builtIn: r.builtIn, replaces: r.replaces, sample: r.sample }))));
    const theirRows = (await theirs.S.ask("etiuda:catalog-files")).filter(f => f.name === SHIPPED[0]);
    check(theirRows.length === 1 && plain(theirRows[0]) && theirRows[0].sample === false,
      "5f and a file of that name which differs from the shipped copy by one byte is listed once as a plain row too,"
      + " no longer the sample and naming no copy it stands in for: "
      + JSON.stringify(theirRows.map(r => ({ builtIn: r.builtIn, replaces: r.replaces, sample: r.sample }))));

    const crypto = nodeRequire("node:crypto");
    const editions = first.S.api.SAMPLE_EDITIONS || [];
    const known = SHIPPED.every(n => { const b = shippedBytes(n), h = crypto.createHash("sha256").update(b).digest("hex");
      return editions.some(x => x[0] === b.length && x[1] === h); });
    check(known, "5e every catalog the shell ships is an edition SAMPLE_EDITIONS names, so a copy of it keeps its place"
      + " at the foot of the list once the sample moves on: " + editions.length + " edition(s) listed");
  }
  /* ---- 6. Chromium's proxy is chosen from Windows' own setting, before the app is ready ------
     The key is planted (see REG_TOOL), never read from this machine. 6a to 6h are what a start does
     with each answer, 6d and 6i the controls that show those can fail, 6j and 6k the reader alone,
     which is shell/win-proxy.cjs (6m), and 6n the package carrying the files the shell requires. */
  {
    const LINE = "for (const s of windowsProxySwitches()) app.commandLine.appendSwitch(...s);";
    const asked = S => S.switches.map(a => a.join("="));
    /* Every leg to 6k asks the Windows arm, so the shell is loaded as Windows on any machine. */
    const platformWas = Object.getOwnPropertyDescriptor(process, "platform");
    try {
      Object.defineProperty(process, "platform", { value: "linux" });
      const asLinux = loadShell();
      Object.defineProperty(process, "platform", { value: "win32" });
      check(JSON.stringify(asked(asLinux)) === '["no-proxy-server"]' && asLinux.regCalls.length === 0,
        "6l off Windows the shell starts no program and asks for no proxy and no lookup: " + JSON.stringify(asked(asLinux))
        + ", " + asLinux.regCalls.length + " program(s)");
      const S = loadShell();
      check(JSON.stringify(asked(S)) === '["no-proxy-server"]',
        "6a with only automatic detection or nothing set, the shell asks Chromium for --no-proxy-server, once, so an idle"
        + " desk does no proxy discovery and no IPv6 probe: " + JSON.stringify(asked(S)));
      check(S.regCalls.length === 1 && S.regCalls[0][0] === REG_TOOL
        && JSON.stringify(S.regCalls[0][1]) === JSON.stringify(["query", REG_KEY])
        && !!S.regCalls[0][2] && S.regCalls[0][2].windowsHide === true && S.regCalls[0][2].timeout === 5000,
        "6b the one program it starts for that is Windows' reg tool at its fixed system path, asking for one key, once, hidden and"
        + " given 5000 ms to answer, since the start waits on it: " + JSON.stringify(S.regCalls));
      check(SRC.split(LINE).length === 2, "6c the shell holds its proxy line exactly once, so the control copy can cut it");
      const stripped = SRC.split(LINE).join("");
      const bare = loadShell({ src: stripped });
      check(stripped !== SRC && bare.switches.length === 0,
        "6d THE CONTROL: the same shell with that one line removed asks for no switch, so 6a can fail: "
        + JSON.stringify(bare.switches));
      const server = loadShell({ reg: regDump([["ProxyEnable", "REG_DWORD", "0x1"], ["ProxyServer", "REG_SZ", "proxy.example.test:3128"],
        ["ProxyOverride", "REG_SZ", "<local>"]]) });
      check(JSON.stringify(asked(server)) === '["proxy-server=proxy.example.test:3128"]',
        "6e a configured proxy server is followed, and the no-proxy switch is not asked: " + JSON.stringify(asked(server)));
      const script = loadShell({ reg: regDump([["ProxyEnable", "REG_DWORD", "0x0"], ["AutoConfigURL", "REG_SZ", "http://wpad.example.test/proxy.pac"]]) });
      check(JSON.stringify(asked(script)) === '["proxy-pac-url=http://wpad.example.test/proxy.pac"]',
        "6f a configured setup-script address is followed: " + JSON.stringify(asked(script)));
      const stale = loadShell({ reg: regDump([["ProxyEnable", "REG_DWORD", "0x0"], ["ProxyServer", "REG_SZ", "proxy.example.test:3128"]]) });
      check(JSON.stringify(asked(stale)) === '["no-proxy-server"]',
        "6g a server left in the key while Windows has the proxy switched off is not followed: " + JSON.stringify(asked(stale)));
      const failing = loadShell({ reg: new Error("reg.exe did not answer") });
      check(JSON.stringify(asked(failing)) === '["no-proxy-server"]',
        "6h a reg tool that fails leaves today's start, no proxy and no lookup: " + JSON.stringify(asked(failing)));
      const stub = loadShell({ src: SRC.split(LINE).join('app.commandLine.appendSwitch("no-proxy-server");'),
        reg: regDump([["ProxyEnable", "REG_DWORD", "0x1"], ["ProxyServer", "REG_SZ", "proxy.example.test:3128"]]) });
      check(SRC.split(LINE).length === 2 && JSON.stringify(asked(stub)) !== '["proxy-server=proxy.example.test:3128"]'
        && JSON.stringify(asked(stub)) === '["no-proxy-server"]',
        "6i THE CONTROL: a shell that ignores the reader and always asks for no proxy, handed the planted server, does not"
        + " give the server, so 6e goes red on it: " + JSON.stringify(asked(stub)));
      let P = null;
      try { P = nodeRequire(path.join(ROOT, "shell", "win-proxy.cjs")); } catch (e) { P = null; }
      const rd = P && P.proxySwitchesFrom;
      const out = x => (rd ? JSON.stringify(rd(x)) : "no shell/win-proxy.cjs");
      const NONE = '[["no-proxy-server"]]';
      check(out(regDump([["ProxyEnable", "REG_DWORD", "0x1"], ["ProxyServer", "REG_SZ", ""], ["Next", "REG_SZ", "other.example.test:1"]])) === NONE
        && out(regDump([["ProxyEnable", "REG_DWORD", "0x1"], ["AutoConfigURL", "REG_SZ", ""], ["ProxyServer", "REG_SZ", ""]])) === NONE,
        "6j the reader on its own: a switched-on proxy with no address, whether the value is empty or missing, is none");
      check(out(regDump([["ProxyEnable", "REG_DWORD", "0x1"], ["ProxyServer", "REG_SZ", "http=a.example.test:1;https=b.example.test:2"],
          ["AutoConfigURL", "REG_EXPAND_SZ", "https://pac.example.test/a.pac"]])) === '[["proxy-pac-url","https://pac.example.test/a.pac"]]'
        && out(regDump([["ProxyEnable", "REG_DWORD", "0x1"], ["ProxyServer", "REG_SZ", "http=a.example.test:1;https=b.example.test:2"]]))
          === '[["proxy-server","http=a.example.test:1;https=b.example.test:2"]]'
        && out(regDump([["AutoConfigURL", "REG_SZ", "ftp://pac.example.test/a.pac"]])) === NONE
        && out(regDump([["AutoConfigURL", "REG_SZ", "not an address"]])) === NONE
        && out("") === NONE && out(undefined) === NONE,
        "6k the reader on its own: a script outranks a server, a per-scheme server list passes whole, an address that is not http, https"
        + " or file is none, and no text at all is none");
      const ownReader = /function (?:proxySwitchesFrom|windowsProxySwitches)\(/.test(SRC);
      check(!!rd && typeof P.windowsProxySwitches === "function" && !ownReader
        && SRC.split('const { windowsProxySwitches } = require(path.join(__dirname, "win-proxy.cjs"));').length === 2,
        "6m the shell holds no reader of its own and takes windowsProxySwitches from shell/win-proxy.cjs beside it, the file 6j and 6k"
        + " read alone: " + (rd ? "found" : "NOT FOUND") + (ownReader ? ", and a reader of its own" : ""));
      const builder = nodeRequire(path.join(ROOT, "electron-builder.js"));
      const beside = [...SRC.matchAll(/require\(path\.join\(__dirname, "([^"]+)"\)\)/g)].map(m => "shell/" + m[1]);
      const notPacked = beside.filter(f => (builder.files || []).indexOf(f) < 0);
      check(beside.length === 2 && notPacked.length === 0,
        "6n every file the shell requires from beside itself is in electron-builder.js's files, or the installed desk would not"
        + " start: " + JSON.stringify(beside) + (notPacked.length ? ", NOT PACKED " + JSON.stringify(notPacked) : ""));
    } finally { Object.defineProperty(process, "platform", platformWas); }
  }
  /* ---- 7. every IPC channel asks who is speaking before it answers ---------------------------
     The shell is loaded with fromEngine and fromPicker each marking the event they are asked about,
     and every channel it registers is called once with a message from a page that is not the engine.
     A channel must have asked, must have answered with a refusal, and must have touched no file. */
  const SENDER = { engine: "function fromEngine(e) {", picker: "function fromPicker(e) {" };
  const PICKER_CHANNELS = ["etiuda:pick-close", "etiuda:pick-copy", "etiuda:pick-find", "etiuda:pick-ready"];
  const sourceChannels = src => src.split("\n").filter(l => /\bipcMain\.(?:on|once|handle|handleOnce)\(/.test(l) && !/^\s*(\/\/|\/?\*)/.test(l)).length;
  const marked = src => Object.keys(SENDER).reduce((out, k) => {
    if (out.split(SENDER[k]).length !== 2) throw new Error("shell/main.js does not hold " + SENDER[k] + " exactly once");
    return out.replace(SENDER[k], SENDER[k] + " (e.__asked = e.__asked || []).push(" + JSON.stringify(k) + ");");
  }, src);
  /* Two channels refuse with a neutral answer their caller can read as one: the host's empty description, and the picker's "null". */
  const NEUTRAL = { "etiuda:host": v => !!v && v.catalogFolder === "" && v.catalogFile === "" && v.backdrop === null,
                    "etiuda:pick-find": v => v === "null" };
  const refusal = (v, ch) => v === undefined || v === null || v === false || v === "" || v === "[]"
    || (Array.isArray(v) && v.length === 0) || (!!v && typeof v === "object" && v.ok === false)
    || (!!NEUTRAL[ch] && NEUTRAL[ch](v));
  const FOREIGN = { parent: null, url: "https://example.com/etiuda.html" };
  const STRANGER = frame => ({ sender: { id: 9, once: () => {} }, senderFrame: frame || FOREIGN, returnValue: undefined });
  const audit = async (src, frame) => {
    const S = loadShell({ src: marked(src) });
    const channels = [...Object.keys(S.on).map(c => ["on", c]), ...Object.keys(S.invoke).map(c => ["handle", c])];
    const rows = [];
    for (const [how, ch] of channels) {
      const e = STRANGER(frame);
      let files = 0, out, threw = null;
      S.ctl.any = () => { files++; };
      try { out = how === "on" ? (S.on[ch](e, "{}", "{}", "{}"), e.returnValue) : await S.invoke[ch](e, "{}", "{}", "{}"); }
      catch (x) { threw = x; }
      S.ctl.any = null;
      rows.push({ ch, how, asked: e.__asked || [], out, threw, files });
    }
    return { rows, registered: channels.length, written: sourceChannels(src), S };
  };
  const unasked = A => A.rows.filter(r => !r.asked.length).map(r => r.ch);
  const unrefused = A => A.rows.filter(r => r.threw || !refusal(r.out, r.ch) || r.files).map(r => r.ch
    + (r.threw ? " (threw)" : "") + (r.files ? " (" + r.files + " file call(s))" : "") + (r.threw || refusal(r.out, r.ch) ? "" : " (answered " + JSON.stringify(r.out).slice(0, 60) + ")"));
  {
    const A = await audit(SRC);
    check(A.registered >= 20 && A.registered === A.written,
      "7a THE CONTROL: the channels the shell registers when loaded are all the ones its source writes, so the walk below misses none: "
      + A.registered + " registered, " + A.written + " written");
    check(unasked(A).length === 0,
      "7b every channel asks who is speaking before it answers a page that is not the engine: " + A.rows.length
      + " channel(s), never asked " + JSON.stringify(unasked(A)));
    const viaPicker = A.rows.filter(r => r.asked.indexOf("picker") > -1).map(r => r.ch).sort();
    const notEngine = A.rows.filter(r => r.asked.indexOf("engine") < 0 && PICKER_CHANNELS.indexOf(r.ch) < 0).map(r => r.ch);
    check(notEngine.length === 0 && JSON.stringify(viaPicker) === JSON.stringify(PICKER_CHANNELS),
      "7c fromEngine is the question every channel asks except the picker's own four, which ask fromPicker: without it "
      + JSON.stringify(notEngine) + ", asking the picker " + JSON.stringify(viaPicker));
    check(unrefused(A).length === 0,
      "7d and the answer to a stranger is a refusal that has touched no file: " + JSON.stringify(unrefused(A)));

    const live = loadShell({ desk: { eSenderProbe: "1" } }).ipc("etiuda:desk");
    check(typeof live === "string" && live.indexOf("eSenderProbe") > -1 && !refusal(live, "etiuda:desk"),
      "7e THE CONTROL: the shell answers the engine's own frame on etiuda:desk with the desk, so a refusal is not all 7d can read: "
      + (typeof live === "string" ? live.length + " characters" : JSON.stringify(live)));

    /* The check cut from one channel, then asked on another and not obeyed: 7b and 7d must each see one. */
    const cut = SRC.replace('ipcMain.on("etiuda:window", (e, act) => {\n  if (!fromEngine(e)) return;', 'ipcMain.on("etiuda:window", (e, act) => {');
    const ignored = SRC.replace('ipcMain.on("etiuda:desk", (e) => {\n  if (!fromEngine(e)) { e.returnValue = null; return; }', 'ipcMain.on("etiuda:desk", (e) => {\n  fromEngine(e);');
    const has = base => name => base.indexOf(name) < 0;
    const seenCut = cut !== SRC ? unasked(await audit(cut)).filter(has(unasked(A))) : ["<the plant did not apply>"];
    const seenIgn = ignored !== SRC ? unrefused(await audit(ignored)).map(s => s.split(" ")[0]).filter(has(unrefused(A).map(s => s.split(" ")[0]))) : ["<the plant did not apply>"];
    check(JSON.stringify(seenCut) === JSON.stringify(["etiuda:window"]) && JSON.stringify(seenIgn) === JSON.stringify(["etiuda:desk"]),
      "7f THE CONTROL: with the check cut from etiuda:window 7b names it as the one channel added to its list, and with etiuda:desk asking and ignoring the answer 7d names it as the one added to its own: "
      + JSON.stringify(seenCut) + ", " + JSON.stringify(seenIgn));

    /* The engine's own address in a frame that is not the top one: fromEngine's top-frame clause. */
    const subframe = unrefused(await audit(SRC, { parent: {}, url: "file:///C:/lab/engine/etiuda.html" }));
    check(subframe.length === 0,
      "7g the engine's own page address, spoken from a frame that is not the top one, is refused by every channel too: " + JSON.stringify(subframe));
  }
  /* ---- 8. an installed desk opens no debugging endpoint unless the harness's launcher asks ----- */
  {
    const DEBUG = ["remote-debugging-port", "remote-debugging-pipe"];
    const INSTALLED = path.join(LAB, "installed", "resources", "app.asar");
    ["shell", "engine"].forEach(d => realFs.cpSync(path.join(ROOT, d), path.join(INSTALLED, d), { recursive: true }));
    const was = process.env.ETIUDA_TEST_DEVTOOLS;
    const load = (app, token) => {
      if (token) process.env.ETIUDA_TEST_DEVTOOLS = "1"; else delete process.env.ETIUDA_TEST_DEVTOOLS;
      try { return loadShell({ app, onLine: DEBUG }); }
      finally { if (was === undefined) delete process.env.ETIUDA_TEST_DEVTOOLS; else process.env.ETIUDA_TEST_DEVTOOLS = was; }
    };
    const tree = load(null, false), inst = load(INSTALLED, false), harness = load(INSTALLED, true);
    const told = inst.said.filter(l => /is not taken by an installed desk/.test(l)).length;
    check(tree.removed.length === 0,
      "8a THE CONTROL: the shell run from a checkout keeps both debugging switches, as every unpackaged"
      + " launch in tests/ needs: removed " + JSON.stringify(tree.removed));
    check(JSON.stringify(inst.removed) === JSON.stringify(DEBUG) && told === 2,
      "8b the same shell run from inside app.asar removes " + JSON.stringify(inst.removed)
      + " before ready and says so in " + told + " line(s)");
    check(harness.removed.length === 0,
      "8c and with ETIUDA_TEST_DEVTOOLS=1, which tests/engine.js shellLaunch sets beside the switch,"
      + " it keeps them for the harness: removed " + JSON.stringify(harness.removed));
    /* THE TWO VARIABLES THAT MOVE THE DESK'S FILES stand behind the same door: ETIUDA_TEST_DOCUMENTS
       moves the catalog folder and ETIUDA_TEST_SAVE_AS answers the export dialog. Each arm sets both,
       loads the shell, and presses the save channel while they are still set. */
    const SAVEX = path.join(LAB, "planted-save");
    const drive = async (app, door, arm) => {
      const DOCX = path.join(LAB, "planted-documents-" + arm);
      const put = { ETIUDA_TEST_DOCUMENTS: DOCX, ETIUDA_TEST_SAVE_AS: SAVEX, ETIUDA_TEST_DEVTOOLS: door ? "1" : undefined };
      const keep = {};
      for (const k of Object.keys(put)) { keep[k] = process.env[k]; if (put[k] === undefined) delete process.env[k]; else process.env[k] = put[k]; }
      try {
        const paths = [], dialogs = [];
        const S = loadShell({ app, paths, dialogs });
        const answer = await S.ask("etiuda:choose-catalog-save", "t", "cat.ec", "l");
        return { S, dialogs: dialogs.length, answer, made: realFs.existsSync(DOCX),
                 docs: paths.filter(p => p[0] === "documents" && p[1] === DOCX).length,
                 told: S.said.filter(l => /(ETIUDA_TEST_DOCUMENTS|ETIUDA_TEST_SAVE_AS) is not taken by an installed desk/.test(l)).length };
      } finally { for (const k of Object.keys(put)) if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
    };
    const own = await drive(null, false, "own"), shut = await drive(INSTALLED, false, "shut"), open = await drive(INSTALLED, true, "open");
    const takes = r => r.docs === 1 && r.dialogs === 0 && !!r.answer && r.answer.name === "cat.ec";
    check(takes(own) && own.told === 0 && own.made,
      "8d THE CONTROL: the shell run from a checkout takes both variables, ETIUDA_TEST_DOCUMENTS as the documents folder ("
      + own.docs + ") and ETIUDA_TEST_SAVE_AS as the answer to the export dialog (dialogs opened " + own.dialogs + ", answer "
      + JSON.stringify(own.answer) + "), and says nothing of them (" + own.told + ")");
    check(shut.docs === 0 && !shut.made && shut.dialogs === 1 && shut.answer === null && shut.told === 2,
      "8e the same shell run from inside app.asar takes neither: the documents folder is not moved (" + shut.docs
      + ") and no folder is made at that path (made " + shut.made + "; the checkout's own arm made one: " + own.made
      + "), the export dialog opens (" + shut.dialogs + ") and gets no harness answer (" + JSON.stringify(shut.answer)
      + "), and it says so in " + shut.told + " line(s)");
    check(takes(open) && open.told === 0,
      "8f and with ETIUDA_TEST_DEVTOOLS=1, which tests/engine.js shellLaunch sets beside either variable, it takes both"
      + " for the harness: documents moved " + open.docs + ", dialogs opened " + open.dialogs + ", told " + open.told);
  }
  /* ---- 9. a colleague's own file in the share: listed where it is genuine, and never the file the desk boots from ---- */
  {
    const crypto = nodeRequire("node:crypto");
    const V2 = await import(MOD("catalog-v2.js"));
    const S = loadShell();
    const folder = path.join(S.DOCS, "Etiuda");
    realFs.mkdirSync(folder, { recursive: true });
    const TOP = path.join(folder, "lamps.ec");
    const lead = Object.assign(goodCatalog(), { rev: 4, grew: { id: "lamp-origin", rev: 2, sha: "sha256:" + "ab".repeat(32) } });
    realFs.writeFileSync(TOP, JSON.stringify(lead), "utf8");
    realFs.utimesSync(TOP, new Date(2026, 0, 1), new Date(2026, 0, 1));
    const sha8 = s => crypto.createHash("sha256").update(s).digest("hex").slice(0, 8);
    /* A desk's file as the shell's own writer makes it: the key's id, the prefix, the engine's signed bytes. */
    const makeDesk = (name, o) => {
      const opt = o || {};
      const pair = crypto.generateKeyPairSync("ed25519");
      const raw = pair.publicKey.export({ type: "spki", format: "der" }).subarray(-32);
      const id = opt.claim || "k-" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
      const doc = Object.assign(goodCatalog(), { id: id + "-" + sha8("lamp-shop"), rev: 3, modified: true,
        grew: { id: "lamp-shop", rev: 1, sha: "sha256:" + "cd".repeat(32) },
        desk: { id: id, name: name, key: raw.toString("hex"), box: "ef".repeat(32) } });
      doc.cards[0].title = { en: "Warm opening, in " + name + "'s words" };
      doc.sig = { alg: "Ed25519", keyId: id };
      doc.sig.value = crypto.sign(null, Buffer.concat([Buffer.from("etiuda-desk-branch\n"), Buffer.from(V2.v2SignedBytes(doc))]), pair.privateKey).toString("hex");
      if (opt.spoil) doc.cards[0].title.en += "!";
      const dir = path.join(folder, "desks", opt.inFolder || id);
      realFs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "lamps-" + sha8("lamp-shop") + ".ec");
      realFs.writeFileSync(file, JSON.stringify(doc), "utf8");
      return { id, file, doc };
    };
    const ala = makeDesk("Ala");
    const rows = await S.ask("etiuda:catalog-files");
    const top = rows.filter(r => r.name === "lamps.ec")[0] || {}, hers = rows.filter(r => r.desk)[0] || {};
    check(top.rev === 4 && !!top.grew && top.grew.id === "lamp-origin" && top.grew.rev === 2 && !top.desk,
      "79a THE CONTROL: a file at the top of the folder is listed with its edition number and what it says it grew from, and is not a desk's (rev " + top.rev + ", grew "
      + JSON.stringify(top.grew) + ")");
    check(rows.filter(r => r.desk).length === 1 && hers.name === path.basename(ala.file) && hers.desk.id === ala.id && hers.desk.name === "Ala" && hers.rev === 3
      && hers.id === ala.doc.id && hers.grew.id === "lamp-shop" && hers.grew.rev === 1 && hers.cards === 1,
      "79b a colleague's genuine file is listed under its own name with the desk that wrote it, its id, its edition and what it grew from (" + rows.filter(r => r.desk).length + " of hers, "
      + JSON.stringify({ name: hers.name, desk: hers.desk, rev: hers.rev, grew: hers.grew }) + ")");

    const spoiled = makeDesk("Bea", { spoil: true });
    const wrongFolder = makeDesk("Cyl", { inFolder: "k-0123456789abcdef" });
    /* Signed with its own key throughout, but under an id that key does not make: the folder, desk.id and the signature all agree. */
    const forged = makeDesk("Dan", { claim: "k-1111111111111111" });
    const rows2 = await S.ask("etiuda:catalog-files");
    const names2 = rows2.filter(r => r.desk).map(r => r.desk.name);
    check(names2.join() === "Ala",
      "79c THE CONTROL: a desk file whose signature fails, one whose folder is not its id, and one whose id is not its key's are not listed, and the genuine one still is (" + JSON.stringify(names2) + ")");

    const newest = new Date(2026, 5, 1);
    realFs.utimesSync(ala.file, newest, newest);
    const text = S.ipc("etiuda:catalog"), read = S.api.readCatalog();
    check(!!read && JSON.parse(read).id === "lamp-shop" && JSON.parse(read).rev === 4 && text === read,
      "79d a desk's file newer than every file at the top is never the one the desk boots from, nor the one a folder change would offer: the file read is "
      + (read ? JSON.parse(read).id + " rev " + JSON.parse(read).rev : "none"));

    await S.ask("etiuda:catalog-files");
    let reads = 0;
    S.ctl.readFileSync = (real, f, ...a) => { if (String(f).indexOf(path.join("desks")) >= 0) reads++; return real(f, ...a); };
    await S.ask("etiuda:catalog-files");
    const after1 = reads;
    await S.ask("etiuda:catalog-files");
    check(after1 === 0 && reads === 0,
      "79e a desk's file is read again only when its date or size moves: two more listings after one that had read it read it " + reads + " time(s)");
    realFs.appendFileSync(ala.file, " ");
    realFs.utimesSync(ala.file, newest, newest);
    await S.ask("etiuda:catalog-files");
    check(reads === 1,
      "79f and it is read once when its size moves with its date as it was (" + reads + ")");
  }
  /* ---- 10. the listing is sent, not only asked for: at boot, and whenever a file in it changes place, id, edition or hash ---- */
  {
    const crypto = nodeRequire("node:crypto");
    const V2 = await import(MOD("catalog-v2.js"));
    const S = loadShell();
    const folder = path.join(S.DOCS, "Etiuda");
    realFs.mkdirSync(folder, { recursive: true });
    const A = path.join(folder, "lamps.ec");
    realFs.writeFileSync(A, JSON.stringify(goodCatalog()), "utf8");
    realFs.utimesSync(A, new Date(2026, 3, 1), new Date(2026, 3, 1));
    S.ipc("etiuda:catalog");                       // the boot's read, so that a same-text file is not new text
    const listings = () => S.sent.filter(a => a[0] === "etiuda:catalog-listing");
    const texts = () => S.sent.filter(a => a[0] === "etiuda:catalog-file").length;
    (S.api.sendListing || (() => {}))(S.win, true);
    const first = listings(), row0 = ((first[0] || [])[1] || []).filter(r => r.name === "lamps.ec")[0] || {};
    const wantSha = "sha256:" + crypto.createHash("sha256").update(V2.v2SignedBytes(goodCatalog())).digest("hex");
    check(first.length === 1 && row0.id === "lamp-shop" && row0.rev === 1 && row0.sha === wantSha,
      "80a THE LISTING IS SENT ONCE AT BOOT, with each file's id, edition and the hash of its signed bytes, which is node's own SHA-256 over the engine's signed bytes: "
      + first.length + " send(s), sha " + String(row0.sha).slice(0, 15) + " against " + wantSha.slice(0, 15));
    S.api.catalogChanged(S.win);
    const t1 = new Date(2026, 3, 2);
    realFs.utimesSync(A, t1, t1);
    S.api.catalogChanged(S.win);
    check(listings().length === 1 && texts() === 0,
      "80b THE CONTROL: a folder change that changes no file's place, id, edition or hash, a date moving alone included, sends nothing (" + listings().length + " listing(s), " + texts() + " catalog text(s))");

    const B = path.join(folder, "lamps-renamed.ec");
    realFs.renameSync(A, B);
    S.api.catalogChanged(S.win);
    const afterRename = listings(), names1 = ((afterRename[1] || [])[1] || []).map(r => r.name);
    check(afterRename.length === 2 && names1.indexOf("lamps-renamed.ec") >= 0 && names1.indexOf("lamps.ec") < 0 && texts() === 0,
      "80c a rename sends the listing and no catalog text: etiuda:catalog-file keeps its one meaning (" + afterRename.length + " listings, names " + JSON.stringify(names1.filter(n => /^lamps/.test(n)))
      + ", " + texts() + " catalog text(s))");

    const C = path.join(folder, "lamps-v2.ec");
    realFs.writeFileSync(C, JSON.stringify(Object.assign(goodCatalog(), { rev: 2 })), "utf8");
    realFs.utimesSync(C, new Date(2026, 0, 1), new Date(2026, 0, 1));
    S.api.catalogChanged(S.win);
    const l3 = listings(), r3 = ((l3[2] || [])[1] || []).filter(r => r.name === "lamps-v2.ec")[0] || {};
    check(l3.length === 3 && r3.rev === 2 && r3.id === "lamp-shop" && texts() === 0,
      "80d a higher edition under another name and an older date is in the listing that is sent, and the catalog text the shell offers is still the newest file's alone (" + l3.length + " listings, rev " + r3.rev + ", " + texts() + " catalog text(s))");

    const DESK = "k-" + crypto.createHash("sha256").update(Buffer.alloc(32, 7)).digest("hex").slice(0, 16);
    realFs.mkdirSync(path.join(folder, "desks", DESK), { recursive: true });
    realFs.writeFileSync(path.join(folder, "desks", DESK, "x.ec"), "{}", "utf8");
    S.api.catalogChanged(S.win);
    check(listings().length === 3,
      "80e a file in desks/ that is not genuine changes nothing in the listing, so sends nothing (" + listings().length + ")");

    realFs.unlinkSync(C);
    S.api.catalogChanged(S.win);
    check(listings().length === 4,
      "80f a file taken away is a change (" + listings().length + " listings)");

    /* The boot's send is the page finishing a load, which no node model fires: the handler's line is read, with its comments off. */
    const bare = t => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const loadLine = SRC.split("\n").filter(l => l.indexOf("on(\"did-finish-load\"") >= 0 && l.indexOf("tryAnswerRequest") >= 0)[0] || "";
    const sends = l => /\bsendListing\(win, true\)/.test(bare(l));
    check(sends(loadLine) && !sends(loadLine.replace("sendListing(win, true);", "/* sendListing(win, true); */")),
      "80h the page finishing a load sends the listing, forced: the line is read in code, and a call kept in a comment does not count");
  }

  /* ---- 11. a file whose read fails once is listed with its id once it can be read ---- */
  {
    const S = loadShell();
    const folder = path.join(S.DOCS, "Etiuda");
    realFs.mkdirSync(folder, { recursive: true });
    const A = path.join(folder, "held.ec");
    realFs.writeFileSync(A, JSON.stringify(goodCatalog()), "utf8");
    S.ctl.readFileSync = (real, f, ...a) => { if (String(f) === A) throw busy("EBUSY"); return real(f, ...a); };
    const r1 = ((await S.ask("etiuda:catalog-files")) || []).filter(r => r.name === "held.ec")[0] || {};
    delete S.ctl.readFileSync;
    const r2 = ((await S.ask("etiuda:catalog-files")) || []).filter(r => r.name === "held.ec")[0] || {};
    check(r1.name === "held.ec" && r1.id === "",
      "81x THE PLANT REACHED: the held file is listed with no id while its read fails (" + JSON.stringify([r1.id, r1.cards]) + ")");
    check(r2.id === "lamp-shop" && r2.cards > 0,
      "81y once the read succeeds, the same file (same date and size) is listed with its id and cards, a failed read not being remembered as a verdict on it ("
      + JSON.stringify([r2.id, r2.cards]) + ")");
  }
  /* ---- 12. a colleague's file read by its desk's folder, and desks/ watched one folder down ---- */
  {
    const crypto = nodeRequire("node:crypto");
    const V2 = await import(MOD("catalog-v2.js"));
    const share = path.join(LAB, "desks-share");
    realFs.mkdirSync(share, { recursive: true });
    realFs.writeFileSync(path.join(share, "lamps.ec"), JSON.stringify(goodCatalog()), "utf8");
    const sha8 = s => crypto.createHash("sha256").update(s).digest("hex").slice(0, 8);
    /* A desk's genuine file, as section 9 writes one; `spoil` changes a word after signing, `rev` its edition. */
    const deskAt = (name, o) => {
      const opt = o || {}, pair = opt.pair || crypto.generateKeyPairSync("ed25519");
      const raw = pair.publicKey.export({ type: "spki", format: "der" }).subarray(-32);
      const id = "k-" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
      const doc = Object.assign(goodCatalog(), { id: id + "-" + sha8("lamp-shop"), rev: opt.rev || 2, modified: true,
        grew: { id: "lamp-shop", rev: 1, sha: "sha256:" + "cd".repeat(32) }, desk: { id: id, name: name, key: raw.toString("hex"), box: "ef".repeat(32) } });
      doc.sig = { alg: "Ed25519", keyId: id };
      doc.sig.value = crypto.sign(null, Buffer.concat([Buffer.from("etiuda-desk-branch\n"), Buffer.from(V2.v2SignedBytes(doc))]), pair.privateKey).toString("hex");
      if (opt.spoil) doc.cards[0].title.en += "!";
      const dir = path.join(share, "desks", id);
      realFs.mkdirSync(dir, { recursive: true });
      realFs.writeFileSync(path.join(dir, "lamps-" + sha8("lamp-shop") + ".ec"), JSON.stringify(doc), "utf8");
      return { id, pair, name: "lamps-" + sha8("lamp-shop") + ".ec", doc };
    };
    const clock = fakeClock();
    const S = loadShell({ ready: true, clock: clock, desk: { eCatalogFolder: share } });
    const watches = [];
    S.ctl.watch = (real, dir, opts, fn) => { const w = new EventEmitter(); w.close = () => { w.closed = true; }; w.dir = dir;
      w.opts = typeof opts === "function" ? null : opts; w.fn = typeof opts === "function" ? opts : fn; watches.push(w); return w; };
    for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
    await new Promise(r => setTimeout(r, 40));
    const ala = deskAt("Ala"), bea = deskAt("Bea", { spoil: true });
    const got = await S.ask("etiuda:catalog-read", ala.name, ala.id);
    check(!!got && got.name === ala.name && JSON.parse(got.text || "{}").id === ala.doc.id,
      "86a a colleague's genuine file is read by its desk's folder, its text as written (" + (got ? JSON.parse(got.text || "{}").id : "none") + ")");
    const spoiled = await S.ask("etiuda:catalog-read", bea.name, bea.id);
    const wrongId = await S.ask("etiuda:catalog-read", ala.name, "k-zz");
    const up = await S.ask("etiuda:catalog-read", ala.name, "..");
    const top = await S.ask("etiuda:catalog-read", "lamps.ec");
    check(!!spoiled && spoiled.text === "" && wrongId === null && up === null && !!top && JSON.parse(top.text).id === "lamp-shop",
      "86A THE CONTROL: a desk file whose signature fails is handed as unreadable, a folder that is not a desk's id and a step out of desks/ are refused outright, and the folder's own file still reads by name alone ("
      + JSON.stringify([spoiled && spoiled.text.length, wrongId, up]) + ")");
    /* The watches the window armed: the share's own, and desks/ beneath it over its subfolders. */
    const onShare = watches.filter(w => w.dir === share), onDesks = watches.filter(w => w.dir === path.join(share, "desks"));
    check(onShare.length === 1 && onDesks.length === 1 && !!onDesks[0].opts && onDesks[0].opts.recursive === true,
      "86b desks/ has a watch of its own over its subfolders, beside the share's (" + onShare.length + " on the share, " + onDesks.length + " on desks/, recursive "
      + JSON.stringify(onDesks[0] && onDesks[0].opts) + ")");
    const listings = () => S.sent.filter(a => a[0] === "etiuda:catalog-listing").length;
    clock.fire(300);
    const before = listings();
    deskAt("Ala", { pair: ala.pair, rev: 3 });
    const deskWatch = onDesks[0] || { fn: () => {} };
    deskWatch.fn("change", path.join(ala.id, ala.name));
    const settles = clock.fire(300);
    const after = listings();
    check(settles === 1 && after === before + 1,
      "86c a colleague's file changing in desks/<id>/ reaches the page as the listing, sent once the folder settles (" + settles + " settle, listings " + before + " then " + after + ")");
    deskWatch.fn("change", path.join(ala.id, "notes.txt"));
    check(clock.fire(300) === 0,
      "86C THE CONTROL: a file under desks/ that is no catalog asks for nothing");
    /* A share with no desks/ when the window opened: the share's own watch sees it appear and arms the one beneath. */
    const late = path.join(LAB, "desks-late");
    realFs.mkdirSync(late, { recursive: true });
    realFs.writeFileSync(path.join(late, "lamps.ec"), JSON.stringify(goodCatalog()), "utf8");
    const S2 = loadShell({ ready: true, clock: fakeClock(), desk: { eCatalogFolder: late } });
    const w2 = [];
    S2.ctl.watch = (real, dir, opts, fn) => {
      if (dir === path.join(late, "desks") && !realFs.existsSync(dir)) throw Object.assign(new Error("no such folder"), { code: "ENOENT" });
      const w = new EventEmitter(); w.close = () => {}; w.dir = dir; w.fn = typeof opts === "function" ? opts : fn; w2.push(w); return w; };
    for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
    await new Promise(r => setTimeout(r, 40));
    const none = w2.filter(w => w.dir === path.join(late, "desks")).length;
    realFs.mkdirSync(path.join(late, "desks"));
    (w2.find(w => w.dir === late) || { fn: () => {} }).fn("rename", "desks");
    const armed = w2.filter(w => w.dir === path.join(late, "desks")).length;
    check(none === 0 && armed === 1,
      "86d a share with no desks/ at first is watched there once desks/ appears in it (" + none + " before, " + armed + " after)");
  }
  /* ---- 13. spelling on Linux comes from the package, before the window, and Windows is not touched ----
     The package's resources folder is planted (process.resourcesPath, which bare node does not have) with
     two files of invented bytes under the names the shell copies; the session records what it is asked. */
  {
    const NAMES = ["en-US-10-1.bdic", "pl-PL-3-0.bdic"];
    const RES = path.join(LAB, "resources"), DICT = path.join(RES, "dictionaries");
    realFs.mkdirSync(DICT, { recursive: true });
    NAMES.forEach((n, i) => realFs.writeFileSync(path.join(DICT, n), Buffer.from("planted dictionary " + i + " " + n)));
    const spelling = async (platform, extra) => {
      const order = [];
      const rec = k => (...a) => { order.push([k].concat(a)); };
      const sess = anything({ setSpellCheckerDictionaryDownloadURL: rec("url"), setSpellCheckerLanguages: rec("langs") });
      const platformWas = Object.getOwnPropertyDescriptor(process, "platform"), resWas = process.resourcesPath;
      let S;
      try {
        Object.defineProperty(process, "platform", { value: platform });
        process.resourcesPath = RES;
        S = loadShell(Object.assign({ ready: true, clock: fakeClock(), session: anything({ defaultSession: sess }), order }, extra || {}));
        for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
        await new Promise(r => setTimeout(r, 40));
      } finally {
        Object.defineProperty(process, "platform", platformWas);
        if (resWas === undefined) delete process.resourcesPath; else process.resourcesPath = resWas;
      }
      const into = path.join(S.UD, "Dictionaries");
      const copied = realFs.existsSync(into) ? realFs.readdirSync(into).sort() : [];
      return { S, order, into, copied, steps: order.map(o => o[0]) };
    };
    const same = (into, n) => { try { return realFs.readFileSync(path.join(into, n)).equals(realFs.readFileSync(path.join(DICT, n))); } catch { return false; } };
    const L = await spelling("linux");
    const url = (L.order.find(o => o[0] === "url") || [])[1] || "";
    const langs = (L.order.find(o => o[0] === "langs") || [])[1];
    check(url.startsWith("file://") && decodeURIComponent(url.slice("file://".length)) === DICT + "/" &&!/^https?:/.test(url) && JSON.stringify(langs) === '["en-US","pl"]'
      && JSON.stringify(L.steps.slice(0, 3)) === '["url","langs","window"]',
      "13a on Linux, before the window, the session's dictionary address is the package's own folder, which the loader"
      + " cannot fetch from, and its languages are English and Polish: " + JSON.stringify([url, langs, L.steps]));
    check(JSON.stringify(L.copied) === JSON.stringify(NAMES) && NAMES.every(n => same(L.into, n)),
      "13b the two files are copied byte for byte into the profile's Dictionaries folder under Chromium's own casing,"
      + " which is where it reads them: " + JSON.stringify(L.copied));
    let writes = 0;
    const again = await spelling("linux");
    realFs.writeFileSync(path.join(again.into, NAMES[1]), "a damaged copy");
    const before = realFs.readFileSync(path.join(again.into, NAMES[0]));
    const third = await (async () => {
      const resWas = process.resourcesPath;
      process.resourcesPath = RES;
      try {
        again.S.ctl.writeFileSync = (real, ...a) => { writes++; return real(...a); };
        return again.S.api.spellingFromPackage(anything());
      } finally { if (resWas === undefined) delete process.resourcesPath; else process.resourcesPath = resWas; }
    })();
    check(JSON.stringify(third) === JSON.stringify([NAMES[1]]) && writes === 1 && same(again.into, NAMES[1])
      && realFs.readFileSync(path.join(again.into, NAMES[0])).equals(before),
      "13c a start that finds a whole copy writes nothing for it, and a copy with other bytes is replaced: placed "
      + JSON.stringify(third) + " in " + writes + " write(s)");
    realFs.renameSync(DICT, DICT + "-away");
    const bare = await spelling("linux");
    realFs.renameSync(DICT + "-away", DICT);
    const saidNot = bare.S.said.filter(l => /the spelling dictionary .* was not placed: ENOENT/.test(l)).length;
    check(bare.copied.length === 0 && saidNot === 2 && JSON.stringify(bare.steps.slice(0, 3)) === '["url","langs","window"]',
      "13d a package without the files places nothing, says so once a file, and still gives the stopper and the languages"
      + " before the window: " + JSON.stringify([bare.copied, saidNot, bare.steps]));
    const W = await spelling("win32");
    check(W.steps.filter(k => k !== "window").length === 0 && W.copied.length === 0 && !realFs.existsSync(W.into),
      "13E CONTROL: on Windows the session is asked nothing about spelling and no Dictionaries folder is made: "
      + JSON.stringify(W.steps));
    const lower = await spelling("linux", { src: SRC.split('files: ["en-US-10-1.bdic", "pl-PL-3-0.bdic"]').join('files: ["en-us-10-1.bdic", "pl-pl-3-0.bdic"]') });
    check(SRC.split('files: ["en-US-10-1.bdic", "pl-PL-3-0.bdic"]').length === 2
      && !(JSON.stringify(lower.copied) === JSON.stringify(NAMES) && NAMES.every(n => same(lower.into, n))),
      "13B CONTROL: the shell copying under the lowercased names, the measured trap, fails 13b: " + JSON.stringify(lower.copied));
  }

  /* ---- 14. on Linux the keyring is asked for by name where Chromium would choose its own password ----
     Before ready Chromium names the desktop (base/nix/xdg_util.cc GetDesktopEnvironment) and picks its store from that
     (SelectBackend, key_storage_util_linux.cc): KDE 3, LXQt and a desktop it cannot name get "basic_text". 14a is the
     naming, case by case as the C++ reads it; 14b the switch where it is wanted and a keyring answers unlocked, 14c none
     where Chromium has a keyring, 14d none where the command line names a store, 14g none where no keyring answers
     unlocked; 14E the Windows control; 14F the shell without its one append. */
  {
    const P = loadShell().api;
    const named = [[{}, "OTHER"], [{ XDG_CURRENT_DESKTOP: "GNOME" }, "GNOME"], [{ XDG_CURRENT_DESKTOP: "ubuntu:GNOME" }, "GNOME"],
      [{ XDG_CURRENT_DESKTOP: "LXQt" }, "LXQT"], [{ XDG_CURRENT_DESKTOP: "MATE", DESKTOP_SESSION: "mate" }, "GNOME"],
      [{ XDG_CURRENT_DESKTOP: "MATE" }, "OTHER"], [{ XDG_CURRENT_DESKTOP: "KDE" }, "KDE4"],
      [{ XDG_CURRENT_DESKTOP: "KDE", KDE_SESSION_VERSION: "5" }, "KDE5"], [{ XDG_CURRENT_DESKTOP: "KDE", KDE_SESSION_VERSION: "6" }, "KDE6"],
      [{ XDG_CURRENT_DESKTOP: "Unity", DESKTOP_SESSION: "gnome-fallback-compiz" }, "GNOME"], [{ XDG_CURRENT_DESKTOP: "Unity" }, "UNITY"],
      [{ XDG_CURRENT_DESKTOP: "X-Cinnamon" }, "CINNAMON"], [{ XDG_CURRENT_DESKTOP: " XFCE " }, "XFCE"],
      [{ XDG_CURRENT_DESKTOP: "LXDE" }, "OTHER"], [{ XDG_CURRENT_DESKTOP: "sway" }, "OTHER"],
      [{ XDG_CURRENT_DESKTOP: "", DESKTOP_SESSION: "xubuntu" }, "XFCE"], [{ DESKTOP_SESSION: "kde" }, "KDE3"],
      [{ DESKTOP_SESSION: "kde", KDE_SESSION_VERSION: "5" }, "KDE4"], [{ KDE_FULL_SESSION: "true" }, "KDE3"],
      [{ GNOME_DESKTOP_SESSION_ID: "this-is-deprecated" }, "GNOME"], [{ XDG_CURRENT_DESKTOP: "COSMIC" }, "COSMIC"]];
    const wrong = named.filter(([env, want]) => !P.chromiumDesktop || P.chromiumDesktop(env) !== want);
    check(typeof P.chromiumDesktop === "function" && wrong.length === 0,
      "14a the shell names " + named.length + " desktops as Chromium's xdg_util.cc does, colon lists, DESKTOP_SESSION and the old"
      + " variables included: " + (wrong.length ? "wrong " + JSON.stringify(wrong.map(([e, w]) => [e, w, P.chromiumDesktop && P.chromiumDesktop(e)])) : "all right"));
    const platformWas = Object.getOwnPropertyDescriptor(process, "platform");
    const CLEAR = { XDG_CURRENT_DESKTOP: null, DESKTOP_SESSION: null, GNOME_DESKTOP_SESSION_ID: null, KDE_FULL_SESSION: null, KDE_SESSION_VERSION: null };
    const bus = (owner, alias, locked) => args => {
      if (args.indexOf("org.freedesktop.DBus.NameHasOwner") > -1) return "   boolean " + owner + "\n";
      if (args.indexOf("org.freedesktop.Secret.Service.ReadAlias") > -1) return "   " + alias + "\n";
      if (args.indexOf("org.freedesktop.DBus.Properties.Get") > -1) return "   variant       boolean " + locked + "\n";
      throw new Error("asked " + args.join(" "));
    };
    const RING = bus(true, "/org/freedesktop/secrets/collection/login", false);
    const as = (platform, env, o) => {
      Object.defineProperty(process, "platform", { value: platform });
      try { return loadShell(Object.assign({ env: Object.assign({}, CLEAR, env), bus: RING }, o || {})); }
      finally { Object.defineProperty(process, "platform", platformWas); }
    };
    const store = S => S.switches.filter(a => a[0] === "password-store").map(a => a.join("="));
    const told = S => S.said.filter(l => /keyring/.test(l));
    const SAID = "ERR etiuda: this desktop names no keyring Chromium knows, so the desk asks for one by name: --password-store=gnome-libsecret";
    const basic = [{}, { XDG_CURRENT_DESKTOP: "LXQt" }, { XDG_CURRENT_DESKTOP: "sway" }, { DESKTOP_SESSION: "kde" }];
    const asked = basic.map(env => as("linux", env));
    check(asked.every(S => JSON.stringify(store(S)) === '["password-store=gnome-libsecret"]' && JSON.stringify(told(S)) === JSON.stringify([SAID])),
      "14b on Linux where Chromium would pick basic_text (no desktop named, LXQt, one it cannot name, KDE 3), with a keyring answering"
      + " unlocked, the shell asks for libsecret before ready and says so once: " + JSON.stringify(asked.map(S => [store(S), told(S).length])));
    const kept = [{ XDG_CURRENT_DESKTOP: "GNOME" }, { XDG_CURRENT_DESKTOP: "ubuntu:GNOME" }, { XDG_CURRENT_DESKTOP: "KDE", KDE_SESSION_VERSION: "6" },
      { XDG_CURRENT_DESKTOP: "KDE", KDE_SESSION_VERSION: "5" }, { XDG_CURRENT_DESKTOP: "KDE" }, { XDG_CURRENT_DESKTOP: "X-Cinnamon" },
      { XDG_CURRENT_DESKTOP: "XFCE" }, { XDG_CURRENT_DESKTOP: "MATE", DESKTOP_SESSION: "mate" }, { XDG_CURRENT_DESKTOP: "Unity" },
      { XDG_CURRENT_DESKTOP: "Pantheon" }, { XDG_CURRENT_DESKTOP: "Deepin" }, { XDG_CURRENT_DESKTOP: "UKUI" }, { XDG_CURRENT_DESKTOP: "COSMIC" }]
      .map(env => as("linux", env));
    check(kept.every(S => store(S).length === 0 && told(S).length === 0 && S.busCalls.length === 0),
      "14c where Chromium names a keyring for the desktop (GNOME, KDE 4 to 6, Cinnamon, XFCE, MATE, Unity, Pantheon, Deepin, UKUI,"
      + " COSMIC) the shell changes nothing and asks the bus nothing, so a key sealed there stays open: "
      + JSON.stringify(kept.map(S => [store(S).length, S.busCalls.length])));
    const NONE = "ERR etiuda: this desktop names no keyring Chromium knows, and none answers unlocked on the session bus, so none is asked for";
    const deaf = [as("linux", { XDG_CURRENT_DESKTOP: "LXQt" }, { bus: bus(false, "/", true) }),
      as("linux", { XDG_CURRENT_DESKTOP: "LXQt" }, { bus: bus(true, "/", false) }),
      as("linux", { XDG_CURRENT_DESKTOP: "LXQt" }, { bus: bus(true, "/org/freedesktop/secrets/collection/login", true) }),
      as("linux", { XDG_CURRENT_DESKTOP: "LXQt" }, { bus: null })];
    check(deaf.every(S => store(S).length === 0 && JSON.stringify(told(S)) === JSON.stringify([NONE]))
      && deaf[0].busCalls.length === 1 && deaf[0].busCalls[0].indexOf("org.freedesktop.DBus.NameHasOwner") > -1,
      "14g on LXQt where no keyring answers unlocked (none running, where only its name is asked, so none is started; one"
      + " with no default collection; one locked; no bus at all) nothing is asked for and the shell says so: "
      + JSON.stringify(deaf.map(S => [store(S).length, S.busCalls.length])));
    const named2 = [as("linux", { XDG_CURRENT_DESKTOP: "LXQt" }, { onLine: ["password-store"] }),
      as("linux", { XDG_CURRENT_DESKTOP: "LXQt" }, { onLine: ["enable-encryption-selection"] })];
    check(named2.every(S => store(S).length === 0 && told(S).length === 0),
      "14d a store the command line names, or Chromium's own choice asked for, is left as given: " + JSON.stringify(named2.map(S => store(S))));
    const win = as("win32", {});
    check(JSON.stringify(win.switches) === '[["no-proxy-server"]]' && told(win).length === 0 && win.busCalls.length === 0,
      "14E CONTROL: on Windows, with no desktop named, the shell's switches are the proxy's alone, as before: " + JSON.stringify(win.switches));
    const APPEND = "app.commandLine.appendSwitch(...KEYRING_SWITCH);";
    const cut = as("linux", { XDG_CURRENT_DESKTOP: "LXQt" }, { src: SRC.split(APPEND).join("") });
    check(SRC.split(APPEND).length === 2 && store(cut).length === 0,
      "14F CONTROL: the same shell without its one append asks for no store on LXQt, so 14b can fail: " + JSON.stringify(store(cut)));
  }
} catch (e) {
  failed++;
  console.log("  FAIL " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
} finally {
  try { realFs.rmSync(LAB, { recursive: true, force: true }); } catch { /* a leftover in the temp folder */ }
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
