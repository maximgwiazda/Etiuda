/* THE THEME AFTER THE CATEGORIES HAVE MOVED THE CARDS. Chrome, no fixtures.
 *
 *   node tests/theme-fade.mjs
 *
 * The case is the one Maxim met on the desk: switch categories, then press the theme button, and
 * the window went grey, came back on the old theme, and the second time asked to Restart or Close.
 * That was the page's renderer dying inside the theme's whole-window fade: a category's glide left
 * its cards in a state in which a view transition killed the renderer. The theme now lands as
 * Studio's does (Max, 2026-11-01 17:50: "Yes, lets bring desk to studio method"): the attribute at
 * once, each control easing its own colours, no view transition. The file keeps its name, which the
 * release's acceptance run calls.
 *
 * LEGS
 *   tf1  every category in turn, pressed by a real click, then the theme button by a real click:
 *        the page lives and lands on the theme asked for, and the choice is stored
 *   tf2  no press opened a view transition, and nothing on the root cuts the controls' transitions
 *   tf3  two presses 60 ms apart, the second while the first's colours still ease: the second is
 *        taken, the page is back on the theme it started from, and that is what is stored
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
const EXPECTED = 3;
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
  const FADE_WAIT = 600;      // past the colours' longest tier
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
    window.__fades = 0; window.__cut = 0;
    const vt = document.startViewTransition;
    if (typeof vt === "function") document.startViewTransition = function () { window.__fades++; return vt.apply(this, arguments); };
    document.addEventListener("DOMContentLoaded", () => new MutationObserver(() => {
      const c = document.documentElement.classList; if (c.contains("theme-swap") || c.contains("theme-fade")) window.__cut++;
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] }));
  });
  await q.goto(url, { waitUntil: "load", timeout: 60000 });
  await require("./launch-wait.js").waitLaunchGone(q, { who: "tests/theme-fade.mjs tf1" });
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
    "tf1 a category pressed, then the theme: the page lives through every press and lands on the theme asked for, stored ("
    + JSON.stringify({ categories: nPills, pressed, landed, stored, died: firstDeath || "no" }) + ")");
  if (crashed) throw new Error("the page died, so tf2 and tf3 have nothing to read");

  const seen = await q.evaluate(() => [window.__fades, window.__cut]);
  check(seen[0] === 0 && seen[1] === 0, "tf2 no press opened a view transition and nothing on the root cut the controls' transitions ("
    + seen[0] + " transition(s) over " + pressed + " presses, " + seen[1] + " cut(s))");

  const from = await q.evaluate(() => document.documentElement.dataset.theme);
  const tb = await centre("#theme");
  await q.mouse.click(tb[0], tb[1]);
  await sleep(60);
  await q.mouse.click(tb[0], tb[1]);
  await sleep(FADE_WAIT);
  const back = await q.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem("eTheme")]);
  check(!crashed && back[0] === from && back[1] === from,
    "tf3 two presses 60 ms apart: the second is taken, the page is back on " + from + " and that is stored (" + JSON.stringify(back) + ")");
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
