/* A TEST RUN READS NO PART OF THE REAL MACHINE'S REGISTRY, as it writes none. The guard is at the shell's own reg calls
 * (shell/win-proxy.cjs, regOpts): outside Electron's main process a reg call goes ahead only through a function marked as a
 * stand-in (tests/reg-stand.cjs marks its own), and is refused before reg.exe starts. This leg holds every reg call in the
 * shell to that guard by reading the source, and shows the guard refusing in a bare node process. Node only.
 *
 *   node tests/reg-guard.mjs
 *
 * The case that made it (2026-11-15, the test architect's measurement): nine legs loading the shell in bare node read this
 * machine's registry on every run, HKLM\SOFTWARE\Policies\Etiuda by export, the proxy keys of HKCU and HKLM, and HKCU's DWM
 * key, because nothing stood in for reg.exe there. Nothing here starts reg.exe: every process this leg runs has an
 * unmarked counting stand-in in place of child_process's reg calls, which answers "missing" and counts. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHELL = path.join(ROOT, "shell");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 12;
let checks = 0, skipped = 0, failed = 0;
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failed++; };
const skip = (what) => { skipped++; console.log("  NOT RUN " + what); };

/* Comments out, strings kept, as tests/harness-writes.mjs reads the shell. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1");
function shellFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") out.push(...shellFiles(p)); }
    else if (/\.(?:c?js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
/* The text of a call from its opening bracket, brackets and strings balanced, and its top-level arguments. */
function callArgs(src, open) {
  let depth = 0, quote = "", start = open + 1;
  const args = [];
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === "\\") { i++; continue; } if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) { args.push(src.slice(start, i).trim()); return args; }
    } else if (c === "," && depth === 1) { args.push(src.slice(start, i).trim()); start = i + 1; }
  }
  return null;
}

/* ---- the source: every reg call in the shell passes its options through regOpts, naming its own callee ---- */
function judgeSource(files) {
  const calls = [], bare = [], spellings = [];
  for (const [rel, raw] of files) {
    const src = code(raw);
    for (const m of src.matchAll(/\b(execFileSync|execFile|spawnSync|spawn)\s*\(\s*REG_TOOL\s*,/g)) {
      const args = callArgs(src, m.index + m[0].indexOf("("));
      const third = args && args[2] ? args[2] : "";
      const guarded = new RegExp("^regOpts\\(\\s*" + m[1] + "\\s*,").test(third);
      calls.push(rel + " " + m[1]);
      if (!guarded) bare.push(rel + " " + m[1] + " at " + src.slice(0, m.index).split("\n").length);
    }
    /* Any other way to name the program: a string ending reg or reg.exe outside the one constant, or a shell command naming it. */
    for (const m of src.matchAll(/(["'`])((?:[^"'`\n\\]|\\.)*)\1/g)) {
      if (!/(?:^|[\\/ ])reg(?:\.exe)?$/i.test(m[2]) && !/^reg(?:\.exe)?(?:\s|$)/i.test(m[2])) continue;
      const line = src.slice(src.lastIndexOf("\n", m.index) + 1, src.indexOf("\n", m.index));
      if (/^\s*const REG_TOOL = "C:\\\\Windows\\\\System32\\\\reg\.exe";\s*$/.test(line)) continue;
      spellings.push(rel + ": " + line.trim().slice(0, 120));
    }
  }
  return { calls, bare, spellings };
}
const files = shellFiles(SHELL).map((p) => [path.relative(ROOT, p).replace(/\\/g, "/"), fs.readFileSync(p, "utf8")]);
const live = judgeSource(files);
check(live.calls.length >= 4 && live.bare.length === 0,
  "g1 every reg call in the shell passes its options through regOpts naming its own callee: " + live.calls.length + " call(s)"
  + (live.bare.length ? ", bare: " + live.bare.join("; ") : ""));
check(live.spellings.length === 0, "g2 the shell names reg.exe only as REG_TOOL at its fixed path"
  + (live.spellings.length ? ": " + live.spellings.join(" | ") : ""));
/* The same reading, shown red: a call written without the guard, and the program named another way. */
const planted = judgeSource([["planted.js", 'const REG_TOOL = "C:\\\\Windows\\\\System32\\\\reg.exe";\n'
  + 'execFileSync(REG_TOOL, ["query", "HKCU\\\\X"], { encoding: "utf8" });\n'
  + 'execFileSync(REG_TOOL, ["query", "HKCU\\\\Y"], regOpts(execFile, {}));\n'
  + 'execFileSync("C:\\\\Windows\\\\reg.exe", ["query", "HKCU\\\\Z"]);\n']]);
check(planted.bare.length === 2 && planted.spellings.length === 1,
  "g3 the reading goes red on an unguarded call, a guard naming another callee, and reg.exe named in place: "
  + JSON.stringify({ bare: planted.bare.length, spellings: planted.spellings.length }));
const mainSrc = code(fs.readFileSync(path.join(SHELL, "main.js"), "utf8"));
check(/const\s*\{[^}]*\bregOpts\b[^}]*\}\s*=\s*require\(path\.join\(__dirname,\s*"win-proxy\.cjs"\)\)/.test(mainSrc),
  "g4 shell/main.js takes regOpts from shell/win-proxy.cjs, so its reg calls meet the same guard");

/* ---- the guard at work, in a bare node process: win-proxy's three reads with an unmarked and with a marked stand-in ---- */
const PROBE = String.raw`
"use strict";
const cp = require("node:child_process");
const { syncBuiltinESMExports } = require("node:module");
const path = require("node:path");
const isReg = (f) => /^reg(\.exe)?$/i.test(path.win32.basename(String(f || "")));
let reached = 0;
for (const k of ["execFileSync", "execFile", "spawnSync", "spawn", "execSync", "exec"]) {
  const real = cp[k];
  cp[k] = function (file) {
    const named = /^exec(Sync)?$/.test(k) ? String(file).split(/\s+/)[0] : file;
    if (isReg(named)) { reached++; const e = new Error("missing"); e.status = 1; throw e; }
    return real.apply(this, arguments);
  };
  if (process.env.MARK === "1") cp[k][Symbol.for("etiuda.reg-stand")] = true;
}
syncBuiltinESMExports();
Object.defineProperty(process, "platform", { value: "win32" });
const W = require(process.env.WIN_PROXY);
const switches = W.windowsProxySwitches();
process.stdout.write(JSON.stringify({ reached, refused: W.regOpts ? W.regOpts.refused : null, switches }));
`;
const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-reg-guard-"));
const probeFile = path.join(lab, "probe.cjs");
fs.writeFileSync(probeFile, PROBE);
function probe(winProxy, mark) {
  const r = spawnSync(process.execPath, [probeFile], { encoding: "utf8", windowsHide: true, timeout: 30000,
    env: Object.assign({}, process.env, { WIN_PROXY: winProxy, MARK: mark ? "1" : "0" }) });
  try { return JSON.parse(r.stdout); } catch { return { error: (r.stderr || "").slice(0, 300) }; }
}
const realWp = path.join(SHELL, "win-proxy.cjs");
const bareRun = probe(realWp, false);
check(bareRun.reached === 0 && bareRun.refused >= 1 && Array.isArray(bareRun.switches) && bareRun.switches.length === 0,
  "g5 in bare node an unmarked child_process meets the guard: no reg call reaches it, the read is refused and leaves Chromium's resolver: "
  + JSON.stringify(bareRun));
const standRun = probe(realWp, true);
check(standRun.reached >= 1 && standRun.refused === 0,
  "g6 a marked stand-in is let through, so the legs that stand in for reg.exe still read their scripted keys: " + JSON.stringify(standRun));
if (PLANTS_OFF) skip("g7 lifting plant:reg-guard lets the unmarked call reach reg: NOT RUN");
else {
  const src = fs.readFileSync(realWp, "utf8");
  const lines = src.split("\n");
  const at = lines.findIndex((l) => l.includes("/* plant:reg-guard */"));
  let got = { error: "no plant:reg-guard line" };
  if (at >= 0) {
    lines[at] = "";
    const copy = path.join(lab, "win-proxy-planted.cjs");
    fs.writeFileSync(copy, lines.join("\n"));
    got = probe(copy, false);
  }
  check(got.reached >= 1, "g7 lifting plant:reg-guard lets the unmarked call reach reg: " + JSON.stringify(got));
}
/* ---- the window half: a shell the harness launches in Electron, where the guard lets a reg call through ---- */
const engineSrc = code(fs.readFileSync(path.join(ROOT, "tests", "engine.js"), "utf8"));
const launchFn = (() => { const at = engineSrc.indexOf("function shellLaunch("); return at < 0 ? "" : engineSrc.slice(at, engineSrc.indexOf("\n}", at)); })();
check(/reg-stand-preload\.cjs/.test(launchFn) && /--require "' \+ regStandAt \+ '"/.test(launchFn) && /NODE_OPTIONS/.test(launchFn),
  "g8 shellLaunch, the one door a harness launch of the shell goes through, preloads reg-stand-preload.cjs into Electron's main process");
const PRELOAD_PROBE = String.raw`
"use strict";
Object.defineProperty(process, "type", { value: "browser" });
Object.defineProperty(process, "platform", { value: "win32" });
const W = require(process.env.WIN_PROXY);
const switches = W.windowsProxySwitches();
const st = globalThis.__ETIUDA_REG_STAND__;
process.stdout.write(JSON.stringify({ stood: !!st, proxy: st ? st.calls.proxy : null, reached: st ? st.calls.reached : null, switches }));
`;
const preloadProbe = path.join(lab, "preload-probe.cjs");
fs.writeFileSync(preloadProbe, PRELOAD_PROBE);
const pre = (() => {
  const r = spawnSync(process.execPath, ["--require", path.join(ROOT, "tests", "reg-stand-preload.cjs"), preloadProbe],
    { encoding: "utf8", windowsHide: true, timeout: 30000, env: Object.assign({}, process.env, { WIN_PROXY: realWp }) });
  try { return JSON.parse(r.stdout); } catch { return { error: (r.stderr || "").slice(0, 300) }; }
})();
check(pre.stood === true && pre.proxy >= 1 && pre.reached === 0 && Array.isArray(pre.switches) && pre.switches.length === 0,
  "g9 a main process with the preload, taken for Electron's, reads the proxy keys from the stand-in and none from the machine: " + JSON.stringify(pre));
/* The harness's own reads: a reg.exe named as the program anywhere under tests/ or tools/ but the stood-in one. tools/runner runs on a
   hosted runner alone; tests/relay-channel.mjs 942f runs after reg-stand is in place and holds it with regStand.held(). */
/* The install guard reads the account's keys only off a desk (g11 below), on a hosted runner, and its self-test writes its own lab key only
   off a desk (it refuses where the sentinel stands). */
const HARNESS_OK = new Set(["tests/relay-channel.mjs", "tests/install-guard.cjs", "tests/install-guard-selftest.js"]);
const harnessFiles = ["tests", "tools"].flatMap((d) => shellFiles(path.join(ROOT, d)))
  .map((p) => path.relative(ROOT, p).replace(/\\/g, "/"))
  .filter((r) => !r.startsWith("tools/runner/") && !HARNESS_OK.has(r) && r !== "tests/reg-guard.mjs");
const direct = harnessFiles.filter((r) => /\b(?:execFileSync|execFile|spawnSync|spawn)\s*\(\s*["'`][^"'`]*reg(?:\.exe)?["'`]/i.test(code(fs.readFileSync(path.join(ROOT, r), "utf8"))));
check(direct.length === 0, "g10 no harness file starts reg.exe itself" + (direct.length ? ": " + direct.join(", ") : ""));

/* ---- the install guard on a desk: it refuses before it reads ---- */
const GUARD_PROBE = String.raw`
"use strict";
const cp = require("node:child_process");
const { syncBuiltinESMExports } = require("node:module");
const path = require("node:path");
const isReg = (f) => /^reg(\.exe)?$/i.test(path.win32.basename(String(f || "")));
let reached = 0;
for (const k of ["execFileSync", "execFile", "spawnSync", "spawn"]) {
  const real = cp[k];
  cp[k] = function (file) {
    if (isReg(file)) { reached++; return { status: 1, stdout: "", stderr: "", error: null }; }
    return real.apply(this, arguments);
  };
}
syncBuiltinESMExports();
Object.defineProperty(process, "platform", { value: "win32" });
const G = require(process.env.GUARD);
const home = process.env.GUARD_HOME;
let g = {};
try { g = G.guardStart({ env: { USERPROFILE: home }, home }); } catch (e) { g = { refusals: [], before: null }; }
process.stdout.write(JSON.stringify({ reached, refusals: (g.refusals || []).length, read: !!g.before }));
`;
const guardProbe = path.join(lab, "guard-probe.cjs");
fs.writeFileSync(guardProbe, GUARD_PROBE);
const deskHome = fs.mkdtempSync(path.join(lab, "desk-home-"));
fs.writeFileSync(path.join(deskHome, ".etiuda-no-installers"), "");
function guardRun(guardFile) {
  const r = spawnSync(process.execPath, [guardProbe], { encoding: "utf8", windowsHide: true, timeout: 30000,
    env: Object.assign({}, process.env, { GUARD: guardFile, GUARD_HOME: deskHome }) });
  try { return JSON.parse(r.stdout); } catch { return { error: (r.stderr || "").slice(0, 300) }; }
}
const realGuard = path.join(ROOT, "tests", "install-guard.cjs");
const onDesk = guardRun(realGuard);
check(onDesk.reached === 0 && onDesk.refusals >= 1 && onDesk.read === false,
  "g11 on a desk (the no-installers sentinel in its home) the install guard refuses before it reads: no reg call, no snapshot: " + JSON.stringify(onDesk));
if (PLANTS_OFF) skip("g12 lifting plant:guard-desk-first reads the desk's registry before refusing: NOT RUN");
else {
  const lines = fs.readFileSync(realGuard, "utf8").split("\n");
  const at = lines.findIndex((l) => l.includes("/* plant:guard-desk-first */"));
  let got = { error: "no plant:guard-desk-first line" };
  if (at >= 0) {
    lines[at] = "";
    const copyDir = fs.mkdtempSync(path.join(lab, "guard-copy-"));
    /* The copy beside its own requires: the guard takes tools/test-identity.cjs by a relative path. */
    fs.mkdirSync(path.join(copyDir, "tests"));
    fs.mkdirSync(path.join(copyDir, "tools"));
    fs.copyFileSync(path.join(ROOT, "tools", "test-identity.cjs"), path.join(copyDir, "tools", "test-identity.cjs"));
    fs.writeFileSync(path.join(copyDir, "tests", "install-guard.cjs"), lines.join("\n"));
    got = guardRun(path.join(copyDir, "tests", "install-guard.cjs"));
  }
  check(got.reached >= 1, "g12 lifting plant:guard-desk-first reads the desk's registry before refusing: " + JSON.stringify(got));
}
try { fs.rmSync(lab, { recursive: true, force: true }); } catch { /* the temp folder's own clean-up */ }

console.log("#counts checks=" + checks + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (checks + skipped !== EXPECTED) { console.log("  FAIL ran " + (checks + skipped) + " of " + EXPECTED); process.exit(78); }
process.exit(Math.min(failed, 63));
