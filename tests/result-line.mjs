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
import { WINDOWS_VAR } from "./engine.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TOOL = path.join(ROOT, "tools", "gate-run.mjs");
/* These legs set the plant switch and the profile themselves, arm by arm. Run inside an area run, this file inherits
   ETIUDA_PLANTS=off from it, and a "plants on" arm would then run with them off (17a went red that way, 2026-10-28). */
delete process.env.ETIUDA_PLANTS;
delete process.env.ETIUDA_PROFILE;
const KEEP = process.argv.indexOf("--keep") > -1;
/* The floor: every leg below runs, or the suite says it did not complete rather than passing
   with half of itself skipped by an early return. One leg is platform-bound: where a short
   path cannot be made it prints SKIP, and the floor counts that skip so both runs still meet it. */
const EXPECTED = 85;

let asserted = 0, failed = 0, skipped = 0;
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stderr.write("  FAIL " + line + "\n"); }
}
/* A skip is not a pass. Only the short-path leg uses it, and only where the platform
   cannot make the spelling that leg exists to drive. */
function skip(why) { skipped++; process.stdout.write("  SKIP  " + why + "\n"); }

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
  /* gate-run takes its lock through tools/machine-lock.mjs, so a lab carries it too. */
  fs.copyFileSync(path.join(ROOT, "tools", "machine-lock.mjs"), path.join(lab, "tools", "machine-lock.mjs"));
  if (opts && opts.gatesFor && fs.existsSync(path.join(ROOT, "tools", "gates-for.mjs"))) {
    fs.copyFileSync(path.join(ROOT, "tools", "gates-for.mjs"), path.join(lab, "tools", "gates-for.mjs"));
  }
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
function run(l, names, cwd, extraEnv) {
  const at = cwd || l.lab;
  const r = spawnSync(process.execPath, [path.join(at, "tools", "gate-run.mjs")].concat(names), {
    cwd: at,
    encoding: "utf8",
    /* Every lab run writes its chains line into the lab, never into the office's Workspace/etiuda-runs/chains.jsonl: a lab
       tree is the same at every run, so a line left there would let the area run's equal-tree rule skip the next run's work. */
    env: Object.assign({}, process.env, { ETIUDA_RUNS: l.runs, ETIUDA_CHAINS_PATH: path.join(path.dirname(l.runs), "chains.jsonl") }, extraEnv),
    timeout: 60000,
  });
  const byGate = {};
  const files = fs.existsSync(l.runs) ? fs.readdirSync(l.runs).filter(f => f.endsWith(".json")) : [];
  for (const f of files.sort()) {
    try {
      const line = JSON.parse(fs.readFileSync(path.join(l.runs, f), "utf8"));
      byGate[line.gate] = line;
    } catch (e) {}
  }
  return { exit: r.status, out: String(r.stdout || "") + String(r.stderr || ""), byGate, files };
}

/* THE ASSERTIONS THE CONTROL TURNS AGAINST ITSELF. Each takes a result line and the numbers the
   lab planted, and each is used twice: once where the planted numbers are true, and once where
   the mutation made them false. A leg's teeth are the second use returning false. */
const derivedSays = (line, ok, bad, lines) => !!line && line.countsFrom === "ok/FAIL lines"
  && line.counts.ok === ok && line.counts.fail === bad && line.counts.lines === lines;
const declaredSays = (line, key, value) => !!line && line.counts[key] === value;

async function main() {
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
    && "commit" in dBase && "dirty" in dBase && dBase.refused === ""
    && Object.keys(dBase).sort().join(",")
       === "clash,cmd,commit,counts,countsFrom,dirty,exit,gate,gateExit,gitTree,refused,run,script,time,treeChanged,treeFiles,treeHash,treeHow,unmerged,wallMs",
    "1d the line's shape is the twenty keys the record reads (`run` the start of the run it belongs to), `refused` empty on a gate that refused nothing, gate named from the step's path: "
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
  const TR_WALK_HOW = "walk skipping .git, node_modules and .plant-hold";
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

  /* 9a a quiet run carries the fingerprint, and both gates carry the same one. A lab holds tools/machine-lock.mjs beside
     gate-run since the lock moved there (2026-10-28), so its file counts are one more than before. */
  const trQuiet = makeLab("tree-quiet", { one: trStub(3), two: trStub(2) },
    { files: TR_FILES, git: true });
  const trQuietRun = run(trQuiet, ["one", "two"]);
  const trQuietOne = trQuietRun.byGate["tests-one"], trQuietTwo = trQuietRun.byGate["tests-two"];
  check(trQuietRun.exit === 0 && trQuietOne && trQuietTwo && trQuietOne.treeChanged === 0
    && trQuietTwo.treeChanged === 0 && trQuietOne.treeHow === TR_GIT_HOW
    && /^[0-9a-f]{16}$/.test(trQuietOne.treeHash) && trQuietOne.treeHash === trQuietTwo.treeHash
    && trQuietOne.treeFiles === 7 && trQuietOne.gateExit === 0,
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

  /* 9h A GATE'S OWN NO VERDICT IS NOT BLAMED ON THE TREE (board 820). The same exit, 78, with a
     tree that did not move: the summary must name the gate's exit and must not say the tree moved,
     while 9b's run, where it did move, must say so. Both halves, so a summary that says one thing
     for every 78 fails one of them. */
  const trOwn = makeLab("tree-own-78", { refuses: 'console.log("  FAIL refused");' + NL + "process.exit(78);" + NL, after: trStub(1) },
    { files: TR_FILES, git: true });
  const trOwnRun = run(trOwn, ["refuses", "after"]);
  const trOwnGate = trOwnRun.byGate["tests-refuses"];
  const summaryOf = r => (r.out.split(/\r?\n/).filter(l => /^gate-run: \d+ of \d+ gate/.test(l)).pop() || "");
  check(trOwnRun.exit === 78 && trOwnGate && trOwnGate.treeChanged === 0 && !trOwnRun.byGate["tests-after"]
    && /stopped at a gate exiting 78/.test(summaryOf(trOwnRun)) && !/tree moved/.test(summaryOf(trOwnRun))
    && /NO VERDICT: the tree moved under a gate/.test(summaryOf(trMovedRun)),
    "9h a gate exiting 78 over a tree that did not move is summed up as its own exit, not as a moved tree: "
    + JSON.stringify(summaryOf(trOwnRun)) + ", against 9b's " + JSON.stringify(summaryOf(trMovedRun)));

  /* 9i A WALL'S REFUSAL IS RECORDED AS ONE. 9h's gate with one line added, `#refused window-wall`:
     the record names the wall and the summary says refused and not failed, where 9h's twin records
     an empty name and says neither. */
  const trWall = makeLab("tree-wall-78", { refuses: 'console.log("#refused window-wall");' + NL
    + 'console.log("  FAIL refused");' + NL + "process.exit(78);" + NL, after: trStub(1) },
    { files: TR_FILES, git: true });
  const trWallRun = run(trWall, ["refuses", "after"]);
  const trWallGate = trWallRun.byGate["tests-refuses"];
  check(trWallRun.exit === 78 && !!trWallGate && trWallGate.refused === "window-wall" && trWallGate.exit === 78
    && trWallGate.counts.exitCode === 78 && !trWallRun.byGate["tests-after"]
    && /stopped at tests-refuses, REFUSED by the window-wall and not failed/.test(summaryOf(trWallRun))
    && !!trOwnGate && trOwnGate.refused === "" && !/REFUSED/.test(summaryOf(trOwnRun)),
    "9i a gate refusing by a named wall is recorded as refused (" + JSON.stringify(trWallGate && trWallGate.refused)
    + ", exit " + (trWallGate && trWallGate.exit) + ") and summed up as " + JSON.stringify(summaryOf(trWallRun))
    + "; 9h's twin without the line records " + JSON.stringify(trOwnGate && trOwnGate.refused) + " and says no REFUSED");

  /* 9j THE MARKER WITHOUT THE REFUSAL. 9i's gate with exit 0 in place of 78, as a gate that echoes a
     child's marker and passes: not recorded as refused, and the chain goes on. */
  const trEcho = makeLab("tree-wall-echo", { refuses: 'console.log("#refused window-wall");' + NL
    + 'console.log("  ok   echoed");' + NL + "process.exit(0);" + NL, after: trStub(1) },
    { files: TR_FILES, git: true });
  const trEchoRun = run(trEcho, ["refuses", "after"]);
  const trEchoGate = trEchoRun.byGate["tests-refuses"];
  check(trEchoRun.exit === 0 && !!trEchoGate && trEchoGate.refused === "" && !!trEchoRun.byGate["tests-after"]
    && !/REFUSED/.test(summaryOf(trEchoRun)),
    "9j a gate printing the marker and exiting 0 is recorded with refused " + JSON.stringify(trEchoGate && trEchoGate.refused)
    + " and the chain ran on: " + JSON.stringify(summaryOf(trEchoRun).replace(/^.*, tree /, "tree ")));

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
    && trIgnoredGate.treeFiles === 7 && trIgnoredRun.files.length === 2,
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
    && trWalkQuiet.treeChanged === 0 && trWalkQuiet.treeFiles === 8 && trWalkMoved
    && trWalkMoved.treeHow === TR_WALK_HOW && trWalkMoved.treeChanged === 1
    && trWalkMoved.counts.exitCode === 78 && trWalkMoved.gateExit === 0
    && !trWalkRun.byGate["tests-after"],
    "9g a lab with no git is fingerprinted by a walk and caught the same way: treeHow "
    + JSON.stringify(trWalkQuiet && trWalkQuiet.treeHow) + " over "
    + (trWalkQuiet && trWalkQuiet.treeFiles) + " file(s), quiet gate treeChanged "
    + (trWalkQuiet && trWalkQuiet.treeChanged) + ", moving gate "
    + (trWalkMoved && trWalkMoved.treeChanged) + ", chain exit " + trWalkRun.exit);

  /* 9k AN UNMERGED INDEX (2026-10-04). Mid-merge, `git ls-files -c` lists a conflicted path once
     per stage, so until then the fingerprint took its bytes three times and the record's hash
     matched no commit, even where the resolved bytes on disk were exactly the ones committed next:
     the round-two engine merge's 52 records had to be tied to their commit by hand. The lab is a
     two-branch conflict on one file, resolved on disk and not staged, and the gate runs over it;
     then the resolution is committed and the gate runs again. The first record must carry the
     second's hash and file count and say how many paths were unmerged; the second says none. */
  const trMerge = makeLab("tree-unmerged", { quiet: trStub(2), edits: trStub(1, trWrites("src/both.js", "export const v = 4;\n")) },
    { files: Object.assign({ "src/both.js": "export const v = 0;\n" }, TR_FILES), git: true });
  const mgEnv = Object.assign({}, process.env, { GIT_EDITOR: "true", GIT_MERGE_AUTOEDIT: "no" });
  const mg = args => spawnSync("git", args, { cwd: trMerge.lab, encoding: "utf8", timeout: 30000, env: mgEnv });
  const mgPut = text => fs.writeFileSync(path.join(trMerge.lab, "src", "both.js"), text);
  const mgSteps = [];
  const mgOk = args => { const r = mg(args); mgSteps.push(args[0] + ":" + r.status); return r.status === 0; };
  let mgBase = "";
  const mgBuilt = mgOk(["config", "core.autocrlf", "false"]) && mgOk(["config", "user.name", "lab"])
    && mgOk(["config", "user.email", "lab@example.invalid"]) && mgOk(["config", "commit.gpgsign", "false"])
    && mgOk(["add", "-A"]) && mgOk(["commit", "-q", "-m", "base"])
    && !!(mgBase = String(mg(["symbolic-ref", "--short", "HEAD"]).stdout || "").trim())
    && mgOk(["checkout", "-q", "-b", "side"]) && (mgPut("export const v = 1;\n"), mgOk(["commit", "-q", "-am", "side"]))
    && mgOk(["checkout", "-q", mgBase]) && (mgPut("export const v = 2;\n"), mgOk(["commit", "-q", "-am", "base two"]));
  const mgConflict = mgBuilt && mg(["merge", "-q", "side"]).status === 1;
  const mgStages = mgConflict ? String(mg(["ls-files", "-u"]).stdout || "").trim().split(/\r?\n/).filter(Boolean).length : 0;
  if (mgConflict) mgPut("export const v = 3;\n");
  const mgOpen = mgConflict ? run(trMerge, ["quiet"]) : { exit: null, out: "", byGate: {} };
  const mgOpenLine = mgOpen.byGate["tests-quiet"];
  const mgCommitted = mgConflict && mgOk(["add", "src/both.js"]) && mgOk(["commit", "-q", "-m", "merged"]);
  for (const f of fs.readdirSync(trMerge.runs)) fs.renameSync(path.join(trMerge.runs, f), path.join(trMerge.root, "open-" + f));
  const mgShut = mgCommitted ? run(trMerge, ["quiet"]) : { exit: null, out: "", byGate: {} };
  const mgShutLine = mgShut.byGate["tests-quiet"];
  check(mgConflict && mgStages === 3 && mgOpen.exit === 0 && !!mgOpenLine && !!mgShutLine
    && mgOpenLine.unmerged === 1 && mgShutLine.unmerged === 0
    && mgOpenLine.treeHash === mgShutLine.treeHash && mgOpenLine.treeFiles === mgShutLine.treeFiles
    && mgOpenLine.counts.exitCode === 0 && mgOpenLine.treeChanged === 0,
    "9k a run over an unmerged index fingerprints each path once, so its record carries the hash of the"
    + " commit that resolution became (" + (mgOpenLine && mgOpenLine.treeHash) + " over "
    + (mgOpenLine && mgOpenLine.treeFiles) + " file(s), against " + (mgShutLine && mgShutLine.treeHash) + " over "
    + (mgShutLine && mgShutLine.treeFiles) + " after the commit), and says it: unmerged "
    + (mgOpenLine && mgOpenLine.unmerged) + " then " + (mgShutLine && mgShutLine.unmerged) + "; the lab "
    + (mgConflict ? "conflicted on " + mgStages + " stage(s)" : "did not conflict: " + mgSteps.join(" ")));
  check(/UNMERGED/.test(mgOpen.out) && !/UNMERGED/.test(mgShut.out) && !!trQuietOne && trQuietOne.unmerged === 0
    && !!trWalkQuiet && trWalkQuiet.unmerged === 0,
    "9l the run over the unmerged index says so on its own line and the committed run does not; a tree"
    + " with nothing unmerged records 0 by git (9a: " + (trQuietOne && trQuietOne.unmerged) + ") and by the walk (9g: "
    + (trWalkQuiet && trWalkQuiet.unmerged) + ")");

  /* 9m GIT'S TREE ID IN THE RECORD (2026-10-12). `treeHash` is this tool's own fingerprint and
     never equals `git rev-parse <commit>^{tree}`, which is what section 6's identical-tree rule
     names, so a merge's gate record could not be tied to its commit without recomputing the
     fingerprint by hand. The record now carries `gitTree`. Three arms already built above: the
     committed merge must carry exactly the lab's HEAD^{tree}; the run over the unresolved merge,
     whose working tree differs from HEAD, must say "uncommitted changes" and never lend HEAD's id;
     the lab with no git must say "no git". A fourth arm runs, over the committed merge, a gate
     that edits a tracked file: its record must say "uncommitted changes", because the id is read
     AFTER the gate. A tool that printed HEAD's id whatever the working tree held fails the second
     arm; one that read the id once at the start fails the fourth. */
  const mgHeadTree = mgCommitted ? String(mg(["rev-parse", "HEAD^{tree}"]).stdout || "").trim() : "";
  const mgEdit = mgCommitted ? run(trMerge, ["edits"]) : { exit: null, out: "", byGate: {} };
  const mgEditLine = mgEdit.byGate["tests-edits"];
  check(/^[0-9a-f]{40}$/.test(mgHeadTree) && !!mgShutLine && mgShutLine.gitTree === mgHeadTree
    && !!mgOpenLine && mgOpenLine.gitTree === "uncommitted changes"
    && !!trWalkQuiet && trWalkQuiet.gitTree === "no git"
    && !!mgEditLine && mgEditLine.treeChanged === 1 && mgEditLine.gitTree === "uncommitted changes"
    && /git tree uncommitted changes/.test(mgOpen.out)
    && mgShut.out.split(/\r?\n/).some(l => l.includes("gate-run: tests-quiet-")
      && l.includes(", tree " + mgShutLine.treeHash + ", git tree " + mgHeadTree))
    && mgShut.out.split(/\r?\n/).some(l => l.startsWith("gate-run: tree ") && l.endsWith("; git tree " + mgHeadTree))
    && mgShut.out.split(/\r?\n/).some(l => / gate\(s\) run from /.test(l) && l.includes(", git tree " + mgHeadTree + ", ")),
    "9m each record carries git's tree id or why it has none: committed " + (mgShutLine && mgShutLine.gitTree)
    + " against HEAD^{tree} " + (mgHeadTree || "(not read)") + ", over the unresolved merge "
    + JSON.stringify(mgOpenLine && mgOpenLine.gitTree) + ", with no git " + JSON.stringify(trWalkQuiet && trWalkQuiet.gitTree)
    + ", after a gate that edited a tracked file " + JSON.stringify(mgEditLine && mgEditLine.gitTree)
    + "; the opening, step and closing lines each carry the git tree");

  /* 9n WHERE GIT ANSWERS ABOUT OTHER FILES (Clément δ's same-seat read, 2026-10-12). Three states
     in which a plain `git status --porcelain` is empty while the files the gate read differ from
     HEAD, each of which once lent HEAD's tree id: a tracked file edited under assume-unchanged; an
     untracked file under `status.showUntrackedFiles=no`; and a lab with no git of its own sitting
     in a repository's ignored folder, which must say "no git" as its walk does. A clean run of the
     same repository first must carry HEAD's id, so the three cannot pass by a tool that always
     says "uncommitted changes". */
  const hid = makeLab("tree-hidden", { h0: trStub(1), h1: trStub(1), h2: trStub(1) },
    { files: Object.assign({}, TR_FILES, { ".gitignore": "junk/\nscratch/\n" }), git: true });
  const hg = args => spawnSync("git", args, { cwd: hid.lab, encoding: "utf8", timeout: 30000 });
  const hgOk = args => hg(args).status === 0;
  const hidBuilt = hgOk(["config", "core.autocrlf", "false"]) && hgOk(["config", "user.name", "lab"])
    && hgOk(["config", "user.email", "lab@example.invalid"]) && hgOk(["config", "commit.gpgsign", "false"])
    && hgOk(["add", "-A"]) && hgOk(["commit", "-q", "-m", "base"]);
  const hidHead = hidBuilt ? String(hg(["rev-parse", "HEAD^{tree}"]).stdout || "").trim() : "";
  const hidClean = hidBuilt ? run(hid, ["h0"]).byGate["tests-h0"] : null;
  const hidThing = path.join(hid.lab, "src", "thing.js");
  const hidAssumed = hidBuilt && hgOk(["update-index", "--assume-unchanged", "src/thing.js"])
    && (fs.writeFileSync(hidThing, "export const a = 9;\n"), String(hg(["status", "--porcelain"]).stdout || "") === "");
  const hidOne = hidAssumed ? run(hid, ["h1"]).byGate["tests-h1"] : null;
  const hidReset = hidBuilt && hgOk(["update-index", "--no-assume-unchanged", "src/thing.js"])
    && hgOk(["checkout", "--", "src/thing.js"]) && hgOk(["config", "status.showUntrackedFiles", "no"]);
  const hidHidden = hidReset && (fs.writeFileSync(path.join(hid.lab, "src", "new.js"), "export const b = 1;\n"),
    String(hg(["status", "--porcelain"]).stdout || "") === "");
  const hidTwo = hidHidden ? run(hid, ["h2"]).byGate["tests-h2"] : null;
  const inner = makeLab("tree-hidden-inner", { h3: trStub(1) }, { files: { "src/thing.js": "export const a = 1;\n" } });
  const innerAt = path.join(hid.lab, "scratch", "inner");
  fs.mkdirSync(path.join(hid.lab, "scratch"), { recursive: true });
  fs.renameSync(inner.lab, innerAt);
  const innerLine = run({ lab: innerAt, runs: inner.runs }, ["h3"]).byGate["tests-h3"];
  check(/^[0-9a-f]{40}$/.test(hidHead) && !!hidClean && hidClean.gitTree === hidHead
    && hidAssumed && !!hidOne && hidOne.gitTree === "uncommitted changes"
    && hidHidden && !!hidTwo && hidTwo.gitTree === "uncommitted changes"
    && !!innerLine && innerLine.treeHow === TR_WALK_HOW && innerLine.gitTree === "no git",
    "9n where a plain status sees nothing, the record still lends no id: clean " + (hidClean && hidClean.gitTree)
    + " against HEAD^{tree} " + (hidHead || "(not read)") + "; assume-unchanged edit "
    + JSON.stringify(hidOne && hidOne.gitTree) + (hidAssumed ? "" : " (state not made)") + "; untracked under"
    + " showUntrackedFiles=no " + JSON.stringify(hidTwo && hidTwo.gitTree) + (hidHidden ? "" : " (state not made)")
    + "; a lab with no git in an ignored folder " + JSON.stringify(innerLine && innerLine.gitTree) + " by "
    + JSON.stringify(innerLine && innerLine.treeHow));

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

  /* 9o A SHORT SPELLING IS STILL THE LAB'S OWN TREE. git names the folder in long form;
     a temp path may be its 8.3 short name. Through that short name the record must carry
     HEAD^{tree} and a worktree's line must land beside the main tree. The planted arm
     puts the string compare back and must say "no git". Where no short name can be made,
     the leg skips and says why. */
  if (process.platform !== "win32") {
    skip("9o a short path is a Windows spelling of a folder, and this run is on " + process.platform);
  } else {
    const shortOf = (p) => {
      const r = spawnSync("cmd.exe", ["/d", "/c", "for %I in (\"" + p + "\") do @echo %~sI"], {
        encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true, timeout: 15000,
      });
      const line = String(r.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop() || "";
      return r.status === 0 ? line : "";
    };
    const spell = (s) => String(s || "").replace(/\//g, "\\").replace(/\\+$/g, "").toLowerCase();
    const own = makeLab("short-own", { quiet: prints(1, 0) },
      { files: { "src/thing.js": "export const a = 1;\n" }, git: true });
    const og = (args) => spawnSync("git", args, { cwd: own.lab, encoding: "utf8", timeout: 30000 });
    const ogOk = (args) => og(args).status === 0;
    const ownBuilt = ogOk(["config", "core.autocrlf", "false"]) && ogOk(["config", "user.name", "lab"])
      && ogOk(["config", "user.email", "lab@example.invalid"]) && ogOk(["config", "commit.gpgsign", "false"])
      && ogOk(["add", "-A"]) && ogOk(["commit", "-q", "-m", "base"]);
    const ownHead = ownBuilt ? String(og(["rev-parse", "HEAD^{tree}"]).stdout || "").trim() : "";
    const ownShort = ownBuilt ? shortOf(own.lab) : "";
    if (!ownBuilt) {
      check(false, "9o the lab was not committed, so the short path was not driven");
    } else if (!ownShort || spell(ownShort) === spell(own.lab)) {
      skip("9o this volume gave the lab no short name distinct from its long path"
        + (ownShort ? ": " + ownShort : ", and the short name was not read"));
    } else {
      const ownRun = run(own, ["quiet"], ownShort);
      const ownLine = ownRun.byGate["tests-quiet"];
      const wt = makeLab("short-wt", { "default-runs-probe": prints(2, 0) }, { git: true });
      const wtDir = path.join(wt.root, "away", "wt");
      const wtAdd = spawnSync("git", ["worktree", "add", "-q", "--orphan", "-b", "lab-wt", wtDir],
        { cwd: wt.lab, encoding: "utf8", timeout: 30000 });
      if (wtAdd.status === 0) {
        for (const rel of ["tools", "tests", "package.json"])
          fs.cpSync(path.join(wt.lab, rel), path.join(wtDir, rel), { recursive: true });
      }
      const wtShort = wtAdd.status === 0 ? shortOf(wtDir) : "";
      const wtDistinct = !!wtShort && spell(wtShort) !== spell(wtDir);
      const wtRun = wtDistinct ? runBare(wtShort, ["default-runs-probe"]) : { exit: null, out: "" };
      const wtBeside = jsonIn(path.join(wt.root, "etiuda-runs"));
      const wtAway = jsonIn(path.join(wt.root, "away", "etiuda-runs"));
      const toolAt = path.join(own.lab, "tools", "gate-run.mjs");
      const toolSrc = fs.readFileSync(toolAt, "utf8");
      const gitLine = "if (!top || !sameFolder(top, ROOT)) return \"no git\";";
      const gitOld = "if (!top || path.relative(path.resolve(top), ROOT) !== \"\") return \"no git\";";
      const mainLine = "if (!top || !common || !sameFolder(top, ROOT)) return ROOT;";
      const mainOld = "if (!top || !common || path.relative(path.resolve(top), ROOT) !== \"\") return ROOT;";
      const planted = toolSrc.includes(gitLine) && toolSrc.includes(mainLine)
        ? toolSrc.replace(gitLine, gitOld).replace(mainLine, mainOld) : "";
      if (planted) fs.writeFileSync(toolAt, planted);
      for (const f of fs.readdirSync(own.runs)) {
        if (f.endsWith(".json")) fs.renameSync(path.join(own.runs, f), path.join(own.root, "kept-" + f));
      }
      const plantRun = planted ? run(own, ["quiet"], ownShort) : { byGate: {} };
      const plantLine = plantRun.byGate["tests-quiet"];
      check(ownRun.exit === 0 && /^[0-9a-f]{40}$/.test(ownHead) && !!ownLine && ownLine.gitTree === ownHead
        && wtAdd.status === 0 && wtDistinct && wtRun.exit === 0 && wtBeside === 1 && wtAway === 0
        && !!planted && !!plantLine && plantLine.gitTree === "no git",
        "9o a short spelling is the lab's own tree: git tree " + JSON.stringify(ownLine && ownLine.gitTree)
        + " against HEAD^{tree} " + (ownHead || "(not read)")
        + "; the worktree wrote " + wtBeside + " beside the main tree and " + wtAway + " beside itself (exit "
        + wtRun.exit + (wtAdd.status === 0 ? "" : ", worktree not made")
        + (wtDistinct ? "" : ", short name not distinct") + ")"
        + "; the string compare put back says " + JSON.stringify(plantLine && plantLine.gitTree));
    }
  }

  /* ---- 12. A MARKED FILE RUNS AFTER THE OTHERS, AND THE MARKER IS SPELT ---------------------- */
  /* The marker is one line, ALONE below, in the first 15 lines of a test file. gate-run reads
     it and moves that file after every file without it, then names the file in the log. A near
     miss is not a marker: the runner leaves the file where it is, and this gate refuses the
     near miss. With no marker the commands stay in chain order and the log gains nothing. */
  const ALONE = "/* run: alone (timing) */";
  const ALONE_SHAPED = /^\/\*[ \t]*run:[ \t]*alone\b.*\*\/$/;
  const ALONE_SLASH = /^\/\/[ \t]*run:[ \t]*alone\b/;
  function markerFaults(text) {
    const faults = [];
    const lines = String(text).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t === ALONE) {
        if (i >= 15) faults.push("line " + (i + 1) + " sits past the first 15 lines");
        continue;
      }
      if (ALONE_SHAPED.test(t) || ALONE_SLASH.test(t)) faults.push("line " + (i + 1) + " is misspelt");
    }
    return faults;
  }
  function commandLines(out) {
    return String(out).split(/\r?\n/).filter(l => l.startsWith("> ")).map(l => l.slice(2));
  }
  const say = (n) => 'console.log("ran ' + n + '");\nprocess.exit(0);\n';
  function chainLab(kind, names, bodies) {
    const stubs = {};
    for (const n of names) stubs[n] = bodies[n];
    const l = makeLab(kind, stubs);
    const pkg = JSON.parse(fs.readFileSync(path.join(l.lab, "package.json"), "utf8"));
    pkg.scripts = { chain: names.map(n => "node tests/" + n + ".mjs").join(" && ") };
    fs.writeFileSync(path.join(l.lab, "package.json"), JSON.stringify(pkg) + "\n");
    return l;
  }

  const marked = chainLab("alone", ["early", "timed", "late"], {
    early: say("early"),
    timed: ALONE + "\n" + say("timed"),
    late: say("late"),
  });
  const markedRun = run(marked, ["chain"]);
  const markedOrder = commandLines(markedRun.out);
  const aloneLine = markedRun.out.split(/\r?\n/).filter(l => l.indexOf("run after the rest") >= 0);
  check(markedOrder.join(" | ") === "node tests/early.mjs | node tests/late.mjs | node tests/timed.mjs"
    && aloneLine.length === 1 && aloneLine[0] === "gate-run: tests/timed.mjs run after the rest of its list (not alone on the machine)"
    && markedRun.out.indexOf("ran timed") >= 0 && markedRun.exit === 0,
    "12a a marked file runs last and the log names it run after the rest: " + markedOrder.join(" | ")
    + "; alone line " + JSON.stringify(aloneLine) + "; exit " + markedRun.exit);

  const plain = chainLab("alone-plain", ["early", "mid", "late"], {
    early: say("early"),
    mid: "// the word alone in prose is not a marker\n" + say("mid"),
    late: say("late"),
  });
  const plainRun = run(plain, ["chain"]);
  const plainOrder = commandLines(plainRun.out);
  const plainWant = "node tests/early.mjs | node tests/mid.mjs | node tests/late.mjs";
  const toolSrc = fs.readFileSync(path.join(plain.lab, "tools", "gate-run.mjs"), "utf8");
  const unchanged = "if (!any) return list; /* alone: unchanged */";
  const plantedSrc = toolSrc.indexOf(unchanged) >= 0
    ? toolSrc.replace(unchanged, "if (!any) return list.slice().reverse(); /* alone: unchanged */")
    : "";
  let plantOrder = "";
  if (plantedSrc) {
    fs.writeFileSync(path.join(plain.lab, "tools", "gate-run.mjs"), plantedSrc);
    plantOrder = commandLines(run(plain, ["chain"]).out).join(" | ");
  }
  check(plainOrder.join(" | ") === plainWant
    && plainRun.out.indexOf("run after the rest") < 0
    && plantOrder === "node tests/late.mjs | node tests/mid.mjs | node tests/early.mjs",
    "12b with no marker the order is the chain's and the log is unchanged (" + plainOrder.join(" | ")
    + "); reversing the unchanged path runs " + (plantOrder || "nothing, the path was not there"));

  const missText = "/* run: alone */\n";
  const lateText = Array.from({ length: 15 }, (_, i) => "// pad " + (i + 1)).join("\n") + "\n" + ALONE + "\n";
  const missFaults = markerFaults(missText);
  const lateFaults = markerFaults(lateText);
  const exactFaults = markerFaults(ALONE + "\n");
  const treeFaults = [];
  const walkTests = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (fs.statSync(abs).isDirectory()) {
        if (name !== "node_modules") walkTests(abs);
        continue;
      }
      if (!/\.(mjs|js|cjs)$/.test(name)) continue;
      const rel = path.relative(ROOT, abs).split(path.sep).join("/");
      for (const f of markerFaults(fs.readFileSync(abs, "utf8"))) treeFaults.push(rel + " " + f);
    }
  };
  walkTests(path.join(ROOT, "tests"));
  const desk = fs.readFileSync(path.join(ROOT, "tests", "desk-growth.mjs"), "utf8");
  const deskHas = desk.split(/\r?\n/).slice(0, 15).some(l => l.trim() === ALONE);
  const missLab = chainLab("alone-miss", ["early", "bad", "late"], {
    early: say("early"), bad: missText + say("bad"), late: say("late"),
  });
  const missRun = run(missLab, ["chain"]);
  const missOrder = commandLines(missRun.out).join(" | ");
  const lateLab = chainLab("alone-late", ["early", "latefile", "zed"], {
    early: say("early"), latefile: lateText + say("latefile"), zed: say("zed"),
  });
  const lateRun = run(lateLab, ["chain"]);
  const lateOrder = commandLines(lateRun.out).join(" | ");
  check(exactFaults.length === 0
    && missFaults.length === 1 && missFaults[0] === "line 1 is misspelt"
    && lateFaults.length === 1 && lateFaults[0] === "line 16 sits past the first 15 lines"
    && treeFaults.length === 0 && deskHas
    && missOrder === "node tests/early.mjs | node tests/bad.mjs | node tests/late.mjs"
    && missRun.out.indexOf("run after the rest") < 0
    && lateOrder === "node tests/early.mjs | node tests/latefile.mjs | node tests/zed.mjs"
    && lateRun.out.indexOf("run after the rest") < 0,
    "12c a misspelt marker is refused (" + missFaults.join("; ")
    + "), one past line 15 is refused (" + lateFaults.join("; ")
    + "), desk-growth carries it (" + deskHas + "), the tree's faults are "
    + (treeFaults.length ? treeFaults.join("; ") : "none")
    + "; a misspelling stays in place (" + missOrder + ") and so does a late line (" + lateOrder + ")");

  /* ---- 13. THE MACHINE LOCK (rule 13) ---------------------------------------------------- */
  const lockLab = makeLab("lock", {
    heavy: 'import fs from "node:fs";\nconst lp = process.env.ETIUDA_LOCK_PATH;\nconst held = fs.existsSync(lp);\nlet parsed = null;\ntry { parsed = JSON.parse(fs.readFileSync(lp, "utf8")); } catch (e) {}\nconsole.log("HELD " + held + " PID " + (parsed && parsed.pid));\nprocess.exit(0);\n',
  });
  const lockPath = path.join(lockLab.root, "machine.lock");
  const lockRun = run(lockLab, ["heavy"], null, { ETIUDA_LOCK_PATH: lockPath, ETIUDA_HEAVY: "1" });
  const lockAfter = fs.existsSync(lockPath);
  check(lockRun.out.indexOf("HELD true") >= 0 && !lockAfter && lockRun.exit === 0,
    "13a the machine lock is taken exclusively for a heavy run and released at exit: "
    + lockRun.out.trim() + "; lock file exists after exit: " + lockAfter);

  fs.writeFileSync(lockPath, JSON.stringify({
    pid: 99999999, host: os.hostname(), tree: lockLab.lab, what: "stale-run", since: new Date(Date.now() - 7 * 3600000).toISOString()
  }) + "\n");
  const staleRun = run(lockLab, ["heavy"], null, { ETIUDA_LOCK_PATH: lockPath, ETIUDA_HEAVY: "1" });
  check(staleRun.out.indexOf("took over a stale lock") >= 0 && staleRun.exit === 0,
    "13b a stale lock whose pid is dead is taken over and the log names the takeover: "
    + staleRun.out.trim().split(/\r?\n/).filter(l => /lock/i.test(l)).join(" | "));

  fs.writeFileSync(lockPath, JSON.stringify({
    pid: 99999999, host: os.hostname(), tree: lockLab.lab, what: "recent-dead-run", since: new Date(Date.now() - 3600000).toISOString()
  }) + "\n");
  const recentDeadRun = run(lockLab, ["heavy"], null, { ETIUDA_LOCK_PATH: lockPath, ETIUDA_HEAVY: "1", ETIUDA_LOCK_TIMEOUT_MS: "500" });
  check(recentDeadRun.exit === 0 && recentDeadRun.out.indexOf("took over a stale lock") >= 0,
    "13d a dead holder an hour old is taken over at once, whatever its age: exit " + recentDeadRun.exit);

  const gr = await import("../tools/gate-run.mjs");
  const hasStaleFn = typeof gr.isLockStale === "function";
  const deadRecent = hasStaleFn && gr.isLockStale({ pid: 99999999, since: new Date(Date.now() - 3600000).toISOString() });
  const liveOld = hasStaleFn && !gr.isLockStale({ pid: process.pid, since: new Date(Date.now() - 10 * 3600000).toISOString() });
  const reused = hasStaleFn && gr.isLockStale({ pid: process.pid, started: "2001-01-01T00:00:00.0000000Z", since: new Date().toISOString() });
  check(hasStaleFn && deadRecent && liveOld && reused,
    "13e stale only when no process has the holder's pid with its creation time: "
    + (hasStaleFn ? "deadRecent=" + deadRecent + " liveOld=" + liveOld + " reusedPid=" + reused : "isLockStale not exported"));

  try { fs.unlinkSync(lockPath); } catch (e) {}
  const waitRun = run(lockLab, ["wait-lock"], null, { ETIUDA_LOCK_PATH: lockPath });
  check(waitRun.exit === 0,
    "13c wait-lock exits 0 immediately when no lock is held: exit " + waitRun.exit);

  /* ---- 14. chains.jsonl ------------------------------------------------------------------- */
  const chainsLab = makeLab("chains", {
    okgate: prints(2, 0, "process.exit(0);"),
    failgate: prints(1, 1, "process.exit(1);"),
  });
  const chainsPath = path.join(chainsLab.runs, "chains.jsonl");
  const chainsRun1 = run(chainsLab, ["okgate"], null, { ETIUDA_CHAINS_PATH: chainsPath });
  let chainLines = [];
  try { chainLines = fs.readFileSync(chainsPath, "utf8").trim().split(/\r?\n/).map(JSON.parse); } catch (e) {}
  check(chainLines.length === 1 && chainLines[0].gate === "okgate" && chainLines[0].tree
    && chainLines[0].head && chainLines[0].treeSha && chainLines[0].start && chainLines[0].end
    && chainLines[0].counts && Array.isArray(chainLines[0].reds) && chainLines[0].reds.length === 0,
    "14a gate-run appends one JSON line per run to chains.jsonl with gate, tree, head, treeSha, start, end, counts and reds: "
    + JSON.stringify(chainLines[0]));

  const chainsRun2 = run(chainsLab, ["failgate"], null, { ETIUDA_CHAINS_PATH: chainsPath });
  try { chainLines = fs.readFileSync(chainsPath, "utf8").trim().split(/\r?\n/).map(JSON.parse); } catch (e) {}
  const redEntry = chainLines[1] && chainLines[1].reds && chainLines[1].reds[0];
  check(chainLines.length === 2 && !!redEntry && redEntry.cause === "unread",
    "14b a red run records its failing gates in chains.jsonl with cause unread: "
    + JSON.stringify(redEntry));

  const timed = chainLines.map(c => c.gates);
  check(timed.length === 2 && timed.every(g => Array.isArray(g) && g.length === 1 && Number.isFinite(g[0].wallMs) && g[0].wallMs >= 0)
    && timed[0][0].exit === 0 && timed[1][0].exit !== 0 && !!redEntry && timed[1][0].gate === redEntry.gate,
    "14c each chains line says which gates ate its run, one {gate, wallMs, exit} per gate run: " + JSON.stringify(timed));

  /* ---- 15. THE NIGHTLY PROFILE (rule 3) --------------------------------------------------- */
  const nightlyLab = makeLab("nightly", {
    failgate: prints(1, 1, "process.exit(1);"),
    leaf: prints(2, 0, "process.exit(0);"),
  });
  const tempNightly = run(nightlyLab, ["nightly"]);
  check(tempNightly.exit === 78 && /refuses to run from a folder under %TEMP%/i.test(tempNightly.out),
    "15a the nightly profile refuses to run from a folder under %TEMP% with exit 78: "
    + tempNightly.out.trim().split(/\r?\n/).slice(-3).join(" | "));

  const chainsNightlyPath = path.join(nightlyLab.runs, "chains.jsonl");
  const allowedNightly = run(nightlyLab, ["nightly"], null, {
    ETIUDA_NIGHTLY_ALLOW_TEMP: "1",
    ETIUDA_CHAINS_PATH: chainsNightlyPath,
    ETIUDA_LOCK_PATH: path.join(nightlyLab.root, "machine.lock"),
  });
  const failRecord = Object.values(allowedNightly.byGate).find(g => g.exit !== 0);
  check(allowedNightly.exit !== 0 && !!failRecord && failRecord.cause === "unread",
    "15b nightly with allow-temp runs the whole chain and a red gate record carries cause unread: "
    + JSON.stringify(failRecord && { gate: failRecord.gate, exit: failRecord.exit, cause: failRecord.cause }));

  const failFile = allowedNightly.files.find(f => {
    try { return JSON.parse(fs.readFileSync(path.join(nightlyLab.runs, f), "utf8")).exit !== 0; } catch (e) { return false; }
  });
  /* A second run red on the same gate, so a mark of the first has another run's row to leave alone (rule 10, the test
     architect's criterion of 2026-10-28 09:38: a mark names one red of one run and changes nothing else). */
  const secondNightly = run(nightlyLab, ["nightly"], null, {
    ETIUDA_NIGHTLY_ALLOW_TEMP: "1",
    ETIUDA_CHAINS_PATH: chainsNightlyPath,
    ETIUDA_LOCK_PATH: path.join(nightlyLab.root, "machine.lock"),
  });
  const marksPath = path.join(path.dirname(chainsNightlyPath), "marks.jsonl");
  const bytesOf = (f) => { try { return fs.readFileSync(f, "utf8"); } catch (e) { return null; } };
  const failPath = path.join(nightlyLab.runs, failFile || "none");
  const chainsBefore = bytesOf(chainsNightlyPath), recordBefore = bytesOf(failPath);
  const markRun = run(nightlyLab, ["mark-cause", failPath, "product-catch", "not-escaped"], null, {
    ETIUDA_CHAINS_PATH: chainsNightlyPath,
  });
  const marks = (gr.readMarks ? gr.readMarks(marksPath) : []);
  let nightlyLines = [];
  try { nightlyLines = fs.readFileSync(chainsNightlyPath, "utf8").trim().split(/\r?\n/).map(JSON.parse); } catch (e) {}
  const failGate = failRecord && failRecord.gate;
  check(markRun.exit === 0 && marks.length === 1 && marks[0].cause === "product-catch" && marks[0].escaped === false
    && marks[0].gate === failGate && !!nightlyLines[0] && marks[0].run.start === nightlyLines[0].start
    && bytesOf(chainsNightlyPath) === chainsBefore && bytesOf(failPath) === recordBefore,
    "15c mark-cause appends one mark keyed to its run to marks.jsonl and rewrites neither chains.jsonl nor the record: exit "
    + markRun.exit + ", marks " + JSON.stringify(marks.map(m => ({ gate: m.gate, cause: m.cause, escaped: m.escaped, start: m.run && m.run.start })))
    + ", chains " + (bytesOf(chainsNightlyPath) === chainsBefore ? "unchanged" : "REWRITTEN")
    + ", record " + (bytesOf(failPath) === recordBefore ? "unchanged" : "REWRITTEN"));

  const firstMark = nightlyLines[0] ? (gr.markOf ? gr.markOf(nightlyLines[0], failGate, marks) : null) : null;
  const secondMark = nightlyLines[1] ? (gr.markOf ? gr.markOf(nightlyLines[1], failGate, marks) : "no markOf") : "no second run";
  check(secondNightly.exit !== 0 && nightlyLines.length === 2 && nightlyLines[0].start !== nightlyLines[1].start
    && !!firstMark && secondMark === null && nightlyLines[1].reds.every(r => r.cause === "unread"),
    "15e marking one run's red leaves another run's red of the same gate unread: first "
    + (firstMark ? firstMark.cause : "unmarked") + ", second " + (secondMark === null ? "unread" : JSON.stringify(secondMark))
    + ", runs " + nightlyLines.length);

  const marksBefore = bytesOf(marksPath);
  const leafRun = run(nightlyLab, ["leaf"], null, { ETIUDA_CHAINS_PATH: chainsNightlyPath });
  const greenFile = leafRun.files.find(f => {
    try { return JSON.parse(fs.readFileSync(path.join(nightlyLab.runs, f), "utf8")).exit === 0; } catch (e) { return false; }
  });
  const badCause = run(nightlyLab, ["mark-cause", failPath, "product", "not-escaped"], null, { ETIUDA_CHAINS_PATH: chainsNightlyPath });
  const noEscape = run(nightlyLab, ["mark-cause", failPath, "machine"], null, { ETIUDA_CHAINS_PATH: chainsNightlyPath });
  const green = run(nightlyLab, ["mark-cause", path.join(nightlyLab.runs, greenFile || "none"), "machine", "escaped"], null,
    { ETIUDA_CHAINS_PATH: chainsNightlyPath });
  check(badCause.exit === 78 && noEscape.exit === 78 && green.exit === 78 && !!greenFile && bytesOf(marksPath) === marksBefore,
    "15f a cause outside rule 10's four, a mark that does not say whether the red escaped, and a green record are each refused"
    + " and write nothing: exits " + [badCause.exit, noEscape.exit, green.exit].join(", ")
    + ", marks " + (bytesOf(marksPath) === marksBefore ? "unchanged" : "CHANGED"));

  const profileLab = makeLab("profile", {
    showprof: 'console.log("PROFILE=" + process.env.ETIUDA_PROFILE);\nprocess.exit(0);\n',
  });
  const profPkg = JSON.parse(fs.readFileSync(path.join(profileLab.lab, "package.json"), "utf8"));
  profPkg.scripts = { test: "node tests/showprof.mjs" };
  fs.writeFileSync(path.join(profileLab.lab, "package.json"), JSON.stringify(profPkg, null, 2) + "\n");
  const profRun = run(profileLab, ["release"], null, {
    ETIUDA_NIGHTLY_ALLOW_TEMP: "1",
    ETIUDA_LOCK_PATH: path.join(profileLab.root, "machine.lock"),
  });
  check(profRun.out.includes("PROFILE=release"),
    "15d the release profile sets ETIUDA_PROFILE=release for every leg it runs: "
    + profRun.out.trim().split(/\r?\n/).filter(l => /PROFILE=/.test(l)).join(" | "));

  /* ---- 16. THE AREA RUN (rule 1) ---------------------------------------------------------- */
  const areaLab = makeLab("area", {
    g1: prints(2, 0, "process.exit(0);"),
    g2: prints(2, 0, "process.exit(0);"),
  }, {
    git: true,
    gatesFor: true,
    files: {
      "src/leaf.mjs": "export const leaf = 1;\n",
      "src/other.mjs": "export const other = 2;\n",
      "relay/core.cjs": "module.exports = {};\n",
      "tests/pick.mjs": "console.log('  ok   pick');\nprocess.exit(0);\n",
      "tests/links.js": "console.log('  ok   links');\nprocess.exit(0);\n",
    }
  });
  const areaPkg = JSON.parse(fs.readFileSync(path.join(areaLab.lab, "package.json"), "utf8"));
  areaPkg.scripts = {
    test: "node tests/plant-hold.mjs && node tests/g1.mjs && node tests/g2.mjs && node tests/plant-compare.mjs",
    g1: "node tests/g1.mjs",
    g2: "node tests/g2.mjs",
  };
  fs.writeFileSync(path.join(areaLab.lab, "package.json"), JSON.stringify(areaPkg, null, 2) + "\n");
  fs.writeFileSync(path.join(areaLab.lab, "tests", "plant-hold.mjs"), 'console.log("  ok   plant-hold");\nprocess.exit(0);\n');
  fs.writeFileSync(path.join(areaLab.lab, "tests", "plant-compare.mjs"), 'console.log("  ok   plant-compare");\nprocess.exit(0);\n');
  spawnSync("git", ["add", "."], { cwd: areaLab.lab });
  spawnSync("git", ["commit", "-q", "-m", "initial"], { cwd: areaLab.lab });

  fs.writeFileSync(path.join(areaLab.lab, "src", "leaf.mjs"), "export const leaf = 99;\n");
  fs.writeFileSync(path.join(areaLab.lab, "tests", "g1.mjs"),
    'import fs from "node:fs";\n' + prints(2, 0, 'process.exit(0);') + '\nconst text = fs.readFileSync("src/leaf.mjs", "utf8");\n');

  const areaRun1 = run(areaLab, ["area", "HEAD"], null, {
    ETIUDA_LOCK_PATH: path.join(areaLab.root, "machine.lock"),
  });
  check(areaRun1.exit === 0 && "tests-g1" in areaRun1.byGate && !("tests-g2" in areaRun1.byGate),
    "16a the area run selects exactly the legs that read the changed files plus plant-hold bracket: expected tests-g1 and not tests-g2, selected ["
    + Object.keys(areaRun1.byGate).join(", ") + "]; exit " + areaRun1.exit
    + (/rerunning nothing/.test(areaRun1.out) ? "; it reused a recorded tree" : ""));

  fs.writeFileSync(path.join(areaLab.lab, "package.json"), JSON.stringify(areaPkg, null, 2) + " ");
  const areaRunShared = run(areaLab, ["area", "HEAD"], null, {
    ETIUDA_LOCK_PATH: path.join(areaLab.root, "machine.lock"),
  });
  check(areaRunShared.out.indexOf("fail-closed to whole chain") >= 0,
    "16b the area run fails closed to the whole chain on an unmapped product file and on shared code: "
    + areaRunShared.out.trim().split(/\r?\n/).filter(l => /fail-closed/i.test(l)).join(" | "));

  fs.writeFileSync(path.join(areaLab.lab, "src", "leaf.mjs"), "export const leaf = 1;\n");
  fs.writeFileSync(path.join(areaLab.lab, "package.json"), JSON.stringify(areaPkg, null, 2) + "\n");
  fs.writeFileSync(path.join(areaLab.lab, "relay", "unmapped.cjs"), "module.exports = { unmapped: true };\n");
  const areaRunRelayUnmapped = run(areaLab, ["area", "HEAD"], null, {
    ETIUDA_LOCK_PATH: path.join(areaLab.root, "machine.lock"),
  });
  check(areaRunRelayUnmapped.out.indexOf("relay core") >= 0,
    "16c the area run adds the relay core when an unmapped relay file is changed: "
    + areaRunRelayUnmapped.out.trim().split(/\r?\n/).filter(l => /relay/i.test(l)).join(" | "));

  fs.unlinkSync(path.join(areaLab.lab, "relay", "unmapped.cjs"));
  fs.writeFileSync(path.join(areaLab.lab, "electron-builder.js"), "module.exports = {};\n");
  const areaRunShared2 = run(areaLab, ["area", "HEAD"], null, {
    ETIUDA_LOCK_PATH: path.join(areaLab.root, "machine.lock"),
  });
  check(areaRunShared2.out.indexOf("fail-closed to whole chain: change in shared code") >= 0,
    "16d a change to a SHARED file runs the whole run: "
    + areaRunShared2.out.trim().split(/\r?\n/).filter(l => /fail-closed/i.test(l)).join(" | "));
  fs.unlinkSync(path.join(areaLab.lab, "electron-builder.js"));

  fs.writeFileSync(path.join(areaLab.lab, "src", "major.mjs"), "export const m = 1;\n");
  fs.writeFileSync(path.join(areaLab.lab, "tests", "g1.mjs"), 'import fs from "node:fs";\nfs.readFileSync("src/major.mjs");\nconsole.log("  ok   g1");\nprocess.exit(0);\n');
  fs.writeFileSync(path.join(areaLab.lab, "tests", "g2.mjs"), 'import fs from "node:fs";\nfs.readFileSync("src/major.mjs");\nconsole.log("  ok   g2");\nprocess.exit(0);\n');
  const areaRunHalf = run(areaLab, ["area", "HEAD"], null, {
    ETIUDA_LOCK_PATH: path.join(areaLab.root, "machine.lock"),
  });
  check(areaRunHalf.out.indexOf("more than half") >= 0 && areaRunHalf.out.indexOf("fail-closed to whole chain") >= 0,
    "16e a change to a file mapped to more than half the gates runs the whole run: "
    + areaRunHalf.out.trim().split(/\r?\n/).filter(l => /fail-closed/i.test(l)).join(" | "));
  fs.unlinkSync(path.join(areaLab.lab, "src", "major.mjs"));
  fs.writeFileSync(path.join(areaLab.lab, "tests", "g1.mjs"), 'console.log("  ok   g1");\nprocess.exit(0);\n');
  fs.writeFileSync(path.join(areaLab.lab, "tests", "g2.mjs"), 'console.log("  ok   g2");\nprocess.exit(0);\n');

  fs.writeFileSync(path.join(areaLab.lab, "src", "gap.mjs"), "export const gap = 1;\n");
  const areaRunGap = run(areaLab, ["area", "HEAD"], null, {
    ETIUDA_LOCK_PATH: path.join(areaLab.root, "machine.lock"),
  });
  check(areaRunGap.out.indexOf("product core") >= 0 && areaRunGap.out.indexOf("gates-for gap") >= 0
    && areaRunGap.out.indexOf("fail-closed to whole chain") < 0,
    "16f an unmapped product file runs the named product core and records a gates-for gap: "
    + areaRunGap.out.trim().split(/\r?\n/).filter(l => /gap|product core/i.test(l)).join(" | "));
  fs.unlinkSync(path.join(areaLab.lab, "src", "gap.mjs"));

  fs.writeFileSync(path.join(areaLab.lab, "relay", "core.cjs"), "module.exports = { mapped: true };\n");
  fs.writeFileSync(path.join(areaLab.lab, "tests", "g1.mjs"), 'import "../relay/core.cjs";\nconsole.log("  ok   g1");\nprocess.exit(0);\n');
  const areaRunRelayMapped = run(areaLab, ["area", "HEAD"], null, {
    ETIUDA_LOCK_PATH: path.join(areaLab.root, "machine.lock"),
  });
  check(areaRunRelayMapped.out.indexOf("tests/g1.mjs") >= 0 && areaRunRelayMapped.out.indexOf("adding relay core") < 0,
    "16g a mapped relay file runs every leg in one pass without plants, not the relay core: "
    + areaRunRelayMapped.out.trim().split(/\r?\n/).filter(l => /g1|relay core/i.test(l)).join(" | "));
  fs.writeFileSync(path.join(areaLab.lab, "relay", "core.cjs"), "module.exports = {};\n");
  fs.writeFileSync(path.join(areaLab.lab, "tests", "g1.mjs"), 'console.log("  ok   g1");\nprocess.exit(0);\n');

  const areaRunFloor = run(areaLab, ["area", "HEAD", "--dry-run"], null, {
    ETIUDA_LOCK_PATH: path.join(areaLab.root, "machine.lock"),
  });
  check(areaRunFloor.out.indexOf("tests/pick.mjs") >= 0 && areaRunFloor.out.indexOf("tests/links.js") >= 0,
    "16h floor legs run at every merge whatever gates-for names: "
    + areaRunFloor.out.trim().split(/\r?\n/).filter(l => /pick|links/i.test(l)).join(" | "));

  /* Rule 1 as amended 2026-10-28: a diff confined to the gate tools selects their own legs and the floor from gates-for itself;
     one that mixes a gate tool with any other file still fails closed. */
  /* The legs above leave edits in the lab; they are committed first, so the diff is the gate tool's alone. */
  spawnSync("git", ["add", "."], { cwd: areaLab.lab });
  spawnSync("git", ["commit", "-q", "-m", "before 16j"], { cwd: areaLab.lab });
  const labTool = path.join(areaLab.lab, "tools", "gate-run.mjs");
  const labToolBytes = fs.readFileSync(labTool, "utf8");
  fs.appendFileSync(labTool, "// touched by leg 16j\n");
  fs.writeFileSync(path.join(areaLab.lab, "tests/result-line.mjs"), "console.log('  ok   own');\nprocess.exit(0);\n");
  const areaToolsOnly = run(areaLab, ["area", "HEAD", "--dry-run"], null, { ETIUDA_LOCK_PATH: path.join(areaLab.root, "machine.lock") });
  fs.writeFileSync(path.join(areaLab.lab, "src", "mixed.mjs"), "export const mixed = 1;\n");
  const areaToolsMixed = run(areaLab, ["area", "HEAD", "--dry-run"], null, { ETIUDA_LOCK_PATH: path.join(areaLab.root, "machine.lock") });
  fs.unlinkSync(path.join(areaLab.lab, "src", "mixed.mjs"));
  fs.unlinkSync(path.join(areaLab.lab, "tests/result-line.mjs"));
  fs.writeFileSync(labTool, labToolBytes);
  check(areaToolsOnly.out.indexOf("fail-closed") < 0 && areaToolsOnly.out.indexOf("confined to the gate tools") >= 0
    && areaToolsOnly.out.indexOf("node tests/result-line.mjs") >= 0 && areaToolsOnly.out.indexOf("tests/pick.mjs") >= 0
    && areaToolsOnly.out.indexOf("tests/g1.mjs") < 0
    && areaToolsMixed.out.indexOf("fail-closed to whole chain: change in shared code tools/gate-run.mjs") >= 0,
    "16j a diff confined to the gate tools runs their own legs and the floor, and one mixing them with another file fails closed: "
    + areaToolsOnly.out.trim().split(/\r?\n/).filter(l => /fail-closed|confined|own legs|gate\(s\) to run/i.test(l)).join(" | ")
    + " || mixed: " + areaToolsMixed.out.trim().split(/\r?\n/).filter(l => /fail-closed/i.test(l)).join(" | "));

  /* A window gate gates-for names is left out of the area run and named, never run whole (the window wall). */
  fs.writeFileSync(path.join(areaLab.lab, "tests", "win.mjs"), 'import "../src/winread.mjs";\nE.windowWall("tests/win.mjs");\nconsole.log("  ok   win");\n');
  fs.writeFileSync(path.join(areaLab.lab, "src", "winread.mjs"), "export const w = 1;\n");
  const winPkg = JSON.parse(fs.readFileSync(path.join(areaLab.lab, "package.json"), "utf8"));
  winPkg.scripts.win = "node tests/win.mjs";
  fs.writeFileSync(path.join(areaLab.lab, "package.json"), JSON.stringify(winPkg, null, 2) + "\n");
  spawnSync("git", ["add", "."], { cwd: areaLab.lab });
  spawnSync("git", ["commit", "-q", "-m", "a window gate"], { cwd: areaLab.lab });
  fs.writeFileSync(path.join(areaLab.lab, "src", "winread.mjs"), "export const w = 2;\n");
  const areaWindow = run(areaLab, ["area", "HEAD", "--dry-run"], null, { ETIUDA_LOCK_PATH: path.join(areaLab.root, "machine.lock") });
  const winChains = path.join(areaLab.runs, "chains-16k.jsonl");
  const areaWindowRun = run(areaLab, ["area", "HEAD"], null, { ETIUDA_LOCK_PATH: path.join(areaLab.root, "machine.lock"), ETIUDA_CHAINS_PATH: winChains });
  let winLine = null;
  try { winLine = JSON.parse(fs.readFileSync(winChains, "utf8").trim().split(/\r?\n/).pop()); } catch (e) {}
  fs.writeFileSync(path.join(areaLab.lab, "src", "winread.mjs"), "export const w = 1;\n");
  check(areaWindow.out.indexOf("window gate tests/win.mjs left out") >= 0 && areaWindow.out.indexOf("  node tests/win.mjs") < 0
    && !!winLine && Array.isArray(winLine.walled) && winLine.walled.length === 1 && winLine.walled[0] === "tests/win.mjs"
    && areaWindowRun.out.indexOf("REFUSED") < 0,
    "16k a window gate gates-for names for the diff is left out of the area run, named, and recorded as walled in its chains line: "
    + areaWindow.out.trim().split(/\r?\n/).filter(l => /win|gate\(s\) to run/i.test(l)).join(" | ")
    + " || walled " + JSON.stringify(winLine && winLine.walled));

  /* No FLOOR entry is one the window wall refuses: a file gates-for classes window is named by a node arm, and that arm,
     run here with the window variable unset, exits 0 without the wall's marker (the test architect's leg, 2026-10-28). */
  const gfFloor = await import("../tools/gates-for.mjs");
  const floorBad = [];
  for (const f of gr.FLOOR || []) {
    const kind = typeof gfFloor.windowKind === "function" ? gfFloor.windowKind(path.join(ROOT, f.file)) : "unknown";
    if (kind === "node") continue;
    if (!f.args || !f.args.length) { floorBad.push(f.file + " (" + kind + ", whole file)"); continue; }
    const armEnv = Object.assign({}, process.env);
    for (const k of Object.keys(armEnv)) if (k.toUpperCase() === WINDOWS_VAR) delete armEnv[k];
    const arm = spawnSync(process.execPath, [path.join(ROOT, f.file), ...f.args], { cwd: ROOT, encoding: "utf8", env: armEnv, timeout: 120000 });
    const said = String(arm.stdout || "") + String(arm.stderr || "");
    if (arm.status !== 0 || /#refused/.test(said)) floorBad.push(f.cmd + " (exit " + arm.status + (/#refused/.test(said) ? ", refused" : "") + ")");
  }
  check(Array.isArray(gr.FLOOR) && gr.FLOOR.length > 0 && floorBad.length === 0,
    "16l no FLOOR entry is one the window wall refuses: " + (floorBad.length ? floorBad.join("; ") : (gr.FLOOR || []).length + " entries, each node or a node arm that ran"));

  /* Every merge runs every FLOOR entry, a fail-closed one included (the test architect's E1, 2026-10-28): the whole chain is
     package.json's test script, which need not hold a floor file. A plan for a change to package.json, which is SHARED, fails
     closed; each FLOOR entry must be among its steps, by its own command or by its file run whole. */
  const closedPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const closedPlan = await gr.planAreaRun(ROOT, ["package.json"], closedPkg);
  const closedMissing = (gr.FLOOR || []).filter(f => !(closedPlan.steps || []).some(s => s.cmd === f.cmd
    || (s.file === f.file && !(s.args || []).length))).map(f => f.cmd);
  /* The release profile, nightly included, runs every FLOOR entry too (the test architect's E2, 2026-10-28), and every FLOOR
     file exists, since withFloor passes over a missing one in silence (his C1). */
  const relSteps = typeof gr.profileSteps === "function" ? gr.profileSteps(ROOT, closedPkg) : [];
  const relMissing = (gr.FLOOR || []).filter(f => !relSteps.some(s => s.cmd === f.cmd
    || (s.file === f.file && !(s.args || []).length))).map(f => f.cmd);
  const floorAbsent = (gr.FLOOR || []).filter(f => !fs.existsSync(path.join(ROOT, f.file))).map(f => f.file);
  check(relSteps.length > 0 && relMissing.length === 0 && floorAbsent.length === 0,
    "16n the release profile runs every FLOOR entry and every FLOOR file exists: "
    + (relMissing.length ? "release misses " + relMissing.join("; ") : (gr.FLOOR || []).length + " entries among " + relSteps.length + " release steps")
    + (floorAbsent.length ? "; absent " + floorAbsent.join(", ") : "; all present"));

  /* And not by luck: a chain holding no floor file at all gets every entry from withFloor, before plant-compare. */
  const bare = typeof gr.withFloor === "function" ? gr.withFloor(ROOT, [{ cmd: "node tests/plant-compare.mjs", file: "tests/plant-compare.mjs", args: [] }]) : [];
  const bareMissing = (gr.FLOOR || []).filter(f => !bare.some(s => s.cmd === f.cmd)).map(f => f.cmd);
  if (!bare.length || bare[bare.length - 1].file !== "tests/plant-compare.mjs") bareMissing.push("plant-compare not last");
  check(closedPlan.failClosed === true && (gr.FLOOR || []).length > 0 && closedMissing.length === 0 && bareMissing.length === 0,
    "16m a fail-closed plan runs every FLOOR entry: " + (closedPlan.failClosed ? "fail-closed, " : "NOT fail-closed, ")
    + (closedMissing.length ? "missing " + closedMissing.join("; ") : (gr.FLOOR || []).length + " entries among " + (closedPlan.steps || []).length + " steps")
    + (bareMissing.length ? "; a bare chain misses " + bareMissing.join("; ") : "; a bare chain gets all " + (gr.FLOOR || []).length));

  /* A test file new against the merge's base that starts more than five child processes turns the area run red, its count
     stated (regimen rule 11; tools/child-cap.mjs counts statically). Planted: a six-child file, in a lab of its own. */
  const capLab = makeLab("cap", { g1: prints(1, 0, "process.exit(0);") }, { git: true, gatesFor: true });
  const capSrc = path.join(ROOT, "tools", "child-cap.mjs");
  if (fs.existsSync(capSrc)) fs.copyFileSync(capSrc, path.join(capLab.lab, "tools", "child-cap.mjs"));
  spawnSync("git", ["add", "."], { cwd: capLab.lab });
  spawnSync("git", ["commit", "-q", "-m", "initial"], { cwd: capLab.lab });
  const six = Array.from({ length: 6 }, (_, i) => '  cp.' + 'spawn' + 'Sync("node", ["-v"]); // ' + i).join("\n");
  fs.writeFileSync(path.join(capLab.lab, "tests", "six.mjs"), 'import * as cp from "node:child_process";\nfunction never() {\n'
    + six + '\n}\nconsole.log("  ok   six");\n');
  spawnSync("git", ["add", "."], { cwd: capLab.lab });
  spawnSync("git", ["commit", "-q", "-m", "a six-child test file"], { cwd: capLab.lab });
  const capRun = run(capLab, ["area", "HEAD~1"], null, { ETIUDA_LOCK_PATH: path.join(capLab.root, "machine.lock") });
  const capStep = typeof gr.childCapStep === "function" ? gr.childCapStep(ROOT, "origin/main...HEAD") : null;
  check(capRun.exit !== 0 && /FAIL child-cap tests\/six\.mjs starts 6 child processes/.test(capRun.out)
    && !!capStep && capStep.cmd === "node tools/child-cap.mjs origin/main",
    "16o a test file new against the base that starts six child processes turns the area run red, its count stated: exit "
    + capRun.exit + " | " + capRun.out.trim().split(/\r?\n/).filter(l => /child-cap/.test(l)).join(" | ")
    + " | step " + (capStep ? capStep.cmd : "none"));

  /* The runner never schedules itself. gates-for names tools/gate-run.mjs as a gate (npm run gates runs it, and its lists
     name relay legs), and an area run that called it bare refused with 78 (the workerd-sweep merge, 2026-10-28). */
  const selfPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const selfPlan = await gr.planAreaRun(ROOT, ["tests/relay-workerd.mjs"], selfPkg, "origin/main");
  check(!selfPlan.failClosed && selfPlan.steps.length > 0 && !selfPlan.steps.some(s => s.file === "tools/gate-run.mjs"),
    "16p an area run never schedules the gate runner itself: for tests/relay-workerd.mjs it runs "
    + selfPlan.steps.map(s => s.file).join(", "));

  /* For every file the npm test chain names, that file alone schedules steps in any script chain the run uses
     (test, split-guard, hook-coverage), GATE_TOOLS, NIGHTLY_LEGS, the bracket and the floor, and refuses tools/gate-run.mjs and any
     window-classed file (the test architect's E1, 2026-10-29).
     Static: planAreaRun starts nothing. Removing the runner's guard names tools/gate-run.mjs. */
  const chainFiles = String(selfPkg.scripts && selfPkg.scripts.test || "").split("&&").map(s => {
    const m = /^\s*node\s+(\S+)/.exec(s.trim());
    return m ? m[1].replace(/\\/g, "/") : "";
  }).filter(Boolean);
  const usedChains = ["test", "split-guard", "hook-coverage"].filter(name => selfPkg.scripts && selfPkg.scripts[name]);
  const chainScriptFiles = [];
  for (const name of usedChains) {
    const parts = String(selfPkg.scripts[name] || "").split("&&");
    for (const p of parts) {
      const m = /^\s*node\s+(\S+)/.exec(p.trim());
      if (m) chainScriptFiles.push(m[1].replace(/\\/g, "/"));
    }
  }
  const floorCmds = new Set((gr.FLOOR || []).map(f => f.cmd));
  const chainAllow = new Set([
    ...chainScriptFiles,
    ...(gfFloor.GATE_TOOLS || []).map(f => f.replace(/\\/g, "/")),
    ...(gr.NIGHTLY_LEGS || []).map(n => String(n.file || "").replace(/\\/g, "/")),
    "tests/plant-hold.mjs", "tests/plant-compare.mjs", "tools/child-cap.mjs",
    ...(gr.FLOOR || []).map(f => String(f.file || "").replace(/\\/g, "/")),
  ]);
  chainAllow.delete("tools/gate-run.mjs");
  const chainOutside = [];
  for (const file of chainFiles) {
    const one = await gr.planAreaRun(ROOT, [file], selfPkg);
    for (const s of one.steps || []) {
      const rel = String(s.file || "").replace(/\\/g, "/");
      const isFloor = floorCmds.has(s.cmd);
      const isWin = typeof gfFloor.windowKind === "function" && gfFloor.windowKind(path.join(ROOT, rel)) === "window" && !isFloor;
      if (rel === "tools/gate-run.mjs" || isWin || !chainAllow.has(rel)) {
        chainOutside.push(file + " -> " + rel + (isWin ? " (window)" : ""));
      }
    }
  }
  check(chainFiles.length > 0 && chainOutside.length === 0,
    "16q a chain file's plan holds only the chain, the bracket and the floor: "
    + (chainOutside.length ? chainOutside.slice(0, 6).join("; ") : chainFiles.length + " files"));

  /* A package.json edit confined to whole node entries selects those files and chain-split. Anything else fails closed. */
  const pkgLab = makeLab("script-chain", {}, { git: true });
  const readPkg = [
    'import fs from "node:fs";',
    'import path from "node:path";',
    'import { fileURLToPath } from "node:url";',
    'const HERE = path.dirname(fileURLToPath(import.meta.url));',
    'const ROOT = path.resolve(HERE, "..");',
    'fs.readFileSync(path.join(ROOT, "package.json"), "utf8");',
    'console.log("  ok   read");',
    "",
  ].join("\n");
  fs.writeFileSync(path.join(pkgLab.lab, "tests", "a.mjs"), readPkg);
  fs.writeFileSync(path.join(pkgLab.lab, "tests", "chain-split.mjs"), readPkg);
  fs.writeFileSync(path.join(pkgLab.lab, "tests", "keep.mjs"), readPkg);
  fs.writeFileSync(path.join(pkgLab.lab, "tests", "x.mjs"), readPkg);
  fs.writeFileSync(path.join(pkgLab.lab, "tests", "win.mjs"), readPkg + "function wall(){ windowWall(); }\n");
  const basePkgObj = {
    name: "lab", version: "0.0.1",
    scripts: { test: "node tests/a.mjs && node tests/chain-split.mjs", windows: "node tests/keep.mjs" },
  };
  const writePkg = (obj) => fs.writeFileSync(path.join(pkgLab.lab, "package.json"), JSON.stringify(obj, null, 2) + "\n");
  writePkg(basePkgObj);
  for (const args of [
    ["config", "user.email", "lab@example.invalid"],
    ["config", "user.name", "lab"],
    ["config", "commit.gpgsign", "false"],
    ["add", "."],
    ["commit", "-q", "-m", "base"],
  ]) {
    const r = spawnSync("git", args, { cwd: pkgLab.lab, encoding: "utf8" });
    if (r.status !== 0) throw new Error("lab git " + args.join(" ") + ": " + (r.stderr || r.error));
  }
  const baseText = fs.readFileSync(path.join(pkgLab.lab, "package.json"), "utf8");
  const editOf = typeof gr.scriptChainEdit === "function" ? (a, b) => gr.scriptChainEdit(a, b) : () => null;
  const addedObj = JSON.parse(baseText);
  addedObj.scripts.test += " && node tests/x.mjs";
  writePkg(addedObj);
  const addedPlan = await gr.planAreaRun(pkgLab.lab, ["package.json"], JSON.parse(fs.readFileSync(path.join(pkgLab.lab, "package.json"), "utf8")), "HEAD");
  const addedSet = new Set((addedPlan.steps || []).map(s => s.file));
  const removedEdit = editOf(fs.readFileSync(path.join(pkgLab.lab, "package.json"), "utf8"), baseText);
  check(addedPlan.failClosed === false && addedSet.has("tests/x.mjs") && addedSet.has("tests/chain-split.mjs")
    && removedEdit && removedEdit.confined === true && removedEdit.removed.some(e => e.file === "tests/x.mjs") && removedEdit.added.length === 0,
    "16r one entry added to test selects that file and chain-split: failClosed=" + addedPlan.failClosed
    + " steps=" + [...addedSet].join(","));

  const bumpObj = JSON.parse(baseText);
  bumpObj.version = "0.0.2";
  writePkg(bumpObj);
  const bumpText = fs.readFileSync(path.join(pkgLab.lab, "package.json"), "utf8");
  const bumpPlan = await gr.planAreaRun(pkgLab.lab, ["package.json"], JSON.parse(bumpText), "HEAD");
  const bumpEdit = editOf(baseText, bumpText);
  const reordered = JSON.parse(baseText);
  reordered.scripts = { windows: reordered.scripts.windows, test: reordered.scripts.test };
  const reorderEdit = editOf(baseText, JSON.stringify(reordered, null, 2) + "\n");
  const extra = JSON.parse(baseText);
  extra.scripts = Object.assign({ lint: "node tests/a.mjs" }, extra.scripts);
  const extraEdit = editOf(baseText, JSON.stringify(extra, null, 2) + "\n");
  check(bumpPlan.failClosed === true && bumpEdit && bumpEdit.confined === false
    && reorderEdit && reorderEdit.confined === false && extraEdit && extraEdit.confined === false,
    "16s a version bump, a reordered script or a new script fails closed: plan=" + bumpPlan.failClosed
    + " bump=" + (bumpEdit && bumpEdit.confined) + " reorder=" + (reorderEdit && reorderEdit.confined)
    + " new=" + (extraEdit && extraEdit.confined) + " " + (bumpEdit && bumpEdit.reason));

  const argObj = JSON.parse(baseText);
  argObj.scripts.test = "node tests/a.mjs --compare && node tests/chain-split.mjs";
  writePkg(argObj);
  const argText = fs.readFileSync(path.join(pkgLab.lab, "package.json"), "utf8");
  const argPlan = await gr.planAreaRun(pkgLab.lab, ["package.json"], JSON.parse(argText), "HEAD");
  const argEdit = editOf(baseText, argText);
  check(argPlan.failClosed === true && argEdit && argEdit.confined === false,
    "16t a changed argument fails closed: plan=" + argPlan.failClosed + " confined=" + (argEdit && argEdit.confined)
    + " " + (argEdit && argEdit.reason));

  const winObj = JSON.parse(baseText);
  winObj.scripts.windows = "node tests/keep.mjs && node tests/win.mjs";
  writePkg(winObj);
  const winPlan = await gr.planAreaRun(pkgLab.lab, ["package.json"], JSON.parse(fs.readFileSync(path.join(pkgLab.lab, "package.json"), "utf8")), "HEAD");
  const winSet = new Set((winPlan.steps || []).map(s => s.file));
  check(winPlan.failClosed === false && (winPlan.walled || []).includes("tests/win.mjs") && !winSet.has("tests/win.mjs"),
    "16u an entry added to windows selects no window leg: failClosed=" + winPlan.failClosed
    + " walled=" + (winPlan.walled || []).join(",") + " stepped=" + [...winSet].filter(f => f.indexOf("win") >= 0).join(","));

  const areaChainsPath = path.join(areaLab.runs, "chains.jsonl");
  const currentTreeSha = (run(areaLab, ["test", "--dry-run"]).out.match(/tree ([0-9a-f]{16})/i) || [])[1] || "dummy-tree";
  fs.writeFileSync(areaChainsPath, JSON.stringify({
    gate: "area",
    tree: areaLab.lab,
    head: "HEAD",
    treeSha: currentTreeSha,
    start: "2026-10-27T22:00:00.000Z",
    end: "2026-10-27T22:01:00.000Z",
    counts: { ok: 5, fail: 0, exitCode: 0 },
    reds: [],
  }) + "\n", "utf8");
  const areaRunReuse = run(areaLab, ["area", "HEAD"], null, {
    ETIUDA_CHAINS_PATH: areaChainsPath,
    ETIUDA_LOCK_PATH: path.join(areaLab.root, "machine.lock"),
  });
  check(areaRunReuse.out.indexOf("equals recorded green tree") >= 0 && areaRunReuse.exit === 0
    && areaRunReuse.out.indexOf("rerunning nothing") >= 0,
    "16i when the merge commit tree equals a recorded green tree the area run reruns nothing: "
    + areaRunReuse.out.trim().split(/\r?\n/).filter(l => /equals recorded/i.test(l)).join(" | "));

  /* ---- 17. PLANTS OUT OF MERGES (rule 2) -------------------------------------------------- */
  const plantLab = makeLab("plants", {
    plantleg: [
      'const off = process.env.ETIUDA_PLANTS === "off";',
      'let asserted = 0, skipped = 0;',
      'asserted++; console.log("  ok   base leg");',
      'if (!off) { asserted++; console.log("  ok   planted leg"); } else { skipped++; console.log("  SKIP  planted leg"); }',
      'console.log("#counts checks=" + asserted + " skipped=" + skipped + " expected=2");',
      'const ok = asserted + skipped === 2;',
      'process.exit(ok ? 0 : 78);',
    ].join("\n"),
  });
  const plantRunOn = run(plantLab, ["plantleg"]);
  const plantRunOff = run(plantLab, ["plantleg"], null, { ETIUDA_PLANTS: "off" });
  check(plantRunOn.exit === 0 && plantRunOn.byGate["tests-plantleg"].counts.ok === 2
    && plantRunOff.exit === 0 && plantRunOff.byGate["tests-plantleg"].counts.ok === 1
    && plantRunOff.byGate["tests-plantleg"].counts.skipped === 1,
    "17a ETIUDA_PLANTS=off causes a planting leg to skip its planted half and report skipped in counts: "
    + "on=" + JSON.stringify(plantRunOn.byGate["tests-plantleg"].counts)
    + " off=" + JSON.stringify(plantRunOff.byGate["tests-plantleg"].counts));

  const brokenPlantLab = makeLab("plants-broken", {
    brokenleg: [
      'const off = process.env.ETIUDA_PLANTS === "off";',
      'let asserted = 0, skipped = 0;',
      'asserted++; console.log("  ok   base leg");',
      'console.log("#counts checks=" + asserted + " skipped=" + skipped + " expected=2");',
      'const ok = asserted + skipped === 2;',
      'process.exit(ok ? 0 : 78);',
    ].join("\n"),
  });
  const brokenRun = run(brokenPlantLab, ["brokenleg"], null, { ETIUDA_PLANTS: "off" });
  check(brokenRun.exit === 78,
    "17b the expected floor still refuses if a leg is missing rather than skipped: exit " + brokenRun.exit);

  const rbOn = spawnSync(process.execPath, [path.join(ROOT, "tests", "rollback-floor.mjs")], { cwd: ROOT, encoding: "utf8" });
  const rbOff = spawnSync(process.execPath, [path.join(ROOT, "tests", "rollback-floor.mjs")], { cwd: ROOT, encoding: "utf8", env: Object.assign({}, process.env, { ETIUDA_PLANTS: "off" }) });
  const rbOnM = /^#counts.*checks=(\d+).*skipped=(\d+)/m.exec(rbOn.stdout || "");
  const rbOffM = /^#counts.*checks=(\d+).*skipped=(\d+)/m.exec(rbOff.stdout || "");
  const rbOnChecks = rbOnM ? Number(rbOnM[1]) : -1;
  const rbOffChecks = rbOffM ? Number(rbOffM[1]) : -1;
  const rbOffSkipped = rbOffM ? Number(rbOffM[2]) : -1;
  check(rbOn.status === 0 && rbOff.status === 0 && rbOffSkipped === 2 && rbOnChecks - rbOffChecks === 2,
    "17c ETIUDA_PLANTS=off on tests/rollback-floor.mjs skips exactly 2 plants: on checks=" + rbOnChecks + " off checks=" + rbOffChecks + " skipped=" + rbOffSkipped);

  const tjOn = spawnSync(process.execPath, [path.join(ROOT, "tests", "team-join.mjs")], { cwd: ROOT, encoding: "utf8" });
  const tjOff = spawnSync(process.execPath, [path.join(ROOT, "tests", "team-join.mjs")], { cwd: ROOT, encoding: "utf8", env: Object.assign({}, process.env, { ETIUDA_PLANTS: "off" }) });
  const tjOnM = /^#counts.*checks=(\d+).*skipped=(\d+)/m.exec(tjOn.stdout || "");
  const tjOffM = /^#counts.*checks=(\d+).*skipped=(\d+)/m.exec(tjOff.stdout || "");
  const tjOnChecks = tjOnM ? Number(tjOnM[1]) : -1;
  const tjOffChecks = tjOffM ? Number(tjOffM[1]) : -1;
  const tjOffSkipped = tjOffM ? Number(tjOffM[2]) : -1;
  check(tjOn.status === 0 && tjOff.status === 0 && tjOffSkipped === 14 && tjOnChecks - tjOffChecks === 14,
    "17d ETIUDA_PLANTS=off on tests/team-join.mjs skips exactly 14 plants: on checks=" + tjOnChecks + " off checks=" + tjOffChecks + " skipped=" + tjOffSkipped);

  if (!KEEP) for (const dir of labs) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* held */ }
  } else process.stdout.write("--keep: labs at " + labs.join(", ") + "\n");

  check(asserted + skipped + 1 === EXPECTED,
    "11 every leg ran: " + (asserted + skipped + 1) + " of " + EXPECTED + " assertion(s)"
    + (skipped ? ", " + skipped + " skipped" : ""));
  process.stdout.write("#counts asserted=" + asserted + " failures=" + failed + "\n");
  process.stdout.write("result-line: " + asserted + " assertion(s), " + failed + " failure(s)"
    + (skipped ? ", " + skipped + " skipped" : "") + "\n");
  process.exit(failed ? 1 : 0);
}

await main();
