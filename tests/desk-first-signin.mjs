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
E.ensureOutputs(); /* the outputs are this source's first (tests/engine.js ensureOutputs) */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_URL = "file:///" + path.join(ROOT, "engine", "etiuda.html").replace(/\\/g, "/");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 40;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DOOR_VIEW = extra => Object.assign({ offered: ["microsoft", "google"], signedIn: "", works: false, registered: true, online: true, reached: true }, extra || {});
const SEATED_VIEW = extra => {
  const now = Date.now(), until = now + 14 * 86400000;
  return Object.assign({ offered: ["microsoft", "google"], signedIn: "microsoft", code: "7K3MQ9TV2XRBHN4W", seat: "held",
    works: true, registered: true, online: true, at: now, now, until, reached: true, holding: { on: "trial", ends: until }, trials: { desk: until } }, extra || {});
};

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

/* Part 1: the gate (deskWorks and firstSigninDue; seen memory and policy-pin exemption removed in B-3a1) */
check(typeof P.deskWorks === "function" && typeof P.firstSigninDue === "function"
  && !("FIRST_SIGNIN_KEY" in P) && !("firstSigninSeen" in P) && !("markFirstSigninSeen" in P) && !("skipFirstSignin" in P),
  "fs1a deskWorks and firstSigninDue are exported; FIRST_SIGNIN_KEY, firstSigninSeen, markFirstSigninSeen and skipFirstSignin are gone");
check(P.deskWorks() === false && P.deskWorks({ works: true }) === true && P.deskWorks({ works: false }) === false && P.deskWorks(null) === false,
  "fs1b deskWorks answers false with no host and follows works on a view");

if (typeof P.firstSigninDue === "function") {
  const due = DOOR_VIEW({ offered: ["microsoft"] });
  check(P.firstSigninDue(due) === true,
    "fs1c due when provider offered, signed out and works is false");
  check(P.firstSigninDue(DOOR_VIEW()) === true,
    "fs1d due with both providers offered and works is false");
  check(P.firstSigninDue({ offered: [], works: false, registered: false }) === true
    && P.firstSigninDue(null) === false
    && P.firstSigninDue({ offered: ["unknown"], works: false }) === true,
    "fs1e due when no known provider is offered (fail closed) and false for null");
  check(P.firstSigninDue(SEATED_VIEW()) === false
    && P.firstSigninDue({ offered: ["microsoft"], signedIn: "microsoft", works: false }) === true,
    "fs1f not due when seated (works true); still due when signed in without a working seat");
  S.lsSet("eFirstSigninSeen", "1");
  check(P.firstSigninDue(due, { seen: true }) === true,
    "fs1g still due when eFirstSigninSeen is present (seen memory is gone)");
  S.lsDel("eFirstSigninSeen");
  check(P.firstSigninDue(due, { policy: true }) === true,
    "fs1h still due on a policy desk (policy-pin exemption is gone)");
  check(P.firstSigninDue(DOOR_VIEW({ offered: ["microsoft"], managed: { on: true, stranded: true } })) === true,
    "fs1l still due when stranded with works false");
  check(S.lsGet("eFirstSigninSeen") === null,
    "fs1i gate checks write nothing to storage");
  check(P.firstSigninDue() === true,
    "fs1j firstSigninDue() with no host is true (the browser door, B-3a2b)");
  globalThis.window = { E_HOST: { catalogFolderPolicy: "C:\\Policy\\Team", signinState: () => due } };
  P.signinNow();
  check(P.firstSigninDue() === true && P.deskWorks() === false,
    "fs1k after reading a view from E_HOST, firstSigninDue follows !deskWorks() even on a policy desk");
  delete globalThis.window;
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
  /* fs2a & fs2b: tour waits while door stands, writes no seen mark, then starts once a seated view arrives */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      signin: DOOR_VIEW()
    });
    await sleep(2200);
    const held = await page.evaluate(() => {
      const scr = document.getElementById("firstSignin");
      const tour = document.getElementById("tourRoot");
      return {
        hasScreen: !!scr && !scr.hidden,
        bodyClass: document.body.classList.contains("e-first-signin"),
        tourHidden: !tour || tour.hidden || !tour.classList.contains("on"),
        noSkip: !document.getElementById("firstSigninSkip"),
        noSeenMark: !("eFirstSigninSeen" in window.__deskStore)
      };
    });
    check(held.hasScreen && held.bodyClass && held.tourHidden && held.noSkip && held.noSeenMark,
      "fs2a door opens on unseated desk, holds tour past auto-start, shows no skip and writes no seen mark");

    await page.evaluate(v => {
      window.__signinState = v;
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    }, SEATED_VIEW());
    await sleep(600);
    const afterSeat = await page.evaluate(() => {
      const scr = document.getElementById("firstSignin");
      const tour = document.getElementById("tourRoot");
      return {
        screenClosed: (!scr || scr.hidden) && !document.body.classList.contains("e-first-signin"),
        tourStarted: !!tour && !tour.hidden && tour.classList.contains("on")
      };
    });
    check(afterSeat.screenClosed && afterSeat.tourStarted,
      "fs2b seated view (works true) lowers door and allows tour to start");
    await ctx.close();
  }

  /* fs2c: seated desk starts tour directly; unseated desks (no provider, policy, old seen mark, signed in without seat) keep door up */
  for (const [label, wantOpen, cfg] of [
    ["seated desk", false, { signin: SEATED_VIEW() }],
    ["no provider", true, { signin: { offered: [], signedIn: "", works: false, registered: false } }],
    ["policy desk", true, { policy: "C:\\Policy\\Team", signin: DOOR_VIEW({ offered: ["microsoft"] }) }],
    ["old eFirstSigninSeen mark", true, { desk: { eFirstSigninSeen: "1" }, signin: DOOR_VIEW({ offered: ["microsoft"] }) }],
    ["signed in without seat", true, { signin: { offered: ["microsoft"], signedIn: "microsoft", code: "7K3MQ9TV2XRBHN4W", works: false, registered: true, online: true } }]
  ]) {
    const { ctx, page } = await launchDeskPage(browser, cfg);
    await sleep(2200);
    const st = await page.evaluate(() => {
      const scr = document.getElementById("firstSignin");
      const tour = document.getElementById("tourRoot");
      return {
        screenOpen: !!scr && !scr.hidden && document.body.classList.contains("e-first-signin"),
        tourStarted: !!tour && !tour.hidden && tour.classList.contains("on")
      };
    });
    check(wantOpen ? (st.screenOpen && !st.tourStarted) : (!st.screenOpen && st.tourStarted),
      "fs2c door rule (" + label + ")");
    await ctx.close();
  }

  /* fs2d: catalog offer behind door when tour already seen waits for a seated view */
  const labDir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-fs-offer-"));
  try {
    const sampleRaw = fs.readFileSync(path.join(ROOT, "shell", "sample-catalog.ec"), "utf8");
    fs.copyFileSync(path.join(ROOT, "engine", "etiuda.html"), path.join(labDir, "etiuda.html"));
    fs.writeFileSync(path.join(labDir, "etiuda-catalog.js"), "window.E_CATALOG = " + sampleRaw + ";\n", "utf8");
    const labUrl = "file:///" + path.join(labDir, "etiuda.html").replace(/\\/g, "/");
    const { ctx, page } = await launchDeskPage(browser, {
      url: labUrl,
      desk: { eTourDone_v3: "1", eTourInvite_v3: "1" },
      signin: DOOR_VIEW({ offered: ["microsoft"] }),
      catalogFolder: labDir,
      catalogFile: "sample-catalog.ec",
      catalogMtime: Date.now()
    });
    await sleep(1600);
    const beforeSeat = await page.evaluate(() => ({
      screenUp: document.body.classList.contains("e-first-signin"),
      offerUp: !!document.getElementById("eCatalogOffer")
    }));
    await page.evaluate(v => {
      window.__signinState = v;
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    }, SEATED_VIEW({ offered: ["microsoft"] }));
    await sleep(600);
    const afterSeat = await page.evaluate(() => ({
      screenDown: !document.body.classList.contains("e-first-signin"),
      offerUp: !!document.getElementById("eCatalogOffer")
    }));
    check(beforeSeat.screenUp && !beforeSeat.offerUp && afterSeat.screenDown && afterSeat.offerUp,
      "fs2d catalog offer waits behind door when tour already done and appears once seated");
    await ctx.close();
  } finally {
    fs.rmSync(labDir, { recursive: true, force: true });
  }

  /* Part 3: the screen (EN/PL, light/dark, sizes, keyboard, states, sign-in completion) */
  /* fs3a: EN light desktop 1280x860: layout, dotted ground, 52px mark without wavy line, exact copy */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      signin: DOOR_VIEW(),
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
        /* The screen's mark is the header's under a mask id of its own: the header's id stays the only one of its name in
           the document, and the screen's mark is cut through its own mask. */
        markOwnMask: (() => {
          const hm = document.querySelector(".brand-tile svg mask"), fm = mark && mark.querySelector("mask");
          if (!hm || !fm || !hm.id || !fm.id || fm.id === hm.id) return false;
          const through = [...mark.querySelectorAll("*")].some(e => ["mask", "fill"].some(a => e.getAttribute(a) === "url(#" + fm.id + ")"));
          const stray = [...mark.querySelectorAll("*")].some(e => ["mask", "fill"].some(a => e.getAttribute(a) === "url(#" + hm.id + ")"));
          return document.querySelectorAll('[id="' + hm.id + '"]').length === 1 && through && !stray;
        })(),
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
    check(ui.markHasSvg && ui.markSize && ui.markSize.w === 52 && ui.markSize.h === 52 && ui.noWave && ui.markOwnMask,
      "fs3a 52px mark present with no wavy underline, cut through a mask id of its own while the header's id stands once in the document");
    const hasAllEn = [
      "Etiuda starts with a sign-in.",
      "Signing in with Microsoft or Google gives this computer a seat: the team's, where its lead has admitted this account, or else a trial of fourteen days. Catalogs open once the seat is here.",
      "The browser opens the sign-in page",
      "You choose your account there",
      "Etiuda carries on here by itself",
      "No licence key to keep",
      "Signing in",
      "Sign in with Microsoft",
      "Sign in with Google",
      "This desk signs in with a Microsoft or Google account to hold its seat, and has the sign-in checked at etiuda.dev. The leads and administrator of the licence it joins see the account's name and address."
    ].every(s => ui.txt.includes(s)) && ui.rawTxt.includes("What happens") && !ui.txt.includes("HELD")
      && ["Sign in to Etiuda",
        "Your seat belongs to your account, so it comes with you to any computer you sign in on, up to three.",
        "Etiuda for personal use, outside work, needs no sign-in.",
        "Not now",
        "The desk opens as it is, and Sign in stays in the bar at the top for later.",
        "The team's lead sees no name or address from the account."].every(s => !ui.txt.includes(s));
    check(hasAllEn && ui.steps.length === 3,
      "fs3a exact English copy and three numbered steps present");
    await ctx.close();
  }

  /* fs3b: Polish + Dark theme + Small viewport sizes */
  for (const [label, cfg] of [
    ["PL light wide", { desk: { eTheme: "light", eUiLang: "pl" }, signin: DOOR_VIEW(), width: 1200, height: 800 }],
    ["EN dark wide", { desk: { eTheme: "dark", eUiLang: "en" }, signin: DOOR_VIEW(), width: 1200, height: 800 }],
    ["PL dark narrow", { desk: { eTheme: "dark", eUiLang: "pl" }, signin: DOOR_VIEW(), width: 620, height: 640 }]
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
      ? ["Etiuda zaczyna się od zalogowania.", "W przeglądarce otwiera się strona logowania",
         "Tam wybiera się konto", "Etiuda sama przechodzi dalej", "Bez klucza licencji do pilnowania",
         "Logowanie",
         "To stanowisko loguje się kontem Microsoft lub Google, aby zajmować swoje miejsce w licencji, i zleca sprawdzenie logowania na etiuda.dev. Liderzy i administrator licencji, do której dołącza, widzą imię i nazwisko oraz adres e-mail z tego konta."].every(s => res.txt.includes(s))
         && res.rawTxt.includes("Co się stanie")
         && ["Logowanie do Etiudy", "Nie teraz",
           "Stanowisko otworzy się bez zmian, a przycisk Zaloguj się zostaje na pasku u góry na później.",
           "Etiuda do użytku prywatnego, poza pracą, nie wymaga logowania."].every(s => !res.txt.includes(s))
      : res.txt.includes("Etiuda starts with a sign-in.") && !res.txt.includes("Not now")
        && !res.txt.includes("Etiuda for personal use, outside work, needs no sign-in.");
    check(copyOk && res.theme === cfg.desk.eTheme && !res.overflowX && !res.skipVisible && res.h1C !== res.bgC,
      "fs3b theme/lang/viewport clean (" + label + ")");
    await ctx.close();
  }

  /* fs3c: Keyboard Tab cycles inside screen across provider controls without skip; Escape does not lower door; seated view lowers door */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      signin: DOOR_VIEW()
    });
    await sleep(400);
    const seenIds = [];
    for (let k = 0; k < 4; k++) {
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
    const reachedAll = seenIds.includes("microsoft") && seenIds.includes("google") && !seenIds.includes("firstSigninSkip") && !seenIds.includes("OUTSIDE");
    await page.keyboard.press("Escape");
    await sleep(800);
    const afterEsc = await page.evaluate(() => ({
      stillOpen: document.body.classList.contains("e-first-signin"),
      tourHidden: !(document.getElementById("tourRoot") && document.getElementById("tourRoot").classList.contains("on"))
    }));
    await page.evaluate(v => {
      window.__signinState = v;
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    }, SEATED_VIEW());
    await sleep(1500);
    const afterSeat = await page.evaluate(() => ({
      closed: !document.body.classList.contains("e-first-signin"),
      tourOn: !!(document.getElementById("tourRoot") && document.getElementById("tourRoot").classList.contains("on"))
    }));
    check(reachedAll && afterEsc.stillOpen && afterEsc.tourHidden && afterSeat.closed && afterSeat.tourOn,
      "fs3c Tab cycles inside screen without skip, Escape leaves door standing, and a seated view lowers it to start tour");
    await ctx.close();
  }

  /* fs3d: Second boot (reload) on an unseated desk still raises the door; only a seated view lowers it */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      signin: DOOR_VIEW()
    });
    await sleep(400);
    const up1 = await page.evaluate(() => document.body.classList.contains("e-first-signin"));
    const savedDesk = await page.evaluate(() => Object.assign({}, window.__deskStore, { eFirstSigninSeen: "1" }));
    await ctx.close();

    const { ctx: ctx2, page: page2 } = await launchDeskPage(browser, {
      desk: savedDesk,
      signin: DOOR_VIEW()
    });
    await sleep(1600);
    const secondBoot = await page2.evaluate(() => ({
      screenUp: document.body.classList.contains("e-first-signin"),
      tourOn: !!(document.getElementById("tourRoot") && document.getElementById("tourRoot").classList.contains("on"))
    }));
    await page2.evaluate(v => {
      window.__signinState = v;
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    }, SEATED_VIEW());
    await sleep(1500);
    const seatedBoot = await page2.evaluate(() => ({
      screenDown: !document.body.classList.contains("e-first-signin"),
      tourOn: !!(document.getElementById("tourRoot") && document.getElementById("tourRoot").classList.contains("on"))
    }));
    check(up1 && secondBoot.screenUp && !secondBoot.tourOn && seatedBoot.screenDown && seatedBoot.tourOn,
      "fs3d second boot still raises door regardless of eFirstSigninSeen, and a seated view lowers it");
    await ctx2.close();
  }

  /* fs3e: waiting state inside screen; refused state shows refusal with Try again and no Not now; Try again returns to choice; seated view lowers door */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      signin: DOOR_VIEW()
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
      window.__signinState = { offered: ["microsoft", "google"], signedIn: "", works: false, registered: true, online: true, busy: "", said: "unreached" };
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    });
    await sleep(200);
    const refused = await page.evaluate(() => {
      const scr = document.getElementById("firstSignin");
      const act = scr && scr.querySelector("[data-signin-act='choose']");
      const skip = document.getElementById("firstSigninSkip");
      return {
        txt: scr ? scr.innerText : "",
        hasAct: !!act,
        noSkip: !skip && !(scr && scr.innerText.includes("Not now"))
      };
    });
    check(refused.txt.includes("The sign-in service could not be reached.") && refused.hasAct && refused.noSkip,
      "fs3e refusal state shows panel message with Try again and no Not now");

    if (refused.hasAct) await page.click("#firstSignin [data-signin-act='choose']");
    await sleep(150);
    const backToChoice = await page.evaluate(() => !!document.querySelector("#firstSignin [data-e-provider='microsoft']"));
    await page.evaluate(v => {
      window.__signinState = v;
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    }, SEATED_VIEW());
    await sleep(200);
    const lowered = await page.evaluate(() => !document.body.classList.contains("e-first-signin"));
    check(backToChoice && lowered, "fs3e Try again returns to provider buttons and a seated view lowers the door");
    await ctx.close();
  }

  /* fs3g: managed-refused on door shows Try again and no Not now, and lowers only on a seated view */
  {
    const m = { on: true, shared: false, personal: false, provider: "microsoft", tenant: true, closed: false, contact: "IT" };
    const { ctx, page } = await launchDeskPage(browser, {
      signin: DOOR_VIEW({ offered: ["microsoft"], managed: m })
    });
    await sleep(300);
    await page.evaluate(managed => {
      window.__signinState = { offered: ["microsoft"], signedIn: "", works: false, registered: true, online: true, busy: "", said: "signin-notassigned", managed };
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    }, m);
    await sleep(200);
    const mr = await page.evaluate(() => {
      const scr = document.getElementById("firstSignin");
      const act = scr && scr.querySelector("[data-signin-act='choose']");
      const skip = document.getElementById("firstSigninSkip");
      return {
        moment: scr && scr.querySelector(".sgn-say") ? scr.innerText : "",
        hasAct: !!act,
        noSkip: !skip && !(scr && scr.innerText.includes("Not now")),
        stillOpen: document.body.classList.contains("e-first-signin")
      };
    });
    await page.evaluate(v => {
      window.__signinState = v;
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    }, SEATED_VIEW({ offered: ["microsoft"], managed: m }));
    await sleep(150);
    const closed = await page.evaluate(() => !document.body.classList.contains("e-first-signin"));
    check(mr.moment.includes("Your organisation has not given this account access to Etiuda.") && mr.hasAct && mr.noSkip && mr.stillOpen && closed,
      "fs3g managed-refused shows Try again with no Not now and lowers only when seated");
    await ctx.close();
  }

  /* fs3h: stranded arriving while door is open shows stranded notice with no Continue bypass; seated view lowers door */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      signin: DOOR_VIEW({ offered: ["microsoft"] })
    });
    await sleep(300);
    await page.evaluate(() => {
      window.__signinState = { offered: ["microsoft"], signedIn: "", works: false, registered: true, online: true, managed: { on: true, stranded: true } };
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    });
    await sleep(200);
    const st = await page.evaluate(() => {
      const scr = document.getElementById("firstSignin");
      const skip = document.getElementById("firstSigninSkip");
      return {
        txt: scr ? scr.innerText : "",
        noSkip: !skip && !(scr && scr.innerText.includes("Continue")),
        stillOpen: document.body.classList.contains("e-first-signin")
      };
    });
    await page.evaluate(v => {
      window.__signinState = v;
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    }, SEATED_VIEW({ offered: ["microsoft"] }));
    await sleep(150);
    const closed = await page.evaluate(() => !document.body.classList.contains("e-first-signin"));
    check(st.txt.includes("This computer's profile did not keep this desk's key.") && st.noSkip && st.stillOpen && closed,
      "fs3h stranded on door shows notice with no Continue bypass and lowers only when seated");
    await ctx.close();
  }

  /* fs3f: signedIn with works false keeps door up; seated view (works true) closes screen, starts tour, leaves tour name empty */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      signin: DOOR_VIEW()
    });
    await sleep(400);
    await page.evaluate(() => {
      window.__signinState = {
        offered: ["microsoft", "google"], signedIn: "microsoft",
        code: "7K3MQ9TV2XRBHN4W", seat: "none", works: false, registered: true, online: true, at: Date.now(), reached: true
      };
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    });
    await sleep(300);
    const stayed = await page.evaluate(() => document.body.classList.contains("e-first-signin"));
    await page.evaluate(v => {
      window.__signinState = v;
      window.__signinCbs.forEach(fn => fn(window.__signinState));
    }, SEATED_VIEW());
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
    check(stayed && res.screenClosed && res.headerPopClosed && res.tourStarted && res.nameEmpty,
      "fs3f signedIn without seat keeps door up; seated view closes door without popping header panel and leaves tour name empty");
    await ctx.close();
  }

  /* Part 4: inline plant proofs (ETIUDA_PLANTS=off skips cleanly with NOT RUN) */
  const plantSpecs = [
    ["fs4a lifting plant:door-due-works causes unseated desk to skip the door", "door-due-works", async lab => {
      const htmlPath = path.join(lab, "due-works.html");
      const plantAt = await buildLiftedHtml("src/modules/signin.js", "door-due-works", htmlPath);
      if (plantAt < 0) return false;
      const { ctx, page } = await launchDeskPage(browser, {
        url: "file:///" + htmlPath.replace(/\\/g, "/"),
        signin: DOOR_VIEW()
      });
      await sleep(1500);
      const skippedDoor = await page.evaluate(() => !document.body.classList.contains("e-first-signin"));
      await ctx.close();
      return skippedDoor === true;
    }],
    ["fs4b lifting plant:first-signin-order causes tour to start while door is open", "first-signin-order", async lab => {
      const htmlPath = path.join(lab, "order.html");
      const plantAt = await buildLiftedHtml("src/modules/tour.js", "first-signin-order", htmlPath);
      if (plantAt < 0) return false;
      const { ctx, page } = await launchDeskPage(browser, {
        url: "file:///" + htmlPath.replace(/\\/g, "/"),
        signin: DOOR_VIEW({ offered: ["microsoft"] })
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
    ["fs4c lifting plant:door-close-works lets a signed-in unseated view lower the door", "door-close-works", async lab => {
      const htmlPath = path.join(lab, "close-works.html");
      const plantAt = await buildLiftedHtml("src/modules/signin.js", "door-close-works", htmlPath);
      if (plantAt < 0) return false;
      const { ctx, page } = await launchDeskPage(browser, {
        url: "file:///" + htmlPath.replace(/\\/g, "/"),
        signin: DOOR_VIEW()
      });
      await sleep(400);
      await page.evaluate(() => {
        window.__signinState = { offered: ["microsoft", "google"], signedIn: "microsoft", works: false, registered: true, online: true };
        window.__signinCbs.forEach(fn => fn(window.__signinState));
      });
      await sleep(250);
      const closedEarly = await page.evaluate(() => !document.body.classList.contains("e-first-signin"));
      await ctx.close();
      return closedEarly === true;
    }],
    ["fs4d lifting plant:desk-works causes unseated desk to read as working and skip the door", "desk-works", async lab => {
      const htmlPath = path.join(lab, "desk-works.html");
      const plantAt = await buildLiftedHtml("src/modules/signin.js", "desk-works", htmlPath);
      if (plantAt < 0) return false;
      const { ctx, page } = await launchDeskPage(browser, {
        url: "file:///" + htmlPath.replace(/\\/g, "/"),
        signin: DOOR_VIEW()
      });
      await sleep(500);
      const skippedDoor = await page.evaluate(() => !document.body.classList.contains("e-first-signin"));
      await ctx.close();
      return skippedDoor === true;
    }],
    ["fs4e lifting plant:door-no-escape lets Escape leak through the standing door", "door-no-escape", async lab => {
      const htmlPath = path.join(lab, "no-escape.html");
      const plantAt = await buildLiftedHtml("src/modules/keydown.js", "door-no-escape", htmlPath);
      if (plantAt < 0) return false;
      const { ctx, page } = await launchDeskPage(browser, {
        url: "file:///" + htmlPath.replace(/\\/g, "/"),
        signin: DOOR_VIEW()
      });
      await sleep(400);
      const leaked = await page.evaluate(() => {
        const el = document.getElementById("intent");
        if (el) el.value = "typed";
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        return el ? el.value === "" : false;
      });
      await ctx.close();
      return leaked === true;
    }],
    ["fs4f lifting plant:door-due-read raises door even with no host view read", "door-due-read", async lab => {
      const htmlPath = path.join(lab, "due-read.html");
      const plantAt = await buildLiftedHtml("src/modules/signin.js", "door-due-read", htmlPath);
      if (plantAt < 0) return false;
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await page.goto("file:///" + htmlPath.replace(/\\/g, "/"), { waitUntil: "domcontentloaded" });
      await sleep(500);
      const opened = await page.evaluate(() => document.body.classList.contains("e-first-signin"));
      await ctx.close();
      return opened === true;
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
