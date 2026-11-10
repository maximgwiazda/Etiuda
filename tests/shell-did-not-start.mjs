/* A shell that does not start is a red line and exit 1. The wall stays exit 78.
   No Electron: the stand-in is node, already exited, and the wall is the guard's own refusal. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const E = require("./engine.js");

let failed = 0;
function check(cond, line) {
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stderr.write("  FAIL " + line + "\n"); }
}

const dieSrc = "require(" + JSON.stringify(path.join(HERE, "engine.js")) + ").shellDidNotStart(\"port closed\\nsecond line\");\n";
const die = spawnSync(process.execPath, ["-e", dieSrc], { encoding: "utf8" });
const dieLines = String(die.stdout || "").split(/\r?\n/).filter(Boolean);
check(die.status === 1 && dieLines.length === 1 && dieLines[0] === "SHELL DID NOT START: port closed second line",
  "a shell that does not start exits 1 with one line: exit " + die.status + " " + JSON.stringify(dieLines));

const refused = E.shellLaunchRefusal("tests/shell-did-not-start.mjs", [], {});
check(Array.isArray(refused) && refused.length > 0 && refused.join("\n").indexOf("SHELL DID NOT START") < 0,
  "a launch with no user-data folder is the guard's refusal, not a start failure");

const wallDir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-shell-start-"));
const wallFile = path.join(wallDir, "wall.mjs");
fs.writeFileSync(wallFile, [
  "import { createRequire } from 'node:module';",
  "const require = createRequire(import.meta.url);",
  "const E = require(" + JSON.stringify(path.join(HERE, "engine.js")) + ");",
  "const wall = E['window' + 'Wall'];",
  "wall('tests/shell-did-not-start.mjs');",
  "",
].join("\n"));
const wallEnv = Object.assign({}, process.env);
delete wallEnv.ETIUDA_WINDOWS;
const wall = spawnSync(process.execPath, [wallFile], { encoding: "utf8", env: wallEnv });
const wallOut = String(wall.stdout || "") + String(wall.stderr || "");
check(wall.status === 78 && wallOut.indexOf("SHELL DID NOT START") < 0 && wallOut.indexOf("SUITE DID NOT COMPLETE") >= 0,
  "the window wall still exits 78 and does not say the shell failed to start: exit " + wall.status);

const deadFile = path.join(wallDir, "dead.mjs");
fs.writeFileSync(deadFile, [
  "import { createRequire } from 'node:module';",
  "import { spawn } from 'node:child_process';",
  "const require = createRequire(import.meta.url);",
  "const E = require(" + JSON.stringify(path.join(HERE, "engine.js")) + ");",
  "const child = spawn(process.execPath, ['-e', 'process.exit(3)']);",
  "child.on('exit', function () {",
  "  E.connectShell({ port: 1, child: child, said: ['stand-in said boom'], waitMs: 400 });",
  "});",
  "",
].join("\n"));
const dead = spawnSync(process.execPath, [deadFile], { encoding: "utf8", timeout: 15000 });
const deadOut = String(dead.stdout || "");
check(dead.status === 1 && deadOut.indexOf("SHELL DID NOT START: the shell exited 3: stand-in said boom") >= 0,
  "a stand-in that has already exited is a start failure, exit 1, naming the exit: " + JSON.stringify(deadOut.trim()));

/* A leg shaped like the window legs: a temp folder, a shell that never answers, and a finally that
   removes the folder, prints the counts and exits 1 when the launch helper has marked the failure. */
const lab = path.join(wallDir, "lab");
fs.mkdirSync(lab);
const standFile = path.join(wallDir, "stand.mjs");
fs.writeFileSync(standFile, [
  "import { createRequire } from 'node:module';",
  "import fs from 'node:fs';",
  "const require = createRequire(import.meta.url);",
  "const E = require(" + JSON.stringify(path.join(HERE, "engine.js")) + ");",
  "const lab = process.argv[2];",
  "try {",
  "  await E.connectShell({ port: 1, said: ['stand-in never answered'], waitMs: 700, step: 200 });",
  "} finally {",
  "  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}",
  "  console.log('#counts checks=0 failed=0');",
  "  const marked = typeof E.shellStartFailed === 'function' && E.shellStartFailed();",
  "  process.exit(marked ? 1 : 78);",
  "}",
  "",
].join("\n"));
const stood = spawnSync(process.execPath, [standFile, lab], { encoding: "utf8", timeout: 20000 });
const stoodOut = String(stood.stdout || "");
const labGone = !fs.existsSync(lab);
check(stood.status === 1 && labGone && stoodOut.indexOf("#counts ") >= 0 && stoodOut.indexOf("SHELL DID NOT START:") >= 0,
  "a stand-in whose shell never answers leaves no temp folder, prints its counts and exits 1: exit "
  + stood.status + ", gone " + labGone + ", " + JSON.stringify(stoodOut.trim().slice(0, 400)));

try { fs.rmSync(wallDir, { recursive: true, force: true }); } catch (e) { /* the temp folder can wait */ }
process.stdout.write("shell-did-not-start: " + (failed ? failed + " failure(s)" : "ok") + "\n");
process.exit(failed ? 1 : 0);
