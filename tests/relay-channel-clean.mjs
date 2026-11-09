/* THE RELAY CHANNEL LAB CLEANUP LEGS.
 *
 *     node tests/relay-channel-clean.mjs
 *
 * Checks that tests/relay-channel.mjs removes its own lab folder on every exit path
 * (process.exit and uncaught throw), and removes stale lab folders left by prior dead
 * runs at start whilst preserving live runs and folders without owner.json.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "tests", "relay-channel.mjs");
const EXPECTED = 3;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const legLab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-relay-clean-leg-"));
process.on("exit", () => {
  try {
    fs.rmSync(legLab, { recursive: true, force: true });
  } catch (e) {
    /* Ignored */
  }
});

function runTarget(env, timeoutMs = 3000) {
  return spawnSync(process.execPath, [TARGET], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, ...env },
  });
}

function relayFolders(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => name.startsWith("etiuda-relay-channel-"));
}

/* Leg 1: A run cut short by process.exit leaves the temp folder with no etiuda-relay-channel-* entry */
{
  const t1 = path.join(legLab, "t1");
  fs.mkdirSync(t1, { recursive: true });
  const r = runTarget({
    TMP: t1,
    TEMP: t1,
    TMPDIR: t1,
    ETIUDA_RELAY_CHANNEL_STOP: "exit",
  });
  const left = relayFolders(t1);
  const ok = r.status === 0 && !r.error && left.length === 0;
  check(ok, "rlc1 run cut short by process.exit leaves no lab folder: exit " + r.status + ", left " + left.length + " (" + left.join(", ") + ")");
}

/* Leg 2: A run that throws leaves the temp folder with no etiuda-relay-channel-* entry */
{
  const t2 = path.join(legLab, "t2");
  fs.mkdirSync(t2, { recursive: true });
  const r = runTarget({
    TMP: t2,
    TEMP: t2,
    TMPDIR: t2,
    ETIUDA_RELAY_CHANNEL_STOP: "throw",
  });
  const left = relayFolders(t2);
  const ok = r.status !== 0 && !r.error && left.length === 0;
  check(ok, "rlc2 run that throws leaves no lab folder: exit " + r.status + ", left " + left.length + " (" + left.join(", ") + ")");
}

/* Leg 3: A stale lab whose owner is a process that has exited is removed by the next run;
 * a lab whose owner is the leg's own live process stays; a lab with no owner file stays. */
{
  const t3 = path.join(legLab, "t3");
  fs.mkdirSync(t3, { recursive: true });

  /* 1. Stale lab: owner process has exited */
  const staleDir = path.join(t3, "etiuda-relay-channel-stale");
  fs.mkdirSync(staleDir, { recursive: true });
  const deadChild = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
  const deadPid = deadChild.pid;
  fs.writeFileSync(path.join(staleDir, "owner.json"), JSON.stringify({
    pid: deadPid,
    started: "2026-01-01T00:00:00.000Z",
  }, null, 2) + "\n");

  /* 2. Live lab: owner process is this current process, which is alive */
  const liveDir = path.join(t3, "etiuda-relay-channel-live");
  fs.mkdirSync(liveDir, { recursive: true });
  fs.writeFileSync(path.join(liveDir, "owner.json"), JSON.stringify({
    pid: process.pid,
    started: new Date().toISOString(),
  }, null, 2) + "\n");

  /* 3. Lab with no owner file */
  const noOwnerDir = path.join(t3, "etiuda-relay-channel-noowner");
  fs.mkdirSync(noOwnerDir, { recursive: true });
  fs.writeFileSync(path.join(noOwnerDir, "note.txt"), "left before owner tracking\n");

  /* Next run */
  const r = runTarget({
    TMP: t3,
    TEMP: t3,
    TMPDIR: t3,
    ETIUDA_RELAY_CHANNEL_STOP: "exit",
  });

  const staleGone = !fs.existsSync(staleDir);
  const liveKept = fs.existsSync(liveDir);
  const noOwnerKept = fs.existsSync(noOwnerDir);
  const extraLeft = relayFolders(t3).filter(name =>
    name !== path.basename(liveDir) && name !== path.basename(noOwnerDir)
  );

  const ok = r.status === 0 && !r.error && staleGone && liveKept && noOwnerKept && extraLeft.length === 0;
  check(ok, "rlc3 stale lab removed, live lab kept, no-owner lab kept: staleGone=" + staleGone
    + ", liveKept=" + liveKept + ", noOwnerKept=" + noOwnerKept + ", extraLeft=" + extraLeft.length
    + (extraLeft.length ? " (" + extraLeft.join(", ") + ")" : ""));
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
