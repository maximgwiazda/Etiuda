/* Every focusable control draws a 2 px solid :focus-visible outline (>= 3:1 contrast) in both
 * themes, pointer clicks draw no outline, tabs on the band use --band-ink, and only the two
 * allowlisted exceptions keep outline:none on keyboard focus.
 *
 *   node tests/desk-focus-ring.mjs
 *
 * Headless Chrome on the built engine page with the shipped sample catalog.
 * ETIUDA_PLANTS=off skips the inline plant check with a NOT RUN line.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 15;
let fails = 0, checks = 0, skipped = 0;

function check(ok, what, detail) {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
}
function notRun(what) {
  skipped++;
  console.log("  NOT RUN " + what);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fileUrl = p => "file:///" + p.replace(/\\/g, "/");

/* Allowlist of controls permitted to keep outline:none on keyboard focus, verified by their own mark:
 *   1. text-field : input (text/search/url/email/tel/password/number/untyped) and textarea keep their
 *      2 px inset --accent underline (box-shadow on the control or its .field-wrap/.combo/.sx-search
 *      wrapper, or the white focus ring on .bub prompt inputs).
 *   2. menu-row   : arrow-navigated open menu rows (.menu button) keep their --menu-mark fill,
 *      matching Studio's .menu-list .mi.
 */
const ALLOWLIST_REASONS = {
  "text-field": "text fields keep their 2 px inset --accent foot instead of an outline ring",
  "menu-row": "arrow-navigated rows of an open menu (.menu button) keep their fill, matching Studio .menu-list .mi"
};

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-focus-ring-"));
const dirMain = path.join(lab, "main");
const dirPlant = path.join(lab, "plant");
fs.mkdirSync(dirMain, { recursive: true });
fs.mkdirSync(dirPlant, { recursive: true });

const sampleJs = "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n";
fs.copyFileSync(E.ENGINE_PATH, path.join(dirMain, "etiuda.html"));
fs.writeFileSync(path.join(dirMain, "etiuda-catalog.js"), sampleJs, "utf8");
fs.writeFileSync(path.join(dirPlant, "etiuda-catalog.js"), sampleJs, "utf8");

async function launch() {
  return puppeteer.launch({
    executablePath: E.browserPath("chrome"),
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--window-size=1280,860"]
  });
}

async function openDesk(browser, url, theme) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
    { name: "prefers-color-scheme", value: theme }
  ]);
  await page.evaluateOnNewDocument(th => {
    try {
      localStorage.setItem("eTheme", th);
      localStorage.setItem("eTourDone", "1");
    } catch (_) {}
  }, theme);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector("#list .card", { timeout: 10000 }).catch(() => null);
  await sleep(120);
  // Accept sample catalog if offered and dismiss first-run tour so desk has cards and tabs ready.
  for (let i = 0; i < 4; i++) {
    const ecYes = await page.$("#ecYes");
    if (ecYes) { await page.click("#ecYes").catch(() => {}); await sleep(120); }
    const tourSkip = await page.$("#tourSkip");
    if (tourSkip) { await page.click("#tourSkip").catch(() => {}); await sleep(80); }
  }
  await page.waitForSelector("#list .card", { timeout: 6000 }).catch(() => null);
  await page.evaluate(th => {
    document.documentElement.setAttribute("data-theme", th);
  }, theme);
  await sleep(60);
  return page;
}

/* Browser-side evaluator for the currently focused element: returns its selector, exception check,
 * computed outline metrics, computed composited ground behind the ring, and WCAG contrast ratio. */
async function inspectActive(page, surfaceName) {
  return page.evaluate((surface, allowReasons) => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) {
      return { leftPage: true };
    }

    function parseColor(s) {
      if (!s || s === "transparent") return [0, 0, 0, 0];
      const t = s.trim();
      let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(t);
      if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
      m = /^color\(\s*srgb\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)(?:\s*\/\s*([\d.eE+-]+))?\s*\)$/.exec(t);
      if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] === undefined ? 1 : Number(m[4])];
      if (!window.__clrCtx) {
        const cv = document.createElement("canvas");
        cv.width = 1; cv.height = 1;
        window.__clrCtx = cv.getContext("2d", { willReadFrequently: true });
      }
      const ctx = window.__clrCtx;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillStyle = t;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    }
    function over(fg, bg) {
      if (!fg) return bg;
      const a = fg[3];
      if (a <= 0) return bg;
      if (a >= 1) return [fg[0], fg[1], fg[2], 1];
      return [
        fg[0] * a + bg[0] * (1 - a),
        fg[1] * a + bg[1] * (1 - a),
        fg[2] * a + bg[2] * (1 - a),
        1
      ];
    }
    function lum(c) {
      const f = v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    }
    function contrast(c1, c2) {
      const l1 = lum(c1), l2 = lum(c2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    function cssColor(c) {
      return "rgb(" + Math.round(c[0]) + ", " + Math.round(c[1]) + ", " + Math.round(c[2]) + ")";
    }

    function describeSelector(node) {
      const tag = node.tagName.toLowerCase();
      if (node.id) return surface + " > #" + node.id;
      const cls = [...node.classList].slice(0, 3).map(c => "." + c).join("");
      const attrs = [];
      for (const a of ["data-act", "data-open", "data-sx", "data-sort-col", "name", "type"]) {
        if (node.hasAttribute(a)) attrs.push("[" + a + '="' + node.getAttribute(a) + '"]');
      }
      const txt = (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
      const label = attrs.join("") + (txt ? ' ("' + txt + '")' : "");
      return surface + " > " + tag + cls + label;
    }

    function exceptionKind(node) {
      const tag = node.tagName.toLowerCase();
      if (tag === "textarea") return "text-field";
      if (tag === "input") {
        const tp = (node.getAttribute("type") || "text").toLowerCase();
        if (!["checkbox", "radio", "range", "button", "submit", "reset", "file", "color"].includes(tp)) {
          return "text-field";
        }
      }
      if (node.matches(".menu button, .menu.e-ctx button")) return "menu-row";
      return null;
    }

    function hasInsetFoot(node) {
      const own = getComputedStyle(node).boxShadow || "";
      if (/inset/.test(own) && /-2px/.test(own)) return true;
      const wrap = node.closest(".field-wrap, .combo, .sx-search");
      if (wrap) {
        const ws = getComputedStyle(wrap).boxShadow || "";
        if (/inset/.test(ws) && /-2px/.test(ws)) return true;
      }
      const cs = getComputedStyle(node);
      if (cs.outlineStyle === "solid" && parseFloat(cs.outlineWidth) >= 2) return true;
      return false;
    }

    const cs = getComputedStyle(el);
    const kind = exceptionKind(el);
    const sel = describeSelector(el);
    const outlineStyle = cs.outlineStyle;
    const outlineWidth = parseFloat(cs.outlineWidth) || 0;
    const outlineOffset = parseFloat(cs.outlineOffset) || 0;
    const focusVisible = el.matches(":focus-visible");

    if (kind === "text-field") {
      const okFoot = hasInsetFoot(el);
      const noRing = outlineStyle === "none" || outlineWidth === 0 || el.matches(".bub input");
      return {
        sel,
        focusVisible,
        exception: kind,
        exceptionReason: allowReasons[kind],
        ok: okFoot && noRing,
        detail: { okFoot, outlineStyle, outlineWidth }
      };
    }

    if (kind === "menu-row") {
      const bg = parseColor(cs.backgroundColor) || [0, 0, 0, 0];
      const menu = el.closest(".menu");
      const menuBg = parseColor(menu ? getComputedStyle(menu).backgroundColor : "") || [0, 0, 0, 0];
      const mark = parseColor(getComputedStyle(document.documentElement).getPropertyValue("--menu-mark"));
      const hasFill = bg[3] > 0.05 && (
        cssColor(bg) !== cssColor(menuBg) ||
        (mark && cssColor(bg) === cssColor(mark))
      );
      const noRing = outlineStyle === "none" || outlineWidth === 0;
      return {
        sel,
        focusVisible,
        exception: kind,
        exceptionReason: allowReasons[kind],
        ok: hasFill && noRing,
        detail: { bg: cs.backgroundColor, menuBg: menu ? getComputedStyle(menu).backgroundColor : null, outlineStyle, outlineWidth }
      };
    }

    // Standard control: must draw a solid 2 px outline with >= 3:1 WCAG contrast against ground behind it.
    const chain = [];
    const topNode = outlineOffset < 0 ? el : (el.parentElement || document.documentElement);
    for (let cur = topNode; cur; cur = cur.parentElement) chain.unshift(cur);

    let ground = [0, 0, 0, 1];
    const rootBg = parseColor(getComputedStyle(document.documentElement).backgroundColor);
    const bodyBg = parseColor(getComputedStyle(document.body).backgroundColor);
    if (rootBg && rootBg[3] > 0) ground = over(rootBg, ground);
    if (bodyBg && bodyBg[3] > 0) ground = over(bodyBg, ground);

    for (const node of chain) {
      if (node === document.documentElement || node === document.body) continue;
      // Pseudo ::before paints the band background on .row.
      if (node.classList && node.classList.contains("row")) {
        const bcol = parseColor(getComputedStyle(node, "::before").backgroundColor);
        if (bcol) ground = over(bcol, ground);
      }
      const ncol = parseColor(getComputedStyle(node).backgroundColor);
      if (ncol) ground = over(ncol, ground);
    }

    const ringRaw = parseColor(cs.outlineColor);
    const ring = ringRaw ? over(ringRaw, ground) : null;
    const ratio = ring ? contrast(ring, ground) : 0;
    const isSolid2 = focusVisible && outlineStyle === "solid" && Math.abs(outlineWidth - 2) <= 0.05;
    const ok = isSolid2 && ratio >= 3.0;

    return {
      sel,
      focusVisible,
      exception: null,
      ok,
      outlineStyle,
      outlineWidth,
      outlineOffset,
      ringColor: cs.outlineColor,
      groundColor: cssColor(ground),
      ratio: Number(ratio.toFixed(2)),
      onTab: el.classList.contains("tab") || el.classList.contains("tab-label"),
      tag: el.tagName.toLowerCase(),
      id: el.id || ""
    };
  }, surfaceName, ALLOWLIST_REASONS);
}

/* Return ordered list of visible focusable descriptors inside containerSelector so we know when
 * a full Tab sweep across that surface is finished. */
async function collectSurfaceFocusables(page, containerSelector) {
  return page.evaluate(scopeSel => {
    const scope = scopeSel === "document" ? document : document.querySelector(scopeSel);
    if (!scope) return [];
    const cand = [...scope.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'
    )];
    const out = [];
    for (const el of cand) {
      if (el.hasAttribute("inert") || el.closest("[inert],[hidden]")) continue;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (el.tabIndex < 0) continue;
      if (scopeSel === "document") {
        // Ignore modals/overlays when checking base page unless visible.
        if (el.closest("#modal[hidden], #settingsMenu[hidden], #screenHost[hidden], #factsPanel[hidden]")) continue;
      }
      out.push(true);
    }
    return out.length;
  }, containerSelector);
}

/* Walk controls on a surface via real Tab presses. Focus starts at anchorSelector (or clears focus)
 * and advances with Tab until focus returns to the first visited control or exceeds maxSteps. */
async function walkSurfaceWithTabs(page, surfaceName, scopeSelector, options = {}) {
  const maxSteps = options.maxSteps || 220;
  const failures = [];
  const exceptionsSeen = [];
  const results = [];
  const seen = new Set();

  // Reset sequential focus starting point to top of document.
  let removeTempMarker = false;
  if (options.focusFirstInside) {
    await page.evaluate(sel => {
      const host = document.querySelector(sel);
      if (!host) return;
      host.setAttribute("tabindex", "-1");
      host.focus({ preventScroll: true });
    }, scopeSelector);
  } else if (!options.keepFocus) {
    removeTempMarker = true;
    await page.evaluate(() => {
      const prev = document.getElementById("__focusStartMarker");
      if (prev) prev.remove();
      const m = document.createElement("span");
      m.id = "__focusStartMarker";
      m.tabIndex = -1;
      document.body.prepend(m);
      m.focus({ preventScroll: true });
    });
  }

  let firstKey = null;
  let tabChecks = 0;
  for (let step = 0; step < maxSteps; step++) {
    await page.keyboard.press("Tab");
    if (removeTempMarker) {
      removeTempMarker = false;
      await page.evaluate(() => {
        const m = document.getElementById("__focusStartMarker");
        if (m) m.remove();
      });
    }
    const info = await inspectActive(page, surfaceName);
    if (info.leftPage) break;

    const inside = await page.evaluate(sel => {
      if (sel === "document") {
        const modal = document.getElementById("modal");
        const scr = document.getElementById("screenHost");
        const menu = document.getElementById("settingsMenu");
        if (modal && !modal.hidden && modal.contains(document.activeElement)) return false;
        if (scr && !scr.hidden && scr.contains(document.activeElement)) return false;
        if (menu && !menu.hidden && menu.contains(document.activeElement)) return false;
        return true;
      }
      const root = document.querySelector(sel);
      return !!(root && root.contains(document.activeElement));
    }, scopeSelector);

    if (!inside) {
      // On document walk we stop if focus wraps into host overlays; otherwise continue or stop once seen.
      if (results.length > 0 && options.stopOutside !== false) break;
      continue;
    }

    const key = info.sel + "#" + (info.id || step);
    // Use element reference equality in page context for exact loop detection.
    const repeat = await page.evaluate(() => {
      if (!window.__focusSeen) window.__focusSeen = new Set();
      const ae = document.activeElement;
      if (window.__focusSeen.has(ae)) return true;
      window.__focusSeen.add(ae);
      return false;
    });
    if (repeat) break;

    if (!firstKey) firstKey = key;
    tabChecks++;
    results.push(info);
    if (info.exception) exceptionsSeen.push(info);
    if (!info.ok) failures.push(info);
    if (options.limit && results.length >= options.limit) break;
  }

  await page.evaluate(() => { delete window.__focusSeen; });
  return { results, failures, exceptionsSeen, tabChecks };
}

async function runThemeSuite(browser, enginePath, theme, opts = {}) {
  const url = fileUrl(enginePath);
  const page = await openDesk(browser, url, theme);
  const allFailures = [];
  const allExceptions = [];
  const surfaceSummary = {};

  try {
    // Ensure at least two tabs exist so inactive + active .tab and .tab-x sit on the band.
    const tabAdd = await page.$(".tab-add");
    if (tabAdd) {
      await page.click(".tab-add");
      await sleep(80);
    }

    // 1. Main page (band, tabs, header, pills, rail, cards).
    const mainWalk = await walkSurfaceWithTabs(page, theme + ":main", "document", { maxSteps: 260 });
    surfaceSummary.main = mainWalk.results.length;
    allFailures.push(...mainWalk.failures);
    allExceptions.push(...mainWalk.exceptionsSeen);

    if (!opts.mainOnly) {
      // Extra check in each theme: tab ring on the band equals --band-ink, not --accent.
      const tabRingCheck = await page.evaluate(async () => {
        const rs = getComputedStyle(document.documentElement);
        const bandInk = rs.getPropertyValue("--band-ink").trim();
        const accent = rs.getPropertyValue("--accent").trim();
        // Convert var values using a probe span so RGB comparison is canonical.
        const probe = colorStr => {
          const d = document.createElement("span");
          d.style.color = colorStr;
          document.body.appendChild(d);
          const v = getComputedStyle(d).color;
          d.remove();
          return v;
        };
        return { bandInk: probe(bandInk), accent: probe(accent) };
      });
      // Tab onto an inactive .tab-label on the band and read its computed outlineColor.
      await page.evaluate(() => {
        const prev = document.getElementById("__focusStartMarker");
        if (prev) prev.remove();
        const m = document.createElement("span");
        m.id = "__focusStartMarker";
        m.tabIndex = -1;
        document.body.prepend(m);
        m.focus({ preventScroll: true });
      });
      let tabInfo = null;
      for (let i = 0; i < 16; i++) {
        await page.keyboard.press("Tab");
        if (i === 0) {
          await page.evaluate(() => { const m = document.getElementById("__focusStartMarker"); if (m) m.remove(); });
        }
        tabInfo = await page.evaluate(() => {
          const ae = document.activeElement;
          const tabEl = ae && ae.closest ? ae.closest(".tab") : null;
          if (ae && ae.classList && ae.classList.contains("tab-label") && tabEl && !tabEl.classList.contains("on")) {
            const cs = getComputedStyle(ae);
            return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor };
          }
          return null;
        });
        if (tabInfo) break;
      }
      check(
        !!tabInfo && tabInfo.outlineStyle === "solid" && tabInfo.outlineWidth === "2px" &&
          tabInfo.outlineColor === tabRingCheck.bandInk && tabInfo.outlineColor !== tabRingCheck.accent,
        theme + ": tab focus ring on the band uses --band-ink (" + tabRingCheck.bandInk + "), not --accent (" + tabRingCheck.accent + ")",
        { tabInfo, tabRingCheck }
      );

      // Extra check: pointer press on a button draws no outline.
      await page.mouse.click(0, 0).catch(() => {});
      const btnBox = await page.$eval("#factsBtn", el => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.click(btnBox.x, btnBox.y);
      await sleep(60);
      const pointerRing = await page.evaluate(() => {
        const ae = document.activeElement;
        if (!ae) return null;
        const cs = getComputedStyle(ae);
        return {
          id: ae.id,
          focusVisible: ae.matches(":focus-visible"),
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth
        };
      });
      check(
        !!pointerRing && !pointerRing.focusVisible &&
          (pointerRing.outlineStyle === "none" || pointerRing.outlineWidth === "0px"),
        theme + ": pointer press on a button draws no outline",
        pointerRing
      );
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(50);

      // 2. Menu (#settingsMenu) opened via keyboard so menu items own focus + arrow-key menu-row fill check.
      await page.focus("#settingsBtn");
      await page.keyboard.press("Enter");
      await page.waitForSelector("#settingsMenu:not([hidden])", { timeout: 3000 });
      await sleep(80);
      await page.keyboard.press("ArrowDown");
      const menuArrowCheck = await inspectActive(page, theme + ":menu");
      check(
        menuArrowCheck.exception === "menu-row" && menuArrowCheck.ok,
        theme + ": arrow-navigated open menu row keeps its fill (--menu-mark) and outline:none",
        menuArrowCheck
      );
      const menuWalk = await walkSurfaceWithTabs(page, theme + ":menu", "#settingsMenu", { keepFocus: true, maxSteps: 40 });
      surfaceSummary.menu = menuWalk.results.length + 1;
      allFailures.push(...menuWalk.failures);
      allExceptions.push(...menuWalk.exceptionsSeen);
      await page.keyboard.press("Escape");
      await sleep(80);

      // 3. Settings screen (#screenHost), with the organisation's model in force so the AI section shows the person's own switch for
      // rewording (aireword), which the walk must reach by keyboard like every other control.
      await page.evaluate(() => {
        const free = { choice: false, provider: false, endpoint: false, model: false, key: false };
        window.__hadHost = "E_HOST" in window;
        window.E_HOST = Object.assign(window.E_HOST || {}, {
          aiState: () => ({ model: false, org: true, reword: "ai.example.test", rewordAt: "ai.example.test", rewordOn: true }), setAi() {}, setSearchAi() {}, setReword() {},
          deskAiSettings: () => ({ choice: "organisation", on: true, ready: true, provider: "openai", endpoint: "", at: "", host: "ai.example.test", model: "m-own",
            keyKept: true, keyAway: false, managed: free, ignored: [], sealable: true, services: [{ id: "openai", endpoint: "https://api.openai.com/v1/" }] }),
          deskAiSave: async () => ({ ok: true, why: "" }), deskAiTest: async () => ({ ok: true }), onAiRanking() {},
        });
      });
      await page.evaluate(() => window.openScreenTab("settings"));
      await page.waitForSelector("#screenHost:not([hidden])", { timeout: 4000 });
      await sleep(100);
      const setWalk = await walkSurfaceWithTabs(page, theme + ":settings", "#screenHost", { focusFirstInside: true, maxSteps: 140 });
      surfaceSummary.settings = setWalk.results.length;
      const rwReached = await page.evaluate(() => !!document.querySelector('#screenHost [data-row="aireword"] .set-seg button'));
      check(rwReached, theme + ": the person's own switch for rewording is on the Settings page the walk covers", { rwReached });
      await page.evaluate(() => { if (!window.__hadHost) delete window.E_HOST; });
      allFailures.push(...setWalk.failures);
      allExceptions.push(...setWalk.exceptionsSeen);
      await page.evaluate(() => window.closeScreenTab && window.closeScreenTab("settings"));
      await sleep(80);

      // 4. Library screen (#screenHost).
      await page.evaluate(() => window.openManage());
      await page.waitForSelector("#screenHost:not([hidden]) .mg-cat", { timeout: 4000 });
      await sleep(100);
      const libWalk = await walkSurfaceWithTabs(page, theme + ":library", "#screenHost", { focusFirstInside: true, maxSteps: 140 });
      surfaceSummary.library = libWalk.results.length;
      allFailures.push(...libWalk.failures);
      allExceptions.push(...libWalk.exceptionsSeen);

      // 5. Card editor modal (#modal) opened from Library.
      const hasEdit = await page.$("#screenHost .mg-cat [data-edit-card]");
      if (hasEdit) {
        await page.$eval("#screenHost .mg-cat [data-edit-card]", el => {
          el.scrollIntoView({ block: "center" });
          el.click();
        });
        await page.waitForSelector("#modal:not([hidden]) #modalCard", { timeout: 4000 });
        await sleep(100);
        const edWalk = await walkSurfaceWithTabs(page, theme + ":card-editor", "#modalCard", { focusFirstInside: true, maxSteps: 80 });
        surfaceSummary.cardEditor = edWalk.results.length;
        allFailures.push(...edWalk.failures);
        allExceptions.push(...edWalk.exceptionsSeen);
        await page.evaluate(() => window.closeModal && window.closeModal());
        await sleep(80);
      }
      await page.evaluate(() => window.closeScreenTab && window.closeScreenTab("library"));
      await sleep(80);

      // 6. Maintenance screen (#screenHost).
      await page.evaluate(() => window.openScreenTab("maintenance"));
      await page.waitForSelector("#screenHost:not([hidden]) #mtReset", { timeout: 4000 });
      await sleep(100);
      const mtWalk = await walkSurfaceWithTabs(page, theme + ":maintenance", "#screenHost", { focusFirstInside: true, maxSteps: 80 });
      surfaceSummary.maintenance = mtWalk.results.length;
      allFailures.push(...mtWalk.failures);
      allExceptions.push(...mtWalk.exceptionsSeen);

      // 7. Small question bubble (#eResetAsk opened from Maintenance #mtReset).
      await page.$eval("#mtReset", el => { el.scrollIntoView({ block: "center" }); el.click(); });
      await page.waitForSelector("#eResetAsk", { timeout: 3000 });
      await sleep(80);
      const bubWalk = await walkSurfaceWithTabs(page, theme + ":bubble", "#eResetAsk", { focusFirstInside: true, maxSteps: 20 });
      surfaceSummary.bubble = bubWalk.results.length;
      allFailures.push(...bubWalk.failures);
      allExceptions.push(...bubWalk.exceptionsSeen);
      await page.click("#mtResetCancel").catch(() => {});
      await sleep(80);
      await page.evaluate(() => window.closeScreenTab && window.closeScreenTab("maintenance"));
      await sleep(80);
    }

    if (!opts.silent) {
      check(
        mainWalk.results.length > 0 &&
          (opts.mainOnly || (surfaceSummary.menu > 0 && surfaceSummary.settings > 0 &&
            surfaceSummary.library > 0 && surfaceSummary.cardEditor > 0 &&
            surfaceSummary.maintenance > 0 && surfaceSummary.bubble > 0)),
        theme + ": reached focusable controls across every surface",
        surfaceSummary
      );
      const uniqFails = [];
      const seenSel = new Set();
      for (const f of allFailures) {
        if (!seenSel.has(f.sel)) { seenSel.add(f.sel); uniqFails.push(f); }
      }
      check(
        uniqFails.length === 0,
        theme + ": every focusable control has valid 2 px >= 3:1 outline (or valid allowlisted mark)",
        uniqFails.slice(0, 12).map(f => ({
          sel: f.sel,
          outlineStyle: f.outlineStyle,
          outlineWidth: f.outlineWidth,
          ringColor: f.ringColor,
          groundColor: f.groundColor,
          ratio: f.ratio,
          detail: f.detail
        }))
      );
      const sawTextField = allExceptions.some(e => e.exception === "text-field");
      const textFieldFails = allExceptions.filter(e => e.exception === "text-field" && !e.ok);
      check(
        sawTextField && textFieldFails.length === 0,
        theme + ": text-field allowlist exception verified by 2 px blue inset foot",
        { sawTextField, bad: textFieldFails.slice(0, 6) }
      );
    }
  } finally {
    await page.close().catch(() => {});
  }

  return { failures: allFailures, surfaceSummary };
}

let browser = null;
try {
  browser = await launch();

  for (const theme of ["light", "dark"]) {
    await runThemeSuite(browser, path.join(dirMain, "etiuda.html"), theme);
  }

  // Inline plant proof: strip general *:focus-visible rule from a scratch copy and confirm leg goes red.
  if (PLANTS_OFF) {
    notRun("plant:general-focus-ring (ETIUDA_PLANTS=off)");
  } else {
    const rawHtml = fs.readFileSync(E.ENGINE_PATH, "utf8");
    const plantRe = /\*:focus-visible\s*\{[^}]*\}/;
    const strippedHtml = rawHtml.replace(plantRe, "");
    const plantRemoved = strippedHtml !== rawHtml;
    const plantPath = path.join(dirPlant, "etiuda.html");
    fs.writeFileSync(plantPath, strippedHtml, "utf8");
    let plantRed = false;
    let firstFail = null;
    if (plantRemoved) {
      const res = await runThemeSuite(browser, plantPath, "light", { mainOnly: true, silent: true });
      plantRed = res.failures.length > 0;
      firstFail = res.failures[0] ? res.failures[0].sel : null;
    }
    check(
      plantRemoved && plantRed,
      "inline plant proof: removing general *:focus-visible rule turns leg red",
      { plantRemoved, plantRed, firstFail }
    );
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (_) {}
}

console.log("#counts checks=" + checks + " skipped=" + skipped + " failed=" + fails + " expected=" + EXPECTED);
if (checks + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (checks + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(checks + " checks, " + fails + " failed");
process.exit(fails);
