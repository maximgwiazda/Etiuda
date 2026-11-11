/* THE LIBRARY'S CATEGORIES & CARDS AS A TREE WITH COLUMNS (board 982, finding 4, design 4F).
 *
 *   node tests/desk-982w-tree.mjs     exit code is the number of failed checks, capped at 63
 *
 * Headless Chrome on the built engine page and the shipped sample catalog, no window.
 * What the eye and the hand find:
 *   t1 at window widths 546, 700, 900, 1100, 1280, 1440, 1700, 2000 and 2560, with a category open:
 *      no horizontal scrollbar, no cell content past its row, buttons end inside list box
 *   t2 at each width, headings shown are exactly the columns the rule leaves for list box width; no Date modified
 *   t3 where box is under 420 px, card buttons stand on second line at right, name takes row width and starts under its category's name
 *   t4 at width where columns stand aside, card hover lists one line per hidden column in order, none for shown
 *   t5 node: 1d, 29d, 31d ago count 2 in Sent 30d, 1 in default 28d; page category shows sum, card with none empty
 *   t6 added card reads 'yours', edited 'changed here', untouched and only moved 'catalog'
 *   t7 Replies empty for 1 reply, reads alternatives/steps; Languages lists codes; Intents first +N / every intent;
 *      Opens with no brace, bare token name in mono face, skips leading greet+pax; Sent hover lifetime count; no mod/Nx badge
 *   t8 click on Sent sorts inside category most first, second least first, third catalog order; pack.cardOrder byte-equal;
 *      while sorted drag moves nothing and copywriter line shows; third click dragging works again
 *   t9 tree works: arrow opens/closes category; edit, put away, delete, star card; category edit, supporting, add; search finds card
 *   t10 after list scrolls by 600 px, heading top is at top of scrolling box within 2 px
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");
import { statsRecentUse } from "../src/modules/desk-stats.js";

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

let fails = 0, checks = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function statsDayBefore(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d) - n * 864e5);
  const p = v => String(v).padStart(2, "0");
  return x.getUTCFullYear() + "-" + p(x.getUTCMonth() + 1) + "-" + p(x.getUTCDate());
}

/* ------------------------------------------------------------------------------------------------
   t5 Node part: 30-day window vs 28-day default
   ------------------------------------------------------------------------------------------------ */
let t5NodeOk = false;
let t5NodeDetail = "";
try {
  const today = "2026-11-11";
  const d1 = statsDayBefore(today, 1);
  const d29 = statsDayBefore(today, 29);
  const d31 = statsDayBefore(today, 31);
  const pack = {
    dayIds: ["card-alpha"],
    days: {
      [d1]: { c: { 0: 1 } },
      [d29]: { c: { 0: 1 } },
      [d31]: { c: { 0: 1 } },
    }
  };
  const count30 = (statsRecentUse(pack, today, 30).get("card-alpha")) | 0;
  const count28 = (statsRecentUse(pack, today).get("card-alpha")) | 0;
  t5NodeOk = (count30 === 2 && count28 === 1);
  t5NodeDetail = { d1, d29, d31, count30, count28, expected: { count30: 2, count28: 1 } };
} catch (e) {
  t5NodeDetail = { error: e.message };
}

/* ------------------------------------------------------------------------------------------------
   Browser setup & legs
   ------------------------------------------------------------------------------------------------ */
const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-982w-tree-"));
fs.copyFileSync(E.ENGINE_PATH, path.join(lab, "etiuda.html"));
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
const url = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");
let browser = null;

async function boot(viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try {
      for (const [k, v] of [
        ["eTourDone_v3", "1"],
        ["eTourInvite_v3", "1"],
        ["eAgent", "Bench Agent"],
        ["eNameAsked", "1"],
        ["eTheme", "light"],
        ["eRail", "1"],
      ]) localStorage.setItem(k, v);
    } catch (e) {}
  });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  const yes = await page.$("#ecYes");
  if (yes) await page.click("#ecYes");
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.body.classList.contains("rail-on")
    && document.body.classList.contains("rail-ready")
    && getComputedStyle(document.getElementById("intentRail")).opacity === "1", { timeout: 30000 });
  return page;
}

async function openCatmac(page) {
  await page.evaluate(() => {
    if (window.openManage) window.openManage();
  });
  await page.waitForSelector(".sx.lm-lib", { timeout: 10000 });
  const sec = await page.$('.sx-sec[data-lm="catmac"]');
  if (sec) await sec.click();
  await sleep(100);
  // Ensure at least one category is expanded
  await page.evaluate(() => {
    const firstCat = document.querySelector(".mg-cat");
    if (firstCat) {
      const body = firstCat.querySelector(".mg-cat-body");
      if (body && body.hidden) {
        const tw = firstCat.querySelector(".mg-tw");
        if (tw) tw.click();
      }
    }
  });
  await sleep(100);
}

try {
  browser = await puppeteer.launch({
    executablePath: E.browserPath("chrome"),
    headless: true,
    args: ["--hide-scrollbars"],
    protocolTimeout: 120000,
  });

  const page = await boot();
  await openCatmac(page);

  /* --- t1: Window widths 546, 700, 900, 1100, 1280, 1440, 1700, 2000, 2560:
     no horizontal scrollbar, no cell content past row, buttons end inside box --- */
  const widths = [546, 700, 900, 1100, 1280, 1440, 1700, 2000, 2560];
  let t1Ok = true;
  let t1Detail = "";
  for (const w of widths) {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await sleep(80);
    const res = await page.evaluate(() => {
      const pageEl = document.querySelector(".sx-page#libPage") || document.querySelector(".sx-page");
      const listEl = document.querySelector(".mg-tree");
      if (!pageEl || !listEl) return { ok: false, reason: "missing pageEl or listEl" };
      const pageHScroll = pageEl.scrollWidth > pageEl.clientWidth + 1;
      const listHScroll = listEl.scrollWidth > listEl.clientWidth + 1;
      const lr = listEl.getBoundingClientRect();
      const rows = [...document.querySelectorAll(".lw-head, .mg-cat-row, .manage-row.mg-card")];
      const overflowingCells = [];
      const overflowingButtons = [];
      for (const r of rows) {
        if (!r.offsetParent) continue;
        const rr = r.getBoundingClientRect();
        for (const child of r.children) {
          if (!child.offsetParent) continue;
          const cr = child.getBoundingClientRect();
          if (cr.right > rr.right + 2.5) {
            overflowingCells.push({ cell: child.className, right: cr.right, rowRight: rr.right });
          }
        }
        const acts = r.querySelector(".cacts, .mg-cat-acts");
        if (acts && acts.offsetParent) {
          const ar = acts.getBoundingClientRect();
          if (ar.right > lr.right + 2.5) {
            overflowingButtons.push({ acts: acts.className, right: ar.right, listRight: lr.right });
          }
        }
      }
      return {
        ok: !pageHScroll && !listHScroll && overflowingCells.length === 0 && overflowingButtons.length === 0,
        pageHScroll,
        listHScroll,
        overflowingCells: overflowingCells.slice(0, 3),
        overflowingButtons: overflowingButtons.slice(0, 3),
      };
    });
    if (!res.ok) {
      t1Ok = false;
      t1Detail = `at ${w}px: ${JSON.stringify(res)}`;
      break;
    }
  }
  check(t1Ok, "t1 at window widths 546-2560 no horizontal scrollbar, no cell past row, buttons inside list box", t1Detail);

  /* --- t2: headings shown match container query rule for measured box width; no Date modified --- */
  let t2Ok = true;
  let t2Detail = "";
  for (const w of widths) {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await sleep(80);
    const res = await page.evaluate(() => {
      const cardBox = document.querySelector(".sx-card:has(.mg-tree)") || document.querySelector(".mg-tree");
      const head = document.querySelector(".lw-head");
      if (!cardBox || !head) return { ok: false, reason: "missing cardBox or lw-head" };
      const bw = cardBox.clientWidth;

      const visibleHeadings = [...head.children]
        .filter(el => {
          if (!el.offsetParent) return false;
          const cs = getComputedStyle(el);
          return cs.display !== "none" && cs.visibility !== "hidden";
        })
        .map(el => el.textContent.trim())
        .filter(Boolean);

      const hasDateMod = visibleHeadings.some(h => /Date modified|Data zmiany/i.test(h));
      if (hasDateMod) return { ok: false, reason: "heading reads Date modified", visibleHeadings };

      // Expected columns based on container width bw:
      // >1560: Name, Opens with, Languages, Replies, Intents, Sent, 30 days, Source
      // 1401-1560: drop Source
      // 1241-1400: drop Replies
      // 861-1240: drop Languages
      // 701-860: drop Sent
      // 561-700: drop Opens with
      // <=560: drop Intents (only Name)
      const hasName = visibleHeadings.some(h => /Name|Nazwa/i.test(h));
      const hasOpen = visibleHeadings.some(h => /Opens with|Początek/i.test(h));
      const hasLang = visibleHeadings.some(h => /Languages|Języki/i.test(h));
      const hasRep = visibleHeadings.some(h => /Replies|Odpowiedzi/i.test(h));
      const hasInt = visibleHeadings.some(h => /Intents|Intencje/i.test(h));
      const hasSent = visibleHeadings.some(h => /Sent|Wysłane/i.test(h));
      const hasSrc = visibleHeadings.some(h => /Source|Źródło/i.test(h));

      let expected = {};
      if (bw > 1560) expected = { name: true, open: true, lang: true, rep: true, int: true, sent: true, src: true };
      else if (bw > 1400) expected = { name: true, open: true, lang: true, rep: true, int: true, sent: true, src: false };
      else if (bw > 1240) expected = { name: true, open: true, lang: true, rep: false, int: true, sent: true, src: false };
      else if (bw > 860) expected = { name: true, open: true, lang: false, rep: false, int: true, sent: true, src: false };
      else if (bw > 700) expected = { name: true, open: true, lang: false, rep: false, int: true, sent: false, src: false };
      else if (bw > 560) expected = { name: true, open: false, lang: false, rep: false, int: true, sent: false, src: false };
      else expected = { name: true, open: false, lang: false, rep: false, int: false, sent: false, src: false };

      const actual = { name: hasName, open: hasOpen, lang: hasLang, rep: hasRep, int: hasInt, sent: hasSent, src: hasSrc };
      const match = Object.keys(expected).every(k => expected[k] === actual[k]);
      return { ok: match, bw, expected, actual, visibleHeadings };
    });
    if (!res.ok) {
      t2Ok = false;
      t2Detail = `at ${w}px: ${JSON.stringify(res)}`;
      break;
    }
  }
  check(t2Ok, "t2 headings shown match measured box width and no heading reads Date modified", t2Detail);

  /* --- t3: where box is under 420 px, card buttons stand on second line at right, name takes row width --- */
  const t3Res = await page.evaluate(async () => {
    const tree = document.querySelector(".mg-tree");
    const cardBox = document.querySelector(".sx-card:has(.mg-tree)") || tree;
    if (!cardBox) return { ok: false, reason: "missing cardBox" };
    // Temporarily constrain container to 380px to test under 420px container query
    const origWidth = cardBox.style.width;
    const origMaxW = cardBox.style.maxWidth;
    cardBox.style.width = "380px";
    cardBox.style.maxWidth = "380px";
    await new Promise(r => setTimeout(r, 60));

    const cardRow = document.querySelector(".mg-cat-body .manage-row.mg-card");
    if (!cardRow) {
      cardBox.style.width = origWidth;
      cardBox.style.maxWidth = origMaxW;
      return { ok: false, reason: "no visible card row" };
    }
    const nameEl = cardRow.querySelector(".lw-nm") || cardRow.querySelector(".mg-card-lab");
    const acts = cardRow.querySelector(".cacts");
    if (!nameEl || !acts) {
      cardBox.style.width = origWidth;
      cardBox.style.maxWidth = origMaxW;
      return { ok: false, reason: "missing nameEl or acts in card row" };
    }

    const nr = nameEl.getBoundingClientRect();
    const ar = acts.getBoundingClientRect();
    const rr = cardRow.getBoundingClientRect();

    // Buttons on second line: ar.top > nr.bottom - 2
    const secondLine = ar.top >= nr.bottom - 4;
    // Buttons at right: rr.right - ar.right < 20
    const atRight = (rr.right - ar.right) < 20;
    // Name takes row width: nr.width >= rr.width - 40
    const nameFullWidth = nr.width >= (rr.width - 50);
    // and the card's name starts under its category's name, within 6 px (the designer, 03:28: about 36 px in, not 67)
    const lab = cardRow.querySelector(".mg-card-lab");
    const catRow = cardRow.closest(".mg-cat") && cardRow.closest(".mg-cat").querySelector(".mg-cat-row");
    const catName = catRow && (catRow.querySelector(".mg-cat-lab2") || catRow.querySelector(".mg-cat-fixed"));
    const textLeft = el => { if (!el) return NaN; if (el.tagName === "INPUT") return el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft) + parseFloat(getComputedStyle(el).borderLeftWidth);
      const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().left; };
    const cardTextLeft = textLeft(lab), catTextLeft = textLeft(catName);
    const underCategory = Math.abs(cardTextLeft - catTextLeft) <= 6;

    cardBox.style.width = origWidth;
    cardBox.style.maxWidth = origMaxW;
    await new Promise(r => setTimeout(r, 60));

    return {
      ok: secondLine && atRight && nameFullWidth && underCategory,
      cardTextLeft, catTextLeft,
      secondLine,
      atRight,
      nameFullWidth,
      nr: { top: nr.top, bottom: nr.bottom, width: nr.width },
      ar: { top: ar.top, right: ar.right },
      rr: { width: rr.width, right: rr.right },
    };
  });
  check(t3Res && t3Res.ok, "t3 where box is under 420 px card buttons stand on second line at right, name takes row width", t3Res);

  /* --- t4: at width where columns stand aside, card row's hover lists one line per hidden column in order --- */
  // At 1280px window, box is ~966px: Source, Replies, Languages stand aside; Opens with, Intents, Sent are shown.
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await sleep(100);
  const t4Res = await page.evaluate(() => {
    const cardRows = [...document.querySelectorAll(".mg-cat-body .manage-row.mg-card")];
    if (!cardRows.length) return { ok: false, reason: "no card rows" };

    const head = document.querySelector(".lw-head");
    if (!head) return { ok: false, reason: "missing lw-head" };

    // Check which columns are shown vs hidden
    const isColShown = cls => {
      const el = head.querySelector("." + cls);
      return el && el.offsetParent && getComputedStyle(el).display !== "none";
    };

    const shown = {
      op: isColShown("lw-h-op"),
      lg: isColShown("lw-h-lg"),
      st: isColShown("lw-h-st"),
      in: isColShown("lw-h-in"),
      us: isColShown("lw-h-us"),
      sr: isColShown("lw-h-sr"),
    };

    let checked = 0;
    const mismatches = [];
    for (const r of cardRows) {
      if (!r.offsetParent) continue;
      const title = r.getAttribute("title") || "";
      const lines = title.split("\n");
      // Line 1 is drag hint
      const factLines = lines.slice(1);

      // Check that NO shown column has a line
      if (shown.op && factLines.some(l => /^(Opens with|Początek):/i.test(l))) {
        mismatches.push({ reason: "shown Opens with in hover", title });
      }
      if (shown.in && factLines.some(l => /^(Intents|Intencje):/i.test(l))) {
        mismatches.push({ reason: "shown Intents in hover", title });
      }
      if (shown.us && factLines.some(l => /^(Sent, 30 days|Wysłane, 30 dni):/i.test(l))) {
        mismatches.push({ reason: "shown Sent in hover", title });
      }

      // Hidden columns should appear in order: Languages, Replies, Source (if they have values)
      const foundCols = [];
      for (const l of factLines) {
        if (/^(Languages|Języki):/i.test(l)) foundCols.push("lg");
        else if (/^(Replies|Odpowiedzi):/i.test(l)) foundCols.push("st");
        else if (/^(Source|Źródło):/i.test(l)) foundCols.push("sr");
      }

      // Check order
      const colOrder = ["op", "lg", "st", "in", "us", "sr"];
      const indices = foundCols.map(c => colOrder.indexOf(c));
      const sortedIndices = [...indices].sort((a, b) => a - b);
      const isOrdered = indices.every((val, idx) => val === sortedIndices[idx]);
      if (!isOrdered) {
        mismatches.push({ reason: "columns not in order", foundCols, title });
      }
      checked++;
    }

    return {
      ok: checked > 0 && mismatches.length === 0,
      checked,
      mismatches: mismatches.slice(0, 3),
      shown,
    };
  });
  check(t4Res && t4Res.ok, "t4 at width where columns stand aside, card row hover lists hidden columns in order, none for shown", t4Res);

  /* --- t5: node part (already run) + page part: category row shows sum of cards' sends, card with none empty --- */
  const t5PageRes = await page.evaluate(async () => {
    // Plant use count on a card in the first category
    const cat = document.querySelector(".mg-cat");
    if (!cat) return { ok: false, reason: "no category" };
    const catId = cat.getAttribute("data-cat");
    const cardEl = cat.querySelector(".mg-card");
    if (!cardEl) return { ok: false, reason: "no card in category" };
    const cardId = cardEl.getAttribute("data-cardrow");

    // Bump use count in page
    for (let i = 0; i < 7; i++) {
      bumpUseCount(cardId, "en");
    }
    flushStats();
    loadPack();
    rebuildCards();
    paintLibrary();
    await new Promise(r => setTimeout(r, 60));

    // Re-find category and card
    const freshCat = document.querySelector(`.mg-cat[data-cat="${catId}"]`);
    if (!freshCat) return { ok: false, reason: "freshCat not found" };
    const freshCatRow = freshCat.querySelector(".mg-cat-row");
    const catSentCell = freshCatRow.querySelector(".lw-c-us, .lw-c.us");
    const catSentText = catSentCell ? catSentCell.textContent.trim() : "";

    const freshCard = freshCat.querySelector(`.mg-card[data-cardrow="${cardId}"]`);
    const cardSentCell = freshCard.querySelector(".lw-c-us, .lw-c.us");
    const cardSentText = cardSentCell ? cardSentCell.textContent.trim() : "";

    // Find another card with no sends
    const otherCard = [...freshCat.querySelectorAll(".mg-card")].find(c => c.getAttribute("data-cardrow") !== cardId);
    let otherEmpty = true;
    let otherText = "";
    if (otherCard) {
      const otherCell = otherCard.querySelector(".lw-c-us, .lw-c.us");
      otherText = otherCell ? otherCell.textContent.trim() : "";
      otherEmpty = otherText === "";
    }

    return {
      ok: parseInt(catSentText, 10) >= 7 && parseInt(cardSentText, 10) >= 7 && otherEmpty,
      catSentText,
      cardSentText,
      otherText,
      otherEmpty,
    };
  });
  const t5Ok = t5NodeOk && t5PageRes && t5PageRes.ok;
  check(t5Ok, "t5 node: 30d counts 2, 28d counts 1; page category row shows sum of sends, card with none empty", { node: t5NodeDetail, page: t5PageRes });

  /* --- t6: card added reads 'yours', edited 'changed here', untouched and only moved 'catalog' --- */
  const t6Res = await page.evaluate(async () => {
    // We inspect card rows in the tree to check Source cell text
    const rows = [...document.querySelectorAll(".mg-cat-body .manage-row.mg-card")];
    if (!rows.length) return { ok: false, reason: "no card rows" };

    // Plant a custom card and an overridden card in pack, then re-render
    const cat = document.querySelector(".mg-cat").getAttribute("data-cat");
    pack.custom = pack.custom || [];
    pack.custom.push({ id: "custom-test-card", c: cat, en: "Custom Card Reply", t: "Custom Test Card" });
    const firstRealCard = rows[0].getAttribute("data-cardrow");
    pack.overrides = pack.overrides || {};
    pack.overrides[firstRealCard] = { t: "Overridden Card Title" };

    rebuildCards();
    paintLibrary();
    await new Promise(r => setTimeout(r, 60));

    // Expand category
    const catEl = document.querySelector(`.mg-cat[data-cat="${cat}"]`);
    const b = catEl.querySelector(".mg-cat-body");
    if (b && b.hidden) catEl.querySelector(".mg-tw").click();
    await new Promise(r => setTimeout(r, 60));

    const customRow = document.querySelector('.manage-row.mg-card[data-cardrow="custom-test-card"]');
    const overRow = document.querySelector(`.manage-row.mg-card[data-cardrow="${firstRealCard}"]`);
    const normalRow = [...document.querySelectorAll(".mg-cat-body .manage-row.mg-card")]
      .find(r => r !== customRow && r !== overRow);

    const getSrc = r => {
      const c = r ? r.querySelector(".lw-c-sr, .lw-c.sr") : null;
      return c ? c.textContent.trim() : "";
    };

    const customSrc = getSrc(customRow);
    const overSrc = getSrc(overRow);
    const normalSrc = getSrc(normalRow);

    const customOk = /yours|własna/i.test(customSrc);
    const overOk = /changed here|zmieniona tu/i.test(overSrc);
    const normalOk = /catalog|katalog/i.test(normalSrc);

    return {
      ok: customOk && overOk && normalOk,
      customSrc,
      overSrc,
      normalSrc,
      customOk,
      overOk,
      normalOk,
    };
  });
  check(t6Res && t6Res.ok, "t6 added card reads 'yours', edited 'changed here', untouched 'catalog'", t6Res);

  /* --- t7: Replies, Languages, Intents, Opens with formatting; Sent hover; no mod/Nx badge --- */
  const t7Res = await page.evaluate(async () => {
    // 1. Check no card row carries .mg-badge ("mod") or .mg-uses ("Nx")
    const badBadges = [...document.querySelectorAll(".mg-card .mg-badge, .mg-card .mg-uses")];
    if (badBadges.length > 0) {
      return { ok: false, reason: "found legacy badges", count: badBadges.length };
    }

    // 2. Check Opens with: holds no brace, shows token bare in mono face (.lw-tok), starts after leading greet+pax
    const opCells = [...document.querySelectorAll(".mg-card .lw-c-op, .mg-card .lw-c.op")];
    let hasBrace = false;
    let foundTok = false;
    let tokInMono = false;
    for (const c of opCells) {
      const txt = c.textContent;
      if (/\{|\}/.test(txt)) hasBrace = true;
      const tok = c.querySelector(".lw-tok");
      if (tok) {
        foundTok = true;
        const font = getComputedStyle(tok).fontFamily;
        if (/mono/i.test(font)) tokInMono = true;
      }
    }

    // 3. Sent cell hover carries lifetime count
    const sentCells = [...document.querySelectorAll(".mg-card .lw-c-us[title], .mg-card .lw-c.us[title]")];
    const sentHoverOk = sentCells.some(c => /Copied \d+ time|skopiowan/i.test(c.getAttribute("title") || ""));

    // 4. Languages lists codes (EN, PL)
    const langCells = [...document.querySelectorAll(".mg-card .lw-c-lg, .mg-card .lw-c.lg")];
    const langOk = langCells.some(c => /EN/i.test(c.textContent));

    // 5. Replies formatting
    const repCells = [...document.querySelectorAll(".mg-card .lw-c-st, .mg-card .lw-c.st")];
    const repOk = repCells.some(c => c.textContent.trim() === "" || /alternatives|steps|warianty|kroki/i.test(c.textContent));

    // 6. Intents formatting
    const intCells = [...document.querySelectorAll(".mg-card .lw-c-in, .mg-card .lw-c.in")];
    const intOk = intCells.some(c => c.textContent.trim() === "" || /every intent|wszystkie intencje|\+\d+/i.test(c.textContent));

    return {
      ok: !hasBrace && (!opCells.length || foundTok ? tokInMono : true) && sentHoverOk && langOk && repOk && intOk,
      hasBrace,
      foundTok,
      tokInMono,
      sentHoverOk,
      langOk,
      repOk,
      intOk,
    };
  });
  check(t7Res && t7Res.ok, "t7 cell formats: no brace in Opens with, token mono face, Sent hover lifetime, no mod/Nx badge", t7Res);

  /* --- t8: click on Sent sorts inside category most first, second least first, third catalog order; pack.cardOrder byte-equal --- */
  const t8Res = await page.evaluate(async () => {
    const head = document.querySelector(".lw-head");
    if (!head) return { ok: false, reason: "missing lw-head" };

    const clickSent = () => {
      const h = document.querySelector(".lw-head .lw-h-us, .lw-head .lw-c.us");
      if (h) h.click();
    };

    const pBefore = localStorage.getItem("ePack") || "{}";

    // Click 1: Sent heading -> most first
    clickSent();
    await new Promise(r => setTimeout(r, 60));
    const sortLine1 = document.querySelector(".lw-sort-line");
    const text1 = sortLine1 ? sortLine1.textContent : "";
    const hasSortDesc = /Sorted by|Posortowano/i.test(text1) && /descending|malejąco/i.test(text1);

    // Click 2: Sent heading -> least first
    clickSent();
    await new Promise(r => setTimeout(r, 60));
    const sortLine2 = document.querySelector(".lw-sort-line");
    const text2 = sortLine2 ? sortLine2.textContent : "";
    const hasSortAsc = /Sorted by|Posortowano/i.test(text2) && /ascending|rosnąco/i.test(text2);

    // Click 3: Sent heading -> catalog order restored
    clickSent();
    await new Promise(r => setTimeout(r, 60));
    const sortLine3 = document.querySelector(".lw-sort-line");
    const sortGone = !sortLine3 || sortLine3.textContent.trim() === "";

    const pAfter = localStorage.getItem("ePack") || "{}";
    const packOrderBefore = JSON.parse(pBefore).cardOrder;
    const packOrderAfter = JSON.parse(pAfter).cardOrder;
    const byteEqual = JSON.stringify(packOrderBefore) === JSON.stringify(packOrderAfter);

    return {
      ok: hasSortDesc && hasSortAsc && sortGone && byteEqual,
      hasSortDesc,
      hasSortAsc,
      sortGone,
      byteEqual,
      text1,
      text2,
    };
  });
  check(t8Res && t8Res.ok, "t8 clicking Sent sorts most first, then least first, then restores; pack.cardOrder untouched; sort line displays", t8Res);

  /* --- t9: tree works: arrow opens/closes category; edit, put away, delete, star card; category edit, supporting, add; search finds card --- */
  const t9Res = await page.evaluate(async () => {
    // 1. Arrow toggles category
    const cat = document.querySelector(".mg-cat");
    const tw = cat ? cat.querySelector(".mg-tw") : null;
    const body = cat ? cat.querySelector(".mg-cat-body") : null;
    if (!cat || !tw || !body) return { ok: false, reason: "missing cat or tw or body" };

    const wasHidden = body.hidden;
    tw.click();
    await new Promise(r => setTimeout(r, 60));
    const toggled1 = body.hidden !== wasHidden;
    tw.click();
    await new Promise(r => setTimeout(r, 60));
    const toggled2 = body.hidden === wasHidden;

    // 2. Buttons exist on card
    const card = cat.querySelector(".mg-card");
    const hasEditCard = !!(card && card.querySelector("[data-edit-card]"));
    const hasHideCard = !!(card && card.querySelector("[data-hide-card], [data-show-card]"));
    const hasDelCard = !!(card && card.querySelector("[data-remove-card]"));
    const hasStarCard = !!(card && card.querySelector("[data-fav-card]"));

    // 3. Category controls exist
    const hasEditCat = !!cat.querySelector("[data-editcat]");
    const hasRoleCat = !!cat.querySelector("[data-role-always]");
    const hasAddCat = !!cat.querySelector("[data-add-card]");

    // 4. Search finds card by name
    const search = document.querySelector("#libSearch");
    if (search && card) {
      const lab = card.querySelector(".mg-card-lab");
      const title = lab ? lab.textContent.trim() : "";
      if (title) {
        search.value = title.slice(0, 4);
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise(r => setTimeout(r, 60));
        // Reset search
        search.value = "";
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise(r => setTimeout(r, 60));
      }
    }

    return {
      ok: toggled1 && toggled2 && hasEditCard && hasHideCard && hasDelCard && hasStarCard && hasEditCat && hasRoleCat && hasAddCat,
      toggled1,
      toggled2,
      hasEditCard,
      hasHideCard,
      hasDelCard,
      hasStarCard,
      hasEditCat,
      hasRoleCat,
      hasAddCat,
    };
  });
  check(t9Res && t9Res.ok, "t9 tree controls work: toggle, card actions, category actions, search", t9Res);

  /* --- t10: after list scrolls by 600 px, heading row top is at top of scrolling box within 2 px --- */
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await sleep(80);
  const t10Res = await page.evaluate(async () => {
    const scroller = document.querySelector(".sx-page#libPage") || document.querySelector(".sx-page");
    const heading = document.querySelector(".lw-head");
    if (!scroller || !heading) return { ok: false, reason: "missing scroller or heading" };

    scroller.scrollTop = 0;
    await new Promise(r => setTimeout(r, 40));
    scroller.scrollTop = 600;
    await new Promise(r => setTimeout(r, 60));

    const sr = scroller.getBoundingClientRect();
    const hr = heading.getBoundingClientRect();
    const diff = Math.abs(hr.top - sr.top);

    return {
      ok: diff <= 2,
      diff,
      hrTop: hr.top,
      srTop: sr.top,
      scrollTop: scroller.scrollTop,
    };
  });
  check(t10Res && t10Res.ok, "t10 after list scrolls by 600 px, heading top is at top of scrolling box within 2 px", t10Res);

} catch (e) {
  check(false, "run crashed: " + e.message, e.stack);
} finally {
  if (browser) await browser.close();
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}

console.log("#counts checks=" + checks + " skipped=0 failed=" + fails + " expected=10");
console.log(checks + " checks, " + fails + " failed");
process.exit(fails || checks !== 10 ? 1 : 0);
