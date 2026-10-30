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
 *   ml16 run --exclusive holds both slots for its command (here the one slot of ETIUDA_LOCK_PATH) and frees them after */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = path.join(ROOT, "tools", "machine-lock.mjs");
const L = await import(pathToFileURL(TOOL).href);
const EXPECTED = 16;
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
  check(set.n === 1 && set.names[0] === "only.lock" && unset.n === 2 && unset.names.join(",") === "machine.lock,machine-2.lock"
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

try { fs.rmSync(LAB, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* the system's to clear */ }
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted !== EXPECTED) { console.log("  FAIL ran " + asserted + " of " + EXPECTED + " leg(s)"); process.exit(78); }
console.log("  RESULT: " + (failed ? "FAIL " + failed + " of " + asserted : "ok " + asserted + " check(s)"));
process.exit(failed ? 1 : 0);
