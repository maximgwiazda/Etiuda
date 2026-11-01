/* The theme switch settles within its bound, and a press during the fade is taken.
 *
 *   node tests/theme-switch.mjs
 *
 * No browser and no fixture. The duration is read from the sheet: the crossfade's tier and the
 * icon's tier, resolved on :root, and the switch is settled when the longer of the two is. The
 * bound is 300ms. The press is the module itself, against a document whose view transition stays
 * open and whose click lands on the document element inside the button's box, which is where a
 * real press lands while the fade runs.
 *
 * 952a and 952b take the module again under a desk host, from copies of it and its four neighbours in a scratch
 * folder: a press waits on no write to the disk and has sent the record's start before the fade begins, and the fade
 * holds real only the cards a glide moved or the browser is drawing. Each lifts its plant from a copy and goes red;
 * ETIUDA_PLANTS=off skips the lifted halves and counts them.
 *
 * Exit code is the number of failed checks.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const css = readFileSync(join(ROOT, "src", "template.html"), "utf8");

const EXPECTED = 9;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
let fails = 0, checks = 0, skipped = 0;
const check = (ok, what) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) fails++;
};
const skip = what => { skipped++; console.log("  SKIP  " + what); };

function tierMs(name) {
  const re = new RegExp("--m-" + name + ":(\\d+)ms\\b");
  const m = css.match(re);
  return m ? Number(m[1]) : null;
}
function ruleBody(re) {
  const m = css.match(re);
  return m ? m[1] : "";
}
function timeTier(body) {
  const names = [...body.matchAll(/var\(--m-([a-z]+)\)/g)].map(m => m[1]);
  for (const n of names) {
    const ms = tierMs(n);
    if (ms != null) return { name: n, ms };
  }
  return { name: null, ms: null };
}

const fade = timeTier(ruleBody(/::view-transition-old\(root\),::view-transition-new\(root\)\{([^}]*)\}/));
const icon = timeTier(ruleBody(/#theme svg\{([^}]*)\}/));
const settle = (fade.ms == null || icon.ms == null) ? null : Math.max(fade.ms, icon.ms);
console.log("duration: crossfade " + (fade.name ? "--m-" + fade.name + " " + fade.ms + "ms" : "unread")
  + ", icon " + (icon.name ? "--m-" + icon.name + " " + icon.ms + "ms" : "unread")
  + ", settles " + (settle == null ? "unread" : settle + "ms"));
check(settle != null && settle <= 300,
  "the switch settles in at most 300ms (crossfade " + fade.ms + "ms, icon " + icon.ms + "ms, longer " + settle + "ms)");

const mem = new Map();
const box = {
  getItem(k) { return mem.has(k) ? mem.get(k) : null; },
  setItem(k, v) { mem.set(k, String(v)); },
  removeItem(k) { mem.delete(k); },
  key(i) { return [...mem.keys()][i] || null; },
  get length() { return mem.size; }
};
globalThis.localStorage = box;
globalThis.sessionStorage = box;
globalThis.window = { localStorage: box, sessionStorage: box };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

function cls() {
  const set = new Set();
  return {
    add(...cs) { for (const c of cs) set.add(c); },
    remove(...cs) { for (const c of cs) set.delete(c); },
    contains(c) { return set.has(c); }
  };
}
const svg = { dataset: {}, style: {}, classList: cls(), contains() { return false; } };
const button = {
  dataset: {}, style: {}, classList: cls(), onclick: null,
  getBoundingClientRect() { return { left: 100, top: 20, right: 140, bottom: 60, width: 40, height: 40 }; },
  contains(n) { return n === button || n === svg; },
  click() { if (this.onclick) this.onclick(); }
};
const root = {
  dataset: { theme: "dark" }, style: {}, classList: cls(), offsetHeight: 8,
  contains(n) { return n === root; }
};
const listeners = [];
let vtCalls = 0;
let active = null;
globalThis.document = {
  documentElement: root,
  visibilityState: "visible",
  querySelector(sel) {
    if (sel === "#theme") return button;
    if (sel === "#theme svg") return svg;
    return null;
  },
  addEventListener(type, fn) { listeners.push({ type, fn }); },
  startViewTransition(cb) {
    vtCalls++;
    let readyRes;
    const ready = new Promise(r => { readyRes = r; });
    const finished = new Promise(() => {});
    const anims = [];
    active = { anims };
    queueMicrotask(() => {
      cb();
      anims.push({
        effect: { pseudoElement: "::view-transition-old(root)" },
        reversed: 0,
        reverse() { this.reversed++; }
      });
      readyRes();
    });
    return { ready, finished };
  },
  getAnimations() { return active ? active.anims.slice() : []; }
};

const theme = await import(pathToFileURL(join(ROOT, "src", "modules", "theme.js")).href);
theme.wireThemeBtn();
button.click();
await Promise.resolve();
await Promise.resolve();
await new Promise(r => setTimeout(r, 0));

const asked = box.getItem("eTheme");
check(vtCalls === 1 && root.dataset.theme === "light" && asked === "light",
  "the first press fades toward the other theme and stores it (" + vtCalls + " fade(s), on screen "
  + root.dataset.theme + ", stored " + asked + ")");

function fire(x, y) {
  const ev = { type: "click", button: 0, target: root, clientX: x, clientY: y };
  for (const l of listeners) if (l.type === "click") l.fn(ev);
}
fire(120, 40);
const turned = box.getItem("eTheme");
const rev = active && active.anims[0] ? active.anims[0].reversed : 0;
check(vtCalls === 1 && root.dataset.theme === "dark" && turned === "dark" && rev === 1,
  "a press on the button's box while the fade is open turns back at once, from the frame in flight ("
  + vtCalls + " fade(s), on screen " + root.dataset.theme + ", stored " + turned + ", reversed " + rev + ")");

const awayFrom = root.dataset.theme, awayStored = box.getItem("eTheme"), awayRev = active.anims[0].reversed;
fire(4, 4);
check(root.dataset.theme === awayFrom && box.getItem("eTheme") === awayStored && active.anims[0].reversed === awayRev,
  "a press away from the button during the fade changes nothing");

fire(120, 40);
const again = box.getItem("eTheme");
check(vtCalls === 1 && root.dataset.theme === "light" && again === "light" && active.anims[0].reversed === 2,
  "a third press during the same fade is taken too, and the picture walks the other way ("
  + root.dataset.theme + " stored " + again + ", reversed " + active.anims[0].reversed + ")");

/* THE PRESS UNDER A DESK. The modules are copied into a folder of their own so that storage.js reads this host at its
   load, and so a plant can be lifted from a copy; the product files are only read. */
const LAB = mkdtempSync(join(tmpdir(), "etiuda-theme-switch-"));
let labs = 0;
async function deskPress(lift) {
  const dir = join(LAB, "m" + (++labs));
  mkdirSync(dir);
  writeFileSync(join(dir, "package.json"), '{"type":"module"}');
  for (const f of ["theme.js", "storage.js", "motion.js", "dom.js", "hooks.js"]) {
    let text = readFileSync(join(ROOT, "src", "modules", f), "utf8");
    if (lift && lift.file === f) {
      const lines = text.split("\n"), at = lines.findIndex(l => l.indexOf(lift.tag) >= 0);
      if (at < 0) return null;
      lines.splice(at, 1);
      text = lines.join("\n");
    }
    writeFileSync(join(dir, f), text);
  }
  const sends = [];
  let fadeOn = false, endFade = null;
  const keysOf = t => { try { return Object.keys(JSON.parse(t)); } catch (e) { return []; } };
  const host = {
    deskRead: () => "{}",
    deskSave: t => { sends.push({ kind: "waited", fadeOn, keys: keysOf(t) }); return true; },
    deskWrite: t => { sends.push({ kind: "sent", fadeOn, keys: keysOf(t) }); return Promise.resolve(true); },
    deskPatch: (t, now) => { sends.push({ kind: now ? "waited" : "sent", fadeOn, keys: keysOf(t) }); return now ? true : Promise.resolve(true); }
  };
  const card = (i, drawn) => {
    const at = new Set();
    return { i, isConnected: true, setAttribute(k) { at.add(k); }, removeAttribute(k) { at.delete(k); }, hasAttribute: k => at.has(k),
      checkVisibility() { return true; }, firstElementChild: { checkVisibility: () => drawn } };
  };
  const cards = [card(0, false), card(1, false), card(2, true), card(3, false), card(4, false), card(5, false)];
  const r = { dataset: { theme: "dark" }, style: {}, classList: cls(), offsetHeight: 8 };
  const b = { dataset: {}, style: {}, classList: cls(), onclick: null, contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0 }) };
  const was = { window: globalThis.window, document: globalThis.document };
  globalThis.window = { localStorage: box, sessionStorage: box, E_HOST: host };
  globalThis.document = {
    documentElement: r, visibilityState: "visible",
    querySelector: sel => sel === "#theme" ? b : sel === "#list" ? { querySelectorAll: () => cards } : null,
    addEventListener() {},
    startViewTransition(cb) {
      fadeOn = true;
      let readyRes, finRes;
      const ready = new Promise(x => { readyRes = x; }), finished = new Promise(x => { finRes = x; });
      endFade = finRes;
      queueMicrotask(() => { cb(); readyRes(); });
      return { ready, finished };
    },
    getAnimations: () => []
  };
  try {
    const motion = await import(pathToFileURL(join(dir, "motion.js")).href);
    const T = await import(pathToFileURL(join(dir, "theme.js")).href);
    if (typeof motion.noteGlided === "function") { motion.noteGlided(cards[0]); motion.noteGlided(cards[1]); }
    T.wireThemeBtn();
    b.onclick();
    const held = cards.filter(c => c.hasAttribute("data-fade-held")).map(c => c.i);
    await Promise.resolve(); await Promise.resolve();
    if (endFade) endFade();
    await new Promise(x => setTimeout(x, 0));
    const after = cards.filter(c => c.hasAttribute("data-fade-held")).map(c => c.i);
    return { sends, held, after, theme: r.dataset.theme, fadeRoot: r.classList.contains("theme-fade") };
  } finally {
    globalThis.window = was.window;
    globalThis.document = was.document;
  }
}
const sheetHold = /:root\.theme-fade #list \.card\[data-fade-held\]\{content-visibility:visible\}/.test(css)
  && !/:root\.theme-fade #list \.card\{/.test(css);
const startSent = d => !!d && !!d.sends && !d.sends.some(x => x.kind === "waited")
  && d.sends.some(x => x.kind === "sent" && !x.fadeOn && x.keys.indexOf("eTrace") >= 0);
let D = null;
try { D = await deskPress(null); } catch (e) { D = { error: e.message }; }
check(startSent(D) && D.theme === "light", "952a under a desk a press waits on no write to the disk, and its record's start is sent before the fade begins: "
  + JSON.stringify(D && (D.sends || D.error)));
if (PLANTS_OFF) skip("952a lifting plant:fade-start-sent leaves the fade begun with no start sent");
else {
  let L = null;
  try { L = await deskPress({ file: "theme.js", tag: "plant:fade-start-sent" }); } catch (e) { L = { error: e.message }; }
  check(!!L && !L.error && !startSent(L), "952a lifting plant:fade-start-sent leaves the fade begun with no start sent: "
    + JSON.stringify(L && (L.sends || L.error)));
}
check(!!D && JSON.stringify(D.held) === "[0,1,2]" && JSON.stringify(D.after) === "[]" && D.fadeRoot === false && sheetHold, "952b the fade holds real the two cards a glide moved and the one the browser draws, none of the three it skips, and lets them go as it ends; the sheet holds only those: "
  + JSON.stringify(D && { held: D.held, after: D.after, rootAfter: D.fadeRoot, sheet: sheetHold, error: D.error }));
if (PLANTS_OFF) skip("952b lifting plant:fade-holds-glided holds no card");
else {
  let L = null;
  try { L = await deskPress({ file: "theme.js", tag: "plant:fade-holds-glided" }); } catch (e) { L = { error: e.message }; }
  check(!!L && !L.error && JSON.stringify(L.held) === "[]", "952b lifting plant:fade-holds-glided holds no card: "
    + JSON.stringify(L && (L.held || L.error)));
}

try { rmSync(LAB, { recursive: true, force: true }); } catch (e) { /* a leftover in the temp folder */ }
console.log("#counts checks=" + checks + " skipped=" + skipped + " failed=" + fails + " expected=" + EXPECTED);
if (checks + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (checks + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(checks + " checks, " + fails + " failed");
process.exit(fails);
