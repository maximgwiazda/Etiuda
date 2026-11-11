/* Board 982: the keyboard on the new screens, ROLE suggestions, Categories & cards and Settings (the test architect's
 * keyboard pass of 2026-11-11). The criterion: "everything a pointer can do on these screens a keyboard can do, focus is
 * always visible and never lost after an action".
 *
 *   node tests/desk-982w-keys.mjs
 *
 * Headless Chrome on the built engine page and the shipped sample catalog, keys only.
 * What the hand and the eye find:
 *   k1 Enter on a name's cross takes that name off the list
 *   k2 Space on a name, on its cross and on a sorting heading leaves the Library open and types nothing into the search
 *   k3 after Enter on a name, Delete, Enter in the add field, Ctrl+Z and Escape from a reply's editor, focus is on the
 *      matching control of the ROLE page
 *   k4 after Enter on a sorting heading focus is on that heading
 *   k5 in Settings, after a section's heading, Escape, a rail row and the crumb, focus is on the matching control
 *   k6 the cross, a reply, a sorting heading, a section's heading and All settings each look different focused
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

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-982w-keys-"));
fs.copyFileSync(E.ENGINE_PATH, path.join(lab, "etiuda.html"));
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
const url = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");
let browser = null;

async function boot() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try {
      for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"],
        ["eTheme", "light"], ["eRail", "1"]]) localStorage.setItem(k, v);
    } catch (e) {}
  });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  const yes = await page.$("#ecYes");
  if (yes) await page.click("#ecYes");
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await page.keyboard.press("Escape");
  await sleep(300);
  return page;
}
async function section(page, lm) {
  await page.evaluate(s => { openManage(); const e = document.querySelector('.sx-sec[data-lm="' + s + '"]'); if (e) e.click(); }, lm);
  await sleep(150);
}
/* Focus by script after a key, as Tab would leave it: Chromium then treats the focus as the keyboard's. */
async function focusOn(page, sel) {
  await page.keyboard.press("Shift");
  const ok = await page.evaluate(s => { const e = document.querySelector(s); if (!e) return false; e.focus(); return document.activeElement === e; }, sel);
  return ok;
}
const where = page => page.evaluate(() => {
  const a = document.activeElement;
  return {
    tag: a ? a.tagName : "", cls: a && a.className ? String(a.className).slice(0, 40) : "",
    wrow: a && a.getAttribute ? a.getAttribute("data-wrow") : null, sort: a && a.getAttribute ? a.getAttribute("data-sort-col") : null,
    card: a && a.getAttribute ? a.getAttribute("data-card-id") : null, sx: a && a.getAttribute ? a.getAttribute("data-sx") : null,
    open: a && a.getAttribute ? a.getAttribute("data-open") : null, id: a ? a.id : "",
    back: !!(a && a.classList && a.classList.contains("sx-back")),
    lib: !!document.querySelector("#screenHost:not([hidden]) .lib-list"), intent: (document.getElementById("intent") || {}).value || "",
  };
});
const names = page => page.evaluate(() => [...document.querySelectorAll(".lw-name[data-wrow]")].map(r => r.getAttribute("data-wrow")));

/* The look of a control and what it wears, blurred and then focused from the keyboard. */
async function looksFocused(page, sel) {
  const sig = () => page.evaluate(s => {
    const e = document.querySelector(s);
    if (!e) return null;
    const keys = ["outlineStyle", "outlineWidth", "outlineColor", "boxShadow", "backgroundColor", "borderTopColor", "color", "textDecorationLine", "opacity"];
    const read = (el, p) => { const c = getComputedStyle(el, p); return keys.map(k => c[k]).join("|"); };
    return [read(e), read(e, "::before"), read(e, "::after"), e.parentElement ? read(e.parentElement) : ""].join("#");
  }, sel);
  await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await page.mouse.move(2, 2);
  await sleep(250);
  const off = await sig();
  const got = await focusOn(page, sel);
  await sleep(250);
  const on = await sig();
  return { sel, got, differs: !!off && !!on && off !== on };
}

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  const page = await boot();

  /* k1 */
  await section(page, "who");
  const before1 = await names(page);
  const victim = before1[1];
  await focusOn(page, '.lw-name[data-wrow="' + victim + '"] .lw-del');
  await page.keyboard.press("Enter");
  await sleep(200);
  const after1 = await names(page);
  const marked1 = await page.evaluate(() => [...document.querySelectorAll(".lw-name.on")].map(r => r.getAttribute("data-wrow")));
  check(after1.length === before1.length - 1 && after1.indexOf(victim) < 0,
    "k1 Enter on a name's cross takes that name off the list", { victim, before: before1.length, after: after1.length, marked: marked1 });

  /* k3, then k2 for the ROLE page */
  const k3 = {};
  await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
  await sleep(200);
  k3.undo = await where(page);
  k3.undoBack = (await names(page)).indexOf(victim) >= 0;
  const first = (await names(page))[0];
  await focusOn(page, '.lw-name[data-wrow="' + first + '"]');
  await page.keyboard.press("Enter");
  await sleep(200);
  k3.mark = await where(page);
  await focusOn(page, '.lw-name[data-wrow="' + victim + '"]');
  await page.keyboard.press("Delete");
  await sleep(200);
  k3.del = await where(page);
  await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
  await sleep(200);
  await focusOn(page, "#mgAddWho");
  await page.keyboard.type("Zeta Tester");
  await page.keyboard.press("Enter");
  await sleep(200);
  k3.add = await where(page);
  k3.added = (await names(page)).indexOf("Zeta Tester") >= 0;
  const cardId = await page.evaluate(() => { const c = document.querySelector(".lw-reads .lw-ct[data-card-id]"); return c ? c.getAttribute("data-card-id") : ""; });
  await focusOn(page, '.lw-reads .lw-ct[data-card-id="' + cardId + '"]');
  await page.keyboard.press("Enter");
  await sleep(500);
  k3.editorOpen = await page.evaluate(() => !document.getElementById("modal").hidden);
  await page.keyboard.press("Escape");
  await sleep(500);
  k3.esc = await where(page);
  const k3ok = k3.undoBack && k3.undo.wrow === victim && k3.mark.wrow === first && !!k3.del.wrow && k3.del.wrow !== victim
    && k3.added && k3.add.id === "mgAddWho" && k3.editorOpen && k3.esc.card === cardId;
  check(k3ok, "k3 after Ctrl+Z, Enter on a name, Delete, Enter in the add field and Escape from a reply's editor, focus is on the matching control", k3);

  const k2 = [];
  for (const sel of ['.lw-name[data-wrow="' + first + '"]', '.lw-name[data-wrow="' + first + '"] .lw-del']) {
    await section(page, "who");
    await focusOn(page, sel);
    await page.keyboard.press(" ");
    await sleep(250);
    const w = await where(page);
    k2.push({ sel: sel.slice(0, 40), lib: w.lib, intent: w.intent, on: w.tag + "." + w.cls });
    if (sel.indexOf("lw-del") >= 0) {
      await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
      await sleep(200);
    }
  }

  /* k4, and k2 for the sorting heading */
  await section(page, "catmac");
  await focusOn(page, '.lw-head [data-sort-col="us"]');
  await page.keyboard.press("Enter");
  await sleep(200);
  const k4 = await where(page);
  check(k4.sort === "us" && k4.lib, "k4 after Enter on a sorting heading focus is on that heading", k4);
  await focusOn(page, '.lw-head [data-sort-col="us"]');
  await page.keyboard.press(" ");
  await sleep(250);
  const w2 = await where(page);
  k2.push({ sel: "sort heading", lib: w2.lib, intent: w2.intent, on: w2.tag + "." + w2.cls });
  check(k2.every(x => x.lib && x.intent === ""), "k2 Space on a name, its cross and a sorting heading keeps the Library open and types nothing into the search", k2);

  /* k5 */
  await page.evaluate(() => openSettings());
  await sleep(200);
  const k5 = {};
  await focusOn(page, '#setBody [data-open="appearance"]');
  await page.keyboard.press("Enter");
  await sleep(200);
  k5.heading = await where(page);
  await focusOn(page, '#setBody .set-row[data-row="theme"] .set-seg button');
  await page.keyboard.press("Escape");
  await sleep(200);
  k5.escape = await where(page);
  await focusOn(page, '#sxSecs [data-sx="layout"]');
  await page.keyboard.press("Enter");
  await sleep(200);
  k5.rail = await where(page);
  await focusOn(page, "#setBody a.sx-back");
  await page.keyboard.press("Enter");
  await sleep(200);
  k5.crumb = await where(page);
  await focusOn(page, '#sxSecs [data-sx="all"]');
  await page.keyboard.press("Enter");
  await sleep(200);
  k5.all = await where(page);
  check(k5.heading.back && k5.escape.open === "appearance" && k5.rail.sx === "layout" && k5.crumb.open === "layout" && k5.all.sx === "all",
    "k5 in Settings, after a section's heading, Escape, a rail row, the crumb and All settings, focus is on the matching control", k5);

  /* k6 */
  const k6 = [];
  await section(page, "who");
  k6.push(await looksFocused(page, ".lw-name[data-wrow] .lw-del"));
  k6.push(await looksFocused(page, ".lw-reads .lw-ct[data-card-id]"));
  await section(page, "catmac");
  k6.push(await looksFocused(page, '.lw-head [data-sort-col="us"]'));
  await page.evaluate(() => openSettings());
  await sleep(200);
  k6.push(await looksFocused(page, '#setBody [data-open="appearance"]'));
  k6.push(await looksFocused(page, '#sxSecs [data-sx="all"]'));
  check(k6.every(x => x.got && x.differs), "k6 the cross, a reply, a sorting heading, a section's heading and All settings each look different focused", k6);
} catch (e) {
  check(false, "run crashed: " + (e && e.message ? e.message : e));
} finally {
  if (browser) await browser.close();
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}

console.log("#counts checks=" + checks + " skipped=0 failed=" + fails + " expected=6");
process.exit(fails || checks !== 6 ? 1 : 0);
