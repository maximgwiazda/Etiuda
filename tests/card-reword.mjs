/* Reword on a card: the button, the menu, the reworded card, Approve and Revert, on the desk's own page.
 *
 *   node tests/card-reword.mjs          CARD_SHOTS=<folder> also writes a still of each state, light and dark
 *
 * Headless Chrome on the built engine page and the shipped sample catalog, its host stood in for: aiState names the service
 * (or none) and reword records every request and answers as a test says. No leg starts the desk app or reaches a network.
 *   cr1 without the service named no card has the button; with it, the button is the first of every card's own
 *   cr2 the menu is the family's blue bubble from that button, above it, its pointer on the button, saying where the card's
 *       words go before anything is sent; nothing is sent by opening it
 *   cr3 a press sends one request: the act and the card's own text in the language shown, its names as the catalog writes
 *       them ({PAX}) and never the customer's name the card shows filled in
 *   cr4 the reworded card: the chip with the act and "Not saved.", its slabs' line dashed, the words shown filled, Approve and
 *       Revert at its lower right; a click on it copies what is on screen
 *   cr5 before Approve the reworded words are in no store the page writes (local and session storage, every host call but
 *       the clipboard's own-text note, the console); after it they are the person's edit, the "mod" mark on, stored with the
 *       same fields the card's editor stores for an edit of the same field
 *   cr6 Revert shows the card as it was, and nothing is stored
 *   cr7 the shapes: a card of steps keeps its steps or is refused and said; a result that lost a name filled in is refused
 *   cr8 a failure says which in the menu, and the card stays as it was
 *   cr9 Approve and Revert are interface (not selectable); the menu's acts and field take the keyboard
 *   cr11 in the dark theme the reworded slab wears one line (and cr4b: a render that patches the card keeps the rewording)
 *   cr10 the plants, each on a copy of the built page: the names check lifted, the parts check lifted, the filled text sent,
 *       the patched class without the rewording, the dark rule set aside, a placeholder put back,
 *       and the rewording written to storage at once, each turning its leg red
 * ETIUDA_PLANTS=off skips cr10 with NOT RUN lines.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const SHOTS = process.env.CARD_SHOTS || "";
const EXPECTED = 21;
let fails = 0, checks = 0, notRun = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
};
const skip = what => { notRun++; console.log("  NOT RUN " + what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-card-reword-"));
const ENGINE = fs.readFileSync(E.ENGINE_PATH, "utf8");
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
function pageFile(text, name) {
  const at = path.join(lab, name);
  fs.writeFileSync(at, text);
  return "file:///" + at.replace(/\\/g, "/");
}
const URL0 = pageFile(ENGINE, "etiuda.html");
const HOST = "ai.mirabelka.example";
/* The copywriter's lines, section 3 of her file, character for character, {ADDRESS} filled with HOST. */
const TAIL = { en: "The card is as it was.", pl: "Karta pozostała bez zmian." };
const WORDS = {
  en: { wait: "Waiting for the service at " + HOST + "…", late: "The service at " + HOST + " did not answer in time. " + TAIL.en,
    busy: "The service at " + HOST + " is busy; a later try may go through. " + TAIL.en, none: "No result came back from " + HOST + ". " + TAIL.en,
    refused: "The result lost a name this card fills in, or one of its steps, so it is not shown. The card is as it was; another try may keep them." },
  pl: { wait: "Oczekiwanie na usługę pod adresem " + HOST + "…", late: "Usługa pod adresem " + HOST + " nie odpowiedziała na czas. " + TAIL.pl,
    busy: "Usługa pod adresem " + HOST + " jest zajęta; późniejsza próba może się udać. " + TAIL.pl,
    none: "Z adresu " + HOST + " nie nadszedł wynik. " + TAIL.pl,
    refused: "W wyniku zabrakło nazwy, którą karta wypełnia, albo jednego z jej kroków, więc nie został pokazany. Karta pozostała bez zmian; kolejna próba może je zachować." } };
const NAME = "Wiktoria Planted";
const MARK = "Zephyrquill";
const PLAIN = "c-orders-thank-you-for-a-first-order", PLAIN2 = "c-damaged-a-new-one-on-its-way", STEPS = "c-returns-packing-the-piece";

let browser = null;
/* The desk under a stand-in host. `host` is the service aiState names, "" for none. */
async function desk(o) {
  const opts = Object.assign({ host: HOST, theme: "light", lang: "en", url: URL0 }, o || {});
  /* A plain boot first leaves the sample catalog in this browser's storage, which the desk under a host then reads. */
  /* Each desk in a context of its own, so no storage carries over from another leg. */
  const ctx = await browser.createBrowserContext();
  const seed = await ctx.newPage();
  await seed.evaluateOnNewDocument(() => {
    try { for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"], ["eFirstSigninSeen", "1"]]) localStorage.setItem(k, v); } catch (e) {}
  });
  await seed.goto(opts.url, { waitUntil: "load", timeout: 60000 });
  await seed.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await seed.$("#ecYes")) await seed.click("#ecYes");
  await seed.waitForFunction(() => document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  await seed.close();
  const page = await ctx.newPage();
  const shut = page.close.bind(page);
  page.close = async () => { await shut(); await ctx.close(); };
  page.__console = [];
  page.on("console", m => page.__console.push(m.text()));
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((opts) => {
    try {
      for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"],
        ["eTheme", opts.theme], ["eUiLang", opts.lang], ["eStill", "1"], ["eRail", "1"], ["eFirstSigninSeen", "1"]]) localStorage.setItem(k, v);
    } catch (e) {}
    window.__calls = []; window.__clip = []; window.__answer = null; window.__host = opts.host;
    const rec = (k, a) => window.__calls.push(k + " " + JSON.stringify(a === undefined ? null : a));
    const st = { offered: [], signedIn: "", seat: "none", reached: true };
    const base = { hotkeyState: () => ({ accel: "Control+Shift+Space", held: true, taken: false }), onPickAsk: fn => { window.__pick = fn; },
      openPicker() {}, signinState: () => st, signIn: async () => st, signinCheck: async () => st,
      aiState: () => ({ model: false, org: !!window.__host, reword: window.__host }),
      reword: o => { rec("reword", o); const a = typeof window.__answer === "function" ? window.__answer(o) : window.__answer;
        return Promise.resolve(a || { ok: false, why: "answer" }); },
      noteOwnText: t => rec("noteOwnText", t) };
    /* Every other call the page makes of its host is recorded too, as a store it could write. */
    window.E_HOST = new Proxy(base, { get: (t, k) => k in t ? t[k] : undefined });
    try { Object.defineProperty(navigator, "clipboard", { value: { writeText: async s => { window.__clip.push(s); } }, configurable: true }); } catch (e) {}
  }, opts);
  await page.goto(opts.url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await page.evaluate(() => { document.documentElement.classList.add("e-still"); });
  await page.evaluate(name => { const p = document.getElementById("pax"); if (p) { p.value = name; p.dispatchEvent(new Event("input", { bubbles: true })); if (typeof p.oninput === "function") p.oninput(); } }, NAME);
  await sleep(150);
  return page;
}
const cardSel = id => '#list .card[data-id="' + id + '"]';
async function openMenu(p, id) {
  await p.evaluate(sel => { const c = document.querySelector(sel); c.scrollIntoView({ block: "center", behavior: "instant" }); }, cardSel(id));
  await sleep(80);
  await p.hover(cardSel(id) + " .chead");
  /* The caption's controls wait for the pointer or the keyboard (template.html); a focus inside the card brings them, as Tab does. */
  const at = await p.$eval(cardSel(id) + ' .cacts [data-act="reword"]', b => { b.focus(); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(at.x, at.y);
  await p.waitForSelector("#eReword", { timeout: 3000 });
  await sleep(80);
}
async function press(p, act, answer) {
  await p.evaluate(a => { window.__answer = a; }, answer);
  await p.click('#eReword button[data-rw-act="' + act + '"]');
  await sleep(120);
}
const raw = (p, id, L) => p.evaluate((id, L) => window.cardText(window.findCard(id), "body", L || "en"), id, L);
const sent = p => p.evaluate(() => window.__calls.filter(c => c.indexOf("reword ") === 0).map(c => JSON.parse(c.slice(7))));
const cardFace = (p, id) => p.evaluate(sel => {
  const c = document.querySelector(sel);
  if (!c) return null;
  const txt = [...c.querySelectorAll(":scope > .txt")], ans = c.querySelector(".rw-ans"), b = [...c.querySelectorAll(".rw-ans button")];
  const cr = c.getBoundingClientRect(), last = txt[txt.length - 1];
  return { on: c.classList.contains("rw-on"), chip: (c.querySelector(".rw-badge") || {}).textContent || "", unsaved: (c.querySelector(".rw-unsaved") || {}).textContent || "",
    tip: (c.querySelector(".rw-unsaved") || { title: "" }).title, dashed: txt.length > 0 && txt.every(x => getComputedStyle(x).borderTopStyle === "dashed"),
    text: txt.map(x => x.textContent).join("\n"), blocks: txt.length, mod: !!c.querySelector(".cbadge.ed"),
    buttons: b.map(x => x.textContent), right: b.length ? Math.round(cr.right - b[b.length - 1].getBoundingClientRect().right) : null,
    below: b.length && last ? b[0].getBoundingClientRect().top >= last.getBoundingClientRect().bottom - 1 : false,
    leftHalf: b.length ? b[0].getBoundingClientRect().left > cr.left + cr.width / 2 : false,
    us: b.length ? getComputedStyle(b[0]).userSelect : "", first: (c.querySelector(".cacts button") || { dataset: {} }).dataset.act || "" };
}, cardSel(id));
/* Every store the page writes, as one text. */
const stores = (p, but) => p.evaluate(but => {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out.push(k + "=" + localStorage.getItem(k)); }
  for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); out.push(k + "=" + sessionStorage.getItem(k)); }
  out.push(...window.__calls.filter(c => c.indexOf("reword ") !== 0 && (but || []).every(b => c.indexOf(b + " ") !== 0)));
  out.push(document.cookie);
  return out.join("\n");
}, but || []).then(t => t + "\n" + p.__console.join("\n"));
const overrideOf = (p, id) => p.evaluate(id => {
  for (let i = 0; i < localStorage.length; i++) {
    let v = null;
    try { v = JSON.parse(localStorage.getItem(localStorage.key(i))); } catch (e) { continue; }
    if (v && v.overrides && v.overrides[id]) return v.overrides[id];
  }
  return null;
}, id);
/* The reworded words: the card's own, a word changed, every name kept. */
const rewordOf = (text, word) => String(text).replace(/\b(Thank|I'll|Wrap|Fill|Stick|Pour|Empty|Send)\b/, word || MARK);
async function shot(p, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await p.screenshot({ path: path.join(SHOTS, name + ".png") });
}
async function shotCard(p, id, name, withMenu) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  /* A card below the fold is clipped outside the viewport and shoots blank (c0 did), so it is brought into view first. */
  /* Twice: the cards above are drawn as they come into reach and move the one wanted, so the first scroll lands short. */
  for (let i = 0; i < 3; i++) {
    await p.evaluate(sel => { document.querySelector(sel).scrollIntoView({ block: "center", behavior: "instant" }); }, cardSel(id));
    await sleep(200);
  }
  const box = await p.evaluate((sel, m) => { const r = document.querySelector(sel).getBoundingClientRect(), b = m && document.getElementById("eReword");
    const top = Math.min(r.top, b ? b.getBoundingClientRect().top : r.top) - 16, bottom = Math.max(r.bottom, b ? b.getBoundingClientRect().bottom : r.bottom) + 16;
    return { x: Math.max(0, r.left - 24), y: Math.max(0, top), width: Math.min(innerWidth, r.width + 48), height: bottom - Math.max(0, top) }; }, cardSel(id), !!withMenu);
  await p.screenshot({ path: path.join(SHOTS, name + ".png"), clip: box });
}

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });

  /* cr1 */
  {
    const none = await desk({ host: "" });
    const n0 = await none.evaluate(() => ({ cards: document.querySelectorAll("#list .card[data-id]").length, buttons: document.querySelectorAll('[data-act="reword"]').length }));
    await shotCard(none, PLAIN, "c0-card-without-the-model-light");
    await none.close();
    const p = await desk({});
    const n1 = await p.evaluate(() => { const cs = [...document.querySelectorAll("#list .card[data-id]")];
      return { cards: cs.length, first: cs.filter(c => (c.querySelector(".cacts button") || { dataset: {} }).dataset.act === "reword").length }; });
    check(n0.cards > 10 && n0.buttons === 0 && n1.cards > 10 && n1.first === n1.cards,
      "cr1 without the service named no card has the Reword button, absent and not greyed; with it the button is the first of every card's own", { n0, n1 });

    /* cr2 */
    await openMenu(p, PLAIN);
    const menu = await p.evaluate(sel => {
      const el = document.getElementById("eReword"), b = document.querySelector(sel + ' .cacts [data-act="reword"]');
      const r = el.getBoundingClientRect(), br = b.getBoundingClientRect(), tip = el.querySelector(".bub-tip").getBoundingClientRect();
      const cx = tip.left + tip.width / 2;
      return { side: el.getAttribute("data-side"), above: r.bottom <= br.top, pointed: cx >= br.left - 1 && cx <= br.right + 1, blue: el.classList.contains("bub"),
        title: el.querySelector("h3").textContent, acts: [...el.querySelectorAll("button[data-rw-act]")].map(x => x.textContent),
        field: el.querySelector("#eRewordHow").placeholder, line: el.querySelector(".rw-bline").textContent,
        cancel: [...el.querySelectorAll(".tour-actions button.primary")].map(x => x.textContent), expanded: b.getAttribute("aria-expanded") };
    }, cardSel(PLAIN));
    await shotCard(p, PLAIN, "c1-menu-light", true);
    const before = await sent(p);
    check(menu.side === "above" && menu.above && menu.pointed && menu.blue && menu.title === "Reword this card" && menu.acts.join() === "Shorter,Friendlier,More formal"
      && menu.field === "Or say how, then press Enter" && menu.line === "Sends this card's words to " + HOST + ". The card itself changes only if you approve the result."
      && menu.cancel.join() === "Cancel" && menu.expanded === "true" && before.length === 0,
      "cr2 the menu is the blue bubble above the button, its pointer on it, in the copywriter's words, saying where the words go; opening it sends nothing", { menu, before });

    /* cr2b the designer's icon, drawn as the card's other button icons are */
    const ICON = '<path d="M3.5 8h7"></path><path d="M3.5 12h13"></path><path d="M3.5 16h9"></path><path d="M15 2.6c.3 1.9 1 2.6 2.9 2.9-1.9.3-2.6 1-2.9 2.9-.3-1.9-1-2.6-2.9-2.9 1.9-.3 2.6-1 2.9-2.9z"></path>';
    const ic = await p.evaluate(sel => {
      const one = b => { const s = b.querySelector("svg"), c = getComputedStyle(s), pc = getComputedStyle(s.querySelector("path"));
        return { inner: s.innerHTML, box: s.getAttribute("viewBox"), cls: s.getAttribute("class"), w: c.width, h: c.height, sw: pc.strokeWidth, stroke: pc.stroke, fill: pc.fill, cap: pc.strokeLinecap }; };
      return { rw: one(document.querySelector(sel + ' .cacts [data-act="reword"]')), edit: one(document.querySelector(sel + ' .cacts [data-act="edit"]')) };
    }, cardSel(PLAIN2));
    check(ic.rw.inner === ICON && ic.rw.box === "0 0 20 20" && ic.rw.cls === ic.edit.cls && ic.rw.w === ic.edit.w && ic.rw.h === ic.edit.h
      && ic.rw.sw === ic.edit.sw && ic.rw.stroke === ic.edit.stroke && ic.rw.fill === "none" && ic.rw.cap === ic.edit.cap,
      "cr2b the Reword icon is the designer's four paths in a 20 by 20 box, with the same class, size, stroke width, colour and caps as the Edit button's, no fill", ic);

    /* cr3 */
    const body = await raw(p, PLAIN);
    await press(p, "shorter", { ok: true, text: rewordOf(body) });
    const req = await sent(p);
    check(req.length === 1 && JSON.stringify(req[0]) === JSON.stringify({ act: "shorter", words: body, how: "", to: "" }) && /\{PAX\}/.test(body)
      && req[0].words.indexOf(NAME.split(" ")[0]) < 0,
      "cr3 one press sends one request: the act and the card's own text in the language shown, {PAX} as the catalog writes it, never the name shown filled in", { req, body });

    /* cr4 */
    const f = await cardFace(p, PLAIN);
    await shotCard(p, PLAIN, "c2-reworded-light");
    const menuGone = await p.evaluate(() => !document.getElementById("eReword") || document.getElementById("eReword").classList.contains("e-gone"));
    await p.click(cardSel(PLAIN) + " > .txt");
    await sleep(80);
    const clip = await p.evaluate(() => window.__clip.slice());
    /* A click on a block washes it green for a moment (pops.js), a fixed overlay left where the block was; the stand-in waits it out,
       so the Approve below is not shot with that wash still fading over the card's old place. */
    const washLeft = await p.evaluate(async () => { const t0 = performance.now(); while (document.querySelector(".e-copy-wash") && performance.now() - t0 < 3000) await new Promise(r => setTimeout(r, 20)); return Math.round(performance.now() - t0); });
    check(f.on && f.chip === "Reworded: Shorter" && f.unsaved === "Not saved." && f.tip === "Shown until Etiuda is next opened, unless you approve it." && f.dashed
      && f.text.indexOf(MARK) > -1 && f.text.indexOf(NAME.split(" ")[0]) > -1 && f.text.indexOf("{PAX}") < 0 && f.buttons.join() === "Approve,Revert"
      && f.right !== null && f.right <= 4 && f.below && f.leftHalf && menuGone && clip.length === 1 && clip[0].indexOf(MARK) > -1 && clip[0].indexOf(NAME.split(" ")[0]) > -1,
      "cr4 the reworded card: the chip and \"Not saved.\", its slabs dashed, the words filled, Approve and Revert at its lower right; a click copies what is on screen", { f, clip, menuGone });

    /* cr4b: a render that keeps the card's node (an intent picked, a search typed) patches its class whole; the rewording stays. */
    await p.evaluate(() => window.render());
    await sleep(120);
    const kept4 = await cardFace(p, PLAIN);
    check(kept4.on && kept4.dashed && kept4.chip === "Reworded: Shorter" && kept4.buttons.join() === "Approve,Revert",
      "cr4b a render that keeps the card's node and patches its class leaves the rewording standing, dashed, with its chip and answers", kept4);

    /* cr5 */
    const held = await stores(p, ["noteOwnText"]);
    const otherCalls = await p.evaluate(MARK => window.__calls.filter(c => c.indexOf(MARK) > -1 && c.indexOf("noteOwnText ") !== 0), MARK);
    await p.click(cardSel(PLAIN) + ' .rw-ans button[data-rw="approve"]');
    await sleep(200);
    const washAfterApprove = await p.evaluate(() => document.querySelectorAll(".e-copy-wash").length), clipAfterApprove = await p.evaluate(() => window.__clip.length);
    const after = await cardFace(p, PLAIN), kept = await stores(p, ["noteOwnText"]), ov = await overrideOf(p, PLAIN);
    await shotCard(p, PLAIN, "c3-approved-light");
    /* The editor's own save of the same field on another card, for the shape of what it stores. */
    await p.evaluate(id => window.openCardEditor(id), PLAIN2);
    await p.waitForSelector("#me_body_en", { timeout: 5000 });
    const edited = (await raw(p, PLAIN2)) + " Quillzephyr";
    await p.evaluate(text => { const f = document.getElementById("me_body_en"); f.value = text; f.dispatchEvent(new Event("input", { bubbles: true })); }, edited);
    await p.click("#meSave");
    await sleep(300);
    const ov2 = await overrideOf(p, PLAIN2);
    const washAfterEditor = await p.evaluate(() => document.querySelectorAll(".e-copy-wash").length);
    const keys = o => Object.keys(o || {}).sort().join(",");
    check(held.indexOf(MARK) < 0 && otherCalls.length === 0 && !after.on && after.mod && after.text.indexOf(MARK) > -1 && kept.indexOf(MARK) > -1
      && ov && ov.en === rewordOf(body) && ov2 && keys(ov).split(",").every(k => ("," + keys(ov2) + ",").indexOf("," + k + ",") > -1) && ov2.en === edited,
      "cr5 before Approve the words are in no store the page writes; after it they are the person's edit with the \"mod\" mark, stored as the editor stores an edit of that field (an override against the catalog, dated), no field the editor would not: "
      + keys(ov) + " beside the editor's " + keys(ov2), { beforeHasIt: held.indexOf(MARK) > -1, otherCalls, after, ov, ov2 });
    check(washAfterApprove === 0 && washAfterEditor === 0 && clipAfterApprove === clip.length && washLeft < 3000,
      "cr5b Approve shows no green wash and copies nothing, as the editor's own save shows none: the second green box in c3 was the wash of the stand-in's earlier click on the card, still fading", { washAfterApprove, washAfterEditor, clipAfterApprove, clipBefore: clip.length, washLeftMs: washLeft });
    await p.keyboard.press("Escape");
    await sleep(200);

    /* cr6 */
    const body2 = await raw(p, STEPS);
    const s0 = await stores(p, ["noteOwnText"]);
    await openMenu(p, STEPS);
    await press(p, "friendlier", { ok: true, text: body2.split("\n\n").map(x => rewordOf(x, "Kindly")).join("\n\n") });
    const stepsOn = await cardFace(p, STEPS);
    await shotCard(p, STEPS, "c4-steps-reworded-light");
    await p.click(cardSel(STEPS) + ' .rw-ans button[data-rw="revert"]');
    await sleep(150);
    const reverted = await cardFace(p, STEPS), s1 = await stores(p, ["noteOwnText"]);
    check(stepsOn.on && stepsOn.blocks >= 2 && stepsOn.text.indexOf("Kindly") > -1 && !reverted.on && reverted.text.indexOf("Kindly") < 0 && s1.indexOf("Kindly") < 0
      && reverted.blocks === stepsOn.blocks,
      "cr6 a card of steps reworded keeps its steps, and Revert shows it as it was with nothing stored", { stepsOn: { on: stepsOn.on, blocks: stepsOn.blocks }, reverted: { on: reverted.on, blocks: reverted.blocks } });

    /* cr7 */
    await openMenu(p, STEPS);
    await press(p, "shorter", { ok: true, text: body2.replace(/\n\s*\n/g, " ").replace(/\[step\] ?/g, "") + " " + MARK });
    const merged = await p.evaluate(() => (document.querySelector("#eReword .rw-bline") || {}).textContent || "");
    const mergedFace = await cardFace(p, STEPS);
    await shotCard(p, STEPS, "c5-refused-light", true);
    await p.keyboard.press("Escape");
    await sleep(150);
    const body3 = await raw(p, PLAIN2);
    await openMenu(p, PLAIN2);
    await press(p, "formal", { ok: true, text: body3.replace("{PAX}", NAME) });
    const lost = await p.evaluate(() => (document.querySelector("#eReword .rw-bline") || {}).textContent || "");
    const lostFace = await cardFace(p, PLAIN2);
    const REFUSED = WORDS.en.refused;
    check(merged === REFUSED && !mergedFace.on && lost === REFUSED && !lostFace.on,
      "cr7 a result that merged a card's steps, and one that wrote the customer's name in place of {PAX}, are refused and said, the card as it was", { merged, lost });

    /* cr8 */
    const said = async (p2, answer) => { await press(p2, "shorter", answer); return p2.evaluate(() => (document.querySelector("#eReword .rw-bline") || {}).textContent || ""); };
    const lines = async (p2, id, W) => {
      await p2.evaluate(() => { window.__answer = () => new Promise(() => {}); });
      await p2.click('#eReword button[data-rw-act="shorter"]');
      await sleep(80);
      const wait = await p2.evaluate(() => (document.querySelector("#eReword .rw-bline") || {}).textContent || "");
      await p2.keyboard.press("Escape");
      await sleep(120);
      await openMenu(p2, id);
      const late = await said(p2, { ok: false, why: "late" });
      const busy = await said(p2, { ok: false, why: "busy" });
      const none2 = await said(p2, { ok: false, why: "unreached" });
      const answer = await said(p2, { ok: false, why: "answer" });
      return { wait, late, busy, none2, answer, ok: wait === W.wait && late === W.late && busy === W.busy && none2 === W.none && answer === W.none };
    };
    const enL = await lines(p, PLAIN2, WORDS.en);
    const lateFace = await cardFace(p, PLAIN2);
    check(enL.ok && !lateFace.on,
      "cr8 each failure the build tells apart says its own sentence in the menu, as the copywriter wrote it (waiting, late, busy, every other), and the card stays as it was", enL);

    /* cr8b the same, and the refusal, in Polish */
    const plp = await desk({ lang: "pl" });
    await openMenu(plp, PLAIN2);
    const plL = await lines(plp, PLAIN2, WORDS.pl);
    await press(plp, "formal", { ok: true, text: (await raw(plp, PLAIN2)).replace("{PAX}", NAME) });
    const plRefused = await plp.evaluate(() => (document.querySelector("#eReword .rw-bline") || {}).textContent || "");
    check(plL.ok && plRefused === WORDS.pl.refused,
      "cr8b the same sentences, and the refusal, character for character in Polish under the Polish interface", { plL, plRefused });
    await plp.close();

    /* cr9 */
    await p.focus("#eRewordHow");
    await p.keyboard.type("in one sentence");
    await p.evaluate(a => { window.__answer = a; }, { ok: true, text: rewordOf(body3, "Briefly") });
    await p.keyboard.press("Enter");
    await sleep(150);
    const own = (await sent(p)).pop();
    const ownFace = await cardFace(p, PLAIN2);
    check(own && own.act === "own" && own.how === "in one sentence" && ownFace.on && ownFace.chip === "Reworded as described" && ownFace.us === "none",
      "cr9 the field takes the person's own words of how and Enter sends them; the chip says so; Approve and Revert are interface", { own, chip: ownFace.chip, us: ownFace.us });
    await p.close();
  }

  /* cr11: in the dark theme the reworded slab wears one line, its own dashed border, the glass rim set aside; stills for the designer. */
  {
    const d = await desk({ theme: "dark" });
    await openMenu(d, PLAIN);
    await shotCard(d, PLAIN, "c1-menu-dark", true);
    await press(d, "shorter", { ok: true, text: rewordOf(await raw(d, PLAIN)) });
    await shotCard(d, PLAIN, "c2-reworded-dark");
    const one = await d.evaluate(sel => { const x = document.querySelector(sel + " > .txt"), plain = document.querySelector("#list .card:not(.rw-on):not(.deck) > .txt");
      return { after: getComputedStyle(x, "::after").content, style: getComputedStyle(x).borderTopStyle, plainAfter: plain ? getComputedStyle(plain, "::after").content : "" }; }, cardSel(PLAIN));
    check(one.after === "none" && one.style === "dashed" && one.plainAfter !== "none",
      "cr11 in the dark theme the reworded slab wears one line, its dashed border, the glass rim the other slabs wear set aside", one);
    await d.close();
  }
  if (SHOTS) {
    const d = await desk({ theme: "dark" });
    const pl = await desk({ lang: "pl" });
    await openMenu(pl, PLAIN);
    await shotCard(pl, PLAIN, "c6-menu-pl-light", true);
    await press(pl, "shorter", { ok: true, text: rewordOf(await raw(pl, PLAIN)) });
    await shotCard(pl, PLAIN, "c7-reworded-pl-light");
    await d.close(); await pl.close();
  }

  /* cr10 the plants, on copies of the built page */
  const plants = [
    ["names", "if (!String(to || \"\").trim() || rewordTokens(from) !== rewordTokens(to)) return false;", "if (!String(to || \"\").trim()) return false;"],
    ["parts", "    if (a.length !== b.length) return false;\n", "\n"],
    ["filled", "const L = cardLang(m), from = cardText(m, \"body\", L);", "const L = cardLang(m), from = fill(cardText(m, \"body\", L), m, false, L);"],
    ["stored", "REWORDED.set(id, Object.assign({}, r, { n: ++rewordN }));", "REWORDED.set(id, Object.assign({}, r, { n: ++rewordN })); lsSet(\"eRewordPlant\", JSON.stringify(r));"],
    ["patched", "(it.rw ? \" rw-on\" : \"\")", "\"\""],
    ["rim", ":root:not([data-theme=light]) .card.rw-on>.txt::after{content:none}", ""],
    ["words", "No result came back from {ADDRESS}. The card is as it was.", "No answer from {ADDRESS}. The card is as it was."],
  ];
  for (const [name, from, to] of plants) {
    const what = "cr10 " + name + ": the plant on a copy of the built page turns its leg red";
    if (PLANTS_OFF) { skip(what + " (ETIUDA_PLANTS=off)"); continue; }
    const n = ENGINE.split(from).length - 1;
    if (n !== (name === "words" ? 2 : 1)) { check(false, what, { anchorFound: n }); continue; }
    const p = await desk({ url: pageFile(ENGINE.split(from).join(to), "etiuda-" + name + ".html") });
    let red = false, said = null;
    if (name === "names") {
      const b = await raw(p, PLAIN2);
      await openMenu(p, PLAIN2); await press(p, "formal", { ok: true, text: b.replace("{PAX}", NAME) });
      said = await cardFace(p, PLAIN2); red = said.on;
    } else if (name === "parts") {
      const b = await raw(p, STEPS);
      await openMenu(p, STEPS); await press(p, "shorter", { ok: true, text: b.replace(/\n\s*\n/g, " ").replace(/\[step\] ?/g, "") });
      said = await cardFace(p, STEPS); red = said.on;
    } else if (name === "filled") {
      await openMenu(p, PLAIN); await press(p, "shorter", { ok: false, why: "late" });
      said = await sent(p); red = said.length === 1 && said[0].words.indexOf(NAME.split(" ")[0]) > -1;
    } else if (name === "words") {
      await openMenu(p, PLAIN); await press(p, "shorter", { ok: false, why: "unreached" });
      said = await p.evaluate(() => (document.querySelector("#eReword .rw-bline") || {}).textContent || ""); red = said !== WORDS.en.none;
    } else if (name === "stored") {
      const b = await raw(p, PLAIN);
      await openMenu(p, PLAIN); await press(p, "shorter", { ok: true, text: rewordOf(b) });
      said = (await stores(p, ["noteOwnText"])).indexOf(MARK) > -1; red = said;
    } else if (name === "patched") {
      const b = await raw(p, PLAIN);
      await openMenu(p, PLAIN); await press(p, "shorter", { ok: true, text: rewordOf(b) });
      await p.evaluate(() => window.render()); await sleep(120);
      said = await cardFace(p, PLAIN); red = !said.on;
    } else {
      await p.close();
      const d = await desk({ theme: "dark", url: pageFile(ENGINE.replace(from, to), "etiuda-" + name + ".html") });
      const b = await raw(d, PLAIN);
      await openMenu(d, PLAIN); await press(d, "shorter", { ok: true, text: rewordOf(b) });
      said = await d.evaluate(sel => getComputedStyle(document.querySelector(sel + " > .txt"), "::after").content, cardSel(PLAIN)); red = said !== "none";
      await d.close();
      check(red, what, { said });
      continue;
    }
    await p.close();
    check(red, what, { said });
  }
} catch (e) {
  fails++;
  console.log("  FAIL the run stopped: " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
} finally {
  if (browser) await browser.close().catch(() => {});
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}
const done = checks + notRun === EXPECTED;
if (!done) console.log("  FAIL the file ran " + (checks + notRun) + " checks, not the " + EXPECTED + " it declares");
console.log("#counts checks=" + checks + " failed=" + fails + " notRun=" + notRun + " expected=" + EXPECTED);
console.log(fails === 0 && done ? "RESULT: ok " + checks + " check(s)" + (notRun ? ", " + notRun + " NOT RUN" : "") : "RESULT: FAIL " + fails + " of " + checks);
process.exit(Math.min(63, fails + (done ? 0 : 1)));
