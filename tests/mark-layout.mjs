/* The header mark must turn without laying the page out.
 *
 *   node tests/mark-layout.mjs
 *
 * m10 counts Chrome's LayoutCount across a language switch and the 1700ms after it. The
 * switch's own rebuild already reads a batch before it writes the next card. What kept the
 * count up is the mark in the header: it repaints every 50ms for the whole time the page is
 * shown, and writing the path's d marks that shape for layout, so each repaint is one layout
 * whether or not a card moved. 1700 / 50 is 34, which is the gap between the founding count
 * and what a window measured after the deck's extra scans were taken out.
 *
 * HOW A LAYOUT IS COUNTED. The stand-in has no browser and does not lay out. A frame counts
 * one layout when something in it wrote a layout-dirtying property and a later read, or the
 * frame's own end, would have to lay out: the path's d or a presentation attribute, a class
 * that changes, a size read (clientWidth and its siblings), or a computed style. A canvas
 * stroke does not. The clock is run for 400ms first and the counters are then zeroed, so the
 * one class change that shows the canvas is not in the window. The window is 1700ms of frames
 * 1/60s apart, the same length m10 sleeps, and the frames carry their own timestamps.
 *
 * The geometry is the markup's. The group transform and the viewBox are read from the template
 * here, and every stroke has to have been drawn through them at the line's own width. A caller
 * that passes its own path still turns by writing d: that is the other program's mark, and the
 * same window on it has to count a layout a repaint, or this stand-in would be blind to the
 * write it exists to catch.
 *
 * THE INK FOLLOWS THE BAND. The sheet sets the band's ink from classes on body.
 * The stand-in's computed colour is the deep band's white when body carries
 * e-band-deep, and the light backdrop's ink otherwise. A leg toggles that class
 * and fires the observer recorded on body. The next stroke has to be the new
 * ink, and that stroke's frame reads no style and no size. Observers are
 * recorded and stay quiet until a leg fires one, so the 1700ms window fires
 * none: a read that lives in an observer is not a read in that window.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = 4;
const DT = 1000 / 60;
const SETTLE = 400;
const WINDOW = 1700;

let asserted = 0, failed = 0;
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stdout.write("  FAIL " + line + "\n"); }
}

const tpl = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
const std = (/<span class="brand-tile"[^>]*><svg[^>]*><g[^>]*><path fill="currentColor" d="([^"]+)"/.exec(tpl) || [])[1] || "";
const group = (/<span class="brand-tile"[^>]*><svg[^>]*><g transform="([^"]+)"/.exec(tpl) || [])[1] || "";
const viewBox = (/<span class="brand-tile"[^>]*><svg[^>]*viewBox="([^"]+)"/.exec(tpl) || [])[1] || "";
const wantTx = +(/translate\(\s*([-\d.]+)/.exec(group) || [])[1];
const wantSc = +(/scale\(\s*([-\d.]+)/.exec(group) || [])[1];
const wantVb = +(viewBox.trim().split(/[\s,]+/)[2]);

function loadFifth() {
  const src = fs.readFileSync(path.join(ROOT, "src", "modules", "fifth.js"), "utf8")
    .replace(/^import[^\n]*\n/gm, "")
    .replace(/export\s*\{[^}]*\};?\s*$/, "");
  return src;
}

/* A tile, its svg and its path, plus a canvas the header painter can append. Size reads and
   style reads are counted only while `arm` is on, which is the measured window. */
function makeLab() {
  let seq = 0, frames = [];
  const lab = {
    layouts: 0, styleReads: 0, dWrites: 0, clientReads: 0, draws: [], dirty: false, arm: false, t: 0
  };
  const mark = () => { if (lab.arm) lab.dirty = true; };
  const tile = {
    kids: [], classes: new Set(),
    classList: {
      contains: c => tile.classes.has(c),
      add: c => { if (!tile.classes.has(c)) { tile.classes.add(c); mark(); } },
      remove: c => { if (tile.classes.has(c)) { tile.classes.delete(c); mark(); } }
    },
    appendChild(n) { tile.kids.push(n); },
    querySelector(s) { return s === "canvas.brand-fifth" ? tile.kids.find(k => k.className === "brand-fifth") || null : null; }
  };
  Object.defineProperty(tile, "clientWidth", { get() { if (lab.arm) lab.clientReads++; mark(); return 25; } });
  Object.defineProperty(tile, "clientHeight", { get() { if (lab.arm) lab.clientReads++; mark(); return 25; } });
  const svg = { getAttribute: n => n === "viewBox" ? viewBox : null };
  const g = { getAttribute: n => n === "transform" ? group : null, parentElement: svg };
  const pathNode = {
    d: std, attrs: {},
    getAttribute: n => n === "d" ? pathNode.d : pathNode.attrs[n],
    setAttribute(n, v) {
      if (n === "d") { pathNode.d = v; if (lab.arm) lab.dWrites++; }
      else pathNode.attrs[n] = v;
      mark();
    },
    closest: s => s === ".brand-tile" ? tile : s === "svg" ? svg : null,
    ownerSVGElement: svg,
    parentElement: g
  };
  function canvas() {
    const ctx = { lineWidth: 0, lineCap: "", lineJoin: "", strokeStyle: "", tx: 0, ty: 0, sc: 1, a: 1, d: 1 };
    ctx.setTransform = (a, b, c, d) => { ctx.a = a; ctx.d = d; };
    ctx.translate = (x, y) => { ctx.tx = x; ctx.ty = y; };
    ctx.scale = x => { ctx.sc = x; };
    ctx.clearRect = () => {};
    ctx.stroke = p => {
      lab.draws.push({ d: p.d, phase: sb.__f.fifthPhase(), w: ctx.lineWidth, cap: ctx.lineCap, join: ctx.lineJoin,
        tx: ctx.tx, ty: ctx.ty, sc: ctx.sc, a: ctx.a, ink: ctx.strokeStyle });
    };
    const cv = { className: "", _w: 0, _h: 0, setAttribute() {}, getContext: () => ctx };
    // The bitmap size is a layout. A repaint that sets it again would put the layouts back.
    Object.defineProperty(cv, "width", { get() { return cv._w; }, set(v) { if (lab.arm && v !== cv._w) mark(); cv._w = v; } });
    Object.defineProperty(cv, "height", { get() { return cv._h; }, set(v) { if (lab.arm && v !== cv._h) mark(); cv._h = v; } });
    return cv;
  }
  const body = {
    classes: new Set(["e-backdrop"]),
    classList: {
      contains: c => body.classes.has(c),
      add: c => { body.classes.add(c); },
      remove: c => { body.classes.delete(c); }
    }
  };
  const mos = [];
  const doc = {
    hidden: false,
    body,
    documentElement: { classList: { contains: () => false } },
    createElement: tag => tag === "canvas" ? canvas() : {},
    querySelector: s => s === ".brand-tile svg path" ? pathNode : s === ".brand-tile" ? tile : null,
    addEventListener() {}
  };
  const sb = {
    document: doc,
    devicePixelRatio: 1,
    Path2D: class { constructor(d) { this.d = d; } },
    getComputedStyle: () => {
      if (lab.arm) lab.styleReads++;
      return { color: body.classes.has("e-band-deep") ? "rgb(255, 255, 255)" : "rgb(15, 23, 42)" };
    },
    requestAnimationFrame: fn => { frames.push({ id: ++seq, fn }); return seq; },
    cancelAnimationFrame: id => { frames = frames.filter(f => f.id !== id); },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; }
      observe(target, options) {
        mos.push({ cb: this.cb, target, filter: (options && options.attributeFilter) || null });
      }
      disconnect() {}
    }
  };
  vm.runInNewContext(loadFifth() + "\nglobalThis.__f = { fifthLinePath, fifthRadius, fifthPhase, wireFifth };", sb);
  lab.f = sb.__f;
  lab.node = pathNode;
  lab.tile = tile;
  lab.std = std;
  lab.body = body;
  lab.fireAttr = (target, name) => {
    mos.forEach(o => {
      if (o.target === target && (!o.filter || o.filter.indexOf(name) !== -1)) o.cb();
    });
  };
  lab.wire = o => sb.__f.wireFifth(o);
  lab.play = ms => {
    const end = lab.t + ms;
    while (lab.t < end - 0.01) {
      lab.t += DT;
      const run = frames; frames = [];
      lab.dirty = false;
      run.forEach(x => x.fn(lab.t));
      if (lab.dirty) lab.layouts++;
    }
  };
  lab.zero = () => { lab.layouts = 0; lab.styleReads = 0; lab.dWrites = 0; lab.clientReads = 0; lab.draws = []; };
  return lab;
}

const header = makeLab();
header.wire();
header.play(SETTLE);
header.zero();
header.arm = true;
header.play(WINDOW);
const draws = header.draws;
const radius = 2 * header.f.fifthRadius();
const scale = header.tile ? (25 / wantVb) : 0;
check(header.layouts === 0 && header.styleReads === 0 && header.dWrites === 0 && header.clientReads === 0 && header.node.d === header.std,
  "898a the header mark over 1700ms lays out " + header.layouts + " time(s), reads style " + header.styleReads
  + " time(s), reads a size " + header.clientReads + " time(s) and writes the path " + header.dWrites + " time(s)");
check(draws.length >= 30 && draws.length <= 36
  && draws.every(p => p.d === header.f.fifthLinePath(p.phase) && Math.abs(p.w - radius) < 0.02
    && p.cap === "round" && p.join === "round"
    && Math.abs(p.tx - wantTx) < 1e-6 && Math.abs(p.ty - wantTx) < 1e-6 && Math.abs(p.sc - wantSc) < 1e-6
    && Math.abs(p.a - scale) < 1e-6)
  && header.tile.classList.contains("brand-turning"),
  "898b the mark strokes " + draws.length + " frames of its own line, through the tile's transform, at the line's width");

const passed = makeLab();
const own = { d: "M0 0", sets: 0, attrs: {}, getAttribute(n) { return n === "d" ? own.d : own.attrs[n]; },
  setAttribute(n, v) { if (n === "d") { own.d = v; if (passed.arm) passed.dWrites++; } else own.attrs[n] = v; if (passed.arm) passed.dirty = true; } };
passed.wire({ node: own, still: () => false });
passed.play(SETTLE);
passed.zero();
passed.arm = true;
passed.play(WINDOW);
check(passed.layouts >= 30 && passed.dWrites >= 30 && own.d !== "M0 0",
  "898c a path handed in still turns by writing d, and the same window lays out " + passed.layouts + " time(s) for " + passed.dWrites + " writes");

const band = makeLab();
band.wire();
band.play(SETTLE);
band.zero();
band.body.classList.add("e-band-deep");
band.fireAttr(band.body, "class");
band.arm = true;
band.play(80);
const bandInk = band.draws.length ? band.draws[band.draws.length - 1].ink : "";
check(band.draws.length === 1 && bandInk === "rgb(255, 255, 255)" && band.styleReads === 0 && band.layouts === 0 && band.clientReads === 0,
  "898d a deep band on body turns the stroke to " + (bandInk || "nothing")
  + ", and that repaint lays out " + band.layouts + " time(s), reads style " + band.styleReads
  + " time(s) and reads a size " + band.clientReads + " time(s)");

if (asserted !== EXPECTED) {
  failed++;
  process.stdout.write("  FAIL ran " + asserted + " of " + EXPECTED + " checks\n");
}
process.stdout.write(failed ? "RESULT: FAIL " + failed + " failed\n" : "RESULT: ok " + asserted + " check(s)\n");
process.exit(failed ? 1 : 0);
