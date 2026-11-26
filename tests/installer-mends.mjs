/* THREE INSTALLER MENDS AND ONE WARNING, held without makensis or a window: shell/installer.nsh, shell/installer/allusers-folder.nsh,
 * shell/install-files.cjs, electron-builder.js and shell/main.js, read as text, and the NSIS walks replayed line by line.
 *
 *   node tests/installer-mends.mjs        no fixtures, nothing installed or run; exit code is the number of failed checks
 *
 *   im1 AN UPDATE TAKES ONLY ITS OWN FILES. The folder goes aside whole at the swap, so everything the older copy's list does
 *       not name is moved back at once (etiudaListWalk "keep"), and a copy aside later loses only what its list names ("drop").
 *       a  keep, the older copy's own list: a person's file, folder, file inside a program folder and junction go back; the
 *          program's files stay aside; a name the new copy already holds is left aside, the new file untouched
 *       b  keep, a copy installed before the list: the newer list stands in, with resources and locales whole
 *       c  drop: only listed files and the folders they empty go, a junction is never entered, a folder left non-empty stays
 *       d  where the walks run: after the stage takes the folder's name and before anything after the swap, a leftover aside
 *          cleared by list before the swap, and nothing else removes the copy aside whole but a plain uninstall
 *       e  a folder that holds anything and is no copy of this program is refused before anything is written, with one
 *          sentence (a placeholder for the copywriter) and exit 2
 *   im4 AN ALL-USERS INSTALL STARTED ELEVATED leaves the per-user copy to its own uninstaller, run as that account at its next
 *       sign-in (HKCU RunOnce) with that account's ordinary rights only, silent and keeping data; nothing of that account's runs here
 *       a  the scheduled line, with /currentuser, the finish sentence (a placeholder), and nothing run by the elevated install
 *       b  the per-user uninstaller asks no administrator rights: the template requests user level for every uninstaller, and
 *          /currentuser, read after /allusers, takes the per-user branch, whose mode never calls UAC
 *   im5 A STAGE IS WHOLE FILE BY FILE, AND THE OLD COPY STAYS UNTIL THE NEW ONE HAS STARTED
 *       a  the list's writer and the verifier's model (shell/install-files.cjs) over a real temporary tree
 *       b  etiudaStageWhole replayed agrees with the model on a whole stage and on each way a stage is short
 *       c  etiudaStageEnd takes the stage back unless it is whole, then records what the installer wrote; electron-builder.js
 *          writes the list after packing and again after signing
 *       d  the desk's first start drops the copy aside by its list (setAsideDrop replayed over a folder in memory), and
 *          nothing in the installer removes it at the end of the install
 *   im7 THE ALL-USERS FOLDER WARNING resolves ".." before it trusts a Program Files prefix
 *   im8 THE CLOSE STEP SEES THE PROGRAM: customCheckAppRunning's command lines, run through cmd.exe as nsExec passes them
 *       (Windows alone, else not run)
 *       a  each tasklist line finds a program that runs (this node, for this account) and finds nothing for an image that does not
 *       b  the close line reaches taskkill itself
 *   im10 THE ACCOUNT TEST OF tools/patch-nsis.cjs FIX 5 RUNS: its whoami | findstr line, through cmd.exe as nsExec passes it,
 *       hands whoami's output to findstr (Windows alone, else not run)
 *   im9 AN UNINSTALL THAT LEAVES ITS FOLDER NEVER ENDS AS A SUCCESS: a plain uninstall whose folder outlives the removal says so,
 *       naming the folder, and stops with exit 2 before electron-builder's section removes the registration
 * Each check is followed by its controls: one deciding line changed in memory, which must read red alone.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let failed = 0, asserted = 0;
function check(ok, line, detail) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line + (detail ? "\n       " + detail : "")); }
}
const read = rel => { try { return fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n"); } catch (e) { return ""; } };
const NSH = read("shell/installer.nsh"), FOLDER = read("shell/installer/allusers-folder.nsh");
const MAIN = read("shell/main.js"), CFG = read("electron-builder.js"), README = read("README.md");
let IF = null;
try { IF = require(path.join(ROOT, "shell", "install-files.cjs")); } catch (e) { IF = null; }

const macro = (text, name) => (new RegExp("\\n!macro " + name + "(?: [^\\n]*)?\\n([\\s\\S]*?)\\n!macroend").exec("\n" + text) || [])[1] || "";
const fnOf = (text, name) => (new RegExp("\\nFunction " + name + "\\n([\\s\\S]*?)\\nFunctionEnd").exec("\n" + text) || [])[1] || "";
const code = text => String(text).split("\n").map(l => l.trim()).filter(l => l && !/^[#;]/.test(l));
const tryOr = (f, d) => { try { return f(); } catch (e) { return d; } };

/* ---- an INI read as Windows' GetPrivateProfileString reads it, written here apart from the module the legs judge ---- */
function iniGet(text, sect, key) {
  let on = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const l = raw.trim(), h = /^\[([^\]]*)\]$/.exec(l);
    if (h) { on = h[1].toLowerCase() === String(sect).toLowerCase(); continue; }
    const eq = l.indexOf("=");
    if (on && eq > 0 && l.slice(0, eq).trim().toLowerCase() === String(key).toLowerCase()) return l.slice(eq + 1).trim();
  }
  return "";
}
const ini = (files, dirs, extra) => ["[files]", ...Object.entries(files).map(([k, v]) => k + "=" + v), ...(extra || []), "[dirs]",
  ...dirs.map(d => d + "=1"), "[list]", ...Object.keys(files).map((k, i) => i + "=" + k), "[end]", "count=" + Object.keys(files).length, ""].join("\r\n");

/* ---- THE REPLAY: a function of shell/installer.nsh run over folders in memory ----
   fsys: dirs (Set), files (Map path -> {size, text}), links (Map path -> target). GetFileAttributesW reads a link as itself
   (0x410); FindFirst, Delete and IfFileExists go through a link among the leading folders, as Windows does; Rename moves a file,
   a folder with what it holds, or a link as itself, and fails onto a name already there. StrCmp is NSIS's, case-insensitive. */
function replay(nsh, entry, fsys, vars, args) {
  const bodies = {};
  for (const name of ["etiudaListWalk", "etiudaStageWhole"]) {
    const b = fnOf(nsh, name);
    if (b) bodies[name] = code(b);
  }
  if (!bodies[entry]) return null;
  const V = Object.assign({ $R0: "", $R1: "", $R2: "", $R3: "", $R4: "", $R5: "", $R6: "", $0: "", $1: "" }, vars);
  const stack = (args || []).slice(), finds = [], handles = [];
  let errors = false, steps = 0;
  const DEF = { ETIUDA_FILES: "etiuda-files.ini", APP_EXECUTABLE_FILENAME: "Etiuda.exe" };
  const val = tok => String(tok).replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1")
    .replace(/\$\{(\w+)\}|\$(R\d|\d|etiuda\w+)/g, (m, d, v) => d ? (DEF[d] !== undefined ? DEF[d] : m) : (V["$" + v] !== undefined ? V["$" + v] : m));
  const follow = (p, last) => {
    for (let n = 0; n < 50; n++) {
      let moved = false;
      for (const [l, t] of fsys.links) {
        if (p.startsWith(l + "\\")) { p = t + p.slice(l.length); moved = true; break; }
        if (last && p === l) { p = t; moved = true; break; }
      }
      if (!moved) return p;
    }
    throw new Error("a link loop");
  };
  const parentOf = p => follow(p, false), fullOf = p => follow(p, true);
  const under = (d, q) => q.startsWith(d + "\\") && q.slice(d.length + 1).indexOf("\\") < 0;
  const kids = d => [...fsys.dirs, ...fsys.files.keys(), ...fsys.links.keys()].filter(q => under(d, q)).map(q => q.slice(d.length + 1)).sort();
  const attrs = p => { const q = parentOf(p); if (fsys.links.has(q)) return 0x410; return fsys.dirs.has(q) ? 0x10 : fsys.files.has(q) ? 0x20 : -1; };
  const exists = p => { if (/\\\*\.\*$/.test(p)) return fsys.dirs.has(fullOf(p.slice(0, -4))); const q = parentOf(p); return fsys.links.has(q) || fsys.dirs.has(fullOf(p)) || fsys.files.has(q); };
  const moveTree = (a, b) => {
    for (const set of [fsys.dirs]) for (const q of [...set]) if (q === a || q.startsWith(a + "\\")) { set.delete(q); set.add(b + q.slice(a.length)); }
    for (const map of [fsys.files, fsys.links]) for (const [q, v] of [...map]) if (q === a || q.startsWith(a + "\\")) { map.delete(q); map.set(b + q.slice(a.length), v); }
  };
  const rename = (a, b) => {
    const qa = parentOf(a), qb = parentOf(b), up = qb.slice(0, qb.lastIndexOf("\\"));
    if (attrs(a) === -1 || exists(b) || !fsys.dirs.has(up)) { errors = true; return; }
    if (fsys.links.has(qa)) { fsys.links.set(qb, fsys.links.get(qa)); fsys.links.delete(qa); return; }
    moveTree(qa, qb);
  };
  const mkdirs = p => { const parts = parentOf(p).split("\\"); for (let i = 1; i <= parts.length; i++) fsys.dirs.add(parts.slice(0, i).join("\\")); };
  const toks = l => (l.match(/"[^"]*"|'[^']*'|\S+/g) || []);
  const run = name => {
    const lines = bodies[name];
    if (!lines) throw new Error("no function " + name);
    const labels = {};
    lines.forEach((l, i) => { if (/^\w+:$/.test(l)) labels[l.slice(0, -1)] = i; });
    for (let pc = 0; pc < lines.length; pc++) {
      if (++steps > 200000) throw new Error("runaway");
      const l = lines[pc], t = toks(l), op = t[0];
      const go = lab => { if (lab === "0" || lab === undefined) return; if (!(lab in labels)) throw new Error("no label " + lab); pc = labels[lab]; };
      if (/^\w+:$/.test(op)) continue;
      const sys = /^System::Call 'kernel32::GetFileAttributesW\(w (\w+)\) i \.(\w+)'$/.exec(l);
      if (sys) { V["$" + sys[2]] = String(attrs(V["$" + sys[1]])); continue; }
      if (op === "Exch") { const top = stack.pop(); stack.push(V[t[1]]); V[t[1]] = top; }
      else if (op === "Push") stack.push(val(t[1]));
      else if (op === "Pop") { if (!stack.length) throw new Error("pop of an empty stack"); V[t[1]] = stack.pop(); }
      else if (op === "StrCpy") {
        const s = val(t[2]);
        if (t.length === 3) V[t[1]] = s;
        else { const len = val(t[3]), off = t[4] === undefined ? 0 : Number(val(t[4])); const from = s.slice(off < 0 ? s.length + off : off); V[t[1]] = len === "" ? from : Number(len) < 0 ? from.slice(0, Number(len)) : from.slice(0, Number(len)); }
      }
      else if (op === "StrCmp") go(val(t[1]).toLowerCase() === val(t[2]).toLowerCase() ? t[3] : t[4]);
      else if (op === "IntCmp") { const a = parseInt(val(t[1]), 0) || 0, b = parseInt(val(t[2]), 0) || 0; go(a === b ? t[3] : a < b ? t[4] : t[5]); }
      else if (op === "IntOp") { const a = parseInt(val(t[2]), 0) || 0, b = parseInt(val(t[4]), 0) || 0; V[t[1]] = String(t[3] === "&" ? a & b : t[3] === "+" ? a + b : NaN); }
      else if (op === "FindFirst") { const d = fullOf(val(t[3]).replace(/\\\*\.\*$/, "")); finds.push(fsys.dirs.has(d) ? [".", ".."].concat(kids(d)) : []); V[t[1]] = String(finds.length - 1); V[t[2]] = finds[finds.length - 1].shift() || ""; }
      else if (op === "FindNext") V[t[2]] = finds[+V[t[1]]].shift() || "";
      else if (op === "FindClose") { /* nothing held */ }
      else if (op === "ReadINIStr") { const f = fsys.files.get(parentOf(val(t[2]))); const got = f ? iniGet(f.text || "", val(t[3]), val(t[4])) : ""; if (!got) errors = true; V[t[1]] = got; }
      else if (op === "IfFileExists") go(exists(val(t[1])) ? t[2] : t[3]);
      else if (op === "CreateDirectory") mkdirs(val(t[1]));
      else if (op === "Rename") rename(val(t[1]), val(t[2]));
      else if (op === "Delete") { const q = parentOf(val(t[1])); if (fsys.files.has(q) && !(fsys.locked && fsys.locked.has(q))) fsys.files.delete(q); else errors = true; }
      else if (op === "RMDir") { const p = val(t[t.length - 1]), q = parentOf(p); if (t[1] === "/r") throw new Error("RMDir /r in a walk"); if (fsys.links.has(q)) fsys.links.delete(q); else if (fsys.dirs.has(q) && !kids(q).length) fsys.dirs.delete(q); }
      else if (op === "FileOpen") { const q = parentOf(val(t[2])); if (fsys.files.has(q)) { handles.push(q); V[t[1]] = "h" + (handles.length - 1); } else { errors = true; V[t[1]] = ""; } }
      else if (op === "FileSeek") { const q = handles[+String(V[t[1]]).slice(1)]; V[t[4]] = String(fsys.files.get(q).size); }
      else if (op === "FileClose") { /* nothing held */ }
      else if (op === "IfErrors") { const was = errors; errors = false; go(was ? t[1] : t[2]); }
      else if (op === "ClearErrors") errors = false;
      else if (op === "Goto") go(t[1]);
      else if (op === "Call") run(t[1]);
      else throw new Error("the replay does not know " + l);
    }
  };
  run(entry);
  return { fsys, stack, V };
}

/* ---- im1: the walks ---- */
const OLD_LIST = ini({ "Etiuda.exe": 9, "resources\\app.asar": 5, "locales\\pl.pak": 2, "kit\\a.dll": 4 }, ["kit", "locales", "resources"],
  ["Uninstall Etiuda.exe=installer", "etiuda-files.ini=installer"]);
const NEW_LIST = ini({ "Etiuda.exe": 10, "resources\\app.asar": 6, "locales\\pl.pak": 3, "collide.txt": 7 }, ["locales", "resources"]);
const F = (size, text) => ({ size, text });
function pair(withOldList) {
  const files = new Map([
    ["A\\Etiuda.exe", F(9)], ["A\\Uninstall Etiuda.exe", F(1)], ["A\\resources\\app.asar", F(5)], ["A\\locales\\pl.pak", F(2)],
    ["A\\kit\\a.dll", F(4)], ["A\\resources\\gone.bin", F(1)],
    ["A\\my-notes.txt", F(3)], ["A\\Projects\\a.txt", F(3)], ["A\\resources\\person.txt", F(3)], ["A\\collide.txt", F(3)],
    ["B\\Etiuda.exe", F(10)], ["B\\resources\\app.asar", F(6)], ["B\\locales\\pl.pak", F(3)], ["B\\collide.txt", F(7)],
    ["B\\etiuda-files.ini", F(1, NEW_LIST)], ["X\\secret.txt", F(1)]]);
  if (withOldList) files.set("A\\etiuda-files.ini", F(1, OLD_LIST));
  return { dirs: new Set(["A", "A\\resources", "A\\locales", "A\\kit", "A\\Projects", "B", "B\\resources", "B\\locales", "X"]),
    files, links: new Map([["A\\lnk", "X"]]) };
}
const walkVars = (mode, wide) => ({ $etiudaWalkRoot: "A", $etiudaWalkIni: wide ? "B\\etiuda-files.ini" : "A\\etiuda-files.ini",
  $etiudaWalkWide: wide ? "1" : "0", $etiudaWalkMode: mode, $etiudaBase: "B" });
const has = (r, p) => r.fsys.files.has(p) || r.fsys.dirs.has(p) || r.fsys.links.has(p);

const keepsTheirs = nsh => {
  const r = tryOr(() => replay(nsh, "etiudaListWalk", pair(true), walkVars("keep", false), [""]), null);
  if (!r) return { ok: false };
  const back = ["B\\my-notes.txt", "B\\Projects\\a.txt", "B\\resources\\person.txt", "B\\lnk"].every(p => has(r, p))
    && ["A\\my-notes.txt", "A\\Projects", "A\\resources\\person.txt", "A\\lnk"].every(p => !has(r, p));
  const stay = ["A\\Etiuda.exe", "A\\Uninstall Etiuda.exe", "A\\etiuda-files.ini", "A\\resources\\app.asar", "A\\locales\\pl.pak", "A\\kit\\a.dll"].every(p => has(r, p));
  const clash = has(r, "A\\collide.txt") && r.fsys.files.get("B\\collide.txt").size === 7;
  const target = r.fsys.links.get("B\\lnk") === "X" && has(r, "X\\secret.txt");
  const fresh = r.fsys.files.get("B\\Etiuda.exe").size === 10 && r.fsys.files.get("B\\resources\\app.asar").size === 6;
  return { ok: back && stay && clash && target && fresh && r.stack.length === 0, back, stay, clash, target, fresh };
};
const k1 = keepsTheirs(NSH);
check(k1.ok, "im1a keep: what the older copy's list does not name goes back into the folder, a person's file, folder, file inside a"
  + " program folder and junction (as itself), while the program's own files stay aside and a name the new copy holds is left aside",
  JSON.stringify(k1));
check(!keepsTheirs(NSH.replace("StrCmp $etiudaWalkMode \"keep\" 0 etiudaWalkSkip", "Goto etiudaWalkSkip")).ok,
  "im1a control: nothing moved back, so the person's files would go with the copy aside, reads red");
check(!keepsTheirs(NSH.replace("ReadINIStr $R5 $etiudaWalkIni \"files\" $R4", "StrCpy $R5 \"\"")).ok,
  "im1a control: the list not read for files, so the program's files move back over the new copy's folder, reads red");

const keepsWide = nsh => {
  const r = tryOr(() => replay(nsh, "etiudaListWalk", pair(false), walkVars("keep", true), [""]), null);
  if (!r) return { ok: false };
  const ok = has(r, "B\\my-notes.txt") && has(r, "A\\resources\\gone.bin") && has(r, "A\\resources\\person.txt") && has(r, "A\\Etiuda.exe")
    && has(r, "A\\locales\\pl.pak") && r.fsys.files.get("B\\Etiuda.exe").size === 10;
  return { ok };
};
check(keepsWide(NSH).ok, "im1b keep, a copy installed before the list: the newer copy's list stands in, resources and locales count whole,"
  + " and a person's file at the root still goes back");
check(!keepsWide(NSH.replace("StrCmp $R6 \"wide\" etiudaWalkOurs etiudaWalkTheirs", "Goto etiudaWalkTheirs")).ok,
  "im1b control: resources not counted whole, so an older program file there moves into the new folder, reads red");

const dropsListed = nsh => {
  const t = pair(true);
  /* The older version shipped a folder kit; someone replaced it with a junction to X, where a file of a listed name sits. */
  t.dirs.delete("A\\kit"); t.files.delete("A\\kit\\a.dll"); t.links.set("A\\kit", "X"); t.files.set("X\\a.dll", F(4));
  const r = tryOr(() => replay(nsh, "etiudaListWalk", t, walkVars("drop", false), [""]), null);
  if (!r) return { ok: false };
  const gone = ["A\\Etiuda.exe", "A\\Uninstall Etiuda.exe", "A\\resources\\app.asar", "A\\locales\\pl.pak", "A\\locales"].every(p => !has(r, p));
  const kept = ["A\\etiuda-files.ini", "A\\my-notes.txt", "A\\Projects\\a.txt", "A\\resources\\person.txt", "A\\collide.txt", "A\\resources", "A\\kit", "X\\a.dll", "X\\secret.txt"].every(p => has(r, p));
  const t2 = { dirs: new Set(["A", "A\\resources", "B"]), files: new Map([["A\\Etiuda.exe", F(9)], ["A\\resources\\app.asar", F(5)], ["A\\etiuda-files.ini", F(1, OLD_LIST)]]), links: new Map() };
  const r2 = tryOr(() => replay(nsh, "etiudaListWalk", t2, walkVars("drop", false), [""]), null);
  const clean = !!r2 && [...r2.fsys.files.keys()].join() === "A\\etiuda-files.ini" && [...r2.fsys.dirs].join() === "A,B";
  return { ok: gone && kept && clean, gone, kept, clean };
};
const d1 = dropsListed(NSH);
check(d1.ok, "im1c drop: the copy aside loses its listed files and the folders they empty; a person's file and folder, a name both"
  + " copies hold, and a junction where a listed folder was (its target untouched) stay; an aside of listed files alone empties"
  + " but for the list itself, which the walk reads to its end and the swap deletes after it", JSON.stringify(d1));
check(!dropsListed(NSH.replace(/IntOp \$R5 \$R3 & 0x400\n\s*IntCmp \$R5 0 0 etiudaWalkTheirs etiudaWalkTheirs\n/, "")).ok,
  "im1c control: the link test taken out, so the walk deletes inside the junction's target, reads red");
check(!dropsListed(NSH.replace("StrCmp $R5 \"\" 0 etiudaWalkOurs", "Goto etiudaWalkOurs")).ok,
  "im1c control: every file taken as listed, a folder sweep, reads red");

const placed = nsh => {
  const swap = code(macro(nsh, "etiudaSwap"));
  const i = s => swap.findIndex(l => l === s);
  const dropAt = i("StrCpy $etiudaWalkMode \"drop\""), asideAt = i("!insertmacro etiudaRenameRetry \"$etiudaBase\" \"$etiudaAside\"");
  const intoAt = i("!insertmacro etiudaRenameRetry \"$etiudaStage\" \"$etiudaBase\""), keepAt = i("StrCpy $etiudaWalkMode \"keep\"");
  const post = swap.findIndex(l => /^ReadRegStr \$0 SHELL_CONTEXT "\$\{INSTALL_REGISTRY_KEY\}" InstallLocation$/.test(l));
  const keepGuard = swap[keepAt - 2] === "${If} $etiudaAsideMade == \"1\"" && swap[keepAt - 1] === "!insertmacro etiudaAsideList \"$etiudaBase\""
    && swap[keepAt + 1] === "Push \"\"" && swap[keepAt + 2] === "Call etiudaListWalk";
  const dropGuard = swap[dropAt - 1] === "!insertmacro etiudaAsideList \"$etiudaStage\"" && swap[dropAt + 2] === "Call etiudaListWalk"
    && swap[dropAt + 3] === "Delete \"$etiudaAside\\${ETIUDA_FILES}\""
    && swap.slice(dropAt, asideAt).some(l => /^Rename "\$etiudaAside" "\$etiudaAside\.\$0"$/.test(l));
  const list = code(macro(nsh, "etiudaAsideList"));
  const chooses = list.includes("StrCpy $etiudaWalkIni \"$etiudaAside\\${ETIUDA_FILES}\"") && list.includes("StrCpy $etiudaWalkIni \"${FALLBACK}\\${ETIUDA_FILES}\"");
  const noSweep = !/etiudaRemoveTree "\$etiudaAside"/.test(macro(nsh, "etiudaStageBegin")) && !/etiudaRemoveTree "\$etiudaAside"/.test(macro(nsh, "etiudaDropAside"))
    && !/etiudaRemoveTree "\$etiudaAside"/.test(macro(nsh, "etiudaSwap"));
  const un = code(macro(nsh, "customRemoveFiles"));
  const unSweep = un.indexOf("${If} ${FileExists} \"$INSTDIR${ETIUDA_ASIDE_SUFFIX}\\${APP_EXECUTABLE_FILENAME}\"") > un.indexOf("Call un.etiudaRemoveTree")
    && un.includes("Push \"$INSTDIR${ETIUDA_ASIDE_SUFFIX}\"");
  const header = /!ifmacrodef etiudaListWalkFunction\n\s*!insertmacro etiudaListWalkFunction\n\s*!endif/.test(macro(nsh, "customHeader"));
  return { ok: dropAt > -1 && dropAt < asideAt && asideAt < intoAt && intoAt < keepAt && keepAt < post && keepGuard && dropGuard && chooses && noSweep && unSweep && header,
    order: [dropAt, asideAt, intoAt, keepAt, post], keepGuard, dropGuard, chooses, noSweep, unSweep, header };
};
const p1 = placed(NSH);
check(p1.ok, "im1d the keep walk runs once the stage has the folder's name and before anything after the swap, where the folder went"
  + " aside; a leftover aside is dropped by its list, and kept under a numbered name, before this swap; nothing removes the copy aside"
  + " whole but a plain uninstall, and only where it holds the program", JSON.stringify(p1));
check(!placed(NSH.replace("    !insertmacro etiudaRenameRetry \"$etiudaBase\" \"$etiudaAside\"\n", "    !insertmacro etiudaRemoveTree \"$etiudaAside\"\n    !insertmacro etiudaRenameRetry \"$etiudaBase\" \"$etiudaAside\"\n")).ok,
  "im1d control: the old whole removal of the aside put back reads red");

/* ---- im1e: a folder that is not ours is refused ---- */
const refuses = nsh => {
  const b = code(macro(nsh, "etiudaStageBegin"));
  const g = b.indexOf("${If} ${FileExists} \"$etiudaBase\\*.*\"");
  const guard = g > -1 && b[g + 1] === "${AndIfNot} ${FileExists} \"$etiudaBase\\${APP_EXECUTABLE_FILENAME}\""
    && b[g + 2] === "${AndIfNot} ${FileExists} \"$etiudaBase\\${ETIUDA_FILES}\"";
  const seen = b.indexOf("StrCpy $2 \"theirs\"", g), quit = b.indexOf("Quit", seen);
  const says = seen > g && b.slice(seen, quit).includes("MessageBox MB_OK|MB_ICONSTOP \"$(etiudaFolderNotOurs)\" /SD IDOK") && b[quit - 1] === "SetErrorLevel 2";
  const back = b.findIndex(l => l === "!insertmacro etiudaRenameRetry \"$etiudaAside\" \"$etiudaBase\"");
  const before = quit > -1 && quit < b.indexOf("CreateDirectory \"$etiudaStage\"") && back > -1 && g > back;
  const words = (nsh.match(/LangString etiudaFolderNotOurs \$\{ID\} "[^"\n]+" ; (?:placeholder: Claudette|the copywriter's words)\n/g) || []).length === 2;
  return { ok: guard && says && before && words, guard, says, before, words };
};
const f1 = refuses(NSH);
check(f1.ok, "im1e a folder that holds anything and has neither this program nor its list is refused, after a cut-short swap is put back"
  + " and before anything is written, with one sentence in both languages (a placeholder for the copywriter) and exit 2", JSON.stringify(f1));
check(!refuses(NSH.replace("      SetErrorLevel 2\n      Quit\n    ${EndIf}\n    Pop $2", "    ${EndIf}\n    Pop $2")).ok,
  "im1e control: the refusal that goes on into the folder anyway reads red");

/* ---- im4: the per-user copy met by an installer started elevated ---- */
const RUNONCE = "WriteRegStr HKCU \"Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce\" \"${APP_ID}.per-user-copy\" \"$R9 /currentuser /S /KEEP_APP_DATA\"";
const leftToItsOwner = nsh => {
  const m = code(macro(nsh, "etiudaOldUserCopy"));
  const rest = m.slice(m.lastIndexOf("${Else}"));
  const cond = rest.indexOf("${If} $R9 != \"\""), w = rest.indexOf(RUNONCE);
  const said = rest.indexOf("StrCpy $etiudaFinishText \"$(etiudaOldCopyGoes)\"");
  const runsNothing = !rest.some(l => /uninstallOldVersion|ExecWait|\bExec\b|ExecShell|nsExec/.test(l));
  const words = (nsh.match(/LangString etiudaOldCopyGoes \$\{ID\} "[^"\n]+" ; (?:placeholder: Claudette|the copywriter's words)\n/g) || []).length === 2;
  return { ok: cond > -1 && w > cond && said > cond && runsNothing && words, cond, w, said, runsNothing, words };
};
const o1 = leftToItsOwner(NSH);
check(o1.ok, "im4a started elevated, the per-user copy HKCU names is left to its own uninstaller at that account's next sign-in (HKCU"
  + " RunOnce, /currentuser /S /KEEP_APP_DATA), the elevated install runs no program of that account's, and the finish page says so in"
  + " both languages, marked a placeholder for the copywriter", JSON.stringify(o1));
check(!leftToItsOwner(NSH.replace(/\n\s*WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce"[^\n]*/, "")).ok,
  "im4a control: the copy left registered with nothing to remove it, as before, reads red");
check(!leftToItsOwner(NSH.replace("$R9 /currentuser /S /KEEP_APP_DATA", "$R9 /S /KEEP_APP_DATA")).ok,
  "im4a control: the line without /currentuser, which beside the new all-users copy would take the all-users branch and ask to elevate, reads red");

/* im4b: what runs at sign-in asks no administrator rights, read from app-builder-lib's own templates as installed. */
const TPL = path.join(ROOT, "node_modules", "app-builder-lib", "templates", "nsis");
const tread = rel => { try { return fs.readFileSync(path.join(TPL, rel), "utf8").replace(/\r\n/g, "\n"); } catch (e) { return ""; } };
const userLevel = (nsi, assisted, multi) => {
  const lv = /!ifdef INSTALL_MODE_PER_ALL_USERS\n\s*!ifdef BUILD_UNINSTALLER\n\s*RequestExecutionLevel user\n\s*!else\n\s*RequestExecutionLevel admin\n\s*!endif\n!else\n\s*RequestExecutionLevel user\n!endif/.test(nsi);
  const init = (/\n[ \t]*!macro initMultiUser\n([\s\S]*?)\n[ \t]*!macroend/.exec("\n" + assisted) || [])[1] || "";
  const all = init.indexOf("${GetOptions} $R0 \"/allusers\" $R1"), cur = init.indexOf("${GetOptions} $R0 \"/currentuser\" $R1");
  const curWins = all > -1 && cur > all
    && /"\/currentuser" \$R1\n\s*\$\{IfNot\} \$\{Errors\}\n\s*StrCpy \$hasPerMachineInstallation "0"\n\s*StrCpy \$hasPerUserInstallation "1"/.test(init)
    && /\$\{if\} \$hasPerUserInstallation == "1"\n\s*\$\{andif\} \$hasPerMachineInstallation == "0"\n\s*!insertmacro setInstallModePerUser/.test(init);
  const perUser = (/\n[ \t]*!macro setInstallModePerUser\n([\s\S]*?)\n[ \t]*!macroend/.exec("\n" + multi) || [])[1] || "";
  const noUac = !!perUser && !/UAC_/.test(perUser);
  return { ok: lv && curWins && noUac, lv, curWins, noUac };
};
const u1 = userLevel(tread("installer.nsi"), tread("assistedInstaller.nsh"), tread("multiUser.nsh"));
check(u1.ok, "im4b the per-user uninstaller asks no administrator rights: every uninstaller the template builds requests user level,"
  + " /currentuser is read after /allusers and takes the per-user branch, and that mode calls no UAC", JSON.stringify(u1));
check(!userLevel(tread("installer.nsi").replace(/(!ifdef BUILD_UNINSTALLER\n\s*)RequestExecutionLevel user/, "$1RequestExecutionLevel admin"), tread("assistedInstaller.nsh"), tread("multiUser.nsh")).ok,
  "im4b control: an uninstaller built to request administrator rights reads red");

/* ---- im5: whole file by file, and the old copy kept until the start ---- */
let modelOk = false, modelDetail = "shell/install-files.cjs is missing";
if (IF) {
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-im5-"));
  try {
    fs.mkdirSync(path.join(lab, "resources", "policy"), { recursive: true });
    fs.writeFileSync(path.join(lab, "Etiuda.exe"), "x".repeat(10));
    fs.writeFileSync(path.join(lab, "resources", "app.asar"), "y".repeat(6));
    fs.writeFileSync(path.join(lab, "resources", "policy", "etiuda.admx"), "z");
    const n = IF.writeManifest(lab);
    const text = fs.readFileSync(path.join(lab, IF.NAME), "utf8");
    const sizeOf = rel => tryOr(() => fs.statSync(path.join(lab, ...rel.split("\\"))).size, null);
    const whole = IF.stageProblems(text, sizeOf).length === 0;
    fs.writeFileSync(path.join(lab, "resources", "app.asar"), "y".repeat(5));
    const short = IF.stageProblems(text, sizeOf).length === 1;
    fs.writeFileSync(path.join(lab, "resources", "app.asar"), "y".repeat(6));
    fs.unlinkSync(path.join(lab, "resources", "policy", "etiuda.admx"));
    const missing = IF.stageProblems(text, sizeOf).length === 1;
    const cut = IF.stageProblems(text.slice(0, text.indexOf("[end]")), sizeOf).length === 1;
    const lost = IF.stageProblems(text.replace("1=resources\\app.asar\r\n", ""), sizeOf).length > 0;
    const dirs = iniGet(text, "dirs", "resources\\policy") === "1" && iniGet(text, "files", "Etiuda.exe") === "10" && !/etiuda-files\.ini=/.test(text);
    const refuses = ["a=b.txt", "[x", ";x", " x", "\u00e9"].every(k => !IF.KEY_SAFE.test(k)) && IF.KEY_SAFE.test("resources\\app.asar");
    modelOk = n === 3 && whole && short && missing && cut && lost && dirs && refuses;
    modelDetail = JSON.stringify({ n, whole, short, missing, cut, lost, dirs, refuses });
  } catch (e) { modelDetail = e.message; }
  fs.rmSync(lab, { recursive: true, force: true });
}
check(modelOk, "im5a the list names every file at its size and every folder holding one, never itself; the verifier's model passes a"
  + " whole tree and fails one file short by a byte, one missing, the list cut before its count, and a numbered entry lost; a name"
  + " the INI reader would cut refuses the build", modelDetail);

const STAGE_LIST = ini({ "Etiuda.exe": 10, "resources\\app.asar": 6, "locales\\pl.pak": 3 }, ["locales", "resources"]);
const stage = mutate => {
  const t = { dirs: new Set(["S", "S\\resources", "S\\locales"]), files: new Map([["S\\Etiuda.exe", F(10)], ["S\\resources\\app.asar", F(6)],
    ["S\\locales\\pl.pak", F(3)], ["S\\etiuda-files.ini", F(1, STAGE_LIST)]]), links: new Map() };
  mutate(t);
  return t;
};
const CASES = {
  whole: () => {},
  short: t => t.files.set("S\\resources\\app.asar", F(5)),
  missing: t => t.files.delete("S\\locales\\pl.pak"),
  noList: t => t.files.delete("S\\etiuda-files.ini"),
  cut: t => t.files.set("S\\etiuda-files.ini", F(1, STAGE_LIST.slice(0, STAGE_LIST.indexOf("[end]")))),
  lostEntry: t => t.files.set("S\\etiuda-files.ini", F(1, STAGE_LIST.replace("2=locales\\pl.pak\r\n", ""))),
};
const wholeAgrees = nsh => {
  const out = {};
  for (const [name, mutate] of Object.entries(CASES)) {
    const t = stage(mutate);
    const r = tryOr(() => replay(nsh, "etiudaStageWhole", t, { $etiudaStage: "S", $R0: "keep-r0" }, []), null);
    const said = r && r.stack.length === 1 ? r.stack[0] : "?";
    const listFile = t.files.get("S\\etiuda-files.ini");
    const model = IF ? (listFile ? IF.stageProblems(listFile.text, rel => { const f = t.files.get("S\\" + rel); return f ? f.size : null; }).length === 0 : false) : null;
    out[name] = { said, model, restored: !!r && r.V.$R0 === "keep-r0" };
  }
  const want = { whole: "1", short: "0", missing: "0", noList: "0", cut: "0", lostEntry: "0" };
  const ok = Object.keys(want).every(k => out[k].said === want[k] && out[k].model === (want[k] === "1") && out[k].restored);
  return { ok, out };
};
const w1 = wholeAgrees(NSH);
check(w1.ok, "im5b etiudaStageWhole, replayed, answers whole for a whole stage and not whole for a file a byte short, a file missing,"
  + " no list, a list cut before its count and a numbered entry lost, as the model does, and leaves the registers as it found them", JSON.stringify(w1.out));
check(!wholeAgrees(NSH.replace("StrCmp $R3 $R4 0 etiudaWholeOut", "Goto etiudaWholeOut\n    StrCmp $R3 $R4 0 etiudaWholeOut").replace(/Goto etiudaWholeOut\n(\s*StrCmp \$R3 \$R4 0 etiudaWholeOut)/, "$1".replace("$1", "Nop"))).ok
  || !wholeAgrees(NSH.replace("    StrCmp $R3 $R4 0 etiudaWholeOut\n", "")).ok,
  "im5b control: the size compare taken out, so a short file passes, reads red");
check(!wholeAgrees(NSH.replace("  StrCmp $R1 \"\" etiudaWholeOut\n", "  StrCpy $R1 3\n")).ok,
  "im5b control: a list without its count taken as whole reads red");

const endTakesBack = (nsh, cfg) => {
  const e = code(macro(nsh, "etiudaStageEnd"));
  const call = e.indexOf("Call etiudaStageWhole");
  const flag = e[call + 1] === "Pop $0" && e[call + 2] === "${If} $0 != \"1\"" && e[call + 3] === "StrCpy $1 \"0\"";
  const abort = e.indexOf("${If} $1 != \"1\"") > call && /\$\{If\} \$1 != "1"\n[\s\S]*?!insertmacro etiudaStageAbort\n[\s\S]*?SetErrorLevel 2\nQuit/.test(e.join("\n"));
  const extras = e.findIndex(l => l === "WriteINIStr \"$etiudaStage\\${ETIUDA_FILES}\" files \"${UNINSTALL_FILENAME}\" \"installer\"") > e.indexOf("${If} $1 != \"1\"")
    && e.includes("WriteINIStr \"$etiudaStage\\${ETIUDA_FILES}\" files \"${ETIUDA_FILES}\" \"installer\"");
  const sizeGone = !/APP_64_UNPACKED_SIZE/.test(e.join("\n"));
  const hooks = /afterPack: async context => installFiles\(context\)/.test(cfg) && /afterSign: async context => installFiles\(context\)/.test(cfg)
    && /function installFiles\(context\) \{\n\s*if \(context\.electronPlatformName !== "win32"\) return;\n[^\n]*require\("\.\/shell\/install-files\.cjs"\)\.writeManifest\(context\.appOutDir\)/.test(cfg);
  return { ok: call > -1 && flag && abort && extras && sizeGone && hooks, call, flag, abort, extras, sizeGone, hooks };
};
const e1 = endTakesBack(NSH, CFG);
check(e1.ok, "im5c etiudaStageEnd takes the stage back and ends 2 unless every listed file is there at its size, in place of the 99"
  + " per cent size compare, then adds what the installer wrote to the list; electron-builder.js writes the list after packing and after"
  + " signing", JSON.stringify(e1));
check(!endTakesBack(NSH.replace("  Call etiudaStageWhole\n", ""), CFG).ok, "im5c control: the stage judged without its list reads red");
check(!endTakesBack(NSH, CFG.replace("  afterSign: async context => installFiles(context),\n", "")).ok,
  "im5c control: the list written before signing alone, its sizes then stale, reads red");

/* setAsideDrop, the desk's own, sliced out of shell/main.js and run over a folder in memory with promise-shaped calls. */
const sliceDrop = main => { const m = /\nasync function setAsideDrop\(fsp, join, aside, own, exe\) \{\n[\s\S]*?\n\}\n/.exec(main); return m ? m[0] : ""; };
function memFs(files, dirs, links) {
  const W = path.win32, fail = () => Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
  const thru = p => { for (const [l, t] of links) if (p.startsWith(l + "\\")) return t + p.slice(l.length); return p; };
  return {
    lstat: async p => { if (links.has(p)) return { isDirectory: () => false, isSymbolicLink: () => true }; const q = thru(p);
      if (dirs.has(q)) return { isDirectory: () => true, isSymbolicLink: () => false }; if (files.has(q)) return { isDirectory: () => false, isSymbolicLink: () => false }; return fail(); },
    readFile: async p => { const q = thru(p); return files.has(q) ? files.get(q) : fail(); },
    readdir: async p => { const q = links.has(p) ? links.get(p) : thru(p); if (!dirs.has(q)) return fail();
      return [...dirs, ...files.keys(), ...links.keys()].filter(x => W.dirname(x) === q).map(x => W.basename(x)); },
    unlink: async p => { const q = thru(p); if (!files.has(q)) return fail(); files.delete(q); },
    rmdir: async p => { const q = thru(p); if (!dirs.has(q) || [...dirs, ...files.keys(), ...links.keys()].some(x => W.dirname(x) === q)) return fail(); dirs.delete(q); },
  };
}
const dropsAtStart = async main => {
  const src = sliceDrop(main);
  if (!src) return { ok: false, why: "no setAsideDrop" };
  const drop = new Function(src + "\nreturn setAsideDrop;")();
  const W = path.win32;
  const files = new Map([["C:\\E.setup-previous\\Etiuda.exe", ""], ["C:\\E.setup-previous\\etiuda-files.ini", OLD_LIST],
    ["C:\\E.setup-previous\\resources\\app.asar", ""], ["C:\\E.setup-previous\\locales\\pl.pak", ""], ["C:\\E.setup-previous\\collide.txt", ""],
    ["C:\\E.setup-previous\\Uninstall Etiuda.exe", ""], ["C:\\X\\a.dll", ""], ["C:\\E\\etiuda-files.ini", NEW_LIST]]);
  const dirs = new Set(["C:\\E.setup-previous", "C:\\E.setup-previous\\resources", "C:\\E.setup-previous\\locales", "C:\\X", "C:\\E"]);
  const links = new Map([["C:\\E.setup-previous\\kit", "C:\\X"]]);
  const said = await drop(memFs(files, dirs, links), W.join, "C:\\E.setup-previous", "C:\\E", "Etiuda.exe");
  const gone = ["Etiuda.exe", "etiuda-files.ini", "resources\\app.asar", "locales\\pl.pak", "Uninstall Etiuda.exe"].every(r => !files.has("C:\\E.setup-previous\\" + r))
    && !dirs.has("C:\\E.setup-previous\\locales") && !dirs.has("C:\\E.setup-previous\\resources");
  const kept = files.has("C:\\E.setup-previous\\collide.txt") && files.has("C:\\X\\a.dll") && links.has("C:\\E.setup-previous\\kit") && said === "kept";
  const f2 = new Map([["C:\\E.setup-previous\\Etiuda.exe", ""], ["C:\\E.setup-previous\\resources\\old.bin", ""], ["C:\\E.setup-previous\\mine.txt", ""], ["C:\\E\\etiuda-files.ini", NEW_LIST]]);
  const d2 = new Set(["C:\\E.setup-previous", "C:\\E.setup-previous\\resources", "C:\\E"]);
  const said2 = await drop(memFs(f2, d2, new Map()), W.join, "C:\\E.setup-previous", "C:\\E", "Etiuda.exe");
  const wide = said2 === "kept" && !f2.has("C:\\E.setup-previous\\Etiuda.exe") && !f2.has("C:\\E.setup-previous\\resources\\old.bin") && f2.has("C:\\E.setup-previous\\mine.txt");
  const f3 = new Map([["C:\\E.setup-previous\\mine.txt", ""], ["C:\\E\\etiuda-files.ini", NEW_LIST]]);
  const said3 = await drop(memFs(f3, new Set(["C:\\E.setup-previous", "C:\\E"]), new Map()), W.join, "C:\\E.setup-previous", "C:\\E", "Etiuda.exe");
  const notOurs = said3 === "none" && f3.has("C:\\E.setup-previous\\mine.txt");
  const f4 = new Map([["C:\\E.setup-previous\\Etiuda.exe", ""], ["C:\\E.setup-previous\\etiuda-files.ini", OLD_LIST]]);
  const said4 = await drop(memFs(f4, new Set(["C:\\E.setup-previous", "C:\\E"]), new Map()), W.join, "C:\\E.setup-previous", "C:\\E", "Etiuda.exe");
  const called = /\n\s*createWindow\(\);\n(?:\s*\w+\(\);\n)*\s*const asideAt = setTimeout\(dropSetAside, \d+\);\n/.test(main)
    && /function dropSetAside\(\) \{\n\s*if \(process\.platform !== "win32" \|\| !app\.isPackaged\) return;/.test(main)
    /* The copy aside is walked with original-fs: Electron's node:fs reads resources\app.asar as a folder, so it would be walked, never
       unlinked, and the folder kept (hosted old-copy-kept, three runs). The memory folder here cannot show that, so the call is read. */
    && /function dropSetAside\(\) \{[\s\S]*?ofs = require\("original-fs"\)[\s\S]*?setAsideDrop\(ofs\.promises, /.test(main);
  return { ok: gone && kept && wide && notOurs && said4 === "gone" && called, gone, kept, wide, notOurs, all: said4, called };
};
const a1 = await dropsAtStart(MAIN).catch(e => ({ ok: false, why: e.message }));
check(a1.ok, "im5d the desk's start drops the copy aside by its own list, or the newer list with resources and locales whole: listed"
  + " files and emptied folders go, a person's file and a junction (its target untouched) stay, a folder without the program is not"
  + " ours, and it runs once the window is made, packaged on Windows alone", JSON.stringify(a1));
const a2 = await dropsAtStart(MAIN.replace(" || !(await fsp.lstat(join(aside, exe)).catch(() => null))) return \"none\";", ") return \"none\";")).catch(() => ({ ok: false }));
check(!a2.ok, "im5d control: a folder of that name without the program taken as ours reads red");
const a3 = await dropsAtStart(MAIN.replace("else if (listed.files.has(key) || whole(key)) await fsp.unlink(p)", "else await fsp.unlink(p)")).catch(() => ({ ok: false }));
check(!a3.ok, "im5d control: every file in the copy aside deleted, a sweep, reads red");
const a4 = await dropsAtStart(MAIN.replace("setAsideDrop(ofs.promises, ", "setAsideDrop(fs.promises, ")).catch(() => ({ ok: false }));
check(!a4.ok, "im5d control: the copy aside walked with Electron's node:fs, which reads app.asar as a folder, reads red");

/* ---- im7: ".." resolved before the Program Files prefix ---- */
const resolvesFirst = text => {
  const leave = code((/Function etiudaFolderLeave\n([\s\S]*?)FunctionEnd/.exec(text) || [])[1] || "");
  const full = leave.indexOf("System::Call 'kernel32::GetFullPathNameW(w r0, i ${NSIS_MAX_STRLEN}, w .r1, i 0) i .r2'");
  const take = leave.indexOf("StrCpy $0 $1", full), prefix = leave.indexOf("StrLen $3 $PROGRAMFILES64");
  const guard = leave[full + 1] === "${If} $2 > 0" && leave[full + 2] === "${AndIf} $2 < ${NSIS_MAX_STRLEN}" && leave[full + 3] === "StrCpy $0 $1";
  const named = leave.indexOf("StrCpy $0 \"$0\\${APP_FILENAME}\"");
  return { ok: full > named && named > -1 && guard && take > full && prefix > take, full, take, prefix, guard };
};
const pf = "C:\\Program Files", given = "C:\\Program Files\\..\\Users\\Public\\Etiuda", resolved = path.win32.resolve(given);
const why = given.startsWith(pf + "\\") && !resolved.startsWith(pf + "\\");
const r7 = resolvesFirst(FOLDER);
check(r7.ok && why, "im7a the all-users folder warning resolves the path as Windows will (GetFullPathNameW) before the Program Files"
  + " prefix is trusted: " + JSON.stringify(given) + " resolves to " + JSON.stringify(resolved) + ", outside it", JSON.stringify(r7));
check(!resolvesFirst(FOLDER.replace(/\n\s*System::Call 'kernel32::GetFullPathNameW[^\n]*/, "")).ok, "im7a control: the raw string's prefix trusted again reads red");

/* ---- im8: the close step's command lines, run as nsExec runs them ----
   nsExec hands the whole line to CreateProcess; cmd.exe then applies its own rule to what follows /C: a line opening with a quote
   that is not one simple quoted command loses its first and its last quote, and the rest is parsed from there. */
let notRun = 0;
const SYS = path.join(process.env.SystemRoot || "C:\\Windows", "System32");
const closeLines = text => code(macro(text, "customCheckAppRunning")).map(l => (/^nsExec::Exec(?: \/TIMEOUT=\d+)? `(.*)`/.exec(l) || [])[1])
  .filter(l => l && l.indexOf("$SYSDIR\\cmd.exe") > -1);
const runLine = (line, image, perUser) => {
  const full = line.split("$SYSDIR").join(SYS).split("${APP_EXECUTABLE_FILENAME}").join(image)
    .split("$R5").join(perUser ? "/FI \"USERNAME eq %USERNAME%\" " : "");
  const exe = full.slice(1, full.indexOf("\"", 1)), rest = full.slice(full.indexOf("\"", 1) + 2);
  const r = spawnSync(exe, [rest], { windowsVerbatimArguments: true, encoding: "utf8", windowsHide: true, timeout: 30000 });
  return { exit: r.status, out: String(r.stdout || "") + String(r.stderr || "") };
};
const sees = text => {
  const lines = closeLines(text), finds = lines.filter(l => l.indexOf("tasklist.exe") > -1), kills = lines.filter(l => l.indexOf("taskkill.exe") > -1);
  const me = path.basename(process.execPath), none = "etiuda-im8-no-such-image.exe";
  const found = finds.map(l => [runLine(l, me, true).exit, runLine(l, me, false).exit, runLine(l, none, true).exit]);
  /* taskkill answers a name nothing runs under with its own message (128, or 0 with "No tasks" under a filter); cmd's "cannot find
     the path" or "directory name is invalid" means taskkill never ran. */
  const killed = kills.map(l => runLine(l, none, true)).map(r => !/cannot find the path|directory name is invalid|is not recognized/i.test(r.out) && (r.exit === 128 || r.exit === 0));
  return { ok: finds.length === 2 && kills.length === 1 && found.every(f => f[0] === 0 && f[1] === 0 && f[2] === 1) && killed.every(Boolean),
    finds: finds.length, kills: kills.length, found, killed };
};
if (process.platform !== "win32") { notRun += 2; console.log("  --   im8 not run: cmd.exe and tasklist are Windows's"); }
else {
  const s8 = sees(NSH);
  check(s8.ok && s8.found.every(f => f[0] === 0 && f[1] === 0 && f[2] === 1), "im8a each tasklist line of customCheckAppRunning, run through cmd.exe"
    + " as nsExec passes it, finds a program that runs (" + path.basename(process.execPath) + ", this account, per user and for all users)"
    + " and finds nothing for an image that does not", JSON.stringify(s8));
  check(s8.ok && s8.killed.every(Boolean) && s8.kills === 1, "im8b the close line reaches taskkill itself", JSON.stringify(s8));
  const unwrapped = NSH.replace(/`"\$SYSDIR\\cmd\.exe" \/C ""(.*)""`/g, "`\"$SYSDIR\\cmd.exe\" /C \"$1\"`");
  check(unwrapped !== NSH && !sees(unwrapped).ok, "im8 control: the lines without the outer pair of quotes cmd.exe takes away read red");
}

/* ---- im10: tools/patch-nsis.cjs fix 5's account test, run as nsExec runs it ----
   The line findstr reads whoami's SID through: with this account's own SID in the system account's place it is found, and S-9-9-9
   is not, which tells a whoami that ran from a line cmd.exe could not parse. */
const PATCH = read("tools/patch-nsis.cjs");
const whoamiOf = text => {
  const src = String(text).split("\n").find(l => l.indexOf("whoami.exe") > -1 && /^\s*"/.test(l)) || "";
  let s = ""; try { s = JSON.parse(src.trim().replace(/\s*\/\*[^*]*\*\/$/, "").replace(/,$/, "")); } catch (e) { s = ""; }
  return (/^\s*nsExec::Exec `(.*)`$/.exec(s) || [])[1] || "";
};
const whoamiRuns = text => {
  const line = whoamiOf(text);
  if (!line || line.indexOf("S-1-5-18") < 0) return { ok: false, line };
  const me = spawnSync(path.join(SYS, "whoami.exe"), ["/user", "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
  const sid = (/"(S-1-[0-9-]+)"/.exec(String(me.stdout || "")) || [])[1] || "";
  if (!sid) return { ok: false, why: "whoami gave no SID of its own" };
  const any = runLine(line.split("S-1-5-18").join(sid), "", false), none = runLine(line.split("S-1-5-18").join("S-9-9-9"), "", false);
  return { ok: any.exit === 0 && none.exit === 1, any: any.exit, none: none.exit, said: any.out.trim().slice(0, 80) };
};
if (process.platform !== "win32") { notRun += 1; console.log("  --   im10 not run: cmd.exe and whoami are Windows's"); }
else {
  const w10 = whoamiRuns(PATCH);
  check(w10.ok, "im10a tools/patch-nsis.cjs fix 5's account test, run through cmd.exe as nsExec passes it, hands whoami's SID to findstr:"
    + " this account's SID put in the system account's place is found, and one nobody holds is not", JSON.stringify(w10));
  const bare = PATCH.replace(/(nsExec::Exec `\\"\$SYSDIR\\\\cmd\.exe\\" \/C )\\"(\\"\$SYSDIR\\\\whoami\.exe[^`]*)\\"`/, "$1$2`");
  check(bare !== PATCH && !whoamiRuns(bare).ok, "im10 control: the line without the outer pair of quotes cmd.exe takes away reads red");
}

/* ---- im9: a folder the uninstall could not remove ---- */
const leftRefused = (text, tplUn) => {
  const m = code(macro(text, "customRemoveFiles")).map(l => l.replace(/\s+[#;] ?plant:\S+$/, ""));
  const guard = m.indexOf("${IfNot} ${isUpdated}");
  const removed = m.indexOf("Call un.etiudaRemoveTree"), test = m.findIndex((l, i) => i > removed && l === "${If} ${FileExists} \"$INSTDIR\"");
  const box = m.findIndex((l, i) => i > test && /^MessageBox MB_OK\|MB_ICONSTOP "\$\(etiudaUninstallLeft\)" \/SD IDOK$/.test(l));
  const level = m.findIndex((l, i) => i > box && l === "SetErrorLevel 2"), stop = m.findIndex((l, i) => i > level && l === "Abort");
  const close = m.findIndex((l, i) => i > stop && l === "${EndIf}");
  const named = (text.match(/LangString etiudaUninstallLeft \$\{ID\} "[^"]*\$INSTDIR[^"]*"/g) || []).length === 2;
  /* electron-builder's section removes the files through this macro, then the shortcuts and the registration. */
  const order = /!insertmacro customRemoveFiles[\s\S]*DeleteRegKey SHELL_CONTEXT "\$\{UNINSTALL_REGISTRY_KEY\}"/.test(tplUn);
  return { ok: guard > -1 && removed > guard && test > removed && box > test && level > box && stop > level && close > stop && named && order,
    guard, removed, test, box, level, stop, named, order };
};
const TPL_UN = tryOr(() => fs.readFileSync(path.join(ROOT, "node_modules", "app-builder-lib", "templates", "nsis", "uninstaller.nsh"), "utf8").replace(/\r\n/g, "\n"), "");
if (!TPL_UN) { notRun += 1; console.log("  --   im9 not run: electron-builder's uninstaller template is not installed"); }
else {
  const r9 = leftRefused(NSH, TPL_UN);
  check(r9.ok, "im9a a plain uninstall whose folder outlives the removal says so, naming the folder in both languages, and stops with"
    + " exit 2 before electron-builder's section removes the shortcuts and the registration; an update's uninstall is left as it was", JSON.stringify(r9));
  check(!leftRefused(NSH.replace(/\n(\s*)Abort # plant:uninstall-left-stops/, "\n$1Nop"), TPL_UN).ok, "im9 control: the run going on to a success reads red");
  check(!leftRefused(NSH.replace("SetErrorLevel 2 # plant:uninstall-left-code", "SetErrorLevel 0"), TPL_UN).ok, "im9 control: the run ending 0 reads red");
}

console.log("\n#counts checks=" + asserted + " failed=" + failed + " notRun=" + notRun);
console.log("installer-mends " + (failed ? failed + " failure(s)" : "passed " + asserted + " check(s)"));
process.exit(Math.min(failed, 63));
