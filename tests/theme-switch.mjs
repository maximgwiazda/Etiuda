/* The theme switch lands at once, as Studio's does, and a second press is taken.
 *
 *   node tests/theme-switch.mjs
 *
 * No browser and no fixture. The sheet: the icon's turn on its tier, at most 300ms, and no rule left for a
 * whole-window crossfade or for cutting the controls' own transitions during a flip (Max, 2026-11-01 17:50:
 * "Yes, lets bring desk to studio method"). The press is the module itself, taken from copies of it and its
 * four neighbours in a scratch folder, once in a browser (no host) and once under a desk host: the press
 * puts data-theme on the root in its own task, opens no view transition, waits on no write to the disk and
 * sends the choice without waiting, and a second press straight after flips back and stores that.
 * 952a and 952b each lift plant:theme-lands-at-once from a copy and go red; ETIUDA_PLANTS=off skips the
 * lifted halves and counts them.
 *
 * Exit code is the number of failed checks.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const EXPECTED = 5;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
let fails = 0, checks = 0, skipped = 0;
const check = (ok, what) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) fails++;
};
const skip = what => { skipped++; console.log("  SKIP  " + what); };

function cls() {
  const set = new Set();
  return { add(...cs) { for (const c of cs) set.add(c); }, remove(...cs) { for (const c of cs) set.delete(c); }, contains: c => set.has(c) };
}
const LAB = mkdtempSync(join(tmpdir(), "etiuda-theme-switch-"));
let labs = 0;
/* Two presses on the module's own button, the second straight after the first, read after each press in its
   own task and again once the tasks have run. `desk`: a desk host with the patch it takes, recording each send. */
async function presses(desk, lift) {
  const dir = join(LAB, "m" + (++labs));
  mkdirSync(dir);
  writeFileSync(join(dir, "package.json"), '{"type":"module"}');
  for (const f of ["theme.js", "storage.js", "motion.js", "dom.js", "hooks.js"]) {
    let text = readFileSync(join(ROOT, "src", "modules", f), "utf8");
    if (lift && f === "theme.js") {
      const lines = text.split("\n"), at = lines.findIndex(l => l.indexOf(lift) >= 0);
      if (at < 0) return null;
      lines.splice(at, 1);
      text = lines.join("\n");
    }
    writeFileSync(join(dir, f), text);
  }
  const mem = new Map(), sends = [];
  const box = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k),
    key: i => [...mem.keys()][i] || null, get length() { return mem.size; } };
  const keysOf = t => { try { return JSON.parse(t); } catch (e) { return {}; } };
  const host = desk ? {
    deskRead: () => "{}",
    deskSave: t => { sends.push(["waited", keysOf(t).eTheme]); return true; },
    deskWrite: t => { sends.push(["sent", keysOf(t).eTheme]); return Promise.resolve(true); },
    deskPatch: (t, now) => { sends.push([now ? "waited" : "sent", keysOf(t).eTheme]); return now ? true : Promise.resolve(true); }
  } : undefined;
  let fades = 0;
  const r = { dataset: { theme: "dark" }, style: {}, classList: cls() };
  const svg = { dataset: {}, style: {} };
  const b = { onclick: null };
  const was = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage, matchMedia: globalThis.matchMedia };
  globalThis.localStorage = box; globalThis.sessionStorage = box;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.window = { localStorage: box, sessionStorage: box, E_HOST: host };
  globalThis.document = {
    documentElement: r, visibilityState: "visible",
    querySelector: sel => sel === "#theme" ? b : sel === "#theme svg" ? svg : null,
    addEventListener() {},
    startViewTransition(cb) { fades++; if (cb) cb(); return { ready: Promise.resolve(), finished: Promise.resolve() }; }
  };
  try {
    const T = await import(pathToFileURL(join(dir, "theme.js")).href);
    T.wireThemeBtn();
    b.onclick();
    const first = r.dataset.theme;
    b.onclick();
    const second = r.dataset.theme;
    await new Promise(x => setTimeout(x, 0));
    const stored = desk ? (sends.filter(s => s[1]).pop() || [])[1] || null : box.getItem("eTheme");
    return { first, second, stored, fades, waited: sends.filter(s => s[0] === "waited").length, sends: sends.length,
      turns: svg.dataset.eTurns || null };
  } finally {
    Object.keys(was).forEach(k => { globalThis[k] = was[k]; });
  }
}
const said = x => JSON.stringify(x);
let B = null, D = null;
try { B = await presses(false); } catch (e) { B = { error: e.message }; }
check(!!B && B.first === "light" && B.fades === 0 && String(B.turns) === "2",
  "in a browser a press puts the other theme on the root in its own task, opens no view transition, and the icon turns: " + said(B));
try { D = await presses(true); } catch (e) { D = { error: e.message }; }
check(!!D && D.first === "light" && D.fades === 0 && D.waited === 0 && D.sends > 0, "952a under a desk a press lands the other theme in its own task, opens no view transition, and waits on no write to the disk: " + said(D));
if (PLANTS_OFF) skip("952a lifting plant:theme-lands-at-once leaves the root on the old theme");
else {
  let L = null;
  try { L = await presses(true, "plant:theme-lands-at-once"); } catch (e) { L = { error: e.message }; }
  check(!!L && !L.error && L.first === "dark", "952a lifting plant:theme-lands-at-once leaves the root on the old theme: " + said(L));
}
check(!!B && !!D && B.second === "dark" && B.stored === "dark" && D.second === "dark" && D.stored === "dark", "952b a second press straight after the first, while the colours still ease, flips back at once and that choice is what is stored, in a browser and under a desk: "
  + said({ browser: B && [B.second, B.stored], desk: D && [D.second, D.stored] }));
if (PLANTS_OFF) skip("952b lifting plant:theme-lands-at-once leaves a second press with nothing to answer on screen");
else {
  let L = null;
  try { L = await presses(false, "plant:theme-lands-at-once"); } catch (e) { L = { error: e.message }; }
  check(!!L && !L.error && L.second === "dark" && L.first === "dark", "952b lifting plant:theme-lands-at-once leaves a second press with nothing to answer on screen: " + said(L));
}

try { rmSync(LAB, { recursive: true, force: true }); } catch (e) { /* a leftover in the temp folder */ }
console.log("#counts checks=" + checks + " skipped=" + skipped + " failed=" + fails + " expected=" + EXPECTED);
if (checks + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (checks + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(checks + " checks, " + fails + " failed");
process.exit(fails);
