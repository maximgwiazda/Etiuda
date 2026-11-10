/* Board 982: compact menu rows (8), intent rail resize grip (10), Maintenance sections (11).
 *
 *   node tests/desk-982-css.mjs
 *
 * Headless Chrome on the built engine page and the shipped sample catalog.
 * What the eye or the hand finds:
 *   8m1  header menu row height is 28 px
 *   8m2  header menu container has padding 5 px, gap 1 px, radius 10 px, min-width at least 232 px
 *   8m3  menu icon sits centred on the text line
 *   8m4  context menu row height is 28 px, right-hand hint is 11.5 px and never touches its label
 *   8m5  menu separator margin is 3px 6px
 *   10r1 dragging the rail edge away from the mid-edge grip leaves width unchanged
 *   10r2 dragging the rail edge on the mid-edge grip changes width
 *   10r3 locked rail hides the resize handle
 *   11s1 Engine and display maintenance page shows at least one section with rows
 *   11s2 Catalog maintenance page shows at least one section with rows
 *   11s3 Storage and desk maintenance page shows at least one section with rows
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
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-982-"));
fs.copyFileSync(E.ENGINE_PATH, path.join(lab, "etiuda.html"));
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
const url = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");
let browser = null;

async function boot() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
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

try {
  browser = await puppeteer.launch({
    executablePath: E.browserPath("chrome"),
    headless: true,
    args: ["--hide-scrollbars"],
    protocolTimeout: 120000,
  });

  const page = await boot();

  /* --- FINDING 8: Compact menu rows --- */
  // 1. Header menu
  await page.click("#settingsBtn");
  await page.waitForSelector("#settingsMenu", { visible: true, timeout: 5000 });

  const menuMetrics = await page.evaluate(() => {
    const m = document.getElementById("settingsMenu");
    const mr = m.getBoundingClientRect();
    const cs = getComputedStyle(m);
    const btn = m.querySelector('button[role="menuitem"]');
    const br = btn.getBoundingClientRect();
    const bcs = getComputedStyle(btn);
    const sep = m.querySelector(".menu-sep");
    const scs = sep ? getComputedStyle(sep) : null;
    return {
      menuWidth: mr.width,
      menuPadTop: cs.paddingTop,
      menuPadLeft: cs.paddingLeft,
      menuGap: cs.gap,
      menuRadius: cs.borderRadius,
      rowHeight: Math.round(br.height * 10) / 10,
      btnPadTop: bcs.paddingTop,
      btnPadBottom: bcs.paddingBottom,
      btnPadLeft: bcs.paddingLeft,
      btnRadius: bcs.borderRadius,
      btnFont: bcs.fontSize,
      btnLineHeight: bcs.lineHeight,
      btnGap: bcs.gap,
      sepMarginTop: scs ? scs.marginTop : "",
      sepMarginLeft: scs ? scs.marginLeft : "",
    };
  });

  check(near(menuMetrics.rowHeight, 28, 1),
    "8m1 header menu row height is 28 px: " + menuMetrics.rowHeight + " px", menuMetrics);

  const menuContainerOk = menuMetrics.menuWidth >= 232
    && menuMetrics.menuPadTop === "5px"
    && menuMetrics.menuGap === "1px"
    && menuMetrics.menuRadius === "10px";
  check(menuContainerOk,
    "8m2 header menu container has padding 5 px, gap 1 px, radius 10 px, min-width at least 232 px", menuMetrics);

  const sepOk = menuMetrics.sepMarginTop === "3px" && menuMetrics.sepMarginLeft === "6px";
  check(sepOk,
    "8m5 menu separator margin is 3px 6px", menuMetrics);

  // Close header menu
  await page.keyboard.press("Escape");
  await sleep(100);

  // More menu for icon centering
  const iconMetrics = await page.evaluate(() => {
    const moreWrap = document.getElementById("moreWrap");
    if (moreWrap) { moreWrap.hidden = false; moreWrap.style.display = "block"; }
    const moreMenu = document.getElementById("moreMenu");
    if (moreMenu) { moreMenu.hidden = false; moreMenu.style.display = "flex"; }
    const btn = document.getElementById("moreFacts");
    if (btn) btn.hidden = false;
    const ic = btn.querySelector(".ic");
    const txt = btn.querySelector("span");
    const br = btn.getBoundingClientRect();
    const ir = ic.getBoundingClientRect();
    const tr = txt.getBoundingClientRect();
    const icCenterY = ir.top + ir.height / 2;
    const trCenterY = tr.top + tr.height / 2;
    return {
      icWidth: ir.width,
      icHeight: ir.height,
      diff: Math.abs(icCenterY - trCenterY),
    };
  });
  check(iconMetrics.icWidth === 16 && iconMetrics.icHeight === 16 && iconMetrics.diff <= 1.5,
    "8m3 menu icon sits centred on the text line", iconMetrics);

  // Context menu
  const ctxMetrics = await page.evaluate(() => {
    const card = document.querySelector("#list .card[data-id]");
    const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 200 });
    card.dispatchEvent(evt);
    const m = document.querySelector(".menu.e-ctx");
    if (!m) return null;
    const btns = Array.from(m.querySelectorAll("button"));
    const editBtn = btns.find(b => b.querySelector("small"));
    if (!editBtn) return null;
    const r = editBtn.getBoundingClientRect();
    const lbl = editBtn.querySelector("span") || editBtn.firstChild;
    const sm = editBtn.querySelector("small");
    const smCs = getComputedStyle(sm);
    const lr = (lbl.nodeType === 1 ? lbl : editBtn).getBoundingClientRect();
    const sr = sm.getBoundingClientRect();
    return {
      rowHeight: Math.round(r.height * 10) / 10,
      smFont: smCs.fontSize,
      gap: sr.left - lr.right,
    };
  });
  check(ctxMetrics && near(ctxMetrics.rowHeight, 28, 1) && parseFloat(ctxMetrics.smFont) <= 12 && ctxMetrics.gap > 8,
    "8m4 context menu row height is 28 px, right-hand hint is 11.5 px and never touches its label", ctxMetrics);

  await page.keyboard.press("Escape");
  await sleep(100);

  /* --- FINDING 10: Intent rail resize grip --- */
  // Make sure rail is unlocked
  await page.evaluate(() => {
    localStorage.removeItem("eRailLock");
    const r = document.getElementById("intentRail");
    if (r) r.classList.remove("rail-fixed");
  });

  const railBoxBefore = await page.evaluate(() => {
    const r = document.getElementById("intentRail");
    const h = document.getElementById("railResize");
    const rect = r.getBoundingClientRect();
    const hrect = h ? h.getBoundingClientRect() : null;
    return {
      width: rect.width,
      right: rect.right,
      top: rect.top,
      height: rect.height,
      h: hrect ? { left: hrect.left, right: hrect.right, top: hrect.top, height: hrect.height } : null,
    };
  });

  // Drag away from grip: 20px from top
  const awayY = Math.round(railBoxBefore.top + 20);
  const dragX = Math.round(railBoxBefore.h.left + 3);
  await page.mouse.move(dragX, awayY);
  await page.mouse.down();
  await page.mouse.move(dragX + 50, awayY, { steps: 5 });
  await page.mouse.up();
  await sleep(100);

  const railBoxAfterAway = await page.evaluate(() => {
    const r = document.getElementById("intentRail");
    return r.getBoundingClientRect().width;
  });

  check(near(railBoxAfterAway, railBoxBefore.width, 1),
    "10r1 dragging the rail edge away from the mid-edge grip leaves width unchanged",
    { before: railBoxBefore.width, after: railBoxAfterAway });

  // Drag on grip: mid-edge
  const grip = await page.evaluate(() => {
    const h = document.getElementById("railResize");
    const hr = h.getBoundingClientRect();
    const x = Math.round(hr.left + 2);
    const y = Math.round(hr.top + hr.height / 2);
    return { x, y };
  });
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x + 50, grip.y, { steps: 5 });
  await page.mouse.up();
  await sleep(100);

  const railBoxAfterGrip = await page.evaluate(() => {
    const r = document.getElementById("intentRail");
    return r.getBoundingClientRect().width;
  });

  check(railBoxAfterGrip >= railBoxBefore.width + 30,
    "10r2 dragging the rail edge on the mid-edge grip changes width",
    { before: railBoxBefore.width, after: railBoxAfterGrip });

  // Locked rail
  const lockedHandleDisplay = await page.evaluate(() => {
    const r = document.getElementById("intentRail");
    r.classList.add("rail-fixed");
    const h = document.getElementById("railResize");
    return h ? getComputedStyle(h).display : "none";
  });
  check(lockedHandleDisplay === "none",
    "10r3 locked rail hides the resize handle", { display: lockedHandleDisplay });

  /* --- FINDING 11: Maintenance pages show their sections --- */
  await page.evaluate(() => {
    window.openScreenTab("maintenance");
  });
  await page.waitForFunction(() => !!document.querySelector(".sx.lm-mt"), { timeout: 5000 });

  async function checkMtPage(pageKey, id, label) {
    await page.evaluate(k => {
      const b = document.querySelector('.sx-sec[data-mt="' + k + '"]');
      if (b) b.click();
    }, pageKey);
    await sleep(100);
    const secReport = await page.evaluate(() => {
      const host = document.querySelector(".sx.lm-mt");
      const secs = Array.from(host.querySelectorAll(".mt-sec"));
      const visibleSecs = secs.filter(s => {
        const cs = getComputedStyle(s);
        return cs.display !== "none" && s.offsetHeight > 0;
      });
      const rows = visibleSecs.flatMap(s => Array.from(s.querySelectorAll(".mt-row")))
        .filter(r => getComputedStyle(r).display !== "none");
      return {
        totalSecs: secs.length,
        visibleSecs: visibleSecs.length,
        visibleRows: rows.length,
      };
    });
    return secReport;
  }

  const s1 = await checkMtPage("engine");
  check(s1.visibleSecs >= 1 && s1.visibleRows >= 1,
    "11s1 Engine and display maintenance page shows at least one section with rows", s1);

  const s2 = await checkMtPage("catalog");
  check(s2.visibleSecs >= 1 && s2.visibleRows >= 1,
    "11s2 Catalog maintenance page shows at least one section with rows", s2);

  const s3 = await checkMtPage("storage");
  check(s3.visibleSecs >= 1 && s3.visibleRows >= 1,
    "11s3 Storage and desk maintenance page shows at least one section with rows", s3);

  await page.close();
} catch (e) {
  check(false, "the leg ran to its end", String(e && e.stack || e));
} finally {
  if (browser) await browser.close();
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}

console.log("#counts checks=" + checks + " skipped=0 failed=" + fails + " expected=11");
console.log(checks + " checks, " + fails + " failed");
process.exit(fails || checks !== 11 ? 1 : 0);
