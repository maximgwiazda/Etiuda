/* THE FADE REACHES THE DOTS AND NOTHING ELSE (board 1019 (9), Max, 2026-11-21: "the dots' fading near text sometimes hides real interface elements").
 *
 *   node tests/desk-dots-ground-only.mjs [--engine <file>]
 *
 * Chrome, headless, no fixtures, no window.
 *
 * THE CRITERION. The clearing the pass lays round words, icons and controls on a dotted ground (.e-dot-hug, .e-dot-ic, .e-dot-ctrl) belongs to the
 * backdrop's dots and only to them: no heading, label, control or text is ever faded, clipped or masked by it, in either theme.
 * HOW IT IS HELD, so a second tool can redo it. Each screen is shot twice at one device pixel to a CSS pixel with the dot field off in both: as it
 * is, and with the clearing taken out (.e-dot-hug and .e-dot-ic without ground or spread, .e-dot-ctrl without its ground). With no dots to clear,
 * the clearing is the page's own colour on the page's own colour, so the two shots are the same picture: a pixel inside the ground whose channel
 * differs by 8 or more (24 in the one band named at MIN_GAP) is a pixel the clearing painted over something that is not the dots. Counted as clusters of such pixels (within 3 px of each
 * other), per screen, theme and width. The screens: the empty desk, the loaded desk, every section of Settings, the Library and Maintenance, and
 * the first sign-in. Exit code is the number of failed checks; 78 when the run could not complete.
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const { seatPage } = require("./seat-page.js");
const puppeteer = require("puppeteer-core");
let fails = 0, checks = 0, notRun = 0, EXPECTED = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (!ok && detail !== undefined ? ": " + JSON.stringify(detail) : ""));
  if (!ok) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argv = process.argv.slice(2);
const at = argv.indexOf("--engine");
const ENGINE = at >= 0 ? path.resolve(argv[at + 1]) : E.ENGINE_PATH;

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-dots-ground-"));
/* The catalog reaches the page the desk's way, the preload's, through E.seedCatalog: nothing is written beside the page. */
const SAMPLE_DOC = fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8");
const writeDeskFiles = (dir, htmlText) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "etiuda.html"), htmlText);
  return "file:///" + path.join(dir, "etiuda.html").replace(/\\/g, "/");
};

const closePage = (p) => Promise.race([p.close().catch(() => {}), sleep(5000)]);
async function boot(browser, pageUrl, theme, lang, withCatalog, vp) {
  const p = await browser.newPage();
  p.on("dialog", (d) => { d.dismiss().catch(() => {}); });
  await p.setViewport(vp || { width: 1280, height: 800 });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.evaluateOnNewDocument((th, lg) => {
    try {
      localStorage.clear();
      for (const k of ["eTourDone_v3", "eTourInvite_v3", "eNameAsked", "eFirstSigninSeen"]) localStorage.setItem(k, "1");
      localStorage.setItem("eTheme", th);
      localStorage.setItem("eUiLang", lg);
      localStorage.setItem("eAgent", "Bench Agent");
    } catch (e) {}
  }, theme, lang);
  await seatPage(p);
  if (withCatalog) await E.seedCatalog(p, SAMPLE_DOC);
  await p.goto(pageUrl, { waitUntil: "load", timeout: 60000 });
  if (withCatalog) {
    await p.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
    if (await p.$("#ecYes")) await p.click("#ecYes");
    await p.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
      && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  } else {
    await p.waitForFunction(() => !!document.querySelector(".empty-desk") && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  }
  await sleep(250);
  return p;
}

async function bootFirstSignin(browser, pageUrl, theme, lang, vp) {
  const p = await browser.newPage();
  p.on("dialog", (d) => { d.dismiss().catch(() => {}); });
  await p.setViewport(vp || { width: 1280, height: 800 });
  await p.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
    { name: "prefers-color-scheme", value: theme }
  ]);
  await p.evaluateOnNewDocument((th, lg) => {
    try {
      localStorage.clear();
      for (const k of ["eTourDone_v3", "eTourInvite_v3", "eNameAsked", "eStill"]) localStorage.setItem(k, "1");
      localStorage.setItem("eTheme", th);
      localStorage.setItem("eUiLang", lg);
      localStorage.setItem("eAgent", "Bench Agent");
    } catch (e) {}
    const st = { offered: ["microsoft", "google"], signedIn: "", seat: "none", reached: true };
    window.E_HOST = {
      shown: true,
      lang: lg,
      signinState: () => st,
      signIn: async () => null,
      signinCheck: async () => st,
      teamLeads: () => []
    };
  }, theme, lang);
  await p.goto(pageUrl, { waitUntil: "load", timeout: 60000 });
  await p.waitForFunction(() => {
    const f = document.getElementById("firstSignin");
    return !!f && !f.hidden && document.body.classList.contains("e-first-signin")
      && f.textContent.trim().length > 0 && !document.querySelector(".e-launch-veil");
  }, { timeout: 30000 });
  await sleep(250);
  return p;
}


/* a channel apart by 8 or more: a covered border or word differs by 100 and more, and every screen's own difference is 0 */
const MIN_GAP = Number(process.env.DOTS_GROUND_GAP) || 8;
/* THE ONE BAND HELD AT 24. Every child of the empty desk is a stacking context of its own (template.html, .empty-desk>*{position:relative;
   z-index:1}), so the link's patch under "Load catalog file" cannot lie below the button and its top edge covers the tail of the button's soft
   shadow, by 18 levels at most. Excused only there: inside the shadow's reach below #emptyLoad and the patch round #emptyAddCard both. */
const BAND_GAP = 24;
const BAND = () => {
  const btn = document.getElementById("emptyLoad"), link = document.getElementById("emptyAddCard");
  const hug = link && link.closest(".e-dot-hug");
  if (!btn || !hug) return null;
  const sh = getComputedStyle(btn).boxShadow.match(/(-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px/);
  if (!sh) return null;
  const reach = Math.abs(+sh[1]) + +sh[3], b = btn.getBoundingClientRect(), h = hug.getBoundingClientRect();
  const x0 = Math.max(b.left - reach, h.left - 3), x1 = Math.min(b.right + reach, h.right + 3);
  const y0 = Math.max(b.top, h.top - 3), y1 = Math.min(b.bottom + +sh[2] + +sh[3], h.bottom + 3);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
};
const OFF = ".dotfield>div,.sx-page,.fs-left{background-image:none !important}";
const CLEAR = ".e-dot-hug{background:none !important;box-shadow:none !important}.e-dot-ic{background:none !important;box-shadow:none !important}"
  + ".e-dot-ctrl:not(:hover):not(:focus-visible):not(:active){background-color:transparent !important}";
const PIXELS = async (MIN, a64, b64, R) => {
  const load = (x) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = "data:image/png;base64," + x; });
  const [ia, ib] = await Promise.all([load(a64), load(b64)]);
  const px = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const q = c.getContext("2d"); q.drawImage(img, 0, 0); return q.getImageData(0, 0, img.width, img.height); };
  const A = px(ia), B = px(ib), W = A.width, H = A.height, seen = new Uint8Array(W * H), out = [];
  const inR = (k) => { const x = k % W, y = (k - x) / W; return x >= R[0] && x < R[2] && y >= R[1] && y < R[3]; };
  const gap = (k) => Math.max(Math.abs(A.data[k * 4] - B.data[k * 4]), Math.abs(A.data[k * 4 + 1] - B.data[k * 4 + 1]), Math.abs(A.data[k * 4 + 2] - B.data[k * 4 + 2]));
  const differs = (k) => inR(k) && gap(k) >= MIN;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (seen[i] || !differs(i)) continue;
    const box = { x0: x, y0: y, x1: x, y1: y, n: 0, max: 0 }, st = [i]; seen[i] = 1;
    while (st.length) {
      const j = st.pop(), jx = j % W, jy = (j - jx) / W; box.n++; box.max = Math.max(box.max, gap(j));
      box.x0 = Math.min(box.x0, jx); box.x1 = Math.max(box.x1, jx); box.y0 = Math.min(box.y0, jy); box.y1 = Math.max(box.y1, jy);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const nx = jx + dx, ny = jy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx; if (seen[k] || !differs(k)) continue;
        seen[k] = 1; st.push(k);
      }
    }
    out.push(box);
  }
  return out;
};
async function killMotion(page) {
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
}
/* the ground a screen stands on: the first sign-in's left half, an open screen's page, or the desk's work area */
const GROUND = () => {
  const fsl = document.querySelector("body.e-first-signin .fs-left");
  const sx = document.querySelector("#screenHost .sx-page");
  const m = document.querySelector(".stage > .scroller main");
  const g = (fsl && fsl.getBoundingClientRect().width) ? fsl : (sx && sx.getBoundingClientRect().width) ? sx : m;
  const r = g.getBoundingClientRect();
  return [Math.max(0, Math.floor(r.left)), Math.max(0, Math.floor(r.top)), Math.floor(r.right), Math.floor(r.bottom)];
};
async function diffOf(decoder, p) {
  const R = await p.evaluate(GROUND);
  const off = await p.addStyleTag({ content: OFF });
  let a = await p.screenshot({ encoding: "base64" });
  for (let i = 0; i < 6; i++) { await sleep(200); const a2 = await p.screenshot({ encoding: "base64" }); const same = a2 === a; a = a2; if (same) break; }
  const clear = await p.addStyleTag({ content: CLEAR });
  const b = await p.screenshot({ encoding: "base64" });
  await p.evaluate((x) => x.remove(), clear);
  await p.evaluate((x) => x.remove(), off);
  const band = await p.evaluate(BAND);
  const boxes = (await decoder.evaluate(PIXELS, MIN_GAP, a, b, R)).filter((q) => !(band && q.max < BAND_GAP
    && q.x0 >= Math.floor(band[0]) && q.x1 <= Math.ceil(band[2]) && q.y0 >= Math.floor(band[1]) && q.y1 <= Math.ceil(band[3])));
  const named = await p.evaluate((boxes) => boxes.slice(0, 12).map((q) => {
    const e = document.elementFromPoint((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2);
    return { box: [q.x0, q.y0, q.x1, q.y1], px: q.n, max: q.max, under: e ? e.tagName.toLowerCase() + "." + String(e.className).trim().split(/\s+/).join(".") + " " + (e.textContent || "").trim().slice(0, 30) : "" };
  }), boxes);
  return { n: boxes.length, px: boxes.reduce((s, q) => s + q.n, 0), named };
}

let browser = null, decoder = null, done = false;
const VPS = [["1280w", { width: 1280, height: 800 }], ["560w", { width: 560, height: 850 }]];
try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars", "--disable-lcd-text"], protocolTimeout: 180000 });
  decoder = await browser.newPage();
  const rawHtml = fs.readFileSync(ENGINE, "utf8");
  const urlEmpty = writeDeskFiles(path.join(lab, "empty"), rawHtml);
  const urlFull = writeDeskFiles(path.join(lab, "full"), rawHtml);
  const ONLY = process.env.DOTS_GROUND_ONLY || "";
  const hold = async (p, label) => {
    if (ONLY && !label.includes(ONLY)) return;
    await killMotion(p);
    if (process.env.DOTS_GROUND_PROBE && label.includes(process.env.DOTS_GROUND_ONLY || "")) process.stdout.write(label + " " + JSON.stringify(await p.evaluate((xy) => { const [x, y] = xy.split(",").map(Number); return document.elementsFromPoint(x, y).slice(0, 8).map((e) => e.tagName.toLowerCase() + "." + String(e.className).trim().split(/\s+/).join(".") + " [" + getComputedStyle(e).backgroundColor + " z=" + getComputedStyle(e).zIndex + " pos=" + getComputedStyle(e).position + "]"); }, process.env.DOTS_GROUND_PROBE)) + "\n");
    const d = await diffOf(decoder, p);
    EXPECTED += 1;
    check(d.n === 0, label + ": the clearing paints only the ground (" + d.n + " clusters, " + d.px + " pixels over something else)", d.n ? d.named : undefined);
  };
  const sections = async (p, label, open, sel, attr) => {
    await p.evaluate(open);
    await p.waitForSelector("#screenHost .sx-nav " + sel, { timeout: 10000 });
    await sleep(150);
    const keys = await p.evaluate((s, a) => Array.from(document.querySelectorAll("#screenHost .sx-nav " + s)).map((x) => x.getAttribute(a)), sel, attr);
    for (const k of keys) {
      await p.evaluate((s, a, key) => { const b = document.querySelector("#screenHost .sx-nav " + s + "[" + a + '="' + key + '"]'); if (b) b.click(); }, sel, attr, k);
      await sleep(120);
      await hold(p, label + "/" + k);
    }
  };
  for (const theme of ["light", "dark"]) {
    for (const [vpLabel, vp] of VPS) {
      let p = await boot(browser, urlEmpty, theme, "en", false, vp);
      await hold(p, "empty-desk [" + theme + "," + vpLabel + "]");
      await closePage(p);
      p = await bootFirstSignin(browser, urlEmpty, theme, "en", vp);
      await hold(p, "first-signin [" + theme + "," + vpLabel + "]");
      await closePage(p);
      p = await boot(browser, urlFull, theme, "en", true, vp);
      await hold(p, "loaded-desk [" + theme + "," + vpLabel + "]");
      await sections(p, "settings [" + theme + "," + vpLabel + "]", () => window.openScreenTab("settings"), ".sx-sec", "data-sx");
      await sections(p, "library [" + theme + "," + vpLabel + "]", () => window.openManage(), ".sx-sec[data-lm]", "data-lm");
      await sections(p, "maintenance [" + theme + "," + vpLabel + "]", () => window.openScreenTab("maintenance"), ".sx-sec[data-mt]", "data-mt");
      /* dots-route: the pass's numbers are the screen's alone. Settings reached after the other screens and Settings reached fresh after
         Maintenance carry the same patches with the same inline order (tests/swap.mjs holds the whole markup the same way). */
      const routeLabel = "dots-route [" + theme + "," + vpLabel + "]";
      if (theme === "light" && vpLabel === "1280w" && (!ONLY || routeLabel.includes(ONLY))) {
        const ZS = () => Array.from(document.querySelectorAll("#screenHost .sx-page .e-dot-hug > .e-dot-t"))
          .map((w) => w.textContent.trim().slice(0, 24) + "=" + w.parentNode.style.zIndex);
        const settingsFirst = async (q) => {
          await q.evaluate(() => window.openScreenTab("settings"));
          await q.waitForSelector("#screenHost .sx-nav .sx-sec", { timeout: 10000 });
          await q.evaluate(() => { const b = document.querySelector("#screenHost .sx-nav .sx-sec"); if (b) b.click(); });
          await sleep(200);
          return q.evaluate(ZS);
        };
        const after = await settingsFirst(p);
        const q = await boot(browser, urlFull, theme, "en", true, vp);
        await q.evaluate(() => window.openScreenTab("maintenance"));
        await q.waitForSelector("#screenHost .sx-page", { timeout: 10000 });
        await sleep(150);
        const fresh = await settingsFirst(q);
        await closePage(q);
        EXPECTED += 1;
        const same = after.length > 0 && JSON.stringify(after) === JSON.stringify(fresh);
        check(same, routeLabel + ": one screen reached two ways numbers its patches the same (" + after.length + " patches)",
          same ? undefined : { after: after.slice(0, 6), fresh: fresh.slice(0, 6) });
      }
      await closePage(p);
    }
  }
  done = true;
} catch (e) {
  console.log("  FAIL the run stopped: " + String((e && e.message) || e));
  fails++;
} finally {
  if (decoder) await closePage(decoder).catch(() => {});
  if (browser) await Promise.race([browser.close(), sleep(10000).then(() => { const c = browser.process(); if (c) c.kill(); })]);
  E.removeLab(lab);
}

/* THE PLANTS, in scratch copies of the built page (the --engine file): each puts one deciding line back as it was, and the leg that holds it turns red. */
if (done && !process.env.DOTS_GROUND_ONLY && process.env.ETIUDA_PLANTS !== "off") {
  const raw = fs.readFileSync(ENGINE, "utf8");
  const plantLab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-dots-ground-plant-"));
  const PLANTS = [
    ["words in the patch's own layer", ".e-dot-t{position:relative}", ".e-dot-t{position:static}", "settings [light,560w]/account"],
    ["patches in the page's flow", "if (hug.style.zIndex !== z) hug.style.zIndex = z;", "hug.style.zIndex=\"auto\";", "settings [light,1280w]/account"],
    ["patches in tree order", "if (hug.style.zIndex !== z) hug.style.zIndex = z;", "hug.style.zIndex=\"-1\";", "maintenance [light,1280w]/storage"],
    ["patches numbered by a page-wide count", "if (hug.style.zIndex !== z) hug.style.zIndex = z;",
      "if (!hug.style.zIndex) hug.style.zIndex = String(-1 - (window.__dgSeq = (window.__dgSeq || 0) + 1));", "dots-route [light,1280w]"],
  ];
  for (const [name, from, to, leg] of PLANTS) {
    const at = raw.indexOf(from);
    if (at < 0 || raw.indexOf(from, at + 1) >= 0) { checks++; fails++; console.log("  FAIL plant " + name + ": the line is not in the page once"); continue; }
    const file = path.join(plantLab, "plant.html");
    fs.writeFileSync(file, raw.slice(0, at) + to + raw.slice(at + from.length));
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--engine", file], { encoding: "utf8", timeout: 300000, env: Object.assign({}, process.env, { DOTS_GROUND_ONLY: leg, ETIUDA_PLANTS: "off" }) });
    const red = run.status !== 0 && /FAIL /.test(String(run.stdout));
    EXPECTED += 1;
    check(red, "plant " + name + " turns " + leg + " red in a scratch copy of the page");
  }
  E.removeLab(plantLab);
}
console.log("#counts checks=" + checks + " failed=" + fails + " notRun=" + notRun + " expected=" + EXPECTED);
console.log((fails ? "FAIL " : "PASS ") + "desk-dots-ground-only: " + (checks - fails) + "/" + checks + " checks" + (done ? "" : " - SUITE DID NOT COMPLETE"));
process.exit(done ? E.exitOf(fails) : 78);
