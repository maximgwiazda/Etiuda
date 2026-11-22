/* Space presses whatever Enter presses on every button the keyboard reaches across the desk,
 * once, with the same observable effect on the page; text fields keep their space, checkboxes
 * and switches toggle as before, and Space keeps its lanes meaning where no button has focus.
 *
 *   node tests/desk-space-presses.mjs
 *
 * Headless Chrome on the built engine page with the shipped sample catalog.
 * ETIUDA_PLANTS=off skips the inline plant check with a NOT RUN line.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const E = require("./engine.js");
const { seatPage } = require("./seat-page.js");
const puppeteer = require("puppeteer-core");

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 45;
let fails = 0, checks = 0, skipped = 0;

function check(ok, what, detail) {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
}
function notRun(what) {
  skipped++;
  console.log("  NOT RUN " + what);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ringNow = page => page.evaluate(() => {
  const ae = document.activeElement;
  return !!(ae && ae !== document.body && ae !== document.documentElement && ae.matches(":focus-visible"));
});
/* After Escape closes a dialog: wait for it to be hidden and for focus to be handed back (two frames), bounded, then the usual pause. */
const settleAfterEscape = async page => {
  await page.waitForFunction(() => { const m = document.getElementById("modal"); return !m || m.hidden; }, { timeout: 1500, polling: "raf" }).catch(() => null);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await sleep(80);
};
const fileUrl = p => "file:///" + p.replace(/\\/g, "/");

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-space-presses-"));
const dirMain = path.join(lab, "main");
const dirPlant = path.join(lab, "plant");
fs.mkdirSync(dirMain, { recursive: true });
fs.mkdirSync(dirPlant, { recursive: true });

const SEED_CATALOG = fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8");
fs.copyFileSync(E.ENGINE_PATH, path.join(dirMain, "etiuda.html"));

async function launch() {
  return puppeteer.launch({
    executablePath: E.browserPath("chrome"),
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--window-size=1280,860"]
  });
}

async function openDesk(browser, url, opts = {}) {
  const ctx = opts.incognito ? await browser.createBrowserContext() : null;
  const page = ctx ? await ctx.newPage() : await browser.newPage();
  page.__ownCtx = ctx;
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
    { name: "prefers-color-scheme", value: "light" }
  ]);
  await page.evaluateOnNewDocument(empty => {
    try {
      if (empty) localStorage.clear();
      localStorage.setItem("eTheme", "light");
      localStorage.setItem("eTourDone", "1");
      localStorage.setItem("eStill", "1");
      /* The tour's current keys (the older eTourDone alone no longer silences it): a slow load on an empty desk
         otherwise lets the tour open late and take the Tab walk into its own buttons. */
      localStorage.setItem("eTourDone_v3", "1");
      localStorage.setItem("eTourInvite_v3", "1");
      localStorage.setItem("eFirstSigninSeen", "1");
    } catch (_) {}
  }, !!opts.empty);
  await seatPage(page);
  if (!opts.empty) await E.seedCatalog(page, SEED_CATALOG);
  await page.goto(url, { waitUntil: "load" });
  if (!opts.empty) {
    await page.waitForSelector("#list .card", { timeout: 10000 }).catch(() => null);
    await sleep(120);
    for (let i = 0; i < 4; i++) {
      const ecYes = await page.$("#ecYes");
      if (ecYes) { await page.click("#ecYes").catch(() => {}); await sleep(120); }
      const tourSkip = await page.$("#tourSkip");
      if (tourSkip) { await page.click("#tourSkip").catch(() => {}); await sleep(80); }
    }
    await page.waitForSelector("#list .card", { timeout: 6000 }).catch(() => null);
  } else {
    await sleep(180);
  }
  await sleep(60);
  return page;
}

/* Walk with real Tab presses inside scopeSelector until activeElement matches targetSelector
 * (and optional predicate in page). Returns true if reached, false otherwise. */
async function tabTo(page, targetSelector, options = {}) {
  const maxSteps = options.maxSteps || 200;
  const scopeSelector = options.scope || "document";
  const fromStart = options.fromStart !== false;
  let removeMarker = false;

  if (fromStart) {
    if (scopeSelector !== "document") {
      await page.evaluate(sel => {
        const host = document.querySelector(sel);
        if (!host) return;
        host.setAttribute("tabindex", "-1");
        host.focus({ preventScroll: true });
      }, scopeSelector);
    } else {
      removeMarker = true;
      await page.evaluate(() => {
        const prev = document.getElementById("__spaceStartMarker");
        if (prev) prev.remove();
        const m = document.createElement("span");
        m.id = "__spaceStartMarker";
        m.tabIndex = -1;
        document.body.prepend(m);
        m.focus({ preventScroll: true });
      });
    }
  }

  for (let i = 0; i < maxSteps; i++) {
    /* Press Tab, then wait for focus to settle: until activeElement is no longer the element it was before the key
       (bounded, one frame at a time), so a slow frame under load cannot be read as "still on the old element" and
       the target walked past unseen. */
    await page.evaluate(() => { window.__tabPrev = document.activeElement; });
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => document.activeElement !== window.__tabPrev, { timeout: 1500, polling: "raf" }).catch(() => null);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    if (removeMarker) {
      removeMarker = false;
      await page.evaluate(() => {
        const m = document.getElementById("__spaceStartMarker");
        if (m) m.remove();
      });
    }
    const hit = await page.evaluate((sel, scope, wantText) => {
      const ae = document.activeElement;
      if (!ae || ae === document.body || ae === document.documentElement) return false;
      if (scope !== "document") {
        const root = document.querySelector(scope);
        if (!root || !root.contains(ae)) return false;
      }
      if (!ae.matches(sel)) return false;
      if (wantText && (ae.textContent || "").trim().indexOf(wantText) < 0) return false;
      return true;
    }, targetSelector, scopeSelector, options.text || "");
    if (hit) return true;
  }
  if (!walkQuiet) {
    const where = await page.evaluate(() => {
      const ae = document.activeElement;
      if (!ae) return "no active element";
      return ae.tagName.toLowerCase() + (ae.id ? "#" + ae.id : "") + (ae.className && typeof ae.className === "string" ? "." + ae.className.trim().split(/\s+/).join(".") : "");
    }).catch(() => "unreadable");
    console.log("  focus walk missed " + targetSelector + (scopeSelector !== "document" ? " in " + scopeSelector : "") + " after " + maxSteps + " Tab(s): focus was on " + where);
  }
  return false;
}
let walkQuiet = false;

async function runSuite(browser, enginePath, opts = {}) {
  const silent = !!opts.silent;
  walkQuiet = silent;
  const url = fileUrl(enginePath);
  const results = [];
  const rec = (ok, label, detail) => {
    results.push({ ok, label, detail });
    if (!silent) check(ok, label, detail);
  };

  // --- A. Main page & Card buttons ---
  const page = await openDesk(browser, url);
  try {
    // Ensure two conversation tabs exist so inactive .tab-label and .tab-x are present.
    await page.click(".tab-add");
    await sleep(100);

    // 1. Inactive .tab-label on band
    {
      const enterHit = await tabTo(page, ".tab:not(.on) .tab-label");
      const targetTid = await page.evaluate(() => document.activeElement?.closest(".tab")?.dataset?.tid || "");
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterEnter = await page.evaluate(tid => ({
        activeTid: document.querySelector(".tab.on")?.dataset?.tid || "",
        lanes: document.body.classList.contains("e-lanes")
      }), targetTid);

      const spaceHit = await tabTo(page, ".tab:not(.on) .tab-label");
      const targetTid2 = await page.evaluate(() => document.activeElement?.closest(".tab")?.dataset?.tid || "");
      await page.keyboard.press("Space");
      await sleep(80);
      const afterSpace = await page.evaluate(tid => ({
        activeTid: document.querySelector(".tab.on")?.dataset?.tid || "",
        lanes: document.body.classList.contains("e-lanes")
      }), targetTid2);
      if (afterSpace.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        enterHit && spaceHit && afterEnter.activeTid === targetTid && !afterEnter.lanes &&
          afterSpace.activeTid === targetTid2 && !afterSpace.lanes,
        "main: inactive .tab-label Space switches tab like Enter without opening lanes",
        { enterHit, spaceHit, targetTid, afterEnter, targetTid2, afterSpace }
      );
    }

    // 2. .tab-add button
    {
      const beforeE = await page.$$eval(".tab", xs => xs.length);
      const hitE = await tabTo(page, ".tab-add");
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(() => ({
        n: document.querySelectorAll(".tab").length,
        lanes: document.body.classList.contains("e-lanes")
      }));

      const beforeS = afterE.n;
      const hitS = await tabTo(page, ".tab-add");
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(() => ({
        n: document.querySelectorAll(".tab").length,
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (afterS.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        hitE && hitS && afterE.n === beforeE + 1 && !afterE.lanes && afterS.n === beforeS + 1 && !afterS.lanes,
        "main: .tab-add Space adds a tab like Enter without opening lanes",
        { beforeE, afterE, beforeS, afterS }
      );
    }

    // 3. .tab-x close button
    {
      const beforeE = await page.$$eval(".tab", xs => xs.length);
      const hitE = await tabTo(page, ".tab-x");
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(() => ({
        n: document.querySelectorAll(".tab").length,
        lanes: document.body.classList.contains("e-lanes")
      }));

      const beforeS = afterE.n;
      const hitS = await tabTo(page, ".tab-x");
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(() => ({
        n: document.querySelectorAll(".tab").length,
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (afterS.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        hitE && hitS && afterE.n === beforeE - 1 && !afterE.lanes && afterS.n === beforeS - 1 && !afterS.lanes,
        "main: .tab-x Space closes a tab like Enter without opening lanes",
        { beforeE, afterE, beforeS, afterS }
      );
    }

    // 4. #tabsListBtn (needs overflow tabs so #tabsWrap.tabs-over is active)
    {
      for (let i = 0; i < 12; i++) {
        const over = await page.evaluate(() => document.getElementById("tabsWrap")?.classList.contains("tabs-over"));
        if (over) break;
        await page.click(".tab-add");
        await sleep(30);
      }
      const hitE = await tabTo(page, "#tabsListBtn");
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(() => ({
        open: !document.getElementById("tabsListMenu")?.hidden,
        lanes: document.body.classList.contains("e-lanes")
      }));
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(60);

      const hitS = await tabTo(page, "#tabsListBtn");
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(() => ({
        open: !document.getElementById("tabsListMenu")?.hidden,
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (afterS.open) { await page.keyboard.press("Escape").catch(() => {}); await sleep(60); }
      if (afterS.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        hitE && hitS && afterE.open && !afterE.lanes && afterS.open && !afterS.lanes,
        "main: #tabsListBtn Space opens tabs list like Enter without opening lanes",
        { afterE, afterS }
      );
    }

    // 5. Segmented language switcher (#seg button:not(.on))
    {
      const hitE = await tabTo(page, "#seg button:not(.on)");
      const langTargetE = await page.evaluate(() => document.activeElement?.dataset?.l || "");
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(() => ({
        on: document.querySelector("#seg button.on")?.dataset?.l || "",
        lanes: document.body.classList.contains("e-lanes")
      }));

      const hitS = await tabTo(page, "#seg button:not(.on)");
      const langTargetS = await page.evaluate(() => document.activeElement?.dataset?.l || "");
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(() => ({
        on: document.querySelector("#seg button.on")?.dataset?.l || "",
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (afterS.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        hitE && hitS && afterE.on === langTargetE && !afterE.lanes && afterS.on === langTargetS && !afterS.lanes,
        "main: #seg button Space switches card language like Enter without opening lanes",
        { langTargetE, afterE, langTargetS, afterS }
      );
    }

    // 6. Quick facts button (#factsBtn)
    {
      const hitE = await tabTo(page, "#factsBtn");
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(() => ({
        open: !document.getElementById("factsPanel")?.hidden,
        lanes: document.body.classList.contains("e-lanes")
      }));
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(60);

      const hitS = await tabTo(page, "#factsBtn");
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(() => ({
        open: !document.getElementById("factsPanel")?.hidden,
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (afterS.open) { await page.keyboard.press("Escape").catch(() => {}); await sleep(60); }
      if (afterS.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        hitE && hitS && afterE.open && !afterE.lanes && afterS.open && !afterS.lanes,
        "main: #factsBtn Space opens Quick facts like Enter without opening lanes",
        { afterE, afterS }
      );
    }

    // 7. Theme button (#theme)
    {
      const beforeE = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      const hitE = await tabTo(page, "#theme");
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(() => ({
        th: document.documentElement.getAttribute("data-theme"),
        lanes: document.body.classList.contains("e-lanes")
      }));

      const beforeS = afterE.th;
      const hitS = await tabTo(page, "#theme");
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(() => ({
        th: document.documentElement.getAttribute("data-theme"),
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (afterS.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        hitE && hitS && afterE.th !== beforeE && !afterE.lanes && afterS.th === beforeE && beforeS !== afterS.th && !afterS.lanes,
        "main: #theme Space toggles theme like Enter without opening lanes",
        { beforeE, afterE, beforeS, afterS }
      );
    }

    // 8. Menu button (#settingsBtn)
    {
      const hitE = await tabTo(page, "#settingsBtn");
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(() => ({
        open: !document.getElementById("settingsMenu")?.hidden,
        lanes: document.body.classList.contains("e-lanes")
      }));
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(60);

      const hitS = await tabTo(page, "#settingsBtn");
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(() => ({
        open: !document.getElementById("settingsMenu")?.hidden,
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (afterS.open) { await page.keyboard.press("Escape").catch(() => {}); await sleep(60); }
      if (afterS.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        hitE && hitS && afterE.open && !afterE.lanes && afterS.open && !afterS.lanes,
        "main: #settingsBtn Space opens Menu like Enter without opening lanes",
        { afterE, afterS }
      );
    }

    // 9. Category + button (.pill-add)
    {
      const hitE = await tabTo(page, ".pill-add");
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(() => ({
        open: !!document.querySelector(".pill-new input"),
        lanes: document.body.classList.contains("e-lanes")
      }));
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(60);

      const hitS = await tabTo(page, ".pill-add");
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(() => ({
        open: !!document.querySelector(".pill-new input"),
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (afterS.open) { await page.keyboard.press("Escape").catch(() => {}); await sleep(60); }
      if (afterS.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        hitE && hitS && afterE.open && !afterE.lanes && afterS.open && !afterS.lanes,
        "main: .pill-add Space opens inline category box like Enter without opening lanes",
        { afterE, afterS }
      );
    }

    // 10. Rail pin button (#railPinBtn)
    {
      const beforeE = await page.$eval("#railPinBtn", el => el.getAttribute("aria-pressed"));
      const hitE = await tabTo(page, "#railPinBtn");
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(() => ({
        pressed: document.getElementById("railPinBtn")?.getAttribute("aria-pressed"),
        lanes: document.body.classList.contains("e-lanes")
      }));

      const beforeS = afterE.pressed;
      const hitS = await tabTo(page, "#railPinBtn");
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(() => ({
        pressed: document.getElementById("railPinBtn")?.getAttribute("aria-pressed"),
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (afterS.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        hitE && hitS && afterE.pressed !== beforeE && !afterE.lanes && afterS.pressed !== beforeS && afterS.pressed === beforeE && !afterS.lanes,
        "main: #railPinBtn Space toggles pin like Enter without opening lanes",
        { beforeE, afterE, beforeS, afterS }
      );
    }

    // --- Card buttons (star, hide, edit, note) ---
    // 11. Card star button (.star-btn)
    {
      const hitE = await tabTo(page, ".card .cacts button[data-act='fav']");
      const cid = await page.evaluate(() => document.activeElement?.closest(".card")?.dataset?.id || "");
      const beforeE = await page.evaluate(id => document.querySelector(`.card[data-id="${id}"] [data-act="fav"]`)?.getAttribute("aria-pressed"), cid);
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(id => ({
        pressed: document.querySelector(`.card[data-id="${id}"] [data-act="fav"]`)?.getAttribute("aria-pressed"),
        lanes: document.body.classList.contains("e-lanes")
      }), cid);

      const hitS = await tabTo(page, `.card[data-id="${cid}"] .cacts button[data-act="fav"]`);
      const beforeS = afterE.pressed;
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(id => ({
        pressed: document.querySelector(`.card[data-id="${id}"] [data-act="fav"]`)?.getAttribute("aria-pressed"),
        lanes: document.body.classList.contains("e-lanes")
      }), cid);
      if (afterS.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        hitE && hitS && afterE.pressed !== beforeE && !afterE.lanes &&
          afterS.pressed !== beforeS && afterS.pressed === beforeE && !afterS.lanes,
        "card: star button Space toggles favourite like Enter without opening lanes",
        { cid, beforeE, afterE, beforeS, afterS }
      );
    }

    // 12. Card hide button (data-act="hide")
    {
      const hitE = await tabTo(page, ".card .cacts button[data-act='hide']");
      const cidE = await page.evaluate(() => document.activeElement?.closest(".card")?.dataset?.id || "");
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(id => ({
        present: !!document.querySelector(`#list .card[data-id="${id}"]`),
        lanes: document.body.classList.contains("e-lanes")
      }), cidE);

      const hitS = await tabTo(page, ".card .cacts button[data-act='hide']");
      const cidS = await page.evaluate(() => document.activeElement?.closest(".card")?.dataset?.id || "");
      const beforeS = await page.evaluate(id => !!document.querySelector(`#list .card[data-id="${id}"]`), cidS);
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(id => ({
        present: !!document.querySelector(`#list .card[data-id="${id}"]`),
        lanes: document.body.classList.contains("e-lanes")
      }), cidS);
      if (afterS.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        hitE && hitS && !afterE.present && !afterE.lanes && beforeS && !afterS.present && !afterS.lanes,
        "card: hide button Space hides card like Enter without opening lanes",
        { cidE, afterE, cidS, beforeS, afterS }
      );
    }

    // 13. Card edit button (data-act="edit")
    {
      const hitE = await tabTo(page, ".card .cacts button[data-act='edit']");
      const cid = await page.evaluate(() => document.activeElement?.closest(".card")?.dataset?.id || "");
      await page.keyboard.press("Enter");
      await sleep(100);
      const afterE = await page.evaluate(() => ({
        modalOpen: !document.getElementById("modal")?.hidden,
        lanes: document.body.classList.contains("e-lanes")
      }));
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(80);

      const hitS = await tabTo(page, `.card[data-id="${cid}"] .cacts button[data-act="edit"]`);
      await page.keyboard.press("Space");
      await sleep(100);
      const afterS = await page.evaluate(() => ({
        modalOpen: !document.getElementById("modal")?.hidden,
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (afterS.modalOpen) { await page.keyboard.press("Escape").catch(() => {}); await sleep(80); }
      if (afterS.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        hitE && hitS && afterE.modalOpen && !afterE.lanes && afterS.modalOpen && !afterS.lanes,
        "card: edit button Space opens card editor dialog like Enter without opening lanes",
        { cid, afterE, afterS }
      );
    }

    // 14. Card note button (data-act="note")
    {
      const hitE = await tabTo(page, ".card .cacts button[data-act='note']", { maxSteps: 360 });
      const cid = await page.evaluate(() => document.activeElement?.closest(".card")?.dataset?.id || "");
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(() => ({
        noteOpen: !!(document.getElementById("notePane") && !document.getElementById("notePane").hidden),
        lanes: document.body.classList.contains("e-lanes")
      }));
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(60);

      const hitS = await tabTo(page, `.card[data-id="${cid}"] .cacts button[data-act="note"]`, { maxSteps: 360 });
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(() => ({
        noteOpen: !!(document.getElementById("notePane") && !document.getElementById("notePane").hidden),
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (afterS.noteOpen) { await page.keyboard.press("Escape").catch(() => {}); await sleep(60); }
      if (afterS.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        hitE && hitS && afterE.noteOpen && !afterE.lanes && afterS.noteOpen && !afterS.lanes,
        "card: note button Space opens note pane like Enter without opening lanes",
        { cid, afterE, afterS }
      );
    }

    // --- B. The Menu (#settingsMenu & #tabsListMenu) ---
    {
      await page.focus("#settingsBtn");
      await page.keyboard.press("Enter");
      await page.waitForSelector("#settingsMenu:not([hidden])", { timeout: 3000 });
      await sleep(60);
      for (let i = 0; i < 12; i++) {
        const atAbout = await page.evaluate(() => document.activeElement?.dataset?.act === "about");
        if (atAbout) break;
        await page.keyboard.press("ArrowDown");
      }
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(() => ({
        modalOpen: !document.getElementById("modal")?.hidden,
        menuOpen: !document.getElementById("settingsMenu")?.hidden
      }));
      if (afterE.modalOpen) { await page.keyboard.press("Escape").catch(() => {}); await sleep(60); }

      await page.focus("#settingsBtn");
      await page.keyboard.press("Enter");
      await page.waitForSelector("#settingsMenu:not([hidden])", { timeout: 3000 });
      await sleep(60);
      for (let i = 0; i < 12; i++) {
        const atAbout = await page.evaluate(() => document.activeElement?.dataset?.act === "about");
        if (atAbout) break;
        await page.keyboard.press("ArrowDown");
      }
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(() => ({
        modalOpen: !document.getElementById("modal")?.hidden,
        menuOpen: !document.getElementById("settingsMenu")?.hidden
      }));
      if (afterS.modalOpen) { await page.keyboard.press("Escape").catch(() => {}); await sleep(60); }

      rec(
        afterE.modalOpen && !afterE.menuOpen && afterS.modalOpen && !afterS.menuOpen,
        "menu: menuitem Space opens About and closes Menu like Enter",
        { afterE, afterS }
      );
    }

    {
      // Tabs list menuitem (.tabs-list-item:not([aria-current]))
      await page.focus("#tabsListBtn");
      await page.keyboard.press("Enter");
      await page.waitForSelector("#tabsListMenu:not([hidden])", { timeout: 3000 });
      await sleep(60);
      for (let i = 0; i < 14; i++) {
        const atOther = await page.evaluate(() => {
          const ae = document.activeElement;
          return !!(ae && ae.classList.contains("tabs-list-item") && !ae.hasAttribute("aria-current") && ae.dataset.tid);
        });
        if (atOther) break;
        await page.keyboard.press("ArrowDown");
      }
      const tidE = await page.evaluate(() => document.activeElement?.dataset?.tid || "");
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterE = await page.evaluate(() => ({
        activeTid: document.querySelector(".tab.on")?.dataset?.tid || "",
        open: !document.getElementById("tabsListMenu")?.hidden
      }));

      await page.focus("#tabsListBtn");
      await page.keyboard.press("Enter");
      await page.waitForSelector("#tabsListMenu:not([hidden])", { timeout: 3000 });
      await sleep(60);
      for (let i = 0; i < 14; i++) {
        const atOther = await page.evaluate(() => {
          const ae = document.activeElement;
          return !!(ae && ae.classList.contains("tabs-list-item") && !ae.hasAttribute("aria-current") && ae.dataset.tid);
        });
        if (atOther) break;
        await page.keyboard.press("ArrowDown");
      }
      const tidS = await page.evaluate(() => document.activeElement?.dataset?.tid || "");
      await page.keyboard.press("Space");
      await sleep(80);
      const afterS = await page.evaluate(() => ({
        activeTid: document.querySelector(".tab.on")?.dataset?.tid || "",
        open: !document.getElementById("tabsListMenu")?.hidden
      }));

      rec(
        !!tidE && !!tidS && afterE.activeTid === tidE && !afterE.open && afterS.activeTid === tidS && !afterS.open,
        "menu: #tabsListMenu item Space switches tab and closes menu like Enter",
        { tidE, afterE, tidS, afterS }
      );
    }

    // --- C. Settings (#screenHost) ---
    {
      await page.evaluate(() => window.openScreenTab("settings"));
      await page.waitForSelector("#screenHost:not([hidden])", { timeout: 4000 });
      await sleep(80);

      // C1. Nav section button ([data-sx="appearance"])
      const hitNavE = await tabTo(page, "#sxSecs button[data-sx='appearance']", { scope: "#screenHost" });
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterNavE = await page.evaluate(() => !!document.querySelector("#setBody .sx-look"));

      // Go back to All settings
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(80);

      const hitNavS = await tabTo(page, "#sxSecs button[data-sx='appearance']", { scope: "#screenHost" });
      await page.keyboard.press("Space");
      await sleep(80);
      const afterNavS = await page.evaluate(() => !!document.querySelector("#setBody .sx-look"));

      rec(
        hitNavE && hitNavS && afterNavE && afterNavS,
        "settings: nav button Space opens section like Enter",
        { hitNavE, afterNavE, hitNavS, afterNavS }
      );

      // C2. Segmented choice in Settings (.set-seg[data-seg="theme"] button:not(.on))
      const hitSegE = await tabTo(page, ".set-seg[data-seg='theme'] button:not(.on)", { scope: "#screenHost" });
      const valE = await page.evaluate(() => document.activeElement?.dataset?.val || "");
      await page.keyboard.press("Enter");
      await sleep(60);
      const afterSegE = await page.evaluate(() => document.querySelector(".set-seg[data-seg='theme'] button.on")?.dataset?.val || "");

      const hitSegS = await tabTo(page, ".set-seg[data-seg='theme'] button:not(.on)", { scope: "#screenHost" });
      const valS = await page.evaluate(() => document.activeElement?.dataset?.val || "");
      await page.keyboard.press("Space");
      await sleep(60);
      const afterSegS = await page.evaluate(() => document.querySelector(".set-seg[data-seg='theme'] button.on")?.dataset?.val || "");

      // Restore light theme
      await page.evaluate(() => {
        const b = document.querySelector(".set-seg[data-seg='theme'] button[data-val='light']");
        if (b && !b.classList.contains("on")) b.click();
      });

      rec(
        hitSegE && hitSegS && afterSegE === valE && afterSegS === valS,
        "settings: segmented choice Space selects option like Enter",
        { valE, afterSegE, valS, afterSegS }
      );

      // C3. Checkbox / switch in Settings (or Maintenance / Library) - also test #sxMaint button
      const hitMtE = await tabTo(page, "#sxMaint", { scope: "#screenHost" });
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterMtE = await page.evaluate(() => !!document.querySelector("#screenHost #mtReset"));
      await page.evaluate(() => window.openScreenTab("settings"));
      await page.waitForSelector("#screenHost:not([hidden]) #sxMaint", { timeout: 3000 });
      await sleep(80);

      const hitMtS = await tabTo(page, "#sxMaint", { scope: "#screenHost" });
      await page.keyboard.press("Space");
      await sleep(80);
      const afterMtS = await page.evaluate(() => !!document.querySelector("#screenHost #mtReset"));

      rec(
        hitMtE && hitMtS && afterMtE && afterMtS,
        "settings: #sxMaint Space opens Maintenance like Enter",
        { hitMtE, afterMtE, hitMtS, afterMtS }
      );

      // --- D. Maintenance & Bubble (#eResetAsk) ---
      // D0. Maintenance nav button ([data-mt="storage"]) so #mtReset becomes visible
      const hitNavMtE = await tabTo(page, "#mtSecs button[data-mt='storage']", { scope: "#screenHost" });
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterNavMtE = await page.evaluate(() => document.querySelector("#screenHost .sx.lm-mt")?.getAttribute("data-page") === "storage");
      await page.evaluate(() => document.querySelector("#mtSecs button[data-mt='health']")?.click());
      await sleep(60);

      const hitNavMtS = await tabTo(page, "#mtSecs button[data-mt='storage']", { scope: "#screenHost" });
      await page.keyboard.press("Space");
      await sleep(80);
      const afterNavMtS = await page.evaluate(() => document.querySelector("#screenHost .sx.lm-mt")?.getAttribute("data-page") === "storage");
      if (!afterNavMtS) { await page.evaluate(() => document.querySelector("#mtSecs button[data-mt='storage']")?.click()); await sleep(60); }

      rec(
        hitNavMtE && hitNavMtS && afterNavMtE && afterNavMtS,
        "maintenance: [data-mt='storage'] Space opens Storage & reset like Enter",
        { hitNavMtE, afterNavMtE, hitNavMtS, afterNavMtS }
      );

      // D1. #mtReset button
      const hitResetE = await tabTo(page, "#mtReset", { scope: "#screenHost" });
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterResetE = await page.evaluate(() => !!document.getElementById("eResetAsk"));
      await page.click("#mtResetCancel").catch(() => {});
      await sleep(60);

      const hitResetS = await tabTo(page, "#mtReset", { scope: "#screenHost" });
      await page.keyboard.press("Space");
      await sleep(80);
      const afterResetS = await page.evaluate(() => !!document.getElementById("eResetAsk"));

      rec(
        hitResetE && hitResetS && afterResetE && afterResetS,
        "maintenance: #mtReset Space opens confirmation bubble like Enter",
        { hitResetE, afterResetE, hitResetS, afterResetS }
      );

      // D2. Bubble button (#mtResetCancel)
      if (!afterResetS) {
        await page.$eval("#mtReset", el => el.click());
        await page.waitForSelector("#eResetAsk", { timeout: 2000 });
        await sleep(60);
      }
      const hitBubE = await tabTo(page, "#mtResetCancel", { scope: "#eResetAsk" });
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterBubE = await page.evaluate(() => !document.getElementById("eResetAsk"));

      await page.$eval("#mtReset", el => el.click());
      await page.waitForSelector("#eResetAsk", { timeout: 2000 });
      await sleep(60);
      const hitBubS = await tabTo(page, "#mtResetCancel", { scope: "#eResetAsk" });
      await page.keyboard.press("Space");
      await sleep(80);
      const afterBubS = await page.evaluate(() => !document.getElementById("eResetAsk"));

      rec(
        hitBubE && hitBubS && afterBubE && afterBubS,
        "bubble: #mtResetCancel Space closes bubble like Enter",
        { hitBubE, afterBubE, hitBubS, afterBubS }
      );

      await page.evaluate(() => window.closeScreenTab && window.closeScreenTab("maintenance"));
      await page.evaluate(() => window.closeScreenTab && window.closeScreenTab("settings"));
      await sleep(80);
    }

    // --- E. The Library (#screenHost) & Dialog (#modal) ---
    {
      await page.evaluate(() => window.openManage());
      await page.waitForSelector("#screenHost:not([hidden]) .mg-cat", { timeout: 4000 });
      await sleep(100);
      await page.evaluate(() => {
        const b = document.querySelector("#libSecs button[data-lm='catmac']");
        if (b && !b.classList.contains("on")) b.click();
      });
      await sleep(80);

      // E1. Category toggle button ([data-toggle])
      const hitTogE = await tabTo(page, "#screenHost [data-toggle]", { scope: "#screenHost" });
      const catKey = hitTogE ? await page.evaluate(() => document.activeElement?.getAttribute("data-toggle") || "") : "";
      const wasOpenE = hitTogE ? await page.evaluate(k => document.querySelector(`#screenHost [data-toggle="${k}"]`)?.getAttribute("aria-expanded"), catKey) : null;
      if (hitTogE) { await page.keyboard.press("Enter"); await sleep(80); }
      const afterTogE = hitTogE ? await page.evaluate(k => document.querySelector(`#screenHost [data-toggle="${k}"]`)?.getAttribute("aria-expanded"), catKey) : null;

      const hitTogS = hitTogE && await tabTo(page, `#screenHost [data-toggle="${catKey}"]`, { scope: "#screenHost" });
      const wasOpenS = afterTogE;
      if (hitTogS) { await page.keyboard.press("Space"); await sleep(80); }
      const afterTogS = hitTogS ? await page.evaluate(k => document.querySelector(`#screenHost [data-toggle="${k}"]`)?.getAttribute("aria-expanded"), catKey) : null;

      rec(
        hitTogE && hitTogS && afterTogE !== wasOpenE && afterTogS !== wasOpenS && afterTogS === wasOpenE,
        "library: category toggle Space expands/collapses like Enter",
        { hitTogE, catKey, wasOpenE, afterTogE, hitTogS, wasOpenS, afterTogS }
      );

      // Ensure a category is open so [data-edit-card] is visible.
      if (!(await page.$("#screenHost .mg-cat.is-open [data-edit-card]"))) {
        const tog = await page.$("#screenHost [data-toggle]");
        if (tog) { await tog.click(); await sleep(80); }
      }

      // E2. Card edit button in Library ([data-edit-card]) -> opens Card Editor dialog (#modal)
      const hitEdE = await tabTo(page, "#screenHost [data-edit-card]", { scope: "#screenHost" });
      if (hitEdE) {
        await page.keyboard.press("Enter");
        await page.waitForSelector("#modal:not([hidden]) #modalCard", { timeout: 3000 }).catch(() => null);
        await sleep(80);
      }
      const afterEdE = await page.evaluate(() => !document.getElementById("modal")?.hidden);
      if (afterEdE) { await page.keyboard.press("Escape").catch(() => {}); await sleep(80); }

      const hitEdS = await tabTo(page, "#screenHost [data-edit-card]", { scope: "#screenHost" });
      if (hitEdS) {
        await page.keyboard.press("Space");
        await page.waitForSelector("#modal:not([hidden]) #modalCard", { timeout: 3000 }).catch(() => null);
        await sleep(80);
      }
      const afterEdS = await page.evaluate(() => !document.getElementById("modal")?.hidden);

      rec(
        hitEdE && hitEdS && afterEdE && afterEdS,
        "library: [data-edit-card] Space opens Card Editor dialog like Enter",
        { hitEdE, afterEdE, hitEdS, afterEdS }
      );

      // --- F. Dialog (#modalCard): language tab, switch (#meOwn), text field, close button ---
      if (!afterEdS) {
        await page.$eval("#screenHost .mg-cat.is-open [data-edit-card]", el => el.click());
        await page.waitForSelector("#modal:not([hidden]) #modalCard", { timeout: 3000 });
        await sleep(80);
      }

      // F1. Dialog close button (#modalX) while clean
      const hitCloseE = await tabTo(page, "#modalX", { scope: "#modalCard" });
      await page.keyboard.press("Enter");
      await sleep(80);
      const afterCloseE = await page.evaluate(() => !!document.getElementById("modal")?.hidden);

      await page.$eval("#screenHost .mg-cat.is-open [data-edit-card]", el => el.click());
      await page.waitForSelector("#modal:not([hidden]) #modalCard", { timeout: 3000 });
      await sleep(80);
      const hitCloseS = await tabTo(page, "#modalX", { scope: "#modalCard" });
      await page.keyboard.press("Space");
      await sleep(80);
      const afterCloseS = await page.evaluate(() => !!document.getElementById("modal")?.hidden);

      rec(
        hitCloseE && hitCloseS && afterCloseE && afterCloseS,
        "dialog: #modalX Space closes dialog like Enter",
        { hitCloseE, afterCloseE, hitCloseS, afterCloseS }
      );

      // Reopen dialog for language tab, checkbox/switch, and text field checks.
      if (afterCloseS) {
        await page.$eval("#screenHost .mg-cat.is-open [data-edit-card]", el => el.click());
        await page.waitForSelector("#modal:not([hidden]) #modalCard", { timeout: 3000 });
        await sleep(80);
      }

      // F2. Language tab inside dialog
      const hitTabE = await tabTo(page, ".lang-tabs button[role='tab']:not(.on)", { scope: "#modalCard" });
      const langE = await page.evaluate(() => document.activeElement?.dataset?.l || "");
      await page.keyboard.press("Enter");
      await sleep(60);
      const afterTabE = await page.evaluate(() => document.querySelector("#modalCard .lang-tabs button[role='tab'].on")?.dataset?.l || "");

      const hitTabS = await tabTo(page, ".lang-tabs button[role='tab']:not(.on)", { scope: "#modalCard" });
      const langS = await page.evaluate(() => document.activeElement?.dataset?.l || "");
      await page.keyboard.press("Space");
      await sleep(60);
      const afterTabS = await page.evaluate(() => document.querySelector("#modalCard .lang-tabs button[role='tab'].on")?.dataset?.l || "");

      rec(
        hitTabE && hitTabS && afterTabE === langE && afterTabS === langS,
        "dialog: language tab Space switches tab like Enter",
        { langE, afterTabE, langS, afterTabS }
      );

      // F3. Control: text field in editor keeps Space (move caret to end first so selection isn't overwritten)
      const hitField = await tabTo(page, "#modalCard input[type='text'], #modalCard input:not([type]), #modalCard textarea", { scope: "#modalCard" });
      await page.keyboard.press("ArrowRight");
      const prevVal = await page.evaluate(() => document.activeElement?.value || "");
      await page.keyboard.press("Space");
      await sleep(40);
      const nextVal = await page.evaluate(() => document.activeElement?.value || "");
      rec(
        hitField && nextVal === prevVal + " ",
        "control (dialog): editor text field keeps Space as a space",
        { hitField, prevVal, nextVal }
      );

      // F4. Control: checkbox (#meIntents input[type="checkbox"]) & switch (#meOwn inside Advanced details) toggle on Space
      const hitIntSum = await tabTo(page, "details[data-fold='intents'] summary", { scope: "#modalCard" });
      if (hitIntSum) { await page.keyboard.press("Space"); await sleep(60); }
      const hitCb = await tabTo(page, "#meIntents input[type='checkbox']", { scope: "#modalCard" });
      const cbBefore = hitCb ? await page.evaluate(() => document.activeElement?.checked) : null;
      if (hitCb) { await page.keyboard.press("Space"); await sleep(40); }
      const cbAfter = hitCb ? await page.evaluate(() => document.activeElement?.checked) : null;
      if (hitCb && cbAfter !== cbBefore) { await page.keyboard.press("Space"); await sleep(40); }

      const hitAdvSum = await tabTo(page, "details[data-fold='adv'] summary", { scope: "#modalCard", maxSteps: 360 });
      if (hitAdvSum) { await page.keyboard.press("Space"); await sleep(60); }
      const hitSw = await tabTo(page, "#meOwn", { scope: "#modalCard", maxSteps: 360 });
      const swBefore = hitSw ? await page.$eval("#meOwn", el => el.checked) : null;
      if (hitSw) { await page.keyboard.press("Space"); await sleep(40); }
      const swAfter = hitSw ? await page.$eval("#meOwn", el => el.checked) : null;
      if (hitSw && swAfter !== swBefore) { await page.keyboard.press("Space"); await sleep(40); }
      rec(
        hitCb && cbAfter !== cbBefore && hitSw && swAfter !== swBefore,
        "control (dialog): checkbox and #meOwn switch toggle on Space as before",
        { hitIntSum, hitCb, cbBefore, cbAfter, hitAdvSum, hitSw, swBefore, swAfter }
      );

      // Close modal cleanly (force close since F4 dirtied the input)
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll("#modalCard button")];
        const cancel = btns.find(b => /cancel/i.test(b.textContent || ""));
        if (cancel) cancel.click();
      });
      await sleep(60);
      const discardBtn = await page.$("#eDiscardAsk button.danger, #eDiscardAsk button[data-discard], #eDiscardAsk button:last-child");
      if (discardBtn) { await discardBtn.click().catch(() => {}); await sleep(60); }
      await page.evaluate(() => window.closeModal && window.closeModal(true));
      await sleep(60);

      // E3. Library sort heading ([data-sort-col], span role="button")
      const hasSort = await page.$("#screenHost [data-sort-col]");
      if (hasSort) {
        const hitSortE = await tabTo(page, "#screenHost [data-sort-col]", { scope: "#screenHost" });
        await page.keyboard.press("Enter");
        await sleep(60);
        const sortE = await page.evaluate(() => document.querySelector("#screenHost .lw-sort-line")?.textContent || "");
        const hitSortS = await tabTo(page, "#screenHost [data-sort-col]", { scope: "#screenHost" });
        await page.keyboard.press("Space");
        await sleep(60);
        const sortS = await page.evaluate(() => document.querySelector("#screenHost .lw-sort-line")?.textContent || "");
        rec(
          hitSortE && hitSortS && !!sortE && !!sortS && sortE !== sortS,
          "library: [data-sort-col] Space cycles sort like Enter",
          { hitSortE, sortE, hitSortS, sortS }
        );
      } else {
        rec(false, "library: [data-sort-col] found in list view", { hasSort: false });
      }

      await page.evaluate(() => window.closeScreenTab && window.closeScreenTab("library"));
      await sleep(80);
    }

    // --- G. Controls: hold repeat, text fields, checkboxes/switches, nothing focused ---
    // G1. Holding Space does not press again and again (on .star-btn, #tabsListBtn and .tab-label)
    async function holdSpace(p) {
      await p.keyboard.down("Space");
      await sleep(80);
      await p.evaluate(() => {
        const t = document.activeElement || document.body;
        for (let i = 0; i < 4; i++) {
          t.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", repeat: true, bubbles: true, cancelable: true }));
        }
      });
      await sleep(80);
      await p.keyboard.up("Space");
      await sleep(80);
    }

    {
      await tabTo(page, ".card .cacts button[data-act='fav']");
      const cid = await page.evaluate(() => document.activeElement?.closest(".card")?.dataset?.id || "");
      const before = await page.evaluate(id => document.querySelector(`.card[data-id="${id}"] [data-act="fav"]`)?.getAttribute("aria-pressed"), cid);
      await page.evaluate(id => {
        window.__starClicks = 0;
        const b = document.querySelector(`.card[data-id="${id}"] [data-act="fav"]`);
        if (b) b.addEventListener("click", () => { window.__starClicks++; });
      }, cid);
      await holdSpace(page);
      const after = await page.evaluate(id => ({
        pressed: document.querySelector(`.card[data-id="${id}"] [data-act="fav"]`)?.getAttribute("aria-pressed"),
        clicks: window.__starClicks,
        lanes: document.body.classList.contains("e-lanes")
      }), cid);
      if (after.lanes) { await page.keyboard.press("Space"); await sleep(80); }
      rec(
        after.pressed !== before && after.clicks === 1 && !after.lanes,
        "hold: holding Space on card star button presses it once, not again and again",
        { before, after }
      );
    }

    {
      await tabTo(page, "#tabsListBtn");
      await page.evaluate(() => {
        window.__tlRepeats = 0;
        const m = document.getElementById("tabsListMenu");
        if (m) new MutationObserver(() => { window.__tlRepeats++; }).observe(m, { attributes: true, attributeFilter: ["hidden"] });
      });
      await holdSpace(page);
      const after = await page.evaluate(() => ({
        open: !document.getElementById("tabsListMenu")?.hidden,
        flips: window.__tlRepeats
      }));
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(60);
      rec(
        after.open && after.flips === 1,
        "hold: holding Space on #tabsListBtn opens tabs menu once without flickering",
        after
      );
    }

    {
      // Ensure inactive tab, then hold Space on inactive .tab-label
      await page.click(".tab-add");
      await sleep(80);
      await tabTo(page, ".tab:not(.on) .tab-label");
      const targetTid = await page.evaluate(() => document.activeElement?.closest(".tab")?.dataset?.tid || "");
      await page.evaluate(() => {
        window.__tabSwitched = 0;
        const bar = document.getElementById("tabsBar");
        if (bar) new MutationObserver(() => { window.__tabSwitched++; }).observe(bar, { subtree: true, attributes: true, attributeFilter: ["class"] });
      });
      await holdSpace(page);
      const after = await page.evaluate(() => ({
        activeTid: document.querySelector(".tab.on")?.dataset?.tid || "",
        lanes: document.body.classList.contains("e-lanes"),
        switches: window.__tabSwitched
      }));
      if (after.lanes) { await page.keyboard.press("Space"); await sleep(80); }
      rec(
        after.activeTid === targetTid && !after.lanes,
        "hold: holding Space on .tab-label switches tab once without opening lanes",
        { targetTid, after }
      );
    }

    // G2. Text fields keep Space (#pax, non-empty #intent, Quick facts note editor)
    {
      await page.focus("#pax");
      await page.evaluate(() => { const p = document.getElementById("pax"); p.value = "Jan"; p.setSelectionRange(3, 3); });
      await page.keyboard.press("Space");
      await sleep(40);
      const paxVal = await page.$eval("#pax", el => el.value);

      await page.focus("#intent");
      await page.evaluate(() => { const i = document.getElementById("intent"); i.value = "ref"; i.setSelectionRange(3, 3); });
      await page.keyboard.press("Space");
      await sleep(40);
      const intentVal = await page.$eval("#intent", el => el.value);
      await page.evaluate(() => { const i = document.getElementById("intent"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); });
      await sleep(60);

      await page.click("#factsBtn");
      await page.waitForSelector("#factsPanel:not([hidden])", { timeout: 2000 });
      await page.click("#factsEditBtn");
      await page.waitForSelector("#factsEdit", { timeout: 2000 });
      await page.evaluate(() => { const ta = document.getElementById("factsEdit"); ta.value = "abc"; ta.setSelectionRange(3, 3); });
      await page.keyboard.press("Space");
      await sleep(40);
      const factsVal = await page.$eval("#factsEdit", el => el.value);
      await page.click("#factsCancelBtn").catch(() => {});
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(60);

      rec(
        paxVal === "Jan " && intentVal === "ref " && factsVal === "abc ",
        "control (fields): #pax, non-empty #intent, and #factsEdit keep Space",
        { paxVal, intentVal, factsVal }
      );
    }

    // G3. Nothing focused: Space still toggles lanes (and back)
    {
      await page.evaluate(() => {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        document.body.focus && document.body.focus();
      });
      await sleep(40);
      await page.keyboard.press("Space");
      await sleep(120);
      const lanesOn = await page.evaluate(() => document.body.classList.contains("e-lanes"));
      await page.keyboard.press("Space");
      await sleep(120);
      const lanesOff = await page.evaluate(() => !document.body.classList.contains("e-lanes"));
      rec(
        lanesOn && lanesOff,
        "page: with nothing focused, Space toggles lanes on and back off",
        { lanesOn, lanesOff }
      );
    }

    // G4. Empty #intent focused: Space still toggles lanes (and back)
    {
      await page.focus("#intent");
      await page.evaluate(() => { const i = document.getElementById("intent"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); });
      await sleep(40);
      await page.keyboard.press("Space");
      await sleep(120);
      const lanesOn = await page.evaluate(() => document.body.classList.contains("e-lanes"));
      await page.keyboard.press("Space");
      await sleep(120);
      const lanesOff = await page.evaluate(() => !document.body.classList.contains("e-lanes"));
      rec(
        lanesOn && lanesOff,
        "page: with empty #intent focused, Space toggles lanes on and back off",
        { lanesOn, lanesOff }
      );
    }

    // --- G5. Pointer click vs Tab: Space presses only what wears the keyboard focus ring ---
    // G5a. Native button (#theme)
    {
      await page.click("#theme");
      await sleep(80);
      const afterClick = await page.evaluate(() => ({
        th: document.documentElement.getAttribute("data-theme"),
        id: document.activeElement?.id || "",
        fv: !!document.activeElement?.matches(":focus-visible")
      }));
      const fvPtr = await ringNow(page);
      await page.keyboard.press("Space");
      await sleep(100);
      const ptrSpace = await page.evaluate(() => ({
        th: document.documentElement.getAttribute("data-theme"),
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (ptrSpace.lanes) { await page.keyboard.press("Space"); await sleep(80); }
      if (ptrSpace.th !== "light") { await page.click("#theme"); await sleep(80); }

      const beforeTab = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      const hitTab = await tabTo(page, "#theme");
      const fvTab = await ringNow(page);
      await page.keyboard.press("Space");
      await sleep(80);
      const tabSpace = await page.evaluate(() => ({
        th: document.documentElement.getAttribute("data-theme"),
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (tabSpace.lanes) { await page.keyboard.press("Space"); await sleep(80); }
      if (tabSpace.th !== "light") { await page.click("#theme"); await sleep(80); }

      rec(
        afterClick.id === "theme" && !afterClick.fv && ptrSpace.lanes && ptrSpace.th === afterClick.th &&
          hitTab && tabSpace.th !== beforeTab && !tabSpace.lanes &&
          fvPtr === (ptrSpace.th !== afterClick.th) && fvTab === (tabSpace.th !== beforeTab) && fvTab && !fvPtr,
        "pointer vs tab (native button): #theme clicked+Space switches lanes without pressing; Tab+Space toggles theme; pressed iff ringed before the key",
        { afterClick, fvPtr, ptrSpace, beforeTab, hitTab, fvTab, tabSpace }
      );
    }

    // G5b. Tab (role="tab" .tab-label on band)
    {
      if ((await page.$$eval(".tab:not(.on)", xs => xs.length)) === 0) {
        await page.click(".tab-add");
        await sleep(80);
      }
      const clickTid = await page.$eval(".tab:not(.on)", el => el.dataset?.tid || "");
      await page.click(".tab:not(.on) .tab-label");
      await sleep(80);
      const afterClick = await page.evaluate(() => ({
        cls: document.activeElement?.className || "",
        tid: document.activeElement?.closest(".tab")?.dataset?.tid || "",
        fv: !!document.activeElement?.matches(":focus-visible")
      }));
      const fvPtr = await ringNow(page);
      await page.keyboard.press("Space");
      await sleep(100);
      const ptrSpace = await page.evaluate(() => ({
        activeTid: document.querySelector(".tab.on")?.dataset?.tid || "",
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (ptrSpace.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      const hitTab = await tabTo(page, ".tab:not(.on) .tab-label");
      const tabTid = await page.evaluate(() => document.activeElement?.closest(".tab")?.dataset?.tid || "");
      const fvTab = await ringNow(page);
      await page.keyboard.press("Space");
      await sleep(80);
      const tabSpace = await page.evaluate(() => ({
        activeTid: document.querySelector(".tab.on")?.dataset?.tid || "",
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (tabSpace.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        afterClick.tid === clickTid && afterClick.cls.includes("tab-label") && !afterClick.fv &&
          ptrSpace.lanes && ptrSpace.activeTid === clickTid &&
          hitTab && tabSpace.activeTid === tabTid && !tabSpace.lanes &&
          fvTab && !fvPtr && fvTab === (tabSpace.activeTid === tabTid),
        "pointer vs tab (tab): .tab-label clicked+Space switches lanes; Tab+Space switches tab; pressed iff ringed before the key",
        { clickTid, afterClick, fvPtr, ptrSpace, hitTab, tabTid, fvTab, tabSpace }
      );
    }

    // G5c. Switch / toggle (#railPinBtn)
    {
      await page.click("#railPinBtn");
      await sleep(80);
      const afterClick = await page.evaluate(() => ({
        pressed: document.getElementById("railPinBtn")?.getAttribute("aria-pressed"),
        id: document.activeElement?.id || "",
        fv: !!document.activeElement?.matches(":focus-visible")
      }));
      const fvPtr = await ringNow(page);
      await page.keyboard.press("Space");
      await sleep(100);
      const ptrSpace = await page.evaluate(() => ({
        pressed: document.getElementById("railPinBtn")?.getAttribute("aria-pressed"),
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (ptrSpace.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      const beforeTab = ptrSpace.pressed;
      const hitTab = await tabTo(page, "#railPinBtn");
      const fvTab = await ringNow(page);
      await page.keyboard.press("Space");
      await sleep(80);
      const tabSpace = await page.evaluate(() => ({
        pressed: document.getElementById("railPinBtn")?.getAttribute("aria-pressed"),
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (tabSpace.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        afterClick.id === "railPinBtn" && !afterClick.fv && ptrSpace.lanes && ptrSpace.pressed === afterClick.pressed &&
          hitTab && tabSpace.pressed !== beforeTab && !tabSpace.lanes &&
          fvPtr === (ptrSpace.pressed !== afterClick.pressed) && fvTab === (tabSpace.pressed !== beforeTab) && fvTab && !fvPtr,
        "pointer vs tab (switch): #railPinBtn clicked+Space switches lanes without toggling; Tab+Space toggles pin; pressed iff ringed before the key",
        { afterClick, fvPtr, ptrSpace, beforeTab, hitTab, fvTab, tabSpace }
      );
    }

    // G5d. Card's button (.card .cacts button[data-act='edit'])
    {
      const cid = await page.$eval(".card .cacts button[data-act='edit']", el => el.closest(".card")?.dataset?.id || "");
      const sel = `.card[data-id="${cid}"] .cacts button[data-act="edit"]`;
      await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
      await page.hover(`.card[data-id="${cid}"]`);
      await sleep(40);
      await page.click(sel);
      await page.waitForSelector("#modal:not([hidden]) #modalCard", { timeout: 3000 });
      await sleep(80);
      await page.keyboard.press("Escape");
      await settleAfterEscape(page);
      const afterEsc = await page.evaluate(() => ({
        modalHidden: !!document.getElementById("modal")?.hidden,
        act: document.activeElement?.getAttribute?.("data-act") || "",
        fv: !!document.activeElement?.matches(":focus-visible")
      }));
      const fvPtr = await ringNow(page);
      await page.keyboard.press("Space");
      await sleep(100);
      const ptrSpace = await page.evaluate(() => ({
        modalOpen: !document.getElementById("modal")?.hidden,
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (ptrSpace.modalOpen) { await page.keyboard.press("Escape").catch(() => {}); await sleep(80); }
      if (ptrSpace.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      const hitTab = await tabTo(page, sel, { maxSteps: 360 });
      const fvTab = await ringNow(page);
      await page.keyboard.press("Space");
      await sleep(100);
      const tabSpace = await page.evaluate(() => ({
        modalOpen: !document.getElementById("modal")?.hidden,
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (tabSpace.modalOpen) { await page.keyboard.press("Escape").catch(() => {}); await sleep(80); }
      if (tabSpace.lanes) { await page.keyboard.press("Space"); await sleep(80); }

      rec(
        afterEsc.modalHidden && afterEsc.act === "edit" && !afterEsc.fv &&
          ptrSpace.lanes && !ptrSpace.modalOpen && hitTab && tabSpace.modalOpen && !tabSpace.lanes &&
          fvPtr === ptrSpace.modalOpen && fvTab === tabSpace.modalOpen && fvTab && !fvPtr,
        "pointer vs tab (card button): edit button clicked+Escape+Space switches lanes without opening editor; Tab+Space opens editor; pressed iff ringed before the key",
        { cid, afterEsc, fvPtr, ptrSpace, hitTab, fvTab, tabSpace }
      );
    }

    // --- G6. A dialog closed by Escape hands focus back; Space then follows the ring the eye sees ---
    // The leg reads :focus-visible just before the Space and requires pressed (editor opens) iff ringed,
    // for a dialog opened by keyboard (Tab, Enter) and by pointer (click).
    for (const how of ["keyboard", "pointer"]) {
      const cid = await page.$eval(".card .cacts button[data-act='edit']", el => el.closest(".card")?.dataset?.id || "");
      const sel = `.card[data-id="${cid}"] .cacts button[data-act="edit"]`;
      let opened = false;
      if (how === "keyboard") {
        const hit = await tabTo(page, sel, { maxSteps: 360 });
        await page.keyboard.press("Enter");
        opened = hit && !!(await page.waitForSelector("#modal:not([hidden]) #modalCard", { timeout: 3000 }).catch(() => null));
      } else {
        await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
        await page.hover(`.card[data-id="${cid}"]`);
        await sleep(40);
        await page.click(sel);
        opened = !!(await page.waitForSelector("#modal:not([hidden]) #modalCard", { timeout: 3000 }).catch(() => null));
      }
      await sleep(80);
      await page.keyboard.press("Escape");
      await settleAfterEscape(page);
      const back = await page.evaluate(() => ({
        modalHidden: !!document.getElementById("modal")?.hidden,
        act: document.activeElement?.getAttribute?.("data-act") || ""
      }));
      const fv = await ringNow(page);
      await page.keyboard.press("Space");
      await sleep(100);
      const after = await page.evaluate(() => ({
        modalOpen: !document.getElementById("modal")?.hidden,
        lanes: document.body.classList.contains("e-lanes")
      }));
      if (after.modalOpen) { await page.keyboard.press("Escape").catch(() => {}); await sleep(80); }
      if (after.lanes) { await page.keyboard.press("Space"); await sleep(80); }
      rec(
        opened && back.modalHidden && back.act === "edit" &&
          fv === after.modalOpen && fv === !after.lanes && fv === (how === "keyboard"),
        "ring agreement (dialog opened by " + how + ", closed by Escape, focus handed back): Space presses iff the control wore the ring, else switches lanes",
        { how, opened, back, fv, after }
      );
    }
  } finally {
    await page.close().catch(() => {});
  }

  // --- H. Empty desk role="button" link (#emptyAddCard) ---
  const emptyDir = path.join(path.dirname(enginePath), "empty-sub");
  fs.mkdirSync(emptyDir, { recursive: true });
  fs.copyFileSync(enginePath, path.join(emptyDir, "etiuda.html"));
  const pageEmpty = await openDesk(browser, fileUrl(path.join(emptyDir, "etiuda.html")), { empty: true, incognito: true });
  try {
    await pageEmpty.waitForSelector("#emptyAddCard", { timeout: 6000 });
    const hitE = await tabTo(pageEmpty, "#emptyAddCard");
    await pageEmpty.keyboard.press("Enter");
    await sleep(100);
    const afterE = await pageEmpty.evaluate(() => ({
      modalOpen: !document.getElementById("modal")?.hidden,
      lanes: document.body.classList.contains("e-lanes")
    }));
    await pageEmpty.keyboard.press("Escape").catch(() => {});
    await sleep(80);

    const hitS = await tabTo(pageEmpty, "#emptyAddCard");
    await pageEmpty.keyboard.press("Space");
    await sleep(100);
    const afterS = await pageEmpty.evaluate(() => ({
      modalOpen: !document.getElementById("modal")?.hidden,
      lanes: document.body.classList.contains("e-lanes")
    }));
    if (afterS.modalOpen) { await pageEmpty.keyboard.press("Escape").catch(() => {}); await sleep(80); }
    if (afterS.lanes) { await pageEmpty.keyboard.press("Space"); await sleep(80); }

    rec(
      hitE && hitS && afterE.modalOpen && !afterE.lanes && afterS.modalOpen && !afterS.lanes,
      "empty desk: #emptyAddCard (role=button link) Space opens editor like Enter",
      { hitE, afterE, hitS, afterS }
    );

    // Pointer click on #emptyAddCard (dismissed with Escape -> focus returns without ring) vs Tab
    await pageEmpty.click("#emptyAddCard");
    await pageEmpty.waitForSelector("#modal:not([hidden]) #modalCard", { timeout: 3000 });
    await sleep(80);
    await pageEmpty.keyboard.press("Escape");
    await settleAfterEscape(pageEmpty);
    const afterEsc = await pageEmpty.evaluate(() => ({
      id: document.activeElement?.id || "",
      fv: !!document.activeElement?.matches(":focus-visible"),
      modalHidden: !!document.getElementById("modal")?.hidden
    }));
    const fvPtr = await ringNow(pageEmpty);
    await pageEmpty.keyboard.press("Space");
    await sleep(100);
    const ptrSpace = await pageEmpty.evaluate(() => ({
      modalOpen: !document.getElementById("modal")?.hidden,
      lanes: document.body.classList.contains("e-lanes")
    }));
    if (ptrSpace.modalOpen) { await pageEmpty.keyboard.press("Escape").catch(() => {}); await sleep(80); }
    if (ptrSpace.lanes) { await pageEmpty.keyboard.press("Space"); await sleep(80); }

    const hitTab = await tabTo(pageEmpty, "#emptyAddCard");
    const fvTab = await ringNow(pageEmpty);
    await pageEmpty.keyboard.press("Space");
    await sleep(100);
    const tabSpace = await pageEmpty.evaluate(() => ({
      modalOpen: !document.getElementById("modal")?.hidden,
      lanes: document.body.classList.contains("e-lanes")
    }));
    if (tabSpace.modalOpen) { await pageEmpty.keyboard.press("Escape").catch(() => {}); await sleep(80); }
    if (tabSpace.lanes) { await pageEmpty.keyboard.press("Space"); await sleep(80); }

    rec(
      afterEsc.id === "emptyAddCard" && !afterEsc.fv && afterEsc.modalHidden &&
        ptrSpace.lanes && !ptrSpace.modalOpen && hitTab && tabSpace.modalOpen && !tabSpace.lanes &&
        fvPtr === ptrSpace.modalOpen && fvTab === tabSpace.modalOpen && fvTab && !fvPtr,
      "pointer vs tab (role=button): #emptyAddCard clicked+Escape+Space switches lanes; Tab+Space opens editor; pressed iff ringed before the key",
      { afterEsc, fvPtr, ptrSpace, hitTab, fvTab, tabSpace }
    );
  } finally {
    await pageEmpty.close().catch(() => {});
    if (pageEmpty.__ownCtx) await pageEmpty.__ownCtx.close().catch(() => {});
    try { fs.rmSync(emptyDir, { recursive: true, force: true }); } catch (_) {}
  }

  return results;
}

let browser = null;
try {
  browser = await launch();
  await runSuite(browser, path.join(dirMain, "etiuda.html"));

  // Inline plant proof: restore the old lanesKeyFree rule that stole Space from focused buttons/checkboxes.
  const lanesKeyFreeRe = /function lanesKeyFree\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}(?=\s*\n\s*function lanesKey)/;
  if (PLANTS_OFF) {
    notRun("plant:lanes-steals-space (ETIUDA_PLANTS=off)");
  } else {
    const rawHtml = fs.readFileSync(E.ENGINE_PATH, "utf8");
    const plantedHtml = rawHtml.replace(
      lanesKeyFreeRe,
      'function lanesKeyFree(active,box,body){if(!active||active===body)return true;if(box&&active===box)return !String(box.value||"");if(active.isContentEditable)return false;const tag=String(active.tagName||"").toUpperCase();if(tag==="TEXTAREA")return false;if(tag==="INPUT"&&!/^(button|checkbox|radio|range|color|file|submit|reset|image)$/i.test(String(active.type||"text")))return false;return !(typeof active.closest==="function"&&active.closest(".modal,.bub,[role=dialog],[role=alertdialog],[role=menu],[role=listbox]"));}'
    );
    const plantWritten = plantedHtml !== rawHtml;
    const plantPath = path.join(dirPlant, "etiuda.html");
    fs.writeFileSync(plantPath, plantedHtml, "utf8");
    let plantFails = [];
    if (plantWritten) {
      const res = await runSuite(browser, plantPath, { silent: true });
      plantFails = res.filter(r => !r.ok).map(r => r.label);
    }
    check(
      plantWritten && plantFails.length > 0,
      "inline plant proof: restoring lanes Space theft over buttons turns leg red",
      { plantWritten, failCount: plantFails.length, sampleFails: plantFails.slice(0, 5) }
    );
  }

  // Inline plant proof: restore "any focused control keeps Space" (ignoring focus ring) and turn pointer cases red.
  if (PLANTS_OFF) {
    notRun("plant:any-focused-control-keeps-space (ETIUDA_PLANTS=off)");
  } else {
    const rawHtml = fs.readFileSync(E.ENGINE_PATH, "utf8");
    const plantedHtml = rawHtml.replace(
      lanesKeyFreeRe,
      'function lanesKeyFree(active,box,body){if(!active||active===body)return true;if(box&&active===box)return !String(box.value||"");if(active.isContentEditable)return false;const tag=String(active.tagName||"").toUpperCase();if(tag==="TEXTAREA"||tag==="INPUT"||tag==="SELECT"||tag==="BUTTON"||tag==="SUMMARY"||tag==="A")return false;const role=typeof active.getAttribute==="function"?String(active.getAttribute("role")||"").toLowerCase():"";if(/^(button|menuitem|tab|switch|checkbox|radio|link|option|combobox)$/.test(role))return false;return !(typeof active.closest==="function"&&active.closest(".modal,.bub,[role=dialog],[role=alertdialog],[role=menu],[role=listbox],button,a[href],summary,select,[role=button],[role=menuitem],[role=tab],[role=switch],[role=checkbox],[role=radio]"));}'
    );
    const plantWritten = plantedHtml !== rawHtml;
    const plantPath = path.join(dirPlant, "etiuda-keep-space.html");
    fs.writeFileSync(plantPath, plantedHtml, "utf8");
    let plantFails = [];
    if (plantWritten) {
      const res = await runSuite(browser, plantPath, { silent: true });
      plantFails = res.filter(r => !r.ok).map(r => r.label);
    }
    check(
      plantWritten && plantFails.some(l => l.startsWith("pointer vs tab")),
      "inline plant proof: restoring any-focused-control-keeps-space turns pointer cases red",
      { plantWritten, failCount: plantFails.length, sampleFails: plantFails.slice(0, 5) }
    );
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (_) {}
}

console.log("#counts checks=" + checks + " skipped=" + skipped + " failed=" + fails + " expected=" + EXPECTED);
if (checks + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (checks + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(checks + " checks, " + fails + " failed");
process.exit(fails);
