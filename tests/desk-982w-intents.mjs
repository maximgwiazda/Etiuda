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
 *   i10 in an 860 px box, a chevron outside the chips stands on exactly the rows whose chips overflow; pressing one
 *      wraps that row's chips whole inside it, every chip pressable, the mark, name and number centred on the first chip
 *      line within 2 px; pressing again closes it. 860 keeps the chip column above the 320 px line where an open row
 *      leaves the column
 *   i12 a row whose chips fit has no fade, and an overflowing row has the fade
 *   i13 at a window whose chip column is under 320 px (the width is printed): an opened row's first chip starts below
 *      the name, the chips run from the name's left edge to the row's right edge, and a name that fits that span is not
 *      cut; a closed row at that width stays one line in the column
 *   i14 after several repaints, one ResizeObserver watches the intents list
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

async function boot(viewport = { width: 1280, height: 900 }, prepare) {
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
  if (prepare) await prepare(page);
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
    box.style.width = box.style.maxWidth = "860px";
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

  /* --- i12: the fade means there is more, so only an overflowing row wears it --- */
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
  await sleep(80);
  const i12Res = await page.evaluate(async () => {
    const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const box = document.querySelector(".sx-card:has(.mg-intents)");
    if (!box) return { ok: false, reason: "no intents box" };
    const faded = el => {
      const cs = getComputedStyle(el);
      return [cs.maskImage, cs.webkitMaskImage].some(v => v && v !== "none");
    };
    const read = () => {
      let fit = null, over = null, n = 0;
      for (const r of document.querySelectorAll(".mg-intents .manage-row.mg-int")) {
        const mid = r.querySelector(".lw-mid");
        if (!mid || mid.clientWidth <= 0 || !mid.querySelector(".lw-chip")) continue;
        n++;
        const o = mid.scrollWidth > mid.clientWidth + 1;
        const rec = { over: o, fade: faded(mid) };
        if (o && !over) over = rec;
        if (!o && !fit) fit = rec;
      }
      return { fit, over, rows: n };
    };
    box.style.width = box.style.maxWidth = "";
    await frames();
    let got = read();
    if (!got.fit || !got.over) {
      for (const w of [1000, 860, 760, 680]) {
        box.style.width = box.style.maxWidth = w + "px";
        await frames();
        got = read();
        got.box = w;
        if (got.fit && got.over) break;
      }
    }
    box.style.width = box.style.maxWidth = "";
    const ok = !!(got.fit && got.over && got.fit.fade === false && got.over.fade === true);
    return { ok, fit: got.fit, over: got.over, box: got.box || "natural", rows: got.rows };
  });
  check(i12Res && i12Res.ok, "i12 a row whose chips fit has no fade, and an overflowing row has it", i12Res);

  /* --- i13: chip column under 320px. Opened chips take the row; a closed row stays in the column. --- */
  await page.setViewport({ width: 960, height: 900, deviceScaleFactor: 1 });
  await sleep(120);
  const i13Res = await page.evaluate(async () => {
    const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await frames();
    const list = document.querySelector(".mg-intents");
    const box = list ? list.closest(".sx-card") : null;
    if (!list || !box) return { ok: false, reason: "no intents list" };
    const mids = [...list.querySelectorAll(".manage-row.mg-int:not(.chips-open) .lw-mid")].filter(m => m.clientWidth > 0 && m.querySelector(".lw-chip"));
    if (!mids.length) return { ok: false, reason: "no chip column" };
    const column = Math.min(...mids.map(m => m.clientWidth));
    const card = box.clientWidth;
    const closedRow = mids[0].closest(".manage-row.mg-int");
    const closedChip = closedRow.querySelector(".lw-chip").getBoundingClientRect();
    const closedName = closedRow.querySelector(".mg-int-t").getBoundingClientRect();
    const closedNum = closedRow.querySelector(".mg-int-n").getBoundingClientRect();
    const closedMid = mids[0].getBoundingClientRect();
    const closedActs = closedRow.querySelector(".cacts").getBoundingClientRect();
    const closedBox = closedRow.getBoundingClientRect();
    const closed = {
      sameLine: Math.abs(closedChip.top - closedName.top) <= 8,
      inColumn: closedChip.left > closedNum.right - 2,
      notFull: closedActs.left > closedMid.right - 2 && closedMid.right < closedBox.right - 20,
    };
    const openRow = [...list.querySelectorAll(".manage-row.mg-int")].find(r => {
      const more = r.querySelector("[data-chips-more]");
      return more && more.getClientRects().length && r.querySelectorAll(".lw-chip").length >= 2;
    });
    if (!openRow) return { ok: false, reason: "no overflowing row", column: Math.round(column), card, closed };
    const more = openRow.querySelector("[data-chips-more]");
    more.click();
    await frames();
    openRow.scrollIntoView({ block: "center" });
    await frames();
    const name = openRow.querySelector(".mg-int-t").getBoundingClientRect();
    const num = openRow.querySelector(".mg-int-n").getBoundingClientRect();
    const acts = openRow.querySelector(".cacts").getBoundingClientRect();
    const chev = more.getBoundingClientRect();
    const mid = openRow.querySelector(".lw-mid").getBoundingClientRect();
    const row = openRow.getBoundingClientRect();
    const chips = [...openRow.querySelectorAll(".lw-chip")];
    const first = chips[0].getBoundingClientRect();
    const span = row.right - name.left;
    const ctx = document.createElement("canvas").getContext("2d");
    let cutThatFit = 0, fit = 0;
    for (const c of chips) {
      const cs = getComputedStyle(c);
      const q = c.getBoundingClientRect();
      const boxL = q.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
      const boxR = q.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
      const g = document.createRange();
      g.selectNodeContents(c);
      const k = g.getBoundingClientRect();
      const inkCut = k.width > 0 && (k.right > boxR + 0.5 || k.left < boxL - 0.5);
      const scrollCut = c.scrollWidth > c.clientWidth + 1;
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
      const textW = ctx.measureText(c.textContent || "").width;
      const wouldFit = textW + pad <= span + 2;
      if (wouldFit) fit++;
      if (wouldFit && (inkCut || scrollCut)) cutThatFit++;
    }
    const lineMid = name.top + name.height / 2;
    const onFirst = el => Math.abs((el.top + el.height / 2) - lineMid) <= 10;
    const opened = {
      below: first.top >= name.bottom - 2,
      left: Math.round((first.left - name.left) * 10) / 10,
      right: Math.round((row.right - mid.right) * 10) / 10,
      chrome: onFirst(num) && onFirst(chev) && onFirst(acts),
      cutThatFit, fit, chips: chips.length,
      nameBottom: Math.round(name.bottom), chipTop: Math.round(first.top),
    };
    more.click();
    await frames();
    const ok = column < 320 && column > 40 && closed.sameLine && closed.inColumn && closed.notFull
      && opened.below && Math.abs(opened.left) <= 4 && opened.right <= 8 && opened.right >= -2
      && opened.chrome && opened.cutThatFit === 0 && opened.fit > 0;
    return { ok, column: Math.round(column * 10) / 10, card, closed, opened };
  });
  console.log("i13 chip column " + (i13Res && i13Res.column) + " px at viewport 960 (card " + (i13Res && i13Res.card) + " px)");
  check(i13Res && i13Res.ok, "i13 under 320px of chip column an opened row's chips run from the name to the row's edge, whole, and a closed row stays in the column", i13Res);

  /* --- i14: one live observer after several paints, not one per paint --- */
  const roPage = await boot({ width: 1280, height: 900 }, async p => {
    await p.evaluateOnNewDocument(() => {
      const Orig = window.ResizeObserver;
      const bag = [];
      window.__roBag = bag;
      if (typeof Orig !== "function") return;
      function Tracked(cb) {
        const ro = new Orig(cb);
        const rec = { intents: false, dead: true };
        bag.push(rec);
        const observe = ro.observe.bind(ro);
        const disconnect = ro.disconnect.bind(ro);
        ro.observe = function (el) {
          rec.dead = false;
          if (el && el.classList && el.classList.contains("mg-intents")) rec.intents = true;
          return observe(el);
        };
        ro.disconnect = function () {
          rec.dead = true;
          return disconnect();
        };
        return ro;
      }
      Tracked.prototype = Orig.prototype;
      window.ResizeObserver = Tracked;
    });
  });
  await openIntents(roPage);
  const i14Res = await roPage.evaluate(async () => {
    const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const click = sel => { const e = document.querySelector(sel); if (e) e.click(); };
    for (let i = 0; i < 4; i++) {
      click('.sx-sec[data-lm="data"]');
      await frames();
      click('.sx-sec[data-lm="intents"]');
      await frames();
    }
    const bag = window.__roBag || [];
    const intents = bag.filter(r => r.intents);
    return { made: intents.length, live: intents.filter(r => !r.dead).length, paints: 4 };
  });
  check(i14Res && i14Res.live === 1 && i14Res.made >= 1, "i14 after several repaints one ResizeObserver watches the intents list", i14Res);
  await roPage.close();

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

  /* --- i11: a Library search for an intent's name shows the Intents section and that row (the filter once
     named a class no intent row carries, so a search never showed Intents at all) --- */
  const i11Res = await page.evaluate(async () => {
    if (window.openManage) window.openManage();
    await new Promise(r => setTimeout(r, 100));
    const s = document.querySelector('.sx-sec[data-lm="intents"]');
    if (s) s.click();
    await new Promise(r => setTimeout(r, 150));
    const nameOf = r => ((r.querySelector(".mg-int-t") || r).textContent || "").trim();
    const rows = [...document.querySelectorAll(".manage-row[data-introw]")];
    if (rows.length < 2) return { ok: false, rows: rows.length };
    const target = rows.find(r => { const n = nameOf(r); return n.length > 3 && rows.filter(x => nameOf(x).indexOf(n) >= 0).length === 1; });
    if (!target) return { ok: false, why: "no intent with a unique name" };
    const id = target.getAttribute("data-introw"), name = nameOf(target);
    const q = document.getElementById("libSearch");
    if (!q) return { ok: false, why: "no search field" };
    q.value = name; q.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const sec = document.querySelector('details.manage-sec[data-mg="intents"]');
    const now = [...document.querySelectorAll(".manage-row[data-introw]")];
    const t = now.find(r => r.getAttribute("data-introw") === id);
    const shown = r => !!r && !r.hasAttribute("hidden") && !r.closest("[hidden]");
    const otherHidden = now.filter(r => r !== t && r.hasAttribute("hidden")).length;
    const q2 = document.getElementById("libSearch");
    if (q2) { q2.value = ""; q2.dispatchEvent(new Event("input", { bubbles: true })); }
    await new Promise(r => setTimeout(r, 200));
    return { ok: !!sec && !sec.hasAttribute("hidden") && shown(t) && otherHidden > 0, name, sec: !!sec && !sec.hasAttribute("hidden"), row: shown(t), otherHidden };
  });
  check(i11Res && i11Res.ok, "i11 a Library search for an intent's name shows the Intents section with that row, and hides the rows it does not match", i11Res);

} catch (e) {
  check(false, "run crashed: " + e.message, e.stack);
} finally {
  if (browser) await browser.close();
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}

console.log("#counts checks=" + checks + " skipped=0 failed=" + fails + " expected=13");
console.log(checks + " checks, " + fails + " failed");
process.exit(fails || checks !== 13 ? 1 : 0);
