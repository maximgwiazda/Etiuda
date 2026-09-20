/* What a run on a machine that is not this desk did NOT check, written into the job summary.
 *
 *   node tools/job-summary.mjs test.log        the markdown into $GITHUB_STEP_SUMMARY, or, with
 *                                              that unset, on stdout, which is how it is driven
 *
 * AND IT PUTS THE RED LINES WHERE THEY CAN BE READ WITHOUT SIGNING IN, board item 427. The first
 * run on a runner was red at `npm test` on 2026-09-18 and was still red on 2026-09-20, and what
 * it said has never been read by anybody here: a run's LOG needs a GitHub session, while its
 * annotations come back from the public jobs endpoint. So every `  FAIL` line of the log is
 * echoed as an `::error::` workflow command, ten at most because that is what a step is shown,
 * with the count said out loud when there were more. WHETHER GITHUB TURNS THOSE INTO ANNOTATIONS
 * IS NOT MEASURED HERE and cannot be: this desk is not a runner, the first red run is the test,
 * and what is measured below is only that the lines are emitted, one per FAIL, capped.
 *
 * NOTHING OF THE CATALOG CAN TRAVEL THAT WAY. A clone has no catalog and the runner never sets
 * ETIUDA_FIXTURES, so sections 4 and 5 of tests/test.js stand down and no card is ever read, let
 * alone printed. The lines echoed are the harness's own wording about its own gates.
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
  /* A CHECK THAT RAN IS NOT A STAND-DOWN. This section is read as the half nobody looked at, and
     any line holding the words was landing in it - including cases 28a and 28b of
     tests/engine-selftest.js, two checks that ran and PASSED, about the not-run channel itself.
     A line that opens with a check's own verdict is a check that ran; a skip line is left in,
     because a skipped check is what this section exists to say. Case 30n. */
  const RAN = /^\s*(ok|FAIL)\b/;
  const notRun = lines.filter(l => l.indexOf("NOT RUN") > -1 && !RAN.test(l));
  if (notRun.length) notRun.forEach(l => say("- " + l.trim()));
  else say("- nothing said NOT RUN, which on a runner with no fixtures would be a surprise");
  if (!lines.some(l => /^RESULT: /.test(l))) {
    say("- and there is no RESULT line, so the chain stopped before tests/test.js gave a verdict");
    fails.push("no RESULT line in " + file);
  }
}

/* The notice, on the platform that must carry it and on the one that must not. */
/* ANCHORED TO A WHOLE LINE, and the anchor is what run 39 cost. The log this tool is handed is
   never one gate's output: it is `npm test`, 21 gates into one tee, and a gate may legitimately
   QUOTE the notice inside a message - tests/engine-selftest.js case 25b prints E.suiteVerdict's
   lines as JSON, so off Windows a passing check hundreds of lines above the notice carries its
   header. Unanchored and first-match-wins, this read that check for a verdict, found the next
   check under it instead of the list, and reddened a green job with "says 7 things and 0 line(s)
   follow it" while the notice sat intact further down. The notice is a line of its own at
   whatever indent its printer uses, and a mention inside a sentence is not the notice: cases 30j
   (the quotation before the real notice), 30k (the quotation INSTEAD of it, which must still be
   a refusal for absence) and 30m (the same on win32, which must stay quiet). */
const HEAD = /^\s*NOT WINDOWS \(([a-z0-9]+)\), so whatever this run says, it did not look at (\d+) things:\s*$/;
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

/* The summary goes to the file the runner names, so that stdout is free to carry the workflow
   commands below; with the variable unset it goes to stdout, which is how every case in
   tests/engine-selftest.js reads it. */
const SUMMARY = process.env.GITHUB_STEP_SUMMARY;
if (SUMMARY) fs.appendFileSync(SUMMARY, out.join("\n") + "\n", "utf8");
else console.log(out.join("\n"));

/* Board item 427: what a red run said, into the channel that does not need a sign-in. The three
   characters a workflow command means something by are percent-encoded, which is the runner's own
   rule: a message carrying a bare % loses everything after it to a decode nobody asked for, and
   this harness prints per cent signs (search evaluation, coverage). */
const ANNOTATION_CAP = 10;
const esc = s => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const note = m => console.log("::error title=gate failure::" + esc(m));
const red = lines.filter(l => /^ {2}FAIL[ :]/.test(l));
red.slice(0, ANNOTATION_CAP).forEach(l => note(l.trim()));
if (red.length > ANNOTATION_CAP)
  note(red.length + " lines of the log begin with FAIL and the first " + ANNOTATION_CAP
    + " are above; the rest are in the log");

if (fails.length) {
  fails.forEach(f => console.log("::error title=job summary::" + esc(f)));
  fails.forEach(f => console.error("  FAIL " + f));
  console.error("  the job summary is how a green run says what it did not look at, board item 629");
  process.exit(1);
}
