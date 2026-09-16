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
 * both repositories (C:/Users/maxim/Workspace/etiuda-runs by default), so two gates never write
 * one file and no run leaves anything in a tree. The folder is refused if it sits inside the
 * repository this is run from.
 *
 * WHAT A COUNT IS HERE, since a count without its method is an impression:
 *   - `declared`: a gate may print `#counts name=12 other=3` on a line of its own, and those
 *     numbers are taken verbatim. That is the only channel by which a gate names its own counts.
 *     It goes BEFORE the gate's last line: more than one gate's selftest requires the last line
 *     to lead with the verdict rather than with a count, and one of them caught this the first
 *     time the line was printed after it.
 *   - `ok` and `fail`: lines of the gate's output beginning with two spaces and `ok` or `FAIL`,
 *     which is what every driver in tests/ prints per check. Counted always, including for a gate
 *     that declares, because the two disagreeing is itself worth seeing.
 *   - `lines`: lines of output, which is the liveness floor - a gate that printed nothing at all
 *     cannot have checked anything, and `countsFrom` says "none" rather than leaving zeroes to be
 *     read as a clean run.
 * A gate's exit code is the verdict. The counts are how a green that fell is noticed.
 */
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
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

const RUNS = path.resolve(process.env.ETIUDA_RUNS || "C:/Users/maxim/Workspace/etiuda-runs");
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

/* gate names are the path, so tools/split-guard/selftest.mjs and tools/catalog-v2/selftest.mjs
   are two gates and not one. */
const gateName = file => file.replace(/\\/g, "/").replace(/\.(mjs|js|cjs)$/, "").replace(/[^A-Za-z0-9]+/g, "-");
/* LOCAL time in the name and UTC in the object. The record this feeds is dated by the desk's own
   day, and a file called 20260916T2324 written on the night of the 17th is a file nobody finds. */
const pad = (n, w) => String(n).padStart(w || 2, "0");
const stamp = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
  + "T" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + "-" + pad(d.getMilliseconds(), 3);

function countsOf(out) {
  const lines = out.split(/\r?\n/);
  const counts = {};
  let from = "none";
  const ok = lines.filter(l => /^ {2}ok {2,}/.test(l)).length;
  const bad = lines.filter(l => /^ {2}FAIL /.test(l)).length;
  if (ok || bad) { counts.ok = ok; counts.fail = bad; from = "ok/FAIL lines"; }
  for (const l of lines) {
    const m = /^#counts((?:\s+[A-Za-z][A-Za-z0-9_]*=-?\d+)+)\s*$/.exec(l.trim());
    if (!m) continue;
    for (const pair of m[1].trim().split(/\s+/)) {
      const [k, v] = pair.split("=");
      counts[k] = Number(v);
    }
    from = from === "none" ? "declared" : from + " and declared";
  }
  counts.lines = lines.filter(l => l.trim() !== "").length;
  return { counts, from };
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
for (const step of steps) {
  const now = new Date();
  console.log("\n> " + step.cmd);
  const res = await runStep(step);
  const { counts, from } = countsOf(res.out);
  const line = {
    gate: gateName(step.file),
    script: step.script,
    cmd: step.cmd,
    exit: res.exit,
    counts: counts,
    countsFrom: from,
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
  if (res.exit !== 0) { worst = res.exit; break; }   /* && semantics: the chain stops */
}

console.log("\ngate-run: " + written + " of " + steps.length + " gate(s) run from "
            + asked.length + " npm script(s), " + written + " line(s) in " + RUNS
            + (worst ? ", stopped at a gate exiting " + worst : ", all green"));
process.exitCode = worst;
