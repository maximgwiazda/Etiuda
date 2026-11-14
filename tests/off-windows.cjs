/* WHETHER A WINDOWS-ONLY ASSERTION STANDS ASIDE HERE, and the line its leg prints when it does.
 *
 *     const { offWindows } = require("./off-windows.cjs");
 *     const aside = offWindows("998e", "rename over a read-only file succeeds off Windows, so the plant has no teeth");
 *     if (aside) skip(aside); else check(...);
 *
 * The platform alone decides: no variable and no argument moves it. A decision to stand aside on Windows throws, so a leg
 * that uses this can go red there and never quiet; tests/off-windows-selftest.cjs lifts plant:off-windows to prove it.
 */
"use strict";
const os = require("node:os");

/** null where the assertion runs; off Windows, "<id> stands aside off Windows: <reason>". */
function offWindows(id, reason) {
  const aside = process.platform !== "win32"; /* plant:off-windows */
  /* os.type() is the kernel's answer, so a leg that has faked process.platform for a stretch is caught here too. */
  if (aside && (process.platform === "win32" || os.type() === "Windows_NT")) {
    throw new Error("off-windows: " + id + " was asked to stand aside on Windows, which no leg may do");
  }
  return aside ? id + " stands aside off Windows: " + reason : null;
}

module.exports = { offWindows };
