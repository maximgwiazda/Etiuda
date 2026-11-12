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

/* ---- 7. semver comparison with pre-release tags and installer actions ------------------------ */
/* These cases hold the JS twin, compareSemver in tests/install-plan.js. The installer's own CompareSemver in
   shell/installer.nsh is held only by reading: no leg runs NSIS. */

const semverCases = [
  ["2.0.0-dev", "2.0.0", -1, "2.0.0-dev is older than 2.0.0"],
  ["2.0.0", "2.0.0", 0, "equal strings are the same"],
  ["2.0.1", "2.0.0", 1, "2.0.1 is newer than 2.0.0"],
  ["1.9.9", "2.0.0", -1, "1.9.9 is older than 2.0.0"],
  ["2.0.0-alpha", "2.0.0-beta", -1, "alpha is older than beta"],
  ["2.0.0-dev", "2.0.0-rc.1", -1, "dev is older than rc.1 (alphabetic prerelease, the pair LogicLib's integer < judged equal)"],
  ["2.0.0-beta.1", "2.0.0-beta.2", -1, "beta.1 is older than beta.2"],
  ["2.0.0-beta.2", "2.0.0-beta.11", -1, "beta.2 is older than beta.11 (numeric prerelease)"],
  ["2.0.0-alpha", "2.0.0-alpha.1", -1, "fewer prerelease fields has lower precedence"],
  ["2.0.0-1", "2.0.0-2", -1, "numeric prerelease comparison"],
  ["2.0.0+build1", "2.0.0+build2", 0, "build metadata is ignored in precedence"],
  ["invalid", "2.0.0", null, "unparseable string answers null"],
  ["", "2.0.0", null, "empty string answers null"],
];
for (const [a, b, expected, msg] of semverCases) {
  let cmp;
  try { cmp = P.compareSemver(a, b); } catch (e) { cmp = "THREW"; }
  ok(cmp === expected, "7a semver: " + msg + " (" + a + " vs " + b + " -> " + cmp + ")");
}

const outcomeCases = [
  ["1.9.0", "2.0.0", "older", "Update"],
  ["2.0.0-dev", "2.0.0", "older", "Update"],
  ["2.0.0", "2.0.0", "same", "Reinstall"],
  ["2.1.0", "2.0.0", "newer", "Reinstall"],
  ["unreadable", "2.0.0", "unreadable", "Reinstall"],
  ["", "2.0.0", "unreadable", "Reinstall"],
  [null, "2.0.0", "unreadable", "Reinstall"],
];
for (const [installed, current, outcome, action] of outcomeCases) {
  let gotOutcome, gotAction;
  try {
    gotOutcome = P.recogniseOutcome(installed, current);
    gotAction = P.recogniseAction(gotOutcome);
  } catch (e) { gotOutcome = "THREW"; gotAction = "THREW"; }
  ok(gotOutcome === outcome && gotAction === action,
    "7b outcome: installed " + JSON.stringify(installed) + " vs current " + current
    + " maps to " + gotOutcome + " -> " + gotAction);
}

/* ---- 8. installer script recognition verification ------------------------------------------- */

let recogInfo;
try {
  const nsh = fs.readFileSync(path.join(__dirname, "..", "shell", "installer.nsh"), "utf8");
  recogInfo = P.readInstallerRecognise(nsh);
} catch (e) { recogInfo = { error: e.message }; }

ok(recogInfo && recogInfo.inCustomInit === true,
  "8a recognition runs in the install side's init (customInit), before any file is written");
ok(recogInfo && recogInfo.readsInstalledVersion === true,
  "8b recognition reads the installed version from the key electron-builder writes (${UNINSTALL_REGISTRY_KEY})");
ok(recogInfo && recogInfo.comparesVersions === true,
  "8c recognition compares versions and handles older, same, newer and unreadable");
ok(recogInfo && recogInfo.silentSkips === true,
  "8d silent install skips the dialog entirely");
ok(recogInfo && recogInfo.cancelQuits === true,
  "8e cancel quits without change");
ok(recogInfo && recogInfo.hasCopywriterWordsEn === true && recogInfo.hasCopywriterWordsPl === true,
  "8f copywriter words present for English and Polish exactly");
ok(recogInfo && recogInfo.placeholdersMarked === true,
  "8g placeholders in LangString lines are marked with '; placeholder: Claudette'");

/* ---- 9. package-time patch verification ---------------------------------------------------- */

/* The patch tool runs on COPIES of the installed templates in a scratch root, so this leg neither depends on whether
   node_modules was patched already nor writes into it; applying twice must change nothing (idempotent). */
let patchStatus, patchTwiceSame = false;
try {
  const patchTool = require("../tools/patch-nsis.cjs");
  const fsx = require("node:fs"), osx = require("node:os");
  const lab = fsx.mkdtempSync(path.join(osx.tmpdir(), "etiuda-nsis-patch-"));
  const from = patchTool.getPaths(path.join(__dirname, "..")), to = patchTool.getPaths(lab);
  fsx.mkdirSync(path.dirname(to.multiUserUi), { recursive: true });
  fsx.copyFileSync(from.multiUserUi, to.multiUserUi);
  fsx.copyFileSync(from.installSection, to.installSection);
  patchStatus = patchTool.applyNsisPatches(lab);
  const once = fsx.readFileSync(to.multiUserUi, "utf8") + fsx.readFileSync(to.installSection, "utf8");
  patchTool.applyNsisPatches(lab);
  patchTwiceSame = once === fsx.readFileSync(to.multiUserUi, "utf8") + fsx.readFileSync(to.installSection, "utf8");
  fsx.rmSync(lab, { recursive: true, force: true });
} catch (e) { patchStatus = { error: e.message }; }

ok(patchStatus && patchStatus.multiUserUiPatched === true,
  "9a multiUserUi.nsh checks elevated child exit code $2 on $1 = 1 rather than bare Quit");
ok(patchStatus && patchStatus.installSectionPatched === true,
  "9b installSection.nsh runs CHECK_APP_RUNNING without UAC_IsInnerInstance guard");
ok(patchTwiceSame, "9c the patch applied a second time changes nothing");
{
  const nsh = require("node:fs").readFileSync(path.join(__dirname, "..", "shell", "installer.nsh"), "utf8");
  const defs = (nsh.match(/LangString etiudaSetupNotFinished \$\{ID\} "[^"]*\$2[^"]*"/g) || []).length;
  ok(defs === 2, "9d the string the patched page shows for a child that did not finish is defined in both languages, naming the code: " + defs);
  /* The patched leave function is compiled into the uninstaller as well (assistedInstaller.nsh inserts
     PAGE_INSTALL_MODE on that side). A definition under !ifndef BUILD_UNINSTALLER is then missing there. */
  const uninstallerLangCount = (text, name) => {
    const stack = [], re = new RegExp("^LangString\\s+" + name + "\\b");
    let visible = 0;
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (/^!ifndef\s+BUILD_UNINSTALLER\b/.test(t)) { stack.push(true); continue; }
      if (/^!if(?:def|ndef|macrodef)?\b/.test(t)) { stack.push(false); continue; }
      if (/^!endif\b/.test(t)) { stack.pop(); continue; }
      if (stack.indexOf(true) > -1) continue;
      if (re.test(t)) visible++;
    }
    return visible;
  };
  ok(uninstallerLangCount(nsh, "etiudaSetupNotFinished") === 2,
    "9e the did-not-finish string is defined for the uninstaller compile too, not only the installer's: "
    + uninstallerLangCount(nsh, "etiudaSetupNotFinished"));
  ok(uninstallerLangCount(nsh.replace(/LangString etiudaSetupNotFinished/g, "!ifndef BUILD_UNINSTALLER\nLangString etiudaSetupNotFinished"), "etiudaSetupNotFinished") === 0,
    "9e control: the same string put back under !ifndef BUILD_UNINSTALLER reads none");
}
ok(recogInfo && recogInfo.bringsInnerToFront === true,
  "9c elevated inner copy is brought to front with BringToFront in skipLicenseIfInner");

/* ---- 10. where the install is registered, and where its shortcuts go, in both modes ----------- */
/* NSIS itself is held only by reading: these rows read app-builder-lib's templates as installed and shell/installer.nsh,
   and no leg compiles or runs either. Each row has a planted control beside it that must read red. */
{
  const T = P.nsisTemplates(path.join(__dirname, ".."));
  const NSH = fs.readFileSync(path.join(__dirname, "..", "shell", "installer.nsh"), "utf8");
  const S = P.readInstallScopes(T, NSH);
  const mut = (k, from, to) => { const c = Object.assign({}, T); c[k] = String(c[k]).replace(from, to); return c; };
  const nshMut = (from, to) => NSH.replace(from, to);

  ok(Object.values(T).every(s => s.length > 0), "10a the six templates are read from app-builder-lib as installed: "
    + Object.entries(T).map(([k, v]) => k + " " + v.length).join(", "));
  ok(S.writes && S.modes, "10b the uninstall key (DisplayName, UninstallString, DisplayVersion) is written to SHELL_CONTEXT, which"
    + " a per-user install sets to the current user (HKCU) and an all-users install to all (HKLM)");
  ok(!P.readInstallScopes(mut("include/installer.nsh", /(WriteRegStr\s+)SHELL_CONTEXT(\s+"\$\{UNINSTALL_REGISTRY_KEY\}"\s+"DisplayVersion")/, "$1HKLM$2"), NSH).writes,
    "10b control: DisplayVersion written to HKLM whatever the mode reads red");
  ok(S.order, "10c the key is written after the running app is closed and the files are copied, and before the shortcuts,"
    + " so a run that left shortcuts wrote it");
  ok(!P.readInstallScopes(mut("installSection.nsh", /(!insertmacro registryAddInstallInfo)\r?\n(!insertmacro addStartMenuLink[^\n]*)/, "$2\n$1"), NSH).order,
    "10c control: the shortcuts before the key reads red");
  ok(S.view && S.readsBoth, "10d the recognition reads DisplayVersion under the same key in HKLM and HKCU, after .onInit has set"
    + " the 64-bit view the write uses and after initMultiUser");
  ok(!P.readInstallScopes(T, nshMut(/ReadRegStr \$1 HKCU "\$\{UNINSTALL_REGISTRY_KEY\}" "DisplayVersion"/, "ReadRegStr $1 HKCU \"Software\\Etiuda\" \"DisplayVersion\"")).readsBoth,
    "10d control: the per-user read pointed at another key reads red");
  ok(S.unDeletes, "10e the uninstaller deletes the key from SHELL_CONTEXT, the scope its own mode sets");
  ok(S.unpaired.length === 0, "10f every block of shell/installer.nsh that changes the shell context changes it back: "
    + (S.unpaired.join(", ") || "none unpaired"));
  ok(P.readInstallScopes(T, nshMut(/(\r?\n)(\s*)Delete "\$LOCALAPPDATA\\\$\{APP_INSTALLER_STORE_FILE\}"[\s\S]*?SetShellVarContext all/, "$1$2Delete x")).unpaired.indexOf("customInstall") > -1,
    "10f control: customInstall left in the current user's context reads red");

  ok(S.linksFromContext && S.bothAfterMode, "10g install and uninstall both build the Start menu and desktop shortcuts from"
    + " $SMPROGRAMS and $DESKTOP after the mode has set the context, so each removes what the other wrote in its own scope");
  ok(S.staleBoth && S.staleCalled, "10h the uninstaller also removes a shortcut of the same name in the other scope when no"
    + " installation is registered there (InstallLocation empty), puts the context back, and leaves it under --keep-shortcuts");
  ok(!P.readInstallScopes(T, nshMut(/(ReadRegStr \$0 HKCU "\$\{INSTALL_REGISTRY_KEY\}" InstallLocation\s*\r?\n\s*)\$\{If\} \$0 == ""/, "$1${If} 1 == 1")).staleBoth,
    "10h control: the user's shortcut removed even while a per-user copy is registered reads red");
  ok(!P.readInstallScopes(T, nshMut(/(Delete "\$DESKTOP\\\$\{SHORTCUT_NAME\}\.lnk"\s*\r?\n\s*)SetShellVarContext all/, "$1")).staleBoth,
    "10h control: the context left in the current user's after the removal reads red");
  ok(!P.readInstallScopes(T, nshMut(/\s*Call un\.RemoveStaleLinks/, "")).staleCalled,
    "10h control: the removal never called from the uninstall reads red");
}

/* ---- 11. every message box answers a silent run --------------------------------------------- */
/* NSIS shows a MessageBox that has no /SD even under /S, so one such box hangs a silent push nobody watches. This scan is
   its own, not the patch tool's: the whole template folder as the tool leaves it (on a copy) and every .nsh under shell/.
   A box this leg should pass unanswered goes in EXEMPT as "file:line why"; none does. */
{
  const osx = require("node:os");
  const EXEMPT = [];
  const ANSWER = /\/SD\s+ID(?:OK|CANCEL|ABORT|RETRY|IGNORE|YES|NO)\b/i;
  const boxes = (text, name) => {
    const out = { total: 0, open: [] };
    const lines = String(text).split(/\r?\n/);
    let inBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const at = i + 1;
      let line = lines[i];
      while (/\\\s*$/.test(line) && i + 1 < lines.length) line = line.replace(/\\\s*$/, " ") + lines[++i];
      let t = line.trim();
      if (inBlock) { const e = t.indexOf("*/"); if (e < 0) continue; inBlock = false; t = t.slice(e + 2).trim(); }
      if (t.startsWith("/*")) { const e = t.indexOf("*/", 2); if (e < 0) { inBlock = true; continue; } t = t.slice(e + 2).trim(); }
      if (/^[;#]/.test(t) || !/\bmessagebox\b/i.test(t)) continue;
      out.total++;
      if (!ANSWER.test(t) && !EXEMPT.some(x => x.split(" ")[0] === name + ":" + at)) out.open.push(name + ":" + at);
    }
    return out;
  };
  const walk = (dir, base) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory()
    ? walk(path.join(dir, d.name), base) : /\.(nsh|nsi)$/i.test(d.name) ? [path.relative(base, path.join(dir, d.name)).replace(/\\/g, "/")] : []);
  const sweep = (dir, files) => files.reduce((acc, f) => {
    const r = boxes(fs.readFileSync(path.join(dir, f), "utf8"), f);
    acc.total += r.total; acc.open.push(...r.open); return acc;
  }, { total: 0, open: [] });

  const patchTool = require("../tools/patch-nsis.cjs");
  const ROOT = path.join(__dirname, "..");
  const from = path.dirname(patchTool.getPaths(ROOT).multiUserUi);
  const lab = fs.mkdtempSync(path.join(osx.tmpdir(), "etiuda-nsis-silent-"));
  const to = path.dirname(patchTool.getPaths(lab).multiUserUi);
  let status = {}, files = [], after = { total: 0, open: ["not read"] }, twice = false, text = {};
  try {
    fs.cpSync(from, to, { recursive: true });
    status = patchTool.applyNsisPatches(lab);
    files = walk(to, to);
    for (const f of files) text[f] = fs.readFileSync(path.join(to, f), "utf8");
    after = sweep(to, files);
    patchTool.applyNsisPatches(lab);
    twice = files.every(f => fs.readFileSync(path.join(to, f), "utf8") === text[f]);
  } catch (e) { status = { error: e.message }; }

  ok(files.length >= 10 && after.total >= 10 && after.open.length === 0,
    "11a every MessageBox in the patched templates carries a silent default: " + files.length + " files, " + after.total
    + " boxes, unanswered " + (after.open.join(", ") || "none"));
  const own = walk(path.join(ROOT, "shell"), ROOT);
  const mine = sweep(ROOT, own);
  ok(own.includes("shell/installer.nsh") && mine.total >= 2 && mine.open.length === 0,
    "11b and every box in the .nsh files this tree includes: " + own.join(", ") + ", " + mine.total + " boxes, unanswered "
    + (mine.open.join(", ") || "none"));
  const nsi = text["installer.nsi"] || "";
  const plant = nsi.replace(/("Unable to elevate, error \$0")\s*\/SD IDOK/, "$1");
  ok(plant !== nsi && boxes(plant, "installer.nsi").open.length === 1,
    "11c control: the silent elevation box with its default taken out reads red");
  const answers = [["installer.nsi", /"Unable to elevate, error \$0" \/SD IDOK\b/],
    ["include/installUtil.nsh", /"\$\(uninstallFailed\): \$R0" \/SD IDOK\b/],
    ["include/webPackage.nsh", /"Unable to download application package[^"]*" \/SD IDCANCEL IDRETRY download/],
    ["uninstaller.nsh", /"\$\(areYouSureToUninstall\)" \/SD IDOK IDOK \+2/]];
  const wrong = answers.filter(([f, re]) => !re.test(text[f] || "")).map(([f]) => f);
  ok(wrong.length === 0, "11d each box answers with the choice that ends the run without losing data (OK where OK is the only"
    + " button or goes on as the silent run already does, Cancel on the download retry, which retried would loop): "
    + (wrong.join(", ") || "all as chosen"));
  ok(status.silentDefaultsPatched === true && status.applied === true && twice,
    "11e the patch tool reads its own boxes back answered, and applied a second time changes nothing: " + JSON.stringify(status));
  let refused = null;
  try {
    fs.appendFileSync(path.join(to, "common.nsh"), "\n  MessageBox MB_OK \"a box no silent run answers\"\n");
    refused = patchTool.verifyNsisPatches(lab);
  } catch (e) { refused = { error: e.message }; }
  ok(refused && refused.applied === false && (refused.unanswered || []).some(u => /^common\.nsh:/.test(u)),
    "11f control: a new unanswered box in a template makes the patch tool refuse the build: "
    + JSON.stringify(refused && refused.unanswered));
  fs.rmSync(lab, { recursive: true, force: true });
}

/* ---- 12. the exit codes a deployment tool reads, each held to its path and to the list IT reads --------------- */
/* The list is README.md's table. Every SetErrorLevel the patched templates and this tree's includes can set is in it or
   named in INNER; portable.nsi is the portable target's, which this tree does not build. Each path is planted on a copy. */
{
  const osx = require("node:os");
  const ROOT = path.join(__dirname, ".."), DOC = "README.md";
  const APP_OPEN = { file: "shell/installer.nsh", text: () => fs.readFileSync(path.join(ROOT, "shell", "installer.nsh"), "utf8") };
  const INNER = { "0x666666": "the elevated copy telling its outer copy it was not an administrator, which the outer copy answers with 740" };
  const listed = {};
  const docText = fs.existsSync(path.join(ROOT, DOC)) ? fs.readFileSync(path.join(ROOT, DOC), "utf8") : "";
  for (const m of docText.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+)\|/gm)) listed[m[1]] = m[2].trim();

  const patchTool = require(path.join(ROOT, "tools", "patch-nsis.cjs"));
  const lab = fs.mkdtempSync(path.join(osx.tmpdir(), "etiuda-nsis-codes-"));
  const to = path.dirname(patchTool.getPaths(lab).multiUserUi);
  const T = {};
  try {
    fs.cpSync(path.dirname(patchTool.getPaths(ROOT).multiUserUi), to, { recursive: true });
    patchTool.applyNsisPatches(lab);
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => e.isDirectory() ? walk(path.join(d, e.name))
      : /\.(nsh|nsi)$/i.test(e.name) && (T[path.relative(to, path.join(d, e.name)).replace(/\\/g, "/")] = fs.readFileSync(path.join(d, e.name), "utf8")));
    walk(to);
  } catch (e) { console.log("  (the template copy failed: " + e.message + ")"); }
  fs.rmSync(lab, { recursive: true, force: true });

  /* After the elevation call, before its Quit: 740 for a failed or declined elevation, a runas by a non-administrator, and an
     elevated copy that was not an administrator, and no other code set there. */
  const elevation = text => {
    const i = String(text).indexOf("!insertmacro UAC_RunElevated"), q = i < 0 ? -1 : text.indexOf("Quit", i);
    if (q < 0) return false;
    const s = text.slice(i, q);
    return /\$\{If\} \$0 <> 0\s+SetErrorLevel 740/.test(s) && /\$\{ElseIf\} \$1 = 3\s+SetErrorLevel 740/.test(s)
      && /\$\{ElseIf\} \$1 = 1\s+\$\{AndIf\} \$2 = 0x666666\s+SetErrorLevel 740/.test(s) && (s.match(/SetErrorLevel/g) || []).length === 3;
  };
  ok(elevation(T["installer.nsi"]) && elevation(T["multiUser.nsh"]),
    "12c an all-users run that cannot get administrator rights ends with 740, in the silent installer and the uninstaller");
  ok(!elevation(String(T["installer.nsi"]).replace(/SetErrorLevel 740/, "SetErrorLevel 2")),
    "12c control: one of the three elevation paths left at 2 reads red");
  const second = text => /\n\s*notfound:\r?\n\s*SetErrorLevel 1618\r?\n\s*Abort\b/.test(String(text));
  const one = T["include/allowOnlyOneInstallerInstance.nsh"];
  ok(second(one), "12d a second copy of the installer, started while one runs, ends with 1618");
  ok(!second(String(one).replace(/\n\s*SetErrorLevel 1618/, "")), "12d control: the code taken out reads red");
  const appOpen = text => {
    const m = (/!macro customCheckAppRunning\r?\n([\s\S]*?)!macroend/.exec(String(text)) || [])[1] || "";
    return /SetErrorLevel 1618\r?\n\s*Quit\b/.test(m) && (m.match(/SetErrorLevel/g) || []).length === 1;
  };
  const open = APP_OPEN.text();
  ok(appOpen(open), "12e the app still open after the wait ends a silent run with 1618 (" + APP_OPEN.file + ", customCheckAppRunning)");
  ok(!appOpen(open.replace("SetErrorLevel 1618", "SetErrorLevel 2")), "12e control: the old 2 put back reads red");

  const codes = files => {
    const sets = {};
    for (const [name, text] of files) String(text).split(/\r?\n/).forEach((l, i) => {
      const m = /^\s*SetErrorLevel\s+(\S+)/.exec(l);
      if (m) (sets[m[1]] = sets[m[1]] || []).push(name + ":" + (i + 1));
    });
    return { sets, stray: Object.keys(sets).filter(v => !(v in listed) && !(v in INNER)) };
  };
  const own = fs.readdirSync(path.join(ROOT, "shell", "installer")).filter(f => /\.nsh$/i.test(f))
    .map(f => ["shell/installer/" + f, fs.readFileSync(path.join(ROOT, "shell", "installer", f), "utf8")]);
  const files = Object.keys(T).filter(f => f !== "portable.nsi").map(f => [f, T[f]]).concat([[APP_OPEN.file, open]], own);
  const C = codes(files);
  ok(Object.keys(T).length >= 10 && C.stray.length === 0 && ["740", "1618", "2"].every(v => v in C.sets),
    "12f every code a silent run can end with is on the list or named here, and each listed failure code has its path: "
    + Object.keys(C.sets).map(v => v + " at " + C.sets[v].join(" ")).join("; ") + (C.stray.length ? "; not listed: " + C.stray.join(", ") : ""));
  ok(codes(files.concat([["planted", "  SetErrorLevel 3"]])).stray.join() === "3", "12f control: a code set nowhere on the list reads red");
}

/* ---- 13. the machine-wide install a deployment tool runs, stage by stage ------------------------------------- */
/* Read only, on a copy of the templates as the patch tool leaves them and on shell/installer.nsh: no leg here compiles or
   runs NSIS, and no all-users install has run on any machine. Each row has a planted control beside it that must read red. */
{
  const osx = require("node:os");
  const ROOT = path.join(__dirname, "..");
  const patchTool = require(path.join(ROOT, "tools", "patch-nsis.cjs"));
  const lab = fs.mkdtempSync(path.join(osx.tmpdir(), "etiuda-nsis-machine-"));
  const to = path.dirname(patchTool.getPaths(lab).multiUserUi);
  const T = {};
  let status = {};
  try {
    fs.cpSync(path.dirname(patchTool.getPaths(ROOT).multiUserUi), to, { recursive: true });
    status = patchTool.applyNsisPatches(lab);
    for (const f of ["assistedInstaller.nsh", "include/extractAppPackage.nsh", "include/FileAssociation.nsh"]) T[f] = fs.readFileSync(path.join(to, f), "utf8");
  } catch (e) { status = { error: e.message }; }
  fs.rmSync(lab, { recursive: true, force: true });
  const NSH = fs.readFileSync(path.join(ROOT, "shell", "installer.nsh"), "utf8");
  const macro = (text, name) => (new RegExp("!macro " + name + "(?: [^\\r\\n]*)?\\r?\\n([\\s\\S]*?)!macroend").exec(String(text)) || [])[1] || "";

  /* Stage 1. initMultiUser reads the two switches, then chooses the mode; the block sits between, in the installer only. */
  const unattended = text => {
    const m = macro(text, "initMultiUser");
    const cur = m.indexOf('${GetOptions} $R0 "/currentuser" $R1'), choice = m.indexOf('${if} $hasPerUserInstallation == "1"');
    const at = m.indexOf("!ifndef BUILD_UNINSTALLER", cur);
    if (cur < 0 || choice < 0 || at < 0 || at > choice) return false;
    const b = m.slice(at, choice);
    return /^!ifndef BUILD_UNINSTALLER\s+\$\{If\} \$\{Silent\}\s+\$\{AndIf\} \$\{UAC_IsAdmin\}\s/.test(b)
      && /\$\{GetOptions\} \$R0 "\/allusers" \$R1\s+\$\{If\} \$\{Errors\}\s+\$\{GetOptions\} \$R0 "\/currentuser" \$R1\s+\$\{If\} \$\{Errors\}\s+Push \$R2\s+Push \$R3\s+Push \$R4\s+StrCpy \$R4 "0"/.test(b)
      && /whoami\.exe" \/user \/FO CSV \/NH \| "\$SYSDIR\\findstr\.exe" \/C:"\\"S-1-5-18\\""`\s+Pop \$R2\s+\$\{If\} \$R2 == "0"\s+StrCpy \$R4 "1"/.test(b)
      && /GetCurrentProcessId\(\) i \.R2'\s+System::Call 'kernel32::ProcessIdToSessionId\(i R2, \*i \.R3\) i \.R2'\s+\$\{If\} \$R2 <> 0\s+\$\{AndIf\} \$R3 == "0"\s+StrCpy \$R4 "1"/.test(b)
      && /\$\{If\} \$R4 == "1"\s+StrCpy \$hasPerMachineInstallation "1"\s+StrCpy \$hasPerUserInstallation "0"\s+\$\{EndIf\}\s+Pop \$R4\s+Pop \$R3\s+Pop \$R2\s/.test(b)
      && (b.match(/\$hasPer\w+Installation/g) || []).length === 2 && /!endif\s*$/.test(b);
  };
  const A = T["assistedInstaller.nsh"] || "";
  ok(unattended(A) && status.machineWidePatched === true && status.applied === true,
    "13a a silent run with neither switch, by the system account or by an elevated administrator in session 0, where no person"
    + " is signed in, chooses all users before the mode is set; every other run keeps today's choice: " + JSON.stringify({ machineWidePatched: status.machineWidePatched, applied: status.applied }));
  ok(!unattended(A.replace("${AndIf} ${UAC_IsAdmin}", "")), "13a control: the administrator test taken out reads red");
  ok(!unattended(A.replace(/(\$\{If\} \$\{Errors\}\s+)\$\{GetOptions\} \$R0 "\/currentuser" \$R1\s+\$\{If\} \$\{Errors\}(\s+Push \$R2)/, "$1${If} 1 == 1$2")),
    "13a control: /currentuser no longer read inside the block, so it would lose to the block, reads red");
  ok(!unattended(A.replace('${AndIf} $R3 == "0"', '${AndIf} $R3 == "1"')), "13a control: session 1, a person's own, taken for the unattended one reads red");
  ok(!unattended(A.replace(/(\r?\n)(\s*)!ifndef BUILD_UNINSTALLER(\s+\$\{If\} \$\{Silent\})/, '$1$2${if} $hasPerUserInstallation == "1"$1$2!ifndef BUILD_UNINSTALLER$3')),
    "13a control: the block after the mode is chosen reads red");

  /* Stage 2, the locked extract: five automatic tries, then the box, whose silent answer is now Cancel, and Cancel ends 1618. */
  const lockedExtract = text => /"\$\(appCannotBeClosed\)" \/SD IDCANCEL IDCANCEL AbortExtract7za/.test(String(text))
    && /\n\s*AbortExtract7za:\r?\n\s*SetErrorLevel 1618\r?\n\s*Quit\b/.test(String(text));
  const X = T["include/extractAppPackage.nsh"] || "";
  ok(lockedExtract(X), "13b a file still locked after about a minute of tries ends a silent run with 1618 before the in-place overwrite that ignores errors");
  ok(!lockedExtract(X.replace("/SD IDCANCEL IDCANCEL", "/SD IDRETRY IDCANCEL")), "13b control: the silent Retry put back, which overwrites in place and ends 0, reads red");
  ok(!lockedExtract(X.replace(/(AbortExtract7za:\r?\n)\s*SetErrorLevel 1618\r?\n/, "$1")), "13b control: Cancel quitting with no code reads red");
  /* The retry window before that 1618 (Claude alpha's ruling (2), 2026-11-11 18:49; the number the test architect's and the lead
     engineer's): 30 tries 2 s apart, about a minute, so an antivirus scan of a freshly written file can let go first. */
  const retryWindow = text => /\n\s*\$\{if\} \$R1 < 30\r?\n/.test(String(text)) && /\n\s*RetryExtract7za:\r?\n\s*Sleep 2000\r?\n/.test(String(text));
  ok(retryWindow(X), "13b a locked file is tried 30 times 2 s apart, about a minute, before the 1618");
  ok(!retryWindow(X.replace("${if} $R1 < 30", "${if} $R1 < 5")), "13b control: the template's five tries put back reads red");
  ok(!retryWindow(X.replace(/(RetryExtract7za:\r?\n\s*)Sleep 2000/, "$1Sleep 1000")), "13b control: the template's one-second wait put back reads red");

  /* Stage 2, the close check: every session's copy in an all-users install, one account's in a per-user one; the close
     request only ever to the installing account's own. */
  const closeCheck = text => {
    const m = macro(text, "customCheckAppRunning");
    const look = m.match(/nsExec::Exec `"\$SYSDIR\\cmd\.exe" \/C "\$SYSDIR\\tasklist\.exe" [^`]*`/g) || [];
    const scope = /StrCpy \$R5 `\/FI "USERNAME eq %USERNAME%" `\s+\$\{If\} \$installMode == "all"\s+StrCpy \$R5 ""\s+\$\{EndIf\}/.test(m);
    const sees = look.length === 2 && look[0].indexOf('"$SYSDIR\\tasklist.exe" $R5/FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}"') > -1
      && look[1].indexOf('"$SYSDIR\\tasklist.exe" /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}"') > -1;
    const ownAt = look[1] ? m.indexOf(look[1]) : -1, close = m.indexOf("--update-close"), kill = m.indexOf('"$SYSDIR\\taskkill.exe"');
    const onlyOwn = ownAt > -1 && close > ownAt && kill > close
      && /Pop \$R8\s+\$\{If\} \$R8 == 0\s+\$\{If\} \$\{FileExists\}/.test(m.slice(ownAt))
      && /"\$SYSDIR\\taskkill\.exe" \/IM "\$\{APP_EXECUTABLE_FILENAME\}" \/FI "USERNAME eq %USERNAME%"/.test(m) && (m.match(/taskkill/g) || []).length === 1;
    const skips = /\$\{Else\}\s+StrCpy \$R7 20\s+\$\{EndIf\}/.test(m.slice(kill));
    const regs = /^\s*Push \$R5\r?\n/.test(m) && /Pop \$R5\s*$/.test(m);
    return scope && sees && onlyOwn && skips && regs;
  };
  ok(closeCheck(NSH), "13c the close check sees a copy open in any session of an all-users install and ends another person's"
    + " never: the close request goes to this account's copy alone, and with none of its own open a silent run ends 1618 at once");
  ok(!closeCheck(NSH.replace(/(\$\{If\} \$installMode == "all"\s+)StrCpy \$R5 ""/, "$1StrCpy $R5 $R5")), "13c control: the all-users install still looking in one account reads red");
  ok(!closeCheck(NSH.replace('"$SYSDIR\\taskkill.exe" /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"', '"$SYSDIR\\taskkill.exe" /IM "${APP_EXECUTABLE_FILENAME}"')),
    "13c control: the close request sent to every account's copy reads red");
  ok(!closeCheck(NSH.replace(/\$\{Else\}(\s+)StrCpy \$R7 20(\s+\$\{EndIf\})/, "${Else}$1Nop$2")), "13c control: waiting on another person's copy reads red");

  /* Stage 3. The link follows the mode as the .ec type does: SHELL_CONTEXT is HKLM for all users and HKCU for one. */
  const OPEN = '`"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "%1"`';
  const linkScope = text => {
    const ins = macro(text, "customInstall"), un = macro(text, "customUnInstall");
    const w = ins.split(/\r?\n/).map(l => l.trim()).filter(l => /^WriteReg\w+ \w+ "Software\\Classes\\etiuda/.test(l));
    const del = hive => {
      const r = un.indexOf('ReadRegStr $0 ' + hive + ' "Software\\Classes\\etiuda\\shell\\open\\command" ""');
      const c = un.indexOf("${If} $0 == " + OPEN, r), d = un.indexOf('DeleteRegKey ' + hive + ' "Software\\Classes\\etiuda"', c);
      return r > -1 && c > r && d > c && un.indexOf("${EndIf}", c) > d;
    };
    const code = (ins + "\n" + un).split(/\r?\n/).filter(l => !/^\s*[#;]/.test(l)).join("\n");
    return w.length === 3 && w.every(l => l.startsWith("WriteRegStr SHELL_CONTEXT ")) && del("SHELL_CONTEXT") && del("HKCU") && !/HKLM/.test(code);
  };
  ok(linkScope(NSH), "13d the etiuda: link is written where the mode writes (HKLM for all users, HKCU for one), and the uninstall takes it"
    + " from there and from the uninstalling account's HKCU, each only while it still opens this desk");
  ok(!linkScope(NSH.replace('WriteRegStr SHELL_CONTEXT "Software\\Classes\\etiuda" "URL Protocol"', 'WriteRegStr HKCU "Software\\Classes\\etiuda" "URL Protocol"')),
    "13d control: one of the three values left in HKCU reads red");
  ok(!linkScope(NSH.replace('DeleteRegKey SHELL_CONTEXT "Software\\Classes\\etiuda"', "Nop")), "13d control: the all-users uninstall leaving the machine's link reads red");
  const assoc = text => ["APP_ASSOCIATE", "APP_UNASSOCIATE"].every(n => {
    const regs = macro(text, n).split(/\r?\n/).map(l => l.trim()).filter(l => /^(Write|Delete)Reg/.test(l));
    return regs.length >= 2 && regs.every(l => /^\w+ SHELL_CONTEXT /.test(l));
  }) && (NSH.match(/WriteRegStr SHELL_CONTEXT "Software\\Classes\\Etiuda catalog[^"]*"/g) || []).length === 2;
  const F = T["include/FileAssociation.nsh"] || "";
  ok(assoc(F), "13e the .ec type and its Polish name are written and removed in SHELL_CONTEXT too, so it follows the mode as the link does");
  ok(!assoc(F.replace(/(!macro APP_UNASSOCIATE[\s\S]*?DeleteRegKey )SHELL_CONTEXT/, "$1HKCU")), "13e control: the type removed from HKCU in an all-users uninstall reads red");

  /* Stages 0, 4 and 5: what IT reads, against what the installer does. */
  const doc = (/## Installing silently\r?\n([\s\S]*?)(?=\r?\n## )/.exec(fs.readFileSync(path.join(ROOT, "README.md"), "utf8")) || [])[1] || "";
  const key = id => "HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + P.appGuid(id);
  const told = d => d.includes(key("app.etiuda.desktop")) && d.includes("/S /allusers") && d.includes("/S /currentuser")
    && /no installer log/i.test(d) && /DisplayVersion/.test(d) && /session/.test(d);
  ok(told(doc), "13f README's Installing silently gives IT both commands, the detection key the installer writes ("
    + P.appGuid("app.etiuda.desktop") + "), DisplayVersion, the sessions the close check sees, and that there is no installer log");
  ok(!told(doc.split(P.appGuid("app.etiuda.desktop")).join(P.appGuid("app.etiuda.studio"))), "13f control: Studio's key in the desk's notes reads red");

  /* Stage 2. System tools named by their system path, so cmd looks in System32 first. */
  const systemPaths = text => {
    const lines = text.split(/\r?\n/).filter(l => !/^\s*[#;]/.test(l));
    const calls = lines.filter(l => /\btasklist\b|\btaskkill\b/.test(l));
    return calls.length >= 3 && calls.every(l =>
      (!/\btasklist\b/.test(l) || l.includes('"$SYSDIR\\tasklist.exe"')) &&
      (!/\btaskkill\b/.test(l) || l.includes('"$SYSDIR\\taskkill.exe"'))
    );
  };
  ok(systemPaths(NSH), "13g no line runs tasklist or taskkill except as \"$SYSDIR\\tasklist.exe\" and \"$SYSDIR\\taskkill.exe\"");
  ok(!systemPaths(NSH.replace('"$SYSDIR\\tasklist.exe"', 'tasklist')), "13g control: one bare tasklist put back reads red");

  /* Stage 3. Start with Windows Run key: removed on plain uninstall, kept on update. */
  const unRunValue = text => {
    const un = macro(text, "customUnInstall");
    const at = un.indexOf('${IfNot} ${isUpdated}');
    const end = at >= 0 ? un.indexOf('${EndIf}', at) : -1;
    if (at < 0 || end < 0) return false;
    const block = un.slice(at, end);
    /* Both names (the desk's own and Electron's default id earlier builds wrote under), each deleted only while its command
       starts this install's program (the test architect's hold of 23:29). */
    const guarded = (name) => new RegExp('ReadRegStr \\$0 HKCU "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run" "' + name
      + '"\\s+StrCpy \\$0 \\$0 \\$R9\\s+\\$\\{If\\} \\$0 == \\$R8\\s+DeleteRegValue HKCU "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run" "' + name + '"');
    const tail = un.slice(at);
    return /StrCpy \$R8 `"\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}"`/.test(tail)
      && guarded('\\$\\{APP_ID\\}').test(tail) && guarded('electron\\.app\\.\\$\\{PRODUCT_NAME\\}').test(tail);
  };
  ok(unRunValue(NSH), "13h the uninstall hook deletes this account's Start with Windows Run value only when not updating");
  ok(!unRunValue(NSH.split('${IfNot} ${isUpdated}').join('${If} ${isUpdated}')), "13h control: deleting on update reads red");
  ok(!unRunValue(NSH.split("${If} $0 == $R8\n      DeleteRegValue").join("DeleteRegValue")), "13h control: deleting without the program's check reads red");
}

/* ---- 14. nothing a non-administrator can write is run, or removed by a walk that follows a link, elevated -------- */
/* Read only, on a copy of the templates as the patch tool leaves them and on shell/installer.nsh. The question each row
   answers: does anything recursive or executable run elevated inside a folder a non-admin can write? HKCU, the per-user
   folder and the roaming folder are that account's to write; RMDir /r follows a junction, as the build's own makensis was probed to. */
{
  const osx = require("node:os");
  const ROOT = path.join(__dirname, "..");
  const patchTool = require(path.join(ROOT, "tools", "patch-nsis.cjs"));
  const lab = fs.mkdtempSync(path.join(osx.tmpdir(), "etiuda-nsis-owner-"));
  const to = path.dirname(patchTool.getPaths(lab).multiUserUi);
  const T = {};
  let status = {};
  const walkDir = (d, rel = "") => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) return walkDir(path.join(d, e.name), r);
    if (/\.(nsh|nsi)$/i.test(e.name)) T[r] = fs.readFileSync(path.join(d, e.name), "utf8");
  });
  try {
    fs.cpSync(path.dirname(patchTool.getPaths(ROOT).multiUserUi), to, { recursive: true });
    status = patchTool.applyNsisPatches(lab);
    walkDir(to);
  } catch (e) { status = { error: e.message }; }
  fs.rmSync(lab, { recursive: true, force: true });
  const NSH = fs.readFileSync(path.join(ROOT, "shell", "installer.nsh"), "utf8");
  const macro = (text, name) => (new RegExp("!macro " + name + "(?: [^\\r\\n]*)?\\r?\\n([\\s\\S]*?)!macroend").exec(String(text)) || [])[1] || "";
  const code = text => String(text).split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^[#;]/.test(l));
  /* The template files the desk's assisted build compiles: portable.nsi is another target, oneClick.nsh another mode. */
  const built = tpl => Object.keys(tpl).filter(f => !/^(portable\.nsi|oneClick\.nsh)$/.test(f));
  /* Lines inside the !else of a directive the hook file satisfies (the then-branch compiles, the else does not). */
  const deadElse = (text, satisfied) => {
    const dead = new Set(), stack = [];
    String(text).split(/\r?\n/).forEach((raw, i) => {
      const t = raw.trim();
      const m = /^!(ifdef|ifmacrodef|ifndef|ifmacrondef|if)\b\s*(\S*)/.exec(t);
      if (m) { stack.push({ sat: (m[1] === "ifdef" || m[1] === "ifmacrodef") && satisfied(m[1], m[2]), inElse: false }); return; }
      if (/^!else\b/.test(t) && stack.length) { stack[stack.length - 1].inElse = true; return; }
      if (/^!endif\b/.test(t)) { stack.pop(); return; }
      if (stack.some(s => s.sat && s.inElse)) dead.add(i);
    });
    return dead;
  };
  const defines = nsh => new Set((String(nsh).match(/^[ \t]*!define[ \t]+(\w+)/gm) || []).map(l => l.trim().split(/\s+/)[1]));
  const macros = nsh => new Set((String(nsh).match(/^[ \t]*!macro[ \t]+(\w+)/gm) || []).map(l => l.trim().split(/\s+/)[1]));
  const satisfiedBy = nsh => { const d = defines(nsh), m = macros(nsh); return (kind, name) => (kind === "ifdef" ? d.has(name) : m.has(name)); };
  const liveLines = (tpl, nsh) => {
    const out = [];
    for (const f of built(tpl)) {
      const dead = deadElse(tpl[f], satisfiedBy(nsh));
      String(tpl[f]).split(/\r?\n/).forEach((l, i) => { if (!dead.has(i) && l.trim() && !/^\s*[#;]/.test(l)) out.push({ f, i: i + 1, l: l.trim() }); });
    }
    return out;
  };

  /* 14a: every program run is a system tool, this install's own program, run as the person, or the old uninstaller;
     and the uninstaller HKCU names is reached in an elevated instance only through the unelevated one. */
  const EXEC = /\b(ExecWait|ExecShellWait|ExecShell|Exec|nsExec::Exec\w*)\b/;
  /* The lines of the named macros in a template, as 1-based numbers. */
  const macroLines = (text, names) => {
    const out = new Set();
    let open = false;
    String(text || "").split(/\r?\n/).forEach((raw, i) => {
      const t = raw.trim(), m = /^!macro\s+(\S+)/.exec(t);
      if (m) open = names.indexOf(m[1]) > -1;
      if (open) out.add(i + 1);
      if (/^!macroend\b/.test(t)) open = false;
    });
    return out;
  };
  const execStray = (tpl, nsh) => {
    const stray = [];
    /* The template's own close check, inserted only where no customCheckAppRunning is, which the desk's hooks define. */
    const unused = macros(nsh).has("customCheckAppRunning")
      ? macroLines(tpl["include/allowOnlyOneInstallerInstance.nsh"], ["KILL_PROCESS", "FIND_PROCESS", "IS_POWERSHELL_AVAILABLE", "_CHECK_APP_RUNNING"])
      : new Set();
    for (const { f, i, l } of liveLines(tpl, nsh)) {
      if (!EXEC.test(l) || /^!define\b/.test(l) || f === "include/StdUtils.nsh" || f === "include/UAC.nsh") continue;
      if (f === "include/allowOnlyOneInstallerInstance.nsh" && unused.has(i)) continue;
      if (/\$\{StdUtils\.ExecShellAsUser\}/.test(l)) continue;
      if (f === "include/installUtil.nsh" && /^ExecWait '"\$uninstallerFileName(Temp)?" \/S \/KEEP_APP_DATA \$0 _\?=\$installationDir' \$R0$/.test(l)) continue;
      if (/^nsExec::Exec `"\$(SYSDIR\\[\w.]+\.exe|CmdPath|PowerShellPath)"/.test(l)) continue;
      stray.push(f + ":" + i + " " + l.slice(0, 70));
    }
    for (const { f, i, l } of liveLines({ "shell/installer.nsh": nsh }, "")) {
      if (!EXEC.test(l)) continue;
      if (/^nsExec::Exec(\s+\/TIMEOUT=\d+)? `"\$(SYSDIR\\[\w.]+\.exe|INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\})"/.test(l)) continue;
      stray.push(f + ":" + i + " " + l.slice(0, 70));
    }
    return stray;
  };
  const hkcuAsUser = (tpl, nsh) => {
    const sec = code(tpl["installSection.nsh"] || "");
    const call = "!insertmacro uninstallOldVersion HKEY_CURRENT_USER";
    const guarded = sec.every((l, k) => l !== call
      || (sec[k - 1] === "!else" && sec[k - 2] === "!insertmacro etiudaOldUserCopy" && sec[k - 3] === "!ifmacrodef etiudaOldUserCopy"));
    const m = code(macro(nsh, "etiudaOldUserCopy"));
    const inner = m.indexOf("${If} ${UAC_IsInnerInstance}"), outer = m.lastIndexOf("${Else}");
    if (!guarded || !macros(nsh).has("etiudaOldUserCopy") || inner !== 0 || outer < 0) return { ok: false, open: 0 };
    /* The inner branch runs it only inside etiudaAsUser, whose segment the elevated instance jumps over and reaches only
       through UAC_AsUser_Call; the segment is the RUN macro and a Return. */
    const body = m.slice(inner, outer);
    const run = (body.map(l => /^!insertmacro etiudaAsUser (\w+)$/.exec(l)).find(Boolean) || [])[1] || "";
    const asUser = asUserHolds(nsh);
    const ranThere = code(macro(nsh, run)).filter(l => l === call).length === 1;
    /* Started elevated, with no unelevated instance: the file is not run at all, and the finish page says the copy stays
       wherever HKCU names an uninstaller (decision 28's option b). */
    const rest = m.slice(outer);
    const left = !rest.includes(call) && !rest.some(l => /uninstallOldVersion|ExecWait|Exec\b/.test(l))
      && rest.includes("ReadRegStr $R9 HKCU \"${UNINSTALL_REGISTRY_KEY}\" UninstallString")
      && rest.indexOf("StrCpy $etiudaFinishText \"$(etiudaOldCopyLeft)\"") > rest.indexOf("${If} $R9 != \"\"");
    const ok = !!run && asUser && ranThere && !body.includes(call) && left;
    return { ok, left };
  };
  const asUserHolds = nsh => {
    const b = code(macro(nsh, "etiudaAsUser"));
    const go = b.findIndex(l => /^Goto etiudaAsUserCall\$\{ETIUDA_AS_USER_N\}$/.test(l));
    const seg = b.indexOf("etiudaAsUserRun${ETIUDA_AS_USER_N}:"), runAt = b.indexOf("!insertmacro ${RUN}");
    const ret = b.indexOf("Return", seg), call = b.indexOf("etiudaAsUserCall${ETIUDA_AS_USER_N}:");
    const via = b.indexOf("!insertmacro UAC_AsUser_Call Label etiudaAsUserRun${ETIUDA_AS_USER_N} ${UAC_SYNCREGISTERS}");
    return b.indexOf("${If} ${UAC_IsInnerInstance}") > -1 && go > -1 && seg === go + 1 && runAt === seg + 1 && ret === runAt + 1
      && call === ret + 1 && via === call + 1 && !b.some(l => /\b(Goto|Call)\s+:?etiudaAsUserRun/.test(l))
      && /StrCpy \$R9 "unreached"/.test(b.slice(0, go).join("\n"));
  };
  const hk = hkcuAsUser(T, NSH), stray = execStray(T, NSH);
  ok(status.asItsOwnerPatched === true && hk.ok && stray.length === 0,
    "14a in an all-users install the uninstaller HKCU names runs only as its own account, through the unelevated instance"
    + " (UAC_AsUser_Call), and every other program run is a system tool, this install's own program, or run as the person: "
    + JSON.stringify({ asItsOwnerPatched: status.asItsOwnerPatched, asUser: hk.ok, stray }));
  ok(!hkcuAsUser(T, NSH.replace(/(\$\{Else\}\r?\n)(\s*# An installer started elevated)/, "$1    !insertmacro uninstallOldVersion HKEY_CURRENT_USER\n$2")).ok,
    "14a control: an installer started elevated running that uninstaller itself, as main's template did, reads red");
  ok(!hkcuAsUser(T, NSH.replace("StrCpy $etiudaFinishText \"$(etiudaOldCopyLeft)\"", "Nop")).ok,
    "14a control: the copy left registered without a word on the finish page reads red");
  const mainSec = T["installSection.nsh"] ? T["installSection.nsh"].replace(/!ifmacrodef etiudaOldUserCopy\r?\n\s*!insertmacro etiudaOldUserCopy\r?\n\s*!else\r?\n\s*(!insertmacro uninstallOldVersion HKEY_CURRENT_USER\r?\n\s*!insertmacro handleUninstallResult HKEY_CURRENT_USER)\r?\n\s*!endif/, "$1") : "";
  ok(!hkcuAsUser(Object.assign({}, T, { "installSection.nsh": mainSec }), NSH).ok,
    "14a control: the template's elevated run, as main's patch tool leaves it, reads red");
  ok(!hkcuAsUser(T, NSH.replace(/\n\s*Goto etiudaAsUserCall\$\{ETIUDA_AS_USER_N\}\r?\n/, "\n")).ok,
    "14a control: the elevated instance falling into the segment instead of jumping over it reads red");
  ok(!hkcuAsUser(T, NSH.replace("!insertmacro UAC_AsUser_Call Label etiudaAsUserRun${ETIUDA_AS_USER_N} ${UAC_SYNCREGISTERS}", "Call :etiudaAsUserRun${ETIUDA_AS_USER_N}")).ok,
    "14a control: the segment called in the elevated instance rather than through UAC_AsUser_Call reads red");
  ok(!hkcuAsUser(T, NSH.replace(/(\n\s*)!insertmacro etiudaAsUser etiudaOldUserCopyRun/, "$1!insertmacro etiudaOldUserCopyRun")).ok,
    "14a control: the run macro inserted straight into the elevated instance reads red");
  ok(execStray(T, NSH.replace("!macro customInstall\n", "!macro customInstall\n  ExecWait '\"$R0\"'\n")).length === 1,
    "14a control: a program named by a register, run from a hook, reads red");
  ok(execStray(Object.assign({}, T, { "installSection.nsh": T["installSection.nsh"] + "\nExec '\"$INSTDIR\\x.exe\"'\n" }), NSH).length === 1,
    "14a control: a program run from a template line the inventory does not know reads red");

  /* 14b: RMDir /r, which follows a junction, is used only over the installer's own $PLUGINSDIR. */
  const rmdirStray = (tpl, nsh) => liveLines(tpl, nsh).concat(liveLines({ "shell/installer.nsh": nsh }, ""))
    .filter(({ l }) => /^RMDir\s+\/r\b/i.test(l) && !/^RMDir\s+\/r\s+"?\$PLUGINSDIR\\/i.test(l)).map(({ f, i, l }) => f + ":" + i + " " + l);
  const rs = rmdirStray(T, NSH);
  ok(rs.length === 0 && status.asItsOwnerPatched === true,
    "14b no RMDir /r runs over anything but the installer's own $PLUGINSDIR: the install folder, the roaming folder and the"
    + " template's --delete-app-data removal go through the walk: " + JSON.stringify(rs));
  ok(rmdirStray(T, NSH.replace(/Push \$INSTDIR\r?\n\s*Call un\.etiudaRemoveTree/, "RMDir /r $INSTDIR")).length === 1,
    "14b control: main's RMDir /r $INSTDIR put back reads red");
  ok(rmdirStray(T, NSH.replace(/!define ETIUDA_REMOVE_TREE\b/, "!define ETIUDA_REMOVE_TREE_GONE")).length === 3,
    "14b control: the walk's define gone, the template's three RMDir /r of $APPDATA compile again and read red");
  ok(rmdirStray(T, NSH.replace(/Push "\$APPDATA\\\$\{APP_FILENAME\}"\r?\n\s*Call un\.etiudaRemoveTree/, "RMDir /r \"$APPDATA\\${APP_FILENAME}\"")).length === 1,
    "14b control: main's RMDir /r of the roaming folder put back in the data step reads red");

  /* 14c: the walk reads each entry's attributes before entering it, removes a link as itself, and is what removes. */
  const walkHolds = nsh => {
    const fn = (/Function \$\{ETIUDA_REMOVE_TREE\}\r?\n([\s\S]*?)FunctionEnd/.exec(nsh) || [])[1] || "";
    const b = code(fn);
    const attr = b.indexOf("System::Call 'kernel32::GetFileAttributesW(w R0) i .R1'");
    const link = b.indexOf("IntOp $R2 $R1 & 0x400"), dir = b.indexOf("IntOp $R2 $R1 & 0x10"), find = b.findIndex(l => /^FindFirst\b/.test(l));
    const linkArm = link > -1 ? b.slice(link, b.indexOf("${EndIf}", link)) : [];
    const root = b.indexOf("StrLen $R1 $R0") > -1 && b.indexOf("StrLen $R1 $R0") < attr && b.includes("${If} $R1 < 4");
    const recurse = b.filter(l => /^Call\b/.test(l));
    const callers = [macro(nsh, "customRemoveFiles"), macro(nsh, "customUnInstall")].join("\n");
    return attr === b.indexOf("${If} $R1 = -1") - 1 && attr > -1 && link > attr && dir > link && find > dir && root
      && linkArm.includes("RMDir $R0") && linkArm.includes("Delete $R0") && linkArm.includes("Goto etiudaTreeDone") && !linkArm.some(l => /\/r\b|FindFirst/.test(l))
      && recurse.length === 1 && recurse[0] === "Call ${ETIUDA_REMOVE_TREE}" && b.slice(find).includes("RMDir $R0")
      && /Push \$INSTDIR\r?\n\s*Call un\.etiudaRemoveTree/.test(callers)
      && (callers.match(/Push "\$APPDATA\\\$\{APP_\w+\}"\r?\n\s*Call un\.etiudaRemoveTree/g) || []).length === 3
      && /!define ETIUDA_REMOVE_TREE "un\.etiudaRemoveTree"/.test(nsh);
  };
  ok(walkHolds(NSH), "14c the walk refuses a drive root, reads an entry's attributes before anything else, removes a junction or"
    + " link as itself and leaves, enters only a real folder, and is what the uninstall and Remove my data call");
  ok(!walkHolds(NSH.replace(/IntOp \$R2 \$R1 & 0x400\r?\n\s*\$\{If\} \$R2 <> 0\r?\n\s*RMDir \$R0\r?\n\s*Delete \$R0\r?\n\s*Goto etiudaTreeDone\r?\n\s*\$\{EndIf\}\r?\n/, "")),
    "14c control: the link test taken out reads red");
  ok(!walkHolds(NSH.replace(/(\n\s*)(FindFirst \$R1 \$R2 "\$R0\\\*\.\*")/, "$1FindClose $R1$1$2").replace(/(System::Call 'kernel32::GetFileAttributesW\(w R0\) i \.R1')/, "FindFirst $R1 $R2 \"$R0\\*.*\"\n    $1")),
    "14c control: the folder entered before its attributes are read reads red");
  ok(!walkHolds(NSH.replace(/(IntOp \$R2 \$R1 & 0x400\r?\n\s*\$\{If\} \$R2 <> 0\r?\n\s*)RMDir \$R0/, "$1RMDir /r $R0")),
    "14c control: a link removed with RMDir /r reads red");

  /* 14d: the finish page carries the case's sentence. Modern UI's own text is the default, so every other install shows
     the page as before; the case's text is a language string in English and Polish, both in the installer pass only. */
  const finishSays = nsh => {
    const lines = String(nsh).split(/\r?\n/);
    const at = lines.findIndex(l => l.trim() === "!define MUI_FINISHPAGE_TEXT \"$etiudaFinishText\"");
    const head = at > -1 ? lines.slice(0, at).filter(l => /^\s*!(if|endif)/.test(l)) : [];
    let open = null, depth = 0;
    for (const l of head) {
      if (/^\s*!if/.test(l)) { depth++; if (/^\s*!ifndef\s+BUILD_UNINSTALLER\b/.test(l)) open = depth; }
      else { if (open === depth) open = null; depth--; }
    }
    const init = code(macro(nsh, "customInit"));
    const lang = macro(nsh, "TurnLang ID") || (/!macro TurnLang ID\r?\n([\s\S]*?)!macroend/.exec(nsh) || [])[1] || "";
    const defs = lang.split(/\r?\n/).map((l, i, all) => ({ l: l.trim(), guarded: all.slice(0, i).reverse().find(x => /^\s*!(ifndef|endif)\b/.test(x)) }))
      .filter(x => /^LangString etiudaOldCopyLeft \$\{ID\} "[^"]+"$/.test(x.l));
    return at > -1 && open !== null && /^Var etiudaFinishText$/m.test(nsh)
      && init[0] === "StrCpy $etiudaFinishText \"$(MUI_TEXT_FINISH_INFO_TEXT)\""
      && defs.length === 2 && defs.every(d => d.guarded && /!ifndef BUILD_UNINSTALLER/.test(d.guarded))
      && /!define MUI_FINISHPAGE_RUN\b/.test(T["assistedInstaller.nsh"] || "");
  };
  ok(finishSays(NSH), "14d the finish page's text is Modern UI's own unless the copy was left, then the case's sentence, a"
    + " language string in both languages; the page keeps its Run box, so the label stays 195 by 40 dialog units");
  ok(!finishSays(NSH.replace(/^\s*StrCpy \$etiudaFinishText "\$\(MUI_TEXT_FINISH_INFO_TEXT\)"\r?\n/m, "")),
    "14d control: no default, so every other install's finish page would be blank, reads red");
  ok(!finishSays(NSH.replace(/(LangString RecogniseUnreadableText \$\{ID\} "Na tym[^\n]*\n)\s*LangString etiudaOldCopyLeft[^\n]*\n/, "$1")),
    "14d control: the Polish branch without its string reads red");
  ok(!finishSays(NSH.replace("!define MUI_FINISHPAGE_TEXT \"$etiudaFinishText\"", "")),
    "14d control: the page left on Modern UI's fixed text reads red");
}

console.log("\n#counts checks=" + checks + " failed=" + fails + " notRun=" + notRun.length);
console.log("install-plan-selftest " + (fails ? "FAILED " + fails + " of " : "passed ") + checks + " check(s)");
process.exit(fails ? Math.min(fails, 63) : 0);
