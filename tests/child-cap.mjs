/* THE CHILD-CAP LEG: a new test file starts at most five child processes (regimen rule 11).
 *
 * Checks that tools/child-cap.mjs statically counts child process call sites correctly,
 * enforces the cap of five, and ignores comments and regex exec calls.
 *
 *     node tests/child-cap.mjs
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { countChildren, checkFiles, SHARED_HELPERS } from "../tools/child-cap.mjs";

const EXPECTED = 5;

let asserted = 0, failed = 0;
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stdout.write("  FAIL " + line + "\n"); }
}

// cc1: six spawning calls in one source count 6 and checkFiles goes red with the count and the names in the line
const f1 = [
  "const cp = require('node:child_process');",
  "cp." + "sp" + "awn('node', ['a.js']);",
  "cp." + "spawn" + "Sync('node', ['b.js']);",
  "cp." + "exec" + "File('node', ['c.js']);",
  "cp." + "exec" + "FileSync('node', ['d.js']);",
  "cp." + "fo" + "rk('e.js');",
  "cp." + "exec" + "Sync('f.js');",
].join("\n");
const count1 = countChildren(f1);
const res1 = checkFiles([{ file: "tests/plant-six.mjs", source: f1 }]);
const namesFound = [
  "cp." + "sp" + "awn",
  "cp." + "spawn" + "Sync",
  "cp." + "exec" + "File",
  "cp." + "exec" + "FileSync",
  "cp." + "fo" + "rk",
  "cp." + "exec" + "Sync",
];
const hasNames = namesFound.every(name => (res1.lines[0] || "").includes(name));
check(count1 === 6 && !res1.ok && (res1.lines[0] || "").includes("FAIL")
  && (res1.lines[0] || "").includes("starts 6 child processes")
  && (res1.lines[0] || "").includes("over the cap of 5")
  && hasNames,
  "cc1 six spawning calls count 6 and checkFiles goes red with the count and the names in the line: "
  + (res1.lines[0] || ""));

// cc2: five count 5 and stay green
const f2 = [
  "const cp = require('node:child_process');",
  "cp." + "sp" + "awn('node', ['a.js']);",
  "cp." + "spawn" + "Sync('node', ['b.js']);",
  "cp." + "exec" + "File('node', ['c.js']);",
  "cp." + "exec" + "FileSync('node', ['d.js']);",
  "cp." + "fo" + "rk('e.js');",
].join("\n");
const count2 = countChildren(f2);
const res2 = checkFiles([{ file: "tests/plant-five.mjs", source: f2 }]);
check(count2 === 5 && res2.ok
  && (res2.lines[0] || "").includes("ok")
  && (res2.lines[0] || "").includes("starts 5 child process(es)"),
  "cc2 five count 5 and stay green: " + (res2.lines[0] || ""));

// cc3: a comment line and a block comment holding spawnSync( count nothing, and a regular expression's .exec( counts nothing
const f3 = [
  "// cp." + "spawn" + "Sync('comment-line');",
  "/* cp." + "spawn" + "Sync('single-line-block'); */",
  "/*",
  " * cp." + "spawn" + "Sync('multi-line-block');",
  " */",
  "const re1 = /^hello/;" + "re1." + "ex" + "ec('hello world');",
  "/^test/." + "ex" + "ec('testing');",
].join("\n");
const count3 = countChildren(f3);
const res3 = checkFiles([{ file: "tests/plant-comments.mjs", source: f3 }]);
check(count3 === 0 && res3.ok && (res3.lines[0] || "").includes("starts 0 child process(es)"),
  "cc3 a comment line and a block comment holding " + "spawn" + "Sync count nothing, and a regular expression's " + ".ex" + "ec counts nothing: count=" + count3);

// cc4: a headless browser launch counts one, and a shared helper from the constant counts one
const helperName = (SHARED_HELPERS && SHARED_HELPERS[0]) || ("shell" + "Launch");
const f4Browser = "const browser = await puppeteer." + "la" + "unch({ headless: true });";
const f4Helper = "const child = E." + helperName + "('who', 'exe');";
const f4Both = [f4Browser, f4Helper].join("\n");
const count4Browser = countChildren(f4Browser);
const count4Helper = countChildren(f4Helper);
const count4Both = countChildren(f4Both);
check(count4Browser === 1 && count4Helper === 1 && count4Both === 2,
  "cc4 a headless browser launch counts one (" + count4Browser + "), and a shared helper from the constant counts one (" + count4Helper + ")");

// cc5: this test file itself, read from disk, counts at most 5 (it should count 0)
const selfSource = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");
const count5 = countChildren(selfSource);
check(count5 <= 5 && count5 === 0,
  "cc5 this test file itself, read from disk, counts at most 5 (it should count 0): " + count5);

process.stdout.write("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED + "\n");
process.stdout.write(failed ? "RESULT: FAIL " + failed + " failed\n" : "RESULT: ok " + asserted + " check(s)\n");
process.exit(failed ? 1 : 0);
