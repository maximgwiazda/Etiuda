/* Every gate writes one machine-readable line per run, board item 442.
 *
 *   node tools/gate-run.mjs test split-guard        the two fast chains
 *   node tools/gate-run.mjs shell-smoke             one gate, one line
 *   node tools/gate-run.mjs file <path...>          one or more test files by path
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

export function getRealProfileSnapshotFolders() {
  if (process.env.ETIUDA_REAL_PROFILE_OVERRIDE) {
    const root = process.env.ETIUDA_REAL_PROFILE_OVERRIDE;
    return [
      path.join(root, "etiuda"),
      path.join(root, "Etiuda Studio"),
    ];
  }
  let roaming = "";
  if (process.platform === "win32") {
    try {
      roaming = execFileSync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-Command",
        "[System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData)"
      ], { encoding: "utf8", timeout: 10000, windowsHide: true }).trim();
    } catch {}
  }
  if (!roaming) roaming = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return [
    path.join(roaming, "etiuda"),
    path.join(roaming, "Etiuda Studio"),
  ];
}

export function isInstalledAppRunning() {
  const hook = process.env.ETIUDA_INSTALLED_APP_RUNNING !== undefined ? process.env.ETIUDA_INSTALLED_APP_RUNNING
    : process.env.ETIUDA_APP_RUNNING_HOOK !== undefined ? process.env.ETIUDA_APP_RUNNING_HOOK
    : process.env.ETIUDA_INSTALLED_APP_HOOK;
  if (hook !== undefined) {
    return hook === "1" || hook === "true";
  }
  try {
    if (process.platform === "win32") {
      /* By where it runs from, never by name: a test's own installed copy runs from a scratch folder under the same name
         and must never soften this check (the test architect, 2026-11-09). Per machine under Program Files, per user under
         LOCALAPPDATA\\Programs. */
      const out = execFileSync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-Command",
        "@(Get-CimInstance Win32_Process | Where-Object { $p = $_.ExecutablePath; $p -and (($p -like (Join-Path $env:ProgramFiles 'Etiuda*')) -or ($p -like (Join-Path $env:LOCALAPPDATA 'Programs\\*tiuda*'))) }).Count"
      ], { encoding: "utf8", timeout: 10000, windowsHide: true }).trim();
      return parseInt(out, 10) > 0;
    } else {
      const out = execFileSync("pgrep", ["-i", "^(etiuda|etiuda-studio)$"], { encoding: "utf8", timeout: 10000 }).trim();
      return out.length > 0;
    }
  } catch {
    return false;
  }
}

export function takeRealProfileSnapshot() {
  const roots = getRealProfileSnapshotFolders();
  const snap = {};
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      snap[root] = null;
      continue;
    }
    const items = {};
    const walk = dir => {
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.relative(root, full).replace(/\\/g, "/");
        try {
          const st = fs.statSync(full);
          items[rel] = { size: st.size, mtimeMs: Math.round(st.mtimeMs), isDir: e.isDirectory() };
          if (e.isDirectory()) walk(full);
        } catch {}
      }
    };
    walk(root);
    snap[root] = items;
  }
  return snap;
}

export function compareRealProfileSnapshots(snapBefore, snapAfter) {
  const changed = [];
  if (!snapBefore || !snapAfter) return changed;
  for (const root of Object.keys(snapBefore)) {
    const bItems = snapBefore[root];
    const aItems = snapAfter[root];
    const base = path.basename(root);
    if (bItems === null && aItems === null) continue;
    if (bItems === null && aItems !== null) {
      changed.push(base + " created");
      for (const rel of Object.keys(aItems)) {
        changed.push(base + "/" + rel);
      }
      continue;
    }
    if (bItems !== null && aItems === null) {
      changed.push(base + " removed");
      continue;
    }
    const allKeys = new Set([...Object.keys(bItems), ...Object.keys(aItems)]);
    for (const rel of allKeys) {
      const b = bItems[rel];
      const a = aItems[rel];
      if (!b) {
        changed.push(base + "/" + rel + " added");
      } else if (!a) {
        changed.push(base + "/" + rel + " removed");
      } else if (b.size !== a.size || Math.abs(b.mtimeMs - a.mtimeMs) > 1000) {
        changed.push(base + "/" + rel + " modified");
      }
    }
  }
  return changed;
}



/* The relay core for an unmapped engine relay file, the test architect's choice (2026-10-28 00:13): five relay files,
   once each. relay-unit, relay-blob, relay-stub and relay-workerd stay whole. relay-channel is narrowed by
   narrowRelayChannel to the parts the diff can change; the bare step here is what that narrowing replaces. */
export const RELAY_CORE = [
  { step: "relay-unit", leg: "whole", file: "tests/relay-unit.mjs", env: {} },
  { step: "relay-channel", leg: "whole", file: "tests/relay-channel.mjs", env: {} },
  { step: "relay-blob", leg: "whole", file: "tests/relay-blob.mjs", env: {} },
  { step: "relay-stub", leg: "whole", file: "tests/relay-stub.mjs", env: {} },
  { step: "relay-workerd", leg: "whole", file: "tests/relay-workerd.mjs", env: {} },
];

/* The relay-channel part bound by many desks and restarts (about six minutes). A merge drops it.
   The release profile runs the file with RELAY_CHANNEL_ONLY unset, so the part still runs there. */
export const RELEASE_ONLY_PARTS = ["p939"];

/* Sealing, signatures and refusals. A relay-layer diff keeps these even when the part graph missed them. */
const CHANNEL_SEAL_PARTS = ["p940", "p944", "p946", "p919", "p947", "p951", "p952", "p956", "p981", "p938", "p1165"];

export const RELEASE_ONLY_LEGS = [
  "tests/desk-growth.mjs",
  "tests/engine-selftest.js",
  "tests/result-line.mjs",
  "tests/machine-lock.mjs",
  "tests/sbom.mjs",
  "tests/text-scan-selftest.js",
  "tests/theme-presses.mjs",
  "tests/theme-roll.mjs",
  "tests/packaged-start.js",
];

/* VISUAL LEGS NEVER BLOCK A MERGE (Max, 2026-11-08 18:36: "leave only whats really helpful in our situation"; his own eye
   judges what he sees). They stay in the test chain, so the release profile runs them; a merge, area or whole, leaves them out. */
export const VISUAL_LEGS = [
  "tests/css-layers.js",
  "tests/css-order.js",
  "tests/motion-tokens.js",
  "tests/theme-switch.mjs",
  "tests/kin-contrast.mjs",
  "tests/theme-flip-hold.mjs",
  "tests/theme-continuity.mjs",
  "tests/rail-ground.mjs",
];
const VISUAL_SET = new Set(VISUAL_LEGS);

/* PACKAGING AND RELEASE TOOLS ARE NEVER MERGE GATES (the test architect, 2026-11-08): npm scripts make gates-for name them,
   but they build installers or release, and package-linux cannot build on Windows. The installer test covers packaging. */
export const NOT_MERGE_GATES = ["tools/package.mjs", "tools/package-linux.mjs", "tools/release.mjs"];
const NOT_MERGE_SET = new Set(NOT_MERGE_GATES);

export const NIGHTLY_LEGS = [
  { script: "nightly", file: "tests/desk-growth.mjs", args: [], cmd: "node tests/desk-growth.mjs" },
  { script: "nightly", file: "tests/engine-selftest.js", args: [], cmd: "node tests/engine-selftest.js" },
  { script: "nightly", file: "tests/result-line.mjs", args: [], cmd: "node tests/result-line.mjs" },
  { script: "nightly", file: "tests/machine-lock.mjs", args: [], cmd: "node tests/machine-lock.mjs" },
  { script: "nightly", file: "tests/text-scan-selftest.js", args: [], cmd: "node tests/text-scan-selftest.js" },
  { script: "nightly", file: "tests/sbom.mjs", args: [], cmd: "node tests/sbom.mjs" },
  /* A browser leg: the carries a desk arrives with, driven in headless Chrome (the test architect, 2026-11-01 07:17). */
  { script: "nightly", file: "tests/storage-carry.js", args: [], cmd: "node tests/storage-carry.js" },
  { script: "nightly", file: "tests/theme-presses.mjs", args: [], cmd: "node tests/theme-presses.mjs" },
  { script: "nightly", file: "tests/theme-roll.mjs", args: [], cmd: "node tests/theme-roll.mjs" },
  /* A browser leg: the desk swapped in place held to a fresh start, driven in headless Chrome (the test architect, 2026-11-08). */
  { script: "nightly", file: "tests/swap.mjs", args: [], cmd: "node tests/swap.mjs" },
];

export const FLOOR = [
  { step: "pick 5a-5f", file: "tests/pick.mjs", cmd: "node tests/pick.mjs", args: [] },
  { step: "links open-external (line 92)", file: "tests/links.js", cmd: "node tests/links.js open-external", args: ["open-external"] },
  { step: "relay-unit 13b", file: "tests/relay-unit.mjs", cmd: "node tests/relay-unit.mjs", args: [] },
  { step: "update-install U0d", file: "tests/update-install.js", cmd: "node tests/update-install.js U0d", args: ["U0d"] },
  { step: "team-join 15by-15bz", file: "tests/team-join.mjs", cmd: "node tests/team-join.mjs", args: [] },
  { step: "test checkCatalogRoundTrip", file: "tests/test.js", cmd: "node tests/test.js", args: [] },
];

/* THE HYGIENE LEGS (the test architect's C2, 2026-10-30). A leg belongs here only when its failure cannot change what a user's
   build does: it checks the suite's own bookkeeping (leg ids, chain splits, a tool's selftest), or the wording rules of source
   text (pl-diacritics, rev-words, log-hygiene). In the release and nightly profiles a red on one is a WARN: it is written in the
   chain line's reds with class "warn", the run goes on past it and exits 0 if nothing else is red, and the next merge fixes it.
   Every other red there is class "hold". Area and whole runs do not read this list: there a hygiene red is red.
   An entry is a leg's file without its extension, with * standing for any run of characters. A name on both FLOOR and HYGIENE
   is refused at load (exit 78). tests/engine-selftest is not here: it also compares the shipped sample catalog with the bytes a
   gate is handed and reads tools/release.mjs and tools/pre-commit, so it does not test the harness alone. This list changes by the
   test architect's word only. */
export const HYGIENE = [
  "tests/chain-split",
  "tests/plant-hold",
  "tools/*-selftest",
  "tests/log-hygiene-selftest",
  "tests/pl-diacritics",
  "tests/rev-words",
];

const hygieneName = file => String(file || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\.(mjs|js|cjs)$/, "");

/** Whether a leg's file is on the HYGIENE list. */
export function isHygiene(file, list = HYGIENE) {
  const name = hygieneName(file);
  return list.some(h => new RegExp("^" + String(h).split("*").map(p => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(name));
}

/** The FLOOR files a HYGIENE list also names, as they are written in FLOOR; empty when the two lists are apart. */
export function hygieneFloorClash(list = HYGIENE, floor = FLOOR) {
  return floor.filter(f => isHygiene(f.file, list)).map(f => f.file);
}

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

/* NODE_MODULES IS GONE (the test architect, 2026-11-09): a worktree's node_modules junction was swept from under two landings
   mid-gate, and every later leg then failed on a missing module or binary, read as reds. A tree whose package.json declares
   dependencies and has no node_modules, or a junction to nothing, has no verdict to give, so it is refused with 78 at the
   start and before each step. */
function modulesGone() {
  let pkg = null;
  try { pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")); } catch (e) { return ""; }
  const deps = Object.keys((pkg && pkg.dependencies) || {}).length + Object.keys((pkg && pkg.devDependencies) || {}).length;
  if (!deps || fs.existsSync(path.join(ROOT, "node_modules"))) return "";
  return "node_modules is gone at " + path.join(ROOT, "node_modules") + " (a swept junction, or never linked)";
}
const MODULES_HOW = "relink it (cmd /c mklink /J <tree>\\node_modules <checkout>\\node_modules) and run again; nothing was judged";

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

export const DEFAULT_LOCK_TIMEOUT_MS = 4 * 3600 * 1000; /* plant:wait-ceiling */

export function acquireLock(lockPath = LOCK_PATH, what = "run", tree = ROOT, waitTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS, opts = {}) {
  const say = (opts && opts.say) || ((l) => console.log(l.replace(/^machine-lock:/, "gate-run:")));
  const r = takeLock(Object.assign({ lockPath, what, tree, waitMs: waitTimeoutMs }, opts, { say }));
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

/* etiuda is the engine tree and etiuda-studio is Studio. A path is not a repository: two trees can share a folder spelling. */
export function repoOfPackage(pkg) {
  const name = pkg && typeof pkg.name === "string" ? pkg.name : "";
  if (name === "etiuda") return "engine";
  if (name === "etiuda-studio") return "studio";
  return "";
}

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
      /* "warn" for a HYGIENE leg red in a release or nightly run, "hold" for every other red (the test architect's C2). */
      class: r.class === "warn" ? "warn" : "hold",
    })),
    /* True if any red is class hold: only then does a release-profile run hold what builds from it (and exit non-zero). */
    holds: (record.reds || []).some(r => r.class !== "warn"),
    staleTakenOver: record.staleTakenOver || false,
    /* Which gates ate the run: one entry per gate run, in order, each with its wall-clock and its verdict. */
    gates: (record.gates || []).map(g => ({ gate: g.gate, wallMs: g.wallMs, exit: g.exit })),
    /* The window gates this run's diff reached and left out: a merge that needs an argued window run, counted by the week review. */
    walled: record.walled || [],
  };
  /* The repository is the package name. An area run also records why the plan chose its legs; other runs have no plan. */
  line.repo = record.repo;
  if (record.gate === "area") line.plan = record.plan;
  /* A release run that inherited a base's other legs (the test architect's C3): the base's git tree. */
  if (record.inherits) line.inherits = record.inherits;
  if (Array.isArray(record.carried) && record.carried.length) line.carried = record.carried;
  /* Every run records which files ran, so an area run can check coverage (the test architect's criterion, 2026-11-08). */
  if (Array.isArray(record.ran)) line.ran = record.ran;
  else if (record.inherits) line.ran = [];
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

/* A test file new against the merge's base may start at most five child processes, a headless browser counting as one
   (regimen rule 11): tools/child-cap.mjs counts them statically, at every merge, before the legs. */
export function childCapStep(root, base) {
  if (!fs.existsSync(path.join(root, "tools", "child-cap.mjs"))) return null;
  const ref = String(base || "main").split("...")[0] || "main";
  return { script: "area", cmd: "node tools/child-cap.mjs " + ref, file: "tools/child-cap.mjs", args: [ref], note: "rule 11: new test files' child processes" };
}

/* The release profile's steps, nightly's alike: the whole chain with every FLOOR entry it does not already run (the test
   architect's E2, 2026-10-28), then the nightly-only legs. */
export function profileSteps(root, pkg) {
  const testSteps = parseStepsFromScript(pkg, "test");
  const baseSteps = testSteps.length ? testSteps : Object.keys(pkg.scripts || {}).flatMap(s => parseStepsFromScript(pkg, s));
  return [...withFloor(root, baseSteps), ...NIGHTLY_LEGS.filter(n => fs.existsSync(path.join(root, n.file)))];
}

function normRel(file) {
  return String(file || "").replace(/\\/g, "/");
}

/* A TEST-ONLY DIFF RERUNS ONLY THE CHANGED TESTS (the test architect's C3, 2026-10-30). In the release profile only: the newest
   release chain line on this tree's path that holds nothing (holds false, or no reds) and whose head is an ancestor of HEAD is the
   base. If `git diff --name-only <base head> HEAD` names only files under tests/ (a fixture there is a test file), the run is the
   changed test files that are profile steps, every profile step that imports or requires a changed file (followed through the static
   require( and import of the test files, transitively), and the FLOOR legs; its chain line says "inherits" the base's git tree and
   lists "ran". Any file elsewhere (package.json, tools/, the lockfile), an unclean tree or no usable base is the full profile.
   Not followed: a path built at run time from pieces none of which names the file. A test source also reaches where it holds a changed
    file's path or basename inside a quoted string, which is how a fixture read as text and a test spawned by path are named; a source
    that names another file of the same name over-reaches, and that costs a leg. */
const TEST_SOURCE = /\.(mjs|js|cjs)$/;
const TREE_SHA = /^[0-9a-f]{40,64}$/;

function sameTreePath(a, b) {
  const n = p => { const r = path.resolve(String(p || "")); return process.platform === "win32" ? r.toLowerCase() : r; };
  return n(a) === n(b);
}

function readChainLines(chainsPath) {
  let raw = "";
  try { raw = fs.readFileSync(chainsPath, "utf8"); } catch (e) { return []; }
  const out = [];
  for (const l of raw.split(/\r?\n/)) { if (!l) continue; try { out.push(JSON.parse(l)); } catch (e) { /* a torn line is skipped */ } }
  return out;
}

/** Whether a chain line is a run that holds: a hold red (holds true), or a line that cannot say it holds nothing. */
export function baseHolds(c) {
  if (!c) return true;
  return c.holds === true || (c.holds !== false && !(Array.isArray(c.reds) && c.reds.length === 0))
    || !c.counts || c.counts.exitCode !== 0;
}

function gitIn(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 26, windowsHide: true });
  return { ok: r.status === 0, out: String(r.stdout || "") };
}

/** The newest release chain line on this tree's path that a test-only diff may inherit, or null. */
export function releaseBase(root, chainsPath = CHAINS_PATH) {
  const lines = readChainLines(chainsPath);
  for (let i = lines.length - 1; i >= 0; i--) {
    const c = lines[i];
    if (!c || c.gate !== "release" || !c.tree || !sameTreePath(c.tree, root)) continue;
    if (baseHolds(c)) continue; /* plant:inherit-hold */
    if (!c.head || c.head === "no commit" || !TREE_SHA.test(String(c.gitTree || ""))) continue;
    /* The line must be a clean run of that very commit, or its git tree says nothing about HEAD's history. */
    const t = gitIn(root, ["rev-parse", "--verify", "-q", c.head + "^{tree}"]);
    if (!t.ok || t.out.trim() !== c.gitTree) continue;
    if (!gitIn(root, ["merge-base", "--is-ancestor", c.head, "HEAD"]).ok) continue;
    return c;
  }
  return null;
}

/** The files `git diff --name-only <head> HEAD` names (renames as a delete and an add), or null where git cannot say. */
export function changedSince(root, head) {
  const r = gitIn(root, ["diff", "--name-only", "--no-renames", "-z", head, "HEAD"]);
  return r.ok ? r.out.split("\0").filter(Boolean).map(normRel) : null;
}

function listTestSources(root) {
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), rel + e.name + "/"); }
      else if (e.isFile() && TEST_SOURCE.test(e.name)) out.push(rel + e.name);
    }
  };
  walk(path.join(root, "tests"), "tests/");
  return out;
}

/** The relative specifiers a source file requires or imports with a string literal. */
export function staticSpecs(text) {
  const specs = [];
  const take = (re, at) => { let m; while ((m = re.exec(text))) specs.push(m[at]); };
  take(/\brequire\(\s*(["'])([^"'\r\n]+)\1\s*\)/g, 2);
  take(/\bimport\s*(?:[\w$*{][^"'`;()]*?\s*from\s*)?(["'])([^"'\r\n]+)\1/g, 2);
  take(/\bexport\s[^"'`;()]*?\sfrom\s*(["'])([^"'\r\n]+)\1/g, 2);
  take(/\bimport\(\s*(["'])([^"'\r\n]+)\1\s*\)/g, 2);
  return specs.filter(s => /^\.\.?(\/|\\|$)/.test(s));
}

function specTargets(fromFile, spec) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec.replace(/\\/g, "/")));
  const out = [base];
  for (const ext of [".js", ".mjs", ".cjs", ".json"]) out.push(base + ext);
  for (const idx of ["index.js", "index.mjs", "index.cjs"]) out.push(base + "/" + idx);
  return out;
}

/** Whether the text holds, inside a quoted string on one line, the path or the basename of any of the changed files. */
const namedMatchers = new Map();
export function namesAnyOf(text, changed) {
  for (const c of changed) {
    for (const name of new Set([c, path.posix.basename(c)])) {
      let re = namedMatchers.get(name);
      if (!re) {
        re = new RegExp("[\"'`][^\"'`\\r\\n]*(?<![\\w.-])" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])[^\"'`\\r\\n]*[\"'`]");
        namedMatchers.set(name, re);
      }
      if (re.test(text)) return true;
    }
  }
  return false;
}

/** The changed files and every file that requires or imports one of them, through the static require( and import, transitively,
    and every file that names one of them in a string. */
export function filesReaching(root, changed, scanFiles) {
  const imports = new Map();
  const reaching = new Set(changed);
  for (const f of scanFiles) {
    let text;
    try { text = fs.readFileSync(path.join(root, f), "utf8"); } catch (e) { continue; }
    const set = new Set();
    for (const spec of staticSpecs(text)) for (const t of specTargets(f, spec)) set.add(t);
    imports.set(f, set);
    if (namesAnyOf(text, changed)) reaching.add(f); /* plant:inherit-named */
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const [f, set] of imports) {
      if (reaching.has(f)) continue;
      for (const t of set) if (reaching.has(t)) { reaching.add(f); grew = true; break; }
    }
  }
  return reaching;
}

const stepFile = s => normRel(s.file).replace(/^\.\//, "");
const isFloorStep = s => FLOOR.some(f => f.cmd === s.cmd || (f.file === stepFile(s) && !(s.args || []).length));

/** The release steps a test-only diff runs, with the base it inherits; or { reason } where the full profile runs. `tree` is the
    run's own git tree as gitTree() says it: a clean commit's sha, or why it is not one. */
export function planTestOnly(root, steps, tree, chainsPath = CHAINS_PATH) {
  if (!TREE_SHA.test(String(tree || ""))) return { reason: "the tree is not a clean commit (" + tree + ")" };
  const base = releaseBase(root, chainsPath);
  if (!base) return { reason: "no release run with no hold red, on this path, of a commit under HEAD to inherit" };
  const changed = changedSince(root, base.head);
  if (!changed) return { reason: "git could not diff " + base.head + " against HEAD" };
  const outside = changed.filter(f => !f.startsWith("tests/"));
  if (outside.length) return { reason: outside.length + " changed file(s) outside tests/ since " + base.head + ", the first " + outside[0] };
  const scan = new Set(listTestSources(root));
  for (const s of steps) scan.add(stepFile(s));
  const reaching = filesReaching(root, changed, [...scan]);
  return { base, changed, steps: steps.filter(s => reaching.has(stepFile(s)) || isFloorStep(s)) };
}

/* AN AREA RUN CARRIES ON AFTER A TEST-ONLY FIX (Claude alpha's question of 2026-11-12 04:35; the test architect's rule, the
   same day). A red fixed by a change to files under tests/ alone used to restart the whole area plan. Now the newest area run on
   this path, of a commit under HEAD whose git tree it recorded, lends the gates it passed: each green gate whose file, and every
   file that file imports, is untouched since that commit is carried, and only the rest runs. Never carried, whatever the base
   says: a step with arguments or its own environment (its name does not say which run it was), the floor, the hygiene legs, any
   step that reads the tree as data (its source, or a file it imports, lists a folder or the index), and the gate that ended a run
   that did not complete. A change outside tests/ carries nothing. Carried gates carry on: a resumed run's own carried list is
   lent again, since the product is the same tree throughout. The chain line says "inherits" the base's git tree and "carried"
   the gates it did not run. ETIUDA_AREA_RESUME=off runs the whole plan. */
const WALKS_TREE = /\breaddir(Sync)?\b|\bopendir(Sync)?\b|\bglob(Sync)?\b|\bls-files\b|\bls-tree\b|["']grep["']|["']diff["']/;
/* A FILE READ OR STARTED BY NAME is reached as an import is (the lead engineer's read of 2026-11-12): a test that names a changed
   file under tests/, by its path, its file name or, for a file that is not a script, the folder it sits in, reads or starts it
   and is not carried. Over-naming only reruns more. */
function namersOf(root, changed, scanFiles) {
  const names = new Set();
  for (const f of changed) {
    names.add(f); names.add(f.slice("tests/".length)); names.add(path.posix.basename(f));
    if (!TEST_SOURCE.test(f)) { const dir = path.posix.basename(path.posix.dirname(f)); if (dir && dir !== "tests") names.add(dir); }
  }
  return scanFiles.filter(f => {
    let text;
    try { text = fs.readFileSync(path.join(root, f), "utf8"); } catch (e) { return true; }
    for (const n of names) if (n && text.includes(n)) return true;
    return false;
  });
}
export function planAreaResume(root, steps, tree, chainsPath = CHAINS_PATH) {
  if (!TREE_SHA.test(String(tree || ""))) return { reason: "the tree is not a clean commit (" + tree + ")" };
  let base = null;
  const lines = readChainLines(chainsPath);
  for (let i = lines.length - 1; i >= 0 && !base; i--) {
    const c = lines[i];
    if (!c || c.gate !== "area" || !c.tree || !sameTreePath(c.tree, root) || !Array.isArray(c.gates)) continue;
    if (!c.head || c.head === "no commit" || !TREE_SHA.test(String(c.gitTree || ""))) continue;
    const t = gitIn(root, ["rev-parse", "--verify", "-q", c.head + "^{tree}"]);
    if (!t.ok || t.out.trim() !== c.gitTree) continue;
    if (!gitIn(root, ["merge-base", "--is-ancestor", c.head, "HEAD"]).ok) continue;
    base = c;
  }
  if (!base) return { reason: "no area run on this path of a commit under HEAD to carry on from" };
  const changed = changedSince(root, base.head);
  if (!changed) return { reason: "git could not diff " + base.head + " against HEAD" };
  const outside = changed.filter(f => !f.startsWith("tests/"));
  if (outside.length) return { reason: outside.length + " changed file(s) outside tests/ since " + base.head + ", the first " + outside[0] };
  const done = !!base.counts && base.counts.exitCode === 0;
  const earned = (done ? base.gates : base.gates.slice(0, -1)).filter(g => g && g.exit === 0).map(g => g.gate);
  const green = new Set(earned.concat(Array.isArray(base.carried) ? base.carried : []));
  const scan = new Set(listTestSources(root));
  for (const st of steps) scan.add(stepFile(st));
  const reaching = filesReaching(root, changed.concat(namersOf(root, changed, [...scan])), [...scan]);
  const walkers = [...scan].filter(f => { try { return WALKS_TREE.test(fs.readFileSync(path.join(root, f), "utf8")); } catch (e) { return true; } });
  const walking = filesReaching(root, walkers, [...scan]);
  const run = [], carried = [];
  for (const st of steps) {
    const file = stepFile(st), name = gateName(st.file);
    const plain = !(st.args || []).length && !(st.env && Object.keys(st.env).length);
    if (plain && green.has(name) && !reaching.has(file) && !walking.has(file) && !isFloorStep(st) && !isHygiene(file)) carried.push(name);
    else run.push(st);
  }
  return { base, changed, steps: run, carried };
}

function showFile(root, base, file) {
  const ref = String(base || "main").split("...")[0] || "main";
  try {
    return execFileSync("git", ["show", ref + ":" + file], {
      cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    });
  } catch (e) {
    return null;
  }
}

/* The bytes outside every top-level scripts string. The interiors are cut, so only a real edit of the rest moves the skeleton. */
function cutScriptValues(text) {
  if (typeof text !== "string") return null;
  const cuts = [];
  const scripts = new Map();
  let i = 0;
  const n = text.length;
  const skip = () => { while (i < n && /[\t\r\n ]/.test(text[i])) i++; };
  function parseString(record) {
    if (text[i] !== '"') return null;
    const open = i;
    i++;
    let out = "";
    while (i < n) {
      const c = text[i];
      if (c === '"') {
        if (record) cuts.push([open + 1, i]);
        i++;
        return out;
      }
      if (c === "\\") {
        i++;
        if (i >= n) return null;
        const e = text[i++];
        if (e === "u") {
          const h = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(h)) return null;
          out += String.fromCharCode(parseInt(h, 16));
          i += 4;
        } else if (e === "n") out += "\n";
        else if (e === "r") out += "\r";
        else if (e === "t") out += "\t";
        else out += e;
      } else { out += c; i++; }
    }
    return null;
  }
  function parseValue(depth) {
    skip();
    if (i >= n) return false;
    const c = text[i];
    if (c === '"') return parseString(false) !== null;
    if (c === "{") {
      i++;
      skip();
      if (text[i] === "}") { i++; return true; }
      while (i < n) {
        skip();
        if (text[i] !== '"') return false;
        const key = parseString(false);
        if (key === null) return false;
        skip();
        if (text[i] !== ":") return false;
        i++;
        if (depth === 0 && key === "scripts") { if (!parseScripts()) return false; }
        else if (!parseValue(depth + 1)) return false;
        skip();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "}") { i++; return true; }
        return false;
      }
      return false;
    }
    if (c === "[") {
      i++;
      skip();
      if (text[i] === "]") { i++; return true; }
      while (i < n) {
        if (!parseValue(depth + 1)) return false;
        skip();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "]") { i++; return true; }
        return false;
      }
      return false;
    }
    const m = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if (!m) return false;
    i += m[0].length;
    return true;
  }
  function parseScripts() {
    skip();
    if (text[i] !== "{") return false;
    i++;
    skip();
    if (text[i] === "}") { i++; return true; }
    while (i < n) {
      skip();
      if (text[i] !== '"') return false;
      const key = parseString(false);
      if (key === null) return false;
      skip();
      if (text[i] !== ":") return false;
      i++;
      skip();
      if (text[i] !== '"') return false;
      const val = parseString(true);
      if (val === null) return false;
      scripts.set(key, val);
      skip();
      if (text[i] === ",") { i++; continue; }
      if (text[i] === "}") { i++; return true; }
      return false;
    }
    return false;
  }
  skip();
  if (!parseValue(0)) return null;
  skip();
  if (i !== n) return null;
  let skeleton = "";
  let at = 0;
  for (const [a, b] of cuts.slice().sort((p, q) => p[0] - q[0])) {
    skeleton += text.slice(at, a);
    at = b;
  }
  skeleton += text.slice(at);
  return { skeleton, scripts };
}

function scriptEntries(value) {
  const entries = [];
  for (const part of String(value).split("&&")) {
    const raw = part.trim().replace(/\s+/g, " ");
    if (!raw) continue;
    const m = /^node\s+(\S+)(?:\s+(.*))?$/.exec(raw);
    if (!m) entries.push({ kind: "other", raw, file: "", args: [] });
    else {
      const file = m[1].replace(/^\.\//, "").replace(/\\/g, "/");
      const args = m[2] ? m[2].split(" ").filter(Boolean) : [];
      entries.push({ kind: "node", raw, file, args });
    }
  }
  return entries;
}

function alignNodeEntries(before, after) {
  const count = (list) => {
    const m = new Map();
    for (const e of list) m.set(e.raw, (m.get(e.raw) || 0) + 1);
    return m;
  };
  const inter = new Map();
  const bc = count(before);
  const ac = count(after);
  for (const [raw, n] of bc) inter.set(raw, Math.min(n, ac.get(raw) || 0));
  const take = (list) => {
    const bag = new Map(inter);
    const kept = [];
    const rest = [];
    for (const e of list) {
      const n = bag.get(e.raw) || 0;
      if (n > 0) { bag.set(e.raw, n - 1); kept.push(e.raw); }
      else rest.push(e);
    }
    return { kept, rest };
  };
  const b = take(before);
  const a = take(after);
  if (b.kept.join("\0") !== a.kept.join("\0")) return null;
  if (b.rest.some(e => e.kind !== "node") || a.rest.some(e => e.kind !== "node")) return null;
  const removedFiles = new Set(b.rest.map(e => e.file));
  if (a.rest.some(e => removedFiles.has(e.file))) return null;
  return { added: a.rest, removed: b.rest };
}

/* A package.json edit is confined when only whole node entries were added or removed inside script values. */
export function scriptChainEdit(baseText, headText) {
  const base = cutScriptValues(baseText);
  const head = cutScriptValues(headText);
  if (!base || !head) return { confined: false, reason: "package.json does not parse", added: [], removed: [] };
  if (base.skeleton !== head.skeleton) return { confined: false, reason: "bytes outside the script values differ", added: [], removed: [] };
  const added = [];
  const removed = [];
  const names = new Set([...base.scripts.keys(), ...head.scripts.keys()]);
  for (const name of names) {
    if (!base.scripts.has(name) || !head.scripts.has(name)) {
      return { confined: false, reason: "a script was added or removed", added: [], removed: [] };
    }
    const b = base.scripts.get(name);
    const h = head.scripts.get(name);
    if (b === h) continue;
    const aligned = alignNodeEntries(scriptEntries(b), scriptEntries(h));
    if (!aligned) return { confined: false, reason: "a script reorders or changes an entry", added: [], removed: [] };
    added.push(...aligned.added);
    removed.push(...aligned.removed);
  }
  return { confined: true, added, removed };
}

function appendTextScans(steps, addedFiles, windowGates, root, changed, gf) {
  const scans = gf && gf.SCANS;
  const match = gf && gf.globMatches;
  if (!scans || typeof match !== "function") return;
  const files = changed.map(normRel);
  for (const leg of Object.keys(scans)) {
    const globs = scans[leg];
    if (!Array.isArray(globs) || !globs.length) continue;
    if (!files.some(f => globs.some(g => match(g, f)))) continue;
    const abs = path.join(root, leg);
    if (!fs.existsSync(abs)) continue;
    let kind = "node";
    try { if (typeof gf.windowKind === "function") kind = gf.windowKind(abs); } catch (e) { kind = "node"; }
    if (kind === "window") {
      if (!windowGates.includes(leg)) {
        windowGates.push(leg);
        console.log("gate-run area: window gate " + leg + " left out, walled: argued separately");
      }
      continue;
    }
    if (!addedFiles.has(leg)) {
      steps.push({ script: "area", cmd: "node " + leg, file: leg, args: [], note: "reads a changed file as text" }); /* plant:text-scan */
      addedFiles.add(leg);
    }
  }
}

/* A FAIL-CLOSED PLAN IS NEVER NARROWER THAN THE MAPPED ONE (the test architect, 2026-11-11). The whole chain is the `test`
   script, and a node leg on a script of its own (smoke.js, `npm run smoke`) is not on it: fold 32 touched gates-for.mjs, failed
   closed, and left out the smoke run that about.js maps to, whose red then stood on main. So the legs gates-for maps the other
   changed files to join the chain here, by the same rules as a mapped plan: a window gate stays walled, a visual leg and a
   release-only leg stay with the release profile, and the runner is never its own leg. */
function closePlan(root, wholeChain, changed, gf, reason, extra, mapped) {
  const visualOut = wholeChain.filter(s => VISUAL_SET.has(normRel(s.file)));
  if (visualOut.length) console.log("gate-run area: " + visualOut.length + " visual leg(s) left to the release profile");
  const steps = withFloor(root, wholeChain.filter(s => !VISUAL_SET.has(normRel(s.file))));
  const added = new Set(steps.map(s => normRel(s.file)));
  const walled = [];
  const releaseOnly = new Set(RELEASE_ONLY_LEGS);
  for (const row of mapped || []) {
    const g = normRel(row.gate || "");
    if (!g || added.has(g)) continue;
    if (row.kind === "window") { if (!walled.includes(g)) walled.push(g); continue; }
    if (VISUAL_SET.has(g) || releaseOnly.has(g) || g === "tools/gate-run.mjs") continue;
    /* A packaging tool is no merge gate here either, as on the mapped plan (the test architect, 2026-11-11): fold 37's
       shared-diff plan ran package-linux on Windows, which failed and left a Linux dist that turned four legs red. */
    if (NOT_MERGE_SET.has(g)) { console.log("gate-run area: " + g + " is a packaging tool, not a merge gate"); continue; }
    if (!fs.existsSync(path.join(root, g))) continue;
    steps.push({ script: "area", cmd: "node " + g, file: g, args: [], note: "mapped by gates-for, beside the whole chain" }); /* plant:closed-mapped */
    added.add(g);
  }
  appendTextScans(steps, added, walled, root, changed, gf);
  appendNodeArms(steps, added, walled, root, gf);
  return Object.assign({ failClosed: true, reason, steps, walled }, extra || {});
}

/* A WALLED GATE'S NODE ARM RUNS (the test architect, 2026-11-13: Studio's cursor 1c stood red on main for four days because the
   file's second half opens a window, so its node half never ran at a merge). A window gate left out whose header names a
   "gate-node-arm:" (tools/gates-for.mjs nodeArmOf) has that arm run, with no window; the gate stays walled for the rest. */
function appendNodeArms(steps, addedFiles, windowGates, root, gf) {
  if (!gf || typeof gf.nodeArmOf !== "function") return;
  for (const leg of windowGates) {
    let arm = null;
    try { arm = gf.nodeArmOf(path.join(root, leg)); } catch (e) { arm = null; }
    if (!arm || addedFiles.has(leg)) continue;
    const cmd = "node " + leg + " " + arm.join(" ");
    steps.push({ script: "area", cmd, file: leg, args: arm.slice(), note: "the walled gate's node arm" }); /* plant:node-arm */
    addedFiles.add(leg);
    console.log("gate-run area: window gate " + leg + " runs its node arm alone: " + cmd);
  }
}

/* A bare tests/relay-channel.mjs step runs every part. Replace it with the parts that read the diff,
   leaving out the release-only part. The suite's own change runs every part that is not release-only.
   A relay file keeps the sealing and refusal parts on that pass. No part means a bare step goes.
   A diff the graph hits, with no bare step yet, gains one step: team-join is not relay code and is not
   a text scan, so nothing else schedules the file. An empty part list leaves a bare step whole, so a
   parse that found nothing cannot drop the file. */
function narrowRelayChannel(steps, root, changed, gf, isRelayCode) {
  if (!gf || typeof gf.relayChannelParts !== "function" || typeof gf.relayChannelPartIds !== "function") return;
  const order = gf.relayChannelPartIds(root);
  if (!order.length) return;
  const release = new Set(RELEASE_ONLY_PARTS);
  const own = (changed || []).some(f => normRel(f) === "tests/relay-channel.mjs");
  let chosen;
  if (own) {
    chosen = order.filter(id => !release.has(id));
  } else {
    const hit = new Set(gf.relayChannelParts(root, (changed || []).map(normRel)));
    if ((changed || []).some(f => isRelayCode(normRel(f)))) {
      for (const id of CHANNEL_SEAL_PARTS) hit.add(id);
    }
    chosen = order.filter(id => hit.has(id) && !release.has(id));
  }
  const bare = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (normRel(s.file) !== "tests/relay-channel.mjs") continue;
    if (s.env && s.env.RELAY_CHANNEL_ONLY) continue;
    bare.push(i);
  }
  if (!chosen.length) {
    if (!bare.length) return;
    for (let k = bare.length - 1; k >= 0; k--) steps.splice(bare[k], 1);
    console.log("gate-run area: no relay-channel part reads this diff");
    return;
  }
  const envOnly = { RELAY_CHANNEL_ONLY: chosen.join(",") };
  const note = "relay-channel parts (" + chosen.length + ")";
  if (!bare.length) {
    steps.push({
      script: "area",
      cmd: "node tests/relay-channel.mjs",
      file: "tests/relay-channel.mjs",
      args: [],
      env: envOnly,
      note,
    });
  } else {
    const first = bare[0];
    steps[first] = Object.assign({}, steps[first], {
      args: (steps[first].args || []).slice(),
      env: Object.assign({}, steps[first].env, envOnly),
      note,
    });
    for (let k = bare.length - 1; k >= 1; k--) steps.splice(bare[k], 1);
  }
  console.log("gate-run area: relay-channel runs " + chosen.length + " part(s)");
}

export async function planAreaRun(root, changed, pkg, base = "main", ready) {
  const gf = await loadGatesFor();
  const isSharedCode = gf && gf.isSharedCode ? gf.isSharedCode : () => false;
  const isProductFile = gf && gf.isProductFile ? gf.isProductFile : () => false;
  const isRelayCode = gf && gf.isRelayCode ? gf.isRelayCode : () => false;
  const gatesFor = gf && gf.gatesFor ? gf.gatesFor : () => [];

  const testSteps = parseStepsFromScript(pkg, "test");
  const wholeChain = testSteps.length ? testSteps : Object.keys(pkg.scripts || {}).flatMap(s => parseStepsFromScript(pkg, s));

  /* A diff confined to the gate tools runs their own legs and the floor (rule 1, as amended 2026-10-28), not the whole run. */
  const toolsOnly = !!(gf && typeof gf.isGateToolsOnly === "function" && gf.isGateToolsOnly(changed));
  if (toolsOnly) console.log("gate-run area: the diff is confined to the gate tools, so their own legs and the floor run (rule 1)");

  /* An unchanged package.json, or one whose edit is not a whole script entry, still fails closed. */
  let scriptEdit = null;
  if (changed.some(f => normRel(f) === "package.json")) {
    const baseText = showFile(root, base, "package.json");
    let headText = null;
    try { headText = fs.readFileSync(path.join(root, "package.json"), "utf8"); } catch (e) { headText = null; }
    scriptEdit = (baseText == null || headText == null)
      ? { confined: false, reason: "the base package.json cannot be read", added: [], removed: [] }
      : scriptChainEdit(baseText, headText);
  }
  const acceptedScript = !!(scriptEdit && scriptEdit.confined && (scriptEdit.added.length || scriptEdit.removed.length));

  for (const f of toolsOnly ? [] : changed) {
    if (isSharedCode(f)) {
      if (normRel(f) === "package.json" && acceptedScript) continue; /* plant:script-chain */
      let mappedBeside = [];
      try { mappedBeside = gatesFor(root, changed.filter(x => !isSharedCode(x)), ready); } catch { mappedBeside = []; }
      return closePlan(root, wholeChain, changed, gf, "fail-closed to whole chain: change in shared code " + f,
        { plan: "fail-closed: " + normRel(f) }, mappedBeside);
    }
  }

  /* No "more than half" fail-close since 2026-11-08 18:36: a file runs the legs gates-for maps it to. */
  const gatedChanged = changed.filter(f => !(acceptedScript && normRel(f) === "package.json"));
  let rows = [];
  if (!toolsOnly) { try { rows = gatesFor(root, gatedChanged, ready); } catch { rows = []; } }

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

  /* engine-selftest's 31a also holds every gate in tests/ to a chain or to NOT_GATES, so whatever selects chain-split for that
     reason selects it too: lab-owner.mjs reached main named by chain-split's list and not by 31a's (the test architect, 2026-11-09). */
  const alsoSelftest = (note) => {
    if (fs.existsSync(path.join(root, "tests", "engine-selftest.js")) && !addedFiles.has("tests/engine-selftest.js")) {
      steps.push({ script: "area", cmd: "node tests/engine-selftest.js", file: "tests/engine-selftest.js", args: [], note });
      addedFiles.add("tests/engine-selftest.js");
    }
  };
  /* A test file added, removed or renamed selects chain-split, which holds every test file to a chain (gates-for's
     testsListChanged; the test architect's edge, 2026-10-28). */
  if (gf && typeof gf.testsListChanged === "function" && gf.testsListChanged(root, changed, base)
      && fs.existsSync(path.join(root, "tests", "chain-split.mjs")) && !addedFiles.has("tests/chain-split.mjs")) {
    steps.push({ script: "area", cmd: "node tests/chain-split.mjs", file: "tests/chain-split.mjs", args: [],
      note: "a test file added, removed or renamed" });
    addedFiles.add("tests/chain-split.mjs");
  }
  if (gf && typeof gf.testsListChanged === "function" && gf.testsListChanged(root, changed, base)) alsoSelftest("a test file added, removed or renamed"); /* plant:selftest-on-added */

  /* A confined script edit selects each added file, the gates that read it, and chain-split. A removed entry selects chain-split only. */
  if (acceptedScript && fs.existsSync(path.join(root, "tests", "chain-split.mjs")) && !addedFiles.has("tests/chain-split.mjs")) {
    steps.push({ script: "area", cmd: "node tests/chain-split.mjs", file: "tests/chain-split.mjs", args: [],
      note: "a script chain gained or lost an entry" });
    addedFiles.add("tests/chain-split.mjs");
  }
  if (acceptedScript) alsoSelftest("a script chain gained or lost an entry");
  if (acceptedScript) {
    for (const e of scriptEdit.added) {
      const abs = path.join(root, e.file);
      let kind = "node";
      try {
        if (gf && typeof gf.windowKind === "function" && fs.existsSync(abs)) kind = gf.windowKind(abs);
      } catch (err) { kind = "node"; }
      if (kind === "window") {
        if (!windowGates.includes(e.file)) {
          windowGates.push(e.file);
          console.log("gate-run area: window gate " + e.file + " left out, walled: argued separately");
        }
        continue; /* plant:window-entry */
      }
      if (fs.existsSync(abs) && !addedFiles.has(e.file)) {
        const tail = e.args.length ? " " + e.args.join(" ") : "";
        steps.push({ script: "area", cmd: "node " + e.file + tail, file: e.file, args: e.args.slice() });
        addedFiles.add(e.file);
      }
      let mapped = [];
      try { mapped = gatesFor(root, [e.file], ready); } catch (err) { mapped = []; }
      for (const row of mapped) {
        if (row.kind === "window") {
          if (!windowGates.includes(row.gate)) {
            windowGates.push(row.gate);
            console.log("gate-run area: window gate " + row.gate + " left out, walled: argued separately");
          }
          continue;
        }
        if (row.gate === "tools/gate-run.mjs") continue;
        if (!addedFiles.has(row.gate) && fs.existsSync(path.join(root, row.gate))) {
          steps.push({ script: "area", cmd: "node " + row.gate, file: row.gate, args: [] });
          addedFiles.add(row.gate);
        }
      }
    }
  }

  let addedProductCore = false;
  for (const f of changed) {
    if (acceptedScript && normRel(f) === "package.json") continue;
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
    "tests/log-hygiene-selftest.js",
    "tests/result-line.mjs",
    "tests/sbom.mjs",
    "tests/text-scan-selftest.js",
  ]);

  const releaseOnlySet = new Set(RELEASE_ONLY_LEGS);
  for (const g of gateFiles) {
    if (g === "tests/plant-hold.mjs" || g === "tests/plant-compare.mjs") continue;
    /* The runner is never its own leg: gates-for names it as a gate because npm run gates runs it, and called bare it
       refuses with 78. Its own legs are its tests (16p). */
    if (g === "tools/gate-run.mjs") continue; /* plant:runner-self */
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
    if (NOT_MERGE_SET.has(g)) { console.log("gate-run area: " + g + " is a packaging tool, not a merge gate"); continue; }
    if (VISUAL_SET.has(g)) { console.log("gate-run area: visual leg " + g + " left to the release profile"); continue; }
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

  appendTextScans(steps, addedFiles, windowGates, root, changed, gf);
  appendNodeArms(steps, addedFiles, windowGates, root, gf);
  narrowRelayChannel(steps, root, changed, gf, isRelayCode);
  return { failClosed: false, reason: "", plan: toolsOnly ? "gate tools" : "mapped", steps, gaps, walled: windowGates };
}

function git(args) {
  try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }
  catch (e) { return ""; }
}

function gitBlobHash(relPath) {
  const h = git(["hash-object", relPath]);
  if (h && /^[0-9a-f]{40}$/.test(h)) return h;
  try {
    const buf = fs.readFileSync(path.resolve(ROOT, relPath));
    return crypto.createHash("sha1").update("blob " + buf.length + "\0").update(buf).digest("hex");
  } catch (e) {
    return "";
  }
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

function treeFiles(opts = {}) {
  const retries = opts.retries || 0;
  const delayMs = opts.delayMs || 250;
  let listed = null;
  let attempts = 0;
  while (attempts <= retries) {
    attempts++;
    try {
      if (process.env.ETIUDA_GIT_STUB) {
        if (process.env.ETIUDA_GIT_STUB === "fail-once") {
          if (!treeFiles._failedOnce) {
            treeFiles._failedOnce = true;
            throw new Error("stub: git failed once");
          }
        } else if (process.env.ETIUDA_GIT_STUB === "retry-after") {
          if (opts.isAfterGate && attempts === 1) {
            throw new Error("stub: git failed first attempt after gate");
          }
        } else if (process.env.ETIUDA_GIT_STUB === "never" || process.env.ETIUDA_GIT_STUB === "never-after") {
          if (process.env.ETIUDA_GIT_STUB === "never" || opts.isAfterGate) {
            throw new Error("stub: git never answers");
          }
        }
      }
      listed = execFileSync("git", ["ls-files", "-z", "-c", "-o", "--exclude-standard"],
        { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
      break;
    } catch (e) {
      listed = null;
      if (attempts <= retries) {
        try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs); } catch (_) {}
      }
    }
  }
  if (listed !== null) {
    const names = [...new Set(listed.split("\0").filter(Boolean))];
    if (names.length) return { how: "git ls-files -co --exclude-standard", files: names.sort(), unmerged: unmergedPaths(), gitOk: true };
  }
  const out = [];
  walkInto(ROOT, "", out);
  return { how: "walk skipping .git, node_modules and .plant-hold", files: out.sort(), unmerged: 0, gitOk: false };
}

function unmergedPaths() {
  let listed = "";
  try {
    listed = execFileSync("git", ["ls-files", "-z", "-u"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  } catch (e) { return 0; }
  return new Set(listed.split("\0").filter(Boolean).map(l => l.slice(l.indexOf("\t") + 1))).size;
}

function fingerprint(opts = {}) {
  const { how, files, unmerged, gitOk } = treeFiles(opts);
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
  return { how, hash: whole.digest("hex").slice(0, 16), count: files.length, bytes, per, unmerged, gitOk };
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
export const stamp = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
  + "T" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + "-" + pad(d.getMilliseconds(), 3);

export function profileSummaryFileName(profile = "release", date = new Date()) {
  return `${profile}-summary-${stamp(date)}.json`;
}

export function writeProfileSummary(runsDir, data) {
  const profile = data.profile || "release";
  const d = data.time ? new Date(data.time) : new Date();
  const file = path.join(runsDir, profileSummaryFileName(profile, d));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  return file;
}

const RESERVED = ["ok", "fail", "exitCode"];

/* A RED NAMES ITSELF IN ITS RECORD (the test architect, 2026-11-09): three team-lock reds under load held counts only, and the
   leg was green alone, so nothing said which check had failed. A red gate's record keeps each FAIL line, the indented lines that
   follow it (where a leg prints its state), any SUITE DID NOT COMPLETE and any SHELL DID NOT START, at most 40 lines of at most
   400 characters. A test's own output only: fixtures are invented, and the record stays on this machine. */
function failLinesOf(out) {
  const lines = String(out || "").split(/\r?\n/);
  const kept = [];
  let follow = 0;
  for (const l of lines) {
    if (kept.length >= 40) break;
    if (/^\s*FAIL\b/.test(l) || /SUITE DID NOT COMPLETE/.test(l) || /SHELL DID NOT START:/.test(l)) { kept.push(l.slice(0, 400)); follow = 3; continue; } /* plant:fail-lines */
    if (follow > 0 && /^\s{5,}\S/.test(l)) { kept.push(l.slice(0, 400)); follow--; continue; }
    follow = 0;
  }
  return kept;
}

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

/* EACH STEP'S SCRATCH IS ITS OWN, AND GOES WITH IT (the test architect, 2026-11-11). A leg makes its labs under
   os.tmpdir(), and most never remove them: one night left 757 folders in %TEMP%, one kind 89 MB apiece. So each step runs
   with TEMP, TMP and TMPDIR set to a folder this runner makes for it (a step or a caller that names its own TEMP keeps it),
   and that folder is removed when the step ends, pass or fail, by the literal path made here, a link inside it removed and
   never followed. ETIUDA_KEEP_TMP=1 keeps it for a red being read, and the run names where. This is a wrapper's clean-up
   of its own temporary files, which the office charter's "nothing is deleted" leaves outside its rule (section 6). */
const STEP_SCRATCH_PREFIX = "egr-";
const STEP_SCRATCH_BASE = os.tmpdir();
function stepScratch() {
  try { return fs.mkdtempSync(path.join(STEP_SCRATCH_BASE, STEP_SCRATCH_PREFIX)); } catch { return null; }
}
/* Removes what it can under p, never following a link or junction (lstat sees one as a link; it goes by unlink or
   rmdir of the link itself), and answers how many entries stayed (a file a live process still holds). */
function scratchRemove(p) {
  let st;
  try { st = fs.lstatSync(p); } catch { return 0; }
  if (st.isSymbolicLink()) {
    try { fs.unlinkSync(p); return 0; } catch { try { fs.rmdirSync(p); return 0; } catch { return 1; } }
  }
  if (st.isDirectory()) {
    let left = 0, names = [];
    try { names = fs.readdirSync(p); } catch { return 1; }
    for (const n of names) left += scratchRemove(path.join(p, n));
    try { fs.rmdirSync(p); } catch { left += 1; }
    return left;
  }
  try { fs.unlinkSync(p); return 0; } catch {}
  try { fs.chmodSync(p, 0o666); fs.unlinkSync(p); return 0; } catch { return 1; }
}
function stepScratchEnd(dir) {
  if (!dir || path.dirname(dir) !== STEP_SCRATCH_BASE || !path.basename(dir).startsWith(STEP_SCRATCH_PREFIX)) return;
  if (process.env.ETIUDA_KEEP_TMP === "1") { console.log("gate-run: kept the step's scratch " + dir + " (ETIUDA_KEEP_TMP=1)"); return; }
  const left = scratchRemove(dir);
  if (left) console.log("gate-run: the step's scratch " + dir + " kept " + left + " entr" + (left === 1 ? "y" : "ies") + " it could not remove");
}

/* A CUSTOMER'S ROOTS (the test architect, 2026-11-11, board 989). Every agent shell on this laptop carries
   NODE_USE_SYSTEM_CA=1, so a leg run here trusted the Windows store (284 roots under Electron 44.3's Node), while a
   customer's installed app starts with no such variable and trusts Node's bundled roots alone (118). A leg touching Node's
   TLS could pass here and fail behind a customer's inspecting gateway. So no step inherits a variable that widens the
   roots: NODE_USE_SYSTEM_CA and NODE_EXTRA_CA_CERTS, matched by name in any case, are cleared from what a step inherits.
   A leg that means to test a widened store asks by name: ROOTS_MARKER within its first lines keeps them. */
const ROOTS_MARKER = "/* run: system roots */";
const ROOTS_WIDENERS = /^(NODE_USE_SYSTEM_CA|NODE_EXTRA_CA_CERTS)$/i;
function asksSystemRoots(file) {
  let text;
  try { text = fs.readFileSync(path.resolve(ROOT, file), "utf8"); } catch { return false; }
  return text.split(/\r?\n/).slice(0, 15).some(l => l.trim() === ROOTS_MARKER);
}
function inheritedEnv(step) {
  const env = Object.assign({}, process.env);
  if (asksSystemRoots(step.file)) return env;
  for (const k of Object.keys(env)) if (ROOTS_WIDENERS.test(k)) delete env[k];
  return env;
}

/* THE WALL-CLOCK LIMIT ON ONE GATE (the test architect, 2026-11-12): a gate still running at STEP_WALL_MS is stopped with its whole
   process tree, by its own PID, and reads red with exit STEP_WALL_EXIT and a line naming it. A ceiling inside a gate's own process
   cannot be trusted for a hang: Studio's tmr10 stalled 27 minutes and more under load while the pinned syncer's synchronous retries
   (Atomics.wait) held the event loop its 120 s timer needed. The limit is outside, here. ETIUDA_STEP_WALL_MS overrides it. */
export const STEP_WALL_MS_DEFAULT = 25 * 60 * 1000;
export const STEP_WALL_EXIT = 124;
const stepWallMs = () => { const v = Number(process.env.ETIUDA_STEP_WALL_MS); return v > 0 ? v : STEP_WALL_MS_DEFAULT; };
/** Stops `pid` and every process it started, by that PID: taskkill /T on Windows; elsewhere the gate runs as a process group of its
 *  own (runStep's detached spawn), so the whole group goes by its negative PID, the gate alone where no group was made. Off Windows
 *  the gate's own PID alone left its children running (Claude gamma's Linux floor sweep, 2026-11-13, engine gate-run 16a). */
export function stopTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else { try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } } }
}

function runStep(step, customEnv = {}) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const scratch = stepScratch();
    const own = scratch ? { TEMP: scratch, TMP: scratch, TMPDIR: scratch } : {};
    const env = Object.assign(inheritedEnv(step), own, customEnv, step.env || {});
    const child = spawn(process.execPath, [step.file].concat(step.args),
      /* Off Windows its own process group, so the wall stops it with its children (stopTree). */
      { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    let out = "", overWall = false;
    const limit = stepWallMs();
    const wall = setTimeout(() => { overWall = true; stopTree(child.pid); }, limit); /* plant:step-wall */
    child.stdout.on("data", d => { out += d; process.stdout.write(d); });
    child.stderr.on("data", d => { out += d; process.stderr.write(d); });
    child.on("close", code => {
      clearTimeout(wall);
      stepScratchEnd(scratch);
      if (overWall) {
        const said = "  FAIL gate-run: " + step.file + " was still running at the wall-clock limit (" + Math.round(limit / 1000) + " s) and was stopped with its process tree";
        out += "\n" + said + "\n";
        process.stdout.write(said + "\n");
      }
      resolve({ exit: overWall ? STEP_WALL_EXIT : code === null ? -1 : code, wallMs: Date.now() - t0, out, overWall });
    });
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
  const inProfile = mode === "release" || mode === "nightly";

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

  { const gone = modulesGone(); if (gone) refuse(gone, MODULES_HOW); }
  const inTemp = /\\AppData\\Local\\Temp\\/i.test(ROOT) || inside(os.tmpdir(), ROOT);
  if (mode === "nightly") {
    if (inTemp && process.env.ETIUDA_NIGHTLY_ALLOW_TEMP !== "1" && !asked.includes("--dry-run")) {
      refuse("the nightly profile refuses to run from a folder under %TEMP%: " + ROOT,
        "nightly runs must run from a main checkout outside %TEMP%");
    }
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const repo = repoOfPackage(pkg);
  if (!repo) refuse("the package name does not say which repository this is, and the path is not a substitute",
    "package.json name is etiuda or etiuda-studio");
  let steps = [];
  let initialProfileSteps = [];
  let isHeavy = process.env.ETIUDA_HEAVY === "1";
  let customEnv = {};
  let gateLabel = asked.join(" ");
  let walled = [];
  let areaPlan = "";

  if (mode === "area") {
    const base = asked[1] || "main...HEAD";
    const gf = await loadGatesFor();
    const changed = gf ? gf.changedFiles(ROOT, base) : [];
    console.log("gate-run area: base " + base + ", " + changed.length + " changed file(s)");
    const plan = await planAreaRun(ROOT, changed, pkg, base);
    areaPlan = plan.plan || "";
    if (plan.failClosed) {
      console.log("gate-run area: fail-closed to whole chain: " + plan.reason);
      isHeavy = true;
    }
    steps = plan.steps;
    const capStep = childCapStep(ROOT, base);
    if (capStep) steps.splice(steps.length && steps[0].file === "tests/plant-hold.mjs" ? 1 : 0, 0, capStep);
    walled = plan.walled || [];
    customEnv.ETIUDA_PLANTS = "off";
    gateLabel = "area";
    /* An area run takes a lane of the machine lock like any heavy run (Claude alpha's bound of 2026-11-12 19:35: at most four gate
       runs alive at once, two while Max uses the laptop, area runs counted); nine ran at once that evening because area took none. */
    isHeavy = true; /* plant:area-lane */
  } else if (mode === "release") {
    isHeavy = true;
    gateLabel = "release";
    customEnv.ETIUDA_PROFILE = "release";
    steps = profileSteps(ROOT, pkg);
    initialProfileSteps = [...steps];
  } else if (mode === "nightly") {
    isHeavy = true;
    gateLabel = "nightly";
    customEnv.ETIUDA_PROFILE = "nightly";
    steps = profileSteps(ROOT, pkg);
    initialProfileSteps = [...steps];
  } else if (mode === "file") {
    const fileArgs = asked.slice(1).filter(a => !a.startsWith("--"));
    if (!fileArgs.length) refuse("no test file was named", "node tools/gate-run.mjs file tests/<path>");

    const gf = await loadGatesFor();
    const named = new Set();
    const regularNamed = new Set();
    if (pkg && pkg.scripts) {
      for (const scriptName of Object.keys(pkg.scripts)) {
        for (const step of parseStepsFromScript(pkg, scriptName)) {
          if (step.file) {
            const norm = normRel(step.file).replace(/^\.\//, "");
            named.add(norm);
            if (scriptName !== "release" && scriptName !== "nightly") regularNamed.add(norm);
          }
        }
      }
    }
    if (gf && gf.SCANS) {
      for (const key of Object.keys(gf.SCANS)) {
        const norm = normRel(key).replace(/^\.\//, "");
        named.add(norm);
        regularNamed.add(norm);
      }
    }

    const profileNamed = new Set();
    const nightlyOnlyNamed = new Set();
    for (const n of NIGHTLY_LEGS) {
      if (n.file) {
        const norm = normRel(n.file).replace(/^\.\//, "");
        profileNamed.add(norm);
      }
    }
    for (const r of RELEASE_ONLY_LEGS) {
      profileNamed.add(normRel(r).replace(/^\.\//, ""));
    }
    try {
      for (const s of profileSteps(ROOT, pkg)) {
        if (s.file) profileNamed.add(normRel(s.file).replace(/^\.\//, ""));
      }
    } catch {}
    if (pkg && pkg.scripts) {
      if (pkg.scripts.release) {
        for (const step of parseStepsFromScript(pkg, "release")) {
          if (step.file) profileNamed.add(normRel(step.file).replace(/^\.\//, ""));
        }
      }
      if (pkg.scripts.nightly) {
        for (const step of parseStepsFromScript(pkg, "nightly")) {
          if (step.file) {
            const norm = normRel(step.file).replace(/^\.\//, "");
            profileNamed.add(norm);
            if (!profileSteps(ROOT, pkg).some(s => normRel(s.file).replace(/^\.\//, "") === norm)) {
              nightlyOnlyNamed.add(norm);
            }
          }
        }
      }
    }
    for (const f of profileNamed) named.add(f);

    let hasProfileOnlyLeg = false;
    let onlyNightlyLeg = false;
    for (const raw of fileArgs) {
      const slashNorm = raw.replace(/\\/g, "/");
      const normPath = path.posix.normalize(slashNorm).replace(/^\.\//, "");
      if (profileNamed.has(normPath) && !regularNamed.has(normPath)) {
        hasProfileOnlyLeg = true;
        if (nightlyOnlyNamed.has(normPath)) onlyNightlyLeg = true;
      }
    }
    if (hasProfileOnlyLeg && !customEnv.ETIUDA_PROFILE) {
      customEnv.ETIUDA_PROFILE = process.env.ETIUDA_PROFILE || (onlyNightlyLeg ? "nightly" : "release");
    }

    for (const raw of fileArgs) {
      const isAbs = path.isAbsolute(raw) || path.win32.isAbsolute(raw) || path.posix.isAbsolute(raw)
        || /^[a-zA-Z]:/.test(raw) || raw.startsWith("/") || raw.startsWith("\\");
      if (isAbs) refuse("the path is absolute: " + raw, "give a relative path under tests/");

      const slashNorm = raw.replace(/\\/g, "/");
      if (slashNorm.startsWith("../") || slashNorm === ".." || path.posix.normalize(slashNorm).startsWith("../")) {
        refuse("the path leaves the tree: " + raw, "give a relative path under tests/");
      }

      const normPath = path.posix.normalize(slashNorm).replace(/^\.\//, "");
      if (!normPath.startsWith("tests/") || normPath === "tests" || normPath === "tests/") {
        refuse("the path leaves tests/: " + raw, "give a path under tests/");
      }

      const fullPath = path.resolve(ROOT, normPath);
      let st = null;
      try { st = fs.statSync(fullPath); } catch (e) { st = null; }
      if (!st || !st.isFile()) {
        refuse("file does not exist: " + raw, "give an existing test file under tests/");
      }

      if (!named.has(normPath)) {
        refuse("no chain or gates-for names " + raw, "the file must be named by a package.json script or tools/gates-for.mjs SCANS"); /* plant:file-names */
      }

      steps.push({
        script: "file",
        cmd: "node " + normPath,
        file: normPath,
        filePath: normPath,
        args: [],
      });
    }
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

  const checkRealProfile = (mode === "area") || inProfile;
  let realProfileSnapBefore = null;
  let appRunningBefore = false;
  if (checkRealProfile) {
    appRunningBefore = isInstalledAppRunning();
    realProfileSnapBefore = takeRealProfileSnapshot();
  }

  let before = fingerprint();
  let tree = gitTree();
  const COMMIT = git(["rev-parse", "--short", "HEAD"]);
  const DIRTY = git(["status", "--porcelain"]).length > 0;

  console.log("gate-run: tree " + before.hash + ", " + before.count + " file(s), " + before.bytes
              + " byte(s), by " + before.how + "; git tree " + tree);

  /* C3: in the release profile a diff of files under tests/ alone, against the newest release run that held nothing, runs only what
     it reaches and the floor. Nightly and the full profile as before. */
  let inherits = "";
  if (mode === "release") {
    const plan = planTestOnly(ROOT, steps, tree);
    if (plan.base) {
      inherits = plan.base.gitTree;
      console.log("gate-run release: only files under tests/ changed since " + plan.base.head + " (" + plan.changed.length
        + " file(s)), whose release run held nothing: " + plan.steps.length + " of " + steps.length
        + " gate(s) run, the rest inherited from git tree " + inherits);
      steps = plan.steps;
    } else console.log("gate-run release: the full profile: " + plan.reason);
  }
  let carried = [];
  if (mode === "area" && process.env.ETIUDA_AREA_RESUME !== "off") {
    const plan = planAreaResume(ROOT, steps, tree);
    if (plan.base && plan.carried.length) {
      inherits = plan.base.gitTree;
      carried = plan.carried;
      console.log("gate-run area: only files under tests/ changed since the area run of " + plan.base.head + " (" + plan.changed.length
        + " file(s)): " + plan.steps.length + " of " + steps.length + " gate(s) run, " + carried.length + " carried from git tree "
        + inherits + ": " + carried.join(", "));
      steps = plan.steps;
    } else if (!plan.base) console.log("gate-run area: the whole plan: " + plan.reason);
  }

  if (asked.includes("--dry-run") || asked.includes("--list")) {
    console.log("gate-run " + mode + " dry run: " + steps.length + " gate(s) to run:");
    for (const s of steps) console.log("  " + s.cmd + (s.note ? " (" + s.note + ")" : ""));
    process.exit(0);
  }

  let lockRes = null;
  if (isHeavy) {
    console.log("gate-run: taking machine lock for heavy run (" + gateLabel + ")...");
    const timeoutMs = process.env.ETIUDA_LOCK_TIMEOUT_MS ? Number(process.env.ETIUDA_LOCK_TIMEOUT_MS) : DEFAULT_LOCK_TIMEOUT_MS;
    lockRes = acquireLock(LOCK_PATH, gateLabel, ROOT, timeoutMs);
    if (!lockRes.ok) refuse("could not acquire machine lock: " + lockRes.reason);
  }

  const runStart = new Date().toISOString();
  const ordered = deferAlone(steps);
  let worst = 0, written = 0, treeMoved = false, refusedAt = null, gitFailedAt = null;

  if (mode === "area" && fs.existsSync(CHAINS_PATH)) {
    try {
      const lines = fs.readFileSync(CHAINS_PATH, "utf8").split(/\r?\n/).filter(Boolean);
      const areaFiles = [...new Set(steps.map(s => stepFile(s)).filter(Boolean))];
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const rec = JSON.parse(lines[i]);
          const sameTree = rec.treeSha === before.hash || (tree !== "no git" && tree !== "uncommitted changes" && rec.gitTree === tree);
          if (!sameTree) continue;
          /* An area run inherits green only from a covering run: area, whole-chain, release or nightly, never a file run;
             completed with no reds, covering every gate this area would run (the test architect's criterion, 2026-11-08). */
          const isCoveringMode = (rec.gate === "area" || rec.gate === "test" || rec.gate === "whole-chain" || rec.gate === "release" || rec.gate === "nightly") && !rec.gate.startsWith("file");
          const isGreen = rec.counts && rec.counts.exitCode === 0 && Array.isArray(rec.reds) && rec.reds.length === 0 && !rec.holds;
          const coversAll = Array.isArray(rec.ran) && areaFiles.every(f => rec.ran.includes(f));
          if (!isCoveringMode || !coversAll) continue; /* plant:area-coverage */
          if (isGreen) {
            console.log("gate-run area: tree " + before.hash + " equals recorded green tree (" + (rec.head || rec.treeSha) + "), rerunning nothing: inherited from " + rec.gate + " (" + (rec.head || rec.treeSha) + ") which covers all " + areaFiles.length + " gate file(s)");
            if (isHeavy) releaseLock();
            process.exit(0);
          }
        } catch {}
      }
    } catch {}
  }

  const totalCounts = { ok: 0, fail: 0, lines: 0 };
  const redsList = [];
  const gatesList = [];
  const ranFiles = [];

  for (const step of ordered) {
    const goneNow = modulesGone();
    if (goneNow) {
      console.log("  FAIL " + goneNow);
      console.log("       " + MODULES_HOW);
      console.log("  gate-run: refused, the run has no verdict");
      redsList.push({ gate: gateName(step.file), cmd: step.cmd, exit: NO_VERDICT, cause: goneNow, class: "hold" });
      worst = NO_VERDICT;
      break;
    }
    const now = new Date();
    if (step.alone) console.log("gate-run: " + step.file.replace(/\\/g, "/") + " run after the rest of its list (not alone on the machine)");
    console.log("\n> " + step.cmd);
    if (!ranFiles.includes(stepFile(step))) ranFiles.push(stepFile(step));
    const res = await runStep(step, customEnv);
    const after = fingerprint({ retries: 3, delayMs: 250, isAfterGate: true });
    tree = gitTree();
    const gitNoAnswer = before.gitOk && !after.gitOk;
    if (gitNoAnswer) {
      console.log("  FAIL git did not answer while " + gateName(step.file) + " ran");
      worst = NO_VERDICT;
      const { counts, from, clashed } = countsOf(res.out, NO_VERDICT);
      const line = {
        gate: gateName(step.file),
        script: step.script,
        cmd: step.cmd,
        exit: NO_VERDICT,
        gateExit: res.exit,
        counts: counts,
        countsFrom: from,
        clash: clashed.length,
        refused: "",
        treeHash: after.hash,
        treeFiles: after.count,
        treeHow: after.how,
        treeChanged: 0,
        unmerged: after.unmerged,
        gitTree: tree,
        wallMs: res.wallMs,
        commit: COMMIT,
        dirty: DIRTY,
        time: now.toISOString(),
        run: runStart,
        cause: "git did not answer while " + gateName(step.file) + " ran",
      };
      if (step.filePath) {
        line.filePath = step.filePath;
        line.fileBlob = gitBlobHash(step.filePath);
      }
      if (line.exit !== 0) line.failLines = failLinesOf(res.out);
    gatesList.push({ gate: line.gate, wallMs: line.wallMs, exit: line.exit });
      redsList.push({
        gate: gateName(step.file),
        cmd: step.cmd,
        exit: NO_VERDICT,
        cause: "git did not answer while " + gateName(step.file) + " ran",
        class: "hold",
      });
      const file = path.join(RUNS, line.gate + "-" + stamp(now) + ".json");
      fs.writeFileSync(file, JSON.stringify(line) + "\n", "utf8");
      written++;
      console.log("  gate-run: " + path.basename(file) + " " + JSON.stringify(line.counts)
                  + " exit " + line.exit + " in " + line.wallMs + " ms, tree " + line.treeHash + ", git tree " + line.gitTree);
      gitFailedAt = { gate: line.gate, reason: "git did not answer while " + line.gate + " ran" };
      break;
    }

    let moved = after.hash === before.hash ? [] : movedFiles(before, after);
    if (before.how !== after.how) moved = []; /* plant:method-check */
    const verdict = moved.length ? NO_VERDICT : res.exit;
    const refused = res.exit === NO_VERDICT ? (/^#refused ([a-z][a-z0-9-]*)\s*$/m.exec(res.out) || [])[1] || "" : "";
    const { counts, from, clashed } = countsOf(res.out, verdict);
    if (clashed.length) console.log("  clash: " + clashed.length + " key(s) declared twice with"
      + " different values, the later kept: " + clashed.join(", "));

    if (counts.ok) totalCounts.ok = (totalCounts.ok || 0) + counts.ok;
    if (counts.fail) totalCounts.fail = (totalCounts.fail || 0) + counts.fail;
    if (counts.lines) totalCounts.lines = (totalCounts.lines || 0) + counts.lines;

    const isRed = verdict !== 0;
    /* A HYGIENE leg red in a release or nightly run is a warn: it holds nothing and the run goes on (the test architect's C2).
       A tree that moved under a gate has no verdict at all, so it is always a hold. */
    const isWarn = isRed && inProfile && !moved.length && isHygiene(step.file);
    if (isRed) {
      redsList.push({
        gate: gateName(step.file),
        cmd: step.cmd,
        exit: verdict,
        cause: "unread",
        class: isWarn ? "warn" : "hold",
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
    if (step.filePath) {
      line.filePath = step.filePath;
      line.fileBlob = gitBlobHash(step.filePath);
    }
    if (line.exit !== 0) line.failLines = failLinesOf(res.out);
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
    if (res.exit !== 0 && isWarn) { console.log("  gate-run: " + line.gate + " is a HYGIENE leg and red in the " + gateLabel + " profile: a warn, the run goes on"); continue; }
    if (res.exit !== 0) { worst = res.exit; if (refused) refusedAt = line; break; }
  }

  if (checkRealProfile && realProfileSnapBefore) {
    const appRunningAfter = isInstalledAppRunning();
    const appRunning = appRunningBefore || appRunningAfter;
    let unattributable = false;
    if (appRunning) unattributable = true; /* plant:running-app */
    const realProfileSnapAfter = takeRealProfileSnapshot();
    const diff = compareRealProfileSnapshots(realProfileSnapBefore, realProfileSnapAfter);
    if (diff.length) {
      const names = diff.join(", ");
      if (unattributable) {
        const msg = "the real profile changed while the installed app ran, so it cannot be attributed: " + names;
        if (mode === "area") {
          console.log("  WARN " + msg);
          redsList.push({
            gate: gateLabel,
            cmd: "gate-run " + gateLabel,
            exit: 0,
            cause: msg,
            class: "warn",
          });
        } else {
          console.log("  FAIL " + msg);
          console.log("  gate-run: refused, the run has no verdict");
          redsList.push({
            gate: gateLabel,
            cmd: "gate-run " + gateLabel,
            exit: NO_VERDICT,
            cause: msg,
            class: "hold",
          });
          worst = NO_VERDICT;
        }
      } else {
        console.log("  FAIL touched the real profile: " + names);
        redsList.push({
          gate: gateLabel,
          cmd: "gate-run " + gateLabel,
          exit: 78,
          cause: "touched the real profile: " + names,
          class: "hold",
        });
        worst = worst || 78;
      }
    }
  }

  const runEnd = new Date().toISOString();
  totalCounts.exitCode = worst;
  const warns = redsList.filter(r => r.class === "warn");
  const holds = redsList.some(r => r.class !== "warn");

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
    inherits,
    carried,
    ran: ranFiles,
    repo,
    plan: areaPlan,
  }, CHAINS_PATH);

  /* Whole-run summary for a release or nightly profile run (state/briefs/reform-2026-10-27/test-regimen.md rule 4, decisions 2026-11-05 11:43). */
  if (inProfile) {
    const profileGateNames = initialProfileSteps.map(s => s.gate || gateName(s.file || s.cmd));
    const ranGateNames = gatesList.map(g => g.gate);
    const holdReds = redsList.filter(r => r.class !== "warn");
    const summary = {
      kind: "profile-summary",
      profile: mode,
      gitTree: tree,
      commit: COMMIT || "no commit",
      gates: {
        profile: profileGateNames,
        ran: ranGateNames,
        total: profileGateNames.length,
        completed: ranGateNames.length,
      },
      reds: {
        holds: holdReds,
        warns,
      },
      holds,
      inherits: inherits || "",
      start: runStart,
      end: runEnd,
      time: runEnd,
    };
    const summaryFile = path.join(RUNS, profileSummaryFileName(mode, new Date(runEnd)));
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + "\n", "utf8");
    console.log("  gate-run: whole-run summary in " + path.basename(summaryFile));
  }

  if (isHeavy) releaseLock();

  const allHygiene = warns.every(w => !w.cause || !w.cause.startsWith("the real profile changed"));
  console.log("\ngate-run: " + written + " of " + steps.length + " gate(s) run from "
              + asked.length + " npm script(s), " + written + " line(s) in " + RUNS
              + ", tree " + before.hash + ", git tree " + tree
              + (treeMoved ? ", NO VERDICT: the tree moved under a gate"
                 : gitFailedAt ? ", NO VERDICT: " + gitFailedAt.reason
                 : refusedAt ? ", stopped at " + refusedAt.gate + ", REFUSED by the " + refusedAt.refused
                   + " and not failed: nothing was opened or measured, and its own lines above say what lets it run"
                 : worst === NO_VERDICT ? ", stopped at a gate exiting " + worst + ", its own NO VERDICT: it"
                   + " refused, did not finish, or left a leg not run"
                 : worst ? ", stopped at a gate exiting " + worst
                 : warns.length ? ", " + warns.length + (allHygiene ? " HYGIENE warn(s)" : " warn(s)") + ", nothing held" : ", all green"));

  for (const w of warns) {
    if (w.cause && w.cause.startsWith("the real profile changed")) {
      console.log("WARN " + w.gate + ": " + w.cause);
    } else {
      console.log("WARN " + w.gate + " (exit " + w.exit + "): a HYGIENE leg, red in the " + gateLabel + " profile; it holds nothing and is fixed at the next merge");
    }
  }

  process.exitCode = !holds && worst === 0 ? 0 : (worst > 0 && worst < 256 ? worst : 1);
}

const RUNS = path.resolve(process.env.ETIUDA_RUNS || path.join(mainTree(), "..", "etiuda-runs"));
/* chains.jsonl sits beside the per-gate records it summarises: Workspace/etiuda-runs for the trees, a lab's own folder for a
   lab. A lab that wrote into the office's file left trees there that the area run's equal-tree rule then reused (the test
   architect's E1, 2026-10-28). */
export const CHAINS_PATH = path.resolve(process.env.ETIUDA_CHAINS_PATH || path.join(RUNS, "chains.jsonl"));
/* The yield ledger's marks sit beside the chains they mark, so a lab's marks stay in its lab. */
export const MARKS_PATH = path.resolve(process.env.ETIUDA_MARKS_PATH || path.join(path.dirname(CHAINS_PATH), "marks.jsonl"));
const bothLists = hygieneFloorClash();
if (bothLists.length) refuse("a leg is on both FLOOR and HYGIENE: " + bothLists.join(", "),
  "the floor holds every merge and a hygiene red only warns; a leg is on one list, not both");

if (inside(ROOT, RUNS)) refuse("the runs folder is inside the repository: " + RUNS,
  "these files are a record of runs, not of the tree; put them beside it, not in it");
fs.mkdirSync(RUNS, { recursive: true });

const invoked = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (invoked) main();
