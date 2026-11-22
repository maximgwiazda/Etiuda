/* CHOOSING A CHAT TAB FROM A SCREEN MARKS THAT TAB AT ONCE. Chrome, headless, no fixtures, no window.
 *
 *   node tests/tab-flicker.mjs [--engine <file>]
 *
 * The case is Max's (board 1019, his list of 2026-11-21): "from Chat tab 1 to Library or Settings and then to Chat tab 2,
 * tab 1 shows as selected for a fraction of a second first, and the mirror case", and "going from Library or Settings to a
 * Chat tab is slightly laggier than the other way".
 *
 * THE CAUSE. Leaving a screen cleared it before the chosen tab was named: clearScreenOn redraws the strip, and the strip
 * draws the selected mark from activeTabId, which still held the tab used before the screen. That redraw put the mark on
 * the old chat tab and, because it forced a style pass, the page then moved the mark to the chosen tab in place, which
 * started the tab's background transition from the old state: the old tab faded out and the chosen one faded in, so the
 * first painted frames showed the wrong tab. The redraw was also a second full rebuild of the strip inside the press.
 *
 * WHAT IS MEASURED, as the eye sees it. Each press is a real click on a tab. In the first animation frame after it, the
 * chosen chat tab is marked selected (class on, aria-selected true) and painted with the selected tab's background, and
 * the other chat tab is neither marked nor painted with that background (its computed background is transparent).
 *   tfl1  chat tab 1, the Library, chat tab 2
 *   tfl2  chat tab 2, the Library, chat tab 1
 *   tfl3  chat tab 1, Settings, chat tab 2
 *   tfl4  chat tab 2, Settings, chat tab 1
 *   tfl5  chat tab 1 to chat tab 2, the switch that never flickered: the mark moves to the chosen tab (this switch crossfades by
 *         design, so only the mark is read, not the paint)
 *   tfl6  THE PLANT: the line that names the chosen tab before the screen clears, lifted, turns tfl1 to tfl4 red
 *   tfl7  the planted copy still ran all four presses
 * The timings (the press to the frame after it, the median of nine presses, four directions and the chat switch) are
 * printed beside the verdicts and are not part of them: a loaded machine moves them (the chain-split rule).
 * Exit code is the number of failed checks; 78 when the run could not complete.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const { seatPage } = require("./seat-page.js");
const puppeteer = require("puppeteer-core");

let fails = 0, checks = 0;
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EXPECTED = 7, REPS = 9;
const argv = process.argv.slice(2);
const at = argv.indexOf("--engine");
const ENGINE = at >= 0 ? path.resolve(argv[at + 1]) : E.ENGINE_PATH;
const rawHtml = fs.readFileSync(ENGINE, "utf8");

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-tab-flicker-"));
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");

const T = n => "#tabsBar .tab:not(.screen):nth-of-type(" + n + ") .tab-label";
const L = '#tabsBar .tab.screen[data-sid="library"] .tab-label';
const S = '#tabsBar .tab.screen[data-sid="settings"] .tab-label';

let browser = null, done = false;
/* One boot of a copy of the page, with two conversations, Settings, Maintenance and the Library open. */
const boot = async (html, name) => {
  fs.writeFileSync(path.join(lab, name + ".html"), html);
  const p = await browser.newPage();
  await p.setViewport({ width: 1500, height: 950 });
  await p.evaluateOnNewDocument(() => {
    try { for (const k of ["eTourDone_v3", "eTourInvite_v3", "eFirstSigninSeen", "eNameAsked"]) localStorage.setItem(k, "1"); } catch (e) {}
  });
  await seatPage(p);
  await p.goto("file:///" + path.join(lab, name + ".html").replace(/\\/g, "/"), { waitUntil: "load", timeout: 60000 });
  await p.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await p.$("#ecYes")) await p.click("#ecYes");
  await p.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await sleep(1200);
  await p.click(".tab-add"); await sleep(600);
  await p.click(T(1)); await sleep(400);
  await p.evaluate(() => { window.openScreenTab("settings"); window.openScreenTab("maintenance"); window.openManage(); });
  await sleep(800);
  return p;
};
const click = async (p, sel) => { await p.click(sel); await sleep(600); };
/* The strip as the first frame after a press shows it. */
const frameAfterPress = (p, sel) => p.evaluate(sel => new Promise(res => {
  const read = () => Array.from(document.querySelectorAll("#tabsBar .tab:not(.screen)")).map(e => ({
    on: e.classList.contains("on"), aria: e.querySelector(".tab-label").getAttribute("aria-selected"),
    bg: getComputedStyle(e).backgroundColor }));
  document.querySelector(sel).click();
  requestAnimationFrame(() => res(read()));
}), sel);
const clear = bg => /^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)$/.test(bg) || bg === "transparent";
const presses = async (p) => {
  const cases = [["tfl1", [T(1), L], 2, 1], ["tfl2", [T(2), L], 1, 2], ["tfl3", [T(1), S], 2, 1], ["tfl4", [T(2), S], 1, 2]];
  const out = {};
  for (const [id, prep, to, from] of cases) {
    for (const q of prep) await click(p, q);
    const f = await frameAfterPress(p, T(to));
    const a = f[to - 1], b = f[from - 1];
    out[id] = { ok: a.on && a.aria === "true" && !clear(a.bg) && !b.on && b.aria === "false" && clear(b.bg),
      text: "first frame: chosen on=" + a.on + " aria=" + a.aria + " bg=" + a.bg + "; other on=" + b.on + " bg=" + b.bg };
    await sleep(500);
  }
  return out;
};
const time = async (p, prep, act) => {
  const rows = [];
  for (let r = 0; r < REPS; r++) {
    await click(p, prep);
    rows.push(await p.evaluate(sel => new Promise(res => {
      const t0 = performance.now();
      document.querySelector(sel).click();
      const sync = performance.now() - t0;
      requestAnimationFrame(() => { const mc = new MessageChannel(); mc.port1.onmessage = () => res({ sync, paint: performance.now() - t0 }); mc.port2.postMessage(0); });
    }), act));
  }
  const med = a => a.slice().sort((x, y) => x - y)[(a.length - 1) >> 1];
  return med(rows.map(r => r.sync)).toFixed(1) + " ms in the handler, " + med(rows.map(r => r.paint)).toFixed(1) + " ms to the frame";
};

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true,
    args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  const real = await boot(rawHtml, "real");
  const r = await presses(real);
  for (const id of ["tfl1", "tfl2", "tfl3", "tfl4"]) {
    const what = { tfl1: "chat tab 1, the Library, chat tab 2", tfl2: "chat tab 2, the Library, chat tab 1",
      tfl3: "chat tab 1, Settings, chat tab 2", tfl4: "chat tab 2, Settings, chat tab 1" }[id];
    check(r[id].ok, id + " " + what + ": the chosen tab is the selected one in the first frame, the other is not (" + r[id].text + ")");
  }
  await click(real, T(1));
  const f = await frameAfterPress(real, T(2));
  check(f[1].on && f[1].aria === "true" && !f[0].on && f[0].aria === "false",
    "tfl5 chat tab 1 to chat tab 2 moves the mark to the chosen tab (on=" + f[1].on + "; other on=" + f[0].on + "; a crossfade by design, paint not read)");
  console.log("       timings, median of " + REPS + " presses, from the press:");
  console.log("       Chat to Library:   " + await time(real, T(1), L));
  console.log("       Library to Chat:   " + await time(real, L, T(1)));
  console.log("       Chat to Settings:  " + await time(real, T(1), S));
  console.log("       Settings to Chat:  " + await time(real, S, T(1)));
  console.log("       Chat to Chat:      " + await time(real, T(2), T(1)));
  await real.close();

  /* tfl6, tfl7 the plant: the line that names the chosen tab before the screen clears, lifted. */
  const lines = rawHtml.split("\n");
  const mark = lines.findIndex(l => /if \(screenOn && id && tabs\.some\(\(x\) => x\.id === id\)\) activeTabId = id;/.test(l));
  if (process.env.ETIUDA_PLANTS === "off") {
    check(true, "tfl6 NOT RUN (ETIUDA_PLANTS=off)"); check(true, "tfl7 NOT RUN (ETIUDA_PLANTS=off)");
  } else {
    let planted = null, why = "";
    if (mark < 0) why = " (the line was not found in the built page)";
    else {
      const ls = lines.slice(); ls[mark] = ls[mark].replace(/ activeTabId = id;/, " void 0;");
      if (ls[mark] === lines[mark]) why = " (the plant line did not change)";
      else planted = ls.join("\n");
    }
    let pr = null;
    if (planted) { const pp = await boot(planted, "planted"); pr = await presses(pp); await pp.close(); }
    check(!!pr && ["tfl1", "tfl2", "tfl3", "tfl4"].every(k => !pr[k].ok), "tfl6 PLANT lifting the line that names the chosen tab before the screen clears turns tfl1 to tfl4 red" + why
      + (pr ? " (" + ["tfl1", "tfl2", "tfl3", "tfl4"].map(k => k + " " + (pr[k].ok ? "green" : "red")).join(", ") + ")" : ""));
    check(!!pr && Object.keys(pr).length === 4, "tfl7 the planted copy still ran all four presses");
  }
  done = true;
} catch (e) {
  console.log("  FAIL the run stopped: " + String(e && e.message || e));
  fails++;
} finally {
  if (browser) await browser.close();
  E.removeLab(lab);
}
if (done && checks !== EXPECTED) { console.log("  FAIL ran " + checks + " checks, expected " + EXPECTED); fails++; }
console.log((fails ? "FAIL " : "PASS ") + "tab-flicker: " + (checks - (fails > checks ? checks : fails)) + "/" + checks + " checks" + (done ? "" : " - SUITE DID NOT COMPLETE"));
process.exit(done ? E.exitOf(fails) : 78);
