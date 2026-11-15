/* DOTTED GROUNDS ON THE DESK: NO MISSES AND CLEARED GROUND HUGS EACH LINE OF WORDS.
 * Chrome, headless, no fixtures, no window.
 *
 *   node tests/desk-dots-hug.mjs [--engine <file>]
 *
 * How an element is counted ("no miss"):
 *   Under each dotted ground (".sx-page" when a screen tab is open; "<main>" over ".dotfield"
 *   when the desk stage is shown), walk all visible DOM items:
 *     - one count per non-whitespace visible text node (excluding visually clipped SR-only nodes)
 *     - one count per visible icon (svg, img) not inside an interactive control
 *     - one count per visible interactive control (button, a, input, select, textarea,
 *       .chip, kbd, .btn, .seg, [role=button], .cell-chip, .count) with non-zero box size
 *   An element has an opaque ground if itself or an ancestor inside the dotted ground has
 *   background-color alpha >= 0.95 (using computed style, matching lib.js DG.scan). Any item
 *   without such an opaque ancestor is counted as a miss.
 *
 * What is checked across every screen with a dotted ground (empty desk, loaded desk with
 * footer / category separators / search miss, Settings and all its sections, Library and
 * all its sections, Maintenance and all its sections) in light & dark themes, EN & PL, and
 * two window widths (1280x800 and 560x850):
 *   (1) No miss: zero uncovered text nodes, icons or controls on any dotted ground
 *   (2) No wider than the words: every cleared text patch ends within the spread of its
 *       last letter on each rendered line (getClientRects vs Range), including named multi-line
 *       text whose last line is short
 *   (3) What the eye sees: on PNG screenshots in both themes beside a short last line, the
 *       count of dot pixels in a strip to its right equals the count in an untouched strip
 *       of identical size at the same modulo-16 grid phase
 *   (4) After live language switch (EN -> PL -> EN) and repaint: invariants hold and Polish
 *       words match UI_STRINGS.pl
 *   (5) Inline plant proof (skipped with NOT RUN when ETIUDA_PLANTS=off): disabling the
 *       hugging pass in a scratch copy turns the leg red.
 *
 * Exit code is the number of failed checks; 78 when the run could not complete.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
let fails = 0, checks = 0, notRun = 0, EXPECTED = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (!ok && detail !== undefined ? ": " + JSON.stringify(detail) : ""));
  if (!ok) fails++;
};
const skip = (what) => {
  notRun++;
  console.log("  NOT RUN " + what);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argv = process.argv.slice(2);
const at = argv.indexOf("--engine");
const ENGINE = at >= 0 ? path.resolve(argv[at + 1]) : E.ENGINE_PATH;

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-dots-hug-"));
const writeDeskFiles = (dir, htmlText, withCatalog) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "etiuda.html"), htmlText);
  if (withCatalog) {
    fs.writeFileSync(path.join(dir, "etiuda-catalog.js"),
      "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
  }
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
      for (const k of ["eTourDone_v3", "eTourInvite_v3", "eNameAsked"]) localStorage.setItem(k, "1");
      localStorage.setItem("eTheme", th);
      localStorage.setItem("eUiLang", lg);
      localStorage.setItem("eAgent", "Bench Agent");
    } catch (e) {}
  }, theme, lang);
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

/* Browser-side evaluator implementing ground scan (adapted from DG.scan) and line-hug geometry check. */
async function auditGround(p, screenLabel) {
  return p.evaluate((label) => {
    const sh = document.getElementById("screenHost");
    const screenOpen = sh && !sh.hidden && document.body.classList.contains("screen-on");
    const root = screenOpen ? sh.querySelector(".sx-page") : document.querySelector(".stage > .scroller main");
    if (!root) return { label, missingRoot: true, misses: [], wide: [], counts: { misses: 0, wide: 0 } };

    const alpha = (c) => {
      if (!c || c === "transparent") return 0;
      let m = c.match(/\/\s*([\d.]+%?)\s*\)/);
      if (m) return m[1].endsWith("%") ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
      m = c.match(/^rgba\(([^)]+)\)/);
      if (m) return parseFloat(m[1].split(",")[3]);
      return 1;
    };
    const opaqueBg = (e) => alpha(getComputedStyle(e).backgroundColor) >= 0.95;
    const isHiddenSR = (cs, r) => cs.clip === "rect(0px, 0px, 0px, 0px)" || cs.clipPath === "inset(50%)" || (r.width <= 1 && r.height <= 1);
    const vis = (e) => {
      if (!e || !e.getClientRects().length) return false;
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false;
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || isHiddenSR(cs, r)) return false;
      for (let p = e.parentElement; p && p !== root; p = p.parentElement) {
        if (p.hidden) return false;
        const pcs = getComputedStyle(p);
        if (pcs.display === "none" || pcs.visibility === "hidden" || +pcs.opacity === 0) return false;
        if (pcs.overflow === "hidden" || pcs.overflowX === "hidden" || pcs.overflowY === "hidden") {
          const pr = p.getBoundingClientRect();
          if (pr.width <= 0 || pr.height <= 0) return false;
        }
      }
      return true;
    };
    /* Effective opacity down from root: catches elements whose --bg is made translucent by parent opacity < 0.95 (except .card.is-hidden). */
    const effectiveOpaque = (el) => {
      let aTop = 1;
      for (let e = el; e && e !== root; e = e.parentElement) {
        const op = parseFloat(getComputedStyle(e).opacity);
        if (!Number.isNaN(op)) aTop *= op;
      }
      return aTop >= 0.95;
    };
    const onGround = (el) => {
      for (let e = el; e && e !== root; e = e.parentElement) {
        if (opaqueBg(e) && (e.closest(".card.is-hidden") || effectiveOpaque(e))) return false;
      }
      return true;
    };
    const CTRL = "button,a,input,select,textarea,.chip,kbd,.btn,.seg,[role=button],.cell-chip,.count";
    const ctrlOf = (el) => {
      const c = el.closest(CTRL);
      return c && c !== root && root.contains(c) ? c : null;
    };
    const desc = (e) => {
      if (!e) return "";
      return (e.tagName || "").toLowerCase() + (e.id ? "#" + e.id : "") +
        (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
    };

    const misses = [];
    const seenCtrl = new Set();
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      if (!n.nodeValue || !n.nodeValue.trim()) continue;
      const el = n.parentElement;
      if (!el || !vis(el) || !onGround(el)) continue;
      const c = ctrlOf(el);
      if (c) {
        if (!seenCtrl.has(c) && onGround(c)) {
          seenCtrl.add(c);
          misses.push({ kind: "control", el: desc(c), text: (c.textContent || "").trim().slice(0, 40) });
        }
        continue;
      }
      misses.push({ kind: "text", el: desc(el), text: n.nodeValue.trim().slice(0, 40) });
    }
    root.querySelectorAll("svg,img").forEach((e) => {
      if (!vis(e) || !onGround(e)) return;
      const c = ctrlOf(e);
      if (c) {
        if (!seenCtrl.has(c) && onGround(c)) {
          seenCtrl.add(c);
          misses.push({ kind: "control", el: desc(c), text: c.getAttribute("aria-label") || "" });
        }
        return;
      }
      misses.push({ kind: "icon", el: desc(e) });
    });
    root.querySelectorAll(CTRL).forEach((c) => {
      if (seenCtrl.has(c) || !vis(c) || !onGround(c)) return;
      seenCtrl.add(c);
      misses.push({ kind: "control", el: desc(c), text: (c.textContent || c.placeholder || "").trim().slice(0, 40) });
    });

    /* Check "no wider than the words" for every cleared text patch on the dotted ground. */
    const linesOf = (rects) => {
      const out = [];
      for (const r of rects) {
        if (r.width < 1 || r.height < 1) continue;
        const o = out.find((q) => Math.abs(q.y - r.top) < 4 && r.left <= q.x + q.w + 8 && r.right >= q.x - 8);
        if (o) {
          const x2 = Math.max(o.x + o.w, r.right), y2 = Math.max(o.y + o.h, r.bottom);
          o.x = Math.min(o.x, r.left);
          o.y = Math.min(o.y, r.top);
          o.w = x2 - o.x;
          o.h = y2 - o.y;
        } else {
          out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        }
      }
      return out;
    };
    const parseSpread = (cs) => {
      const bs = cs.boxShadow;
      if (!bs || bs === "none") return 0;
      const nums = bs.match(/-?\d+(?:\.\d+)?px/g);
      if (!nums || nums.length < 4) return 0;
      return Math.max(0, parseFloat(nums[3]));
    };

    const wide = [];
    const candidatePatches = [];
    root.querySelectorAll(".e-dot-hug").forEach((el) => {
      if (vis(el)) candidatePatches.push(el);
    });
    /* Also check bare block/table ground patches (like old display:table / block background:var(--bg) rules) on root. */
    const groundContainer = screenOpen ? (sh.querySelector(".sx") || root) : document.body;
    const groundBg = getComputedStyle(groundContainer).backgroundColor;
    root.querySelectorAll("*").forEach((el) => {
      if (el.classList.contains("e-dot-hug") || el.classList.contains("list-sep") || el.classList.contains("lw-name")) return;
      if (el.matches(CTRL) || el.closest(CTRL) || el.closest(".sx-card, .txt, .mt-sec, .mt-h, .lw-wheel, .lw-ct, .lw-name, .miss")) return;
      if (!vis(el)) return;
      const cs = getComputedStyle(el);
      if (alpha(cs.backgroundColor) >= 0.95 && cs.backgroundColor === groundBg) {
        /* Only check if it directly holds non-empty text nodes on the dotted ground. */
        let hasText = false;
        for (const cn of el.childNodes) if (cn.nodeType === 3 && cn.nodeValue.trim()) { hasText = true; break; }
        if (hasText && (el.parentElement === root || onGround(el.parentElement))) candidatePatches.push(el);
      }
    });

    for (const patch of candidatePatches) {
      /* Verify every line of text inside patch is wrapped by a rect ending within spread of that line's last letter. */
      const cs = getComputedStyle(patch);
      const spread = parseSpread(cs);
      const rg = document.createRange();
      rg.selectNodeContents(patch);
      const textLines = linesOf([...rg.getClientRects()]);
      const patchRects = [...patch.getClientRects()].map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
      if (!textLines.length || !patchRects.length) continue;

      /* For a block patch wrapping >= 2 lines, getClientRects() returns 1 big box; check every text line's right edge against the covering patch rect's right edge. */
      for (const tl of textLines) {
        const textRight = tl.x + tl.w;
        const covering = patchRects.filter((pr) => pr.y < tl.y + tl.h * 0.7 && pr.y + pr.h > tl.y + tl.h * 0.3 && pr.x <= textRight + 2 && pr.x + pr.w >= tl.x - 2);
        if (!covering.length) continue;
        const patchRight = Math.max(...covering.map((pr) => pr.x + pr.w));
        const overhang = patchRight - textRight;
        if (overhang > 6 || spread > 6) {
          wide.push({
            el: desc(patch),
            text: (patch.textContent || "").trim().slice(0, 40),
            lineCount: textLines.length,
            overhang: Math.round(overhang * 10) / 10,
            spread
          });
          break;
        }
      }
    }

    return {
      label,
      misses,
      wide,
      counts: { misses: misses.length, wide: wide.length, patches: candidatePatches.length }
    };
  }, screenLabel);
}

/* Measure a named multi-line note whose last line is short, and check inline box rects vs text range rects. */
async function checkShortLastLine(p, sel, expectMinLines) {
  return p.evaluate((s, minLines) => {
    const el = document.querySelector(s);
    if (!el) return { found: false };
    el.scrollIntoView({ block: "center" });
    const patch = el.querySelector(".e-dot-hug") || el;
    const rg = document.createRange();
    rg.selectNodeContents(patch);
    const linesOf = (rects) => {
      const out = [];
      for (const r of rects) {
        if (r.width < 1 || r.height < 1) continue;
        const o = out.find((q) => Math.abs(q.y - r.top) < 4 && r.left <= q.x + q.w + 8 && r.right >= q.x - 8);
        if (o) {
          const x2 = Math.max(o.x + o.w, r.right), y2 = Math.max(o.y + o.h, r.bottom);
          o.x = Math.min(o.x, r.left); o.y = Math.min(o.y, r.top); o.w = x2 - o.x; o.h = y2 - o.y;
        } else out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
      }
      return out;
    };
    const textLines = linesOf([...rg.getClientRects()]);
    const patchLines = linesOf([...patch.getClientRects()]);
    if (textLines.length < minLines) return { found: true, lineCount: textLines.length, tooFewLines: true };
    const first = textLines[0], last = textLines[textLines.length - 1];
    const lastCover = patchLines.filter((pr) => pr.y < last.y + last.h * 0.7 && pr.y + pr.h > last.y + last.h * 0.3);
    const patchRight = lastCover.length ? Math.max(...lastCover.map((pr) => pr.x + pr.w)) : 0;
    const textRight = last.x + last.w;
    const page = document.querySelector("#screenHost .sx-page");
    const pr = page ? page.getBoundingClientRect() : null;
    const cs = getComputedStyle(patch);
    const nums = cs.boxShadow && cs.boxShadow !== "none" ? cs.boxShadow.match(/-?\d+(?:\.\d+)?px/g) : null;
    const spread = nums && nums.length >= 4 ? Math.max(0, parseFloat(nums[3])) : 0;
    return {
      found: true,
      lineCount: textLines.length,
      firstW: Math.round(first.w),
      lastW: Math.round(last.w),
      overhang: Math.round((patchRight - textRight) * 10) / 10,
      spread,
      lastBox: { x: Math.round(last.x), y: Math.round(last.y), w: Math.round(last.w), h: Math.round(last.h) },
      firstBox: { x: Math.round(first.x), y: Math.round(first.y), w: Math.round(first.w), h: Math.round(first.h) },
      pageOrigin: pr ? { x: Math.round(pr.left), y: Math.round(pr.top), right: Math.round(pr.right), bottom: Math.round(pr.bottom) } : null
    };
  }, sel, expectMinLines);
}

/* Count dot pixels in a PNG (RGB differing from ground colour) using a helper canvas in browser. */
async function countDotPixels(decoder, pngBase64, groundRgb) {
  return decoder.evaluate((b64, g) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - g[0]) > 2 || Math.abs(d[i + 1] - g[1]) > 2 || Math.abs(d[i + 2] - g[2]) > 2) lit++;
      }
      resolve({ lit, pixels: cv.width * cv.height });
    };
    img.src = "data:image/png;base64," + b64;
  }), pngBase64, groundRgb);
}

async function eyeStripCheck(p, decoder, theme) {
  await p.setViewport({ width: 560, height: 850 });
  await p.evaluate(() => window.openScreenTab("settings"));
  await p.waitForSelector("#screenHost .sx-nav .sx-sec.on", { timeout: 10000 });
  await p.evaluate(() => {
    const a = document.querySelector('#screenHost .sx-nav .sx-sec[data-sx="data"]');
    if (a) a.click();
  });
  await sleep(300);
  const info = await checkShortLastLine(p, "#screenHost .sx-page p.lede", 2);
  if (!info || !info.found || info.tooFewLines || !info.pageOrigin) return { ok: false, reason: "no multi-line p.lede", info };

  const stripGeo = await p.evaluate((inf) => {
    const page = document.querySelector("#screenHost .sx-page");
    const cx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d");
    cx.fillStyle = getComputedStyle(document.querySelector("#screenHost .sx")).backgroundColor;
    cx.fillRect(0, 0, 1, 1);
    const groundRgb = Array.from(cx.getImageData(0, 0, 1, 1).data).slice(0, 3);

    const spread = Math.max(4, Math.ceil(inf.spread || 4));
    const ax = inf.lastBox.x + inf.lastBox.w + spread + 4;
    const ay = Math.max(inf.pageOrigin ? inf.pageOrigin.y : 0, inf.lastBox.y);
    const aw = Math.min(48, Math.max(24, (inf.firstBox.x + inf.firstBox.w) - ax));
    const ah = Math.min(20, Math.max(12, inf.lastBox.h));
    if (aw < 16 || ah < 12 || ay < 0 || ay + ah > window.innerHeight) return { ok: false, reason: "strip out of bounds or last line nearly full", ax, ay, aw, ah, inf };

    /* Find an untouched strip of the same size aligned to the exact same modulo-16 grid phase on page. */
    const pr = page.getBoundingClientRect();
    const ox = Math.round(pr.left), oy = Math.round(pr.top);
    const mod = (v, m) => ((v % m) + m) % m;
    const phaseX = mod(ax - ox, 16), phaseY = mod(ay - oy, 16);
    const yMin = Math.ceil(Math.max(0, pr.top)) + 16;
    const yMax = Math.floor(Math.min(window.innerHeight, pr.bottom)) - ah - 16;
    const xMin = Math.ceil(Math.max(0, pr.left)) + 16;
    const xMax = Math.floor(Math.min(window.innerWidth, pr.right)) - aw - 24;
    for (let y = yMax; y > yMin; y -= 16) {
      const uy = y + mod(phaseY - mod(y - oy, 16), 16);
      if (uy < yMin || uy > yMax) continue;
      for (let x = xMax; x > xMin; x -= 16) {
        const ux = x + mod(phaseX - mod(x - ox, 16), 16);
        if (ux < xMin || ux > xMax) continue;
        let clear = true;
        for (const [dx, dy] of [[0, 0], [aw / 2, 0], [aw - 1, 0], [0, ah / 2], [aw / 2, ah / 2], [aw - 1, ah / 2], [0, ah - 1], [aw / 2, ah - 1], [aw - 1, ah - 1]]) {
          if (document.elementFromPoint(ux + dx, uy + dy) !== page) { clear = false; break; }
        }
        if (clear) {
          return {
            ok: true,
            groundRgb,
            stripA: { x: ax, y: ay, width: aw, height: ah },
            stripB: { x: ux, y: uy, width: aw, height: ah }
          };
        }
      }
    }
    return { ok: false, reason: "no clear reference strip found" };
  }, info);

  if (!stripGeo.ok) return { ok: false, reason: stripGeo.reason, stripGeo, info };
  const pngA = await p.screenshot({ clip: stripGeo.stripA, encoding: "base64", captureBeyondViewport: false });
  const pngB = await p.screenshot({ clip: stripGeo.stripB, encoding: "base64", captureBeyondViewport: false });
  const cA = await countDotPixels(decoder, pngA, stripGeo.groundRgb);
  const cB = await countDotPixels(decoder, pngB, stripGeo.groundRgb);
  return {
    ok: cB.lit >= 1 && cA.lit === cB.lit,
    theme,
    besideLastLine: cA.lit,
    untouched: cB.lit,
    stripA: stripGeo.stripA,
    stripB: stripGeo.stripB,
    info
  };
}

let browser = null, decoder = null, done = false;
const summaryByScreen = {};
const record = (res) => {
  if (!res || res.missingRoot) return;
  summaryByScreen[res.label] = res.counts;
};

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  decoder = await browser.newPage();

  const rawHtml = fs.readFileSync(ENGINE, "utf8");
  const urlEmpty = writeDeskFiles(path.join(lab, "empty"), rawHtml, false);
  const urlFull = writeDeskFiles(path.join(lab, "full"), rawHtml, true);

  const walkDeskScreens = async (p, theme, lang, vpLabel) => {
    /* Settings: all sections */
    await p.evaluate(() => window.openScreenTab("settings"));
    await p.waitForSelector("#screenHost .sx-nav .sx-sec", { timeout: 10000 });
    await sleep(150);
    const sxKeys = await p.evaluate(() => Array.from(document.querySelectorAll("#screenHost .sx-nav .sx-sec")).map((x) => x.getAttribute("data-sx")));
    for (const k of sxKeys) {
      await p.evaluate((key) => { const b = document.querySelector('#screenHost .sx-nav .sx-sec[data-sx="' + key + '"]'); if (b) b.click(); }, k);
      await sleep(120);
      const res = await auditGround(p, "settings/" + k + " [" + theme + "," + lang + "," + vpLabel + "]");
      record(res);
      EXPECTED += 1;
      check(res.counts.misses === 0 && res.counts.wide === 0,
        "no miss & no wide ground on " + res.label, res.counts.misses || res.counts.wide ? { misses: res.misses.slice(0, 4), wide: res.wide.slice(0, 4) } : undefined);
    }

    /* Library: all sections + search miss */
    await p.evaluate(() => window.openManage());
    await p.waitForSelector("#screenHost .sx-nav .sx-sec[data-lm]", { timeout: 10000 });
    await sleep(150);
    const lmKeys = await p.evaluate(() => Array.from(document.querySelectorAll("#screenHost .sx-nav .sx-sec[data-lm]")).map((x) => x.getAttribute("data-lm")));
    for (const k of lmKeys) {
      await p.evaluate((key) => { const b = document.querySelector('#screenHost .sx-nav .sx-sec[data-lm="' + key + '"]'); if (b) b.click(); }, k);
      await sleep(120);
      const res = await auditGround(p, "library/" + k + " [" + theme + "," + lang + "," + vpLabel + "]");
      record(res);
      EXPECTED += 1;
      check(res.counts.misses === 0 && res.counts.wide === 0,
        "no miss & no wide ground on " + res.label, res.counts.misses || res.counts.wide ? { misses: res.misses.slice(0, 4), wide: res.wide.slice(0, 4) } : undefined);
    }

    /* Maintenance: all sections */
    await p.evaluate(() => window.openScreenTab("maintenance"));
    await p.waitForSelector("#screenHost .sx-nav .sx-sec[data-mt]", { timeout: 10000 });
    await sleep(150);
    const mtKeys = await p.evaluate(() => Array.from(document.querySelectorAll("#screenHost .sx-nav .sx-sec[data-mt]")).map((x) => x.getAttribute("data-mt")));
    for (const k of mtKeys) {
      await p.evaluate((key) => { const b = document.querySelector('#screenHost .sx-nav .sx-sec[data-mt="' + key + '"]'); if (b) b.click(); }, k);
      await sleep(120);
      const res = await auditGround(p, "maintenance/" + k + " [" + theme + "," + lang + "," + vpLabel + "]");
      record(res);
      EXPECTED += 1;
      check(res.counts.misses === 0 && res.counts.wide === 0,
        "no miss & no wide ground on " + res.label, res.counts.misses || res.counts.wide ? { misses: res.misses.slice(0, 4), wide: res.wide.slice(0, 4) } : undefined);
    }

    /* Close screen back to desk */
    await p.evaluate(() => { const b = document.getElementById("mtClose"); if (b) b.click(); });
    await sleep(120);
  };

  for (const theme of ["light", "dark"]) {
    /* 1. Empty desk in both languages and both window widths */
    for (const lang of ["en", "pl"]) {
      const p = await boot(browser, urlEmpty, theme, lang, false, { width: 1280, height: 800 });
      for (const [vpLabel, vp] of [["1280w", { width: 1280, height: 800 }], ["560w", { width: 560, height: 850 }]]) {
        await p.setViewport(vp);
        await sleep(150);
        const res = await auditGround(p, "empty-desk [" + theme + "," + lang + "," + vpLabel + "]");
        record(res);
        EXPECTED += 1;
        check(res.counts.misses === 0 && res.counts.wide === 0,
          "no miss & no wide ground on " + res.label, res.counts.misses || res.counts.wide ? { misses: res.misses.slice(0, 4), wide: res.wide.slice(0, 4) } : undefined);
      }
      await closePage(p);
    }

    /* 2. Loaded desk with sample-catalog in EN & PL, 1280w & 560w + search miss + every screen tab */
    for (const lang of ["en", "pl"]) {
      const p = await boot(browser, urlFull, theme, lang, true, { width: 1280, height: 800 });
      for (const [vpLabel, vp] of [["1280w", { width: 1280, height: 800 }], ["560w", { width: 560, height: 850 }]]) {
        await p.setViewport(vp);
        await sleep(150);

        /* Desk with cards (scroll to footer too so footer is verified) */
        const deskTop = await auditGround(p, "loaded-desk [" + theme + "," + lang + "," + vpLabel + "]");
        record(deskTop);
        EXPECTED += 1;
        check(deskTop.counts.misses === 0 && deskTop.counts.wide === 0,
          "no miss & no wide ground on " + deskTop.label, deskTop.counts.misses || deskTop.counts.wide ? { misses: deskTop.misses.slice(0, 4), wide: deskTop.wide.slice(0, 4) } : undefined);

        /* Desk search miss */
        await p.evaluate(() => {
          const q = document.getElementById("intent");
          if (q) { q.value = "zzzznohit999"; q.dispatchEvent(new Event("input", { bubbles: true })); }
        });
        await p.waitForFunction(() => !!document.querySelector("#list .empty"), { timeout: 10000 });
        await sleep(100);
        const deskMiss = await auditGround(p, "search-miss [" + theme + "," + lang + "," + vpLabel + "]");
        record(deskMiss);
        EXPECTED += 1;
        check(deskMiss.counts.misses === 0 && deskMiss.counts.wide === 0,
          "no miss & no wide ground on " + deskMiss.label, deskMiss.counts.misses || deskMiss.counts.wide ? { misses: deskMiss.misses.slice(0, 4), wide: deskMiss.wide.slice(0, 4) } : undefined);
        await p.evaluate(() => {
          const q = document.getElementById("intent");
          if (q) { q.value = ""; q.dispatchEvent(new Event("input", { bubbles: true })); }
        });
        await p.waitForFunction(() => document.querySelectorAll("#list .card").length > 0, { timeout: 10000 });
        await sleep(100);

        /* All Settings, Library, Maintenance sections at this viewport */
        await walkDeskScreens(p, theme, lang, vpLabel);
      }
      await closePage(p);
    }

    /* 3. Named short-last-line check + visual pixel dot-count check in this theme */
    const pEye = await boot(browser, urlFull, theme, "en", true, { width: 560, height: 850 });
    const eye = await eyeStripCheck(pEye, decoder, theme);
    EXPECTED += 2;
    check(!!(eye.info && eye.info.found && !eye.info.tooFewLines && eye.info.lastW < eye.info.firstW - 20 && eye.info.overhang <= 6),
      theme + " named two-line short-last-line p.lede hugs each line", eye.info);
    check(!!eye.ok,
      theme + " screenshot dot pixels directly right of short last line equal untouched strip", eye);
    await closePage(pEye);
  }

  /* 4. Live language switch (EN -> PL -> EN) + repaint invariants & Polish table check */
  const uiLangSrc = fs.readFileSync(path.join(E.ROOT, "src", "modules", "ui-lang.js"), "utf8");
  const plKey = (k) => {
    const m = uiLangSrc.match(new RegExp(JSON.stringify(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '\\s*:\\s*"([^"]+)"'));
    return m ? m[1] : null;
  };
  const wantSettingsPl = plKey("Settings");
  const wantCreatedByPl = plKey("Created by");
  const wantPersonalPl = plKey("· free for personal use");
  const pLang = await boot(browser, urlFull, "light", "en", true, { width: 560, height: 850 });
  await pLang.evaluate(() => window.openScreenTab("settings"));
  await pLang.waitForSelector("#setUiLang", { timeout: 10000 });
  await pLang.evaluate(() => {
    const sel = document.getElementById("setUiLang");
    sel.value = "pl";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(300);
  const plCheck = await pLang.evaluate((want, createdPl, persPl) => {
    const h2 = document.querySelector("#screenHost .sx-page h2");
    const got = h2 ? h2.textContent.trim() : "";
    const ft = document.querySelector("footer");
    const ftTxt = ft ? ft.textContent : "";
    return {
      h2MatchesTable: !!want && got === want,
      footerMatchesTable: !!(createdPl && persPl && ftTxt.includes(createdPl) && ftTxt.includes(persPl)),
      got, want
    };
  }, wantSettingsPl, wantCreatedByPl, wantPersonalPl);
  const resPlAfterSwitch = await auditGround(pLang, "settings-after-en-to-pl");
  await pLang.evaluate(() => {
    const sel = document.getElementById("setUiLang");
    if (sel) { sel.value = "en"; sel.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await sleep(300);
  const enCheck = await pLang.evaluate(() => {
    const h2 = document.querySelector("#screenHost .sx-page h2");
    return { h2En: h2 ? h2.textContent.trim() === "Settings" : false, text: h2 ? h2.textContent.trim() : "" };
  });
  const resEnAfterSwitch = await auditGround(pLang, "settings-after-pl-to-en");
  EXPECTED += 4;
  check(plCheck.h2MatchesTable && plCheck.footerMatchesTable, "live switch EN -> PL translates Settings heading & footer from UI_STRINGS.pl", plCheck);
  check(resPlAfterSwitch.counts.misses === 0 && resPlAfterSwitch.counts.wide === 0, "no miss & no wide ground after live switch EN -> PL", resPlAfterSwitch);
  check(enCheck.h2En, "live switch PL -> EN restores Settings heading", enCheck);
  check(resEnAfterSwitch.counts.misses === 0 && resEnAfterSwitch.counts.wide === 0, "no miss & no wide ground after live switch PL -> EN", resEnAfterSwitch);
  await closePage(pLang);

  /* 5. Measure hug pass time on Library with sample-catalog loaded (must be < 2 ms) */
  const pPerf = await boot(browser, urlFull, "light", "en", true, { width: 1280, height: 800 });
  await pPerf.evaluate(() => window.openManage());
  await pPerf.waitForSelector("#screenHost .sx-page", { timeout: 10000 });
  await sleep(250);
  const perfMs = await pPerf.evaluate(() => {
    const host = document.getElementById("screenHost");
    if (!host || typeof window.hugDottedGround !== "function") return null;
    /* Unwrap once and flush layout before timing cold first-paint pass, then 10 idempotent passes. */
    host.querySelectorAll(".e-dot-hug").forEach((s) => {
      if (s.tagName === "SPAN" && !s.matches("button,a,.btn,.seg,.chip,kbd")) {
        while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s);
        s.remove();
      } else s.classList.remove("e-dot-hug");
    });
    void host.offsetHeight;
    const tc0 = performance.now();
    window.hugDottedGround(host);
    const coldMs = Math.round((performance.now() - tc0) * 1000) / 1000;
    const runs = [];
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      window.hugDottedGround(host);
      runs.push(performance.now() - t0);
    }
    runs.sort((a, b) => a - b);
    const totalEls = host.querySelectorAll("*").length;
    return { coldMs, medianMs: Math.round(runs[5] * 1000) / 1000, maxMs: Math.round(runs[9] * 1000) / 1000, totalEls };
  });
  console.log("#perf " + JSON.stringify(perfMs));
  EXPECTED += 1;
  check(!!perfMs && perfMs.coldMs < 2.0 && perfMs.medianMs < 2.0, "Library hug pass adds < 2 ms per paint", perfMs);
  await closePage(pPerf);

  /* 6. Inline plant proof: strip the hugging pass in a scratch copy and verify red */
  EXPECTED += 1;
  if (PLANTS_OFF) {
    skip("plant-no-hug-pass: disabling hugDottedGround turns the leg red (ETIUDA_PLANTS=off)");
  } else {
    const plantedHtml = rawHtml.replace(/function hugDottedGround\s*\([^)]*\)\s*\{/, "function hugDottedGround(){ return 0;");
    if (plantedHtml === rawHtml) {
      check(false, "plant-no-hug-pass: could not locate hugDottedGround to plant");
    } else {
      const plantUrl = writeDeskFiles(path.join(lab, "plant"), plantedHtml, true);
      const pp = await boot(browser, plantUrl, "light", "en", true, { width: 560, height: 850 });
      await pp.evaluate(() => window.openScreenTab("settings"));
      await pp.waitForSelector("#screenHost .sx-page", { timeout: 10000 });
      await sleep(200);
      const plantRes = await auditGround(pp, "plant-settings");
      check(plantRes.counts.misses > 0 || plantRes.counts.wide > 0,
        "plant-no-hug-pass: removing the pass causes misses/wide boxes", plantRes.counts);
      await closePage(pp);
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
if (done && checks + notRun !== EXPECTED) {
  console.log("  FAIL ran " + (checks + notRun) + " checks, expected " + EXPECTED);
  fails++;
}
const byThemeScreen = {};
for (const [lbl, cnt] of Object.entries(summaryByScreen)) {
  const m = lbl.match(/^([^ ]+)\s+\[(light|dark),/);
  if (!m) continue;
  const k = m[2] + ":" + m[1].split("/")[0];
  if (!byThemeScreen[k]) byThemeScreen[k] = { misses: 0, wide: 0, screens: 0 };
  byThemeScreen[k].misses += cnt.misses;
  byThemeScreen[k].wide += cnt.wide;
  byThemeScreen[k].screens++;
}
console.log("#summary " + JSON.stringify(byThemeScreen));
console.log("#counts checks=" + checks + " failed=" + fails + " notRun=" + notRun + " expected=" + EXPECTED);
console.log((fails ? "FAIL " : "PASS ") + "desk-dots-hug: " + (checks - (fails > checks ? checks : fails)) + "/" + checks + " checks" + (notRun ? ", " + notRun + " NOT RUN" : "") + (done ? "" : " - SUITE DID NOT COMPLETE"));
process.exit(done ? E.exitOf(fails) : 78);
