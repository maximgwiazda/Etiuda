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
const EXPECTED = 26;
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
  const fromTemplate = relMod === "src/template.html";
  const liftedSource = fromTemplate ? "" : lines.join("\n");
  const filterRe = new RegExp(relMod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "[\\\\/]") + "$");
  const built = await esbuild.build({
    ...OPTIONS,
    entryPoints: [path.join(ROOT, "src", "main.js")],
    plugins: fromTemplate ? [] : [{ name: "lift-plant-" + tag, setup(b) { b.onLoad({ filter: filterRe }, () => ({ contents: liftedSource, loader: "js" })); } }]
  });
  const js = built.outputFiles[0].text
    .split('"@E_BUILT@"').join('"2026-11-26"')
    .split('"@EULA_EN@"').join('""')
    .split('"@EULA_PL@"').join('""');
  const template = fromTemplate ? lines.join("\n") : fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
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
    if (c.update) window.E_HOST.updateState = () => c.update;
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
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: cfg.reduced ? "reduce" : "no-preference" }]);
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
  if (cfg.still !== false) await page.evaluate(() => document.documentElement.classList.add("e-still"));
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

  /* sf12: the signed or unsigned key sits beside the Library row's Private switch, to its right, on the switch's line; an empty key takes
     no room (finding 12). */
  const sf12run = async url => {
    const { ctx, page } = await launchDeskPage(browser, { url, width: 1400 });
    await page.evaluate(() => { openManage(); });
    await sleep(500);
    const r = await page.evaluate(() => {
      const sw = '<label class="ec-priv"><input type="checkbox" class="ec-priv-sw" role="switch"><span>Private</span></label>';
      const rows = [{ name: "Signed.ec", teamHtml: sw, trust: "valid", print: "0123456789abcdef", meta: "5 cards" }, { name: "Plain.ec", teamHtml: sw, trust: "", meta: "5 cards" }];
      const box = document.createElement("div");
      box.id = "mgCatList"; box.className = "ec-list"; box.style.cssText = "position:fixed;left:20px;top:80px;width:1100px;z-index:9999";
      box.innerHTML = rows.map(o => ecRowHtml(o)).join("");
      document.body.appendChild(box);
      const m = el => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
      const out = [];
      box.querySelectorAll(".ec-row").forEach(row => {
        const priv = row.querySelector(".ec-priv"), key = row.querySelector(".ec-key"), whose = row.querySelector(".ec-whose"), sig = row.querySelector(".ec-sig");
        out.push({ priv: m(priv), key: key ? m(key) : null, sig: sig ? m(sig) : null, whose: m(whose), dir: getComputedStyle(whose).flexDirection });
      });
      box.remove();
      return out;
    });
    await ctx.close();
    return r;
  };
  const sf12ok = r => {
    const a = r[0], b = r[1];
    const beside = a.dir === "row" && a.key.l >= a.priv.r + 8 && a.key.l <= a.priv.r + 24 && Math.abs((a.key.t + a.key.b) / 2 - (a.priv.t + a.priv.b) / 2) <= 2;
    const empty = b.sig.w === 0 && b.key.w === 0;
    return beside && empty;
  };
  {
    const r = await sf12run();
    check(sf12ok(r), "sf12a a signed catalog's key stands 8 to 24 px right of its Private switch on the switch's line, and an empty key takes no room", r);
  }
  domPlants.push(["sf12b lifting plant:ec-whose-row turns sf12a red", async lab => {
    const htmlPath = path.join(lab, "ec-whose-row.html");
    if (await buildLiftedHtml("src/template.html", "ec-whose-row", htmlPath) < 0) return false;
    return !sf12ok(await sf12run("file:///" + htmlPath.replace(/\\\\/g, "/")));
  }]);

  /* sf8: minimising an editor shows where it goes (finding 8). It flies into its action button on the fly tier and E_FLY, the dim lifts on
     the same tier, the button rings once; bringing it back is the path reversed on the engine's curve; under quiet motion the copy only
     fades on the reveal tier and the button rings. */
  const sf8run = async (url, reduced) => {
    const { ctx, page } = await sampleDeskPage(browser, { url, still: false, reduced });
    const first = await page.evaluate(() => document.querySelector("#list .card[data-id]").dataset.id);
    await page.evaluate(id => openCardEditor(id), first);
    await page.waitForFunction(() => !!document.getElementById("meSave"), { timeout: 10000 });
    await sleep(450);
    const readGhost = () => page.evaluate(() => {
      const g = document.querySelector(".ed-ghost");
      const anims = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains("ed-ghost"));
      const a = anims[0];
      const frames = a ? a.effect.getKeyframes() : [];
      const t = a ? a.effect.getTiming() : {};
      const bg = document.querySelector("#modal .modal-bg");
      return { ghosts: document.querySelectorAll(".ed-ghost").length, inModal: !!g && !!g.closest("#modal"), duration: t.duration, easing: t.easing,
        moves: frames.some(f => f.transform && f.transform !== "none" && /scale/.test(f.transform)),
        fadesFrom: frames.filter(f => f.opacity !== undefined).map(f => [Number(f.computedOffset.toFixed(2)), Number(f.opacity)]),
        dim: bg ? getComputedStyle(bg).transitionDuration : "" };
    });
    const readRing = () => page.evaluate(() => {
      const fab = document.getElementById("edFab");
      const a = fab.getAnimations().filter(x => x.effect && x.effect.getKeyframes().some(f => f.boxShadow));
      return { n: a.length, duration: a[0] ? a[0].effect.getTiming().duration : 0 };
    });
    await page.evaluate(() => document.getElementById("modalMin").click());
    await sleep(40);
    const during = await readGhost();
    await sleep(reduced ? 150 : 270);
    const ring = await readRing();
    await sleep(500);
    const after = await readGhost();
    let back = null;
    await page.evaluate(() => document.getElementById("edFab").click());
    await sleep(40);
    back = await page.evaluate(() => {
      const a = document.getAnimations().filter(x => !(x instanceof CSSAnimation) && x.effect && x.effect.target === document.getElementById("modalCard"))[0];
      const t = a ? a.effect.getTiming() : {}, f = a ? a.effect.getKeyframes() : [];
      return { duration: t.duration, easing: t.easing, from: f[0] && f[0].transform ? String(f[0].transform) : "", fade: f.map(x => x.opacity).join(",") };
    });
    await ctx.close();
    return { during, ring, after, back };
  };
  const sf8ok = r => r.during.ghosts === 1 && r.during.inModal && r.during.duration === 240 && r.during.easing === "cubic-bezier(0.4, 0, 1, 1)" && r.during.moves
    && r.during.fadesFrom.some(p => p[0] === 0.55 && p[1] === 1) && r.during.fadesFrom.some(p => p[0] === 1 && p[1] === 0)
    && r.during.dim === "0.24s" && r.after.ghosts === 0 && r.ring.n === 1 && r.ring.duration === 420
    && r.back.duration === 240 && r.back.easing === "cubic-bezier(0.2, 0.7, 0.3, 1)" && /scale\(/.test(r.back.from);
  const sf8quiet = r => r.during.ghosts === 1 && r.during.duration === 120 && !r.during.moves && r.after.ghosts === 0 && r.ring.n === 1;
  {
    const r = await sf8run();
    check(sf8ok(r), "sf8a Minimise flies a copy into the button on 240 ms and cubic-bezier(.4,0,1,1), fading over the last 45%, the dim lifting on 240 ms, the button ringing once, and bringing it back on 240 ms and the engine's curve", r);
    const q = await sf8run(undefined, true);
    check(sf8quiet(q), "sf8b under quiet motion the copy only fades on 120 ms, with no travel, and the button rings", q);
  }
  for (const [tag, id] of [["fly-out", "sf8c"], ["fly-ring", "sf8d"], ["fly-in", "sf8e"]])
    domPlants.push([id + " lifting plant:" + tag + " turns sf8a red", async lab => {
      const htmlPath = path.join(lab, tag + ".html");
      if (await buildLiftedHtml("src/modules/dialog.js", tag, htmlPath) < 0) return false;
      return !sf8ok(await sf8run("file:///" + htmlPath.replace(/\\\\/g, "/")));
    }]);

  /* sf15: About lives wholly in Settings' About category; the window is gone; the tour and Maintenance have no way in from it
     (finding 15). The window's own parts, moved in: the mark and name, the version and its day, what is new, the licence, the credit. */
  const sf15run = async (url, offer) => {
    const { ctx, page } = await launchDeskPage(browser, { url, width: 1280, height: 900, update: offer });
    await page.evaluate(() => { openSettings("about"); });
    await sleep(500);
    const read = () => page.evaluate(() => {
      const host = document.getElementById("screenHost"), box = host.querySelector(".about-in");
      const txt = sel => { const e = box && box.querySelector(sel); return e ? e.textContent.trim() : ""; };
      const folds = box ? [...box.querySelectorAll("details")].map(d => ({ label: (d.querySelector("summary") || {}).textContent.trim(), open: d.open })) : [];
      const see = host.querySelector("#setUpdateSee"), num = box && box.querySelector(".about-num");
      return {
        here: !!box, mark: !!(box && box.querySelector(".about-tile svg")), name: txt(".about-name"), version: txt(".about-num"), cap: txt(".about-cap"),
        newHead: txt(".about-h"), news: box ? box.querySelectorAll(".about-new li").length : 0, folds,
        credit: txt(".about-credit"), stardust: !!(box && box.querySelector(".about-credit a[href]")),
        tour: !!host.querySelector("#setTour") || /Show tour/.test(host.textContent), maint: !!host.querySelector("#setMaint") || !!host.querySelector('[data-row="maintenance"]'),
        windowBtn: !!host.querySelector("#setAbout"), openAboutFn: typeof openAbout, modalShown: !document.getElementById("modal").hidden,
        seeAtRight: !!see && !!num && see.getBoundingClientRect().left > num.getBoundingClientRect().right
          && Math.abs((see.getBoundingClientRect().top + see.getBoundingClientRect().bottom) / 2 - (num.getBoundingClientRect().top + num.getBoundingClientRect().bottom) / 2) < 60
          && see.getBoundingClientRect().right > host.getBoundingClientRect().right - 80,
        see: !!see
      };
    });
    const first = await read();
    await page.evaluate(() => { for (const s of document.querySelectorAll(".about-in details > summary")) s.click(); });
    await sleep(200);
    const opened = await page.evaluate(() => [...document.querySelectorAll(".about-in details")].map(d => ({ open: d.open, body: d.textContent.length })));
    const legal = await page.evaluate(() => !!document.querySelector(".about-in .about-legal"));
    await ctx.close();
    return { first, opened, legal };
  };
  const sf15ok = r => {
    const f = r.first;
    return f.here && f.mark && f.name === "Etiuda" && f.version.length > 0 && /the version on this computer/.test(f.cap) && f.newHead === "New in this version" && f.news >= 4
      && f.folds.length === 2 && f.folds[0].label === "Earlier versions of Etiuda" && /End-User Licence Agreement/.test(f.folds[1].label) && !f.folds[0].open && !f.folds[1].open
      && r.opened.every(o => o.open) && r.legal && /Max Gwiazda/.test(f.credit) && f.stardust
      && !f.tour && !f.maint && !f.windowBtn && f.openAboutFn === "undefined" && !f.modalShown;
  };
  {
    const r = await sf15run();
    check(sf15ok(r), "sf15a About stands in Settings' About category with the mark and name, the version and its day, what is new, Earlier versions and the licence folded and opening in place, and the credit; no Show tour, no Maintenance, no window", r);
  }
  {
    const { ctx, page } = await launchDeskPage(browser, { width: 1280, height: 900 });
    await page.click("#settingsBtn");
    await sleep(250);
    await page.evaluate(() => { const b = document.querySelector('[data-act="about"]'); if (b) b.click(); });
    await sleep(500);
    const via = await page.evaluate(() => ({ cat: !!document.querySelector('#screenHost .sx-sec.on[data-sx="about"]'), here: !!document.querySelector("#screenHost .about-in"), modal: !document.getElementById("modal").hidden }));
    await ctx.close();
    check(via.cat && via.here && !via.modal, "sf15b the Menu's About opens Settings at its About category, and no window", via);
  }
  {
    /* An update offered: See what's new stands at the right end of the version's row; none offered, no button. */
    const o = await sf15run(undefined, { offer: "9.9.9", look: "read" });
    check(o.first.see && o.first.seeAtRight && !(await sf15run()).first.see,
      "sf15c with an update offered See what's new stands at the right end of the version's row, and with none it is not there", { see: o.first.see, right: o.first.seeAtRight });
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
