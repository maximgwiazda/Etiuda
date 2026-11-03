/* The theme disc keeps one steady rate when presses overlap.
 *
 *   node tests/theme-continuity.mjs
 *
 * Headless Chrome on the built page. Real clicks at 80 ms and at 40 ms of the roll's own
 * clock: the transition is paused and its currentTime is set, so a slow frame cannot move
 * the sample. The seen angle is theme-roll.mjs's: the filled half's box centre against the
 * svg's box centre, plus 180 degrees under the light theme, because that theme's ink swaps
 * the two halves.
 *
 * A half-turn at the roll tier is 180 degrees in 300 ms, 0.6 deg/ms. A step may move at most
 * 1 deg/ms of that clock, and a retarget may not move the seen angle by more than 4 degrees.
 * Five presses turn the disc five half-turns, 900 degrees.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

if (!process.env.ETIUDA_FIXTURES) {
  process.env.ETIUDA_FIXTURES = "C:/Users/maxim/Workspace/etiuda-fixtures";
}

const STEP = 10;
const RATE = 1;
const BOUNDARY = 4;
const PRESSES = 5;
const TOTAL = PRESSES * 180;
const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

let fails = 0, checks = 0;
const check = (ok, what) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) fails++;
};

function arc(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

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
  await require("./launch-wait.js").waitLaunchGone(page, { who: "tests/theme-continuity.mjs" });
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

  await page.evaluate(() => {
    window.__themeSeen = () => {
      const svg = document.querySelector("#theme svg");
      const path = svg.querySelector("path");
      const rSvg = svg.getBoundingClientRect();
      const rPath = path.getBoundingClientRect();
      const cx = rSvg.left + rSvg.width / 2;
      const cy = rSvg.top + rSvg.height / 2;
      const px = rPath.left + rPath.width / 2;
      const py = rPath.top + rPath.height / 2;
      const geomDeg = Math.round(Math.atan2(py - cy, px - cx) * 180 / Math.PI);
      const theme = document.documentElement.dataset.theme;
      const seenDeg = theme === "light" ? (geomDeg + 180) % 360 : ((geomDeg % 360) + 360) % 360;
      return { seenDeg, theme };
    };
  });

  const btn = await page.$eval("#theme", b => {
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const client = await page.createCDPSession();
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: btn.x, y: btn.y });

  async function clickTheme() {
    await client.send("Input.dispatchMouseEvent", {
      type: "mousePressed", x: btn.x, y: btn.y, button: "left", clickCount: 1
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseReleased", x: btn.x, y: btn.y, button: "left", clickCount: 1
    });
  }

  async function resetDark() {
    const pose = await page.evaluate(() => {
      const svg = document.querySelector("#theme svg");
      svg.getAnimations().forEach(a => a.cancel());
      svg.style.transition = "none";
      svg.style.transform = "none";
      delete svg.dataset.eTurns;
      delete svg.dataset.eFrom;
      delete svg.dataset.eTo;
      document.documentElement.dataset.theme = "dark";
      void svg.getBoundingClientRect();
      svg.style.transition = "";
      void svg.getBoundingClientRect();
      svg.getAnimations().forEach(a => a.cancel());
      return window.__themeSeen();
    });
    if (pose.seenDeg !== 0 || pose.theme !== "dark") {
      throw new Error("reset left the disc at " + pose.seenDeg + " deg, theme " + pose.theme);
    }
  }

  async function scrub(spacing, last) {
    const before = await page.evaluate(() => window.__themeSeen());
    await clickTheme();
    const got = await page.evaluate((spacing, last, step) => {
      const svg = document.querySelector("#theme svg");
      const anims = svg.getAnimations().filter(a => a.transitionProperty === "transform");
      if (!anims.length) return { error: "no roll" };
      const anim = anims[anims.length - 1];
      anims.forEach(a => a.pause());
      const dur = Number(anim.effect.getComputedTiming().duration);
      const end = last ? dur : Math.min(spacing, dur);
      const marks = [];
      for (let t = 0; t < end; t += step) marks.push(t);
      marks.push(end);
      const samples = marks.map(t => {
        anim.currentTime = t;
        return Object.assign({ t: Math.round(t) }, window.__themeSeen());
      });
      if (!last) anim.currentTime = Math.min(spacing, dur);
      return { samples, dur };
    }, spacing, last, STEP);
    return { before, got };
  }

  function judge(spacing, legs) {
    let worst = null;
    let sum = 0;
    const notes = [];
    for (const leg of legs) {
      if (!leg.got || leg.got.error) {
        notes.push(leg.got && leg.got.error || "no sample");
        continue;
      }
      const first = leg.got.samples[0];
      const boundary = arc(leg.before.seenDeg, first.seenDeg);
      sum += boundary;
      if (Math.abs(boundary) > BOUNDARY) {
        const hit = { kind: "retarget", jump: boundary, from: leg.before, to: first };
        if (!worst || Math.abs(hit.jump) > Math.abs(worst.jump)) worst = hit;
      }
      const samples = leg.got.samples;
      for (let i = 1; i < samples.length; i++) {
        const d = arc(samples[i - 1].seenDeg, samples[i].seenDeg);
        sum += d;
        const dt = samples[i].t - samples[i - 1].t;
        const limit = dt * RATE;
        if (d > limit || d < -2) {
          const hit = { kind: "step", jump: d, dt, limit, from: samples[i - 1], to: samples[i] };
          if (!worst || Math.abs(hit.jump) > Math.abs(worst.jump)) worst = hit;
        }
      }
    }
    const turned = Math.abs(sum - TOTAL) <= 45;
    if (!turned && !worst) {
      worst = { kind: "total", jump: sum, from: null, to: null };
    }
    return { ok: !worst && turned, worst, sum };
  }

  async function runSpacing(spacing) {
    await resetDark();
    const legs = [];
    for (let i = 0; i < PRESSES; i++) legs.push(await scrub(spacing, i === PRESSES - 1));
    return judge(spacing, legs);
  }

  const at80 = await runSpacing(80);
  const at40 = await runSpacing(40);

  const named = (spacing, result) => {
    if (result.ok) {
      return "five presses at " + spacing + " ms: the seen angle stays within "
        + RATE + " deg/ms of the roll and finishes " + Math.round(result.sum) + " deg from the start";
    }
    const w = result.worst;
    if (!w || w.kind === "total") {
      return "five presses at " + spacing + " ms: the disc turned " + Math.round(result.sum)
        + " deg, which is not five half-turns (" + TOTAL + ")";
    }
    if (w.kind === "retarget") {
      return "five presses at " + spacing + " ms: the seen angle jumps " + Math.round(w.jump)
        + " deg when a press retargets the roll, from " + w.from.seenDeg + " deg (" + w.from.theme
        + ") to " + w.to.seenDeg + " deg (" + w.to.theme + ")";
    }
    const rate = w.dt ? Math.abs(w.jump) / w.dt : 0;
    return "five presses at " + spacing + " ms: the seen angle jumps " + Math.round(w.jump)
      + " deg in " + w.dt + " ms of the roll (" + rate.toFixed(1) + " deg/ms; the smooth half-turn is 0.6), from "
      + w.from.seenDeg + " deg at " + w.from.t + " ms to " + w.to.seenDeg + " deg at " + w.to.t
      + " ms, both " + w.from.theme;
  };

  check(at80.ok,
    "952j " + named(80, at80));
  check(at40.ok,
    "952k " + named(40, at40));
} catch (e) {
  console.log("  FAIL run threw: " + (e && e.message ? e.message : String(e)));
  fails = Math.max(fails, 1);
  checks = Math.max(checks, 1);
} finally {
  if (browser) {
    try { await browser.close(); } catch (e) {}
  }
  try { RUN.drop(); } catch (e) {}
}

console.log("\n" + (checks - fails) + "/" + checks + " checks passed");
process.exit(E.exitOf(fails));
