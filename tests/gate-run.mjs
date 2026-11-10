/* THE AREA RUN SHORTCUT COVERS ALL GATES. Node only.
 *
 *     node tests/gate-run.mjs
 *
 * An area run inherits green only from a run that covered it:
 * 1. A green file-mode record on the tree, then an area: the area runs its gates.
 * 2. A whole-chain record on the tree that stopped at a red, later marked machine: the area runs.
 * 3. A complete green area record on the tree whose ran misses one of this area's files: the area runs.
 * 4. A complete green whole-chain record covering every file: the area skips, naming the record.
 * 5. A planted removal of the coverage check turns leg 1 red, by the tree's plant convention, and honours ETIUDA_PLANTS=off.
 *
 * File mode profiles and fingerprint method checks (2026-11-08):
 * 6. File mode on a lab leg named only by the release profile runs it and writes a record with ETIUDA_PROFILE=release seen by the leg. A file named nowhere is still refused.
 * 7. A fingerprint stub that fails git once, then answers: no moved-tree verdict, and the gate's own exit stands.
 * 8. A stub where git never answers: the run stops with the "git did not answer" reason, and no moved-tree line.
 * 9. A real file written by a gate under the tree: still a moved-tree verdict (the control).
 * 10. A planted removal of the method check turns leg 7 red, by the tree's plant convention, and honours ETIUDA_PLANTS=off.
 *
 * Real profile attribution while installed app runs (2026-11-09):
 * 11. App running, a change in the stand-in profile, area mode: a warn line naming the cause, no hold, the run continues.
 * 12. App running, profile mode: exit 78, refused, named.
 * 13. No app running, the same change: the hold red as today (the control).
 * 14. A planted removal of the running-app check turns leg 1 red, by the tree's plant convention, honouring ETIUDA_PLANTS=off.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";

/* The floor: every leg below runs or is skipped by name, or the tally says so rather than reading as a short green. */
const EXPECTED = 14;
let asserted = 0, failed = 0, skipped = 0;
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stdout.write("  FAIL " + line + "\n"); }
}

function skip(line) {
  skipped++;
  process.stdout.write("  SKIP " + line + "\n");
}

function gitCmd(args, cwd, env) {
  const r = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + " failed: " + (r.stderr || r.stdout));
  return String(r.stdout || "").trim();
}

function runTool(lab, args, customEnv = {}) {
  const env = Object.assign({}, process.env, {
    ETIUDA_RUNS: lab.runs,
    ETIUDA_CHAINS_PATH: lab.chainsPath,
    ETIUDA_LOCK_PATH: path.join(lab.root, "machine.lock"),
  }, customEnv);
  const r = spawnSync(process.execPath, [path.join(lab.lab, "tools", "gate-run.mjs"), ...args], {
    cwd: lab.lab,
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
  });
  return {
    exit: r.status,
    out: String(r.stdout || "") + String(r.stderr || ""),
  };
}

function setupLab() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-gate-run-lab-"));
  const lab = path.join(root, "lab");
  const runs = path.join(root, "runs");
  const chainsPath = path.join(root, "chains.jsonl");

  fs.mkdirSync(path.join(lab, "tools"), { recursive: true });
  fs.mkdirSync(path.join(lab, "tests"), { recursive: true });
  fs.mkdirSync(path.join(lab, "src"), { recursive: true });
  fs.mkdirSync(runs, { recursive: true });

  fs.copyFileSync(path.join(ROOT, "tools", "gate-run.mjs"), path.join(lab, "tools", "gate-run.mjs"));
  fs.copyFileSync(path.join(ROOT, "tools", "machine-lock.mjs"), path.join(lab, "tools", "machine-lock.mjs"));
  fs.copyFileSync(path.join(ROOT, "tools", "gates-for.mjs"), path.join(lab, "tools", "gates-for.mjs"));

  const pkg = {
    name: "etiuda",
    private: true,
    version: "0.0.0",
    scripts: {
      test: "node tests/a.mjs && node tests/b.mjs",
      a: "node tests/a.mjs",
      b: "node tests/b.mjs",
    },
  };
  fs.writeFileSync(path.join(lab, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  const standIn = path.join(root, "stand-in-profile");
  fs.mkdirSync(path.join(standIn, "etiuda"), { recursive: true });
  fs.mkdirSync(path.join(standIn, "Etiuda Studio"), { recursive: true });

  fs.writeFileSync(path.join(lab, "src", "leaf.mjs"), "export const leaf = 1;\n");
  fs.writeFileSync(path.join(lab, "tests", "a.mjs"), [
    'import fs from "node:fs";',
    'import path from "node:path";',
    'import "../src/leaf.mjs";',
    'if (process.env.ETIUDA_TOUCH_PROFILE === "1" && process.env.ETIUDA_REAL_PROFILE_OVERRIDE) {',
    '  const p = path.join(process.env.ETIUDA_REAL_PROFILE_OVERRIDE, "etiuda");',
    '  fs.mkdirSync(p, { recursive: true });',
    '  fs.writeFileSync(path.join(p, "window.json"), "touched\\n", "utf8");',
    '}',
    'console.log("  ok   leg a");',
    'process.exit(0);',
    '',
  ].join("\n"));
  fs.writeFileSync(path.join(lab, "tests", "b.mjs"), "import \"../src/leaf.mjs\";\nconsole.log(\"  ok   leg b\");\nprocess.exit(0);\n");
  fs.mkdirSync(path.join(lab, "ignored"), { recursive: true });
  fs.writeFileSync(path.join(lab, ".gitignore"), "ignored/\n");
  fs.writeFileSync(path.join(lab, "ignored", "drift.txt"), "ignored drift content\n");

  const gitEnv = { ...process.env };
  delete gitEnv.GIT_DIR;
  delete gitEnv.GIT_INDEX_FILE;
  delete gitEnv.GIT_WORK_TREE;

  gitCmd(["init", "-q", "-b", "main"], lab, gitEnv);
  gitCmd(["add", "."], lab, gitEnv);
  gitCmd(["-c", "user.name=lab", "-c", "user.email=lab@example.invalid", "commit", "-q", "-m", "init"], lab, gitEnv);

  fs.writeFileSync(path.join(lab, "src", "leaf.mjs"), "export const leaf = 2;\n");
  gitCmd(["add", "."], lab, gitEnv);
  gitCmd(["-c", "user.name=lab", "-c", "user.email=lab@example.invalid", "commit", "-q", "-m", "change"], lab, gitEnv);

  const head = gitCmd(["rev-parse", "--short", "HEAD"], lab, gitEnv);
  const gitTree = gitCmd(["rev-parse", "HEAD^{tree}"], lab, gitEnv);

  return { root, lab, runs, chainsPath, gitEnv, head, gitTree, standIn };
}

function cleanLab(lab) {
  try { fs.rmSync(lab.root, { recursive: true, force: true }); } catch {}
}

function main() {
  const lab = setupLab();
  try {
    /* 1. A green file-mode record on the tree, then an area: the area runs its gates */
    fs.writeFileSync(lab.chainsPath, JSON.stringify({
      gate: "file tests/a.mjs",
      tree: lab.lab,
      head: lab.head,
      treeSha: lab.gitTree,
      gitTree: lab.gitTree,
      start: "2026-11-08T00:00:00.000Z",
      end: "2026-11-08T00:00:01.000Z",
      counts: { ok: 1, fail: 0, exitCode: 0 },
      reds: [],
      holds: false,
      ran: ["tests/a.mjs"],
    }) + "\n", "utf8");

    const r1 = runTool(lab, ["area", "HEAD~1...HEAD"]);
    check(r1.exit === 0 && r1.out.indexOf("rerunning nothing") < 0 && r1.out.indexOf("> node tests/a.mjs") >= 0,
      "1 a green file-mode record on the tree does not skip: area runs its gates");

    /* 2. A whole-chain record on the tree that stopped at a red, later marked machine: the area runs */
    fs.writeFileSync(lab.chainsPath, JSON.stringify({
      gate: "test",
      tree: lab.lab,
      head: lab.head,
      treeSha: lab.gitTree,
      gitTree: lab.gitTree,
      start: "2026-11-08T00:00:00.000Z",
      end: "2026-11-08T00:00:01.000Z",
      counts: { ok: 1, fail: 1, exitCode: 1 },
      reds: [{ gate: "tests-b", cmd: "node tests/b.mjs", exit: 1, cause: "machine", class: "hold" }],
      holds: true,
      ran: ["tests/a.mjs", "tests/b.mjs"],
    }) + "\n", "utf8");

    const marksPath = path.join(path.dirname(lab.chainsPath), "marks.jsonl");
    fs.writeFileSync(marksPath, JSON.stringify({
      run: { head: lab.head, start: "2026-11-08T00:00:00.000Z", gate: "test" },
      gate: "tests-b",
      cmd: "node tests/b.mjs",
      cause: "machine",
      escaped: false,
      marked: "2026-11-08T00:02:00.000Z",
    }) + "\n", "utf8");

    const r2 = runTool(lab, ["area", "HEAD~1...HEAD"]);
    check(r2.exit === 0 && r2.out.indexOf("rerunning nothing") < 0 && r2.out.indexOf("> node tests/a.mjs") >= 0,
      "2 a whole-chain record stopping at a red marked machine does not skip: area runs");

    /* 3. A complete green area record on the tree whose ran misses one of this area's files: the area runs */
    fs.writeFileSync(lab.chainsPath, JSON.stringify({
      gate: "area",
      tree: lab.lab,
      head: lab.head,
      treeSha: lab.gitTree,
      gitTree: lab.gitTree,
      start: "2026-11-08T00:05:00.000Z",
      end: "2026-11-08T00:06:00.000Z",
      counts: { ok: 1, fail: 0, exitCode: 0 },
      reds: [],
      holds: false,
      ran: ["tests/a.mjs"],
    }) + "\n", "utf8");

    const r3 = runTool(lab, ["area", "HEAD~1...HEAD"]);
    check(r3.exit === 0 && r3.out.indexOf("rerunning nothing") < 0 && r3.out.indexOf("> node tests/b.mjs") >= 0,
      "3 a complete green area record missing one file does not skip: area runs");

    /* 4. A complete green whole-chain record covering every file: the area skips, naming the record */
    fs.writeFileSync(lab.chainsPath, JSON.stringify({
      gate: "test",
      tree: lab.lab,
      head: lab.head,
      treeSha: lab.gitTree,
      gitTree: lab.gitTree,
      start: "2026-11-08T00:10:00.000Z",
      end: "2026-11-08T00:11:00.000Z",
      counts: { ok: 2, fail: 0, exitCode: 0 },
      reds: [],
      holds: false,
      ran: ["tests/a.mjs", "tests/b.mjs"],
    }) + "\n", "utf8");

    const r4 = runTool(lab, ["area", "HEAD~1...HEAD"]);
    check(r4.exit === 0 && r4.out.indexOf("rerunning nothing") >= 0 && r4.out.indexOf("test") >= 0
      && (r4.out.indexOf("cover") >= 0 || r4.out.indexOf("covering") >= 0),
      "4 a complete green whole-chain record covering every file skips and names the record");

    /* 5. A planted removal of the coverage check turns leg 1 red, by the tree's plant convention, and honours ETIUDA_PLANTS=off */
    if (PLANTS_OFF) {
      skip("5 planted removal of coverage check turns leg 1 red (ETIUDA_PLANTS=off)");
    } else {
      const toolFile = path.join(lab.lab, "tools", "gate-run.mjs");
      const toolSrc = fs.readFileSync(toolFile, "utf8");
      const PLANT_TAG = "/* plant:area-coverage */";
      const hasPlant = toolSrc.includes(PLANT_TAG);
      const plantedSrc = toolSrc.replace(/^[^\n]*\/\*\s*plant:area-coverage\s*\*\/[^\n]*$/m, "/* plant:area-coverage removed */");
      fs.writeFileSync(toolFile, plantedSrc);

      gitCmd(["add", "tools/gate-run.mjs"], lab.lab, lab.gitEnv);
      gitCmd(["-c", "user.name=lab", "-c", "user.email=lab@example.invalid", "commit", "-q", "-m", "plant"], lab.lab, lab.gitEnv);

      const plantHead = gitCmd(["rev-parse", "--short", "HEAD"], lab.lab, lab.gitEnv);
      const plantGitTree = gitCmd(["rev-parse", "HEAD^{tree}"], lab.lab, lab.gitEnv);

      fs.writeFileSync(lab.chainsPath, JSON.stringify({
        gate: "file tests/a.mjs",
        tree: lab.lab,
        head: plantHead,
        treeSha: plantGitTree,
        gitTree: plantGitTree,
        start: "2026-11-08T00:00:00.000Z",
        end: "2026-11-08T00:00:01.000Z",
        counts: { ok: 1, fail: 0, exitCode: 0 },
        reds: [],
        holds: false,
        ran: ["tests/a.mjs"],
      }) + "\n", "utf8");

      const rPlant = runTool(lab, ["area", "HEAD~2...HEAD"]);
      gitCmd(["reset", "--hard", "HEAD~1"], lab.lab, lab.gitEnv);

      const leg1TurnedRed = plantedSrc !== toolSrc && hasPlant && rPlant.exit === 0 && rPlant.out.indexOf("rerunning nothing") >= 0;
      check(leg1TurnedRed, "5 planted removal of coverage check turns leg 1 red: planted " + (plantedSrc !== toolSrc) + ", plant present " + hasPlant);
    }

    /* 6 (1). File mode on a lab leg named only by the release profile runs it and writes a record with ETIUDA_PROFILE=release seen by the leg. A file named nowhere is still refused */
    const relFile = path.join(lab.lab, "tests", "release-only.mjs");
    fs.writeFileSync(relFile, "console.log('  ok   profile ' + process.env.ETIUDA_PROFILE);\nprocess.exit(0);\n", "utf8");
    const pkgObj = JSON.parse(fs.readFileSync(path.join(lab.lab, "package.json"), "utf8"));
    pkgObj.scripts.release = "node tests/release-only.mjs";
    fs.writeFileSync(path.join(lab.lab, "package.json"), JSON.stringify(pkgObj, null, 2) + "\n", "utf8");
    gitCmd(["add", "."], lab.lab, lab.gitEnv);
    gitCmd(["-c", "user.name=lab", "-c", "user.email=lab@example.invalid", "commit", "-q", "-m", "add release-only leg"], lab.lab, lab.gitEnv);

    const rRel = runTool(lab, ["file", "tests/release-only.mjs"]);
    const runsFiles = fs.existsSync(lab.runs) ? fs.readdirSync(lab.runs).filter(f => f.startsWith("tests-release-only-") && f.endsWith(".json")) : [];
    const relRecord = runsFiles.length ? JSON.parse(fs.readFileSync(path.join(lab.runs, runsFiles[0]), "utf8")) : null;

    fs.writeFileSync(path.join(lab.lab, "tests", "unnamed.mjs"), "console.log('unnamed');\nprocess.exit(0);\n", "utf8");
    const rUnnamed = runTool(lab, ["file", "tests/unnamed.mjs"]);
    const leg6Ok = rRel.exit === 0
      && rRel.out.indexOf("profile release") >= 0
      && !!relRecord
      && relRecord.exit === 0
      && rUnnamed.exit === 78
      && rUnnamed.out.indexOf("no chain or gates-for names") >= 0;
    check(leg6Ok, "6 (1) file mode on a lab leg named only by release profile runs with ETIUDA_PROFILE=release and writes record; unnamed refused");

    /* 7 (2). A fingerprint stub that fails git once, then answers: no moved-tree verdict, and the gate's own exit stands */
    const rStubOnce = runTool(lab, ["file", "tests/a.mjs"], { ETIUDA_GIT_STUB: "fail-once" });
    const leg7Ok = rStubOnce.exit === 0 && rStubOnce.out.indexOf("the tree moved") < 0;
    check(leg7Ok, "7 (2) fingerprint stub that fails git once then answers: no moved-tree verdict and gate exit stands");

    /* 8 (3). A stub where git never answers: the run stops with the 'git did not answer' reason, and no moved-tree line */
    const rStubNever = runTool(lab, ["file", "tests/a.mjs"], { ETIUDA_GIT_STUB: "never-after" });
    const leg8Ok = rStubNever.exit === 78
      && rStubNever.out.indexOf("git did not answer") >= 0
      && rStubNever.out.indexOf("the tree moved") < 0;
    check(leg8Ok, "8 (3) stub where git never answers: stops with git did not answer reason and no moved-tree line");

    /* 9 (4). A real file written by a gate under the tree: still a moved-tree verdict (the control) */
    const mutatorFile = path.join(lab.lab, "tests", "mutator.mjs");
    fs.writeFileSync(mutatorFile,
      "import fs from 'node:fs';\nfs.writeFileSync('tests/moved-sample.txt', 'mutated');\nconsole.log('  ok   mutator');\nprocess.exit(0);\n", "utf8");
    pkgObj.scripts.mutator = "node tests/mutator.mjs";
    fs.writeFileSync(path.join(lab.lab, "package.json"), JSON.stringify(pkgObj, null, 2) + "\n", "utf8");
    gitCmd(["add", "."], lab.lab, lab.gitEnv);
    gitCmd(["-c", "user.name=lab", "-c", "user.email=lab@example.invalid", "commit", "-q", "-m", "add mutator"], lab.lab, lab.gitEnv);

    const rMutator = runTool(lab, ["file", "tests/mutator.mjs"]);
    try { fs.rmSync(path.join(lab.lab, "tests", "moved-sample.txt"), { force: true }); } catch {}
    const leg9Ok = rMutator.exit === 78 && rMutator.out.indexOf("the tree moved") >= 0;
    check(leg9Ok, "9 (4) a real file written by a gate under the tree: still a moved-tree verdict (the control)");

    /* 10 (5). A planted removal of the method check turns leg 2 red, by the tree's plant convention, and honours ETIUDA_PLANTS=off */
    if (PLANTS_OFF) {
      skip("10 (5) planted removal of method check turns leg 7 red (ETIUDA_PLANTS=off)");
    } else {
      const toolFile = path.join(lab.lab, "tools", "gate-run.mjs");
      const toolSrc = fs.readFileSync(toolFile, "utf8");
      const PLANT_TAG = "/* plant:method-check */";
      const hasPlant = toolSrc.includes(PLANT_TAG);
      const plantedSrc = toolSrc.replace(/^[^\n]*\/\*\s*plant:method-check\s*\*\/[^\n]*$/m, "/* plant:method-check removed */");
      fs.writeFileSync(toolFile, plantedSrc);

      const rPlantMethod = runTool(lab, ["file", "tests/a.mjs"], { ETIUDA_GIT_STUB: "fail-once" });
      fs.writeFileSync(toolFile, toolSrc);

      const leg2TurnedRed = plantedSrc !== toolSrc && hasPlant && rPlantMethod.exit === 78 && rPlantMethod.out.indexOf("the tree moved") >= 0;
      check(leg2TurnedRed, "10 (5) planted removal of method check turns leg 7 red: planted " + (plantedSrc !== toolSrc) + ", plant present " + hasPlant);
    }

    /* Real profile attribution while installed app runs (2026-11-09) */
    const standIn = lab.standIn;

    /* 11 (1). App running, a change in the stand-in profile, area mode: a warn line naming the cause, no hold, the run continues */
    fs.rmSync(path.join(standIn, "etiuda", "window.json"), { force: true });
    const r11 = runTool(lab, ["area", "HEAD~1...HEAD"], {
      ETIUDA_REAL_PROFILE_OVERRIDE: standIn,
      ETIUDA_TOUCH_PROFILE: "1",
      ETIUDA_INSTALLED_APP_RUNNING: "1",
    });
    const leg11Ok = r11.exit === 0
      && r11.out.indexOf("the real profile changed while the installed app ran, so it cannot be attributed") >= 0
      && r11.out.indexOf("WARN") >= 0
      && r11.out.indexOf("FAIL touched the real profile") < 0;
    check(leg11Ok, "11 (1) app running, change in stand-in profile, area mode: warn line naming cause, no hold, run continues");

    /* 12 (2). App running, profile mode: exit 78, refused, named */
    fs.rmSync(path.join(standIn, "etiuda", "window.json"), { force: true });
    const r12 = runTool(lab, ["release"], {
      ETIUDA_REAL_PROFILE_OVERRIDE: standIn,
      ETIUDA_TOUCH_PROFILE: "1",
      ETIUDA_INSTALLED_APP_RUNNING: "1",
    });
    const leg12Ok = r12.exit === 78
      && r12.out.indexOf("the real profile changed while the installed app ran, so it cannot be attributed") >= 0
      && (r12.out.indexOf("refused") >= 0 || r12.out.indexOf("REFUSED") >= 0);
    check(leg12Ok, "12 (2) app running, profile mode: exit 78, refused, named");

    /* 13 (3). No app running, the same change: the hold red as today (the control) */
    fs.rmSync(path.join(standIn, "etiuda", "window.json"), { force: true });
    const r13 = runTool(lab, ["area", "HEAD~1...HEAD"], {
      ETIUDA_REAL_PROFILE_OVERRIDE: standIn,
      ETIUDA_TOUCH_PROFILE: "1",
      ETIUDA_INSTALLED_APP_RUNNING: "0",
    });
    const leg13Ok = r13.exit !== 0
      && r13.out.indexOf("touched the real profile") >= 0;
    check(leg13Ok, "13 (3) no app running, the same change: hold red as today (the control)");

    /* 14 (4). A planted removal of the running-app check turns leg 1 red, by the tree's plant convention, honouring ETIUDA_PLANTS=off */
    if (PLANTS_OFF) {
      skip("14 (4) planted removal of running-app check turns leg 1 red (ETIUDA_PLANTS=off)");
    } else {
      const toolFile = path.join(lab.lab, "tools", "gate-run.mjs");
      const toolSrc = fs.readFileSync(toolFile, "utf8");
      const PLANT_TAG = "/* plant:running-app */";
      const hasPlant = toolSrc.includes(PLANT_TAG);
      const plantedSrc = toolSrc.replace(/^[^\n]*\/\*\s*plant:running-app\s*\*\/[^\n]*$/m, "/* plant:running-app removed */");
      fs.writeFileSync(toolFile, plantedSrc);

      fs.rmSync(path.join(standIn, "etiuda", "window.json"), { force: true });
      const rPlant = runTool(lab, ["area", "HEAD~1...HEAD"], {
        ETIUDA_REAL_PROFILE_OVERRIDE: standIn,
        ETIUDA_TOUCH_PROFILE: "1",
        ETIUDA_INSTALLED_APP_RUNNING: "1",
      });
      fs.writeFileSync(toolFile, toolSrc);

      const leg1TurnedRed = plantedSrc !== toolSrc && hasPlant && rPlant.exit !== 0 && rPlant.out.indexOf("touched the real profile") >= 0;
      check(leg1TurnedRed, "14 (4) planted removal of running-app check turns leg 1 red: planted " + (plantedSrc !== toolSrc) + ", plant present " + hasPlant);
    }
  } finally {
    cleanLab(lab);
  }

  process.stdout.write("#counts checks=" + asserted + " skipped=" + skipped + " failures=" + failed + " expected=" + EXPECTED + "\n");
  if (asserted + skipped !== EXPECTED) {
    process.stdout.write("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " leg(s)\n");
    process.exit(78);
  }
  process.stdout.write("gate-run " + (failed ? "FAILED " + failed + " of " : "passed ") + asserted + " check(s)\n");
  process.exit(failed ? 1 : 0);
}

main();
