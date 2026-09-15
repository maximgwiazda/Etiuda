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
  /* Where catalogs are read from, and which file this load got. Read at boot and never again:
     accepting a catalog reloads the document, so a stale answer cannot outlive the fact. The
     folder Settings is showing comes from the desk key instead, which is live. */
  catalogFolder: host.catalogFolder,
  catalogFile: host.catalogFile,
  catalogIn: host.catalogIn,
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
  /* The watched file, spec 11.5. Text, like the desk and for the same reason, and parsed by the
     engine's own reader: the shell has already refused anything that is not a format 2 catalog,
     and two parsers agreeing is what keeps a file the shell accepts a file the engine accepts. */
  onCatalogFile: (fn) => ipcRenderer.on("etiuda:catalog-file",
    (_e, text, name, where) => fn(String(text), String(name || ""), String(where || ""))),
});

if (json) {
  /* Parsed in the page's own world so the engine receives an ordinary object. Handed across
     the bridge instead, it would arrive as a proxy the engine cannot copy or extend. */
  contextBridge.executeInMainWorld({
    func: (text) => { window.E_CATALOG = JSON.parse(text); },
    args: [json],
  });
}
