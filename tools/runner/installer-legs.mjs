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
 *   running-1618  "1618 at a running copy: the installing account's own copy is left as it is when another session's copy
 *                 ends the run with 1618, and nothing else changes" (the installer owner's ruling, 2026-11-13: closing the
 *                 person's own copy only to refuse would cost their open work for no install). The other session is a standard account made for the leg,
 *                 its password generated here and never printed, starting the installed copy through a one-shot scheduled
 *                 task; the account and the task are removed at the end.
 *   system-bare   "a bare /S as SYSTEM, driven by schtasks /ru SYSTEM with a one-shot task, which the harness can start
 *                 without a person. It must choose all users".
 *   locked-1618   "1618 at a locked file during extract (a file held open). The leg records what is left": green where the
 *                 exit is 1618 and the installed copy is whole or fully the new version, red where it is a mix.
 *   system-push   "an all-users silent push from a system context (what a Software Center does)", measured end to end (the
 *                 lead engineer's to-sellable list, item 14, 2026-11-13): /S /allusers as SYSTEM into the default folder; a
 *                 standard account that never installed anything starts the copy from the all-users Start-menu shortcut and
 *                 its first run writes into that account's own Documents and AppData; then the uninstall, as SYSTEM, takes
 *                 the program, its keys, its shortcuts and its link whole. Green only where all three hold.
 *   ext-claimed   the other half of the extension key's rule (Claude α's yes, 2026-11-13 09:33): the all-users uninstall deletes
 *                 .<ext> where its default still names our class, and leaves it where another program's claim stands.
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
const LEG_NAMES = ["all-upgrade", "running-1618", "system-bare", "locked-1618", "all-move", "all-space-d", "system-push", "ext-claimed", "ts-cycle", "shipped-detect", "nonpersistent", "net-hosts"];
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
  /* The runner's own DNS client cache: emptied before a window and read after it, so every name either network stack (Chromium's
     and Node's) asked the system for in that window is listed. The net-hosts leg's second witness, beside the net-log. */
  dnsclear: ["try { Clear-DnsClientCache; 'cleared' } catch { 'refused: ' + $_.Exception.Message }"],
  dnsread: ["try { @(Get-DnsClientCache | ForEach-Object { $_.Entry.ToLower() } | Sort-Object -Unique) -join ' ' } catch { 'refused: ' + $_.Exception.Message }"],
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
  /* system-push's start: the program as the shortcut names it, with no argument of ours, so the copy picks its own user-data
     and Documents folders as it would for a person; the account's profile is loaded by the password logon. */
  runplain: ["param([string]$Task, [string]$Name, [string]$Exe)",
    "try { $a = New-ScheduledTaskAction -Execute $Exe",
    "  $s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries",
    "  Register-ScheduledTask -TaskName $Task -Action $a -Settings $s -User ($env:COMPUTERNAME + '\\' + $Name) -Password $env:LEG_PW -RunLevel Limited -ErrorAction Stop | Out-Null",
    "  Start-ScheduledTask -TaskName $Task -ErrorAction Stop; 'started' } catch { 'refused: ' + $_.Exception.Message }"],
  /* An account's profile folder, by its SID's ProfileList entry; empty until its first logon made one. */
  profileof: ["param([string]$Name)",
    "try { $sid = (New-Object System.Security.Principal.NTAccount($Name)).Translate([System.Security.Principal.SecurityIdentifier]).Value",
    "  $k = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\' + $sid",
    "  if (Test-Path -LiteralPath $k) { [string](Get-ItemProperty -LiteralPath $k).ProfileImagePath } else { '' } } catch { '' }"],
  unreg: ["param([string]$Task)",
    "try { Stop-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue",
    "  Unregister-ScheduledTask -TaskName $Task -Confirm:$false -ErrorAction Stop; 'unregistered' } catch { 'not unregistered: ' + $_.Exception.Message }"],
  taskinfo: ["param([string]$Task)",
    "try { $i = Get-ScheduledTaskInfo -TaskName $Task -ErrorAction Stop; $t = Get-ScheduledTask -TaskName $Task; 'state ' + $t.State + ', last result ' + $i.LastTaskResult + ', last run ' + $i.LastRunTime + ', missed ' + $i.NumberOfMissedRuns + ', logon ' + $t.Principal.LogonType } catch { 'unreadable' }"],
  /* The holder writes "held" once the file is open with no sharing, or its own refusal, so a lock never seen names itself. */
  hold: ["param([string]$Target, [string]$Signal)",
    "try { $f = [System.IO.File]::Open($Target, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None) }",
    "catch { Set-Content -LiteralPath $Signal -Value ('refused: ' + $_.Exception.Message); exit 3 }",
    "Set-Content -LiteralPath $Signal -Value ('held ' + $f.Name)", "Start-Sleep -Seconds 3600", "$f.Close()"],
  /* A second process's open of the same file, read with every sharing, as the probe beside node's own. */
  tryopen: ["param([string]$Target)",
    "try { $g = [System.IO.File]::Open($Target, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite); $g.Close(); 'opened' }",
    "catch { 'refused: ' + $_.Exception.GetType().Name + ' ' + $_.Exception.Message }"],
  /* A password task runs only for an account holding the batch-logon right, which a standard account has not by default
     (running-1618 on both trees, 2026-11-12: last result 0x41303, the task never ran). Granted here on the runner, by the
     account's SID, through secedit's own export and configure of USER_RIGHTS. */
  batchright: ["param([string]$Name)",
    "try { $sid = (New-Object System.Security.Principal.NTAccount($Name)).Translate([System.Security.Principal.SecurityIdentifier]).Value",
    "  $cfg = Join-Path $env:TEMP ('br-' + [guid]::NewGuid().ToString() + '.inf'); $db = $cfg + '.sdb'",
    "  secedit /export /cfg $cfg /areas USER_RIGHTS | Out-Null",
    "  $found = $false",
    "  $lines = @(Get-Content -LiteralPath $cfg | ForEach-Object { if ($_ -match '^SeBatchLogonRight\\s*=') { $found = $true; $_ + ',*' + $sid } else { $_ } })",
    "  if (-not $found) { $lines = @($lines | ForEach-Object { if ($_ -eq '[Privilege Rights]') { $_; 'SeBatchLogonRight = *' + $sid } else { $_ } }) }",
    "  Set-Content -LiteralPath $cfg -Value $lines -Encoding Unicode",
    "  secedit /configure /db $db /cfg $cfg /areas USER_RIGHTS | Out-Null",
    "  if ($LASTEXITCODE -ne 0) { 'refused: secedit exit ' + $LASTEXITCODE } else { 'granted' } } catch { 'refused: ' + $_.Exception.Message }"],
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

/* ---- (f) all-space-d: a silent all-users install with /D into a folder whose path holds spaces, as a deployment tool passes it ----
   NSIS takes /D only as the last argument and unquoted, spaces and all. A spawned argument holding a space is quoted by node, so
   the command line is written here and passed verbatim (windowsVerbatimArguments), as a deployment tool's would be. Green where the
   run exits 0, the all-users entry names that folder exactly and it holds the program; the uninstall then takes it whole. */

async function allSpaceD(rec) {
  const dir = path.join(LAB, "with space", PRODUCT);
  rec.after("uninstall", uninstallMachine);
  const line = "/S /allusers /D=" + dir;
  rec.f("command", "setup " + line);
  /* windowsVerbatimArguments: node joins the arguments as they are, so /D's spaces reach NSIS unquoted and last. */
  const run = spawnSync(NEWER, ["/S", "/allusers", "/D=" + dir], { windowsHide: true, windowsVerbatimArguments: true, timeout: 600000 });
  const facts = {
    exit: run.error ? "error " + oneLine(run.error.message) : run.status,
    location: P.samePath(machineDir(), dir),
    program: fs.existsSync(path.join(dir, PRODUCT + ".exe")),
  };
  rec.f("exit", facts.exit); rec.f("entry-names-folder", yes(facts.location)); rec.f("program-there", yes(facts.program));
  rec.f("installlocation", machineDir());
  const ok = facts.exit === 0 && facts.location && facts.program;
  rec.end(ok, ok ? "a silent all-users install with /D into a folder holding spaces landed there and is registered there"
    : "with /D into a folder holding spaces: exit " + facts.exit + ", entry names the folder " + yes(facts.location) + ", program there " + yes(facts.program));
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
  const right = ps("batchright", ["-Name", name]);
  rec.f("batch-right", right);
  if (right !== "granted") { secret = null; throw new NoVerdict("the second account could not be given the batch-logon right its task needs: " + right); }
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
  const ok = r.code === 1618 && !ownGone && othersAlive > 0 && !d.files.length && !d.keys.length && !d.links.length;
  rec.end(ok, ok ? "the other account's copy ended the run with 1618, the own copy was left running, and the installed files, keys and shortcuts are as they were"
    : "exit " + r.code + " (1618 wanted), own copy left running " + yes(!ownGone) + ", other account's copy alive " + yes(othersAlive > 0)
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

/* ---- (g) system-push: what a Software Center does, end to end ------------------------------------------------------
   Three acts, each timed, the leg green only where all three hold:
   1. the push: P.installArgs({ mode: "machine" }) (/S /allusers, no /D, so the default folder) in a one-shot task as SYSTEM.
      Holds where it exits 0, the HKLM uninstall and install keys stand and name the default all-users folder holding the
      program, both all-users shortcuts point at that program, the link's class stands in HKLM, and SYSTEM's own HKCU has
      neither key.
   2. the first start by a person: a standard account made here (as running-1618 makes one), never used to install, starts
      the program the all-users Start-menu shortcut names, with no argument. Holds where its copy runs as that account and,
      within 90 s, that first run has written the shipped sample catalog, byte for byte, into <its profile>\Documents\Etiuda
      and desk.json (carrying the sampled mark) into <its profile>\AppData\Roaming\<package name>: the installed code read its
      own package and wrote as the person, with nothing of the installing context in the way.
   3. the removal: the uninstaller the HKLM entry names, with P.uninstallArgs("machine"), in a one-shot task as SYSTEM, after
      the person's copy is stopped by pid. Holds where it exits 0, the folder goes within 120 s, and the keys, the shortcuts
      and the link's class are gone, the extension's own key (.<ext> under Software\Classes) with them: nothing else claimed
      it here, and the uninstaller deletes it when its default still names our class (Claude α's yes of 2026-11-13 09:33 to the
      test architect's note on the first run, 43392802791, red on that key alone while electron-builder's APP_UNASSOCIATE left
      it). A key another program claims is ext-claimed's question. The person's own Documents and AppData are left, which is
      recorded, not judged.
   The account goes at the end; its profile folder stays on the throwaway runner. */
const SAMPLE = path.join(ROOT, "shell", "sample-catalog.ec");
/* A key named by its hive and last segment, so a fact says which hive kept it. */
const keyName = (k) => k.split("\\")[0] + ":" + k.replace(/^.*\\/, "");
/* The extension's own key in either hive. */
const EXT_KEYS = ["HKLM", "HKCU"].map((h) => h + "\\Software\\Classes\\." + T.ext);
const MACHINE_LINK = "HKLM\\Software\\Classes\\" + T.scheme;
const lnkTarget = (f) => ps("lnk", ["-File", f]);
const samePath = (a, b) => !!a && !!b && P.samePath(a, b);
/* The link's class in HKLM, a URL protocol whose open command names the program in `dir`, as all-upgrade reads it. */
function machineLinkTo(dir) {
  const v = G.regQuery(MACHINE_LINK);
  const cmd = present(MACHINE_LINK + "\\shell\\open\\command") ? G.regValues(G.regQuery(MACHINE_LINK + "\\shell\\open\\command").text)["(Default)"] || "" : "";
  return v.present && "URL Protocol" in G.regValues(v.text) && !!dir && cmd.toLowerCase().indexOf(dir.toLowerCase()) > -1;
}

async function systemPush(rec) {
  const wall = E.windowWallRefusal(WHO);
  if (wall) throw new NoVerdict("the leg starts the installed app as a second account and the window wall refuses: " + wall[0]);
  if (!fs.existsSync(SAMPLE)) throw new NoVerdict("the tree holds no " + SAMPLE + " to compare the first run's copy with");
  const want = path.join(PLACES.programFiles, PRODUCT);
  const exe = path.join(want, PRODUCT + ".exe");

  /* 1. The push. The uninstall is registered first, so a half-done push still goes. */
  rec.after("uninstall", async () => {
    const said = [];
    if (present(regKey(KM.uninstall)) || machineDir()) said.push(await uninstallMachine());
    for (const k of [SYS.uninstall, SYS.install]) if (hku(k)) { spawnSync("reg", ["delete", k, "/f"], { windowsHide: true, timeout: 30000 }); said.push("deleted " + k); }
    for (const p of procsOf(NEWER)) said.push("stopped setup pid " + p.pid + " " + E.killTree(p.pid).killed);
    return said.join("; ") || "nothing was left installed";
  });
  const args = P.installArgs({ mode: "machine" });
  const bad = P.argsFault(args, "machine");
  if (bad) throw new Error("refusing " + args.join(" ") + ": " + bad);
  const t1 = Date.now();
  const push = await systemTask(rec, "push", ['"' + NEWER + '" ' + args.join(" ")], 900000);
  rec.f("push-exit", push.timedOut ? "timeout" : push.code); rec.f("push-seconds", Math.round((Date.now() - t1) / 1000)); rec.f("push-args", args.join(" "));
  const dir = machineDir();
  const links = commonLinks().map((f) => ({ f, to: lnkTarget(f) }));
  const pushed = {
    keys: present(regKey(KM.uninstall)) && present(regKey(KM.install)),
    folder: samePath(dir, want) && fs.existsSync(exe),
    links: links.every((l) => samePath(l.to, exe)),
    link: machineLinkTo(dir),
    sysClean: !hku(SYS.uninstall) && !hku(SYS.install),
  };
  rec.f("location", dir); rec.f("hklm-keys", yes(pushed.keys)); rec.f("shortcuts-to-program", yes(pushed.links));
  rec.f("machine-link", yes(pushed.link)); rec.f("system-hkcu-clean", yes(pushed.sysClean));
  const pushOk = push.code === 0 && pushed.keys && pushed.folder && pushed.links && pushed.link && pushed.sysClean;
  if (!pushOk) {
    rec.end(false, "the push as SYSTEM: exit " + (push.timedOut ? "none within 15 min" : push.code) + ", HKLM keys " + yes(pushed.keys)
      + ", in the default folder " + yes(pushed.folder) + ", shortcuts to the program " + yes(pushed.links) + ", the link " + yes(pushed.link)
      + ", SYSTEM's HKCU clean " + yes(pushed.sysClean));
    return;
  }

  /* 2. The first start by a person who never installed it. */
  const name = "etst" + crypto.randomInt(10000, 99999);
  let secret = "Aa1!" + crypto.randomBytes(24).toString("base64");
  rec.after("account", () => ps("rmuser", ["-Name", name]));
  const made = ps("mkuser", ["-Name", name], { LEG_PW: secret });
  if (made !== "made") { secret = null; throw new NoVerdict("a standard account could not be made: " + made); }
  const right = ps("batchright", ["-Name", name]);
  rec.f("batch-right", right);
  if (right !== "granted") { secret = null; throw new NoVerdict("the second account could not be given the batch-logon right its task needs: " + right); }
  const fromMenu = lnkTarget(path.join(PLACES.commonPrograms, SHORTCUT));
  const task = "etst-push-" + name;
  rec.after("task", () => ps("unreg", ["-Task", task]));
  rec.after("person-copy", () => { const left = procsOf(exe).filter((p) => String(p.user).toLowerCase() === name.toLowerCase());
    return left.length ? left.map((p) => p.pid + " " + E.killTree(p.pid).killed).join(",") : "had ended"; });
  const t2 = Date.now();
  const started = ps("runplain", ["-Task", task, "-Name", name, "-Exe", fromMenu], { LEG_PW: secret });
  secret = null;
  if (started !== "started") throw new NoVerdict("the program the Start-menu shortcut names could not be started as the second account: " + started);
  const wantSample = E.sha256(SAMPLE);
  let profile = "", copies = [], sampleSaid = "absent", deskSaid = "absent", firstSeconds = -1;
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    copies = procsOf(exe).filter((p) => String(p.user).toLowerCase() === name.toLowerCase());
    if (!profile) { const p = ps("profileof", ["-Name", name]); if (/^[A-Za-z]:\\/.test(p)) profile = p; }
    if (!profile) continue;
    const sample = path.join(profile, "Documents", "Etiuda", path.basename(SAMPLE));
    const desk = path.join(profile, "AppData", "Roaming", T.packageName, "desk.json");
    sampleSaid = !fs.existsSync(sample) ? "absent" : shaOr(sample) === wantSample ? "same" : "differs";
    deskSaid = !fs.existsSync(desk) ? "absent" : (() => { try { return /"e~sampled"/.test(fs.readFileSync(desk, "utf8")) ? "sampled" : "unmarked"; } catch (e) { return "unreadable"; } })();
    if (sampleSaid === "same" && deskSaid === "sampled" && copies.length) { firstSeconds = Math.round((Date.now() - t2) / 1000); break; }
  }
  rec.f("menu-target", fromMenu); rec.f("person-copies", copies.length); rec.f("profile", profile ? "made" : "none");
  rec.f("first-run-sample", sampleSaid); rec.f("first-run-desk", deskSaid); rec.f("first-run-seconds", firstSeconds);
  const firstOk = samePath(fromMenu, exe) && firstSeconds >= 0;
  if (!firstOk) {
    rec.end(false, "pushed as SYSTEM, but the person's first start: the menu names the program " + yes(samePath(fromMenu, exe)) + ", copies running as the person "
      + copies.length + ", the sample in their Documents " + sampleSaid + ", their desk.json " + deskSaid + " (task " + ps("taskinfo", ["-Task", task]) + ")");
    return;
  }

  /* 3. The removal, as SYSTEM, from the entry's own uninstaller, once the person's copy is stopped by pid. */
  const stopped = copies.map((p) => p.pid + " " + E.killTree(p.pid).killed).join(",");
  rec.f("person-copy-stopped", stopped);
  for (let i = 0; i < 15 && procsOf(exe).length; i++) await sleep(1000);
  const un = exeOf(valueOf(regKey(KM.uninstall), "UninstallString"));
  if (!un || !fs.existsSync(un)) throw new NoVerdict("the HKLM entry names no uninstaller that exists (" + JSON.stringify(un) + ")");
  const t3 = Date.now();
  const removal = await systemTask(rec, "unpush", ['"' + un + '" ' + P.uninstallArgs("machine").join(" ")], 600000);
  const goneIn = await goneWithin(want, 120);
  rec.f("removal-exit", removal.timedOut ? "timeout" : removal.code); rec.f("removal-seconds", Math.round((Date.now() - t3) / 1000));
  rec.f("folder-gone-s", goneIn);
  const extLeft = EXT_KEYS.filter(present);
  const left = { keys: KEYS.filter(present).map(keyName), links: commonLinks().filter((f) => fs.existsSync(f)), link: present(MACHINE_LINK) };
  rec.f("keys-left", left.keys.length ? few(left.keys) : 0); rec.f("ext-key-left", extLeft.length ? extLeft.map(keyName).join(",") : "none");
  rec.f("shortcuts-left", left.links.length); rec.f("machine-link-left", yes(left.link));
  rec.f("person-data-kept", yes(fs.existsSync(path.join(profile, "Documents", "Etiuda")) && fs.existsSync(path.join(profile, "AppData", "Roaming", T.packageName))));
  const removedOk = removal.code === 0 && goneIn > 0 && !left.keys.length && !left.links.length && !left.link;
  rec.end(removedOk, removedOk
    ? "pushed as SYSTEM into " + want + ", started by a standard account from the Start menu whose first run wrote its own Documents and AppData in " + firstSeconds
      + " s, then removed as SYSTEM whole (folder gone in " + goneIn + " s)"
    : "pushed and started, but the removal as SYSTEM: exit " + (removal.timedOut ? "none within 10 min" : removal.code) + ", folder gone " + yes(goneIn > 0)
      + ", keys left " + left.keys.length + ", shortcuts left " + left.links.length + ", the link left " + yes(left.link));
}

/* ---- (h) ext-claimed: the extension key another program claimed after us stays theirs -------------------------------
   The all-users install, then another program's claim written as such a program writes it: the default of HKLM's
   Software\Classes\.<ext> set to its own class. The uninstall, from the entry, then must take our class and our OpenWithProgids
   value and leave that key with the other program's default as it stands. Green where it does; the sweep then takes the key. */
const OTHER_CLASS = "Other.Program." + T.ext;
const defaultOf = (k) => { const r = G.regQuery(k); return r.present ? G.regValues(r.text)["(Default)"] || "" : null; };
async function extClaimed(rec) {
  const dir = await installMachine(rec, NEWER, "install");
  const ext = EXT_KEYS[0], ours = "HKLM\\Software\\Classes\\" + T.catalogClass;
  rec.f("default-after-install", defaultOf(ext));
  const w = spawnSync("reg", ["add", ext, "/ve", "/d", OTHER_CLASS, "/f", "/reg:64"], { encoding: "utf8", windowsHide: true, timeout: 30000 });
  if (w.status !== 0 || defaultOf(ext) !== OTHER_CLASS) throw new NoVerdict("the other program's claim could not be written: " + oneLine(w.stderr || w.stdout));
  const un = exeOf(valueOf(regKey(KM.uninstall), "UninstallString"));
  if (!un || !fs.existsSync(un)) throw new NoVerdict("the HKLM entry names no uninstaller that exists (" + JSON.stringify(un) + ")");
  const r = await runExe(un, P.uninstallArgs("machine"), 300000);
  const goneIn = await goneWithin(dir, 120);
  const progids = G.regQuery(ext + "\\OpenWithProgids");
  const after = { kept: present(ext), def: defaultOf(ext), ours: present(ours), progid: progids.present && T.catalogClass in G.regValues(progids.text) };
  rec.f("uninstall-exit", r.code); rec.f("folder-gone-s", goneIn); rec.f("ext-kept", yes(after.kept)); rec.f("ext-default", after.def);
  rec.f("our-class-left", yes(after.ours)); rec.f("our-progid-left", yes(after.progid));
  const ok = r.code === 0 && goneIn > 0 && after.kept && after.def === OTHER_CLASS && !after.ours && !after.progid;
  rec.end(ok, ok ? "another program's claim on ." + T.ext + " survived the uninstall as it stood, and our class and our OpenWithProgids value went"
    : "after the uninstall: exit " + r.code + ", folder gone " + yes(goneIn > 0) + ", ." + T.ext + " kept " + yes(after.kept) + " with default "
      + JSON.stringify(after.def) + " (" + OTHER_CLASS + " wanted), our class left " + yes(after.ours) + ", our OpenWithProgids value left " + yes(after.progid));
}

/* ---- ts-cycle: the Test Service build over the ordinary one, and back ---------------------------------------------- */

/* Claude α's criterion of 2026-11-13, through the lead engineer: after the ordinary build, then the Test Service build, then the
   ordinary build again, each for one account, red where anything in the user-data folder is lost, moved or unread, or a second
   Apps entry or shortcut is left behind. Both builds are the test identity's (the config tsSetup writes puts the Test
   Service config on the ordinary test build), and the lab file is invented: the same staging service address and placeholder
   client ids tests/test-service.mjs holds, so nothing of Max's reaches the runner. "Read" is measured by the first run's own
   mark: the sample a first run writes into Documents\Etiuda is taken away before each later start, and a copy that read its
   desk.json (which carries "e~sampled") does not write it again. */
const TS_SUFFIX = " Test Service";
const TS_LAB = { service: "https://etiuda.dev/licence-staging/v1/",
  clientIds: { microsoft: "11111111-2222-3333-4444-555555555555", google: "1234567890-abcdefghij.apps.googleusercontent.com" },
  order: "https://etiuda.dev/buy-staging/" };
const userDir = () => valueOf(regKey(KU.install), "InstallLocation");
const userLinks = (name) => [path.join(PLACES.desktop, name), path.join(PLACES.programs, name)];
/* Every per-user uninstall entry whose display name names the test build, by key: the Apps list's rows for it. */
function appsRows() {
  const r = spawnSync("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall", "/s", "/f", PRODUCT, "/d"],
    { encoding: "utf8", windowsHide: true, timeout: 30000 });
  return String(r.stdout || "").split(/\r?\n/).filter((l) => /^HKEY_/.test(l)).map((l) => l.trim());
}
/** The Test Service test build, made once: the ordinary test build's tree, packed again with the composed config. */
let TS_SETUP = "";
function tsSetup(rec) {
  if (TS_SETUP) return TS_SETUP;
  const out = path.join(LAB, "dist-ts"), lab = path.join(LAB, "ts-lab.json"), cfg = path.join(LAB, "test-service-qa.cjs");
  fs.writeFileSync(lab, JSON.stringify(TS_LAB));
  /* THE TEST SERVICE BUILD UNDER THE TEST IDENTITY, written here because the workflow carries only this folder's named .mjs files
     into the checkout. tools/test-identity.cjs refuses a base whose product name is not the shipped one, and the Test Service
     config renames it, so electron-builder.js's order (the Test Service inside, the identity outside) cannot be used: the test
     identity's config is loaded with the variable unset, and the Test Service config goes on top. It then differs from the
     ordinary test build exactly as the shipped Test Service build differs from the shipped one: the product name with the
     suffix, the same program file and package name (so the same user-data folder), the fields in the asar, the installer's
     name and shortcut. */
  fs.writeFileSync(cfg, ['"use strict";',
    "const VAR = \"ETIUDA_PACK_TEST_SERVICE\", lab = process.env[VAR];",
    "if (!lab) throw new Error(\"ts-cycle's config: \" + VAR + \" names no lab file\");",
    "delete process.env[VAR];",
    "let base;",
    "try { base = require(" + JSON.stringify(path.join(ROOT, "tools", "electron-builder-test.cjs")) + "); } finally { process.env[VAR] = lab; }",
    "module.exports = require(" + JSON.stringify(path.join(ROOT, "tools", "test-service.cjs")) + ").testServiceConfig(base, process.env, " + JSON.stringify(ROOT) + ");",
    ""].join("\n"));
  const cli = path.join(ROOT, "node_modules", "electron-builder", "out", "cli", "cli.js");
  const t0 = Date.now();
  try {
    execFileSync(process.execPath, [cli, "--win", "--config", cfg],
      { cwd: ROOT, stdio: "inherit", env: E.unsignedEnv({ ETIUDA_DIST: out, ETIUDA_PACK_TEST_SERVICE: lab }) });
  } catch (e) { throw new NoVerdict("the Test Service test build could not be built: " + oneLine(e.message)); }
  const found = fs.readdirSync(out).filter((n) => /-setup\.exe$/i.test(n));
  if (found.length !== 1) throw new NoVerdict(out + " holds " + found.length + " installers; expected 1");
  const exe = path.join(out, found[0]);
  /* The guard's own test, with the one rename this build makes: the test app id, the test product name with the suffix, and
     nothing of a shipped app's. */
  const id = G.setupIdentity(exe);
  const shipped = Object.values(require(path.join(ROOT, "tools", "test-identity.cjs")).SHIPPED)
    .find((s) => s.productName === id.productName || s.appId === id.appId);
  if (shipped || id.appId !== T.appId || id.productName !== PRODUCT + TS_SUFFIX)
    throw new NoVerdict("the Test Service test setup names " + JSON.stringify(id.productName) + " and app id " + JSON.stringify(id.appId || null)
      + ", not " + PRODUCT + TS_SUFFIX + " / " + T.appId);
  const ts = require(path.join(ROOT, "tools", "test-service.cjs"));
  const fields = ts.asarPackage(path.join(out, "win-unpacked", "resources", "app.asar"));
  if (!fields || !fields[ts.TEST_SERVICE_KEY]) throw new NoVerdict("the Test Service test build's asar carries no " + ts.TEST_SERVICE_KEY);
  rec.f("ts-built-s", Math.round((Date.now() - t0) / 1000)); rec.f("ts-setup", found[0]);
  TS_SETUP = exe;
  return exe;
}
/* The per-user copy uninstalled from its own entry, then the sweep; the user-data folder is left, as a person's uninstall leaves it. */
async function uninstallUser() {
  const said = [];
  const dir = userDir();
  const un = exeOf(valueOf(regKey(KU.uninstall), "UninstallString")) || (dir ? path.join(dir, UNINSTALLER) : "");
  if (un && fs.existsSync(un)) {
    const r = await runExe(un, P.uninstallArgs("user"), 300000);
    const g = dir ? await goneWithin(dir, 120) : 0;
    said.push("uninstaller exit " + r.code + ", " + (g > 0 ? "folder gone in " + g + " s" : "folder still there"));
  } else said.push("nothing registered for this account");
  const took = sweep();
  for (const n of [SHORTCUT, PRODUCT + TS_SUFFIX + ".lnk"]) for (const f of userLinks(n)) if (fs.existsSync(f)) { try { fs.unlinkSync(f); took.push(f); } catch (e) { took.push(f + "(refused)"); } }
  if (took.length) said.push("swept " + took.join(","));
  return said.join("; ");
}

async function tsCycle(rec) {
  const wall = E.windowWallRefusal(WHO);
  if (wall) throw new NoVerdict("the leg starts each installed build and the window wall refuses: " + wall[0]);
  if (!process.env.APPDATA || !PLACES.desktop || !PLACES.programs) throw new NoVerdict("this account's AppData, Desktop or Programs folder cannot be named");
  const ts = tsSetup(rec);
  const ud = path.join(process.env.APPDATA, T.packageName);
  /* Documents confined to the lab, as the launch door wants: an installed copy honours ETIUDA_TEST_DOCUMENTS only beside
     ETIUDA_TEST_DEVTOOLS=1 (shell/main.js TEST_DOOR), so every start carries both. */
  const docsRoot = path.join(LAB, "documents");
  const docs = path.join(docsRoot, "Etiuda"), sample = path.join(docs, path.basename(SAMPLE));
  const desk = path.join(ud, "desk.json"), marker = path.join(ud, "ts-cycle-marker.bin");
  for (const p of [ud, docs]) if (fs.existsSync(p)) throw new NoVerdict(p + " is already there, so this account is not a fresh one to measure");
  fs.mkdirSync(docsRoot, { recursive: true }); /* the launch door wants the confined Documents to be a folder before the start */
  rec.after("uninstall", uninstallUser);
  const VOLATILE = /^(cache|code cache|gpucache|dawn[^\\]*|shared dictionary|crashpad|blob_storage|network|service worker)(\\|$)/;
  const steady = (m) => Object.fromEntries(Object.entries(m).filter(([k]) => !VOLATILE.test(k)));
  const ORD_LNK = SHORTCUT, TS_LNK = PRODUCT + TS_SUFFIX + ".lnk";

  const install = async (exe, tag, wantName, wantLnk, notLnk) => {
    const args = P.installArgs({ mode: "user" });
    const bad = P.argsFault(args, "user");
    if (bad) throw new Error("refusing " + args.join(" ") + ": " + bad);
    const r = await runExe(exe, args, 600000);
    const dir = userDir(), prog = dir ? path.join(dir, PRODUCT + ".exe") : "";
    const rows = appsRows();
    const shown = valueOf(regKey(KU.uninstall), "DisplayName");
    const wantLinks = userLinks(wantLnk).filter((f) => fs.existsSync(f));
    const strayLinks = userLinks(notLnk).filter((f) => fs.existsSync(f));
    const linksOk = wantLinks.length > 0 && wantLinks.every((f) => samePath(lnkTarget(f), prog));
    const pkg = require(path.join(ROOT, "tools", "test-service.cjs")).asarPackage(path.join(dir || "", "resources", "app.asar"));
    const carries = !!(pkg && pkg.etiudaTestService);
    rec.f(tag + "-exit", r.timedOut ? "timeout" : r.code); rec.f(tag + "-dir", dir); rec.f(tag + "-apps-rows", rows.length);
    rec.f(tag + "-shown", shown); rec.f(tag + "-links", wantLinks.length); rec.f(tag + "-stray-links", strayLinks.length); rec.f(tag + "-fields", yes(carries));
    return { ok: r.code === 0 && !!prog && fs.existsSync(prog) && rows.length === 1 && shown === wantName && linksOk && !strayLinks.length,
      dir, prog, carries, why: "exit " + r.code + ", the program there " + yes(!!prog && fs.existsSync(prog)) + ", Apps rows " + rows.length
        + ", the row says " + JSON.stringify(shown) + " (want " + JSON.stringify(wantName) + "), its shortcuts to it " + yes(linksOk)
        + ", the other build's shortcuts left " + strayLinks.length };
  };
  /* One start of the installed program as this account, stopped by pid once `done` holds or 90 s pass. Its user-data folder is
     named, as the one Electron picks for this package by its own rule (%APPDATA%\<package name>), because the launch door refuses
     a start that leaves it to the machine (first ts-cycle run with the config in place, 2026-11-13). */
  const start = async (prog, tag, done) => {
    const opts = { stdio: "ignore", windowsHide: true, env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: docsRoot, ETIUDA_TEST_DEVTOOLS: "1" }) };
    const args = ["--user-data-dir=" + ud];
    const no = E.shellLaunchRefusal(WHO, args, opts);
    if (no) throw new NoVerdict("the start is refused: " + no[0]);
    const child = E.shellLaunch(WHO, prog, args, opts);
    let gone = false;
    child.on("exit", () => { gone = true; });
    let held = false, s = -1;
    const t0 = Date.now();
    for (let i = 0; i < 45 && !gone; i++) { await sleep(2000); if (done()) { held = true; s = Math.round((Date.now() - t0) / 1000); break; } }
    if (!gone) E.killTree(child.pid);
    for (const p of procsOf(prog)) E.killTree(p.pid);
    for (let i = 0; i < 15 && procsOf(prog).length; i++) await sleep(1000);
    rec.f(tag + "-start-s", s); rec.f(tag + "-ran", yes(!gone || held));
    return { held, ran: !gone || held };
  };
  const sampled = () => { try { return /"e~sampled"/.test(fs.readFileSync(desk, "utf8")); } catch (e) { return false; } };

  /* 1. The ordinary build, and its first run. */
  const a = await install(NEWER, "ordinary", PRODUCT, ORD_LNK, TS_LNK);
  if (!a.ok) { rec.end(false, "the ordinary build: " + a.why); return; }
  const firstOk = (await start(a.prog, "first", () => sampled() && fs.existsSync(sample) && shaOr(sample) === E.sha256(SAMPLE))).held;
  if (!firstOk) throw new NoVerdict("the ordinary build's first run did not write desk.json with its mark and the sample, so there is no data to carry");
  fs.writeFileSync(marker, crypto.randomBytes(4096));
  const markSha = E.sha256(marker);
  const before = steady(manifest(ud));
  rec.f("userdata-files", Object.keys(before).length);

  /* The data after an install and a start: nothing of `before` gone, the marker byte for byte, the mark read (no sample again). */
  const carried = async (tag, prog) => {
    if (fs.existsSync(sample)) fs.unlinkSync(sample); /* gone already where the step before read the mark and wrote none */
    /* The full 90 s, the copy staying up through them: a re-written sample is the fault, so its absence takes the whole wait
       (the fifth dispatch, 2026-11-13, read this wait's never-met condition as "did not run"). */
    const ran = (await start(prog, tag, () => false)).ran;
    const now = steady(manifest(ud));
    const gone = Object.keys(before).filter((k) => !(k in now));
    const markerSame = shaOr(marker) === markSha;
    const reSampled = fs.existsSync(sample);
    rec.f(tag + "-gone", gone.length ? few(gone) : 0); rec.f(tag + "-marker", markerSame ? "same" : "differs"); rec.f(tag + "-resampled", yes(reSampled));
    return { ok: ran && !gone.length && markerSame && !reSampled && sampled(),
      why: "it ran " + yes(ran) + ", files of the first run gone " + gone.length + (gone.length ? " (" + few(gone) + ")" : "") + ", the marker " + (markerSame ? "same" : "differs")
        + ", the sample written again " + yes(reSampled) + ", desk.json still marked " + yes(sampled()) };
  };

  /* 2. The Test Service build over it. */
  const b = await install(ts, "ts", PRODUCT + TS_SUFFIX, TS_LNK, ORD_LNK);
  const bSame = samePath(b.dir, a.dir);
  rec.f("ts-same-folder", yes(bSame));
  if (!b.ok || !bSame || !b.carries) { rec.end(false, "the Test Service build over the ordinary one: " + b.why + ", the same folder " + yes(bSame) + ", the fields in its asar " + yes(b.carries)); return; }
  const bData = await carried("ts", b.prog);
  if (!bData.ok) { rec.end(false, "the Test Service build over the ordinary one installed, but its start and the data: " + bData.why); return; }

  /* 3. The ordinary build again. */
  const c = await install(NEWER, "back", PRODUCT, ORD_LNK, TS_LNK);
  const cSame = samePath(c.dir, a.dir);
  rec.f("back-same-folder", yes(cSame));
  if (!c.ok || !cSame || c.carries) { rec.end(false, "the ordinary build over the Test Service one: " + c.why + ", the same folder " + yes(cSame) + ", the fields gone from its asar " + yes(!c.carries)); return; }
  const cData = await carried("back", c.prog);
  rec.end(cData.ok, cData.ok
    ? "ordinary, then Test Service, then ordinary, each into " + a.dir + " with one Apps row naming it and its own shortcuts alone; the user-data folder carried whole (marker byte for byte, nothing of the first run gone) and read by each start (no second sample)"
    : "back on the ordinary build, its start and the data: " + cData.why);
}

/* ---- shipped-detect: the README's detection rule, on the shipped identity ---------------------------------------- */

/* Claude α's corporate-readiness list, row 2b (2026-11-13): "the detection rule proven on the shipped identity". Every other leg
   installs the test identity, which the install guard alone admits, since on a desk the shipped identity's install would write
   and its uninstall remove what the real install owns. On a hosted runner nothing real is installed: the wall above has already
   held (the sentinel absent, GITHUB_ACTIONS and the hosted runner's variables, the guard finding neither shipped app), so this
   leg alone builds and installs the shipped identity, all users, and reads the rule the README gives in its own words:
   DisplayVersion under HKLM's Uninstall key named by the app id's GUID, in the 64-bit view; InstallLocation beside it the
   folder; the QuietUninstallString the README writes out; and, after the uninstall that string names, the rule finding nothing.
   The README's GUID is read from the README itself and must be the one the shipped app id gives. The guard's end comparison
   (the whole run's last line) is the net: every shipped place reads as before. */
const SHIPPED = require(path.join(ROOT, "tools", "test-identity.cjs")).SHIPPED.desk;
const S_GUID = P.appGuid(SHIPPED.appId), SKM = P.registryKeys("machine", S_GUID);
const S_KEYS = [SKM.uninstall, SKM.install].map(regKey)
  .concat([SHIPPED.scheme, "." + SHIPPED.ext, SHIPPED.catalogClass].map((n) => "HKLM\\Software\\Classes\\" + n));
function shippedSweep() {
  const took = [];
  for (const k of S_KEYS) {
    if (!present(k)) continue;
    const r = spawnSync("reg", ["delete", k, "/f", "/reg:64"], { encoding: "utf8", windowsHide: true, timeout: 30000 });
    took.push(k.replace(/^.*\\/, "") + (r.status === 0 ? "" : "(refused)"));
  }
  for (const f of [path.join(PLACES.commonDesktop, SHIPPED.productName + ".lnk"), path.join(PLACES.commonPrograms, SHIPPED.productName + ".lnk")])
    if (fs.existsSync(f)) { try { fs.unlinkSync(f); took.push(f); } catch (e) { took.push(f + "(refused)"); } }
  return took;
}
async function shippedDetect(rec) {
  /* The README's own rule, its GUID and its quiet uninstall string, read from the file as it stands. */
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const said = /Uninstall\\([0-9a-f-]{36})`/.exec(readme), saidGuid = said ? said[1] : "";
  const quietSaid = (/`("C:\\Program Files\\[^`]+)`/.exec(readme) || [])[1] || "";
  rec.f("readme-guid", saidGuid || "none"); rec.f("guid-of-app-id", S_GUID);
  if (saidGuid !== S_GUID) { rec.end(false, "the README's detection key names " + JSON.stringify(saidGuid) + ", not the shipped app id's GUID " + S_GUID); return; }
  for (const k of S_KEYS) if (present(k)) throw new NoVerdict("the shipped identity is already registered here (" + k + "), so this is no clean runner");

  /* The shipped build: the same tree, packed without the test identity, unsigned. */
  const out = path.join(LAB, "dist-shipped");
  /* electron-builder directly, with publishing off: on a hosted runner it publishes by itself where nothing says otherwise
     ("Implicit publishing triggered by CI detection"), and the shipped config, unlike the test identity's, names no publish: null
     (the first dispatch, 2026-11-13: the installer was made, then the build stopped for want of a GitHub token). The pack step
     package.mjs adds (turning.7z, the NSIS template patches) has already run in this job for the test build, on this tree. */
  try {
    execFileSync(process.execPath, [path.join(ROOT, "node_modules", "electron-builder", "out", "cli", "cli.js"), "--win", "--publish", "never"],
      { cwd: ROOT, stdio: "inherit", env: E.unsignedEnv({ ETIUDA_DIST: out }) });
  } catch (e) { throw new NoVerdict("the shipped build could not be made: " + oneLine(e.message)); }
  const found = fs.readdirSync(out).filter((n) => /-setup\.exe$/i.test(n));
  if (found.length !== 1) throw new NoVerdict(out + " holds " + found.length + " installers; expected 1");
  const setup = path.join(out, found[0]), id = G.setupIdentity(setup);
  rec.f("setup", found[0]);
  if (id.productName !== SHIPPED.productName || id.appId) throw new NoVerdict("the built setup is not the shipped identity: " + JSON.stringify(id));

  rec.after("shipped-uninstall", async () => {
    const said2 = [];
    const loc = valueOf(regKey(SKM.install), "InstallLocation") || valueOf(regKey(SKM.uninstall), "InstallLocation");
    const un = exeOf(valueOf(regKey(SKM.uninstall), "UninstallString"));
    if (un && fs.existsSync(un)) {
      const r = await runExe(un, P.uninstallArgs("machine"), 300000);
      said2.push("uninstaller exit " + r.code + (loc ? ", folder gone " + yes((await goneWithin(loc, 120)) > 0) : ""));
    }
    const took = shippedSweep();
    if (took.length) said2.push("swept " + took.join(","));
    return said2.join("; ") || "nothing of the shipped identity was left";
  });
  const args = P.installArgs({ mode: "machine" });
  const r = await runExe(setup, args, 600000);
  rec.f("install-exit", r.timedOut ? "timeout" : r.code);
  const version = valueOf(regKey(SKM.uninstall), "DisplayVersion");
  const loc = valueOf(regKey(SKM.uninstall), "InstallLocation");
  const quiet = valueOf(regKey(SKM.uninstall), "QuietUninstallString");
  const prog = loc ? path.join(loc, SHIPPED.productName + ".exe") : "";
  rec.f("display-version", version); rec.f("install-location", loc); rec.f("quiet-uninstall", quiet);
  const found1 = r.code === 0 && !!version && !!prog && fs.existsSync(prog);
  const quietOk = !!quietSaid && quiet === quietSaid;
  if (!found1 || !quietOk) {
    rec.end(false, "after the all-users install (exit " + r.code + "): DisplayVersion " + JSON.stringify(version) + ", InstallLocation "
      + JSON.stringify(loc) + " holding the program " + yes(!!prog && fs.existsSync(prog)) + ", QuietUninstallString " + JSON.stringify(quiet)
      + (quietOk ? "" : " where the README says " + JSON.stringify(quietSaid)));
    return;
  }
  /* The uninstall a deployment tool runs: the QuietUninstallString as written, its program and its arguments. */
  const qExe = exeOf(quiet), qArgs = quiet.slice(quiet.indexOf('"', 1) + 1).trim().split(/\s+/).filter(Boolean);
  const u = await runExe(qExe, qArgs, 300000);
  const goneIn = await goneWithin(loc, 120);
  const after = present(regKey(SKM.uninstall)) ? valueOf(regKey(SKM.uninstall), "DisplayVersion") : "";
  rec.f("uninstall-exit", u.code); rec.f("folder-gone-s", goneIn); rec.f("rule-after", after ? "still finds " + after : "finds nothing");
  const ok = u.code === 0 && goneIn > 0 && !after;
  rec.end(ok, ok
    ? "the shipped identity, all users: the README's rule finds DisplayVersion " + version + " under Uninstall\\" + S_GUID + " (its GUID the app id's),"
      + " InstallLocation " + loc + " holding the program, the QuietUninstallString exactly the README's; that string uninstalls (exit 0, folder gone in "
      + goneIn + " s) and the rule then finds nothing"
    : "the uninstall the QuietUninstallString names: exit " + u.code + ", folder gone " + yes(goneIn > 0) + ", the rule afterwards " + (after ? "still finds " + after : "finds nothing"));
}

/* ---- nonpersistent: a profile reset between sessions, measured ----------------------------------------------------- */

/* Claude α's corporate-readiness list, row 6d (2026-11-13): "a non-persistent profile measured", against the folder list of
   state/briefs/lead-engineer-gamma-4prime-2026-11-13-data-flow-facts.md table 3 (6b). The program installed for all users, as
   that table advises; Documents kept as a redirected folder keeps it; the profile's data folder lost between sessions:
     (A) the whole user-data folder gone, as a non-persistent desktop discards it at logoff;
     (B) Local State alone gone, desk.json kept, as where the profile roams but the sealing key's wrap does not.
   Green only where the desk starts in every session and the person's Documents come through byte for byte (their own catalog
   and the first run's sample, neither changed nor duplicated). What is lost is recorded, never judged: the desk's id after each
   reset, a desk file set aside as unreadable, and whether the first run's sample was written again. */
async function nonPersistent(rec) {
  const wall = E.windowWallRefusal(WHO);
  if (wall) throw new NoVerdict("the leg starts the installed desk and the window wall refuses: " + wall[0]);
  if (!process.env.APPDATA) throw new NoVerdict("APPDATA is not set, so the profile's data folder cannot be named");
  const dir = await installMachine(rec, NEWER, "install");
  const prog = path.join(dir, PRODUCT + ".exe");
  const ud = path.join(process.env.APPDATA, T.packageName), docsRoot = path.join(LAB, "np-documents"), docs = path.join(docsRoot, "Etiuda");
  if (fs.existsSync(ud)) throw new NoVerdict(ud + " is already there, so this account is not a fresh one to measure");
  fs.mkdirSync(docsRoot, { recursive: true });
  /* Every aside sits beside the profile on its own drive, never in the lab: the lab is on D: on a hosted runner and APPDATA on C:,
     and a rename does not cross drives (EXDEV, first dispatch 43495740245). */
  const aside = (tag) => path.join(process.env.APPDATA, "etiuda-np-" + tag + "-" + process.pid);
  rec.after("profile", () => { try { if (fs.existsSync(ud)) fs.renameSync(ud, aside("left")); return "moved aside"; } catch (e) { return "left: " + e.code; } });
  const deskFile = path.join(ud, "desk.json"), sample = path.join(docs, path.basename(SAMPLE));
  const deskId = () => { try { const d = JSON.parse(fs.readFileSync(deskFile, "utf8")); return typeof d.desk === "string" ? d.desk : ""; } catch (e) { return ""; } };
  const sampled = () => { try { return /"e~sampled"/.test(fs.readFileSync(deskFile, "utf8")); } catch (e) { return false; } };
  const unread = () => { try { return fs.readdirSync(ud).filter((n) => /^desk\.unread-[0-9a-f]+\.json$/.test(n)).length; } catch (e) { return 0; } };
  /* One session: the installed program, its user-data folder the one Electron's own rule picks, stopped by pid once `done` holds
     and the copy has stayed up a further 10 s, or 90 s pass. */
  const session = async (tag, done) => {
    const opts = { stdio: "ignore", windowsHide: true, env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: docsRoot, ETIUDA_TEST_DEVTOOLS: "1" }) };
    const args = ["--user-data-dir=" + ud];
    const no = E.shellLaunchRefusal(WHO, args, opts);
    if (no) throw new NoVerdict("the start is refused: " + no[0]);
    const t0 = Date.now(), child = E.shellLaunch(WHO, prog, args, opts);
    let gone = false, code = null;
    child.on("exit", (c) => { gone = true; code = c; });
    let held = -1;
    for (let i = 0; i < 45 && !gone; i++) { await sleep(2000); if (done()) { held = Math.round((Date.now() - t0) / 1000); break; } }
    if (held >= 0) for (let i = 0; i < 5 && !gone; i++) await sleep(2000);
    const up = !gone;
    if (!gone) E.killTree(child.pid);
    for (const p of procsOf(prog)) E.killTree(p.pid);
    for (let i = 0; i < 15 && procsOf(prog).length; i++) await sleep(1000);
    rec.f(tag + "-started", yes(up)); rec.f(tag + "-ready-s", held); if (!up) rec.f(tag + "-exit", code);
    return { up, ready: held >= 0 };
  };

  /* Session 1: a fresh profile; the first run writes the sample and desk.json. Then the person's own catalog beside it. */
  const s1 = await session("s1", () => sampled() && fs.existsSync(sample) && !!deskId());
  if (!s1.ready) throw new NoVerdict("the first session did not write desk.json with its mark and the sample, so there is nothing to carry");
  const id1 = deskId(), mine = path.join(docs, "my-own-catalog.ec");
  fs.copyFileSync(SAMPLE, mine);
  const docsBefore = manifest(docsRoot);
  rec.f("s1-desk", id1.slice(0, 9));

  /* (A) the whole user-data folder discarded, as at a non-persistent logoff. */
  fs.renameSync(ud, aside("after-s1"));
  const a = await session("a", () => !!deskId());
  const idA = deskId(), docsA = manifest(docsRoot), dA = manifestDiff(docsBefore, docsA);
  rec.f("a-desk", idA ? (idA === id1 ? "same" : "new") : "none"); rec.f("a-docs-changed", dA.changed.length ? few(dA.changed) : 0);
  rec.f("a-docs-gone", dA.gone.length ? few(dA.gone) : 0); rec.f("a-docs-added", dA.added.length ? few(dA.added) : 0); rec.f("a-resampled", yes(sampled()));

  /* (B) Local State alone discarded, desk.json kept: the sealing key's wrap lost, the desk file roaming. */
  const ls = path.join(ud, "Local State");
  const hadLs = fs.existsSync(ls);
  if (hadLs) fs.renameSync(ls, aside("local-state-after-a"));
  rec.f("b-local-state-removed", yes(hadLs));
  const b = await session("b", () => !!deskId());
  const idB = deskId(), docsB = manifest(docsRoot), dB = manifestDiff(docsA, docsB);
  rec.f("b-desk", idB ? (idB === idA ? "same" : "new") : "none"); rec.f("b-unread-set-aside", unread());
  rec.f("b-docs-changed", dB.changed.length ? few(dB.changed) : 0); rec.f("b-docs-gone", dB.gone.length ? few(dB.gone) : 0); rec.f("b-docs-added", dB.added.length ? few(dB.added) : 0);

  const docsOk = !dA.changed.length && !dA.gone.length && !dA.added.length && !dB.changed.length && !dB.gone.length && !dB.added.length;
  const ok = a.up && a.ready && b.up && b.ready && docsOk;
  rec.end(ok, (ok ? "" : "not held: ") + "after the whole user-data folder was discarded the desk started (" + yes(a.up) + "), its id "
    + (idA === id1 ? "the same" : "a new one") + ", the first-run sample written again " + yes(sampled()) + "; after Local State alone was discarded it started ("
    + yes(b.up) + "), its id " + (idB === idA ? "kept" : "new") + ", " + unread() + " desk file(s) set aside as unreadable; the person's Documents unchanged "
    + yes(docsOk) + (docsOk ? "" : " (A: " + few(dA.changed.concat(dA.gone, dA.added)) + "; B: " + few(dB.changed.concat(dB.gone, dB.added)) + ")"));
}

/* ---- net-hosts: every host a desk session reaches, measured -------------------------------------------------------- */

/* The data-flow facts' table 1 (state/briefs/lead-engineer-gamma-4prime-2026-11-13-data-flow-facts.md, row 10b) lists the hosts
   the desk contacts as read from the code; this measures them. One installed session, idle 120 s, witnessed twice: Chromium's own
   net-log (--log-net-log) for what goes through Chromium's stack, the relay's Node socket excepted, and the system's DNS cache,
   emptied before and read after, for both stacks; a window of the same length with no desk running is read first, so the runner's
   own traffic is named and set apart. What a harness start cannot show is said, never inferred: the update look and the sign-in
   renewal are off for every harness start (shell/main.js harnessLaunch), so neither can appear here. Windows' own spell-checker
   asks nothing of Chromium's network; a dictionary download, if one happened, shows as its host in both witnesses. */
async function netHosts(rec) {
  const wall = E.windowWallRefusal(WHO);
  if (wall) throw new NoVerdict("the leg starts the installed desk and the window wall refuses: " + wall[0]);
  if (!process.env.APPDATA) throw new NoVerdict("APPDATA is not set, so the profile's data folder cannot be named");
  const dir = await installMachine(rec, NEWER, "install");
  const prog = path.join(dir, PRODUCT + ".exe");
  const ud = path.join(process.env.APPDATA, T.packageName), docsRoot = path.join(LAB, "nh-documents"), netFile = path.join(LAB, "net-log.json");
  if (fs.existsSync(ud)) throw new NoVerdict(ud + " is already there, so this account is not a fresh one to measure");
  fs.mkdirSync(docsRoot, { recursive: true });
  rec.after("profile", () => { try { if (fs.existsSync(ud)) fs.renameSync(ud, path.join(process.env.APPDATA, "etiuda-nh-left-" + process.pid)); return "moved aside"; } catch (e) { return "left: " + e.code; } });
  const IDLE = 120000;
  const names = (said) => /^refused|^no answer/.test(said) ? null : said.split(/\s+/).filter(Boolean);
  /* The runner's own names in a window as long as the session's, with no desk running. */
  if (ps("dnsclear") !== "cleared") throw new NoVerdict("the DNS cache could not be emptied, so neither window can be read clean");
  await sleep(IDLE);
  const quiet = names(ps("dnsread"));
  if (!quiet) throw new NoVerdict("the DNS cache could not be read");
  const opts = { stdio: "ignore", windowsHide: true, env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: docsRoot, ETIUDA_TEST_DEVTOOLS: "1" }) };
  const args = ["--user-data-dir=" + ud, "--log-net-log=" + netFile];
  const no = E.shellLaunchRefusal(WHO, args, opts);
  if (no) throw new NoVerdict("the start is refused: " + no[0]);
  ps("dnsclear");
  const child = E.shellLaunch(WHO, prog, args, opts);
  let gone = false, code = null;
  child.on("exit", (c) => { gone = true; code = c; });
  for (let t = 0; t < IDLE && !gone; t += 2000) await sleep(2000);
  const up = !gone;
  const busy = names(ps("dnsread")) || [];
  if (!gone) E.killTree(child.pid);
  for (const p of procsOf(prog)) E.killTree(p.pid);
  for (let i = 0; i < 15 && procsOf(prog).length; i++) await sleep(1000);
  rec.f("up-120s", yes(up)); if (!up) rec.f("exit", code);
  /* The net-log, read whole even where the stop left it unclosed: every scheme://host in an event, and every resolver host. */
  let raw = "";
  try { raw = fs.readFileSync(netFile, "utf8"); } catch (e) { rec.f("net-log", "none: " + e.code); }
  const ev = raw.indexOf('"events"') > -1 ? raw.slice(raw.indexOf('"events"')) : "";
  const fromLog = new Set();
  for (const m of ev.matchAll(/"(?:url|original_url|host|origin|host_and_port|server_address)":"(?:[a-z][a-z0-9+.-]*:\/\/)?(\[[^\]"]+\]|[^\/":"]+)/gi)) fromLog.add(m[1].toLowerCase());
  const local = (h) => /^(127\.|\[?::1\]?$|localhost$|0\.0\.0\.0$)/.test(h);
  const logHosts = [...fromLog].filter((h) => h && !local(h)).sort();
  const quietSet = new Set(quiet), dnsHosts = busy.filter((h) => !quietSet.has(h)).sort();
  rec.f("net-log-bytes", raw.length); rec.f("net-log-hosts", logHosts.length ? logHosts.join(",") : 0);
  rec.f("dns-runner-own", quiet.length); rec.f("dns-new-in-session", dnsHosts.length ? dnsHosts.join(",") : 0);
  rec.f("loopback-in-log", yes([...fromLog].some(local)));
  const ok = up && raw.length > 0;
  rec.end(ok, (ok ? "" : "not measured: ") + "an installed desk idle 120 s (harness start: the update look and the renewal off by design) reached, by its net-log, "
    + (logHosts.length ? logHosts.join(", ") : "no host but loopback") + "; the DNS cache saw " + (dnsHosts.length ? dnsHosts.join(", ") : "no name")
    + " beyond the " + quiet.length + " the runner asked for in a quiet window of the same length");
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
  /* Held means another process cannot open it: a second PowerShell's read open, every sharing allowed, refused by the holder's
     no-sharing open. Node's own open is recorded beside it and decides nothing: on the runner it went through a held file while
     the second process was refused for a sharing violation (run 43357213052, cause not named). */
  let openSaid = "opened";
  try { fs.closeSync(fs.openSync(held, "r")); } catch (e) { openSaid = e.code || e.message; }
  const otherSaid = oneLine(ps("tryopen", ["-Target", held]));
  const heldNow = /^refused: /.test(otherSaid) && /being used by another process/i.test(otherSaid);
  let holderSaid = "no word in 30 s";
  try { holderSaid = oneLine(fs.readFileSync(signal, "utf8")) || "an empty word"; } catch { /* none came */ }
  rec.f("held", heldRel); rec.f("held-confirmed", yes(heldNow)); rec.f("holder-said", holderSaid);
  rec.f("holder-running", yes(!holderGone)); rec.f("open-here", openSaid);
  rec.f("open-other-process", otherSaid);
  if (!heldNow) throw new NoVerdict("the file did not stay held (a second process's open: " + otherSaid + "); the holder said "
    + JSON.stringify(holderSaid) + " and was " + (holderGone ? "gone" : "still running"));

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
const LEGS = { "all-upgrade": allUpgrade, "running-1618": running1618, "system-bare": systemBare, "locked-1618": locked1618, "all-move": allMove, "all-space-d": allSpaceD,
  "system-push": systemPush, "ext-claimed": extClaimed, "ts-cycle": tsCycle, "shipped-detect": shippedDetect, "nonpersistent": nonPersistent, "net-hosts": netHosts };

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
