/* The docked intent rail and Settings' section list are one width, and an intent's name
 * keeps the row until its star is actually showing.
 *
 *   node tests/rail-side.mjs
 *
 * Headless Chrome on the built page and the fixtures' catalog, the rail docked and locked,
 * at 1280 and at the 900 floor. What the eye sees:
 *   1  the rail's painted width and the section list's painted width are the same, and both
 *      read the shared side token. A wider column, written the way a drag writes it, moves
 *      both by the same amount.
 *   2  a long unstarred name is wider at rest than while the pointer or the keyboard is on
 *      the row, and the gap it leaves is the star's room only then. A starred row keeps
 *      that room at rest, and a name that does not fit fades rather than ending in dots.
 *   3  leaving Settings, the rail's first row is at the same y on the first frame as it was
 *      before the screen, and the title sits below the header.
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
const LONG = "Northbound afternoon desk request for the north side window";
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

function readName(si) {
  const row = document.querySelector('#intentRailList .rail-item[data-si="' + si + '"]');
  const name = row.querySelector(".rail-t");
  const star = row.querySelector(".rail-fav:not(.rail-edit):not(.rail-hide):not(.rail-unhide)");
  const rr = row.getBoundingClientRect(), nr = name.getBoundingClientRect();
  return {
    name: Math.round(nr.width * 10) / 10,
    gap: Math.round((rr.right - nr.right) * 10) / 10,
    star: getComputedStyle(star).opacity,
    cut: name.classList.contains("is-cut"),
    over: name.scrollWidth > name.clientWidth + 1,
  };
}

/* A long unstarred name, then the same row under the pointer and under the keyboard, then a
   starred row left alone. The name's box is what the eye can use: the text is one line and
   anything past the box is not there. */
async function nameRoom(page, width) {
  const planted = await page.evaluate(text => {
    const rows = [...document.querySelectorAll("#intentRailList .rail-item")];
    const plain = rows.find(r => r.querySelector(".rail-fav:not(.on)"));
    const other = rows.find(r => r !== plain);
    if (!plain || !other) return null;
    plain.querySelector(".rail-t").textContent = text;
    const star = other.querySelector(".rail-fav:not(.rail-edit):not(.rail-hide):not(.rail-unhide)");
    if (star && !star.classList.contains("on")) star.classList.add("on");
    return { plain: plain.dataset.si, starred: other.dataset.si };
  }, LONG);
  check(!!planted, "a long unstarred name and a starred row are on the rail", planted);
  if (!planted) return;
  await page.mouse.move(width - 8, 20);
  await sleep(40);
  const rest = await page.evaluate(readName, planted.plain);
  const box = await (await page.$('#intentRailList .rail-item[data-si="' + planted.plain + '"]')).boundingBox();
  await page.mouse.move(box.x + 24, box.y + box.height / 2);
  await sleep(40);
  const hot = await page.evaluate(readName, planted.plain);
  await page.mouse.move(width - 8, 20);
  await sleep(40);
  await page.focus('#intentRailList .rail-item[data-si="' + planted.plain + '"]');
  await sleep(40);
  const keyed = await page.evaluate(readName, planted.plain);
  await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
  await sleep(40);
  const back = await page.evaluate(readName, planted.plain);
  const kept = await page.evaluate(readName, planted.starred);
  check(rest.name >= hot.name + 20, "at " + width + " a long name is wider while its star is hidden",
    { rest: rest.name, hover: hot.name });
  check(rest.gap <= 16 && hot.gap >= 30, "at " + width + " the name leaves the star's room only while the star shows",
    { rest: rest.gap, hover: hot.gap });
  check(rest.star === "0" && hot.star === "1", "at " + width + " the star is hidden at rest and shown under the pointer",
    { rest: rest.star, hover: hot.star });
  check(keyed.gap >= 30 && keyed.star === "1", "at " + width + " the keyboard reveals the star and the name makes room",
    { gap: keyed.gap, star: keyed.star });
  check(kept.gap >= 30 && kept.star === "1", "at " + width + " a starred row keeps the star's room at rest",
    { gap: kept.gap, star: kept.star });
  check(rest.over && hot.over && hot.cut && back.cut, "at " + width + " a name that does not fit fades, at rest and under the pointer",
    { rest, hot, back });
  console.log("       name at " + width + " rest " + rest.name + " gap " + rest.gap
    + ", hover " + hot.name + " gap " + hot.gap + ", key gap " + keyed.gap + ", starred gap " + kept.gap);
}

function railFrame() {
  const title = document.querySelector("#intentRail .rail-head");
  const row = document.querySelector("#intentRailList .rail-item");
  const header = document.querySelector("header");
  if (!title || !row || !header) return null;
  const tr = title.getBoundingClientRect(), rr = row.getBoundingClientRect();
  return {
    titleY: Math.round(tr.top * 10) / 10,
    titleH: Math.round(tr.height * 10) / 10,
    rowY: Math.round(rr.top * 10) / 10,
    headerB: Math.round(header.getBoundingClientRect().bottom * 10) / 10,
    colTop: getComputedStyle(document.documentElement).getPropertyValue("--rail-col-top").trim(),
  };
}

/* The return is the current conversation tab, which is already the active one, so the screen
   closes without the tab being applied again. Settings is left only once the header has taken
   its short height under the screen, which a screen tab leaves the rail's vars beside, and the
   first frame is read then. */
async function titleHold(page) {
  const before = await page.evaluate(railFrame);
  await openSettings(page);
  await page.waitForFunction(() => {
    const headerB = document.querySelector("header").getBoundingClientRect().bottom;
    return document.body.classList.contains("screen-on") && headerB > 0 && headerB < 120;
  }, { timeout: 5000 });
  const first = await page.evaluate(() => new Promise(resolve => {
    document.querySelector("#tabsBar .tab[data-tid]").click();
    requestAnimationFrame(() => {
      const title = document.querySelector("#intentRail .rail-head");
      const row = document.querySelector("#intentRailList .rail-item");
      const header = document.querySelector("header");
      const tr = title.getBoundingClientRect(), rr = row.getBoundingClientRect();
      resolve({
        titleY: Math.round(tr.top * 10) / 10,
        titleH: Math.round(tr.height * 10) / 10,
        rowY: Math.round(rr.top * 10) / 10,
        headerB: Math.round(header.getBoundingClientRect().bottom * 10) / 10,
        colTop: getComputedStyle(document.documentElement).getPropertyValue("--rail-col-top").trim(),
      });
    });
  }));
  console.log("       title before " + JSON.stringify(before) + " first " + JSON.stringify(first));
  check(before && near(first.rowY, before.rowY, 1),
    "leaving Settings, the rail's first row holds its place on the first frame",
    { before: before && before.rowY, first: first.rowY, colTop: first.colTop });
  check(first.titleH >= 20 && first.titleY + 1 >= first.headerB,
    "leaving Settings, the title sits below the header on the first frame",
    { titleY: first.titleY, titleH: first.titleH, headerB: first.headerB });
}

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  console.log("  engine/etiuda.html sha256 " + RUN.engineSha.slice(0, 12));
  for (const width of [1280, 900]) {
    const page = await boot(width);
    await widths(page, width);
    if (width === 1280) {
      await nameRoom(page, width);
      await titleHold(page);
    }
    await page.close();
  }
} catch (e) {
  check(false, "the leg ran to its end", String(e && e.stack || e));
} finally {
  if (browser) await browser.close();
  try { RUN.drop(); } catch (e) {}
}
console.log("#counts checks=" + checks + " skipped=0 failed=" + fails + " expected=15");
console.log(checks + " checks, " + fails + " failed");
process.exit(fails ? 1 : 0);
