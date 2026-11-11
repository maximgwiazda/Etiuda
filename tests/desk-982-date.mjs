/* DATE MODIFIED IN THE LIBRARY (board 982): the column in Categories & cards and in Intents, and the desk's date on
 * the agent's own cards.
 *
 *   node tests/desk-982-date.mjs     exit 1 on any failed check, or unless exactly the expected number ran
 *
 * Headless Chrome on the built engine page. The shipped sample catalog for the column's absence, and a copy of it in
 * this run's temporary folder with dates planted on three cards, two shelves and one request, never the product's own.
 * The oracles are literals: the day each planted instant falls on, written out in English and in Polish.
 *   d1 with no date anywhere, neither list draws the column: no heading, no cell
 *   d2 planted, both lists head the column "Date modified", before the buttons
 *   d3 a dated card's cell reads its day; an undated card's cell is empty, its text ""
 *   d4 a category reads the newest of its cards' dates and its own, and one with neither reads ""
 *   d5 sorting by the column: dated cards first, newest at the top, the undated after in the list's order; again,
 *      oldest first with the undated still after; a third click brings the list's order back
 *   d6 an intent whose request is dated reads its day; one undated reads ""; the heading stands over the cells within 2 px
 *   d7 where the column has stepped aside, a card's hover and an intent's hover carry "Date modified: {day}", and
 *      where it stands, neither does
 *   d8 in Polish the heading reads "Data zmiany" and the day is written in Polish
 *   d9 the width rule with the column drawn: at windows of 546, 900, 1100, 1280, 1360, 1440, 1700, 1880, 2000 and 2560 neither
 *      list's box nor the page scrolls sideways and no cell ends past its row; the boxes the column shows and hides at
 *      are printed
 *   d10 a desk edit of a catalog card dates the agent's edit now, in UTC, and its category with it
 *   d11 a save that changes nothing dates nothing: the date stands as it was
 *   d12 the card's text put back as the catalog has it leaves no edit behind, the date with it, and the cell reads the
 *      catalog's own date again
 *   d13 Intents' date stands only where the chips keep at least 520 px beside it, on the narrowest row with every
 *      chevron drawn (the product designer's edit, 2026-11-11): never at a 1280 window
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

const EXPECTED = 13;
let fails = 0, checks = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* The planted dates, each at a time of day that is the same day in UTC and in any European zone. */
const PLANT = {
  cards: { "c-opening-name-and-welcome": "2026-11-02T09:00:00.000Z", "c-opening-a-familiar-name": "2026-11-09T12:30:00.000Z",
           "c-holding-checking-now": "2026-11-01T10:00:00.000Z" },
  tags: { "t-opening": "2026-10-20T11:00:00.000Z", "t-holding": "2026-11-10T10:00:00.000Z",
          "t-where-is-my-order": "2026-11-08T12:00:00.000Z" },
};
const DAY = { en: { "02": "2 Nov 2026", "09": "9 Nov 2026", "10": "10 Nov 2026", "08": "8 Nov 2026" },
              pl: { "02": "2 lis 2026" } };
const OPENING = ["c-opening-name-and-welcome", "c-opening-the-order-in-hand", "c-opening-a-familiar-name"];

const sample = fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8");
const planted = JSON.parse(sample);
planted.cards.forEach(c => { if (PLANT.cards[c.id]) c.changedAt = PLANT.cards[c.id]; });
planted.tags.forEach(t => { if (PLANT.tags[t.id]) t.changedAt = PLANT.tags[t.id]; });
delete planted.hash;
const plantedCount = planted.cards.filter(c => c.changedAt).length + planted.tags.filter(t => t.changedAt).length;

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-982-date-"));
const labs = { plain: path.join(lab, "plain"), dated: path.join(lab, "dated") };
for (const [k, dir] of Object.entries(labs)) {
  fs.mkdirSync(dir);
  fs.copyFileSync(E.ENGINE_PATH, path.join(dir, "etiuda.html"));
  fs.writeFileSync(path.join(dir, "etiuda-catalog.js"),
    "window.E_CATALOG = " + (k === "plain" ? sample : JSON.stringify(planted)) + ";\n");
}
const urlOf = k => "file:///" + path.join(labs[k], "etiuda.html").replace(/\\/g, "/");
let browser = null;

async function boot(which, viewport, more = []) {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((more) => {
    try {
      for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"],
        ["eTheme", "light"], ["eRail", "1"], ...more]) localStorage.setItem(k, v);
    } catch (e) {}
  }, more);
  await page.goto(urlOf(which), { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  const yes = await page.$("#ecYes");
  if (yes) await page.click("#ecYes");
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.body.classList.contains("rail-on") && document.body.classList.contains("rail-ready"),
    { timeout: 30000 });
  return page;
}
// The Library on one section, with the named categories open.
async function library(page, sec, open = []) {
  await page.evaluate(() => { if (window.openManage) window.openManage(); });
  await page.waitForSelector(".sx.lm-lib", { timeout: 10000 });
  await page.evaluate(s => { const e = document.querySelector('.sx-sec[data-lm="' + s + '"]'); if (e) e.click(); }, sec);
  await sleep(120);
  for (const k of open) {
    await page.evaluate(k => {
      const cat = document.querySelector('.mg-cat[data-cat="' + k + '"]');
      const body = cat && cat.querySelector(".mg-cat-body");
      if (body && body.hidden) cat.querySelector(".mg-tw").click();
    }, k);
    await sleep(60);
  }
}
try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"],
    protocolTimeout: 120000 });

  /* d1: the shipped sample, no dates. */
  {
    const page = await boot("plain", { width: 2000, height: 900 });
    await library(page, "catmac", ["t-opening"]);
    const tree = await page.evaluate(() => ({ head: document.querySelectorAll(".lw-h-dt").length, cells: document.querySelectorAll(".lw-c.dt").length,
      cls: document.querySelector(".mg-tree") ? document.querySelector(".mg-tree").className : "none" }));
    await library(page, "intents");
    const ints = await page.evaluate(() => ({ head: document.querySelectorAll(".lw-ih-date").length, cells: document.querySelectorAll(".lw-date").length,
      rows: document.querySelectorAll(".mg-intents .manage-row.mg-int").length }));
    check(tree.head === 0 && tree.cells === 0 && tree.cls === "mg-tree" && ints.head === 0 && ints.cells === 0 && ints.rows > 0,
      "d1 with no date anywhere neither list draws the column", { tree, ints });
    await page.close();
  }

  /* d2 to d7 and d9: the planted copy, in English. */
  const page = await boot("dated", { width: 2000, height: 900 });
  await library(page, "catmac", ["t-opening", "t-holding", "t-closing"]);
  const heads = await page.evaluate(() => [...document.querySelectorAll(".lw-head > *")].map(e => e.textContent.trim().toLowerCase()));
  const c2 = await page.evaluate(() => {
    const t = id => { const e = document.querySelector('.manage-row.mg-card[data-cardrow="' + id + '"] .lw-c.dt'); return e ? e.textContent : null; };
    const k = id => { const e = document.querySelector('.mg-cat[data-cat="' + id + '"] > .mg-cat-row .lw-c.dt'); return e ? e.textContent : null; };
    return { cards: ["c-opening-name-and-welcome", "c-opening-a-familiar-name", "c-opening-the-order-in-hand", "c-holding-checking-now"].map(t),
      cats: ["t-opening", "t-holding", "t-closing"].map(k) };
  });
  await library(page, "intents");
  const ih = await page.evaluate(() => [...document.querySelectorAll(".lw-ihead > *")].map(e => e.textContent.trim().toLowerCase()));
  check(heads.indexOf("date modified") === heads.length - 2 && ih.indexOf("date modified") === ih.length - 2,
    "d2 planted, both lists head the column \"Date modified\", before the buttons", { heads, ih, planted: plantedCount });
  check(JSON.stringify(c2.cards) === JSON.stringify([DAY.en["02"], DAY.en["09"], "", "1 Nov 2026"]),
    "d3 a dated card's cell reads its day, an undated card's is empty", c2.cards);
  check(JSON.stringify(c2.cats) === JSON.stringify([DAY.en["09"], DAY.en["10"], ""]),
    "d4 a category reads the newest of its cards' and its own, and one with neither reads nothing", c2.cats);

  /* d5: the sort, inside Opening. */
  await library(page, "catmac", ["t-opening"]);
  const openingOrder = () => page.evaluate(() => [...document.querySelectorAll('.mg-cat[data-cat="t-opening"] .manage-row.mg-card')]
    .map(r => r.getAttribute("data-cardrow")));
  const clickDt = () => page.evaluate(() => { const h = document.querySelector('.lw-head [data-sort-col="dt"]'); if (h) h.click(); });
  const before = await openingOrder();
  await clickDt(); await sleep(120); const desc = await openingOrder();
  await clickDt(); await sleep(120); const asc = await openingOrder();
  await clickDt(); await sleep(120); const back = await openingOrder();
  const undated = before.filter(id => !PLANT.cards[id]);
  check(JSON.stringify(desc) === JSON.stringify(["c-opening-a-familiar-name", "c-opening-name-and-welcome", ...undated])
    && JSON.stringify(asc) === JSON.stringify(["c-opening-name-and-welcome", "c-opening-a-familiar-name", ...undated])
    && JSON.stringify(back) === JSON.stringify(before),
    "d5 sorting: dated first newest at the top, undated after in the list's order; then oldest first; then the list's order",
    { before, desc, asc, back });

  /* d6: Intents. */
  await library(page, "intents");
  const d6 = await page.evaluate(() => {
    const row = id => document.querySelector('.mg-intents .manage-row.mg-int[data-introw="' + id + '"]');
    const dated = row("t:t-where-is-my-order"), other = row("t:t-change-delivery-address");
    const head = document.querySelector(".lw-ih-date");
    const cell = dated && dated.querySelector(".lw-date");
    const hl = head ? head.getBoundingClientRect().left : null, cl = cell ? cell.getBoundingClientRect().left : null;
    return { dated: cell ? cell.textContent : null, other: other && other.querySelector(".lw-date") ? other.querySelector(".lw-date").textContent : null,
      headLeft: hl, cellLeft: cl };
  });
  check(d6.dated === DAY.en["08"] && d6.other === "" && d6.headLeft != null && Math.abs(d6.headLeft - d6.cellLeft) <= 2,
    "d6 a dated intent reads its day, an undated one nothing, the heading over the cells within 2 px", d6);

  /* d7: hovers where the column has stepped aside. */
  const hoverAt = async w => {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await library(page, "catmac", ["t-opening"]);
    await sleep(150);
    const card = await page.evaluate(() => {
      const r = document.querySelector('.manage-row.mg-card[data-cardrow="c-opening-name-and-welcome"]');
      const h = document.querySelector(".lw-head .lw-h-dt");
      return { title: r ? r.getAttribute("title") || "" : null, shown: !!h && getComputedStyle(h).display !== "none",
        box: document.querySelector(".sx-card:has(.mg-tree)").clientWidth };
    });
    await library(page, "intents");
    await sleep(150);
    const intent = await page.evaluate(() => {
      const r = document.querySelector('.mg-intents .manage-row.mg-int[data-introw="t:t-where-is-my-order"]');
      const h = document.querySelector(".lw-ih-date");
      return { title: r ? r.getAttribute("title") || "" : null, shown: !!h && !!h.offsetParent && getComputedStyle(h).display !== "none",
        box: document.querySelector(".sx-card:has(.mg-intents)").clientWidth };
    });
    return { w, card, intent };
  };
  const line = "Date modified: ";
  const wide = await hoverAt(2000), narrow = await hoverAt(1280), narrowest = await hoverAt(900);
  check(wide.card.shown && wide.intent.shown && !wide.card.title.includes(line) && !wide.intent.title.includes(line)
    && !narrow.card.shown && narrow.card.title.split("\n").includes(line + DAY.en["02"])
    && !narrowest.intent.shown && narrowest.intent.title === line + DAY.en["08"],
    "d7 a hidden column's day joins the row's hover, a shown one's does not", { wide, narrow, narrowest });

  /* d9: the width rule with the column drawn. */
  const widths = [546, 900, 1100, 1280, 1360, 1440, 1700, 1880, 2000, 2560], bad = [], boxes = [];
  for (const w of widths) {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    for (const sec of ["catmac", "intents"]) {
      await library(page, sec, sec === "catmac" ? ["t-opening", "t-holding"] : []);
      await sleep(100);
      const r = await page.evaluate(sec => {
        const pg = document.querySelector(".sx-page#libPage") || document.querySelector(".sx-page");
        const list = document.querySelector(sec === "catmac" ? ".mg-tree" : ".mg-intents");
        const box = list && list.closest(".sx-card");
        const out = { box: box ? box.clientWidth : null, page: pg.scrollWidth - pg.clientWidth,
          list: list ? list.scrollWidth - list.clientWidth : null, boxOver: box ? box.scrollWidth - box.clientWidth : null, past: [] };
        const head = document.querySelector(sec === "catmac" ? ".lw-head .lw-h-dt" : ".lw-ih-date");
        out.dateShown = !!head && !!head.offsetParent && getComputedStyle(head).display !== "none";
        const rows = sec === "catmac" ? document.querySelectorAll(".lw-head, .mg-cat-row, .manage-row.mg-card")
          : document.querySelectorAll(".lw-ihead, .mg-intents .manage-row.mg-int");
        for (const row of rows) {
          if (!row.offsetParent) continue;
          const rr = row.getBoundingClientRect();
          for (const c of row.children) {
            if (!c.offsetParent) continue;
            if (c.getBoundingClientRect().right > rr.right + 2.5) out.past.push(c.className);
          }
        }
        out.past = out.past.slice(0, 3);
        return out;
      }, sec);
      boxes.push(w + " " + sec + " box " + r.box + (r.dateShown ? " date" : ""));
      if (r.page > 1 || r.list > 1 || r.boxOver > 1 || r.past.length) bad.push({ w, sec, ...r });
    }
  }
  console.log("       boxes: " + boxes.join("; "));
  check(!bad.length, "d9 with the column drawn, at 546 to 2560 no list's box or page scrolls sideways and no cell ends past its row", bad.slice(0, 4));

  /* d13: Intents' date stands only where the chips keep 520 px beside it. The oracle does not trust the page's own
     arithmetic: at each width the date and every row's chevron are drawn for a moment, the narrowest chip column is
     read off the page, and both go back; the date must be shown exactly where that column is at least 520 px. Windows
     of 1280 to 2560, then boxes stepped across the line at a 2000 window. */
  await library(page, "intents");
  const d13At = () => page.evaluate(async () => {
    const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await frames();
    const list = document.querySelector(".mg-intents"), head = document.querySelector(".lw-ih-date");
    const cellShown = [...list.querySelectorAll(".manage-row.mg-int .lw-date")].some(c => c.getClientRects().length > 0);
    const shown = !!head && head.getClientRects().length > 0;
    // Drawn by taking the list's date-aside off and every chevron's hidden, read, and put back before a frame paints.
    // (A forcing style cannot: the engine's rules sit in cascade layers, whose !important beats an unlayered one.)
    const aside = list.classList.contains("date-aside");
    const hid = [...list.querySelectorAll("[data-chips-more][hidden]")];
    list.classList.remove("date-aside");
    hid.forEach(b => { b.hidden = false; });
    const mids = [...list.querySelectorAll(".manage-row.mg-int")].filter(r => r.querySelector("[data-chips-more]") && r.getClientRects().length)
      .map(r => r.querySelector(".lw-mid").getBoundingClientRect().width);
    const drawn = [...list.querySelectorAll(".manage-row.mg-int .lw-date")].some(c => c.getClientRects().length > 0);
    if (aside) list.classList.add("date-aside");
    hid.forEach(b => { b.hidden = true; });
    await frames();
    return { box: list.closest(".sx-card").clientWidth, shown, cellShown, drawn,
      room: mids.length ? Math.round(Math.min(...mids) * 10) / 10 : null };
  });
  const d13 = [], d13Bad = [];
  for (const w of [1280, 1360, 1440, 1600, 2000, 2560]) {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await sleep(120);
    d13.push({ w, ...(await d13At()) });
  }
  await page.setViewport({ width: 2000, height: 900, deviceScaleFactor: 1 });
  for (const bw of [1000, 1100, 1108, 1112, 1116, 1120, 1124, 1132, 1200]) {
    await page.evaluate(bw => { const b = document.querySelector(".sx-card:has(.mg-intents)"); b.style.width = b.style.maxWidth = bw + "px"; }, bw);
    d13.push({ bw, ...(await d13At()) });
  }
  await page.evaluate(() => { const b = document.querySelector(".sx-card:has(.mg-intents)"); b.style.width = b.style.maxWidth = ""; });
  for (const r of d13) if (r.room == null || !r.drawn || r.shown !== r.cellShown || r.shown !== (r.room >= 519.5)) d13Bad.push(r);
  console.log("       d13 " + d13.map(r => (r.w ? "window " + r.w : "box " + r.bw) + " chips " + r.room + (r.shown ? " date" : "")).join("; "));
  const at1280 = d13.find(r => r.w === 1280);
  check(!d13Bad.length && !at1280.shown && d13.some(r => r.shown) && d13.some(r => !r.shown),
    "d13 Intents' date stands exactly where the narrowest chip column keeps 520 px beside it, not at 1280", { bad: d13Bad.slice(0, 4), at1280 });

  /* d10 to d12: the desk's date on the agent's own edit of a catalog card. */
  await page.setViewport({ width: 2000, height: 900, deviceScaleFactor: 1 });
  const ID = "c-closing-anything-else";
  const save = async v => {
    await page.evaluate(id => window.openCardEditor(id, null, true), ID);
    await page.waitForSelector("#meSave", { timeout: 10000 });
    await page.evaluate(v => {
      const f = document.getElementById("me_t_en");
      if (v.now != null) { f.value = v.now; f.dispatchEvent(new Event("input", { bubbles: true })); }
      document.getElementById("meSave").click();
    }, v);
    await sleep(400);
    await page.keyboard.press("Escape");
    await sleep(200);
  };
  const catalogTitle = await page.evaluate(id => (window.BASE_M.find(m => m.id === id) || {}).t, ID);
  const t0 = Date.now();
  await save({ was: catalogTitle, now: catalogTitle + " (ours)" });
  const ov1 = await page.evaluate(id => JSON.stringify(window.pack.overrides[id] || null), ID);
  const at1 = (JSON.parse(ov1) || {}).changedAt || "";
  await library(page, "catmac", ["t-closing"]);
  const cells1 = await page.evaluate(id => {
    const c = document.querySelector('.manage-row.mg-card[data-cardrow="' + id + '"] .lw-c.dt');
    const k = document.querySelector('.mg-cat[data-cat="t-closing"] > .mg-cat-row .lw-c.dt');
    return [c ? c.textContent : null, k ? k.textContent : null];
  }, ID);
  const today = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(Date.parse(at1) || 0);
  check(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(at1) && Math.abs(Date.parse(at1) - t0) < 60000
    && cells1[0] === today && cells1[1] === today,
    "d10 a desk edit of a catalog card dates the agent's edit now, in UTC, and its category reads that day", { ov1, cells1, today });
  await sleep(1100);
  await save({ was: catalogTitle + " (ours)", now: null });
  const ov2 = await page.evaluate(id => JSON.stringify(window.pack.overrides[id] || null), ID);
  check(ov2 === ov1, "d11 a save that changes nothing dates nothing", { ov1, ov2 });
  await save({ was: catalogTitle + " (ours)", now: catalogTitle });
  const ov3 = await page.evaluate(id => JSON.stringify(window.pack.overrides[id] || null), ID);
  await library(page, "catmac", ["t-closing"]);
  const cell3 = await page.evaluate(id => {
    const c = document.querySelector('.manage-row.mg-card[data-cardrow="' + id + '"] .lw-c.dt');
    return c ? c.textContent : null;
  }, ID);
  check(ov3 === "null" && cell3 === "", "d12 the catalog's text put back leaves no edit and no date behind", { ov3, cell3 });
  await page.close();

  /* d8: Polish. */
  {
    const pl = await boot("dated", { width: 2000, height: 900 }, [["eUiLang", "pl"]]);
    await library(pl, "catmac", ["t-opening"]);
    const r = await pl.evaluate(() => {
      const h = document.querySelector(".lw-head .lw-h-dt");
      const c = document.querySelector('.manage-row.mg-card[data-cardrow="c-opening-name-and-welcome"] .lw-c.dt');
      return { head: h ? h.textContent : null, cell: c ? c.textContent : null };
    });
    await library(pl, "intents");
    const ih = await pl.evaluate(() => { const h = document.querySelector(".lw-ih-date"); return h ? h.textContent : null; });
    check(r.head === "Data zmiany" && ih === "Data zmiany" && r.cell === DAY.pl["02"], "d8 in Polish the heading is \"Data zmiany\" and the day Polish",
      { r, ih });
    await pl.close();
  }
} catch (e) {
  check(false, "run crashed: " + e.message, e.stack);
} finally {
  if (browser) await browser.close();
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}

console.log("#counts checks=" + checks + " skipped=0 failed=" + fails + " expected=" + EXPECTED);
console.log(checks + " checks, " + fails + " failed");
process.exit(fails || checks !== EXPECTED ? 1 : 0);
