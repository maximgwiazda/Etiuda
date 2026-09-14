"use strict";

const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

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
  if (catalogFolder() !== dir) return;
  try { fs.mkdirSync(dir, { recursive: true }); }
  catch (e) { console.error("etiuda: " + dir + " could not be made - " + e.message); }
}

/* Newest first, and the name breaks a tie so two files saved in the same millisecond do not
   swap places between launches. A file that cannot be stat'd is one that has just been renamed
   away underneath the listing, and is simply not a candidate. */
function ecFilesIn(dir) {
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
  return catalogFolders().reduce((out, dir) =>
    out.concat(ecFilesIn(dir), [path.join(dir, CATALOG_SCRIPT)]), []);
}
function isCatalogName(name) { return /\.ec$/i.test(name) || name === CATALOG_SCRIPT; }

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

let catalogFrom = "";                          // the file the payload below was read out of
function readCatalog() {
  for (const file of catalogPlaces()) {
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    try {
      const { json, data } = catalogPayload(text);
      if (!isV2(data)) throw new Error("not an Etiuda catalog (format 2)");
      const cards = Array.isArray(data.cards) ? data.cards.length : 0;
      console.log("etiuda: catalog read from " + file + ", " + cards + " cards");
      catalogFrom = file;
      return json;
    } catch (e) {
      console.error("etiuda: " + file + " did not parse as a catalog - " + e.message);
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
let catalogSettle = null, catalogWatchers = [], watchedFolder = "";
function watchCatalog(win) {
  catalogWatchers.forEach(w => { try { w.close(); } catch { /* already gone */ } });
  catalogWatchers = [];
  watchedFolder = catalogFolder();
  const dirs = [];
  catalogFolders().forEach(d => { if (dirs.indexOf(d) < 0) dirs.push(d); });
  for (const dir of dirs) {
    try {
      const w = fs.watch(dir, (ev, name) => {
        if (name && !isCatalogName(path.basename(String(name)))) return;
        clearTimeout(catalogSettle);
        catalogSettle = setTimeout(() => catalogChanged(win), 300);
      });
      w.on("error", e => console.error("etiuda: the watch on " + dir + " stopped - " + e.message));
      catalogWatchers.push(w);
    } catch (e) {
      console.error("etiuda: no watch on " + dir + " - " + e.message);
    }
  }
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
  watchCatalog(win);
  setTimeout(() => catalogChanged(win), 0);
}

/* The engine is OFFERED the new file and never given it: replacing a catalog under somebody
   mid-chat is the one thing the offer dialog exists to prevent, and this is the third channel
   into it rather than a second way of loading. A file that stops parsing leaves what is loaded
   exactly where it is, which is what the read below already does. */
function catalogChanged(win) {
  const now = readCatalog();
  if (now === catalogJson) return;
  catalogJson = now;
  if (!now || !win || win.isDestroyed()) return;
  console.log("etiuda: the catalog file changed, and the window has been offered it");
  win.webContents.send("etiuda:catalog-file", now, path.basename(catalogFrom), path.dirname(catalogFrom));
}

/* The preload asks for this before the first page script runs, so the handler is registered at
   load time rather than after the app is ready. */
let catalogJson;
ipcMain.on("etiuda:catalog", (e) => {
  if (!fromEngine(e)) { e.returnValue = null; return; }
  if (catalogJson === undefined) catalogJson = readCatalog();
  e.returnValue = catalogJson;
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

function deskFile() { return path.join(app.getPath("userData"), "desk.json"); }
function deskBackup(n) { return path.join(app.getPath("userData"), "desk.bak" + n + ".json"); }

/* Pure, and given its table rather than reaching for the module's, so a test can run the engine
   on migrations of its own. Answers null for anything it cannot bring to `target`, a desk
   written by a LATER Etiuda included: that file is not this version's to interpret, and the
   rotation below is what stops it being overwritten in silence. */
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

/* The live file first, then the backups oldest-last, so a desk that will not parse costs the
   last run's state rather than all of it. A refused file is left exactly where it is. */
function readDesk() {
  const tried = [deskFile()];
  for (let n = 1; n <= DESK_BACKUPS; n++) tried.push(deskBackup(n));
  for (const file of tried) {
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    let keys = null;
    try { keys = migrateDesk(JSON.parse(text), DESK_MIGRATIONS, DESK_SCHEMA); } catch { keys = null; }
    if (!keys) { console.error("etiuda: " + file + " is not a desk this version can read"); continue; }
    console.log("etiuda: desk read from " + file + ", " + Object.keys(keys).length + " keys");
    return keys;
  }
  console.log("etiuda: no desk file yet, so this run starts one");
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
   cannot leave half a desk behind. Returns whether the bytes reached the disk, because lsSet
   promises its caller that and storeCatalog acts on it. */
let deskKeys;                                  // the desk as the last read or write left the file
let deskWritten = false;                       // whether the live desk.json is this run's write
const deskGiven = new Map();                   // webContents id -> the map that load was handed
function writeDesk(text, from) {
  let map;
  try { map = JSON.parse(text); } catch { return false; }
  if (!map || typeof map !== "object" || Array.isArray(map)) return false;
  if (deskKeys === undefined) deskKeys = readDesk();
  const merged = mergeDesk(deskKeys, deskGiven.get(from) || {}, map);
  /* A write is skipped only where the live file is known to hold exactly this. A desk recovered
     from a backup has not been written yet, and skipping there would leave the refused file. */
  if (deskWritten && sameDesk(merged, deskKeys)) { deskGiven.set(from, map); return true; }
  const file = deskFile();
  const body = '{"kind":"' + DESK_KIND + '","schema":' + DESK_SCHEMA
    + ',"app":' + JSON.stringify(app.getVersion())
    + ',"saved":' + JSON.stringify(new Date().toISOString())
    + ',"keys":' + (sameDesk(merged, map) ? text : JSON.stringify(merged)) + '}';
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotateDesk();
    fs.writeFileSync(file + ".tmp", body, "utf8");
    fs.renameSync(file + ".tmp", file);
    deskKeys = merged;
    deskWritten = true;
    deskGiven.set(from, map);
    catalogFolderChanged();
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

/* What the engine is told about its host, answered before the first page script runs. Acrylic
   is a Windows 11 material and DwmSetWindowAttribute ignores it below build 22621, silently, so
   the answer is measured here rather than assumed: a null backdrop is what puts the engine on
   its plain band. */
function hostBackdrop() {
  if (process.platform !== "win32") return null;
  const build = Number(os.release().split(".")[2] || 0);
  return build >= 22621 ? "acrylic" : null;
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
                      catalogFolder: "", catalogFile: "", catalogIn: "" };
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
    catalogIn: catalogFrom ? path.dirname(catalogFrom) : "",
  };
});

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

function openExternally(url) {
  try {
    if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url);
  } catch { /* not a URL this shell can open, and the navigation is refused either way */ }
}

/* The one window, held so a folder change arriving through a desk save can re-arm the watch and
   offer what the new folder holds. There is exactly one; a second would need a list. */
let theWindow = null;
function createWindow() {
  const backdrop = hostBackdrop();
  const win = new BrowserWindow({
    width: 1280,
    height: 880,
    show: false,
    /* frame:false, not titleBarStyle 'hidden' with titleBarOverlay. The overlay is drawn by the
       system on top of the page, and a backdrop shows only where the window leaves pixels
       unpainted, so an overlay is an opaque rectangle in the band's right corner whatever
       colour it is given. It also owns the three buttons, which board item 290 gives to the
       band. The same construction serves macOS and Linux; only the material is Windows'. */
    frame: false,
    backgroundColor: "#00000000",
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

  win.once("ready-to-show", () => win.show());

  /* The maximise glyph is a picture of the window's state, and the window can reach that state
     without the button: a double-click on the drag band, Windows key and an arrow, a snap. */
  const tellMaximized = () => {
    if (!win.isDestroyed()) win.webContents.send("etiuda:maximized", win.isMaximized());
  };
  win.on("maximize", tellMaximized);
  win.on("unmaximize", tellMaximized);

  /* The engine carries links to the open internet. Following one inside the window would
     replace the app with a web page and leave no way back to it. */
  win.webContents.setWindowOpenHandler(({ url }) => { openExternally(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => {
    if (url !== win.webContents.getURL()) { e.preventDefault(); openExternally(url); }
  });

  theWindow = win;
  win.on("closed", () => { if (theWindow === win) theWindow = null; });
  win.loadFile(ENGINE);
  watchCatalog(win);
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
    + '<div style="opacity:.75;font:12px/1.5 ui-monospace,Consolas,monospace;margin:0">'
    + plainText(PIN) + '<br>' + plainText(why) + '</div>'
    + '</div></div>\n';
}

function withPolicy(html) {
  const pin = readPin();
  if (pin.why) return refusalDoc(pin.why);
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
}

app.whenReady().then(() => { hardenSession(); ensureCatalogFolder(); createWindow(); });

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
