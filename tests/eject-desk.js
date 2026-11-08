/* EJECT LEAVES THE WINDOW ANSWERING: Max's report of 2026-11-04 11:44, Settings, Catalog & Data, Eject on the active row froze
 * the desk until the process was killed.
 *
 *   node tests/eject-desk.js
 *
 * WHAT IT PROVES. A real window, a sandbox profile, two catalogs in the folder and one loaded: the row's Eject answers, the
 * page still runs a script within the bound, the Library stays with no row marked, and F2 still opens the maintenance
 * screen, which is what Max found dead.
 *
 * WALLED BEHIND THE WINDOW WALL. Never opens a window when the variable is not set.
 *
 * Exit code is the number of failed checks, capped at 63; 78 where the run produced no verdict.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const puppeteer = require("puppeteer-core");
const E = require("./engine.js");
const { waitLaunchGone } = require("./launch-wait.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const WHO = "tests/eject-desk.js";
E.windowWall(WHO);
E.belowNormal();
const PORT = E.portBlock("eject-desk");
E.refuseWhileElectronLive(WHO);
E.takeLeases(["ports:" + PORT], 20, WHO);

let checks = 0, fails = 0;
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };

function electronExe() {
  const dir = path.join(E.ROOT, "node_modules", "electron");
  return path.join(dir, "dist", fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim());
}

async function connected(port) {
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try { return await puppeteer.connect({ browserURL: "http://127.0.0.1:" + port, defaultViewport: null, protocolTimeout: 20000 }); } catch (x) { /* not up yet */ }
  }
  throw new Error("the desk did not answer on the debugging port within 20 s");
}

/* An answer within the bound, or null: a stuck renderer never answers, and a leg has to say so rather than wait with it. */
const within = (work, ms) => Promise.race([Promise.resolve(work).catch(() => null), sleep(ms).then(() => null)]);

async function main() {
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-eject-"));
  const ud = path.join(lab, "user-data");
  const docs = path.join(lab, "documents");
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(docs, { recursive: true });
  E.pinCatalogFolder(ud, docs);
  const deskDoc = JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
  Object.assign(deskDoc.keys, { eTourDone_v3: "1", eTourInvite_v3: "1" });
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(deskDoc), "utf8");

  const FIX = E.fixturesDir() ? E.fixtures("catalogEc", "sampleEc") : E.fixtures("sampleEc");
  fs.copyFileSync(FIX.sampleEc || FIX.catalogEc, path.join(docs, "sample-catalog.ec"));
  fs.copyFileSync(FIX.catalogEc || FIX.sampleEc, path.join(docs, "etiuda-catalog.ec"));

  let child = null, browser = null;
  try {
    child = E.shellLaunch(WHO, electronExe(), [E.ROOT, "--user-data-dir=" + ud, "--remote-debugging-port=" + PORT], {
      stdio: ["ignore", "pipe", "pipe"],
      env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: docs })
    });
    browser = await connected(PORT);
    E.lowerTree(child.pid);
    const page = (await browser.pages())[0];
    await waitLaunchGone(page, { who: WHO, ready: "typeof window.E_VERSION === \"string\"" });

    const yes = await page.waitForSelector("#ecYes", { timeout: 15000 }).catch(() => null);
    if (yes) {
      await yes.click();
      await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0, { timeout: 15000 });
    }
    await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      document.getElementById("settingsBtn").click(); await wait(400);
      document.querySelector('#settingsMenu [data-act="manage"]').click(); await wait(1000);
      const sec = document.querySelector('#screenHost details.manage-sec[data-mg="data"]');
      if (sec) sec.open = true;
    });
    await page.waitForSelector("#mgCatList button[data-ec-eject]", { timeout: 20000 });
    const rows = await page.evaluate(() => document.querySelectorAll("#mgCatList .ec-row").length);
    check(rows >= 2, "1a the Library shows two catalogs with one loaded: " + rows + " row(s)");

    /* The press is not awaited: a click that never returns must not take the leg with it. */
    page.evaluate(() => { setTimeout(() => document.querySelector("#mgCatList button[data-ec-eject]").click(), 0); }).catch(() => {});
    await sleep(3000);
    const alive = await within(page.evaluate(() => 40 + 2), 10000);
    check(alive === 42, "1b after Eject the window still runs a script within 10 s: " + JSON.stringify(alive));
    if (alive === 42) {
      const left = await within(page.evaluate(() => document.querySelectorAll("#mgCatList button[data-ec-eject]").length), 10000);
      check(left === 0, "1c no row is marked as loaded after it: " + JSON.stringify(left));
      await within(page.keyboard.press("Escape"), 5000);
      await sleep(400);
      await within(page.keyboard.press("F2"), 5000);
      await sleep(800);
      const mt = await within(page.evaluate(() => !!document.getElementById("mtEject")), 10000);
      check(mt === true, "1d and F2 opens the maintenance screen: " + JSON.stringify(mt));
    }
  } finally {
    if (browser) { try { browser.disconnect(); } catch {} }
    if (child && E.pidAlive(child.pid)) E.killTree(child.pid);
    await sleep(800);
    try { fs.rmSync(lab, { recursive: true, force: true }); } catch {}
  }
  console.log("#counts checks=" + checks + " failed=" + fails);
  process.exit(fails ? Math.min(fails, 63) : 0);
}

main().catch(err => {
  console.error("  FAIL " + (err && err.message || err));
  process.exit(1);
});
