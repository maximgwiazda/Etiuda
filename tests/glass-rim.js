/* The glass rim: a 1px line of light along the top and bottom edges of a macro, the intent panel and a dialog,
 * in the dark themes only, brightest at the top's left and the bottom's right, the sides nearly dark, static.
 *
 *   ETIUDA_FIXTURES=<folder> node tests/glass-rim.js
 *
 * The page is the engine beside the fixtures folder's format 2 catalog, in headless Chrome.
 *
 * WHAT IS MEASURED. Computed style says the ring is painted and the old bevel is off, per theme, on every
 * macro and on the panel and a dialog. The eye's part is pixels: the macro is photographed whole at 1:1
 * and the brightness of its edge row at 30 px from the top-left corner along the top is read against the same
 * distance down the left edge, and the bottom-right corner likewise, each less the edge's resting level.
 * A lit top and bottom and a dark side is the claim, and so is a peak below the first pass's (bdf6120).
 * A 1px line reads thicker the brighter it is, so thickness is read as brightness at both ends of the top and of
 * the bottom (30 px in from each corner): an edge's dimmer end must hold at least 60 per cent of its brighter
 * end, and the top must read as the bottom does, end for end (the bottom-right as the top-left, the bottom-left
 * as the top-right) within 8 per cent. The row profile across the edge was measured separately: one row, no
 * second line under the rim, at a device pixel ratio of 1 and 2.
 *
 * THE FRACTIONAL RATIOS (125 and 150 per cent displays). A masked ring is not snapped to device pixels, so it split
 * the line over two rows, differently at the top and the bottom; the ring is now a real 1px border, which is. Each
 * ratio gets its own headless Chrome with --force-device-scale-factor (the emulated ratio does not snap borders the way
 * a real display does, so it would prove nothing), the macro is photographed whole at the device's own pixels, and
 * at three places along the top and the bottom (30 px in from each end and the middle) the rows are read: the same
 * number of rows above half of the line's own peak at the top and the bottom, and the equivalent width (the rows'
 * brightness above the card, over the peak row, in CSS pixels) within 0.1 of a pixel between them. The control is
 * the previous pass's masked ring injected in the same launch, which must read the two apart.
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

const EXPECTED = 18;
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

/* The macro with room: the tallest on the page, brought to the middle of the window. */
const pickMacro = pg => pg.evaluate(() => {
  const all = [...document.querySelectorAll(".txt")].filter(e => e.offsetWidth > 300);
  all.sort((x, y) => y.offsetHeight - x.offsetHeight);
  const el = all[0];
  if (!el) return null;
  document.querySelectorAll("[data-rim-probe]").forEach(x => x.removeAttribute("data-rim-probe"));
  el.scrollIntoView({ block: "center" });
  el.setAttribute("data-rim-probe", "1");
  return true;
});

/* The list lays out lazily, so one scroll can land short: bring the probe macro to the middle again until it is
   wholly in the window and its box has held still for ten frames. */
async function settle(pg) {
  await pickMacro(pg);
  const inView = await pg.evaluate(async () => {
    const el = document.querySelector("[data-rim-probe]");
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
           whole: Math.abs(r.x - x0) < 0.01 && Math.abs(r.y - y0) < 0.01, h: r.h };
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

/* A launch of its own at a real device pixel ratio, the page booted the way the main read is. */
async function atRatio(ratio) {
  const RUN2 = E.runFolder("catalogV2", "sampleV2");
  let b2;
  try {
    b2 = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, defaultViewport: null,
      args: ["--hide-scrollbars", "--force-device-scale-factor=" + ratio, "--window-size=1500,950"], protocolTimeout: 120000 });
    const q = await b2.newPage();
    q.on("dialog", d => d.accept());
    await bootAndDismiss(q, RUN2.url);
    const dpr = await q.evaluate(() => devicePixelRatio);
    await setTheme(q, "dark");
    const now = await edgeRows(q, dpr);
    await q.addStyleTag({ content: MASKED });
    await setTheme(q, "dark");
    const old = await edgeRows(q, dpr);
    return { dpr, now, old };
  } finally {
    try { if (b2) await b2.close(); } catch (x) {}
    RUN2.drop();
  }
}

/* The thickness reads: each edge's dimmer end against its brighter, and the top against the bottom end for end. */
const ends = m => ({
  topRatio: Math.min(m.top, m.tr) / Math.max(m.top, m.tr, 1),
  botRatio: Math.min(m.bot, m.bl) / Math.max(m.bot, m.bl, 1),
  tbGap: Math.max(Math.abs(m.top - m.bot) / Math.max(m.top, m.bot, 1), Math.abs(m.tr - m.bl) / Math.max(m.tr, m.bl, 1)) });
const endsLine = (m, e) => "top " + m.top + " and " + m.tr + " (ratio " + e.topRatio.toFixed(2) + "), bottom " + m.bot + " and " + m.bl
  + " (ratio " + e.botRatio.toFixed(2) + "), top against bottom end for end differ by " + (100 * e.tbGap).toFixed(1) + " per cent";

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
    await p.keyboard.press("Escape");
    await p.waitForFunction(() => !document.querySelector(".modal:not([hidden])"), { timeout: 10000 }).catch(() => {});
    await sleep(600);
    check(!!dlg && dlg.rim && dlg.pos === "absolute" && dlg.w > 200 && dlg.h > 100,
      "9gr4 dark: a dialog, open (" + (dlg && dlg.w) + " x " + (dlg && dlg.h) + "), paints the rim");

    const mine = await lift(p);
    console.log("       dark, " + D + " px from the corner, less the edge at rest (" + mine.rest + "): top " + mine.top + ", side " + mine.side
      + ", peak (best of 10, 20, 30 px) " + mine.peak + ", top at 120 px " + mine.far + ", top at the middle " + mine.mid
      + ", bottom " + mine.bot + ", right side " + mine.bside + ", macro " + Math.round(mine.h) + " px high");
    check(mine.whole && mine.h >= 70 && mine.top >= 50 && mine.top >= 4 * Math.max(mine.side, 1),
      "9gr5 dark: along the top the rim is at least 50 and at least four times its brightness down the side, at " + D + " px");
    check(mine.bot >= 40 && mine.bot >= 4 * Math.max(mine.bside, 1) && mine.far >= 10 && mine.mid >= 4,
      "9gr10 dark: the bottom's right is lit and its side dark likewise, and the line holds along the top (120 px, middle)");

    const eMine = ends(mine);
    console.log("       the line's ends, brightness above rest: " + endsLine(mine, eMine));
    check(mine.whole && eMine.topRatio >= 0.6 && eMine.botRatio >= 0.6,
      "9gr12 dark: along the top and along the bottom the dimmer end holds at least 60 per cent of the brighter, so the line reads as one thickness");
    check(mine.whole && eMine.tbGap <= 0.08,
      "9gr13 dark: the top line reads as the bottom line does, end for end, within 8 per cent");

    await p.addStyleTag({ content: ":root:not([data-theme=light]){--rim:" + PASS1 + "!important}" });
    await setTheme(p, "dark");
    const pass1 = await lift(p);
    console.log("       dark with the first pass's gradient (bdf6120): top " + pass1.top + ", side " + pass1.side + ", peak " + pass1.peak);
    check(pass1.peak > 100 && mine.peak <= 0.75 * pass1.peak && mine.peak >= 0.25 * pass1.peak,
      "9gr11 dark: the peak (" + mine.peak + ") is quieter than the first pass's (" + pass1.peak + "), at most three quarters of it, and still a line");
    await p.addStyleTag({ content: ":root:not([data-theme=light]){--rim:" + ROUND + "!important}" });
    await setTheme(p, "dark");
    const round = await lift(p);
    console.log("       dark with the first draft's 240 x 96 catch: top " + round.top + ", side " + round.side);
    check(round.top > 0 && mine.top / Math.max(mine.side, 1) >= 1.5 * (round.top / Math.max(round.side, 1)),
      "9GR5 control: the first draft's round catch gives a ratio at most two thirds of the tilted one's");

    await p.addStyleTag({ content: ":root:not([data-theme=light]){--rim:" + PASS2 + "!important}" });
    await setTheme(p, "dark");
    const pass2 = await lift(p);
    const e2 = ends(pass2);
    console.log("       dark with the previous pass's gradient (9e44127): " + endsLine(pass2, e2));
    check(e2.topRatio < 0.5 && e2.botRatio < 0.5 && e2.tbGap > 0.08 && eMine.tbGap < e2.tbGap,
      "9GR12 control: the previous pass's gradient fails both reads (ends under half, top and bottom apart), so they can tell it from this one");

    const f125 = await atRatio(1.25);
    console.log("       ratio " + f125.dpr + ", this ring: " + edgeLine(f125.now));
    console.log("       ratio " + f125.dpr + ", the masked ring (eacc361): " + edgeLine(f125.old));
    check(f125.dpr === 1.25 && sameRows(f125.now),
      "9gr14 dark at a device pixel ratio of 1.25: the top and the bottom line are one row each, as wide as each other (within 0.1 px) at both ends and the middle");
    check(f125.dpr === 1.25 && seenApart(f125.old),
      "9GR14 control at 1.25: the masked ring of eacc361 reads the top and the bottom apart, so the read can tell it from this one");
    const f150 = await atRatio(1.5);
    console.log("       ratio " + f150.dpr + ", this ring: " + edgeLine(f150.now));
    console.log("       ratio " + f150.dpr + ", the masked ring (eacc361): " + edgeLine(f150.old));
    check(f150.dpr === 1.5 && sameRows(f150.now),
      "9gr15 dark at a device pixel ratio of 1.5: the top and the bottom line are one row each, as wide as each other (within 0.1 px) at both ends and the middle");
    check(f150.dpr === 1.5 && seenApart(f150.old),
      "9GR15 control at 1.5: the masked ring of eacc361 reads the top and the bottom apart, so the read can tell it from this one");

    await setTheme(p, "light");
    const lt = await styles(p, ".txt");
    const lrail = (await styles(p, "#intentRail"))[0];
    check(lt.length >= 10 && lt.every(s => !s.rim && s.shadow !== OFF) && !!lrail && !lrail.rim && /255, 255, 255\)/.test(lrail.shadow),
      "9gr6 light: no macro and no panel paints the rim, and their bevel and lift stand as before");
    const lit = await lift(p);
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
