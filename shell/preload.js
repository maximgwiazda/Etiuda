"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/* The engine reads window.PB_CATALOG while it boots, so the value has to be there before its
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
});

if (json) {
  /* Parsed in the page's own world so the engine receives an ordinary object. Handed across
     the bridge instead, it would arrive as a proxy the engine cannot copy or extend. */
  contextBridge.executeInMainWorld({
    func: (text) => { window.PB_CATALOG = JSON.parse(text); },
    args: [json],
  });
}
