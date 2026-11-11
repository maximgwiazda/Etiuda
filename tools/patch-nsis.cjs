/* Package-time patch for electron-builder's NSIS templates.
 *
 * Fixes:
 * 1. multiUserUi.nsh: outer process Quits on $1 = 1 without reading child exit code $2.
 *    Replaced with check: if $2 = 0 Quit; else, unless 0x666666 (the template's next block answers it), say the
 *    installation did not finish, with the code (etiudaSetupNotFinished, shell/installer.nsh), and fall through to
 *    restore the window.
 * 2. installSection.nsh: removes ${ifNot} ${UAC_IsInnerInstance} guard around CHECK_APP_RUNNING
 *    so elevated copy closes any running app before copying files.
 * 3. Every template MessageBox: a silent default (/SD), so a silent run ends with an exit code (SILENT_DEFAULTS).
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

function getPaths(rootDir) {
  const root = rootDir || path.resolve(__dirname, "..");
  const nsisDir = path.join(root, "node_modules", "app-builder-lib", "templates", "nsis");
  return {
    root,
    multiUserUi: path.join(nsisDir, "multiUserUi.nsh"),
    installSection: path.join(nsisDir, "installSection.nsh"),
  };
}

/* 3. Every MessageBox gets a silent default (/SD): NSIS shows a box without one even under /S, and a silent push from an
 *    administrator's tool then waits on a window nobody answers. Each row is [template, the start of the box's line,
 *    once in that file, the answer]. OK where it is the only button, or where it goes on as the silent run already
 *    does; Cancel on the download retry, which a silent run would otherwise retry for ever. Rows run after fix 1. */
const SILENT_DEFAULTS = [
  ["installer.nsi", "MessageBox mb_IconStop|mb_TopMost|mb_SetForeground \"Unable to elevate, error $0\"", "IDOK"],
  ["common.nsh", "MessageBox MB_OK \"$(win7Required)\"", "IDOK"],
  ["common.nsh", "MessageBox MB_OK|MB_ICONEXCLAMATION \"$(x64WinRequired)\"", "IDOK"],
  ["include/extractAppPackage.nsh", "MessageBox MB_OK|MB_ICONEXCLAMATION \"$(decompressionFailed)", "IDOK"],
  ["include/installer.nsh", "MessageBox MB_OK \"Package file $4 found locally", "IDOK"],
  ["include/installUtil.nsh", "MessageBox MB_OK \"Unsupported ${ROOT_KEY}\"", "IDOK"],
  ["include/installUtil.nsh", "MessageBox MB_OK|MB_ICONEXCLAMATION \"$(uninstallFailed): $R0\"", "IDOK"],
  ["include/webPackage.nsh", "Messagebox MB_RETRYCANCEL|MB_ICONEXCLAMATION \"Unable to download application package", "IDCANCEL"],
  ["multiUserUi.nsh", "MessageBox mb_IconStop|mb_TopMost|mb_SetForeground \"$(etiudaSetupNotFinished)\"", "IDOK"],
  ["multiUserUi.nsh", "MessageBox mb_IconStop|mb_TopMost|mb_SetForeground \"$(loginWithAdminAccount)\"", "IDOK"],
  ["multiUserUi.nsh", "MessageBox mb_IconStop|mb_TopMost|mb_SetForeground \"Logon service not running, aborting!\"", "IDOK"],
  ["multiUserUi.nsh", "MessageBox mb_IconStop|mb_TopMost|mb_SetForeground \"Unable to elevate, error $0\"", "IDOK"],
  ["uninstaller.nsh", "MessageBox MB_OKCANCEL \"$(areYouSureToUninstall)\"", "IDOK"],
];

/* The index just past the box's quoted text, the first quote after `from` opening it; NSIS escapes a quote as $\".
   -1 when the text is not quoted or not closed. */
function textEnd(line, from) {
  let q = from;
  while (q < line.length && "\"'`".indexOf(line[q]) < 0) q++;
  for (let j = q + 1; j < line.length; j++) {
    if (line[j] === "$" && line[j + 1] === "\\") { j += 2; continue; }
    if (line[j] === line[q]) return j + 1;
  }
  return -1;
}

/* Each row's line, or why it cannot be read: its start must be in the file exactly once, as the anchor rule asks. */
function silentRowLine(text, head) {
  const at = text.indexOf(head);
  if (at < 0 || text.indexOf(head, at + 1) > -1) return { why: at < 0 ? "not found" : "found more than once" };
  const start = text.lastIndexOf("\n", at) + 1, endNl = text.indexOf("\n", at);
  const end = endNl < 0 ? text.length : (text[endNl - 1] === "\r" ? endNl - 1 : endNl);
  const line = text.slice(start, end);
  return { start, end, line, close: textEnd(line, at - start) };
}

function applySilentDefaults(nsisDir) {
  const edited = {};
  for (const [file, head, sd] of SILENT_DEFAULTS) {
    const p = path.join(nsisDir, file);
    if (!fs.existsSync(p)) continue;
    const text = file in edited ? edited[file] : fs.readFileSync(p, "utf8");
    const row = silentRowLine(text, head);
    if (row.why || row.close < 0 || /\/SD\s+ID[A-Z]+/i.test(row.line)) continue;
    edited[file] = text.slice(0, row.start) + row.line.slice(0, row.close) + " /SD " + sd + row.line.slice(row.close) + text.slice(row.end);
  }
  for (const file of Object.keys(edited)) fs.writeFileSync(path.join(nsisDir, file), edited[file], "utf8");
}

/* The rows that do not read back answered as chosen, as "file: the start of the line". */
function silentDefaultsMissing(nsisDir) {
  return SILENT_DEFAULTS.filter(([file, head, sd]) => {
    const p = path.join(nsisDir, file);
    const row = fs.existsSync(p) ? silentRowLine(fs.readFileSync(p, "utf8"), head) : { why: "no file" };
    return row.why || row.close < 0 || !new RegExp("^ /SD " + sd + "\\b").test(row.line.slice(row.close));
  }).map(([file, head]) => file + ": " + head.slice(0, 64));
}

/* Every box in the template folder that still has no /SD, as "file:line", outside comments; a box a new electron-builder
   adds is caught here even before a row is written for it. */
function unansweredBoxes(nsisDir) {
  const out = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!/\.(nsh|nsi)$/i.test(e.name)) return;
    let block = false;
    fs.readFileSync(p, "utf8").split(/\r?\n/).forEach((raw, i) => {
      let t = raw.trim();
      if (block) { const e2 = t.indexOf("*/"); if (e2 < 0) return; block = false; t = t.slice(e2 + 2).trim(); }
      if (t.startsWith("/*")) { const e2 = t.indexOf("*/", 2); if (e2 < 0) { block = true; return; } t = t.slice(e2 + 2).trim(); }
      if (/^[;#]/.test(t) || !/\bmessagebox\b/i.test(t) || /\/SD\s+ID[A-Z]+/i.test(t)) return;
      out.push(path.relative(nsisDir, p).replace(/\\/g, "/") + ":" + (i + 1));
    });
  });
  if (fs.existsSync(nsisDir)) walk(nsisDir);
  return out;
}

function verifyNsisPatches(rootDir) {
  const { multiUserUi: uiPath, installSection: secPath } = getPaths(rootDir);
  const ui = fs.existsSync(uiPath) ? fs.readFileSync(uiPath, "utf8") : "";
  const sec = fs.existsSync(secPath) ? fs.readFileSync(secPath, "utf8") : "";

  const multiUserUiPatched = /\$\{If\}\s+\$1\s*=\s*1\r?\n\s*\$\{If\}\s+\$2\s*=\s*0\r?\n\s*Quit\b[^\r\n]*\r?\n\s*\$\{ElseIf\}\s+\$2\s*<>\s*0x666666\r?\n\s*MessageBox[^\r\n]*\$\(etiudaSetupNotFinished\)/i.test(ui);

  const installSectionPatched = !/\$\{ifNot\}\s+\$\{UAC_IsInnerInstance\}\r?\n\s*!insertmacro\s+CHECK_APP_RUNNING/i.test(sec)
    && /!insertmacro\s+CHECK_APP_RUNNING/i.test(sec);

  const nsisDir = path.dirname(uiPath);
  const silentMissing = silentDefaultsMissing(nsisDir), unanswered = unansweredBoxes(nsisDir);
  return {
    multiUserUiPatched: !!multiUserUiPatched,
    installSectionPatched: !!installSectionPatched,
    silentDefaultsPatched: silentMissing.length === 0,
    silentMissing,
    unanswered,
    applied: !!(multiUserUiPatched && installSectionPatched) && silentMissing.length === 0 && unanswered.length === 0,
  };
}

function applyNsisPatches(rootDir) {
  const { multiUserUi: uiPath, installSection: secPath } = getPaths(rootDir);

  if (fs.existsSync(uiPath)) {
    /* Three states are met: electron-builder's original, this tool's first patch (which showed loginWithAdminAccount for
       any failed child, 2026-11-10 morning) and the current one. The first two become the current; the current is left. */
    const Q = "Quit ;we are the outer process, the inner process has done its work (ExitCode is $2), we are done";
    const original = "${If} $1 = 1\n              " + Q + "\n            ${EndIf}";
    const firstPatch = "${If} $1 = 1\n              ${If} $2 = 0\n                " + Q + "\n              ${Else}\n"
      + "                MessageBox mb_IconStop|mb_TopMost|mb_SetForeground \"$(loginWithAdminAccount)\"\n              ${EndIf}\n            ${EndIf}";
    /* A child that stopped with 0x666666 (not admin after all) is answered by the template's own next block, so it is left to it. */
    const current = "${If} $1 = 1\n              ${If} $2 = 0\n                " + Q + "\n              ${ElseIf} $2 <> 0x666666\n"
      + "                MessageBox mb_IconStop|mb_TopMost|mb_SetForeground \"$(etiudaSetupNotFinished)\"\n              ${EndIf}\n            ${EndIf}";
    let ui = fs.readFileSync(uiPath, "utf8");
    const crlf = ui.indexOf("\r\n") > -1;
    const eol = t => (crlf ? t.replace(/\n/g, "\r\n") : t);
    if (!ui.includes(eol(current))) {
      for (const old of [original, firstPatch]) {
        if (ui.includes(eol(old))) { ui = ui.replace(eol(old), eol(current)); fs.writeFileSync(uiPath, ui, "utf8"); break; }
      }
    }
  }

  if (fs.existsSync(secPath)) {
    let sec = fs.readFileSync(secPath, "utf8");
    if (/\$\{ifNot\}\s+\$\{UAC_IsInnerInstance\}\r?\n\s*!insertmacro\s+CHECK_APP_RUNNING/i.test(sec)) {
      const target = "!else\n  ${ifNot} ${UAC_IsInnerInstance}\n    !insertmacro CHECK_APP_RUNNING\n  ${endif}\n!endif";
      const targetCrlf = target.replace(/\n/g, "\r\n");
      const repl = "!else\n  !insertmacro CHECK_APP_RUNNING\n!endif";
      const replCrlf = repl.replace(/\n/g, "\r\n");

      if (sec.includes(targetCrlf)) {
        sec = sec.replace(targetCrlf, replCrlf);
        fs.writeFileSync(secPath, sec, "utf8");
      } else if (sec.includes(target)) {
        sec = sec.replace(target, repl);
        fs.writeFileSync(secPath, sec, "utf8");
      }
    }
  }

  applySilentDefaults(path.dirname(uiPath));
  return verifyNsisPatches(rootDir);
}

if (require.main === module) {
  const result = applyNsisPatches();
  console.log("NSIS template patches applied:", result);
  if (!result.applied) {
    console.error("Failed to apply all NSIS template patches");
    process.exit(1);
  }
}

module.exports = { getPaths, verifyNsisPatches, applyNsisPatches };
