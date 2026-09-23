"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/* The engine reads window.E_CATALOG while it boots, so the value has to be there before its
   first script runs. A preload is the only code early enough, and a synchronous request the
   only one that answers in time. */
const json = ipcRenderer.sendSync("etiuda:catalog");

/* The engine reads window.E_HOST at boot to decide whether it is drawing its own window
   controls and whether to leave the band's pixels to a backdrop. Absent in a browser, which is
   the whole test: nothing in the engine asks what platform it is on. */
const host = ipcRenderer.sendSync("etiuda:host");
contextBridge.exposeInMainWorld("E_HOST", {
  platform: host.platform,
  backdrop: host.backdrop,
  maximized: host.maximized,
  minimize: () => ipcRenderer.send("etiuda:window", "minimize"),
  maximize: () => ipcRenderer.send("etiuda:window", "maximize"),
  close: () => ipcRenderer.send("etiuda:window", "close"),
  onMaximized: (fn) => ipcRenderer.on("etiuda:maximized", (_e, v) => fn(!!v)),
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
  catalogMtime: host.catalogMtime,
  /* True when that file is the one this copy was opened with rather than the folder's newest. */
  openedWith: host.openedWith,
  /* The folder's own listing and one file out of it, both asked for after boot: Settings shows
     what is there now, and the folder may have moved since this load began. */
  catalogFiles: () => ipcRenderer.invoke("etiuda:catalog-files"),
  openCatalogFolder: () => ipcRenderer.invoke("etiuda:open-catalog-folder"),
  readCatalogFile: (name) => ipcRenderer.invoke("etiuda:catalog-read", String(name || "")),
  /* The caption is the page's, because the shell has no t(). Async, unlike the desk: a modal
     the person is standing in front of must not hold the renderer's thread. */
  pickCatalogFolder: (title) => ipcRenderer.invoke("etiuda:pick-catalog-folder", String(title || "")),
  /* Import catalog's dialog. Answers {name,text} for a file the person chose, null for a
     dialog they closed, and an empty text for one that would not read: the page decides what
     to say about each, because the caption and every message are the page's. */
  pickCatalogFile: (title, label) =>
    ipcRenderer.invoke("etiuda:pick-catalog-file", String(title || ""), String(label || "")),
  /* The desk, as text in both directions. An object across the bridge would arrive as a proxy,
     the same reason the catalog is parsed in the page's own world below. Both are synchronous:
     the engine reads its whole desk before its first key and storage.js's lsSet promises that
     a write is on the disk before it says so. */
  deskRead: () => ipcRenderer.sendSync("etiuda:desk"),
  deskSave: (text) => ipcRenderer.sendSync("etiuda:desk-save", text),
  /* Where the desk is, for the notice that says it could not be written. */
  deskFile: host.deskFile,
  /* The watched file, spec 11.5. Text, like the desk and for the same reason, and parsed by the
     engine's own reader: the shell has already refused anything that is not a format 2 catalog,
     and two parsers agreeing is what keeps a file the shell accepts a file the engine accepts. */
  onCatalogFile: (fn) => ipcRenderer.on("etiuda:catalog-file",
    (_e, text, name, where, asked) => fn(String(text), String(name || ""), String(where || ""), !!asked)),
  writeStats: (text) => ipcRenderer.invoke("etiuda:stats-write", String(text || "")),
  onStatsAsk: (fn) => ipcRenderer.on("etiuda:stats-ask", (_e, req) => fn(req && typeof req === "object" ? req : {})),
});

if (json) {
  /* Parsed in the page's own world so the engine receives an ordinary object. Handed across
     the bridge instead, it would arrive as a proxy the engine cannot copy or extend. */
  contextBridge.executeInMainWorld({
    func: (text) => { window.E_CATALOG = JSON.parse(text); },
    args: [json],
  });
}
