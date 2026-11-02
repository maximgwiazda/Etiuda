/* The desk guard shared by tests/pick-desk.js and any later leg that writes the clipboard or
 * sends keys. It refuses unless the desk has been still for five minutes, stops when the desk
 * is touched or the helper's window is not in front, and puts the clipboard back.
 *
 * The lab path (-Lab) stands in for the clipboard, the foreground and the input tick. It does
 * not call the real clipboard or send a real key. node tests/pick-desk.js --guards runs it.
 */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { WINDOWS_VAR } = require(path.join(__dirname, "..", "tests", "engine.js")); /* the wall's one name, engine.js's (engine-selftest 22e) */

const ROOT = path.resolve(__dirname, "..");
const PICK = path.join(ROOT, "tests", "pick-desk.js");
const LOCK_MOD = path.join(ROOT, "tools", "machine-lock.mjs");
const SELF = __filename;

const STOP_NOTE = "pick-desk: stopped, the desk was touched";
const FOREIGN_NOTE = "pick-desk: the clipboard holds more than text; nothing was written";
const RESTORE_NOTE = "pick-desk: the clipboard could not be restored";
const IDLE_NEED = 5;
const REFUSED_RE = /^#refused ([a-z][a-z0-9-]*)\s*$/m;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";

/* A reading under five minutes, or none, refuses before the helper form exists. */
function idleText(minutes) {
  if (!Number.isFinite(minutes)) return "unreadable";
  const rounded = Math.round(minutes * 10) / 10;
  return String(rounded);
}

function idleBlock(minutes) {
  /* plant:desk-idle */
  if (!(Number.isFinite(minutes) && minutes >= IDLE_NEED)) {
    const n = idleText(minutes);
    const line = "pick-desk: the desk is in use (idle " + n + " min, " + IDLE_NEED + " needed); nothing was written";
    return { exit: 78, refused: "desk-idle", lines: ["#refused desk-idle", line] };
  }
  /* plant:desk-idle-end */
  return null;
}

function restoreLine(dir) {
  if (dir && fs.existsSync(path.join(dir, "restore-failed.txt"))) return RESTORE_NOTE;
  return "";
}

/* The lines a leg prints at the end. The restore note, when there is one, is last. */
function closingLines(lines, dir) {
  const out = (lines || []).slice();
  const note = restoreLine(dir);
  if (note) out.push(note);
  return out;
}

let lockMod;
function loadLock() {
  if (!lockMod) lockMod = import(pathToFileURL(LOCK_MOD).href);
  return lockMod;
}

async function readIdleMinutes() {
  const mod = await loadLock();
  return mod.readIdleMinutes();
}

async function idleCheck() {
  const minutes = await readIdleMinutes();
  const block = idleBlock(minutes);
  if (block) {
    block.lines.forEach(l => process.stdout.write(l + "\n"));
    return block.exit;
  }
  process.stdout.write("pick-desk: idle " + minutes + " min allows the run\n");
  return 0;
}

const HELPER = [
  "param([string]$Dir, [switch]$Lab)",
  "$ErrorActionPreference = 'Stop'",
  "$ProgressPreference = 'SilentlyContinue'",
  "$script:n = 0",
  "$script:ownTick = $null",
  "$script:savedRaw = $null",
  "$script:savedEmpty = $false",
  "$script:foreign = $false",
  "$script:sawClip = $false",
  "$script:held = New-Object System.Collections.Generic.List[int]",
  "$script:formHandle = [IntPtr]::Zero",
  "$utf8 = New-Object System.Text.UTF8Encoding $false",
  "$vk = @{ ctrl = 0x11; shift = 0x10; alt = 0x12; space = 0x20; enter = 0x0D; escape = 0x1B; v = 0x56; '0' = 0x30; f9 = 0x78 }",
  "$allowed = @('Text','UnicodeText','System.String','OEMText','Locale')",
  "function Read-Tick {",
  "  if ($Lab) { return [uint32]((Get-Content -Raw (Join-Path $Dir 'lab-tick.txt')).Trim()) }",
  "  return [PickU]::LastTick()",
  "}",
  "function Note-Tick { $script:ownTick = Read-Tick }",
  "function Tick-Foreign([uint32]$now, [uint32]$mark) {",
  "  $d = ($now - $mark) -band 0xFFFFFFFF",
  "  return ($d -gt 200)",
  "}",
  "function Own-Input-Blocks {",
  "  <# plant:desk-touched #>",
  "  if ($null -ne $script:ownTick) {",
  "    $now = Read-Tick",
  "    if (Tick-Foreign $now ([uint32]$script:ownTick)) { return $true }",
  "  }",
  "  <# plant:desk-touched-end #>",
  "  return $false",
  "}",
  "function Read-Fg {",
  "  if ($Lab) { return [IntPtr]([int]((Get-Content -Raw (Join-Path $Dir 'lab-fg.txt')).Trim())) }",
  "  return [PickU]::GetForegroundWindow()",
  "}",
  "function Send-Key([byte]$k, [uint32]$flags) {",
  "  if ($Lab) {",
  "    Add-Content -Path (Join-Path $Dir 'lab-keys.log') -Value ($k.ToString() + ' ' + $flags.ToString())",
  "    return",
  "  }",
  "  Set-Content -Path (Join-Path $Dir 'real-key.txt') -Value '1'",
  "  [PickU]::keybd_event($k, 0, $flags, [UIntPtr]::Zero)",
  "}",
  "function Press([string]$spec) {",
  "  <# plant:desk-focus #>",
  "  $fg = Read-Fg",
  "  if ($fg -ne $script:formHandle) { return 'notfg' }",
  "  <# plant:desk-focus-end #>",
  "  $ks = @($spec.Split('+') | ForEach-Object { [byte]$vk[$_] })",
  "  foreach ($k in $ks) { Send-Key $k 0 }",
  "  [array]::Reverse($ks)",
  "  foreach ($k in $ks) { Send-Key $k 2 }",
  "  return 'ok'",
  "}",
  "function Read-LabRaw { return [IO.File]::ReadAllText((Join-Path $Dir 'lab-clip.json'), $utf8) }",
  "function Take-Snapshot {",
  "  if ($Lab) {",
  "    $raw = Read-LabRaw",
  "    $o = $raw | ConvertFrom-Json",
  "    $formats = @()",
  "    if ($null -ne $o.formats) { $formats = @($o.formats) }",
  "    return @{ formats = $formats; raw = $raw; text = [string]$o.text; empty = ($formats.Count -eq 0) }",
  "  }",
  "  $d = [Windows.Forms.Clipboard]::GetDataObject()",
  "  if (-not $d) { return @{ formats = @(); raw = ''; text = ''; empty = $true } }",
  "  $formats = @($d.GetFormats())",
  "  if ($formats.Count -eq 0) { return @{ formats = @(); raw = ''; text = ''; empty = $true } }",
  "  try { $text = [Windows.Forms.Clipboard]::GetText() } catch { return @{ formats = @('unreadable'); raw = ''; text = ''; bad = $true } }",
  "  return @{ formats = $formats; raw = $text; text = $text; empty = [string]::IsNullOrEmpty($text) }",
  "}",
  "function Ensure-Snapshot {",
  "  if ($script:sawClip) { return (-not $script:foreign) }",
  "  $script:sawClip = $true",
  "  $c = Take-Snapshot",
  "  $other = @($c.formats | Where-Object { $_ -and ($allowed -notcontains $_) })",
  "  <# plant:desk-clip-foreign #>",
  "  if ($c.bad -or $other.Count -gt 0) {",
  "    $script:foreign = $true",
  "    return $false",
  "  }",
  "  <# plant:desk-clip-foreign-end #>",
  "  if ($Lab) { $script:savedRaw = $c.raw } else { $script:savedRaw = [string]$c.text; $script:savedEmpty = [bool]$c.empty }",
  "  return $true",
  "}",
  "function Write-Clip([string]$text) {",
  "  if ($Lab) {",
  "    $json = '{\"formats\":[\"Text\"],\"text\":' + ($text | ConvertTo-Json -Compress) + '}'",
  "    [IO.File]::WriteAllText((Join-Path $Dir 'lab-clip.json'), $json, $utf8)",
  "    $p = Join-Path $Dir 'lab-writes.txt'",
  "    $n = 0",
  "    if (Test-Path $p) { $n = [int](Get-Content -Raw $p) }",
  "    Set-Content -Path $p -Value ($n + 1)",
  "    return",
  "  }",
  "  Set-Content -Path (Join-Path $Dir 'real-clip-write.txt') -Value '1'",
  "  [Windows.Forms.Clipboard]::SetText($text)",
  "}",
  "function Restore-Clip {",
  "  if ($Lab -and (Test-Path (Join-Path $Dir 'lab-restore-fail.txt'))) { throw 'lab restore refused' }",
  "  <# plant:desk-clip-restore #>",
  "  if ($script:foreign) { return }",
  "  if ($null -eq $script:savedRaw) { return }",
  "  if ($Lab) {",
  "    [IO.File]::WriteAllText((Join-Path $Dir 'lab-clip.json'), [string]$script:savedRaw, $utf8)",
  "    return",
  "  }",
  "  if ($script:savedEmpty -or [string]::IsNullOrEmpty([string]$script:savedRaw)) { [Windows.Forms.Clipboard]::Clear() }",
  "  else { [Windows.Forms.Clipboard]::SetText([string]$script:savedRaw) }",
  "  <# plant:desk-clip-restore-end #>",
  "}",
  "function Do-Hold([int]$id, [uint32]$mods, [uint32]$vkCode) {",
  "  if ($Lab) { $script:held.Add($id); return 'True' }",
  "  $ok = [PickU]::RegisterHotKey($script:formHandle, $id, $mods, $vkCode)",
  "  if ($ok) { $script:held.Add($id) }",
  "  return [string]$ok",
  "}",
  "function Do-Free([int]$id) {",
  "  if ($Lab) { [void]$script:held.Remove($id); return 'True' }",
  "  $ok = [PickU]::UnregisterHotKey($script:formHandle, $id)",
  "  [void]$script:held.Remove($id)",
  "  return [string]$ok",
  "}",
  "function Free-Holds {",
  "  if ($Lab) {",
  "    $ids = @($script:held)",
  "    $text = ''",
  "    if ($ids.Count -gt 0) { $text = ($ids -join ',') }",
  "    Set-Content -Path (Join-Path $Dir 'lab-freed.txt') -Value $text",
  "    $script:held.Clear()",
  "    Set-Content -Path (Join-Path $Dir 'lab-held.txt') -Value ''",
  "    return",
  "  }",
  "  foreach ($id in @($script:held)) {",
  "    try { [void][PickU]::UnregisterHotKey($script:formHandle, [int]$id) } catch { }",
  "  }",
  "  $script:held.Clear()",
  "}",
  "function Finish {",
  "  try { Free-Holds } catch { Set-Content -Path (Join-Path $Dir 'free-failed.txt') -Value $_.Exception.Message }",
  "  try { Restore-Clip } catch { Set-Content -Path (Join-Path $Dir 'restore-failed.txt') -Value $_.Exception.Message }",
  "}",
  "function Answer([string]$c) {",
  "  if ($c -eq 'fg') {",
  "    $h = if ($Lab) { $script:formHandle } else { $f.Handle }",
  "    return [string]((Read-Fg) -eq $h)",
  "  }",
  "  if ($c -eq 'activate') {",
  "    if (-not $Lab) { $f.Activate(); $t.Focus() | Out-Null }",
  "    Note-Tick",
  "    return 'ok'",
  "  }",
  "  if ($c -eq 'clip') {",
  "    if ($Lab) {",
  "      $raw = Read-LabRaw",
  "      $obj = $raw | ConvertFrom-Json",
  "      return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$obj.text))",
  "    }",
  "    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([Windows.Forms.Clipboard]::GetText()))",
  "  }",
  "  if ($c -eq 'text') {",
  "    if ($Lab) { return '' }",
  "    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t.Text))",
  "  }",
  "  if ($c -eq 'clear') {",
  "    if (-not $Lab) { $t.Text = '' }",
  "    return 'ok'",
  "  }",
  "  if ($c -like 'setclip *') {",
  "    if (Own-Input-Blocks) { return 'touched' }",
  "    if (-not (Ensure-Snapshot)) { return 'foreign' }",
  "    $text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($c.Substring(8)))",
  "    Write-Clip $text",
  "    Note-Tick",
  "    return 'ok'",
  "  }",
  "  if ($c -like 'hold *') {",
  "    $p = $c.Substring(5).Split(' ')",
  "    return (Do-Hold ([int]$p[0]) ([uint32]$p[1]) ([uint32]$p[2]))",
  "  }",
  "  if ($c -like 'free *') { return (Do-Free ([int]$c.Substring(5).Trim())) }",
  "  if ($c -like 'keys *') {",
  "    if (Own-Input-Blocks) { return 'touched' }",
  "    $r = Press ($c.Substring(5).Trim())",
  "    if ($r -eq 'ok') { Note-Tick }",
  "    return $r",
  "  }",
  "  if ($c -eq 'close') { return '__close__' }",
  "  return ''",
  "}",
  "try {",
  "  if ($Lab) {",
  "    $script:formHandle = [IntPtr]([int]((Get-Content -Raw (Join-Path $Dir 'lab-form.txt')).Trim()))",
  "    $quiet = 0",
  "    while ($true) {",
  "      $cmd = Join-Path $Dir ('cmd-' + $script:n + '.txt')",
  "      if (-not (Test-Path $cmd)) {",
  "        Start-Sleep -Milliseconds 20",
  "        $quiet += 20",
  "        if ($quiet -gt 30000) { break }",
  "        continue",
  "      }",
  "      $quiet = 0",
  "      $c = (Get-Content -Raw $cmd).Trim()",
  "      $a = Answer $c",
  "      if ($a -eq '__close__') {",
  "        Set-Content -Path (Join-Path $Dir ('ans-' + $script:n + '.txt')) -Value 'ok'",
  "        break",
  "      }",
  "      Set-Content -Path (Join-Path $Dir ('ans-' + $script:n + '.txt')) -Value $a",
  "      $script:n++",
  "    }",
  "  } else {",
  "    Add-Type -AssemblyName System.Windows.Forms",
  "    Add-Type @'",
  "using System;",
  "using System.Runtime.InteropServices;",
  "public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }",
  "public static class PickU {",
  "  [DllImport(\"user32.dll\")] public static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);",
  "  [DllImport(\"user32.dll\")] public static extern bool UnregisterHotKey(IntPtr h, int id);",
  "  [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
  "  [DllImport(\"user32.dll\")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);",
  "  [DllImport(\"user32.dll\")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);",
  "  public static uint LastTick() {",
  "    LASTINPUTINFO lii = new LASTINPUTINFO();",
  "    lii.cbSize = (uint)Marshal.SizeOf(lii);",
  "    if (!GetLastInputInfo(ref lii)) { return 0; }",
  "    return lii.dwTime;",
  "  }",
  "}",
  "'@",
  "    $f = New-Object Windows.Forms.Form",
  "    $f.Text = 'pick-desk chat'; $f.StartPosition = 'Manual'; $f.Left = 200; $f.Top = 200; $f.Width = 640; $f.Height = 420",
  "    $t = New-Object Windows.Forms.TextBox; $t.Multiline = $true; $t.Dock = 'Fill'; $f.Controls.Add($t)",
  "    $script:formHandle = $f.Handle",
  "    $timer = New-Object Windows.Forms.Timer; $timer.Interval = 50",
  "    $timer.Add_Tick({",
  "      $cmd = Join-Path $Dir ('cmd-' + $script:n + '.txt')",
  "      if (-not (Test-Path $cmd)) { return }",
  "      $c = (Get-Content -Raw $cmd).Trim()",
  "      $a = Answer $c",
  "      if ($a -eq '__close__') {",
  "        Set-Content -Path (Join-Path $Dir ('ans-' + $script:n + '.txt')) -Value 'ok'",
  "        $f.Close()",
  "        return",
  "      }",
  "      Set-Content -Path (Join-Path $Dir ('ans-' + $script:n + '.txt')) -Value $a",
  "      $script:n++",
  "    })",
  "    $f.Add_Shown({ $script:formHandle = $f.Handle; $f.Activate(); $t.Focus() | Out-Null; $timer.Start() })",
  "    [Windows.Forms.Application]::Run($f)",
  "  }",
  "} finally { Finish }",
];

function helperScript() { return HELPER.join("\n"); }

function childEnv(extra) {
  const env = Object.assign({}, process.env);
  delete env[WINDOWS_VAR];
  delete env.ETIUDA_LOCK_PATH;
  delete env.ETIUDA_TEST_IDLE_MINUTES;
  return Object.assign(env, extra || {});
}

function helperError(dir) {
  try {
    const buf = fs.readFileSync(path.join(dir, "helper-err.txt"));
    if (buf.includes(0)) return buf.toString("utf16le").trim();
    return buf.toString("utf8").trim();
  } catch (e) { return ""; }
}

function b64(s) { return Buffer.from(String(s), "utf8").toString("base64"); }

function clipJson(text, formats) {
  return JSON.stringify({ formats: formats || ["Text"], text: text });
}

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-guard-"));
}

function waitExit(proc, ms) {
  return new Promise(resolve => {
    if (!proc || proc.exitCode !== null) return resolve(proc ? proc.exitCode : null);
    const t = setTimeout(() => resolve(null), ms);
    proc.once("exit", code => { clearTimeout(t); resolve(code); });
  });
}

function askCmd(dir, state, cmd) {
  const n = state.n++;
  const dest = path.join(dir, "cmd-" + n + ".txt");
  fs.writeFileSync(dest + ".tmp", cmd, "utf8");
  fs.renameSync(dest + ".tmp", dest);
  const ans = path.join(dir, "ans-" + n + ".txt");
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (fs.existsSync(ans)) {
        setTimeout(() => {
          try { resolve(fs.readFileSync(ans, "utf8").replace(/^\uFEFF/, "").trim()); }
          catch (e) { reject(e); }
        }, 30);
        return;
      }
      if (Date.now() - t0 > 25000) {
        reject(new Error("the lab helper did not answer " + cmd + " " + helperError(dir).slice(0, 500)));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

function startHelper(dir, script) {
  fs.writeFileSync(path.join(dir, "form.ps1"), script, "utf8");
  fs.writeFileSync(path.join(dir, "lab-form.txt"), "1001", "utf8");
  if (!fs.existsSync(path.join(dir, "lab-fg.txt"))) fs.writeFileSync(path.join(dir, "lab-fg.txt"), "1001", "utf8");
  if (!fs.existsSync(path.join(dir, "lab-tick.txt"))) fs.writeFileSync(path.join(dir, "lab-tick.txt"), "1000", "utf8");
  const fd = fs.openSync(path.join(dir, "helper-err.txt"), "w");
  const child = spawn("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass",
    "-File", path.join(dir, "form.ps1"), "-Dir", dir, "-Lab",
  ], { stdio: ["ignore", "ignore", fd], windowsHide: true, cwd: dir });
  fs.closeSync(fd);
  return child;
}

async function withHelper(dir, script, originalText, fn) {
  const original = Buffer.from(originalText, "utf8");
  fs.writeFileSync(path.join(dir, "lab-clip.json"), original);
  const child = startHelper(dir, script);
  const state = { n: 0 };
  let closed = false;
  const clipPath = path.join(dir, "lab-clip.json");
  const api = {
    ask: async cmd => {
      const a = await askCmd(dir, state, cmd);
      if (cmd === "close") closed = true;
      return a;
    },
    keyCount: () => {
      const p = path.join(dir, "lab-keys.log");
      if (!fs.existsSync(p)) return 0;
      return fs.readFileSync(p, "utf8").split(/\r?\n/).filter(l => l.trim() !== "").length;
    },
    writes: () => {
      const p = path.join(dir, "lab-writes.txt");
      if (!fs.existsSync(p)) return 0;
      const n = Number(String(fs.readFileSync(p, "utf8")).trim());
      return Number.isFinite(n) ? n : 0;
    },
    markers: () => fs.existsSync(path.join(dir, "real-key.txt")) || fs.existsSync(path.join(dir, "real-clip-write.txt")),
    clipEquals: () => fs.existsSync(clipPath) && fs.readFileSync(clipPath).equals(original),
  };
  let body, err = null;
  try { body = await fn(api); }
  catch (e) { err = e; }
  if (!closed && child.exitCode === null) {
    try { await api.ask("close"); } catch (e) { /* the helper may already be gone */ }
  }
  await waitExit(child, 5000);
  if (child.exitCode === null) {
    try { process.kill(child.pid); } catch (e) { /* already gone */ }
  }
  return {
    body: body,
    err: err,
    restored: fs.existsSync(clipPath) && fs.readFileSync(clipPath).equals(original),
    markers: api.markers(),
    errText: helperError(dir),
    dir: dir,
  };
}

function spawnIdle(value) {
  const dir = makeDir();
  const lock = path.join(dir, "lab.lock");
  fs.writeFileSync(lock, "", "utf8");
  const sentinel = Buffer.from(clipJson("desk-guard sentinel"), "utf8");
  const clip = path.join(dir, "lab-clip.json");
  fs.writeFileSync(clip, sentinel);
  const r = spawnSync(process.execPath, [PICK, "--idle-check"], {
    cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 20000,
    env: childEnv({ ETIUDA_LOCK_PATH: lock, ETIUDA_TEST_IDLE_MINUTES: String(value) }),
  });
  let after = null;
  try { after = fs.readFileSync(clip); } catch (e) { after = null; }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* lab */ }
  return {
    status: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    clipSame: !!(after && after.equals(sentinel)),
  };
}

function sourceOrder() {
  const src = fs.readFileSync(PICK, "utf8");
  const wall = src.indexOf('E.windowWall("tests/pick-desk.js")');
  const idle = src.indexOf("deskInput.idleBlock");
  const launch = src.indexOf("shellLaunch");
  const form = src.indexOf("form.ps1");
  return wall >= 0 && idle > wall && launch > idle && form > idle;
}

function lift(src, name) {
  const token = "plant:" + name;
  const lines = src.split(/\n/);
  let open = -1, close = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marked = line.indexOf("<#") >= 0 || line.indexOf("/*") >= 0;
    if (!marked || line.indexOf(token) < 0) continue;
    if (line.indexOf(token + "-end") >= 0) { if (open >= 0 && close < 0) close = i; }
    else if (open < 0) open = i;
  }
  if (open < 0 || close < 0) throw new Error("plant missed " + name);
  return lines.slice(0, open + 1).concat(lines.slice(close)).join("\n");
}

function loadPlanted(dir, names) {
  let src = fs.readFileSync(SELF, "utf8");
  for (const name of names) src = lift(src, name);
  /* The copy lives outside the tree, so engine.js is named to it by its absolute path. */
  const ENGINE_AT = 'path.join(__dirname, "..", "tests", "engine.js")';
  src = src.split(ENGINE_AT).join(JSON.stringify(path.join(__dirname, "..", "tests", "engine.js")));
  const dest = path.join(dir, "plant-" + names.join("-") + ".js");
  fs.writeFileSync(dest, src, "utf8");
  delete require.cache[require.resolve(dest)];
  return require(dest);
}

const IDLE_LINE = "pick-desk: the desk is in use (idle 0 min, " + IDLE_NEED + " needed); nothing was written";

async function scenarioTouched(script) {
  const dir = makeDir();
  const tick = path.join(dir, "lab-tick.txt");
  fs.writeFileSync(tick, "1000", "utf8");
  const sentinel = clipJson("desk-guard sentinel");
  const run = await withHelper(dir, script, sentinel, async api => {
    await api.ask("activate");
    fs.writeFileSync(tick, "1200", "utf8");
    const allow = await api.ask("keys enter");
    const afterAllow = api.keyCount();
    fs.writeFileSync(tick, "1401", "utf8");
    const answer = await api.ask("keys v");
    const lateSent = api.keyCount() > afterAllow;
    const clipAnswer = await api.ask("setclip " + b64("desk-guard other"));
    return { allow: allow, answer: answer, lateSent: lateSent, clipAnswer: clipAnswer, writes: api.writes(), markers: api.markers(), afterAllow: afterAllow };
  });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* lab */ }
  return Object.assign({ restored: run.restored, markers: run.markers, err: run.err, errText: run.errText }, run.body || {});
}

async function scenarioFocus(script) {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, "lab-fg.txt"), "1001", "utf8");
  fs.writeFileSync(path.join(dir, "lab-tick.txt"), "5000", "utf8");
  const sentinel = clipJson("desk-guard sentinel");
  const run = await withHelper(dir, script, sentinel, async api => {
    await api.ask("activate");
    const okAns = await api.ask("keys enter");
    const n1 = api.keyCount();
    fs.writeFileSync(path.join(dir, "lab-fg.txt"), "2002", "utf8");
    const bad = await api.ask("keys v");
    const n2 = api.keyCount();
    return { okAns: okAns, bad: bad, n1: n1, n2: n2, markers: api.markers() };
  });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* lab */ }
  return Object.assign({ restored: run.restored, markers: run.markers, err: run.err, errText: run.errText }, run.body || {});
}

async function scenarioFull(script) {
  const dir = makeDir();
  const sentinel = clipJson("desk-guard sentinel " + process.pid);
  const run = await withHelper(dir, script, sentinel, async api => {
    const ans = await api.ask("setclip " + b64("desk-guard other"));
    const dirty = !api.clipEquals();
    return { ans: ans, dirty: dirty, writes: api.writes(), markers: api.markers() };
  });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* lab */ }
  return Object.assign({ restored: run.restored, markers: run.markers, err: run.err, errText: run.errText }, run.body || {});
}

async function scenarioStopped(script) {
  const dir = makeDir();
  const tick = path.join(dir, "lab-tick.txt");
  fs.writeFileSync(tick, "3000", "utf8");
  const sentinel = clipJson("desk-guard sentinel stopped");
  const run = await withHelper(dir, script, sentinel, async api => {
    await api.ask("activate");
    const wrote = await api.ask("setclip " + b64("desk-guard other"));
    fs.writeFileSync(tick, "4000", "utf8");
    const answer = await api.ask("keys enter");
    return { wrote: wrote, answer: answer, markers: api.markers() };
  });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* lab */ }
  return Object.assign({ restored: run.restored, markers: run.markers, err: run.err, errText: run.errText }, run.body || {});
}

async function scenarioForeign(script) {
  const dir = makeDir();
  const sentinel = clipJson("", ["Bitmap"]);
  const run = await withHelper(dir, script, sentinel, async api => {
    const answer = await api.ask("setclip " + b64("desk-guard other"));
    const midSame = api.clipEquals();
    return { answer: answer, midSame: midSame, writes: api.writes(), markers: api.markers() };
  });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* lab */ }
  return Object.assign({ restored: run.restored, markers: run.markers, err: run.err, errText: run.errText }, run.body || {});
}

function hookOffReading() {
  const dir = makeDir();
  const file = path.join(dir, "hook-off.mjs");
  const href = pathToFileURL(LOCK_MOD).href;
  fs.writeFileSync(file, [
    "import { readIdleMinutes, LOCK_PATH } from " + JSON.stringify(href) + ";",
    "process.env.ETIUDA_LOCK_PATH = LOCK_PATH;",
    "process.env.ETIUDA_TEST_IDLE_MINUTES = '12345';",
    "const got = readIdleMinutes();",
    "process.stdout.write(got === null || got === undefined ? 'null' : String(got));",
  ].join("\n"), "utf8");
  const r = spawnSync(process.execPath, [file], {
    cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 20000, env: childEnv({}),
  });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* lab */ }
  return { status: r.status, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").split(/\r?\n/)[0] || "" };
}

function detail(run) {
  if (!run) return "no run";
  if (run.err) return String(run.err.message || run.err).split("\n")[0];
  if (run.errText) return run.errText.split(/\r?\n/)[0];
  return "";
}

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) {
  skipped++;
  console.log("  SKIP  " + line);
}

async function knownPositives(impl, live) {
  const block = impl.idleBlock(0);
  let childOk = true, childSame = true, token = block ? (REFUSED_RE.exec(block.lines.join("\n")) || [])[1] || "" : "";
  if (live) {
    const child = spawnIdle("0");
    childOk = child.status === 78 && (REFUSED_RE.exec(child.stdout) || [])[1] === "desk-idle" && child.stdout.indexOf(IDLE_LINE) >= 0;
    childSame = child.clipSame;
    token = (REFUSED_RE.exec(child.stdout) || [])[1] || token;
  }
  const idleOk = !!(block && block.exit === 78 && block.lines.join("\n").indexOf(IDLE_LINE) >= 0
    && token === "desk-idle" && childOk && childSame && (!live || sourceOrder()));
  check(idleOk, "1pd the idle guard refuses a lab reading of 0 and writes nothing: exit "
    + (block ? block.exit : "none") + ", refused " + (token || "none") + ", order " + sourceOrder());

  const touched = await scenarioTouched(impl.helperScript());
  const touchedOk = touched.allow === "ok" && touched.afterAllow > 0 && touched.answer === "touched"
    && touched.lateSent === false && touched.clipAnswer === "touched" && touched.writes === 0
    && touched.markers === false && touched.restored === true && !touched.err;
  check(touchedOk, "5pd a tick 201 ms after the leg's own stops the run and sends no key: answer "
    + touched.answer + ", late key " + touched.lateSent + ", allow " + touched.allow
    + (detail(touched) ? " (" + detail(touched) + ")" : ""));

  const focus = await scenarioFocus(impl.helperScript());
  const focusOk = focus.okAns === "ok" && focus.n1 > 0 && focus.bad === "notfg" && focus.n2 === focus.n1
    && focus.markers === false && focus.restored === true && !focus.err;
  check(focusOk, "6pd a foreground that is not the helper's window stops the run and sends no key: "
    + focus.bad + ", keys " + focus.n1 + " then " + focus.n2
    + (detail(focus) ? " (" + detail(focus) + ")" : ""));

  const full = await scenarioFull(impl.helperScript());
  const stopped = await scenarioStopped(impl.helperScript());
  const refused = live ? spawnIdle("0") : { status: block && block.exit, clipSame: true };
  const clipOk = full.ans === "ok" && full.dirty === true && full.restored === true && full.markers === false
    && stopped.wrote === "ok" && stopped.answer === "touched" && stopped.restored === true && stopped.markers === false
    && refused.status === 78 && refused.clipSame === true && !full.err && !stopped.err;
  check(clipOk, "7pd the clipboard comes back after a full run, a stopped run and a refused run: full "
    + full.restored + ", stopped " + stopped.restored + ", refused " + (refused.clipSame && refused.status));

  const foreign = await scenarioForeign(impl.helperScript());
  const foreignOk = foreign.answer === "foreign" && foreign.writes === 0 && foreign.midSame === true
    && foreign.restored === true && foreign.markers === false && !foreign.err;
  check(foreignOk, "8pd a clipboard that is not text refuses before anything is written: answer "
    + foreign.answer + ", writes " + foreign.writes
    + (detail(foreign) ? " (" + detail(foreign) + ")" : ""));

  return { touched: touched, focus: focus, full: full, foreign: foreign };
}

async function runBefore() {
  asserted = 0; failed = 0; skipped = 0;
  const dir = makeDir();
  const impl = loadPlanted(dir, ["desk-idle", "desk-touched", "desk-focus", "desk-clip-foreign", "desk-clip-restore"]);
  await knownPositives(impl, false);
  console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=5");
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* lab */ }
  if (asserted + skipped !== 5) return 78;
  return failed > 63 ? 63 : failed;
}

async function runSuite() {
  asserted = 0; failed = 0; skipped = 0;
  const dirs = [];
  const impl = { idleBlock: idleBlock, helperScript: helperScript };
  try {
    await knownPositives(impl, true);

    const allow = spawnIdle("5");
    check(allow.status === 0 && allow.stdout.indexOf("allows the run") >= 0 && !/#refused/.test(allow.stdout) && allow.clipSame,
      "2pd an idle reading of 5 minutes allows the run and writes nothing: status " + allow.status);

    const session0 = spawnIdle("session0");
    const failRead = spawnIdle("fail");
    const un = "idle unreadable min, " + IDLE_NEED + " needed";
    check(session0.status === 78 && session0.stdout.indexOf(un) >= 0 && session0.clipSame
      && failRead.status === 78 && failRead.stdout.indexOf(un) >= 0 && failRead.clipSame,
      "3pd session 0 and an unreadable idle reading refuse as unreadable: session0 " + session0.status
      + ", fail " + failRead.status);

    const hook = hookOffReading();
    check(hook.status === 0 && hook.stdout !== "12345" && hook.stdout !== "",
      "4pd a test idle is ignored unless the lock path names a lab: status " + hook.status
      + " reading " + JSON.stringify(hook.stdout));

    const heldDir = makeDir();
    dirs.push(heldDir);
    const held = await withHelper(heldDir, helperScript(), clipJson("desk-guard sentinel"), async api => {
      const a = await api.ask("hold 1 6 32");
      const b = await api.ask("hold 2 7 135");
      return { a: a, b: b, markers: api.markers() };
    });
    const freed = fs.existsSync(path.join(heldDir, "lab-freed.txt")) ? fs.readFileSync(path.join(heldDir, "lab-freed.txt"), "utf8") : "";
    const still = fs.existsSync(path.join(heldDir, "lab-held.txt")) ? fs.readFileSync(path.join(heldDir, "lab-held.txt"), "utf8").trim() : "missing";
    const freedIds = freed.split(/[^0-9]+/).filter(Boolean);
    check(held.body && held.body.a === "True" && held.body.b === "True" && still === ""
      && freedIds.indexOf("1") >= 0 && freedIds.indexOf("2") >= 0 && held.markers === false && !held.err,
      "9pd registered hotkeys are freed when the helper exits: held " + JSON.stringify(still)
      + " freed " + JSON.stringify(freed.trim()) + (detail(held) ? " (" + detail(held) + ")" : ""));

    const loseDir = makeDir();
    dirs.push(loseDir);
    fs.writeFileSync(path.join(loseDir, "lab-restore-fail.txt"), "1", "utf8");
    const lost = await withHelper(loseDir, helperScript(), clipJson("desk-guard sentinel"), async api => {
      const ans = await api.ask("setclip " + b64("desk-guard other"));
      return { ans: ans, markers: api.markers() };
    });
    const tail = closingLines(["#counts checks=1 failed=0 expected=1", "  verdict"], loseDir);
    const pickSrc = fs.readFileSync(PICK, "utf8");
    const usesClosing = pickSrc.indexOf("deskInput.closingLines") >= 0
      && pickSrc.indexOf("process.exit(v.exit)") > pickSrc.indexOf("deskInput.closingLines");
    check(lost.body && lost.body.ans === "ok" && lost.restored === false && tail[tail.length - 1] === RESTORE_NOTE
      && usesClosing && lost.markers === false && !lost.err,
      "10pd a failed restore is the leg's last line: last " + JSON.stringify(tail[tail.length - 1])
      + ", restored " + lost.restored + (detail(lost) ? " (" + detail(lost) + ")" : ""));

    if (PLANTS_OFF) {
      skip("11pd lifting plant:desk-idle lets an idle of 0 through and turns 1pd red (ETIUDA_PLANTS=off)");
      skip("12pd lifting plant:desk-touched sends the key and turns 5pd red (ETIUDA_PLANTS=off)");
      skip("13pd lifting plant:desk-focus sends the key and turns 6pd red (ETIUDA_PLANTS=off)");
      skip("14pd lifting plant:desk-clip writes over the clipboard and turns 7pd and 8pd red (ETIUDA_PLANTS=off)");
    } else {
      const plantDir = makeDir();
      dirs.push(plantDir);
      let idlePlant = null, touchPlant = null, focusPlant = null, clipPlant = null, plantErr = "";
      try {
        idlePlant = loadPlanted(plantDir, ["desk-idle"]);
        touchPlant = loadPlanted(plantDir, ["desk-touched"]);
        focusPlant = loadPlanted(plantDir, ["desk-focus"]);
        clipPlant = loadPlanted(plantDir, ["desk-clip-foreign", "desk-clip-restore"]);
      } catch (e) { plantErr = e.message; }
      const idleLeg = !!(idlePlant && idlePlant.idleBlock(0) && idlePlant.idleBlock(0).exit === 78);
      check(idlePlant && !idleLeg, "11pd lifting plant:desk-idle lets an idle of 0 through and turns 1pd red"
        + (plantErr ? " (" + plantErr + ")" : ""));
      const touchRun = touchPlant ? await scenarioTouched(touchPlant.helperScript()) : { err: plantErr };
      check(!!touchPlant && touchRun.lateSent === true && touchRun.answer !== "touched",
        "12pd lifting plant:desk-touched sends the key and turns 5pd red: late key " + touchRun.lateSent
        + " answer " + touchRun.answer + (detail(touchRun) ? " (" + detail(touchRun) + ")" : ""));
      const focusRun = focusPlant ? await scenarioFocus(focusPlant.helperScript()) : { err: plantErr };
      check(!!focusPlant && focusRun.bad === "ok" && focusRun.n2 > focusRun.n1,
        "13pd lifting plant:desk-focus sends the key and turns 6pd red: answer " + focusRun.bad
        + " keys " + focusRun.n1 + " then " + focusRun.n2 + (detail(focusRun) ? " (" + detail(focusRun) + ")" : ""));
      const fullRun = clipPlant ? await scenarioFull(clipPlant.helperScript()) : { err: plantErr };
      const foreignRun = clipPlant ? await scenarioForeign(clipPlant.helperScript()) : { err: plantErr };
      const fullRed = !(fullRun.ans === "ok" && fullRun.dirty === true && fullRun.restored === true);
      const foreignRed = !(foreignRun.answer === "foreign" && foreignRun.writes === 0 && foreignRun.midSame === true);
      check(!!clipPlant && fullRed && foreignRed,
        "14pd lifting plant:desk-clip writes over the clipboard and turns 7pd and 8pd red: full restored "
        + fullRun.restored + ", foreign answer " + foreignRun.answer + " writes " + foreignRun.writes);
    }
  } finally {
    for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* lab */ } }
  }
  console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=14");
  if (asserted + skipped !== 14) {
    console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of 14 checks ran");
    return 78;
  }
  return failed > 63 ? 63 : failed;
}

async function main(argv) {
  const args = argv || process.argv;
  if (args.includes("--idle-check")) return idleCheck();
  if (args.includes("--guards-before")) return runBefore();
  if (args.includes("--guards")) return runSuite();
  return 0;
}

module.exports = {
  idleBlock: idleBlock,
  helperScript: helperScript,
  restoreLine: restoreLine,
  closingLines: closingLines,
  readIdleMinutes: readIdleMinutes,
  main: main,
  STOP_NOTE: STOP_NOTE,
  FOREIGN_NOTE: FOREIGN_NOTE,
  RESTORE_NOTE: RESTORE_NOTE,
};
