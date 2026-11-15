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
import * as esbuild from "esbuild";
import { OPTIONS } from "../tools/bundler-probe/build.mjs";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const E = require("./engine.js");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_URL = "file:///" + path.join(ROOT, "engine", "etiuda.html").replace(/\\/g, "/");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 33;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function notRun(line) {
  skipped++;
  console.log("  NOT RUN " + line);
}

async function buildLiftedHtml(relMod, tag, outPath) {
  const modPath = path.join(ROOT, relMod);
  const lines = fs.readFileSync(modPath, "utf8").split("\n");
  const plantAt = lines.findIndex(l => l.includes("plant:" + tag));
  if (plantAt < 0) return -1;
  lines.splice(plantAt, 1);
  const liftedSource = lines.join("\n");
  const filterRe = new RegExp(relMod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "[\\\\/]") + "$");
  const built = await esbuild.build({
    ...OPTIONS,
    entryPoints: [path.join(ROOT, "src", "main.js")],
    plugins: [{
      name: "lift-plant-" + tag,
      setup(b) {
        b.onLoad({ filter: filterRe }, () => ({ contents: liftedSource, loader: "js" }));
      }
    }]
  });
  let js = built.outputFiles[0].text
    .split('"@E_BUILT@"').join('"2026-11-15"')
    .split('"@EULA_EN@"').join('""')
    .split('"@EULA_PL@"').join('""');
  const template = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  fs.writeFileSync(outPath, template.replace("/*@APP*/\n", () => js), "utf8");
  return plantAt;
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
        return window.__signinState;
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

  /* Part 3: the screen (EN/PL, light/dark, sizes, keyboard, states, sign-in completion) */
  /* fs3a: EN light desktop 1280x860 — layout, dotted ground, 52px mark without wavy line, exact copy */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      signin: { offered: ["microsoft", "google"], signedIn: "" },
      desk: { eTheme: "light", eUiLang: "en" }
    });
    await sleep(400);
    const ui = await page.evaluate(() => {
      const scr = document.getElementById("firstSignin");
      const left = scr && scr.querySelector(".fs-left");
      const right = scr && scr.querySelector(".fs-right");
      const mark = scr && scr.querySelector(".fs-mark");
      const band = document.querySelector("header .row");
      const tabs = document.getElementById("tabsWrap");
      const fills = document.querySelector("header .fills");
      const pills = document.getElementById("pillsSlot");
      const rail = document.getElementById("intentRail");
      const lRect = left && left.getBoundingClientRect();
      const rRect = right && right.getBoundingClientRect();
      const mRect = mark && mark.getBoundingClientRect();
      const bRect = band && band.getBoundingClientRect();
      const txt = scr ? scr.innerText : "";
      const rawTxt = scr ? scr.textContent : "";
      const lStyle = left ? getComputedStyle(left) : null;
      const rStyle = right ? getComputedStyle(right) : null;
      const h1 = scr && scr.querySelector("#fsHeading");
      const h1Style = h1 ? getComputedStyle(h1) : null;
      const waveLike = scr ? scr.querySelector(".fs-wave, .launch-wave, path.wave") : null;
      const steps = scr ? [...scr.querySelectorAll(".fs-steps li")].map(li => li.innerText.trim()) : [];
      return {
        hasScr: !!scr && !scr.hidden,
        sideBySide: !!lRect && !!rRect && Math.abs(lRect.y - rRect.y) < 4 && rRect.left >= lRect.right - 2 && lRect.width > 300 && rRect.width > 300,
        dotted: !!lStyle && lStyle.backgroundImage.includes("radial-gradient"),
        markSize: mRect ? { w: Math.round(mRect.width), h: Math.round(mRect.height) } : null,
        markHasSvg: !!(mark && mark.querySelector("svg")),
        noWave: !waveLike && (mark ? mark.parentElement.querySelectorAll("svg").length === 1 : false),
        bandVisible: !!bRect && bRect.height > 20,
        hasBrand: !!(band && band.querySelector(".brand[aria-label='Etiuda']")),
        chromeHidden: (!tabs || getComputedStyle(tabs).display === "none")
          && (!fills || getComputedStyle(fills).display === "none")
          && (!pills || getComputedStyle(pills).display === "none")
          && (!rail || getComputedStyle(rail).display === "none"),
        txt,
        rawTxt,
        steps,
        h1Font: h1Style ? parseFloat(h1Style.fontSize) : 0,
        panelBg: rStyle ? rStyle.backgroundColor : ""
      };
    });
    check(ui.hasScr && ui.sideBySide && ui.dotted && ui.chromeHidden && ui.bandVisible && ui.hasBrand,
      "fs3a two-half layout under blue band with dotted left ground and no rail/tabs/search/pills");
    check(ui.markHasSvg && ui.markSize && ui.markSize.w === 52 && ui.markSize.h === 52 && ui.noWave,
      "fs3a 52px mark present with no wavy underline");
    const hasAllEn = [
      "Sign in to Etiuda",
      "Your seat belongs to your account, so it comes with you to any computer you sign in on, up to three.",
      "The browser opens the sign-in page",
      "You choose your account there",
      "Etiuda carries on here by itself",
      "No licence key to keep",
      "Signing in",
      "Sign in with Microsoft",
      "Sign in with Google",
      "Signing in brings your seat, and a team that has admitted you, to this computer. Etiuda for personal use, outside work, needs no sign-in.",
      "Not now",
      "The desk opens as it is, and Sign in stays in the bar at the top for later."
    ].every(s => ui.txt.includes(s)) && ui.rawTxt.includes("What happens") && !ui.txt.includes("HELD");
    check(hasAllEn && ui.steps.length === 3,
      "fs3a exact English copy and three numbered steps present");
    await ctx.close();
  }

  /* fs3b: Polish + Dark theme + Small viewport sizes */
  for (const [label, cfg] of [
    ["PL light wide", { desk: { eTheme: "light", eUiLang: "pl" }, signin: { offered: ["microsoft", "google"], signedIn: "" }, width: 1200, height: 800 }],
    ["EN dark wide", { desk: { eTheme: "dark", eUiLang: "en" }, signin: { offered: ["microsoft", "google"], signedIn: "" }, width: 1200, height: 800 }],
    ["PL dark narrow", { desk: { eTheme: "dark", eUiLang: "pl" }, signin: { offered: ["microsoft", "google"], signedIn: "" }, width: 620, height: 640 }]
  ]) {
    const { ctx, page } = await launchDeskPage(browser, cfg);
    await sleep(400);
    const res = await page.evaluate(() => {
      const scr = document.getElementById("firstSignin");
      const h1 = scr && scr.querySelector("#fsHeading");
      const skip = document.getElementById("firstSigninSkip");
      const h1C = h1 ? getComputedStyle(h1).color : "";
      const bgC = scr && scr.querySelector(".fs-left") ? getComputedStyle(scr.querySelector(".fs-left")).backgroundColor : "";
      const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      const skipBox = skip ? skip.getBoundingClientRect() : null;
      return {
        theme: document.documentElement.getAttribute("data-theme"),
        lang: document.documentElement.lang,
        txt: scr ? scr.innerText : "",
        rawTxt: scr ? scr.textContent : "",
        h1C, bgC, overflowX,
        skipVisible: !!skipBox && skipBox.width > 40 && skipBox.height > 20
      };
    });
    const isPl = cfg.desk.eUiLang === "pl";
    const copyOk = isPl
      ? ["Logowanie do Etiudy", "W przeglądarce otwiera się strona logowania",
         "Tam wybiera się konto", "Etiuda sama przechodzi dalej", "Bez klucza licencji do pilnowania",
         "Logowanie", "Nie teraz", "Stanowisko otworzy się bez zmian, a przycisk Zaloguj się zostaje na pasku u góry na później."].every(s => res.txt.includes(s))
         && res.rawTxt.includes("Co się stanie")
      : res.txt.includes("Sign in to Etiuda") && res.txt.includes("Not now");
    check(copyOk && res.theme === cfg.desk.eTheme && !res.overflowX && res.skipVisible && res.h1C !== res.bgC,
      "fs3b theme/lang/viewport clean (" + label + ")");
    await ctx.close();
  }

  /* fs3c: Keyboard Tab reaches every interactive control; Escape runs Not now */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      signin: { offered: ["microsoft", "google"], signedIn: "" }
    });
    await sleep(400);
    const seenIds = [];
    for (let k = 0; k < 5; k++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const a = document.activeElement;
        return {
          inScr: !!(a && a.closest && a.closest("#firstSignin")),
          tag: a ? a.tagName : "",
          prov: a && a.dataset ? a.dataset.eProvider || "" : "",
          id: a ? a.id || "" : "",
          text: a ? (a.innerText || "").trim() : ""
        };
      });
      seenIds.push(info.prov || info.id || info.text);
      if (!info.inScr) { seenIds.push("OUTSIDE"); break; }
    }
    const reachedAll = seenIds.includes("microsoft") && seenIds.includes("google") && seenIds.includes("firstSigninSkip") && !seenIds.includes("OUTSIDE");
    await page.keyboard.press("Escape");
    await sleep(1500);
    const afterEsc = await page.evaluate(() => ({
      closed: !document.body.classList.contains("e-first-signin"),
      tourOn: !!(document.getElementById("tourRoot") && document.getElementById("tourRoot").classList.contains("on"))
    }));
    check(reachedAll && afterEsc.closed && afterEsc.tourOn,
      "fs3c Tab cycles inside screen across all controls and Escape triggers Not now -> tour");
    await ctx.close();
  }

  /* fs3d: Second boot after Not now on same desk does not show the screen again */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      signin: { offered: ["microsoft", "google"], signedIn: "" }
    });
    await sleep(400);
    const up1 = await page.evaluate(() => document.body.classList.contains("e-first-signin"));
    if (up1) await page.click("#firstSigninSkip");
    await sleep(200);
    const savedDesk = await page.evaluate(() => window.__deskStore);
    await ctx.close();

    const { ctx: ctx2, page: page2 } = await launchDeskPage(browser, {
      desk: savedDesk,
      signin: { offered: ["microsoft", "google"], signedIn: "" }
    });
    await sleep(1600);
    const secondBoot = await page2.evaluate(() => ({
      screenUp: document.body.classList.contains("e-first-signin"),
      tourOn: !!(document.getElementById("tourRoot") && document.getElementById("tourRoot").classList.contains("on"))
    }));
    check(up1 && !secondBoot.screenUp && secondBoot.tourOn,
      "fs3d Not now remembers desk mark across second boot");
    await ctx2.close();
  }

  /* fs3e: waiting state inside screen; refused state shows Not now beside refusal act; Try again returns to choice */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      signin: { offered: ["microsoft", "google"], signedIn: "" }
    });
    await sleep(400);
    if (await page.evaluate(() => !!document.querySelector("#firstSignin [data-e-provider='microsoft']"))) {
      await page.click("#firstSignin [data-e-provider='microsoft']");
    }
    await sleep(200);
    const waiting = await page.evaluate(() => {
      const scr = document.getElementById("firstSignin");
      return {
        txt: scr ? scr.innerText : "",
        hasBar: !!(scr && scr.querySelector(".sgn-run")),
        hasCancel: !!(scr && scr.querySelector("[data-signin-act='stop']")),
        hasLink: !!(scr && scr.querySelector(".sgn-link-f")),
        noHeaderPop: !document.getElementById("signinPanel") || document.getElementById("signinPanel").hidden
      };
    });
    check(waiting.txt.includes("Finish signing in in the browser") && waiting.hasBar && waiting.hasCancel && waiting.hasLink && waiting.noHeaderPop,
      "fs3e sign-in under way shows waiting state inside screen");

    await page.evaluate(() => {
      window.__signinState = { offered: ["microsoft", "google"], signedIn: "", busy: "", said: "unreached" };
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    });
    await sleep(200);
    const refused = await page.evaluate(() => {
      const scr = document.getElementById("firstSignin");
      const act = scr && scr.querySelector("[data-signin-act='choose']");
      const skip = document.getElementById("firstSigninSkip");
      const aBox = act && act.getBoundingClientRect();
      const sBox = skip && skip.getBoundingClientRect();
      return {
        txt: scr ? scr.innerText : "",
        hasAct: !!act,
        hasSkip: !!skip,
        beside: !!(aBox && sBox && Math.abs(aBox.y - sBox.y) < 12 && sBox.left >= aBox.right)
      };
    });
    check(refused.txt.includes("The sign-in service could not be reached.") && refused.hasAct && refused.hasSkip && refused.beside,
      "fs3e refusal state shows panel message with Not now beside action button");

    if (refused.hasAct) await page.click("#firstSignin [data-signin-act='choose']");
    await sleep(150);
    const backToChoice = await page.evaluate(() => !!document.querySelector("#firstSignin [data-e-provider='microsoft']"));
    check(backToChoice, "fs3e Try again returns to provider buttons");
    await ctx.close();
  }

  /* fs3f: sign-in success closes screen, starts tour, leaves tour name field empty */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      signin: { offered: ["microsoft", "google"], signedIn: "" }
    });
    await sleep(400);
    await page.evaluate(() => {
      window.__signinState = {
        offered: ["microsoft", "google"], signedIn: "microsoft",
        code: "7K3MQ9TV2XRBHN4W", seat: "held", at: Date.now(), reached: true
      };
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    });
    await sleep(1600);
    const res = await page.evaluate(() => {
      const tour = document.getElementById("tourRoot");
      const inp = document.getElementById("tourName");
      const headerPop = document.getElementById("signinPanel");
      return {
        screenClosed: !document.body.classList.contains("e-first-signin"),
        headerPopClosed: !headerPop || headerPop.hidden,
        tourStarted: !!tour && !tour.hidden && tour.classList.contains("on"),
        nameEmpty: !!inp && inp.value === ""
      };
    });
    check(res.screenClosed && res.headerPopClosed && res.tourStarted && res.nameEmpty,
      "fs3f sign-in completion closes screen without popping header panel and leaves tour name empty");
    await ctx.close();
  }

  /* Part 4: inline plant proofs (ETIUDA_PLANTS=off skips cleanly with NOT RUN) */
  const plantSpecs = [
    ["fs4a lifting plant:first-signin-gate causes policy desk to wrongly open the sign-in screen", "first-signin-gate", async lab => {
      const htmlPath = path.join(lab, "gate.html");
      const plantAt = await buildLiftedHtml("src/modules/signin.js", "first-signin-gate", htmlPath);
      if (plantAt < 0) return false;
      const { ctx, page } = await launchDeskPage(browser, {
        url: "file:///" + htmlPath.replace(/\\/g, "/"),
        policy: "C:\\Policy\\Team",
        signin: { offered: ["microsoft"], signedIn: "" }
      });
      await sleep(1500);
      const openedOnPolicy = await page.evaluate(() => document.body.classList.contains("e-first-signin"));
      await ctx.close();
      return openedOnPolicy === true;
    }],
    ["fs4b lifting plant:first-signin-order causes tour to start while sign-in screen is open", "first-signin-order", async lab => {
      const htmlPath = path.join(lab, "order.html");
      const plantAt = await buildLiftedHtml("src/modules/tour.js", "first-signin-order", htmlPath);
      if (plantAt < 0) return false;
      const { ctx, page } = await launchDeskPage(browser, {
        url: "file:///" + htmlPath.replace(/\\/g, "/"),
        signin: { offered: ["microsoft"], signedIn: "" }
      });
      await sleep(2200);
      const overlapped = await page.evaluate(() => {
        const tour = document.getElementById("tourRoot");
        return document.body.classList.contains("e-first-signin")
          && !!tour && !tour.hidden && tour.classList.contains("on");
      });
      await ctx.close();
      return overlapped === true;
    }],
    ["fs4c lifting plant:first-signin-mark causes second boot to reopen the screen", "first-signin-mark", async lab => {
      const htmlPath = path.join(lab, "mark.html");
      const plantAt = await buildLiftedHtml("src/modules/signin.js", "first-signin-mark", htmlPath);
      if (plantAt < 0) return false;
      const url = "file:///" + htmlPath.replace(/\\/g, "/");
      const { ctx, page } = await launchDeskPage(browser, { url, signin: { offered: ["microsoft"], signedIn: "" } });
      await sleep(400);
      const savedDesk = await page.evaluate(() => {
        const s = document.getElementById("firstSigninSkip");
        if (s) s.click();
        return window.__deskStore;
      });
      await ctx.close();
      const { ctx: ctx2, page: page2 } = await launchDeskPage(browser, {
        url,
        desk: savedDesk,
        signin: { offered: ["microsoft"], signedIn: "" }
      });
      await sleep(400);
      const reopened = await page2.evaluate(() => document.body.classList.contains("e-first-signin"));
      await ctx2.close();
      return reopened === true;
    }]
  ];

  const plantLab = PLANTS_OFF ? "" : fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-first-signin-plant-"));
  try {
    for (const [label, tag, run] of plantSpecs) {
      if (PLANTS_OFF) notRun(label + " (ETIUDA_PLANTS=off)");
      else check(await run(plantLab), label);
    }
  } finally {
    if (plantLab) try { fs.rmSync(plantLab, { recursive: true, force: true }); } catch (_) {}
  }
} finally {
  await browser.close();
}

console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log("\n" + asserted + " checks, " + failed + " failed");
process.exit(Math.min(63, failed));
