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
 *   tf1  every category in turn, pressed by a real click, then the theme button by a real click:
 *        the page lives and lands on the theme asked for, and the choice is stored
 *   tf2  the fades ran as fades: one view transition per press, so a run that never fades (reduced
 *        motion, a browser without the API) cannot pass tf1 by never reaching the case
 *   tf3  the hold is let go: after two presses inside one fade, every card is content-visibility
 *        auto again and the class is off the root, or every card would be laid out for ever
 *   tf4  the record Maintenance shows, read after tf1: every press it still holds wrote its start,
 *        its ready and its finish in that order, the newest press among them, within its cap
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
const EXPECTED = 4;
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
  const q = await browser.newPage();
  await q.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  let crashed = false;
  const errs = [];
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
  await q.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await q.$("#ecYes")) await q.click("#ecYes");
  await q.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes"), { timeout: 30000 });
  await q.keyboard.press("Escape");
  await sleep(1500);

  const centre = sel => q.$eval(sel, b => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  // Every category pill; "All" and the add button carry no category.
  const nPills = await q.$$eval("#pills .pill[data-k]", ps => ps.filter(p => p.dataset.k).length);
  const FADE_WAIT = 1600;     // past the fade's longest tier
  let pressed = 0, landed = 0, stored = 0, firstDeath = "";
  for (let k = 0; k < nPills && !crashed; k++) {
    const at = await q.$$eval("#pills .pill[data-k]", (ps, k) => {
      const p = ps.filter(x => x.dataset.k)[k]; const r = p.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }, k);
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
  if (crashed) throw new Error("the page died, so tf2 to tf4 have nothing to read");

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

  // Per press: start <theme> #n, then ready #n, then finish #n; the cap may have dropped the oldest.
  const fadeRows = Array.isArray(rec) ? rec.filter(r => Array.isArray(r) && r[1] === "fade") : [];
  const kept = [...new Set(fadeRows.filter(r => r[3] === "start").map(r => r[2]))];
  const whole = kept.filter(n => {
    const mine = fadeRows.filter(r => r[2] === n).map(r => r[3] + (r[4] ? " " + r[4] : ""));
    return mine.length === 3 && /^start (light|dark)$/.test(mine[0]) && mine[1] === "ready" && mine[2] === "finish";
  });
  check(Array.isArray(rec) && rec.length <= 30 && kept.length >= 8 && whole.length === kept.length && kept.indexOf(pressed) > -1,
    "tf4 the record holds each press's start, ready and finish in order (" + whole.length + " whole of " + kept.length
    + " presses kept, " + (Array.isArray(rec) ? rec.length : rec) + " rows, the newest press " + (kept.indexOf(pressed) > -1 ? "among them" : "MISSING") + ")");
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
