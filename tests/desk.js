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
 *   run E  types a customer's name and a search into two tabs, quits, and reads EVERY file of the profile
 *          for both, byte for byte in UTF-8 and UTF-16LE; then again after a kill, and after a launch
 *          over a Session Storage folder an older build left. The control is a copy of the shell with
 *          the two changes cut out, and it must show the plants where the shipped shell shows none.
 *   runs C and D  each start on a profile of their own, idle, close cleanly and are read from the
 *          Chromium net log they wrote. C is the shell with its proxy switch cut out and must show
 *          proxy discovery, or D's silence means nothing and is NOT RUN; D is the shipped shell and
 *          must show none.
 *
 * Nothing here reads a card's text: the planted keys are settings, and the only catalog in the
 * throwaway app is the one this test writes, which holds a single card whose text it chose.
 *
 * Exit code is the number of failed checks, capped at 63 (E.exitOf), 78 where the run produced no verdict: it did not
 * finish, a leg was NOT RUN with nothing failed, or another Electron run was live and it refused to start. The
 * app is killed in a finally, by pid and with /T so the helpers go, and the last check is that
 * the throwaway lab is really gone: a cleanup that is not a check is not a cleanup.
 */
"use strict";
const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* IN THE MERGE GATES SINCE BOARD 820 (2026-09-29), so it keeps the house's two rules for a run that
   starts windows: never beside another Electron run, and below normal. Until then it ran only in
   tools/release.mjs's shell gate, and a failure sat on main from the desk-next merge until a read
   found it. The priority is this process's, which the Electron browser process inherits; the
   renderer and GPU processes are lowered by pid after each launch (E.lowerTree). */
const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

/* THE PORT BLOCK AND THE LEASE, board item 628. A fixed debugging port is not a failed
   connect: two concurrent runs of tests/csp.js at 9422 were measured on 2026-09-20 reading ONE
   Electron, and the run that was there FIRST went red counting three inline refusals of two and
   four sibling refusals of two. The base comes from the table in tests/engine.js, which is
   checked for overlaps at every call, and the block is leased by its base where the run was
   given a lease command, at load, before anything is built. */
const PORT = E.portBlock("desk");
/* After the port block, so a refused shift is refused whatever else is live (engine-selftest 27f, 27g). */
E.refuseWhileElectronLive("tests/desk.js");
const LEASED = E.takeLeases(["ports:" + PORT], 20, "tests/desk.js");
console.log("       debugging port(s) count up from " + PORT
  + (process.env.ETIUDA_PORT_SHIFT ? " (ETIUDA_PORT_SHIFT " + process.env.ETIUDA_PORT_SHIFT + ")"
                                   : " (the port table's own number)")
  + "; leases: " + LEASED.said);
let child; let fails = 0; let checks = 0; let reachedEnd = false;
let offscreenAsked = false;
const notRun = [];
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

function buildApp(into) {
  const dir = into || fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-"));
  fs.mkdirSync(path.join(dir, "shell"), { recursive: true });
  fs.mkdirSync(path.join(dir, "engine"), { recursive: true });
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
const LABDOCS = path.join(APP, "documents");
fs.mkdirSync(LABDOCS, { recursive: true });
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

async function startShell(appDir, ud) {
  /* OFF SCREEN, board item 385: nothing in this file measures the window, so no launch of it has
     any business taking the screen. E.offscreenEnv() is the one place the flag is set.

     AND THE DOCUMENTS FOLDER IS THE LAB'S, board item 467. The pin in desk.json confines the
     catalog folder for every launch here but one: run B plants a CORRUPT desk.json on purpose,
     so the pin cannot be in it and cannot be in the backup either without changing what that
     stage is about. Until this was written that launch read this machine's own Documents. The
     redirect is handed to every launch rather than to that one, because a confinement that has
     to be remembered at one call site is the shape of the fault board 467 is about. */
  child = E.shellLaunch("tests/desk.js", electronExe(),
    [appDir || APP, "--remote-debugging-port=" + PORT, "--user-data-dir=" + (ud || UD)],
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: LABDOCS }) });
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
  lowered("the window", child.pid);
  await sleep(3000);
  /* Asked once, of this file's own first launch, and asked of the machine rather than of the
     variable: what the environment carried is not evidence that a window stayed off the screen.
     A helper that cannot look answers measured:false and this reddens. */
  if (!offscreenAsked) {
    offscreenAsked = true;
    /* Board items 613 and 628: off Windows the helper was never able to look, so this is a NOT
       RUN line rather than a failed check, and it is COUNTED as one - a run one check shorter
       than the same run on Windows must not read as the same green. */
    E.offscreenCheck(child.pid, "tests/desk.js", check, notRun);
  }
  return { b, p, said };
}

/* Said on one line per launch, and not a check: it is how this run treats the machine, not a claim
   about the product. A process that would not go below normal is named. */
function lowered(what, pid) {
  const t = E.lowerTree(pid);
  console.log("       " + what + ": " + (t.asked ? t.below + " of " + t.n + " Electron process(es) at below-normal priority"
    + (t.other.length ? ", not: " + t.other.join(", ") : "") : "priority not lowered, " + (t.why || "not Windows")));
}

/* By pid and with /T, so the helpers go and nothing outside this run is touched: /IM would
   reach another seat's Electron or a copy somebody is using. */
function stopShell(b) {
  try { if (b) b.disconnect(); } catch (x) {}
  E.killTree(child && child.pid);
  try { if (child) child.kill(); } catch (x) {}
  child = null;
}

/* A NET LOG IS WRITTEN OUT AT A CLEAN EXIT, NOT BEFORE: a window that is killed leaves a header over
   an empty list, and an empty list reads like a quiet start. So the log must parse whole, and the
   window is closed by Browser.close, which lets Chromium finish it. */
function readNetLog(file) {
  let raw = "";
  try { raw = fs.readFileSync(file, "utf8"); } catch { return null; }
  let doc = null, closed = false;
  try { doc = JSON.parse(raw); closed = true; }
  catch { try { doc = JSON.parse(raw.replace(/,\s*$/, "") + "]}"); } catch { doc = null; } }
  if (!doc || !doc.constants || !doc.constants.logEventTypes || !Array.isArray(doc.events)) return null;
  const T = {};
  for (const k of Object.keys(doc.constants.logEventTypes)) T[doc.constants.logEventTypes[k]] = k;
  const hosts = new Set();
  let pac = 0, ipv6 = 0;
  for (const ev of doc.events) {
    const name = T[ev.type] || "";
    if (name.indexOf("PAC_FILE_DECIDER") >= 0) pac++;
    if (name === "HOST_RESOLVER_MANAGER_IPV6_REACHABILITY_CHECK") ipv6++;
    if (ev.params && ev.params.host) hosts.add(String(ev.params.host));
  }
  return { closed, events: doc.events.length, hosts: [...hosts], pac, ipv6,
           wpad: [...hosts].some(h => /wpad/i.test(h)) };
}

/* One window of a net-log arm: launch the app on a profile of its own, idle, close the way a person
   does, wait for the process to end by itself, and only then read the file. */
async function netLogArm(appDir, ud, logAt) {
  E.pinCatalogFolder(ud, path.join(APP, "catalogs"));
  child = E.shellLaunch("tests/desk.js net log", electronExe(),
    [appDir, "--remote-debugging-port=" + PORT, "--user-data-dir=" + ud, "--log-net-log=" + logAt],
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: LABDOCS }) });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  let b;
  for (let i = 0; i < 40 && !b; i++) {
    await sleep(500);
    try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + PORT, defaultViewport: null }); } catch (x) {}
  }
  if (!b) throw new Error("Electron did not answer on the debugging port within 20 s");
  lowered("a net-log arm", child.pid);
  await sleep(4500);
  const gone = new Promise(r => { if (child.exitCode !== null) r(true); else child.once("exit", () => r(true)); });
  try { await b.close(); } catch (x) { /* judged by the exit below */ }
  const exitedAlone = await Promise.race([gone, sleep(15000).then(() => false)]);
  stopShell(b);
  await sleep(1500);
  return { log: readNetLog(logAt), exitedAlone };
}

/* ---- what a tab held is not left in the profile ------------------------------------------- */

/* A tab holds a customer's name and the search text. The second name has letters outside Latin-1, which
   Chromium stores as UTF-16 where a plain one is stored a byte to a letter. */
const TAB_NAME = "Zygfryd Wzorcowy-Probe", TAB_SEARCH = "lampiony-rozowe-77";
const TAB_NAME_PL = "\u017Baneta Pr\u00F3bna-Wzorcowa", STALE_PLANT = "Resztkowy-Slad-Sprzed-Zmiany";

/* THE SCAN IS BYTE FOR BYTE, IN BOTH ENCODINGS Chromium's storage keeps a string in. A file that cannot be
   read and is not empty is counted and fails the check, never skipped: a scan that passed over what it
   could not open would read exactly like a clean profile. Empty files (the LOCKs) hold nothing. */
function planted(extra) {
  const out = [];
  for (const [lab, str] of [["name", TAB_NAME], ["search", TAB_SEARCH], ["name-pl", TAB_NAME_PL]].concat(extra || [])) {
    out.push([lab + " as UTF-8", Buffer.from(str, "utf8")]);
    out.push([lab + " as UTF-16LE", Buffer.from(str, "utf16le")]);
  }
  return out;
}
function scanFolder(dir, extra) {
  const hits = [], unread = [], files = [];
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f); else files.push(f);
    }
  };
  walk(dir);
  const needles = planted(extra);
  for (const f of files) {
    let b;
    try { b = fs.readFileSync(f); } catch (x) { if (fs.statSync(f).size > 0) unread.push(path.relative(dir, f)); continue; }
    for (const [lab, n] of needles)
      if (b.indexOf(n) >= 0) hits.push(path.relative(dir, f).split(path.sep).join("/") + " holds " + lab);
  }
  return { files: files.length, unread, hits };
}
const said_ = r => r.files + " file(s) read, " + r.unread.length + " unreadable and not empty"
  + (r.hits.length ? ", found: " + r.hits.join("; ") : ", nothing found");

async function typeInto(p, sel, text) {
  await p.evaluate(q => document.querySelector(q).focus(), sel);
  await p.keyboard.sendCharacter(text);
  await sleep(700);
}
/* Read through the engine's own storage route, so one line answers for a desk that keeps the session
   in the shell and for the control that leaves it in Chromium's. */
const tabsHeld = p => p.evaluate(() => {
  try { return JSON.parse(window.ssGet("eSessionTabs") || "null"); } catch (e) { return null; }
});
async function typeTwoTabs(p) {
  await typeInto(p, "#pax", TAB_NAME);
  await typeInto(p, "#intent", TAB_SEARCH);
  await p.evaluate(() => document.querySelector(".tab-add").click());
  await sleep(700);
  await typeInto(p, "#pax", TAB_NAME_PL);
}
async function quitCleanly(s) {
  const gone = new Promise(r => { if (child.exitCode !== null) r(true); else child.once("exit", () => r(true)); });
  try { await s.b.close(); } catch (x) { /* judged by the exit below */ }
  const t = Date.now();
  const alone = await Promise.race([gone, sleep(30000).then(() => false)]);
  console.log("       the window's process " + (alone ? "ended by itself" : "did not end") + " " + (Date.now() - t) + " ms after the close");
  stopShell(s.b);
  await sleep(1500);
  return alone;
}
async function startOn(appDir, ud) {
  E.pinCatalogFolder(ud, path.join(APP, "catalogs"));
  return startShell(appDir, ud);
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

  /* THE THEME IS STORED BEFORE THE FADE ENDS, BY ORDER AND NOT BY A CLOCK (board 820). theme.js
     promises "stored as the fade begins", because under the shell the write turns the window's
     material and the material cannot fade. A window nobody sees paints about once a second, so no
     time bound here could tell a slow product from a slow paint; the order can. The page's own
     startViewTransition is wrapped before the press, and when the fade's `finished` settles the
     desk FILE is read at that moment: through the host's synchronous deskRead, which main answers
     with a fresh read of desk.json, and which is ordered after every message the page sent before
     it, so a write sent before the fade ended is on the disk by the time the read is answered.
     The reload leg below reads through the same call. A write moved to `finished`, or delayed past
     the frame on which this window ends the fade, about a second here, reads the old theme here while the leg after this one, which
     waits for the file, still goes green. */
  await s.p.evaluate(() => {
    const o = window.__deskThemeOrder = { fades: 0, atFinished: [], err: "" };
    const start = document.startViewTransition;
    if (typeof start !== "function") { o.err = "this page has no startViewTransition"; return; }
    document.startViewTransition = function (cb) {
      const vt = start.call(document, cb);
      o.fades++;
      vt.finished.then(() => {
        try { o.atFinished.push(JSON.parse(window.E_HOST.deskRead() || "{}").eTheme || null); }
        catch (e) { o.err = "the desk could not be read at finished: " + String(e && e.message || e); }
      }, e => { o.err = "finished rejected: " + String(e && e.message || e); });
      return vt;
    };
  });

  /* A write driven through the engine's own button rather than through storage.js, so what is
     proved is the path a person takes. The theme button is the shortest one there is. */
  const timing = await s.p.evaluate(() => {
    const b = document.querySelector("#theme");
    if (b) b.click();
    const t = performance.now();
    for (let i = 0; i < 20; i++) window.lsSet("eDeskProbe", "v" + i);
    return { ms: (performance.now() - t) / 20, clicked: !!b };
  });
  await sleep(600);
  const afterWrite = deskOnDisk().keys || {};
  check(afterWrite.eDeskProbe === "v19",
    "a value written through lsSet is on the disk by the time lsSet returns (eDeskProbe " + afterWrite.eDeskProbe + ")");
  /* The flip is a view transition and a window nobody sees paints about once a second, so the
     palette lands and eTheme is stored one to two seconds after the press: wait on the file. */
  let themed = afterWrite;
  for (let i = 0; i < 40 && themed.eTheme === "dark"; i++) {
    await sleep(250);
    try { themed = deskOnDisk().keys || {}; } catch (x) {}
  }
  const shown = await s.p.evaluate(() => document.documentElement.dataset.theme);
  check(timing.clicked && themed.eTheme === shown && shown !== "dark",
    "the theme button's own write reached the file too (" + themed.eTheme + " on disk, " + shown + " on screen)");
  /* The fade's end is waited for, not timed: 15 s is only how long a run waits before saying the
     fade never ended, and the verdict is the value read at that end. */
  let order = null;
  for (let i = 0; i < 60; i++) {
    order = await s.p.evaluate(() => JSON.parse(JSON.stringify(window.__deskThemeOrder || null)));
    if (!order || order.err || order.atFinished.length) break;
    await sleep(250);
  }
  check(!!order && !order.err && order.fades === 1 && order.atFinished.length === 1
    && order.atFinished[0] === shown && shown !== "dark",
    "and it was on the disk BEFORE the fade finished: the file read when `finished` settled held eTheme "
    + JSON.stringify(order && order.atFinished[0]) + " against " + JSON.stringify(shown) + " on screen, over "
    + (order ? order.fades : 0) + " fade(s)" + (order && order.err ? "; " + order.err : ""));
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
  await sleep(1500);

  /* ---- run E: a tab held nothing that stays in the profile ----
     Chromium wrote the tabs into Session Storage in the data folder, and a delete there only adds a
     tombstone, so the bytes stayed until a later write reached them. THE CONTROL is a copy of the app
     with the shell's two changes cut out, and it must show the plants where the shipped app shows none:
     a scan that finds nothing in both proves nothing about the scan. */
  const VERB = "  session: (op, key, value) =>", VERB_OFF = "  sessionOff: (op, key, value) =>";
  const DROP = "dropSessionStorage(); hardenSession();";
  const TABS_CONTROL = buildApp(path.join(APP, "control-tabs"));
  const cPre = path.join(TABS_CONTROL, "shell", "preload.js"), cMain = path.join(TABS_CONTROL, "shell", "main.js");
  const cPreSrc = fs.readFileSync(cPre, "utf8"), cMainSrc = fs.readFileSync(cMain, "utf8");
  const verbCuts = cPreSrc.split(VERB).length - 1, dropCuts = cMainSrc.split(DROP).length - 1;
  check(verbCuts === 1 && dropCuts === 1,
    "the shell holds its session verb once and its launch-time sweep of Session Storage once, so the control copy can cut them: "
    + verbCuts + " and " + dropCuts);
  fs.writeFileSync(cPre, cPreSrc.split(VERB).join(VERB_OFF), "utf8");
  fs.writeFileSync(cMain, cMainSrc.split(DROP).join("hardenSession();"), "utf8");

  /* The scan's own control: a needle in each encoding, one of them in a folder below, must be found. */
  const SCAN_LAB = path.join(APP, "scan-lab");
  fs.mkdirSync(path.join(SCAN_LAB, "below"), { recursive: true });
  fs.writeFileSync(path.join(SCAN_LAB, "one.txt"), "x " + TAB_NAME + " y", "utf8");
  fs.writeFileSync(path.join(SCAN_LAB, "below", "two.bin"),
    Buffer.concat([Buffer.from([0, 1]), Buffer.from(TAB_SEARCH, "utf16le")]));
  const lab = scanFolder(SCAN_LAB);
  check(lab.hits.length === 2 && lab.hits.some(h => h === "one.txt holds name as UTF-8")
    && lab.hits.some(h => h === "below/two.bin holds search as UTF-16LE"),
    "the scan finds a name planted as UTF-8 and a search planted as UTF-16LE in a folder below: " + said_(lab));

  const TUD = path.join(APP, "ud-tabs");
  fs.mkdirSync(TUD, { recursive: true });
  s = await startOn(APP, TUD);
  await typeTwoTabs(s.p);
  const held = await tabsHeld(s.p);
  const tabId = held && held.tabs && held.tabs[0] && held.tabs[0].id;
  check(!!held && held.tabs.length === 2 && held.tabs[0].pax === TAB_NAME && held.tabs[0].intentBox === TAB_SEARCH
    && held.tabs[1].pax === TAB_NAME_PL && typeof tabId === "string" && tabId.length > 8,
    "two tabs hold the plants through the engine's own storage route: " + (held && held.tabs ? held.tabs.length : 0)
    + " tab(s), the first named " + JSON.stringify(held && held.tabs && held.tabs[0] && held.tabs[0].pax));
  const ID_PLANT = [["tab id", tabId || "no-tab-id"]];
  console.log("       while the desk runs: " + said_(scanFolder(TUD, ID_PLANT)));
  await s.p.reload({ waitUntil: "load" });
  await sleep(3000);
  const reloaded = await s.p.evaluate(() => ({ pax: document.querySelector("#pax").value,
    tabs: document.querySelectorAll("#tabsBar .tab").length }));
  const heldAfter = await tabsHeld(s.p);
  check(reloaded.pax === TAB_NAME_PL && reloaded.tabs === 2 && !!heldAfter && heldAfter.tabs[0].pax === TAB_NAME
    && heldAfter.tabs[0].intentBox === TAB_SEARCH,
    "an in-app reload keeps the tabs as it always did: " + reloaded.tabs + " tab(s), the name field reads "
    + JSON.stringify(reloaded.pax) + ", the first tab still holds its name and search");
  check(await quitCleanly(s), "the desk quits by itself when its window is closed");
  const afterQuit = scanFolder(TUD, ID_PLANT);
  check(!afterQuit.hits.length && !afterQuit.unread.length,
    "AFTER THE DESK QUITS no file under its data folder holds a tab's name, search or id: " + said_(afterQuit));

  s = await startOn(APP, TUD);
  const relaunched = await s.p.evaluate(() => ({ pax: document.querySelector("#pax").value,
    intent: document.querySelector("#intent").value, tabs: document.querySelectorAll("#tabsBar .tab").length }));
  check(relaunched.pax === "" && relaunched.intent === "" && relaunched.tabs === 1,
    "a relaunch opens one empty tab, as it did when the tabs were written to the profile: " + relaunched.tabs
    + " tab(s), name " + JSON.stringify(relaunched.pax) + ", search " + JSON.stringify(relaunched.intent));
  await typeTwoTabs(s.p);
  E.killTree(child.pid);
  await sleep(2000);
  stopShell(s.b);
  await sleep(1000);
  const afterCrash = scanFolder(TUD, ID_PLANT);
  check(!afterCrash.hits.length && !afterCrash.unread.length,
    "AFTER A CRASH (the process killed with its tree, tabs typed a moment before) nothing of them is in the data folder: "
    + said_(afterCrash));

  /* A folder left by a build that wrote the tabs there, planted where Chromium would have kept it. */
  const staleDir = path.join(TUD, "Session Storage");
  fs.mkdirSync(staleDir, { recursive: true });
  fs.writeFileSync(path.join(staleDir, "stale-residue.log"), Buffer.from(STALE_PLANT, "utf16le"));
  s = await startOn(APP, TUD);
  const staleRun = scanFolder(TUD, [["stale plant", STALE_PLANT]]);
  check(!staleRun.hits.length && !staleRun.unread.length,
    "AFTER THE NEXT LAUNCH what an earlier build left in Session Storage is gone, and this launch wrote none: "
    + said_(staleRun));
  stopShell(s.b);
  await sleep(1500);

  /* THE CONTROL: the same steps on the copy with the two changes cut out. */
  const CUD = path.join(TABS_CONTROL, "userdata");
  fs.mkdirSync(path.join(CUD, "Session Storage"), { recursive: true });
  fs.writeFileSync(path.join(CUD, "Session Storage", "stale-residue.log"), Buffer.from(STALE_PLANT, "utf16le"));
  s = await startOn(TABS_CONTROL, CUD);
  await typeTwoTabs(s.p);
  const cHeld = await tabsHeld(s.p);
  const cId = cHeld && cHeld.tabs && cHeld.tabs[0] && cHeld.tabs[0].id;
  await quitCleanly(s);
  const ctrl = scanFolder(CUD, [["stale plant", STALE_PLANT], ["tab id", cId || "no-tab-id"]]);
  const ctrlSeen = l => ctrl.hits.some(h => h.indexOf(l) >= 0);
  check(ctrlSeen("holds name as UTF-16LE") && ctrlSeen("holds search as UTF-16LE") && ctrlSeen("holds tab id as UTF-16LE")
    && ctrlSeen("holds stale plant as UTF-16LE") && !ctrl.unread.length,
    "THE CONTROL, the shell without the session verb and without the launch sweep, keeps the plants in the profile"
    + " where Chromium writes them, and the old residue stays: " + said_(ctrl));

  /* ---- runs C and D: proxy discovery, with and without the shell's switch ---- */
  const SWITCH = 'app.commandLine.appendSwitch("no-proxy-server");';
  const CONTROL_APP = buildApp(path.join(APP, "control"));
  const controlMain = path.join(CONTROL_APP, "shell", "main.js");
  const controlSrc = fs.readFileSync(controlMain, "utf8");
  const cuts = controlSrc.split(SWITCH).length - 1;
  check(cuts === 1, "the shell holds its proxy switch line exactly once, so the control copy can cut it: " + cuts);
  fs.writeFileSync(controlMain, controlSrc.split(SWITCH).join(""), "utf8");
  const control = await netLogArm(CONTROL_APP, path.join(CONTROL_APP, "userdata"), path.join(APP, "netlog-control.json"));
  const shipped = await netLogArm(APP, path.join(APP, "ud-netlog"), path.join(APP, "netlog.json"));
  const mainLog = shipped.log, controlLog = control.log;
  const written = !!mainLog && mainLog.closed && mainLog.events > 0;
  const quiet = !!mainLog && !mainLog.wpad && mainLog.pac === 0 && mainLog.ipv6 === 0;
  const controlShows = !!controlLog && (controlLog.wpad || controlLog.pac > 0);
  const said = JSON.stringify({
    main: mainLog ? { closed: mainLog.closed, events: mainLog.events, hosts: mainLog.hosts, pac: mainLog.pac,
      ipv6: mainLog.ipv6, exitedAlone: shipped.exitedAlone } : null,
    control: controlLog ? { closed: controlLog.closed, events: controlLog.events, hosts: controlLog.hosts,
      pac: controlLog.pac } : null });
  /* A quiet control is NOT RUN, never ok: where the shell without its switch does no discovery either,
     this machine cannot tell the switch's absence from its presence. */
  if (controlLog && !controlShows && written && quiet)
    notRun.push("C/D proxy discovery: the control shows no wpad lookup and no PAC decider on this machine: " + said);
  else
    check(written && quiet && controlShows,
      "at start the shell does no proxy discovery, so no wpad lookup and no IPv6 probe at idle, read from a log"
      + " Chromium wrote out at a clean close, against a control without the switch that does discover: " + said);

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
  /* Board item 628: the not-run travels with the counts, so a run that could not look at
     the screen is not read as a run that looked and was happy. */
  if (notRun.length) console.log("       NOT RUN: " + notRun.join(", "));
  /* NOT RUN IS NOT A PASS (boards 819 and 803). Until 2026-09-29 a run whose proxy control was
     quiet, which is any machine with Windows' "Automatically detect settings" off, exited 0, and the
     release's shell gate went green having proved nothing about the proxy. A run with a leg not run
     and nothing failed now exits NO_VERDICT: no verdict, because it did not look. Failures still
     exit as their count, since a red is a verdict whatever else did not run. */
  if (reachedEnd && !fails && notRun.length)
    console.log("  SUITE DID NOT COMPLETE: " + notRun.length + " leg(s) not run, and a leg not run is not a pass"
      + (notRun.some(x => /proxy discovery/.test(x)) ? "; for the proxy leg, turn on Windows' \"Automatically detect"
        + " settings\" (Settings, Network, Proxy) so the control without the switch discovers, and run again" : ""));
  console.log("#counts checks=" + checks + " failed=" + fails + " notRun=" + notRun.length);
  console.log((reachedEnd ? "" : "  INCOMPLETE - ") + checks + " check(s), " + fails
    + " failed, " + notRun.length + " not run, " + Math.round((Date.now() - t0) / 1000) + "s");
  process.exit(fails ? E.exitOf(fails) : (reachedEnd && !notRun.length ? 0 : E.NO_VERDICT));
});
