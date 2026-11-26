/* THE FOUR INSTALLER LEGS FOR A HOSTED WINDOWS RUNNER, silent switches, bar uninstall-data, which drives the uninstaller's Remove my data page by window messages.
 *
 *   node tools/runner/installer-legs.mjs --out <dir> [all-upgrade] [running-1618] [system-bare] [locked-1618]
 *                                           on a hosted Windows runner only (see THE WALL); no leg named runs all four
 *   ETIUDA_OLD_SETUP_EXE=<older setup.exe>  version N for all-upgrade and locked-1618; the workflow builds it from an older
 *                                           commit. Unset, or the same bytes as the newer, those two legs give no verdict.
 *
 * THE CRITERION, each leg's own words of 2026-11-11, implemented as they stand; where the runner cannot do a part, the leg says
 * so in its own no-verdict line rather than passing:
 *   all-upgrade   "an all-users upgrade: version N with /allusers, then N+1 with /S. The uninstall entry, the shortcuts and the
 *                 etiuda: link must be intact afterwards, and a marker file planted in the install folder gone". The last clause is
 *                 flipped to kept by the B1 ruling, "an install or an update never removes what it did not put there" (Claude α, 2026-11-22).
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
 *   ts-uninstall  the ordinary build, the Test Service build over it, then the uninstall from the entry: no shortcut of either
 *                 name is left for this account, with the registration's ShortcutName as installed and with it deleted (the
 *                 test architect, 2026-11-17, with the mend of shell/installer.nsh's customUnInstall).
 *   reinstall-no-reboot, reinstall-no-reboot-ask: uninstall, then install again without a reboot, as a person does it, through the
 *                 pages; red on a hang, on a second Setup process or window, or on anything the uninstall left (its block, below).
 *   short-stage, old-copy-kept, pre-own-survives, foreign-folder-refused, per-user-at-sign-in, pf-dotdot: the installer mends'
 *                 legs (B1, B4, B5 and the Program Files ".."), each criterion above its function. Run only where named.
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
const LEG_NAMES = ["all-upgrade", "running-1618", "system-bare", "locked-1618", "all-move", "all-space-d", "system-push", "ext-claimed", "ts-cycle", "ts-uninstall", "shipped-detect", "nonpersistent", "net-hosts",
  "short-stage", "old-copy-kept", "pre-own-survives", "foreign-folder-refused", "per-user-at-sign-in", "pf-dotdot", "uninstall-data", "reinstall-no-reboot", "reinstall-no-reboot-ask"];
/* Run only where named: the installer mends' legs (below), kept out of a run that names no leg. */
const NAMED_ONLY = ["short-stage", "old-copy-kept", "pre-own-survives", "foreign-folder-refused", "per-user-at-sign-in", "pf-dotdot", "uninstall-data", "reinstall-no-reboot", "reinstall-no-reboot-ask"];
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
const CHOSEN = named.length ? LEG_NAMES.filter((n) => named.indexOf(n) > -1) : LEG_NAMES.filter((n) => NAMED_ONLY.indexOf(n) < 0);

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
    markerKept: fs.existsSync(marker),
    asarNew: shaOr(asarAt),
  };
  rec.f("n1-exit", facts.exit); rec.f("dir", dir); rec.f("hklm-entry", yes(facts.entry)); rec.f("uninstaller", yes(facts.uninstaller));
  rec.f("same-folder", yes(facts.location)); rec.f("hkcu-entry", yes(facts.perUser)); rec.f("desktop-link", yes(facts.links[0]));
  rec.f("startmenu-link", yes(facts.links[1])); rec.f(T.scheme + "-link", yes(facts.link)); rec.f("marker-kept", yes(facts.markerKept));
  rec.f("asar", facts.asarNew === asarOld ? "unchanged" : asarTree && facts.asarNew === asarTree ? "this-tree" : "other");
  const ok = facts.exit === 0 && facts.entry && facts.uninstaller && facts.location && !facts.perUser && facts.links.every(Boolean) && facts.link && facts.markerKept;
  rec.end(ok, ok ? "N with /allusers, then N+1 with /S: the all-users entry, both shortcuts and the " + T.scheme + ": link intact, the planted file kept"
    : "after N+1 with /S something is not intact: exit " + facts.exit + ", entry " + yes(facts.entry) + ", uninstaller " + yes(facts.uninstaller)
      + ", shortcuts " + facts.links.map(yes).join("/") + ", link " + yes(facts.link) + ", planted file kept " + yes(facts.markerKept) + ", a per-user entry " + yes(facts.perUser));
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

/* ---- ts-uninstall: the Test Service build over the ordinary one, then its uninstall, leaves no shortcut ------------- */

/* The test architect, 2026-11-17, with the lead engineer's mend 99af1574 (shell/installer.nsh, customUnInstall removes the
   shortcuts of its own build's name). The two builds share one registration key, and the stock uninstaller reads the shortcut's
   name back from that key's ShortcutName, falling back to the ordinary product's where the value is absent; on Max's desk that
   morning an uninstall of the Test Service build left "... Test Service.lnk" on the desktop and in the Start menu. Two passes,
   each for this account, each the order of his use (the ordinary build, the Test Service build over it, then the uninstall
   from the entry's own uninstaller):
     plain     the registration as the installer left it;
     no-name   the registration's ShortcutName value deleted before the uninstall, which is the case that failed.
   A pass holds where, after the uninstall and BEFORE any sweep, neither build's shortcut stands on this account's desktop or
   in its Start menu, the folder is gone and neither per-user key stands. A pass that never had the Test Service shortcut to
   lose gives no verdict. Before the mend the pass no-name is the red one (the stock deletion takes the ordinary name and the
   Test Service shortcut stays); the pass plain shows the mend costs nothing where the value is there. No copy is started, so
   the window wall is not met. What an UPDATE keeps (its own shortcuts, after one build is installed over the other) is
   ts-cycle's and all-upgrade's to hold. */
async function tsUninstall(rec) {
  if (!PLACES.desktop || !PLACES.programs) throw new NoVerdict("this account's Desktop or Programs folder cannot be named");
  const ts = tsSetup(rec);
  rec.after("uninstall", uninstallUser);
  const ORD_LNK = SHORTCUT, TS_LNK = PRODUCT + TS_SUFFIX + ".lnk";
  const there = (name) => userLinks(name).filter((f) => fs.existsSync(f));
  const install = async (exe, tag) => {
    const args = P.installArgs({ mode: "user" });
    const bad = P.argsFault(args, "user");
    if (bad) throw new Error("refusing " + args.join(" ") + ": " + bad);
    const r = await runExe(exe, args, 600000);
    const dir = userDir();
    rec.f(tag + "-exit", r.timedOut ? "timeout" : r.code);
    if (r.code !== 0 || !dir || !fs.existsSync(path.join(dir, PRODUCT + ".exe")))
      throw new NoVerdict(tag + " did not install for this account (exit " + r.code + ", InstallLocation " + JSON.stringify(dir || null) + "), so the pass never reached its subject");
    return dir;
  };
  const pass = async (tag, strip) => {
    await install(NEWER, tag + "-ordinary");
    const dir = await install(ts, tag + "-ts");
    const had = there(TS_LNK), stray = there(ORD_LNK);
    rec.f(tag + "-ts-links", had.length); rec.f(tag + "-ordinary-links-before", stray.length);
    if (!had.length) throw new NoVerdict("pass " + tag + ": the Test Service build over the ordinary one made no shortcut of its own name, so there is none to lose");
    const key = regKey(KU.install);
    const named = valueOf(key, "ShortcutName");
    rec.f(tag + "-registered-name", named);
    if (strip) {
      if (!named) throw new NoVerdict("pass " + tag + ": the registration carries no ShortcutName to take away");
      const d = spawnSync("reg", ["delete", key, "/v", "ShortcutName", "/f"], { encoding: "utf8", windowsHide: true, timeout: 30000 });
      const after = valueOf(key, "ShortcutName");
      rec.f(tag + "-name-deleted", yes(d.status === 0 && !after));
      if (d.status !== 0 || after) throw new NoVerdict("pass " + tag + ": the ShortcutName value could not be deleted (reg exit " + d.status + ")");
    }
    const un = exeOf(valueOf(regKey(KU.uninstall), "UninstallString")) || path.join(dir, UNINSTALLER);
    if (!un || !fs.existsSync(un)) throw new NoVerdict("pass " + tag + ": the entry names no uninstaller that exists (" + JSON.stringify(un) + ")");
    const r = await runExe(un, P.uninstallArgs("user"), 300000);
    const gone = await goneWithin(dir, 120);
    /* Read before anything is swept: what the uninstaller itself left. */
    const leftTs = there(TS_LNK), leftOrd = there(ORD_LNK);
    const keys = [KU.uninstall, KU.install].map(regKey).filter((k) => present(k));
    rec.f(tag + "-un-exit", r.timedOut ? "timeout" : r.code); rec.f(tag + "-folder-gone-s", gone);
    rec.f(tag + "-ts-links-left", leftTs.length ? few(leftTs) : 0); rec.f(tag + "-ordinary-links-left", leftOrd.length ? few(leftOrd) : 0);
    rec.f(tag + "-keys-left", keys.length ? few(keys) : 0);
    const ok = !r.timedOut && gone > 0 && !leftTs.length && !leftOrd.length && !keys.length;
    /* The next pass starts from nothing: what this one left is taken away here, by name, and said. */
    rec.f(tag + "-tidy", oneLine(await uninstallUser()));
    return { ok, why: "pass " + tag + ": uninstaller exit " + (r.timedOut ? "none within 5 min" : r.code) + ", the folder " + (gone > 0 ? "gone" : "still there")
      + ", Test Service shortcuts left " + leftTs.length + " of " + had.length + ", ordinary shortcuts left " + leftOrd.length + ", per-user keys left " + keys.length };
  };
  const plain = await pass("plain", false);
  const bare = await pass("no-name", true);
  rec.end(plain.ok && bare.ok, plain.ok && bare.ok
    ? "the ordinary build, the Test Service build over it, then the uninstall from its entry: no shortcut of either name on the desktop or in the Start menu, the folder and both per-user keys gone, with the registration's ShortcutName as installed and with it deleted"
    : [plain, bare].filter((p) => !p.ok).map((p) => p.why).join("; "));
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
   net-log (--log-net-log, written out only at a clean close) for what goes through Chromium's stack, the relay's Node socket excepted, and the system's DNS cache,
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
  const IDLE = 120000, TYPED = 30000, PORT = 9339;
  const names = (said) => /^refused|^no answer/.test(said) ? null : said.split(/\s+/).filter(Boolean);
  /* The runner's own names in a window as long as the session's, with no desk running. */
  if (ps("dnsclear") !== "cleared") throw new NoVerdict("the DNS cache could not be emptied, so neither window can be read clean");
  await sleep(IDLE + TYPED);
  const quiet = names(ps("dnsread"));
  if (!quiet) throw new NoVerdict("the DNS cache could not be read");
  /* The debugging port is the test door's (ETIUDA_TEST_DEVTOOLS=1, shell/main.js TEST_DOOR): the leg closes the window by
     Browser.close, because Chromium writes the net-log out only at a clean exit and a killed window leaves its list empty
     (tests/desk.js readNetLog), and it types through the same port. */
  const opts = { stdio: "ignore", windowsHide: true, env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: docsRoot, ETIUDA_TEST_DEVTOOLS: "1" }) };
  const args = ["--user-data-dir=" + ud, "--log-net-log=" + netFile, "--remote-debugging-port=" + PORT];
  const no = E.shellLaunchRefusal(WHO, args, opts);
  if (no) throw new NoVerdict("the start is refused: " + no[0]);
  ps("dnsclear");
  const child = E.shellLaunch(WHO, prog, args, opts);
  let gone = false, code = null;
  const exited = new Promise((r) => child.on("exit", (c) => { gone = true; code = c; r(true); }));
  const b = await E.connectShell({ port: PORT, child, waitMs: 60000 });
  for (let t = 0; t < IDLE && !gone; t += 2000) await sleep(2000);
  const upIdle = !gone;
  /* Spell-check: Chromium starts a dictionary's fetch when a field it checks gets focus and text, so an idle desk may not show
     it. A text field with spell-check on, in the desk's own window and renderer, takes an invented line in Polish and one in
     English with misspellings, typed key by key; the reply editor is such a field (spellcheck="true"), reached here without
     driving the editor open. The profile's Dictionaries folder is the third witness: a downloaded dictionary lands there. */
  let typed = "no";
  try {
    const pages = await b.pages();
    const page = pages.find((x) => /etiuda\.html/i.test(x.url())) || pages[0];
    /* THE TEXT GOES IN AS TEXT, NOT AS KEYS (the test architect, 2026-11-21): on the hosted runner at 8700a8e0 the typing ended
       "short", the desk's own key handlers and the seat door's focus taking keys meant for the field. sendCharacter inserts each
       character into the focused field with no keydown, which is what spell-check reads, and the field is focused again before
       each line, so a door that takes focus cannot swallow a line. */
    await page.evaluate(() => { const t = document.createElement("textarea"); t.id = "nhSpell"; t.spellcheck = true; t.style.cssText = "position:fixed;left:8px;top:8px;width:420px;height:80px;z-index:2147483647"; document.body.appendChild(t); t.focus(); });
    for (const line of ["Wczoraj przyjechalem do domu, ale ksiązka zostala w samochodzie. ", "I recieved the parcle yesterday and the adress was rigth. "]) {
      await page.evaluate(() => { const t = document.getElementById("nhSpell"); if (t) t.focus(); });
      for (const ch of line) { await page.keyboard.sendCharacter(ch); await sleep(15); }
    }
    typed = await page.evaluate(() => String((document.getElementById("nhSpell") || {}).value || "").length > 60 ? "yes" : "short");
  } catch (e) { typed = "failed: " + oneLine(String(e && e.message || e)); }
  for (let t = 0; t < TYPED && !gone; t += 2000) await sleep(2000);
  const busy = names(ps("dnsread")) || [];
  let dicts = [];
  try { dicts = fs.readdirSync(path.join(ud, "Dictionaries")); } catch (e) { dicts = []; }
  try { await b.close(); } catch (e) { /* judged by the exit below */ }
  const alone = await Promise.race([exited, sleep(15000).then(() => false)]);
  try { b.disconnect(); } catch (e) { /* closed */ }
  if (!gone) E.killTree(child.pid);
  for (const p of procsOf(prog)) E.killTree(p.pid);
  for (let i = 0; i < 15 && procsOf(prog).length; i++) await sleep(1000);
  rec.f("up-120s", yes(upIdle)); rec.f("typed", typed); rec.f("closed-alone", yes(alone === true)); if (gone) rec.f("exit", code);
  /* The net-log, parsed whole as tests/desk.js reads it: every event's params.host, and every scheme://host in a url. */
  let doc = null, raw = "";
  try { raw = fs.readFileSync(netFile, "utf8"); } catch (e) { rec.f("net-log", "none: " + e.code); }
  try { doc = JSON.parse(raw); } catch (e) { try { doc = JSON.parse(raw.replace(/,\s*$/, "") + "]}"); } catch (x) { doc = null; } }
  const events = doc && Array.isArray(doc.events) ? doc.events : [];
  const fromLog = new Set();
  for (const ev of events) {
    const pr = ev && ev.params;
    if (!pr) continue;
    if (typeof pr.host === "string") fromLog.add(pr.host.toLowerCase());
    for (const k of ["url", "original_url", "origin"]) {
      const m = typeof pr[k] === "string" && /^(https?|wss?):\/\/(\[[^\]]+\]|[^\/:?#]+)/i.exec(pr[k]);
      if (m) fromLog.add(m[2].toLowerCase());
    }
  }
  const local = (h) => /^(127\.|\[?::1\]?$|localhost$|0\.0\.0\.0$)/.test(h);
  const logHosts = [...fromLog].filter((h) => h && !local(h)).sort();
  const quietSet = new Set(quiet), dnsHosts = busy.filter((h) => !quietSet.has(h)).sort();
  rec.f("net-log-events", events.length); rec.f("net-log-hosts", logHosts.length ? logHosts.join(",") : 0);
  rec.f("dns-runner-own", quiet.length); rec.f("dns-new-in-session", dnsHosts.length ? dnsHosts.join(",") : 0);
  rec.f("dictionaries", dicts.length ? dicts.join(",") : 0); rec.f("loopback-in-log", yes([...fromLog].some(local)));
  const ok = upIdle && alone === true && events.length > 0 && typed === "yes";
  rec.end(ok, (ok ? "" : "not measured whole: ") + "an installed desk idle 120 s and then typed into (Polish and English, misspelt; harness start, so the update look and the renewal off by design) reached, by its net-log of "
    + events.length + " events, " + (logHosts.length ? logHosts.join(", ") : "no host but loopback") + "; the DNS cache saw " + (dnsHosts.length ? dnsHosts.join(", ") : "no name")
    + " beyond the " + quiet.length + " the runner asked for in a quiet window of the same length; dictionaries in the profile: " + (dicts.length ? dicts.join(", ") : "none")
    + "; typed " + typed + ", closed alone " + yes(alone === true));
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

/* ---- the installer mends' legs: B1, B4 and B5 of the update and install review, and the Program Files ".." -----------------
   Named only, never in a run that names no leg: three start the desk or make accounts, so none shares a run with the fresh-account
   legs (nonpersistent, net-hosts). Each reads the folder's own list (etiuda-files.ini) by itself, never through the tree's code. */
const ASIDE = ".setup-previous", STAGED = ".setup-staging", FILES_INI = "etiuda-files.ini";
const WIDE = /^(resources|locales)(\\|$)/;
const RUNONCE = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce", RUNONCE_VALUE = T.appId + ".per-user-copy";
/** The [files] keys of a list, lower-cased; null where there is no list. */
function iniFiles(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { return null; }
  const out = new Set();
  let sect = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(), h = /^\[([^\]]*)\]$/.exec(line), eq = line.indexOf("=");
    if (h) sect = h[1].toLowerCase();
    else if (sect === "files" && eq > 0) out.add(line.slice(0, eq).trim().toLowerCase());
  }
  return out;
}
/** The [list] entries in order, as written. */
function iniListed(file) {
  const out = [];
  let sect = "";
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim(), h = /^\[([^\]]*)\]$/.exec(line), eq = line.indexOf("=");
    if (h) sect = h[1].toLowerCase();
    else if (sect === "list" && eq > 0) out.push(line.slice(eq + 1).trim());
  }
  return out;
}
const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch (e) { return false; } };
const holds = (p, text) => { try { return fs.readFileSync(p, "utf8") === text; } catch (e) { return false; } };
const numberedAsides = (dir) => { const out = []; for (let i = 1; i <= 9; i++) if (fs.existsSync(dir + ASIDE + "." + i)) out.push(i); return out; };
/** Where a planted file is now: the folder, the copy aside, a numbered copy aside, or gone. */
function whereIs(dir, rel) {
  if (fs.existsSync(path.join(dir, rel))) return "folder";
  if (fs.existsSync(path.join(dir + ASIDE, rel))) return "aside";
  for (const i of numberedAsides(dir)) if (fs.existsSync(path.join(dir + ASIDE + "." + i, rel))) return "aside." + i;
  return "gone";
}
PS.under = ["param([string]$Prefix)", "$p = $Prefix.TrimEnd('\\') + '\\'",
  "@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($p, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { [string]$_.ProcessId + ' ' + $_.Name }) -join ', '"];
fs.writeFileSync(psFile("under"), PS.under.join("\r\n"), "utf8");
async function installUser(rec, exe, tag) {
  const args = P.installArgs({ mode: "user" });
  const bad = P.argsFault(args, "user");
  if (bad) throw new Error("refusing " + args.join(" ") + ": " + bad);
  const r = await runExe(exe, args, 600000);
  const dir = userDir();
  rec.f(tag + "-exit", r.timedOut ? "timeout" : r.code);
  return { code: r.timedOut ? "timeout" : r.code, dir, ok: r.code === 0 && !!dir && fs.existsSync(path.join(dir, PRODUCT + ".exe")) };
}
/** One start of the installed desk as this account, through the launch door, stopped by pid after `seconds` or once `done` holds. */
async function startDesk(rec, prog, tag, seconds, done) {
  const ud = path.join(process.env.APPDATA, T.packageName), docsRoot = path.join(LAB, tag + "-documents");
  fs.mkdirSync(docsRoot, { recursive: true });
  const opts = { stdio: "ignore", windowsHide: true, env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: docsRoot, ETIUDA_TEST_DEVTOOLS: "1" }) };
  const args = ["--user-data-dir=" + ud];
  const no = E.shellLaunchRefusal(WHO, args, opts);
  if (no) throw new NoVerdict("the desk's start is refused: " + no[0]);
  const t0 = Date.now(), child = E.shellLaunch(WHO, prog, args, opts);
  let gone = false;
  child.on("exit", () => { gone = true; });
  let held = -1;
  for (let i = 0; i < seconds; i++) { await sleep(1000); if (done && done()) { held = Math.round((Date.now() - t0) / 1000); break; } if (gone) break; }
  const up = !gone;
  if (!gone) E.killTree(child.pid);
  for (const p of procsOf(prog)) E.killTree(p.pid);
  for (let i = 0; i < 15 && procsOf(prog).length; i++) await sleep(1000);
  rec.f(tag + "-desk-up", yes(up)); rec.f(tag + "-done-s", held);
  return { up, held };
}

/* short-stage (B5): "an update is swapped in only when every packaged file is present at its exact size". A second build of this
   tree whose package lacks one listed file (its list still naming it) is run over a whole install: exit 2, the installed copy's
   files and DisplayVersion as they were, and no staging folder left beside it. */
const SHORT_DIST = () => path.join(LAB, "dist-short");
function shortSetup(rec) {
  const ini = path.join(DIST, "win-unpacked", FILES_INI);
  if (!fs.existsSync(ini)) throw new NoVerdict("the build under test wrote no " + FILES_INI + " into its package, so no short stage can be made from it");
  const listed = iniListed(ini);
  const sizes = listed.map((rel) => { try { return { rel, size: fs.statSync(path.join(DIST, "win-unpacked", rel)).size }; } catch (e) { return null; } }).filter(Boolean);
  const pick = sizes.find((s) => s.rel.toLowerCase() === "license.electron.txt")
    || sizes.filter((s) => !/\\/.test(s.rel) && !/\.exe$/i.test(s.rel)).sort((a, b) => a.size - b.size)[0];
  if (!pick) throw new NoVerdict("the list names no file at the package's root to leave out");
  const out = SHORT_DIST(), cfg = path.join(LAB, "short-stage.cjs"), stash = path.join(LAB, "short-stage-stash.bin");
  /* Left out after the list is written, at each of the two writes, so the list still names it: the hooks are the build's own. */
  fs.writeFileSync(cfg, ['"use strict";', 'const fs = require("node:fs"), path = require("node:path");',
    "const base = require(" + JSON.stringify(path.join(ROOT, "tools", "electron-builder-test.cjs")) + ");",
    "const REL = " + JSON.stringify(pick.rel) + ", STASH = " + JSON.stringify(stash) + ";",
    'if (typeof base.afterPack !== "function" || typeof base.afterSign !== "function") throw new Error("short-stage: the build has no afterPack and afterSign hooks");',
    "const at = (c) => path.join(c.appOutDir, REL);",
    "module.exports = Object.assign({}, base, {",
    "  afterPack: async (c) => { await base.afterPack(c); if (fs.existsSync(at(c))) { fs.copyFileSync(at(c), STASH); fs.unlinkSync(at(c)); } },",
    "  afterSign: async (c) => { if (!fs.existsSync(at(c)) && fs.existsSync(STASH)) fs.copyFileSync(STASH, at(c)); await base.afterSign(c); if (fs.existsSync(at(c))) fs.unlinkSync(at(c)); },",
    "});", ""].join("\n"));
  const cli = path.join(ROOT, "node_modules", "electron-builder", "out", "cli", "cli.js");
  try {
    execFileSync(process.execPath, [cli, "--win", "--config", cfg], { cwd: ROOT, stdio: "inherit", env: E.unsignedEnv({ ETIUDA_DIST: out }) });
  } catch (e) { throw new NoVerdict("the short build could not be made: " + oneLine(e.message)); }
  const found = fs.existsSync(out) ? fs.readdirSync(out).filter((n) => /-setup\.exe$/i.test(n)) : [];
  if (found.length !== 1) throw new NoVerdict(out + " holds " + found.length + " installers; expected 1");
  const exe = path.join(out, found[0]);
  const no = G.setupRefusal(G.setupIdentity(exe), "desk");
  if (no) throw new NoVerdict("the short setup is refused before it runs: " + no);
  const shortIni = path.join(out, "win-unpacked", FILES_INI);
  const stillListed = fs.existsSync(shortIni) && iniListed(shortIni).some((r) => r.toLowerCase() === pick.rel.toLowerCase());
  const left = !fs.existsSync(path.join(out, "win-unpacked", pick.rel));
  rec.f("left-out", pick.rel); rec.f("left-out-bytes", pick.size); rec.f("short-still-listed", yes(stillListed)); rec.f("short-file-absent", yes(left));
  if (!stillListed || !left) throw new NoVerdict("the short build is not short as meant: listed " + yes(stillListed) + ", absent " + yes(left));
  return exe;
}
async function shortStage(rec) {
  const short = shortSetup(rec);
  const dir = await installMachine(rec, NEWER, "n");
  const before = manifest(dir), dv = valueOf(regKey(KM.uninstall), "DisplayVersion");
  const r = await runExe(short, ["/S"], 600000);
  const d = manifestDiff(before, manifest(dir));
  const facts = { exit: r.timedOut ? "timeout" : r.code, same: !d.changed.length && !d.gone.length && !d.added.length,
    dv: valueOf(regKey(KM.uninstall), "DisplayVersion") === dv && !!dv, staged: fs.existsSync(dir + STAGED) };
  rec.f("exit", facts.exit); rec.f("files-as-they-were", yes(facts.same)); rec.f("changed", few(d.changed.concat(d.gone, d.added)) || 0);
  rec.f("displayversion-kept", yes(facts.dv)); rec.f("staging-left", yes(facts.staged));
  const ok = facts.exit === 2 && facts.same && facts.dv && !facts.staged;
  rec.end(ok, ok ? "a package one listed file short was refused with 2: the installed copy, its files and its DisplayVersion as they were, no staging folder left"
    : "the short package: exit " + facts.exit + " (2 wanted), files as they were " + yes(facts.same) + ", DisplayVersion kept " + yes(facts.dv) + ", staging left " + yes(facts.staged));
}

/* pre-own-survives (B1): "an install or an update never removes what it did not put there". N for all users into an empty folder;
   a person's file, a folder of theirs, a file of theirs inside the program's resources folder and a junction of theirs are put in
   it; N+1 with a bare /S, then N+1 again (the second swap drops the first's copy aside by its list). Green where both runs exit 0,
   N+1 is in place, and the person's file, folder and junction (its target untouched) are in the folder after each. Where the file
   inside resources is, after each, is recorded: a copy installed before the list counts resources whole, as etiudaDropOld does. */
async function preOwnSurvives(rec) {
  const old = olderSetup(rec);
  const A = path.join(LAB, "pre", "app");
  rec.after("uninstall", uninstallMachine);
  const args = P.installArgs({ mode: "machine", dir: A });
  const bad = P.argsFault(args, "machine");
  if (bad) throw new Error("refusing " + args.join(" ") + ": " + bad);
  const r0 = await runExe(old, args, 600000);
  rec.f("n-exit", r0.timedOut ? "timeout" : r0.code);
  if (r0.code !== 0 || !fs.existsSync(path.join(A, PRODUCT + ".exe")) || !P.samePath(machineDir(), A))
    throw new NoVerdict("N did not install for all users into " + A + " (exit " + r0.code + ")");
  rec.f("n-list", yes(fs.existsSync(path.join(A, FILES_INI))));
  const TEXT = "planted by " + WHO + "\n";
  const OWN = "a-persons-own-file.txt", OWN_IN = "a-persons-folder\\inside.txt", IN_RES = "resources\\a-persons-file-in-resources.txt", LINK = "a-persons-link";
  for (const rel of [OWN, OWN_IN, IN_RES]) { fs.mkdirSync(path.dirname(path.join(A, rel)), { recursive: true }); fs.writeFileSync(path.join(A, rel), TEXT); }
  const victimDir = path.join(LAB, "pre-victim"), victim = path.join(victimDir, "must-stay.txt");
  fs.mkdirSync(victimDir, { recursive: true });
  fs.writeFileSync(victim, "must stay\n");
  const mk = spawnSync("cmd.exe", ["/c", "mklink", "/J", path.join(A, LINK), victimDir], { encoding: "utf8", windowsHide: true, timeout: 30000 });
  rec.after("junctions", () => {
    const said = [];
    for (const d of [A, A + ASIDE].concat(numberedAsides(A).map((i) => A + ASIDE + "." + i))) {
      const l = path.join(d, LINK);
      if (isLink(l)) { const r = spawnSync("cmd.exe", ["/c", "rmdir", l], { windowsHide: true, timeout: 30000 }); said.push(path.basename(d) + (r.status === 0 ? " removed" : " refused")); }
    }
    return said.join(",") || "none left";
  });
  if (mk.status !== 0 || !fs.existsSync(path.join(A, LINK, "must-stay.txt"))) throw new NoVerdict("the junction could not be planted (" + oneLine(mk.stderr || mk.stdout) + ")");
  const built = newBuild(), asarTree = built["resources\\app.asar"] || "";
  const shipped = new Set(Object.keys(built).concat([FILES_INI, UNINSTALLER.toLowerCase(), "uninstallericon.ico"]));
  const look = (tag, r) => {
    const f = {
      exit: r.timedOut ? "timeout" : r.code,
      program: fs.existsSync(path.join(A, PRODUCT + ".exe")) && !!asarTree && shaOr(path.join(A, "resources", "app.asar")) === asarTree,
      own: holds(path.join(A, OWN), TEXT), ownIn: holds(path.join(A, OWN_IN), TEXT),
      link: isLink(path.join(A, LINK)), victim: holds(victim, "must stay\n"),
      inRes: whereIs(A, IN_RES), aside: fs.existsSync(path.join(A + ASIDE, PRODUCT + ".exe")), numbered: numberedAsides(A),
    };
    const strays = Object.keys(manifest(A)).filter((k) => !shipped.has(k) && ![OWN, OWN_IN, IN_RES].includes(k));
    rec.f(tag + "-exit", f.exit); rec.f(tag + "-program-new", yes(f.program)); rec.f(tag + "-own-file", yes(f.own)); rec.f(tag + "-own-folder", yes(f.ownIn));
    rec.f(tag + "-junction-in-folder", yes(f.link)); rec.f(tag + "-junction-target-intact", yes(f.victim)); rec.f(tag + "-file-in-resources", f.inRes);
    rec.f(tag + "-aside-holds-program", yes(f.aside)); rec.f(tag + "-numbered-asides", f.numbered.join(",") || "none"); rec.f(tag + "-strays", strays.length ? few(strays) : 0);
    f.ok = f.exit === 0 && f.program && f.own && f.ownIn && f.link && f.victim;
    return f;
  };
  const first = look("n1", await runExe(NEWER, ["/S"], 600000));
  const second = look("n1-again", await runExe(NEWER, ["/S"], 600000));
  const ok = first.ok && second.ok;
  const words = (f) => "exit " + f.exit + ", N+1 in place " + yes(f.program) + ", own file " + yes(f.own) + ", own folder " + yes(f.ownIn)
    + ", junction " + yes(f.link) + ", its target " + yes(f.victim) + ", the file in resources " + f.inRes;
  rec.end(ok, ok ? "N, then N+1 twice with /S: the person's file, folder and junction stayed in the folder each time, the junction's target untouched (the file in resources: "
    + first.inRes + ", then " + second.inRes + ")" : "first update: " + words(first) + "; second: " + words(second));
}

/* foreign-folder-refused (B1): a folder that holds other files and no earlier Etiuda is refused with 2 before anything is written:
   the file there untouched and alone, nothing staged beside it, nothing registered. An empty folder, the control, installs. */
async function foreignFolderRefused(rec) {
  const F = path.join(LAB, "pre", "theirs"), notes = path.join(F, "notes.txt"), TEXT = "a person's notes\n";
  fs.mkdirSync(F, { recursive: true });
  fs.writeFileSync(notes, TEXT);
  rec.after("uninstall", uninstallMachine);
  const args = P.installArgs({ mode: "machine", dir: F });
  const bad = P.argsFault(args, "machine");
  if (bad) throw new Error("refusing " + args.join(" ") + ": " + bad);
  const r = await runExe(NEWER, args, 600000);
  const facts = { exit: r.timedOut ? "timeout" : r.code, notes: holds(notes, TEXT), alone: fs.readdirSync(F).join(",") === "notes.txt",
    staged: fs.existsSync(F + STAGED), registered: !!valueOf(regKey(KM.uninstall), "DisplayVersion") };
  const Em = path.join(LAB, "pre", "empty");
  fs.mkdirSync(Em, { recursive: true });
  const r2 = facts.registered ? { code: "not run" } : await runExe(NEWER, P.installArgs({ mode: "machine", dir: Em }), 600000);
  const empty = r2.code === 0 && fs.existsSync(path.join(Em, PRODUCT + ".exe"));
  rec.f("exit", facts.exit); rec.f("notes-untouched", yes(facts.notes)); rec.f("folder-holds-only-notes", yes(facts.alone));
  rec.f("staging-beside", yes(facts.staged)); rec.f("registered", yes(facts.registered)); rec.f("empty-folder-exit", r2.timedOut ? "timeout" : r2.code); rec.f("empty-folder-installed", yes(empty));
  const ok = facts.exit === 2 && facts.notes && facts.alone && !facts.staged && !facts.registered && empty;
  rec.end(ok, ok ? "a folder holding a person's file and no Etiuda was refused with 2, the file untouched and alone, nothing staged or registered; an empty folder installed"
    : "the foreign folder: exit " + facts.exit + " (2 wanted), notes untouched " + yes(facts.notes) + ", alone " + yes(facts.alone) + ", staging beside " + yes(facts.staged)
      + ", registered " + yes(facts.registered) + "; the empty folder installed " + yes(empty));
}

/* old-copy-kept (B5): the old copy stays beside the install until the new one has started. Per user: N, then N+1 with /currentuser;
   the copy aside holds N's program; one start of the desk as this account, and it loses every file its list names (or, from a copy
   installed before the list, the newer list's files and resources and locales whole). All users: N, then N+1 with /S; the copy
   aside stays after a start by a standard account, which may not write there, and the uninstall takes both folders. */
async function oldCopyKept(rec) {
  const wall = E.windowWallRefusal(WHO);
  if (wall) throw new NoVerdict("the leg starts the installed desk and the window wall refuses: " + wall[0]);
  if (!process.env.APPDATA) throw new NoVerdict("APPDATA is not set, so the desk's user-data folder cannot be named");
  const old = olderSetup(rec);
  rec.after("uninstall-user", uninstallUser);
  const n = await installUser(rec, old, "u-n");
  if (!n.ok) throw new NoVerdict("N did not install for this account (exit " + n.code + ")");
  const nu = await installUser(rec, NEWER, "u-n1");
  const asideU = n.dir + ASIDE, progU = path.join(n.dir, PRODUCT + ".exe");
  const uHad = fs.existsSync(path.join(asideU, PRODUCT + ".exe"));
  const own = iniFiles(path.join(asideU, FILES_INI));
  const listed = own || iniFiles(path.join(n.dir, FILES_INI)) || new Set();
  const isListed = (k) => listed.has(k) || (!own && WIDE.test(k));
  rec.f("u-aside-after-install", yes(uHad)); rec.f("u-aside-list", own ? "its own" : "the newer, resources and locales whole");
  const start = nu.ok && uHad ? await startDesk(rec, progU, "u", 40, () => !fs.existsSync(asideU)) : { up: false, held: -1 };
  await sleep(2000);
  const leftU = Object.keys(manifest(asideU)), leftListed = leftU.filter(isListed);
  rec.f("u-aside-after-start", fs.existsSync(asideU) ? "there" : "gone"); rec.f("u-aside-left-listed", leftListed.length ? few(leftListed) : 0);
  const uOk = nu.ok && uHad && start.up && leftListed.length === 0;
  const uWords = "per user: N+1 exit " + nu.code + ", the copy aside held N's program " + yes(uHad) + ", the desk started " + yes(start.up)
    + ", listed files left in the copy aside after it " + leftListed.length;
  const uninstalled = await uninstallUser();
  rec.f("u-uninstall", uninstalled);

  const dir = await installMachine(rec, old, "m-n");
  const rm = await runExe(NEWER, ["/S"], 600000);
  const asideM = dir + ASIDE, progM = path.join(dir, PRODUCT + ".exe");
  const mHad = fs.existsSync(path.join(asideM, PRODUCT + ".exe"));
  rec.f("m-n1-exit", rm.timedOut ? "timeout" : rm.code); rec.f("m-aside-after-install", yes(mHad));
  let mStart = "unreached";
  const name = "etst" + crypto.randomInt(10000, 99999);
  let secret = "Aa1!" + crypto.randomBytes(24).toString("base64");
  rec.after("account", () => ps("rmuser", ["-Name", name]));
  const made = ps("mkuser", ["-Name", name], { LEG_PW: secret });
  const right = made === "made" ? ps("batchright", ["-Name", name]) : "no account";
  if (made === "made" && right === "granted" && mHad) {
    const task = "etst-aside-" + name;
    rec.after("task", () => ps("unreg", ["-Task", task]));
    rec.after("person-copy", () => { const left = procsOf(progM).filter((p) => String(p.user).toLowerCase() === name.toLowerCase());
      return left.length ? left.map((p) => p.pid + " " + E.killTree(p.pid).killed).join(",") : "had ended"; });
    const started = ps("runplain", ["-Task", task, "-Name", name, "-Exe", progM], { LEG_PW: secret });
    let up = 0;
    for (let i = 0; i < 30 && started === "started"; i++) { await sleep(1000); if (procsOf(progM).some((p) => String(p.user).toLowerCase() === name.toLowerCase())) up++; }
    for (const p of procsOf(progM).filter((p) => String(p.user).toLowerCase() === name.toLowerCase())) E.killTree(p.pid);
    mStart = started !== "started" ? "refused: " + started : up >= 15 ? "up " + up + " s" : "up only " + up + " s (" + ps("taskinfo", ["-Task", task]) + ")";
  } else mStart = "unreached: account " + made + ", right " + right;
  secret = null;
  const mKept = fs.existsSync(path.join(asideM, PRODUCT + ".exe"));
  rec.f("m-start", mStart); rec.f("m-aside-after-start", yes(mKept));
  for (let i = 0; i < 15 && procsOf(progM).length; i++) await sleep(1000);
  const un = exeOf(valueOf(regKey(KM.uninstall), "UninstallString"));
  const ru = un && fs.existsSync(un) ? await runExe(un, P.uninstallArgs("machine"), 300000) : { code: "no uninstaller" };
  const g1 = await goneWithin(dir, 120), g2 = await goneWithin(asideM, 30);
  rec.f("m-uninstall-exit", ru.code); rec.f("m-folder-gone-s", g1); rec.f("m-aside-gone-s", g2);
  const startReached = /^up \d+ s$/.test(mStart);
  const mOk = rm.code === 0 && mHad && (!startReached || mKept) && g1 > 0 && g2 > 0;
  const mWords = "all users: N+1 exit " + rm.code + ", the copy aside held N's program " + yes(mHad) + ", after a standard account's start (" + mStart + ") it "
    + (mKept ? "stayed" : "was gone") + ", the uninstall took the folder " + yes(g1 > 0) + " and the copy aside " + yes(g2 > 0);
  rec.end(uOk && mOk, uWords + "; " + mWords + (startReached ? "" : "; the start as a standard account was not reached, so that part has no verdict"));
}

/* per-user-at-sign-in (B4): an all-users install started elevated over this account's per-user copy writes one RunOnce value in
   HKCU, that copy's own UninstallString followed by /currentuser /S /KEEP_APP_DATA, and runs nothing from the per-user folder.
   A hosted runner cannot sign in again, so Explorer's reading of RunOnce at a sign-in is not reached: the leg runs the value's
   command line itself with a restricted token (runas /trustlevel, Administrators for deny only), and wants exit 0, the per-user
   folder and HKCU entry gone, a file in the account's data folder kept, and the all-users copy and its shortcuts intact. */
async function perUserAtSignIn(rec) {
  if (!process.env.APPDATA) throw new NoVerdict("APPDATA is not set, so the account's data folder cannot be named");
  const old = olderSetup(rec);
  if (valueOf(RUNONCE, RUNONCE_VALUE)) throw new NoVerdict(RUNONCE + " already holds " + RUNONCE_VALUE);
  rec.after("runonce", () => { if (!valueOf(RUNONCE, RUNONCE_VALUE)) return "none left";
    const r = spawnSync("reg", ["delete", RUNONCE, "/v", RUNONCE_VALUE, "/f"], { windowsHide: true, timeout: 30000 }); return r.status === 0 ? "deleted" : "refused"; });
  rec.after("uninstall-user", uninstallUser);
  const n = await installUser(rec, old, "n");
  if (!n.ok) throw new NoVerdict("N did not install for this account (exit " + n.code + ")");
  const ud = path.join(process.env.APPDATA, T.packageName), marker = path.join(ud, "per-user-at-sign-in-marker.txt");
  const madeUd = !fs.existsSync(ud);
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(marker, "kept\n");
  rec.after("marker", () => { try { fs.unlinkSync(marker); if (madeUd) fs.rmdirSync(ud); return "removed"; } catch (e) { return "left: " + e.code; } });

  rec.after("uninstall", uninstallMachine);
  const seen = new Set();
  let watching = true;
  const watch = (async () => { while (watching) { const s = ps("under", ["-Prefix", n.dir]); if (s && !/^no answer/.test(s)) s.split(", ").forEach((x) => seen.add(x)); await sleep(500); } })();
  const r = await runExe(NEWER, P.installArgs({ mode: "machine" }), 600000);
  watching = false;
  await watch;
  const value = valueOf(RUNONCE, RUNONCE_VALUE), unStr = valueOf(regKey(KU.uninstall), "UninstallString");
  const mdir = machineDir();
  const install = {
    exit: r.timedOut ? "timeout" : r.code, value: !!value, starts: !!unStr && value.startsWith(unStr),
    ends: / \/currentuser \/S \/KEEP_APP_DATA$/.test(value), ranNothing: seen.size === 0,
    perUser: fs.existsSync(path.join(n.dir, PRODUCT + ".exe")) && present(regKey(KU.uninstall)),
    allUsers: !!mdir && fs.existsSync(path.join(mdir, PRODUCT + ".exe")),
  };
  rec.f("exit", install.exit); rec.f("runonce", value); rec.f("starts-with-uninstallstring", yes(install.starts)); rec.f("ends-with-switches", yes(install.ends));
  rec.f("ran-from-per-user-folder", seen.size ? few([...seen]) : "nothing"); rec.f("per-user-copy-still-there", yes(install.perUser)); rec.f("all-users-copy", yes(install.allUsers));
  const installOk = install.exit === 0 && install.value && install.starts && install.ends && install.ranNothing && install.perUser && install.allUsers;
  if (!installOk) {
    rec.end(false, "the elevated all-users install: exit " + install.exit + ", RunOnce value " + yes(install.value) + ", starting with the HKCU UninstallString " + yes(install.starts)
      + ", ending /currentuser /S /KEEP_APP_DATA " + yes(install.ends) + ", nothing run from the per-user folder " + yes(install.ranNothing)
      + ", the per-user copy left for it " + yes(install.perUser) + ", the all-users copy " + yes(install.allUsers));
    return;
  }

  /* The sign-in's stand-in: the value's own command line, run with a restricted token, its groups written first. */
  /* Two witnesses of the token: whoami's groups (with its errors) and "net session", which answers 0 only to an elevated administrator.
     Both files go to the run's artifact. Windows' own by full path: the runner's PATH finds Git's whoami first. */
  const cmd = path.join(LAB, "signin-standin.cmd"), groups = path.join(OUT, "signin-groups.txt"), exitFile = path.join(LAB, "signin-exit.txt");
  const netFile = path.join(OUT, "signin-net-session.txt");
  fs.writeFileSync(cmd, ["@echo off", '"%SystemRoot%\\System32\\whoami.exe" /groups > "' + groups + '" 2>&1', '"%SystemRoot%\\System32\\net.exe" session >nul 2>&1', '>"' + netFile + '" echo %ERRORLEVEL%', value, '>"' + exitFile + '" echo %ERRORLEVEL%'].join("\r\n") + "\r\n");
  const ra = spawnSync("runas.exe", ["/trustlevel:0x20000", cmd], { encoding: "utf8", windowsHide: true, timeout: 60000 });
  rec.f("runas", oneLine((ra.stdout || "") + " " + (ra.stderr || "")) || "status " + ra.status);
  for (let i = 0; i < 300 && ra.status === 0 && !fs.existsSync(exitFile); i++) await sleep(1000);
  if (!fs.existsSync(exitFile)) throw new NoVerdict("the install part held (RunOnce " + JSON.stringify(value) + ", nothing run); the stand-in for the sign-in never finished under runas /trustlevel: "
    + oneLine((ra.stdout || "") + " " + (ra.stderr || "")) + (fs.existsSync(groups) ? " (it did start)" : " (it never started)"));
  await sleep(500);
  const g = fs.existsSync(groups) ? fs.readFileSync(groups, "utf8") : "";
  const admRow = g.split(/\r?\n/).find((l) => /BUILTIN\\Administrators/i.test(l)) || "";
  const label = (/Mandatory Label\\(\w+) Mandatory Level/i.exec(g) || [])[1] || "unread";
  const net = fs.existsSync(netFile) ? parseInt(fs.readFileSync(netFile, "utf8"), 10) : NaN;
  const read = !!admRow || label !== "unread";
  const unelevated = (/deny only/i.test(admRow) || /^(medium|low)$/i.test(label)) && net !== 0;
  rec.f("standin-net-session", Number.isNaN(net) ? "unread" : net); rec.f("standin-groups-bytes", g.length);
  rec.f("standin-administrators", admRow ? (/deny only/i.test(admRow) ? "deny only" : "enabled") : "absent"); rec.f("standin-integrity", label);
  const sx = parseInt(fs.readFileSync(exitFile, "utf8"), 10);
  const goneIn = await goneWithin(n.dir, 120);
  const after = {
    exit: sx, folder: goneIn > 0 || !fs.existsSync(n.dir), entry: !present(regKey(KU.uninstall)), marker: holds(marker, "kept\n"),
    allUsers: !!machineDir() && fs.existsSync(path.join(machineDir(), PRODUCT + ".exe")) && present(regKey(KM.uninstall)),
    links: commonLinks().every((f) => fs.existsSync(f)),
  };
  rec.f("standin-exit", sx); rec.f("per-user-folder-gone", yes(after.folder)); rec.f("hkcu-entry-gone", yes(after.entry)); rec.f("data-file-kept", yes(after.marker));
  rec.f("all-users-intact", yes(after.allUsers)); rec.f("all-users-shortcuts", yes(after.links));
  const removed = after.exit === 0 && after.folder && after.entry && after.marker && after.allUsers && after.links;
  /* A token not shown to be ordinary says nothing of ordinary rights: no verdict where the line otherwise did all it should. */
  if (!unelevated && removed)
    throw new NoVerdict("the install part held and the line removed the per-user copy, kept the data and left the all-users copy whole; but the stand-in's token was not shown to be ordinary (Administrators "
      + (admRow ? (/deny only/i.test(admRow) ? "deny only" : "enabled") : read ? "absent" : "unread") + ", " + label + " integrity, net session " + (Number.isNaN(net) ? "unread" : net) + "), so ordinary rights are unproven");
  const ok = unelevated && after.exit === 0 && after.folder && after.entry && after.marker && after.allUsers && after.links;
  rec.end(ok, (ok ? "elevated all-users over a per-user copy wrote " + JSON.stringify(value) + " to HKCU RunOnce and ran nothing of that copy; the line, run with a restricted token, removed the per-user copy and its entry with exit 0, kept the data file, and left the all-users copy and its shortcuts whole"
    : "the line, run with a restricted token (" + label + " integrity, unelevated " + yes(unelevated) + "): exit " + sx + ", per-user folder gone " + yes(after.folder) + ", HKCU entry gone " + yes(after.entry)
      + ", data file kept " + yes(after.marker) + ", all-users copy intact " + yes(after.allUsers) + ", its shortcuts " + yes(after.links))
    + "; a real sign-in (Explorer reading RunOnce) is not reached on a hosted runner");
}

/* pf-dotdot (the Program Files D): interactive only. The writable-folder box belongs to the folder page, which a hosted runner cannot
   drive; tests/allusers-folder.mjs and the GetFullPathNameW check read it from the script. */
/* uninstall-data, the desk's: the uninstaller's own Remove my data page, opened as a person opens it, with no /S, and driven by tools/runner/uninstaller-drive.ps1 -AfterNext
   (the desk asks on a page of its own, after the welcome), twice over a fresh per-user install with a planted data folder. Ticked: the box is
   found, Windows names it under its centre, a click ticks it and a second clears it, Tab then Space ticks it, Next is pressed and the uninstaller
   runs to its end; every planted file of the folder goes, the licence included (the page's note says so; shell/installer.nsh defines
   ETIUDA_REMOVE_LICENCE_WITH_DATA), and a catalog outside it is untouched. Unticked: the same, the box cleared by keyboard, and the folder reads
   exactly as it did before. Until this leg nothing pressed the box in the real page: tests/desk-reset.mjs reads the script as text and replays the
   removal function, and tests/reinstall.js runs the uninstaller silent, which skips the page. The data step names ${APP_PACKAGE_NAME}, the build's own folder (etiuda-qa for this test build); a shipped desk's folder (etiuda) is
   planted beside it and must come through both passes byte for byte. The leg refuses where either folder already stands. The rectangles are read
   at this runner's scaling. */
const UD_PLANTED = ["settings.json", "conversations\\c1.json", "etiuda-license.js", "cards.json", "team\\team.json", "Local State", "Cache\\data_0"];
async function uninstallData(rec) {
  const wall = E.windowWallRefusal(WHO);
  if (wall) throw new NoVerdict("the leg opens the uninstaller's window and the window wall refuses: " + wall[0]);
  if (!process.env.APPDATA) throw new NoVerdict("APPDATA is not set, so the data folder cannot be named");
  const data = path.join(process.env.APPDATA, T.packageName), shipped = path.join(process.env.APPDATA, "etiuda");
  if (data.toLowerCase() === shipped.toLowerCase()) throw new NoVerdict("the test build names the shipped data folder, so no leg can tell the two apart");
  for (const d of [data, shipped]) if (fs.existsSync(d)) throw new NoVerdict(d + " already stands on this machine; the leg plants there and will not touch a folder it did not make");
  const catalog = path.join(LAB, "ud-documents", "My catalog.ec");
  const plant = (rel, root) => { const f = path.join(root || data, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, "planted " + rel); };
  rec.after("uninstall", uninstallUser);
  rec.after("data folders", async () => { let n = 0; for (const d of [data, shipped]) if (fs.existsSync(d)) { fs.rmSync(d, { recursive: true, force: true }); n++; } return n ? "removed what the leg planted: " + n : "none left"; });
  const pass = async (final) => {
    const tag = final;
    const inst = await installUser(rec, NEWER, tag);
    if (!inst.ok) throw new NoVerdict(tag + ": the test build did not install for this account (exit " + inst.code + ")");
    const un = exeOf(valueOf(regKey(KU.uninstall), "UninstallString")) || path.join(inst.dir, UNINSTALLER);
    if (!fs.existsSync(un)) throw new NoVerdict(tag + ": no uninstaller at " + un);
    fs.rmSync(data, { recursive: true, force: true });
    for (const d of [data, shipped]) fs.rmSync(d, { recursive: true, force: true });
    for (const r of UD_PLANTED) { plant(r); plant(r, shipped); }
    fs.mkdirSync(path.dirname(catalog), { recursive: true }); fs.writeFileSync(catalog, "a person's catalog");
    const before = manifest(data), beforeShipped = manifest(shipped), catSha = E.sha256(catalog);
    const jsonOut = path.join(LAB, "drive-" + tag + ".json");
    const child = spawn(un, ["/currentuser"], { windowsHide: false, stdio: "ignore" });
    const drove = spawnSync("powershell.exe", PS_HEAD.concat([path.join(ROOT, "tools", "runner", "uninstaller-drive.ps1"),
      "-Product", PRODUCT, "-Final", final, "-Out", jsonOut, "-AfterNext"]), { encoding: "utf8", windowsHide: true, timeout: 330000 });
    const gone = await goneWithin(inst.dir, 90);
    for (const p of procsOf(un)) E.killTree(p.pid);
    E.killTree(child.pid);
    let d = {};
    try { d = JSON.parse(fs.readFileSync(jsonOut, "utf8").replace(/^﻿/, "")); } catch (e) { throw new NoVerdict(tag + ": the driver wrote no readable record (" + oneLine(drove.stderr || drove.stdout) + ")"); }
    fs.copyFileSync(jsonOut, path.join(OUT, "uninstall-page-" + tag + ".json"));
    if (d.error) rec.f(tag + "-driver", d.error);
    rec.f(tag + "-dpi", d.dpi); rec.f(tag + "-ended", d.ended);
    const bad = [];
    const px = (c) => c ? [c.left, c.top, c.right, c.bottom].join(",") : "none";
    rec.f(tag + "-box", px(d.box)); rec.f(tag + "-note", px(d.note));
    if (!d.box) bad.push("no Remove my data checkbox on the page after Next");
    else {
      if (!d.note) bad.push("no note under the box");
      else if (d.note.right - d.note.left < 200 || d.note.right > d.main.right) bad.push("the note is cut: " + px(d.note) + " in a window ending at " + d.main.right);
      if (!d.boxIsHit) bad.push("Windows names " + (d.underBoxCentre ? d.underBoxCentre.class + " \"" + String(d.underBoxCentre.text).slice(0, 20) + "\"" : "nothing") + " under the box's centre, not the box");
      if (d.afterMouse1 !== 1) bad.push("a click on the box left it at " + d.afterMouse1 + ", not ticked");
      if (d.afterMouse2 !== 0) bad.push("a second click left it at " + d.afterMouse2 + ", not cleared");
      if (!d.boxHasFocus) bad.push("Tab did not reach the box in " + d.tabsToBox + " presses");
      if (d.afterSpace1 !== 1) bad.push("Space on the box left it at " + d.afterSpace1 + ", not ticked");
      if (d.stateAtNext !== (final === "ticked" ? 1 : 0)) bad.push("the box stood at " + d.stateAtNext + " at Next, not " + (final === "ticked" ? 1 : 0));
    }
    if (!(gone > 0)) bad.push("the install folder was still there 90 s after Next");
    const after = manifest(data), diff = manifestDiff(before, after);
    if (final === "ticked") {
      const stillThere = UD_PLANTED.filter((r) => fs.existsSync(path.join(data, r)));
      rec.f(tag + "-planted-left", stillThere.length ? few(stillThere) : 0);
      if (stillThere.length) bad.push("the note says the desk's data goes and these are still there: " + few(stillThere));
    } else {
      rec.f(tag + "-changed", diff.changed.length + diff.gone.length + diff.added.length);
      if (diff.changed.length || diff.gone.length || diff.added.length) bad.push("with the box cleared the folder still changed: gone " + few(diff.gone) + ", changed " + few(diff.changed) + ", added " + few(diff.added));
    }
    const sd = manifestDiff(beforeShipped, manifest(shipped));
    rec.f(tag + "-shipped-changed", sd.changed.length + sd.gone.length + sd.added.length);
    if (sd.changed.length || sd.gone.length || sd.added.length) bad.push("the shipped desk's folder beside it was touched: gone " + few(sd.gone) + ", changed " + few(sd.changed) + ", added " + few(sd.added));
    if (!fs.existsSync(catalog) || E.sha256(catalog) !== catSha) bad.push("the catalog outside the folder was touched");
    rec.f(tag + "-driver-exit", drove.status);
    return bad;
  };
  const ticked = await pass("ticked");
  rec.f("ticked-faults", ticked.length);
  rec.f("between", oneLine(await uninstallUser()));
  const unticked = await pass("unticked");
  rec.f("unticked-faults", unticked.length);
  rec.end(!ticked.length && !unticked.length,
    !ticked.length && !unticked.length
      ? "the desk's uninstaller page: the Remove my data box takes a mouse click and Tab with Space; ticked, the planted data and the licence are gone; cleared, nothing in the folder changed; a catalog outside is untouched"
      : ["ticked: " + ticked.join("; "), "unticked: " + unticked.join("; ")].join(" | "));
}

async function pfDotdot() {
  throw new NoVerdict("the box for \"C:\\Program Files\\..\\Users\\Public\\Etiuda\" appears only on the folder page, which this runner cannot drive; unreached here");
}

/* ---- reinstall-no-reboot: uninstall, then install again in the same session, as a person does it ----------------------
   The person's sequence of two findings (the desk's Setup hanging on Installing after an uninstall, twice, until a reboot; Studio's
   Setup opening an endless cascade of "already installed" boxes over an install already running), done the person's way: the
   Test Service build (the build the findings were made with) installed through its pages, no /S, pressed by the watcher below;
   the program started as a person starts it (the Finish page's Run box, left as it stands; the leg starts it only where that box
   started nothing) and left to settle in its tray; then the uninstaller from the Apps entry (the UninstallString, as Settings runs
   it, no /S), its pages pressed the same way, Remove my data left as it stands; then the same Setup again, no reboot.
     reinstall-no-reboot      the person quits the program before the uninstall (its own close request, --update-close, stands in
                              for the tray's Quit, which this runner cannot reach).
     reinstall-no-reboot-ask  the program is still running in its tray when the uninstall starts; any box the uninstaller shows about
                              it is answered as a person would (the program quit, then Retry; an OK box, OK).
   The uninstall and the second install are repeated RNR_CYCLES times (ETIUDA_RNR_CYCLES, 5 unless set), every install interactive with the
   turning animation running, never /S, since the fault is a race; the first cycle with a fault is the last.
   IT FAILS ON: a Setup not finished within RNR_BOUND_S (a hang); a Setup or Uninstall window that stops responding (IsHungAppWindow,
   or a wizard that does not answer WM_NULL within 5 s, SMTO_ABORTIFHUNG); a Setup that ends with an exception (an exit code of
   0xC0000000 or above, such as c000041d) or that Windows Error Reporting logs as crashed or hung (Application log, 1000 and 1002);
   more than one visible Setup window in one process; more than one Setup process (by the setup file's path or name) or
   more than one visible top-level window with "Setup" in its title at any sample, one sample a second; and, before the second
   install, anything the uninstall left: a running process of the program, the install folder, the uninstall entry (either scope),
   a PendingFileRenameOperations entry naming the folder or the product. The first install and the uninstall are held to the same
   bounds. Each phase's samples print in the #leg line as setup/windows counts run-length coded ("1/1x40" is forty samples of one
   Setup process and one window); every sample, with each process's parent and command line and each new window's text, is kept
   as rnr-<leg>-<phase>.jsonl beside legs.txt, which is where the program that started an extra Setup is read. A storm is cut short
   at RNR_STORM_CAP of either count, so the runner survives it; the leg stops by pid what the setup file and the uninstaller ran. */
const RNR_BOUND_S = 300, RNR_STORM_CAP = 6;
const RNR_CYCLES = Math.max(1, Math.min(20, parseInt(process.env.ETIUDA_RNR_CYCLES || "5", 10) || 5));
const RNR_PS = String.raw`param([string]$Exe, [string]$Title, [string]$Product, [string]$Out, [string]$Stop, [string]$Drive, [string]$App, [int]$Seconds = 400)
$ErrorActionPreference = "Continue"
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class RW {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, EnumProc p, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsHungAppWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, int m, IntPtr w, IntPtr l, int flags, int ms, out IntPtr r);
  public static bool Answers(IntPtr h, int ms) { IntPtr r; return SendMessageTimeout(h, 0, IntPtr.Zero, IntPtr.Zero, 0x0002, ms, out r) != IntPtr.Zero; }
  public static List<IntPtr> Tops() { var l = new List<IntPtr>(); EnumWindows((h, p) => { l.Add(h); return true; }, IntPtr.Zero); return l; }
  public static List<IntPtr> Kids(IntPtr top) { var l = new List<IntPtr>(); EnumChildWindows(top, (h, p) => { l.Add(h); return true; }, IntPtr.Zero); return l; }
  public static string Text(IntPtr h) { var s = new StringBuilder(2048); GetWindowText(h, s, s.Capacity); return s.ToString(); }
  public static string Class(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, s.Capacity); return s.ToString(); }
}
"@
function Click($b) { [void][RW]::PostMessage($b, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) }
# THE PAGE, named in the sample: the header's title and subtitle (1037, 1038) and the inner page's controls, so a stall says where it is.
function PageOf($h) {
  $hdr = @(); $ctl = @(); $radios = @()
  foreach ($k in [RW]::Kids($h)) {
    $id = [RW]::GetDlgCtrlID($k); $c = [RW]::Class($k)
    if (($id -eq 1037 -or $id -eq 1038) -and [RW]::GetParent($k) -eq $h) { $hdr += [RW]::Text($k) }
    if ([RW]::GetParent($k) -ne $h -and [RW]::IsWindowVisible($k) -and ($c -eq "Button" -or $c -eq "Edit" -or $c -eq "Static")) {
      $st = [int][RW]::SendMessage($k, 0x00F0, [IntPtr]::Zero, [IntPtr]::Zero)
      $tx = [RW]::Text($k); if ($tx.Length -gt 40) { $tx = $tx.Substring(0, 40) }
      if ($c -eq "Button" -and $tx) { $ctl += ($tx + "=" + $st) ; $bs = [RW]::GetWindowLong($k, -16) -band 0xF; if ($bs -eq 4 -or $bs -eq 9) { $radios += [pscustomobject]@{ h = $k; text = $tx; state = $st } } }
      elseif ($c -eq "Edit") { $ctl += ("edit:" + $tx) }
    }
  }
  [pscustomobject]@{ sig = ($hdr -join " / "); controls = ($ctl -join "; "); buttons = $radios }
}
$leaf = ""; if ($Exe) { $leaf = [IO.Path]::GetFileName($Exe) }
$pageSeen = @{}; $pagePress = @{}; $answeredSame = 0; $retries = 0; $lastPress = @{}; $seen = @{}; $lastPids = "-"; $t0 = Get-Date
while (-not (Test-Path -LiteralPath $Stop) -and ((Get-Date) - $t0).TotalSeconds -lt $Seconds) {
  $rows = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    ($_.ExecutablePath -and $Exe -and $_.ExecutablePath -ieq $Exe) -or ($leaf -and $_.Name -ieq $leaf) -or ($_.Name -match '^(old-uninstaller|Au_|Un_[A-Z])') })
  $setup = @($rows | Where-Object { ($_.ExecutablePath -and $Exe -and $_.ExecutablePath -ieq $Exe) -or ($leaf -and $_.Name -ieq $leaf) })
  $wins = @(); $press = @(); $new = @(); $hungNow = @(); $o2page = @()
  foreach ($h in [RW]::Tops()) {
    if (-not [RW]::IsWindowVisible($h)) { continue }
    $t = [RW]::Text($h)
    if (-not $t.Contains($Title)) { continue }
    [uint32]$wp = 0; [void][RW]::GetWindowThreadProcessId($h, [ref]$wp)
    $isWizard = $false; $msg = ""; $btn = @{}
    foreach ($k in [RW]::Kids($h)) {
      $c = [RW]::Class($k)
      if ($c -eq "#32770") { $isWizard = $true }
      if ($c -eq "Static" -and [RW]::GetDlgCtrlID($k) -eq 65535) { $s = [RW]::Text($k); if ($s.Length -gt $msg.Length) { $msg = $s } }
      if ($c -eq "Button" -and [RW]::GetParent($k) -eq $h) { $btn[[RW]::GetDlgCtrlID($k)] = $k }
    }
    $key = [string][int64]$h
    $short = $msg; if ($short.Length -gt 160) { $short = $short.Substring(0, 160) }
    $hung = [RW]::IsHungAppWindow($h)
    if (-not $hung -and $isWizard) { $hung = -not [RW]::Answers($h, 5000) }
    $w = [ordered]@{ hwnd = [int64]$h; pid = [int]$wp; title = $t; kind = $(if ($isWizard) { "wizard" } else { "box" }); text = $short; hung = [bool]$hung }
    $wins += $w
    if ($hung) { $hungNow += $key }
    if (-not $seen.ContainsKey($key)) { $seen[$key] = 1; $new += $w }
    if ($Drive -eq "none" -or -not $t.Contains($Product)) { continue }
    $now = Get-Date
    if ($lastPress.ContainsKey($key) -and ($now - $lastPress[$key]).TotalSeconds -lt 2.5) { continue }
    if ($isWizard) {
      $b = $btn[1]
      $pg = PageOf $h
      if ($pageSeen[$key] -ne $pg.sig) { $pageSeen[$key] = $pg.sig; $pagePress[$key] = 0; $o2page += ($pg.sig + " [" + $pg.controls + "]") }
      if ($b -and [RW]::IsWindowVisible($b) -and [RW]::IsWindowEnabled($b)) {
        # The wizard's own forward control, id 1, whatever its label (Next, I Agree, Install, Finish). A page it does not leave after two
        # presses gets what a person would give it, in turn: an option chosen where none is (this account's, where offered), the dialog's
        # own IDOK command, then Enter.
        $n = [int]$pagePress[$key]; $pagePress[$key] = $n + 1; $how = "id1"
        if ($n -ge 2) {
          $step = ($n - 2) % 3
          if ($step -eq 0) {
            $opts = @($pg.buttons)
            if ($opts.Count -and -not @($opts | Where-Object { $_.state -eq 1 }).Count) {
              $pick = @($opts | Where-Object { $_.text -match "only for me|tylko dla mnie|current user" } | Select-Object -First 1)
              if (-not $pick.Count) { $pick = @($opts | Select-Object -First 1) }
              Click $pick[0].h; Start-Sleep -Milliseconds 400; $how = "chose " + $pick[0].text
            }
            Click $b
          } elseif ($step -eq 1) { [void][RW]::PostMessage($h, 0x0111, [IntPtr]1, $b); $how = "WM_COMMAND IDOK" }
          else { [void][RW]::PostMessage($b, 0x0100, [IntPtr]0x0D, [IntPtr]1); [void][RW]::PostMessage($b, 0x0101, [IntPtr]0x0D, [IntPtr]0xC0000001); $how = "Enter" }
        } else { Click $b }
        $lastPress[$key] = $now; $press += ("wizard " + [RW]::Text($b) + " (" + $how + ") on " + $pg.sig)
      }
    } elseif ($msg -match "already installed|zainstalowan") {
      if ($answeredSame -lt 1 -and $btn[1]) { Click $btn[1]; $answeredSame++; $lastPress[$key] = $now; $press += "box OK, the first already-installed box" }
    } elseif ($msg -match "is running|uruchomiony|cannot be closed|nie mo") {
      if ($retries -lt 3 -and $btn[4]) {
        if ($App -and (Test-Path -LiteralPath $App)) { Start-Process -FilePath $App -ArgumentList "--update-close" -WindowStyle Hidden; Start-Sleep -Seconds 4 }
        Click $btn[4]; $retries++; $lastPress[$key] = $now; $press += "box Retry, the program quit first"
      }
    } elseif (-not $lastPress.ContainsKey($key) -and $btn[1]) {
      Click $btn[1]; $lastPress[$key] = $now; $press += ("box OK: " + $short.Substring(0, [Math]::Min(60, $short.Length)))
    }
  }
  $pids = (@($rows | ForEach-Object { [string]$_.ProcessId }) | Sort-Object) -join ","
  $wpp = 0; foreach ($g in @($wins | Group-Object -Property { $_.pid })) { if ($g.Count -gt $wpp) { $wpp = $g.Count } }
  $o = [ordered]@{ t = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1); setup = $setup.Count; others = $rows.Count - $setup.Count; wins = $wins.Count; wpp = $wpp; hung = $hungNow.Count }
  if ($hungNow.Count) { $o.hungTitles = @($wins | Where-Object { $_.hung } | ForEach-Object { $_.title + " (" + $_.pid + ")" }) }
  if ($pids -ne $lastPids) {
    $o.procs = @($rows | ForEach-Object { $cl = [string]$_.CommandLine; if ($cl.Length -gt 220) { $cl = $cl.Substring(0, 220) }
      [ordered]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = [string]$_.Name; cmd = $cl } })
    $lastPids = $pids
  }
  if ($new.Count) { $o.new = $new }
  if ($press.Count) { $o.pressed = $press }
  if ($o2page.Count) { $o.page = $o2page }
  Add-Content -LiteralPath $Out -Value (ConvertTo-Json -InputObject $o -Compress -Depth 6) -Encoding UTF8
  Start-Sleep -Milliseconds 700
}
`;
const RNR_WER_PS = String.raw`param([string]$Since, [string]$Names)
$names = $Names.Split(",") | Where-Object { $_ }
$rows = @()
try { $ev = Get-WinEvent -FilterHashtable @{ LogName = "Application"; StartTime = [datetime]::Parse($Since).ToLocalTime(); Id = 1000, 1001, 1002 } -ErrorAction Stop } catch { $ev = @() }
foreach ($e in $ev) { $m = [string]$e.Message; foreach ($n in $names) { if ($m.IndexOf($n, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
  $code = ""; $x = [regex]::Match($m, "0x[cC][0-9a-fA-F]{7}"); if ($x.Success) { $code = $x.Value }
  $rows += [pscustomobject]@{ id = $e.Id; name = $n; code = $code; msg = $m.Substring(0, [Math]::Min(160, $m.Length)) }; break } } }
ConvertTo-Json -InputObject @($rows) -Compress
`;
function rnrWer(since, names) {
  const f = path.join(LAB, "q-rnr-wer.ps1");
  if (!fs.existsSync(f)) fs.writeFileSync(f, RNR_WER_PS.replace(/\r?\n/g, "\r\n"), "utf8");
  const r = spawnSync("powershell.exe", PS_HEAD.concat([f, "-Since", since, "-Names", names.join(",")]), { encoding: "utf8", windowsHide: true, timeout: 120000 });
  try { const v = JSON.parse(String(r.stdout || "").trim() || "[]"); return Array.isArray(v) ? v : [v]; } catch (e) { return [{ id: 0, name: "-", code: "", msg: "the Application log could not be read: " + oneLine(r.stderr) }]; }
}
const rnrCrashCode = (code) => (typeof code === "number" && (code >>> 0) >= 0xC0000000 ? "0x" + (code >>> 0).toString(16) : "");
const RNR_FILE = () => { const f = path.join(LAB, "q-rnr-watch.ps1"); if (!fs.existsSync(f)) fs.writeFileSync(f, RNR_PS.replace(/\r?\n/g, "\r\n"), "utf8"); return f; };

/* The pure parts: the samples of one phase off their file, and what they say. */
function rnrRead(file) {
  let text = "";
  try { text = fs.readFileSync(file, "utf8").replace(/^﻿/, ""); } catch (e) { return []; }
  const out = [];
  for (const line of text.split(/\r?\n/)) { if (!line.trim()) continue; try { out.push(JSON.parse(line.replace(/^﻿/, ""))); } catch (e) { /* a line cut by the stop */ } }
  return out;
}
function rnrJudge(samples, opts) {
  const o = opts || {};
  let maxSetup = 0, maxWins = 0, maxWpp = 0, hungSamples = 0;
  const series = [], boxes = [], pressed = [], hungTitles = [], pages = [];
  for (const s of samples) {
    const sp = s.setup | 0, w = s.wins | 0;
    if (sp > maxSetup) maxSetup = sp;
    if (w > maxWins) maxWins = w;
    if ((s.wpp | 0) > maxWpp) maxWpp = s.wpp | 0;
    if ((s.hung | 0) > 0) { hungSamples++; for (const t of s.hungTitles || []) if (hungTitles.indexOf(t) < 0) hungTitles.push(t); }
    const k = sp + "/" + w, last = series[series.length - 1];
    if (last && last[0] === k) last[1]++; else series.push([k, 1]);
    for (const nw of s.new || []) if (nw && nw.kind === "box" && nw.text && boxes.indexOf(nw.text.slice(0, 70)) < 0) boxes.push(nw.text.slice(0, 70));
    for (const p of s.pressed || []) pressed.push(p);
    for (const p of s.page || []) pages.push(p);
  }
  const faults = [];
  if (o.setupRules) {
    if (maxSetup > 1) faults.push(maxSetup + " Setup processes at once");
    if (maxWins > 1) faults.push(maxWins + " Setup windows at once");
    if (maxWpp > 1) faults.push(maxWpp + " Setup windows in one process");
  }
  if (hungSamples && (o.setupRules || o.hungRule)) faults.push("a window stopped responding in " + hungSamples + " sample(s): " + hungTitles.slice(0, 3).join(", "));
  return { n: samples.length, pages, maxSetup, maxWins, maxWpp, hungSamples, series: series.map(([k, n]) => k + "x" + n).join(",") || "none", boxes, pressed, faults };
}
/* The extra processes a phase saw, as "name<-parent name" for each pid that was not the first Setup: who started the second one. */
function rnrSpawners(samples, firstPid) {
  const names = {}, seen = [];
  for (const s of samples) for (const p of s.procs || []) names[p.pid] = p.name;
  for (const s of samples) for (const p of s.procs || []) {
    if (p.pid === firstPid) continue;
    const row = p.name + "(" + p.pid + ")<-" + (names[p.ppid] || "pid") + "(" + p.ppid + ")";
    if (seen.indexOf(row) < 0) seen.push(row);
  }
  return seen;
}

/** One phase: `exe` started with `args` beside the watcher; ends where `finished` holds, at the bound, or at a storm. */
async function rnrRun(rec, leg, tag, exe, args, o) {
  const out = path.join(LAB, "rnr-" + leg + "-" + tag + ".jsonl"), stop = out + ".stop";
  const watcher = spawn("powershell.exe", PS_HEAD.concat([RNR_FILE(), "-Exe", o.procExe || "", "-Title", o.title, "-Product", o.product, "-Out", out,
    "-Stop", stop, "-Drive", o.drive, "-App", o.app || "", "-Seconds", String(RNR_BOUND_S + 90)]), { windowsHide: true, stdio: "ignore" });
  let watcherGone = false;
  watcher.on("exit", () => { watcherGone = true; });
  for (let i = 0; i < 20 && !fs.existsSync(out); i++) await sleep(500);
  const t0 = Date.now(), since = new Date(t0 - 2000).toISOString();
  const child = spawn(exe, args, { windowsHide: false, stdio: "ignore" });
  let code = null, exited = false;
  child.on("exit", (c) => { code = c; exited = true; });
  child.on("error", () => { exited = true; });
  let storm = false, finished = false;
  while (Date.now() - t0 < RNR_BOUND_S * 1000) {
    await sleep(1000);
    const s = rnrRead(out), j = rnrJudge(s);
    if (o.setupRules && (j.maxSetup >= RNR_STORM_CAP || j.maxWins >= RNR_STORM_CAP)) { storm = true; break; }
    if (o.finished(s, exited)) { finished = true; break; }
  }
  const seconds = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(stop, "stop");
  for (let i = 0; i < 20 && !watcherGone; i++) await sleep(500);
  if (!watcherGone) E.killTree(watcher.pid);
  const samples = rnrRead(out);
  /* What is left of this phase goes by pid: the start, every process of the setup file, and the uninstaller's copies the samples saw. */
  E.killTree(child.pid);
  if (o.procExe) for (const p of procsOf(o.procExe)) E.killTree(p.pid);
  const ran = {};
  for (const s of samples) for (const p of s.procs || []) if (/^(old-uninstaller|Au_|Un_[A-Z])/i.test(p.name)) ran[p.pid] = true;
  for (const pid of Object.keys(ran)) E.killTree(Number(pid));
  try { fs.copyFileSync(out, path.join(OUT, path.basename(out))); } catch (e) { /* no samples written */ }
  const j = rnrJudge(samples, { setupRules: o.setupRules, hungRule: o.hungRule });
  rec.f(tag + "-s", seconds); rec.f(tag + "-exit", exited ? code : "running"); rec.f(tag + "-samples", j.n);
  rec.f(tag + "-max", j.maxSetup + "/" + j.maxWins); rec.f(tag + "-series", j.series);
  if (j.boxes.length) rec.f(tag + "-boxes", j.boxes.join(" | "));
  if (j.pressed.length) rec.f(tag + "-pressed", j.pressed.length + ":" + j.pressed.slice(-2).join(";"));
  if (j.pages.length) rec.f(tag + "-pages", j.pages.length + ":" + j.pages.slice(-2).join(" >> ").slice(0, 400));
  const extra = rnrSpawners(samples, child.pid);
  if (extra.length) rec.f(tag + "-procs", few(extra));
  const faults = j.faults.slice();
  const crash = exited ? rnrCrashCode(code) : "";
  if (crash) faults.push(o.what + " ended with exception " + crash);
  const names = [path.basename(exe), "Un_A.exe", "Au_.exe", "old-uninstaller.exe"].concat(o.procExe ? [path.basename(o.procExe)] : []);
  const wer = rnrWer(since, names).filter((w) => w.id === 1000 || w.id === 1002 || /^0x[cC]/.test(w.code || ""));
  if (wer.length) { rec.f(tag + "-wer", wer.map((w) => w.id + ":" + w.name + (w.code ? ":" + w.code : "")).join(",")); faults.push("Windows Error Reporting logged " + wer.map((w) => (w.id === 1002 ? "a hang of " : "a crash of ") + w.name + (w.code ? " (" + w.code + ")" : "")).join(", ")); }
  if (j.maxWpp > 1) rec.f(tag + "-per-process", j.maxWpp);
  if (j.hungSamples) rec.f(tag + "-hung", j.hungSamples);
  if (storm) faults.push("a storm, cut short at " + RNR_STORM_CAP + " after " + seconds + " s");
  else if (!finished) faults.push(o.what + " had not finished after " + RNR_BOUND_S + " s");
  return { faults, finished, storm, code, exited, samples };
}

const RNR_PENDING = "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager";
/** What the uninstall left, read the moment it ended, before the second install. */
function rnrLeft(dir, prog, product) {
  const left = [];
  const running = prog ? procsOf(prog) : [];
  if (running.length) left.push("the program still running (" + running.map((p) => p.pid).join(",") + ")");
  if (dir && fs.existsSync(dir)) left.push("the install folder " + dir + " (" + (() => { try { return fs.readdirSync(dir).length; } catch (e) { return "?"; } })() + " entries)");
  for (const k of [KU.uninstall, KM.uninstall].map(regKey)) if (present(k)) left.push("the uninstall entry " + k);
  const installKeys = [KU.install, KM.install].map(regKey).filter(present);
  const pend = valueOf(RNR_PENDING, "PendingFileRenameOperations");
  const entries = pend ? pend.split(/\\0/).filter(Boolean) : [];
  const naming = entries.filter((e) => (dir && e.toLowerCase().indexOf(dir.toLowerCase()) > -1) || e.toLowerCase().indexOf(String(product).toLowerCase()) > -1);
  if (naming.length) left.push("PendingFileRenameOperations names " + naming.length + ": " + few(naming));
  return { left, pending: entries.length, installKeys };
}

/** The program as a person leaves it after the Finish page: started by the page's Run box, or by the leg where that box started nothing. */
async function rnrSettle(prog) {
  for (let i = 0; i < 30 && !procsOf(prog).length; i++) await sleep(1000);
  if (!procsOf(prog).length) {
    const ud = path.join(process.env.APPDATA, T.packageName), docs = path.join(LAB, "app-documents");
    fs.mkdirSync(docs, { recursive: true });
    const args = ["--user-data-dir=" + ud], opts = { stdio: "ignore", windowsHide: false, env: Object.assign({}, process.env, { ETIUDA_TEST_DOCUMENTS: docs }) };
    const no = E.shellLaunchRefusal(WHO, args, opts);
    if (no) return 0; /* the program in its tray is optional: the sequence is measured without it */
    E.shellLaunch(WHO, prog, args, opts);
  }
  await sleep(20000);
  return procsOf(prog).length;
}

async function reinstallNoReboot(rec, ask) {
  const leg = ask ? "reinstall-no-reboot-ask" : "reinstall-no-reboot";
  const wall = E.windowWallRefusal(WHO);
  if (wall) throw new NoVerdict("the leg opens the installer's, the uninstaller's and the program's windows and the window wall refuses: " + wall[0]);
  let exe;
  try { exe = tsSetup(rec); rec.f("build", "test-service"); } catch (e) { if (!(e instanceof NoVerdict)) throw e; exe = NEWER; rec.f("build", "ordinary"); rec.f("ts-why", oneLine(e.message)); }
  const product = G.setupIdentity(exe).productName || PRODUCT;
  let prog = "";
  rec.after("uninstall", async () => oneLine(await uninstallUser()) + (machineDir() ? "; " + oneLine(await uninstallMachine()) : ""));
  rec.after("program", async () => { const ps2 = prog ? procsOf(prog) : []; for (const p of ps2) E.killTree(p.pid); return "stopped " + ps2.length; });
  const faults = [];
  const setupDone = (s, exited) => { const last = s.slice(-2); return exited && last.length === 2 && last.every((x) => (x.setup | 0) === 0 && (x.wins | 0) === 0); };
  const setupOpts = { title: "Setup", product, drive: "setup", procExe: exe, setupRules: true, what: "the Setup", finished: setupDone };

  /* 1. the first install, through its pages */
  const i1 = await rnrRun(rec, leg, "install1", exe, [], setupOpts);
  faults.push(...i1.faults.map((f) => "first install: " + f));
  const dir = userDir() || machineDir();
  rec.f("scope", userDir() ? "user" : machineDir() ? "machine" : "-");
  prog = dir ? path.join(dir, PRODUCT + ".exe") : "";
  if (!prog || !fs.existsSync(prog)) {
    if (faults.length) { rec.end(false, faults.join("; ")); return; }
    throw new NoVerdict("the first install, driven through its pages, left no program (exit " + i1.code + "); the pages pressed are in rnr-" + leg + "-install1.jsonl");
  }
  /* 2. then, RNR_CYCLES times (a race wants repeats): the program as the Finish page left it, quit (main) or left running (ask), the
     uninstall from the Apps entry through its pages, what it left, and the same Setup again through its pages. The first cycle with a
     fault is the last, so its records are the clean evidence. */
  let cycles = 0;
  for (let c = 1; c <= RNR_CYCLES && !faults.length; c++) {
    cycles = c;
    const p = "c" + c + "-";
    rec.f(p + "app-procs", await rnrSettle(prog));
    if (!ask) {
      spawnSync(prog, ["--update-close"], { stdio: "ignore", windowsHide: true, timeout: 20000 });
      for (let i = 0; i < 20 && procsOf(prog).length; i++) await sleep(1000);
      rec.f(p + "app-quit", procsOf(prog).length ? "still-running" : "quit");
    }
    const entry = valueOf(regKey(KU.uninstall), "UninstallString") || valueOf(regKey(KM.uninstall), "UninstallString");
    const un = exeOf(entry);
    if (!un || !fs.existsSync(un)) { faults.push("cycle " + c + ": no uninstaller named by the Apps entry (" + oneLine(entry) + ")"); break; }
    const unArgs = entry.slice(entry.indexOf(un) + un.length + 1).trim().split(/\s+/).filter(Boolean);
    const unDone = (smp) => { const last = smp.slice(-3); return last.length === 3 && (last[0].t | 0) >= 5 && last.every((x) => (x.wins | 0) === 0 && (x.others | 0) === 0 && (x.setup | 0) === 0); };
    const u = await rnrRun(rec, leg, p + "uninstall", un, unArgs, { title: "Uninstall", product, drive: "uninstall", procExe: un, app: prog, setupRules: false, hungRule: true, what: "the uninstall", finished: unDone });
    faults.push(...u.faults.map((f) => "cycle " + c + " uninstall: " + f));
    await sleep(3000);
    const left = rnrLeft(dir, prog, product);
    rec.f(p + "left", left.left.length); rec.f(p + "pending-renames", left.pending); rec.f(p + "install-keys-left", left.installKeys.length);
    faults.push(...left.left.map((f) => "cycle " + c + " left by the uninstall: " + f));
    const i2 = await rnrRun(rec, leg, p + "install", exe, [], setupOpts);
    faults.push(...i2.faults.map((f) => "cycle " + c + " reinstall: " + f));
    if (!fs.existsSync(prog) && !faults.length) faults.push("cycle " + c + " reinstall: no program at " + prog);
  }
  rec.f("cycles", cycles + "/" + RNR_CYCLES);
  rec.end(!faults.length, faults.length ? faults.join("; ")
    : "installed through its pages, then " + RNR_CYCLES + " times " + (ask ? "uninstalled with the program running in its tray" : "quit and uninstalled") + " from the Apps entry and installed again through its pages without a reboot: one Setup process and one Setup window at every sample, no window stopped responding, no exception, each phase within " + RNR_BOUND_S + " s, nothing left between");
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
  "system-push": systemPush, "ext-claimed": extClaimed, "ts-cycle": tsCycle, "ts-uninstall": tsUninstall, "shipped-detect": shippedDetect, "nonpersistent": nonPersistent, "net-hosts": netHosts,
  "short-stage": shortStage, "old-copy-kept": oldCopyKept, "pre-own-survives": preOwnSurvives, "foreign-folder-refused": foreignFolderRefused,
  "per-user-at-sign-in": perUserAtSignIn, "pf-dotdot": pfDotdot, "uninstall-data": uninstallData,
  "reinstall-no-reboot": (rec) => reinstallNoReboot(rec, false), "reinstall-no-reboot-ask": (rec) => reinstallNoReboot(rec, true) };

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
