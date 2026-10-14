/* THE FRAME THE MOTION TRACKER READS, without a window.
 *
 *     node tools/motion-frame-harness.mjs
 *
 * tests/motion.js instrument() is sliced out of the working tree and run under a fake
 * scheduler whose order is the browser's: the task, then its microtasks, then the frame's
 * requestAnimationFrame callbacks in queue order, then ResizeObserver, then paint. A rAF
 * queued during a rAF callback or an observer callback waits for the next frame.
 *
 * The act's writer is the defect's shape: a microtask (the mutation observer) queues a rAF,
 * so that rAF is queued after the tracker's own, which the task queued before the microtasks
 * ran. The frozen instrumentOld is instrument() from before the read moved. The slice is the
 * tracker in the tree now.
 *
 * Node builtins only. The root is the parent of the tools/ directory this file lives in.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/* Frozen from tests/motion.js at the edit's parent. The read() body is asserted equal to the
   slice's, so a drift in the read is a failure here rather than a silent second reader. */
function instrumentOld() {
  const KINDS = {
    cards: { sel: "#list .card[data-id], #list .card[data-leave]", page: true,
             key: el => el.hasAttribute("data-id") ? "c:" + el.getAttribute("data-id") : "g:" + el.getAttribute("data-leave") },
    pills: { sel: "#pills .pill",
             key: el => el.dataset.k != null ? "k:" + el.dataset.k : (el.classList.contains("pill-add") ? "add" : null) },
    rail: { sel: "#intentRailList .rail-item[data-si]", key: el => "r" + el.dataset.si }
  };
  const GEO = /^(transform|translate|scale|width|minWidth|height|maxHeight|opacity|top|left)$/;
  const scroller = () => document.getElementById("pageScroll") || document.scrollingElement;
  const read = (kind, seen, first) => {
    const K = KINDS[kind], out = {}, dy = K.page ? scroller().scrollTop : 0;
    document.querySelectorAll(K.sel).forEach(el => {
      const k = K.key(el);
      if (k == null) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const o = { x: r.left, y: r.top + dy, w: r.width, top: r.top, bottom: r.bottom };
      const an = el.getAnimations ? el.getAnimations() : [];
      /* Only what moves or shows a box: a colour's .1s state change is not motion. */
      const running = an.filter(a => (a.playState === "running" || a.playState === "paused") && a.effect
        && a.effect.getKeyframes().some(f => Object.keys(f).some(n => GEO.test(n))));
      if (running.length) {
        o.anim = 1;
        if (first && !seen.has(k)) {
          seen.add(k);
          const was = running.map(a => a.currentTime);
          running.forEach(a => { a.currentTime = 0; });
          const s = el.getBoundingClientRect();
          running.forEach((a, i) => { a.currentTime = was[i]; });
          o.start = { x: s.left, y: s.top + dy, w: s.width };
        }
      }
      if (+getComputedStyle(el).opacity < 0.99) o.anim = 1;
      out[k] = o;
    });
    return out;
  };
  window.__mt = {
    /* One value per frame from window.__mtRead, the act run between the first read and the rest. */
    series: ms => new Promise(res => {
      const out = [window.__mtRead()];
      const t0 = performance.now();
      window.__mtAct();
      const f = () => {
        out.push(window.__mtRead());
        if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(out);
      };
      requestAnimationFrame(f);
    }),
    /* Snapshot, act, then one read per frame for `ms`. */
    run: (kind, ms) => new Promise(res => {
      const seen = new Set();
      const before = read(kind, seen, false);
      const t0 = performance.now();
      window.__mtAct();
      const frames = [];
      const f = () => {
        frames.push(read(kind, seen, true));
        if (performance.now() - t0 < ms) requestAnimationFrame(f); else res({ before, frames, vh: innerHeight });
      };
      requestAnimationFrame(f);
    })
  };
}

function sliceAt(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) throw new Error("missing " + signature);
  let depth = 0;
  let state = "code";
  const i0 = src.indexOf("{", start);
  for (let j = i0; j < src.length; j++) {
    const c = src[j], n = src[j + 1];
    if (state === "code") {
      if (c === "/" && n === "/") { state = "line"; j++; continue; }
      if (c === "/" && n === "*") { state = "block"; j++; continue; }
      if (c === "'" || c === "\"" || c === "`") { state = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return src.slice(start, j + 1);
      }
    } else if (state === "line") {
      if (c === "\n") state = "code";
    } else if (state === "block") {
      if (c === "*" && n === "/") { state = "code"; j++; }
    } else {
      if (c === "\\") { j++; continue; }
      if (c === state) state = "code";
    }
  }
  throw new Error("unbalanced " + signature);
}

function makeWorld() {
  const layout = { x: 0, y: 4, w: 20, h: 8 };
  const paints = [];
  const rafQ = [];
  const micros = [];
  const observers = [];
  const step = 20;
  let now = 0;

  function usedWidth(el) {
    const n = parseFloat(el.style && el.style.width);
    return Number.isFinite(n) ? n : 0;
  }
  function element() {
    const style = {};
    Object.defineProperty(style, "cssText", {
      configurable: true, enumerable: true,
      get() { return ""; },
      set(v) {
        const w = /width:\s*([^;]+)/.exec(v);
        const h = /height:\s*([^;]+)/.exec(v);
        if (w) style.width = w[1].trim();
        if (h) style.height = h[1].trim();
      }
    });
    return { style, appendChild() {} };
  }
  const card = {
    hasAttribute(name) { return name === "data-id"; },
    getAttribute(name) { return name === "data-id" ? "card" : null; },
    getBoundingClientRect() {
      return {
        left: layout.x, top: layout.y, width: layout.w, height: layout.h,
        right: layout.x + layout.w, bottom: layout.y + layout.h
      };
    },
    getAnimations() { return []; }
  };
  const document = {
    documentElement: element(),
    scrollingElement: { scrollTop: 0 },
    createElement() { return element(); },
    getElementById(id) { return id === "pageScroll" ? { scrollTop: 0 } : null; },
    querySelectorAll(sel) { return String(sel).includes(".card") ? [card] : []; }
  };

  class ResizeObserver {
    constructor(cb) { this.cb = cb; this.recs = []; observers.push(this); }
    observe(el) { this.recs.push({ el, w: undefined }); }
    disconnect() {}
  }
  function deliverRO() {
    const due = [];
    for (const obs of observers) {
      let changed = false;
      for (const rec of obs.recs) {
        const w = usedWidth(rec.el);
        if (rec.w !== w) { rec.w = w; changed = true; }
      }
      if (changed) due.push(obs);
    }
    for (const obs of due) obs.cb([]);
  }

  return {
    layout, paints, step, document,
    performance: { now() { return now; } },
    requestAnimationFrame(fn) { rafQ.push(fn); return rafQ.length; },
    ResizeObserver,
    getComputedStyle() { return { opacity: "1" }; },
    defer(fn) { micros.push(fn); },
    flush() { while (micros.length) micros.shift()(); },
    settle() { deliverRO(); },
    frame() {
      now += step;
      const cbs = rafQ.splice(0, rafQ.length);
      for (const cb of cbs) cb(now);
      deliverRO();
      paints.push(layout.x);
    }
  };
}

function framesNeeded(ms, step) {
  let now = 0, n = 0;
  do { now += step; n++; } while (now < ms);
  return n;
}

function load(world, source, call) {
  const sandbox = {
    document: world.document,
    performance: world.performance,
    requestAnimationFrame(fn) { return world.requestAnimationFrame(fn); },
    ResizeObserver: world.ResizeObserver,
    innerHeight: 900,
    getComputedStyle(el) { return world.getComputedStyle(el); }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext("'use strict';\n" + source + "\n;" + call, sandbox);
  return sandbox;
}

/* `write` runs in the late rAF: the act only queues a microtask, and that microtask queues
   the rAF, which is the order a MutationObserver plus rAF has against the tracker's rAF. */
async function drive(source, call, ms, write, series) {
  const world = makeWorld();
  const sandbox = load(world, source, call);
  world.settle();
  if (series) sandbox.__mtRead = () => world.layout.x;
  sandbox.__mtAct = () => {
    world.defer(() => {
      world.requestAnimationFrame(() => write(world));
    });
  };
  const pending = series ? sandbox.__mt.series(ms) : sandbox.__mt.run("cards", ms);
  world.flush();
  const n = framesNeeded(ms, world.step);
  for (let i = 0; i < n; i++) world.frame();
  let result, done = false;
  pending.then(r => { result = r; done = true; });
  await Promise.resolve();
  if (!done) throw new Error("tracker did not settle after " + n + " frame(s), raf left " + world.paints.length);
  if (series) return { xs: result.slice(1), paints: world.paints.slice(), before: result[0] };
  if (!result.frames[0] || result.frames[0]["c:card"] == null) {
    throw new Error("no card box: " + JSON.stringify(result.frames[0]));
  }
  return {
    xs: result.frames.map(f => f["c:card"].x),
    paints: world.paints.slice(),
    before: result.before["c:card"].x
  };
}

function glide(world) {
  world.layout.x = 10;
  world.requestAnimationFrame(() => { world.layout.x = 40; });
}

function same(got, want) { return JSON.stringify(got) === JSON.stringify(want); }

async function main() {
  const motionPath = path.join(ROOT, "tests", "motion.js");
  const motion = fs.readFileSync(motionPath, "utf8");
  const sliced = sliceAt(motion, "function instrument()");
  const oldSrc = instrumentOld.toString();
  const readNew = sliceAt(sliced, "const read =");
  const readOld = sliceAt(oldSrc, "const read =");
  if (readNew !== readOld) throw new Error("frozen read() drifted from the slice (" + readOld.length + " vs " + readNew.length + ")");
  if (!sliced.includes("new ResizeObserver")) throw new Error("slice has no ResizeObserver slot");
  if (sliced.includes("instrumentOld")) throw new Error("slice is the harness, not tests/motion.js");

  const late = w => { w.layout.x = 7; };
  const oldLate = await drive(oldSrc, "instrumentOld()", 10, late, false);
  const newLate = await drive(sliced, "instrument()", 10, late, false);
  const oldGlide = await drive(oldSrc, "instrumentOld()", 30, glide, false);
  const newGlide = await drive(sliced, "instrument()", 30, glide, false);
  const oldSeries = await drive(oldSrc, "instrumentOld()", 10, late, true);
  const newSeries = await drive(sliced, "instrument()", 10, late, true);

  const lines = [
    "old reads before: read " + oldLate.xs[0] + " painted " + oldLate.paints[0],
    "new reads after: read " + newLate.xs[0] + " painted " + newLate.paints[0],
    "control: frame 1 read " + newGlide.xs[0] + " painted " + newGlide.paints[0]
      + "; frame 2 read " + newGlide.xs[1] + " painted " + newGlide.paints[1]
  ];
  for (const s of lines) console.log(s);
  console.log("series old reads before: read " + oldSeries.xs[0] + " painted " + oldSeries.paints[0]);
  console.log("series new reads after: read " + newSeries.xs[0] + " painted " + newSeries.paints[0]);
  console.log("control old frame 2: read " + oldGlide.xs[1] + " painted " + oldGlide.paints[1]);

  const checks = [
    ["old reads before", [oldLate.xs, oldLate.paints, oldLate.before], [[0], [7], 0]],
    ["new reads after", [newLate.xs, newLate.paints, newLate.before], [[7], [7], 0]],
    ["control new", [newGlide.xs, newGlide.paints, newGlide.before], [[10, 40], [10, 40], 0]],
    ["control old misses the later frame", [oldGlide.xs, oldGlide.paints], [[0, 10], [10, 40]]],
    ["series old reads before", [oldSeries.xs, oldSeries.paints, oldSeries.before], [[0], [7], 0]],
    ["series new reads after", [newSeries.xs, newSeries.paints, newSeries.before], [[7], [7], 0]]
  ];
  let fails = 0;
  for (const [name, got, want] of checks) {
    if (!same(got, want)) {
      fails++;
      console.log("FAIL " + name + " got " + JSON.stringify(got) + " want " + JSON.stringify(want));
    }
  }
  console.log(fails ? "FAIL " + fails : "ok " + checks.length);
  process.exitCode = fails ? 1 : 0;
}

main().catch(e => {
  console.error("FAIL " + (e && e.stack || e));
  process.exitCode = 1;
});
