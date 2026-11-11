/* Board 982: Library Intents width and linked cards (finding 4).
 *
 *   node tests/desk-982w-intents.mjs
 *
 * Headless Chrome on the built engine page and the shipped sample catalog.
 * What the eye or the hand finds:
 *   i1 at window widths 546, 700, 900, 1280, 2000 and 2560: no horizontal scrollbar, buttons end inside box
 *   i2 at 1280 and 2000: chips texts are titles of linked cards, as many as number says, ends inside row, first chip starts at same x within 1 px
 *   i3 an intent with no linked card reads "no cards yet"
 *   i4 clicking a chip opens that card's editor, showing that card
 *   i5 after the page scrolls by 600 px, the heading row's top is still at the top of the scrolling box, within 2 px
 *   i6 between 420 and 520 px no chip shown and row is one line; under 420 px buttons stand on second line at right, name takes row width and wraps whole
 *   i7 no heading reads "Date modified"
 *   i8 the number's hover reads "Linked cards: {N}" with its own number
 *   i9 the lede reads "Cards linked to every intent: {N}." with N the sample's cards marked allIntents; with those
 *      cards put away, the sentence is gone
 *   i10 in a 600 px box, a chevron outside the chips stands on exactly the rows whose chips overflow; pressing one
 *      wraps that row's chips whole inside it, every chip pressable, the mark, name and number centred on the first chip
 *      line within 2 px; pressing again closes it
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

let fails = 0, checks = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-982w-int-"));
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

async function openIntents(page) {
  await page.evaluate(() => {
    if (window.openManage) window.openManage();
  });
  await page.waitForSelector(".sx.lm-lib", { timeout: 10000 });
  const intSec = await page.$('.sx-sec[data-lm="intents"]');
  if (intSec) await intSec.click();
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
  await openIntents(page);

  /* --- i1: Window widths 546, 700, 900, 1280, 2000, 2560: no horizontal scrollbar, buttons inside box --- */
  const widths = [546, 700, 900, 1280, 2000, 2560];
  let i1Ok = true;
  let i1Detail = "";
  for (const w of widths) {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await sleep(80);
    const res = await page.evaluate(() => {
      const pageEl = document.querySelector(".sx-page#libPage") || document.querySelector(".sx-page");
      const listEl = document.querySelector(".mg-intents");
      if (!pageEl || !listEl) return { ok: false, reason: "missing pageEl or listEl" };
      const pageHScroll = pageEl.scrollWidth > pageEl.clientWidth + 1;
      const listHScroll = listEl.scrollWidth > listEl.clientWidth + 1;
      const lr = listEl.getBoundingClientRect();
      const rows = [...document.querySelectorAll(".mg-intents .manage-row.mg-int")];
      const overflowingButtons = [];
      for (const r of rows) {
        const cacts = r.querySelector(".cacts");
        if (cacts) {
          const cr = cacts.getBoundingClientRect();
          if (cr.right > lr.right + 1.5) {
            overflowingButtons.push({ right: cr.right, listRight: lr.right });
          }
        }
      }
      return {
        ok: !pageHScroll && !listHScroll && overflowingButtons.length === 0,
        pageHScroll,
        listHScroll,
        pageScrollWidth: pageEl.scrollWidth,
        pageClientWidth: pageEl.clientWidth,
        listScrollWidth: listEl.scrollWidth,
        listClientWidth: listEl.clientWidth,
        overflowingButtons: overflowingButtons.slice(0, 3),
      };
    });
    if (!res.ok) {
      i1Ok = false;
      i1Detail = `at ${w}px: ${JSON.stringify(res)}`;
      break;
    }
  }
  check(i1Ok, "i1 Intents page shows no horizontal scrollbar and every row's buttons end inside the list's box", i1Detail);

  /* --- i2: at 1280 and 2000: chips texts are titles of linked cards, as many as number says, ends inside row, first chip starts at same x within 1 px --- */
  let i2Ok = true;
  let i2Detail = "";
  for (const w of [1280, 2000]) {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await sleep(80);
    const res = await page.evaluate(() => {
      const rows = [...document.querySelectorAll(".mg-intents .manage-row.mg-int")];
      if (!rows.length) return { ok: false, reason: "no intent rows" };
      const firstX = [];
      const mismatches = [];
      let checkedRows = 0;
      for (const r of rows) {
        const numEl = r.querySelector(".mg-int-n");
        const count = numEl ? parseInt(numEl.textContent.trim(), 10) : 0;
        const mid = r.querySelector(".lw-mid") || r.querySelector(".mg-int-chips");
        if (!mid) {
          mismatches.push({ reason: "no mid container", row: r.getAttribute("data-introw") });
          continue;
        }
        const chips = [...mid.querySelectorAll(".lw-chip, button.lw-chip, span.lw-chip, button")];
        if (count > 0) {
          checkedRows++;
          if (chips.length !== count) {
            mismatches.push({ reason: "chip count mismatch", expected: count, got: chips.length, row: r.getAttribute("data-introw") });
          }
          const mr = mid.getBoundingClientRect();
          const rr = r.getBoundingClientRect();
          if (mr.right > rr.right + 1.5) {
            mismatches.push({ reason: "mid ends outside row", midRight: mr.right, rowRight: rr.right });
          }
          if (chips.length > 0) {
            const fc = chips[0].getBoundingClientRect();
            firstX.push(fc.left);
          }
        }
      }
      let alignOk = true;
      if (firstX.length > 1) {
        const minX = Math.min(...firstX);
        const maxX = Math.max(...firstX);
        if (maxX - minX > 1.0) alignOk = false;
      }
      return {
        ok: checkedRows > 0 && mismatches.length === 0 && alignOk,
        checkedRows,
        mismatches: mismatches.slice(0, 3),
        alignOk,
        firstXRange: firstX.length ? [Math.min(...firstX), Math.max(...firstX)] : null,
      };
    });
    if (!res.ok) {
      i2Ok = false;
      i2Detail = `at ${w}px: ${JSON.stringify(res)}`;
      break;
    }
  }
  check(i2Ok, "i2 chips texts are titles of linked cards, as many as number says, ends inside row, first chip starts at same x within 1 px", i2Detail);

  /* --- i3: an intent with no linked card reads 'no cards yet' --- */
  const i3Res = await page.evaluate(async () => {
    // Check existing rows for a zero-count intent
    let zeroRow = [...document.querySelectorAll(".mg-intents .manage-row.mg-int")].find(r => {
      const numEl = r.querySelector(".mg-int-n");
      return numEl && parseInt(numEl.textContent.trim(), 10) === 0;
    });

    // If none exists, create a new intent with no cards via #mgAddIntent
    if (!zeroRow) {
      const addBtn = document.getElementById("mgAddIntent");
      if (addBtn) {
        addBtn.click();
        await new Promise(r => setTimeout(r, 200));
        const topicInp = document.getElementById("ie_topic_en") || document.querySelector("#modal input");
        if (topicInp) {
          topicInp.value = "Zero Test Intent";
          topicInp.dispatchEvent(new Event("input", { bubbles: true }));
        }
        const clauseInp = document.getElementById("ie_clause_en");
        if (clauseInp) {
          clauseInp.value = "Zero test clause.";
          clauseInp.dispatchEvent(new Event("input", { bubbles: true }));
        }
        const saveBtn = document.getElementById("ieSave");
        if (saveBtn) saveBtn.click();
        await new Promise(r => setTimeout(r, 250));
        const cancelBtn = document.getElementById("ieCancel");
        if (cancelBtn) cancelBtn.click();
        else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await new Promise(r => setTimeout(r, 200));
        if (window.openManage) window.openManage();
        await new Promise(r => setTimeout(r, 100));
      }
      zeroRow = [...document.querySelectorAll(".mg-intents .manage-row.mg-int")].find(r => {
        const numEl = r.querySelector(".mg-int-n");
        return numEl && parseInt(numEl.textContent.trim(), 10) === 0;
      });
    }

    if (!zeroRow) return { ok: false, reason: "no zero-card intent row found" };
    const text = zeroRow.textContent || "";
    const hasPhrase = /no cards yet|jeszcze bez kart/.test(text);
    return { ok: hasPhrase, text, hasPhrase };
  });
  check(i3Res && i3Res.ok, "i3 an intent with no linked card reads 'no cards yet'", i3Res);

  /* --- i4: clicking a chip opens that card's editor, showing that card --- */
  const i4Res = await page.evaluate(async () => {
    const chip = document.querySelector(".mg-intents .lw-chip, .mg-intents .lw-mid button, .mg-intents .lw-mid span.lw-chip");
    if (!chip) return { ok: false, reason: "no chip element found" };
    const chipText = chip.textContent.trim();
    chip.click();
    await new Promise(r => setTimeout(r, 200));

    const modal = document.querySelector("#modal:not([hidden])");
    const titleInput = modal ? (modal.querySelector("#meTitle_en") || modal.querySelector("#meTitle_pl") || modal.querySelector(".modal-title") || modal.querySelector("h2")) : null;
    const val = titleInput ? (titleInput.value || titleInput.textContent || "") : "";
    const titleMatches = val.includes(chipText) || chipText.includes(val);

    // Close modal
    const closeBtn = document.querySelector("#modal .close, #modal .cancel, #btnCancel, #meClose");
    if (closeBtn) closeBtn.click();
    else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise(r => setTimeout(r, 100));

    return {
      ok: !!modal && titleMatches,
      modalOpen: !!modal,
      val,
      chipText,
    };
  });
  check(i4Res && i4Res.ok, "i4 clicking a chip opens that card's editor, showing that card", i4Res);

  /* --- i5: after the page scrolls by 600 px, heading row's top is still at top of scrolling box within 2 px --- */
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await sleep(80);
  const i5Res = await page.evaluate(async () => {
    const scroller = document.querySelector(".sx-page#libPage") || document.querySelector(".sx-page");
    const heading = document.querySelector(".lw-ihead") || document.querySelector(".mg-int-head");
    if (!scroller || !heading) return { ok: false, reason: "missing scroller or heading" };

    scroller.scrollTop = 0;
    await new Promise(r => setTimeout(r, 40));
    const initialH = heading.getBoundingClientRect();
    const initialS = scroller.getBoundingClientRect();

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
  check(i5Res && i5Res.ok, "i5 after page scrolls by 600 px, heading row top is at top of scrolling box within 2 px", i5Res);

  /* --- i6: box 420-520px no chip shown, one line; under 420px buttons stand on second line at right, name takes width --- */
  // 1. Box between 420 and 520 px
  // At viewport ~700 or by setting card box width
  const i6MidRes = await page.evaluate(async () => {
    const listEl = document.querySelector(".mg-intents");
    const cardEl = listEl ? listEl.closest(".sx-card") : null;
    if (!cardEl) return { ok: false, reason: "missing cardEl" };
    const origWidth = cardEl.style.width;
    cardEl.style.width = "480px";
    await new Promise(r => setTimeout(r, 60));

    const chips = [...document.querySelectorAll(".mg-intents .lw-mid")];
    const anyChipVisible = chips.some(c => c.offsetWidth > 0 || getComputedStyle(c).display !== "none");

    const row = document.querySelector(".mg-intents .manage-row.mg-int");
    if (!row) { cardEl.style.width = origWidth; return { ok: false, reason: "no row" }; }
    const nameEl = row.querySelector(".mg-int-t");
    const actsEl = row.querySelector(".cacts");
    const nr = nameEl.getBoundingClientRect();
    const ar = actsEl.getBoundingClientRect();
    const oneLine = Math.abs(nr.top - ar.top) <= 8;

    cardEl.style.width = origWidth;
    await new Promise(r => setTimeout(r, 60));

    return {
      ok: !anyChipVisible && oneLine,
      anyChipVisible,
      oneLine,
      nrTop: nr.top,
      arTop: ar.top,
    };
  });

  // 2. Box under 420 px
  // Driven by window 546px with rail open, and narrowed to 380px to test under 420px box
  const i6NarrowRes = await page.evaluate(async () => {
    const listEl = document.querySelector(".mg-intents");
    const cardEl = listEl ? listEl.closest(".sx-card") : null;
    if (!cardEl) return { ok: false, reason: "missing cardEl" };
    const origWidth = cardEl.style.width;
    // Driven to 230px, about the box a 546 px window gives (234 px measured), under the 420px container query
    cardEl.style.width = "230px";
    await new Promise(r => setTimeout(r, 60));

    const row = document.querySelector(".mg-intents .manage-row.mg-int");
    if (!row) { cardEl.style.width = origWidth; return { ok: false, reason: "no row" }; }
    const nameEl = row.querySelector(".mg-int-t");
    const actsEl = row.querySelector(".cacts");
    const rr = row.getBoundingClientRect();
    const nr = nameEl.getBoundingClientRect();
    const ar = actsEl.getBoundingClientRect();

    const buttonsBelow = ar.top >= nr.bottom - 4;
    const buttonsAtRight = Math.abs(ar.right - rr.right) <= 10;
    const nameTakesWidth = nr.width >= rr.width - 70; // accommodates mark, count, gaps and padding
    // and every intent's name wraps whole there, never cut (the designer, 03:28)
    const cutNames = [...document.querySelectorAll(".mg-intents .manage-row.mg-int .mg-int-t")]
      .filter(el => el.offsetParent && el.scrollWidth > el.clientWidth + 1).map(el => el.textContent.trim()).slice(0, 3);

    cardEl.style.width = origWidth;
    await new Promise(r => setTimeout(r, 60));

    return {
      ok: buttonsBelow && buttonsAtRight && nameTakesWidth && !cutNames.length,
      cutNames,
      buttonsBelow,
      buttonsAtRight,
      nameTakesWidth,
      arTop: ar.top,
      nrBottom: nr.bottom,
      arRight: ar.right,
      rrRight: rr.right,
      nrWidth: nr.width,
      rrWidth: rr.width,
    };
  });
  const i6Ok = !!(i6MidRes && i6MidRes.ok && i6NarrowRes && i6NarrowRes.ok);
  check(i6Ok, "i6 between 420-520px no chip and one line; under 420px buttons stand on second line at right and name takes width",
    { i6MidRes, i6NarrowRes });

  /* --- i7: no heading reads 'Date modified' --- */
  const i7Res = await page.evaluate(() => {
    const pageEl = document.querySelector(".sx-page#libPage") || document.querySelector(".sx-page");
    const text = pageEl ? pageEl.textContent : "";
    const heading = document.querySelector(".lw-ihead") || document.querySelector(".mg-int-head");
    const hText = heading ? heading.textContent : "";
    const hasDateInHead = /Date modified|Data zmiany/i.test(hText);
    return {
      ok: !hasDateInHead,
      hasDateInHead,
      headingText: hText,
    };
  });
  check(i7Res && i7Res.ok, "i7 no heading reads 'Date modified'", i7Res);

  /* --- i8: the number's hover reads 'Linked cards: {N}' with its own number --- */
  const i8Res = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".mg-intents .manage-row.mg-int")];
    if (!rows.length) return { ok: false, reason: "no rows" };
    let checked = 0;
    const bad = [];
    for (const r of rows) {
      const numEl = r.querySelector(".mg-int-n");
      if (!numEl) continue;
      const count = numEl.textContent.trim();
      const title = numEl.getAttribute("title") || "";
      checked++;
      const expectedEn = `Linked cards: ${count}`;
      const expectedPl = `Powiązane karty: ${count}`;
      if (title !== expectedEn && title !== expectedPl) {
        bad.push({ count, title, expected: expectedEn });
      }
    }
    return {
      ok: checked > 0 && bad.length === 0,
      checked,
      bad: bad.slice(0, 3),
    };
  });
  check(i8Res && i8Res.ok, "i8 the number's hover reads 'Linked cards: {N}' with its own number", i8Res);

  /* --- i10: the chevron, in a box narrow enough that a row of two or more chips overflows --- */
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  const i10Res = await page.evaluate(async () => {
    const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const box = document.querySelector(".sx-card:has(.mg-intents)");
    if (!box) return { ok: false, reason: "no intents box" };
    box.style.width = box.style.maxWidth = "600px";
    await frames(); await frames();
    const rows = [...document.querySelectorAll(".mg-intents .manage-row.mg-int")].filter(r => r.querySelector(".lw-chip"));
    const wrong = [];
    let over = 0, notOver = 0;
    for (const r of rows) {
      const mid = r.querySelector(".lw-mid"), more = r.querySelector("[data-chips-more]");
      const o = mid.scrollWidth > mid.clientWidth + 1;
      const shown = !!more && more.getClientRects().length > 0;
      if (o) over++; else notOver++;
      if (o !== shown) wrong.push({ row: r.getAttribute("data-introw"), over: o, shown });
      if (more && mid.contains(more)) wrong.push({ row: r.getAttribute("data-introw"), inside: true });
    }
    const r = rows.find(x => { const m = x.querySelector("[data-chips-more]"); return m && m.getClientRects().length; });
    let opened = null, closed = null;
    if (r) {
      const more = r.querySelector("[data-chips-more]"), mid = r.querySelector(".lw-mid"), name = r.querySelector(".mg-int-t");
      const chipH = r.querySelector(".lw-chip").getBoundingClientRect().height;
      more.click();
      await frames();
      r.scrollIntoView({ block: "center" });
      await frames();
      const mr = mid.getBoundingClientRect();
      const chips = [...mid.querySelectorAll(".lw-chip")];
      const outside = chips.filter(c => { const k = c.getBoundingClientRect(); return k.right > mr.right + 1 || k.bottom > mr.bottom + 1 || k.left < mr.left - 1; }).length;
      const unpressable = chips.filter(c => { const k = c.getBoundingClientRect(); const e = document.elementFromPoint(k.left + k.width / 2, k.top + k.height / 2); return !e || !c.contains(e); }).length;
      const firstChip = chips[0].getBoundingClientRect();
      const mid1 = firstChip.top + firstChip.height / 2;
      const centre = el => { const k = el.getBoundingClientRect(); return k.top + k.height / 2; };
      const markEl = r.querySelector(".cat-slot");
      const offTop = Math.max(Math.abs(centre(markEl) - mid1), Math.abs(centre(r.querySelector(".mg-int-n")) - mid1),
        Math.abs(r.querySelector(".mg-int-t").getBoundingClientRect().top + 12 - mid1));
      opened = { offTop: Math.round(offTop * 10) / 10, expanded: more.getAttribute("aria-expanded"), lines: Math.round(mr.height / chipH), outside, unpressable,
        nameFirstLine: name.getBoundingClientRect().top < firstChip.bottom, tab: more.tabIndex, label: more.getAttribute("aria-label") };
      more.click();
      await frames();
      closed = { expanded: more.getAttribute("aria-expanded"), height: Math.round(mid.getBoundingClientRect().height), chipH: Math.round(chipH),
        shown: more.getClientRects().length > 0 };
    }
    box.style.width = box.style.maxWidth = "";
    const ok = rows.length > 0 && over > 0 && !wrong.length && !!opened && opened.expanded === "true" && opened.lines >= 2
      && opened.outside === 0 && opened.unpressable === 0 && opened.nameFirstLine && opened.offTop <= 2 && opened.tab >= 0
      && closed.expanded === "false" && closed.height < closed.chipH * 1.5 && closed.shown;
    return { ok, rows: rows.length, over, notOver, wrong: wrong.slice(0, 3), opened, closed };
  });
  check(i10Res && i10Res.ok, "i10 a chevron stands on exactly the overflowing rows; it opens that row's chips whole and pressable, name on the first line, and closes it", i10Res);

  /* --- i9: the every-intent sentence, counted live from the catalog's own marks --- */
  const sample = JSON.parse(fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8"));
  const everyIds = (sample.cards || []).filter(c => c && c.allIntents === true).map(c => c.id);
  const ledeText = () => page.evaluate(async () => {
    if (window.openManage) window.openManage();
    await new Promise(r => setTimeout(r, 100));
    const s = document.querySelector('.sx-sec[data-lm="intents"]');
    if (s) s.click();
    await new Promise(r => setTimeout(r, 100));
    const l = document.getElementById("libLede");
    return l ? l.textContent : null;
  });
  const ledeOn = await ledeText();
  const hid = await page.evaluate(async ids => {
    const s = document.querySelector('.sx-sec[data-lm="catmac"]');
    if (s) s.click();
    await new Promise(r => setTimeout(r, 100));
    let n = 0;
    for (const id of ids) {
      const b = [...document.querySelectorAll("[data-hide-card]")].find(x => x.getAttribute("data-hide-card") === id);
      if (b) { b.click(); n++; await new Promise(r => setTimeout(r, 400)); }
    }
    return n;
  }, everyIds);
  const ledeOff = await ledeText();
  const wantOn = "Cards linked to every intent: " + everyIds.length + ".";
  check(everyIds.length > 0 && !!ledeOn && ledeOn.includes(wantOn) && hid === everyIds.length && !!ledeOff && !/every intent/.test(ledeOff),
    "i9 the lede reads 'Cards linked to every intent: {N}.' with the catalog's own count, and drops it when those cards are put away",
    { everyIds: everyIds.length, ledeOn, hid, ledeOff });

} catch (e) {
  check(false, "run crashed: " + e.message, e.stack);
} finally {
  if (browser) await browser.close();
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}

console.log("#counts checks=" + checks + " skipped=0 failed=" + fails + " expected=10");
console.log(checks + " checks, " + fails + " failed");
process.exit(fails || checks !== 10 ? 1 : 0);
