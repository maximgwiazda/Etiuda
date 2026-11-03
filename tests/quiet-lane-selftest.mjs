// The timing legs refuse on a busy machine (tests/quiet-lane.mjs). In a lab of three slot files beside its own
// ETIUDA_LOCK_PATH, never the office's: a live holder on a second lane makes theme-presses and theme-roll each refuse
// with 78 and `#refused machine-busy` before a browser starts; the leg's own run holding a lane, or a dead holder,
// lets it through.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { processStart } from "../tools/machine-lock.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-quiet-lane-"));
const env = Object.assign({}, process.env, { ETIUDA_LOCK_PATH: path.join(LAB, "machine.lock") });

let fails = 0, checks = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
};
const hold = (file, pid, started, what) => fs.writeFileSync(path.join(LAB, file),
  JSON.stringify({ pid, started, host: os.hostname(), tree: LAB, what, since: new Date().toISOString() }));
const free = (file) => { const at = path.join(LAB, file); if (fs.existsSync(at)) fs.renameSync(at, at + ".was-" + checks); };
const run = (args) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: "utf8", windowsHide: true, timeout: 120000 });
  return { exit: r.status, out: String(r.stdout || "") + String(r.stderr || ""), ms: Date.now() - t0 };
};
const helper = ["--input-type=module", "-e",
  "const m = await import(" + JSON.stringify(new URL("./quiet-lane.mjs", import.meta.url).href) + "); m.quietOrRefuse('lab'); console.log('QUIET');"];

/* A live holder: a child that only waits, stopped by its PID at the end. */
const holder = spawn(process.execPath, ["-e", "setTimeout(() => {}, 600000)"], { windowsHide: true, stdio: "ignore" });
try {
  const started = processStart(holder.pid);
  check(!!started, "the lab holder is alive and has a creation time", { pid: holder.pid, started });

  hold("machine-2.lock", holder.pid, started, "lab holder");
  for (const leg of ["tests/theme-presses.mjs", "tests/theme-roll.mjs"]) {
    const r = run([leg]);
    check(r.exit === 78 && /^#refused machine-busy\r?$/m.test(r.out) && /machine busy: another lane is held/.test(r.out)
      && !/Page ready|frames sampled|reached screen/.test(r.out),
      leg + " refuses with 78 before it presses when another run holds a second lane", { exit: r.exit, ms: r.ms, tail: r.out.slice(-300) });
  }

  /* The leg's own run holds the lane: this process is the helper's parent, so its lane is the helper's own. */
  free("machine-2.lock");
  hold("machine.lock", process.pid, processStart(process.pid), "this selftest");
  const own = run(helper);
  check(own.exit === 0 && /QUIET/.test(own.out), "a lane held by the leg's own run lets it through", own);

  /* A dead holder on another lane is no load. */
  const gone = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8", windowsHide: true });
  hold("machine-2.lock", Number(String(gone.stdout).trim()), "2000-01-01T00:00:00.0000000Z", "a holder long gone");
  const dead = run(helper);
  check(dead.exit === 0 && /QUIET/.test(dead.out), "a dead holder on another lane is not load", dead);

  /* And the live one again, through the helper alone: refused. */
  hold("machine-2.lock", holder.pid, started, "lab holder");
  const busy = run(helper);
  check(busy.exit === 78 && !/QUIET/.test(busy.out), "the helper refuses with the live holder back", busy);
} catch (e) {
  check(false, "the selftest ran to its end", String(e && e.stack || e));
} finally {
  try { process.kill(holder.pid); } catch (e) {}
}
console.log(`#counts checks=${checks} skipped=0 failed=${fails} expected=6`);
console.log(`quiet-lane-selftest: ${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
