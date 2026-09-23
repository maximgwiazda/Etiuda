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
const EXPECTED = 35;

let asserted = 0, failed = 0;
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stderr.write("  FAIL " + line + "\n"); }
}

const labs = [];

/** A lab whose package.json has one npm script per stub, each `node tests/<name>.mjs`.
 *  `stubs` is a map from script name to the body the stub prints. `opts.files` is a map of extra
 *  files the lab holds, so a stub can be made to move one of them, and `opts.git` makes the lab a
 *  repository of its own - `git init` and nothing else, since `git ls-files -co` lists an
 *  untracked file as readily as a tracked one and an index would add a step that can fail. Both
 *  are for section 9, where the subject is the tree rather than the output. */
function makeLab(kind, stubs, opts) {
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
  const extra = (opts && opts.files) || {};
  for (const rel of Object.keys(extra)) {
    const at = path.join(lab, rel);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, extra[rel]);
  }
  if (opts && opts.git) {
    const r = spawnSync("git", ["init", "-q"], { cwd: lab, encoding: "utf8", timeout: 30000 });
    if (r.status !== 0) throw new Error("the lab could not be made a repository: "
      + String(r.stderr || r.error));
  }
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
       === "clash,cmd,commit,counts,countsFrom,dirty,exit,gate,gateExit,script,time,treeChanged,treeFiles,treeHash,treeHow,wallMs",
    "1d the line's shape is the sixteen keys the record reads, gate named from the step's path: "
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
    && Object.keys(sBase.counts).join(",") === "lines,exitCode",
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

  /* ---- 7. THE VERDICT IS INSIDE THE COUNTS -------------------------------------------------- */
  /* Board item 550, and it is measured rather than imagined: in a tree without node_modules
     tests/test.js throws in section 2e, ends RESULT: FAIL, and declares `legs=265 failed=0`,
     because the sections that set its verdict are not the legs it counts. The record reads
     `counts`, so that object held a green reading of a failing gate.
     THE CONTROL. Both arms declare the SAME two numbers and print the same nothing else; only
     the exit differs. A tool that did not carry the verdict into the counts hands back two
     identical objects and 7b dies, which is the fault this leg exists for. */
  const v = makeLab("verdict", {
    green: 'console.log("#counts legs=265 failed=0");\nprocess.exit(0);\n',
    red: 'console.log("#counts legs=265 failed=0");\nprocess.exit(1);\n',
    declares: 'console.log("#counts exitCode=0 legs=7");\nprocess.exit(1);\n',
    twin: 'console.log("#counts exitCodeSeen=0 legs=7");\nprocess.exit(1);\n',
  });
  const vRun = run(v, ["green"]);
  const vRun2 = run(v, ["red"]);
  const vRun3 = run(v, ["declares"]);
  const vRun4 = run(v, ["twin"]);
  const vGreen = vRun.byGate["tests-green"];
  const vRed = vRun2.byGate["tests-red"];
  const vDecl = vRun3.byGate["tests-declares"];
  const vTwin = vRun4.byGate["tests-twin"];
  check(vGreen && JSON.stringify(vGreen.counts) === '{"legs":265,"failed":0,"lines":1,"exitCode":0}',
    "7a a gate that passed carries exitCode 0 among its counts, written last: "
    + JSON.stringify(vGreen && vGreen.counts));
  check(vRed && vRed.counts.exitCode === 1
    && JSON.stringify(vGreen.counts) !== JSON.stringify(vRed.counts)
    && vRed.counts.legs === vGreen.counts.legs && vRed.counts.failed === vGreen.counts.failed,
    "7b THE CONTROL: the same declaration under a FAIL verdict cannot be read green - the gate's"
    + " own two numbers are identical on both arms (" + JSON.stringify(vRed && vRed.counts)
    + ") and the counts objects differ, in the exit code and in nothing else. A tool that left"
    + " the verdict outside the counts passes 7a and dies here");
  check(vDecl && vDecl.clash === 1 && vDecl.counts.exitCode === 1 && vDecl.counts.legs === 7,
    "7c a gate declaring exitCode is a clash and the real verdict wins over the declaration:"
    + " declared 0, exited 1, recorded " + (vDecl && vDecl.counts.exitCode) + ", clash "
    + (vDecl && vDecl.clash));
  check(vTwin && vTwin.clash === 0 && vTwin.counts.exitCodeSeen === 0 && vTwin.counts.exitCode === 1,
    "7d THE CONTROL: the same number under a name of its own is clean, so the reserve reddens on"
    + " the word and not on the value (clash " + (vTwin && vTwin.clash) + ", "
    + JSON.stringify(vTwin && vTwin.counts) + ")");

  /* ---- 8. A FAIL LINE MAY END IN A COLON ---------------------------------------------------- */
  /* tests/test.js prints `  FAIL: <message>` for a section that threw, and the pattern wanting a
     space after the word counted nought of them, so the largest gate in the tree could report a
     thrown section and still record fail=0. The benign twin is a word that merely begins with
     those four letters: the pattern must redden on the report shape, not on the letters. */
  const f = makeLab("colon", {
    colon: 'console.log("  FAIL: a section threw");\nconsole.log("  ok   one leg");\n',
    twin: 'console.log("  FAILURE is not this shape");\nconsole.log("  ok   one leg");\n',
  });
  const fRun = run(f, ["colon", "twin"]);
  const fColon = fRun.byGate["tests-colon"];
  const fTwin = fRun.byGate["tests-twin"];
  check(fColon && fColon.counts.fail === 1 && fColon.counts.ok === 1,
    "8a a FAIL line ending in a colon is counted: " + JSON.stringify(fColon && fColon.counts));
  check(fTwin && fTwin.counts.fail === 0 && fTwin.counts.ok === 1,
    "8b THE CONTROL: a word that only begins with those letters is not a check, so the counter"
    + " follows the shape and not the letters: " + JSON.stringify(fTwin && fTwin.counts));

  /* ---- 9. THE TREE MOVING UNDER A GATE ------------------------------------------------------ */
  /* Board item 645, and the bad case is made to happen here rather than argued. On 2026-09-20 a
     mutation control rewrote src/ while its own baseline `npm test` was at gate 11. What the
     harness could not do was notice: `dirty` is read once, before the first gate, so a run whose
     tree is rewritten at gate 11 records `dirty: false` for every gate after it and a green tally
     over bytes that were never all in the tree at one time.
     THE STUBS ARE THE MUTATION. A lab gate that prints three passing checks, rewrites a file of
     the lab's own source, and exits 0 is exactly the shape of the accident: a PASSING gate over a
     tree it moved. The guard has teeth only if that run is refused, and 9d is the leg that says
     the refusal cannot be read off the counts, because the counts are identical to the clean
     arm's - the ONLY difference between the two records is the verdict that was withdrawn. */
  const TR_FILES = { "src/thing.js": "export const a = 1;\n", ".gitignore": "junk/\n" };
  const TR_GIT_HOW = "git ls-files -co --exclude-standard";
  const TR_WALK_HOW = "walk skipping .git and node_modules";
  const NL = String.fromCharCode(10);
  /* A stub that prints n passing checks and then does `body`, exiting 0 either way. */
  const trStub = (n, body) => 'import fs from "node:fs";' + NL
    + 'import { fileURLToPath } from "node:url";' + NL
    + 'const R = fileURLToPath(new URL("../", import.meta.url));' + NL
    + prints(n, 0) + (body || "") + NL + "process.exit(0);" + NL;
  /* `R` ends in a separator, so R + "src/thing.js" is the lab's own file and nothing else. */
  const trWrites = (rel, text) => 'fs.mkdirSync(R + "' + rel.replace(/\/[^/]*$/, "")
    + '", { recursive: true });' + NL
    + 'fs.writeFileSync(R + "' + rel + '", ' + JSON.stringify(text) + ');';
  const trRemoves = rel => 'fs.unlinkSync(R + "' + rel + '");';

  /* 9a a quiet run carries the fingerprint, and both gates carry the same one. */
  const trQuiet = makeLab("tree-quiet", { one: trStub(3), two: trStub(2) },
    { files: TR_FILES, git: true });
  const trQuietRun = run(trQuiet, ["one", "two"]);
  const trQuietOne = trQuietRun.byGate["tests-one"], trQuietTwo = trQuietRun.byGate["tests-two"];
  check(trQuietRun.exit === 0 && trQuietOne && trQuietTwo && trQuietOne.treeChanged === 0
    && trQuietTwo.treeChanged === 0 && trQuietOne.treeHow === TR_GIT_HOW
    && /^[0-9a-f]{16}$/.test(trQuietOne.treeHash) && trQuietOne.treeHash === trQuietTwo.treeHash
    && trQuietOne.treeFiles === 6 && trQuietOne.gateExit === 0,
    "9a a run over a tree that did not move records one fingerprint for every gate: "
    + (trQuietOne && trQuietOne.treeHash) + " over " + (trQuietOne && trQuietOne.treeFiles)
    + " file(s) by " + JSON.stringify(trQuietOne && trQuietOne.treeHow) + ", treeChanged "
    + (trQuietOne && trQuietOne.treeChanged) + " and " + (trQuietTwo && trQuietTwo.treeChanged));

  /* 9b THE BAD CASE: a gate that passes and rewrites the tree while it runs. */
  const trMoved = makeLab("tree-moved", {
    mutate: trStub(3, trWrites("src/thing.js", "export const a = 2;\n")),
    after: trStub(1),
  }, { files: TR_FILES, git: true });
  const trMovedRun = run(trMoved, ["mutate", "after"]);
  const trMovedGate = trMovedRun.byGate["tests-mutate"];
  check(trMovedRun.exit === 78 && trMovedGate && trMovedGate.treeChanged === 1
    && trMovedGate.exit === 78 && trMovedGate.counts.exitCode === 78 && trMovedGate.gateExit === 0
    && trMovedGate.counts.ok === 3 && !trMovedRun.byGate["tests-after"]
    && trMovedRun.files.length === 1 && /SUITE DID NOT COMPLETE/.test(trMovedRun.out),
    "9b THE BAD CASE MADE TO HAPPEN: a gate printing 3 passing checks rewrote a file of the tree"
    + " and exited 0, and the run has no verdict - chain exit " + trMovedRun.exit + ", the gate's"
    + " own exit " + (trMovedGate && trMovedGate.gateExit) + " kept beside a recorded exit of "
    + (trMovedGate && trMovedGate.exit) + ", counts.exitCode "
    + (trMovedGate && trMovedGate.counts.exitCode) + ", and the gate after it did not run ("
    + trMovedRun.files.length + " line(s) written)");

  /* 9c THE CONTROL: the same write, the same bytes. A guard that fired on the act of writing
     rather than on the change would redden this, and a guard that reddens work nobody objects to
     is a guard somebody turns off. */
  const trSame = makeLab("tree-rewrite", {
    rewrite: trStub(3, trWrites("src/thing.js", TR_FILES["src/thing.js"])),
    after: trStub(1),
  }, { files: TR_FILES, git: true });
  const trSameRun = run(trSame, ["rewrite", "after"]);
  const trSameGate = trSameRun.byGate["tests-rewrite"];
  check(trSameRun.exit === 0 && trSameGate && trSameGate.treeChanged === 0
    && trSameGate.counts.exitCode === 0 && trSameRun.byGate["tests-after"]
    && trSameRun.files.length === 2,
    "9c THE CONTROL: the same gate writing the bytes that were already there moved nothing and"
    + " the chain ran on - exit " + trSameRun.exit + ", treeChanged "
    + (trSameGate && trSameGate.treeChanged) + ", " + trSameRun.files.length + " line(s). The"
    + " guard follows the CONTENT, not the writing");

  /* 9d THE FALSE GREEN, which is the failure this section exists for. */
  check(trMovedGate && trSameGate && trMovedGate.counts.ok === trSameGate.counts.ok
    && trMovedGate.counts.fail === trSameGate.counts.fail
    && trMovedGate.counts.lines === trSameGate.counts.lines
    && trSameGate.counts.exitCode === 0 && trMovedGate.counts.exitCode === 78,
    "9d THE POINT: the corrupted run's counts are IDENTICAL to the clean run's ("
    + JSON.stringify(trMovedGate && { ok: trMovedGate.counts.ok, fail: trMovedGate.counts.fail,
      lines: trMovedGate.counts.lines })
    + " on both), so a reader who reads the tally reads a pass. The one thing that tells them"
    + " apart is the verdict inside the counts, " + (trSameGate && trSameGate.counts.exitCode)
    + " against " + (trMovedGate && trMovedGate.counts.exitCode) + ". A guard that only printed a"
    + " warning dies on this leg");

  /* 9e every mover is named, and the three ways a tree moves are all moves. */
  const trChurn = makeLab("tree-three", {
    churn: trStub(2, trWrites("src/thing.js", "export const a = 3;\n") + NL
      + trRemoves("src/gone.js") + NL + trWrites("src/new.js", "export const c = 3;\n")),
  }, { files: Object.assign({ "src/gone.js": "export const b = 1;\n" }, TR_FILES), git: true });
  const trChurnRun = run(trChurn, ["churn"]);
  const trChurnGate = trChurnRun.byGate["tests-churn"];
  check(trChurnRun.exit === 78 && trChurnGate && trChurnGate.treeChanged === 3
    && /src\/thing\.js/.test(trChurnRun.out) && /src\/gone\.js \(vanished\)/.test(trChurnRun.out)
    && /src\/new\.js \(appeared\)/.test(trChurnRun.out),
    "9e a changed file, a deleted one and a new one are three movers and all three are named in"
    + " the refusal: treeChanged " + (trChurnGate && trChurnGate.treeChanged) + ", exit "
    + trChurnRun.exit);

  /* 9f THE CONTROL on the false-refusal side: an IGNORED path is not the tree a gate judges. A
     gate writing its scratch into the repository is untidy, not a corrupted run, and a guard
     that could not tell the two apart would have to be switched off on the first gate that did. */
  const trIgnored = makeLab("tree-ignored", {
    scratch: trStub(3, trWrites("junk/x.txt", "scratch\n")),
    after: trStub(1),
  }, { files: TR_FILES, git: true });
  const trIgnoredRun = run(trIgnored, ["scratch", "after"]);
  const trIgnoredGate = trIgnoredRun.byGate["tests-scratch"];
  check(trIgnoredRun.exit === 0 && trIgnoredGate && trIgnoredGate.treeChanged === 0
    && trIgnoredGate.treeFiles === 6 && trIgnoredRun.files.length === 2,
    "9f THE CONTROL: a gate writing into a path .gitignore covers moved nothing the guard is"
    + " looking at - exit " + trIgnoredRun.exit + ", treeChanged "
    + (trIgnoredGate && trIgnoredGate.treeChanged) + " over "
    + (trIgnoredGate && trIgnoredGate.treeFiles) + " file(s), against the same write to src/ in"
    + " 9e which is a refusal");

  /* 9g THE OTHER CODE PATH. A lab with no git at all - a `git archive | tar -x` lab is exactly
     this - falls back to a walk, and a leg driven only against the git method would never have
     touched it. Both arms are in one lab: the first gate is quiet, the second moves the tree. */
  const trWalk = makeLab("tree-walk", {
    quiet: trStub(2),
    mutate: trStub(3, trWrites("src/thing.js", "export const a = 4;\n")),
    after: trStub(1),
  }, { files: TR_FILES, git: false });
  const trWalkRun = run(trWalk, ["quiet", "mutate", "after"]);
  const trWalkQuiet = trWalkRun.byGate["tests-quiet"];
  const trWalkMoved = trWalkRun.byGate["tests-mutate"];
  check(trWalkRun.exit === 78 && trWalkQuiet && trWalkQuiet.treeHow === TR_WALK_HOW
    && trWalkQuiet.treeChanged === 0 && trWalkQuiet.treeFiles === 7 && trWalkMoved
    && trWalkMoved.treeHow === TR_WALK_HOW && trWalkMoved.treeChanged === 1
    && trWalkMoved.counts.exitCode === 78 && trWalkMoved.gateExit === 0
    && !trWalkRun.byGate["tests-after"],
    "9g a lab with no git is fingerprinted by a walk and caught the same way: treeHow "
    + JSON.stringify(trWalkQuiet && trWalkQuiet.treeHow) + " over "
    + (trWalkQuiet && trWalkQuiet.treeFiles) + " file(s), quiet gate treeChanged "
    + (trWalkQuiet && trWalkQuiet.treeChanged) + ", moving gate "
    + (trWalkMoved && trWalkMoved.treeChanged) + ", chain exit " + trWalkRun.exit);

  /* ---- 10. THE DEFAULT RUNS FOLDER -------------------------------------------------------------- */
  /* Every leg above names ETIUDA_RUNS, so none of them ever saw the default, which until
     2026-09-23 was a literal absolute path on one machine. The default is now `etiuda-runs`
     beside the MAIN working tree, and the claim that could be wrong is that a worktree living
     somewhere else still writes beside the main tree, as every worktree did under the literal.
     So the tool runs from a worktree in <root>/away/wt of a repository at <root>/lab, and the
     line must land in <root>/etiuda-runs and not in <root>/away/etiuda-runs. The second arm is
     a lab with no git at all, where ROOT stands in for the main tree. The old literal wrote to
     neither and a default beside ROOT writes to the wrong one, so both fail this leg; both were
     run against it on 2026-09-23. Nothing leaves the lab's root. */
  const bareEnv = Object.assign({}, process.env);
  for (const k of Object.keys(bareEnv)) if (k.toUpperCase() === "ETIUDA_RUNS") delete bareEnv[k];
  const runBare = (cwd, names) => {
    const r = spawnSync(process.execPath, [path.join(cwd, "tools", "gate-run.mjs")].concat(names),
      { cwd, encoding: "utf8", env: bareEnv, timeout: 60000 });
    return { exit: r.status, out: String(r.stdout || "") + String(r.stderr || "") };
  };
  const jsonIn = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".json")).length : 0;
  const dfRepo = makeLab("default-wt", { "default-runs-probe": prints(2, 0) }, { git: true });
  const dfWt = path.join(dfRepo.root, "away", "wt");
  const dfAdd = spawnSync("git", ["worktree", "add", "-q", "--orphan", "-b", "lab-wt", dfWt],
    { cwd: dfRepo.lab, encoding: "utf8", timeout: 30000 });
  for (const rel of ["tools", "tests", "package.json"])
    if (dfAdd.status === 0) fs.cpSync(path.join(dfRepo.lab, rel), path.join(dfWt, rel), { recursive: true });
  const dfWtRun = dfAdd.status === 0 ? runBare(dfWt, ["default-runs-probe"]) : { exit: null, out: String(dfAdd.stderr) };
  const dfBeside = jsonIn(path.join(dfRepo.root, "etiuda-runs"));
  const dfAway = jsonIn(path.join(dfRepo.root, "away", "etiuda-runs"));
  const dfPlain = makeLab("default-plain", { "default-runs-probe": prints(2, 0) });
  const dfPlainRun = runBare(dfPlain.lab, ["default-runs-probe"]);
  const dfPlainBeside = jsonIn(path.join(dfPlain.root, "etiuda-runs"));
  check(dfAdd.status === 0 && dfWtRun.exit === 0 && dfBeside === 1 && dfAway === 0
    && dfPlainRun.exit === 0 && dfPlainBeside === 1,
    "10a with ETIUDA_RUNS unset, a worktree away from its main tree writes its line beside the"
    + " MAIN tree (" + dfBeside + " there, " + dfAway + " beside the worktree, exit " + dfWtRun.exit
    + (dfAdd.status === 0 ? "" : ", worktree not made: " + String(dfAdd.stderr).trim())
    + "), and a lab with no git writes beside itself (" + dfPlainBeside + ", exit "
    + dfPlainRun.exit + ")");

  if (!KEEP) for (const dir of labs) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* held */ }
  } else process.stdout.write("--keep: labs at " + labs.join(", ") + "\n");

  check(asserted + 1 === EXPECTED,
    "11 every leg ran: " + (asserted + 1) + " of " + EXPECTED + " assertion(s)");
  process.stdout.write("#counts asserted=" + asserted + " failures=" + failed + "\n");
  process.stdout.write("result-line: " + asserted + " assertion(s), " + failed + " failure(s)\n");
  process.exit(failed ? 1 : 0);
}

main();
