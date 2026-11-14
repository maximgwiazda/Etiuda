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
import tls from "node:tls";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const E = createRequire(import.meta.url)("./engine.js");

/* The floor: every leg below runs or is skipped by name, or the tally says so rather than reading as a short green. */
const EXPECTED = 24;  /* 14, +2 each step's own scratch (15a, 15b), +2 a customer's roots (15c, 15d), +4 the gate wall and the area lane (16a to 16d), +1 a walled gate's node arm (16e), +1 a zombie read as gone (16f) */
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
    /* Every leg here asks the tool for a run of its own, and several legs run area on one lab's tree in turn; area resume (fold 45)
       would carry the second of them whole from the first and run nothing, so it is off unless a leg names it. */
    ETIUDA_AREA_RESUME: "off",
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

    /* The mutator leaves the lab's scripts in a commit of its own, so the area legs below plan the chain they were written for:
       a fail-closed plan also runs the legs gates-for maps the diff's other files to, and the mutator, a gate that moves the tree,
       would be one (the test architect, 2026-11-11). */
    {
      const pkgFile = path.join(lab.lab, "package.json");
      const p = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
      delete p.scripts.mutator;
      fs.writeFileSync(pkgFile, JSON.stringify(p, null, 2) + "\n");
      fs.rmSync(path.join(lab.lab, "tests", "mutator.mjs"), { force: true });
      fs.rmSync(path.join(lab.lab, "tests", "moved-sample.txt"), { force: true });
      gitCmd(["add", "-A"], lab.lab, lab.gitEnv);
      gitCmd(["-c", "user.name=lab", "-c", "user.email=lab@example.invalid", "commit", "-q", "-m", "drop mutator"], lab.lab, lab.gitEnv);
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

    /* 15. EACH STEP'S SCRATCH IS ITS OWN AND GOES WITH IT. A leg that makes a lab under os.tmpdir() and leaves it, with a
       read-only file deep inside and a junction to a folder outside, leaves nothing after the step: the lab sat in a folder the
       runner made for that step, the folder is gone, and the junction's target is untouched. ETIUDA_KEEP_TMP=1 keeps it. */
    {
      const tmp = path.join(lab.root, "tmp"), outside = path.join(lab.root, "outside");
      fs.mkdirSync(tmp, { recursive: true });
      fs.mkdirSync(outside, { recursive: true });
      fs.writeFileSync(path.join(outside, "sentinel.txt"), "stays\n");
      fs.writeFileSync(path.join(lab.lab, "tests", "c.mjs"), [
        'import fs from "node:fs";',
        'import os from "node:os";',
        'import path from "node:path";',
        'const d = fs.mkdtempSync(path.join(os.tmpdir(), "leg-c-"));',
        'fs.mkdirSync(path.join(d, "deep", "deeper"), { recursive: true });',
        'const ro = path.join(d, "deep", "deeper", "ro.txt");',
        'fs.writeFileSync(ro, "r");',
        'fs.chmodSync(ro, 0o444);',
        'fs.symlinkSync(process.env.LEG_C_OUTSIDE, path.join(d, "link"), "junction");',
        'console.log("LEGC_TMP " + os.tmpdir());',
        'console.log("LEGC_DIR " + d);',
        'console.log("  ok   leg c");',
        '',
      ].join("\n"));
      /* File mode runs a file a chain names: the lab names this one for the leg, and is put back after it. */
      const pkgFile = path.join(lab.lab, "package.json"), pkgWas = fs.readFileSync(pkgFile, "utf8");
      const pkgNow = JSON.parse(pkgWas);
      pkgNow.scripts.c = "node tests/c.mjs";
      fs.writeFileSync(pkgFile, JSON.stringify(pkgNow, null, 2) + "\n");
      const env = { TEMP: tmp, TMP: tmp, TMPDIR: tmp, LEG_C_OUTSIDE: outside };
      const said = (out, key) => { const m = new RegExp("^" + key + " (.+)$", "m").exec(out); return m ? m[1].trim() : ""; };
      const r = runTool(lab, ["file", "tests/c.mjs"], env);
      const legTmp = said(r.out, "LEGC_TMP"), legDir = said(r.out, "LEGC_DIR");
      const own = !!legTmp && path.dirname(legTmp) === tmp && path.basename(legTmp).startsWith("egr-");
      const left = fs.readdirSync(tmp);
      const kept = fs.existsSync(path.join(outside, "sentinel.txt"));
      check(r.exit === 0 && own && !!legDir && !fs.existsSync(legDir) && left.length === 0 && kept,
        "15a a step's lab under os.tmpdir() sits in a folder the runner made for that step, and after the step that folder is gone,"
        + " a read-only file and a junction inside it with it, the junction's target untouched: exit " + r.exit + ", the step's tmpdir "
        + JSON.stringify(legTmp ? path.relative(lab.root, legTmp) : "") + ", the lab " + (legDir && fs.existsSync(legDir) ? "left" : "gone")
        + ", " + left.length + " left in tmp, sentinel " + (kept ? "kept" : "GONE"));
      const k = runTool(lab, ["file", "tests/c.mjs"], Object.assign({ ETIUDA_KEEP_TMP: "1" }, env));
      const kDir = said(k.out, "LEGC_DIR");
      check(k.exit === 0 && !!kDir && fs.existsSync(kDir) && /kept the step's scratch .*ETIUDA_KEEP_TMP=1/.test(k.out),
        "15b with ETIUDA_KEEP_TMP=1 the step's scratch stays for a red being read, and the run names where: exit " + k.exit
        + ", the lab " + (kDir && fs.existsSync(kDir) ? "kept" : "gone"));
      /* A lab left standing loses its junction before the lab is cleared, so the clearing never reaches the folder outside. */
      for (const d of [kDir, legDir]) {
        if (!d) continue;
        try { fs.unlinkSync(path.join(d, "link")); } catch { try { fs.rmdirSync(path.join(d, "link")); } catch {} }
      }
      fs.writeFileSync(pkgFile, pkgWas);
      fs.rmSync(path.join(lab.lab, "tests", "c.mjs"), { force: true });
    }

    {
      fs.writeFileSync(path.join(lab.lab, "tests", "roots-plain.mjs"), [
        "import tls from \"node:tls\";",
        "const names = Object.keys(process.env).filter(k => /^(NODE_USE_SYSTEM_CA|NODE_EXTRA_CA_CERTS)$/i.test(k)).map(k => k.toUpperCase()).sort();",
        "const extra = typeof tls.getCACertificates === \"function\" ? tls.getCACertificates(\"extra\").length : -1;",
        "console.log(\"ROOTS_ENV \" + (names.join(\",\") || \"none\"));",
        "console.log(\"ROOTS_EXTRA \" + extra);",
        "console.log(\"  ok   leg roots\");",
        "",
      ].join("\n"));
      fs.writeFileSync(path.join(lab.lab, "tests", "roots-asks.mjs"), [
        "/* run: system roots */",
        "import tls from \"node:tls\";",
        "const names = Object.keys(process.env).filter(k => /^(NODE_USE_SYSTEM_CA|NODE_EXTRA_CA_CERTS)$/i.test(k)).map(k => k.toUpperCase()).sort();",
        "const extra = typeof tls.getCACertificates === \"function\" ? tls.getCACertificates(\"extra\").length : -1;",
        "console.log(\"ROOTS_ENV \" + (names.join(\",\") || \"none\"));",
        "console.log(\"ROOTS_EXTRA \" + extra);",
        "console.log(\"  ok   leg roots\");",
        "",
      ].join("\n"));
      const pkgFile = path.join(lab.lab, "package.json"), pkgWas = fs.readFileSync(pkgFile, "utf8");
      const pkgNow = JSON.parse(pkgWas);
      pkgNow.scripts["roots-plain"] = "node tests/roots-plain.mjs";
      pkgNow.scripts["roots-asks"] = "node tests/roots-asks.mjs";
      fs.writeFileSync(pkgFile, JSON.stringify(pkgNow, null, 2) + "\n");
      /* 15c, 15d. A CUSTOMER'S ROOTS. A caller whose shell carries NODE_USE_SYSTEM_CA=1 and NODE_EXTRA_CA_CERTS naming a
         stand-in root (one of Node's own, written to a file) hands neither to a step: the step sees no such variable and Node
         loads no extra root. A leg that asks by name, the runner's ROOTS_MARKER in its head, keeps both (the control). */
      const pem = path.join(lab.root, "stand-in-root.pem");
      fs.writeFileSync(pem, tls.rootCertificates[0] + "\n");
      const wide = { NODE_USE_SYSTEM_CA: "1", NODE_EXTRA_CA_CERTS: pem };
      const said = (out, key) => { const m = new RegExp("^" + key + " (.+)$", "m").exec(out); return m ? m[1].trim() : ""; };
      const p = runTool(lab, ["file", "tests/roots-plain.mjs"], wide);
      const pEnv = said(p.out, "ROOTS_ENV"), pExtra = said(p.out, "ROOTS_EXTRA");
      check(p.exit === 0 && pEnv === "none" && (pExtra === "0" || pExtra === "-1"),
        "15c a step inherits no variable that widens Node's roots, so it trusts what a customer's install trusts: exit " + p.exit
        + ", variables " + JSON.stringify(pEnv) + ", extra roots loaded " + JSON.stringify(pExtra));
      const a = runTool(lab, ["file", "tests/roots-asks.mjs"], wide);
      const aEnv = said(a.out, "ROOTS_ENV"), aExtra = said(a.out, "ROOTS_EXTRA");
      check(a.exit === 0 && aEnv === "NODE_EXTRA_CA_CERTS,NODE_USE_SYSTEM_CA" && (aExtra === "1" || aExtra === "-1"),
        "15d control: a leg that asks for the system roots by name keeps both variables and its extra root: exit " + a.exit
        + ", variables " + JSON.stringify(aEnv) + ", extra roots loaded " + JSON.stringify(aExtra));
      fs.writeFileSync(pkgFile, pkgWas);
      for (const f of ["roots-plain", "roots-asks"]) fs.rmSync(path.join(lab.lab, "tests", f + ".mjs"), { force: true });
    }

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

    /* ---- 16. the wall-clock limit on one gate, and an area run taking a lane (the test architect, 2026-11-12) ---------------- */
    {
      const toolFile = path.join(lab.lab, "tools", "gate-run.mjs"), toolSrc = fs.readFileSync(toolFile, "utf8");
      const pidFile = path.join(lab.root, "grandchild.pid");
      /* A gate that starts a child of its own and then does not end for 8 s: past a 2 s wall it is stopped with its child. */
      fs.writeFileSync(path.join(lab.lab, "tests", "hang.mjs"), [
        'import { spawn } from "node:child_process";',
        'import fs from "node:fs";',
        'const g = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });',
        'fs.writeFileSync(process.env.HANG_PID_FILE, String(g.pid));',
        'setTimeout(() => process.exit(0), 8000);',
        '',
      ].join("\n"));
      const pkgFile = path.join(lab.lab, "package.json"), pkgWas = fs.readFileSync(pkgFile, "utf8");
      const pkg = JSON.parse(pkgWas);
      pkg.scripts.hang = "node tests/hang.mjs";
      fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n");
      /* Signal 0 answers for a zombie too, and off Windows a stopped child is one until something reaps it: its /proc state Z is
         gone (tests/engine.js, statIsZombie). The platform, the reader and the signal are arguments so 16f can stand in for Linux. */
      const alive = (pid, platform = process.platform, readStat = p => fs.readFileSync("/proc/" + p + "/stat", "utf8"),
        signal = p => process.kill(p, 0)) => {
        try { signal(Number(pid)); } catch { return false; }
        if (platform === "win32") return true;
        try { return !E.statIsZombie(readStat(Number(pid))); }
        catch (e) { return !(e.code === "ENOENT" && fs.existsSync("/proc/self")); }
      };
      {
        const answers = () => {}, Z = () => "8113 (node) Z 8095 8095 0", S = () => "8113 (node) S 8095 8095 0";
        const signalAlone = (() => { try { answers(8113); return true; } catch { return false; } })();
        const zLinux = alive(8113, "linux", Z, answers), sLinux = alive(8113, "linux", S, answers);
        let readOnWin = false; const zWin = alive(8113, "win32", () => { readOnWin = true; return Z(); }, answers);
        check(signalAlone === true && zLinux === false && sLinux === true && zWin === true && !readOnWin,
          "16f its child gone reads a zombie as gone off Windows (a stand-in /proc): signal alone says alive " + signalAlone
          + ", Linux state Z alive " + zLinux + ", state S alive " + sLinux + ", Windows arm alive " + zWin + " and /proc read " + readOnWin);
      }
      const runHang = () => { try { fs.rmSync(pidFile, { force: true }); } catch {} const t0 = Date.now();
        const r = runTool(lab, ["hang"], { ETIUDA_STEP_WALL_MS: "2000", HANG_PID_FILE: pidFile });
        const g = fs.existsSync(pidFile) ? fs.readFileSync(pidFile, "utf8").trim() : "";
        const gone = !!g && !alive(g); if (g && !gone) { try { process.kill(Number(g)); } catch {} }
        return { r, ms: Date.now() - t0, g, gone }; };
      const h = runHang();
      check(h.r.exit !== 0 && h.r.out.indexOf("was still running at the wall-clock limit (2 s)") >= 0 && h.gone && h.ms < 7500,
        "16a a gate still running at the wall-clock limit is stopped with its own child and reads red: exit " + h.r.exit + ", " + h.ms + " ms, its child gone " + h.gone);
      fs.writeFileSync(toolFile, toolSrc.replace(/^[^\n]*\/\*\s*plant:step-wall\s*\*\/[^\n]*$/m, "    const wall = null; /* plant:step-wall removed */"));
      const hp = runHang();
      fs.writeFileSync(toolFile, toolSrc);
      check(hp.r.exit === 0 && hp.r.out.indexOf("wall-clock limit") < 0 && hp.ms >= 7500,
        "16b control: lifting plant:step-wall lets the same gate run its 8 s and pass, no limit said: exit " + hp.r.exit + ", " + hp.ms + " ms");
      fs.writeFileSync(pkgFile, pkgWas);

      /* An area run waits for a lane: with the lab's one slot held by a live process and a 1.5 s wait, it is refused. */
      /* A commit touching src/ alone, so the area plan is a narrow one and not the whole chain an earlier leg's package.json change
         would fail it closed to (which is heavy whatever this change does, and would prove nothing). */
      fs.writeFileSync(path.join(lab.lab, "src", "leaf.mjs"), "export const leaf = 16;" + String.fromCharCode(10));
      gitCmd(["add", "src/leaf.mjs"], lab.lab, lab.gitEnv);
      gitCmd(["commit", "-q", "-m", "leaf 16"], lab.lab, lab.gitEnv);
      /* The held lane runs a script file: machine-lock run passes its command through a shell, which an inline -e script does not survive. */
      fs.writeFileSync(path.join(lab.lab, "tests", "hold.mjs"), "setTimeout(() => process.exit(0), 30000);" + String.fromCharCode(10));
      const holder = spawn(process.execPath, [path.join(lab.lab, "tools", "machine-lock.mjs"), "run", "--", process.execPath, path.join(lab.lab, "tests", "hold.mjs")],
        { cwd: lab.lab, env: Object.assign({}, process.env, { ETIUDA_LOCK_PATH: path.join(lab.root, "machine.lock") }), stdio: "ignore", windowsHide: true });
      const lockFile = path.join(lab.root, "machine.lock");
      const t0 = Date.now();
      while (!fs.existsSync(lockFile) && Date.now() - t0 < 15000) spawnSync(process.execPath, ["-e", "setTimeout(()=>{},200)"]);
      let ra = null, rp = null;
      try {
        ra = runTool(lab, ["area", "HEAD~1...HEAD"], { ETIUDA_LOCK_TIMEOUT_MS: "1500" });
      } finally {
        if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(holder.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        else { try { holder.kill("SIGKILL"); } catch {} }
      }
      check(!!ra && ra.exit !== 0 && ra.out.indexOf("could not acquire machine lock") >= 0 && ra.out.indexOf("fail-closed") < 0,
        "16c an area run takes a lane: with every lane held it is refused rather than run beside them: exit " + (ra && ra.exit));
      /* The control: the lane freed, the same narrow area run takes it and runs green, so 16c's refusal was the held lane alone. A
         planted copy of tools/gate-run.mjs cannot serve here: the copy is itself a change in shared code, which fails the plan closed
         to the whole chain, heavy whatever the plant does. */
      rp = runTool(lab, ["area", "HEAD~1...HEAD"], { ETIUDA_LOCK_TIMEOUT_MS: "1500" });
      check(rp.exit === 0 && rp.out.indexOf("taking machine lock for heavy run (area)") >= 0 && rp.out.indexOf("fail-closed") < 0,
        "16d control: with the lane free the same narrow area run takes it and runs green: exit " + rp.exit);
    }

    /* A walled gate's node arm (gates-for nodeArmOf): the area plan for the tree's own tools/desk-input.js runs pick-desk's
       --guards, which opens no window, and leaves the rest of pick-desk walled; no window gate is run whole (the test architect,
       2026-11-13, after Studio's cursor 1c stood red on main unseen because its node half sat inside a window leg). */
    {
      const { gfa, plan } = ARM_PLAN;
      const cmds = (plan.steps || []).map(s => s.cmd);
      const wholeWindow = (plan.steps || []).filter(s => gfa.windowKind(path.join(ROOT, s.file)) === "window"
        && JSON.stringify(s.args) !== JSON.stringify(gfa.nodeArmOf(path.join(ROOT, s.file))) && !/ (U0d|open-external)$/.test(s.cmd)).map(s => s.cmd);
      check(!plan.failClosed && cmds.indexOf("node tests/pick-desk.js --guards") >= 0 && (plan.walled || []).indexOf("tests/pick-desk.js") >= 0
        && wholeWindow.length === 0,
        "16e a walled gate's declared node arm runs at a merge: tools/desk-input.js plans `node tests/pick-desk.js --guards`, pick-desk "
        + "itself stays walled, and no window gate runs whole: " + JSON.stringify(cmds.filter(c => /desk/.test(c))) + " whole window "
        + JSON.stringify(wholeWindow));
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

/* 16e's plan, made before main (which is synchronous): the area plan for the tree's own tools/desk-input.js. */
const ARM_PLAN = await (async () => {
  const gr = await import(new URL("../tools/gate-run.mjs", import.meta.url).href);
  const gfa = await import(new URL("../tools/gates-for.mjs", import.meta.url).href);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return { gfa, plan: await gr.planAreaRun(ROOT, ["tools/desk-input.js"], pkg) };
})();

main();
