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
 * 4. The exit codes a deployment tool can act on (EXIT_CODES).
 * 5. A silent run with no switch that no person could start the app from installs for all users, and an all-users install
 *    into a folder ordinary users can change asks first (MACHINE_WIDE).
 * 6. Nothing a non-administrator can write is run, or removed by a walk that follows a link, elevated (AS_ITS_OWNER).
 * 7. An upgrade stages the new files beside the install and swaps the folders, all or nothing (SWAP_*, STAGE_EXTRACT).
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
  /* The template answers Retry here, which falls through to an in-place overwrite that ignores a locked file and ends 0;
     Cancel ends the run with 1618 (EXIT_CODES), so the deployment tool tries again later. */
  ["include/extractAppPackage.nsh", "MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \"$(appCannotBeClosed)\"", "IDCANCEL"],
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
    if (row.why || row.close < 0) continue;
    /* A default the template already gives just after the text is replaced by the row's; one elsewhere is left. */
    const given = /^ \/SD (ID[A-Z]+)\b/.exec(row.line.slice(row.close));
    if (given ? given[1] === sd : /\/SD\s+ID[A-Z]+/i.test(row.line)) continue;
    const rest = row.line.slice(row.close + (given ? given[0].length : 0));
    edited[file] = text.slice(0, row.start) + row.line.slice(0, row.close) + " /SD " + sd + rest + text.slice(row.end);
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

/* 4. Exit codes a deployment tool can act on, listed for IT in README.md (Installing silently): 740, Windows' code for elevation required,
 *    where an all-users run could not get administrator rights (declined, failed, or the elevated copy was not an
 *    administrator); 1618, Windows' code for another installation in progress, where another copy of this installer is
 *    running. The app still open is 1618 too, set by the installer's own customCheckAppRunning. Each row is [template,
 *    the line the lines follow, once in that file, the lines], indented as the line after the anchor. */
const ELEVATION_CODE = ["${If} $0 <> 0", "  SetErrorLevel 740", "${ElseIf} $1 = 3", "  SetErrorLevel 740",
  "${ElseIf} $1 = 1", "${AndIf} $2 = 0x666666", "  SetErrorLevel 740", "${EndIf}"];
const EXIT_CODES = [
  ["installer.nsi", "!insertmacro UAC_RunElevated", ELEVATION_CODE],
  ["multiUser.nsh", "!insertmacro UAC_RunElevated", ELEVATION_CODE],
  ["include/allowOnlyOneInstallerInstance.nsh", "notfound:", ["SetErrorLevel 1618"]],
  ["include/extractAppPackage.nsh", "AbortExtract7za:", ["SetErrorLevel 1618"]],
];

/* 4b. The retry window before a locked extract's 1618: the template tries five times a second apart, then the box; a
 *    deployment tool's run waits about a minute instead, 30 tries 2 s apart, so an antivirus scan of a freshly written file
 *    can let go (Claude alpha's ruling (2), 2026-11-11). Each row is [template, the line as the template has it, the line it
 *    becomes], each line once in that file, its indentation kept. */
const RETRY_WINDOW = [
  ["include/extractAppPackage.nsh", "${if} $R1 < 5", "${if} $R1 < 30"],
  ["include/extractAppPackage.nsh", "Sleep 1000", "Sleep 2000"],
];
function applyRetryWindow(nsisDir) {
  for (const [file, from, to] of RETRY_WINDOW) {
    const p = path.join(nsisDir, file);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, "utf8").split("\n");
    const hits = lines.map((l, i) => (l.trim() === from ? i : -1)).filter(i => i > -1);
    if (hits.length !== 1) continue;
    lines[hits[0]] = lines[hits[0]].replace(from, to);
    fs.writeFileSync(p, lines.join("\n"), "utf8");
  }
}
function retryWindowMissing(nsisDir) {
  return RETRY_WINDOW.filter(([file, from, to]) => {
    const p = path.join(nsisDir, file);
    if (!fs.existsSync(p)) return true;
    const lines = fs.readFileSync(p, "utf8").split("\n").map(l => l.trim());
    return lines.filter(l => l === to).length !== 1 || lines.includes(from);
  }).map(([file, from]) => file + ": " + from);
}

/* 7. AN UPGRADE IS ALL OR NOTHING (Claude alpha's remedy (b), 2026-11-11 22:45, on the machine-wide review's finding 3).
 *    The template runs the older copy's uninstaller, which takes its registration away, before it writes the new files
 *    over that folder, so a failed write left a half-written app with nothing registered. installSection.nsh is reordered:
 *    stage beside the folder before the app is closed, swap, run the older uninstaller only where its folder was not the
 *    one replaced, drop the copy aside once registered (the etiuda* macros in shell/installer.nsh). Each step is guarded
 *    by its macro, so an include without them (an older tree sharing these templates) keeps the template's order. */
const SWAP_STAGE = ["# fix 7 (tools/patch-nsis.cjs): the new files are staged beside the install before the older copy is touched.",
  "!ifmacrodef etiudaStageBegin", "  !insertmacro etiudaStageBegin", "  !ifdef UNINSTALLER_ICON",
  "    File /oname=uninstallerIcon.ico \"${UNINSTALLER_ICON}\"", "  !endif", "  !insertmacro installApplicationFiles",
  "  !insertmacro etiudaStageEnd", "!endif"];
const SWAP_UNINSTALL = ["!ifmacrodef etiudaSwap", "  !insertmacro etiudaSwap", "  ${if} $etiudaRunOld == \"1\"",
  "    !insertmacro uninstallOldVersion SHELL_CONTEXT", "    !insertmacro handleUninstallResult SHELL_CONTEXT", "  ${endIf}",
  "!else", "  !insertmacro uninstallOldVersion SHELL_CONTEXT", "  !insertmacro handleUninstallResult SHELL_CONTEXT", "!endif"];
const SWAP_FILES = ["SetOutPath $INSTDIR", "", "!ifmacrondef etiudaStageBegin", "  !ifdef UNINSTALLER_ICON",
  "    File /oname=uninstallerIcon.ico \"${UNINSTALLER_ICON}\"", "  !endif", "", "  !insertmacro installApplicationFiles", "!endif"];
const SWAP_DROP = ["!ifmacrodef etiudaDropAside", "  !insertmacro etiudaDropAside", "!endif"];
/* The template's own lines each step replaces or follows, as regular expressions over LF text, each to match once. */
const SWAP_FROM = {
  link: /^!insertmacro setLinkVars[ \t]*$/m,
  uninstall: /^!insertmacro uninstallOldVersion SHELL_CONTEXT[ \t]*\n!insertmacro handleUninstallResult SHELL_CONTEXT[ \t]*$/m,
  files: /^SetOutPath \$INSTDIR[ \t]*\n\n!ifdef UNINSTALLER_ICON[ \t]*\n  File \/oname=uninstallerIcon\.ico "\$\{UNINSTALLER_ICON\}"[ \t]*\n!endif[ \t]*\n\n!insertmacro installApplicationFiles[ \t]*$/m,
  custom: /^!ifmacrodef customInstall[ \t]*\n  !insertmacro customInstall[ \t]*\n!endif[ \t]*$/m,
};
const countOf = (text, re) => (text.match(new RegExp(re.source, "gm")) || []).length;

function applySwapSection(nsisDir) {
  const p = path.join(nsisDir, "installSection.nsh");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8"), crlf = raw.indexOf("\r\n") > -1, t = raw.replace(/\r\n/g, "\n");
  if (t.indexOf("etiudaStageBegin") > -1) return;
  if (!Object.keys(SWAP_FROM).every(k => countOf(t, SWAP_FROM[k]) === 1)) return;
  const s = t.replace(SWAP_FROM.link, m => m + "\n" + SWAP_STAGE.join("\n"))
    .replace(SWAP_FROM.uninstall, () => SWAP_UNINSTALL.join("\n"))
    .replace(SWAP_FROM.files, () => SWAP_FILES.join("\n"))
    .replace(SWAP_FROM.custom, m => m + "\n" + SWAP_DROP.join("\n"));
  fs.writeFileSync(p, crlf ? s.replace(/\n/g, "\r\n") : s, "utf8");
}

/* What is not as fix 7 leaves it: each block present once, in the order the install must run them. */
function swapSectionMissing(nsisDir) {
  const p = path.join(nsisDir, "installSection.nsh");
  if (!fs.existsSync(p)) return ["installSection.nsh: no file"];
  const t = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  /* The close check is in both branches of ONE_CLICK, so only its first place is held to the order. */
  const steps = [
    ["the stage after setLinkVars", "!insertmacro setLinkVars\n" + SWAP_STAGE.join("\n") + "\n", true],
    ["the app closed after the stage", "!insertmacro CHECK_APP_RUNNING", false],
    ["the swap before the older uninstaller", SWAP_UNINSTALL.join("\n"), true],
    ["no in-place write where the stage runs", SWAP_FILES.join("\n"), true],
    ["the registration after the swap", "!insertmacro registryAddInstallInfo", true],
    ["the copy aside dropped after customInstall", "!insertmacro customInstall\n!endif\n" + SWAP_DROP.join("\n"), true],
  ];
  const missing = [];
  let last = -1;
  for (const [what, block, once] of steps) {
    const at = t.indexOf(block), twice = at > -1 && t.indexOf(block, at + 1) > -1;
    if (at < 0 || at < last || (once && twice)) missing.push(what);
    last = Math.max(last, at);
  }
  return missing;
}

/* 7b. The extract itself, where the stage runs: Cancel takes the staged folder back before its 1618, and Retry tries the
 *    copy into the stage again rather than overwriting in place with errors ignored, which nothing would then catch. */
const STAGE_EXTRACT = [
  ["include/extractAppPackage.nsh", "SetErrorLevel 1618", ["!ifmacrodef etiudaStageAbort", "  !insertmacro etiudaStageAbort", "!endif"]],
  ["include/extractAppPackage.nsh", "RMDir /r \"$PLUGINSDIR\\7z-out\"", ["!ifmacrodef etiudaStageAbort", "  StrCpy $R1 0",
    "  Goto RetryExtract7za", "!endif"], "before"],
];

/* 5. initMultiUser falls back to a per-user install when neither switch is given, so a silent run by the system account
 *    installs into that account's own profile, where no person can start the app. Such a run, and one by an elevated
 *    administrator in session 0, where no person's desktop is, installs for all users; a switch, an interactive run and
 *    every other account keep the template's choice. The uninstaller is left as it is: its registered command names a
 *    switch. Inserted before the mode is chosen, after the template has read the switches into $R0. */
const MACHINE_WIDE = [
  ["assistedInstaller.nsh", "${if} $hasPerUserInstallation == \"1\"", [
    "!ifndef BUILD_UNINSTALLER",
    "${If} ${Silent}",
    "${AndIf} ${UAC_IsAdmin}",
    "  ${GetOptions} $R0 \"/allusers\" $R1",
    "  ${If} ${Errors}",
    "    ${GetOptions} $R0 \"/currentuser\" $R1",
    "    ${If} ${Errors}",
    "      Push $R2",
    "      Push $R3",
    "      Push $R4",
    "      StrCpy $R4 \"0\"",
    "      nsExec::Exec `\"$SYSDIR\\cmd.exe\" /C \"$SYSDIR\\whoami.exe\" /user /FO CSV /NH | \"$SYSDIR\\findstr.exe\" /C:\"\\\"S-1-5-18\\\"\"`",
    "      Pop $R2",
    "      ${If} $R2 == \"0\"",
    "        StrCpy $R4 \"1\"",
    "      ${EndIf}",
    "      System::Call 'kernel32::GetCurrentProcessId() i .R2'",
    "      System::Call 'kernel32::ProcessIdToSessionId(i R2, *i .R3) i .R2'",
    "      ${If} $R2 <> 0",
    "      ${AndIf} $R3 == \"0\"",
    "        StrCpy $R4 \"1\"",
    "      ${EndIf}",
    "      ${If} $R4 == \"1\"",
    "        StrCpy $hasPerMachineInstallation \"1\"",
    "        StrCpy $hasPerUserInstallation \"0\"",
    "      ${EndIf}",
    "      Pop $R4",
    "      Pop $R3",
    "      Pop $R2",
    "    ${EndIf}",
    "  ${EndIf}",
    "${EndIf}",
    "!endif",
  ], "before"],
  /* 5b. An all-users install into a folder ordinary users can change asks first, on the folder page's Next: the functions
   *     of shell/installer/allusers-folder.nsh are compiled here, after electron-builder's !addplugindir, and the leave
   *     function is the page's. An include without the macro keeps the template's page. */
  ["assistedInstaller.nsh", "!insertmacro MUI_PAGE_DIRECTORY", ["!ifmacrodef etiudaFolderCheck",
    "  !insertmacro etiudaFolderCheck", "  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE etiudaFolderLeave", "!endif"], "before"],
];

/* 6. An all-users install ran the uninstaller HKCU names, elevated; shell/installer.nsh's etiudaOldUserCopy runs it as
 *    the account it belongs to. The uninstaller's three RMDir /r of $APPDATA under --delete-app-data follow a junction;
 *    ETIUDA_REMOVE_TREE names the walk that does not. Each row is [template, its lines as the template has them, each
 *    trimmed line once in that file and the lines consecutive, the lines before them, the lines after]: the template's
 *    own lines stay as the !else, for a hook file that defines neither. */
const AS_ITS_OWNER = [
  ["installSection.nsh", ["!insertmacro uninstallOldVersion HKEY_CURRENT_USER", "!insertmacro handleUninstallResult HKEY_CURRENT_USER"],
    ["!ifmacrodef etiudaOldUserCopy", "  !insertmacro etiudaOldUserCopy", "!else"], ["!endif"]],
].concat(["APP_FILENAME", "APP_PRODUCT_FILENAME", "APP_PACKAGE_NAME"].map(name => ["uninstaller.nsh",
  ["RMDir /r \"$APPDATA\\${" + name + "}\""],
  ["!ifdef ETIUDA_REMOVE_TREE", "  Push \"$APPDATA\\${" + name + "}\"", "  Call ${ETIUDA_REMOVE_TREE}", "!else"], ["!endif"]]));

/* The row's lines as an index, "done" when already wrapped, or why it cannot be read. */
function wrapRowAt(lines, own, before, after) {
  const t = lines.map(l => l.trim());
  const at = t.indexOf(own[0]);
  if (at < 0 || t.indexOf(own[0], at + 1) > -1) return at < 0 ? "not found" : "found more than once";
  if (!own.every((o, k) => t[at + k] === o)) return "not consecutive";
  const wrapped = before.every((b, k) => t[at - before.length + k] === b.trim())
    && after.every((a, k) => t[at + own.length + k] === a.trim());
  return wrapped ? "done" : at;
}

function applyWrapRows(nsisDir, rows = AS_ITS_OWNER) {
  for (const [file, own, before, after] of rows) {
    const p = path.join(nsisDir, file);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, "utf8").split("\n");
    const at = wrapRowAt(lines, own, before, after);
    if (typeof at === "string") continue;
    const indent = /^\s*/.exec(lines[at])[0], cr = lines[at].endsWith("\r") ? "\r" : "";
    const put = list => list.map(l => indent + l + cr);
    const body = lines.slice(at, at + own.length).map(l => "  " + l);
    lines.splice(at, own.length, ...put(before), ...body, ...put(after));
    fs.writeFileSync(p, lines.join("\n"), "utf8");
  }
}

function wrapRowsMissing(nsisDir, rows = AS_ITS_OWNER) {
  return rows.filter(([file, own, before, after]) => {
    const p = path.join(nsisDir, file);
    return !fs.existsSync(p) || wrapRowAt(fs.readFileSync(p, "utf8").split("\n"), own, before, after) !== "done";
  }).map(([file, own]) => file + ": " + own[0]);
}

/* The row's anchor as a line index, or why not: its trimmed line must occur exactly once. */
function exitRowAt(lines, anchor) {
  const hits = lines.map((l, i) => (l.trim() === anchor ? i : -1)).filter(i => i > -1);
  return hits.length === 1 ? hits[0] : (hits.length ? "found more than once" : "not found");
}
/* A row's lines go after its anchor, indented as the line after it, or "before" it, indented as the anchor; a compiler
   directive (!ifndef, !endif) goes at the margin. */
const insertAt = (at, add, where) => (where === "before" ? at - add.length : at + 1);
const exitRowDone = (lines, at, add, where) => insertAt(at, add, where) >= 0
  && add.every((a, k) => (lines[insertAt(at, add, where) + k] || "").trim() === a.trim());

function applyExitCodes(nsisDir, rows = EXIT_CODES) {
  for (const [file, anchor, add, where] of rows) {
    const p = path.join(nsisDir, file);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, "utf8").split("\n");
    const at = exitRowAt(lines, anchor);
    if (typeof at === "string" || exitRowDone(lines, at, add, where)) continue;
    const near = where === "before" ? lines[at] : (lines[at + 1] || ""), indent = /^\s*/.exec(near)[0];
    const cr = lines[at].endsWith("\r") ? "\r" : "";
    lines.splice(where === "before" ? at : at + 1, 0, ...add.map(a => (a.startsWith("!") ? "" : indent) + a + cr));
    fs.writeFileSync(p, lines.join("\n"), "utf8");
  }
}

function exitCodesMissing(nsisDir, rows = EXIT_CODES) {
  return rows.filter(([file, anchor, add, where]) => {
    const p = path.join(nsisDir, file);
    if (!fs.existsSync(p)) return true;
    const lines = fs.readFileSync(p, "utf8").split("\n"), at = exitRowAt(lines, anchor);
    return typeof at === "string" || !exitRowDone(lines, at, add, where);
  }).map(([file, anchor]) => file + ": " + anchor);
}

function verifyNsisPatches(rootDir) {
  const { multiUserUi: uiPath, installSection: secPath } = getPaths(rootDir);
  const ui = fs.existsSync(uiPath) ? fs.readFileSync(uiPath, "utf8") : "";
  const sec = fs.existsSync(secPath) ? fs.readFileSync(secPath, "utf8") : "";

  const multiUserUiPatched = /\$\{If\}\s+\$1\s*=\s*1\r?\n\s*\$\{If\}\s+\$2\s*=\s*0\r?\n\s*Quit\b[^\r\n]*\r?\n\s*\$\{ElseIf\}\s+\$2\s*<>\s*0x666666\r?\n\s*MessageBox[^\r\n]*\$\(etiudaSetupNotFinished\)/i.test(ui);

  const installSectionPatched = !/\$\{ifNot\}\s+\$\{UAC_IsInnerInstance\}\r?\n\s*!insertmacro\s+CHECK_APP_RUNNING/i.test(sec)
    && /!insertmacro\s+CHECK_APP_RUNNING/i.test(sec);

  const nsisDir = path.dirname(uiPath);
  const silentMissing = silentDefaultsMissing(nsisDir), unanswered = unansweredBoxes(nsisDir), exitMissing = exitCodesMissing(nsisDir);
  const machineWideMissing = exitCodesMissing(nsisDir, MACHINE_WIDE);
  const retryMissing = retryWindowMissing(nsisDir);
  const ownerMissing = wrapRowsMissing(nsisDir);
  const swapMissing = swapSectionMissing(nsisDir).concat(exitCodesMissing(nsisDir, STAGE_EXTRACT));
  return {
    multiUserUiPatched: !!multiUserUiPatched,
    installSectionPatched: !!installSectionPatched,
    silentDefaultsPatched: silentMissing.length === 0,
    silentMissing,
    unanswered,
    exitCodesPatched: exitMissing.length === 0,
    exitMissing,
    machineWidePatched: machineWideMissing.length === 0,
    machineWideMissing,
    retryWindowPatched: retryMissing.length === 0,
    retryMissing,
    asItsOwnerPatched: ownerMissing.length === 0,
    ownerMissing,
    swapPatched: swapMissing.length === 0,
    swapMissing,
    applied: !!(multiUserUiPatched && installSectionPatched) && silentMissing.length === 0 && unanswered.length === 0
      && exitMissing.length === 0 && machineWideMissing.length === 0 && retryMissing.length === 0 && ownerMissing.length === 0
      && swapMissing.length === 0,
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
  applyExitCodes(path.dirname(uiPath));
  applyExitCodes(path.dirname(uiPath), MACHINE_WIDE);
  applyRetryWindow(path.dirname(uiPath));
  applyWrapRows(path.dirname(uiPath));
  applySwapSection(path.dirname(uiPath));
  applyExitCodes(path.dirname(uiPath), STAGE_EXTRACT);
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
