/* SILENT UPDATE NEVER STRANDS A DESK: updates-8 condition of 2026-11-01, Board 958 row A7.
 *
 *   node tests/silent-update-desk.js
 *
 * WHAT IT PROVES.
 * An installer-style close (taskkill without /F) with a tab holding a draft exits
 * within the installer's wait (20s), and the next start shows the draft.
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
      path.join(E.ROOT, "shell"),
      "--user-data-dir=" + ud,
      "--remote-debugging-port=" + port,
      "--no-sandbox",
      "--disable-gpu"
    ];

    child = E.launchElectron({ who: WHO, args, docs });
    await sleep(2500);

    browser = await puppeteer.connect({
      browserURL: "http://127.0.0.1:" + port,
      defaultViewport: null
    });

    const pages = await browser.pages();
    const page = pages[0];
    await page.waitForSelector("#paxInput", { timeout: 10000 });
    await page.type("#paxInput", "Draft Customer A");
    await page.waitForSelector("#intentBox", { timeout: 10000 });
    await page.type("#intentBox", "Customer draft message in progress");
    await sleep(500);

    // Disconnect Puppeteer before sending taskkill so CDP does not hold the process
    browser.disconnect();
    browser = null;

    // Installer-style close: taskkill /PID <pid> without /F
    const t0 = Date.now();
    execFileSync("taskkill.exe", ["/PID", String(child.pid)]);

    // Must exit within installer's wait (20s) without modal blocking it
    let exited = false;
    while (Date.now() - t0 < 20000) {
      if (!E.pidAlive(child.pid)) { exited = true; break; }
      await sleep(200);
    }
    const elapsed = Date.now() - t0;
    check(exited && elapsed < 20000,
      "1152j an installer-style close with a draft exits within the wait without a modal (" + elapsed + " ms)");

    // Relaunch the desk on the same user-data folder
    const child2 = E.launchElectron({ who: WHO, args, docs });
    await sleep(2500);

    const browser2 = await puppeteer.connect({
      browserURL: "http://127.0.0.1:" + port,
      defaultViewport: null
    });
    const pages2 = await browser2.pages();
    const page2 = pages2[0];
    await page2.waitForSelector("#paxInput", { timeout: 10000 });
    const restoredPax = await page2.$eval("#paxInput", el => el.value);
    const restoredDraft = await page2.$eval("#intentBox", el => el.value);

    check(restoredPax === "Draft Customer A" && restoredDraft.includes("Customer draft message"),
      "1152k restarting the desk restores the draft tab (" + restoredPax + ")");

    browser2.disconnect();
    E.killTree(child2.pid);
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
