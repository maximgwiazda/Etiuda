/* THE FOUR INSTALLER LEGS FOR A HOSTED WINDOWS RUNNER, silent switches only, since no page can be clicked there.
 *
 *   node tools/runner/installer-legs.mjs --out <dir> [all-upgrade] [running-1618] [system-bare] [locked-1618]
 *                                           on a hosted Windows runner only (see THE WALL); no leg named runs all four
 *   ETIUDA_OLD_SETUP_EXE=<older setup.exe>  version N for all-upgrade and locked-1618; the workflow builds it from an older
 *                                           commit. Unset, or the same bytes as the newer, those two legs give no verdict.
 *
 * THE CRITERION, each leg's own words of 2026-11-11, implemented as they stand; where the runner cannot do a part, the leg says
 * so in its own no-verdict line rather than passing:
 *   all-upgrade   "an all-users upgrade: version N with /allusers, then N+1 with /S. The uninstall entry, the shortcuts and the
 *                 etiuda: link must be intact afterwards, and a marker file planted in the install folder gone".
 *   running-1618  "1618 at a running copy: the installing account's own copy is asked to close, another session's copy ends
 *                 the run with 1618, and nothing else changes". The other session is a standard account made for the leg,
 *                 its password generated here and never printed, starting the installed copy through a one-shot scheduled
 *                 task; the account and the task are removed at the end.
 *   system-bare   "a bare /S as SYSTEM, driven by schtasks /ru SYSTEM with a one-shot task, which the harness can start
 *                 without a person. It must choose all users".
 *   locked-1618   "1618 at a locked file during extract (a file held open). The leg records what is left": green where the
 *                 exit is 1618 and the installed copy is whole or fully the new version, red where it is a mix.
 *
 * WHAT IT REUSES. The test build and its installer as tools/runner/hkcu-uninstaller-marker.mjs makes them (the test identity
 * of tools/test-identity.cjs, built from tools/electron-builder-test.cjs with E.unsignedEnv, refused unless G.setupRefusal
 * passes it); the argument vectors and keys of tests/install-plan.js; the registry reads and the shipped apps' guard of
 * tests/install-guard.cjs; E.shellLaunch and its refusals for the one launch this account makes. tests/update-install.js runs
 * on require, so its uninstall wait (the folder going, polled, since the uninstaller returns before it finishes) is followed
 * here rather than imported.
 *
 * WHAT EACH LEG PRINTS: "  ok   <leg> ...", "  FAIL <leg> ..." or "  --   <leg> no verdict: ...", then one line
 * "#leg <name> <ok|fail|no-verdict> <facts>", and the same lines go to <dir>/legs.txt. Every leg cleans up in finally:
 * it uninstalls what it installed, deletes the keys, tasks and accounts it made, and stops by pid what it started.
 * Exit: the number of failed legs; 78 where nothing ran or no leg reached a verdict.
 *
 * THE WALL. It refuses (exit 78, nothing written) where the file .etiuda-no-installers stands in the home folder, which a desk
 * that must never run an installer creates once for itself; and unless GITHUB_ACTIONS is "true", RUNNER_ENVIRONMENT is
 * "github-hosted", RUNNER_OS is "Windows" and RUNNER_TEMP is set; and unless tests/install-guard.cjs finds neither shipped app
 * present. Those variables can be set by hand, so they only stop a run by accident; the sentinel is what holds a desk that
 * carries it. A computer with neither the sentinel nor a shipped app, and the variables typed in, would run it.
 * Every leg also refuses before doing anything while the test build is already registered. running-1618 opens the installed app, so it also meets the harness's
 * window wall, and gives no verdict where the wall refuses.
 */
import { spawn, spawnSync, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NO_VERDICT = 78;
const LEG_NAMES = ["all-upgrade", "running-1618", "system-bare", "locked-1618", "all-move"];
let OUT = "";
const say = (l) => { process.stdout.write(l + "\n"); if (OUT) fs.appendFileSync(path.join(OUT, "legs.txt"), l + "\n"); };
const refuse = (why) => { say("#legs refused: " + why); process.exit(NO_VERDICT); };

const DESK_SENTINEL = path.join(os.homedir(), ".etiuda-no-installers");
if (fs.existsSync(DESK_SENTINEL)) refuse("this computer carries " + DESK_SENTINEL + ", a desk where installers never run");
if (process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted" || process.env.RUNNER_OS !== "Windows"
  || !process.env.RUNNER_TEMP)
  refuse("not a hosted Windows runner (GITHUB_ACTIONS, RUNNER_ENVIRONMENT, RUNNER_OS, RUNNER_TEMP); installers never run on a desk");
const argv = process.argv.slice(2);
const outAt = argv.indexOf("--out");
if (outAt < 0 || !argv[outAt + 1]) refuse("--out <dir> is wanted");
const named = argv.filter((a, i) => i !== outAt && i !== outAt + 1);
const unknown = named.filter((n) => LEG_NAMES.indexOf(n) < 0);
if (unknown.length) refuse("no leg named " + unknown.join(", ") + "; the legs are " + LEG_NAMES.join(", "));
const CHOSEN = named.length ? LEG_NAMES.filter((n) => named.indexOf(n) > -1) : LEG_NAMES.slice();

const G = require(path.join(ROOT, "tests", "install-guard.cjs"));
const P = require(path.join(ROOT, "tests", "install-plan.js"));
const E = require(path.join(ROOT, "tests", "engine.js"));
const T = require(path.join(ROOT, "tools", "test-identity.cjs")).TEST.desk;
const SHORTCUT = require(path.join(ROOT, "tools", "electron-builder-test.cjs")).nsis.shortcutName + ".lnk";
const WHO = "tools/runner/installer-legs.mjs";
const PRODUCT = T.productName, UNINSTALLER = "Uninstall " + PRODUCT + ".exe";
const GUID = P.appGuid(T.appId), KU = P.registryKeys("user", GUID), KM = P.registryKeys("machine", GUID);
const regKey = (k) => k.replace(/^HKCU:\\/, "HKCU\\").replace(/^HKLM:\\/, "HKLM\\");
const SYS = { uninstall: "HKU\\S-1-5-18\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + GUID, install: "HKU\\S-1-5-18\\Software\\" + GUID };
/* Every key an install of the test build writes, or its first start writes, in either hive: the cleanup's sweep. */
const KEYS = [KM.uninstall, KM.install, KU.uninstall, KU.install].map(regKey)
  .concat(["HKLM", "HKCU"].flatMap((h) => [T.scheme, "." + T.ext, T.catalogClass].map((n) => h + "\\Software\\Classes\\" + n)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 300);
const fmt = (k, v) => k + "=" + (v === undefined || v === null || v === "" ? "-" : /[\s"=]/.test(String(v)) ? JSON.stringify(String(v)) : String(v));
class NoVerdict extends Error {}

/* ---- the first guard, the account, the lab ---------------------------------------------------------------------- */

let GUARD;
try { GUARD = G.guardStart({ env: process.env }); } catch (e) { refuse("the install guard could not read what the shipped apps own: " + e.message); }
if (GUARD.refusals.length) refuse("the install guard: " + GUARD.refusals.join("; "));
const PLACES = GUARD.places;
OUT = path.resolve(argv[outAt + 1]);
fs.mkdirSync(OUT, { recursive: true });
const LAB = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, "legs-"));
if (P.badInstallDir(LAB)) refuse("the lab cannot be named by /D: " + P.badInstallDir(LAB));

/* PowerShell, one script file per question, written into the lab. None prints a password: the one that needs it reads it
   from the environment of that one child. */
const PS = {
  elevated: ["$p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())",
    "if ($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 'yes' } else { 'no' }"],
  lnk: ["param([string]$File)",
    "if (-not (Test-Path -LiteralPath $File)) { '' } else { (New-Object -ComObject WScript.Shell).CreateShortcut($File).TargetPath }"],
  procs: ["param([string]$Exe)", "$rows = @()",
    "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq $Exe) } | ForEach-Object {",
    "  $o = Invoke-CimMethod -InputObject $_ -MethodName GetOwner",
    "  $rows += [pscustomobject]@{ pid = [int]$_.ProcessId; parent = [int]$_.ParentProcessId; user = [string]$o.User } }",
    "ConvertTo-Json -InputObject @($rows) -Compress"],
  mkuser: ["param([string]$Name)",
    "try { $s = ConvertTo-SecureString $env:LEG_PW -AsPlainText -Force",
    "  New-LocalUser -Name $Name -Password $s -PasswordNeverExpires -AccountNeverExpires -ErrorAction Stop | Out-Null",
    "  try { Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $Name -ErrorAction Stop } catch { }",
    "  'made' } catch { 'refused: ' + $_.Exception.Message }"],
  rmuser: ["param([string]$Name)",
    "try { Remove-LocalUser -Name $Name -ErrorAction Stop; 'removed' } catch { 'not removed: ' + $_.Exception.Message }"],
  runas: ["param([string]$Task, [string]$Name, [string]$Exe, [string]$Ud)",
    "try { $a = New-ScheduledTaskAction -Execute $Exe -Argument ('--user-data-dir=\"' + $Ud + '\"')",
    "  $s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries",
    "  Register-ScheduledTask -TaskName $Task -Action $a -Settings $s -User ($env:COMPUTERNAME + '\\' + $Name) -Password $env:LEG_PW -RunLevel Limited -ErrorAction Stop | Out-Null",
    "  Start-ScheduledTask -TaskName $Task -ErrorAction Stop; 'started' } catch { 'refused: ' + $_.Exception.Message }"],
  unreg: ["param([string]$Task)",
    "try { Stop-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue",
    "  Unregister-ScheduledTask -TaskName $Task -Confirm:$false -ErrorAction Stop; 'unregistered' } catch { 'not unregistered: ' + $_.Exception.Message }"],
  taskinfo: ["param([string]$Task)",
    "try { $i = Get-ScheduledTaskInfo -TaskName $Task -ErrorAction Stop; 'state ' + (Get-ScheduledTask -TaskName $Task).State + ', last result ' + $i.LastTaskResult } catch { 'unreadable' }"],
  hold: ["param([string]$Target, [string]$Signal)",
    "$f = [System.IO.File]::Open($Target, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)",
    "Set-Content -LiteralPath $Signal -Value 'held'", "Start-Sleep -Seconds 3600", "$f.Close()"],
};
const psFile = (k) => path.join(LAB, "q-" + k + ".ps1");
for (const k of Object.keys(PS)) fs.writeFileSync(psFile(k), PS[k].join("\r\n"), "utf8");
const PS_HEAD = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"];
function ps(k, args, extraEnv) {
  const r = spawnSync("powershell.exe", PS_HEAD.concat([psFile(k)], args || []),
    { encoding: "utf8", windowsHide: true, timeout: 120000, env: Object.assign({}, process.env, extraEnv || {}) });
  return String(r.stdout || "").trim() || oneLine(r.stderr) || "no answer (" + r.status + ")";
}
if (ps("elevated") !== "yes")
  refuse("the legs install for all users and make accounts and SYSTEM tasks, so they need an elevated account; installer-probe.ps1 says which this runner is");

/* ---- small readings ---------------------------------------------------------------------------------------------- */

const present = (k) => G.regQuery(k).present;
const valueOf = (k, name) => { const r = G.regQuery(k, null, name); return r.present ? (G.regValues(r.text)[name] || "") : ""; };
const machineDir = () => valueOf(regKey(KM.install), "InstallLocation");
function hku(k) {
  const r = spawnSync("reg", ["query", k], { encoding: "utf8", windowsHide: true, timeout: 30000 });
  if (r.status === 0) return true;
  if (r.status === 1) return false;
  throw new Error("reg query " + k + " answered " + r.status + " " + oneLine(r.stderr));
}
const commonLinks = () => [path.join(PLACES.commonDesktop, SHORTCUT), path.join(PLACES.commonPrograms, SHORTCUT)];
const shaOr = (f) => { try { return E.sha256(f); } catch (e) { return fs.existsSync(f) ? "unreadable" : "absent"; } };
const exeOf = (cmdLine) => (/^"([^"]+)"/.exec(String(cmdLine || "")) || [])[1] || "";
const procsOf = (exe) => { try { const v = JSON.parse(ps("procs", ["-Exe", exe]) || "[]"); return Array.isArray(v) ? v : [v]; } catch (e) { return []; } };
const yes = (b) => (b ? "yes" : "no");

/** Every file under `dir` by relative path, lower-cased, to its sha256. */
function manifest(dir) {
  const out = {};
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name), r = (rel ? rel + "\\" : "") + e.name.toLowerCase();
      if (e.isDirectory()) walk(p, r);
      else { try { out[r] = E.sha256(p); } catch (x) { out[r] = "unreadable " + (x.code || ""); } }
    }
  };
  if (dir && fs.existsSync(dir)) walk(dir, "");
  return out;
}
function manifestDiff(a, b, skip) {
  const keep = (k) => !skip || k !== skip;
  return { changed: Object.keys(a).filter((k) => keep(k) && k in b && a[k] !== b[k]),
    gone: Object.keys(a).filter((k) => keep(k) && !(k in b)), added: Object.keys(b).filter((k) => keep(k) && !(k in a)) };
}
const few = (list) => list.slice(0, 4).join(",") + (list.length > 4 ? ",+" + (list.length - 4) : "");

/* ---- running things, and the clean-up that follows them --------------------------------------------------------- */

/** One setup or uninstaller run, by pid, with a ceiling; past it the process and its children are stopped by pid. */
function runExe(exe, args, timeoutMs) {
  return new Promise((resolve) => {
    let timedOut = false, settled = false;
    const t0 = Date.now();
    const child = spawn(exe, args, { windowsHide: true, stdio: "ignore" });
    const done = (code) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ code, timedOut, seconds: Math.round((Date.now() - t0) / 1000) }); };
    const timer = setTimeout(() => { timedOut = true; E.killTree(child.pid); }, timeoutMs || 600000);
    child.on("exit", (code) => done(code));
    child.on("error", () => done(null));
  });
}
async function goneWithin(dir, seconds) {
  for (let i = 1; i <= seconds; i++) { await sleep(1000); if (!fs.existsSync(dir)) return i; }
  return -1;
}
function schtasks(args) {
  const r = spawnSync("schtasks", args, { encoding: "utf8", windowsHide: true, timeout: 60000 });
  return { status: r.status, said: oneLine(String(r.stdout || "") + " " + String(r.stderr || "")) };
}

/** Deletes whatever of the test build is still registered or linked machine-wide; answers what it took. */
function sweep() {
  const took = [];
  for (const k of KEYS) {
    if (!present(k)) continue;
    const r = spawnSync("reg", ["delete", k, "/f"].concat(/^HKLM/.test(k) ? ["/reg:64"] : []), { encoding: "utf8", windowsHide: true, timeout: 30000 });
    took.push(k.replace(/^.*\\/, "") + (r.status === 0 ? "" : "(refused)"));
  }
  for (const f of commonLinks()) if (fs.existsSync(f)) { try { fs.unlinkSync(f); took.push(f); } catch (e) { took.push(f + "(refused)"); } }
  return took;
}
/** The all-users copy uninstalled from its own entry, as a person would start it; then the sweep. */
async function uninstallMachine() {
  const said = [];
  const dir = machineDir();
  if (dir) {
    const fromEntry = exeOf(valueOf(regKey(KM.uninstall), "UninstallString"));
    const un = fromEntry && fs.existsSync(fromEntry) ? fromEntry : path.join(dir, UNINSTALLER);
    if (fs.existsSync(un)) {
      const r = await runExe(un, P.uninstallArgs("machine"), 300000);
      const g = await goneWithin(dir, 120);
      said.push("uninstaller exit " + r.code + (r.timedOut ? " (stopped at its ceiling)" : "") + ", " + (g > 0 ? "folder gone in " + g + " s" : "folder still there"));
    } else said.push("no uninstaller in " + dir);
  } else said.push("nothing registered all users");
  const took = sweep();
  if (took.length) said.push("swept " + took.join(","));
  return said.join("; ");
}

/* A one-shot task as SYSTEM, running a .cmd written into the lab that leaves its exit code in a file. */
async function systemTask(rec, tag, lines, timeoutMs) {
  const name = "etst-leg-" + tag + "-" + crypto.randomInt(10000, 99999);
  const cmd = path.join(LAB, name + ".cmd"), exitFile = path.join(LAB, name + ".exit");
  fs.writeFileSync(cmd, ["@echo off"].concat(lines, ['>"' + exitFile + '" echo %ERRORLEVEL%']).join("\r\n") + "\r\n");
  rec.after("task-" + tag, () => { schtasks(["/End", "/TN", name]); const d = schtasks(["/Delete", "/TN", name, "/F"]); return d.status === 0 ? "deleted" : "delete said " + d.said; });
  const c = schtasks(["/Create", "/TN", name, "/TR", cmd, "/SC", "ONCE", "/ST", "23:59", "/RU", "SYSTEM", "/F"]);
  if (c.status !== 0) throw new NoVerdict("a one-shot task as SYSTEM could not be made: " + c.said);
  const r = schtasks(["/Run", "/TN", name]);
  if (r.status !== 0) throw new NoVerdict("the one-shot task as SYSTEM could not be started: " + r.said);
  for (let i = 0; i < timeoutMs / 1000; i++) {
    if (fs.existsSync(exitFile)) { await sleep(500); return { code: parseInt(fs.readFileSync(exitFile, "utf8"), 10), timedOut: false, name }; }
    await sleep(1000);
  }
  schtasks(["/End", "/TN", name]);
  return { code: null, timedOut: true, name };
}

/* ---- what each leg needs before it starts ------------------------------------------------------------------------ */

const DIST = path.join(LAB, "dist");
let NEWER = "";
/** Every reason this leg may not start: a shipped app present, or anything of the test build already here. */
function legPreflight() {
  const said = [];
  try {
    const g = G.guardStart({ env: process.env });
    said.push(...g.refusals);
    for (const k of [KU.uninstall, KU.install, KM.uninstall, KM.install].map(regKey).concat(["HKLM\\Software\\Classes\\" + T.scheme]))
      if (present(k)) said.push("the test build is already registered here (" + k + ")");
    for (const k of [SYS.uninstall, SYS.install]) if (hku(k)) said.push("the test build is already registered for SYSTEM (" + k + ")");
  } catch (e) { said.push("the registry could not be read: " + e.message); }
  for (const f of commonLinks()) if (fs.existsSync(f)) said.push("a shortcut named " + SHORTCUT + " already stands at " + f);
  const def = path.join(PLACES.programFiles, PRODUCT);
  if (fs.existsSync(def)) said.push("the all-users folder " + def + " is already there");
  return said;
}
/** Version N: the older setup, the test build's, and not the newer's bytes; otherwise the leg has no verdict. */
function olderSetup(rec) {
  const old = process.env.ETIUDA_OLD_SETUP_EXE || "";
  if (!old || !fs.existsSync(old)) throw new NoVerdict("ETIUDA_OLD_SETUP_EXE names no file (" + JSON.stringify(old) + "), and the leg needs version N");
  const no = G.setupRefusal(G.setupIdentity(old), "desk");
  if (no) throw new NoVerdict("the older setup is refused before it runs: " + no);
  const so = E.sha256(old), sn = E.sha256(NEWER);
  rec.f("old-setup", so.slice(0, 12)); rec.f("new-setup", sn.slice(0, 12));
  if (so === sn) throw new NoVerdict("the older and the newer setup are the same bytes, so N and N+1 are one version");
  return old;
}
/** Installs `exe` for all users with P.installArgs, the uninstall registered first so a failed install still cleans up. */
async function installMachine(rec, exe, tag) {
  rec.after("uninstall", uninstallMachine);
  const args = P.installArgs({ mode: "machine" });
  const bad = P.argsFault(args, "machine");
  if (bad) throw new Error("refusing " + args.join(" ") + ": " + bad);
  const r = await runExe(exe, args, 600000);
  const dir = machineDir();
  rec.f(tag + "-exit", r.timedOut ? "timeout" : r.code);
  if (r.code !== 0 || !dir || !fs.existsSync(path.join(dir, PRODUCT + ".exe")))
    throw new NoVerdict(tag + " did not install for all users (exit " + r.code + ", InstallLocation " + JSON.stringify(dir || null) + "), so the leg never reached its subject");
  return dir;
}
const newBuild = () => manifest(path.join(DIST, "win-unpacked"));

/* ---- (a) all-upgrade ------------------------------------------------------------------------------------------- */

async function allUpgrade(rec) {
  const old = olderSetup(rec);
  const dir = await installMachine(rec, old, "n");
  const asarAt = path.join(dir, "resources", "app.asar"), asarOld = shaOr(asarAt);
  /* The program may be the same bytes in N and N+1 (a change to the installer alone): the subject is the newer installer run over
     the older install, and olderSetup has already required the two setups to differ. */
  const asarTree = newBuild()["resources\\app.asar"] || "";
  const marker = path.join(dir, "planted-before-the-upgrade.txt");
  fs.writeFileSync(marker, "planted by " + WHO + "\n");

  /* A bare /S on purpose: the criterion's N+1 run, which finds the folder and the context by itself. P.plainArgs carries a /D
     and would answer where; so the vector is written here, the one in this file that P.argsFault would call unflagged. */
  const r = await runExe(NEWER, ["/S"], 600000);
  const us = valueOf(regKey(KM.uninstall), "UninstallString"), un = exeOf(us);
  const facts = {
    exit: r.timedOut ? "timeout" : r.code,
    entry: present(regKey(KM.uninstall)) && /\/allusers/.test(us) && !!valueOf(regKey(KM.uninstall), "DisplayVersion"),
    uninstaller: !!un && fs.existsSync(un),
    location: P.samePath(machineDir(), dir),
    perUser: present(regKey(KU.uninstall)) || present(regKey(KU.install)),
    links: commonLinks().map((f) => fs.existsSync(f) && P.samePath(ps("lnk", ["-File", f]), path.join(dir, PRODUCT + ".exe"))),
    link: (() => { const k = "HKLM\\Software\\Classes\\" + T.scheme; const v = G.regQuery(k); const cmd = present(k + "\\shell\\open\\command") ? G.regValues(G.regQuery(k + "\\shell\\open\\command").text)["(Default)"] || "" : "";
      return v.present && "URL Protocol" in G.regValues(v.text) && cmd.toLowerCase().indexOf(dir.toLowerCase()) > -1; })(),
    markerGone: !fs.existsSync(marker),
    asarNew: shaOr(asarAt),
  };
  rec.f("n1-exit", facts.exit); rec.f("dir", dir); rec.f("hklm-entry", yes(facts.entry)); rec.f("uninstaller", yes(facts.uninstaller));
  rec.f("same-folder", yes(facts.location)); rec.f("hkcu-entry", yes(facts.perUser)); rec.f("desktop-link", yes(facts.links[0]));
  rec.f("startmenu-link", yes(facts.links[1])); rec.f(T.scheme + "-link", yes(facts.link)); rec.f("marker-gone", yes(facts.markerGone));
  rec.f("asar", facts.asarNew === asarOld ? "unchanged" : asarTree && facts.asarNew === asarTree ? "this-tree" : "other");
  const ok = facts.exit === 0 && facts.entry && facts.uninstaller && facts.location && !facts.perUser && facts.links.every(Boolean) && facts.link && facts.markerGone;
  rec.end(ok, ok ? "N with /allusers, then N+1 with /S: the all-users entry, both shortcuts and the " + T.scheme + ": link intact, the planted file gone"
    : "after N+1 with /S something is not intact: exit " + facts.exit + ", entry " + yes(facts.entry) + ", uninstaller " + yes(facts.uninstaller)
      + ", shortcuts " + facts.links.map(yes).join("/") + ", link " + yes(facts.link) + ", planted file gone " + yes(facts.markerGone) + ", a per-user entry " + yes(facts.perUser));
}

/* ---- (e) all-move: an all-users install moved to another folder by the newer setup, with a link planted in the old one -----
   N is installed for all users into folder A, a person's own file is put in A, and a directory junction is planted at
   A\resources\planted-link pointing at a folder outside both, holding a file. N+1 then installs silent for all users into B.
   Green where: the run exits 0; the all-users entry names B and B holds the program; both shortcuts point at B; A no longer
   holds the program, nor its resources and locales trees; the person's file in A stays; and the junction's target, and the file
   in it, are untouched (the old folder's clean-up never enters a link). */

async function allMove(rec) {
  const old = olderSetup(rec);
  /* Folders with no space: /D must be last and unquoted, so P.installArgs refuses a path holding one, and the product's name has one
     (installer-runner run 43242113686, 2026-11-12, where this leg threw before installing anything). */
  const A = path.join(LAB, "move-a", "app"), B = path.join(LAB, "move-b", "app");
  rec.after("uninstall", uninstallMachine);
  const argsA = P.installArgs({ mode: "machine", dir: A });
  const badA = P.argsFault(argsA, "machine");
  if (badA) throw new Error("refusing " + argsA.join(" ") + ": " + badA);
  const r0 = await runExe(old, argsA, 600000);
  rec.f("n-exit", r0.timedOut ? "timeout" : r0.code);
  if (r0.code !== 0 || !fs.existsSync(path.join(A, PRODUCT + ".exe")) || !P.samePath(machineDir(), A))
    throw new NoVerdict("N did not install for all users into " + A + " (exit " + r0.code + ", InstallLocation " + JSON.stringify(machineDir() || null) + ")");
  const own = path.join(A, "a-persons-own-file.txt");
  fs.writeFileSync(own, "planted by " + WHO + "\n");
  const victimDir = path.join(LAB, "move-victim"), victim = path.join(victimDir, "must-stay.txt");
  fs.mkdirSync(victimDir, { recursive: true });
  fs.writeFileSync(victim, "must stay\n");
  const link = path.join(A, "resources", "planted-link");
  const mk = spawnSync("cmd.exe", ["/c", "mklink", "/J", link, victimDir], { encoding: "utf8", windowsHide: true, timeout: 30000 });
  rec.after("junction", () => { if (fs.existsSync(link)) spawnSync("cmd.exe", ["/c", "rmdir", link], { windowsHide: true, timeout: 30000 }); return "checked"; });
  if (mk.status !== 0 || !fs.existsSync(path.join(link, "must-stay.txt")))
    throw new NoVerdict("the junction could not be planted (" + oneLine(mk.stderr || mk.stdout) + ")");

  const argsB = P.installArgs({ mode: "machine", dir: B });
  const badB = P.argsFault(argsB, "machine");
  if (badB) throw new Error("refusing " + argsB.join(" ") + ": " + badB);
  const r = await runExe(NEWER, argsB, 600000);
  const facts = {
    exit: r.timedOut ? "timeout" : r.code,
    location: P.samePath(machineDir(), B),
    program: fs.existsSync(path.join(B, PRODUCT + ".exe")),
    links: commonLinks().map((x) => fs.existsSync(x) && P.samePath(ps("lnk", ["-File", x]), path.join(B, PRODUCT + ".exe"))),
    oldProgram: fs.existsSync(path.join(A, PRODUCT + ".exe")),
    oldTrees: fs.existsSync(path.join(A, "resources")) || fs.existsSync(path.join(A, "locales")),
    own: fs.existsSync(own),
    victim: fs.existsSync(victim) && fs.readFileSync(victim, "utf8") === "must stay\n",
  };
  rec.f("n1-exit", facts.exit); rec.f("entry-b", yes(facts.location)); rec.f("program-b", yes(facts.program));
  rec.f("links-b", facts.links.map(yes).join("/")); rec.f("program-a", yes(facts.oldProgram)); rec.f("trees-a", yes(facts.oldTrees));
  rec.f("own-file-a", yes(facts.own)); rec.f("junction-target-intact", yes(facts.victim));
  const ok = facts.exit === 0 && facts.location && facts.program && facts.links.every(Boolean) && !facts.oldProgram && !facts.oldTrees
    && facts.own && facts.victim;
  rec.end(ok, ok ? "N in A, then N+1 into B: entry, program and shortcuts at B; A emptied of the program and its trees, the person's file kept, the planted link's target untouched"
    : "after the move: exit " + facts.exit + ", entry at B " + yes(facts.location) + ", program at B " + yes(facts.program) + ", shortcuts " + facts.links.map(yes).join("/")
      + ", program left in A " + yes(facts.oldProgram) + ", trees left in A " + yes(facts.oldTrees) + ", own file kept " + yes(facts.own)
      + ", link target intact " + yes(facts.victim));
}

/* ---- (b) running-1618 ------------------------------------------------------------------------------------------ */

function installState(dir) {
  const keys = {};
  for (const k of KEYS) { const r = G.regQuery(k); keys[k] = r.present ? r.text : "absent"; }
  const links = {};
  for (const f of commonLinks()) links[f] = shaOr(f);
  return { files: manifest(dir), keys, links };
}
function stateDiff(a, b) {
  const d = manifestDiff(a.files, b.files);
  const keys = Object.keys(a.keys).filter((k) => a.keys[k] !== b.keys[k] && !/^HKCU\\Software\\Classes\\/.test(k));
  const links = Object.keys(a.links).filter((k) => a.links[k] !== b.links[k]);
  return { files: d.changed.concat(d.gone, d.added), keys, links };
}

async function running1618(rec) {
  const wall = E.windowWallRefusal(WHO);
  if (wall) throw new NoVerdict("the leg opens the installed app and the window wall refuses: " + wall[0]);
  if (!process.env.APPDATA) throw new NoVerdict("APPDATA is not set, so the own copy's user-data folder cannot be named");
  const dir = await installMachine(rec, NEWER, "install");
  const exe = path.join(dir, PRODUCT + ".exe");

  /* The other session: a standard account made here, its password never printed or written. */
  const name = "etst" + crypto.randomInt(10000, 99999);
  let secret = "Aa1!" + crypto.randomBytes(24).toString("base64");
  rec.after("account", () => ps("rmuser", ["-Name", name]));
  const made = ps("mkuser", ["-Name", name], { LEG_PW: secret });
  if (made !== "made") { secret = null; throw new NoVerdict("a standard account could not be made: " + made); }
  const drop = path.join(LAB, "as-" + name);
  fs.mkdirSync(drop);
  spawnSync("icacls", [drop, "/grant", name + ":(OI)(CI)M"], { windowsHide: true, timeout: 30000 });
  const task = "etst-leg-" + name;
  rec.after("task", () => ps("unreg", ["-Task", task]));
  const started = ps("runas", ["-Task", task, "-Name", name, "-Exe", exe, "-Ud", path.join(drop, "ud")], { LEG_PW: secret });
  secret = null;
  if (started !== "started") throw new NoVerdict("the installed copy could not be started as the second account: " + started);

  /* This account's own copy, through the harness's launch door, in the user-data folder Electron would pick for it by its own
     rule, so the installer's close signal, started with no flag, reaches the same running copy. */
  const docs = path.join(LAB, "documents");
  fs.mkdirSync(docs);
  const args = ["--user-data-dir=" + path.join(process.env.APPDATA, T.packageName)];
  const opts = { stdio: "ignore", windowsHide: true, env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: docs }) };
  const no = E.shellLaunchRefusal(WHO, args, opts);
  if (no) throw new NoVerdict("the own copy's launch is refused: " + no[0]);
  const own = E.shellLaunch(WHO, exe, args, opts);
  let ownGone = false;
  own.on("exit", () => { ownGone = true; });
  rec.after("own-copy", () => (ownGone ? "had ended" : E.killTree(own.pid).how));

  let others = [];
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    others = procsOf(exe).filter((p) => String(p.user).toLowerCase() === name.toLowerCase());
    if (others.length && !ownGone && i >= 4) break;
  }
  rec.after("other-copy", () => { const left = procsOf(exe).filter((p) => String(p.user).toLowerCase() === name.toLowerCase());
    return left.length ? left.map((p) => p.pid + " " + E.killTree(p.pid).killed).join(",") : "had ended"; });
  rec.f("other-copies", others.length);
  if (!others.length) throw new NoVerdict("the second account's copy did not start or did not stay (task " + ps("taskinfo", ["-Task", task]) + ")");
  if (ownGone) throw new NoVerdict("this account's own copy did not stay running, so there is nothing to ask to close");

  const before = installState(dir);
  const r = await runExe(NEWER, P.installArgs({ mode: "machine" }), 600000);
  await sleep(3000);
  const otherPids = new Set(others.map((p) => p.pid));
  const othersAlive = procsOf(exe).filter((p) => otherPids.has(p.pid)).length;
  const d = stateDiff(before, installState(dir));
  rec.f("exit", r.timedOut ? "timeout" : r.code); rec.f("seconds", r.seconds); rec.f("own-closed", yes(ownGone));
  rec.f("other-alive", othersAlive); rec.f("files-changed", d.files.length ? few(d.files) : 0);
  rec.f("keys-changed", d.keys.length ? few(d.keys) : 0); rec.f("links-changed", d.links.length);
  const ok = r.code === 1618 && ownGone && othersAlive > 0 && !d.files.length && !d.keys.length && !d.links.length;
  rec.end(ok, ok ? "the own copy closed, the other account's copy ended the run with 1618, and the installed files, keys and shortcuts are as they were"
    : "exit " + r.code + " (1618 wanted), own copy closed " + yes(ownGone) + ", other account's copy alive " + yes(othersAlive > 0)
      + ", " + d.files.length + " file(s), " + d.keys.length + " key(s) and " + d.links.length + " shortcut(s) changed");
}

/* ---- (c) system-bare ------------------------------------------------------------------------------------------- */

async function systemBare(rec) {
  const dir = path.join(LAB, "as-system");
  const args = P.plainArgs(dir);
  rec.after("uninstall", async () => {
    const said = [];
    if (present(regKey(KM.uninstall)) || machineDir()) said.push(await uninstallMachine());
    if (hku(SYS.uninstall)) {
      /* It went per user for SYSTEM: only SYSTEM can take that copy away, by its own uninstaller in a second task. */
      const tidy = record("tidy");
      try {
        const r = await systemTask(tidy, "unsys", ['"' + path.join(dir, UNINSTALLER) + '" ' + P.uninstallArgs("user").join(" ")], 300000);
        said.push("SYSTEM's uninstall exit " + r.code + ", " + ((await goneWithin(dir, 120)) > 0 ? "folder gone" : "folder still there"));
      } catch (e) { said.push("SYSTEM's uninstall: " + e.message); }
      for (const c of tidy.cleanups.reverse()) { try { await c.run(); } catch (e) { /* named below */ } }
      for (const k of [SYS.uninstall, SYS.install]) if (hku(k)) { spawnSync("reg", ["delete", k, "/f"], { windowsHide: true, timeout: 30000 }); said.push("deleted " + k); }
    }
    for (const p of procsOf(NEWER)) said.push("stopped setup pid " + p.pid + " " + E.killTree(p.pid).killed);
    return said.join("; ") || "nothing was installed";
  });
  const r = await systemTask(rec, "sys", ['"' + NEWER + '" ' + args.join(" ")], 900000);
  const f = { hklmU: present(regKey(KM.uninstall)), hklmI: present(regKey(KM.install)), sysU: hku(SYS.uninstall), sysI: hku(SYS.install) };
  rec.f("exit", r.timedOut ? "timeout" : r.code); rec.f("args", args.join(" ")); rec.f("hklm-uninstall", yes(f.hklmU)); rec.f("hklm-install", yes(f.hklmI));
  rec.f("location", machineDir()); rec.f("system-hkcu-uninstall", yes(f.sysU)); rec.f("system-hkcu-install", yes(f.sysI));
  rec.f("runner-hkcu", yes(present(regKey(KU.uninstall))));
  const ok = r.code === 0 && f.hklmU && f.hklmI && !f.sysU && !f.sysI;
  rec.end(ok, ok ? "a bare /S as SYSTEM chose all users: the HKLM keys are there and SYSTEM's HKCU has none"
    : "a bare /S as SYSTEM: exit " + (r.timedOut ? "none within 15 min" : r.code) + ", HKLM keys " + yes(f.hklmU) + "/" + yes(f.hklmI)
      + ", SYSTEM's HKCU keys " + yes(f.sysU) + "/" + yes(f.sysI));
}

/* ---- (d) locked-1618 ------------------------------------------------------------------------------------------- */

async function locked1618(rec) {
  const old = olderSetup(rec);
  const dir = await installMachine(rec, old, "n");
  const heldRel = "resources\\app.asar", held = path.join(dir, heldRel);
  if (!fs.existsSync(held)) throw new NoVerdict("the installed copy has no " + heldRel + " to hold");
  const unRel = UNINSTALLER.toLowerCase();
  const before = manifest(dir), fresh = newBuild();
  const newKnown = Object.keys(fresh).length > 0;
  if (newKnown && !manifestDiff(before, fresh, unRel).changed.length && !manifestDiff(before, fresh, unRel).gone.length)
    throw new NoVerdict("version N's files are the newer build's, so whole and new cannot be told apart");

  /* The file held open with no sharing, by a child of this run, stopped by its pid. */
  const signal = path.join(LAB, "held.txt");
  const holder = spawn("powershell.exe", PS_HEAD.concat([psFile("hold"), "-Target", held, "-Signal", signal]), { windowsHide: true, stdio: "ignore" });
  let holderGone = false;
  holder.on("exit", () => { holderGone = true; });
  rec.after("holder", () => (holderGone ? "had ended" : E.killTree(holder.pid).how));
  for (let i = 0; i < 60 && !fs.existsSync(signal); i++) await sleep(500);
  let heldNow = false;
  try { fs.closeSync(fs.openSync(held, "r")); } catch (e) { heldNow = ["EBUSY", "EPERM", "EACCES"].indexOf(e.code) > -1; }
  rec.f("held", heldRel); rec.f("held-confirmed", yes(heldNow));
  if (!heldNow) throw new NoVerdict("the file did not stay held (this run could still open it), so the lock was never there");

  const r = await runExe(NEWER, P.installArgs({ mode: "machine" }), 900000);
  if (!holderGone) E.killTree(holder.pid);
  await sleep(1500);
  const now = manifest(dir);
  const d = manifestDiff(before, now, unRel);
  const whole = !d.changed.length && !d.gone.length && !d.added.length;
  const nd = newKnown ? manifestDiff(fresh, now, unRel) : null;
  const fullyNew = !!nd && !nd.changed.length && !nd.gone.length && !nd.added.length;
  const un = exeOf(valueOf(regKey(KM.uninstall), "UninstallString"));
  rec.f("exit", r.timedOut ? "timeout" : r.code); rec.f("seconds", r.seconds); rec.f("changed", d.changed.length ? few(d.changed) : 0);
  rec.f("gone", d.gone.length ? few(d.gone) : 0); rec.f("added", d.added.length ? few(d.added) : 0); rec.f("whole", yes(whole));
  rec.f("fully-new", newKnown ? yes(fullyNew) : "unknown"); rec.f("uninstaller-changed", yes(before[unRel] !== now[unRel]));
  rec.f("entry-starts", yes(!!un && fs.existsSync(un)));
  if (!whole && !newKnown) throw new NoVerdict("the copy changed and the newer build's own files (win-unpacked) are not here to say whether it is whole new or a mix");
  if (!whole && !fullyNew) { rec.end(false, "a mix: " + (d.changed.length + d.gone.length + d.added.length) + " file(s) differ from N and the copy is not the new version either (exit " + r.code + ")"); return; }
  if (r.code === 1618) { rec.end(true, "1618 at a held file, and the installed copy is " + (whole ? "whole, as N left it" : "fully the new version")); return; }
  if (r.code === 0 && fullyNew) throw new NoVerdict("the held file did not stop the install: exit 0 and the copy is fully new, so the lock never bit");
  rec.end(false, "exit " + (r.timedOut ? "none within 15 min" : r.code) + " where 1618 was wanted; the copy is " + (whole ? "whole" : "fully new"));
}

/* ---- the run ------------------------------------------------------------------------------------------------------- */

function record(name) {
  const rec = { name, facts: [], cleanups: [], verdict: "", why: "" };
  rec.f = (k, v) => { rec.facts.push(fmt(k, v)); return v; };
  rec.after = (what, run) => rec.cleanups.push({ what, run });
  rec.end = (ok, why) => { rec.verdict = ok ? "ok" : "fail"; rec.why = why; };
  return rec;
}
const LEGS = { "all-upgrade": allUpgrade, "running-1618": running1618, "system-bare": systemBare, "locked-1618": locked1618, "all-move": allMove };

/* The newer setup, built once from this tree under the test identity, as the marker builds it. */
const early = legPreflight();
if (early.length) refuse("before anything is built: " + early.join("; "));
try {
  const cli = path.join(ROOT, "node_modules", "electron-builder", "out", "cli", "cli.js");
  if (!fs.existsSync(cli)) refuse("electron-builder is not installed; npm ci first");
  /* Through tools/package.mjs --test-identity, never electron-builder directly: the pack step makes turning.7z (generated, git-ignored)
     and applies the NSIS template patches, which a direct call skips; a desk hides that with leftovers, a clean runner does not
     (run 43222136075, 2026-11-12). */
  execFileSync(process.execPath, [path.join(ROOT, "tools", "package.mjs"), "--test-identity"],
    { cwd: ROOT, stdio: "inherit", env: E.unsignedEnv({ ETIUDA_DIST: DIST }) });
} catch (e) { refuse("the test build's installer could not be built: " + oneLine(e.message)); }
const setups = fs.readdirSync(DIST).filter((n) => /-setup\.exe$/i.test(n));
if (setups.length !== 1) refuse(DIST + " holds " + setups.length + " installers; expected 1");
NEWER = path.join(DIST, setups[0]);
const notTest = G.setupRefusal(G.setupIdentity(NEWER), "desk");
if (notTest) refuse("the built setup is not the test build: " + notTest);
say("#legs newer " + setups[0] + " sha256 " + E.sha256(NEWER).slice(0, 16) + ", legs " + CHOSEN.join(" "));

let failed = 0, verdicts = 0;
for (const name of CHOSEN) {
  const rec = record(name);
  try {
    const pre = legPreflight();
    if (pre.length) throw new NoVerdict("refused before anything ran: " + pre.join("; "));
    await LEGS[name](rec);
    if (!rec.verdict) throw new Error("the leg ended without a verdict");
  } catch (e) {
    if (e instanceof NoVerdict) { rec.verdict = "no-verdict"; rec.why = e.message; }
    else { rec.verdict = "fail"; rec.why = "the leg threw: " + oneLine(e && e.stack || e); }
  } finally {
    for (const c of rec.cleanups.reverse()) {
      try { rec.f("cleanup-" + c.what, oneLine(await c.run())); } catch (e) { rec.f("cleanup-" + c.what, "threw: " + oneLine(e.message)); }
    }
  }
  const head = rec.verdict === "ok" ? "  ok   " : rec.verdict === "fail" ? "  FAIL " : "  --   ";
  say(head + name + " " + (rec.verdict === "no-verdict" ? "no verdict: " : "") + oneLine(rec.why));
  say("#leg " + name + " " + rec.verdict + " " + rec.facts.join(" "));
  if (rec.verdict === "fail") failed++;
  if (rec.verdict !== "no-verdict") verdicts++;
}
const diffs = G.guardEnd(GUARD).diffs;
say("#guard " + (diffs.length ? "changed " + diffs.map(G.diffLine).join("; ") : "unchanged: what the shipped apps own reads as before"));
process.exit(failed ? E.exitOf(failed) : verdicts ? 0 : NO_VERDICT);
