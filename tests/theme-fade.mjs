/* THE THEME'S FADE AFTER THE CATEGORIES HAVE MOVED THE CARDS. Chrome, no fixtures.
 *
 *   node tests/theme-fade.mjs
 *
 * The case is the one Maxim met on the desk: switch categories, then press the theme button, and
 * the window went grey, came back on the old theme, and the second time asked to Restart or Close.
 * That is the page's renderer dying. Measured in headless Chrome against the build of engine
 * dab2272 and against ec8228e: a category's glide leaves its cards in a state in which the fade's
 * view transition kills the renderer, on the first press, for 15 of the sample's 17 categories.
 * A bare document.startViewTransition() does the same and a theme landed without a fade does not.
 *
 * LEGS
 *   tf0  THE CONTROL, in a page of its own: with the hold switched off by a stylesheet, categories then
 *        the theme must still kill the page. tf1's red rests on this Chrome still carrying the fault;
 *        where it no longer does, tf0 fails and says so, rather than tf1 passing on unfixed code
 *   tf1  every category in turn, pressed by a real click, then the theme button by a real click:
 *        the page lives and lands on the theme asked for, and the choice is stored
 *   tf2  the fades ran as fades: one view transition per press, so a run that never fades (reduced
 *        motion, a browser without the API) cannot pass tf1 by never reaching the case
 *   tf3  the hold is let go: after two presses inside one fade, every card is content-visibility
 *        auto again and the class is off the root, or every card would be laid out for ever
 *   tf4  the record Maintenance shows, read after tf1: every press it still holds wrote its start,
 *        its ready and its finish in that order, the newest press among them, within its cap
 *   tf5  across reloads: on a fresh load one fade, then a second the page leaves at its start
 *        (reloaded inside it), then two fades on the next load, so the second load's fades fall in
 *        the same places as the first's; Maintenance's "theme fades" row shows the newest two whole
 *        and the lost one as a start alone, which is the sign of a page lost inside a fade
 *   tf6  a press, then the page hidden and returned within 90 ms, 40 times: the hiding skips the fade
 *        and its update callback still runs, so nothing may be left on the root that turns every
 *        transition off, and the theme asked for must be landed and stored
 *   tf7  the control of tf6: the hiding rejected the fade in at least 10 of the 40, so a Chrome that
 *        no longer skips a hidden fade cannot pass tf6 by never reaching the case
 *
 * The catalog is the shipped sample beside the page, so nothing here is content. Exit code is the
 * number of failed checks; 78 when the run could not complete.
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
const EXPECTED = 8;
const t0 = Date.now();

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-theme-fade-"));
fs.copyFileSync(E.ENGINE_PATH, path.join(lab, "etiuda.html"));
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
const url = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");

let browser = null;
try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true,
    args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  const FADE_WAIT = 1600;     // past the fade's longest tier
  const errs = [];
  const centreOf = (p, sel) => p.$eval(sel, b => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const pillAt = (p, k) => p.$$eval("#pills .pill[data-k]", (ps, k) => {
    const x = ps.filter(y => y.dataset.k)[k]; const r = x.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }, k);
  const settled = async p => {
    await p.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
    if (await p.$("#ecYes")) await p.click("#ecYes");
    await p.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes"), { timeout: 30000 });
    await p.keyboard.press("Escape");
    await sleep(1500);
  };

  /* tf0, THE CONTROL. Its own context, so its death touches nothing tf1 reads. The stylesheet is the
     sheet's hold undone: unlayered, so it outranks the layered rule, and not important, so the glides'
     own inline holds still act as they do without the fix. That it took is read before a press. */
  {
    const ctx = await browser.createBrowserContext();
    const c = await ctx.newPage();
    await c.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
    let died = false;
    c.on("error", () => { died = true; });
    await c.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("eTourDone_v3", "1"); localStorage.setItem("eTourInvite_v3", "1");
        localStorage.setItem("eAgent", "Invented Agent"); localStorage.setItem("eNameAsked", "1");
      } catch (x) {}
      document.addEventListener("DOMContentLoaded", () => {
        const st = document.createElement("style");
        st.textContent = ":root.theme-fade #list .card{content-visibility:auto}";
        document.head.appendChild(st);
      });
    });
    await c.goto(url, { waitUntil: "load", timeout: 60000 });
    await settled(c);
    const off = await c.evaluate(() => {
      const r = document.documentElement; r.classList.add("theme-fade");
      const v = getComputedStyle(document.querySelector("#list .card")).contentVisibility;
      r.classList.remove("theme-fade"); return v === "auto";
    });
    let tries = 0;
    for (let k = 0; off && k < 6 && !died; k++) {
      const at = await pillAt(c, k);
      await c.mouse.click(at[0], at[1]);
      await sleep(1200);
      const tb = await centreOf(c, "#theme");
      await c.mouse.click(tb[0], tb[1]).catch(() => {});
      tries++;
      await sleep(FADE_WAIT);
    }
    const ver = await browser.version();
    check(off && died,
      "tf0 THE CONTROL: with the hold switched off the page dies, so tf1 can go red in this Chrome ("
      + (!off ? "the switch did not take: the hold still reads visible, so this control proved nothing"
        : died ? "died at press " + tries + ", " + ver
        : "THE FAULT NO LONGER REPRODUCES IN THIS CHROME, " + ver + ": the page lived through " + tries
          + " presses with the hold off, so tf1 passing says nothing about the fix; the gate wants a new control or retiring")
      + ")");
    await ctx.close().catch(() => {});
  }

  const q = await browser.newPage();
  await q.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  let crashed = false;
  q.on("error", () => { crashed = true; });
  q.on("pageerror", x => errs.push(String(x.message || x)));
  await q.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("eTourDone_v3", "1"); localStorage.setItem("eTourInvite_v3", "1");
      localStorage.setItem("eAgent", "Invented Agent"); localStorage.setItem("eNameAsked", "1");
    } catch (x) {}
    window.__fades = 0;
    const vt = document.startViewTransition;
    if (typeof vt === "function") document.startViewTransition = function () { window.__fades++; return vt.apply(this, arguments); };
  });
  await q.goto(url, { waitUntil: "load", timeout: 60000 });
  await settled(q);

  const centre = sel => centreOf(q, sel);
  // Every category pill; "All" and the add button carry no category.
  const nPills = await q.$$eval("#pills .pill[data-k]", ps => ps.filter(p => p.dataset.k).length);
  let pressed = 0, landed = 0, stored = 0, firstDeath = "";
  for (let k = 0; k < nPills && !crashed; k++) {
    const at = await pillAt(q, k);
    await q.mouse.click(at[0], at[1]);
    await sleep(1200);
    const want = await q.evaluate(() => document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    const tb = await centre("#theme");
    await q.mouse.click(tb[0], tb[1]).catch(() => {});
    pressed++;
    await sleep(FADE_WAIT);
    if (crashed) { firstDeath = "category " + (k + 1) + " of " + nPills; break; }
    const got = await Promise.race([q.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem("eTheme")]),
      sleep(8000).then(() => null)]);
    if (!got) { firstDeath = "category " + (k + 1) + " of " + nPills + " (no answer in 8 s)"; crashed = true; break; }
    if (got[0] === want) landed++;
    if (got[1] === want) stored++;
  }
  check(!crashed && nPills >= 10 && landed === nPills && stored === nPills,
    "tf1 a category pressed, then the theme: the page lives through every fade and lands on the theme asked for, stored ("
    + JSON.stringify({ categories: nPills, pressed, landed, stored, died: firstDeath || "no" }) + ")");
  if (crashed) throw new Error("the page died, so tf2 to tf5 have nothing to read");

  const rec = await q.evaluate(() => { try { return JSON.parse(localStorage.getItem("eTrace") || "null"); } catch (x) { return "unreadable"; } });
  const fades = await q.evaluate(() => window.__fades);
  check(fades === pressed, "tf2 every press faded through a view transition (" + fades + " of " + pressed + ")");

  // Two presses inside one fade, then the hold must be gone.
  const tb = await centre("#theme");
  await q.mouse.click(tb[0], tb[1]);
  await sleep(60);
  await q.mouse.click(tb[0], tb[1]);
  await sleep(FADE_WAIT);
  const held = await q.evaluate(() => ({
    cls: document.documentElement.classList.contains("theme-fade"),
    real: [...document.querySelectorAll("#list .card")].filter(c => getComputedStyle(c).contentVisibility !== "auto").length,
    cards: document.querySelectorAll("#list .card").length }));
  check(!crashed && !held.cls && held.real === 0 && held.cards > 0,
    "tf3 after two presses inside one fade the hold is let go: no class on the root, no card held real (" + JSON.stringify(held) + ")");

  // Per press: start <theme>, then ready, then finish, under one key; the cap may have dropped the oldest.
  const fadeRows = Array.isArray(rec) ? rec.filter(r => Array.isArray(r) && r[1] === "fade") : [];
  const starts = fadeRows.filter(r => r[3] === "start").map(r => r[2]);
  const kept = [...new Set(starts)];
  const newest = kept[kept.length - 1];
  const whole = kept.filter(n => {
    const mine = fadeRows.filter(r => r[2] === n).map(r => r[3] + (r[4] ? " " + r[4] : ""));
    return mine.length === 3 && /^start (light|dark)$/.test(mine[0]) && mine[1] === "ready" && mine[2] === "finish";
  });
  check(Array.isArray(rec) && rec.length <= 30 && kept.length >= 8 && kept.length === starts.length
      && whole.length === kept.length && whole.indexOf(newest) > -1,
    "tf4 the record holds each press's start, ready and finish in order, one key per press (" + whole.length + " whole of "
    + kept.length + " presses kept, " + starts.length + " starts, " + (Array.isArray(rec) ? rec.length : rec) + " rows)");

  /* tf5. A fresh load, one fade; then a press and a reload in one task, so the start is written in
     the click and the page goes before the fade's ready can, as a lost page does; then two fades on
     the next load. */
  const press = async () => { const t = await centre("#theme"); await q.mouse.click(t[0], t[1]); await sleep(FADE_WAIT); };
  await q.reload({ waitUntil: "load", timeout: 60000 });
  await settled(q);
  await press();
  const asked = await q.evaluate(() => {
    const was = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.querySelector("#theme").click(); location.reload(); return was;
  });
  await q.waitForNavigation({ waitUntil: "load", timeout: 60000 }).catch(() => {});
  await settled(q);
  await press();
  await press();
  await q.evaluate(() => openMaintenance(() => {}));
  await sleep(600);
  const row = await q.evaluate(() => {
    const r = [...document.querySelectorAll(".mt-grid .mt-row")].find(x => /^(theme fades|przej)/.test((x.querySelector(".k") || {}).textContent || ""));
    return r ? r.querySelector(".v").textContent : null;
  });
  // Each fade on the row is "HH:MM:SS <theme>: <stages>", newest first, whatever joins them.
  const fadesShown = [];
  const re = /([0-9]{2}:[0-9]{2}:[0-9]{2}) (light|dark): ([a-z, ]+?)(?=[,;] [0-9]{2}:[0-9]{2}:[0-9]{2} |$)/g;
  for (let m; row && (m = re.exec(row));) fadesShown.push({ theme: m[2], stages: m[3] });
  const WHOLE = "start, ready, finish";
  check(!crashed && fadesShown.length === 3 && fadesShown[0].stages === WHOLE && fadesShown[1].stages === WHOLE
      && fadesShown[2].stages === "start" && fadesShown[2].theme === asked,
    "tf5 a fade lost to a reload, then two fades on the next load: Maintenance shows the two whole and the lost one a start alone ("
    + JSON.stringify(row) + ")");
  /* tf6 and tf7. A press, then the page hidden within 90 ms and brought back, 40 times, hide and
     return times drawn from a seeded sequence. A page hidden before the fade's ready rejects it, and
     the update callback still runs after: what that run leaves on the root is read once it settles.
     Its own context and its own pair of pages, so hiding one is the other coming to the front. */
  {
    const ctx = await browser.createBrowserContext();
    const h = await ctx.newPage(), other = await ctx.newPage();
    h.on("pageerror", x => errs.push(String(x.message || x)));
    await h.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
    await h.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("eTourDone_v3", "1"); localStorage.setItem("eTourInvite_v3", "1");
        localStorage.setItem("eAgent", "Invented Agent"); localStorage.setItem("eNameAsked", "1");
      } catch (x) {}
      window.__rejected = 0;
      const vt = document.startViewTransition;
      if (typeof vt === "function") document.startViewTransition = function () {
        const t = vt.apply(this, arguments); t.ready.catch(() => { window.__rejected++; }); return t;
      };
    });
    await h.bringToFront();
    await h.goto(url, { waitUntil: "load", timeout: 60000 });
    await settled(h);
    const TRIALS = 40;
    let seed = 20261006;
    const draw = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return Math.floor(seed / 0x7fffffff * n); };
    let stuck = 0, reached = 0, wrong = 0;
    for (let t = 0; t < TRIALS; t++) {
      const hideAfter = draw(90), backAfter = draw(120);
      const before = await h.evaluate(() => [window.__rejected, document.documentElement.dataset.theme]);
      await h.evaluate(() => document.querySelector("#theme").click());
      await sleep(hideAfter); await other.bringToFront(); await sleep(backAfter); await h.bringToFront();
      await sleep(900);
      const after = await h.evaluate(() => [window.__rejected, document.documentElement.dataset.theme,
        localStorage.getItem("eTheme"), document.documentElement.classList.contains("theme-swap")]);
      if (after[3]) stuck++;
      if (after[0] > before[0]) reached++;
      if (after[1] === before[1] || after[2] !== after[1]) wrong++;
    }
    check(stuck === 0 && wrong === 0,
      "tf6 a fade the page's hiding skipped leaves no animation-off setting on the root, and the theme asked for is landed and stored ("
      + JSON.stringify({ trials: TRIALS, themeSwapLeft: stuck, notAsked: wrong }) + ")");
    check(reached >= 10,
      "tf7 tf6 reached its case: the hiding rejected the fade's ready in " + reached + " of " + TRIALS
      + " trials, so a run in which hiding skips nothing cannot pass tf6");
    await ctx.close().catch(() => {});
  }
  check(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
} catch (e) {
  console.log("  FAIL the run stopped: " + String(e && e.message || e).split("\n")[0]);
  fails = Math.max(fails, 1);
} finally {
  if (browser) { try { await browser.close(); } catch (e) {} }
  E.removeLab(lab);
}
const ran = checks - 1;     // the page-errors line is not a leg
const complete = ran >= EXPECTED;
console.log("\n" + (checks - fails) + "/" + checks + " checks passed in " + Math.round((Date.now() - t0) / 1000) + " s");
console.log(!complete && !fails ? "SUITE DID NOT COMPLETE" : fails ? "THEME-FADE: " + fails + " FAILED" : "THEME-FADE: ALL PASSED");
process.exit(!complete && !fails ? 78 : E.exitOf(fails));
