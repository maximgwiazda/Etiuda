/* The desk in a file: spec 11.4, driven in the shell and read off the disk.
 *
 *   node tests/desk.js
 *
 * WHAT IT PROVES, and how, because the how is where a storage test lies most easily.
 *
 * The node half slices migrateDesk out of shell/main.js the way tests/test.js slices
 * catalogPayload, and runs the migration engine on a table of its own. There is one schema so
 * far, so an empty table would prove nothing about the engine that walks it; giving it two
 * invented steps is what turns "migrations exist" into a claim with a verdict behind it. It
 * slices mergeDesk the same way: a save is a delta against what that load was handed, and the
 * four cases that rule has cannot be driven one at a time through a single window.
 *
 * The Electron half starts the real shell twice on a throwaway app in the temp folder, with its
 * user-data folder inside the throwaway, so no desk and no catalog of this machine is in reach.
 *
 *   run A  starts on a PLANTED desk file holding three 1.16.7 keys under the pb prefix. It
 *          proves the engine reads its desk from the file (the theme and the interface language
 *          those keys ask for are the ones on the screen), that D4's carry still runs when the
 *          store is a file (the e* copies and the e~carried marker are IN THE FILE afterwards,
 *          read off the disk by this process, not asked of the page), that a change made in the
 *          app reaches the file, and that the renderer's own localStorage is left empty, which
 *          is what "behind the same storage module" has to mean if the file is to be the desk.
 *          It also times the synchronous save, since lsSet now blocks on a disk write, and it
 *          reloads the document once: accepting a catalog reloads, and the load after a reload
 *          must be handed the desk as the disk holds it then rather than as it stood at start.
 *   run B  corrupts desk.json and starts again: the backup that run A rotated is read instead,
 *          and the corrupt file is still on disk rather than quietly replaced.
 *
 * Nothing here reads a card's text: the planted keys are settings, and the only catalog in the
 * throwaway app is the one this test writes, which holds a single card whose text it chose.
 *
 * Exit code is the number of failed checks, 78 where the run produced no verdict at all. The
 * app is killed in a finally, by pid and with /T so the helpers go, and the last check is that
 * the throwaway lab is really gone: a cleanup that is not a check is not a cleanup.
 */
"use strict";
const puppeteer = require("puppeteer-core");
const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PORT = 9423;
let child; let fails = 0; let checks = 0; let reachedEnd = false;
let offscreenAsked = false;
const t0 = Date.now();
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };

function electronExe() {
  const dir = path.join(E.ROOT, "node_modules", "electron");
  return path.join(dir, "dist", fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim());
}

/* ---- the node half: the migration engine, on a table of its own --------------------------- */

/* Sliced by counting braces from the marker, the way tests/test.js slices the shell's catalog
   reader. Its own copy rather than test.js's, because that one is not exported. */
function sliceDecl(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(marker + " is not in shell/main.js");
  let depth = 0, i = src.indexOf("{", at);
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(at, j + 1); }
  }
  throw new Error(marker + " does not close in shell/main.js");
}

function migrateDeskFn() {
  const src = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  const decls = 'const DESK_KIND = "etiuda-desk";\n' + sliceDecl(src, "function migrateDesk(");
  return new Function(decls + "\nreturn migrateDesk;")();
}

function mergeDeskFn() {
  const src = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  return new Function(sliceDecl(src, "function mergeDesk(") + "\nreturn mergeDesk;")();
}

/* One file, and a load is not its only writer: another load of the same document is handed the
   desk too, and this one's save must not undo what that one wrote. The rule is a delta against
   what the load was last given, and these are the four cases it has - kept, deleted, left alone
   and changed - on the sliced function, because a single window can only show one at a time. */
function mergeTests() {
  const mergeDesk = mergeDeskFn();
  const J = JSON.stringify;
  check(J(mergeDesk({ eA: "1", eB: "2" }, { eA: "1" }, { eA: "1", eC: "3" })) === J({ eA: "1", eB: "2", eC: "3" }),
    "a key this load never knew survives its save: eB is still in the desk beside the eC it added");
  check(J(mergeDesk({ eA: "1", eB: "2" }, { eA: "1", eB: "2" }, { eA: "1" })) === J({ eA: "1" }),
    "absence is still a deletion where the load HELD the key, so lsDel of eB takes it off the disk");
  check(J(mergeDesk({ eA: "9" }, { eA: "1" }, { eA: "1" })) === J({ eA: "9" }),
    "a value another load changed is not rolled back by a load that never touched that key");
  check(J(mergeDesk({ eA: "9" }, { eA: "1" }, { eA: "2" })) === J({ eA: "2" }),
    "a value this load did change wins, so a write is still a write");
}

function migrationTests() {
  const migrateDesk = migrateDeskFn();
  const desk = (schema, keys) => ({ kind: "etiuda-desk", schema, keys });
  /* Two steps that a later Etiuda might plausibly need: a key renamed, then a key dropped. */
  const table = {
    1: k => { const o = Object.assign({}, k); o.eTheme = o.pbTheme; delete o.pbTheme; return o; },
    2: k => { const o = Object.assign({}, k); delete o.eGone; return o; },
  };
  const at1 = desk(1, { pbTheme: "dark", eGone: "1", eLang: "pl" });

  check(JSON.stringify(migrateDesk(at1, table, 1)) === JSON.stringify({ pbTheme: "dark", eGone: "1", eLang: "pl" }),
    "a desk already at the target schema is passed through untouched");
  check(JSON.stringify(migrateDesk(at1, table, 3)) === JSON.stringify({ eGone: "1", eLang: "pl", eTheme: "dark" })
    || JSON.stringify(migrateDesk(at1, table, 3)) === JSON.stringify({ eLang: "pl", eTheme: "dark" }),
    "two migrations run in order, 1 to 3, and the second sees the first's output");
  check(migrateDesk(at1, table, 3).eGone === undefined && migrateDesk(at1, table, 3).eTheme === "dark",
    "the renamed key arrived and the dropped key is gone");
  check(migrateDesk(desk(4, { a: "1" }), table, 3) === null,
    "a desk written by a LATER Etiuda is refused rather than downgraded");
  check(migrateDesk(desk(1, { a: "1" }), {}, 3) === null,
    "a gap in the table is refused rather than skipped over");
  check(migrateDesk({ kind: "something-else", schema: 1, keys: {} }, table, 1) === null
    && migrateDesk({ schema: 1, keys: {} }, table, 1) === null
    && migrateDesk(null, table, 1) === null,
    "a file that is not a desk is refused, by kind and by absence");
  check(migrateDesk(desk("1", { a: "1" }), table, 1) === null && migrateDesk(desk(1.5, {}), table, 1) === null,
    "a schema that is not a whole number is refused, a numeric string included");
  const mixed = migrateDesk(desk(1, { a: "1", b: 2, c: null, d: { e: 1 } }), table, 1);
  check(JSON.stringify(mixed) === JSON.stringify({ a: "1" }),
    "a desk is text: a number, a null and an object are dropped, 1 of 4 kept");
}

/* ---- the Electron half -------------------------------------------------------------------- */

const PLANTED = { pbTheme: "dark", pbUiLang: "pl", pbGlassOff: "1" };

function buildApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-"));
  fs.mkdirSync(path.join(dir, "shell"));
  fs.mkdirSync(path.join(dir, "engine"));
  fs.mkdirSync(path.join(dir, "userdata"), { recursive: true });
  for (const f of ["main.js", "preload.js"])
    fs.copyFileSync(path.join(E.ROOT, "shell", f), path.join(dir, "shell", f));
  fs.writeFileSync(path.join(dir, "package.json"),
    JSON.stringify({ name: "etiuda-desk-probe", version: "0.0.0", main: "shell/main.js" }), "utf8");
  fs.copyFileSync(path.join(E.ROOT, "engine", "etiuda.html"), path.join(dir, "engine", "etiuda.html"));
  /* The pin travels with the artefact or the shell serves script-src 'none' and nothing boots,
     which is how this test found out that it had been left behind. */
  fs.copyFileSync(path.join(E.ROOT, "engine", "etiuda.csp.json"), path.join(dir, "engine", "etiuda.csp.json"));
  return dir;
}

const APP = buildApp();
/* The shell's own default when no --user-data-dir is given would be this machine's %APPDATA%.
   It is given one inside the throwaway, and this is the path the desk must appear at. */
const UD = path.join(APP, "userdata");
/* Away from Documents/Etiuda, which on a desk holds a live catalog: see E.pinCatalogFolder. */
E.pinCatalogFolder(UD, path.join(APP, "catalogs"));
const DESK = path.join(UD, "desk.json");
const BAK1 = path.join(UD, "desk.bak1.json");

function writePlantedDesk(keys) {
  fs.writeFileSync(DESK, JSON.stringify({ kind: "etiuda-desk", schema: 1, app: "planted", saved: "2026-09-14T00:00:00.000Z", keys }), "utf8");
  /* A plant writes the desk WHOLE and would drop the pin with it, and an unpinned launch reads
     Documents/Etiuda, which on a desk holds a live catalog. Put back after every plant. */
  E.pinCatalogFolder(UD, path.join(APP, "catalogs"));
}
function deskOnDisk(file) {
  return JSON.parse(fs.readFileSync(file || DESK, "utf8"));
}

async function startShell() {
  /* OFF SCREEN, board item 385: nothing in this file measures the window, so no launch of it has
     any business taking the screen. E.offscreenEnv() is the one place the flag is set. */
  child = spawn(electronExe(), [APP, "--remote-debugging-port=" + PORT, "--user-data-dir=" + UD],
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv() });
  const said = [];
  child.stdout.on("data", d => said.push(String(d).trim()));
  child.stderr.on("data", d => said.push(String(d).trim()));
  let b;
  for (let i = 0; i < 40 && !b; i++) {
    await sleep(500);
    try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + PORT, defaultViewport: null }); } catch (x) {}
  }
  if (!b) throw new Error("Electron did not answer on the debugging port within 20 s");
  const p = (await b.pages())[0];
  await sleep(3000);
  /* Asked once, of this file's own first launch, and asked of the machine rather than of the
     variable: what the environment carried is not evidence that a window stayed off the screen.
     A helper that cannot look answers measured:false and this reddens. */
  if (!offscreenAsked) {
    offscreenAsked = true;
    const v = E.offscreenVerdict(child.pid, "tests/desk.js");
    check(v.ok, v.what);
  }
  return { b, p, said };
}

/* By pid and with /T, so the helpers go and nothing outside this run is touched: /IM would
   reach another seat's Electron or a copy somebody is using. */
function stopShell(b) {
  try { if (b) b.disconnect(); } catch (x) {}
  try { if (child && child.pid) execSync("taskkill /F /PID " + child.pid + " /T", { stdio: "ignore" }); } catch (x) {}
  try { if (child) child.kill(); } catch (x) {}
  child = null;
}

(async () => {
  migrationTests();
  mergeTests();

  /* ---- run A: a planted 1.16.7 desk ---- */
  writePlantedDesk(PLANTED);
  const plantedText = fs.readFileSync(DESK, "utf8");
  let s = await startShell();

  const seen = await s.p.evaluate(() => ({
    theme: document.documentElement.dataset.theme || null,
    lang: document.documentElement.getAttribute("lang") || null,
    glassOff: document.body.classList.contains("glass-off") || document.documentElement.classList.contains("glass-off"),
    lsKeys: Object.keys(window.localStorage).length,
    lsEKeys: Object.keys(window.localStorage).filter(k => /^e[A-Z]/.test(k)).length,
    box: [window.innerWidth, window.innerHeight, window.outerWidth, window.outerHeight, window.devicePixelRatio],
  }));

  /* The boot guard restores the header's shape from eHdrPills only when the width it was saved
     at is the width now, so a page driven at a width nobody uses is a different document.
     puppeteer.connect() emulates 800x600 at devicePixelRatio 1 unless it is given
     defaultViewport: null; the gap between the page's box and the window's outer box is what
     tells the two apart on any machine, 14 by 7 here against 496 by 289 emulated, measured both
     ways on 2026-09-14. */
  check(seen.box[2] - seen.box[0] < 100 && seen.box[3] - seen.box[1] < 100,
    "the page is read at the window's own size, inner " + seen.box[0] + "x" + seen.box[1]
    + " in an outer " + seen.box[2] + "x" + seen.box[3] + " at devicePixelRatio " + seen.box[4]
    + ", and not at puppeteer's emulated 800x600");

  check(seen.theme === "dark",
    "the desk file decided the theme, which is 'dark' as the planted pbTheme asked (read from the document element)");
  check(seen.lang === "pl",
    "the desk file decided the interface language, 'pl' from the planted pbUiLang (the document's lang attribute)");

  const afterCarry = deskOnDisk();
  check(afterCarry.kind === "etiuda-desk" && afterCarry.schema === 1 && typeof afterCarry.saved === "string",
    "the shell rewrote the desk in its own envelope (kind " + afterCarry.kind + ", schema " + afterCarry.schema + ")");
  const k = afterCarry.keys || {};
  check(k.eTheme === "dark" && k.eUiLang === "pl" && k.eGlassOff === "1",
    "D4's carry ran against the FILE: all three pb keys have e copies on disk"
    + " (eTheme " + k.eTheme + ", eUiLang " + k.eUiLang + ", eGlassOff " + k.eGlassOff + ")");
  check(k.pbTheme === "dark" && k.pbUiLang === "pl" && k.pbGlassOff === "1",
    "the 1.16.7 keys were COPIED and not moved, so a 1.x engine on the same desk still finds them");
  check(k["e~carried"] === "1",
    "the carry marker is in the file, so a second run will not carry again");

  check(seen.lsKeys === 0 && seen.lsEKeys === 0,
    "the renderer's own localStorage is empty, " + seen.lsKeys + " keys, so the file is the whole desk");

  /* A write driven through the engine's own button rather than through storage.js, so what is
     proved is the path a person takes. The theme button is the shortest one there is. */
  const timing = await s.p.evaluate(() => {
    const b = document.querySelector("#theme");
    if (b) b.click();
    const t = performance.now();
    for (let i = 0; i < 20; i++) window.lsSet("eDeskProbe", "v" + i);
    return { ms: (performance.now() - t) / 20, clicked: !!b, theme: document.documentElement.dataset.theme };
  });
  await sleep(600);
  const afterWrite = deskOnDisk().keys || {};
  check(afterWrite.eDeskProbe === "v19",
    "a value written through lsSet is on the disk by the time lsSet returns (eDeskProbe " + afterWrite.eDeskProbe + ")");
  check(timing.clicked && afterWrite.eTheme === timing.theme && timing.theme !== "dark",
    "the theme button's own write reached the file too (" + afterWrite.eTheme + " on disk, " + timing.theme + " on screen)");
  console.log("       a synchronous desk save costs " + timing.ms.toFixed(2)
    + " ms per key, mean of 20 writes over a " + Buffer.byteLength(JSON.stringify(afterWrite), "utf8") + " byte desk");

  /* 202 bytes is not the question a synchronous save has to answer: a desk that has taken a
     catalog is hundreds of kilobytes, and that is the write a person waits for. Driven with a
     value of that size rather than reasoned about, and gated loosely, so a regression from
     milliseconds to seconds fails while a slow machine does not. */
  const big = await s.p.evaluate(() => {
    const v = "x".repeat(600 * 1024);
    const t = performance.now();
    const ok = window.lsSet("eDeskBig", v);
    return { ms: performance.now() - t, ok };
  });
  await sleep(400);
  const bigOnDisk = fs.statSync(DESK).size;
  check(big.ok && bigOnDisk > 600 * 1024 && big.ms < 250,
    "one 600 KB value saved synchronously in " + big.ms.toFixed(1) + " ms, desk now "
    + bigOnDisk + " bytes on disk (the gate is 250 ms)");
  await s.p.evaluate(() => window.lsDel("eDeskBig"));
  await sleep(400);

  check(fs.existsSync(BAK1) && fs.readFileSync(BAK1, "utf8") === plantedText,
    "the first write of the run rotated the desk it found into desk.bak1.json, byte for byte");
  check(!fs.existsSync(DESK + ".tmp"),
    "no temp file is left behind, so the write is a rename and not a truncate");

  /* The reload, which is what accepting a catalog does: a second load handed the desk as it
     stood at app START rewrites the file from that, and the key written in between is gone.
     Board item 356. Driven here as well as in shell-smoke because this is the cheap instrument
     and the fault was out of its reach until it reloaded. */
  await s.p.evaluate(() => window.lsSet("eBeforeReload", "kept"));
  await sleep(500);
  const beforeReload = deskOnDisk().keys || {};
  await s.p.reload({ waitUntil: "load" });
  await sleep(2500);
  const across = await s.p.evaluate(() => ({
    witness: window.lsGet("eBeforeReload"),
    handed: Object.keys(JSON.parse(window.E_HOST.deskRead() || "{}")).length,
  }));
  await s.p.evaluate(() => window.lsSet("eAfterReload", "also"));
  await sleep(500);
  const both = deskOnDisk().keys || {};
  check(beforeReload.eBeforeReload === "kept" && across.witness === "kept",
    "a key written before an in-app reload is the engine's again after it: on disk before "
    + JSON.stringify(beforeReload.eBeforeReload) + ", lsGet after " + JSON.stringify(across.witness)
    + ", and the host handed the second load " + across.handed + " keys");
  check(both.eBeforeReload === "kept" && both.eAfterReload === "also",
    "and the second load's own write does not take it back out of the file: eBeforeReload "
    + JSON.stringify(both.eBeforeReload) + ", eAfterReload " + JSON.stringify(both.eAfterReload));

  const deskIdRe = /^[a-z0-9][a-z0-9-]{2,63}$/;
  const idBefore = deskOnDisk().desk;
  check(typeof idBefore === "string" && deskIdRe.test(idBefore),
    "the desk has one id in desk.json after first use (" + JSON.stringify(idBefore) + ")");
  await s.p.evaluate(() => window.lsSet("eDeskIdProbe", "1"));
  await sleep(400);
  const idAfter = deskOnDisk().desk;
  check(typeof idAfter === "string" && deskIdRe.test(idAfter) && idAfter === idBefore,
    "a later write on the same folder keeps that id (" + JSON.stringify(idAfter) + ")");

  stopShell(s.b);
  await sleep(1500);

  /* ---- run B: a corrupt desk, and the backup behind it ---- */
  const CORRUPT = "{ this is not json";
  fs.writeFileSync(DESK, CORRUPT, "utf8");
  s = await startShell();
  const recovered = await s.p.evaluate(() => ({
    theme: document.documentElement.dataset.theme || null,
    carried: !!window.lsGet("e~carried"),
  }));
  check(s.said.some(l => /is not a desk this version can read/.test(l))
    && s.said.some(l => /desk read from .*desk\.bak1\.json/.test(l)),
    "the corrupt desk.json was refused by name and desk.bak1.json was read instead");
  /* The backup is the desk as run A FOUND it, which is the planted 1.16.7 file with no marker
     in it, so the carry runs a second time and the theme comes back through pbTheme. */
  check(recovered.theme === "dark" && recovered.carried,
    "the backup's desk is in effect: theme " + recovered.theme + " from its pb keys, carried again "
    + recovered.carried + " because the marker was not in it either");

  await s.p.evaluate(() => window.lsSet("eDeskProbe2", "landed"));
  await sleep(500);
  const rebuilt = deskOnDisk();
  check(rebuilt.keys.eDeskProbe2 === "landed" && rebuilt.keys.eTheme === "dark",
    "the first write of the recovered run rebuilt desk.json from the backup's keys plus the new one");
  check(fs.readFileSync(BAK1, "utf8") === CORRUPT
    && JSON.parse(fs.readFileSync(path.join(UD, "desk.bak2.json"), "utf8")).kind === "etiuda-desk",
    "the corrupt file was rotated into desk.bak1.json rather than deleted, and the readable backup moved down to desk.bak2.json");
  stopShell(s.b);

  reachedEnd = true;
})().catch(e => {
  console.error("  FAIL " + String(e && e.stack || e));
  fails++;
}).finally(() => {
  stopShell();
  /* The lab holds a Chromium profile, and Windows keeps a handle on one for a moment after the
     process that held it is gone. E.removeLab retries and then says whether the folder is
     actually gone, and that answer is a CHECK: a swallowed catch here is how one of these came
     to be sitting in %TEMP% on 2026-09-14. */
  check(E.removeLab(APP), "the throwaway app is gone from the temp folder: " + APP);
  console.log((reachedEnd ? "" : "  INCOMPLETE - ") + checks + " check(s), " + fails
    + " failed, " + Math.round((Date.now() - t0) / 1000) + "s");
  process.exit(reachedEnd ? fails : (fails || E.NO_VERDICT));
});
