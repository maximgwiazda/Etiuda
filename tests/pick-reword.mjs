/* "Your own words?" in the Quick replies window: the reword the shell offers, drawn by that window's own page.
 *
 *   node tests/pick-reword.mjs          PICK_SHOTS=<folder> also writes a still of each state, light and dark
 *
 * Headless Chrome on the shell's pickerDoc (pickPage inlined, the policy left out), its host stood in for: the words are the
 * desk page's own, from its "open" answer on the built engine and the shipped sample catalog, and E_PICK records every
 * reword, put and grow it is asked for. No leg starts the desk app, opens a window of it, or reaches a network.
 *   pr1 without the organisation's model (no o.reword) no act, foot or line exists in any of the three states: absent,
 *       not greyed
 *   pr2 by what the shell says of the selection: words that cannot be edited open the replies alone, words that can the
 *       reworder alone (no box, no list, the words above five acts each with its key, the line naming the host), and where
 *       the helper cannot tell, or nothing was selected, the replies with the foot under them and its line
 *   pr3 nothing is asked of the shell at an opening, on typing, on hovering an act or on the keys that move the light
 *   pr4 the foot: a press sends what the box holds and the act, once; the result stands where the replies stood, the
 *       agent's words above it, shown as text (markup inert), the note naming the host; Enter puts it, Esc goes back to
 *       the replies with nothing put; typing over the words lets the result go
 *   pr5 the reworder alone: Enter does the lit act, Right moves the light, Ctrl and a digit chooses, another act rewords the
 *       selection again and never the result, Enter puts the result the lit act made, the window grows once, Esc closes
 *   pr6 waiting, then no answer: the act stays pressed and the line says so; Esc drops an answer still on its way, which
 *       then shows nowhere; a failure says which, and the acts stay to press again
 *   pr7 the translation names the conversation's other language and sends it, and is absent where the catalog holds one
 *   pr8 the words and the result are content and can be selected, the acts and the lines are interface and cannot; an act
 *       under the keyboard draws the 2 px ring, after a click none
 *   pr9 the plant: plant:pick-reword-mode rewritten to the foot alone turns pr2's reworder-alone leg red
 * ETIUDA_PLANTS=off skips pr9 with a NOT RUN line.
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
const SHOTS = process.env.PICK_SHOTS || "";
const EXPECTED = 19;
let fails = 0, checks = 0, notRun = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
};
const skip = what => { notRun++; console.log("  NOT RUN " + what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-pick-reword-"));
fs.copyFileSync(E.ENGINE_PATH, path.join(lab, "etiuda.html"));
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
const deskUrl = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");
const MAIN_SRC = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
function pickerDocFile(src, name) {
  const a = src.indexOf("function pickPage() {"), z = src.indexOf("\nconst PICK_SCRIPT", a);
  const d0 = src.indexOf("function pickerDoc() {"), d1 = src.indexOf("\n}\n", d0) + 3;
  if (a < 0 || z < 0 || d0 < 0) throw new Error("pickPage or pickerDoc not found in shell/main.js");
  const doc = new Function("policyFor", "PICK_HASH", "PICK_SCRIPT", src.slice(d0, d1) + "\nreturn pickerDoc();")(() => "", "", "(" + src.slice(a, z) + ")();");
  const at = path.join(lab, name || "quick-replies.html");
  fs.writeFileSync(at, doc);
  return "file:///" + at.replace(/\\/g, "/");
}
const HOST = "ai.mirabelka.example";
/* The copywriter's lines, section 3 of her file, character for character, {ADDRESS} filled with HOST. */
const TAIL = { en: "Your words are as you wrote them.", pl: "Zaznaczony tekst pozostał bez zmian." };
const WORDS = {
  en: { wait: "Waiting for the service at " + HOST + "…", late: "The service at " + HOST + " did not answer in time. " + TAIL.en,
    busy: "The service at " + HOST + " is busy; a later try may go through. " + TAIL.en, none: "No result came back from " + HOST + ". " + TAIL.en,
    paused: "The service at " + HOST + " failed three times in a row, so Etiuda waits before asking it again; nothing was sent. " + TAIL.en,
    toolong: "These words are over 4000 characters, more than can be sent, so nothing was sent. " + TAIL.en,
    switch: "Rewording is turned off on this computer, so nothing was sent. " + TAIL.en,
    model: "The organisation's model is no longer set, so nothing was sent. " + TAIL.en,
    unavail: "Rewording is not available just now, so nothing was sent. " + TAIL.en },
  pl: { wait: "Oczekiwanie na usługę pod adresem " + HOST + "…", late: "Usługa pod adresem " + HOST + " nie odpowiedziała na czas. " + TAIL.pl,
    busy: "Usługa pod adresem " + HOST + " jest zajęta; późniejsza próba może się udać. " + TAIL.pl,
    none: "Z adresu " + HOST + " nie nadszedł wynik. " + TAIL.pl,
    paused: "Usługa pod adresem " + HOST + " zawiodła trzy razy z rzędu, więc Etiuda odczeka, zanim znów się do niej zwróci; nic nie zostało wysłane. " + TAIL.pl,
    toolong: "Tekst ma ponad 4000 znaków, więcej, niż można wysłać, więc nic nie zostało wysłane. " + TAIL.pl,
    switch: "Przeredagowanie jest wyłączone na tym komputerze, więc nic nie zostało wysłane. " + TAIL.pl,
    model: "Model organizacji nie jest już ustawiony, więc nic nie zostało wysłane. " + TAIL.pl,
    unavail: "Przeredagowanie jest teraz niedostępne, więc nic nie zostało wysłane. " + TAIL.pl } };
const SEL = "hi sorry for late reply, we check your order tomorow and write you back";
const OUT = "Hi, sorry for the late reply. We will check your order tomorrow and write back to you.";

let browser = null;
/* The desk page's own "open" answer, in a language and a theme. */
async function deskOpen(lang, theme, url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((lang, theme) => {
    try {
      for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"],
        ["eTheme", theme], ["eUiLang", lang], ["eStill", "1"], ["eRail", "1"]]) localStorage.setItem(k, v);
    } catch (e) {}
    const st = { offered: [], signedIn: "", seat: "none", reached: true };
    window.E_HOST = { hotkeyState: () => ({ accel: "Control+Shift+Space", held: true, taken: false }), onPickAsk: fn => { window.__pick = fn; },
      openPicker() {}, signinState: () => st, signIn: async () => st, signinCheck: async () => st };
  }, lang, theme);
  await page.goto(url || deskUrl, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await page.$("#ecYes")) await page.click("#ecYes");
  await page.waitForFunction(() => typeof window.__pick === "function" && document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  const o = JSON.parse(await page.evaluate(() => window.__pick("open", "{}")));
  await page.close();
  if (o.look) o.look.glass = false;
  return o;
}
/* The window's page, its host a recorder: `answer` is what a reword is answered with ("ok", "late", "busy", "none", "hang"). */
async function win(open, opts) {
  const o = opts || {};
  const page = await browser.newPage();
  await page.setViewport({ width: 600, height: o.height || 424, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((OUT) => {
    window.__calls = []; window.__answer = "ok"; window.__held = [];
    const rec = (k, v) => window.__calls.push(k + (v === undefined ? "" : " " + JSON.stringify(v)));
    window.E_PICK = { find: async q => { rec("find", q); return JSON.stringify({ rows: [], count: "" }); }, who: async () => "null", tab: async () => "null",
      lang: async () => "null", copy: async w => rec("copy", w), takeSuggest: async id => { rec("take", id); return "null"; },
      rowsOf: async id => { rec("rowsOf", id); return "null"; },
      reword: o => { rec("reword", o); const a = window.__answer;
        if (a === "hang") return new Promise(done => window.__held.push(done));
        return Promise.resolve(a === "ok" ? { ok: true, text: window.__out || OUT } : { ok: false, why: a }); },
      put: () => { rec("put"); return Promise.resolve(true); }, grow: () => rec("grow"),
      close() { rec("close"); }, ready() {}, tour() {}, onOpen(fn) { window.__open = fn; } };
  }, OUT);
  await page.goto(o.url || pickerDocFile(MAIN_SRC), { waitUntil: "load" });
  await page.evaluate(text => window.__open(text), JSON.stringify(open));
  await sleep(60);
  return page;
}
const calls = p => p.evaluate(() => window.__calls.slice());
const rewords = p => p.evaluate(() => window.__calls.filter(c => c.indexOf("reword ") === 0 || c === "put" || c === "grow"));
/* What the eye can see: an element is shown where it has a box. */
const face = p => p.evaluate(() => {
  const shown = sel => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
  const text = sel => { const el = document.querySelector(sel); return el && el.getClientRects().length ? el.textContent : ""; };
  const acts = sel => [...document.querySelectorAll(sel + " .rw-acts button")].filter(b => b.getClientRects().length).map(b => b.textContent);
  return { box: shown("#q"), rows: shown("#rows"), foot: shown("#rw"), only: shown("#rwo"), res: shown("#rwr"),
    footActs: acts("#rw"), onlyActs: acts("#rwo"), footLine: text("#rw .rw-line"), onlyLine: text("#rwo .rw-line"), onlyWords: text("#rwo .rw-words"),
    resLab: text("#rwr .rw-lab"), resWords: text("#rwr .rw-words"), resAct: text("#rwr .rw-act"), out: text("#rwr .rw-out"),
    outTags: document.querySelector("#rwr .rw-out") ? document.querySelector("#rwr .rw-out").children.length : -1,
    resLine: text("#rwr .rw-line"), keys: document.getElementById("keys").textContent,
    lit: [...document.querySelectorAll(".rw-acts button.on")].filter(b => b.getClientRects().length).map(b => b.textContent),
    pressed: [...document.querySelectorAll(".rw-acts button[aria-pressed=true]")].filter(b => b.getClientRects().length).map(b => b.textContent),
    anyAct: document.querySelectorAll(".rw-acts button").length };
});
async function shot(p, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await p.screenshot({ path: path.join(SHOTS, name + ".png") });
}
const withRw = (o, extra) => Object.assign({}, o, { reword: { host: HOST } }, extra || {});
const key = async (p, k, mods) => {
  for (const m of mods || []) await p.keyboard.down(m);
  await p.keyboard.press(k);
  for (const m of (mods || []).slice().reverse()) await p.keyboard.up(m);
  await sleep(40);
};

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  const EN = await deskOpen("en", "light"), DARK = await deskOpen("en", "dark"), PL = await deskOpen("pl", "light");
  const w = EN.words || {};
  const before = String(w.rwBefore || "").split("{ADDRESS}").join(HOST), after = String(w.rwAfter || "").split("{ADDRESS}").join(HOST);
  check(!!w.rwHead && /\{ADDRESS\}/.test(w.rwBefore || "") && (EN.langs | 0) >= 2,
    "pr0 the desk's own open answer carries the words of the foot, the line naming {ADDRESS}, on a catalog of two languages", { head: w.rwHead, langs: EN.langs });

  /* pr1 absent without the model */
  {
    const seen = [];
    for (const ed of [true, false, null]) {
      const p = await win(Object.assign({}, EN, { selected: SEL, editable: ed }));
      const f = await face(p);
      seen.push({ ed, foot: f.foot, only: f.only, res: f.res, rows: f.rows, box: f.box, acts: f.footActs.length + f.onlyActs.length });
      if (ed === true) await shot(p, "q0-without-the-model-light");
      await p.close();
    }
    check(seen.every(s => !s.foot && !s.only && !s.res && s.rows && s.box && s.acts === 0),
      "pr1 without the organisation's model no act, foot or line exists in any of the three states, and the window is today's", seen);
  }

  /* pr2 the three states */
  let only = null, foot = null, ro = null, none = null;
  {
    const pro = await win(withRw(EN, { selected: SEL, editable: false }));
    ro = await face(pro); await shot(pro, "q1-customer-message-light"); await pro.close();
    const pon = await win(withRw(EN, { selected: SEL, editable: true }), { height: 264 });
    only = await face(pon); await shot(pon, "q3-own-draft-before-light"); await pon.close();
    const pun = await win(withRw(EN, { selected: SEL, editable: null }));
    foot = await face(pun); await shot(pun, "q2-cannot-tell-before-light"); await pun.close();
    const pno = await win(withRw(EN, {}));
    none = await face(pno); await shot(pno, "q5-nothing-selected-light"); await pno.close();
    check(ro.rows && ro.box && !ro.foot && !ro.only && ro.anyAct === 0,
      "pr2a words that cannot be edited open the replies alone, no foot", ro);
    check(!only.box && !only.rows && only.only && !only.foot && only.onlyWords === SEL && only.onlyActs.length === 5
      && only.onlyActs.every((t, i) => t.indexOf("Ctrl+" + (i + 1)) === 0) && only.onlyLine === before && only.lit.length === 1,
      "pr2b words that can be edited open the reworder alone: no box and no list, the words above five acts each with its key, the first lit, the line naming the host", only);
    check(foot.rows && foot.box && foot.foot && !foot.only && foot.footActs.length === 5 && foot.footLine === before
      && none.rows && none.foot && none.footLine === before,
      "pr2c where the helper cannot tell, and where nothing was selected, the replies with the foot under them and its line", { foot, none });
  }

  /* pr3 nothing at an opening, on typing, on hovering, on moving the light */
  {
    const p = await win(withRw(EN, { selected: SEL, editable: null }));
    await p.focus("#q");
    await p.keyboard.type(" thanks");
    const b = await p.$("#rw .rw-acts button");
    if (b) await b.hover();
    const p2 = await win(withRw(EN, { selected: SEL, editable: true }), { height: 264 });
    await key(p2, "ArrowRight"); await key(p2, "ArrowRight"); await key(p2, "ArrowLeft");
    const r1 = await rewords(p), r2 = await rewords(p2), lit = (await face(p2)).lit;
    check(r1.length === 0 && r2.length === 0 && lit.length === 1 && lit[0].indexOf("Shorter") > -1,
      "pr3 nothing is asked of the shell at an opening, on typing, on hovering an act, or on Left and Right, which move the light", { r1, r2, lit });
    await p.close(); await p2.close();
  }

  /* pr4 the foot */
  {
    const p = await win(withRw(EN, { selected: SEL, editable: null }));
    await p.evaluate(() => { window.__out = "Hi <b>there</b>, all done."; });
    await p.click("#rw .rw-acts button:nth-child(2)");
    await sleep(60);
    const f = await face(p);
    await shot(p, "q4-cannot-tell-after-light");
    const r = await rewords(p);
    await key(p, "Enter");
    const put = await rewords(p);
    check(r.length === 1 && r[0] === "reword " + JSON.stringify({ act: "shorter", words: SEL, to: "" })
      && !f.rows && f.res && f.resLab === w.rwYou && f.resWords === SEL && f.resAct === w.rwShorter && f.out === "Hi <b>there</b>, all done." && f.outTags === 0
      && f.resLine === after && f.pressed.join() === w.rwShorter && !f.footLine && put.slice(1).join() === "put",
      "pr4 a press of the foot sends the box's words and the act once; the result stands where the replies stood, the words above it, shown as text,"
      + " the note naming the host; Enter puts it", { r, f, put });
    const p2 = await win(withRw(EN, { selected: SEL, editable: null }));
    await p2.click("#rw .rw-acts button:nth-child(1)");
    await sleep(60);
    await p2.focus("#q");
    await key(p2, "Escape");
    const back = await face(p2), afterEsc = await calls(p2);
    await p2.click("#rw .rw-acts button:nth-child(1)");
    await sleep(60);
    await p2.focus("#q");
    await p2.keyboard.type("x");
    await sleep(60);
    const typed = await face(p2);
    check(back.rows && !back.res && back.footLine === before && afterEsc.indexOf("put") < 0 && afterEsc.indexOf("close") < 0 && typed.rows && !typed.res,
      "pr4b Esc goes back to the replies with nothing put and the window open, and typing over the words lets a result go", { back, typed });
    await p.close(); await p2.close();
  }

  /* pr5 the reworder alone */
  {
    const p = await win(withRw(EN, { selected: SEL, editable: true }), { height: 264 });
    await key(p, "Enter");
    await p.setViewport({ width: 600, height: 336, deviceScaleFactor: 1 });
    const f1 = await face(p);
    await shot(p, "q6-own-draft-after-light");
    await key(p, "ArrowRight");
    await key(p, "Digit3", ["Control"]);
    await key(p, "Enter");
    await key(p, "Escape");
    const r = await calls(p);
    const sent = r.filter(c => c.indexOf("reword ") === 0).map(c => JSON.parse(c.slice(7)));
    check(sent.length === 2 && sent[0].act === "spelling" && sent[1].act === "friendlier" && sent.every(s => s.words === SEL)
      && f1.out === OUT && f1.resLine === after && f1.onlyWords === SEL && r.filter(c => c === "grow").length >= 1
      && r.indexOf("put") > r.lastIndexOf("reword " + JSON.stringify(sent[1])) && r[r.length - 1] === "close",
      "pr5 alone: Enter does the lit act; Right moves the light without sending; Ctrl+3 chooses and rewords the selection again, never the result;"
      + " Enter puts the result the lit act made; the window grows once a result stands; Esc closes", { r, f1 });
    await p.close();
  }

  /* pr6 waiting, dropped, failing */
  {
    const p = await win(withRw(EN, { selected: SEL, editable: null }));
    await p.evaluate(() => { window.__answer = "hang"; });
    await p.click("#rw .rw-acts button:nth-child(1)");
    await sleep(40);
    const waiting = await face(p);
    await shot(p, "q7-waiting-light");
    await p.focus("#q");
    await key(p, "Escape");
    await p.evaluate(OUT => window.__held.forEach(done => done({ ok: true, text: OUT })), OUT);
    await sleep(60);
    const dropped = await face(p);
    await p.evaluate(() => { window.__answer = "late"; });
    await p.click("#rw .rw-acts button:nth-child(1)");
    await sleep(60);
    const late = await face(p);
    await shot(p, "q8-no-answer-light");
    await p.evaluate(() => { window.__answer = "busy"; });
    await p.click("#rw .rw-acts button:nth-child(1)");
    await sleep(60);
    const busy = await face(p);
    await p.evaluate(() => { window.__answer = "unreached"; });
    await p.click("#rw .rw-acts button:nth-child(1)");
    await sleep(60);
    const lost = await face(p);
    check(waiting.res && waiting.resLine === WORDS.en.wait && waiting.pressed.length === 1 && !waiting.out,
      "pr6 while the service is asked the act stays pressed and the line says so, as the copywriter wrote it, the result's place empty", waiting);
    check(dropped.rows && !dropped.res && !dropped.out && late.resLine === WORDS.en.late && busy.resLine === WORDS.en.busy && late.footActs.length === 5 && late.pressed.length === 0
      && lost.resLine === WORDS.en.none,
      "pr6b Esc drops the answer on its way, which then shows nowhere; late, busy and every other failure each say their own sentence, the acts there to press again", { dropped, late: late.resLine, busy: busy.resLine, lost: lost.resLine });
    await p.close();
  }

  /* pr6c the same lines in Polish under the Polish interface */
  {
    const p = await win(withRw(Object.assign({}, PL, { lang: "pl" }), { selected: SEL, editable: null }));
    const seen = {};
    await p.evaluate(() => { window.__answer = "hang"; });
    await p.click("#rw .rw-acts button:nth-child(1)");
    await sleep(40);
    seen.wait = (await face(p)).resLine;
    await p.focus("#q");
    await key(p, "Escape");
    for (const k of ["late", "busy", "unreached"]) {
      await p.evaluate(a => { window.__answer = a; }, k);
      await p.click("#rw .rw-acts button:nth-child(1)");
      await sleep(60);
      seen[k] = (await face(p)).resLine;
    }
    await shot(p, "q10-no-result-pl-light");
    await p.close();
    check(seen.wait === WORDS.pl.wait && seen.late === WORDS.pl.late && seen.busy === WORDS.pl.busy && seen.unreached === WORDS.pl.none,
      "pr6c waiting, late, busy and every other failure, character for character in Polish", seen);
  }

  /* pr6d the cases where nothing was sent each say so in a sentence of their own, never "No result came back", in both languages */
  {
    const seen = {};
    for (const [lang, desk] of [["en", EN], ["pl", Object.assign({}, PL, { lang: "pl" })]]) {
      const p = await win(withRw(desk, { selected: SEL, editable: null }));
      const got = {};
      for (const k of ["paused", "toolong", "switch", "model", "unavailable", "refused", "off"]) {
        await p.evaluate(a => { window.__answer = a; }, k);
        await p.click("#rw .rw-acts button:nth-child(1)");
        await sleep(60);
        got[k] = (await face(p)).resLine;
      }
      await shot(p, "q11-nothing-sent-" + lang + "-light");
      await p.close();
      seen[lang] = got;
    }
    const W = { en: WORDS.en, pl: WORDS.pl };
    const ok = lang => { const g = seen[lang], w = W[lang]; return g.paused === w.paused && g.toolong === w.toolong && g.switch === w.switch && g.model === w.model
      && g.unavailable === w.unavail && g.refused === w.unavail && g.off === w.unavail && Object.values(g).every(x => x.indexOf("No result came back") < 0 && x.indexOf("Z adresu") < 0); };
    check(ok("en") && ok("pl"), "pr6d the service paused, words over 4000, the switch off, the model gone and a press the desk cannot tell the two for each say their own sentence, 'nothing was sent', character for character in both languages", seen);
  }

  /* pr7 the translation */
  {
    const p = await win(withRw(EN, { selected: SEL, editable: null }));
    await p.click("#rw .rw-acts button:nth-child(5)");
    await sleep(40);
    const en = (await calls(p)).filter(c => c.indexOf("reword ") === 0).map(c => JSON.parse(c.slice(7)))[0] || {};
    const enAct = (await face(p)).footActs[4];
    await p.close();
    const p2 = await win(withRw(Object.assign({}, PL, { lang: "pl" }), { selected: SEL, editable: null }));
    await shot(p2, "q9-cannot-tell-before-pl-light");
    await p2.click("#rw .rw-acts button:nth-child(5)");
    await sleep(40);
    const pl = (await calls(p2)).filter(c => c.indexOf("reword ") === 0).map(c => JSON.parse(c.slice(7)))[0] || {};
    const plAct = (await face(p2)).footActs[4];
    await p2.close();
    const one = Object.assign({}, EN, { words: Object.assign({}, EN.words, { rwLangs: ["en"] }), langs: 1 });
    const p3 = await win(withRw(one, { selected: SEL, editable: null }));
    const single = (await face(p3)).footActs;
    await p3.close();
    check(en.act === "translate" && en.to === "pl" && enAct === w.rwIntoPl && pl.to === "en" && plAct === (PL.words || {}).rwIntoEn && single.length === 4,
      "pr7 the translation names the conversation's other language and sends it, both ways (the replies in English, then in Polish under the Polish interface), and a catalog of one language has none", { en, enAct, pl, plAct, single });
  }

  /* pr8 what can be selected, and the ring */
  {
    const p = await win(withRw(EN, { selected: SEL, editable: null }));
    await p.click("#rw .rw-acts button:nth-child(1)");
    await sleep(60);
    const us = await p.evaluate(() => {
      const u = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el).userSelect : "absent"; };
      return { out: u("#rwr .rw-out"), words: u("#rwr .rw-words"), act: u("#rw .rw-acts button"), head: u("#rw .rw-h"), line: u("#rwr .rw-line"), lab: u("#rwr .rw-lab") };
    });
    check(us.out === "text" && us.words === "text" && us.act === "none" && us.head === "none" && us.line === "none" && us.lab === "none",
      "pr8 the result and the words are content and can be selected; the acts, the heading and the lines cannot", us);
    await p.close();
    const p2 = await win(withRw(Object.assign({}, EN, { who: "" }), { selected: SEL, editable: null }));
    await p2.focus("#q");
    await key(p2, "Tab");
    const kb = await p2.evaluate(() => { const a = document.activeElement, s = getComputedStyle(a);
      return { act: !!a.closest(".rw-acts"), style: s.outlineStyle, width: s.outlineWidth }; });
    await p2.mouse.click(2, 2);
    await p2.click("#rw .rw-acts button:nth-child(3)");
    const ck = await p2.evaluate(() => { const b = document.querySelector("#rw .rw-acts button:nth-child(3)"), s = getComputedStyle(b);
      return { focused: document.activeElement === b, style: s.outlineStyle }; });
    check(kb.act && kb.style === "solid" && kb.width === "2px" && ck.style === "none",
      "pr8b Tab from the box reaches the first act, which draws the 2 px ring; after a click no act draws one", { kb, ck });
    await p2.close();
  }

  /* Stills in the dark theme, for the designer's eye. */
  if (SHOTS) {
    for (const [name, o, h, act] of [["q2-cannot-tell-before-dark", { editable: null }, 424, 0], ["q4-cannot-tell-after-dark", { editable: null }, 424, 2],
      ["q3-own-draft-before-dark", { editable: true }, 264, 0], ["q6-own-draft-after-dark", { editable: true }, 336, 1], ["q1-customer-message-dark", { editable: false }, 424, 0]]) {
      const p = await win(withRw(DARK, Object.assign({ selected: SEL }, o)), { height: h });
      if (act && o.editable === null) { await p.click("#rw .rw-acts button:nth-child(" + act + ")"); await sleep(60); }
      if (act && o.editable === true) { await key(p, "Enter"); }
      await shot(p, name);
      await p.close();
    }
  }

  /* pr9b the plant: a placeholder put back */
  if (PLANTS_OFF) skip("pr9b a placeholder put back in the built page (ETIUDA_PLANTS=off)");
  else {
    const KEY = "No result came back from {ADDRESS}. Your words are as you wrote them.";
    const built = fs.readFileSync(path.join(lab, "etiuda.html"), "utf8");
    const n = built.split(KEY).length - 1;
    fs.writeFileSync(path.join(lab, "etiuda-planted.html"), built.split(KEY).join("No answer from {ADDRESS}. Your words are as you wrote them."));
    const o = n > 0 ? await deskOpen("en", "light", "file:///" + path.join(lab, "etiuda-planted.html").split("\\").join("/")) : { words: {} };
    const w2 = o.words || {};
    check(n > 0 && String(w2.rwNone || "").split("{ADDRESS}").join(HOST) !== WORDS.en.none,
      "pr9b with the old placeholder put back in the built page, the failure's line no longer is her sentence and pr6b would be red", { found: n, none: w2.rwNone });
  }

  /* pr9c the plant: a nothing-sent line put back as the generic one */
  if (PLANTS_OFF) skip("pr9c a nothing-sent line put back as 'No result came back' in the built page (ETIUDA_PLANTS=off)");
  else {
    const KEY = "Rewording is turned off on this computer, so nothing was sent. Your words are as you wrote them.";
    const built = fs.readFileSync(path.join(lab, "etiuda.html"), "utf8");
    const n = built.split(KEY).length - 1;
    fs.writeFileSync(path.join(lab, "etiuda-planted2.html"), built.split(KEY).join("No result came back from {ADDRESS}. Your words are as you wrote them."));
    const o = n > 0 ? await deskOpen("en", "light", "file:///" + path.join(lab, "etiuda-planted2.html").split("\\").join("/")) : { words: {} };
    check(n > 0 && String((o.words || {}).rwSwitch || "").split("{ADDRESS}").join(HOST) !== WORDS.en.switch,
      "pr9c with the switch-off line put back as the generic one in the built page, it no longer is her sentence and pr6d would be red", { found: n });
  }

  /* pr9 the plant */
  if (PLANTS_OFF) skip("pr9 plant:pick-reword-mode rewritten to the foot alone (ETIUDA_PLANTS=off)");
  else {
    const line = MAIN_SRC.split("\n").filter(l => l.indexOf("plant:pick-reword-mode") >= 0);
    const planted = MAIN_SRC.split("\n").map(l => l.indexOf("plant:pick-reword-mode") >= 0 ? l.replace(/rwMode = .*;/, "rwMode = !reword ? \"\" : \"foot\";") : l).join("\n");
    const p = await win(withRw(EN, { selected: SEL, editable: true }), { height: 264, url: pickerDocFile(planted, "quick-replies-planted.html") });
    const f = await face(p);
    await p.close();
    check(line.length === 1 && planted !== MAIN_SRC && !(f.only && !f.rows && !f.box),
      "pr9 with plant:pick-reword-mode rewritten to the foot alone, editable words open the replies and pr2b's leg would be red", { marks: line.length, only: f.only, rows: f.rows });
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
