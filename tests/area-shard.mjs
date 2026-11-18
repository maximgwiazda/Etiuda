/* AN AREA CUT INTO SHARDS (tools/gate-run.mjs ETIUDA_AREA_SHARD and ETIUDA_AREA_DESK_ONLY; the hosted machines,
 * .github/workflows/hosted-area.yml). Node only; it lists plans and runs no gate.
 *
 *     node tests/area-shard.mjs
 *
 * as1 The shards 1/2 and 2/2 of one area's plan list every command of the whole plan, each exactly once, and the plan is not empty.
 * as2 A shard that is not i/n with 1 <= i <= n <= 64 is refused before any plan is made, never read as the whole area: 9/8, 0/4,
 *     1/65, a/b.
 * as3 A gate named in ETIUDA_AREA_DESK_ONLY is said LEFT TO THE DESK and is in no shard's list; a name the plan does not hold is
 *     said "(not in this plan)".
 * as4 A shard's line says it is not an area run and that no green is inherited from it.
 * as5 Read as text, since a gate that is red once and green after needs a gate of its own: a shard reruns a red gate once, alone,
 *     names a green rerun a FLAKE, and does not rerun a gate that refused (NO_VERDICT); and runStep takes both variables out of the
 *     environment a gate inherits, so a gate that starts an area of its own gets the whole plan.
 *
 * The base of the plans is three commits back, so the plan holds gates whatever the tree holds; only the cover is judged, not
 * which gates the plan names.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = 5;
let checks = 0, failed = 0;
function check(ok, line) { checks++; if (!ok) failed++; console.log((ok ? "  ok   " : "  FAIL ") + line); }

function list(extra) {
  const env = Object.assign({}, process.env, extra || {});
  delete env.ETIUDA_AREA_SHARD; delete env.ETIUDA_AREA_DESK_ONLY;
  Object.assign(env, extra || {});
  const r = spawnSync(process.execPath, ["tools/gate-run.mjs", "area", "HEAD~3", "--list"], { cwd: ROOT, env, encoding: "utf8", timeout: 300000 });
  const out = String(r.stdout || "") + String(r.stderr || "");
  const cmds = out.split(/\r?\n/).filter(l => /^  (node|npm) /.test(l)).map(l => l.replace(/ \([^)]*\)$/, "").trim());
  return { code: r.status, out, cmds };
}

const whole = list();
const parts = [1, 2].map(i => list({ ETIUDA_AREA_SHARD: i + "/2" }));
{
  const seen = new Map();
  for (const p of parts) for (const c of p.cmds) seen.set(c, (seen.get(c) || 0) + 1);
  const missing = whole.cmds.filter(c => !seen.has(c)), twice = [...seen].filter(([, n]) => n !== 1).map(([c]) => c);
  const extra = [...seen.keys()].filter(c => !whole.cmds.includes(c));
  check(whole.code === 0 && whole.cmds.length > 0 && parts.every(p => p.code === 0) && !missing.length && !twice.length && !extra.length,
    "as1 the shards 1/2 and 2/2 list every command of the whole plan exactly once: whole " + whole.cmds.length + ", shards "
    + parts.map(p => p.cmds.length).join("+") + ", missing " + missing.length + ", twice " + twice.length + ", extra " + extra.length);
}
{
  const bad = ["9/8", "0/4", "1/65", "a/b"].map(v => ({ v, r: list({ ETIUDA_AREA_SHARD: v }) }));
  const refused = bad.filter(b => b.r.code !== 0 && /want i\/n/.test(b.r.out) && b.r.cmds.length === 0).map(b => b.v);
  check(refused.length === bad.length, "as2 a shard not i/n with 1 <= i <= n <= 64 is refused, never the whole area: refused " + refused.join(", ")
    + " of " + bad.map(b => b.v).join(", "));
}
{
  const one = whole.cmds.find(c => /^node tests\/[^ ]+$/.test(c));
  const file = one ? one.slice("node ".length) : "";
  const r = list({ ETIUDA_AREA_SHARD: "1/1", ETIUDA_AREA_DESK_ONLY: file + ",tests/no-such-leg.mjs" });
  check(!!file && r.code === 0 && r.out.includes("LEFT TO THE DESK " + file + "\n") && !r.cmds.includes(one)
    && r.out.includes("LEFT TO THE DESK tests/no-such-leg.mjs (not in this plan)") && r.cmds.length === whole.cmds.length - 1,
    "as3 a gate left to the desk is said and listed in no shard, a stale name said as such: " + file + ", listed " + r.cmds.length + " of " + whole.cmds.length);
}
{
  const r = parts[0];
  check(/shard 1\/2: \d+ of \d+ gate\(s\); not an area run, and no green is inherited from it/.test(r.out),
    "as4 a shard's line says it is not an area run and that no green is inherited from it");
}
{
  const src = fs.readFileSync(path.join(ROOT, "tools", "gate-run.mjs"), "utf8");
  const rerun = /if \(res\.exit !== 0 && shard && res\.exit !== NO_VERDICT\) \{[\s\S]{0,400}await runStep\(step, customEnv\)[\s\S]{0,300}gate-run: FLAKE /.test(src);
  const step = src.slice(src.indexOf("function runStep("), src.indexOf("function runStep(") + 900);
  const kept = /const env = Object\.assign\([^\n]*\);\s*(\/\*[^]*?\*\/\s*)?delete env\.ETIUDA_AREA_SHARD;\s*delete env\.ETIUDA_AREA_DESK_ONLY;/.test(step);
  check(rerun && kept, "as5 (as text) a red gate of a shard is rerun once and a green rerun named a FLAKE, a refusal not rerun: " + rerun
    + "; runStep keeps the two variables from a gate: " + kept);
}
console.log("#counts checks=" + checks + " failed=" + failed + " expected=" + EXPECTED);
console.log(failed ? "RESULT: FAIL " + failed + " of " + checks : "RESULT: ok " + checks + " check(s)");
process.exit(failed ? 1 : checks === EXPECTED ? 0 : 78);
