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
 * THE LAB. `electron-builder --win --dir` into a temp folder, 8 seconds, and the asar is six
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
 * on anybody's screen. Exactly six do: 1c, its two controls, 5f, 5f2's two-window control and
 * 1g's own control, because
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
/* THE PORT BLOCK IS NOT A CONSTANT AND THE DESK IS NOT THIS RUN'S ALONE, board item 568.
 * Three of five runs of this gate died on 2026-09-18 for want of both: a second copy of this file
 * took the same fixed base and puppeteer.connect reached the FIRST run's window, and the
 * installed app starting underneath took the gate with it. The base is this gate's row in the
 * port table of tests/engine.js, moved by ETIUDA_PORT_SHIFT (board item 628, which took the
 * other four gates the same way); the block is leased by its base, and the installed app is
 * leased too, so a second run is refused before it builds anything rather than dying forty
 * minutes in. The take is here, at load, because buildApp costs minutes and a refusal must
 * arrive before them. */
const PORT_BASE = E.portBlock("shell-smoke");
const LEASED = E.takeLeases(["ports:" + PORT_BASE, "desk:installed-app"], 45, "shell-smoke");
let port = PORT_BASE;
let fails = 0, checks = 0, reachedEnd = false;
const t0 = Date.now();
const live = new Set();                       // every pid this run has started
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const note = what => console.log("       " + what);

/* ---- EVERY PHASE MUST HAVE STARTED, board item 531 -------------------------------------------
 *
 * One run of two on 2026-09-18 ended inside check 2d of 7 at 44 checks, with no tally, and the
 * file had nothing to be held to: the exit code of a driver that declares no count is not a
 * verdict, it is a number. tests/smoke.js declares a check count and refuses a run that does not
 * match it; the same rule cannot be copied here as a number tonight, because this gate's own
 * count has moved with every leg added to it and the last two recorded runs say 97 while a report
 * of 2026-09-18 says 107 - a figure nobody can check is worse than none.
 *
 * SO THE DECLARATION IS THE PHASES, which this file already numbers in its own log as [n/7] and
 * which do not move when a leg is added. The list is written out rather than derived from the
 * source: a phase added to the file and never reached would otherwise add itself to both sides
 * of the comparison and prove nothing. Seven is the count in the labels; the run also has a
 * phase 0, so the majors are eight.
 *
 * AND SINCE 2026-09-20 THE CHECK COUNT IS DECLARED TOO, board item 630, because the number has
 * now been measured three times and counted a second way.
 *
 *   - three full runs read 110 checks with 0 failed on 2026-09-20: one against the tree that
 *     became faf30e9 (590 s), one against faf30e9 itself (569 s), one at this commit.
 *   - and the file holds 110 call sites of check(), counted by
 *     `grep -n "check(" tests/shell-smoke.js | grep -v "const check = "`, which returns 111 lines
 *     of which one is the tally line's own literal "check(s)" and not a call. The two methods are
 *     independent and they agree, which is what the figure nobody could check was missing.
 *
 * ONE SITE IS CONDITIONAL and it is the reason this is not a bare number: the lab removal at the
 * end sits inside `if (!KEEP)`, so a --keep run runs 109 and is not the suite. A --keep run
 * declares nothing rather than declaring a number it will miss, and E.suiteVerdict then says out
 * loud that a section skipped in it would not be noticed.
 *
 * A leg that never ran INSIDE a phase that did is what the phase floor alone could not see, and
 * it is what the count now sees: a mismatch is NO VERDICT, exit 78, not a tally.
 */
const PHASE_MAJORS = ["0", "1", "2", "3", "4", "5", "6", "7"];
const EXPECTED = KEEP ? null : 110;
const phasesSeen = new Set();
const phase = what => {
  const m = /^\[(\d+)[a-z]*\/\d+\]/.exec(String(what).trim());
  if (m) phasesSeen.add(m[1]);
  console.log("\n" + what);
};

/* ---- the lab ------------------------------------------------------------------------------ */

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-shell-"));
const PRISTINE = path.join(LAB, "app.pristine.asar");
const WORK = path.join(LAB, "asar-work");
const PROC_PS1 = path.join(LAB, "lab-processes.ps1");
const PIXELS_PS1 = path.join(LAB, "lab-pixels.ps1");
let APPDIR = "";                              // win-unpacked
let ASAR = "";

/* Win32, because "is this window frameless" is not a question the page can answer: the style
   bits say WS_CAPTION either way (Electron removes the non-client RENDERING, not the style) and
   the honest measure is how far the client area's origin sits below the window's own top edge.
   It lives in engine.js since board item 385, because five drivers now ask it the same thing:
   whether the launch they just made put a window on somebody's screen. */
const windowFacts = E.windowFacts;

/* WHICH WINDOW THE FACTS ARE OF, board item 414. Electron answers more than one visible
   top-level window for one process often enough to have made 5f flaky, and windowFacts used to
   hand back the largest of them, which is a guess dressed as a measurement. Every caller here is
   already driving a page, and that page knows its own box, so the window is named by a shape it
   answered for itself: innerWidth by innerHeight, with the ratio handed over so that E.pickWindow
   can try both the CSS and the physical reading of a Win32 client rectangle rather than assume
   one. See pickWindow: which of the two a desk answers in was measured here, not assumed. */
const wantOf = seen => ({ cssW: seen.viewport[0], cssH: seen.viewport[1], dpr: seen.viewport[4] });

/* Scoped to the lab by executable path. Killing by image name would reach a copy of this app
   somebody else on this machine is running, and has no business doing so. */
const LAB_PROCS = [
  "param([string]$Under)",
  "$n = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($Under) })",
  "Write-Output $n.Count",
].join("\n");

/* READING A PICTURE, the one thing in this file that a picture decides. System.Drawing rather
   than a decoder of our own: the question is what colour a pixel is, and Windows already answers
   it. The ground is the commonest colour in the patch; what matters is how many pixels are NOT
   it, how far the furthest one goes, and how much ink there is altogether.
   INK IS THE ONE THE EYE AGREES WITH, board 498 (f): `far` is the darkest pixel in the patch, and
   a field two pixels wide at nineteen levels cleared a floor on it while reading as nothing on a
   pale ground. `ink` is the mean distance from the ground over every pixel of the patch - the
   dots' AREA weighed against their depth, in one number - so a field that is deep in a few places
   and absent everywhere else cannot clear it. */
const LAB_PIXELS = [
  "param([string]$Png)",
  "Add-Type -AssemblyName System.Drawing",
  "$b = [System.Drawing.Bitmap]::FromFile($Png)",
  "$counts = @{}",
  "for ($y = 0; $y -lt $b.Height; $y++) { for ($x = 0; $x -lt $b.Width; $x++) {",
  "  $p = $b.GetPixel($x, $y); $k = \"$($p.R),$($p.G),$($p.B)\"",
  "  if ($counts.ContainsKey($k)) { $counts[$k]++ } else { $counts[$k] = 1 } } }",
  "$n = $b.Width * $b.Height",
  "$b.Dispose()",
  "$top = $counts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1",
  "$g = $top.Key -split ','",
  "$far = 0",
  "$ink = 0.0",
  "foreach ($k in $counts.Keys) { $c = $k -split ','",
  "  $d = 0",
  "  for ($i = 0; $i -lt 3; $i++) { $e = [Math]::Abs([int]$c[$i] - [int]$g[$i]); if ($e -gt $d) { $d = $e } }",
  "  if ($d -gt $far) { $far = $d }",
  "  $ink += [double]$d * $counts[$k] }",
  "[pscustomobject]@{ ground = $top.Key; same = $top.Value; pixels = $n; colours = $counts.Count; far = $far;"
  + " ink = [Math]::Round($ink / $n, 3) }"
  + " | ConvertTo-Json -Compress",
].join("\n");

function ps(file, args) {
  return execFileSync("powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file].concat(args),
    { encoding: "utf8", windowsHide: true }).trim();
}
function labProcesses() { try { return Number(ps(PROC_PS1, ["-Under", LAB.replace(/\//g, "\\")])); } catch (e) { return -1; } }

function killPid(pid) {
  E.killTree(pid);
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

async function launch(ud, args, env, assocExe, realCatalogFolder) {
  port++;
  /* OFF SCREEN BY DEFAULT, board item 385: E.offscreenEnv() writes ETIUDA_TEST_OFFSCREEN=1 over
     whatever the ambient environment says, and a caller's own value wins over that. The five
     launches below that pass "" are the ones whose subject IS the window, and each says so where
     it does it; every other launch in this file is invisible to whoever is at the desk. */
  /* assocExe is board 393's leg and nothing else's: the registered open command names the exe
     UNQUOTED with "%1" after it, so that shape is handed over VERBATIM and the caller quotes the
     file itself. Every other launch here lets the spawn quote each argument, which is the one
     thing Explorer does not do. */
  /* realCatalogFolder is 2k's and nothing else's, board item 467: every launch here is refused
     unless something confines the catalog folder, and 2k's subject is the folder a first run
     picks when nothing does. The sentence it passes is printed by the guard. */
  const child = E.shellLaunch("tests/shell-smoke.js", assocExe || path.join(APPDIR, "Etiuda.exe"),
    ["--remote-debugging-port=" + port, "--user-data-dir=" + ud].concat(args || []),
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv(env),
      windowsVerbatimArguments: !!assocExe, realCatalogFolder: realCatalogFolder });
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

/* Board 415: the destructive control sits at the actions bar's LEFT edge and the closing one at
   its right, so a reflex click on Close cannot land on the wipe. Measured against the bar's own
   content box rather than against each other, because two buttons merely far apart pass a gap
   test and still fail the promise. */
const BAR_ENDS = (leftId, rightId) => {
  const acts = document.querySelector("#modalCard .modal-actions");
  const a = document.getElementById(leftId), b = document.getElementById(rightId);
  if (!acts || !a || !b) return { step: "missing", acts: !!acts, left: !!a, right: !!b };
  const cs = getComputedStyle(acts);
  const r = acts.getBoundingClientRect();
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  const round = n => Math.round(n * 10) / 10;
  return {
    step: "read",
    leftGap: round(ra.left - (r.left + parseFloat(cs.paddingLeft))),
    rightGap: round((r.right - parseFloat(cs.paddingRight)) - rb.right),
    topDelta: round(ra.top - rb.top),
    between: round(rb.left - ra.right),
  };
};

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
/* AND ONE THAT NAMES NONE, which used to be the sample fixture and used to be luck. The legs
   below tell a catalog's own edition from a file's time on disk, so they need one document of
   each kind; asking the fixtures folder to happen to hold one is a coupling that breaks the day
   its sample is replaced, and on 2026-09-17 it was. So the second document is MADE here, from
   the sample, with `date` taken off - and `hash`, which is a hash of a payload that no longer
   includes it and would otherwise be a lie the engine can detect. Nothing else is touched, so
   the card count below is still the sample's and every leg that reads a count reads one number.
   The refusal stays, pointed at this file's own arithmetic: a derivation that did not derive is
   a green that proves nothing. */
const SAMPLE_NOED = path.join(os.tmpdir(), "etiuda-smoke-no-edition-" + process.pid + ".ec");
(() => {
  const d = JSON.parse(fs.readFileSync(SAMPLE, "utf8"));
  delete d.date;
  delete d.hash;
  fs.writeFileSync(SAMPLE_NOED, JSON.stringify(d), "utf8");
})();
process.on("exit", () => { try { fs.unlinkSync(SAMPLE_NOED); } catch (x) { /* already gone */ } });
if (editionOf(SAMPLE_NOED))
  E.refuse("the no-edition copy of the sample still names an edition, so nothing below can prove the fallback to a file's date");
if (cardsOf(SAMPLE_NOED) !== SAMPLE_CARDS)
  E.refuse("the no-edition copy of the sample holds " + cardsOf(SAMPLE_NOED) + " cards against the sample's "
    + SAMPLE_CARDS + ", so the counts below would be read off two different documents");
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
  fs.writeFileSync(PIXELS_PS1, LAB_PIXELS, "utf8");

  phase("[0/7] the lab");
  console.log("       debugging ports count up from " + PORT_BASE
    + (process.env.ETIUDA_PORT_SHIFT ? " (ETIUDA_PORT_SHIFT " + process.env.ETIUDA_PORT_SHIFT + ")"
                                     : " (the port table's own number)")
    + "; leases: " + LEASED.said);
  const built = buildApp();
  const names = asarNames();
  const inAsar = crypto.createHash("sha256").update(asar.extractFile(ASAR, "engine/etiuda.html")).digest("hex");
  const inTree = E.sha256(E.ENGINE_PATH);
  console.log("       built in " + built + "s into " + LAB);
  check(names.join(",") === "engine/etiuda.csp.json,engine/etiuda.html,package.json,shell/main.js,shell/preload.js,shell/sample-catalog.ec",
    "the asar holds the six allowlisted files and nothing else: " + names.join(", "));
  check(inAsar === inTree,
    "the engine inside the asar is the engine in the tree, sha256 " + inAsar.slice(0, 16)
    + (inAsar === inTree ? "" : " against the tree's " + inTree.slice(0, 16)));
  console.log("       the fixture offers " + FIXTURE_CARDS + " cards, by JSON.parse of the .ec in this process");

  /* Both readings above are made to fail before they are believed, and neither costs a launch:
     one file more than the allowlist and a byte of difference in the artefact are the two things
     they exist to catch. The number moved with the allowlist when the sample joined it, board
     item 462: what this control is about is the list being one longer, not the length itself. */
  await variant(w => fs.writeFileSync(path.join(w, "engine", "extra.txt"), "not in the allowlist", "utf8"));
  const sixth = asarNames();
  await variant(w => {
    const f = path.join(w, "engine", "etiuda.html");
    fs.writeFileSync(f, fs.readFileSync(f, "utf8") + "<!-- one byte of difference -->", "utf8");
  });
  const drifted = crypto.createHash("sha256").update(asar.extractFile(ASAR, "engine/etiuda.html")).digest("hex");
  pristine();
  check(sixth.length === names.length + 1 && sixth.join(",") !== names.join(",") && drifted !== inTree,
    "0C control: one file more in the asar gives a list of " + sixth.length + " that does not match, and one"
    + " byte edited into the artefact gives sha256 " + drifted.slice(0, 16) + ". So neither reading above is vacuous");

  /* ---- 1 and 3: the window, and a key written through Settings ---------------------------- */

  phase("[1/7] the window, and a key written through Settings");
  const udA = newUserData("a", withFixture);
  /* SHOWN, AND ON NO DISPLAY: the flag's third value, board item 537. This leg and the three
     below read the window rectangle through EnumWindows, which passes over a window nobody has
     shown, so they used to clear the flag and put a real window on whoever's screen this is -
     six launches did, which is why no seat could run this gate while the desk was in use. Value
     2 shows the window without focusing it, past the far corner of every display, so it has a
     frame, a client area and a rectangle to measure and appears on none of them. 1g below is the
     one launch here that still reaches a display, because proving that is its whole subject. */
  let s = await launch(udA, [], { ETIUDA_TEST_OFFSCREEN: "2" });
  let seen = await s.p.evaluate(SEEN);
  const facts = windowFacts(s.pid, wantOf(seen));

  check(seen.ctl.every(c => c && c.w > 0 && c.h > 0 && c.top === 0),
    "1a the three window controls are drawn and sit at y0: " + JSON.stringify(seen.ctl));
  check(seen.bandTop === 0 && seen.bandH > 0 && seen.bandVar === seen.bandH + "px",
    "1b the band is the top bar, its top at y" + seen.bandTop + ", " + seen.bandH
    + " px high, and the host published --band-h as " + JSON.stringify(seen.bandVar));
  check(facts.measured === true && facts.topInset === 0 && facts.cliH > 0,
    "1c the window is frameless: the client area's own top edge is " + facts.topInset
    + " px below the window's, client " + facts.cliW + "x" + facts.cliH + " in a window of "
    + facts.winW + "x" + facts.winH + ". " + facts.how + (facts.measured ? "" : " - NOT MEASURED: " + facts.why));
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

  /* ---- 1g to 1g3: the harness's own window, board items 385 and 537 -------------------------
     THREE LAUNCHES, ONE PER VALUE OF THE FLAG, because the flag now has three and a leg that saw
     only two of them could not tell the middle one from either neighbour.
       default (1)  placed aside and never shown: no visible window at all
       2            placed aside and shown without focus: a visible window, on no display
       cleared      an ordinary launch: a visible window, on a display
     The first passes no environment at all, because the subject there is the DRIVER's default
     rather than the shell's flag. The third clears the variable by hand and says so, since a run
     started from a shell that already carries it would otherwise prove nothing, and it is the
     ONE launch in this file that reaches a display. That is not tidiness deferred: without it
     nothing here could tell value 2 from a shell that had stopped showing windows at all.

     ON A DISPLAY BY THE RECTANGLE, never by MonitorFromWindow, which answers the primary monitor
     for a window parked far outside every one of them. EnumDisplayMonitors answers in
     GetWindowRect's own coordinates, so no scale factor enters the comparison. */

  phase("[1b/7] the window the harness gives itself");
  const udP = newUserData("offscreen");
  s = await launch(udP);
  const hiddenFacts = windowFacts(s.pid);
  const hiddenSeen = await s.p.evaluate(SEEN);
  await s.stop();
  const udAside = newUserData("aside");
  s = await launch(udAside, [], { ETIUDA_TEST_OFFSCREEN: "2" });
  const asideFacts = windowFacts(s.pid);
  const asideSeen = await s.p.evaluate(SEEN);
  await s.stop();
  const udQ = newUserData("onscreen");
  s = await launch(udQ, [], { ETIUDA_TEST_OFFSCREEN: "" });
  const shownFacts = windowFacts(s.pid);
  await s.stop();
  check(hiddenFacts.measured === true && hiddenFacts.windows === 0 && hiddenSeen.booted,
    "1g a launch taking this driver's own default leaves " + hiddenFacts.windows
    + " visible top-level window(s) while the engine still boots inside it ("
    + hiddenSeen.booted + "), so the default is what hides it");
  check(asideFacts.measured === true && asideFacts.windows >= 1
        && asideFacts.windowsOnDisplay === 0 && asideFacts.winW > 0 && asideSeen.booted,
    "1g2 ETIUDA_TEST_OFFSCREEN=2 puts up " + asideFacts.windows + " visible window(s) of "
    + asideFacts.winW + "x" + asideFacts.winH + " at " + asideFacts.left + "," + asideFacts.top
    + ", of which " + asideFacts.windowsOnDisplay + " are on a display ("
    + asideFacts.displays.join("; ") + "). So a leg whose subject IS the window has a rectangle"
    + " to read and takes nobody's screen");
  check(shownFacts.measured === true && shownFacts.windows >= 1
        && shownFacts.windowsOnDisplay >= 1 && shownFacts.winW > 0,
    "1g3 THE CONTROL: the same app with the variable cleared puts " + shownFacts.windows
    + " visible window(s) up at " + shownFacts.left + "," + shownFacts.top + ", "
    + shownFacts.windowsOnDisplay + " of them on a display. So 1g2 is the placement and not a"
    + " shell that stopped showing windows, and EnumWindows can see one when there is one");

  /* ---- 1w to 1y: the window's floor, board 469 ----------------------------------------------
     Electron's getMinimumSize and setSize live in the main process, so this launch is a variant
     that prints both: the constructor's minWidth, then setSize(300, current height) which snaps
     to that floor. The page then reads the licence name's computed white-space. The control is
     the same three probes on a build without minWidth, red on the first two. */
  phase("[1c/7] the window's floor");
  /* The anchor is the line that OPENS the handler rather than the whole of it: the body gained
     the flag's third value, and an anchor holding a body breaks on the next edit to it. */
  const READY_SHOW = '  win.once("ready-to-show", showWhenReady);';
  await variant(w => {
    const f = path.join(w, "shell", "main.js");
    const src = fs.readFileSync(f, "utf8");
    const hits = src.split(READY_SHOW).length - 1;
    if (hits !== 1) throw new Error("the ready-to-show line matched " + hits + " times in the asar's shell/main.js, expected 1");
    const probe = READY_SHOW + "\n"
      + '  console.log("etiuda-min " + win.getMinimumSize()[0] + "x" + win.getMinimumSize()[1]);\n'
      + '  win.webContents.on("did-finish-load", () => {\n'
      + '    const h = win.getSize()[1];\n'
      + '    win.setSize(300, h);\n'
      + '    const after = win.getSize();\n'
      + '    console.log("etiuda-resized " + after[0] + "x" + after[1]);\n'
      + '  });\n';
    fs.writeFileSync(f, src.split(READY_SHOW).join(probe), "utf8");
  });
  const udMin = newUserData("minw");
  s = await launch(udMin);
  const saidText = s.said.join("\n");
  const minHit = /etiuda-min (\d+)x(\d+)/.exec(saidText);
  const resizedHit = /etiuda-resized (\d+)x(\d+)/.exec(saidText);
  const minW = minHit ? Number(minHit[1]) : null;
  const resizedW = resizedHit ? Number(resizedHit[1]) : null;
  check(minW === 546,
    "1w the window's minimum width is 546: " + JSON.stringify(minHit ? minHit[0] : s.said.slice(0, 6)));
  check(resizedW != null && resizedW >= 546,
    "1x asking the window to 300 by its height leaves it at least 546 wide: "
    + JSON.stringify(resizedHit ? resizedHit[0] : s.said.slice(0, 6)));
  const foot = await s.p.evaluate(() => {
    const bolds = Array.from(document.querySelectorAll("footer b"));
    const licence = bolds.filter(el => /Licence/.test(el.textContent))[0];
    if (!licence) return { step: "no licence name" };
    const cs = getComputedStyle(licence);
    return { step: "read", whiteSpace: cs.whiteSpace, overflow: cs.overflow,
             textOverflow: cs.textOverflow, text: licence.textContent };
  });
  check(foot.step === "read" && foot.whiteSpace === "nowrap"
    && foot.overflow === "hidden" && foot.textOverflow === "ellipsis",
    "1y the footer's licence name is one line and contained: " + JSON.stringify(foot));
  await s.stop();
  pristine();

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
  /* Both in the folder at once, the older of the two first, so "the newest wins" is a CHOICE
     between two present candidates rather than the only file there being loaded.
     SAMPLE_NOED AND NOT SAMPLE, since board 497: a file whose bytes are the shipped sample's IS
     the sample wherever it sits, and the sample is never counted ahead of another catalog, so
     this pair would be answering that rule instead of the dates. It keeps the sample's NAME,
     which is the other half of 497 - what a file is called decides nothing. */
  placeEc(catFolder("folder"), SAMPLE_NOED, "sample-catalog.ec", 60);
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
  placeEc(catFolder("folder"), SAMPLE_NOED, "sample-catalog.ec", 1);
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
  /* ONE DOOR TO THE FOLDER, and it is the Library's. Both screens are reached the way a person
     reaches them, the menu then the fold, because the claim is about what each one offers. The
     button itself opens a native folder dialog, which no page can drive, so the write its
     handler makes is made below instead. */
  const row = await s.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const menu = async act => {
      const btn = document.getElementById("settingsBtn");
      if (!btn) return false;
      btn.click(); await wait(400);
      const item = document.querySelector('#settingsMenu [data-act="' + act + '"]');
      if (!item) return false;
      item.click(); await wait(1000);
      return true;
    };
    if (!(await menu("manage"))) return { step: "no Library item in the menu" };
    const fold = document.querySelector('#modalCard details.manage-sec[data-mg="data"]');
    if (!fold) return { step: "no catalog fold" };
    if (!fold.open) fold.querySelector("summary").click();
    await wait(800);
    /* WHERE EVERY ACT OF THIS SECTION LIVES NOW, board 452: the folder on the title line, a
       catalog's own acts in its row, the Library's own in the Library's bar. Read as places
       rather than as presence - a button that exists in the wrong home is the failure. */
    const q = sel => document.querySelector(sel);
    const pathEl = q("#mgCatFolderPath"), change = q("#mgCatFolder");
    const exp = q("#mgExportCatalog"), imp = q("#mgImportCatalog"), close = q("#mgClose");
    const r = change ? change.getBoundingClientRect() : null;
    const got = { path: pathEl ? pathEl.title : null,
                  short: pathEl ? pathEl.textContent : null,
                  button: !!change && !!r && r.width > 0 && r.height > 0,
                  pencil: !!change && !!change.querySelector("svg"),
                  inSummary: !!pathEl && !!pathEl.closest("summary") && !!change.closest("summary"),
                  loadedRow: !!document.querySelector("#mgCatList .ec-row.is-loaded"),
                  exportInRow: !!exp && !!exp.closest(".ec-row.is-loaded"),
                  importInBar: !!imp && !!imp.closest(".modal-actions .mf-left"),
                  closeAlone: !!close && !close.closest(".mf-left"),
                  oldOnes: ["#mgCatOpen"].filter(x => !!q(x)).length,
                  strays: [...document.querySelectorAll('details.manage-sec[data-mg="data"] .manage-secbody > *')]
                            .map(n => n.className) };
    document.querySelector("#mgClose").click(); await wait(600);
    /* Settings is opened last and left open: the leg below reads its actions bar. */
    if (!(await menu("settings"))) return { step: "no Settings item in the menu" };
    return Object.assign({ step: "open" }, got,
      { setFolds: [...document.querySelectorAll("#modalCard details.acc")]
                    .map(d => d.getAttribute("data-acc")) });
  });
  check(row.step === "open" && row.setFolds.indexOf("catalog") < 0 && row.path === catFolder("change")
        && row.button && row.pencil && row.inSummary && row.exportInRow === row.loadedRow
        && row.importInBar
        && row.closeAlone && row.oldOnes === 0 && row.strays.join(",") === "ec-list",
    "2h the folder is named and changed in the Library alone, on its title line, with each act in"
    + " the home it belongs to and nothing floating in the body; Settings offers no catalog"
    + " section at all (452): " + JSON.stringify(row));
  const setBar = await s.p.evaluate(BAR_ENDS, "setReset", "setClose");
  check(setBar.step === "read" && Math.abs(setBar.leftGap) <= 1 && Math.abs(setBar.rightGap) <= 1
        && Math.abs(setBar.topDelta) <= 1 && setBar.between > 0,
    "2h2 Settings' Reset defaults starts at the left edge of the actions bar and Close ends at"
    + " its right, on one line (415): " + JSON.stringify(setBar));
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
  /* SINCE BOARD 497 THE SAMPLE GOES INTO THAT FOLDER WHATEVER IT HOLDS, so this leg - the one
     launch aimed at the desk's own Documents - can now leave a file behind on a desk that has a
     catalog of its own. Whether the file was there BEFORE is the whole of the cleanup below: one
     this run wrote goes, one that was already there is somebody's and stays. */
  const docsSample = path.join(DOCS, "sample-catalog.ec");
  const sampleExisted = fs.existsSync(docsSample);
  const udI = newUserData("firstrun", null, true);         // NOT pinned: the real default
  s = await launch(udI, [], undefined, undefined,
    "this leg asks what a first run with no setting reads, and the answer IS this machine's"
    + " Documents/Etiuda; a pin or a redirect here would delete the question. It reads the"
    + " folder's NAME off the shell's own stdout and no card in it, and it puts the folder back"
    + " if it made it.");
  const saidFolder = s.said.some(l => l.indexOf("catalog folder " + DOCS) > -1);
  await s.stop();
  check(saidFolder && fs.existsSync(DOCS),
    "2k a first run with no folder set makes Documents/Etiuda and reads from it: the shell named "
    + DOCS + " (" + saidFolder + ") and it is on disk (" + fs.existsSync(DOCS) + ")"
    + (docsExisted ? "; it was there before this run, so only the naming is this run's" : ""));
  /* Put back what this run made, and only that. The sample first, and by whether it was there
     before rather than by whether the folder was: a desk holding catalogs of its own is given one
     now too, and it is this gate's to take away again. Then the folder, where this run made it -
     rmdirSync refuses a folder holding anything, so a desk that has since put a catalog in it
     keeps both. */
  if (!sampleExisted) {
    try { fs.unlinkSync(docsSample); } catch (x) { /* none was seeded */ }
  }
  if (fs.existsSync(docsSample) && !sampleExisted)
    note("the sample this leg seeded could not be removed and stays: " + docsSample);
  if (!docsExisted) {
    try { fs.rmdirSync(DOCS); } catch (x) { note("Documents/Etiuda is not empty and stays: " + DOCS); }
  }

  /* ---- 2k2 to 2k4: the sample the installer carries, board item 462 ------------------------
     The subject is a folder this app WRITES to, and the only folder it ever writes to is the
     desk's own Documents/Etiuda - which app.getPath cannot be redirected to from outside the
     process, so these three launches set ETIUDA_TEST_DOCUMENTS and drive a Documents folder of
     the lab's own. 2k above is the leg that keeps asking for the real one.
     The sample is read out of the tree by this process for its card count, the way every other
     count in this file is read from the document it is a count of. */
  phase("[2d/7] the sample a first run is given");
  const SAMPLE_IN_TREE = path.join(E.ROOT, "shell", "sample-catalog.ec");
  const SEED_CARDS = cardsOf(SAMPLE_IN_TREE);
  const seedDocs = name => { const d = path.join(LAB, "docs-" + name); fs.mkdirSync(d, { recursive: true }); return d; };
  const seededDir = d => path.join(d, "Etiuda");
  const listed = d => { try { return fs.readdirSync(seededDir(d)).sort(); } catch (x) { return ["<no folder>"]; } };

  const docsA = seedDocs("fresh");
  const udS1 = newUserData("seed-fresh", null, true);
  s = await launch(udS1, [], { ETIUDA_TEST_DOCUMENTS: docsA });
  const seedSeen = await s.p.evaluate(SEEN);
  /* The offer's own line does not name the FILE - measured on 2026-09-17, it names the catalog
     and the folder - so what is asserted here is that the dialog is up over an unloaded desk. */
  const seedOffered = await s.p.evaluate(() => ({ up: !!document.querySelector("#ecYes") }));
  await s.stop();
  const seededFiles = listed(docsA);
  const seedMark = deskKeys(udS1)["e~sampled"];
  check(seededFiles.join(",") === "sample-catalog.ec" && seedMark === "1"
        && seedOffered.up && seedSeen.cards === 0,
    "2k2 a first run into an empty catalog folder is given the sample and offered it: the folder"
    + " holds " + JSON.stringify(seededFiles) + ", the desk carries e~sampled "
    + JSON.stringify(seedMark) + ", the offer is up (" + seedOffered.up + ") with nothing loaded"
    + " behind it (" + seedSeen.cards + " cards). The"
    + " sample in the tree holds " + SEED_CARDS + " cards, counted by this process");

  /* The same first run into a folder that already holds a catalog, board item 497: the sample
     goes in all the same - it is a special catalog rather than a stand-in for a missing one - and
     it is still not what opens. The folder's own file is dated six hours back, so newest-wins
     would take the sample if it were counted with the others. Which file the shell read is taken
     off its own stdout by path: no name and no card of this fixture is read here. */
  const docsB = seedDocs("taken");
  fs.mkdirSync(seededDir(docsB), { recursive: true });
  const mineEc = path.join(seededDir(docsB), "mine.ec");
  fs.copyFileSync(FIX, mineEc);
  const mineAt = (Date.now() - 6 * 3600 * 1000) / 1000;
  fs.utimesSync(mineEc, mineAt, mineAt);
  const udS2 = newUserData("seed-taken", null, true);
  s = await launch(udS2, [], { ETIUDA_TEST_DOCUMENTS: docsB });
  const takenSeen = await s.p.evaluate(SEEN);
  const takenRead = (s.said.join(" | ").match(/catalog read from ([^,]+),/) || [])[1] || "";
  await s.stop();
  const takenFiles = listed(docsB);
  const takenSample = (() => {
    const f = path.join(seededDir(docsB), "sample-catalog.ec");
    try { return fs.readFileSync(f).equals(fs.readFileSync(SAMPLE_IN_TREE)); } catch (x) { return false; }
  })();
  check(takenFiles.join(",") === "mine.ec,sample-catalog.ec" && takenSample
        && path.basename(takenRead) === "mine.ec"
        && deskKeys(udS2)["e~sampled"] === "1" && takenSeen.offer,
    "2k3 a first run into a folder that ALREADY holds a catalog is given the sample too, and still"
    + " opens the folder's own: " + JSON.stringify(takenFiles) + ", the sample byte for byte the"
    + " tree's (" + takenSample + "), the file the shell read " + JSON.stringify(path.basename(takenRead))
    + " though it is six hours older, marker " + JSON.stringify(deskKeys(udS2)["e~sampled"])
    + ", and that catalog is offered (" + takenSeen.offer + ")");

  /* 2k4: and it is never given twice. The catalog is accepted, ejected and then the local memory
     is cleared - the two acts that empty a desk - and the file itself is taken away by hand,
     which is the state the marker exists for: an empty folder that has already been given one.
     Both confirms are stubbed; the native dialog blocks the main process and reads as a hang. */
  s = await launch(udS1, [], { ETIUDA_TEST_DOCUMENTS: docsA });
  await s.p.evaluate(() => { const y = document.querySelector("#ecYes"); if (y) y.click(); });
  await sleep(6000);
  await (await s.b.pages())[0].evaluate(() => { window.confirm = () => true; ejectCatalog(); });
  await sleep(6000);
  await (await s.b.pages())[0].evaluate(() => { window.confirm = () => true; clearLocalMemory(); });
  await sleep(6000);
  const markAfterWipes = deskKeys(udS1)["e~sampled"];
  await s.stop();
  fs.unlinkSync(path.join(seededDir(docsA), "sample-catalog.ec"));
  s = await launch(udS1, [], { ETIUDA_TEST_DOCUMENTS: docsA });
  const backSeen = await s.p.evaluate(SEEN);
  await s.stop();
  check(markAfterWipes === "1" && listed(docsA).join(",") === "" && backSeen.cards === 0,
    "2k4 an eject and a clear leave the marker where it is (" + JSON.stringify(markAfterWipes)
    + ") and the restart after the sample is deleted by hand brings nothing back: the folder holds "
    + JSON.stringify(listed(docsA)) + " and the desk " + backSeen.cards + " cards");

  /* ---- 2k5: the dot field under the cards, board item 419 ---------------------------------
     THE ONE CHECK IN THIS FILE THAT A PICTURE DECIDES, and it is here because no other reading
     can tell this fault from a pass: the rule parsed, the computed style was right and the field
     was painted UNDER the ground all the same - a z-index:-1 pseudo-element paints below an
     in-flow ancestor's background, and under the host the ground is .scroller rather than the
     canvas. The browser never showed it, so a browser leg cannot hold this line.
     THE FLAG'S THIRD VALUE IS WHAT MAKES A PICTURE POSSIBLE OFF SCREEN: under the default the
     shell shows no window at all, and a window nobody showed produces no frames, so
     captureScreenshot simply times out. Value 2 composites it where it stands, beyond the edge
     of every screen, and puts nothing on anybody's desk. This leg patched the shipped
     ready-to-show line to do that for itself until board item 537 gave the flag the value; the
     patch is gone and the shipped build is what is photographed.
     THE CONTROL IS THE FIELD SWITCHED OFF in the same patch of the same launch, which is what
     makes this a measurement of the dots rather than of the sampler. */
  phase("[2e/7] the ground the cards stand on");
  pristine();
  s = await launch(newUserData("dots"), [], { ETIUDA_TEST_OFFSCREEN: "2" });
  /* Start empty: the offer stands over the card area, and its scrim is the thing a patch of the
     ground would otherwise be a picture of. */
  await s.p.evaluate(() => { const n = document.querySelector("#ecNo"); if (n) n.click(); });
  await sleep(1200);
  const patchOf = async (tag) => {
    const box = await s.p.evaluate(() => {
      const m = document.querySelector("main"); const r = m.getBoundingClientRect();
      return { x: Math.round(r.x + 8), y: Math.round(r.y + r.height - 70), width: 48, height: 48 };
    });
    const png = path.join(LAB, "ground-" + tag + ".png");
    await s.p.screenshot({ path: png, clip: box, captureBeyondViewport: false });
    return JSON.parse(ps(PIXELS_PS1, ["-Png", png]));
  };
  const darkField = await patchOf("dark");
  const flat = await s.p.evaluate(() => {
    const m = document.querySelector("main");
    const was = getComputedStyle(m).backgroundImage;
    m.style.backgroundImage = "none";
    return was.indexOf("radial-gradient") > -1;
  });
  const darkFlat = await patchOf("dark-off");
  await s.p.evaluate(() => { document.querySelector("main").style.backgroundImage = ""; });
  const themeNow = await s.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const t = document.getElementById("theme"); if (t) t.click();
    await wait(800);
    return document.documentElement.dataset.theme || null;
  });
  const lightField = await patchOf("light");
  await s.stop();
  pristine();
  /* THE FLOOR IS THE INK, ruled 2026-09-17 after the field was fixed once and stayed invisible.
     The reading that passed was `far`, the darkest pixel in the patch, which a two-pixel smear
     satisfies; what a person sees is how much of the ground is covered and by how much, which is
     `ink`. A floor per theme, because the shares behind them were picked by eye and are not the
     same number: light is 60 per cent of the dim ink against dark's 30. Each floor sits below the
     reading it guards and above what the share it replaced would give, that being the fault it
     exists to catch: measured 0.462 in light and 0.196 in dark, against 0.146 and 0.131 for 19
     and 20 per cent, the ink of a field being linear in its alpha. Dark's two readings are close
     because dark moved from 20 to 30 while light moved from 19 to 60. */
  const INK_LIGHT = 0.30, INK_DARK = 0.16;
  check(flat && darkField.colours > 1 && darkField.ink >= INK_DARK
        && darkFlat.colours === 1 && darkFlat.ink === 0
        && lightField.colours > 1 && lightField.ink >= INK_LIGHT && themeNow === "light",
    "2k5 the card area stands on the dot field in the packaged app, in both themes: a 48x48 patch"
    + " of the ground carries " + lightField.ink + " levels of ink per pixel in " + themeNow
    + " against a floor of " + INK_LIGHT + ", and " + darkField.ink + " in dark against "
    + INK_DARK + " (" + lightField.colours + " and " + darkField.colours + " colours, the darkest "
    + lightField.far + " and " + darkField.far + " levels from the ground), against "
    + darkFlat.ink + " with the field switched off in the same patch"
    + " (grounds " + darkField.ground + " and " + lightField.ground + ")");

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

  /* ---- 2o to 2s: THE WAY BACK FROM A DECLINE, board items 379, 399 and 424 -----------------
     Declining used to be final until local memory was cleared, and the line that answered it
     first was a list in Settings - which a person with an empty screen never opens. So an EMPTY
     DESK is asked at every launch, by the one dialog every other channel ends in, and the list
     of files is in the Library beside the catalog it is about. The empty page itself carries
     neither: it says it is empty and points at the Library, which is checked here too. Names,
     dates and counts only, all of them this file\'s own. */

  phase("[2d/7] the way back from a decline");
  const udL = newUserData("back");
  placeEc(catFolder("back"), FIX, "one-edition.ec", 5);
  placeEc(catFolder("back"), SAMPLE_NOED, "another.ec", 90);
  s = await launch(udL);
  /* WHAT THE DIALOG SAYS, read before it is answered: the file it is about is named in the last
     sub-line, which is the only place a FILENAME appears, while the heading, the catalog\'s own
     name, its edition and its counts are the body above. */
  const DIALOG = () => {
    const m = document.getElementById("eCatalogModal");
    if (!m) return { step: "no dialog" };
    const subs = m.querySelectorAll(".modal-sub");
    const last = subs[subs.length - 1];
    const counts = m.querySelector(".ec-counts");
    return { step: "read", title: (m.querySelector("h2") || {}).textContent || "",
             body: (m.querySelector(".about-body") || {}).textContent || "",
             counts: counts ? counts.textContent : "",
             codes: last ? Array.from(last.querySelectorAll("code")).map(c => c.textContent) : null,
             yes: !!m.querySelector("#ecYes"), no: !!m.querySelector("#ecNo") };
  };
  const askedAt = await s.p.evaluate(DIALOG);
  check(askedAt.step === "read" && askedAt.title === "Load catalog?"
        && !!askedAt.codes && askedAt.codes[0] === "one-edition.ec"
        && askedAt.codes[1] === catFolder("back")
        && askedAt.body.indexOf(FIX_EDITION) > -1
        && askedAt.counts.indexOf(String(FIXTURE_CARDS)) > -1
        && askedAt.yes && askedAt.no,
    "2p an empty desk whose folder holds two .ec files is asked at launch by the DIALOG, over the"
    + " NEWER of the two, with its edition and its counts and both answers: "
    + JSON.stringify(askedAt.title) + " over " + JSON.stringify(askedAt.codes) + ", counts "
    + JSON.stringify(askedAt.counts) + " and the edition "
    + (askedAt.body.indexOf(FIX_EDITION) > -1 ? "in" : "NOT in") + " the line above them (the"
    + " fixture\'s own edition being " + JSON.stringify(FIX_EDITION) + " and its size "
    + FIXTURE_CARDS + " cards)");

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

  /* THE PAGE UNDER IT, board 424: the screen a person who declined is left looking at carries
     nothing of the offer at all - no box, no row, no Load and not the question itself, which is
     the dialog\'s to ask. Read as words and as markup, since the words are what Maxim reads. */
  const bareEmpty = await s.p.evaluate(() => {
    const box = document.getElementById("list");
    if (!box) return { step: "no list" };
    return { step: "read", html: box.innerHTML.length,
             offerBox: !!document.getElementById("emptyCatOffer"),
             rows: box.querySelectorAll(".ec-row").length,
             load: !!document.getElementById("emptyCatLoad"),
             asks: box.innerHTML.indexOf("Load catalog?") > -1,
             dialog: !!document.getElementById("eCatalogModal"),
             says: (box.querySelector(".empty") || {}).textContent || "" };
  });
  const DATE_RE = /^[0-3][0-9]\.[0-1][0-9]\.20[0-9][0-9] [0-2][0-9]:[0-5][0-9]/;
  /* A ROW\'S SMALL PRINT, read as the parts it is built from rather than as one string: the
     separator is a middot between ordinary spaces, and every count holds its number to its noun
     with a no-break space, so a part is "258\u00a0cards" and each is named one at a time. Five
     parts: the edition, then cards, macros, intents and categories, board 425. */
  const NBSP = String.fromCharCode(160);
  const metaParts = m => String(m || "").split(" " + String.fromCharCode(183) + " ");
  const fiveCounts = m => {
    const p = metaParts(m);
    const has = re => p.filter(x => re.test(x)).length;
    return p.length === 5
      && has(new RegExp("^[0-9]+" + NBSP + "cards?$")) === 1
      && has(new RegExp("^[0-9]+" + NBSP + "macros?$")) === 1
      && has(new RegExp("^[0-9]+" + NBSP + "intents?$")) === 1
      && has(new RegExp("^[0-9]+" + NBSP + "(categories|category)$")) === 1;
  };
  check(bareEmpty.step === "read" && !bareEmpty.offerBox && bareEmpty.rows === 0
        && !bareEmpty.load && !bareEmpty.asks && !bareEmpty.dialog
        && bareEmpty.says.indexOf("Etiuda is empty.") === 0
        && bareEmpty.says.indexOf("import a catalog") > -1,
    "2p2 and the page the decline leaves behind carries none of it: no offer box ("
    + bareEmpty.offerBox + "), no row (" + bareEmpty.rows + "), no Load button (" + bareEmpty.load
    + ") and the words " + JSON.stringify("Load catalog?") + " nowhere in its markup ("
    + bareEmpty.asks + " over " + bareEmpty.html + " characters). It says "
    + JSON.stringify(bareEmpty.says.slice(0, 60)) + " and points at the Library");

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
               /* The loaded row says so with a mark since 2026-09-17, so what is read is the
                  glyph and the name it carries rather than a word in a pill. */
               tick: (r.querySelector(".ec-tick") || {}).getAttribute
                 ? r.querySelector(".ec-tick").getAttribute("aria-label") : "",
               act: Array.from(r.querySelectorAll("button.btn")).map(b => b.textContent).join("|"),
               box: (() => { const b = r.querySelector("button").getBoundingClientRect();
                             return [Math.round(b.width), Math.round(b.height)]; })(),
             })),
             path: !!document.getElementById("mgCatFolderPath"),
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
        && lib.path && lib.change,
    "2q the Library lists every .ec in the folder, each with the catalog\'s OWN EDITION where the"
    + " file names one (" + JSON.stringify(edRow.meta) + ", the fixture\'s being "
    + JSON.stringify(FIX_EDITION) + ") and the file\'s date on disk where it does not ("
    + JSON.stringify(noEdRow.meta) + "), its size and a Load button, and the folder\'s own two"
    + " controls beside them: " + JSON.stringify(lib));
  check(fiveCounts(edRow.meta) && fiveCounts(noEdRow.meta)
        && metaParts(edRow.meta)[0] === FIX_EDITION
        && metaParts(edRow.meta)[1] === FIXTURE_CARDS + NBSP + "cards",
    "2q1 and every row reads the five values the loaded row reads, board 425: the edition and then"
    + " cards, macros, intents and categories, counted off the file by the host - "
    + JSON.stringify(edRow.meta) + " and " + JSON.stringify(noEdRow.meta));

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
  const quietAsk = await s.p.evaluate(DIALOG);
  const quietKeys = deskKeys(udL);
  check(quiet.offer && quiet.cards === 0 && !!quietKeys.eCatalogNo
        && quietAsk.step === "read" && !!quietAsk.codes && quietAsk.codes[0] === "one-edition.ec",
    "2Q a relaunch with nothing on disk changed is asked about that same file again, the refusal"
    + " being written and unable to silence an empty desk (399\'s rule, 424\'s shape): signature "
    + (quietKeys.eCatalogNo ? "written" : "absent") + ", offer " + quiet.offer + " over "
    + JSON.stringify(quietAsk.codes) + ", " + quiet.cards + " cards");
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
    "2r and a file REWRITTEN since that refusal is still the one named, the folder\'s newest rule"
    + " deciding which: offer " + again2.offer + ", " + JSON.stringify(againLine));
  await s.stop();

  const udM = newUserData("emptylist");                    // pinned at a folder holding no .ec
  fs.mkdirSync(catFolder("emptylist"), { recursive: true });
  s = await launch(udM);
  const noCard = await s.p.evaluate(() => ({
    dialog: !!document.getElementById("eCatalogModal"),
    offerBox: !!document.getElementById("emptyCatOffer"),
    says: (document.querySelector("#list .empty") || {}).textContent || "",
  }));
  const noRows = await s.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById("settingsBtn").click(); await wait(400);
    document.querySelector('#settingsMenu [data-act="manage"]').click(); await wait(1200);
    const fold = document.querySelector('#modalCard details.manage-sec[data-mg="data"]');
    if (!fold) return { step: "no catalog fold" };
    if (!fold.open) fold.querySelector("summary").click();
    await wait(1200);
    const ph = document.querySelector("#mgCatList .ec-row.ec-empty");
    return { step: "open",
             rows: document.querySelectorAll("#mgCatList .ec-row:not(.ec-empty)").length,
             empty: ph ? ph.textContent : "",
             phButtons: ph ? ph.querySelectorAll("button.btn").length : -1,
             phFolder: ph && ph.querySelector("code.open-folder")
                       ? ph.querySelector("code.open-folder").title : "" };
  });
  const setPath = await s.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const open = document.querySelector("#mgCatFolderPath");
    const path = open ? open.title : "";
    document.querySelector("#mgClose").click(); await wait(600);
    document.getElementById("settingsBtn").click(); await wait(400);
    document.querySelector('#settingsMenu [data-act="settings"]').click(); await wait(900);
    return { step: "open", path,
             folds: [...document.querySelectorAll("#modalCard details.acc")]
                      .map(d => d.getAttribute("data-acc")) };
  });
  check(noRows.step === "open" && noRows.rows === 0 && !noCard.dialog && !noCard.offerBox
        && noCard.says.indexOf("Etiuda is empty.") === 0
        && setPath.path === catFolder("emptylist") && setPath.folds.indexOf("catalog") < 0,
    "2P control: pointed at a folder holding no .ec the Library lists " + noRows.rows
    + " file(s) and the empty desk is not asked at all (" + JSON.stringify(noCard)
    + "), while the Library still names the folder and Settings carries nothing about it ("
    + JSON.stringify(setPath) + "). So 2p and 2q read the folder and not a fixed list, and the"
    + " dialog at 2p is that folder\'s rather than a fixture of the empty screen");
  /* A FOLDER WITH NOTHING IN IT SAYS SO IN THE LIST'S OWN SHAPE, board 452, and carries no
     button: Import is on the bar below, and the same act twice on one screen is the thing this
     design took out. The folder inside the sentence stays clickable, because putting a file
     there is the usual answer. */
  check(noRows.phButtons === 0 && noRows.phFolder === catFolder("emptylist")
        && noRows.empty.indexOf("Import one") > 0,
    "2P2 an empty folder is one row-shaped placeholder with no button in it, naming the folder it"
    + " means: " + JSON.stringify(noRows));
  await s.stop();

  /* THE QUESTION IS FOR AN EMPTY DESK, board 418. Somebody with work of their own on the screen
     and no catalog under it is not somebody to interrupt with a file they never asked for; the
     Library is the way in then. The card is made the way a person makes one - a category, the
     editor, Save - and the desk is relaunched, because the prompt is drawn at boot. */
  const udMine = newUserData("mine");
  placeEc(catFolder("mine"), FIX, "one-edition.ec", 5);
  s = await launch(udMine);
  await s.p.keyboard.press("Escape");
  await sleep(1000);
  const made = await s.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const key = ensureCustomCat("Mine");
    if (!key) return { step: "no custom category" };
    openCardEditor(null, key); await wait(1200);
    const title = document.getElementById("me_t_en"), body = document.getElementById("me_body_en");
    if (!title || !body) return { step: "no editor fields" };
    title.value = "A card of my own";
    body.value = "Written at this desk rather than read out of a catalog.";
    const save = document.getElementById("meSave");
    if (!save) return { step: "no Save" };
    save.click(); await wait(2000);
    return { step: "saved", cards: document.querySelectorAll("#list .card").length };
  });
  await sleep(1500);
  await s.stop();
  s = await launch(udMine);
  await s.p.keyboard.press("Escape");
  await sleep(1000);
  const mine = await s.p.evaluate(() => ({
    cards: document.querySelectorAll("#list .card").length,
    box: !!document.getElementById("emptyCatOffer"),
    dialog: !!document.getElementById("eCatalogModal"),
    asked: !!document.querySelector("#ecYes"),
  }));
  check(made.step === "saved" && made.cards === 1 && mine.cards === 1 && !mine.box
        && !mine.dialog && !mine.asked,
    "2P3 control: a desk holding a card somebody made and no catalog is not asked at all, though"
    + " the folder holds the file 2p IS asked about: " + mine.cards + " card(s) on screen, dialog "
    + mine.dialog + ", offer box " + mine.box + " (the card saved as " + JSON.stringify(made.step)
    + " with " + made.cards + " on screen before the relaunch)");
  await s.stop();


  /* ---- 2q3 to 2q6: LOADING AND PUTTING DOWN, IN A DESK OF ITS OWN -------------------------
     Its own user-data folder and its own catalog folder, because these legs load, eject and drop
     a third file in: run on the desk above, they would rewrite the state 2Q and 2r are about.
     The boot offer is dismissed with Escape, which records no refusal, so what is proved below
     is the list acting and nothing else. */
  const udLL = newUserData("library");
  placeEc(catFolder("library"), FIX, "one-edition.ec", 5);
  placeEc(catFolder("library"), SAMPLE_NOED, "another.ec", 90);
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

  /* AND NOTHING IS ASKED ON THE FAR SIDE OF THAT LOAD. The folder still holds one-edition.ec,
     written after the file just loaded, so the boot channel has a catalog to offer and would put
     the dialog over the screen the act was made in - the Library, which comes back open and lists
     both files with Load beside the one not in use. Ruled 2026-09-17. The leg has teeth only
     because that other file IS newer: 2q4 below reads its Newer tag. */
  const backAfterLoad = await (await s.b.pages())[0].evaluate(() => ({
    lib: !!document.getElementById("mgCatList"),
    rows: document.querySelectorAll("#mgCatList .ec-row").length,
    loads: document.querySelectorAll("#mgCatList button[data-ec-load]").length,
  }));
  check(!listLoaded.offer && backAfterLoad.lib && backAfterLoad.rows === 2
        && backAfterLoad.loads === 1,
    "2q3b and no offer arrives over the Library it was loaded from: dialog " + listLoaded.offer
    + ", the Library back with " + backAfterLoad.rows + " row(s) and " + backAfterLoad.loads
    + " Load button, which is the way to the other file and is the whole of what a dialog"
    + " would have had to say");

  /* The list again, with something loaded: that row is marked and offers Eject instead of Load,
     and the other file, written after it, is marked as the newer one. */
  const lib2 = await (await s.b.pages())[0].evaluate(OPEN_LIB);
  const loadedRow = (lib2.rows || []).filter(r => r.name === "another.ec")[0] || {};
  const otherRow = (lib2.rows || []).filter(r => r.name === "one-edition.ec")[0] || {};
  /* EXPORT IS NOT ON THAT ROW, and this desk is why: the catalog was loaded a moment ago and
     nothing has been edited on top of it, so the file it came out of already holds every word an
     export would write. The mark, not a word, is what says which row is loaded. */
  check(lib2.step === "open" && loadedRow.loaded && loadedRow.act === "Eject"
        && loadedRow.tick === "Loaded" && loadedRow.tags.length === 0
        && !otherRow.loaded && otherRow.act === "Load" && otherRow.tags.indexOf("Newer") > -1,
    "2q4 the loaded file is the marked row, and the only one carrying the acts that belong to a"
    + " loaded catalog, while the file written after it is marked newer and offers Load: "
    + JSON.stringify([loadedRow, otherRow]));

  /* The watch feeds that list: a catalog dropped into the folder while the Library stands open.
     NOT another copy of the fixture: the shell hands the page a catalog only when the folder's
     newest reads differently from what it last sent, so a file whose bytes are already there is
     a change nothing downstream can hear. */
  /* SAMPLE_NOED for board 497's reason again: the shipped sample's own bytes would not change
     which file the folder would open, and the list is repainted off the message that says it
     has - so the sample itself, dropped into a folder while the Library stands open, is listed
     at the next repaint rather than at once. Named at catalogChanged in shell/main.js. */
  placeEc(catFolder("library"), SAMPLE_NOED, "arrived-later.ec", 0);
  await sleep(6000);
  const grown = await (await s.b.pages())[0].evaluate(() =>
    Array.from(document.querySelectorAll("#mgCatList .ec-row .ec-name b")).map(b => b.textContent));
  check(grown.indexOf("arrived-later.ec") > -1 && grown.length === 3,
    "2q5 a file arriving in the folder reaches the open Library through the host\'s watch: "
    + JSON.stringify(grown));

  /* And putting it down empties the desk WITHOUT asking on the way back, board 424\'s one
     exception: the Library is reopened over that restart already listing every file, so the
     dialog would be arguing with somebody who has just answered. */
  await (await s.b.pages())[0].evaluate(() => { window.confirm = () => true; ejectCatalog(); });
  await sleep(7000);
  let ejPage = (await s.b.pages())[0];
  const afterEject = await ejPage.evaluate(SEEN);
  const ejLib = await ejPage.evaluate(() => ({
    lib: !!document.getElementById("mgCatList"),
    rows: document.querySelectorAll("#mgCatList .ec-row").length }));
  const ejKeys = deskKeys(udLL);
  check(afterEject.cards === 0 && !afterEject.offer && !ejKeys.eCatalogFile
        && ejLib.lib && ejLib.rows === 3,
    "2q6 ejecting empties the desk and forgets which file was loaded, and the restart it causes"
    + " is the one launch NOT asked: " + afterEject.cards + " cards, dialog " + afterEject.offer
    + ", file key " + JSON.stringify(ejKeys.eCatalogFile || "") + ", and the Library back with its "
    + ejLib.rows + " rows, which is everything the dialog would have had to say");
  await s.stop();

  /* The one-shot is spent on that read, so the next ordinary launch of the same desk asks. */
  s = await launch(udLL);
  const nextUp = await s.p.evaluate(DIALOG);
  check(nextUp.step === "read" && !!nextUp.codes && nextUp.codes[0] === "arrived-later.ec"
        && nextUp.yes,
    "2q6b and the launch after that one is asked again, over the folder\'s newest: "
    + JSON.stringify(nextUp.title) + " over " + JSON.stringify(nextUp.codes));
  await s.stop();

  /* ---- 2q7 to 2q9: WHAT THE LOADED ROW SAYS, board item 406 --------------------------------
     A summary line above this list carried the catalog's name, edition and four counts while the
     loaded row under it carried the file's time on disk, so one catalog wore two dates. The
     counts moved into the row and the line went. Its own desk and its own folder, because the
     legs above are about a folder nothing is loaded from, and this one has to load. */
  const udLE = newUserData("loadedrow");
  placeEc(catFolder("loadedrow"), FIX, "one-edition.ec", 5);
  placeEc(catFolder("loadedrow"), SAMPLE_NOED, "another.ec", 90);
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
  const onParts = metaParts(onRow.meta);
  check(tookRow && libL.step === "open" && onRow.name === "one-edition.ec"
        && fiveCounts(onRow.meta) && onParts[0] === FIX_EDITION
        && onParts[1] === FIXTURE_CARDS + NBSP + "cards"
        && !DATE_RE.test(onRow.meta || ""),
    "2q7 the loaded row's small print is the catalog's own edition and then the four counts the"
    + " summary line above used to carry, and no disk time: " + JSON.stringify(onRow.meta)
    + " in " + onParts.length + " parts split on the middot, against the fixture's edition "
    + JSON.stringify(FIX_EDITION) + " and its " + FIXTURE_CARDS + " cards");
  /* A SUBSTRING IS NOT A COUNT. This read `indexOf(String(SAMPLE_CARDS)) > -1` over the whole
     line, which on a two-digit count matches the day of the month, the minutes, or the macro
     count standing beside it - the leg would have passed with the cards figure wrong or absent.
     It is the same line 2q7 reads, so it is read the same way: split on the middot and the
     cards part compared whole. */
  const offParts = metaParts(offRow.meta);
  check(libL.rows.length === 2 && offRow.name === "another.ec"
        && DATE_RE.test(offRow.meta || "")
        && offParts.indexOf(SAMPLE_CARDS + NBSP + "cards") > -1,
    "2q8 and the row beside it, whose file names no edition, still reads its date on disk and its"
    + " size: " + JSON.stringify(offRow.meta) + " in " + offParts.length
    + " parts split on the middot, against the sample's " + SAMPLE_CARDS + " cards");
  check(!!edRow.meta && edRow.meta === onRow.meta,
    "2q10 and that is the SAME line, character for character, that the same file read UNLOADED in"
    + " the Library at 2q above, which is what says the host's counts and the page's have not"
    + " drifted: " + JSON.stringify(onRow.meta) + " loaded against " + JSON.stringify(edRow.meta)
    + " read off the file");
  check(summary.length === 0,
    "2q9 with a catalog loaded the fold carries no summary paragraph at all, the row being where"
    + " the catalog is described: " + JSON.stringify(summary));

  /* ONE CATALOG IS ONE ROW, whichever way it was loaded. Import names a file this list cannot
     address - the picker reaches outside the folder - so the desk records none, and the same
     catalog then took a row of its own at the head while the folder listed its file again
     beneath. Driven through importCatalogText, which is the reading half both import routes end
     in, over the bytes of a file that IS in the folder. `confirm` is stubbed because a native one
     blocks the main process and every page's channel. */
  const impRan = await (await s.b.pages())[0].evaluate(async () => {
    window.confirm = () => true;
    const got = await eReadCatalogFile("one-edition.ec");
    if (!got || !got.text) return { step: "the file did not read" };
    return { step: importCatalogText(got.text, got.name) ? "imported" : "refused" };
  });
  await sleep(6000);
  const impPage = (await s.b.pages())[0];
  await impPage.evaluate(() => { if (document.getElementById("mgCatList")) closeModal(); });
  await sleep(600);
  const libImp = await impPage.evaluate(OPEN_LIB);
  const impKeys = deskKeys(udLE);
  const impOn = (libImp.rows || []).filter(r => r.loaded);
  check(impRan.step === "imported" && libImp.step === "open" && !impKeys.eCatalogFile
        && libImp.rows.length === 2 && impOn.length === 1
        && impOn[0].name === "one-edition.ec" && impOn[0].act === "Eject",
    "2q11 a catalog imported rather than loaded from the folder takes the row of the file it IS,"
    + " matched by the identity of board 431 with no file name recorded (eCatalogFile "
    + JSON.stringify(impKeys.eCatalogFile || "") + "): " + libImp.rows.length + " row(s), "
    + impOn.length + " of them marked loaded, " + JSON.stringify((libImp.rows || []).map(r => r.name)));

  /* THE CONTROL, and it is the whole reason the match is by identity rather than by "something is
     loaded": a catalog the folder does not hold keeps a row of its own at the head and marks none
     of the files. Made here from the no-edition sample with an id and a name of its own, so it is
     nobody's update; nothing of the fixture's is read or printed. */
  const ctrlDoc = (() => {
    const d = JSON.parse(fs.readFileSync(SAMPLE_NOED, "utf8"));
    d.id = "probe-not-in-this-folder"; d.name = "Probe catalog";
    return JSON.stringify(d);
  })();
  const ctrlIn = await (await s.b.pages())[0].evaluate(text => {
    window.confirm = () => true;
    return importCatalogText(text, "probe.ec") ? "imported" : "refused";
  }, ctrlDoc);
  await sleep(6000);
  const ctrlPage = (await s.b.pages())[0];
  await ctrlPage.evaluate(() => { if (document.getElementById("mgCatList")) closeModal(); });
  await sleep(600);
  const libCtrl = await ctrlPage.evaluate(OPEN_LIB);
  const ctrlOn = (libCtrl.rows || []).filter(r => r.loaded);
  check(ctrlIn === "imported" && libCtrl.step === "open" && libCtrl.rows.length === 3
        && ctrlOn.length === 1 && ctrlOn[0].name === "Probe catalog"
        && libCtrl.rows[0].name === "Probe catalog",
    "2q12 control: a catalog no file in the folder is keeps its own row at the head and marks"
    + " neither file, so 2q11 is an identity matching and not a mark on whatever sits first: "
    + libCtrl.rows.length + " row(s), " + JSON.stringify((libCtrl.rows || []).map(r => r.name))
    + ", loaded " + JSON.stringify(ctrlOn.map(r => r.name)));
  await s.stop();

  /* ---- 2s to 2s9: THE LIBRARY CLOSES WHEN SOMEBODY CLOSES IT, board item 407 ---------------
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
  placeEc(catFolder("stayopen"), SAMPLE_NOED, "another.ec", 90);
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

  /* EXPORT IS ON THE ROW ONLY WHERE THERE IS SOMETHING TO EXPORT, ruled 2026-09-17, so this desk
     is given one edit of its own first - the agent's name, which is the cheapest thing in the
     personal layer that an export would carry and the file would not. Through the product's own
     save and then its own repaint, so nothing here reaches around the rule it is standing up. */
  await (await s.b.pages())[0].evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    window.pack.who = "Ada"; window.savePack(); window.paintCatalogList();
    await wait(600);
  });
  /* Export catalog opens a modal of its own on top, and must not take the Library down with it. */
  const stacked = await (await s.b.pages())[0].evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const b = document.getElementById("mgExportCatalog");
    if (!b) return { there: false };
    b.click(); await wait(700);
    const own = !!document.getElementById("eNameModal");
    const fold = document.querySelector('#modalCard details.manage-sec[data-mg="data"]');
    const out = { there: true, own, lib: !!fold, foldOpen: !!fold && fold.open };
    const no = document.getElementById("eNameNo"); if (no) no.click(); await wait(500);
    return out;
  });
  check(stacked.there && stacked.own && stacked.lib && stacked.foldOpen,
    "2s3 Export catalog raises a dialog of its own ON TOP of the Library, which is still there"
    + " and still at its fold: " + JSON.stringify(stacked));

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
    "2s7 the Library open has no #mgEject, and the loaded row still offers Eject: "
    + JSON.stringify(noSectionEject));
  const noBuild = await (await s.b.pages())[0].evaluate(() => ({
    html: !!document.getElementById("mgExportHtml"),
    catalog: !!document.getElementById("mgExportCatalog")
  }));
  check(!noBuild.html && noBuild.catalog,
    "2s8 the Library open has no #mgExportHtml, and Export catalog is still there: "
    + JSON.stringify(noBuild));
  const wipeBar = await (await s.b.pages())[0].evaluate(() => {
    const acts = document.querySelector("#modalCard .modal-actions");
    const ids = acts ? Array.from(acts.querySelectorAll("button")).map(b => b.id) : [];
    const wipe = document.getElementById("mgWipe");
    const close = document.getElementById("mgClose");
    const fold = document.querySelector('#modalCard details.manage-sec[data-mg="data"]');
    return {
      wipeInBar: !!(acts && wipe && acts.contains(wipe)),
      closeInBar: !!(acts && close && acts.contains(close)),
      wipeInFold: !!(fold && wipe && fold.contains(wipe)),
      danger: !!(wipe && wipe.classList.contains("danger")),
      ids,
      wipeBeforeClose: ids.indexOf("mgWipe") > -1 && ids.indexOf("mgClose") > -1
        && ids.indexOf("mgWipe") < ids.indexOf("mgClose")
    };
  });
  const wipeEnds = await (await s.b.pages())[0].evaluate(BAR_ENDS, "mgWipe", "mgClose");
  check(wipeBar.wipeInBar && wipeBar.closeInBar && !wipeBar.wipeInFold
        && wipeBar.danger && wipeBar.wipeBeforeClose
        && wipeEnds.step === "read" && Math.abs(wipeEnds.leftGap) <= 1
        && Math.abs(wipeEnds.rightGap) <= 1 && Math.abs(wipeEnds.topDelta) <= 1
        && wipeEnds.between > 0,
    "2s9 Clear local memory sits in the Library's actions bar before Close, at its left edge with"
    + " Close at the right, still danger, and not in the Catalog & data fold: "
    + JSON.stringify(wipeBar) + " " + JSON.stringify(wipeEnds));

  /* Eject from that row: the Library is still there on the far side of the restart, showing the
     folder rather than being replaced by a dialog about one file in it, and the section says in
     words that nothing is loaded. */
  await (await s.b.pages())[0].evaluate(() => {
    window.confirm = () => true;
    const b = document.querySelector("#mgCatList button[data-ec-eject]");
    if (b) b.click();
  });
  await sleep(8000);
  const afterEject2 = await (await s.b.pages())[0].evaluate(LIB_STATE);
  check(afterEject2.open && afterEject2.foldOpen && !afterEject2.over
        && afterEject2.loaded.length === 0 && afterEject2.rows === 2 && afterEject2.empty === "",
    "2s5 the row's Eject leaves the Library open on the folder with no row marked and NOTHING over"
    + " it, that restart being the one launch board 424 does not ask; since 452 the fold says it"
    + " with the list rather than with a sentence: " + JSON.stringify(afterEject2));

  /* Clear local memory is driven at 2w below, in a launch of its own: it restarts the app, and
     the legs here are about a dialog that has to still be standing afterwards. */

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

  /* ---- 2w to 2w3: CLEAR LOCAL MEMORY KEEPS THE CATALOG FOLDER, board item 410 --------------
     The wipe forgets preferences, and where the catalogs are is not one of them: forgetting it
     returns nothing to a default, it sends the app looking somewhere else for files somebody
     pointed it at once. Until that ruling this leg could not exist at all - the wipe took the
     harness's own pin with it and the relaunch read the real Documents folder of whoever is at
     this desk, which is why the comment above used to say so. */
  const udW = newUserData("wipe");
  placeEc(catFolder("wipe"), FIX, "kept.ec", 1);
  s = await launch(udW);
  await s.p.evaluate(() => { const y = document.querySelector("#ecYes"); if (y) y.click(); });
  await sleep(7000);
  let wp = (await s.b.pages())[0];
  /* Two preferences of exactly the kind the wipe is FOR, so the leg can tell a wipe from a
     button that did nothing. Neither is the catalog folder and neither is namespaced. */
  await wp.evaluate(() => { window.lsSet("eTheme", "light"); window.lsSet("eNoteHover", "0"); });
  await sleep(1200);
  const beforeWipe = await wp.evaluate(() => ({
    folder: window.lsGet("eCatalogFolder"), theme: window.lsGet("eTheme"),
    hover: window.lsGet("eNoteHover"), cards: document.querySelectorAll(".card").length }));
  /* A native confirm under the host blocks the main process and every page's CDP channel, so
     the stub goes in first and is READ BACK: a stub on a document that has since reloaded looks
     exactly like a dead button. */
  const stubbed = await wp.evaluate(() => { window.confirm = () => true; return window.confirm() === true; });
  await wp.evaluate(() => { clearLocalMemory(); });
  await sleep(9000);
  wp = (await s.b.pages())[0];
  const afterWipe = await wp.evaluate(() => ({
    folder: window.lsGet("eCatalogFolder"), theme: window.lsGet("eTheme"),
    hover: window.lsGet("eNoteHover"), cards: document.querySelectorAll(".card").length }));
  check(stubbed && beforeWipe.folder === catFolder("wipe") && afterWipe.folder === catFolder("wipe"),
    "2w Clear local memory leaves eCatalogFolder where it was: " + JSON.stringify(beforeWipe.folder)
    + " before, " + JSON.stringify(afterWipe.folder) + " after");
  check(beforeWipe.theme === "light" && beforeWipe.hover === "0"
        && afterWipe.theme == null && afterWipe.hover == null,
    "2w2 control: the same press did forget the two preferences beside it, so 2w is a key kept"
    + " rather than a wipe that never ran - theme " + JSON.stringify(beforeWipe.theme) + " to "
    + JSON.stringify(afterWipe.theme) + ", note-hover " + JSON.stringify(beforeWipe.hover)
    + " to " + JSON.stringify(afterWipe.hover));
  await s.stop();
  s = await launch(udW);
  const wipedSaid = s.said.some(l => l.indexOf("catalog folder " + catFolder("wipe")) > -1);
  const wipedSeen = await s.p.evaluate(SEEN);
  check(wipedSaid && wipedSeen.cards === FIXTURE_CARDS,
    "2w3 and the launch after the wipe still reads that folder rather than the desk's own: the"
    + " shell named " + catFolder("wipe") + " (" + wipedSaid + ") and the page holds "
    + wipedSeen.cards + " cards");
  await s.stop();

  /* ---- 2n to 2n4: THE RING THE MOUSE DID NOT ASK FOR, board item 407's neighbour 408 --------
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
             outline: el ? getComputedStyle(el).outlineStyle : "?",
             bg: el ? getComputedStyle(el).backgroundColor : "?" };
  };
  const udR = newUserData("ring");
  placeEc(catFolder("ring"), FIX, "one-edition.ec", 5);
  s = await launch(udR);
  const tookR = await s.p.evaluate(() => { const y = document.querySelector("#ecYes"); if (!y) return false; y.click(); return true; });
  await sleep(6000);
  let rp = (await s.b.pages())[0];

  /* BOARD 290: THE FIRST RUN ASKS FOR A NAME, and this is the launch that sees it - a catalog
     just accepted, so the desk is no longer empty and the question means something. It is a
     modal and it covers the screen, which is why it is answered here before the ring legs
     below reach for the Menu with a real pointer: a mouse click landing on a scrim is a mouse
     click that did nothing. */
  const asked = await rp.evaluate(() => {
    const m = document.getElementById("eAgentModal");
    if (!m) return { there: false };
    return { there: true, title: (m.querySelector("h2") || {}).textContent,
             line: m.querySelectorAll(".modal-sub").length,
             preview: (m.querySelector("#eAgentPrev") || {}).textContent,
             greyed: (m.querySelector("#eAgentPrev .e-name-ph") || {}).textContent,
             buttons: [...m.querySelectorAll(".modal-actions button")].map(b => b.textContent) };
  });
  check(asked.there && asked.title === "Your name" && asked.line === 0
        && /Anna\.$/.test(asked.preview || "") && asked.greyed === "Anna"
        && asked.buttons.join("|") === "Later|Save",
    "2n3 the first run after a catalog is accepted asks for the name: the title, no line under"
    + " it, a card's own greeting with the sample name greyed, Later and Save: "
    + JSON.stringify(asked));
  await rp.evaluate(() => { const n = document.getElementById("eAgentNo"); if (n) n.click(); });
  await sleep(900);
  /* Read through the ENGINE's own storage, not localStorage: under the host those keys live in
     desk.json, and localStorage answers null for every one of them. */
  const afterLater = await rp.evaluate(() => ({
    gone: !document.getElementById("eAgentModal"),
    asked: window.lsGet("eNameAsked"), name: window.lsGet("eAgent") }));
  check(afterLater.gone && afterLater.asked === "1" && !afterLater.name,
    "2n4 Later closes it, records the ask and writes no name: " + JSON.stringify(afterLater));

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
     suppression: what a dialog opened FROM THE KEYBOARD hands back. Maxim ruled on 2026-09-17
     that the rings go and that keyboard focus wears the button's OWN HOVER LOOK (452, Claudius's
     9223193), so the fact to assert is an equality with hover rather than a difference from it,
     and the leg used to assert the difference.

     FOUR READS OF ONE CONTROL, because an equality on its own passes for free the moment every
     state collapses onto one colour - which is exactly what a deleted hover rule would do:

       rest    pointer parked away, focus dropped         the plain button
       hover   pointer on it, still nothing focused       what the mouse is shown
       held    focus by a click, pointer still on it      a click shows nothing beyond hover
       kbd     focus handed back after a chord opened the card editor and Escape shut it

     kbd == hover == held, outline none in all four, and rest DIFFERENT from every one of them:
     that last clause is the liveness, and it is what a collapse would break. Measured against
     the packaged app of 2026-09-17 08:49 before this leg was written - rest
     `color(srgb 0.890196 0.901961 0.917647 / 0.04)`, the other three `rgb(27, 34, 49)`, which is
     --accent-soft - and the red control was the pre-ruling look planted back over the sheet
     (`#settingsBtn:focus-visible` on the resting colour with a 2px outline), which turns this
     clause false on kbd.outline and kbd.bg both. */
  const btnAt = await rp.evaluate(() => {
    const el = document.querySelector("#settingsBtn");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: innerWidth, h: innerHeight };
  });
  /* THE COLOUR NEEDS SECONDS, not the .1s the transition asks for: this window is offscreen and
     Chromium throttles an unshown window's style updates, so a read taken at the transition's own
     duration catches the first frame and reports the colour the button is leaving. Measured
     against the same page: resting at 200ms, the hover look by 2.7s. Every read below waits. */
  const SETTLE = 2600;
  await rp.mouse.move(btnAt ? btnAt.w / 2 : 600, btnAt ? btnAt.h - 6 : 600);
  await rp.evaluate(() => { const el = document.querySelector("#settingsBtn"); if (el) el.blur(); });
  await sleep(SETTLE);
  const rest = await rp.evaluate(RING, "#settingsBtn");
  await rp.mouse.move(btnAt ? btnAt.x : 0, btnAt ? btnAt.y : 0);
  await sleep(SETTLE);
  const hover = await rp.evaluate(RING, "#settingsBtn");
  await realClick(rp, "#settingsBtn"); await sleep(500);
  await realClick(rp, "#settingsBtn"); await sleep(500);
  await sleep(SETTLE);
  const held = await rp.evaluate(RING, "#settingsBtn");
  await rp.keyboard.down("Alt"); await rp.keyboard.press("KeyN"); await rp.keyboard.up("Alt");
  await sleep(1800);
  const edOpen = await rp.evaluate(() => !document.getElementById("modal").hidden);
  await rp.evaluate(() => { window.confirm = () => true; });
  await rp.keyboard.press("Escape"); await sleep(1400);
  await sleep(SETTLE);
  const afterKbd = await rp.evaluate(RING, "#settingsBtn");
  const looks = { rest, hover, held, kbd: afterKbd, edOpen };
  check(edOpen && rest.there && !rest.active && rest.outline === "none"
        && !hover.active && hover.outline === "none"
        && held.active && !held.ring && held.outline === "none"
        && afterKbd.active && afterKbd.ring && afterKbd.outline === "none"
        && hover.bg !== rest.bg && held.bg === hover.bg
        && afterKbd.bg === hover.bg && afterKbd.bg !== rest.bg,
    "2n2 a dialog opened by a key hands the HOVER LOOK back with the focus and paints no ring,"
    + " which is what a click shows too, and the plain button wears neither: "
    + JSON.stringify(looks));
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
    "2u2 the empty state's folder line is one line at this window's " + line.width + " px ("
    + line.lines + " line box of " + line.lh + " px in " + line.h + " px), names the folder short"
    + " as " + JSON.stringify(line.short) + " with the full path on hover ("
    + JSON.stringify(line.full) + ") and as something clickable (" + line.linked
    + "). On one line it measures " + line.nowrap + " px, so it wraps below about "
    + (line.nowrap + 32) + " px of window");

  /* The second copy: it must hand its path over and go, or two Etiudas write one desk file. */
  port++;
  const second = E.shellLaunch("tests/shell-smoke.js 2v", path.join(APPDIR, "Etiuda.exe"),
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
  const stillHost = await s.p.evaluate(() => !!(window.E_HOST && window.E_HOST.openedWith));
  check(assocNo && !stillHost && stillNo.cards === 0 && !!deskKeys(udS).eCatalogNo,
    "2X control: the refusal is written and the desk is empty, so this launch is asked by board"
    + " 424\'s rule and by nothing anybody named - the host says it was opened with no file ("
    + stillHost + ") over " + stillNo.cards + " cards. So what 2x adds below is the argument");
  await s.stop();

  s = await launch(udS, ['"' + assocEc + '"'], null, assocExe);
  const assocCold = await s.p.evaluate(SEEN);
  const assocLine = await s.p.evaluate(() => {
    const subs = document.querySelectorAll("#eCatalogModal .modal-sub");
    const last = subs[subs.length - 1];
    return last ? Array.from(last.querySelectorAll("code")).map(c => c.textContent) : null;
  });
  const coldHost = await s.p.evaluate(() => !!(window.E_HOST && window.E_HOST.openedWith));
  check(assocCold.offer && coldHost && !!assocLine && assocLine[0] === "double-clicked.ec"
        && s.said.some(l => l.indexOf("catalog read from " + assocEc) > -1),
    "2x a COLD start in the association's own shape is handed that file BY THE ARGUMENT - the host"
    + " says it was opened with it (" + coldHost + ") - and offers it past the remembered refusal,"
    + " named: offer " + assocCold.offer + ", line " + JSON.stringify(assocLine));
  await s.stop();

  s = await launch(udS);
  /* The launch\'s own question, dismissed with Escape, which records no refusal: what this leg is
     about is the offer a SECOND copy causes, so the screen has to be clear before it starts. */
  await s.p.keyboard.press("Escape");
  await sleep(900);
  const warmBefore = await s.p.evaluate(SEEN);
  const second393 = E.shellLaunch("tests/shell-smoke.js 2z", assocExe,
    ["--user-data-dir=" + udS, '"' + assocEc + '"'],
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
  /* SHOWN AND ON NO DISPLAY, the flag's third value: 1c's control reads the caption's depth,
     and a window nobody showed has no rectangle to read. */
  s = await launch(udD, [], { ETIUDA_TEST_OFFSCREEN: "2" });
  const framedSeen = await s.p.evaluate(SEEN);
  const framed = windowFacts(s.pid, wantOf(framedSeen));
  check(framed.measured === true && framed.topInset > 20 && framedSeen.ctl.every(c => c && c.w > 0 && c.top === 0) && framedSeen.bandTop === 0,
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
  /* SHOWN AND ON NO DISPLAY: the other half of the window control reads the same inset. */
  s = await launch(newUserData("nocontrols"), [], { ETIUDA_TEST_OFFSCREEN: "2" });
  const cutSeen = await s.p.evaluate(SEEN);
  const cutFacts = windowFacts(s.pid, wantOf(cutSeen));
  check(cutFacts.measured === true && cutSeen.ctl.every(c => c === null) && cutFacts.topInset === 0 && cutSeen.bandTop === 0,
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
  /* A CHARACTER THAT IS CERTAINLY NOT THE ONE THERE, which is tests/csp.js's stale() and is here
     for the reason that file gives it: writing "A" over the first character of the digest leaves
     the pin untouched one build in sixty-four, and then the engine boots, nothing is refused, and
     the leg reads as a broken product. Measured on the build of 2026-09-17 21:30, whose bundle
     hash begins with an A. */
  const staleHash = h => { const i = h.indexOf("sha256-") + 7;
    return h.slice(0, i) + (h[i] === "A" ? "B" : "A") + h.slice(i + 1); };
  const putPin = (w, doc) => fs.writeFileSync(path.join(w, "engine", "etiuda.csp.json"), JSON.stringify(doc), "utf8");

  /* The BUNDLE's hash. This is the blank window the lead engineer's report called open. */
  await variant(w => { const d = pinOf(w); d.hashes[1] = staleHash(d.hashes[1]); putPin(w, d); });
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
  await variant(w => { const d = pinOf(w); d.hashes[0] = staleHash(d.hashes[0]); putPin(w, d); });
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
  /* SHOWN AND ON NO DISPLAY: this launch serves 5d and 5f, and 5f measures the refusal window's
     caption, which board item 384 put there. */
  s = await launch(newUserData("unreadable"), [], { ETIUDA_TEST_OFFSCREEN: "2" });
  await s.p.reload({ waitUntil: "load" });
  await sleep(3000);
  const nopin = await s.p.evaluate(SEEN);
  const nopinWindow = windowFacts(s.pid, wantOf(nopin));
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
  check(nopinWindow.measured === true && nopinWindow.topInset > 20 && nopin.refusal.scripts === 0,
    "5f and that window has the system's own frame, so it can be closed: the client area's top"
    + " edge sits " + nopinWindow.topInset + " px below the window's, against 0 for every launch"
    + " that boots the engine, and the page itself carries " + nopin.refusal.scripts
    + " script element(s) and therefore none of the band's controls. " + nopinWindow.how
    + (nopinWindow.measured ? "" : " - NOT MEASURED: " + nopinWindow.why));
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

  /* 5f2, THE SEPARATING CONTROL FOR 5f, board item 414. 5f reads a window rectangle off a pid,
     and a pid can own more than one visible top-level window: until this run the rule was "the
     largest by area", which is a guess, and it is why 5f was flaky. The fault is made here
     rather than waited for. The variant is the same unreadable pin - so the app's own window is
     the framed refusal 5f measures - plus a second, LARGER, FRAMELESS window opened by the
     shell. The largest by area is then the decoy, whose top inset is 0, which is exactly the
     reading that fails 5f; the client size the page answered for picks the refusal window.
     Both rules are read from ONE enumeration, so the two numbers are of one moment.

     The page is chosen the same way and for the same reason: with two windows open,
     `pages()[0]` is an order and not a choice, and the decoy's is about:blank. */
  await variant(w => {
    fs.writeFileSync(path.join(w, "engine", "etiuda.csp.json"), "{ this is not json", "utf8");
    const f = path.join(w, "shell", "main.js");
    const src = fs.readFileSync(f, "utf8");
    const was = '  win.once("ready-to-show", showWhenReady);';
    const hits = src.split(was).length - 1;
    if (hits !== 1) throw new Error("the ready-to-show line matched " + hits + " times in the asar's shell/main.js, expected 1");
    /* The decoy takes the same placement as the real window, or it would be the one thing in
       this file that reaches the screen whatever the flag says: it is created here rather than
       by the shell, so nothing else would place it. */
    const decoy = was + "\n"
      + '  const decoyWindow = new BrowserWindow(Object.assign({ width: 1600, height: 1000,'
      + ' frame: false, show: true },\n'
      + '    PLACED_ASIDE ? Object.assign({ focusable: false }, offscreenAt()) : {}));\n'
      + '  decoyWindow.loadURL("about:blank");\n';
    fs.writeFileSync(f, src.split(was).join(decoy), "utf8");
  });
  /* SHOWN AND ON NO DISPLAY: this control's whole subject is which of two windows is measured,
     and it is the only launch here that puts two windows up. */
  s = await launch(newUserData("twowindows"), [], { ETIUDA_TEST_OFFSCREEN: "2" });
  const twoPages = await s.b.pages();
  const subjectPage = twoPages.filter(pg => pg.url().indexOf("about:blank") !== 0)[0] || twoPages[0];
  const twoSeen = await subjectPage.evaluate(SEEN);
  const bothWindows = windowFacts(s.pid, wantOf(twoSeen));
  const largest = E.pickWindow(bothWindows.all || []);
  check(bothWindows.measured === true && bothWindows.windows >= 2
        && !!largest.picked && largest.picked.topInset === 0
        && bothWindows.topInset > 20 && twoSeen.refusal.en
        /* Board item 537: the decoy is made by this file rather than by the shell, so nothing
           else would place it, and a two-window launch is the one that would most obviously
           reach the desk. Both of them are counted, not just the one the leg is about. */
        && bothWindows.windowsOnDisplay === 0,
    "5f2 control: with a second, larger, frameless window open on the same pid the old rule picks"
    + " it (client " + (largest.picked ? largest.picked.cliW + "x" + largest.picked.cliH : "?")
    + ", top inset " + (largest.picked ? largest.picked.topInset : "?") + ", which is the reading"
    + " that fails 5f) and the page's own client size picks the refusal window (client "
    + bothWindows.cliW + "x" + bothWindows.cliH + ", top inset " + bothWindows.topInset + ") out of "
    + bothWindows.windows + " visible window(s) of the pid, " + bothWindows.windowsOnDisplay
    + " of them on a display. " + bothWindows.how);
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
  /* Board 531: the phases are this file's declaration and they are checked before the tally, so
     a run that stopped inside one is a FAIL with a sentence rather than a short log. */
  const missed = PHASE_MAJORS.filter(p => !phasesSeen.has(p));
  /* Board item 628: what of the block this run actually used, said rather than assumed. A run
     that reaches the end of its block is the signal to widen the row in tests/engine.js, and the
     overlap check there is what stops a widened row landing on its neighbour. */
  const BLOCK = E.PORT_BLOCKS["shell-smoke"].size;
  note("debugging ports " + PORT_BASE + " to " + port + " of the block " + PORT_BASE + "-"
    + (PORT_BASE + BLOCK - 1) + ", " + (port - PORT_BASE + 1) + " of " + BLOCK + " used"); 
  check(missed.length === 0, "every phase of the run started: " + phasesSeen.size + " of "
    + PHASE_MAJORS.length + " majors"
    + (missed.length ? ", MISSING " + missed.join(", ") + " - the tally below is not a verdict"
                     : " (" + PHASE_MAJORS.join(", ") + ")"));

  console.log("\n" + (reachedEnd ? "" : "  INCOMPLETE - ") + checks + " check(s), " + fails
    + " failed, " + Math.round((Date.now() - t0) / 1000) + "s");
  const v = E.suiteVerdict({ checks, fails, expected: EXPECTED,
                             reachedEnd: reachedEnd && missed.length === 0 });
  v.lines.forEach(l => console.log("  " + l));
  process.exit(v.exit);
});
