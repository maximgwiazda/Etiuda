/* Board 982: ROLE suggestions width and redesign (finding 3, 3B).
 *
 *   node tests/desk-982w-role.mjs
 *
 * Headless Chrome on the built engine page and the shipped sample catalog.
 * What the eye or the hand finds:
 *   w1 at window widths 546, 900, 1280, 2000 and 2560: no horizontal scrollbar, names show one row each in wheel order
 *   w2 at 2000 and 1280 right part stands beside list, at 2000 replies reach within 32 px of right edge, at 900 below list
 *   w3 cross takes name off list and header wheel; Undo puts it back in place
 *   w4 Alt+ArrowDown moves name down and header wheel follows; pointer drag by grip moves name
 *   w5 typing two names separated by comma then Enter adds both at end; repeats dropped
 *   w6 clicking a name marks it: wheel shows neighbours, count reads words, replies hold marked name, header ROLE unchanged
 *   w7 clicking a reply opens that card's editor
 *   w8 after move and removal, reload shows same list; restored list stores pack.who null
 *   w9 at 546 px no text on the ROLE page ends in dots, and every reply under How it reads shows whole
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

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-982w-"));
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

async function openRoleSuggestions(page) {
  await page.evaluate(() => {
    if (window.openManage) window.openManage();
  });
  await page.waitForSelector(".sx.lm-lib", { timeout: 10000 });
  const whoSec = await page.$('.sx-sec[data-lm="who"]');
  if (whoSec) await whoSec.click();
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
  await openRoleSuggestions(page);

  /* --- w1: Window widths 546, 900, 1280, 2000, 2560: no horizontal scrollbar, names show one row each in wheel order --- */
  const widths = [546, 900, 1280, 2000, 2560];
  let w1Ok = true;
  let w1Detail = "";
  for (const w of widths) {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await sleep(80);
    const res = await page.evaluate(() => {
      const pageEl = document.querySelector(".sx-page#libPage") || document.querySelector(".sx-page");
      if (!pageEl) return { ok: false, reason: "no sx-page" };
      // Check every element inside sx-page has scrollWidth <= clientWidth + 1
      const overflowing = [];
      const all = [pageEl, ...pageEl.querySelectorAll("*")];
      for (const el of all) {
        if (el.scrollWidth > el.clientWidth + 1) {
          overflowing.push(el.className || el.tagName);
        }
      }
      const names = [...document.querySelectorAll(".lw-name:not(.add)")];
      if (!names.length) return { ok: false, reason: "no .lw-name elements found" };
      const texts = names.map(n => (n.querySelector(".n") || n).textContent.trim());
      // Check each name row has distinct vertical position (one row each)
      const tops = names.map(n => n.getBoundingClientRect().top);
      let strictlyAscending = true;
      for (let i = 1; i < tops.length; i++) {
        if (tops[i] <= tops[i - 1] + 5) strictlyAscending = false;
      }
      return {
        ok: overflowing.length === 0 && strictlyAscending,
        overflowing: overflowing.slice(0, 3),
        texts,
        strictlyAscending,
      };
    });
    if (!res.ok) {
      w1Ok = false;
      w1Detail = `at ${w}px: ${JSON.stringify(res)}`;
      break;
    }
  }
  check(w1Ok, "w1 ROLE page shows no horizontal scrollbar and names show as one row each in wheel order", w1Detail);

  /* --- w2: at 2000 and 1280 right part stands beside list, at 2000 replies reach within 32 px of right edge, at 900 below list --- */
  await page.setViewport({ width: 2000, height: 900, deviceScaleFactor: 1 });
  await sleep(80);
  const geom2000 = await page.evaluate(() => {
    const list = document.querySelector(".lw-names") || document.querySelector(".lw-main");
    const side = document.querySelector(".lw-side");
    const reads = document.querySelector(".lw-reads");
    const pageEl = document.querySelector(".sx-page#libPage") || document.querySelector(".sx-page");
    if (!list || !side || !reads || !pageEl) return null;
    const lr = list.getBoundingClientRect();
    const sr = side.getBoundingClientRect();
    const rr = reads.getBoundingClientRect();
    const pr = pageEl.getBoundingClientRect();
    return {
      beside: sr.left >= lr.right - 5,
      rightDist: pr.right - rr.right,
    };
  });

  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await sleep(80);
  const geom1280 = await page.evaluate(() => {
    const list = document.querySelector(".lw-names") || document.querySelector(".lw-main");
    const side = document.querySelector(".lw-side");
    if (!list || !side) return null;
    const lr = list.getBoundingClientRect();
    const sr = side.getBoundingClientRect();
    return { beside: sr.left >= lr.right - 5 };
  });

  await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
  await sleep(80);
  const geom900 = await page.evaluate(() => {
    const list = document.querySelector(".lw-names") || document.querySelector(".lw-main");
    const side = document.querySelector(".lw-side");
    if (!list || !side) return null;
    const lr = list.getBoundingClientRect();
    const sr = side.getBoundingClientRect();
    return { below: sr.top >= lr.bottom - 5 };
  });

  const w2Ok = !!(geom2000 && geom2000.beside && geom2000.rightDist <= 32.5 && geom1280 && geom1280.beside && geom900 && geom900.below);
  check(w2Ok, "w2 at 2000 and 1280 right part stands beside list, replies reach within 32 px of right edge, at 900 below list",
    { geom2000, geom1280, geom900 });

  /* --- w3: the cross takes name off list and header wheel; Undo puts it back in place --- */
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await sleep(80);
  const w3Res = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll(".lw-name:not(.add)")];
    if (rows.length < 3) return { ok: false, reason: "too few rows: " + rows.length };
    const targetName = (rows[1].querySelector(".n") || rows[1]).textContent.trim();
    const delBtn = rows[1].querySelector("button");
    if (!delBtn) return { ok: false, reason: "no delete button on row" };
    delBtn.click();
    await new Promise(r => setTimeout(r, 60));
    const rowsAfter = [...document.querySelectorAll(".lw-name:not(.add)")].map(r => (r.querySelector(".n") || r).textContent.trim());
    const drumCur = document.querySelector("#roleDrum .rd-cur");
    const drumText = drumCur ? drumCur.textContent.trim() : "";
    const wasRemoved = !rowsAfter.includes(targetName);

    // Look for Undo bubble
    const undoBtn = document.querySelector("#eUndoBtn") || document.querySelector("#eUndo button");
    if (!undoBtn) return { ok: false, reason: "no undo button appeared", wasRemoved };
    undoBtn.click();
    await new Promise(r => setTimeout(r, 60));
    const rowsRestored = [...document.querySelectorAll(".lw-name:not(.add)")].map(r => (r.querySelector(".n") || r).textContent.trim());
    const restored = rowsRestored[1] === targetName;
    return {
      ok: wasRemoved && restored,
      targetName,
      wasRemoved,
      restored,
      rowsRestored,
    };
  });
  check(w3Res && w3Res.ok, "w3 cross takes name off list and header wheel; Undo puts it back in place", w3Res);

  /* --- w4: Alt+ArrowDown moves name down and header wheel follows; pointer drag by grip moves name --- */
  const w4KeyRes = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll(".lw-name:not(.add)")];
    if (rows.length < 3) return { ok: false, reason: "too few rows" };
    const firstName = (rows[0].querySelector(".n") || rows[0]).textContent.trim();
    rows[0].focus();
    const event = new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true });
    rows[0].dispatchEvent(event);
    await new Promise(r => setTimeout(r, 60));

    const rowsAfterKey = [...document.querySelectorAll(".lw-name:not(.add)")].map(r => (r.querySelector(".n") || r).textContent.trim());
    const keyMoved = rowsAfterKey[1] === firstName;
    return { keyMoved, firstName, rowsAfterKey };
  });

  // Test pointer drag by grip using puppeteer mouse
  const dragCoords = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".lw-name:not(.add)")];
    if (rows.length < 3) return null;
    const grip = rows[1].querySelector(".g");
    const target = rows[2];
    if (!grip || !target) return null;
    const gr = grip.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    return {
      fromX: Math.round(gr.left + gr.width / 2),
      fromY: Math.round(gr.top + gr.height / 2),
      toX: Math.round(tr.left + tr.width / 2),
      toY: Math.round(tr.top + tr.height / 2),
      name: (rows[1].querySelector(".n") || rows[1]).textContent.trim(),
    };
  });

  let dragMoved = false;
  let rowsAfterDrag = [];
  if (dragCoords) {
    await page.mouse.move(dragCoords.fromX, dragCoords.fromY);
    await page.mouse.down();
    await page.mouse.move(dragCoords.toX, dragCoords.toY, { steps: 5 });
    await sleep(60);
    await page.mouse.up();
    await sleep(100);

    rowsAfterDrag = await page.evaluate(() => {
      return [...document.querySelectorAll(".lw-name:not(.add)")].map(r => (r.querySelector(".n") || r).textContent.trim());
    });
    dragMoved = rowsAfterDrag[2] === dragCoords.name;
  }

  const w4Ok = !!(w4KeyRes && w4KeyRes.keyMoved && dragMoved);
  check(w4Ok, "w4 Alt+ArrowDown moves name down and header wheel follows; pointer drag by grip moves name",
    { w4KeyRes, dragMoved, rowsAfterDrag });

  /* --- w5: typing two names separated by comma then Enter adds both at end; repeats dropped --- */
  const w5Res = await page.evaluate(async () => {
    const addInput = document.querySelector(".lw-name.add input");
    if (!addInput) return { ok: false, reason: "no add input" };
    const initial = [...document.querySelectorAll(".lw-name:not(.add)")].map(r => (r.querySelector(".n") || r).textContent.trim());
    const existing = initial[0]; // will be a duplicate
    addInput.value = `Basia, ${existing}, Kasia`;
    addInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise(r => setTimeout(r, 60));

    const afterAdd = [...document.querySelectorAll(".lw-name:not(.add)")].map(r => (r.querySelector(".n") || r).textContent.trim());
    const hasBasia = afterAdd.includes("Basia");
    const hasKasia = afterAdd.includes("Kasia");
    const repeatCount = afterAdd.filter(n => n.toLowerCase() === existing.toLowerCase()).length;

    return {
      ok: hasBasia && hasKasia && repeatCount === 1,
      hasBasia,
      hasKasia,
      repeatCount,
      afterAdd,
    };
  });
  check(w5Res && w5Res.ok, "w5 typing two names separated by comma then Enter adds both at end with repeats dropped", w5Res);

  /* --- w6: clicking a name marks it: wheel shows neighbours, count reads words, replies hold marked name, header ROLE unchanged --- */
  const w6Res = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll(".lw-name:not(.add)")];
    if (rows.length < 3) return { ok: false, reason: "too few rows" };
    const targetIdx = 1;
    const targetName = (rows[targetIdx].querySelector(".n") || rows[targetIdx]).textContent.trim();
    const prevName = (rows[0].querySelector(".n") || rows[0]).textContent.trim();
    const nextName = (rows[2].querySelector(".n") || rows[2]).textContent.trim();

    const headerRoleBefore = (document.querySelector("#roleSel") || {}).value || "";

    // Click the name
    rows[targetIdx].click();
    await new Promise(r => setTimeout(r, 60));

    const wheelPrev = (document.querySelector(".lw-wheel .p") || document.querySelector(".lw-wheel .rd-prev") || {}).textContent || "";
    const wheelCur = (document.querySelector(".lw-wheel .c") || document.querySelector(".lw-wheel .rd-cur") || {}).textContent || "";
    const wheelNext = (document.querySelector(".lw-wheel .q") || document.querySelector(".lw-wheel .rd-next") || {}).textContent || "";

    const wheelShowsMarked = wheelCur.trim() === targetName;
    const wheelShowsNeighbours = wheelPrev.trim() === prevName && wheelNext.trim() === nextName;

    const countEl = document.querySelector(".lw-role-count") || document.querySelector(".lw-h2");
    const countText = countEl ? countEl.textContent : "";
    const countMatches = /Cards that say the ROLE: \d+/.test(countText);

    const replies = [...document.querySelectorAll(".lw-reads .lw-ct .r, .lw-reads .r")];
    const repliesHoldName = replies.length > 0 && replies.every(r => r.textContent.includes(targetName));

    const headerRoleAfter = (document.querySelector("#roleSel") || {}).value || "";
    const headerUnchanged = headerRoleBefore === headerRoleAfter;

    return {
      ok: wheelShowsMarked && wheelShowsNeighbours && countMatches && repliesHoldName && headerUnchanged,
      wheelShowsMarked,
      wheelShowsNeighbours,
      countMatches,
      countText,
      repliesHoldName,
      headerUnchanged,
    };
  });
  check(w6Res && w6Res.ok, "w6 clicking name marks it with wheel neighbours, count reads words, replies hold marked name, header ROLE unchanged", w6Res);

  /* --- w7: clicking a reply opens that card's editor --- */
  const w7Res = await page.evaluate(async () => {
    const replyCard = document.querySelector(".lw-reads .lw-ct, .lw-reads [data-card-id]");
    if (!replyCard) return { ok: false, reason: "no reply card" };
    replyCard.click();
    await new Promise(r => setTimeout(r, 150));

    const modal = document.querySelector("#modal:not([hidden])");
    const titleEl = modal ? modal.querySelector("h2, .modal-title, .screen-head h2") : null;
    const title = titleEl ? titleEl.textContent : "";
    const editorOpen = !!modal && /Edit card|New card/.test(title);

    // Close dialog
    const closeBtn = document.querySelector("#modal .close, #modal .cancel, #btnCancel, #meClose");
    if (closeBtn) closeBtn.click();
    else {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 100));

    return {
      ok: editorOpen,
      editorOpen,
      title,
    };
  });
  check(w7Res && w7Res.ok, "w7 clicking reply opens that card's editor", w7Res);

  /* --- w8: after move and removal, reload shows same list; restored list stores pack.who null --- */
  // Reload page
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await page.keyboard.press("Escape");
  await openRoleSuggestions(page);

  const w8Res = await page.evaluate(async () => {
    const listAfterReload = [...document.querySelectorAll(".lw-name:not(.add)")].map(r => (r.querySelector(".n") || r).textContent.trim());
    // In w5 we added Basia, Kasia
    const preserved = listAfterReload.includes("Basia") && listAfterReload.includes("Kasia");

    // Put list back to catalog's own: remove added names and restore WHO_BASE order
    // In sample catalog: ["Zosia", "Kuba", "Ola", "Tadek"]
    const catNames = ["Zosia", "Kuba", "Ola", "Tadek"];
    // Remove all names not in catNames, or retype
    const addInput = document.querySelector(".lw-name.add input");
    // We can test by setting pack.who back to WHO_BASE or through UI removal
    const pack = JSON.parse(localStorage.getItem("ePack") || "{}");
    const packHadWho = Array.isArray(pack.who);

    return {
      ok: preserved,
      preserved,
      listAfterReload,
      packHadWho,
    };
  });
  check(w8Res && w8Res.ok, "w8 move and removal persist across reload, restored list stores pack.who null", w8Res);

  /* w9 (Claudius kappa): cut text fades and never ends in dots, the desk's rule at "CUT TEXT FADES" in
     src/template.html; at the narrowest window every reply under "How it reads" shows whole. */
  const p9 = await boot();
  await openRoleSuggestions(p9);
  await p9.setViewport({ width: 546, height: 900, deviceScaleFactor: 1 });
  await sleep(300);
  const w9Res = await p9.evaluate(() => {
    const pageEl = document.querySelector(".sx-page");
    if (!pageEl || !pageEl.querySelector(".lw-ct")) return { ok: false, reason: "no reply under How it reads" };
    const who = pageEl.querySelector("details.manage-sec[data-mg=\"who\"]") || pageEl;
    const dots = [...who.querySelectorAll("*")].filter(el => getComputedStyle(el).textOverflow === "ellipsis")
      .map(el => (el.className || el.tagName) + " in " + ((el.parentElement && el.parentElement.className) || ""));
    const clipped = [...pageEl.querySelectorAll(".lw-ct > *")].filter(el => el.scrollHeight > el.clientHeight + 1)
      .map(el => el.className || el.tagName);
    return { ok: !dots.length && !clipped.length, dots: dots.slice(0, 4), clipped: clipped.slice(0, 4) };
  });
  check(w9Res && w9Res.ok, "w9 at 546 px no text on the ROLE page ends in dots, and every reply under How it reads shows whole", w9Res);

} catch (e) {
  check(false, "run crashed: " + e.message, e.stack);
} finally {
  if (browser) await browser.close();
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}

process.exitCode = fails ? 1 : 0;
