/* Board 982: Settings, the one page and a section opened alone (finding 6).
 *
 *   node tests/desk-982w-settings.mjs
 *
 * Headless Chrome on the built engine page and the shipped sample catalog.
 * What the eye or the hand finds:
 *   s1 at 546, 900, 1280, 2000 and 2560, on the one page and on Appearance and General
 *      opened alone: no horizontal scrollbar, and no row reaches past its column
 *   s2 the one page shows every section heading, in 3 columns at 2000, 2 at 1280 and 1 at 900,
 *      with the keyboard shortcuts alone in their column at 2000 and 1280; the rail's chosen
 *      row is All settings and no section row is chosen
 *   s3 on the one page every row is as wide as its column, within 2 px
 *   s4 Appearance opened alone keeps its rows on the left, between 440 px and half the page,
 *      with As the desk will look on the right; General's rows sit side by side at 2000
 *   s5 the picture's ground follows Dark, its blur follows Blur effects, its cards follow
 *      Columns, and it takes no click and no Tab stop
 *   s6 a section heading opens that section; the crumb and All settings return; Escape returns
 *   s7 a search on the one page leaves only the matching rows, each under its heading
 *   s8 openSettings("general") opens General alone; openSettings() opens the one page
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

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-982w-"));
fs.copyFileSync(E.ENGINE_PATH, path.join(lab, "etiuda.html"));
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
const url = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");
let browser = null;

async function boot(viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try {
      for (const [k, v] of [
        ["eTourDone_v3", "1"],
        ["eTourInvite_v3", "1"],
        ["eAgent", "Bench Agent"],
        ["eNameAsked", "1"],
        ["eTheme", "light"],
        ["eRail", "1"],
      ]) localStorage.setItem(k, v);
    } catch (e) {}
  });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  const yes = await page.$("#ecYes");
  if (yes) await page.click("#ecYes");
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.body.classList.contains("rail-on")
    && document.body.classList.contains("rail-ready")
    && getComputedStyle(document.getElementById("intentRail")).opacity === "1", { timeout: 30000 });
  return page;
}

/* The page's own reading: headings a person sees, the rail's chosen row, the scrolling box. */
async function readPage(page) {
  return page.evaluate(() => {
    const box = document.getElementById("setBody");
    const nav = document.querySelector('nav[aria-label="Settings"]');
    const heads = box ? [...box.querySelectorAll("h3")].map(h => ({
      name: h.textContent.trim(),
      left: h.parentElement.getBoundingClientRect().left,
      width: h.parentElement.getBoundingClientRect().width,
    })).filter(h => h.name && h.name === h.name.replace(/\s+/g, " ")) : [];
    const sectionNames = ["General", "Appearance", "Layout", "Keyboard shortcuts", "Notifications",
      "Teams and keys", "Data and defaults", "About", "AI"];
    const blocks = heads.filter(h => sectionNames.indexOf(h.name) >= 0);
    const h2 = box && box.querySelector("h2");
    const lede = box && box.querySelector("p");
    const current = nav ? [...nav.querySelectorAll("button")].filter(b => b.getAttribute("aria-current") === "page") : [];
    const rail = nav ? [...nav.querySelectorAll("button")].map(b => b.textContent.trim()).filter(t => t && t.indexOf("Maintenance") !== 0) : [];
    return {
      h2: h2 ? h2.textContent.trim() : "",
      lede: lede ? lede.textContent.trim() : "",
      blocks,
      rail,
      chosen: current.map(b => b.textContent.trim()),
      sw: box ? box.scrollWidth : 0,
      cw: box ? box.clientWidth : 0,
      docSw: document.documentElement.scrollWidth,
      docCw: document.documentElement.clientWidth,
    };
  });
}

function edgesOf(blocks) {
  return [...new Set(blocks.map(b => Math.round(b.left / 4) * 4))].sort((a, b) => a - b);
}

try {
  browser = await puppeteer.launch({
    executablePath: E.browserPath("chrome"),
    headless: true,
    args: ["--hide-scrollbars"],
    protocolTimeout: 120000,
  });

  const page = await boot({ width: 2000, height: 900 });
  await page.evaluate(() => openSettings());
  await sleep(200);

  /* s1. The one page, Appearance alone and General alone, at each window width. */
  const widths = [546, 900, 1280, 2000, 2560];
  const s1bad = [];
  for (const w of widths) {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await sleep(120);
    for (const mode of ["all", "appearance", "general"]) {
      await page.evaluate(m => { if (m === "all") openSettings(); else openSettings(m); }, mode);
      await sleep(80);
      const fit = await page.evaluate(() => {
        const box = document.getElementById("setBody");
        if (!box) return { ok: false, why: "no page" };
        const pageScroll = box.scrollWidth <= box.clientWidth + 1 && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
        const names = ["General", "Appearance", "Layout", "Keyboard shortcuts", "Notifications", "Teams and keys", "Data and defaults", "About", "AI"];
        const blocks = [...box.querySelectorAll("h3")].filter(h => names.indexOf(h.textContent.trim()) >= 0);
        const h2 = box.querySelector("h2");
        const onePage = blocks.length >= 3 && !!h2 && h2.textContent.trim() === "Settings";
        const rows = [...box.querySelectorAll(".set-row, .sc-row")];
        const past = [];
        for (const r of rows) {
          const sec = r.closest("section");
          const col = sec || r.parentElement;
          if (!col) continue;
          if (r.getBoundingClientRect().right > col.getBoundingClientRect().right + 1)
            past.push((r.innerText || "").split("\n")[0].slice(0, 40));
        }
        return { pageScroll, past: past.slice(0, 4), sw: box.scrollWidth, cw: box.clientWidth, onePage, n: blocks.length };
      });
      const needPage = mode === "all";
      const ok = fit && fit.pageScroll && !(fit.past && fit.past.length) && (!needPage || fit.onePage);
      if (!ok) s1bad.push({ w, mode, sw: fit && fit.sw, cw: fit && fit.cw, past: fit && fit.past, onePage: fit && fit.onePage, n: fit && fit.n });
    }
  }
  check(!s1bad.length, "s1 at 546, 900, 1280, 2000 and 2560 the one page, Appearance and General have no horizontal scrollbar and no row past its column", s1bad.slice(0, 6));

  /* s2. Columns and the chosen rail row. */
  const s2 = [];
  for (const w of [2000, 1280, 900]) {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await sleep(120);
    await page.evaluate(() => openSettings());
    await sleep(80);
    const st = await readPage(page);
    const edges = edgesOf(st.blocks);
    const want = w === 2000 ? 3 : w === 1280 ? 2 : 1;
    const keys = st.blocks.filter(b => b.name === "Keyboard shortcuts");
    const keysLeft = keys.length ? Math.round(keys[0].left / 4) * 4 : null;
    const sharing = keysLeft == null ? [] : st.blocks.filter(b => Math.round(b.left / 4) * 4 === keysLeft).map(b => b.name);
    const railSections = st.rail.filter(n => n !== "All settings");
    const shown = st.blocks.map(b => b.name);
    const every = railSections.length > 0 && railSections.every(n => shown.indexOf(n) >= 0) && shown.length === railSections.length;
    const chosenOk = st.chosen.length === 1 && st.chosen[0] === "All settings";
    const alone = want === 1 || sharing.length === 1;
    s2.push({ w, edges: edges.length, want, alone, sharing, chosenOk, chosen: st.chosen, every, h2: st.h2 });
  }
  check(s2.every(r => r.edges === r.want && r.alone && r.chosenOk && r.every && r.h2 === "Settings"),
    "s2 opening Settings shows every section heading, 3 columns at 2000, 2 at 1280 and 1 at 900, shortcuts alone in their column at 2000 and 1280, and All settings is the only chosen row", s2);

  /* s3. Row width against its column, on the one page at 2000. */
  await page.setViewport({ width: 2000, height: 900, deviceScaleFactor: 1 });
  await sleep(100);
  await page.evaluate(() => openSettings());
  const s3res = await page.evaluate(() => {
    const box = document.getElementById("setBody");
    const names = ["General", "Appearance", "Layout", "Keyboard shortcuts", "Notifications", "Data and defaults", "About"];
    const blocks = [...box.querySelectorAll("h3")].filter(h => names.indexOf(h.textContent.trim()) >= 0);
    if (blocks.length < 3) return { ok: false, why: "not the one page", n: blocks.length };
    const bad = [];
    for (const h of blocks) {
      const sec = h.parentElement;
      const rows = [...sec.querySelectorAll(".set-row, .sc-row")];
      for (const r of rows) {
        const d = Math.abs(r.getBoundingClientRect().width - sec.getBoundingClientRect().width);
        if (d > 2) bad.push({ name: h.textContent.trim(), row: (r.innerText || "").split("\n")[0].slice(0, 32), d: Math.round(d * 10) / 10 });
      }
    }
    return { ok: bad.length === 0 && blocks.length >= 3, bad: bad.slice(0, 5), rows: box.querySelectorAll(".set-row, .sc-row").length };
  });
  check(s3res && s3res.ok, "s3 on the one page every row is as wide as its column, within 2 px", s3res);

  /* s4. Appearance with the picture, General as tiles, at 2000. */
  await page.evaluate(() => openSettings("appearance"));
  await sleep(80);
  const s4app = await page.evaluate(() => {
    const box = document.getElementById("setBody");
    const h = [...box.querySelectorAll("h3")].find(x => x.textContent.trim() === "As the desk will look");
    if (!h) return { ok: false, why: "no picture heading" };
    const picture = h.nextElementSibling;
    const rowsBox = h.parentElement.previousElementSibling;
    if (!picture || !rowsBox) return { ok: false, why: "picture or rows missing" };
    const w = rowsBox.getBoundingClientRect().width;
    const half = box.clientWidth / 2;
    const beside = picture.getBoundingClientRect().left >= rowsBox.getBoundingClientRect().right - 2;
    return { ok: w >= 440 && w <= half + 1 && beside, w: Math.round(w), half: Math.round(half), beside, page: box.clientWidth };
  });
  await page.evaluate(() => openSettings("general"));
  await sleep(80);
  const s4gen = await page.evaluate(() => {
    const box = document.getElementById("setBody");
    const rows = [...box.querySelectorAll(".set-row")].map(r => r.getBoundingClientRect());
    let side = 0;
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      if (Math.abs(rows[i].top - rows[j].top) < 8 && Math.abs(rows[i].left - rows[j].left) > 80) side++;
    }
    const h2 = (box.querySelector("h2") || {}).textContent || "";
    return { ok: side >= 1 && h2.trim() === "General", side, n: rows.length, h2: h2.trim() };
  });
  check(s4app && s4app.ok && s4gen && s4gen.ok, "s4 Appearance keeps its rows on the left between 440 px and half the page, with As the desk will look beside them, and General's rows sit side by side at 2000", { appearance: s4app, general: s4gen });

  /* s5. The picture follows the settings and takes no click or Tab. */
  await page.evaluate(() => openSettings("appearance"));
  await sleep(80);
  const s5before = await page.evaluate(() => {
    const box = document.getElementById("setBody");
    const h = [...box.querySelectorAll("h3")].find(x => x.textContent.trim() === "As the desk will look");
    const picture = h && h.nextElementSibling;
    if (!picture) return { ok: false, why: "no picture" };
    const ground = getComputedStyle(picture).backgroundColor;
    const blurs = [...picture.querySelectorAll("*")].filter(el => {
      const f = getComputedStyle(el).backdropFilter || "";
      return f && f !== "none";
    }).length;
    return { ground, blurs };
  });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#setBody [data-seg="theme"] button')].find(x => x.textContent.trim() === "Dark");
    if (b) b.click();
  });
  await sleep(80);
  const s5dark = await page.evaluate(() => {
    const box = document.getElementById("setBody");
    const h = [...box.querySelectorAll("h3")].find(x => x.textContent.trim() === "As the desk will look");
    const picture = h && h.nextElementSibling;
    const ground = picture ? getComputedStyle(picture).backgroundColor : "";
    const host = getComputedStyle(document.getElementById("screenHost")).backgroundColor;
    return { ground, host, same: ground === host };
  });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#setBody [data-seg="glass"] button')].find(x => x.textContent.trim() === "Off");
    if (b) b.click();
  });
  await sleep(80);
  const s5blur = await page.evaluate(() => {
    const box = document.getElementById("setBody");
    const h = [...box.querySelectorAll("h3")].find(x => x.textContent.trim() === "As the desk will look");
    const picture = h && h.nextElementSibling;
    const blurs = picture ? [...picture.querySelectorAll("*")].filter(el => {
      const f = getComputedStyle(el).backdropFilter || "";
      return f && f !== "none";
    }).length : -1;
    return { blurs };
  });
  await page.evaluate(() => openSettings("layout"));
  await sleep(80);
  async function cardCols() {
    return page.evaluate(() => {
      const box = document.getElementById("setBody");
      const h = [...box.querySelectorAll("h3")].find(x => x.textContent.trim() === "As the desk will look");
      const picture = h && h.nextElementSibling;
      if (!picture) return { n: 0 };
      const cards = [...picture.querySelectorAll("b")];
      const lefts = [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().left)))];
      return { n: lefts.length, cards: cards.length };
    });
  }
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#setBody [data-seg="cols"] button')].find(x => x.getAttribute("data-val") === "2");
    if (b) b.click();
  });
  await sleep(100);
  const cols2 = await cardCols();
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#setBody [data-seg="cols"] button')].find(x => x.getAttribute("data-val") === "1");
    if (b) b.click();
  });
  await sleep(100);
  const cols1 = await cardCols();
  await page.evaluate(() => openSettings("appearance"));
  await sleep(60);
  const s5hand = await page.evaluate(() => {
    const box = document.getElementById("setBody");
    const h = [...box.querySelectorAll("h3")].find(x => x.textContent.trim() === "As the desk will look");
    const picture = h && h.nextElementSibling;
    if (!picture) return { ok: false, why: "no picture" };
    const r = picture.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 40));
    const inside = !!(hit && picture.contains(hit));
    const stops = picture.querySelectorAll("a, button, input, select, textarea, [tabindex]").length;
    const note = h.parentElement.querySelector("p");
    return { inside, stops, note: note ? note.textContent.trim() : "", hidden: picture.getAttribute("aria-hidden") };
  });
  let tabHit = false;
  await page.focus("#sxSearch");
  for (let i = 0; i < 30 && !tabHit; i++) {
    await page.keyboard.press("Tab");
    tabHit = await page.evaluate(() => {
      const box = document.getElementById("setBody");
      const h = [...box.querySelectorAll("h3")].find(x => x.textContent.trim() === "As the desk will look");
      const picture = h && h.nextElementSibling;
      return !!(picture && document.activeElement && picture.contains(document.activeElement));
    });
  }
  const s5ok = s5before && s5before.blurs > 0 && s5dark && s5dark.same && s5dark.ground !== s5before.ground
    && s5blur && s5blur.blurs === 0 && cols2.n === 2 && cols1.n === 1
    && s5hand && !s5hand.inside && s5hand.stops === 0 && !tabHit
    && s5hand.note === "A drawing that follows these settings as they change. It is only for looking at.";
  check(s5ok, "s5 the picture follows Dark, Blur effects and Columns, and it takes no click and no Tab stop",
    { before: s5before, dark: s5dark, blur: s5blur, cols2, cols1, hand: s5hand, tabHit });
  await page.evaluate(() => {
    const light = [...document.querySelectorAll('#setBody [data-seg="theme"] button')].find(x => x.textContent.trim() === "Light");
    if (light) light.click();
    const on = [...document.querySelectorAll('#setBody [data-seg="glass"] button')].find(x => x.textContent.trim() === "On");
    if (on) on.click();
    const auto = [...document.querySelectorAll('#setBody [data-seg="cols"] button')].find(x => x.getAttribute("data-val") === "auto");
    if (auto) auto.click();
  });

  /* s6. Heading, crumb, All settings, Escape. */
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluate(() => openSettings());
  await sleep(80);
  const s6open = await page.evaluate(() => {
    const box = document.getElementById("setBody");
    const btn = [...box.querySelectorAll("h3 button")].find(b => b.textContent.trim() === "Appearance");
    if (!btn) return { ok: false, why: "no Appearance heading" };
    const title = btn.getAttribute("title") || "";
    btn.click();
    const h2 = (box.querySelector("h2") || {}).textContent || "";
    const still = [...box.querySelectorAll("h3")].some(h => h.textContent.trim() === "General");
    return { title, h2: h2.trim(), still };
  });
  const s6crumb = await page.evaluate(() => {
    const box = document.getElementById("setBody");
    const a = [...box.querySelectorAll("a")].find(x => x.textContent.trim() === "Settings");
    if (!a) return { ok: false, why: "crumb is not a link" };
    a.click();
    const h2 = (box.querySelector("h2") || {}).textContent || "";
    const heads = [...box.querySelectorAll("h3")].map(h => h.textContent.trim());
    return { h2: h2.trim(), heads: heads.filter(t => t === "General" || t === "Appearance") };
  });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('nav[aria-label="Settings"] button')].find(x => x.textContent.trim() === "Appearance");
    if (b) b.click();
  });
  const s6all = await page.evaluate(() => {
    const b = [...document.querySelectorAll('nav[aria-label="Settings"] button')].find(x => x.textContent.trim() === "All settings");
    if (!b) return { why: "no All settings row" };
    b.click();
    const h2 = (document.querySelector("#setBody h2") || {}).textContent || "";
    return { h2: h2.trim() };
  });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('nav[aria-label="Settings"] button')].find(x => x.textContent.trim() === "General");
    if (b) b.click();
  });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('nav[aria-label="Settings"] button')].find(x => x.textContent.trim() === "General");
    if (b) b.focus();
  });
  await page.keyboard.press("Escape");
  await sleep(80);
  const s6esc = await readPage(page);
  const s6ok = s6open && s6open.title === "Opens this section alone" && s6open.h2 === "Appearance" && !s6open.still
    && s6crumb && s6crumb.h2 === "Settings" && s6crumb.heads.length === 2
    && s6all && s6all.h2 === "Settings"
    && s6esc.h2 === "Settings" && s6esc.chosen.length === 1 && s6esc.chosen[0] === "All settings";
  check(s6ok, "s6 a section heading opens that section, and the crumb, All settings and Escape each return to the one page",
    { open: s6open, crumb: s6crumb, all: s6all, esc: { h2: s6esc.h2, chosen: s6esc.chosen } });

  /* s7. Search on the one page. */
  await page.evaluate(() => openSettings());
  await sleep(40);
  const s7before = await readPage(page);
  await page.click("#sxSearch");
  await page.keyboard.type("blur");
  await sleep(80);
  const s7res = await page.evaluate(() => {
    const box = document.getElementById("setBody");
    const heads = [...box.querySelectorAll("h3")].map(h => h.textContent.trim());
    const rows = [...box.querySelectorAll(".set-row")].map(r => (r.innerText || "").split("\n")[0].trim());
    const blur = rows.filter(t => t.indexOf("Blur effects") >= 0);
    const theme = rows.filter(t => t === "Theme" || t.indexOf("Theme") === 0);
    const under = (() => {
      const h = [...box.querySelectorAll("h3")].find(x => x.textContent.trim() === "Appearance");
      if (!h) return false;
      return [...h.parentElement.querySelectorAll(".set-row")].some(r => (r.innerText || "").indexOf("Blur effects") >= 0);
    })();
    return { heads, rows, blur: blur.length, theme: theme.length, under };
  });
  const s7ok = s7before.h2 === "Settings" && s7before.chosen[0] === "All settings" && s7before.blocks.length >= 3
    && s7res.blur >= 1 && s7res.theme === 0 && s7res.under && s7res.heads.indexOf("Appearance") >= 0
    && s7res.heads.indexOf("General") < 0;
  check(s7ok, "s7 typing in the rail's search on the one page leaves only the matching rows, each under its section heading",
    { before: { h2: s7before.h2, chosen: s7before.chosen, n: s7before.blocks.length }, after: s7res });

  /* s8. openSettings with a section, and with none. */
  const s8res = await page.evaluate(() => {
    openSettings("general");
    const aloneBox = document.getElementById("setBody");
    const aloneH2 = (aloneBox.querySelector("h2") || {}).textContent.trim();
    const aloneHeads = [...aloneBox.querySelectorAll("h3")].map(h => h.textContent.trim());
    const name = !!aloneBox.querySelector("#setAgentName");
    openSettings();
    const allBox = document.getElementById("setBody");
    const allH2 = (allBox.querySelector("h2") || {}).textContent.trim();
    const lede = (allBox.querySelector("p") || {}).textContent.trim();
    const heads = [...allBox.querySelectorAll("h3")].map(h => h.textContent.trim());
    const chosen = [...document.querySelectorAll('nav[aria-label="Settings"] button')]
      .filter(b => b.getAttribute("aria-current") === "page").map(b => b.textContent.trim());
    return { aloneH2, aloneHeads, name, allH2, lede, heads, chosen };
  });
  const s8ok = s8res && s8res.aloneH2 === "General" && s8res.name
    && s8res.aloneHeads.indexOf("Appearance") < 0 && s8res.aloneHeads.indexOf("General") < 0
    && s8res.allH2 === "Settings" && s8res.lede === "Every setting Etiuda has, on one page."
    && s8res.heads.indexOf("General") >= 0 && s8res.heads.indexOf("Appearance") >= 0
    && s8res.chosen.length === 1 && s8res.chosen[0] === "All settings";
  check(s8ok, "s8 openSettings(\"general\") opens General alone and openSettings() opens the one page", s8res);

} catch (e) {
  check(false, "run crashed: " + (e && e.message ? e.message : e));
} finally {
  if (browser) await browser.close();
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}

console.log("RESULT checks=" + checks + " failed=" + fails);
process.exitCode = fails ? 1 : 0;
