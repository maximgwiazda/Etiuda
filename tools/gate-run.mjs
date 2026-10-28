/* Every gate writes one machine-readable line per run, board item 442.
 *
 *   node tools/gate-run.mjs test split-guard        the two fast chains
 *   node tools/gate-run.mjs shell-smoke             one gate, one line
 *   node tools/gate-run.mjs area [base]             area run with plant-hold bracket
 *   node tools/gate-run.mjs nightly                 nightly profile outside %TEMP%
 *   node tools/gate-run.mjs wait-lock               wait for machine lock
 *   node tools/gate-run.mjs mark-cause <rec> <cause> <escaped|not-escaped>   mark one red of one run (rule 10)
 *   ETIUDA_RUNS=<folder> node tools/gate-run.mjs …  somewhere else to write them
 *
 * A step whose file carries the alone marker in its first 15 lines runs after every step that
 * does not, and the log names it. The marker and the rule sit beside deferAlone.
 */
import { spawn, spawnSync, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquire as takeLock, release as freeLock, holderAlive } from "./machine-lock.mjs";

async function loadGatesFor() {
  try {
    return await import("./gates-for.mjs");
  } catch (e) {
    return null;
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NO_VERDICT = 78;

const DEFAULT_LOCK_PATH = "C:/Users/maxim/Workspace/etiuda-runs/machine.lock";
export const LOCK_PATH = path.resolve(process.env.ETIUDA_LOCK_PATH || DEFAULT_LOCK_PATH);


/* The relay core for an unmapped engine relay file, the test architect's choice (2026-10-28 00:13): the five relay files
   once each, whole, about three minutes. No single-leg switch exists in relay-unit or relay-channel, so legs named one by one
   ran each file whole, nine times over. It changes by his word only, or when real switches land. */
export const RELAY_CORE = [
  { step: "relay-unit", leg: "whole", file: "tests/relay-unit.mjs", env: {} },
  { step: "relay-channel", leg: "whole", file: "tests/relay-channel.mjs", env: {} },
  { step: "relay-blob", leg: "whole", file: "tests/relay-blob.mjs", env: {} },
  { step: "relay-stub", leg: "whole", file: "tests/relay-stub.mjs", env: {} },
  { step: "relay-workerd", leg: "whole", file: "tests/relay-workerd.mjs", env: {} },
];

export const RELEASE_ONLY_LEGS = [
  "tests/desk-growth.mjs",
  "tests/engine-selftest.js",
  "tests/leg-ids.js",
  "tests/result-line.mjs",
  "tests/machine-lock.mjs",
  "tests/sbom.mjs",
  "tests/text-scan-selftest.js",
];

export const NIGHTLY_LEGS = [
  { script: "nightly", file: "tests/desk-growth.mjs", args: [], cmd: "node tests/desk-growth.mjs" },
  { script: "nightly", file: "tests/leg-ids.js", args: [], cmd: "node tests/leg-ids.js" },
  { script: "nightly", file: "tests/engine-selftest.js", args: [], cmd: "node tests/engine-selftest.js" },
  { script: "nightly", file: "tests/result-line.mjs", args: [], cmd: "node tests/result-line.mjs" },
  { script: "nightly", file: "tests/machine-lock.mjs", args: [], cmd: "node tests/machine-lock.mjs" },
  { script: "nightly", file: "tests/text-scan-selftest.js", args: [], cmd: "node tests/text-scan-selftest.js" },
  { script: "nightly", file: "tests/sbom.mjs", args: [], cmd: "node tests/sbom.mjs" },
];

export const FLOOR = [
  { step: "pick 5a-5f", file: "tests/pick.mjs", cmd: "node tests/pick.mjs", args: [] },
  { step: "links open-external (line 92)", file: "tests/links.js", cmd: "node tests/links.js open-external", args: ["open-external"] },
  { step: "relay-unit 13b", file: "tests/relay-unit.mjs", cmd: "node tests/relay-unit.mjs", args: [] },
  { step: "update-install U0d", file: "tests/update-install.js", cmd: "node tests/update-install.js U0d", args: ["U0d"] },
  { step: "team-join 15by-15bz", file: "tests/team-join.mjs", cmd: "node tests/team-join.mjs", args: [] },
  { step: "test checkCatalogRoundTrip", file: "tests/test.js", cmd: "node tests/test.js", args: [] },
];

/* The test architect's named core for a product file gates-for maps to no leg, outside the relay (his role file; office
   bcb48c64, 2026-10-28 00:03): seven node legs, about 65 s. It changes by his word only. */
export const PRODUCT_CORE = [
  { step: "test", file: "tests/test.js", cmd: "node tests/test.js", args: [] },
  { step: "team-join", file: "tests/team-join.mjs", cmd: "node tests/team-join.mjs", args: [] },
  { step: "link-handler", file: "tests/link-handler.mjs", cmd: "node tests/link-handler.mjs", args: [] },
  { step: "rollback-floor", file: "tests/rollback-floor.mjs", cmd: "node tests/rollback-floor.mjs", args: [] },
  { step: "catalog-trust", file: "tests/catalog-trust.mjs", cmd: "node tests/catalog-trust.mjs", args: [] },
  { step: "sellable", file: "tests/sellable.mjs", cmd: "node tests/sellable.mjs", args: [] },
  { step: "catalog-sig", file: "tests/catalog-sig.js", cmd: "node tests/catalog-sig.js", args: [] },
];

function refuse(what, how) {
  console.log("  FAIL " + what);
  if (how) console.log("       " + how);
  console.log("  SUITE DID NOT COMPLETE");
  process.exit(NO_VERDICT);
}

function inside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function sameFolder(a, b) {
  try {
    const norm = (p) => {
      const r = fs.realpathSync.native(p);
      return process.platform === "win32" ? r.toLowerCase() : r;
    };
    return path.relative(norm(a), norm(b)) === "";
  } catch (e) {
    return false;
  }
}

function mainTree() {
  const top = git(["rev-parse", "--path-format=absolute", "--show-toplevel"]);
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!top || !common || !sameFolder(top, ROOT)) return ROOT;
  return path.basename(common) === ".git" ? path.dirname(path.resolve(common)) : ROOT;
}

/* The lock is tools/machine-lock.mjs's: the holder is a PID with its process creation time, stale only when no process has
   that pair, age a warning only (rule 13; agreed by the test architect and Claude beta, 2026-10-28 00:46). These keep
   gate-run's own names. */
export function isLockStale(existing) {
  return !holderAlive(existing);
}

let heldLockPath = null;

export function acquireLock(lockPath = LOCK_PATH, what = "run", tree = ROOT, waitTimeoutMs = 300000) {
  const r = takeLock({ lockPath, what, tree, waitMs: waitTimeoutMs, say: (l) => console.log(l.replace(/^machine-lock:/, "gate-run:")) });
  if (r.ok) heldLockPath = lockPath;
  return { ok: r.ok, staleTakenOver: !!r.takenOver, heldBy: r.heldBy, reason: r.ok ? "" : (r.reason.indexOf("held by") >= 0 && waitTimeoutMs > 0
    ? "timed out waiting for " + r.reason : r.reason) };
}

export function releaseLock(lockPath = heldLockPath || LOCK_PATH) {
  if (!lockPath) return;
  freeLock({ lockPath });
  if (heldLockPath === lockPath) heldLockPath = null;
}

process.on("exit", () => { releaseLock(); });
process.on("SIGINT", () => { releaseLock(); process.exit(130); });
process.on("SIGTERM", () => { releaseLock(); process.exit(143); });

export function appendChainLine(record, chainsPath = CHAINS_PATH) {
  const dir = path.dirname(chainsPath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const line = {
    gate: record.gate,
    tree: record.tree || ROOT,
    head: record.head || "no commit",
    treeSha: record.treeSha || "",
    gitTree: record.gitTree || "",
    start: record.start,
    end: record.end,
    counts: record.counts || {},
    reds: (record.reds || []).map(r => ({
      gate: r.gate,
      cmd: r.cmd,
      exit: r.exit,
      cause: r.cause || "unread",
    })),
    staleTakenOver: record.staleTakenOver || false,
    /* Which gates ate the run: one entry per gate run, in order, each with its wall-clock and its verdict. */
    gates: (record.gates || []).map(g => ({ gate: g.gate, wallMs: g.wallMs, exit: g.exit })),
    /* The window gates this run's diff reached and left out: a merge that needs an argued window run, counted by the week review. */
    walled: record.walled || [],
  };
  fs.appendFileSync(chainsPath, JSON.stringify(line) + "\n", "utf8");
  return line;
}

/* THE YIELD LEDGER'S MARKS (rule 10). A mark names one red of one run and changes nothing else: it is appended to marks.jsonl
   beside chains.jsonl, keyed by the run's head, start and gate and the red gate's name, and neither chains.jsonl nor a gate's
   record is ever rewritten, so no run's line can be lost to a mark made while another run appends. A later mark of the same
   red supersedes an earlier one; the earlier stays in the file. Asked by the test architect, 2026-10-28 09:38. */
export const MARK_CAUSES = ["product-catch", "blind-leg", "test-fault", "machine"];
export const MARK_ESCAPES = ["escaped", "not-escaped"];

export function readMarks(marksPath = MARKS_PATH) {
  let raw = "";
  try { raw = fs.readFileSync(marksPath, "utf8"); } catch (e) { return []; }
  const out = [];
  for (const l of raw.split(/\r?\n/)) { if (!l) continue; try { out.push(JSON.parse(l)); } catch (e) { /* a torn line is skipped */ } }
  return out;
}

/** The latest mark of one red of one chains line ({cause, escaped, marked, ...}), or null while it is unread. */
export function markOf(chainLine, redGate, marks) {
  let found = null;
  for (const m of marks) {
    if (m.run && m.run.head === chainLine.head && m.run.start === chainLine.start && m.run.gate === chainLine.gate
      && m.gate === redGate) found = m;
  }
  return found;
}

/** The one chains line a gate's record belongs to: by the run's start where the record carries it, otherwise by its commit and
    its time inside the run; either way exactly one line, and one that holds this red. */
export function chainLineOfRecord(rec, chainsPath = CHAINS_PATH) {
  let raw = "";
  try { raw = fs.readFileSync(chainsPath, "utf8"); } catch (e) { return { line: null, why: "no chains.jsonl at " + chainsPath }; }
  const lines = [];
  for (const l of raw.split(/\r?\n/)) { if (!l) continue; try { lines.push(JSON.parse(l)); } catch (e) { /* a torn line is skipped */ } }
  const t = Date.parse(rec.time || "");
  const hits = lines.filter(c => c.head === (rec.commit || "no commit")
    && (rec.run ? c.start === rec.run : (Number.isFinite(t) && Date.parse(c.start) <= t && t <= Date.parse(c.end)))
    && Array.isArray(c.reds) && c.reds.some(r => r.gate === rec.gate));
  if (hits.length === 1) return { line: hits[0], why: "" };
  return { line: null, why: hits.length ? hits.length + " runs in chains.jsonl could hold this red" : "no run in chains.jsonl holds this red" };
}

function parseStepsFromScript(pkg, scriptName) {
  const cmd = pkg.scripts && pkg.scripts[scriptName];
  if (!cmd) return [];
  const out = [];
  for (const raw of cmd.split("&&")) {
    const step = raw.trim();
    if (!step) continue;
    const m = /^node\s+(\S+)\s*(.*)$/.exec(step);
    if (m) out.push({ script: scriptName, cmd: step, file: m[1], args: m[2] ? m[2].split(/\s+/) : [] });
  }
  return out;
}

/* Every merge runs every FLOOR entry, a fail-closed one included (the test architect's E1, office 6a3c8b52): the whole chain
   is package.json's test script, which need not hold a floor file, so each entry it does not already run, by the same
   command or by its file run whole, goes in before plant-compare. */
export function withFloor(root, steps) {
  const out = steps.slice();
  const at = out.length && out[out.length - 1].file === "tests/plant-compare.mjs" ? out.length - 1 : out.length;
  const extra = [];
  for (const f of FLOOR) {
    if (!fs.existsSync(path.join(root, f.file))) continue;
    if (out.concat(extra).some(s => s.cmd === f.cmd || (s.file === f.file && !(s.args || []).length))) continue;
    extra.push({ script: "area", cmd: f.cmd, file: f.file, args: f.args || [] });
  }
  out.splice(at, 0, ...extra);
  return out;
}

export async function planAreaRun(root, changed, pkg) {
  const gf = await loadGatesFor();
  const isSharedCode = gf && gf.isSharedCode ? gf.isSharedCode : () => false;
  const isProductFile = gf && gf.isProductFile ? gf.isProductFile : () => false;
  const isRelayCode = gf && gf.isRelayCode ? gf.isRelayCode : () => false;
  const gatesFor = gf && gf.gatesFor ? gf.gatesFor : () => [];

  const testSteps = parseStepsFromScript(pkg, "test");
  const wholeChain = testSteps.length ? testSteps : Object.keys(pkg.scripts || {}).flatMap(s => parseStepsFromScript(pkg, s));
  const testGates = testSteps.filter(s => s.file !== "tests/plant-hold.mjs" && s.file !== "tests/plant-compare.mjs");
  const totalGates = testGates.length;

  /* A diff confined to the gate tools runs their own legs and the floor (rule 1, as amended 2026-10-28), not the whole run. */
  const toolsOnly = !!(gf && typeof gf.isGateToolsOnly === "function" && gf.isGateToolsOnly(changed));
  if (toolsOnly) console.log("gate-run area: the diff is confined to the gate tools, so their own legs and the floor run (rule 1)");

  for (const f of toolsOnly ? [] : changed) {
    if (isSharedCode(f)) {
      return {
        failClosed: true,
        reason: "fail-closed to whole chain: change in shared code " + f,
        steps: withFloor(root, wholeChain),
      };
    }
  }

  for (const f of toolsOnly ? [] : changed) {
    let forFile = [];
    try { forFile = gatesFor(root, [f]); } catch { forFile = []; }
    if (totalGates > 0 && forFile.length > totalGates / 2) {
      return {
        failClosed: true,
        reason: "fail-closed to whole chain: file " + f + " mapped to more than half the gates (" + forFile.length + " of " + totalGates + ")",
        steps: withFloor(root, wholeChain),
      };
    }
  }

  let rows = [];
  if (!toolsOnly) { try { rows = gatesFor(root, changed); } catch { rows = []; } }

  /* A window gate is walled (rule 13's window wall): it runs only when argued, never picked up by a merge, as the whole run
     never runs one. The area run names it and leaves it out, so it stays a subset of the whole run plus the floor. */
  const windowGates = [...new Set(rows.filter(r => r.kind === "window").map(r => r.gate))];
  for (const w of windowGates) console.log("gate-run area: window gate " + w + " left out, walled: argued separately");
  const gateFiles = new Set(rows.filter(r => r.kind !== "window").map(r => r.gate));
  const steps = [];
  const addedFiles = new Set();
  const gaps = [];

  const plantHold = { script: "area", cmd: "node tests/plant-hold.mjs", file: "tests/plant-hold.mjs", args: [] };
  const plantCompare = { script: "area", cmd: "node tests/plant-compare.mjs", file: "tests/plant-compare.mjs", args: [] };

  if (fs.existsSync(path.join(root, "tests", "plant-hold.mjs"))) {
    steps.push(plantHold);
    addedFiles.add("tests/plant-hold.mjs");
  }

  if (toolsOnly) {
    for (const g of gf.GATE_TOOLS.filter(t => t.startsWith("tests/"))) {
      if (fs.existsSync(path.join(root, g)) && !addedFiles.has(g)) {
        steps.push({ script: "area", cmd: "node " + g, file: g, args: [], note: "the gate tools' own legs" });
        addedFiles.add(g);
      }
    }
  }

  let addedProductCore = false;
  for (const f of changed) {
    if (isProductFile(f) && !isRelayCode(f)) {
      const hit = rows.some(r => r.chains && r.chains.some(c => c.file === f || c.file.endsWith(f)));
      if (!hit) {
        gaps.push(f);
        if (!addedProductCore) {
          console.log("gate-run area: unmapped product file " + f + ", adding product core and recording gates-for gap");
          for (const core of PRODUCT_CORE) {
            if (fs.existsSync(path.join(root, core.file)) && !addedFiles.has(core.file)) {
              steps.push({ script: "area", cmd: core.cmd, file: core.file, args: core.args || [] });
              addedFiles.add(core.file);
            }
          }
          addedProductCore = true;
        }
      }
    }
  }

  const relayChanged = changed.filter(isRelayCode);
  let hasUnmappedRelay = false;
  for (const f of relayChanged) {
    const hit = rows.some(r => r.chains && r.chains.some(c => c.file === f || c.file.endsWith(f)));
    if (!hit) {
      hasUnmappedRelay = true;
      gaps.push(f);
    }
  }

  /* sellable is not here: it guards a floor property and stays at every merge it reaches (the test architect's guard, 2026-10-27 23:03). */
  const GENERIC_SCANNERS = new Set([
    "tests/chain-split.mjs",
    "tests/engine-selftest.js",
    "tests/gates-for.mjs",
    "tests/leg-ids.js",
    "tests/log-hygiene-selftest.js",
    "tests/result-line.mjs",
    "tests/sbom.mjs",
    "tests/text-scan-selftest.js",
  ]);

  const releaseOnlySet = new Set(RELEASE_ONLY_LEGS);
  for (const g of gateFiles) {
    if (g === "tests/plant-hold.mjs" || g === "tests/plant-compare.mjs") continue;
    if (releaseOnlySet.has(g)) {
      if (g === "tests/engine-selftest.js" && changed.includes("tools/pre-commit")) {
        // keep
      } else if (changed.includes(g)) {
        // keep
      } else {
        continue;
      }
    }
    if (GENERIC_SCANNERS.has(g) && !changed.includes(g)) continue;
    if (!addedFiles.has(g)) {
      steps.push({ script: "area", cmd: "node " + g, file: g, args: [] });
      addedFiles.add(g);
    }
  }

  if (hasUnmappedRelay) {
    console.log("gate-run area: relay file changed, adding relay core (" + RELAY_CORE.length + " files)");
    for (const core of RELAY_CORE) {
      if (fs.existsSync(path.join(root, core.file))) {
        steps.push({
          script: "area",
          cmd: "node " + core.file,
          file: core.file,
          args: [],
          env: core.env,
          note: "relay core: " + core.step + " (" + core.leg + ")",
        });
      }
    }
  }

  for (const f of FLOOR) {
    if (fs.existsSync(path.join(root, f.file)) && !addedFiles.has(f.file)) {
      steps.push({ script: "area", cmd: f.cmd, file: f.file, args: f.args || [] });
      addedFiles.add(f.file);
    }
  }

  if (fs.existsSync(path.join(root, "tests", "plant-compare.mjs"))) steps.push(plantCompare);

  return { failClosed: false, reason: "", steps, gaps, walled: windowGates };
}

function git(args) {
  try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }
  catch (e) { return ""; }
}

function gitTree() {
  const top = git(["rev-parse", "--path-format=absolute", "--show-toplevel"]);
  if (!top || !sameFolder(top, ROOT)) return "no git";
  if (git(["--no-optional-locks", "status", "--porcelain", "--untracked-files=normal",
           "--ignore-submodules=none"]).length) return "uncommitted changes";
  if (git(["ls-files", "-v"]).split(/\r?\n/).some(l => /^(S|[a-z]) /.test(l))) return "uncommitted changes";
  return git(["rev-parse", "HEAD^{tree}"]) || "no commit";
}

const SKIP_DIRS = new Set([".git", "node_modules", ".plant-hold"]);

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

function treeFiles() {
  let listed = "";
  try {
    listed = execFileSync("git", ["ls-files", "-z", "-c", "-o", "--exclude-standard"],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  } catch (e) { listed = ""; }
  const names = [...new Set(listed.split("\0").filter(Boolean))];
  if (names.length) return { how: "git ls-files -co --exclude-standard", files: names.sort(), unmerged: unmergedPaths() };
  const out = [];
  walkInto(ROOT, "", out);
  return { how: "walk skipping .git, node_modules and .plant-hold", files: out.sort(), unmerged: 0 };
}

function unmergedPaths() {
  let listed = "";
  try {
    listed = execFileSync("git", ["ls-files", "-z", "-u"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  } catch (e) { return 0; }
  return new Set(listed.split("\0").filter(Boolean).map(l => l.slice(l.indexOf("\t") + 1))).size;
}

function fingerprint() {
  const { how, files, unmerged } = treeFiles();
  const per = new Map();
  const whole = crypto.createHash("sha256");
  let bytes = 0;
  for (const f of files) {
    let buf = null;
    try { buf = fs.readFileSync(path.join(ROOT, f)); } catch (e) { buf = null; }
    const d = buf === null ? "gone" : crypto.createHash("sha256").update(buf).digest("hex");
    if (buf !== null) bytes += buf.length;
    per.set(f, d);
    whole.update(f); whole.update("\0"); whole.update(d); whole.update("\0");
  }
  return { how, hash: whole.digest("hex").slice(0, 16), count: files.length, bytes, per, unmerged };
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

const gateName = file => file.replace(/\\/g, "/").replace(/\.(mjs|js|cjs)$/, "").replace(/[^A-Za-z0-9]+/g, "-");
const pad = (n, w) => String(n).padStart(w || 2, "0");
const stamp = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
  + "T" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + "-" + pad(d.getMilliseconds(), 3);

const RESERVED = ["ok", "fail", "exitCode"];

function countsOf(out, exit) {
  const lines = out.split(/\r?\n/);
  const counts = {};
  let from = "none";
  const ok = lines.filter(l => /^ {2}ok {2,}/.test(l)).length;
  const bad = lines.filter(l => /^ {2}FAIL[ :]/.test(l)).length;
  if (ok || bad) { counts.ok = ok; counts.fail = bad; from = "ok/FAIL lines"; }
  const clashed = [];
  let declared = false;
  for (const l of lines) {
    const m = /^#counts((?:\s+[A-Za-z][A-Za-z0-9_]*=-?\d+)+)\s*$/.exec(l.trim());
    if (!m) continue;
    for (const pair of m[1].trim().split(/\s+/)) {
      const [k, v] = pair.split("=");
      const n = Number(v);
      const taken = (k in counts && counts[k] !== n) || RESERVED.indexOf(k) > -1;
      if (taken && clashed.indexOf(k) < 0) clashed.push(k);
      counts[k] = n;
    }
    declared = true;
  }
  if (declared) from = from === "none" ? "declared" : from + " and declared";
  counts.lines = lines.filter(l => l.trim() !== "").length;
  counts.exitCode = exit;
  return { counts, from, clashed };
}

function runStep(step, customEnv = {}) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const env = Object.assign({}, process.env, customEnv, step.env || {});
    const child = spawn(process.execPath, [step.file].concat(step.args),
      { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", d => { out += d; process.stdout.write(d); });
    child.stderr.on("data", d => { out += d; process.stderr.write(d); });
    child.on("close", code => resolve({ exit: code === null ? -1 : code, wallMs: Date.now() - t0, out }));
  });
}

const ALONE_MARKER = "/* run: alone (timing) */";
const ALONE_HEAD = 15;

function runsAlone(file) {
  let text;
  try { text = fs.readFileSync(path.resolve(ROOT, file), "utf8"); }
  catch (e) { return false; }
  const lines = text.split(/\r?\n/);
  const n = Math.min(lines.length, ALONE_HEAD);
  for (let i = 0; i < n; i++) if (lines[i].trim() === ALONE_MARKER) return true;
  return false;
}

function deferAlone(list) {
  let any = false;
  for (const step of list) {
    step.alone = runsAlone(step.file);
    if (step.alone) any = true;
  }
  if (!any) return list; /* alone: unchanged */
  const now = [];
  const later = [];
  for (const step of list) (step.alone ? later : now).push(step);
  return now.concat(later);
}

async function main() {
  const asked = process.argv.slice(2);
  if (!asked.length) refuse("no npm script was named", "node tools/gate-run.mjs test split-guard");

  const mode = asked[0];

  if (mode === "wait-lock") {
    console.log("gate-run: waiting for machine lock...");
    const res = acquireLock(LOCK_PATH, "wait-lock", ROOT, Infinity);
    releaseLock();
    console.log("gate-run: machine lock free");
    process.exit(0);
  }

  if (mode === "mark-cause") {
    const usage = "node tools/gate-run.mjs mark-cause <record.json> <" + MARK_CAUSES.join("|") + "> <" + MARK_ESCAPES.join("|") + ">";
    const [fileOrId, cause, escape] = asked.slice(1);
    if (!fileOrId) refuse("no gate record was named", usage);
    if (!MARK_CAUSES.includes(cause)) refuse("the cause must be one of rule 10's: " + MARK_CAUSES.join(", ") + "; given " + JSON.stringify(cause), usage);
    if (!MARK_ESCAPES.includes(escape)) refuse("say whether the red escaped: " + MARK_ESCAPES.join(" or ") + "; given " + JSON.stringify(escape), usage);
    const targetFile = fs.existsSync(fileOrId) ? fileOrId : path.join(RUNS, fileOrId);
    if (!fs.existsSync(targetFile)) refuse("record file not found: " + targetFile);
    const rec = JSON.parse(fs.readFileSync(targetFile, "utf8"));
    if (rec.exit === 0) refuse("the record " + path.basename(targetFile) + " is green; a mark names a red");
    const { line, why } = chainLineOfRecord(rec, CHAINS_PATH);
    if (!line) refuse("cannot tell which run this red belongs to: " + why, "name a record of a run that chains.jsonl holds");
    const mark = { run: { head: line.head, start: line.start, gate: line.gate }, gate: rec.gate, cmd: rec.cmd || "",
      cause, escaped: escape === "escaped", record: path.basename(targetFile), marked: new Date().toISOString() };
    try { fs.mkdirSync(path.dirname(MARKS_PATH), { recursive: true }); } catch (e) { /* the append below says so */ }
    fs.appendFileSync(MARKS_PATH, JSON.stringify(mark) + "\n", "utf8");
    console.log("gate-run: marked " + rec.gate + " in the " + line.gate + " run of " + line.head + " at " + line.start + " as " + cause
      + ", " + escape + ", in " + MARKS_PATH);
    process.exit(0);
  }

  const inTemp = /\\AppData\\Local\\Temp\\/i.test(ROOT) || inside(os.tmpdir(), ROOT);
  if (mode === "nightly") {
    if (inTemp && process.env.ETIUDA_NIGHTLY_ALLOW_TEMP !== "1" && !asked.includes("--dry-run")) {
      refuse("the nightly profile refuses to run from a folder under %TEMP%: " + ROOT,
        "nightly runs must run from a main checkout outside %TEMP%");
    }
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  let steps = [];
  let isHeavy = process.env.ETIUDA_HEAVY === "1";
  let customEnv = {};
  let gateLabel = asked.join(" ");
  let walled = [];

  if (mode === "area") {
    const base = asked[1] || "main...HEAD";
    const gf = await loadGatesFor();
    const changed = gf ? gf.changedFiles(ROOT, base) : [];
    console.log("gate-run area: base " + base + ", " + changed.length + " changed file(s)");
    const plan = await planAreaRun(ROOT, changed, pkg);
    if (plan.failClosed) {
      console.log("gate-run area: fail-closed to whole chain: " + plan.reason);
      isHeavy = true;
    }
    steps = plan.steps;
    walled = plan.walled || [];
    customEnv.ETIUDA_PLANTS = "off";
    gateLabel = "area";
  } else if (mode === "release") {
    isHeavy = true;
    gateLabel = "release";
    customEnv.ETIUDA_PROFILE = "release";
    const testSteps = parseStepsFromScript(pkg, "test");
    const baseSteps = testSteps.length ? testSteps : Object.keys(pkg.scripts || {}).flatMap(s => parseStepsFromScript(pkg, s));
    steps = [...baseSteps, ...NIGHTLY_LEGS.filter(n => fs.existsSync(path.join(ROOT, n.file)))];
  } else if (mode === "nightly") {
    isHeavy = true;
    gateLabel = "nightly";
    customEnv.ETIUDA_PROFILE = "nightly";
    const testSteps = parseStepsFromScript(pkg, "test");
    const baseSteps = testSteps.length ? testSteps : Object.keys(pkg.scripts || {}).flatMap(s => parseStepsFromScript(pkg, s));
    steps = [...baseSteps, ...NIGHTLY_LEGS.filter(n => fs.existsSync(path.join(ROOT, n.file)))];
  } else {
    const scriptNames = asked.filter(a => !a.startsWith("--"));
    for (const name of scriptNames) {
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
    if (asked.includes("test")) isHeavy = true;
  }

  let before = fingerprint();
  let tree = gitTree();
  const COMMIT = git(["rev-parse", "--short", "HEAD"]);
  const DIRTY = git(["status", "--porcelain"]).length > 0;

  console.log("gate-run: tree " + before.hash + ", " + before.count + " file(s), " + before.bytes
              + " byte(s), by " + before.how + "; git tree " + tree);

  if (asked.includes("--dry-run") || asked.includes("--list")) {
    console.log("gate-run " + mode + " dry run: " + steps.length + " gate(s) to run:");
    for (const s of steps) console.log("  " + s.cmd + (s.note ? " (" + s.note + ")" : ""));
    process.exit(0);
  }

  let lockRes = null;
  if (isHeavy) {
    console.log("gate-run: taking machine lock for heavy run (" + gateLabel + ")...");
    const timeoutMs = process.env.ETIUDA_LOCK_TIMEOUT_MS ? Number(process.env.ETIUDA_LOCK_TIMEOUT_MS) : 300000;
    lockRes = acquireLock(LOCK_PATH, gateLabel, ROOT, timeoutMs);
    if (!lockRes.ok) refuse("could not acquire machine lock: " + lockRes.reason);
  }

  const runStart = new Date().toISOString();
  const ordered = deferAlone(steps);
  let worst = 0, written = 0, treeMoved = false, refusedAt = null;

  if (mode === "area" && fs.existsSync(CHAINS_PATH)) {
    try {
      const lines = fs.readFileSync(CHAINS_PATH, "utf8").split(/\r?\n/).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const rec = JSON.parse(lines[i]);
          if (rec.counts && rec.counts.exitCode === 0 && (!rec.reds || rec.reds.length === 0)) {
            if (rec.treeSha === before.hash || (tree !== "no git" && tree !== "uncommitted changes" && rec.gitTree === tree)) {
              console.log("gate-run area: tree " + before.hash + " equals recorded green tree (" + (rec.head || rec.treeSha) + "), rerunning nothing");
              if (isHeavy) releaseLock();
              process.exit(0);
            }
          }
        } catch {}
      }
    } catch {}
  }

  const totalCounts = { ok: 0, fail: 0, lines: 0 };
  const redsList = [];
  const gatesList = [];

  for (const step of ordered) {
    const now = new Date();
    if (step.alone) console.log("gate-run: " + step.file.replace(/\\/g, "/") + " run after the rest of its list (not alone on the machine)");
    console.log("\n> " + step.cmd);
    const res = await runStep(step, customEnv);
    const after = fingerprint();
    tree = gitTree();
    const moved = after.hash === before.hash ? [] : movedFiles(before, after);
    const verdict = moved.length ? NO_VERDICT : res.exit;
    const refused = res.exit === NO_VERDICT ? (/^#refused ([a-z][a-z0-9-]*)\s*$/m.exec(res.out) || [])[1] || "" : "";
    const { counts, from, clashed } = countsOf(res.out, verdict);
    if (clashed.length) console.log("  clash: " + clashed.length + " key(s) declared twice with"
      + " different values, the later kept: " + clashed.join(", "));

    if (counts.ok) totalCounts.ok = (totalCounts.ok || 0) + counts.ok;
    if (counts.fail) totalCounts.fail = (totalCounts.fail || 0) + counts.fail;
    if (counts.lines) totalCounts.lines = (totalCounts.lines || 0) + counts.lines;

    const isRed = verdict !== 0;
    if (isRed) {
      redsList.push({
        gate: gateName(step.file),
        cmd: step.cmd,
        exit: verdict,
        cause: "unread",
      });
    }

    const line = {
      gate: gateName(step.file),
      script: step.script,
      cmd: step.cmd,
      exit: verdict,
      gateExit: res.exit,
      counts: counts,
      countsFrom: from,
      clash: clashed.length,
      refused: refused,
      treeHash: after.hash,
      treeFiles: after.count,
      treeHow: after.how,
      treeChanged: moved.length,
      unmerged: after.unmerged,
      gitTree: tree,
      wallMs: res.wallMs,
      commit: COMMIT,
      dirty: DIRTY,
      time: now.toISOString(),
      run: runStart,
      cause: isRed ? "unread" : undefined,
    };
    gatesList.push({ gate: line.gate, wallMs: line.wallMs, exit: line.exit });

    const file = path.join(RUNS, line.gate + "-" + stamp(now) + ".json");
    fs.writeFileSync(file, JSON.stringify(line) + "\n", "utf8");
    written++;
    console.log("  gate-run: " + path.basename(file) + " " + JSON.stringify(line.counts)
                + " exit " + line.exit + (refused ? " REFUSED by the " + refused : "") + " in " + line.wallMs + " ms"
                + ", tree " + line.treeHash + ", git tree " + line.gitTree);
    if (line.unmerged) console.log("  note: run over an UNMERGED index (" + line.unmerged + " path(s) in conflict), so treeHash is"
      + " the working tree's bytes, each path once, and no commit holds them until the resolution is committed");
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
      treeMoved = true;
      break;
    }
    before = after;
    if (res.exit !== 0) { worst = res.exit; if (refused) refusedAt = line; break; }
  }

  const runEnd = new Date().toISOString();
  totalCounts.exitCode = worst;

  appendChainLine({
    gate: gateLabel,
    tree: ROOT,
    head: COMMIT || "no commit",
    treeSha: before.hash,
    gitTree: tree,
    start: runStart,
    end: runEnd,
    counts: totalCounts,
    reds: redsList,
    staleTakenOver: lockRes ? lockRes.staleTakenOver : false,
    gates: gatesList,
    walled,
  }, CHAINS_PATH);

  if (isHeavy) releaseLock();

  console.log("\ngate-run: " + written + " of " + steps.length + " gate(s) run from "
              + asked.length + " npm script(s), " + written + " line(s) in " + RUNS
              + ", tree " + before.hash + ", git tree " + tree
              + (treeMoved ? ", NO VERDICT: the tree moved under a gate"
                 : refusedAt ? ", stopped at " + refusedAt.gate + ", REFUSED by the " + refusedAt.refused
                   + " and not failed: nothing was opened or measured, and its own lines above say what lets it run"
                 : worst === NO_VERDICT ? ", stopped at a gate exiting " + worst + ", its own NO VERDICT: it"
                   + " refused, did not finish, or left a leg not run"
                 : worst ? ", stopped at a gate exiting " + worst : ", all green"));

  process.exitCode = worst === 0 ? 0 : (worst > 0 && worst < 256 ? worst : 1);
}

const RUNS = path.resolve(process.env.ETIUDA_RUNS || path.join(mainTree(), "..", "etiuda-runs"));
/* chains.jsonl sits beside the per-gate records it summarises: Workspace/etiuda-runs for the trees, a lab's own folder for a
   lab. A lab that wrote into the office's file left trees there that the area run's equal-tree rule then reused (the test
   architect's E1, 2026-10-28). */
export const CHAINS_PATH = path.resolve(process.env.ETIUDA_CHAINS_PATH || path.join(RUNS, "chains.jsonl"));
/* The yield ledger's marks sit beside the chains they mark, so a lab's marks stay in its lab. */
export const MARKS_PATH = path.resolve(process.env.ETIUDA_MARKS_PATH || path.join(path.dirname(CHAINS_PATH), "marks.jsonl"));
if (inside(ROOT, RUNS)) refuse("the runs folder is inside the repository: " + RUNS,
  "these files are a record of runs, not of the tree; put them beside it, not in it");
fs.mkdirSync(RUNS, { recursive: true });

const invoked = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (invoked) main();
