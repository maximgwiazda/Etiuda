"use strict";

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const ENGINE = path.join(__dirname, "..", "engine", "etiuda.html");

/* Nearest first: the user-data folder, which a packaged copy can write to, then the checkout,
   which is where a catalog sits while 2.x is being built. */
function catalogPlaces() {
  return [
    path.join(app.getPath("userData"), "etiuda-catalog.js"),
    path.join(__dirname, "..", "etiuda-catalog.js"),
  ];
}

/* A catalog is read as data and never run. The engine's own importer finds the payload by the
   PB_CATALOG literal and parses what follows the "=" as JSON; this does the same, so a file
   either engine accepts is a file both accept. See parseCatalogFile in the engine. */
function readCatalog() {
  for (const file of catalogPlaces()) {
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    text = text.replace(/^﻿/, "").trim();
    const at = text.indexOf("PB_CATALOG");
    const eq = at > -1 ? text.indexOf("=", at) : -1;
    const json = (eq > -1 ? text.slice(eq + 1) : text).trim().replace(/;\s*$/, "");
    try {
      const data = JSON.parse(json);
      const cards = Array.isArray(data.cards) ? data.cards.length : 0;
      console.log("etiuda: catalog read from " + file + ", " + cards + " cards");
      return json;
    } catch (e) {
      console.error("etiuda: " + file + " did not parse as a catalog - " + e.message);
    }
  }
  console.log("etiuda: no catalog found, so Etiuda starts as a clean slate");
  return null;
}

/* The preload asks for this before the first page script runs, so the handler is registered at
   load time rather than after the app is ready. */
let catalogJson;
ipcMain.on("etiuda:catalog", (e) => {
  if (catalogJson === undefined) catalogJson = readCatalog();
  e.returnValue = catalogJson;
});

function openExternally(url) {
  try {
    if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url);
  } catch { /* not a URL this shell can open, and the navigation is refused either way */ }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 880,
    show: false,
    backgroundColor: "#00000000",
    /* Spec section 10: the shell picks the material and the engine leaves the band's pixels
       transparent when told to. The 1.x engine paints its band opaque, so this shows nowhere
       yet; it is here so the window is the one the spec describes rather than another one. */
    backgroundMaterial: "acrylic",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  /* The engine carries links to the open internet. Following one inside the window would
     replace the app with a web page and leave no way back to it. */
  win.webContents.setWindowOpenHandler(({ url }) => { openExternally(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => {
    if (url !== win.webContents.getURL()) { e.preventDefault(); openExternally(url); }
  });

  win.loadFile(ENGINE);
}

app.whenReady().then(createWindow);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
