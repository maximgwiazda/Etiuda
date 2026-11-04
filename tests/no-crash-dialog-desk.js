/* THE WINDOW CRASH GUARD LEG: an uncaught exception in the unpackaged Electron main process
 * never raises a native crash dialog on screen.
 *
 *     node tests/no-crash-dialog-desk.js
 */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const E = require("./engine.js");

const WHO = "tests/no-crash-dialog-desk.js";
E.windowWall(WHO);

const PREFIX = "[no-crash-dialog] ";

function electronExe() {
  const dir = path.join(E.ROOT, "node_modules", "electron");
  return path.join(dir, "dist", fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim());
}

async function main() {
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-crash-dialog-"));
  const ud = path.join(lab, "user-data");
  const docs = path.join(lab, "documents");
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(docs, { recursive: true });
  E.pinCatalogFolder(ud, docs);

  const appDir = path.join(lab, "app");
  fs.mkdirSync(path.join(appDir, "shell"), { recursive: true });
  fs.writeFileSync(path.join(appDir, "package.json"), JSON.stringify({
    name: "crash-dialog-test-app",
    version: "0.0.0",
    main: "shell/main.js"
  }), "utf8");
  fs.writeFileSync(path.join(appDir, "shell", "main.js"), [
    '"use strict";',
    'throw new Error("Deliberate load error in lab main.js");'
  ].join("\n"), "utf8");

  let stderr = "";
  let stdout = "";
  let exitCode = null;

  try {
    const child = E.shellLaunch(WHO, electronExe(), [appDir, "--user-data-dir=" + ud], {
      stdio: ["ignore", "pipe", "pipe"],
      env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: docs })
    });

    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });

    exitCode = await new Promise((resolve) => {
      child.on("exit", code => resolve(code));
    });

    const hasPrefix = stderr.includes(PREFIX);
    const hasError = stderr.includes("Deliberate load error in lab main.js");
    const nonZero = exitCode !== 0 && exitCode !== null;

    if (nonZero && hasPrefix && hasError) {
      console.log("  ok   1a lab shell whose main.js throws at load exited non-zero with prefix on stderr: exit " + exitCode);
      process.exit(0);
    } else {
      console.error("  FAIL 1a lab shell did not exit as expected: exit=" + exitCode + ", prefix=" + hasPrefix + ", stderr=" + stderr);
      process.exit(1);
    }
  } finally {
    try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) { /* ignore cleanup error */ }
  }
}

main();
