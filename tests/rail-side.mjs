/* The docked intent rail and Settings' section list are one width.
 *
 *   node tests/rail-side.mjs
 *
 * Headless Chrome on the built page and the fixtures' catalog, the rail docked and locked,
 * at 1280 and at the 900 floor. What the eye sees: the rail's painted width and the section
 * list's painted width are the same, and both are the shared side token. A wider column,
 * written the way a drag writes it, moves both by the same amount.
 */
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
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
};
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const RUN = E.runFolder("catalogV2", "sampleV2");
let browser = null;

async function boot(width) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 880, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try {
      for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"], ["eTheme", "light"], ["eRail", "1"], ["eRailLock", "1"]]) localStorage.setItem(k, v);
    } catch (e) {}
  });
  await page.goto(RUN.url, { waitUntil: "load", timeout: 60000 });
  await require("./launch-wait.js").waitLaunchGone(page, { who: "tests/rail-side.mjs" });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  const yes = await page.$("#ecYes");
  if (yes) await page.click("#ecYes");
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes"), { timeout: 30000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.body.classList.contains("rail-on") && document.body.classList.contains("rail-col")
    && document.body.classList.contains("rail-ready")
    && getComputedStyle(document.getElementById("intentRail")).opacity === "1"
    && document.querySelector("#intentRailList .rail-item"), { timeout: 30000 });
  await page.mouse.move(width - 8, 860);
  return page;
}

function sideBox() {
  const rail = document.getElementById("intentRail").getBoundingClientRect();
  const navEl = document.querySelector(".sx-nav");
  const nav = navEl ? navEl.getBoundingClientRect() : null;
  return {
    rail: Math.round(rail.width * 10) / 10,
    nav: nav && nav.width ? Math.round(nav.width * 10) / 10 : 0,
  };
}

async function openSettings(page) {
  await page.click("#settingsBtn");
  await page.waitForSelector('#settingsMenu [data-act="settings"]', { visible: true, timeout: 8000 });
  await page.evaluate(() => document.querySelector('#settingsMenu [data-act="settings"]').click());
  await page.waitForFunction(() => document.body.classList.contains("screen-on")
    && document.querySelector(".sx-nav")
    && document.querySelector(".sx-nav").getBoundingClientRect().width > 80, { timeout: 10000 });
}

async function backToCards(page) {
  await page.evaluate(() => document.querySelector("#tabsBar .tab[data-tid]").click());
  await page.waitForFunction(() => !document.body.classList.contains("screen-on")
    && document.getElementById("intentRail").getBoundingClientRect().width > 80, { timeout: 10000 });
}

/* The painted rail on the cards, then the section list on Settings, then both again after the
   column is widened the way a drag widens it. */
async function widths(page, width) {
  const rested = await page.evaluate(sideBox);
  await openSettings(page);
  const listed = await page.evaluate(sideBox);
  /* Writing the token itself, not the column it is built from: two copies of the same sum
     would ignore this and keep their own width. */
  await page.evaluate(() => document.documentElement.style.setProperty("--side-w", "320px"));
  const listedTok = await page.evaluate(sideBox);
  await backToCards(page);
  const restedTok = await page.evaluate(sideBox);
  await page.evaluate(() => {
    document.documentElement.style.removeProperty("--side-w");
    document.documentElement.style.setProperty("--rail-max", "360px");
  });
  const restedWide = await page.evaluate(sideBox);
  await openSettings(page);
  const listedWide = await page.evaluate(sideBox);
  await backToCards(page);
  await page.evaluate(() => document.documentElement.style.removeProperty("--rail-max"));
  await page.waitForFunction(() => document.getElementById("intentRail").getBoundingClientRect().width > 80, { timeout: 5000 });
  const rail = rested.rail, nav = listed.nav;
  check(near(rail, nav, 0.6), "at " + width + " the rail and Settings' section list are one width", { rail, nav });
  check(near(restedTok.rail, 320, 0.6) && near(listedTok.nav, 320, 0.6),
    "at " + width + " both columns read the shared side token",
    { rail: restedTok.rail, nav: listedTok.nav });
  check(near(restedWide.rail, listedWide.nav, 0.6) && restedWide.rail >= rail + 20 && listedWide.nav >= nav + 20,
    "at " + width + " a wider column moves the rail and the list together",
    { before: { rail, nav }, after: { rail: restedWide.rail, nav: listedWide.nav } });
}

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  console.log("  engine/etiuda.html sha256 " + RUN.engineSha.slice(0, 12));
  for (const width of [1280, 900]) {
    const page = await boot(width);
    await widths(page, width);
    await page.close();
  }
} catch (e) {
  check(false, "the leg ran to its end", String(e && e.stack || e));
} finally {
  if (browser) await browser.close();
  try { RUN.drop(); } catch (e) {}
}
console.log("#counts checks=" + checks + " skipped=0 failed=" + fails + " expected=6");
console.log(checks + " checks, " + fails + " failed");
process.exit(fails ? 1 : 0);
