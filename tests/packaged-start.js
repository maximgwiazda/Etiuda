/* THE PACKAGED DESK STARTS WITH ITS MODEL, board 1024.
 *
 * Runs the built win-unpacked application, with the built-in model packed, and goes red when
 * that desk does not come up as a person would see it: the main process dies, stderr carries
 * an uncaught error, the page shows a rescue banner (any kind but the quiet storage notice),
 * or the page never boots. The boot guard reloads once on a crash before it shows the banner,
 * and the version is set before that crash, so a version alone is not a boot. One search is
 * then typed, so the path that runs only with the model present runs, and the result list paints.
 *
 * Reads ETIUDA_PACKAGED_DIR (default dist/win-unpacked). Refuses with exit 78 and "no verdict"
 * when resources/embed holds no model.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");
const E = require("./engine.js");
const LW = require("./launch-wait.js");

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* How long after the first read of the page the leg keeps watching. The guard's silent repair
   reloads at once and the stuck banner is its own 8 s, so this covers both and what follows. */
const AFTER_FIRST_MS = 10000;
const WATCH_CAP_MS = 30000;

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

/* The quiet notice is the guard's storage line, said while the desk is up. Every other
   visible rescue is a start that failed. */
function quietStorageNotice(text) {
  const t = String(text || "");
  const unsaved = t.indexOf("cannot save its settings here") > -1
    || t.indexOf("nie może tu zapisywać ustawień") > -1;
  const failed = t.indexOf("could not start") > -1
    || t.indexOf("Nie udało się uruchomić") > -1
    || t.indexOf("Startup did not finish") > -1
    || t.indexOf("Uruchamianie nie dobiegło końca") > -1;
  return unsaved && !failed;
}

function faultLine(text) {
  const lines = String(text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.indexOf("TypeError") > -1 || line.indexOf("Uncaught") > -1) return line.slice(0, 400);
  }
  return "";
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return !!(e && e.code === "EPERM"); }
}

/* The exit hook removes the lab too, and a remove that starts while the desk still holds
   the folder can take owner.json and leave the rest. Kill first, then remove, and if the
   folder remains put the owner file back and keep the hook from trying again. */
async function dropLab(lab, child) {
  if (child && child.pid) {
    try { E.killTree(child.pid); } catch (e) { /* already gone */ }
    const until = Date.now() + 8000;
    while (Date.now() < until && pidAlive(child.pid)) await sleep(200);
  }
  if (!lab) return;
  const { removeLab } = await import("./lab-owner.mjs");
  const until = Date.now() + 8000;
  for (;;) {
    removeLab(lab);
    if (!fs.existsSync(lab)) {
      console.log("       lab removed");
      return;
    }
    if (Date.now() >= until) break;
    await sleep(400);
  }
  const ownerFile = path.join(lab, "owner.json");
  try {
    fs.writeFileSync(ownerFile, JSON.stringify({ pid: process.pid }, null, 2) + "\n");
  } catch (e) { /* the line below says the folder is still there */ }
  process.env.ETIUDA_KEEP_LAB = "1";
  console.log("       lab left at " + lab + " (owner.json kept; the desk still held files)");
}

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

  const { catalogFromV2 } = await import("../src/modules/catalog-v2.js");
  const sampleFile = path.join(E.ROOT, "shell", "sample-catalog.ec");
  const runtimeCatalog = catalogFromV2(JSON.parse(fs.readFileSync(sampleFile, "utf8")));

  const { createLab } = await import("./lab-owner.mjs");
  const lab = createLab("etiuda-packaged-start-");
  const ownerFile = path.join(lab, "owner.json");
  if (!fs.existsSync(ownerFile)) {
    fs.writeFileSync(ownerFile, JSON.stringify({ pid: process.pid }, null, 2) + "\n");
  }
  let child = null;
  let browser = null;

  try {
    const ud = path.join(lab, "user-data");
    const docs = path.join(lab, "docs");
    fs.mkdirSync(docs, { recursive: true });
    const catalogFolder = path.join(lab, "catalog");
    E.pinCatalogFolder(ud, catalogFolder);

    const deskFile = path.join(ud, "desk.json");
    let deskData = { kind: "etiuda-desk", schema: 1, app: "harness", saved: new Date().toISOString(), keys: {} };
    try { deskData = JSON.parse(fs.readFileSync(deskFile, "utf8")); } catch (e) { /* pin wrote it */ }
    deskData.keys = deskData.keys || {};
    /* The stored catalog is the runtime shape storedCatalog applies. The file's own shape has
       cards and still is not that shape, so a search would paint nothing. */
    deskData.keys.eCatalog = JSON.stringify(runtimeCatalog);
    /* tour.js tourStorageKey, so a first run does not cover the search. */
    deskData.keys.eTourDone_v3 = "1";
    deskData.keys.eTourInvite_v3 = "1";
    fs.writeFileSync(deskFile, JSON.stringify(deskData), "utf8");

    child = E.shellLaunch("tests/packaged-start.js", exePath,
      ["--user-data-dir=" + ud, "--remote-debugging-port=" + PORT],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: E.offscreenEnv({
          ETIUDA_TEST_DOCUMENTS: docs,
          ELECTRON_ENABLE_LOGGING: "1",
        }),
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

    const lowered = E.lowerTree(child.pid);
    if (lowered.asked) console.log("       launched tree " + lowered.below + "/" + lowered.n + " below normal");

    const connectDeadline = Date.now() + 20000;
    while (Date.now() < connectDeadline && !browser && !childExited) {
      await sleep(350);
      try {
        browser = await puppeteer.connect({
          browserURL: "http://127.0.0.1:" + PORT,
          defaultViewport: null,
        });
      } catch (x) { /* the port opens a moment after the process */ }
    }

    if (childExited && !browser) {
      const out = stderr.join("").trim() || stdout.join("").trim() || "no output";
      check(false, "the main process died before it answered: code "
        + (exitStatus ? exitStatus.code : "unknown") + ": " + out.slice(0, 500));
      return;
    }
    if (!browser) {
      const errOut = stderr.join("").trim() || stdout.join("").trim() || "no output";
      check(false, "the packaged desk did not answer on debugging port: " + errOut.slice(0, 500));
      return;
    }

    let page = null;
    const pageDeadline = Date.now() + 15000;
    while (Date.now() < pageDeadline && !page && !childExited) {
      const pages = await browser.pages();
      page = pages.find(p => p.url() && p.url().indexOf("devtools://") !== 0 && !p.url().startsWith("about:blank"))
        || pages.find(p => p.url().indexOf("devtools://") !== 0)
        || null;
      if (!page) await sleep(250);
    }

    if (!page) {
      const errOut = stderr.join("").trim() || "no page opened";
      check(false, "the packaged desk opened no page: " + errOut.slice(0, 500));
      return;
    }

    /* A listener attached here misses a throw from the first load. stderr, the banner and
       eBootTry are the record; this only adds a throw that lands after the connection. */
    const pageErrors = [];
    page.on("pageerror", e => {
      pageErrors.push("pageerror: " + String(e && e.message || e));
    });
    page.on("console", m => {
      if (m.type() === "error") pageErrors.push("console.error: " + m.text());
    });

    const readStart = () => page.evaluate(() => {
      const el = document.getElementById("eRescue");
      const r = el ? el.getBoundingClientRect() : null;
      const text = el ? String(el.innerText || "") : "";
      let bootTry = null;
      try { bootTry = sessionStorage.getItem("eBootTry"); } catch (e) { bootTry = null; }
      return {
        visible: !!(el && r && r.width > 0 && r.height > 0),
        text: text,
        bootTry: bootTry,
        version: typeof window.E_VERSION === "string" ? window.E_VERSION : "",
      };
    });

    let firstSeen = 0;
    let last = null;
    let bannerFault = "";
    let logFault = "";
    const watchStart = Date.now();

    while (Date.now() < watchStart + WATCH_CAP_MS && !childExited) {
      logFault = faultLine(stderr.join("\n")) || faultLine(pageErrors.join("\n"));
      if (logFault) break;
      try {
        const read = await readStart();
        if (!firstSeen) firstSeen = Date.now();
        last = read;
        if (read.visible && !quietStorageNotice(read.text)) {
          bannerFault = read.text.trim();
          break;
        }
      } catch (e) {
        try {
          const pages = await browser.pages();
          const next = pages.find(p => p.url() && p.url().indexOf("devtools://") !== 0) || null;
          if (next && next !== page) {
            page = next;
            page.removeAllListeners("pageerror");
            page.removeAllListeners("console");
            page.on("pageerror", err => {
              pageErrors.push("pageerror: " + String(err && err.message || err));
            });
            page.on("console", m => {
              if (m.type() === "error") pageErrors.push("console.error: " + m.text());
            });
          }
        } catch (e2) { /* a reload drops the context for one read */ }
      }
      if (firstSeen && Date.now() >= firstSeen + AFTER_FIRST_MS) break;
      await sleep(250);
    }

    if (childExited) {
      const out = stderr.join("").trim() || stdout.join("").trim();
      check(false, "the main process died during start with code "
        + (exitStatus ? exitStatus.code : "unknown") + ": " + out.slice(0, 500));
      return;
    }

    const held = firstSeen ? (Date.now() - firstSeen) : 0;
    console.log("       watched " + held + " ms after the first read of the page");

    if (logFault) {
      check(false, "uncaught error during desk start: " + logFault);
      return;
    }
    if (bannerFault) {
      check(false, "the page shows its startup banner: " + bannerFault.slice(0, 400));
      return;
    }
    if (last && last.bootTry === "1") {
      check(false, "the boot guard records a start failure (eBootTry=1) and the desk did not clear it");
      return;
    }
    if (!last || !last.version) {
      const errDetail = pageErrors.join("; ") || stderr.join("").trim() || "timeout";
      check(false, "the page never booted within the boot window: " + errDetail.slice(0, 500));
      return;
    }

    await LW.waitLaunchGone(page, {
      who: "tests/packaged-start.js",
      ready: "typeof window.E_VERSION === \"string\"",
      boundMs: 15000,
    });

    check(true, "the packaged desk started without error, version " + last.version);
    const lateFault = faultLine(pageErrors.join("\n")) || faultLine(stderr.join("\n"));
    check(!lateFault && pageErrors.length === 0, "no uncaught errors in the page log: "
      + (lateFault || (pageErrors.length ? pageErrors.join("; ") : "0 error(s)")));

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
      try { await browser.disconnect(); } catch (e) { /* the desk may already be gone */ }
    }
    await dropLab(lab, child);
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
