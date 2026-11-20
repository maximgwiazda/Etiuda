/* SHARING A CARD WITH A NAMED TEAMMATE (board 1013): the card's Share button, menu row, picker bubble, refusals,
 * arriving row, Keep / Later / Decline bubble, "from" mark, and desk-file write on a never-edited desk.
 *
 *   node tests/desk-share.mjs [--engine <file>]
 *
 * Headless Chrome on the built engine page with a mocked E_HOST answering teamJoin, branchIdentity and writeBranch.
 * Exit code is the number of failed checks; 78 when the run could not complete.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");
const { seatPage } = require("./seat-page.js");

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 31;
let fails = 0, checks = 0, notRun = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (!ok && detail !== undefined ? ": " + JSON.stringify(detail) : ""));
  if (!ok) fails++;
};
const skip = (what) => { notRun++; console.log("  NOT RUN " + what); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argv = process.argv.slice(2);
const at = argv.indexOf("--engine");
const ENGINE = at >= 0 ? path.resolve(argv[at + 1]) : E.ENGINE_PATH;

const WORDS = {
  en: {
    tip: "Share with a teammate…",
    menu: "Share with…",
    heading: "Share this card",
    sub: "Each person chosen gets a copy to keep or decline; this card stays as it is.",
    find: "Find a teammate",
    noteHint: "Add a line for them (optional)",
    cancel: "Cancel",
    send: "Send (2)",
    toast: "Shared with Ewa Nowak and Tom Lis.",
    rowHead: "Shared with you",
    show: "Show",
    arriving: "Ewa Nowak shared a card with you",
    keepLine: "Keep adds it to this desk as a card of its own: a copy that stays as it is, whatever happens to the original.",
    later: "Later",
    decline: "Decline",
    keep: "Keep",
    fromMark: "from Ewa Nowak",
    tooLarge: "This card is too large to share, so nothing was sent.",
    seatLapsed: "This desk has no current seat, so nothing was sent; sharing works again once it has one.",
    sentTo: "Sent to Ewa Nowak",
    notOnTeamTag: "not on the team",
    tooManyTag: "too many waiting",
    done: "Done",
    keptOne: "kept · Tom Lis",
    keptTwo: "kept · 2",
    keptTipLabel: "Kept: ",
  },
  pl: {
    tip: "Udostępnij osobie z zespołu…",
    menu: "Udostępnij…",
    heading: "Udostępnij tę kartę",
    sub: "Każda wybrana osoba dostaje kopię do zachowania albo odrzucenia; ta karta zostaje bez zmian.",
    find: "Znajdź osobę z zespołu",
    noteHint: "Dodaj krótką wiadomość (opcjonalnie)",
    cancel: "Anuluj",
    send: "Wyślij (2)",
    toast: "Udostępniono: Ewa Nowak i Tom Lis.",
    rowHead: "Udostępnione",
    show: "Pokaż",
    arriving: "Ewa Nowak udostępnia kartę",
    keepLine: "Zachowaj dodaje ją do tego stanowiska jako własną kartę: kopię, która zostaje bez zmian, cokolwiek stanie się z oryginałem.",
    later: "Później",
    decline: "Odrzuć",
    keep: "Zachowaj",
    fromMark: "nadawca: Ewa Nowak",
    tooLarge: "Ta karta jest za duża, by ją udostępnić, więc nic nie wysłano.",
    seatLapsed: "To stanowisko nie ma teraz ważnego miejsca w licencji, więc nic nie wysłano; udostępnianie zadziała ponownie, gdy je odzyska.",
    sentTo: "Wysłano: Ewa Nowak",
    notOnTeamTag: "poza zespołem",
    tooManyTag: "za dużo oczekujących",
    done: "Gotowe",
    keptOne: "zachowana · Tom Lis",
    keptTwo: "zachowana · 2",
    keptTipLabel: "Zachowano: ",
  },
};

const SAMPLE = JSON.parse(fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8"));
const CATALOG = JSON.stringify(SAMPLE);
const FIRST_ID = SAMPLE.cards[0].id;
const SECOND_ID = SAMPLE.cards[1].id;
const FIRST_SHELF = SAMPLE.cards[0].shelf;

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-share-"));
const copyFiles = (dir, htmlText) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "etiuda.html"), htmlText);
  fs.writeFileSync(path.join(dir, "etiuda-catalog.js"), "window.E_CATALOG = " + CATALOG + ";\n");
  return "file:///" + path.join(dir, "etiuda.html").replace(/\\/g, "/");
};
const RAW = fs.readFileSync(ENGINE, "utf8");
const url = copyFiles(path.join(lab, "page"), RAW);
let browser = null;

async function boot(pageUrl, { lang = "en", theme = "light", onTeam = true, inbox = [], kept = null } = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.__ctx = ctx;
  p.on("dialog", (d) => { d.dismiss().catch(() => {}); });
  p.on("pageerror", (e) => console.log("       page error: " + String(e && e.message || e).split("\n")[0]));
  await p.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.evaluateOnNewDocument((lang, theme, onTeam, inbox, kept) => {
    try {
      for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"], ["eFirstSigninSeen", "1"],
        ["eTheme", theme], ["eUiLang", lang], ["eStill", "1"], ["eMotionOff", "1"]]) localStorage.setItem(k, v);
    } catch (e) {}
    window.__writes = [];
    window.__calls = [];
    window.__shareMode = "ok";
    window.__keepMode = "ok";
    window.__inbox = JSON.parse(JSON.stringify(inbox));
    window.__joinCb = null;
    const shareState = onTeam ? {
      team: "t-0123456789abcdef",
      teammates: [
        { id: "k-1111111111111111", name: "Ewa Nowak" },
        { id: "k-2222222222222222", name: "Tom Lis" },
        { id: "k-3333333333333333", name: "Zofia Kamińska" },
      ],
    } : null;
    if (shareState && kept) shareState.kept = JSON.parse(JSON.stringify(kept));
    window.__keptCalls = [];
    window.__shareState = shareState;
    window.E_HOST = {
      onPickAsk() {},
      branchIdentity: () => Promise.resolve({ id: "k-9999999999999999", key: "a".repeat(64), box: "b".repeat(64) }),
      writeBranch: (stem, text) => {
        window.__writes.push({ stem: String(stem), text: String(text || ""), doc: text ? JSON.parse(text) : null });
        return Promise.resolve({ ok: true, rev: window.__writes.length });
      },
      branchReach: () => false,
      onTeamJoin: (fn) => { window.__joinCb = fn; },
      teamJoin: (op, a, b, c) => {
        window.__calls.push({ op, a, b, c });
        if (op === "state" || op === "held") return Promise.resolve({ sealed: null, join: null, leads: [], share: window.__shareState });
        if (op === "share-to") {
          if (window.__shareMode === "too-large") return Promise.resolve({ ok: false, reason: "too-large" });
          if (window.__shareMode === "seat-lapsed") return Promise.resolve({ ok: false, reason: "seat-lapsed" });
          if (window.__shareMode === "mixed") {
            if (a === "k-2222222222222222") return Promise.resolve({ ok: false, reason: "not-on-team" });
            if (a === "k-3333333333333333") return Promise.resolve({ ok: false, reason: "recipient-full" });
          }
          return Promise.resolve({ ok: true, id: "b".repeat(32) });
        }
        if (op === "share-inbox") return Promise.resolve({ ok: true, items: window.__inbox.slice() });
        if (op === "share-keep") {
          if (window.__keepMode === "refuse") return Promise.resolve({ ok: false, reason: "card: its shelf is not one this catalog has, so it has nowhere to sit" });
          const parsed = JSON.parse(a);
          const card = JSON.parse(parsed.card);
          const mine = Object.assign({}, card, { id: card.id + "-kept", from: { desk: parsed.from, card: card.id } });
          return Promise.resolve({ ok: true, card: mine });
        }
        if (op === "share-kept") {
          window.__keptCalls.push({ a, b, writes: window.__writes.length, after: window.__calls.map((x) => x.op).slice(0, -1) });
          return Promise.resolve({ ok: true });
        }
        if (op === "share-drop") {
          window.__inbox = window.__inbox.filter((x) => x.id !== a);
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true });
      },
    };
  }, lang, theme, onTeam, inbox, kept);
  await seatPage(p);
  await p.goto(pageUrl, { waitUntil: "load", timeout: 60000 });
  await p.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await p.$("#ecYes")) await p.click("#ecYes");
  await p.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await p.evaluate(() => {
    document.documentElement.classList.add("e-still");
  });
  await sleep(150);
  return p;
}
const closePage = (p) => Promise.race([p.close().then(() => p.__ctx.close()).catch(() => {}), sleep(5000)]);

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });

  /* 1. Off-team: no share button and no Share with… menu row, even on custom card */
  {
    const p = await boot(url, { onTeam: false });
    await p.evaluate((shelf) => {
      pack.custom.push({ id: "u:own-off", c: shelf, t: "Own", en: "Own body." });
      savePack();
      rebuildCards();
    }, FIRST_SHELF);
    const got = await p.evaluate(() => {
      const el = document.querySelector('.card[data-id="u:own-off"] .txt[data-v]');
      el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
      const items = [...document.querySelectorAll('.e-ctx [role="menuitem"]')].map((b) => b.textContent.trim());
      if (typeof closeCtxMenu === "function") closeCtxMenu(false);
      return {
        btns: document.querySelectorAll('.card .cacts button[data-act="share"]').length,
        menuHas: items.some((x) => /Share/i.test(x)),
      };
    });
    check(got.btns === 0 && !got.menuHas, "1013u1 off-team shows no Share button and no Share menu row", got);
    await closePage(p);
  }

  /* 2. On team: Share button & menu row appear ONLY on own or changed (mod) cards, right after Edit */
  for (const [lang, theme] of [["en", "light"], ["pl", "dark"]]) {
    const W = WORDS[lang];
    const p = await boot(url, { lang, theme, onTeam: true });
    await p.evaluate((fid, shelf) => {
      pack.custom.push({ id: "u:own-1", c: shelf, t: "Own reply", en: "Own text.", pl: "Własny tekst." });
      pack.overrides[fid] = { t: "Edited catalog card" };
      savePack();
      rebuildCards();
    }, FIRST_ID, FIRST_SHELF);
    const res = await p.evaluate((fid, sid) => {
      const actsOf = (id) => [...document.querySelectorAll('.card[data-id="' + id + '"] .cacts button')].map((b) => b.getAttribute("data-act"));
      const menuOf = (id) => {
        const el = document.querySelector('.card[data-id="' + id + '"] .txt[data-v]');
        el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
        const out = [...document.querySelectorAll('.e-ctx [role="menuitem"]')].map((b) => (b.querySelector("span") || b).textContent.trim());
        if (typeof closeCtxMenu === "function") closeCtxMenu(false);
        return out;
      };
      const b = document.querySelector('.card[data-id="u:own-1"] .cacts button[data-act="share"]');
      return {
        ownActs: actsOf("u:own-1"),
        ovActs: actsOf(fid),
        baseActs: actsOf(sid),
        ownMenu: menuOf("u:own-1"),
        baseMenu: menuOf(sid),
        tip: b ? b.getAttribute("title") : "",
      };
    }, FIRST_ID, SECOND_ID);
    const afterEdit = (arr) => arr.indexOf("edit") >= 0 && arr.indexOf("share") === arr.indexOf("edit") + 1;
    check(afterEdit(res.ownActs) && afterEdit(res.ovActs) && res.baseActs.indexOf("share") < 0
      && res.ownMenu.indexOf(W.menu) >= 0 && res.baseMenu.indexOf(W.menu) < 0 && res.tip === W.tip,
      "1013u2 (" + lang + "/" + theme + ") Share button after Edit and menu row appear only on own/changed cards", res);

    /* 3. Picker bubble, search filter, whole-send refusals keeping bubble & typed note, 2r per-person refusals, and toast on send */
    await p.hover('.card[data-id="u:own-1"]');
    await p.click('.card[data-id="u:own-1"] .cacts button[data-act="share"]');
    await p.waitForSelector(".e-share-bub", { timeout: 5000 });
    const openInfo = await p.evaluate(() => {
      const b = document.querySelector(".e-share-bub");
      const rows = [...b.querySelectorAll(".e-share-row")].map((r) => r.textContent.trim());
      return {
        w: Math.round(b.getBoundingClientRect().width),
        h: (b.querySelector("h3") || {}).textContent || "",
        sub: (b.querySelector(".e-share-sub") || {}).textContent || "",
        findPh: (b.querySelector(".e-share-find") || {}).placeholder || "",
        notePh: (b.querySelector(".e-share-note") || {}).placeholder || "",
        rows,
      };
    });
    check(openInfo.w === 360 && openInfo.h === W.heading && openInfo.sub === W.sub
      && openInfo.findPh === W.find && openInfo.notePh === W.noteHint
      && openInfo.rows.length === 3 && openInfo.rows.every((r) => !/9999/.test(r)),
      "1013u3 (" + lang + ") Share bubble is 360px with copywriter words and newest roster teammates only", openInfo);

    /* Filter, tick two, type note, trigger too-large then seat-lapsed refusal */
    await p.type(".e-share-note", "Keep this handy");
    await p.click('.e-share-row input[type="checkbox"]');
    const box2 = await p.$$('.e-share-row input[type="checkbox"]');
    await box2[1].click();
    const sendTxt = await p.$eval('.e-share-bub [data-share="send"]', (b) => b.textContent.trim());
    await p.evaluate(() => { window.__shareMode = "too-large"; });
    await p.click('.e-share-bub [data-share="send"]');
    await sleep(60);
    const largeState = await p.evaluate(() => ({
      stillOpen: !!document.querySelector(".e-share-bub"),
      note: (document.querySelector(".e-share-note") || {}).value || "",
      why: (document.querySelector(".e-share-why") || {}).textContent || "",
      checked: [...document.querySelectorAll('.e-share-row input[type="checkbox"]')].filter((x) => x.checked).length,
    }));
    await p.evaluate(() => { window.__shareMode = "seat-lapsed"; });
    await p.click('.e-share-bub [data-share="send"]');
    await sleep(60);
    const seatWhy = await p.$eval(".e-share-why", (e) => e.textContent);
    check(sendTxt === W.send && largeState.stillOpen && largeState.note === "Keep this handy"
      && largeState.checked === 2 && largeState.why === W.tooLarge && seatWhy === W.seatLapsed,
      "1013u4 (" + lang + ") whole-send refusals keep bubble, ticks and note with exact words", { sendTxt, largeState, seatWhy });

    /* Per-person 2r refusal (mixed): Ewa succeeds, Tom not-on-team, Zofia too many waiting */
    await box2[2].click();
    await p.evaluate(() => { window.__shareMode = "mixed"; });
    await p.click('.e-share-bub [data-share="send"]');
    await p.waitForSelector('.e-share-bub [data-share="done"]', { timeout: 5000 });
    const r2 = await p.evaluate(() => ({
      h: (document.querySelector(".e-share-bub h3") || {}).textContent || "",
      txt: document.querySelector(".e-share-bub").textContent,
      done: (document.querySelector('.e-share-bub [data-share="done"]') || {}).textContent || "",
    }));
    check(r2.h === W.sentTo && r2.txt.indexOf(W.notOnTeamTag) >= 0 && r2.txt.indexOf(W.tooManyTag) >= 0 && r2.done === W.done,
      "1013u5 (" + lang + ") per-person refusal shows 2r Sent to + tagged rows + Done", r2);
    await p.click('.e-share-bub [data-share="done"]');
    await sleep(60);

    /* Clean send -> closes bubble + shows toast */
    await p.hover('.card[data-id="u:own-1"]');
    await p.click('.card[data-id="u:own-1"] .cacts button[data-act="share"]');
    await p.waitForSelector(".e-share-bub", { timeout: 5000 });
    await p.evaluate(() => { window.__shareMode = "ok"; });
    const bbs = await p.$$('.e-share-row input[type="checkbox"]');
    await bbs[0].click(); await bbs[1].click();
    await p.click('.e-share-bub [data-share="send"]');
    await sleep(80);
    const sentState = await p.evaluate(() => ({
      closed: !document.querySelector(".e-share-bub"),
      toast: (document.getElementById("toast") || {}).textContent || "",
    }));
    check(sentState.closed && sentState.toast === W.toast, "1013u6 (" + lang + ") clean send closes bubble and shows toast", sentState);
    await closePage(p);
  }

  /* 4. Recipient (never-edited desk!): arriving row + bubble, Later/Show, Keep verdict-first + refusal writes nothing, Keep adds with from + survives later page edit, Decline removes */
  for (const lang of ["en", "pl"]) {
    const W = WORDS[lang];
    const inbox = [
      {
        id: "a".repeat(32),
        from: "k-1111111111111111",
        fromName: "Ewa Nowak",
        team: "t-0123456789abcdef",
        note: "This calmed two customers today.",
        card: { id: "u:shared-ewa", shelf: FIRST_SHELF, bodyShape: "plain", title: { en: "Shared title", pl: "Wspólny tytuł" }, body: { en: "Shared body.", pl: "Wspólna treść." } },
      },
      {
        id: "c".repeat(32),
        from: "k-2222222222222222",
        fromName: "Tom Lis",
        team: "t-0123456789abcdef",
        note: "",
        card: { id: "u:shared-tom", shelf: FIRST_SHELF, bodyShape: "plain", title: { en: "Second shared", pl: "Druga karta" }, body: { en: "Second body.", pl: "Druga treść." } },
      },
    ];
    const p = await boot(url, { lang, onTeam: true, inbox });
    await p.waitForSelector("#eShareRow", { timeout: 5000 });
    await p.waitForSelector(".e-share-in-bub", { timeout: 5000 });
    const arrState = await p.evaluate(() => {
      const row = document.getElementById("eShareRow");
      const firstChild = document.getElementById("list").firstElementChild;
      const bub = document.querySelector(".e-share-in-bub");
      return {
        atTop: row === firstChild,
        rowTxt: row ? row.textContent.trim() : "",
        h: (bub.querySelector("h3") || {}).textContent || "",
        txt: bub.textContent,
        later: (bub.querySelector('[data-share-in="later"]') || {}).textContent || "",
        decline: (bub.querySelector('[data-share-in="decline"]') || {}).textContent || "",
        keep: (bub.querySelector('[data-share-in="keep"]') || {}).textContent || "",
      };
    });
    check(arrState.atTop && arrState.rowTxt.indexOf(W.rowHead) >= 0
      && arrState.h === W.arriving && arrState.txt.indexOf(W.keepLine) >= 0
      && arrState.later === W.later && arrState.decline === W.decline && arrState.keep === W.keep,
      "1013u7 (" + lang + ") arriving share puts row at top of list and opens blue bubble with copywriter words", arrState);

    /* Later closes bubble, keeps row with Show; Show reopens it */
    await p.click('.e-share-in-bub [data-share-in="later"]');
    await sleep(60);
    const laterState = await p.evaluate(() => ({
      bubClosed: !document.querySelector(".e-share-in-bub"),
      showBtn: (document.querySelector("#eShareShow") || {}).textContent || "",
    }));
    await p.click("#eShareShow");
    await p.waitForSelector(".e-share-in-bub", { timeout: 5000 });

    /* Keep verdict refusal writes nothing */
    await p.evaluate(() => { window.__keepMode = "refuse"; window.__writes.length = 0; });
    await p.click('.e-share-in-bub [data-share-in="keep"]');
    await sleep(80);
    const refuseState = await p.evaluate(() => ({
      customLen: (pack.custom || []).length,
      writes: window.__writes.length,
      why: (document.querySelector(".e-share-in-why") || {}).textContent || "",
      stillInbox: window.__inbox.length,
    }));
    check(laterState.bubClosed && laterState.showBtn === W.show
      && refuseState.customLen === 0 && refuseState.writes === 0 && !!refuseState.why && refuseState.stillInbox === 2,
      "1013u8 (" + lang + ") Later/Show works and Keep refusal writes nothing", { laterState, refuseState });

    /* Keep yes on never-edited desk -> adds custom card with from mark, writes desk branch carrying from, drops from relay, advances to second share */
    await p.evaluate(() => { window.__keepMode = "ok"; });
    await p.click('.e-share-in-bub [data-share-in="keep"]');
    await sleep(120);
    const keptState = await p.evaluate(() => {
      const keptCard = (pack.custom || []).find((c) => c && c.id === "u:shared-ewa-kept");
      const badge = document.querySelector('.card[data-id="u:shared-ewa-kept"] .cbadge.from');
      const lastWrite = window.__writes[window.__writes.length - 1];
      const writtenCard = lastWrite && lastWrite.doc && lastWrite.doc.cards && lastWrite.doc.cards.find((c) => c.id === "u:shared-ewa-kept");
      const calls = window.__calls.map((c) => c.op);
      return {
        keptFrom: keptCard && keptCard.from,
        badgeTxt: badge ? badge.textContent.trim() : "",
        badgeTip: badge ? badge.getAttribute("title") || "" : "",
        writtenFrom: writtenCard && writtenCard.from,
        nextHead: (document.querySelector(".e-share-in-bub h3") || {}).textContent || "",
        keepBeforeDrop: calls.indexOf("share-keep") >= 0 && calls.indexOf("share-drop") > calls.indexOf("share-keep"),
      };
    });
    check(!!keptState.keptFrom && keptState.keptFrom.desk === "k-1111111111111111" && keptState.keptFrom.card === "u:shared-ewa"
      && keptState.badgeTxt === W.fromMark && keptState.badgeTip.indexOf("Ewa Nowak") >= 0
      && !!keptState.writtenFrom && keptState.writtenFrom.desk === "k-1111111111111111"
      && keptState.keepBeforeDrop && keptState.nextHead.indexOf("Tom Lis") >= 0,
      "1013u9 (" + lang + ") Keep asks verdict first, adds custom card with from mark, writes branch on never-edited desk and advances to next", keptState);

    /* Decline second share -> removes item and removes row when nothing waits */
    await p.click('.e-share-in-bub [data-share-in="decline"]');
    await sleep(80);
    const decState = await p.evaluate(() => ({
      rowGone: !document.getElementById("eShareRow"),
      bubGone: !document.querySelector(".e-share-in-bub"),
      inboxLen: window.__inbox.length,
    }));

    /* Later page edit on another card -> kept card survives in pack.custom AND branch write with from! */
    await p.evaluate((sid) => {
      window.__writes.length = 0;
      pack.overrides[sid] = { t: "Edited another card" };
      savePack([sid]);
      rebuildCards();
      return writeDeskBranch();
    }, SECOND_ID);
    await sleep(60);
    const afterEdit = await p.evaluate(() => {
      const keptCard = (pack.custom || []).find((c) => c && c.id === "u:shared-ewa-kept");
      const lastWrite = window.__writes[window.__writes.length - 1];
      const writtenCard = lastWrite && lastWrite.doc && lastWrite.doc.cards && lastWrite.doc.cards.find((c) => c.id === "u:shared-ewa-kept");
      return { customFrom: keptCard && keptCard.from, writtenFrom: writtenCard && writtenCard.from };
    });
    check(decState.rowGone && decState.bubGone && decState.inboxLen === 0
      && !!afterEdit.customFrom && afterEdit.customFrom.desk === "k-1111111111111111"
      && !!afterEdit.writtenFrom && afterEdit.writtenFrom.desk === "k-1111111111111111",
      "1013u10 (" + lang + ") Decline clears row and kept card survives later page edit with from", { decState, afterEdit });
    await closePage(p);
  }

  /* 4b. The sender's "kept" mark (board 1013, piece 5), and the receipt a Keep sends */
  for (const lang of ["en", "pl"]) {
    const W = WORDS[lang];
    const T1 = "2026-11-18T10:00:00.000Z", T2 = "2026-11-19T09:30:00.000Z";
    const oneKept = { "u:own-k": [{ id: "k-2222222222222222", name: "Tom Lis", at: T1 }] };
    const twoKept = { "u:own-k": [{ id: "k-2222222222222222", name: "Tom Lis", at: T1 }, { id: "k-1111111111111111", name: "Ewa Nowak", at: T2 }] };
    const markOf = (p) => p.evaluate(() => {
      const b = document.querySelector('.card[data-id="u:own-k"] .cbadge.kept');
      return { txt: b ? b.textContent.trim() : "", tip: b ? b.getAttribute("title") || "" : "", n: document.querySelectorAll('.card[data-id="u:own-k"] .cbadge.kept').length };
    });
    const addOwn = (p) => p.evaluate((shelf) => {
      pack.custom.push({ id: "u:own-k", c: shelf, t: "Own kept", en: "Own body." });
      savePack();
      rebuildCards();
    }, FIRST_SHELF);
    const dateOf = (p, iso) => p.evaluate((i) => new Date(i).toLocaleDateString(), iso);
    {
      const p = await boot(url, { lang, onTeam: true, kept: oneKept });
      await addOwn(p);
      await sleep(80);
      const m1 = await markOf(p);
      const d1 = await dateOf(p, T1);
      check(m1.n === 1 && m1.txt === W.keptOne && m1.tip === W.keptTipLabel + "Tom Lis, " + d1,
        "1013k1 (" + lang + ") one keeper: the card wears the sheet's mark with that person's name and a tooltip of one line", { m1, d1 });
      await p.reload({ waitUntil: "load" });
      await p.waitForFunction(() => document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
      await addOwn(p);
      await sleep(150);
      const m3 = await markOf(p);
      check(m3.n === 1 && m3.txt === W.keptOne,
        "1013k3 (" + lang + ") after a restart the page asks the shell again and the mark is back, from the desk's record and not the page's", { m3 });
      await closePage(p);
    }
    {
      const p = await boot(url, { lang, onTeam: true, kept: twoKept });
      await addOwn(p);
      await sleep(80);
      const m2 = await markOf(p);
      const d1 = await dateOf(p, T1), d2 = await dateOf(p, T2);
      check(m2.n === 1 && m2.txt === W.keptTwo && m2.tip === W.keptTipLabel + "Tom Lis, " + d1 + "\n" + W.keptTipLabel + "Ewa Nowak, " + d2,
        "1013k2 (" + lang + ") several keepers: the mark counts them and the tooltip has one line per person", { m2, d1, d2 });
      await closePage(p);
    }
    {
      const mk = (id, from, name) => ({ id, from, fromName: name, team: "t-0123456789abcdef", note: "",
        card: { id: "u:shared-r", shelf: FIRST_SHELF, bodyShape: "plain", title: { en: "R" }, body: { en: "Body." } } });
      const p = await boot(url, { lang, onTeam: true, inbox: [mk("a".repeat(32), "k-1111111111111111", "Ewa Nowak")] });
      await p.waitForSelector(".e-share-in-bub", { timeout: 5000 });
      await p.click('.e-share-in-bub [data-share-in="keep"]');
      await sleep(150);
      const kept = await p.evaluate(() => window.__keptCalls.slice());
      const p2 = await boot(url, { lang, onTeam: true, inbox: [mk("c".repeat(32), "k-2222222222222222", "Tom Lis")] });
      await p2.waitForSelector(".e-share-in-bub", { timeout: 5000 });
      await p2.click('.e-share-in-bub [data-share-in="decline"]');
      await sleep(120);
      const declined = await p2.evaluate(() => ({ kept: window.__keptCalls.length, ops: window.__calls.map((c) => c.op) }));
      check(kept.length === 1 && kept[0].a === "k-1111111111111111" && kept[0].b === "u:shared-r" && kept[0].writes >= 1
        && kept[0].after.indexOf("share-keep") >= 0 && kept[0].after.indexOf("share-drop") < 0
        && declined.kept === 0 && declined.ops.indexOf("share-drop") >= 0,
        "1013k4 (" + lang + ") Keep sends one receipt naming the sender and the card after the page's own write, and a decline sends none", { kept, declined });
      await closePage(p);
      await closePage(p2);
    }
  }

  /* 5. Plants on the page's deciding lines (inline on scratch copy of built page, never touching src/) */
  if (PLANTS_OFF) {
    skip("1013up1 lifting plant:share-verdict-first adds card when verdict refuses");
    skip("1013up2 lifting plant:share-own-only draws share button on catalog cards");
    skip("1013kp1 lifting the several-keepers count shows one name");
    skip("1013kp2 moving the receipt before the write sends it with nothing written");
  } else {
    const plant = (tag, re, rep) => {
      const m = RAW.match(re);
      if (!m) return null;
      return copyFiles(path.join(lab, "plant-" + tag), RAW.replace(re, rep));
    };
    const u1 = plant("verdict-first", /const res = await shareKeepCard\(opened, catalogId\);/, "const res = { ok: true, card: Object.assign({}, cur.card, { from: { desk: cur.from, card: cur.card.id } }) };");
    let red1 = null;
    if (u1) {
      const inbox = [{
        id: "a".repeat(32), from: "k-1111111111111111", fromName: "Ewa Nowak", team: "t-0123456789abcdef",
        note: "", card: { id: "u:shared-p1", shelf: FIRST_SHELF, bodyShape: "plain", title: { en: "P1" }, body: { en: "Body." } },
      }];
      const p = await boot(u1, { onTeam: true, inbox });
      try {
        await p.waitForSelector(".e-share-in-bub", { timeout: 5000 });
        await p.evaluate(() => { window.__keepMode = "refuse"; });
        await p.click('.e-share-in-bub [data-share-in="keep"]');
        await sleep(80);
        red1 = await p.evaluate(() => (pack.custom || []).length);
      } finally { await closePage(p); }
    }
    check(!!u1 && red1 > 0, "1013up1 lifting verdict-first guard adds custom card even when verdict refuses", { located: !!u1, red1 });

    const u2 = plant("own-only", /function cardIsShareable\(m\) \{[^}]+\}/, "function cardIsShareable(m) { return !!m; }");
    let red2 = null;
    if (u2) {
      const p = await boot(u2, { onTeam: true });
      try {
        red2 = await p.evaluate((sid) => !!document.querySelector('.card[data-id="' + sid + '"] .cacts button[data-act="share"]'), SECOND_ID);
      } finally { await closePage(p); }
    }
    check(!!u2 && red2 === true, "1013up2 lifting own-only guard draws share button on unmodified catalog cards", { located: !!u2, red2 });

    const k1 = plant("kept-count", /const one = list\d*\.length === 1;/, "const one = true;");
    let redK1 = null;
    if (k1) {
      const p = await boot(k1, { onTeam: true, kept: { "u:own-k": [{ id: "k-2222222222222222", name: "Tom Lis", at: "2026-11-18T10:00:00.000Z" }, { id: "k-1111111111111111", name: "Ewa Nowak", at: "2026-11-19T09:30:00.000Z" }] } });
      try {
        await p.evaluate((shelf) => { pack.custom.push({ id: "u:own-k", c: shelf, t: "Own kept", en: "Own body." }); savePack(); rebuildCards(); }, FIRST_SHELF);
        await sleep(80);
        redK1 = await p.evaluate(() => { const b = document.querySelector('.card[data-id="u:own-k"] .cbadge.kept'); return b ? b.textContent.trim() : ""; });
      } finally { await closePage(p); }
    }
    check(!!k1 && redK1 !== "kept · 2", "1013kp1 lifting the several-keepers count shows one name where two kept", { located: !!k1, redK1 });

    const k2 = plant("kept-order", /const res = await shareKeepCard\(opened, catalogId\);/, "shareKeptNote(cur.from, cur.card.id); const res = await shareKeepCard(opened, catalogId);");
    let redK2 = null;
    if (k2) {
      const inbox = [{ id: "a".repeat(32), from: "k-1111111111111111", fromName: "Ewa Nowak", team: "t-0123456789abcdef", note: "",
        card: { id: "u:shared-k2", shelf: FIRST_SHELF, bodyShape: "plain", title: { en: "K2" }, body: { en: "Body." } } }];
      const p = await boot(k2, { onTeam: true, inbox });
      try {
        await p.waitForSelector(".e-share-in-bub", { timeout: 5000 });
        await p.click('.e-share-in-bub [data-share-in="keep"]');
        await sleep(150);
        redK2 = await p.evaluate(() => window.__keptCalls.map((c) => c.writes));
      } finally { await closePage(p); }
    }
    check(!!k2 && Array.isArray(redK2) && redK2.length > 0 && redK2[0] === 0, "1013kp2 moving the receipt before the write sends it with nothing written", { located: !!k2, redK2 });
  }
} finally {
  if (browser) await Promise.race([browser.close().catch(() => {}), sleep(5000)]);
  fs.rmSync(lab, { recursive: true, force: true });
}

console.log("#counts checks=" + checks + " skipped=" + notRun + " failed=" + fails + " expected=" + EXPECTED);
if (checks + notRun < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (checks + notRun) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(fails ? "  RESULT: FAIL " + fails + " of " + checks : "  RESULT: ok " + checks + " check(s)");
process.exit(Math.min(fails, 63));
