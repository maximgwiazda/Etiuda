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
 * here, and every stroke has to have been drawn through them at the line's own width, the line
 * taken from the turn's fit (150 of the figure's 212) back to the figure's own size, which is
 * the size the standing path is drawn at. A caller
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
 *
 * THE BITMAP FOLLOWS THE RATIO. The tile's CSS size stays when the window moves
 * to another screen or the zoom changes, so a content-box watch never fires.
 * The stand-in records each ResizeObserver box and fires device-pixel-content-box
 * on its own. That fire resizes the bitmap, and the repaints after it read no
 * size and lay nothing out.
 *
 * FORCED COLOURS SET NO CLASS. The stand-in's computed colour is black while
 * its forced-colours query matches, and the band's ink otherwise. A leg flips
 * that match and fires the change listener the query recorded. The read is the
 * listener's, so the stroke that follows lays nothing out and reads no style.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = 14;
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
const tileSvg = (/<span class="brand-tile"[^>]*>(<svg[\s\S]*?<\/svg>)<\/span>/.exec(tpl) || [])[1] || "";
const std = (/<path [^>]*?d="([^"]+)"/.exec(tileSvg) || [])[1] || "";
const group = (/<g transform="([^"]+)">\s*<path /.exec(tileSvg) || [])[1] || "";
const viewBox = (/^<svg[^>]*viewBox="([^"]+)"/.exec(tileSvg) || [])[1] || "";
const wantTx = +(/translate\(\s*([-\d.]+)/.exec(group) || [])[1];
const wantSc = +(/scale\(\s*([-\d.]+)/.exec(group) || [])[1];
const vbParts = viewBox.trim().split(/[\s,]+/).map(Number);
const wantVb = vbParts[2], wantVx = vbParts[0];
/* The turn's line is fitted so the figure's ink, 2 x (96 + 10) = 212 at its own size, spans 150 of the box, about
   its centre; the canvas takes it back by 212/150 and places it as the path is. Worked out here, not read. */
const FIT = 150 / 212;
const wantA = (25 / wantVb) * wantSc / FIT;
const wantE = (25 / wantVb) * (wantTx - wantVx - (wantSc / FIT) * 128 * (1 - FIT));

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
    layouts: 0, styleReads: 0, dWrites: 0, clientReads: 0, draws: [], pieces: [], puts: [], dirty: false, arm: false, t: 0
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
    const ctx = { lineWidth: 0, lineCap: "", lineJoin: "", strokeStyle: "", tx: 0, ty: 0, sc: 1, a: 1, d: 1, e: 0, f: 0, at: [], fill: "" };
    const first = !lab.canvas;
    ctx.fillRect = () => {};
    ctx.beginPath = () => { ctx.at = []; };
    ctx.moveTo = (x, y) => { ctx.at.push(x, y); };
    ctx.lineTo = (x, y) => { ctx.at.push(x, y); };
    /* The tile's bitmap reads as full ink and the light canvas as grey 102 everywhere, so what comes back is the product. */
    ctx.getImageData = (x, y, w, h) => { const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < data.length; i += 4) { if (first) data[i + 3] = 255; else { data[i] = data[i + 1] = data[i + 2] = 102; data[i + 3] = 255; } }
      return { data, width: w, height: h }; };
    ctx.putImageData = img => { lab.puts.push({ first, alpha: img.data[3], n: img.data.length / 4, phase: sb.__f.fifthPhase() }); };
    ctx.setTransform = (a, b, c, d, e, f) => { ctx.a = a; ctx.d = d; ctx.e = e; ctx.f = f; };
    ctx.translate = (x, y) => { ctx.tx = x; ctx.ty = y; };
    ctx.scale = x => { ctx.sc = x; };
    ctx.clearRect = () => {};
    ctx.stroke = p => {
      if (!p) { lab.pieces.push({ at: ctx.at.slice(), grey: ctx.strokeStyle, w: ctx.lineWidth, cap: ctx.lineCap, a: ctx.a, e: ctx.e, f: ctx.f, phase: sb.__f.fifthPhase(), first }); return; }
      lab.draws.push({ d: p.d, phase: sb.__f.fifthPhase(), w: ctx.lineWidth, cap: ctx.lineCap, join: ctx.lineJoin,
        tx: ctx.tx, ty: ctx.ty, sc: ctx.sc, a: ctx.a, md: ctx.d, e: ctx.e, f: ctx.f, ink: ctx.strokeStyle });
    };
    const cv = { className: "", _w: 0, _h: 0, setAttribute() {}, getContext: () => ctx };
    if (first) lab.canvas = cv;
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
  const ros = [];
  let forced = false;
  const media = [];
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
      if (forced) return { color: "rgb(0, 0, 0)" };
      return { color: body.classes.has("e-band-deep") ? "rgb(255, 255, 255)" : "rgb(15, 23, 42)" };
    },
    matchMedia: q => {
      const rec = { q, listeners: [] };
      media.push(rec);
      return {
        get matches() { return q === "(forced-colors: active)" ? forced : false; },
        addEventListener(type, fn) { if (type === "change") rec.listeners.push(fn); },
        addListener(fn) { rec.listeners.push(fn); }
      };
    },
    requestAnimationFrame: fn => { frames.push({ id: ++seq, fn }); return seq; },
    cancelAnimationFrame: id => { frames = frames.filter(f => f.id !== id); },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; }
      observe(target, options) {
        mos.push({ cb: this.cb, target, filter: (options && options.attributeFilter) || null });
      }
      disconnect() {}
    },
    ResizeObserver: class {
      constructor(cb) { this.cb = cb; }
      observe(target, options) {
        ros.push({ cb: this.cb, target, box: (options && options.box) || "content-box" });
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
  lab.sb = sb;
  lab.fireAttr = (target, name) => {
    mos.forEach(o => {
      if (o.target === target && (!o.filter || o.filter.indexOf(name) !== -1)) o.cb();
    });
  };
  lab.fireBox = box => {
    ros.forEach(r => { if (r.box === box) r.cb(); });
  };
  lab.flipForced = () => { forced = !forced; };
  lab.fireMedia = q => {
    media.forEach(r => { if (r.q === q) r.listeners.forEach(fn => fn()); });
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
  lab.zero = () => { lab.layouts = 0; lab.styleReads = 0; lab.dWrites = 0; lab.clientReads = 0; lab.draws = []; lab.pieces = []; lab.puts = []; };
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

check(header.layouts === 0 && header.styleReads === 0 && header.dWrites === 0 && header.clientReads === 0 && header.node.d === header.std,
  "898a the header mark over 1700ms lays out " + header.layouts + " time(s), reads style " + header.styleReads
  + " time(s), reads a size " + header.clientReads + " time(s) and writes the path " + header.dWrites + " time(s)");
check(draws.length >= 30 && draws.length <= 36
  && draws.every(p => p.d === header.f.fifthLinePath(p.phase) && Math.abs(p.w - radius) < 0.02
    && p.cap === "round" && p.join === "round"
    && p.tx === 0 && p.ty === 0 && p.sc === 1
    && Math.abs(p.a - wantA) < 1e-6 && Math.abs(p.md - wantA) < 1e-6 && Math.abs(p.e - wantE) < 1e-3 && Math.abs(p.f - wantE) < 1e-3)
  && header.tile.classList.contains("brand-turning")
  && header.puts.length === draws.length && header.puts.every(p => p.first)
  && draws.every(p => { const own = header.pieces.filter(q => q.phase === p.phase && !q.first); return own.length > 100
    && own.every(q => Math.abs(q.a - wantA) < 1e-6 && Math.abs(q.e - wantE) < 1e-3 && q.cap === "round"); }),
  "898b the mark strokes " + draws.length + " frames of its own line, through the tile's transform, at the line's width, each with its"
  + " light painted through the same transform and the frame's opacity put back once (" + header.puts.length + " put(s))");

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

const ratio = makeLab();
ratio.wire();
ratio.play(SETTLE);
const beforeBmp = ratio.canvas._w;
ratio.sb.devicePixelRatio = 2;
ratio.fireBox("device-pixel-content-box");
const afterBmp = ratio.canvas._w;
ratio.zero();
ratio.arm = true;
ratio.play(WINDOW);
const ratioLast = ratio.draws.length ? ratio.draws[ratio.draws.length - 1] : null;
const wantRatio = 2 * wantA;
check(beforeBmp === 25 && afterBmp === 50 && ratio.draws.length >= 30 && ratio.draws.length <= 36
  && ratio.draws.every(p => Math.abs(p.a - wantRatio) < 1e-6)
  && ratio.clientReads === 0 && ratio.layouts === 0 && ratio.styleReads === 0 && ratio.dWrites === 0,
  "898e a ratio change resizes the bitmap from " + beforeBmp + " to " + afterBmp
  + " and the next window strokes at " + (ratioLast ? ratioLast.a : "nothing")
  + ", with " + ratio.layouts + " layout(s) and " + ratio.clientReads + " size read(s)");

const force = makeLab();
force.wire();
force.play(SETTLE);
const beforeInk = force.draws.length ? force.draws[force.draws.length - 1].ink : "";
force.zero();
force.flipForced();
force.fireMedia("(forced-colors: active)");
force.arm = true;
force.play(80);
const forceInk = force.draws.length ? force.draws[force.draws.length - 1].ink : "";
check(beforeInk === "rgb(15, 23, 42)" && force.draws.length === 1 && forceInk === "rgb(0, 0, 0)"
  && force.styleReads === 0 && force.layouts === 0 && force.clientReads === 0,
  "898f a live forced-colours switch turns the stroke from " + (beforeInk || "nothing") + " to " + (forceInk || "nothing")
  + ", and that repaint lays out " + force.layouts + " time(s), reads style " + force.styleReads
  + " time(s) and reads a size " + force.clientReads + " time(s)");

/* THE STANDING MARK IS THE APP ICON'S FIGURE WITH ITS DEPTH (board 441): one mask, id depth, once in the page; the
   figure's one path filled with currentColor through it; the tile 25 px, the svg spanning it, the viewBox framing the
   icon's 256 box at 88 per cent, centred. */
const built = fs.readFileSync(path.join(ROOT, "engine", "etiuda.html"), "utf8");
const depthIds = s => (s.match(/\bid="depth"/g) || []).length;
const tilePaths = tileSvg.match(/<path\b[^>]*>/g) || [];
const tileMasks = tileSvg.match(/<mask\b[^>]*>/g) || [];
check(tileMasks.length === 1 && /\bid="depth"/.test(tileMasks[0]) && depthIds(tpl) === 1 && depthIds(built) === 1
  && tilePaths.length === 1 && /\bfill="currentColor"/.test(tilePaths[0]) && /\bmask="url\(#depth\)"/.test(tilePaths[0]),
  "441a the header's mark holds " + tileMasks.length + " mask(s), id depth " + depthIds(tpl) + " time(s) in the template and "
  + depthIds(built) + " in the built page, and " + tilePaths.length + " path(s), filled currentColor through url(#depth)");

/** Points along a path of absolute M, L, C and Z: eight on each cubic. */
function outline(d) {
  const tok = d.match(/[MLCZ]|-?[\d.]+/g) || [], out = [];
  let i = 0, cmd = "", cur = [0, 0];
  const n = () => +tok[i++];
  while (i < tok.length) {
    if (/[MLCZ]/.test(tok[i])) { cmd = tok[i++]; if (cmd === "Z") continue; }
    if (cmd === "M" || cmd === "L") { cur = [n(), n()]; out.push(cur); }
    else if (cmd === "C") {
      const c = [n(), n(), n(), n(), n(), n()];
      for (let k = 1; k <= 8; k++) { const u = k / 8, g = 1 - u;
        out.push([g * g * g * cur[0] + 3 * g * g * u * c[0] + 3 * g * u * u * c[2] + u * u * u * c[4],
          g * g * g * cur[1] + 3 * g * g * u * c[1] + 3 * g * u * u * c[3] + u * u * u * c[5]]); }
      cur = [c[4], c[5]];
    } else return [];
  }
  return out;
}
const wantTy = +(/translate\(\s*[-\d.]+[\s,]+([-\d.]+)/.exec(group) || [])[1];
const tilePx = 25 / wantVb;
const standPx = outline(std).map(p => [(p[0] * wantSc + wantTx - wantVx) * tilePx, (p[1] * wantSc + wantTy - vbParts[1]) * tilePx]);
const inkPx = standPx.length ? Math.max(...standPx.map(p => p[0])) - Math.min(...standPx.map(p => p[0])) : 0;
const tileCss = (/\.brand-tile\{([^}]*)\}/.exec(tpl) || [])[1] || "";
const svgCss = (/\.brand-tile svg\{([^}]*)\}/.exec(tpl) || [])[1] || "";
const share = 256 / wantVb;
const centred = Math.abs(wantVx + (wantVb - 256) / 2) < 1e-3 && vbParts[1] === wantVx && vbParts[3] === wantVb;
check(/\bwidth:25px/.test(tileCss) && /\bheight:25px/.test(tileCss) && /\bwidth:100%/.test(svgCss) && /\bheight:100%/.test(svgCss)
  && Math.abs(share - 0.88) < 1e-4 && centred,
  "441b the tile is 25 px and the svg spans it; the viewBox frames the icon's box at " + (share * 100).toFixed(2) + " per cent, "
  + (centred ? "centred" : "off centre") + ", the figure's ink " + inkPx.toFixed(2) + " px wide");

const rest = makeLab();
let restQuiet = false;
rest.wire({ still: () => restQuiet });
rest.play(SETTLE);
const restTurned = rest.tile.classList.contains("brand-turning") && rest.draws.length > 0;
restQuiet = true;
rest.zero();
rest.play(200);
check(restTurned && !rest.tile.classList.contains("brand-turning") && rest.draws.length === 0 && rest.node.d === rest.std,
  "441c at rest the header hands back to its svg: turning " + restTurned + ", then the canvas "
  + (rest.tile.classList.contains("brand-turning") ? "stays" : "comes off") + " after " + rest.draws.length + " stroke(s), the path unwritten");

/* The canvas at the standing figure's phase, 56 degrees, lies on the standing path: every point of the path's outline,
   placed as the svg places it, sits half the line's width from the turn's centreline placed by the canvas's own matrix.
   The centreline is worked out from the figure's definition. The control: the same test through the tile's transform
   alone, without the turn's fit taken back, misses. */
function onLine(m, pts) {
  const line = [];
  const phi = 56 * Math.PI / 180;
  for (let i = 0; i <= 6000; i++) {
    const t = i / 6000 * 2 * Math.PI;
    line.push([(128 + FIT * 96 * Math.sin(3 * t + phi)) * m.a + m.e, (128 + FIT * 96 * Math.sin(2 * t)) * m.a + m.f]);
  }
  const half = 10 * FIT * m.a;
  let worst = 0;
  for (const p of pts) {
    let best = Infinity;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      if (Math.abs(p[0] - a[0]) > 3 || Math.abs(p[1] - a[1]) > 3) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy));
    }
    worst = Math.max(worst, Math.abs(best - half));
  }
  return worst;
}
const canvasM = draws.length ? { a: draws[0].a, e: draws[0].e, f: draws[0].f } : { a: 0, e: 0, f: 0 };
const worstOn = standPx.length > 500 ? onLine(canvasM, standPx) : Infinity;
const worstOff = onLine({ a: tilePx * wantSc, e: (wantTx - wantVx) * tilePx, f: (wantTy - vbParts[1]) * tilePx }, standPx);
check(worstOn <= 0.01 && worstOff > 0.5,
  "441d the canvas at 56 degrees strokes the standing figure: its " + standPx.length + " outline points lie within "
  + worstOn.toFixed(4) + " px of half the line's width; control, through the tile's transform alone, off by " + (isFinite(worstOff) ? worstOff.toFixed(2) + " px" : "more than 3 px"));

/* THE TURN CARRIES THE DEPTH (board 441). At each repaint the light canvas holds the line's pieces in greys, a wider pass
   then the exact one, each pass far to near; the tile's opacity is its ink's times that light. Each piece's grey is held to
   0.4 + 0.6 x smoothstep(u), u = (z + 1) / 2, with z worked out here from the figure's definition at the piece's middle:
   the nearest point of the pass, x = 128 + 96 sin(3t + phi), y = 128 + 96 sin(2t), z = cos(3t + phi), or of its mirror,
   z the opposite; where two arms cross within half a unit either may be the piece's. */
const ease = z => { const u = z * 0.5 + 0.5; return 0.4 + 0.6 * u * u * (3 - 2 * u); };
function zCandidates(phi, mx, my) {
  const rx = 128 + (mx - 128) / FIT, ry = 128 + (my - 128) / FIT, near = [];
  let best = Infinity;
  const all = [];
  for (let i = 0; i <= 6000; i++) {
    const t = 3 * Math.PI / 4 + Math.PI * i / 6000, x = 128 + 96 * Math.sin(3 * t + phi), y = 128 + 96 * Math.sin(2 * t), z = Math.cos(3 * t + phi);
    for (const c of [[x, y, z], [256 - x, y, -z]]) { const d = Math.hypot(c[0] - rx, c[1] - ry); all.push([d, c[2]]); if (d < best) best = d; }
  }
  for (const c of all) if (c[0] <= best + 0.5) near.push(c[1]);
  return { best, near };
}
const lastPhase = draws.length ? draws[draws.length - 1].phase : 0;
const lit = header.pieces.filter(q => q.phase === lastPhase && !q.first);
const half = lit.length / 2, wide = lit.slice(0, half), exact = lit.slice(half);
const greyOf = q => +((/rgb\((\d+)/.exec(q.grey) || [])[1]);
const ordered = ps => ps.every((q, i) => i === 0 || greyOf(q) >= greyOf(ps[i - 1]));
let worstGrey = 0, worstDist = 0;
for (const q of exact) {
  const c = zCandidates(lastPhase, (q.at[0] + q.at[2]) / 2, (q.at[1] + q.at[3]) / 2);
  worstDist = Math.max(worstDist, c.best);
  worstGrey = Math.max(worstGrey, Math.min(...c.near.map(z => Math.abs(255 * ease(z) - greyOf(q)))));
}
const greys = exact.map(greyOf);
check(lit.length > 200 && lit.length % 2 === 0 && wide.every(q => Math.abs(q.w - (radius + 2 / wantA)) < 1e-9) && exact.every(q => Math.abs(q.w - radius) < 1e-9)
  && ordered(wide) && ordered(exact) && worstDist < 0.6 && worstGrey <= 8 && Math.min(...greys) <= 103 && Math.max(...greys) >= 254,
  "441e at phase " + lastPhase.toFixed(3) + " the light holds " + half + " pieces twice (a wider pass, then the exact one), each far to near, greys "
  + Math.min(...greys) + " to " + Math.max(...greys) + ", each within " + worstGrey.toFixed(2) + " of 0.4 + 0.6 x smoothstep of its depth, its middle "
  + worstDist.toFixed(2) + " from the figure");
const lastPut = header.puts[header.puts.length - 1] || {};
check(lastPut.first === true && lastPut.alpha === 102 && lastPut.n === 625,
  "441f the tile's opacity is its ink's times the light: full ink under grey 102 comes back at " + lastPut.alpha + ", over " + lastPut.n + " pixel(s)");

/* THE STANDING MARK IS THE AGREED CUT, BYTE FOR BYTE: the svg's content after the viewBox is the cut taken whole,
   its sha256 written here when it landed. */
const STAND_SHA = "db48b668f4ad6e23d9e6eaa6a24977ed2c1d358d1353cb3617458ae58b222a51";
const standInner = (/^<svg[^>]*>([\s\S]*)<\/svg>$/.exec(tileSvg) || [])[1] || "";
const standSha = crypto.createHash("sha256").update(standInner, "utf8").digest("hex");
check(standSha === STAND_SHA && viewBox === "-17.4545 -17.4545 290.9091 290.9091",
  "441g the standing svg is the agreed cut byte for byte: sha256 " + standSha.slice(0, 16) + ", viewBox " + viewBox);

/* ABOUT'S MARK (board 441): the header's cut and viewBox byte for byte but for its mask's id, depth-about, which the page
   holds once beside the header's depth; its path filled currentColor through that mask; the tile 40 px with no ground,
   border, radius or shadow of its own. */
const aboutSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "about.js"), "utf8");
const aboutTile = (/TILE_MARK='(<svg[^']*<\/svg>)'/.exec(aboutSrc) || [])[1] || "";
const aboutVb = (/^<svg[^>]*viewBox="([^"]+)"/.exec(aboutTile) || [])[1] || "";
const aboutInner = (/^<svg[^>]*>([\s\S]*)<\/svg>$/.exec(aboutTile) || [])[1] || "";
const aboutPaths = aboutTile.match(/<path\b[^>]*>/g) || [];
const aboutCss = (/\.about-tile\{([^}]*)\}/.exec(tpl) || [])[1] || "";
const aboutIds = s => (s.match(/\bid="depth-about"/g) || []).length;
check(aboutVb === viewBox && aboutInner !== standInner && aboutInner.split('"depth-about"').join('"depth"').split("#depth-about)").join("#depth)") === standInner
  && aboutIds(aboutSrc) === 1 && aboutIds(built) === 1 && depthIds(built) === 1 && aboutPaths.length === 1
  && /\bfill="currentColor"/.test(aboutPaths[0]) && /\bmask="url\(#depth-about\)"/.test(aboutPaths[0])
  && /\bwidth:40px/.test(aboutCss) && /\bheight:40px/.test(aboutCss) && !/background|border|box-shadow|radius/.test(aboutCss + tileCss),
  "441h About's mark is the header's cut and viewBox (" + aboutVb + ") under its own mask id, depth-about " + aboutIds(built)
  + " time(s) beside depth " + depthIds(built) + " in the built page, filled currentColor through it, in a 40 px tile with no ground");

if (asserted !== EXPECTED) {
  failed++;
  process.stdout.write("  FAIL ran " + asserted + " of " + EXPECTED + " checks\n");
}
process.stdout.write(failed ? "RESULT: FAIL " + failed + " failed\n" : "RESULT: ok " + asserted + " check(s)\n");
process.exit(failed ? 1 : 0);
