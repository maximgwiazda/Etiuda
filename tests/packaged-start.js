/* THE PACKAGED DESK STARTS WITH ITS MODEL, board 1024.
 *
 * Runs the built win-unpacked application directly, with the built-in model packed,
 * and asserts that it boots cleanly without uncaught exceptions, without displaying
 * the startup banner, and exercises the model search path.
 *
 * Reads ETIUDA_PACKAGED_DIR (default dist/win-unpacked). Refuses with exit 78 and
 * "no verdict" when resources/embed holds no model.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");
const E = require("./engine.js");
const LW = require("./launch-wait.js");

const sleep = ms => new Promise(r => setTimeout(r, ms));

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

E.windowWall("tests/packaged-start.js");
E.refuseWhileElectronLive("tests/packaged-start.js");

const PORT = E.portBlock("packaged-start");
const LEASED = E.takeLeases(["ports:" + PORT], 20, "tests/packaged-start.js");
console.log("       debugging port " + PORT + "; leases: " + LEASED.said);

let checks = 0;
let fails = 0;
const check = (ok, what) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) fails++;
};

async function main() {
  const packagedDir = path.resolve(process.env.ETIUDA_PACKAGED_DIR || path.join(E.ROOT, "dist", "win-unpacked"));
  const exePath = path.join(packagedDir, "Etiuda.exe");

  if (!fs.existsSync(exePath)) {
    console.log("#refused no-package");
    console.log("no verdict: Etiuda.exe not found at " + exePath);
    E.refuse("packaged application is not built at " + exePath);
  }

  const embedModel = path.join(packagedDir, "resources", "embed", "model");
  const onnxFile = path.join(embedModel, "model_q4.onnx");
  if (!fs.existsSync(embedModel) || !fs.existsSync(onnxFile)) {
    console.log("#refused no-model");
    console.log("no verdict: resources/embed holds no model in " + packagedDir);
    E.refuse("resources/embed holds no model: " + embedModel,
      "the packaged desk must carry its model to run this leg");
  }

  const { createLab } = await import("./lab-owner.mjs");
  const lab = createLab("etiuda-packaged-start-");
  const ud = path.join(lab, "user-data");
  const docs = path.join(lab, "docs");
  fs.mkdirSync(docs, { recursive: true });
  const catalogFolder = path.join(lab, "catalog");
  E.pinCatalogFolder(ud, catalogFolder);

  const sampleCatalog = fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8");
  const deskFile = path.join(ud, "desk.json");
  let deskData = { kind: "etiuda-desk", schema: 1, app: "harness", saved: new Date().toISOString(), keys: {} };
  try { deskData = JSON.parse(fs.readFileSync(deskFile, "utf8")); } catch (e) {}
  deskData.keys = deskData.keys || {};
  deskData.keys.eCatalog = sampleCatalog;
  deskData.keys.eTourDone = "1";
  fs.writeFileSync(deskFile, JSON.stringify(deskData), "utf8");

  const child = E.shellLaunch("tests/packaged-start.js", exePath,
    ["--user-data-dir=" + ud, "--remote-debugging-port=" + PORT],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: docs }),
    });

  const stdout = [];
  const stderr = [];
  let childExited = false;
  let exitStatus = null;

  child.stdout.on("data", d => stdout.push(String(d)));
  child.stderr.on("data", d => stderr.push(String(d)));
  child.on("exit", (code, signal) => {
    childExited = true;
    exitStatus = { code, signal };
  });

  let browser = null;
  let page = null;
  const pageErrors = [];

  try {
    const connectDeadline = Date.now() + 20000;
    while (Date.now() < connectDeadline && !browser && !childExited) {
      await sleep(350);
      try {
        browser = await puppeteer.connect({
          browserURL: "http://127.0.0.1:" + PORT,
          defaultViewport: null,
        });
      } catch (x) {}
    }

    if (!browser) {
      const errOut = stderr.join("").trim() || stdout.join("").trim() || "no output";
      check(false, "the packaged desk did not answer on debugging port: " + errOut);
      return;
    }

    const pageDeadline = Date.now() + 15000;
    while (Date.now() < pageDeadline && !page && !childExited) {
      const pages = await browser.pages();
      page = pages.find(p => !p.url().startsWith("about:blank")) || (pages.length ? pages[0] : null);
      if (!page) await sleep(250);
    }

    if (!page) {
      const errOut = stderr.join("").trim() || "no page opened";
      check(false, "the packaged desk opened no page: " + errOut);
      return;
    }

    page.on("pageerror", e => {
      pageErrors.push("pageerror: " + String(e && e.message || e));
    });
    page.on("console", m => {
      if (m.type() === "error") pageErrors.push("console.error: " + m.text());
    });

    let booted = false;
    let bannerSeen = null;
    const startDeadline = Date.now() + 25000;

    while (Date.now() < startDeadline && !booted && !bannerSeen && !childExited) {
      try {
        const read = await page.evaluate(() => {
          const el = document.getElementById("eRescue");
          const r = el ? el.getBoundingClientRect() : null;
          const text = el ? (el.innerText || "") : "";
          const bannerUp = !!(r && r.width > 0 && r.height > 0);
          const bannerStuck = text.indexOf("Startup did not finish.") > -1
            || text.indexOf("Uruchamianie nie dobiegło końca.") > -1;
          const v = typeof window.E_VERSION === "string" ? window.E_VERSION : null;
          return {
            version: v,
            banner: bannerUp && bannerStuck ? text.trim() : null,
          };
        });

        if (read && read.banner) bannerSeen = read.banner;
        if (read && read.version) booted = read.version;
      } catch (e) {
        /* Context may reload or navigate during boot */
      }

      if (pageErrors.some(e => /TypeError|uncaught/i.test(e))) break;
      if (!booted && !bannerSeen) await sleep(250);
    }

    const typeError = pageErrors.find(e => /TypeError/i.test(e))
      || stderr.find(e => /TypeError/i.test(e));

    if (childExited) {
      const out = stderr.join("").trim() || stdout.join("").trim();
      check(false, "the main process died prematurely with code "
        + (exitStatus ? exitStatus.code : "unknown") + ": " + out);
      return;
    }

    if (typeError) {
      check(false, "uncaught TypeError during desk start: " + typeError);
      return;
    }

    if (bannerSeen) {
      check(false, "the page shows its startup banner: " + bannerSeen);
      return;
    }

    if (!booted) {
      const errDetail = pageErrors.join("; ") || stderr.join("").trim() || "timeout";
      check(false, "the page never booted within deadline: " + errDetail);
      return;
    }

    /* Wait for launch mark to clear */
    await LW.waitLaunchGone(page, {
      who: "tests/packaged-start.js",
      ready: "typeof window.E_VERSION === \"string\"",
      boundMs: 15000,
    });

    check(true, "the packaged desk started without error, version " + booted);
    check(pageErrors.length === 0, "no uncaught errors in page log: "
      + (pageErrors.length ? pageErrors.join("; ") : "0 error(s)"));

    /* Exercise the model search path */
    const modelDetected = await page.evaluate(() => {
      const h = window.E_HOST;
      if (h && typeof h.aiState === "function") {
        const st = h.aiState();
        return !!(st && st.model);
      }
      return false;
    });
    check(modelDetected, "the built-in model is active in the desk");

    await page.evaluate(() => {
      const input = document.querySelector("#intent");
      if (input) input.focus();
    });
    await page.keyboard.type("refund", { delay: 10 });
    await sleep(1500);

    const painted = await page.evaluate(() => {
      const cards = document.querySelectorAll("#list .card");
      const rail = document.querySelectorAll("#intentRailList .rail-item");
      return { cards: cards.length, rail: rail.length };
    });

    check(painted.cards > 0 || painted.rail > 0,
      "one search typed into the desk's search, with the result list painting: "
      + painted.cards + " card(s), " + painted.rail + " rail item(s)");
  } finally {
    if (browser) {
      try { await browser.disconnect(); } catch (e) {}
    }
    if (child && child.pid) {
      try { E.killTree(child.pid); } catch (e) {}
    }
    E.releaseLeases();
  }
}

main().then(() => {
  console.log("#counts checks=" + checks + " failed=" + fails + " notRun=0");
  console.log("packaged-start: " + (fails === 0 ? "ok" : "FAILED") + " " + checks + " check(s), " + fails + " failed");
  process.exit(fails ? E.exitOf(fails) : 0);
}).catch(err => {
  console.error("  FAIL " + String(err && err.stack || err));
  fails++;
  console.log("#counts checks=" + checks + " failed=" + fails + " notRun=0");
  process.exit(E.exitOf(fails));
});
