/* The reinstall-survival loop: install, use, uninstall, install again, and read the desk back.
 *
 *   ETIUDA_FIXTURES=<folder> node tests/reinstall.js
 *   ETIUDA_SETUP_EXE=<setup.exe> ...   drive an installer built elsewhere instead of building one
 *   ETIUDA_FIXTURES=... node tests/reinstall.js --keep      leave the lab standing
 *
 * WHY THIS IS NOT IN shell-smoke.js. That instrument builds `--win --dir` and drives
 * win-unpacked in a temp lab; it never installs anything and it touches no folder of this
 * machine's own. This one runs the NSIS installer, which writes into the real user's Start
 * Menu, Desktop and registry whatever a test would prefer, and whose whole subject is what
 * survives an uninstall. Those are different labs and different risks, so they are different
 * files.
 *
 * WHAT IT ESTABLISHES. The lead engineer's report of 2026-09-14 (ac) left this `[open]`: the
 * desk is written into the user-data folder, the D6 run measured that an uninstall removes the
 * install folder and the HKCU key, and from those two it FOLLOWS that a desk survives a
 * reinstall. Nobody had driven it. This drives it.
 *
 * THE PROFILE, AND WHY IT IS THE REAL ONE. Measured 2026-09-14: Electron ignores the APPDATA
 * environment variable. With APPDATA and LOCALAPPDATA pointed at a temp folder,
 * `app.getPath("appData")` still answered the real Roaming folder. So there are two ways to give
 * this run a profile of its own, and only one of them measures anything:
 *
 *   --user-data-dir=<lab>   the desk lands in the lab, which the uninstaller could not touch if
 *                           it tried. Every survival check then passes for the wrong reason.
 *   the real folder         the desk lands where a customer's does, which is the only place the
 *                           uninstaller's reach is a real question.
 *
 * This takes the second and makes it scratch by hand: every desk file and catalog file already
 * in the user-data folder is RENAMED aside before the run and renamed back in the finally, so
 * the run starts with no desk and ends with the folder holding exactly the files it found.
 * Check 6c reads that back.
 *
 * AND THE OTHER LABS ARE TOLD, board item 467. The lock this file used to keep lived inside the
 * profile it was parking and only this file read it, so it stopped a second reinstall run and
 * nothing else. It is now E.takeDeskLock(), a file under the scratch root that every lab of
 * every repository can see: while it is held, E.shellLaunch refuses any other launch of the
 * shell and names the holder, and a second run of this file is refused by the same lock. It is
 * taken before anything is moved and released after everything is put back.
 *
 * WHERE THE PROFILE IS is measured rather than assumed: the shell prints the full path of the
 * catalog file it read, and check 2a requires that path to be inside the folder this file
 * parked. If it is not, every later reading is of somewhere else and the run refuses.
 *
 * AND THE CATALOG FOLDER IS PINNED, board item 388. The shell searches the catalog folder first
 * and the user-data folder second, and unpinned the first of those is Documents\Etiuda. On
 * 2026-09-15 that folder held this desk's own live catalog, the installed app read it instead of
 * the fixture, and the run refused at 2a having proved nothing about the installer. So check 0b
 * pins eCatalogFolder at an EMPTY folder of the lab's own, through the same desk key Settings
 * writes that every other driver uses. Empty, on purpose: it takes Documents\Etiuda out of the
 * search order without moving the fixture, so 2a still reads the profile's own path back and
 * still proves this is a real profile rather than a lab. 2a2 reads the pin back off the running
 * app, 2d2 off the desk the app itself wrote, and phase 5 writes it again after the wipe, since
 * an unpinned control launch would find a live catalog and pass for the wrong reason.
 *
 * WHAT CAN STILL MAKE THIS RUN MEANINGLESS is a copy of Etiuda running on the real profile while
 * it goes, which writes desk.json underneath the parked files. park() refuses on one before it
 * moves anything: main processes named Etiuda.exe carrying no --user-data-dir, which is every
 * copy that would use this profile and no harness launch anywhere, since all of those pass one.
 *
 * THE CONTROL. Phase 5 deletes the desk and its backups and launches the same installed app
 * again: 0 cards, no catalog, the blur key gone. It separates - it leaves the install, the
 * uninstall and the absence checks green and reddens only 4c and 4d, which is what makes those
 * two readings of the desk rather than of an app that always looks like that.
 *
 * AND THE ABSENCE CHECKS HAVE A CONTROL TOO, for free: check 1b reads the same registry, Start
 * Menu and Desktop back after the install and requires each to have gained exactly one entry.
 * So the absences at 3b to 3d are a removal rather than a thing that was never there.
 *
 * THE SURVIVAL CHECKS HAVE ONE THE PRODUCT ITSELF PROVIDES, and it was run on 2026-09-14 rather
 * than argued. The uninstaller takes `--delete-app-data`, which is what electron-builder.js's
 * `nsis.deleteAppDataOnUninstall` would set for everybody. A copy of this file passing that flag
 * to the same uninstaller went 5 red of 29 - 3f, 4a, 4c, 4d and 4e, every survival check and
 * nothing else - while 1a to 1d, 3a to 3e, 5a, 5b and the whole teardown stayed green. So these
 * checks would catch that configuration changing, and the copy was deleted after the run. NOTE
 * that the flag removes the user-data folder whole, parked files and all: copy it aside before
 * running that control again.
 *
 * WHAT IS MEASURED AND WHAT IS NOT. File listings, registry subkey names, byte counts, sha256
 * and card counts. No screenshot decides anything and no card's text is read or printed: the
 * catalog is counted through `cards.length` of the fixture, of the text stored in the desk, and
 * through `#list .card`. The desk this run writes holds a real catalog, so teardown deletes it.
 *
 * Exit code is the number of failed checks, 78 where the run reached no verdict at all.
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
let port = 9560;
let fails = 0, checks = 0, reachedEnd = false;
let offscreenAsked = false;
const t0 = Date.now();
const live = new Set();
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const note = what => console.log("       " + what);
const phase = what => console.log("\n" + what);

/* ---- the lab, and the profile it borrows -------------------------------------------------- */

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-reinstall-"));
const REG_PS1 = path.join(LAB, "uninstall-keys.ps1");
const ASSOC_PS1 = path.join(LAB, "file-association.ps1");
const KEY_PS1 = path.join(LAB, "uninstall-key.ps1");
const PROC_PS1 = path.join(LAB, "lab-processes.ps1");
const FOREIGN_PS1 = path.join(LAB, "foreign-etiuda.ps1");
/* THE CATALOG FOLDER THIS RUN PINS, and it is deliberately EMPTY. The shell looks in the catalog
   folder first, then the user-data folder, then the install folder; unpinned, the first of those
   is Documents\Etiuda, which on a working desk holds somebody's live catalog and is the reason
   this instrument stopped on 2026-09-15. Pinning it at a folder of the lab's own takes the desk
   out of the search order without moving the fixture, so the shell still finds the fixture where
   this run put it - in the profile - and check 2a still reads the profile's own path back. */
const LABCAT = path.join(LAB, "catalogs");
/* AND A DOCUMENTS FOLDER OF THE LAB'S OWN, board item 462. The one thing this app writes into a
   person's own Documents is the sample catalog, on a first run, and `app.getPath("documents")`
   cannot be redirected from outside the process - so the shell takes ETIUDA_TEST_DOCUMENTS and
   the sample legs below point it here. The pin above cannot serve for this: seedSample() acts
   only where the catalog folder IS the default one, on purpose, so a run that pins is a run the
   sample never reaches. Every launch that clears the pin passes this, and each asserts the folder
   the app named back before it reads anything, because the alternative to this folder is the real
   Documents\Etiuda of whoever is at the desk. */
const LABDOCS = path.join(LAB, "documents");
/* Made here rather than left to the shell: a redirect at a folder that cannot be made falls back
   to the real Documents with a line on stderr, so E.shellLaunch asks for one that is there. */
fs.mkdirSync(LABDOCS, { recursive: true });
const DOCS_ETIUDA = path.join(LABDOCS, "Etiuda");
const SAMPLE = "sample-catalog.ec";
const SAMPLE_KEY = "e~sampled";

const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, "AppData", "Roaming");
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, "AppData", "Local");
const USERDATA = path.join(APPDATA, "etiuda");
const START_MENU = path.join(APPDATA, "Microsoft", "Windows", "Start Menu", "Programs");
const DESKTOP = path.join(HOME, "Desktop");
const UPDATER = path.join(LOCALAPPDATA, "etiuda-updater");
const PARKED = path.join(USERDATA, "qa-parked");

/* Everything of the desk's own that lives in the user-data folder. The Chromium profile beside
   it (Cache, Preferences and the rest) is not the subject and is left where it is. */
const MINE = n => /^desk(\.bak[0-9]+)?\.json$/.test(n) || /\.ec$/.test(n) || n === "desk.json.tmp";

const REG_KEYS = [
  "$k = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'",
  "if (Test-Path $k) { (Get-ChildItem $k).PSChildName }",
].join("\n");

const REG_ONE = [
  "param([string]$Key)",
  "$p = Get-ItemProperty ('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + $Key) -ErrorAction SilentlyContinue",
  "if ($null -eq $p) { Write-Output '{}' } else {",
  /* There is no InstallLocation on this key, measured 2026-09-14: what names the folder is
     UninstallString, and DisplayIcon after it. */
  "  [pscustomobject]@{ name = [string]$p.DisplayName; un = [string]$p.UninstallString;",
  "    loc = [string]$p.InstallLocation; ver = [string]$p.DisplayVersion } | ConvertTo-Json -Compress }",
].join("\n");

/* THE .ec ASSOCIATION, board item 380. Three values, because only the third says which copy of
   Etiuda would answer a double-click: the extension key's ProgId, and the open command that ProgId
   names. Read rather than asserted, since this machine may already carry an association from a
   real install; what the checks compare is whether that command names THIS run's install folder. */
const ASSOC = [
  "param([string]$Ext)",
  "$out = [ordered]@{ prog = ''; cmd = '' }",
  "$k = Get-Item ('HKCU:\\Software\\Classes\\' + $Ext) -ErrorAction SilentlyContinue",
  "if ($k) { $out.prog = [string]$k.GetValue('') }",
  "if ($out.prog) {",
  "  $c = Get-Item ('HKCU:\\Software\\Classes\\' + $out.prog + '\\shell\\open\\command') -ErrorAction SilentlyContinue",
  "  if ($c) { $out.cmd = [string]$c.GetValue('') }",
  "}",
  "[pscustomobject]$out | ConvertTo-Json -Compress",
].join("\n");

/* Scoped by executable path to the lab, so a copy of this app somebody else is running is never
   counted and never killed. */
const LAB_PROCS = [
  "param([string]$Under)",
  "$n = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($Under) })",
  "Write-Output $n.Count",
].join("\n");

/* ANY COPY OF THE APP THAT WOULD WRITE THE PROFILE THIS RUN IS ABOUT TO BORROW. A run of the
   harness elsewhere on this machine is harmless, because every other driver launches with
   --user-data-dir into a lab; what is not harmless is a copy running on the REAL profile, which
   will rewrite desk.json under this run and make the readings below somebody else's.
   BOTH NAMES, measured 2026-09-15: the packaged app is Etiuda.exe and `electron .` from the
   repository is electron.exe, and it was the second that wrote a desk into the profile under a
   run of this file while its installer was building. Main processes only: Chromium's helpers
   carry --type= and write nothing of their own. */
const FOREIGN = [
  "$out = @(Get-CimInstance Win32_Process |",
  /* ONE LINE, and it has to be: a PowerShell script block broken across lines before an -and is
     a new statement rather than a continuation, and the filter then degenerates to its first
     clause while printing an error nobody reads. Measured on 2026-09-15, when the two-line
     version named four launches that were carrying --user-data-dir all along. */
  "  Where-Object { ($_.Name -eq 'Etiuda.exe' -or $_.Name -eq 'electron.exe') -and $_.CommandLine -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine -notmatch '--user-data-dir' } |",
  "  ForEach-Object { [string]$_.ProcessId + ' ' + [string]$_.ExecutablePath })",
  "Write-Output ($out -join [Environment]::NewLine)",
].join("\n");

function ps(file, args) {
  return execFileSync("powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file].concat(args || []),
    { encoding: "utf8", windowsHide: true }).trim();
}
function uninstallKeys() {
  return ps(REG_PS1).split(/\r?\n/).map(s => s.trim()).filter(Boolean).sort();
}
function uninstallKey(name) {
  try { return JSON.parse(ps(KEY_PS1, ["-Key", name]) || "{}"); } catch (e) { return {}; }
}
function labProcesses() { try { return Number(ps(PROC_PS1, ["-Under", LAB.replace(/\//g, "\\")])); } catch (e) { return -1; } }
function foreignEtiuda() {
  try { return ps(FOREIGN_PS1).split(/\r?\n/).map(s => s.trim()).filter(Boolean); } catch (e) { return []; }
}
function assoc(ext) { try { return JSON.parse(ps(ASSOC_PS1, ["-Ext", ext]) || "{}"); } catch (e) { return {}; } }
/* Whether the command a double-click would run lives under `dir`. Lower-cased and
   backslash-normalised on both sides, because the registry keeps whatever NSIS wrote. */
function assocPointsAt(a, dir) {
  const cmd = String((a || {}).cmd || "").toLowerCase();
  return !!cmd && cmd.indexOf(dir.toLowerCase().replace(/\//g, "\\")) > -1;
}
function killPid(pid) {
  try { execFileSync("taskkill", ["/F", "/PID", String(pid), "/T"], { stdio: "ignore" }); } catch (e) { /* already gone */ }
  live.delete(pid);
}

function listing(dir) {
  try { return fs.readdirSync(dir).sort(); } catch (e) { return []; }
}
function added(before, after) { return after.filter(n => before.indexOf(n) < 0); }
function sha256Of(file) { try { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); } catch (e) { return null; } }
function deskFile() { return path.join(USERDATA, "desk.json"); }
function deskKeys() {
  try { return JSON.parse(fs.readFileSync(deskFile(), "utf8")).keys || {}; } catch (e) { return {}; }
}
function cardsInDesk() {
  const t = deskKeys().eCatalog;
  if (typeof t !== "string") return -1;
  try { const c = JSON.parse(t); return Array.isArray(c.cards) ? c.cards.length : -2; } catch (e) { return -3; }
}

/* ---- parking the profile, and putting it back ---------------------------------------------- */

let parkedNames = [];
let foundBefore = [];
let updaterParked = false;
let unparked = false;
let parkedOk = false;
let lockHeld = false;
let lockReleased = null;

function park() {
  if (!fs.existsSync(USERDATA)) fs.mkdirSync(USERDATA, { recursive: true });
  /* THE LOCK FIRST, before anything is moved and before the sweep below, because it is what
     stops another lab starting a launch while this one is looking. A lock whose holder is gone
     is broken by takeDeskLock with a line saying so, so a run that died does not wedge the
     harness until somebody deletes a file by hand. */
  const lock = E.takeDeskLock("tests/reinstall.js");
  if (!lock.ok)
    E.refuse("another run holds the desk: pid " + (lock.holder ? lock.holder.pid : "?") + ", "
             + (lock.holder ? lock.holder.who : "unknown") + ", since "
             + (lock.holder ? lock.holder.since : "unknown"),
             "that run is driving the real profile and this one would fight it for the same files.",
             "the lock is " + lock.path + "; if its holder is gone the next taker breaks it.");
  lockHeld = true;
  /* BEFORE ANYTHING IS MOVED, because E.refuse() exits and a refusal that has already renamed
     somebody's desk is worse than the condition it refused. A copy of Etiuda running on the real
     profile writes desk.json whenever it saves, which lands underneath the files this run is
     about to park and reads as a desk that was already there. */
  const foreign = foreignEtiuda();
  if (foreign.length)
    E.refuse("a copy of Etiuda is running on this machine's own profile: " + foreign.join("; "),
             "this run borrows " + USERDATA + " and that copy would write into it underneath.",
             "close it, or wait for the run that started it, and try again.");
  fs.mkdirSync(PARKED, { recursive: true });
  foundBefore = listing(USERDATA).filter(MINE);
  parkedNames = foundBefore.slice();
  /* A rename rather than a copy: it is atomic, it costs nothing at 600 KB or at 60 MB, and a
     desk that is moved cannot be half-copied. */
  for (const n of parkedNames) fs.renameSync(path.join(USERDATA, n), path.join(PARKED, n));
  /* The install overwrites the updater's cached copy of the installer, which is a file this run
     did not put there. Same treatment. */
  const cached = path.join(UPDATER, "installer.exe");
  if (fs.existsSync(cached)) {
    fs.renameSync(cached, path.join(UPDATER, "installer.parked.exe"));
    updaterParked = true;
  }
}

function unpark() {
  if (unparked) return;
  unparked = true;
  for (const n of listing(USERDATA).filter(MINE)) {
    try { fs.rmSync(path.join(USERDATA, n), { force: true }); } catch (e) { /* named by 6c */ }
  }
  for (const n of parkedNames) {
    try { fs.renameSync(path.join(PARKED, n), path.join(USERDATA, n)); } catch (e) { /* named by 6c */ }
  }
  try { fs.rmSync(PARKED, { recursive: true, force: true }); } catch (e) { /* named by 6c */ }
  if (updaterParked) {
    const cached = path.join(UPDATER, "installer.exe");
    try { fs.rmSync(cached, { force: true }); } catch (e) { /* below */ }
    try { fs.renameSync(path.join(UPDATER, "installer.parked.exe"), cached); } catch (e) { /* below */ }
  }
  lockReleased = E.releaseDeskLock();
}

/* The last resort. E.refuse() and any other process.exit leave a finally unrun, and what would
   be left behind then is this machine's own desk under another name plus a lock nothing clears.
   An exit handler runs synchronously even on process.exit, so the profile comes back either way;
   the finally is still where the CHECK on it is made. */
process.on("exit", () => {
  if (parkedOk) unpark();
  /* AND THE LOCK, which unpark() releases on the ordinary path but which is taken BEFORE the
     files are moved: a refusal between the two - the foreign-copy sweep is exactly there - would
     otherwise leave it held by a process that is gone. Breaking a stale lock is the next taker's
     job and it works, but a lock this run can clear itself should not be left for it. */
  if (lockHeld && !lockReleased) lockReleased = E.releaseDeskLock();
  /* And the lab, for the same reason: E.refuse() exits past the finally, and %TEMP% on this
     machine has filled with abandoned labs from runs that did. rmSync on a folder already
     removed is a no-op, so the normal path is unaffected. */
  if (!KEEP) { try { fs.rmSync(LAB, { recursive: true, force: true }); } catch (x) { /* nothing left to try */ } }
});

/* ---- the installer ------------------------------------------------------------------------- */

function buildSetup() {
  const given = process.env.ETIUDA_SETUP_EXE;
  if (given) {
    if (!fs.existsSync(given)) throw new Error("ETIUDA_SETUP_EXE does not exist: " + given);
    return { exe: given, built: 0 };
  }
  const out = path.join(LAB, "dist");
  const cli = path.join(E.ROOT, "node_modules", "electron-builder", "out", "cli", "cli.js");
  if (!fs.existsSync(cli)) throw new Error("electron-builder is not installed; npm install first");
  const t = Date.now();
  execFileSync(process.execPath, [cli, "--win"],
    { cwd: E.ROOT, env: Object.assign({}, process.env, { ETIUDA_DIST: out }), stdio: "ignore" });
  const found = listing(out).filter(n => /-setup\.exe$/i.test(n));
  if (found.length !== 1) throw new Error(out + " holds " + found.length + " installers; expected 1");
  return { exe: path.join(out, found[0]), built: Math.round((Date.now() - t) / 100) / 10 };
}

/* /D must be the LAST parameter and must not be quoted, which is NSIS's rule and not node's, so
   a directory holding a space is refused here rather than mis-parsed there.
   AND /currentuser, WITHOUT WHICH THIS FILE CANNOT RUN ON A DESK THAT HAS THE APP INSTALLED FOR
   ALL USERS. Measured 2026-09-17: a per-machine copy went into C:\Program Files\Etiuda at 07:35,
   and from then on `setup.exe /S` exited 199 having installed nothing, the freshly built
   installer exactly as the dist one. Run with a window, the same installer says why on its own
   first page - "There is already a per-machine installation. Will reinstall/upgrade" - so the
   silent run was choosing the per-machine context, needing elevation it cannot ask for, and
   quitting. /currentuser names the context this file has always MEASURED - the HKCU uninstall
   key at 1b, the user's own Start Menu and Desktop, the per-user association at 1b2 - which the
   installer picked by itself only while no other copy was installed. The uninstaller takes it
   too, because a per-user install writes it into its own UninstallString. */
function installTo(setup, dir) {
  if (/\s/.test(dir)) throw new Error("the install directory holds a space, which /D cannot carry: " + dir);
  execFileSync(setup, ["/S", "/currentuser", "/D=" + dir.replace(/\//g, "\\")], { stdio: "ignore", windowsHide: true });
}

/* The uninstaller returns in under a second and finishes in its own time: measured 0.9 s to
   return and 4 s to the folder being gone. So the verdict is the folder, never the exit code. */
async function uninstallFrom(dir, seconds) {
  const un = path.join(dir, "Uninstall Etiuda.exe");
  if (!fs.existsSync(un)) return -1;
  execFileSync(un, ["/S", "/currentuser"], { stdio: "ignore", windowsHide: true });
  const limit = seconds === undefined ? 40 : seconds;
  for (let i = 1; i <= limit; i++) {
    await sleep(1000);
    if (!fs.existsSync(dir)) return i;
  }
  return -1;
}

/* ---- launching and driving ------------------------------------------------------------------ */

async function launch(dir, env) {
  port++;
  /* OFF SCREEN, board item 385: this file installs the app and drives the installed copy, and
     nothing it asks is about the window. E.offscreenEnv() is the one place the flag is set.
     `env` is board 462's and nothing else's: the three sample launches hand over
     ETIUDA_TEST_DOCUMENTS so that the one file this app writes into somebody's Documents is
     written into the lab instead. offscreenEnv merges it over the environment.

     ownsDesk, board item 467: this is the one launcher in the harness with no --user-data-dir of
     its own, because the real profile IS its subject - it is parked aside above and put back on
     the way out. Every other launch anywhere in tests/ is refused without one. The catalog
     folder is still confined, by the pin this file writes into the profile or by the lab's own
     Documents, and E.shellLaunch reads which of the two before it spawns anything. */
  const child = E.shellLaunch("tests/reinstall.js", path.join(dir, "Etiuda.exe"),
    ["--remote-debugging-port=" + port],
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv(env), ownsDesk: true });
  live.add(child.pid);
  const said = [];
  child.stdout.on("data", d => said.push(String(d).trim()));
  child.stderr.on("data", d => said.push(String(d).trim()));
  let b = null;
  for (let i = 0; i < 40 && !b; i++) {
    await sleep(500);
    try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + port, defaultViewport: null }); } catch (x) { /* not up yet */ }
  }
  if (!b) { killPid(child.pid); throw new Error("the installed app did not answer on the debugging port within 20 s: " + said.join(" | ")); }
  const p = (await b.pages())[0];
  await sleep(3500);
  /* Asked once, of this file's own first launch, and asked of the machine rather than of the
     variable: what the environment carried is not evidence that a window stayed off the screen.
     A helper that cannot look answers measured:false and this reddens. */
  if (!offscreenAsked) {
    offscreenAsked = true;
    const v = E.offscreenVerdict(child.pid, "tests/reinstall.js");
    check(v.ok, v.what);
  }
  return {
    b, p, said, pid: child.pid,
    page: async () => (await b.pages())[0],
    stop: async () => { try { b.disconnect(); } catch (x) {} killPid(child.pid); await sleep(1200); },
  };
}

/* WHAT THE APP SAID ABOUT WHERE IT LOOKED, read off its own stdout. Both of these are taken from
   the LAST matching line rather than from a join, because a stdout chunk can carry several lines
   at once and a greedy match over the join reads one line's tail as another's. */
const namedFolderOf = said => {
  const lines = said.join("\n").split("\n").filter(l => /etiuda: catalog folder /.test(l));
  const m = lines.length ? lines[lines.length - 1].match(/etiuda: catalog folder (.+?)\s*$/) : null;
  return m ? m[1] : "";
};
const namedReadOf = said => {
  const lines = said.join("\n").split("\n").filter(l => /catalog read from /.test(l));
  const m = lines.length ? lines[lines.length - 1].match(/catalog read from ([^,]+),/) : null;
  return m ? m[1] : "";
};

const SEEN = () => ({
  booted: typeof window.E_VERSION === "string",
  eHost: document.body.classList.contains("e-host"),
  glassOff: document.body.classList.contains("glass-off"),
  cards: document.querySelectorAll("#list .card").length,
  catalogThere: typeof window.E_CATALOG !== "undefined",
  offer: !!document.querySelector("#ecYes"),
});

/* The same route through the interface that shell-smoke's check 3b drives: the menu, the fold
   and the segment, so the key is written by the app rather than by a call from outside it. */
const DRIVE_BLUR_OFF = async () => {
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
  off.click(); await wait(700);
  return { step: "clicked", glass: document.body.classList.contains("glass-off") };
};

/* ---- the run --------------------------------------------------------------------------------- */

const FIX = E.fixtures("catalogEc").catalogEc;
const FIXTURE_CARDS = (() => {
  const doc = JSON.parse(fs.readFileSync(FIX, "utf8"));
  if (+doc.format !== 2 || doc.kind !== "etiuda-catalog") E.refuse("the fixture is not a format 2 catalog document: " + FIX);
  return doc.cards.length;
})();

const PROG1 = path.join(LAB, "prog1");
const PROG2 = path.join(LAB, "prog2");
let regBefore = [], smBefore = [], dtBefore = [];
let assocBefore = {};
let newKey = "", lnkSm = "", lnkDt = "";

(async () => {
  if (process.platform !== "win32") E.refuse("this instrument drives a Windows installer and this is " + process.platform);
  fs.writeFileSync(REG_PS1, REG_KEYS, "utf8");
  fs.writeFileSync(KEY_PS1, REG_ONE, "utf8");
  fs.writeFileSync(PROC_PS1, LAB_PROCS, "utf8");
  fs.writeFileSync(ASSOC_PS1, ASSOC, "utf8");
  fs.writeFileSync(FOREIGN_PS1, FOREIGN, "utf8");

  phase("[0/6] the lab, and the profile parked aside");
  park();
  parkedOk = true;
  note("the user-data folder is " + USERDATA);
  note("parked " + parkedNames.length + " file(s) of the desk's own into " + PARKED
    + (parkedNames.length ? ": " + parkedNames.join(", ") : ""));
  const setup = buildSetup();
  note((setup.built ? "built the installer in " + setup.built + "s: " : "given the installer: ")
    + setup.exe + ", " + fs.statSync(setup.exe).size + " bytes, sha256 " + sha256Of(setup.exe).slice(0, 16));
  regBefore = uninstallKeys();
  assocBefore = assoc(".ec");
  smBefore = listing(START_MENU);
  dtBefore = listing(DESKTOP);
  const updaterBefore = fs.existsSync(path.join(UPDATER, "installer.exe"));
  check(listing(USERDATA).filter(MINE).length === 0 && !fs.existsSync(deskFile()),
    "0a the run starts with no desk and no catalog file in the profile: "
    + JSON.stringify(listing(USERDATA).filter(MINE)) + ", so nothing below can be reading a desk"
    + " that was already there"
    + (listing(USERDATA).filter(MINE).length
       ? ". Something wrote into the profile between park() and here; a copy of the app on the real"
         + " profile now: " + JSON.stringify(foreignEtiuda()) : ""));
  /* AND THE RUN STOPS THERE. Measured 2026-09-15: another seat's `electron .` wrote a desk into
     the profile while this file's installer was building, and the run went on to report eight red
     checks of which six were that one desk - the offer never came up because the stray desk
     carried a refusal, so no catalog was stored, so nothing survived the reinstall. A verdict
     made of somebody else's settings is worse than no verdict, and NO_VERDICT is what this is. */
  if (listing(USERDATA).filter(MINE).length)
    E.refuse("the profile is not this run's own: " + JSON.stringify(listing(USERDATA).filter(MINE))
             + " appeared in " + USERDATA + " after this run parked what it found",
             "a copy of the app on the real profile now: " + JSON.stringify(foreignEtiuda()),
             "the files this run parked go back from " + PARKED + " on the way out, and what is"
             + " listed above goes with them, because a profile cannot hold two desks under one"
             + " name and the run promised to leave this one as it found it.",
             "wait for whatever is driving Etiuda on this desk, then run again.");

  /* THE PIN, and the whole of board item 388. Every other launch in the harness pins the catalog
     folder and this one did not; it did not need to while Documents\Etiuda was empty, and on
     2026-09-15 it was not, so the installed app read the desk's own live catalog and the run
     refused at 2a. The pin goes in AFTER 0a, because 0a's subject is what was in the profile
     before this run touched it, and the pin is this run touching it. */
  E.pinCatalogFolder(USERDATA, LABCAT);
  const pinned = deskKeys();
  check(pinned[E.CATALOG_FOLDER_KEY] === LABCAT && Object.keys(pinned).length === 1
        && listing(LABCAT).length === 0,
    "0b and the catalog folder is pinned at a folder of the lab's own, through the product's own"
    + " desk key: " + E.CATALOG_FOLDER_KEY + " = " + JSON.stringify(LABCAT) + ", the only key in"
    + " the desk this run wrote (" + Object.keys(pinned).length + "), and the folder is empty ("
    + listing(LABCAT).length + " entries). So the head of the shell's search order is a folder"
    + " nobody else writes, Documents\\Etiuda is out of it, and the fixture below is still found"
    + " in the profile where this run puts it");
  note(regBefore.length + " HKCU uninstall key(s), " + smBefore.length + " Start Menu entry(ies), "
    + dtBefore.length + " Desktop entry(ies) before the install; the updater's cached installer "
    + (updaterBefore ? "was already there and is parked" : "was absent"));

  /* ---- 1: the first install ----------------------------------------------------------------- */

  phase("[1/6] the first install, silent");
  let t = Date.now();
  installTo(setup.exe, PROG1);
  const installed = listing(PROG1);
  check(installed.indexOf("Etiuda.exe") > -1 && installed.indexOf("Uninstall Etiuda.exe") > -1
        && fs.existsSync(path.join(PROG1, "resources", "app.asar")),
    "1a a silent install put the app in a folder of this run's own in "
    + Math.round((Date.now() - t) / 100) / 10 + "s: " + installed.length + " entries in " + PROG1
    + ", Etiuda.exe and the uninstaller among them");

  const regNew = added(regBefore, uninstallKeys());
  const smNew = added(smBefore, listing(START_MENU));
  const dtNew = added(dtBefore, listing(DESKTOP));
  newKey = regNew[0] || "";
  lnkSm = smNew[0] || "";
  lnkDt = dtNew[0] || "";
  const keyFacts = newKey ? uninstallKey(newKey) : {};
  const keyNames = String(keyFacts.un || "").toLowerCase().indexOf(PROG1.toLowerCase().replace(/\//g, "\\")) > -1;
  check(regNew.length === 1 && smNew.length === 1 && dtNew.length === 1 && keyNames,
    "1b and outside it, exactly one of each: HKCU key " + JSON.stringify(newKey) + ", whose"
    + " UninstallString names this run's own install folder (" + keyNames + ") and whose"
    + " DisplayVersion is " + JSON.stringify(keyFacts.ver || null) + "; Start Menu "
    + JSON.stringify(lnkSm) + ", Desktop " + JSON.stringify(lnkDt)
    + ". This is the control for 3b to 3d: those absences are a removal, not a thing never made");
  const assocAfter = assoc(".ec");
  check(assocPointsAt(assocAfter, PROG1),
    "1b2 and the installer registered .ec to this run's own copy: ProgId "
    + JSON.stringify(assocAfter.prog || null) + ", open command " + JSON.stringify(assocAfter.cmd || null)
    + (assocBefore.cmd ? "; this machine already carried " + JSON.stringify(assocBefore.cmd) + " before the run" : "")
    + ". This is the control for 3b2: that absence is a removal rather than a thing never made");
  if (!keyFacts.loc)
    note("that key carries no InstallLocation value at all, which is where Add or remove programs"
      + " and most tooling look for the folder; only UninstallString and DisplayIcon name it");

  const inAsar = crypto.createHash("sha256")
    .update(asar.extractFile(path.join(PROG1, "resources", "app.asar"), "engine/etiuda.html")).digest("hex");
  const names = asar.listPackage(path.join(PROG1, "resources", "app.asar"))
    .map(n => n.split(path.sep).join("/").replace(/^\//, "")).filter(n => n.indexOf(".") > -1).sort();
  check(inAsar === E.sha256(E.ENGINE_PATH)
        && names.join(",") === "engine/etiuda.csp.json,engine/etiuda.html,package.json,shell/main.js,shell/preload.js,shell/sample-catalog.ec",
    "1c what got installed is what was built: the asar holds the six allowlisted files and the"
    + " engine inside it is the engine in the tree, sha256 " + inAsar.slice(0, 16));

  const cached = path.join(UPDATER, "installer.exe");
  check(fs.existsSync(cached) && fs.statSync(cached).size === fs.statSync(setup.exe).size,
    "1d the install also caches a whole copy of the installer outside its own folder: "
    + cached + ", " + (fs.existsSync(cached) ? fs.statSync(cached).size : 0)
    + " bytes. Asserted as a measurement so that a change to it reddens; check 3g is what the"
    + " uninstaller does about it");

  /* THE SAMPLE, AND THE ONE RUN THAT GETS IT, board item 462. Since 8e839dd the installed app
     carries the letters sample in its asar and puts it in Documents\Etiuda the first time it
     finds that folder holding no catalog, marking the desk with e~sampled so it never does it
     twice. This loop is where the second half of that promise can be driven and nowhere else:
     the marker lives in the desk, the desk is the thing that survives an uninstall, and 4f below
     is the same profile after a real reinstall.
     THREE THINGS THIS RUN HAS TO DO TO ITSELF FIRST, each undone before phase 2:
       - the pin goes, because seedSample() acts only where the catalog folder is the DEFAULT one
         and a pinned run is a run the sample never reaches. E.pinCatalogFolder puts it back below
         and keeps every key the app wrote, which is how the marker rides into phase 2;
       - Documents becomes the lab's, through ETIUDA_TEST_DOCUMENTS, so the folder this launch
         writes into is not the Documents\Etiuda of whoever is at this desk;
       - and the app is asked which folder it searched before anything is read of it. If that is
         not the lab's, the run stops rather than reports: a sample leg reading somebody's own
         folder would be a verdict made of their catalog. */
  const sampleInAsar = asar.extractFile(path.join(PROG1, "resources", "app.asar"), "shell/" + SAMPLE);
  const sampleFile = path.join(DOCS_ETIUDA, SAMPLE);
  fs.writeFileSync(deskFile(), JSON.stringify({ kind: "etiuda-desk", schema: 1, app: "harness",
    saved: new Date().toISOString(), keys: {} }), "utf8");
  let s0 = await launch(PROG1, { ETIUDA_TEST_DOCUMENTS: LABDOCS });
  const seedFolder = namedFolderOf(s0.said);
  const seedInLab = (() => { try { return !!seedFolder && E.inside(LABDOCS, seedFolder); } catch (x) { return false; } })();
  if (!seedInLab) {
    await s0.stop();
    throw new Error("the launch for board 462 searched " + JSON.stringify(seedFolder) + ", which is"
      + " not inside " + LABDOCS + ", so ETIUDA_TEST_DOCUMENTS was not honoured and the sample"
      + " legs would be reading a folder of this machine's own");
  }
  const seeded = await s0.p.evaluate(SEEN);
  /* Windows answers one path in more than one spelling, so the two are compared resolved and
     folded rather than as the strings each side happened to write. */
  const samePath = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  const seedRead = namedReadOf(s0.said);
  const wrote = fs.existsSync(sampleFile) ? fs.readFileSync(sampleFile) : Buffer.alloc(0);
  const sampleCards = (() => {
    try {
      const d = JSON.parse(wrote.toString("utf8"));
      return (+d.format === 2 && d.kind === "etiuda-catalog") ? d.cards.length : -1;
    } catch (x) { return -1; }
  })();
  check(wrote.length > 0 && wrote.equals(sampleInAsar) && sampleCards > 0
        && listing(DOCS_ETIUDA).length === 1,
    "1e a first run whose Documents\\Etiuda holds no catalog is given the sample the installer"
    + " carries, byte for byte: " + wrote.length + " bytes written to " + sampleFile + " against "
    + sampleInAsar.length + " in the asar, equal " + (wrote.length > 0 && wrote.equals(sampleInAsar))
    + ", parsing as a format 2 catalog document of " + sampleCards + " cards, and it is the only"
    + " thing in the folder (" + listing(DOCS_ETIUDA).length + " entries). The comparison is"
    + " against the asar rather than the tree, because the asar is what a customer is handed");
  check(seeded.offer === true && seeded.catalogThere === true && seeded.cards === 0
        && samePath(seedRead, sampleFile) && s0.said.some(l => /the sample catalog was put in/.test(l)),
    "1f and it is OFFERED rather than loaded behind the person: #ecYes is up (" + seeded.offer
    + "), window.E_CATALOG is there (" + seeded.catalogThere + "), " + seeded.cards + " cards are"
    + " on screen until it is accepted, and the file the shell named reading it is the sample this"
    + " run just watched appear: " + JSON.stringify(seedRead));
  await s0.stop();
  const keys1 = deskKeys();
  /* THE EJECT, made by hand because it is the harsher case: an eject inside the app leaves the
     file where it is, so the folder never empties and the condition never comes back round.
     Deleting it puts the folder back exactly as it was before the launch above, which means the
     only thing standing between this profile and a second copy of the sample is the marker - and
     that is precisely what 4f reads after a reinstall. */
  fs.rmSync(sampleFile, { force: true });
  E.pinCatalogFolder(USERDATA, LABCAT);
  const keys1b = deskKeys();
  check(keys1[SAMPLE_KEY] === "1" && listing(DOCS_ETIUDA).length === 0
        && keys1b[SAMPLE_KEY] === "1" && keys1b[E.CATALOG_FOLDER_KEY] === LABCAT,
    "1g the desk carries the occasion rather than the folder: " + SAMPLE_KEY + " = "
    + JSON.stringify(keys1[SAMPLE_KEY] || null) + " among " + Object.keys(keys1).length
    + " key(s) the app wrote. The sample is then deleted by hand, leaving "
    + listing(DOCS_ETIUDA).length + " entries in the folder, and the pin goes back beside the"
    + " marker (" + Object.keys(keys1b).join(", ") + "), so phase 2 runs exactly as it did before"
    + " this leg existed");

  /* ---- 2: a key and a catalog written through the running app -------------------------------- */

  phase("[2/6] a key and a catalog, written through the app");
  fs.copyFileSync(FIX, path.join(USERDATA, "etiuda-catalog.ec"));
  let s = await launch(PROG1);
  const readLine = s.said.filter(l => /catalog read from /.test(l)).join(" | ");
  const namedPath = (readLine.match(/catalog read from ([^,]+),/) || [])[1] || "";
  /* inside() resolves both sides, so a path that does not exist throws rather than answering
     false; the question here is which FOLDER the shell named, and a missing file is a no. */
  const namedHere = (() => { try { return !!namedPath && E.inside(USERDATA, namedPath); } catch (x) { return false; } })();
  check(namedHere,
    "2a the shell read the catalog out of the folder this run parked, and said so: "
    + JSON.stringify(namedPath) + " is inside " + USERDATA
    + ". So every desk reading below is of this machine's own profile and not of a lab folder");
  /* The pin read back off the running app rather than off the file this process wrote: the shell
     prints the folder it will search first, and a pin that did not survive the boot would print
     Documents\Etiuda here while everything else still looked well. */
  const folderLine = s.said.filter(l => /etiuda: catalog folder /.test(l)).join(" | ");
  const namedFolder = (folderLine.match(/etiuda: catalog folder (.+)$/) || [])[1] || "";
  check(namedFolder === LABCAT,
    "2a2 and the installed app searched the pinned folder first, and said so on its own output: "
    + JSON.stringify(namedFolder) + " against the " + JSON.stringify(LABCAT) + " this run pinned."
    + " That is the desk's default folder out of the search order, read back from the app rather"
    + " than from the file this process wrote");
  if (!namedHere) {
    await s.stop();
    throw new Error("the app's user-data folder is not " + USERDATA + ", so nothing below would measure"
      + " anything; it named " + JSON.stringify(namedPath));
  }

  const up = await s.p.evaluate(() => !!document.querySelector("#ecYes"));
  const clicked = await s.p.evaluate(() => { const y = document.querySelector("#ecYes"); if (!y) return false; y.click(); return true; });
  await sleep(6000);
  const land = await (await s.page()).evaluate(SEEN);
  check(up && clicked && land.cards === FIXTURE_CARDS,
    "2b the offer was accepted and the catalog is on screen: " + land.cards + " cards against the"
    + " fixture's " + FIXTURE_CARDS + " (offer up " + up + ", clicked " + clicked + ")");

  const drive = await (await s.page()).evaluate(DRIVE_BLUR_OFF);
  await sleep(900);
  check(drive.step === "clicked" && drive.glass === true,
    "2c and a key was written the way a person writes one, through the menu, the fold and the"
    + " blur segment: " + JSON.stringify(drive));
  await s.stop();

  const keys2 = deskKeys();
  const inDesk = cardsInDesk();
  const deskBytes = fs.statSync(deskFile()).size;
  const sha2 = sha256Of(deskFile());
  check(inDesk === FIXTURE_CARDS && keys2.eGlassOff === "1",
    "2d both are in desk.json on disk, read by this process: the stored catalog parses to "
    + inDesk + " cards and eGlassOff is " + JSON.stringify(keys2.eGlassOff) + ", among "
    + Object.keys(keys2).length + " key(s) in " + deskBytes + " bytes, sha256 " + sha2.slice(0, 16));
  /* The app writes the desk WHOLE from the engine's own keys, so the pin survives only because
     it is an ordinary engine key rather than a second settings file. If that ever stops being
     true, every launch from here on reads Documents\Etiuda and 4b would be the first to know,
     which is two phases too late to name the cause. */
  check(keys2[E.CATALOG_FOLDER_KEY] === LABCAT,
    "2d2 and the pin came back out of the app's own save: " + E.CATALOG_FOLDER_KEY + " = "
    + JSON.stringify(keys2[E.CATALOG_FOLDER_KEY] || null) + " in the desk the app wrote, so the"
    + " launches below still search the lab folder and not this desk's own");

  fs.rmSync(path.join(USERDATA, "etiuda-catalog.ec"), { force: true });
  check(!fs.existsSync(path.join(USERDATA, "etiuda-catalog.ec")),
    "2e the catalog FILE is then removed from the profile, so after the reinstall the only place"
    + " cards can come from is the desk");

  /* ---- 3: the uninstall ---------------------------------------------------------------------- */

  phase("[3/6] the uninstall");
  const gone = await uninstallFrom(PROG1);
  check(gone > 0 && !fs.existsSync(PROG1),
    "3a the install folder is gone " + gone + "s after a silent uninstall returned: " + PROG1);
  check(uninstallKeys().indexOf(newKey) < 0,
    "3b the HKCU uninstall key it made is gone: " + JSON.stringify(newKey));
  const assocGone = assoc(".ec");
  check(!assocPointsAt(assocGone, PROG1),
    "3b2 and no .ec double-click would start this run's copy any more: the open command is now "
    + JSON.stringify(assocGone.cmd || null) + ", which does not name " + PROG1);
  check(listing(START_MENU).indexOf(lnkSm) < 0,
    "3c the Start Menu entry is gone: " + JSON.stringify(lnkSm));
  check(listing(DESKTOP).indexOf(lnkDt) < 0,
    "3d the Desktop entry is gone: " + JSON.stringify(lnkDt));
  check(labProcesses() === 0,
    "3e and no process of the lab is running: " + labProcesses());
  const sha3 = sha256Of(deskFile());
  const bytes3 = fs.existsSync(deskFile()) ? fs.statSync(deskFile()).size : -1;
  check(sha3 === sha2 && bytes3 === deskBytes,
    "3f the desk is untouched by the uninstall, byte for byte: sha256 " + String(sha3).slice(0, 16)
    + " over " + bytes3 + " bytes now, against " + sha2.slice(0, 16) + " over " + deskBytes
    + " bytes at 2d" + (sha3 === null ? " (the file is not there at all)" : ""));
  check(fs.existsSync(cached),
    "3g and the cached installer at " + cached + " is NOT removed: "
    + (fs.existsSync(cached) ? fs.statSync(cached).size + " bytes of it survive the uninstall" : "gone")
    + ". Asserted as the measurement, because it is the product's behaviour and not this run's");

  /* ---- 4: the second install, and the read-back ---------------------------------------------- */

  phase("[4/6] the second install, and what the app finds");
  t = Date.now();
  installTo(setup.exe, PROG2);
  check(fs.existsSync(path.join(PROG2, "Etiuda.exe")) && sha256Of(deskFile()) === sha2,
    "4a the second install went into a folder of its own in " + Math.round((Date.now() - t) / 100) / 10
    + "s and did not touch the desk either: sha256 still " + String(sha256Of(deskFile())).slice(0, 16));

  s = await launch(PROG2);
  const back = await s.p.evaluate(SEEN);
  check(!back.catalogThere && s.said.some(l => /no catalog found/.test(l)),
    "4b the app comes up with no catalog file anywhere: window.E_CATALOG is "
    + (back.catalogThere ? "present" : "undefined") + " and the shell says so on its own output");
  check(back.cards === FIXTURE_CARDS,
    "4c and the cards are on screen anyway, out of the desk: " + back.cards + " against the "
    + FIXTURE_CARDS + " that were stored");
  const keys4 = deskKeys();
  check(back.glassOff === true && keys4.eGlassOff === "1",
    "4d and the key is in effect, not merely on disk: body.glass-off " + back.glassOff
    + " with eGlassOff " + JSON.stringify(keys4.eGlassOff) + " in the file");
  const changed = Object.keys(keys2).filter(k => keys4[k] !== keys2[k]);
  const addedKeys = Object.keys(keys4).filter(k => !(k in keys2));
  check(changed.length === 0,
    "4e every key the first install left is still there and still equal: " + Object.keys(keys2).length
    + " key(s) compared one by one, " + changed.length + " changed"
    + (addedKeys.length ? ", and this run's boot added " + addedKeys.length + ": " + addedKeys.join(", ") : ""));
  await s.stop();

  /* AND THE SAMPLE DOES NOT COME BACK, board item 462. Everything the condition reads is true
     again: the app has just been installed fresh, its Documents\Etiuda holds no catalog, and the
     file it put there in phase 1 was deleted. The only thing that says no is e~sampled in the
     desk, which 4e has just proved survived the reinstall unchanged. Taken AFTER 4e on purpose -
     the pin has to come out of the desk for the sample code to be reachable at all, and 4e's
     subject is the desk the reinstall found.
     AND ITS TWIN, 4g, because 4f asserts that nothing happened and a leg like that passes for
     free: with the marker cleared and not one other thing changed, the same app on the same
     folder writes the sample again. Without it, an ETIUDA_TEST_DOCUMENTS that was quietly
     ignored, an asar that had lost the file, or a seedSample() deleted outright would all read
     as "it did not come back". */
  const unpin = keys => { const k = Object.assign({}, keys); delete k[E.CATALOG_FOLDER_KEY]; return k; };
  const writeDesk = keys => fs.writeFileSync(deskFile(), JSON.stringify({ kind: "etiuda-desk",
    schema: 1, app: "harness", saved: new Date().toISOString(), keys: keys }), "utf8");
  writeDesk(unpin(keys4));
  s = await launch(PROG2, { ETIUDA_TEST_DOCUMENTS: LABDOCS });
  const backFolder = namedFolderOf(s.said);
  if (!samePath(backFolder, DOCS_ETIUDA)) {
    await s.stop();
    throw new Error("the launch for board 462 searched " + JSON.stringify(backFolder) + " rather than "
      + DOCS_ETIUDA + ", so nothing below would measure the sample");
  }
  const again = await s.p.evaluate(SEEN);
  await s.stop();
  check(!fs.existsSync(sampleFile) && listing(DOCS_ETIUDA).length === 0
        && again.offer === false && again.catalogThere === false
        && !s.said.some(l => /the sample catalog was put in/.test(l))
        && deskKeys()[SAMPLE_KEY] === "1",
    "4f the reinstalled app, on an empty " + DOCS_ETIUDA + " it can write to, does NOT put the"
    + " sample there a second time: " + listing(DOCS_ETIUDA).length + " entries in the folder,"
    + " offer " + again.offer + ", E_CATALOG " + again.catalogThere + ", and the shell never said"
    + " it wrote one. The marker it went by is the one the uninstall did not take: " + SAMPLE_KEY
    + " = " + JSON.stringify(deskKeys()[SAMPLE_KEY] || null));
  const cleared = unpin(keys4);
  delete cleared[SAMPLE_KEY];
  writeDesk(cleared);
  s = await launch(PROG2, { ETIUDA_TEST_DOCUMENTS: LABDOCS });
  const twin = await s.p.evaluate(SEEN);
  const twinWrote = fs.existsSync(sampleFile) ? fs.readFileSync(sampleFile) : Buffer.alloc(0);
  await s.stop();
  check(twinWrote.length > 0 && twinWrote.equals(sampleInAsar) && twin.offer === true
        && deskKeys()[SAMPLE_KEY] === "1",
    "4g and the twin that gives 4f its teeth: the same install, the same empty folder, the same"
    + " launch with " + SAMPLE_KEY + " deleted from the desk and nothing else touched, and the"
    + " sample appears again - " + twinWrote.length + " bytes, equal to the asar's "
    + (twinWrote.length > 0 && twinWrote.equals(sampleInAsar)) + ", offered " + twin.offer
    + ", and the desk marked " + JSON.stringify(deskKeys()[SAMPLE_KEY] || null) + " once more");
  fs.rmSync(sampleFile, { force: true });

  /* ---- 5: the control ------------------------------------------------------------------------ */

  phase("[5/6] the control: the same app, the desk wiped");
  for (const n of listing(USERDATA).filter(MINE)) fs.rmSync(path.join(USERDATA, n), { force: true });
  check(listing(USERDATA).filter(MINE).length === 0,
    "5a the desk and its backups are deleted and nothing of the app's own is left in the profile: "
    + JSON.stringify(listing(USERDATA).filter(MINE)));
  /* The wipe takes the pin with it, and an unpinned launch here would read Documents\Etiuda and
     find this desk's live catalog, which is the one way this control could pass for the wrong
     reason: cards on screen that came from somebody's own folder. Written back AFTER 5a, so 5a
     still measures the wipe, and the launch below starts from a desk holding the pin and nothing
     else. 5b's subject is what the app does with no catalog and no keys, and one key naming an
     empty folder is the absence of both. */
  E.pinCatalogFolder(USERDATA, LABCAT);
  s = await launch(PROG2);
  const bare = await s.p.evaluate(SEEN);
  check(bare.booted && bare.cards === 0 && !bare.catalogThere && bare.glassOff === false
        && Object.keys(deskKeys()).indexOf("eCatalog") < 0,
    "5b the same installed app, with the desk gone but for the pin, shows " + bare.cards
    + " cards and body.glass-off " + bare.glassOff + " (it did boot: " + bare.booted
    + "), and no stored catalog came back into the desk (" + Object.keys(deskKeys()).join(", ")
    + "). So 4c and 4d were reading the desk and not an app that looks like that whatever it is"
    + " given, and not a catalog found in some folder of this machine's own");
  await s.stop();

  /* ---- 6: what the run leaves behind ---------------------------------------------------------- */

  phase("[6/6] the second uninstall, and what is left");
  const gone2 = await uninstallFrom(PROG2);
  check(gone2 > 0 && !fs.existsSync(PROG2),
    "6a the second install folder is gone " + gone2 + "s after its uninstall: " + PROG2);
  const regEnd = added(regBefore, uninstallKeys());
  const smEnd = added(smBefore, listing(START_MENU));
  const dtEnd = added(dtBefore, listing(DESKTOP));
  check(regEnd.length === 0 && smEnd.length === 0 && dtEnd.length === 0,
    "6b the registry, the Start Menu and the Desktop hold exactly what they held before the run: "
    + regEnd.length + " key(s), " + smEnd.length + " Start Menu entry(ies), " + dtEnd.length
    + " Desktop entry(ies) added" + (regEnd.length + smEnd.length + dtEnd.length
      ? ": " + regEnd.concat(smEnd, dtEnd).join(", ") : ""));
  /* THE ASSOCIATION IS PART OF WHAT THIS RUN CHANGES ON A REAL MACHINE, and 6b never looked at
     it: two installs rewrote HKCU\Software\Classes\.ec and a desk that carried an association of
     its own before the run would have had it replaced and nothing would have said so. Compared
     against what check 0 read rather than against nothing. */
  const assocEnd = assoc(".ec");
  check(String(assocEnd.prog || "") === String(assocBefore.prog || "")
        && String(assocEnd.cmd || "") === String(assocBefore.cmd || ""),
    "6b2 and the .ec association is what the run found: ProgId "
    + JSON.stringify(assocEnd.prog || null) + " and open command "
    + JSON.stringify(assocEnd.cmd || null) + ", against " + JSON.stringify(assocBefore.prog || null)
    + " and " + JSON.stringify(assocBefore.cmd || null) + " before the first install");

  reachedEnd = true;
})().catch(async e => {
  console.error("  FAIL " + String(e && e.stack || e));
  fails++;
  /* AN ABORTED RUN USED TO LEAVE AN INSTALL REGISTERED ON THE DESK WITH NO WAY TO REMOVE IT.
     Measured on 2026-09-15: a run that threw at 2a left its HKCU uninstall key, its Start Menu
     entry, its Desktop shortcut and the .ec association standing, and the finally below then
     deleted the lab, taking `Uninstall Etiuda.exe` with it. The next run of this file read those
     as entries that were already there and check 1b went red for a reason nobody could see.
     So: uninstall whatever is still installed, and do it HERE, in the catch, because .finally()
     ignores what its callback returns and an uninstall is four seconds of waiting. */
  for (const dir of [PROG1, PROG2]) {
    if (!fs.existsSync(dir)) continue;
    const gone = await uninstallFrom(dir);
    console.log("       the run left an install standing at " + dir + " and uninstalled it: "
      + (gone > 0 ? "gone in " + gone + "s" : "STILL THERE, and its uninstaller goes with the lab"));
  }
}).finally(() => {
  for (const pid of Array.from(live)) killPid(pid);
  const leftProcs = labProcesses();
  check(leftProcs === 0, "6c no process of the lab is left running: " + leftProcs);
  if (parkedOk) {
    unpark();
    const end = listing(USERDATA).filter(MINE);
    check(end.join(",") === foundBefore.join(",") && !fs.existsSync(PARKED)
          && !!lockReleased && lockReleased.released === true && !fs.existsSync(E.DESK_LOCK),
      "6d the profile is as the run found it: " + JSON.stringify(end) + " against the "
      + JSON.stringify(foundBefore) + " parked at the start, the parking folder gone, and the desk"
      + " lock released (" + JSON.stringify(lockReleased) + ") so the other labs may launch again");
  }
  if (KEEP) {
    note("--keep: the lab stands at " + LAB);
  } else {
    check(E.removeLab(LAB), "6e the lab is gone: " + LAB);
  }
  console.log("\n" + (reachedEnd ? "" : "  INCOMPLETE - ") + checks + " check(s), " + fails
    + " failed, " + Math.round((Date.now() - t0) / 1000) + "s");
  if (!reachedEnd) console.log("  SUITE DID NOT COMPLETE");
  process.exit(reachedEnd ? fails : (fails || E.NO_VERDICT));
});
