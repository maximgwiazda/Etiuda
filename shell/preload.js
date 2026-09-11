"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/* The engine reads window.PB_CATALOG while it boots, so the value has to be there before its
   first script runs. A preload is the only code early enough, and a synchronous request the
   only one that answers in time. */
const json = ipcRenderer.sendSync("etiuda:catalog");

if (json) {
  /* Parsed in the page's own world so the engine receives an ordinary object. Handed across
     the bridge instead, it would arrive as a proxy the engine cannot copy or extend. */
  contextBridge.executeInMainWorld({
    func: (text) => { window.PB_CATALOG = JSON.parse(text); },
    args: [json],
  });
}
