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
const EXPECTED = 16;

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

  check(asserted === EXPECTED - 1, "gf8 every leg ran: " + (asserted + 1) + " of " + EXPECTED);
} catch (e) {
  check(false, "gf the plant did not run: " + (e && e.stack || e));
} finally {
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) { /* the plant's own directory */ }
}

process.stdout.write("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED + "\n");
process.stdout.write(failed ? "RESULT: FAIL " + failed + " failed\n" : "RESULT: ok " + asserted + " check(s)\n");
process.exit(failed ? 1 : 0);
