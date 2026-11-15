/* FRONTING THE LIBRARY, AND PRESSING ONE OF ITS SECTIONS, DRAWS NO MORE THAN SETTINGS DOES. Chrome, headless, no fixtures.
 *
 *   node tests/library-switch.mjs [--engine <file>]
 *
 * The case is Max's (2026-11-14 18:52): "When I'm on a different tab (chat tab, or Settings tab), and then click on a
 * Library tab that's open beside, it takes significant fraction of a second for it to switch. The same with clicking on
 * different section within the Library. That's not the case with Settings tab - everything reacts pretty much instantly
 * there." The delay was the Library drawn afresh on every such press: every section of it, about ten thousand elements
 * over a catalog of real size, parsed, translated, wired and measured, for one section shown.
 *
 * WHAT IS MEASURED. Each press is a real click, five of each. Two numbers per press:
 *   drawn      the elements in the screen that the press created, counted by marking every element shown there before
 *              and after each press, a mark the element keeps off screen, and counting the unmarked ones after a press: the work that made the delay, counted rather than timed,
 *              so it does not move with the machine
 *   to paint   the click's own Event Timing duration, from the press to the next painted frame, as the hand feels it;
 *              printed beside the verdict with Settings' own, and not part of it, since a loaded machine moves it
 * The budget is BUDGET elements drawn per press, the most in any of the five:
 *   ls1  a conversation to the Library
 *   ls2  Settings to the Library
 *   ls3  each of the Library's four sections, pressed in turn
 *   ls4  THE CONTROL, in the same page: the Library drawn afresh (openManage, as an edit does) counts more than the
 *        budget, so ls1 to ls3 would see the fault
 *   ls5  a change made while the Library is away reaches it: a card starred from the desk is starred in the Library
 *        when its tab is fronted again, so a page put back is never a stale one
 *   ls6  each search keystroke in #libSearch and Escape to clear draws at most 10 elements (only the filtered list)
 *   ls7  typing a search filters to matching rows with focus held on #libSearch, and Escape restores the section
 * The catalog is the shipped sample, of a real catalog's size. Exit code is the number of failed checks; 78 when the
 * run could not complete.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

let fails = 0, checks = 0;
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EXPECTED = 10, REPS = 5, BUDGET = 1000, KEY_BUDGET = 10;
const argv = process.argv.slice(2);
const at = argv.indexOf("--engine");
const ENGINE = at >= 0 ? path.resolve(argv[at + 1]) : E.ENGINE_PATH;

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-library-switch-"));
fs.copyFileSync(ENGINE, path.join(lab, "etiuda.html"));
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
const url = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };

let browser = null, done = false;
try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true,
    args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  const p = await browser.newPage();
  await p.setViewport({ width: 1500, height: 950 });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.evaluateOnNewDocument(() => {
    try { for (const k of ["eTourDone_v3", "eTourInvite_v3", "eNameAsked"]) localStorage.setItem(k, "1"); } catch (e) {}
    window.__ev = [];
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__ev.push({ n: e.name, d: e.duration }); })
      .observe({ type: "event", durationThreshold: 16, buffered: true });
  });
  await p.goto(url, { waitUntil: "load", timeout: 60000 });
  await p.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await p.$("#ecYes")) await p.click("#ecYes");
  await p.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await sleep(1200);
  await p.evaluate(() => { window.openScreenTab("settings"); window.openManage(); });
  await sleep(800);
  const size = await p.evaluate(() => ({ cards: (window.cards || []).length,
    els: document.getElementById("screenHost").querySelectorAll("*").length }));
  console.log("       " + size.cards + " cards; the Library holds " + size.els + " elements");
  if (!(size.els > BUDGET * 2)) throw new Error("the Library holds " + size.els + " elements, too few for a budget of " + BUDGET + " to tell a fresh draw from none");

  const mark = () => p.evaluate(() => { document.getElementById("screenHost").querySelectorAll("*").forEach(e => { e.__seen = 1; }); });
  const count = () => p.evaluate(() => Array.from(document.getElementById("screenHost").querySelectorAll("*")).filter(e => !e.__seen).length);
  await mark();
  const press = async sel => {
    await mark();
    await p.evaluate(() => { window.__ev = []; });
    const h = await p.$(sel);
    if (!h) throw new Error("nothing to press at " + sel);
    await h.click();
    await sleep(500);
    const drawn = await count();
    await mark();
    const d = await p.evaluate(() => window.__ev.filter(e => /pointer|click|mouse/.test(e.n)).reduce((m, e) => Math.max(m, e.d), 0));
    return { drawn, paint: d };
  };
  const tab = sid => '#tabsBar .tab.screen[data-sid="' + sid + '"] .tab-label';
  const conv = "#tabsBar .tab:not(.screen) .tab-label";
  const series = async (from, to) => {
    const rows = [];
    for (let r = 0; r < REPS; r++) { await (await p.$(from)).click(); await sleep(400); rows.push(await press(to)); }
    return rows;
  };
  const say = rows => "most drawn " + Math.max(...rows.map(r => r.drawn)) + ", median " + median(rows.map(r => r.paint))
    + " ms to paint (drawn/ms per press: " + rows.map(r => r.drawn + "/" + r.paint).join(" ") + ")";
  const most = rows => Math.max(...rows.map(r => r.drawn));

  const setFromConv = await series(conv, tab("settings"));
  console.log("       a conversation to Settings: " + say(setFromConv));
  const libFromConv = await series(conv, tab("library"));
  check(most(libFromConv) <= BUDGET, "ls1 a conversation to the Library: " + say(libFromConv) + "; at most " + BUDGET + " drawn");
  const libFromSet = await series(tab("settings"), tab("library"));
  check(most(libFromSet) <= BUDGET, "ls2 Settings to the Library: " + say(libFromSet) + "; at most " + BUDGET + " drawn");

  await (await p.$(tab("settings"))).click(); await sleep(400);
  const sx = await p.$$eval("#sxSecs .sx-sec[data-sx]", bs => bs.map(b => b.dataset.sx).slice(0, 4));
  const setSecs = [];
  for (let r = 0; r < REPS; r++) for (const k of sx) setSecs.push(await press('#sxSecs .sx-sec[data-sx="' + k + '"]'));
  console.log("       a Settings section: " + say(setSecs));
  await (await p.$(tab("library"))).click(); await sleep(400);
  const secs = {};
  for (let r = 0; r < REPS; r++) for (const k of ["catmac", "intents", "who", "data"])
    (secs[k] = secs[k] || []).push(await press('#libSecs .sx-sec[data-lm="' + k + '"]'));
  for (const k of Object.keys(secs))
    check(most(secs[k]) <= BUDGET, "ls3 the Library's section " + k + ": " + say(secs[k]) + "; at most " + BUDGET + " drawn");

  /* The control: an edit's own path draws the whole Library again, and the count must see it. */
  await mark();
  await p.evaluate(() => window.openManage());
  await sleep(400);
  const fresh = await count();
  check(fresh > BUDGET, "ls4 THE CONTROL: the Library drawn afresh in the same page counts " + fresh + " drawn, more than "
    + BUDGET + ", so ls1 to ls3 see a fresh draw");

  /* A change made away from the Library: the first card starred from the desk, then the tab fronted again. */
  await (await p.$(conv)).click(); await sleep(400);
  const star = await p.evaluate(() => {
    const id = (window.cards || []).map(c => c && c.id).find(Boolean);
    const was = (window.pack && Array.isArray(window.pack.favourites) ? window.pack.favourites : []).includes(id);
    window.toggleFavourite(id);
    return { id, want: was ? "false" : "true" };
  });
  await sleep(300);
  await (await p.$(tab("library"))).click(); await sleep(500);
  const shown = await p.evaluate(id => { const b = document.querySelector('#screenHost [data-fav-card="' + CSS.escape(id) + '"]');
    return b ? b.getAttribute("aria-pressed") : "absent"; }, star.id);
  check(shown === star.want, "ls5 a card starred from the desk while the Library was away reads aria-pressed " + shown
    + " in the Library fronted again (wanted " + star.want + ")");
  await p.evaluate(id => window.toggleFavourite(id), star.id);

  /* Search keystrokes in #libSearch and Escape to clear: only the filtered list updates, never a full redraw. */
  await (await p.$('#libSecs .sx-sec[data-lm="data"]')).click();
  await sleep(200);
  await p.focus("#libSearch");
  const keyRows = [];
  for (const k of ["o", "r", "d", "e", "r", "z", "Backspace", "Escape"]) {
    await mark();
    await p.evaluate(() => { window.__ev = []; });
    await p.keyboard.press(k);
    await sleep(200);
    const drawn = await count();
    await mark();
    const d = await p.evaluate(() => window.__ev.filter(e => /key|input/.test(e.n)).reduce((m, e) => Math.max(m, e.d), 0));
    keyRows.push({ drawn, paint: d });
  }
  const keySay = keyRows.map(r => r.drawn + "/" + r.paint).join(" ");
  check(most(keyRows) <= KEY_BUDGET, "ls6 search keystrokes and Escape in #libSearch: most drawn " + most(keyRows)
    + ", median " + median(keyRows.map(r => r.paint)) + " ms to paint (" + keySay + "); at most " + KEY_BUDGET + " drawn");

  await p.focus("#libSearch");
  for (const k of ["o", "r", "d", "e", "r"]) { await p.keyboard.press(k); await sleep(80); }
  const midSearch = await p.evaluate(() => ({
    focused: document.activeElement && document.activeElement.id === "libSearch",
    title: (document.getElementById("libTitle") || {}).textContent || "",
    shownIntents: [...document.querySelectorAll(".mg-intents .manage-row[data-introw]")].filter(r => !r.hasAttribute("hidden")).length,
    totalIntents: document.querySelectorAll(".mg-intents .manage-row[data-introw]").length,
    isFind: document.querySelector(".lib-list") && document.querySelector(".lib-list").classList.contains("is-find"),
  }));
  await p.keyboard.press("Escape");
  await sleep(200);
  const afterEsc = await p.evaluate(() => ({
    focused: document.activeElement && document.activeElement.id === "libSearch",
    val: (document.getElementById("libSearch") || {}).value,
    isFind: document.querySelector(".lib-list") && document.querySelector(".lib-list").classList.contains("is-find"),
    dataHidden: document.querySelector('details.manage-sec[data-mg="data"]').hasAttribute("hidden"),
  }));
  check(midSearch.focused && midSearch.title === "order" && midSearch.isFind
    && midSearch.shownIntents > 0 && midSearch.shownIntents < midSearch.totalIntents
    && afterEsc.focused && afterEsc.val === "" && !afterEsc.isFind && !afterEsc.dataHidden,
    "ls7 search filters to matching rows with focus held on #libSearch, and Escape clears back to the section");
  done = true;
} catch (e) {
  console.log("  FAIL the run stopped: " + String(e && e.message || e));
  fails++;
} finally {
  if (browser) await browser.close();
  E.removeLab(lab);
}
if (done && checks !== EXPECTED) { console.log("  FAIL ran " + checks + " checks, expected " + EXPECTED); fails++; }
console.log((fails ? "FAIL " : "PASS ") + "library-switch: " + (checks - (fails > checks ? checks : fails)) + "/" + checks + " checks" + (done ? "" : " - SUITE DID NOT COMPLETE"));
process.exit(done ? E.exitOf(fails) : 78);
