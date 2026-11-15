/* The guided tour remembers the step it was left on across a quit, and opens there again.
 *
 *   node tests/tour-resume.mjs
 *
 * Headless Chrome on the built engine page (with and without the shipped sample catalog).
 * Checks persistence in localStorage across Skip, Esc, tab close, and full browser quit/relaunch;
 * Finish clears the kept step; leaving partway after a prior Finish still resumes there;
 * first-run auto-start and mid-tour session reload keep working unchanged.
 * ETIUDA_PLANTS=off skips the inline plant check with a NOT RUN line.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import * as esbuild from "esbuild";
import { OPTIONS } from "../tools/bundler-probe/build.mjs";

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

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-tour-resume-"));
const dirEmpty = path.join(lab, "empty");
const dirCat = path.join(lab, "cat");
const dirPlant = path.join(lab, "plant");
const profileEmpty = path.join(lab, "prof-empty");
const profileCat = path.join(lab, "prof-cat");
const profilePlant = path.join(lab, "prof-plant");

for (const d of [dirEmpty, dirCat, dirPlant, profileEmpty, profileCat, profilePlant]) {
  fs.mkdirSync(d, { recursive: true });
}
const sampleJs = "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n";
fs.copyFileSync(E.ENGINE_PATH, path.join(dirEmpty, "etiuda.html"));
fs.copyFileSync(E.ENGINE_PATH, path.join(dirCat, "etiuda.html"));
fs.writeFileSync(path.join(dirCat, "etiuda-catalog.js"), sampleJs, "utf8");
fs.writeFileSync(path.join(dirPlant, "etiuda-catalog.js"), sampleJs, "utf8");

const fileUrl = p => "file:///" + p.replace(/\\/g, "/");
const urlEmpty = fileUrl(path.join(dirEmpty, "etiuda.html"));
const urlCat = fileUrl(path.join(dirCat, "etiuda.html"));

async function launchWithProfile(userDataDir) {
  return puppeteer.launch({
    executablePath: E.browserPath("chrome"),
    headless: "new",
    userDataDir,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
  });
}

async function openDesk(browser, url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector(".e-launch-veil"), { timeout: 30000 }).catch(() => {});
  return page;
}

async function acceptCatalogIfOffered(page) {
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 15000 });
  if (await page.$("#ecYes")) {
    await page.click("#ecYes");
  }
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes"), { timeout: 15000 });
}

async function tourState(page) {
  return page.evaluate(() => {
    const root = document.getElementById("tourRoot");
    const on = !!(root && !root.hidden && root.classList.contains("on"));
    const title = (document.getElementById("tourTitle") || {}).textContent || "";
    const next = document.getElementById("tourNext");
    return {
      on,
      title: title.trim(),
      nextText: next ? next.textContent.trim() : "",
      ssAt: sessionStorage.getItem("eTourAt"),
      lsAt: localStorage.getItem("eTourAt"),
      lsDone: localStorage.getItem("eTourDone_v3"),
      lsInvite: localStorage.getItem("eTourInvite_v3")
    };
  });
}

async function waitTourOn(page, timeoutMs = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const st = await tourState(page);
    if (st.on && st.title) {
      await sleep(160);
      return tourState(page);
    }
    await sleep(60);
  }
  return tourState(page);
}

async function clickNext(page, expectedTitle) {
  const before = (await tourState(page)).ssAt;
  await page.evaluate(() => {
    const btn = document.getElementById("tourNext");
    if (btn) btn.click();
  });
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    const st = await tourState(page);
    if (expectedTitle) {
      if (st.on && st.title === expectedTitle) {
        await sleep(140);
        return tourState(page);
      }
    } else if (st.on && st.ssAt !== before) {
      await sleep(140);
      return tourState(page);
    }
    await sleep(60);
  }
  return tourState(page);
}

async function clickSkip(page) {
  await page.evaluate(() => {
    const btn = document.getElementById("tourSkip");
    if (btn) btn.click();
  });
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) {
    const st = await tourState(page);
    if (!st.on) return st;
    await sleep(50);
  }
  return tourState(page);
}

async function openMenuAndStartTour(page) {
  await page.waitForFunction(() => !document.querySelector(".e-launch-veil"), { timeout: 15000 });
  const isOpen = await page.evaluate(() => {
    const m = document.getElementById("settingsMenu");
    return !!(m && !m.hidden);
  });
  if (!isOpen) {
    await page.click("#settingsBtn");
  }
  await page.waitForFunction(() => {
    const m = document.getElementById("settingsMenu");
    return !!(m && !m.hidden && m.querySelector('[data-act="tour"]'));
  }, { timeout: 10000 });
  await page.click('#settingsMenu [data-act="tour"]');
  return waitTourOn(page);
}

async function buildLiftedHtml(tag, outPath) {
  const tourPath = path.join(E.ROOT, "src", "modules", "tour.js");
  const lines = fs.readFileSync(tourPath, "utf8").split("\n");
  const plantAt = lines.findIndex(l => l.indexOf(tag) >= 0);
  if (plantAt < 0) return -1;
  lines.splice(plantAt, 1);
  const liftedSource = lines.join("\n");
  const built = await esbuild.build({
    ...OPTIONS,
    entryPoints: [path.join(E.ROOT, "src", "main.js")],
    plugins: [{
      name: "lift-plant",
      setup(b) {
        b.onLoad({ filter: /[\\/]src[\\/]modules[\\/]tour\.js$/ }, () => ({
          contents: liftedSource,
          loader: "js"
        }));
      }
    }]
  });
  let js = built.outputFiles[0].text;
  js = js.split('"@E_BUILT@"').join('"2026-11-15"')
    .split('"@EULA_EN@"').join('""')
    .split('"@EULA_PL@"').join('""');
  const template = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
  const html = template.replace("/*@APP*/\n", () => js);
  fs.writeFileSync(outPath, html, "utf8");
  return plantAt;
}

let browser = null;
try {
  // 1. Empty desk: Skip on step 1 keeps no step; Next to load -> Skip keeps "load" across relaunch
  browser = await launchWithProfile(profileEmpty);
  let page = await openDesk(browser, urlEmpty);
  let st = await waitTourOn(page);
  check(st.on && st.ssAt === "name", "first launch auto-starts tour on welcome step", st);
  st = await clickSkip(page);
  check(!st.on && st.ssAt === null && st.lsAt === null && st.lsInvite === "1",
    "skipping on step 1 leaves persistent step empty", st);

  st = await openMenuAndStartTour(page);
  check(st.on && st.ssAt === "name", "Menu tour starts on welcome when nothing kept", st);
  st = await clickNext(page, "A catalog of replies");
  st = await clickSkip(page);
  check(!st.on && st.ssAt === null && st.lsAt === "load",
    "skipping on load step clears session step and keeps persistent step", st);

  await browser.close();
  browser = await launchWithProfile(profileEmpty);
  page = await openDesk(browser, urlEmpty);
  await sleep(1700);
  st = await tourState(page);
  check(!st.on && st.lsAt === "load",
    "fresh launch with kept step does not auto-start tour", st);
  st = await openMenuAndStartTour(page);
  check(st.on && st.ssAt === "load" && st.title === "A catalog of replies",
    "opening tour from Menu after relaunch resumes on kept load step", st);
  await browser.close();
  browser = null;

  // 2. Sample catalog desk: load catalog once, walk to rail, Skip, browser quit/relaunch -> opens on rail
  browser = await launchWithProfile(profileCat);
  page = await openDesk(browser, urlCat);
  st = await waitTourOn(page);
  await clickSkip(page);
  await acceptCatalogIfOffered(page);

  st = await openMenuAndStartTour(page);
  st = await clickNext(page, "The customer's name");
  st = await clickNext(page, "Search");
  st = await clickNext(page, "Intent panel");
  st = await clickSkip(page);
  check(!st.on && st.ssAt === null && st.lsAt === "rail",
    "skipping on rail clears session step and persists rail", st);

  await browser.close();
  browser = await launchWithProfile(profileCat);
  page = await openDesk(browser, urlCat);
  await sleep(1700);
  st = await tourState(page);
  check(!st.on && st.lsAt === "rail",
    "relaunching catalog desk does not auto-start partway tour", st);
  st = await openMenuAndStartTour(page);
  check(st.on && st.ssAt === "rail" && st.title === "Intent panel",
    "opening from Menu after quit resumes on rail", st);

  // 3. Esc closes partway and keeps next step ("cards"), opens on "cards"
  await clickNext(page, "Cards");
  await page.evaluate(() => { const b = document.getElementById("tourNext"); if (b) b.focus(); });
  await page.keyboard.press("Escape");
  await sleep(300);
  st = await tourState(page);
  check(!st.on && st.ssAt === null && st.lsAt === "cards",
    "pressing Escape closes tour and keeps cards step", st);

  // 4. Finish clears kept step; reopening after Finish starts at welcome; partway again resumes partway
  st = await openMenuAndStartTour(page);
  for (let n = 0; n < 30; n++) {
    const cur = await tourState(page);
    if (cur.nextText === "Finish") break;
    await page.evaluate(() => { const b = document.getElementById("tourNext"); if (b) b.click(); });
    await sleep(120);
  }
  await page.evaluate(() => { const b = document.getElementById("tourNext"); if (b) b.click(); });
  await sleep(350);
  st = await tourState(page);
  check(!st.on && st.lsDone === "1" && st.lsAt === null && st.ssAt === null,
    "finishing tour sets done and clears kept step", st);

  await page.click('#tabsBar .tab[data-tid]');
  await sleep(120);
  st = await openMenuAndStartTour(page);
  check(st.on && st.ssAt === "name" && st.title === "Welcome to Etiuda",
    "opening tour from Menu after Finish starts on step 1", st);
  await clickNext(page, "The customer's name");
  await clickNext(page, "Search");
  await clickSkip(page);
  await page.close();
  page = await openDesk(browser, urlCat);
  await sleep(1700);
  st = await openMenuAndStartTour(page);
  check(st.on && st.lsDone === "1" && st.ssAt === "search" && st.title === "Search",
    "one rule: tour left partway after Finish opens on kept step across relaunch", st);

  // 5. Requirement 3: reload while tour open still resumes automatically via sessionStorage
  await clickNext(page, "Intent panel");
  await page.reload({ waitUntil: "load" });
  st = await waitTourOn(page, 3500);
  check(st.on && st.ssAt === "rail" && st.title === "Intent panel",
    "reloading browser while tour active still resumes automatically on rail", st);
  await browser.close();
  browser = null;

  // 6. Inline plant proof: removing plant:tour-save-step causes Menu reopen after quit to lose step
  if (PLANTS_OFF) {
    notRun("plant:tour-save-step (ETIUDA_PLANTS=off)");
  } else {
    const liftedPath = path.join(dirPlant, "etiuda.html");
    const plantAt = await buildLiftedHtml("plant:tour-save-step", liftedPath);
    let liftedOpensAt = null;
    if (plantAt >= 0) {
      browser = await launchWithProfile(profilePlant);
      page = await openDesk(browser, fileUrl(liftedPath));
      st = await waitTourOn(page);
      await clickSkip(page);
      await acceptCatalogIfOffered(page);
      await openMenuAndStartTour(page);
      await clickNext(page, "The customer's name");
      await clickNext(page, "Search");
      await clickNext(page, "Intent panel");
      await clickSkip(page);
      await browser.close();
      browser = await launchWithProfile(profilePlant);
      page = await openDesk(browser, fileUrl(liftedPath));
      await sleep(1600);
      liftedOpensAt = await openMenuAndStartTour(page);
      await browser.close();
      browser = null;
    }
    check(plantAt >= 0 && !!liftedOpensAt && liftedOpensAt.on && liftedOpensAt.ssAt === "name",
      "lifting plant:tour-save-step causes reopen after quit to lose step and return to welcome",
      { plantAt, liftedOpensAt });
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
