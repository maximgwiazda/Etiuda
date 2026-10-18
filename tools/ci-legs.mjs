/* Runs the legs a verdict names and records each one. No dependency beyond node.
 *
 *   node tools/ci-legs.mjs [--out dir] [--os ubuntu|windows] [--windows-date YYYY-MM-DD] <id>...
 *   node tools/ci-legs.mjs --from-env --out dir
 *   node tools/ci-legs.mjs --electron-skip --from-env     prints skip=0 or skip=1
 *
 * The first line is RED n of m or GREEN m of m. n counts legs that are not green.
 * A window refusal is not green: the leg line says refused, and the log is the
 * window wall's own refusal. The process exits 0 when every asked leg was recorded.
 * It exits non-zero when it could not run: an unknown id, a bad os, a write that failed.
 * A leg's exit code is recorded and is not enough on its own to call the leg green.
 *
 * Whether a leg spawns, and its child's environment, is decided by
 * tools/ci-legs-decide.cjs alone: ETIUDA_FIXTURES and the window word never reach a
 * child from this process's environment, and a window leg spawns only on the Windows
 * runner with the dispatch's date. tests/engine-selftest.js 22f drives every arm.
 *
 * A FAIL line's first word is FAIL. An ERROR line's first word is ERROR or Error.
 * Both streams count. The result line is the last #counts or RESULT line.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const E = require(path.join(ROOT, "tests", "engine.js"));
const { decide } = require(path.join(ROOT, "tools", "ci-legs-decide.cjs"));

const FAIL_LINE = /^\s*FAIL\b/;
const ERROR_LINE = /^\s*(?:ERROR|Error)\b/;
const RESULT_LINE = /^\s*(?:#counts|RESULT)\b/;

/* One list. where is linux-ok or windows-only, from the gates tests/engine.js names
 * as Windows by nature and from the leg's own platform refusal. window marks a leg
 * that calls the window wall. RELAY_TARGET is the same path.join the slice-2 harness
 * uses (tests/relay-unit.mjs). */
function target(file) {
  return path.join("relay", "test", "targets", file);
}

const LEGS = [
  { id: "relay-unit", args: ["tests/relay-unit.mjs"], where: "linux-ok" },
  { id: "relay-channel", args: ["tests/relay-channel.mjs"], where: "linux-ok" },
  { id: "relay-blob", args: ["tests/relay-blob.mjs"], where: "linux-ok" },
  { id: "attacks-naive", args: ["relay/test/attacks.mjs"], relay: target("naive.cjs"), where: "linux-ok" },
  { id: "attacks-model", args: ["relay/test/attacks.mjs"], relay: target("model.cjs"), where: "linux-ok" },
  { id: "attacks-refuse-all", args: ["relay/test/attacks.mjs"], relay: target("refuse-all.cjs"), where: "linux-ok" },
  { id: "attacks-product", args: ["relay/test/attacks.mjs"], relay: target("product.cjs"), where: "linux-ok" },
  { id: "attacks-relay-product", args: ["relay/test/attacks.mjs"], relay: target("relay-product.cjs"), where: "linux-ok" },
  { id: "module-calls", args: ["tests/module-calls.mjs"], where: "linux-ok" },
  { id: "catalog-routes", args: ["tests/catalog-routes.mjs"], where: "linux-ok" },
  { id: "team-join", args: ["tests/team-join.mjs"], where: "linux-ok" },
  { id: "desk-ipc", args: ["tests/desk-ipc.mjs"], where: "linux-ok" },
  { id: "test", args: ["tests/test.js"], where: "linux-ok" },
  { id: "gate-run", args: ["tools/gate-run.mjs", "test", "split-guard"], where: "linux-ok" },
  { id: "shell-smoke", args: ["tests/shell-smoke.js"], where: "windows-only", window: true, who: "tests/shell-smoke.js" },
  { id: "reinstall", args: ["tests/reinstall.js"], where: "windows-only", window: true, who: "tests/reinstall.js" },
  { id: "update-install", args: ["tests/update-install.js", "--update"], where: "windows-only", window: true, who: "tests/update-install.js" },
  { id: "dot-field-desk", args: ["tests/dot-field-desk.js"], where: "windows-only", window: true, who: "tests/dot-field-desk.js" },
  { id: "pick-desk", args: ["tests/pick-desk.js"], where: "windows-only", window: true, who: "tests/pick-desk.js" },
  { id: "csp", args: ["tests/csp.js"], where: "linux-ok", window: true, who: "tests/csp.js" },
  { id: "desk", args: ["tests/desk.js"], where: "linux-ok", window: true, who: "tests/desk.js" },
  { id: "links", args: ["tests/links.js"], where: "linux-ok", window: true, who: "tests/links.js" },
  { id: "catalog-watch", args: ["tests/catalog-watch.js"], where: "linux-ok", window: true, who: "tests/catalog-watch.js" },
];

const BY_ID = new Map(LEGS.map(leg => [leg.id, leg]));

function die(what) {
  console.error("ci-legs: " + what);
  process.exit(1);
}

function splitIds(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

function normOs(osName) {
  if (!osName) return "";
  if (osName === "ubuntu" || osName === "ubuntu-latest") return "ubuntu";
  if (osName === "windows" || osName === "windows-latest") return "windows";
  die("os is " + JSON.stringify(osName) + ", want ubuntu, windows, ubuntu-latest or windows-latest");
}

function parseArgs(argv) {
  let outDir = "ci-out";
  let osName = "";
  let windowsDate = "";
  let fromEnv = false;
  let electronSkip = false;
  let sawDate = false;
  const ids = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") outDir = argv[++i];
    else if (a === "--os") osName = argv[++i] || "";
    else if (a === "--windows-date") { windowsDate = argv[++i] || ""; sawDate = true; }
    else if (a === "--from-env") fromEnv = true;
    else if (a === "--electron-skip") electronSkip = true;
    else if (a === "--") { ids.push(...argv.slice(i + 1)); break; }
    else if (a.startsWith("--")) die("unknown option " + a);
    else ids.push(a);
    if (a === "--out" || a === "--os" || a === "--windows-date") {
      if (argv[i] === undefined && a !== "--windows-date") die(a + " needs a value");
    }
  }
  if (fromEnv) {
    if (!osName) osName = process.env.CI_LEG_OS || "";
    if (!sawDate) windowsDate = process.env.CI_WINDOWS_DATE || "";
    if (!ids.length) ids.push(...splitIds(process.env.CI_LEGS || ""));
  }
  return { outDir, osName, windowsDate, electronSkip, ids };
}

function countLines(text, re) {
  if (!text) return 0;
  let n = 0;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) n++;
  return n;
}

function resultLineOf(stdout, stderr) {
  let found = "";
  const lines = (stdout + "\n" + stderr).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (RESULT_LINE.test(lines[i])) found = lines[i].trim();
  return found;
}

function runChild(leg, env) {
  return new Promise(resolve => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(process.execPath, leg.args, {
      cwd: ROOT, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", d => { stdout += d; });
    child.stderr.on("data", d => { stderr += d; });
    child.on("error", e => {
      if (settled) return;
      settled = true;
      resolve({ exitCode: null, stdout, stderr: stderr + String(e && e.stack ? e.stack : e) });
    });
    child.on("close", code => {
      if (settled) return;
      settled = true;
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

function recordOf(leg, status, stdout, stderr, exitCode, spawned, wallMs) {
  const fail = countLines(stdout, FAIL_LINE) + countLines(stderr, FAIL_LINE);
  const error = countLines(stdout, ERROR_LINE) + countLines(stderr, ERROR_LINE);
  return {
    id: leg.id,
    status,
    where: leg.where,
    window: !!leg.window,
    log: leg.id + ".log",
    resultLine: resultLineOf(stdout, stderr),
    fail,
    error,
    exitCode,
    spawned,
    wallMs,
    stdout,
    stderr,
  };
}

function judgeRan(rec) {
  if (rec.fail > 0 || rec.error > 0 || rec.exitCode !== 0) return "red";
  return "green";
}

function logBody(stdout, stderr) {
  const out = stdout.endsWith("\n") || stdout === "" ? stdout : stdout + "\n";
  const err = stderr.endsWith("\n") || stderr === "" ? stderr : stderr + "\n";
  return "----- stdout -----\n" + out + "----- stderr -----\n" + err;
}

function summaryOf(rows) {
  const counted = rows.filter(r => r.status !== "skipped");
  const bad = counted.filter(r => r.status !== "green").length;
  const m = counted.length;
  const line = bad === 0 ? "GREEN " + m + " of " + m : "RED " + bad + " of " + m;
  return { line, red: bad, ran: m };
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch (e) {
    return "";
  }
}

function legLine(row) {
  const exit = row.exitCode === null || row.exitCode === undefined ? "none" : String(row.exitCode);
  return row.id + " " + row.status + " fail=" + row.fail + " error=" + row.error
    + " exit=" + exit + " " + (row.resultLine || "no result line");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const osNorm = normOs(opts.osName);
  const ids = opts.ids;
  if (!ids.length) die("no leg named");
  const unknown = ids.filter(id => !BY_ID.has(id));
  if (unknown.length) die("unknown leg " + unknown.join(", "));
  if (opts.electronSkip) {
    const wantsWindow = ids.some(id => BY_ID.get(id).window);
    process.stdout.write("skip=" + (wantsWindow ? "0" : "1") + "\n");
    return;
  }

  const rows = [];
  for (const id of ids) {
    const leg = BY_ID.get(id);
    const t0 = Date.now();
    const d = decide(E, leg, { windowsDate: opts.windowsDate, osNorm, platform: process.platform, env: process.env });
    if (d.status === "skipped") {
      rows.push(recordOf(leg, "skipped", d.text, "", null, false, Date.now() - t0));
      continue;
    }
    if (d.status === "refused") {
      rows.push(recordOf(leg, "refused", d.text, "", 78, false, Date.now() - t0));
      continue;
    }
    const ran = await runChild(leg, d.env);
    const rec = recordOf(leg, "red", ran.stdout, ran.stderr, ran.exitCode, true, Date.now() - t0);
    rec.status = judgeRan(rec);
    rows.push(rec);
  }

  fs.mkdirSync(opts.outDir, { recursive: true });
  for (const row of rows) {
    fs.writeFileSync(path.join(opts.outDir, row.log), logBody(row.stdout, row.stderr));
  }
  const summary = summaryOf(rows);
  const body = {
    summary: summary.line,
    red: summary.red,
    ran: summary.ran,
    os: osNorm || "local",
    platform: process.platform,
    sha: gitHead(),
    windowsDay: E.WINDOWS_DAY,
    legs: rows.map(row => ({
      id: row.id,
      status: row.status,
      where: row.where,
      window: row.window,
      log: row.log,
      resultLine: row.resultLine,
      fail: row.fail,
      error: row.error,
      exitCode: row.exitCode,
      spawned: row.spawned,
      wallMs: row.wallMs,
    })),
  };
  fs.writeFileSync(path.join(opts.outDir, "results.json"), JSON.stringify(body, null, 2) + "\n");
  const lines = rows.map(legLine);
  process.stdout.write(summary.line + "\n" + lines.join("\n") + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.line + "\n" + lines.join("\n") + "\n");
  }
}

main().then(() => process.exit(0), err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
