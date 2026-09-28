/* The shell under what an office desk meets, driven in bare node: the real shell/main.js with
 * electron stubbed and node:fs wrapped, so that a file another program is holding can be planted
 * where the shell writes, and a catalog the engine refuses where it reads. No window and no
 * browser: each load is a fresh evaluation of the file, and what the checks call is the file's
 * own functions and IPC handlers; the engine's half of a refusal is its own modules, imported.
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
const EXPECTED = 35;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = realFs.mkdtempSync(path.join(os.tmpdir(), "etiuda-shell-office-"));
const SRC = realFs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
/* The shell's own names, handed back by a line added after its source: nothing is exported from
   main.js, and a slice would test a copy of one function rather than the file as it runs. */
const EXPOSE = ["renamePatiently", "writeReplacing", "saveWindowPlace", "windowFile", "readCatalog", "channelHash",
  "SAMPLE_EDITIONS"];

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
/* opts.ready: app.whenReady resolves, so the shell boots as far as its window; opts.clock: the
   fake timers above; opts.desk: keys written into desk.json before the shell reads it. */
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
  const on = {}, invoke = {}, power = {}, sent = [];
  const wc = anything({ send: (...a) => { sent.push(a); }, id: 7 });
  const win = anything({ isDestroyed: () => false, webContents: wc });
  const electron = {
    app: { getPath: n => (n === "documents" ? DOCS : UD), setPath: noop, requestSingleInstanceLock: () => !!o.ready,
           quit: noop, on: noop, getVersion: () => "0.0.0",
           whenReady: () => (o.ready ? Promise.resolve() : new Promise(noop)) },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: o.ready ? new Proxy(function () {}, { construct: () => win,
      get: (t, k) => (k === "fromWebContents" ? () => win : k === "getAllWindows" ? () => [win] : undefined) }) : inert,
    Menu: inert, dialog: inert, net: inert, protocol: o.ready ? anything() : inert,
    session: o.ready ? anything() : inert,
    screen: inert, shell: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
    powerMonitor: { on: (ev, fn) => { power[ev] = fn; } },
  };
  const ctl = {};
  const fs = wrapFs(ctl);
  const clock = o.clock || { setTimeout: setTimeout, clearTimeout: clearTimeout };
  const fakeRequire = n => (n === "electron" ? electron : (n === "node:fs" || n === "fs") ? fs : nodeRequire(n));
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console", "setTimeout", "clearTimeout",
    SRC + "\nreturn { " + EXPOSE.map(n => n + ": typeof " + n + " === 'undefined' ? undefined : " + n).join(", ") + " };")(
    fakeRequire, path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet,
    clock.setTimeout, clock.clearTimeout);
  const ENGINE = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
  const ipc = (ch, ...args) => { const e = { sender: { id: 1, once: noop }, senderFrame: ENGINE, returnValue: undefined };
    if (on[ch]) on[ch](e, ...args); return e.returnValue; };
  const ask = (ch, ...args) => invoke[ch]({ sender: { id: 1 }, senderFrame: ENGINE }, ...args);
  return { api, ctl, said, ipc, ask, UD, DOCS, deskFile: path.join(UD, "desk.json"), power, sent, win };
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
    check(!!got && got.name === goodCatalog().name && calls.join() === "lamps-new.ec"
      && C.eCatalogRefusedNames().join() === "lamps-new.ec",
      "3a a handed catalog the engine refuses is named to the host once, and the next one it hands is the catalog read: "
      + (got ? got.name : "null") + ", host told " + calls.length + " time(s)");
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
    check(rows.length === 1 && rows[0].builtIn === false && rows[0].replaces === false && rows[0].sample === true,
      "5d the copy a first run gave is the one the Library lists, once, as a plain row: byte for byte the shipped copy,"
      + " it neither is the shipped one nor takes its place, and it is still known as the sample: "
      + JSON.stringify(rows.map(r => ({ builtIn: r.builtIn, replaces: r.replaces, sample: r.sample }))));
    const theirRows = (await theirs.S.ask("etiuda:catalog-files")).filter(f => f.name === SHIPPED[0]);
    check(theirRows.length === 1 && theirRows[0].builtIn === false && theirRows[0].replaces === true,
      "5f and a file of that name which differs from the shipped copy by one byte is listed once as taking its place: "
      + JSON.stringify(theirRows.map(r => ({ builtIn: r.builtIn, replaces: r.replaces }))));

    const crypto = nodeRequire("node:crypto");
    const editions = first.S.api.SAMPLE_EDITIONS || [];
    const known = SHIPPED.every(n => { const b = shippedBytes(n), h = crypto.createHash("sha256").update(b).digest("hex");
      return editions.some(x => x[0] === b.length && x[1] === h); });
    check(known, "5e every catalog the shell ships is an edition SAMPLE_EDITIONS names, so a copy of it keeps its place"
      + " at the foot of the list once the sample moves on: " + editions.length + " edition(s) listed");
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
