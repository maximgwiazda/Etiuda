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
} catch (err) {
  console.error("HARNESS ERROR:", err);
  fails++;
} finally {
  if (browser) await browser.close().catch(() => {});
  fs.rmSync(lab, { recursive: true, force: true });
}

console.log(`#counts checks=${checks} failed=${fails} notRun=${notRun} expected=${EXPECTED}`);
if (fails > 0 || checks + notRun !== EXPECTED) process.exit(fails || 1);
