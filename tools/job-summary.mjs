/* What a run on a machine that is not this desk did NOT check, written into the job summary.
 *
 *   node tools/job-summary.mjs test.log        the markdown, on stdout
 *
 * WHY IT IS A FILE AND NOT FOUR LINES OF YAML. Board item 629 gives .github/workflows/gates.yml a
 * second job on ubuntu-latest, and the danger in two harnesses is never the gate that fails on
 * Linux - that one is loud - but the reader who takes a green Linux run for a green run. The
 * answer to that reader is the notice tests/engine.js prints off Windows, and a notice is only a
 * guard while it actually arrives. Four lines of YAML that grep for it cannot be run anywhere but
 * on the runner, so they would be a check nobody had ever seen refuse. This can be driven on the
 * desk against a log with the notice, a log without it and a log that stops early, and it was,
 * before it was committed.
 *
 * WHAT IT REFUSES, and each of the three is a way a green job could mean nothing:
 *   - no log at all: the suite never wrote one, so `npm test 2>&1 | tee test.log` has been
 *     changed or never ran. The job is red at that step too and this is the second red; a second
 *     red naming the right cause is cheaper than a summary that says "did not reach" and exits 0.
 *   - a log with no RESULT line: the chain stopped before tests/test.js gave its verdict.
 *   - off Windows, a log whose notice is absent, or whose header says a number of things that
 *     is not the number of lines under it, or not the number tests/engine.js holds.
 *
 * WHAT THE LAST COMPARISON IS AND IS NOT. The header's number is read out of the log and the
 * expected number out of NOT_PROVED_OFF_WINDOWS, so what is guarded is the CHANNEL - the notice
 * reaching the summary intact - and not the contents of the list, which is the harness's to
 * shorten or lengthen as the two harnesses move. A frozen literal here would refuse the day
 * somebody legitimately added a thing, which is how a guard gets deleted.
 *
 * ON WINDOWS it asserts the mirror: no notice, because the list is what a WINDOWS run proves and
 * a Windows log carrying it would mean the platform test itself is wrong. That arm is why this
 * file runs in both jobs rather than only in the new one.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const E = require(path.join(ROOT, "tests", "engine.js"));

const out = [];
const say = l => out.push(l);
const fails = [];

const file = process.argv[2];
if (!file) {
  console.error("  FAIL no log named: node tools/job-summary.mjs <log>");
  process.exit(1);
}

let log = null;
try { log = fs.readFileSync(file, "utf8"); } catch (e) { log = null; }
const lines = log === null ? [] : log.split(/\r?\n/);

say("### What this run did not check");
if (log === null) {
  say("- there is no " + file + ", so the suite wrote no log and nothing below could be read");
  fails.push("no log at " + file);
} else {
  const notRun = lines.filter(l => l.indexOf("NOT RUN") > -1);
  if (notRun.length) notRun.forEach(l => say("- " + l.trim()));
  else say("- nothing said NOT RUN, which on a runner with no fixtures would be a surprise");
  if (!lines.some(l => /^RESULT: /.test(l))) {
    say("- and there is no RESULT line, so the chain stopped before tests/test.js gave a verdict");
    fails.push("no RESULT line in " + file);
  }
}

/* The notice, on the platform that must carry it and on the one that must not. */
const HEAD = /NOT WINDOWS \(([a-z0-9]+)\), so whatever this run says, it did not look at (\d+) things:/;
const at = lines.findIndex(l => HEAD.test(l));
const want = E.NOT_PROVED_OFF_WINDOWS.length;

if (process.platform !== "win32") {
  say("");
  say("### What a run off Windows cannot prove");
  if (at < 0) {
    say("- the notice is not in " + file + ", so this green says nothing about what it skipped");
    fails.push("no NOT WINDOWS notice in " + file + ", and this run is on " + process.platform);
  } else {
    const said = Number(HEAD.exec(lines[at])[2]);
    const items = [];
    for (let i = at + 1; i < lines.length && /^\s+- \S/.test(lines[i]); i++) items.push(lines[i].trim());
    say("- " + lines[at].trim());
    items.forEach(l => say("  " + l));
    if (said !== items.length)
      fails.push("the notice says " + said + " things and " + items.length + " line(s) follow it");
    if (said !== want)
      fails.push("the notice says " + said + " things and tests/engine.js holds " + want);
  }
} else if (at > -1) {
  fails.push("this run is on win32 and its log carries the off-Windows notice, which means the"
    + " platform the notice reports is not the platform the run was on");
}

console.log(out.join("\n"));
if (fails.length) {
  fails.forEach(f => console.error("  FAIL " + f));
  console.error("  the job summary is how a green run says what it did not look at, board item 629");
  process.exit(1);
}
