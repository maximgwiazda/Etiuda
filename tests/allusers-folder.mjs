/* AN ALL-USERS INSTALL INTO A FOLDER ORDINARY USERS CAN CHANGE IS NEVER UNSEEN: shell/installer/allusers-folder.nsh,
 * inserted before electron-builder's folder page by tools/patch-nsis.cjs (fix 5b).
 *
 *   node tests/allusers-folder.mjs        no fixtures, no makensis, nothing run; exit code is the number of failed checks
 *
 * THE READING, modelled with the constants the installer's text holds, over folders' DACLs recorded on a Windows whose
 * groups are named in Polish, as SDDL (the text form of the binary DACL the installer reads through GetNamedSecurityInfoW
 * and GetAce) and as icacls prints them. The account's name and SID and the paths are replaced; the mandatory label line
 * icacls adds is left out.
 *   af1 the SID reading decides each recorded case: a locked folder, made and not yet made; a writable parent; a parent that
 *       lets them delete the folder; files they can change; Program Files, local and over a share; ProgramData; a drive's
 *       root; a share they can write; a per-user install; a path with nothing readable above it
 *   af2 a reading by group name decides every case as af1 over the English names, and misses each writable case over the
 *       Polish ones: the control that af1 is red on a name-matching version
 *   af3 the mask, inherit-only flag, entry types and SIDs the model reads out of allusers-folder.nsh are the rights the brief
 *       names, the flag, the allowed types and the four groups, each compared
 * THE INSTALLER'S TEXT, read and never compiled (tests/nsis-compile.mjs compiles it):
 *   af4 the patched template compiles the check and makes etiudaFolderLeave the folder page's leave function, in the
 *       installer pass alone, and nothing else calls it, so a silent run, which shows no page, proceeds
 *   af5 the check runs only for an all-users install and outside Program Files; it never refuses and writes nothing: one box,
 *       Yes and No, silent default Yes, No staying on the page; its words are the copywriter's in both languages
 *   af6 README.md's Installing silently and shell/policy/readme.txt carry the administrator's line
 *   af7 lifting the all-users condition, the silent default, the No, the Program Files skip, the patch row or the mask, or
 *       adding a Quit, turns its leg red
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(path.join(ROOT, "package.json"));
let failed = 0, asserted = 0;
function check(ok, line, detail) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line + (detail ? "\n       " + detail : "")); }
}
const read = rel => { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch (e) { return ""; } };

/* ---- the model, which reads its mask, flag, entry types and SIDs out of the installer's text ---- */
const NSH = read("shell/installer/allusers-folder.nsh");
const macroOf = (text, name) => {
  const m = new RegExp("^!macro " + name + "\\r?\\n([\\s\\S]*?)^!macroend", "m").exec(text);
  return m ? m[1] : "";
};
const functionOf = (text, name) => {
  const m = new RegExp("^[ \\t]*Function " + name.replace(/\./g, "\\.") + "\\r?\\n([\\s\\S]*?)^[ \\t]*FunctionEnd", "m").exec(text);
  return m ? m[1] : "";
};
function readFrom(text) {
  const def = name => { const m = new RegExp("^!define " + name + " (0x[0-9A-Fa-f]+)\\s*$", "m").exec(text); return m ? parseInt(m[1], 16) : NaN; };
  const open = functionOf(macroOf(text, "etiudaFolderCheck"), "etiudaFolderOpen");
  const types = /\$\{If\} \$6 = (\d+)\r?\n\s*\$\{OrIf\} \$6 = (\d+)\r?\n/.exec(open);
  return { mask: def("ETIUDA_CHANGE_MASK"), inheritOnly: def("ETIUDA_INHERIT_ONLY"), open,
    types: types ? [Number(types[1]), Number(types[2])] : [], sids: [...open.matchAll(/ConvertStringSidToSidW\(w "([^"]+)"/g)].map(m => m[1]) };
}
const FROM = readFrom(NSH);
/* What the brief names: the four groups, and the rights that let one of them change what runs. */
const FOUR = ["S-1-5-32-545", "S-1-5-11", "S-1-1-0", "S-1-5-4"];
const RIGHTS = { addFile: 0x2, addFolder: 0x4, deleteChild: 0x40, delete: 0x10000, writeDac: 0x40000, writeOwner: 0x80000,
  genericAll: 0x10000000, genericWrite: 0x40000000 };
const CHANGE_MASK = Object.values(RIGHTS).reduce((a, b) => a | b, 0);

/* SDDL as ConvertSecurityDescriptorToStringSecurityDescriptor writes it. Its letters are the directory-service names:
   DC is 0x2, a file's add-file, and DT is 0x40, delete-child; icacls prints those two as WD and DC. */
const SDDL_RIGHTS = { GA: 0x10000000, GR: 0x80000000, GW: 0x40000000, GX: 0x20000000, RC: 0x20000, SD: 0x10000, WD: 0x40000,
  WO: 0x80000, CC: 0x1, DC: 0x2, LC: 0x4, SW: 0x8, RP: 0x10, WP: 0x20, DT: 0x40, LO: 0x80, CR: 0x100, FA: 0x1f01ff };
const SDDL_FLAGS = { OI: 0x1, CI: 0x2, NP: 0x4, IO: 0x8, ID: 0x10, SA: 0x40, FA: 0x80 };
const SDDL_TYPES = { A: 0, D: 1, XA: 9, XD: 10 };
const SDDL_SIDS = { BU: "S-1-5-32-545", AU: "S-1-5-11", WD: "S-1-1-0", IU: "S-1-5-4", BA: "S-1-5-32-544", SY: "S-1-5-18",
  CO: "S-1-3-0", AC: "S-1-15-2-1", SU: "S-1-5-6" };
function parseSddl(sddl) {
  const dacl = /D:[A-Z]*((?:\([^)]*\))*)/.exec(sddl);
  if (!dacl) throw new Error("no DACL in " + sddl);
  return [...dacl[1].matchAll(/\(([^)]*)\)/g)].map(m => {
    const [type, flags, rights, , , sid] = m[1].split(";");
    const letters = (s, table) => (s.match(/../g) || []).reduce((a, k) => {
      if (!(k in table)) throw new Error("unknown SDDL letter " + k + " in " + m[1]);
      return a | table[k];
    }, 0);
    if (!(type in SDDL_TYPES)) throw new Error("unknown entry type " + type);
    const id = /^S-/.test(sid) ? sid : SDDL_SIDS[sid];
    if (!id) throw new Error("unknown SID abbreviation " + sid);
    return { type: SDDL_TYPES[type], flags: letters(flags, SDDL_FLAGS),
      mask: /^0x/i.test(rights) ? parseInt(rights, 16) : letters(rights, SDDL_RIGHTS), sid: id };
  });
}
/* etiudaFolderOpen, entry by entry: "1" where an allowed entry for one of the four holds a right in the mask. */
function openBySid(sddl, mode) {
  if (sddl == null) return "1";
  return parseSddl(sddl).some(a => FROM.types.indexOf(a.type) > -1 && (mode === "any" || !(a.flags & FROM.inheritOnly))
    && (a.mask & FROM.mask) && FROM.sids.indexOf(a.sid) > -1) ? "1" : "0";
}
/* The same decision made from icacls's printed lines by the groups' English names. */
const NAMES = ["BUILTIN\\Users", "NT AUTHORITY\\Authenticated Users", "Everyone", "NT AUTHORITY\\INTERACTIVE"];
const NAMED_CHANGE = ["F", "M", "W", "D", "DE", "WDAC", "WO", "GA", "GW", "WD", "AD", "DC"];
function openByName(lines, mode) {
  if (lines == null) return "1";
  return lines.some(l => {
    const m = /^(.+?):((?:\([^)]*\))+)$/.exec(l.trim());
    if (!m || NAMES.indexOf(m[1]) < 0) return false;
    const groups = [...m[2].matchAll(/\(([^)]*)\)/g)].map(g => g[1]);
    if (mode !== "any" && groups.indexOf("IO") > -1) return false;
    return groups.some(g => g.split(",").some(r => NAMED_CHANGE.indexOf(r) > -1));
  }) ? "1" : "0";
}

/* etiudaFolderLeave over a tree of recorded folders: "skip", "go" or "ask". */
const PF64 = "C:\\Program Files", PF32 = "C:\\Program Files (x86)", APP = "Etiuda";
const parentOf = p => { const t = p.replace(/\\+$/, ""), i = t.lastIndexOf("\\"); return i < 0 ? "" : t.slice(0, i); };
const asRoot = p => (p.length === 2 && p[1] === ":" ? p + "\\" : p);
function leave(c, reader) {
  if (c.mode !== "all") return "skip";
  let dir = c.instdir.replace(/\\$/, "");
  if (c.instdir.toLowerCase().indexOf(APP.toLowerCase()) < 0) dir += "\\" + APP;
  for (const pf of [PF64, PF32]) {
    if (dir.slice(0, pf.length).toLowerCase() === pf.toLowerCase() && dir[pf.length] === "\\") return "skip";
  }
  const key = p => Object.keys(c.tree).find(k => k.toLowerCase() === asRoot(p).toLowerCase());
  const at = p => { const k = key(p); return k ? reader(c.tree[k]) : null; };
  let level = dir, here = true, steps = 0;
  while (!key(level)) {
    const up = parentOf(level);
    if (!up || up === level || ++steps > 64) { level = ""; break; }
    level = up; here = false;
  }
  let open;
  if (!level) open = "1";
  else {
    open = at(level)("any");
    if (open === "0" && here) {
      const up = parentOf(dir);
      open = up ? (key(up) ? at(up)("self") : "1") : "1";
    }
  }
  return open === "1" ? "ask" : "go";
}

/* ---- the recordings ---- */
const ME = "S-1-5-21-1111111111-2222222222-3333333333-1001";
const R = {
  owner: { sddl: `D:AI(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)(A;OICIID;FA;;;${ME})`,
    pl: ["ZARZĄDZANIE NT\\SYSTEM:(I)(OI)(CI)(F)", "BUILTIN\\Administratorzy:(I)(OI)(CI)(F)", "DESK\\person:(I)(OI)(CI)(F)"] },
  locked: { sddl: `D:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)(A;OICI;FA;;;${ME})`,
    pl: ["DESK\\person:(OI)(CI)(F)", "BUILTIN\\Użytkownicy:(OI)(CI)(RX)", "BUILTIN\\Administratorzy:(OI)(CI)(F)",
      "ZARZĄDZANIE NT\\SYSTEM:(OI)(CI)(F)"] },
  lockedChild: { sddl: `D:AI(A;OICIID;FA;;;${ME})(A;OICIID;0x1200a9;;;BU)(A;OICIID;FA;;;BA)(A;OICIID;FA;;;SY)`,
    pl: ["DESK\\person:(I)(OI)(CI)(F)", "BUILTIN\\Użytkownicy:(I)(OI)(CI)(RX)", "BUILTIN\\Administratorzy:(I)(OI)(CI)(F)",
      "ZARZĄDZANIE NT\\SYSTEM:(I)(OI)(CI)(F)"] },
  open: { sddl: `D:AI(A;OICI;0x1301bf;;;BU)(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)(A;OICIID;FA;;;${ME})`,
    pl: ["BUILTIN\\Użytkownicy:(OI)(CI)(M)", "ZARZĄDZANIE NT\\SYSTEM:(I)(OI)(CI)(F)", "BUILTIN\\Administratorzy:(I)(OI)(CI)(F)",
      "DESK\\person:(I)(OI)(CI)(F)"] },
  deleteChild: { sddl: `D:PAI(A;;DT;;;AU)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)(A;OICI;FA;;;${ME})`,
    pl: ["ZARZĄDZANIE NT\\Użytkownicy uwierzytelnieni:(DC)", "DESK\\person:(OI)(CI)(F)", "BUILTIN\\Użytkownicy:(OI)(CI)(RX)",
      "BUILTIN\\Administratorzy:(OI)(CI)(F)", "ZARZĄDZANIE NT\\SYSTEM:(OI)(CI)(F)"] },
  sealedChild: { sddl: `D:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)(A;OICI;FA;;;${ME})`,
    pl: ["DESK\\person:(OI)(CI)(F)", "BUILTIN\\Użytkownicy:(OI)(CI)(RX)", "BUILTIN\\Administratorzy:(OI)(CI)(F)",
      "ZARZĄDZANIE NT\\SYSTEM:(OI)(CI)(F)"] },
  filesOpen: { sddl: `D:PAI(A;OIIO;0x1301bf;;;WD)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;;0x1200a9;;;BU)(A;OICI;FA;;;${ME})`,
    pl: ["BUILTIN\\Użytkownicy:(RX)", "Wszyscy:(OI)(IO)(M)", "DESK\\person:(OI)(CI)(F)", "BUILTIN\\Administratorzy:(OI)(CI)(F)",
      "ZARZĄDZANIE NT\\SYSTEM:(OI)(CI)(F)"] },
  programFiles: { sddl: "D:PAI(A;OICIIO;GA;;;CO)(A;OICIIO;GA;;;SY)(A;;0x1301bf;;;SY)(A;OICIIO;GA;;;BA)(A;;0x1301bf;;;BA)"
      + "(A;OICIIO;GXGR;;;BU)(A;;0x1200a9;;;BU)(A;CIIO;GA;;;S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464)"
      + "(A;;FA;;;S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464)(A;;0x1200a9;;;AC)(A;OICIIO;GXGR;;;AC)"
      + "(A;;0x1200a9;;;S-1-15-2-2)(A;OICIIO;GXGR;;;S-1-15-2-2)",
    pl: ["NT SERVICE\\TrustedInstaller:(F)", "NT SERVICE\\TrustedInstaller:(CI)(IO)(F)", "ZARZĄDZANIE NT\\SYSTEM:(M)",
      "ZARZĄDZANIE NT\\SYSTEM:(OI)(CI)(IO)(F)", "BUILTIN\\Administratorzy:(M)", "BUILTIN\\Administratorzy:(OI)(CI)(IO)(F)",
      "BUILTIN\\Użytkownicy:(RX)", "BUILTIN\\Użytkownicy:(OI)(CI)(IO)(GR,GE)", "TWÓRCA-WŁAŚCICIEL:(OI)(CI)(IO)(F)",
      "ZARZĄDZANIE PAKIETEM APLIKACJI\\WSZYSTKIE PAKIETY APLIKACJI:(RX)",
      "ZARZĄDZANIE PAKIETEM APLIKACJI\\WSZYSTKIE PAKIETY APLIKACJI:(OI)(CI)(IO)(GR,GE)",
      "ZARZĄDZANIE PAKIETEM APLIKACJI\\WSZYSTKIE PAKIETY APLIKACJI Z OGRANICZENIAMI:(RX)",
      "ZARZĄDZANIE PAKIETEM APLIKACJI\\WSZYSTKIE PAKIETY APLIKACJI Z OGRANICZENIAMI:(OI)(CI)(IO)(GR,GE)"] },
  programData: { sddl: "D:PAI(A;OICIIO;GA;;;CO)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)(A;CI;DCLCRPCR;;;BU)",
    pl: ["ZARZĄDZANIE NT\\SYSTEM:(OI)(CI)(F)", "BUILTIN\\Administratorzy:(OI)(CI)(F)", "TWÓRCA-WŁAŚCICIEL:(OI)(CI)(IO)(F)",
      "BUILTIN\\Użytkownicy:(OI)(CI)(RX)", "BUILTIN\\Użytkownicy:(CI)(WD,AD,WEA,WA)"] },
  driveRoot: { sddl: "D:PAI(A;;LC;;;AU)(A;OICIIO;SDGXGWGR;;;AU)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)"
      + "(A;;0x1000a1;;;S-1-15-3-65536-1888954469-739942743-1668119174-2468466756-4239452838-1296943325-355587736-700089176)",
    pl: ["BUILTIN\\Administratorzy:(OI)(CI)(F)", "ZARZĄDZANIE NT\\SYSTEM:(OI)(CI)(F)", "BUILTIN\\Użytkownicy:(OI)(CI)(RX)",
      "ZARZĄDZANIE NT\\Użytkownicy uwierzytelnieni:(OI)(CI)(IO)(M)", "ZARZĄDZANIE NT\\Użytkownicy uwierzytelnieni:(AD)",
      "S-1-15-3-65536-1888954469-739942743-1668119174-2468466756-4239452838-1296943325-355587736-700089176:(S,RD,X,RA)"] },
  public: { sddl: "D:PAI(A;OICIIO;FA;;;CO)(A;;0x1200af;;;S-1-5-3)(A;OICIIO;0x1301ff;;;S-1-5-3)(A;OICIIO;0x1301ff;;;IU)"
      + "(A;;0x1200af;;;IU)(A;OICIIO;0x1301ff;;;SU)(A;;0x1200af;;;SU)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)",
    pl: ["BUILTIN\\Administratorzy:(OI)(CI)(F)", "TWÓRCA-WŁAŚCICIEL:(OI)(CI)(IO)(F)", "ZARZĄDZANIE NT\\SYSTEM:(OI)(CI)(F)",
      "ZARZĄDZANIE NT\\INTERAKTYWNA:(OI)(CI)(IO)(M,DC)", "ZARZĄDZANIE NT\\INTERAKTYWNA:(RX,WD,AD)",
      "ZARZĄDZANIE NT\\USŁUGA:(OI)(CI)(IO)(M,DC)", "ZARZĄDZANIE NT\\USŁUGA:(RX,WD,AD)",
      "ZARZĄDZANIE NT\\WSADOWY:(OI)(CI)(IO)(M,DC)", "ZARZĄDZANIE NT\\WSADOWY:(RX,WD,AD)"] },
};
/* The same folders as an English Windows names their groups, the names swapped by the SID each stands for. */
const EN_NAMES = [
  ["ZARZĄDZANIE PAKIETEM APLIKACJI\\WSZYSTKIE PAKIETY APLIKACJI Z OGRANICZENIAMI",
    "APPLICATION PACKAGE AUTHORITY\\ALL RESTRICTED APPLICATION PACKAGES"],
  ["ZARZĄDZANIE PAKIETEM APLIKACJI\\WSZYSTKIE PAKIETY APLIKACJI", "APPLICATION PACKAGE AUTHORITY\\ALL APPLICATION PACKAGES"],
  ["ZARZĄDZANIE NT\\Użytkownicy uwierzytelnieni", "NT AUTHORITY\\Authenticated Users"],
  ["ZARZĄDZANIE NT\\INTERAKTYWNA", "NT AUTHORITY\\INTERACTIVE"], ["ZARZĄDZANIE NT\\USŁUGA", "NT AUTHORITY\\SERVICE"],
  ["ZARZĄDZANIE NT\\WSADOWY", "NT AUTHORITY\\BATCH"], ["ZARZĄDZANIE NT\\SYSTEM", "NT AUTHORITY\\SYSTEM"],
  ["BUILTIN\\Administratorzy", "BUILTIN\\Administrators"], ["BUILTIN\\Użytkownicy", "BUILTIN\\Users"],
  ["TWÓRCA-WŁAŚCICIEL", "CREATOR OWNER"], ["Wszyscy", "Everyone"]];
for (const r of Object.values(R)) {
  r.en = r.pl.map(l => { const n = EN_NAMES.find(([pl]) => l.startsWith(pl + ":")); return n ? n[1] + l.slice(n[0].length) : l; });
}

const CASES = [
  ["a locked folder", { mode: "all", instdir: "D:\\Apps\\Etiuda", tree: { "D:\\Apps": R.locked, "D:\\Apps\\Etiuda": R.lockedChild } }, "go"],
  ["a locked folder, Etiuda not yet made in it", { mode: "all", instdir: "D:\\Apps", tree: { "D:\\Apps": R.locked } }, "go"],
  ["a writable parent", { mode: "all", instdir: "D:\\Shared\\Etiuda", tree: { "D:\\Shared": R.open } }, "ask"],
  ["a locked folder whose parent lets them delete it", { mode: "all", instdir: "D:\\Kept\\Etiuda",
    tree: { "D:\\Kept": R.deleteChild, "D:\\Kept\\Etiuda": R.sealedChild } }, "ask"],
  ["a folder whose files they can change", { mode: "all", instdir: "D:\\Tools\\Etiuda",
    tree: { "D:\\Tools": R.owner, "D:\\Tools\\Etiuda": R.filesOpen } }, "ask"],
  ["Program Files", { mode: "all", instdir: "C:\\Program Files\\Etiuda", tree: { "C:\\Program Files": R.programFiles } }, "skip"],
  ["Program Files over a share", { mode: "all", instdir: "\\\\server\\c$\\Program Files\\Etiuda",
    tree: { "\\\\server\\c$\\Program Files": R.programFiles } }, "go"],
  ["ProgramData", { mode: "all", instdir: "C:\\ProgramData\\Etiuda", tree: { "C:\\ProgramData": R.programData, "C:\\": R.driveRoot } }, "ask"],
  ["a drive's root", { mode: "all", instdir: "C:\\Etiuda", tree: { "C:\\": R.driveRoot } }, "ask"],
  ["a share they can write", { mode: "all", instdir: "\\\\server\\c$\\Users\\Public\\Etiuda",
    tree: { "\\\\server\\c$\\Users\\Public": R.public } }, "ask"],
  ["a per-user install into a writable folder", { mode: "CurrentUser", instdir: "D:\\Shared\\Etiuda", tree: { "D:\\Shared": R.open } }, "skip"],
  ["a path with nothing readable above it", { mode: "all", instdir: "Q:\\Gone\\Etiuda", tree: {} }, "ask"],
];
const bySid = r => mode => openBySid(r.sddl, mode);
const byName = lang => r => mode => openByName(r[lang], mode);
const decide = reader => CASES.map(([name, c]) => [name, leave(c, reader)]);
const misses = got => got.filter(([name, d], i) => d !== CASES[i][2]).map(([name, d]) => name + " read " + d);

{
  let got, problems;
  try { got = decide(bySid); problems = misses(got); } catch (e) { problems = ["the model threw: " + e.message]; }
  check(problems.length === 0, "af1 the SID reading decides each recorded case, on a Windows that names its groups in Polish: "
    + CASES.map(([n, , d]) => n + " " + d).join("; "), problems.join("; "));
}
{
  const problems = [];
  try {
    const en = misses(decide(byName("en")));
    if (en.length) problems.push("over the English names it misses " + en.join(", "));
    const pl = decide(byName("pl")), sid = decide(bySid);
    const writable = CASES.map((c, i) => i).filter(i => CASES[i][2] === "ask" && Object.keys(CASES[i][1].tree).length);
    const kept = writable.filter(i => pl[i][1] === sid[i][1]).map(i => CASES[i][0]);
    if (kept.length) problems.push("over the Polish names it still asks for " + kept.join(", "));
    if (!writable.length) problems.push("no writable case to miss");
  } catch (e) { problems.push("the model threw: " + e.message); }
  check(problems.length === 0, "af2 a reading by the groups' names decides every case as af1 over the English names and misses each"
    + " writable one over the Polish names, so af1 run on a name-matching version is red", problems.join("; "));
}

/* ---- the installer's text ---- */
function constantsHeld(text) {
  const problems = [], got = readFrom(text);
  if (got.mask !== CHANGE_MASK) problems.push("the mask is " + got.mask + ", the named rights' " + CHANGE_MASK);
  if (got.inheritOnly !== 0x8) problems.push("inherit-only is " + got.inheritOnly + ", INHERIT_ONLY_ACE being 0x8");
  if (got.sids.join() !== FOUR.join()) problems.push("the SIDs read are " + (got.sids.join(", ") || "none"));
  if (got.sids.length !== (got.open.match(/EqualSid\(/g) || []).length) problems.push("not every SID is compared");
  if (got.types.join() !== "0,9") problems.push("the entry types are " + (got.types.join(", ") || "none") + ", not allowed (0) and allowed callback (9)");
  if (!/IntOp \$8 \$8 & \$\{ETIUDA_CHANGE_MASK\}/.test(got.open) || !/IntOp \$9 \$7 & \$\{ETIUDA_INHERIT_ONLY\}/.test(got.open))
    problems.push("the mask or the flag is not what the entry is read against");
  if (!/GetNamedSecurityInfoW\(w R0, i 1, i 4,/.test(got.open)) problems.push("the DACL is not read as a file's (1) DACL (4)");
  return problems;
}
check(constantsHeld(NSH).length === 0, "af3 the mask the model reads out of shell/installer/allusers-folder.nsh is the named rights' (0x" + CHANGE_MASK.toString(16)
  + "), the flag inherit-only, the entry types the allowed ones and the SIDs the four, each compared", constantsHeld(NSH).join("; "));

const ROW = ["!ifmacrodef etiudaFolderCheck", "!insertmacro etiudaFolderCheck",
  "!define MUI_PAGE_CUSTOMFUNCTION_LEAVE etiudaFolderLeave", "!endif"];
function patchedPage(assisted) {
  const problems = [];
  const t = assisted.split(/\r?\n/).map(l => l.trim());
  const page = t.indexOf("!insertmacro MUI_PAGE_DIRECTORY");
  if (page < 0 || t.indexOf("!insertmacro MUI_PAGE_DIRECTORY", page + 1) > -1) return ["the folder page is not there once"];
  if (ROW.some((r, k) => t[page - ROW.length + k] !== r)) problems.push("the four lines do not stand just before the folder page");
  if (t[page - ROW.length - 1] !== "!insertmacro skipPageIfUpdated") problems.push("the page's own skip is not just above them");
  const above = t.slice(0, page).join("\n");
  if (!/!ifndef BUILD_UNINSTALLER[\s\S]*!ifdef allowToChangeInstallationDirectory/.test(above)) problems.push("not in the installer pass");
  return problems;
}
function calledOnlyAsLeave(texts) {
  const problems = [];
  for (const [name, text] of texts) {
    if (/\bCall\s+etiudaFolderLeave\b|GetFunctionAddress\s+\S+\s+etiudaFolderLeave\b/.test(text)) problems.push(name + " calls it");
    if (/\bCall\s+etiudaFolderOpen\b/.test(text) && name !== "allusers-folder.nsh") problems.push(name + " calls the reading");
  }
  return problems;
}
{
  let problems = [];
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "allusers-folder-"));
  try {
    const from = path.join(ROOT, "node_modules", "app-builder-lib", "templates", "nsis");
    const to = path.join(work, "node_modules", "app-builder-lib", "templates", "nsis");
    fs.cpSync(from, to, { recursive: true });
    const { applyNsisPatches } = nodeRequire(path.join(ROOT, "tools", "patch-nsis.cjs"));
    const status = applyNsisPatches(work);
    if (!status.applied) problems.push("the patches do not all apply: " + JSON.stringify(status.machineWideMissing));
    const assisted = fs.readFileSync(path.join(to, "assistedInstaller.nsh"), "utf8");
    problems = problems.concat(patchedPage(assisted));
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name))
      : /\.(nsh|nsi)$/.test(e.name) ? [[path.relative(to, path.join(d, e.name)), fs.readFileSync(path.join(d, e.name), "utf8")]] : []);
    problems = problems.concat(calledOnlyAsLeave(walk(to).concat([["shell/installer.nsh", read("shell/installer.nsh")],
      ["allusers-folder.nsh", NSH]])));
    const leaveFn = functionOf(macroOf(NSH, "etiudaFolderCheck"), "etiudaFolderLeave");
    if (!leaveFn) problems.push("allusers-folder.nsh's etiudaFolderCheck holds no etiudaFolderLeave");
    const nsh = read("shell/installer.nsh"), inc = nsh.indexOf("\\installer\\allusers-folder.nsh\"");
    if (inc < 0 || inc < nsh.indexOf("!macro customUnInstall")) problems.push("shell/installer.nsh does not include it after its five hooks");
  } catch (e) { problems.push("the templates could not be patched in a copy: " + e.message); }
  finally { try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* the leg's own folder */ } }
  check(problems.length === 0, "af4 the patched template compiles the check and makes etiudaFolderLeave the folder page's leave"
    + " function in the installer pass alone, and nothing calls it, so a silent run, which shows no page, proceeds", problems.join("; "));
}

const EN_BOX = "This folder, or the one above it, can be changed by people who are not administrators, and with it what"
  + " ${PRODUCT_NAME} runs for everyone. Program Files, or a folder they cannot change, is safer. Install here anyway?";
const PL_BOX = "Ten folder lub folder nad nim mogą zmieniać osoby bez uprawnień administratora, a wraz z nim to, co ${PRODUCT_NAME}"
  + " uruchamia dla wszystkich. Bezpieczniej w Program Files lub w folderze, którego nie mogą zmieniać. Zainstalować mimo to?";
function asksOnly(text) {
  const problems = [];
  const macro = macroOf(text, "etiudaFolderCheck"), fn = functionOf(macro, "etiudaFolderLeave");
  if (!fn) return ["no etiudaFolderLeave"];
  const lines = fn.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const gate = lines.indexOf("${If} $installMode == \"all\"");
  if (gate !== 1 || lines[0] !== "StrCpy $etiudaFolderBack \"0\"") problems.push("the check is not the all-users install's alone");
  const tail = lines.slice(-4).join("\n");
  if (tail !== "${EndIf}\n${If} $etiudaFolderBack == \"1\"\nAbort\n${EndIf}") problems.push("Abort is not only where No was chosen");
  const body = lines.slice(gate + 1, -4);
  if (lines.filter(l => /^(Call|MessageBox|\$\{If\} \$\{Cmd\})/.test(l)).some(l => body.indexOf(l) < 0))
    problems.push("a call or the box stands outside the all-users condition");
  for (const pf of ["$PROGRAMFILES64", "$PROGRAMFILES"]) {
    const skip = new RegExp("StrLen \\$3 \\" + pf + "\\r?\\n\\s*StrCpy \\$4 \\$0 \\$3\\r?\\n\\s*StrCpy \\$1 \\$0 1 \\$3\\r?\\n\\s*"
      + "\\$\\{If\\} \\$4 == \\" + pf + "\\r?\\n\\s*\\$\\{AndIf\\} \\$1 == \"\\\\\"\\r?\\n\\s*StrCpy \\$2 \"skip\"");
    if (!skip.test(fn)) problems.push("no skip under " + pf + " up to a backslash");
  }
  if (!/\$\{If\} \$2 != "skip"/.test(fn)) problems.push("the reading is not passed over under Program Files");
  const boxes = macro.match(/MessageBox[^\r\n]*/g) || [];
  if (boxes.length !== 1 || !/^[ \t]*\$\{If\} \$\{Cmd\} `MessageBox MB_YESNO "\$1" \/SD IDYES IDNO`\r?\n\s*StrCpy \$etiudaFolderBack "1"$/m
    .test(fn)) problems.push("the box is not one Yes and No box, silent Yes, whose No alone goes back: " + boxes.join(" | "));
  const refusal = /^\s*(Quit|SetErrorLevel|Delete|RMDir|Rename|CopyFiles|SetOutPath|Exec|ExecWait|ExecShell|nsExec::\S+|Write\w+|DeleteReg\w+)\b/m
    .exec(macro);
  if (refusal) problems.push("it " + refusal[1]);
  const words = [...fn.matchAll(/StrCpy \$1 "([^"]+)"/g)].map(m => m[1]);
  if (words.join("\n") !== [PL_BOX, EN_BOX].join("\n") || !/\$\{If\} \$LANGUAGE == 1045\r?\n\s*StrCpy \$1 "Ten folder/.test(fn))
    problems.push("the words are not the copywriter's, Polish under 1045 and English otherwise");
  return problems;
}
check(asksOnly(NSH).length === 0, "af5 the check runs only for an all-users install outside Program Files, never refuses and writes"
  + " nothing: one Yes and No box, silent default Yes, No staying on the page, the copywriter's words in both languages",
  asksOnly(NSH).join("; "));

const ADMIN_EN = "Install for all users into Program Files, or into a folder that neither Users, Authenticated Users, Everyone nor"
  + " INTERACTIVE (S-1-5-32-545, S-1-5-11, S-1-1-0, S-1-5-4) can write to, and whose parent folder they cannot write to either."
  + " A silent install gives no warning when this is not so.";
const ADMIN_PL = "Instalację dla wszystkich użytkowników umieszcza się w Program Files albo w folderze, do którego, ani do jego folderu"
  + " nadrzędnego, nie mogą zapisywać grupy Users, Authenticated Users, Everyone ani INTERACTIVE (S-1-5-32-545, S-1-5-11, S-1-1-0,"
  + " S-1-5-4). Instalacja w trybie cichym nie ostrzega, gdy tak nie jest.";
{
  const problems = [];
  const readme = read("README.md").replace(/\r\n/g, "\n");
  const section = (/^## Installing silently\n([\s\S]*?)^## /m.exec(readme) || [])[1] || "";
  if (section.replace(/\s+/g, " ").indexOf(ADMIN_EN) < 0) problems.push("README.md's Installing silently lacks it");
  const beside = read("shell/policy/readme.txt").replace(/\s+/g, " ");
  if (beside.indexOf(ADMIN_EN) < 0 || beside.indexOf(ADMIN_PL) < 0) problems.push("shell/policy/readme.txt lacks it in both languages");
  check(problems.length === 0, "af6 README.md's Installing silently and shell/policy/readme.txt, beside the policy template, say where"
    + " an all-users install belongs, the readme in English and Polish", problems.join("; "));
}

{
  const problems = [];
  const plant = (from, to) => { if (NSH.split(from).length !== 2) throw new Error("plant anchor not once: " + from); return NSH.replace(from, to); };
  try {
    const p = [
      ["the all-users condition", asksOnly(plant("${If} $installMode == \"all\"", "${If} 1 = 1"))],
      ["the silent default", asksOnly(plant("/SD IDYES IDNO", "/SD IDNO IDNO"))],
      ["the No", asksOnly(plant("/SD IDYES IDNO`", "/SD IDYES IDYES`"))],
      ["the Program Files skip", asksOnly(plant("StrLen $3 $PROGRAMFILES64", "StrLen $3 $PROGRAMFILES32"))],
      ["a Quit", asksOnly(plant("      StrCpy $etiudaFolderBack \"1\"\n", "      StrCpy $etiudaFolderBack \"1\"\n      Quit\n"))],
      ["the mask", constantsHeld(plant("!define ETIUDA_CHANGE_MASK 0x500D0046", "!define ETIUDA_CHANGE_MASK 0x500D0006"))],
    ];
    for (const [what, found] of p) if (!found.length) problems.push(what + " stays green");
    const assisted = fs.readFileSync(path.join(ROOT, "node_modules", "app-builder-lib", "templates", "nsis", "assistedInstaller.nsh"), "utf8")
      .split(/\r?\n/).filter(l => ROW.indexOf(l.trim()) < 0).join("\n");
    if (!patchedPage(assisted).length) problems.push("the template without the row stays green");
  } catch (e) { problems.push(e.message); }
  check(problems.length === 0, "af7 lifting the all-users condition, the silent default, the No, the Program Files skip, the patch row"
    + " or the mask, or adding a Quit, turns its leg red", problems.join("; "));
}

const EXPECTED = 7;
if (asserted !== EXPECTED) { failed++; asserted++; console.log("  FAIL ran " + asserted + " checks, expected " + EXPECTED); }
console.log("#counts checks=" + asserted + " failures=" + failed);
console.log(failed ? "allusers-folder: " + failed + " of " + asserted + " failed" : "allusers-folder: all " + asserted + " passed");
process.exit(Math.min(failed, 63));
