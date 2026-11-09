/* Shared lab folder lifecycle for test suites.
 *
 * Creates a unique lab directory under the OS temporary directory, marks it with
 * an owner.json recording the owner process id, registers an exit handler to
 * remove the lab on process termination, and cleans stale lab folders left by
 * dead processes whilst preserving active runs and legacy folders without owner.json.
 *
 * Any symbolic link or junction inside a lab is removed before recursive deletion
 * so recursive remove never follows one into a checkout.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* The owner is judged by its process id alone: a reused id reads as alive, so its folder stays, the safe way (the test architect, 2026-11-09). */
export function isOwnerAlive(owner) {
  if (!owner || typeof owner !== "object" || typeof owner.pid !== "number") return true;
  let alive = false;
  try {
    process.kill(owner.pid, 0);
    alive = true;
  } catch (e) {
    alive = e && e.code === "EPERM";
  }
  if (!alive) return false;
  return true;
}

/* Remove any symbolic link or junction first so recursive removal never follows one into a checkout. */
function removeLinks(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isSymbolicLink()) {
      try {
        fs.unlinkSync(full);
      } catch (_) {
        try {
          fs.rmdirSync(full);
        } catch (_) {}
      }
    } else if (ent.isDirectory()) {
      removeLinks(full);
    }
  }
}

export function removeLab(dir) {
  if (!dir) return;
  try {
    if (!fs.existsSync(dir)) return;
  } catch (_) {
    return;
  }
  removeLinks(dir);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {
    /* Ignored */
  }
}

export function cleanStaleLabs(activeLab, prefix) {
  const activeBase = path.basename(activeLab);
  const tmp = os.tmpdir();
  let entries = [];
  try {
    entries = fs.readdirSync(tmp, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const ent of entries) {
    if (!ent.isDirectory() || !ent.name.startsWith(prefix) || ent.name === activeBase) {
      continue;
    }
    const candidate = path.join(tmp, ent.name);
    const ownerFile = path.join(candidate, "owner.json");
    let owner;
    try {
      owner = JSON.parse(fs.readFileSync(ownerFile, "utf8"));
    } catch (e) {
      /* A folder with no owner.json, which is every folder left before this change, is left alone. */
      continue;
    }
    if (!owner || typeof owner !== "object" || typeof owner.pid !== "number") {
      continue;
    }
    if (isOwnerAlive(owner)) {
      continue;
    }
    removeLab(candidate);
  }
}

export function createLab(prefix, opts = {}) {
  const keepEnv = typeof opts === "string" ? opts : (opts && opts.keepEnv);
  const stopEnv = typeof opts === "object" ? (opts && opts.stopEnv) : null;

  const lab = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const owner = { pid: process.pid };
  try {
    fs.writeFileSync(path.join(lab, "owner.json"), JSON.stringify(owner, null, 2) + "\n");
  } catch (e) {
    /* Ignored */
  }

  process.on("exit", () => {
    if (process.env.ETIUDA_KEEP_LAB === "1") return;
    if (keepEnv && process.env[keepEnv] === "1") return;
    removeLab(lab);
  });

  cleanStaleLabs(lab, prefix);

  if (stopEnv) {
    if (process.env[stopEnv] === "exit") {
      process.exit(0);
    }
    if (process.env[stopEnv] === "throw") {
      throw new Error(stopEnv + "=throw");
    }
  }

  return lab;
}
