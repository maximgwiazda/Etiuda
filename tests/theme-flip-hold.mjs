// The controls and repeating rows (tabs, language switcher, buttons, pills, rail items, card
// buttons, category chips) ease their colours on hover and start no transition on a theme flip:
// #eFlipHold holds them still for the press's two frames (src/modules/theme.js). The leg's own sight:
// the same flip with the hold sheet taken out must start transitions on them, or the count below
// proves nothing.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

if (!process.env.ETIUDA_FIXTURES) process.env.ETIUDA_FIXTURES = "C:/Users/maxim/Workspace/etiuda-fixtures";
const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

let fails = 0, checks = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
};
const SEL = ".rail-item,.cacts button,.cat-chip,.pill,.btn,.tab,#seg button";
const RUN = E.runFolder("catalogV2", "sampleV2");
let browser = null;

async function boot() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try {
      for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"], ["eTheme", "dark"]]) localStorage.setItem(k, v);
    } catch (e) {}
  });
  await page.goto(RUN.url, { waitUntil: "load", timeout: 60000 });
  await require("./launch-wait.js").waitLaunchGone(page, { who: "tests/theme-flip-hold.mjs" });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  const yes = await page.$("#ecYes");
  if (yes) await page.click("#ecYes");
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes"), { timeout: 30000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => { const h = document.getElementById("eFlipHold"); return !!(h && h.sheet && h.sheet.disabled); }, { timeout: 30000 });
  return page;
}

// Press the theme button; read computed colours in the switch's frame and count running CSS transitions three frames later.
const flip = (page, takeHoldOut) => page.evaluate((sel, takeHoldOut) => new Promise(res => {
  if (takeHoldOut) document.getElementById("eFlipHold").remove();
  const rows = new Set(document.querySelectorAll(sel));
  const activeTab = document.querySelector(".tab.on");
  const seg = document.querySelector("#seg");
  const segOn = document.querySelector("#seg button.on");
  const activePill = document.querySelector(".pill.on");
  const count = () => document.getAnimations().filter(a => a instanceof CSSTransition && a.effect && (rows.has(a.effect.target) || a.effect.target === seg)).length;
  const before = count();
  const theme0 = document.documentElement.dataset.theme;

  const dark = {
    tabBg: activeTab ? getComputedStyle(activeTab).backgroundColor : null,
    tabColor: activeTab ? getComputedStyle(activeTab).color : null,
    segBg: seg ? getComputedStyle(seg, "::before").backgroundColor : null,
    segColor: segOn ? getComputedStyle(segOn).color : null,
    pillBg: activePill ? getComputedStyle(activePill).backgroundColor : null,
  };

  document.querySelector("#theme").click();

  const h = document.getElementById("eFlipHold");
  const heldOnPress = h ? !h.sheet.disabled : null;
  const themeOnPress = document.documentElement.dataset.theme;

  const frame0 = {
    tabBg: activeTab ? getComputedStyle(activeTab).backgroundColor : null,
    tabColor: activeTab ? getComputedStyle(activeTab).color : null,
    segBg: seg ? getComputedStyle(seg, "::before").backgroundColor : null,
    segColor: segOn ? getComputedStyle(segOn).color : null,
    pillBg: activePill ? getComputedStyle(activePill).backgroundColor : null,
  };

  requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res({
    rows: rows.size, before, after: count(), heldOnPress, releasedAfter: h ? h.sheet.disabled : null,
    landedOnPress: themeOnPress !== theme0,
    dark,
    frame0,
  }))));
}), SEL, takeHoldOut);

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });

  const page = await boot();
  const rest = await page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)];
    return { rows: els.length, eased: els.filter(e => parseFloat(getComputedStyle(e).transitionDuration) > 0).length };
  }, SEL);
  check(rest.rows > 0 && rest.eased === rest.rows, "at rest every rail item, card button, category chip, pill, button and tab eases its colours on the tone tier", rest);

  const held = await flip(page, false);
  const lightTarget = {
    tabBg: "rgb(240, 242, 245)",
    tabColor: "rgb(15, 23, 42)",
    segBg: "rgb(253, 253, 253)",
    segColor: "rgb(14, 103, 216)",
    pillBg: "rgb(14, 103, 216)",
  };
  const colorsMatch = held.frame0.tabBg === lightTarget.tabBg &&
                      held.frame0.tabColor === lightTarget.tabColor &&
                      held.frame0.segBg === lightTarget.segBg &&
                      held.frame0.segColor === lightTarget.segColor &&
                      held.frame0.pillBg === lightTarget.pillBg;
  check(colorsMatch, "in the frame of the switch the tabs, active language half and controls take their new computed colours at once", { frame0: held.frame0, expected: lightTarget, dark: held.dark });

  check(held.landedOnPress && held.heldOnPress === true && held.after === 0 && held.releasedAfter === true,
    "a theme press lands the theme in its own task, holds controls and rows still, starts no transition on any of them, and lets go two frames later", held);

  const spot = await page.evaluate(() => {
    const r = [...document.querySelectorAll(".rail-item")].find(e => e.offsetParent);
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  let hovered = null;
  if (spot) {
    await page.mouse.move(spot.x, spot.y);
    await page.waitForFunction(() => document.getAnimations().some(a => a instanceof CSSTransition && a.effect && a.effect.target.classList && a.effect.target.classList.contains("rail-item")), { timeout: 30000 }).then(() => { hovered = true; }, () => { hovered = false; });
  }
  check(hovered === true, "after the flip, hovering a rail row eases it again", { spot, hovered });
  await page.close();

  const sight = await flip(await boot(), true);
  check(sight.after > 0, "the leg's own sight: the same flip with the hold sheet taken out starts transitions on controls and rows", sight);
} catch (e) {
  check(false, "the leg ran to its end", String(e && e.stack || e));
} finally {
  if (browser) await browser.close();
}
console.log(`#counts checks=${checks} skipped=0 failed=${fails} expected=5`);
console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
