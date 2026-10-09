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
 * Exit code is the number of failed checks.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const css = readFileSync(join(ROOT, "src", "template.html"), "utf8");

let fails = 0, checks = 0;
const check = (ok, what) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) fails++;
};

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

console.log(checks + " checks, " + fails + " failed");
process.exit(fails);
