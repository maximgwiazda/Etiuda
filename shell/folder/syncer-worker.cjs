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
let folderWatcher = null;
let kickDebounce = null;
const knownMtimes = new Map(); // relPath -> { size, mtimeMs }

function isAllowedPath(rel) {
  const norm = String(rel || "").replace(/\\/g, "/");
  const parts = norm.split("/");
  if (parts.length === 1) {
    if (norm.endsWith(".ec")) return true;
    if (/^etiuda-team.*\.json$/i.test(norm)) return true;
    if (/^etiuda-head.*\.json$/i.test(norm)) return true;
    if (/^etiuda-ring.*\.json$/i.test(norm)) return true;
    if (/^etiuda-team-joins.*\.json$/i.test(norm)) return true;
    if (/^etiuda-team-pause.*\.json$/i.test(norm)) return true;
    if (/^stats-span.*\.json$/i.test(norm)) return true;
    return false;
  }
  if (parts[0] === "invites" && parts.length === 2) {
    return parts[1].endsWith(".wrap.json") || parts[1].endsWith(".refused.json");
  }
  if (parts[0] === "catalog-asks" && parts.length === 2) {
    return parts[1].endsWith(".json");
  }
  if (parts[0] === "desks" && parts.length === 3) {
    const deskId = parts[1];
    const file = parts[2];
    if (!/^k-[0-9a-f]{16}$/.test(deskId)) return false;
    if (file.endsWith(".ec")) return true;
    if (file === "stats.estat" || file === "join.json") return true;
    return false;
  }
  return false;
}

function walkFolder(baseDir, sub = "") {
  const out = new Map();
  const current = path.join(baseDir, sub);
  let entries = [];
  try {
    entries = fs.readdirSync(current);
  } catch {
    return out;
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
      } else if (sub === "desks" && /^k-[0-9a-f]{16}$/.test(name)) {
        const inner = walkFolder(baseDir, path.join(sub, name));
        for (const [k, v] of inner.entries()) out.set(k, v);
      }
    } else {
      if (isAllowedPath(rel)) {
        out.set(rel, { size: st.size, mtimeMs: st.mtimeMs || 0 });
      }
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
      const known = knownMtimes.get(relPath);
      if (known && known.size === st.size && known.mtimeMs === st.mtimeMs && fs.existsSync(mirrorFile)) {
        alreadyInMirror = true;
      } else {
        try {
          if (fs.existsSync(mirrorFile)) {
            const dstSt = fs.statSync(mirrorFile);
            if (dstSt.size === st.size && dstSt.mtimeMs === st.mtimeMs) {
              alreadyInMirror = true;
              knownMtimes.set(relPath, { size: st.size, mtimeMs: st.mtimeMs });
            }
          }
        } catch {}
      }

      if (!alreadyInMirror) {
        const srcFile = path.join(folder, relPath);
        const rand = crypto.randomBytes(8).toString("hex");
        const tmpFile = path.join(stagingDir, rand + ".tmp");
        try {
          fs.copyFileSync(srcFile, tmpFile);
          const postSt = fs.statSync(srcFile);
          if (postSt.size !== st.size || postSt.mtimeMs !== st.mtimeMs) {
            try { fs.unlinkSync(tmpFile); } catch {}
          } else {
            knownMtimes.set(relPath, { size: postSt.size, mtimeMs: postSt.mtimeMs });
            staged.push({ relPath, tmpPath: tmpFile, size: postSt.size, mtimeMs: postSt.mtimeMs });
          }
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

  try {
    folderWatcher = fs.watch(folder, { recursive: true }, (ev, filename) => {
      if (stopped) return;
      clearTimeout(kickDebounce);
      kickDebounce = setTimeout(() => {
        if (!stopped) { try { syncOnce(); } catch {} }
      }, 200);
      if (kickDebounce && kickDebounce.unref) kickDebounce.unref();
    });
    folderWatcher.on("error", () => {
      try { folderWatcher.close(); } catch {}
      folderWatcher = null;
    });
  } catch {
    folderWatcher = null;
  }

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
      if (kickDebounce) clearTimeout(kickDebounce);
      if (folderWatcher) {
        try { folderWatcher.close(); } catch {}
        folderWatcher = null;
      }
      if (parentPort) parentPort.postMessage({ type: "stopped" });
    }
  });
}
