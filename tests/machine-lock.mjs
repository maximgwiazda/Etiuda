/* The machine lock's own legs (tools/machine-lock.mjs), the same file in the engine's tree and in Studio's. Every lock here
 * lives in a scratch folder; the office's Workspace/etiuda-runs/machine.lock is never read or written.
 *
 *   ml1  a dead holder is taken over at once, whatever the age of its lock
 *   ml2  a live holder is never taken
 *   ml3  a PID reused by another process (same PID, other creation time) reads stale and is taken over
 *   ml4  two takers racing on one stale lock: exactly one wins, and the lock names it
 *   ml5  run frees the lock when its command ends, a failing command included, and passes its exit on
 *   ml6  a record written before this rule (no creation time) is held while any process has its PID
 *
 * The two slots (machine.lock and machine-2.lock; a lab names its own pair through `slots`, with `lockPath` always set too
 * so that a tool without slots can never reach the office's lock):
 *   ml7  two takers hold the two slots, one each
 *   ml8  a third taker waits until one frees; release frees its own slot only, and the third takes the freed one
 *   ml9  an exclusive taker waits while one slot is held, whichever slot, holds nothing while it waits, and then holds both
 *   ml10 a plain taker waits while an exclusive taker holds both, and takes a slot once they are freed
 *   ml11 a plain taker does not slip into the free slot beside an exclusive taker that is waiting for the other
 *   ml12 ETIUDA_LOCK_PATH keeps today's single file: one slot, the record's keys unchanged, no second file
 *   ml13 each slot has its own holder rule: a dead holder in one slot is taken over beside a live holder in the other
 *   ml14 two takers racing on one stale slot beside a live holder: exactly one wins, and the live holder is untouched
 *   ml15 status lists both slots, each with its holder and whether that holder is alive
 *   ml16 run --exclusive holds both slots for its command (here the one slot of ETIUDA_LOCK_PATH) and frees them after
 *   ml17 gate-run waits up to 4 h when every lane is held and prints the wait line, taking a freed slot
 *   ml18 count 2 from the lane file leaves a third taker waiting
 *   ml19 count 3 from the lane file lets the third taker take machine-3.lock
 *   ml20 idle and active: 25 minutes gives 3, 1 minute gives 2, honoured only in lab
 *   ml21 a failed idle read gives 2
 *   ml22 lifting plant:lane-count gives 3 lanes always and turns count-2 red
 *   ml23 lifting plant:wait-ceiling restores 5-minute refusal and turns wait leg red */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = path.join(ROOT, "tools", "machine-lock.mjs");
const GATE_RUN = path.join(ROOT, "tools", "gate-run.mjs");
const L = await import(pathToFileURL(TOOL).href);
const G = await import(pathToFileURL(GATE_RUN).href);
const EXPECTED = 23;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "machine-lock-legs-"));
let asserted = 0, failed = 0, skipped = 0;
function check(cond, line) {
  asserted++;
  if (cond) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) {
  skipped++;
  console.log("  SKIP  " + line);
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

/* The two-slot legs. A pair of lock files in the lab, and a taker for a given live holder. */
const pair = (name) => [lockAt(name + "-a"), lockAt(name + "-b")];
const take = (slots, holder, extra) => L.acquire(Object.assign({ lockPath: slots[0], slots, what: "slot leg", holder, waitMs: 0, say: quiet }, extra || {}));
const free = (slots, holder) => L.release({ lockPath: slots[0], slots, holder });
const who = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return null; } };
const pidAt = (file) => { const r = who(file); return r ? r.pid : null; };
const live = async () => child(120000);
const rec = (h, extra) => Object.assign({ pid: h.pid, started: h.started, what: "a held slot", since: new Date().toISOString() }, extra || {});

/* ml7 */
{
  const slots = pair("ml7"), h1 = await live(), h2 = await live();
  const r1 = take(slots, h1), r2 = take(slots, h2);
  check(r1.ok && r2.ok && pidAt(slots[0]) === h1.pid && pidAt(slots[1]) === h2.pid,
    "ml7 two takers hold the two slots, one each: first " + r1.ok + ", second " + r2.ok + ", slot 1 " + (pidAt(slots[0]) === h1.pid ? "first" : pidAt(slots[0]))
    + ", slot 2 " + (pidAt(slots[1]) === h2.pid ? "second" : pidAt(slots[1])));
  h1.kill(); h2.kill();
}

/* ml8 */
{
  const slots = pair("ml8"), h1 = await live(), h2 = await live(), h3 = await live();
  take(slots, h1); take(slots, h2);
  const r3 = take(slots, h3, { waitMs: 600 });
  const waited = !r3.ok && !!r3.heldBy && (r3.heldBy.pid === h1.pid || r3.heldBy.pid === h2.pid);
  const freed = free(slots, h1);
  const onlyOwn = freed && !fs.existsSync(slots[0]) && pidAt(slots[1]) === h2.pid;
  const r3b = take(slots, h3);
  check(waited && onlyOwn && r3b.ok && pidAt(slots[0]) === h3.pid && pidAt(slots[1]) === h2.pid,
    "ml8 a third taker waits until one slot frees, release frees its own slot only, the third takes the freed one: waited " + waited
    + ", own slot only " + onlyOwn + ", third then " + r3b.ok + " on slot " + (pidAt(slots[0]) === h3.pid ? 1 : pidAt(slots[1]) === h3.pid ? 2 : "none"));
  h1.kill(); h2.kill(); h3.kill();
}

/* ml9 */
{
  const h1 = await live(), h2 = await live();
  const results = [];
  for (const heldSlot of [0, 1]) {
    const slots = pair("ml9-" + heldSlot);
    write(slots[heldSlot], rec(h1));
    const r = take(slots, h2, { exclusive: true, waitMs: 600 });
    const other = slots[1 - heldSlot];
    results.push({ waited: !r.ok && pidAt(slots[heldSlot]) === h1.pid && !fs.existsSync(other) });
    if (heldSlot === 0) {
      fs.unlinkSync(slots[0]);
      const r2 = take(slots, h2, { exclusive: true });
      const both = who(slots[0]) && who(slots[1]) && pidAt(slots[0]) === h2.pid && pidAt(slots[1]) === h2.pid && who(slots[0]).exclusive === true && who(slots[1]).exclusive === true;
      results.push({ both: r2.ok && both });
      free(slots, h2);
      results.push({ freed: !fs.existsSync(slots[0]) && !fs.existsSync(slots[1]) });
    }
  }
  check(results[0].waited && results[1].both && results[2].freed && results[3].waited,
    "ml9 an exclusive taker waits while one slot is held (either one), holds nothing while it waits, then holds both and frees both: "
    + JSON.stringify(results));
  h1.kill(); h2.kill();
}

/* ml10 */
{
  const slots = pair("ml10"), h1 = await live(), h2 = await live();
  const rx = take(slots, h1, { exclusive: true });
  const rp = take(slots, h2, { waitMs: 600 });
  const blocked = !rp.ok && pidAt(slots[0]) === h1.pid && pidAt(slots[1]) === h1.pid;
  free(slots, h1);
  const rp2 = take(slots, h2);
  check(rx.ok && blocked && rp2.ok && (pidAt(slots[0]) === h2.pid || pidAt(slots[1]) === h2.pid),
    "ml10 a plain taker waits while an exclusive taker holds both, and takes a slot once they are freed: exclusive " + rx.ok + ", plain blocked " + blocked + ", then " + rp2.ok);
  h1.kill(); h2.kill();
}

/* ml11 */
{
  const slots = pair("ml11"), h1 = await live(), h2 = await live();
  write(slots[0], rec(h1, { exclusive: true }));
  const r = take(slots, h2, { waitMs: 600 });
  check(!r.ok && !fs.existsSync(slots[1]) && pidAt(slots[0]) === h1.pid,
    "ml11 a plain taker does not slip into the free slot beside an exclusive taker waiting for the other: ok " + r.ok + ", free slot " + (fs.existsSync(slots[1]) ? "taken" : "left free"));
  h1.kill(); h2.kill();
}

/* ml12 */
{
  const folder = path.join(LAB, "ml12"), file = path.join(folder, "only.lock");
  fs.mkdirSync(folder, { recursive: true });
  const probe = "import * as L from " + JSON.stringify(pathToFileURL(TOOL).href) + ";\nconsole.log(JSON.stringify({ n: (L.LOCK_PATHS || [L.LOCK_PATH]).length, names: (L.LOCK_PATHS || [L.LOCK_PATH]).map((p) => p.split(/[\\\\/]/).pop()) }));\n";
  const probeFile = path.join(LAB, "probe.mjs");
  fs.writeFileSync(probeFile, probe);
  const env = (extra) => { const e = Object.assign({}, process.env, extra || {}); if (!extra || !extra.ETIUDA_LOCK_PATH) delete e.ETIUDA_LOCK_PATH; return e; };
  const set = JSON.parse(spawnSync(process.execPath, [probeFile], { encoding: "utf8", env: env({ ETIUDA_LOCK_PATH: file }) }).stdout.trim());
  const unset = JSON.parse(spawnSync(process.execPath, [probeFile], { encoding: "utf8", env: env() }).stdout.trim());
  const h1 = await live(), h2 = await live();
  const r1 = L.acquire({ lockPath: file, what: "ml12", holder: h1, waitMs: 0, say: quiet });
  const keys = Object.keys(who(file) || {}).join(",");
  const r2 = L.acquire({ lockPath: file, what: "ml12", holder: h2, waitMs: 400, say: quiet });
  const files = fs.readdirSync(folder).join(",");
  check(set.n === 1 && set.names[0] === "only.lock" && unset.n === 3 && unset.names.join(",") === "machine.lock,machine-2.lock,machine-3.lock"
    && r1.ok && !r2.ok && keys === "pid,started,host,tree,what,since" && files === "only.lock",
    "ml12 ETIUDA_LOCK_PATH keeps today's single file: slots set " + set.n + ", unset " + unset.names.join("+") + ", second taker " + (r2.ok ? "took" : "waited")
    + ", keys " + keys + ", files " + files);
  h1.kill(); h2.kill();
}

/* ml13 */
{
  const slots = pair("ml13"), dead = await child(100);
  await dead.exited;
  const h1 = await live(), h2 = await live();
  write(slots[0], rec(dead));
  write(slots[1], rec(h1));
  const r = take(slots, h2);
  check(r.ok && !!r.takenOver && r.takenOver.pid === dead.pid && pidAt(slots[0]) === h2.pid && pidAt(slots[1]) === h1.pid,
    "ml13 each slot has its own holder rule: the dead holder's slot is taken over, the live holder's is left: ok " + r.ok + ", taken from " + (r.takenOver && r.takenOver.pid)
    + ", slot 2 " + (pidAt(slots[1]) === h1.pid ? "still the live holder" : pidAt(slots[1])));
  h1.kill(); h2.kill();
}

/* ml14 */
{
  const slots = pair("ml14"), dead = await child(100);
  await dead.exited;
  const h1 = await live();
  write(slots[0], rec(dead));
  write(slots[1], rec(h1));
  const racer = "import * as L from " + JSON.stringify(pathToFileURL(TOOL).href) + ";\n"
    + "const slots = " + JSON.stringify(slots) + ";\n"
    + "const r = L.acquire({ lockPath: slots[0], slots, what: 'racer', waitMs: 0, say: () => {} });\n"
    + "console.log(JSON.stringify({ ok: r.ok, pid: process.pid }));\n"
    + "setTimeout(() => process.exit(0), 3000);\n";
  const racerFile = path.join(LAB, "racer2.mjs");
  fs.writeFileSync(racerFile, racer);
  const run = () => new Promise((res) => {
    const c = spawn(process.execPath, [racerFile], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout.on("data", (d) => { out += d; });
    c.once("exit", () => { try { res(JSON.parse(out.trim().split(/\r?\n/).pop())); } catch (e) { res({ ok: false, pid: 0 }); } });
  });
  const results = await Promise.all([run(), run()]);
  const winners = results.filter((r) => r.ok);
  check(winners.length === 1 && pidAt(slots[0]) === winners[0].pid && pidAt(slots[1]) === h1.pid,
    "ml14 two takers racing on one stale slot beside a live holder: exactly one wins, and the live holder is untouched: winners " + winners.length
    + ", slot 1 " + (winners[0] && pidAt(slots[0]) === winners[0].pid ? "the winner" : pidAt(slots[0])) + ", slot 2 " + (pidAt(slots[1]) === h1.pid ? "the live holder" : pidAt(slots[1])));
  h1.kill();
}

/* ml15 */
{
  const slots = pair("ml15"), h1 = await live(), dead = await child(100);
  await dead.exited;
  write(slots[0], rec(h1));
  const s1 = L.status(slots[0], slots);
  write(slots[1], rec(dead));
  const s2 = L.status(slots[0], slots);
  const list = (s) => Array.isArray(s.slots) ? s.slots : [];
  check(list(s1).length === 2 && list(s1)[0].held && list(s1)[0].alive && list(s1)[0].holder.pid === h1.pid && !list(s1)[1].held
    && list(s2).length === 2 && list(s2)[1].held && list(s2)[1].alive === false && list(s2)[1].holder.pid === dead.pid && s2.held === true,
    "ml15 status lists both slots with their holders and whether each is alive: first read " + list(s1).map((x) => x.held ? (x.alive ? "alive" : "stale") : "free").join("/")
    + ", second read " + list(s2).map((x) => x.held ? (x.alive ? "alive" : "stale") : "free").join("/"));
  h1.kill();
}

/* ml16 */
{
  const file = lockAt("ml16");
  const r = spawnSync(process.execPath, [TOOL, "run", "--exclusive", "--", process.execPath, "-e",
    "process.stdout.write(require('fs').readFileSync(process.env.ETIUDA_LOCK_PATH,'utf8'))"],
    { encoding: "utf8", env: Object.assign({}, process.env, { ETIUDA_LOCK_PATH: file }) });
  let seen = null;
  try { seen = JSON.parse(String(r.stdout).trim().split(/\r?\n/).pop()); } catch (e) { seen = null; }
  check(r.status === 0 && !!seen && seen.exclusive === true && !fs.existsSync(file),
    "ml16 run --exclusive holds the slots for its command and frees them after: exit " + r.status + ", record " + (seen && seen.exclusive === true ? "exclusive" : "not exclusive")
    + ", lock " + (fs.existsSync(file) ? "left" : "freed"));
}

/* ml17 */
{
  const slots = pair("ml17");
  const h1 = await live(), h2 = await live(), h3 = await live();
  take(slots, h1);
  take(slots, h2);

  /* A known positive first: with both slots held by live test holders and a timeout of 1 s, a gate-run take refuses. */
  const rRefuse = G.acquireLock(slots[0], "refuse leg", ROOT, 1000, { slots, holder: h3 });
  const refused = !rRefuse.ok && !!rRefuse.heldBy;

  /* Then, after the change: with no timeout set it is still waiting at 3 s, and has printed the wait line;
     freeing one slot lets it take that slot and run. */
  const runnerScript = path.join(LAB, "ml17-waiter.mjs");
  const waiterCode = `import fs from "node:fs";
import * as G from ${JSON.stringify(pathToFileURL(GATE_RUN).href)};
const slots = ${JSON.stringify(slots)};
const r = G.acquireLock(slots[0], "ml17-waiter", ${JSON.stringify(ROOT)}, undefined, { slots, pollMs: 200 });
const took = r.ok && fs.existsSync(slots[0]);
process.stdout.write(JSON.stringify({ ok: r.ok, took }) + "\\n");
process.exit(r.ok ? 0 : 1);
`;
  fs.writeFileSync(runnerScript, waiterCode);
  const childWaiter = spawn(process.execPath, [runnerScript], { stdio: ["ignore", "pipe", "pipe"] });
  let waiterOut = "";
  childWaiter.stdout.on("data", (d) => { waiterOut += d; });
  childWaiter.stderr.on("data", (d) => { waiterOut += d; });

  await new Promise((r) => setTimeout(r, 3000));
  const waitingAt3s = childWaiter.exitCode === null;
  const hasWaitLine = /every lane is held.*waiting for one, up to 4 h/i.test(waiterOut);

  free(slots, h1);
  const exitCode = await new Promise((r) => childWaiter.once("exit", r));
  let report = null;
  try {
    const lastLine = waiterOut.trim().split(/\r?\n/).pop();
    report = JSON.parse(lastLine);
  } catch (e) {
    report = null;
  }
  const tookFreed = exitCode === 0 && !!report && report.took === true;

  check(refused && waitingAt3s && hasWaitLine && tookFreed,
    "ml17 gate-run waits up to 4 h when every lane is held and prints the wait line, then takes a freed slot: refused 1s "
    + refused + ", waiting at 3s " + waitingAt3s + ", printed wait line " + hasWaitLine + ", took freed " + tookFreed);

  h1.kill(); h2.kill(); h3.kill();
}

/* ml18 */
{
  const labDir = fs.mkdtempSync(path.join(LAB, "ml18-"));
  const lanesFile = path.join(labDir, "lanes");
  fs.writeFileSync(lanesFile, "2\n");
  const slots = [path.join(labDir, "slot-1.lock"), path.join(labDir, "slot-2.lock"), path.join(labDir, "machine-3.lock")];
  const h1 = await live(), h2 = await live(), h3 = await live();
  take(slots, h1);
  take(slots, h2);
  const r3 = take(slots, h3, { waitMs: 600 });
  check(!r3.ok && !fs.existsSync(slots[2]) && pidAt(slots[0]) === h1.pid && pidAt(slots[1]) === h2.pid,
    "ml18 count 2 from the lane file: third taker waits, leaving slot 3 untouched: ok " + r3.ok + ", slot 3 left free " + !fs.existsSync(slots[2]));
  h1.kill(); h2.kill(); h3.kill();
}

/* ml19 */
{
  const labDir = fs.mkdtempSync(path.join(LAB, "ml19-"));
  const lanesFile = path.join(labDir, "lanes");
  fs.writeFileSync(lanesFile, "3\n");
  const slots = [path.join(labDir, "slot-1.lock"), path.join(labDir, "slot-2.lock"), path.join(labDir, "machine-3.lock")];
  const h1 = await live(), h2 = await live(), h3 = await live();
  take(slots, h1);
  take(slots, h2);
  const r3 = take(slots, h3, { waitMs: 0 });
  check(r3.ok && fs.existsSync(slots[2]) && pidAt(slots[2]) === h3.pid,
    "ml19 count 3 from the lane file: third taker takes machine-3.lock: ok " + r3.ok + ", slot 3 held by third taker " + (pidAt(slots[2]) === h3.pid));
  free(slots, h3);
  h1.kill(); h2.kill(); h3.kill();
}

/* ml20 */
{
  const labDir = fs.mkdtempSync(path.join(LAB, "ml20-"));
  const slots = [path.join(labDir, "machine.lock"), path.join(labDir, "machine-2.lock"), path.join(labDir, "machine-3.lock")];
  const oldEnv = process.env.ETIUDA_LOCK_PATH;
  try {
    process.env.ETIUDA_LOCK_PATH = slots[0];
    const p25 = L.lanePolicy ? L.lanePolicy(slots, { testIdleMinutes: 25 }) : { count: 0, reason: "" };
    const p1 = L.lanePolicy ? L.lanePolicy(slots, { testIdleMinutes: 1 }) : { count: 0, reason: "" };
    delete process.env.ETIUDA_LOCK_PATH;
    const pReal = L.lanePolicy ? L.lanePolicy(slots, { testIdleMinutes: 25 }) : { count: 0, reason: "" };
    check(p25.count === 3 && p25.reason === "idle for 25 minutes"
      && p1.count === 2 && p1.reason === "in use"
      && pReal.reason !== "idle for 25 minutes",
      "ml20 idle and active: test-only idle 25m gives 3, 1m gives 2, honoured only in lab: p25=" + p25.count + " (" + p25.reason + "), p1=" + p1.count + " (" + p1.reason + "), real ignores test reading " + (pReal.reason !== "idle for 25 minutes"));
  } finally {
    if (oldEnv !== undefined) process.env.ETIUDA_LOCK_PATH = oldEnv;
    else delete process.env.ETIUDA_LOCK_PATH;
  }
}

/* ml21 */
{
  const labDir = fs.mkdtempSync(path.join(LAB, "ml21-"));
  const slots = [path.join(labDir, "machine.lock"), path.join(labDir, "machine-2.lock"), path.join(labDir, "machine-3.lock")];
  const oldEnv = process.env.ETIUDA_LOCK_PATH;
  try {
    process.env.ETIUDA_LOCK_PATH = slots[0];
    const pFail = L.lanePolicy ? L.lanePolicy(slots, { testIdleMinutes: "fail" }) : { count: 0, reason: "" };
    check(pFail.count === 2 && pFail.reason === "in use",
      "ml21 a failed idle read gives 2: count=" + pFail.count + " (" + pFail.reason + ")");
  } finally {
    if (oldEnv !== undefined) process.env.ETIUDA_LOCK_PATH = oldEnv;
    else delete process.env.ETIUDA_LOCK_PATH;
  }
}

/* ml22 */
{
  if (PLANTS_OFF) {
    skip("ml22 lifting plant:lane-count gives 3 lanes always and turns count-2 red (ETIUDA_PLANTS=off)");
  } else {
    const labDir = fs.mkdtempSync(path.join(LAB, "ml22-plant-"));
    const src = fs.readFileSync(TOOL, "utf8");
    const plantedSrc = src.replace(/\/\* plant:lane-count \*\/[\s\S]*?return\s+[^;]+;/, "/* plant:lane-count */ return { count: 3, reason: 'planted 3 lanes' };");
    const plantedTool = path.join(labDir, "machine-lock-planted.mjs");
    fs.writeFileSync(plantedTool, plantedSrc);
    const PL = await import(pathToFileURL(plantedTool).href);
    const lanesFile = path.join(labDir, "lanes");
    fs.writeFileSync(lanesFile, "2\n");
    const slots = [path.join(labDir, "slot-1.lock"), path.join(labDir, "slot-2.lock"), path.join(labDir, "machine-3.lock")];
    const h1 = await live(), h2 = await live(), h3 = await live();
    PL.acquire({ lockPath: slots[0], slots, what: "h1", holder: h1, waitMs: 0, say: quiet });
    PL.acquire({ lockPath: slots[0], slots, what: "h2", holder: h2, waitMs: 0, say: quiet });
    const r3 = PL.acquire({ lockPath: slots[0], slots, what: "h3", holder: h3, waitMs: 0, say: quiet });
    const turnedRed = r3.ok === true && fs.existsSync(slots[2]);
    check(turnedRed, "ml22 lifting plant:lane-count gives 3 lanes always and turns count-2 red: took slot 3 " + turnedRed);
    PL.release({ lockPath: slots[0], slots, holder: h3 });
    h1.kill(); h2.kill(); h3.kill();
  }
}

/* ml23 */
{
  if (PLANTS_OFF) {
    skip("ml23 lifting plant:wait-ceiling restores 5-minute refusal and turns wait leg red (ETIUDA_PLANTS=off)");
  } else {
    const labDir = fs.mkdtempSync(path.join(LAB, "ml23-plant-"));
    const src = fs.readFileSync(GATE_RUN, "utf8");
    const toolUrl = pathToFileURL(TOOL).href;
    const plantedSrc = src
      .replace(/from\s+["']\.\/machine-lock\.mjs["']/, `from ${JSON.stringify(toolUrl)}`)
      .replace(/const ROOT = [^;]+;/, "const ROOT = " + JSON.stringify(ROOT) + ";")
      .replace(/4\s*\*\s*3600\s*\*\s*1000\s*;\s*\/\*\s*plant:wait-ceiling\s*\*\//, "300000; /* plant:wait-ceiling */");
    const plantedGateRun = path.join(labDir, "gate-run-planted.mjs");
    fs.writeFileSync(plantedGateRun, plantedSrc);
    const PG = await import(pathToFileURL(plantedGateRun).href);
    const restored5m = PG.DEFAULT_LOCK_TIMEOUT_MS === 300000;
    check(restored5m, "ml23 lifting plant:wait-ceiling restores 5-minute refusal and turns wait leg red: default ms " + PG.DEFAULT_LOCK_TIMEOUT_MS);
  }
}

try { fs.rmSync(LAB, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* the system's to clear */ }
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped !== EXPECTED) { console.log("  FAIL ran " + (asserted + skipped) + " of " + EXPECTED + " leg(s)"); process.exit(78); }
console.log("  RESULT: " + (failed ? "FAIL " + failed + " of " + asserted : "ok " + asserted + " check(s)" + (skipped ? ", " + skipped + " skipped" : "")));
process.exit(failed ? 1 : 0);
