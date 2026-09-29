/* The picker over a real window: what tests/pick.mjs cannot prove in node, driven in Electron.
 *
 *   node tests/pick-desk.js
 *
 * WHAT IT PROVES. That Windows itself holds the combination (a second program asking for it is
 * refused, which a keyboard hook would not cause), that the hotkey pressed over another program's
 * window opens the picker focused, that Enter puts on the clipboard what the desk's own page puts
 * there for the same text, that the focus goes back to that other window and a Ctrl+V there
 * pastes the reply, and that Escape, a second press and a repeat do what they say.
 *
 * WHAT IT COSTS. It TAKES THE FOREGROUND AND SENDS REAL KEYS for about twenty seconds, so it is
 * run by hand with nobody at the keyboard, never in a chain: tests/engine-selftest.js names it
 * among the files that are not gates. The "chat" is a window of a PowerShell form of this file's
 * own, placed at 200,200; the desk's window is off screen; the picker opens by the pointer.
 *
 * NO CONTENT. The catalog is invented here. The clipboard is read by the form, compared, and never
 * printed beyond its length.
 *
 * Exit code is the number of failed checks, capped at 63, 78 where the run produced no verdict.
 */
"use strict";
const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (process.platform !== "win32") E.refuse("tests/pick-desk.js drives Windows' own hotkey and focus, so it runs on Windows only");
const PORT = E.portBlock("pick-desk");
const LEASED = E.takeLeases(["ports:" + PORT, "desk:foreground"], 10, "tests/pick-desk.js");
console.log("       debugging port " + PORT + "; leases: " + LEASED.said);
const EXPECTED = 11;
let checks = 0, fails = 0, reachedEnd = false, child = null, form = null, b = null;
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-pick-desk-"));

function electronExe() {
  const dir = path.join(E.ROOT, "node_modules", "electron");
  return path.join(dir, "dist", fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim());
}

/* ---- the chat: a form of this run's own, driven through files, which also presses the keys ---- */
const FORM_PS1 = [
  "param([string]$Dir)",
  "Add-Type -AssemblyName System.Windows.Forms",
  "Add-Type @'",
  "using System; using System.Runtime.InteropServices;",
  "public static class PickU {",
  "  [DllImport(\"user32.dll\")] public static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);",
  "  [DllImport(\"user32.dll\")] public static extern bool UnregisterHotKey(IntPtr h, int id);",
  "  [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
  "  [DllImport(\"user32.dll\")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);",
  "}",
  "'@",
  "$f = New-Object Windows.Forms.Form",
  "$f.Text = 'pick-desk chat'; $f.StartPosition = 'Manual'; $f.Left = 200; $f.Top = 200; $f.Width = 640; $f.Height = 420",
  "$t = New-Object Windows.Forms.TextBox; $t.Multiline = $true; $t.Dock = 'Fill'; $f.Controls.Add($t)",
  "$vk = @{ ctrl = 0x11; shift = 0x10; alt = 0x12; space = 0x20; enter = 0x0D; escape = 0x1B; v = 0x56; '0' = 0x30; f9 = 0x78 }",
  "function Press($spec) { $ks = $spec.Split('+') | ForEach-Object { [byte]$vk[$_] }",
  "  foreach ($k in $ks) { [PickU]::keybd_event($k, 0, 0, [UIntPtr]::Zero) }",
  "  [array]::Reverse($ks); foreach ($k in $ks) { [PickU]::keybd_event($k, 0, 2, [UIntPtr]::Zero) } }",
  "$n = 0",
  "$timer = New-Object Windows.Forms.Timer; $timer.Interval = 50",
  "$timer.Add_Tick({",
  "  $cmd = Join-Path $Dir ('cmd-' + $script:n + '.txt')",
  "  if (-not (Test-Path $cmd)) { return }",
  "  $c = (Get-Content -Raw $cmd).Trim(); $a = ''",
  "  if ($c -eq 'fg') { $a = [string]([PickU]::GetForegroundWindow() -eq $f.Handle) }",
  "  elseif ($c -eq 'activate') { $f.Activate(); $t.Focus() | Out-Null; $a = 'ok' }",
  "  elseif ($c -eq 'clip') { $a = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([Windows.Forms.Clipboard]::GetText())) }",
  "  elseif ($c -eq 'text') { $a = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t.Text)) }",
  "  elseif ($c -eq 'clear') { $t.Text = ''; $a = 'ok' }",
  "  elseif ($c -like 'hold *') { $p = $c.Substring(5).Split(' '); $a = [string][PickU]::RegisterHotKey($f.Handle, [int]$p[0], [uint32]$p[1], [uint32]$p[2]) }",
  "  elseif ($c -like 'free *') { $a = [string][PickU]::UnregisterHotKey($f.Handle, [int]$c.Substring(5)) }",
  "  elseif ($c -like 'keys *') { Press $c.Substring(5); $a = 'ok' }",
  "  elseif ($c -eq 'close') { $a = 'ok'; Set-Content -Path (Join-Path $Dir ('ans-' + $script:n + '.txt')) -Value $a; $f.Close(); return }",
  "  Set-Content -Path (Join-Path $Dir ('ans-' + $script:n + '.txt')) -Value $a",
  "  $script:n++",
  "})",
  "$f.Add_Shown({ $f.Activate(); $t.Focus() | Out-Null; $timer.Start() })",
  "[Windows.Forms.Application]::Run($f)",
].join("\n");
let formN = 0;
async function ask(cmd) {
  const n = formN++;
  fs.writeFileSync(path.join(LAB, "cmd-" + n + ".txt"), cmd, "utf8");
  const ans = path.join(LAB, "ans-" + n + ".txt");
  for (let i = 0; i < 100; i++) {
    await sleep(50);
    if (fs.existsSync(ans)) { await sleep(20); return fs.readFileSync(ans, "utf8").trim(); }
  }
  throw new Error("the chat form did not answer " + JSON.stringify(cmd));
}
const b64 = s => Buffer.from(String(s || ""), "base64").toString("utf8");
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 4000)) { if (await fn()) return true; await sleep(100); } return false; };

/* ---- the app: the shell and the built engine in a throwaway, one invented catalog ----------- */
function buildApp() {
  const dir = path.join(LAB, "app");
  for (const d of ["shell", "engine", "userdata", "catalogs", "documents"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  for (const f of ["main.js", "preload.js"]) fs.copyFileSync(path.join(E.ROOT, "shell", f), path.join(dir, "shell", f));
  for (const f of ["etiuda.html", "etiuda.csp.json"]) fs.copyFileSync(path.join(E.ROOT, "engine", f), path.join(dir, "engine", f));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "etiuda-pick-probe", version: "0.0.0", main: "shell/main.js" }), "utf8");
  fs.writeFileSync(path.join(dir, "catalogs", "lamps.ec"), JSON.stringify({ format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 1,
    name: "Lamp Shop", date: "2026-01-09", langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-ord", kind: "shelf", label: { en: "Orders" } }],
    cards: [{ id: "c-lamp", shelf: "t-ord", bodyShape: "plain", title: { en: "Lamp delivery" },
              body: { en: "{GREET},\nYour lamp leaves the workshop on Monday.\nKind regards,\n{AGENT}" } },
            { id: "c-brass", shelf: "t-ord", bodyShape: "plain", title: { en: "Care of brass" }, body: { en: "Brass wants a dry cloth." } }] }), "utf8");
  const UD = path.join(dir, "userdata");
  E.pinCatalogFolder(UD, path.join(dir, "catalogs"));
  const file = path.join(UD, "desk.json");
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  Object.assign(d.keys, { eTourDone_v3: "1", eTourInvite_v3: "1", eAgent: "Kate", eNameAsked: "1" });
  fs.writeFileSync(file, JSON.stringify(d), "utf8");
  return { dir, UD, docs: path.join(dir, "documents") };
}

const pickerPage = async () => (await b.pages()).find(p => /^data:text\/html/.test(p.url())) || null;

(async () => {
  const app = buildApp();
  child = E.shellLaunch("tests/pick-desk.js", electronExe(), [app.dir, "--remote-debugging-port=" + PORT, "--user-data-dir=" + app.UD],
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: app.docs }) });
  const said = [];
  child.stdout.on("data", d => said.push(String(d).trim()));
  child.stderr.on("data", d => said.push(String(d).trim()));
  for (let i = 0; i < 40 && !b; i++) {
    await sleep(500);
    try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + PORT, defaultViewport: null }); } catch (x) { /* not up yet */ }
  }
  if (!b) throw new Error("Electron did not answer on the debugging port within 20 s");
  let desk = (await b.pages())[0];
  await sleep(2500);
  await desk.evaluate(() => { const y = document.querySelector("#ecYes"); if (y) y.click(); });
  await sleep(3000);
  desk = (await b.pages()).find(p => /etiuda\.html/.test(p.url()));
  const first = await desk.evaluate(() => {
    const o = JSON.parse(JSON.stringify(answerPick("open", "{}")));
    const r = o.rows[0], m = findCard(r.id), l = cardLang(m);
    return { id: r.id, n: o.rows.length, text: fill(parts(m, l)[r.vi], m, 0, l) };
  });
  check(first.n === 2 && /Kate$/.test(first.text), "a the desk's page answers the picker with the catalog's two rows, the first signed ("
    + first.n + " rows, " + first.text.length + " characters)");

  fs.writeFileSync(path.join(LAB, "form.ps1"), FORM_PS1, "utf8");
  form = spawn("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", path.join(LAB, "form.ps1"), "-Dir", LAB],
    { stdio: "ignore", windowsHide: false });
  check(await until(async () => (await ask("fg")) === "True", 8000), "b the chat window stands in front with its text box focused");

  /* MOD_CONTROL 2 | MOD_SHIFT 4 = 6, VK_SPACE 0x20; the control is F24 with every modifier, which nobody holds. */
  const second = await ask("hold 1 6 32"), control = await ask("hold 2 7 135");
  await ask("free 2");
  check(second === "False" && control === "True",
    "c Windows refuses Ctrl+Shift+Space to a second program while Etiuda holds it, and grants that program a free one: "
    + second + ", " + control);

  await ask("keys ctrl+shift+space");
  let pp = null;
  const up = await until(async () => { pp = await pickerPage(); return !!pp && await pp.evaluate(() => document.hasFocus() && document.activeElement && document.activeElement.id === "q"); });
  check(up && (await ask("fg")) === "False", "d the hotkey over the chat opens the picker with its search box focused");

  await ask("keys enter");
  const back = await until(async () => (await ask("fg")) === "True");
  const clip1 = b64(await ask("clip"));
  check(back, "e Enter hands the focus back to the chat window");
  await ask("clear");
  await ask("keys ctrl+v");
  await sleep(300);
  const pasted = b64(await ask("text"));
  check(pasted.replace(/\r\n/g, "\n") === first.text && clip1 === pasted,
    "f and Ctrl+V there pastes the reply the desk's own route makes (" + pasted.length + " characters pasted)");

  await ask("keys ctrl+shift+space");
  await until(async () => { pp = await pickerPage(); return !!pp && await pp.evaluate(() => document.hasFocus()); });
  const pageClip = await pp.evaluate(t => (navigator.clipboard && window.isSecureContext)
    ? navigator.clipboard.writeText(t).then(() => "ok", e => "refused " + e.name) : "none", first.text);
  const viaPage = b64(await ask("clip"));
  if (pageClip === "ok") check(viaPage === clip1, "g the page's own clipboard write of the same text leaves the same bytes as the picker's ("
    + (viaPage.indexOf("\r\n") > -1 ? "CRLF" : "LF") + " both)");
  else { checks++; console.log("  NOT RUN g the picker's page could not write the clipboard itself (" + pageClip + "), so the line ends were not compared"); }
  await ask("keys escape");
  check(await until(async () => (await ask("fg")) === "True"), "h Escape closes the picker and the chat has the focus again");

  await ask("keys ctrl+shift+space");
  await until(async () => { pp = await pickerPage(); return !!pp && await pp.evaluate(() => document.hasFocus()); });
  await ask("keys ctrl+shift+space");
  check(await until(async () => (await ask("fg")) === "True"), "i a second press closes it the same way");

  await ask("keys ctrl+shift+space");
  await until(async () => { pp = await pickerPage(); return !!pp && await pp.evaluate(() => document.hasFocus()); });
  const marked = await pp.evaluate(() => { const on = document.querySelector("#rows li.on"); return on ? on.querySelector(".t").textContent : ""; });
  await ask("keys enter");
  await until(async () => (await ask("fg")) === "True");
  check(marked === "Lamp delivery" && b64(await ask("clip")) === clip1, "j the reply copied last opens marked, and Enter copies it again");

  const heldByForm = await ask("hold 3 6 120");
  const refused = await desk.evaluate(() => window.E_HOST.setHotkey("Control+Shift+F9"));
  await ask("free 3");
  check(heldByForm === "True" && refused && refused.ok === false && refused.why === "taken",
    "k Settings is told when Windows refuses a combination another program holds: " + JSON.stringify(refused));

  reachedEnd = true;
})().catch(e => {
  fails++;
  console.log("  FAIL " + String(e && e.message || e).split("\n")[0]);
}).finally(async () => {
  try { if (form && !form.killed) await ask("close").catch(() => {}); } catch (x) { /* gone */ }
  try { if (b) b.disconnect(); } catch (x) { /* gone */ }
  if (child) E.killTree(child.pid);
  if (form) E.killTree(form.pid);
  await sleep(500);
  try { fs.rmSync(LAB, { recursive: true, force: true }); } catch (x) { /* named below */ }
  console.log("#counts checks=" + checks + " failed=" + fails + " expected=" + EXPECTED);
  const v = E.suiteVerdict({ checks, fails, expected: EXPECTED, reachedEnd });
  v.lines.forEach(l => console.log("  " + l));
  process.exit(v.exit);
});
