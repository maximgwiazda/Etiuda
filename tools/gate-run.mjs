/* Every gate writes one machine-readable line per run, board item 442.
 *
 *   node tools/gate-run.mjs test split-guard        the two fast chains
 *   node tools/gate-run.mjs shell-smoke             one gate, one line
 *   node tools/gate-run.mjs area [base]             area run with plant-hold bracket
 *   node tools/gate-run.mjs nightly                 nightly profile outside %TEMP%
 *   node tools/gate-run.mjs wait-lock               wait for machine lock
 *   node tools/gate-run.mjs mark-cause <rec> <c>    mark failure cause
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

const DEFAULT_CHAINS_PATH = "C:/Users/maxim/Workspace/etiuda-runs/chains.jsonl";
export const CHAINS_PATH = path.resolve(process.env.ETIUDA_CHAINS_PATH || DEFAULT_CHAINS_PATH);

export const RELAY_CORE = [
  { step: "made", leg: "964e", file: "tests/relay-unit.mjs", env: { RELAY_UNIT_ONLY: "964e" } },
  { step: "invited", leg: "941a", file: "tests/relay-channel.mjs", env: { RELAY_CHANNEL_ONLY: "941a" } },
  { step: "joined", leg: "941d", file: "tests/relay-channel.mjs", env: { RELAY_CHANNEL_ONLY: "941d" } },
  { step: "synced", leg: "940d", file: "tests/relay-channel.mjs", env: { RELAY_CHANNEL_ONLY: "940d" } },
  { step: "renewed", leg: "977d", file: "tests/relay-unit.mjs", env: { RELAY_UNIT_ONLY: "977d" } },
  { step: "lapsed or swept", leg: "977l", file: "tests/relay-unit.mjs", env: { RELAY_UNIT_ONLY: "977l" } },
  { step: "revoked", leg: "983a", file: "tests/relay-unit.mjs", env: { RELAY_UNIT_ONLY: "983a" } },
  { step: "left or withdrawn", leg: "942g", file: "tests/relay-channel.mjs", env: { RELAY_CHANNEL_ONLY: "942g" } },
  { step: "removed", leg: "944c", file: "tests/relay-channel.mjs", env: { RELAY_CHANNEL_ONLY: "944c" } },
];

export const NIGHTLY_LEGS = [
  { script: "nightly", file: "tests/desk-growth.mjs", args: [], cmd: "node tests/desk-growth.mjs" },
  { script: "nightly", file: "tests/leg-ids.js", args: [], cmd: "node tests/leg-ids.js" },
  { script: "nightly", file: "tests/engine-selftest.js", args: [], cmd: "node tests/engine-selftest.js" },
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

export function isPidAlive(pid) {
  if (!pid || typeof pid !== "number") return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

let heldLockPath = null;

export function acquireLock(lockPath = LOCK_PATH, what = "run", tree = ROOT, waitTimeoutMs = 300000) {
  const dir = path.dirname(lockPath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}

  const startWait = Date.now();
  let lastReport = 0;

  while (true) {
    const payload = JSON.stringify({
      pid: process.pid,
      host: os.hostname(),
      tree,
      what,
      since: new Date().toISOString(),
    }) + "\n";

    try {
      fs.writeFileSync(lockPath, payload, { flag: "wx" });
      heldLockPath = lockPath;
      return { ok: true, staleTakenOver: false };
    } catch (e) {
      if (e && e.code === "EEXIST") {
        let existing = null;
        try {
          existing = JSON.parse(fs.readFileSync(lockPath, "utf8"));
        } catch {
          existing = null;
        }

        const stale = !existing || !isPidAlive(existing.pid);
        if (stale) {
          try { fs.unlinkSync(lockPath); } catch {}
          try {
            fs.writeFileSync(lockPath, payload, { flag: "wx" });
            heldLockPath = lockPath;
            console.log("gate-run: took over stale lock from pid " + (existing ? existing.pid : "unknown"));
            return { ok: true, staleTakenOver: true };
          } catch {
            /* retry */
          }
        } else {
          if (waitTimeoutMs <= 0) {
            return {
              ok: false,
              heldBy: existing,
              reason: "lock held by pid " + existing.pid + " (" + existing.what + " since " + existing.since + ")",
            };
          }
          const now = Date.now();
          if (now - startWait > waitTimeoutMs) {
            return {
              ok: false,
              heldBy: existing,
              reason: "timed out waiting for lock held by pid " + existing.pid,
            };
          }
          if (now - lastReport >= 60000) {
            console.log("gate-run: waiting for machine lock held by pid " + existing.pid
              + " for " + existing.what + " on " + existing.tree + " since " + existing.since);
            lastReport = now;
          }
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
        }
      } else {
        throw e;
      }
    }
  }
}

export function releaseLock(lockPath = heldLockPath || LOCK_PATH) {
  if (!lockPath) return;
  try {
    if (fs.existsSync(lockPath)) {
      let existing = null;
      try { existing = JSON.parse(fs.readFileSync(lockPath, "utf8")); } catch { existing = null; }
      if (!existing || existing.pid === process.pid) {
        fs.unlinkSync(lockPath);
      }
    }
  } catch (e) {}
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
    start: record.start,
    end: record.end,
    counts: record.counts || {},
    reds: (record.reds || []).map(r => ({
      gate: r.gate,
      cmd: r.cmd,
      exit: r.exit,
      cause: r.cause || "unread",
    })),
  };
  fs.appendFileSync(chainsPath, JSON.stringify(line) + "\n", "utf8");
  return line;
}

function updateCauseInChains(gateName, newCause, chainsPath = CHAINS_PATH) {
  if (!fs.existsSync(chainsPath)) return;
  try {
    const lines = fs.readFileSync(chainsPath, "utf8").split(/\r?\n/).filter(Boolean);
    const updated = [];
    for (const raw of lines) {
      try {
        const obj = JSON.parse(raw);
        if (Array.isArray(obj.reds)) {
          for (const red of obj.reds) {
            if (red.gate === gateName || (red.cmd && red.cmd.includes(gateName))) {
              red.cause = newCause;
            }
          }
        }
        updated.push(JSON.stringify(obj));
      } catch {
        updated.push(raw);
      }
    }
    fs.writeFileSync(chainsPath, updated.join("\n") + "\n", "utf8");
  } catch {}
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

export async function planAreaRun(root, changed, pkg) {
  const gf = await loadGatesFor();
  const isSharedCode = gf && gf.isSharedCode ? gf.isSharedCode : () => false;
  const isProductFile = gf && gf.isProductFile ? gf.isProductFile : () => false;
  const isRelayCode = gf && gf.isRelayCode ? gf.isRelayCode : () => false;
  const gatesFor = gf && gf.gatesFor ? gf.gatesFor : () => [];

  const testSteps = parseStepsFromScript(pkg, "test");
  const wholeChain = testSteps.length ? testSteps : Object.keys(pkg.scripts || {}).flatMap(s => parseStepsFromScript(pkg, s));

  for (const f of changed) {
    if (isSharedCode(f)) {
      return {
        failClosed: true,
        reason: "fail-closed to whole chain: change in shared code " + f,
        steps: wholeChain,
      };
    }
  }

  let rows = [];
  try { rows = gatesFor(root, changed); } catch { rows = []; }

  for (const f of changed) {
    if (isProductFile(f) && !isRelayCode(f)) {
      const hit = rows.some(r => r.chains && r.chains.some(c => c.file === f || c.file.endsWith(f)));
      if (!hit) {
        return {
          failClosed: true,
          reason: "fail-closed to whole chain: unmapped product file " + f,
          steps: wholeChain,
        };
      }
    }
  }

  const steps = [];
  const plantHold = { script: "area", cmd: "node tests/plant-hold.mjs", file: "tests/plant-hold.mjs", args: [] };
  const plantCompare = { script: "area", cmd: "node tests/plant-compare.mjs", file: "tests/plant-compare.mjs", args: [] };

  if (fs.existsSync(path.join(root, "tests", "plant-hold.mjs"))) steps.push(plantHold);

  const touchesRelay = changed.some(isRelayCode);
  const gateFiles = new Set(rows.map(r => r.gate));

const GENERIC_SCANNERS = new Set([
  "tests/chain-split.mjs",
  "tests/engine-selftest.js",
  "tests/gates-for.mjs",
  "tests/leg-ids.js",
  "tests/log-hygiene-selftest.js",
  "tests/result-line.mjs",
  "tests/sbom.mjs",
  "tests/sellable.mjs",
  "tests/text-scan-selftest.js",
]);

  for (const g of gateFiles) {
    if (g === "tests/plant-hold.mjs" || g === "tests/plant-compare.mjs") continue;
    if (GENERIC_SCANNERS.has(g) && !changed.includes(g)) continue;
    steps.push({ script: "area", cmd: "node " + g, file: g, args: [] });
  }

  if (touchesRelay) {
    console.log("gate-run area: relay file changed, adding relay core (9 legs)");
    for (const core of RELAY_CORE) {
      if (fs.existsSync(path.join(root, core.file))) {
        steps.push({
          script: "area",
          cmd: "node " + core.file + " (" + core.leg + ")",
          file: core.file,
          args: [],
          env: core.env,
          note: "relay core: " + core.step + " (" + core.leg + ")",
        });
      }
    }
  }

  if (fs.existsSync(path.join(root, "tests", "plant-compare.mjs"))) steps.push(plantCompare);

  return { failClosed: false, reason: "", steps };
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
    const fileOrId = asked[1];
    const cause = asked[2] || "unread";
    if (!fileOrId) refuse("no record file or gate was named", "node tools/gate-run.mjs mark-cause <record.json> <test|product>");
    const targetFile = fs.existsSync(fileOrId) ? fileOrId : path.join(RUNS, fileOrId);
    if (!fs.existsSync(targetFile)) refuse("record file not found: " + targetFile);
    const rec = JSON.parse(fs.readFileSync(targetFile, "utf8"));
    rec.cause = cause;
    fs.writeFileSync(targetFile, JSON.stringify(rec, null, 2) + "\n", "utf8");
    updateCauseInChains(rec.gate, cause, CHAINS_PATH);
    console.log("gate-run: marked cause=" + cause + " in " + path.basename(targetFile));
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
    customEnv.ETIUDA_PLANTS = "off";
    gateLabel = "area";
  } else if (mode === "nightly") {
    isHeavy = true;
    gateLabel = "nightly";
    const testSteps = parseStepsFromScript(pkg, "test");
    const baseSteps = testSteps.length ? testSteps : Object.keys(pkg.scripts || {}).flatMap(s => parseStepsFromScript(pkg, s));
    steps = [...baseSteps, ...NIGHTLY_LEGS.filter(n => fs.existsSync(path.join(ROOT, n.file)))];
  } else {
    for (const name of asked) {
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

  if (asked.includes("--dry-run") || asked.includes("--list")) {
    console.log("gate-run " + mode + " dry run: " + steps.length + " gate(s) to run:");
    for (const s of steps) console.log("  " + s.cmd + (s.note ? " (" + s.note + ")" : ""));
    process.exit(0);
  }

  if (isHeavy) {
    console.log("gate-run: taking machine lock for heavy run (" + gateLabel + ")...");
    const lockRes = acquireLock(LOCK_PATH, gateLabel, ROOT, 300000);
    if (!lockRes.ok) refuse("could not acquire machine lock: " + lockRes.reason);
  }

  const runStart = new Date().toISOString();
  const ordered = deferAlone(steps);
  let worst = 0, written = 0, treeMoved = false, refusedAt = null;
  let before = fingerprint();
  let tree = gitTree();
  const COMMIT = git(["rev-parse", "--short", "HEAD"]);
  const DIRTY = git(["status", "--porcelain"]).length > 0;

  console.log("gate-run: tree " + before.hash + ", " + before.count + " file(s), " + before.bytes
              + " byte(s), by " + before.how + "; git tree " + tree);

  const totalCounts = { ok: 0, fail: 0, lines: 0 };
  const redsList = [];

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
      cause: isRed ? "unread" : undefined,
    };

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
    start: runStart,
    end: runEnd,
    counts: totalCounts,
    reds: redsList,
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
if (inside(ROOT, RUNS)) refuse("the runs folder is inside the repository: " + RUNS,
  "these files are a record of runs, not of the tree; put them beside it, not in it");
fs.mkdirSync(RUNS, { recursive: true });

const invoked = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (invoked) main();
