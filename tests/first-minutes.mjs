/* THE DESK'S FIRST MINUTES: tour load step, practice lines, toasts, gender dim ink, name preview, and exact EN/PL copy.
 * Chrome, headless, no external fixtures, no window.
 *
 *   node tests/first-minutes.mjs [--engine <file>]
 *
 * Inline plant proofs verify each behaviour/look check actually catches its regression;
 * skipped with NOT RUN when ETIUDA_PLANTS=off.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
let fails = 0, checks = 0, notRun = 0, EXPECTED = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (!ok && detail !== undefined ? ": " + JSON.stringify(detail) : ""));
  if (!ok) fails++;
};
const skip = (what) => {
  notRun++;
  console.log("  NOT RUN " + what);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argv = process.argv.slice(2);
const at = argv.indexOf("--engine");
const ENGINE = at >= 0 ? path.resolve(argv[at + 1]) : E.ENGINE_PATH;

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-first-minutes-"));
const SAMPLE_TEXT = fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8");
const TEAM_OBJ = JSON.parse(SAMPLE_TEXT);
delete TEAM_OBJ.sample;
TEAM_OBJ.id = "team-cat-test-1";
TEAM_OBJ.rev = 3;
TEAM_OBJ.cards = TEAM_OBJ.cards.slice(0, 1);
const TEAM_TEXT = JSON.stringify(TEAM_OBJ);

function writeEngine(dir, htmlText, withCatalogScript = false) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "etiuda.html"), htmlText);
  if (withCatalogScript) {
    fs.writeFileSync(path.join(dir, "etiuda-catalog.js"), "window.E_CATALOG = " + SAMPLE_TEXT + ";\n");
  }
  return "file:///" + path.join(dir, "etiuda.html").replace(/\\/g, "/");
}

const rawHtml = fs.readFileSync(ENGINE, "utf8");
const cleanEmptyUrl = writeEngine(path.join(lab, "clean-empty"), rawHtml, false);
const cleanSampleUrl = writeEngine(path.join(lab, "clean-sample"), rawHtml, true);
function writeTeamEngine(dir, htmlText) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "etiuda.html"), htmlText);
  fs.writeFileSync(path.join(dir, "etiuda-catalog.js"), "window.E_CATALOG = " + TEAM_TEXT + ";\n");
  return "file:///" + path.join(dir, "etiuda.html").replace(/\\/g, "/");
}
const cleanTeamUrl = writeTeamEngine(path.join(lab, "clean-team"), rawHtml);

const closePage = (p) => {
  const ctx = p && p.browserContext ? p.browserContext() : null;
  const target = ctx && ctx !== p.browser().defaultBrowserContext() ? ctx : p;
  return Promise.race([target.close().catch(() => {}), sleep(5000)]);
};

async function bootCatalogTour(browser, pageUrl, { lang = "en", stepId = "cards", editCard = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.on("dialog", (d) => { d.dismiss().catch(() => {}); });
  await p.setViewport({ width: 1280, height: 860 });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.evaluateOnNewDocument((cfg) => {
    try {
      localStorage.setItem("eUiLang", cfg.lang);
      localStorage.setItem("eAgent", "Anna");
      localStorage.setItem("eNameAsked", "1");
      if (!localStorage.getItem("__fmAccepted")) {
        localStorage.setItem("eTourDone_v3", "1");
      } else {
        sessionStorage.setItem("eTourAt", cfg.stepId);
      }
    } catch (e) {}
  }, { lang, stepId });
  await p.goto(pageUrl, { waitUntil: "load", timeout: 60000 });
  await p.waitForFunction(
    () => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0,
    { timeout: 30000 }
  );
  if (await p.$("#ecYes")) await p.click("#ecYes");
  await p.waitForFunction(
    () => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
      && !document.querySelector(".e-launch-veil"),
    { timeout: 30000 }
  );
  if (editCard) {
    await p.evaluate(() => {
      const btn = document.querySelector('#list .card [data-act="edit"]');
      if (btn) btn.click();
    });
    await p.waitForSelector("#modal:not([hidden]) #meSave", { timeout: 10000 });
    await p.evaluate(() => {
      const inp = document.querySelector("#modal .mf .field-wrap input");
      if (inp) {
        inp.value = inp.value + " edited";
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await p.click("#meSave");
    await sleep(250);
    await p.click("#meCancel");
    await p.waitForFunction(() => document.getElementById("modal").hidden, { timeout: 10000 });
    await sleep(150);
  }
  await p.evaluate((id) => {
    localStorage.setItem("__fmAccepted", "1");
    localStorage.removeItem("eTourDone_v3");
    localStorage.removeItem("eTourInvite_v3");
    sessionStorage.setItem("eTourAt", id);
  }, stepId);
  await p.reload({ waitUntil: "load", timeout: 60000 });
  await p.waitForFunction(() => !!document.querySelector("#tourRoot.on"), { timeout: 15000 });
  await sleep(200);
  return p;
}

async function bootEmptyWithHost(browser, pageUrl, { lang = "en", files = [], host = true } = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.on("dialog", (d) => { d.dismiss().catch(() => {}); });
  await p.setViewport({ width: 1280, height: 860 });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.evaluateOnNewDocument((cfg) => {
    try {
      localStorage.setItem("eUiLang", cfg.lang);
      sessionStorage.setItem("eTourAt", "load");
    } catch (e) {}
    if (!cfg.host) return;
    const desk = { eUiLang: cfg.lang };
    let session = { eTourAt: "load" };
    const fileTexts = cfg.fileTexts;
    const listeners = [];
    window.E_HOST = {
      platform: "win32",
      catalogFolder: cfg.folder,
      catalogFiles: () => cfg.files,
      onCatalogListing: (cb) => {
        if (typeof cb === "function") {
          listeners.push(cb);
          setTimeout(() => cb(cfg.files), 30);
        }
      },
      readCatalogFile: (name) => ({ name, text: fileTexts[name] || "" }),
      pickCatalogFile: () => null,
      deskRead: () => JSON.stringify(desk),
      deskSave: (raw) => {
        try { Object.assign(desk, JSON.parse(raw)); } catch (e) {}
        return true;
      },
      session: (act, k, v) => {
        if (act === "get") return session[k] ?? null;
        if (act === "set") {
          session[k] = String(v);
          try { sessionStorage.setItem(k, String(v)); } catch (e) {}
          return true;
        }
        if (act === "del") {
          delete session[k];
          try { sessionStorage.removeItem(k); } catch (e) {}
          return true;
        }
        if (act === "clear") { session = {}; return true; }
        return null;
      }
    };
    window.__pushHostListing = (rows) => listeners.forEach((cb) => cb(rows));
  }, {
    lang,
    host,
    folder: "C:\\Users\\Test\\Documents\\Etiuda",
    files,
    fileTexts: {
      "sample-catalog.ec": SAMPLE_TEXT,
      "team-catalog.ec": TEAM_TEXT,
      "older-team.ec": TEAM_TEXT
    }
  });
  await p.goto(pageUrl, { waitUntil: "load", timeout: 60000 });
  await p.waitForFunction(() => !!document.querySelector("#tourRoot.on") && !!document.querySelector(".empty-desk"), { timeout: 30000 });
  const atName = await p.evaluate(() => !!document.getElementById("tourName"));
  if (atName) {
    await p.click("#tourNext");
    await p.waitForFunction(() => !document.getElementById("tourName"), { timeout: 10000 });
  }
  await sleep(200);
  return p;
}

async function readTourLoadState(p) {
  return p.evaluate(() => {
    const next = document.getElementById("tourNext");
    const body = document.getElementById("tourBody");
    return {
      stepId: sessionStorage.getItem("eTourAt"),
      disabled: !!(next && next.disabled),
      bodyHtml: body ? body.innerHTML : "",
      bodyText: body ? body.textContent : "",
      cards: document.querySelectorAll("#list .card").length
    };
  });
}

let browser = null;
try {
  browser = await puppeteer.launch({
    executablePath: E.browserPath("chrome"),
    headless: true,
    args: ["--hide-scrollbars"],
    protocolTimeout: 120000
  });

  /* === BEHAVIOUR 1: Tour's load step === */
  {
    const sampleRows = [{ name: "sample-catalog.ec", sample: true, builtIn: false, mtime: 1000, cards: 8 }];
    const mixedRows = [
      { name: "team-catalog.ec", sample: false, builtIn: false, mtime: 3000, cards: 1 },
      { name: "older-team.ec", sample: false, builtIn: false, mtime: 1500, cards: 1 },
      { name: "sample-catalog.ec", sample: true, builtIn: false, mtime: 1000, cards: 8 }
    ];

    /* 1a/1b: Only sample catalog in folder (EN + PL), and Next opens it and moves on */
    EXPECTED += 4;
    for (const [lang, wantFragment] of [
      ["en", "Click <b>Load catalog file</b> to open the practice catalog in "],
      ["pl", "Proszę kliknąć <b>Wczytaj plik katalogu</b>, aby otworzyć przykładowy katalog z folderu "]
    ]) {
      const p = await bootEmptyWithHost(browser, cleanEmptyUrl, { lang, files: sampleRows });
      const before = await readTourLoadState(p);
      check(
        before.stepId === "load" && before.disabled === false && before.bodyHtml.includes(wantFragment),
        `1a (${lang}) load step with only sample names practice catalog and enables Next`,
        before
      );
      await p.click("#tourNext");
      await p.waitForFunction(
        () => sessionStorage.getItem("eTourAt") !== "load" && document.querySelectorAll("#list .card").length > 0,
        { timeout: 15000 }
      ).catch(() => {});
      const after = await readTourLoadState(p);
      check(
        after.stepId && after.stepId !== "load" && after.cards > 0,
        `1b (${lang}) clicking Next on load step with sample opens it and moves on`,
        after
      );
      await closePage(p);
    }

    /* 1c/1d: Non-sample newest file + sample in folder (EN + PL), names newest file and Next opens it */
    EXPECTED += 4;
    for (const [lang, wantNextWord] of [["en", "Next"], ["pl", "Dalej"]]) {
      const p = await bootEmptyWithHost(browser, cleanEmptyUrl, { lang, files: mixedRows });
      const before = await readTourLoadState(p);
      check(
        before.stepId === "load" && before.disabled === false
          && before.bodyText.includes("team-catalog.ec")
          && !before.bodyText.includes("older-team.ec")
          && before.bodyHtml.includes("<b>" + wantNextWord + "</b>"),
        `1c (${lang}) load step with non-sample file names newest file and enables Next`,
        before
      );
      await p.click("#tourNext");
      await p.waitForFunction(
        () => sessionStorage.getItem("eTourAt") !== "load" && document.querySelectorAll("#list .card").length === 1,
        { timeout: 15000 }
      ).catch(() => {});
      const after = await readTourLoadState(p);
      check(
        after.stepId && after.stepId !== "load" && after.cards === 1,
        `1d (${lang}) clicking Next on load step with team-catalog.ec opens it and moves on`,
        after
      );
      await closePage(p);
    }

    /* 1e/1f: Greyed Next (empty folder + browser) explains why Next is off (EN + PL) */
    EXPECTED += 4;
    for (const [label, opts] of [
      ["empty desk folder EN", { lang: "en", files: [], host: true }],
      ["empty desk folder PL", { lang: "pl", files: [], host: true }],
      ["browser EN", { lang: "en", files: [], host: false }],
      ["browser PL", { lang: "pl", files: [], host: false }]
    ]) {
      const p = await bootEmptyWithHost(browser, cleanEmptyUrl, opts);
      const st = await readTourLoadState(p);
      const explainsGrey = opts.lang === "pl"
        ? /Dalej<\/b>.*nieaktywn|wczytany/i.test(st.bodyHtml)
        : /Next<\/b>.*(?:stays off|disabled|until)/i.test(st.bodyHtml);
      check(
        st.stepId === "load" && st.disabled === true && explainsGrey,
        `1e (${label}) grey Next explains why in bubble`,
        st
      );
      await closePage(p);
    }

    /* Plant 1: regress nextHeld/load step so sample no longer enables Next */
    EXPECTED += 1;
    if (PLANTS_OFF) {
      skip("plant-load-next: disabling folder pick turns 1a/1b red (ETIUDA_PLANTS=off)");
    } else {
      const planted = rawHtml.replace(
        /function eFolderCatalogPick\(\)\s*\{\s*return [^}]*\}/,
        "function eFolderCatalogPick() { return null; }"
      );
      const plantUrl = writeEngine(path.join(lab, "plant-1"), planted, false);
      const p = await bootEmptyWithHost(browser, plantUrl, { lang: "en", files: sampleRows });
      const st = await readTourLoadState(p);
      check(planted !== rawHtml && st.disabled === true, "plant-load-next: disabling folder pick turns 1a red", st);
      await closePage(p);
    }
  }

  /* === BEHAVIOUR 2: Practice lines in tour === */
  {
    const readTourBubble = (p) => p.evaluate(() => {
      const t = document.getElementById("tourTitle");
      const b = document.getElementById("tourBody");
      const sm = document.getElementById("sampleMark");
      return {
        stepId: sessionStorage.getItem("eTourAt"),
        title: t ? t.textContent : "",
        bodyText: b ? b.textContent : "",
        sampleMarkHidden: sm ? sm.hidden : null
      };
    });

    const cardsExtra = {
      en: "These replies are examples to practise with, not for a live chat.",
      pl: "Te odpowiedzi to przykłady do ćwiczeń, nie do prawdziwej rozmowy."
    };
    const doneTitle = {
      sample: { en: "Ready to practise", pl: "Gotowe do ćwiczeń" },
      team: { en: "Ready for the first customer", pl: "Gotowe na pierwszego klienta" }
    };
    const doneExtra = {
      en: "Before the first customer, load your team's catalog.",
      pl: "Przed pierwszym klientem trzeba wczytać katalog zespołu."
    };

    /* 2a/2b: Sample catalog shows practice lines on cards + done in EN & PL, and watermark stays shown */
    EXPECTED += 4;
    for (const lang of ["en", "pl"]) {
      const pCards = await bootCatalogTour(browser, cleanSampleUrl, { lang, stepId: "cards" });
      const stCards = await readTourBubble(pCards);
      check(
        stCards.sampleMarkHidden === false && stCards.bodyText.includes(cardsExtra[lang]),
        `2a (${lang}) untouched sample shows diagonal stamp and cards practice sentence`,
        stCards
      );
      await closePage(pCards);

      const pDone = await bootCatalogTour(browser, cleanSampleUrl, { lang, stepId: "done" });
      const stDone = await readTourBubble(pDone);
      check(
        stDone.title === doneTitle.sample[lang] && stDone.bodyText.includes(doneExtra[lang]),
        `2b (${lang}) sample shows Ready to practise title and team catalog sentence on done`,
        stDone
      );
      await closePage(pDone);
    }

    /* 2c: Saving a card on sample hides the diagonal stamp, yet tour practice lines STAY on! */
    EXPECTED += 2;
    {
      const pCards = await bootCatalogTour(browser, cleanSampleUrl, { lang: "en", stepId: "cards", editCard: true });
      const stCards = await readTourBubble(pCards);
      check(
        stCards.sampleMarkHidden === true && stCards.bodyText.includes(cardsExtra.en),
        "2c (en) saved card hides diagonal stamp while cards practice sentence stays on",
        stCards
      );
      await closePage(pCards);

      const pDone = await bootCatalogTour(browser, cleanSampleUrl, { lang: "pl", stepId: "done", editCard: true });
      const stDone = await readTourBubble(pDone);
      check(
        stDone.sampleMarkHidden === true && stDone.title === doneTitle.sample.pl && stDone.bodyText.includes(doneExtra.pl),
        "2c (pl) saved card hides diagonal stamp while done practice title and sentence stay on",
        stDone
      );
      await closePage(pDone);
    }

    /* 2d: Team catalog shows normal done title and no practice sentences */
    EXPECTED += 4;
    for (const lang of ["en", "pl"]) {
      const pCards = await bootCatalogTour(browser, cleanTeamUrl, { lang, stepId: "cards" });
      const stCards = await readTourBubble(pCards);
      check(
        !stCards.bodyText.includes(cardsExtra[lang]),
        `2d (${lang}) non-sample catalog omits cards practice sentence`,
        stCards
      );
      await closePage(pCards);

      const pDone = await bootCatalogTour(browser, cleanTeamUrl, { lang, stepId: "done" });
      const stDone = await readTourBubble(pDone);
      check(
        stDone.title === doneTitle.team[lang] && !stDone.bodyText.includes(doneExtra[lang]),
        `2d (${lang}) non-sample catalog keeps Ready for the first customer and omits practice sentence`,
        stDone
      );
      await closePage(pDone);
    }

    /* Plant 2: gate practice lines on sampleUntouched() instead of pack's own sample mark -> 2c turns red */
    EXPECTED += 1;
    if (PLANTS_OFF) {
      skip("plant-practice-mark: gating on sampleUntouched turns 2c red (ETIUDA_PLANTS=off)");
    } else {
      const planted = rawHtml.replace(
        /function sampleLoaded\(\)\s*\{[^}]*\}/,
        "function sampleLoaded() { return typeof nsGet === 'function' && nsGet('Sample') === '1' && sampleUntouched(); }"
      );
      const plantUrl = writeEngine(path.join(lab, "plant-2"), planted, true);
      const pDone = await bootCatalogTour(browser, plantUrl, { lang: "en", stepId: "done", editCard: true });
      const stDone = await readTourBubble(pDone);
      check(
        planted !== rawHtml && stDone.title !== doneTitle.sample.en && !stDone.bodyText.includes(doneExtra.en),
        "plant-practice-mark: gating on sampleUntouched turns 2c red",
        stDone
      );
      await closePage(pDone);
    }
  }

  /* === BEHAVIOUR 3: Toasts stay for a time following their length (1700 ms floor) === */
  {
    const runToastProbe = async (pageUrl, { lang = "en" } = {}) => {
      const ctx = await browser.createBrowserContext();
      const p = await ctx.newPage();
      p.on("dialog", (d) => { d.dismiss().catch(() => {}); });
      await p.setViewport({ width: 1280, height: 860 });
      await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await p.evaluateOnNewDocument((l) => {
        const reloadingForTour = !!sessionStorage.getItem("eTourAt");
        try {
          localStorage.setItem("eUiLang", l);
          localStorage.setItem("eAgent", "Anna");
          localStorage.setItem("eNameAsked", "1");
          if (!reloadingForTour) localStorage.setItem("eTourDone_v3", "1");
        } catch (e) {}
        if (!window.E_HOST) {
          const desk = { eUiLang: l, eAgent: "Anna", eNameAsked: "1", ...(reloadingForTour ? {} : { eTourDone_v3: "1" }) };
          window.E_HOST = {
            platform: "win32",
            openPicker: () => {},
            hotkeyState: () => ({ accel: "Control+Shift+Q", held: true, taken: false }),
            deskRead: () => JSON.stringify(desk),
            deskSave: (raw) => { try { Object.assign(desk, JSON.parse(raw)); } catch (e) {} return true; }
          };
        }
        window.__toastLog = [];
        const origSet = window.setTimeout;
        window.setTimeout = function (fn, ms, ...rest) {
          const id = origSet.call(window, fn, ms, ...rest);
          try {
            const src = typeof fn === "function" ? fn.toString() : "";
            const el = document.getElementById("toast");
            if (el && src.includes('classList.remove("show")') && el.classList.contains("show")) {
              window.__toastLog.push({ text: el.textContent, ms: Number(ms) });
            }
          } catch (e) {}
          return id;
        };
      }, lang);
      await p.goto(pageUrl, { waitUntil: "load", timeout: 60000 });
      await p.waitForFunction(
        () => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0,
        { timeout: 30000 }
      );
      if (await p.$("#ecYes")) await p.click("#ecYes");
      await p.waitForFunction(
        () => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
          && !document.querySelector(".e-launch-veil"),
        { timeout: 30000 }
      );
      await sleep(200);

      /* First copy triggers first-copy toast */
      await p.click("#list .card");
      await sleep(100);
      /* Saving an edited card triggers a short toast ("Card saved") testing the 1700 ms floor */
      await p.evaluate(() => {
        const el = document.getElementById("toast");
        if (el) el.classList.remove("show");
        const btn = document.querySelector('#list .card [data-act="edit"]');
        if (btn) btn.click();
      });
      await p.waitForSelector("#modal:not([hidden]) #meSave", { timeout: 10000 });
      await p.evaluate(() => {
        const inp = document.querySelector("#modal .mf .field-wrap input");
        if (inp) {
          inp.value = inp.value + " x";
          inp.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      await p.click("#meSave");
      await sleep(200);
      await p.click("#meCancel");
      await p.waitForFunction(() => document.getElementById("modal").hidden, { timeout: 10000 });
      const copyLog = await p.evaluate(() => window.__toastLog.slice());

      /* Skip tour triggers Skip toast; check live DOM retention past 1700 ms (at 1900 ms) */
      await p.evaluate(() => {
        localStorage.removeItem("eTourDone_v3");
        localStorage.removeItem("eTourInvite_v3");
        sessionStorage.setItem("eTourAt", "pax");
      });
      await p.reload({ waitUntil: "load", timeout: 60000 });
      await p.waitForFunction(() => !!document.querySelector("#tourRoot.on") && !!document.getElementById("tourSkip"), { timeout: 15000 });
      await p.evaluate(() => {
        const el = document.getElementById("toast");
        if (el) el.classList.remove("show");
      });
      await p.click("#tourSkip");
      await sleep(100);
      const skipAt100 = await p.evaluate(() => {
        const el = document.getElementById("toast");
        return !!(el && el.classList.contains("show"));
      });
      await sleep(1850);
      const skipAt1950 = await p.evaluate(() => {
        const el = document.getElementById("toast");
        return !!(el && el.classList.contains("show"));
      });
      const skipLog = await p.evaluate(() => window.__toastLog.slice());
      await closePage(p);
      return { copyLog, skipLog, skipAt100, skipAt1950 };
    };

    EXPECTED += 4;
    const res = await runToastProbe(cleanSampleUrl, { lang: "en" });
    const firstCopy = res.copyLog[0] || { text: "", ms: 0 };
    const shortCopy = res.copyLog[1] || { text: "", ms: 0 };
    const skipEntry = res.skipLog[res.skipLog.length - 1] || { text: "", ms: 0 };
    check(
      shortCopy.ms >= 1700 && shortCopy.text.length < skipEntry.text.length,
      "3a short toast respects 1700 ms floor",
      { shortCopy, skipEntry }
    );
    check(
      skipEntry.ms > shortCopy.ms && skipEntry.ms >= 2800 && firstCopy.ms > skipEntry.ms && firstCopy.ms >= 5500,
      "3b toast durations scale cleanly with message length (short <= skip < firstCopy)",
      { shortCopy, skipEntry, firstCopy }
    );
    check(
      res.skipAt100 === true && res.skipAt1950 === true,
      "3c Skip toast actually remains visible past 1700 ms (at 1950 ms)",
      { skipAt100: res.skipAt100, skipAt1950: res.skipAt1950, skipEntry }
    );

    if (PLANTS_OFF) {
      skip("plant-toast-fixed: fixing duration to TOAST_MS turns 3c red (ETIUDA_PLANTS=off)");
    } else {
      const planted = rawHtml.replace(
        /function toastDurationMs\([^)]*\)\s*\{[^}]*\}/,
        "function toastDurationMs() { return TOAST_MS; }"
      );
      const plantUrl = writeEngine(path.join(lab, "plant-3"), planted, true);
      const pr = await runToastProbe(plantUrl, { lang: "en" });
      check(
        planted !== rawHtml && pr.skipAt100 === true && pr.skipAt1950 === false,
        "plant-toast-fixed: fixing duration to TOAST_MS turns 3c red",
        { skipAt100: pr.skipAt100, skipAt1950: pr.skipAt1950 }
      );
    }
  }

  /* === LOOK 4: Gender mark beside empty customer name === */
  {
    const readGenderVisual = (p) => p.evaluate(() => {
      const drum = document.getElementById("genderDrum");
      const svg = drum ? drum.querySelector(".gd-cur") : null;
      const rs = getComputedStyle(document.documentElement);
      const parseRgb = (s) => {
        const el = document.createElement("span");
        el.style.color = s;
        document.body.appendChild(el);
        const c = getComputedStyle(el).color;
        el.remove();
        return c;
      };
      return {
        dimInk: parseRgb(rs.getPropertyValue("--dim").trim()),
        fullInk: parseRgb(rs.getPropertyValue("--ink").trim()),
        curColor: svg ? getComputedStyle(svg).color : "",
        hand: !!(drum && drum.classList.contains("gd-hand")),
        empty: !!(drum && drum.classList.contains("gd-empty")),
        title: drum ? drum.title : "",
        g: drum ? drum.dataset.g : ""
      };
    });

    const probeGender = async (pageUrl) => {
      const ctx = await browser.createBrowserContext();
      const p = await ctx.newPage();
      p.on("dialog", (d) => { d.dismiss().catch(() => {}); });
      await p.setViewport({ width: 1280, height: 860 });
      await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await p.evaluateOnNewDocument(() => {
        try {
          localStorage.setItem("eUiLang", "en");
          localStorage.setItem("eAgent", "Anna");
          localStorage.setItem("eNameAsked", "1");
          localStorage.setItem("eTourDone_v3", "1");
        } catch (e) {}
      });
      await p.goto(pageUrl, { waitUntil: "load", timeout: 60000 });
      await p.waitForFunction(
        () => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0,
        { timeout: 30000 }
      );
      if (await p.$("#ecYes")) await p.click("#ecYes");
      await p.waitForFunction(
        () => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
          && !document.querySelector(".e-launch-veil"),
        { timeout: 30000 }
      );
      await sleep(150);

      const whenEmpty = await readGenderVisual(p);
      await p.focus("#pax");
      await p.keyboard.type("Anna");
      await sleep(100);
      const whenTyped = await readGenderVisual(p);

      await p.click("#genderDrum");
      await sleep(100);
      const whenHand = await readGenderVisual(p);

      await p.evaluate(() => {
        const el = document.getElementById("pax");
        el.value = "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await sleep(100);
      const whenCleared = await readGenderVisual(p);

      await closePage(p);
      return { whenEmpty, whenTyped, whenHand, whenCleared };
    };

    EXPECTED += 4;
    const g = await probeGender(cleanSampleUrl);
    check(
      g.whenEmpty.curColor === g.whenEmpty.dimInk && g.whenEmpty.hand === false && !!g.whenEmpty.title,
      "4a empty #pax draws gender mark in dim ink (--dim) with tooltip",
      g.whenEmpty
    );
    check(
      g.whenTyped.curColor === g.whenTyped.fullInk && g.whenTyped.curColor !== g.whenTyped.dimInk
        && g.whenTyped.hand === false && g.whenTyped.g === "f",
      "4b typing a customer name gives gender mark full ink (--ink) while staying auto-detected",
      g.whenTyped
    );
    check(
      g.whenHand.hand === true && g.whenHand.curColor === g.whenHand.fullInk
        && g.whenHand.g !== g.whenTyped.g && g.whenHand.title !== g.whenTyped.title
        && g.whenCleared.hand === false && g.whenCleared.curColor === g.whenCleared.dimInk,
      "4c click tooltip/behaviour stay and clearing #pax returns mark to dim ink",
      { whenHand: g.whenHand, whenCleared: g.whenCleared }
    );

    if (PLANTS_OFF) {
      skip("plant-gender-dim: keeping gd-cur dim without gd-hand turns 4b red (ETIUDA_PLANTS=off)");
    } else {
      const planted = rawHtml.replace(
        /#genderDrum\.gd-empty:not\(\.gd-hand\) \.gd-cur\{color:var\(--dim\)\}/,
        "#genderDrum:not(.gd-hand) .gd-cur{color:var(--dim)}"
      );
      const plantUrl = writeEngine(path.join(lab, "plant-4"), planted, true);
      const pg = await probeGender(plantUrl);
      check(
        planted !== rawHtml && pg.whenTyped.curColor === pg.whenTyped.dimInk,
        "plant-gender-dim: keeping gd-cur dim without gd-hand turns 4b red",
        pg.whenTyped
      );
    }
  }

  /* === LOOK 5: Name step preview shows the name alone, not a greetLine sentence === */
  {
    const probeNamePreview = async (pageUrl, { lang = "en" } = {}) => {
      const ctx = await browser.createBrowserContext();
      const p = await ctx.newPage();
      p.on("dialog", (d) => { d.dismiss().catch(() => {}); });
      await p.setViewport({ width: 1280, height: 860 });
      await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await p.evaluateOnNewDocument((l) => {
        try {
          localStorage.setItem("eUiLang", l);
          sessionStorage.setItem("eTourAt", "name");
        } catch (e) {}
      }, lang);
      await p.goto(pageUrl, { waitUntil: "load", timeout: 60000 });
      await p.waitForFunction(() => !!document.querySelector("#tourRoot.on") && !!document.getElementById("tourName"), { timeout: 20000 });
      await sleep(150);
      const emptyPrev = await p.evaluate(() => {
        const el = document.getElementById("tourNamePrev");
        return el ? el.textContent : "";
      });
      await p.type("#tourName", "Marta Nowak");
      await sleep(80);
      const typedPrev = await p.evaluate(() => {
        const el = document.getElementById("tourNamePrev");
        return el ? el.textContent : "";
      });
      await closePage(p);
      return { emptyPrev, typedPrev };
    };

    EXPECTED += 3;
    const en = await probeNamePreview(cleanEmptyUrl, { lang: "en" });
    check(
      en.emptyPrev === "Kate" && en.typedPrev === "Marta Nowak",
      "5a (en) name step preview shows Kate when empty and the typed name alone when filled",
      en
    );
    const pl = await probeNamePreview(cleanEmptyUrl, { lang: "pl" });
    check(
      pl.emptyPrev === "Kasia" && pl.typedPrev === "Marta Nowak",
      "5a (pl) name step preview shows Kasia when empty and the typed name alone when filled",
      pl
    );

    if (PLANTS_OFF) {
      skip("plant-name-preview: restoring greetLine sentence turns 5a red (ETIUDA_PLANTS=off)");
    } else {
      const planted = rawHtml.replace(
        /if\s*\(!shown\d*\.length\)\s*\{\s*prev\.innerHTML\s*=\s*who;\s*return;\s*\}/,
        'if (prev) { prev.innerHTML = "Good morning, my name is " + who; return; }'
      );
      const plantUrl = writeEngine(path.join(lab, "plant-5"), planted, false);
      const pg = await probeNamePreview(plantUrl, { lang: "en" });
      check(
        planted !== rawHtml && pg.typedPrev !== "Marta Nowak",
        "plant-name-preview: restoring greetLine sentence turns 5a red",
        pg
      );
    }
  }

  /* === 6: The words (EN and PL copywriter updates in the first minutes) === */
  {
    const sampleRows = [{ name: "sample-catalog.ec", sample: true, builtIn: false, mtime: 1000, cards: 8 }];
    const folderShort = "Documents\\Etiuda";

    const readStep = async (lang, stepId, { roleSeen = false } = {}) => {
      const preStep = stepId === "editor" ? "buttons"
        : stepId === "libraryRail" ? "library"
        : stepId === "settingsRail" ? "settings"
        : stepId;
      const p = await bootCatalogTour(browser, cleanSampleUrl, { lang, stepId: preStep });
      if (roleSeen) {
        await p.evaluate((id) => {
          localStorage.setItem("eRoleSeen", "1");
          sessionStorage.setItem("eTourAt", id);
        }, preStep);
        await p.reload({ waitUntil: "load", timeout: 60000 });
        await p.waitForFunction(() => !!document.querySelector("#tourRoot.on"), { timeout: 15000 });
        await sleep(160);
      }
      if (stepId === "editor") {
        await p.click("#tourNext");
        await p.waitForFunction(() => sessionStorage.getItem("eTourAt") === "editor", { timeout: 10000 });
        await sleep(160);
      } else if (stepId === "libraryRail" || stepId === "settingsRail") {
        await p.click("#tourNext");
        const mid = stepId === "libraryRail" ? "libraryIn" : "settingsIn";
        await p.waitForFunction((m) => sessionStorage.getItem("eTourAt") === m, { timeout: 10000 }, mid);
        await sleep(120);
        await p.click("#tourNext");
        await p.waitForFunction((target) => sessionStorage.getItem("eTourAt") === target, { timeout: 10000 }, stepId);
        await sleep(160);
      }
      const res = await p.evaluate(() => ({
        title: (document.getElementById("tourTitle") || {}).textContent || "",
        bodyHtml: (document.getElementById("tourBody") || {}).innerHTML || "",
        bodyText: (document.getElementById("tourBody") || {}).textContent || ""
      }));
      await closePage(p);
      return res;
    };

    const probeFirstCopyToast = async (lang) => {
      const ctx = await browser.createBrowserContext();
      const p = await ctx.newPage();
      p.on("dialog", (d) => { d.dismiss().catch(() => {}); });
      await p.setViewport({ width: 1280, height: 860 });
      await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await p.evaluateOnNewDocument((l) => {
        try {
          localStorage.setItem("eUiLang", l);
          localStorage.setItem("eTourDone_v3", "1");
          localStorage.setItem("eAgent", "Anna");
          localStorage.setItem("eNameAsked", "1");
        } catch (e) {}
        try {
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: () => Promise.resolve() }
          });
        } catch (e) {}
        const desk = { eUiLang: l, eTourDone_v3: "1", eAgent: "Anna", eNameAsked: "1" };
        window.E_HOST = {
          platform: "win32",
          openPicker: () => {},
          hotkeyState: () => ({ accel: "Control+Shift+Space", held: true, taken: false }),
          deskRead: () => JSON.stringify(desk),
          deskSave: (raw) => { try { Object.assign(desk, JSON.parse(raw)); } catch (e) {} return true; },
          session: () => null
        };
      }, lang);
      await p.goto(cleanSampleUrl, { waitUntil: "load", timeout: 60000 });
      await p.waitForFunction(
        () => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0,
        { timeout: 30000 }
      );
      if (await p.$("#ecYes")) await p.click("#ecYes");
      await p.waitForFunction(
        () => !!document.querySelector("#list .card .txt[data-v]") && !document.getElementById("ecYes") && !document.querySelector(".e-launch-veil"),
        { timeout: 20000 }
      );
      await p.click("#list .card .txt[data-v]");
      await p.waitForFunction(() => {
        const el = document.getElementById("toast");
        return !!(el && el.classList.contains("show") && el.textContent.trim().length > 0);
      }, { timeout: 8000 });
      const msg = await p.evaluate(() => (document.getElementById("toast") || {}).textContent || "");
      await closePage(p);
      return msg;
    };

    const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
    EXPECTED += 16;

    // Item 1 (load step with practice catalog) checked in EN & PL
    for (const [lang, expected] of [
      ["en", "Click <b>Load catalog file</b> to open the practice catalog in " + folderShort + ", to try Etiuda before your team's own arrives."],
      ["pl", "Prosz\u0119 klikn\u0105\u0107 <b>Wczytaj plik katalogu</b>, aby otworzy\u0107 przyk\u0142adowy katalog z folderu " + folderShort + " i wypr\u00f3bowa\u0107 Etiud\u0119, zanim dotrze katalog zespo\u0142u."]
    ]) {
      const p = await bootEmptyWithHost(browser, cleanEmptyUrl, { lang, files: sampleRows });
      const st = await readTourLoadState(p);
      await closePage(p);
      check(
        st.bodyHtml.includes(expected),
        `6.1 (${lang}) load step carries the copywriter practice-catalog sentence`,
        st
      );
    }

    // Item 3 (PL name example, with and without wheel) + Item 4 (wheel, EN & PL)
    const paxNoWheelPl = await readStep("pl", "pax", { roleSeen: false });
    const paxWheelPl = await readStep("pl", "pax", { roleSeen: true });
    const paxWheelEn = await readStep("en", "pax", { roleSeen: true });
    check(
      [paxNoWheelPl, paxWheelPl].every((x) =>
        x.bodyHtml.includes("(ANNA KOWALSKA zamienia si\u0119 w <b>Anno</b>)") &&
        x.bodyHtml.includes("a ka\u017cda odpowied\u017a zwraca si\u0119 do tej osoby po imieniu")
      ),
      "6.3 (pl) pax step (with and without wheel) uses exact ANNA KOWALSKA and tej osoby wording",
      { paxNoWheelPl, paxWheelPl }
    );
    check(
      paxWheelEn.bodyHtml.includes("The wheel beside it chooses who in the team this reply names.") &&
      paxWheelPl.bodyHtml.includes("K\u00f3\u0142ko obok wybiera osob\u0119 z zespo\u0142u, kt\u00f3r\u0105 wymienia ta odpowied\u017a."),
      "6.4 (en/pl) pax step with wheel uses exact team-member wheel wording",
      { paxWheelEn, paxWheelPl }
    );

    // Item 6 (name step + libraryRail + settingsRail, EN & PL)
    const nameEn = await readStep("en", "name");
    const namePl = await readStep("pl", "name");
    check(
      norm(nameEn.bodyHtml) === "To begin, the name your replies are signed with. Customers see it at the foot of each one, and it can be changed at any time in Settings, under Account." &&
      norm(namePl.bodyHtml) === "Na pocz\u0105tek podpis: imi\u0119, kt\u00f3re klienci zobacz\u0105 pod ka\u017cd\u0105 odpowiedzi\u0105. Mo\u017cna je zmieni\u0107 w ka\u017cdej chwili w Ustawieniach, w cz\u0119\u015bci Konto.",
      "6.6a (en/pl) name step points to Settings, under Account",
      { nameEn, namePl }
    );

    const libEn = await readStep("en", "libraryRail");
    const libPl = await readStep("pl", "libraryRail");
    check(
      norm(libEn.bodyHtml) === "Its parts are on the left: <b>Categories &amp; cards</b>, <b>Intents</b>, <b>ROLE suggestions</b> and <b>Catalog &amp; data</b>, where a catalog is loaded and your own improvements go out as a file for whoever keeps the wording." &&
      norm(libPl.bodyHtml) === "Jej cz\u0119\u015bci s\u0105 po lewej: <b>Kategorie i karty</b>, <b>Intencje</b>, <b>Podpowiedzi ROLE</b> oraz <b>Katalog i dane</b>, gdzie wczytuje si\u0119 katalog i sk\u0105d wysy\u0142a si\u0119 w\u0142asne poprawki, jako plik dla osoby, kt\u00f3ra dba o tre\u015b\u0107.",
      "6.6b (en/pl) libraryRail names exact four parts in bold",
      { libEn, libPl }
    );

    const setEn = await readStep("en", "settingsRail");
    const setPl = await readStep("pl", "settingsRail");
    check(
      norm(setEn.bodyHtml) === "The parts are on the left: your name is under <b>Account</b>, the language under <b>General</b>, the look under <b>Appearance</b>, and every shortcut, Quick replies' included, under <b>Keyboard shortcuts</b>." &&
      norm(setPl.bodyHtml) === "Cz\u0119\u015bci s\u0105 po lewej: imi\u0119 jest w <b>Koncie</b>, j\u0119zyk w <b>Og\u00f3lnych</b>, wygl\u0105d aplikacji w <b>Wygl\u0105dzie</b>, a wszystkie skr\u00f3ty, tak\u017ce do Szybkich odpowiedzi, w <b>Skr\u00f3tach klawiszowych</b>.",
      "6.6c (en/pl) settingsRail puts Account first and matches exact section names",
      { setEn, setPl }
    );

    // Item 7 (PL intent token in rail step + 898 tooltip)
    const railPl = await readStep("pl", "rail");
    check(
      railPl.bodyHtml.includes('<span class="fillmiss">INTENCJA</span>') && !railPl.bodyHtml.includes('<span class="fillmiss">INTENT</span>'),
      "6.7a (pl) rail step dashed token reads INTENCJA",
      railPl
    );
    const tipKey = "Hide the intent panel; its chips then appear on the first card that uses {INTENT}";
    const tipPlMatch = rawHtml.includes('"Ukryj panel intencji; przyciski intencji pojawi\\u0105 si\\u0119 wtedy na pierwszej karcie, kt\\u00f3ra u\\u017cywa INTENCJA"') ||
      rawHtml.includes('"Ukryj panel intencji; przyciski intencji pojawi\u0105 si\u0119 wtedy na pierwszej karcie, kt\u00f3ra u\u017cywa INTENCJA"');
    const tipOldMatch = rawHtml.includes("na pierwszej karcie, kt\\u00f3ra u\\u017cywa {INTENT}") ||
      rawHtml.includes("na pierwszej karcie, kt\u00f3ra u\u017cywa {INTENT}");
    check(
      rawHtml.includes(tipKey) && tipPlMatch && !tipOldMatch,
      "6.7b (pl) menuRail static tooltip reads INTENCJA instead of {INTENT}",
      { tipPlMatch, tipOldMatch }
    );

    // Item 9 (pills title EN & PL)
    const pillsEn = await readStep("en", "pills");
    const pillsPl = await readStep("pl", "pills");
    check(pillsEn.title === "The category bar", "6.9 (en) pills step title is The category bar", pillsEn);
    check(pillsPl.title === "Pasek kategorii", "6.9 (pl) pills step title is Pasek kategorii", pillsPl);

    // Item 10 (editor fold list EN & PL, leaving "Commits the firm" untouched)
    const edEn = await readStep("en", "editor");
    const edPl = await readStep("pl", "editor");
    check(
      norm(edEn.bodyHtml).startsWith('<span class="t-sec">Content</span> holds the text in both languages and the internal note; the folds below hold the keywords, the category, the linked intents, the next replies and the advanced settings. <b>Cancel</b> leaves everything as it was.'),
      "6.10a (en) editor step names exact folds including the next replies and the advanced settings",
      edEn
    );
    check(
      norm(edPl.bodyHtml).startsWith('<span class="t-sec">Tre\u015b\u0107</span> to tekst w obu j\u0119zykach i notatka wewn\u0119trzna; w zwini\u0119tych sekcjach poni\u017cej s\u0105 s\u0142owa kluczowe, kategoria, powi\u0105zane intencje, kolejne odpowiedzi i ustawienia zaawansowane. <b>Anuluj</b> zostawia wszystko bez zmian.'),
      "6.10b (pl) editor step names exact folds including kolejne odpowiedzi",
      edPl
    );
    check(
      !rawHtml.includes("Binding on the firm") && !rawHtml.includes("Wi\u0105\u017ce firm\u0119"),
      "6.10c Commits the firm label stays unchanged (not Binding on the firm)",
      {}
    );

    // Item 11 (first copy's toast EN & PL)
    const toastEn = await probeFirstCopyToast("en");
    const toastPl = await probeFirstCopyToast("pl");
    check(
      toastEn === "Copied: paste it into the chat with Ctrl+V. Next time, Ctrl+Shift+Space opens Quick replies over any window and pastes the one chosen.",
      "6.11 (en) first copy toast explains Ctrl+V and Ctrl+Shift+Space picker",
      { toastEn }
    );
    check(
      toastPl === "Skopiowano: wystarczy wklei\u0107 odpowied\u017a w czacie skr\u00f3tem Ctrl+V. Nast\u0119pnym razem Ctrl+Shift+Space otworzy Szybkie odpowiedzi nad dowolnym oknem i wklei wybran\u0105.",
      "6.11 (pl) first copy toast explains Ctrl+V and Ctrl+Shift+Space picker",
      { toastPl }
    );
  }
} catch (err) {
  console.error("HARNESS ERROR:", err);
  fails++;
} finally {
  if (browser) await browser.close().catch(() => {});
  fs.rmSync(lab, { recursive: true, force: true });
}

console.log(`#counts checks=${checks} failed=${fails} notRun=${notRun} expected=${EXPECTED}`);
if (fails > 0 || checks + notRun !== EXPECTED) process.exit(fails || 1);
