"use strict";

const { app, BrowserWindow, Menu, Notification, Tray, clipboard, dialog, globalShortcut, ipcMain, nativeImage, nativeTheme, net, protocol, session,
  safeStorage, screen, shell, systemPreferences, utilityProcess } = require("electron");

/* AN INSTALLED DESK, loaded from inside app.asar, opens no debugging endpoint and takes neither
   ETIUDA_TEST_DOCUMENTS nor ETIUDA_TEST_SAVE_AS unless ETIUDA_TEST_DEVTOOLS=1, which tests/engine.js
   shellLaunch sets beside any of them. tests/shell-office.mjs 8 holds it. */
const INSTALLED = /[\\/]app\.asar([\\/]|$)/i.test(__dirname);
const TEST_DOOR = !INSTALLED || process.env.ETIUDA_TEST_DEVTOOLS === "1";
if (!TEST_DOOR) {
  for (const s of ["remote-debugging-port", "remote-debugging-pipe"]) {
    if (!app.commandLine.hasSwitch(s)) continue;
    app.commandLine.removeSwitch(s);
    console.error("etiuda: --" + s + " is not taken by an installed desk");
  }
  for (const v of ["ETIUDA_TEST_DOCUMENTS", "ETIUDA_TEST_SAVE_AS"])
    if (process.env[v]) console.error("etiuda: " + v + " is not taken by an installed desk");
}
const { execFile, execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
/* The sign-in's loopback alone, on 127.0.0.1, open only while the person signs in (signinListen). */
const http = require("node:http");
/* Node's own connections, the relay's socket among them, trust only the roots bundled with Node; the system's are added
   here, before any socket opens, so they trust what Chromium's calls trust. A store that cannot be read leaves the bundle
   as it was, and the desk still starts. tests/system-roots.mjs holds it. */
try {
  const tls = require("node:tls");
  tls.setDefaultCACertificates([...new Set([...tls.getCACertificates("default"), ...tls.getCACertificates("system")])]); /* plant:system-roots */
} catch { /* the bundled roots stand */ }
const { watchPage } = require(path.join(__dirname, "page-watch.cjs"));
const { decideClose, showNotification: showNotificationOf, notifyFirstClose: notifyFirstCloseOf, setLoginItemSettings: setLoginItemSettingsOf, loginItemOn,
  createTray, buildTrayMenuTemplate, setJumpList: setJumpListOf, APP_IDS } = require(path.join(__dirname, "tray.cjs"));
/* A HARNESS LAUNCH WRITES NOTHING THE ACCOUNT KEEPS OUTSIDE ITS LAB: no etiuda: handler, login item, jump list or toast.
   Every harness launch carries a user-data folder of its own (the door refuses one without) or a test variable, and the
   installer legs' build is one by what it is, whoever starts it; a customer's start is none of these. */
function harnessLaunch() {
  const argv = Array.isArray(process.argv) ? process.argv : [];
  return argv.some(a => /^--user-data-dir(=|$)/.test(String(a)))
    || ["ETIUDA_TEST_OFFSCREEN", "ETIUDA_TEST_DOCUMENTS", "ETIUDA_TEST_DEVTOOLS"].some(k => process.env[k] !== undefined)
    || testIdentityBuild(); /* plant:harness-test-build */
}
/* The name earlier builds' Run value carries: Electron's default id, "electron.app." and the app's name. */
function legacyLoginName() {
  let n = "";
  try { n = String(app.getName() || ""); } catch { n = ""; }
  return "electron.app." + (n || "Etiuda");
}
/* Off clears the desk's own Run value and an earlier build's; on writes the desk's own. */
function setStartWithWindows(on) {
  if (!on) setLoginItemSettings(app, false, { name: legacyLoginName() });
  return setLoginItemSettings(app, !!on);
}
function setLoginItemSettings(electronApp, on, opts) {
  if (harnessLaunch()) return null; /* plant:harness-login */
  return setLoginItemSettingsOf(electronApp, on, opts);
}
function syncLoginItemPath() {
  if (harnessLaunch()) return null;
  if (process.platform !== "win32") return null;
  let applied = null;
  try {
    if (typeof app.getLoginItemSettings === "function") {
      const cur = app.getLoginItemSettings(), legacy = legacyLoginName(), old = loginItemOn(cur, legacy);
      /* An earlier build's value, under Electron's default id, moves to the desk's own name: the old one cleared first. */
      if (loginItemOn(cur) || old) {
        if (old) setLoginItemSettings(app, false, { name: legacy });
        applied = setLoginItemSettings(app, true, { path: process.execPath });
      }
    }
  } catch { /* start with Windows could not be refreshed */ }
  return applied;
}
function setJumpList(electronApp, opts) {
  if (harnessLaunch()) return null; /* plant:harness-jump */
  return setJumpListOf(electronApp, opts);
}
function showNotification(opts) {
  if (harnessLaunch()) return null; /* plant:harness-toast */
  return showNotificationOf(opts);
}
function notifyFirstClose(opts) {
  if (harnessLaunch()) return null; /* plant:harness-first-close */
  return notifyFirstCloseOf(opts);
}
const { readsLikeMessage, scoreSuggestions, MESSAGE_MAX_CHARS, SUGGEST_LIMIT } = require(path.join(__dirname, "clip-suggest.cjs"));
const { honourPendingReset, stageReset, deliverResetNotice, retryPendingReset, stopPendingReset } = require(path.join(__dirname, "desk-reset.cjs"));
const deskAi = require(path.join(__dirname, "desk-ai.cjs"));
/* THE EMBEDDED MODEL, where the package carries it beside the asar; a copy of the shell without these files suggests by words. */
let embedLib = null;
try { embedLib = require(path.join(__dirname, "embed", "suggest.cjs")); } catch (e) { embedLib = null; }
/* The relay's channel layer, required the first time a team on the relay needs it, so a desk on a folder loads nothing of it. */
let relayLayer = null;
function RelayChannel() { return relayLayer || (relayLayer = require(path.join(__dirname, "relay", "channel.cjs"))); }
let folderSyncerLayer = null;
function FolderSyncer() {
  return folderSyncerLayer || (folderSyncerLayer = require(path.join(__dirname, "folder", "syncer.cjs")));
}
/* Why the folder mirror's syncer could not start on this desk, or "" while it can (Argon's updates review of 2026-11-01,
   finding 1): a desk whose syncer does not run reads the shared folder itself, as it did before the mirror, and says
   why once, rather than reading an empty mirror and taking itself for no member of its team. */
let folderSyncerBroken = "";
function folderSyncerFailed(e) {
  const why = String(e && e.message || e || "unknown").split("\n")[0];
  if (folderSyncerBroken === why) return;
  folderSyncerBroken = why;
  teamSay("the shared folder's local copy could not be kept on this desk, so it reads the shared folder itself: " + why);
}

/* THE PROXY IS CHOSEN HERE, BEFORE READY: a setProxy after ready would not stop the first lookup.
   Windows' own setting is followed where it names a setup script or a server (per-machine under
   ProxySettingsPerUser 0). Where none is named and the Connections flags say direct only, no proxy
   is passed; automatic detection or a failed read leaves Chromium's resolver. */
const { windowsProxySwitches } = require(path.join(__dirname, "win-proxy.cjs"));
for (const s of windowsProxySwitches()) app.commandLine.appendSwitch(...s);

/* ON LINUX THE KEYRING IS ASKED FOR BY NAME WHERE CHROMIUM WOULD NOT ASK FOR ONE. Before ready Chromium names the desktop
   (base/nix/xdg_util.cc, which chromiumDesktop follows line for line) and picks a store (SelectBackend, in Electron's
   revert_oscrypt_remove_sync_backend.patch): KDE 3, LXQt and an unnamed desktop get "basic_text", which sealsForReal
   refuses, so nothing sealed can be orphaned there. On those alone, and only where a keyring answers unlocked
   (keyringAnswers), libsecret is asked for; a recognised desktop's store, or one the command line names, is never
   changed, since a key sealed under it would be orphaned. tests/shell-office.mjs 14 holds it. */
function chromiumDesktop(env) {
  const session = env.DESKTOP_SESSION || "", has = n => Object.prototype.hasOwnProperty.call(env, n);
  if (env.XDG_CURRENT_DESKTOP !== undefined) for (const v of String(env.XDG_CURRENT_DESKTOP).split(":").map(s => s.trim()).filter(Boolean)) {
    if (v === "Unity") return session.indexOf("gnome-fallback") > -1 ? "GNOME" : "UNITY";
    if (v === "Deepin") return "DEEPIN";
    if (v === "GNOME") return "GNOME";
    if (v === "X-Cinnamon") return "CINNAMON";
    if (v === "KDE") return env.KDE_SESSION_VERSION === "5" ? "KDE5" : env.KDE_SESSION_VERSION === "6" ? "KDE6" : "KDE4";
    if (v === "Pantheon") return "PANTHEON";
    if (v === "XFCE") return "XFCE";
    if (v === "UKUI") return "UKUI";
    if (v === "LXQt") return "LXQT";
    if (v === "COSMIC") return "COSMIC";
  }
  if (session === "deepin") return "DEEPIN";
  if (session === "gnome" || session === "mate") return "GNOME";
  if (session === "kde4" || session === "kde-plasma") return "KDE4";
  if (session === "kde") return has("KDE_SESSION_VERSION") ? "KDE4" : "KDE3";
  if (session.indexOf("xfce") > -1 || session === "xubuntu") return "XFCE";
  if (session === "ukui") return "UKUI";
  if (has("GNOME_DESKTOP_SESSION_ID")) return "GNOME";
  if (has("KDE_FULL_SESSION")) return has("KDE_SESSION_VERSION") ? "KDE4" : "KDE3";
  return "OTHER";
}
/* Whether a keyring answers on the session bus without asking anything of the person: a secret service already running
   (asking whether the name has an owner starts nothing) whose default collection is unlocked. Asking libsecret for one
   that is not running starts gnome-keyring by D-Bus activation, and with no keyring made yet it raised a prompt for a
   new password and held the desk (measured on Ubuntu); a locked one would ask to be unlocked. */
const BUS_TOOL = "/usr/bin/dbus-send";
function keyringAnswers() {
  const ask = (dest, at, method, ...args) => {
    try {
      return String(execFileSync(BUS_TOOL, ["--session", "--print-reply=literal", "--reply-timeout=1500", "--dest=" + dest, at, method].concat(args),
        { encoding: "utf8", timeout: 3000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }));
    } catch { return ""; }
  };
  if (!/^\s*boolean true\s*$/.test(ask("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus.NameHasOwner", "string:org.freedesktop.secrets"))) return false;
  const at = ask("org.freedesktop.secrets", "/org/freedesktop/secrets", "org.freedesktop.Secret.Service.ReadAlias", "string:default").trim();
  if (!/^\/org\/freedesktop\/secrets\/[A-Za-z0-9_/]+$/.test(at)) return false;
  return /^\s*variant\s+boolean false\s*$/.test(ask("org.freedesktop.secrets", at, "org.freedesktop.DBus.Properties.Get",
    "string:org.freedesktop.Secret.Collection", "string:Locked"));
}
function keyringSwitch(platform, env, line) {
  if (platform !== "linux" || !/^(KDE3|LXQT|OTHER)$/.test(chromiumDesktop(env))) return null;
  if (line.hasSwitch("password-store") || line.hasSwitch("enable-encryption-selection")) return null;
  return keyringAnswers() ? ["password-store", "gnome-libsecret"] : false;
}
const KEYRING_SWITCH = keyringSwitch(process.platform, process.env, app.commandLine);
if (KEYRING_SWITCH === false) console.error("etiuda: this desktop names no keyring Chromium knows, and none answers unlocked on the session bus, so none is asked for");
if (KEYRING_SWITCH) {
  app.commandLine.appendSwitch(...KEYRING_SWITCH);
  console.error("etiuda: this desktop names no keyring Chromium knows, so the desk asks for one by name: --password-store=gnome-libsecret");
}

const ENGINE = path.join(__dirname, "..", "engine", "etiuda.html");

/* The container is not the format: `.ec` is the catalog document, and the `.js` beside it is
   that same JSON behind a `window.E_CATALOG =` line, which is what a page on file:// can load
   as a sibling script. The document is found by its EXTENSION and the script by its one fixed
   name, because a browser's script tag has to name its sibling and an installed desk does not. */
const CATALOG_SCRIPT = "etiuda-catalog.js";
const CATALOG_FOLDER_KEY = "eCatalogFolder";

/* THE CATALOG FOLDER: one folder of the desk's own, where a deployment drops an edition and the
   newest one wins with no rename step to explain. Documents/Etiuda unless Settings says
   otherwise, and the setting is an ORDINARY ENGINE KEY, so it reaches here inside desk.json
   rather than through a second settings file that could disagree with the first. */
/* THE HARNESS'S OWN DOCUMENTS FOLDER, the twin of ETIUDA_TEST_OFFSCREEN below. A first run makes
   Documents/Etiuda, and app.getPath cannot be redirected from OUTSIDE the process, so without this
   the only way to drive a first run is against the real folder of whoever is at the desk. Made
   before it is set: setPath refuses a path that is not there. */
if (TEST_DOOR && process.env.ETIUDA_TEST_DOCUMENTS) {
  try {
    fs.mkdirSync(process.env.ETIUDA_TEST_DOCUMENTS, { recursive: true });
    app.setPath("documents", process.env.ETIUDA_TEST_DOCUMENTS);
  } catch (e) { console.error("etiuda: ETIUDA_TEST_DOCUMENTS could not be honoured - " + e.message); }
}
function defaultCatalogFolder() { return path.join(app.getPath("documents"), "Etiuda"); }
function folderMirrorOf(teamId) { return path.join(app.getPath("userData"), "folder-mirror", String(teamId)); }
function rawCatalogFolder() {
  if (deskKeys === undefined) deskKeys = readDesk();
  const named = sayJoinPolicy().folder;
  if (named) return named;
  const set = deskKeys[CATALOG_FOLDER_KEY];
  return (typeof set === "string" && set.trim()) ? set.trim() : defaultCatalogFolder();
}
function folderTeamHere() {
  if (deskKeys === undefined) deskKeys = readDesk();
  if (relayHere() || relayFlagged()) return null;
  const rawFolder = rawCatalogFolder();
  const j = teamJoin;
  if (j && j.team && (!j.invite || !j.invite.relay)) {
    const folder = (j.invite && j.invite.folder) || rawFolder;
    return { team: j.team, folder: folder, joining: true };
  }
  const teams = Object.keys(teamPins).filter(t => {
    if (teamBarred.has(t)) return false;
    if (teamRelayGone[t] === true) return false;
    if (teamShown[t] && teamShown[t].relay) return false;
    if (teamChannel[t] && teamChannel[t].kind === "relay") return false;
    const shown = teamShown[t];
    if (shown && shown.folder) {
      return path.resolve(shown.folder) === path.resolve(rawFolder)
        || path.resolve(shown.folder) === path.resolve(folderMirrorOf(t));
    }
    return false;
  }).sort();
  if (teams.length) {
    return { team: teams[0], folder: rawFolder, joining: false };
  }
  return null;
}
/* The mirror a joined folder team reads from, or "". Under machine policy, not until one answered listing has been
   taken, so the named folder is not swapped for an empty mirror before that. The catalog itself waits for the mirror. */
const mirrorsMade = new Set();
function folderMirrorHere() {
  const ft = folderTeamHere();
  if (!ft) return "";
  const mirror = folderMirrorOf(ft.team);
  if (sayJoinPolicy().folder && !fs.existsSync(path.join(mirror, FolderSyncer().PRIMED_NAME))) return ""; /* plant:policy-primed */
  if (!mirrorsMade.has(mirror)) { try { fs.mkdirSync(mirror, { recursive: true }); mirrorsMade.add(mirror); } catch { /* made by the syncer */ } }
  return mirror;
}
/* Where the desk writes. On a folder team that is the mirror, and the syncer's outbox carries each write to the share. */
function sharedFolderForWrite() {
  const mirror = folderMirrorHere();
  if (mirror) return mirror; /* plant:mirror-write-root */
  return shareFolderShown();
}
/* The team's own folder, for what the person is shown or picks from: never the mirror. */
function shareFolderShown() {
  const named = sayJoinPolicy().folder;
  if (named) return named;
  const relay = relayHere();
  if (relay) return relayMirrorOf(relay.rt);
  const ft = folderTeamHere();
  if (ft) return ft.folder;
  return catalogFolder();
}
function catalogFolder() {
  if (deskKeys === undefined) deskKeys = readDesk();
  const named = sayJoinPolicy().folder;
  if (named) return folderMirrorHere() || named;
  /* On the relay the team folder is the mirror the channel layer keeps, beside the desk's own file (shell/relay/channel.cjs). */
  const relay = relayHere();
  if (relay) return relayMirrorOf(relay.rt);
  const need = Object.values(teamNeedsFolder)[0];
  if (need && need.mirror) return need.mirror;
  /* On a folder team the catalog folder is the local mirror the syncer keeps. */
  const ft = folderTeamHere();
  if (ft && !ft.joining && folderSyncerBroken) return ft.folder; /* plant:syncer-broken-share */
  if (ft && !ft.joining) return folderMirrorOf(ft.team); /* plant:catalog-folder-mirror */
  if (ft && ft.joining) return folderMirrorOf(ft.team); /* plant:mirror-while-joining */
  const set = deskKeys[CATALOG_FOLDER_KEY];
  return (typeof set === "string" && set.trim()) ? set.trim() : defaultCatalogFolder();
}
/* Made on first run, and only where nobody has chosen one: a folder somebody picked existed when
   they picked it, so making it again would quietly stand in for a share that has gone away. */
function ensureCatalogFolder() {
  const dir = defaultCatalogFolder();
  console.log("etiuda: catalog folder " + catalogFolder());
  if (catalogFolder() !== dir || !folderAnswers(dir)) return;
  try { fs.mkdirSync(dir, { recursive: true }); }
  catch (e) { console.error("etiuda: " + dir + " could not be made - " + e.message); }
  giveSamples();
}

/* TWO FOLDERS: the catalogs Etiuda ships (the sample) stay where it was installed, beside this
   file, and Documents/Etiuda is read as well; a file there with exactly the same name is ALWAYS
   read instead of the shipped one, edited or not, and the Library lists that name once and says
   which copy is in use. Paired with the default folder only, for ensureCatalogFolder's reason: a
   folder somebody chose stands alone. */
const BUILT_IN_DIR = __dirname;
/* THE FIRST RUN GIVES THE DEFAULT FOLDER A COPY OF EACH SHIPPED CATALOG, so Load shows the sample
   among the person's own files. A first run is a desk with no file at all, so an update gives
   nothing and a copy the person deletes is not put back; a file already there under the name is
   left alone. The key is written so that the desk exists from this run on. Read and written
   rather than copied, since the source sits inside the asar. */
const GIVEN_KEY = "e~sampled";
function giveSamples() {
  if (deskKeys === undefined) deskKeys = readDesk();
  const dir = defaultCatalogFolder();
  if (!deskIsNew || catalogFolder() !== dir || !folderAnswers(dir)) return;
  for (const f of ecFilesIn(BUILT_IN_DIR)) {
    try { fs.writeFileSync(path.join(dir, path.basename(f)), fs.readFileSync(f), { flag: "wx" }); }
    catch (e) {
      if (e.code !== "EEXIST") console.error("etiuda: " + path.basename(f) + " could not be put in " + dir + " - " + e.message);
    }
  }
  deskSetOwn(GIVEN_KEY, "1");
}
function builtInFiles() {
  if (catalogFolder() !== defaultCatalogFolder()) return [];
  const own = ecFilesIn(catalogFolder()).map(f => path.basename(f).toLowerCase());
  return ecFilesIn(BUILT_IN_DIR).filter(f => own.indexOf(path.basename(f).toLowerCase()) < 0);
}
/* THE FOLDER THE PAGE MAY NAME for a file it was handed, and "" for a shipped one: that folder is
   inside the installation's archive, which nobody can open, so the page says in words where the
   file came from instead. */
function isBuiltIn(file) { return !!file && path.dirname(file) === BUILT_IN_DIR; }
function folderShown(file) { return (!file || isBuiltIn(file)) ? "" : path.dirname(file); }
/* Which copy of a name is read: the folder's own, else the shipped one. Null for neither. */
function catalogFileNamed(base) {
  const own = path.join(catalogFolder(), base);
  if (folderAnswers(catalogFolder()) && fs.existsSync(own)) return own;
  return builtInFiles().filter(f => path.basename(f).toLowerCase() === base.toLowerCase())[0] || null;
}

/* WHAT THE FILE IS, never what it is called and never the id or the `sample` flag inside it: edit
   one character of the sample and it is somebody's own catalog, competing on its date like any
   other file, whatever it is still named. Bytes rather than a hash of the parsed document,
   because bytes are what was copied in - a document reformatted is a document edited. The size
   settles every other file in the folder without reading it. */
function isTheSample(file) {
  try {
    const size = fs.statSync(file).size;
    if (!SAMPLE_EDITIONS.some(x => x[0] === size)) return false;
    const got = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    return SAMPLE_EDITIONS.some(x => x[0] === size && x[1] === got);
  } catch (e) { return false; }
}
/* EVERY EDITION OF THE SAMPLE A BUILD HAS SHIPPED OR GIVEN, by size and SHA-256, this build's own
   included (tests/shell-office.mjs holds that, so an edition is added here as it ships). A copy
   of an older one keeps its place at the foot of the list after the sample moves on. */
const SAMPLE_EDITIONS = [
  [39612, "2fa81658b7ad2b4c8e962e7c70134c2c3b86ac9c802fc08743fd41c32988213a"],
  [39650, "aae9453e5c38b1d29ea394c31226e3ded39e9ce716febcc96274c089deb3a317"],
  [260051, "60c7a9c39a8778c16f704899f3018e1ea850e0ba5d15ccaa9ab5f4c16f0b98b6"],
  [260029, "e6dd8911afaf1957ef652c55e5694cbc4767b4397bfd6121e5ac55ededefec9d"]
];
/* NEVER COUNTED AHEAD OF ANOTHER CATALOG, the second half of the ruling above: the sample goes to
   the end of every list of candidates, so a folder holding one real catalog opens that one and a
   folder holding nothing else opens the sample. The Library's list is ordered through here too.
   Which file a restart opens is readCatalog's: for one catalog, the highest rev the ring verifies.
   A file somebody double-clicked is not on this list at all, and that ask is read ahead of the rest. */
function sampleLast(files) {
  const rest = [], last = [];
  files.forEach(f => (isTheSample(f) ? last : rest).push(f));
  return rest.concat(last);
}

/* Newest first, and the name breaks a tie so two files saved in the same millisecond do not
   swap places between launches. A file that cannot be stat'd is one that has just been renamed
   away underneath the listing, and is simply not a candidate. This order is the list. It does not
   choose between editions of one catalog: readCatalog keeps the highest rev the ring verifies. */
function ecFilesIn(dir) {
  if (!folderAnswers(dir)) return [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter(n => /\.ec$/i.test(n))
    .map(n => { const f = path.join(dir, n); try { return { f: f, mt: fs.statSync(f).mtimeMs }; } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => b.mt - a.mt || (a.f < b.f ? -1 : a.f > b.f ? 1 : 0))
    .map(x => x.f);
}
/* Nearest first: the catalog folder, then the user-data folder, which a packaged copy can write
   to, then the folder the app was installed into, which is where a catalog sits while 2.x is
   being built. The documents before the script in each, so a folder holding both boots from the
   one a person edited. */
function catalogFolders() {
  return [catalogFolder(), app.getPath("userData"), path.join(__dirname, "..")];
}
function catalogPlaces() {
  return (openedWith ? [openedWith] : []).concat(sampleLast(catalogFolders().filter(folderAnswers).reduce((out, dir) =>
    out.concat(ecFilesIn(dir), [path.join(dir, CATALOG_SCRIPT)]), []).concat(builtInFiles())));
}

/* A .ec OPENED FROM THE DESKTOP: the installer registers the extension, so Windows starts Etiuda
   with the path in argv, or hands it to the copy already running through the lock below. The
   candidate is an EXISTING file whose name ends .ec and never argv[1], because Chromium's own
   switches travel in the same array and a shortcut may carry any of them. Named first among the
   places above, so the file a person double-clicked is the one this load is offered. */
let openedWith = "";
/* Set when a reset pass leaves paths behind, and sent once the page has loaded. */
let resetNotice = null;
/* The highest rev the lead had already signed in the folder, per catalog id, when the outside
   file was opened. A later file has to be above that before it is offered. */
let openedBaseline = null;
let offeredLead = null;
function ecFromArgv(argv) {
  const list = Array.isArray(argv) ? argv : [];
  const candidates = list.length === 1 ? list : list.slice(1);
  for (const a of candidates) {
    const s = String(a).replace(/^"|"$/g, "");
    if (s.slice(0, 7).toLowerCase() === "etiuda:") continue; /* plant:link-file */
    if (s.charAt(0) === "-" || !/\.ec$/i.test(s)) continue;
    try { if (fs.statSync(s).isFile()) return path.resolve(s); } catch { /* not a file from here */ }
  }
  return "";
}
/* AN etiuda: LINK IS NOT A FILE. The only argument that is an invitation is etiuda:join# and
   base64url, handed to inviteRead as etiuda-join: and the same text. A folder invitation, a page
   address, a link wrapped twice and anything longer than 8192 characters are said and dropped,
   and a refusal reads nothing from disk. Nothing joins: the confirm is still the person's yes. */
const LINK_FOLDER = "A folder invitation is pasted in Etiuda, not opened from a link.";
const LINK_FOLDER_PL = "Zaproszenie do folderu wkleja się w Etiudzie; z odnośnika się go nie otwiera.";
const LINK_FORM = "Etiuda cannot read this link, so nothing was opened or sent. The invitation can be pasted in Etiuda instead.";
const LINK_FORM_PL = "Etiuda nie potrafi odczytać tego odnośnika, więc niczego nie otwarto ani nie wysłano. Zaproszenie można zamiast tego wkleić w Etiudzie.";
const LINK_NO_TEAM = "This invitation names no team this desk can join, so nothing was sent. Ask your lead for a new one.";
const LINK_NO_TEAM_PL = "To zaproszenie nie wskazuje zespołu, do którego to stanowisko mogłoby dołączyć, więc niczego nie wysłano. Nowe wystawi lider zespołu.";
const LINK_LONG = "This invitation is longer than Etiuda opens, so it was not opened. Ask your lead for a new one.";
const LINK_LONG_PL = "To zaproszenie jest dłuższe, niż Etiuda może otworzyć, więc go nie otwarto. Nowe wystawi lider zespołu.";
function linkRefusal(en, pl) { return { refused: en, saidEn: en, saidPl: pl }; }
function linkLooks(s) {
  const head = s.slice(0, 12).toLowerCase();
  if (head === "etiuda-join:") return true; /* plant:link-paste */
  return head.slice(0, 7) === "etiuda:" || s.slice(0, 8).toLowerCase() === "https://" || s.slice(0, 7).toLowerCase() === "http://";
}
function linkFromArg(arg) {
  const s = typeof arg === "string" ? arg : "";
  if (!linkLooks(s)) return null;
  if (s.length > 8192) return linkRefusal(LINK_LONG, LINK_LONG_PL); /* plant:link-cap */
  const hash = s.lastIndexOf("#");
  const payload = hash >= 0 ? s.slice(hash + 1) : "";
  if (s !== "etiuda:join#" + payload) return linkRefusal(LINK_FORM, LINK_FORM_PL); /* plant:link-form */
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) return linkRefusal(LINK_FORM, LINK_FORM_PL); /* plant:link-b64 */
  const handed = "etiuda-join:" + payload;
  const parsed = inviteRead(handed, process.platform !== "win32");
  if (!parsed) return linkRefusal(LINK_FORM, LINK_FORM_PL);
  if (!parsed.relay) return linkRefusal(LINK_FOLDER, LINK_FOLDER_PL); /* plant:link-folder */
  return { text: handed, parsed: parsed };
}
function linkArgFrom(argv) {
  for (const a of (argv || []).slice(1)) { if (linkFromArg(a)) return String(a); }
  return "";
}
let pendingLink = null, pendingLinkArg = "";
let heldLinkText = "", heldLinkView = null;
/* What the page may see of a link: the lead's name, the team and the relay's host. The invitation
   text stays here, so a yes can name it and the secret never enters the renderer. */
function linkOfferView(view, parsed) {
  const base = view && typeof view === "object" ? Object.assign({}, view) : {};
  base.offer = {
    lead: String(view && view.offer && view.offer.lead || ""),
    team: String(parsed && parsed.team || ""),
    relay: String(view && view.offer && view.offer.relay || ""),
    link: true,
  };
  if (view && view.offer && view.offer.left) base.offer.left = view.offer.left;
  return base;
}
function handLinkView(view) {
  heldLinkView = view;
  const win = theWindow;
  if (win && !win.isDestroyed() && win.webContents && typeof win.webContents.send === "function") {
    try { win.webContents.send("etiuda:team-join", view); pendingLink = null; return; }
    catch (e) { /* the page is not there yet */ }
  }
  pendingLink = view; /* plant:link-pending */
}
function handPendingLink(win) {
  const view = pendingLink;
  if (!view) return;
  pendingLink = null;
  if (!win || win.isDestroyed() || !win.webContents || typeof win.webContents.send !== "function") { pendingLink = view; return; }
  try { win.webContents.send("etiuda:team-join", view); }
  catch (e) { pendingLink = view; }
}
function sayLinkRefusal(got) {
  console.error("etiuda: " + got.saidEn + " " + got.saidPl);
  heldLinkText = "";
  handLinkView({ linkRefusal: { en: got.saidEn, pl: got.saidPl } });
  return { refused: got.refused, said: got.saidEn };
}
function acceptLink(arg) {
  const got = linkFromArg(arg);
  if (!got) return null;
  if (got.refused) return sayLinkRefusal(got);
  const view = readInvite(got.text);
  if (!view || !view.offer) return sayLinkRefusal(linkRefusal(LINK_NO_TEAM, LINK_NO_TEAM_PL)); /* plant:link-offer */
  const clean = linkOfferView(view, got.parsed);
  heldLinkText = got.text;
  handLinkView(clean);
  return { confirm: true, text: got.text, offer: clean.offer };
}
function heldLinkAnswer() {
  if (heldLinkView) return heldLinkView;
  return joinView();
}
function declineHeldLink() {
  heldLinkText = ""; /* plant:link-decline */
  heldLinkView = null;
  pendingLink = null;
  pendingLinkArg = "";
  return joinView();
}
async function takeHeldLink(name) {
  const text = heldLinkText;
  if (!text) return Object.assign({}, joinView(), { refused: "unread" });
  const parsed = inviteParse(text);
  if (!parsed || !parsed.relay) return Object.assign({}, joinView(), { refused: "unread" });
  const ans = await takeInvite(text, name, "");
  if (!ans || !ans.refused) {
    heldLinkText = "";
    heldLinkView = null;
    pendingLink = null;
    pendingLinkArg = "";
  }
  return ans;
}
function handHeldLink(win) {
  if (pendingLinkArg) {
    const arg = pendingLinkArg;
    pendingLinkArg = "";
    acceptLink(arg);
    return;
  }
  handPendingLink(win);
}
/* The installer legs' build (tools/test-identity.cjs) marks its package.json; harnessLaunch reads it, once a run. */
var testIdentityBuilt = null;
function testIdentityBuild() {
  if (testIdentityBuilt == null) { /* == null: a caller before line 500 reads undefined, and must still read the marker (the test architect, 2026-11-11) */
    try { testIdentityBuilt = !!JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).etiudaTestBuild; }
    catch (e) { testIdentityBuilt = false; }
  }
  return testIdentityBuilt;
}
/* An installed desk registers etiuda: on Windows. A dev start and a harness start leave the
   machine's registration as they found it, and a start that cannot take the scheme still opens.
   The Ubuntu line is written from electron-builder.js. */
function registerEtiudaLink() {
  if (process.platform !== "win32" || typeof app.setAsDefaultProtocolClient !== "function") return;
  if (!app.isPackaged || process.env.ETIUDA_TEST_DOCUMENTS) return; /* plant:link-pack */
  if (harnessLaunch()) return; /* plant:harness-link */
  let ok = false;
  try {
    ok = app.setAsDefaultProtocolClient("etiuda") === true;
  } catch (e) { ok = false; }
  if (!ok) console.error("etiuda: Windows did not make this desk the program that opens an etiuda: link");
}
/* The lead's standing span, at the root of the team's folder. It replaces the old request file, which nothing here reads. */
const SPAN_NAME = "stats-span.json";
// The engine's V2_TEAM_FILE. Watched with the catalogs, since an admission is what opens a sealed one.
const TEAM_NAME = "etiuda-team.json";
/* A sync client's copy of one file: the same extension, and the stem is the canonical stem plus
   one conflict tail. The tails here are ` (1)`, ` (conflicted copy ...)`, OneDrive's `-COMPUTER`,
   Syncthing's `.sync-conflict-` and Drive's `_conf(n)`. A hyphen tail matches a computer name (3+ upper chars),
   not an ordinary name like guide-v2 or guide-EN. Nothing here renames or deletes the copy. */
function conflictSiblingName(canonical, name) {
  const c = path.basename(String(canonical || ""));
  const n = path.basename(String(name || ""));
  if (!c || !n) return false;
  const cExt = path.extname(c), nExt = path.extname(n);
  if (!cExt || cExt.toLowerCase() !== nExt.toLowerCase()) return false;
  const cStem = c.slice(0, -cExt.length), nStem = n.slice(0, -nExt.length);
  if (!cStem || nStem.length <= cStem.length) return false;
  if (nStem.slice(0, cStem.length).toLowerCase() !== cStem.toLowerCase()) return false;
  const tail = nStem.slice(cStem.length);
  if (/^( \(\d+\))+$/.test(tail)) return true;
  if (/^ \(.*conflicted copy.*\)$/i.test(tail)) return true;
  if (/^-(?!V\d+$)[A-Z0-9][A-Z0-9-]{2,62}$/.test(tail)) return true;
  if (/^\.sync-conflict-/.test(tail)) return true;
  if (/^(_conf\(\d+\))+$/i.test(tail)) return true;
  return false;
}
function isCatalogName(name) {
  const n = path.basename(String(name || ""));
  /* The head is named with the files the watch already hears, so a landing reaches Settings. */
  return /\.ec$/i.test(n) || n === CATALOG_SCRIPT || n === SPAN_NAME || n === TEAM_NAME || n === JOINS_NAME
    || n === PAUSE_NAME || n === "etiuda-head.json" || conflictSiblingName(TEAM_NAME, n);
}

/* A catalog is read as data and never run, and the order of the two attempts is the trap: the
   engine's parseCatalogFile parses the text as it stands and strips the wrapper only once that
   has failed, because searching for the name first cuts a file at a card that happens to
   mention it. Same order here, so a file the engine accepts is a file this accepts. */
function catalogPayload(text) {
  let raw = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!raw) throw new Error("file is empty");
  try { return { json: raw, data: JSON.parse(raw) }; } catch { /* not a document; try the script */ }
  const at = raw.indexOf("E_CATALOG");
  const eq = at > -1 ? raw.indexOf("=", at) : -1;
  if (eq < 0) throw new Error("neither a catalog document nor a window.E_CATALOG script");
  raw = raw.slice(eq + 1).trim().replace(/;\s*$/, "");
  return { json: raw, data: JSON.parse(raw) };
}

/* The same pair isV2 tests in the engine. Checked here as well as there because a file that
   reaches the page and is then refused boots to a clean slate in silence, and the shell's
   stdout is the only place a deployment can be told which file was wrong. */
function isV2(data) {
  return !!data && typeof data === "object" && +data.format === 2 && data.kind === "etiuda-catalog";
}
/* catalogPayload with a sealed envelope opened first, so every route hands the page the catalog inside and the page
   reads it as it reads an unsealed file, signature and identity alike. One this desk holds no key for throws. An epoch
   the team file has not named yet, on a folder team this desk already holds a key for, is the same throw marked to wait. */
function catalogRead(text) {
  const got = catalogPayload(text);
  if (!got.data || typeof got.data !== "object" || got.data.kind !== SEALED_KIND) return got;
  const inner = teamOpen(got.data);
  if (inner === null) throw sealMiss(got.data);
  const opened = catalogPayload(inner);
  if (opened.data && opened.data.kind === SEALED_KIND) throw new Error("an envelope sealed inside another");
  const id = opened.data && typeof opened.data.id === "string" ? opened.data.id : "";
  if (id && !teamOpened.has(id)) { teamOpened.add(id); persistDeskEnvelope(); }
  try { notePinTeam(signedSha(opened.data), String(got.data.team)); } catch { /* nothing to pin */ }
  return opened;
}
/* The text a route hands the page: the catalog inside an envelope this desk opens, else the file exactly as read. */
function catalogTextOf(text) {
  try { if (catalogPayload(text).data.kind === SEALED_KIND) return catalogRead(text).json; } catch { /* the page refuses it */ }
  return text;
}

let catalogFrom = "";                          // the file the payload below was read out of
/* WHEN THE FILE THIS LOAD IS RUNNING WAS LAST WRITTEN, so the engine can tell a refusal that is
   still about the file in front of it from one said to an earlier edition. 0 where there is no
   file or it has gone since. */
function catalogMtime() {
  if (!catalogFrom || !fileAnswers(catalogFrom)) return 0;
  try { return Math.round(fs.statSync(catalogFrom).mtimeMs); } catch { return 0; }
}
// The pages (webContents ids) this shell reloaded after they stopped, until each has asked once.
const recovering = new Set();
/* A FILE SOMEBODY DOUBLE-CLICKED AND THIS LAUNCH COULD NOT OPEN, handed to the page once through
   the host answer and then forgotten. openedWith is dropped with it, so the folder's own catalog
   is what opens and a later re-read does not refuse the same file again. */
let openedRefused = null;
function refuseOpened(file, why) {
  if (!openedWith || file !== openedWith) return;
  openedRefused = { name: path.basename(file), why: why };
  openedWith = "";
}
/* FILES THE ENGINE REFUSED, by path and the edit time it refused: isV2 above is the format's
   pair and the engine's reader is the whole of v2Problems, so a file can pass here and fail
   there. Passed over until it is saved again. The next file opens in its place only when it
   is not a lower rev than one already handed on. */
const engineRefused = new Map();
/* THE VERSION OF THE ENGINE THIS SHELL SERVES, E_VERSION as the build wrote it into the engine's file, read once. A catalog's
   minEngine is judged against it by the release numbers alone, so 2.0.0-dev reads a catalog that asks for 2.0.0; the
   page's reader holds the same rule (v2NeedsEngine). "" where the file names none, and minEngine is then not judged. */
let engineVersionRead = null;
function engineVersion() {
  if (engineVersionRead !== null) return engineVersionRead;
  let m = null;
  try { m = /\bE_VERSION\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)[^"]*"/.exec(fs.readFileSync(ENGINE, "utf8")); } catch { m = null; }
  engineVersionRead = m ? m[1] : "";
  return engineVersionRead;
}
/* The release a catalog asks for where this engine is older, else "". */
function needsNewerEngine(data) {
  const want = /^([0-9]{1,6})\.([0-9]{1,6})\.([0-9]{1,6})/.exec(String((data && data.minEngine) || ""));
  const have = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(want ? engineVersion() : "");
  if (!want || !have) return "";
  for (let i = 1; i <= 3; i++) if (+want[i] !== +have[i]) return +want[i] > +have[i] ? [want[1], want[2], want[3]].map(Number).join(".") : "";
  return "";
}
/* AN EDITION FOR A NEWER ENGINE IS KEPT AND NOT READ: passed over as a key not yet brought is, so the edition in use stays,
   and the page is told which release it waits for. {name, version, rev}, the newest such edition, or null. */
let catalogWaitNewer = null, catalogNewerSaid = "";
function waitNewer(file, version, data) {
  const rev = editionRev(data);
  if (!catalogWaitNewer || rev > catalogWaitNewer.rev) catalogWaitNewer = { name: path.basename(file), version: version, rev: rev };
  if (openedWith && file === openedWith) refuseOpened(file, "newer " + version);
}
function newerKey() { return catalogWaitNewer ? catalogWaitNewer.name + " " + catalogWaitNewer.version : ""; }
function sayNewer(win) {
  const key = newerKey();
  if (!key || key === catalogNewerSaid || !win || win.isDestroyed()) return;
  catalogNewerSaid = key;
  win.webContents.send("etiuda:catalog-newer", { name: catalogWaitNewer.name, version: catalogWaitNewer.version });
}
function refusedByEngine(file) {
  if (!engineRefused.has(file)) return false;
  try { return Math.round(fs.statSync(file).mtimeMs) === engineRefused.get(file); } catch { return false; }
}
/* The catalog inside a sealed file, or the text parsed as it stands, without recording the open.
   The walk below peeks every candidate, and only the one it keeps is recorded. */
function catalogPeek(text) {
  const got = catalogPayload(text);
  if (!got.data || typeof got.data !== "object" || got.data.kind !== SEALED_KIND) return got;
  const inner = teamOpen(got.data);
  if (inner === null) throw sealMiss(got.data);
  const opened = catalogPayload(inner);
  if (opened.data && opened.data.kind === SEALED_KIND) throw new Error("an envelope sealed inside another");
  return opened;
}
/* The ring entry's public, when the signature verifies for this catalog's own id. "" when it does not:
   unsigned, a key the ring does not list, and a signature that fails are all "". A caller may test it as a yes or no.
   When pinPublic is given, returns a boolean verifying the signature against that public key. */
function catalogSigValid(data, pinPublic) {
  const sig = data && data.sig;
  if (!data || !sig || sig.alg !== "Ed25519" || !/^[0-9a-f]{128}$/.test(String(sig.value || ""))) return pinPublic !== undefined ? false : "";
  if (pinPublic !== undefined) {
    if (!/^[0-9a-f]{64}$/.test(String(pinPublic || ""))) return false;
    try {
      const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(pinPublic, "hex")]), format: "der", type: "spki" });
      return crypto.verify(null, signedBytesOf(data), key, Buffer.from(String(sig.value), "hex"));
    } catch { return false; }
  }
  const ring = readRing();
  const keys = ring && Array.isArray(ring.keys) ? ring.keys : [];
  const id = String(data.id || ""), kid = String(sig.keyId || "");
  let pub = "";
  for (let i = 0; i < keys.length && !pub; i++) {
    const e = keys[i];
    if (e && e.alg === "Ed25519" && String(e.catalog) === id && String(e.keyId) === kid
      && /^[0-9a-f]{64}$/.test(String(e.public || ""))) pub = String(e.public);
  }
  if (!pub) return "";
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(pub, "hex")]), format: "der", type: "spki" });
    return crypto.verify(null, signedBytesOf(data), key, Buffer.from(String(sig.value), "hex")) ? pub : "";
  } catch { return ""; }
}
/* The leads this desk has pinned, {keyId, public} once each, one per team it joined. Empty until a team file or the
   envelope names one. The page's key reads from these too (etiuda:catalog-leads), so what it shows is what is chosen here. */
function pinnedLeadKeys() {
  const out = [];
  Object.keys(teamPins).forEach(t => {
    const pin = teamPins[t], p = pin && String(pin.public || ""), kid = pin && typeof pin.keyId === "string" ? pin.keyId : "";
    if (SEALED_TEAM_RE.test(t) && /^[0-9a-f]{64}$/.test(p) && !out.some(k => k.public === p && k.keyId === kid))
      out.push({ keyId: kid, public: p });
  });
  return out;
}
/* The lead publics alone, once each. */
function pinnedLeadPubs() {
  const out = [];
  pinnedLeadKeys().forEach(k => { if (out.indexOf(k.public) < 0) out.push(k.public); });
  return out;
}
/* Conflict copies of the team file in this folder, by name only. A backup that is not one of those
   tails is not a candidate, and nothing here is renamed or deleted. */
function teamSiblingFiles(root) {
  let names = [];
  try { names = fs.readdirSync(root); } catch { return []; }
  return names.filter(n => conflictSiblingName(TEAM_NAME, n)).sort();
}
function teamChoiceStamp(root) {
  return teamSiblingFiles(root).map(n => n + "=" + fileStamp(path.join(root, n))).join(",");
}
function teamParse(text) {
  try { return JSON.parse(String(text).replace(/^\uFEFF/, "").trim()); } catch { return null; }
}
function teamRank(doc) {
  if (!doc || typeof doc !== "object") return null;
  const rev = teamRevOf(doc);
  if (!Number.isInteger(doc.epoch) || rev === null) return null;
  return { epoch: doc.epoch, rev: rev };
}
/* Strictly newer: a higher epoch, or the same epoch and a higher rev. Equal is not newer. */
function teamAhead(doc, cur) {
  if (!cur) return true;
  const a = teamRank(doc), b = teamRank(cur);
  if (!a) return false;
  if (!b) return true;
  if (a.epoch !== b.epoch) return a.epoch > b.epoch;
  return a.rev > b.rev;
}
/* The sibling has to be the same team and the same lead where the canonical file parses as one. */
function sameTeamLead(doc, cur) {
  if (!cur || !doc) return true;
  if (cur.id && doc.id !== cur.id) return false;
  const cl = cur.lead, dl = doc.lead;
  if (cl && typeof cl === "object" && cl.keyId && cl.public) {
    if (!dl || dl.keyId !== cl.keyId || dl.public !== cl.public) return false;
  }
  return true;
}
/* The team file this folder is read as. The canonical file wins unless a conflict sibling is a
   genuine team file at a higher epoch or rev, under the same team and lead where the canonical
   file parses. A sibling under another lead of the same team is read only where its handovers run
   from that canonical lead to the lead it names, and it is ahead. A sibling that is not genuine,
   or lower, stays on disk and is not the one read.
   `missing` is the canonical file being absent and no sibling taken, which is still "no team file". */
function teamTextChosen(root) {
  const file = path.join(root, TEAM_NAME);
  let text = null, missing = false, unreadable = false;
  try {
    if (fs.statSync(file).size <= TEAM_MAX) text = fs.readFileSync(file, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") missing = true;
    else unreadable = true;
  }
  const canonDoc = text != null ? teamParse(text) : null;
  let best = { file: file, text: text, doc: canonDoc };
  for (const name of teamSiblingFiles(root)) {
    const sib = path.join(root, name);
    let sibText = null;
    try {
      if (fs.statSync(sib).size > TEAM_MAX) continue;
      sibText = fs.readFileSync(sib, "utf8");
    } catch { continue; }
    const doc = teamParse(sibText);
    if (!doc || !teamWhole(doc)) continue;
    if (canonDoc && canonDoc.id && doc.id !== canonDoc.id) continue;
    if (canonDoc && !sameTeamLead(doc, canonDoc)) {
      if (handedTo(doc, canonDoc.lead) && teamAhead(doc, best.doc)) best = { file: sib, text: sibText, doc: doc }; /* plant:sib-handover */
      continue;
    }
    if (teamAhead(doc, best.doc)) best = { file: sib, text: sibText, doc: doc }; /* plant:f3-team-sibling */
  }
  if (best.file !== file) missing = false;
  return { file: best.file, text: best.text, doc: best.doc, missing: missing && best.file === file, unreadable: unreadable && best.file === file };
}
/* The team file in this folder where it is whole under the lead it names, else null.
   A conflict sibling that is genuine and newer is that file. The one on disk is left where it is. */
function folderTeamDoc() {
  heedTeam();
  const root = catalogFolder();
  if (!folderAnswers(root)) return null;
  const doc = teamTextChosen(root).doc;
  return doc && teamWhole(doc) && !teamFileBehind(doc) ? doc : null; /* plant:s0b-floor-doc */
}
/* null: no pin, so the ring decides. []: a whole team file whose lead this desk has not pinned.
   Otherwise the publics that may sign a catalog chosen here. */
function folderLeadPublics() {
  const all = pinnedLeadPubs();
  if (!all.length) return null;
  const doc = folderTeamDoc();
  if (!doc) return all;
  const pin = teamPins[doc.id];
  if (pin && doc.lead && pin.keyId === doc.lead.keyId && pin.public === doc.lead.public) return [String(pin.public)];
  return [];
}
/* The public a catalog may be chosen under without the agent asking. With no lead pinned, any key the ring verifies.
   Where this folder's team file is whole, only the key pinned for that team: a key pinned for another team verifies
   nothing here. With no whole team file, any pinned lead's key, verified against the pin, since the ring is the share's to write. */
function catalogLeadOk(data) {
  const bound = folderLeadPublics();
  if (bound === null) return catalogSigValid(data);
  const sig = data && data.sig;
  if (!bound.length || !data || !sig || sig.alg !== "Ed25519" || !/^[0-9a-f]{128}$/.test(String(sig.value || ""))) return "";
  for (const pub of bound) {
    if (catalogSigValid(data, pub)) return pub;
  }
  return "";
}
/* The leads the page verifies against, the same publics catalogLeadOk uses. A whole team file narrows them to that
   team's pin. Where that lead is not pinned, one key that verifies nothing, so another team's pin is not read and
   the ring is not read in its place. */
function leadsForPage() {
  const bound = folderLeadPublics();
  if (bound === null) return [];
  if (!bound.length) return [{ keyId: "", public: "0".repeat(64) }];
  const doc = folderTeamDoc();
  if (doc) {
    const pin = teamPins[doc.id];
    if (pin && bound.indexOf(String(pin.public)) >= 0) return [{ keyId: pin.keyId, public: String(pin.public) }];
  }
  return pinnedLeadKeys();
}
function editionRev(data) {
  const n = data && +data.rev;
  return Number.isFinite(n) ? n : -1;
}
/* The file this launch was opened with, else the highest rev of each catalog id that may be chosen
   without the agent asking. With no lead pinned, that is a signature the ring verifies. With a lead
   pinned, only a file catalogLeadOk accepts, and a file it refuses is dropped even when it
   is the only file of its id. A newer file time does not choose between those. An id with no
   verified signature keeps every file of it, in the order ecFilesIn gave, only while no lead is pinned. */
function pickEdition(found) {
  if (openedWith) {
    const asked = found.filter(item => item.file === openedWith)[0];
    if (asked) return asked;
  }
  const pins = pinnedLeadPubs();
  const best = new Map();
  found.forEach((item, i) => {
    if (!(pins.length ? catalogLeadOk(item.data) : catalogSigValid(item.data))) return;
    const id = String(item.data.id || "");
    if (!id) return;
    const had = best.get(id);
    if (had === undefined || editionRev(item.data) > editionRev(found[had].data)) best.set(id, i);
  });
  const drop = new Set();
  found.forEach((item, i) => {
    const id = String(item.data && item.data.id || "");
    if (pins.length && !catalogLeadOk(item.data)) drop.add(i);
    else if (best.has(id) && best.get(id) !== i) drop.add(i);
  });
  const kept = found.filter((item, i) => !drop.has(i));
  /* With a lead pinned and a catalog in use, that catalog's file or none; on an empty desk whose team lists more than one
     with a file, none: the Library holds the choice. */
  const inUse = pins.length ? inUseCatalogId() : "";
  let mine = null;
  mine = inUse ? kept.filter(item => String(item.data.id || "") === inUse)[0] : null; /* plant:pick-in-use */
  if (mine) return mine;
  if (inUse) return null; /* plant:pick-in-use-gone */
  if (pins.length && !inUse && teamListedMany(kept)) return null; /* plant:pick-many-none */
  return kept[0] || null;
}
/* The id of the catalog this desk has in use: the one the page took, else the one last handed to it. */
function inUseCatalogId() {
  const doc = catalogDocIn(loadedText || (typeof catalogJson === "string" ? catalogJson : ""));
  return doc && typeof doc.id === "string" ? doc.id : "";
}
/* True where more than one catalog id among `items` is one the team at the catalog folder lists. */
function teamListedMany(items) {
  const root = catalogFolder(), ids = new Set();
  for (const item of items) {
    const id = String(item.data && item.data.id || "");
    if (id && teamCovering(root, id)) ids.add(id);
  }
  return ids.size > 1;
}
/* The mirror is a cache, not a trust anchor. The desk keeps every read-time check it does today
   on what it reads from the mirror, as it does on the relay mirror. */
function readCatalog() {
  heedTeam();
  if (openedWith && openedBaseline === null) rememberOpenedBaseline();
  catalogWaitNewer = null;
  const found = [];
  let seenOk = false;
  for (const file of catalogPlaces()) {
    if (refusedByEngine(file)) continue;
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { refuseOpened(file, "read"); continue; }
    try {
      const peeked = catalogPeek(text);
      if (!isV2(peeked.data)) throw new Error("not an Etiuda catalog (format 2)");
      const wants = needsNewerEngine(peeked.data);
      if (wants) { waitNewer(file, wants, peeked.data); continue; } /* plant:catalog-needs-newer */
      found.push({ file: file, text: text, data: peeked.data });
      seenOk = true;
    } catch (e) {
      /* A key the team file has not brought is not a refusal, and it is not logged: the edition already open stays. */
      if (e && e.sealWait) continue;
      if (seenOk) continue;
      console.error("etiuda: " + file + " did not parse as a catalog - " + e.message);
      refuseOpened(file, "parse");
    }
  }
  if (catalogWaitNewer) console.log("etiuda: " + catalogWaitNewer.name + " needs Etiuda " + catalogWaitNewer.version + " or newer, so it is kept and not read");
  const chosen = pickEdition(found);
  if (!chosen) {
    if (sealAnyWaiting() || catalogWaitNewer) return typeof catalogJson === "string" ? catalogJson : null;
    /* An unprimed folder team is still being read. A clean slate here would tell the person there is no team. */
    let waiting = false;
    waiting = folderStillReading(); /* plant:prime-no-slate */
    if (waiting) {
      teamSay(shellWords().stillReading);
      return typeof catalogJson === "string" ? catalogJson : null;
    }
    console.log(!found.length ? "etiuda: no catalog found, so Etiuda starts as a clean slate"
      : teamListedMany(found) ? "etiuda: the team lists more than one catalog here, so none is chosen without being asked for"
      : "etiuda: no catalog here is signed by this desk's lead, so none is chosen without being asked for");
    catalogFrom = "";
    return null;
  }
  let opened;
  try { opened = catalogRead(chosen.text); }
  catch (e) {
    if (e && e.sealWait) return typeof catalogJson === "string" ? catalogJson : null;
    console.error("etiuda: " + chosen.file + " did not parse as a catalog - " + e.message);
    refuseOpened(chosen.file, "parse");
    catalogFrom = "";
    return null;
  }
  if (!isV2(opened.data)) {
    console.error("etiuda: " + chosen.file + " did not parse as a catalog - not an Etiuda catalog (format 2)");
    refuseOpened(chosen.file, "parse");
    catalogFrom = "";
    return null;
  }
  catalogFrom = chosen.file;
  recordRecentCatalog(chosen.file);
  historySoon(chosen.file, chosen.text);
  const cards = Array.isArray(opened.data.cards) ? opened.data.cards.length : 0;
  console.log("etiuda: catalog read from " + chosen.file + ", " + cards + " cards");
  return opened.json;
}

/* Spec 11.5's watch, so an edit beside the app reaches a running Etiuda without a restart. The
   FOLDERS, not the files: an editor saves by writing a temp file and renaming it over the old
   one, and a watch on the file that was there follows the replaced one into the bin. An event is
   only a prompt to read, and the payload is what decides, so a save that arrives as four events
   and a file rewritten with its own bytes are both free. */
/* A watch that stops, or never started, is armed again: a share dropped by the VPN or a sleep
   comes back without a word to this process, so the folder is asked again on a timer until it
   answers, and at once after a resume, and then read, which also keeps the statistics for the span. */
let catalogSettle = null, catalogWatchers = [], watchedFolder = "";
const watchSaid = new Map();                   // folder -> the refusal last logged for it
let folderSyncer = null;
function deskTrustChecks() {
  return {
    teamWhole,
    openSealed,
    catalogSigValid,
    branchSignedBytes,
    deskFileGenuine,
    handedTo,
    handedPath,
    forkSeen: folderForkSeen
  };
}
function folderSyncerRun(win) {
  const ft = folderTeamHere();
  if (!ft) {
    if (folderSyncer) { folderSyncer.stop(); folderSyncer = null; }
    return null;
  }
  /* A syncer that failed once stays off until the desk restarts, so the desk does not swing between share and mirror. */
  if (folderSyncerBroken) return null;
  const pin = teamPins[ft.team] || (teamJoin && teamJoin.team === ft.team && teamJoin.invite ? teamJoin.invite.lead : null);
  const mirror = folderMirrorOf(ft.team);
  try { fs.mkdirSync(mirror, { recursive: true }); } catch {}

  const opts = {
    team: ft.team,
    folder: ft.folder,
    mirror: mirror,
    pin: pin ? { keyId: pin.keyId, public: pin.public } : null,
    keyFor: (epoch) => teamKeyAt(ft.team, epoch),
    /* The floor heedTeam keeps, so a team file put back from an older rev never reaches the mirror, a restart included. */
    floor: (t, pub) => (teamRevSeen[t] || {})[pub], /* plant:s0b-syncer-floor */
    checks: deskTrustChecks(), /* plant:syncer-checks */
    /* A team file in the share that is not the lead's is left aside and the desk works on the last genuine one, so it says
       so through teamSay, once a line (the test architect's C1 to slice 2): the old refusal of a write was the only alarm a
       tampered share gave. The syncer's other lines go to the log as before. */
    logger: (line) => {
      const said = String(line || "");
      let toTeam = false;
      toTeam = /etiuda-team\.json is .*so nothing in it is used$/.test(said); /* plant:syncer-team-said */
      if (toTeam) teamSay(said.replace(/^etiuda: /, ""));
      else console.log(said);
    },
    onStatus: (status) => {
      settleFolder(status.folder, status.answers);
    },
    onChange: (change) => {
      if (change && change.primed) noteFolderPrimed(true);
      /* The desk window, where one exists. A syncer started with a window before that exists tells that window, so a page already up hears the listing. A running desk is unchanged. */
      const notify = (theWindow && !theWindow.isDestroyed()) ? theWindow
        : (win && typeof win.isDestroyed === "function" && !win.isDestroyed() ? win : null);
      if (notify && !notify.isDestroyed()) {
        if (change && change.primed && catalogFolder() !== watchedFolder && notify === theWindow) catalogFolderChanged();
        else catalogChanged(notify);
      }
    }
  };
  opts.onFail = (err) => {
    if (folderSyncer) { try { folderSyncer.stop(); } catch { /* already gone */ } folderSyncer = null; }
    folderSyncerFailed(err);
    noteFolderPrimed(false);
    if (theWindow && !theWindow.isDestroyed()) catalogChanged(theWindow);
  };
  try {
    folderSyncer = FolderSyncer().startFolderSyncer(opts);
  } catch (e) {
    folderSyncer = null;
    folderSyncerFailed(e); /* plant:syncer-start-said */
    noteFolderPrimed(false);
  }
  return folderSyncer;
}
function watchCatalog(win) {
  relayRun();
  folderSyncerRun(win);
  catalogWatchers.forEach(w => { try { w.close(); } catch { /* already gone */ } });
  catalogWatchers = [];
  watchedFolder = catalogFolder();
  clearTimeout(folderRetry);
  const dirs = [];
  catalogFolders().forEach(d => { if (dirs.indexOf(d) < 0) dirs.push(d); });
  for (const dir of dirs) {
    if (!folderAnswers(dir)) { retryFolder(FOLDER_RETRY_MS); continue; }
    try {
      const w = fs.watch(dir, (ev, name) => {
        if (name && String(name) === "desks" && dir === watchedFolder && !desksWatcher) watchDesks(win);
        if (name && String(name) === ASK_DIR && dir === watchedFolder && !asksWatcher) watchAsks(win);
        if (name && !isCatalogName(path.basename(String(name)))) return;
        clearTimeout(catalogSettle);
        catalogSettle = setTimeout(() => catalogChanged(win), 300);
      });
      w.on("error", e => {
        console.error("etiuda: the watch on " + dir + " stopped - " + e.message);
        if (dir === watchedFolder) folderDown = dir;
        retryFolder(FOLDER_SOON_MS);
      });
      catalogWatchers.push(w);
      watchSaid.delete(dir);
    } catch (e) {
      if (watchSaid.get(dir) !== e.message) console.error("etiuda: no watch on " + dir + " - " + e.message);
      watchSaid.set(dir, e.message);
      if (dir === watchedFolder) retryFolder(FOLDER_RETRY_MS);
    }
  }
  watchDesks(win);
  watchAsks(win);
  tryCatalogAsk(win);
  armShareStat(win);
}
/* fs.watch on a share drops events without an error. Catalog names are stat'd every 30s, the wait
   already used before asking a share again, and a change is read as a watch event. A folder on
   this computer's own disk is left to the watch, and one stat is in flight. A look still out when
   the ask's limit passes stays in flight until the read returns, and marks the folder down by the
   path a share that did not answer already uses. */
const SHARE_STAT_MS = 30000;
let shareStatTimer = null, shareStatBusy = false, shareStatOut = null, shareStatPrimed = false, shareStatGen = 0;
let shareStatSeen = new Map();
let shareStatPrime = null;
function shareDropsWatch(dir) { return !folderHost(dir).local; }
function shareStatStop() {
  if (shareStatTimer) clearInterval(shareStatTimer);
  shareStatTimer = null;
  shareStatBusy = false;
  shareStatPrimed = false;
  shareStatSeen = new Map();
  shareStatPrime = null;
  shareStatGen++;
}
function catalogStatRows(dir) {
  let timer = null;
  const slow = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("stat slow")), FOLDER_ASK_MS);
    if (timer.unref) timer.unref();
  });
  const work = fs.promises.readdir(dir).then(names => Promise.all(names.filter(isCatalogName).map(n => {
    const file = path.join(dir, n);
    return fs.promises.stat(file).then(st => ({ file: file, sig: st.mtimeMs + ":" + st.size }), () => null);
  }))).then(rows => {
    const out = new Map();
    (rows || []).forEach(row => { if (row) out.set(row.file, row.sig); });
    return out;
  });
  work.then(() => clearTimeout(timer), () => clearTimeout(timer));
  return { raced: Promise.race([work, slow]), settled: work };
}
/* raced answers at the ask's limit. settled is the read, and it alone ends the flight. */
function shareStatFlight(dir, gen, take, onFail) {
  const rows = catalogStatRows(dir);
  const flight = rows.settled;
  shareStatOut = flight;
  const clearOut = () => { if (shareStatOut === flight) shareStatOut = null; };
  flight.then(clearOut, clearOut);
  let slow = false;
  rows.settled.then(next => {
    if (gen !== shareStatGen) return;
    if (!slow) return;
    shareStatBusy = false;
    settleFolder(dir, true);
    take(next);
  }, () => {
    if (gen !== shareStatGen) return;
    if (slow) shareStatBusy = false;
  });
  return rows.raced.then(next => {
    if (gen !== shareStatGen) return false;
    take(next);
    shareStatBusy = false;
    return true;
  }, err => {
    if (gen !== shareStatGen) return false;
    if (err && err.message === "stat slow") {
      slow = true;
      if (!settleFolder(dir, false)) retryFolder(FOLDER_RETRY_MS);
      return false;
    }
    shareStatBusy = false;
    if (!slow && onFail) onFail();
    return false;
  });
}
function shareStatMoved(next) {
  if (!shareStatPrimed) return false;
  if (next.size !== shareStatSeen.size) return true;
  for (const [file, sig] of next) if (shareStatSeen.get(file) !== sig) return true;
  return false;
}
function shareStatApply(dir, next, win) {
  if (watchedFolder !== dir) return;
  const moved = shareStatMoved(next);
  shareStatSeen = next;
  shareStatPrimed = true;
  if (!moved) return; /* plant:f2-share-quiet */
  clearTimeout(catalogSettle);
  catalogSettle = setTimeout(() => catalogChanged(win), 300); /* plant:f2-share-stat */
}
function shareStatTick(win) {
  if (shareStatBusy || shareStatOut) return Promise.resolve(false); /* plant:f2-share-hung */
  const dir = watchedFolder;
  if (!dir || !shareDropsWatch(dir) || !folderAnswers(dir)) return Promise.resolve(false);
  const gen = ++shareStatGen;
  shareStatBusy = true;
  return shareStatFlight(dir, gen, next => shareStatApply(dir, next, win));
}
function armShareStat(win) {
  shareStatStop();
  const dir = watchedFolder;
  if (!dir || !shareDropsWatch(dir) || !folderAnswers(dir)) return;
  shareStatTimer = setInterval(() => { shareStatTick(win); }, SHARE_STAT_MS);
  if (shareStatTimer && shareStatTimer.unref) shareStatTimer.unref();
  if (shareStatOut) return;
  const gen = ++shareStatGen;
  shareStatBusy = true;
  shareStatPrime = shareStatFlight(dir, gen, next => {
    if (watchedFolder !== dir || shareStatPrimed) return;
    shareStatSeen = next;
    shareStatPrimed = true;
  }, () => { if (watchedFolder === dir && !shareStatPrimed) shareStatPrimed = true; });
}
/* A COLLEAGUE'S FILE CHANGES ONE FOLDER DOWN, in desks/<id>/, where the folder's own watch does not reach, so desks/ has a
   watch of its own over its subfolders alone. With no desks/ yet there is none, and the folder's watch arms it when one appears. */
let desksWatcher = null;
function watchDesks(win) {
  if (desksWatcher) { try { desksWatcher.close(); } catch { /* already gone */ } desksWatcher = null; }
  if (!folderAnswers(catalogFolder())) return;
  try {
    const w = fs.watch(path.join(catalogFolder(), "desks"), { recursive: true }, (ev, name) => {
      if (name && !/\.ec$/i.test(path.basename(String(name)))) return;
      clearTimeout(catalogSettle);
      catalogSettle = setTimeout(() => catalogChanged(win), 300);
    });
    w.on("error", () => { try { w.close(); } catch { /* already gone */ } if (desksWatcher === w) desksWatcher = null; });
    desksWatcher = w;
  } catch { desksWatcher = null; }
}

/* THE CATALOG FOLDER MAY BE A SHARE THAT DOES NOT ANSWER, and every read of it here is
   synchronous: one call into an unreachable share waits out the network's own timeout with the
   window and the page frozen behind it. So it is asked first by an asynchronous stat with a time
   limit, and read as empty and left unwatched until one comes back. One ask in flight at a time.
   A watch that stops and a resume from sleep both leave it unread until it has answered again. */
const FOLDER_ASK_MS = 3000, FOLDER_RETRY_MS = 30000, FOLDER_SOON_MS = 1000, FOLDER_PRIME_MS = 4000;
let folderDown = "", folderAsking = null, folderRetry = null, folderSaidDown = "";
let folderPrimeResolve = null;
/* A known folder team's share stays quiet on this thread until the mirror has taken one answered listing.
   Callers then read the mirror, or nothing. A join still reads the invitation folder: nothing is joined yet.
   The syncer that cannot start keeps the share as its fallback, the read folderSyncerFailed already chooses. */
/* A failed syncer reads the share. These gates stay off, or a desk whose worker failed waits for a listing that will not come. */
function folderSyncerReadsShare() {
  return !!folderSyncerBroken; /* plant:broken-reads-share */
}
function shareUnread(dir) {
  if (!dir || folderSyncerReadsShare()) return false;
  const ft = folderTeamHere();
  if (!ft || ft.joining) return false;
  if (path.resolve(String(dir)) !== path.resolve(ft.folder)) return false;
  let primed = false;
  try { primed = fs.existsSync(path.join(folderMirrorOf(ft.team), FolderSyncer().PRIMED_NAME)); } catch { primed = false; }
  return !primed; /* plant:prime-share-quiet */
}
function folderStillReading() {
  if (folderSyncerReadsShare()) return false;
  const ft = folderTeamHere();
  if (!ft || ft.joining) return false;
  try { if (fs.existsSync(path.join(folderMirrorOf(ft.team), FolderSyncer().PRIMED_NAME))) return false; } catch { return false; }
  return true;
}
function folderAnswers(dir) {
  if (shareUnread(dir)) return false;
  return !folderDown || dir !== folderDown;
}
function noteFolderPrimed(done) {
  const settle = folderPrimeResolve;
  folderPrimeResolve = null;
  if (settle) settle(done === true);
}
/* The boot waits out the first listing. A press does not start a syncer from here: only this wait, and the looks that
   already start one, do. Past the bound the desk says it is still reading and the listing arrives when it can. */
function awaitFolderPrime() {
  const ft = folderTeamHere();
  if (!ft || ft.joining || folderSyncerReadsShare() || !folderStillReading()) return Promise.resolve(false);
  folderSyncerRun(theWindow);
  return new Promise(resolve => {
    const timer = setTimeout(() => { folderPrimeResolve = null; resolve(false); }, FOLDER_PRIME_MS);
    if (timer.unref) timer.unref();
    folderPrimeResolve = (ok) => { clearTimeout(timer); resolve(ok === true); };
  });
}
function fileAnswers(file) { return folderAnswers(path.dirname(file)); }
/* ONLY A STAT THAT SUCCEEDS ANSWERS. A share that has just timed out fails every call at once for
   a while and then waits out the timeout again, so a failure is no proof that a read will return.
   A folder that is not there answers through its parent, which is the disk answering. */
function statAnswers(dir) {
  const up = path.dirname(dir);
  return fs.promises.stat(dir).then(() => true, e => ((e && (e.code === "ENOENT" || e.code === "ENOTDIR") && up !== dir)
    ? fs.promises.stat(up).then(() => true, () => false) : false));
}
function askFolder(dir) {
  if (folderAsking && folderAsking.dir === dir) return folderAsking.answer;
  let timer = null;
  const settled = statAnswers(dir);
  const answer = Promise.race([settled, new Promise(r => { timer = setTimeout(() => r(false), FOLDER_ASK_MS); })])
    .then(ok => { clearTimeout(timer); return ok; });
  const asking = { dir: dir, answer: answer };
  folderAsking = asking;
  settled.then(() => { if (folderAsking === asking) folderAsking = null; });
  return answer;
}
/* Records what an ask found, said in the log once per change, and whether it answered. */
function settleFolder(dir, ok) {
  const current = catalogFolder();
  const raw = rawCatalogFolder();
  if (path.resolve(dir) !== path.resolve(current) && path.resolve(dir) !== path.resolve(raw)) return false;
  if (!ok && folderSaidDown !== dir)
    console.error("etiuda: the catalog folder " + dir + " did not answer, so it is read as empty until it does");
  if (ok && folderSaidDown === dir) console.log("etiuda: the catalog folder " + dir + " answers again");
  folderDown = ok ? "" : dir;
  folderSaidDown = folderDown;
  return ok;
}
function armFolder(win) {
  clearTimeout(folderRetry);
  const ft = folderTeamHere();
  if (ft) {
    folderSyncerRun(win);
    if (!win || win.isDestroyed()) return;
    watchCatalog(win);
    catalogChanged(win);
    return;
  }
  const dir = catalogFolder();
  return askFolder(dir).then(ok => {
    if (!settleFolder(dir, ok)) { if (dir === catalogFolder()) retryFolder(FOLDER_RETRY_MS); return; }
    if (!win || win.isDestroyed()) return;
    watchCatalog(win);
    catalogChanged(win);
  });
}
/* After a sleep the folder is asked again before it is read. On a folder team that is the share, never the mirror,
   which is on this computer and answers; the syncer is kicked and says how the share answers. */
function resumeFromSleep(win) {
  const mirror = folderMirrorHere();
  const ft = mirror ? folderTeamHere() : null;
  folderDown = catalogFolder();
  if (ft && path.resolve(folderDown) === path.resolve(mirror)) folderDown = ft.folder; /* plant:resume-mirror */
  armFolder(win);
}
function retryFolder(ms) {
  clearTimeout(folderRetry);
  folderRetry = setTimeout(() => armFolder(theWindow), ms);
}

/* THE WATCH FOLLOWS THE SETTING, and the desk's own write is where this hears of a change: the
   folder is an engine key, so Settings changes it exactly as it changes the theme. Pointing
   Etiuda at a share would otherwise be a setting that does nothing until the next launch. The
   re-read is deferred because this runs inside a SYNCHRONOUS save the renderer is still waiting
   on, and the offer that may follow belongs after that call has returned. */
function catalogFolderChanged() {
  if (!theWindow || theWindow.isDestroyed()) return;
  /* A join taken or finished, or another folder: the seat follows, after the synchronous save has returned. */
  setImmediate(() => signinFlush());
  if (catalogFolder() === watchedFolder) return;
  const win = theWindow;
  /* A different folder is a different team file. A wait begun for the one before must not hide a failure here. */
  sealWaitStop();
  folderSyncerRun(win);
  console.log("etiuda: catalog folder " + catalogFolder());
  // Somebody has just picked this folder, so it is read as answering while it is asked.
  folderDown = "";
  watchedFolder = catalogFolder();
  armFolder(win);
}

/* True where, with a lead pinned, `text` is another catalog than the one in use, listed or not. */
function otherTeamCatalog(text) {
  const doc = catalogDocIn(text), inUse = inUseCatalogId();
  const id = doc && typeof doc.id === "string" ? doc.id : "";
  return pinnedLeadPubs().length > 0 && !!id && !!inUse && id !== inUse;
}
/* The engine is OFFERED the new file and never given it: replacing a catalog under somebody
   mid-chat is the one thing the offer dialog exists to prevent, and this is the third channel
   into it rather than a second way of loading. A file that stops parsing leaves what is loaded
   exactly where it is, which is what the read below already does. */
/* THE TRAP: the page repaints its Library list off the message this sends, so a file that does
   not change which catalog would open never reaches it. Since sampleLast() that includes the
   sample arriving in a folder that already holds one, and the list shows it at the next repaint
   rather than the moment it lands. Seeding happens before there is a window, so the case is a
   copy made by hand under an open Library. */
function catalogChanged(win) {
  sealWaitWin = win;
  releaseInUse();
  tryHeldUse();
  resealHeld(win);
  const fromWas = catalogFrom;
  const now = readCatalog();
  sayNewer(win);
  /* The owed eject is in the envelope, which the read above loads on a fresh run. */
  if (ejectOwed) tryHeldUse();
  tryLiveStats(win);
  tryHeldBranches(); /* plant:changed-held */
  sendListing(win, false);
  sendJoin(win);
  offerNewerLead(win);
  if (now === catalogJson) return;
  /* Below a rev already handed to the page: not offered, and it does not replace the one in memory. */
  if (belowCatalogRev(now)) return;
  // Nor, with a lead pinned, bytes that lead did not sign: this send is unasked, the file this launch was opened with included.
  if (now && !unsolicitedLeadText(now)) return;
  if (now && otherTeamCatalog(now)) { catalogFrom = fromWas; return; } /* plant:changed-in-use */
  catalogJson = now;
  keepCatalogRev(now);
  if (!now || !win || win.isDestroyed()) return;
  noteHanded(now, sourceOfFile(catalogFrom));
  console.log("etiuda: the catalog file changed, and the window has been offered it");
  win.webContents.send("etiuda:catalog-file", now, path.basename(catalogFrom), folderShown(catalogFrom),
    false, "", isBuiltIn(catalogFrom));
}

/* OFFERED, never loaded, like every other route to a catalog: opening one while somebody is
   mid-chat asks first. Goes through the watch's channel, which already ends in the offer dialog,
   and takes catalogFrom with it so About and the offer's own line name the file that was opened
   rather than the one the folder holds. */
/* A REFUSAL IS ANSWERED TOO, as an empty text with the reason in the fifth argument: the page
   owns the words, and a double-click that only brings the window forward reads as nothing. */
function offerFile(win, file) {
  const refuse = (why, code) => {
    if (win && !win.isDestroyed())
      win.webContents.send("etiuda:catalog-file", "", path.basename(file), path.dirname(file), true, why, false, "", code || "");
  };
  let text;
  try { text = fs.readFileSync(file, "utf8"); }
  catch (e) { console.error("etiuda: " + file + " could not be read - " + e.message); refuse("read", readOsCode(e)); return; }
  if (!text) { refuse("read", "empty"); return; }
  try {
    const { json, data } = catalogRead(text);
    if (!isV2(data)) throw new Error("not an Etiuda catalog (format 2)");
    const wants = needsNewerEngine(data);
    if (wants) { console.error("etiuda: " + file + " needs Etiuda " + wants + " or newer, so it is kept and not read"); refuse("newer " + wants); return; }
    /* The agent opened this file. Whatever its rev, its signer or its signature, it is offered,
       and no mark moves until the page says the agent took it (etiuda:catalog-taken). */
    openedWith = file;
    catalogJson = json;
    handAsked(json, "");
    noteHanded(json, "opened");
    catalogFrom = file;
    recordRecentCatalog(file);
    offeredLead = null;
    rememberOpenedBaseline();
    historySoon(file, text);
    const cards = Array.isArray(data.cards) ? data.cards.length : 0;
    const note = rosterNoteOf(data);
    console.log("etiuda: opened with " + file + ", " + cards + " cards");
    /* The fourth argument says somebody ASKED for this file, which the watch's own send does
       not: a double-click outranks a remembered refusal and is answered either way. The eighth,
       where the file's desk is off the roster, is the note. It follows the reason and the shipped
       flag, so a refusal's reason stays the fifth argument. */
    if (win && !win.isDestroyed()) {
      if (note)
        win.webContents.send("etiuda:catalog-file", json, path.basename(file), path.dirname(file), true, "", false, note);
      else
        win.webContents.send("etiuda:catalog-file", json, path.basename(file), path.dirname(file), true);
    }
  } catch (e) {
    console.error("etiuda: " + file + " did not parse as a catalog - " + e.message);
    refuse("parse");
  }
}

/* The file the agent opened stays the one read until the agent takes a newer edition the lead
   signed into the folder, or leaves this file. The offer is the watch's own send, so the page
   asks with the words it already uses for a catalog that arrived unasked. */
function releaseOpened() {
  if (!openedWith) return;
  openedWith = "";
  openedBaseline = null;
  offeredLead = null;
  catalogJson = undefined;
  catalogFrom = "";
}
function rememberOpenedBaseline() {
  const base = new Map();
  openedBaseline = base;
  if (!openedWith) return;
  const root = catalogFolder();
  const asked = path.resolve(openedWith);
  heedTeam();
  for (const file of ecFilesIn(root)) {
    if (path.resolve(file) === asked) continue;
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    let peeked;
    try { peeked = catalogPeek(text); } catch { continue; }
    if (!isV2(peeked.data) || !catalogLeadOk(peeked.data)) continue;
    const id = String(peeked.data.id || "");
    if (!id) continue;
    const rev = editionRev(peeked.data);
    const had = base.get(id);
    if (had === undefined || rev > had) base.set(id, rev);
  }
}
function openedCatalogId() {
  const doc = catalogDocIn(catalogJson || "");
  return doc && typeof doc.id === "string" ? doc.id : "";
}
function leadEditionBeside() {
  if (!openedWith || !pinnedLeadPubs().length || openedBaseline === null) return null;
  const root = catalogFolder();
  const asked = path.resolve(openedWith);
  const openedId = openedCatalogId();
  const openedRev = editionRev(catalogDocIn(catalogJson || ""));
  let best = null;
  for (const file of ecFilesIn(root)) {
    if (path.resolve(file) === asked) continue;
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    let peeked;
    try { peeked = catalogPeek(text); } catch { continue; }
    if (!isV2(peeked.data) || !catalogLeadOk(peeked.data)) continue;
    const id = String(peeked.data.id || "");
    if (!id) continue;
    const same = !!openedId && id === openedId;
    let other = d => !!d;
    other = d => !!d && new Set(d.catalogs.map(String)).size === 1; /* plant:beside-one */
    if (!same && !other(teamCovering(root, id))) continue;
    const rev = editionRev(peeked.data);
    const floor = openedBaseline.has(id) ? openedBaseline.get(id) : -1;
    if (!(rev > floor)) continue;
    if (same && !(rev > openedRev)) continue;
    if (!best || rev > editionRev(best.data)) best = { file: file, text: text, data: peeked.data };
  }
  return best;
}
function offerNewerLead(win) {
  if (!openedWith || !win || win.isDestroyed()) return;
  if (openedBaseline === null) rememberOpenedBaseline();
  const item = leadEditionBeside();
  if (!item) return;
  let opened;
  try { opened = catalogRead(item.text); } catch { return; }
  if (!isV2(opened.data) || needsNewerEngine(opened.data) || !unsolicitedLeadText(opened.json)) return;
  let pin = "";
  try { pin = signedSha(opened.data); } catch { return; }
  if (offeredLead && offeredLead.pin === pin) return;
  offeredLead = { file: item.file, text: opened.json, pin: pin };
  keepCatalogRev(opened.json);
  handAsked(opened.json, "");
  noteHanded(opened.json, sourceOfFile(item.file));
  console.log("etiuda: a newer edition the lead signed is in the folder, and the window has been offered it");
  win.webContents.send("etiuda:catalog-file", opened.json, path.basename(item.file), folderShown(item.file),
    false, "", isBuiltIn(item.file));
}
function noteOpenedTaken(pin, text, win) {
  if (!openedWith || !pin) return;
  if (offeredLead && pin === offeredLead.pin) {
    const file = offeredLead.file, body = offeredLead.text;
    releaseOpened();
    catalogFrom = file;
    catalogJson = body;
    recordRecentCatalog(file);
    return;
  }
  let mine = "";
  try {
    const doc = catalogDocIn(catalogJson || "");
    mine = doc ? signedSha(doc) : "";
  } catch { mine = ""; }
  if (text && mine && pin !== mine) { releaseOpened(); return; }
  if (mine && pin === mine && win && !win.isDestroyed()) {
    offeredLead = null;
    offerNewerLead(win);
  }
}

/* The preload asks for this before the first page script runs, so the handler is registered at
   load time rather than after the app is ready. */
let catalogJson;
ipcMain.on("etiuda:catalog", (e) => {
  if (!fromEngine(e)) { e.returnValue = null; return; }
  if (catalogJson === undefined) catalogJson = readCatalog();
  /* A file this launch was opened with is the agent asking: a lower rev of it is still handed over, and its mark waits for the yes.
     One whose desk is off the roster is not handed back here. The offer, which carries the note, is the hand. */
  if (openedWith && catalogFrom === openedWith) {
    handAsked(catalogJson, "");
    noteHanded(catalogJson, "opened");
    e.returnValue = rosterNoteText(catalogJson) ? null : catalogJson;
    return;
  }
  if (belowCatalogRev(catalogJson)) { e.returnValue = null; return; }
  keepCatalogRev(catalogJson);
  if (catalogJson) noteHanded(catalogJson, sourceOfFile(catalogFrom));
  e.returnValue = catalogJson;
});
/* WHAT THE AGENT OPENED ON PURPOSE, handed and not yet taken, by the signed hash the page pins a catalog by. Its mark, the
   catalog's or a colleague's file's (`who`), rises only when the page says the agent took those bytes, and only to them;
   a pin this shell never handed so raises nothing. The oldest goes past HANDED_ASKED_MAX. */
const handedAsked = new Map(), HANDED_ASKED_MAX = 32;
/* Bytes handed to the page for the catalog in use, kept after the take so a later ask can still seal them.
   Separate from handedAsked: a boot or a watch raises its mark at once, and must not be treated as an ask. */
const handedUse = new Map();
let inUseKept = null, catalogAskIds = [], heldInUse = null, heldAnswer = null, ejectOwed = null;
let loadedText = "", asksWatcher = null, askSettle = null, lastCatalogCopy = "";
let recentCatalogs = [];
const RECENT_CATALOGS_MAX = 32;
function recordRecentCatalog(file) {
  if (!file || typeof file !== "string" || isBuiltIn(file)) return;
  let resolved;
  try { resolved = path.resolve(file); } catch { return; }
  if (deskKeys === undefined) {
    try { readDesk(); } catch { /* start fresh */ }
  }
  const next = [resolved].concat(recentCatalogs.filter(f => f !== resolved));
  recentCatalogs = next.slice(0, RECENT_CATALOGS_MAX);
  try { persistDeskEnvelope(); } catch { /* envelope write best effort */ }
  try { syncJumpList(); } catch { /* jump list optional */ }
}
const IN_USE_KIND = "etiuda-in-use", IN_USE_STEM = "in-use";
/* The catalog text this desk loaded, beside its own desk file. The page keeps the runtime copy,
   not the format-2 document, and the folder's file is not always the one in use, so a restart
   would otherwise have the pin and not the text. Written only once in-use.ec names it. */
const LOADED_CATALOG_FILE = "catalog-loaded.txt";
const LOADED_CATALOG_MAX = 16 * 1024 * 1024;
const ASK_DIR = "catalog-asks", ASK_KIND = "etiuda-catalog-ask", ASK_PREFIX = "etiuda-catalog-ask\n";
const ANSWER_KIND = "etiuda-catalog-answer", ANSWER_NAME = "catalog-answer.ec";
const ASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const PIN_RE = /^sha256:[0-9a-f]{64}$/;
const ASK_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
/* An ask of format 2 is made under the lead's switch (teamContentOf), and only it is answered with a catalog the team does not
   list; a desk older than the switch takes format 1 alone, so it answers no such ask. */
const ASK_CONTENT_FORMAT = 2;
/* An off-roster file this launch opened, already offered, so a later load of the page does not offer it again. */
const openedOfferSent = new Set();
function handAsked(text, who) {
  const doc = catalogDocIn(text);
  if (!doc || doc.kind !== "etiuda-catalog") return;
  let pin = "";
  try { pin = signedSha(doc); } catch { return; }
  handedAsked.delete(pin);
  handedAsked.set(pin, { text: String(text), who: who || "" });
  while (handedAsked.size > HANDED_ASKED_MAX) handedAsked.delete(handedAsked.keys().next().value);
}
/* The file this launch was opened with, offered once the page can hear it, and only when its desk is off the roster.
   The boot handed nothing back for that file; this send is the hand, and it carries the note. A second call, or one
   after the agent has taken the file, sends nothing. */
function handOpenedOffRoster(win) {
  if (!win || win.isDestroyed() || !openedWith || catalogFrom !== openedWith || !catalogJson) return;
  const note = rosterNoteText(catalogJson);
  if (!note) return;
  let pin = "";
  try { pin = signedSha(catalogDocIn(catalogJson)); } catch { return; }
  if (!handedAsked.has(pin) || openedOfferSent.has(pin)) return;
  openedOfferSent.add(pin);
  win.webContents.send("etiuda:catalog-file", catalogJson, path.basename(catalogFrom), folderShown(catalogFrom), true, "", false, note);
}
ipcMain.on("etiuda:catalog-taken", (e, pin, text) => {
  if (!fromEngine(e)) return;
  const key = String(pin || "");
  const got = handedAsked.get(key);
  if (got) {
    handedAsked.delete(key);
    if (got.who) readRevFloor(got.text, got.who, false);
    else keepCatalogRev(got.text);
  }
  /* The page sends the catalog it holds with the pin. The two have to be the same catalog, and
     then those bytes are a hand even where this shell never offered them. A pin the text does not
     back writes nothing. A pin with no text is still only a hand this shell already made. */
  const backed = text == null ? "" : String(text);
  if (backed) {
    let hashed = "";
    try {
      const doc = catalogDocIn(backed);
      hashed = doc && doc.kind === "etiuda-catalog" ? signedSha(doc) : "";
    } catch { hashed = ""; }
    if (hashed !== key) return;
    if (!handedUse.has(key)) noteHanded(backed, sourceForText(backed));
  }
  let win = null;
  try { win = BrowserWindow.fromWebContents(e.sender); } catch { win = null; }
  writeInUse(key, win);
  noteOpenedTaken(key, backed, win);
});
/* The page put the catalog down. The lead, the team pin and the desk's key stay. */
/* A SYNC SEND WAITS FOR ITS ANSWER FOR EVER, so this answers on every path: without one the page's thread stops inside the
   click and the window never comes back (Max, 2026-11-04 11:44). Answered last, so the shell has dropped its copy first. */
ipcMain.on("etiuda:catalog-eject", (e) => {
  try { if (fromEngine(e)) ejectLoadedCatalog(); }
  finally { e.returnValue = null; }
});
/* THE ENGINE REFUSED THE FILE IT WAS HANDED, and names it. Answered with the next file this
   would read, in the shape the host answer gives the first, or null where there is none. */
ipcMain.on("etiuda:catalog-refused", (e, name) => {
  if (!fromEngine(e) || !catalogFrom || path.basename(catalogFrom) !== String(name || "")) {
    e.returnValue = null;
    return;
  }
  console.error("etiuda: the engine refused " + catalogFrom + ", so it is passed over until it is saved again");
  engineRefused.set(catalogFrom, catalogMtime());
  if (openedWith === catalogFrom) openedWith = "";
  const next = readCatalog();
  if (belowCatalogRev(next)) { e.returnValue = null; return; }
  catalogJson = next;
  keepCatalogRev(catalogJson);
  if (catalogJson) noteHanded(catalogJson, sourceOfFile(catalogFrom));
  e.returnValue = catalogJson ? { json: catalogJson, file: path.basename(catalogFrom), in: folderShown(catalogFrom),
                                  builtIn: isBuiltIn(catalogFrom), mtime: catalogMtime() } : null;
});

/* ---- the desk, kept in a file rather than in the renderer's localStorage -------------------
   Spec 11.4. The renderer has a localStorage like any page, and it is the wrong home for a
   desk: it is a leveldb inside the app's profile that only Chromium can open, that Chromium may
   discard, and that a person can neither read nor copy to another machine. This is one JSON
   file in the user-data folder, which an uninstall does not touch, so a reinstall finds the
   desk where it left it.

   The envelope is a schema and a date around the engine's own flat map of keys, which is what
   makes a migration possible at all: a bare map has no version to migrate from. There is one
   schema so far and therefore no migration, so what is written here is the engine that runs
   them, proved on a table of its own in tests/desk.js rather than on an empty one. */
const DESK_KIND = "etiuda-desk";
const DESK_SCHEMA = 1;
const DESK_BACKUPS = 3;
const DESK_MIGRATIONS = {};
/* One random id per desk, in the envelope, not the key map. It leaves the machine only
   as a field of the statistics file, on Studio's request. */
function mintDeskId() { return "d" + crypto.randomBytes(16).toString("hex"); }
let theDeskId = "";
/* The span a verified stats-span.json set, and how often the sealed answer is written again. A count
   change inside STATS_PACE_MS is held; a span change, midnight, and closing are not. statsClock is the
   test's clock, and while it is set the real midnight timer stays unarmed. */
const STATS_PACE_MS = 120000;
let statsSpan = "";
let statsPeriod = null;
let statsHeld = null;
let statsNoBoxSaid = "";
let statsWroteKey = "";
let statsLastWrite = 0;
let statsClock = null;
let statsMidnightTimer = null;
let statsWin = null;
function ensureDeskId() {
  if (theDeskId || deskNewer) return theDeskId;
  theDeskId = mintDeskId();
  return theDeskId;
}
const DESK_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const DESK_ID_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
function isSafeDeskId(id) {
  const s = String(id || "");
  if (!s || s.indexOf("\0") >= 0) return false;
  if (/[\\/:]/.test(s)) return false;
  if (s !== path.basename(s)) return false;
  if (DESK_ID_RESERVED.test(s)) return false;
  return DESK_ID_RE.test(s);
}
function channelHash(obj) {
  const copy = {};
  Object.keys(obj).forEach(k => { if (k !== "hash" && k !== "sig") copy[k] = obj[k]; });
  let h = 5381; const s = canonJson(copy);
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  return "djb2:" + h.toString(16);
}
function channelYmd(d) {
  const x = d || new Date(), p = v => String(v).padStart(2, "0");
  return x.getFullYear() + "-" + p(x.getMonth() + 1) + "-" + p(x.getDate());
}
function channelStamp(d) {
  const x = d || new Date(), p = v => String(v).padStart(2, "0");
  return channelYmd(x) + " " + p(x.getHours()) + ":" + p(x.getMinutes());
}
function ymdOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
/* A SPAN FILE IS A FEW SHORT FIELDS, and the share is anybody's to write: a larger or deeper file
   is refused before any signature check walks it. Said once per file, in the log. The signature
   itself is spanGenuine's, against the lead this desk joined under. Shape only, so a caller with
   no key can still tell a document from a nest. */
function spanDocument(text) {
  const raw = String(text || "");
  const refuse = (why) => {
    if (spanDocument.said !== raw) console.log("etiuda: the span file is not read: " + why);
    spanDocument.said = raw;
    return null;
  };
  if (raw.length > 65536) return refuse("it is larger than any span");
  let data;
  try { data = JSON.parse(raw.replace(/^\uFEFF/, "").trim()); } catch { return null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const walk = [[data, 1]];
  while (walk.length) {
    const [v, depth] = walk.pop();
    if (v === null || typeof v !== "object") continue;
    if (depth > 16) return refuse("it nests deeper than any span");
    Object.keys(v).forEach(k => walk.push([v[k], depth + 1]));
  }
  if (+data.format !== 1 || data.kind !== "etiuda-stats-span") return null;
  if (!spanShape(data.span)) return null;
  const sig = data.sig;
  if (!sig || typeof sig !== "object" || Array.isArray(sig)) return null;
  if (sig.alg !== "Ed25519" || typeof sig.keyId !== "string" || !sig.keyId) return null;
  if (!/^[0-9a-f]{128}$/.test(String(sig.value || ""))) return null;
  return data;
}
function deskEnvelopeBody(keysText) {
  ensureDeskId();
  return '{"kind":"' + DESK_KIND + '","schema":' + DESK_SCHEMA
    + ',"app":' + JSON.stringify(app.getVersion())
    + ',"saved":' + JSON.stringify(new Date().toISOString())
    + (theDeskId ? ',"desk":' + JSON.stringify(theDeskId) : "")
    + (deskBranch ? ',"branch":' + JSON.stringify(deskBranch) : "")
    + (deskBranchOld.length ? ',"branchOld":' + JSON.stringify(deskBranchOld) : "")
    + (Object.keys(branchRevs).length ? ',"branchRevs":' + JSON.stringify(branchRevs) : "")
    + (Object.keys(readRevs).length ? ',"readRevs":' + JSON.stringify(readRevs) : "")
    + (Object.keys(catalogRevs).length ? ',"catalogRevs":' + JSON.stringify(catalogRevs) : "")
    + (Object.keys(teamPins).length ? ',"teamPins":' + JSON.stringify(teamPins) : "")
    + (Object.keys(teamKeys).length ? ',"teamKeys":' + JSON.stringify(teamKeys) : "")
    + (Object.keys(teamEpochSeen).length ? ',"teamEpochSeen":' + JSON.stringify(teamEpochSeen) : "")
    + (Object.keys(teamRoster).length ? ',"teamRoster":' + JSON.stringify(teamRoster) : "")
    + (Object.keys(teamRevSeen).length ? ',"teamRevSeen":' + JSON.stringify(teamRevSeen) : "")
    + (Object.keys(teamChannel).length ? ',"teamChannel":' + JSON.stringify(teamChannel) : "")
    + (Object.keys(teamPinFrom).length ? ',"teamPinFrom":' + JSON.stringify(teamPinFrom) : "")
    + (Object.keys(teamShown).length ? ',"teamShown":' + JSON.stringify(teamShown) : "")
    + (teamOpened.size ? ',"teamOpened":' + JSON.stringify(Array.from(teamOpened)) : "")
    + (teamSeen.size ? ',"teamSeen":' + JSON.stringify(Array.from(teamSeen)) : "")
    + (teamBarred.size ? ',"teamBarred":' + JSON.stringify(Array.from(teamBarred)) : "")
    + (teamHeldOut.size ? ',"teamHeldOut":' + JSON.stringify(Array.from(teamHeldOut)) : "")
    + (Object.keys(teamLeft).length ? ',"teamLeft":' + JSON.stringify(teamLeft) : "")
    + (Object.keys(teamLapseSeen).length ? ',"teamLapseSeen":' + JSON.stringify(teamLapseSeen) : "")
    + (Object.keys(teamContentSaid).length ? ',"teamContentSaid":' + JSON.stringify(teamContentSaid) : "")
    + (catalogPrivate.size ? ',"catalogPrivate":' + JSON.stringify(Array.from(catalogPrivate).sort()) : "")
    + (Object.keys(catalogLineage).length ? ',"catalogLineage":' + JSON.stringify(catalogLineage) : "")
    + (Object.keys(catalogRoots).length ? ',"catalogRoots":' + JSON.stringify(catalogRoots) : "")
    + (answerKept ? ',"answerKept":' + JSON.stringify(answerKept) : "")
    + (Object.keys(teamRelayGone).length ? ',"teamRelayGone":' + JSON.stringify(teamRelayGone) : "")
    + (Object.keys(teamWas).length ? ',"teamWas":' + JSON.stringify(teamWas) : "")
    + (Object.keys(teamForks).length ? ',"teamForks":' + JSON.stringify(teamForks) : "")
    + (teamJoin ? ',"teamJoin":' + JSON.stringify(teamJoin) : "")
    + (inUseKept ? ',"inUse":' + JSON.stringify(inUseKept) : "")
    + (ejectOwed ? ',"ejectOwed":' + JSON.stringify(ejectOwed) : "")
    + (catalogAskIds.length ? ',"catalogAsks":' + JSON.stringify(catalogAskIds) : "")
    + (inUseN > 0 ? ',"inUseN":' + inUseN : "")
    + (Object.keys(teamPauseSeen).length ? ',"teamPauseSeen":' + JSON.stringify(teamPauseSeen) : "")
    + (Object.keys(teamNeedsFolder).length ? ',"teamNeedsFolder":' + JSON.stringify(teamNeedsFolder) : "")
    + (recentCatalogs.length ? ',"recentCatalogs":' + JSON.stringify(recentCatalogs) : "")
    + (deskRefused.length ? ',"refused":' + JSON.stringify(deskRefused) : "")
    + ',"keys":' + keysText + "}";
}
/* A RENAME OVER A FILE ANOTHER PROGRAM HAS OPEN IS REFUSED ON WINDOWS for as long as it holds
   it, and a virus scanner or a sync client opening a file just written is the ordinary case, so
   the rename is asked again for a few seconds (60 retries of 50 ms) before the refusal stands. */
const RENAME_BUSY = ["EPERM", "EACCES", "EBUSY"];
const RENAME_RETRIES = 60;
const RENAME_WAIT_MS = 50;
function renamePatiently(from, to) {
  for (let i = 1; ; i++) {
    try { fs.renameSync(from, to); return; }
    catch (e) {
      if (i >= RENAME_RETRIES || RENAME_BUSY.indexOf(e.code) < 0) throw e; /* plant:rename-retries */
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_WAIT_MS);
    }
  }
}
async function renamePatientlyAsync(from, to) {
  for (let i = 1; ; i++) {
    try { await fs.promises.rename(from, to); return; }
    catch (e) {
      if (i >= RENAME_RETRIES || RENAME_BUSY.indexOf(e.code) < 0) throw e; /* plant:rename-retries */
      await new Promise(r => setTimeout(r, RENAME_WAIT_MS));
    }
  }
}
/* A temporary name no other writer can have: this process, a count of its own writes, and random bytes. The shell loads
   no module it did not have (pick 5c), so no thread id: the count and the random part already set two writers apart. */
let tempCount = 0;
function uniqueTempPath(file) {
  tempCount = (tempCount + 1) % 1e9;
  const rand = crypto.randomBytes(6).toString("hex");
  return file + "." + process.pid + "." + tempCount + "." + rand + ".tmp"; /* plant:unique-temp */
}
/* Temp file then rename, so a failed write never leaves half a file under the name, and a
   refused one leaves no temp file behind it. The temp name is unique per write to prevent collisions
   on shared folders, fsynced to disk before the rename, and unlinked on every failure path.
   Throws what stopped it. */
function writeReplacing(file, text) {
  const tmp = uniqueTempPath(file);
  try {
    fs.writeFileSync(tmp, text, "utf8");
    const fd = fs.openSync(tmp, "r+");
    try {
      fs.fsyncSync(fd); /* plant:write-fsync */
    } finally {
      fs.closeSync(fd);
    }
    renamePatiently(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* never made */ }
    throw e;
  }
  mirrorOwes(file);
}
const WRITE_DRAIN_BOUND_MS = 5000;
const activeWrites = new Set();
function drainWrites(boundMs) {
  const limit = typeof boundMs === "number" ? boundMs : WRITE_DRAIN_BOUND_MS;
  const all = Promise.allSettled(Array.from(activeWrites));
  if (!limit || limit <= 0) return all;
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(resolve, limit); });
  return Promise.race([all, timeout]).finally(() => { clearTimeout(timer); });
}
async function doWriteReplacingAsync(file, text) {
  const tmp = uniqueTempPath(file);
  try {
    await fs.promises.writeFile(tmp, text, typeof text === "string" ? "utf8" : undefined);
    const handle = await fs.promises.open(tmp, "r+");
    try {
      await handle.sync(); /* plant:write-fsync */
    } finally {
      await handle.close();
    }
    await renamePatientlyAsync(tmp, file);
  } catch (e) {
    try { await fs.promises.unlink(tmp); } catch { /* never made */ }
    throw e;
  }
  mirrorOwes(file);
}
function writeReplacingAsync(file, text) {
  const p = doWriteReplacingAsync(file, text);
  activeWrites.add(p);
  p.finally(() => activeWrites.delete(p)).catch(() => {});
  return p;
}
/* A file written into, or taken out of, a folder team's mirror is owed to that team's share, and the syncer's outbox
   carries it there (shell/folder/syncer.cjs). Every write and removal of the desk's own files in the mirror passes here. */
function mirrorOwes(file) {
  try {
    const rel = path.relative(path.join(app.getPath("userData"), "folder-mirror"), path.resolve(String(file)));
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return;
    const parts = rel.split(path.sep), team = parts.shift();
    if (!SEALED_TEAM_RE.test(team) || !parts.length) return;
    const mirror = folderMirrorOf(team), inside = parts.join("/");
    const s = folderSyncer && !folderSyncer.stopped && path.resolve(folderSyncer.mirror) === path.resolve(mirror) ? folderSyncer : null;
    if (s) s.owe(inside); else FolderSyncer().noteOwed(mirror, inside); /* plant:mirror-owes */
  } catch (e) { console.error("etiuda: a write into the team's mirror could not be noted for the team's folder - " + (e && e.message)); }
}
function unlinkOwn(file) {
  fs.unlinkSync(file);
  mirrorOwes(file);
}
function persistDeskEnvelope() {
  if (deskKeys === undefined) deskKeys = readDesk();
  const file = deskFile();
  try {
    keepUnkept();
    writeReplacing(file, deskEnvelopeBody(JSON.stringify(deskKeys)));
  } catch (e) {
    console.error("etiuda: the desk could not be written - " + e.message);
  }
}
/* The bytes the lead's signature on a span covers: a fixed prefix, then the document with sig.value folded out. */
function spanSignedBytes(doc) {
  return Buffer.concat([Buffer.from("etiuda-stats-span\n", "utf8"), signedBytesOf(doc)]);
}
function spanGenuine(doc, lead) {
  try {
    if (!doc || !lead || String(doc.sig.keyId) !== String(lead.keyId)) return false;
    const pub = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(String(lead.public), "hex")]),
      format: "der", type: "spki" });
    return !!crypto.verify(null, spanSignedBytes(doc), pub, Buffer.from(String(doc.sig.value), "hex"));
  } catch { return false; }
}
/* The lead this desk joined under, from the pin a whole team file still matches. No key is required:
   a span can be read before this desk can seal, and a bad span is still refused. */
function pinnedLead() {
  heedTeam();
  const root = catalogFolder();
  if (!folderAnswers(root)) return null;
  const doc = teamTextChosen(root).doc;
  const pin = doc && teamPins[doc.id];
  if (!pin || !doc.lead || pin.keyId !== doc.lead.keyId || pin.public !== doc.lead.public) return null;
  return { team: String(doc.id), keyId: pin.keyId, public: pin.public };
}
function statsNow() { return statsClock == null ? new Date() : new Date(statsClock); }
function setStatsClock(ms) {
  statsClock = ms == null || ms === "" ? null : +ms;
  if (statsClock != null && statsMidnightTimer) { clearTimeout(statsMidnightTimer); statsMidnightTimer = null; }
}
/* today is a local calendar day. Shifting it goes by UTC dates, so a month boundary does not depend on the hour. */
function statsShiftYmd(ymd, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!m) return "";
  const x = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + days * 864e5);
  const p = v => String(v).padStart(2, "0");
  return x.getUTCFullYear() + "-" + p(x.getUTCMonth() + 1) + "-" + p(x.getUTCDate());
}
/* The page keeps SPAN_DAYS_KEPT day buckets, today included. A rolling span asks for at most
   that many, and a range counts only the part that still lies in those days. */
const SPAN_DAYS_KEPT = 400;
function ymdReal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  const x = new Date(Date.UTC(y, mo - 1, d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === mo - 1 && x.getUTCDate() === d;
}
/* Four shapes and no other. rolling-N takes N from 1 to SPAN_DAYS_KEPT with no leading zero.
   A range names two real dates, the first not after the second. */
function spanShape(span) {
  if (typeof span !== "string" || !span) return null;
  if (span === "this-month" || span === "last-month") return { kind: span };
  const rolling = /^rolling-([1-9]\d*)$/.exec(span);
  if (rolling) {
    const n = +rolling[1];
    return n <= SPAN_DAYS_KEPT ? { kind: "rolling", n: n } : null;
  }
  const range = /^range-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/.exec(span);
  if (!range || !ymdReal(range[1]) || !ymdReal(range[2]) || range[1] > range[2]) return null;
  return { kind: "range", from: range[1], to: range[2] };
}
function spanPeriod(span, now) {
  const shape = spanShape(span);
  if (!shape) return null;
  const today = channelYmd(now);
  if (shape.kind === "rolling") return { from: statsShiftYmd(today, 1 - shape.n), to: today };
  if (shape.kind === "this-month") return { from: today.slice(0, 8) + "01", to: today };
  if (shape.kind === "last-month") {
    const end = statsShiftYmd(today.slice(0, 8) + "01", -1);
    if (!ymdReal(end)) return null;
    return { from: end.slice(0, 8) + "01", to: end };
  }
  if (shape.kind !== "range") return null;
  const oldest = statsShiftYmd(today, 1 - SPAN_DAYS_KEPT); /* plant:span-range-clip */
  const from = shape.from > oldest ? shape.from : oldest;
  const to = shape.to < today ? shape.to : today;
  if (from > to) return null;
  return { from: from, to: to };
}
/* The figures, the span and the catalog, without the sync line or the hash, so an identical answer is not sealed again. */
function statsContentKey(out) {
  const copy = {};
  Object.keys(out).forEach(k => { if (k !== "sync" && k !== "hash") copy[k] = out[k]; });
  return canonJson(copy);
}
function statsFile() {
  const me = branchIdentity(false);
  if (!me || !/^k-[0-9a-f]{16}$/.test(me.id)) return null;
  const root = sharedFolderForWrite();
  const dir = path.join(root, "desks", me.id);
  const dest = path.join(dir, "stats.estat");
  if (path.dirname(dest) !== dir || path.basename(dest) !== "stats.estat") return null;
  return { root: root, dir: dir, dest: dest };
}
/* The lead's box from the team file this desk already verified, or null where statistics are not sealed.
   A stale epoch seals nothing, which is teamUse's own rule. No box is said once, and the team key is not a fallback. */
function statsSeal() {
  const use = teamUse();
  if (use.away) return { away: true };
  if (!use.member || use.stale || !use.seal) return null;
  const me = branchIdentity(false);
  if (!me || !/^k-[0-9a-f]{16}$/.test(me.id)) return null;
  const box = typeof use.seal.box === "string" ? use.seal.box : "";
  if (!/^[0-9a-f]{64}$/.test(box)) {
    if (statsNoBoxSaid !== use.seal.team) {
      statsNoBoxSaid = use.seal.team;
      console.log("etiuda: statistics are not sealed: the team file names no box for the lead");
    }
    return null;
  }
  if (statsNoBoxSaid === use.seal.team) statsNoBoxSaid = "";
  return { seal: { box: box, team: use.seal.team, epoch: use.seal.epoch, key: use.seal.key,
    keyId: String(use.seal.lead && use.seal.lead.keyId), desk: me.id } };
}
function armMidnight() {
  if (statsMidnightTimer) { clearTimeout(statsMidnightTimer); statsMidnightTimer = null; }
  if (!statsSpan || statsClock != null) return;
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const wait = Math.max(next.getTime() - now.getTime(), 1000);
  statsMidnightTimer = setTimeout(() => { statsMidnightTimer = null; statsPulse(); armMidnight(); }, wait);
}
/* One reason per ask. webContents.send delivers later, so a flush that lands between the ask and its answer
   must not take the reason, and two answers may arrive in either order. */
const statsAsks = new Map();
let statsAskSeq = 0;
function rememberStatsWhy(id, why) {
  statsAsks.set(String(id), why || "counts");
}
function reasonForAsk(askId, forced) {
  if (forced) return forced;
  const id = typeof askId === "string" ? askId : "";
  if (!id || !statsAsks.has(id)) return "counts";
  const why = statsAsks.get(id);
  statsAsks.delete(id);
  return why || "counts";
}
function askStats(win, why) {
  if (!statsPeriod) return;
  const live = liveWin(win);
  if (!live) return;
  statsWin = live;
  const id = "a" + (statsAskSeq += 1).toString(16);
  rememberStatsWhy(id, why || "counts");
  try { live.webContents.send("etiuda:stats-ask", { id: id, from: statsPeriod.from, to: statsPeriod.to }); }
  catch { /* the page has gone */ }
}
/* Moves a span whose days have changed when the driven or real clock has crossed midnight, and otherwise writes a
   held answer whose pace has elapsed. The page is asked once, and its answer is the write. */
function statsPulse() {
  if (!statsSpan) return;
  const period = spanPeriod(statsSpan, statsNow());
  if (!period) return;
  if (!statsPeriod || period.from !== statsPeriod.from || period.to !== statsPeriod.to) {
    statsPeriod = period;
    askStats(statsWin, "midnight");
    return;
  }
  if (statsHeld) writeStatsAnswer(statsHeld);
}
function flushHeldStats() {
  if (!statsHeld) return;
  writeStatsAnswer(statsHeld, "", "close");
}
function writeStatsAnswer(text, askId, forced) {
  const why = reasonForAsk(askId, forced);
  if (!statsSpan || !statsPeriod) return { ok: false };
  const id = ensureDeskId();
  if (!isSafeDeskId(id)) return { ok: false };
  let data;
  try { data = JSON.parse(String(text || "")); } catch { return { ok: false }; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false };
  const now = statsNow();
  const out = {
    format: 1,
    kind: "etiuda-statistics",
    desk: id,
    engine: String(data.engine || ""),
    period: { from: String(statsPeriod.from), to: String(statsPeriod.to) },
    sync: channelStamp(now),
    cards: cardCounts(data.cards),
    intents: Array.isArray(data.intents) ? data.intents : [],
    misses: data.misses | 0,
    /* One counter per language the page actually counted, keyed by code: the desk's languages
       are its catalog's, so a pair here would silently drop every other one. */
    langs: langCounts(data.langs)
  };
  /* The first day the page counted by day (board 521): a span that opens before it was not
     wholly counted, and the reader is told so rather than shown a short month as a quiet one. */
  if (ymdOk(data.since)) out.since = String(data.since);
  if (data.catalog && data.catalog.id) {
    out.catalog = { id: String(data.catalog.id), rev: +data.catalog.rev || 0 };
  }
  /* "B after A" for the span (board 814): rebuilt row by row like the rest, and the key is written
     only when a row survives, so a desk with none writes the file it always wrote. */
  if (Array.isArray(data.pairs)) {
    const pairs = [];
    data.pairs.forEach(p => {
      if (!p || typeof p !== "object" || typeof p.from !== "string" || typeof p.to !== "string") return;
      if (!p.from || !p.to || (p.n | 0) < 1) return;
      pairs.push({ from: p.from, to: p.to, n: p.n | 0 });
    });
    if (pairs.length) out.pairs = pairs;
  }
  if ((data.suggestTaken | 0) > 0) out.suggestTaken = data.suggestTaken | 0;
  if ((data.suggestOpen | 0) > 0) out.suggestOpen = data.suggestOpen | 0;
  const key = statsContentKey(out);
  if (key === statsWroteKey) { statsHeld = null; return { ok: true, unchanged: true }; }
  const bypass = why === "span" || why === "midnight" || why === "close";
  if (!bypass && statsLastWrite && (now.getTime() - statsLastWrite) < STATS_PACE_MS) {
    statsHeld = String(text || "");
    return { ok: true, paced: true, why: why };
  }
  let got = statsSeal();
  if (got && got.away) { statsHeld = String(text || ""); return { ok: false }; }
  if (!got || !got.seal) return { ok: false };
  const at = statsFile();
  if (!at) return { ok: false };
  out.hash = channelHash(out);
  try {
    if (!folderAnswers(at.root)) throw new Error("the catalog folder is not answering");
    for (const dir of [path.join(at.root, "desks"), at.dir, path.dirname(at.dest)]) {
      try { fs.mkdirSync(dir); } catch (e) { if (e.code !== "EEXIST") throw e; }
    }
    out.sig = { alg: "Ed25519", keyId: got.seal.desk };
    out.sig.value = branchSign(out, statsAnswerSignedBytes);
    if (!/^[0-9a-f]{128}$/.test(out.sig.value)) return { ok: false };
    const env = sealStatsLead(got.seal.box, got.seal.team, got.seal.keyId, got.seal.desk, JSON.stringify(out));
    writeReplacing(at.dest, JSON.stringify(env, null, 1) + "\n");
  } catch {
    statsHeld = String(text || "");
    return { ok: false };
  }
  statsHeld = null;
  statsWroteKey = key;
  statsLastWrite = now.getTime();
  return { ok: true, sync: out.sync, syncMs: now.getTime(), why: why };
}
/* The span file, if it verifies. Anything else is left unadopted: a bad replacement does not write and does not
   delete the answer already sealed. A missing file is not a new span either. */
function readSpanText() {
  const file = path.join(catalogFolder(), SPAN_NAME);
  try {
    if (fs.statSync(file).size > 65536) {
      console.log("etiuda: the span file is not read: it is larger than any span");
      return { big: true };
    }
    return { text: fs.readFileSync(file, "utf8") };
  } catch (e) {
    if (e && e.code === "ENOENT") return { missing: true };
    return { away: true };
  }
}
function tryLiveStats(win) {
  if (!folderAnswers(catalogFolder())) return;
  const got = readSpanText();
  if (!got.text) return;
  const doc = spanDocument(got.text);
  if (!doc) return;
  const lead = pinnedLead();
  if (!lead || !spanGenuine(doc, lead)) return;
  const next = String(doc.span);
  const period = spanPeriod(next, statsNow());
  if (!period) return;
  if (next !== statsSpan) {
    statsSpan = next;
    statsPeriod = period;
    armMidnight();
    askStats(win, "span");
    return;
  }
  if (statsHeld) writeStatsAnswer(statsHeld);
}

/* ---- HPKE, RFC 9180 base mode: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM ----------
   One message sealed to one X25519 public key, which is how a team key reaches a desk. These
   declarations name only crypto and Buffer, so Studio can slice them from its pinned copy of this file;
   tests/hpke.mjs holds them to the RFC's own vectors. A private key is taken as a KeyObject, never as bytes. */
const HPKE_KEM = Buffer.from("4b454d0020", "hex");               // "KEM", kem_id
const HPKE_SUITE = Buffer.from("48504b45002000010001", "hex");   // "HPKE", kem_id, kdf_id, aead_id
const SPKI_X25519 = Buffer.from("302a300506032b656e032100", "hex");
function hpkeLabeledExtract(suite, salt, label, ikm) {
  return crypto.createHmac("sha256", salt).update(Buffer.concat([Buffer.from("HPKE-v1"), suite, Buffer.from(label), ikm])).digest();
}
function hpkeLabeledExpand(suite, prk, label, info, len) {
  const head = Buffer.concat([Buffer.from([len >> 8, len & 255]), Buffer.from("HPKE-v1"), suite, Buffer.from(label), info]);
  let t = Buffer.alloc(0), out = Buffer.alloc(0);
  for (let i = 1; out.length < len; i++) {
    t = crypto.createHmac("sha256", prk).update(Buffer.concat([t, head, Buffer.from([i])])).digest();
    out = Buffer.concat([out, t]);
  }
  return out.subarray(0, len);
}
function hpkeX25519Public(raw) {
  if (!Buffer.isBuffer(raw) || raw.length !== 32) throw new Error("hpke: a public key is 32 bytes");
  return crypto.createPublicKey({ key: Buffer.concat([SPKI_X25519, raw]), format: "der", type: "spki" });
}
/* An all-zero X25519 output means a low-order key, and RFC 9180 section 7.1.4 says to abort. */
function hpkeShared(dh, enc, pkR) {
  if (dh.every(b => b === 0)) throw new Error("hpke: a low-order public key");
  const prk = hpkeLabeledExtract(HPKE_KEM, Buffer.alloc(0), "eae_prk", dh);
  return hpkeLabeledExpand(HPKE_KEM, prk, "shared_secret", Buffer.concat([enc, pkR]), 32);
}
/* Base mode has no PSK, so psk_id_hash and the secret's ikm are taken over the empty string. */
function hpkeSchedule(shared, info) {
  const none = Buffer.alloc(0);
  const ctx = Buffer.concat([Buffer.from([0]), hpkeLabeledExtract(HPKE_SUITE, none, "psk_id_hash", none),
    hpkeLabeledExtract(HPKE_SUITE, none, "info_hash", info)]);
  const secret = hpkeLabeledExtract(HPKE_SUITE, shared, "secret", none);
  return { key: hpkeLabeledExpand(HPKE_SUITE, secret, "key", ctx, 16),
           nonce: hpkeLabeledExpand(HPKE_SUITE, secret, "base_nonce", ctx, 12) };
}
/* {enc, ct} for pt sealed to pkR, 32 raw bytes, at sequence 0; it throws on a key it cannot seal to. The
   ephemeral key is made here on every call and no caller can pass one: one used for two messages gives both away. */
function hpkeSeal(pkR, info, aad, pt) {
  const skE = crypto.generateKeyPairSync("x25519").privateKey;
  const enc = crypto.createPublicKey(skE).export({ type: "spki", format: "der" }).subarray(-32);
  const dh = crypto.diffieHellman({ privateKey: skE, publicKey: hpkeX25519Public(pkR) });
  const ks = hpkeSchedule(hpkeShared(dh, enc, pkR), info);
  const c = crypto.createCipheriv("aes-128-gcm", ks.key, ks.nonce);
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
  return { enc: Buffer.from(enc), ct: ct };
}
/* The plaintext, or null for anything that does not open: a changed byte, another info or aad, another key. */
function hpkeOpen(skR, enc, info, aad, ct) {
  try {
    if (!(skR instanceof crypto.KeyObject) || skR.type !== "private" || skR.asymmetricKeyType !== "x25519") return null;
    if (!Buffer.isBuffer(ct) || ct.length < 16) return null;
    const pkR = crypto.createPublicKey(skR).export({ type: "spki", format: "der" }).subarray(-32);
    const dh = crypto.diffieHellman({ privateKey: skR, publicKey: hpkeX25519Public(enc) });
    const ks = hpkeSchedule(hpkeShared(dh, enc, pkR), info);
    const d = crypto.createDecipheriv("aes-128-gcm", ks.key, ks.nonce, { authTagLength: 16 });
    d.setAAD(aad);
    d.setAuthTag(ct.subarray(ct.length - 16));
    return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  } catch { return null; }
}

/* ---- the sealed envelope: a signed catalog's text under the team key, AES-256-GCM -------------
   The associated data is the envelope's kind, team and epoch, so a ct moved into another team's or
   epoch's envelope does not open. Pure like HPKE above, and sliced the same way. */
const SEALED_KIND = "etiuda-sealed";
const SEALED_TEAM_RE = /^t-[0-9a-f]{16}$/;
function sealedAad(team, epoch) {
  return Buffer.from(SEALED_KIND + "\n" + team + "\n" + epoch, "utf8");
}
/* {format, kind, team, epoch, nonce, ct}, the ct carrying its tag, under a fresh nonce on every call; it throws on a key,
   team, epoch or text it cannot seal. The team key is its 32 raw bytes, as hpkeOpen gives them back. */
function sealCatalog(teamKey, teamId, epoch, text) {
  if (!Buffer.isBuffer(teamKey) || teamKey.length !== 32) throw new Error("seal: a team key is 32 bytes");
  if (!SEALED_TEAM_RE.test(String(teamId))) throw new Error("seal: a team id is t- and 16 lower-case hex characters");
  if (!Number.isInteger(epoch) || epoch < 1) throw new Error("seal: the team key's number is a whole number from 1");
  if (typeof text !== "string") throw new Error("seal: the catalog is sealed as its text");
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", teamKey, nonce);
  c.setAAD(sealedAad(teamId, epoch));
  const ct = Buffer.concat([c.update(text, "utf8"), c.final(), c.getAuthTag()]);
  return { format: 2, kind: SEALED_KIND, team: teamId, epoch: epoch, nonce: nonce.toString("hex"), ct: ct.toString("hex") };
}
/* The text, or null for anything that does not open: a changed byte, another team, epoch or key. */
function openSealed(teamKey, doc) {
  try {
    if (!Buffer.isBuffer(teamKey) || teamKey.length !== 32) return null;
    if (!doc || typeof doc !== "object" || +doc.format !== 2 || doc.kind !== SEALED_KIND) return null;
    if (!SEALED_TEAM_RE.test(String(doc.team)) || !Number.isInteger(doc.epoch) || doc.epoch < 1) return null;
    const nonce = String(doc.nonce), hex = String(doc.ct);
    if (!/^[0-9a-f]{24}$/.test(nonce) || !/^[0-9a-f]*$/.test(hex) || hex.length % 2 || hex.length < 32) return null;
    const ct = Buffer.from(hex, "hex");
    const d = crypto.createDecipheriv("aes-256-gcm", teamKey, Buffer.from(nonce, "hex"), { authTagLength: 16 });
    d.setAAD(sealedAad(doc.team, doc.epoch));
    d.setAuthTag(ct.subarray(ct.length - 16));
    return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString("utf8");
  } catch { return null; }
}

/* ---- the team key's wrap, one per roster entry: the team key sealed by HPKE to the desk's box ---------
   info binds the team and the epoch and the aad the desk id, so a wrap copied onto another entry, or into
   another team or epoch, does not open. Studio slices these with HPKE to wrap; a desk opens its own. */
const TEAM_WRAP_LABEL = "etiuda-team-key\n";
function teamWrapInfo(teamId, epoch) {
  return Buffer.from(TEAM_WRAP_LABEL + teamId + "\n" + epoch, "utf8");
}
/* {epoch, enc, ct} in hex, a roster entry's wrap; it throws on a key, box, team, epoch or desk id it cannot wrap for. */
function wrapTeamKey(teamKey, box, teamId, epoch, deskId) {
  if (!Buffer.isBuffer(teamKey) || teamKey.length !== 32) throw new Error("wrap: a team key is 32 bytes");
  if (!/^[0-9a-f]{64}$/.test(String(box))) throw new Error("wrap: a desk's box is 64 lower-case hex characters");
  if (!SEALED_TEAM_RE.test(String(teamId))) throw new Error("wrap: a team id is t- and 16 lower-case hex characters");
  if (!Number.isInteger(epoch) || epoch < 1) throw new Error("wrap: the team key's number is a whole number from 1");
  if (!/^k-[0-9a-f]{16}$/.test(String(deskId))) throw new Error("wrap: a desk id is k- and 16 lower-case hex characters");
  const w = hpkeSeal(Buffer.from(box, "hex"), teamWrapInfo(teamId, epoch), Buffer.from(deskId, "utf8"), teamKey);
  return { epoch: epoch, enc: w.enc.toString("hex"), ct: w.ct.toString("hex") };
}
/* The 32-byte team key for this team, epoch and desk, or null: a wrap that says another epoch opens nothing. */
function unwrapTeamKey(skR, wrap, teamId, epoch, deskId) {
  if (!wrap || typeof wrap !== "object" || wrap.epoch !== epoch || !Number.isInteger(epoch) || epoch < 1) return null;
  const enc = String(wrap.enc), ct = String(wrap.ct);
  if (!/^[0-9a-f]{64}$/.test(enc) || !/^[0-9a-f]{96}$/.test(ct)) return null;
  const key = hpkeOpen(skR, Buffer.from(enc, "hex"), teamWrapInfo(String(teamId), epoch), Buffer.from(String(deskId), "utf8"),
    Buffer.from(ct, "hex"));
  return key && key.length === 32 ? key : null;
}

/* ---- statistics sealed to the lead's box alone: HPKE base mode, not the team key -----------------
   info binds the team and this desk's branch id. The envelope carries the encapsulated key, the
   ciphertext, the team id and the lead's key id, and nothing else. A private key is a KeyObject. */
const STATS_SEAL_KIND = "etiuda-stats-sealed";
const STATS_SEAL_LABEL = "etiuda-stats-lead\n";
function statsSealInfo(teamId, deskId) {
  return Buffer.from(STATS_SEAL_LABEL + teamId + "\n" + deskId, "utf8");
}
function sealStatsLead(box, teamId, keyId, deskId, text) {
  if (!/^[0-9a-f]{64}$/.test(String(box))) throw new Error("stats: the lead's box is 64 lower-case hex characters");
  if (!SEALED_TEAM_RE.test(String(teamId))) throw new Error("stats: a team id is t- and 16 lower-case hex characters");
  if (typeof keyId !== "string" || !keyId) throw new Error("stats: the lead's key id is a non-empty string");
  if (!/^k-[0-9a-f]{16}$/.test(String(deskId))) throw new Error("stats: a desk id is k- and 16 lower-case hex characters");
  if (typeof text !== "string") throw new Error("stats: the answer is sealed as its text");
  const w = hpkeSeal(Buffer.from(String(box), "hex"), statsSealInfo(teamId, deskId), Buffer.alloc(0), Buffer.from(text, "utf8"));
  return { format: 1, kind: STATS_SEAL_KIND, team: String(teamId), keyId: keyId,
    enc: w.enc.toString("hex"), ct: w.ct.toString("hex") };
}
function openStatsSealed(skR, doc, deskId) {
  try {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
    const keys = Object.keys(doc);
    if (keys.length !== 6 || keys[0] !== "format" || keys[1] !== "kind" || keys[2] !== "team"
      || keys[3] !== "keyId" || keys[4] !== "enc" || keys[5] !== "ct") return null;
    if (+doc.format !== 1 || doc.kind !== STATS_SEAL_KIND) return null;
    if (!SEALED_TEAM_RE.test(String(doc.team)) || typeof doc.keyId !== "string" || !doc.keyId) return null;
    if (!/^k-[0-9a-f]{16}$/.test(String(deskId))) return null;
    const enc = String(doc.enc), ct = String(doc.ct);
    if (!/^[0-9a-f]{64}$/.test(enc) || !/^[0-9a-f]+$/.test(ct) || (ct.length % 2) !== 0 || ct.length < 32) return null;
    const pt = hpkeOpen(skR, Buffer.from(enc, "hex"), statsSealInfo(String(doc.team), String(deskId)),
      Buffer.alloc(0), Buffer.from(ct, "hex"));
    return pt ? pt.toString("utf8") : null;
  } catch { return null; }
}
/* ---- an answer about a catalog the team does not list, sealed to the lead's box alone ---------------------
   The statistics' envelope under a kind and a label of its own, so neither file opens as the other. The lead's box is
   public, so the answer inside is signed by this desk under a prefix of its own, over the ask and the team it answers. */
const ANSWER_LEAD_KIND = "etiuda-answer-sealed";
const ANSWER_LEAD_LABEL = "etiuda-catalog-answer-lead\n";
function answerLeadInfo(teamId, deskId) {
  return Buffer.from(ANSWER_LEAD_LABEL + teamId + "\n" + deskId, "utf8");
}
function sealAnswerLead(box, teamId, keyId, deskId, text) {
  if (!/^[0-9a-f]{64}$/.test(String(box))) throw new Error("answer: the lead's box is 64 lower-case hex characters");
  if (!SEALED_TEAM_RE.test(String(teamId))) throw new Error("answer: a team id is t- and 16 lower-case hex characters");
  if (typeof keyId !== "string" || !keyId) throw new Error("answer: the lead's key id is a non-empty string");
  if (!/^k-[0-9a-f]{16}$/.test(String(deskId))) throw new Error("answer: a desk id is k- and 16 lower-case hex characters");
  if (typeof text !== "string") throw new Error("answer: the answer is sealed as its text");
  const w = hpkeSeal(Buffer.from(String(box), "hex"), answerLeadInfo(teamId, deskId), Buffer.alloc(0), Buffer.from(text, "utf8"));
  return { format: 1, kind: ANSWER_LEAD_KIND, team: String(teamId), keyId: keyId,
    enc: w.enc.toString("hex"), ct: w.ct.toString("hex") };
}
/* A working copy sealed to the lead's box (board 962, stage 0b): the answer's envelope under a kind and a label of its own, so
   neither opens as the other. The copy inside is this desk's signed file. */
const BRANCH_LEAD_KIND = "etiuda-branch-sealed";
const BRANCH_LEAD_LABEL = "etiuda-catalog-branch-lead\n";
function branchLeadInfo(teamId, deskId) {
  return Buffer.from(BRANCH_LEAD_LABEL + teamId + "\n" + deskId, "utf8");
}
function sealBranchLead(box, teamId, keyId, deskId, text) {
  if (!/^[0-9a-f]{64}$/.test(String(box))) throw new Error("copy: the lead's box is 64 lower-case hex characters");
  const w = hpkeSeal(Buffer.from(String(box), "hex"), branchLeadInfo(String(teamId), String(deskId)), Buffer.alloc(0), Buffer.from(String(text), "utf8"));
  return { format: 1, kind: BRANCH_LEAD_KIND, team: String(teamId), keyId: String(keyId), enc: w.enc.toString("hex"), ct: w.ct.toString("hex") };
}
/* What a box copy holds (board 962, stage 3): the desk file with the team, the `at` of the switch it was written under and the
   grew chain this desk judged it by, signed under a prefix of its own, so Studio reads it only under that very switch. */
const BRANCH_LEAD_INNER = "etiuda-branch-lead";
const BRANCH_LEAD_PREFIX = "etiuda-catalog-branch\n";
function branchLeadSignedBytes(doc) {
  return Buffer.concat([Buffer.from(BRANCH_LEAD_PREFIX, "utf8"), signedBytesOf(doc)]);
}
/* Whether an opened box copy is that folder's own: `keyHex` is the roster's desk.key for the folder's id, and that id, the id the
   key makes and sig.keyId are one id. Which team, switch and chain it names is the reader's to compare. */
function branchLeadGenuine(doc, folder, keyHex) {
  const sig = doc && doc.sig;
  try {
    return !!folder && /^k-[0-9a-f]{16}$/.test(String(folder))
      && /^[0-9a-f]{64}$/.test(String(keyHex)) && branchIdOf(String(keyHex)) === folder
      && +doc.format === 1 && doc.kind === BRANCH_LEAD_INNER && typeof doc.team === "string" && !!doc.team
      && typeof doc.content === "string" && !!doc.content && Array.isArray(doc.chain) && !!doc.file && typeof doc.file === "object"
      && !!sig && sig.alg === "Ed25519" && sig.keyId === folder && /^[0-9a-f]{128}$/.test(String(sig.value))
      && crypto.verify(null, branchLeadSignedBytes(doc), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(String(keyHex), "hex")]),
        format: "der", type: "spki" }), Buffer.from(String(sig.value), "hex"));
  } catch { return false; }
}
function openBranchLead(skR, doc, deskId) {
  try {
    if (!doc || typeof doc !== "object" || +doc.format !== 1 || doc.kind !== BRANCH_LEAD_KIND) return null;
    const enc = String(doc.enc), ct = String(doc.ct);
    if (!/^[0-9a-f]{64}$/.test(enc) || !/^(?:[0-9a-f]{2}){16,}$/.test(ct)) return null;
    const pt = hpkeOpen(skR, Buffer.from(enc, "hex"), branchLeadInfo(String(doc.team), String(deskId)), Buffer.alloc(0), Buffer.from(ct, "hex"));
    return pt ? pt.toString("utf8") : null;
  } catch { return null; }
}
const ANSWER_LEAD_PREFIX = "etiuda-catalog-answer\n";
function answerLeadSignedBytes(doc) {
  return Buffer.concat([Buffer.from(ANSWER_LEAD_PREFIX, "utf8"), signedBytesOf(doc)]);
}
/* Whether an opened box answer is that folder's own: `keyHex` is the roster's desk.key for the folder's id, and that id,
   the id the key makes and sig.keyId are one id. Which ask and team it answers is the reader's to compare. */
function answerLeadGenuine(doc, folder, keyHex) {
  const sig = doc && doc.sig;
  try {
    return !!folder && /^k-[0-9a-f]{16}$/.test(String(folder))
      && /^[0-9a-f]{64}$/.test(String(keyHex)) && branchIdOf(String(keyHex)) === folder
      && !!sig && sig.alg === "Ed25519" && sig.keyId === folder && /^[0-9a-f]{128}$/.test(String(sig.value))
      && typeof doc.ask === "string" && !!doc.ask && typeof doc.team === "string" && !!doc.team
      && crypto.verify(null, answerLeadSignedBytes(doc), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(String(keyHex), "hex")]),
        format: "der", type: "spki" }), Buffer.from(String(sig.value), "hex"));
  } catch { return false; }
}
function openAnswerLead(skR, doc, deskId) {
  try {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
    const keys = Object.keys(doc);
    if (keys.length !== 6 || keys[0] !== "format" || keys[1] !== "kind" || keys[2] !== "team"
      || keys[3] !== "keyId" || keys[4] !== "enc" || keys[5] !== "ct") return null;
    if (+doc.format !== 1 || doc.kind !== ANSWER_LEAD_KIND) return null;
    if (!SEALED_TEAM_RE.test(String(doc.team)) || typeof doc.keyId !== "string" || !doc.keyId) return null;
    if (!/^k-[0-9a-f]{16}$/.test(String(deskId))) return null;
    const enc = String(doc.enc), ct = String(doc.ct);
    if (!/^[0-9a-f]{64}$/.test(enc) || !/^[0-9a-f]+$/.test(ct) || (ct.length % 2) !== 0 || ct.length < 32) return null;
    const pt = hpkeOpen(skR, Buffer.from(enc, "hex"), answerLeadInfo(String(doc.team), String(deskId)),
      Buffer.alloc(0), Buffer.from(ct, "hex"));
    return pt ? pt.toString("utf8") : null;
  } catch { return null; }
}
/* The answer's own prefix, so this signature is not a desk file, a span or a request. */
const STATS_ANSWER_PREFIX = "etiuda-stats-answer\n";
function statsAnswerSignedBytes(doc) {
  return Buffer.concat([Buffer.from(STATS_ANSWER_PREFIX, "utf8"), signedBytesOf(doc)]);
}
/* Whether an opened answer is that folder's own. `keyHex` is the roster's desk.key for the folder's branch id.
   That id, the id the key makes, and sig.keyId are one id, or the answer is not genuine. */
function statsAnswerGenuine(doc, folder, keyHex) {
  const sig = doc && doc.sig;
  try {
    return !!folder && /^k-[0-9a-f]{16}$/.test(String(folder))
      && /^[0-9a-f]{64}$/.test(String(keyHex)) && branchIdOf(String(keyHex)) === folder
      && !!sig && sig.alg === "Ed25519" && sig.keyId === folder && /^[0-9a-f]{128}$/.test(String(sig.value))
      && crypto.verify(null, statsAnswerSignedBytes(doc), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(String(keyHex), "hex")]),
        format: "der", type: "spki" }), Buffer.from(String(sig.value), "hex"));
  } catch { return false; }
}

/* ---- joining a team: the desk's request, the lead's opening, and the code both sides read --------
   Commit then reveal: a request commits to the desk's nonce before the lead's opening exists, and the desk
   reveals it only against the one opening it took, so a request made to match a code has one chance in a
   million whatever it computes. The code covers the team, both desk keys, the lead's key and both nonces.
   Studio slices these to read a request and to say its code. */
const JOIN_PREFIX = "etiuda-desk-join\n";
const JOIN_KIND = "etiuda-join", JOINS_KIND = "etiuda-team-joins", JOINS_NAME = "etiuda-team-joins.json";
const PAUSE_NAME = "etiuda-team-pause.json", PAUSE_KIND = "etiuda-team-pause";
const WITHDRAWN_NAME = ".withdrawn.json", WITHDRAWN_KIND = "etiuda-catalog-ask-withdrawn";
const JOIN_HEX_RE = /^[0-9a-f]{64}$/;
function joinHash(parts) {
  return crypto.createHash("sha256").update(Buffer.from(JOIN_PREFIX + parts.map(String).join("\n"), "utf8")).digest();
}
/* The commitment a request carries, in hex: the team, the desk's two keys and its nonce. */
function joinCommit(teamId, key, box, nonce) {
  return joinHash(["commit", teamId, key, box, nonce]).toString("hex");
}
/* Six digits, or "" where any part is malformed. */
function joinCode(teamId, key, box, lead, deskNonce, leadNonce) {
  const parts = [key, box, lead, deskNonce, leadNonce];
  if (!SEALED_TEAM_RE.test(String(teamId)) || !parts.every(p => JOIN_HEX_RE.test(String(p)))) return "";
  return String(joinHash(["code", teamId].concat(parts)).readUIntBE(0, 6) % 1000000).padStart(6, "0");
}
function joinSignedBytes(doc) { return Buffer.concat([Buffer.from(JOIN_PREFIX, "utf8"), signedBytesOf(doc)]); }
/* Whether a request read from desks/<folder>/join.json is that desk's own, signed under the join prefix, and
   holds together: a revealed nonce meets the commitment, and an opening is taken only with a reveal. */
function joinGenuine(doc, folder) {
  const d = doc && doc.desk, sig = doc && doc.sig, o = doc && doc.opened;
  try {
    return !!folder && +doc.format === 1 && doc.kind === JOIN_KIND && SEALED_TEAM_RE.test(String(doc.team))
      && !!d && typeof d === "object" && d.id === folder && /^k-[0-9a-f]{16}$/.test(d.id) && JOIN_HEX_RE.test(String(d.key))
      && JOIN_HEX_RE.test(String(d.box)) && branchIdOf(d.key) === d.id && (d.name === undefined || typeof d.name === "string")
      && JOIN_HEX_RE.test(String(doc.commit))
      && (doc.reveal === undefined || (JOIN_HEX_RE.test(String(doc.reveal)) && joinCommit(doc.team, d.key, d.box, doc.reveal) === doc.commit))
      && (o === undefined || (doc.reveal !== undefined && !!o && typeof o === "object" && !!o.lead && typeof o.lead.keyId === "string"
        && JOIN_HEX_RE.test(String(o.lead.public)) && JOIN_HEX_RE.test(String(o.nonce))))
      && !!sig && sig.alg === "Ed25519" && sig.keyId === d.id && /^[0-9a-f]{128}$/.test(String(sig.value))
      && crypto.verify(null, joinSignedBytes(doc), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(d.key, "hex")]),
        format: "der", type: "spki" }), Buffer.from(sig.value, "hex"));
  } catch { return false; }
}
/* The bytes the lead's file of openings is signed over: its own prefix, then the folded form a team file uses. */
function joinsSignedBytes(doc) {
  return Buffer.concat([Buffer.from("etiuda-team-joins\n", "utf8"), signedBytesOf(doc)]);
}
/* What that file says to one request: {lead, nonce}, {refused: true}, or null. It counts only when its signature
   is one of `trust` (the pin, or the lead of the folder's whole team file). Unsigned, or signed by anyone else, it says nothing. */
function joinOpening(joins, teamId, deskId, commit, trust) {
  const lead = joins && joins.lead, open = joins && Array.isArray(joins.open) ? joins.open : [];
  if (!joins || +joins.format !== 1 || joins.kind !== JOINS_KIND || joins.team !== teamId || !lead || typeof lead.keyId !== "string"
    || !JOIN_HEX_RE.test(String(lead.public))) return null;
  const pubs = Array.isArray(trust) ? trust.map(String).filter(p => JOIN_HEX_RE.test(p)) : [];
  const sig = joins.sig;
  let signed = false;
  try {
    if (pubs.length && sig && sig.alg === "Ed25519" && /^[0-9a-f]{128}$/.test(String(sig.value))) {
      const bytes = joinsSignedBytes(joins), value = Buffer.from(String(sig.value), "hex");
      signed = pubs.some(pub => crypto.verify(null, bytes, crypto.createPublicKey({
        key: Buffer.concat([SPKI_ED25519, Buffer.from(pub, "hex")]), format: "der", type: "spki" }), value));
    }
  } catch { signed = false; }
  if (!signed) return null;
  const e = open.find(x => !!x && x.desk === deskId && x.commit === commit);
  if (!e) return null;
  if (e.refused === true) return { refused: true };
  return JOIN_HEX_RE.test(String(e.nonce)) ? { lead: { keyId: lead.keyId, public: lead.public }, nonce: e.nonce } : null;
}
/* Publics that may sign the joins file for this team. The pin, where this desk has one. The lead of the folder's
   whole team file when there is no pin, or when that lead is the pin, or a handover from it. */
function joinTrustPubs(team, root) {
  const pubs = [];
  const pin = team && teamPins[team];
  if (pin && JOIN_HEX_RE.test(String(pin.public))) pubs.push(String(pin.public));
  let chosen = null;
  try { chosen = root ? teamTextChosen(root).doc : null; } catch { chosen = null; }
  const named = chosen && chosen.lead;
  if (chosen && chosen.id === team && teamWhole(chosen) && named && JOIN_HEX_RE.test(String(named.public))) {
    const pub = String(named.public);
    if (!pin || pub === String(pin.public) || handedTo(chosen, pin)) pubs.push(pub);
  }
  return pubs;
}

/* ---- the desk's branch: an identity of its own, and its own file in the catalog folder --------
   Two key pairs made here at first need, Ed25519 to sign and X25519 to receive a team key. The
   private halves sit in the desk envelope sealed by safeStorage and never leave it: the page is
   handed the public halves and asks for a write, and no call signs anything but a desk file. The
   id is not the statistics id above, so that the two cannot be joined. */
/* ---- the lead handing its team to a new key: a statement the old key signs, carried in the team file -------------
   Signed under its own prefix, so it is never a team file, a desk file or a request. */
const HANDOVER_PREFIX = "etiuda-team-handover\n";
const HANDOVER_KIND = "etiuda-team-handover", HANDOVER_STEPS = 8;
function handoverSignedBytes(doc) { return Buffer.concat([Buffer.from(HANDOVER_PREFIX, "utf8"), signedBytesOf(doc)]); }
/* Whether `s` hands team `teamId` to another key, signed by the key `from`; the signature is the whole of the check on `from`. */
function handoverGenuine(s, teamId, from) {
  const to = s && s.to, sig = s && s.sig;
  try {
    return !!s && typeof s === "object" && +s.format === 1 && s.kind === HANDOVER_KIND && s.team === teamId
      && !!to && typeof to.keyId === "string" && /^[0-9a-f]{64}$/.test(String(to.public)) && to.public !== from.public
      && !!sig && sig.alg === "Ed25519" && /^[0-9a-f]{128}$/.test(String(sig.value))
      && crypto.verify(null, handoverSignedBytes(s), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(from.public, "hex")]),
        format: "der", type: "spki" }), Buffer.from(sig.value, "hex"));
  } catch { return false; }
}
/* Whether the team file's handovers lead, one genuine step at a time, from the key `pin` to the lead the file names. */
function handedTo(doc, pin) {
  const list = Array.isArray(doc.handover) ? doc.handover : [];
  let at = pin;
  for (let step = 0; step < HANDOVER_STEPS; step++) {
    const s = list.find(x => handoverGenuine(x, doc.id, at));
    if (!s) return false;
    at = { keyId: s.to.keyId, public: s.to.public };
    if (at.keyId === doc.lead.keyId && at.public === doc.lead.public) return true;
  }
  return false;
}
/* The keys a team file's handovers pass through from `pin` to the lead it names, `pin` first and that lead left out; empty
   where they do not lead there. */
function handedPath(doc, pin) {
  const list = Array.isArray(doc.handover) ? doc.handover : [];
  let at = { keyId: pin.keyId, public: pin.public };
  const out = [];
  for (let step = 0; step < HANDOVER_STEPS; step++) {
    const s = list.find(x => handoverGenuine(x, doc.id, at));
    if (!s) return [];
    out.push(at);
    at = { keyId: s.to.keyId, public: s.to.public };
    if (at.keyId === doc.lead.keyId && at.public === doc.lead.public) return out;
  }
  return [];
}
/* Whether the team files of one look show the team's lead key in two hands; shell/relay/blob.cjs forkIn is the same rule.
   `chain` is the leads this desk followed, oldest first, its pin last. A step counts only where it is genuine for that team
   and signed by that key, so a forged second successor shows nothing. "later": a key already handed on to the next of the
   chain is shown handing to another. "two": the pin is shown handing to two different keys. Null where there is neither. */
function forkIn(docs, chain, teamId) {
  const at = Array.isArray(chain) ? chain.filter(k => !!k && typeof k === "object" && !!k.keyId && !!k.public) : [];
  const files = (Array.isArray(docs) ? docs : []).filter(d => !!d && typeof d === "object" && d.id === teamId);
  for (let i = 0; i < at.length; i++) {
    const from = at[i], next = i + 1 < at.length ? at[i + 1] : null;
    const to = [];
    for (const doc of files) {
      for (const s of Array.isArray(doc.handover) ? doc.handover : []) {
        if (handoverGenuine(s, teamId, from) && !to.some(t => t.public === s.to.public)) to.push({ keyId: s.to.keyId, public: s.to.public });
      }
    }
    const others = next ? to.filter(t => t.public !== next.public) : to;
    if (next ? others.length > 0 : others.length > 1) return { kind: next ? "later" : "two", from: { keyId: from.keyId, public: from.public }, to: others }; /* plant:fork-in-desk */
  }
  return null;
}

const BRANCH_PREFIX = "etiuda-desk-branch\n";
const BRANCH_STEM_MAX = 96, BRANCH_TEXT_MAX = 16 * 1024 * 1024;
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
let deskBranch = null;                         // {sign:{pub,priv}, box:{pub,priv}}: hex publics, sealed privates
let deskBranchOld = [];                        // pairs the envelope could never open again, kept aside and never deleted
let branchRevs = {};                           // desk file id -> the last edition written, kept when the file is removed
let readRevs = {};                             // desk file id -> the highest rev this desk has handed on
let catalogRevs = {};                          // catalog id -> {signing public -> the highest rev handed to the page under it}, kept when teamKeys is empty
const CATALOG_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const CATALOG_PUB_RE = /^[0-9a-f]{64}$/;
/* The catalog document in a text a route hands on, in either form the reader takes, or null. */
function catalogDocIn(text) {
  try { const d = catalogPayload(text).data; return d && typeof d === "object" ? d : null; } catch { return null; }
}
function catalogMarkOf(json) {
  if (deskKeys === undefined) deskKeys = readDesk();
  const doc = catalogDocIn(json);
  if (!doc || doc.kind !== "etiuda-catalog") return null;
  const id = typeof doc.id === "string" ? doc.id : "";
  const rev = +doc.rev;
  if (!CATALOG_ID_RE.test(id) || !Number.isInteger(rev) || rev < 0) return null;
  return { id: id, rev: rev };
}
/* The rev held for one signing public of one catalog, or 0 where there is none. */
function catalogRevSlot(id, pub) {
  const slot = catalogRevs[id];
  if (!slot || typeof slot !== "object" || Array.isArray(slot)) return 0;
  const n = slot[pub];
  return Number.isInteger(n) ? n : 0;
}
/* A rev already held for this signing public is not replaced by a lower one. Equal is not a raise.
   Only the public catalogSigValid just verified is written, so one key's mark never moves another's.
   An unsigned file, whoever wrote it into the share, does not. */
function keepCatalogRev(json) {
  const x = catalogMarkOf(json);
  if (!x) return;
  const pub = catalogSigValid(catalogDocIn(json));
  if (!pub || !(x.rev > catalogRevSlot(x.id, pub))) return;
  if (!catalogRevs[x.id] || typeof catalogRevs[x.id] !== "object" || Array.isArray(catalogRevs[x.id])) catalogRevs[x.id] = {};
  catalogRevs[x.id][pub] = x.rev;
  persistDeskEnvelope();
}
/* Below the rev already held for the key that signed this file. Another key's mark does not count,
   and a file that does not verify is not below any mark. */
function belowCatalogRev(json) {
  const x = catalogMarkOf(json);
  if (!x) return false;
  const pub = catalogSigValid(catalogDocIn(json));
  if (!pub) return false;
  return x.rev < catalogRevSlot(x.id, pub);
}
const heldBranch = new Map();                  // stem -> the text a folder that did not answer is still owed
function branchPairOk(b) {
  const half = h => !!h && typeof h === "object" && /^[0-9a-f]{64}$/.test(String(h.pub)) && typeof h.priv === "string" && h.priv !== "";
  return !!b && typeof b === "object" && half(b.sign) && half(b.box);
}
/* Whether `storage` keeps a key sealed. On Linux with no keyring Electron falls back to "basic_text", a
   key built into Chromium, which is plain text in all but name, so only a named keyring counts there
   whatever isEncryptionAvailable answers. Pure. */
const LINUX_KEYRINGS = /^(gnome_libsecret|kwallet[56]?)$/;
function sealsForReal(storage, platform) {
  try {
    if (!storage || !storage.isEncryptionAvailable()) return false;
    if (platform !== "linux" || typeof storage.getSelectedStorageBackend !== "function") return true;
    return LINUX_KEYRINGS.test(String(storage.getSelectedStorageBackend()));
  } catch { return false; }
}
let plainSaid = false, keyringSaid = false;
function branchSealable() {
  const ok = sealsForReal(safeStorage, process.platform);
  if (!keyringSaid && process.platform === "linux") {
    keyringSaid = true;
    const ask = f => { try { return String(f()); } catch (e) { return "threw " + (e && e.message); } };
    console.error("etiuda: keyring backend " + ask(() => safeStorage.getSelectedStorageBackend())
      + ", encryption available " + ask(() => safeStorage.isEncryptionAvailable()));
  }
  if (!ok && !plainSaid && process.platform === "linux") {
    plainSaid = true;
    console.error("etiuda: no keyring answers on this desk, so no private key is kept and the desk's own file is not written;"
      + " to have one, install GNOME Keyring (the gnome-keyring package) or KDE Wallet, sign in again and open the desk");
  }
  return ok;
}
function sealPrivate(key) {
  return safeStorage.encryptString(key.export({ type: "pkcs8", format: "der" }).toString("base64")).toString("base64");
}
/* The private key as an object, or null where Windows will not open the envelope for this account. */
function openPrivate(sealed) {
  try {
    return crypto.createPrivateKey({ key: Buffer.from(safeStorage.decryptString(Buffer.from(sealed, "base64")), "base64"),
      format: "der", type: "pkcs8" });
  } catch { return null; }
}
function rawPublic(key) { return key.export({ type: "spki", format: "der" }).subarray(-32).toString("hex"); }
function branchIdOf(pubHex) {
  return "k-" + crypto.createHash("sha256").update(Buffer.from(pubHex, "hex")).digest("hex").slice(0, 16);
}
/* {id, key, box} for the page, or null where no key can be kept safely. Where encryption is only
   unavailable nothing is made and nothing is replaced. A pair the envelope throws on is that of another
   account, so it is kept aside, never deleted, and a new one is made: silence would hide the desk. */
function branchIdentity(make) {
  if (deskKeys === undefined) deskKeys = readDesk();
  /* Asked not to make one, it answers the public halves of the pair there is, or null: nothing is opened or made. */
  if (make === false) return deskBranch ? { id: branchIdOf(deskBranch.sign.pub), key: deskBranch.sign.pub, box: deskBranch.box.pub } : null;
  if (deskNewer) return null; /* plant:desk-newer-key */
  if (!branchSealable()) return null;
  const was = deskBranch, wasOld = deskBranchOld;
  if (!deskBranch || !openPrivate(deskBranch.sign.priv)) {
    try {
      if (deskBranch) { deskBranchOld = wasOld.concat([deskBranch]); deskBranch = null; }
      const s = crypto.generateKeyPairSync("ed25519"), b = crypto.generateKeyPairSync("x25519");
      deskBranch = { sign: { pub: rawPublic(s.publicKey), priv: sealPrivate(s.privateKey) },
                     box: { pub: rawPublic(b.publicKey), priv: sealPrivate(b.privateKey) } };
      saveDeskFile(JSON.stringify(deskKeys));
      deskWritten = true;
      if (was) console.log("etiuda: the desk's branch key could not be opened, so a new one was made; the old pair is kept aside");
    } catch (e) {
      deskBranch = was;
      deskBranchOld = wasOld;
      console.error("etiuda: the desk's branch key could not be made or kept - " + e.message);
      return null;
    }
  }
  return { id: branchIdOf(deskBranch.sign.pub), key: deskBranch.sign.pub, box: deskBranch.box.pub };
}
/* The same canonical form as the engine's v2Canonical, with the signature folded as v2SigFold does:
   tests/desk-ipc.mjs verifies a file's signature through the engine's own functions. */
function canonJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonJson).join(",") + "]";
  const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonJson(v[k])).join(",") + "}";
}
/* The bytes a signature covers, as the engine's v2SignedBytes makes them. */
function signedBytesOf(doc) {
  const copy = {};
  Object.keys(doc).forEach(k => {
    if (k === "hash") return;
    if (k !== "sig") { copy[k] = doc[k]; return; }
    const s = doc.sig;
    if (s && typeof s === "object") {
      copy.sig = {};
      if (s.alg !== undefined) copy.sig.alg = s.alg;
      if (s.keyId !== undefined) copy.sig.keyId = s.keyId;
    }
  });
  return Buffer.from(canonJson(copy), "utf8");
}
function branchSignedBytes(doc) { return Buffer.concat([Buffer.from(BRANCH_PREFIX, "utf8"), signedBytesOf(doc)]); }
/* `bytesOf`, where the caller names one, is the prefix that signature covers. A desk file names none. */
function branchSign(doc, bytesOf) {
  const key = openPrivate(deskBranch.sign.priv);
  const bytes = typeof bytesOf === "function" ? bytesOf(doc) : branchSignedBytes(doc);
  return key ? crypto.sign(null, bytes, key).toString("hex") : "";
}
function branchGenuine(doc) {
  try {
    const pub = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(deskBranch.sign.pub, "hex")]),
      format: "der", type: "spki" });
    return !!doc.sig && /^[0-9a-f]{128}$/.test(String(doc.sig.value))
      && crypto.verify(null, branchSignedBytes(doc), pub, Buffer.from(doc.sig.value, "hex"));
  } catch { return false; }
}
/* What the desk means by a file, apart from the fields a write moves. */
function branchContent(doc) {
  const copy = Object.assign({}, doc);
  ["rev", "date", "hash", "sig"].forEach(k => { delete copy[k]; });
  return canonJson(copy);
}
/* The rev a desk file states, or null where it is not JSON or states none. */
function deskFileRev(file) {
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    return d && typeof d === "object" && Number.isFinite(d.rev) ? d.rev : null;
  } catch { return null; }
}
function branchStemOk(s) {
  return !!s && s.length <= BRANCH_STEM_MAX && s === s.trim() && !/[\\/:*?"<>|\u0000-\u001f]/.test(s)
    && !/[. ]$/.test(s) && s !== "." && s !== ".." && !DESK_ID_RESERVED.test(s);
}
/* Where this desk's own file for a catalog goes, and null where the catalog folder is not there to
   hold it: the folder is never made here, since a share that has gone away would be made again. */
function branchDest(stem) {
  const root = sharedFolderForWrite(), dir = path.join(root, "desks", deskBranch ? branchIdOf(deskBranch.sign.pub) : "");
  const dest = path.join(dir, stem + ".ec");
  if (path.dirname(dest) !== dir || path.basename(dest) !== stem + ".ec") return null;
  return { root: root, dir: dir, dest: dest };
}
function branchHold(stem, text) {
  heldBranch.set(stem, text);
  return { ok: false, held: true };
}
/* Every catalog in the desk's own folder holding this id, whatever it is called: a renamed grown-from
   file leaves its old name behind. An envelope counts by the catalog inside, and `sealed` says under what. */
function ownFilesWithId(dir, id) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (!/\.ec$/i.test(n)) continue;
    const file = path.join(dir, n);
    try {
      let d = JSON.parse(fs.readFileSync(file, "utf8")), sealed = "";
      /* A copy sealed to the lead's box this desk cannot open again: it holds the id its name ends in, as withdrawClosed reads it,
         so a renamed or deleted copy leaves no stale one behind (Argon's F2, board 962 stage 3). Its doc is not kept. */
      if (d && typeof d === "object" && d.kind === BRANCH_LEAD_KIND) {
        const tail = /-([0-9a-f]{8})\.ec$/.exec(n);
        if (tail && path.basename(dir) + "-" + tail[1] === id) out.push({ file: file, doc: null, sealed: "box" }); /* plant:s3-branch-tidy */
        continue;
      }
      if (d && typeof d === "object" && d.kind === SEALED_KIND) {
        const inner = teamOpen(d);
        sealed = d.team + "|" + d.epoch;
        d = inner === null ? null : JSON.parse(inner);
      }
      if (d && typeof d === "object" && d.id === id) out.push({ file: file, doc: d, sealed: sealed });
    } catch { /* not a catalog */ }
  }
  return out;
}
/* The team file at `root` where it is whole under the lead this desk pinned, and under the lead policy names where it
   names one, whatever pin was kept, and lists the catalog, else null. */
function teamCovering(root, catalogId) {
  const doc = teamTextChosen(root).doc;
  if (!doc || !teamWhole(doc)) return null;
  const policy = sayJoinPolicy().lead;
  if (policy && doc.lead.public !== policy) return null;
  const pin = teamPins[doc.id];
  return !!pin && pin.keyId === doc.lead.keyId && pin.public === doc.lead.public && Array.isArray(doc.catalogs)
    && doc.catalogs.map(String).indexOf(catalogId) >= 0 ? doc : null;
}
/* True where this folder holds the same pin in envelopes of two teams, so a seal would be guessing
   which team the edition belongs to. A second team met only in another folder is not this. */
function pinsTorn(root, pin) {
  const held = editionTeams.get(pin);
  if (!held || held.size < 2) return false;
  let seen = "";
  for (const f of ecFilesIn(root)) {
    const t = envelopeTeam(f, pin);
    if (!t) continue;
    if (!seen) seen = t;
    else if (t !== seen) return true;
  }
  return false;
}
function envelopeTeam(file, pin) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return ""; }
  if (!data || typeof data !== "object" || data.kind !== SEALED_KIND) return "";
  const inner = teamOpen(data);
  if (inner === null) return "";
  try {
    const opened = catalogPayload(inner);
    return opened.data && signedSha(opened.data) === pin ? String(data.team) : "";
  } catch { return ""; }
}
/* The newest key this desk keeps, as {team, epoch, key, plain}, for the team covering the catalog at the folder written to,
   where that team is among those whose envelopes held the edition a file grew from (`pin`) and this folder does not hold the
   pin under two teams; else null. Which envelope was read first does not decide it. An edition not opened in this run
   is looked for among the folder's catalogs first. A desk the covering file leaves off its roster is out, at any epoch.
   A covering file whose epoch is not the newest key this desk keeps, or a key older than an epoch already heeded, is out, so a move of the epoch cannot be sealed under the key it left behind.
   A key already kept stays, and a seal made with it still opens. `plain` is the covering file's exportsSealed set false.
   An empty pin is a shared write: the folder's team, where its file lists the catalog and seals what it exports. */
function sealFor(catalogId, pin, root) {
  heedTeam();
  const asked = String(pin || "");
  if (asked && !editionTeam.has(asked)) ecFilesIn(root).forEach(f => ecFacts(f, ""));
  let team = asked ? (editionTeam.get(asked) || "") : "";
  if (asked && (!team || pinsTorn(root, asked))) return null;
  let cover = team ? teamCovering(root, catalogId) : null;
  /* The scan above stops once editionTeam holds the pin, so a folder team this run has not opened is read here. */
  if (asked && cover && !(editionTeams.get(asked) && editionTeams.get(asked).has(String(cover.id)))) {
    ecFilesIn(root).forEach(f => ecFacts(f, "")); /* plant:seal-read */
  }
  /* Seal for the folder's own team where editionTeams holds that team and the folder is not torn, so the first read does not decide the export. */
  if (asked && cover && !pinsTorn(root, asked)) {
    const held = editionTeams.get(asked);
    if (held && held.has(String(cover.id))) team = String(cover.id);
  }
  /* An empty pin asks for the folder's team, and only where that file lists the catalog and seals its exports. */
  if (!asked) {
    const folderTeam = teamCovering(root, catalogId);
    if (folderTeam && folderTeam.sealed === true && folderTeam.exportsSealed !== false) {
      cover = folderTeam;
      team = String(folderTeam.id);
    }
  }
  if (!cover || cover.id !== team) return null;
  const kept = teamKeys[team] || {};
  const epoch = Object.keys(kept).map(Number).filter(n => Number.isInteger(n) && n >= 1).sort((a, b) => b - a)[0];
  if (!epoch) return null;
  const me = deskBranch ? branchIdOf(deskBranch.sign.pub) : "";
  const listed = !!me && Array.isArray(cover.roster) && cover.roster.some(x => !!x && !!x.desk && x.desk.id === me);
  const stale = cover.epoch !== epoch || epoch < (teamEpochSeen[team] || 0);
  if (!listed || stale) return null;
  try {
    const key = Buffer.from(safeStorage.decryptString(Buffer.from(kept[epoch], "base64")), "base64");
    return key.length === 32 ? { team: team, epoch: epoch, key: key, plain: cover.exportsSealed === false } : null;
  } catch { return null; }
}
/* The file is <stem>-<8 hex>.ec and its catalog id ends in the same 8 hex, so two catalogs with one stem
   are two files. An empty text takes every file of that id away. Anything else is a catalog the page
   built, which the desk signs only when it names this desk, and writes by replacement with the edition
   raised from the highest it knows (the envelope keeps it past a removal), then the other files of that id go. */
function writeBranch(stem, text) {
  stem = String(stem || ""); text = String(text || "");
  const tail = /-([0-9a-f]{8})$/.exec(stem);
  if (!tail || !branchStemOk(stem) || text.length > BRANCH_TEXT_MAX) return { ok: false };
  if (deskKeys === undefined) deskKeys = readDesk();
  if (!text && !deskBranch) return { ok: true };
  const me = branchIdentity();
  if (!me) return branchHold(stem, text); /* plant:w1-early-hold */
  const id = me.id + "-" + tail[1];
  let doc = null, seal = null, grewId = "";
  if (text) {
    try { doc = JSON.parse(text); } catch { return branchHold(stem, text); /* plant:w1-early-hold */ }
    const d = doc && typeof doc === "object" ? doc.desk : null;
    if (!d || d.id !== me.id || d.key !== me.key || d.box !== me.box || doc.id !== id) return branchHold(stem, text); /* plant:w1-early-hold */
    if (doc.grew && typeof doc.grew === "object" && teamOpened.has(String(doc.grew.id))) grewId = String(doc.grew.id);
  }
  let toLead = null, toLeadAt = "", withheld = false;
  if (doc) {
    const gate = branchGate(doc);
    if (gate.hold) return branchHold(stem, text);
    if (gate.none) { doc = null; withheld = true; }
    else if (gate.box) { toLead = gate.box; toLeadAt = gate.at; }
  }
  const at = branchDest(stem);
  if (!at) return branchHold(stem, text); /* plant:w1-early-hold */
  try {
    if (!folderAnswers(at.root) || !fs.statSync(at.root).isDirectory()) return branchHold(stem, text);
    /* A file grown from a catalog this desk opened from an envelope is that catalog, so it is signed and then sealed for the
       team that sealed the edition it grew from; where that team, its cover at this folder or its key cannot be had, or the
       team has left this desk out, it is held, never written in the clear. */
    let sealId = grewId, sealPin = grewId ? String(doc.grew.sha || "") : "";
    /* A copy of a copy holds what its chain held: where any hop past its own id was opened from an envelope, it is sealed as the
       root's first hop was, or held. */
    if (!grewId && !toLead && doc) {
      const ids = lineageOf(doc), root = ids.length > 2 ? ids[ids.length - 1] : "";
      let chained = false;
      chained = !!root && ids.slice(1).some(c => teamOpened.has(c)); /* plant:e6d-chain-seal */
      if (chained) { sealId = root; sealPin = firstHopSha(ids[ids.length - 2], root); }
    }
    if (sealId && !toLead && doc) {
      seal = PIN_RE.test(sealPin) ? sealFor(sealId, sealPin, at.root) : null;
      if (!seal) return branchHold(stem, text);
    }
    const same = ownFilesWithId(at.dir, id);
    /* A file this desk did not sign does not raise the rev. The share is anybody's to write. */
    const lastRev = same.reduce((hi, e) => (branchGenuine(e.doc) ? Math.max(hi, +e.doc.rev || 0) : hi), branchRevs[id] || 0);
    const tidy = () => same.forEach(e => { if (e.file !== at.dest) unlinkOwn(e.file); });
    if (!doc) {
      if (lastRev > (branchRevs[id] || 0)) { branchRevs[id] = lastRev; persistDeskEnvelope(); }
      same.forEach(e => unlinkOwn(e.file));
      if (!same.some(e => e.file === at.dest) && fs.existsSync(at.dest)) unlinkOwn(at.dest);
      heldBranch.delete(stem);
      return withheld ? { ok: true, withheld: true } : { ok: true, removed: true };
    }
    const was = same.filter(e => e.file === at.dest)[0] || {}, had = was.doc || null;
    // Unchanged only where it also stands sealed as this write would seal it: plain stays plain, and an envelope moves to the newest epoch.
    if (!toLead && had && was.sealed === (seal ? seal.team + "|" + seal.epoch : "") && branchGenuine(had) && branchContent(had) === branchContent(doc)) {
      tidy();
      heldBranch.delete(stem);
      return { ok: true, unchanged: true, rev: +had.rev || 0 };
    }
    doc.rev = lastRev + 1;
    doc.hash = channelHash(doc);
    doc.sig = { alg: "Ed25519", keyId: me.id };
    doc.sig.value = branchSign(doc);
    if (!doc.sig.value) return branchHold(stem, text); /* plant:w1-early-hold */
    for (const dir of [path.join(at.root, "desks"), at.dir]) {
      try { fs.mkdirSync(dir); } catch (e) { if (e.code !== "EEXIST") throw e; }
    }
    const signed = JSON.stringify(doc, null, 1) + "\n";
    let boxed = "";
    if (toLead) {
      const said = { format: 1, kind: BRANCH_LEAD_INNER, team: String(toLead.team), content: toLeadAt, chain: lineageOf(doc), file: doc,
        sig: { alg: "Ed25519", keyId: me.id } };
      said.sig.value = branchSign(said, branchLeadSignedBytes); /* plant:s3-branch-said */
      if (!toLeadAt || !/^[0-9a-f]{128}$/.test(String(said.sig.value))) return branchHold(stem, text);
      boxed = JSON.stringify(said);
    }
    const written = toLead ? JSON.stringify(sealBranchLead(toLead.box, toLead.team, String(toLead.lead.keyId), me.id, boxed), null, 1) + "\n"
      : seal ? JSON.stringify(sealCatalog(seal.key, seal.team, seal.epoch, signed), null, 1) + "\n" : signed;
    writeReplacing(at.dest, written);
    /* The history is this desk's own, kept on this computer, so it keeps the copy itself and not the lead's envelope. */
    historyKeep(at.dest, toLead ? signed : written, true);
    tidy();
    branchRevs[id] = doc.rev;
    persistDeskEnvelope();
    heldBranch.delete(stem);
    return { ok: true, rev: doc.rev };
  } catch (e) {
    console.error("etiuda: the desk's own catalog file could not be written - " + e.message);
    return branchHold(stem, text);
  }
}
/* What a folder that did not answer is still owed, asked again when it may have come back: the catalog
   folder changing and the page finishing a load both call this. */
function tryHeldBranches() {
  tryHeldUse();
  if (!heldBranch.size || !folderAnswers(sharedFolderForWrite())) return;
  for (const [stem, text] of Array.from(heldBranch)) {
    const r = writeBranch(stem, text);
    if (!r.ok && !r.held) heldBranch.delete(stem);
  }
}

/* ---- the catalog this desk has loaded, named for the team, and a copy when the lead asks ------------------
   in-use.ec names the catalog (never a card) and is signed as a desk file, then sealed under the team key.
   A desk with no team key writes nothing. catalog-answer.ec is the catalog itself, and only for an ask that names
   this desk and verifies under the lead key it joined with. One answer per ask id. The answer is the loaded catalog
   only where the ask names that edition, or the team file lists the catalog. Sealed under the team key where the team
   lists it, else to the lead's box alone; a catalog another team sealed is answered to nobody. */
function sourceOfFile(file) {
  if (!file || isBuiltIn(file)) return "opened";
  try { if (path.resolve(path.dirname(file)) === path.resolve(catalogFolder())) return "folder"; } catch { /* opened */ }
  return "opened";
}
function noteHanded(text, source) {
  const doc = catalogDocIn(text);
  if (!doc || doc.kind !== "etiuda-catalog") return;
  lineageOf(doc);
  let pin = "";
  try { pin = signedSha(doc); } catch { return; }
  handedUse.delete(pin);
  handedUse.set(pin, { text: String(text), source: source === "folder" || source === "desk-file" ? source : "opened" });
  while (handedUse.size > HANDED_ASKED_MAX) handedUse.delete(handedUse.keys().next().value);
}
/* A catalog the page backed itself is the folder's when it is the file the folder holds now, and opened otherwise. */
function sourceForText(text) {
  try {
    const doc = catalogDocIn(text);
    if (!doc || doc.kind !== "etiuda-catalog") return "opened";
    const pin = signedSha(doc);
    const cur = catalogJson ? catalogDocIn(catalogJson) : null;
    if (cur && signedSha(cur) === pin && sourceOfFile(catalogFrom) === "folder") return "folder";
  } catch { /* opened */ }
  return "opened";
}
function catalogTitleClean(name) {
  if (typeof name !== "string") return "";
  return name.replace(INVITE_HIDDEN_RE, "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
}
function catalogSignerOf(doc) {
  return catalogSigValid(doc) && doc.sig && typeof doc.sig.keyId === "string" ? String(doc.sig.keyId) : "";
}
function deskTitle() {
  const n = deskKeys && typeof deskKeys.eAgent === "string" ? deskKeys.eAgent.trim().slice(0, 120) : "";
  return n;
}
/* The newest team key this desk can seal with. The catalog in use need not be one the team file names.
   stale: the team file's epoch is not that key, or the key is behind an epoch already seen, so nothing
   new is sealed under an older key. */
function teamUse() {
  heedTeam();
  const me = branchIdentity(false);
  if (!me) return { member: false };
  const root = catalogFolder();
  if (!folderAnswers(root)) return { away: true };
  const doc = teamTextChosen(root).doc;
  if (!doc || !teamWhole(doc)) return { member: false };
  const policy = sayJoinPolicy().lead;
  if (policy && doc.lead.public !== policy) return { member: false };
  const pin = teamPins[doc.id];
  if (!pin || pin.keyId !== doc.lead.keyId || pin.public !== doc.lead.public) return { member: false };
  const team = String(doc.id);
  const kept = teamKeys[team] || {};
  const epoch = Object.keys(kept).map(Number).filter(n => Number.isInteger(n) && n >= 1).sort((a, b) => b - a)[0];
  if (!epoch) return { member: false };
  const listed = Array.isArray(doc.roster) && doc.roster.some(x => !!x && !!x.desk && x.desk.id === me.id);
  if (!listed) return { member: false };
  let key = null;
  try { key = Buffer.from(safeStorage.decryptString(Buffer.from(kept[epoch], "base64")), "base64"); } catch { key = null; }
  if (!key || key.length !== 32) return { member: false };
  const stale = doc.epoch !== epoch || epoch < (teamEpochSeen[team] || 0) || teamFileBehind(doc); /* plant:s0b-floor-use */
  const box = typeof doc.lead.box === "string" ? doc.lead.box : "";
  const catalogs = Array.isArray(doc.catalogs) ? doc.catalogs.map(String) : [];
  return { member: true, stale: stale, catalogs: catalogs, content: stale ? null : teamContentOf(doc), consent: stale ? "" : consentOf(doc),
    seal: { team: team, epoch: epoch, key: key, lead: pin, box: box } };
}
function inUseFile() {
  const me = branchIdentity(false);
  return me ? path.join(sharedFolderForWrite(), "desks", me.id, IN_USE_STEM + ".ec") : "";
}
function writeClearedInUse() {
  const use = teamUse();
  const me = branchIdentity(true);
  const at = branchDest(IN_USE_STEM);
  if (!use.seal || !me || !at) return false;
  inUseN = Math.max(Number.isInteger(inUseN) && inUseN >= 1 ? inUseN : 0, 0) + 1; /* plant:f9-desk-in-use-n */
  const desk = { id: me.id, key: me.key, box: me.box };
  const who = deskTitle();
  if (who) desk.name = who;
  const out = {
    format: 1, kind: IN_USE_KIND, desk: desk, at: new Date().toISOString(),
    n: inUseN, cleared: true, sig: { alg: "Ed25519", keyId: me.id }
  };
  out.sig.value = branchSign(out);
  if (!out.sig.value) return false;
  for (const dir of [path.join(at.root, "desks"), at.dir]) {
    try { fs.mkdirSync(dir); } catch (e) { if (e.code !== "EEXIST") throw e; }
  }
  writeReplacing(at.dest, JSON.stringify(sealCatalog(use.seal.key, use.seal.team, use.seal.epoch, JSON.stringify(out)), null, 1) + "\n");
  return true;
}
function clearInUseFile() {
  const dest = inUseFile();
  if (!dest || !folderAnswers(sharedFolderForWrite())) { heldInUse = { remove: true }; return; }
  let written = false;
  try { written = writeClearedInUse(); } catch { written = false; }
  if (!written) {
    try { unlinkOwn(dest); }
    catch (e) { if (e.code !== "ENOENT") { heldInUse = { remove: true }; return; } }
  }
  inUseKept = null;
  if (heldInUse && heldInUse.remove) heldInUse = null;
  dropLoadedCatalog();
  persistDeskEnvelope();
}
function releaseInUse() {
  if (!inUseKept) return;
  if (!folderAnswers(sharedFolderForWrite())) { heldInUse = { remove: true }; return; }
  const use = teamUse();
  if (use.away) { heldInUse = { remove: true }; return; }
  if (use.member) { if (heldInUse && heldInUse.remove) heldInUse = null; return; }
  clearInUseFile();
}
function rememberAsk(id) {
  if (catalogAskIds.indexOf(id) >= 0) return;
  catalogAskIds.push(id);
  while (catalogAskIds.length > 64) catalogAskIds.shift();
  persistDeskEnvelope();
}
function liveWin(win) {
  try {
    if (win && typeof win.isDestroyed === "function" && !win.isDestroyed() && win.webContents && typeof win.webContents.send === "function")
      return win;
  } catch { /* not a window */ }
  try {
    if (theWindow && typeof theWindow.isDestroyed === "function" && !theWindow.isDestroyed()) return theWindow;
  } catch { /* gone */ }
  return null;
}
function tellCopy(win, id, lead) {
  lastCatalogCopy = String(id || "");
  const live = liveWin(win);
  if (!live) return;
  try { live.webContents.send("etiuda:catalog-copy", { id: lastCatalogCopy, lead: lead === true }); } catch { /* the page has gone */ }
}
function catalogCopyNote() { return lastCatalogCopy; }
function asksWatching() { return !!asksWatcher; }
function loadedCatalogPath() { return path.join(app.getPath("userData"), LOADED_CATALOG_FILE); }
/* Kept only when the text is the catalog just named. A pin the text does not back is not written. */
function keepLoadedCatalog(text, pin) {
  const body = String(text || "");
  if (!PIN_RE.test(String(pin || "")) || !body) return;
  let hashed = "";
  try {
    const doc = catalogDocIn(body);
    hashed = doc && doc.kind === "etiuda-catalog" ? signedSha(doc) : "";
  } catch { hashed = ""; }
  if (hashed !== pin || Buffer.byteLength(body, "utf8") > LOADED_CATALOG_MAX) return;
  try { writeReplacing(loadedCatalogPath(), body); }
  catch (e) { console.error("etiuda: the loaded catalog could not be kept - " + e.message); }
}
function dropLoadedCatalog() {
  try { fs.unlinkSync(loadedCatalogPath()); }
  catch (e) { if (e.code !== "ENOENT") console.error("etiuda: the loaded catalog could not be dropped - " + e.message); }
}
/* What an eject still owes the share, named by the team and the pin when this run recorded them.
   Kept in the envelope: the memory of it would not survive the desk starting again. */
function rememberEjectOwed() {
  const prev = ejectOwed && typeof ejectOwed === "object" ? ejectOwed : null;
  const team = inUseKept && SEALED_TEAM_RE.test(String(inUseKept.team || "")) ? String(inUseKept.team)
    : (prev && prev.team) || "";
  const sha = inUseKept && PIN_RE.test(String(inUseKept.sha || "")) ? String(inUseKept.sha)
    : (prev && prev.sha) || "";
  const next = {};
  if (team) next.team = team;
  if (sha) next.sha = sha;
  ejectOwed = next;
}
/* The catalog alone. releaseInUse keeps the file while this desk is still a member, which it is,
   so an eject unlinks in-use.ec itself. A share that is not answering, or an unlink that does not
   land, is owed that removal when the folder next answers, and the debt stays in the envelope. */
function ejectLoadedCatalog() {
  loadedText = "";
  dropLoadedCatalog();
  const dest = inUseFile();
  if (!dest || !folderAnswers(sharedFolderForWrite())) {
    if (dest) rememberEjectOwed();
    heldInUse = dest ? { eject: true } : null;
    inUseKept = null;
    persistDeskEnvelope();
    removeAnswer();
    return;
  }
  let failed = false;
  try { unlinkOwn(dest); }
  catch (e) { if (e.code !== "ENOENT") failed = true; }
  if (failed) {
    rememberEjectOwed();
    heldInUse = { eject: true };
    inUseKept = null;
  } else {
    heldInUse = null;
    inUseKept = null;
    ejectOwed = null;
  }
  persistDeskEnvelope();
  removeAnswer();
}
/* At the start of a run, the text comes back only when its pin is the one the envelope recorded
   for in-use.ec. Anything else, including a missing file, leaves this run as it was. */
function reloadLoadedCatalog() {
  if (loadedText || !inUseKept || !PIN_RE.test(String(inUseKept.sha || ""))) return;
  const file = loadedCatalogPath();
  let text = "";
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > LOADED_CATALOG_MAX || st.size < 1) return;
    text = fs.readFileSync(file, "utf8");
  } catch { return; }
  const doc = catalogDocIn(text);
  if (!doc || doc.kind !== "etiuda-catalog") return;
  let pin = "";
  try { pin = signedSha(doc); } catch { return; }
  if (pin !== inUseKept.sha) return;
  loadedText = text;
  const source = inUseKept.source;
  if ((source === "folder" || source === "opened" || source === "desk-file") && !handedUse.has(pin))
    noteHanded(text, source);
}
function writeInUse(pin, win) {
  const got = handedUse.get(String(pin || ""));
  /* A pin this shell did not hand on is not a catalog this desk has loaded. */
  if (!got) return;
  loadedText = got.text;
  /* A take replaces an eject the share has not yet heard. The debt would otherwise remove this catalog. */
  if (ejectOwed) { ejectOwed = null; persistDeskEnvelope(); }
  /* A pin other than the one already recorded drops the kept file before the returns below,
     so a take the share has not recorded cannot leave the previous catalog to be reloaded. */
  if (!inUseKept || inUseKept.sha !== String(pin || "")) dropLoadedCatalog();
  const root = sharedFolderForWrite();
  if (!folderAnswers(root)) { heldInUse = { text: got.text, source: got.source }; return; }
  let isDir = false;
  try { isDir = fs.statSync(root).isDirectory(); } catch { isDir = false; }
  if (!isDir) { heldInUse = { text: got.text, source: got.source }; return; }
  try {
    const use = teamUse();
    if (use.away) { heldInUse = { text: got.text, source: got.source }; return; }
    if (!use.member) { releaseInUse(); tryCatalogAsk(win); return; }
    if (use.stale) { tryCatalogAsk(win); return; }
    const seal = use.seal;
    const me = branchIdentity(true);
    if (!me) return;
    const doc = catalogDocIn(got.text);
    if (!doc || doc.kind !== "etiuda-catalog") return;
    if (inUseKept && inUseKept.sha === pin && inUseKept.epoch === seal.epoch && inUseKept.team === seal.team) {
      keepLoadedCatalog(got.text, pin);
      tryCatalogAsk(win);
      return;
    }
    inUseN = Math.max(Number.isInteger(inUseN) && inUseN >= 1 ? inUseN : 0, 0) + 1; /* plant:f9-desk-in-use-n */
    const cat = { id: typeof doc.id === "string" ? doc.id : "", rev: Number.isInteger(+doc.rev) ? +doc.rev : 0,
      sha256: pin, signer: catalogSignerOf(doc), source: got.source };
    const title = catalogTitleClean(doc.name);
    if (title) cat.title = title;
    const desk = { id: me.id, key: me.key, box: me.box };
    const who = deskTitle();
    if (who) desk.name = who;
    const out = { format: 1, kind: IN_USE_KIND, desk: desk, at: new Date().toISOString(), catalog: cat,
      n: inUseN,
      sig: { alg: "Ed25519", keyId: me.id } };
    out.sig.value = branchSign(out);
    if (!out.sig.value) return;
    const at = branchDest(IN_USE_STEM);
    if (!at) return;
    for (const dir of [path.join(at.root, "desks"), at.dir]) {
      try { fs.mkdirSync(dir); } catch (e) { if (e.code !== "EEXIST") throw e; }
    }
    writeReplacing(at.dest, JSON.stringify(sealCatalog(seal.key, seal.team, seal.epoch, JSON.stringify(out)), null, 1) + "\n");
    inUseKept = { sha: pin, epoch: seal.epoch, team: seal.team, source: got.source };
    heldInUse = null;
    persistDeskEnvelope();
    keepLoadedCatalog(got.text, pin);
    tryCatalogAsk(win);
  } catch (e) {
    console.error("etiuda: the catalog in use could not be written - " + e.message);
    heldInUse = { text: got.text, source: got.source };
  }
}
/* The team epoch moved, or this desk has only just become a member, and the page is not asked again.
   The catalog already loaded is sealed under the key held now. A stale file seals nothing. */
let resealing = false;
function resealHeld(win) {
  if (resealing || !loadedText) return;
  let pin = "";
  try {
    const doc = catalogDocIn(loadedText);
    pin = doc ? signedSha(doc) : "";
  } catch { return; }
  if (!PIN_RE.test(pin)) return;
  const use = teamUse();
  if (!use.member || use.stale || !use.seal) return;
  if (inUseKept && inUseKept.sha === pin && inUseKept.epoch === use.seal.epoch && inUseKept.team === use.seal.team) return;
  if (!handedUse.has(pin)) noteHanded(loadedText, sourceForText(loadedText));
  resealing = true;
  try { writeInUse(pin, win); }
  finally { resealing = false; }
}
function askSignedBytes(doc) { return Buffer.concat([Buffer.from(ASK_PREFIX, "utf8"), signedBytesOf(doc)]); }
function readAskFile() {
  const me = branchIdentity(false);
  if (!me) return { away: true };
  const root = catalogFolder(); /* plant:read-ask-mirror */
  if (!folderAnswers(root)) return { away: true };
  const file = path.join(root, ASK_DIR, me.id + ".json");
  let text = "";
  try {
    if (fs.statSync(file).size > 65536) return { bad: true };
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") return { gone: true };
    return { away: true };
  }
  try { return { doc: JSON.parse(String(text).replace(/^\uFEFF/, "")) }; }
  catch { return { bad: true }; }
}
/* `want` is { team, at }: the team asked for and the `at` of its lead's switch now, which an ask of format 2 must name. */
function askFresh(doc, me, lead, want) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || !me || !lead) return null;
  const format = +doc.format;
  if ((format !== 1 && format !== ASK_CONTENT_FORMAT) || doc.kind !== ASK_KIND) return null;
  if (format === ASK_CONTENT_FORMAT && (!want || !want.at || String(doc.team || "") !== String(want.team || "")
    || String(doc.content || "") !== String(want.at))) return null; /* plant:s0b-ask-bound */
  const id = String(doc.id || "");
  if (!ASK_ID_RE.test(id) || String(doc.desk || "") !== me.id || !PIN_RE.test(String(doc.sha256 || ""))) return null;
  if (!ASK_TIME_RE.test(String(doc.expires || ""))) return null;
  const when = Date.parse(doc.expires);
  if (!Number.isFinite(when) || !(when > Date.now())) return null;
  const sig = doc.sig;
  if (!sig || sig.alg !== "Ed25519" || String(sig.keyId || "") !== String(lead.keyId || "")) return null;
  if (!/^[0-9a-f]{128}$/.test(String(sig.value || ""))) return null;
  try {
    const pub = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(String(lead.public), "hex")]),
      format: "der", type: "spki" });
    if (!crypto.verify(null, askSignedBytes(doc), pub, Buffer.from(String(sig.value), "hex"))) return null;
  } catch { return null; }
  return { id: id, sha256: String(doc.sha256), content: format === ASK_CONTENT_FORMAT };
}
function removeAnswer() {
  const me = branchIdentity(false);
  const root = sharedFolderForWrite();
  if (!me || !folderAnswers(root)) { heldAnswer = { remove: true }; return; }
  try { unlinkOwn(path.join(root, "desks", me.id, ANSWER_NAME)); }
  catch (e) { if (e.code !== "ENOENT") { heldAnswer = { remove: true }; return; } }
  if (heldAnswer && heldAnswer.remove) heldAnswer = null;
  if (answerKept) { answerKept = null; persistDeskEnvelope(); }
}
/* The answer's text under either seal: the catalog, the ask and the team it answers, the grew chain this desk judged it by
   (`chain`, lineageOf's ids) and, sealed to the lead's box, the `at` of the lead's switch it was given under, signed by this
   desk. Throws where it cannot sign. */
function signedAnswer(me, team, askId, pin, catalogDoc, content, chain) {
  const doc = { format: 1, kind: ANSWER_KIND, ask: String(askId), team: String(team), sha256: pin, catalog: catalogDoc,
    sig: { alg: "Ed25519", keyId: me.id } };
  if (content) doc.content = String(content);
  if (Array.isArray(chain) && chain.length) doc.chain = chain.map(String); /* plant:s3-answer-chain */
  doc.sig.value = branchSign(doc, answerLeadSignedBytes);
  if (!/^[0-9a-f]{128}$/.test(String(doc.sig.value))) throw new Error("the answer could not be signed");
  return JSON.stringify(doc);
}
/* Whether the lead's switch `sw` (teamUse's content) lets this desk answer `team` with a catalog the team does not list: on, and
   shown to the agent at that very confirmation (contentSaid), so a switch turned on after the join applies only once said. */
function contentApplies(team, consent) {
  return !!consent && !!team && typeof teamContentSaid[team] === "string" && teamContentSaid[team] === consent;
}
/* What the agent is shown and consents to: the lead's key and box with the switch's who and when, so a moved lead or a switch
   confirmed again is a new consent. "" where the file holds no switch. */
function consentOf(doc) {
  const sw = doc ? teamContentOf(doc) : null;
  return sw ? [String(doc.lead.public), String(doc.lead.box || ""), sw.by, sw.at].join("\n") : "";
}
/* Whether a whole team file is older than one this desk has heeded for its team and lead key, as heedTeam judges it. */
function teamFileBehind(doc) {
  const rev = teamRevOf(doc);
  return rev === null || teamRevRefused((teamRevSeen[String(doc.id)] || {})[doc.lead.public], doc.epoch, rev);
}
const LINEAGE_MAX = 4096, LINEAGE_HOPS = 64;
/* The catalog ids a document descends through, itself first: its grew, then each grew this desk has seen for those ids. Each
   hop it sees is kept (catalogLineage), so a copy of a copy is judged by its whole chain. */
function lineageOf(doc) {
  const id = doc && typeof doc.id === "string" ? doc.id : "";
  const g = doc && doc.grew && typeof doc.grew === "object" ? String(doc.grew.id || "") : "";
  if (id && g && g !== id && PIN_RE.test(String(doc.grew.sha || ""))) catalogLineageSha[id] = String(doc.grew.sha);
  if (id && g && g !== id && catalogLineage[id] !== g) {
    catalogLineage[id] = g;
    const keys = Object.keys(catalogLineage);
    if (keys.length > LINEAGE_MAX) delete catalogLineage[keys[0]];
    persistDeskEnvelope();
  }
  /* The root a copy states for itself (grew.root) is kept apart (catalogRoots): it may widen the private mark, never "listed". */
  const root = doc && doc.grew && typeof doc.grew === "object" && typeof doc.grew.root === "string" ? doc.grew.root : "";
  if (id && root && root !== id && catalogRoots[id] !== root) {
    catalogRoots[id] = root;
    const keys = Object.keys(catalogRoots);
    if (keys.length > LINEAGE_MAX) delete catalogRoots[keys[0]];
    persistDeskEnvelope();
  }
  return lineageOfId(id || g, id ? g : "");
}
/* The ids the private mark reads: the stored chain and every root a copy along it has stated. */
function privateChain(ids) {
  const out = ids.slice();
  ids.forEach(c => { const r = catalogRoots[c]; if (r && out.indexOf(r) < 0) out.push(r); }); /* plant:s0b-grew-root */
  return out;
}
function lineageOfId(id, parent) {
  const out = [];
  let cur = String(id || ""), next = parent === undefined ? catalogLineage[cur] : parent;
  while (cur && out.indexOf(cur) < 0 && out.length < LINEAGE_HOPS) {
    out.push(cur);
    cur = String(next || "");
    next = catalogLineage[cur];
  }
  return out;
}
/* A catalog the agent marked private, or a copy grown from one by any number of hops: never answered or written, listed or not. */
function catalogMarkedPrivate(doc) {
  if (!doc || typeof doc !== "object") return false;
  return privateChain(lineageOf(doc)).some(id => catalogPrivate.has(id));
}
/* Whether the team lists a catalog, judged by the first catalog of its grew chain (Claude alpha's ruling of 12:04): the one test
   the answer and the working copy both take, so a copy is never shared in one and private in the other. */
function chainListed(doc, catalogs) {
  const ids = lineageOf(doc); /* plant:s0b-root-listed */
  return ids.length > 0 && Array.isArray(catalogs) && catalogs.indexOf(ids[ids.length - 1]) >= 0; /* plant:s0b-chain-listed */
}
/* Listed for the answer and the working copy alike: the grew chain starts on the team's list, and at an edition the team's
   pinned lead signed. A copy under a listed id itself must be that edition; a copy under an id of its own must have grown, at
   its chain's first hop, from one (grew.sha). Unknown is not listed. */
function teamListedDoc(doc, use) {
  if (!chainListed(doc, use.catalogs)) return false;
  const pub = String(use.seal && use.seal.lead && use.seal.lead.public || "");
  if (use.catalogs.indexOf(String(doc.id)) >= 0) {
    let own = true;
    own = catalogSigValid(doc, pub) === true; /* plant:s5-listed-lead */
    return own;
  }
  const ids = lineageOf(doc);
  const hop = ids.length === 2 ? String(doc.grew && doc.grew.sha || "") : ids.length > 2 ? firstHopSha(ids[ids.length - 2], ids[ids.length - 1]) : "";
  let first = true;
  first = leadSignedPin(hop, pub); /* plant:s5-first-hop */
  return first;
}
/* The grew.sha of the copy `id` that grew from `root`: as seen this run, else read from the catalog folder's root or from this
   desk's own desks/ folder, a file there counting only where this desk signed it; another desk's folder is that desk's to write.
   Envelopes this desk opens included. Not found is "". */
function firstHopSha(id, root) {
  if (catalogLineageSha[id]) return String(catalogLineageSha[id]);
  let sha = "";
  sha = hopShaOnDisk(id, root); /* plant:s5-hop-disk */
  return sha;
}
function hopShaOnDisk(id, root) {
  const base = catalogFolder(), me = branchIdentity(false), files = ecFilesIn(base).map(f => ({ f, desk: "" }));
  let dirs = [];
  try { dirs = fs.readdirSync(path.join(base, "desks")); } catch { dirs = []; }
  dirs = dirs.filter(d => !!me && d === me.id); /* plant:s5-hop-own */
  for (const d of dirs) files.push(...ecFilesIn(path.join(base, "desks", d)).map(f => ({ f, desk: d })));
  for (const { f: file, desk } of files) {
    let doc = null;
    try { if (fs.statSync(file).size <= BRANCH_TEXT_MAX) doc = catalogDocIn(catalogRead(fs.readFileSync(file, "utf8")).json); } catch { doc = null; }
    /* The root is the team's shared folder on a folder team, writable by any teammate, so a root file counts only where this desk signed it. */
    if (doc && !deskFileGenuine(doc, desk || (me ? me.id : ""))) doc = null; /* plant:s5-hop-genuine */
    const g = doc && doc.id === id && doc.grew && typeof doc.grew === "object" ? doc.grew : null;
    if (g && String(g.id || "") === root && PIN_RE.test(String(g.sha || ""))) { catalogLineageSha[id] = String(g.sha); return String(g.sha); }
  }
  return "";
}
/* True where `pin` is the signed hash of an edition `leadPublic` signed, found among what this desk was handed or holds in its
   catalog folder, envelopes it can open included. Kept once found; anything not found is false. */
const leadPinsSeen = new Set();
function leadSignedPin(pin, leadPublic) {
  if (!PIN_RE.test(pin) || !/^[0-9a-f]{64}$/.test(leadPublic)) return false;
  const key = pin + "|" + leadPublic;
  if (leadPinsSeen.has(key)) return true;
  const texts = [loadedText];
  for (const m of [handedUse, handedAsked]) { const got = m.get(pin); if (got && typeof got.text === "string") texts.push(got.text); }
  for (const file of ecFilesIn(catalogFolder())) {
    try { if (fs.statSync(file).size <= BRANCH_TEXT_MAX) texts.push(catalogRead(fs.readFileSync(file, "utf8")).json); } catch { /* not one this desk opens */ }
  }
  for (const t of texts) {
    const d = t ? catalogDocIn(t) : null;
    let sha = "";
    try { sha = d ? signedSha(d) : ""; } catch { sha = ""; }
    if (sha === pin && catalogSigValid(d, leadPublic) === true) { leadPinsSeen.add(key); return true; }
  }
  return false;
}
/* Whether the private mark holds for `doc` against the team's list (Claude alpha's ruling of 2026-11-08 13:05, from Max's
   "catalogs the team lists stay as they are"): only for a catalog the team does not list; off a team, `catalogs` is none. */
function privateHere(doc, catalogs) {
  if (chainListed(doc, catalogs)) return false; /* plant:s0b-private-listed */
  return catalogMarkedPrivate(doc);
}
/* Whether the team at this folder lists catalog `id`, by its stored chain. */
function idListedHere(id) {
  const doc = folderTeamDoc();
  const pin = doc ? teamPins[doc.id] : null;
  if (!pin || pin.keyId !== doc.lead.keyId || pin.public !== doc.lead.public || !Array.isArray(doc.catalogs)) return false;
  const ids = lineageOfId(id);
  return ids.length > 0 && doc.catalogs.map(String).indexOf(ids[ids.length - 1]) >= 0;
}
function boxAnswerHere(file) {
  try { const d = JSON.parse(fs.readFileSync(file, "utf8")); return !!d && d.kind === ANSWER_LEAD_KIND; } catch { return false; }
}
/* Whether sharedFolderForWrite resolves to a team's place: a relay team's mirror, a folder team's share or mirror (joining or
   removed included), a managed folder holding a team file or a team's primed mirror, or the mirror a team moving to a folder
   waits in. A managed folder with no team there yet is the desk's own. */
function teamWriteHere() {
  if (relayHere() || folderTeamHere()) return true;
  const named = sayJoinPolicy().folder;
  if (named && (fs.existsSync(path.join(named, TEAM_NAME))
    || Object.keys(teamPins).some(t => fs.existsSync(path.join(folderMirrorOf(t), FolderSyncer().PRIMED_NAME))))) return true;
  const need = Object.values(teamNeedsFolder)[0];
  return !!(need && need.mirror); /* plant:team-write-moving */
}
/* Where a working copy may go on a team this desk is on: one the team lists as before; a private one nowhere; any other to the lead's
   box while the lead's switch applies, else held until it does. Not a sealed member where writes reach a team's place: held. Off a
   team, as before but private. */
function branchGate(doc) {
  const use = teamUse(), onTeam = !!(use.member && use.seal);
  if (onTeam ? privateHere(doc, use.catalogs) : catalogMarkedPrivate(doc)) return { none: true }; /* plant:s0b-branch-private */
  if (!onTeam && teamWriteHere()) return { hold: true }; /* plant:team-write-hold */
  if (!onTeam) return {};
  if (teamListedDoc(doc, use)) return {};
  if (!contentApplies(use.seal.team, use.consent) || !/^[0-9a-f]{64}$/.test(String(use.seal.box || ""))) return { hold: true }; /* plant:s0b-branch-switch */
  return { box: use.seal, at: use.content ? String(use.content.at) : "" };
}
/* What this desk put on the share that the lead may no longer read (board 962, stage 0b, Claude alpha's ruling B): an answer to
   the lead's box once the switch no longer applies, any answer about a catalog now private, and working copies likewise. */
function withdrawClosed() {
  const me = branchIdentity(false);
  const root = sharedFolderForWrite();
  if (!me || !folderAnswers(root)) return;
  const dir = path.join(root, "desks", me.id);
  let names = [];
  try { names = fs.readdirSync(dir); } catch { names = []; }
  /* The team is heeded only where there is something to take back, so a desk with nothing on the share heeds as before. */
  if (!answerKept && names.indexOf(ANSWER_NAME) < 0 && !names.some(n => /-[0-9a-f]{8}\.ec$/.test(n))) return;
  const use = teamUse();
  if (!use.member || !use.seal) return;
  const open = contentApplies(use.seal.team, use.consent);
  /* Only an answer sealed to the lead's box was about a catalog the team does not list, so only it answers to the private mark. */
  if (answerKept && answerKept.lead && (!open || privateChain(answerKept.ids).some(id => catalogPrivate.has(id)))) removeAnswer(); /* plant:s0b-withdraw-answer */
  /* A box answer this desk has no record of, one an earlier build wrote among them, goes too; a team-key answer stays. */
  if (!open && names.indexOf(ANSWER_NAME) >= 0 && boxAnswerHere(path.join(dir, ANSWER_NAME))) removeAnswer(); /* plant:s0b-withdraw-unkept */
  for (const n of names) {
    const tail = /-([0-9a-f]{8})\.ec$/.exec(n);
    if (!tail) continue;
    const file = path.join(dir, n);
    let d = null;
    try { d = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    let gone = false;
    if (d && d.kind === BRANCH_LEAD_KIND) gone = !open || privateChain(lineageOfId(me.id + "-" + tail[1])).some(id => catalogPrivate.has(id));
    else {
      if (d && d.kind === SEALED_KIND) { const inner = teamOpen(d); try { d = inner === null ? null : JSON.parse(inner); } catch { d = null; } }
      /* Only a file this desk signed is judged: reading another's would teach lineageOf the chain it claims (962s5u7). */
      let own = true;
      own = !!d && typeof d === "object" && branchGenuine(d); /* plant:s6-withdraw-own */
      gone = !!d && typeof d === "object" && own && !teamListedDoc(d, use);
    }
    if (gone) { try { unlinkOwn(file); } catch { /* the next pass tries again */ } } /* plant:s0b-withdraw-branch */
  }
}
function writeAnswer(use, pin, catalogDoc, toLead, askId) {
  const me = branchIdentity(true);
  const seal = use && use.seal;
  if (!me || !seal) return false;
  if (privateHere(catalogDoc, use.catalogs)) return false; /* plant:s0b-private */
  if (toLead && !contentApplies(seal.team, use.consent)) return false; /* plant:s0b-switch */
  const root = sharedFolderForWrite();
  if (!folderAnswers(root)) return false;
  const inner = signedAnswer(me, seal.team, askId, pin, catalogDoc, toLead && use.content ? use.content.at : "", lineageOf(catalogDoc));
  const at = branchDest("catalog-answer");
  if (!at) return false;
  for (const dir of [path.join(at.root, "desks"), at.dir]) {
    try { fs.mkdirSync(dir); } catch (e) { if (e.code !== "EEXIST") throw e; }
  }
  let env = null;
  if (toLead) env = sealAnswerLead(seal.box, seal.team, String(seal.lead.keyId), me.id, inner); /* plant:s0-answer-lead */
  if (!env) env = sealCatalog(seal.key, seal.team, seal.epoch, inner);
  writeReplacing(at.dest, JSON.stringify(env, null, 1) + "\n");
  answerKept = { ids: lineageOf(catalogDoc), lead: !!toLead };
  persistDeskEnvelope();
  return true;
}
/* Whether the catalog in use, or the edition it grew from (doc.grew, as writeBranch judges it), is one this desk opened from an
   envelope (teamOpened, by its id) whose edition no envelope of `team` is known to hold: another team's catalog, whatever this
   team's file lists. Unknown counts as another's. */
function sealedForOther(doc, pin, team) {
  if (openedForOther(doc && typeof doc.id === "string" ? doc.id : "", pin, team)) return true;
  const g = doc && doc.grew && typeof doc.grew === "object" ? doc.grew : null;
  return !!g && openedForOther(String(g.id || ""), String(g.sha || ""), team); /* plant:s0-grew */
}
function openedForOther(id, pin, team) {
  if (!id || !teamOpened.has(id)) return false;
  const held = editionTeams.get(pin);
  if (held && held.has(team)) return false;
  return !ecFilesIn(catalogFolder()).some(f => envelopeTeam(f, pin) === team);
}
function checkWithdrawnAsks(root, me, lead) {
  if (!root || !me || !lead) return;
  const file = path.join(root, ASK_DIR, me.id + WITHDRAWN_NAME);
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch { return; }
  try {
    const doc = JSON.parse(text.replace(/^\uFEFF/, ""));
    if (doc && +doc.format === 1 && doc.kind === WITHDRAWN_KIND && doc.desk === me.id && Array.isArray(doc.ids)) {
      const sig = doc.sig;
      if (sig && sig.alg === "Ed25519" && String(sig.keyId) === String(lead.keyId) && /^[0-9a-f]{128}$/.test(String(sig.value || ""))) {
        const pub = crypto.createPublicKey({
          key: Buffer.concat([SPKI_ED25519, Buffer.from(String(lead.public), "hex")]),
          format: "der", type: "spki"
        });
        if (crypto.verify(null, askSignedBytes(doc), pub, Buffer.from(String(sig.value), "hex"))) {
          for (const id of doc.ids) {
            if (typeof id === "string" && ASK_ID_RE.test(id)) {
              rememberAsk(id); /* plant:f9-ask-withdrawn */
            }
          }
        }
      }
    }
  } catch { /* ignore bad doc */ }
}
/* An ask is answered once, and the answer is taken away when the ask is gone, unsigned, or expired. */
function tryCatalogAsk(win) {
  try {
    if (!folderAnswers(sharedFolderForWrite())) return;
    resealHeld(win);
    withdrawClosed();
    const got = readAskFile();
    if (got.away) return;
    if (got.gone) {
      if (!relayHere()) removeAnswer(); /* plant:follow-ask-keep */
      return;
    }
    const use = teamUse();
    if (use.away || !use.member) return;
    const me = branchIdentity(false);
    checkWithdrawnAsks(catalogFolder(), me, use.seal && use.seal.lead);
    const ask = got.bad ? null : askFresh(got.doc, me, use.seal.lead, { team: use.seal.team, at: use.content ? use.content.at : "" });
    if (!ask) { removeAnswer(); return; }
    if (use.stale || !loadedText || catalogAskIds.indexOf(ask.id) >= 0) return;
    const doc = catalogDocIn(loadedText);
    if (!doc || doc.kind !== "etiuda-catalog") return;
    let pin = "";
    try { pin = signedSha(doc); } catch { return; }
    if (!PIN_RE.test(pin)) return;
    const listed = teamListedDoc(doc, use);
    if (ask.sha256 !== pin && !listed) return;
    if (privateHere(doc, use.catalogs)) return; /* plant:s0b-private */
    if (sealedForOther(doc, pin, use.seal.team)) return; /* plant:s0-other-team */
    if (!listed && !(ask.content && contentApplies(use.seal.team, use.consent))) return; /* plant:s0b-switch */
    if (!listed && !/^[0-9a-f]{64}$/.test(String(use.seal.box || ""))) return;
    if (!writeAnswer(use, pin, doc, !listed, ask.id)) { heldAnswer = { id: ask.id }; return; }
    rememberAsk(ask.id);
    heldAnswer = null;
    tellCopy(win, ask.id, !listed);
  } catch (e) {
    console.error("etiuda: the catalog ask could not be answered - " + e.message);
  }
}
function watchAsks(win) {
  if (asksWatcher) { try { asksWatcher.close(); } catch { /* already gone */ } asksWatcher = null; }
  const root = catalogFolder();
  if (!folderAnswers(root)) return;
  try {
    const w = fs.watch(path.join(root, ASK_DIR), () => {
      clearTimeout(askSettle);
      askSettle = setTimeout(() => tryCatalogAsk(win), 300);
    });
    w.on("error", () => { try { w.close(); } catch { /* already gone */ } if (asksWatcher === w) asksWatcher = null; });
    asksWatcher = w;
  } catch { asksWatcher = null; }
}
function tryHeldUse() {
  if (ejectOwed && !heldInUse) heldInUse = { eject: true };
  if (ejectOwed && !heldAnswer) heldAnswer = { remove: true };
  if (!heldInUse && !heldAnswer) return;
  if (!folderAnswers(catalogFolder())) return;
  const use = heldInUse, ans = heldAnswer;
  heldInUse = null;
  heldAnswer = null;
  if (use && use.eject) {
    const dest = inUseFile();
    let failed = false;
    if (dest) {
      try { unlinkOwn(dest); }
      catch (e) { if (e.code !== "ENOENT") { heldInUse = { eject: true }; failed = true; } }
    }
    if (!failed) {
      dropLoadedCatalog();
      inUseKept = null;
      persistDeskEnvelope();
    }
  } else if (use && use.remove) releaseInUse();
  else if (use && use.text) {
    noteHanded(use.text, use.source || "opened");
    let pin = "";
    try { const d = catalogDocIn(use.text); pin = d ? signedSha(d) : ""; } catch { pin = ""; }
    if (pin) writeInUse(pin, theWindow);
  }
  if (ans && ans.remove) removeAnswer();
  else if (ans) tryCatalogAsk(theWindow);
  if (use && use.eject && ejectOwed && !heldInUse && !(heldAnswer && heldAnswer.remove)) {
    ejectOwed = null;
    persistDeskEnvelope();
  }
}

/* ---- the team: its file beside the catalogs, its lead's key pinned, and this desk's team keys -----------
   A team file verifies under the lead key it names, so it is whole and nothing more: anybody who can write the
   share can sign one. Its lead's key is pinned where the ring lists it for a catalog the team covers, or at the
   first admission, a file whose roster carries a wrap this desk opens; nothing in a file under any other key is
   then used, unless the file's handovers lead to that key from the pinned one, and the pin then moves to it. Each
   epoch's key is kept, so an edition sealed before a new epoch still opens. */
const TEAM_MAX = 1024 * 1024;
let teamPins = {};                             // team id -> {keyId, public}: the lead's key, once trusted
let teamKeys = {};                             // team id -> {epoch: the team key sealed by safeStorage, base64}
let teamEpochSeen = {};                        // team id -> the highest epoch heeded, kept when teamKeys is empty
let teamRoster = {};                           // team id -> {epoch, desks}: the desk ids of the file heeded at that epoch
let teamRevSeen = {};                          // team id -> {lead public -> {epoch, rev}}: the highest rev heeded at that key's highest epoch; above 0, or 0 where a newer epoch with no rev raised a floor already kept
let teamChannel = {};                          // team id -> {kind: "relay", rt, url}: the channel of the file heeded; none is the folder
let teamPinFrom = {};                          // team id -> "invite", "policy" or "answer": what pinned its lead; none is the file's own vouching
let teamRingAt = null;                         // {root, relay, ring}: the channel and signed ring of the file last heeded at root; this run only
let teamHeadT = {};                            // team id -> highest t seen in a genuine head; this run only
let teamShown = {};                            // team id -> {lead?, folder?}: the lead's name an invitation gave, the folder its file was heeded in
const teamOpened = new Set();                  // catalog ids this desk has opened from an envelope, kept in the desk envelope
const teamSeen = new Set();                    // teams whose pinned lead key the agent has been shown, kept in the desk envelope
const teamBarred = new Set();                  // teams whose lead the agent forgot: no first admission but by an answered request
const teamHeldOut = new Set();                 // relay teams a left-behind desk took a new lead's invitation for: its files stay here until "It matches"
let teamLeft = {};                             // of those, a team the agent left with Leave this team -> when, as an ISO date
let teamLapseSeen = {};                        // team id -> "<step>:<until>": the lapse notice the agent dismissed, so a renewed grant's next lapse shows again
let teamContentSaid = {};                      // team id -> the consent the agent was shown (consentOf): the switch applies only then
let catalogLineage = {};                       // catalog id -> the id it grew from, each hop this desk has seen
const catalogLineageSha = {};                  // catalog id -> the signed hash of the edition it grew from (grew.sha); this run only
let catalogRoots = {};                         // catalog id -> the root it states (grew.root), read for the private mark alone
let answerKept = null;                         // the answer on the share: {ids: its catalog's lineage, lead: sealed to the lead's box}
const catalogPrivate = new Set();              // catalog ids the agent marked private: never answered to a lead, and kept on this desk alone
let teamRelayGone = {};                        // team id -> true: the relay refused this desk as removed, so the desk stops asking and says so
let teamWas = {};                              // team id -> [{keyId, public}]: the leads this desk followed before its pin, oldest first
let teamForks = {};                            // team id -> {said, last, seen}: the forks of its lead key this desk has said, the latest, and the one the agent dismissed
let teamPauseSeen = {};                        // team id -> {t: number, paused: boolean}
let teamNeedsFolder = {};                        // team id -> {rev, lead, mirror}: moved to folder, waiting for folder
let inUseN = 0;                                // monotonic counter for in-use.ec
const LAPSE_SEEN_RE = /^(grace|read-only|lapsed|gone|unknown):(-?[0-9]+|null)$/;
const editionTeam = new Map();                 // an opened edition's pin -> the first team whose envelope held it; this run only
const editionTeams = new Map();                // pin -> every team whose envelope held it; this run only
/* A later envelope of the same pin joins editionTeams and leaves the first team in place. */
function notePinTeam(pin, team) {
  let held = editionTeams.get(pin);
  if (!held) editionTeams.set(pin, held = new Set());
  held.add(team);
  const was = editionTeam.get(pin);
  if (was === undefined || was === team) editionTeam.set(pin, team);
}
let teamStamp = "";                            // what the team file, the ring and the box were when last heeded
const teamListedLast = {};                     // team id -> the catalogs the last file heeded this run listed
const teamSaid = new Set();
/* Whether a team file is whole under the lead key it names, which is what the engine's v2TeamSigState says. */
function teamWhole(doc) {
  const lead = doc && doc.lead, sig = doc && doc.sig;
  const teamCovered = doc;
  try {
    return +doc.format === 1 && doc.kind === "etiuda-team" && SEALED_TEAM_RE.test(String(doc.id)) && Number.isInteger(doc.epoch)
      && doc.epoch >= 1 && Array.isArray(doc.roster) && !!lead && typeof lead === "object" && typeof lead.keyId === "string"
      && /^[0-9a-f]{64}$/.test(String(lead.public)) && (lead.box === undefined || /^[0-9a-f]{64}$/.test(lead.box))
      && !!sig && sig.keyId === lead.keyId && /^[0-9a-f]{128}$/.test(String(sig.value))
      && crypto.verify(null, signedBytesOf(teamCovered), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(lead.public, "hex")]),
        format: "der", type: "spki" }), Buffer.from(sig.value, "hex"));
  } catch { return false; }
}
/* A whole team file's revision: absent is 0, and anything but a whole number from 0 is null, which nothing heeds. */
function teamRevOf(doc) {
  if (doc.rev === undefined) return 0;
  return Number.isSafeInteger(doc.rev) && doc.rev >= 0 ? doc.rev : null;
}
/* A whole team file's channel: absent is the folder; null where it is neither the folder nor a relay named by its relay
   team id and an https address, which nothing heeds. */
function teamChannelOf(doc) {
  const c = doc.channel;
  if (c === undefined) return { kind: "folder" };
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  if (c.kind === "folder") return { kind: "folder" };
  if (c.kind !== "relay" || typeof c.rt !== "string" || !/^[0-9a-f]{32}$/.test(c.rt) || typeof c.url !== "string"
    || c.url.length > 512 || !/^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?(?:\/[A-Za-z0-9._~-]+)*\/?$/.test(c.url)) return null;
  return { kind: "relay", rt: c.rt, url: c.url };
}
/* THE LEAD'S SWITCH FOR READING A CATALOG THE TEAM DOES NOT LIST: the team file's `content`, signed with the rest of it, as
   {by, at}, or null, which is off. Read in this one shape only, so a field or a format this build does not know reads as off. */
const CONTENT_SWITCH_FORMAT = 1;
function teamContentOf(doc) {
  const c = doc && doc.content;
  if (!c || typeof c !== "object" || Array.isArray(c) || Object.keys(c).sort().join(",") !== "at,by,format,on") return null;
  if (c.format !== CONTENT_SWITCH_FORMAT || c.on !== true || typeof c.by !== "string" || typeof c.at !== "string") return null;
  const by = c.by;
  if (!by || by.length > 120 || by.trim() !== by || Array.from(by).some(ch => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(c.at) || !Number.isFinite(Date.parse(c.at))) return null;
  return { by: by, at: c.at };
}
/* On the relay the ring is the signed file's own `ring`, or none. */
function teamRingIn(doc) {
  const g = doc.ring;
  return !!g && typeof g === "object" && !Array.isArray(g) ? g : null;
}
/* Whether the floor kept for a file's team and lead key refuses it: an older epoch, or the same epoch and a lower rev. */
function teamRevRefused(floor, epoch, rev) {
  if (floor && epoch < floor.epoch) return true; /* plant:epoch-rev */
  return !!floor && floor.epoch === epoch && rev < floor.rev;
}
/* The desk ids a whole team file's roster lists, sorted and once each. */
function rosterIdsOf(doc) {
  const roster = Array.isArray(doc && doc.roster) ? doc.roster : [];
  return deskIdsOnce(roster.map(x => (x && x.desk && typeof x.desk === "object" ? x.desk.id : "")));
}
function deskIdsOnce(list) {
  return Array.from(new Set(list.map(String).filter(id => /^k-[0-9a-f]{16}$/.test(id)))).sort();
}
/* Whether a ring document lists this team's lead key for a catalog the team covers, read as v2RingRead reads a ring.
   The file itself is the shell's to read. */
function memberRingVouches(doc, ring) {
  const covers = Array.isArray(doc.catalogs) ? doc.catalogs.map(String) : [];
  return !!ring && typeof ring === "object" && +ring.format === 1 && ring.kind === "etiuda-ring" && Array.isArray(ring.keys)
    && ring.keys.some(e => !!e && typeof e === "object" && covers.indexOf(String(e.catalog)) >= 0 && e.keyId === doc.lead.keyId
      && e.alg === "Ed25519" && e.public === doc.lead.public);
}
/* A copy of the membership a heed is given, so the caller's pins, keys and barred list stay as they were. */
function memberStateCopy(state) {
  const pins = Object.assign({}, state && state.pins);
  const keys = {}, src = (state && state.keys) || {};
  Object.keys(src).forEach(t => { keys[t] = Object.assign({}, src[t]); });
  return { pins: pins, keys: keys, barred: Array.isArray(state && state.barred) ? state.barred.slice() : [],
    join: (state && state.join) || null };
}
/* What heeding one team file changes for one member. `doc` is the parsed file, or null. `state` is
   {pins, keys, barred, join}: pins is a team id to {keyId, public}, keys is a team id to the epochs
   already kept, barred is the team ids with no first admission, and join is the one request or null.
   `seen` is {file, member, ring}: file is the path the words name, member is null or {id, sk} where sk
   is the opened box key, false where that box would not open, or null where it has not been opened yet,
   and ring is the parsed ring, null where there is none, or absent where it has not been read.
   Returns the new state, the key (a buffer, null, or false where the box would not open) and the lines
   to say. A new epoch's key is returned for the caller to seal; it is not written into state, because
   a seal can fail. Where needKey or needRing is set, nothing was decided and the caller calls again.
   A key below state.epochSeen for that team is not kept. Pure: only these declarations, crypto, Buffer and the arguments. */
function memberHeed(doc, state, seen) {
  const file = seen && typeof seen.file === "string" ? seen.file : "";
  const look = seen || {};
  const out = memberStateCopy(state);
  const said = [];
  const ret = (extra) => Object.assign({ state: out, key: null, said: said, stampClear: false, changed: false,
    stop: false, needKey: false, needRing: false, team: "", epoch: 0, keep: false, unbar: false, pinned: false }, extra);
  if (!teamWhole(doc)) {
    said.push(file + " is not a team file whole under its lead's key, so nothing in it is used");
    return ret({ stop: true });
  }
  const lead = { keyId: doc.lead.keyId, public: doc.lead.public }, pin = out.pins[doc.id], hadPin = !!pin;
  const handed = hadPin && (pin.keyId !== lead.keyId || pin.public !== lead.public);
  if (handed && !handedTo(doc, pin)) {
    said.push(file + " is signed by a key other than the lead's this desk trusts for team " + doc.id + ", so nothing in it is used");
    return ret({ stop: true, team: doc.id });
  }
  const join = out.join;
  /* An invitation already names its lead, so that lead is the one a first admission must carry, unless that team's
     lead has since been forgotten here: the bar holds until a request is answered. With no invitation the waiting
     request still names nobody, and a file under any lead stops without a word. */
  const carried = join && join.invite && out.barred.indexOf(String(join.team)) < 0 && join.invite.lead;
  const inviteLead = carried && /^[0-9a-f]{64}$/.test(String(carried.public))
    ? { keyId: String(carried.keyId || ""), public: String(carried.public) } : null;
  const asked = !hadPin && join && join.team === doc.id
    ? (inviteLead || (join.opened ? join.opened.lead : { keyId: "", public: "" }))
    : !hadPin && out.barred.indexOf(doc.id) >= 0 ? { keyId: "", public: "" } : null;
  if (asked && (asked.keyId !== lead.keyId || asked.public !== lead.public)) {
    if (asked.public)
      said.push(file + " is signed by a key other than the lead this desk asked to join team " + doc.id + ", so nothing in it is used");
    return ret({ stop: true, team: doc.id });
  }
  const invited = !!(inviteLead && join && join.team === doc.id && inviteLead.keyId === lead.keyId && inviteLead.public === lead.public);
  const member = look.member;
  let entry = null;
  if (member && Array.isArray(doc.roster)) entry = doc.roster.find(x => !!x && !!x.desk && x.desk.id === member.id) || null;
  const hasWrap = !!(entry && entry.wrap);
  if (hasWrap && (member.sk === null || member.sk === undefined)) return ret({ needKey: true, team: doc.id });
  let key = null;
  if (hasWrap) key = member.sk ? unwrapTeamKey(member.sk, entry.wrap, doc.id, doc.epoch, member.id) : false;
  if (!hadPin && !key && !invited && look.ring === undefined) return ret({ needRing: true, key: key, stampClear: key === false, team: doc.id });
  if (!hadPin && !key && !invited && !memberRingVouches(doc, look.ring)) return ret({ stop: true, key: key, stampClear: key === false, team: doc.id });
  let changed = false, pinned = false, unbar = false;
  if (!hadPin || handed) { out.pins[doc.id] = lead; pinned = true; changed = true; }
  if (!hadPin) {
    const at = out.barred.indexOf(doc.id);
    if (at >= 0) out.barred.splice(at, 1);
    unbar = true;
  }
  if (handed) said.push(file + " hands team " + doc.id + " from the lead key this desk trusted to " + lead.public + ", which it now trusts instead");
  const kept = out.keys[doc.id] || {};
  const seenMap = state && state.epochSeen && typeof state.epochSeen === "object" && !Array.isArray(state.epochSeen) ? state.epochSeen : null;
  const seenAt = seenMap && Number.isInteger(seenMap[doc.id]) ? seenMap[doc.id] : 0;
  return ret({ key: key, stampClear: key === false, changed: changed, team: doc.id, epoch: doc.epoch,
    keep: !!(key && !kept[doc.epoch] && !(seenAt > 0 && doc.epoch < seenAt)), unbar: unbar, pinned: pinned });
}
/* AN ADMINISTRATOR NAMES THE TEAM IN MACHINE POLICY. The desk reads the Etiuda pair; Studio's pair
   is in the same template and is not read here. A value that is not the form below is said and
   ignored, and one bad value of a pair leaves the other unused. Nothing set leaves heeding as it was. */
const REG_TOOL = "C:\\Windows\\System32\\reg.exe";
const POLICY_KEY = "HKLM\\SOFTWARE\\Policies\\Etiuda";
const POLICY_LEAD_RE = /^[0-9a-f]{64}$/;
const POLICY_WORDS = {
  en: {
    folder: "The team folder set in Group Policy is not a full path, so this desk keeps the folder it already uses.",
    lead: "The team lead's key set in Group Policy is not written as 64 lowercase hexadecimal characters, so this desk does not trust it.",
    beside: "The other value set beside it is not used either: the two are taken together or not at all.",
  },
  pl: {
    folder: "Folder zespołu ustawiony w zasadach grupy nie jest pełną ścieżką, więc stanowisko zostaje przy folderze, którego już używa.",
    lead: "Klucz lidera zespołu ustawiony w zasadach grupy nie ma postaci 64 małych znaków szesnastkowych, więc stanowisko go nie przyjmuje.",
    beside: "Druga wartość ustawiona obok też nie zostanie użyta: obie są przyjmowane razem albo wcale.",
  },
};
/* The key as reg export heads its section, the hive written out and the rest as asked. */
const POLICY_HEAD = "HKEY_LOCAL_MACHINE" + POLICY_KEY.slice(4);
const POLICY_EXPORT_LINE = "Windows Registry Editor Version 5.00\r\n";
/* The key's own values in the text of reg export's file, by lower-case name as {type, value}: a string as
   the registry holds it, its two escapes undone and nothing trimmed, line breaks included, and an expandable
   or multiple string as its UTF-16 text, a DWORD as its number in decimal. Null where anything in the text is not what reg writes, a subkey's
   values aside, so no part of a read in doubt is used. */
function policyValues(text) {
  const t = String(text), own = Object.create(null);
  const HEAD = /\[([^\r\n]*)\]\r\n/y;
  const VALUE = /(?:@|"((?:[^"\\]|\\[\\"])*)")=(?:"((?:[^"\\]|\\[\\"])*)"|(dword):([0-9a-f]{8})|(hex(?:\([0-9a-f]{1,8}\))?):((?:[0-9a-f]{2}(?:,[0-9a-f]{2})*,?)?(?:\\\r\n {2}[0-9a-f]{2}(?:,[0-9a-f]{2})*,?)*))\r\n/y;
  const plain = s => s.replace(/\\([\\"])/g, "$1");
  const WIDE = { "hex(2)": "REG_EXPAND_SZ", "hex(7)": "REG_MULTI_SZ" };
  const wide = hex => { const b = Buffer.from(hex.replace(/[^0-9a-f]/g, ""), "hex"); return b.length % 2 ? "" : b.toString("utf16le").replace(/\u0000+$/, ""); };
  if (!t.startsWith(POLICY_EXPORT_LINE)) return null;
  let at = POLICY_EXPORT_LINE.length, section = "";
  while (at < t.length) {
    if (t.startsWith("\r\n", at)) { at += 2; continue; }
    HEAD.lastIndex = at;
    VALUE.lastIndex = at;
    let m = HEAD.exec(t);
    if (m) {
      if (!section && m[1] === POLICY_HEAD) section = "own";
      else if (section && m[1].startsWith(POLICY_HEAD + "\\")) section = "sub";
      else return null;
      at = HEAD.lastIndex;
      continue;
    }
    m = section ? VALUE.exec(t) : null;
    if (!m) return null;
    if (section === "own" && m[1] !== undefined) {
      const name = plain(m[1]).toLowerCase();
      if (name in own) return null;
      own[name] = m[2] !== undefined ? { type: "REG_SZ", value: plain(m[2]) }
        : m[3] ? { type: "dword", value: String(parseInt(m[4], 16)) }
        : WIDE[m[5]] ? { type: WIDE[m[5]], value: wide(m[6]) } : { type: m[5], value: "" };
    }
    at = VALUE.lastIndex;
  }
  return section ? own : null;
}
function policyExpand(s) {
  if (typeof s !== "string" || s.indexOf("%") < 0) return s;
  const env = (typeof process !== "undefined" && process && process.env) || {};
  let bad = false;
  const res = s.replace(/%([^%]+)%/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(env, name) && typeof env[name] === "string") return env[name];
    const upper = name.toUpperCase();
    for (const k of Object.keys(env)) {
      if (k.toUpperCase() === upper && typeof env[k] === "string") return env[k];
    }
    bad = true;
    return match;
  });
  return bad ? null : res;
}
/* One named value, or unset where it is absent or an empty string. */
function policyRegSz(values, name) {
  const v = values ? values[name.toLowerCase()] : undefined;
  if (!v || ((v.type === "REG_SZ" || v.type === "REG_EXPAND_SZ") && v.value === "")) return { set: false, type: "", value: "" };
  return { set: true, type: v.type, value: v.value };
}
/* A Windows absolute path: a drive or a share, no segment that walks out of it or names a stream, and no space at either end. */
function policyFolderOk(s) {
  if (typeof s !== "string" || s.length < 3 || s.length > 1024) return false;
  if (s !== s.trim()) return false;
  if (/[\u0000-\u001f\u007f]/.test(s)) return false;
  if (/[*?"<>|]/.test(s)) return false;
  const drive = /^[A-Za-z]:[\\/]/.test(s);
  const unc = /^\\\\[^\\]+\\[^\\]+/.test(s);
  if (!drive && !unc) return false;
  const trimmed = /[\\/]$/.test(s) ? s.slice(0, -1) : s;
  const parts = trimmed.split(/[\\/]/);
  const segment = p => p.length > 0 && p !== "." && p !== ".." && p.indexOf(":") < 0;
  if (drive) {
    if (!/^[A-Za-z]:$/.test(parts[0])) return false;
    return parts.slice(1).every(segment);
  }
  if (parts.length < 4 || parts[0] !== "" || parts[1] !== "") return false;
  return parts.slice(2).every(segment);
}
function policyLeadOk(s) { return typeof s === "string" && POLICY_LEAD_RE.test(s); }
/* AN ADMINISTRATOR TURNS THE HOURLY LOOK FOR A NEW VERSION OFF (Claude α's decision 10, 2026-11-11): DeskNoUpdateCheck in
   this key, machine policy alone, read and never written. Set to anything but 0, as a DWORD or a string, the desk asks for
   no version note and offers none; absent, empty or 0 leaves the look on. A key the parser cannot read is no policy. */
function policyNoUpdate(values) {
  const v = values ? values["desknoupdatecheck"] : undefined;
  if (!v) return false;
  const s = String(v.value).trim();
  return !((v.type === "dword" || v.type === "REG_SZ" || v.type === "REG_EXPAND_SZ") && (s === "" || s === "0"));
}
/* `text` is the text of reg export's file for the policy key, or empty where there is none.
   Returns {folder, lead, bad, noUpdate, values}: folder and lead empty where unused, bad the names of the words to say, noUpdate
   true where policy turns the version look off, values policyValues' reading for the readers of the key's other values. */
function joinPolicyFacts(text) {
  const values = text ? policyValues(text) : null;
  const noUpdate = policyNoUpdate(values);
  const folder = policyRegSz(values, "TeamFolder");
  const lead = policyRegSz(values, "LeadKey");
  const bad = [];
  let folderOk = !folder.set, leadOk = !lead.set, folderValue = "", leadValue = "";
  if (folder.set) {
    if (folder.type === "REG_SZ" && policyFolderOk(folder.value)) { folderOk = true; folderValue = folder.value; }
    else if (folder.type === "REG_EXPAND_SZ") {
      const exp = policyExpand(folder.value);
      if (exp !== null && policyFolderOk(exp)) { folderOk = true; folderValue = exp; }
      else bad.push("folder");
    }
    else bad.push("folder");
  }
  if (lead.set) {
    if (lead.type === "REG_SZ" && policyLeadOk(lead.value)) { leadOk = true; leadValue = lead.value; }
    else if (lead.type === "REG_EXPAND_SZ") {
      const exp = policyExpand(lead.value);
      if (exp !== null && policyLeadOk(exp)) { leadOk = true; leadValue = exp; }
      else bad.push("lead");
    }
    else bad.push("lead");
  }
  if ((folder.set || lead.set) && (!folderOk || !leadOk)) {
    if (folder.set && folderOk && !leadOk) bad.push("beside");
    if (lead.set && leadOk && !folderOk) bad.push("beside");
    return { folder: "", lead: "", bad: bad, noUpdate: noUpdate, values: values };
  }
  return { folder: folderValue, lead: leadValue, bad: bad, noUpdate: noUpdate, values: values };
}
/* The facts with their sentences in `lang`, "pl" or anything else for English: {folder, lead, said, noUpdate}. */
function policyWords(facts, lang) {
  const words = POLICY_WORDS[lang === "pl" ? "pl" : "en"];
  return { folder: facts.folder, lead: facts.lead, said: facts.bad.map(k => words[k]), noUpdate: facts.noUpdate === true };
}
function joinPolicyFrom(text, lang) { return policyWords(joinPolicyFacts(text), lang); }
let joinPolicyRead = null;
/* Read once a run, whatever the language. The one program started is reg.exe at its fixed path, exporting
   this one key to a scratch file, which holds the registry's own UTF-16 where reg's printing would be in the
   console's code page. A failure, and any system but Windows, is no policy. The scratch file and its folder
   go whatever happens, and nothing of them is logged. */
function readJoinPolicy(lang) {
  if (joinPolicyRead === null) {
    let text = "";
    if (process.platform === "win32") {
      let dir = "", file = "";
      try {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-policy-"));
        file = path.join(dir, "policy.reg");
        execFileSync(REG_TOOL, ["export", POLICY_KEY, file, "/y"], { windowsHide: true, timeout: 5000, stdio: "ignore" });
        const bytes = fs.readFileSync(file);
        if (bytes.length % 2 === 0 && bytes[0] === 0xff && bytes[1] === 0xfe) text = bytes.subarray(2).toString("utf16le");
      } catch { text = ""; }
      finally {
        if (file) { try { fs.unlinkSync(file); } catch { /* never written */ } }
        if (dir) { try { fs.rmdirSync(dir); } catch { /* never made */ } }
      }
    }
    joinPolicyRead = joinPolicyFacts(text);
  }
  return policyWords(joinPolicyRead, lang);
}
/* True where machine policy turns the version look off; read with the team values, once a run. */
function updateLookOff() {
  try { return readJoinPolicy("en").noUpdate === true; } catch { return false; }
}
/* THE DESK'S OPTIONAL CUSTOMER MODEL (board 992). Off by default; on, the organisation's own service ranks the search and the
   suggestions, and deskAiConfig is the one place its address and key are handed on. The person's choice and fields are kept in
   desk-ai.json beside desk.json, the key apart in desk-ai-key.json, sealed by safeStorage with the address it was given for,
   and machine policy wins field by field. Nothing in this part makes a request. */
const DESK_AI_FILE = "desk-ai.json";
const DESK_AI_KEY_FILE = "desk-ai-key.json";
const DESK_AI_KIND = "etiuda-desk-ai";
const DESK_AI_KEY_KIND = "etiuda-desk-ai-key";
/* Each service's published address, the one used only where neither the person nor the policy named one, "" meaning one
   must be given: the adapter module's table, the only one, so Settings, the policy and the requests cannot disagree. */
const DESK_AI_SERVICES = deskAi.PROVIDERS;
const DESK_AI_MODEL_MAX = 256;
const DESK_AI_KEY_MAX = 8192;
const DESK_AI_CONTROL_RE = /[\x00-\x1f\x7f]/;
/* The connection test's whole question: a fixed prompt, and no catalog text with it, the one the door sends. */
const DESK_AI_TEST_PROMPT = deskAi.TEST_PROMPT;
function deskAiService(provider) {
  return typeof provider === "string" && Object.prototype.hasOwnProperty.call(DESK_AI_SERVICES, provider) ? DESK_AI_SERVICES[provider] : null;
}
/** An https address in its canonical form, its path ending in "/", the service's own route taken off where it was pasted
 *  whole; "" where it is not https or carries a user, a password, a query or a fragment. */
function deskAiEndpointShape(text, provider) { return deskAi.endpointShape(text, provider); }
/* MACHINE POLICY FOR THE OPTION, from policyValues' reading: AiProvider, AiEndpoint, AiModel and AiKey, the values Studio's
   template names, and the desk's own switch DeskOrganisationModel, 1 for on and 0 for off, either one fixed here, absent or
   empty leaving the choice to the person. Strings are taken as written, an expandable one too. A value that cannot be used is
   left out alone and named in `ignored`. Answers {on: true, false or null, provider, endpoint, model, key, ignored}. */
function deskAiPolicyFrom(values) {
  const out = { on: null, provider: "", endpoint: "", model: "", key: "", ignored: [] };
  if (!values) return out;
  const own = name => (Object.prototype.hasOwnProperty.call(values, name.toLowerCase()) ? values[name.toLowerCase()] : null);
  const text = name => {
    const v = own(name);
    if (!v) return "";
    if (v.type !== "REG_SZ" && v.type !== "REG_EXPAND_SZ") { out.ignored.push(name); return ""; }
    return String(v.value).trim();
  };
  const held = (s, max) => s.length <= max && !DESK_AI_CONTROL_RE.test(s);
  const sw = own("DeskOrganisationModel");
  if (sw) {
    const s = String(sw.value).trim(), str = sw.type === "REG_SZ" || sw.type === "REG_EXPAND_SZ";
    if ((str || sw.type === "dword") && s === "1") out.on = true;
    else if ((str || sw.type === "dword") && s === "0") out.on = false;
    else if (!(str && s === "")) out.ignored.push("DeskOrganisationModel");
  }
  const provider = text("AiProvider").toLowerCase();
  if (provider) { if (deskAiService(provider)) out.provider = provider; else out.ignored.push("AiProvider"); }
  const endpoint = text("AiEndpoint");
  if (endpoint) {
    const shaped = deskAiEndpointShape(endpoint, out.provider);
    if (shaped) out.endpoint = shaped; else out.ignored.push("AiEndpoint");
  }
  const model = text("AiModel");
  if (model) { if (held(model, DESK_AI_MODEL_MAX)) out.model = model; else out.ignored.push("AiModel"); }
  const key = text("AiKey");
  if (key) { if (held(key, DESK_AI_KEY_MAX)) out.key = key; else out.ignored.push("AiKey"); }
  return out;
}
/** The person's fields `me` ({choice, provider, endpoint, model}) under `org` (deskAiPolicyFrom's answer), policy first, field
 *  by field: {on, provider, given, endpoint, model, managed, keyAway}, `given` the address written and `endpoint` the one a
 *  request would go to. `keyAway` is true where the policy set a key and that address is neither the policy's own nor, with
 *  none set, the service's published one, since the organisation's key never goes to an address typed here. Pure. */
function deskAiJoin(me, org) {
  const p = me || {}, o = org || {};
  const pick = (a, b) => (a ? { value: a, managed: true } : { value: typeof b === "string" ? b : "", managed: false });
  const choiceSet = o.on === true || o.on === false;
  const provider = pick(o.provider, p.provider), model = pick(o.model, p.model);
  /* The person's address belongs to the service the person chose, so it is not carried over to another the policy chose. */
  const endpoint = pick(o.endpoint, o.provider && o.provider !== p.provider ? "" : p.endpoint);
  const service = deskAiService(provider.value);
  const at = !service ? "" : endpoint.value ? deskAiEndpointShape(endpoint.value, provider.value) : service.endpoint;
  const home = endpoint.managed || (at !== "" && service && at === service.endpoint);
  return {
    on: choiceSet ? o.on : p.choice === "organisation",
    provider: provider.value, given: endpoint.value, endpoint: at, model: model.value,
    managed: { choice: choiceSet, provider: provider.managed, endpoint: endpoint.managed, model: model.managed, key: !!o.key },
    keyAway: !!o.key && !home,
  };
}
function deskAiReadyOf(j, key) { return !!(j && deskAiService(j.provider) && j.endpoint && j.model && key); }
/** What Settings is told, the key never among it: whether one is in force, and nothing of it. Pure. */
function deskAiAnswer(j, keyIn, ignored, sealable, stored) {
  let host = "";
  try { host = j.endpoint ? new URL(j.endpoint).host : ""; } catch { host = ""; }
  return {
    choice: j.on ? "organisation" : "builtin", on: !!j.on, ready: !!j.on && deskAiReadyOf(j, keyIn),
    provider: j.provider, endpoint: j.given, at: j.endpoint, host: host, model: j.model,
    keyKept: !!keyIn || !!stored, keyAway: !!j.keyAway, managed: Object.assign({}, j.managed),
    ignored: Array.isArray(ignored) ? ignored.slice() : [], sealable: !!sealable,
    services: Object.keys(DESK_AI_SERVICES).map(id => ({ id: id, endpoint: DESK_AI_SERVICES[id].endpoint })),
  };
}
/** Why a save from Settings is refused, or "": a field machine policy set ("managed"), a choice, a service, an address, a model
 *  or a key this desk cannot hold, each by its own name. `fields` holds only the strings the page sent. Pure. */
function deskAiRefusal(fields, j) {
  const f = fields || {}, has = k => typeof f[k] === "string";
  if (["choice", "provider", "endpoint", "model", "key"].some(k => has(k) && j.managed[k])) return "managed";
  if (has("choice") && f.choice !== "organisation" && f.choice !== "builtin") return "choice";
  if (has("provider") && f.provider !== "" && !deskAiService(f.provider)) return "provider";
  if (has("endpoint") && f.endpoint.trim() !== "" && !deskAiEndpointShape(f.endpoint, has("provider") ? f.provider : j.provider)) return "endpoint";
  if (has("model") && (f.model.trim().length > DESK_AI_MODEL_MAX || DESK_AI_CONTROL_RE.test(f.model))) return "model";
  if (has("key") && (f.key.trim().length > DESK_AI_KEY_MAX || DESK_AI_CONTROL_RE.test(f.key.trim()))) return "key";
  return "";
}
function deskAiPath(name) { return path.join(app.getPath("userData"), name); }
/* The person's own choice and fields, or the defaults, off, where the file is absent or not of this kind. */
function deskAiPerson() {
  const none = { choice: "builtin", provider: "", endpoint: "", model: "" };
  let doc = null;
  try { doc = JSON.parse(fs.readFileSync(deskAiPath(DESK_AI_FILE), "utf8")); } catch { return none; }
  if (!doc || typeof doc !== "object" || doc.kind !== DESK_AI_KIND || doc.format !== 1) return none;
  const str = v => (typeof v === "string" ? v : "");
  return { choice: doc.choice === "organisation" ? "organisation" : "builtin", provider: str(doc.provider), endpoint: str(doc.endpoint), model: str(doc.model) };
}
/* The person's key as sealed, {for, key}, or null where there is none or this account cannot open it. ONLY A SAVE FROM SETTINGS
   READS IT WHOLE, to carry the key to the address the person chose; a request takes it through deskAiKeyFor alone. */
function deskAiKeyInner() {
  try {
    const doc = JSON.parse(fs.readFileSync(deskAiPath(DESK_AI_KEY_FILE), "utf8"));
    if (!doc || doc.kind !== DESK_AI_KEY_KIND || doc.format !== 1 || typeof doc.sealed !== "string") return null;
    const inner = JSON.parse(safeStorage.decryptString(Buffer.from(doc.sealed, "base64")));
    return inner && typeof inner.for === "string" && typeof inner.key === "string" && inner.key ? inner : null;
  } catch { return null; }
}
/* The person's key where it was given for `endpoint`, else "": a key goes only to the address it was sealed with. */
function deskAiKeyFor(endpoint) {
  if (!endpoint) return "";
  const inner = deskAiKeyInner();
  return inner && inner.for === endpoint ? inner.key : "";
}
function deskAiPolicy() {
  try { readJoinPolicy("en"); } catch { /* no policy is read as none */ }
  return deskAiPolicyFrom(joinPolicyRead && joinPolicyRead.values);
}
/* WHAT IS IN FORCE, KEPT IN MEMORY: every search, picker opening and the page's two-second look asks deskAiConfig, so the two
   files are read and the key unsealed once, and again only after deskAiForget (every save or forget from Settings) or a new
   reading of machine policy. A file edited behind the running desk's back is read at the next save or start. */
let deskAiKept = null;
function deskAiForget() { deskAiKept = null; }
/* Everything in force now: {joined, policy, key}, the key the one a request would carry, "" where none would go. */
function deskAiNow() {
  const policy = deskAiPolicy();
  if (deskAiKept && deskAiKept.from === joinPolicyRead) return deskAiKept.now;
  const joined = deskAiJoin(deskAiPerson(), policy);
  const key = policy.key ? (joined.keyAway ? "" : policy.key) : deskAiKeyFor(joined.endpoint);
  const now = { joined: joined, policy: policy, key: key };
  deskAiKept = { from: joinPolicyRead, now: now };
  return now;
}
/** THE ONE PLACE THE ADDRESS AND THE KEY ARE HANDED ON. Null while the option is off or anything a request needs is missing;
 *  else {provider, endpoint, model, key, managed}, endpoint the address a request goes to, as deskAiEndpointShape writes it.
 *  Null on a harness launch too, as the note look is, so no test start sends a query to a service configured on this desk. */
function deskAiConfig() {
  if (harnessLaunch()) return null;
  let now = null;
  try { now = deskAiNow(); } catch { return null; }
  const j = now.joined;
  if (!j.on || !deskAiReadyOf(j, now.key)) return null;
  return { provider: j.provider, endpoint: j.endpoint, model: j.model, key: now.key, managed: Object.assign({}, j.managed) };
}
function deskAiSettings() {
  const now = deskAiNow(), inner = now.policy.key ? null : deskAiKeyInner();
  return deskAiAnswer(now.joined, !!now.key, now.policy.ignored, branchSealable(), !!(inner && inner.for === ""));
}
/* A save from Settings: only the fields sent change, and a key typed is sealed for the address the save leaves in force. A key
   kept for one address is forgotten by a save that moves to another (below). An empty key leaves the kept one as it is.
   Answers {ok, why, keyDropped, settings}, settings as deskAiSettings, and writes nothing where it refuses. */
function deskAiSave(fields) {
  const f = {};
  if (fields && typeof fields === "object") {
    for (const k of ["choice", "provider", "endpoint", "model", "key"]) if (typeof fields[k] === "string") f[k] = fields[k];
  }
  let before = null;
  deskAiForget();
  try { before = deskAiNow(); } catch { return { ok: false, why: "unwritten", settings: null }; }
  const answer = () => { deskAiForget(); try { return deskAiSettings(); } catch { return null; } };
  const why = deskAiRefusal(f, before.joined);
  if (why) return { ok: false, why: why, settings: answer() };
  const me = deskAiPerson();
  const provider = f.provider !== undefined ? f.provider : me.provider;
  const next = {
    choice: f.choice !== undefined ? f.choice : me.choice, provider: provider,
    endpoint: f.endpoint !== undefined ? (f.endpoint.trim() ? deskAiEndpointShape(f.endpoint, provider) : "") : me.endpoint,
    model: f.model !== undefined ? f.model.trim() : me.model,
  };
  const after = deskAiJoin(next, before.policy);
  const typed = f.key !== undefined ? f.key.trim() : "";
  const moves = f.provider !== undefined || f.endpoint !== undefined;
  const kept = before.policy.key || !moves ? null : deskAiKeyInner();
  /* A KEY NEVER FOLLOWS A CHANGED ADDRESS (Argon's finding 1 of the 992 review, as Studio's a9a3c5bc): a key kept for a real
     address is forgotten by a save that moves to another and no key typed, and Settings says to give it again. Only a key
     typed before any address was named, sealed for "", goes to the first address named. */
  const carried = kept && kept.for === "" && after.endpoint ? kept.key : "";
  const dropped = !typed && !carried && !!kept && kept.for !== "" && kept.for !== after.endpoint;
  const key = typed || carried;
  if (key && !branchSealable()) return { ok: false, why: "unsealed", settings: answer() };
  try {
    if (key) {
      const sealed = safeStorage.encryptString(JSON.stringify({ for: after.endpoint, key: key })).toString("base64");
      writeReplacing(deskAiPath(DESK_AI_KEY_FILE), JSON.stringify({ format: 1, kind: DESK_AI_KEY_KIND, sealed: sealed }));
    } else if (dropped) fs.unlinkSync(deskAiPath(DESK_AI_KEY_FILE));
    writeReplacing(deskAiPath(DESK_AI_FILE), JSON.stringify(Object.assign({ format: 1, kind: DESK_AI_KIND }, next), null, 2) + "\n");
  } catch { return { ok: false, why: "unwritten", settings: answer() }; }
  return { ok: true, why: "", keyDropped: dropped, settings: answer() };
}
/* The door's one ask of `config` with the test's fixed prompt (shell/desk-ai.cjs connectionTest), answered {ok, why, ms,
   status}: why "busy", "late", "unreached" or "answer" (an error or an answer with no text), ms the service's own time. */
function deskAiProbe(config, prompt) {
  if (!config || prompt !== DESK_AI_TEST_PROMPT) return Promise.resolve({ ok: false, why: "none" });
  return deskAi.connectionTest(deskAiFetch, config).then(r => ({ ok: r.ok === true, why: r.ok === true ? "" : String(r.why || "answer"),
    ms: r.ms, status: r.status }));
}
/* The connection test, on the fields in force whether the option is on or not: the fixed prompt, through the door. Answers
   {ok, why, host, model, ms}, why naming what is missing before anything is asked and ms the wait for the answer. */
function deskAiTest() {
  let now = null;
  try { now = deskAiNow(); } catch { return Promise.resolve({ ok: false, why: "none", host: "", model: "" }); }
  const j = now.joined, a = deskAiAnswer(j, !!now.key, [], false);
  const said = why => Promise.resolve({ ok: false, why: why, host: a.host, model: j.model });
  if (!deskAiService(j.provider)) return said("provider");
  if (!j.endpoint) return said("endpoint");
  if (!j.model) return said("model");
  if (j.keyAway) return said("keyAway");
  if (!now.key) return said("key");
  const config = { provider: j.provider, endpoint: j.endpoint, model: j.model, key: now.key, managed: Object.assign({}, j.managed) };
  const t0 = Date.now();
  return Promise.resolve().then(() => deskAiProbe(config, DESK_AI_TEST_PROMPT))
    .then(r => ({ ok: !!(r && r.ok === true), why: r && r.ok === true ? "" : String((r && r.why) || "failed"), host: a.host, model: j.model,
      ms: r && Number.isFinite(r.ms) && r.ms > 0 ? r.ms : Date.now() - t0 }),
      () => ({ ok: false, why: "failed", host: a.host, model: j.model }));
}
ipcMain.on("etiuda:desk-ai-settings", (e) => {
  let v = null;
  try { v = fromEngine(e) ? deskAiSettings() : null; } catch { v = null; }
  e.returnValue = v;
});
ipcMain.handle("etiuda:desk-ai-save", (e, fields) => (fromEngine(e) ? deskAiSave(fields) : { ok: false, why: "refused", settings: null }));
ipcMain.handle("etiuda:desk-ai-test", (e) => (fromEngine(e) ? deskAiTest() : { ok: false, why: "refused", host: "", model: "" }));
let joinPolicySaid = false;
function sayJoinPolicy() {
  let lang = "en";
  try { if (shellWords().lang === "pl") lang = "pl"; } catch { lang = "en"; }
  const got = readJoinPolicy(lang);
  if (!joinPolicySaid) { joinPolicySaid = true; got.said.forEach(teamSay); policyLetsInviteGo(got); }
  return got;
}
/* Case-insensitive path comparison on Windows. A UNC path and a mapped drive read as different folders. */
function policySameFolder(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ra = path.resolve(a), rb = path.resolve(b);
  return process.platform === "win32" ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}
/* Once a run, where machine policy names a folder or a lead: a join this desk keeps from an invitation is let go, with the
   pin that invitation set where it still stands, and the desk's own folder setting where the invitation's is still there,
   put back as it was before. A pin, a key or a folder the desk held before stays, and the request stays where it was
   written: that folder is not asked again. */
function policyLetsInviteGo(named) {
  if (deskKeys === undefined) deskKeys = readDesk();
  const j = teamJoin, inv = j && j.invite;
  if (!inv || !(named.folder || named.lead)) return;
  if (named.lead && inv.lead && inv.lead.public === named.lead) {
    if (!named.folder || (typeof inv.folder === "string" && policySameFolder(inv.folder, named.folder))) return;
  }
  teamJoin = null;
  const pin = teamPins[j.team];
  if (inv.pinned === true && pin && pin.keyId === inv.lead.keyId && pin.public === inv.lead.public) {
    delete teamPins[j.team];
    delete teamShown[j.team];
    delete teamPinFrom[j.team];
    teamSeen.delete(j.team);
  }
  if (typeof inv.folder === "string" && deskKeys[CATALOG_FOLDER_KEY] === inv.folder)
    deskSetOwn(CATALOG_FOLDER_KEY, typeof inv.was === "string" && inv.was ? inv.was : undefined);
  teamStamp = "";
  persistDeskEnvelope();
  teamSay("the request to join team " + j.team + " made from an invitation is let go, since machine policy names this desk's team");
}
/* `policy` is the lead's public key, or empty where no policy names one. Empty returns memberHeed's
   own answer. Any other public key is refused in the words an unpinned key already gets, handover
   included, and a file signed by this key is heeded without the ring. */
function memberHeedUnderPolicy(doc, state, seen, policy) {
  if (!policy) return memberHeed(doc, state, seen);
  if (!teamWhole(doc)) return memberHeed(doc, state, seen);
  const lead = { keyId: String(doc.lead.keyId), public: String(doc.lead.public) };
  if (lead.public !== policy) {
    const file = seen && typeof seen.file === "string" ? seen.file : "";
    const out = memberStateCopy(state);
    const said = [file + " is signed by a key other than the lead's this desk trusts for team " + doc.id + ", so nothing in it is used"];
    return { state: out, key: null, said: said, stampClear: false, changed: false, stop: true,
      needKey: false, needRing: false, team: String(doc.id), epoch: 0, keep: false, unbar: false, pinned: false };
  }
  const prior = state && state.pins ? state.pins[doc.id] : null;
  const already = !!prior && prior.public === lead.public && prior.keyId === lead.keyId;
  if (already) return memberHeed(doc, state, seen);
  const seeded = memberStateCopy(state);
  seeded.pins[doc.id] = { keyId: lead.keyId, public: lead.public };
  const barred = seeded.barred.indexOf(doc.id);
  if (barred >= 0) seeded.barred.splice(barred, 1);
  const r = memberHeed(doc, seeded, seen);
  if (r.stop || r.needKey || r.needRing) return r;
  r.pinned = true;
  r.changed = true;
  if (barred >= 0) r.unbar = true;
  return r;
}
/* The ring file beside the catalogs in `root`, or null where it is missing, larger than the reader allows, or not JSON. */
function readRingFile(root) {
  try {
    const ringFile = path.join(root, RING_NAME);
    if (fs.statSync(ringFile).size <= 65536) return JSON.parse(fs.readFileSync(ringFile, "utf8"));
  } catch { /* a missing ring vouches for nothing */ }
  return null;
}
/* The ring believed at `root` where its team is on the relay or carries its own ring: the one inside the signed team file heeded there, or null.
   Undefined on a folder channel with no ring inside the team file. Before this run has heeded a file there, a pinned team kept as on the relay is no ring. */
function relayRingAt(root) {
  if (teamRingAt && teamRingAt.root === root) return teamRingAt.relay ? teamRingAt.ring : (teamRingAt.ring || undefined); /* plant:team-ring-at */
  return Object.keys(teamChannel).some(t => !!teamPins[t] && ((teamChannel[t] && teamChannel[t].rt && relayMirrorOf(teamChannel[t].rt) === root) || (teamShown[t] || {}).folder === root)) ? null : undefined;
}
/* The ring a catalog's signature is read against. */
function readRing() {
  const root = catalogFolder(), relay = relayRingAt(root);
  return relay === undefined ? readRingFile(root) : relay;
}
/* The ring a team file's first pin is heeded with: on the folder the ring file, and on the relay none at all. The relay's
   first step let a relay file's own signed ring vouch for the key that signed it; its fourth step inverts that (board 907):
   on the relay a first pin comes from an invitation, machine policy or an answered request, never from a ring. The
   signed ring is still the one a catalog's signature is read against (relayRingAt). */
function ringHeeded(doc, root) {
  const channel = teamChannelOf(doc);
  return !channel ? null : channel.kind === "relay" ? null : readRingFile(root); /* plant:ring-relay */
}
function teamSay(line) {
  if (teamSaid.has(line)) return;
  teamSaid.add(line);
  console.error("etiuda: " + line);
}
function fileStamp(file) {
  try { const st = fs.statSync(file); return Math.round(st.mtimeMs) + "|" + st.size; } catch { return "-"; }
}
/* Every whole team file in `root`, the canonical one and its conflict siblings. */
function teamLook(root) {
  const out = [];
  for (const name of [TEAM_NAME].concat(teamSiblingFiles(root))) {
    try {
      const f = path.join(root, name);
      if (fs.statSync(f).size > TEAM_MAX) continue;
      const doc = teamParse(fs.readFileSync(f, "utf8"));
      if (doc && teamWhole(doc)) out.push(doc);
    } catch { /* a file that cannot be read shows nothing */ }
  }
  return out;
}
/* A FORK: the team's lead key seen in two hands, which a genuine handover from a key that had already handed the team on
   proves. Each is said once, kept for the page's notice until the agent dismisses it, and the page told. A fork is known by
   a digest of its kind and keys, so no name a file chose is kept or compared. */
const FORK_SAID_MAX = 16;
const FORK_KEY_RE = /^[0-9a-f]{64}$/;
const forkKeyOf = (kind, from, to) => crypto.createHash("sha256")
  .update([kind, String(from)].concat(to.map(String).sort()).join("\n"), "utf8").digest("hex");
const forkKept = v => !!v && typeof v === "object" && (v.kind === "later" || v.kind === "two") && FORK_KEY_RE.test(String(v.key))
  ? { kind: v.kind, key: v.key } : null;
function deskForkNoted(team, fork) {
  if (!SEALED_TEAM_RE.test(String(team)) || !fork || (fork.kind !== "later" && fork.kind !== "two")) return;
  const shown = { kind: fork.kind, key: forkKeyOf(fork.kind, fork.from.public, fork.to.map(k => k.public)) };
  const key = shown.key, had = teamForks[team] || { said: [], last: null, seen: "" };
  if (had.said.indexOf(key) >= 0) return; /* plant:fork-once-desk */
  teamForks[team] = { said: had.said.concat([key]).slice(-FORK_SAID_MAX), last: shown, seen: had.seen };
  persistDeskEnvelope();
  teamSay("team " + team + ": " + RelayChannel().FORK_SAID[shown.kind]);
  sendJoin(theWindow);
}
/* The leads a folder team's files are read against for a fork: those this desk followed, then `leads`, the syncer's own with
   its pin last, or the pin kept here where it names none. */
function forkChain(team, leads) {
  const given = Array.isArray(leads) ? leads.filter(k => !!k && typeof k.keyId === "string" && typeof k.public === "string") : [];
  const pin = given.length ? given[given.length - 1] : teamPins[team];
  if (!pin) return [];
  const out = [];
  for (const k of (teamWas[team] || []).concat(given.slice(0, -1))) {
    if (k.public !== pin.public && !out.some(o => o.public === k.public)) out.push({ keyId: k.keyId, public: k.public });
  }
  out.push({ keyId: pin.keyId, public: pin.public });
  return out;
}
function folderForkSeen(docs, team, leads) {
  if (deskKeys === undefined) deskKeys = readDesk();
  const fork = forkIn(docs, forkChain(team, leads), team);
  if (fork) deskForkNoted(team, fork);
  return fork;
}
/* Reads the team file where it, the ring or the desk's box has changed since, pins its lead by the rule above and
   keeps this desk's key for its epoch. What it learns is in teamPins and teamKeys, and in the desk envelope. */
function heedTeam() {
  if (deskKeys === undefined) deskKeys = readDesk();
  const root = catalogFolder();
  if (!folderAnswers(root)) return;
  const file = path.join(root, TEAM_NAME);
  const stamp = [file, fileStamp(file), teamChoiceStamp(root), fileStamp(path.join(root, RING_NAME)), deskBranch ? deskBranch.box.pub : "",
    teamJoin && teamJoin.opened ? teamJoin.team + ":" + teamJoin.opened.lead.public : "", teamJoin ? teamJoin.commit : "",
    teamJoin && teamJoin.invite ? fileStamp(path.join(root, "invites", teamJoin.invite.id + ".wrap.json")) + ":" + fileStamp(path.join(root, "invites", teamJoin.invite.id + ".refused.json")) : ""].join("|");
  if (stamp === teamStamp) return;
  /* The stamp is a verdict on the text, so a read that fails or a key that is not kept leaves it unset and the next
     call reads again. A conflict sibling is part of the stamp, so a newer genuine copy is noticed. */
  const chosen = teamTextChosen(root);
  if (chosen.missing) { teamStamp = stamp; return; }
  teamStamp = stamp;
  /* A canonical file that is not JSON, and no sibling taken in its place, is the same quiet return as before. */
  if (chosen.text != null && chosen.doc == null && chosen.file === file) return;
  const doc = chosen.doc;
  const used = chosen.file;
  /* The team file and its conflict siblings are one look: a lead key shown in two hands there is said, and where the pinned
     key is handed to two keys nothing in them is heeded. */
  if (doc && teamWhole(doc) && teamPins[doc.id]) {
    const fork = folderForkSeen(teamLook(root), doc.id, null);
    if (fork && fork.kind === "two") return; /* plant:fork-two-heed */
  }
  // A forgotten lead is held like a request still waiting: no lead is known until an answered request names one.
  const state = { pins: teamPins, keys: teamKeys, barred: Array.from(teamBarred), join: teamJoin, epochSeen: teamEpochSeen };
  const member = deskBranch ? { id: branchIdOf(deskBranch.sign.pub), sk: null } : null;
  const policyLead = sayJoinPolicy().lead;
  let seen = { file: used, member: member, ring: undefined };
  let r = memberHeedUnderPolicy(doc, state, seen, policyLead);
  if (r.needKey) {
    const sk = openPrivate(deskBranch.box.priv);
    seen = { file: file, member: { id: member.id, sk: sk || false }, ring: undefined };
    r = memberHeedUnderPolicy(doc, state, seen, policyLead);
  }
  if (r.needRing) {
    seen = { file: file, member: seen.member, ring: ringHeeded(doc, root) };
    r = memberHeedUnderPolicy(doc, state, seen, policyLead);
  }
  r.said.forEach(teamSay);
  if (r.stampClear) teamStamp = "";
  if (r.stop || r.needKey || r.needRing) return;
  /* A whole file is heeded only where its rev and channel read, and where it is not an older epoch than the floor kept
     for its team and lead key, nor a lower rev at that epoch. */
  const rev = teamRevOf(doc), channel = teamChannelOf(doc);
  if (rev === null || channel === null) {
    teamSay(used + " names a rev or a channel this desk does not read, so nothing in it is used");
    return;
  }
  const floors = teamRevSeen[r.team] || {}, floor = floors[doc.lead.public];
  if (teamRevRefused(floor, r.epoch, rev)) {
    const why = r.epoch < floor.epoch
      ? "key number " + r.epoch + ", below " + floor.epoch
      : "rev " + rev + ", below " + floor.rev + " at key number " + r.epoch;
    teamSay(used + " is an older file of team " + r.team + " than one this desk has heeded (" + why + "), so nothing in it is used");
    return;
  }
  /* What pinned the lead, for board 907: an invitation, machine policy or an answered request, each naming this very key;
     a handover keeps what pinned the key it came from; anything else is the file vouching for itself. */
  if (r.pinned) {
    const lead = r.state.pins[r.team], j = teamJoin;
    const same = k => !!k && k.keyId === lead.keyId && k.public === lead.public;
    const handover = !!teamPins[r.team];
    const from = policyLead && policyLead === lead.public ? "policy"
      : j && j.team === r.team && j.invite && same(j.invite.lead) ? "invite"
      : j && j.team === r.team && j.opened && same(j.opened.lead) ? "answer"
      : handover ? teamPinFrom[r.team] : undefined;
    if (from) teamPinFrom[r.team] = from; else delete teamPinFrom[r.team];
  }
  // A pin moved by a handover is another lead's: the name an invitation gave for the one before is not theirs.
  if (r.pinned && teamPins[r.team] && teamShown[r.team] && teamShown[r.team].lead) {
    teamShown[r.team] = Object.assign({}, teamShown[r.team]);
    delete teamShown[r.team].lead;
  }
  const wasPin = teamPins[r.team];
  if (r.pinned && wasPin && wasPin.public !== r.state.pins[r.team].public) {
    const had = teamWas[r.team] || [];
    teamWas[r.team] = had.concat(handedPath(doc, wasPin).filter(k => !had.some(h => h.public === k.public))).slice(-HANDOVER_STEPS); /* plant:fork-was */
  }
  if (r.pinned) teamPins[r.team] = r.state.pins[r.team];
  if (r.unbar) { teamBarred.delete(r.team); delete teamLeft[r.team]; }
  let changed = r.changed;
  /* The consent the agent was shown goes with a heeded file holding another switch or none, and with a lead that moved. */
  if (r.team && typeof teamContentSaid[r.team] === "string" && teamContentSaid[r.team] !== consentOf(doc)) { /* plant:s0b-consent-heed */
    delete teamContentSaid[r.team];
    changed = true;
  }
  if (r.team && teamPins[r.team]) {
    if (channel && channel.kind === "relay") {
      /* The folder stays beside the host: readRingFile keys on it, so a relay team's folder never has its etiuda-ring.json
         believed, a restart included. Settings shows the host (leadsView). */
      let host = "";
      try { host = new URL(channel.url).host; } catch { host = ""; }
      const was = teamShown[r.team] || {};
      if (was.folder !== root || (host && was.relay !== host)) {
        teamShown[r.team] = Object.assign({}, was, { folder: root }, host ? { relay: host } : {}); /* plant:relay-shown-folder */
        changed = true;
      }
    } else {
      const share = rawCatalogFolder();
      if ((teamShown[r.team] || {}).folder !== share) {
        teamShown[r.team] = Object.assign({}, teamShown[r.team], { folder: share });
        delete teamShown[r.team].relay;
        changed = true;
      }
    }
  }
  if (r.team && Number.isInteger(r.epoch) && r.epoch >= 1 && r.epoch > (teamEpochSeen[r.team] || 0)) {
    teamEpochSeen[r.team] = r.epoch;
    changed = true;
  }
  // The roster of the epoch accepted: a file at that epoch replaces it, and one below it put back changes nothing.
  if (r.team && Number.isInteger(r.epoch) && r.epoch >= 1 && r.epoch >= (teamEpochSeen[r.team] || 0)) {
    const ids = rosterIdsOf(doc), had = teamRoster[r.team];
    if (!had || had.epoch !== r.epoch || had.desks.join(",") !== ids.join(",")) {
      teamRoster[r.team] = { epoch: r.epoch, desks: ids };
      changed = true;
    }
    const pinned = teamPins[r.team];
    const isPinnedLead = !!(pinned && pinned.public === doc.lead.public && pinned.keyId === doc.lead.keyId);
    const heldFloor = (teamRevSeen[r.team] || {})[doc.lead.public];
    const heldRev = (heldFloor && heldFloor.epoch === r.epoch) ? (heldFloor.rev || 0) : 0;
    const revAbove = rev > heldRev;
    const currentCh = teamChannel[r.team];
    const wasOnRelay = !!(currentCh && currentCh.kind === "relay" && currentCh.rt && relayFollowed(r.team) && root === relayMirrorOf(currentCh.rt));
    const isFolderMove = wasOnRelay && channel.kind === "folder" && revAbove && isPinnedLead;

    const was = JSON.stringify(teamChannel[r.team] || null);
    if (channel.kind === "relay") teamChannel[r.team] = channel;
    else if (!isFolderMove) delete teamChannel[r.team];
    if (JSON.stringify(teamChannel[r.team] || null) !== was) { changed = true; relaySoon(); }
    teamRingAt = { root: root, relay: channel.kind === "relay", ring: (channel.kind === "relay" || doc.ring) ? teamRingIn(doc) : null };
    if (channel.kind === "relay" && relayFollowed(r.team) && root !== relayMirrorOf(channel.rt)) {
      const mirror = relayMirrorOf(channel.rt);
      const me = deskBranch ? branchIdOf(deskBranch.sign.pub) : "";
      if (me) {
        const srcDirs = [path.join(rawCatalogFolder(), "desks", me)];
        if (root !== rawCatalogFolder()) srcDirs.push(path.join(root, "desks", me));
        const dstDir = path.join(mirror, "desks", me);
        try {
          fs.mkdirSync(dstDir, { recursive: true });
          for (const srcDir of srcDirs) {
            if (fs.existsSync(srcDir)) {
              for (const f of fs.readdirSync(srcDir)) {
                if (/\.ec$/i.test(f)) {
                  const from = path.join(srcDir, f), to = path.join(dstDir, f);
                  /* A name the mirror already holds is kept unless the folder's copy states a higher rev; no rev on either leaves it. */
                  if (fs.existsSync(to)) {
                    const mine = deskFileRev(from), held = deskFileRev(to);
                    if (!(mine !== null && held !== null && mine > held)) continue; /* plant:follow-keep-rev */
                  }
                  fs.copyFileSync(from, to); /* plant:follow-copy */
                }
              }
            }
          }
        } catch (e) {
          console.error("etiuda: failed to copy desk files to mirror - " + e.message);
        }
      }
      tryHeldBranches();
      catalogFolderChanged(); /* plant:follow-folder-changed */
    }
    if (isFolderMove) {
      const mirrorDir = (currentCh && currentCh.rt) ? relayMirrorOf(currentCh.rt) : root;
        stopRelayChannel(r.team); /* plant:folder-stop-relay */
      const matchingFolder = findMatchingFolderInKnownRoots(r.team, doc.lead.public, rev, root, doc);
      if (matchingFolder) {
        switchToFolderTeam(matchingFolder, r.team, mirrorDir); /* plant:folder-known-root */
      } else {
        setTeamNeedsFolder(r.team, doc, mirrorDir); /* plant:folder-not-found-offer */
      }
    }
  }
  // The floor rises with a newer epoch or a higher rev at its own. A newer epoch with no rev raises a floor already kept to
  // that epoch at rev 0, since deleting it would let the older epoch back (board 931); with no floor kept, a floor of 0
  // refuses nothing and is not kept.
  let raised = false;
  if (!floor || r.epoch > floor.epoch || (r.epoch === floor.epoch && rev > floor.rev)) {
    const kept = Object.assign({}, floors);
    if (rev > 0) kept[doc.lead.public] = { epoch: r.epoch, rev: rev };
    else if (floor) kept[doc.lead.public] = { epoch: r.epoch, rev: 0 }; /* plant:floor-raise */
    else delete kept[doc.lead.public];
    if (JSON.stringify(kept) !== JSON.stringify(floors)) {
      if (Object.keys(kept).length) teamRevSeen[r.team] = kept; else delete teamRevSeen[r.team];
      changed = true;
      raised = true;
    }
  }
  if (r.keep) {
    try {
      if (!branchSealable()) throw new Error("safeStorage is not available");
      const kept = teamKeys[r.team] || {};
      kept[r.epoch] = safeStorage.encryptString(r.key.toString("base64")).toString("base64");
      teamKeys[r.team] = kept;
      ecFactsRead.clear();
      changed = true;
    } catch (e) { teamStamp = ""; teamSay("the team key for " + r.team + " could not be kept - " + e.message); }
  }
  const j = teamJoin;
  if (j && j.team === r.team && j.invite && !j.refused && j.invite.wrap && !j.invite.relay && doc && Number.isInteger(doc.epoch) && doc.epoch >= 1) {
    const wrapPath = path.join(root, "invites", j.invite.id + ".wrap.json");
    let wrapDoc = null;
    try {
      if (fs.statSync(wrapPath).size <= 65536) wrapDoc = JSON.parse(fs.readFileSync(wrapPath, "utf8"));
    } catch {}
    if (wrapDoc && wrapDoc.epoch === doc.epoch && branchSealable()) {
      try {
        const wrapKey = Buffer.from(safeStorage.decryptString(Buffer.from(j.invite.wrap, "base64")), "base64");
        const opened = RelayChannel().openInviteWrap(wrapKey, { wrap: wrapDoc, teamDoc: doc, teamId: j.team, relayTeamId: "folder", invitationId: j.invite.id });
        if (opened.ok) {
          const kept = teamKeys[j.team] || {}, had = !!kept[opened.epoch];
          kept[opened.epoch] = safeStorage.encryptString(opened.key.toString("base64")).toString("base64");
          teamKeys[j.team] = kept;
          if (!had) j.invite.wrapped = (j.invite.wrapped || []).concat(opened.epoch);
          ecFactsRead.clear();
          changed = true;
        }
      } catch {}
    }
  }
  if (j && j.invite && !j.refused) {
    if (checkInviteRefusal()) changed = true;
  }
  if (changed) persistDeskEnvelope();
  /* A file above every one heeded before, naming this desk with a wrap it opened: never a roster read before the request. */
  const admitted = raised && r.key ? r.team : ""; /* plant:c6-fresh */
  finishJoin(admitted); /* plant:n1-heed */
  /* A heeded file that drops a catalog the last one of this run listed, or a team's first of the run (a drop made while the desk
     was closed), takes back at once what was shared of it, as an ask does; teamListedDoc decides. Kept before the call:
     withdrawClosed heeds again, and a cleared stamp must not take back twice. */
  const listedNow = Array.isArray(doc.catalogs) ? doc.catalogs.map(String) : [], listedWas = r.team ? teamListedLast[r.team] : null;
  if (r.team) teamListedLast[r.team] = listedNow;
  if (r.team && !listedWas) try { withdrawClosed(); } catch { /* the next pass tries again */ } /* plant:s6-withdraw-first */
  if (listedWas && listedWas.some(id => listedNow.indexOf(id) < 0)) try { withdrawClosed(); } catch { /* the next pass tries again */ } /* plant:s6-withdraw-unlisted */
}
/* The catalog's text inside a sealed envelope, where this desk holds its team's key for its epoch, else null. */
function teamOpen(data) {
  heedTeam();
  const kept = teamKeys[String(data.team)];
  const sealed = kept && Number.isInteger(data.epoch) ? kept[data.epoch] : "";
  if (!sealed) return null;
  let key = null;
  try { key = Buffer.from(safeStorage.decryptString(Buffer.from(sealed, "base64")), "base64"); } catch { return null; }
  const opened = openSealed(key, data);
  if (typeof opened === "string") sealWaitDone(data);
  return opened;
}

/* ---- this desk asking to join a team: one request at a time, made by the agent's press ---------------
   The request sits in the desk's own folder; the nonce it commits to stays in the desk envelope until the
   lead's opening for that very commitment is read, and is then revealed against that opening alone, which
   is kept: a later opening is never answered, and the lead it names is the one a first admission must carry. While the
   request waits or stands refused, no first admission is taken for its team. */
let teamJoin = null;                            // {team, file, nonce, commit, asked, held, name, opened?, refused?, invite?}
let joinSent = "";
let joinDone = null;                            // {team, file}: a request admitted, for the next joinView to say once
let joinTold = false;                           // the lead's answer already queued joined, so a later admission does not say it again
/* A RELAY TEAM'S CATALOG OPENS BY ITSELF once this desk holds a key for it, from the invitation's wrap or at admission: a view
   names the newest file in the catalog folder sealed for the team at an epoch whose key is kept, once a run, and the page
   loads it where nothing else is open. */
let relayCatalogOwed = "";                      // a relay team admitted, whose catalog no view has named yet
const relayCatalogNamed = new Set();            // the relay teams whose catalog a view has named this run
function relayOpenFile(team) {
  const h = teamSealedHere(team);
  /* More than one of the team's catalogs here: nothing opens by itself, and the empty desk lands on the Library. */
  if (h.ids.size > 1) return ""; /* plant:open-many-none */
  return h.best;
}
/* The team's sealed files here this desk can open: the newest, and the catalog ids among them. */
function teamSealedHere(team) {
  const kept = teamKeys[team] || {};
  const ids = new Set();
  if (!Object.keys(kept).length) return { best: "", ids: ids };
  /* The newest of the team's sealed files this desk can open: the highest key number, then the highest rev inside it (the
     test architect's C1 to the desk pilot; a sealed envelope carries no rev outside its ciphertext). */
  let best = "", bestEpoch = -1, bestRev = -1;
  let files = ecFilesIn(catalogFolder());
  if (!files.length) {
    const raw = shareFolderShown();
    if (raw && raw !== catalogFolder()) files = ecFilesIn(raw);
  }
  for (const f of files) {
    let d = null;
    try { if (fs.statSync(f).size <= BRANCH_TEXT_MAX) d = catalogPayload(fs.readFileSync(f, "utf8")).data; } catch { continue; }
    if (!(d && d.kind === SEALED_KIND && String(d.team) === team && Number.isInteger(d.epoch) && kept[d.epoch])) continue;
    let rev = -1;
    try { const text = openSealed(teamKeyAt(team, d.epoch), d); const doc = text ? JSON.parse(text) : null; if (doc && Number.isInteger(doc.rev)) rev = doc.rev; if (doc && typeof doc.id === "string") ids.add(doc.id); } catch { rev = -1; }
    if (d.epoch > bestEpoch || (d.epoch === bestEpoch && rev > bestRev)) { best = path.basename(f); bestEpoch = d.epoch; bestRev = rev; } /* plant:relay-open-newest */
  }
  return { best: best, ids: ids };
}
/* The file an admission names for the page to open: none where the team's catalogs here are more than one. */
function joinedFile(j) {
  let many = false;
  many = teamSealedHere(j.team).ids.size > 1; /* plant:joined-many-none */
  return many ? "" : j.file;
}
function relayOpens(j) {
  const inv = j && j.invite && j.invite.relay;
  let team = inv && inv.withdrawn !== true && inv.withdrawing !== true && j.refused !== true ? String(j.team) : relayCatalogOwed;
  if (!team && j && j.invite && j.invite.folder && teamKeys[j.team] && Object.keys(teamKeys[j.team]).length && j.refused !== true) team = String(j.team); /* plant:folder-invite-opens */
  if (!team || !teamPins[team]) return null;
  if (relayCatalogNamed.has(team)) { if (relayCatalogOwed === team) relayCatalogOwed = ""; return null; }
  const file = relayOpenFile(team);
  if (!file) return null;
  relayCatalogNamed.add(team);
  if (relayCatalogOwed === team) relayCatalogOwed = "";
  return { team: team, file: file };
}
/* Admitted once this desk keeps a newer key for the team than when it asked, whether or not the Team cover is read: the
   request goes, which the relay carries to the lead as its signed deletion, and the invitation's address is no longer
   followed. The next joinView says so once, as it did when it was the one to find it. */
function finishJoin(admitted) {
  const j = teamJoin;
  if (!j || !deskBranch) return false;
  const roster = teamRoster[j.team], mine = !!roster && roster.desks.indexOf(branchIdOf(deskBranch.sign.pub)) >= 0;
  /* Admission does not rotate the key, so a desk that already held the key of its epoch is admitted by a heeded file of
     that epoch, newer than any before (`admitted`, heedTeam's), whose roster names it. */
  let named = false;
  named = admitted === j.team && mine && roster.epoch === newestEpoch(j.team); /* plant:c6-named */
  if (!named && !(newestEpoch(j.team) > j.held)) return false;
  /* A key opened from the invitation's wrap lets this desk read before it is admitted. The request stays until the
     roster of the epoch accepted names this desk, which is still what lets the request go. */
  if (j.invite && !mine) return false;
  /* A request withdrawn, or on its way to being withdrawn, is not admitted by a roster that names this desk, unless the relay
     has enrolled its key. */
  const takenBack = !!(j.invite && ((j.invite.relay && (j.invite.relay.withdrawn === true || j.invite.relay.withdrawing === true)) || j.refused === true));
  if (takenBack && !(relayChannel && relayChannel.enrolled && relayChannel.enrolled())) return false; /* plant:e4-not-joined */
  try { unlinkOwn(joinFile()); } catch { /* gone already */ }
  teamJoin = null;
  if (j.invite && j.invite.relay) relayCatalogOwed = j.team;
  if (!joinTold) joinDone = { team: j.team, file: joinedFile(j) };
  joinTold = false;
  persistDeskEnvelope();
  if (j.invite && j.invite.relay) relaySoon();
  catalogFolderChanged(); /* plant:finish-join-watched */
  if (theWindow && !theWindow.isDestroyed()) catalogChanged(theWindow);
  return true;
}
/* The newest epoch this desk keeps a key for, leaving out the epochs in `skip` where it is given. */
function newestEpoch(team, skip) {
  return Object.keys(teamKeys[team] || {}).reduce((hi, n) => (skip && skip.indexOf(+n) >= 0 ? hi : Math.max(hi, +n || 0)), 0);
}
/* An edition sealed above the epoch the team file names waits for that file, on a folder team this
   desk already holds a key for. The wait matches the relay's pending retry, two seconds backing off
   to sixty, and ends at sixty seconds in the words a sealed edition this desk cannot open already uses. */
const SEAL_RETRY_MS = 2000;
const SEAL_WAIT_MS = 60 * 1000;
const sealWaitAt = new Map();                   // team id and epoch -> the millisecond the wait began
let sealWaitWin = null;                         // the window a retry reads through
let sealRetry = null;
let sealRetryDelay = SEAL_RETRY_MS;
function sealEpochAwait(epoch, named, held, folder, now, since) {
  if (!folder || !held) return "say";
  if (!Number.isInteger(epoch) || epoch < 1) return "say";
  if (!Number.isInteger(named) || !(epoch > named)) return "say";
  if (!Number.isFinite(now) || !Number.isFinite(since) || now - since >= SEAL_WAIT_MS) return "say";
  return "wait"; /* plant:seal-wait */
}
function sealWaitKey(data) {
  return String(data && data.team) + "\n" + String(data && data.epoch);
}
/* A stamp kept after the minute is a refusal that must not start again, so only a stamp still inside the minute is a wait. */
function sealAnyWaiting() {
  const now = Date.now();
  for (const since of sealWaitAt.values()) {
    if (Number.isFinite(since) && now - since < SEAL_WAIT_MS) return true;
  }
  return false;
}
function sealWaitIdle() {
  clearTimeout(sealRetry);
  sealRetry = null;
  sealRetryDelay = SEAL_RETRY_MS;
}
function sealWaitDone(data) {
  sealWaitAt.delete(sealWaitKey(data));
  if (!sealAnyWaiting()) sealWaitIdle();
}
function sealWaitStop() {
  sealWaitAt.clear();
  sealWaitIdle();
}
function armSealRetry() {
  if (sealRetry) return;
  const delay = sealRetryDelay;
  sealRetry = setTimeout(() => {
    sealRetry = null;
    sealRetryDelay = Math.min(SEAL_WAIT_MS, delay * 2);
    const win = sealWaitWin;
    if (win && typeof win.isDestroyed === "function" && !win.isDestroyed()) {
      try { catalogChanged(win); } catch { /* read again at the next interval */ }
    }
    if (sealAnyWaiting()) armSealRetry();
    else sealRetryDelay = SEAL_RETRY_MS;
  }, delay);
  if (typeof sealRetry.unref === "function") sealRetry.unref();
}
/* "wait" while that epoch is ahead of the team file and the minute has not run out, and "say" otherwise.
   Once the minute has run out the start is kept, so a later read does not begin the minute again. */
function sealVerdict(data) {
  const team = String(data && data.team || "");
  const epoch = data && data.epoch;
  const held = !!(teamKeys[team] && Object.keys(teamKeys[team]).length);
  const channel = teamChannel[team];
  const folder = !(channel && channel.kind === "relay");
  const named = teamEpochSeen[team] || 0;
  const now = Date.now();
  const key = sealWaitKey(data);
  const seen = sealWaitAt.get(key);
  const since = seen == null ? now : seen;
  if (sealEpochAwait(epoch, named, held, folder, now, since) === "wait") {
    if (seen == null) sealWaitAt.set(key, now);
    armSealRetry();
    return "wait";
  }
  const ahead = folder && held && Number.isInteger(epoch) && epoch >= 1 && Number.isInteger(named) && epoch > named;
  if (!ahead) sealWaitAt.delete(key);
  return "say";
}
function sealMiss(data) {
  const err = new Error("sealed for team " + String(data.team) + ", which this desk holds no key for");
  if (sealVerdict(data) === "wait") err.sealWait = true;
  return err;
}
/* The newest envelope in the catalog folder whose epoch this desk keeps no key for, as {file, team}, or null.
   One the team file has not reached, where this desk already holds a key, is waited on and not shown. */
function sealedOutside() {
  heedTeam();
  const places = [catalogFolder()];
  const pend = path.join(catalogFolder(), ".pending");
  if (folderAnswers(pend)) places.push(pend);
  for (const root of places) {
    for (const f of ecFilesIn(root)) {
      let d = null;
      try { if (fs.statSync(f).size <= BRANCH_TEXT_MAX) d = catalogPayload(fs.readFileSync(f, "utf8")).data; } catch { continue; }
      if (!d || d.kind !== SEALED_KIND || !SEALED_TEAM_RE.test(String(d.team)) || !Number.isInteger(d.epoch)) continue;
      if (!(teamKeys[d.team] && teamKeys[d.team][d.epoch])) {
        if (sealVerdict(d) === "wait") continue;
        console.error("etiuda: " + f + " did not parse as a catalog - sealed for team " + String(d.team) + ", which this desk holds no key for");
        return { file: path.basename(f), team: String(d.team) };
      }
    }
  }
  return null;
}
/* The request to join is written to the team's folder itself, never a mirror: it is made before this desk has joined, while
   no syncer keeps one for it. */
function joinFile() {
  return path.join(shareFolderShown(), "desks", branchIdOf(deskBranch.sign.pub), "join.json");
}
/* Signs the request with the desk's key under the join prefix and writes it by replacement; throws what stopped it. */
function writeJoin(doc, at) {
  const key = openPrivate(deskBranch.sign.priv);
  if (!key) throw new Error("the desk's key could not be opened");
  doc.sig = { alg: "Ed25519", keyId: branchIdOf(deskBranch.sign.pub) };
  doc.sig.value = crypto.sign(null, joinSignedBytes(doc), key).toString("hex");
  const file = at || joinFile();
  for (const dir of [path.dirname(path.dirname(file)), path.dirname(file)]) {
    try { fs.mkdirSync(dir); } catch (e) { if (e.code !== "EEXIST") throw e; }
  }
  const text = JSON.stringify(doc, null, 1) + "\n";
  writeReplacing(file, text);
  return text;
}
/* Whether a request written ahead still stands where it was written, word for word. */
function askKept(ask) {
  if (!ask || !ask.written) return false;
  try { return fs.readFileSync(ask.file, "utf8") === ask.text; } catch { return false; }
}
/* HMAC-SHA256 of the commitment under the invitation's secret, in hex, or "" where either is not the
   shape a request carries. The secret is 128 bits, the commitment the hex joinCommit already made. */
function memberProof(secret, commit) {
  const sec = String(secret || ""), com = String(commit || "");
  if (!/^[0-9a-f]{32}$/.test(sec) || !/^[0-9a-f]{64}$/.test(com)) return "";
  return crypto.createHmac("sha256", Buffer.from(sec, "hex")).update(com, "utf8").digest("hex");
}
/* The check code the lead reads out and the agent types before yes, for a folder invitation: HMAC-SHA256 under the invitation's 128-bit secret
   over the lead's 32-byte public key (the bytes, not their hex), its first six bytes read big-endian modulo 100000, as
   five digits. "" where either is not the shape an invitation carries. Only the invitation that was issued gives it. */
function inviteCode(secret, leadPublic) {
  const sec = String(secret || ""), pub = String(leadPublic || "");
  if (!/^[0-9a-f]{32}$/.test(sec) || !/^[0-9a-f]{64}$/.test(pub)) return "";
  const mac = crypto.createHmac("sha256", Buffer.from(sec, "hex")).update(Buffer.from(pub, "hex")).digest();
  return String(mac.readUIntBE(0, 6) % 100000).padStart(5, "0");
}
/* The first 16 hex of the secret's own SHA-256, which is all of it a request carries. */
function inviteIdOf(secret) {
  const sec = String(secret || "");
  if (!/^[0-9a-f]{32}$/.test(sec)) return "";
  return crypto.createHash("sha256").update(Buffer.from(sec, "hex")).digest("hex").slice(0, 16);
}
/* Characters that turn or hide text without showing themselves: the Arabic letter mark, the zero widths and directional
   marks, the line and paragraph separators with the embeddings and overrides, the word joiner, the invisible operators
   and the isolates, and the byte-order mark. None is read in a name, a keyId or a folder a confirm shows. */
const INVITE_HIDDEN_RE = /[\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;
/* A folder as the system reaches it, or "" where its text is not that place. On Windows a drive path, or \\host\share
   in backslashes alone, each segment a name: not "." or "..", not ending in a dot or a space, which Windows drops, and
   with no device prefix or stream. Elsewhere an absolute path with no backslash. One trailing separator is dropped. */
function inviteFolder(folder, posix) {
  const s = typeof folder === "string" ? folder : "";
  if (s.length < 3 || s.length > 1024 || s !== s.trim() || /[\u0000-\u001f\u007f]/.test(s) || INVITE_HIDDEN_RE.test(s)) return "";
  const named = p => p.length > 0 && p !== "." && p !== "..";
  if (posix) {
    if (!/^\/[^/]/.test(s) || s.indexOf("\\") >= 0) return "";
    const parts = s.slice(1).replace(/\/$/, "").split("/");
    return parts.every(named) ? "/" + parts.join("/") : "";
  }
  const kept = p => named(p) && !/[*?"<>|:]/.test(p) && !/[. ]$/.test(p);
  if (/^[A-Za-z]:[\\/]/.test(s)) {
    const rest = s.slice(3).replace(/[\\/]$/, "");
    if (rest === "") return s.slice(0, 2) + "\\";
    const parts = rest.split(/[\\/]/);
    return parts.every(kept) ? s.slice(0, 2) + "\\" + parts.join("\\") : "";
  }
  if (!/^\\\\[^\\/]/.test(s) || s.indexOf("/") >= 0) return "";
  const parts = s.slice(2).replace(/\\$/, "").split("\\");
  return parts.length >= 2 && parts.every(kept) ? "\\\\" + parts.join("\\") : "";
}
/* A FOLDER TEAM'S PLACE, beside the absolute path the writer saw (board 945, item 4). The kind and the path
   relative to a sync root come from the records Windows and the client keep, never from a folder's name: a
   directory that is merely called OneDrive is not a root. The reader resolves the kind against its own root.
   Where it has none, or the folder is not there, the absolute path stands, and the answer says which.
   liveSyncIo is the only one of these that asks the machine; the rest are pure and take the records they are given. */
function placeKindOk(kind) {
  return kind === "onedrive" || kind === "onedrive-business" || kind === "dropbox" || kind === "gdrive" || kind === "mapped" || kind === "unc";
}
function placeSlash(p) {
  return String(p == null ? "" : p).replace(/\//g, "\\").replace(/\\+$/, "");
}
function placeLeaf(root) {
  const r = placeSlash(root);
  const cut = r.lastIndexOf("\\");
  return cut < 0 ? r : r.slice(cut + 1);
}
function placeJoin(root, rel) {
  const r = placeSlash(root);
  const rest = String(rel == null ? "" : rel).replace(/\//g, "\\").replace(/^\\+/, "").replace(/\\+$/, "");
  if (!rest) return /:$/.test(r) ? r + "\\" : r;
  return (/:$/.test(r) ? r + "\\" : r + "\\") + rest;
}
function placeUnder(folder, root) {
  const f = placeSlash(folder), r = placeSlash(root);
  if (!f || !r) return false;
  const fl = f.toLowerCase(), rl = r.toLowerCase();
  if (fl === rl) return true;
  return fl.indexOf((/:$/.test(rl) ? rl + "\\" : rl + "\\")) === 0;
}
function placeRest(folder, root) {
  const f = placeSlash(folder), r = placeSlash(root);
  if (!f || !r || f.toLowerCase() === r.toLowerCase()) return "";
  return f.slice(r.length + 1);
}
function syncRootsFrom(records) {
  const rec = records && typeof records === "object" ? records : {};
  const out = [];
  const pushCloud = function (kind, list) {
    const arr = Array.isArray(list) ? list : [];
    for (let i = 0; i < arr.length; i++) {
      const root = placeSlash(arr[i]);
      if (root) out.push({ kind: kind, root: root });
    }
  };
  pushCloud("onedrive", rec.onedrive);
  pushCloud("onedrive-business", rec.onedriveBusiness);
  pushCloud("dropbox", rec.dropbox);
  pushCloud("gdrive", rec.gdrive);
  const mapped = Array.isArray(rec.mapped) ? rec.mapped : [];
  for (let i = 0; i < mapped.length; i++) {
    const m = mapped[i];
    if (!m || typeof m !== "object") continue;
    const remote = placeSlash(m.remote || m.root || "");
    const letter = placeSlash(m.letter || "");
    if (remote.slice(0, 2) === "\\\\" && /^[A-Za-z]:$/.test(letter)) out.push({ kind: "mapped", root: remote, letter: letter });
  }
  return out;
}
function placeOf(folder, roots) {
  const f = placeSlash(folder);
  if (!f) return null;
  if (f.slice(0, 2) === "\\\\") {
    const parts = f.slice(2).split("\\");
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return placeKept({ kind: "unc", root: "\\\\" + parts[0] + "\\" + parts[1], rel: parts.slice(2).join("\\") });
  }
  const list = Array.isArray(roots) ? roots : [];
  let best = null, bestLen = -1;
  for (let i = 0; i < list.length; i++) {
    const rec = list[i];
    if (!rec || typeof rec.kind !== "string" || rec.kind === "unc" || typeof rec.root !== "string") continue;
    let covered = "", raw = null;
    if (rec.kind === "mapped") {
      const letter = placeSlash(rec.letter || "");
      if (!/^[A-Za-z]:$/.test(letter) || !placeUnder(f, letter)) continue;
      covered = letter;
      raw = { kind: "mapped", root: placeSlash(rec.root), rel: placeRest(f, letter) };
    } else {
      const root = placeSlash(rec.root);
      if (!root || !placeUnder(f, root)) continue;
      covered = root;
      raw = { kind: rec.kind, rel: placeRest(f, root) };
      const leaf = placeLeaf(root);
      if (leaf && leaf.indexOf(":") < 0) raw.root = leaf;
    }
    const place = placeKept(raw);
    if (place && covered.length > bestLen) { best = place; bestLen = covered.length; }
  }
  return best;
}
function placeCandidates(folder, place, roots) {
  const kept = placeKept(place);
  if (!kept || kept.kind === "unc") return [];
  const list = Array.isArray(roots) ? roots : [];
  const same = [];
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].kind === kept.kind) same.push(list[i]);
  if (kept.kind === "mapped") {
    const remote = kept.root.toLowerCase();
    const out = [];
    for (let i = 0; i < same.length; i++) {
      if (placeSlash(same[i].root).toLowerCase() !== remote) continue;
      const letter = placeSlash(same[i].letter || "");
      if (/^[A-Za-z]:$/.test(letter)) out.push(placeJoin(letter, kept.rel));
    }
    out.push(placeJoin(kept.root, kept.rel));
    return out;
  }
  const leaf = kept.root ? kept.root.toLowerCase() : "";
  const matched = [], other = [];
  for (let i = 0; i < same.length; i++) {
    const built = placeJoin(same[i].root, kept.rel);
    if (leaf && placeLeaf(same[i].root).toLowerCase() === leaf) matched.push(built);
    else other.push(built);
  }
  return matched.concat(other);
}
function placeResolve(folder, place, roots, present) {
  const there = typeof present === "function" ? present : function () { return true; };
  const abs = placeSlash(folder);
  const kept = placeKept(place);
  if (!kept) {
    if (abs && there(abs)) return { path: abs, how: "absolute", why: "plain" };
    return { path: abs, how: "ask", why: "plain" };
  }
  if (kept.kind === "unc") return { path: placeJoin(kept.root, kept.rel), how: "root", why: "" };
  const candidates = placeCandidates(abs, kept, roots);
  if (!candidates.length) {
    if (abs && there(abs)) return { path: abs, how: "absolute", why: "absent" };
    return { path: abs, how: "ask", why: "absent" };
  }
  for (let i = 0; i < candidates.length; i++) {
    if (there(candidates[i])) return { path: candidates[i], how: "root", why: "" }; /* plant:f4-place */
  }
  if (abs && there(abs)) return { path: abs, how: "absolute", why: "missing" };
  return { path: abs, how: "ask", why: "missing" };
}
function placeKept(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const kind = typeof p.kind === "string" ? p.kind : "";
  if (!placeKindOk(kind) || typeof p.rel !== "string") return null;
  const hidden = /[\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;
  const rel = p.rel.replace(/\//g, "\\").replace(/^\\+/, "").replace(/\\+$/, "");
  if (rel.length > 1024 || rel.indexOf(":") >= 0 || hidden.test(rel) || /[\u0000-\u001f\u007f]/.test(rel)) return null;
  if (rel !== "") {
    const parts = rel.split("\\");
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      if (!seg || seg === "." || seg === ".." || /[<>:"|?*]/.test(seg) || /[. ]$/.test(seg)) return null;
    }
  }
  const out = { kind: kind, rel: rel };
  if (kind === "unc" || kind === "mapped") {
    const root = placeSlash(typeof p.root === "string" ? p.root : "");
    if (root.slice(0, 2) !== "\\\\" || hidden.test(root) || /[\u0000-\u001f\u007f]/.test(root)) return null;
    const segs = root.slice(2).split("\\");
    if (segs.length < 2) return null;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (!seg || seg === "." || seg === ".." || /[<>:"|?*]/.test(seg) || /[. ]$/.test(seg)) return null;
    }
    out.root = root;
    return out;
  }
  if (p.root !== undefined) {
    const leaf = typeof p.root === "string" ? p.root : "";
    if (!leaf || leaf.length > 200 || /[\\/:]/.test(leaf) || leaf === "." || leaf === ".." || /[. ]$/.test(leaf)) return null;
    if (hidden.test(leaf) || /[\u0000-\u001f\u007f]/.test(leaf)) return null;
    out.root = leaf;
  }
  return out;
}
/* The records a client keeps, asked through `io` ({reg, subkeys, readFile, env}) so a test never touches this machine.
   With no io, liveSyncIo reads them once. A OneDrive account list that comes back empty is still asked at Personal and
   Business1, which is where a client with one of each writes them. A mapped drive's RemotePath is asked only for a
   letter the Network key actually has. */
function readSyncRecords(io) {
  const ask = io || liveSyncIo();
  const env = ask && ask.env && typeof ask.env === "object" ? ask.env : {};
  const reg = function (key, name) {
    try { return String((ask && ask.reg ? ask.reg(key, name) : "") || ""); }
    catch (e) { return ""; }
  };
  const subkeys = function (key) {
    try {
      const got = ask && ask.subkeys ? ask.subkeys(key) : [];
      return Array.isArray(got) ? got.map(function (s) { return String(s); }) : [];
    } catch (e) { return []; }
  };
  const readFile = function (p) {
    try { return ask && ask.readFile ? String(ask.readFile(p) || "") : ""; }
    catch (e) { return ""; }
  };
  const out = { onedrive: [], onedriveBusiness: [], dropbox: [], gdrive: [], mapped: [] };
  const pushUnique = function (list, p) {
    const s = placeSlash(p);
    if (!s) return;
    for (let i = 0; i < list.length; i++) if (list[i].toLowerCase() === s.toLowerCase()) return;
    list.push(s);
  };
  const accounts = "HKCU:\\Software\\Microsoft\\OneDrive\\Accounts";
  let names = subkeys(accounts);
  if (names.length === 0) names = ["Personal", "Business1"];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const folder = reg(accounts + "\\" + name, "UserFolder");
    if (/^personal$/i.test(name)) pushUnique(out.onedrive, folder);
    else if (/^business/i.test(name)) pushUnique(out.onedriveBusiness, folder);
  }
  pushUnique(out.onedrive, env.OneDriveConsumer);
  pushUnique(out.onedrive, env.OneDrive);
  pushUnique(out.onedriveBusiness, env.OneDriveCommercial);
  out.onedrive = out.onedrive.filter(function (p) {
    for (let i = 0; i < out.onedriveBusiness.length; i++) if (out.onedriveBusiness[i].toLowerCase() === p.toLowerCase()) return false;
    return true;
  });
  pushUnique(out.gdrive, reg("HKCU:\\Software\\Google\\DriveFS", "DefaultMountPoint"));
  pushUnique(out.gdrive, reg("HKLM:\\SOFTWARE\\Policies\\Google\\DriveFS", "DefaultMountPoint"));
  const absorb = function (text) {
    const raw = String(text || "").replace(/^\ufeff/, "");
    if (!raw) return;
    if (raw.trim().charAt(0) === String.fromCharCode(123)) {
      try {
        const doc = JSON.parse(raw);
        if (doc && doc.personal) pushUnique(out.dropbox, doc.personal.path);
        if (doc && doc.business) pushUnique(out.dropbox, doc.business.path);
      } catch (e) { /* not a Dropbox info.json */ }
      return;
    }
    const lines = raw.split(/\r?\n/);
    const line = String(lines.length >= 2 ? lines[1] : "").trim();
    if (/^[A-Za-z0-9+/=]+$/.test(line) && line.length >= 4) pushUnique(out.dropbox, Buffer.from(line, "base64").toString("utf8"));
  };
  const app = typeof env.APPDATA === "string" ? env.APPDATA.replace(/[\\/]+$/, "") : "";
  const local = typeof env.LOCALAPPDATA === "string" ? env.LOCALAPPDATA.replace(/[\\/]+$/, "") : "";
  if (app) {
    absorb(readFile(app + "\\Dropbox\\info.json"));
    absorb(readFile(app + "\\Dropbox\\host.db"));
  }
  if (local) {
    absorb(readFile(local + "\\Dropbox\\info.json"));
    absorb(readFile(local + "\\Dropbox\\host.db"));
  }
  const net = "HKCU:\\Network";
  const letters = subkeys(net);
  for (let i = 0; i < letters.length; i++) {
    const name = String(letters[i] || "");
    if (!name) continue;
    const remote = reg(net + "\\" + name, "RemotePath");
    const letter = name.length === 1 ? name + ":" : placeSlash(name);
    const root = placeSlash(remote);
    if (root.slice(0, 2) === "\\\\" && /^[A-Za-z]:$/.test(letter)) out.mapped.push({ letter: letter, remote: root });
  }
  return out;
}
/* One read of the records, kept on the function itself. The one program is reg.exe at REG_TOOL, through the shell's
   one child_process handle, and the four queries share the five seconds the policy read is allowed. A root already
   named in the environment is still asked of the registry, because a second account may live only there. Off Windows
   the environment is the whole record. Brackets in this function stay balanced so a slice ends on it. */
function liveSyncIo() {
  if (liveSyncIo.cached) return liveSyncIo.cached;
  const env = process.env || {};
  const values = {};
  const sub = {};
  const seenChild = {};
  function regText(buf) {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf == null ? "" : buf));
    let text;
    if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) text = b.slice(2).toString("utf16le");
    else if (b.length >= 4 && b[1] === 0 && b[3] === 0) text = b.toString("utf16le");
    else text = b.toString("utf8");
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return text;
  }
  function hive(line) {
    const cu = "HKEY_CURRENT_USER\\", lm = "HKEY_LOCAL_MACHINE\\", hkcu = "HKCU\\", hklm = "HKLM\\";
    let s = String(line || "").trim();
    if (s.indexOf(cu) === 0) s = "HKCU:\\" + s.slice(cu.length);
    else if (s.indexOf(lm) === 0) s = "HKLM:\\" + s.slice(lm.length);
    else if (s.indexOf(hkcu) === 0) s = "HKCU:\\" + s.slice(hkcu.length);
    else if (s.indexOf(hklm) === 0) s = "HKLM:\\" + s.slice(hklm.length);
    return s;
  }
  function addChild(parent, name) {
    if (!parent || !name) return;
    const childKey = parent + "\n" + name;
    if (seenChild[childKey]) return;
    seenChild[childKey] = 1;
    if (!sub[parent]) sub[parent] = [];
    sub[parent].push(name);
  }
  function absorb(buf) {
    const lines = regText(buf).replace(/\r/g, "").split("\n");
    let key = "";
    const valueLine = /^[ \t]+(\S+)[ \t]+REG_\w+[ \t]+(.*?)[ \t]*$/;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw.trim()) continue;
      if (raw.indexOf("ERROR:") === 0) continue;
      if (raw.indexOf("End of search") === 0) continue;
      const found = valueLine.exec(raw);
      if (found && key) {
        values[key + "|" + found[1]] = found[2];
        continue;
      }
      const mapped = hive(raw);
      if (mapped.indexOf("HKCU:") === 0 || mapped.indexOf("HKLM:") === 0) {
        key = mapped;
        const cut = mapped.lastIndexOf("\\");
        if (cut > 0) addChild(mapped.slice(0, cut), mapped.slice(cut + 1));
      }
    }
  }
  if (process.platform === "win32") {
    const deadline = Date.now() + 5000;
    const queries = [
      ["query", "HKCU\\Software\\Microsoft\\OneDrive\\Accounts", "/s", "/v", "UserFolder"],
      ["query", "HKCU\\Software\\Google\\DriveFS", "/s", "/v", "DefaultMountPoint"],
      ["query", "HKLM\\SOFTWARE\\Policies\\Google\\DriveFS", "/s", "/v", "DefaultMountPoint"],
      ["query", "HKCU\\Network", "/s", "/v", "RemotePath"]
    ];
    for (let i = 0; i < queries.length; i++) {
      const left = deadline - Date.now();
      if (left < 1) break;
      try {
        absorb(execFileSync(REG_TOOL, queries[i], { windowsHide: true, timeout: left, encoding: "buffer", maxBuffer: 1024 * 1024 }));
      } catch (e) { /* a missing key is an empty record */ }
    }
  }
  const io = {
    env: {
      APPDATA: env.APPDATA, LOCALAPPDATA: env.LOCALAPPDATA,
      OneDrive: env.OneDrive, OneDriveConsumer: env.OneDriveConsumer, OneDriveCommercial: env.OneDriveCommercial
    },
    reg: function (key, name) { return values[String(key) + "|" + String(name)] || ""; },
    subkeys: function (key) { return sub[String(key)] ? sub[String(key)].slice() : []; },
    readFile: function (p) { try { return fs.readFileSync(p, "utf8"); } catch (e) { return ""; } }
  };
  liveSyncIo.cached = io;
  return io;
}
/* The invitation a lead hands over: "etiuda-join:" and base64url of the team, the folder, the lead and a
   128-bit secret, or the same base64url after Studio's relay invitation link, exactly https://etiuda.dev/join#, read as
   the same invitation. Null where it is not that shape, and the folder as inviteFolder reaches it. Nothing is read from
   the folder: a path on another computer answers a stat by connecting, and the confirm exists so that connection is
   a choice. `posix` is true where the system is not Windows. */
function inviteRead(text, posix) {
  let raw = String(text == null ? "" : text).trim();
  const page = "https://etiuda.dev/join#";
  if (raw.length <= 8192 && raw.slice(0, page.length) === page && /^[A-Za-z0-9_-]+$/.test(raw.slice(page.length))) raw = "etiuda-join:" + raw.slice(page.length); /* plant:paste-https */
  if (raw.length < 16 || raw.length > 8192 || raw.slice(0, 12) !== "etiuda-join:") return null;
  let b64 = raw.slice(12).replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) return null;
  while (b64.length % 4) b64 += "=";
  let doc = null;
  try { doc = JSON.parse(Buffer.from(b64, "base64").toString("utf8")); } catch (e) { return null; }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const lead = doc.lead;
  const folder = inviteFolder(typeof doc.folder === "string" ? doc.folder : "", posix === true);
  const secret = String(doc.secret || "").toLowerCase();
  const pub = lead && typeof lead.public === "string" ? lead.public.toLowerCase() : "";
  const keyId = lead && typeof lead.keyId === "string" ? lead.keyId : "";
  const name = lead && typeof lead.name === "string" ? lead.name : null;
  /* The lead's box, as its team file names it, where the invitation carries one: a desk joining through the relay finds its
     own copy of the team file by it before it holds any team file (relay F6). */
  const box = lead && lead.box !== undefined ? String(lead.box) : "";
  /* On the relay the invitation names the relay team id, the relay's https address, the token whose sha256 the lead
     registered and the relay's id for the invitation, in place of the folder (the protocol's section 7). */
  const relay = doc.relay === undefined ? null : inviteRelay(doc.relay);
  if (doc.relay !== undefined && (!relay || doc.folder !== undefined)) return null;
  const pathOk = relay ? true : folder !== "";
  const shown = s => !/[\u0000-\u001f\u007f]/.test(s) && !INVITE_HIDDEN_RE.test(s);
  const nameOk = name !== null && name.length <= 120 && shown(name);
  const keyOk = keyId.length >= 1 && keyId.length <= 80 && shown(keyId);
  if (!SEALED_TEAM_RE.test(String(doc.team)) || !pathOk || !/^[0-9a-f]{32}$/.test(secret) || !/^[0-9a-f]{64}$/.test(pub) || !keyOk || !nameOk) return null;
  if (box !== "" && !/^[0-9a-f]{64}$/.test(box)) return null; /* plant:f6-box-shape */
  const out = { team: String(doc.team), folder: folder, lead: { keyId: keyId, public: pub, name: name }, secret: secret };
  if (box) out.lead.box = box; /* plant:f6-box-read */
  if (relay) out.relay = relay;
  else {
    const keptPlace = placeKept(doc.place);
    if (keptPlace) out.place = keptPlace;
  }
  return out;
}
/* An invitation's relay as {rt, url, token, inv}, or null where any field is not that shape: the address as a team file's
   channel takes it (https, a host, a path), the token 32 bytes and the invitation's id 16, in lower-case hex. */
function inviteRelay(r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const c = teamChannelOf({ channel: { kind: "relay", rt: r.rt, url: r.url } });
  if (!c || c.kind !== "relay" || !/^[0-9a-f]{64}$/.test(String(r.token)) || !/^[0-9a-f]{32}$/.test(String(r.inv))) return null;
  return { rt: c.rt, url: c.url, token: String(r.token), inv: String(r.inv) };
}
/* Where a folder sits, from its text alone: a UNC host, a cloud client named by the path, or this
   computer's system drive. Another drive letter may be a mapped share, so it is none of those. */
function folderHost(folder, env) {
  const raw = String(folder || "");
  const e = env && typeof env === "object" ? env : {};
  let host = "";
  if (raw.charAt(0) === "\\" && raw.charAt(1) === "\\" || raw.charAt(0) === "/" && raw.charAt(1) === "/") {
    const rest = raw.slice(2);
    const cut = rest.search(/[\\/]/);
    host = cut < 0 ? rest : rest.slice(0, cut);
  }
  const slash = raw.replace(/\//g, "\\");
  const low = slash.toLowerCase();
  let cloud = "";
  if (low.indexOf("\\onedrive\\") >= 0 || low.indexOf("\\onedrive - ") >= 0 || low.endsWith("\\onedrive")) cloud = "onedrive";
  else if (low.indexOf("\\dropbox\\") >= 0 || low.indexOf("\\dropbox ") >= 0 || low.endsWith("\\dropbox")) cloud = "dropbox";
  else if (low.indexOf("\\google drive\\") >= 0 || low.endsWith("\\google drive") || low.indexOf(":\\my drive") >= 0
      || low.indexOf(":\\shared drives") >= 0 || low.indexOf(":\\mój dysk") >= 0 || low.indexOf(":\\dyski współdzielone") >= 0) cloud = "gdrive";
  else if (typeof e.USERPROFILE === "string" && typeof e.OneDriveCommercial === "string" && e.OneDriveCommercial) {
    const home = e.USERPROFILE.replace(/\//g, "\\").replace(/\\+$/, "");
    if (home && slash.toLowerCase().indexOf(home.toLowerCase() + "\\") === 0) {
      const rel = slash.slice(home.length + 1).split("\\");
      const tenant = rel[0] || "";
      const bizName = e.OneDriveCommercial.replace(/^.*[\\/]/, "").replace(/^OneDrive - /i, "");
      if (rel.length >= 2 && tenant && bizName && tenant.toLowerCase() === bizName.toLowerCase() && rel[1].indexOf(" - ") >= 0) cloud = "sharepoint";
    }
  }
  const sys = String(e.SystemDrive || "C:").slice(0, 2).toLowerCase();
  const drive = /^[a-zA-Z]:/.test(raw) ? raw.slice(0, 2).toLowerCase() : "";
  const local = !host && !cloud && drive !== "" && drive === sys;
  return { host: host, local: local, cloud: cloud };
}
/* The request a member writes. `me` is {id, key, box}, `j` the join this desk keeps, `reveal` the lead's
   opening or null. `invite` is {id, proof} from an invitation, or absent, and absent is the document this
   desk has always written: no kind on the member and no invite field. A secret on `invite` is not copied. */
function memberRequestDoc(j, reveal, me, invite) {
  const desk = { id: me.id, key: me.key, box: me.box };
  if (j.name) desk.name = j.name;
  const got = invite && typeof invite === "object" && /^[0-9a-f]{16}$/.test(String(invite.id)) && /^[0-9a-f]{64}$/.test(String(invite.proof))
    ? { id: String(invite.id), proof: String(invite.proof) } : null;
  if (got) desk.kind = "desk";
  const doc = { format: 1, kind: JOIN_KIND, team: j.team, desk: desk, date: new Date(j.asked).toISOString(), commit: j.commit };
  if (got) doc.invite = got;
  if (reveal) { doc.reveal = j.nonce; doc.opened = reveal; }
  return doc;
}
/* A reveal rewrites the whole request. The invitation's id and proof stay as yes wrote them, and the
   member's kind with them. With no invitation the request is the one this desk has always written. */
function joinRequestDoc(j, reveal) {
  return memberRequestDoc(j, reveal, branchIdentity(false), j && j.invite);
}
function askJoin(file, name) {
  if (deskKeys === undefined) deskKeys = readDesk();
  const w = teamJoin;
  relayProbeMs = RELAY_PROBE_FIRST;
  if (w && w.invite && w.invite.relay && (w.invite.relay.withdrawn === true || w.invite.relay.withdrawing === true)) return askAgain(w); /* plant:e4-ask-again-desk */
  const me = branchIdentity(), root = catalogFolder(), at = path.join(root, path.basename(String(file || "")));
  if (!me) return Object.assign({}, joinView(), { refused: "no-identity", askRefused: "no-identity", why: "no-identity", platform: process.platform }); /* plant:w2-no-identity */
  if (!folderAnswers(root)) return Object.assign({}, joinView(), { sealed: file ? { file: path.basename(file) } : null, refused: "folder-not-answering", askRefused: "folder-not-answering", why: "folder-not-answering" }); /* plant:w2-folder-not-answering */
  const out = sealedOutside();
  let d = null;
  try { d = catalogPayload(fs.readFileSync(at, "utf8")).data; } catch { return joinView(); }
  if (!out || !d || d.kind !== SEALED_KIND || !SEALED_TEAM_RE.test(String(d.team)) || (teamKeys[d.team] && teamKeys[d.team][d.epoch]))
    return joinView();
  const nonce = crypto.randomBytes(32).toString("hex"), team = String(d.team);
  const j = { team: team, file: path.basename(at), nonce: nonce, commit: joinCommit(team, me.key, me.box, nonce), asked: Date.now(),
              held: newestEpoch(team), name: String(name || "").trim().slice(0, 120) };
  try { writeJoin(joinRequestDoc(j, null)); }
  catch (e) {
    console.error("etiuda: the request to join could not be written - " + e.message);
    const code = e && e.code;
    const notWritable = code === "EACCES" || code === "EPERM" || code === "EROFS"; /* plant:w2-not-writable-codes */
    const why = notWritable ? "folder-not-writable" : "folder-not-answering";
    return Object.assign({}, joinView(), { refused: why, askRefused: why, why: why }); /* plant:w2-folder-not-writable */
  }
  teamJoin = j;
  joinTold = false;
  persistDeskEnvelope();
  signinFlush();
  return joinView();
}
/* The relay has already accepted this invitation: it spent the token, or the invitation's wrap has given this desk a key.
   Cancel then withdraws the request at the relay and keeps both. A folder invitation has neither, and still undoes. */
function inviteAccepted(j) {
  const inv = j && j.invite && j.invite.relay;
  if (!inv || inv.end) return false;
  const wrapped = Array.isArray(inv.wrapped) && inv.wrapped.some(n => Number.isInteger(n) && n >= 1);
  if (wrapped) return true;
  if (inv.tokenSpent === true) return true;
  const channelProgram = relayChannel && relayChannel.program;
  if (channelProgram && typeof channelProgram.tokenSpent === "function" && channelProgram.tokenSpent(inv.inv) === true) return true;
  if (inv.rt && inv.inv) { /* plant:invite-spent-kept */
    try {
      const stateFile = relayMirrorOf(inv.rt) + ".json";
      const st = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      if (st && st.tokenUsedIds && st.tokenUsedIds[inv.inv] === true) return true;
      if (st && st.tokenUsed === true && (!st.tokenUsedIds || Object.keys(st.tokenUsedIds).length === 0)) return true;
    } catch { /* mirror absent or damaged */ }
  }
  return false;
}
/* The request leaves the mirror, so the channel sends its signed deletion on the invitation's session and the lead no longer
   sees it. The join says withdrawing until the relay has taken that deletion (onWithdrawn). The token, the pin and the keys
   stay, so Ask again sends the same request anew with no new link. */
function withdrawJoin(j) {
  if (deskBranch) { try { unlinkOwn(joinFile()); } catch { /* gone already */ } }
  j.invite.relay.withdrawing = true; /* plant:g2-withdrawing */
  joinTold = false;
  joinDone = null;
  persistDeskEnvelope();
  relaySoon();
  return joinView();
}
/* Ask again after a withdrawal: the same request, signed anew, which the channel sends on the invitation's session as before.
   The mark of the key held moves to now, so only a team file heeded after this, naming this desk, admits it. */
function askAgain(j) {
  const was = j.asked, held = j.held;
  /* A withdrawal the relay has not taken yet is let go: the request written back is the one already sent, byte for byte (the
     signature is deterministic), so nothing is owed and the request still standing at the relay is that one. */
  const taken = j.invite.relay.withdrawing !== true; /* plant:n1-same-request */
  if (taken) { j.asked = Date.now(); j.held = newestEpoch(j.team); }
  try { writeJoin(joinRequestDoc(j, null)); }
  catch (e) { j.asked = was; j.held = held; console.error("etiuda: the request to join could not be written - " + e.message); return joinView(); }
  delete j.invite.relay.withdrawn;
  delete j.invite.relay.withdrawing;
  joinTold = false;
  persistDeskEnvelope();
  relaySoon();
  return joinView();
}
function cancelJoin() {
  if (deskKeys === undefined) deskKeys = readDesk();
  const j = teamJoin;
  if (inviteAccepted(j)) return withdrawJoin(j); /* plant:h35-keep */
  if (j && deskBranch) { try { unlinkOwn(joinFile()); } catch { /* gone already, or the share is away */ } }
  teamJoin = null;
  joinTold = false;
  /* An invitation, by folder or by relay, changed this team's pin, where it came from, the folder it showed, the channel and the
     leave record (and a folder invitation the desk's own folder setting), and kept what each was in `before`, with the newest
     key the desk held then (`epoch`). Cancelling puts each back as it was while the desk keeps no newer key than that mark: a
     desk that held none goes back off the team, and a member that held the key goes back to the folder and the shown team it
     had, with its pin and its key (921e). A key this invitation's own wrap opened before the lead admitted the desk (marked in
     the join as `wrapped`) was not there before and does not hold the restore back: it is forgotten with the rest (921u). A
     newer key from elsewhere, one the roster's wrap gave, means the desk is admitted, and Cancel leaves what it set (921n). */
  const b = j && j.invite && j.invite.before, wrapped = (j && j.invite && ((j.invite.relay && j.invite.relay.wrapped) || j.invite.wrapped)) || [];
  if (b && newestEpoch(j.team, wrapped) === (b.epoch || 0)) undoInvite(j.team, b, j.invite); /* plant:c7-cancel */
  persistDeskEnvelope();
  return joinView();
}
/* What an invitation changes for `team`, as this desk holds it before: an entry the desk did not hold is left out, and `epoch`
   is the newest key it held, the mark Cancel compares the key it holds then with. */
function inviteBefore(team) {
  return JSON.parse(JSON.stringify({ pin: teamPins[team], from: teamPinFrom[team], shown: teamShown[team], channel: teamChannel[team],
    left: teamLeft[team], barred: teamBarred.has(team), epoch: newestEpoch(team) })); /* plant:c7-mark */
}
/* What Cancel puts back for an invitation taken now. An invitation taken over a pending one for the same team keeps the first's,
   which is what the desk held. `keptJoin` is the request standing when the invitation is taken. */
function inviteBeforeFor(team, keptJoin) {
  const kept = keptJoin && keptJoin.team === team && keptJoin.invite && keptJoin.invite.before;
  return kept || inviteBefore(team); /* plant:c7-chain */
}
/* The keys this invitation's wrap gave the desk, which it did not hold before the invitation: forgotten, as the wrap's own key was.
   A key the desk held before, at an epoch the wrap opened again, was never marked and stays. */
function forgetWrapped(team, inv) {
  const wrapped = (inv && inv.relay && inv.relay.wrapped) || (inv && inv.wrapped), kept = teamKeys[team];
  if (!Array.isArray(wrapped) || !kept) return;
  wrapped.forEach(n => { delete kept[n]; });
  if (!Object.keys(kept).length) delete teamKeys[team];
  ecFactsRead.clear();
}
/* An invitation let go before the lead admitted this desk puts back each thing it changed for `team`, deleting where the desk
   held none, and the watch is told the folder changed. `b` is inviteBefore's, kept in the join, and `inv` the join's invitation:
   a folder invitation moved the desk's own folder setting to its folder, and that goes back to what it was while it is still there. */
function undoInvite(team, b, inv) {
  forgetWrapped(team, inv); /* plant:e4-forget */
  if (b.pin) teamPins[team] = b.pin; else delete teamPins[team];
  if (b.from) teamPinFrom[team] = b.from; else delete teamPinFrom[team];
  if (b.shown) teamShown[team] = b.shown; else delete teamShown[team];
  if (b.channel) teamChannel[team] = b.channel; else delete teamChannel[team];
  if (b.left) teamLeft[team] = b.left; else delete teamLeft[team];
  if (b.barred) teamBarred.add(team); else teamBarred.delete(team);
  if (typeof inv.folder === "string" && deskKeys[CATALOG_FOLDER_KEY] === inv.folder) deskSetOwn(CATALOG_FOLDER_KEY, typeof inv.was === "string" && inv.was ? inv.was : undefined); /* plant:c8-own */
  teamStamp = "";
  relaySoon();
  catalogFolderChanged();
}
/* A refused request whose invitation the relay had already taken is withdrawn like a waiting one, and then it ends:
   the request is let go and what the invitation changed is put back, whether the relay takes the withdrawal or
   refuses it for good. A waiting request is left as it was, so Ask again still has what the invitation gave. */
function endRefusedRelay(j) {
  if (deskBranch) { try { unlinkOwn(joinFile()); } catch { /* gone already */ } }
  const team = j.team, inv = j.invite, b = inv && inv.before, wrapped = (inv && ((inv.relay && inv.relay.wrapped) || inv.wrapped)) || [];
  const putBack = !!(b && newestEpoch(team, wrapped) === (b.epoch || 0));
  teamJoin = null;
  joinTold = false;
  joinDone = null;
  if (putBack) undoInvite(team, b, inv);
  persistDeskEnvelope();
  sendJoin(theWindow);
}
function refusedWithdrawEnds(j) {
  if (!j || j.refused !== true || !j.invite || !j.invite.relay) return false;
  endRefusedRelay(j); /* plant:refused-cancel-ends */
  return true;
}
function checkInviteRefusal() {
  const j = teamJoin;
  if (!j || !j.invite || (j.invite.relay && !j.invite.folder) || j.refused) return false;
  const root = folderTeamHere() ? catalogFolder() : (j.invite.folder || catalogFolder());
  if (!folderAnswers(root)) return false;
  const invId = j.invite.id;
  if (!invId) return false;
  const refFile = path.join(root, "invites", invId + ".refused.json");
  let text = "";
  try {
    if (fs.statSync(refFile).size > 65536) return false;
    text = fs.readFileSync(refFile, "utf8");
  } catch { return false; }
  let doc = null;
  try { doc = JSON.parse(String(text).replace(/^\uFEFF/, "")); } catch { return false; }
  if (!doc || doc.team !== j.team || doc.invitation !== invId) return false;
  const lead = teamPins[j.team] || (j.invite && j.invite.lead);
  if (!lead) return false;
  const ok = RelayChannel().inviteRefusedGenuine(doc, lead);
  if (!ok) return false;
  forgetWrapped(j.team, j.invite); /* plant:refuse-forget */
  j.refused = true;
  persistDeskEnvelope();
  return true;
}
function leadForPause(team, root) {
  if (teamPins[team]) return teamPins[team];
  if (teamJoin && teamJoin.team === team && teamJoin.invite && teamJoin.invite.lead
      && typeof teamJoin.invite.lead.keyId === "string" && /^[0-9a-f]{64}$/.test(String(teamJoin.invite.lead.public || ""))) {
    return { keyId: teamJoin.invite.lead.keyId, public: teamJoin.invite.lead.public };
  }
  if (root) {
    try {
      const doc = teamTextChosen(root).doc;
      if (doc && doc.id === team && teamWhole(doc) && doc.lead && typeof doc.lead.keyId === "string" && /^[0-9a-f]{64}$/.test(String(doc.lead.public || ""))) {
        return { keyId: doc.lead.keyId, public: doc.lead.public };
      }
    } catch { /* ignore */ }
  }
  return null;
}
function pauseJudge(team, root) {
  if (!team || !root) return false;
  const lead = leadForPause(team, root);
  if (!lead) return teamPauseSeen[team] ? teamPauseSeen[team].paused === true : false;
  let file = path.join(root, PAUSE_NAME);
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch {
    return teamPauseSeen[team] ? teamPauseSeen[team].paused === true : false;
  }
  try {
    const doc = JSON.parse(text.replace(/^\uFEFF/, ""));
    if (doc && +doc.format === 1 && doc.kind === PAUSE_KIND && doc.team === team
        && typeof doc.paused === "boolean" && Number.isInteger(doc.t) && doc.t >= 0) {
      const highest = teamPauseSeen[team] ? teamPauseSeen[team].t : -1;
      if (doc.t > highest) {
        const sig = doc.sig;
        if (sig && sig.alg === "Ed25519" && String(sig.keyId) === String(lead.keyId) && /^[0-9a-f]{128}$/.test(String(sig.value || ""))) {
          const pub = crypto.createPublicKey({
            key: Buffer.concat([SPKI_ED25519, Buffer.from(String(lead.public), "hex")]),
            format: "der", type: "spki"
          });
          if (crypto.verify(null, askSignedBytes(doc), pub, Buffer.from(String(sig.value), "hex"))) {
            if (true) { /* plant:f9-team-pause */
              teamPauseSeen[team] = { t: doc.t, paused: doc.paused };
              persistDeskEnvelope();
            }
          }
        }
      }
    }
  } catch { /* ignore bad pause */ }
  return teamPauseSeen[team] ? teamPauseSeen[team].paused === true : false;
}
/* Moves the request on and says where it stands: admitted once this desk keeps a newer key for the team than when it
   asked, revealed once the lead's opening for its commitment is read and the reveal written, refused where the lead said so.
   `leads` is leadsView's. */
function joinView() {
  if (deskKeys === undefined) deskKeys = readDesk();
  const root = catalogFolder();
  const view = { sealed: null, join: null, joined: null, leads: leadsView() };
  if (relayHere()) view.onRelay = true;
  if (!folderAnswers(root)) return view;
  heedTeam();
  checkInviteRefusal();
  finishJoin();
  const j = teamJoin, me = branchIdentity(false);
  if (joinDone) {
    view.joined = joinDone;
    joinDone = null;
  }
  const opens = relayOpens(j);
  if (opens) view.opens = opens; /* plant:relay-opens */
  if (j && me) {
    const paused = pauseJudge(j.team, root);
    if (!j.file) {
      const named = sealedOutside();
      if (named && named.team === j.team) { j.file = named.file; persistDeskEnvelope(); }
    }
    if (!j.opened && !j.refused) {
      let joins = null;
      try { joins = JSON.parse(fs.readFileSync(path.join(root, JOINS_NAME), "utf8")); } catch { /* none yet */ }
      const got = joinOpening(joins, j.team, me.id, j.commit, joinTrustPubs(j.team, root));
      if (got && got.refused) { j.refused = true; persistDeskEnvelope(); }
      else if (got) {
        try { writeJoin(joinRequestDoc(j, got)); j.opened = got; persistDeskEnvelope(); }
        catch (e) { console.error("etiuda: the request to join could not be answered - " + e.message); }
      }
    }
    /* The code is the lead's opening, whether or not the request came by invitation. The invite field names that lead. */
    let relayEnd = "waiting";
    if (j.invite && j.invite.relay && j.invite.relay.end) relayEnd = j.invite.relay.end; /* plant:h35-relay-state */
    view.join = { team: j.team, file: j.file, asked: j.asked, name: j.name,
                  state: j.refused ? "refused" : j.opened ? "code" : relayEnd,
                  code: j.opened ? joinCode(j.team, me.key, me.box, j.opened.lead.public, j.nonce, j.opened.nonce) : "" };
    if (paused) view.join.paused = true;
    if (j.invite) view.join.invite = Object.assign({ lead: String(j.invite.lead && j.invite.lead.name || "") }, (j.invite.wrapped && j.invite.wrapped.length) ? { wrapped: true } : {});
    /* A relay join names its relay's host, so the page words it as one; the state is "used", "ended" or "removed" where the relay refused the token. */
    if (j.invite && j.invite.relay) { try { view.join.invite.relay = new URL(String(j.invite.relay.url)).host; } catch { view.join.invite.relay = ""; } }
    if (j.invite && j.invite.relay && relayCatalogNamed.has(j.team)) view.join.invite.open = true;
    if (j.invite && !j.invite.relay && teamKeys[j.team] && Object.keys(teamKeys[j.team]).length) view.join.invite.open = true; /* plant:folder-join-open */
    const left = !!(j.invite && j.invite.relay && teamLeft[j.team] && !(teamKeys[j.team] && Object.keys(teamKeys[j.team]).length));
    const doubted = !!(j.invite && j.invite.relay && teamBarred.has(j.team) && !teamLeft[j.team]);
    if (j.invite && j.invite.relay) {
      if (left) view.join.left = true; /* plant:h35-keeps */
      if (doubted) view.join.doubted = true;
      if (j.invite.relay.withdrawn === true) view.join.withdrawn = true;
      else if (j.invite.relay.unkept === true) view.join.unkept = true;
      else if (j.invite.relay.withdrawing === true && j.invite.relay.readonly === true) {
        view.join.withdrawing = true;
        view.join.readonly = true;
      } else if (j.invite.relay.withdrawing === true) {
        view.join.withdrawing = true;
      }
    }
  }
  view.sealed = sealedOutside();
  view.leads = leadsView();
  return view;
}
function sendJoin(win) {
  if (!win || win.isDestroyed()) return;
  const v = joinView(), said = JSON.stringify(v);
  if (said === joinSent) return;
  joinSent = said;
  win.webContents.send("etiuda:team-join", v);
}
/* The request as the desk envelope kept it, or null where any field is not what askJoin and joinView write. */
function joinKept(j) {
  const o = j && j.opened;
  const ok = !!j && typeof j === "object" && SEALED_TEAM_RE.test(String(j.team)) && typeof j.file === "string"
    && JOIN_HEX_RE.test(String(j.nonce)) && JOIN_HEX_RE.test(String(j.commit)) && Number.isFinite(j.asked)
    && Number.isInteger(j.held) && j.held >= 0 && typeof j.name === "string"
    && (o === undefined || (!!o && !!o.lead && typeof o.lead.keyId === "string" && JOIN_HEX_RE.test(String(o.lead.public))
      && JOIN_HEX_RE.test(String(o.nonce))))
    && (j.refused === undefined || j.refused === true);
  if (!ok) return null;
  if (j.invite === undefined) return j;
  const inv = j.invite, who = inv && inv.lead;
  const inviteOk = !!inv && typeof inv === "object" && /^[0-9a-f]{16}$/.test(String(inv.id)) && JOIN_HEX_RE.test(String(inv.proof))
    && !Object.prototype.hasOwnProperty.call(inv, "secret")
    && !!who && typeof who === "object" && typeof who.keyId === "string" && who.keyId.length > 0 && who.keyId.length <= 80
    && JOIN_HEX_RE.test(String(who.public)) && typeof who.name === "string" && who.name.length <= 120
    && (inv.folder === undefined || typeof inv.folder === "string") && (inv.was === undefined || typeof inv.was === "string")
    && (inv.pinned === undefined || typeof inv.pinned === "boolean") && (inv.relay === undefined || relayKept(inv.relay))
    && (inv.before === undefined || beforeKept(inv.before)); /* plant:c7-kept */
  return inviteOk ? j : null;
}
/* An invitation's snapshot as the envelope keeps it, the shapes inviteBefore writes and the reader of each table accepts; `epoch`
   is a count of the epochs a key is held for, absent in an envelope written before the mark was taken. */
function beforeKept(b) {
  const table = v => !!v && typeof v === "object" && !Array.isArray(v);
  if (!table(b) || typeof b.barred !== "boolean") return false;
  const c = b.channel === undefined ? null : teamChannelOf({ channel: b.channel }), s = b.shown;
  return (b.pin === undefined || (table(b.pin) && typeof b.pin.keyId === "string" && JOIN_HEX_RE.test(String(b.pin.public))))
    && (b.from === undefined || PIN_FROM.indexOf(b.from) >= 0)
    && (s === undefined || (table(s) && (s.lead === undefined || shownName(s.lead))
      && (s.folder === undefined || (typeof s.folder === "string" && s.folder.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(s.folder)))))
    && (b.channel === undefined || (!!c && c.kind === "relay"))
    && (b.left === undefined || (typeof b.left === "string" && /^\d{4}-\d\d-\d\dT[0-9:.]+Z$/.test(b.left)))
    && (b.epoch === undefined || (Number.isInteger(b.epoch) && b.epoch >= 0)); /* plant:c7-epoch */
}
/* A relay invitation as the envelope keeps it: the relay team id, the address and the invitation's id in the open, the
   token and the seal key sealed by safeStorage, and `wrapped`, the epochs the invitation's wrap gave a key for (whole numbers
   from 1), which Cancel forgets. */
function relayKept(r) {
  const c = r && typeof r === "object" && !Array.isArray(r) ? teamChannelOf({ channel: { kind: "relay", rt: r.rt, url: r.url } }) : null;
  return !!c && c.kind === "relay" && /^[0-9a-f]{32}$/.test(String(r.inv)) && typeof r.token === "string" && r.token !== ""
    && typeof r.seal === "string" && r.seal !== ""
    && (r.wrap === undefined || (typeof r.wrap === "string" && r.wrap !== ""))
    && (r.wrapped === undefined || (Array.isArray(r.wrapped) && r.wrapped.length <= 64 && r.wrapped.every(n => Number.isInteger(n) && n >= 1))) /* plant:e4-wrapped */
    && (r.end === undefined || r.end === "used" || r.end === "ended" || r.end === "removed")
    && (r.withdrawn === undefined || r.withdrawn === true) && (r.withdrawing === undefined || r.withdrawing === true)
    && (r.unkept === undefined || r.unkept === true) && (r.readonly === undefined || r.readonly === true)
    && (r.tokenSpent === undefined || r.tokenSpent === true)
    && (r.box === undefined || /^[0-9a-f]{64}$/.test(String(r.box)));
}
/* Whether this desk takes invitations: "" where it does, else the refusal every invitation gets, at read and at yes.
   "policy" while machine policy names a team folder or a lead, unless an invitation matches the policy.
   A named lead must match, and a named folder must match. LeadKey-only needs the lead alone; folder-only
   stays shut, since nothing names who may invite. A UNC path and a mapped drive read as different folders. */
function inviteDoor(parsed) {
  const named = sayJoinPolicy();
  if (!named.folder && !named.lead) return "";
  if (!named.lead) return "policy";
  if (!parsed || !parsed.lead || parsed.lead.public !== named.lead) return "policy";
  if (named.folder && (!parsed.folder || !policySameFolder(parsed.folder, named.folder))) return "policy";
  return "";
}
/* An invitation, its folder read as this system reaches it. */
function inviteParse(text) {
  return inviteRead(text, process.platform !== "win32");
}
/* Why an invitation for `team` under `lead` is not taken here, or "": the team's lead was forgotten with no leave kept (the
   op "forget"), which only an answered request undoes, or the team is pinned under another key, which only a signed handover
   moves. A team this desk left is no refusal: the confirm asks whether to join it again, and yes lifts the leave. */
function inviteSettled(team, lead) {
  if (teamBarred.has(team) && !teamLeft[team]) return "barred";
  const pin = teamPins[team];
  return pin && (pin.keyId !== lead.keyId || pin.public !== lead.public) ? "pinned" : "";
}
/* A relay invitation from another lead for the team this desk's channel holds as left behind (strandedShown) is not refused as
   "pinned": the yes leaves the team as Leave this team does and then takes it, so the lead's key is shown to compare once
   admitted. Every other pinned team refuses it. */
function inviteStranded(parsed) {
  return !!parsed.relay && inviteSettled(parsed.team, parsed.lead) === "pinned" && !!strandedShown(parsed.team); /* plant:stranded-invite */
}
/* "" where the folder an invitation names may take its request: it holds no team file, or one whole under the invited
   lead and for the invited team. "unreadable" where its team file cannot be read, is larger than a team file, or is not
   JSON; "foreign" for any other. */
function inviteFolderTeam(parsed) {
  const chosen = teamTextChosen(parsed.folder);
  if (chosen.missing) return "";
  const doc = chosen.doc;
  if (!doc) return "unreadable";
  return teamWhole(doc) && doc.id === parsed.team && doc.lead && doc.lead.keyId === parsed.lead.keyId && doc.lead.public === parsed.lead.public
    ? "" : "foreign";
}
/* True only where `folder` holds this team's own team file, whole under the invited lead, under a lead handed over to
   from it, or vouched for by a ring in that folder. False for any other. */
function inviteFolderBelongs(folder, parsed) {
  if (!folder || !parsed || !parsed.team || !parsed.lead) return false;
  const doc = teamTextChosen(folder).doc;
  if (!doc || !teamWhole(doc) || doc.id !== parsed.team) return false;
  if (doc.lead && doc.lead.keyId === parsed.lead.keyId && doc.lead.public === parsed.lead.public) return true;
  if (handedTo(doc, parsed.lead)) return true;
  const ring = readRingFile(folder);
  return Boolean(ring && memberRingVouches(doc, ring));
}
/* What an invitation says, and nothing written: the folder it names is not opened, stated or watched. */
function readInvite(text) {
  const parsed = inviteParse(text);
  const view = joinView();
  const shut = inviteDoor(parsed);
  if (shut) return Object.assign({}, view, { refused: shut });
  if (!parsed) return Object.assign({}, view, { refused: "unread" });
  const settled = inviteSettled(parsed.team, parsed.lead);
  if (settled && !inviteStranded(parsed)) return Object.assign({}, view, { refused: settled });
  /* A relay invitation is judged by what it is and not by how it arrived: the lead, the team and the relay's host, and no check
     code and no folder, as the link's confirm offers it. */
  if (parsed.relay) {
    const offer = { lead: parsed.lead.name, team: parsed.team, relay: new URL(parsed.relay.url).host };
    if (teamBarred.has(parsed.team) && teamLeft[parsed.team]) offer.left = teamLeft[parsed.team];
    return Object.assign({}, view, { offer: offer }); /* plant:relay-offer */
  }
  /* A place is planned, not stated: a path on another computer answers a stat by connecting. how, why and kind are
     set only where the invitation carries a place, so an old invitation's offer stays as it was. */
  let shownFolder = parsed.folder;
  let carried = null;
  try { carried = parsed.place ? placeKept(parsed.place) : null; } catch (e) { carried = null; }
  if (carried) {
    const plan = invitePlacePlan(parsed);
    if (plan && typeof plan.path === "string" && plan.path) shownFolder = plan.path;
    carried = { how: plan && plan.how ? plan.how : "", why: plan && plan.why ? plan.why : "", kind: carried.kind };
  }
  const where = folderHost(shownFolder, process.env);
  const offer = { folder: shownFolder, lead: parsed.lead.name, code: inviteCode(parsed.secret, parsed.lead.public),
    host: where.host, cloud: where.cloud, local: where.local };
  if (carried) { offer.how = carried.how; offer.why = carried.why; offer.kind = carried.kind; }
  if (teamBarred.has(parsed.team) && teamLeft[parsed.team]) offer.left = teamLeft[parsed.team];
  return Object.assign({}, view, { offer: offer });
}
/* Where the invitation's place would land on this computer, with every candidate treated as there: the confirm shows
   the plan and does not stat, because a path on another computer answers a stat by connecting. A record that cannot
   be read leaves the absolute path. */
function invitePlacePlan(parsed) {
  if (!parsed || !parsed.place) return { path: parsed && parsed.folder ? parsed.folder : "", how: "absolute", why: "plain" };
  let roots = [];
  try { roots = syncRootsFrom(readSyncRecords(null)); }
  catch (e) { roots = []; }
  try { return placeResolve(parsed.folder, parsed.place, roots, function () { return true; }); }
  catch (e) { return { path: parsed.folder, how: "absolute", why: "plain" }; }
}
/* The folder yes will write into. A root candidate is asked first, then the absolute path the invitation carried, and
   only then does the caller open the picker. An old invitation, with no place, is asked at its path as before. */
async function chooseInviteFolder(parsed) {
  let kept = null;
  try { kept = placeKept(parsed && parsed.place); }
  catch (e) { kept = null; }
  if (!kept) {
    if (await askFolder(parsed.folder)) return { path: parsed.folder, ask: false };
    return { ask: true };
  }
  let roots = [];
  try { roots = syncRootsFrom(readSyncRecords(null)); }
  catch (e) { roots = []; }
  if (kept.kind === "unc") {
    const built = placeJoin(kept.root, kept.rel);
    if (built && await askFolder(built)) return { path: built, ask: false };
    return { ask: true };
  }
  let candidates = [];
  try { candidates = placeCandidates(parsed.folder, kept, roots); }
  catch (e) { candidates = []; }
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i] && await askFolder(candidates[i])) return { path: candidates[i], ask: false };
  }
  if (await askFolder(parsed.folder)) return { path: parsed.folder, ask: false };
  return { ask: true };
}
/* The person's yes, with the check code they typed, which a folder invitation needs and a relay invitation does not,
   whatever either came by. The folder is asked before anything is written, and one that
   does not answer, or whose team file is not the invited team's, is put back as it was. A pin the invitation sets is
   a key not yet shown; the request carries the proof, never the secret. */
async function takeInvite(text, name, check) {
  if (deskKeys === undefined) deskKeys = readDesk();
  const parsed = inviteParse(text);
  const shut = inviteDoor(parsed);
  if (shut) return Object.assign({}, joinView(), { refused: shut });
  if (!parsed) return Object.assign({}, joinView(), { refused: "unread" });
  const settled = inviteSettled(parsed.team, parsed.lead);
  const stranded = !!settled && inviteStranded(parsed);
  if (settled && !stranded) return Object.assign({}, joinView(), { refused: settled });
  const code = inviteCode(parsed.secret, parsed.lead.public);
  if (!parsed.relay) /* plant:relay-code */ /* plant:folder-code */
  {
    if (!code || String(check || "").replace(/\s+/g, "") !== code) return Object.assign({}, joinView(), { refused: "check" });
  }
  const me = branchIdentity();
  if (!me) return Object.assign({}, joinView(), { refused: "unread" });
  let ask = null;
  if (parsed.relay && stranded) {
    if (!branchSealable()) return Object.assign({}, joinView(), { refused: "unread" });
    /* The request is written before the old lead is let go, so a write that fails leaves this desk as it was: left behind, with
       its notice, and the page told nothing was written (the test architect, 2026-11-01 11:51). */
    ask = relayAsk(parsed, name, me);
    if (ask.refused) return Object.assign({}, joinView(), { refused: ask.refused });
    if (!askWritten(ask)) return Object.assign({}, joinView(), { refused: "silent" }); /* plant:stranded-ask-first */
    const old = relayChannel;
    forgetLead(parsed.team, true);
    /* The leave stops its channel on the shell's next turn (relaySoon); the request waits for that, and for the old channel's last cycle. */
    await new Promise(r => setTimeout(r, 0));
    if (old && old !== relayChannel) await old.stop().catch(() => {});
    const now = inviteDoor(parsed) || inviteSettled(parsed.team, parsed.lead);
    if (now) {
      if (askKept(ask)) { try { unlinkOwn(ask.file); } catch { /* gone */ } }
      return Object.assign({}, joinView(), { refused: now });
    }
  }
  if (parsed.relay) return takeRelayInvite(parsed, name, me, ask);
  const previous = catalogFolder();
  const keptJoin = teamJoin;
  /* The desk's own folder setting before any invitation still kept here moved it, for policyLetsInviteGo. */
  const earlier = keptJoin && keptJoin.invite ? keptJoin.invite : null;
  const ownBefore = typeof deskKeys[CATALOG_FOLDER_KEY] === "string" ? deskKeys[CATALOG_FOLDER_KEY] : "";
  const was = earlier && typeof earlier.was === "string" && ownBefore === earlier.folder ? earlier.was : ownBefore;
  const found = await chooseInviteFolder(parsed);
  let chosen = "";
  if (found.ask) {
    const picked = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      defaultPath: previous || defaultCatalogFolder(),
      title: shellWords().pickTeamFolder,
    });
    chosen = (!picked || picked.canceled || !picked.filePaths || !picked.filePaths[0]) ? "" : picked.filePaths[0];
    if (!chosen) {
      if (catalogFolder() !== previous) deskSetOwn(CATALOG_FOLDER_KEY, previous);
      return Object.assign({}, joinView(), { canceled: true });
    }
    const chosenAnswers = await askFolder(chosen);
    if (!chosenAnswers || !inviteFolderBelongs(chosen, parsed)) {
      if (catalogFolder() !== previous) deskSetOwn(CATALOG_FOLDER_KEY, previous);
      return Object.assign({}, joinView(), { refused: "foreign" });
    }
    parsed.folder = chosen;
    deskSetOwn(CATALOG_FOLDER_KEY, chosen);
  } else {
    parsed.folder = found.path;
    if (previous !== parsed.folder) deskSetOwn(CATALOG_FOLDER_KEY, parsed.folder);
  }
  settleFolder(parsed.folder, true);
  const late = (chosen ? "" : inviteFolderTeam(parsed)) || inviteSettled(parsed.team, parsed.lead);
  if (late) {
    if (catalogFolder() !== previous) deskSetOwn(CATALOG_FOLDER_KEY, previous);
    return Object.assign({}, joinView(), { refused: late });
  }
  const nonce = crypto.randomBytes(32).toString("hex");
  const commit = joinCommit(parsed.team, me.key, me.box, nonce);
  const proof = memberProof(parsed.secret, commit);
  const incomingId = inviteIdOf(parsed.secret);
  if (!proof || !incomingId) {
    if (catalogFolder() !== previous) deskSetOwn(CATALOG_FOLDER_KEY, previous);
    return Object.assign({}, joinView(), { refused: "unread" });
  }
  const seen = sealedOutside();
  const file = seen && seen.team === parsed.team ? seen.file : "";
  const pinned = !teamPins[parsed.team] || (!!earlier && keptJoin.team === parsed.team && earlier.pinned === true);
  const before = inviteBeforeFor(parsed.team, keptJoin); /* plant:c8-before */
  const j = { team: parsed.team, file: file, nonce: nonce, commit: commit, asked: Date.now(), held: newestEpoch(parsed.team),
    name: String(name || "").trim().slice(0, 120),
    invite: { id: incomingId, proof: proof, lead: { keyId: parsed.lead.keyId, public: parsed.lead.public, name: parsed.lead.name },
      folder: parsed.folder, was: was, pinned: pinned, before: before } };
  const gave = keptJoin && keptJoin.team === parsed.team && keptJoin.invite && (keptJoin.invite.wrapped || (keptJoin.invite.relay && keptJoin.invite.relay.wrapped));
  if (gave && gave.length) j.invite.wrapped = gave.slice();
  let wrapKey = null;
  if (branchSealable()) {
    try {
      wrapKey = RelayChannel().inviteWrapKey(parsed.secret);
      if (wrapKey) j.invite.wrap = safeStorage.encryptString(wrapKey.toString("base64")).toString("base64");
    } catch {}
  }
  /* Read straight from the invitation's folder, not a mirror: no team is joined yet, so no syncer keeps one, and the folder
     has just answered askFolder above. */
  const wrapPath = path.join(parsed.folder, "invites", incomingId + ".wrap.json");
  let wrapDoc = null;
  try {
    if (fs.statSync(wrapPath).size <= 65536) wrapDoc = JSON.parse(fs.readFileSync(wrapPath, "utf8"));
  } catch { wrapDoc = null; }
  let wrapEpochOpened = null;
  let hadKeyBefore = false;
  if (wrapDoc && wrapKey && branchSealable()) {
    const wrapTeamDoc = teamTextChosen(parsed.folder).doc;
    if (wrapTeamDoc && teamWhole(wrapTeamDoc) && wrapTeamDoc.id === parsed.team && wrapTeamDoc.lead && wrapTeamDoc.lead.keyId === parsed.lead.keyId && wrapTeamDoc.lead.public === parsed.lead.public) {
      const opened = RelayChannel().openInviteWrap(wrapKey, { wrap: wrapDoc, teamDoc: wrapTeamDoc, teamId: parsed.team, relayTeamId: "folder", invitationId: incomingId });
      if (opened.ok) {
        wrapEpochOpened = opened.epoch;
        const kept = teamKeys[parsed.team] || {};
        hadKeyBefore = !!kept[opened.epoch];
        kept[opened.epoch] = safeStorage.encryptString(opened.key.toString("base64")).toString("base64");
        teamKeys[parsed.team] = kept;
        if (!hadKeyBefore) j.invite.wrapped = (j.invite.wrapped || []).concat(opened.epoch);
        ecFactsRead.clear();
      }
    }
  }
  try { writeJoin(memberRequestDoc(j, null, me, { id: incomingId, proof: proof })); }
  catch (e) {
    console.error("etiuda: the request to join could not be written - " + e.message);
    if (wrapEpochOpened !== null && !hadKeyBefore && teamKeys[parsed.team]) {
      delete teamKeys[parsed.team][wrapEpochOpened];
      if (Object.keys(teamKeys[parsed.team]).length === 0) delete teamKeys[parsed.team];
      ecFactsRead.clear();
    }
    deskSetOwn(CATALOG_FOLDER_KEY, ownBefore || undefined);
    settleFolder(previous, true);
    const code = e && e.code;
    const notWritable = code === "EACCES" || code === "EPERM" || code === "EROFS";
    return Object.assign({}, joinView(), { refused: notWritable ? "folder-not-writable" : "silent" }); /* plant:invite-folder-not-writable */
  }
  if (keptJoin && previous !== parsed.folder && deskBranch && folderAnswers(previous)) {
    try { fs.unlinkSync(path.join(previous, "desks", branchIdOf(deskBranch.sign.pub), "join.json")); } catch (e) { /* already gone */ }
  }
  teamJoin = j;
  joinTold = false;
  if (teamLeft[parsed.team]) { delete teamLeft[parsed.team]; teamBarred.delete(parsed.team); }
  delete teamRelayGone[parsed.team];
  if (!teamPins[parsed.team]) {
    teamPins[parsed.team] = { keyId: parsed.lead.keyId, public: parsed.lead.public };
    teamSeen.delete(parsed.team);
  }
  teamShown[parsed.team] = Object.assign({ folder: parsed.folder }, shownName(parsed.lead.name) ? { lead: parsed.lead.name } : {});
  teamStamp = "";
  persistDeskEnvelope();
  relayCatalogNamed.delete(parsed.team);
  const view = joinView();
  catalogFolderChanged(); /* plant:invite-folder-changed */
  if (theWindow && !theWindow.isDestroyed()) catalogChanged(theWindow);
  return view;
}
/* Everything a yes to a relay invitation makes before it changes anything, so whatever can fail fails first: the request's nonce,
   commitment and proof, the time it is dated, the token and the two keys sealed by safeStorage, the invitation's mirror made, and
   the signed request to be written in that mirror, where it is kept once the invitation is taken. {refused} where one fails. */
function relayAsk(parsed, name, me) {
  const nonce = crypto.randomBytes(32).toString("hex");
  const commit = joinCommit(parsed.team, me.key, me.box, nonce);
  const proof = memberProof(parsed.secret, commit);
  const incomingId = inviteIdOf(parsed.secret);
  const sealKey = RelayChannel().inviteSealKey(parsed.secret);
  const wrapKey = RelayChannel().inviteWrapKey(parsed.secret);
  if (!proof || !incomingId || !sealKey || !wrapKey || !deskBranch) return { refused: "unread" };
  let token = "", seal = "", wrap = "";
  try {
    /* The link's token, as the lead registered its hash, and the two keys derived from the secret. The secret itself is not kept. */
    token = safeStorage.encryptString(parsed.relay.token).toString("base64");
    seal = safeStorage.encryptString(sealKey.toString("base64")).toString("base64");
    wrap = safeStorage.encryptString(wrapKey.toString("base64")).toString("base64");
  } catch { return { refused: "unread" }; }
  try { fs.mkdirSync(relayMirrorOf(parsed.relay.rt), { recursive: true }); }
  catch (e) { console.error("etiuda: the relay's mirror could not be made - " + e.message); return { refused: "relay-mirror" }; } /* plant:relay-mirror-why */
  const asked = Date.now(), cut = String(name || "").trim().slice(0, 120);
  const doc = memberRequestDoc({ team: parsed.team, name: cut, asked: asked, commit: commit }, null, me, { id: incomingId, proof: proof });
  const file = path.join(relayMirrorOf(parsed.relay.rt), "desks", branchIdOf(deskBranch.sign.pub), "join.json");
  return { nonce: nonce, commit: commit, proof: proof, id: incomingId, token: token, seal: seal, wrap: wrap, asked: asked, doc: doc, file: file,
    text: "", written: false };
}
/* Writes the request made ahead and keeps its text, or says why it could not be written and returns false. */
function askWritten(ask) {
  try { ask.text = writeJoin(ask.doc, ask.file); ask.written = true; return true; }
  catch (e) { console.error("etiuda: the request to join could not be written - " + e.message); return false; }
}
/* Yes to a relay invitation: no folder is asked, since the team folder is the mirror the channel layer keeps. The token
   and the key the request is sealed under are kept sealed by safeStorage until the lead admits this desk; the pin the
   invitation sets is the one board 907 lets the desk follow a relay address under. */
/* `ahead`: a left-behind desk's yes, its request made and written before it let the old lead go (relayAsk, askWritten). */
function takeRelayInvite(parsed, name, me, ahead) {
  if (!branchSealable()) return Object.assign({}, joinView(), { refused: "unread" });
  const ask = ahead || relayAsk(parsed, name, me);
  if (ask.refused) return Object.assign({}, joinView(), { refused: ask.refused });
  const nonce = ask.nonce, commit = ask.commit, proof = ask.proof, incomingId = ask.id, token = ask.token, seal = ask.seal, wrap = ask.wrap;
  const keptJoin = teamJoin, previous = catalogFolder();
  const was = { join: teamJoin, pin: teamPins[parsed.team], from: teamPinFrom[parsed.team], shown: teamShown[parsed.team] };
  const pinned = !teamPins[parsed.team] || (!!(keptJoin && keptJoin.invite) && keptJoin.team === parsed.team && keptJoin.invite.pinned === true);
  const before = inviteBeforeFor(parsed.team, keptJoin);
  const j = { team: parsed.team, file: "", nonce: nonce, commit: commit, asked: ask.asked, held: newestEpoch(parsed.team),
    name: String(name || "").trim().slice(0, 120),
    invite: { id: incomingId, proof: proof, lead: { keyId: parsed.lead.keyId, public: parsed.lead.public, name: parsed.lead.name },
      pinned: pinned, before: before, relay: { rt: parsed.relay.rt, url: parsed.relay.url, inv: parsed.relay.inv, token: token, seal: seal, wrap: wrap } } };
  if (parsed.lead.box) j.invite.relay.box = parsed.lead.box; /* plant:f6-box-kept */
  /* An invitation taken over a pending one for the same team keeps the epochs the first's wrap gave a key for, as it keeps the first's snapshot. */
  const gave = keptJoin && keptJoin.team === parsed.team && keptJoin.invite && keptJoin.invite.relay && keptJoin.invite.relay.wrapped;
  if (gave && gave.length) j.invite.relay.wrapped = gave.slice(); /* plant:e4-chain */
  teamJoin = j;
  if (!teamPins[parsed.team]) { teamPins[parsed.team] = { keyId: parsed.lead.keyId, public: parsed.lead.public }; teamSeen.delete(parsed.team); }
  teamPinFrom[parsed.team] = "invite";
  let relayHost = "";
  try { relayHost = new URL(parsed.relay.url).host; } catch { relayHost = ""; }
  teamShown[parsed.team] = Object.assign({ folder: relayMirrorOf(parsed.relay.rt) }, relayHost ? { relay: relayHost } : {}, shownName(parsed.lead.name) ? { lead: parsed.lead.name } : {});
  /* A request written ahead (a left-behind desk's) is written again only where the leave took it from the mirror. */
  try { if (!askKept(ahead)) writeJoin(memberRequestDoc(j, null, me, { id: incomingId, proof: proof })); }
  catch (e) {
    console.error("etiuda: the request to join could not be written - " + e.message);
    teamJoin = was.join;
    if (was.pin) teamPins[parsed.team] = was.pin; else delete teamPins[parsed.team];
    if (was.from) teamPinFrom[parsed.team] = was.from; else delete teamPinFrom[parsed.team];
    if (was.shown) teamShown[parsed.team] = was.shown; else delete teamShown[parsed.team];
    return Object.assign({}, joinView(), { refused: "silent" });
  }
  if (keptJoin && previous !== catalogFolder() && deskBranch && folderAnswers(previous)) {
    try { fs.unlinkSync(path.join(previous, "desks", branchIdOf(deskBranch.sign.pub), "join.json")); } catch (e) { /* already gone */ }
  }
  if (teamLeft[parsed.team]) { delete teamLeft[parsed.team]; teamBarred.delete(parsed.team); }
  delete teamRelayGone[parsed.team];
  relayCatalogNamed.delete(parsed.team);
  /* A left-behind desk's own files wait for "It matches", and go nowhere on "It does not match" (the test architect, 2026-11-01 11:51). */
  if (ahead) teamHeldOut.add(parsed.team);
  teamStamp = "";
  joinTold = false;
  persistDeskEnvelope();
  relayRun();
  catalogFolderChanged();
  return joinView();
}
/* The lead key as Studio's Settings show it, the 16 hex after "studio-" (sign.mjs keyIdFor), made from the public half and
   never from the file's keyId, which any writer of the share chooses. */
function leadPrint(publicHex) {
  return crypto.createHash("sha256").update(Buffer.from(String(publicHex), "hex")).digest("hex").slice(0, 16);
}
/* Every lead this desk trusts, for the agent to compare once after admission and to leave at any time: the team by its lead's
   name and folder where known; `removed` where the roster of the epoch accepted leaves out this desk, which once held a key;
   `policy` where machine policy names this lead, which pins it again after any leave. */
/* The newest rev this desk has of `catalogId`, among the active catalog, recorded revs and the folder's catalogs. */
function deskEditionRev(catalogId, folder, leadPublic) {
  let maxRev = -1;
  if (leadPublic && catalogRevs[catalogId] && Number.isInteger(catalogRevs[catalogId][leadPublic])) {
    const slotRev = catalogRevs[catalogId][leadPublic];
    if (slotRev > maxRev) maxRev = slotRev;
  }
  if (catalogJson) {
    const doc = catalogDocIn(catalogJson);
    if (doc && doc.id === catalogId) {
      const r = editionRev(doc);
      if (r > maxRev) maxRev = r;
    }
  }
  if (folder && folderAnswers(folder)) {
    for (const f of ecFilesIn(folder)) {
      try {
        const facts = ecFacts(f, "");
        if (facts && facts.id === catalogId && facts.rev > maxRev) maxRev = facts.rev;
      } catch { /* skip */ }
    }
  }
  return maxRev;
}
/* The head of a folder team from its signed etiuda-head.json. Only a genuine head signed by the pinned lead under
   HEAD_PREFIX, and never an older rev than the desk has or an older t than one already seen. */
function folderHeadShown(team) {
  const pin = teamPins[team];
  if (!pin || !pin.public || typeof pin.public !== "string") return null;
  const folder = folderMirrorOf(team);
  if (!folder || !folderAnswers(folder)) return null;
  const file = path.join(folder, "etiuda-head.json");
  let text = "";
  try {
    if (fs.statSync(file).size > 65536) return null;
    text = fs.readFileSync(file, "utf8");
  } catch { return null; }
  let doc = null;
  try { doc = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { return null; }
  if (!doc || typeof doc !== "object" || !doc.sig || typeof doc.sig !== "object") return null;
  if (doc.v !== 1 || doc.team !== team) return null;
  if (!Number.isInteger(doc.epoch) || doc.epoch < 1 || !Number.isInteger(doc.rev) || doc.rev < 0 || !Number.isFinite(doc.t)) return null;
  const sig = doc.sig;
  if (sig.alg !== "Ed25519" || !/^[0-9a-f]{128}$/.test(String(sig.value || ""))) return null;
  let bytes;
  try { bytes = signedBytesOf(doc); } catch { return null; }
  let genuine = false;
  try {
    const pubKey = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(pin.public, "hex")]), format: "der", type: "spki" });
    genuine = crypto.verify(null, Buffer.concat([Buffer.from("etiuda-relay-head\n", "utf8"), bytes]), pubKey, Buffer.from(sig.value, "hex"));
  } catch { genuine = false; }
  if (!genuine) return null; /* plant:folder-head-sig */
  /* Below the epoch of the team file this mirror holds: left out, as the relay leaves it out. */
  const held = teamTextChosen(folder).doc;
  if (held && teamWhole(held) && String(held.id) === team && Number.isInteger(held.epoch) && doc.epoch < held.epoch) return null; /* plant:folder-head-epoch */
  const RCh = RelayChannel();
  /* Dated past the allowance ahead of this clock: refused, not floored, and read again at the next look. */
  if (doc.t > Date.now() + RCh.HEAD_AHEAD_MS) return null; /* plant:folder-head-ahead */
  const view = headView(team, RCh.headEditions(doc.editions), doc.t, folder);
  if (!view) return null;
  if (Number.isFinite(teamHeadT[team]) && doc.t < teamHeadT[team]) return null;
  teamHeadT[team] = doc.t;
  return view;
}
/* A head's entries as the team row carries them: only catalogs the team's whole file lists, none below the rev this desk has
   seen of that catalog, each `newer` where its rev is above what the desk has loaded of it, never a file unread in the
   mirror. `edition` and `published` are the catalog in use's entry where kept, else the newest kept. */
function headView(team, editions, t, folder) {
  const pin = teamPins[team];
  if (!pin || !Array.isArray(editions) || !folder || !Number.isFinite(t)) return null;
  const doc = teamTextChosen(folder).doc;
  if (!doc || !teamWhole(doc) || String(doc.id) !== team || doc.lead.keyId !== pin.keyId || doc.lead.public !== pin.public
    || !Array.isArray(doc.catalogs)) return null;
  const listed = doc.catalogs.map(String), inUse = inUseCatalogId(), kept = [];
  for (const e of editions) {
    const ed = e && typeof e.edition === "string" ? e.edition : "", pub = e && typeof e.published === "string" ? e.published : "";
    if (!e || !Number.isInteger(e.rev) || ed.length < 1 || ed.length > 120 || pub.length < 1 || pub.length > 80 || /[\u0000-\u001f\u007f]/.test(ed + pub)) return null;
    let off = false;
    off = listed.indexOf(String(e.catalog)) < 0; /* plant:head-listed */
    if (off) continue;
    const seen = deskEditionRev(e.catalog, folder, pin.public);
    if (seen >= 0 && e.rev < seen) continue; /* plant:folder-head-older */
    kept.push({ catalog: String(e.catalog), rev: e.rev, edition: ed, published: pub, newer: e.rev > loadedRevOf(e.catalog, pin.public) });
  }
  if (!kept.length) return null;
  let pick = kept.filter(e => e.catalog === inUse)[0] || null;
  if (!pick) for (const e of kept) if (!pick || e.rev >= pick.rev) pick = e;
  return { t: t, editions: kept, edition: pick.edition, published: pick.published };
}
/* The highest rev this desk has loaded of `id` under the lead's key: what was handed to the page, and the catalog in use. */
function loadedRevOf(id, leadPublic) {
  let rev = -1;
  rev = catalogRevs[id] && Number.isInteger(catalogRevs[id][leadPublic]) ? catalogRevs[id][leadPublic] : -1; /* plant:head-loaded */
  const doc = catalogDocIn(loadedText || (typeof catalogJson === "string" ? catalogJson : ""));
  if (doc && doc.id === id) rev = Math.max(rev, editionRev(doc));
  return rev;
}
/* The head of the team this desk follows, for the team row: either from the relay mirror, or from the folder's
   etiuda-head.json. A missing, bad, forged, foreign-key or older head gets no field at all. */
function headShown(team) {
  if (teamChannel[team] && teamChannel[team].kind === "relay") {
    const here = relayHere();
    if (!here || here.team !== team || !relayChannel || !relayChannel.program || typeof relayChannel.program.headNews !== "function") return null;
    let n = null;
    try { n = relayChannel.program.headNews(Date.now()); } catch (e) { return null; }
    if (!n || n.shown !== true) return null;
    return headView(team, n.editions, n.time, relayMirrorOf(here.rt));
  }
  return folderHeadShown(team);
}
/* Where the relay team this desk follows stands past its grant, for the team row, as the channel judges it by the relay's
   clock; `seen` once the agent has dismissed this step's notice. Nothing for a team inside its grant or a folder team. */
function lapseShown(team) {
  const here = relayHere();
  if (!here || here.team !== team || !relayChannel || typeof relayChannel.lapse !== "function") return null;
  let v = null;
  try { v = relayChannel.lapse(); } catch (e) { return null; }
  if (!v) return null;
  return { step: v.step, until: v.until, readOnly: v.readOnly, swept: v.swept, seen: teamLapseSeen[team] === v.step + ":" + v.until };
}
/* This relay team's push socket is down while its asks are answered, so its updates come with the minute's ask. */
function askingShown(team) {
  const here = relayHere();
  if (!here || here.team !== team || !relayChannel || typeof relayChannel.pushDown !== "function") return false;
  try { return relayChannel.pushDown() === true; } catch { return false; }
}
/* The agent dismissed the notice of `step`: kept only while the team is still at that step, so a notice dismissed as the
   step moved on does not hide the next one. */
function lapseSeen(team, step) {
  team = String(team || "");
  const v = lapseShown(team);
  if (v && v.step === step && !v.seen) { teamLapseSeen[team] = v.step + ":" + v.until; persistDeskEnvelope(); } /* plant:lapse-seen */
  return joinView();
}
/* The lead's switch at this folder's team as the agent is to be shown it, `said` once shown (contentSaid), and the catalogs marked
   private: what the disclosure at joining, the notice of a changed switch and the private mark's control read. */
function contentView(read) {
  const doc = read === undefined ? folderTeamDoc() : read;
  const pin = doc ? teamPins[doc.id] : null;
  const team = pin && pin.keyId === doc.lead.keyId && pin.public === doc.lead.public ? String(doc.id) : "";
  const sw = team ? teamContentOf(doc) : null;
  /* `listed`: the team's catalogs, which the private mark is never offered on. */
  return { team: team, on: !!sw, by: sw ? sw.by : "", at: sw ? sw.at : "", said: contentApplies(team, team ? consentOf(doc) : ""),
    private: Array.from(catalogPrivate).sort(), listed: team && Array.isArray(doc.catalogs) ? doc.catalogs.map(String) : [] };
}
/* The agent was shown the switch confirmed at `at`: kept only where it is this team's switch now, so no page says a later one. */
function contentSaid(team, at) {
  const doc = folderTeamDoc(), v = contentView(doc);
  /* One read: the consent kept is that of the very file whose switch was checked. */
  if (v.team && v.team === String(team || "") && v.on && v.at === String(at || "")) { teamContentSaid[v.team] = consentOf(doc); persistDeskEnvelope(); } /* plant:s0b-said */
  /* An ask already waiting is answered now, not at the next change of the folder. */
  tryCatalogAsk(theWindow); /* plant:s0b-said-ask */
  return contentView();
}
/* The agent marks a catalog private by its id, or takes the mark off. */
function markPrivate(id, on) {
  id = String(id || "");
  /* A catalog the team lists takes no mark: the request is ignored. */
  if (CATALOG_ID_RE.test(id) && !(on && idListedHere(id))) { /* plant:s0b-mark-listed */
    if (on) catalogPrivate.add(id);
    else catalogPrivate.delete(id);
    persistDeskEnvelope();
    /* An answer whose catalog this desk did not record goes too, since it cannot be told apart. */
    if (on && !answerKept) removeAnswer();
    tryCatalogAsk(theWindow);
  }
  return contentView();
}
/* The fork of the team's lead key this desk saw last: the relay channel's for the relay team it follows, else the one kept here. */
function forkLast(team) {
  const here = relayHere();
  if (!here || here.team !== team) return teamForks[team] ? teamForks[team].last : null;
  let f = null;
  try { f = relayChannel && typeof relayChannel.fork === "function" ? relayChannel.fork() : null; } catch { f = null; }
  return f && (f.kind === "later" || f.kind === "two") && Array.isArray(f.to) ? { kind: f.kind, key: forkKeyOf(f.kind, f.from, f.to) } : null;
}
/* That fork for the team's notice. `key` is the fork's own, and `seen` once the agent has dismissed
   this fork, so dismissing one does not hide a later fork of the same team and kind. */
function forkShown(team) {
  const f = forkLast(team);
  return f ? { kind: f.kind, key: f.key, seen: !!teamForks[team] && teamForks[team].seen === f.key } : null;
}
/* Whether the relay team this desk follows has left it behind (the channel's judgeBehind), `seen` once the agent has
   dismissed its notice; the channel keeps both. */
function strandedShown(team) {
  const here = relayHere();
  if (!here || here.team !== team || !relayChannel || typeof relayChannel.stranded !== "function") return null;
  let s = null;
  try { s = relayChannel.stranded(); } catch { s = null; }
  return s ? { seen: s.seen === true } : null;
}
function strandedDismissed(team) {
  const here = relayHere();
  if (here && here.team === String(team || "") && relayChannel && typeof relayChannel.strandedSeen === "function") relayChannel.strandedSeen();
  return joinView();
}
/* The agent dismissed the fork notice of `team`: kept for the fork it showed, so a new fork shows again. */
function forkDismissed(team) {
  team = String(team || "");
  if (deskKeys === undefined) deskKeys = readDesk();
  const f = SEALED_TEAM_RE.test(team) ? forkLast(team) : null;
  if (f) {
    teamForks[team] = Object.assign({ said: [], last: null }, teamForks[team], { seen: f.key }); /* plant:fork-seen */
    persistDeskEnvelope();
  }
  return joinView();
}
/* The mirror this team's row is read from: the relay mirror while this desk follows that team, otherwise the folder mirror. */
function teamStateMirror(team) {
  if (teamChannel[team] && teamChannel[team].kind === "relay") {
    const here = relayHere();
    if (!here || here.team !== team) return "";
    return relayMirrorOf(here.rt);
  }
  return folderMirrorOf(team);
}
/* True while the team's file lists a catalog the mirror holds no edition of. An edition is a catalog file there,
   signed so this desk accepts it. The head's announcement is not one: the file is. An empty list, or a team file
   that is not whole under the pinned lead, says nothing. */
function awaitsFirstEdition(team) {
  const pin = teamPins[team];
  if (!pin) return false;
  const root = teamStateMirror(team);
  if (!root || !folderAnswers(root)) return false;
  const doc = teamTextChosen(root).doc;
  if (!doc || !teamWhole(doc) || String(doc.id) !== team || !doc.lead
    || doc.lead.keyId !== pin.keyId || doc.lead.public !== pin.public
    || !Array.isArray(doc.catalogs) || !doc.catalogs.length) return false;
  const have = new Set();
  for (const f of ecFilesIn(root)) {
    let facts = null;
    try { facts = ecFacts(f, ""); } catch { facts = null; }
    if (facts && facts.id && Number.isFinite(+facts.rev) && +facts.rev >= 0 && facts.genuine) have.add(String(facts.id));
  }
  return doc.catalogs.some(id => !have.has(String(id)));
}
function leadsView() {
  const teams = Object.keys(teamPins).filter(t => SEALED_TEAM_RE.test(t) && !!teamPins[t] && typeof teamPins[t].public === "string");
  const me = deskBranch ? branchIdOf(deskBranch.sign.pub) : "", named = teams.length ? readJoinPolicy("en").lead : "";
  const ftHere = folderTeamHere();
  const reading = ftHere && folderStillReading() ? shellWords().stillReading : "";
  return teams.map(t => {
    const shown = teamShown[t] || {}, admitted = newestEpoch(t) > 0, roster = teamRoster[t];
    const relayRemoved = teamRelayGone[t] === true;
    let relayHost = shown.relay || "";
    if (!relayHost && teamChannel[t] && teamChannel[t].kind === "relay" && teamChannel[t].url) {
      try { relayHost = new URL(teamChannel[t].url).host; } catch { relayHost = ""; }
    }
    const row = { team: t, print: leadPrint(teamPins[t].public), admitted: admitted, seen: teamSeen.has(t),
      lead: shown.lead || "", folder: shown.folder || "",
      removed: (admitted && !!me && !!roster && roster.desks.indexOf(me) < 0) || relayRemoved,
      policy: !!named && named === teamPins[t].public };
    if (relayHost) row.relay = relayHost; /* plant:settings-relay-row */
    if (relayRemoved) row.relayRemoved = true;
    const head = headShown(t);
    if (head) row.head = head;
    const lapse = lapseShown(t);
    if (lapse) row.lapse = lapse;
    if (askingShown(t)) row.asking = true; /* plant:asking-row */
    const fork = forkShown(t);
    if (fork) row.fork = fork; /* plant:fork-row */
    const stranded = strandedShown(t);
    if (stranded) row.stranded = stranded; /* plant:stranded-row */
    if (teamNeedsFolder[t]) {
      row.needsFolder = true;
      row.openFolder = shellWords().openFolder;
      row.meetsInFolder = shellWords().teamMeetsInFolder;
    }
    /* The same sentence the log says, on this team's row, until the listing lands. The page prints it. */
    if (reading && ftHere && t === ftHere.team) row.reading = reading; /* plant:still-reading-shown */
    if (admitted && !row.removed && awaitsFirstEdition(t)) row.awaitsEdition = true;
    return row;
  });
}
/* A lead's name as an invitation carries it, as inviteRead takes one: text, at most 120 characters, nothing hidden. */
function shownName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 120 && !/[\u0000-\u001f\u007f]/.test(name) && !INVITE_HIDDEN_RE.test(name);
}
function leadSeen(team) {
  team = String(team || "");
  if (teamPins[team] && !teamSeen.has(team)) { teamSeen.add(team); persistDeskEnvelope(); }
  /* "It matches": what a left-behind desk held from the new lead's invitation on goes up now. */
  if (teamPins[team] && teamHeldOut.delete(team)) { persistDeskEnvelope(); relaySoon(); }
  return joinView();
}
/* Forgetting a lead takes its pin and every key kept under it, and bars a first admission for its team until a request the
   agent makes is answered: the file that pinned it is likely still on the share. The file this desk opened from outside
   the folder is let go with the lead: the shell stops holding it, and this call does not hand the page another catalog.
   `left` is Leave this team, which is the same act, remembered as a leave so a later invitation's refusal says so. */
/* The mirror's team file, set aside on leaving a relay team, so a later invitation does not read the old wrap. */
function setRelayTeamAside(rt) {
  if (!/^[0-9a-f]{32}$/.test(String(rt))) return;
  const file = path.join(relayMirrorOf(rt), TEAM_NAME);
  const aside = file + ".aside";
  try { fs.unlinkSync(aside); } catch (e) { if (e.code !== "ENOENT") throw e; }
  try { renamePatiently(file, aside); } catch (e) { if (e.code !== "ENOENT") throw e; }
}
function forgetLead(team, left) {
  team = String(team || "");
  if (deskKeys === undefined) deskKeys = readDesk();
  if (!SEALED_TEAM_RE.test(team) || !teamPins[team]) return joinView();
  const ch = teamChannel[team];
  if (ch && ch.kind === "relay") setRelayTeamAside(ch.rt); /* plant:leave-aside */
  /* The note this desk left in a folder team's mirror goes too, owed to that share, so a later return does not send it. */
  const noteInMirror = deskBranch ? path.join(folderMirrorOf(team), "desks", branchIdOf(deskBranch.sign.pub), IN_USE_STEM + ".ec") : "";
  delete teamPins[team];
  delete teamKeys[team];
  delete teamShown[team];
  delete teamChannel[team];
  delete teamPinFrom[team];
  delete teamNeedsFolder[team];
  teamRingAt = null;
  teamSeen.delete(team);
  delete teamLapseSeen[team];
  delete teamContentSaid[team];
  delete teamPauseSeen[team];
  delete teamRelayGone[team];
  delete teamWas[team];
  delete teamForks[team];
  delete teamHeadT[team];
  relayCatalogNamed.delete(team);
  if (relayCatalogOwed === team) relayCatalogOwed = "";
  teamBarred.add(team);
  teamHeldOut.delete(team);
  if (left === true) teamLeft[team] = new Date().toISOString(); else delete teamLeft[team]; /* plant:leave-remembers */
  // A request already withdrawn waits nowhere, so it goes with the keys; a waiting relay request is withdrawn.
  if (teamJoin && teamJoin.team === team) {
    if (teamJoin.invite && teamJoin.invite.relay) {
      delete teamJoin.invite.relay.wrap;
      if (teamJoin.invite.relay.withdrawn === true) teamJoin = null;
      else if (inviteAccepted(teamJoin)) withdrawJoin(teamJoin); /* plant:forget-withdraw */
      else {
        if (deskBranch) { try { unlinkOwn(joinFile()); } catch { /* gone */ } }
        teamJoin = null;
      }
    } else {
      if (deskBranch) { try { unlinkOwn(joinFile()); } catch { /* gone */ } }
      teamJoin = null;
    }
  }
  for (const [pin, t] of Array.from(editionTeam)) if (t === team) editionTeam.delete(pin);
  for (const [pin, held] of Array.from(editionTeams)) {
    held.delete(team);
    if (held.size === 0) editionTeams.delete(pin);
  }
  ecFactsRead.clear();
  teamStamp = "";
  persistDeskEnvelope();
  releaseInUse();
  if (noteInMirror) { try { unlinkOwn(noteInMirror); } catch { /* never written there */ } }
  releaseOpened();
  relaySoon();
  catalogFolderChanged();
  console.error("etiuda: the lead of team " + team + " is forgotten, with the keys this desk kept for it");
  return joinView();
}

/* ---- the relay: the team folder as a mirror the channel layer keeps (board 900, relay slice 1, step 4) -----------------
   The desk follows a relay address only for a team whose lead was pinned by an invitation, machine policy or an answered
   request (board 907): a ring and a wrapped key both travel in a file anybody who can write the share may sign, so a first
   pin by a file's own vouching is no wider than today's folder ring. Its relay address is followed only when the lead-signed
   roster names this desk, no machine policy names a folder, and the address is the built-in relay (board 945 stage 3 (a), which
   widens 907 knowingly: whoever planted that first team file can move such a desk to a built-in relay team they lead). A folder
   named by machine policy wins over any relay, and the desk says so. */
const BUILTIN_RELAY_URL = "https://etiuda.dev/relay/v1";
function isBuiltinRelayUrl(u) {
  if (typeof u !== "string") return false;
  return u.trim().replace(/\/+$/, "") === BUILTIN_RELAY_URL; /* plant:follow-builtin-url */
}

const PIN_FROM = ["invite", "policy", "answer"];
function relayFollowed(team) {
  const pin = teamPins[team];
  if (!pin) return false;
  if (PIN_FROM.indexOf(teamPinFrom[team]) >= 0) return true; /* plant:907-from */
  const policy = sayJoinPolicy().lead;
  if (policy && policy === pin.public) return true;
  /* A desk that pinned its lead from the folder itself follows the team to the relay only when the lead-signed roster names
     it, no machine policy names a folder, and the address is the built-in relay (board 945 stage 3 (a)). */
  if (sayJoinPolicy().folder) return false;
  const ch = teamChannel[team];
  if (!ch || ch.kind !== "relay" || !isBuiltinRelayUrl(ch.url)) return false;
  const me = deskBranch ? branchIdOf(deskBranch.sign.pub) : "";
  const roster = teamRoster[team];
  if (me && roster && Array.isArray(roster.desks) && roster.desks.indexOf(me) >= 0) return true; /* plant:follow-roster */
  return false;
}
/* The relay team this desk works through, or null: a join waiting on a relay invitation, else the one pinned team whose
   heeded file names the relay and whose pin the rule above lets it follow. */
function relayHere() {
  const j = teamJoin, inv = j && j.invite && j.invite.relay;
  if (inv && (teamPins[j.team] || inv.withdrawing === true) && (teamPinFrom[j.team] === "invite" || inv.withdrawing === true) && inv.end !== "removed" && teamRelayGone[j.team] !== true)
    return { team: j.team, rt: inv.rt, url: inv.url, joining: true };
  const teams = Object.keys(teamChannel).filter(t => relayFollowed(t) && teamRelayGone[t] !== true).sort();
  if (!teams.length) return null;
  return { team: teams[0], rt: teamChannel[teams[0]].rt, url: teamChannel[teams[0]].url, joining: false };
}
/* A team this desk would follow, which the relay has refused. relayHere stays null until a fresh hello on it succeeds. */
function relayFlagged() {
  const j = teamJoin, inv = j && j.invite && j.invite.relay;
  if (inv && (teamPins[j.team] || inv.withdrawing === true) && (teamPinFrom[j.team] === "invite" || inv.withdrawing === true) && inv.end !== "removed" && teamRelayGone[j.team] === true)
    return { team: j.team, rt: inv.rt, url: inv.url, joining: true };
  const teams = Object.keys(teamChannel).filter(t => relayFollowed(t) && teamRelayGone[t] === true).sort();
  if (!teams.length) return null;
  return { team: teams[0], rt: teamChannel[teams[0]].rt, url: teamChannel[teams[0]].url, joining: false };
}
function relayMirrorOf(rt) { return path.join(app.getPath("userData"), "relay", rt); }

function stopRelayChannel(teamId) {
  delete teamChannel[teamId];
  if (relayChannel) {
    const old = relayChannel;
    relayChannel = null;
    relayAt = "";
    old.stop().catch(() => {});
  }
  persistDeskEnvelope();
}

function copyDeskFilesToFolder(mirrorDir, targetFolder) {
  const me = deskBranch ? branchIdOf(deskBranch.sign.pub) : "";
  if (!me || !mirrorDir) return;
  const srcDir = path.join(mirrorDir, "desks", me);
  const dstDir = path.join(targetFolder, "desks", me);
  try {
    if (fs.existsSync(srcDir)) {
      fs.mkdirSync(dstDir, { recursive: true });
      for (const f of fs.readdirSync(srcDir)) {
        if (/\.ec$/i.test(f)) {
          fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
        }
      }
    }
  } catch (e) {
    console.error("etiuda: failed to copy desk files to folder - " + e.message);
  }
}

function checkMatchingFolder(dir, teamId, leadPub, minRev) {
  if (!dir || typeof dir !== "string") {
    return { ok: false, error: "wrong-team", said: shellWords().folderRefusedWrongTeam };
  }
  const file = path.join(dir, TEAM_NAME);
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { ok: false, error: "wrong-team", said: shellWords().folderRefusedWrongTeam };
  }
  let doc = null;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, error: "wrong-team", said: shellWords().folderRefusedWrongTeam };
  }
  if (!doc || typeof doc !== "object" || !teamWhole(doc)) {
    return { ok: false, error: "wrong-team", said: shellWords().folderRefusedWrongTeam };
  }
  if (doc.id !== teamId) {
    return { ok: false, error: "wrong-team", said: shellWords().folderRefusedWrongTeam };
  }
  if (!doc.lead || doc.lead.public !== leadPub) {
    return { ok: false, error: "wrong-lead", said: shellWords().folderRefusedWrongLead };
  }
  const rev = teamRevOf(doc);
  if (typeof minRev === "number" && (rev === null || rev < minRev)) {
    return { ok: false, error: "lower-rev", said: shellWords().folderRefusedLowerRev };
  }
  return { ok: true, doc };
}

function findMatchingFolderInKnownRoots(teamId, leadPub, minRev, currentRoot, doc) {
  const candidates = new Set();
  if (deskKeys && typeof deskKeys[CATALOG_FOLDER_KEY] === "string" && deskKeys[CATALOG_FOLDER_KEY].trim()) {
    candidates.add(deskKeys[CATALOG_FOLDER_KEY].trim());
  }
  const policyFolder = sayJoinPolicy().folder;
  if (policyFolder) candidates.add(policyFolder);
  if (teamJoin) {
    if (teamJoin.invite && typeof teamJoin.invite.folder === "string") candidates.add(teamJoin.invite.folder);
    if (typeof teamJoin.was === "string") candidates.add(teamJoin.was);
    if (typeof teamJoin.folder === "string") candidates.add(teamJoin.folder);
  }
  if (doc) {
    if (typeof doc.folder === "string" && doc.folder) candidates.add(doc.folder);
    if (doc.place) {
      let roots = [];
      try { roots = syncRootsFrom(readSyncRecords(null)); } catch { roots = []; }
      try {
        const res = placeResolve(doc.folder || "", doc.place, roots, d => folderAnswers(d));
        if (res && res.path) candidates.add(res.path);
      } catch {}
      try {
        const pCands = placeCandidates(doc.folder || "", doc.place, roots);
        for (const c of pCands) if (c) candidates.add(c);
      } catch {}
    }
  }
  for (const c of candidates) {
    if (!c || (currentRoot && path.resolve(c) === path.resolve(currentRoot))) continue;
    const match = checkMatchingFolder(c, teamId, leadPub, minRev);
    if (match.ok) return c;
  }
  return null;
}

function switchToFolderTeam(targetFolder, teamId, mirrorDir) {
  deskSetOwn(CATALOG_FOLDER_KEY, targetFolder);
  persistDeskEnvelope();
  copyDeskFilesToFolder(mirrorDir, targetFolder);
  tryHeldBranches();
  if (teamId) {
    delete teamNeedsFolder[teamId];
    teamShown[teamId] = Object.assign({}, teamShown[teamId], { folder: targetFolder });
    delete teamShown[teamId].relay;
  }
  folderSyncerRun(theWindow);
  catalogFolderChanged();
  sendJoin(theWindow);
  teamStamp = "";
  heedTeam();
}

function setTeamNeedsFolder(teamId, doc, mirrorDir) {
  const had = teamNeedsFolder[teamId];
  teamNeedsFolder[teamId] = {
    rev: doc.rev,
    lead: { keyId: doc.lead.keyId, public: doc.lead.public },
    mirror: mirrorDir,
  };
  if (!had) {
    teamSay(shellWords().teamMeetsInFolder);
  }
  sendJoin(theWindow);
}

function pickMovedFolder(teamId, pickedFolder) {
  const need = teamNeedsFolder[teamId];
  const pinned = teamPins[teamId];
  const minRev = need ? need.rev : 0;
  const leadPub = pinned ? pinned.public : (need && need.lead ? need.lead.public : "");
  const check = checkMatchingFolder(pickedFolder, teamId, leadPub, minRev);
  if (!check.ok) { teamSay(check.said); return { ok: false, error: check.error }; } /* plant:folder-picked-validate */
  switchToFolderTeam(pickedFolder, teamId, need ? need.mirror : ""); /* plant:folder-picked-match */
  return { ok: true };
}
function relayOpened(sealed) {
  try { return safeStorage.decryptString(Buffer.from(String(sealed), "base64")); } catch { return null; }
}
function teamKeyAt(team, epoch) {
  const sealed = (teamKeys[team] || {})[epoch];
  const text = sealed ? relayOpened(sealed) : null;
  const key = text ? Buffer.from(text, "base64") : null;
  return key && key.length === 32 ? key : null;
}
/* The relay's calls through Chromium's network stack where Electron has it, so the system's proxy and certificate store
   apply, else node's; an address that is not https is refused before anything is sent. */
async function relayRequest(method, url, headers, body) {
  if (!/^https:\/\//.test(String(url))) throw new Error("the relay is reached over https only");
  const init = { method: method, headers: headers, body: body || undefined, redirect: "error", cache: "no-store" };
  const res = await (net && typeof net.fetch === "function" ? net.fetch(url, init) : fetch(url, init));
  const bytes = Buffer.from(await res.arrayBuffer());
  return { status: res.status, header: n => res.headers.get(n), bytes: bytes };
}
/* The socket the relay announces new blobs on, with the session in its header; null where this runtime has none, and the
   layer then asks on a timer. `opens` says the layer is told when it opens, so a close before that reads as refused. */
function relayConnect(url, headers, on) {
  if (typeof WebSocket !== "function" || !/^wss:\/\//.test(String(url))) return null;
  const ws = new WebSocket(url, { headers: headers });
  ws.onopen = () => { if (typeof on.open === "function") on.open(); };
  ws.onmessage = e => on.message(typeof e.data === "string" ? e.data : Buffer.from(e.data).toString("utf8"));
  ws.onclose = () => on.close();
  ws.onerror = () => {};
  return { opens: true, send: t => { if (ws.readyState === 1) ws.send(t); }, close: () => { try { ws.close(); } catch { /* gone */ } } };
}
let relayChannel = null, relayAt = "", relayAtPin = "", relaySaidFor = new Set(), relayTimer = null, relayProbeTimer = null;
function relaySoon() {
  clearTimeout(relayTimer);
  relayTimer = setTimeout(() => { relayTimer = null; relayRun(); }, 0);
  if (relayTimer.unref) relayTimer.unref();
}
/* While the relay has refused this desk, ask again later, so a later enrolment is a fresh hello and not a new invitation: a
   minute first, twice as long after each probe up to an hour, and a minute again once a hello succeeds or the join changes. */
const RELAY_PROBE_FIRST = 60 * 1000, RELAY_PROBE_MOST = 60 * 60 * 1000;
let relayProbeMs = RELAY_PROBE_FIRST;
function relayProbeLater() {
  clearTimeout(relayProbeTimer);
  relayProbeTimer = setTimeout(relayProbe, relayProbeMs);
  if (relayProbeTimer.unref) relayProbeTimer.unref();
}
let relayProbing = false;
function relayProbe() {
  relayProbeTimer = null;
  relayProbeMs = Math.min(relayProbeMs * 2, RELAY_PROBE_MOST); /* plant:c1-backoff */
  relayProbing = true;
  let c = null;
  try { c = relayRun(); } finally { relayProbing = false; }
  if (relayFlagged()) relayProbeLater();
  return c;
}
/* The wait before the next probe, for the legs. */
function relayProbeNext() { return relayProbeMs; }
/* Starts, keeps or stops the channel layer to match relayHere, and says once for each team whose relay it will not follow. */
function relayRun() {
  if (deskKeys === undefined) deskKeys = readDesk();
  for (const t of Object.keys(teamChannel)) {
    if (!teamPins[t] || relayFollowed(t) || relaySaidFor.has(t)) continue;
    relaySaidFor.add(t);
    teamSay("team " + t + " names a relay at " + teamChannel[t].url + ", and its lead was pinned by no invitation, machine policy or"
      + " answered request, so this desk does not follow that address and keeps its folder");
  }
  const named = sayJoinPolicy().folder;
  const open = named ? null : relayHere();
  const flagged = !open && !named ? relayFlagged() : null; /* plant:h35-probe */
  const want = open || flagged;
  if (!want) { clearTimeout(relayProbeTimer); relayProbeTimer = null; }
  if (!flagged) relayProbeMs = RELAY_PROBE_FIRST;
  if (named && Object.keys(teamChannel).some(t => relayFollowed(t))) teamSay("machine policy names the team folder " + named
    + ", so this desk keeps that folder and not the relay its team file names");
  /* The lead this desk follows for a team, read when asked: the pin, or while joining the lead the invitation names. */
  const pinFor = w => {
    const j = teamJoin;
    return teamPins[w.team] || (w.joining && j && j.team === w.team && j.invite && j.invite.lead ? { keyId: j.invite.lead.keyId, public: j.invite.lead.public } : null);
  };
  const pin = want ? pinFor(want) : null;
  /* THE PIN IS NOT IN THE FINGERPRINT (board 931 (7) item 9): a channel that followed a genuine handover itself already judges by
     the new lead, so it is kept, not torn down mid-batch. Any other move of the pin, one the channel did not follow, rebuilds it. */
  const at = want && pin ? [want.team, want.rt, want.url].join("|") : "";
  const followed = relayChannel && relayChannel.program && typeof relayChannel.program.pinned === "function" ? relayChannel.program.pinned() : null;
  let samePin = false;
  samePin = !!pin && !!followed && !!followed.lead && followed.lead.public === pin.public; /* plant:ho9-keep-channel */
  /* Or the pin is the one the channel was built with: a desk that refused a handover its program followed (machine policy
     naming the old lead) keeps its channel, as before item 9, rather than rebuilding it at every run. */
  if (pin && pin.public === relayAtPin) samePin = true;
  if (at === relayAt && relayChannel && samePin) {
    /* A channel halted on a team the relay refused starts again only at the probe, so its pace is the backoff's. */
    let restart = true;
    restart = !!open || relayProbing; /* plant:n2-hush-wait */
    if (typeof relayChannel.online === "function" && relayChannel.online()) relayChannel.kick();
    else if (restart) relayChannel.start(); /* plant:h35-follow */
    return relayChannel;
  }
  if (relayChannel) { const old = relayChannel; relayChannel = null; old.stop().catch(() => {}); }
  relayAt = at;
  relayAtPin = pin ? pin.public : "";
  if (!at) return null;
  if (!deskBranch) {
    teamSay("this desk keeps no key of its own, so it cannot reach the relay of team " + want.team);
    relayAt = "";
    return null;
  }
  const team = want.team, mirror = relayMirrorOf(want.rt);
  try { fs.mkdirSync(mirror, { recursive: true }); }
  catch (e) { teamSay("the relay's mirror " + mirror + " could not be made - " + e.message); relayAt = ""; return null; }
  relayChannel = RelayChannel().createChannel({
    rt: want.rt, url: want.url, mirror: mirror, stateFile: mirror + ".json", write: writeReplacing,
    pin: () => { const now = pinFor(want) || pin; return { teamId: team, rt: want.rt, lead: { keyId: now.keyId, public: now.public } }; },
    me: () => {
      if (!deskBranch) return null;
      const id = branchIdOf(deskBranch.sign.pub);
      return { keyId: id, public: deskBranch.sign.pub, privateKey: openPrivate(deskBranch.sign.priv), place: "desk:" + id,
               box: deskBranch.box.pub };
    },
    /* The agreement of this desk's box with the lead's, for its own copy of the team file after an epoch move (F1); the
       private key stays here. */
    agree: peer => {
      const sk = deskBranch && /^[0-9a-f]{64}$/.test(String(peer)) ? openPrivate(deskBranch.box.priv) : null;
      if (!sk) return null;
      try { return crypto.diffieHellman({ privateKey: sk, publicKey: hpkeX25519Public(Buffer.from(peer, "hex")) }); } catch { return null; }
    },
    keyFor: e => teamKeyAt(team, e),
    sealEpoch: () => newestEpoch(team) || null,
    invite: () => {
      /* A join at the team's standing door knocks with this desk's certificate, not an invitation's token. */
      const door = signinDoorInvite(team, want.rt); /* plant:door-invite */
      if (door !== undefined) return door;
      const j = teamJoin, inv = j && j.team === team && j.invite && j.invite.relay;
      if (!inv || inv.rt !== want.rt) return null;
      const token = relayOpened(inv.token), seal = relayOpened(inv.seal);
      if (!token || !seal) return null;
      const out = { inv: inv.inv, token: token, seal: Buffer.from(seal, "base64") };
      const wrapText = inv.wrap ? relayOpened(inv.wrap) : null;
      const wrapKey = wrapText ? Buffer.from(wrapText, "base64") : null;
      if (wrapKey && wrapKey.length === 32) out.wrapKey = wrapKey;
      /* The lead's box the invitation named, so this desk finds its own copy of the team file before it holds one (F6). */
      if (/^[0-9a-f]{64}$/.test(String(inv.box))) out.box = inv.box; /* plant:f6-box-lent */
      return out;
    },
    /* The relay named this desk's request at the standing door: kept, and the request written with its seat and that id. */
    onDoor: id => { signinDoorKept(team, mirror, id); }, /* plant:door-on */
    onTeam: () => {
      const j = teamJoin;
      if (j && j.team === team && j.invite && j.invite.relay && (j.invite.relay.withdrawing === true || j.invite.relay.withdrawn === true)) return;
      teamStamp = "";
      heedTeam();
    },
    /* The team's lapse moved a step, so the page is told now. */
    onLapse: () => sendJoin(theWindow),
    /* The push socket went down while the asking works, or came back: the team's row says so. */
    onSocket: () => sendJoin(theWindow),
    /* The team's lead key was seen in two hands, so the page is told now. */
    onFork: () => sendJoin(theWindow),
    /* This desk was left behind by a handover and the key change after it, so the page is told now. */
    onStranded: () => sendJoin(theWindow),
    /* This desk was left behind and took the new lead's invitation: its files wait for "It matches". */
    holdOut: () => teamHeldOut.has(team),
    /* The relay refused this invitation's token, as spent or past its end. Kept with the request, and the page told now. */
    onInviteEnd: kind => {
      const j = teamJoin, inv = j && j.team === team && j.invite && j.invite.relay;
      if ((kind !== "used" && kind !== "ended" && kind !== "removed") || !inv || inv.end === kind) return;
      inv.end = kind;
      persistDeskEnvelope();
      sendJoin(theWindow);
    },
    /* A fresh hello succeeded. If this desk had stopped after a removal, it follows again: the relay has the key. */
    onHere: () => {
      if (teamRelayGone[team] !== true) return;
      delete teamRelayGone[team]; /* plant:h35-return */
      clearTimeout(relayProbeTimer);
      relayProbeTimer = null;
      relayProbeMs = RELAY_PROBE_FIRST;
      persistDeskEnvelope();
      sendJoin(theWindow);
      relaySoon();
    },
    /* The relay refused this desk as no longer on the team. Remember it, tell the page, and stop following that relay.
       A second refusal while that is already remembered does not ask again at once. The minute's probe does. */
    onRemoved: () => {
      if (!SEALED_TEAM_RE.test(String(team))) return;
      if (teamRelayGone[team] === true) { relayProbeLater(); return; } /* plant:h35-once */
      teamRelayGone[team] = true; /* plant:h35-gone */
      persistDeskEnvelope();
      sendJoin(theWindow);
      relaySoon();
      relayProbeLater();
    },
    /* The relay has taken the withdrawal, or holds no request of this invitation to take back: the join says withdrawn now. */
    onWithdrawn: () => {
      const j = teamJoin, inv = j && j.team === team && j.invite && j.invite.relay;
      if (!inv || inv.withdrawing !== true) return;
      if (refusedWithdrawEnds(j)) return;
      delete inv.withdrawing;
      delete inv.readonly;
      inv.withdrawn = true; /* plant:g2-taken */
      persistDeskEnvelope();
      sendJoin(theWindow);
    },
    /* The relay refused the withdrawal for good. The request is no longer on its way out, and Ask again is not offered.
       A refused request ends here too, the same as when the relay takes the withdrawal. */
    onWithdrawUnkept: () => {
      const j = teamJoin, inv = j && j.team === team && j.invite && j.invite.relay;
      if (!inv || inv.withdrawing !== true) return;
      if (refusedWithdrawEnds(j)) return;
      delete inv.withdrawing;
      delete inv.readonly;
      inv.unkept = true; /* plant:c5-unkept-desk */
      persistDeskEnvelope();
      sendJoin(theWindow);
    },
    /* The relay is read-only, so the withdrawal stays owed and goes once the relay will take a write. */
    onWithdrawHeld: () => {
      const j = teamJoin, inv = j && j.team === team && j.invite && j.invite.relay;
      if (!inv || inv.withdrawing !== true || inv.readonly === true) return;
      inv.readonly = true; /* plant:c5-held-desk */
      persistDeskEnvelope();
      sendJoin(theWindow);
    },
    /* The invitation's one upload has gone, so its wrap is not asked for again and the key that opens it is forgotten. */
    onWrapGone: () => {
      const j = teamJoin, inv = j && j.team === team && j.invite && j.invite.relay;
      if (!inv || !inv.wrap) return;
      delete inv.wrap;
      persistDeskEnvelope();
    },
    /* The lead's answer to this request. Refused is said on the request. Joined is said once, and the request stays
       until the roster names this desk, which is still what lets it go. */
    onAnswer: answer => {
      const j = teamJoin;
      if (!j || j.team !== team || !j.invite || !j.invite.relay || j.invite.relay.withdrawn === true || j.invite.relay.withdrawing === true) return;
      if (answer === "refused") {
        if (!j.refused) { j.refused = true; persistDeskEnvelope(); }
        return;
      }
      if (answer === "joined" && !joinTold) {
        joinTold = true;
        joinDone = { team: j.team, file: joinedFile(j) };
      }
    },
    /* The team key from the invitation's wrap, kept as a roster wrap is kept, and the wrap key forgotten. Not admission. The
       epoch is marked in the join as the invitation's (`wrapped`) unless the desk held a key at it before, so that Cancel
       before admission forgets what the wrap gave and keeps what the desk had. */
    onTeamKey: (epoch, key) => {
      const j = teamJoin;
      if (j && j.team === team && j.invite && j.invite.relay && (j.invite.relay.withdrawing === true || j.invite.relay.withdrawn === true)) return; /* plant:withdraw-arrivals */
      if (!Number.isInteger(epoch) || epoch < 1 || !Buffer.isBuffer(key) || key.length !== 32) return;
      try {
        if (!branchSealable()) throw new Error("safeStorage is not available");
        const kept = teamKeys[team] || {}, had = !!kept[epoch];
        kept[epoch] = safeStorage.encryptString(key.toString("base64")).toString("base64");
        teamKeys[team] = kept;
        const j = teamJoin;
        if (j && j.team === team && j.invite && j.invite.relay) delete j.invite.relay.wrap;
        if (j && j.team === team && j.invite && j.invite.relay && !had) j.invite.relay.wrapped = (j.invite.relay.wrapped || []).concat(epoch); /* plant:e4-mark */
        ecFactsRead.clear();
        teamStamp = "";
        persistDeskEnvelope();
        heedTeam();
      } catch (e) { teamSay("the team key for " + team + " could not be kept - " + e.message); }
    },
    request: relayRequest, connect: relayConnect,
    say: line => teamSay("relay of team " + team + ": " + line),
  });
  relayChannel.start();
  return relayChannel;
}

/* ---- the desk's own history of the catalogs it reads and writes --------------------------------------------------
   One gzip per content, named by its SHA-256, and an index of where and when each was seen, beside desk.json: nobody
   else's desk reads this folder. A version stays 30 days after it was last seen and the newest of each file whatever its
   age; past the cap the longest unseen go first. A sealed file is kept as sealed. */
const HISTORY_KIND = "etiuda-catalog-history", HISTORY_INDEX = "index.json";
const HISTORY_DAY_MS = 24 * 60 * 60 * 1000, HISTORY_DAYS = 30, HISTORY_CAP = 100 * 1024 * 1024;
// A version seen again within this long is not written down again.
const HISTORY_SEEN_MS = 60 * 60 * 1000;
const HISTORY_SHA_RE = /^[0-9a-f]{64}$/;
let historyIndex = null, historySwept = false;
function historyDir() { return path.join(app.getPath("userData"), "catalog-history"); }
function historyBlob(sha) { return path.join(historyDir(), sha + ".gz"); }
function sha256Hex(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
/* What a version says about itself, read once as it is kept; -1 cards for bytes that are not a catalog. `signed` is
   "lead" or "desk" for a signature of either, and any sealed file counts as signed. */
function historyFacts(text) {
  const out = { id: "", rev: 0, date: "", cards: -1, macros: -1, intents: -1, cats: -1, signed: "", sealed: "" };
  try {
    let data = catalogPayload(text).data;
    if (data && data.kind === SEALED_KIND) {
      out.sealed = String(data.team || "-");
      const inner = teamOpen(data);
      out.signed = "lead";
      data = inner === null ? null : catalogPayload(inner).data;
    }
    if (!isV2(data)) return out;
    const n = ecCounts(data), sig = data.sig;
    out.id = data.id != null ? String(data.id) : "";
    out.rev = +data.rev || 0;
    out.date = data.date != null ? String(data.date) : "";
    out.cards = Array.isArray(data.cards) ? data.cards.length : 0;
    out.macros = n.macros; out.intents = n.intents; out.cats = n.cats;
    if (sig && typeof sig === "object" && sig.value) out.signed = data.desk ? "desk" : "lead";
  } catch { /* not a catalog */ }
  return out;
}
function historyEntryOk(v) {
  return !!v && typeof v === "object" && HISTORY_SHA_RE.test(String(v.sha)) && typeof v.path === "string"
    && Number.isFinite(v.first) && Number.isFinite(v.last);
}
/* The text a kept version holds, and a blob that does not match its own name throws. */
function historyText(sha) {
  const buf = zlib.gunzipSync(fs.readFileSync(historyBlob(sha)));
  if (sha256Hex(buf) !== sha) throw new Error("the kept copy does not match its name");
  return buf.toString("utf8");
}
/* An index that will not read is made again from the blobs, which then belong to no file: nothing kept is lost to it.
   Each is last seen at the rebuild, not at its copy's time, or the next save prunes every copy older than the days. */
function historyRebuilt() {
  let names = [];
  try { names = fs.readdirSync(historyDir()); } catch { return []; }
  const out = [];
  for (const n of names) {
    const m = /^([0-9a-f]{64})\.gz$/.exec(n);
    if (!m) continue;
    try {
      const text = historyText(m[1]), st = fs.statSync(historyBlob(m[1])), at = Math.round(st.mtimeMs);
      out.push(Object.assign({ sha: m[1], path: "", size: Buffer.byteLength(text, "utf8"), gz: st.size, first: at, last: Date.now(),
        wrote: false }, historyFacts(text)));
    } catch { /* a blob that does not open is left where it is */ }
  }
  if (out.length) console.error("etiuda: the catalog history's index did not read, so it was made again from " + out.length + " kept copies");
  return out;
}
function historyRead() {
  if (historyIndex) return historyIndex;
  let doc = null;
  try { doc = JSON.parse(fs.readFileSync(path.join(historyDir(), HISTORY_INDEX), "utf8")); } catch { doc = null; }
  historyIndex = { versions: doc && doc.kind === HISTORY_KIND && Array.isArray(doc.versions)
    ? doc.versions.filter(historyEntryOk) : historyRebuilt() };
  return historyIndex;
}
/* Pure: which versions stay, by the rule at the head of this section. The cap counts each content once. */
function historyKept(versions, now, days, cap) {
  const newest = new Map();
  versions.forEach(v => {
    const n = newest.get(v.path);
    if (!n || v.last > n.last || (v.last === n.last && v.first > n.first)) newest.set(v.path, v);
  });
  const pinned = v => newest.get(v.path) === v;
  let kept = versions.filter(v => pinned(v) || now - v.last <= days * HISTORY_DAY_MS);
  const weight = list => {
    const each = new Map();
    list.forEach(v => each.set(v.sha, +v.gz || +v.size || 0));
    let sum = 0;
    each.forEach(n => { sum += n; });
    return sum;
  };
  const spare = kept.filter(v => !pinned(v)).sort((a, b) => a.last - b.last || a.first - b.first);
  while (spare.length && weight(kept) > cap) {
    const v = spare.shift();
    kept = kept.filter(x => x !== v);
  }
  return kept;
}
/* The index is written before any blob goes, so an index never names a copy that is not there. */
function historySave(idx, now) {
  const kept = historyKept(idx.versions, now, HISTORY_DAYS, HISTORY_CAP);
  const dropped = kept.length !== idx.versions.length;
  idx.versions = kept;
  fs.mkdirSync(historyDir(), { recursive: true });
  writeReplacing(path.join(historyDir(), HISTORY_INDEX), JSON.stringify({ format: 1, kind: HISTORY_KIND, versions: kept }));
  if (historySwept && !dropped) return;
  historySwept = true;
  const live = new Set(kept.map(v => v.sha));
  let names = [];
  try { names = fs.readdirSync(historyDir()); } catch { return; }
  names.forEach(n => {
    const m = /^([0-9a-f]{64})\.gz$/.exec(n);
    if (m && !live.has(m[1])) { try { fs.unlinkSync(historyBlob(m[1])); } catch { /* held open; the next sweep */ } }
  });
}
/* Keeps these bytes as a version of `file`, and answers its entry, or null where nothing was kept. A file Etiuda ships,
   or the sample as given, is not kept: the installation holds it. */
function historyShipped(buf, sha) { return SAMPLE_EDITIONS.some(x => x[0] === buf.length && x[1] === sha); }
function historyKeep(file, text, wrote) {
  try {
    const at = file ? path.resolve(String(file)) : "";
    if (!at || isBuiltIn(at) || typeof text !== "string" || !text) return null;
    const buf = Buffer.from(text, "utf8"), sha = sha256Hex(buf);
    if (buf.length > BRANCH_TEXT_MAX || historyShipped(buf, sha)) return null;
    const now = Date.now(), idx = historyRead();
    let e = idx.versions.find(v => v.sha === sha && v.path === at);
    if (e) {
      if ((e.wrote || !wrote) && now - e.last < HISTORY_SEEN_MS) return e;
      e.wrote = e.wrote || !!wrote;
      e.last = Math.max(e.last, now);
    } else {
      // The version this one replaces was there until now, as far as this desk knows.
      const was = idx.versions.filter(v => v.path === at).sort((a, b) => b.last - a.last)[0];
      if (was && was.last < now) was.last = now - 1;
      fs.mkdirSync(historyDir(), { recursive: true });
      if (!fs.existsSync(historyBlob(sha))) writeReplacing(historyBlob(sha), zlib.gzipSync(buf));
      e = Object.assign({ sha: sha, path: at, size: buf.length, gz: fs.statSync(historyBlob(sha)).size, first: now, last: now,
        wrote: !!wrote }, historyFacts(text));
      idx.versions.push(e);
    }
    historySave(idx, now);
    return e;
  } catch (err) {
    console.error("etiuda: an earlier version of " + file + " could not be kept - " + err.message);
    return null;
  }
}
/* A read keeps its version after the read has answered, so no route waits on a copy being made. */
function historySoon(file, text) { setImmediate(() => historyKeep(file, text, false)); }
/* Keeps what a file holds now, before it is replaced: {entry} for bytes kept, {none: true} where there is nothing a
   history would keep there, and null where it could not be kept. */
function historyKeepFile(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); }
  catch (e) { return e.code === "ENOENT" ? { none: true } : null; }
  const buf = Buffer.from(text, "utf8");
  if (!text || historyShipped(buf, sha256Hex(buf))) return { none: true };
  const entry = historyKeep(file, text, false);
  return entry ? { entry: entry } : null;
}
function historyFind(sha, file) {
  return historyRead().versions.find(v => v.sha === String(sha || "") && v.path === String(file || "")) || null;
}
/* What may be put back, and what may be put back over: a catalog with no signature and no seal. The desk never writes a
   catalog somebody signed, nor writes over one. */
function historyFree(v) { return !!v && !v.signed && !v.sealed && v.cards >= 0; }
/* Every version, for the page: where it sits (the catalog folder, this desk's own folder, or elsewhere), whether the file
   there holds it now, and whether it may be put back there. */
function historyView() {
  // Resolved as the history resolves each file it keeps, so a folder setting with another spelling still matches.
  const root = path.resolve(catalogFolder()), up = folderAnswers(catalogFolder());
  const own = deskBranch ? path.join(root, "desks", branchIdOf(deskBranch.sign.pub)) : "";
  const now = new Map();
  const there = file => {
    if (!now.has(file)) {
      let got = null;
      try { const text = fs.readFileSync(file, "utf8"); got = { sha: sha256Hex(Buffer.from(text, "utf8")), free: historyFree(historyFacts(text)) }; }
      catch (e) { got = e.code === "ENOENT" ? { sha: "", free: true } : null; }
      now.set(file, got);
    }
    return now.get(file);
  };
  return historyRead().versions.map(v => {
    const dir = v.path ? path.dirname(v.path) : "";
    const place = !v.path ? "" : dir === root ? "folder" : own && dir === own ? "own" : "other";
    const held = (place === "folder" || place === "own") && up ? there(v.path) : null;
    const current = !!held && held.sha === v.sha;
    return { sha: v.sha, path: v.path, name: v.path ? path.basename(v.path) : "", dir: dir, place: place, first: v.first, last: v.last,
      wrote: !!v.wrote, id: v.id || "", rev: +v.rev || 0, date: v.date || "", cards: +v.cards, macros: +v.macros, intents: +v.intents,
      cats: +v.cats, signed: !!v.signed, sealed: !!v.sealed, current: current,
      put: place === "folder" && !relayHere() && !current && !!held && held.free && historyFree(v) && /\.ec$/i.test(v.path) };
  });
}
/* A kept version's catalog for the page, opened where it is sealed and this desk holds the key; "" where it is not. */
function historyOpen(sha, file) {
  const v = historyFind(sha, file);
  if (!v) return null;
  const name = v.path ? path.basename(v.path) : "";
  try {
    const opened = catalogRead(historyText(v.sha));
    const note = rosterNoteOf(opened.data);
    return note ? { name: name, text: opened.json, notOnTeam: note } : { name: name, text: opened.json };
  }
  catch (e) {
    console.error("etiuda: an earlier version of " + (v.path || v.sha) + " could not be opened - " + e.message);
    const code = readOsCode(e);
    const out = { name: name, text: "", why: "unreadable" };
    if (code) out.code = code;
    return out;
  }
}
/* Writes a kept version back over its file in the catalog folder, by the rule at historyFree and only after the bytes it
   replaces are kept themselves: `replaced` names them, so the page can offer them back. */
function historyPutBack(sha, file) {
  if (relayHere()) return { ok: false }; /* See sharedWrite. */
  const v = historyFind(sha, file), root = path.resolve(catalogFolder());
  if (!v || !historyFree(v) || !v.path || path.dirname(v.path) !== root || !/\.ec$/i.test(v.path) || !folderAnswers(catalogFolder())) return { ok: false };
  try {
    const text = historyText(v.sha);
    let was = "";
    try { was = fs.readFileSync(v.path, "utf8"); } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (was && sha256Hex(Buffer.from(was, "utf8")) === v.sha) return { ok: true, unchanged: true };
    if (was && !historyFree(historyFacts(was))) return { ok: false };
    const before = historyKeepFile(v.path);
    if (!before) return { ok: false };
    writeReplacing(v.path, text);
    historyKeep(v.path, text, true);
    console.log("etiuda: " + v.path + " was put back as this desk kept it");
    return { ok: true, replaced: before.entry ? before.entry.sha : "" };
  } catch (e) {
    console.error("etiuda: " + v.path + " could not be put back - " + e.message);
    return { ok: false };
  }
}

/* ---- editing the shared catalog directly: the host's half -----------------------------------------------------------
   The page merges (src/modules/catalog-merge.js) and this reads and writes, so a desk's write is a compare and swap: the
   file is read with the SHA-256 of its bytes and written only while it still holds those bytes, under a lock file beside
   it taken by exclusive create. Only a catalog with no signature and no seal is read for this. A write into a sealed
   team's share is sealed, or refused; any other write is unsigned and unsealed. The bytes a write replaces are kept
   in the history first. */
// A lock this old is a desk that stopped mid-write, and is taken over.
const SHARED_LOCK_MS = 30 * 1000;
function sharedFile(name) {
  const base = String(name || ""), root = sharedFolderForWrite();
  if (!base || base !== path.basename(base) || !/\.ec$/i.test(base) || !folderAnswers(root)) return "";
  return path.resolve(root, base);
}
/* The edition the layer grew from, as the file held it: the file itself while it is that edition, else the copy the
   history kept, seen again as it is used so the history does not let it go while a desk still merges against it. */
function sharedBase(file, text, pin) {
  if (!pin) return "";
  let id = "";
  try { const d = catalogPayload(text).data; if (signedSha(d) === pin) return text; id = String(d.id); } catch { /* none there */ }
  const versions = historyRead().versions.filter(v => !v.sealed && (v.path === file || (!!id && v.id === id)))
    .sort((a, b) => (b.path === file) - (a.path === file) || b.last - a.last);
  for (const v of versions) {
    try {
      const kept = historyText(v.sha);
      if (signedSha(catalogPayload(kept).data) !== pin) continue;
      historyKeep(v.path, kept, false);
      return kept;
    } catch { /* a copy that does not open */ }
  }
  return "";
}
/* {text, sha, free, base}, text and sha "" where there is no file yet; null where the folder does not answer or the
   file will not read. `free` is false for a signed or sealed file or edition, and nothing of either is handed then. */
function sharedRead(name, pin) {
  if (relayHere()) return null; /* See sharedWrite. */
  const file = sharedFile(name);
  if (!file) return null;
  const share = shareSyncer(path.dirname(file));
  if (share) return share.then(s => (s ? s.shareRead(path.basename(file)) : null)).then(got => (got ? sharedReadOf(file, got.text, pin) : null));
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); }
  catch (e) { if (e.code !== "ENOENT") return null; }
  return sharedReadOf(file, text, pin);
}
/* On a folder team the shared catalog is read and swapped against the share by the syncer's worker, never on this thread:
   a promise of the running syncer where `dir` is the team's mirror, else null and the file is read where it is. */
function shareSyncer(dir) {
  const mirror = folderMirrorHere();
  if (!mirror || path.resolve(dir) !== path.resolve(mirror)) return null;
  let s = folderSyncer && !folderSyncer.stopped && path.resolve(folderSyncer.mirror) === path.resolve(mirror) ? folderSyncer : null;
  if (!s) s = folderSyncerRun(theWindow);
  return Promise.resolve(s || null);
}
function sharedReadOf(file, text, pin) {
  const base = sharedBase(file, text, String(pin || ""));
  const free = (!text || historyFree(historyFacts(text))) && (!base || historyFree(historyFacts(base)));
  return { text: free ? text : "", sha: text ? sha256Hex(Buffer.from(text, "utf8")) : "", free: free, base: free ? base : "" };
}
/* {lock, token} once this desk holds the lock, else null. A stale lock is moved aside before it is taken, so of two
   desks taking over one only one succeeds; a share that lies about either is caught by the compare before the write. */
function sharedLock(file) {
  const lock = file + ".lock", token = crypto.randomBytes(16).toString("hex");
  const take = () => {
    const fd = fs.openSync(lock, "wx");
    try { fs.writeSync(fd, JSON.stringify({ kind: "etiuda-lock", token: token, at: Date.now() })); } finally { fs.closeSync(fd); }
  };
  try { take(); return { lock: lock, token: token }; }
  catch (e) { if (e.code !== "EEXIST") throw e; }
  let st = null;
  try { st = fs.statSync(lock); } catch { /* let go meanwhile */ }
  if (st && Date.now() - st.mtimeMs <= SHARED_LOCK_MS) return null;
  if (st) {
    const aside = lock + "." + token + ".stale";
    try { renamePatiently(lock, aside); } catch { return null; }
    try { fs.unlinkSync(aside); } catch { /* left beside it */ }
  }
  try { take(); return { lock: lock, token: token }; }
  catch (e) { if (e.code === "EEXIST") return null; throw e; }
}
function sharedHolds(held) {
  try { return JSON.parse(fs.readFileSync(held.lock, "utf8")).token === held.token; } catch { return false; }
}
/* The folder's team file, whole under the lead this desk pinned, says its catalogs stay sealed. */
function shareMustSeal(root) {
  heedTeam();
  const doc = teamTextChosen(root).doc;
  if (!doc || !teamWhole(doc) || doc.sealed !== true || doc.exportsSealed === false) return false;
  const policy = sayJoinPolicy().lead;
  if (policy && doc.lead.public !== policy) return false;
  const pinned = teamPins[doc.id];
  return !!pinned && pinned.keyId === doc.lead.keyId && pinned.public === doc.lead.public;
}
/* Writes the page's merged catalog over the file it read, answered {ok, rev}, or {changed} where the file is no longer
   the one read, {busy} where another desk holds the lock, {taken} where a file to be created is already there, and
   {refused} for a signed or sealed catalog on either side. A sealed team's share is written sealed, or refused,
   and a relay mirror is refused outright, since a write there would stay on this desk. */
function sharedWrite(name, text, sha, create) {
  if (relayHere()) return { ok: false, refused: true };
  const file = sharedFile(name);
  text = String(text || "");
  if (!file || !text || text.length > BRANCH_TEXT_MAX) return { ok: false };
  let data = null;
  try { data = catalogPayload(text).data; } catch { return { ok: false }; }
  if (!isV2(data) || !historyFree(historyFacts(text))) return { ok: false, refused: true };
  const root = sharedFolderForWrite();
  const seal = sealFor(String(data.id || ""), "", root);
  if (seal && !seal.plain) {
    try { text = JSON.stringify(sealCatalog(seal.key, seal.team, seal.epoch, text), null, 1) + "\n"; }
    catch { return { ok: false, refused: true, sealed: true }; }
  } else if (!seal && shareMustSeal(root)) return { ok: false, refused: true, sealed: true };
  let share = null;
  share = shareSyncer(root); /* plant:cas-off-thread */
  if (share) return share.then(s => (s ? sharedSwap(s, file, text, sha, create, data) : { ok: false, busy: true }));
  let held = null;
  try { held = sharedLock(file); }
  catch (e) { console.error("etiuda: the lock beside " + file + " could not be taken - " + e.message); }
  if (!held) return { ok: false, busy: true };
  try {
    let now = "";
    try { now = fs.readFileSync(file, "utf8"); } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (create && now) return { ok: false, taken: true };
    if (!create && (!now || sha256Hex(Buffer.from(now, "utf8")) !== String(sha || ""))) return { ok: false, changed: true };
    if (now && !historyFree(historyFacts(now))) return { ok: false, refused: true };
    if (now && !historyKeepFile(file)) return { ok: false, busy: true };
    if (!sharedHolds(held)) return { ok: false, changed: true };
    writeReplacing(file, text);
    historyKeep(file, text, true);
    console.log("etiuda: " + file + " now holds this desk's changes, rev " + (+data.rev || 0));
    return { ok: true, rev: +data.rev || 0 };
  } catch (e) {
    console.error("etiuda: " + file + " could not be written - " + e.message);
    return { ok: false, busy: true };
  } finally {
    if (sharedHolds(held)) { try { fs.unlinkSync(held.lock); } catch { /* stale in SHARED_LOCK_MS */ } }
  }
}

/* sharedWrite's swap on a folder team: the worker holds the share's lock while this thread judges the bytes there and
   keeps them in the history, then writes the share and the mirror before letting the lock go. */
function sharedSwap(s, file, text, sha, create, data) {
  return s.shareSwap(path.basename(file), sha, create, now => {
    if (now && !historyFree(historyFacts(now))) return { result: { ok: false, refused: true } };
    if (now) {
      const buf = Buffer.from(now, "utf8");
      if (!historyShipped(buf, sha256Hex(buf)) && !historyKeep(file, now, false)) return { result: { ok: false, busy: true } };
    }
    return { text: text };
  }).then(r => {
    if (!r || !r.ok) return Object.assign({ ok: false }, r && r.changed ? { changed: true } : r && r.taken ? { taken: true }
      : r && r.refused ? { refused: true } : { busy: true });
    historyKeep(file, text, true);
    console.log("etiuda: " + file + " now holds this desk's changes, rev " + (+data.rev || 0));
    return { ok: true, rev: +data.rev || 0 };
  });
}

function deskFile() { return path.join(app.getPath("userData"), "desk.json"); }
function deskBackup(n) { return path.join(app.getPath("userData"), "desk.bak" + n + ".json"); }

/* Pure, and given its table rather than reaching for the module's, so a test can run the engine
   on migrations of its own. Answers null for anything it cannot bring to `target`, a desk
   written by a LATER Etiuda included: that file is not this version's to interpret, and
   keepAside below is what stops it being overwritten in silence. */
function migrateDesk(doc, table, target) {
  if (!doc || typeof doc !== "object" || doc.kind !== DESK_KIND) return null;
  let v = doc.schema;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) return null;
  let keys = doc.keys;
  while (v < target) {
    const step = table[v];
    if (typeof step !== "function") return null;
    try { keys = step(keys); } catch { return null; }
    v++;
  }
  if (v !== target || !keys || typeof keys !== "object" || Array.isArray(keys)) return null;
  const out = {};
  for (const k of Object.keys(keys)) {
    const value = keys[k];
    if (typeof value === "string") out[k] = value;       // a desk is text; anything else is not
  }
  return out;
}

/* A DESK FILE THIS VERSION REFUSES IS COPIED ASIDE, OUTSIDE THE ROTATION, before anything can
   write over it: a newer Etiuda's desk or a damaged one is somebody's work, and three launches
   of rotation would carry it out of the folder. Named by its bytes, so a second read of the same
   file keeps one copy, and recorded in the envelope until the page says it was seen. */
let deskRefused = [];                          // [{kept, restored}]: the copy, and the backup's date
const deskRefusedSeen = new Set();
let deskUnkept = "";                           // a live desk.json that could not even be read
let deskRestored = "";                         // when the backup this run opened was saved
let deskIsNew = false;                         // no desk file at all, nor a backup: a first run
/* A DESK FILE A LATER ETIUDA WROTE stops the read: an older backup is not opened in its place, nothing is written over
   it and no key is made, so installing that version again finds the desk as it was. {app, schema}, app "" where the
   file names no release. */
let deskNewer = null;
function releaseOf(v) { return /^[1-9][0-9]*\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/.test(String(v || "")) ? String(v) : ""; }
function deskFromLater(doc) {
  return !!doc && doc.kind === DESK_KIND && Number.isInteger(doc.schema) && doc.schema > DESK_SCHEMA;
}
function keepAside(buf) {
  const to = path.join(path.dirname(deskFile()),
    "desk.unread-" + crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12) + ".json");
  if (!fs.existsSync(to)) fs.writeFileSync(to, buf);
  return to;
}
function noteRefused(kept, restored) {
  if (deskRefusedSeen.has(kept) || deskRefused.some(r => r.kept === kept)) return;
  deskRefused.push({ kept: kept, restored: restored });
}
/* Throws while the live file is still neither readable nor kept, so no write can replace it; and while it is a later
   Etiuda's. */
function keepUnkept() {
  if (deskNewer) throw new Error("desk.json was saved by a later Etiuda, so this version leaves it as it is"); /* plant:desk-newer-write */
  if (!deskUnkept) return;
  noteRefused(keepAside(fs.readFileSync(deskUnkept)), deskRestored);
  deskUnkept = "";
}
function settleRefused(refused, unread, live, doc) {
  deskRefused = [];
  if (doc && Array.isArray(doc.refused))
    doc.refused.forEach(r => { if (r && typeof r.kept === "string" && r.kept) noteRefused(r.kept, String(r.restored || "")); });
  deskUnkept = unread ? live : "";
  for (const r of refused) {
    try { noteRefused(keepAside(r.buf), deskRestored); }
    catch (e) {
      console.error("etiuda: " + r.file + " could not be kept aside - " + e.message);
      if (r.file === live) deskUnkept = live;
    }
  }
}
/* The live file first, then the backups oldest-last, so a desk that will not parse costs the
   last run's state rather than all of it. A refused file is left where it is and kept aside. */
function readDesk() {
  deskNewer = null;
  const tried = [deskFile()];
  for (let n = 1; n <= DESK_BACKUPS; n++) tried.push(deskBackup(n));
  const refused = [];
  let unread = false;
  for (const file of tried) {
    let buf;
    try { buf = fs.readFileSync(file); }
    catch (e) { if (file === tried[0] && e.code !== "ENOENT") unread = true; continue; }
    let keys = null, doc = null;
    try { doc = JSON.parse(buf.toString("utf8")); keys = migrateDesk(doc, DESK_MIGRATIONS, DESK_SCHEMA); } catch { keys = null; }
    if (!keys && deskFromLater(doc)) { deskNewer = { app: releaseOf(doc.app), schema: doc.schema }; break; } /* plant:desk-newer */
    if (!keys) {
      console.error("etiuda: " + file + " is not a desk this version can read");
      refused.push({ file: file, buf: buf });
      continue;
    }
    deskRestored = (file === tried[0]) ? "" : String((doc && doc.saved) || "");
    settleRefused(refused, unread, tried[0], doc);
    if (doc && typeof doc.desk === "string" && doc.desk) theDeskId = doc.desk;
    /* answered and held were the old request file's bookmarks. A desk that still has them opens;
       they are not read and the next write leaves them out. */
    if (branchPairOk(doc && doc.branch)) deskBranch = doc.branch;
    if (doc && Array.isArray(doc.branchOld)) deskBranchOld = doc.branchOld.filter(branchPairOk);
    if (doc && doc.branchRevs && typeof doc.branchRevs === "object" && !Array.isArray(doc.branchRevs)) {
      branchRevs = {};
      Object.keys(doc.branchRevs).forEach(k => { if (Number.isInteger(doc.branchRevs[k]) && doc.branchRevs[k] > 0) branchRevs[k] = doc.branchRevs[k]; });
    }
    /* Do not replace the map. A key this run already holds stays, and a number already held is not lowered. */
    if (doc && doc.readRevs && typeof doc.readRevs === "object" && !Array.isArray(doc.readRevs)) {
      Object.keys(doc.readRevs).forEach(k => {
        const n = doc.readRevs[k];
        if (/^k-[0-9a-f]{16}-[0-9a-f]{8}$/.test(k) && Number.isInteger(n) && n > (readRevs[k] || 0)) readRevs[k] = n;
      });
    }
    const table = v => !!v && typeof v === "object" && !Array.isArray(v);
    // Only a table of signing publics is a mark; a bare number under a catalog id is no mark at all.
    if (doc && table(doc.catalogRevs)) Object.keys(doc.catalogRevs).forEach(id => {
      const slot = doc.catalogRevs[id];
      if (!CATALOG_ID_RE.test(id) || !table(slot)) return;
      Object.keys(slot).forEach(pub => {
        const n = slot[pub];
        if (!CATALOG_PUB_RE.test(pub) || !Number.isInteger(n) || !(n > catalogRevSlot(id, pub))) return;
        if (!catalogRevs[id] || typeof catalogRevs[id] !== "object" || Array.isArray(catalogRevs[id])) catalogRevs[id] = {};
        catalogRevs[id][pub] = n;
      });
    });
    if (doc && table(doc.teamPins)) Object.keys(doc.teamPins).forEach(t => {
      const p = doc.teamPins[t];
      if (SEALED_TEAM_RE.test(t) && table(p) && typeof p.keyId === "string" && /^[0-9a-f]{64}$/.test(String(p.public)))
        teamPins[t] = { keyId: p.keyId, public: p.public };
    });
    if (doc && table(doc.teamKeys)) Object.keys(doc.teamKeys).forEach(t => {
      const k = doc.teamKeys[t];
      if (!SEALED_TEAM_RE.test(t) || !table(k)) return;
      Object.keys(k).forEach(n => { if (/^[1-9][0-9]*$/.test(n) && typeof k[n] === "string" && k[n]) (teamKeys[t] = teamKeys[t] || {})[n] = k[n]; });
    });
    /* A number already held is not replaced by a lower one. Equal is not a raise. */
    if (doc && table(doc.teamEpochSeen)) Object.keys(doc.teamEpochSeen).forEach(t => {
      const n = doc.teamEpochSeen[t];
      if (SEALED_TEAM_RE.test(t) && Number.isInteger(n) && n > (teamEpochSeen[t] || 0)) teamEpochSeen[t] = n;
    });
    // The same for a roster: one kept at a lower epoch is replaced, and one at the same epoch stays.
    if (doc && table(doc.teamRoster)) Object.keys(doc.teamRoster).forEach(t => {
      const v = doc.teamRoster[t];
      if (!SEALED_TEAM_RE.test(t) || !table(v) || !Number.isInteger(v.epoch) || v.epoch < 1 || !Array.isArray(v.desks)) return;
      if (v.epoch > (teamRoster[t] ? teamRoster[t].epoch : 0)) teamRoster[t] = { epoch: v.epoch, desks: deskIdsOnce(v.desks) };
    });
    // A floor is taken where it is higher, by epoch and then by rev, and never lowered.
    if (doc && table(doc.teamRevSeen)) Object.keys(doc.teamRevSeen).forEach(t => {
      const byKey = doc.teamRevSeen[t];
      if (!SEALED_TEAM_RE.test(t) || !table(byKey)) return;
      Object.keys(byKey).forEach(pub => {
        const v = byKey[pub], had = (teamRevSeen[t] || {})[pub];
        if (!/^[0-9a-f]{64}$/.test(pub) || !table(v) || !Number.isInteger(v.epoch) || v.epoch < 1 || !Number.isSafeInteger(v.rev) || v.rev < 0) return;
        if (had && (v.epoch < had.epoch || (v.epoch === had.epoch && v.rev <= had.rev))) return;
        (teamRevSeen[t] = teamRevSeen[t] || {})[pub] = { epoch: v.epoch, rev: v.rev };
      });
    });
    if (doc && table(doc.teamChannel)) Object.keys(doc.teamChannel).forEach(t => {
      const c = SEALED_TEAM_RE.test(t) && table(doc.teamChannel[t]) ? teamChannelOf({ channel: doc.teamChannel[t] }) : null;
      if (c && c.kind === "relay") teamChannel[t] = c;
    });
    if (doc && table(doc.teamPinFrom)) Object.keys(doc.teamPinFrom).forEach(t => {
      const v = doc.teamPinFrom[t];
      if (SEALED_TEAM_RE.test(t) && teamPins[t] && PIN_FROM.indexOf(v) >= 0) teamPinFrom[t] = v;
    });
    if (doc && table(doc.teamShown)) Object.keys(doc.teamShown).forEach(t => {
      const v = doc.teamShown[t];
      if (!SEALED_TEAM_RE.test(t) || !table(v)) return;
      const o = {};
      if (shownName(v.lead)) o.lead = v.lead;
      if (typeof v.folder === "string" && v.folder && v.folder.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(v.folder)) o.folder = v.folder;
      if (typeof v.relay === "string" && v.relay && v.relay.length <= 256 && !/[\u0000-\u001f\u007f]/.test(v.relay)) o.relay = v.relay;
      teamShown[t] = o;
    });
    if (doc && Array.isArray(doc.teamOpened)) doc.teamOpened.forEach(c => { if (typeof c === "string" && c) teamOpened.add(c); });
    if (doc && table(doc.teamLeft)) Object.keys(doc.teamLeft).forEach(t => {
      const at = doc.teamLeft[t];
      if (SEALED_TEAM_RE.test(t) && typeof at === "string" && /^\d{4}-\d\d-\d\dT[0-9:.]+Z$/.test(at)) teamLeft[t] = at;
    });
    if (doc && table(doc.teamLapseSeen)) Object.keys(doc.teamLapseSeen).forEach(t => {
      const v = doc.teamLapseSeen[t];
      if (SEALED_TEAM_RE.test(t) && typeof v === "string" && LAPSE_SEEN_RE.test(v)) teamLapseSeen[t] = v;
    });
    if (doc && table(doc.teamContentSaid)) Object.keys(doc.teamContentSaid).forEach(t => {
      const v = doc.teamContentSaid[t];
      const p = typeof v === "string" ? v.split("\n") : [];
      if (SEALED_TEAM_RE.test(t) && p.length === 4 && /^[0-9a-f]{64}$/.test(p[0]) && /^(?:[0-9a-f]{64})?$/.test(p[1]) && p[2] && ASK_TIME_RE.test(p[3]))
        teamContentSaid[t] = v;
    });
    if (doc && table(doc.catalogLineage)) Object.keys(doc.catalogLineage).slice(-LINEAGE_MAX).forEach(c => {
      const g = doc.catalogLineage[c];
      if (typeof c === "string" && c && typeof g === "string" && g && g !== c) catalogLineage[c] = g;
    });
    if (doc && table(doc.catalogRoots)) Object.keys(doc.catalogRoots).slice(-LINEAGE_MAX).forEach(c => {
      const g = doc.catalogRoots[c];
      if (typeof c === "string" && c && typeof g === "string" && g && g !== c) catalogRoots[c] = g;
    });
    if (doc && table(doc.answerKept) && Array.isArray(doc.answerKept.ids))
      answerKept = { ids: doc.answerKept.ids.filter(c => typeof c === "string" && c).slice(0, LINEAGE_HOPS), lead: doc.answerKept.lead === true };
    if (doc && Array.isArray(doc.catalogPrivate)) doc.catalogPrivate.forEach(c => { if (typeof c === "string" && CATALOG_ID_RE.test(c)) catalogPrivate.add(c); });
    if (doc && table(doc.teamRelayGone)) Object.keys(doc.teamRelayGone).forEach(t => {
      if (SEALED_TEAM_RE.test(t) && doc.teamRelayGone[t] === true) teamRelayGone[t] = true;
    });
    const leadRow = k => table(k) && typeof k.keyId === "string" && k.keyId.length > 0 && k.keyId.length <= 80 && JOIN_HEX_RE.test(String(k.public));
    if (doc && table(doc.teamWas)) Object.keys(doc.teamWas).forEach(t => {
      const v = doc.teamWas[t];
      if (SEALED_TEAM_RE.test(t) && Array.isArray(v)) teamWas[t] = v.filter(leadRow).slice(-HANDOVER_STEPS).map(k => ({ keyId: k.keyId, public: k.public }));
    });
    if (doc && table(doc.teamForks)) Object.keys(doc.teamForks).forEach(t => {
      const v = doc.teamForks[t];
      if (!SEALED_TEAM_RE.test(t) || !table(v)) return;
      const said = Array.isArray(v.said) ? v.said.filter(k => typeof k === "string" && FORK_KEY_RE.test(k)).slice(-FORK_SAID_MAX) : [];
      teamForks[t] = { said: said, last: forkKept(v.last), seen: typeof v.seen === "string" && FORK_KEY_RE.test(v.seen) ? v.seen : "" };
    });
    if (doc && table(doc.teamNeedsFolder)) Object.keys(doc.teamNeedsFolder).forEach(t => {
      const v = doc.teamNeedsFolder[t];
      if (SEALED_TEAM_RE.test(t) && table(v) && Number.isSafeInteger(v.rev)) teamNeedsFolder[t] = v;
    });
    [["teamSeen", teamSeen], ["teamBarred", teamBarred], ["teamHeldOut", teamHeldOut]].forEach(([k, set]) => {
      if (doc && Array.isArray(doc[k])) doc[k].forEach(t => { if (SEALED_TEAM_RE.test(String(t))) set.add(String(t)); });
    });
    teamJoin = joinKept(doc && doc.teamJoin);
    if (doc && doc.ejectOwed && typeof doc.ejectOwed === "object" && !Array.isArray(doc.ejectOwed)) {
      const o = doc.ejectOwed;
      const next = {};
      if (SEALED_TEAM_RE.test(String(o.team || ""))) next.team = String(o.team);
      if (PIN_RE.test(String(o.sha || ""))) next.sha = String(o.sha);
      ejectOwed = next;
    }
    /* An eject still owed wins over a pin left beside it: reloading that pin would put the catalog back. */
    if (!ejectOwed && doc && doc.inUse && typeof doc.inUse === "object" && !Array.isArray(doc.inUse)) {
      const u = doc.inUse;
      if (PIN_RE.test(String(u.sha || "")) && Number.isInteger(u.epoch) && u.epoch >= 1 && SEALED_TEAM_RE.test(String(u.team || ""))) {
        inUseKept = { sha: String(u.sha), epoch: u.epoch, team: String(u.team) };
        if (u.source === "folder" || u.source === "opened" || u.source === "desk-file") inUseKept.source = u.source;
      }
    }
    if (doc && Number.isInteger(doc.inUseN) && doc.inUseN >= 1 && doc.inUseN > inUseN) inUseN = doc.inUseN;
    if (doc && table(doc.teamPauseSeen)) Object.keys(doc.teamPauseSeen).forEach(t => {
      const v = doc.teamPauseSeen[t];
      if (SEALED_TEAM_RE.test(t) && table(v) && Number.isInteger(v.t) && v.t >= 0 && typeof v.paused === "boolean") {
        if (!teamPauseSeen[t] || v.t > teamPauseSeen[t].t) teamPauseSeen[t] = { t: v.t, paused: v.paused };
      }
    });
    if (doc && Array.isArray(doc.catalogAsks)) doc.catalogAsks.forEach(id => {
      const s = String(id || "");
      if (ASK_ID_RE.test(s) && catalogAskIds.indexOf(s) < 0) catalogAskIds.push(s);
    });
    while (catalogAskIds.length > 64) catalogAskIds.shift();
    if (doc && Array.isArray(doc.recentCatalogs)) doc.recentCatalogs.forEach(f => {
      const s = String(f || "");
      if (s && recentCatalogs.indexOf(s) < 0) recentCatalogs.push(s);
    });
    while (recentCatalogs.length > RECENT_CATALOGS_MAX) recentCatalogs.pop();
    ensureDeskId();
    console.log("etiuda: desk read from " + file + ", " + Object.keys(keys).length + " keys");
    reloadLoadedCatalog();
    return keys;
  }
  deskRestored = "";
  settleRefused(refused, unread, tried[0], null);
  if (deskNewer) {
    console.error("etiuda: the desk was saved by a later Etiuda (schema " + deskNewer.schema + "), so it is read as empty and left as it is");
    return {};
  }
  if (!refused.length && !unread) {
    deskIsNew = true;
    console.log("etiuda: no desk file yet, so this run starts one");
  }
  ensureDeskId();
  return {};
}

/* Once a run, not once a write. Three writes a second would otherwise leave three copies of the
   same second, where what is worth keeping is the desk as the last three runs found it. A copy
   for slot 1 rather than a rename, so the live file is never briefly absent. */
let deskRotated = false;
function rotateDesk() {
  if (deskRotated) return;
  deskRotated = true;
  if (!fs.existsSync(deskFile())) return;
  for (let n = DESK_BACKUPS; n > 1; n--) {
    try { fs.renameSync(deskBackup(n - 1), deskBackup(n)); } catch { /* that slot is empty */ }
  }
  try { fs.copyFileSync(deskFile(), deskBackup(1)); } catch (e) { console.error("etiuda: desk backup failed - " + e.message); }
}

/* A save carries one load's own copy of the desk, so it is applied as a DELTA against the map
   that load was last given rather than as the whole truth: taken as the whole desk it would undo
   whatever another load has written since, which is board item 356. Absence inside the delta is
   still a deletion, which is what lsDel needs and what a plain merge would lose. */
function mergeDesk(current, base, map) {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const out = Object.assign({}, current);
  for (const k of Object.keys(base)) if (!has(map, k)) delete out[k];      // this load deleted it
  for (const k of Object.keys(map)) if (map[k] !== base[k]) out[k] = map[k];
  return out;
}

function sameDesk(a, b) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every(k => a[k] === b[k]);
}

/* Takes the engine's map as text and splices it into the envelope wherever the merge left that
   map alone, so the ordinary write still parses what may be a large catalog once and does not
   serialise it again. Temp file then rename: a rename is the one filesystem operation that
   cannot leave half a desk behind. Returns whether the bytes reached the disk, because
   storeCatalog acts on that and the engine's save notice reads it. */
let deskKeys;                                  // the desk as the last read or write left the file
let deskWritten = false;                       // whether the live desk.json is this run's write
const deskGiven = new Map();                   // webContents id -> the map that load was handed
/* The bytes, shared by the engine's channel below and by the main process's own one-key write.
   Temp file then rename, which is the one filesystem operation that cannot leave half a desk. */
function saveDeskFile(keysText) {
  const file = deskFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  keepUnkept();
  rotateDesk();
  writeReplacing(file, deskEnvelopeBody(keysText));
}
/* A key the MAIN PROCESS owns, written before any window exists. Not writeDesk: that one applies
   a delta against the map a particular load was handed, and re-arms the watch and the theme
   after it - none of which a key no renderer has ever seen is part of. */
function deskSetOwn(key, value) {
  if (deskKeys === undefined) deskKeys = readDesk();
  if (deskKeys[key] === value) return;
  const next = Object.assign({}, deskKeys, { [key]: value });
  try {
    saveDeskFile(JSON.stringify(next));
    deskKeys = next;
    deskWritten = true;
  } catch (e) { console.error("etiuda: the desk could not be written - " + e.message); }
}
/* The same write, taking a key away. Stay in the tray is the absence of eQuitOnClose, not a second value. */
function deskDropOwn(key) {
  if (deskKeys === undefined) deskKeys = readDesk();
  if (!Object.prototype.hasOwnProperty.call(deskKeys, key)) return;
  const next = Object.assign({}, deskKeys);
  delete next[key];
  try {
    saveDeskFile(JSON.stringify(next));
    deskKeys = next;
    deskWritten = true;
  } catch (e) { console.error("etiuda: the desk could not be written - " + e.message); }
}
/* The tray menu, its tooltip and the jump list speak the desk's language, so a change of it rebuilds them at once. */
function onUiLangChanged() {
  try { rebuildTrayMenu(); } catch { /* no tray on this desk */ }
  try { syncJumpList(); } catch { /* the jump list is optional */ }
}

function writeDesk(text, from) {
  let map;
  try { map = JSON.parse(text); } catch { return false; }
  if (!map || typeof map !== "object" || Array.isArray(map)) return false;
  if (deskKeys === undefined) deskKeys = readDesk();
  const langWas = deskKeys ? deskKeys.eUiLang : undefined;
  const merged = mergeDesk(deskKeys, deskGiven.get(from) || {}, map);
  /* A write is skipped only where the live file is known to hold exactly this. A desk recovered
     from a backup has not been written yet, and skipping there would leave the refused file. */
  if (deskWritten && sameDesk(merged, deskKeys)) { deskGiven.set(from, map); return true; }
  try {
    saveDeskFile(sameDesk(merged, map) ? text : JSON.stringify(merged));
    deskKeys = merged;
    deskWritten = true;
    deskGiven.set(from, map);
    catalogFolderChanged();
    applyThemeSource();
    syncHotkey();
    if (merged && merged.eUiLang !== langWas) {
      onUiLangChanged();
    }
    return true;
  } catch (e) {
    console.error("etiuda: the desk could not be written - " + e.message);
    return false;
  }
}
/* JSON.stringify of the map, byte for byte, with each key's text kept from the write before: a
   patch re-encodes only what it names, and a catalog is escaped once rather than on every count. */
const deskKeyText = new Map();                 // key -> [the value, its "key":value text]
function deskText(keys) {
  const names = Object.keys(keys);
  const parts = names.map(k => {
    const v = keys[k], was = deskKeyText.get(k);
    if (was && was[0] === v) return was[1];
    const t = JSON.stringify(k) + ":" + JSON.stringify(v);
    deskKeyText.set(k, [v, t]);
    return t;
  });
  if (deskKeyText.size > names.length) for (const k of deskKeyText.keys()) if (!(k in keys)) deskKeyText.delete(k);
  return "{" + parts.join(",") + "}";
}
/* A PATCH NAMES ONLY THE KEYS ONE LOAD CHANGED, a string for a value and null for a key deleted,
   so it is applied as it stands: no other load's key is in it to be undone. */
function patchDesk(text) {
  let patch;
  try { patch = JSON.parse(text); } catch { return false; }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;
  const keys = Object.keys(patch);
  if (keys.some(k => patch[k] !== null && typeof patch[k] !== "string")) return false;
  if (deskKeys === undefined) deskKeys = readDesk();
  const langWas = deskKeys ? deskKeys.eUiLang : undefined;
  /* Ejecting the catalog is the agent leaving the file this launch was opened with, even when
     that key was never stored and the patch then changes nothing. */
  if (Object.prototype.hasOwnProperty.call(patch, "eCatalog") && patch.eCatalog === null) releaseOpened();
  const has = (k) => Object.prototype.hasOwnProperty.call(deskKeys, k);
  if (deskWritten && keys.every(k => (patch[k] === null ? !has(k) : deskKeys[k] === patch[k]))) return true;
  const merged = Object.assign({}, deskKeys);
  keys.forEach(k => { if (patch[k] === null) delete merged[k]; else merged[k] = patch[k]; });
  try {
    saveDeskFile(deskText(merged));
    deskKeys = merged;
    deskWritten = true;
    catalogFolderChanged();
    applyThemeSource();
    syncHotkey();
    if (merged && merged.eUiLang !== langWas) {
      onUiLangChanged();
    }
    return true;
  } catch (e) {
    console.error("etiuda: the desk could not be written - " + e.message);
    return false;
  }
}

/* PER LOAD, NOT ONCE A RUN. The document reloads inside one app run - accepting a catalog is
   exactly that - and the load after it must be handed the desk the disk holds at that moment.
   Caching this cost the whole catalog: the key was written, the second load was given the desk
   as it stood at app start, and the next write put that back. The engine asks once while it
   boots, so this is one file read per load rather than one per key. */
ipcMain.on("etiuda:desk", (e) => {
  if (!fromEngine(e)) { e.returnValue = null; return; }
  const id = e.sender.id;
  if (!deskGiven.has(id)) e.sender.once("destroyed", () => deskGiven.delete(id));
  deskKeys = readDesk();
  deskGiven.set(id, deskKeys);
  e.returnValue = JSON.stringify(deskKeys);
});
ipcMain.on("etiuda:desk-save", (e, text) => {
  e.returnValue = fromEngine(e) && typeof text === "string" && writeDesk(text, e.sender.id);
});
/* The same write, answered without holding the renderer. It writes before it answers, so a quit
   finds nothing waiting here: whatever the page has not sent yet it sends on pagehide. */
ipcMain.handle("etiuda:desk-write", (e, text) =>
  fromEngine(e) && typeof text === "string" && writeDesk(text, e.sender.id));
ipcMain.on("etiuda:desk-patch-save", (e, text) => {
  e.returnValue = fromEngine(e) && typeof text === "string" && patchDesk(text);
});
ipcMain.handle("etiuda:desk-patch", (e, text) =>
  fromEngine(e) && typeof text === "string" && patchDesk(text));
/* THE TABS' SESSION LIVES HERE, IN MEMORY, PER WINDOW. Chromium's own sessionStorage is written to the
   profile, where a customer's name and a search would outlast the window; this is never written in plain text.
   At an installer's close alone, and only upon an explicit installer signal (--update-close) when safeStorage
   sealing is available, the desk seals open tabs and drafts with safeStorage to disk (tabs.json) and exits
   without a modal (updates-8 condition of 2026-11-01, Board 958 row A7). If sealing is unavailable, nothing
   is written and closing asks as ruled. The next start unlinks and restores every window's saved tabs. */
const sessionHeld = new Map();
let pendingSavedTabs = null;

function tabsFile() {
  return path.join(app.getPath("userData"), "tabs.json");
}

function writeSavedTabs(win) {
  /* plant:installer-keeps-draft */
  try {
    const windowSessions = [];
    const seenIds = new Set();
    for (const [id, sm] of sessionHeld.entries()) {
      if (!sm) continue;
      const raw = sm.get("eSessionTabs");
      if (!raw || typeof raw !== "string") continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
          windowSessions.push({ id, tabs: parsed.tabs, activeTabId: parsed.activeTabId });
          seenIds.add(id);
        }
      } catch (_) {}
    }
    if (win && win.webContents && !seenIds.has(win.webContents.id)) {
      const sm = sessionHeld.get(win.webContents.id);
      const raw = sm && sm.get("eSessionTabs");
      if (raw && typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
            windowSessions.push({ id: win.webContents.id, tabs: parsed.tabs, activeTabId: parsed.activeTabId });
          }
        } catch (_) {}
      }
    }
    if (windowSessions.length === 0) return "empty";
    if (!branchSealable()) return false;
    const payload = JSON.stringify({ v: 1, windows: windowSessions });
    const sealed = safeStorage.encryptString(payload);
    const file = tabsFile();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    writeReplacing(file, sealed);
    return true;
  } catch (e) {
    console.error("etiuda: saved tabs could not be written - " + e.message);
    return false;
  }
}

function readSavedTabs() {
  /* plant:installer-restores-draft */
  try {
    const file = tabsFile();
    if (!fs.existsSync(file)) return "";
    const sealed = fs.readFileSync(file);
    let plain = "";
    try {
      plain = safeStorage.decryptString(sealed);
    } catch (e) {
      console.error("etiuda: saved tabs could not be decrypted - " + e.message);
      return "";
    }
    if (!plain) return "";
    let data;
    try { data = JSON.parse(plain); } catch { return ""; }
    let result = "";
    if (data && Array.isArray(data.windows)) {
      const allTabs = [];
      const seenIds = new Set();
      let activeTabId = null;
      for (const w of data.windows) {
        if (!w || !Array.isArray(w.tabs)) continue;
        for (const t of w.tabs) {
          if (!t || typeof t !== "object") continue;
          let id = t.id;
          if (seenIds.has(id)) {
            id = id + "-w" + seenIds.size;
            t.id = id;
          }
          seenIds.add(id);
          allTabs.push(t);
        }
        if (!activeTabId && w.activeTabId) activeTabId = w.activeTabId;
      }
      if (allTabs.length === 0) return "";
      if (!activeTabId && allTabs[0]) activeTabId = allTabs[0].id;
      result = JSON.stringify({ v: 1, tabs: allTabs, activeTabId });
    } else if (data && Array.isArray(data.tabs)) {
      result = plain;
    }
    if (result) {
      try { fs.unlinkSync(file); } catch (e) {}
      return result;
    }
    return "";
  } catch (e) {
    console.error("etiuda: saved tabs could not be read - " + e.message);
    return "";
  }
}

function handleUpdateClose(wins) {
  const saved = writeSavedTabs();
  if (saved === false) return false;
  const list = (wins && Array.isArray(wins) ? wins : (typeof BrowserWindow.getAllWindows === "function" ? BrowserWindow.getAllWindows() : []))
    .concat(theWindow ? [theWindow] : []);
  const seen = new Set();
  for (const win of list) {
    if (!win || (typeof win.isDestroyed === "function" && win.isDestroyed()) || seen.has(win)) continue;
    seen.add(win);
    win.etiudaInstallerClose = true;
    try { win.close(); } catch (_) {}
  }
  return saved === true;
}

ipcMain.on("etiuda:session", (e, op, key, value) => {
  let out = null;
  if (fromEngine(e) && typeof op === "string" && typeof key === "string") {
    const id = e.sender.id;
    if (!sessionHeld.has(id)) {
      const sm = new Map();
      sessionHeld.set(id, sm);
      e.sender.once("destroyed", () => sessionHeld.delete(id));
      if (pendingSavedTabs === null) pendingSavedTabs = readSavedTabs();
      if (pendingSavedTabs) {
        sm.set("eSessionTabs", pendingSavedTabs);
        pendingSavedTabs = "";
      }
    }
    const m = sessionHeld.get(id);
    if (op === "get") out = m.has(key) ? m.get(key) : null;
    else if (op === "set" && typeof value === "string") { m.set(key, value); out = true; }
    else if (op === "del") { m.delete(key); out = true; }
    else if (op === "clear") { m.clear(); out = true; }
  }
  e.returnValue = out;
});
/* Left by a build that let Chromium keep the tabs, or by a page that was cut off before it could clear. */
function dropSessionStorage() {
  try { fs.rmSync(path.join(app.getPath("userData"), "Session Storage"), { recursive: true, force: true }); }
  catch (e) { console.error("etiuda: Session Storage could not be cleared - " + e.message); }
}
ipcMain.on("etiuda:desk-refused", (e) => {
  e.returnValue = fromEngine(e) ? JSON.stringify(deskRefused) : "[]";
});
/* The later Etiuda's desk this run leaves alone, {app, schema} as text, or "". */
ipcMain.on("etiuda:desk-newer", (e) => {
  e.returnValue = fromEngine(e) && deskNewer ? JSON.stringify(deskNewer) : "";
});
ipcMain.on("etiuda:desk-refused-seen", (e) => {
  if (!fromEngine(e)) return;
  deskRefused.forEach(r => deskRefusedSeen.add(r.kept));
  deskRefused = [];
  persistDeskEnvelope();
});

/* What the engine is told about its host, answered before the first page script runs. Acrylic
   is a Windows 11 material and DwmSetWindowAttribute ignores it below build 22621, silently, so
   the answer is measured here rather than assumed: a null backdrop is what puts the engine on
   its plain band. */
function hostBackdrop() {
  if (process.platform !== "win32") return null;
  const build = Number(os.release().split(".")[2] || 0);
  return build >= 22621 ? "acrylic" : null;
}

/* THE MATERIAL AND THE BAND MOVE TOGETHER. Acrylic takes its light or dark tint from Windows by
   itself, while every pixel the engine paints follows the theme picked IN Etiuda, so a dark
   Etiuda on a light Windows left the material and the band disagreeing down one edge.
   nativeTheme.themeSource is what decides the material: "system" while Etiuda follows the system,
   and the chosen one once somebody has chosen. The theme is an ordinary engine key, so this hears
   of a change inside writeDesk exactly as the catalog folder does. 381's accent is untouched. */
const THEME_KEY = "eTheme";
function themeSource() {
  if (deskKeys === undefined) deskKeys = readDesk();
  const t = deskKeys[THEME_KEY];
  return (t === "light" || t === "dark") ? t : "system";
}
function applyThemeSource() {
  const want = themeSource();
  try { if (nativeTheme.themeSource !== want) nativeTheme.themeSource = want; }
  catch (e) { console.error("etiuda: the material's theme could not be set - " + e.message); }
}

/* THE WINDOWS ACCENT, and the switch that decides whether a window wears it. Electron answers the
   colour; nothing in Electron answers the switch, so DWM's own ColorPrevalence is read, which is
   what "Show accent colour on title bars and window borders" writes. Empty where the switch is
   off, where this is not Windows, or where either read fails - and empty is what puts the band
   back on the brand cobalt, so every uncertain answer lands on the colour Etiuda owns. */
function accentOnTitleBars() {
  if (process.platform !== "win32") return false;
  try {
    const out = execFileSync(REG_TOOL,
      ["query", "HKCU\\Software\\Microsoft\\Windows\\DWM", "/v", "ColorPrevalence"],
      { encoding: "utf8", windowsHide: true });
    const m = out.match(/ColorPrevalence\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
    return !!m && parseInt(m[1], 16) === 1;
  } catch { return false; }
}
/* getAccentColor answers RRGGBBAA on Windows; the alpha is the system's own and is not the
   band's to wear, so six digits and no more. */
function hostAccent() {
  if (!accentOnTitleBars()) return "";
  try {
    const hex = String(systemPreferences.getAccentColor() || "").replace(/[^0-9a-fA-F]/g, "");
    return hex.length >= 6 ? "#" + hex.slice(0, 6).toLowerCase() : "";
  } catch { return ""; }
}
/* Both events, because they are two different facts and only one of them has a name: the colour
   changing fires accent-color-changed, and the SWITCH being turned on or off is a system colour
   change with no event of its own. The registry is re-read either way, so what the window is told
   is always the pair of answers rather than the last one remembered. */
function tellAccent() {
  if (!theWindow || theWindow.isDestroyed()) return;
  theWindow.webContents.send("etiuda:accent", hostAccent());
}
if (process.platform === "win32") {
  try {
    systemPreferences.on("accent-color-changed", tellAccent);
    systemPreferences.on("color-changed", tellAccent);
  } catch (e) { console.error("etiuda: the accent watch could not be set - " + e.message); }
}

/* The three the band's own buttons ask for. One channel, one switch: a renderer that can name
   an arbitrary method on the window is a wider door than three verbs need. */
ipcMain.on("etiuda:window", (e, act) => {
  if (!fromEngine(e)) return;
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (act === "minimize") win.minimize();
  else if (act === "maximize") { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
  else if (act === "close") win.close();
});

/* CLOSING ASKS ONCE WHILE A CONVERSATION IS IN PROGRESS (desk-chrome-close-quits-forgets, 2026-10-12): the X, Alt+F4
   and the taskbar closed at once and forgot every conversation. A close is held and the page asked; it answers "none"
   where nothing would be lost, or asks and answers with the person's choice. Never held: a second close while it asks,
   a page that has not answered within CLOSE_WAIT_MS (hung, or not yet loaded), a page that is gone, a quit, the end of
   the Windows session, the refusal page's own Close, and the harness's placed windows. */
const CLOSE_WAIT_MS = 1500;
let quitting = false;
let quitDrained = false;
/* The longest a quit waits for a folder team's share to take what the outbox owes, as Studio's FOLDER_QUIT_MS. */
const FOLDER_QUIT_MS = 2000;
/* A quit drains the writes still running, then gives the folder syncers up to FOLDER_QUIT_MS to send what their outbox owes
   (the close-time statistics just flushed among it), and only then stops them: a syncer stopped first left that owed until
   the desk's next start (Argon's folder-as-built review, finding 7, the desk's half). Whatever is not sent stays owed on disk. */
app.on("before-quit", (e) => {
  quitting = true;
  try { flushHeldStats(); } catch { /* the last sealed answer stays */ }
  if (quitDrained) { try { FolderSyncer().stopAllFolderSyncers(); } catch {} return; }
  let owes = false;
  try { owes = !!folderSyncerLayer && folderSyncerLayer.folderSyncersOwe(); } catch { owes = false; }
  if (activeWrites.size > 0 || owes) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    drainWrites(WRITE_DRAIN_BOUND_MS).then(() => {
      let flushing = Promise.resolve(true);
      flushing = FolderSyncer().flushFolderSyncers(FOLDER_QUIT_MS); /* plant:quit-flush-folders */
      return flushing;
    }).catch(() => {}).finally(() => {
      try { FolderSyncer().stopAllFolderSyncers(); } catch {}
      quitDrained = true;
      app.quit();
    });
    return;
  }
  try { FolderSyncer().stopAllFolderSyncers(); } catch {}
});
/* Quit on close is the desk key eQuitOnClose === "1". Absent, the window stays in the tray. */
const QUIT_ON_CLOSE_KEY = "eQuitOnClose";
let quitOnClose = false;
let quitOnCloseKnown = false;
function readQuitOnClose() {
  if (!quitOnCloseKnown) {
    if (deskKeys === undefined) deskKeys = readDesk();
    quitOnClose = !!(deskKeys && deskKeys[QUIT_ON_CLOSE_KEY] === "1");
    quitOnCloseKnown = true;
  }
  return quitOnClose;
}
function setQuitOnClose(on) {
  quitOnClose = !!on;
  quitOnCloseKnown = true;
}
function storeQuitOnClose(on) {
  setQuitOnClose(on);
  if (on) deskSetOwn(QUIT_ON_CLOSE_KEY, "1");
  else deskDropOwn(QUIT_ON_CLOSE_KEY);
}
function closeHeld(win, e) {
  let decision = "quit";
  try {
    decision = decideClose({
      stayInTray: !readQuitOnClose(),
      etiudaInstallerClose: !!(win && win.etiudaInstallerClose),
      sessionEnd: !!(win && win.etiudaSessionEnd),
      quitting: !!quitting,
      refusalClose: !!(win && (win.etiudaRefusalClose || win.etiudaCloseOk)),
      placedWindow: !!PLACED_ASIDE,
    });
  } catch (err) {
    console.error("etiuda: the close could not be decided - " + err.message);
    decision = "quit";
  }
  /* Hide does not run the window's own place-keeping: a stay is not a close, and the place file stays as it was
     unless the first-close toast has something to remember. No tray is not a stay: hiding would leave the desk
     running with nothing to open it, so that close falls through. */
  const lost = win && win.webContents && win.webContents.etiudaLost;
  /* A stopped page that has not come back is not hidden: the tray would show an empty pane. */
  if (decision === "hide" && ensureTray() && !(lost && !lost.back)) {
    try { if (e && typeof e.preventDefault === "function") e.preventDefault(); } catch { /* already held */ }
    try { if (win && typeof win.hide === "function") win.hide(); } catch { /* this window cannot hide */ }
    try { maybeFirstClose(win); } catch { /* the toast is a courtesy */ }
    return true;
  }
  if (win && (win.etiudaInstallerClose || win.etiudaSessionEnd || win.etiudaRefusalClose)) return false;
  if (win.etiudaCloseOk || win.etiudaCloseAsking || quitting || PLACED_ASIDE || (lost && !lost.back)) return false;
  e.preventDefault();
  win.etiudaCloseAsking = true;
  win.etiudaCloseWait = setTimeout(() => closeNow(win), CLOSE_WAIT_MS);
  win.webContents.send("etiuda:ask-close");
  return true;
}
/* THE HOLD'S WIRING ON A WINDOW, apart from createWindow so that a node leg can drive it (Clément's read, hole 3): the
   window's close goes through closeHeld before `onClose`, the window's own place-keeping, and the end of the Windows
   session lets it go. The refusal page's Close (CLOSE_MARK) lets it go before it closes. */
function wireHold(win, onClose) {
  win.on("close", (e) => { if (closeHeld(win, e)) return; onClose(e); });
  /* Windows is ending the session: nothing may hold the window then, a close already held and asking included, which
     is let go at once (Clément's read of desk-polish-1). */
  win.on("session-end", () => {
    win.etiudaSessionEnd = true;
    win.etiudaCloseOk = true;
    if (win.etiudaCloseAsking) closeNow(win);
  });
}
function closeFromRefusal(win) {
  win.etiudaRefusalClose = true;
  win.etiudaCloseOk = true;
  win.close();
}
function closeNow(win) {
  clearTimeout(win.etiudaCloseWait);
  try { flushHeldStats(); } catch { /* the last sealed answer stays */ }
  win.etiudaCloseOk = true;
  if (!win.isDestroyed()) win.close();
}
function closeAnswered(win, a) {
  if (!win || !win.etiudaCloseAsking) return;
  if (a === "asked") { clearTimeout(win.etiudaCloseWait); return; }
  if (a === "stay") { clearTimeout(win.etiudaCloseWait); win.etiudaCloseAsking = false; return; }
  if (a === "none" || a === "close") closeNow(win);
}
ipcMain.on("etiuda:close-answer", (e, a) => {
  if (!fromEngine(e)) return;
  closeAnswered(BrowserWindow.fromWebContents(e.sender), String(a || ""));
});
/* Start with Windows is Windows' own login item, read back from there, never a desk key. */
ipcMain.on("etiuda:login-item-set", (e, on) => {
  if (!fromEngine(e)) return;
  if (process.platform !== "win32") return;
  try { setStartWithWindows(!!on); }
  catch (err) { console.error("etiuda: start with Windows could not be changed - " + err.message); }
});
ipcMain.on("etiuda:login-item-state", (e) => {
  if (!fromEngine(e)) { e.returnValue = null; return; }
  if (process.platform !== "win32") { e.returnValue = { openAtLogin: false }; return; }
  let openAtLogin = false;
  try {
    if (typeof app.getLoginItemSettings === "function") {
      const got = app.getLoginItemSettings();
      openAtLogin = loginItemOn(got) || loginItemOn(got, legacyLoginName());
    }
  } catch { /* Windows did not answer */ }
  e.returnValue = { openAtLogin: openAtLogin };
});
ipcMain.on("etiuda:close-policy-set", (e, quit) => {
  if (!fromEngine(e)) return;
  storeQuitOnClose(!!quit);
});
ipcMain.on("etiuda:tray-notes-set", (e, on) => {
  if (!fromEngine(e)) return;
  setTrayNotes(!!on);
});
ipcMain.on("etiuda:tray-notes-state", (e) => {
  if (!fromEngine(e)) { e.returnValue = null; return; }
  e.returnValue = { on: notesOn() };
});
ipcMain.on("etiuda:notify", (e, opts) => {
  if (!fromEngine(e)) return;
  if (!notesOn()) return;
  const win = deskWindow();
  if (win && !win.isDestroyed() && typeof win.isFocused === "function" && win.isFocused() && (typeof win.isVisible !== "function" || win.isVisible()) && (typeof win.isMinimized !== "function" || !win.isMinimized())) return;
  const icon = trayIcon();
  showNotification({
    electron: { Notification: Notification, app: app },
    appId: APP_IDS.desktop,
    title: String(opts && opts.title || ""),
    body: String(opts && opts.body || ""),
    icon: icon,
    onClick: () => {
      showDesk(win);
      if (opts && opts.target && win && win.webContents && typeof win.webContents.send === "function") {
        try { win.webContents.send("etiuda:tray-go", String(opts.target)); } catch {}
      }
    }
  });
});

ipcMain.on("etiuda:host", (e) => {
  if (!fromEngine(e)) {
    e.returnValue = { platform: process.platform, backdrop: null, maximized: false,
                      catalogFolder: "", catalogFile: "", catalogIn: "", catalogBuiltIn: false };
    return;
  }
  const win = BrowserWindow.fromWebContents(e.sender);
  const senderId = e.sender.id;
  if (!sessionHeld.has(senderId)) {
    const sm = new Map();
    sessionHeld.set(senderId, sm);
    e.sender.once("destroyed", () => sessionHeld.delete(senderId));
    if (pendingSavedTabs === null) pendingSavedTabs = readSavedTabs();
    if (pendingSavedTabs) {
      sm.set("eSessionTabs", pendingSavedTabs);
      pendingSavedTabs = "";
    }
  }
  const sessionEntries = sessionHeld.has(senderId) ? Object.fromEntries(sessionHeld.get(senderId)) : {};
  e.returnValue = {
    platform: process.platform,
    backdrop: hostBackdrop(),
    maximized: !!(win && win.isMaximized()),
    session: sessionEntries,
    // Whether the window is on screen yet, or never will be: a first load is answered before ready-to-show.
    shown: !!(win && (win.etiudaShown || (typeof win.isVisible === "function" && win.isVisible()))),
    /* Which file is loaded and where it was found, because the page cannot look: About prints
       them and the offer's line names the folder it accepts from. The preload asks for the
       catalog first, so catalogFrom is already the answer by the time this is read. */
    catalogFolder: catalogFolder(),
    catalogFile: catalogFrom ? path.basename(catalogFrom) : "",
    catalogIn: folderShown(catalogFrom),
    catalogBuiltIn: isBuiltIn(catalogFrom),
    catalogMtime: catalogMtime(),
    /* WHETHER THIS LOAD'S CATALOG IS THE FILE SOMEBODY DOUBLE-CLICKED, which the page cannot
       tell from the folder's own newest: an explicit open is answered even when a refusal was
       remembered for that file or it is already what is loaded. */
    openedWith: !!openedWith && catalogFrom === openedWith,
    openedRefused: openedRefused,
    // An edition in the folder that waits for a newer Etiuda, {name, version}, or null.
    catalogNewer: catalogWaitNewer ? { name: catalogWaitNewer.name, version: catalogWaitNewer.version } : null,
    /* THIS LOAD IS THE SHELL'S OWN RELOAD after the page stopped, answered once: the page then
       holds its first frame until boot has ended, as it does for a reload it asks for itself. */
    recovering: recovering.delete(e.sender.id),
    // The last time this page stopped and why, which Maintenance shows after the reload.
    lostPage: e.sender.etiudaLost || null,
    deskFile: deskFile(),
    home: os.homedir(),
    accent: hostAccent(),
  };
  openedRefused = null;
  catalogNewerSaid = newerKey();
});

/* THE MARKER LINE'S ONE SHAPE, and the engine reads the same one. \x5d rather than a literal
   closing bracket: the trap is written out at V2_MARKER_RE in src/modules/catalog-v2.js. */
const EC_MARKER = /^\[(step|alt)(:[^\x5d]*)?\x5d$/;
/* A MACRO IS A BODY BLOCK, which is totalMacroCount's rule in the page: a plain body is one
   block, and a steps or alts body is what its markers divide it into. Markers are dividers, so
   the count is the paragraphs of each stretch between them, and whatever stands before the
   first marker is not in the body at all - the engine's v2Unmark drops it. */
function ecBlocks(text, shape) {
  const s = String(text || "");
  if (!s.trim()) return 0;
  if (shape !== "steps" && shape !== "alts") return 1;
  const paras = x => x.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).length;
  let n = 0, cur = [], started = false;
  s.split("\n").forEach(l => {
    if (EC_MARKER.test(l.trim())) { if (started) n += paras(cur.join("\n")); cur = []; started = true; return; }
    cur.push(l);
  });
  return started ? n + paras(cur.join("\n")) : n;
}
/* THE COUNTS A ROW SAYS ABOUT A FILE, read here so that one list can say the same things about a
   file on disk as it says about the catalog in use. THESE RULES AND THE PAGE'S MUST NOT DRIFT:
   macros are body blocks, by totalMacroCount's rule above; intents are the request tags, which
   is the length of the intents array the offer dialog counts; categories are the shelf ids, the
   keys the runtime files a card under. Counted in the catalog's PRIMARY language, which the
   format makes safe: a card dividing differently in another language is refused at load. */
/* Whatever the page sent, reduced to codes and whole numbers. Anything that is not a usable
   code is dropped here rather than forwarded into a document that leaves this machine. */
/* Per card, the languages that card was copied in, reduced the same way as the desk's
   language totals. A card sent without the field is returned as it arrived. */
function cardCounts(list) {
  if (!Array.isArray(list)) return [];
  return list.map(card => {
    if (!card || typeof card !== "object" || Array.isArray(card) || !Object.prototype.hasOwnProperty.call(card, "langs")) return card;
    const kept = langCounts(card.langs);
    const langs = {};
    Object.keys(kept).forEach(code => { if ((kept[code] | 0) > 0) langs[code] = kept[code] | 0; });
    const out = {};
    Object.keys(card).forEach(k => { if (k !== "langs") out[k] = card[k]; });
    if (Object.keys(langs).length) out.langs = langs;
    return out;
  });
}
function langCounts(v) {
  const out = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    Object.keys(v).forEach(code => {
      if (code && !/[\s:]/.test(code) && (v[code] | 0)) out[code] = v[code] | 0;
    });
  }
  return out;
}
function ecCounts(data) {
  const langs = Array.isArray(data.langs) ? data.langs : [];
  const lang = String((langs[0] || {}).code || "") || "en";
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const requests = tags.filter(t => t && t.kind === "request");
  const shelves = {};
  tags.forEach(t => { if (t && t.kind === "shelf" && t.id) shelves[String(t.id)] = 1; });
  const cards = Array.isArray(data.cards) ? data.cards : [];
  /* BOARD 505'S AWAITING CLASS, counted here on the file the way the page counts it on the
     catalog in use: one entry per language declared past the primary, holding the cards whose
     body carries no text in it. The file keys a body by CODE and so does the runtime, so every
     declared language is counted whether or not this build has grammar for it. */
  const awaiting = langs.slice(1)
    .map(l => String((l || {}).code || ""))
    .filter(Boolean)
    .map(code => ({ code: code,
                    n: cards.filter(c => !String(((c && c.body) || {})[code] || "").trim()).length }))
    .filter(a => a.n > 0);
  return {
    macros: cards.reduce((n, c) => n + ecBlocks(((c && c.body) || {})[lang], c && c.bodyShape), 0),
    intents: requests.some(t => String((t.clause || {})[lang] || "")) ? requests.length : 0,
    cats: Object.keys(shelves).length,
    awaiting: awaiting,
  };
}

/* WHAT THE FOLDER HOLDS, for the Library's list: a person who declined the offer has somewhere
   to go back to. Names, edit times, the catalog's own EDITION and its five counts, never
   contents,
   and the page asks for a file by NAME alone - the join happens here, against the folder in
   force, so nothing the renderer says can address a file outside it. Count and edition cost a
   read and a parse of every .ec: -1 and "" say the file would not read as a catalog, and the row
   then shows what it does know rather than a nought that would be a lie. `sample` is the page's
   only way to know which row is the one Etiuda came with, and it is ordered here as it is read,
   so the list and the next launch cannot disagree about which file is first. */
/* `id` is what the page needs to tell whether a file IS the catalog in use, by the identity rule
   of board 431. It travels with the listing because the alternative is the page reading every
   file in the folder each time it paints one list. */
/* A DESK'S OWN FILE IS LISTED ONLY WHERE IT IS GENUINE: it sits in the folder named for the desk that wrote it,
   that desk's id is the one its key makes, and its signature verifies under the desk prefix. Anything else in
   desks/ is somebody's file in the wrong place and is not listed. Read again only when its date or size moves. */
const ecFactsRead = new Map();                  // path -> [mtime|size, the facts, or null]
/* SHA-256 of a document's signed bytes, the engine's pin: the same function on both sides of a comparison. */
function signedSha(data) { return "sha256:" + crypto.createHash("sha256").update(signedBytesOf(data)).digest("hex"); }
/* Whether a catalog read from desks/<folder>/ is that desk's own, by the rule above. Studio reads desk files through
   this function, sliced from its pinned copy of this file, so it has one statement. */
function deskFileGenuine(data, folder) {
  const d = data && data.desk, sig = data && data.sig;
  try {
    return !!folder && !!d && typeof d === "object" && d.id === folder && /^k-[0-9a-f]{16}$/.test(d.id)
      && /^[0-9a-f]{64}$/.test(String(d.key)) && branchIdOf(d.key) === d.id
      && !!sig && sig.alg === "Ed25519" && sig.keyId === d.id && /^[0-9a-f]{128}$/.test(String(sig.value))
      && crypto.verify(null, branchSignedBytes(data), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(d.key, "hex")]),
        format: "der", type: "spki" }), Buffer.from(sig.value, "hex"));
  } catch { return false; }
}
/* A COLLEAGUE'S FILE IS HANDED ON UNASKED ONLY WHERE ITS DESK IS ON THE TEAM: on the roster this desk kept for a team whose
   lead it pins, at the epoch it accepted, never the team file now in the folder. Where no lead is pinned, every desk is.
   Where a lead is pinned and no roster is kept, only this desk is. This desk itself always is. Returns the test for a
   desk id, read once a listing. */
function deskRoster() {
  heedTeam();
  const kept = Object.keys(teamPins).filter(t => teamRoster[t]).map(t => teamRoster[t].desks);
  const me = deskBranch ? branchIdOf(deskBranch.sign.pub) : "";
  if (!Object.keys(teamPins).length) return () => true;
  return id => id === me || kept.some(ids => ids.indexOf(id) >= 0);
}
/* The note an asked desk file carries when its writer is not on that roster, and "" where the file is not a desk's or
   the writer is. One value: the desk cannot know "never" for sure. */
function rosterNoteOf(data) {
  const desk = data && data.desk;
  const id = desk && typeof desk === "object" ? String(desk.id || "") : "";
  if (!id || deskRoster()(id)) return "";
  return "off-roster";
}
function rosterNoteText(text) {
  try { return rosterNoteOf(catalogRead(String(text || "")).data); }
  catch { return ""; }
}
/* What a listing says about a catalog file, or null where it is not one. `deskFolder` is the folder a desk's file
   sits in, and then `deskOk` says whether the file is genuine. */
function ecFacts(file, deskFolder) {
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  const stamp = Math.round(st.mtimeMs) + "|" + st.size;
  const had = ecFactsRead.get(file);
  if (had && had[0] === stamp) return had[1];
  /* A read that fails (another program holds the file) says nothing about the file, so it is not remembered: only a
     verdict on the text is. */
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return null; }
  let out = null;
  try {
    const { data } = catalogRead(text);
    if (isV2(data) && Array.isArray(data.cards)) {
      // A colleague's file is that desk's to keep.
      if (!deskFolder) historySoon(file, text);
      const n = ecCounts(data), d = data.desk;
      out = { mtime: Math.round(st.mtimeMs), cards: data.cards.length, edition: data.date != null ? String(data.date) : "",
              macros: n.macros, intents: n.intents, cats: n.cats, awaiting: n.awaiting, id: data.id != null ? String(data.id) : "",
              rev: +data.rev || 0, grew: ecGrew(data), sha: signedSha(data), deskName: d && typeof d.name === "string" ? d.name : "",
              deskOk: deskFileGenuine(data, deskFolder),
              genuine: !!(pinnedLeadPubs().length ? catalogLeadOk(data) : catalogSigValid(data)) };
    }
  } catch (e) {
    /* A key that has not arrived is not a verdict: the row already shown stays, and the next read tries the file again. */
    if (e && e.sealWait) return had ? had[1] : null;
  }
  ecFactsRead.set(file, [stamp, out]);
  return out;
}
/* True while the outbox owes the share this file of the folder team's mirror. */
function mirrorOwed(file) {
  const mirror = folderMirrorHere();
  if (!mirror) return false;
  const rel = path.relative(mirror, path.resolve(file));
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return false;
  try { return FolderSyncer().owedAt(mirror, rel.split(path.sep).join("/")); } catch { return false; }
}
function deskRowOf(file, folder) {
  const x = ecFacts(file, folder);
  if (!x || !x.deskOk) return null;
  const me = branchIdentity(false);
  let reached = true;
  if (me && folder === me.id) {
    const relay = relayHere();
    if (relay) {
      const ch = relayChannel; /* a listing never starts a channel: with none, the row is kept */
      const st = ch && ch.program && ch.program.state();
      const relKey = RelayChannel().pathKey("desks/" + folder + "/" + path.basename(file));
      let fileSha = "";
      try { fileSha = sha256Hex(fs.readFileSync(file)); } catch {}
      const sent = st && st.sent && st.sent[relKey];
      reached = !!(sent && !sent.del && !sent.owe && sent.sha === fileSha); /* plant:w1-relay-reached */
    } else {
      reached = !heldBranch.has(path.basename(file, ".ec")); /* plant:w1-folder-reached */
      if (reached && mirrorOwed(file)) reached = false; /* plant:outbox-row-kept */
    }
  }
  return { name: path.basename(file), mtime: x.mtime, cards: x.cards, edition: x.edition, macros: x.macros, intents: x.intents, cats: x.cats,
           awaiting: x.awaiting, sample: false, id: x.id, builtIn: false, rev: x.rev, grew: x.grew, sha: x.sha,
           genuine: true, reached: reached, relay: !!relayHere(), desk: { id: folder, name: x.deskName } };
}
function deskRows() {
  const root = catalogFolder();
  if (!folderAnswers(root)) return [];
  let ids = [];
  try { ids = fs.readdirSync(path.join(root, "desks")); } catch { return []; }
  const onTeam = deskRoster();
  return ids.filter(n => /^k-[0-9a-f]{16}$/.test(n) && onTeam(n)).sort().reduce((out, n) =>
    out.concat(ecFilesIn(path.join(root, "desks", n)).map(f => deskRowOf(f, n)).filter(Boolean)), []);
}
/* What a file says it grew from, or null: the three fields and nothing else. */
function ecGrew(data) {
  const g = data && data.grew;
  return g && typeof g === "object" && typeof g.id === "string" ? { id: g.id, rev: +g.rev || 0, sha: String(g.sha || "") } : null;
}
/* One row per catalog id. A genuine edition beats one that does not verify. Among those that
   agree, the higher rev wins, and an equal rev keeps the name that is not a conflict copy of
   another, else the earlier name. An id that did not parse keeps its own row. `genuine` is how
   the choice is made and is not a field of the row the page is sent. */
function isConflictName(name) {
  const n = path.basename(String(name || ""));
  const ext = path.extname(n);
  const stem = ext ? n.slice(0, -ext.length) : n;
  if (/ \(\d+\)$/.test(stem)) return true;
  if (/ \(.*conflicted copy.*\)$/i.test(stem)) return true;
  if (/\.sync-conflict-/.test(n)) return true;
  if (/-(?!V\d+$)[A-Z0-9][A-Z0-9-]{2,62}$/.test(stem)) return true;
  if (/_conf\(\d+\)$/i.test(stem)) return true;
  return false;
}
function conflictNamedAmong(name, names) {
  for (let i = 0; i < names.length; i++) {
    if (names[i] !== name && conflictSiblingName(names[i], name)) return true;
  }
  return false;
}
function betterEdition(a, b, names) {
  const ag = !!a.genuine, bg = !!b.genuine;
  if (ag !== bg) return ag;
  const ar = +a.rev || 0, br = +b.rev || 0;
  if (ar !== br) return ar > br;
  const ac = conflictNamedAmong(a.name, names) || isConflictName(a.name);
  const bc = conflictNamedAmong(b.name, names) || isConflictName(b.name);
  if (ac !== bc) return !ac;
  if (a.name !== b.name) return a.name < b.name;
  return false;
}
function collapseEditions(rows) {
  const byId = new Map();
  rows.forEach((row, i) => {
    const id = row && row.id != null ? String(row.id) : "";
    if (!id) return;
    const scope = (row.desk && row.desk.id) ? "d:" + row.desk.id : "r";
    const key = scope + "|" + id;
    if (!byId.has(key)) byId.set(key, []);
    byId.get(key).push(i);
  });
  const drop = new Set();
  for (const idxs of byId.values()) {
    if (idxs.length < 2) continue;
    const names = idxs.map(i => rows[i].name);
    const hasConflict = names.some(n => conflictNamedAmong(n, names) || isConflictName(n));
    if (!hasConflict) continue; /* plant:f3-conflict-only */
    let keep = idxs[0];
    for (let n = 1; n < idxs.length; n++) {
      if (betterEdition(rows[idxs[n]], rows[keep], names)) keep = idxs[n];
    }
    idxs.forEach(i => { if (i !== keep) drop.add(i); });
  }
  return rows.filter((row, i) => !drop.has(i));
}
function stripGenuine(row) {
  if (!row || !Object.prototype.hasOwnProperty.call(row, "genuine")) return row;
  const copy = Object.assign({}, row);
  delete copy.genuine;
  return copy;
}
function listingRows() {
  const onRelay = !!relayHere();
  const folder = sampleLast(ecFilesIn(catalogFolder()).concat(builtInFiles())).map(f => {
    let mt = 0;
    try { mt = Math.round(fs.statSync(f).mtimeMs); } catch { /* renamed away under the listing */ }
    const x = refusedByEngine(f) ? null : ecFacts(f, "");
    return { name: path.basename(f), mtime: mt, cards: x ? x.cards : -1, edition: x ? x.edition : "",
             macros: x ? x.macros : -1, intents: x ? x.intents : -1, cats: x ? x.cats : -1, awaiting: x ? x.awaiting : [],
             sample: isTheSample(f), id: x ? x.id : "", rev: x ? x.rev : 0, grew: x ? x.grew : null, sha: x ? x.sha : "",
             genuine: !!(x && x.genuine), relay: onRelay,
             // The copy Etiuda ships, rather than a folder's own file of any name.
             builtIn: path.dirname(f) === BUILT_IN_DIR };
  });
  let rows = folder.concat(deskRows());
  rows = collapseEditions(rows); /* plant:f3-one-row */
  return rows.map(stripGenuine);
}
ipcMain.handle("etiuda:catalog-files", (e) => (fromEngine(e) ? listingRows() : []));
/* The page asks. The files stay until the next start: this process still holds them. The catalog
   folder is the setting in the desk file, not the live mirror, which can point somewhere else. */
/* The new process asks for the single-instance lock. Releasing it first is what lets that
   process get it; the marker waits if the new process never arrives. */
function relaunchAfterReset() {
  setImmediate(() => {
    try {
      if (typeof app.releaseSingleInstanceLock === "function") app.releaseSingleInstanceLock();
      if (typeof app.relaunch === "function") app.relaunch();
      if (typeof app.quit === "function") app.quit();
      else if (typeof app.exit === "function") app.exit(0);
    } catch (err) { /* the marker still waits for the next start */ }
  });
}
ipcMain.handle("etiuda:desk-reset", (e) => {
  if (!fromEngine(e)) return { ok: false, reason: "refused" };
  const userData = app.getPath("userData");
  let catalogSetting = "";
  try {
    const env = JSON.parse(fs.readFileSync(deskFile(), "utf8"));
    const keys = typeof env.keys === "string" ? JSON.parse(env.keys || "{}") : (env.keys || {});
    catalogSetting = String(keys[CATALOG_FOLDER_KEY] || "");
  } catch (err) { catalogSetting = ""; }
  const staged = stageReset({ userData: userData, catalogSetting: catalogSetting, defaultCatalog: defaultCatalogFolder() });
  if (staged && staged.ok) {
    try { setStartWithWindows(false); } catch (err) { /* start with Windows could not be changed */ }
    relaunchAfterReset();
  }
  return staged;
});
ipcMain.handle("etiuda:reset-retry", (e) => {
  if (!fromEngine(e)) return { ok: false, reason: "refused" };
  const result = retryPendingReset({ userData: app.getPath("userData"), holdsLock: true });
  if (result && result.ok) {
    resetNotice = null;
    relaunchAfterReset();
  }
  return result || { ok: false };
});
ipcMain.handle("etiuda:reset-stop", (e) => {
  if (!fromEngine(e)) return { ok: false, reason: "refused" };
  resetNotice = null;
  return stopPendingReset({ userData: app.getPath("userData"), holdsLock: true });
});
/* THE LISTING IS SENT, not only asked for: once at boot, and again whenever the set of files in it, by place, id,
   edition and hash, changes, so a rename or a newer edition under another name reaches the page, which decides what
   it means. A date moving alone is no change, and nothing is sent while the folder does not answer. This is not
   etiuda:catalog-file, whose one meaning is a catalog's text to offer. */
let listingSent = "";
function sendListing(win, force) {
  if (!win || win.isDestroyed() || !folderAnswers(catalogFolder())) return;
  const rows = listingRows();
  const key = JSON.stringify(rows.map(r => [r.desk ? r.desk.id : r.builtIn ? "~" : "", r.name, r.id, r.rev, r.sha]).sort());
  try { syncJumpList(); } catch { /* jump list optional */ }
  if (!force && key === listingSent) return;
  listingSent = key;
  win.webContents.send("etiuda:catalog-listing", rows);
}
/* A rev already handed on for one desk file is not replaced by a lower one. Equal is not a raise. */
function keepReadRev(id, rev) {
  if (!(rev > (readRevs[id] || 0))) return;
  readRevs[id] = rev;
  persistDeskEnvelope();
}
/* `desk` names a colleague's folder under desks/, and its file is handed where nobody asked only where the listing would
   list it; asked for, a genuine file whose desk is off the team's roster is handed with `notOnTeam` set.
   A rev below the highest already handed on for that file's id is not handed on unless the agent asked for
   that file; an asked read moves no mark (`look`), which waits for the yes. A file whose id does not begin with
   that folder's desk id sets no mark, so one desk's signed file cannot raise another's. A file of the folder itself
   is held to the catalog mark where nobody asked, and to the lead's key where the page means to offer it unasked. */
function readRevFloor(text, who, look) {
  let doc = null;
  try { doc = JSON.parse(String(text || "")); } catch { return ""; }
  if (!doc || typeof doc !== "object" || doc.kind !== "etiuda-catalog") return "";
  const id = typeof doc.id === "string" ? doc.id : "";
  const rev = +doc.rev;
  if (!/^k-[0-9a-f]{16}-[0-9a-f]{8}$/.test(id) || !Number.isInteger(rev) || rev < 1) return "";
  if (typeof who !== "string" || !who || !id.startsWith(who + "-")) return "";
  const had = readRevs[id] || 0;
  if (rev < had) return "below";
  if (look) return "above";
  keepReadRev(id, rev);
  return "kept";
}
/* Why an asked read of a sealed file stops, or "" where the file is not a blocked envelope. An unasked read stays the text catalogTextOf hands on. */
function sealBlockedWhy(text) {
  let data = null;
  try { data = catalogPayload(text).data; } catch { return ""; }
  if (!data || data.kind !== SEALED_KIND) return "";
  if (teamKeys[data.team] && teamKeys[data.team][data.epoch]) return "";
  return sealVerdict(data) === "wait" ? "sealed-wait" : "sealed";
}
/* A stable reason for the page, never the raw message and never a path. */
function readFailWhy(err) {
  const m = String(err && err.message || "");
  if (m === "the catalog folder is not answering") return "not-answering";
  if (m === "not a desk's own file") return "not-desk-file";
  if (m === "its desk is not on the team's roster") return "off-roster";
  if (err && err.sealWait) return "sealed-wait";
  if (m.indexOf("sealed for team ") === 0 || m === "an envelope sealed inside another") return "sealed";
  return "unreadable";
}
/* The operating system's own code, where the read named one. A message is never copied: it can hold a path. */
function readOsCode(err) {
  const c = err && typeof err.code === "string" ? err.code : "";
  return /^[A-Z][A-Z0-9]{1,15}$/.test(c) ? c : "";
}
/* A read the page means to offer unasked hands on, once a lead is pinned, only a file that lead signed. */
function unsolicitedLeadText(text) {
  if (!pinnedLeadPubs().length) return true;
  const doc = catalogDocIn(text);
  if (!doc || doc.kind !== "etiuda-catalog") return true;
  return !!catalogLeadOk(doc);
}
ipcMain.handle("etiuda:catalog-read", (e, name, desk, asked, offer) => {
  if (!fromEngine(e)) return null;
  const base = String(name || ""), who = desk == null ? "" : String(desk);
  if (!base || base !== path.basename(base) || !/\.ec$/i.test(base)) return null;
  if (who && !/^k-[0-9a-f]{16}$/.test(who)) return null;
  const file = who ? path.join(catalogFolder(), "desks", who, base) : (catalogFileNamed(base) || path.join(catalogFolder(), base));
  try {
    if (!fileAnswers(file) || (who && !folderAnswers(catalogFolder()))) throw new Error("the catalog folder is not answering");
    if (who && !(ecFacts(file, who) || {}).deskOk) throw new Error("not a desk's own file");
    const offTeam = !!who && !deskRoster()(who);
    if (offTeam && !asked) throw new Error("its desk is not on the team's roster");
    const raw = fs.readFileSync(file, "utf8");
    if (asked) {
      const blocked = sealBlockedWhy(raw);
      if (blocked) {
        console.error("etiuda: " + file + " could not be read - " + blocked);
        return { name: base, text: "", why: blocked };
      }
    }
    const text = catalogTextOf(raw);
    if (who) {
      if (readRevFloor(text, who, !!asked) === "below" && !asked) return { name: base, text: "" };
    } else if (!asked && (belowCatalogRev(text) || (offer && !unsolicitedLeadText(text)))) return { name: base, text: "" };
    if (asked) handAsked(text, who);
    if (text && (asked || offer)) noteHanded(text, who ? "desk-file" : (asked ? "opened" : "folder"));
    /* A desk file copied into the folder root is read as a folder file, so the note comes from the file's own desk
       field there, as a double-click, a drop and Import take it: an asked read of a removed member's file says so. */
    const note = offTeam ? "off-roster" : (!who && asked ? rosterNoteText(text) : "");
    return note ? { name: base, text: text, notOnTeam: note } : { name: base, text: text };
  }
  catch (err) {
    console.error("etiuda: " + file + " could not be read - " + err.message);
    const code = readOsCode(err);
    const out = { name: base, text: "", why: readFailWhy(err) };
    if (code) out.code = code;
    return out; /* plant:catalog-read-why */
  }
});
/* THE RING, the text of V2_RING_FILE in the catalog folder or "" where there is none: the page
   reads it with the engine's own v2RingRead, and a ring only adds trust, so absent is not a
   fault. On a desk with a lead pinned it adds none: the page's key there is the pin's (etiuda:catalog-leads),
   and the ring only names another key. Bounded like a request, since the share is anybody's to write. On the relay
   it is the ring inside the signed team file, and the file is not read (relayRingAt). */
const RING_NAME = "etiuda-ring.json";
ipcMain.handle("etiuda:catalog-ring", (e) => {
  if (!fromEngine(e) || !folderAnswers(catalogFolder())) return "";
  heedTeam();
  const relay = relayRingAt(catalogFolder());
  if (relay !== undefined) return relay ? JSON.stringify(relay) : "";
  let text = "";
  try {
    const file = path.join(catalogFolder(), RING_NAME);
    if (fs.statSync(file).size > 65536) { console.error("etiuda: " + file + " is larger than any ring, so it is not read"); return ""; }
    text = fs.readFileSync(file, "utf8");
  } catch { /* no ring, which is the ordinary case */ }
  return text;
});
/* THE LEADS THIS PAGE VERIFIES AGAINST: the keys catalogLeadOk uses, the team file heeded first. A whole
   team file narrows them to that team's pin, or one key that verifies nothing where it is not pinned, so
   another team's pin and the ring are not read for it. [] where no lead is pinned, and the ring decides. */
ipcMain.handle("etiuda:catalog-leads", (e) => {
  if (!fromEngine(e)) return [];
  heedTeam();
  return leadsForPage();
});
ipcMain.handle("etiuda:stats-write", (e, text, askId) => {
  if (!fromEngine(e)) return { ok: false };
  return writeStatsAnswer(String(text || ""), typeof askId === "string" ? askId : "");
});
/* Closing flushes the counts the page still holds, past the two-minute pace. A stranger is refused.
   The close reason is its own, and it does not take an ask that is still waiting. */
ipcMain.handle("etiuda:stats-close", (e, text) => {
  if (!fromEngine(e)) return { ok: false };
  return writeStatsAnswer(String(text || ""), "", "close");
});
/* The desk's branch: its public identity, and the write of its own file. See writeBranch. */
ipcMain.handle("etiuda:branch-identity", (e, make) => (fromEngine(e) ? branchIdentity(make === false ? false : true) : null));
ipcMain.handle("etiuda:branch-write", (e, stem, text) => (fromEngine(e) ? writeBranch(stem, text) : { ok: false }));
/* The desk's earlier versions: the list, one version's catalog, and putting one back. A version is named by its hash and
   the file it was kept for, and only a pair the history holds is answered. */
ipcMain.handle("etiuda:history-list", (e) => (fromEngine(e) ? historyView() : []));
ipcMain.handle("etiuda:history-read", (e, sha, file) => (fromEngine(e) ? historyOpen(sha, file) : null));
ipcMain.handle("etiuda:history-put", (e, sha, file) => (fromEngine(e) ? historyPutBack(sha, file) : { ok: false }));
ipcMain.handle("etiuda:shared-read", (e, name, pin) => (fromEngine(e) ? sharedRead(name, pin) : null));
ipcMain.handle("etiuda:shared-write", (e, name, text, sha, create) =>
  (fromEngine(e) ? sharedWrite(name, text, sha, create === true) : { ok: false }));
// "seen", "forget", "leave", "lapse-seen", "fork-seen" and "stranded-seen" name a team, "lapse-seen" with the step its notice showed, "read" and "invite" carry an invitation's text, and the others name a file; "invite"
// adds the check code the agent typed, which only a folder invitation needs, and "leads" answers the pinned leads alone. "held" is a link waiting here,
// "link" is the yes to that link and "link-no" lets it go. The link's text stays in this process.
// "content" answers the lead's switch and the private marks, "content-said" names the team and the switch's `at` shown, "private" a catalog id and "on" or "off".
ipcMain.handle("etiuda:team-join", (e, op, file, name, check) => (!fromEngine(e) ? null
  : op === "leads" ? { leads: leadsView() }
  : op === "content" ? contentView() : op === "content-said" ? contentSaid(file, name) : op === "private" ? markPrivate(file, name === "on")
  : op === "ask" ? askJoin(file, name) : op === "cancel" ? cancelJoin() : op === "seen" ? leadSeen(file)
  : op === "lapse-seen" ? lapseSeen(file, name) : op === "fork-seen" ? forkDismissed(file) : op === "stranded-seen" ? strandedDismissed(file)
  : op === "forget" ? forgetLead(file) : op === "leave" ? forgetLead(file, true) : op === "read" ? readInvite(file) : op === "invite" ? takeInvite(file, name, check)
  : op === "pick-moved-folder" ? pickMovedFolder(file, name)
  : op === "held" ? heldLinkAnswer() : op === "link" ? takeHeldLink(name) : op === "link-no" ? declineHeldLink() : joinView())); /* plant:link-no */

/* The engine calls no OS API, so the folder picker is the shell's. The CAPTION comes from the
   page: the shell has no t(), and a dialog captioned in two languages at once is captioned in
   neither. Answers the chosen folder, or "" where the person closed the dialog; writing the
   setting is the engine's, through the ordinary desk key the search order above reads. */
ipcMain.handle("etiuda:pick-catalog-folder", async (e, title) => {
  if (!fromEngine(e)) return "";
  const win = BrowserWindow.fromWebContents(e.sender);
  const opts = {
    title: String(title || "Etiuda").slice(0, 120),
    defaultPath: shareFolderShown(),
    properties: ["openDirectory", "createDirectory"],
  };
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  return (!r.canceled && r.filePaths && r.filePaths[0]) ? r.filePaths[0] : "";
});

/* IMPORT CATALOG'S OWN DIALOG, the shell's for the same reason the folder picker above is: the
   engine calls no OS API. The file is READ HERE and handed over as text, so the page is given
   what it is given and never a path of its own; the browser build keeps its File System Access
   picker, which is the route that yields a watchable handle and has no meaning here, because
   this shell already watches the folder. `.js` and `.json` are in the filter beside `.ec` since
   the engine's reader takes all three, and a filter narrower than the reader hides files it
   would have accepted. Null where the person closed the dialog, which is not a failure. */
ipcMain.handle("etiuda:pick-catalog-file", async (e, title, label) => {
  if (!fromEngine(e)) return null;
  const win = BrowserWindow.fromWebContents(e.sender);
  const opts = {
    title: String(title || "Etiuda").slice(0, 120),
    defaultPath: catalogFolder(),
    filters: [{ name: String(label || "Etiuda catalog").slice(0, 60), extensions: ["ec", "js", "json"] }],
    properties: ["openFile"],
  };
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  const file = (!r.canceled && r.filePaths && r.filePaths[0]) ? r.filePaths[0] : "";
  if (!file) return null;
  const name = path.basename(file);
  try {
    const text = catalogTextOf(fs.readFileSync(file, "utf8"));
    historySoon(file, text);
    const json = catalogTextOf(text);
    if (json) {
      noteHanded(json, "opened");
      recordRecentCatalog(file);
    }
    const note = rosterNoteText(json);
    return note ? { name: name, text: json, notOnTeam: note } : { name: name, text: json };
  }
  catch (err) {
    console.error("etiuda: " + file + " could not be read - " + err.message);
    const code = readOsCode(err);
    const out = { name: name, text: "", why: "unreadable" };
    if (code) out.code = code;
    return out;
  }
});

/* EXPORT'S OWN DIALOG, the shell's for Import's reason, in two calls: the page writes the catalog
   only once the choice is made. The path stays here and the page is told the name; the write goes
   to this window's last choice, once. A name typed without the extension is given it, since the
   folder lists only that kind of file.
   ETIUDA_TEST_SAVE_AS is the harness's answer to the dialog: a folder, the offered name inside it. */
let savePending = null;
ipcMain.handle("etiuda:choose-catalog-save", async (e, title, name, label) => {
  if (!fromEngine(e)) return null;
  savePending = null;
  const base = path.basename(String(name || "")) || "Etiuda catalog.ec";
  const ext = path.extname(base).slice(1) || "ec";
  const win = BrowserWindow.fromWebContents(e.sender);
  const opts = {
    title: String(title || "Etiuda").slice(0, 120),
    defaultPath: path.join(app.getPath("documents"), base),
    filters: [{ name: String(label || "Etiuda catalog").slice(0, 60), extensions: [ext] }],
  };
  const r = TEST_DOOR && process.env.ETIUDA_TEST_SAVE_AS
    ? { canceled: false, filePath: path.join(process.env.ETIUDA_TEST_SAVE_AS, base) }
    : win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
  if (r.canceled || !r.filePath) return null;
  let file = r.filePath;
  if (path.extname(file).toLowerCase() !== "." + ext.toLowerCase()) file += "." + ext;
  savePending = { id: e.sender.id, file: file };
  return { name: path.basename(file) };
});
/* An export made from a catalog this desk opened from an envelope (`from`, the stored catalog's id and pin) stays sealed,
   for the team that sealed that edition, under the newest key the desk keeps for it; null where it cannot be sealed.
   Where it could be and that team's file says exportsSealed false, the lead has let exports out in the clear. */
function exportText(text, from) {
  const id = from && typeof from === "object" ? String(from.id || "") : "";
  if (!id || !teamOpened.has(id)) return text;
  const pin = String(from.sha || "");
  const seal = PIN_RE.test(pin) ? sealFor(id, pin, sharedFolderForWrite()) : null;
  if (!seal) return null;
  return seal.plain ? text : JSON.stringify(sealCatalog(seal.key, seal.team, seal.epoch, text), null, 1) + "\n";
}
/* The bytes go to a temp file beside the choice and are renamed over it, so a failed write never
   leaves half a catalog under that name, and the answer says whether they landed. */
ipcMain.handle("etiuda:write-catalog-save", async (e, text, from) => {
  if (!fromEngine(e)) return null;
  const p = savePending;
  savePending = null;
  if (!p || p.id !== e.sender.id) return null;
  try {
    const out = exportText(String(text || ""), from);
    if (out === null) {
      console.error("etiuda: " + p.file + " was not written: it is a sealed team's catalog this desk cannot seal");
      return { name: path.basename(p.file), ok: false, sealed: true };
    }
    historyKeepFile(p.file);
    await writeReplacingAsync(p.file, out);
    historyKeep(p.file, out, true);
    return out === String(text || "") ? { name: path.basename(p.file), ok: true } : { name: path.basename(p.file), ok: true, sealed: true };
  } catch (err) {
    console.error("etiuda: " + p.file + " could not be written - " + err.message);
    return { name: path.basename(p.file), ok: false };
  }
});

/* A .ec DROPPED ON THE WINDOW: the renderer names a path, and this answers only an existing file
   with the extension the installer registers, through the double-click's own route. */
ipcMain.on("etiuda:offer-dropped", (e, file) => {
  if (!fromEngine(e)) return;
  const f = String(file || "");
  if (!/\.ec$/i.test(f)) return;
  try { if (!fs.statSync(f).isFile()) return; } catch { return; }
  offerFile(BrowserWindow.fromWebContents(e.sender), path.resolve(f));
});

/* The folder in force, opened in the file manager. No path from the renderer, but the setting
   is a desk key the page writes, so it may name a file, and openPath LAUNCHES a file: only a
   folder is opened. */
ipcMain.handle("etiuda:open-catalog-folder", async (e) => {
  if (!fromEngine(e)) return false;
  const dir = shareFolderShown(); /* plant:open-catalog-shared */
  // A folder that is not answering cannot be shown to be a folder, so it is not opened either.
  if (!folderAnswers(dir)) {
    console.error("etiuda: " + dir + " is not answering, so it is not opened");
    return { ok: false, why: "not-answering" }; /* plant:open-folder-why */
  }
  let isDir = false;
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* it may be a share that is down */ }
  try { isDir = fs.statSync(dir).isDirectory(); } catch { /* gone, or a share that is down */ }
  if (!isDir) { console.error("etiuda: " + dir + " is not a folder, so it is not opened"); return { ok: false, why: "not-a-folder" }; }
  const why = await shell.openPath(dir);
  if (why) { console.error("etiuda: " + dir + " could not be opened - " + why); return { ok: false, why: "could-not-open" }; }
  return true;
});

/* THE HASHES ARE THE BUILD'S, NOT THIS FILE'S READING OF WHAT IT IS ABOUT TO SERVE. Hashing the
   document here would hash a script edited into it along with the rest, and the policy would
   name the tamper. tools/build.mjs writes the list beside the artefact instead, so an inline
   script that arrived after the build is one the policy does not name and Chromium will not run.
   An unreadable pin is never answered with a permissive fallback: an open policy is one nobody
   sees. It is answered with the refusal document below instead, because the alternative -
   serving the engine under script-src 'none' - is a window with nothing in it and a reason in a
   console nobody has, and a fault a person cannot read is a fault nobody reports. */
const PIN = path.join(__dirname, "..", "engine", "etiuda.csp.json");

/** `{ hashes }` or `{ why }`, never both. The reason travels because the document that is
 *  served in place of the engine prints it: a refusal that cannot say what it read is the
 *  shape this was fixing. */
function readPin() {
  let why = "";
  try {
    const doc = JSON.parse(fs.readFileSync(PIN, "utf8"));
    if (doc && doc.kind === "etiuda-script-hashes" && Array.isArray(doc.hashes) && doc.hashes.length
        && doc.hashes.every(h => typeof h === "string" && /^'sha256-[A-Za-z0-9+/]+=*'$/.test(h)))
      return { hashes: doc.hashes };
    why = "it is not a hash pin this version can read";
  } catch (e) {
    why = e.message;
  }
  console.error("etiuda: the script hash pin could not be read - " + why);
  return { why: why };
}

/* No 'self' in script-src, and that is the point: in a browser the engine loads its catalog as
   a sibling script, and here the same file arrives as data through the preload. So the shell
   can refuse every script that is not one of the two the build hashed, and a catalog stays
   data. style-src is 'unsafe-inline' rather than hashed because the rescue banner builds its
   own styles inline, on purpose, so that it works when the stylesheet does not. */
function policyFor(hashes) {
  return [
    "default-src 'none'",
    "script-src " + hashes.join(" "),
    "style-src 'unsafe-inline'",
    "img-src data:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/* ---- the desk's sign-in (board 980, the person's own) ---------------------------------------------------------------------
   The person signs this desk in with their own account, with a team or without one: the system browser, a loopback on 127.0.0.1
   at a port the system picks, PKCE, a state, and a nonce bound to this desk's signing key. The ID token goes to the licence
   service's signin/desk, signed by the desk's key, and the answer is the person's sign-in code and, where a licence admits them,
   a seat certificate the service signed, which the desk keeps and writes as desks/<id>/seat.json. Nothing on the desk waits on
   any of it, and no token or name reaches a lead. */
/* Email is asked of nobody. Google is asked for it only if its hosted domain claim proves to need it, and then by this alone. */
const GOOGLE_HD_NEEDS_EMAIL = false; /* plant:scope-email */
/* THE PROVIDERS ARE CONFIGURATION: Etiuda's own registration with each, its client id, and the addresses and scopes Studio uses.
   A provider with no client id is not offered, so until the registrations exist nothing is drawn and nothing is sent. A desktop
   app is a public client, and clientSecret stays "" in this tree, which is public: Google's forum reports its token address
   refusing a Desktop client's code without client_secret, PKCE or not, so a package may carry Google's (signinPacked, below).
   Microsoft's profile scope gives the directory's object id, which the service keeps keyed. */
const SIGNIN_PROVIDERS = Object.freeze({
  microsoft: Object.freeze({ clientId: "", clientSecret: "", issuer: "https://login.microsoftonline.com/{tenantid}/v2.0",
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "openid profile offline_access", refreshScope: "openid profile offline_access",
    extra: Object.freeze({ response_mode: "query", prompt: "select_account" }) }),
  google: Object.freeze({ clientId: "", clientSecret: "", issuer: "https://accounts.google.com",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
    scope: GOOGLE_HD_NEEDS_EMAIL ? "openid email" : "openid", refreshScope: "", extra: Object.freeze({ prompt: "select_account" }) }),
});
const SIGNIN_TENANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNIN_CLIENT = /^[A-Za-z0-9][A-Za-z0-9._-]{7,199}$/;
const SIGNIN_FORM_MAX = 16 * 1024, SIGNIN_ANSWER_MAX = 256 * 1024, SIGNIN_TIMEOUT_MS = 30 * 1000, SIGNIN_WAIT_MS = 5 * 60 * 1000;
const SIGNIN_SKEW_MS = 5 * 60 * 1000;
function signinKnown(id) { return Object.prototype.hasOwnProperty.call(SIGNIN_PROVIDERS, String(id)) ? SIGNIN_PROVIDERS[String(id)] : null; }
/* THE SIGN-IN PREVIEW: ETIUDA_SIGNIN_PREVIEW=1, read once at the start and never from the page, an installed desk included, names
   both providers on the door and in Account, drawn as a preview, while none has a client id; a press is answered "signin-preview"
   and nothing is opened, sent or written. Where any provider has a client id it changes nothing. */
const SIGNIN_PREVIEW_ASKED = process.env.ETIUDA_SIGNIN_PREVIEW === "1"; /* plant:preview-asked */
function signinPreviewing(asked, table) {
  return (asked === undefined ? SIGNIN_PREVIEW_ASKED : asked) === true && signinOffered(table).length === 0; /* plant:preview-inert */
}
/* GOOGLE'S CLIENT SECRET, where the package carries one: written beside the asar by the package step (tools/signin-secret.cjs) from
   ETIUDA_GOOGLE_CLIENT_SECRET at packaging, read once at start (the wiring, below) and from nowhere else. It goes to Google's token
   address alone, with the code and the refresh, and is never kept, printed, shown or sent to the licence service. Without the
   file, or with one not of its shape, there is none, and every byte the desk sends is as it was before the secret existed. */
const SIGNIN_SECRET_FILE = "signin-secret.json";
const SIGNIN_SECRET_SHAPE = /^[\x21-\x7e]{8,200}$/;
let signinPacked = Object.freeze({});
function signinSecretRead(text) {
  let d = null;
  try { d = JSON.parse(String(text)); } catch { d = null; }
  const v = d && typeof d === "object" && !Array.isArray(d) && d.format === 1 ? d.google : undefined;
  return Object.freeze(typeof v === "string" && SIGNIN_SECRET_SHAPE.test(v) ? { google: v } : {}); /* plant:secret-shape */
}
/* The providers this desk offers, [{id, clientId, clientSecret}] in the table's order: those `table` configures with a client id.
   A provider's secret is the table's own where it holds one, else what `packed` (the package's, signinPacked) holds for it, else "". */
function signinOffered(table, packed) {
  const t = table === undefined ? SIGNIN_PROVIDERS : table, k = (packed === undefined ? signinPacked : packed) || {};
  return Object.keys(t || {}).filter(id => signinKnown(id) && typeof t[id].clientId === "string" && SIGNIN_CLIENT.test(t[id].clientId)) /* plant:offered-client */
    .map(id => ({ id: id, clientId: t[id].clientId, clientSecret: typeof t[id].clientSecret === "string" && t[id].clientSecret ? t[id].clientSecret
      : id === "google" && typeof k.google === "string" ? k.google : "" }));
}
/* The nonce bound to this desk's signing key, made as the licence service makes it (requests.mjs signinNonce): SHA-256, as
   lower-case hex, of its line, the key's public half and a fresh seed of 64 hex. */
const SIGNIN_NONCE_LINE = "etiuda-licence-signin-nonce";
function signinNonce(deskKey, seed) {
  return crypto.createHash("sha256").update(SIGNIN_NONCE_LINE + "\n" + String(deskKey) + "\n" + String(seed), "utf8").digest("hex");
}
function signinB64url(buf) { return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function signinSame(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
/* One sign-in's request for the browser, {url, state, nonce, seed, verifier, redirect}: `port` the loopback's, `deskKey` this
   desk's signing public half, `rand(n)` n random bytes. */
function signinAuthorize(p, port, deskKey, rand) {
  const r = typeof rand === "function" ? rand : crypto.randomBytes, known = signinKnown(p.id);
  const verifier = signinB64url(r(32)), state = signinB64url(r(32)), seed = Buffer.from(r(32)).toString("hex");
  const nonce = signinNonce(deskKey, seed); /* plant:nonce-bound */
  const redirect = "http://127.0.0.1:" + Math.floor(Number(port));
  const challenge = signinB64url(crypto.createHash("sha256").update(verifier).digest()); /* plant:pkce */
  const q = new URLSearchParams(Object.assign({ client_id: p.clientId, response_type: "code", redirect_uri: redirect, scope: known.scope,
    state: state, nonce: nonce, code_challenge: challenge, code_challenge_method: "S256" }, known.extra));
  return { url: known.authorize + "?" + q.toString(), state: state, nonce: nonce, seed: seed, verifier: verifier, redirect: redirect };
}
/* Whether `url` is a provider's own authorize page as signinAuthorize makes it: the only address the sign-in hands the browser. */
function signinPageOk(url) {
  const u = String(url);
  return Object.keys(SIGNIN_PROVIDERS).some(id => u.indexOf(SIGNIN_PROVIDERS[id].authorize + "?") === 0) && !/[\s#]/.test(u);
}
/* What the browser brought back to the loopback, read against the request it answers: {ok, code}, or {ok: false, reason}. The
   state is compared first, so nothing else of a reply that is not this sign-in's is read. */
function signinOurs(query, pending) {
  const state = new URLSearchParams(String(query || "")).get("state");
  return !!pending && typeof state === "string" && signinSame(state, pending.state);
}
/* A provider's refusal named: its organisation not consenting to Etiuda (Microsoft's consent and admin-consent codes, Google's
   admin policy) is "signin-notallowed", the person's own Cancel "signin-cancelled", anything else "signin-refused". */
function signinRefusedWhy(error, said) {
  if (error === "consent_required" || error === "admin_policy_enforced" || /\bAADSTS(65001|65004|90094|90095)\b/.test(String(said || ""))) return "signin-notallowed"; /* plant:not-allowed */
  return error === "access_denied" ? "signin-cancelled" : "signin-refused";
}
function signinBack(query, pending) {
  const q = new URLSearchParams(String(query || ""));
  if (!signinOurs(query, pending)) return { ok: false, reason: "signin-state" }; /* plant:state */
  const error = q.get("error");
  if (error) return { ok: false, reason: signinRefusedWhy(error, q.get("error_description")) };
  const code = q.get("code");
  if (!code || code.length > 8192) return { ok: false, reason: "signin-refused" };
  return { ok: true, code: code };
}
/* The provider's client secret beside its client id, only where it has one: the token forms below are otherwise byte for byte the
   forms they were before a secret existed. */
function signinSecretPart(p) { return typeof p.clientSecret === "string" && p.clientSecret ? { client_secret: p.clientSecret } : {}; } /* plant:secret-present */
function signinCodeForm(p, pending, code) {
  return Buffer.from(new URLSearchParams(Object.assign({ client_id: p.clientId }, signinSecretPart(p), { grant_type: "authorization_code", code: String(code),
    redirect_uri: pending.redirect, code_verifier: pending.verifier })).toString(), "utf8");
}
function signinRefreshForm(p, refreshToken) {
  const known = signinKnown(p.id);
  return Buffer.from(new URLSearchParams(Object.assign({ client_id: p.clientId }, signinSecretPart(p), { grant_type: "refresh_token",
    refresh_token: String(refreshToken) }, known.refreshScope ? { scope: known.refreshScope } : {})).toString(), "utf8");
}
/* A JWT's claims, unverified: the licence service verifies the signature; the desk reads only what says the answer is its own. */
function signinClaims(jwt) {
  const parts = String(jwt).split(".");
  if (parts.length !== 3) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return c && typeof c === "object" && !Array.isArray(c) ? c : null;
  } catch { return null; }
}
function signinIssuerOk(p, c) {
  const known = signinKnown(p.id), iss = String(c.iss || "");
  if (known.issuer.indexOf("{tenantid}") >= 0) return SIGNIN_TENANT.test(String(c.tid || "")) && iss === known.issuer.replace("{tenantid}", String(c.tid));
  return iss === known.issuer || iss === known.issuer.replace(/^https:\/\//, "");
}
/* The token answer `res` ({status, bytes}) read: {ok, idToken, refreshToken, sub} where it holds an ID token for this client from
   this provider, unexpired, with a sub, carrying `nonce`; else {ok: false, reason}. For a renewal `sub` is the seat's: the token
   must carry it ("signin-other"), and one with no nonce at all is taken as the renewal; a nonce present must still be `nonce`. */
function signinTokens(res, p, nonce, now, sub) {
  let json = null;
  try { json = JSON.parse(Buffer.from(res && res.bytes ? res.bytes : []).toString("utf8")); } catch { json = null; }
  if (!json || typeof json !== "object") return { ok: false, reason: "signin-unreached" };
  if (res.status !== 200 || typeof json.id_token !== "string") return { ok: false, reason: json.error === "invalid_grant" ? "signin-expired" : "signin-refused" };
  const c = signinClaims(json.id_token);
  const aud = c ? [].concat(c.aud) : [];
  if (!c || aud.indexOf(p.clientId) < 0 || !signinIssuerOk(p, c) || !(Number(c.exp) * 1000 > now - SIGNIN_SKEW_MS)
    || typeof c.sub !== "string" || !c.sub) return { ok: false, reason: "signin-token" };
  if (sub !== undefined && !signinSame(c.sub, sub)) return { ok: false, reason: "signin-other" }; /* plant:renew-sub */
  const renewal = sub !== undefined && c.nonce === undefined; /* plant:renew-none */
  if (!renewal && (typeof c.nonce !== "string" || !signinSame(c.nonce, nonce))) return { ok: false, reason: "signin-unbound" }; /* plant:token-nonce */
  return { ok: true, idToken: json.id_token, refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : "", sub: c.sub };
}
/* One POST of `form` through `fetchFn` to `url`, no redirect followed, nothing cached, no cookie, the answer read up to `max`
   bytes, the whole within `ms`: {status, bytes}; throws else. The provider's token door and the service's door both use it. */
async function signinPost(fetchFn, url, form, type, max, ms) {
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  let timer = null;
  const late = new Promise((_, no) => {
    timer = setTimeout(() => { try { if (ctl) ctl.abort(); } catch { /* gone */ } no(new Error("no answer in time")); },
      ms === undefined ? SIGNIN_TIMEOUT_MS : ms);
    if (timer.unref) timer.unref();
  });
  const read = (async () => {
    const res = await fetchFn(String(url), { method: "POST", headers: { "content-type": type, accept: "application/json" },
      body: form, redirect: "error", cache: "no-store", credentials: "omit", signal: ctl ? ctl.signal : undefined }); /* plant:door-redirect */
    if (!res) throw new Error("answered nothing");
    const parts = [];
    let got = 0;
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      for (;;) {
        const step = await reader.read();
        if (step.done) break;
        got += step.value.length;
        if (got > max) { try { reader.cancel(); } catch { /* gone */ } throw new Error("the answer is longer than it may be"); }
        parts.push(Buffer.from(step.value));
      }
    } else {
      const all = Buffer.from(await res.arrayBuffer());
      if (all.length > max) throw new Error("the answer is longer than it may be");
      parts.push(all);
    }
    return { status: res.status, bytes: Buffer.concat(parts) };
  })();
  try { return await Promise.race([read, late]); }
  finally { clearTimeout(timer); read.catch(() => {}); late.catch(() => {}); }
}
/* The token request: a form, to a token address SIGNIN_PROVIDERS names and no other. */
async function signinRequest(fetchFn, url, form, ms) {
  const u = String(url);
  if (!Object.keys(SIGNIN_PROVIDERS).some(id => SIGNIN_PROVIDERS[id].token === u)) throw new Error("a token is asked only at a provider's own token address"); /* plant:door-host */
  if (!Buffer.isBuffer(form) || form.length > SIGNIN_FORM_MAX) throw new Error("the form is longer than it may be");
  return signinPost(fetchFn, u, form, "application/x-www-form-urlencoded", SIGNIN_ANSWER_MAX, ms);
}
/* The loopback the browser comes back to, opened only for one sign-in: 127.0.0.1 at a port the system picks. It waits for the
   GET of "/" whose query `takes(query)` owns, answers it with `pageFor(query)` and closes; any other GET of "/" is answered 400
   with `pageFor(query)` and ignored, any other path or verb 404. It also closes after `ms` or on close(), and `caught` then
   rejects, with {closed: true} for a close. Resolves {port, caught, close}. */
function signinListen(httpMod, pageFor, ms, takes) {
  return new Promise((resolve, reject) => {
    let done = false, timer = null, up = false, caughtYes = null, caughtNo = null;
    const caught = new Promise((yes, no) => { caughtYes = yes; caughtNo = no; });
    caught.catch(() => {});
    const server = httpMod.createServer((req, res) => {
      const u = String(req.url || ""), at = u.indexOf("?"), where = at < 0 ? u : u.slice(0, at);
      if (done || req.method !== "GET" || where !== "/") { res.writeHead(404, { "content-type": "text/plain", "cache-control": "no-store" }); res.end(); return; } /* plant:loop-once */
      const query = at < 0 ? "" : u.slice(at + 1);
      let page = "", ours = false;
      try { page = String(pageFor(query)); } catch { page = ""; }
      try { ours = typeof takes === "function" && !!takes(query); } catch { ours = false; }
      if (!ours) { res.writeHead(400, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(page); return; } /* plant:loop-state */
      done = true;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", connection: "close" });
      res.end(page);
      shut();
      caughtYes(query);
    });
    const shut = () => {
      clearTimeout(timer);
      try { server.close(); } catch { /* closed */ }
      try { if (typeof server.closeIdleConnections === "function") server.closeIdleConnections(); } catch { /* closed */ }
    };
    server.on("error", e => { if (!up) reject(e); });
    server.listen(0, "127.0.0.1", () => {
      up = true;
      timer = setTimeout(() => { if (!done) { done = true; shut(); caughtNo({ closed: false }); } }, ms === undefined ? SIGNIN_WAIT_MS : ms);
      if (timer.unref) timer.unref();
      resolve({ port: server.address().port, caught: caught,
        close: () => { if (!done) { done = true; shut(); caughtNo({ closed: true }); } } });
    });
  });
}
/* One sign-in at the provider, the person's own act. `io` {listen(pageFor, takes), openPage(url), tokenAsk(url, form), page(ok),
   rand?}: the shell's door, loopback and browser, or a leg's stand-ins. {ok, provider, idToken, refreshToken, sub, seed}, or
   {ok: false, reason}. */
async function signinRun(io, p, deskKey, now) {
  if (!p || !signinKnown(p.id) || !/^[0-9a-f]{64}$/.test(String(deskKey))) return { ok: false, reason: "signin-none" };
  let pending = null;
  const loop = await io.listen(query => io.page(signinBack(query, pending).ok), query => signinOurs(query, pending)); /* plant:loop-takes */
  try {
    pending = signinAuthorize(p, loop.port, deskKey, io.rand);
    let opened = false;
    try { opened = signinPageOk(pending.url) && !!(await io.openPage(pending.url)); } catch { opened = false; }
    if (!opened) return { ok: false, reason: "signin-browser" };
    let query = "";
    try { query = await loop.caught; } catch (e) { return { ok: false, reason: e && e.closed ? "signin-cancelled" : "signin-timeout" }; }
    const back = signinBack(query, pending);
    if (!back.ok) return back;
    let res = null;
    try { res = await io.tokenAsk(signinKnown(p.id).token, signinCodeForm(p, pending, back.code)); }
    catch { return { ok: false, reason: "signin-unreached" }; }
    const got = signinTokens(res, p, pending.nonce, now());
    if (!got.ok) return got;
    return { ok: true, provider: p.id, idToken: got.idToken, refreshToken: got.refreshToken, sub: got.sub, seed: pending.seed };
  } finally {
    loop.close();
  }
}
/* The quiet refresh at the provider: the refresh token exchanged for a fresh ID token, nothing shown. {ok, idToken, refreshToken,
   sub} where the new token is the seat's (signinTokens with `sub`, the last token's; "" holds it to this desk's nonce alone); else
   signinTokens' reason, "signin-unreached" where the provider could not be asked, or "signin-ask" where there is nothing to ask with. */
async function signinRenew(io, p, deskKey, refreshToken, seed, sub, now) {
  if (!p || !signinKnown(p.id) || !refreshToken || !/^[0-9a-f]{64}$/.test(String(seed))) return { ok: false, reason: "signin-ask" };
  let res = null;
  try { res = await io.tokenAsk(signinKnown(p.id).token, signinRefreshForm(p, refreshToken)); }
  catch { return { ok: false, reason: "signin-unreached" }; }
  const got = signinTokens(res, p, signinNonce(deskKey, seed), now(), sub ? String(sub) : undefined);
  if (!got.ok) return got;
  return { ok: true, idToken: got.idToken, refreshToken: got.refreshToken || refreshToken, sub: got.sub };
}
/* The refresh token sealed by the system's store, as base64, or "" where the store seals nothing for real (sealsForReal: no
   keyring, or Linux's basic_text): no refresh token is kept there, and the next renewal asks the person to sign in again. */
function signinKeep(storage, platform, token) {
  if (!token || !sealsForReal(storage, platform)) return ""; /* plant:keep-real */
  try { return storage.encryptString(String(token)).toString("base64"); } catch { return ""; }
}
function signinKept(storage, sealed) {
  try { return sealed ? String(storage.decryptString(Buffer.from(String(sealed), "base64"))) : ""; } catch { return ""; }
}

/* THE LICENCE SERVICE'S DOOR for the desk, beside fetchNote's: one POST of JSON to signin/desk alone, the body at most 8 KiB. The
   bytes the desk key signs are the service's own (requests.mjs signinDeskBytes): its line, then the provider, the SHA-256 of the
   ID token's characters, the desk's public half and t, one a line. A first sign-in sends the seed its token's nonce was made
   of; a renewal sends none. */
const SIGNIN_SERVICE = "https://etiuda.dev/licence/v1/signin/desk";
const SIGNIN_BODY_MAX = 8 * 1024, SIGNIN_SERVICE_MAX = 32 * 1024;
const SIGNIN_DESK_LINE = "etiuda-licence-signin-desk";
function signinTokenHash(idToken) { return crypto.createHash("sha256").update(String(idToken), "utf8").digest("hex"); }
function signinDeskBytes(o) {
  return Buffer.from(SIGNIN_DESK_LINE + "\n" + [o.provider, o.tokenHash, o.desk, o.t].map(String).join("\n"), "utf8");
}
/* The request's body, {provider, idToken, desk, seed?, t, sig}, signed by `sign(bytes)` (hex); null where any part is not its shape. */
function signinDeskBody(provider, idToken, desk, seed, t, sign) {
  if (!signinKnown(provider) || typeof idToken !== "string" || !idToken || !/^[0-9a-f]{64}$/.test(String(desk)) || !Number.isSafeInteger(t)) return null;
  if (seed && !/^[0-9a-f]{64}$/.test(String(seed))) return null;
  const sig = String(sign(signinDeskBytes({ provider: provider, tokenHash: signinTokenHash(idToken), desk: desk, t: t })) || ""); /* plant:desk-signed */
  if (!/^[0-9a-f]{128}$/.test(sig)) return null;
  const body = { provider: String(provider), idToken: idToken, desk: String(desk) };
  if (seed) body.seed = String(seed); /* plant:seed-first */
  body.t = t;
  body.sig = sig;
  return body;
}
async function signinServiceAsk(fetchFn, url, body, ms) {
  if (String(url) !== SIGNIN_SERVICE && String(url) !== SIGNOUT_SERVICE) throw new Error("the licence service's door takes signin/desk and signout/desk only"); /* plant:service-host */
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  if (bytes.length > SIGNIN_BODY_MAX) throw new Error("the body is longer than it may be");
  return signinPost(fetchFn, String(url), bytes, "application/json", SIGNIN_SERVICE_MAX, ms);
}
/* THE DESK'S SIGN OUT at the service, through the same door: one POST to signout/desk, {desk, t, sig} and no other names, `sig` the
   desk key's signature over the service's own bytes (requests.mjs signoutDeskBytes): its line, then the desk's public half and t,
   one a line. It frees the desk's place there and touches nobody's seat on a licence. */
const SIGNOUT_SERVICE = "https://etiuda.dev/licence/v1/signout/desk";
const SIGNOUT_DESK_LINE = "etiuda-licence-signout-desk"; /* plant:signout-line */
function signoutDeskBytes(o) {
  return Buffer.from(SIGNOUT_DESK_LINE + "\n" + [o.desk, o.t].map(String).join("\n"), "utf8");
}
/* The request's body, {desk, t, sig}, signed by `sign(bytes)` (hex); null where any part is not its shape. */
function signoutDeskBody(desk, t, sign) {
  if (!/^[0-9a-f]{64}$/.test(String(desk)) || !Number.isSafeInteger(t)) return null;
  const sig = String(sign(signoutDeskBytes({ desk: desk, t: t })) || "");
  if (!/^[0-9a-f]{128}$/.test(sig)) return null;
  return { desk: String(desk), t: t, sig: sig };
}
/* One post to signout/desk, signed by `deskKey`'s private half through `io.sign`; `io.serviceAsk(url, body)` is the door. Resolves
   true where the service answered 200, false for anything else, and never rejects: the caller never waits on it to clear. */
async function signoutAsk(io, deskKey, now) {
  try {
    const body = signoutDeskBody(deskKey, now(), io.sign);
    if (!body) return false;
    const res = await io.serviceAsk(SIGNOUT_SERVICE, body);
    return !!res && res.status === 200;
  } catch { return false; }
}
/* THE SEAT CERTIFICATE as the desk takes it: the service's shape, for this desk's key, a window that ends after it begins. Its
   signature under the delegation is Studio's to check, as Studio checks a grant; the desk keeps it and writes it. */
const SIGNIN_CODE = /^[0-9A-HJKMNP-TV-Z]{16}$/;
function signinCertOk(c, deskKey) {
  const plainObj = v => !!v && typeof v === "object" && !Array.isArray(v);
  return plainObj(c) && c.kind === "etiuda-seat-certificate" && c.format === 1 && /^[0-9a-f]{32}$/.test(String(c.licence))
    && String(c.desk) === String(deskKey) && /^[0-9a-f]{64}$/.test(String(c.person)) && SIGNIN_CODE.test(String(c.code)) /* plant:cert-desk */
    && Number.isSafeInteger(c.issued) && Number.isSafeInteger(c.until) && c.until > c.issued && plainObj(c.via)
    && plainObj(c.sig) && c.sig.alg === "Ed25519" && typeof c.sig.keyId === "string" && /^[0-9a-f]{128}$/.test(String(c.sig.value));
}
/* The service's answer read: {ok, code, cert} (cert null where no licence admits the person yet), or {ok: false, reason}, the
   reason "token", "signin", "full" or "desks" as the service says it, else "unreached", which every other answer is. */
function signinAnswer(res, deskKey) {
  let j = null;
  try { j = JSON.parse(Buffer.from(res && res.bytes ? res.bytes : []).toString("utf8")); } catch { j = null; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { ok: false, reason: "unreached" };
  if (res.status === 200 && j.ok === true && SIGNIN_CODE.test(String(j.code))) {
    if (j.certificate === null) return { ok: true, code: String(j.code), cert: null };
    if (signinCertOk(j.certificate, deskKey) && j.certificate.code === j.code) return { ok: true, code: String(j.code), cert: j.certificate };
    return { ok: false, reason: "unreached" };
  }
  const said = { 403: ["token", "signin"], 409: ["full", "desks"] }[res.status];
  return { ok: false, reason: said && said.indexOf(j.reason) >= 0 ? j.reason : "unreached" };
}
/* One post to signin/desk with `idToken`: `seed` for a first sign-in, "" for a renewal. `io` {serviceAsk(url, body), sign(bytes)}. */
async function signinSeat(io, provider, deskKey, idToken, seed, now) {
  const body = signinDeskBody(provider, idToken, deskKey, seed, now(), io.sign);
  if (!body) return { ok: false, reason: "unreached" };
  try { return signinAnswer(await io.serviceAsk(SIGNIN_SERVICE, body), deskKey); }
  catch { return { ok: false, reason: "unreached" }; }
}
/* THE CALM LAPSE: the kept certificate's `until` passed with no new one. It decides nothing on the desk but Account's words; the
   desk works on, and the next certificate ends it. */
function signinLapsed(held, now) {
  return !!held && !!held.cert && now >= held.cert.until; /* plant:lapse-until */
}
/* `held` after the service's answer `ans` at `now`: a certificate replaces the last, an answer of none drops it, a refusal keeps it
   (until its own `until`) and is said; "signin", a seat freed, forgets the refresh token, since only a sign-in takes it again. */
function signinSettle(held, ans, now) {
  if (ans.ok) return Object.assign({}, held, { code: ans.code, cert: ans.cert, at: now, checked: now, reached: true, said: "", ask: false });
  if (ans.reason === "unreached") return Object.assign({}, held, { checked: now, reached: false });
  const freed = ans.reason === "signin";
  return Object.assign({}, held, { checked: now, reached: true, said: ans.reason, ask: freed || held.ask === true,
    refresh: freed ? "" : held.refresh }); /* plant:settle-freed */
}
/* The reasons a provider's refresh forgets its token: it no longer takes it, or the token it gives is not this seat's. */
const SIGNIN_LOST = Object.freeze(["signin-ask", "signin-expired", "signin-other", "signin-unbound"]);
/* One quiet renewal of `held`: the provider's refresh, then signin/desk with no seed. `io` {tokenAsk, serviceAsk, sign, keep(text),
   kept(sealed)}. {held, said}; whatever fails, the code, the certificate and the provider stay, so the desk works on. */
async function signinRenewHeld(io, p, deskKey, held, now) {
  if (!held) return { held: null, said: "signin-ask" };
  const token = held.refresh ? io.kept(held.refresh) : "", sub = held.sub ? io.kept(held.sub) : "";
  const got = token ? await signinRenew(io, p, deskKey, token, held.seed, sub, now) : { ok: false, reason: "signin-ask" };
  if (!got.ok) {
    const lost = SIGNIN_LOST.indexOf(got.reason) >= 0;
    return { held: Object.assign({}, held, { refresh: lost ? "" : held.refresh, ask: lost || held.ask === true, checked: now(),
      reached: lost ? held.reached : false }), said: got.reason }; /* plant:renew-ask */
  }
  const fresh = Object.assign({}, held, { refresh: io.keep(got.refreshToken) || held.refresh, sub: held.sub || io.keep(got.sub) });
  const ans = await signinSeat(io, p.id, deskKey, got.idToken, "", now); /* plant:renew-seedless */
  return { held: signinSettle(fresh, ans, now()), said: ans.ok ? "renewed" : ans.reason };
}
/* seat.json as the desk writes it for its lead: {format: 2, desk, certificate}, unsealed, since it holds pseudonyms alone. */
const SEAT_NAME = "seat.json";
function seatFileText(deskId, cert) { return JSON.stringify({ format: 2, desk: String(deskId), certificate: cert }, null, 1) + "\n"; }
/* THE STANDING DOOR's request (board 980, A4): at a relay team's door a desk with no invitation uploads its request alone, so its
   seat rides inside it, shaped as seat.json, and `door` names the relay's id for the request, where the lead's answer is written.
   Both sit under the desk's own signature over the whole request (writeJoin). Null where the id is not the relay's 32 hex, the
   request names an invitation, or the certificate is not this desk's or has run out: then nothing is written. */
function signinDoorRequest(doc, deskId, deskKey, cert, door, now) {
  if (!doc || typeof doc !== "object" || doc.invite !== undefined || !/^[0-9a-f]{32}$/.test(String(door))) return null;
  if (!signinCertOk(cert, deskKey) || !(cert.until > now)) return null; /* plant:door-cert */
  return Object.assign({}, doc, { seat: JSON.parse(seatFileText(deskId, cert)), door: String(door) }); /* plant:door-fields */
}
/* The sign-in's file beside desk.json, read whole or not at all: {held: {provider, refresh, sub, seed, code, cert, at, checked,
   reached, said, ask} or null}. `refresh` and `sub` are signinKeep's, "" where none is kept, and nothing else in it is a secret;
   `ask` says the person's own sign-in is wanted again; a file of another format holds nothing. */
const SIGNIN_FILE = "signin.json";
function signinFileRead(text) {
  let d = null;
  try { d = JSON.parse(String(text)); } catch { d = null; }
  const out = { held: null };
  if (!d || typeof d !== "object" || +d.format !== 2) return out;
  const h = d.held, num = v => Number.isFinite(v) ? v : 0;
  if (h && typeof h === "object" && signinKnown(h.provider) && /^[0-9a-f]{64}$/.test(String(h.seed)))
    out.held = { provider: String(h.provider), refresh: typeof h.refresh === "string" ? h.refresh : "", sub: typeof h.sub === "string" ? h.sub : "",
      seed: String(h.seed), code: SIGNIN_CODE.test(String(h.code)) ? String(h.code) : "",
      cert: h.cert && typeof h.cert === "object" && Number.isSafeInteger(h.cert.until) ? h.cert : null,
      at: num(h.at), checked: num(h.checked), reached: h.reached !== false, said: typeof h.said === "string" ? h.said : "", ask: h.ask === true };
  return out;
}
function signinFileText(s) { return JSON.stringify({ format: 2, held: s.held || null }, null, 1) + "\n"; }

/* The sign-in's wiring: the person's click, the browser, the service, seat.json, the quiet renewal and what the page is told.
   With no provider configured nothing is offered, opened or sent. */
/* The quiet renewal runs SIGNIN_FIRST_MS after the window opens at each start, then daily while the desk runs, and on Check now;
   each asks the provider once and posts at once, inside the service's ten minutes. */
const SIGNIN_RENEW_MS = 24 * 60 * 60 * 1000; /* plant:renew-daily */
const SIGNIN_FIRST_MS = 2 * 60 * 1000;
/* Check now asks at most this often, whatever is pressed. */
const SIGNIN_CHECK_GAP_MS = 10 * 1000;
let signinStore, signinBusy = null, signinSaid = "", signinClick = null, signinTimer = null, signinWrote = "", signinCheckAt = 0;
/* Google's client secret, where the package step put one beside the asar: read here once, at start, installed only. */
if (INSTALLED) { try { signinPacked = signinSecretRead(fs.readFileSync(path.join(String(process.resourcesPath || ""), SIGNIN_SECRET_FILE), "utf8")); } catch { /* none packaged: every byte as before */ } }
function signinState() {
  if (signinStore !== undefined) return signinStore;
  let text = "";
  try { text = fs.readFileSync(path.join(app.getPath("userData"), SIGNIN_FILE), "utf8"); } catch { text = ""; }
  signinStore = signinFileRead(text);
  return signinStore;
}
function signinSave() {
  try { writeReplacing(path.join(app.getPath("userData"), SIGNIN_FILE), signinFileText(signinState())); }
  catch (e) { console.error("etiuda: the sign-in could not be kept - " + e.message); }
}
function signinSign(bytes) {
  const key = deskBranch ? openPrivate(deskBranch.sign.priv) : null;
  return key ? crypto.sign(null, bytes, key).toString("hex") : "";
}
/* Whether this desk has a team folder to write its seat into: a team whose lead it pinned, or a folder team it asks to join, so the
   lead's watch can read the seat beside the request. */
function signinTeamHere() {
  if (pinnedLead()) return true;
  return !!teamJoin && !(teamJoin.invite && teamJoin.invite.relay); /* plant:flush-asking */
}
/* The kept certificate written into this desk's own folder of its team's, once per certificate and folder, and again where the
   file is gone; nothing where the desk has no team folder or it does not answer. */
function signinFlush() {
  const held = signinState().held, cert = held && held.cert, me = branchIdentity(false);
  if (!cert || !me || !signinTeamHere()) return false;
  try {
    const root = sharedFolderForWrite();
    if (!folderAnswers(root)) return false;
    const dir = path.join(root, "desks", me.id), file = path.join(dir, SEAT_NAME), mark = file + "\n" + cert.sig.value;
    if (signinWrote === mark && fs.existsSync(file)) return false; /* plant:flush-mark */
    for (const d of [path.join(root, "desks"), dir]) { try { fs.mkdirSync(d); } catch (e) { if (e.code !== "EEXIST") throw e; } }
    writeReplacing(file, seatFileText(me.id, cert));
    signinWrote = mark;
    return true;
  } catch (e) {
    console.error("etiuda: the seat could not be written - " + e.message);
    return false;
  }
}
/* The relay's standing door from the desk's side (board 980, A4). A join begun at a relay team's door rather than by an invitation
   marks its relay part `door: true`, with the lead's box from what the desk trusts, never from the relay. What the channel's
   invite() is given for it: {door: this desk's certificate, box: the lead's box, inv: the relay's id once named}; null where no
   certificate of this desk stands, so no knock is sent; undefined for any other join, which the invitation's reading answers. */
function signinDoorInvite(team, rt) {
  const j = teamJoin, inv = j && j.team === team && j.invite && j.invite.relay;
  if (!inv || inv.door !== true) return undefined;
  const held = signinState().held, cert = held && held.cert, me = branchIdentity(false);
  if (inv.rt !== rt || !me || !/^[0-9a-f]{64}$/.test(String(inv.box)) || !signinCertOk(cert, me.key) || !(cert.until > Date.now())) return null; /* plant:door-invite-cert */
  const out = { door: cert, box: inv.box };
  if (/^[0-9a-f]{32}$/.test(String(inv.inv))) out.inv = inv.inv;
  return out;
}
/* The relay named this desk's door request (the channel's onDoor), before the request's one upload: the id is kept with the join,
   and the request is written into the relay's mirror once, carrying the seat and that id, so the channel's flush in the same cycle
   uploads it whole. The same id named again (a later key hello) writes nothing; a request withdrawn or being withdrawn is left
   alone. */
function signinDoorKept(team, mirror, id) {
  const j = teamJoin, inv = j && j.team === team && j.invite && j.invite.relay;
  if (!inv || inv.door !== true || inv.withdrawn === true || inv.withdrawing === true || !/^[0-9a-f]{32}$/.test(String(id))) return false;
  if (inv.inv !== id) { inv.inv = id; persistDeskEnvelope(); } /* plant:door-kept */
  const me = branchIdentity(false), held = signinState().held;
  if (!me) return false;
  const file = path.join(mirror, "desks", me.id, "join.json");
  let had = null;
  try { had = JSON.parse(fs.readFileSync(file, "utf8")); } catch { had = null; }
  if (had && had.door === id) return false; /* plant:door-once */
  const doc = signinDoorRequest(memberRequestDoc(j, null, me, null), me.id, me.key, held && held.cert, id, Date.now());
  if (!doc) return false;
  try { writeJoin(doc, file); return true; }
  catch (e) { console.error("etiuda: the request at the team's door could not be written - " + e.message); return false; }
}
/* What the page is told, no token and nothing from the provider: the providers offered by id, who is signed in by provider, the
   code, the seat ("held", "lapsed" or "none"), when the service last answered and whether the last try reached it; the provider's
   page of the sign-in that waits, and nothing once it ends; and whether this system keeps a sign-in (sealsForReal). */
function signinView() {
  const real = signinOffered().map(p => p.id), held = signinState().held, now = Date.now(), preview = signinPreviewing();
  const offered = preview ? Object.keys(SIGNIN_PROVIDERS) : real;
  const signedIn = held && real.indexOf(held.provider) >= 0 ? held.provider : "";
  return { offered: offered, preview: preview, signedIn: signedIn, code: signedIn ? held.code : "",
    seat: !signedIn ? "" : held.cert ? (signinLapsed(held, now) ? "lapsed" : "held") : "none",
    at: signedIn ? held.at : 0, reached: !signedIn || held.reached !== false, ask: !!signedIn && held.ask === true,
    refused: signedIn ? held.said : "", busy: signinBusy ? signinBusy.provider : "", said: signinSaid,
    link: signinBusy && signinPageOk(signinBusy.url) ? signinBusy.url : "", keeps: sealsForReal(safeStorage, process.platform) }; /* plant:view-link */
}
function tellSignin() {
  const win = theWindow;
  if (win && !win.isDestroyed()) win.webContents.send("etiuda:signin", signinView());
}
function signinPageHtml(ok) {
  const pl = (() => { try { return shellWords().lang === "pl"; } catch { return false; } })();
  const words = ok
    ? (pl ? "Logowanie dotarło do Etiudy. Tę kartę można zamknąć; Etiuda sama przejdzie dalej." : "The sign-in has reached Etiuda. This tab can be closed; Etiuda carries on by itself.")
    : (pl ? "Logowanie nie zostało dokończone. Tę kartę można zamknąć; Etiuda pokazuje, co się stało i co dalej." : "The sign-in did not finish. This tab can be closed; Etiuda shows what happened and what comes next.");
  return "<!DOCTYPE html><html lang=\"" + (pl ? "pl" : "en") + "\"><meta charset=\"utf-8\"><title>Etiuda</title><p>" + words + "</p></html>";
}
function signinIo(run) {
  return {
    listen: (pageFor, takes) => signinListen(http, pageFor, SIGNIN_WAIT_MS, takes).then(l => { run.loop = l; return l; }),
    /* The page is told the provider's page before the browser is asked, so a browser that does not open (Linux resolves
       the system browser call all the same) leaves the person its link to paste. */
    openPage: url => { if (!signinPageOk(url)) return false; run.url = url; tellSignin(); return Promise.resolve(handOut(url)).then(() => true); }, /* plant:signin-open */
    tokenAsk: (url, form) => signinRequest((u, init) => net.fetch(u, init), url, form),
    serviceAsk: (url, body) => signinServiceAsk((u, init) => net.fetch(u, init), url, body),
    sign: signinSign,
    keep: text => signinKeep(safeStorage, process.platform, text), kept: sealed => signinKept(safeStorage, sealed),
    page: ok => signinPageHtml(ok),
  };
}
/* A first sign-in's outcome kept: the refresh token and the sub sealed where the system seals for real, the seed beside, and the
   service's answer. A refusal other than a full licence keeps nothing, so the desk is as it was. */
function signinTake(provider, got, ans, now) {
  const s = signinState();
  if (!ans.ok && ans.reason !== "full") return false; /* plant:take-refused */
  const base = { provider: provider, refresh: signinKeep(safeStorage, process.platform, got.refreshToken),
    sub: signinKeep(safeStorage, process.platform, got.sub), seed: got.seed, code: "", cert: null, at: 0, checked: now, reached: true, said: "", ask: false };
  s.held = signinSettle(base, ans, now);
  signinSave();
  return true;
}
/* The person's sign-in, for a trusted click on one of the page's provider buttons (the preload's signin-click), one at a time. */
ipcMain.on("etiuda:signin-click", (e, provider) => {
  e.returnValue = null;
  if (fromEngine(e)) signinClick = { provider: String(provider || ""), at: Date.now() };
});
ipcMain.on("etiuda:signin-state", (e) => {
  if (!fromEngine(e)) { e.returnValue = null; return; }
  signinFlush();
  e.returnValue = signinView();
});
ipcMain.handle("etiuda:signin", async (e, provider) => {
  if (!fromEngine(e)) return null;
  const id = String(provider || ""), c = signinClick;
  signinClick = null;
  if (!c || c.provider !== id || Date.now() - c.at > LINK_CLICK_MS || signinBusy) return signinView(); /* plant:signin-click */
  const p = signinOffered().find(x => x.id === id), me = p ? branchIdentity(true) : null;
  if (!p && signinPreviewing() && signinKnown(id)) { signinSaid = "signin-preview"; tellSignin(); return signinView(); } /* plant:preview-press */
  if (!p || !me || !net || typeof net.fetch !== "function") { signinSaid = "signin-none"; return signinView(); } /* plant:signin-offered */
  const run = { loop: null, provider: p.id, url: "" }, io = signinIo(run);
  signinBusy = run;
  signinSaid = "";
  tellSignin();
  try {
    const got = await signinRun(io, p, me.key, Date.now);
    if (got.ok) {
      const ans = await signinSeat(io, p.id, me.key, got.idToken, got.seed, Date.now);
      signinTake(p.id, got, ans, Date.now());
      signinFlush();
      signinSaid = ans.ok ? "signin-done" : ans.reason;
    } else signinSaid = got.reason;
  } catch { signinSaid = "unreached"; }
  finally { signinBusy = null; }
  tellSignin();
  return signinView();
});
/* Open the browser again: the same provider page, while that sign-in still waits for it, and no other address. */
ipcMain.handle("etiuda:signin-again", (e) => {
  if (!fromEngine(e)) return false;
  const run = signinBusy;
  if (!run || !run.url || !signinPageOk(run.url)) return false; /* plant:again-page */
  handOut(run.url);
  return true;
});
/* Cancel closes the loopback, and the sign-in ends as cancelled. */
ipcMain.handle("etiuda:signin-stop", (e) => {
  if (!fromEngine(e)) return false;
  const run = signinBusy;
  if (run && run.loop) run.loop.close();
  return !!run;
});
/* Sign out: this computer forgets the account, its tokens, its code and its certificate, and takes its seat.json back out of the
   team's folder. The team, its catalog and everything else on the desk stay. Where the desk was signed in and a provider is offered,
   its place at the licence service is freed first by one signed signout/desk, which nothing here waits on or says anything of: if
   the service is away or refuses, the place frees itself after 30 days unseen. The person's seat on the licence is not touched. */
function signinOutNow() {
  if (signinBusy) return signinView();
  const s = signinState(), me = branchIdentity(false);
  if (s.held && me && !harnessLaunch() && net && typeof net.fetch === "function"
    && signinOffered().length) { /* plant:signout-offered */
    signoutAsk(signinIo({ loop: null }), me.key, Date.now); /* plant:signout-post */
  }
  if (s.held && me && signinTeamHere()) {
    try { fs.unlinkSync(path.join(sharedFolderForWrite(), "desks", me.id, SEAT_NAME)); } catch { /* not written, or the folder is away */ }
  }
  s.held = null;
  signinWrote = "";
  signinSaid = "";
  signinSave();
  tellSignin();
  return signinView();
}
ipcMain.handle("etiuda:signin-out", (e) => {
  if (!fromEngine(e)) return null;
  return signinOutNow();
});
/* Check now: one renewal at once, at most once per SIGNIN_CHECK_GAP_MS. */
ipcMain.handle("etiuda:signin-check", async (e) => {
  if (!fromEngine(e)) return null;
  if (Date.now() - signinCheckAt < SIGNIN_CHECK_GAP_MS) return signinView(); /* plant:check-gap */
  signinCheckAt = Date.now();
  await signinRenewNow().catch(() => "");
  return signinView();
});
/* The quiet renewal, for a desk holding a refresh token for a provider still offered: a new certificate kept and written, or the
   last kept and the calm words. Never from the harness's own window or any harness start, so no leg reaches a provider. */
async function signinRenewNow() {
  if (harnessLaunch()) return ""; /* plant:renew-now-harness */
  signinFlush();
  const s = signinState(), held = s.held;
  if (!held || !held.refresh || signinBusy) return "";
  const p = signinOffered().find(x => x.id === held.provider), me = branchIdentity(false);
  if (!p || !me) return ""; /* plant:renew-offered */
  const r = await signinRenewHeld(signinIo({ loop: null }), p, me.key, held, Date.now);
  if (s.held !== held) return ""; /* a sign-in or a sign out took its place meanwhile */
  s.held = r.held;
  signinSave();
  signinFlush();
  tellSignin();
  return r.said;
}
function armSigninRenew() {
  if (PLACED_ASIDE || harnessLaunch() || signinTimer || !net || typeof net.fetch !== "function") return; /* plant:renew-harness */
  const next = () => {
    signinRenewNow().catch(() => {});
    signinTimer = setTimeout(next, SIGNIN_RENEW_MS);
    if (signinTimer.unref) signinTimer.unref();
  };
  signinTimer = setTimeout(next, SIGNIN_FIRST_MS); /* plant:renew-start */
  if (signinTimer.unref) signinTimer.unref();
}

/* An IPC message is answered only for the engine's own top frame. Nothing else can reach these
   channels today, since navigation is refused and no other frame is created; this is the line
   that keeps that true if one ever is. */
function fromEngine(e) {
  const f = e.senderFrame;
  return !!f && f.parent === null && /\/engine\/etiuda\.html($|[?#])/.test(f.url || "");
}

/* A WEB ADDRESS LEAVES ONLY FOR A CLICK ON IT. The preload names the link a trusted click landed on,
   synchronously, before that click's navigation can begin; the address is handed to the browser
   only if it is that one, once, within LINK_CLICK_MS. Whatever the page opens by script is refused. */
const LINK_CLICK_MS = 2000;
let linkClicked = null;
ipcMain.on("etiuda:link-click", (e, url) => {
  e.returnValue = null;
  try { if (fromEngine(e)) linkClicked = { href: new URL(String(url)).href, at: Date.now() }; }
  catch { linkClicked = null; }
});
/* THE ONE WAY OUT OF THE SHELL: every web address the desk hands to the system's browser passes through this one call, a clicked
   link (openExternally, below) and the provider's page a sign-in opens, first and again, alike, each behind its own
   guard. A lab replaces this single call, so a test's press never reaches the real browser (tests/links.js, the test
   architect's floor of 2026-10-28). */
function handOut(url) { return shell.openExternal(url); }
function openExternally(url) {
  try {
    const u = new URL(url), c = linkClicked;
    if (!/^https?:$/.test(u.protocol)) return;
    if (!c || c.href !== u.href || Date.now() - c.at > LINK_CLICK_MS) {
      console.error("etiuda: a web address the page opened without a click on it stays closed");
      return;
    }
    linkClicked = null;
    handOut(url);
  } catch { /* not a URL this shell can open, and the navigation is refused either way */ }
}

/* ---- the version note (board 991) ----------------------------------------------------------------------------------------
   One small document etiuda.dev serves for the desk, signed offline by the vendor's root key: the newest release and the
   page about it. Read whole or refused whole, every check before the signature; the desk opens the note's address in the
   browser and fetches nothing at it. The signed bytes are the note's own domain line, then its fields one per line, so no
   other signed document reads as a note, and a note reads as nothing else. */
const NOTE_KIND = "etiuda-update-note", NOTE_MAX = 1024, NOTE_TIMEOUT_MS = 30 * 1000;
const NOTE_URL = "https://etiuda.dev/licence/v1/note/desk";
/* The vendor's root key, public half, as relay/core.cjs's ROOT_PUB. Only a leg passes readNote another. */
const NOTE_ROOT = "f78558260ad75c094052f936326a63bffb1a581ac8b91d898ae1fd01b61127ee";
const NOTE_FIELDS = ["kind", "format", "app", "serial", "version", "released", "url", "sig"];
const NOTE_VERSION_RE = /^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$/;
const NOTE_URL_RE = /^https:\/\/etiuda\.dev(\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}){1,8}\/?$/;
function noteBytes(n) {
  return Buffer.from([NOTE_KIND, String(n.format), n.app, String(n.serial), n.version, n.released, n.url].join("\n"), "utf8");
}
function noteDay(s) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (!m || +m[1] < 2020 || +m[1] > 2099) return false;
  const at = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return at.getUTCFullYear() === +m[1] && at.getUTCMonth() === +m[2] - 1 && at.getUTCDate() === +m[3];
}
/* The desk's note in `body`, a Buffer or a string: {note} where every check holds, else {why}, the first that failed. */
function readNote(body, root) {
  const key = typeof root === "object" && root ? (root.key || root.public) : (root === undefined ? NOTE_ROOT : root);
  const buf = Buffer.isBuffer(body) ? body : typeof body === "string" ? Buffer.from(body, "utf8") : null;
  if (!buf) return { why: "shape" };
  if (buf.length > NOTE_MAX) return { why: "size" }; /* plant:note-size */
  for (const b of buf) if (!(b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e))) return { why: "bytes" };
  let n;
  try { n = JSON.parse(buf.toString("utf8")); } catch { return { why: "json" }; }
  const plainObj = v => !!v && typeof v === "object" && !Array.isArray(v);
  const exactly = (o, names) => Object.keys(o).length === names.length && names.every(k => Object.prototype.hasOwnProperty.call(o, k));
  if (!plainObj(n)) return { why: "json" };
  if (!exactly(n, NOTE_FIELDS)) return { why: "fields" };
  if (n.kind !== NOTE_KIND) return { why: "kind" };
  if (n.format !== 1) return { why: "format" };
  if (n.app !== "desk") return { why: "app" }; /* plant:note-app */
  if (!Number.isSafeInteger(n.serial) || n.serial < 1 || n.serial > 999999999) return { why: "serial" };
  if (typeof n.version !== "string" || !NOTE_VERSION_RE.test(n.version)) return { why: "version" };
  if (typeof n.released !== "string" || !noteDay(n.released)) return { why: "released" };
  if (typeof n.url !== "string" || n.url.length > 200 || !NOTE_URL_RE.test(n.url)) return { why: "url" }; /* plant:note-url */
  const s = n.sig;
  if (!plainObj(s) || !exactly(s, ["alg", "keyId", "value"]) || s.alg !== "ed25519" || typeof s.keyId !== "string"
    || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(s.keyId) || typeof s.value !== "string" || !/^[0-9a-f]{128}$/.test(s.value)) return { why: "sig" };
  let held = false;
  try {
    held = typeof key === "string" && /^[0-9a-f]{64}$/.test(key) && crypto.verify(null, noteBytes(n),
      crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(key, "hex")]), format: "der", type: "spki" }),
      Buffer.from(s.value, "hex")) === true;
  } catch { held = false; }
  if (!held) return { why: "signature" }; /* plant:note-sig */
  return { note: n };
}
/* A note that held, against the one kept: "taken" over none or a lower serial, "same" for the same serial and signed bytes,
   else "refused", which changes nothing. */
function keepNote(note, kept) {
  if (!kept) return "taken";
  if (note.serial < kept.serial) return "refused"; /* plant:note-serial */
  if (note.serial === kept.serial) return noteBytes(note).equals(noteBytes(kept)) ? "same" : "refused";
  return "taken";
}
/* Whether release `a` is above release `b`, each three whole numbers; false where either is not. */
function versionAbove(a, b) {
  const x = NOTE_VERSION_RE.exec(String(a)), y = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(String(b));
  if (!x || !y) return false;
  for (let i = 1; i <= 3; i++) if (+x[i] !== +y[i]) return +x[i] > +y[i];
  return false; /* plant:note-equal */
}
/* The note's bytes through `fetchFn`: one GET over https to etiuda.dev, no redirect followed, nothing cached, no cookie,
   a 200 alone answered, the body read up to NOTE_MAX bytes and refused past them, the whole within `ms`. Throws else. */
async function fetchNote(fetchFn, url, ms) {
  let u;
  try { u = new URL(String(url)); } catch { throw new Error("not an address"); }
  if (u.protocol !== "https:" || u.hostname !== "etiuda.dev" || u.port || u.username || u.password) throw new Error("the note is read from https://etiuda.dev only"); /* plant:note-origin */
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  let timer = null;
  const late = new Promise((_, no) => {
    timer = setTimeout(() => { try { if (ctl) ctl.abort(); } catch { /* gone */ } no(new Error("the note did not arrive in time")); },
      ms === undefined ? NOTE_TIMEOUT_MS : ms);
    if (timer.unref) timer.unref();
  });
  const read = (async () => {
    const res = await fetchFn(u.href, { method: "GET", redirect: "error", cache: "no-store", credentials: "omit", signal: ctl ? ctl.signal : undefined }); /* plant:note-redirect */
    if (!res || res.status !== 200) throw new Error("the note was answered " + (res ? res.status : "with nothing"));
    const said = Number(res.headers && typeof res.headers.get === "function" ? res.headers.get("content-length") : NaN);
    if (Number.isFinite(said) && said > NOTE_MAX) throw new Error("the note is longer than it may be");
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader(), parts = [];
      let got = 0;
      for (;;) {
        const step = await reader.read();
        if (step.done) break;
        got += step.value.length;
        if (got > NOTE_MAX) { try { reader.cancel(); } catch { /* gone */ } throw new Error("the note is longer than it may be"); } /* plant:note-cap */
        parts.push(Buffer.from(step.value));
      }
      return Buffer.concat(parts);
    }
    const all = Buffer.from(await res.arrayBuffer());
    if (all.length > NOTE_MAX) throw new Error("the note is longer than it may be");
    return all;
  })();
  try { return await Promise.race([read, late]); }
  finally { clearTimeout(timer); read.catch(() => {}); late.catch(() => {}); }
}
/* The last note the desk took, in update-note.json beside desk.json, read back through the same checks; and how the latest
   look went: "read" for a note that held, "failed" for anything else, "" before the first look ends. */
const NOTE_FILE = "update-note.json", NOTE_FIRST_MS = 60 * 1000, NOTE_EVERY_MS = 60 * 60 * 1000;
let noteKept, noteLook = "", noteTimer = null;
function keptNote() {
  if (noteKept !== undefined) return noteKept;
  let got = null;
  try { got = readNote(fs.readFileSync(path.join(app.getPath("userData"), NOTE_FILE))); } catch { got = null; }
  noteKept = got && got.note ? got.note : null;
  return noteKept;
}
/* What the page shows: the version offered where the kept note's is above this engine's and machine policy leaves the look
   on, and how the latest look went. */
function updateState() {
  const kept = keptNote();
  return { offer: !updateLookOff() && kept && versionAbove(kept.version, engineVersion()) ? kept.version : "", look: noteLook };
}
async function lookForNote(fetchFn) {
  let look = "failed";
  try {
    const body = await fetchNote(fetchFn, NOTE_URL), got = readNote(body);
    if (got.note) {
      const kept = keptNote();
      const take = keepNote(got.note, kept);
      /* A look reads only when its note stands at or above the running version: a note below it says nothing of newer
         releases, kept or not (Argon's update-offer finding 1). */
      const proves = !versionAbove(engineVersion(), got.note.version);
      if (take === "same") {
        look = proves ? "read" : "failed";
      } else if (take === "taken") {
        try {
          writeReplacing(path.join(app.getPath("userData"), NOTE_FILE), body.toString("utf8"));
          noteKept = got.note;
          look = proves ? "read" : "failed";
        } catch (e) {
          console.error("etiuda: the version note could not be kept - " + e.message);
          look = "failed";
        }
      }
    }
  } catch { look = "failed"; }
  noteLook = look;
  const win = theWindow;
  if (win && !win.isDestroyed()) win.webContents.send("etiuda:update", updateState());
  return look;
}
/* A first look a minute after the window opens, then hourly. Never from the harness's own window, so no leg reaches out. */
function armNoteLook() {
  /* Not from any harness start (harnessLaunch: --user-data-dir or a test variable), so no leg ever asks production etiuda.dev. */
  if (PLACED_ASIDE || harnessLaunch() || updateLookOff() || noteTimer || !net || typeof net.fetch !== "function") return;
  const next = () => {
    lookForNote((u, init) => net.fetch(u, init)).catch(() => {});
    noteTimer = setTimeout(next, NOTE_EVERY_MS);
    if (noteTimer.unref) noteTimer.unref();
  };
  noteTimer = setTimeout(next, NOTE_FIRST_MS);
  if (noteTimer.unref) noteTimer.unref();
}
ipcMain.on("etiuda:update-state", (e) => { e.returnValue = fromEngine(e) ? updateState() : null; });
/* The release page leaves as a link does, for a click on it: the preload names a trusted click on the page's button, which
   stands for the kept note's address while an offer stands, and the open that follows goes through openExternally. The page
   never names an address. */
ipcMain.on("etiuda:update-click", (e) => {
  e.returnValue = null;
  if (!fromEngine(e)) return;
  const kept = keptNote();
  if (kept && updateState().offer) linkClicked = { href: new URL(kept.url).href, at: Date.now() }; /* plant:update-open-offer */
});
ipcMain.handle("etiuda:update-open", (e) => {
  if (!fromEngine(e)) return false;
  const kept = keptNote(), c = linkClicked;
  if (!kept) return false;
  const ok = !!c && c.href === new URL(kept.url).href && Date.now() - c.at <= LINK_CLICK_MS;
  openExternally(kept.url);
  return ok;
});

/* THE HARNESS'S OWN WINDOW, a contract of three values. Nothing else here reads the variable.
     1   placed beyond the far corner of every display, never shown, never focused.
     2   the same placement, shown without focus: a window with a frame and a rectangle to
         measure, on no display, which is what a check ABOUT the window needs and cannot get
         from 1, since EnumWindows passes over a window nobody showed.
     anything else, unset included, is an ordinary launch a customer gets. */
const OFFSCREEN = process.env.ETIUDA_TEST_OFFSCREEN === "1";
const OFFSCREEN_SHOWN = process.env.ETIUDA_TEST_OFFSCREEN === "2";
/* Both values place the window and neither focuses it; they differ only in whether it is shown. */
const PLACED_ASIDE = OFFSCREEN || OFFSCREEN_SHOWN;
/* Past the far corner of the largest display, with a margin, and a fallback that is already off
   any ordinary desktop where the displays cannot be read. */
function offscreenAt() {
  let x = 6000, y = 6000;
  try {
    for (const d of screen.getAllDisplays()) {
      x = Math.max(x, d.bounds.x + d.bounds.width + 200);
      y = Math.max(y, d.bounds.y + d.bounds.height + 200);
    }
  } catch { /* the fallback above is the answer */ }
  return { x: x, y: y };
}

/* THE WINDOW'S PLACE, kept beside the desk and not in it: desk.json can be carried to another
   machine, and a rectangle belongs to this one's displays. Read and written only for an ordinary
   launch, never for the harness's placed-aside window. */
const OPEN_SIZE = { width: 1280, height: 880 };
function windowFile() { return path.join(app.getPath("userData"), "window.json"); }
/* The place file also remembers whether the first-close toast has been shown, and whether tray
   notifications are on. A place write keeps those keys. A toast writes only after one was shown. */
function readWindowMeta() {
  try {
    const o = JSON.parse(fs.readFileSync(windowFile(), "utf8"));
    return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
  } catch { return {}; }
}
function patchWindowMeta(extra) {
  try {
    writeReplacing(windowFile(), JSON.stringify(Object.assign({}, readWindowMeta(), extra)));
  } catch (e) { console.error("etiuda: the window file could not be written - " + e.message); }
}
/* Pure, for tests/test.js. The saved rectangle on the work area it overlaps most, moved and cut
   to lie wholly inside it; where it overlaps none, the opening size centred on the primary. */
function windowPlace(saved, areas, primary, size) {
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const ok = !!saved && ["x", "y", "width", "height"].every(k => Number.isFinite(saved[k]))
    && saved.width > 0 && saved.height > 0;
  let area = null, best = 0;
  if (ok) for (const a of areas) { const n = overlap(saved, a); if (n > best) { best = n; area = a; } }
  const r = area ? saved : Object.assign({ x: primary.x + (primary.width - size.width) / 2,
                                           y: primary.y + (primary.height - size.height) / 2 }, size);
  const on = area || primary;
  const width = Math.round(Math.min(r.width, on.width)), height = Math.round(Math.min(r.height, on.height));
  return {
    x: Math.round(Math.min(Math.max(r.x, on.x), on.x + on.width - width)),
    y: Math.round(Math.min(Math.max(r.y, on.y), on.y + on.height - height)),
    width: width, height: height,
    maximized: !!area && saved.maximized === true,
  };
}
function readWindowPlace() {
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(windowFile(), "utf8")); } catch { /* first launch, or unreadable */ }
  try {
    return windowPlace(saved, screen.getAllDisplays().map(d => d.workArea), screen.getPrimaryDisplay().workArea, OPEN_SIZE);
  } catch (e) {
    console.error("etiuda: the displays could not be read - " + e.message);
    return Object.assign({ maximized: false }, OPEN_SIZE);
  }
}
/* The normal rectangle, so a window closed maximised comes back maximised over the place it
   will restore to; a snapped one is kept as the rectangle it was snapped to. `maximized` is the
   last state the caller saw, since a minimised window is neither; `normal`, where given, is the rectangle the caller
   holds for a window built maximised. Temp file then rename. */
function saveWindowPlace(win, maximized, normal) {
  if (!win || win.isDestroyed()) return;
  const snapped = !maximized && !win.isMinimized() && typeof win.isSnapped === "function" && win.isSnapped();
  const b = normal || (snapped ? win.getBounds() : win.getNormalBounds());
  const file = windowFile();
  try {
    writeReplacing(file, JSON.stringify(Object.assign({}, readWindowMeta(), {
      x: b.x, y: b.y, width: b.width, height: b.height, maximized: !!maximized })));
  } catch (e) { console.error("etiuda: the window's place could not be written - " + e.message); }
}

// The work area a window reopened maximised fills: the display its saved rectangle lies on.
function maximizedArea(r) {
  try {
    const a = screen.getDisplayMatching({ x: r.x, y: r.y, width: r.width, height: r.height }).workArea;
    return { x: a.x, y: a.y, width: a.width, height: a.height };
  } catch { return null; }
}

/* THE SHELL'S OWN WORDS, for the two surfaces the page cannot draw: the context menu, and the
   recovery window shown when the page itself has stopped. The language is uiLang()'s rule in
   ui-lang.js: the desk's eUiLang where it names one, else the system's. */
const SHELL_WORDS = {
  en: { lang: "en", undo: "Undo", cut: "Cut", copy: "Copy", paste: "Paste", selectAll: "Select all",
        addWord: "Add to dictionary", gone: "Etiuda stopped unexpectedly.", hung: "Etiuda is not responding.",
        restart: "Restart", close: "Close Etiuda", wait: "Wait",
        teamMeetsInFolder: "This team now works from a shared folder. The team's lead can say which one; once it is open here with Open a folder, everything carries on as before.",
        openFolder: "Open a folder",
        folderRefusedWrongTeam: "That folder holds no files of this team, so nothing was changed. The team's lead can say which folder it is.",
        folderRefusedWrongLead: "The team file in that folder is not signed by this team's lead, so nothing was changed. Tell the team's lead about it.",
        folderRefusedLowerRev: "The team file in that folder is older than the one this desk holds, so nothing was changed. The team's lead can say which folder is the current one.",
        pickTeamFolder: "Choose the team's shared folder",
        stillReading: "Etiuda is still reading the team's shared folder, so the catalog is not open yet. Once that is done, Etiuda offers the catalog in a window of its own, and loading it from there opens it.",
        trayOpen: "Open Etiuda",
        trayReplies: "Bring the replies over any window",
        trayNotesOn: "Notifications: on",
        trayNotesOff: "Notifications: off",
        traySettings: "Settings",
        trayQuit: "Quit Etiuda",
        trayTip: "Etiuda",
        trayKeepsRunning: "Etiuda keeps running in the tray",
        trayKeepsBody: "Its shortcut still works and the team's updates still arrive. To quit, right-click the tray icon and choose Quit Etiuda; Settings, under General, can make closing the window quit instead.",
        jumpRecent: "Recent catalogs",
        jumpReplies: "Bring the replies over any window",
        jumpNewTab: "New tab",
        jumpLibrary: "Library",
        jumpSettings: "Settings" },
  pl: { lang: "pl", undo: "Cofnij", cut: "Wytnij", copy: "Kopiuj", paste: "Wklej", selectAll: "Zaznacz wszystko",
        addWord: "Dodaj do słownika", gone: "Etiuda niespodziewanie się zatrzymała.",
        hung: "Etiuda nie odpowiada.", restart: "Uruchom ponownie", close: "Zamknij Etiudę", wait: "Czekaj",
        teamMeetsInFolder: "Ten zespół pracuje teraz ze wspólnego folderu. Lider zespołu może wskazać, z którego; gdy zostanie on otwarty tutaj przez Otwórz folder, wszystko będzie działać jak dotąd.",
        openFolder: "Otwórz folder",
        folderRefusedWrongTeam: "W tym folderze nie ma plików tego zespołu, więc nic nie zmieniono. Lider zespołu może wskazać właściwy folder.",
        folderRefusedWrongLead: "Plik zespołu w tym folderze nie jest podpisany przez lidera tego zespołu, więc nic nie zmieniono. Proszę powiedzieć o tym liderowi zespołu.",
        folderRefusedLowerRev: "Plik zespołu w tym folderze jest starszy niż ten, który ma to stanowisko, więc nic nie zmieniono. Lider zespołu może wskazać aktualny folder.",
        pickTeamFolder: "Wybierz wspólny folder zespołu",
        stillReading: "Etiuda jeszcze wczytuje wspólny folder zespołu, więc katalog nie jest na razie otwarty. Gdy wczytywanie dobiegnie końca, Etiuda zaproponuje katalog w osobnym oknie; wystarczy go stamtąd wczytać, aby się otworzył.",
        trayOpen: "Otwórz Etiudę",
        trayReplies: "Przywołaj odpowiedzi nad dowolne okno",
        trayNotesOn: "Powiadomienia: wł.",
        trayNotesOff: "Powiadomienia: wył.",
        traySettings: "Ustawienia",
        trayQuit: "Zakończ Etiudę",
        trayTip: "Etiuda",
        trayKeepsRunning: "Etiuda działa dalej w zasobniku",
        trayKeepsBody: "Skrót nadal działa, a aktualizacje od zespołu wciąż docierają. Program zamyka pozycja Zakończ Etiudę w menu ikony zasobnika; w Ustawieniach, w części Ogólne, można ustawić, by zamknięcie okna kończyło działanie.",
        jumpRecent: "Ostatnie katalogi",
        jumpReplies: "Przywołaj odpowiedzi nad dowolne okno",
        jumpNewTab: "Nowa rozmowa",
        jumpLibrary: "Biblioteka",
        jumpSettings: "Ustawienia" },
};
function shellWords() {
  if (deskKeys === undefined) deskKeys = readDesk();
  const stored = deskKeys.eUiLang;
  if (SHELL_WORDS[stored]) return SHELL_WORDS[stored];
  /* The page's navigator.languages is the locale, then the system's list, measured on Electron 44. */
  for (const tag of [app.getLocale()].concat(app.getPreferredSystemLanguages())) {
    const code = String(tag || "").toLowerCase().split("-")[0];
    if (SHELL_WORDS[code]) return SHELL_WORDS[code];
  }
  return SHELL_WORDS.en;
}

/* THE CONTEXT MENU. A text field gets the edit commands, with spelling suggestions first over a
   misspelt word; selected text elsewhere gets Copy; anywhere else nothing opens. */
function contextMenuFor(wc, p) {
  const w = shellWords(), f = p.editFlags || {}, items = [];
  if (p.isEditable && p.misspelledWord) {
    (p.dictionarySuggestions || []).slice(0, 5).forEach(s =>
      items.push({ label: s, click: () => wc.replaceMisspelling(s) }));
    items.push({ label: w.addWord, click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
    items.push({ type: "separator" });
  }
  if (p.isEditable) {
    items.push({ label: w.undo, role: "undo", enabled: !!f.canUndo }, { type: "separator" },
      { label: w.cut, role: "cut", enabled: !!f.canCut }, { label: w.copy, role: "copy", enabled: !!f.canCopy },
      { label: w.paste, role: "paste", enabled: !!f.canPaste }, { type: "separator" },
      { label: w.selectAll, role: "selectAll", enabled: !!f.canSelectAll });
  } else if (String(p.selectionText || "").trim()) {
    items.push({ label: w.copy, role: "copy", enabled: !!f.canCopy });
  }
  return items;
}
/* ETIUDA_TEST_CONTEXT_MENU: the harness reads the menu from stdout instead of a popup, which would
   take the pointer and the keyboard of whoever is at the desk until dismissed. */
const MENU_TO_LOG = !!process.env.ETIUDA_TEST_CONTEXT_MENU;

/* The one window, held so a folder change arriving through a desk save can re-arm the watch and
   offer what the new folder holds. There is exactly one; a second would need a list. */
let theWindow = null;
/* WHAT THE PAGE WATCH (shell/page-watch.cjs) IS HANDED: the desk's words, theme and harness flags, and the
   two marks the host answer reads after a reload, the reload's own and the loss's reason. */
function pageWatchFor(win) {
  return {
    BrowserWindow, dark: () => !!nativeTheme.shouldUseDarkColors, words: () => Object.assign({ title: "Etiuda" }, shellWords()),
    aside: PLACED_ASIDE, hidden: OFFSCREEN, asideAt: offscreenAt, tmpdir: os.tmpdir, now: Date.now,
    log: line => console.error("etiuda: " + line),
    lost: d => { win.webContents.etiudaLost = { reason: String(d.reason), exitCode: d.exitCode, at: Date.now() }; },
    reloading: () => { recovering.add(win.webContents.id); },
    /* Close Etiuda quits. A bare close hides into the tray and the dead page comes back empty. */
    quit: () => {
      if (typeof win.quit === "function") { win.quit(); return; }
      quitting = true;
      try { app.quit(); } catch (e) { /* already leaving */ }
    },
  };
}
/* ---- THE PICKER: the desk's replies over the window in use, by a hotkey -------------------------
   The hotkey is REGISTERED with Windows (globalShortcut, which is RegisterHotKey there), never a
   keyboard hook: nothing here sees a key but its own combination. Nothing reads another window's
   text, caret or pixels. The reply goes to the clipboard, and on Windows the caret helper presses
   Ctrl+V in the window that was in front at the press; where it cannot, the agent pastes. The
   picker is placed by the pointer, the one position that belongs to nobody else's window. */
const HOTKEY_KEY = "eHotkey";
const HOTKEY_DEFAULT = "Control+Shift+Space";
/* WHY A COMBINATION IS REFUSED, or "" for one that may be registered: "shape" for anything but
   Control, Alt and Shift over a letter, a digit, Space or F1 to F24; "altgr" where Control and Alt
   meet, which is AltGr on Windows and types letters on many layouts; "bare" for no Control and no
   Alt; "system" for what Windows answers itself; "used" for the families browsers and chat tools
   answer. F13 to F24 type nothing and no program in either family answers them. Pure. */
function hotkeyRefusal(accel) {
  const parts = String(accel || "").split("+"), key = parts.pop() || "";
  if (parts.some((m, i) => ["Control", "Alt", "Shift"].indexOf(m) < 0 || parts.indexOf(m) !== i)
      || !/^([A-Z0-9]|Space|F([1-9]|1[0-9]|2[0-4]))$/.test(key)) return "shape";
  const has = m => parts.indexOf(m) > -1, ctrl = has("Control"), alt = has("Alt"), shift = has("Shift");
  if (ctrl && alt) return "altgr";
  if (/^F(1[3-9]|2[0-4])$/.test(key)) return "";
  if (!ctrl && !alt) return "bare";
  if (alt && (shift || key === "Space" || key === "F4")) return "system";
  if (/^[A-Z0-9]$/.test(key) && !(ctrl && shift && /^[0-9]$/.test(key))) return "used";
  if (ctrl && !shift && (key === "Space" || /^F/.test(key))) return "used";
  return "";
}
/* What the desk asks for: the default until somebody chooses, "" for off. A value the rule refuses
   is off, since a desk file can be written by hand. */
function hotkeyWanted() {
  if (deskKeys === undefined) deskKeys = readDesk();
  const v = deskKeys[HOTKEY_KEY];
  if (typeof v !== "string") return HOTKEY_DEFAULT;
  return (v && !hotkeyRefusal(v)) ? v : "";
}
let hotkeyHeld = "";                             // the combination registered now, or ""
let hotkeyTaken = "";                            // the last one Windows refused, or ""
/* Registers `accel` in place of what is held; true where it is now held. On a refusal what was held
   before is put back, so a combination another program owns never leaves the desk with none. */
function holdHotkey(accel) {
  if (accel === hotkeyHeld) return true;
  const was = hotkeyHeld;
  try {
    if (was) globalShortcut.unregister(was);
    hotkeyHeld = "";
    if (!accel) return true;
    if (globalShortcut.register(accel, pickToggle)) {
      hotkeyHeld = accel;
      hotkeyTaken = "";
      console.log("etiuda: the hotkey " + accel + " is registered");
      return true;
    }
    hotkeyTaken = accel;
    console.error("etiuda: Windows refused the hotkey " + accel + ", which another program holds");
    if (was && globalShortcut.register(was, pickToggle)) hotkeyHeld = was;
  } catch (e) { console.error("etiuda: the hotkey could not be registered - " + e.message); }
  return false;
}
/* THE HOTKEY FOLLOWS THE DESK, as the theme and the catalog folder do, so a desk written by
   Settings, by a reset or by hand is the one answer to which combination is held. Not before the
   app is ready, when globalShortcut cannot be used. */
let hotkeyReady = false;
function syncHotkey() { if (hotkeyReady) holdHotkey(hotkeyWanted()); }

/* Where the picker opens: below and a little left of the pointer, above it where the work area
   has no room below, and wholly inside that work area. Pure. */
const PICK_SIZE = { width: 600, height: 424 };
function pickerPlace(pt, area, size) {
  const w = Math.min(size.width, area.width), h = Math.min(size.height, area.height);
  let x = pt.x - 40, y = pt.y + 18;
  if (y + h > area.y + area.height) y = pt.y - 18 - h;
  x = Math.min(Math.max(x, area.x), area.x + area.width - w);
  y = Math.min(Math.max(y, area.y), area.y + area.height - h);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}
/* On Windows the page's own copy puts CRLF on the clipboard (Chromium turns each line feed into
   the platform's pair as it writes), so the picker's copy does the same and the two paste alike. */
function pickClipText(text, platform) {
  const s = String(text == null ? "" : text);
  return platform === "win32" ? s.replace(/\r?\n/g, "\r\n") : s;
}

/* THE PICKER'S PAGE RUNS THIS, NOT THIS PROCESS: it is serialised whole into the document and
   hashed for its policy, so it may close over nothing in this file. Its words, its colours and its
   rows all arrive from the desk's own page through E_PICK. */
function pickPage() {
  const P = window.E_PICK, q = document.getElementById("q"), box = document.getElementById("rows");
  if (!P || !q || !box) return;
  const who = document.getElementById("who"), count = document.getElementById("count"), keys = document.getElementById("keys"), langBtn = document.getElementById("lang");
  let rows = [], last = null, words = {}, chords = {}, at = 0, asked = 0, said = "", sent = null, closing = false;
  let suggest = [], sgAt = -1, picked = [];
  /* THE KEYSTROKE FILTERS HERE, on the rows the open handed over. The order is the desk's
     search: the same terms, the same tiers, the same lift. An open without that index still
     asks the desk. */
  let bank = null, vocab = [], tally = null, cap = 50, restRows = [], restSaid = "";
  const FOLD = {
    "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n", "ó": "o", "ś": "s", "ź": "z", "ż": "z",
    "Ą": "a", "Ć": "c", "Ę": "e", "Ł": "l", "Ń": "n", "Ó": "o", "Ś": "s", "Ź": "z", "Ż": "z",
    "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a", "è": "e", "é": "e", "ê": "e", "ë": "e",
    "ì": "i", "í": "i", "î": "i", "ï": "i", "ò": "o", "ô": "o", "õ": "o", "ö": "o", "ø": "o",
    "ù": "u", "ú": "u", "û": "u", "ü": "u", "ý": "y", "ÿ": "y", "ñ": "n", "ç": "c",
    "š": "s", "ž": "z", "č": "c", "ř": "r", "ů": "u", "ě": "e", "ť": "t", "ď": "d", "ň": "n",
    "ā": "a", "ē": "e", "ī": "i", "ō": "o", "ū": "u", "æ": "ae", "œ": "oe", "ß": "ss", "đ": "d", "þ": "th",
    "À": "a", "Á": "a", "Â": "a", "Ä": "a", "È": "e", "É": "e", "Ê": "e", "Ë": "e", "Í": "i", "Î": "i",
    "Ò": "o", "Ô": "o", "Ö": "o", "Ù": "u", "Ú": "u", "Ü": "u", "Ñ": "n", "Ç": "c", "Š": "s", "Ž": "z"
  };
  const FOLD_RE = new RegExp("[" + Object.keys(FOLD).join("") + "]", "g");
  const FIELDS = ["title", "keys", "meta", "body"];
  const WEIGHT = { title: 10, keys: 6, meta: 3, body: 1 }; /* plant:pick-weight */
  const Q_EXACT = 3, Q_PREFIX = 2, Q_LOOSE = 1;
  const SAME_FIELD = 1.5, ADJACENT = 8, TITLE_START = 4, PROX = 6;
  const PROX_FIELD = { title: 1, keys: 0.8, meta: 0.6, body: 0.5 };
  const WORD_PREFIX_MIN = 5, WORD_STEM_MIN = 4;
  const fold = s => {
    const t = String(s == null ? "" : s);
    for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) > 127) return t.replace(FOLD_RE, ch => FOLD[ch] || ch);
    return t;
  };
  const sharedPrefixLen = (a, b) => {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
    return i;
  };
  const wordMatchesTerm = (word, term) => {
    if (!word || !term) return false;
    if (word.indexOf(term) === 0) return true;
    if (word.length >= WORD_STEM_MIN && term.indexOf(word) === 0) return true;
    if (term.length < WORD_PREFIX_MIN) return false;
    return sharedPrefixLen(word, term) >= WORD_PREFIX_MIN;
  };
  const editDistance1 = (a, b) => {
    if (a === b) return false;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0;
    while (i < la && i < lb && a.charCodeAt(i) === b.charCodeAt(i)) i++;
    if (la === lb) {
      if (a.slice(i + 1) === b.slice(i + 1)) return true;
      return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
    }
    return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
  };
  const reaches = term => {
    for (let i = 0; i < vocab.length; i++) {
      const w = vocab[i][0];
      if (w.indexOf(term) !== -1) return true;
      if (wordMatchesTerm(w, term)) return true;
    }
    return false;
  };
  const correctTerm = term => {
    if (term.length < 5 || reaches(term)) return "";
    let fix = "", bestN = 0;
    for (let i = 0; i < vocab.length; i++) {
      const w = vocab[i][0], n = vocab[i][1];
      if (w.length < 5 || !editDistance1(term, w)) continue;
      if (n > bestN) { bestN = n; fix = w; }
    }
    return fix;
  };
  const termsOf = q => {
    const raw = String(q == null ? "" : q).slice(0, 200);
    const t = fold(raw.trim().toLowerCase());
    if (!t) return [];
    return t.split(/\s+/).filter(Boolean).map(term => correctTerm(term) || term);
  };
  const cardMatches = (card, terms) => {
    if (!terms.length) return true;
    const hay = card.hay || "";
    if (terms.every(t => hay.indexOf(t) !== -1)) return true;
    const uniq = card.uniq || [];
    return terms.every(t => hay.indexOf(t) !== -1 || uniq.some(w => wordMatchesTerm(w, t)));
  };
  const termWordQuality = (word, term) => {
    if (word === term) return Q_EXACT;
    if (word.indexOf(term) === 0) return Q_PREFIX;
    if (word.length >= WORD_STEM_MIN && term.indexOf(word) === 0) return Q_PREFIX;
    if (term.length >= WORD_PREFIX_MIN && sharedPrefixLen(word, term) >= WORD_PREFIX_MIN) return Q_PREFIX;
    return wordMatchesTerm(word, term) ? Q_LOOSE : 0;
  };
  const termFieldQuality = (idx, field, term) => {
    const words = (idx.words && idx.words[field]) || [];
    let best = 0;
    for (let i = 0; i < words.length; i++) {
      const qv = termWordQuality(words[i], term);
      if (qv > best) { best = qv; if (best === Q_EXACT) break; }
    }
    const text = (idx.fields && idx.fields[field]) || "";
    if (!best && text.indexOf(term) !== -1) best = Q_LOOSE;
    return best;
  };
  const termPositions = (idx, field, term) => {
    const words = (idx.words && idx.words[field]) || [], out = [];
    for (let i = 0; i < words.length; i++) if (termWordQuality(words[i], term)) out.push(i);
    return out;
  };
  const minWindowSpan = lists => {
    for (let i = 0; i < lists.length; i++) if (!lists[i].length) return -1;
    const ptr = new Array(lists.length).fill(0);
    let best = Infinity;
    for (;;) {
      let lo = Infinity, hi = -Infinity, loIdx = 0;
      for (let i = 0; i < lists.length; i++) {
        const v = lists[i][ptr[i]];
        if (v < lo) { lo = v; loIdx = i; }
        if (v > hi) hi = v;
      }
      const span = hi - lo + 1;
      if (span < best) best = span;
      if (best === lists.length) break;
      ptr[loIdx]++;
      if (ptr[loIdx] >= lists[loIdx].length) break;
    }
    return best === Infinity ? -1 : best;
  };
  const proximityBonus = (idx, terms) => {
    if (!terms || terms.length < 2) return 0;
    let best = 0;
    for (let f = 0; f < FIELDS.length; f++) {
      const field = FIELDS[f];
      const span = minWindowSpan(terms.map(t => termPositions(idx, field, t)));
      if (span < 0) continue;
      const gap = Math.max(0, span - terms.length);
      const v = PROX * (PROX_FIELD[field] || 0.5) / (1 + gap);
      if (v > best) best = v;
    }
    return best;
  };
  const queryScore = (idx, terms) => {
    const fieldHasAll = { title: true, keys: true, meta: true, body: true };
    let score = 0, strong = true;
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      let best = 0, inStrong = false;
      for (let f = 0; f < FIELDS.length; f++) {
        const field = FIELDS[f];
        const qv = termFieldQuality(idx, field, term);
        if (!qv) { fieldHasAll[field] = false; continue; }
        const v = qv * WEIGHT[field];
        if (v > best) best = v;
        if (field !== "body") inStrong = true;
      }
      if (!inStrong) strong = false;
      score += best;
    }
    if (FIELDS.some(f => fieldHasAll[f])) score *= SAME_FIELD;
    score += proximityBonus(idx, terms);
    const title = (idx.fields && idx.fields.title) || "";
    if (terms.length > 1 && title.indexOf(terms.join(" ")) !== -1) score += ADJACENT;
    if (title.indexOf(terms[0]) === 0) score += TITLE_START;
    return { tier: strong ? 0 : 1, score: score };
  };
  const liftByUse = hits => {
    let from = 0;
    while (from < hits.length) {
      const g = hits[from];
      let end = from + 1;
      while (end < hits.length && hits[end].band === g.band && hits[end].tier === g.tier) end++;
      const run = hits.slice(from, end).map((m, i) => ({ m: m, i: i, k: i - (m.lift | 0) }));
      if (run.some(o => o.k !== o.i)) {
        run.sort((a, b) => a.k - b.k || a.i - b.i);
        run.forEach((o, i) => { hits[from + i] = o.m; });
      }
      from = end;
    }
  };
  const pickCountText = (shown, total) => {
    if (!total || !tally) return "";
    const phrase = n => {
      if (n === 1) return String(tally.one).replace("{N}", n);
      const ten = n % 10, hundred = n % 100;
      const few = ten >= 2 && ten <= 4 && !(hundred >= 12 && hundred <= 14);
      return String(few ? tally.few : tally.many).replace("{N}", n);
    };
    const all = phrase(total);
    return shown < total ? String(tally.shown).split("{SHOWN}").join(String(shown)).split("{COUNT}").join(all) : all;
  };
  const pickQueryRows = q => {
    const terms = termsOf(q);
    if (!terms.length) return { rows: restRows.slice(), count: restSaid };
    const hits = [];
    for (let i = 0; i < bank.length; i++) {
      const card = bank[i];
      if (!cardMatches(card, terms)) continue;
      const sc = queryScore(card, terms);
      const mul = card.favMul == null ? 1 : card.favMul;
      let score = sc.score + (card.aff || 0);
      score *= mul;
      hits.push({ band: card.band | 0, tier: sc.tier, score: score, ord: card.ord | 0, lift: card.lift | 0, rows: card.rows || [] });
    }
    hits.sort((a, b) => a.band - b.band || a.tier - b.tier || b.score - a.score || a.ord - b.ord);
    liftByUse(hits);
    const out = [];
    let total = 0;
    const limit = cap > 0 ? cap : 50;
    for (let i = 0; i < hits.length; i++) {
      const rs = hits[i].rows;
      total += rs.length;
      for (let vi = 0; vi < rs.length && out.length < limit; vi++) out.push(rs[vi]);
    }
    return { rows: out, count: pickCountText(out.length, total) };
  };
  function takeIndex(o, full) {
    if (!o) return;
    if (Array.isArray(o.bank)) {
      bank = o.bank;
      vocab = Array.isArray(o.vocab) ? o.vocab : [];
      tally = o.tally || null;
      cap = (o.cap | 0) > 0 ? (o.cap | 0) : 50;
    } else if (full) {
      bank = null; vocab = []; tally = null;
    }
    if (Array.isArray(o.rest)) { restRows = o.rest; restSaid = o.restCount || ""; }
  }
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ICON_AGAIN = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor"'
    + ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.5v3h-3"/></svg>';
  const ICON_STAMP = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor"'
    + ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.2 12.5l.6-4.2a2.6 2.6 0 1 1 3.4 0l.6 4.2"/>'
    + '<path d="M5 17v-2.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2V17z" fill="currentColor"/><path d="M6 20.5h13"/></svg>';
  const stamp = () => '<span class="st" title="' + esc(words.stamp) + '">' + ICON_STAMP + '</span>';
  const list = () => (!q.value.trim() && last)
    ? [Object.assign({ again: true }, last)].concat(rows.filter(r => r.id !== last.id || r.vi !== last.vi)) : rows;
  /* A CARD OF SEVERAL REPLIES IS ONE GROUP: its title once, over its replies, each named by its tag. The first nine
     rows after the reply copied last carry Ctrl and their digit, and that one Ctrl+0. */
  const same = (a, b) => !!a && !!b && !a.again && !b.again && a.id === b.id;
  function takeSuggest(id, multi) {
    if (typeof P.takeSuggest !== "function") return;
    const mine = ++asked;
    Promise.resolve(P.takeSuggest(id, !!multi)).then(text => {
      if (mine !== asked) return;
      let o = {};
      try { o = JSON.parse(text) || {}; } catch (e) { o = {}; }
      if (!Array.isArray(o.rows)) return;
      rows = o.rows;
      said = o.count || "";
      takeIndex(o, false);
      if (!Array.isArray(o.rest) && !String(q.value || "").trim()) { restRows = rows.slice(); restSaid = said; }
      if ("last" in o) last = o.last || null;
      if (Array.isArray(o.picked)) picked = o.picked;
      sgAt = -1;
      at = 0;
      box.scrollTop = 0;
      paintLang(o);
      if (who) {
        if (o.who != null) who.hidden = !o.who;
        if (o.name != null) { who.value = o.name; sent = who.value; }
      }
      paint(false);
    });
  }
  /* Drawn only while suggestions are on and the query is empty, so a quiet clipboard adds no element. */
  function paintStrip() {
    const on = suggest.length > 0 && !String(q.value || "").trim();
    const host = document.getElementById ? document.getElementById("sg") : null;
    if (!on) {
      if (host && host.remove) host.remove();
      return;
    }
    let el = host;
    if (!el) {
      if (!document.createElement || !box.parentNode) return;
      el = document.createElement("div");
      el.id = "sg";
      el.setAttribute("role", "group");
      if (words.suggestTip) { el.setAttribute("aria-label", words.suggestTip); el.title = words.suggestTip; }
      const lab = document.createElement("div");
      lab.className = "sg-lab";
      lab.textContent = words.suggest || "";
      el.appendChild(lab);
      el.addEventListener("mousedown", ev => {
        const b = ev.target && ev.target.closest && ev.target.closest("button");
        if (b) ev.preventDefault();
      });
      el.addEventListener("click", ev => {
        const b = ev.target && ev.target.closest && ev.target.closest("button");
        const id = b && b.getAttribute ? b.getAttribute("data-id") : "";
        if (id) takeSuggest(id, !!(ev.ctrlKey || ev.metaKey));
      });
      box.parentNode.insertBefore(el, box);
    }
    const lab = el.querySelector ? el.querySelector(".sg-lab") : (el.children && el.children[0]);
    if (lab) lab.textContent = words.suggest || "";
    const old = el.querySelectorAll ? [...el.querySelectorAll("button")] : [];
    old.forEach(b => { if (b.remove) b.remove(); });
    suggest.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.id = "s" + i;
      const isPicked = picked.indexOf(String(s.id)) > -1;
      const cls = [];
      if (i === sgAt) cls.push("on");
      if (isPicked) cls.push("picked");
      b.className = cls.join(" ");
      b.textContent = s.name || "";
      b.setAttribute("data-id", String(s.id));
      b.setAttribute("aria-selected", i === sgAt ? "true" : "false");
      b.setAttribute("aria-pressed", isPicked ? "true" : "false");
      el.appendChild(b);
    });
  }
  const paint = keyed => {
    const all = list();
    if (at >= all.length) at = all.length ? all.length - 1 : 0;
    let n = 0;
    const html = all.map((r, i) => {
      const grouped = same(all[i - 1], r) || same(r, all[i + 1]);
      const head = grouped && !same(all[i - 1], r)
        ? '<li class="grp" role="presentation"><span class="t">' + esc(r.t) + '</span>' + (r.commits ? stamp() : '') + '</li>' : '';
      const key = r.again ? "Ctrl+0" : (++n <= 9 ? "Ctrl+" + n : "");
      const replyOn = sgAt < 0 && i === at;
      const cls = (grouped ? ["in"] : []).concat(replyOn ? ["on"] : []);
      return head + '<li role="option" id="r' + i + '" data-i="' + i + '"' + (cls.length ? ' class="' + cls.join(" ") + '"' : '')
        + (replyOn ? ' aria-selected="true"' : ' aria-selected="false"')
        + (r.again ? ' title="' + esc(words.again) + '"' : '') + '>'
        + '<span class="n">' + (key ? '<kbd>' + key + '</kbd>' : '') + '</span>'
        + (grouped ? (r.tag ? '<span class="g">' + esc(r.tag) + '</span>' : '') + '<span class="x">' + esc(r.x) + '</span>'
          : '<span class="t">' + (r.again ? ICON_AGAIN : '') + esc(r.t) + '</span>' + (r.commits ? stamp() : '')
            + '<span class="x">' + esc(r.x) + '</span>' + (r.tag ? '<span class="g">' + esc(r.tag) + '</span>' : ''))
        + '</li>';
    }).join("");
    const keep = box.scrollTop;
    box.innerHTML = all.length ? html
      : '<li class="none" role="presentation">' + esc(q.value.trim() ? words.none : words.empty) + '</li>';
    box.scrollTop = keep;
    q.setAttribute("aria-activedescendant", sgAt >= 0 ? "s" + sgAt : (all.length ? "r" + at : ""));
    paintStrip();
    box.querySelectorAll(".t,.x").forEach(el => el.classList.toggle("cut", el.scrollWidth > el.clientWidth + 1));
    if (count) count.textContent = all.length ? said : "";
    /* A key that moved the mark brings it into view, and its group's title with it at the top; the pointer's mark
       scrolls nothing. */
    const on = keyed && box.querySelector ? box.querySelector("li.on") : null;
    if (on && on.scrollIntoView) {
      on.scrollIntoView({ block: "nearest" });
      const above = on.previousElementSibling;
      if (above && above.classList.contains("grp") && above.getBoundingClientRect().top < box.getBoundingClientRect().top)
        above.scrollIntoView({ block: "nearest" });
    }
  };
  const take = (r, other) => {
    if (!r) return;
    const what = r.again ? { last: true } : { id: r.id, vi: r.vi };
    P.copy(JSON.stringify(other ? Object.assign(what, { other: 1 }) : what));
  };
  /* The keys as they work, under the list: each line holds {KEY} where its key is drawn. */
  const legend = () => {
    if (!keys) return;
    keys.innerHTML = [["Enter", words.keyCopy], ["Shift+Enter", words.keyOther], ["Esc", words.keyClose]]
      .filter(k => k[1]).map(k => '<span>' + esc(k[1]).split("{KEY}").join('<kbd>' + k[0] + '</kbd>') + '</span>').join("");
  };
  const matchChord = (e, c) => {
    if (!c || (!c.code && !c.key)) return false;
    if (!!e.ctrlKey !== !!c.ctrl) return false;
    if (!!e.altKey !== !!c.alt) return false;
    if (!!e.shiftKey !== !!c.shift) return false;
    if (!!e.metaKey !== !!c.meta) return false;
    if (c.code && e.code && !(/^Numpad/.test(e.code) && !/^Numpad/.test(c.code))) return e.code === c.code;
    const k = String(e.key || "");
    const ek = k.length === 1 ? k.toLowerCase() : k;
    return ek === c.key || k === c.key;
  };
  const matchTab = e => {
    const ids = ["tabNext", "tabPrev", "tabNew"];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], list = chords[id];
      if (Array.isArray(list)) {
        for (let j = 0; j < list.length; j++) {
          if (matchChord(e, list[j])) return id;
        }
      }
    }
    return null;
  };
  const paintLang = o => {
    if (!langBtn || !o || !o.lang) return;
    langBtn.hidden = (o.langs | 0) < 2;
    langBtn.textContent = String(o.lang).toUpperCase();
  };
  const paintOpen = (o, fresh) => {
    if (o.words) {
      words = o.words;
      if (langBtn && words.langTitle) langBtn.title = words.langTitle;
      legend();
    }
    paintLang(o);
    if (who) {
      who.hidden = !o.who;
      who.value = o.name || "";
      sent = who.value;
      closing = false;
    }
    rows = Array.isArray(o.rows) ? o.rows : [];
    said = o.count || "";
    takeIndex(o, true);
    if (!Array.isArray(o.rest)) { restRows = rows.slice(); restSaid = said; }
    last = o.last || null;
    suggest = Array.isArray(o.suggest) ? o.suggest.filter(s => s && s.id) : [];
    picked = Array.isArray(o.picked) ? o.picked : [];
    sgAt = -1;
    q.value = ""; at = (last && list().length > 1) ? 1 : 0; asked++;
    box.scrollTop = 0;
    paint(false);
    if (fresh && who && !who.hidden) who.focus();
    else q.focus();
  };
  const onTabKey = (e, tabId) => {
    e.preventDefault();
    if (typeof P.tab === "function") {
      /* A name typed and not yet sent belongs to the conversation in front: it reaches the desk before the switch. */
      const pending = !!who && !who.hidden && !closing && who.value !== sent && typeof P.who === "function";
      if (pending) sent = who.value;
      const before = pending ? P.who(who.value, q.value) : Promise.resolve();
      const mine = ++asked;
      before.then(() => P.tab(tabId)).then(text => {
        if (mine !== asked) return;
        let o = {};
        try { o = JSON.parse(text) || {}; } catch (_) { o = {}; }
        paintOpen(o, !!o.fresh);
      });
    }
  };
  P.onOpen(text => {
    let o = {};
    try { o = JSON.parse(text) || {}; } catch (e) { o = {}; }
    /* The organisation's order of the strip, after the opening: the strip alone is painted again, so the row under the
       pointer, the scroll and the box stay as the agent left them. */
    if (o.reorder === true) {
      suggest = (Array.isArray(o.suggest) ? o.suggest : []).filter(s => s && s.id);
      if (sgAt >= suggest.length) sgAt = -1;
      paint(false);
      return;
    }
    const look = o.look || {}, root = document.documentElement;
    Object.keys(look.vars || {}).forEach(k => root.style.setProperty(k, look.vars[k]));
    root.dataset.theme = look.theme || "";
    root.classList.toggle("glass", !!look.glass);
    root.classList.toggle("still", !!look.still);
    words = o.words || {};
    chords = o.chords || {};
    root.lang = words.lang || "en";
    q.placeholder = words.search || "";
    box.setAttribute("aria-label", words.list || "");
    if (who) who.title = words.who || "";
    if (langBtn) langBtn.title = words.langTitle || "";
    legend();
    paintOpen(o, false);
    P.ready();
  });
  q.addEventListener("input", () => {
    paintStrip();
    if (bank) {
      asked++;
      if (typeof performance !== "undefined" && performance.mark) performance.mark("pick-key-start");
      const found = pickQueryRows(q.value);
      rows = found.rows;
      said = found.count;
      at = 0;
      box.scrollTop = 0;
      paint(false);
      if (typeof performance !== "undefined" && performance.mark && performance.measure) {
        performance.mark("pick-key-frame");
        try { performance.measure("pick-answer", "pick-key-start", "pick-key-frame"); } catch (e) {}
      }
      return;
    }
    const mine = ++asked;
    P.find(q.value).then(text => {
      if (mine !== asked) return;
      let o = {};
      try { o = JSON.parse(text) || {}; } catch (e) { o = {}; }
      rows = Array.isArray(o.rows) ? o.rows : [];
      said = o.count || "";
      at = 0;
      box.scrollTop = 0;
      paint(false);
    });
  });
  q.addEventListener("keydown", e => {
    const tabId = matchTab(e);
    if (tabId) { onTabKey(e, tabId); return; }
    const all = list();
    if (e.key === "Escape") { e.preventDefault(); P.close(); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      if (who && !who.hidden) who.focus();
      return;
    }
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : e.key === "PageDown" ? 8 : e.key === "PageUp" ? -8 : 0;
    if (step) {
      e.preventDefault();
      const stripOn = suggest.length > 0 && !q.value.trim();
      if (sgAt >= 0 && stripOn) {
        if (Math.abs(step) === 1 && step < 0) {
          sgAt = sgAt <= 0 ? suggest.length - 1 : sgAt - 1;
          paint(true);
          return;
        }
        if (Math.abs(step) === 1 && sgAt < suggest.length - 1) {
          sgAt++;
          paint(true);
          return;
        }
        sgAt = -1;
        if (Math.abs(step) === 1) { paint(true); return; }
      } else if (stripOn && step === -1 && at === 0) {
        sgAt = suggest.length - 1;
        paint(true);
        return;
      }
      if (!all.length) return;
      /* The arrows go round; a page stops at either end. */
      at = Math.abs(step) === 1 ? (at + step + all.length) % all.length : Math.min(Math.max(at + step, 0), all.length - 1);
      paint(true);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (sgAt >= 0 && suggest[sgAt] && !q.value.trim()) { takeSuggest(suggest[sgAt].id, !!(e.ctrlKey || e.metaKey)); return; }
      take(all[at], e.shiftKey);
      return;
    }
    const d = /^(Digit|Numpad)([0-9])$/.exec(e.code || "");
    if (d && e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (d[2] === "0") { take({ again: true }, e.shiftKey); return; }
      take(all.filter(r => !r.again)[+d[2] - 1], e.shiftKey);
    }
  });
  if (who) {
    const send = () => {
      if (closing || who.value === sent) return;
      sent = who.value;
      const mine = ++asked;
      P.who(who.value, q.value).then(text => {
        if (mine !== asked) return;
        let o = {};
        try { o = JSON.parse(text) || {}; } catch (e) { o = {}; }
        rows = Array.isArray(o.rows) ? o.rows : [];
        said = o.count || "";
        takeIndex(o, false);
        if (!Array.isArray(o.rest) && !String(q.value || "").trim()) { restRows = rows.slice(); restSaid = said; }
        paintLang(o);
        paint(false);
        if (o.name != null) { who.value = o.name; sent = who.value; }
      });
    };
    who.addEventListener("keydown", e => {
      const tabId = matchTab(e);
      if (tabId) { onTabKey(e, tabId); return; }
      if (e.key === "Escape") { closing = true; e.preventDefault(); P.close(); return; }
      if (e.key === "Tab" || e.key === "Enter") {
        send();
        e.preventDefault();
        q.focus();
        return;
      }
    });
    who.addEventListener("blur", send);
  }
  if (langBtn) {
    langBtn.addEventListener("click", () => {
      if (typeof P.lang === "function") {
        const mine = ++asked;
        P.lang().then(text => {
          if (mine !== asked) return;
          let o = {};
          try { o = JSON.parse(text) || {}; } catch (_) { o = {}; }
          paintOpen(o, false);
          if (q) q.focus();
        });
      }
    });
  }
  box.addEventListener("mousemove", e => {
    const li = e.target.closest && e.target.closest("li[data-i]");
    if (li && (+li.dataset.i !== at || sgAt >= 0)) { at = +li.dataset.i; sgAt = -1; paint(false); }
  });
  box.addEventListener("mousedown", e => e.preventDefault());
  box.addEventListener("click", e => {
    const li = e.target.closest && e.target.closest("li[data-i]");
    if (li) take(list()[+li.dataset.i], e.shiftKey);
  });
}
const PICK_SCRIPT = "(" + pickPage.toString() + ")();";
const PICK_HASH = "'sha256-" + crypto.createHash("sha256").update(PICK_SCRIPT, "utf8").digest("base64") + "'";
/* The picker's document. Its colours are the desk's own, sent at every opening as the values the
   desk's sheet computed, so the fallbacks here are only what a first frame could show. */
function pickerDoc() {
  return '<!DOCTYPE html>\n<html lang="en">\n<meta charset="utf-8">\n'
    + '<meta http-equiv="Content-Security-Policy" content="' + policyFor([PICK_HASH]) + '">\n'
    + '<title>Etiuda</title>\n<style>\n'
    + ':root{color-scheme:light;--panel:#fff;--panel-raised:#fff;--ink:#0f172a;--dim:#475569;--line:#e4e8ee;--line-strong:#cbd2dc;'
    + '--accent:#0e67d8;--field:#fdfdfd;--field-line:#e0e4ea;--field-edge:#aab3c0;--radius-sm:8px;'
    + '--intent-type:16.5px;--warn:#c2410c;--mono:ui-monospace,Consolas,monospace;'
    + '--sans:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}\n'
    + ':root[data-theme=dark]{color-scheme:dark}\n'
    + 'html,body{margin:0;height:100%;overflow:hidden;background:var(--panel-raised)}\n'
    + ':root.glass,:root.glass body{background:transparent}\n'
    + ':root.glass body{background:color-mix(in srgb,var(--panel-raised) 78%,transparent)}\n'
    + 'body{box-sizing:border-box;padding:8px;display:flex;flex-direction:column;gap:6px;color:var(--ink);'
    + 'font:14px/1.35 var(--sans);cursor:default;user-select:none}\n'
    + '#top{flex:0 0 40px;display:flex;gap:6px;min-width:0}\n'
    + '#q{box-sizing:border-box;flex:1 1 auto;min-width:0;padding:0 12px;border:1px solid var(--field-line);'
    + 'border-bottom-color:var(--field-edge);border-radius:var(--radius-sm);background:var(--field);color:var(--ink);'
    + 'font:var(--intent-type) var(--sans);outline:none}\n'
    + '#q:focus{border-bottom-color:var(--accent);box-shadow:inset 0 -1px 0 var(--accent)}\n'
    + '#who{box-sizing:border-box;flex:0 1 auto;max-width:34%;min-width:0;padding:0 10px;border:1px solid var(--line);'
    + 'border-radius:var(--radius-sm);background:var(--field);color:var(--ink);font-size:13px;outline:none}\n'
    + '#who:focus{border-bottom-color:var(--accent);box-shadow:inset 0 -1px 0 var(--accent)}\n'
    + '#who[hidden]{display:none}\n'
    + '#lang{box-sizing:border-box;flex:0 0 auto;padding:0 8px;border:1px solid var(--line);'
    + 'border-radius:var(--radius-sm);background:var(--field);color:var(--dim);font:600 11px var(--mono);cursor:pointer;outline:none}\n'
    + '#lang:hover{color:var(--ink);border-color:var(--line-strong)}\n'
    + '#lang:focus{border-bottom-color:var(--accent);box-shadow:inset 0 -1px 0 var(--accent)}\n'
    + '#lang[hidden]{display:none}\n'
    + '#sg{flex:0 0 auto;display:flex;flex-direction:column;gap:2px;min-width:0}\n'
    + '#sg .sg-lab{padding:0 10px 2px;color:var(--dim);font-size:12px}\n'
    + '#sg button{box-sizing:border-box;display:block;width:100%;height:32px;margin:0;padding:0 10px;border:0;'
    + 'border-radius:var(--radius-sm);background:transparent;color:var(--ink);font:600 14px var(--sans);text-align:left;cursor:default}\n'
    + '#sg button.on{background:color-mix(in srgb,var(--accent) 20%,transparent);color:var(--accent)}\n'
    + '#sg button.picked{background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent)}\n'
    + '#sg button.picked.on{background:color-mix(in srgb,var(--accent) 28%,transparent);color:var(--accent)}\n'
    + '#rows{flex:1 1 auto;min-height:0;margin:0;padding:0;list-style:none;overflow-x:hidden;overflow-y:auto;'
    + 'overscroll-behavior:contain;scrollbar-width:thin}\n'
    + '#rows li{display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;border-radius:var(--radius-sm);'
    + 'white-space:nowrap;transition:background-color .1s}\n'
    + '#rows li.on{background:color-mix(in srgb,var(--accent) 20%,transparent)}\n'
    + '#rows li.on .t,#rows li.on .n,#rows li.on .g{color:var(--accent)}\n'
    + '#rows li.grp{height:24px;align-items:flex-end;padding-bottom:2px;font-size:12.5px}\n'
    + '#rows li.grp .t{max-width:none;color:var(--dim)}\n'
    + '#rows li.in{padding-left:24px}\n'
    + '.n{flex:0 0 50px;display:flex;font:10.5px var(--mono);color:var(--dim)}\n'
    + 'kbd{font:10.5px var(--mono);padding:0 4px;border:1px solid var(--line-strong);border-radius:4px}\n'
    + '.t{flex:0 1 auto;max-width:45%;display:flex;align-items:center;gap:6px;overflow:hidden;font-weight:600}\n'
    + '.t svg{flex:0 0 auto}\n'
    + '.x{flex:1 1 0;min-width:0;overflow:hidden;color:var(--dim);font-size:13px}\n'
    + '.cut{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 28px),transparent);'
    + 'mask-image:linear-gradient(to right,#000 calc(100% - 28px),transparent)}\n'
    + '.st{flex:0 0 auto;display:flex;color:var(--warn)}\n'
    + '.g{flex:0 0 auto;font:10px var(--mono);color:var(--dim)}\n'
    + '#rows li.none{height:auto;padding:14px 12px;color:var(--dim);white-space:normal}\n'
    + 'footer{flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:6px 10px 0;border-top:1px solid var(--line);'
    + 'color:var(--dim);font-size:12px;white-space:nowrap;overflow:hidden}\n'
    + '#count{margin-right:auto}\n#keys{display:flex;gap:14px}\n#keys kbd{margin-right:5px}\n'
    + ':root.still #rows li{transition:none}\n'
    + '@media (prefers-reduced-motion:reduce){#rows li{transition:none}}\n'
    + '@media (forced-colors:active){#rows li.on{outline:2px solid Highlight;outline-offset:-2px}'
    + '#q:focus{outline:2px solid Highlight}}\n'
    + '</style>\n'
    + '<div id="top"><input id="q" type="text" role="combobox" aria-expanded="true" aria-controls="rows" aria-autocomplete="list"'
    + ' autocomplete="off" spellcheck="false"><input id="who" type="text" autocomplete="off" spellcheck="false" hidden>'
    + '<button id="lang" type="button" hidden></button></div>\n'
    + '<ul id="rows" role="listbox"></ul>\n'
    + '<footer><span id="count" aria-live="polite"></span><span id="keys"></span></footer>\n'
    + '<script>' + PICK_SCRIPT + '</script>\n';
}

/* THE WORD AFTER A PICK, where the picker stood: "Pasted" once the caret helper has pressed Ctrl+V in the window the
   agent came from, else that the reply waits on the clipboard, which stays up as long as the desk's own toast that asks
   for an act. A window of its own that takes neither the focus nor a click, so the chat keeps both. */
const PICK_NOTE = { width: 300, height: 40 }, PICK_NOTE_MS = 1700, PICK_NOTE_HAND_MS = 6000;
let pickNoteWin = null, pickNoteTimer = null, pickSaid = null;
function pickNoteDoc(text, pasted, said) {
  const look = (said && said.look) || {}, vars = look.vars || {};
  const tokens = Object.keys(vars).filter(k => /^--[\w-]+$/.test(k) && !/[<>{};]/.test(String(vars[k])))
    .map(k => k + ":" + vars[k] + ";").join("");
  const html = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const icon = pasted ? '<path d="M3.5 8.5l3 3 6-7"/>' : '<rect x="4" y="3" width="8" height="11" rx="1.5"/><path d="M6.5 3V2h3v1"/>';
  return '<!DOCTYPE html>\n<html lang="' + (/^[a-z]{2,3}$/.test(String(said && said.lang)) ? said.lang : "en") + '">\n<meta charset="utf-8">\n'
    + '<meta http-equiv="Content-Security-Policy" content="' + policyFor(["'none'"]) + '">\n'
    + '<title>Etiuda</title>\n<style>\n'
    + ':root{color-scheme:' + (look.theme === "dark" ? "dark" : "light") + ';--panel-raised:#fff;--ink:#0f172a;--line:#e4e8ee;'
    + '--accent:#0e67d8;--radius-sm:8px;--sans:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;' + tokens + '}\n'
    + 'html{height:100%;background:transparent}\n'
    + 'body{box-sizing:border-box;height:100%;margin:0;display:flex;align-items:center;gap:8px;padding:0 14px;'
    + 'border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--panel-raised);color:var(--ink);'
    + 'font:600 13.5px var(--sans);white-space:nowrap;overflow:hidden;cursor:default;user-select:none}\n'
    + 'svg{flex:0 0 auto;color:var(--accent)}\n'
    + '</style>\n<body role="status"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none"'
    + ' stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg>' + html + '</body>\n';
}
function hidePickNote() {
  clearTimeout(pickNoteTimer);
  if (pickNoteWin && !pickNoteWin.isDestroyed() && pickNoteWin.isVisible()) pickNoteWin.hide();
}
/* Called with what the caret helper answered: true where it pressed Ctrl+V. */
function showPickNote(pasted) {
  const said = pickSaid || {}, text = pasted ? said.pasted : said.copied;
  if (!text || !pickWin || pickWin.isDestroyed()) return;
  const at = pickWin.getBounds();
  if (!pickNoteWin || pickNoteWin.isDestroyed()) {
    pickNoteWin = new BrowserWindow({
      width: PICK_NOTE.width, height: PICK_NOTE.height, show: false, frame: false, resizable: false, focusable: false,
      transparent: true, alwaysOnTop: true, skipTaskbar: true, minimizable: false, maximizable: false, fullscreenable: false,
      title: "Etiuda", webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false,
        webSecurity: true, spellcheck: false },
    });
    pickNoteWin.setIgnoreMouseEvents(true);
    pickNoteWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    pickNoteWin.webContents.on("will-navigate", e => e.preventDefault());
  }
  const win = pickNoteWin;
  clearTimeout(pickNoteTimer);
  win.setBounds({ x: at.x, y: at.y, width: Math.min(PICK_NOTE.width, at.width), height: PICK_NOTE.height });
  win.webContents.once("did-finish-load", () => {
    if (win.isDestroyed()) return;
    win.showInactive();
    pickNoteTimer = setTimeout(hidePickNote, pasted ? PICK_NOTE_MS : PICK_NOTE_HAND_MS);
  });
  win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(pickNoteDoc(text, pasted, said)));
}

let pickWin = null, pickLoaded = null, pickOpening = false, pickShown = null;
/* THE CARET HELPER (shell/caret.cs): beside the asar, or in dist/.caret from the tree; null where there
   is none, which is every platform but Windows, and then the agent pastes as before. */
const CARET_WHICH_MS = 1500, CARET_WAIT_MS = 150, CARET_PASTE_MS = 4000;
let pickTarget = null, pickPress = 0;           // the window in front at this press, if somebody else's
function caretTool() {
  if (process.platform !== "win32") return null;
  const at = app.isPackaged ? path.join(process.resourcesPath, "caret.exe") : path.join(__dirname, "..", "dist", ".caret", "caret.exe");
  return fs.existsSync(at) ? at : null;
}
/* Which window is in front, as the helper numbers it, or null where it is one of this program's own. */
function caretWhich() {
  const tool = caretTool();
  if (!tool) return Promise.resolve(null);
  return new Promise(done => execFile(tool, ["which"], { windowsHide: true, timeout: CARET_WHICH_MS }, (err, out) => {
    const m = /^(\d+) (\d+)$/.exec(String(out || "").trim());
    done(!err && m && +m[2] !== process.pid ? m[1] : null);
  }));
}
/* Started while the picker is still in front: Windows lets a program started by the window in front
   hand the front to another, and to nothing else. The reply is on the clipboard whatever it answers, and `done` hears
   whether Ctrl+V was pressed. */
function caretPaste(target, done) {
  const tool = caretTool();
  if (!tool || !target) { setImmediate(() => done(false)); return; }
  execFile(tool, ["paste", target], { windowsHide: true, timeout: CARET_PASTE_MS }, err => {
    if (err) console.error("etiuda: the caret helper answered " + (err.code != null ? err.code : err.message)
      + ", so the reply waits on the clipboard");
    done(!err);
  });
}
const PICK_ASK_MS = 1500;
const pickAsks = new Map();
let pickAskN = 0;
/* A QUESTION TO THE DESK'S PAGE, answered as JSON text on etiuda:pick-answer and parsed here; null
   where the page did not answer in time, which a desk mid-reload or hung is. */
function askDesk(op, arg) {
  const win = theWindow;
  if (!win || win.isDestroyed()) return Promise.resolve(null);
  const n = ++pickAskN;
  return new Promise(done => {
    const timer = setTimeout(() => { pickAsks.delete(n); done(null); }, PICK_ASK_MS);
    pickAsks.set(n, text => { clearTimeout(timer); pickAsks.delete(n); let v = null; try { v = JSON.parse(text); } catch { v = null; } done(v); });
    win.webContents.send("etiuda:pick-ask", n, String(op), JSON.stringify(arg || {}));
  });
}
function fromPicker(e) {
  return !!pickWin && !pickWin.isDestroyed() && !!e.sender && e.sender.id === pickWin.webContents.id
    && !!e.senderFrame && e.senderFrame.parent === null;
}
/* Made at the first press rather than at launch, and kept hidden between presses. */
function ensurePicker() {
  if (pickWin && !pickWin.isDestroyed()) return pickLoaded;
  const backdrop = hostBackdrop();
  pickWin = new BrowserWindow(Object.assign({
    width: PICK_SIZE.width, height: PICK_SIZE.height, show: false, frame: false, resizable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, title: "Etiuda",
    backgroundColor: "#00000000",
    webPreferences: { preload: path.join(__dirname, "preload.js"), additionalArguments: ["--etiuda-picker"],
      sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, webSecurity: true,
      spellcheck: false },
  }, backdrop === "acrylic" ? { backgroundMaterial: "acrylic" } : {}));
  const win = pickWin;
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", e => e.preventDefault());
  countTouches(win.webContents, () => { pickTouches++; });
  win.on("blur", () => hidePicker(false));
  win.on("closed", () => { if (pickWin === win) { pickWin = null; pickLoaded = null; } });
  pickLoaded = new Promise(done => win.webContents.once("did-finish-load", () => done(true)));
  win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(pickerDoc()));
  return pickLoaded;
}
/* handBack: the agent closed it, so the window under it is given the focus first. A blur is the
   agent going somewhere else already, and that is left alone. */
function hidePicker(handBack) {
  if (!pickWin || pickWin.isDestroyed() || !pickWin.isVisible()) return;
  if (handBack) pickWin.blur();
  pickWin.hide();
}
/* The desk's own window, forward and focused: where a reply needs the agent's name first, and where
   the hotkey lands while the page cannot answer. */
function focusDesk() {
  const win = theWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
/* The clipboard, read once when the picker opens and kept in this function only. */
let lastOwnText = "", lastCountedText = "";
let lastProfiles = null, lastProfilesEpoch = null;
/* THE MODEL'S HALF OF THE STRIP. The words decide whether a strip shows; the model, while it is on, carried, checked and
   warm for this catalog, fills that strip with its five instead, if they come within EMBED_BUDGET_MS of the press. */
const EMBED_BUDGET_MS = 250;
const EMBED_WARM_DELAY_MS = 15000;
/* Search passage vectors, in the desk's own user-data folder. The name is the cache key, 64 hex, so a path cannot escape. */
function searchCacheDir() { return path.join(app.getPath("userData"), "search-embed"); }
function searchCacheFile(key) {
  return /^[0-9a-f]{64}$/.test(String(key || "")) ? path.join(searchCacheDir(), String(key) + ".bin") : "";
}
function searchCacheRead(key) {
  const at = searchCacheFile(key);
  if (!at) return null;
  try { return fs.readFileSync(at); } catch (e) { return null; }
}
function searchCacheWrite(key, buf) {
  const at = searchCacheFile(key);
  if (!at || !Buffer.isBuffer(buf)) return;
  fs.mkdirSync(searchCacheDir(), { recursive: true });
  const tmp = at + ".tmp";
  fs.writeFileSync(tmp, buf);
  renamePatiently(tmp, at);
}
function searchCachePrune(keep) {
  let names = [];
  try { names = fs.readdirSync(searchCacheDir()); } catch (e) { return; }
  const entries = [];
  for (const name of names) {
    if (!/^[0-9a-f]{64}\.bin$/.test(name)) continue;
    try { entries.push({ name, mtime: fs.statSync(path.join(searchCacheDir(), name)).mtimeMs }); } catch (e) { /* gone already */ }
  }
  if (!embedLib) return;
  for (const name of embedLib.cacheKeep(entries, keep)) {
    try { fs.unlinkSync(path.join(searchCacheDir(), name)); } catch (e) { /* already gone */ }
  }
}
const embedSuggest = (() => {
  if (!embedLib) return null;
  const base = INSTALLED ? path.join(String(process.resourcesPath || ""), "embed") : "";
  return embedLib.createEmbedSuggest({
    dir: INSTALLED ? path.join(base, "model") : String(process.env.ETIUDA_EMBED_MODEL || ""),
    runtime: INSTALLED ? path.join(base, "runtime") : String(process.env.ETIUDA_EMBED_RUNTIME || ""),
    fork: file => {
      const c = utilityProcess.fork(file, [], { serviceName: "Etiuda suggestions", stdio: "ignore" });
      return { post: m => c.postMessage(m), onMessage: fn => c.on("message", fn), onExit: fn => c.on("exit", fn), kill: () => c.kill() };
    },
    cacheRead: searchCacheRead,
    cacheWrite: searchCacheWrite,
    cachePrune: searchCachePrune
  });
})();
/* The model is warmed for what it embeds, the intents' passages, so a save that leaves every intent's words alone
   (a star, a card edited) re-embeds nothing. */
const embedKeys = new WeakMap();
function passagesKeyOf(profiles) {
  if (!embedLib || !profiles || !Array.isArray(profiles.passages)) return null;
  if (!embedKeys.has(profiles)) embedKeys.set(profiles, embedLib.passagesKey(profiles.passages));
  return embedKeys.get(profiles);
}
function warmSuggest(profiles, on) {
  if (!embedSuggest) return;
  embedSuggest.setOn(on);
  const key = passagesKeyOf(profiles);
  if (on && key) embedSuggest.warm(profiles.passages, key);
}
/* After the page loads, where the hotkey is held and the model is carried, so the first opening finds it warm. */
function warmSuggestSoon() {
  if (!embedSuggest || !hotkeyHeld || !embedSuggest.installed()) return;
  askDesk("suggest-profiles", {}).then(r => {
    if (r) warmSuggest(r.profiles, r.ai !== false);
  }).catch(() => {});
}

/* THE ORGANISATION'S MODEL (shell/desk-ai.cjs). deskAiConfig, above with Settings' part, is the one reader of the
   configuration in force, {provider, endpoint, model, key, managed}, or null while the option is off or not ready.
   The page hears each ask's outcome on etiuda:ai-ranking, {ranking, failures, pausedUntil, slow}, for the mark and its
   lines: a channel of its own, since etiuda:ai-state is the page's sync request of the shell, the other way. */
function deskAiState(state) {
  const win = theWindow;
  if (win && !win.isDestroyed()) win.webContents.send("etiuda:ai-ranking", state);
}
function deskAiFetch(u, init) {
  return net && typeof net.fetch === "function" ? net.fetch(u, init) : Promise.reject(new Error("no network here"));
}
const deskReorder = deskAi.createReorder({ config: () => deskAiConfig(), fetch: deskAiFetch, onState: deskAiState });
/* An agent's key, click, wheel or scroll in each window, counted, so an order that comes after one is dropped. */
let deskTouches = 0, pickTouches = 0;
function countTouches(wc, bump) {
  if (wc && typeof wc.on === "function") wc.on("input-event", (e, ie) => { if (ie && deskAi.touches(ie.type)) bump(); });
}
/* The main search's passages by id, as the page last sent them, for the texts of a shortlist. */
let orgRows = new Map(), orgSearchOn = true, orgSearchAsked = "";
function keepOrgRows(rows) {
  const by = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r.text !== "string" || (r.surface !== "card" && r.surface !== "intent")) continue;
    const k = r.surface + ":" + String(r.id);
    by.set(k, by.has(k) ? by.get(k) + " / " + r.text : r.text);
  }
  orgRows = by;
  orgSearchAsked = "";
}
/* Once per settled query: the page's shortlist for it, the organisation's order of it, and that order back to the page,
   which takes it only while the query and the list are still the ones it gave. A retry of the same query by the page,
   with no key or click between, is not a second ask. */
function orgSearchSoon(q) {
  if (q + "\n" + deskTouches === orgSearchAsked) return;
  deskReorder.settle(() => { orgSearch(q).catch(() => {}); });
}
async function orgSearch(q) {
  const asked = q + "\n" + deskTouches;
  if (!orgSearchOn || !deskReorder.active() || asked === orgSearchAsked) return;
  orgSearchAsked = asked;
  const list = await askDesk("search-shortlist", { q });
  if (!list || list.q !== q) return;
  const rows = [];
  for (const [surface, ids] of [["card", list.cards], ["intent", list.intents]]) {
    for (const id of Array.isArray(ids) ? ids : []) {
      const text = orgRows.get(surface + ":" + String(id));
      if (text && rows.length < deskAi.SHORTLIST_MAX) rows.push({ surface, id: String(id), text });
    }
  }
  const touched = deskTouches;
  const order = await deskReorder.ask(q, rows.map(r => r.text), () => deskTouches === touched);
  if (!order) return;
  const sorted = order.map(i => rows[i]);
  askDesk("search-reorder", { q, gen: list.gen, cards: sorted.filter(r => r.surface === "card").map(r => r.id),
    intents: sorted.filter(r => r.surface === "intent").map(r => r.id) }).catch(() => {});
}
/* The strip's shortlist, the rows it shows first and then the words' others, each by its passages; and the organisation's
   order of it, which the picker takes only if it is still this opening's and the agent has not touched it. */
function orgSuggestRows(shown, scored, profiles) {
  const texts = new Map(((profiles && profiles.passages) || []).map(p => [String(p.id), (p.texts || []).join(" / ")]));
  const rows = [], seen = new Set();
  for (const r of [].concat(shown || [], scored || [])) {
    const id = String(r && r.id);
    if (!r || seen.has(id) || rows.length >= deskAi.SHORTLIST_MAX) continue;
    seen.add(id);
    rows.push({ id, name: String(r.name || ""), score: r.score, text: texts.get(id) || String(r.name || "") });
  }
  return rows;
}

function noteOwnText(text) {
  if (!text) return;
  lastOwnText = crypto.createHash("sha256").update(String(text).replace(/\r\n/g, "\n")).digest("hex");
}
function isOwnText(text) {
  if (!text || !lastOwnText) return false;
  const h = crypto.createHash("sha256").update(String(text).replace(/\r\n/g, "\n")).digest("hex");
  return h === lastOwnText;
}
/* THE CLIPBOARD'S TEXT, handed to then(text). Windows' readText answers at once and the opening goes on in the same turn,
   as before; Electron 44 on Linux answers with a Promise (Claude gamma's Ubuntu walk, 2026-11-09), which used to be read
   as "[object Promise]", so a copied message was never suggested there. That one is awaited. */
const CLIP_WAIT_MS = 1000;
function withClipText(then) {
  let got = "";
  try { got = clipboard.readText(); } catch (e) { got = ""; }
  if (got && typeof got.then === "function") {
    /* A read that never settles must not leave the picker unable to open again: after CLIP_WAIT_MS it opens with no
       message to suggest from, as for an empty clipboard. */
    const late = new Promise(done => setTimeout(() => done(""), CLIP_WAIT_MS));
    Promise.race([Promise.resolve(got).then(t => String(t || ""), () => ""), late]).then(then)
      .catch(e => { console.error("etiuda: the picker could not open - " + e.message); pickOpening = false; });
    return;
  }
  then(String(got || ""));
}
/* THE HOTKEY. A second press while the picker stands closes it; otherwise the desk's page is asked
   for what to show, the picker is filled while hidden and shown only once its page says it has
   drawn, so no opening shows the last one's rows. */
function pickToggle() {
  if (pickWin && !pickWin.isDestroyed() && pickWin.isVisible()) { hidePicker(true); return; }
  if (pickOpening || !theWindow || theWindow.isDestroyed()) return;
  pickOpening = true;
  hidePickNote();
  /* Asked at once, before anything of this program comes forward; the opening waits for the answer
     only briefly, and an answer that comes later names the picker itself, which is no target. */
  const press = ++pickPress;
  pickTarget = null;
  const which = caretWhich().then(t => { if (press === pickPress) pickTarget = t; });
  withClipText(text => pickWithClip(press, which, text));
}
function pickWithClip(press, which, text) {
  let clip = text;
  const isOwn = isOwnText(clip);
  const want = !isOwn && readsLikeMessage(clip);
  const clipHash = crypto.createHash("sha256").update(String(clip).replace(/\r\n/g, "\n")).digest("hex");
  /* Where the desk carries the model, every opening asks for the catalog's passages, the Menu's included, so the model warms
     at the first opening of any kind. */
  const forModel = !!embedSuggest && embedSuggest.installed();
  const req = (want || forModel) ? (lastProfiles ? { epoch: lastProfilesEpoch } : { profiles: 1 }) : {};
  /* Where the organisation's model ranks, the built-in one still gives the instant strip unless INSTANT_FROM says words. */
  const org = want && deskReorder.active();
  const builtinNow = !(org && deskAi.INSTANT_FROM === "words");
  let orgText = org ? clip.slice(0, MESSAGE_MAX_CHARS) : "";
  let scoredAll = [];
  const ranked = want && embedSuggest && builtinNow ? embedSuggest.rank(clip.slice(0, MESSAGE_MAX_CHARS), EMBED_BUDGET_MS) : Promise.resolve(null);
  askDesk("open", req).then(open => {
    if (!open) { focusDesk(); return null; }
    if (open.epoch != null && open.epoch !== lastProfilesEpoch) {
      lastProfiles = null;
      lastProfilesEpoch = open.epoch;
    }
    if (open.profiles) {
      lastProfiles = open.profiles;
      lastProfilesEpoch = open.epoch;
    }
    const profiles = lastProfiles || open.profiles;
    let showed = false;
    if (profiles && want) {
      try {
        const scored = scoreSuggestions(clip, profiles);
        scoredAll = scored;
        if (scored.length) {
          open.suggest = scored.map(r => ({ id: String(r.id), name: String(r.name || ""), score: r.score }));
          const labels = profiles.labels || {};
          open.words = Object.assign({}, open.words || {}, {
            suggest: String(labels.suggest || ""),
            suggestTip: String(labels.suggestTip || "")
          });
          showed = true;
        }
      } catch (err) { console.error("etiuda: suggestions could not be scored"); }
    }
    delete open.profiles;
    clip = "";
    const aiOn = open.ai !== false;
    delete open.ai;
    const byModel = showed && aiOn && builtinNow && !!embedSuggest && embedSuggest.readyFor(passagesKeyOf(profiles));
    if (embedSuggest) warmSuggest(profiles, aiOn);
    return (byModel ? ranked : Promise.resolve(null)).then(rows => {
      const names = new Map(((profiles && profiles.intents) || []).map(p => [String(p.id), String(p.name || "")]));
      const mine = (Array.isArray(rows) ? rows : []).filter(r => r && names.has(String(r.id)));
      if (mine.length) open.suggest = mine.map(r => ({ id: String(r.id), name: names.get(String(r.id)), score: r.score }));
      const orgRowsNow = org && showed && aiOn ? orgSuggestRows(open.suggest, scoredAll, profiles) : [];
      const touched = pickTouches;
      const orgOrder = orgRowsNow.length > 1
        ? deskReorder.ask(orgText, orgRowsNow.map(r => r.text), () => press === pickPress && pickTouches === touched) : null;
      orgText = "";
      scoredAll = [];
      if (showed && clipHash !== lastCountedText) {
        lastCountedText = clipHash;
        askDesk("suggest-open", {}).catch(() => {});
      }
      if (open.look) open.look.glass = !!open.look.glass && hostBackdrop() === "acrylic";
      pickSaid = Object.assign({}, open.words || {}, { look: open.look || {} });
      return ensurePicker().then(() => {
        if (!pickWin || pickWin.isDestroyed()) return null;
        let at = null;
        try {
          const pt = screen.getCursorScreenPoint();
          at = pickerPlace(pt, screen.getDisplayNearestPoint(pt).workArea, PICK_SIZE);
        } catch (e) { console.error("etiuda: the pointer could not be read, so the picker is centred - " + e.message); }
        if (at) pickWin.setBounds(at);
        else pickWin.center();
        const win = pickWin;
        const drawn = new Promise(done => { pickShown = done; setTimeout(done, 300); });
        win.webContents.send("etiuda:pick-open", JSON.stringify(open));
        const asked = Promise.race([which, new Promise(done => setTimeout(done, CARET_WAIT_MS))]);
        return Promise.all([drawn, asked]).then(() => {
          pickShown = null;
          if (!win.isDestroyed()) { win.show(); win.focus(); }
          /* Not waited for: the opening ends here, and the order, if it comes and is still wanted, paints the strip again. */
          if (orgOrder) orgOrder.then(order => {
            if (!order || win.isDestroyed() || !win.isVisible() || press !== pickPress || pickTouches !== touched) return;
            open.suggest = order.map(i => orgRowsNow[i]).slice(0, SUGGEST_LIMIT).map(r => ({ id: r.id, name: r.name, score: r.score }));
            win.webContents.send("etiuda:pick-open", JSON.stringify(Object.assign({}, open, { reorder: true })));
          }).catch(() => {});
        });
      });
    });
  }).catch(e => console.error("etiuda: the picker could not open - " + e.message))
    .then(() => { pickOpening = false; });
}

ipcMain.on("etiuda:pick-answer", (e, n, text) => {
  if (!fromEngine(e)) return;
  const done = pickAsks.get(n);
  if (done) done(String(text == null ? "null" : text));
});
ipcMain.on("etiuda:pick-ready", (e) => { if (fromPicker(e) && pickShown) pickShown(); });
ipcMain.on("etiuda:pick-close", (e) => { if (fromPicker(e)) hidePicker(true); });
/* The desk's own door to the picker, its Menu row and its tour, opening it by the pointer as the hotkey does. */
ipcMain.on("etiuda:pick-show", (e) => {
  if (fromEngine(e) && !(pickWin && !pickWin.isDestroyed() && pickWin.isVisible())) pickToggle();
});
ipcMain.handle("etiuda:pick-find", (e, q) => {
  if (!fromPicker(e)) return "null";
  return askDesk("find", { q: String(q || "").slice(0, 200) }).then(v => JSON.stringify(v));
});
ipcMain.handle("etiuda:pick-who", (e, name, q) => {
  if (!fromPicker(e)) return "null";
  return askDesk("who", { name: String(name || "").slice(0, 100), q: String(q || "").slice(0, 200) }).then(v => JSON.stringify(v));
});
ipcMain.handle("etiuda:pick-tab", (e, id) => {
  if (!fromPicker(e)) return "null";
  return askDesk("tab", { id: String(id || "").slice(0, 20) }).then(v => JSON.stringify(v));
});
ipcMain.handle("etiuda:pick-lang", (e) => {
  if (!fromPicker(e)) return "null";
  return askDesk("lang", {}).then(v => JSON.stringify(v));
});
ipcMain.handle("etiuda:pick-intent", (e, id, multi) => {
  if (!fromPicker(e)) return "null";
  return askDesk("suggest-take", { id: String(id || "").slice(0, 80), multi: multi ? 1 : 0 }).then(v => JSON.stringify(v));
});
/* THE COPY. The desk's page makes the text by its own route and counts it, in the other language for `other`; this
   writes it to the clipboard, has the caret helper press Ctrl+V in the window the agent came from, steps aside, and
   says which it was.
   A reply that signs with a name nobody has given yet is asked in the desk's own window instead. */
ipcMain.handle("etiuda:pick-copy", (e, what) => {
  if (!fromPicker(e)) return false;
  let pick = {};
  try { pick = JSON.parse(String(what || "")) || {}; } catch { pick = {}; }
  const arg = pick.last ? { last: true } : { id: String(pick.id || ""), vi: pick.vi | 0 };
  if (pick.other) arg.other = 1;
  return askDesk("copy", arg).then(v => {
    if (v && typeof v.text === "string") {
      noteOwnText(pickClipText(v.text, process.platform));
      clipboard.writeText(pickClipText(v.text, process.platform));
      caretPaste(pickTarget, showPickNote);
      hidePicker(true);
      return true;
    }
    if (v && v.ask) { hidePicker(false); focusDesk(); askDesk("ask", v.ask); }
    return false;
  });
});
/* The embedded model's switch as Settings shows it: whether this desk carries the model, whether the organisation's model is
   in force (org), and the person turning it off or on. A sync request from the page; the outcomes go back on etiuda:ai-ranking. */
ipcMain.on("etiuda:ai-state", (e) => {
  e.returnValue = fromEngine(e) ? { model: !!(embedSuggest && embedSuggest.installed()), org: !!deskAiConfig() } : null;
});
ipcMain.on("etiuda:ai-set", (e, on) => {
  if (!fromEngine(e) || !embedSuggest) return;
  if (on) { embedSuggest.setOn(true); warmSuggestSoon(); } else embedSuggest.setOn(false);
});
/* The main search's own switch, and the ranking it asks for. Preparation returns at once; the passages embed in the
   worker afterwards. A rank before they are ready, or under three letters, is null, and the page keeps the word order. */
ipcMain.on("etiuda:search-set", (e, on) => {
  if (!fromEngine(e)) return;
  orgSearchOn = !!on;
  if (embedSuggest) embedSuggest.setSearchOn(!!on);
});
ipcMain.handle("etiuda:search-prepare", (e, rows) => {
  if (!fromEngine(e)) return null;
  keepOrgRows(rows);
  let res = null;
  try { res = embedSuggest ? embedSuggest.prepareSearch(rows) : null; } catch (err) { res = null; }
  /* Where the built-in model cannot prepare, the organisation's model still ranks, so the passages are taken as they are. */
  if (!res || res.skipped) return deskAiConfig() ? { ready: true } : { ready: false, skipped: true };
  return res;
});
/* With the organisation's model chosen, its order follows the answer, through orgSearchSoon. The built-in model's answer
   stands as it is, null while it prepares, so the page asks again; only where that model is absent or set aside by
   INSTANT_FROM does an empty order stand, since none is coming. */
ipcMain.handle("etiuda:search-rank", (e, text) => {
  if (!fromEngine(e)) return null;
  const q = String(text == null ? "" : text);
  const builtin = embedSuggest && !(deskReorder.active() && deskAi.INSTANT_FROM === "words") ? embedSuggest.searchRank(q) : null;
  if (!orgSearchOn || !deskAiConfig()) return builtin;
  const answer = builtin && embedSuggest.installed() ? Promise.resolve(builtin) : Promise.resolve({ cards: [], intents: [] });
  answer.then(() => orgSearchSoon(q), () => {});
  return answer;
});
/* The page tells main the text it copied, so the strip never suggests from a reply the desk wrote. A string within the cap and
   nothing else: a longer one is no reply the desk wrote, and anything not a string is not noted at all. */
const OWN_TEXT_MAX = 200000;
ipcMain.on("etiuda:own-text", (e, text) => {
  if (!fromEngine(e) || typeof text !== "string" || !text || text.length > OWN_TEXT_MAX) return;
  noteOwnText(text);
});
/* Settings' row: which combination the desk asks for, and whether Windows let the desk hold it. */
ipcMain.on("etiuda:hotkey-state", (e) => {
  if (!fromEngine(e)) { e.returnValue = null; return; }
  const want = hotkeyWanted();
  e.returnValue = { accel: want, held: !!want && want === hotkeyHeld, taken: !!want && want === hotkeyTaken,
                   def: HOTKEY_DEFAULT };
});
/* A combination tried before the desk stores it: refused by the rule or by Windows, and then the
   one held before stays held; held, and the page stores it, which syncHotkey then finds in place. */
ipcMain.handle("etiuda:hotkey-set", (e, accel) => {
  if (!fromEngine(e)) return { ok: false, why: "shape" };
  const want = String(accel || "");
  const why = want ? hotkeyRefusal(want) : "";
  if (why) return { ok: false, why: why };
  try { globalShortcut.setSuspended(false); } catch { /* not suspended */ }
  return holdHotkey(want) ? { ok: true, why: "" } : { ok: false, why: "taken" };
});
/* While Settings listens for a new combination, the one held must not open the picker instead. */
ipcMain.on("etiuda:hotkey-hold", (e, on) => {
  if (!fromEngine(e)) return;
  try { globalShortcut.setSuspended(!!on); } catch (x) { console.error("etiuda: the hotkey could not be paused - " + x.message); }
});

function createWindow() {
  const backdrop = hostBackdrop();
  /* A REFUSAL PAGE CARRIES NO SCRIPT OF ITS OWN, so the engine never draws the band's three
     controls on it, and a frameless window then leaves Alt+F4 as the only way to close what is
     already a bad moment. The same readPin() the serve path calls, so there is one rule rather
     than two: a window that is going to show the refusal is given the system's frame. */
  const framed = !!readPin().why;
  const place = PLACED_ASIDE ? null : readWindowPlace();
  /* A WINDOW REOPENED MAXIMISED IS BUILT AT ITS MAXIMISED SIZE: maximize() shows a hidden window at once with the frame
     ready-to-show waited for, and a frame drawn at the restored size leaves the rest of the window clear while the page
     lays out again. The restored rectangle is held here until the window is first restored. */
  const full = place && place.maximized ? maximizedArea(place) : null;
  let restoreTo = full ? { x: place.x, y: place.y, width: place.width, height: place.height } : null;
  const at = full || (place ? { x: place.x, y: place.y, width: place.width, height: place.height } : null);
  const win = new BrowserWindow({
    ...(at || OPEN_SIZE),
    minWidth: 546,
    show: false,
    /* frame:false, not titleBarStyle 'hidden' with titleBarOverlay. The overlay is drawn by the
       system on top of the page, and a backdrop shows only where the window leaves pixels
       unpainted, so an overlay is an opaque rectangle in the band's right corner whatever
       colour it is given. It also owns the three buttons, which board item 290 gives to the
       band. The same construction serves macOS and Linux; only the material is Windows'. */
    /* So the band's maximise button raises no Snap Layouts flyout: Windows raises it for a point
       answering WM_NCHITTEST with HTMAXBUTTON, no point of a frameless window does, and
       hookWindowMessage can watch that message but not answer it. */
    frame: framed,
    backgroundColor: "#00000000",
    ...(PLACED_ASIDE ? Object.assign({ focusable: false }, offscreenAt()) : {}),
    /* Spec section 10: the shell picks the material and the engine leaves the band's pixels
       transparent when told to. Asked for only where DWM will honour it - below 22621 the call
       does nothing and the engine would leave a hole in the band for nothing to fill. */
    ...(backdrop === "acrylic" ? { backgroundMaterial: "acrylic" } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      /* Both are already the default. They are written out because Electron's own security
         checklist asks them by name, and a default is a thing that can change under you. */
      webviewTag: false,
      webSecurity: true,
    },
  });
  /* THE SAVED SIZE IS THE SIZE REOPENED. At 150 per cent the constructor's came back up to four
     pixels larger and setBounds' one larger than asked (measured), so a window reopened daily grew:
     the difference setBounds makes is measured here and taken off. */
  if (at) {
    const want = at;
    win.setBounds(want);
    const got = win.getBounds();
    if (got.width !== want.width || got.height !== want.height)
      win.setBounds(Object.assign({}, want, { width: 2 * want.width - got.width, height: 2 * want.height - got.height }));
  }
  const built = full ? win.getBounds() : null;

  /* showInactive, not show: value 2 wants a window with a rectangle and not the focus of
     whoever is at the desk, and show() takes the focus even from a non-focusable window.
     A NAMED FUNCTION AND A ONE-LINE REGISTRATION, because two checks in the harness insert a
     probe after this statement and match it by its text: a handler whose body is inline makes
     that anchor break every time the body changes. */
  /* A window closed maximised is SHOWN by maximize(); built at that size, its first frame is already maximised. */
  /* The page is told once the window is on screen, or will never be, and its opening waits for that word. */
  const showWhenReady = () => {
    win.etiudaShown = true;
    if (OFFSCREEN_SHOWN) win.showInactive();
    else if (OFFSCREEN) { win.webContents.send("etiuda:shown"); return; }
    else if (launchHidden()) { win.webContents.send("etiuda:shown"); return; }
    else if (place && place.maximized) { win.maximize(); win.focus(); }
    else win.show();
    win.webContents.send("etiuda:shown"); /* plant:shown-told */
  };
  win.once("ready-to-show", showWhenReady);

  /* The maximise glyph is a picture of the window's state, and the window can reach that state
     without the button: a double-click on the drag band, Windows key and an arrow, a snap. */
  let maximized = !!(place && place.maximized), placeSave = null;
  const keepPlace = () => {
    if (PLACED_ASIDE || win.isDestroyed()) return;
    if (!win.isMinimized()) maximized = win.isMaximized();
    clearTimeout(placeSave);
    placeSave = setTimeout(() => saveWindowPlace(win, maximized, restoreTo), 500);
  };
  /* Built maximised, the window's first restore lands on the size it was built at, and goes on to the held rectangle;
     a restore landing anywhere else, a snap or a drag, is the person's own and stays. */
  const restoreHeld = () => {
    if (!restoreTo || win.isDestroyed()) return;
    const to = restoreTo, b = win.getBounds();
    restoreTo = null;
    if (b.x === built.x && b.y === built.y && b.width === built.width && b.height === built.height) win.setBounds(to);
  };
  const tellMaximized = () => {
    if (!win.isDestroyed()) win.webContents.send("etiuda:maximized", win.isMaximized());
    keepPlace();
  };
  win.on("maximize", tellMaximized);
  win.on("unmaximize", restoreHeld);
  win.on("unmaximize", tellMaximized);
  win.on("moved", keepPlace);
  win.on("resized", keepPlace);
  wireHold(win, () => {
    if (PLACED_ASIDE) return;
    clearTimeout(placeSave);
    if (!win.isMinimized()) maximized = win.isMaximized();
    saveWindowPlace(win, maximized, restoreTo);
  });

  win.webContents.on("context-menu", (e, p) => {
    const items = contextMenuFor(win.webContents, p);
    if (!items.length) return;
    if (MENU_TO_LOG) {
      console.log("etiuda: context menu " + JSON.stringify(items.filter(i => i.label).map(i => [i.label, i.enabled !== false])));
      return;
    }
    Menu.buildFromTemplate(items).popup({ window: win });
  });

  watchPage(win, pageWatchFor(win));

  /* The engine carries links to the open internet. Following one inside the window would
     replace the app with a web page and leave no way back to it. */
  win.webContents.setWindowOpenHandler(({ url }) => { openExternally(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => {
    if (url === win.webContents.getURL()) return;
    e.preventDefault();
    if (url.indexOf(CLOSE_MARK) > -1) { closeFromRefusal(win); return; }
    openExternally(url);
  });

  /* Ctrl+Tab is taken before the page keydown (Electron's before-input-event: preventDefault
     stops that keydown and the menu shortcuts). Hand the chord to the page instead, so it does
     not depend on the key arriving. Alt+Tab stays with the system. Key repeat is a hold. */
  win.webContents.on("before-input-event", (e, input) => {
    const tab = routeTabChord(input);
    if (tab) {
      e.preventDefault();
      if (win.webContents && typeof win.webContents.send === "function")
        win.webContents.send("etiuda:tab-chord", tab);
      return;
    }
    /* THE ZOOM KEYS, which left with the application menu: Ctrl with plus, minus or nought, the
       keypad's as well, in the menu roles' half steps, before the page ever sees the key. */
    if (input.type !== "keyDown" || !input.control || input.alt || input.meta) return;
    const wc = win.webContents, c = input.code;
    const to = (c === "Equal" || c === "NumpadAdd") ? wc.getZoomLevel() + 0.5
      : (c === "Minus" || c === "NumpadSubtract") ? wc.getZoomLevel() - 0.5
      : (c === "Digit0" || c === "Numpad0") ? 0 : null;
    if (to === null) return;
    e.preventDefault();
    wc.setZoomLevel(Math.max(-3, Math.min(5, to)));
  });

  theWindow = win;
  countTouches(win.webContents, () => { deskTouches++; });
  /* The picker is a second window, so it goes with the desk's or the app would outlive it. */
  win.on("closed", () => {
    if (theWindow === win) theWindow = null;
    if (pickWin && !pickWin.isDestroyed()) pickWin.destroy();
    if (pickNoteWin && !pickNoteWin.isDestroyed()) pickNoteWin.destroy();
  });
  win.loadFile(ENGINE);
  watchCatalog(win);
  /* A page loaded again after it was lost asks before closing again (Clément's read, note a): the loss is kept for the
     host answer that reports it, and marked as over, so closeHeld holds again from here. */
  win.webContents.on("did-finish-load", () => { const lost = win.webContents.etiudaLost; if (lost) lost.back = true; });
  win.webContents.on("did-finish-load", () => { setTimeout(() => { tryLiveStats(win); tryHeldBranches(); sendListing(win, true); handOpenedOffRoster(win); }, 0); });
  win.webContents.on("did-finish-load", () => { handHeldLink(win); }); /* plant:link-load */
  win.webContents.on("did-finish-load", () => { setTimeout(warmSuggestSoon, EMBED_WARM_DELAY_MS); });
  win.webContents.once("did-finish-load", () => { dispatchColdStartArgs(win); });
  win.webContents.on("did-finish-load", () => { if (resetNotice) deliverResetNotice(win, resetNotice); });
}

/* Ctrl+Tab and Ctrl+Shift+Tab, and nothing else. Null when the key is not that chord, so zoom
   and every other key stay on their own path. Alt is the system's. */
function routeTabChord(input) {
  if (!input || input.type !== "keyDown" || !input.control || input.alt || input.meta) return null;
  if (input.key !== "Tab" && input.code !== "Tab") return null;
  return { shift: !!input.shift };
}

/* No File / Edit / View / Window bar: the band is the top bar and the window has no other
   chrome. Called before the first window, because Electron builds the default menu lazily. */
Menu.setApplicationMenu(null);

/* THE POLICY IS PUT INTO THE COPY THIS SHELL SERVES, never into the file on disk: the browser
   build stays as it is and engine/etiuda.html carries no knowledge of its host. Two routes were
   measured on 2026-09-14 and both failed, with a planted inline script running under each:
   webRequest.onHeadersReceived never sees file://, and a Content-Security-Policy header on a
   Response from protocol.handle is not honoured for a file:// document. A meta element is. */
const CSP_ANCHOR = '<meta charset="utf-8">';

/* THE REFUSAL'S ONE CONTROL, and it is a link because that page carries no script: nothing on it
   can call the window, but every navigation the renderer attempts passes through will-navigate.
   A QUERY ON THE DOCUMENT'S OWN ADDRESS rather than a scheme of our own - Chromium hands an
   unregistered scheme to Windows as an external protocol and it never reaches this process. */
const CLOSE_MARK = "?etiuda-close";

/* Stripped rather than escaped, the engine's own rescue banner's habit: the only text that
   reaches here is a path and a parser's complaint, and neither needs its angle brackets. */
function plainText(s) { return String(s == null ? "" : s).replace(/[<>&]/g, ""); }

/* THE REFUSAL, in the shape of the engine's own rescue banner and under the same policy: one
   card, a bold lead, the way forward, and the two lines it actually read underneath. It carries
   no script, so `script-src 'none'` costs it nothing, and both languages are here because the
   shell has no way to ask which one this desk reads. */
function refusalDoc(why) {
  const card = (lead, body) => '<p style="margin:0 0 14px"><b>' + lead + '</b> ' + body + '</p>';
  return '<!DOCTYPE html>\n<meta charset="utf-8">\n'
    + '<meta http-equiv="Content-Security-Policy" content="' + policyFor(["'none'"]) + '">\n'
    + '<title>Etiuda</title>\n'
    + '<body style="margin:0;background:#1c1917;color:#fff;'
    + 'font:15px/1.6 system-ui,Segoe UI,sans-serif">\n'
    + '<div style="max-width:44em;margin:14vh auto;padding:0 28px">'
    + '<div style="background:#7f1d1d;border-radius:12px;padding:20px 22px;'
    + 'box-shadow:0 2px 14px rgba(0,0,0,.4)">'
    + card("Etiuda could not start.",
        "The list of scripts it is allowed to run belongs to the installation, and this copy "
        + "cannot read it, so Etiuda stops rather than start without that check. Installing "
        + "Etiuda again puts the file back, and your catalog and your settings are kept.")
    + card("Etiuda nie mogła się uruchomić.",
        "Lista skryptów, które wolno jej uruchomić, należy do instalacji i nie daje "
        + "się tutaj odczytać, więc Etiuda zatrzymuje się, zamiast startować bez tego "
        + "sprawdzenia. Ponowna instalacja przywraca ten plik, a katalog i ustawienia "
        + "pozostają nietknięte.")
    + '<p style="margin:0 0 16px"><a href="' + CLOSE_MARK + '" style="display:inline-block;'
    + 'padding:7px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.45);'
    + 'color:#fff;text-decoration:none;font-weight:600">Close Etiuda &middot; Zamknij Etiud&#281;</a></p>'
    + '<div style="opacity:.75;font:12px/1.5 ui-monospace,Consolas,monospace;margin:0">'
    + plainText(PIN) + '<br>' + plainText(why) + '</div>'
    + '</div></div>\n';
}

/* THE SIBLING TAG IS NOT SERVED HERE. In a browser it is how a catalog beside the engine arrives;
   under this shell the policy refuses it by design, since a catalog comes through the host, and the
   refusal was a console error on every boot, so a healthy desk never had a clean console (bug hunt
   3, item 21). Cut from the served copy only, as the policy is put into it: engine/etiuda.html
   keeps it for the browser. It must match exactly once, like the anchor: none means the template
   moved and the strip is stale, two means the literal has turned up somewhere it must not be cut.
   tests/csp.js proves the policy still refuses a sibling with one of its own planting. */
const SIBLING_TAGS = ['<script src="etiuda-catalog.js"></script>'];

function withPolicy(html) {
  const pin = readPin();
  if (pin.why) return refusalDoc(pin.why);
  for (const tag of SIBLING_TAGS) {
    const found = html.split(tag).length - 1;
    if (found !== 1) throw new Error(tag + " matched " + found + " times in the engine, expected 1");
    html = html.split(tag).join("");
  }
  const hits = html.split(CSP_ANCHOR).length - 1;
  if (hits !== 1) throw new Error(CSP_ANCHOR + " matched " + hits + " times in the engine, expected 1");
  /* split/join rather than replace, the build script's precedent: the engine's own text holds
     `$&` and `$1`, which a replacement string would substitute rather than copy. */
  const meta = '\n<meta http-equiv="Content-Security-Policy" content="' + policyFor(pin.hashes) + '">';
  return html.split(CSP_ANCHOR).join(CSP_ANCHOR + meta);
}

function hardenSession() {
  protocol.handle("file", async (request) => {
    let res;
    try { res = await net.fetch(request.url, { bypassCustomProtocolHandlers: true }); }
    catch { return new Response(null, { status: 404 }); }
    let where = "";
    try { where = decodeURIComponent(new URL(request.url).pathname); } catch { /* keep it empty */ }
    if (!/\/engine\/etiuda\.html$/.test(where)) return res;
    return new Response(withPolicy(await res.text()), { headers: { "content-type": "text/html; charset=utf-8" } });
  });
  /* Nothing here needs a camera, a microphone, a location or a notification, and the one thing
     it does need is to put a macro on the clipboard. Everything else is refused by name. */
  const ALLOWED = ["clipboard-sanitized-write"];
  session.defaultSession.setPermissionRequestHandler((wc, name, done) => done(ALLOWED.indexOf(name) > -1));
  session.defaultSession.setPermissionCheckHandler((wc, name) => ALLOWED.indexOf(name) > -1);
  if (process.platform === "linux") spellingFromPackage(session.defaultSession);
}

/* SPELLING ON LINUX, FROM THE PACKAGE AND NEVER FROM THE WEB. Windows checks spelling with its own checker
   and none of this runs there. On Linux Chromium uses Hunspell and, for each language the session has,
   reads <userData>/Dictionaries/<name> or else downloads <name> from Google's server at the first page.
   THE TRAP, measured 2026-10-06 on Electron 44: the download address cannot be the package. The loader
   refuses file:// (net error -302), and a custom scheme or a file handler fails the same way, so the
   address below is a stopper, not a source: a language without a file asks nothing of the network
   (tests/linux-desk.js 7a, 7b). What loads is a copy: the package's files (electron-builder.js, the
   linux block) are copied into the profile before the session is given its languages, under
   Chromium's own casing; the name it asks the server for is lowercased and a copy under that name is
   never read (measured the same day). English and Polish are the languages the desk is written in.
   tests/shell-office.mjs 13 holds both platforms, tests/linux-desk.js 8 the installed package. */
const SPELLING = { langs: ["en-US", "pl"], files: ["en-US-10-1.bdic", "pl-PL-3-0.bdic"] };
function spellingFromPackage(s) {
  const from = path.join(process.resourcesPath || "", "dictionaries");
  s.setSpellCheckerDictionaryDownloadURL("file://" + from.split("/").map(encodeURIComponent).join("/") + "/");
  const to = path.join(app.getPath("userData"), "Dictionaries"), placed = [];
  for (const name of SPELLING.files) {
    try {
      const bytes = fs.readFileSync(path.join(from, name));
      let had = null;
      try { had = fs.readFileSync(path.join(to, name)); } catch { /* not there yet */ }
      if (had && had.equals(bytes)) continue;
      fs.mkdirSync(to, { recursive: true });
      writeReplacing(path.join(to, name), bytes);
      placed.push(name);
    } catch (e) {
      console.error("etiuda: the spelling dictionary " + name + " was not placed: " + (e && e.code || e));
    }
  }
  s.setSpellCheckerLanguages(SPELLING.langs);
  return placed;
}

/* THE TRAY. One icon for the desk. A harness launch and a shell with no tray stay without one.
   Notifications in the menu are a master switch kept in the place file; which notices fire is not this run's. */
function launchHidden() {
  return Array.isArray(process.argv) && process.argv.indexOf("--hidden") > -1;
}
function trayWords() {
  try { return shellWords(); }
  catch { return SHELL_WORDS.en; }
}
function showDesk(win) {
  const live = (w) => w && typeof w.isDestroyed === "function" && !w.isDestroyed();
  const w = live(win) ? win : (live(theWindow) ? theWindow : null);
  if (!w) return;
  try { if (typeof w.isMinimized === "function" && w.isMinimized() && typeof w.restore === "function") w.restore(); } catch { /* left as it is */ }
  try { if (typeof w.show === "function") w.show(); } catch { /* already on screen */ }
  try { if (typeof w.focus === "function") w.focus(); } catch { /* focus stayed */ }
}
function deskWindow() {
  if (theWindow && typeof theWindow.isDestroyed === "function" && !theWindow.isDestroyed()) return theWindow;
  try {
    const all = BrowserWindow.getAllWindows();
    if (all && all.length) return all[all.length - 1];
  } catch { /* no window list */ }
  return null;
}
function notesOn() {
  return readWindowMeta().trayNotes !== false;
}
function setTrayNotes(on) {
  patchWindowMeta({ trayNotes: !!on });
  rebuildTrayMenu();
}
let trayNoticeTold = false;
function maybeFirstClose(win) {
  const w = trayWords();
  notifyFirstClose({
    electron: { Notification: Notification, app: app },
    appId: APP_IDS.desktop,
    title: w.trayKeepsRunning,
    body: w.trayKeepsBody,
    told: trayNoticeTold === true,
    setTold: () => { trayNoticeTold = true; },
    onClick: () => showDesk(win),
  });
}
/* Quit from the tray seals open conversations the way an installer close does, then leaves without asking.
   Where the seal fails, the window comes back and the page is asked, and the process stays. */
function trayQuit() {
  const win = deskWindow();
  const saved = writeSavedTabs(win);
  if (saved === false) {
    showDesk(win);
    try {
      if (win && win.webContents && typeof win.webContents.send === "function") win.webContents.send("etiuda:ask-close");
    } catch { /* the page is gone */ }
    return false;
  }
  quitting = true;
  try { app.quit(); } catch { /* already leaving */ }
  return true;
}
function repliesLabel(w) {
  return w.trayReplies;
}
function trayMenuItems() {
  const w = trayWords();
  return [
    { label: repliesLabel(w), click: () => { try { pickToggle(); } catch { /* the picker can wait */ } } },
    { label: notesOn() ? w.trayNotesOn : w.trayNotesOff, click: () => setTrayNotes(!notesOn()) },
    { label: w.traySettings, click: () => openSettingsFromTray() },
  ];
}
function openSettingsFromTray() {
  const win = deskWindow();
  showDesk(win);
  try {
    if (win && win.webContents && typeof win.webContents.send === "function")
      win.webContents.send("etiuda:tray-go", "settings");
  } catch { /* the page is gone */ }
}
let deskTray = null;
function trayIcon() {
  try {
    if (!nativeImage || typeof nativeImage.createFromPath !== "function") return null;
    let file = "etiuda.ico";
    if (process.platform === "linux") file = "etiuda-tray.png"; /* plant:tray-platform */
    const img = nativeImage.createFromPath(path.join(__dirname, file));
    if (img && typeof img.isEmpty === "function" && img.isEmpty()) return null;
    return img || null;
  } catch { return null; }
}
function rebuildTrayMenu() {
  if (!deskTray || typeof deskTray.setContextMenu !== "function" || !Menu || typeof Menu.buildFromTemplate !== "function") return;
  const w = trayWords();
  try {
    const tpl = buildTrayMenuTemplate({
      openLabel: w.trayOpen,
      onOpen: () => showDesk(deskWindow()),
      items: trayMenuItems(),
      quitLabel: w.trayQuit,
      onQuit: () => { trayQuit(); },
    });
    deskTray.setContextMenu(Menu.buildFromTemplate(tpl));
    if (typeof deskTray.setToolTip === "function") deskTray.setToolTip(w.trayTip);
  } catch (e) { console.error("etiuda: the tray menu could not be rebuilt - " + e.message); }
}
function ensureTray() {
  if (deskTray) return deskTray;
  if (PLACED_ASIDE) return null;
  if (typeof Tray !== "function") return null;
  const icon = trayIcon();
  if (!icon) return null;
  const w = trayWords();
  try {
    deskTray = createTray({
      electronTray: Tray,
      electronMenu: Menu,
      icon: icon,
      tooltip: w.trayTip,
      onClick: () => showDesk(deskWindow()),
      openLabel: w.trayOpen,
      onOpen: () => showDesk(deskWindow()),
      quitLabel: w.trayQuit,
      onQuit: () => { trayQuit(); },
      items: trayMenuItems(),
    });
  } catch (e) {
    console.error("etiuda: the tray could not be created - " + e.message);
    deskTray = null;
  }
  return deskTray;
}
/* THE JUMP LIST. Recent catalogs this desk itself loaded most recently, newest first,
   five at most, files that still exist, and the four tasks: Bring the replies over any window,
   New tab, Library, Settings. A file that is now gone drops out. */
function syncJumpList() {
  try {
    const w = trayWords();
    const tasks = [
      { title: w.jumpReplies || w.trayReplies || "Bring the replies over any window", args: "--picker" },
      { title: w.jumpNewTab || "New tab", args: "--new-tab" },
      { title: w.jumpLibrary || "Library", args: "--library" },
      { title: w.jumpSettings || w.traySettings || "Settings", args: "--settings" },
    ];
    const existing = [];
    for (const f of recentCatalogs) {
      if (existing.length >= 5) break;
      try {
        if (fs.existsSync(f) && fs.statSync(f).isFile()) existing.push(f);
      } catch { /* file gone */ }
    }
    const recent = existing.map(f => ({
      title: path.basename(f, ".ec") || path.basename(f),
      path: f,
    }));
    return setJumpList(app, {
      tasks,
      recent,
      recentCategoryName: w.jumpRecent || "Recent catalogs",
    });
  } catch (e) {
    console.error("etiuda: jump list could not be updated - " + (e && e.message || e));
    return null;
  }
}
/* A second launch hands its arguments to the one already running. --update-close seals and closes.
   --hidden leaves a running copy where it is. --picker toggles the picker without showing the desk.
   --settings, --library, --new-tab open their surface and bring the window forward.
   A file argument is offered and never loaded. */
function onSecondInstance(argv) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.indexOf("--update-close") > -1) {
    handleUpdateClose();
    return;
  }
  if (args.indexOf("--picker") > -1) {
    try { pickToggle(); } catch { /* the picker can wait */ }
    return;
  }
  const link = linkArgFrom(args);
  if (link) acceptLink(link);
  const file = ecFromArgv(args);
  if (args.indexOf("--hidden") > -1) {
    if (file) offerFile(theWindow, file);
    return;
  }
  const win = deskWindow() || theWindow;
  if (win && typeof win.isDestroyed === "function" && !win.isDestroyed() && !PLACED_ASIDE) showDesk(win);
  if (args.indexOf("--settings") > -1) {
    try {
      if (win && win.webContents && typeof win.webContents.send === "function")
        win.webContents.send("etiuda:tray-go", "settings");
    } catch { /* the page is gone */ }
  } else if (args.indexOf("--library") > -1) {
    try {
      if (win && win.webContents && typeof win.webContents.send === "function")
        win.webContents.send("etiuda:tray-go", "library");
    } catch { /* the page is gone */ }
  } else if (args.indexOf("--new-tab") > -1) {
    try {
      if (win && win.webContents && typeof win.webContents.send === "function")
        win.webContents.send("etiuda:tray-go", "new-tab");
    } catch { /* the page is gone */ }
  }
  if (file) offerFile(win, file);
}

function dispatchColdStartArgs(win, argv) {
  const args = Array.isArray(argv) ? argv : (process.argv || []);
  if (!win || !win.webContents || typeof win.webContents.send !== "function") return;
  if (args.indexOf("--picker") > -1) {
    try { pickToggle(); } catch {}
  } else if (args.indexOf("--settings") > -1) {
    try { win.webContents.send("etiuda:tray-go", "settings"); } catch {}
  } else if (args.indexOf("--library") > -1) {
    try { win.webContents.send("etiuda:tray-go", "library"); } catch {}
  } else if (args.indexOf("--new-tab") > -1) {
    try { win.webContents.send("etiuda:tray-go", "new-tab"); } catch {}
  }
}

/* ONE ETIUDA AT A TIME, which is what makes the association useful rather than annoying: without
   the lock every double-clicked catalog would open a second window with its own desk file, two
   copies writing the same desk. The second copy hands its path over and exits. The lock is keyed
   on the user-data folder, so a harness launch aimed at a lab of its own is unaffected. */
/* The lock is taken first. Only the process that holds it finishes a pending reset, and it
   does that before anything else in this folder is read. The lock's own files stay. */
const theOnlyOne = app.requestSingleInstanceLock();
if (!theOnlyOne || (Array.isArray(process.argv) && process.argv.includes("--update-close"))) {
  app.quit();
} else {
  try {
    const honoured = honourPendingReset({ userData: app.getPath("userData"), holdsLock: true });
    if (honoured && honoured.ok) {
      try { setStartWithWindows(false); } catch (err) { /* start with Windows could not be changed */ }
    }
    if (honoured && honoured.notice && Array.isArray(honoured.paths) && honoured.paths.length)
      resetNotice = { paths: honoured.paths.slice() };
  }
  catch (e) { console.error("etiuda: a pending reset could not be finished - " + (e && e.message)); }
  registerEtiudaLink();
  syncLoginItemPath();
  app.on("second-instance", (e, argv) => { onSecondInstance(argv); });
  const link = linkArgFrom(process.argv);
  if (link) {
    const got = linkFromArg(link);
    if (got && got.refused) acceptLink(link); /* plant:link-early */
    if (got && got.text) pendingLinkArg = link; /* plant:link-hold */
  }
  openedWith = ecFromArgv(process.argv);
  /* The window waits on the folder's first answer, FOLDER_ASK_MS at most, and on a folder team's first
     listing, FOLDER_PRIME_MS at most, rather than on a synchronous read of a share that is not there.
     A policy folder names no team until its team file is read, which is the one share read the syncer
     cannot start without. The catalog waits for the mirror. */
  app.whenReady().then(() => {
    dropSessionStorage(); hardenSession(); applyThemeSource();
    const dir = catalogFolder();
    return askFolder(dir).then(ok => {
      settleFolder(dir, ok);
      ensureCatalogFolder();
      if (!folderTeamHere() && sayJoinPolicy().folder && folderAnswers(sayJoinPolicy().folder)) heedTeam();
      return awaitFolderPrime().then(() => {
        createWindow();
        armNoteLook();
        armSigninRenew();
        try { ensureTray(); } catch { /* the window still opens */ }
        try { syncJumpList(); } catch { /* the jump list still stands */ }
        hotkeyReady = true; syncHotkey();
        // Asked for here: powerMonitor is not to be used before the app is ready.
        require("electron").powerMonitor.on("resume", () => resumeFromSleep(theWindow));
      });
    });
  });
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  try { if (deskTray && typeof deskTray.destroy === "function") deskTray.destroy(); } catch { /* already gone */ }
  try { globalShortcut.unregisterAll(); } catch { /* none held */ }
});
