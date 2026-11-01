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
 * WHAT IT READS. Landing is read from the pixels, by area: each theme's palette is taken from a
 * screenshot of a fresh start in that theme (every colour, quantised to 32 levels a channel, that
 * covers at least 3 per cent of the window and under 1 per cent of the other's), and a press has
 * landed when, 600 ms after it (past the colours' longest tier), the window's own screenshot is
 * at least half the asked theme's palette by area and at most 2 per cent the other's. The stored
 * choice is read from storage, and tf2 counts calls and classes, which no picture shows.
 *
 * LEGS
 *   tf1  every category in turn, pressed by a real click, then the theme button by a real click:
 *        the page lives and its window is painted in the theme asked for, by area, and the choice
 *        is stored
 *   tf2  no press opened a view transition, and nothing on the root cuts the controls' transitions
 *   tf3  two presses 60 ms apart, the second while the first's colours still ease: the second is
 *        taken, the window is painted back in the theme it started from, by area, and that is
 *        what is stored
 *
 * The catalog is the shipped sample beside the page, so nothing here is content. Exit code is the
 * number of failed checks; 78 when the run could not complete.
 */
import fs from "node:fs";
import os from "node:os";
import zlib from "node:zlib";
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
/* 8-bit RGB or RGBA, as tests/smoke.js pngPixels reads it; anything else throws, so it cannot pass unread. */
const pngPixels = b64 => {
  const buf = Buffer.from(b64, "base64"), idat = []; let at = 8, w = 0, h = 0, bpp = 0;
  while (at < buf.length) {
    const n = buf.readUInt32BE(at), t = buf.toString("latin1", at + 4, at + 8);
    if (t === "IHDR") {
      w = buf.readUInt32BE(at + 8); h = buf.readUInt32BE(at + 12);
      if (buf[at + 16] !== 8 || (buf[at + 17] !== 2 && buf[at + 17] !== 6) || buf[at + 20] !== 0) throw new Error("png: not 8-bit RGB or RGBA, or interlaced");
      bpp = buf[at + 17] === 6 ? 4 : 3;
    }
    if (t === "IDAT") idat.push(buf.subarray(at + 8, at + 8 + n));
    at += 12 + n;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0,
        c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) throw new Error("png: filter " + f);
      out[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + p) & 255;
    }
  }
  return { w: w, h: h, bpp: bpp, px: out };
};
// Share of the window's area in each colour, quantised to 32 levels a channel.
const areas = b64 => {
  const P = pngPixels(b64), m = new Map(), n = P.w * P.h;
  for (let i = 0; i < P.px.length; i += P.bpp) {
    const k = (P.px[i] >> 3) << 10 | (P.px[i + 1] >> 3) << 5 | (P.px[i + 2] >> 3);
    m.set(k, (m.get(k) || 0) + 1);
  }
  m.forEach((v, k) => m.set(k, v / n));
  return m;
};
const shareIn = (m, set) => { let s = 0; m.forEach((v, k) => { if (set.has(k)) s += v; }); return s; };

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

  /* EACH THEME'S PALETTE, from a fresh start in it, each in its own context, before the page under test opens. */
  const palette = {};
  for (const th of ["light", "dark"]) {
    const ctx = await browser.createBrowserContext();
    const r = await ctx.newPage();
    await r.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
    await r.evaluateOnNewDocument(t => {
      try {
        localStorage.setItem("eTourDone_v3", "1"); localStorage.setItem("eTourInvite_v3", "1");
        localStorage.setItem("eAgent", "Invented Agent"); localStorage.setItem("eNameAsked", "1"); localStorage.setItem("eTheme", t);
      } catch (x) {}
    }, th);
    await r.goto(url, { waitUntil: "load", timeout: 60000 });
    await require("./launch-wait.js").waitLaunchGone(r, { who: "tests/theme-fade.mjs palette" });
    await settled(r);
    await r.mouse.move(4, 990);
    await sleep(FADE_WAIT);
    palette[th] = areas(await r.screenshot({ encoding: "base64", captureBeyondViewport: false }));
    await ctx.close().catch(() => {});
  }
  const own = (a, b) => new Set([...a.entries()].filter(([k, v]) => v >= 0.03 && (b.get(k) || 0) < 0.01).map(([k]) => k));
  const sets = { light: own(palette.light, palette.dark), dark: own(palette.dark, palette.light) };
  if (!sets.light.size || !sets.dark.size) throw new Error("a theme's palette came out empty: " + sets.light.size + " light, " + sets.dark.size + " dark colour(s)");
  const LANDED_MIN = 0.5, OTHER_MAX = 0.02;
  const painted = async (pg, want) => {
    const m = areas(await pg.screenshot({ encoding: "base64", captureBeyondViewport: false }));
    const mine = shareIn(m, sets[want]), other = shareIn(m, sets[want === "dark" ? "light" : "dark"]);
    return { ok: mine >= LANDED_MIN && other <= OTHER_MAX, mine: Math.round(mine * 100), other: Math.round(other * 1000) / 10 };
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
  let pressed = 0, landed = 0, stored = 0, firstDeath = "", least = 100, most = 0;
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
    const got = await Promise.race([q.evaluate(() => localStorage.getItem("eTheme")), sleep(8000).then(() => false)]);
    if (got === false) { firstDeath = "category " + (k + 1) + " of " + nPills + " (no answer in 8 s)"; crashed = true; break; }
    await q.mouse.move(4, 990);
    const seen = await painted(q, want);
    least = Math.min(least, seen.mine); most = Math.max(most, seen.other);
    if (seen.ok) landed++;
    if (got === want) stored++;
  }
  check(!crashed && nPills >= 10 && landed === nPills && stored === nPills,
    "tf1 a category pressed, then the theme: the page lives through every press, its window painted in the theme asked for by area, and stored ("
    + JSON.stringify({ categories: nPills, pressed, landed, stored, died: firstDeath || "no", leastOwnPct: least, mostOtherPct: most,
      palette: [sets.light.size, sets.dark.size] }) + ")");
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
  await q.mouse.move(4, 990);
  const backSeen = await painted(q, from), backStored = await q.evaluate(() => localStorage.getItem("eTheme"));
  check(!crashed && backSeen.ok && backStored === from,
    "tf3 two presses 60 ms apart: the second is taken, the window is painted back in " + from + " by area, and that is stored ("
    + JSON.stringify({ ownPct: backSeen.mine, otherPct: backSeen.other, stored: backStored }) + ")");
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
