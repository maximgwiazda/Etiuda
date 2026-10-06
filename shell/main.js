"use strict";

const { app, BrowserWindow, Menu, clipboard, dialog, globalShortcut, ipcMain, nativeTheme, net, protocol, session,
  safeStorage, screen, shell, systemPreferences } = require("electron");

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
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

/* THE PROXY IS CHOSEN HERE, BEFORE READY: a setProxy after ready would not stop the first lookup.
   Windows' own setting is followed where it names a setup script or a server; automatic detection
   alone, nothing set or a failed read gives no proxy and no wpad lookup. */
const PROXY_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
/* The text is the key's values as reg prints them. A script is read before a server, and a server only
   while ProxyEnable is 1. */
function proxySwitchesFrom(text) {
  const t = String(text || "");
  const str = n => { const m = new RegExp("^[ \\t]+" + n + "[ \\t]+REG_(?:EXPAND_)?SZ[ \\t]+(.*?)[ \\t\\r]*$", "m").exec(t); return m ? m[1] : ""; };
  const on = /^[ \t]+ProxyEnable[ \t]+REG_DWORD[ \t]+0x([0-9a-f]+)[ \t\r]*$/im.exec(t);
  const script = str("AutoConfigURL"), server = str("ProxyServer");
  if (/^(?:https?|file):\/\/\S+$/i.test(script)) return [["proxy-pac-url", script]];
  if (on && parseInt(on[1], 16) === 1 && /^\S{1,2048}$/.test(server)) return [["proxy-server", server]];
  return [["no-proxy-server"]];
}
function windowsProxySwitches() {
  if (process.platform !== "win32") return proxySwitchesFrom("");
  try {
    return proxySwitchesFrom(execFileSync("C:\\Windows\\System32\\reg.exe", ["query", PROXY_KEY],
      { encoding: "utf8", windowsHide: true, timeout: 5000 }));
  } catch { return proxySwitchesFrom(""); }
}
for (const s of windowsProxySwitches()) app.commandLine.appendSwitch(...s);

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
function catalogFolder() {
  if (deskKeys === undefined) deskKeys = readDesk();
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
   folder holding nothing else opens the sample. The Library's list is ordered through here too,
   so the top row is the file a restart would open. A file somebody double-clicked is not on this
   list at all - asking for one outranks every rule about which is newest. */
function sampleLast(files) {
  const rest = [], last = [];
  files.forEach(f => (isTheSample(f) ? last : rest).push(f));
  return rest.concat(last);
}

/* Newest first, and the name breaks a tie so two files saved in the same millisecond do not
   swap places between launches. A file that cannot be stat'd is one that has just been renamed
   away underneath the listing, and is simply not a candidate. */
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
function ecFromArgv(argv) {
  for (const a of (argv || []).slice(1)) {
    const s = String(a);
    if (s.charAt(0) === "-" || !/\.ec$/i.test(s)) continue;
    try { if (fs.statSync(s).isFile()) return path.resolve(s); } catch { /* not a file from here */ }
  }
  return "";
}
const REQUEST_NAME = "etiuda-request.ereq";
// The engine's V2_TEAM_FILE. Watched with the catalogs, since an admission is what opens a sealed one.
const TEAM_NAME = "etiuda-team.json";
function isCatalogName(name) {
  const n = path.basename(String(name || ""));
  return /\.ec$/i.test(n) || n === CATALOG_SCRIPT || n === REQUEST_NAME || n === TEAM_NAME || n === JOINS_NAME;
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
   reads it as it reads an unsealed file, signature and identity alike. One this desk holds no key for throws. */
function catalogRead(text) {
  const got = catalogPayload(text);
  if (!got.data || typeof got.data !== "object" || got.data.kind !== SEALED_KIND) return got;
  const inner = teamOpen(got.data);
  if (inner === null) throw new Error("sealed for team " + String(got.data.team) + ", which this desk holds no key for");
  const opened = catalogPayload(inner);
  if (opened.data && opened.data.kind === SEALED_KIND) throw new Error("an envelope sealed inside another");
  const id = opened.data && typeof opened.data.id === "string" ? opened.data.id : "";
  if (id && !teamOpened.has(id)) { teamOpened.add(id); persistDeskEnvelope(); }
  try {
    const pin = signedSha(opened.data), team = String(got.data.team), was = editionTeam.get(pin);
    editionTeam.set(pin, was === undefined || was === team ? team : "");
  } catch { /* nothing to pin */ }
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
   there. Passed over until it is saved again, so an older sound edition opens in its place. */
const engineRefused = new Map();
function refusedByEngine(file) {
  if (!engineRefused.has(file)) return false;
  try { return Math.round(fs.statSync(file).mtimeMs) === engineRefused.get(file); } catch { return false; }
}
function readCatalog() {
  heedTeam();
  for (const file of catalogPlaces()) {
    if (refusedByEngine(file)) continue;
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { refuseOpened(file, "read"); continue; }
    try {
      const { json, data } = catalogRead(text);
      if (!isV2(data)) throw new Error("not an Etiuda catalog (format 2)");
      const cards = Array.isArray(data.cards) ? data.cards.length : 0;
      console.log("etiuda: catalog read from " + file + ", " + cards + " cards");
      catalogFrom = file;
      historySoon(file, text);
      return json;
    } catch (e) {
      console.error("etiuda: " + file + " did not parse as a catalog - " + e.message);
      refuseOpened(file, "parse");
    }
  }
  console.log("etiuda: no catalog found, so Etiuda starts as a clean slate");
  catalogFrom = "";
  return null;
}

/* Spec 11.5's watch, so an edit beside the app reaches a running Etiuda without a restart. The
   FOLDERS, not the files: an editor saves by writing a temp file and renaming it over the old
   one, and a watch on the file that was there follows the replaced one into the bin. An event is
   only a prompt to read, and the payload is what decides, so a save that arrives as four events
   and a file rewritten with its own bytes are both free. */
/* A watch that stops, or never started, is armed again: a share dropped by the VPN or a sleep
   comes back without a word to this process, so the folder is asked again on a timer until it
   answers, and at once after a resume, and then read, which also answers a statistics request. */
let catalogSettle = null, catalogWatchers = [], watchedFolder = "";
const watchSaid = new Map();                   // folder -> the refusal last logged for it
function watchCatalog(win) {
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
const FOLDER_ASK_MS = 3000, FOLDER_RETRY_MS = 30000, FOLDER_SOON_MS = 1000;
let folderDown = "", folderAsking = null, folderRetry = null, folderSaidDown = "";
function folderAnswers(dir) { return !folderDown || dir !== folderDown; }
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
  if (dir !== catalogFolder()) return false;
  if (!ok && folderSaidDown !== dir)
    console.error("etiuda: the catalog folder " + dir + " did not answer, so it is read as empty until it does");
  if (ok && folderSaidDown === dir) console.log("etiuda: the catalog folder " + dir + " answers again");
  folderDown = ok ? "" : dir;
  folderSaidDown = folderDown;
  return ok;
}
function armFolder(win) {
  clearTimeout(folderRetry);
  const dir = catalogFolder();
  return askFolder(dir).then(ok => {
    if (!settleFolder(dir, ok)) { if (dir === catalogFolder()) retryFolder(FOLDER_RETRY_MS); return; }
    if (!win || win.isDestroyed()) return;
    watchCatalog(win);
    catalogChanged(win);
  });
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
  if (catalogFolder() === watchedFolder) return;
  const win = theWindow;
  console.log("etiuda: catalog folder " + catalogFolder());
  // Somebody has just picked this folder, so it is read as answering while it is asked.
  folderDown = "";
  watchedFolder = catalogFolder();
  armFolder(win);
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
  const now = readCatalog();
  tryAnswerRequest(win);
  tryHeldBranches();
  sendListing(win, false);
  sendJoin(win);
  if (now === catalogJson) return;
  catalogJson = now;
  if (!now || !win || win.isDestroyed()) return;
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
  const refuse = (why) => {
    if (win && !win.isDestroyed())
      win.webContents.send("etiuda:catalog-file", "", path.basename(file), path.dirname(file), true, why);
  };
  let text;
  try { text = fs.readFileSync(file, "utf8"); }
  catch (e) { console.error("etiuda: " + file + " could not be read - " + e.message); refuse("read"); return; }
  try {
    const { json, data } = catalogRead(text);
    if (!isV2(data)) throw new Error("not an Etiuda catalog (format 2)");
    openedWith = file;
    catalogJson = json;
    catalogFrom = file;
    historySoon(file, text);
    const cards = Array.isArray(data.cards) ? data.cards.length : 0;
    console.log("etiuda: opened with " + file + ", " + cards + " cards");
    /* The fourth argument says somebody ASKED for this file, which the watch's own send does
       not: a double-click outranks a remembered refusal and is answered either way. */
    if (win && !win.isDestroyed())
      win.webContents.send("etiuda:catalog-file", json, path.basename(file), path.dirname(file), true);
  } catch (e) {
    console.error("etiuda: " + file + " did not parse as a catalog - " + e.message);
    refuse("parse");
  }
}

/* The preload asks for this before the first page script runs, so the handler is registered at
   load time rather than after the app is ready. */
let catalogJson;
ipcMain.on("etiuda:catalog", (e) => {
  if (!fromEngine(e)) { e.returnValue = null; return; }
  if (catalogJson === undefined) catalogJson = readCatalog();
  e.returnValue = catalogJson;
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
  catalogJson = readCatalog();
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
let answeredIds = [];
let heldStats = null;
let pendingRequest = null;
function ensureDeskId() {
  if (theDeskId) return theDeskId;
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
  function canon(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  }
  let h = 5381; const s = canon(copy);
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
/* A REQUEST IS A FEW SHORT FIELDS, and the share is anybody's to write: a larger or deeper file
   is refused before channelHash, which recurses, walks it. Said once per file, in the log. */
function parseRequest(text) {
  const raw = String(text || "");
  const refuse = (why) => {
    if (parseRequest.said !== raw) console.log("etiuda: the request file is not read: " + why);
    parseRequest.said = raw;
    return null;
  };
  if (raw.length > 65536) return refuse("it is larger than any request");
  let data;
  try { data = JSON.parse(raw.replace(/^\uFEFF/, "").trim()); } catch { return null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const walk = [[data, 1]];
  while (walk.length) {
    const [v, depth] = walk.pop();
    if (v === null || typeof v !== "object") continue;
    if (depth > 16) return refuse("it nests deeper than any request");
    Object.keys(v).forEach(k => walk.push([v[k], depth + 1]));
  }
  if (+data.format !== 1 || data.kind !== "etiuda-request") return null;
  if (!DESK_ID_RE.test(String(data.id || ""))) return null;
  if (!ymdOk(data.issued) || !ymdOk(data.from) || !ymdOk(data.to) || !ymdOk(data.expires)) return null;
  if (String(data.hash || "") !== channelHash(data)) return null;
  return data;
}
function deskEnvelopeBody(keysText) {
  ensureDeskId();
  return '{"kind":"' + DESK_KIND + '","schema":' + DESK_SCHEMA
    + ',"app":' + JSON.stringify(app.getVersion())
    + ',"saved":' + JSON.stringify(new Date().toISOString())
    + (theDeskId ? ',"desk":' + JSON.stringify(theDeskId) : "")
    + (answeredIds.length ? ',"answered":' + JSON.stringify(answeredIds) : "")
    + (heldStats ? ',"held":' + JSON.stringify(heldStats) : "")
    + (deskBranch ? ',"branch":' + JSON.stringify(deskBranch) : "")
    + (deskBranchOld.length ? ',"branchOld":' + JSON.stringify(deskBranchOld) : "")
    + (Object.keys(branchRevs).length ? ',"branchRevs":' + JSON.stringify(branchRevs) : "")
    + (Object.keys(teamPins).length ? ',"teamPins":' + JSON.stringify(teamPins) : "")
    + (Object.keys(teamKeys).length ? ',"teamKeys":' + JSON.stringify(teamKeys) : "")
    + (teamOpened.size ? ',"teamOpened":' + JSON.stringify(Array.from(teamOpened)) : "")
    + (teamSeen.size ? ',"teamSeen":' + JSON.stringify(Array.from(teamSeen)) : "")
    + (teamBarred.size ? ',"teamBarred":' + JSON.stringify(Array.from(teamBarred)) : "")
    + (teamJoin ? ',"teamJoin":' + JSON.stringify(teamJoin) : "")
    + (deskRefused.length ? ',"refused":' + JSON.stringify(deskRefused) : "")
    + ',"keys":' + keysText + "}";
}
/* A RENAME OVER A FILE ANOTHER PROGRAM HAS OPEN IS REFUSED ON WINDOWS for as long as it holds
   it, and a virus scanner or a sync client opening a file just written is the ordinary case, so
   the rename is asked again for half a second before the refusal stands. */
const RENAME_BUSY = ["EPERM", "EACCES", "EBUSY"];
function renamePatiently(from, to) {
  for (let i = 1; ; i++) {
    try { fs.renameSync(from, to); return; }
    catch (e) {
      if (i >= 10 || RENAME_BUSY.indexOf(e.code) < 0) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}
/* Temp file then rename, so a failed write never leaves half a file under the name, and a
   refused one leaves no temp file behind it. Throws what stopped it. */
function writeReplacing(file, text) {
  const tmp = file + ".tmp";
  try {
    fs.writeFileSync(tmp, text, "utf8");
    renamePatiently(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* never made */ }
    throw e;
  }
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
function writeStatsAnswer(text) {
  const req = pendingRequest;
  if (!req) return { ok: false };
  if (answeredIds.indexOf(req.id) >= 0) return { ok: false };
  const id = ensureDeskId();
  if (!isSafeDeskId(id)) return { ok: false };
  let data;
  try { data = JSON.parse(String(text || "")); } catch { return { ok: false }; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false };
  const now = new Date();
  const out = {
    format: 1,
    kind: "etiuda-statistics",
    desk: id,
    engine: String(data.engine || ""),
    period: { from: String(req.from), to: String(req.to) },
    sync: channelStamp(now),
    cards: Array.isArray(data.cards) ? data.cards : [],
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
  out.hash = channelHash(out);
  const dir = path.join(catalogFolder(), "stats");
  const dest = path.join(dir, id + ".estat");
  if (path.dirname(dest) !== dir || path.basename(dest) !== id + ".estat") return { ok: false };
  try {
    if (!folderAnswers(catalogFolder())) throw new Error("the catalog folder is not answering");
    fs.writeFileSync(dest, JSON.stringify(out), "utf8");
  } catch {
    heldStats = { id: req.id, text: String(text || "") };
    persistDeskEnvelope();
    return { ok: false };
  }
  answeredIds.push(req.id);
  heldStats = null;
  pendingRequest = null;
  persistDeskEnvelope();
  return { ok: true, sync: out.sync, syncMs: now.getTime() };
}
function tryAnswerRequest(win) {
  if (!folderAnswers(catalogFolder())) return;
  let text;
  try { text = fs.readFileSync(path.join(catalogFolder(), REQUEST_NAME), "utf8"); } catch { return; }
  let req = null;
  try { req = parseRequest(text); }
  catch (e) { console.error("etiuda: the request file could not be read - " + e.message); }
  if (!req) return;
  if (String(req.expires) < channelYmd()) return;
  if (answeredIds.indexOf(req.id) >= 0) return;
  pendingRequest = req;
  if (heldStats && heldStats.id === req.id) {
    if (writeStatsAnswer(heldStats.text).ok) return;
  }
  if (!win || win.isDestroyed()) return;
  win.webContents.send("etiuda:stats-ask", { id: req.id, from: req.from, to: req.to, issued: req.issued });
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
  if (!Number.isInteger(epoch) || epoch < 1) throw new Error("seal: an epoch is a whole number from 1");
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
  if (!Number.isInteger(epoch) || epoch < 1) throw new Error("wrap: an epoch is a whole number from 1");
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

/* ---- joining a team: the desk's request, the lead's opening, and the code both sides read --------
   Commit then reveal: a request commits to the desk's nonce before the lead's opening exists, and the desk
   reveals it only against the one opening it took, so a request made to match a code has one chance in a
   million whatever it computes. The code covers the team, both desk keys, the lead's key and both nonces.
   Studio slices these to read a request and to say its code. */
const JOIN_PREFIX = "etiuda-desk-join\n";
const JOIN_KIND = "etiuda-join", JOINS_KIND = "etiuda-team-joins", JOINS_NAME = "etiuda-team-joins.json";
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
/* What the lead's file of openings, beside the team file, says to one request: {lead, nonce}, {refused: true},
   or null. It is not signed; the code covers the lead's key and nonce, so a forged opening shows a wrong code. */
function joinOpening(joins, teamId, deskId, commit) {
  const lead = joins && joins.lead, open = joins && Array.isArray(joins.open) ? joins.open : [];
  if (!joins || +joins.format !== 1 || joins.kind !== JOINS_KIND || joins.team !== teamId || !lead || typeof lead.keyId !== "string"
    || !JOIN_HEX_RE.test(String(lead.public))) return null;
  const e = open.find(x => !!x && x.desk === deskId && x.commit === commit);
  if (!e) return null;
  if (e.refused === true) return { refused: true };
  return JOIN_HEX_RE.test(String(e.nonce)) ? { lead: { keyId: lead.keyId, public: lead.public }, nonce: e.nonce } : null;
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

const BRANCH_PREFIX = "etiuda-desk-branch\n";
const BRANCH_STEM_MAX = 96, BRANCH_TEXT_MAX = 16 * 1024 * 1024;
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
let deskBranch = null;                         // {sign:{pub,priv}, box:{pub,priv}}: hex publics, sealed privates
let deskBranchOld = [];                        // pairs the envelope could never open again, kept aside and never deleted
let branchRevs = {};                           // desk file id -> the last edition written, kept when the file is removed
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
let plainSaid = false;
function branchSealable() {
  const ok = sealsForReal(safeStorage, process.platform);
  if (!ok && !plainSaid && process.platform === "linux") {
    plainSaid = true;
    console.error("etiuda: no keyring answers on this desk, so no private key is kept and the desk's own file is not written");
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
function branchSign(doc) {
  const key = openPrivate(deskBranch.sign.priv);
  return key ? crypto.sign(null, branchSignedBytes(doc), key).toString("hex") : "";
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
function branchStemOk(s) {
  return !!s && s.length <= BRANCH_STEM_MAX && s === s.trim() && !/[\\/:*?"<>|\u0000-\u001f]/.test(s)
    && !/[. ]$/.test(s) && s !== "." && s !== ".." && !DESK_ID_RESERVED.test(s);
}
/* Where this desk's own file for a catalog goes, and null where the catalog folder is not there to
   hold it: the folder is never made here, since a share that has gone away would be made again. */
function branchDest(stem) {
  const root = catalogFolder(), dir = path.join(root, "desks", deskBranch ? branchIdOf(deskBranch.sign.pub) : "");
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
/* The team file at `root` where it is whole under the lead this desk pinned and lists the catalog, else null. */
function teamCovering(root, catalogId) {
  let doc = null;
  try {
    const file = path.join(root, TEAM_NAME);
    if (fs.statSync(file).size <= TEAM_MAX) doc = JSON.parse(fs.readFileSync(file, "utf8").trim());
  } catch { return null; }
  if (!teamWhole(doc)) return null;
  const pin = teamPins[doc.id];
  return !!pin && pin.keyId === doc.lead.keyId && pin.public === doc.lead.public && Array.isArray(doc.catalogs)
    && doc.catalogs.map(String).indexOf(catalogId) >= 0 ? doc : null;
}
/* The newest key this desk keeps, as {team, epoch, key, plain}, for the one team whose envelope held the edition a file grew from
   (`pin`), where that team also covers the catalog at the folder written to; else null. An edition not opened in this run
   is looked for among the folder's catalogs first. A desk the covering file leaves off its roster at an epoch newer than
   any key it keeps is out of the team, and gets null too. `plain` is the covering file's exportsSealed set false. */
function sealFor(catalogId, pin, root) {
  heedTeam();
  if (!editionTeam.has(pin)) ecFilesIn(root).forEach(f => ecFacts(f, ""));
  const team = editionTeam.get(pin) || "", cover = team ? teamCovering(root, catalogId) : null;
  if (!cover || cover.id !== team) return null;
  const kept = teamKeys[team] || {};
  const epoch = Object.keys(kept).map(Number).filter(n => Number.isInteger(n) && n >= 1).sort((a, b) => b - a)[0];
  if (!epoch) return null;
  const me = deskBranch ? branchIdOf(deskBranch.sign.pub) : "";
  if (cover.epoch > epoch && !cover.roster.some(x => !!x && !!x.desk && x.desk.id === me)) return null;
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
  if (!me) return { ok: false };
  const id = me.id + "-" + tail[1];
  let doc = null, seal = null, grewId = "";
  if (text) {
    try { doc = JSON.parse(text); } catch { return { ok: false }; }
    const d = doc && typeof doc === "object" ? doc.desk : null;
    if (!d || d.id !== me.id || d.key !== me.key || d.box !== me.box || doc.id !== id) return { ok: false };
    if (doc.grew && typeof doc.grew === "object" && teamOpened.has(String(doc.grew.id))) grewId = String(doc.grew.id);
  }
  const at = branchDest(stem);
  if (!at) return { ok: false };
  try {
    if (!folderAnswers(at.root) || !fs.statSync(at.root).isDirectory()) return branchHold(stem, text);
    /* A file grown from a catalog this desk opened from an envelope is that catalog, so it is signed and then sealed for the
       team that sealed the edition it grew from; where that team, its cover at this folder or its key cannot be had, or the
       team has left this desk out, it is held, never written in the clear. */
    if (grewId) {
      seal = sealFor(grewId, String(doc.grew.sha || ""), at.root);
      if (!seal) return branchHold(stem, text);
    }
    const same = ownFilesWithId(at.dir, id);
    const lastRev = same.reduce((hi, e) => Math.max(hi, +e.doc.rev || 0), branchRevs[id] || 0);
    const tidy = () => same.forEach(e => { if (e.file !== at.dest) fs.unlinkSync(e.file); });
    if (!doc) {
      if (lastRev > (branchRevs[id] || 0)) { branchRevs[id] = lastRev; persistDeskEnvelope(); }
      same.forEach(e => fs.unlinkSync(e.file));
      if (!same.some(e => e.file === at.dest) && fs.existsSync(at.dest)) fs.unlinkSync(at.dest);
      heldBranch.delete(stem);
      return { ok: true, removed: true };
    }
    const was = same.filter(e => e.file === at.dest)[0] || {}, had = was.doc || null;
    // Unchanged only where it also stands sealed as this write would seal it: plain stays plain, and an envelope moves to the newest epoch.
    if (had && was.sealed === (seal ? seal.team + "|" + seal.epoch : "") && branchGenuine(had) && branchContent(had) === branchContent(doc)) {
      tidy();
      heldBranch.delete(stem);
      return { ok: true, unchanged: true, rev: +had.rev || 0 };
    }
    doc.rev = lastRev + 1;
    doc.hash = channelHash(doc);
    doc.sig = { alg: "Ed25519", keyId: me.id };
    doc.sig.value = branchSign(doc);
    if (!doc.sig.value) return { ok: false };
    for (const dir of [path.join(at.root, "desks"), at.dir]) {
      try { fs.mkdirSync(dir); } catch (e) { if (e.code !== "EEXIST") throw e; }
    }
    const signed = JSON.stringify(doc, null, 1) + "\n";
    const written = seal ? JSON.stringify(sealCatalog(seal.key, seal.team, seal.epoch, signed), null, 1) + "\n" : signed;
    writeReplacing(at.dest, written);
    historyKeep(at.dest, written, true);
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
  if (!heldBranch.size || !folderAnswers(catalogFolder())) return;
  for (const [stem, text] of Array.from(heldBranch)) {
    const r = writeBranch(stem, text);
    if (!r.ok && !r.held) heldBranch.delete(stem);
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
const teamOpened = new Set();                  // catalog ids this desk has opened from an envelope, kept in the desk envelope
const teamSeen = new Set();                    // teams whose pinned lead key the agent has been shown, kept in the desk envelope
const teamBarred = new Set();                  // teams whose lead the agent forgot: no first admission but by an answered request
const editionTeam = new Map();                 // an opened edition's pin -> the team whose envelope held it, "" if two did; this run only
let teamStamp = "";                            // what the team file, the ring and the box were when last heeded
const teamSaid = new Set();
/* Whether a team file is whole under the lead key it names, which is what the engine's v2TeamSigState says. */
function teamWhole(doc) {
  const lead = doc && doc.lead, sig = doc && doc.sig;
  try {
    return +doc.format === 1 && doc.kind === "etiuda-team" && SEALED_TEAM_RE.test(String(doc.id)) && Number.isInteger(doc.epoch)
      && doc.epoch >= 1 && Array.isArray(doc.roster) && !!lead && typeof lead === "object" && typeof lead.keyId === "string"
      && /^[0-9a-f]{64}$/.test(String(lead.public)) && !!sig && sig.keyId === lead.keyId && /^[0-9a-f]{128}$/.test(String(sig.value))
      && crypto.verify(null, signedBytesOf(doc), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(lead.public, "hex")]),
        format: "der", type: "spki" }), Buffer.from(sig.value, "hex"));
  } catch { return false; }
}
/* Whether the ring beside the catalogs lists the team's lead key for a catalog the team covers, read as v2RingRead reads it. */
function ringVouches(doc) {
  let ring = null;
  try {
    const file = path.join(catalogFolder(), RING_NAME);
    if (fs.statSync(file).size <= 65536) ring = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return false; }
  const covers = Array.isArray(doc.catalogs) ? doc.catalogs.map(String) : [];
  return !!ring && typeof ring === "object" && +ring.format === 1 && ring.kind === "etiuda-ring" && Array.isArray(ring.keys)
    && ring.keys.some(e => !!e && typeof e === "object" && covers.indexOf(String(e.catalog)) >= 0 && e.keyId === doc.lead.keyId
      && e.alg === "Ed25519" && e.public === doc.lead.public);
}
/* The team key this desk's own roster entry wraps for the file's epoch, or null; false where the desk's own box would
   not open, which a later read may yet do. HPKE binds the box and the aad the id. */
function ownTeamKey(doc) {
  if (!deskBranch) return null;
  const id = branchIdOf(deskBranch.sign.pub);
  const e = doc.roster.find(x => !!x && !!x.desk && x.desk.id === id);
  if (!e || !e.wrap) return null;
  const sk = openPrivate(deskBranch.box.priv);
  return sk ? unwrapTeamKey(sk, e.wrap, doc.id, doc.epoch, id) : false;
}
function teamSay(line) {
  if (teamSaid.has(line)) return;
  teamSaid.add(line);
  console.error("etiuda: " + line);
}
function fileStamp(file) {
  try { const st = fs.statSync(file); return Math.round(st.mtimeMs) + "|" + st.size; } catch { return "-"; }
}
/* Reads the team file where it, the ring or the desk's box has changed since, pins its lead by the rule above and
   keeps this desk's key for its epoch. What it learns is in teamPins and teamKeys, and in the desk envelope. */
function heedTeam() {
  if (deskKeys === undefined) deskKeys = readDesk();
  const root = catalogFolder();
  if (!folderAnswers(root)) return;
  const file = path.join(root, TEAM_NAME);
  const stamp = [file, fileStamp(file), fileStamp(path.join(root, RING_NAME)), deskBranch ? deskBranch.box.pub : "",
    teamJoin && teamJoin.opened ? teamJoin.team + ":" + teamJoin.opened.lead.public : "", teamJoin ? teamJoin.commit : ""].join("|");
  if (stamp === teamStamp) return;
  /* The stamp is a verdict on the text, so a read that fails or a key that is not kept leaves it unset and the next
     call reads again. */
  let text;
  try { text = fs.statSync(file).size <= TEAM_MAX ? fs.readFileSync(file, "utf8") : null; }
  catch (e) { if (e.code === "ENOENT") teamStamp = stamp; return; }
  teamStamp = stamp;
  let doc = null;
  try { if (text !== null) doc = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { return; }
  if (!teamWhole(doc)) { teamSay(file + " is not a team file whole under its lead's key, so nothing in it is used"); return; }
  const lead = { keyId: doc.lead.keyId, public: doc.lead.public }, pin = teamPins[doc.id];
  const handed = !!pin && (pin.keyId !== lead.keyId || pin.public !== lead.public);
  if (handed && !handedTo(doc, pin)) {
    teamSay(file + " is signed by a key other than the lead's this desk trusts for team " + doc.id + ", so nothing in it is used");
    return;
  }
  // A forgotten lead is held like a request still waiting: no lead is known until an answered request names one.
  const asked = !pin && teamJoin && teamJoin.team === doc.id ? (teamJoin.opened ? teamJoin.opened.lead : { keyId: "", public: "" })
    : !pin && teamBarred.has(doc.id) ? { keyId: "", public: "" } : null;
  if (asked && (asked.keyId !== lead.keyId || asked.public !== lead.public)) {
    if (asked.public)
      teamSay(file + " is signed by a key other than the lead this desk asked to join team " + doc.id + ", so nothing in it is used");
    return;
  }
  const key = ownTeamKey(doc);
  if (key === false) teamStamp = "";
  if (!pin && !key && !ringVouches(doc)) return;
  let changed = false;
  if (!pin || handed) { teamPins[doc.id] = lead; changed = true; }
  if (!pin) teamBarred.delete(doc.id);
  if (handed) teamSay(file + " hands team " + doc.id + " from the lead key this desk trusted to " + lead.public + ", which it now trusts instead");
  const kept = teamKeys[doc.id] || {};
  if (key && !kept[doc.epoch]) {
    try {
      if (!branchSealable()) throw new Error("safeStorage is not available");
      kept[doc.epoch] = safeStorage.encryptString(key.toString("base64")).toString("base64");
      teamKeys[doc.id] = kept;
      ecFactsRead.clear();
      changed = true;
    } catch (e) { teamStamp = ""; teamSay("the team key for " + doc.id + " could not be kept - " + e.message); }
  }
  if (changed) persistDeskEnvelope();
}
/* The catalog's text inside a sealed envelope, where this desk holds its team's key for its epoch, else null. */
function teamOpen(data) {
  heedTeam();
  const kept = teamKeys[String(data.team)];
  const sealed = kept && Number.isInteger(data.epoch) ? kept[data.epoch] : "";
  if (!sealed) return null;
  let key = null;
  try { key = Buffer.from(safeStorage.decryptString(Buffer.from(sealed, "base64")), "base64"); } catch { return null; }
  return openSealed(key, data);
}

/* ---- this desk asking to join a team: one request at a time, made by the agent's press ---------------
   The request sits in the desk's own folder; the nonce it commits to stays in the desk envelope until the
   lead's opening for that very commitment is read, and is then revealed against that opening alone, which
   is kept: a later opening is never answered, and the lead it names is the one a first admission must carry. While the
   request waits or stands refused, no first admission is taken for its team. */
let teamJoin = null;                            // {team, file, nonce, commit, asked, held, name, opened?, refused?}
let joinSent = "";
function newestEpoch(team) {
  return Object.keys(teamKeys[team] || {}).reduce((hi, n) => Math.max(hi, +n || 0), 0);
}
/* The newest envelope in the catalog folder whose epoch this desk keeps no key for, as {file, team}, or null. */
function sealedOutside() {
  heedTeam();
  for (const f of ecFilesIn(catalogFolder())) {
    let d = null;
    try { if (fs.statSync(f).size <= BRANCH_TEXT_MAX) d = catalogPayload(fs.readFileSync(f, "utf8")).data; } catch { continue; }
    if (!d || d.kind !== SEALED_KIND || !SEALED_TEAM_RE.test(String(d.team)) || !Number.isInteger(d.epoch)) continue;
    if (!(teamKeys[d.team] && teamKeys[d.team][d.epoch])) return { file: path.basename(f), team: String(d.team) };
  }
  return null;
}
function joinFile() {
  return path.join(catalogFolder(), "desks", branchIdOf(deskBranch.sign.pub), "join.json");
}
/* Signs the request with the desk's key under the join prefix and writes it by replacement; throws what stopped it. */
function writeJoin(doc) {
  const key = openPrivate(deskBranch.sign.priv);
  if (!key) throw new Error("the desk's key could not be opened");
  doc.sig = { alg: "Ed25519", keyId: branchIdOf(deskBranch.sign.pub) };
  doc.sig.value = crypto.sign(null, joinSignedBytes(doc), key).toString("hex");
  const file = joinFile();
  for (const dir of [path.dirname(path.dirname(file)), path.dirname(file)]) {
    try { fs.mkdirSync(dir); } catch (e) { if (e.code !== "EEXIST") throw e; }
  }
  writeReplacing(file, JSON.stringify(doc, null, 1) + "\n");
}
function joinRequestDoc(j, reveal) {
  const me = branchIdentity(false), desk = { id: me.id, key: me.key, box: me.box };
  if (j.name) desk.name = j.name;
  const doc = { format: 1, kind: JOIN_KIND, team: j.team, desk: desk, date: new Date(j.asked).toISOString(), commit: j.commit };
  if (reveal) { doc.reveal = j.nonce; doc.opened = reveal; }
  return doc;
}
function askJoin(file, name) {
  if (deskKeys === undefined) deskKeys = readDesk();
  const me = branchIdentity(), root = catalogFolder(), at = path.join(root, path.basename(String(file || "")));
  if (!me || !folderAnswers(root)) return joinView();
  const out = sealedOutside();
  let d = null;
  try { d = catalogPayload(fs.readFileSync(at, "utf8")).data; } catch { return joinView(); }
  if (!out || !d || d.kind !== SEALED_KIND || !SEALED_TEAM_RE.test(String(d.team)) || (teamKeys[d.team] && teamKeys[d.team][d.epoch]))
    return joinView();
  const nonce = crypto.randomBytes(32).toString("hex"), team = String(d.team);
  const j = { team: team, file: path.basename(at), nonce: nonce, commit: joinCommit(team, me.key, me.box, nonce), asked: Date.now(),
              held: newestEpoch(team), name: String(name || "").trim().slice(0, 120) };
  try { writeJoin(joinRequestDoc(j, null)); }
  catch (e) { console.error("etiuda: the request to join could not be written - " + e.message); return joinView(); }
  teamJoin = j;
  persistDeskEnvelope();
  return joinView();
}
function cancelJoin() {
  if (deskKeys === undefined) deskKeys = readDesk();
  if (teamJoin && deskBranch) { try { fs.unlinkSync(joinFile()); } catch { /* gone already, or the share is away */ } }
  teamJoin = null;
  persistDeskEnvelope();
  return joinView();
}
/* Moves the request on and says where it stands: admitted once this desk keeps a newer key for the team than when it
   asked, revealed once the lead's opening for its commitment is read and the reveal written, refused where the lead said so.
   `leads` is leadsView's. */
function joinView() {
  if (deskKeys === undefined) deskKeys = readDesk();
  const view = { sealed: null, join: null, joined: null, leads: leadsView() };
  const root = catalogFolder();
  if (!folderAnswers(root)) return view;
  heedTeam();
  const j = teamJoin, me = branchIdentity(false);
  if (j && me && newestEpoch(j.team) > j.held) {
    try { fs.unlinkSync(joinFile()); } catch { /* gone already */ }
    teamJoin = null;
    persistDeskEnvelope();
    view.joined = { team: j.team, file: j.file };
  } else if (j && me) {
    if (!j.opened && !j.refused) {
      let joins = null;
      try { joins = JSON.parse(fs.readFileSync(path.join(root, JOINS_NAME), "utf8")); } catch { /* none yet */ }
      const got = joinOpening(joins, j.team, me.id, j.commit);
      if (got && got.refused) { j.refused = true; persistDeskEnvelope(); }
      else if (got) {
        try { writeJoin(joinRequestDoc(j, got)); j.opened = got; persistDeskEnvelope(); }
        catch (e) { console.error("etiuda: the request to join could not be answered - " + e.message); }
      }
    }
    view.join = { team: j.team, file: j.file, asked: j.asked, name: j.name,
                  state: j.refused ? "refused" : j.opened ? "code" : "waiting",
                  code: j.opened ? joinCode(j.team, me.key, me.box, j.opened.lead.public, j.nonce, j.opened.nonce) : "" };
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
  return ok ? j : null;
}
/* The lead key as Studio's Settings show it, the 16 hex after "studio-" (sign.mjs keyIdFor), made from the public half and
   never from the file's keyId, which any writer of the share chooses. */
function leadPrint(publicHex) {
  return crypto.createHash("sha256").update(Buffer.from(String(publicHex), "hex")).digest("hex").slice(0, 16);
}
/* Every lead this desk trusts, for the agent to compare once after admission and to forget at any time. */
function leadsView() {
  return Object.keys(teamPins).filter(t => SEALED_TEAM_RE.test(t)).map(t => ({ team: t, print: leadPrint(teamPins[t].public),
    admitted: newestEpoch(t) > 0, seen: teamSeen.has(t) }));
}
function leadSeen(team) {
  team = String(team || "");
  if (teamPins[team] && !teamSeen.has(team)) { teamSeen.add(team); persistDeskEnvelope(); }
  return joinView();
}
/* Forgetting a lead takes its pin and every key kept under it, and bars a first admission for its team until a request the
   agent makes is answered: the file that pinned it is likely still on the share. What this desk opened stays held back. */
function forgetLead(team) {
  team = String(team || "");
  if (deskKeys === undefined) deskKeys = readDesk();
  if (!SEALED_TEAM_RE.test(team) || !teamPins[team]) return joinView();
  delete teamPins[team];
  delete teamKeys[team];
  teamSeen.delete(team);
  teamBarred.add(team);
  for (const [pin, t] of Array.from(editionTeam)) if (t === team) editionTeam.delete(pin);
  ecFactsRead.clear();
  teamStamp = "";
  persistDeskEnvelope();
  console.error("etiuda: the lead of team " + team + " is forgotten, with the keys this desk kept for it");
  return joinView();
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
      put: place === "folder" && !current && !!held && held.free && historyFree(v) && /\.ec$/i.test(v.path) };
  });
}
/* A kept version's catalog for the page, opened where it is sealed and this desk holds the key; "" where it is not. */
function historyOpen(sha, file) {
  const v = historyFind(sha, file);
  if (!v) return null;
  const name = v.path ? path.basename(v.path) : "";
  try { return { name: name, text: catalogRead(historyText(v.sha)).json }; }
  catch (e) { console.error("etiuda: an earlier version of " + (v.path || v.sha) + " could not be opened - " + e.message); return { name: name, text: "" }; }
}
/* Writes a kept version back over its file in the catalog folder, by the rule at historyFree and only after the bytes it
   replaces are kept themselves: `replaced` names them, so the page can offer them back. */
function historyPutBack(sha, file) {
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
   it taken by exclusive create. Only a catalog with no signature and no seal is read for this or written, and the bytes
   a write replaces are kept in the history first. */
// A lock this old is a desk that stopped mid-write, and is taken over.
const SHARED_LOCK_MS = 30 * 1000;
function sharedFile(name) {
  const base = String(name || ""), root = catalogFolder();
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
  const file = sharedFile(name);
  if (!file) return null;
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); }
  catch (e) { if (e.code !== "ENOENT") return null; }
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
/* Writes the page's merged catalog over the file it read, answered {ok, rev}, or {changed} where the file is no longer
   the one read, {busy} where another desk holds the lock, {taken} where a file to be created is already there, and
   {refused} for a signed or sealed catalog on either side. */
function sharedWrite(name, text, sha, create) {
  const file = sharedFile(name);
  text = String(text || "");
  if (!file || !text || text.length > BRANCH_TEXT_MAX) return { ok: false };
  let data = null;
  try { data = catalogPayload(text).data; } catch { return { ok: false }; }
  if (!isV2(data) || !historyFree(historyFacts(text))) return { ok: false, refused: true };
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
    console.log("etiuda: " + file + " now holds this desk's changes, edition " + (+data.rev || 0));
    return { ok: true, rev: +data.rev || 0 };
  } catch (e) {
    console.error("etiuda: " + file + " could not be written - " + e.message);
    return { ok: false, busy: true };
  } finally {
    if (sharedHolds(held)) { try { fs.unlinkSync(held.lock); } catch { /* stale in SHARED_LOCK_MS */ } }
  }
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
/* Throws while the live file is still neither readable nor kept, so no write can replace it. */
function keepUnkept() {
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
    if (!keys) {
      console.error("etiuda: " + file + " is not a desk this version can read");
      refused.push({ file: file, buf: buf });
      continue;
    }
    deskRestored = (file === tried[0]) ? "" : String((doc && doc.saved) || "");
    settleRefused(refused, unread, tried[0], doc);
    if (doc && typeof doc.desk === "string" && doc.desk) theDeskId = doc.desk;
    if (doc && Array.isArray(doc.answered)) answeredIds = doc.answered.map(String).filter(Boolean);
    if (doc && doc.held && typeof doc.held === "object"
        && typeof doc.held.id === "string" && typeof doc.held.text === "string") {
      heldStats = { id: doc.held.id, text: doc.held.text };
    }
    if (branchPairOk(doc && doc.branch)) deskBranch = doc.branch;
    if (doc && Array.isArray(doc.branchOld)) deskBranchOld = doc.branchOld.filter(branchPairOk);
    if (doc && doc.branchRevs && typeof doc.branchRevs === "object" && !Array.isArray(doc.branchRevs)) {
      branchRevs = {};
      Object.keys(doc.branchRevs).forEach(k => { if (Number.isInteger(doc.branchRevs[k]) && doc.branchRevs[k] > 0) branchRevs[k] = doc.branchRevs[k]; });
    }
    const table = v => !!v && typeof v === "object" && !Array.isArray(v);
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
    if (doc && Array.isArray(doc.teamOpened)) doc.teamOpened.forEach(c => { if (typeof c === "string" && c) teamOpened.add(c); });
    [["teamSeen", teamSeen], ["teamBarred", teamBarred]].forEach(([k, set]) => {
      if (doc && Array.isArray(doc[k])) doc[k].forEach(t => { if (SEALED_TEAM_RE.test(String(t))) set.add(String(t)); });
    });
    teamJoin = joinKept(doc && doc.teamJoin);
    ensureDeskId();
    console.log("etiuda: desk read from " + file + ", " + Object.keys(keys).length + " keys");
    return keys;
  }
  deskRestored = "";
  settleRefused(refused, unread, tried[0], null);
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
function writeDesk(text, from) {
  let map;
  try { map = JSON.parse(text); } catch { return false; }
  if (!map || typeof map !== "object" || Array.isArray(map)) return false;
  if (deskKeys === undefined) deskKeys = readDesk();
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
   profile, where a customer's name and a search would outlast the window; this is never written. */
const sessionHeld = new Map();
ipcMain.on("etiuda:session", (e, op, key, value) => {
  let out = null;
  if (fromEngine(e) && typeof op === "string" && typeof key === "string") {
    const id = e.sender.id;
    if (!sessionHeld.has(id)) {
      sessionHeld.set(id, new Map());
      e.sender.once("destroyed", () => sessionHeld.delete(id));
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
    const out = execFileSync("reg",
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

ipcMain.on("etiuda:host", (e) => {
  if (!fromEngine(e)) {
    e.returnValue = { platform: process.platform, backdrop: null, maximized: false,
                      catalogFolder: "", catalogFile: "", catalogIn: "", catalogBuiltIn: false };
    return;
  }
  const win = BrowserWindow.fromWebContents(e.sender);
  e.returnValue = {
    platform: process.platform,
    backdrop: hostBackdrop(),
    maximized: !!(win && win.isMaximized()),
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
              deskOk: deskFileGenuine(data, deskFolder) };
    }
  } catch { /* not a catalog */ }
  ecFactsRead.set(file, [stamp, out]);
  return out;
}
function deskRowOf(file, folder) {
  const x = ecFacts(file, folder);
  if (!x || !x.deskOk) return null;
  return { name: path.basename(file), mtime: x.mtime, cards: x.cards, edition: x.edition, macros: x.macros, intents: x.intents, cats: x.cats,
           awaiting: x.awaiting, sample: false, id: x.id, builtIn: false, rev: x.rev, grew: x.grew, sha: x.sha,
           desk: { id: folder, name: x.deskName } };
}
function deskRows() {
  const root = catalogFolder();
  if (!folderAnswers(root)) return [];
  let ids = [];
  try { ids = fs.readdirSync(path.join(root, "desks")); } catch { return []; }
  return ids.filter(n => /^k-[0-9a-f]{16}$/.test(n)).sort().reduce((out, n) =>
    out.concat(ecFilesIn(path.join(root, "desks", n)).map(f => deskRowOf(f, n)).filter(Boolean)), []);
}
/* What a file says it grew from, or null: the three fields and nothing else. */
function ecGrew(data) {
  const g = data && data.grew;
  return g && typeof g === "object" && typeof g.id === "string" ? { id: g.id, rev: +g.rev || 0, sha: String(g.sha || "") } : null;
}
function listingRows() {
  return sampleLast(ecFilesIn(catalogFolder()).concat(builtInFiles())).map(f => {
    let mt = 0;
    try { mt = Math.round(fs.statSync(f).mtimeMs); } catch { /* renamed away under the listing */ }
    const x = refusedByEngine(f) ? null : ecFacts(f, "");
    return { name: path.basename(f), mtime: mt, cards: x ? x.cards : -1, edition: x ? x.edition : "",
             macros: x ? x.macros : -1, intents: x ? x.intents : -1, cats: x ? x.cats : -1, awaiting: x ? x.awaiting : [],
             sample: isTheSample(f), id: x ? x.id : "", rev: x ? x.rev : 0, grew: x ? x.grew : null, sha: x ? x.sha : "",
             // The copy Etiuda ships, rather than a folder's own file of any name.
             builtIn: path.dirname(f) === BUILT_IN_DIR };
  }).concat(deskRows());
}
ipcMain.handle("etiuda:catalog-files", (e) => (fromEngine(e) ? listingRows() : []));
/* THE LISTING IS SENT, not only asked for: once at boot, and again whenever the set of files in it, by place, id,
   edition and hash, changes, so a rename or a newer edition under another name reaches the page, which decides what
   it means. A date moving alone is no change, and nothing is sent while the folder does not answer. This is not
   etiuda:catalog-file, whose one meaning is a catalog's text to offer. */
let listingSent = "";
function sendListing(win, force) {
  if (!win || win.isDestroyed() || !folderAnswers(catalogFolder())) return;
  const rows = listingRows();
  const key = JSON.stringify(rows.map(r => [r.desk ? r.desk.id : r.builtIn ? "~" : "", r.name, r.id, r.rev, r.sha]).sort());
  if (!force && key === listingSent) return;
  listingSent = key;
  win.webContents.send("etiuda:catalog-listing", rows);
}
/* `desk` names a colleague's folder under desks/, and its file is handed only where the listing would list it. */
ipcMain.handle("etiuda:catalog-read", (e, name, desk) => {
  if (!fromEngine(e)) return null;
  const base = String(name || ""), who = desk == null ? "" : String(desk);
  if (!base || base !== path.basename(base) || !/\.ec$/i.test(base)) return null;
  if (who && !/^k-[0-9a-f]{16}$/.test(who)) return null;
  const file = who ? path.join(catalogFolder(), "desks", who, base) : (catalogFileNamed(base) || path.join(catalogFolder(), base));
  try {
    if (!fileAnswers(file) || (who && !folderAnswers(catalogFolder()))) throw new Error("the catalog folder is not answering");
    if (who && !(ecFacts(file, who) || {}).deskOk) throw new Error("not a desk's own file");
    return { name: base, text: catalogTextOf(fs.readFileSync(file, "utf8")) };
  }
  catch (err) {
    console.error("etiuda: " + file + " could not be read - " + err.message);
    return { name: base, text: "" };
  }
});
/* THE RING, the text of V2_RING_FILE in the catalog folder or "" where there is none: the page
   reads it with the engine's own v2RingRead, and a ring only adds trust, so absent is not a
   fault. Bounded like a request, since the share is anybody's to write. */
const RING_NAME = "etiuda-ring.json";
ipcMain.handle("etiuda:catalog-ring", (e) => {
  if (!fromEngine(e) || !folderAnswers(catalogFolder())) return "";
  let text = "";
  try {
    const file = path.join(catalogFolder(), RING_NAME);
    if (fs.statSync(file).size > 65536) { console.error("etiuda: " + file + " is larger than any ring, so it is not read"); return ""; }
    text = fs.readFileSync(file, "utf8");
  } catch { /* no ring, which is the ordinary case */ }
  return text;
});
ipcMain.handle("etiuda:stats-write", (e, text) => {
  if (!fromEngine(e)) return { ok: false };
  return writeStatsAnswer(String(text || ""));
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
// "seen" and "forget" name a team where the others name a file.
ipcMain.handle("etiuda:team-join", (e, op, file, name) => (!fromEngine(e) ? null
  : op === "ask" ? askJoin(file, name) : op === "cancel" ? cancelJoin() : op === "seen" ? leadSeen(file)
  : op === "forget" ? forgetLead(file) : joinView()));

/* The engine calls no OS API, so the folder picker is the shell's. The CAPTION comes from the
   page: the shell has no t(), and a dialog captioned in two languages at once is captioned in
   neither. Answers the chosen folder, or "" where the person closed the dialog; writing the
   setting is the engine's, through the ordinary desk key the search order above reads. */
ipcMain.handle("etiuda:pick-catalog-folder", async (e, title) => {
  if (!fromEngine(e)) return "";
  const win = BrowserWindow.fromWebContents(e.sender);
  const opts = {
    title: String(title || "Etiuda").slice(0, 120),
    defaultPath: catalogFolder(),
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
    const text = fs.readFileSync(file, "utf8");
    historySoon(file, text);
    return { name: name, text: catalogTextOf(text) };
  }
  catch (err) {
    console.error("etiuda: " + file + " could not be read - " + err.message);
    return { name: name, text: "" };
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
  const seal = sealFor(id, String(from.sha || ""), catalogFolder());
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
    writeReplacing(p.file, out);
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
  const dir = catalogFolder();
  // A folder that is not answering cannot be shown to be a folder, so it is not opened either.
  let isDir = false;
  if (folderAnswers(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* it may be a share that is down */ }
    try { isDir = fs.statSync(dir).isDirectory(); } catch { /* gone, or a share that is down */ }
  }
  if (!isDir) { console.error("etiuda: " + dir + " is not a folder, so it is not opened"); return false; }
  const why = await shell.openPath(dir);
  if (why) console.error("etiuda: " + dir + " could not be opened - " + why);
  return !why;
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
function openExternally(url) {
  try {
    const u = new URL(url), c = linkClicked;
    if (!/^https?:$/.test(u.protocol)) return;
    if (!c || c.href !== u.href || Date.now() - c.at > LINK_CLICK_MS) {
      console.error("etiuda: a web address the page opened without a click on it stays closed");
      return;
    }
    linkClicked = null;
    shell.openExternal(url);
  } catch { /* not a URL this shell can open, and the navigation is refused either way */ }
}

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
   last state the caller saw, since a minimised window is neither. Temp file then rename. */
function saveWindowPlace(win, maximized) {
  if (!win || win.isDestroyed()) return;
  const snapped = !maximized && !win.isMinimized() && typeof win.isSnapped === "function" && win.isSnapped();
  const b = snapped ? win.getBounds() : win.getNormalBounds();
  const file = windowFile();
  try {
    writeReplacing(file, JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height,
                                          maximized: !!maximized }));
  } catch (e) { console.error("etiuda: the window's place could not be written - " + e.message); }
}

/* THE SHELL'S OWN WORDS, for the two surfaces the page cannot draw: the context menu, and the
   recovery window shown when the page itself has stopped. The language is uiLang()'s rule in
   ui-lang.js: the desk's eUiLang where it names one, else the system's. */
const SHELL_WORDS = {
  en: { lang: "en", undo: "Undo", cut: "Cut", copy: "Copy", paste: "Paste", selectAll: "Select all",
        addWord: "Add to dictionary", gone: "Etiuda stopped unexpectedly.", hung: "Etiuda is not responding.",
        restart: "Restart", close: "Close Etiuda", wait: "Wait" },
  pl: { lang: "pl", undo: "Cofnij", cut: "Wytnij", copy: "Kopiuj", paste: "Wklej", selectAll: "Zaznacz wszystko",
        addWord: "Dodaj do słownika", gone: "Etiuda niespodziewanie się zatrzymała.",
        hung: "Etiuda nie odpowiada.", restart: "Uruchom ponownie", close: "Zamknij Etiudę", wait: "Czekaj" },
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
/* THE RECOVERY WINDOW'S PAGE, drawn here because the page that would draw it has stopped. It has
   no script, like the refusal: each choice is a link to a query of its own, which the window
   hears at will-navigate. The leading choice is filled and last, as in the engine's own dialogs,
   and colour-scheme follows nativeTheme, which the desk's theme sets. */
function recoveryDoc(lang, message, buttons) {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const order = buttons.map((b, i) => i).filter(i => i > 0).concat([0]);
  return '<!DOCTYPE html>\n<html lang="' + esc(lang) + '">\n<meta charset="utf-8">\n'
    + '<meta http-equiv="Content-Security-Policy" content="' + policyFor(["'none'"]) + '">\n'
    + '<title>Etiuda</title>\n<style>\n'
    + ':root{color-scheme:light;--bg:#fff;--ink:#0f172a;--soft:color-mix(in srgb,#0f172a 4%,transparent);'
    + '--over:#dde9fc;--over-ink:#0e67d8;--fill:#0e67d8;--lift:brightness(1.08)}\n'
    + '@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#1d1f24;--ink:#e3e6ea;'
    + '--soft:color-mix(in srgb,#e3e6ea 6%,transparent);--over:color-mix(in srgb,#136adc 30%,transparent);--fill:#136adc;'
    + '--over-ink:#fff;--lift:brightness(.92)}}\n'
    + 'html,body{height:100%;margin:0}\n'
    + 'body{box-sizing:border-box;padding:18px 18px 14px;display:flex;flex-direction:column;'
    + 'justify-content:space-between;background:var(--bg);color:var(--ink);cursor:default;user-select:none;'
    + '-webkit-app-region:drag;font:15px/1.5 "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}\n'
    + 'h1{margin:0;font:600 16px/1.35 "Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;'
    + 'letter-spacing:-.2px;text-wrap:balance}\n'
    + 'nav{display:flex;justify-content:flex-end;gap:8px}\n'
    + 'a{-webkit-app-region:no-drag;padding:7px 11px;border:1px solid transparent;border-radius:8px;'
    + 'background:var(--soft);color:var(--ink);font:13px "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;'
    + 'text-decoration:none;white-space:nowrap;outline:none;cursor:default}\n'
    + 'a:hover,a:focus-visible{background:var(--over);color:var(--over-ink)}\n'
    + 'a.go,a.go:hover,a.go:focus-visible{background:var(--fill);border-color:var(--fill);color:#fff;font-weight:600}\n'
    + 'a.go:hover,a.go:focus-visible{filter:var(--lift)}\n'
    + '@media (forced-colors:active){a{border-color:ButtonText}a:focus-visible{outline:2px solid Highlight}}\n'
    + '</style>\n<h1>' + esc(message) + '</h1>\n<nav>'
    + order.map(i => '<a href="?answer-' + i + '"' + (i === 0 ? ' class="go" autofocus' : '') + '>'
      + esc(buttons[i]) + '</a>').join("")
    + '</nav>\n';
}
const RECOVERY_SIZE = { width: 400, height: 112 };
/* A SMALL WINDOW OF ITS OWN, in its own renderer, so it can ask while the desk's page is gone or
   hung. Answers { response } as the system box did: the chosen index, 0 for Escape or a close, and
   nothing once the signal aborts it. ITS PAGE IS A FILE: a link followed in a file:// document
   reaches will-navigate, as the refusal's does, where Chromium stops one in a data: URL unheard
   (measured). A file that cannot be written takes the first choice at once. */
function askInWindow(parent, message, buttons, signal) {
  return new Promise(done => {
    const w = shellWords(), dark = !!nativeTheme.shouldUseDarkColors;
    const file = path.join(os.tmpdir(), "etiuda-recovery-" + process.pid + ".html");
    try { fs.writeFileSync(file, recoveryDoc(w.lang, message, buttons)); }
    catch (e) {
      console.error("etiuda: the recovery window could not be drawn, so its first choice is taken - " + e.message);
      done({ response: 0 });
      return;
    }
    let at = {};
    try {
      const b = parent.getBounds();
      at = { x: Math.round(b.x + (b.width - RECOVERY_SIZE.width) / 2), y: Math.round(b.y + (b.height - RECOVERY_SIZE.height) / 2) };
    } catch { /* Electron centres it on the screen */ }
    const box = new BrowserWindow(Object.assign({
      parent: parent, modal: true, show: false, frame: false, useContentSize: true,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      title: "Etiuda", backgroundColor: dark ? "#1d1f24" : "#ffffff",
      webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false,
        webviewTag: false, webSecurity: true, spellcheck: false },
    }, RECOVERY_SIZE, at, PLACED_ASIDE ? Object.assign({ focusable: false }, offscreenAt()) : {}));
    let answered = false;
    const answer = r => {
      if (answered) return;
      answered = true;
      if (!box.isDestroyed()) box.close();
      try { fs.unlinkSync(file); } catch { /* already gone */ }
      done({ response: r });
    };
    box.webContents.on("will-navigate", (e, url) => {
      e.preventDefault();
      const m = /\?answer-(\d+)$/.exec(String(url || ""));
      if (m && +m[1] < buttons.length) answer(+m[1]);
    });
    box.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    box.webContents.on("before-input-event", (e, input) => {
      if (input.type === "keyDown" && input.key === "Escape") { e.preventDefault(); answer(0); }
    });
    box.on("closed", () => answer(0));
    if (signal) signal.addEventListener("abort", () => answer(-1));
    box.once("ready-to-show", () => {
      if (OFFSCREEN_SHOWN) box.showInactive();
      else if (!OFFSCREEN) box.show();
    });
    console.error("etiuda: the recovery window asks: " + message);
    box.loadFile(file);
  });
}
/* A PAGE THAT STOPS takes the band and its three controls with it, since the window has no frame.
   The first loss reloads the page; a second within a minute asks in the recovery window above, as
   a page that stops answering does. */
function watchPage(win) {
  let lastGone = 0, restarting = false, hangAsk = null;
  const recover = () => { recovering.add(win.webContents.id); win.webContents.reload(); };
  win.webContents.on("render-process-gone", (e, d) => {
    if (win.isDestroyed() || d.reason === "clean-exit") return;
    console.error("etiuda: the page stopped (" + d.reason + ", exit code " + d.exitCode + ")");
    // Kept on the webContents, which outlives the reload, for the host answer to hand on.
    win.webContents.etiudaLost = { reason: String(d.reason), exitCode: d.exitCode, at: Date.now() };
    // Restart in the hang window reloads here, once the old page has gone: a reload sent straight
    // after the kill can land in the dying process and leave the window empty.
    if (restarting) { restarting = false; recover(); return; }
    const again = Date.now() - lastGone < 60000;
    lastGone = Date.now();
    if (!again) { recover(); return; }
    const w = shellWords();
    askInWindow(win, w.gone, [w.restart, w.close]).then(r => {
      if (win.isDestroyed()) return;
      if (r.response === 0) recover(); else if (r.response === 1) win.close();
    });
  });
  win.on("unresponsive", () => {
    if (hangAsk || win.isDestroyed()) return;
    console.error("etiuda: the page is not responding");
    const w = shellWords();
    hangAsk = new AbortController();
    const signal = hangAsk.signal;
    askInWindow(win, w.hung, [w.wait, w.restart], signal).then(r => {
      hangAsk = null;
      if (signal.aborted || r.response !== 1 || win.isDestroyed()) return;
      restarting = true;
      win.webContents.forcefullyCrashRenderer();
    });
  });
  win.on("responsive", () => { if (hangAsk) hangAsk.abort(); });
}
/* ---- THE PICKER: the desk's replies over the window in use, by a hotkey -------------------------
   The hotkey is REGISTERED with Windows (globalShortcut, which is RegisterHotKey there), never a
   keyboard hook: nothing here sees a key but its own combination. Nothing here reads another
   window either, its text, its caret or its pixels, and nothing types into one: the reply goes to
   the clipboard and the agent pastes. The picker is placed by the pointer, the one position that
   belongs to nobody else's window. */
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
  let rows = [], last = null, words = {}, at = 0, asked = 0;
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ICON_AGAIN = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor"'
    + ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.5v3h-3"/></svg>';
  const ICON_STAMP = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor"'
    + ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.2 12.5l.6-4.2a2.6 2.6 0 1 1 3.4 0l.6 4.2"/>'
    + '<path d="M5 17v-2.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2V17z" fill="currentColor"/><path d="M6 20.5h13"/></svg>';
  const list = () => (!q.value.trim() && last)
    ? [Object.assign({ again: true }, last)].concat(rows.filter(r => r.id !== last.id || r.vi !== last.vi)) : rows;
  const paint = () => {
    const all = list();
    if (at >= all.length) at = all.length ? all.length - 1 : 0;
    let n = 0;
    box.innerHTML = all.length ? all.map((r, i) => '<li role="option" id="r' + i + '" data-i="' + i + '"'
        + (i === at ? ' class="on" aria-selected="true"' : ' aria-selected="false"')
        + (r.again ? ' title="' + esc(words.again) + '"' : '') + '>'
        + '<span class="n">' + (r.again ? ICON_AGAIN : (++n <= 9 ? String(n) : "")) + '</span>'
        + '<span class="t">' + esc(r.t) + '</span>'
        + (r.commits ? '<span class="st" title="' + esc(words.stamp) + '">' + ICON_STAMP + '</span>' : '')
        + '<span class="x">' + esc(r.x) + '</span>'
        + (r.tag ? '<span class="g">' + esc(r.tag) + '</span>' : '') + '</li>').join("")
      : '<li class="none" role="presentation">' + esc(q.value.trim() ? words.none : words.empty) + '</li>';
    q.setAttribute("aria-activedescendant", all.length ? "r" + at : "");
    box.querySelectorAll(".t,.x").forEach(el => el.classList.toggle("cut", el.scrollWidth > el.clientWidth + 1));
  };
  const take = r => { if (r) P.copy(JSON.stringify(r.again ? { last: true } : { id: r.id, vi: r.vi })); };
  P.onOpen(text => {
    let o = {};
    try { o = JSON.parse(text) || {}; } catch (e) { o = {}; }
    const look = o.look || {}, root = document.documentElement;
    Object.keys(look.vars || {}).forEach(k => root.style.setProperty(k, look.vars[k]));
    root.dataset.theme = look.theme || "";
    root.classList.toggle("glass", !!look.glass);
    root.classList.toggle("still", !!look.still);
    words = o.words || {};
    root.lang = words.lang || "en";
    q.placeholder = words.search || "";
    box.setAttribute("aria-label", words.list || "");
    rows = Array.isArray(o.rows) ? o.rows : [];
    last = o.last || null;
    q.value = ""; at = 0; asked++;
    paint();
    q.focus();
    P.ready();
  });
  q.addEventListener("input", () => {
    const mine = ++asked;
    P.find(q.value).then(text => {
      if (mine !== asked) return;
      let o = {};
      try { o = JSON.parse(text) || {}; } catch (e) { o = {}; }
      rows = Array.isArray(o.rows) ? o.rows : [];
      at = 0;
      paint();
    });
  });
  q.addEventListener("keydown", e => {
    const all = list();
    if (e.key === "Escape") { e.preventDefault(); P.close(); return; }
    if (e.key === "Tab") { e.preventDefault(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!all.length) return;
      at = (at + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length;
      paint();
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); take(all[at]); return; }
    const d = /^(Digit|Numpad)([0-9])$/.exec(e.code || "");
    if (d && e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (d[2] === "0") { P.copy(JSON.stringify({ last: true })); return; }
      take(all.filter(r => !r.again)[+d[2] - 1]);
    }
  });
  box.addEventListener("mousemove", e => {
    const li = e.target.closest && e.target.closest("li[data-i]");
    if (li && +li.dataset.i !== at) { at = +li.dataset.i; paint(); }
  });
  box.addEventListener("mousedown", e => e.preventDefault());
  box.addEventListener("click", e => {
    const li = e.target.closest && e.target.closest("li[data-i]");
    if (li) take(list()[+li.dataset.i]);
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
    + ':root{color-scheme:light;--panel:#fff;--panel-raised:#fff;--ink:#0f172a;--dim:#475569;--line:#e4e8ee;'
    + '--accent:#0e67d8;--field:#fdfdfd;--field-line:#e0e4ea;--field-edge:#aab3c0;--radius-sm:8px;'
    + '--intent-type:16.5px;--warn:#c2410c;--mono:ui-monospace,Consolas,monospace;'
    + '--sans:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}\n'
    + ':root[data-theme=dark]{color-scheme:dark}\n'
    + 'html,body{margin:0;height:100%;overflow:hidden;background:var(--panel-raised)}\n'
    + ':root.glass,:root.glass body{background:transparent}\n'
    + ':root.glass body{background:color-mix(in srgb,var(--panel-raised) 78%,transparent)}\n'
    + 'body{box-sizing:border-box;padding:8px;display:flex;flex-direction:column;gap:6px;color:var(--ink);'
    + 'font:14px/1.35 var(--sans);cursor:default;user-select:none}\n'
    + '#q{box-sizing:border-box;flex:0 0 40px;width:100%;padding:0 12px;border:1px solid var(--field-line);'
    + 'border-bottom-color:var(--field-edge);border-radius:var(--radius-sm);background:var(--field);color:var(--ink);'
    + 'font:var(--intent-type) var(--sans);outline:none}\n'
    + '#q:focus{border-bottom-color:var(--accent);box-shadow:inset 0 -1px 0 var(--accent)}\n'
    + '#rows{flex:1 1 auto;min-height:0;margin:0;padding:0;list-style:none;overflow:hidden}\n'
    + '#rows li{display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;border-radius:var(--radius-sm);'
    + 'white-space:nowrap;transition:background-color .1s}\n'
    + '#rows li.on{background:color-mix(in srgb,var(--accent) 20%,transparent)}\n'
    + '#rows li.on .t,#rows li.on .n{color:var(--accent)}\n'
    + '.n{flex:0 0 18px;display:flex;justify-content:center;font:11px var(--mono);color:var(--dim)}\n'
    + '.t{flex:0 1 auto;max-width:45%;overflow:hidden;font-weight:600}\n'
    + '.x{flex:1 1 0;min-width:0;overflow:hidden;color:var(--dim);font-size:13px}\n'
    + '.cut{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 28px),transparent);'
    + 'mask-image:linear-gradient(to right,#000 calc(100% - 28px),transparent)}\n'
    + '.st{flex:0 0 auto;display:flex;color:var(--warn)}\n'
    + '.g{flex:0 0 auto;font:10px var(--mono);color:var(--dim)}\n'
    + '#rows li.none{height:auto;padding:14px 12px;color:var(--dim);white-space:normal}\n'
    + ':root.still #rows li{transition:none}\n'
    + '@media (prefers-reduced-motion:reduce){#rows li{transition:none}}\n'
    + '@media (forced-colors:active){#rows li.on{outline:2px solid Highlight;outline-offset:-2px}'
    + '#q:focus{outline:2px solid Highlight}}\n'
    + '</style>\n'
    + '<input id="q" type="text" role="combobox" aria-expanded="true" aria-controls="rows" aria-autocomplete="list"'
    + ' autocomplete="off" spellcheck="false">\n'
    + '<ul id="rows" role="listbox"></ul>\n'
    + '<script>' + PICK_SCRIPT + '</script>\n';
}

let pickWin = null, pickLoaded = null, pickOpening = false, pickShown = null;
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
/* THE HOTKEY. A second press while the picker stands closes it; otherwise the desk's page is asked
   for what to show, the picker is filled while hidden and shown only once its page says it has
   drawn, so no opening shows the last one's rows. */
function pickToggle() {
  if (pickWin && !pickWin.isDestroyed() && pickWin.isVisible()) { hidePicker(true); return; }
  if (pickOpening || !theWindow || theWindow.isDestroyed()) return;
  pickOpening = true;
  askDesk("open").then(open => {
    if (!open) { focusDesk(); return null; }
    if (open.look) open.look.glass = !!open.look.glass && hostBackdrop() === "acrylic";
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
      return drawn.then(() => { pickShown = null; if (!win.isDestroyed()) { win.show(); win.focus(); } });
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
ipcMain.handle("etiuda:pick-find", (e, q) => {
  if (!fromPicker(e)) return "null";
  return askDesk("find", { q: String(q || "").slice(0, 200) }).then(v => JSON.stringify(v));
});
/* THE COPY. The desk's page makes the text by its own route and counts it; this writes it to the
   clipboard and steps aside, and Windows gives the focus back to the window the agent came from.
   A reply that signs with a name nobody has given yet is asked in the desk's own window instead. */
ipcMain.handle("etiuda:pick-copy", (e, what) => {
  if (!fromPicker(e)) return false;
  let pick = {};
  try { pick = JSON.parse(String(what || "")) || {}; } catch { pick = {}; }
  const arg = pick.last ? { last: true } : { id: String(pick.id || ""), vi: pick.vi | 0 };
  return askDesk("copy", arg).then(v => {
    if (v && typeof v.text === "string") {
      clipboard.writeText(pickClipText(v.text, process.platform));
      hidePicker(true);
      return true;
    }
    if (v && v.ask) { hidePicker(false); focusDesk(); askDesk("ask", v.ask); }
    return false;
  });
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
  const win = new BrowserWindow({
    ...(place ? { x: place.x, y: place.y, width: place.width, height: place.height } : OPEN_SIZE),
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
  if (place) {
    const want = { x: place.x, y: place.y, width: place.width, height: place.height };
    win.setBounds(want);
    const got = win.getBounds();
    if (got.width !== want.width || got.height !== want.height)
      win.setBounds(Object.assign({}, want, { width: 2 * want.width - got.width, height: 2 * want.height - got.height }));
  }

  /* showInactive, not show: value 2 wants a window with a rectangle and not the focus of
     whoever is at the desk, and show() takes the focus even from a non-focusable window.
     A NAMED FUNCTION AND A ONE-LINE REGISTRATION, because two checks in the harness insert a
     probe after this statement and match it by its text: a handler whose body is inline makes
     that anchor break every time the body changes. */
  /* A window closed maximised is SHOWN by maximize(), so its first frame is already maximised. */
  const showWhenReady = () => {
    if (OFFSCREEN_SHOWN) win.showInactive();
    else if (OFFSCREEN) return;
    else if (place && place.maximized) { win.maximize(); win.focus(); }
    else win.show();
  };
  win.once("ready-to-show", showWhenReady);

  /* The maximise glyph is a picture of the window's state, and the window can reach that state
     without the button: a double-click on the drag band, Windows key and an arrow, a snap. */
  let maximized = !!(place && place.maximized), placeSave = null;
  const keepPlace = () => {
    if (PLACED_ASIDE || win.isDestroyed()) return;
    if (!win.isMinimized()) maximized = win.isMaximized();
    clearTimeout(placeSave);
    placeSave = setTimeout(() => saveWindowPlace(win, maximized), 500);
  };
  const tellMaximized = () => {
    if (!win.isDestroyed()) win.webContents.send("etiuda:maximized", win.isMaximized());
    keepPlace();
  };
  win.on("maximize", tellMaximized);
  win.on("unmaximize", tellMaximized);
  win.on("moved", keepPlace);
  win.on("resized", keepPlace);
  win.on("close", () => {
    if (PLACED_ASIDE) return;
    clearTimeout(placeSave);
    if (!win.isMinimized()) maximized = win.isMaximized();
    saveWindowPlace(win, maximized);
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

  watchPage(win);

  /* The engine carries links to the open internet. Following one inside the window would
     replace the app with a web page and leave no way back to it. */
  win.webContents.setWindowOpenHandler(({ url }) => { openExternally(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => {
    if (url === win.webContents.getURL()) return;
    e.preventDefault();
    if (url.indexOf(CLOSE_MARK) > -1) { win.close(); return; }
    openExternally(url);
  });

  /* THE ZOOM KEYS, which left with the application menu: Ctrl with plus, minus or nought, the
     keypad's as well, in the menu roles' half steps, before the page ever sees the key. */
  win.webContents.on("before-input-event", (e, input) => {
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
  /* The picker is a second window, so it goes with the desk's or the app would outlive it. */
  win.on("closed", () => {
    if (theWindow === win) theWindow = null;
    if (pickWin && !pickWin.isDestroyed()) pickWin.destroy();
  });
  win.loadFile(ENGINE);
  watchCatalog(win);
  win.webContents.on("did-finish-load", () => { setTimeout(() => { tryAnswerRequest(win); tryHeldBranches(); sendListing(win, true); }, 0); });
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

/* ONE ETIUDA AT A TIME, which is what makes the association useful rather than annoying: without
   the lock every double-clicked catalog would open a second window with its own desk file, two
   copies writing the same desk. The second copy hands its path over and exits. The lock is keyed
   on the user-data folder, so a harness launch aimed at a lab of its own is unaffected. */
const theOnlyOne = app.requestSingleInstanceLock();
if (!theOnlyOne) {
  app.quit();
} else {
  app.on("second-instance", (e, argv) => {
    const win = theWindow;
    if (win && !win.isDestroyed() && !PLACED_ASIDE) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const file = ecFromArgv(argv);
    if (!file) return;
    offerFile(win, file);
  });
  openedWith = ecFromArgv(process.argv);
  /* The window waits on the folder's first answer, FOLDER_ASK_MS at most, rather than on a
     synchronous read of a share that is not there. */
  app.whenReady().then(() => {
    dropSessionStorage(); hardenSession(); applyThemeSource();
    const dir = catalogFolder();
    return askFolder(dir).then(ok => {
      settleFolder(dir, ok);
      ensureCatalogFolder(); createWindow();
      hotkeyReady = true; syncHotkey();
      // Asked for here: powerMonitor is not to be used before the app is ready.
      require("electron").powerMonitor.on("resume", () => { folderDown = catalogFolder(); armFolder(theWindow); });
    });
  });
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => { try { globalShortcut.unregisterAll(); } catch { /* none held */ } });
