/* THE INSTALL PLAN: what the update and all-users legs pass to the installer, where they look, and
 * how they judge what they read. Pure: nothing here spawns, installs, launches or touches the
 * registry, so tests/install-plan-selftest.js drives every line of it in the node chain, and the
 * gate that does install (tests/update-install.js) only collects facts and hands them here.
 *
 * WHY THE JUDGEMENT IS SEPARATE FROM THE COLLECTING. The gate needs an installer, a desktop and
 * for one leg an elevated shell, so it runs a few times a month in a machine window. A judge that
 * lives inside it is proved only on those days. Here each clause of each verdict is held against a
 * planted fact in every `npm test`: one good set of facts, then one mutant per clause, and each
 * mutant must redden exactly its own row (code-pass survey finding 31, ruling of 2026-09-28
 * finding 10: every layer is tested with a planted flaw).
 *
 * WHAT electron-builder DOES THAT THIS FILE ENCODES, read from app-builder-lib 26.15.3's own NSIS
 * templates on 2026-09-28 rather than from its documentation:
 *   - the uninstall key is Software\Microsoft\Windows\CurrentVersion\Uninstall\<guid> and the
 *     install key Software\<guid>, under HKCU for a per-user install and HKLM for all users, where
 *     <guid> is UUID v5 of the appId in electron-builder's own namespace (NsisTarget.js);
 *   - a newer setup finds the older copy through InstallLocation on the install key and installs
 *     into THAT folder unless /D is given (multiUser.nsh, setInstallModePerUser);
 *   - it runs the older copy's own uninstaller first, as `/S /KEEP_APP_DATA /currentuser --updated
 *     _?=<dir>` (installUtil.nsh, uninstallOldVersion), which removes the whole install folder
 *     and keeps the user-data folder; with KeepShortcuts on the install key it adds
 *     --keep-shortcuts and the shortcuts are neither deleted nor recreated (installer.nsh);
 *   - /D must be the last argument and unquoted, and /allusers or /currentuser choose the context
 *     outright; with neither, a per-machine copy already registered makes the context all users,
 *     which is the exit 199 measured on 2026-09-17 when no elevation was there to ask for.
 */
"use strict";
const crypto = require("node:crypto");
const path = require("node:path");

/* electron-builder's namespace for the app GUID, NsisTarget.js ELECTRON_BUILDER_NS_UUID. */
const BUILDER_NS = "50e065bc-3134-11e6-9bab-38c9862bdaf3";

/** UUID v5 (RFC 4122, SHA-1) of `name` in `ns`, written from the RFC rather than copied, so that
 *  the selftest's comparison with builder-util-runtime's own UUID.v5 is two implementations. */
function uuidV5(name, ns) {
  const nsBytes = Buffer.from(String(ns).replace(/-/g, ""), "hex");
  if (nsBytes.length !== 16) throw new Error("not a UUID: " + ns);
  const h = crypto.createHash("sha1").update(Buffer.concat([nsBytes, Buffer.from(String(name), "utf8")])).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = b.toString("hex");
  return [x.slice(0, 8), x.slice(8, 12), x.slice(12, 16), x.slice(16, 20), x.slice(20)].join("-");
}
function appGuid(appId) { return uuidV5(appId, BUILDER_NS); }

const MODES = { user: { root: "HKCU", flag: "/currentuser" }, machine: { root: "HKLM", flag: "/allusers" } };
function modeOf(mode) {
  const m = MODES[mode];
  if (!m) throw new Error("the install mode is " + JSON.stringify(mode) + "; it is user or machine");
  return m;
}

/** The registry keys an install of `guid` writes in `mode`, as PowerShell provider paths. */
function registryKeys(mode, guid) {
  const root = modeOf(mode).root + ":\\";
  return {
    root: modeOf(mode).root,
    uninstallParent: root + "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    uninstall: root + "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + guid,
    install: root + "Software\\" + guid,
    classes: root + "Software\\Classes",
  };
}

/** A folder /D can carry: absolute, no whitespace, no quote. Answers a sentence, or "". */
function badInstallDir(dir) {
  if (typeof dir !== "string" || !dir) return "no folder was given";
  if (/["']/.test(dir)) return dir + " holds a quote, which /D would pass through into the path";
  if (/\s/.test(dir)) return dir + " holds a space, which /D cannot carry (it must be last and unquoted)";
  if (!path.win32.isAbsolute(dir) || !/^[A-Za-z]:[\\/]/.test(dir)) return dir + " is not an absolute path with a drive";
  return "";
}

/** The installer's arguments. `dir` omitted is the update a customer runs: the setup finds the
 *  folder on its own, which is the behaviour the update leg exists to measure. */
function installArgs(opts) {
  const o = opts || {};
  const args = ["/S", modeOf(o.mode).flag];
  if (o.dir !== undefined) {
    const bad = badInstallDir(o.dir);
    if (bad) throw new Error("installArgs refuses: " + bad);
    args.push("/D=" + o.dir.replace(/\//g, "\\"));
  }
  return args;
}
function uninstallArgs(mode) { return ["/S", modeOf(mode).flag]; }
/** The one vector with NO context flag, on purpose: leg A10 asks what a plain silent install
 *  chooses after an all-users copy is gone, and a flag would answer the question for it. */
function plainArgs(dir) {
  const bad = badInstallDir(dir);
  if (bad) throw new Error("plainArgs refuses: " + bad);
  return ["/S", "/D=" + dir.replace(/\//g, "\\")];
}

/** Whether an argument vector is one NSIS reads as meant: /S first, exactly one context flag and
 *  it is the one asked for, /D last if present. The gate asks this of every vector it runs. */
function argsFault(args, mode) {
  const a = (args || []).map(String);
  if (a[0] !== "/S") return "the first argument is " + JSON.stringify(a[0]) + ", not /S, so the run is not silent";
  const ctx = a.filter(x => x === "/allusers" || x === "/currentuser");
  if (ctx.length !== 1 || ctx[0] !== modeOf(mode).flag)
    return "the context flags are " + JSON.stringify(ctx) + " where " + modeOf(mode).flag + " alone was meant";
  const d = a.findIndex(x => /^\/D=/i.test(x));
  if (d > -1 && d !== a.length - 1) return "/D is argument " + (d + 1) + " of " + a.length + "; NSIS reads it only last";
  if (d > -1 && badInstallDir(a[d].slice(3))) return badInstallDir(a[d].slice(3));
  return "";
}

/** A scratch home under `lab`: the environment a CHILD gets, the four folders Windows should
 *  answer for it, and the folders to make first (an unshaped home hangs Electron, measured
 *  2026-09-25). The gate's own process keeps its environment, so the engine's launch door still
 *  measures against the real profile and a launch into this home is not mistaken for it. */
function scratchHome(lab) {
  const HOME = path.win32.join(lab, "home");
  const roaming = path.win32.join(HOME, "AppData", "Roaming");
  const local = path.win32.join(HOME, "AppData", "Local");
  const places = {
    ApplicationData: roaming,
    LocalApplicationData: local,
    Desktop: path.win32.join(HOME, "Desktop"),
    Programs: path.win32.join(roaming, "Microsoft", "Windows", "Start Menu", "Programs"),
  };
  const documents = path.win32.join(HOME, "Documents");
  return { HOME, places, documents,
           env: { USERPROFILE: HOME, APPDATA: roaming, LOCALAPPDATA: local },
           make: Object.values(places).concat([documents]) };
}

/** The folder app.getPath("userData") names: Electron's app name is productName, else name. */
function userDataName(pkg) {
  const p = pkg || {};
  return String(p.productName || p.name || "");
}

/** Where a per-user install goes when nothing says otherwise: the per-user program folder and
 *  the product's file name, because this installer is assisted (oneClick false), which is when
 *  electron-builder uses productFilename (targetUtil.getWindowsInstallationDirName). */
function defaultUserInstallDir(localAppData, productFilename) {
  return path.win32.join(localAppData, "Programs", productFilename);
}

/* ---- the verdicts ---------------------------------------------------------------------------
 *
 * Each returns rows { id, ok, what }. The gate prints them through its own check(); the selftest
 * builds the good facts and one mutant per clause. A row is one claim, so a mutant reddens one
 * row, and a mutant that reddens none or two is a fault in the judge rather than in the facts. */

const lc = s => String(s || "").toLowerCase().replace(/\//g, "\\").replace(/\\+$/, "");
const samePath = (a, b) => !!a && !!b && lc(a) === lc(b);
const sameMap = (a, b) => JSON.stringify(Object.keys(a || {}).sort().map(k => [k, a[k]]))
  === JSON.stringify(Object.keys(b || {}).sort().map(k => [k, b[k]]));

/** The newer setup run over the older copy, read before anything is launched. */
function judgeUpdate(f) {
  const rows = [];
  const row = (id, ok, what) => rows.push({ id, ok: !!ok, what });
  row("U1", f.setupExit === 0,
    "the newer setup, run as a customer runs it with no /D, exited " + f.setupExit);
  row("U2", f.exeThere && samePath(f.installLocation, f.dir) && !f.defaultDirExists,
    "and it went where the older copy was: Etiuda.exe in " + f.dir + " (" + !!f.exeThere + "), InstallLocation "
    + JSON.stringify(f.installLocation || null) + ", and nothing in the default folder " + f.defaultDir
    + " (" + (f.defaultDirExists ? "SOMETHING IS THERE" : "absent") + ")");
  row("U3", !!f.programNew && f.programNew === f.programTree && f.programNew !== f.programOld,
    "the program was replaced: the engine inside the installed asar is sha256 " + String(f.programNew).slice(0, 12)
    + ", the tree's is " + String(f.programTree).slice(0, 12) + " and the older copy's was " + String(f.programOld).slice(0, 12));
  row("U4", f.oldOnlyGone === true,
    "a file only the older copy had, planted in its folder, is gone (" + f.oldOnlyGone + "): the older copy was"
    + " uninstalled, not written over");
  row("U5", f.appKeys === 1 && f.keyName === f.keyBefore && f.version === f.wantVersion
    && /\/currentuser/.test(String(f.uninstallString || "")),
    "one uninstall key for the product (" + f.appKeys + "), the same one as before (" + JSON.stringify(f.keyName)
    + "), at the newer version " + JSON.stringify(f.version) + " against " + JSON.stringify(f.wantVersion)
    + ", its UninstallString per user");
  const lnk = f.shortcuts || {};
  const oneEach = ["desktop", "startMenu"].every(k => lnk[k] && lnk[k].count === 1 && samePath(lnk[k].target, f.exe));
  row("U6", oneEach,
    "one shortcut each on the Desktop and in the Start Menu, both starting " + f.exe + ": "
    + JSON.stringify(lnk));
  row("U6b", lnk.desktop && lnk.desktop.hotkey === f.hotkeyWant,
    "and the Desktop shortcut the person customised is the one they had: its hotkey reads "
    + JSON.stringify(lnk.desktop && lnk.desktop.hotkey) + " against the " + JSON.stringify(f.hotkeyWant)
    + " set before the update, so it was kept rather than made again");
  row("U7", !!f.dir && lc(f.assocCmd).indexOf(lc(f.dir)) > -1,
    "a double-clicked .ec opens this copy: " + JSON.stringify(f.assocCmd || null));
  row("U8", !!f.deskBefore && f.deskBefore === f.deskAfter,
    "the desk is byte for byte what the older copy left: sha256 " + String(f.deskAfter).slice(0, 12)
    + " against " + String(f.deskBefore).slice(0, 12));
  row("U8b", Object.keys(f.catalogsBefore || {}).length > 0 && sameMap(f.catalogsBefore, f.catalogsAfter),
    "and the catalogs in Documents\\Etiuda are the same files with the same bytes: "
    + Object.keys(f.catalogsAfter || {}).length + " against " + Object.keys(f.catalogsBefore || {}).length);
  row("U9", f.cacheExists === false,
    "and the update leaves no copy of the setup in the updater's cache (" + f.cacheExists + ")");
  return rows;
}

/** The updated copy, launched: what the person sees is what they had. */
function judgeUpdatedRun(f) {
  const rows = [];
  const row = (id, ok, what) => rows.push({ id, ok: !!ok, what });
  row("U10", f.booted && f.cards === f.wantCards && f.wantCards > 0,
    "the updated app shows the catalog the person had: " + f.cards + " cards against " + f.wantCards
    + " (booted " + f.booted + ")");
  row("U10b", f.glassOff === true && f.keyGlass === "1",
    "and the setting they made is in effect: body.glass-off " + f.glassOff + ", eGlassOff " + JSON.stringify(f.keyGlass));
  const changed = Object.keys(f.keysBefore || {}).filter(k => (f.keysAfter || {})[k] !== f.keysBefore[k]);
  row("U10c", Object.keys(f.keysBefore || {}).length > 0 && changed.length === 0,
    "every key the older copy left is still there and equal: " + Object.keys(f.keysBefore || {}).length
    + " compared, " + changed.length + " changed" + (changed.length ? ": " + changed.join(", ") : ""));
  row("U11", f.controlBooted && f.controlCards === 0 && f.controlGlassOff === false,
    "control: the same updated app with the desk moved away shows " + f.controlCards + " cards and glass-off "
    + f.controlGlassOff + ", so U10 read the desk and not an app that looks like that whatever it is given");
  return rows;
}

/** The all-users install and its uninstall. */
function judgeAllUsers(f) {
  const rows = [];
  const row = (id, ok, what) => rows.push({ id, ok: !!ok, what });
  row("A1", f.setupExit === 0 && f.exeThere,
    "an elevated silent all-users install exited " + f.setupExit + " and put Etiuda.exe in " + f.dir);
  row("A2", f.machineKeys === 1 && samePath(f.machineLocation, f.dir) && /\/allusers/.test(String(f.uninstallString || ""))
    && f.userKeysAdded === 0,
    "one uninstall key under HKLM (" + f.machineKeys + ") naming " + JSON.stringify(f.machineLocation || null)
    + ", its UninstallString all users, and no key added under HKCU (" + f.userKeysAdded + ")");
  row("A3", samePath(f.machineInstallKey, f.dir),
    "and HKLM\\Software\\<guid> InstallLocation, where the next setup looks, names the folder: "
    + JSON.stringify(f.machineInstallKey || null));
  row("A4", f.commonDesktop === 1 && f.commonPrograms === 1 && f.userDesktop === 0 && f.userPrograms === 0,
    "the shortcuts are the machine's: " + f.commonDesktop + " on the public Desktop, " + f.commonPrograms
    + " in the all-users Start Menu, " + f.userDesktop + " and " + f.userPrograms + " in the user's own");
  row("A5", !!f.dir && lc(f.machineAssocCmd).indexOf(lc(f.dir)) > -1 && f.userAssocChanged === false,
    "a double-clicked .ec opens this copy through HKLM: " + JSON.stringify(f.machineAssocCmd || null)
    + ", the user's own association unchanged (" + !f.userAssocChanged + ")");
  row("A6", f.userCacheExists === false && f.machineCacheExists === false,
    "no copy of the setup is left in the user's updater cache (" + f.userCacheExists + ") or the machine's ("
    + f.machineCacheExists + "): shell/installer.nsh switched the context back to the user's before deleting");
  row("A7", f.booted === true && f.userDataInHome === true,
    "the all-users copy runs for this user and keeps its desk in the user's own folder: booted " + f.booted
    + ", desk under the user's AppData " + f.userDataInHome);
  row("A8", f.goneSeconds > 0 && !f.exeAfter && f.machineKeysAfter === 0 && f.machineInstallKeyAfter === ""
    && f.commonDesktopAfter === 0 && f.commonProgramsAfter === 0 && lc(f.machineAssocCmdAfter).indexOf(lc(f.dir)) < 0,
    "the all-users uninstall took all of it: folder gone in " + f.goneSeconds + " s, " + f.machineKeysAfter
    + " HKLM uninstall key(s), install key " + JSON.stringify(f.machineInstallKeyAfter) + ", "
    + f.commonDesktopAfter + " and " + f.commonProgramsAfter + " shortcuts, association "
    + JSON.stringify(f.machineAssocCmdAfter || null));
  row("A9", f.deskKept === true,
    "and it left the user's desk alone (" + f.deskKept + ")");
  row("A10", f.perUserExit === 0 && f.perUserKeys === 1 && f.perUserMachineKeys === 0,
    "after it, a plain `setup /S` with no context flag installs per user as on a clean machine: exit "
    + f.perUserExit + ", " + f.perUserKeys + " HKCU key, " + f.perUserMachineKeys + " HKLM. On 2026-09-17 the residue"
    + " of an all-users copy made this exit 199");
  return rows;
}

module.exports = { BUILDER_NS, uuidV5, appGuid, registryKeys, badInstallDir, installArgs, uninstallArgs, plainArgs,
                   argsFault, scratchHome, userDataName, defaultUserInstallDir, samePath,
                   judgeUpdate, judgeUpdatedRun, judgeAllUsers };
