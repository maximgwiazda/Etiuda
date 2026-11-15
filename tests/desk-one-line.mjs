/* Dark theme one-line glass rim (`--rim`) and quieter foot (`--rim-foot`) across all six surfaces,
 * preserving each surface's own overflow, scrolling and resize behaviour from engine main.
 *
 *   node tests/desk-one-line.mjs
 *
 * Checks in headless Chrome against built engine/etiuda.html in dark theme at device scale 1 and 2
 * for every surface wearing --rim:
 *   card       #list .card:not(.deck):not(.on) .txt
 *   menu       #settingsMenu
 *   dialog     .modal:not([hidden]) .modal-card
 *   facts      #factsPanel
 *   pills      #pillsSlot.pills-overflow .pills
 *   intentRail #intentRail (floating overlay peek below the rail-col width floor)
 *
 * Per surface and scale (6 surfaces x 2 scales x 6 base + 4 scroll + 1 facts resize = 82 main checks):
 *   1. Page geometry: the ring's box equals the surface's border box (inset -borderWidth from
 *      padding box) and its corner radius equals the surface's own — whether drawn via el::after
 *      (card), via the surface's own border (`border-color:transparent` + `background-clip:
 *      border-area`), or via host ::after (`#pillsSlot.pills-overflow::after` matching `.pills`).
 *   2. Bounding box: width and height equal the unmodified base box recorded below (within 0.1px).
 *   3. Top middle screenshot line: sampled outside-to-inside across the top edge centre, yields 1 run.
 *   4. 45-degree corner screenshot line: sampled outside-to-inside along the corner radial, yields 1 run.
 *   5. Quieter foot: (botPeak - restSide) / (topPeak - restSide) <= 0.25, measured against the middle
 *      side rest using the 2px rim zone ([top, top + 2) and [bottom - 2, bottom)) on padded
 *      surfaces and the 1px outer border band ([top, top + 1) and [bottom - 1, bottom)) on pills.
 *   6. Main overflow/resize parity: computed overflow-x, overflow-y and resize match engine main
 *      f9d5cd8e (recorded in MAIN_BEHAVIOUR below).
 *   7. Scroll behaviour (dialog, facts, pills, intentRail): making the surface taller than its box
 *      allows scrollTop to move when set.
 *   8. Quick facts resize (facts): applying an inline size as a resize-handle drag does changes
 *      the panel's bounding box to that size.
 *
 * Exact run-counting rule (1D luminance array `vals[0..M-1]`, outside to inside, 1 sample/device px):
 *   1. Luminance is `L = 0.2126*R + 0.7152*G + 0.0722*B`.
 *   2. Sample top-middle vertically over `dy = -3..+5` CSS px across `rect.top` at `1/dpr` CSS px steps
 *      (avoiding any header control overlapping `#factsPanel`'s left half); sample corner along the
 *      45-degree radial from distance `s = R + 1.5` down to `s = R - 4` CSS px from corner centre
 *      (`cx, cy`) at `1/dpr` CSS px steps using bilinear interpolation at pixel centres
 *      `(px - 0.5, py - 0.5)`, using top-left for card/menu/dialog/facts/intentRail and top-right
 *      for pills (where top-left children sit flush against the padding box).
 *   3. `bgOut = median(vals[0..bgOutCount-1])` (`3` for top-middle, `dpr` for the corner radial),
 *      `bgIn = median(vals[M-3..M-1])`, `floor = max(bgOut, bgIn) + 1.5`.
 *   4. Slice `seg = vals[first..last]` spanning the first to last sample strictly above `floor`;
 *      if empty or `peak - max(bgOut, bgIn) < 12`, `runs = 0`. Otherwise start `runs = 1`.
 *   5. Valley split: any contiguous block of interior indices `i` (`1 <= i <= seg.length - 2`) where
 *      `seg[i] <= max(seg[0..i-1]) - 2` and `seg[i] <= max(seg[i+1..end]) - 2` increments `runs` by 1
 *      (a dark gap between two lighter lines).
 *   6. Step-shelf split: let `shelfEnd` be the count of leading samples in `seg` below
 *      `bgIn + 0.75 * (peak - bgIn)`. If `shelfEnd >= dpr`, `shelfEnd < seg.length`,
 *      `seg[shelfEnd - 1] >= bgOut + 10`, and `seg[shelfEnd] - seg[shelfEnd - 1] >= 14`, the leading
 *      dimmer border strip is a distinct outer line abutting a brighter inner rim; add 1 to `runs`
 *      (a < `dpr`-wide leading sample or faint fringe below `bgOut + 10` is outer anti-aliasing, not a second line).
 *
 * Inline plant proofs (3 checks, or NOT RUN when ETIUDA_PLANTS=off):
 *   - Plant 1 (1x and 2x): restores the old two-line rule (`inset:0` / inner radius on the five
 *     surfaces) in a scratch copy of engine/etiuda.html and verifies the checks catch it.
 *   - Plant 2 (1x): sets `overflow:clip` on `.facts-panel` in a scratch copy of engine/etiuda.html
 *     and verifies the new overflow and scroll checks turn red.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

if (!process.env.ETIUDA_FIXTURES) process.env.ETIUDA_FIXTURES = "C:/Users/maxim/Workspace/etiuda-fixtures";
const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

const EXPECTED = 85;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";

let checks = 0, fails = 0, skipped = 0;
function check(ok, what, detail) {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Unmodified base bounding boxes at DPR 1 and DPR 2 (recorded on unmodified base commit f9d5cd8e). */
const BASE_BOXES = {
  1: {
    card:       { w: 435.33, h: 45 },
    menu:       { w: 232, h: 201 },
    dialog:     { w: 560, h: 673 },
    facts:      { w: 720, h: 806 },
    pills:      { w: 822, h: 193.5 },
    intentRail: { w: 228, h: 711 },
  },
  2: {
    card:       { w: 435.33, h: 45 },
    menu:       { w: 232, h: 201 },
    dialog:     { w: 560, h: 673 },
    facts:      { w: 720, h: 806 },
    pills:      { w: 822, h: 193.5 },
    intentRail: { w: 228, h: 711 },
  },
};

/* Computed overflow-x, overflow-y, resize, scroll and resize behaviour recorded on engine main f9d5cd8e. */
const MAIN_BEHAVIOUR = {
  card:       { overflowX: "visible", overflowY: "visible", resize: "none", scrolls: false, resizable: false },
  menu:       { overflowX: "visible", overflowY: "visible", resize: "none", scrolls: false, resizable: false },
  dialog:     { overflowX: "hidden",  overflowY: "hidden",  resize: "none", scrolls: true,  resizable: false },
  facts:      { overflowX: "auto",    overflowY: "auto",    resize: "both", scrolls: true,  resizable: true  },
  pills:      { overflowX: "hidden",  overflowY: "hidden",  resize: "none", scrolls: true,  resizable: false },
  intentRail: { overflowX: "hidden",  overflowY: "hidden",  resize: "none", scrolls: true,  resizable: false },
};

function countRuns(vals, dpr, bgOutCount = 3) {
  const sorted = a => [...a].sort((x, y) => x - y);
  const med = a => { const s = sorted(a); return s[Math.floor(s.length / 2)]; };
  const bgOut = med(vals.slice(0, bgOutCount));
  const bgIn = med(vals.slice(-3));
  const base = Math.max(bgOut, bgIn);
  const floor = base + 1.5;
  let first = -1, last = -1;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] > floor) {
      if (first === -1) first = i;
      last = i;
    }
  }
  if (first === -1) return { runs: 0, peak: Math.max(...vals), bgOut, bgIn, seg: [] };
  const seg = vals.slice(first, last + 1);
  const peak = Math.max(...seg);
  if (peak - base < 12) return { runs: 0, peak, bgOut, bgIn, seg };

  let runs = 1;
  let inValley = false;
  for (let i = 1; i < seg.length - 1; i++) {
    const leftMax = Math.max(...seg.slice(0, i));
    const rightMax = Math.max(...seg.slice(i + 1));
    const valley = seg[i] <= leftMax - 2 && seg[i] <= rightMax - 2;
    if (valley && !inValley) {
      runs++;
      inValley = true;
    } else if (!valley) {
      inValley = false;
    }
  }
  if (runs === 1) {
    const shelfCap = bgIn + 0.75 * (peak - bgIn);
    let shelfEnd = 0;
    while (shelfEnd < seg.length && seg[shelfEnd] < shelfCap) shelfEnd++;
    if (shelfEnd >= dpr && shelfEnd < seg.length
        && seg[shelfEnd - 1] >= bgOut + 10
        && seg[shelfEnd] - seg[shelfEnd - 1] >= 14) {
      runs++;
    }
  }
  return {
    runs,
    peak: Math.round(peak * 10) / 10,
    bgOut: Math.round(bgOut * 10) / 10,
    bgIn: Math.round(bgIn * 10) / 10,
    seg: seg.map(x => Math.round(x)),
  };
}

async function bootPage(browser, url, width, height, dpr) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr });
  await page.evaluateOnNewDocument(() => {
    try {
      const base = [
        ["eTourDone_v3", "1"],
        ["eTourInvite_v3", "1"],
        ["eAgent", "Bench Agent"],
        ["eNameAsked", "1"],
        ["eTheme", "dark"],
        ["eRail", "0"],
        ["eRailLock", "0"],
      ];
      for (const [k, v] of base) localStorage.setItem(k, v);
    } catch (e) {}
  });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await require("./launch-wait.js").waitLaunchGone(page, { who: "tests/desk-one-line.mjs" });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  const yes = await page.$("#ecYes");
  if (yes) await page.click("#ecYes");
  await page.waitForFunction(() => document.querySelectorAll("#list .card .txt").length > 0 && !document.getElementById("ecYes"), { timeout: 30000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => { const h = document.getElementById("eFlipHold"); return !!(h && h.sheet && h.sheet.disabled); }, { timeout: 30000 });
  await sleep(300);
  await page.mouse.move(10, 10);
  return page;
}

async function measureSurface(page, selector, opts) {
  const png = await page.screenshot({ captureBeyondViewport: false, encoding: "base64" });
  const raw = await page.evaluate(async (b64, sel, o) => {
    const el = document.querySelector(sel);
    if (!el) return { missing: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const af = getComputedStyle(el, "::after");
    const hostEl = o.ringHost ? document.querySelector(o.ringHost) : null;
    const haf = hostEl ? getComputedStyle(hostEl, "::after") : null;
    const combo = document.getElementById("intentComboWrap");
    const comboR = combo ? combo.getBoundingClientRect().right : 0;

    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const dpr = o.dpr;
    const lumAt = (ix, iy) => {
      const cx = Math.max(0, Math.min(c.width - 1, ix));
      const cy = Math.max(0, Math.min(c.height - 1, iy));
      const d = g.getImageData(cx, cy, 1, 1).data;
      return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
    };
    const lum = (px, py) => lumAt(Math.round(px), Math.round(py));
    const lumBilin = (px, py) => {
      const x = px - 0.5, y = py - 0.5;
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = x - x0, fy = y - y0;
      return (1 - fx) * (1 - fy) * lumAt(x0, y0)
        + fx * (1 - fy) * lumAt(x0 + 1, y0)
        + (1 - fx) * fy * lumAt(x0, y0 + 1)
        + fx * fy * lumAt(x0 + 1, y0 + 1);
    };

    /* 1. Top middle line (avoid #intentComboWrap overlapping #factsPanel left half). */
    let midX = r.left + r.width / 2;
    if (o.avoidCombo && comboR > midX - 20) midX = Math.max(midX, comboR + 16);
    const midLine = [];
    for (let k = -3 * dpr; k <= 5 * dpr; k++) {
      midLine.push(lum(midX * dpr, (r.top + k / dpr) * dpr));
    }

    /* 2. 45-degree corner arc line. */
    const radius = parseFloat(o.corner === "tr" ? cs.borderTopRightRadius : cs.borderTopLeftRadius) || 12;
    const cx = o.corner === "tr" ? r.right - radius : r.left + radius;
    const cy = r.top + radius;
    const dirX = o.corner === "tr" ? 1 : -1;
    const dirY = -1;
    const cornerLine = [];
    const totalSteps = Math.round(5.5 * dpr);
    for (let t = 0; t <= totalSteps; t++) {
      const s = radius + 1.5 - t / dpr;
      const sx = cx + dirX * (s / Math.SQRT2);
      const sy = cy + dirY * (s / Math.SQRT2);
      cornerLine.push(lumBilin(sx * dpr, sy * dpr));
    }

    /* 3. Rim-band brightest pixels (2 CSS px on padded surfaces, 1 CSS px on pills so child
          chips inside padding-less .pills never obscure the border) plus resting side border. */
    const xStart = Math.round((r.left + 16) * dpr);
    const xEnd = Math.round((r.right - 16) * dpr);
    const bandMax = (y0Dev, y1Dev) => {
      let mx = 0;
      for (let py = y0Dev; py <= y1Dev; py++) {
        for (let px = xStart; px <= xEnd; px++) {
          const v = lum(px, py);
          if (v > mx) mx = v;
        }
      }
      return mx;
    };
    const span = (o.bandPx || 2) * dpr;
    const topY0 = Math.round(r.top * dpr);
    const botY1 = Math.round(r.bottom * dpr) - 1;
    const topPeak = bandMax(topY0, topY0 + span - 1);
    const botPeak = bandMax(botY1 - span + 1, botY1);

    const sideSamples = [];
    const yMid0 = Math.round((r.top + r.height * 0.35) * dpr);
    const yMid1 = Math.round((r.top + r.height * 0.65) * dpr);
    const rx0 = Math.floor((r.right - 1) * dpr);
    const rx1 = Math.ceil(r.right * dpr) - 1;
    for (let py = yMid0; py <= yMid1; py++) {
      let rowMx = 0;
      for (let px = rx0; px <= rx1; px++) {
        const v = lum(px, py);
        if (v > rowMx) rowMx = v;
      }
      sideSamples.push(rowMx);
    }
    sideSamples.sort((a, b) => a - b);
    const restSide = sideSamples[Math.floor(sideSamples.length / 2)] || 0;

    let scrollCheck = null;
    if (o.testScroll) {
      const prev = el.scrollTop;
      const filler = document.createElement("div");
      filler.style.cssText = "height:3000px;width:1px;flex:0 0 auto;pointer-events:none";
      el.appendChild(filler);
      el.scrollTop = 120;
      const moved = el.scrollTop;
      filler.remove();
      el.scrollTop = prev;
      scrollCheck = { prev, moved, scrolled: moved > prev };
    }

    let resizeCheck = null;
    if (o.testResize) {
      const prevW = el.style.width, prevH = el.style.height;
      el.style.width = "420px";
      el.style.height = "260px";
      const nr = el.getBoundingClientRect();
      el.style.width = prevW;
      el.style.height = prevH;
      const rr = el.getBoundingClientRect();
      resizeCheck = {
        from: { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 },
        to: { w: Math.round(nr.width * 100) / 100, h: Math.round(nr.height * 100) / 100 },
        restored: { w: Math.round(rr.width * 100) / 100, h: Math.round(rr.height * 100) / 100 },
      };
    }

    return {
      box: { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 },
      css: {
        bw: parseFloat(cs.borderTopWidth),
        radius: parseFloat(cs.borderTopLeftRadius),
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        resize: cs.resize,
        borderColor: cs.borderTopColor,
        bgClip: cs.backgroundClip,
        bgImage: cs.backgroundImage,
        afterTop: parseFloat(af.top),
        afterRight: parseFloat(af.right),
        afterBottom: parseFloat(af.bottom),
        afterLeft: parseFloat(af.left),
        afterRadius: parseFloat(af.borderTopLeftRadius),
        afterContent: af.content,
        hostAfter: haf ? {
          content: haf.content,
          opacity: parseFloat(haf.opacity),
          top: parseFloat(haf.top),
          left: parseFloat(haf.left),
          width: parseFloat(haf.width),
          height: parseFloat(haf.height),
          radius: parseFloat(haf.borderTopLeftRadius),
          bw: parseFloat(haf.borderTopWidth),
          bgClip: haf.backgroundClip,
          bgImage: haf.backgroundImage,
        } : null,
      },
      scrollCheck,
      resizeCheck,
      midLine,
      cornerLine,
      topPeak,
      botPeak,
      restSide,
    };
  }, png, selector, opts);

  if (raw.missing) return raw;
  const mid = countRuns(raw.midLine, opts.dpr, 3);
  const corner = countRuns(raw.cornerLine, opts.dpr, opts.dpr);
  const footRatio = (raw.topPeak - raw.restSide) > 10
    ? (raw.botPeak - raw.restSide) / (raw.topPeak - raw.restSide)
    : 999;
  return {
    box: raw.box,
    css: raw.css,
    scrollCheck: raw.scrollCheck,
    resizeCheck: raw.resizeCheck,
    mid,
    corner,
    topPeak: Math.round(raw.topPeak * 10) / 10,
    botPeak: Math.round(raw.botPeak * 10) / 10,
    restSide: Math.round(raw.restSide * 10) / 10,
    footRatio: Math.round(footRatio * 1000) / 1000,
  };
}

async function captureAllSurfaces(browser, url, dpr) {
  const results = {};

  /* Desk 1400x900: card, menu, dialog, facts */
  const p1 = await bootPage(browser, url, 1400, 900, dpr);
  try {
    await p1.evaluate(() => { document.activeElement?.blur?.(); });
    await sleep(100);
    results.card = await measureSurface(p1, "#list .card:not(.deck):not(.on) .txt", { dpr, corner: "tl" });

    await p1.click("#settingsBtn");
    await p1.waitForSelector("#settingsMenu:not([hidden])", { visible: true, timeout: 10000 });
    await p1.evaluate(() => { document.activeElement?.blur?.(); });
    await p1.mouse.move(10, 10);
    await sleep(300);
    results.menu = await measureSurface(p1, "#settingsMenu", { dpr, corner: "tl" });
    await p1.keyboard.press("Escape");
    await sleep(200);

    await p1.evaluate(() => document.querySelector("#list .card:not(.deck):not(.on) [data-act='edit']").click());
    await p1.waitForSelector(".modal:not([hidden]) .modal-card", { visible: true, timeout: 10000 });
    await p1.evaluate(() => { document.activeElement?.blur?.(); });
    await p1.mouse.move(10, 10);
    await sleep(450);
    results.dialog = await measureSurface(p1, ".modal:not([hidden]) .modal-card", { dpr, corner: "tl", testScroll: true });
    await p1.keyboard.press("Escape");
    await sleep(250);

    await p1.click("#factsBtn");
    await p1.waitForFunction(() => {
      const f = document.getElementById("factsPanel");
      return f && !f.hidden && getComputedStyle(f).opacity === "1";
    }, { timeout: 10000 });
    await p1.evaluate(() => { document.activeElement?.blur?.(); });
    await p1.mouse.move(10, 10);
    await sleep(300);
    results.facts = await measureSurface(p1, "#factsPanel", { dpr, corner: "tl", avoidCombo: true, testScroll: true, testResize: true });
  } finally {
    await p1.close();
  }

  /* Narrow 850x900: hover overflow pills, then hover left edge for peeking intentRail */
  const p2 = await bootPage(browser, url, 850, 900, dpr);
  try {
    await p2.waitForSelector("#pillsSlot.pills-overflow .pills", { timeout: 10000 });
    const pb = await p2.evaluate(() => {
      const r = document.querySelector("#pillsSlot.pills-overflow .pills").getBoundingClientRect();
      return { r: r.right, t: r.top };
    });
    await p2.mouse.move(pb.r - 30, pb.t + 12);
    await p2.waitForFunction(() => {
      const el = document.querySelector("#pillsSlot.pills-overflow .pills");
      const slot = document.querySelector("#pillsSlot.pills-overflow");
      const a = el && getComputedStyle(el, "::after");
      const sa = slot && getComputedStyle(slot, "::after");
      return (a && a.content !== "none" && parseFloat(a.opacity) === 1)
        || (sa && sa.content !== "none" && parseFloat(sa.opacity) === 1);
    }, { timeout: 10000 });
    await sleep(400);
    results.pills = await measureSurface(p2, "#pillsSlot.pills-overflow .pills", {
      dpr, corner: "tr", bandPx: 1, ringHost: "#pillsSlot.pills-overflow", testScroll: true,
    });

    await p2.mouse.move(2, 400);
    await p2.waitForFunction(() => {
      const rail = document.getElementById("intentRail");
      return document.body.classList.contains("rail-peek")
        && !document.body.classList.contains("rail-col")
        && rail && parseFloat(getComputedStyle(rail).opacity) === 1;
    }, { timeout: 10000 });
    const rb = await p2.evaluate(() => {
      const r = document.getElementById("intentRail").getBoundingClientRect();
      return { l: r.left, b: r.bottom };
    });
    await p2.mouse.move(rb.l + 114, rb.b - 25);
    await sleep(350);
    results.intentRail = await measureSurface(p2, "#intentRail", { dpr, corner: "tl", testScroll: true });
  } finally {
    await p2.close();
  }

  return results;
}

function checkRingGeometry(r) {
  const css = r.css;
  const targetInset = -css.bw;
  const eq = (x, y) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 0.15;
  const hasOwnAfter = css.afterContent && css.afterContent !== "none" && css.afterContent !== "normal";
  const hasHostAfter = css.hostAfter && css.hostAfter.content && css.hostAfter.content !== "none" && css.hostAfter.content !== "normal";
  if (hasOwnAfter) {
    return eq(css.afterTop, targetInset)
      && eq(css.afterRight, targetInset)
      && eq(css.afterBottom, targetInset)
      && eq(css.afterLeft, targetInset)
      && eq(css.afterRadius, css.radius);
  }
  if (hasHostAfter) {
    const h = css.hostAfter;
    return h.opacity > 0.5
      && String(h.bgImage).includes("radial-gradient")
      && (String(h.bgClip).includes("border-area") || eq(h.bw, 1))
      && eq(h.top, 0) && eq(h.left, 0)
      && eq(h.width, r.box.w) && eq(h.height, r.box.h)
      && eq(h.radius, css.radius);
  }
  return eq(css.bw, 1)
    && css.borderColor === "rgba(0, 0, 0, 0)"
    && String(css.bgClip).includes("border-area")
    && String(css.bgImage).includes("radial-gradient");
}

function assertScale(dpr, results, mode) {
  const names = ["card", "menu", "dialog", "facts", "pills", "intentRail"];
  const wantBoxes = BASE_BOXES[dpr];
  const caught = [];
  for (const name of names) {
    const r = results[name];
    const b = wantBoxes[name];
    const m = MAIN_BEHAVIOUR[name];
    const tag = `${dpr}x ${name}`;
    if (!r || r.missing) {
      if (mode === "assert") {
        check(false, `${tag} present`, "missing element");
      } else {
        caught.push(name);
      }
      continue;
    }
    const css = r.css;
    const geomOk = checkRingGeometry(r);
    const boxOk = Math.abs(r.box.w - b.w) <= 0.1 && Math.abs(r.box.h - b.h) <= 0.1;
    const midOk = r.mid.runs === 1;
    const cornerOk = r.corner.runs === 1;
    const footOk = r.footRatio <= 0.25 && (r.topPeak - r.restSide) > 10;
    const overflowOk = css.overflowX === m.overflowX && css.overflowY === m.overflowY && css.resize === m.resize;
    const scrollOk = !m.scrolls || !!(r.scrollCheck && r.scrollCheck.scrolled);
    const resizeOk = !m.resizable || !!(r.resizeCheck
      && Math.abs(r.resizeCheck.to.w - 420) <= 0.5
      && Math.abs(r.resizeCheck.to.h - 260) <= 0.5
      && Math.abs(r.resizeCheck.restored.w - r.resizeCheck.from.w) <= 0.5);

    if (mode === "assert") {
      check(geomOk, `${tag} ring box & radius (${css.radius}px)`, { bw: css.bw, afterContent: css.afterContent, afterTop: css.afterTop, afterRadius: css.afterRadius, bgClip: css.bgClip, hostAfter: css.hostAfter });
      check(boxOk, `${tag} bounding box matches base (${b.w}x${b.h})`, r.box);
      check(midOk, `${tag} top-middle pixel line has 1 run`, r.mid);
      check(cornerOk, `${tag} 45deg corner pixel line has 1 run`, r.corner);
      check(footOk, `${tag} foot <= 0.25 of top above side rest (${r.footRatio})`, { topPeak: r.topPeak, botPeak: r.botPeak, restSide: r.restSide, footRatio: r.footRatio });
      check(overflowOk, `${tag} overflow & resize match main (${m.overflowX}/${m.overflowY}/${m.resize})`, { overflowX: css.overflowX, overflowY: css.overflowY, resize: css.resize });
      if (m.scrolls) check(scrollOk, `${tag} scrolls when taller than its box`, r.scrollCheck);
      if (m.resizable) check(resizeOk, `${tag} resize style changes box size`, r.resizeCheck);
    } else if (mode === "plant-rim") {
      if (!geomOk || !cornerOk || !midOk) {
        caught.push({ name, geomOk, midRuns: r.mid.runs, cornerRuns: r.corner.runs, afterTop: css.afterTop, afterRadius: css.afterRadius });
      }
    } else if (mode === "plant-clip") {
      if (!overflowOk || !scrollOk) {
        caught.push({ name, overflowOk, scrollOk, overflowX: css.overflowX, overflowY: css.overflowY, resize: css.resize, scrollCheck: r.scrollCheck });
      }
    }
  }
  return caught;
}

function makePlantedRun() {
  const lab = E.runFolder("catalogV2", "sampleV2");
  const htmlPath = path.join(lab.dir, "etiuda.html");
  const src = fs.readFileSync(htmlPath, "utf8");
  const fiveHead = /(:root:not\(\[data-theme=light\]\) #intentRail::after,[\s\S]*?\.pills-slot\.pills-overflow \.pills::after\{[^}]*?inset:)[^;]+(;[\s\S]*?border-radius:)inherit(;)/;
  const fiveSupports = /(@supports \(background-clip:border-area\)\{[\s\S]*?#intentRail::after,[\s\S]*?\.pills-slot\.pills-overflow \.pills::after\{)inset:[^;]+;/;
  let patched = src.replace(fiveHead, "$10$2calc(var(--radius) - 1px)$3").replace(fiveSupports, "$1");
  if (patched === src) {
    patched = src.replace("<header>",
      "<style id='ePlantRim'>"
      + ":root:not([data-theme=light]) #intentRail,"
      + ":root:not([data-theme=light]) .modal-card,"
      + ":root:not([data-theme=light]) .menu,"
      + ":root:not([data-theme=light]) .facts-panel{"
      + "border-color:var(--line)!important;background-image:none!important}"
      + ":root:not([data-theme=light]) .modal-card,:root:not([data-theme=light]) .menu{background-color:var(--panel-raised)!important}"
      + ":root:not([data-theme=light]) #intentRail,:root:not([data-theme=light]) .facts-panel{background-color:var(--glass-mid,var(--panel-raised))!important}"
      + ":root:not([data-theme=light]) .pills-slot.pills-overflow::after{display:none!important}"
      + ":root:not([data-theme=light]) #intentRail::after,"
      + ":root:not([data-theme=light]) .modal-card::after,"
      + ":root:not([data-theme=light]) .menu::after,"
      + ":root:not([data-theme=light]) .facts-panel::after,"
      + ":root:not([data-theme=light]) .pills-slot.pills-overflow .pills::after{"
      + "content:''!important;position:absolute!important;inset:0!important;"
      + "border-radius:calc(var(--radius) - 1px)!important;padding:1px!important;"
      + "background:var(--rim)!important;background-origin:border-box!important;background-clip:border-box!important;"
      + "border:0!important;pointer-events:none!important;z-index:3!important;opacity:1!important;"
      + "-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0)!important;-webkit-mask-composite:xor!important;"
      + "mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0)!important;mask-composite:exclude!important}"
      + ":root:not([data-theme=light]) .modal-card::after{border-radius:15px!important}"
      + "</style>\n<header>");
  }
  if (patched === src) throw new Error("makePlantedRun: failed to inject rim plant");
  fs.writeFileSync(htmlPath, patched, "utf8");
  return lab;
}

function makeClipPlantedRun() {
  const lab = E.runFolder("catalogV2", "sampleV2");
  const htmlPath = path.join(lab.dir, "etiuda.html");
  const src = fs.readFileSync(htmlPath, "utf8");
  const patched = src.replace("<header>",
    "<style id='ePlantClip'>:root:not([data-theme=light]) .facts-panel{overflow:clip!important;overflow-clip-margin:var(--rim-bw)!important}</style>\n<header>");
  if (patched === src) throw new Error("makeClipPlantedRun: failed to inject overflow:clip plant");
  fs.writeFileSync(htmlPath, patched, "utf8");
  return lab;
}

const RUN = E.runFolder("catalogV2", "sampleV2");
let plantLab = null;
let plantClipLab = null;
let browser = null;
try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  console.log("  engine/etiuda.html sha256 " + RUN.engineSha.slice(0, 12));

  for (const dpr of [1, 2]) {
    const res = await captureAllSurfaces(browser, RUN.url, dpr);
    assertScale(dpr, res, "assert");
  }

  if (PLANTS_OFF) {
    skipped += 3;
    console.log("  NOT RUN plant proof 1x/2x: restoring inset:0 on the five surfaces (ETIUDA_PLANTS=off)");
    console.log("  NOT RUN plant proof 1x: setting overflow:clip on .facts-panel (ETIUDA_PLANTS=off)");
  } else {
    plantLab = makePlantedRun();
    for (const dpr of [1, 2]) {
      const res = await captureAllSurfaces(browser, plantLab.url, dpr);
      const caught = assertScale(dpr, res, "plant-rim");
      const names = caught.map(x => typeof x === "string" ? x : x.name);
      const wantFive = ["menu", "dialog", "facts", "pills", "intentRail"];
      check(wantFive.every(n => names.includes(n)),
        `plant proof ${dpr}x: restoring inset:0 on the five surfaces is caught`, caught);
    }

    plantClipLab = makeClipPlantedRun();
    const pClip = await bootPage(browser, plantClipLab.url, 1400, 900, 1);
    try {
      await pClip.click("#factsBtn");
      await pClip.waitForFunction(() => {
        const f = document.getElementById("factsPanel");
        return f && !f.hidden && getComputedStyle(f).opacity === "1";
      }, { timeout: 10000 });
      await pClip.evaluate(() => { document.activeElement?.blur?.(); });
      await sleep(250);
      const factsRes = await measureSurface(pClip, "#factsPanel", { dpr: 1, corner: "tl", avoidCombo: true, testScroll: true, testResize: true });
      const clipCaught = assertScale(1, { facts: factsRes }, "plant-clip").filter(x => x.name === "facts");
      check(clipCaught.length === 1 && !clipCaught[0].overflowOk && !clipCaught[0].scrollOk,
        "plant proof 1x: setting overflow:clip on .facts-panel turns overflow and scroll checks red", clipCaught);
    } finally {
      await pClip.close();
    }
  }
} catch (e) {
  check(false, "the leg ran to its end", String(e && e.stack || e));
} finally {
  if (browser) await browser.close();
  try { RUN.drop(); } catch (e) {}
  try { if (plantLab) plantLab.drop(); } catch (e) {}
  try { if (plantClipLab) plantClipLab.drop(); } catch (e) {}
}

console.log(`#counts checks=${checks} skipped=${skipped} failed=${fails} expected=${EXPECTED}`);
console.log(`${checks} checks, ${skipped} skipped, ${fails} failed`);
if (checks + skipped !== EXPECTED) process.exit(E.NO_VERDICT);
process.exit(E.exitOf(fails));
