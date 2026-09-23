/* Every leg in the harness has an id, and no two legs share one.
 *
 *   node tests/leg-ids.js              the harness as it stands
 *   node tests/leg-ids.js <file>...    those files only, which is how the control is run
 *
 * WHY THIS EXISTS. A driver prints one line per check and each line opens with a short id - 1c,
 * 2q10, 5f - and those ids are how a finding is named in a report, in the board and in a brief.
 * On 2026-09-17 tests/shell-smoke.js had three ids used twice over (2t, 2v, 2w), each naming two
 * legs in different sections of the same file, so "5f is flaky" was a sentence that could be
 * written about a leg and land on another. Nothing in the harness looked, because nothing had
 * ever been asked to: an id is a label, and no gate reads labels.
 *
 * HOW AN ID IS COUNTED, since a count without its method is an impression. A line whose first
 * non-space content is a string literal - optionally opened by a `+`, which is how a message
 * continued from the line above starts - and whose literal begins with digits, then letters,
 * then optional digits, then a space. That is the shape every driver here writes its ids in and
 * it is anchored at the start of the line, so a rectangle quoted mid-sentence ("1280x880 in a
 * window of") is not an id. The match is CASE SENSITIVE on purpose: this harness names a leg's
 * control with the same id in capitals (1c and its control 1C), and folding case would report
 * that convention as a collision.
 *
 * LIVENESS. A scan that matches nothing passes, and a regex that drifts matches nothing, so the
 * run refuses unless it finds at least FLOOR ids over at least FILES files. The census is
 * printed whether or not anything is wrong, so a drift shows up as a number that fell rather
 * than as a green.
 *
 * Exit code is the number of ids used more than once, or 78 where the scan produced no verdict.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");

const ID = /^\s*(?:\+\s*)?["']([0-9]+[A-Za-z]+[0-9]*) /;
const FLOOR = 100;      /* 129 on 2026-09-17 over three files; a floor, not the number */
const FILES = 3;

function scan(file) {
  const ids = new Map();
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
    const m = line.match(ID);
    if (!m) return;
    if (!ids.has(m[1])) ids.set(m[1], []);
    ids.get(m[1]).push(i + 1);
  });
  return ids;
}

function harnessFiles() {
  const out = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(js|mjs)$/.test(e.name)) out.push(f);
    }
  };
  for (const d of ["tests", "tools"]) walk(path.join(E.ROOT, d));
  return out;
}

const given = process.argv.slice(2);
const files = given.length ? given : harnessFiles();
let ids = 0, withIds = 0, dups = 0;

for (const f of files) {
  const found = scan(f);
  if (!found.size) continue;
  withIds++;
  ids += found.size;
  const repeated = [...found.entries()].filter(([, lines]) => lines.length > 1);
  const rel = path.relative(E.ROOT, path.resolve(f)).split(path.sep).join("/");
  console.log("  " + (repeated.length ? "FAIL " : "ok   ") + rel + ": " + found.size
              + " id(s)" + (repeated.length ? ", " + repeated.length + " used twice or more: "
                + repeated.map(([id, lines]) => id + " at line " + lines.join(" and ")).join("; ") : ""));
  dups += repeated.length;
}

/* Only where the whole harness was scanned: a control names its own file and is one file with a
   handful of ids by construction. */
if (!given.length && (ids < FLOOR || withIds < FILES)) {
  E.refuse("the id scan found " + ids + " id(s) over " + withIds + " file(s), under its floor of "
           + FLOOR + " over " + FILES,
           "the pattern this gate reads ids with has stopped matching what the drivers write");
}
/* Board item 442, for tools/gate-run.mjs, and before the last line by the same convention. */
console.log("#counts ids=" + ids + " files=" + withIds + " scanned=" + files.length
            + " duplicates=" + dups);
console.log("  " + ids + " leg id(s) over " + withIds + " file(s) of " + files.length
            + " scanned, " + dups + " used more than once");
/* CAPPED AT 63, ballot 4 of the fourth meeting (2026-09-23): an exit code is read modulo 256 by
   bash and by Linux, so a count used as one read 256 failures as success. 63 keeps a small count
   readable and stays below 78, which is NO VERDICT here. */
process.exitCode = Math.min(dups, 63);
