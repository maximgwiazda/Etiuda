/* A CONVERSATION SWITCH MOVES THE MARK, IT DOES NOT REBUILD THE STRIP. Chrome, headless, no fixtures, no window.
 *
 *   node tests/strip-redraw.mjs [--engine <file>]
 *
 * syncTabActive (src/modules/tabs.js) moves the active mark in place, and drawTabs rebuilds the strip only when the
 * strip as drawn is not the one it would draw. Screen tabs (Settings, Library, Maintenance) share the strip with the
 * conversations, so a count of every tab against the conversations alone never matched while one was open, and every
 * switch rebuilt the strip.
 *
 * WHAT IS COUNTED. A rebuild is drawTabs emptying #tabsBar: a MutationObserver on the bar counts the records that take
 * a tab element out. Each switch is a real click on a conversation tab's label.
 *   sr1  with Settings and the Library in the strip, five switches between two conversations rebuild it 0 times, and
 *        after each the clicked conversation alone carries .on and aria-selected, the screens neither
 *   sr2  with no screen tab, the same five switches rebuild it 0 times (the path that always held)
 *   sr3  THE CONTROL, in the same page: a new conversation from the strip's + rebuilds it at least once, so the count
 *        sees a rebuild
 * Exit code is the number of failed checks; 78 when the run could not complete.
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
const EXPECTED = 3, REPS = 5;
const argv = process.argv.slice(2);
const at = argv.indexOf("--engine");
const ENGINE = at >= 0 ? path.resolve(argv[at + 1]) : E.ENGINE_PATH;

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-strip-redraw-"));
fs.copyFileSync(ENGINE, path.join(lab, "etiuda.html"));
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
const url = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");

let browser = null, done = false;
try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true,
    args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  const p = await browser.newPage();
  await p.setViewport({ width: 1500, height: 950 });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.evaluateOnNewDocument(() => {
    try { for (const k of ["eTourDone_v3", "eTourInvite_v3", "eNameAsked"]) localStorage.setItem(k, "1"); } catch (e) {}
  });
  await p.goto(url, { waitUntil: "load", timeout: 60000 });
  await p.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await p.$("#ecYes")) await p.click("#ecYes");
  await p.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await sleep(1200);
  await p.click(".tab-add"); await sleep(400);
  const convs = () => p.$$("#tabsBar .tab:not(.screen) .tab-label");
  if ((await convs()).length < 2) throw new Error("the strip's + made no second conversation");
  await p.evaluate(() => {
    window.__rebuilds = 0;
    const bar = document.getElementById("tabsBar");
    new MutationObserver(recs => {
      for (const r of recs) for (const n of r.removedNodes) if (n.nodeType === 1 && n.classList.contains("tab")) { window.__rebuilds++; return; }
    }).observe(bar, { childList: true });
  });
  /* The strip as the reader sees it: which tabs carry the mark, conversations and screens apart. */
  const marks = () => p.evaluate(() => Array.from(document.querySelectorAll("#tabsBar .tab")).map(el =>
    (el.classList.contains("screen") ? "s:" + el.dataset.sid : "c") + (el.classList.contains("on") ? "+on" : "")
    + (el.querySelector(".tab-label").getAttribute("aria-selected") === "true" ? "+sel" : "")).join(" "));
  const switches = async () => {
    await (await convs())[0].click(); await sleep(300);
    const before = await p.evaluate(() => window.__rebuilds);
    const seen = [];
    let right = true;
    for (let r = 0; r < REPS; r++) {
      const i = r % 2 ? 0 : 1;
      await (await convs())[i].click(); await sleep(300);
      const m = await marks();
      seen.push(m);
      const conv = m.split(" ").filter(x => x[0] === "c"), scr = m.split(" ").filter(x => x[0] === "s");
      right = right && conv.length === 2 && conv[i] === "c+on+sel" && conv[1 - i] === "c" && scr.every(x => !/\+on|\+sel/.test(x));
    }
    return { rebuilt: (await p.evaluate(() => window.__rebuilds)) - before, right, last: seen[seen.length - 1] };
  };
  await p.evaluate(() => { window.openScreenTab("settings"); window.openManage(); });
  await sleep(800);
  const withScreens = await switches();
  check(withScreens.rebuilt === 0 && withScreens.right,
    "sr1 with Settings and the Library in the strip, " + REPS + " conversation switches rebuild it " + withScreens.rebuilt
    + " times and the mark follows the click alone: " + withScreens.last);
  await p.evaluate(() => { window.closeScreenTab("settings"); window.closeScreenTab("library"); });
  await sleep(600);
  if (await p.evaluate(() => document.querySelectorAll("#tabsBar .tab.screen").length)) throw new Error("the screen tabs did not close");
  const without = await switches();
  check(without.rebuilt === 0 && without.right,
    "sr2 with no screen tab, " + REPS + " conversation switches rebuild the strip " + without.rebuilt + " times: " + without.last);
  const was = await p.evaluate(() => window.__rebuilds);
  await p.click(".tab-add"); await sleep(400);
  const added = (await p.evaluate(() => window.__rebuilds)) - was;
  check(added >= 1, "sr3 THE CONTROL: a new conversation from the strip's + rebuilds it " + added + " time(s), so the count sees a rebuild");
  done = true;
} catch (e) {
  console.log("  FAIL the run stopped: " + String(e && e.message || e));
  fails++;
} finally {
  if (browser) await browser.close();
  E.removeLab(lab);
}
if (done && checks !== EXPECTED) { console.log("  FAIL ran " + checks + " checks, expected " + EXPECTED); fails++; }
console.log((fails ? "FAIL " : "PASS ") + "strip-redraw: " + (checks - (fails > checks ? checks : fails)) + "/" + checks + " checks" + (done ? "" : " - SUITE DID NOT COMPLETE"));
process.exit(done ? E.exitOf(fails) : 78);
