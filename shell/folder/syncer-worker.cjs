/* shell/folder/syncer-worker.cjs - Worker thread entry for folder syncer.
 * Runs off the main Electron thread to ensure slow/hung SMB or remote shares
 * never block the main Electron UI event loop.
 *
 * Board 945 stage 3 (b) slice 1, design read D2 & D4:
 * The worker only stages files into the mirror's .staging directory.
 * No cryptographic keys or check functions are sent to or run in the worker.
 * Checks happen exclusively on the main thread on the local staged bytes.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { parentPort } = require("node:worker_threads");

/* Cadence: worker lists the shared folder every FOLDER_SYNC_CADENCE_MS (3000ms by default).
 * A folder watch event asks for a listing early via kick().
 * Both the two-equal-listings rule and two-listing removal scale with this cadence. */
const FOLDER_SYNC_CADENCE_MS = 3000;

let folder = "";
let mirror = "";
let pollTimer = null;
let pollMs = FOLDER_SYNC_CADENCE_MS;
let stopped = false;
let inFlight = false;

function walkFolder(baseDir, sub = "") {
  const out = new Map();
  const current = path.join(baseDir, sub);
  let entries = [];
  if (sub === "") {
    entries = fs.readdirSync(current);
  } else {
    try {
      entries = fs.readdirSync(current);
    } catch {
      return out;
    }
  }
  for (const name of entries) {
    if (name.startsWith(".") || name.endsWith(".tmp")) continue;
    const rel = sub ? path.join(sub, name).replace(/\\/g, "/") : name;
    const full = path.join(baseDir, rel);
    let st = null;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory && st.isDirectory()) {
      if (sub === "" && (name === "desks" || name === "invites" || name === "catalog-asks")) {
        const inner = walkFolder(baseDir, name);
        for (const [k, v] of inner.entries()) out.set(k, v);
      } else if (sub === "desks") {
        const inner = walkFolder(baseDir, path.join(sub, name));
        for (const [k, v] of inner.entries()) out.set(k, v);
      }
    } else {
      out.set(rel, { size: st.size, mtimeMs: st.mtimeMs || 0 });
    }
  }
  return out;
}

function syncOnce() {
  if (inFlight || stopped) return;
  inFlight = true;
  try {
    let foundFiles = null;
    try {
      foundFiles = walkFolder(folder);
      if (!fs.existsSync(folder)) throw new Error("folder not found");
      if (parentPort) parentPort.postMessage({ type: "status", folder, answers: true });
    } catch (e) {
      if (parentPort) parentPort.postMessage({ type: "status", folder, answers: false });
      return;
    }

    const stagingDir = path.join(mirror, ".staging");
    try { fs.mkdirSync(stagingDir, { recursive: true }); } catch {}

    const staged = [];
    for (const [relPath, st] of foundFiles.entries()) {
      const mirrorFile = path.join(mirror, relPath);
      let alreadyInMirror = false;
      try {
        if (fs.existsSync(mirrorFile)) {
          const srcData = fs.readFileSync(path.join(folder, relPath));
          const dstData = fs.readFileSync(mirrorFile);
          if (Buffer.compare(srcData, dstData) === 0) {
            alreadyInMirror = true;
          }
        }
      } catch {}

      if (!alreadyInMirror) {
        const srcFile = path.join(folder, relPath);
        const rand = crypto.randomBytes(8).toString("hex");
        const tmpFile = path.join(stagingDir, rand + ".tmp");
        try {
          fs.copyFileSync(srcFile, tmpFile);
          staged.push({ relPath, tmpPath: tmpFile, size: st.size, mtimeMs: st.mtimeMs });
        } catch {
          try { fs.unlinkSync(tmpFile); } catch {}
        }
      }
    }

    if (parentPort && !stopped) {
      parentPort.postMessage({
        type: "scan",
        folder,
        answers: true,
        listing: Array.from(foundFiles.entries()),
        staged
      });
    }
  } finally {
    inFlight = false;
  }
}

function init(data) {
  folder = data.folder;
  mirror = data.mirror;
  pollMs = data.pollMs || FOLDER_SYNC_CADENCE_MS;

  function loop() {
    if (stopped) return;
    try {
      syncOnce();
    } catch {}
    if (!stopped) {
      pollTimer = setTimeout(loop, pollMs);
      if (pollTimer && pollTimer.unref) pollTimer.unref();
    }
  }
  loop();
}

if (parentPort) {
  parentPort.on("message", (msg) => {
    if (!msg) return;
    if (msg.type === "init") {
      init(msg.data);
    } else if (msg.type === "kick") {
      if (!stopped) { try { syncOnce(); } catch {} }
    } else if (msg.type === "stop") {
      stopped = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (parentPort) parentPort.postMessage({ type: "stopped" });
    }
  });
}
