/* run: alone (timing) */
/* CLAIM: no frame-to-frame jump of the theme glyph as seen beyond what a smooth 300 ms turn makes
 *
 *   node tests/theme-roll.mjs
 *
 * Headless Chrome on the built page. Samples the theme icon's angle every frame across
 * single presses and runs of presses at 80 and 150 ms apart, using real input events.
 *
 * Measures the glyph AS SEEN: reads the screen position of the glyph's filled half (taking both
 * the outer svg transform and any inner group transform), and adds 180 degrees under light theme
 * because the currentColor ink inversion swaps the visual positions of the filled and empty halves.
 *
 * A smooth 300 ms turn under cubic-bezier(.2,.7,.3,1) has a peak velocity of ~2.1 deg/ms.
 * At 60 fps (16.7 ms per frame), expected movement is ~35 degrees per frame, and allowing for
 * scheduling jitter up to 35 ms between frames the bound is 80 degrees. An uncompensated ink swap
 * produces an instantaneous ~180 degree jump in a single frame.
 *
 * British English, no em or en dashes.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

if (!process.env.ETIUDA_FIXTURES) {
  process.env.ETIUDA_FIXTURES = "C:/Users/maxim/Workspace/etiuda-fixtures";
}

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

const MAX_JUMP_BOUND = 80; // degrees: smooth 300 ms turn peak is ~2.1 deg/ms (~35 deg at 60 fps, <75 deg at 35 ms jitter); swap without group rotation gives ~180 deg

let fails = 0, checks = 0;
const check = (ok, what) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) fails++;
};

const RUN = E.runFolder("catalogV2", "sampleV2");
let browser = null;

try {
  browser = await puppeteer.launch({
    executablePath: E.browserPath("chrome"),
    headless: true,
    args: ["--hide-scrollbars"],
    protocolTimeout: 120000
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });

  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("eTourDone_v3", "1");
      localStorage.setItem("eTourInvite_v3", "1");
      localStorage.setItem("eAgent", "Roll Agent");
      localStorage.setItem("eNameAsked", "1");
      localStorage.setItem("eTheme", "dark");
    } catch (e) {}
  });

  await page.goto(RUN.url, { waitUntil: "load", timeout: 60000 });
  await require("./launch-wait.js").waitLaunchGone(page, { who: "tests/theme-roll.mjs" });

  await page.waitForFunction(
    () => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0,
    { timeout: 30000 }
  );
  const ecYes = await page.$("#ecYes");
  if (ecYes) await page.click("#ecYes");
  await page.waitForFunction(
    () => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes"),
    { timeout: 30000 }
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getAnimations().length === 0, { timeout: 30000 });

  const btnCoords = await page.$eval("#theme", b => {
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  const client = await page.createCDPSession();
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: btnCoords.x,
    y: btnCoords.y
  });

  async function clickTheme() {
    await client.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: btnCoords.x,
      y: btnCoords.y,
      button: "left",
      clickCount: 1
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: btnCoords.x,
      y: btnCoords.y,
      button: "left",
      clickCount: 1
    });
  }

  // Probe function to sample frames across actions
  async function probeRoll(actionDesc, actionFn, sampleDurationMs) {
    // Install rAF probe
    await page.evaluate(() => {
      window.__rollSamples = [];
      window.__rollStop = false;
      const t0 = performance.now();

      const sample = () => {
        if (window.__rollStop) return;
        const svg = document.querySelector("#theme svg");
        const path = svg ? svg.querySelector("path") : null;
        if (svg && path) {
          const rSvg = svg.getBoundingClientRect();
          const rPath = path.getBoundingClientRect();
          const cx = rSvg.left + rSvg.width / 2;
          const cy = rSvg.top + rSvg.height / 2;
          const px = rPath.left + rPath.width / 2;
          const py = rPath.top + rPath.height / 2;
          const geomDeg = Math.round(Math.atan2(py - cy, px - cx) * 180 / Math.PI);
          const theme = document.documentElement.dataset.theme;
          // When theme is light, ink inverts so the filled half is dark; the visual orientation of the light half is shifted 180 deg
          const seenDeg = theme === "light" ? (geomDeg + 180) % 360 : ((geomDeg % 360) + 360) % 360;
          window.__rollSamples.push({
            t: Math.round(performance.now() - t0),
            geomDeg,
            seenDeg,
            theme
          });
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    // Execute the action (presses)
    await actionFn();

    // Wait out the sampling window
    await new Promise(r => setTimeout(r, sampleDurationMs));

    // Stop sampling and collect samples
    const samples = await page.evaluate(() => {
      window.__rollStop = true;
      return window.__rollSamples || [];
    });

    // Compute frame-to-frame jumps in seen angle
    let worstJump = 0;
    let worstFrom = null;
    let worstTo = null;

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      let d = (curr.seenDeg - prev.seenDeg) % 360;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      const jump = Math.abs(d);
      if (jump > worstJump) {
        worstJump = jump;
        worstFrom = prev;
        worstTo = curr;
      }
    }

    const ok = worstJump <= MAX_JUMP_BOUND;
    const detail = `worst frame-to-frame jump ${worstJump.toFixed(1)} deg (bound <= ${MAX_JUMP_BOUND} deg, ${samples.length} frames sampled)`;
    check(ok, `${actionDesc}: ${detail}`);
    if (!ok && worstFrom && worstTo) {
      console.log(`         jump occurred from t=${worstFrom.t}ms (${worstFrom.seenDeg} deg, theme ${worstFrom.theme}) to t=${worstTo.t}ms (${worstTo.seenDeg} deg, theme ${worstTo.theme})`);
    }
    return { samplesCount: samples.length, worstJump, ok };
  }

  // 1. Single press: dark to light
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.waitForFunction(() => document.getAnimations().length === 0, { timeout: 30000 });
  await probeRoll("single press dark to light", async () => {
    await clickTheme();
  }, 500);

  // 2. Single press: light to dark
  await probeRoll("single press light to dark", async () => {
    await clickTheme();
  }, 500);

  // 3. Run of presses at 150 ms
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.waitForFunction(() => document.getAnimations().length === 0, { timeout: 30000 });
  await probeRoll("run of 5 presses at 150 ms", async () => {
    for (let i = 0; i < 5; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 150));
      await clickTheme();
    }
  }, 1000);

  // 4. Run of presses at 80 ms
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.waitForFunction(() => document.getAnimations().length === 0, { timeout: 30000 });
  await probeRoll("run of 5 presses at 80 ms", async () => {
    for (let i = 0; i < 5; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 80));
      await clickTheme();
    }
  }, 800);

} catch (e) {
  console.log("  FAIL run threw: " + (e && e.message ? e.message : String(e)));
  fails = Math.max(fails, 1);
} finally {
  if (browser) {
    try { await browser.close(); } catch (e) {}
  }
  RUN.drop();
}

console.log("\n" + (checks - fails) + "/" + checks + " checks passed");
process.exit(E.exitOf(fails));
