/* THE CRASH GUARD LEGS: verifies that Electron crash dialogs are prevented.
 *
 *     node tests/no-crash-dialog.mjs
 *
 * Legs:
 *   1a  the guard with --require on a script that throws: stack is on stderr with prefix, exit non-zero, no lines after throw
 *   1b  a script that does not throw exits 0 and prints nothing of the guard's
 *   1c  a text leg: every electron spawn in tests/ goes through the guarded launcher or is on the named exception list; a planted spawn goes red
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cp from "node:child_process";
import { fileURLToPath } from "node:url";
import { PREFIX } from "./no-crash-dialog.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUARD_FILE = path.join(ROOT, "tests", "no-crash-dialog.js");

const EXPECTED = 3;
let asserted = 0, failed = 0;
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stdout.write("  FAIL " + line + "\n"); }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ncd-legs-"));

try {
  // 1a: the guard with --require on a script that throws
  const throwScript = path.join(tmpDir, "throws.js");
  fs.writeFileSync(throwScript, [
    'process.stderr.write("BEFORE_THROW\\n");',
    'throw new Error("crash test fault");',
    'process.stderr.write("UNREACHED_AFTER\\n");'
  ].join("\n"), "utf8");

  const r1 = cp.spawnSync(process.execPath, [
    "--require", GUARD_FILE,
    throwScript
  ], { encoding: "utf8" });

  const code1 = r1.status;
  const err1 = r1.stderr || "";
  const ok1 = code1 !== 0
    && err1.includes("BEFORE_THROW")
    && err1.includes(PREFIX)
    && err1.includes("crash test fault")
    && !err1.includes("UNREACHED_AFTER");

  check(ok1, "1a the guard with --require on a script that throws writes the stack with prefix to stderr and exits non-zero without running later lines: exit "
    + code1 + ", prefix " + err1.includes(PREFIX));

  // 1b: a script that does not throw exits 0 and prints nothing of the guard's
  const cleanScript = path.join(tmpDir, "clean.js");
  fs.writeFileSync(cleanScript, 'process.stdout.write("CLEAN_OUTPUT\\n");\n', "utf8");

  const r2 = cp.spawnSync(process.execPath, [
    "--require", GUARD_FILE,
    cleanScript
  ], { encoding: "utf8" });

  const code2 = r2.status;
  const out2 = r2.stdout || "";
  const err2 = r2.stderr || "";
  const ok2 = code2 === 0
    && out2.trim() === "CLEAN_OUTPUT"
    && !err2.includes(PREFIX)
    && err2.trim() === "";

  check(ok2, "1b a script that does not throw exits 0 and prints nothing of the guard's: exit "
    + code2 + ", stdout " + JSON.stringify(out2.trim()) + ", stderr empty " + (err2.trim() === ""));

  // 1c: text leg: every electron spawn in tests/ goes through the guarded launcher
  const EXCEPTIONS = new Set([
    // Named exceptions if any exist; currently empty because all spawns go through E.shellLaunch
  ]);

  const EXE_RE = /electronExe\(\)|Etiuda\.exe|assocExe|deskExe|ETIUDA_DESK_EXE|PRODUCT \+ "\.exe"/;
  const CALL_RE = /(?:E\.)?(shellLaunch|spawn)\(([\s\S]{0,140})/g;

  function inspectSpawns(files) {
    const sites = [];
    const unguarded = [];

    for (const { file, text } of files) {
      if (file === "engine.js" || file === "tests/engine.js") continue;
      let m;
      CALL_RE.lastIndex = 0;
      while ((m = CALL_RE.exec(text)) !== null) {
        if (EXE_RE.test(m[2])) {
          const entry = { file, via: m[1], snippet: m[0].slice(0, 60) };
          sites.push(entry);
          if (m[1] !== "shellLaunch" && !EXCEPTIONS.has(file)) {
            unguarded.push(entry);
          }
        }
      }
    }

    return { sites, unguarded };
  }

  const testsDir = path.join(ROOT, "tests");
  const realFiles = fs.readdirSync(testsDir)
    .filter(f => /\.(js|mjs|cjs)$/.test(f) && f !== "no-crash-dialog.mjs")
    .map(f => ({ file: f, text: fs.readFileSync(path.join(testsDir, f), "utf8") }));

  const realResult = inspectSpawns(realFiles);

  // Plant convention: assemble the unguarded spawn call by concatenation so this file is clean
  const plantedFile = "tests/plant-unguarded.js";
  const plantedText = "const child = cp." + "sp" + "awn(" + "electron" + "Exe(), ['--user-data-dir=test']);";
  const plantedResult = inspectSpawns([{ file: plantedFile, text: plantedText }]);

  const ok3 = realResult.unguarded.length === 0
    && realResult.sites.length >= 10
    && plantedResult.unguarded.length === 1
    && plantedResult.unguarded[0].file === plantedFile;

  check(ok3, "1c every electron spawn in tests/ goes through the guarded launcher ("
    + realResult.sites.length + " sites, " + realResult.unguarded.length + " unguarded), and a planted spawn goes red ("
    + plantedResult.unguarded.length + " found)");

} finally {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore cleanup error */ }
}

process.stdout.write("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED + "\n");
process.stdout.write(failed ? "RESULT: FAIL " + failed + " failed\n" : "RESULT: ok " + asserted + " check(s)\n");
process.exit(failed ? 1 : 0);
