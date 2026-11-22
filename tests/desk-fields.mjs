/* THE DESK'S TEXT FIELDS BROUGHT TO STUDIO'S RULE AND EDGE. Chrome, headless, no fixtures, no window.
 *
 *   node tests/desk-fields.mjs [--engine <file>]
 *
 * Every text field the desk draws (the main search, PAX, the Settings search, a Settings text field,
 * the card editor's title and body, and a dialog's field), in both themes (light and dark):
 *   (1) the edge colour against the field's own background and against the ground it sits on is at least 3:1 (WCAG)
 *   (2) at rest a 1 px inset foot in --field-edge; in focus no outline ring and a 2 px inset underline in --accent
 *   (3) all of them share one border colour token (--edge)
 * And an inline plant proof that restores the faint --field-line edge in a scratch copy and turns (1) red;
 * skipped with a NOT RUN line when ETIUDA_PLANTS=off.
 *
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

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-fields-"));
const SEED_CATALOG = fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8");
const copyFiles = (dir, htmlText) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "etiuda.html"), htmlText);
  return "file:///" + path.join(dir, "etiuda.html").replace(/\\/g, "/");
};
const url = copyFiles(lab, fs.readFileSync(ENGINE, "utf8"));

async function boot(browser, pageUrl, theme) {
  const p = await browser.newPage();
  p.on("dialog", (d) => { d.dismiss().catch(() => {}); });
  await p.setViewport({ width: 1400, height: 900 });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.evaluateOnNewDocument((th) => {
    try {
      for (const k of ["eTourDone_v3", "eTourInvite_v3", "eFirstSigninSeen", "eNameAsked"]) localStorage.setItem(k, "1");
      localStorage.setItem("eTheme", th);
      localStorage.setItem("eAgent", "Bench Agent");
    } catch (e) {}
  }, theme);
  await seatPage(p);
  await E.seedCatalog(p, SEED_CATALOG);
  await p.goto(pageUrl, { waitUntil: "load", timeout: 60000 });
  await p.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await p.$("#ecYes")) await p.click("#ecYes");
  await p.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await sleep(300);
  return p;
}
const closePage = (p) => Promise.race([p.close().catch(() => {}), sleep(5000)]);

/* Measure one field box (at rest, then focused) in the page's current DOM. */
async function readField(p, boxSel, focusSel) {
  await p.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  await p.mouse.move(2, 2);
  await sleep(60);

  const probeInPage = (bSel, fSel) => {
    const box = document.querySelector(bSel);
    const foc = document.querySelector(fSel);
    if (!box || !foc) return { missing: true, bSel, fSel };

    const parseColor = (str) => {
      if (!str || str === "transparent") return [0, 0, 0, 0];
      let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(str.trim());
      if (m) return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), m[4] !== undefined ? parseFloat(m[4]) : 1];
      m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i.exec(str.trim());
      if (m) return [parseFloat(m[1]) * 255, parseFloat(m[2]) * 255, parseFloat(m[3]) * 255, m[4] !== undefined ? parseFloat(m[4]) : 1];
      return null;
    };
    const resolveVar = (prop) => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
      if (!raw) return "";
      const el = document.createElement("span");
      el.style.color = "var(" + prop + ")";
      el.style.display = "none";
      document.body.appendChild(el);
      const col = getComputedStyle(el).color;
      el.remove();
      return col;
    };
    const resolveEdgeShadow = () => {
      const el = document.createElement("span");
      el.style.boxShadow = "inset 0 -1px 0 0 var(--field-edge)";
      el.style.display = "none";
      document.body.appendChild(el);
      const sh = getComputedStyle(el).boxShadow;
      el.remove();
      return sh;
    };
    const composite = (fg, bg) => {
      const a = fg[3];
      return [
        fg[0] * a + bg[0] * (1 - a),
        fg[1] * a + bg[1] * (1 - a),
        fg[2] * a + bg[2] * (1 - a),
        1,
      ];
    };
    const groundColor = (el) => {
      const layers = [];
      for (let cur = el.parentElement; cur; cur = cur.parentElement) {
        const c = parseColor(getComputedStyle(cur).backgroundColor);
        if (c && c[3] > 0) {
          layers.push(c);
          if (c[3] >= 0.999) break;
        }
      }
      let bg = parseColor(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255, 1];
      if (bg[3] < 0.999) bg = document.documentElement.dataset.theme === "dark" ? [15, 16, 19, 1] : [247, 248, 250, 1];
      for (let i = layers.length - 1; i >= 0; i--) bg = composite(layers[i], bg);
      return bg;
    };
    const fieldColor = (el, ground) => {
      const c = parseColor(getComputedStyle(el).backgroundColor);
      if (!c || c[3] === 0) return ground;
      return c[3] < 0.999 ? composite(c, ground) : c;
    };
    const lum = ([r, g, b]) => [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => {
      const p = lum(a), q = lum(b);
      return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05);
    };

    const cs = getComputedStyle(box);
    const fcs = getComputedStyle(foc);
    const ground = groundColor(box);
    const fieldBg = fieldColor(box, ground);
    const edgeTop = parseColor(cs.borderTopColor);
    const edgeColors = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
    const edgeRgb = edgeTop && edgeTop[3] < 0.999 ? composite(edgeTop, ground) : edgeTop;

    const restShadow = cs.boxShadow;
    const restOutline = cs.outlineStyle === "none" || cs.outlineWidth === "0px";
    const focRestOutline = fcs.outlineStyle === "none" || fcs.outlineWidth === "0px";
    const expectedRestShadow = resolveEdgeShadow();
    const expectedAccent = resolveVar("--accent");
    const expectedEdge = resolveVar("--edge");

    const innerClean = box === foc || (fcs.borderTopWidth === "0px" && fcs.borderBottomWidth === "0px");

    return {
      borderColors: edgeColors,
      borderWidth: cs.borderTopWidth,
      expectedEdge,
      edgeSameOnAllSides: edgeColors.every((c) => c === edgeColors[0]),
      matchesEdgeToken: !!expectedEdge && edgeColors[0] === expectedEdge,
      ratioVsField: edgeRgb ? Math.round(ratio(edgeRgb, fieldBg) * 100) / 100 : 0,
      ratioVsGround: edgeRgb ? Math.round(ratio(edgeRgb, ground) * 100) / 100 : 0,
      restOutlineNone: restOutline && focRestOutline,
      restShadow,
      expectedRestShadow,
      expectedAccent,
      innerClean,
    };
  };

  const rest = await p.evaluate(probeInPage, boxSel, focusSel);
  if (rest.missing) return rest;

  await p.keyboard.press("Shift");
  await p.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.focus();
  }, focusSel);
  await sleep(80);

  const focused = await p.evaluate((bSel, fSel) => {
    const box = document.querySelector(bSel);
    const foc = document.querySelector(fSel);
    const cs = getComputedStyle(box);
    const fcs = getComputedStyle(foc);
    return {
      boxOutlineNone: cs.outlineStyle === "none" || cs.outlineWidth === "0px",
      focOutlineNone: fcs.outlineStyle === "none" || fcs.outlineWidth === "0px",
      boxShadow: cs.boxShadow,
      focBoxShadow: fcs.boxShadow,
      borderTopColor: cs.borderTopColor,
      borderBottomColor: cs.borderBottomColor,
    };
  }, boxSel, focusSel);

  /* Expected inset 2px accent underline computed by the browser in the same format as boxShadow. */
  const expectedFocusShadow = await p.evaluate(() => {
    const el = document.createElement("span");
    el.style.boxShadow = "inset 0 -2px 0 0 var(--accent)";
    el.style.display = "none";
    document.body.appendChild(el);
    const sh = getComputedStyle(el).boxShadow;
    el.remove();
    return sh;
  });

  return { rest, focused, expectedFocusShadow };
}

function verifyField(name, theme, m) {
  if (!m || m.missing) {
    check(false, theme + " " + name + ": field present", m);
    return null;
  }
  const { rest, focused, expectedFocusShadow } = m;
  const edgeOk = rest.edgeSameOnAllSides
    && rest.matchesEdgeToken
    && rest.ratioVsField >= 3.0
    && rest.ratioVsGround >= 3.0;
  check(edgeOk, theme + " " + name + " (1) edge >= 3:1 against field and ground using --edge",
    { ratios: [rest.ratioVsField, rest.ratioVsGround], borders: rest.borderColors, expectedEdge: rest.expectedEdge });

  const focusOk = rest.innerClean
    && rest.restOutlineNone
    && rest.restShadow === rest.expectedRestShadow
    && focused.boxOutlineNone
    && focused.focOutlineNone
    && focused.boxShadow === expectedFocusShadow
    && (focused.focBoxShadow === "none" || focused.focBoxShadow === expectedFocusShadow)
    && focused.borderTopColor === rest.borderColors[0]
    && focused.borderBottomColor === rest.borderColors[0];
  check(focusOk, theme + " " + name + " (2) 1px inset foot at rest, no ring and 2px accent foot in focus",
    {
      restShadow: rest.restShadow, expectedRestShadow: rest.expectedRestShadow,
      focusShadow: focused.boxShadow, expectedFocusShadow,
      outlines: [rest.restOutlineNone, focused.boxOutlineNone, focused.focOutlineNone],
      focusBorder: [focused.borderTopColor, focused.borderBottomColor],
      innerClean: rest.innerClean,
    });
  return rest.borderColors[0];
}

let browser = null, done = false;
try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });

  for (const theme of ["light", "dark"]) {
    EXPECTED += 15; /* 7 fields * 2 checks + 1 shared-token check per theme */
    const p = await boot(browser, url, theme);
    const borders = [];

    /* 1. Main search */
    borders.push(verifyField("main search", theme, await readField(p, "#intentComboWrap", "#intent")));

    /* 2. PAX field */
    borders.push(verifyField("pax field", theme, await readField(p, ".field-wrap.paxrole", "#pax")));

    /* 3 & 4. Settings search + Settings text field */
    await p.evaluate(() => window.openScreenTab("settings"));
    await p.waitForSelector("#sxSearch", { timeout: 10000 });
    await p.waitForSelector("#setAgentName", { timeout: 10000 });
    await sleep(200);
    borders.push(verifyField("Settings search", theme, await readField(p, ".sx-search", "#sxSearch")));
    borders.push(verifyField("Settings text field", theme, await readField(p, "#setAgentName", "#setAgentName")));

    /* 5 & 6. Card editor's title and body */
    await p.evaluate(() => window.openManage());
    await p.waitForSelector("#screenHost [data-edit-card]", { timeout: 10000 });
    await p.evaluate(() => {
      const d = document.querySelector("#screenHost details.mg-cat");
      if (d) d.open = true;
      const b = document.querySelector("#screenHost [data-edit-card]");
      if (b) b.click();
    });
    await p.waitForSelector("#modal:not([hidden]) .mf .field-wrap input", { timeout: 10000 });
    await sleep(200);
    const edTitleSel = await p.evaluate(() => {
      const inp = document.querySelector("#modal .mf .field-wrap input");
      return inp ? "#" + inp.id : null;
    });
    const edBodySel = await p.evaluate(() => {
      const ta = document.querySelector("#modal .mf textarea");
      return ta ? "#" + ta.id : null;
    });
    borders.push(verifyField("card editor title", theme, await readField(p, ".modal .mf .field-wrap", edTitleSel)));
    borders.push(verifyField("card editor body", theme, await readField(p, edBodySel, edBodySel)));
    await p.keyboard.press("Escape");
    await sleep(200);

    /* 7. A dialog's field (Intent editor) */
    await p.evaluate(() => window.openManage());
    await p.waitForSelector("#mgAddIntent", { timeout: 10000 });
    await p.evaluate(() => {
      const sec = document.querySelector('#screenHost .sx-sec[data-lm="intents"]');
      if (sec) sec.click();
      const b = document.getElementById("mgAddIntent");
      if (b) b.click();
    });
    await p.waitForSelector("#modal:not([hidden]) .mf .field-wrap input", { timeout: 10000 });
    await sleep(200);
    const dlgFieldSel = await p.evaluate(() => {
      const inp = document.querySelector("#modal .mf .field-wrap input");
      return inp ? "#" + inp.id : null;
    });
    borders.push(verifyField("dialog field", theme, await readField(p, ".modal .mf .field-wrap", dlgFieldSel)));

    /* (3) Shared border colour across every field in this theme */
    const cleanBorders = borders.filter(Boolean);
    check(cleanBorders.length === 7 && cleanBorders.every((c) => c === cleanBorders[0]),
      theme + " (3) all text fields share one border colour token", cleanBorders);

    await closePage(p);
  }

  /* Static check: every text field rule in src/template.html reads the one --edge token. */
  EXPECTED += 1;
  const tpl = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
  const hasThemeTokens =
    /:root\{[^}]*--edge:\s*#[0-9a-f]{6}/i.test(tpl)
    && /:root:not\(\[data-theme=light\]\)\{[^}]*--edge:\s*#[0-9a-f]{6}/i.test(tpl)
    && /:root\[data-theme=dark\]\{[^}]*--edge:\s*#[0-9a-f]{6}/i.test(tpl)
    && /:root\[data-theme=light\]\{[^}]*--edge:\s*#[0-9a-f]{6}/i.test(tpl);
  const rulesUseEdge =
    /\.fill \.field-wrap,\.fill \.combo\{[^}]*border:1px solid var\(--edge\)/.test(tpl)
    && /\.set-row input\[type=text\][^{]*\{[^}]*border:1px solid var\(--edge\)/.test(tpl)
    && /\.mf input:[^{]*\{[^}]*border:1px solid var\(--edge\)/.test(tpl)
    && /\.mf \.field-wrap\{[^}]*border:1px solid var\(--edge\)/.test(tpl)
    && /\.sx-search\{[^}]*border:1px solid var\(--edge\)/.test(tpl);
  check(hasThemeTokens && rulesUseEdge, "src/template.html defines --edge in all four theme blocks and uses it on all field rules",
    { hasThemeTokens, rulesUseEdge });

  /* Inline plant proof: restore the faint --field-line edge in a scratch copy and verify (1) turns red. */
  EXPECTED += 2;
  if (PLANTS_OFF) {
    skip("plant-faint-edge light: restoring faint edge turns (1) red (ETIUDA_PLANTS=off)");
    skip("plant-faint-edge dark: restoring faint edge turns (1) red (ETIUDA_PLANTS=off)");
  } else {
    const rawHtml = fs.readFileSync(ENGINE, "utf8");
    const plantedHtml = rawHtml.replace(/--edge\s*:\s*#[0-9a-f]{6}/gi, (m) => {
      const hex = m.split(":")[1].trim().toLowerCase();
      /* Restore each theme's faint --field-line value (#e0e4ea light, #343941 dark). */
      return "--edge:" + (hex === "#838c9a" ? "#e0e4ea" : "#343941");
    });
    const plantUrl = copyFiles(path.join(lab, "plant"), plantedHtml);
    for (const theme of ["light", "dark"]) {
      const pp = await boot(browser, plantUrl, theme);
      const m = await readField(pp, "#intentComboWrap", "#intent");
      const red = plantedHtml !== rawHtml && m && m.rest && m.rest.ratioVsField < 3.0;
      check(red, "plant-faint-edge " + theme + ": restoring faint edge turns (1) red",
        m && m.rest ? { ratioVsField: m.rest.ratioVsField, ratioVsGround: m.rest.ratioVsGround, border: m.rest.borderColors[0] } : m);
      await closePage(pp);
    }
  }

  done = true;
} catch (e) {
  console.log("  FAIL the run stopped: " + String((e && e.message) || e));
  fails++;
} finally {
  if (browser) await Promise.race([browser.close(), sleep(10000).then(() => { const c = browser.process(); if (c) c.kill(); })]);
  E.removeLab(lab);
}
if (done && checks + notRun !== EXPECTED) {
  console.log("  FAIL ran " + (checks + notRun) + " checks, expected " + EXPECTED);
  fails++;
}
console.log("#counts checks=" + checks + " failed=" + fails + " notRun=" + notRun + " expected=" + EXPECTED);
console.log((fails ? "FAIL " : "PASS ") + "desk-fields: " + (checks - (fails > checks ? checks : fails)) + "/" + checks + " checks" + (notRun ? ", " + notRun + " NOT RUN" : "") + (done ? "" : " - SUITE DID NOT COMPLETE"));
process.exit(done ? E.exitOf(fails) : 78);
