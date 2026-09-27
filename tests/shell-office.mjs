/* The shell under what an office desk meets, driven in bare node: the real shell/main.js with
 * electron stubbed and node:fs wrapped, so that a file another program is holding can be planted
 * where the shell writes. No window and no browser: each load is a fresh evaluation of the file,
 * and what the checks call is the file's own functions and IPC handlers.
 *
 *   node tests/shell-office.mjs        exit code is the number of failed checks, capped at 63
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import realFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 6;

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
const EXPOSE = ["renamePatiently", "writeReplacing", "saveWindowPlace", "windowFile"];

/* node:fs with a hook per call: `ctl.renameSync = (real, ...args) => ...` decides that call,
   and a call without a hook goes to the real one. */
const HOOKED = ["renameSync"];
function wrapFs(ctl) {
  const f = Object.create(realFs);
  HOOKED.forEach(n => { f[n] = (...a) => (ctl[n] ? ctl[n](realFs[n].bind(realFs), ...a) : realFs[n](...a)); });
  return f;
}
function busy(code) { const e = new Error(code + ": the file is held by another program"); e.code = code; return e; }

let loads = 0;
function loadShell() {
  const dir = path.join(LAB, "load" + (++loads));
  const UD = path.join(dir, "user-data"), DOCS = path.join(dir, "documents");
  realFs.mkdirSync(UD, { recursive: true });
  realFs.mkdirSync(DOCS, { recursive: true });
  const said = [];
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: () => {} };
  const noop = () => {};
  const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
  const on = {}, invoke = {};
  const electron = {
    app: { getPath: n => (n === "documents" ? DOCS : UD), setPath: noop, requestSingleInstanceLock: () => false,
           quit: noop, on: noop, getVersion: () => "0.0.0", whenReady: () => new Promise(noop) },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert,
    screen: inert, shell: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
  };
  const ctl = {};
  const fs = wrapFs(ctl);
  const fakeRequire = n => (n === "electron" ? electron : (n === "node:fs" || n === "fs") ? fs : nodeRequire(n));
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    SRC + "\nreturn { " + EXPOSE.map(n => n + ": typeof " + n + " === 'undefined' ? undefined : " + n).join(", ") + " };")(
    fakeRequire, path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet);
  const ENGINE = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
  const ipc = (ch, ...args) => { const e = { sender: { id: 1, once: noop }, senderFrame: ENGINE, returnValue: undefined };
    on[ch](e, ...args); return e.returnValue; };
  return { api, ctl, said, ipc, UD, DOCS, deskFile: path.join(UD, "desk.json") };
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
