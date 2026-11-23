"use strict";
/* THE INSTALL'S OWN LIST, etiuda-files.ini at the root of the program's folder: every file the package holds with its size in
   bytes, every folder that holds one, and the files in order with their count last. Written by electron-builder.js once the
   folder is signed, so the sizes are the ones the installer extracts. shell/installer.nsh reads it three ways: the stage is whole
   only when every listed file is there at its size (etiudaStageWhole); an update moves back into the folder whatever the older
   copy's list does not name (etiudaListWalk, "keep"); and a copy set aside loses only what its list names ("drop"), as the
   desk's first start does (shell/main.js setAsideDrop). Not shipped in the asar: the build and the legs require it. */
const fs = require("node:fs");
const path = require("node:path");

const NAME = "etiuda-files.ini";

/* A name Windows' INI reader keeps whole as a key: printable ASCII, no "=", no leading "[" or ";", no space at either end. */
const KEY_SAFE = /^[\x21-\x3a\x3c\x3e-\x5a\x5c-\x7e](?:[\x20-\x3c\x3e-\x7e]*[\x21-\x3c\x3e-\x7e])?$/;

/* The folder's files, as Windows-relative names with their sizes, the list itself left out. A link, a name the INI reader would
   cut, or a file of 2 GiB or more (beyond what NSIS's FileSeek reports) refuses the build rather than a whole tree pass unseen. */
function listTree(root) {
  const out = [];
  const walk = rel => {
    for (const name of fs.readdirSync(path.join(root, rel)).sort()) {
      const r = rel ? rel + "\\" + name : name;
      if (!KEY_SAFE.test(r)) throw new Error(NAME + ": a name the installer cannot list: " + JSON.stringify(r));
      const st = fs.lstatSync(path.join(root, r));
      if (st.isSymbolicLink()) throw new Error(NAME + ": a link in the package: " + r);
      if (st.isDirectory()) walk(r);
      else if (r !== NAME) {
        if (st.size >= 2 ** 31) throw new Error(NAME + ": " + r + " is 2 GiB or more");
        out.push({ rel: r, size: st.size });
      }
    }
  };
  walk("");
  return out;
}

function manifestText(entries) {
  const dirs = new Set();
  for (const { rel } of entries) {
    const parts = rel.split("\\");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("\\"));
  }
  const lines = ["[files]", ...entries.map(e => e.rel + "=" + e.size), "[dirs]", ...[...dirs].sort().map(d => d + "=1"),
    "[list]", ...entries.map((e, i) => i + "=" + e.rel), "[end]", "count=" + entries.length, ""];
  return lines.join("\r\n");
}

function writeManifest(root) {
  const entries = listTree(root);
  if (!entries.length) throw new Error(NAME + ": the package at " + root + " holds no file");
  fs.writeFileSync(path.join(root, NAME), manifestText(entries));
  return entries.length;
}

/* The INI as Windows' reader sees it: sections and keys case-insensitive, the first of a repeated key kept. */
function parseManifest(text) {
  const out = {};
  let sect = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    const head = /^\[([^\]]*)\]$/.exec(line);
    if (head) { sect = head[1].toLowerCase(); out[sect] = out[sect] || new Map(); continue; }
    const eq = line.indexOf("=");
    if (!sect || eq < 1) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    if (!out[sect].has(key)) out[sect].set(key, line.slice(eq + 1).trim());
  }
  return out;
}

/* THE STAGE IS WHOLE, the model of etiudaStageWhole: the count is read, each numbered entry names a listed file, and that file
   is there at its size. sizeOf(rel) answers a number, or null where nothing can be opened. Problems are returned, none is whole. */
function stageProblems(text, sizeOf) {
  const m = parseManifest(text);
  const files = m.files || new Map(), list = m.list || new Map();
  const count = Number((m.end && m.end.get("count")) || "");
  if (!Number.isInteger(count) || count < 1) return ["no count: the list is missing or cut short"];
  const problems = [];
  for (let i = 0; i < count; i++) {
    const rel = list.get(String(i));
    if (!rel) { problems.push("entry " + i + " is missing"); break; }
    const want = files.get(rel.toLowerCase());
    if (want === undefined) { problems.push(rel + " has no size"); continue; }
    const got = sizeOf(rel);
    if (got === null || got === undefined) problems.push(rel + " is missing");
    else if (String(got) !== want) problems.push(rel + " is " + got + " bytes, listed " + want);
  }
  return problems;
}

module.exports = { NAME, KEY_SAFE, listTree, manifestText, writeManifest, parseManifest, stageProblems };
