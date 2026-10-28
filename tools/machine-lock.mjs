/* THE MACHINE LOCK: one heavy run at a time on the laptop (Core's test regimen, rule 13), the same file in the engine's
 * tree and in Studio's, and the one writer of the lock file.
 *
 *   node tools/machine-lock.mjs run -- <command> [args]   take the lock as this process, run the command, free the lock
 *   node tools/machine-lock.mjs wait                       wait until the lock is free (taking and freeing it at once)
 *   node tools/machine-lock.mjs status                     say who holds it, and whether that holder is alive
 *
 * THE HOLDER IS A PAIR: the Windows PID and that process's creation time, read through Get-CimInstance Win32_Process
 * (wmic may be missing on Windows 11), here and nowhere else, so the time has one source and one format and is compared
 * exactly. The lock is stale if and only if no process has that pair. A dead holder is free at once; a PID reused by
 * another process has another creation time, so it reads stale too; a live holder is never taken, however long its run.
 * Age is a warning only. Agreed by the test architect and Claude beta, whose rule it was, 2026-10-28 00:46.
 *
 * A TAKEOVER renames the stale file aside under a name of its own and checks that what it moved is what it judged, so
 * of two takers exactly one wins; the other finds the winner's lock and waits.
 *
 * ETIUDA_LOCK_PATH names another file, so a test lab never touches Workspace/etiuda-runs/machine.lock. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_LOCK_PATH = "C:/Users/maxim/Workspace/etiuda-runs/machine.lock";
export const LOCK_PATH = path.resolve(process.env.ETIUDA_LOCK_PATH || DEFAULT_LOCK_PATH);
/* How long a waiter waits quietly before it says so, once (rule 13). */
export const REPORT_AFTER_MS = 30 * 60 * 1000;
/* How old a live holder's lock may be before a waiter or a status read warns about it. Never a takeover. */
export const AGE_WARNING_MS = 6 * 3600 * 1000;
const POLL_MS = 10000;

/** The creation time of process `pid` as an ISO string in UTC, or "" where no such process exists or it cannot be read. */
export function processStart(pid) {
  const n = Number(pid);
  if (!Number.isSafeInteger(n) || n <= 0) return "";
  if (process.platform === "win32") {
    const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
      "$p = Get-CimInstance Win32_Process -Filter 'ProcessId=" + n + "'; if ($p) { $p.CreationDate.ToUniversalTime().ToString('o') }"],
      { encoding: "utf8", windowsHide: true, timeout: 30000 });
    return String(r.stdout || "").trim();
  }
  const r = spawnSync("ps", ["-o", "lstart=", "-p", String(n)], { encoding: "utf8", timeout: 30000 });
  const t = Date.parse(String(r.stdout || "").trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}

/** Whether the holder a lock record names is alive: a process with that PID and that creation time. */
export function holderAlive(rec) {
  if (!rec || typeof rec !== "object" || !rec.pid) return false;
  const now = processStart(rec.pid);
  /* A record without a creation time (one written before this rule) is alive while any process has its PID: that can
     hold falsely on a reused PID, never take a live holder's lock. */
  if (!rec.started) return now !== "";
  return now === String(rec.started);
}

function readLock(lockPath) {
  try { return JSON.parse(fs.readFileSync(lockPath, "utf8")); } catch (e) { return e && e.code === "ENOENT" ? null : {}; }
}

function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

/** Moves the stale lock aside, and only if what is at the path is still the record judged stale. */
function takeAside(lockPath, judged) {
  const aside = lockPath + ".stale-" + process.pid + "-" + Date.now();
  try { fs.renameSync(lockPath, aside); } catch (e) { return false; }
  const moved = readLock(aside);
  if (JSON.stringify(moved) === JSON.stringify(judged)) return aside;
  /* Another taker's fresh lock was moved: put it back where it was, unless a third has taken the path meanwhile. */
  try { fs.linkSync(aside, lockPath); } catch (e) { /* the path is someone's again */ }
  try { fs.unlinkSync(aside); } catch (e) { /* gone */ }
  return false;
}

/**
 * Takes the lock for `holder` ({pid, started}, by default this process), waiting up to `waitMs` (Infinity to wait for
 * good). Answers {ok, takenOver, heldBy, reason}. `say` receives the lines a waiter or a takeover prints.
 */
export function acquire({ lockPath = LOCK_PATH, what = "run", tree = process.cwd(), waitMs = Infinity, holder = null,
  say = (l) => console.log(l) } = {}) {
  try { fs.mkdirSync(path.dirname(lockPath), { recursive: true }); } catch (e) { /* refused below */ }
  const me = holder || { pid: process.pid, started: processStart(process.pid) };
  const payload = JSON.stringify({ pid: me.pid, started: me.started, host: os.hostname(), tree, what,
    since: new Date().toISOString() }) + "\n";
  const began = Date.now();
  let reported = false, warned = false, takenOver = null;
  for (;;) {
    try {
      fs.writeFileSync(lockPath, payload, { flag: "wx" });
      return { ok: true, takenOver, heldBy: null, reason: "" };
    } catch (e) {
      if (!e || e.code !== "EEXIST") throw e;
    }
    const held = readLock(lockPath);
    if (held === null) continue;
    if (!holderAlive(held)) {
      const aside = takeAside(lockPath, held);
      if (aside) {
        takenOver = { pid: held.pid, started: held.started || "", what: held.what || "", since: held.since || "", aside };
        say("machine-lock: took over a stale lock from pid " + held.pid + " (" + (held.what || "?") + " since " + (held.since || "?")
          + "): no process has that pid with that creation time; the old record is " + aside);
      }
      continue;
    }
    const waited = Date.now() - began;
    if (waited >= waitMs) {
      return { ok: false, takenOver: null, heldBy: held,
        reason: "lock held by pid " + held.pid + " (" + (held.what || "?") + " since " + (held.since || "?") + ")" };
    }
    if (!warned && held.since && Date.now() - Date.parse(held.since) > AGE_WARNING_MS) {
      warned = true;
      say("machine-lock: warning: pid " + held.pid + " has held the lock since " + held.since + " and is still alive; it is not taken");
    }
    if (!reported && waited >= REPORT_AFTER_MS) {
      reported = true;
      say("machine-lock: waited 30 minutes for pid " + held.pid + " (" + (held.what || "?") + " on " + (held.tree || "?") + " since "
        + (held.since || "?") + ")");
    }
    sleep(Math.min(POLL_MS, Math.max(50, waitMs - waited)));
  }
}

/** Frees the lock if `holder` (by default this process) holds it. Answers whether it did. */
export function release({ lockPath = LOCK_PATH, holder = null } = {}) {
  const held = readLock(lockPath);
  if (!held || typeof held !== "object") return false;
  const pid = holder ? holder.pid : process.pid;
  if (held.pid !== pid || (holder && holder.started && held.started !== holder.started)) return false;
  try { fs.unlinkSync(lockPath); return true; } catch (e) { return false; }
}

/** Who holds the lock, and whether that holder is alive. */
export function status(lockPath = LOCK_PATH) {
  const held = readLock(lockPath);
  if (!held) return { held: false };
  return { held: true, holder: held, alive: holderAlive(held) };
}

function cli(argv) {
  const verb = argv[0];
  if (verb === "status") {
    const s = status();
    console.log(s.held ? "machine-lock: held by pid " + s.holder.pid + " (" + (s.holder.what || "?") + " since " + (s.holder.since || "?")
      + "), " + (s.alive ? "alive" : "stale: no process has that pid with that creation time") : "machine-lock: free");
    return 0;
  }
  if (verb === "wait") {
    const r = acquire({ what: "wait" });
    if (r.ok) release();
    return r.ok ? 0 : 78;
  }
  if (verb === "run") {
    const at = argv.indexOf("--");
    const cmd = at >= 0 ? argv.slice(at + 1) : [];
    if (!cmd.length) { console.log("  FAIL machine-lock run needs a command after --"); return 78; }
    const r = acquire({ what: cmd.join(" ").slice(0, 200) });
    if (!r.ok) { console.log("  FAIL machine-lock: " + r.reason); return 78; }
    const free = () => { release(); };
    process.on("exit", free);
    for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
      try { process.on(sig, () => { free(); process.exit(130); }); } catch (e) { /* not on this platform */ }
    }
    const child = spawnSync(cmd[0], cmd.slice(1), { stdio: "inherit", shell: process.platform === "win32" });
    free();
    return child.status === null ? 1 : child.status;
  }
  console.log("  FAIL machine-lock: run -- <command>, wait or status");
  return 78;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(cli(process.argv.slice(2)));
