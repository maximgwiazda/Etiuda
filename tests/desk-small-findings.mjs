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
const { seatedView, seatPage } = require("./seat-page.js");
E.ensureOutputs();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_URL = "file:///" + path.join(ROOT, "engine", "etiuda.html").replace(/\\/g, "/");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 16;
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

const SAMPLE = JSON.parse(fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8"));
/* A seated desk page with the sample catalog taken: the cards listed, the tour and the name asked already. */
async function sampleDeskPage(browser, cfg) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: cfg.width || 1280, height: cfg.height || 860, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    let desk = { eTourDone_v3: "1", eTourInvite_v3: "1", eFirstSigninSeen: "1", eAgent: "Bench Agent", eNameAsked: "1", eTheme: "light", eUiLang: "en", eStill: "1", eRail: "1" };
    window.E_HOST = {
      deskRead: () => JSON.stringify(desk), deskSave: t => { desk = JSON.parse(t); return true; }, deskWrite: t => { desk = JSON.parse(t); return Promise.resolve(true); },
      deskPatch: (t, now) => { const p = JSON.parse(t); Object.keys(p).forEach(k => { if (p[k] === null) delete desk[k]; else desk[k] = p[k]; }); return now ? true : Promise.resolve(true); },
      onDeskSynced: () => {}
    };
  });
  await seatPage(page);
  await E.seedCatalog(page, SAMPLE);
  await page.goto(cfg.url || ENGINE_URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await page.$("#ecYes")) { await page.click("#ecYes"); await page.waitForNavigation({ waitUntil: "load", timeout: 15000 }).catch(() => null); }
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes") && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await page.evaluate(() => document.documentElement.classList.add("e-still"));
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
  const sf9run = async url => {
    const read = page => page.evaluate(() => {
      const b = document.querySelector('.set-row[data-row="checked"] [data-signin-act="check"]');
      return { label: b ? b.textContent : "", n: window.__checks };
    });
    const { ctx, page } = await launchDeskPage(browser, { check: 300, url });
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
    await ctx.close();
    return { rest, during, after, later };
  };
  const sf9ok = r => r.rest.label === "Check now" && r.during.label === "Checking" && r.during.n === 1 && r.after.label === "Checked" && r.later.label === "Check now";
  {
    const r = await sf9run();
    check(sf9ok(r), "sf9a Check now in Account reads Checking while it asks, Checked once it has answered, and Check now again after", r);
  }
  for (const [tag, id] of [["check-busy", "sf9b"], ["check-done", "sf9c"]])
    domPlants.push([id + " lifting plant:" + tag + " turns sf9a red", async lab => {
      const htmlPath = path.join(lab, tag + ".html");
      if (await buildLiftedHtml("src/modules/signin.js", tag, htmlPath) < 0) return false;
      return !sf9ok(await sf9run("file:///" + htmlPath.replace(/\\/g, "/")));
    }]);

  /* sf11: Maintenance loses its bottom bar and its Eject catalog; Copy report stands at the foot of its left panel; Settings and the
     Library cross-link in the place Maintenance's button held (finding 11). */
  const sf11run = async url => {
    const { ctx, page } = await launchDeskPage(browser, { url });
    await page.evaluate(() => { openMaintenance(); });
    await sleep(400);
    const mt = await page.evaluate(() => {
      const host = document.getElementById("screenHost");
      const copy = host.querySelector("#mtCopy"), foot = host.querySelector(".sx-nav .sx-foot");
      return {
        bar: !!host.querySelector(".screen-actions"), eject: !!host.querySelector("#mtEject"), done: !!host.querySelector("#mtClose"),
        settings: !!host.querySelector("#mtSettings"), copyInFoot: !!copy && !!foot && foot.contains(copy), copyLabel: copy ? copy.textContent.trim() : ""
      };
    });
    await page.evaluate(() => { window.__copied = ""; try { Object.defineProperty(navigator, "clipboard", { value: { writeText: x => { window.__copied = String(x); return Promise.resolve(); } }, configurable: true }); } catch (e) {} });
    await page.evaluate(() => { document.getElementById("mtCopy").click(); });
    await sleep(300);
    const told = await page.evaluate(() => window.__copied.length > 40 && /Report copied/.test(document.body.textContent));

    await page.evaluate(() => { openSettings(); });
    await sleep(400);
    const st = await page.evaluate(() => {
      const host = document.getElementById("screenHost"), b = host.querySelector(".sx-nav .sx-foot button");
      return { maint: !!host.querySelector("#sxMaint"), id: b ? b.id : "", label: b ? b.textContent.trim() : "" };
    });
    await page.evaluate(() => { document.querySelector("#screenHost .sx-nav .sx-foot button").click(); });
    await sleep(500);
    const inLib = await page.evaluate(() => !!document.querySelector("#screenHost .lib-screen"));

    const lb = await page.evaluate(() => {
      const host = document.getElementById("screenHost"), b = host.querySelector(".sx-nav .sx-foot button");
      return { maint: !!host.querySelector("#libMaint"), id: b ? b.id : "", label: b ? b.textContent.trim() : "" };
    });
    await page.evaluate(() => { const b = document.querySelector("#screenHost .sx-nav .sx-foot button"); if (b) b.click(); });
    await sleep(500);
    const inSet = await page.evaluate(() => !!document.querySelector("#screenHost #setBody"));
    await ctx.close();
    return { mt, told, st, inLib, lb, inSet };
  };
  const sf11a = r => !r.mt.bar && !r.mt.eject && !r.mt.done && !r.mt.settings && r.mt.copyInFoot && r.mt.copyLabel === "Copy report";
  const sf11b = r => r.told;
  const sf11c = r => !r.st.maint && r.st.id === "sxLibrary" && r.st.label === "Library" && r.inLib;
  const sf11d = r => !r.lb.maint && r.lb.id === "libSettings" && r.lb.label === "Settings" && r.inSet;
  {
    const r = await sf11run();
    check(sf11a(r), "sf11a Maintenance has no bottom bar, no Eject catalog, no Done and no Settings button, and Copy report stands in its left panel's foot", r.mt);
    check(sf11b(r), "sf11b Copy report in the left panel's foot still copies the report and says so", r.told);
    check(sf11c(r), "sf11c Settings' left panel foot holds a Library button, not Maintenance's, and it opens the Library", { st: r.st, inLib: r.inLib });
    check(sf11d(r), "sf11d the Library's left panel foot holds a Settings button, not Maintenance's, and it opens Settings", { lb: r.lb, inSet: r.inSet });
  }
  for (const [file, tag, id, judge] of [["src/modules/maintenance.js", "mt-copy-wired", "sf11e", sf11b], ["src/modules/settings.js", "sx-library-open", "sf11f", sf11c],
    ["src/modules/manage.js", "lib-settings-open", "sf11g", sf11d]])
    domPlants.push([id + " lifting plant:" + tag + " turns its check red", async lab => {
      const htmlPath = path.join(lab, tag + ".html");
      if (await buildLiftedHtml(file, tag, htmlPath) < 0) return false;
      return !judge(await sf11run("file:///" + htmlPath.replace(/\\/g, "/")));
    }]);

  /* sf7 and sf21: the action buttons (findings 7 and 21). A button that arrives joins from the left and none that stood moves; the stack
     stays reachable over the editors' dim; an action unrelated to the editors minimises them first, one that is theirs does not. */
  const sf7run = async url => {
    const { ctx, page } = await sampleDeskPage(browser, { url });
    const first = await page.evaluate(() => [...document.querySelectorAll("#list .card[data-id]")].slice(0, 1).map(c => c.dataset.id)[0]);
    const boxes = () => page.evaluate(() => {
      const r = id => { const el = document.getElementById(id); const b = el.getBoundingClientRect(); return el.hidden || !b.width ? null : Math.round(b.left); };
      return { ed: r("edFab"), add: r("addCardFab") };
    });
    const settleFrames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120)))));
    await settleFrames();
    const before = await boxes();
    await page.evaluate(id => openCardEditor(id), first);
    await page.waitForFunction(() => !!document.getElementById("meSave"), { timeout: 10000 });
    await sleep(250);
    /* sf21a: over the open editor's dim, the stack's add button is what a press at its centre meets */
    const reach = await page.evaluate(() => {
      const el = document.getElementById("addCardFab"), b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { shown: !el.hidden && b.width > 0, hit: !!hit && (hit === el || el.contains(hit)) };
    });
    await page.evaluate(() => document.getElementById("modalMin").click());
    await sleep(350);
    await settleFrames();
    const after = await boxes();
    /* sf21b: with the editor back, the Clear intents button's press minimises it; the add button's does not */
    await page.evaluate(() => document.getElementById("edFab").click());
    await sleep(350);
    const shownBack = await page.evaluate(() => !edResting() && modalFront());
    await page.evaluate(() => document.getElementById("addCardFab").click());
    await sleep(350);
    const afterAdd = await page.evaluate(() => edResting());
    await page.evaluate(() => { document.getElementById("clearIntentsFab").click(); });
    await sleep(350);
    const afterClear = await page.evaluate(() => edResting());
    await ctx.close();
    return { before, reach, after, shownBack, afterAdd, afterClear };
  };
  const sf7ok = r => r.before.add !== null && r.after.ed !== null && r.after.add === r.before.add && r.after.ed < r.after.add;
  const sf21aok = r => r.reach.shown && r.reach.hit;
  const sf21bok = r => r.shownBack && r.afterAdd === false && r.afterClear === true;
  {
    const r = await sf7run();
    check(sf7ok(r), "sf7a the editors' button arrives to the left of the add button, which stays where it stood", { before: r.before, after: r.after });
    check(sf21aok(r), "sf21a over an open editor's dim the action buttons are reachable: a press at the add button's centre meets it", r.reach);
    check(sf21bok(r), "sf21b the add button, which opens an editor, leaves the editors showing; the Clear intents button minimises them first", { shownBack: r.shownBack, afterAdd: r.afterAdd, afterClear: r.afterClear });
  }
  for (const [file, tag, id, judge] of [["src/modules/dialog.js", "fab-arrival-order", "sf7b", sf7ok], ["src/modules/dialog.js", "ed-up-class", "sf21c", sf21aok],
    ["src/modules/dialog.js", "fab-unrelated-rests", "sf21d", sf21bok]])
    domPlants.push([id + " lifting plant:" + tag + " turns its check red", async lab => {
      const htmlPath = path.join(lab, tag + ".html");
      if (await buildLiftedHtml(file, tag, htmlPath) < 0) return false;
      return !judge(await sf7run("file:///" + htmlPath.replace(/\\\\/g, "/")));
    }]);

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
