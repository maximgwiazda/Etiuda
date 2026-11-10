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

console.log("\n#counts checks=" + checks + " failed=" + fails + " notRun=" + notRun.length);
console.log("install-plan-selftest " + (fails ? "FAILED " + fails + " of " : "passed ") + checks + " check(s)");
process.exit(fails ? Math.min(fails, 63) : 0);
