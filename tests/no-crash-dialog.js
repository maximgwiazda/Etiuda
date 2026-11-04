/* THE HARNESS MAIN PROCESS CRASH GUARD: prevents Electron from showing a native
 * error dialog when an uncaught exception occurs during test runs.
 * Loaded into Electron's main process before the application code.
 */
"use strict";

const PREFIX = "[no-crash-dialog] ";

if (!globalThis.__ETIUDA_NO_CRASH_DIALOG__) {
  globalThis.__ETIUDA_NO_CRASH_DIALOG__ = true;
  process.on("uncaughtException", (err) => {
    const text = (err && err.stack) ? err.stack : String(err);
    process.stderr.write(PREFIX + text + "\n");
    process.exit(1);
  });
}

module.exports = { PREFIX };
