/* The glass rim: a 1px line of light along the top and bottom edges of a macro, the intent panel and a dialog,
 * in the dark themes only, brightest at the top's left and the bottom's right, the sides nearly dark, static.
 *
 *   ETIUDA_FIXTURES=<folder> node tests/glass-rim.js
 *
 * The page is the engine beside the fixtures folder's format 2 catalog, in headless Chrome.
 *
 * WHAT IS MEASURED. Computed style says the ring is painted and the old bevel is off, per theme, on every
 * macro and on the panel and a dialog. The eye's part is pixels: three lone slabs are photographed whole at 1:1
 * and the brightness of each edge row at 30 px from the top-left corner along the top is read against the same
 * distance down the left edge, and the bottom-right corner likewise, each less the edge's resting level.
 * A lit top and bottom and a dark side is the claim, and so is a peak below the first pass's (bdf6120).
 * A 1px line reads thicker the brighter it is, so thickness is read as brightness at both ends of the top and of
 * the bottom (30 px in from each corner): an edge's dimmer end must hold at least 60 per cent of its brighter
 * end, and the top must read as the bottom does, end for end (the bottom-right as the top-left, the bottom-left
 * as the top-right) within 8 per cent. The row profile is read on the same slab as the 1.25 case, at a device
 * pixel ratio of 1 and of 2: one row, no second line under the rim.
 *
 * THE FRACTIONAL RATIOS (125 and 150 per cent displays). A masked ring is not snapped to device pixels, so it split
 * the line over two rows, differently at the top and the bottom, and only where an edge lands between device pixels.
 * The ring is now a real 1px border, which is snapped. Each ratio gets its own headless Chrome with
 * --force-device-scale-factor (the emulated ratio does not snap borders the way a real display does, so it would prove
 * nothing). The slab is photographed whole at the device's own pixels, and at three places along the top and the
 * bottom (30 px in from each end and the middle) the rows are read: the same number of rows above half of the line's
 * own peak at the top and the bottom, and the equivalent width (the rows' brightness above the card, over the peak
 * row, in CSS pixels) within 0.1 of a pixel between them. The control is the previous pass's masked ring injected in
 * the same launch, which must read the two apart. It centres the lone slab whose top or bottom, times the ratio, has
 * a fractional part nearest one half. At 1.25 that same read is also taken at ratios 1 and 2.
 *
 * THE OTHER RAISED SURFACES. The menus, Quick facts, the opened pill bar and the peeking intent panel wear the same ring
 * inside their border and their bevel is off, in dark; in light none of them does. Each is opened in a launch of its own
 * and read twice: computed style (the ring painted, the bevel's bright line gone), and pixels (the bottom edge's right end,
 * 30 px in, against the row 9 px inside it: lit by the rim, darkened by the old bevel's foot, flat with neither). The old
 * look (the ring hidden, the bevel back) is injected in the same launch as the control. The small controls (a pill, a
 * button, the add button, the toast) must paint no ring. A click must reach what is inside each ring: the centre of a
 * leaf inside a macro, a dialog and those four is hit-tested and must resolve inside the surface, not to it.
 *
 * THE CONTROLS, IN THE SAME LAUNCH. The pixel read is run again with the first pass's gradient (360 x 58, peak
 * .92) and with the first draft's (240 x 96, which lit the sides nearly as far): the first pass must read the
 * brighter peak, and the draft the lower ratio, so a read that cannot tell them apart goes red. The previous
 * pass's (9e44127, peak .58 top and .46 bottom, a faint .05 line) must fail the ends and the top-to-bottom reads. The light theme is photographed the same way and must show no lift, which also
 * proves the read sees a ring when there is one.
 *
 * Exit code is the number of failed checks, capped at 63 (E.exitOf), 78 where the run produced no verdict. */
"use strict";
const puppeteer = require("puppeteer-core");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

const EXPECTED = 24;
const D = 30;
const OFF = "rgba(0, 0, 0, 0) 0px 0px 0px 0px";
const ROUND = "radial-gradient(240px 96px at 0 0,rgba(255,255,255,.92),rgba(255,255,255,.26) 38%,transparent 72%),"
  + "radial-gradient(240px 96px at 100% 100%,rgba(255,255,255,.72),rgba(255,255,255,.18) 38%,transparent 72%),"
  + "linear-gradient(rgba(255,255,255,.02),rgba(255,255,255,.02))";
const PASS1 = "radial-gradient(360px 58px at 0 0,rgba(255,255,255,.92),rgba(255,255,255,.26) 38%,transparent 72%),"
  + "radial-gradient(360px 58px at 100% 100%,rgba(255,255,255,.72),rgba(255,255,255,.18) 38%,transparent 72%),"
  + "linear-gradient(rgba(255,255,255,.02),rgba(255,255,255,.02))";
const PASS2 = "radial-gradient(520px 36px at 0 0,rgba(255,255,255,.58),rgba(255,255,255,.2) 40%,transparent 85%),"
  + "radial-gradient(520px 36px at 100% 100%,rgba(255,255,255,.46),rgba(255,255,255,.15) 40%,transparent 85%),"
  + "linear-gradient(rgba(255,255,255,.05),transparent 14px calc(100% - 14px),rgba(255,255,255,.05)),"
  + "linear-gradient(rgba(255,255,255,.02),rgba(255,255,255,.02))";
/* The previous pass's ring (eacc361), forced back over the real border: a 1px padding cut out by a mask, 1px outside the macro. */
const MASKED = ":root:not([data-theme=light]) .txt::after{inset:-1px!important;padding:1px!important;border:0!important;"
  + "background-origin:padding-box!important;background-clip:border-box!important;"
  + "-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0)!important;-webkit-mask-composite:xor!important;"
  + "mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0)!important;mask-composite:exclude!important}";
let b; let fails = 0; let checks = 0; let reachedEnd = false;
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const errs = [];

async function bootAndDismiss(pg, url) {
  await pg.goto(url, { waitUntil: "load", timeout: 90000 });
  await require("./launch-wait.js").waitLaunchGone(pg, { who: "tests/glass-rim.js bootAndDismiss" });
  const press = (rx, sc) => pg.evaluate((r, s) => {
    const el = [...document.querySelectorAll(s + " button")].filter(x => x.offsetWidth > 0)
      .find(x => new RegExp(r, "i").test(x.textContent));
    if (!el) return null;
    el.click();
    return el.textContent.replace(/\s+/g, " ").trim();
  }, rx, sc);
  await pg.waitForFunction(() => document.querySelectorAll(".card").length > 0 || !!document.querySelector("#eCatalogOffer")
    || [...document.querySelectorAll("#tourRoot button")].some(x => x.offsetWidth > 0), { timeout: 30000 }).catch(() => {});
  for (const [sc, rx, n] of [["#tourRoot", "skip|not now|close|pomi", 1],
                             ["#eCatalogOffer", "^(load|yes|tak)([^a-z]|$)|load it|load the catalog|sample catalog|update", 4],
                             ["#tourRoot", "skip|not now|close|pomi", 3]]) {
    if (sc === "#eCatalogOffer") await pg.waitForSelector(sc, { timeout: 2500 }).catch(() => {});
    for (let i = 0; i < n; i++) { if (!(await press(rx, sc))) break; await sleep(1200); }
  }
  await pg.keyboard.press("Escape");
  await pg.waitForFunction(() => document.querySelectorAll(".txt").length > 0, { timeout: 30000 });
  await pg.evaluate(() => { const m = document.getElementById("eAgentModal"); if (m) m.remove(); });
  await sleep(800);
}

/* The theme is set on the root as the boot script does, with every transition off so a read never lands
   mid-crossfade; the same call clears the first-run clutter that would sit over the card. */
const setTheme = (pg, t) => pg.evaluate(async theme => {
  if (!document.getElementById("rimProbeStill")) {
    const s = document.createElement("style");
    s.id = "rimProbeStill";
    s.textContent = "*,*::before{transition:none!important;animation:none!important}"
      + ".txt::before{display:none!important}.txt{color:transparent!important}";
    document.head.appendChild(s);
  }
  document.documentElement.setAttribute("data-theme", theme);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}, t);

/* The surfaces' computed style: the ring's pseudo and the shadow that carried the bevel. */
const styles = (pg, sel) => pg.evaluate(s => [...document.querySelectorAll(s)].map(el => {
  const a = getComputedStyle(el, "::after"), c = getComputedStyle(el);
  return { rim: a.content !== "none" && a.content !== "normal", pos: a.position,
           bg: a.backgroundImage, shadow: c.boxShadow };
}), sel);

/* A lone slab is the only macro on its card, the first reply, not a tucked deck reply, and in the first column.
   The first column is the column box at the list's left edge. A list that has no columns is that one column.
   The height floor is the pixel leg's own (at least 70). Off-screen cards report a stand-in size until measured. */
async function loneSlabs(pg) {
  return pg.evaluate(async () => {
    document.querySelectorAll("[data-rim-ord]").forEach(x => x.removeAttribute("data-rim-ord"));
    for (const e of document.querySelectorAll(".txt")) void e.offsetHeight;
    const cols = [...document.querySelectorAll("#list > .col")];
    const left0 = cols.length ? Math.min(...cols.map(c => c.offsetLeft)) : 0;
    let otherCol = 0, otherTall = 0;
    const found = [...document.querySelectorAll("#list .txt")].filter(e => {
      if (e.classList.contains("deck-back") || e.getAttribute("data-v") !== "0") return false;
      const card = e.closest(".card");
      if (!card || card.querySelectorAll(".txt").length !== 1) return false;
      if (e.offsetHeight < 70) return false;
      if (!cols.length) return true;
      const col = card.closest(".col");
      const inFirst = !!col && Math.abs(col.offsetLeft - left0) <= 1;
      if (!inFirst) { otherCol++; if (e.offsetHeight > otherTall) otherTall = e.offsetHeight; return false; }
      return true;
    });
    const placed = [];
    for (let i = 0; i < found.length; i++) {
      const el = found[i];
      let q = null, h = 0, wholly = false;
      for (let go = 0; go < 4 && !wholly; go++) {
        el.scrollIntoView({ block: "center" });
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        q = el.getBoundingClientRect();
        h = el.offsetHeight;
        wholly = h >= 70 && q.top > 60 && q.bottom < innerHeight - 40;
      }
      if (!wholly) continue;
      el.setAttribute("data-rim-ord", String(i));
      placed.push({ ord: i, h: h, top: q.top, bottom: q.bottom, w: Math.round(q.width) });
    }
    placed.sort((a, b) => (a.h - b.h) || (a.ord - b.ord));
    return { seen: found.length, placed: placed, otherCol: otherCol, otherTall: otherTall };
  });
}

/* Shortest, lower median, tallest. The lower median is the earlier of the two central slabs when the count is even. */
function threeSlabs(packed) {
  const rows = packed && packed.placed;
  if (!rows || rows.length < 3) return null;
  const mid = Math.floor((rows.length - 1) / 2);
  return [rows[0], rows[mid], rows[rows.length - 1]];
}

/* Fractional part of an edge in device pixels, and how near it is to the half pixel where a masked ring splits. */
function fracPart(edge, ratio) {
  const x = edge * ratio;
  return x - Math.floor(x);
}
function halfEdge(row, ratio) {
  let best = null;
  for (const which of ["top", "bottom"]) {
    const frac = fracPart(row[which], ratio);
    const dist = Math.abs(frac - 0.5);
    if (!best || dist < best.dist) best = { which: which, frac: frac, dist: dist };
  }
  return best;
}
function splitSlab(rows, ratio) {
  let best = null;
  for (const row of rows) {
    const edge = halfEdge(row, ratio);
    const cand = { ord: row.ord, h: row.h, which: edge.which, frac: edge.frac, dist: edge.dist };
    if (!best || cand.dist < best.dist - 1e-9 || (Math.abs(cand.dist - best.dist) <= 1e-9 && cand.ord < best.ord)) best = cand;
  }
  return best;
}

async function markSlab(pg, ord) {
  const ok = await pg.evaluate(ord => {
    document.querySelectorAll("[data-rim-probe]").forEach(x => x.removeAttribute("data-rim-probe"));
    const el = document.querySelector('#list .txt[data-rim-ord="' + ord + '"]');
    if (!el) return false;
    el.setAttribute("data-rim-probe", "1");
    return true;
  }, ord);
  if (!ok) throw new Error("the marked slab is not on the page");
}

/* The list lays out lazily, so one scroll can land short: bring the marked slab to the middle again until it is
   wholly in the window and its box has held still for ten frames. */
async function settle(pg) {
  const inView = await pg.evaluate(async () => {
    const el = document.querySelector("[data-rim-probe]");
    if (!el) return false;
    for (let go = 0; go < 8; go++) {
      el.scrollIntoView({ block: "center" });
      let last = "", same = 0;
      while (same < 10) {
        await new Promise(r => requestAnimationFrame(r));
        const q = el.getBoundingClientRect(), now = q.left + "," + q.top;
        same = now === last ? same + 1 : 0;
        last = now;
      }
      const q = el.getBoundingClientRect();
      if (q.top > 60 && q.bottom < innerHeight - 40) return true;
    }
    return false;
  });
  if (!inView) throw new Error("the macro never came wholly into the window");
}

/* captureBeyondViewport is off because a clipped shot that resizes the page moves a lazily laid list
   under the very rectangle it was asked for.

   Edge-row brightness, 1:1: the red channel of the border row at D px along the top, and of the border
   column at D px down the left side, each less the resting level read at the left edge's middle. The box is
   whole pixels (the macro is laid on the pixel grid) and the read says if it was not. */
async function lift(pg) {
  await settle(pg);
  const r = await pg.evaluate(() => {
    const el = document.querySelector("[data-rim-probe]");
    const q = el.getBoundingClientRect();
    return { x: q.left, y: q.top, w: q.width, h: q.height };
  });
  const x0 = Math.round(r.x), y0 = Math.round(r.y);
  const png = await pg.screenshot({ clip: { x: x0 - 2, y: y0 - 2, width: Math.round(r.w) + 4, height: Math.round(r.h) + 4 }, captureBeyondViewport: false, encoding: "base64" });
  const read = await pg.evaluate(async (b64, h, w, d) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const px = (x, y) => g.getImageData(x, y, 1, 1).data[0];
    const W = Math.round(w), H = Math.round(h);
    return { top: px(2 + d, 2), side: px(2, 2 + d), rest: px(2, 2 + Math.round(h / 2)),
             peak: Math.max(px(2 + 10, 2), px(2 + 20, 2), px(2 + 30, 2)),
             far: px(2 + 120, 2), mid: px(2 + Math.round(w / 2), 2),
             bot: px(W + 1 - d, H + 1), bside: px(W + 1, H + 1 - d),
             tr: px(W + 1 - d, 2), bl: px(2 + d, H + 1) };
  }, png, r.h, r.w, D);
  const L = k => read[k] - read.rest;
  return { top: L("top"), side: L("side"), rest: read.rest, peak: L("peak"), far: L("far"), mid: L("mid"),
           bot: L("bot"), bside: L("bside"), tr: L("tr"), bl: L("bl"),
           whole: Math.abs(r.x - x0) < 0.01 && Math.abs(r.y - y0) < 0.01, h: r.h, y: r.y };
}

/* The rows across the top edge and the bottom edge of the probe macro at the device's own pixels: the whole window is
   photographed (no clip to round), the edge rows are the box's rounded top and bottom, and at three places along each
   the red channel is read from outside to inside (top) and inside to outside (bottom). The card's own level inside is
   the rest; the page outside is darker than it, so only brightness above the rest counts. rows: those above half the
   line's peak; width: all of it over the peak row, in CSS pixels (a device pixel is 1 / ratio of one). */
async function edgeRows(pg, ratio) {
  await settle(pg);
  const r = await pg.evaluate(() => {
    const q = document.querySelector("[data-rim-probe]").getBoundingClientRect();
    return { t: q.top, b: q.bottom, l: q.left, r: q.right };
  });
  const png = await pg.screenshot({ captureBeyondViewport: false, encoding: "base64" });
  return pg.evaluate(async (b64, r, d, dist) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const px = (x, y) => g.getImageData(x, y, 1, 1).data[0];
    const topRow = Math.round(r.t * d), botRow = Math.round(r.b * d) - 1, span = Math.ceil(2 * d) + 2;
    const xs = [Math.round((r.l + dist) * d), Math.round((r.l + r.r) / 2 * d), Math.round((r.r - dist) * d)];
    const read = (x, y0, dy) => {
      const a = [];
      for (let i = -span; i <= span; i++) a.push(px(x, y0 + dy * i));   /* i < 0 is outside the card, i >= 0 inside */
      const rest = a[a.length - 1];
      const e = a.map(v => Math.max(0, v - rest));
      const peak = Math.max(...e);
      return { peak, rows: e.filter(v => v > 0 && v >= peak / 2).length, width: e.reduce((p, q) => p + q, 0) / Math.max(peak, 1) / d };
    };
    return { ratio: d, top: xs.map(x => read(x, topRow, 1)), bot: xs.map(x => read(x, botRow, -1)) };
  }, png, r, ratio, D);
}
const edgeLine = e => "top rows " + e.top.map(x => x.rows).join("/") + " widths " + e.top.map(x => x.width.toFixed(2)).join("/")
  + ", bottom rows " + e.bot.map(x => x.rows).join("/") + " widths " + e.bot.map(x => x.width.toFixed(2)).join("/") + " (CSS px, ends and middle)";
/* One row at the top and one at the bottom, both as wide as each other, at every place read. */
const sameRows = e => e.top.every((t, i) => t.peak >= 30 && e.bot[i].peak >= 30 && t.rows === e.bot[i].rows && t.rows === 1
  && Math.abs(t.width - e.bot[i].width) <= 0.1);
/* The previous ring is seen apart when any place has a different number of rows or a width gap past two tenths. */
const seenApart = e => e.top.some((t, i) => t.rows !== e.bot[i].rows || Math.abs(t.width - e.bot[i].width) > 0.2);

/* A launch of its own at a real device pixel ratio, the page booted the way the main read is.
   "masked" photographs the real ring and then the masked ring, on the slab whose edge at this ratio is nearest a half pixel.
   "real" photographs the real ring only, on the slab chosen by that same rule at 1.25, which is the control's slab. */
async function atRatio(ratio, mode) {
  const RUN2 = E.runFolder("catalogV2", "sampleV2");
  let b2;
  try {
    b2 = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, defaultViewport: null,
      args: ["--hide-scrollbars", "--force-device-scale-factor=" + ratio, "--window-size=1500,950"], protocolTimeout: 120000 });
    const q = await b2.newPage();
    q.on("dialog", d => d.accept());
    await bootAndDismiss(q, RUN2.url);
    await setTheme(q, "dark");
    const packed = await loneSlabs(q);
    const pickAt = mode === "real" ? 1.25 : ratio;
    const best = splitSlab(packed.placed, pickAt);
    if (!best) throw new Error("no lone slab wholly in the window at ratio " + ratio);
    console.log("       ratio " + ratio + ", " + packed.placed.length + " lone slabs wholly in the window (" + packed.seen + " centred), pick at "
      + pickAt + ": " + best.h + " px, " + best.which + " fractional part " + best.frac.toFixed(3) + " (distance " + best.dist.toFixed(3) + ")");
    await markSlab(q, best.ord);
    const dpr = await q.evaluate(() => devicePixelRatio);
    const now = await edgeRows(q, dpr);
    const photo = await q.evaluate(() => {
      const r = document.querySelector("[data-rim-probe]").getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, h: r.height };
    });
    const photoFrac = fracPart(photo[best.which], pickAt);
    console.log("       ratio " + ratio + " photographed " + Math.round(photo.h) + " px, " + best.which + " times " + pickAt
      + " fractional part " + photoFrac.toFixed(3));
    let old = null;
    if (mode !== "real") {
      await q.addStyleTag({ content: MASKED });
      await setTheme(q, "dark");
      old = await edgeRows(q, dpr);
    }
    return { dpr, now, old, best, photoFrac, photoH: photo.h };
  } finally {
    try { if (b2) await b2.close(); } catch (x) {}
    RUN2.drop();
  }
}

/* The other raised surfaces. Each is opened, then read: the ring's pseudo and the shadow, and the bottom edge's right end
   (30 px in) less the row 9 px inside it, at 1:1 in the page's own pixels. The reads are named by the surface. */
const OLD_BEVEL = "inset 0 1px 0 rgba(255,255,255,.16),inset 0 -1px 0 rgba(0,0,0,.38),inset 1px 0 0 rgba(255,255,255,.05)";
const OLD_LOOK = ":root:not([data-theme=light]) .menu::after,:root:not([data-theme=light]) .facts-panel::after,"
  + ":root:not([data-theme=light]) .pills-slot.pills-overflow .pills::after,:root:not([data-theme=light]) #intentRail::after{display:none!important}"
  + ":root:not([data-theme=light]) .facts-panel,:root:not([data-theme=light]) .pills-slot.pills-overflow .pills{--bevel:" + OLD_BEVEL + "!important}";
const RAISED = [["menu", "#settingsMenu"], ["facts", "#factsPanel"], ["pills", "#pills"], ["peek", "#intentRail"]];

/* A click passes through the ring: the centre of a leaf inside the surface must resolve to something inside it. A ring that
   takes pointer events lands the point on the surface itself, since a pseudo-element's box answers for its element. */
const hitThrough = (pg, sel) => pg.evaluate(sel => {
  const inView = e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && q.left >= 0 && q.top >= 0 && q.right <= innerWidth && q.bottom <= innerHeight; };
  const el = [...document.querySelectorAll(sel)].find(inView);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const child = [...el.querySelectorAll("*")].find(c => {
    if (c.children.length || getComputedStyle(c).pointerEvents === "none") return false;
    const q = c.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2;
    return q.width >= 6 && q.height >= 6 && x > r.left && x < r.right && y > r.top && y < r.bottom && x < innerWidth && y < innerHeight;
  });
  if (!child) return { ok: false, child: "no leaf to aim at", hit: "-" };
  const q = child.getBoundingClientRect(), hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
  return { ok: !!hit && hit !== el && el.contains(hit), child: child.tagName.toLowerCase(),
           hit: hit ? hit.tagName.toLowerCase() + (hit === el ? " (the surface itself)" : "") : "nothing" };
}, sel);

const surfaceRead = (pg, sel) => pg.evaluate(async sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const a = getComputedStyle(el, "::after"), q = el.getBoundingClientRect();
  return { rim: a.content !== "none" && a.content !== "normal" && +a.opacity > 0.5, bg: a.backgroundImage,
           shadow: getComputedStyle(el).boxShadow, x: q.left, y: q.top, w: q.width, h: q.height };
}, sel);

async function surfaceLift(pg, r) {
  const png = await pg.screenshot({ captureBeyondViewport: false, encoding: "base64" });
  return pg.evaluate(async (b64, r, d) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const px = (x, y) => g.getImageData(x, y, 1, 1).data[0];
    /* A box that is not on the pixel grid ends between two rows, so the ring is the brightest of the last three. */
    const x = Math.round(r.x + r.w) - d, y = Math.round(r.y + r.h) - 1;
    return Math.max(px(x, y), px(x, y - 1), px(x, y - 2)) - px(x, y - 9);
  }, png, r, D);
}

/* Open one surface, read it, put it away. The peek needs a window too narrow to dock the panel. */
async function openAndRead(pg, name, sel, lift) {
  if (name === "menu") { await pg.click("#settingsBtn"); await sleep(900); }
  else if (name === "facts") { await pg.click("#factsBtn"); await sleep(900); }
  else if (name === "pills") {
    const b = await pg.evaluate(() => { const q = document.getElementById("pills").getBoundingClientRect(); return { x: q.left + 40, y: q.top + 10 }; });
    await pg.mouse.move(b.x, b.y); await sleep(1400);
  } else if (name === "peek") {
    await pg.setViewport({ width: 760, height: 900, deviceScaleFactor: 1 }); await sleep(1200);
    await pg.mouse.move(2, 400); await sleep(1400);
  }
  const r = await surfaceRead(pg, sel);
  if (r && lift) { r.hit = await hitThrough(pg, sel); r.lift = await surfaceLift(pg, r); }
  if (name === "menu") await pg.keyboard.press("Escape");
  else if (name === "facts") await pg.evaluate(() => { const b = document.getElementById("factsBtn"); if (b.getAttribute("aria-expanded") === "true") b.click(); });
  else if (name === "pills") await pg.mouse.move(700, 700);
  else if (name === "peek") { await pg.mouse.move(700, 700); await pg.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1 }); }
  await sleep(900);
  return r;
}

async function surfaces() {
  const RUN3 = E.runFolder("catalogV2", "sampleV2");
  let b3;
  try {
    b3 = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
    const q = await b3.newPage();
    await q.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1 });
    q.on("dialog", d => d.accept());
    await bootAndDismiss(q, RUN3.url);
    const out = { dark: {}, old: {}, light: {}, small: [] };
    await setTheme(q, "dark");
    for (const [n, sel] of RAISED) out.dark[n] = await openAndRead(q, n, sel, true);
    out.small = await q.evaluate(() => [".pill", ".btn", "#addCardFab", "#toast", ".seg button"].map(s => {
      const el = [...document.querySelectorAll(s)].find(e => e.offsetWidth > 0) || document.querySelector(s);
      const a = el && getComputedStyle(el, "::after");
      return { s, rim: !!a && a.content !== "none" && a.content !== "normal" && (a.backgroundImage.match(/radial-gradient/g) || []).length === 2 };
    }));
    await q.addStyleTag({ content: OLD_LOOK });
    await setTheme(q, "dark");
    for (const [n, sel] of RAISED) out.old[n] = await openAndRead(q, n, sel, true);
    await setTheme(q, "light");
    for (const [n, sel] of RAISED) out.light[n] = await openAndRead(q, n, sel, false);
    return out;
  } finally {
    try { if (b3) await b3.close(); } catch (x) {}
    RUN3.drop();
  }
}
const liftLine = o => RAISED.map(([n]) => n + " " + (o[n] ? o[n].lift + " [" + Math.round(o[n].x) + "," + Math.round(o[n].y) + " " + Math.round(o[n].w) + "x" + Math.round(o[n].h) + "]" : "none")).join(", ");

/* The thickness reads: each edge's dimmer end against its brighter, and the top against the bottom end for end. */
const ends = m => ({
  topRatio: Math.min(m.top, m.tr) / Math.max(m.top, m.tr, 1),
  botRatio: Math.min(m.bot, m.bl) / Math.max(m.bot, m.bl, 1),
  tbGap: Math.max(Math.abs(m.top - m.bot) / Math.max(m.top, m.bot, 1), Math.abs(m.tr - m.bl) / Math.max(m.tr, m.bl, 1)) });
const endsLine = (m, e) => "top " + m.top + " and " + m.tr + " (ratio " + e.topRatio.toFixed(2) + "), bottom " + m.bot + " and " + m.bl
  + " (ratio " + e.botRatio.toFixed(2) + "), top against bottom end for end differ by " + (100 * e.tbGap).toFixed(1) + " per cent";
const liftLog = (label, m) => console.log("       " + label + ", " + D + " px from the corner, less the edge at rest (" + m.rest + "): top " + m.top + ", side " + m.side
  + ", peak (best of 10, 20, 30 px) " + m.peak + ", top at 120 px " + m.far + ", top at the middle " + m.mid
  + ", bottom " + m.bot + ", right side " + m.bside + ", macro " + Math.round(m.h) + " px high, top edge " + m.y.toFixed(3) + ", grid " + m.whole);
const slabVerdict = (ms, pred) => ms.length === 3
  ? ms.map(m => Math.round(m.h) + " px " + (pred(m) ? "held" : "red")).join(", ")
  : "no three slabs";
const pairVerdict = (darks, others, pred) => (darks.length === 3 && others.length === 3)
  ? darks.map((m, i) => Math.round(m.h) + " px " + (pred(m, others[i]) ? "held" : "red")).join(", ")
  : "no three slabs";
async function readMarked(pg, three, label) {
  const out = [];
  for (const s of three) {
    await markSlab(pg, s.ord);
    const m = await lift(pg);
    out.push(m);
    liftLog(label + ", slab " + Math.round(m.h) + " px", m);
  }
  return out;
}

(async () => {
  const RUN = E.runFolder("catalogV2", "sampleV2");
  try {
    b = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
    const p = await b.newPage();
    await p.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1 });
    p.on("dialog", d => d.accept());
    p.on("pageerror", e => errs.push("pageerror: " + String(e.message || e)));
    p.on("console", m => { if (m.type() === "error" && !/ERR_FILE_NOT_FOUND/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });
    await bootAndDismiss(p, RUN.url);
    console.log("  engine/etiuda.html sha256 " + RUN.engineSha.slice(0, 12) + ", " + await p.evaluate(() => document.querySelectorAll(".txt").length) + " macros");

    await setTheme(p, "dark");
    const dk = await styles(p, ".txt");
    check(dk.length >= 10 && dk.every(s => s.rim && s.pos === "absolute" && (s.bg.match(/radial-gradient/g) || []).length === 2),
      "9gr1 dark: every macro (" + dk.length + ") paints the rim, two radial catches on a ring");
    check(dk.length >= 10 && dk.every(s => s.shadow === OFF),
      "9gr2 dark: the macro's bevel is off wherever the rim is on");

    const hitMacro = await hitThrough(p, ".txt");
    const rail = (await styles(p, "#intentRail"))[0];
    check(!!rail && rail.rim && rail.pos === "absolute" && !/255, 255, 255, 0\.16/.test(rail.shadow),
      "9gr3 dark: the intent panel paints the rim and its bevel's bright line is off");

    await p.click("#settingsBtn");
    await p.evaluate(() => [...document.querySelectorAll("#settingsMenu button")].find(x => /^settings/i.test(x.textContent.trim())).click());
    await p.waitForSelector(".modal:not([hidden]) .modal-card", { visible: true, timeout: 10000 }).catch(() => {});
    await sleep(600);
    const dlg = await p.evaluate(() => {
      const card = document.querySelector(".modal:not([hidden]) .modal-card");
      if (!card) return null;
      const a = getComputedStyle(card, "::after");
      return { rim: a.content !== "none" && a.content !== "normal", pos: a.position, w: card.offsetWidth, h: card.offsetHeight };
    });
    const hitDialog = await hitThrough(p, ".modal:not([hidden]) .modal-card");
    await p.keyboard.press("Escape");
    await p.waitForFunction(() => !document.querySelector(".modal:not([hidden])"), { timeout: 10000 }).catch(() => {});
    await sleep(600);
    check(!!dlg && dlg.rim && dlg.pos === "absolute" && dlg.w > 200 && dlg.h > 100,
      "9gr4 dark: a dialog, open (" + (dlg && dlg.w) + " x " + (dlg && dlg.h) + "), paints the rim");

    const packed = await loneSlabs(p);
    const three = threeSlabs(packed);
    console.log("       lone slabs in the first column, at least 70 px, wholly in the window after centring: "
      + packed.placed.length + " of " + packed.seen + "; other columns " + packed.otherCol + ", tallest there " + packed.otherTall + " px");
    console.log("       picks, shortest, lower median, tallest: " + (three ? three.map(s => s.h + " px (top " + s.top.toFixed(3) + ")").join(", ") : "fewer than three"));
    let darks = [];
    if (three) darks = await readMarked(p, three, "dark");
    for (const m of darks) console.log("       the line's ends, slab " + Math.round(m.h) + " px, brightness above rest: " + endsLine(m, ends(m)));
    const mine = darks[1] || { top: 0, side: 1, peak: 0 };
    const pred5 = m => m.whole && m.h >= 70 && m.top >= 50 && m.top >= 4 * Math.max(m.side, 1);
    const pred10 = m => m.bot >= 40 && m.bot >= 4 * Math.max(m.bside, 1) && m.far >= 10 && m.mid >= 4;
    const pred12 = m => { const e = ends(m); return m.whole && e.topRatio >= 0.6 && e.botRatio >= 0.6; };
    const pred13 = m => { const e = ends(m); return m.whole && e.tbGap <= 0.08; };
    check(darks.length === 3 && darks.every(pred5),
      "9gr5 dark: along the top the rim is at least 50 and at least four times its brightness down the side, at " + D + " px, on " + slabVerdict(darks, pred5));
    check(darks.length === 3 && darks.every(pred10),
      "9gr10 dark: the bottom's right is lit and its side dark likewise, and the line holds along the top (120 px, middle), on " + slabVerdict(darks, pred10));
    check(darks.length === 3 && darks.every(pred12),
      "9gr12 dark: along the top and along the bottom the dimmer end holds at least 60 per cent of the brighter, so the line reads as one thickness, on " + slabVerdict(darks, pred12));
    check(darks.length === 3 && darks.every(pred13),
      "9gr13 dark: the top line reads as the bottom line does, end for end, within 8 per cent, on " + slabVerdict(darks, pred13));

    await p.addStyleTag({ content: ":root:not([data-theme=light]){--rim:" + PASS1 + "!important}" });
    await setTheme(p, "dark");
    let pass1 = null;
    if (three) {
      await markSlab(p, three[1].ord);
      pass1 = await lift(p);
      console.log("       dark with the first pass's gradient (bdf6120), slab " + Math.round(pass1.h) + " px: top " + pass1.top + ", side " + pass1.side + ", peak " + pass1.peak);
    }
    check(!!pass1 && pass1.peak > 100 && mine.peak <= 0.75 * pass1.peak && mine.peak >= 0.25 * pass1.peak,
      "9gr11 dark: the peak (" + mine.peak + ") is quieter than the first pass's (" + (pass1 ? pass1.peak : "none") + "), at most three quarters of it, and still a line");
    await p.addStyleTag({ content: ":root:not([data-theme=light]){--rim:" + ROUND + "!important}" });
    await setTheme(p, "dark");
    const rounds = three ? await readMarked(p, three, "dark with the first draft's 240 x 96 catch") : [];
    const predGR5 = (mine, round) => round.top > 0 && mine.top / Math.max(mine.side, 1) >= 1.5 * (round.top / Math.max(round.side, 1));
    check(darks.length === 3 && rounds.length === 3 && darks.every((m, i) => predGR5(m, rounds[i])),
      "9GR5 control: the first draft's round catch gives a ratio at most two thirds of the tilted one's, on " + pairVerdict(darks, rounds, predGR5));

    await p.addStyleTag({ content: ":root:not([data-theme=light]){--rim:" + PASS2 + "!important}" });
    await setTheme(p, "dark");
    const pass2s = three ? await readMarked(p, three, "dark with the previous pass's gradient (9e44127)") : [];
    for (const m of pass2s) console.log("       previous pass, slab " + Math.round(m.h) + " px: " + endsLine(m, ends(m)));
    const predGR12 = (mine, pass2) => {
      const e2 = ends(pass2), eMine = ends(mine);
      return e2.topRatio < 0.5 && e2.botRatio < 0.5 && e2.tbGap > 0.08 && eMine.tbGap < e2.tbGap;
    };
    check(darks.length === 3 && pass2s.length === 3 && darks.every((m, i) => predGR12(m, pass2s[i])),
      "9GR12 control: the previous pass's gradient fails both reads (ends under half, top and bottom apart), so they can tell it from this one, on " + pairVerdict(darks, pass2s, predGR12));

    const f125 = await atRatio(1.25, "masked");
    const f1 = await atRatio(1, "real");
    const f2 = await atRatio(2, "real");
    console.log("       ratio " + f125.dpr + ", this ring: " + edgeLine(f125.now));
    console.log("       ratio " + f125.dpr + ", the masked ring (eacc361): " + edgeLine(f125.old));
    console.log("       ratio " + f1.dpr + ", this ring: " + edgeLine(f1.now));
    console.log("       ratio " + f2.dpr + ", this ring: " + edgeLine(f2.now));
    check(f125.dpr === 1.25 && sameRows(f125.now) && f1.dpr === 1 && sameRows(f1.now) && f2.dpr === 2 && sameRows(f2.now),
      "9gr14 dark at a device pixel ratio of 1.25: the top and the bottom line are one row each, as wide as each other (within 0.1 px) at both ends and the middle, on the "
      + Math.round(f125.photoH) + " px slab (fractional part " + f125.photoFrac.toFixed(3) + "), and at ratios 1 (" + Math.round(f1.photoH) + " px) and 2 (" + Math.round(f2.photoH) + " px)");
    check(f125.dpr === 1.25 && seenApart(f125.old),
      "9GR14 control at 1.25: the masked ring of eacc361 reads the top and the bottom apart, so the read can tell it from this one, on the "
      + Math.round(f125.photoH) + " px slab whose " + f125.best.which + " times 1.25 has fractional part " + f125.photoFrac.toFixed(3));
    const f150 = await atRatio(1.5, "masked");
    console.log("       ratio " + f150.dpr + ", this ring: " + edgeLine(f150.now));
    console.log("       ratio " + f150.dpr + ", the masked ring (eacc361): " + edgeLine(f150.old));
    check(f150.dpr === 1.5 && sameRows(f150.now),
      "9gr15 dark at a device pixel ratio of 1.5: the top and the bottom line are one row each, as wide as each other (within 0.1 px) at both ends and the middle, on the "
      + Math.round(f150.photoH) + " px slab");
    check(f150.dpr === 1.5 && seenApart(f150.old),
      "9GR15 control at 1.5: the masked ring of eacc361 reads the top and the bottom apart, so the read can tell it from this one, on the "
      + Math.round(f150.photoH) + " px slab whose " + f150.best.which + " times 1.5 has fractional part " + f150.photoFrac.toFixed(3));

    const sf = await surfaces();
    const names = RAISED.map(([n]) => n);
    console.log("       dark, the bottom edge's right end less the row 9 px inside: " + liftLine(sf.dark));
    console.log("       dark with the old look injected (ring hidden, bevel back): " + liftLine(sf.old));
    check(names.every(n => sf.dark[n] && sf.dark[n].rim && (sf.dark[n].bg.match(/radial-gradient/g) || []).length === 2
        && !/255, 255, 255, 0\.16\) 0px 1px 0px 0px inset/.test(sf.dark[n].shadow)),
      "9gr16 dark: the menu, Quick facts, the opened pill bar and the peeking intent panel each paint the ring, and the bevel's bright top line is off");
    check(names.every(n => sf.dark[n] && sf.dark[n].lift >= 40),
      "9gr17 dark: at the right end of the bottom edge of each of those four the rim lifts the row at least 40 above the row 9 px inside it");
    check(names.every(n => sf.old[n] && sf.old[n].lift < 20) && names.every(n => sf.dark[n] && sf.old[n] && sf.dark[n].lift - sf.old[n].lift >= 40),
      "9GR17 control: with the ring hidden and the old bevel back the same read is under 20 on each, at least 40 below this one's, so it can tell the old look from the new");
    check(names.every(n => sf.light[n] && !sf.light[n].rim) && sf.light.facts && /255, 255, 255\)/.test(sf.light.facts.shadow),
      "9gr18 light: none of the four paints the ring, and Quick facts keeps its bevel");
    check(sf.small.length === 5 && sf.small.every(x => !x.rim),
      "9gr19 dark: a pill, a button, the add button, the toast and a switch's button paint no ring (" + sf.small.map(x => x.s).join(" ") + ")");
    const hits = [["a macro", hitMacro], ["a dialog", hitDialog], ...RAISED.map(([n]) => [n, sf.dark[n] && sf.dark[n].hit])];
    check(hits.every(([, h]) => h && h.ok),
      "9gr20 dark: the centre of a leaf inside each rimmed surface resolves inside it, so a click passes through the ring ("
      + hits.map(([n, h]) => n + ": " + (h ? h.child + " to " + h.hit : "not found")).join(", ") + ")");

    await setTheme(p, "light");
    const lt = await styles(p, ".txt");
    const lrail = (await styles(p, "#intentRail"))[0];
    check(lt.length >= 10 && lt.every(s => !s.rim && s.shadow !== OFF) && !!lrail && !lrail.rim && /255, 255, 255\)/.test(lrail.shadow),
      "9gr6 light: no macro and no panel paints the rim, and their bevel and lift stand as before");
    let lit = { top: 99, side: 99 };
    if (three) { await markSlab(p, three[1].ord); lit = await lift(p); }
    console.log("       light: top " + lit.top + ", side " + lit.side);
    check(lit.top < 10 && lit.side < 10,
      "9gr7 light: no lift along the top or the side, the read that saw " + mine.top + " in dark");
    await setTheme(p, "dark");
    check(errs.length === 0, "9gr8 the page raised no errors" + (errs.length ? " - " + errs.join(" | ") : ""));
    reachedEnd = true;
  } catch (e) {
    check(false, "9gr9 the run reached its end - " + String(e && e.stack || e).slice(0, 300));
  } finally {
    try { if (b) await b.close(); } catch (x) {}
    RUN.drop();
  }
  const declared = checks === EXPECTED;
  console.log("  " + (checks - fails) + "/" + checks + " checks passed" + (declared ? "" : ", NOT the declared " + EXPECTED));
  if (!reachedEnd || !declared) { console.log("  SUITE DID NOT COMPLETE"); process.exitCode = E.NO_VERDICT; return; }
  process.exitCode = E.exitOf(fails);
})();
