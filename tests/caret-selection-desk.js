/* THE CARET HELPER'S SELECTION AGAINST A REAL CONTROL: a machine-window gate, behind the window wall, never run by a chain
 * on a desk someone is using. tests/pick.mjs holds the helper's text (5f, 5fp) and its window-free check (5fs); what only a
 * window can show is held here: a tiny Windows Forms box of this file's own, holding invented words with part of them
 * selected, read through UI Automation by caret.exe selection.
 *
 *   node tests/caret-selection-desk.js     with the window word for that one command (tests/engine.js); exit code is the number of failed checks
 *
 *   cw1  the words selected in a text box come back whole, as UTF-8, Polish letters included, exit 0
 *   cw2  a password box is refused (exit 6) and no text comes back
 *   cw3  a box with nothing selected answers exit 1 and no text
 *   cw4  a read-only text box with a selection answers read-only on the first line, and the words after it
 *   cw5  an editable text box with a selection answers editable on the first line, and the words after it
 *
 * Both programs are compiled into a lab in the temp folder with the C# compiler Windows carries, the helper as
 * electron-builder.js compiles it. The box is closed by the process id this file started it with. Windows only. */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const E = require("./engine");

E.windowWall("tests/caret-selection-desk.js");
if (process.platform !== "win32") { console.log("caret-selection-desk: Windows only, nothing to read here"); process.exit(0); }

const ROOT = path.resolve(__dirname, "..");
const CSC = path.join(process.env.WINDIR || "C:/Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
if (!fs.existsSync(CSC)) { console.log("  FAIL no C# compiler at " + CSC); process.exit(1); }

/* The box: argument 1 is "text", "readonly", "password" or "none"; it shows the words, selects the middle ones, takes
   the focus and prints "ready" once it is in front. Invented words, nobody's. A read-only box still has the selection. */
const BOX_CS = [
  "using System; using System.Windows.Forms;",
  "static class Box {",
  "  [STAThread] static void Main(string[] a) {",
  "    var f = new Form { Text = \"caret selection lab\", Width = 520, Height = 140, TopMost = true };",
  "    var t = new TextBox { Dock = DockStyle.Fill, Text = \"lamp oil \\u017C\\u00F3\\u0142ty knot and wick\" };",
  "    if (a.Length > 0 && a[0] == \"password\") t.UseSystemPasswordChar = true;",
  "    if (a.Length > 0 && a[0] == \"readonly\") t.ReadOnly = true;",
  "    f.Controls.Add(t);",
  "    f.Shown += (s, e) => { f.Activate(); t.Focus(); if (a.Length == 0 || a[0] != \"none\") { t.SelectionStart = 9; t.SelectionLength = 10; }",
  "      else { t.SelectionStart = 0; t.SelectionLength = 0; } Console.Out.WriteLine(\"ready\"); Console.Out.Flush(); };",
  "    Application.Run(f);",
  "  }",
  "}"].join("\n");

let failed = 0, ran = 0;
const check = (ok, line) => { ran++; if (!ok) failed++; console.log((ok ? "  ok   " : "  FAIL ") + line); };
const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-caret-desk-"));
const caret = path.join(lab, "caret.exe"), boxExe = path.join(lab, "box.exe"), boxCs = path.join(lab, "box.cs");
fs.writeFileSync(boxCs, BOX_CS, "utf8");
const made = [
  spawnSync(CSC, ["-noconfig", "-nologo", "-optimize", "-target:winexe", "-platform:anycpu", "-r:System.dll",
    "-lib:" + path.join(path.dirname(CSC), "WPF"), "-r:UIAutomationClient.dll", "-r:UIAutomationTypes.dll", "-out:" + caret,
    path.join(ROOT, "shell", "caret.cs")], { encoding: "utf8", windowsHide: true }),
  spawnSync(CSC, ["-nologo", "-target:exe", "-r:System.Windows.Forms.dll", "-out:" + boxExe, boxCs], { encoding: "utf8", windowsHide: true }),
];
if (made.some(m => m.status !== 0)) { console.log("  FAIL the lab did not compile: " + made.map(m => String(m.stdout || "").split("\n")[0]).join(" | ")); process.exit(1); }

function withBox(mode) {
  return new Promise(resolve => {
    const box = spawn(boxExe, [mode], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "", done = false;
    const end = value => { if (done) return; done = true; spawnSync("C:\\Windows\\System32\\taskkill.exe", ["/PID", String(box.pid), "/T", "/F"], { windowsHide: true }); resolve(value); };
    const timer = setTimeout(() => end({ status: null, text: "", why: "the box never said ready" }), 15000);
    box.stdout.on("data", d => {
      out += d;
      if (out.indexOf("ready") < 0 || done) return;
      setTimeout(() => {
        const r = spawnSync(caret, ["selection"], { windowsHide: true, timeout: 5000 });
        clearTimeout(timer);
        end({ status: r.status, text: r.stdout ? r.stdout.toString("utf8") : "" });
      }, 300);
    });
  });
}

/* The helper's first line is the fact and the rest are the words. A refusal or an empty selection prints nothing. */
function factOf(raw) {
  const text = String(raw || "");
  const at = text.indexOf("\n");
  return { fact: at < 0 ? "" : text.slice(0, at).replace(/\r$/, ""), words: at < 0 ? text : text.slice(at + 1) };
}

(async () => {
  try {
    const sel = await withBox("text");
    const selFact = factOf(sel.text);
    check(sel.status === 0 && selFact.words === "\u017C\u00F3\u0142ty knot", "cw1 the words selected in a text box come back whole, as UTF-8: " + JSON.stringify(sel));
    const pw = await withBox("password");
    check(pw.status === 6 && pw.text === "", "cw2 a password box is refused and no text comes back: " + JSON.stringify(pw));
    const none = await withBox("none");
    check(none.status === 1 && none.text === "", "cw3 a box with nothing selected answers that and no text: " + JSON.stringify(none));
    const ro = await withBox("readonly");
    const roFact = factOf(ro.text);
    check(ro.status === 0 && roFact.fact === "ro" && roFact.words === "\u017C\u00F3\u0142ty knot",
      "cw4 a read-only text box with a selection answers read-only: " + JSON.stringify(ro));
    const ed = await withBox("text");
    const edFact = factOf(ed.text);
    check(ed.status === 0 && edFact.fact === "ed" && edFact.words === "\u017C\u00F3\u0142ty knot",
      "cw5 an editable text box with a selection answers editable: " + JSON.stringify(ed));
  } finally { fs.rmSync(lab, { recursive: true, force: true }); }
  console.log("#counts checks=" + ran + " failed=" + failed);
  console.log(failed ? "  RESULT: FAIL " + failed + " of " + ran : "  RESULT: ok " + ran + " check(s)");
  process.exit(Math.min(failed, 63));
})();
