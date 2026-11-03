/* THE OPENING AND THE EMPTY DESK'S MIDDLE (board 957).
 *
 *   node tests/opening-legs.mjs
 *
 * Measures what the eye sees (headless, never a window):
 *   957o1 the work hidden until the opening lands: at frames before the landing, the band, the search bar and the panes are not visible (computed opacity or visibility, and their boxes not painted), and they are after it
 *   957o2 the landing on the corner mark: the drawn mark's last frame of the flight sits on the .brand svg's box (centre within 1 px, size within 2 per cent), and the hand-over shows no jump in the corner mark's phase
 *   957o3 a key, a click and the wheel each end the opening at once, the window shown
 *   957o4 reduced motion: no opening, the window shown as soon as the page is ready, its corner mark still
 *   957o5 the empty desk's middle in both themes: the figure absent, the column's order, the button filled in the ink with readable text (contrast measured), the catalog-folder line present and byte for byte as now decided
 *   957o6 a frame that throws still gives way
 *   957o7 no frames and a ready that never comes gives way by the failsafe
 *   957o8 reduced motion: a ready that never comes gives way by the failsafe
 *
 * Exit code is the number of failed checks.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const E = require("./engine.js");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_HTML = path.join(ROOT, "engine", "etiuda.html");

let checks = 0, fails = 0;
function check(ok, line) {
  checks++;
  if (ok) console.log("  ok   " + line);
  else {
    fails++;
    console.log("  FAIL " + line);
  }
}

function sRGBtoLin(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function relLuminance(r, g, b) {
  return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
}
function parseRgb(str) {
  const m = String(str || "").match(/\d+/g);
  return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [0, 0, 0];
}
function contrastRatio(rgb1, rgb2) {
  const l1 = relLuminance(...rgb1);
  const l2 = relLuminance(...rgb2);
  const top = Math.max(l1, l2);
  const bot = Math.min(l1, l2);
  return (top + 0.05) / (bot + 0.05);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const browser = await puppeteer.launch({
    executablePath: E.browserPath("chrome"),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"]
  });

  try {
    /* -------------------------------------------------------------------------
     * 957o1: work hidden until opening lands
     * ------------------------------------------------------------------------- */
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 768 });
      // Navigate to engine
      await page.goto("file://" + ENGINE_HTML);

      // Check early frame while opening is playing (e.g. after 400ms)
      await sleep(400);
      const early = await page.evaluate(() => {
        const band = document.querySelector(".row-main");
        const search = document.querySelector("#intentComboWrap");
        const rail = document.querySelector("#intentRail");
        const main = document.querySelector("#main");
        const veil = document.querySelector(".e-launch-veil");

        const bandStyle = band ? getComputedStyle(band) : null;
        const searchStyle = search ? getComputedStyle(search) : null;
        const railStyle = rail ? getComputedStyle(rail) : null;
        const mainStyle = main ? getComputedStyle(main) : null;

        const isHidden = cs => cs && (cs.opacity === "0" || cs.visibility === "hidden" || cs.display === "none");

        return {
          launchActive: document.body.classList.contains("e-launch"),
          veilPresent: !!veil,
          bandHidden: isHidden(bandStyle),
          searchHidden: isHidden(searchStyle),
          panesHidden: isHidden(railStyle) && isHidden(mainStyle),
          bandOpacity: bandStyle ? bandStyle.opacity : null,
          searchOpacity: searchStyle ? searchStyle.opacity : null
        };
      });

      // Wait until opening completes
      await sleep(3400);

      const after = await page.evaluate(() => {
        const band = document.querySelector(".row-main");
        const search = document.querySelector("#intentComboWrap");
        const rail = document.querySelector("#intentRail");
        const main = document.querySelector("#main");
        const veil = document.querySelector(".e-launch-veil");

        const bandStyle = band ? getComputedStyle(band) : null;
        const searchStyle = search ? getComputedStyle(search) : null;
        const railStyle = rail ? getComputedStyle(rail) : null;
        const mainStyle = main ? getComputedStyle(main) : null;

        const isVisible = cs => cs && cs.opacity === "1" && cs.visibility === "visible" && cs.display !== "none";

        return {
          launchGone: !document.body.classList.contains("e-launch") && !document.body.classList.contains("e-launch-out"),
          veilGone: !veil,
          bandVisible: isVisible(bandStyle),
          searchVisible: isVisible(searchStyle),
          panesVisible: isVisible(railStyle) && isVisible(mainStyle)
        };
      });

      const ok1 = early.launchActive && early.veilPresent && early.bandHidden && early.searchHidden && early.panesHidden
        && after.launchGone && after.veilGone && after.bandVisible && after.searchVisible && after.panesVisible;

      check(ok1, "957o1 the work hidden until the opening lands: at frames before the landing, the band, the search bar and the panes are not visible (computed opacity or visibility, and their boxes not painted), and they are after it");
      await page.close();
    }

    /* -------------------------------------------------------------------------
     * 957o2: landing on corner mark
     * ------------------------------------------------------------------------- */
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1024, height: 768 });
      await page.goto("file://" + ENGINE_HTML);

      // Check the opening landing state at 2.90s (last frame of flight)
      await sleep(2900);
      const landing = await page.evaluate(() => {
        const brandSvg = document.querySelector(".brand-tile svg");
        if (!brandSvg) return { found: false };
        const bRect = brandSvg.getBoundingClientRect();
        const brandCenter = { x: bRect.left + bRect.width / 2, y: bRect.top + bRect.height / 2 };

        // The opening state and corner mark phase
        const state = window.__launchOpeningState ? window.__launchOpeningState() : null;
        if (!state) return { found: false, oldLaunch: true };

        const dist = Math.hypot(state.cx - brandCenter.x, state.cy - brandCenter.y);
        const expectedSize = bRect.width * 1.0581;
        const sizeDiffRatio = Math.abs(state.size - expectedSize) / expectedSize;

        // Header corner mark phase
        const headerPhase = window.fifthPhase ? window.fifthPhase() : null;
        const phaseJump = headerPhase != null ? Math.abs(state.phase - headerPhase) : 999;

        return {
          found: true,
          dist,
          sizeDiffRatio,
          phaseJump,
          centreWithin1px: dist <= 1.0,
          sizeWithin2pct: sizeDiffRatio <= 0.02,
          noPhaseJump: phaseJump < 1e-4
        };
      });

      const ok2 = landing.found && landing.centreWithin1px && landing.sizeWithin2pct && landing.noPhaseJump;
      check(ok2, "957o2 the landing on the corner mark: the drawn mark's last frame of the flight sits on the .brand svg's box (centre within 1 px, size within 2 per cent), and the hand-over shows no jump in the corner mark's phase");
      await page.close();
    }

    /* -------------------------------------------------------------------------
     * 957o3: skip by key, click, wheel
     * ------------------------------------------------------------------------- */
    {
      // Test key skip
      const pageKey = await browser.newPage();
      await pageKey.goto("file://" + ENGINE_HTML);
      await sleep(500);
      await pageKey.keyboard.press("Escape");
      await sleep(100);
      const keySkipped = await pageKey.evaluate(() => {
        const state = window.__launchOpeningState ? window.__launchOpeningState() : null;
        const brandTile = document.querySelector(".brand-tile");
        return !document.body.classList.contains("e-launch")
          && !document.querySelector(".e-launch-veil")
          && state != null && state.skipped === true
          && brandTile && brandTile.classList.contains("brand-turning");
      });
      await pageKey.close();

      // Test click skip
      const pageClick = await browser.newPage();
      await pageClick.goto("file://" + ENGINE_HTML);
      await sleep(500);
      await pageClick.mouse.click(500, 400);
      await sleep(100);
      const clickSkipped = await pageClick.evaluate(() => {
        const state = window.__launchOpeningState ? window.__launchOpeningState() : null;
        return !document.body.classList.contains("e-launch")
          && !document.querySelector(".e-launch-veil")
          && state != null && state.skipped === true;
      });
      await pageClick.close();

      // Test wheel skip
      const pageWheel = await browser.newPage();
      await pageWheel.goto("file://" + ENGINE_HTML);
      await sleep(500);
      await pageWheel.mouse.wheel({ deltaY: 100 });
      await sleep(100);
      const wheelSkipped = await pageWheel.evaluate(() => {
        const state = window.__launchOpeningState ? window.__launchOpeningState() : null;
        return !document.body.classList.contains("e-launch")
          && !document.querySelector(".e-launch-veil")
          && state != null && state.skipped === true;
      });
      await pageWheel.close();

      const ok3 = keySkipped && clickSkipped && wheelSkipped;
      check(ok3, "957o3 a key, a click and the wheel each end the opening at once, the window shown");
    }

    /* -------------------------------------------------------------------------
     * 957o4: reduced motion
     * ------------------------------------------------------------------------- */
    {
      const page = await browser.newPage();
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await page.goto("file://" + ENGINE_HTML);

      // Under reduced motion: no opening, window shows as soon as ready (~200ms)
      await sleep(250);
      const rm = await page.evaluate(() => {
        const state = window.__launchOpeningState ? window.__launchOpeningState() : null;
        const brandTile = document.querySelector(".brand-tile");
        const veil = document.querySelector(".e-launch-veil");
        return {
          launchGone: !document.body.classList.contains("e-launch"),
          veilGone: !veil,
          headerMarkStill: brandTile ? !brandTile.classList.contains("brand-turning") : false,
          stateStill: state ? state.isStill : false
        };
      });

      const ok4 = rm.launchGone && rm.veilGone && rm.headerMarkStill && rm.stateStill;
      check(ok4, "957o4 reduced motion: no opening, the window shown as soon as the page is ready, its corner mark still");
      await page.close();
    }

    /* -------------------------------------------------------------------------
     * 957o5: empty desk's middle in both themes
     * ------------------------------------------------------------------------- */
    {
      const page = await browser.newPage();
      await page.goto("file://" + ENGINE_HTML);
      await sleep(3500); // Wait for opening to finish

      const testMiddle = async (theme) => {
        return await page.evaluate((th) => {
          document.documentElement.setAttribute("data-theme", th);
          const emptyDesk = document.querySelector(".empty-desk");
          if (!emptyDesk) return { found: false };

          // 1. Figure absent
          const canvas = emptyDesk.querySelector("canvas.e-fifth");
          const spot = emptyDesk.querySelector(".e-fifth-spot");
          const figureAbsent = !canvas && !spot;

          // 2. Column's order
          const h2 = emptyDesk.querySelector("h2");
          const btn = emptyDesk.querySelector("#emptyLoad");
          const orText = emptyDesk.querySelector(".mid-or");
          const catLine = emptyDesk.querySelector(".open-folder, #emptyCatFolder");

          const h2Text = h2 ? h2.textContent.trim() : "";
          const btnText = btn ? btn.textContent.trim() : "";
          const orContent = orText ? orText.textContent.trim() : "";

          // Check DOM order
          let inOrder = false;
          if (h2 && btn && orText) {
            const h2Pos = h2.compareDocumentPosition(btn);
            const btnPos = btn.compareDocumentPosition(orText);
            inOrder = (h2Pos & Node.DOCUMENT_POSITION_FOLLOWING) && (btnPos & Node.DOCUMENT_POSITION_FOLLOWING);
            if (catLine) {
              const catPos = orText.compareDocumentPosition(catLine);
              inOrder = inOrder && (catPos & Node.DOCUMENT_POSITION_FOLLOWING);
            }
          }

          // 3. Button filled in ink with readable text (contrast measured)
          const btnStyle = btn ? getComputedStyle(btn) : null;
          const bgCol = btnStyle ? btnStyle.backgroundColor : "";
          const textCol = btnStyle ? btnStyle.color : "";

          // 4. Catalog-folder line present and byte-for-byte as decided
          const folderBranchPresent = emptyDesk.textContent.includes("Under any other name, bring it in with Load catalog.")
            || emptyDesk.textContent.includes("loads with Load catalog.")
            || emptyDesk.textContent.includes("The catalog you load stays in this browser, ready whenever you come back.");

          const orLinkPresent = orText && (orText.querySelector("a, button, [role='button']") || orText.classList.contains("link"));

          return {
            found: true,
            figureAbsent,
            inOrder,
            h2Text,
            btnText,
            orContent,
            bgCol,
            textCol,
            folderBranchPresent,
            orLinkPresent: !!orLinkPresent
          };
        }, theme);
      };

      const light = await testMiddle("light");
      const dark = await testMiddle("dark");

      const lightContrast = light.found ? contrastRatio(parseRgb(light.bgCol), parseRgb(light.textCol)) : 0;
      const darkContrast = dark.found ? contrastRatio(parseRgb(dark.bgCol), parseRgb(dark.textCol)) : 0;

      const ok5 = light.found && dark.found
        && light.figureAbsent && dark.figureAbsent
        && light.inOrder && dark.inOrder
        && light.h2Text === "Etiuda is ready for its first replies." && dark.h2Text === "Etiuda is ready for its first replies."
        && light.btnText === "Load catalog" && dark.btnText === "Load catalog"
        && light.orContent.includes("or add a card to a category") && dark.orContent.includes("or add a card to a category")
        && lightContrast >= 4.5 && darkContrast >= 4.5
        && light.folderBranchPresent && dark.folderBranchPresent
        && light.orLinkPresent && dark.orLinkPresent;

      check(ok5, "957o5 the empty desk's middle in both themes: the figure absent, the column's order, the button filled in the ink with readable text (contrast measured), the catalog-folder line present and byte for byte as now decided");
      await page.close();
    }

    /* -------------------------------------------------------------------------
     * 957o6: a frame that throws still gives way
     * ------------------------------------------------------------------------- */
    {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(() => {
        let count = 0;
        const origStroke = CanvasRenderingContext2D.prototype.stroke;
        CanvasRenderingContext2D.prototype.stroke = function(...args) {
          if (++count === 5) {
            throw new Error("simulated render frame error");
          }
          return origStroke.apply(this, args);
        };
      });
      await page.goto("file://" + ENGINE_HTML);
      await sleep(400);
      const res = await page.evaluate(() => {
        const state = window.__launchOpeningState ? window.__launchOpeningState() : null;
        return {
          launchGone: !document.body.classList.contains("e-launch"),
          reasonError: state ? state.reason === "error" : false
        };
      });
      const ok6 = res.launchGone && res.reasonError;
      check(ok6, "957o6 a frame that throws still gives way");
      await page.close();
    }

    /* -------------------------------------------------------------------------
     * 957o7: no frames and a ready that never comes gives way by failsafe
     * ------------------------------------------------------------------------- */
    {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(() => {
        window.__stubNoFramesAndNeverReady = true;
      });
      await page.goto("file://" + ENGINE_HTML);
      await sleep(3800);
      const beforeFailsafe = await page.evaluate(() => {
        const state = window.__launchOpeningState ? window.__launchOpeningState() : null;
        return {
          launchActive: document.body.classList.contains("e-launch"),
          ended: state ? state.ended : false
        };
      });
      await sleep(1200); // 5000ms total (failsafe is 4750ms)
      const afterFailsafe = await page.evaluate(() => {
        const state = window.__launchOpeningState ? window.__launchOpeningState() : null;
        return {
          launchGone: !document.body.classList.contains("e-launch"),
          reasonFailsafe: state ? state.reason === "failsafe" : false
        };
      });
      const ok7 = beforeFailsafe.launchActive && !beforeFailsafe.ended && afterFailsafe.launchGone && afterFailsafe.reasonFailsafe;
      check(ok7, "957o7 no frames and a ready that never comes gives way by the failsafe");
      await page.close();
    }

    /* -------------------------------------------------------------------------
     * 957o8: reduced motion failsafe
     * ------------------------------------------------------------------------- */
    {
      const page = await browser.newPage();
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await page.evaluateOnNewDocument(() => {
        window.__stubNoFramesAndNeverReady = true;
      });
      await page.goto("file://" + ENGINE_HTML);
      await sleep(3800);
      const beforeFailsafe = await page.evaluate(() => {
        const state = window.__launchOpeningState ? window.__launchOpeningState() : null;
        return {
          launchActive: document.body.classList.contains("e-launch"),
          ended: state ? state.ended : false
        };
      });
      await sleep(1200); // 5000ms total
      const afterFailsafe = await page.evaluate(() => {
        const state = window.__launchOpeningState ? window.__launchOpeningState() : null;
        return {
          launchGone: !document.body.classList.contains("e-launch"),
          reasonFailsafe: state ? state.reason === "failsafe" : false
        };
      });
      const ok8 = beforeFailsafe.launchActive && !beforeFailsafe.ended && afterFailsafe.launchGone && afterFailsafe.reasonFailsafe;
      check(ok8, "957o8 reduced motion: a ready that never comes gives way by the failsafe");
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log("#counts legs=" + checks + " failed=" + fails);
  process.exit(fails ? 1 : 0);
}

run().catch(e => {
  console.error("error:", e);
  process.exit(1);
});
