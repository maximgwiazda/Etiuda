/* shell/folder/syncer-worker.cjs - Worker thread entry for folder syncer.
 * Runs off the main Electron thread to ensure slow/hung SMB or remote shares
 * never block the main Electron UI event loop.
 * Board 945 stage 3 (b), slice 1.
 */
"use strict";

const { parentPort } = require("node:worker_threads");
const { createFolderProgram } = require("./syncer.cjs");

let program = null;
let pollTimer = null;
let stopped = false;

function init(data) {
  const { team, folder, mirror, pin, keys, pollMs } = data;
  program = createFolderProgram({
    team, folder, mirror, pin, keys,
    onStatus: (status) => {
      if (!stopped && parentPort) parentPort.postMessage({ type: "status", ...status });
    },
    onChange: (change) => {
      if (!stopped && parentPort) parentPort.postMessage({ type: "change", ...change });
    }
  });

  const pollInterval = pollMs || 1000;
  async function loop() {
    if (stopped) return;
    try {
      await program.syncOnce();
    } catch {}
    if (!stopped) {
      pollTimer = setTimeout(loop, pollInterval);
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
      if (program && !stopped) { try { program.syncOnce(); } catch {} }
    } else if (msg.type === "stop") {
      stopped = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (parentPort) parentPort.postMessage({ type: "stopped" });
    } else if (msg.type === "updateKeys") {
      if (program) program.updateKeys(msg.keys);
    }
  });
}
