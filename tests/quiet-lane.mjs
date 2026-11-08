// A LOAD-SENSITIVE LEG DECIDES ON A QUIET MACHINE OR NOT AT ALL (the test architect, 2026-11-03 01:23). A leg that
// measures time (theme-presses, theme-roll) reads another run's load as its own failure, so a busy night would hold
// a release on noise. Before it presses anything it reads machine-lock's slots beside the lock in use (the office's
// four, or a lab's four beside ETIUDA_LOCK_PATH): if a live holder that is not this leg's own run holds a lane,
// it refuses with 78 and `#refused machine-busy`, which gate-run records as refused, not failed. Its own run is
// any holder among this process's ancestors, so the leg under gate-run's own lane still runs.
import path from "node:path";
import { spawnSync } from "node:child_process";
import { status, LOCK_PATH } from "../tools/machine-lock.mjs";

export const BUSY = 78;

/** This process and every process above it, by PID. */
function lineage() {
  const mine = new Set([process.pid]);
  let rows = [];
  if (process.platform === "win32") {
    const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
      "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId)\" }"],
      { encoding: "utf8", windowsHide: true, timeout: 30000 });
    rows = String(r.stdout || "").split(/\r?\n/);
  } else {
    const r = spawnSync("ps", ["-e", "-o", "pid=,ppid="], { encoding: "utf8", timeout: 30000 });
    rows = String(r.stdout || "").split(/\r?\n/);
  }
  const parent = new Map();
  for (const line of rows) {
    const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (m) parent.set(Number(m[1]), Number(m[2]));
  }
  let at = process.ppid;
  for (let i = 0; i < 64 && at > 0 && !mine.has(at); i++) {
    mine.add(at);
    at = parent.get(at) || 0;
  }
  return mine;
}

/** The lanes other runs hold right now: live holders outside this leg's own lineage. */
export function otherLanes() {
  const dir = path.dirname(LOCK_PATH);
  const slots = ["machine.lock", "machine-2.lock", "machine-3.lock", "machine-4.lock"].map((f) => path.join(dir, f));
  const live = status(LOCK_PATH, slots).slots.filter((s) => s.held && s.alive && s.holder && s.holder.pid);
  if (!live.length) return [];
  const mine = lineage();
  return live.filter((s) => !mine.has(Number(s.holder.pid)));
}

/** Refuses the run (exit 78) when another run holds a lane; returns quietly otherwise. */
export function quietOrRefuse(who) {
  const others = otherLanes();
  if (!others.length) return;
  console.log("  REFUSED " + who + ": machine busy: another lane is held ("
    + others.map((s) => "pid " + s.holder.pid + ", " + (s.holder.what || "?") + ", " + path.basename(s.path)).join("; ")
    + "); a timing leg decides only on a quiet machine");
  console.log("#refused machine-busy");
  process.exit(BUSY);
}
