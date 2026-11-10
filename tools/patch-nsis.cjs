/* Package-time patch for electron-builder's NSIS templates.
 *
 * Fixes:
 * 1. multiUserUi.nsh: outer process Quits on $1 = 1 without reading child exit code $2.
 *    Replaced with check: if $2 = 0 Quit; else show loginWithAdminAccount message and fall
 *    through to restore window.
 * 2. installSection.nsh: removes ${ifNot} ${UAC_IsInnerInstance} guard around CHECK_APP_RUNNING
 *    so elevated copy closes any running app before copying files.
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

function verifyNsisPatches(rootDir) {
  const { multiUserUi: uiPath, installSection: secPath } = getPaths(rootDir);
  const ui = fs.existsSync(uiPath) ? fs.readFileSync(uiPath, "utf8") : "";
  const sec = fs.existsSync(secPath) ? fs.readFileSync(secPath, "utf8") : "";

  const multiUserUiPatched = /\$\{If\}\s+\$1\s*=\s*1\r?\n\s*\$\{If\}\s+\$2\s*=\s*0\r?\n\s*Quit\b/i.test(ui)
    && /loginWithAdminAccount/.test(ui);

  const installSectionPatched = !/\$\{ifNot\}\s+\$\{UAC_IsInnerInstance\}\r?\n\s*!insertmacro\s+CHECK_APP_RUNNING/i.test(sec)
    && /!insertmacro\s+CHECK_APP_RUNNING/i.test(sec);

  return {
    multiUserUiPatched: !!multiUserUiPatched,
    installSectionPatched: !!installSectionPatched,
    applied: !!(multiUserUiPatched && installSectionPatched),
  };
}

function applyNsisPatches(rootDir) {
  const { multiUserUi: uiPath, installSection: secPath } = getPaths(rootDir);

  if (fs.existsSync(uiPath)) {
    let ui = fs.readFileSync(uiPath, "utf8");
    if (!/\$\{If\}\s+\$2\s*=\s*0/i.test(ui)) {
      const target = "${If} $1 = 1\n              Quit ;we are the outer process, the inner process has done its work (ExitCode is $2), we are done\n            ${EndIf}";
      const targetCrlf = target.replace(/\n/g, "\r\n");
      const repl = "${If} $1 = 1\n              ${If} $2 = 0\n                Quit ;we are the outer process, the inner process has done its work (ExitCode is $2), we are done\n              ${Else}\n                MessageBox mb_IconStop|mb_TopMost|mb_SetForeground \"$(loginWithAdminAccount)\"\n              ${EndIf}\n            ${EndIf}";
      const replCrlf = repl.replace(/\n/g, "\r\n");

      if (ui.includes(targetCrlf)) {
        ui = ui.replace(targetCrlf, replCrlf);
        fs.writeFileSync(uiPath, ui, "utf8");
      } else if (ui.includes(target)) {
        ui = ui.replace(target, repl);
        fs.writeFileSync(uiPath, ui, "utf8");
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
