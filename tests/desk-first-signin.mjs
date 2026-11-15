/* First-opening sign-in screen: gate, memory, boot order, UI and plants.
 *
 *   node tests/desk-first-signin.mjs    exit code is the number of failed checks, capped at 63
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const E = require("./engine.js");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_URL = "file:///" + path.join(ROOT, "engine", "etiuda.html").replace(/\\/g, "/");
const sleep = ms => new Promise(r => setTimeout(r, ms));

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const P = await import(pathToFileURL(path.join(ROOT, "src", "modules", "signin.js")).href);
const S = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);

/* Part 1: the gate and the memory */
check(typeof P.firstSigninDue === "function" && typeof P.firstSigninSeen === "function" && typeof P.markFirstSigninSeen === "function",
  "fs1a gate and memory functions are exported");
check(typeof P.FIRST_SIGNIN_KEY === "string" && /^e(?:[A-Z]|[0-9a-z]+~)/.test(P.FIRST_SIGNIN_KEY),
  "fs1b stored mark key follows desk storage key shape");

if (typeof P.firstSigninDue === "function") {
  const due = { offered: ["microsoft"], signedIn: "" };
  check(P.firstSigninDue(due, { seen: false, policy: false }) === true,
    "fs1c due when provider offered, signed out, unseen and not a policy desk");
  check(P.firstSigninDue({ offered: ["microsoft", "google"] }, { seen: false, policy: false }) === true,
    "fs1d due with both providers offered");
  check(P.firstSigninDue({ offered: [] }, { seen: false, policy: false }) === false
    && P.firstSigninDue(null, { seen: false, policy: false }) === false
    && P.firstSigninDue({ offered: ["unknown"] }, { seen: false, policy: false }) === false,
    "fs1e not due when no known provider is offered");
  check(P.firstSigninDue({ offered: ["microsoft"], signedIn: "microsoft" }, { seen: false, policy: false }) === false,
    "fs1f not due when already signed in");
  check(P.firstSigninDue(due, { seen: true, policy: false }) === false,
    "fs1g not due when already shown on this desk");
  check(P.firstSigninDue(due, { seen: false, policy: true }) === false,
    "fs1h not due on a policy desk");

  if (typeof P.firstSigninSeen === "function" && typeof P.markFirstSigninSeen === "function" && typeof P.FIRST_SIGNIN_KEY === "string") {
    check(P.firstSigninSeen() === false && P.firstSigninDue(due, { policy: false }) === true,
      "fs1i unseen desk starts unmarked and due");
    P.markFirstSigninSeen();
    check(P.firstSigninSeen() === true && S.lsGet(P.FIRST_SIGNIN_KEY) === "1" && P.firstSigninDue(due, { policy: false }) === false,
      "fs1j markFirstSigninSeen persists mark and closes the gate");
    S.lsDel(P.FIRST_SIGNIN_KEY);
    globalThis.window = { E_HOST: { catalogFolderPolicy: "C:\\Policy\\Team" } };
    check(P.firstSigninDue(due) === false,
      "fs1k default policy check reads eCatalogFolderPinned from E_HOST.catalogFolderPolicy");
    delete globalThis.window;
  }
}

/* Part 2: the order (between opening landing and empty desk / tour) */
async function launchDeskPage(browser, cfg) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: cfg.width || 1280, height: cfg.height || 860, deviceScaleFactor: 1 });
  if (cfg.reducedMotion !== false) {
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  }
  await page.evaluateOnNewDocument(c => {
    window.__deskStore = Object.assign({}, c.desk || {});
    window.__signinState = Object.assign({ offered: [], signedIn: "", reached: true }, c.signin || {});
    window.__signinCbs = [];
    window.__signinStarts = [];
    window.E_HOST = {
      shown: true,
      lang: c.lang || "en",
      catalogFolderPolicy: c.policy || "",
      catalogFolder: c.policy || c.catalogFolder || "",
      deskRead: () => JSON.stringify(window.__deskStore),
      deskSave: txt => { window.__deskStore = JSON.parse(txt); return true; },
      signinState: () => window.__signinState,
      onSignin: fn => { window.__signinCbs.push(fn); return () => {}; },
      signIn: async p => {
        window.__signinStarts.push(p);
        window.__signinState = Object.assign({}, window.__signinState, { busy: p, link: "https://example.invalid/auth" });
        window.__signinCbs.forEach(fn => fn(window.__signinState));
        return true;
      },
      signinAct: async a => {
        window.__signinActs = (window.__signinActs || []).concat(a);
        return true;
      },
      catalogFile: c.catalogFile || "",
      catalogMtime: c.catalogMtime || 0
    };
  }, cfg);
  await page.goto(cfg.url || ENGINE_URL, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}

const browser = await puppeteer.launch({
  executablePath: E.browserPath("chrome"),
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
});

try {
  /* fs2a & fs2b: tour waits while first-opening screen is up, then starts after Not now */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      signin: { offered: ["microsoft", "google"], signedIn: "" }
    });
    await sleep(2200);
    const held = await page.evaluate(() => {
      const scr = document.getElementById("firstSignin");
      const tour = document.getElementById("tourRoot");
      return {
        hasScreen: !!scr && !scr.hidden,
        bodyClass: document.body.classList.contains("e-first-signin"),
        tourHidden: !tour || tour.hidden || !tour.classList.contains("on"),
        seen: window.__deskStore.eFirstSigninSeen === "1"
      };
    });
    check(held.hasScreen && held.bodyClass && held.tourHidden && held.seen,
      "fs2a screen opens on first desk, holds tour past auto-start, and writes mark");

    if (held.hasScreen) await page.click("#firstSigninSkip");
    await sleep(600);
    const afterSkip = await page.evaluate(() => {
      const scr = document.getElementById("firstSignin");
      const tour = document.getElementById("tourRoot");
      return {
        screenClosed: (!scr || scr.hidden) && !document.body.classList.contains("e-first-signin"),
        tourStarted: !!tour && !tour.hidden && tour.classList.contains("on")
      };
    });
    check(afterSkip.screenClosed && afterSkip.tourStarted,
      "fs2b Not now closes screen and allows tour to start");
    await ctx.close();
  }

  /* fs2c: control desks where screen is not due start tour directly as today */
  for (const [label, cfg] of [
    ["no provider", { signin: { offered: [], signedIn: "" } }],
    ["policy desk", { policy: "C:\\Policy\\Team", signin: { offered: ["microsoft"], signedIn: "" } }],
    ["already seen", { desk: { eFirstSigninSeen: "1" }, signin: { offered: ["microsoft"], signedIn: "" } }],
    ["already signed in", { signin: { offered: ["microsoft"], signedIn: "microsoft" } }]
  ]) {
    const { ctx, page } = await launchDeskPage(browser, cfg);
    await sleep(2200);
    const st = await page.evaluate(() => {
      const scr = document.getElementById("firstSignin");
      const tour = document.getElementById("tourRoot");
      return {
        noScreen: (!scr || scr.hidden) && !document.body.classList.contains("e-first-signin"),
        tourStarted: !!tour && !tour.hidden && tour.classList.contains("on")
      };
    });
    check(st.noScreen && st.tourStarted, "fs2c unchanged without screen (" + label + ")");
    await ctx.close();
  }

  /* fs2d: catalog offer behind tour / sign-in when tour already seen also waits for Not now */
  const labDir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-fs-offer-"));
  try {
    const sampleRaw = fs.readFileSync(path.join(ROOT, "shell", "sample-catalog.ec"), "utf8");
    fs.copyFileSync(path.join(ROOT, "engine", "etiuda.html"), path.join(labDir, "etiuda.html"));
    fs.writeFileSync(path.join(labDir, "etiuda-catalog.js"), "window.E_CATALOG = " + sampleRaw + ";\n", "utf8");
    const labUrl = "file:///" + path.join(labDir, "etiuda.html").replace(/\\/g, "/");
    const { ctx, page } = await launchDeskPage(browser, {
      url: labUrl,
      desk: { eTourDone_v3: "1", eTourInvite_v3: "1" },
      signin: { offered: ["microsoft"], signedIn: "" },
      catalogFolder: labDir,
      catalogFile: "sample-catalog.ec",
      catalogMtime: Date.now()
    });
    await sleep(1600);
    const beforeSkip = await page.evaluate(() => ({
      screenUp: document.body.classList.contains("e-first-signin"),
      offerUp: !!document.getElementById("eCatalogOffer")
    }));
    if (beforeSkip.screenUp) await page.click("#firstSigninSkip");
    await sleep(600);
    const afterSkip = await page.evaluate(() => ({
      screenDown: !document.body.classList.contains("e-first-signin"),
      offerUp: !!document.getElementById("eCatalogOffer")
    }));
    check(beforeSkip.screenUp && !beforeSkip.offerUp && afterSkip.screenDown && afterSkip.offerUp,
      "fs2d catalog offer waits behind sign-in screen when tour already done");
    await ctx.close();
  } finally {
    fs.rmSync(labDir, { recursive: true, force: true });
  }
} finally {
  await browser.close();
}

console.log("\n" + asserted + " checks, " + failed + " failed");
process.exit(Math.min(63, failed));
