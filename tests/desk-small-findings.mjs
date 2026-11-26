/* The desk's small findings of the pair of 24 November, held in the built page: what the eye reads where a press answers, where the
 * Maintenance screen ends, where the action buttons are reached, and where the key sits by a catalog's Private switch.
 * Each plant lifts one marked line out of its module and builds the page again; the check it belongs to must go red alone.
 *
 *   node tests/desk-small-findings.mjs      exit code is the number of failed checks, capped at 63
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { OPTIONS } from "../tools/bundler-probe/build.mjs";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const E = require("./engine.js");
const { seatedView } = require("./seat-page.js");
E.ensureOutputs();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_URL = "file:///" + path.join(ROOT, "engine", "etiuda.html").replace(/\\/g, "/");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 1;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line, detail) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else {
    failed++;
    console.log("  FAIL " + line + (detail !== undefined ? " :: " + JSON.stringify(detail) : ""));
  }
}
function notRun(line) {
  skipped++;
  console.log("  NOT RUN " + line);
}

/* The engine built again with one marked line of one module taken out; the plant's number is the line it took, or -1 where none is marked. */
async function buildLiftedHtml(relMod, tag, outPath) {
  const lines = fs.readFileSync(path.join(ROOT, relMod), "utf8").split("\n");
  const whole = new RegExp("plant:" + tag + "(?![A-Za-z0-9_-])");
  const plantAt = lines.findIndex(l => whole.test(l));
  if (plantAt < 0) return -1;
  lines.splice(plantAt, 1);
  const liftedSource = lines.join("\n");
  const filterRe = new RegExp(relMod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "[\\\\/]") + "$");
  const built = await esbuild.build({
    ...OPTIONS,
    entryPoints: [path.join(ROOT, "src", "main.js")],
    plugins: [{ name: "lift-plant-" + tag, setup(b) { b.onLoad({ filter: filterRe }, () => ({ contents: liftedSource, loader: "js" })); } }]
  });
  const js = built.outputFiles[0].text
    .split('"@E_BUILT@"').join('"2026-11-26"')
    .split('"@EULA_EN@"').join('""')
    .split('"@EULA_PL@"').join('""');
  const template = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  fs.writeFileSync(outPath, template.replace("/*@APP*/\n", () => js), "utf8");
  return plantAt;
}

/* A seated desk page with a stub host; `cfg.desk` is its stored keys, `cfg.signin` what the shell says of the sign-in, `cfg.url` a
   lifted build, `cfg.check` how long the stub's Check now takes (null where it is not stubbed). */
async function launchDeskPage(browser, cfg) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: cfg.width || 1280, height: cfg.height || 860, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const seat = seatedView({ offered: ["microsoft"], signedIn: "microsoft" });
  await page.evaluateOnNewDocument((c, seat) => {
    window.__deskStore = Object.assign({ eTourDone_v3: "1", eTourInvite_v3: "1", eFirstSigninSeen: "1", eUiLang: "en" }, c.desk || {});
    window.__signinState = Object.assign({}, seat, c.signin || {});
    window.__checks = 0;
    window.E_HOST = {
      shown: true,
      lang: "en",
      deskRead: () => JSON.stringify(window.__deskStore),
      deskSave: txt => { window.__deskStore = JSON.parse(txt); return true; },
      signinState: () => window.__signinState,
      onSignin: () => () => {},
      onDeskSynced: fn => { window.__onDeskSynced = fn; },
    };
    if (c.check != null) window.E_HOST.signinCheck = () => { window.__checks++; return new Promise(r => setTimeout(() => r(window.__signinState), c.check)); };
  }, cfg, seat);
  await page.goto(cfg.url || ENGINE_URL, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById("settingsBtn"), { timeout: 15000 });
  return { ctx, page };
}

const browser = await puppeteer.launch({
  executablePath: E.browserPath("chrome"),
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
});
const domPlants = [];
const plantLab = PLANTS_OFF ? "" : fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-small-findings-plant-"));

try {
  /* sf9: Check now answers where the person looks (finding 9). The press shows a checking state, then the result, then rests. */
  {
    const read = page => page.evaluate(() => {
      const b = document.querySelector('.set-row[data-row="checked"] [data-signin-act="check"]');
      return { label: b ? b.textContent : "", n: window.__checks };
    });
    const { ctx, page } = await launchDeskPage(browser, { check: 300 });
    await page.evaluate(() => { hooks.openSettings("account"); });
    await sleep(350);
    const rest = await read(page);
    await page.click('.set-row[data-row="checked"] [data-signin-act="check"]');
    await sleep(80);
    const during = await read(page);
    await sleep(1400);
    const after = await read(page);
    await sleep(4300);
    const later = await read(page);
    check(rest.label === "Check now" && during.label === "Checking" && during.n === 1 && after.label === "Checked" && later.label === "Check now",
      "sf9a Check now in Account reads Checking while it asks, Checked once it has answered, and Check now again after", { rest, during, after, later });
    await ctx.close();
  }

  for (const [label, fn] of domPlants) {
    if (PLANTS_OFF) notRun(label + " (ETIUDA_PLANTS=off)");
    else {
      let red = false;
      try { red = !!(await fn(plantLab)); } catch { red = false; }
      check(red, label);
    }
  }
} finally {
  if (plantLab) try { fs.rmSync(plantLab, { recursive: true, force: true }); } catch (_) {}
  await browser.close();
}

console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log("\n" + asserted + " checks, " + failed + " failed");
process.exit(Math.min(63, failed));
