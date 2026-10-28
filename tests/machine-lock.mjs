/* The machine lock's own legs (tools/machine-lock.mjs), the same file in the engine's tree and in Studio's. Every lock here
 * lives in a scratch folder; the office's Workspace/etiuda-runs/machine.lock is never read or written.
 *
 *   ml1  a dead holder is taken over at once, whatever the age of its lock
 *   ml2  a live holder is never taken
 *   ml3  a PID reused by another process (same PID, other creation time) reads stale and is taken over
 *   ml4  two takers racing on one stale lock: exactly one wins, and the lock names it
 *   ml5  run frees the lock when its command ends, a failing command included, and passes its exit on
 *   ml6  a record written before this rule (no creation time) is held while any process has its PID */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = path.join(ROOT, "tools", "machine-lock.mjs");
const L = await import(pathToFileURL(TOOL).href);
const EXPECTED = 6;
const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "machine-lock-legs-"));
let asserted = 0, failed = 0;
function check(cond, line) {
  asserted++;
  if (cond) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
const lockAt = (name) => path.join(LAB, name + ".lock");
const write = (file, rec) => fs.writeFileSync(file, JSON.stringify(rec) + "\n");
const quiet = () => {};

/* A child that lives `ms`, with its pid and creation time read while it lives. */
async function child(ms) {
  const c = spawn(process.execPath, ["-e", "setTimeout(() => {}, " + ms + ")"], { stdio: "ignore" });
  await new Promise((r) => c.once("spawn", r));
  const started = L.processStart(c.pid);
  const exited = new Promise((r) => c.once("exit", r));
  return { pid: c.pid, started, exited, kill: () => { try { c.kill(); } catch (e) { /* gone */ } } };
}

/* ml1 */
{
  const dead = await child(100);
  await dead.exited;
  const file = lockAt("ml1");
  write(file, { pid: dead.pid, started: dead.started, what: "a run that died", since: new Date().toISOString() });
  const t0 = Date.now();
  const r = L.acquire({ lockPath: file, what: "ml1", waitMs: 0, say: quiet });
  const held = JSON.parse(fs.readFileSync(file, "utf8"));
  check(r.ok && !!r.takenOver && r.takenOver.pid === dead.pid && held.pid === process.pid && Date.now() - t0 < 20000,
    "ml1 a dead holder is taken over at once: ok " + r.ok + ", taken from " + (r.takenOver && r.takenOver.pid) + ", now held by "
    + (held.pid === process.pid ? "this run" : held.pid) + " in " + (Date.now() - t0) + " ms");
  L.release({ lockPath: file });
}

/* ml2 */
{
  const live = await child(60000);
  const file = lockAt("ml2");
  write(file, { pid: live.pid, started: live.started, what: "a long run", since: new Date(Date.now() - 24 * 3600 * 1000).toISOString() });
  const r = L.acquire({ lockPath: file, what: "ml2", waitMs: 1000, say: quiet });
  const held = JSON.parse(fs.readFileSync(file, "utf8"));
  check(!r.ok && held.pid === live.pid && !!live.started,
    "ml2 a live holder is never taken, a day-old lock included: ok " + r.ok + ", still held by " + (held.pid === live.pid ? "the live holder" : held.pid));
  live.kill();
}

/* ml3 */
{
  const file = lockAt("ml3");
  write(file, { pid: process.pid, started: "2001-01-01T00:00:00.0000000Z", what: "an older process with this pid", since: new Date().toISOString() });
  const r = L.acquire({ lockPath: file, what: "ml3", waitMs: 0, say: quiet });
  check(r.ok && !!r.takenOver && r.takenOver.started === "2001-01-01T00:00:00.0000000Z",
    "ml3 a reused pid (a live process, another creation time) reads stale and is taken over: ok " + r.ok + ", taken over " + !!r.takenOver);
  L.release({ lockPath: file });
}

/* ml4 */
{
  const dead = await child(100);
  await dead.exited;
  const file = lockAt("ml4");
  write(file, { pid: dead.pid, started: dead.started, what: "a run that died", since: new Date().toISOString() });
  const racer = "import * as L from " + JSON.stringify(pathToFileURL(TOOL).href) + ";\n"
    + "const r = L.acquire({ lockPath: " + JSON.stringify(file) + ", what: 'racer', waitMs: 0, say: () => {} });\n"
    + "console.log(JSON.stringify({ ok: r.ok, pid: process.pid }));\n"
    + "setTimeout(() => process.exit(0), 3000);\n";
  const racerFile = path.join(LAB, "racer.mjs");
  fs.writeFileSync(racerFile, racer);
  const run = () => new Promise((res) => {
    const c = spawn(process.execPath, [racerFile], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout.on("data", (d) => { out += d; });
    c.once("exit", () => { try { res(JSON.parse(out.trim().split(/\r?\n/).pop())); } catch (e) { res({ ok: false, pid: 0 }); } });
  });
  const results = await Promise.all([run(), run()]);
  let held = null;
  try { held = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { held = null; }
  const winners = results.filter((r) => r.ok);
  check(winners.length === 1 && !!held && held.pid === winners[0].pid,
    "ml4 two takers racing on one stale lock: exactly one wins, and the lock names it: winners " + winners.length
    + ", lock names " + (held ? (winners[0] && held.pid === winners[0].pid ? "the winner" : held.pid) : "nobody"));
}

/* ml5 */
{
  const file = lockAt("ml5");
  const r = spawnSync(process.execPath, [TOOL, "run", "--", process.execPath, "-e", "process.exit(3)"],
    { encoding: "utf8", env: Object.assign({}, process.env, { ETIUDA_LOCK_PATH: file }) });
  check(r.status === 3 && !fs.existsSync(file),
    "ml5 run frees the lock when its command ends and passes its exit on: exit " + r.status + ", lock " + (fs.existsSync(file) ? "left" : "freed"));
}

/* ml6 */
{
  const live = await child(60000);
  const file = lockAt("ml6");
  write(file, { pid: live.pid, what: "a record without a creation time", since: new Date().toISOString() });
  const r = L.acquire({ lockPath: file, what: "ml6", waitMs: 500, say: quiet });
  check(!r.ok, "ml6 a record without a creation time is held while a process has its pid: ok " + r.ok);
  live.kill();
}

try { fs.rmSync(LAB, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* the system's to clear */ }
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted !== EXPECTED) { console.log("  FAIL ran " + asserted + " of " + EXPECTED + " leg(s)"); process.exit(78); }
console.log("  RESULT: " + (failed ? "FAIL " + failed + " of " + asserted : "ok " + asserted + " check(s)"));
process.exit(failed ? 1 : 0);
