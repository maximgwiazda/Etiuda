/* THE TWO INSTALL PATHS NO GATE HAD DRIVEN: a newer setup run over an installed copy, and the
 * all-users install with its uninstall (code-pass survey of 2026-09-27, finding 31).
 *
 *   ETIUDA_OLD_SETUP_EXE=<older setup.exe> node tests/update-install.js --update
 *   node tests/update-install.js --all-users                 from an ELEVATED shell
 *   ETIUDA_SETUP_EXE=<newer setup.exe> ...                   drive a newer installer built elsewhere;
 *                                                            unset, this tree is built into the lab
 *   node tests/update-install.js --dry-run --update|--all-users   the plan and the refusals it
 *                                                            would make now; installs nothing, launches
 *                                                            nothing, and needs no installer
 *   --keep                                                   leave the lab standing
 *
 * WHY THESE TWO. tests/reinstall.js installs with /currentuser into an empty profile and always
 * uninstalls before it installs again, so nothing is ever installed over a live copy. But this
 * product has no auto-update: a customer updates by running the newer setup.exe over the copy
 * they have, which is exactly the path never driven. And the assisted installer offers all users,
 * whose branches in shell/installer.nsh (the context switch around the cache) and whose HKLM keys
 * no gate reached; the one all-users install ever seen here was an accident, on 2026-09-17, and
 * its residue made every later silent install exit 199.
 *
 * WHERE IT RUNS. In a scratch home of its own, made in the lab: the installer, the uninstaller and
 * the app are CHILDREN given USERPROFILE, APPDATA and LOCALAPPDATA inside it, and Windows is asked
 * (E.placesMismatch) whether it agrees before anything runs, because NSIS and Electron follow
 * USERPROFILE and ignore the other two (measured 2026-09-24). This process keeps its own
 * environment, so the engine's launch door still measures against the real profile and a launch
 * into the scratch home is not mistaken for it. WHAT STAYS REAL is the registry, HKCU for both
 * legs and HKLM with the machine-wide Desktop and Start Menu for the all-users leg; so the run
 * refuses, before anything is installed, wherever this product is already registered or a
 * shortcut of its name already stands in a machine-wide place, and it takes the desk lock
 * (E.takeDeskLock) because the reinstall loop writes the same HKCU keys.
 *
 * WHAT IS JUDGED, AND WHERE. This file collects facts; tests/install-plan.js judges them, and
 * tests/install-plan-selftest.js holds every clause of every verdict against a planted flaw in
 * each `npm test`. What only this file can prove is that the facts it collects are the true ones.
 *
 * ONE LIMIT, NAMED. Every launch is TOLD its user-data folder (--user-data-dir), because the
 * engine's door refuses a launch without one. The folder given is the one Electron would pick by
 * its own rule, APPDATA of the scratch home plus the app's name, and U0d holds both builds to that
 * rule (the name in each asar's package.json, and no main.js that renames the app or moves the
 * folder). So the leg proves the updated app is given the folder the older one wrote; it does not
 * prove the app chose it unaided.
 *
 * Nothing is decided from a screenshot. Exit code is the number of failed checks, capped at 63;
 * 78 (E.NO_VERDICT) where the run refused or reached no verdict.
 */
"use strict";
const { execFileSync, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const E = require("./engine.js");
const P = require("./install-plan.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ARGV = process.argv.slice(2);
const DRY = ARGV.includes("--dry-run");
const KEEP = ARGV.includes("--keep");
const LEG = ARGV.includes("--all-users") ? "all-users" : ARGV.includes("--update") ? "update" : "";
if (!LEG) {
  console.log("usage: node tests/update-install.js --update|--all-users [--dry-run] [--keep]");
  process.exit(E.NO_VERDICT);
}
const WHO = "tests/update-install.js";
const t0 = Date.now();
let checks = 0, fails = 0, reachedEnd = false;
const notRun = [];
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const rows = list => { for (const r of list) check(r.ok, r.id + " " + r.what); return list.every(r => r.ok); };
const note = what => console.log("       " + what);
const phase = what => console.log("\n" + what);

/* ---- what the build config and the tree say ------------------------------------------------- */

const BUILDER = fs.readFileSync(path.join(E.ROOT, "electron-builder.js"), "utf8");
const pick = (re, what) => {
  const m = re.exec(BUILDER);
  if (!m) E.refuse("electron-builder.js names no " + what, "this run reads it rather than typing it here.");
  return m[1];
};
const APP_ID = pick(/appId:\s*"([^"]+)"/, "appId");
const PRODUCT = pick(/productName:\s*"([^"]+)"/, "productName");
const SHORTCUT = pick(/shortcutName:\s*"([^"]+)"/, "nsis.shortcutName") + ".lnk";
const GUID = P.appGuid(APP_ID);
const KU = P.registryKeys("user", GUID), KM = P.registryKeys("machine", GUID);
const WANT_VERSION = (/E_VERSION\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(E.ROOT, "src", "modules", "env.js"), "utf8")) || [])[1] || "";
const TREE_PKG = JSON.parse(fs.readFileSync(path.join(E.ROOT, "package.json"), "utf8"));
const sha = buf => crypto.createHash("sha256").update(buf).digest("hex");
const shaFile = f => { try { return sha(fs.readFileSync(f)); } catch (e) { return null; } };
const listing = d => { try { return fs.readdirSync(d).sort(); } catch (e) { return []; } };

/* ---- the lab and the scratch home ----------------------------------------------------------- */

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-update-"));
const H = P.scratchHome(LAB);
const CHILD_ENV = Object.assign({}, process.env, H.env);
const UD = path.join(H.places.ApplicationData, P.userDataName(TREE_PKG));
const DOCS_ETIUDA = path.join(H.documents, "Etiuda");
const PROG = path.join(LAB, "prog");           /* the update leg's install folder */
const PM = path.join(LAB, "pm");               /* the all-users install folder */
const PU = path.join(LAB, "pu");               /* A10's plain per-user install */
const COMMON = {};                              /* the machine-wide places, asked of Windows */

/* ---- PowerShell, one script file per question, written into the lab ------------------------ */

const PS = {
  value: ["param([string]$Key, [string]$Name)",
          "$p = Get-ItemProperty -Path $Key -ErrorAction SilentlyContinue",
          "if ($null -eq $p) { '' } else { [string]$p.$Name }"],
  exists: ["param([string]$Key)", "if (Test-Path $Key) { 'yes' } else { 'no' }"],
  named: ["param([string]$Parent, [string]$Display)",
          "$n = 0; if (Test-Path $Parent) { Get-ChildItem $Parent | ForEach-Object {",
          "  if ((Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue).DisplayName -eq $Display) { $n++ } } }",
          "$n"],
  assoc: ["param([string]$Classes, [string]$Ext)",
          "$prog = ''; $cmd = ''",
          "$k = Get-Item ($Classes + '\\' + $Ext) -ErrorAction SilentlyContinue",
          "if ($k) { $prog = [string]$k.GetValue('') }",
          "if ($prog) { $c = Get-Item ($Classes + '\\' + $prog + '\\shell\\open\\command') -ErrorAction SilentlyContinue",
          "  if ($c) { $cmd = [string]$c.GetValue('') } }",
          "$cmd"],
  lnk: ["param([string]$File)",
        "if (-not (Test-Path $File)) { '{}' } else { $s = (New-Object -ComObject WScript.Shell).CreateShortcut($File)",
        "  [pscustomobject]@{ target = [string]$s.TargetPath; hotkey = [string]$s.Hotkey } | ConvertTo-Json -Compress }"],
  hotkey: ["param([string]$File, [string]$Keys)",
           "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($File); $s.Hotkey = $Keys; $s.Save()",
           "(New-Object -ComObject WScript.Shell).CreateShortcut($File).Hotkey"],
  elevated: ["$p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())",
             "if ($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 'yes' } else { 'no' }"],
  common: ["foreach ($n in 'CommonDesktopDirectory','CommonPrograms','CommonApplicationData') { $n + [char]9 + [Environment]::GetFolderPath($n) }"],
};
for (const k of Object.keys(PS)) fs.writeFileSync(path.join(LAB, "q-" + k + ".ps1"), PS[k].join("\n"), "utf8");
function ask(k, args) {
  return String(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", path.join(LAB, "q-" + k + ".ps1")].concat(args || []), { encoding: "utf8", windowsHide: true, timeout: 60000 })).trim();
}
const regValue = (key, name) => ask("value", ["-Key", key, "-Name", name]);
const regExists = key => ask("exists", ["-Key", key]) === "yes";
const namedKeys = parent => Number(ask("named", ["-Parent", parent, "-Display", PRODUCT])) || 0;
const assocCmd = root => ask("assoc", ["-Classes", root, "-Ext", ".ec"]);
const lnkOf = file => { try { return JSON.parse(ask("lnk", ["-File", file]) || "{}"); } catch (e) { return {}; } };
const shortcutAt = (dir) => { const f = path.join(dir, SHORTCUT); const l = lnkOf(f);
  return { count: fs.existsSync(f) ? 1 : 0, target: l.target || "", hotkey: l.hotkey || "" }; };

/* ---- the installer ---------------------------------------------------------------------------- */

function newSetup() {
  const given = process.env.ETIUDA_SETUP_EXE;
  if (given) return given;
  if (DRY) return "(built from this tree into " + path.join(LAB, "dist") + ")";
  const out = path.join(LAB, "dist");
  const cli = path.join(E.ROOT, "node_modules", "electron-builder", "out", "cli", "cli.js");
  if (!fs.existsSync(cli)) E.refuse("electron-builder is not installed; npm install first");
  execFileSync(process.execPath, [cli, "--win"], { cwd: E.ROOT, stdio: "ignore",
    env: Object.assign({}, process.env, { ETIUDA_DIST: out }) });
  const found = listing(out).filter(n => /-setup\.exe$/i.test(n));
  if (found.length !== 1) E.refuse(out + " holds " + found.length + " installers; expected 1");
  return path.join(out, found[0]);
}
/* EVERY VECTOR IS ASKED OF P.argsFault BEFORE IT RUNS, and a fault is a refusal: a vector NSIS
   would misread installs somewhere nobody is looking. A10's plain vector is the one exception,
   and it is built by P.plainArgs, whose whole subject is having no context flag. */
function runSetup(exe, args, mode) {
  const bad = mode ? P.argsFault(args, mode) : "";
  if (bad) throw new Error("refusing to run " + path.basename(exe) + " " + args.join(" ") + ": " + bad);
  note("run: " + exe + " " + args.join(" "));
  const r = spawnSync(exe, args, { env: CHILD_ENV, windowsHide: true, timeout: 300000 });
  return r.status;
}
/* The uninstaller returns before it finishes: the verdict is the folder going, polled. */
async function uninstall(dir, mode) {
  const un = path.join(dir, "Uninstall " + PRODUCT + ".exe");
  if (!fs.existsSync(un)) return -1;
  runSetup(un, P.uninstallArgs(mode), mode);
  for (let i = 1; i <= 60; i++) { await sleep(1000); if (!fs.existsSync(dir)) return i; }
  return -1;
}
const engineIn = dir => { try { return sha(require("@electron/asar").extractFile(path.join(dir, "resources", "app.asar"), "engine/etiuda.html")); } catch (e) { return null; } };
const asarText = (dir, file) => { try { return require("@electron/asar").extractFile(path.join(dir, "resources", "app.asar"), file).toString("utf8"); } catch (e) { return null; } };

/* ---- launching the installed app into the scratch home ---------------------------------------- */

const PORT_BASE = DRY ? 0 : E.portBlock("update-install");
let port = PORT_BASE;
const live = new Set();
let offscreenAsked = false;
async function launch(exeDir) {
  const puppeteer = require("puppeteer-core");
  port++;
  const child = E.shellLaunch(WHO, path.join(exeDir, PRODUCT + ".exe"),
    ["--remote-debugging-port=" + port, "--user-data-dir=" + UD],
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv(Object.assign({}, H.env, { ETIUDA_TEST_DOCUMENTS: H.documents })) });
  live.add(child.pid);
  const said = [];
  child.stdout.on("data", d => said.push(String(d).trim()));
  child.stderr.on("data", d => said.push(String(d).trim()));
  let b = null;
  for (let i = 0; i < 40 && !b; i++) {
    await sleep(500);
    try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + port, defaultViewport: null }); } catch (x) { /* not up yet */ }
  }
  if (!b) { E.killTree(child.pid); live.delete(child.pid); throw new Error("the installed app did not answer on port " + port + ": " + said.join(" | ")); }
  const p = (await b.pages())[0];
  await sleep(3500);
  if (!offscreenAsked) { offscreenAsked = true; E.offscreenCheck(child.pid, WHO, check, notRun); }
  return { b, p, said, page: async () => (await b.pages())[0],
           stop: async () => { try { b.disconnect(); } catch (x) {} E.killTree(child.pid); live.delete(child.pid); await sleep(1200); } };
}

/* THE THREE PAGE READINGS ARE tests/reinstall.js's OWN, copied text for text, and
   tests/install-plan-selftest.js holds each copy to its source so that the two cannot drift. */
const SEEN = () => ({
  booted: typeof window.E_VERSION === "string",
  eHost: document.body.classList.contains("e-host"),
  glassOff: document.body.classList.contains("glass-off"),
  cards: document.querySelectorAll("#list .card").length,
  catalogThere: typeof window.E_CATALOG !== "undefined",
  offer: !!document.querySelector("#ecYes"),
  tour: !!document.querySelector("#tourRoot:not([hidden]) #tourCard"),
});
const SKIP_TOUR = async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(2200);
  const k = document.getElementById("tourSkip");
  if (k && k.offsetWidth) k.click();
  await wait(800);
  return !!k;
};
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

const deskFile = () => path.join(UD, "desk.json");
const deskKeys = () => { try { return JSON.parse(fs.readFileSync(deskFile(), "utf8")).keys || {}; } catch (e) { return {}; } };
const cardsInDesk = () => { try { return JSON.parse(deskKeys().eCatalog).cards.length; } catch (e) { return -1; } };
const catalogs = () => { const o = {}; for (const n of listing(DOCS_ETIUDA)) o[n] = shaFile(path.join(DOCS_ETIUDA, n)); return o; };

/* ---- the preflight: every refusal before anything is installed -------------------------------- */

let lockHeld = false;
function preflight() {
  const said = [];
  if (process.platform !== "win32") said.push("this drives a Windows installer and this is " + process.platform);
  if (/\s/.test(LAB)) said.push("the lab " + LAB + " holds a space, which /D cannot carry");
  for (const d of H.make) fs.mkdirSync(d, { recursive: true });
  const places = E.placesMismatch(H.places, CHILD_ENV);
  if (places.said.length) said.push("Windows does not put the scratch home where this run would: " + places.said.join("; "));
  for (const [k, what] of [[KU.uninstall, "a per-user uninstall key"], [KU.install, "a per-user install key"],
                           [KM.uninstall, "an all-users uninstall key"], [KM.install, "an all-users install key"]])
    if (regExists(k)) said.push(PRODUCT + " is already registered on this machine (" + what + " " + k + "):"
      + " a setup run now would update THAT copy, which may be somebody's own");
  for (const line of ask("common").split(/\r?\n/)) { const at = line.indexOf("\t"); if (at > 0) COMMON[line.slice(0, at)] = line.slice(at + 1).trim(); }
  if (LEG === "all-users") {
    if (ask("elevated") !== "yes") said.push("the all-users leg needs an elevated shell and this one is not;"
      + " a silent /allusers would otherwise raise a UAC prompt nobody answers");
    for (const k of ["CommonDesktopDirectory", "CommonPrograms"])
      if (fs.existsSync(path.join(COMMON[k] || "", SHORTCUT)))
        said.push("a shortcut named " + SHORTCUT + " already stands in " + COMMON[k] + "; the install would write over it and the uninstall delete it");
  }
  if (LEG === "update") {
    const old = process.env.ETIUDA_OLD_SETUP_EXE || "";
    if (!old || !fs.existsSync(old)) said.push("ETIUDA_OLD_SETUP_EXE names no file (" + JSON.stringify(old) + "): the update leg needs the older installer");
    const given = process.env.ETIUDA_SETUP_EXE;
    if (old && given && fs.existsSync(old) && fs.existsSync(given) && shaFile(old) === shaFile(given))
      said.push("the older and the newer installer are the same file, sha256 " + shaFile(old).slice(0, 12) + ": an update between them proves nothing");
  }
  const held = E.deskLockHolder();
  if (held && held.alive && !held.mine) said.push("the desk lock is held by pid " + held.pid + " (" + held.who + "), which writes the same HKCU keys");
  return said;
}

function printPlan() {
  const newer = newSetup();
  const lines = [
    "appId " + APP_ID + " -> GUID " + GUID + " (UUID v5 in electron-builder's namespace)",
    "keys it reads: " + [KU.uninstall, KU.install, KU.classes + "\\.ec", KM.uninstall, KM.install, KM.classes + "\\.ec"].join(", "),
    "scratch home " + H.HOME + ": " + Object.keys(H.places).map(k => k + " " + H.places[k]).join(", "),
    "user-data folder given to every launch " + UD + " (Electron's rule: APPDATA + " + JSON.stringify(P.userDataName(TREE_PKG)) + ")",
    "machine-wide places: " + Object.keys(COMMON).map(k => k + " " + COMMON[k]).join(", "),
    "newer setup: " + newer,
  ];
  if (LEG === "update") lines.push(
    "older setup: " + (process.env.ETIUDA_OLD_SETUP_EXE || "(ETIUDA_OLD_SETUP_EXE unset)"),
    "1 older:    <older> " + P.installArgs({ mode: "user", dir: PROG }).join(" ") + "   argsFault " + JSON.stringify(P.argsFault(P.installArgs({ mode: "user", dir: PROG }), "user")),
    "2 update:   <newer> " + P.installArgs({ mode: "user" }).join(" ") + "   (no /D: the setup finds " + PROG + " through " + KU.install + " InstallLocation)",
    "3 default folder that must stay empty: " + P.defaultUserInstallDir(H.places.LocalApplicationData, PRODUCT),
    "4 uninstall: " + path.join(PROG, "Uninstall " + PRODUCT + ".exe") + " " + P.uninstallArgs("user").join(" "));
  else lines.push(
    "1 all users: <newer> " + P.installArgs({ mode: "machine", dir: PM }).join(" ") + "   argsFault " + JSON.stringify(P.argsFault(P.installArgs({ mode: "machine", dir: PM }), "machine")),
    "2 uninstall: " + path.join(PM, "Uninstall " + PRODUCT + ".exe") + " " + P.uninstallArgs("machine").join(" "),
    "3 A10 plain: <newer> " + P.plainArgs(PU).join(" ") + ", then " + P.uninstallArgs("user").join(" "),
    "caches that must not be left: " + path.join(H.places.LocalApplicationData, "etiuda-updater") + " and "
      + path.join(COMMON.CommonApplicationData || "C:\\ProgramData", "etiuda-updater"));
  for (const l of lines) note(l);
}

/* ---- the update leg ---------------------------------------------------------------------------- */

async function updateLeg(newer) {
  const older = process.env.ETIUDA_OLD_SETUP_EXE;
  const treeEngine = shaFile(E.ENGINE_PATH);
  phase("[1/5] the older copy, installed per user as a customer has it");
  const code1 = runSetup(older, P.installArgs({ mode: "user", dir: PROG }), "user");
  check(code1 === 0 && fs.existsSync(path.join(PROG, PRODUCT + ".exe")) && regExists(KU.uninstall),
    "U0a the older setup installed into " + PROG + " (exit " + code1 + ") and registered " + KU.uninstall);
  /* THE REFUSAL IS LIVE, for free: with the older copy registered, the preflight that let this run
     start must now name it. A preflight that could not see a registered copy would let a run
     update somebody's own. */
  const named = preflight().filter(r => /already registered/.test(r));
  check(named.length >= 2, "U0c control: with the older copy registered, the preflight now refuses "
    + named.length + " time(s), naming its keys, so its silence at [0] meant nothing was there");
  const oldEngine = engineIn(PROG);
  check(!!oldEngine && oldEngine !== treeEngine,
    "U0b the older copy is a different program from this tree's: its engine sha256 " + String(oldEngine).slice(0, 12)
    + " against the tree's " + String(treeEngine).slice(0, 12) + " (equal would make U3 unable to fail)");
  if (!oldEngine || oldEngine === treeEngine) throw new Error("no verdict: the older copy is not an older program");
  const oldPkg = JSON.parse(asarText(PROG, "package.json") || "{}");
  const rename = src => /\bapp\.(setName|setPath\(\s*["']userData)/.test(String(src || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, ""));
  const oldMainRenames = rename(asarText(PROG, "shell/main.js"));
  const treeMainRenames = rename(fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8"));
  check(P.userDataName(oldPkg) === P.userDataName(TREE_PKG) && !!P.userDataName(oldPkg) && !oldMainRenames && !treeMainRenames,
    "U0d both builds keep the desk in the same folder by Electron's rule: " + JSON.stringify(P.userDataName(oldPkg))
    + " and " + JSON.stringify(P.userDataName(TREE_PKG)) + ", and neither main.js renames the app or moves userData ("
    + oldMainRenames + ", " + treeMainRenames + ")");

  phase("[2/5] the person's catalog and setting, made through the older copy");
  const doc = JSON.parse(fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8"));
  doc.id = "desk-notes"; doc.name = "Desk notes"; delete doc.sample; doc.cards = doc.cards.slice(0, 12);
  fs.mkdirSync(DOCS_ETIUDA, { recursive: true });
  fs.writeFileSync(path.join(DOCS_ETIUDA, "desk-notes.ec"), JSON.stringify(doc), "utf8");
  let s = await launch(PROG);
  await s.p.evaluate(SKIP_TOUR);
  const accepted = await s.p.evaluate(() => { const y = document.querySelector("#ecYes"); if (!y) return false; y.click(); return true; });
  await sleep(6000);
  const land = await (await s.page()).evaluate(SEEN);
  const drove = await (await s.page()).evaluate(DRIVE_BLUR_OFF);
  await sleep(900);
  await s.stop();
  const keysBefore = deskKeys();
  check(accepted && land.cards === 12 && drove.glass === true && cardsInDesk() === 12 && keysBefore.eGlassOff === "1",
    "U0e the older copy took the catalog from Documents\\Etiuda and a setting through its menu: " + land.cards
    + " cards on screen, " + cardsInDesk() + " in the desk, eGlassOff " + JSON.stringify(keysBefore.eGlassOff) + " (" + JSON.stringify(drove) + ")");
  const deskBefore = shaFile(deskFile());
  const catalogsBefore = catalogs();

  phase("[3/5] two plants: a file only the older copy has, and the person's own shortcut hotkey");
  fs.writeFileSync(path.join(PROG, "left-by-the-older-copy.txt"), "planted by " + WHO + "\n", "utf8");
  const hotkeyWant = ask("hotkey", ["-File", path.join(H.places.Desktop, SHORTCUT), "-Keys", "CTRL+ALT+E"]);
  check(!!hotkeyWant, "U0f the Desktop shortcut takes a hotkey, read back as " + JSON.stringify(hotkeyWant));

  phase("[4/5] the newer setup over it, as a customer runs it");
  const code = runSetup(newer, P.installArgs({ mode: "user" }), "user");
  const exe = path.join(PROG, PRODUCT + ".exe");
  const uf = {
    setupExit: code, dir: PROG, exe, exeThere: fs.existsSync(exe),
    installLocation: regValue(KU.install, "InstallLocation"),
    defaultDir: P.defaultUserInstallDir(H.places.LocalApplicationData, PRODUCT),
    defaultDirExists: fs.existsSync(P.defaultUserInstallDir(H.places.LocalApplicationData, PRODUCT)),
    programOld: oldEngine, programNew: engineIn(PROG), programTree: treeEngine,
    oldOnlyGone: !fs.existsSync(path.join(PROG, "left-by-the-older-copy.txt")),
    appKeys: namedKeys(KU.uninstallParent), keyName: regExists(KU.uninstall) ? GUID : "", keyBefore: GUID,
    version: regValue(KU.uninstall, "DisplayVersion"), wantVersion: WANT_VERSION,
    uninstallString: regValue(KU.uninstall, "UninstallString"),
    shortcuts: { desktop: shortcutAt(H.places.Desktop), startMenu: shortcutAt(H.places.Programs) },
    hotkeyWant, assocCmd: assocCmd(KU.classes),
    deskBefore, deskAfter: shaFile(deskFile()), catalogsBefore, catalogsAfter: catalogs(),
    cacheExists: fs.existsSync(path.join(H.places.LocalApplicationData, "etiuda-updater")),
  };
  rows(P.judgeUpdate(uf));

  phase("[5/5] the updated copy, launched; then the control; then the uninstall");
  s = await launch(PROG);
  const back = await s.p.evaluate(SEEN);
  await s.stop();
  const keysAfter = deskKeys();
  const aside = path.join(LAB, "left-by-this-run");
  E.keepAside(listing(UD).filter(n => /^desk(\.bak[0-9]+)?\.json$/.test(n)).map(n => path.join(UD, n)), aside);
  s = await launch(PROG);
  const bare = await s.p.evaluate(SEEN);
  await s.stop();
  rows(P.judgeUpdatedRun({ booted: back.booted, cards: back.cards, wantCards: 12, glassOff: back.glassOff,
    keyGlass: keysAfter.eGlassOff, keysBefore, keysAfter,
    controlBooted: bare.booted, controlCards: bare.cards, controlGlassOff: bare.glassOff }));
  const gone = await uninstall(PROG, "user");
  check(gone > 0 && !regExists(KU.uninstall) && !regExists(KU.install) && assocCmd(KU.classes).toLowerCase().indexOf(PROG.toLowerCase()) < 0,
    "U12 the uninstall takes the updated copy whole: folder gone in " + gone + " s, both HKCU keys gone, no .ec association to it");
}

/* ---- the all-users leg ------------------------------------------------------------------------- */

async function allUsersLeg(newer) {
  const userAssocBefore = assocCmd(KU.classes);
  const machineCache = path.join(COMMON.CommonApplicationData || "C:\\ProgramData", "etiuda-updater");
  const machineCacheBefore = fs.existsSync(machineCache);
  phase("[1/3] the all-users install, elevated and silent");
  const code = runSetup(newer, P.installArgs({ mode: "machine", dir: PM }), "machine");
  const exe = path.join(PM, PRODUCT + ".exe");
  const af = {
    setupExit: code, exeThere: fs.existsSync(exe), dir: PM,
    machineKeys: namedKeys(KM.uninstallParent), machineLocation: regValue(KM.uninstall, "InstallLocation"),
    uninstallString: regValue(KM.uninstall, "UninstallString"), userKeysAdded: regExists(KU.uninstall) ? 1 : 0,
    machineInstallKey: regValue(KM.install, "InstallLocation"),
    commonDesktop: shortcutAt(COMMON.CommonDesktopDirectory).count, commonPrograms: shortcutAt(COMMON.CommonPrograms).count,
    userDesktop: shortcutAt(H.places.Desktop).count, userPrograms: shortcutAt(H.places.Programs).count,
    machineAssocCmd: assocCmd(KM.classes), userAssocChanged: assocCmd(KU.classes) !== userAssocBefore,
    userCacheExists: fs.existsSync(path.join(H.places.LocalApplicationData, "etiuda-updater")),
    machineCacheExists: !machineCacheBefore && fs.existsSync(machineCache),
  };

  const namedM = preflight().filter(r => /all-users (uninstall|install) key|already stands/.test(r));
  check(namedM.length >= 3, "A0c control: with the all-users copy installed, the preflight now refuses "
    + namedM.length + " time(s), naming the HKLM keys and the public shortcut, so its silence at [0] meant nothing was there");
  phase("[2/3] the all-users copy, run by this user");
  const s = await launch(PM);
  await s.p.evaluate(SKIP_TOUR);
  const seen = await s.p.evaluate(SEEN);
  const drove = await (await s.page()).evaluate(DRIVE_BLUR_OFF);
  await sleep(900);
  await s.stop();
  af.booted = seen.booted && drove.glass === true;
  af.userDataInHome = fs.existsSync(deskFile()) && !fs.existsSync(path.join(PM, "desk.json"))
    && !fs.existsSync(path.join(COMMON.CommonApplicationData || "C:\\ProgramData", P.userDataName(TREE_PKG)));
  const deskSha = shaFile(deskFile());

  phase("[3/3] the all-users uninstall, and a plain install after it");
  af.goneSeconds = await uninstall(PM, "machine");
  af.exeAfter = fs.existsSync(exe);
  af.machineKeysAfter = namedKeys(KM.uninstallParent);
  af.machineInstallKeyAfter = regValue(KM.install, "InstallLocation");
  af.commonDesktopAfter = shortcutAt(COMMON.CommonDesktopDirectory).count;
  af.commonProgramsAfter = shortcutAt(COMMON.CommonPrograms).count;
  af.machineAssocCmdAfter = assocCmd(KM.classes);
  af.deskKept = !!deskSha && shaFile(deskFile()) === deskSha;
  af.perUserExit = runSetup(newer, P.plainArgs(PU), "");
  af.perUserKeys = regExists(KU.uninstall) ? 1 : 0;
  af.perUserMachineKeys = regExists(KM.uninstall) ? 1 : 0;
  rows(P.judgeAllUsers(af));
  const puGone = fs.existsSync(PU) ? await uninstall(PU, "user") : 0;
  check(!regExists(KU.uninstall) && !regExists(KM.uninstall) && assocCmd(KU.classes) === userAssocBefore
        && !fs.existsSync(path.join(COMMON.CommonDesktopDirectory, SHORTCUT)),
    "Z1 the machine is as the run found it: A10's copy uninstalled (" + puGone + " s), no key under HKCU or HKLM,"
    + " the user's .ec association " + JSON.stringify(assocCmd(KU.classes) || null) + " as before, no public shortcut");
}

/* ---- the run ------------------------------------------------------------------------------------ */

async function leftovers() {
  for (const [dir, mode] of [[PROG, "user"], [PM, "machine"], [PU, "user"]]) {
    if (!fs.existsSync(path.join(dir, "Uninstall " + PRODUCT + ".exe"))) continue;
    const g = await uninstall(dir, mode);
    console.log("       the run left an install at " + dir + " and uninstalled it: " + (g > 0 ? "gone in " + g + " s" : "STILL THERE"));
  }
}
process.on("exit", () => {
  for (const pid of live) E.killTree(pid);
  if (lockHeld) E.releaseDeskLock();
  if (!KEEP) { try { fs.rmSync(LAB, { recursive: true, force: true }); } catch (x) { /* named by the last line */ } }
});

(async () => {
  phase("[0] " + LEG + (DRY ? ", DRY RUN: the plan and the refusals, nothing installed" : ""));
  const refusals = preflight();
  if (DRY) {
    printPlan();
    for (const r of refusals) note("WOULD REFUSE: " + r);
    note(refusals.length ? refusals.length + " refusal(s) stand now" : "no refusal stands now: the leg would run");
    reachedEnd = true;
    console.log("\n#counts checks=0 failed=0 notRun=0 dryRun=1 refusals=" + refusals.length);
    process.exit(0);
  }
  if (refusals.length) E.refuse(refusals[0], ...refusals.slice(1), "nothing was installed.");
  const lock = E.takeDeskLock(WHO);
  if (!lock.ok) E.refuse("the desk lock could not be taken", "the reinstall loop writes the same HKCU keys.");
  lockHeld = true;
  const newer = newSetup();
  note("newer setup " + newer + ", " + fs.statSync(newer).size + " bytes, sha256 " + String(shaFile(newer)).slice(0, 16));
  if (LEG === "update") await updateLeg(newer); else await allUsersLeg(newer);
  reachedEnd = true;
})().catch(async e => {
  console.error("  FAIL " + String(e && e.stack || e));
  fails++;
  await leftovers();
}).finally(() => {
  console.log("\n#counts checks=" + checks + " failed=" + fails + " notRun=" + notRun.length);
  console.log((reachedEnd ? "" : "  INCOMPLETE - ") + checks + " check(s), " + fails + " failed, "
    + Math.round((Date.now() - t0) / 1000) + "s" + (KEEP ? "; --keep: the lab stands at " + LAB : ""));
  process.exit(reachedEnd ? E.exitOf(fails) : (fails ? E.exitOf(fails) : E.NO_VERDICT));
});
