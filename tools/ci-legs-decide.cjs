/* The verify runner's one decision: whether a leg may spawn, and with what environment.
 *
 * It is pure. The platform and the parent environment are passed in, so
 * tests/engine-selftest.js 22f can drive every arm without spawning anything. tools/ci-legs.mjs
 * calls it for every leg and holds no logic of its own about the window word.
 *
 * A window leg spawns only on GitHub's Windows runner (GITHUB_ACTIONS "true", platform win32, the
 * job's os windows), and only when the dispatch's windows_date equals the day the window wall
 * computes. That date is the word for that one run, set by the dispatch the verdict argued
 * (channel 549, the widening of the wall to a runner). Anywhere else the leg is refused with the
 * wall's own lines, and nothing is spawned. The word is never inherited: it is removed from every
 * child, and set only on a window leg's child, from the dispatch's date. */
"use strict";

const DROPPED = ["ETIUDA_FIXTURES", "GITHUB_TOKEN", "GH_TOKEN", "CI_LEGS", "CI_WINDOWS_DATE", "RELAY_TARGET"];

function onWindowsRunner(o) {
  const env = o.env || {};
  return env.GITHUB_ACTIONS === "true" && o.platform === "win32" && o.osNorm === "windows";
}

/* E is tests/engine.js. leg is one row of the runner's list. o carries windowsDate, osNorm,
 * platform and env (the parent's). The result is { status: "skipped" | "refused" | "spawn" },
 * with text for the first two and the child's env for the third. */
function decide(E, leg, o) {
  const date = o.windowsDate || "";
  const runner = onWindowsRunner(o);
  if (o.osNorm === "ubuntu" && leg.where === "windows-only")
    return { status: "skipped", text: "skipped: " + leg.id + " is windows-only and this job is ubuntu\n" };
  if (leg.window && !(runner && date === E.WINDOWS_DAY)) {
    /* The wall's own refusal. Off the runner a matching date is still refused, and is reported as
       unset, since handing that day to the wall's probe would let the wall allow the window. */
    const probe = {};
    if (date && (runner || date !== E.WINDOWS_DAY)) probe[E.WINDOWS_VAR] = date;
    const bad = E.windowWallRefusal(leg.who, probe) || E.windowWallRefusal(leg.who, {});
    const lines = ["#refused window-wall", "  FAIL " + bad[0]];
    for (let i = 1; i < bad.length; i++) lines.push("       " + bad[i]);
    lines.push("  SUITE DID NOT COMPLETE: " + bad[0]);
    return { status: "refused", text: lines.join("\n") + "\n" };
  }
  const child = Object.assign({}, o.env || {});
  for (const k of DROPPED) delete child[k];
  delete child[E.WINDOWS_VAR];
  if (leg.relay) child.RELAY_TARGET = leg.relay;
  if (leg.window) child[E.WINDOWS_VAR] = date;
  return { status: "spawn", env: child };
}

module.exports = { decide, onWindowsRunner };
