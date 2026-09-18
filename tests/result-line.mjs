/* ONE LEG PER CLAIM THE RESULT LINE COULD GET WRONG, AND EVERY COUNT PROVED BY MUTATING IT.
 * Board item 518.
 *
 *     node tests/result-line.mjs [--keep]
 *
 * WHY THIS FILE EXISTS. `tools/gate-run.mjs` writes the JSON line every gate's run leaves behind,
 * and since 2026-09-18 those lines are the only reader of the counts: the QA engineer's one-in-
 * four sampling of a report's numbers stopped, and what replaced it is `counts` in the record.
 * The tool had no test of any kind. A count nobody checks is a count that can quietly stop
 * moving, and the way it goes wrong is already measured next door: Studio's release suite
 * asserted a count by its KEY (`"counts" in line`) and stayed 21 assertions, 0 failures green
 * when the package gate's counts were deleted outright.
 *
 * SO EVERY LEG HERE IS A CONTROL. The claim is never "the number is there" and never "the number
 * is 7". It is "the number FOLLOWS the thing it counts": each count is read twice, from a lab
 * gate and from the same lab gate with one planted mutation, and the same assertion is required
 * to hold on the first and to FAIL on the second. A counter that returned a constant, a writer
 * that recorded the wrong field, and a reader that looked at the key rather than the value all
 * survive "the number is 7" and none of them survives that pair.
 *
 * THE LAB. `tools/gate-run.mjs` takes its gates from the package.json beside it, so a lab is a
 * temp folder holding a copy of the tool, a package.json of stub scripts, and one stub per
 * script that prints exactly what the leg wants counted. Nothing in the engine tree is run, no
 * `node_modules` is needed, and `ETIUDA_RUNS` points inside the lab, so no run of this file
 * leaves a line in the record. The tool is not imported: `import()` runs a module, and the last
 * seat that imported a tool to check it started a real release run.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TOOL = path.join(ROOT, "tools", "gate-run.mjs");
const KEEP = process.argv.indexOf("--keep") > -1;
/* The floor: every leg below runs, or the suite says it did not complete rather than passing
   with half of itself skipped by an early return. */
const EXPECTED = 21;

let asserted = 0, failed = 0;
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stderr.write("  FAIL " + line + "\n"); }
}

const labs = [];

/** A lab whose package.json has one npm script per stub, each `node tests/<name>.mjs`.
 *  `stubs` is a map from script name to the body the stub prints. */
function makeLab(kind, stubs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-result-line-" + kind + "-"));
  labs.push(root);
  const lab = path.join(root, "lab");
  const runs = path.join(root, "runs");
  fs.mkdirSync(path.join(lab, "tools"), { recursive: true });
  fs.mkdirSync(path.join(lab, "tests"), { recursive: true });
  fs.mkdirSync(runs);
  fs.copyFileSync(TOOL, path.join(lab, "tools", "gate-run.mjs"));
  const scripts = {};
  for (const name of Object.keys(stubs)) {
    scripts[name] = "node tests/" + name + ".mjs";
    fs.writeFileSync(path.join(lab, "tests", name + ".mjs"), stubs[name]);
  }
  fs.writeFileSync(path.join(lab, "package.json"),
    JSON.stringify({ name: "lab", version: "0.0.0", scripts }, null, 2) + "\n");
  return { root, lab, runs };
}

/** Print n lines of the shape every driver in tests/ prints. `  ok   text` and `  FAIL text`. */
function prints(okLines, failLines, extra) {
  const parts = [];
  for (let i = 0; i < okLines; i++) parts.push('console.log("  ok   leg " + ' + i + ');');
  for (let i = 0; i < failLines; i++) parts.push('console.log("  FAIL leg " + ' + i + ');');
  if (extra) parts.push(extra);
  return parts.join("\n") + "\n";
}

/** Run the lab's copy of the tool over the named npm scripts, and return the lines it wrote,
 *  indexed by gate. The gate name is the tool's own mangling of the step's path, and the legs
 *  below pin it as a frozen literal rather than recomputing it here. */
function run(l, names) {
  const r = spawnSync(process.execPath, [path.join(l.lab, "tools", "gate-run.mjs")].concat(names), {
    cwd: l.lab,
    encoding: "utf8",
    env: Object.assign({}, process.env, { ETIUDA_RUNS: l.runs }),
    timeout: 60000,
  });
  const byGate = {};
  const files = fs.existsSync(l.runs) ? fs.readdirSync(l.runs).filter(f => f.endsWith(".json")) : [];
  for (const f of files.sort()) {
    const line = JSON.parse(fs.readFileSync(path.join(l.runs, f), "utf8"));
    byGate[line.gate] = line;
  }
  return { exit: r.status, out: String(r.stdout || "") + String(r.stderr || ""), byGate, files };
}

/* THE ASSERTIONS THE CONTROL TURNS AGAINST ITSELF. Each takes a result line and the numbers the
   lab planted, and each is used twice: once where the planted numbers are true, and once where
   the mutation made them false. A leg's teeth are the second use returning false. */
const derivedSays = (line, ok, bad, lines) => !!line && line.countsFrom === "ok/FAIL lines"
  && line.counts.ok === ok && line.counts.fail === bad && line.counts.lines === lines;
const declaredSays = (line, key, value) => !!line && line.counts[key] === value;

function main() {
  check(fs.existsSync(TOOL), "0 the tool is there: " + TOOL);
  if (!fs.existsSync(TOOL)) {
    process.stdout.write("result-line: " + asserted + " assertion(s), " + failed
      + " failure(s), SUITE DID NOT COMPLETE\n");
    process.exit(1);
  }

  /* ---- 1. THE DERIVED COUNTS, ok AND fail AND lines --------------------------------------- */
  /* Method: the stub prints 7 lines beginning with two spaces and `ok` and 2 beginning with two
     spaces and `FAIL`, and nothing else, so the three derived numbers are known before the tool
     runs. The mutant prints 6 and 3 of the same lines: one ok line moved to a FAIL line, which
     holds the total at 9 and moves both counts by one, so a `lines` count standing in for either
     of them would pass the first arm and fail the second. */
  const d = makeLab("derived", {
    base: prints(7, 2, "process.exit(0);"),
    mutant: prints(6, 3, "process.exit(0);"),
  });
  const dRun = run(d, ["base", "mutant"]);
  const dBase = dRun.byGate["tests-base"];
  const dMut = dRun.byGate["tests-mutant"];
  check(derivedSays(dBase, 7, 2, 9),
    "1a the derived counts are the gate's own output: 7 ok and 2 FAIL lines printed, "
    + JSON.stringify(dBase && dBase.counts) + " recorded, countsFrom "
    + JSON.stringify(dBase && dBase.countsFrom));
  check(derivedSays(dMut, 6, 3, 9),
    "1b and they follow it: the mutant prints 6 and 3 of the same lines and records "
    + JSON.stringify(dMut && dMut.counts));
  check(derivedSays(dBase, 7, 2, 9) && !derivedSays(dMut, 7, 2, 9)
    && dBase.counts.ok - dMut.counts.ok === 1 && dMut.counts.fail - dBase.counts.fail === 1,
    "1c THE CONTROL: the same assertion holds on the base arm and FAILS on the mutant, and the"
    + " planted delta of one ok line and one FAIL line is the delta recorded ("
    + (dBase.counts.ok - dMut.counts.ok) + " and " + (dMut.counts.fail - dBase.counts.fail)
    + "). A counter that returned a constant passes 1a and dies here");
  check(dBase.gate === "tests-base" && dBase.script === "base"
    && dBase.cmd === "node tests/base.mjs" && dBase.exit === 0
    && typeof dBase.wallMs === "number" && typeof dBase.time === "string"
    && "commit" in dBase && "dirty" in dBase
    && Object.keys(dBase).sort().join(",")
       === "clash,cmd,commit,counts,countsFrom,dirty,exit,gate,script,time,wallMs",
    "1d the line's shape is the eleven keys the record reads, gate named from the step's path: "
    + Object.keys(dBase).sort().join(","));

  /* ---- 2. THE DECLARED CHANNEL ------------------------------------------------------------ */
  /* Method: the stub prints one `#counts` line and nothing else, so `ok` and `fail` are absent
     and countsFrom is `declared` alone. The mutant declares the same two keys with one of them
     one higher. A tool that took the KEY rather than the VALUE - the fault this board item is
     named for - passes 2a and dies at 2c. */
  const q = makeLab("declared", {
    base: 'console.log("#counts ids=129 files=3");\n',
    mutant: 'console.log("#counts ids=130 files=3");\n',
    both: 'console.log("  ok   one leg");\nconsole.log("#counts ids=5");\n',
  });
  const qRun = run(q, ["base", "mutant", "both"]);
  const qBase = qRun.byGate["tests-base"];
  const qMut = qRun.byGate["tests-mutant"];
  const qBoth = qRun.byGate["tests-both"];
  check(declaredSays(qBase, "ids", 129) && declaredSays(qBase, "files", 3)
    && qBase.countsFrom === "declared" && qBase.counts.lines === 1
    && !("ok" in qBase.counts) && !("fail" in qBase.counts),
    "2a a declared count is taken verbatim: #counts ids=129 files=3 printed, "
    + JSON.stringify(qBase && qBase.counts) + " recorded, countsFrom "
    + JSON.stringify(qBase && qBase.countsFrom));
  check(declaredSays(qMut, "ids", 130) && declaredSays(qMut, "files", 3),
    "2b and it follows the number the gate declared: " + JSON.stringify(qMut && qMut.counts));
  check(declaredSays(qBase, "ids", 129) && !declaredSays(qMut, "ids", 129)
    && qMut.counts.ids - qBase.counts.ids === 1 && qMut.counts.files === qBase.counts.files,
    "2c THE CONTROL: the same assertion holds on the base arm and FAILS on the mutant, the"
    + " planted delta of one is the delta recorded, and the key that did not move did not move."
    + " A line asserted by its key alone passes 2a and dies here");
  check(qBoth && qBoth.countsFrom === "ok/FAIL lines and declared"
    && qBoth.counts.ok === 1 && qBoth.counts.fail === 0 && qBoth.counts.ids === 5
    && qBoth.counts.lines === 2,
    "2d a gate that both prints and declares carries both, and countsFrom names both: "
    + JSON.stringify(qBoth && qBoth.countsFrom) + " " + JSON.stringify(qBoth && qBoth.counts));

  /* ---- 3. THE FLOOR: SILENCE MUST NOT READ AS A CLEAN RUN --------------------------------- */
  /* A gate that printed nothing cannot have checked anything, and the danger is that a reader
     takes the zeroes for a clean run. countsFrom says `none` and there are no zeroes to take. */
  const s = makeLab("silent", {
    base: "process.exit(0);\n",
    blank: 'console.log("");\nconsole.log("   ");\n',
  });
  const sRun = run(s, ["base", "blank"]);
  const sBase = sRun.byGate["tests-base"];
  const sBlank = sRun.byGate["tests-blank"];
  check(sBase && sBase.countsFrom === "none" && sBase.counts.lines === 0
    && Object.keys(sBase.counts).join(",") === "lines",
    "3a a gate that printed nothing records countsFrom \"none\" and no zeroes to be read as a"
    + " clean run: " + JSON.stringify(sBase && sBase.counts) + " "
    + JSON.stringify(sBase && sBase.countsFrom));
  check(sBlank && sBlank.countsFrom === "none" && sBlank.counts.lines === 0,
    "3b and a gate whose output is whitespace is the same case, counted as 0 line(s): "
    + JSON.stringify(sBlank && sBlank.counts));

  /* ---- 4. THE DECLARED CHANNEL TAKES INTEGERS ONLY ----------------------------------------- */
  /* The regex takes a whole line or none of it, so one unreadable pair voids its line and the
     keys beside it. That is the intended reading - half a declaration is not a count - and it is
     asserted here so that widening the pattern to floats cannot happen silently. */
  const i = makeLab("integers", {
    base: 'console.log("#counts frac=1.5 beside=2");\n'
      + 'console.log("#counts neg=-3 zero=0");\n'
      + 'console.log("#counts word=many");\n',
  });
  const iRun = run(i, ["base"]);
  const iBase = iRun.byGate["tests-base"];
  check(iBase && !("frac" in iBase.counts) && !("beside" in iBase.counts)
    && !("word" in iBase.counts),
    "4a a #counts line carrying anything but an integer is not read at all, and the keys beside"
    + " it go with it: " + JSON.stringify(iBase && iBase.counts));
  check(iBase && iBase.counts.neg === -3 && iBase.counts.zero === 0,
    "4b a negative integer and a zero are read: neg " + (iBase && iBase.counts.neg)
    + ", zero " + (iBase && iBase.counts.zero));

  /* ---- 5. TWO GATES DECLARING ONE KEY ------------------------------------------------------ */
  /* Board item 518, found while building the control. `#counts` keys are each gate's own choice
     and two gates in one chain pick the same word: Studio's launch-door declares `failures` and
     its shell-launch declares `failures`, and in the one line the `test` gate writes for the
     whole chain the second silently overwrote the first. A number that names one gate while
     reading as the chain's is the same fault as a key standing in for a value, so the count of
     keys declared twice with DIFFERENT values is recorded beside them, and a repeat that agrees
     is not a clash. In this tool one line per step means a clash can only be one gate printing
     two disagreeing lines, which is a fault in that gate; the count travels anyway, because the
     two trees keep one countsOf between them. */
  const c = makeLab("clash", {
    base: 'console.log("#counts checks=4 sites=2");\n'
      + 'console.log("#counts checks=9 other=1");\n',
    agrees: 'console.log("#counts checks=4");\nconsole.log("#counts checks=4 other=1");\n',
    none: 'console.log("#counts checks=4 other=1");\n',
  });
  const cRun = run(c, ["base", "agrees", "none"]);
  const cBase = cRun.byGate["tests-base"];
  const cAgrees = cRun.byGate["tests-agrees"];
  const cNone = cRun.byGate["tests-none"];
  check(cBase && cBase.clash === 1 && cBase.counts.checks === 9 && cBase.counts.other === 1
    && cBase.counts.sites === 2,
    "5a a key declared twice with different values is recorded as a clash: clash "
    + (cBase && cBase.clash) + ", counts " + JSON.stringify(cBase && cBase.counts));
  check(cAgrees && cAgrees.clash === 0 && cNone && cNone.clash === 0,
    "5b THE CONTROL: a key declared twice with the SAME value is not a clash and two different"
    + " keys are not a clash, so the counter reddens on the fault and not on the pattern (clash "
    + (cAgrees && cAgrees.clash) + " and " + (cNone && cNone.clash) + ")");
  check(cBase && cBase.countsFrom === "declared" && cAgrees.countsFrom === "declared",
    "5c and countsFrom names the channel once however many lines declared: "
    + JSON.stringify(cBase && cBase.countsFrom));
  /* The sentence and not the word: the lab folder this leg runs in is itself called `clash`, so
     a bare /clash/ over the output passed under a mutant that never counted one. Measured
     2026-09-18, and it is the second time a lab's own name has answered a test's question. */
  check(/clash: 1 key\(s\) declared twice with different values, the later kept: checks/
    .test(cRun.out) && (cRun.out.match(/clash: \d+ key\(s\)/g) || []).length === 1,
    "5d and the clash is said on the console as well as written, naming the key and said once"
    + " for the one gate that clashed, so a seat running the gate by hand sees it");

  /* 5e AND 5f. `ok` AND `fail` ARE RESERVED WORDS OF THE DERIVED CHANNEL. The blind spot found
     while 5a was being written: the clash above needs the key to be there already, and a gate
     that prints no line the counter can see sets neither, so a declared `ok` lands in silence.
     tests/eol-attrs.mjs did exactly that, declaring `ok=189` meaning FILES while its one pass
     line had a single space after `ok` where the counter wants two. Both were corrected, and a
     gate declaring either word is a clash whether or not it printed any, so it cannot come back
     quietly. The control is the benign twin: the same declaration under another name is clean. */
  const w = makeLab("reserved", {
    silentOk: 'console.log("  ok one space, which the counter does not see");\n'
      + 'console.log("#counts ok=189 files=189");\n',
    twin: 'console.log("  ok one space, which the counter does not see");\n'
      + 'console.log("#counts okFiles=189 files=189");\n',
    loud: 'console.log("  ok   two spaces, which it does");\n'
      + 'console.log("#counts fail=4");\n',
  });
  const wRun = run(w, ["silentOk", "twin", "loud"]);
  const wSilent = wRun.byGate["tests-silentOk"];
  const wTwin = wRun.byGate["tests-twin"];
  const wLoud = wRun.byGate["tests-loud"];
  check(wSilent && wSilent.clash === 1 && wSilent.counts.ok === 189
    && !("fail" in wSilent.counts) && wSilent.countsFrom === "declared"
    && wLoud && wLoud.clash === 1 && wLoud.counts.fail === 4 && wLoud.counts.ok === 1,
    "5e a gate declaring `ok` or `fail` is a clash whether or not the counter saw a line of its"
    + " own: silent " + JSON.stringify(wSilent && wSilent.counts) + " clash "
    + (wSilent && wSilent.clash) + ", loud " + JSON.stringify(wLoud && wLoud.counts) + " clash "
    + (wLoud && wLoud.clash));
  check(wTwin && wTwin.clash === 0 && wTwin.counts.okFiles === 189 && !("ok" in wTwin.counts),
    "5f THE CONTROL: the same declaration under a name of its own is clean, so the reserve"
    + " reddens on the word and not on the number (clash " + (wTwin && wTwin.clash) + ", "
    + JSON.stringify(wTwin && wTwin.counts) + ")");

  /* ---- 6. THE CHAIN STOPS, AND THE LINES ARE STILL WRITTEN --------------------------------- */
  /* npm's && semantics. The point for the record is that the red gate's OWN line exists: a run
     that stopped must leave the count of the gate that stopped it, or the reader sees a chain
     that ends in silence and cannot tell a red from a crash. */
  const r = makeLab("red", {
    red: prints(2, 1, "process.exit(3);"),
    after: prints(5, 0, "process.exit(0);"),
  });
  const rRun = run(r, ["red", "after"]);
  const rRed = rRun.byGate["tests-red"];
  check(rRun.exit === 3 && rRed && rRed.exit === 3
    && rRed.counts.ok === 2 && rRed.counts.fail === 1
    && !rRun.byGate["tests-after"] && rRun.files.length === 1,
    "6 a red gate stops the chain and its own line is written with its counts: exit "
    + rRun.exit + ", " + rRun.files.length + " line(s), "
    + JSON.stringify(rRed && rRed.counts));

  if (!KEEP) for (const dir of labs) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* held */ }
  } else process.stdout.write("--keep: labs at " + labs.join(", ") + "\n");

  check(asserted + 1 === EXPECTED,
    "7 every leg ran: " + (asserted + 1) + " of " + EXPECTED + " assertion(s)");
  process.stdout.write("#counts asserted=" + asserted + " failures=" + failed + "\n");
  process.stdout.write("result-line: " + asserted + " assertion(s), " + failed + " failure(s)\n");
  process.exit(failed ? 1 : 0);
}

main();
