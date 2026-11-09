/* THE LAB CLEANUP LEGS (relay-channel, desk-roster, folder-mirror).
 *
 *     node tests/relay-channel-clean.mjs
 *
 * Checks that tests/relay-channel.mjs, tests/desk-roster.mjs and tests/folder-mirror.mjs
 * remove their own lab folder on every exit path (process.exit and uncaught throw),
 * and remove stale lab folders left by prior dead runs at start whilst preserving
 * live runs and folders without owner.json.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = 9;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const legLab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-lab-clean-leg-"));
process.on("exit", () => {
  try {
    fs.rmSync(legLab, { recursive: true, force: true });
  } catch (e) {
    /* Ignored */
  }
});

const TARGETS = [
  {
    name: "relay-channel",
    targetPath: path.join(ROOT, "tests", "relay-channel.mjs"),
    prefix: "etiuda-relay-channel-",
    stopVar: "ETIUDA_RELAY_CHANNEL_STOP",
    codePrefix: "rlc",
  },
  {
    name: "desk-roster",
    targetPath: path.join(ROOT, "tests", "desk-roster.mjs"),
    prefix: "etiuda-desk-roster-",
    stopVar: "ETIUDA_DESK_ROSTER_STOP",
    codePrefix: "drc",
  },
  {
    name: "folder-mirror",
    targetPath: path.join(ROOT, "tests", "folder-mirror.mjs"),
    prefix: "etiuda-folder-mirror-",
    stopVar: "ETIUDA_FOLDER_MIRROR_STOP",
    codePrefix: "fmc",
  },
];

function testTarget(target) {
  const { name, targetPath, prefix, stopVar, codePrefix } = target;

  function labFolders(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(entryName => entryName.startsWith(prefix));
  }

  function run(env, timeoutMs = 3000) {
    return spawnSync(process.execPath, [targetPath], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: timeoutMs,
      env: { ...process.env, ...env },
    });
  }

  /* Leg 1: A run cut short by process.exit leaves the temp folder with no prefix entry */
  {
    const t1 = path.join(legLab, name + "-t1");
    fs.mkdirSync(t1, { recursive: true });
    const r = run({
      TMP: t1,
      TEMP: t1,
      TMPDIR: t1,
      [stopVar]: "exit",
    });
    const left = labFolders(t1);
    const ok = r.status === 0 && !r.error && left.length === 0;
    check(ok, codePrefix + "1 run cut short by process.exit leaves no lab folder: exit " + r.status + ", left " + left.length + " (" + left.join(", ") + ")");
  }

  /* Leg 2: A run that throws leaves the temp folder with no prefix entry */
  {
    const t2 = path.join(legLab, name + "-t2");
    fs.mkdirSync(t2, { recursive: true });
    const r = run({
      TMP: t2,
      TEMP: t2,
      TMPDIR: t2,
      [stopVar]: "throw",
    });
    const left = labFolders(t2);
    const ok = r.status !== 0 && !r.error && left.length === 0;
    check(ok, codePrefix + "2 run that throws leaves no lab folder: exit " + r.status + ", left " + left.length + " (" + left.join(", ") + ")");
  }

  /* Leg 3: A stale lab whose owner is a process that has exited is removed by the next run;
   * a lab whose owner is the leg's own live process stays; a lab with no owner file stays. */
  {
    const t3 = path.join(legLab, name + "-t3");
    fs.mkdirSync(t3, { recursive: true });

    /* 1. Stale lab: owner process has exited */
    const staleDir = path.join(t3, prefix + "stale");
    fs.mkdirSync(staleDir, { recursive: true });
    const deadChild = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
    const deadPid = deadChild.pid;
    fs.writeFileSync(path.join(staleDir, "owner.json"), JSON.stringify({
      pid: deadPid,
      started: "2026-01-01T00:00:00.000Z",
    }, null, 2) + "\n");

    /* 2. Live lab: owner process is this current process, which is alive */
    const liveDir = path.join(t3, prefix + "live");
    fs.mkdirSync(liveDir, { recursive: true });
    fs.writeFileSync(path.join(liveDir, "owner.json"), JSON.stringify({
      pid: process.pid,
      started: new Date().toISOString(),
    }, null, 2) + "\n");

    /* 3. Lab with no owner file */
    const noOwnerDir = path.join(t3, prefix + "noowner");
    fs.mkdirSync(noOwnerDir, { recursive: true });
    fs.writeFileSync(path.join(noOwnerDir, "note.txt"), "left before owner tracking\n");

    /* Next run */
    const r = run({
      TMP: t3,
      TEMP: t3,
      TMPDIR: t3,
      [stopVar]: "exit",
    });

    const staleGone = !fs.existsSync(staleDir);
    const liveKept = fs.existsSync(liveDir);
    const noOwnerKept = fs.existsSync(noOwnerDir);
    const extraLeft = labFolders(t3).filter(entryName =>
      entryName !== path.basename(liveDir) && entryName !== path.basename(noOwnerDir)
    );

    const ok = r.status === 0 && !r.error && staleGone && liveKept && noOwnerKept && extraLeft.length === 0;
    check(ok, codePrefix + "3 stale lab removed, live lab kept, no-owner lab kept: staleGone=" + staleGone
      + ", liveKept=" + liveKept + ", noOwnerKept=" + noOwnerKept + ", extraLeft=" + extraLeft.length
      + (extraLeft.length ? " (" + extraLeft.join(", ") + ")" : ""));
  }
}

for (const target of TARGETS) {
  testTarget(target);
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
