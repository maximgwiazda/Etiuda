/* THE CARD POOL SELF-CHECK IGNORES POST-PAINT DESK STATE AND CATCHES REAL DRIFT. Chrome, headless, no fixtures.
 *
 *   node tests/pool-selfcheck.mjs [--engine <file>]
 *   ETIUDA_PLANTS=off node tests/pool-selfcheck.mjs
 *
 * Drives the built engine/etiuda.html with the shipped sample-catalog.ec (never the fixtures folder).
 * Walks the first 40 intents (each picked and dropped, 80 redraws) with window.__verifyPool = true:
 *   ps1  across all 80 redraws at 1280x800 (2 columns) and 1400x900 (3 columns), window.__poolMismatch
 *        reports 0 kept cards (empty style="", deck/deck-near/deck-back/deck inline styles, and
 *        cut-text classes laid on kept nodes after paint are ignored)
 *   ps2  a stale badge left on a kept card is still reported by window.__poolMismatch, and clears once removed
 *   ps3  a non-empty style left on a kept card is still reported by window.__poolMismatch, and clears once
 *        cleared to style=""
 *   ps4  inline plant proof (skipped with NOT RUN when ETIUDA_PLANTS=off): lifting the empty-style drop in a
 *        scratch copy of the built page brings the empty-style mismatches back across the 40-intent walk
 *
 * Exit code is the number of failed checks; 78 when the run could not complete.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const argv = process.argv.slice(2);
const at = argv.indexOf("--engine");
const ENGINE = at >= 0 ? path.resolve(argv[at + 1]) : E.ENGINE_PATH;

let fails = 0, checks = 0;
const check = (ok, what) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) fails++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EXPECTED = PLANTS_OFF ? 3 : 4;

const sampleText = fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8");

function makeDeskDir(htmlText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-pool-selfcheck-"));
  fs.copyFileSync(ENGINE, path.join(dir, "etiuda.html"));
  if (htmlText != null) fs.writeFileSync(path.join(dir, "etiuda.html"), htmlText);
  fs.writeFileSync(path.join(dir, "etiuda-catalog.js"), "window.E_CATALOG = " + sampleText + ";\n");
  return {
    dir,
    url: "file:///" + path.join(dir, "etiuda.html").replace(/\\/g, "/"),
    drop: () => fs.rmSync(dir, { recursive: true, force: true })
  };
}

async function openDesk(browser, url, width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try {
      for (const k of ["eTourDone_v3", "eTourInvite_v3", "eNameAsked", "eFirstSigninSeen"]) localStorage.setItem(k, "1");
    } catch (_) {}
  });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(
    () => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0,
    { timeout: 30000 }
  );
  if (await page.$("#ecYes")) await page.click("#ecYes");
  await page.waitForFunction(
    () => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
      && !document.querySelector(".e-launch-veil"),
    { timeout: 30000 }
  );
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await sleep(150);
  return page;
}

async function walkIntents(page, count = 40) {
  return page.evaluate(async limit => {
    const raf3 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    window.__verifyPool = true;
    const total = Math.min(limit, typeof intentCount === "function" ? intentCount() : limit);
    const seen = new Map();
    const record = () => {
      for (const b of (window.__poolMismatch || [])) {
        if (!seen.has(b.id)) seen.set(b.id, b);
      }
    };
    for (let i = 0; i < total; i++) {
      window.__poolMismatch = null;
      pickIntent(i, false);
      const t0 = Date.now();
      while (window.__poolMismatch === null && Date.now() - t0 < 2000) await new Promise(r => setTimeout(r, 15));
      await raf3();
      await new Promise(r => setTimeout(r, 20));
      record();

      window.__poolMismatch = null;
      clearIntents();
      await raf3();
      await new Promise(r => setTimeout(r, 20));
      record();
    }
    const items = Array.from(seen.values());
    let emptyStyle = 0, deck = 0;
    for (const x of items) {
      if (/\bclass="card[^"]*\bdeck\b/.test(x.got)) deck++;
      else if (/\bstyle=""/.test(x.got)) emptyStyle++;
    }
    return {
      total,
      mismatchCount: items.length,
      emptyStyle,
      deck,
      sampleIds: items.slice(0, 5).map(x => x.id)
    };
  }, count);
}

let browser = null, done = false;
const labs = [];
try {
  const rawHtml = fs.readFileSync(ENGINE, "utf8");
  browser = await puppeteer.launch({
    executablePath: E.browserPath("chrome"),
    headless: true,
    args: ["--hide-scrollbars"],
    protocolTimeout: 120000
  });

  const mainLab = makeDeskDir(null);
  labs.push(mainLab);

  const p1 = await openDesk(browser, mainLab.url, 1280, 800);
  const w1 = await walkIntents(p1, 40);

  // ps2: Plant a stale badge on a kept card and verify __verifyPool reports it.
  const staleBadgeRes = await p1.evaluate(async () => {
    const raf3 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    const card = Array.from(document.querySelectorAll("#list .card[data-id]"))
      .find(c => !c.querySelector(".cbadge.fav"));
    if (!card) return { error: "no card without fav badge" };
    const id = card.dataset.id;
    const head = card.querySelector(".chead");
    const badge = document.createElement("span");
    badge.className = "cbadge fav";
    badge.title = "In Favourites";
    badge.textContent = "fav";
    head.appendChild(badge);

    window.__verifyPool = true;
    window.__poolMismatch = null;
    render();
    await raf3();
    const caughtOnRender = (window.__poolMismatch || []).some(b => b.id === id);

    // Clean up stale badge, re-render, and verify clean again.
    const liveCard = document.querySelector('#list .card[data-id="' + CSS.escape(id) + '"]');
    if (liveCard) {
      const b = liveCard.querySelector(".cbadge.fav");
      if (b) b.remove();
    }
    window.__poolMismatch = null;
    render();
    await raf3();
    const afterCleanup = (window.__poolMismatch || []).length;
    return { id, caughtOnRender, afterCleanup };
  });

  // ps3: Plant a non-empty style on a kept card and verify __verifyPool reports it, then clears when set to "".
  const styleRes = await p1.evaluate(async () => {
    const raf3 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    const card = document.querySelector("#list .card[data-id]");
    if (!card) return { error: "no card" };
    const id = card.dataset.id;
    card.style.color = "rgb(200, 0, 0)";

    window.__verifyPool = true;
    window.__poolMismatch = null;
    render();
    await raf3();
    const caughtNonEmpty = (window.__poolMismatch || []).some(b => b.id === id);

    const liveCard = document.querySelector('#list .card[data-id="' + CSS.escape(id) + '"]');
    if (liveCard) liveCard.style.color = "";
    window.__poolMismatch = null;
    render();
    await raf3();
    const afterClearedToEmpty = (window.__poolMismatch || []).length;
    return { id, caughtNonEmpty, afterClearedToEmpty };
  });
  await p1.close();

  const p2 = await openDesk(browser, mainLab.url, 1400, 900);
  const w2 = await walkIntents(p2, 40);
  await p2.close();

  check(
    w1.total === 40 && w1.mismatchCount === 0 && w2.total === 40 && w2.mismatchCount === 0,
    "ps1 40 intents picked and dropped (80 redraws) report 0 pool mismatches: 1280x800="
      + w1.mismatchCount + " (emptyStyle=" + w1.emptyStyle + ",deck=" + w1.deck + ")"
      + ", 1400x900=" + w2.mismatchCount + " (emptyStyle=" + w2.emptyStyle + ",deck=" + w2.deck + ")"
      + (w1.sampleIds.length ? " sample=" + w1.sampleIds.join(",") : "")
  );

  check(
    !staleBadgeRes.error && staleBadgeRes.caughtOnRender && staleBadgeRes.afterCleanup === 0,
    "ps2 a stale badge left on a kept card is still caught (" + staleBadgeRes.id
      + ": caught=" + staleBadgeRes.caughtOnRender + ", afterCleanup=" + staleBadgeRes.afterCleanup + ")"
  );

  check(
    !styleRes.error && styleRes.caughtNonEmpty && styleRes.afterClearedToEmpty === 0,
    "ps3 a non-empty style on a kept card is still caught, and clearing it to empty clears the mismatch ("
      + styleRes.id + ": caught=" + styleRes.caughtNonEmpty + ", afterCleared=" + styleRes.afterClearedToEmpty + ")"
  );

  // ps4: Inline plant proof - take out the empty-style drop in normAttrOrder and verify the mismatches return.
  if (PLANTS_OFF) {
    console.log("  NOT RUN ps4 plant:pool-norm-empty-style (ETIUDA_PLANTS=off)");
  } else {
    const plantedHtml = rawHtml.replace(
      /(function normAttrOrder\(el\)\s*\{[\s\S]*?)if\s*\(\s*!s\s*\)\s*\{\s*continue;\s*\}/,
      "$1if (false) { continue; }"
    );
    if (plantedHtml === rawHtml) {
      check(false, "ps4 plant:pool-norm-empty-style marker not found in built engine");
    } else {
      const plantLab = makeDeskDir(plantedHtml);
      labs.push(plantLab);
      const pp = await openDesk(browser, plantLab.url, 1280, 800);
      const pw = await walkIntents(pp, 40);
      await pp.close();
      check(
        pw.emptyStyle >= 20,
        "ps4 plant:pool-norm-empty-style taking out the empty-style drop brings back the mismatches: emptyStyle="
          + pw.emptyStyle + " (total=" + pw.mismatchCount + ")"
      );
    }
  }

  done = true;
} catch (e) {
  console.log("  FAIL the run stopped: " + String(e && e.message || e));
  fails++;
} finally {
  if (browser) await browser.close();
  for (const l of labs) {
    try { l.drop(); } catch (_) {}
  }
}
if (done && checks !== EXPECTED) {
  console.log("  FAIL ran " + checks + " checks, expected " + EXPECTED);
  fails++;
}
console.log((fails ? "FAIL " : "PASS ") + "pool-selfcheck: " + (checks - Math.min(fails, checks)) + "/" + checks + " checks" + (done ? "" : " - SUITE DID NOT COMPLETE"));
process.exit(done ? E.exitOf(fails) : 78);
