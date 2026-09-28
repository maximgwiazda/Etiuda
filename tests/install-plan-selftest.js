/* The install plan, held at node level: every argument vector, every key and path, and every
 * clause of every verdict in tests/install-plan.js, each against a planted flaw.
 *
 *   node tests/install-plan-selftest.js
 *
 * WHAT IT PROVES AND WHAT IT CANNOT. It proves that the update and all-users legs pass the
 * installer what NSIS reads as meant, look where electron-builder writes, and judge the facts they
 * collect so that each broken fact reddens its own row and nothing else. It cannot prove that the
 * facts the gate collects on a real desk are the true ones: that is tests/update-install.js in a
 * machine window, with an installer, and for the all-users leg an elevated shell.
 *
 * THE METHOD FOR THE VERDICTS. One set of good facts, which must be green in every row; then one
 * mutant per clause, which must redden exactly the row that clause belongs to. A mutant that
 * reddens nothing is a clause with no teeth; one that reddens two is two claims in one row. And a
 * judge fed no facts at all must redden every row, or an empty collection would pass.
 *
 * Exit code is the number of failed checks, capped at 63. */
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const P = require("./install-plan.js");

let checks = 0, fails = 0;
const notRun = [];
const ok = (cond, what) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + what); if (!cond) fails++; };

/* ---- 1. the GUID, two implementations and a known answer ------------------------------------ */

/* RFC 4122 appendix B's name-based example as widely reproduced: the DNS namespace and
   "www.example.com" give this v5 UUID. A known answer that owes nothing to electron-builder. */
const DNS_NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
ok(P.uuidV5("www.example.com", DNS_NS) === "2ed6657d-e927-568b-95e1-2665a8aea6a2",
  "1a uuidV5 gives the published v5 answer for www.example.com in the DNS namespace: "
  + P.uuidV5("www.example.com", DNS_NS));
let builderUuid = null;
try { builderUuid = require(require.resolve("builder-util-runtime", { paths: [path.join(__dirname, "..")] })).UUID; }
catch (e) { builderUuid = null; }
if (builderUuid) {
  const ids = ["app.etiuda.desktop", "app.etiuda.studio"];
  /* AS NsisTarget.js CALLS IT, with the namespace PARSED to bytes: given the string, UUID.v5 hashes
     the string's characters and answers another GUID, which is how this leg's first run went red
     on 2026-09-28 against a plan that was right. */
  const theirs = ids.map(id => builderUuid.v5(id, builderUuid.parse(P.BUILDER_NS)));
  const ours = ids.map(P.appGuid);
  ok(JSON.stringify(theirs) === JSON.stringify(ours),
    "1b the GUID the installer keys its registry entries by is electron-builder's own: "
    + ids.map((id, i) => id + " -> " + ours[i] + (ours[i] === theirs[i] ? "" : " (builder says " + theirs[i] + ")")).join(", "));
} else {
  notRun.push("1b, builder-util-runtime is not installed");
  console.log("  NOT RUN 1b: builder-util-runtime is not installed, so the GUID is held to the RFC answer alone");
}
/* AND THE NAMESPACE IS THE ONE THE BUILDER USES TODAY, read out of NsisTarget.js itself, so an
   electron-builder that changed it would redden here before an installer keyed its registry by
   another GUID than the gate looks for. */
let nsTarget = "";
try {
  const f = path.join(path.dirname(require.resolve("app-builder-lib/package.json", { paths: [path.join(__dirname, "..")] })),
                      "out", "targets", "nsis", "NsisTarget.js");
  nsTarget = (/ELECTRON_BUILDER_NS_UUID\s*=\s*[\w.]*UUID\.parse\("([0-9a-f-]{36})"\)/.exec(fs.readFileSync(f, "utf8")) || [])[1] || "none found";
} catch (e) { nsTarget = ""; }
if (nsTarget) ok(nsTarget === P.BUILDER_NS, "1d electron-builder's NsisTarget.js parses the namespace " + nsTarget + ", the plan's own");
else { notRun.push("1d, app-builder-lib is not installed"); console.log("  NOT RUN 1d: app-builder-lib is not installed"); }
ok(P.appGuid("app.etiuda.desktop") !== P.appGuid("app.etiuda.desktoq")
   && P.appGuid("app.etiuda.desktop") !== P.appGuid("app.etiuda.studio"),
  "1c control: one character of the appId moves the GUID, and the two products' GUIDs differ, so 1b"
  + " compares something and the two trees' installers never share a key");

/* ---- 2. the argument vectors ------------------------------------------------------------------ */

const DIR = "C:\\Users\\lab\\etiuda-update-x\\prog";
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
ok(eq(P.installArgs({ mode: "user", dir: DIR }), ["/S", "/currentuser", "/D=" + DIR])
   && eq(P.installArgs({ mode: "machine", dir: DIR }), ["/S", "/allusers", "/D=" + DIR])
   && eq(P.installArgs({ mode: "user" }), ["/S", "/currentuser"])
   && eq(P.installArgs({ mode: "user", dir: DIR.replace(/\\/g, "/") }), ["/S", "/currentuser", "/D=" + DIR]),
  "2a the vectors: per user and all users with /D last and unquoted, the update with no /D so the"
  + " setup finds the folder itself, and forward slashes turned to backslashes: "
  + JSON.stringify(P.installArgs({ mode: "machine", dir: DIR })));
ok(eq(P.uninstallArgs("user"), ["/S", "/currentuser"]) && eq(P.uninstallArgs("machine"), ["/S", "/allusers"])
   && eq(P.plainArgs(DIR), ["/S", "/D=" + DIR]),
  "2b the uninstallers take the context they were installed in, and A10's plain vector carries no"
  + " context flag: " + JSON.stringify(P.plainArgs(DIR)));
const refusals = [
  ["a space", { mode: "user", dir: "C:\\Program Files\\Etiuda" }, /space/],
  ["a quote", { mode: "user", dir: "C:\\lab\\\"x" }, /quote/],
  ["a relative path", { mode: "user", dir: "lab\\prog" }, /absolute/],
  ["an empty folder", { mode: "user", dir: "" }, /no folder/],
  ["a mode nobody has", { mode: "everyone", dir: DIR }, /user or machine/],
];
for (const [what, o, re] of refusals) {
  let said = "";
  try { P.installArgs(o); said = "ACCEPTED"; } catch (e) { said = e.message; }
  ok(re.test(said), "2c installArgs refuses " + what + ": " + said);
}
/* argsFault is what the gate asks of every vector before it runs one. Good vectors pass; each
   mutant names its own fault. */
const good = [[P.installArgs({ mode: "user", dir: DIR }), "user"], [P.installArgs({ mode: "machine", dir: DIR }), "machine"],
              [P.installArgs({ mode: "user" }), "user"], [P.uninstallArgs("machine"), "machine"]];
ok(good.every(([a, m]) => P.argsFault(a, m) === ""),
  "2d every vector the plan builds passes argsFault: " + good.map(([a, m]) => m + " " + JSON.stringify(P.argsFault(a, m))).join(", "));
const faults = [
  ["/D not last", ["/S", "/D=" + DIR, "/currentuser"], "user", /only last/],
  ["no /S", ["/currentuser", "/D=" + DIR], "user", /not silent/],
  ["both context flags", ["/S", "/currentuser", "/allusers", "/D=" + DIR], "machine", /alone was meant/],
  ["the other context", ["/S", "/currentuser", "/D=" + DIR], "machine", /alone was meant/],
  ["no context flag", P.plainArgs(DIR), "user", /alone was meant/],
  ["a quoted /D", ["/S", "/currentuser", "/D=\"" + DIR + "\""], "user", /quote/],
];
for (const [what, a, m, re] of faults)
  ok(re.test(P.argsFault(a, m)), "2e argsFault catches " + what + ": " + P.argsFault(a, m));

/* ---- 3. the keys and the folders --------------------------------------------------------------- */

const G = P.appGuid("app.etiuda.desktop");
const ku = P.registryKeys("user", G), km = P.registryKeys("machine", G);
ok(ku.uninstall === "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + G
   && ku.install === "HKCU:\\Software\\" + G && km.uninstall.indexOf("HKLM:\\") === 0
   && km.install === "HKLM:\\Software\\" + G && km.classes === "HKLM:\\Software\\Classes",
  "3a the keys: " + ku.uninstall + ", " + ku.install + ", and their HKLM twins for all users");
const H = P.scratchHome("C:\\lab\\etiuda-update-x");
const under = p => p.toLowerCase().indexOf(H.HOME.toLowerCase() + "\\") === 0;
ok(Object.values(H.places).every(under) && under(H.documents) && H.env.USERPROFILE === H.HOME
   && H.env.APPDATA === H.places.ApplicationData && H.env.LOCALAPPDATA === H.places.LocalApplicationData
   && H.make.length === 5,
  "3b the scratch home: all four places Windows is asked for and Documents are under " + H.HOME
  + ", and the three variables a child gets agree with them");
ok(P.userDataName({ name: "etiuda" }) === "etiuda"
   && P.userDataName({ name: "etiuda-studio", productName: "Etiuda Studio" }) === "Etiuda Studio"
   && P.userDataName({}) === "",
  "3c the user-data folder name is Electron's: productName where there is one, else name");
ok(P.defaultUserInstallDir(H.places.LocalApplicationData, "Etiuda") === path.win32.join(H.places.LocalApplicationData, "Programs", "Etiuda"),
  "3d the default per-user folder a setup with no /D and no older copy would use: "
  + P.defaultUserInstallDir(H.places.LocalApplicationData, "Etiuda"));

/* ---- 4. the verdicts, each clause against its own planted flaw ------------------------------- */

function holdJudge(name, judge, facts, mutants) {
  const base = judge(facts);
  const bad = base.filter(r => !r.ok);
  ok(bad.length === 0, "4 " + name + ": the good facts are green in all " + base.length + " rows"
    + (bad.length ? "; RED: " + bad.map(r => r.id + " " + r.what).join(" | ") : ""));
  const empty = judge({}).filter(r => r.ok);
  ok(empty.length === 0, "4 " + name + ": fed no facts, every row is red (" + empty.length + " green: "
    + empty.map(r => r.id).join(", ") + ")");
  const ids = new Set();
  for (const [what, patch, want] of mutants) {
    const f = JSON.parse(JSON.stringify(facts));
    patch(f);
    const red = judge(f).filter(r => !r.ok).map(r => r.id);
    ids.add(want);
    ok(red.length === 1 && red[0] === want,
      "4 " + name + " mutant, " + what + ": reddens " + JSON.stringify(red) + ", want [" + JSON.stringify(want) + "]");
  }
  const uncovered = base.map(r => r.id).filter(id => !ids.has(id));
  ok(uncovered.length === 0, "4 " + name + ": every row has at least one mutant of its own"
    + (uncovered.length ? "; NONE FOR " + uncovered.join(", ") : ""));
}

const PROG = "C:\\lab\\home\\prog";
const EXE = PROG + "\\Etiuda.exe";
const updateFacts = {
  setupExit: 0, dir: PROG, exe: EXE, exeThere: true, installLocation: PROG,
  defaultDir: "C:\\lab\\home\\AppData\\Local\\Programs\\Etiuda", defaultDirExists: false,
  programOld: "a".repeat(64), programNew: "b".repeat(64), programTree: "b".repeat(64),
  oldOnlyGone: true, appKeys: 1, keyName: G, keyBefore: G, version: "2.0.1", wantVersion: "2.0.1",
  uninstallString: "\"" + PROG + "\\Uninstall Etiuda.exe\" /currentuser",
  shortcuts: { desktop: { count: 1, target: EXE, hotkey: "Ctrl+Alt+E" }, startMenu: { count: 1, target: EXE } },
  hotkeyWant: "Ctrl+Alt+E",
  assocCmd: "\"" + EXE + "\" \"%1\"",
  deskBefore: "d".repeat(64), deskAfter: "d".repeat(64),
  catalogsBefore: { "desk-notes.ec": "e".repeat(64) }, catalogsAfter: { "desk-notes.ec": "e".repeat(64) },
  cacheExists: false,
};
holdJudge("judgeUpdate", P.judgeUpdate, updateFacts, [
  ["the setup exited 199", f => { f.setupExit = 199; }, "U1"],
  ["no Etiuda.exe in the old folder", f => { f.exeThere = false; }, "U2"],
  ["the key names another folder", f => { f.installLocation = "C:\\elsewhere"; }, "U2"],
  ["a second copy in the default folder", f => { f.defaultDirExists = true; }, "U2"],
  ["the older program is still there", f => { f.programNew = f.programOld; }, "U3"],
  ["a program that is not this tree's", f => { f.programNew = "c".repeat(64); }, "U3"],
  /* The gate refuses this case at U0b before any update runs, so without this mutant the clause
     `programNew !== programOld` was redundant and a plant removing it stayed green (2026-09-28). */
  ["the older copy is this tree's program, U0b bypassed", f => { f.programOld = f.programTree; }, "U3"],
  ["the old copy's own file survived", f => { f.oldOnlyGone = false; }, "U4"],
  ["two uninstall keys", f => { f.appKeys = 2; }, "U5"],
  ["a different key", f => { f.keyName = "other"; }, "U5"],
  ["the older version on the key", f => { f.version = "2.0.0"; }, "U5"],
  ["an all-users uninstall string", f => { f.uninstallString = f.uninstallString.replace("/currentuser", "/allusers"); }, "U5"],
  ["two Desktop shortcuts", f => { f.shortcuts.desktop.count = 2; }, "U6"],
  ["a Start Menu shortcut to another folder", f => { f.shortcuts.startMenu.target = "C:\\old\\Etiuda.exe"; }, "U6"],
  ["the person's hotkey lost", f => { f.shortcuts.desktop.hotkey = ""; }, "U6b"],
  ["the association to another copy", f => { f.assocCmd = "\"C:\\old\\Etiuda.exe\" \"%1\""; }, "U7"],
  ["the desk rewritten", f => { f.deskAfter = "f".repeat(64); }, "U8"],
  ["a catalog gone", f => { f.catalogsAfter = {}; }, "U8b"],
  ["a catalog changed", f => { f.catalogsAfter["desk-notes.ec"] = "0".repeat(64); }, "U8b"],
  ["the cached setup left", f => { f.cacheExists = true; }, "U9"],
]);

const runFacts = {
  booted: true, cards: 12, wantCards: 12, glassOff: true, keyGlass: "1",
  keysBefore: { eGlassOff: "1", eCatalog: "{}" }, keysAfter: { eGlassOff: "1", eCatalog: "{}", eNew: "x" },
  controlBooted: true, controlCards: 0, controlGlassOff: false,
};
holdJudge("judgeUpdatedRun", P.judgeUpdatedRun, runFacts, [
  ["no cards", f => { f.cards = 0; }, "U10"],
  ["the app did not boot", f => { f.booted = false; }, "U10"],
  ["the setting not in effect", f => { f.glassOff = false; }, "U10b"],
  ["the setting gone from the desk", f => { f.keyGlass = undefined; }, "U10b"],
  ["a key the older copy left changed", f => { f.keysAfter.eCatalog = "{\"x\":1}"; }, "U10c"],
  ["a key the older copy left dropped", f => { delete f.keysAfter.eCatalog; }, "U10c"],
  ["the control shows cards", f => { f.controlCards = 12; }, "U11"],
  ["the control keeps the setting", f => { f.controlGlassOff = true; }, "U11"],
]);

const PM = "C:\\lab\\pm";
const allFacts = {
  setupExit: 0, exeThere: true, dir: PM,
  machineKeys: 1, machineLocation: PM, uninstallString: "\"" + PM + "\\Uninstall Etiuda.exe\" /allusers", userKeysAdded: 0,
  machineInstallKey: PM,
  commonDesktop: 1, commonPrograms: 1, userDesktop: 0, userPrograms: 0,
  machineAssocCmd: "\"" + PM + "\\Etiuda.exe\" \"%1\"", userAssocChanged: false,
  userCacheExists: false, machineCacheExists: false,
  booted: true, userDataInHome: true,
  goneSeconds: 4, exeAfter: false, machineKeysAfter: 0, machineInstallKeyAfter: "",
  commonDesktopAfter: 0, commonProgramsAfter: 0, machineAssocCmdAfter: "",
  deskKept: true,
  perUserExit: 0, perUserKeys: 1, perUserMachineKeys: 0,
};
holdJudge("judgeAllUsers", P.judgeAllUsers, allFacts, [
  ["the elevated install exited 2", f => { f.setupExit = 2; }, "A1"],
  ["the key under HKCU instead", f => { f.machineKeys = 0; f.userKeysAdded = 1; }, "A2"],
  ["a per-user uninstall string", f => { f.uninstallString = f.uninstallString.replace("/allusers", "/currentuser"); }, "A2"],
  ["the install key names nothing", f => { f.machineInstallKey = ""; }, "A3"],
  ["the shortcut in the user's own Desktop", f => { f.commonDesktop = 0; f.userDesktop = 1; }, "A4"],
  ["the association under HKCU instead", f => { f.machineAssocCmd = ""; f.userAssocChanged = true; }, "A5"],
  ["the user's cached setup left, the context dance gone", f => { f.userCacheExists = true; }, "A6"],
  ["a cache under ProgramData", f => { f.machineCacheExists = true; }, "A6"],
  ["the desk outside the user's AppData", f => { f.userDataInHome = false; }, "A7"],
  ["the folder still there", f => { f.exeAfter = true; }, "A8"],
  ["the HKLM install key left behind", f => { f.machineInstallKeyAfter = PM; }, "A8"],
  ["the public Desktop shortcut left", f => { f.commonDesktopAfter = 1; }, "A8"],
  ["the association left", f => { f.machineAssocCmdAfter = f.machineAssocCmd; }, "A8"],
  ["the user's desk removed", f => { f.deskKept = false; }, "A9"],
  ["the plain install went per machine, the 2026-09-17 residue", f => { f.perUserKeys = 0; f.perUserMachineKeys = 1; }, "A10"],
  ["the plain install exited 199", f => { f.perUserExit = 199; }, "A10"],
]);

/* ---- 5. the gate uses the judges it is held to ------------------------------------------------ */

/* A CALL, NOT A MENTION: comment lines and block comments are dropped before counting, because a
   text leg that reads comments stays green with the call reverted and kept in a comment (measured
   2026-09-27). Each judge must be called at least once in the gate's code, and so must argsFault. */
const gateSrc = fs.readFileSync(path.join(__dirname, "update-install.js"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");
const calls = ["judgeUpdate", "judgeUpdatedRun", "judgeAllUsers", "argsFault", "installArgs", "uninstallArgs", "plainArgs"]
  .map(n => [n, (gateSrc.match(new RegExp("\\bP\\." + n + "\\(", "g")) || []).length]);
ok(calls.every(([, n]) => n > 0),
  "5a tests/update-install.js calls every judge and every vector builder here, by regex for `P.<name>(` over its"
  + " code with comments dropped: " + calls.map(([k, n]) => k + " " + n).join(", "));
const commented = "/* P.judgeUpdate( */ // P.judgeAllUsers(\nconst x = 1;"
  .replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");
ok(!/\bP\.judge/.test(commented), "5b control: the same reading of a call kept only in comments finds none");

/* ---- 6. the page readings the gate copied are the reinstall loop's own ------------------------ */

/* Text from `const NAME = ` to the end of the first line that starts with `}`, in each file. A copy
   that drifted from its source would read a different screen from the one the reinstall loop's
   legs were proved on. */
const blockOf = (text, name) => {
  const t = text.replace(/\r\n/g, "\n");
  const at = t.indexOf("const " + name + " = ");
  if (at < 0) return null;
  const end = t.indexOf("\n}", at);
  if (end < 0) return null;
  const eol = t.indexOf("\n", end + 1);
  return t.slice(at, eol < 0 ? t.length : eol);
};
const reSrc = fs.readFileSync(path.join(__dirname, "reinstall.js"), "utf8");
const upSrc = fs.readFileSync(path.join(__dirname, "update-install.js"), "utf8");
const pages = ["SEEN", "SKIP_TOUR", "DRIVE_BLUR_OFF"].map(n => [n, blockOf(reSrc, n), blockOf(upSrc, n)]);
ok(pages.every(([, a, b]) => !!a && a === b),
  "6a the three page readings in tests/update-install.js are tests/reinstall.js's, text for text: "
  + pages.map(([n, a, b]) => n + " " + (!a ? "NOT IN reinstall.js" : !b ? "NOT IN update-install.js" : a === b ? a.length + " chars equal" : "DIFFERENT")).join(", "));
const drifted = pages[0][1] ? pages[0][1].replace("#list .card", "#list .cards") : "";
ok(!!drifted && drifted !== pages[0][2], "6b control: one selector changed in a copy of SEEN reads as different");

console.log("\n#counts checks=" + checks + " failed=" + fails + " notRun=" + notRun.length);
console.log("install-plan-selftest " + (fails ? "FAILED " + fails + " of " : "passed ") + checks + " check(s)");
process.exit(fails ? Math.min(fails, 63) : 0);
