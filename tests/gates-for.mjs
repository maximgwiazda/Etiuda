/* THE MAP FROM A FILE TO THE GATES THAT READ IT. Node only.
 *
 *     node tests/gates-for.mjs
 *
 * A throwaway tree, with git's index as the tracked set and a copy of tools/gates-for.mjs, holds
 * three gates. One reads a file only through path.join of a root and two pieces. One reads a file
 * only by importing a module that imports it. One calls the window wall and reads a third file.
 * A file none of them names is the control. One reads a file only through a template literal whose
 * ${ROOT} is already folded. One loads a child only through execSync of a node command string.
 * A second tree's main joins ROOT and "src" inside a function, and the window gate is named for a
 * file under that directory.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TOOL = path.join(ROOT, "tools", "gates-for.mjs");
const EXPECTED = 31;  /* 23, +2 main's desk-trust ceiling and subject paths (gf24, gf25), +6 relay-channel-split (gf26 to gf31) */

/* GIT-ENV: git must use the throwaway tree, never a GIT_DIR the caller exported. */
function gitEnv() {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_WORK_TREE;
  return env;
}
function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: gitEnv() });
}

let asserted = 0, failed = 0;
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stdout.write("  FAIL " + line + "\n"); }
}

function write(rel, text) {
  const at = path.join(lab, rel);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, text);
}

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "gates-for-plant-"));
let rows = null, raw = "";
try {
  write("package.json", JSON.stringify({
    main: "shell/main.js",
    scripts: {
      test: "node tests/read-join.mjs && node tests/read-mod.mjs && node tests/read-cjs.mjs && node tests/reads-screen.mjs && node tests/read-pin.mjs && node tests/read-tpl.mjs && node tests/read-exec.mjs",
    },
  }, null, 2) + "\n");
  write("shell/main.js", "\"use strict\";\nrequire(\"./loaded.js\");\n");
  write("shell/loaded.js", "module.exports = { n: 1 };\n");
  write("ui/pane.js", "module.exports = \"pane\";\n");
  write("engine/pinned/leaf.js", "module.exports = { pin: 1 };\n");
  write("tools/engine-pin", "plant-pin\n");
  write("tools/engine-modules.txt", "src/modules/words.js\n");
  write("data/tpl.json", "tpl-body\n");
  write("tests/read-tpl.mjs", [
    "import fs from \"node:fs\";",
    "import path from \"node:path\";",
    "import { fileURLToPath } from \"node:url\";",
    "const HERE = path.dirname(fileURLToPath(import.meta.url));",
    "const ROOT = path.resolve(HERE, \"..\");",
    "const text = fs.readFileSync(`${ROOT}/data/tpl.json`, \"utf8\");",
    "process.exit(text === \"tpl-body\\n\" ? 0 : 1);",
    "",
  ].join("\n"));
  write("data/exec.txt", "exec-body\n");
  write("tests/exec-child.mjs", [
    "import fs from \"node:fs\";",
    "import path from \"node:path\";",
    "import { fileURLToPath } from \"node:url\";",
    "const HERE = path.dirname(fileURLToPath(import.meta.url));",
    "const ROOT = path.resolve(HERE, \"..\");",
    "fs.readFileSync(path.join(ROOT, \"data\", \"exec.txt\"), \"utf8\");",
    "",
  ].join("\n"));
  write("tests/read-exec.mjs", [
    "import { execSync } from \"node:child_process\";",
    "execSync(\"node tests/exec-child.mjs\");",
    "",
  ].join("\n"));
  write("tests/read-pin.mjs", [
    "import { createRequire } from \"node:module\";",
    "import path from \"node:path\";",
    "import { fileURLToPath } from \"node:url\";",
    "const require = createRequire(import.meta.url);",
    "const HERE = path.dirname(fileURLToPath(import.meta.url));",
    "require(path.join(HERE, \"..\", \"engine\", \"pinned\", \"leaf.js\"));",
    "process.exit(0);",
    "",
  ].join("\n"));
  write("data/joined.txt", "joined-body\n");
  write("data/unread.txt", "nobody\n");
  write("data/screen.txt", "screen-body\n");
  write("src/leaf.mjs", "export const leaf = 1;\n");
  write("src/mid.mjs", "export { leaf } from \"./leaf.mjs\";\n");
  write("lib/leaf.cjs", "module.exports = { n: 2 };\n");
  write("lib/mid.cjs", "module.exports = require(\"./leaf.cjs\");\n");
  write("tests/read-join.mjs", [
    "import fs from \"node:fs\";",
    "import path from \"node:path\";",
    "import { fileURLToPath } from \"node:url\";",
    "const HERE = path.dirname(fileURLToPath(import.meta.url));",
    "const ROOT = path.resolve(HERE, \"..\");",
    "const text = fs.readFileSync(path.join(ROOT, \"data\", \"joined.txt\"), \"utf8\");",
    "process.exit(text === \"joined-body\\n\" ? 0 : 1);",
    "",
  ].join("\n"));
  write("tests/read-mod.mjs", [
    "import { leaf } from \"../src/mid.mjs\";",
    "process.exit(leaf === 1 ? 0 : 1);",
    "",
  ].join("\n"));
  write("tests/read-cjs.mjs", [
    "import { createRequire } from \"node:module\";",
    "const require = createRequire(import.meta.url);",
    "const leaf = require(\"../lib/mid.cjs\");",
    "process.exit(leaf.n === 2 ? 0 : 1);",
    "",
  ].join("\n"));
  write("tests/reads-screen.mjs", [
    "import fs from \"node:fs\";",
    "import path from \"node:path\";",
    "import { fileURLToPath } from \"node:url\";",
    "const HERE = path.dirname(fileURLToPath(import.meta.url));",
    "const ROOT = path.resolve(HERE, \"..\");",
    "fs.readFileSync(path.join(ROOT, \"data\", \"screen.txt\"), \"utf8\");",
    "window" + "Wall(\"plant\");",
    "",
  ].join("\n"));
  fs.mkdirSync(path.join(lab, "tools"), { recursive: true });
  fs.copyFileSync(TOOL, path.join(lab, "tools", "gates-for.mjs"));
  git(["init", "-q"], lab);
  git(["add", "--", "package.json", "data", "src", "lib", "tests", "ui", "shell", "tools", "engine"], lab);

  const ask = (file) => {
    const res = spawnSync(process.execPath, ["tools/gates-for.mjs", file], { cwd: lab, encoding: "utf8" });
    const out = String(res.stdout || "") + String(res.stderr || "");
    const line = (out.trim().split(/\r?\n/).pop() || "");
    let json = null;
    try { json = JSON.parse(line); } catch (e) { json = null; }
    return { code: res.status, out, json };
  };

  const join = ask("data/joined.txt");
  raw = join.out;
  const names = j => (j && j.gates || []).map(g => g.gate).sort();
  check(join.code === 0 && names(join.json).join() === "tests/read-join.mjs",
    "gf1 a file read only through path.join of a root and two pieces names that gate and no other: "
    + JSON.stringify(names(join.json)) + (join.json ? "" : " (no JSON; " + join.out.trim().slice(0, 180) + ")"));
  const jg = (join.json && join.json.gates || []).find(g => g.gate === "tests/read-join.mjs");
  check(!!jg && jg.kind === "node" && jg.command === "node tests/read-join.mjs" && jg.via.join() === "npm test"
        && jg.chains.length === 1 && jg.chains[0].chain.join(" -> ").indexOf("data/joined.txt") > -1
        && jg.chains[0].chain[jg.chains[0].chain.length - 1] === "tests/read-join.mjs",
    "gf2 that gate is node, runs as node tests/read-join.mjs under npm test, and the chain ends at the gate: "
    + JSON.stringify(jg && { kind: jg.kind, command: jg.command, via: jg.via, chain: jg.chains[0] && jg.chains[0].chain }));

  const mod = ask("src/leaf.mjs");
  const mg = (mod.json && mod.json.gates || []).find(g => g.gate === "tests/read-mod.mjs");
  check(mod.code === 0 && names(mod.json).join() === "tests/read-mod.mjs"
        && !!mg && mg.chains[0].chain.join(" -> ") === "src/leaf.mjs -> src/mid.mjs -> tests/read-mod.mjs",
    "gf3 a file reached only through a second module names that gate, through the module: "
    + JSON.stringify(mg && mg.chains[0].chain) + " gates " + JSON.stringify(names(mod.json)));

  const cjs = ask("lib/leaf.cjs");
  const cg = (cjs.json && cjs.json.gates || []).find(g => g.gate === "tests/read-cjs.mjs");
  check(cjs.code === 0 && names(cjs.json).join() === "tests/read-cjs.mjs"
        && !!cg && cg.chains[0].chain.join(" -> ") === "lib/leaf.cjs -> lib/mid.cjs -> tests/read-cjs.mjs",
    "gf4 the same through require of a second module: "
    + JSON.stringify(cg && cg.chains[0].chain) + " gates " + JSON.stringify(names(cjs.json)));

  const none = ask("data/unread.txt");
  check(none.code === 0 && names(none.json).length === 0 && /no gate reads it/.test(none.out),
    "gf5 a file no gate reads names no gate: " + JSON.stringify(names(none.json))
    + (none.json ? "" : " (no JSON)"));

  const screen = ask("data/screen.txt");
  const sg = (screen.json && screen.json.gates || []).find(g => g.gate === "tests/reads-screen.mjs");
  check(screen.code === 0 && names(screen.json).join() === "tests/reads-screen.mjs" && !!sg && sg.kind === "window",
    "gf6 a file read only by a gate that calls the window wall is that gate, and it is window: "
    + JSON.stringify(sg && { gate: sg.gate, kind: sg.kind }) + " gates " + JSON.stringify(names(screen.json)));

  const self = ask("tests/read-join.mjs");
  check(self.code === 0 && names(self.json).indexOf("tests/read-join.mjs") > -1,
    "gf7 the gate's own file names the gate: " + JSON.stringify(names(self.json)));

  const pane = ask("ui/pane.js");
  const shellFile = ask("shell/loaded.js");
  const paneGate = (pane.json && pane.json.gates || []).find(g => g.gate === "tests/reads-screen.mjs");
  const shellGate = (shellFile.json && shellFile.json.gates || []).find(g => g.gate === "tests/reads-screen.mjs");
  check(pane.code === 0 && !!paneGate && paneGate.kind === "window"
        && shellFile.code === 0 && !!shellGate && shellGate.kind === "window",
    "gf9 a window gate is named for a ui file and for a file the shell main loads: "
    + JSON.stringify({ pane: paneGate && { gate: paneGate.gate, kind: paneGate.kind },
      shell: shellGate && { gate: shellGate.gate, kind: shellGate.kind },
      paneGates: names(pane.json), shellGates: names(shellFile.json) }));

  const pin = ask("tools/engine-pin");
  check(pin.code === 0 && names(pin.json).indexOf("tests/read-pin.mjs") > -1,
    "gf10 a gate that requires a pinned path is named for the pin file: " + JSON.stringify(names(pin.json)));

  fs.rmSync(path.join(lab, "src", "leaf.mjs"));
  const gone = ask("src/leaf.mjs");
  check(gone.code === 0 && names(gone.json).indexOf("tests/read-mod.mjs") > -1,
    "gf11 a tracked file gone from disk still names the gate that imports it: " + JSON.stringify(names(gone.json)));

  const decoy = fs.mkdtempSync(path.join(os.tmpdir(), "gates-for-decoy-"));
  try {
    git(["init", "-q"], decoy);
    const env = { ...process.env, GIT_DIR: decoy };
    delete env.GIT_INDEX_FILE;
    delete env.GIT_WORK_TREE;
    const res = spawnSync(process.execPath, ["tools/gates-for.mjs", "ui/pane.js"], { cwd: lab, encoding: "utf8", env });
    const line = (String(res.stdout || "").trim().split(/\r?\n/).pop() || "");
    let json = null;
    try { json = JSON.parse(line); } catch (e) { json = null; }
    const listed = git(["ls-files", "-z"], decoy).split("\0").filter(Boolean);
    const named = names(json).indexOf("tests/reads-screen.mjs") > -1;
    check(res.status === 0 && listed.length === 0 && named,
      "gf12 GIT_DIR set by the caller leaves that repo's index empty (" + listed.length
      + " entries) and the lab's window gate is still named: " + JSON.stringify(names(json)));
  } finally {
    try { fs.rmSync(decoy, { recursive: true, force: true }); } catch (e) { /* the decoy's own directory */ }
  }

  const tpl = ask("data/tpl.json");
  check(tpl.code === 0 && names(tpl.json).join() === "tests/read-tpl.mjs",
    "gf13 a file read only through a template literal names that gate: " + JSON.stringify(names(tpl.json))
    + (tpl.json ? "" : " (no JSON)"));

  const execd = ask("data/exec.txt");
  check(execd.code === 0 && names(execd.json).join() === "tests/read-exec.mjs",
    "gf14 a file read by a child loaded through execSync of a node command names that gate: "
    + JSON.stringify(names(execd.json)) + (execd.json ? "" : " (no JSON)"));

  const lab2 = fs.mkdtempSync(path.join(os.tmpdir(), "gates-for-lazy-"));
  try {
    const write2 = (rel, text) => {
      const at = path.join(lab2, rel);
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.writeFileSync(at, text);
    };
    write2("package.json", JSON.stringify({
      main: "shell/main.js",
      scripts: { test: "node tests/reads-app.mjs" },
    }, null, 2) + "\n");
    write2("shell/main.js", [
      "\"use strict\";",
      "const path = require(\"path\");",
      "const { pathToFileURL } = require(\"url\");",
      "const ROOT = path.resolve(__dirname, \"..\");",
      "function lazy(file) {",
      "  let mod = null;",
      "  return async () => mod || (mod = import(pathToFileURL(path.join(ROOT, \"src\", file)).href));",
      "}",
      "const studio = lazy(\"studio.mjs\");",
      "",
    ].join("\n"));
    write2("src/" + "studio.mjs", "export const n = 1;\n");
    write2("src/" + "only-lazy.mjs", "export const n = 2;\n");
    write2("ui/pane.js", "module.exports = \"pane\";\n");
    write2("tests/reads-app.mjs", [
      "import fs from \"node:fs\";",
      "fs.readFileSync(\"nope.txt\");",
      "window" + "Wall(\"plant\");",
      "",
    ].join("\n"));
    fs.mkdirSync(path.join(lab2, "tools"), { recursive: true });
    fs.copyFileSync(TOOL, path.join(lab2, "tools", "gates-for.mjs"));
    git(["init", "-q"], lab2);
    git(["add", "--", "package.json", "shell", "src", "ui", "tests", "tools"], lab2);
    const res = spawnSync(process.execPath, ["tools/gates-for.mjs", "src/" + "only-lazy.mjs"], { cwd: lab2, encoding: "utf8" });
    const line = (String(res.stdout || "").trim().split(/\r?\n/).pop() || "");
    let json = null;
    try { json = JSON.parse(line); } catch (e) { json = null; }
    const gate = (json && json.gates || []).find(g => g.gate === "tests/reads-app.mjs");
    check(res.status === 0 && !!gate && gate.kind === "window",
      "gf15 a window gate is named for a src file the app reaches only by joining ROOT inside a function: "
      + JSON.stringify(gate && { gate: gate.gate, kind: gate.kind }) + " gates " + JSON.stringify(names(json)));
  } finally {
    try { fs.rmSync(lab2, { recursive: true, force: true }); } catch (e) { /* the lazy plant's own directory */ }
  }

  const gfTool = await import("../tools/gates-for.mjs");
  const sharedList = gfTool.SHARED || [];
  const required = [
    "package.json", "package-lock.json", "electron-builder.js", "tools/build.mjs",
    "relay/wrangler.toml", "tests/engine.js", "tests/relay-lab.mjs",
    "tools/gate-run.mjs", "tools/gates-for.mjs", "tools/engine-pin"
  ];
  const allInShared = required.every(f => sharedList.includes(f));
  const isSharedFn = typeof gfTool.isSharedCode === "function";
  const identifies = isSharedFn && required.every(f => gfTool.isSharedCode(f));
  check(Array.isArray(gfTool.SHARED) && allInShared && identifies,
    "gf16 SHARED list is exported and isSharedCode identifies all members and config: "
    + (Array.isArray(gfTool.SHARED) ? sharedList.join(", ") : "not exported"));

  const toolsOnlyFn = typeof gfTool.isGateToolsOnly === "function" ? gfTool.isGateToolsOnly : () => "not exported";
  const toolCases = [
    [["tools/gate-run.mjs"], true],
    [["tools/gates-for.mjs", "tests/result-line.mjs", "tests/gates-for.mjs"], true],
    [["tools\\gate-run.mjs"], true],
    [["tools/gate-run.mjs", "src/leaf.mjs"], false],
    [["tools/gate-run.mjs", "package.json"], false],
    [["tools/machine-lock.mjs"], false],
    [["tools/child-cap.mjs", "tests/child-cap.mjs"], true],
    [[], false],
  ];
  const toolMisses = toolCases.filter(([files, want]) => toolsOnlyFn(files) !== want);
  check(toolMisses.length === 0,
    "gf17 a diff is confined to the gate tools only when every file is gate-run, gates-for or their own tests: "
    + (toolMisses.length ? "wrong on " + JSON.stringify(toolMisses.map(([f]) => f)) : toolCases.length + " cases right"));

  /* A diff that adds, removes or renames a file under tests/ selects chain-split (the test architect's edge, 2026-10-28:
     child-cap's test file reached no chain on a tools-only merge). Staged in a lab repository against its main. */
  const listLab = fs.mkdtempSync(path.join(os.tmpdir(), "gates-for-list-"));
  let listCases = [];
  try {
    fs.mkdirSync(path.join(listLab, "tests"));
    fs.mkdirSync(path.join(listLab, "src"));
    for (const f of ["tests/a.mjs", "tests/old.mjs", "src/x.mjs"]) fs.writeFileSync(path.join(listLab, f), "// " + f + "\n");
    git(["init", "-q", "-b", "main"], listLab);
    git(["add", "."], listLab);
    git(["-c", "user.name=lab", "-c", "user.email=lab@example.invalid", "commit", "-q", "-m", "lab"], listLab);
    fs.writeFileSync(path.join(listLab, "tests", "a.mjs"), "// changed\n");
    fs.writeFileSync(path.join(listLab, "tests", "b.mjs"), "// added\n");
    fs.rmSync(path.join(listLab, "tests", "old.mjs"));
    const listFn = typeof gfTool.testsListChanged === "function" ? gfTool.testsListChanged : () => "not exported";
    listCases = [
      [["tests/a.mjs"], false],
      [["tests/b.mjs"], true],
      [["tests/old.mjs"], true],
      [["tests/old.mjs", "tests/b.mjs"], true],
      [["src/x.mjs", "tests/a.mjs"], false],
      [[], false],
    ].map(([files, want]) => [files, want, listFn(listLab, files, "main")]);
  } finally {
    try { fs.rmSync(listLab, { recursive: true, force: true }); } catch (e) { /* the leg's own directory */ }
  }
  const listMisses = listCases.filter(([, want, got]) => got !== want);
  check(listCases.length === 6 && listMisses.length === 0,
    "gf18 a test file added, removed or renamed against the base selects chain-split, a test file only changed does not: "
    + (listMisses.length ? "wrong on " + JSON.stringify(listMisses) : listCases.length + " cases right"));

  const scanMiss = [];
  if (!gfTool.SCANS || typeof gfTool.globMatches !== "function") scanMiss.push("SCANS missing");
  else {
    const tracked = git(["ls-files", "-z"], ROOT).split("\0").filter(Boolean);
    for (const [leg, globs] of Object.entries(gfTool.SCANS)) {
      if (!Array.isArray(globs) || !globs.length) { scanMiss.push(leg + " empty"); continue; }
      for (const g of globs) if (!tracked.some(f => gfTool.globMatches(g, f))) scanMiss.push(leg + " " + g);
    }
  }
  check(scanMiss.length === 0,
    "gf19 every scan glob matches a tracked file: "
    + (scanMiss.length ? scanMiss.join("; ") : Object.keys(gfTool.SCANS).length + " legs"));


  /* storage-carry is a browser leg, so it lives in the release profile and the nightly, not in `test`; a merge touching the
     carries it reads runs it through gates-for (the test architect, 2026-11-01 07:17: it rotted unseen while only
     tools/release.mjs's acceptance run called it). */
  let namedForPack = "";
  try { namedForPack = execFileSync(process.execPath, [path.join(ROOT, "tools", "gates-for.mjs"), "src/modules/pack.js"], { cwd: ROOT, encoding: "utf8" }); }
  catch (e) { namedForPack = String(e && e.stdout || ""); }
  check(/tests\/storage-carry\.js/.test(namedForPack),
    "gf20 a change to src/modules/pack.js, whose carries storage-carry reads, names tests/storage-carry.js: "
    + (/tests\/storage-carry\.js/.test(namedForPack) ? "named" : "not named"));
  const grTool = await import("../tools/gate-run.mjs");
  const pkgNow = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const relFiles = typeof grTool.profileSteps === "function" ? grTool.profileSteps(ROOT, pkgNow).map(s => s.file) : [];
  const inTest = /tests\/storage-carry\.js/.test(String((pkgNow.scripts || {}).test || ""));
  check(relFiles.includes("tests/storage-carry.js") && !inTest,
    "gf21 the release profile runs tests/storage-carry.js and `test` does not: profile " + relFiles.includes("tests/storage-carry.js") + ", in test " + inTest);

  /* swap.mjs is a browser leg, so it lives in the release profile and the nightly, not in `test`; a merge touching the
     files it reads runs it through gates-for (the test architect, 2026-11-08: kept from rotting as a nightly-only leg). */
  let namedForSwap = "";
  try { namedForSwap = execFileSync(process.execPath, [path.join(ROOT, "tools", "gates-for.mjs"), "engine/etiuda.html"], { cwd: ROOT, encoding: "utf8" }); }
  catch (e) { namedForSwap = String(e && e.stdout || ""); }
  check(/tests\/swap\.mjs/.test(namedForSwap),
    "gf22 a change to engine/etiuda.html, which swap.mjs reads, names tests/swap.mjs: "
    + (/tests\/swap\.mjs/.test(namedForSwap) ? "named" : "not named"));
  const inTestSwap = /tests\/swap\.mjs/.test(String((pkgNow.scripts || {}).test || ""));
  check(relFiles.includes("tests/swap.mjs") && !inTestSwap,
    "gf23 the release profile runs tests/swap.mjs and `test` does not: profile " + relFiles.includes("tests/swap.mjs") + ", in test " + inTestSwap);

  /* The desk trust leg copies all of src/ and the result line reads whole directories, so the trace
     names them for a file they do not judge. The subject is a ceiling: motion.js reaches neither,
     the trust module still reaches the desk, and the gate runner still reaches the result line. */
  const ceilingFiles = ["src/modules/motion.js", "src/modules/catalog-trust.js", "tools/gate-run.mjs", "shell/main.js"];
  let ceilingRows = [];
  let ceilingErr = "";
  try { ceilingRows = gfTool.gatesFor(ROOT, ceilingFiles); }
  catch (e) { ceilingErr = String(e && e.message || e); }
  const namedFor = (file) => new Set((ceilingRows || []).filter(r => (r.chains || []).some(c => c.file === file)).map(r => r.gate));
  const motionNames = namedFor("src/modules/motion.js");
  const trustNames = namedFor("src/modules/catalog-trust.js");
  const toolNames = namedFor("tools/gate-run.mjs");
  const shellNames = namedFor("shell/main.js");
  const deskLeg = "tests/catalog-trust-desk.mjs";
  const lineLeg = "tests/result-line.mjs";
  const ceilingMiss = [];
  if (ceilingErr) ceilingMiss.push(ceilingErr);
  if (motionNames.has(deskLeg)) ceilingMiss.push("motion.js names the desk");
  if (motionNames.has(lineLeg)) ceilingMiss.push("motion.js names result-line");
  if (!trustNames.has(deskLeg)) ceilingMiss.push("catalog-trust.js misses the desk");
  if (!toolNames.has(lineLeg)) ceilingMiss.push("gate-run.mjs misses result-line");
  if (shellNames.has(deskLeg)) ceilingMiss.push("shell/main.js names the desk");
  check(ceilingMiss.length === 0,
    "gf24 the desk trust leg and the result line run only for their subject: "
    + (ceilingMiss.length ? ceilingMiss.join("; ") : "motion.js names neither, catalog-trust.js names the desk, gate-run names the result line, shell/main.js does not name the desk"));

  const subject = gfTool.SUBJECT;
  const subjectMiss = [];
  if (!subject || typeof subject !== "object") subjectMiss.push("SUBJECT missing");
  else {
    let tracked = null;
    try { tracked = new Set(git(["ls-files", "-z"], ROOT).split("\0").filter(Boolean)); }
    catch (e) { subjectMiss.push("ls-files failed"); }
    for (const [leg, list] of Object.entries(subject)) {
      if (tracked && !tracked.has(leg)) subjectMiss.push(leg + " untracked");
      if (!Array.isArray(list) || !list.length) { subjectMiss.push(leg + " empty"); continue; }
      if (tracked) for (const f of list) if (!tracked.has(f)) subjectMiss.push(leg + " " + f);
    }
    const lineList = subject[lineLeg] || [];
    const gateTools = gfTool.GATE_TOOLS || [];
    if (lineList.length !== gateTools.length || gateTools.some(t => !lineList.includes(t))) subjectMiss.push("result-line subject is not the gate tools");
    if (!Array.isArray(subject[deskLeg])) subjectMiss.push("desk subject missing");
  }
  check(subjectMiss.length === 0,
    "gf25 every subject path is a tracked file and the result line's subject is the gate tools: "
    + (subjectMiss.length ? subjectMiss.join("; ") : Object.keys(subject).length + " legs"));

  /* Relay-channel parts: a file selects the parts that import or read it. The release part p939 is still
     named by the graph; the merge plan drops it. While relayChannelParts is missing, these are red. */
  const channelParts = typeof gfTool.relayChannelParts === "function" ? gfTool.relayChannelParts : null;
  const joinParts = channelParts ? channelParts(ROOT, ["src/modules/team-join.js"]) : null;
  check(Array.isArray(joinParts) && joinParts.includes("p987") && !joinParts.includes("p940") && !joinParts.includes("p921") && !joinParts.includes("p939"),
    "gf26 src/modules/team-join.js selects p987 and not the channel, cancel or live-path parts: "
    + (joinParts ? joinParts.join(",") : "relayChannelParts missing"));
  const attackParts = channelParts ? channelParts(ROOT, ["relay/test/attacks.mjs"]) : null;
  check(Array.isArray(attackParts) && attackParts.includes("p943") && attackParts.length === 1,
    "gf27 relay/test/attacks.mjs selects p943 only: " + (attackParts ? attackParts.join(",") : "relayChannelParts missing"));
  const packParts = channelParts ? channelParts(ROOT, ["src/modules/pack.js"]) : null;
  check(Array.isArray(packParts) && packParts.length === 0,
    "gf28 src/modules/pack.js selects no relay-channel part: " + (packParts ? String(packParts.length) : "relayChannelParts missing"));

  const releaseParts = grTool.RELEASE_ONLY_PARTS;
  check(Array.isArray(releaseParts) && releaseParts.includes("p939") && !releaseParts.includes("p919") && !releaseParts.includes("p921"),
    "gf31 the live-path part p939 is release-only, and the refusal parts stay at merge: "
    + (Array.isArray(releaseParts) ? releaseParts.join(",") : "RELEASE_ONLY_PARTS missing"));

  function channelOnly(plan) {
    const steps = (plan && plan.steps || []).filter(s => String(s.file || "").replace(/\\/g, "/") === "tests/relay-channel.mjs");
    if (steps.length !== 1) return "steps " + steps.length;
    return String((steps[0].env || {}).RELAY_CHANNEL_ONLY || "");
  }
  const joinPlan = await grTool.planAreaRun(ROOT, ["src/modules/team-join.js"], pkgNow);
  const joinOnly = channelOnly(joinPlan).split(",").filter(Boolean);
  check(joinOnly.includes("p987") && !joinOnly.includes("p939") && !joinOnly.includes("p921"),
    "gf29 a team-join change runs p987 and not the live path or the cancel part: " + joinOnly.join(","));
  const shellPlan = await grTool.planAreaRun(ROOT, ["shell/main.js"], pkgNow);
  const shellOnly = channelOnly(shellPlan).split(",").filter(Boolean);
  check(shellOnly.includes("p919") && shellOnly.includes("p940") && shellOnly.includes("p946") && !shellOnly.includes("p939"),
    "gf30 a shell change keeps the sealing and refusal parts and drops the live path: " + shellOnly.join(","));

  check(asserted === EXPECTED - 1, "gf8 every leg ran: " + (asserted + 1) + " of " + EXPECTED);
} catch (e) {
  check(false, "gf the plant did not run: " + (e && e.stack || e));
} finally {
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) { /* the plant's own directory */ }
}

process.stdout.write("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED + "\n");
process.stdout.write(failed ? "RESULT: FAIL " + failed + " failed\n" : "RESULT: ok " + asserted + " check(s)\n");
process.exit(failed ? 1 : 0);
