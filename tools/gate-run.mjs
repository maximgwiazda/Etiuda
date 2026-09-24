/* Every gate writes one machine-readable line per run, board item 442.
 *
 *   node tools/gate-run.mjs test split-guard        the two fast chains
 *   node tools/gate-run.mjs shell-smoke             one gate, one line
 *   ETIUDA_RUNS=<folder> node tools/gate-run.mjs …  somewhere else to write them
 *
 * WHY. The chief of staff's tick and the QA engineer read a run's result out of prose today, and
 * prose is where a count is quietly wrong: 103 verifications in the week to 2026-09-16 refuted no
 * build and corrected 47 counts. A number a tool wrote is cheaper to check than a number an agent
 * transcribed, so each gate's run leaves a JSON object behind and the reading is numbers against
 * numbers.
 *
 * THE LIST OF GATES IS NOT WRITTEN HERE. It is what package.json enumerates: this takes the names
 * of npm scripts, splits each script's command on `&&` the way npm's shell would, and runs the
 * steps itself. A step that is not `node <file> …` is a refusal rather than a skip, because a
 * chain that grew a step this cannot read must not pass as a chain that had none. Add a gate to
 * package.json and it is run and recorded here without this file being touched.
 *
 * WHERE THE LINES GO. One file per gate per run, named gate-then-timestamp, in a folder OUTSIDE
 * both repositories (`etiuda-runs` beside the main working tree by default, see mainTree below),
 * so two gates never write one file and no run leaves anything in a tree. The folder is refused
 * if it sits inside the repository this is run from.
 *
 * WHAT A COUNT IS HERE, since a count without its method is an impression:
 *   - `declared`: a gate may print `#counts name=12 other=3` on a line of its own, and those
 *     numbers are taken verbatim. That is the only channel by which a gate names its own counts.
 *     It goes BEFORE the gate's last line: more than one gate's selftest requires the last line
 *     to lead with the verdict rather than with a count, and one of them caught this the first
 *     time the line was printed after it.
 *   - `ok` and `fail`: lines of the gate's output beginning with two spaces and `FAIL` or `ok`,
 *     which is what every driver in tests/ prints per check. `FAIL` is taken with a space or a
 *     colon after it, because the largest gate in the tree reports a section that threw as
 *     `  FAIL: <message>` and a pattern wanting a space counted nought of them. Counted always,
 *     including for a gate that declares, because the two disagreeing is itself worth seeing.
 *     Both names are RESERVED: a gate declaring `ok` or `fail` is a clash, because those two
 *     words mean checks in every gate's line and a gate that means something else by them has
 *     taken a word the record reads.
 *   - `lines`: lines of output, which is the liveness floor - a gate that printed nothing at all
 *     cannot have checked anything, and `countsFrom` says "none" rather than leaving zeroes to be
 *     read as a clean run.
 *   - `exitCode`: THE VERDICT, INSIDE THE COUNTS, board item 550. It is the same number as the
 *     line's own `exit` and the duplication is the whole point: the record reads `counts`, and
 *     before this a gate could hand it `{legs: 265, failed: 0}` while exiting 1. That is not a
 *     hypothesis - a tree without node_modules makes tests/test.js throw in a section whose
 *     failures its declared counts never covered, and the line read green. A reader cannot now
 *     hold the counts of a failing gate without holding its failure. RESERVED like the two above.
 *   - `treeHash`, `treeFiles`, `treeHow` and `treeChanged`, beside the counts: the content
 *     fingerprint of the tree the gate ran over, and whether it moved while the gate ran.
 *     A step whose tree moved has no verdict and the chain stops. Board item 645, and the
 *     long note is beside the code.
 *   - `gateExit`: the gate's own exit code, which is the same number as `exit` except where
 *     the tree moved, in which case `exit` and `counts.exitCode` are NO_VERDICT and this is
 *     what the gate itself said before its verdict was withdrawn.
 *   - `clash`, beside the counts rather than in them, because it is a property of the reading and
 *     not of the gate: the number of keys declared twice with DIFFERENT values, where the later
 *     was kept. Board item 518. Nought is the ordinary case and it is written every time, so that
 *     its absence one day is legible rather than silent.
 * A gate's exit code is the verdict. The counts are how a green that fell is noticed.
 *
 * THIS FILE IS GATED BY tests/result-line.mjs, which is a control rather than a description:
 * every count it asserts is read twice, from a lab gate and from the same gate with one planted
 * mutation, and the same assertion must hold on the first and FAIL on the second.
 */
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NO_VERDICT = 78;

function refuse(what, how) {
  console.log("  FAIL " + what);
  if (how) console.log("       " + how);
  console.log("  SUITE DID NOT COMPLETE");
  process.exit(NO_VERDICT);
}

/* Not path.startsWith: C:/x/etiuda-runs starts with C:/x/etiuda and is not inside it. */
function inside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/* THE DEFAULT RUNS FOLDER is `etiuda-runs` beside the MAIN working tree, not beside ROOT. Until
   2026-09-23 it was a literal absolute path on one machine, which this repository's rules forbid;
   on that desk it named the main tree's sibling, and every worktree of the repository wrote
   there wherever the worktree itself lived. Beside ROOT would keep the first and break the
   second for a worktree in a scratch folder, so the anchor is the main tree: the parent of git's
   common directory. Git is asked only when it says ROOT is itself the top of a work tree, so a
   folder nested in some other repository is not handed that one's record. Without git, or where
   the common directory is not a `.git` (a bare or separated repository), ROOT stands in.
   ETIUDA_RUNS overrides all of it. Proved by tests/result-line.mjs leg 10a. */
function mainTree() {
  const top = git(["rev-parse", "--path-format=absolute", "--show-toplevel"]);
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!top || !common || path.relative(path.resolve(top), ROOT) !== "") return ROOT;
  return path.basename(common) === ".git" ? path.dirname(path.resolve(common)) : ROOT;
}
const RUNS = path.resolve(process.env.ETIUDA_RUNS || path.join(mainTree(), "..", "etiuda-runs"));
if (inside(ROOT, RUNS)) refuse("the runs folder is inside the repository: " + RUNS,
  "these files are a record of runs, not of the tree; put them beside it, not in it");
fs.mkdirSync(RUNS, { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const asked = process.argv.slice(2);
if (!asked.length) refuse("no npm script was named", "node tools/gate-run.mjs test split-guard");

/* The gates, from package.json and from nothing else. */
const steps = [];
for (const name of asked) {
  const cmd = pkg.scripts && pkg.scripts[name];
  if (!cmd) refuse("package.json has no script called " + JSON.stringify(name),
    "the scripts it does have: " + Object.keys(pkg.scripts || {}).join(", "));
  for (const raw of cmd.split("&&")) {
    const step = raw.trim();
    if (!step) continue;
    const m = /^node\s+(\S+)\s*(.*)$/.exec(step);
    if (m && /gate-run/.test(m[1])) refuse("npm script " + name + " runs this file, which would "
      + "run itself: " + JSON.stringify(step),
      "the runner is not a gate; name the scripts it should run on the command line");
    if (!m) refuse("a step of npm script " + name + " is not a node gate this can run: "
      + JSON.stringify(step),
      "either make it one, or teach this file what else a gate may look like - it will not skip it");
    steps.push({ script: name, cmd: step, file: m[1], args: m[2] ? m[2].split(/\s+/) : [] });
  }
}

function git(args) {
  try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }
  catch (e) { return ""; }
}
const COMMIT = git(["rev-parse", "--short", "HEAD"]);
const DIRTY = git(["status", "--porcelain"]).length > 0;

/* ------------------------------------------------------------------------------------------- *
 * THE TREE MUST NOT MOVE UNDER A GATE. Board item 645.
 *
 * WHAT HAPPENED. On 2026-09-20 a seat's mutation control began rewriting src/ while that seat's
 * own baseline `npm test` was still at gate 11. The baseline was lost, and it was said plainly
 * rather than hidden, which is the only reason anyone knows it happened. An hour later a second
 * seat captured its baseline to a file before mutating anything and had a clean comparison. The
 * difference between those two runs was discipline, and discipline is the thing this file is for
 * replacing with machinery.
 *
 * THE FAILURE TO PREVENT IS NOT A LOST BASELINE. It is a FALSE GREEN. A suite reading a
 * half-mutated tree can pass: most gates read most files, a rewrite lands between two of them,
 * and every gate after it judges bytes no gate before it saw. The record then carries
 * `commit 0f09226, dirty false, 500 ok` about a tree that was never in one state at one time,
 * and nothing in the line says so. `dirty` cannot say so: it is read ONCE, before the first gate,
 * and the whole point is that the tree moves afterwards.
 *
 * SO EVERY STEP IS BRACKETED. A fingerprint of the CONTENT of every file in the tree is taken
 * before the first gate and again after each one, and a step whose fingerprint moved is a step
 * whose verdict does not exist: the chain stops with NO_VERDICT, the moved files are named, and
 * the step's record carries `treeChanged: 1` with `counts.exitCode` set to NO_VERDICT rather
 * than to the gate's own exit. THAT LAST PART IS THE POINT AND NOT A DETAIL: the reader of a
 * record reads `counts`, so a gate that passed over a tree that moved under it must not be able
 * to hand `counts` a zero. Its own exit is kept beside, as `gateExit`, because the fact is worth
 * having; it is the VERDICT that is withdrawn.
 *
 * CONTENT AND NOT MTIME, so that a gate which rewrites a file with the bytes it already had is
 * not a refusal. A check that fires on work nobody objects to is a check somebody turns off.
 *
 * WHAT THIS DOES NOT SEE, stated because a guard whose limit is unwritten gets trusted past it:
 * a change made and put back INSIDE one gate's run. The bracket is per step, so a mutation that
 * lives and dies between two fingerprints leaves no trace here. What covers that case is
 * `treeHash` in every line: two runs of one gate over one tree carry one hash, and two runs that
 * disagree were not run over the same bytes, whatever their counts say.
 *
 * THE SUBJECT IS WHAT GIT WOULD SHOW, `git ls-files -co --exclude-standard`: the tracked files
 * and the untracked ones that are not ignored. An ignored path is a seat's scratch and a build
 * artefact and node_modules, and a run that wrote one of those did not move the tree a gate
 * judges. Where there is no git at all - a `git archive | tar -x` lab, a temp folder - the file
 * list is a walk of the tree skipping `.git` and `node_modules`, and `treeHow` says which of the
 * two was used, because a fingerprint over a different file set is a different fingerprint and a
 * count without its method is an impression.
 * ------------------------------------------------------------------------------------------- */

const SKIP_DIRS = new Set([".git", "node_modules"]);

function walkInto(dir, prefix, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walkInto(path.join(dir, e.name), prefix + e.name + "/", out);
    } else if (e.isFile()) out.push(prefix + e.name);
  }
}

/* The file list and the method that produced it, never one without the other. */
function treeFiles() {
  let listed = "";
  try {
    listed = execFileSync("git", ["ls-files", "-z", "-c", "-o", "--exclude-standard"],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  } catch (e) { listed = ""; }
  const names = listed.split("\0").filter(Boolean);
  if (names.length) return { how: "git ls-files -co --exclude-standard", files: names.sort() };
  const out = [];
  walkInto(ROOT, "", out);
  return { how: "walk skipping .git and node_modules", files: out.sort() };
}

/* A digest per file and one over the lot. The per-file map is what names the movers. */
function fingerprint() {
  const { how, files } = treeFiles();
  const per = new Map();
  const whole = crypto.createHash("sha256");
  let bytes = 0;
  for (const f of files) {
    let buf = null;
    try { buf = fs.readFileSync(path.join(ROOT, f)); } catch (e) { buf = null; }
    /* A file git lists and the disk has not is a change like any other, so it gets a digest of
       its own rather than being dropped out of the list in silence. */
    const d = buf === null ? "gone" : crypto.createHash("sha256").update(buf).digest("hex");
    if (buf !== null) bytes += buf.length;
    per.set(f, d);
    whole.update(f); whole.update("\0"); whole.update(d); whole.update("\0");
  }
  return { how, hash: whole.digest("hex").slice(0, 16), count: files.length, bytes, per };
}

function movedFiles(before, after) {
  const names = new Set();
  for (const f of before.per.keys()) names.add(f);
  for (const f of after.per.keys()) names.add(f);
  const moved = [];
  for (const f of names) {
    const a = before.per.get(f), b = after.per.get(f);
    if (a !== b) moved.push(f + (a === undefined ? " (appeared)" : b === undefined ? " (vanished)"
      : b === "gone" ? " (removed)" : a === "gone" ? " (restored)" : ""));
  }
  return moved.sort();
}

/* gate names are the path, so tools/split-guard/selftest.mjs and tools/catalog-v2/selftest.mjs
   are two gates and not one. */
const gateName = file => file.replace(/\\/g, "/").replace(/\.(mjs|js|cjs)$/, "").replace(/[^A-Za-z0-9]+/g, "-");
/* LOCAL time in the name and UTC in the object. The record this feeds is dated by the desk's own
   day, and a file called 20260916T2324 written on the night of the 17th is a file nobody finds. */
const pad = (n, w) => String(n).padStart(w || 2, "0");
const stamp = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
  + "T" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + "-" + pad(d.getMilliseconds(), 3);

/* The words this tool means something by, which no gate may declare. */
const RESERVED = ["ok", "fail", "exitCode"];

function countsOf(out, exit) {
  const lines = out.split(/\r?\n/);
  const counts = {};
  let from = "none";
  const ok = lines.filter(l => /^ {2}ok {2,}/.test(l)).length;
  /* A COLON COUNTS AS WELL AS A SPACE. tests/test.js reports a section that threw as
     `  FAIL: <message>`, and a pattern wanting a space after the word saw nought of them: in a
     tree without node_modules its line read `legs=265 failed=0 fail=0` under RESULT: FAIL. */
  const bad = lines.filter(l => /^ {2}FAIL[ :]/.test(l)).length;
  if (ok || bad) { counts.ok = ok; counts.fail = bad; from = "ok/FAIL lines"; }
  /* A KEY IS EACH GATE'S OWN CHOICE AND TWO GATES PICK ONE WORD (board item 518). Studio's
     launch-door declares `failures` and its shell-launch declares `failures`, and the line that
     covers a whole chain kept the second silently: a number naming one gate while reading as the
     chain's is the same fault as asserting a count by its key. The later value still wins,
     because neither one is more true than the other and guessing is worse, but the number of
     keys written over with a DIFFERENT value travels beside the counts. A repeat that agrees is
     not a clash, and a declared key landing on the derived `ok` or `fail` is one. */
  const clashed = [];
  let declared = false;
  for (const l of lines) {
    const m = /^#counts((?:\s+[A-Za-z][A-Za-z0-9_]*=-?\d+)+)\s*$/.exec(l.trim());
    if (!m) continue;
    for (const pair of m[1].trim().split(/\s+/)) {
      const [k, v] = pair.split("=");
      const n = Number(v);
      /* `ok`, `fail` and `exitCode` are this tool's own words and mean checks and the verdict,
         across every gate, so a gate declaring one is a clash whether or not it printed any:
         tests/eol-attrs.mjs declared `ok=189` meaning FILES, and because its one pass line had a
         single space after `ok` where the counter wants two, the declaration landed on the key in
         silence. Both were corrected; reserving the names is what stops it coming back. */
      const taken = (k in counts && counts[k] !== n) || RESERVED.indexOf(k) > -1;
      if (taken && clashed.indexOf(k) < 0) clashed.push(k);
      counts[k] = n;
    }
    declared = true;
  }
  if (declared) from = from === "none" ? "declared" : from + " and declared";
  counts.lines = lines.filter(l => l.trim() !== "").length;
  /* THE VERDICT TRAVELS INSIDE THE COUNTS, board item 550, and it is written last so that no
     declared key can be mistaken for it. Whoever reads `counts` reads the exit code with them,
     which is what makes a green reading of a failing gate impossible rather than unlikely. */
  counts.exitCode = exit;
  return { counts, from, clashed };
}

function runStep(step) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [step.file].concat(step.args),
      { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", d => { out += d; process.stdout.write(d); });
    child.stderr.on("data", d => { out += d; process.stderr.write(d); });
    child.on("close", code => resolve({ exit: code === null ? -1 : code, wallMs: Date.now() - t0, out }));
  });
}

let worst = 0, written = 0;
/* The tree as it stood before the first gate. Every step is judged against the step before it,
   so the record says WHICH gate the tree moved under and not merely that it moved. */
let before = fingerprint();
console.log("gate-run: tree " + before.hash + ", " + before.count + " file(s), " + before.bytes
            + " byte(s), by " + before.how);
for (const step of steps) {
  const now = new Date();
  console.log("\n> " + step.cmd);
  const res = await runStep(step);
  const after = fingerprint();
  const moved = after.hash === before.hash ? [] : movedFiles(before, after);
  /* THE VERDICT THE RECORD CARRIES IS NO_VERDICT WHERE THE TREE MOVED, and the gate's own exit
     goes beside it as `gateExit`. A reader reads `counts`, so this is the only place the
     withdrawal can be made to stick. */
  const verdict = moved.length ? NO_VERDICT : res.exit;
  const { counts, from, clashed } = countsOf(res.out, verdict);
  if (clashed.length) console.log("  clash: " + clashed.length + " key(s) declared twice with"
    + " different values, the later kept: " + clashed.join(", "));
  const line = {
    gate: gateName(step.file),
    script: step.script,
    cmd: step.cmd,
    exit: verdict,
    gateExit: res.exit,
    counts: counts,
    countsFrom: from,
    clash: clashed.length,
    treeHash: after.hash,
    treeFiles: after.count,
    treeHow: after.how,
    treeChanged: moved.length,
    wallMs: res.wallMs,
    commit: COMMIT,
    dirty: DIRTY,
    time: now.toISOString(),
  };
  const file = path.join(RUNS, line.gate + "-" + stamp(now) + ".json");
  fs.writeFileSync(file, JSON.stringify(line) + "\n", "utf8");
  written++;
  console.log("  gate-run: " + path.basename(file) + " " + JSON.stringify(line.counts)
              + " exit " + line.exit + " in " + line.wallMs + " ms");
  if (moved.length) {
    console.log("  FAIL the tree moved under " + line.gate + ", so this run has no verdict: "
                + moved.length + " file(s) changed while it ran");
    for (const f of moved.slice(0, 20)) console.log("       " + f);
    if (moved.length > 20) console.log("       and " + (moved.length - 20) + " more");
    console.log("       " + before.hash + " before this gate, " + after.hash + " after it, over "
                + after.count + " file(s) by " + after.how);
    console.log("       the gate itself exited " + res.exit + ", which is not a verdict: bytes it"
                + " read early and bytes it read late were not the same tree");
    console.log("       a mutation control belongs in a copy of the tree, and a baseline belongs"
                + " in a file before any mutation begins");
    console.log("  SUITE DID NOT COMPLETE");
    worst = NO_VERDICT;
    break;
  }
  before = after;
  if (res.exit !== 0) { worst = res.exit; break; }   /* && semantics: the chain stops */
}

console.log("\ngate-run: " + written + " of " + steps.length + " gate(s) run from "
            + asked.length + " npm script(s), " + written + " line(s) in " + RUNS
            + ", tree " + before.hash
            + (worst === NO_VERDICT ? ", NO VERDICT: the tree moved under a gate"
               : worst ? ", stopped at a gate exiting " + worst : ", all green"));
/* A GATE'S CODE IS PASSED ON ONLY WHERE A SHELL CAN READ IT, ballot 4 of the fourth meeting
   (2026-09-23). Windows hands this process a child's full 32 bits, so a gate exiting 256 stopped
   the chain here and then left as 256, which bash and Linux read as 0: the chain said green in
   the one signal an automation reads. Anything outside 1 to 255 leaves as 1; the record above
   keeps the gate's own number. */
process.exitCode = worst === 0 ? 0 : (worst > 0 && worst < 256 ? worst : 1);
