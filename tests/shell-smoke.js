/* The shell's own smoke: the PACKAGED app, driven and read back.
 *
 *   ETIUDA_FIXTURES=<folder> node tests/shell-smoke.js
 *   ETIUDA_FIXTURES=<folder> node tests/shell-smoke.js --keep    leave the lab standing
 *   ETIUDA_SHELL_APP=<win-unpacked> ...                          reuse a build instead of making one
 *
 * WHY THIS EXISTS. Spec 11.2's named hole: nothing in the harness drove the packaged app.
 * `npm run smoke` is a browser and never meets a host, so `window.E_HOST` is absent, the desk is
 * the renderer's own localStorage and the policy does not exist. `tests/csp.js` and
 * `tests/desk.js` do start Electron, but on a throwaway folder of loose files, which is not the
 * delivery: the customer gets an asar inside an executable. Everything below runs against
 * `win-unpacked/Etiuda.exe` and its `resources/app.asar`.
 *
 * THE LAB. `electron-builder --win --dir` into a temp folder, 8 seconds, and the asar is five
 * files and 900 KB, so a variant costs a repack rather than a rebuild. The tree is never written
 * to and neither is the desk's own dist folder. Every launch gets its own user-data folder
 * inside the lab, with `--user-data-dir`, so no catalog and no desk of this machine is in reach.
 *
 * EVERY LEG HAS A CONTROL, and the controls are launches of their own rather than arguments:
 *
 *   the window      a variant asar whose shell/main.js says `frame: true`. The three controls
 *                   and the band read exactly the same there and the top inset does not, so
 *                   check 1c is measuring the window frame and not the engine's opinion of it.
 *   the catalog     a launch with an empty user-data folder: no catalog, no offer, 0 cards.
 *   the desk key    the key is read off the disk BEFORE the drive as well as after.
 *   the carry       a third launch with the marker deleted, where the copies do come back.
 *   the pin         the good pin, in a launch of the same app, where nothing is refused and the
 *                   refusal document is nowhere on screen.
 *   the plant       the same plant with the pin extended to name it, where it does run.
 *
 * WHAT IS MEASURED AND WHAT IS NOT. Counts, rectangles, file contents and console text. No
 * screenshot decides anything here and no card's text is read, printed or compared: the catalog
 * is counted through its own `cards.length`, read out of the fixture by this process, and
 * through `#list .card`. The one place a window fact cannot be had from inside the app is
 * whether it has a frame, so that one is `GetWindowRect` against `ClientToScreen(0,0)` through
 * `E.windowFacts`, a PowerShell helper that lives in engine.js because five drivers now ask it
 * the same question.
 *
 * OFF SCREEN, since board item 385. Every launch here takes `E.offscreenEnv()` and puts no window
 * on anybody's screen. Exactly five do: 1c, its two controls, 5f and 1g's own control, because
 * each of them measures the window itself and a window nobody showed has no rectangle. Each says
 * so at the launch it belongs to, and 1g is the pair that proves the default does the hiding.
 *
 * TWO TRAPS, both measured on 2026-09-14 and both costly:
 *   - `puppeteer.connect()` emulates an 800x600 viewport unless it is given
 *     `defaultViewport: null`. Without it every reading is taken at 800 px wide while the window
 *     is 1280, which is a different rung of the header's shed ladder.
 *   - the refusals Chromium logs while parsing are gone by the time puppeteer attaches, so a leg
 *     that needs them reloads once with the listener in place. A reload is NOT free here: see
 *     check 2c.
 *
 * Exit code is the number of failed checks, 78 where the run produced no verdict at all. Every
 * process is killed by pid, never by image name, and the lab is removed in a finally.
 */
"use strict";
const puppeteer = require("puppeteer-core");
const asar = require("@electron/asar");
const { spawn, execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const KEEP = process.argv.indexOf("--keep") > -1;
let port = 9460;
let fails = 0, checks = 0, reachedEnd = false;
const t0 = Date.now();
const live = new Set();                       // every pid this run has started
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const note = what => console.log("       " + what);
const phase = what => console.log("\n" + what);

/* ---- the lab ------------------------------------------------------------------------------ */

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-shell-"));
const PRISTINE = path.join(LAB, "app.pristine.asar");
const WORK = path.join(LAB, "asar-work");
const PROC_PS1 = path.join(LAB, "lab-processes.ps1");
let APPDIR = "";                              // win-unpacked
let ASAR = "";

/* Win32, because "is this window frameless" is not a question the page can answer: the style
   bits say WS_CAPTION either way (Electron removes the non-client RENDERING, not the style) and
   the honest measure is how far the client area's origin sits below the window's own top edge.
   It lives in engine.js since board item 385, because five drivers now ask it the same thing:
   whether the launch they just made put a window on somebody's screen. */
const windowFacts = E.windowFacts;

/* Scoped to the lab by executable path. Killing by image name would reach a copy of this app
   somebody else on this machine is running, and has no business doing so. */
const LAB_PROCS = [
  "param([string]$Under)",
  "$n = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($Under) })",
  "Write-Output $n.Count",
].join("\n");

function ps(file, args) {
  return execFileSync("powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file].concat(args),
    { encoding: "utf8", windowsHide: true }).trim();
}
function labProcesses() { try { return Number(ps(PROC_PS1, ["-Under", LAB.replace(/\//g, "\\")])); } catch (e) { return -1; } }

function killPid(pid) {
  try { execFileSync("taskkill", ["/F", "/PID", String(pid), "/T"], { stdio: "ignore" }); } catch (e) { /* already gone */ }
  live.delete(pid);
}

/* ---- building the app once ---------------------------------------------------------------- */

function buildApp() {
  const given = process.env.ETIUDA_SHELL_APP;
  if (given) {
    if (!fs.existsSync(path.join(given, "resources", "app.asar")))
      E.refuse("ETIUDA_SHELL_APP has no resources/app.asar: " + given);
    /* Copied, because every variant below rewrites the asar in place and a build somebody else
       owns is not this run's to edit. Only the asar is copied; the executable is linked to by
       running it where it stands, so nothing of the 250 MB moves. */
    E.refuse("ETIUDA_SHELL_APP is not implemented as a copy yet; build into the lab instead");
  }
  const out = path.join(LAB, "out");
  const cli = path.join(E.ROOT, "node_modules", "electron-builder", "out", "cli", "cli.js");
  if (!fs.existsSync(cli)) E.refuse("electron-builder is not installed", "npm install first");
  const t = Date.now();
  execFileSync(process.execPath, [cli, "--win", "--dir"],
    { cwd: E.ROOT, env: Object.assign({}, process.env, { ETIUDA_DIST: out }), stdio: "ignore" });
  APPDIR = path.join(out, "win-unpacked");
  ASAR = path.join(APPDIR, "resources", "app.asar");
  if (!fs.existsSync(ASAR)) E.refuse("electron-builder wrote no asar into " + out);
  fs.copyFileSync(ASAR, PRISTINE);
  return Math.round((Date.now() - t) / 100) / 10;
}

/* Every variant starts from the pristine extraction, so a mutation cannot accumulate. */
async function variant(mutate) {
  fs.rmSync(WORK, { recursive: true, force: true });
  asar.extractAll(PRISTINE, WORK);
  if (mutate) mutate(WORK);
  await asar.createPackageWithOptions(WORK, ASAR, {});
  /* @electron/asar caches an archive's header by PATH, and every variant is written to the same
     path, so without this a read-back after a repack answers with the PREVIOUS archive's offsets
     and hands you the file you thought you had just replaced. Measured 2026-09-14: check 6a read
     the pristine engine out of an asar holding the planted one. */
  asar.uncacheAll();
}
function pristine() { fs.copyFileSync(PRISTINE, ASAR); asar.uncacheAll(); }

/* Directories come back in the listing too, and on Windows with backslashes; the allowlist is
   about FILES, so only entries carrying a dot are counted, in one place rather than at each site. */
function asarNames() {
  return asar.listPackage(ASAR)
    .map(n => n.split(path.sep).join("/").replace(/^\//, ""))
    .filter(n => n.indexOf(".") > -1).sort();
}

/* ---- launching, driving, and stopping ----------------------------------------------------- */

function newUserData(name, seed, realDocuments) {
  const dir = path.join(LAB, "ud-" + name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  if (seed) seed(dir);
  /* EVERY LAUNCH IS AIMED AT A FOLDER OF THE LAB'S OWN. The shell reads Documents/Etiuda before
     the user-data folder, and on a working desk that folder holds a live catalog, so an unpinned
     launch would count somebody's cards as the fixture's. AFTER the seed, because a seed writes
     desk.json whole and would drop the pin. One leg asks for the real default and says so. */
  if (!realDocuments) E.pinCatalogFolder(dir, catFolder(name));
  return dir;
}
function catFolder(name) { return path.join(LAB, "cat-" + name); }

async function launch(ud, args, env, assocExe) {
  port++;
  /* OFF SCREEN BY DEFAULT, board item 385: E.offscreenEnv() writes ETIUDA_TEST_OFFSCREEN=1 over
     whatever the ambient environment says, and a caller's own value wins over that. The five
     launches below that pass "" are the ones whose subject IS the window, and each says so where
     it does it; every other launch in this file is invisible to whoever is at the desk. */
  /* assocExe is board 393's leg and nothing else's: the registered open command names the exe
     UNQUOTED with "%1" after it, so that shape is handed over VERBATIM and the caller quotes the
     file itself. Every other launch here lets the spawn quote each argument, which is the one
     thing Explorer does not do. */
  const child = spawn(assocExe || path.join(APPDIR, "Etiuda.exe"),
    ["--remote-debugging-port=" + port, "--user-data-dir=" + ud].concat(args || []),
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv(env),
      windowsVerbatimArguments: !!assocExe });
  live.add(child.pid);
  const said = [];
  child.stdout.on("data", d => said.push(String(d).trim()));
  child.stderr.on("data", d => said.push(String(d).trim()));
  let b = null;
  for (let i = 0; i < 40 && !b; i++) {
    await sleep(500);
    try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + port, defaultViewport: null }); } catch (x) { /* not up yet */ }
  }
  if (!b) { killPid(child.pid); throw new Error("the packaged app did not answer on the debugging port within 20 s: " + said.join(" | ")); }
  const p = (await b.pages())[0];
  const errs = [];
  p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  p.on("pageerror", e => errs.push("pageerror " + String(e && e.message || e)));
  await sleep(3500);
  return {
    b, p, said, errs, pid: child.pid,
    inline: () => errs.filter(t => /inline script/i.test(t)),
    stop: async () => { try { b.disconnect(); } catch (x) {} killPid(child.pid); await sleep(1000); },
  };
}

/* ---- what a launch is asked ---------------------------------------------------------------- */

const SEEN = () => ({
  booted: typeof window.E_VERSION === "string",
  eHost: document.body.classList.contains("e-host"),
  eBackdrop: document.body.classList.contains("e-backdrop"),
  glassOff: document.body.classList.contains("glass-off"),
  theme: document.documentElement.dataset.theme || null,
  lang: document.documentElement.getAttribute("lang") || null,
  cards: document.querySelectorAll("#list .card").length,
  catalogCards: (window.E_CATALOG && window.E_CATALOG.cards || []).length,
  catalogThere: typeof window.E_CATALOG !== "undefined",
  offer: !!document.querySelector("#ecYes"),
  planted: typeof window.__planted !== "undefined",
  viewport: [window.innerWidth, window.innerHeight, window.outerWidth, window.outerHeight, window.devicePixelRatio],
  bandTop: (() => { const r = document.querySelector(".row"); return r ? Math.round(r.getBoundingClientRect().top) : null; })(),
  bandH: (() => { const r = document.querySelector(".row"); return r ? Math.round(r.getBoundingClientRect().height) : null; })(),
  bandVar: (getComputedStyle(document.documentElement).getPropertyValue("--band-h") || "").trim(),
  ctl: ["winMin", "winMax", "winClose"].map(id => {
    const el = document.getElementById(id); if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  }),
  policy: ((document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || ""),
  /* Counted, never printed: it is the static template's own text and the point is only that
     there is or is not something on the screen behind a refusal. */
  visibleChars: (document.body.innerText || "").replace(/\s+/g, " ").trim().length,
  /* The document the shell serves in place of the engine when the pin will not read. Its words
     are the shell's own rather than a catalog's, so they may be matched; what is asserted is
     that both languages arrived, that it names the file it could not read, and that it brought
     no script of its own. */
  refusal: (() => {
    const t = document.body.innerText || "";
    return { en: /could not start/.test(t), pl: /nie mog/.test(t),
             names: /etiuda\.csp\.json/.test(t), scripts: document.querySelectorAll("script").length };
  })(),
});

function deskOf(ud) {
  const f = path.join(ud, "desk.json");
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; }
}
function deskKeys(ud) { const d = deskOf(ud); return (d && d.keys) || {}; }
function writeDesk(ud, keys) {
  fs.writeFileSync(path.join(ud, "desk.json"),
    JSON.stringify({ kind: "etiuda-desk", schema: 1, app: "planted", saved: "2026-09-14T00:00:00.000Z", keys }), "utf8");
}

/* The plant, and its hash by this file's own arithmetic rather than the build's, so the refusal
   Chromium logs is read against a second implementation of the same sum. */
const PLANT = "window.__planted = 1;";
const PLANT_HASH = "sha256-" + crypto.createHash("sha256").update(PLANT, "utf8").digest("base64");

/* ---- the run ------------------------------------------------------------------------------- */

const FIXES = E.fixtures("catalogEc", "sampleEc");
const FIX = FIXES.catalogEc, SAMPLE = FIXES.sampleEc;
const cardsOf = f => {
  const doc = JSON.parse(fs.readFileSync(f, "utf8"));
  if (+doc.format !== 2 || doc.kind !== "etiuda-catalog") E.refuse("the fixture is not a format 2 catalog document: " + f);
  return doc.cards.length;
};
const FIXTURE_CARDS = cardsOf(FIX), SAMPLE_CARDS = cardsOf(SAMPLE);
/* THE EDITION IS THE CATALOG'S OWN `date` FIELD, which the Library shows in place of the file's
   time on disk. The legs below tell one from the other, so they need one fixture of each kind and
   say so rather than discovering it as a pass: a check that cannot fail is not one. */
const editionOf = f => { const d = JSON.parse(fs.readFileSync(f, "utf8")); return d.date == null ? "" : String(d.date); };
const FIX_EDITION = editionOf(FIX);
if (!FIX_EDITION) E.refuse("the catalogEc fixture names no edition, so nothing below can prove one is shown");
if (editionOf(SAMPLE)) E.refuse("the sampleEc fixture names an edition, so nothing below can prove the fallback to a file's date");
const withFixture = dir => fs.copyFileSync(FIX, path.join(dir, "etiuda-catalog.ec"));
/* mtime is what decides which of two catalogs in one folder is offered, so a leg that means to
   choose between them SETS it rather than relying on the order two copies happened to land in. */
const placeEc = (dir, from, as, minutesOld) => {
  fs.mkdirSync(dir, { recursive: true });
  const to = path.join(dir, as);
  fs.copyFileSync(from, to);
  const when = new Date(Date.now() - minutesOld * 60000);
  fs.utimesSync(to, when, when);
  return to;
};

(async () => {
  fs.writeFileSync(PROC_PS1, LAB_PROCS, "utf8");

  phase("[0/7] the lab");
  const built = buildApp();
  const names = asarNames();
  const inAsar = crypto.createHash("sha256").update(asar.extractFile(ASAR, "engine/etiuda.html")).digest("hex");
  const inTree = E.sha256(E.ENGINE_PATH);
  console.log("       built in " + built + "s into " + LAB);
  check(names.join(",") === "engine/etiuda.csp.json,engine/etiuda.html,package.json,shell/main.js,shell/preload.js",
    "the asar holds the five allowlisted files and nothing else: " + names.join(", "));
  check(inAsar === inTree,
    "the engine inside the asar is the engine in the tree, sha256 " + inAsar.slice(0, 16)
    + (inAsar === inTree ? "" : " against the tree's " + inTree.slice(0, 16)));
  console.log("       the fixture offers " + FIXTURE_CARDS + " cards, by JSON.parse of the .ec in this process");

  /* Both readings above are made to fail before they are believed, and neither costs a launch:
     a sixth file in the asar and a byte of difference in the artefact are the two things they
     exist to catch. */
  await variant(w => fs.writeFileSync(path.join(w, "engine", "sixth.txt"), "not in the allowlist", "utf8"));
  const sixth = asarNames();
  await variant(w => {
    const f = path.join(w, "engine", "etiuda.html");
    fs.writeFileSync(f, fs.readFileSync(f, "utf8") + "<!-- one byte of difference -->", "utf8");
  });
  const drifted = crypto.createHash("sha256").update(asar.extractFile(ASAR, "engine/etiuda.html")).digest("hex");
  pristine();
  check(sixth.length === 6 && sixth.join(",") !== names.join(",") && drifted !== inTree,
    "0C control: a sixth file in the asar gives a list of " + sixth.length + " that does not match, and one"
    + " byte edited into the artefact gives sha256 " + drifted.slice(0, 16) + ". So neither reading above is vacuous");

  /* ---- 1 and 3: the window, and a key written through Settings ---------------------------- */

  phase("[1/7] the window, and a key written through Settings");
  const udA = newUserData("a", withFixture);
  /* ON SCREEN, DELIBERATELY, and one of exactly five launches in this file that are. This leg and
     the three below read the window rectangle through EnumWindows, which passes over a window
     nobody has shown, so an off-screen run would find no window and read as a failure. Whether a
     window has a frame cannot be asked from inside it, which is why the exception exists rather
     than being tidied away. Every other launch in this file takes launch()'s off-screen default
     and is invisible to whoever is at the desk. */
  let s = await launch(udA, [], { ETIUDA_TEST_OFFSCREEN: "" });
  let seen = await s.p.evaluate(SEEN);
  const facts = windowFacts(s.pid);

  check(seen.ctl.every(c => c && c.w > 0 && c.h > 0 && c.top === 0),
    "1a the three window controls are drawn and sit at y0: " + JSON.stringify(seen.ctl));
  check(seen.bandTop === 0 && seen.bandH > 0 && seen.bandVar === seen.bandH + "px",
    "1b the band is the top bar, its top at y" + seen.bandTop + ", " + seen.bandH
    + " px high, and the host published --band-h as " + JSON.stringify(seen.bandVar));
  check(facts.topInset === 0 && facts.cliH > 0,
    "1c the window is frameless: the client area's own top edge is " + facts.topInset
    + " px below the window's, client " + facts.cliW + "x" + facts.cliH + " in a window of "
    + facts.winW + "x" + facts.winH);
  /* A check rather than a note: puppeteer.connect() emulates 800x600 AT RATIO 1 unless it is
     given defaultViewport: null, and a note is something a green run does not make anybody
     read. The gap between the page's own box and the window's outer box is what tells the two
     apart on any machine: 14 by 7 here, 496 by 289 under the emulation, measured both ways on
     2026-09-14. */
  check(seen.viewport[2] - seen.viewport[0] < 100 && seen.viewport[3] - seen.viewport[1] < 100,
    "1e the page is read at the window's own size, inner " + seen.viewport[0] + "x" + seen.viewport[1]
    + " in an outer " + seen.viewport[2] + "x" + seen.viewport[3] + " at devicePixelRatio "
    + seen.viewport[4] + ", and not at puppeteer's emulated 800x600");
  check(seen.eHost && seen.eBackdrop,
    "1d the engine knows its host: e-host " + seen.eHost + ", e-backdrop " + seen.eBackdrop);

  /* Board item 381: the scrim follows --band-accent when the host sets one and falls back to the
     brand cobalt when it does not. Driven rather than read, because what the desk's own Windows
     switch says is a property of this machine and cannot be asserted either way. */
  const PROBE_ACCENT = "#b7472a";
  const accent = await s.p.evaluate(probe => {
    const read = () => getComputedStyle(document.querySelector(".row"), "::before").backgroundColor;
    const root = document.documentElement;
    const had = root.style.getPropertyValue("--band-accent");
    const atRest = read();
    window.eSetAccent(probe);
    const accented = read();
    window.eSetAccent(had);
    return { atRest: atRest, accented: accented, back: read(), had: had,
             host: String((window.E_HOST || {}).accent || "") };
  }, PROBE_ACCENT);
  /* color-mix() in srgb computes to a color() value, not to rgba(), so what is asserted is that
     the three readings move and come back rather than the notation they arrive in. */
  check(accent.atRest !== accent.accented && accent.back === accent.atRest
        && accent.accented.indexOf("0.717647") > -1,
    "1f the band's scrim follows the host's accent: " + accent.atRest + " at rest, "
    + accent.accented + " with " + PROBE_ACCENT + " set, and " + accent.back
    + " once it is taken away again. This desk's own answer is "
    + (accent.host ? accent.host + ", so Windows is asked to put its accent on title bars"
                   : '"", so the switch is off and the band is the brand cobalt'));

  check(seen.catalogThere && seen.catalogCards === FIXTURE_CARDS,
    "2a the fixture reached the page as data: window.E_CATALOG carries " + seen.catalogCards
    + " cards against the fixture's " + FIXTURE_CARDS);
  check(s.said.some(l => l.indexOf("etiuda-catalog.ec, " + FIXTURE_CARDS + " cards") > -1),
    "2b the shell read it from the user-data folder and said so, with the same count");

  const before = deskKeys(udA);
  check(before.eGlassOff === undefined && !seen.glassOff,
    "3a before the drive the key is in neither the desk file nor the body's classes (eGlassOff "
    + JSON.stringify(before.eGlassOff) + ", body.glass-off " + seen.glassOff + ")");

  const drive = await s.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const btn = document.getElementById("settingsBtn");
    if (!btn) return { step: "no settings button" };
    btn.click(); await wait(400);
    const item = document.querySelector('#settingsMenu [data-act="settings"]');
    if (!item) return { step: "no Settings item in the menu" };
    item.click(); await wait(900);
    const fold = document.querySelector('#modalCard details.acc[data-acc="appearance"]');
    if (!fold) return { step: "no appearance fold" };
    if (!fold.open) fold.querySelector("summary").click();
    await wait(500);
    const off = document.querySelector('#modalCard [data-seg="glass"] button[data-val="off"]');
    if (!off) return { step: "no Off in the blur segment" };
    const r = off.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return { step: "the Off button has no box", r: [r.width, r.height] };
    off.click(); await wait(700);
    return { step: "clicked", box: [Math.round(r.width), Math.round(r.height)],
             glass: document.body.classList.contains("glass-off") };
  });
  await sleep(700);
  const after = deskKeys(udA);
  check(drive.step === "clicked" && drive.glass === true,
    "3b the drive went through the menu, the fold and the segment, and the body changed: "
    + JSON.stringify(drive));
  check(after.eGlassOff === "1",
    "3c the key is in desk.json on disk, read by this process: eGlassOff " + JSON.stringify(after.eGlassOff)
    + " among " + Object.keys(after).length + " keys");
  await s.stop();

  s = await launch(udA);
  seen = await s.p.evaluate(SEEN);
  const kept = deskKeys(udA);
  check(kept.eGlassOff === "1" && seen.glassOff === true,
    "3d and it survives a relaunch: eGlassOff " + JSON.stringify(kept.eGlassOff)
    + " on disk and body.glass-off " + seen.glassOff + " on a fresh boot");
  await s.stop();

  /* ---- 1g: the harness's own window, board item 385 -----------------------------------------
     The subject is the DRIVER's default rather than the shell's flag, which is why the first
     launch here passes no environment at all: it takes what launch() gives every other launch in
     this file. The control clears the variable by hand and states its own condition, because a
     run started from a shell that already carries it would otherwise prove nothing. One launch
     each way, and the control is the only one of the two that reaches the screen. */

  phase("[1b/7] the window the harness gives itself");
  const udP = newUserData("offscreen");
  s = await launch(udP);
  const hiddenFacts = windowFacts(s.pid);
  const hiddenSeen = await s.p.evaluate(SEEN);
  await s.stop();
  const udQ = newUserData("onscreen");
  s = await launch(udQ, [], { ETIUDA_TEST_OFFSCREEN: "" });
  const shownFacts = windowFacts(s.pid);
  await s.stop();
  check(hiddenFacts.measured === true && hiddenFacts.windows === 0 && hiddenSeen.booted
        && shownFacts.measured === true && shownFacts.windows >= 1 && shownFacts.winW > 0,
    "1g a launch taking this driver's own default leaves " + hiddenFacts.windows
    + " visible top-level window(s) while the engine still boots inside it ("
    + hiddenSeen.booted + "), and the same app with ETIUDA_TEST_OFFSCREEN cleared puts "
    + shownFacts.windows + " on screen at " + shownFacts.winW + "x" + shownFacts.winH
    + ". So the default is what hides it, and EnumWindows can see a window when there is one");

  /* ---- 2c: the catalog on screen, which is a separate launch because accepting reloads ---- */

  phase("[2/7] the catalog on screen");
  const udB = newUserData("b", withFixture);
  s = await launch(udB);
  const offerUp = await s.p.evaluate(() => !!document.querySelector("#ecYes"));
  const clicked = await s.p.evaluate(() => { const y = document.querySelector("#ecYes"); if (!y) return false; y.click(); return true; });
  await sleep(6000);
  const pages = await s.b.pages();
  const land = await pages[0].evaluate(SEEN);
  const deskAfterAccept = deskKeys(udB);
  check(offerUp && clicked && land.cards === FIXTURE_CARDS,
    "2c accepting the offer puts the catalog on screen: " + land.cards + " cards against the fixture's "
    + FIXTURE_CARDS + " (the offer was up: " + offerUp + ", and was clicked: " + clicked + ")");
  if (land.cards !== FIXTURE_CARDS) {
    note("the offer is back up: " + land.offer + ", and desk.json holds "
      + Object.keys(deskAfterAccept).length + " keys in " + fs.statSync(path.join(udB, "desk.json")).size + " bytes");
    note("accepting reloads the document (catalog-file.js), and shell/main.js caches deskKeys on the");
    note("first etiuda:desk and never refreshes it after a write, so the second load of the document");
    note("in one app run is handed the desk as it was at app START. See check 2d.");
  }
  /* Named separately so the cause is a check with a verdict rather than a note under a failure. */
  const survive = await pages[0].evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    window.lsSet("eReloadWitness", "kept");
    await wait(300);
    return true;
  });
  await sleep(500);
  const witnessOnDisk = deskKeys(udB).eReloadWitness === "kept";
  await pages[0].reload({ waitUntil: "load" });
  await sleep(3500);
  const afterReload = await (await s.b.pages())[0].evaluate(() => ({
    handed: String(window.E_HOST.deskRead()).slice(0, 40),
    witness: window.lsGet("eReloadWitness"),
  }));
  check(survive && witnessOnDisk && afterReload.witness === "kept",
    "2d a key written before an in-app reload is still the engine's after it: on disk before "
    + witnessOnDisk + ", lsGet after " + JSON.stringify(afterReload.witness)
    + ", and the host handed the page " + JSON.stringify(afterReload.handed));
  await s.stop();

  /* ---- 2e to 2k: THE CATALOG FOLDER, board item 368 ---------------------------------------
     A desk keeps its catalogs in one folder, the newest of them is what loads, and the folder is
     a setting. Every reading below is a card count out of the page or a line the shell printed;
     no catalog's contents are read, printed or compared here. */

  phase("[2b/7] the catalog folder");
  const udF = newUserData("folder");
  /* Both in the folder at once, the sample the older of the two, so "the newest wins" is a
     CHOICE between two present candidates rather than the only file there being loaded. */
  placeEc(catFolder("folder"), SAMPLE, "sample-catalog.ec", 60);
  placeEc(catFolder("folder"), FIX, "newer-edition.ec", 1);
  s = await launch(udF);
  const folderSeen = await s.p.evaluate(SEEN);
  check(folderSeen.catalogCards === FIXTURE_CARDS && folderSeen.catalogCards !== SAMPLE_CARDS,
    "2e the newest .ec in the catalog folder is the one that loads: " + folderSeen.catalogCards
    + " cards, the newer fixture's " + FIXTURE_CARDS + " and not the older sample's " + SAMPLE_CARDS);
  check(s.said.some(l => l.indexOf("newer-edition.ec, " + FIXTURE_CARDS + " cards") > -1),
    "2f and the shell says which file it read, by name and with the same count");
  const offerLine = await s.p.evaluate(() => {
    const subs = document.querySelectorAll("#eCatalogModal .modal-sub");
    const last = subs[subs.length - 1];
    return last ? Array.from(last.querySelectorAll("code")).map(c => c.textContent) : null;
  });
  check(!!offerLine && offerLine.length === 2 && offerLine[0] === "newer-edition.ec"
        && offerLine[1] === catFolder("folder"),
    "2g and the offer on screen names that file AND the folder it came out of: "
    + JSON.stringify(offerLine));
  await s.stop();

  /* The control, and it is the same folder with the two times swapped: were 2e reading anything
     but the modification times it would answer the same both ways. */
  placeEc(catFolder("folder"), SAMPLE, "sample-catalog.ec", 1);
  placeEc(catFolder("folder"), FIX, "newer-edition.ec", 60);
  s = await launch(udF);
  const swapped = await s.p.evaluate(SEEN);
  check(swapped.catalogCards === SAMPLE_CARDS,
    "2E control: with the sample made the newer of the two, the same folder loads "
    + swapped.catalogCards + " cards, the sample's " + SAMPLE_CARDS
    + ". So 2e is reading the modification times and not the order of the listing");
  await s.stop();

  /* ---- 2h to 2j: changing the folder, which re-aims the watch without a restart ------------ */

  const udG = newUserData("change");                       // pinned at an EMPTY folder of its own
  const other = path.join(LAB, "cat-change-2");
  placeEc(other, FIX, "moved-here.ec", 1);
  s = await launch(udG);
  const before2 = await s.p.evaluate(SEEN);
  /* The row a person uses, reached the way a person reaches it: the menu, the Settings item,
     then the fold. What it SAYS is the check; the button beside it opens a native folder dialog,
     which no page can drive, so the write that button's handler makes is made below instead. */
  const row = await s.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const btn = document.getElementById("settingsBtn");
    if (!btn) return { step: "no settings button" };
    btn.click(); await wait(400);
    const item = document.querySelector('#settingsMenu [data-act="settings"]');
    if (!item) return { step: "no Settings item in the menu" };
    item.click(); await wait(900);
    const fold = document.querySelector('#modalCard details.acc[data-acc="catalog"]');
    if (!fold) return { step: "no catalog fold" };
    if (!fold.open) fold.querySelector("summary").click();
    await wait(500);
    const shown = fold.querySelector(".set-path");
    const change = fold.querySelector("#setCatFolder");
    const r = change ? change.getBoundingClientRect() : null;
    return { step: "open", path: shown ? shown.textContent : null,
             button: !!change && !!r && r.width > 0 && r.height > 0 };
  });
  check(row.step === "open" && row.path === catFolder("change") && row.button,
    "2h Settings shows the folder in force and a button to change it, reached through the menu: "
    + JSON.stringify(row));
  const moved = await s.p.evaluate(dir => window.lsSet("eCatalogFolder", dir), other);
  await sleep(4000);
  const afterMove = await (await s.b.pages())[0].evaluate(SEEN);
  check(moved !== false && before2.cards === 0 && !before2.offer && afterMove.offer,
    "2i changing the folder re-scans at once: " + before2.cards + " cards and offer "
    + before2.offer + " on the empty folder, offer " + afterMove.offer + " after the change");
  check(s.said.some(l => l.indexOf("moved-here.ec, " + FIXTURE_CARDS + " cards") > -1)
        && s.said.some(l => l.indexOf("catalog folder " + other) > -1),
    "2j and the shell followed the setting to the new folder and read the file there, by name");
  await s.stop();

  /* The control: the same write, to a folder holding nothing. An offer here would mean 2i was
     watching a clock rather than a folder. */
  const emptyDir = path.join(LAB, "cat-change-3");
  fs.mkdirSync(emptyDir, { recursive: true });
  const udH = newUserData("change2");
  placeEc(catFolder("change2"), FIX, "here.ec", 1);
  s = await launch(udH);
  const hadOffer = await s.p.evaluate(SEEN);
  await s.p.evaluate(() => { const y = document.querySelector("#ecYes"); if (y) y.click(); });
  await sleep(6000);
  let pg = (await s.b.pages())[0];
  await pg.evaluate(dir => window.lsSet("eCatalogFolder", dir), emptyDir);
  await sleep(4000);
  pg = (await s.b.pages())[0];
  const afterEmpty = await pg.evaluate(SEEN);
  check(hadOffer.offer && !afterEmpty.offer && afterEmpty.cards === FIXTURE_CARDS,
    "2I control: pointed at a folder holding no catalog the same change raises no offer ("
    + afterEmpty.offer + ") and leaves the loaded catalog where it is (" + afterEmpty.cards
    + " cards). So 2i is the new folder's file and not the act of changing the setting");
  await s.stop();

  /* ---- 2k: the default folder, the one leg that may touch this machine --------------------- */

  const DOCS = path.join(os.homedir(), "Documents", "Etiuda");
  const docsExisted = fs.existsSync(DOCS);
  const udI = newUserData("firstrun", null, true);         // NOT pinned: the real default
  s = await launch(udI);
  const saidFolder = s.said.some(l => l.indexOf("catalog folder " + DOCS) > -1);
  await s.stop();
  check(saidFolder && fs.existsSync(DOCS),
    "2k a first run with no folder set makes Documents/Etiuda and reads from it: the shell named "
    + DOCS + " (" + saidFolder + ") and it is on disk (" + fs.existsSync(DOCS) + ")"
    + (docsExisted ? "; it was there before this run, so only the naming is this run's" : ""));
  /* Put back what this run made, and only that: rmdirSync refuses a folder holding anything, so
     a desk that has since put a catalog in it keeps both the folder and the catalog. */
  if (!docsExisted) { try { fs.rmdirSync(DOCS); } catch (x) { note("Documents/Etiuda is not empty and stays: " + DOCS); } }

  /* ---- 2l to 2n: IMPORT CATALOG, board item 378 -------------------------------------------
     THE DIALOG IS THE SHELL'S NOW and a native dialog cannot be driven, so the door is proved in
     two halves: that the button is on screen and that the host answers with a picker, then that
     the reading half takes the very bytes the picker would have handed it. The control is the
     same call on a file that is not a catalog. No card's text is read here either: the reading is
     a count and a filename this file chose. */

  phase("[2c/7] Import catalog takes a .ec");
  const ecText = fs.readFileSync(FIX, "utf8");
  const udJ = newUserData("import");
  s = await launch(udJ);
  const door = await s.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const btn = document.getElementById("settingsBtn");
    if (!btn) return { step: "no settings button" };
    btn.click(); await wait(400);
    const item = document.querySelector('#settingsMenu [data-act="manage"]');
    if (!item) return { step: "no Library item in the menu" };
    item.click(); await wait(1200);
    const imp = document.getElementById("mgImportCatalog");
    if (!imp) return { step: "no Import catalog button" };
    const r = imp.getBoundingClientRect();
    return { step: "open", box: [Math.round(r.width), Math.round(r.height)],
             wired: typeof imp.onclick === "function",
             picker: typeof (window.E_HOST || {}).pickCatalogFile,
             reader: typeof window.importCatalogText };
  });
  check(door.step === "open" && door.box[0] > 0 && door.box[1] > 0 && door.wired
        && door.picker === "function" && door.reader === "function",
    "2l the Import door is whole: the button is on screen and wired, the host answers with a file"
    + " picker of its own, and the engine has the reading half behind it: " + JSON.stringify(door));

  const took = await s.p.evaluate(text => {
    window.confirm = () => true;              // the native confirm cannot be driven; the answer is
    return window.importCatalogText(text, "picked-by-hand.ec");
  }, ecText);
  await sleep(6000);
  const landed = await (await s.b.pages())[0].evaluate(SEEN);
  check(took === true && landed.cards === FIXTURE_CARDS,
    "2m and a .ec handed to it loads: the reader answered " + took + " and the page shows "
    + landed.cards + " card(s) against the fixture's " + FIXTURE_CARDS);
  await s.stop();

  const udK = newUserData("import2");
  s = await launch(udK);
  const refused = await s.p.evaluate(() => {
    window.confirm = () => true;
    const took2 = window.importCatalogText("this file is not a catalog at all", "wrong-file.txt");
    return { took: took2, toast: (document.getElementById("toast") || {}).textContent || "" };
  });
  await sleep(2500);
  const stillBare = await (await s.b.pages())[0].evaluate(SEEN);
  check(refused.took === false && stillBare.cards === 0
        && refused.toast.indexOf("wrong-file.txt") > -1,
    "2M control: the same reader refuses a file that is not a catalog, names it, and leaves the"
    + " desk alone: answered " + refused.took + ", " + stillBare.cards + " card(s), and said "
    + JSON.stringify(refused.toast));
  await s.stop();

  /* ---- 2o to 2s: THE WAY BACK FROM A DECLINE, board items 379 and 399 ----------------------
     Declining used to be final until local memory was cleared, and the line that answered it
     first was a list in Settings - which a person with an empty screen never opens. So the offer
     is now ON the empty screen, drawn every time it is drawn and remembering no refusal, and the
     list of files is in the Library beside the catalog it is about. Both are checked here, each
     with its own control, and so is the boot offer returning when the file on disk is younger
     than the "no". Names, dates and counts only, all of them this file\'s own. */

  phase("[2d/7] the way back from a decline");
  const udL = newUserData("back");
  placeEc(catFolder("back"), FIX, "one-edition.ec", 5);
  placeEc(catFolder("back"), SAMPLE, "another.ec", 90);
  s = await launch(udL);
  const said_no = await s.p.evaluate(() => {
    const n = document.querySelector("#ecNo");
    if (!n) return false;
    n.click();
    return true;
  });
  await sleep(1500);
  const noKeys = deskKeys(udL);
  check(said_no && !!noKeys.eCatalogNo && !!noKeys.eCatalogNoAt,
    "2o declining writes the refusal AND its date to the desk on disk: signature "
    + (noKeys.eCatalogNo ? "written" : "absent") + ", date " + JSON.stringify(noKeys.eCatalogNoAt));

  /* THE OFFER ON THE EMPTY SCREEN, which is where a person who declined actually is. Read for
     what it says rather than for its markup: how many catalogs the folder holds, which one it
     names, its date in the app\'s own d.m.y h:m, and the count of cards inside it. */
  const CARD_OFFER = () => {
    const box = document.getElementById("emptyCatOffer");
    if (!box) return { step: "no offer box" };
    const top = box.querySelector(".ec-offer-top"), name = box.querySelector(".ec-name b");
    const meta = box.querySelector(".ec-meta"), load = box.querySelector("#emptyCatLoad");
    const r = load ? load.getBoundingClientRect() : null;
    return { step: "read", top: top ? top.textContent : null, name: name ? name.textContent : null,
             meta: meta ? meta.textContent : null, folder: !!box.querySelector("code"),
             load: !!load && !!r && r.width > 0 && r.height > 0,
             wired: !!load && typeof load.onclick === "function" };
  };
  const offerCard = await s.p.evaluate(CARD_OFFER);
  const DATE_RE = /^[0-3][0-9]\.[0-1][0-9]\.20[0-9][0-9] [0-2][0-9]:[0-5][0-9]/;
  check(offerCard.step === "read" && offerCard.name === "one-edition.ec"
        && /\b2\b/.test(offerCard.top || "") && offerCard.folder
        && (offerCard.meta || "").indexOf(FIX_EDITION) === 0
        && !DATE_RE.test(offerCard.meta || "")
        && (offerCard.meta || "").indexOf(String(FIXTURE_CARDS)) > -1
        && offerCard.load && offerCard.wired,
    "2p the empty state carries the folder\'s own offer after that refusal: it counts them ("
    + JSON.stringify(offerCard.top) + "), names the newest with its EDITION and size ("
    + JSON.stringify(offerCard.name) + ", " + JSON.stringify(offerCard.meta)
    + ", the fixture's own edition being " + JSON.stringify(FIX_EDITION)
    + " and no d.m.y disk time in it) and shows a Load button that is wired and has a box");

  /* THE LIBRARY\'S LIST, reached the way a person reaches it: the menu, Library, then the fold.
     Nothing is loaded here, so no row is marked and every row offers Load. */
  const OPEN_LIB = async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const btn = document.getElementById("settingsBtn");
    if (!btn) return { step: "no settings button" };
    btn.click(); await wait(400);
    const item = document.querySelector('#settingsMenu [data-act="manage"]');
    if (!item) return { step: "no Library item in the menu" };
    item.click(); await wait(1200);
    const fold = document.querySelector('#modalCard details.manage-sec[data-mg="data"]');
    if (!fold) return { step: "no catalog fold" };
    if (!fold.open) fold.querySelector("summary").click();
    await wait(1200);
    const rows = Array.from(document.querySelectorAll("#mgCatList .ec-row"));
    return { step: "open",
             rows: rows.map(r => ({
               name: (r.querySelector(".ec-name b") || {}).textContent || "",
               meta: (r.querySelector(".ec-meta") || {}).textContent || "",
               loaded: r.classList.contains("is-loaded"),
               tags: Array.from(r.querySelectorAll(".ec-tag")).map(t => t.textContent),
               act: (r.querySelector("button") || {}).textContent || "",
               box: (() => { const b = r.querySelector("button").getBoundingClientRect();
                             return [Math.round(b.width), Math.round(b.height)]; })(),
             })),
             open: !!document.getElementById("mgCatOpen"),
             change: !!document.getElementById("mgCatFolder") };
  };
  const lib = await s.p.evaluate(OPEN_LIB);
  const edRow = (lib.rows || []).filter(r => r.name === "one-edition.ec")[0] || {};
  const noEdRow = (lib.rows || []).filter(r => r.name === "another.ec")[0] || {};
  check(lib.step === "open" && lib.rows.length === 2
        && lib.rows.filter(r => r.name === "one-edition.ec").length === 1
        && lib.rows.filter(r => r.name === "another.ec").length === 1
        && lib.rows.every(r => r.act === "Load" && r.box[0] > 0 && r.box[1] > 0 && !r.loaded)
        && (edRow.meta || "").indexOf(FIX_EDITION) === 0 && !DATE_RE.test(edRow.meta || "")
        && DATE_RE.test(noEdRow.meta || "")
        && lib.open && lib.change,
    "2q the Library lists every .ec in the folder, each with the catalog\'s OWN EDITION where the"
    + " file names one (" + JSON.stringify(edRow.meta) + ", the fixture\'s being "
    + JSON.stringify(FIX_EDITION) + ") and the file\'s date on disk where it does not ("
    + JSON.stringify(noEdRow.meta) + "), its size and a Load button, and the folder\'s own two"
    + " controls beside them: " + JSON.stringify(lib));

  /* Loading one from that list: the same dialog every other route ends in, then the catalog. */
  const fromList = await s.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const row = Array.from(document.querySelectorAll("#mgCatList .ec-row"))
      .filter(r => (r.querySelector(".ec-name b") || {}).textContent === "another.ec")[0];
    if (!row) return { step: "no row for another.ec" };
    row.querySelector("button").click(); await wait(2000);
    const subs = document.querySelectorAll("#eCatalogModal .modal-sub");
    const last = subs[subs.length - 1];
    return { step: "clicked", offer: !!document.querySelector("#ecYes"),
             codes: last ? Array.from(last.querySelectorAll("code")).map(c => c.textContent) : null };
  });
  check(fromList.offer && !!fromList.codes && fromList.codes[0] === "another.ec",
    "2q2 and its Load button puts that file\'s offer back on screen past the refusal, named: "
    + JSON.stringify(fromList));
  await s.stop();

  s = await launch(udL);
  const quiet = await s.p.evaluate(SEEN);
  check(!quiet.offer && quiet.cards === 0,
    "2Q control: a relaunch with nothing on disk changed does NOT re-offer (offer " + quiet.offer
    + ", " + quiet.cards + " cards), so the refusal is still doing its work and 2r below is the"
    + " file's date and not the launch");
  await s.stop();

  const touched = new Date();
  fs.utimesSync(path.join(catFolder("back"), "one-edition.ec"), touched, touched);
  s = await launch(udL);
  const again2 = await s.p.evaluate(SEEN);
  const againLine = await s.p.evaluate(() => {
    const subs = document.querySelectorAll("#eCatalogModal .modal-sub");
    const last = subs[subs.length - 1];
    return last ? Array.from(last.querySelectorAll("code")).map(c => c.textContent) : null;
  });
  check(again2.offer && !!againLine && againLine[0] === "one-edition.ec",
    "2r but a file written AFTER the refusal is offered again on the next launch, and the offer"
    + " names it: offer " + again2.offer + ", " + JSON.stringify(againLine));
  await s.stop();

  const udM = newUserData("emptylist");                    // pinned at a folder holding no .ec
  fs.mkdirSync(catFolder("emptylist"), { recursive: true });
  s = await launch(udM);
  const noCard = await s.p.evaluate(() => {
    const box = document.getElementById("emptyCatOffer");
    return { there: !!box, html: box ? box.innerHTML.length : -1,
             shown: !!box && box.getBoundingClientRect().height > 0 };
  });
  const noRows = await s.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById("settingsBtn").click(); await wait(400);
    document.querySelector('#settingsMenu [data-act="manage"]').click(); await wait(1200);
    const fold = document.querySelector('#modalCard details.manage-sec[data-mg="data"]');
    if (!fold) return { step: "no catalog fold" };
    if (!fold.open) fold.querySelector("summary").click();
    await wait(1200);
    return { step: "open", rows: document.querySelectorAll("#mgCatList .ec-row").length,
             empty: (document.querySelector('#modalCard details[data-mg="data"] .manage-secbody > p.manage-empty')
                     || {}).textContent || "" };
  });
  const setPath = await s.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector("#mgClose").click(); await wait(600);
    document.getElementById("settingsBtn").click(); await wait(400);
    document.querySelector('#settingsMenu [data-act="settings"]').click(); await wait(900);
    const fold = document.querySelector('#modalCard details.acc[data-acc="catalog"]');
    if (!fold) return { step: "no catalog fold" };
    if (!fold.open) fold.querySelector("summary").click();
    await wait(900);
    return { step: "open", path: (fold.querySelector(".set-path") || {}).textContent || "",
             list: document.querySelectorAll("#setCatList").length };
  });
  check(noRows.step === "open" && noRows.rows === 0 && noCard.there && noCard.html === 0
        && !noCard.shown && setPath.path === catFolder("emptylist") && setPath.list === 0,
    "2P control: pointed at a folder holding no .ec the Library lists " + noRows.rows
    + " file(s) and the empty state\'s offer is empty and takes no room (" + JSON.stringify(noCard)
    + "), while Settings still names the folder and now carries no list of its own ("
    + JSON.stringify(setPath) + "). So 2p and 2q read the folder and not a fixed list");
  /* Board 406 took the green summary line out of that fold; the sentence for a desk holding no
     catalog at all was the one thing it said that the list cannot. */
  check(noRows.empty.indexOf("No catalog loaded") === 0,
    "2P2 and with nothing loaded the fold still says so in words, the list having nothing to mark: "
    + JSON.stringify(noRows.empty));
  await s.stop();


  /* ---- 2q3 to 2q6: LOADING AND PUTTING DOWN, IN A DESK OF ITS OWN -------------------------
     Its own user-data folder and its own catalog folder, because these legs load, eject and drop
     a third file in: run on the desk above, they would rewrite the state 2Q and 2r are about.
     The boot offer is dismissed with Escape, which records no refusal, so what is proved below
     is the list acting and nothing else. */
  const udLL = newUserData("library");
  placeEc(catFolder("library"), FIX, "one-edition.ec", 5);
  placeEc(catFolder("library"), SAMPLE, "another.ec", 90);
  s = await launch(udLL);
  await s.p.keyboard.press("Escape");
  await sleep(800);
  const lib3 = await s.p.evaluate(OPEN_LIB);
  const taken = await s.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const row = Array.from(document.querySelectorAll("#mgCatList .ec-row"))
      .filter(r => (r.querySelector(".ec-name b") || {}).textContent === "another.ec")[0];
    if (!row) return { step: "no row for another.ec" };
    row.querySelector("button").click(); await wait(2200);
    const y = document.querySelector("#ecYes");
    if (!y) return { step: "no offer" };
    y.click();
    return { step: "accepted" };
  });
  await sleep(6000);
  const listLoaded = await (await s.b.pages())[0].evaluate(SEEN);
  const listKeys = deskKeys(udLL);
  check(lib3.step === "open" && lib3.rows.length === 2 && taken.step === "accepted"
        && listLoaded.cards === SAMPLE_CARDS && listKeys.eCatalogFile === "another.ec"
        && +listKeys.eCatalogFileAt > 0,
    "2q3 loading a file from that list loads THAT file, and the desk on disk records which file"
    + " it was and when it was written: "
    + listLoaded.cards + " cards against the sample\'s " + SAMPLE_CARDS
    + " and the fixture\'s " + FIXTURE_CARDS + ", file "
    + JSON.stringify(listKeys.eCatalogFile) + " at " + JSON.stringify(listKeys.eCatalogFileAt));

  /* The list again, with something loaded: that row is marked and offers Eject instead of Load,
     and the other file, written after it, is marked as the newer one. */
  const lib2 = await (await s.b.pages())[0].evaluate(OPEN_LIB);
  const loadedRow = (lib2.rows || []).filter(r => r.name === "another.ec")[0] || {};
  const otherRow = (lib2.rows || []).filter(r => r.name === "one-edition.ec")[0] || {};
  check(lib2.step === "open" && loadedRow.loaded && loadedRow.act === "Eject"
        && loadedRow.tags.indexOf("Loaded") > -1
        && !otherRow.loaded && otherRow.act === "Load" && otherRow.tags.indexOf("Newer") > -1,
    "2q4 the loaded file is the marked row and the one offering Eject, and the file written after"
    + " it is marked newer: " + JSON.stringify([loadedRow, otherRow]));

  /* The watch feeds that list: a catalog dropped into the folder while the Library stands open.
     NOT another copy of the fixture: the shell hands the page a catalog only when the folder's
     newest reads differently from what it last sent, so a file whose bytes are already there is
     a change nothing downstream can hear. */
  placeEc(catFolder("library"), SAMPLE, "arrived-later.ec", 0);
  await sleep(6000);
  const grown = await (await s.b.pages())[0].evaluate(() =>
    Array.from(document.querySelectorAll("#mgCatList .ec-row .ec-name b")).map(b => b.textContent));
  check(grown.indexOf("arrived-later.ec") > -1 && grown.length === 3,
    "2q5 a file arriving in the folder reaches the open Library through the host\'s watch: "
    + JSON.stringify(grown));

  /* And putting it down brings the empty screen\'s offer back, which is the whole item. */
  await (await s.b.pages())[0].evaluate(() => { window.confirm = () => true; ejectCatalog(); });
  await sleep(7000);
  let ejPage = (await s.b.pages())[0];
  const afterEject = await ejPage.evaluate(SEEN);
  await ejPage.evaluate(() => { const n = document.querySelector("#ecNo"); if (n) n.click(); });
  await sleep(1200);
  const cardBack = await ejPage.evaluate(CARD_OFFER);
  const ejKeys = deskKeys(udLL);
  check(afterEject.cards === 0 && cardBack.step === "read" && !!cardBack.name
        && cardBack.load && !ejKeys.eCatalogFile,
    "2q6 ejecting empties the desk, forgets which file was loaded and puts the offer back on the"
    + " empty screen: " + afterEject.cards + " cards, file key "
    + JSON.stringify(ejKeys.eCatalogFile || "") + ", offering " + JSON.stringify(cardBack.name));
  await s.stop();

  /* ---- 2q7 to 2q9: WHAT THE LOADED ROW SAYS, board item 406 --------------------------------
     A summary line above this list carried the catalog's name, edition and four counts while the
     loaded row under it carried the file's time on disk, so one catalog wore two dates. The
     counts moved into the row and the line went. Its own desk and its own folder, because the
     legs above are about a folder nothing is loaded from, and this one has to load. */
  const udLE = newUserData("loadedrow");
  placeEc(catFolder("loadedrow"), FIX, "one-edition.ec", 5);
  placeEc(catFolder("loadedrow"), SAMPLE, "another.ec", 90);
  s = await launch(udLE);
  const tookRow = await s.p.evaluate(() => {
    const y = document.querySelector("#ecYes");
    if (!y) return false;
    y.click();
    return true;
  });
  await sleep(6000);
  const libL = await (await s.b.pages())[0].evaluate(OPEN_LIB);
  const summary = await (await s.b.pages())[0].evaluate(() =>
    Array.from(document.querySelectorAll('#modalCard details[data-mg="data"] .manage-secbody > p.manage-empty'))
      .map(p => p.textContent));
  const onRow = (libL.rows || []).filter(r => r.loaded)[0] || {};
  const offRow = (libL.rows || []).filter(r => !r.loaded)[0] || {};
  /* Read as the parts the line is built from rather than as one string: the separator is a middot
     between ordinary spaces and every count holds its number to its noun with a no-break space,
     so a part is "258\u00a0cards" and the pieces are named one at a time. */
  const NBSP = String.fromCharCode(160);
  const parts = (onRow.meta || "").split(" " + String.fromCharCode(183) + " ");
  const counted = re => parts.filter(x => re.test(x)).length;
  check(tookRow && libL.step === "open" && onRow.name === "one-edition.ec"
        && parts.length === 5 && parts[0] === FIX_EDITION
        && parts[1] === FIXTURE_CARDS + NBSP + "cards"
        && counted(new RegExp("^[0-9]+" + NBSP + "macros?$")) === 1
        && counted(new RegExp("^[0-9]+" + NBSP + "intents?$")) === 1
        && counted(new RegExp("^[0-9]+" + NBSP + "(categories|category)$")) === 1
        && !DATE_RE.test(onRow.meta || ""),
    "2q7 the loaded row's small print is the catalog's own edition and then the four counts the"
    + " summary line above used to carry, and no disk time: " + JSON.stringify(onRow.meta)
    + " in " + parts.length + " parts split on the middot, against the fixture's edition "
    + JSON.stringify(FIX_EDITION) + " and its " + FIXTURE_CARDS + " cards");
  check(libL.rows.length === 2 && offRow.name === "another.ec"
        && DATE_RE.test(offRow.meta || "")
        && (offRow.meta || "").indexOf(String(SAMPLE_CARDS)) > -1,
    "2q8 and the row beside it, whose file names no edition, still reads its date on disk and its"
    + " size: " + JSON.stringify(offRow.meta) + " against the sample's " + SAMPLE_CARDS + " cards");
  check(summary.length === 0,
    "2q9 with a catalog loaded the fold carries no summary paragraph at all, the row being where"
    + " the catalog is described: " + JSON.stringify(summary));
  await s.stop();

  /* ---- 2s to 2s6: THE LIBRARY CLOSES WHEN SOMEBODY CLOSES IT, board item 407 ---------------
     Import and Eject shut it, because both restart the app and a reload cannot carry a screen.
     One desk for the lot: every leg below opens the Library, acts, and reads whether the dialog
     and the fold it was in are still there afterwards. Two controls in that section cannot be
     driven at all and are not claimed here - Open folder and Change folder end in dialogs the
     operating system owns - and two more exist only in a browser, the file watch having no
     handle under this host. */

  phase("[2f/7] the Library stays open");
  const LIB_STATE = () => {
    const m = document.getElementById("modal");
    const fold = document.querySelector('#modalCard details.manage-sec[data-mg="data"]');
    const rows = Array.from(document.querySelectorAll("#mgCatList .ec-row"));
    return { open: !!m && !m.hidden && !!fold, foldOpen: !!fold && fold.open, rows: rows.length,
             loaded: rows.filter(r => r.classList.contains("is-loaded"))
               .map(r => (r.querySelector(".ec-name b") || {}).textContent || ""),
             empty: (document.querySelector('#modalCard details[data-mg="data"] .manage-secbody > p.manage-empty')
                     || {}).textContent || "",
             over: !!document.getElementById("eCatalogModal") };
  };
  const udSO = newUserData("stayopen");
  placeEc(catFolder("stayopen"), FIX, "one-edition.ec", 5);
  placeEc(catFolder("stayopen"), SAMPLE, "another.ec", 90);
  s = await launch(udSO);
  await s.p.keyboard.press("Escape");                 // the boot offer, refused without a record
  await sleep(800);

  /* Load, from the row: the route every import also takes, so what it proves about the reload
     it proves about all of them. The offer it raises is answered here, the way a person does. */
  await s.p.evaluate(OPEN_LIB);
  const beforeLoad = await s.p.evaluate(LIB_STATE);
  await s.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const row = Array.from(document.querySelectorAll("#mgCatList .ec-row"))
      .filter(r => (r.querySelector(".ec-name b") || {}).textContent === "one-edition.ec")[0];
    row.querySelector("button").click(); await wait(2200);
    const y = document.querySelector("#ecYes"); if (y) y.click();
  });
  await sleep(7000);
  const afterLoad = await (await s.b.pages())[0].evaluate(LIB_STATE);
  check(beforeLoad.open && beforeLoad.foldOpen && afterLoad.open && afterLoad.foldOpen
        && afterLoad.loaded.join(",") === "one-edition.ec",
    "2s Load on a row leaves the Library open at the fold it was opened at, and the list comes"
    + " back marking what was just loaded: before " + JSON.stringify(beforeLoad)
    + ", after " + JSON.stringify(afterLoad));

  /* Import. The button itself ends in a file dialog the operating system owns, so the leg drives
     the reader that dialog hands its text to - which is where the reload, and the close, were. */
  const imported = await (await s.b.pages())[0].evaluate(t => {
    window.confirm = () => true;
    return window.importCatalogText(t, "brought-in.ec");
  }, fs.readFileSync(SAMPLE, "utf8"));
  await sleep(7000);
  const afterImport = await (await s.b.pages())[0].evaluate(LIB_STATE);
  const importSeen = await (await s.b.pages())[0].evaluate(SEEN);
  check(imported === true && afterImport.open && afterImport.foldOpen
        && importSeen.cards === SAMPLE_CARDS,
    "2s2 importing a catalog from inside the Library leaves it open too, showing the catalog that"
    + " just arrived: " + importSeen.cards + " cards against the sample's " + SAMPLE_CARDS
    + ", " + JSON.stringify(afterImport));

  /* The two that open a modal of their own on top, and must not take the Library down with it. */
  const stacked = await (await s.b.pages())[0].evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    for (const id of ["mgExportCatalog", "mgExportHtml"]) {
      const b = document.getElementById(id);
      if (!b) { out[id] = { there: false }; continue; }
      b.click(); await wait(700);
      const own = !!document.getElementById("eNameModal");
      const fold = document.querySelector('#modalCard details.manage-sec[data-mg="data"]');
      out[id] = { there: true, own, lib: !!fold, foldOpen: !!fold && fold.open };
      const no = document.getElementById("eNameNo"); if (no) no.click(); await wait(500);
    }
    return out;
  });
  check(stacked.mgExportCatalog.own && stacked.mgExportCatalog.lib && stacked.mgExportCatalog.foldOpen
        && stacked.mgExportHtml.own && stacked.mgExportHtml.lib && stacked.mgExportHtml.foldOpen,
    "2s3 Export catalog and Build integrated copy raise a dialog of their own ON TOP of the"
    + " Library, which is still there and still at its fold: " + JSON.stringify(stacked));

  /* An editor opened from the Library takes the screen and hands it back, which is a different
     promise from the four above and was already built: it is read here so that it stays built. */
  const edTrip = await (await s.b.pages())[0].evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const lib = () => document.querySelector('#modalCard details.manage-sec[data-mg="data"]');
    const before = !!lib();
    const add = document.getElementById("mgAddIntent");
    if (!add) return { step: "no New intent button" };
    add.click(); await wait(1000);
    const during = !!lib(), editor = !!document.getElementById("ieCancel");
    if (editor) document.getElementById("ieCancel").click();
    await wait(1400);
    return { step: "read", before, during, editor, after: !!lib(),
             foldOpen: !!lib() && lib().open };
  });
  check(edTrip.step === "read" && edTrip.before && !edTrip.during && edTrip.editor
        && edTrip.after && edTrip.foldOpen,
    "2s4 an editor opened from the Library replaces it and gives it back on closing, at the same"
    + " fold - the promise Maxim says was already built: " + JSON.stringify(edTrip));

  /* Board 412: the section's red Eject is gone; the loaded row's is the one that stays. */
  const noSectionEject = await (await s.b.pages())[0].evaluate(() => ({
    section: !!document.getElementById("mgEject"),
    row: !!document.querySelector("#mgCatList button[data-ec-eject]")
  }));
  check(!noSectionEject.section && noSectionEject.row,
    "2t the Library open has no #mgEject, and the loaded row still offers Eject: "
    + JSON.stringify(noSectionEject));

  /* Eject from that row, which is the one that also raises the folder's offer on the way back:
     the Library is UNDER it rather than replaced by it, and the section says in words that
     nothing is loaded. */
  await (await s.b.pages())[0].evaluate(() => {
    window.confirm = () => true;
    const b = document.querySelector("#mgCatList button[data-ec-eject]");
    if (b) b.click();
  });
  await sleep(8000);
  const afterEject2 = await (await s.b.pages())[0].evaluate(LIB_STATE);
  check(afterEject2.open && afterEject2.foldOpen && afterEject2.over
        && afterEject2.loaded.length === 0
        && afterEject2.empty.indexOf("No catalog loaded") === 0,
    "2s5 the row's Eject leaves it open under the offer the empty desk raises, with no row marked"
    + " and the empty state in words: " + JSON.stringify(afterEject2));
  await (await s.b.pages())[0].evaluate(() => { const n = document.querySelector("#ecNo"); if (n) n.click(); });
  await sleep(1000);

  /* CLEAR LOCAL MEMORY IS NOT DRIVEN HERE, and the reason is the harness rather than the app:
     the wipe forgets every preference, the pinned catalog folder among them, so the relaunch
     would read the real Documents folder of whoever is at this desk. It reaches the same writer
     Eject does, one line apart in local-memory.js, and 2s5 above is that writer end to end. */

  /* THE CONTROL, and the whole reason the legs above are not vacuous: the three ways a person
     closes this dialog still close it. */
  const closed = await (await s.b.pages())[0].evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    const open = async () => {
      document.getElementById("settingsBtn").click(); await wait(400);
      document.querySelector('#settingsMenu [data-act="manage"]').click(); await wait(1000);
      return !!document.querySelector('#modalCard details.manage-sec[data-mg="data"]');
    };
    out.openedA = await open();
    document.getElementById("mgClose").click(); await wait(700);
    out.afterClose = !!document.querySelector('#modalCard details.manage-sec[data-mg="data"]');
    out.openedB = await open();
    const x = document.getElementById("modalX") || document.querySelector("#modalCard .modal-x");
    out.hasX = !!x;
    if (x) { x.click(); await wait(700); }
    out.afterX = !!document.querySelector('#modalCard details.manage-sec[data-mg="data"]');
    return out;
  });
  const reopened = await (await s.b.pages())[0].evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById("settingsBtn").click(); await wait(400);
    document.querySelector('#settingsMenu [data-act="manage"]').click(); await wait(1000);
    return !!document.querySelector('#modalCard details.manage-sec[data-mg="data"]');
  });
  await (await s.b.pages())[0].keyboard.press("Escape");
  await sleep(900);
  const afterEsc = await (await s.b.pages())[0].evaluate(() =>
    !!document.querySelector('#modalCard details.manage-sec[data-mg="data"]'));
  check(closed.openedA && !closed.afterClose && closed.openedB && closed.hasX && !closed.afterX
        && reopened && !afterEsc,
    "2s6 control: Close, the X and Esc all still close it, so 2s to 2s5 are a dialog that stays"
    + " open rather than one nothing can shut: " + JSON.stringify(closed)
    + ", reopened " + reopened + ", after Esc " + afterEsc);
  await s.stop();

  /* ---- 2n to 2n3: THE RING THE MOUSE DID NOT ASK FOR, board item 407's neighbour 408 --------
     Closing a dialog hands focus back to whatever opened it, by script, and Chromium paints a
     script focus() as keyboard focus whenever the last thing the user did was press a key. Escape
     is a key, so a dialog opened and dismissed with the mouse left a white ring on the Menu
     button. EVERY EVENT HERE IS A REAL ONE, dispatched through the protocol: the whole subject is
     what the browser thinks the last interaction was, and a synthesised el.click() is not one. */

  phase("[2g/7] the focus ring after a dialog");
  const realClick = async (page, sel) => {
    const at = await page.evaluate(q => {
      const el = document.querySelector(q);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sel);
    if (!at) return false;
    await page.mouse.click(at.x, at.y);
    return true;
  };
  const RING = q => {
    const el = document.querySelector(q);
    return { there: !!el, active: !!el && document.activeElement === el,
             ring: !!el && el.matches(":focus-visible"),
             outline: el ? getComputedStyle(el).outlineStyle : "?" };
  };
  const udR = newUserData("ring");
  placeEc(catFolder("ring"), FIX, "one-edition.ec", 5);
  s = await launch(udR);
  const tookR = await s.p.evaluate(() => { const y = document.querySelector("#ecYes"); if (!y) return false; y.click(); return true; });
  await sleep(6000);
  let rp = (await s.b.pages())[0];

  const mouseTrip = async (act, how) => {
    await realClick(rp, "#settingsBtn"); await sleep(500);
    await realClick(rp, '#settingsMenu [data-act="' + act + '"]'); await sleep(1500);
    const open = await rp.evaluate(() => !document.getElementById("modal").hidden);
    if (how === "esc") await rp.keyboard.press("Escape");
    else await realClick(rp, "#modalX");
    await sleep(900);
    return { act, how, open, btn: await rp.evaluate(RING, "#settingsBtn") };
  };
  const mLibEsc = await mouseTrip("manage", "esc");
  const mLibX = await mouseTrip("manage", "x");
  const mSetEsc = await mouseTrip("settings", "esc");
  const mSetX = await mouseTrip("settings", "x");
  const noRing = [mLibEsc, mLibX, mSetEsc, mSetX];
  check(noRing.every(r => r.open && r.btn.active && !r.btn.ring && r.btn.outline === "none"),
    "2n a dialog opened with the mouse gives the Menu button its focus back without a ring,"
    + " whichever way it is closed - Escape is a key and used to be enough to paint one: "
    + JSON.stringify(noRing));

  /* THE OTHER HALF, and the one that makes the leg above a rule rather than a blanket
     suppression: a dialog opened FROM THE KEYBOARD hands the ring back with the focus. The Menu
     button is opened and shut with the mouse first, so it holds focus WITHOUT a ring, and the
     dialog is then opened on the chord that makes a new card - a real key press, with a real
     control to come back to. */
  await realClick(rp, "#settingsBtn"); await sleep(500);
  await realClick(rp, "#settingsBtn"); await sleep(500);
  const held = await rp.evaluate(RING, "#settingsBtn");
  await rp.keyboard.down("Alt"); await rp.keyboard.press("KeyN"); await rp.keyboard.up("Alt");
  await sleep(1800);
  const edOpen = await rp.evaluate(() => !document.getElementById("modal").hidden);
  await rp.evaluate(() => { window.confirm = () => true; });
  await rp.keyboard.press("Escape"); await sleep(1400);
  const afterKbd = await rp.evaluate(RING, "#settingsBtn");
  check(edOpen && held.active && !held.ring && afterKbd.active && afterKbd.ring
        && afterKbd.outline === "solid",
    "2n2 a dialog opened by a key hands the ring back with the focus, which is what a ring is"
    + " for: the same button held focus with no ring after the clicks ("
    + JSON.stringify(held) + ") and wears one after the card editor opened on a chord and was"
    + " dismissed (" + JSON.stringify(afterKbd) + ")");
  await s.stop();

  /* ---- 2t to 2v: A .ec OPENED FROM OUTSIDE, board item 380 ---------------------------------
     The installer registers the extension; what the app does with the path it is then handed is
     what can be driven here. The file is planted OUTSIDE the catalog folder this launch is pinned
     at, so nothing but the argument can put it on screen, and the control is the same launch
     without it. */

  phase("[2e/7] a .ec handed to the app on the command line");
  const AWAY = path.join(LAB, "away");
  const awayEc = placeEc(AWAY, FIX, "opened-by-hand.ec", 2);
  const udN = newUserData("openwith");
  s = await launch(udN, [awayEc]);
  const opened = await s.p.evaluate(SEEN);
  const openedLine = await s.p.evaluate(() => {
    const subs = document.querySelectorAll("#eCatalogModal .modal-sub");
    const last = subs[subs.length - 1];
    return last ? Array.from(last.querySelectorAll("code")).map(c => c.textContent) : null;
  });
  check(opened.offer && opened.catalogCards === FIXTURE_CARDS
        && !!openedLine && openedLine[0] === "opened-by-hand.ec" && openedLine[1] === AWAY,
    "2t a .ec named on the command line is what this launch is offered, named and placed: offer "
    + opened.offer + ", " + opened.catalogCards + " cards against the fixture's " + FIXTURE_CARDS
    + ", line " + JSON.stringify(openedLine));
  /* The FIRST launch reaches that file through the search order, which openedWith heads, so the
     line is the ordinary "catalog read from". The second-instance path has a line of its own and
     is read at 2v. */
  check(s.said.some(l => l.indexOf("catalog read from " + awayEc) > -1),
    "2u and the shell says it read that file, by path, ahead of everything in the folder");
  await s.stop();

  const udO = newUserData("openwith2");
  s = await launch(udO);
  const bare2 = await s.p.evaluate(SEEN);
  check(!bare2.catalogThere && !bare2.offer && bare2.cards === 0,
    "2T control: the same app on the same pinned folder, launched WITHOUT the argument, finds no"
    + " catalog (" + bare2.catalogThere + "), raises no offer (" + bare2.offer + ") and shows "
    + bare2.cards + " cards. So 2t is the argument and not the folder");

  /* Board item 383. The empty Etiuda in front of us is where that sentence lives, so it is
     measured here rather than in a lab of its own: how many line boxes it occupies at this
     window's own width, and how wide it would be on one line, which is the number that says at
     what width it starts to wrap. */
  const line = await s.p.evaluate(() => {
    const span = document.querySelector("#list .empty span");
    if (!span) return { step: "no folder line" };
    const code = span.querySelector("code.open-folder");
    const lh = parseFloat(getComputedStyle(span).lineHeight) || 0;
    const h = span.getBoundingClientRect().height;
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:" + getComputedStyle(span).font;
    probe.textContent = span.textContent;
    document.body.appendChild(probe);
    const nowrap = Math.ceil(probe.getBoundingClientRect().width);
    probe.remove();
    return { step: "read", lines: lh ? Math.round(h / lh) : -1, lh: Math.round(lh), h: Math.round(h),
             nowrap: nowrap, width: window.innerWidth,
             short: code ? code.textContent : null, full: code ? code.getAttribute("title") : null,
             linked: !!code && code.getAttribute("role") === "button",
             text: span.textContent };
  });
  check(line.step === "read" && line.lines === 1 && !!line.short && !!line.full
        && line.short !== line.full && line.linked,
    "2w the empty state's folder line is one line at this window's " + line.width + " px ("
    + line.lines + " line box of " + line.lh + " px in " + line.h + " px), names the folder short"
    + " as " + JSON.stringify(line.short) + " with the full path on hover ("
    + JSON.stringify(line.full) + ") and as something clickable (" + line.linked
    + "). On one line it measures " + line.nowrap + " px, so it wraps below about "
    + (line.nowrap + 32) + " px of window");

  /* The second copy: it must hand its path over and go, or two Etiudas write one desk file. */
  port++;
  const second = spawn(path.join(APPDIR, "Etiuda.exe"),
    ["--user-data-dir=" + udO, awayEc], { stdio: ["ignore", "pipe", "pipe"] });
  live.add(second.pid);
  let secondExit = null;
  second.on("exit", code => { secondExit = code === null ? "signal" : code; });
  await sleep(9000);
  const handed = await (await s.b.pages())[0].evaluate(SEEN);
  const handedLine = await (await s.b.pages())[0].evaluate(() => {
    const subs = document.querySelectorAll("#eCatalogModal .modal-sub");
    const last = subs[subs.length - 1];
    return last ? Array.from(last.querySelectorAll("code")).map(c => c.textContent) : null;
  });
  check(secondExit !== null && handed.offer && !!handedLine && handedLine[0] === "opened-by-hand.ec"
        && s.said.some(l => l.indexOf("opened with " + awayEc) > -1),
    "2v a SECOND copy started on that path exits by itself (exit " + JSON.stringify(secondExit)
    + "), the copy already running says it was opened with that path and is offered the file,"
    + " named: " + JSON.stringify(handedLine));
  killPid(second.pid);
  await s.stop();

  /* ---- 2x to 2z: THE COMMAND LINE THE ASSOCIATION WRITES, board item 393 --------------------
     2t to 2v hand the path through a spawn that quotes every argument. The registered open
     command does not: it names the exe UNQUOTED with "%1" after it, so a copy installed under a
     path holding a space is handed an argv split at that space. That shape is launched here
     against the two desks a person is actually at - one that declined this catalog once, one
     that already has it - because a double-click answered both with silence. */

  phase("[2f/7] the shape the .ec association launches");
  const SPACED = path.join(LAB, "Etiuda Program");
  let assocExe = path.join(APPDIR, "Etiuda.exe");
  try {
    execFileSync("cmd", ["/c", "mklink", "/J", SPACED, APPDIR], { stdio: "ignore" });
    if (fs.existsSync(path.join(SPACED, "Etiuda.exe"))) assocExe = path.join(SPACED, "Etiuda.exe");
  } catch (e) { /* a desk that refuses a junction still gets the shape, without the split */ }
  note("the association's exe here is " + assocExe + ", whose path "
    + (assocExe.indexOf(" ") > -1 ? "HOLDS a space, so the child's argv splits at it as a real"
       + " install under Program Files does" : "holds NO space, so this leg is the quoting shape"
       + " without the split"));
  const udS = newUserData("assoc");
  const assocEc = placeEc(catFolder("assoc"), FIX, "double-clicked.ec", 3);
  s = await launch(udS);
  const assocNo = await s.p.evaluate(() => {
    const n = document.querySelector("#ecNo");
    if (!n) return false;
    n.click();
    return true;
  });
  await sleep(1500);
  await s.stop();

  s = await launch(udS);
  const stillNo = await s.p.evaluate(SEEN);
  check(assocNo && !stillNo.offer && stillNo.cards === 0,
    "2X control: the refusal is in force. The same file sits in the pinned folder, older than the"
    + " \"no\", and a launch that does not name it raises no offer (" + stillNo.offer + ") and"
    + " shows " + stillNo.cards + " cards. So 2x below is the argument and nothing else");
  await s.stop();

  s = await launch(udS, ['"' + assocEc + '"'], null, assocExe);
  const assocCold = await s.p.evaluate(SEEN);
  const assocLine = await s.p.evaluate(() => {
    const subs = document.querySelectorAll("#eCatalogModal .modal-sub");
    const last = subs[subs.length - 1];
    return last ? Array.from(last.querySelectorAll("code")).map(c => c.textContent) : null;
  });
  check(assocCold.offer && !!assocLine && assocLine[0] === "double-clicked.ec"
        && s.said.some(l => l.indexOf("catalog read from " + assocEc) > -1),
    "2x a COLD start in the association's own shape offers that file past the remembered refusal,"
    + " named: offer " + assocCold.offer + ", line " + JSON.stringify(assocLine));
  await s.stop();

  s = await launch(udS);
  const warmBefore = await s.p.evaluate(SEEN);
  const second393 = spawn(assocExe, ["--user-data-dir=" + udS, '"' + assocEc + '"'],
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv(), windowsVerbatimArguments: true });
  live.add(second393.pid);
  let exit393 = null;
  second393.on("exit", code => { exit393 = code === null ? "signal" : code; });
  await sleep(9000);
  const warmAfter = await (await s.b.pages())[0].evaluate(SEEN);
  const warmLine = await (await s.b.pages())[0].evaluate(() => {
    const subs = document.querySelectorAll("#eCatalogModal .modal-sub");
    const last = subs[subs.length - 1];
    return last ? Array.from(last.querySelectorAll("code")).map(c => c.textContent) : null;
  });
  check(!warmBefore.offer && exit393 !== null && warmAfter.offer
        && !!warmLine && warmLine[0] === "double-clicked.ec"
        && s.said.some(l => l.indexOf("opened with " + assocEc) > -1),
    "2y and a WARM one: the copy already running was raising no offer (" + warmBefore.offer
    + "), a second copy in the same shape exits by itself (exit " + JSON.stringify(exit393)
    + ") and the running copy is offered that file past the same refusal, named: "
    + JSON.stringify(warmLine));
  killPid(second393.pid);
  await s.stop();

  /* The other silence, and the one a person meets first: the file they double-clicked is already
     what is loaded, so there is nothing to offer. An explicit act is still answered. */
  const udT = newUserData("assoc2");
  const assocEc2 = placeEc(catFolder("assoc2"), FIX, "already-loaded.ec", 3);
  s = await launch(udT);
  const tookIt = await s.p.evaluate(() => {
    const y = document.querySelector("#ecYes");
    if (!y) return false;
    y.click();
    return true;
  });
  await sleep(6000);
  await s.stop();

  /* The page is taken from the browser rather than from the launch: accepting reloads the
     document, so the handle this leg opened with is detached by the time it is asked. */
  s = await launch(udT, ['"' + assocEc2 + '"'], null, assocExe);
  const matched = await (await s.b.pages())[0].evaluate(() => ({
    offer: !!document.querySelector("#ecYes"),
    cards: document.querySelectorAll("#list .card").length,
    toast: (document.getElementById("toast") || {}).textContent || "",
  }));
  check(tookIt && !matched.offer && matched.cards === FIXTURE_CARDS
        && matched.toast.indexOf("already have") > -1,
    "2z where that file is what is already loaded there is nothing to offer (" + matched.offer
    + ") and the double-click is answered in words instead: " + JSON.stringify(matched.toast)
    + ", with " + matched.cards + " cards still on screen");
  await s.stop();

  /* ---- the control for the catalog legs --------------------------------------------------- */

  phase("[3/7] the controls for 1 and 2");
  const udC = newUserData("c");
  s = await launch(udC);
  const bare = await s.p.evaluate(SEEN);
  check(!bare.catalogThere && bare.cards === 0 && !bare.offer
        && s.said.some(l => /no catalog found/.test(l)),
    "2C control: with an empty user-data folder there is no catalog, no offer and "
    + bare.cards + " cards, and the shell says so. So 2a and 2b are not passing on air");
  /* The good pin, in a launch of the same app: the control for every pin leg below. The reload
     is what puts the parse-time refusals in reach of the listener. */
  await s.p.reload({ waitUntil: "load" });
  await sleep(3000);
  const good = await s.p.evaluate(SEEN);
  const goodInline = s.inline().length;
  check(good.booted && goodInline === 0 && !good.refusal.en && !good.refusal.pl,
    "5C control: on the good pin the engine boots (E_VERSION " + good.booted + "), Chromium refuses "
    + goodInline + " inline scripts, and the refusal document is nowhere on screen, so 5d and 5e"
    + " below are not reading a page the shell always serves");
  note("a healthy boot logs " + s.errs.length + " console error(s), the sibling catalog scripts the"
    + " engine asks for at boot and the policy refuses by design");
  await s.stop();

  const udD = newUserData("d");
  await variant(w => {
    const f = path.join(w, "shell", "main.js");
    const src = fs.readFileSync(f, "utf8");
    const was = "const framed = !!readPin().why;";
    const hits = src.split(was).length - 1;
    if (hits !== 1) throw new Error(was + " matched " + hits + " times in the asar's shell/main.js, expected 1");
    fs.writeFileSync(f, src.split(was).join("const framed = true;"), "utf8");
  });
  /* ON SCREEN, DELIBERATELY: 1c's control reads the caption's depth, and a window nobody showed
     has no rectangle to read. Two of the five in this file. */
  s = await launch(udD, [], { ETIUDA_TEST_OFFSCREEN: "" });
  const framedSeen = await s.p.evaluate(SEEN);
  const framed = windowFacts(s.pid);
  check(framed.topInset > 20 && framedSeen.ctl.every(c => c && c.w > 0 && c.top === 0) && framedSeen.bandTop === 0,
    "1C control: with frame: true the same app has a caption " + framed.topInset
    + " px deep, while the three controls and the band still read the same ("
    + JSON.stringify(framedSeen.ctl[0]) + ", band top " + framedSeen.bandTop
    + "). So 1c measures the window and not the engine");
  await s.stop();

  /* The other half of the window control: the same frameless window with the three controls cut
     out of the artefact it serves. 1c stays at 0 and 1a goes empty, so the two checks are not
     reading each other. */
  await variant(w => {
    const f = path.join(w, "engine", "etiuda.html");
    const html = fs.readFileSync(f, "utf8");
    const at = html.indexOf('<div class="win-ctl"');
    if (at < 0) throw new Error('<div class="win-ctl" is not in the artefact');
    const end = html.indexOf("</div>", at);
    if (end < 0) throw new Error("the win-ctl block does not close");
    const cut = html.slice(0, at) + html.slice(end + 6);
    if (/id="winMin"|id="winMax"|id="winClose"/.test(cut)) throw new Error("the three ids survived the cut");
    fs.writeFileSync(f, cut, "utf8");
  });
  /* ON SCREEN, DELIBERATELY: the other half of the window control reads the same inset. Three. */
  s = await launch(newUserData("nocontrols"), [], { ETIUDA_TEST_OFFSCREEN: "" });
  const cutSeen = await s.p.evaluate(SEEN);
  const cutFacts = windowFacts(s.pid);
  check(cutSeen.ctl.every(c => c === null) && cutFacts.topInset === 0 && cutSeen.bandTop === 0,
    "1D control: with the three controls cut out of the served artefact 1a's reading goes to "
    + JSON.stringify(cutSeen.ctl) + " while the window is still frameless (top inset "
    + cutFacts.topInset + ") and the band is still at y" + cutSeen.bandTop);
  await s.stop();
  pristine();

  /* ---- 4: the carry ------------------------------------------------------------------------ */

  phase("[4/7] the carry from a 1.16.7 desk");
  const PB = { pbTheme: "dark", pbUiLang: "pl", pbGlassOff: "1" };
  const udE = newUserData("e", dir => fs.writeFileSync(path.join(dir, "desk.json"),
    JSON.stringify({ kind: "etiuda-desk", schema: 1, app: "planted", saved: "2026-09-14T00:00:00.000Z", keys: PB }), "utf8"));
  s = await launch(udE);
  const carried = await s.p.evaluate(SEEN);
  const k1 = deskKeys(udE);
  check(k1.eTheme === "dark" && k1.eUiLang === "pl" && k1.eGlassOff === "1"
        && k1.pbTheme === "dark" && k1.pbUiLang === "pl" && k1.pbGlassOff === "1" && k1["e~carried"] === "1",
    "4a the first launch carries all three keys and copies rather than moves them (eTheme "
    + k1.eTheme + ", pbTheme " + k1.pbTheme + ", marker " + k1["e~carried"] + "), read off the disk");
  check(carried.theme === "dark" && carried.lang === "pl",
    "4b and it reached the screen, not only the file: theme " + carried.theme + ", lang " + carried.lang);
  await s.stop();

  /* The copies removed, the marker kept: the marker is the only thing that can stop a carry. */
  const k2 = deskKeys(udE);
  ["eTheme", "eUiLang", "eGlassOff"].forEach(k => { delete k2[k]; });
  writeDesk(udE, k2);
  s = await launch(udE);
  const again = deskKeys(udE);
  check(again.eTheme === undefined && again.eUiLang === undefined && again.eGlassOff === undefined
        && again.pbTheme === "dark" && again["e~carried"] === "1",
    "4c and not again: with the copies deleted and the marker kept, a relaunch does not put them back (eTheme "
    + JSON.stringify(again.eTheme) + ", pbTheme still " + JSON.stringify(again.pbTheme) + ")");
  await s.stop();

  const k3 = deskKeys(udE);
  delete k3["e~carried"];
  writeDesk(udE, k3);
  s = await launch(udE);
  const back = deskKeys(udE);
  check(back.eTheme === "dark" && back.eUiLang === "pl" && back.eGlassOff === "1",
    "4C control: with the marker deleted too the copies do come back (eTheme " + JSON.stringify(back.eTheme)
    + "), so 4c is the marker's doing and not the pb keys having gone");
  await s.stop();

  /* ---- 5: the pin -------------------------------------------------------------------------- */

  /* A LAB FOLDER'S NAME REACHES THE SHELL'S STDOUT, because it prints the catalog folder and the
     desk file it read, so check 5b's "says nothing about the pin" is answered by a folder called
     ud-pin1 as readily as by a real line. The names below avoid the words it looks for. */
  phase("[5/7] a pin that does not match the artefact");
  const pinOf = w => JSON.parse(fs.readFileSync(path.join(w, "engine", "etiuda.csp.json"), "utf8"));
  const putPin = (w, doc) => fs.writeFileSync(path.join(w, "engine", "etiuda.csp.json"), JSON.stringify(doc), "utf8");

  /* The BUNDLE's hash. This is the blank window the lead engineer's report called open. */
  await variant(w => { const d = pinOf(w); d.hashes[1] = d.hashes[1].replace(/^'sha256-./, "'sha256-A"); putPin(w, d); });
  s = await launch(newUserData("stalebundle"));
  await s.p.reload({ waitUntil: "load" });
  await sleep(3000);
  const stale = await s.p.evaluate(SEEN);
  check(!stale.booted && !stale.eHost && s.inline().length >= 1,
    "5a a stale hash for the app script refuses it: the engine does not boot (E_VERSION "
    + stale.booted + "), and Chromium logged " + s.inline().length + " inline refusal(s)");
  check(!s.said.some(l => /pin|hash/i.test(l)),
    "5b and the shell itself says nothing about it: " + s.said.filter(l => /pin|hash/i.test(l)).length
    + " line(s) on its own output name the pin. The window shows " + stale.visibleChars
    + " characters of the template's own text and no message, so a person sees a broken app and no reason");
  await s.stop();

  /* The BOOT GUARD's hash, which is the first of the two, and a different failure entirely. */
  await variant(w => { const d = pinOf(w); d.hashes[0] = d.hashes[0].replace(/^'sha256-./, "'sha256-A"); putPin(w, d); });
  s = await launch(newUserData("staleguard"));
  await s.p.reload({ waitUntil: "load" });
  await sleep(3000);
  const guardless = await s.p.evaluate(SEEN);
  check(guardless.booted && guardless.eHost && s.inline().length >= 1,
    "5c a stale hash for the BOOT GUARD does not stop the app at all: it boots (E_VERSION "
    + guardless.booted + ", e-host " + guardless.eHost + ") with the rescue layer silently gone, and the only"
    + " trace is " + s.inline().length + " line(s) in a console nobody has. This check asserts the"
    + " measurement so that a change to it reddens");
  await s.stop();

  /* A pin that will not parse. Both this and the one below used to be answered by serving the
     engine under script-src 'none', which is a window with nothing in it: the policy was right
     and the person had no way to know anything had happened. */
  await variant(w => fs.writeFileSync(path.join(w, "engine", "etiuda.csp.json"), "{ this is not json", "utf8"));
  /* ON SCREEN, DELIBERATELY: this launch serves 5d and 5f, and 5f measures the refusal window's
     caption, which board item 384 put there. Four of the five; the fifth is 1g's own control. */
  s = await launch(newUserData("unreadable"), [], { ETIUDA_TEST_OFFSCREEN: "" });
  await s.p.reload({ waitUntil: "load" });
  await sleep(3000);
  const nopin = await s.p.evaluate(SEEN);
  const nopinWindow = windowFacts(s.pid);
  check(!nopin.booted && /script-src 'none'/.test(nopin.policy)
        && nopin.refusal.en && nopin.refusal.pl && nopin.refusal.names && nopin.refusal.scripts === 0
        && nopin.visibleChars > 200
        && s.said.some(l => /the script hash pin could not be read/.test(l)),
    "5d a pin that will not parse is answered with a refusal a person can read: " + nopin.visibleChars
    + " characters on screen in both languages (en " + nopin.refusal.en + ", pl " + nopin.refusal.pl
    + "), naming the file it could not read (" + nopin.refusal.names + "), carrying "
    + nopin.refusal.scripts + " script element(s), under policy "
    + JSON.stringify((nopin.policy.match(/script-src [^;]*/) || [""])[0])
    + ", and the shell prints its documented line");
  /* Board item 384. The refusal carries no script, so the band's three controls are never drawn
     on it; frameless, the window would have no close button at all. */
  check(nopinWindow.topInset > 20 && nopin.refusal.scripts === 0,
    "5f and that window has the system's own frame, so it can be closed: the client area's top"
    + " edge sits " + nopinWindow.topInset + " px below the window's, against 0 for every launch"
    + " that boots the engine, and the page itself carries " + nopin.refusal.scripts
    + " script element(s) and therefore none of the band's controls");
  /* And its own way out, which is a link because the page has no script to hang a button on.
     The click is driven from here; what is being proved is that following the link closes the
     window, not that a page with no script can click its own link. */
  const closer = await s.p.evaluate(() => {
    const a = document.querySelector('a[href*="etiuda-close"]');
    if (!a) return { there: false };
    const r = a.getBoundingClientRect();
    return { there: true, box: [Math.round(r.width), Math.round(r.height)],
             en: /Close/.test(a.textContent), pl: /Zamknij/.test(a.textContent) };
  });
  await s.p.evaluate(() => document.querySelector('a[href*="etiuda-close"]').click()).catch(() => {});
  await sleep(4000);
  const afterClose = labProcesses();
  check(closer.there && closer.box[0] > 0 && closer.en && closer.pl && afterClose === 0,
    "5g and a Close link it can offer without a script: " + JSON.stringify(closer)
    + ", and following it leaves " + afterClose + " process(es) of the lab running");
  await s.stop();

  /* The second branch of the same read: a document that parses and is not a pin this version
     knows. It reached the same dead end and now reaches the same refusal. */
  await variant(w => putPin(w, { kind: "something-else", hashes: [] }));
  s = await launch(newUserData("notapin"));
  await s.p.reload({ waitUntil: "load" });
  await sleep(3000);
  const wrongpin = await s.p.evaluate(SEEN);
  check(!wrongpin.booted && wrongpin.refusal.en && wrongpin.refusal.pl
        && s.said.some(l => /not a hash pin this version can read/.test(l)),
    "5e and so is a pin this version does not recognise: booted " + wrongpin.booted
    + ", refusal on screen " + (wrongpin.refusal.en && wrongpin.refusal.pl)
    + ", and the reason on the shell's own output names the shape it wanted");
  await s.stop();

  /* ---- 6: a plant into the served copy ----------------------------------------------------- */

  phase("[6/7] a script planted in the packaged artefact");
  const plant = w => {
    const f = path.join(w, "engine", "etiuda.html");
    const html = fs.readFileSync(f, "utf8");
    if (!/<\/script>\s*$/.test(html)) throw new Error("the engine does not end on a script tag; the plant needs a new anchor");
    fs.writeFileSync(f, html + "<script>" + PLANT + "</script>\n", "utf8");
  };
  await variant(plant);
  const plantedInAsar = asar.extractFile(ASAR, "engine/etiuda.html").toString("utf8");
  s = await launch(newUserData("plant1"));
  await s.p.reload({ waitUntil: "load" });
  await sleep(3000);
  const planted = await s.p.evaluate(SEEN);
  const plantTail = "<script>" + PLANT + "</script>";
  check(plantedInAsar.trim().slice(-plantTail.length) === plantTail && planted.booted && !planted.planted,
    "6a a script edited into engine/etiuda.html INSIDE the asar does not run: the artefact the app"
    + " opened ends on the plant (read back out of the asar, " + plantedInAsar.length
    + " characters, tail " + JSON.stringify(plantedInAsar.trim().slice(-plantTail.length)) + "), the"
    + " engine still boots (" + planted.booted + ") and window.__planted is "
    + (planted.planted ? "SET" : "undefined"));
  check(s.inline().length === 1 && s.inline().some(t => t.indexOf(PLANT_HASH) > -1),
    "6b and Chromium refused exactly that one inline script, quoting the hash this file computed"
    + " for the plant itself: " + s.inline().length + " refusal(s)");
  await s.stop();

  await variant(w => {
    plant(w);
    const d = pinOf(w);
    d.hashes.push("'" + PLANT_HASH + "'");
    putPin(w, d);
  });
  s = await launch(newUserData("plant2"));
  const allowed = await s.p.evaluate(SEEN);
  check(allowed.booted && allowed.planted,
    "6C control: the same plant with the pin extended to name its hash DOES run (window.__planted "
    + (allowed.planted ? "SET" : "undefined") + "), so 6a is the policy refusing it and not a plant that never arrived");
  await s.stop();
  pristine();

  reachedEnd = true;
})().catch(e => {
  console.error("  FAIL " + String(e && e.stack || e));
  fails++;
}).finally(() => {
  phase("[7/7] what the run left behind");
  for (const pid of Array.from(live)) killPid(pid);
  const left = labProcesses();
  check(left === 0, "no process of the lab is left running: " + left);
  if (KEEP) {
    note("--keep: the lab stands at " + LAB);
  } else {
    try { fs.rmSync(LAB, { recursive: true, force: true }); } catch (x) { /* named below */ }
    check(!fs.existsSync(LAB), "the lab is gone: " + LAB);
  }
  console.log("\n" + (reachedEnd ? "" : "  INCOMPLETE - ") + checks + " check(s), " + fails
    + " failed, " + Math.round((Date.now() - t0) / 1000) + "s");
  if (!reachedEnd) console.log("  SUITE DID NOT COMPLETE");
  process.exit(reachedEnd ? fails : (fails || E.NO_VERDICT));
});
