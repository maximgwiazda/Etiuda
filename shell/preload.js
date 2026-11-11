"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

/* THE PICKER'S WINDOW is told so by the shell on its command line, and gets its own eight verbs and
   nothing of the desk's; main answers them only from that window, and the desk's only from the desk. */
const PICKER = typeof process !== "undefined" && Array.isArray(process.argv) && process.argv.indexOf("--etiuda-picker") > -1;
if (PICKER) {
  contextBridge.exposeInMainWorld("E_PICK", {
    find: (q) => ipcRenderer.invoke("etiuda:pick-find", String(q || "")).then(v => String(v || "null")),
    who: (name, q) => ipcRenderer.invoke("etiuda:pick-who", String(name || ""), String(q || "")).then(v => String(v || "null")),
    tab: (id) => ipcRenderer.invoke("etiuda:pick-tab", String(id || "")).then(v => String(v || "null")),
    lang: () => ipcRenderer.invoke("etiuda:pick-lang").then(v => String(v || "null")),
    copy: (what) => ipcRenderer.invoke("etiuda:pick-copy", String(what || "")),
    takeSuggest: (id, multi) => ipcRenderer.invoke("etiuda:pick-intent", String(id || ""), multi ? 1 : 0).then(v => String(v || "null")),
    close: () => ipcRenderer.send("etiuda:pick-close"),
    ready: () => ipcRenderer.send("etiuda:pick-ready"),
    onOpen: (fn) => ipcRenderer.on("etiuda:pick-open", (_e, text) => fn(String(text || ""))),
  });
}

/* THE CLICK THAT LETS A WEB ADDRESS OUT: see linkClicked in main.js. Registered here, before any
   page script, so it hears every click first; the page can neither forge isTrusted nor reach this
   world. A link opened by a script, even from inside a click, is not a link clicked. */
if (!PICKER && typeof window !== "undefined" && typeof window.addEventListener === "function") {
  const clicked = (e) => {
    if (!e.isTrusted || (e.type === "auxclick" && e.button !== 1)) return;
    const at = e.composedPath().find(n => n && (n.localName === "a" || n.localName === "area"));
    const href = at && typeof at.href === "string" ? at.href : "";
    if (/^https?:/i.test(href)) ipcRenderer.sendSync("etiuda:link-click", href);
    /* The release page's button names no address: main takes the one its signed version note holds. */
    else if (e.type === "click" && e.composedPath().some(n => n && n.dataset && n.dataset.eOpen === "update")) ipcRenderer.sendSync("etiuda:update-click");
  };
  window.addEventListener("click", clicked, true);
  window.addEventListener("auxclick", clicked, true);
}

/* The engine reads window.E_CATALOG while it boots, so the value has to be there before its
   first script runs. A preload is the only code early enough, and a synchronous request the
   only one that answers in time. */
const json = PICKER ? null : ipcRenderer.sendSync("etiuda:catalog");

/* The engine reads window.E_HOST at boot to decide whether it is drawing its own window
   controls and whether to leave the band's pixels to a backdrop. Absent in a browser, which is
   the whole test: nothing in the engine asks what platform it is on. */
const host = PICKER ? {} : ipcRenderer.sendSync("etiuda:host");
const sessionCache = new Map(host && host.session ? Object.entries(host.session) : []);
if (!PICKER) contextBridge.exposeInMainWorld("E_HOST", {
  platform: host.platform,
  backdrop: host.backdrop,
  maximized: host.maximized,
  minimize: () => ipcRenderer.send("etiuda:window", "minimize"),
  maximize: () => ipcRenderer.send("etiuda:window", "maximize"),
  close: () => ipcRenderer.send("etiuda:window", "close"),
  /* The shell asks before the window closes, and the page answers: "none", "asked", then "close" or "stay". */
  onAskClose: (fn) => ipcRenderer.on("etiuda:ask-close", () => fn()),
  closeAnswer: (a) => ipcRenderer.send("etiuda:close-answer", String(a || "")),
  onMaximized: (fn) => ipcRenderer.on("etiuda:maximized", (_e, v) => fn(!!v)),
  /* Whether the window was on screen when this load asked, and the word that it is now. */
  shown: !!host.shown,
  onShown: (fn) => ipcRenderer.on("etiuda:shown", () => fn()),
  /* Ctrl+Tab, forwarded by the shell because the page keydown may not see it. shift is the previous tab. */
  onTabChord: (fn) => ipcRenderer.on("etiuda:tab-chord", (_e, v) => fn(!!(v && v.shift))),
  /* The Windows accent, or "" where the desk does not ask for accented title bars. Both the
     value at boot and the changes after it, since either can move while Etiuda is open. */
  accent: host.accent,
  onAccent: (fn) => ipcRenderer.on("etiuda:accent", (_e, v) => fn(String(v || ""))),
  /* Where catalogs are read from, and which file this load got. Read at boot and never again:
     accepting a catalog reloads the document, so a stale answer cannot outlive the fact. The
     folder Settings is showing comes from the desk key instead, which is live. */
  catalogFolder: host.catalogFolder,
  catalogFile: host.catalogFile,
  catalogIn: host.catalogIn,
  /* True where that file is one Etiuda ships, whose folder is never named. */
  catalogBuiltIn: !!host.catalogBuiltIn,
  catalogMtime: host.catalogMtime,
  /* True when that file is the one this copy was opened with rather than the folder's newest. */
  openedWith: host.openedWith,
  /* True once, on the load the shell made after the page stopped. */
  recovering: !!host.recovering,
  /* {reason, exitCode, at} of the last time this page stopped, or null. */
  lostPage: host.lostPage || null,
  /* The engine refused the file named: {json, file, in, builtIn, mtime} for the next one the
     shell would read, or null. Synchronous, because the engine asks while it boots. */
  catalogRefused: (name) => ipcRenderer.sendSync("etiuda:catalog-refused", String(name || "")),
  /* The folder's own listing and one file out of it, both asked for after boot: Settings shows
     what is there now, and the folder may have moved since this load began. */
  catalogFiles: () => ipcRenderer.invoke("etiuda:catalog-files"),
  openCatalogFolder: () => ipcRenderer.invoke("etiuda:open-catalog-folder"),
  /* The listing again, sent by the shell once at boot and whenever the files in it change place, id, edition or hash. */
  onCatalogListing: (fn) => ipcRenderer.on("etiuda:catalog-listing", (_e, rows) => fn(Array.isArray(rows) ? rows : [])),
  /* The ring beside the catalogs as text, read afresh each time the page verifies a signature. */
  catalogRing: () => ipcRenderer.invoke("etiuda:catalog-ring"),
  /* The leads this desk has pinned, [{keyId, public}], which decide the page's key where there are any. */
  catalogLeads: () => ipcRenderer.invoke("etiuda:catalog-leads"),
  /* `asked` is a Load the person chose. The shell then hands the bytes of a lower rev, and the page decides.
     `offer` is a read the page means to offer nobody having asked, which a pinned lead must have signed. */
  readCatalogFile: (name, desk, asked, offer) => ipcRenderer.invoke("etiuda:catalog-read", String(name || ""), desk ? String(desk) : "",
    !!asked, !!offer),
  /* The pin of the catalog the agent just took, and the catalog text when the page sends it with the pin. */
  catalogTaken: (pin, text) => ipcRenderer.send("etiuda:catalog-taken", String(pin || ""), text == null ? "" : String(text)),
  /* The page put the catalog down. Synchronous, because the page restarts as soon as this returns
     and the shell has to have dropped the copy before that restart reads it back. */
  catalogEject: () => ipcRenderer.sendSync("etiuda:catalog-eject"),
  /* The caption is the page's, because the shell has no t(). Async, unlike the desk: a modal
     the person is standing in front of must not hold the renderer's thread. */
  pickCatalogFolder: (title) => ipcRenderer.invoke("etiuda:pick-catalog-folder", String(title || "")),
  /* Import catalog's dialog. Answers {name,text} for a file the person chose, null for a
     dialog they closed, and an empty text for one that would not read: the page decides what
     to say about each, because the caption and every message are the page's. A desk file whose
     writer is off the roster also carries notOnTeam, as an asked catalog-read does. */
  pickCatalogFile: (title, label) =>
    ipcRenderer.invoke("etiuda:pick-catalog-file", String(title || ""), String(label || "")),
  /* The desk, as text in both directions. An object across the bridge would arrive as a proxy,
     the same reason the catalog is parsed in the page's own world below. The read and deskSave
     are synchronous: the engine reads its whole desk before its first key, and deskSave is for
     the write that must be on the disk before it returns. deskWrite is every other one. */
  deskRead: () => ipcRenderer.sendSync("etiuda:desk"),
  /* The tabs' session, held by the app in memory and never written: get, set, del or clear, as text.
     Cached in preload memory and synced asynchronously to main with no sendSync. */
  session: (op, key, value) => {
    const o = String(op || "");
    const k = String(key || "");
    if (o === "get") return sessionCache.has(k) ? sessionCache.get(k) : null;
    if (o === "set") {
      const v = value === undefined ? null : String(value);
      if (typeof v !== "string") return null;
      sessionCache.set(k, v);
      ipcRenderer.send("etiuda:session", o, k, v);
      return true;
    }
    if (o === "del") {
      sessionCache.delete(k);
      ipcRenderer.send("etiuda:session", o, k);
      return true;
    }
    if (o === "clear") {
      sessionCache.clear();
      ipcRenderer.send("etiuda:session", o, k);
      return true;
    }
    return null;
  },
  deskSave: (text) => ipcRenderer.sendSync("etiuda:desk-save", text),
  deskWrite: (text) => ipcRenderer.invoke("etiuda:desk-write", text),
  /* Only the keys this load changed, null for one it deleted; `now` waits for the disk as deskSave does. */
  deskPatch: (text, now) => (now ? ipcRenderer.sendSync("etiuda:desk-patch-save", text)
    : ipcRenderer.invoke("etiuda:desk-patch", text)),
  /* Where the desk is, and the files it refused and kept aside, as text like the desk itself. */
  deskFile: host.deskFile,
  /* The home folder, so a path the page shows can be written %USERPROFILE% rather than by name. */
  home: host.home,
  deskRefused: () => ipcRenderer.sendSync("etiuda:desk-refused"),
  deskRefusedSeen: () => ipcRenderer.send("etiuda:desk-refused-seen"),
  /* A desk a later Etiuda saved, which this one leaves alone: {app, schema} as text, or "". */
  deskNewer: () => ipcRenderer.sendSync("etiuda:desk-newer"),
  /* A refused file somebody double-clicked, {name, why}, answered once. */
  openedRefused: host.openedRefused || null,
  /* An edition in the folder that waits for a newer Etiuda, {name, version}: at boot, and each time the host finds another. */
  catalogNewer: host.catalogNewer || null,
  onCatalogNewer: (fn) => ipcRenderer.on("etiuda:catalog-newer",
    (_e, v) => fn(v && typeof v === "object" ? { name: String(v.name || ""), version: String(v.version || "") } : null)),
  /* Export's dialog, then the write to what was chosen: {name} or null for a dialog closed, then
     {name, ok, sealed} once written or refused. `from` is the catalog the export was made from, {id, sha}. */
  chooseCatalogSave: (title, name, label) => ipcRenderer.invoke("etiuda:choose-catalog-save",
    String(title || ""), String(name || ""), String(label || "")),
  writeCatalogSave: (text, from) => ipcRenderer.invoke("etiuda:write-catalog-save", String(text || ""),
    from && typeof from === "object" ? { id: String(from.id || ""), sha: String(from.sha || "") } : null),
  /* The watched file, spec 11.5. Text, like the desk and for the same reason, and parsed by the
     engine's own reader: the shell has already refused anything that is not a format 2 catalog,
     and two parsers agreeing is what keeps a file the shell accepts a file the engine accepts. */
  onCatalogFile: (fn) => ipcRenderer.on("etiuda:catalog-file",
    (_e, text, name, where, asked, why, builtIn, notOnTeam, code) =>
      fn(String(text), String(name || ""), String(where || ""), !!asked, String(why || ""), !!builtIn,
        notOnTeam === "off-roster" ? "off-roster" : "",
        code === "empty" || (typeof code === "string" && /^[A-Z][A-Z0-9]{1,15}$/.test(code)) ? code : "")),
  /* A catalog dropped on the window, handed over by the path its File has on disk and offered as
     a double-clicked file is. False where the File has no path, and the page reads it instead. */
  offerDropped: (file) => {
    let at = "";
    try { at = webUtils.getPathForFile(file); } catch { /* not a file from the disk */ }
    if (!at) return false;
    ipcRenderer.send("etiuda:offer-dropped", at);
    return true;
  },
  writeStats: (text, askId) => ipcRenderer.invoke("etiuda:stats-write", String(text || ""),
    typeof askId === "string" ? askId : ""),
  /* Closing sends the counts past the two-minute pace. The ordinary flush stays on writeStats. */
  closeStats: (text) => ipcRenderer.invoke("etiuda:stats-close", String(text || "")),
  /* The desk's branch: {id, key, box}, the public halves only, or null where no key can be kept; and the
     desk's own catalog file by its stem, an empty text taking it away. Nothing here hands out a key. */
  branchIdentity: (make) => ipcRenderer.invoke("etiuda:branch-identity", make === false ? false : true),
  writeBranch: (stem, text) => ipcRenderer.invoke("etiuda:branch-write", String(stem || ""), String(text || "")),
  /* The desk's earlier versions of its catalogs: the list, {name, text} for one, and putting one back in the catalog
     folder, answered {ok, replaced}. A version is its hash and the file it was kept for. */
  historyList: () => ipcRenderer.invoke("etiuda:history-list"),
  historyRead: (sha, file) => ipcRenderer.invoke("etiuda:history-read", String(sha || ""), String(file || "")),
  historyPut: (sha, file) => ipcRenderer.invoke("etiuda:history-put", String(sha || ""), String(file || "")),
  /* The shared catalog this desk edits directly, by its name in the catalog folder: {text, sha, free, base} for the
     file and the edition `pin` names, and a write answered only while the file still holds the bytes `sha` names. */
  sharedRead: (name, pin) => ipcRenderer.invoke("etiuda:shared-read", String(name || ""), String(pin || "")),
  sharedWrite: (name, text, sha, create) => ipcRenderer.invoke("etiuda:shared-write", String(name || ""), String(text || ""),
    String(sha || ""), create === true),
  /* Asking to join the team a sealed catalog in the folder belongs to: "state", "ask" with the file's name and the
     agent's, or "cancel", each answered {sealed, join, joined}; and that answer again whenever it changes. "read" and
     "invite" carry an invitation's text where the file's name goes, and "invite" the check code the agent typed. */
  teamJoin: (op, file, name, check) => ipcRenderer.invoke("etiuda:team-join", String(op || ""), String(file || ""), String(name || ""),
    String(check || "")),
  onTeamJoin: (fn) => ipcRenderer.on("etiuda:team-join", (_e, v) => fn(v && typeof v === "object" ? v : {})),
  /* The shell has sent the lead a copy of the catalog in use. The page says so; nothing here asks the agent. */
  onCatalogCopy: (fn) => ipcRenderer.on("etiuda:catalog-copy", (_e, m) => { try { fn({ lead: !!(m && m.lead === true) }); } catch { /* the page has gone */ } }),
  onStatsAsk: (fn) => ipcRenderer.on("etiuda:stats-ask", (_e, req) => fn(req && typeof req === "object" ? req : {})),
  /* The picker's questions, answered by the page as JSON text: what to show, what a query finds, and
     the text a copy puts on the clipboard, which the shell writes. */
  onPickAsk: (fn) => ipcRenderer.on("etiuda:pick-ask", (_e, n, op, arg) => {
    let out = "null";
    try { out = String(fn(String(op || ""), String(arg || ""))); } catch { out = "null"; }
    ipcRenderer.send("etiuda:pick-answer", n, out);
  }),
  /* The hotkey Settings shows: {accel, held, taken} now, a combination tried as {ok, why}, and the
     one held paused while Settings listens for keys. */
  hotkeyState: () => ipcRenderer.sendSync("etiuda:hotkey-state"),
  setHotkey: (accel) => ipcRenderer.invoke("etiuda:hotkey-set", String(accel || "")),
  pauseHotkey: (on) => ipcRenderer.send("etiuda:hotkey-hold", !!on),
  /* The embedded model: {model} says whether this desk carries it, and the switch is told to the shell as it moves. */
  aiState: () => ipcRenderer.sendSync("etiuda:ai-state"),
  setAi: (on) => ipcRenderer.send("etiuda:ai-set", !!on),
  /* The organisation's model in Settings: what is in force, never the key; a save of the fields named, each a string; the
     connection test; and each re-order's outcome as the shell reports it on an event of its own, {ranking, failures,
     pausedUntil, slow}, slow while the service usually answers too late to reorder. */
  deskAiSettings: () => ipcRenderer.sendSync("etiuda:desk-ai-settings"),
  deskAiSave: (fields) => {
    const f = {};
    if (fields && typeof fields === "object") {
      for (const k of ["choice", "provider", "endpoint", "model", "key"]) if (typeof fields[k] === "string") f[k] = fields[k];
    }
    return ipcRenderer.invoke("etiuda:desk-ai-save", f);
  },
  deskAiTest: () => ipcRenderer.invoke("etiuda:desk-ai-test"),
  onAiRanking: (fn) => ipcRenderer.on("etiuda:ai-ranking", (_e, v) => {
    const s = v && typeof v === "object" ? v : {};
    try {
      fn({ ranking: s.ranking === "organisation" ? "organisation" : "builtin", failures: Number.isInteger(s.failures) && s.failures > 0 ? s.failures : 0,
        pausedUntil: typeof s.pausedUntil === "number" && isFinite(s.pausedUntil) ? s.pausedUntil : 0,
        slow: s.slow === true });
    } catch { /* the page has gone */ }
  }),
  /* The main search's own switch, the passages it should embed, and the ranking of one query. */
  setSearchAi: (on) => ipcRenderer.send("etiuda:search-set", !!on),
  searchPrepare: (rows) => ipcRenderer.invoke("etiuda:search-prepare", Array.isArray(rows) ? rows : []),
  searchRank: (text) => ipcRenderer.invoke("etiuda:search-rank", String(text || "")),
  /* The picker opened from the desk itself, by the pointer, as the hotkey opens it. */
  openPicker: () => ipcRenderer.send("etiuda:pick-show"),
  noteOwnText: (text) => ipcRenderer.send("etiuda:own-text", String(text || "")),
  /* Start with Windows, quit on close, and the tray's notification switch. The login item is read
     back from Windows. The page stores quit on close itself and tells the shell, so a close before
     the next read still follows the row. */
  setLoginItem: (on) => ipcRenderer.send("etiuda:login-item-set", !!on),
  loginItemState: () => ipcRenderer.sendSync("etiuda:login-item-state"),
  setClosePolicy: (quit) => ipcRenderer.send("etiuda:close-policy-set", !!quit),
  setTrayNotes: (on) => ipcRenderer.send("etiuda:tray-notes-set", !!on),
  trayNotesState: () => ipcRenderer.sendSync("etiuda:tray-notes-state"),
  notify: (opts) => ipcRenderer.send("etiuda:notify", opts),
  onTrayGo: (fn) => ipcRenderer.on("etiuda:tray-go", (_e, kind) => { try { fn(String(kind || "")); } catch { /* the page has gone */ } }),
  /* The version note: {offer, look} now and after each look, and the release page opened by the shell from the note it kept. */
  updateState: () => ipcRenderer.sendSync("etiuda:update-state"),
  onUpdate: (fn) => ipcRenderer.on("etiuda:update", (_e, v) => { try { fn(v && typeof v === "object" ? v : {}); } catch { /* the page has gone */ } }),
  openUpdatePage: () => ipcRenderer.invoke("etiuda:update-open"),
  /* Returns this desk to a fresh install. The shell does the work on the next start. */
  resetDesk: () => ipcRenderer.invoke("etiuda:desk-reset"),
  /* A reset that could not finish. The page asks to try again, or to stop and keep the desk. */
  onResetUnfinished: (fn) => ipcRenderer.on("etiuda:reset-unfinished", (_e, v) => {
    try { fn(v && typeof v === "object" ? v : {}); } catch { /* the page has gone */ }
  }),
  retryReset: () => ipcRenderer.invoke("etiuda:reset-retry"),
  stopReset: () => ipcRenderer.invoke("etiuda:reset-stop"),
});

if (json) {
  /* Parsed in the page's own world so the engine receives an ordinary object. Handed across
     the bridge instead, it would arrive as a proxy the engine cannot copy or extend. */
  contextBridge.executeInMainWorld({
    func: (text) => { window.E_CATALOG = JSON.parse(text); },
    args: [json],
  });
}
