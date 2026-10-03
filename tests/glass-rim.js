/* The glass rim: a 1px catch of light on the edge of a macro, the intent panel and a dialog, in the dark
 * themes only, wide and short so it runs along the top and bottom edges and dies down the sides.
 *
 *   ETIUDA_FIXTURES=<folder> node tests/glass-rim.js
 *
 * The page is the engine beside the fixtures folder's format 2 catalog, in headless Chrome.
 *
 * WHAT IS MEASURED. Computed style says the ring is painted and the old bevel is off, per theme, on every
 * macro and on the panel and a dialog. The eye's part is pixels: the macro's corner is photographed at 1:1
 * and the brightness of its edge row at 30 px from the top-left corner along the top is read against the same
 * distance down the left edge, each less the edge's resting level. A lit top and a dark side is the claim.
 *
 * THE CONTROLS, IN THE SAME LAUNCH. The pixel read is run again with the first draft's gradient (240 x 96,
 * which lit the sides nearly as far), and must give the lower ratio, so a read that cannot tell a tilt from
 * a round catch goes red. The light theme is photographed the same way and must show no lift, which also
 * proves the read sees a ring when there is one.
 *
 * Exit code is the number of failed checks, capped at 63 (E.exitOf), 78 where the run produced no verdict. */
"use strict";
const puppeteer = require("puppeteer-core");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

const EXPECTED = 9;
const D = 30;
const OFF = "rgba(0, 0, 0, 0) 0px 0px 0px 0px";
const ROUND = "radial-gradient(240px 96px at 0 0,rgba(255,255,255,.92),rgba(255,255,255,.26) 38%,transparent 72%),"
  + "radial-gradient(240px 96px at 100% 100%,rgba(255,255,255,.72),rgba(255,255,255,.18) 38%,transparent 72%),"
  + "linear-gradient(rgba(255,255,255,.02),rgba(255,255,255,.02))";
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

/* captureBeyondViewport is off because a clipped shot that resizes the page moves a lazily laid list
   under the very rectangle it was asked for.

   Edge-row brightness, 1:1: the red channel of the border row at D px along the top, and of the border
   column at D px down the left side, each less the resting level read at the left edge's middle. The box is
   whole pixels (the macro is laid on the pixel grid) and the read says if it was not. */
async function lift(pg) {
  await pickMacro(pg);
  /* The list lays out lazily, so one scroll can land short: bring it to the middle again until it is
     wholly in the window and its box has held still for ten frames. */
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
  const r = await pg.evaluate(() => {
    const el = document.querySelector("[data-rim-probe]");
    const q = el.getBoundingClientRect();
    return { x: q.left, y: q.top, w: q.width, h: q.height };
  });
  const x0 = Math.round(r.x), y0 = Math.round(r.y);
  const png = await pg.screenshot({ clip: { x: x0 - 2, y: y0 - 2, width: D + 10, height: Math.round(r.h) + 4 }, captureBeyondViewport: false, encoding: "base64" });
  const read = await pg.evaluate(async (b64, h, d) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const px = (x, y) => g.getImageData(x, y, 1, 1).data[0];
    return { top: px(2 + d, 2), side: px(2, 2 + d), rest: px(2, 2 + Math.round(h / 2)) };
  }, png, r.h, D);
  return { top: read.top - read.rest, side: read.side - read.rest, rest: read.rest,
           whole: Math.abs(r.x - x0) < 0.01 && Math.abs(r.y - y0) < 0.01, h: r.h };
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
      + ", macro " + Math.round(mine.h) + " px high");
    check(mine.whole && mine.h >= 70 && mine.top >= 100 && mine.top >= 3 * Math.max(mine.side, 1),
      "9gr5 dark: along the top the rim is at least 100 and at least three times its brightness down the side, at " + D + " px");

    await p.addStyleTag({ content: ":root:not([data-theme=light]){--rim:" + ROUND + "!important}" });
    await setTheme(p, "dark");
    const round = await lift(p);
    console.log("       dark with the first draft's 240 x 96 catch: top " + round.top + ", side " + round.side);
    check(round.top > 0 && mine.top / Math.max(mine.side, 1) >= 1.5 * (round.top / Math.max(round.side, 1)),
      "9GR5 control: the first draft's round catch gives a ratio at most two thirds of the tilted one's");

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
