/* shell/folder/syncer-worker.cjs - Worker thread entry for folder syncer.
 * Runs off the main Electron thread to ensure slow/hung SMB or remote shares
 * never block the main Electron UI event loop.
 *
 * Board 945 stage 3 (b) slice 1, design read D2 & D4:
 * The worker only stages files into the mirror's .staging directory.
 * No cryptographic keys or check functions are sent to or run in the worker.
 * Checks happen exclusively on the main thread on the local staged bytes.
 *
 * Started from its source text (syncer.cjs, { eval: true }), so a packaged desk does not need a Worker's loader to read a
 * path inside app.asar. That holds only while this file requires nothing but Node's own modules ("node:" names) and never
 * uses __dirname, __filename or a relative require: tests/pick.mjs 5h refuses any of those here.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { parentPort } = require("node:worker_threads");
/* syncer.cjs's own functions, put in front of this source when the worker starts (syncer.cjs, start), never required by path. */
const S = __syncerLib; // eslint-disable-line no-undef

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
const heldStamps = new Map();     // relPath -> { size, mtimeMs } the main thread refused or parked, not copied again while it stays
const sentNow = new Map();         // relPath -> the sha (or "del") this worker wrote, until the outbox stops owing it
const casHeld = new Map();         // ask id -> the lock a compare and swap holds
const CAS_HOLD_MS = 20000;

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

/* The outbox first, read from the mirror at each listing, so a listing taken after it shows what landed. A record written
   here is not written again while the main thread has yet to clear it. Answers the paths still owed. */
function flushOutbox() {
  const owed = S.owedList(mirror);
  const rels = new Set(owed.map(it => it.rel));
  for (const rel of Array.from(sentNow.keys())) if (!rels.has(rel)) sentNow.delete(rel);
  const due = owed.filter(it => sentNow.get(it.rel) !== (it.del ? "del" : it.sha));
  if (due.length) {
    const results = S.flushOwed(folder, mirror, due, null);
    for (const r of results) {
      if (!r.ok) continue;
      sentNow.set(r.rel, r.del ? "del" : r.sha);
      if (!r.del && r.size != null) knownMtimes.set(r.rel, { size: r.size, mtimeMs: r.mtimeMs });
    }
    if (parentPort && !stopped) parentPort.postMessage({ type: "landed", folder, results });
  }
  return rels;
}

function syncOnce() {
  if (inFlight || stopped) return;
  inFlight = true;
  try {
    let owedRels = new Set();
    try { owedRels = flushOutbox(); } catch {}
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
      if (owedRels.has(relPath)) continue;
      const hold = heldStamps.get(relPath);
      if (hold && hold.size === st.size && hold.mtimeMs === st.mtimeMs) continue; /* plant:worker-held */
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
    } else if (msg.type === "held") {
      for (const rel of msg.forget || []) knownMtimes.delete(rel);
      heldStamps.clear();
      for (const h of msg.held || []) if (h && h.rel) heldStamps.set(h.rel, { size: h.size, mtimeMs: h.mtimeMs });
    } else if (msg.type === "kick") {
      if (!stopped) { try { syncOnce(); } catch {} }
    } else if (msg.type === "read") {
      let got = null;
      try { got = S.shareReadFile(folder, msg.name); } catch { got = null; }
      parentPort.postMessage({ type: "read", id: msg.id, got });
    } else if (msg.type === "cas") {
      let begun = null;
      try { begun = S.shareCasBegin(folder, msg.name, msg.sha, msg.create === true); } catch { begun = null; }
      if (begun && begun.held) {
        const held = begun.held;
        held.timer = setTimeout(() => { if (casHeld.get(msg.id) === held) { casHeld.delete(msg.id); S.shareRelease(held); } }, CAS_HOLD_MS);
        casHeld.set(msg.id, held);
        parentPort.postMessage({ type: "cas", id: msg.id, held: true, now: begun.now });
      } else {
        parentPort.postMessage({ type: "cas", id: msg.id, done: true, result: (begun && begun.result) || { ok: false, busy: true } });
      }
    } else if (msg.type === "cas-commit") {
      const held = casHeld.get(msg.id);
      casHeld.delete(msg.id);
      if (held) clearTimeout(held.timer);
      const result = held ? S.shareCasCommit(held, mirror, String(msg.text || "")) : { ok: false, changed: true };
      if (held && result.ok && result.size != null) knownMtimes.set(held.base, { size: result.size, mtimeMs: result.mtimeMs });
      parentPort.postMessage({ type: "cas", id: msg.id, done: true, result });
    } else if (msg.type === "cas-abort") {
      const held = casHeld.get(msg.id);
      casHeld.delete(msg.id);
      if (held) { clearTimeout(held.timer); S.shareRelease(held); }
    } else if (msg.type === "stop") {
      stopped = true;
      for (const held of casHeld.values()) { clearTimeout(held.timer); S.shareRelease(held); }
      casHeld.clear();
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
