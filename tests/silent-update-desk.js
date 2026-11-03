/* SILENT UPDATE NEVER STRANDS A DESK: updates-8 condition of 2026-11-01, Board 958 row A7.
 *
 *   node tests/silent-update-desk.js
 *
 * WHAT IT PROVES.
 * An installer-style close (running the executable with --update-close, followed by
 * taskkill without /F) with a tab holding a draft exits within the installer's wait (20s)
 * without a modal, and the next start restores the draft.
 *
 * WALLED BEHIND THE WINDOW WALL. Never opens a window when the variable is not set.
 *
 * Exit code is the number of failed checks, capped at 63; 78 where the run produced no verdict.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const puppeteer = require("puppeteer-core");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const WHO = "tests/silent-update-desk.js";
E.windowWall(WHO);

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

const PORT = E.portBlock("silent-update-desk");
E.refuseWhileElectronLive(WHO);
const LEASED = E.takeLeases(["ports:" + PORT], 20, WHO);
console.log("       debugging port(s) count up from " + PORT + "; leases: " + LEASED.said);

let checks = 0, fails = 0;
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };

function electronExe() {
  const dir = path.join(E.ROOT, "node_modules", "electron");
  return path.join(dir, "dist", fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim());
}

/* The desk's debugging port, waited for as tests/desk.js waits: a busy machine brings the window up late. */
async function connected(port) {
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try { return await puppeteer.connect({ browserURL: "http://127.0.0.1:" + port, defaultViewport: null }); } catch (x) { /* not up yet */ }
  }
  throw new Error("the desk did not answer on the debugging port within 20 s");
}

async function main() {
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-silent-update-"));
  const ud = path.join(lab, "user-data");
  const docs = path.join(lab, "documents");
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(docs, { recursive: true });
  E.pinCatalogFolder(ud, docs);

  let child = null, browser = null;
  try {
    const port = PORT;
    const args = [
      E.ROOT,
      "--user-data-dir=" + ud,
      "--remote-debugging-port=" + port
    ];

    child = E.shellLaunch(WHO, electronExe(), args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: docs })
    });
    browser = await connected(port);

    const pages = await browser.pages();
    const page = pages[0];
    await page.waitForSelector("#paxInput", { timeout: 10000 });
    await page.type("#paxInput", "Draft Customer A");
    await page.waitForSelector("#intentBox", { timeout: 10000 });
    await page.type("#intentBox", "Customer draft message in progress");
    await sleep(500);

    // Disconnect Puppeteer before sending the installer signal so CDP does not hold the process
    browser.disconnect();
    browser = null;

    // Real installer signal: second instance launched with --update-close
    const t0 = Date.now();
    const second = E.shellLaunch(WHO + " 2nd", electronExe(),
      [E.ROOT, "--user-data-dir=" + ud, "--update-close"],
      { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: docs }) });
    await new Promise(resolve => {
      if (second.exitCode !== null) return resolve();
      second.on("exit", () => resolve());
      setTimeout(resolve, 3000);
    });

    // Followed by installer taskkill if the process has not yet exited
    if (E.pidAlive(child.pid)) {
      try { execFileSync("taskkill.exe", ["/PID", String(child.pid)]); } catch (_) {}
    }

    // Must exit within installer's wait (20s) without modal blocking it
    let exited = false;
    while (Date.now() - t0 < 20000) {
      if (!E.pidAlive(child.pid)) { exited = true; break; }
      await sleep(200);
    }
    const elapsed = Date.now() - t0;
    check(exited && elapsed < 20000,
      "1152l an installer-style close with a draft exits within the wait without a modal (" + elapsed + " ms)");

    // Relaunch the desk on the same user-data folder
    const child2 = E.shellLaunch(WHO + " 2", electronExe(), args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: docs })
    });
    const browser2 = await connected(port);
    const pages2 = await browser2.pages();
    const page2 = pages2[0];
    await page2.waitForSelector("#paxInput", { timeout: 10000 });
    const restoredPax = await page2.$eval("#paxInput", el => el.value);
    const restoredDraft = await page2.$eval("#intentBox", el => el.value);

    check(restoredPax === "Draft Customer A" && restoredDraft.includes("Customer draft message"),
      "1152m restarting the desk restores the draft tab (" + restoredPax + ")");

    browser2.disconnect();
    E.killTree(child2.pid);

    // First instance launched with --update-close exits at once with no window
    const tFirst = Date.now();
    const first = E.shellLaunch(WHO + " 1st", electronExe(),
      [E.ROOT, "--user-data-dir=" + ud, "--update-close"],
      { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: docs }) });
    let firstExited = false;
    await new Promise(resolve => {
      if (first.exitCode !== null) { firstExited = true; return resolve(); }
      first.on("exit", () => { firstExited = true; resolve(); });
      setTimeout(resolve, 3000);
    });
    const elapsedFirst = Date.now() - tFirst;
    const firstCleanExit = firstExited && first.exitCode === 0 && elapsedFirst < 3000;
    if (!firstExited && E.pidAlive(first.pid)) E.killTree(first.pid);
    check(firstCleanExit,
      "1152n a first instance with --update-close exits at once with no window (" + elapsedFirst + " ms)");
  } finally {
    if (browser) { try { browser.disconnect(); } catch {} }
    if (child && E.pidAlive(child.pid)) E.killTree(child.pid);
    try { fs.rmSync(lab, { recursive: true, force: true }); } catch {}
  }

  process.exit(fails ? Math.min(fails, 63) : 0);
}

main().catch(err => {
  console.error("  FAIL " + (err && err.message || err));
  process.exit(1);
});
