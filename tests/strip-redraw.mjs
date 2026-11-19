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
const EXPECTED = 10, REPS = 5;
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
    try { for (const k of ["eTourDone_v3", "eTourInvite_v3", "eFirstSigninSeen", "eNameAsked"]) localStorage.setItem(k, "1"); } catch (e) {}
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

  /* ---- tl1 to tl5: each conversation tab says its language ---- */
  const CODES = ["en", "pl", "de", "cs", "es-mx", "pl", "en", "de", "pl", "en"];
  const rawHtml = fs.readFileSync(ENGINE, "utf8");
  const langRun = async (html, tag, codes = CODES) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-tab-lang-" + tag + "-"));
    fs.writeFileSync(path.join(dir, "etiuda.html"), html);
    fs.copyFileSync(path.join(lab, "etiuda-catalog.js"), path.join(dir, "etiuda-catalog.js"));
    const q = await browser.newPage();
    try {
      await q.setViewport({ width: 1280, height: 800 });
      await q.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await q.evaluateOnNewDocument((codes) => {
        try {
          for (const k of ["eTourDone_v3", "eTourInvite_v3", "eFirstSigninSeen", "eNameAsked"]) localStorage.setItem(k, "1");
          const tabs = codes.map((l, i) => ({ id: "tb" + (i + 1), lang: l, customName: "Chat " + (i + 1), pax: "", paxNamed: false }));
          sessionStorage.setItem("eSessionTabs", JSON.stringify({ tabs, activeTabId: "tb1" }));
        } catch (e) {}
      }, codes);
      await q.goto("file:///" + path.join(dir, "etiuda.html").replace(/\\/g, "/"), { waitUntil: "load", timeout: 60000 });
      await q.waitForFunction((n) => document.querySelectorAll("#tabsBar .tab[data-tid]").length >= n, { timeout: 30000 }, codes.length);
      if (await q.$("#ecYes")) await q.click("#ecYes");
      await sleep(1500);
      const read = () => q.evaluate(() => Array.from(document.querySelectorAll("#tabsBar .tab[data-tid]")).map((el) => {
        const tag = el.querySelector(".tab-lang"), x = el.querySelector(".tab-x"), lab = el.querySelector(".tab-label");
        const kids = Array.from(el.children), r = el.getBoundingClientRect();
        const tcs = tag ? getComputedStyle(tag) : null, xcs = getComputedStyle(x);
        return { tid: el.dataset.tid, on: el.classList.contains("on"), w: Math.round(r.width), narrow: el.dataset.narrow !== undefined,
          text: tag ? tag.textContent : null, hidden: tag ? tag.getAttribute("aria-hidden") : null,
          h: tcs ? tcs.height : null, fs: tcs ? tcs.fontSize : null, tagShown: !!tag && tcs.display !== "none", xShown: xcs.display !== "none",
          order: !!tag && kids.indexOf(lab) < kids.indexOf(tag) && kids.indexOf(tag) < kids.indexOf(x) };
      }));
      const rows = await read();
      const over = await q.evaluate(() => document.querySelector("#tabsWrap").classList.contains("tabs-over"));
      return { rows, page: q, dir, read, over };
    } catch (e) { await q.close().catch(() => {}); return { err: String(e && e.message || e) }; }
  };
  const tl1 = (rows) => rows.length === CODES.length && rows.every((r, i) => r.text === CODES[i].toUpperCase() && r.hidden === "true"
    && r.h === "16px" && r.fs === "10px" && r.order);
  const real = await langRun(rawHtml, "real");
  if (real.err) throw new Error("the language run: " + real.err);
  check(tl1(real.rows), "tl1 each conversation tab carries its chat's own code, in capitals, in a 16px tag of 10px type between name and close: "
    + real.rows.map((r) => r.text).join(" "));
  const narrowRows = real.rows.filter((r) => r.narrow);
  const wideRows = real.rows.filter((r) => !r.narrow);
  const unsel = narrowRows.find((r) => !r.on);
  let swap = false;
  if (unsel) {
    const el = await real.page.$('#tabsBar .tab[data-tid="' + unsel.tid + '"]');
    await el.hover(); await sleep(250);
    const h = (await real.read()).find((r) => r.tid === unsel.tid);
    swap = !!h && !h.tagShown && h.xShown;
    await real.page.mouse.move(5, 500); await sleep(200);
  }
  const mark = narrowRows.length > 0 && narrowRows.every((r) => r.w < 140) && wideRows.every((r) => r.w >= 140)
    && narrowRows.filter((r) => !r.on).every((r) => r.tagShown && !r.xShown)
    && narrowRows.filter((r) => r.on).every((r) => !r.tagShown && r.xShown) && swap;
  check(mark, "tl2 narrow tabs (" + narrowRows.length + " of " + real.rows.length + ", widths " + narrowRows.map((r) => r.w).join(",")
    + "): unselected shows its tag in the close button's place, selected drops its tag, hover swaps them back");
  /* tl6 the tab list behind the chevron says each chat's language too: sixteen tabs overflow the strip */
  await real.page.close();
  const LIST = ["en", "pl", "de", "cs", "es-mx", "pl", "en", "de", "pl", "en", "it", "pl", "de", "en", "pl", "cs"];
  const lr = await langRun(rawHtml, "list", LIST);
  if (lr.err) throw new Error("the list run: " + lr.err);
  let listTags = [];
  if (lr.over) {
    await lr.page.click("#tabsListBtn"); await sleep(400);
    listTags = await lr.page.evaluate(() => Array.from(document.querySelectorAll("#tabsListRows .tabs-list-row")).map((r) => {
      const t = r.querySelector(".tab-lang"); return t ? t.textContent + (t.getAttribute("aria-hidden") === "true" ? "" : "!") : "-"; }));
  }
  await lr.page.close();
  check(lr.over && listTags.join(" ") === LIST.map((c) => c.toUpperCase()).join(" "), "tl6 the tab list behind the chevron (strip overflowing: " + lr.over + ") shows each row's code: " + listTags.join(" "));
  /* tl7 a tab of 140px or more shows both the tag and its close button */
  const wide = await langRun(rawHtml, "wide", ["en", "pl", "de", "cs"]);
  if (wide.err) throw new Error("the wide run: " + wide.err);
  await wide.page.close();
  check(wide.rows.length === 4 && wide.rows.every((r) => r.w >= 140 && !r.narrow && r.tagShown && r.xShown && r.order),
    "tl7 with four tabs (widths " + wide.rows.map((r) => r.w).join(",") + ") each shows both its tag and its close button, selected included");
  const srcLines = rawHtml.split("\n");
  const plantTag = srcLines.findIndex((l) => l.includes("plant:tab-lang-tag")) - 1;
  const plantKeep = srcLines.findIndex((l) => l.includes("plant:tab-lang-keep")) + 1;
  const planted = async (at, tag, edit) => {
    if (process.env.ETIUDA_PLANTS === "off") return { off: true };
    if (at < 0) return { err: "no plant mark " + tag };
    const ls = srcLines.slice(); ls[at] = edit(ls[at]);
    if (ls[at] === srcLines[at]) return { err: "the plant line did not change " + tag };
    const out = await langRun(ls.join("\n"), tag);
    if (out.err) return out;
    await out.page.close();
    return { rows: out.rows };
  };
  const pTag = await planted(plantTag, "tag", (l) => l.replace(/^(\s*)tl,/, "$1"));
  const pKeep = await planted(plantKeep, "keep", (l) => l.replace(/tabLangCode\((\w+)\.lang\) \|\| lang/, '($1.lang === "pl" || $1.lang === "en") ? $1.lang : lang'));
  if (pTag.off) { check(true, "tl3 NOT RUN (ETIUDA_PLANTS=off)"); check(true, "tl4 NOT RUN (ETIUDA_PLANTS=off)"); check(true, "tl5 NOT RUN (ETIUDA_PLANTS=off)"); }
  else {
    check(!!pTag.rows && !tl1(pTag.rows), "tl3 PLANT lifting the line that draws the tag turns tl1 red" + (pTag.err ? " (" + pTag.err + ")" : ""));
    check(!!pKeep.rows && !tl1(pKeep.rows), "tl4 PLANT the two-value keep of a stored language turns tl1 red" + (pKeep.err ? " (" + pKeep.err + ")" : ""));
    check(!!pTag.rows && !!pKeep.rows && pTag.rows.length === CODES.length && pKeep.rows.length === CODES.length, "tl5 the planted copies still draw all " + CODES.length + " tabs");
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
console.log((fails ? "FAIL " : "PASS ") + "strip-redraw: " + (checks - (fails > checks ? checks : fails)) + "/" + checks + " checks" + (done ? "" : " - SUITE DID NOT COMPLETE"));
process.exit(done ? E.exitOf(fails) : 78);
