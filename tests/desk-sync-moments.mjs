/* Sync across computers, its moments on the desk (design 14.12, additions 7 and 8).
 *
 *   node tests/desk-sync-moments.mjs
 *
 * Headless Chrome on the built engine page and the shipped sample, under a stand-in host that answers the sign-in and the store's
 * view as the shell would (shell/sync/store.cjs storeRow), and keeps what was said; node for the shell's pure halves.
 *   c9a the first sign-in that made the store: one bubble, from the account button, in the copywriter's words, asking nothing; told
 *       to the shell once; never again, after more views or after Dismiss
 *   c9b the same while the account panel is open: nothing until the panel closes, then the one bubble
 *   c9c a second computer, and a desk that has said it already: no bubble
 *   c9d firstSay: "on" only at the first look with sync on that made the store
 *   m1  the Account row's line for each state, the switch only where it acts, held by policy fixed with its lock
 *   m2  Off asks from the switch: Everywhere, This computer, Cancel filled and last; the switch stays On; Escape and Cancel change
 *       nothing; This computer and Everywhere go to the shell as such; On goes at once, unasked
 *   m3  the row and the question in Polish
 *   r1  storeRow's line for each state
 * Plants: the page's word to the shell that it showed the bubble taken out (c9a red: said again after Dismiss); firstSay saying at a
 * look that did not make the store (c9d red).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

let fails = 0, checks = 0, skipped = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
};
const skip = what => { skipped++; console.log("  SKIP " + what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EXPECTED = 10;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const STORE = path.join(E.ROOT, "shell", "sync", "store.cjs");
const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-sync-moments-"));
const PAGE = fs.readFileSync(E.ENGINE_PATH, "utf8");
fs.writeFileSync(path.join(lab, "etiuda.html"), PAGE);
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
const urlOf = name => "file:///" + path.join(lab, name).replace(/\\/g, "/");
let browser = null;

const SAID_EN = "Your catalogs, edits and settings now follow you to every computer you sign in on. You can turn this off in Account.";
const ON = { shown: true, line: "on", on: true, held: false, why: "", since: 0, say: "" };

async function boot({ lang = "en", theme = "light", page: name = "etiuda.html", view = ON, width = 1280, height = 860 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((lang, theme, view) => {
    try {
      for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"],
        ["eTheme", theme], ["eUiLang", lang], ["eStill", "1"], ["eRail", "1"]]) localStorage.setItem(k, v);
    } catch (e) {}
    /* The shell's store as the page sees it: the view, what was said, the switch's presses. */
    window.__st = { view: view, said: 0, sets: [], tell: null };
    window.__sgn = { offered: ["microsoft", "google"], signedIn: "microsoft", code: "7K3MQ9TV2XRBHN4W", seat: "held", at: Date.now(), reached: true };
    window.E_HOST = {
      signinState: () => window.__sgn,
      onSignin: fn => { window.__sgnTell = fn; },
      storeState: () => window.__st.view,
      storeSaid: () => { window.__st.said++; window.__st.view = Object.assign({}, window.__st.view, { say: "" }); },
      storeSet: async w => { window.__st.sets.push(w); return null; },
      onStore: fn => { window.__st.tell = fn; },
    };
  }, lang, theme, view);
  await page.goto(urlOf(name), { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await page.$("#ecYes")) await page.click("#ecYes");
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await page.evaluate(() => { document.documentElement.classList.add("e-still"); });
  await page.evaluate(MEASURE);
  return page;
}

/* The measure of desk-bubbles-origin: the pointer's point within the control's span, no further than the gap from its edge. */
const MEASURE = String.raw`window.__bubAt = function(bub, ctl){
  if(!bub) return {why:"no bubble"};
  const side=bub.getAttribute("data-side");
  const tip=bub.querySelector(":scope > .bub-tip");
  if(!tip || !tip.getClientRects().length) return {why:"no pointer", side:side};
  if(!ctl || !ctl.getClientRects().length) return {why:"no control on screen", side:side};
  const t=tip.getBoundingClientRect(), c=ctl.getBoundingClientRect();
  let perp, along, lo, hi;
  if(side==="below"){ perp=t.top-c.bottom; along=t.left+t.width/2; lo=c.left; hi=c.right; }
  else if(side==="above"){ perp=c.top-t.bottom; along=t.left+t.width/2; lo=c.left; hi=c.right; }
  else if(side==="right"){ perp=t.left-c.right; along=t.top+t.height/2; lo=c.top; hi=c.bottom; }
  else if(side==="left"){ perp=c.left-t.right; along=t.top+t.height/2; lo=c.top; hi=c.bottom; }
  else return {why:"side "+side};
  const b=bub.getBoundingClientRect(), shown=b.top>=-1 && b.left>=-1 && b.bottom<=innerHeight+1 && b.right<=innerWidth+1;
  return {ok:shown && perp>=-2 && perp<=11 && along>=lo-0.5 && along<=hi+0.5, side:side, perp:Math.round(perp*10)/10};
};
window.__shown = function(){
  return [...document.querySelectorAll(".bub")].filter(b=>b.getClientRects().length && !b.closest("#tourRoot") && !b.closest(".e-gone"))
    .map(b=>b.id||b.className);
};`;

/* What the page shows after the store's view `view` is told; `tells` times. */
async function tell(page, view, tells = 1) {
  await page.evaluate((view, tells) => { if (view) window.__st.view = view; for (let i = 0; i < tells; i++) window.__st.tell && window.__st.tell(); }, view, tells);
  await sleep(450);
  return page.evaluate(() => {
    const b = document.getElementById("eSyncSaid");
    const modal = !!document.querySelector("dialog[open], .modal.on, #modal:not([hidden])");
    return { shown: window.__shown(), said: window.__st.said, modal, text: b ? b.textContent.replace(/Dismiss$/, "").trim() : "",
      buttons: b ? [...b.querySelectorAll("button")].map(x => x.textContent) : [], fields: b ? b.querySelectorAll("input,select,textarea").length : 0,
      at: b ? window.__bubAt(b, document.getElementById("signinBtn")) : null };
  });
}

/* c9a: the first sign-in. Answers what went wrong, or "" where all held. */
async function firstSignin(pageName) {
  const page = await boot({ page: pageName, view: ON });
  try {
    const before = await tell(page, null);
    if (before.shown.length) return "a bubble before anything was said: " + before.shown.join(",");
    const one = await tell(page, Object.assign({}, ON, { say: "on" }));
    if (one.shown.length !== 1 || one.shown[0] !== "eSyncSaid") return "not one bubble: " + JSON.stringify(one.shown);
    if (!one.at || !one.at.ok) return "not from the account button: " + JSON.stringify(one.at);
    if (one.text !== SAID_EN) return "words: " + one.text;
    if (one.fields || one.buttons.length !== 1 || one.buttons[0] !== "Dismiss" || one.modal) return "asks something: " + JSON.stringify(one);
    const more = await tell(page, null, 2);
    if (more.shown.length !== 1 || more.said !== 1) return "after two more views: " + JSON.stringify({ shown: more.shown, said: more.said });
    await page.evaluate(() => document.querySelector("#eSyncSaid button").click());
    const after = await tell(page, null, 2);
    if (after.shown.length) return "said again after Dismiss: " + JSON.stringify(after.shown);
    return "";
  } finally { await page.close(); }
}

async function main() {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });

  const c9a = await firstSignin("etiuda.html");
  check(!c9a, "c9a the first sign-in that made the store: one bubble from the account button in the copywriter's words, asking nothing, told once, never again", c9a || undefined);

  /* c9b: the account panel open when the look answers. */
  {
    const page = await boot({ view: ON });
    await page.click("#signinBtn");
    await sleep(200);
    const open = await tell(page, Object.assign({}, ON, { say: "on" }));
    await page.click("#signinBtn");
    await sleep(100);
    const closed = await tell(page, null);
    await page.close();
    const ok = !open.shown.includes("eSyncSaid") && closed.shown.length === 1 && closed.shown[0] === "eSyncSaid" && closed.at && closed.at.ok && closed.said === 1;
    check(ok, "c9b with the account panel open, nothing until it closes, then the one bubble from the button", ok ? undefined : { open: open.shown, closed });
  }

  /* c9c: a second computer, and a start after it was said. */
  {
    const page = await boot({ view: ON });
    const second = await tell(page, ON, 3);
    await page.close();
    check(!second.shown.length && second.said === 0, "c9c a second computer (nothing to say) shows no bubble", second);
  }

  /* c9d: firstSay, the shell's half. */
  const firstSayHolds = ST => {
    const a = ST.firstSay(false, { state: "on", made: true }), b = ST.firstSay(false, { state: "on", made: false });
    const c = ST.firstSay(true, { state: "on", made: true }), d = ST.firstSay(false, { state: "unavailable", why: "consent" });
    return a.say === "on" && a.told === true && b.say === "" && b.told === true && c.say === "" && d.say === "" && d.told === false;
  };
  const ST = require(STORE);
  check(firstSayHolds(ST), "c9d firstSay says \"on\" only at the first look with sync on that made the store");

  /* m1: the row's line for each state. */
  const LINES = [
    ["on", ON, "Your catalogs, edits and settings on every computer you sign in on.", "switch"],
    ["off", { ...ON, line: "off", on: false }, "Only on this computer.", "switch"],
    ["org-off", { ...ON, line: "org-off", on: false, held: true, say: "" }, "Your organisation has not turned this on.", "none"],
    ["unavailable, no OneDrive", { ...ON, line: "unavailable", why: "no-drive" }, "Not available on this account: the account has no OneDrive. Everything works on this computer as before.", "none"],
    ["unavailable, the folder refused", { ...ON, line: "unavailable", why: "consent" }, "Not available on this account: Etiuda was not allowed its folder in the account. To turn sync on, sign in again and allow it. Everything works on this computer as before.", "none"],
    ["conflict", { ...ON, line: "conflict" }, "Changed on two computers: choose which to keep.", "switch"],
    ["paused", { ...ON, line: "paused", since: Date.UTC(2026, 10, 11, 12) }, "Paused since 11 November. It resumes when this computer reaches our service.", "switch"],
    ["held on", { ...ON, held: true }, "Your catalogs, edits and settings on every computer you sign in on.", "fixed"],
  ];
  const rowOf = page => page.evaluate(() => {
    const r = document.querySelector('#setBody [data-row="sync"]');
    if (!r) return null;
    const btns = [...r.querySelectorAll(".set-seg button")];
    return { title: (r.querySelector(".set-label") || {}).firstChild ? r.querySelector(".set-label").firstChild.textContent : "", line: (r.querySelector("small") || {}).textContent || "",
      ctl: !btns.length ? "none" : btns.every(b => b.disabled) && r.querySelector(".sgn-lock") ? "fixed" : btns.some(b => b.disabled) ? "half" : "switch",
      on: (r.querySelector(".set-seg button.on") || {}).textContent || "" };
  });
  {
    const page = await boot({ view: ON });
    const bad = [];
    for (const [name, view, line, ctl] of LINES) {
      await page.evaluate(v => { window.__st.view = v; openSettings("account"); }, view);
      await sleep(120);
      const r = await rowOf(page);
      if (!r || r.title !== "Sync across computers" || r.line !== line || r.ctl !== ctl || (ctl === "switch" && r.on !== (view.on ? "On" : "Off"))) bad.push({ name, r });
    }
    /* Signed out: no row. */
    await page.evaluate(() => { window.__st.view = { shown: false }; openSettings("account"); });
    await sleep(120);
    if (await rowOf(page)) bad.push({ name: "not shown", r: "a row" });
    check(!bad.length, "m1 the row's line for each state; the switch only where it acts, fixed with the lock where policy holds it", bad.length ? bad : undefined);

    /* m2: the question from the switch. */
    const ask = async () => {
      await page.evaluate(() => { window.__st.view = { shown: true, line: "on", on: true, held: false, why: "", since: 0, say: "" }; openSettings("account"); });
      await sleep(150);
      await page.evaluate(() => document.querySelector('#setBody .set-seg[data-seg="sync"] button[data-val="off"]').click());
      await sleep(450);
      return page.evaluate(() => {
        const b = document.getElementById("eSyncAsk");
        const seg = document.querySelector('#setBody .set-seg[data-seg="sync"]');
        return { b: !!b, at: b ? window.__bubAt(b, seg) : null, title: b ? b.querySelector("h3").textContent : "", text: b ? b.querySelector("p").textContent : "",
          buttons: b ? [...b.querySelectorAll(".tour-actions button")].map(x => x.textContent + (x.classList.contains("primary") ? "*" : "")) : [],
          focus: document.activeElement && document.activeElement.id, on: (seg.querySelector("button.on") || {}).textContent, sets: window.__st.sets.slice() };
      });
    };
    const m2bad = [];
    const a = await ask();
    if (!a.b || !a.at || !a.at.ok || a.title !== "Turn off sync?" || a.text !== "Everywhere also deletes the synced copy; each computer keeps its own."
      || JSON.stringify(a.buttons) !== JSON.stringify(["Everywhere", "This computer", "Cancel*"]) || a.focus !== "eSyncStay" || a.on !== "On" || a.sets.length) m2bad.push({ asked: a });
    await page.keyboard.press("Escape");
    await sleep(200);
    const esc = await page.evaluate(() => ({ b: !!document.getElementById("eSyncAsk"), on: document.querySelector('#setBody .set-seg[data-seg="sync"] button.on').textContent, sets: window.__st.sets.slice() }));
    if (esc.b || esc.on !== "On" || esc.sets.length) m2bad.push({ escape: esc });
    await ask();
    await page.evaluate(() => document.getElementById("eSyncStay").click());
    await sleep(150);
    const cancel = await page.evaluate(() => ({ b: !!document.getElementById("eSyncAsk"), sets: window.__st.sets.slice() }));
    if (cancel.b || cancel.sets.length) m2bad.push({ cancel });
    await ask();
    await page.evaluate(() => document.getElementById("eSyncHere").click());
    await sleep(150);
    await ask();
    await page.evaluate(() => document.getElementById("eSyncAll").click());
    await sleep(150);
    await page.evaluate(() => { window.__st.view = Object.assign({}, window.__st.view, { line: "off", on: false }); openSettings("account"); });
    await sleep(150);
    await page.evaluate(() => document.querySelector('#setBody .set-seg[data-seg="sync"] button[data-val="on"]').click());
    await sleep(300);
    const sets = await page.evaluate(() => ({ sets: window.__st.sets.slice(), b: !!document.getElementById("eSyncAsk") }));
    if (JSON.stringify(sets.sets) !== JSON.stringify(["here", "everywhere", "on"]) || sets.b) m2bad.push({ presses: sets });
    await page.close();
    check(!m2bad.length, "m2 Off asks from the switch (Everywhere, This computer, Cancel filled and last), the switch stays On; Escape and Cancel change nothing; the choices and On reach the shell", m2bad.length ? m2bad : undefined);
  }

  /* m3: Polish. */
  {
    const page = await boot({ lang: "pl", theme: "dark", view: ON });
    await page.evaluate(() => { window.__st.view = { shown: true, line: "unavailable", on: true, held: false, why: "no-drive", since: 0, say: "" }; openSettings("account"); });
    await sleep(150);
    const r1 = await rowOf(page);
    await page.evaluate(() => { window.__st.view = { shown: true, line: "on", on: true, held: false, why: "", since: 0, say: "" }; openSettings("account"); });
    await sleep(150);
    await page.evaluate(() => document.querySelector('#setBody .set-seg[data-seg="sync"] button[data-val="off"]').click());
    await sleep(400);
    const q = await page.evaluate(() => { const b = document.getElementById("eSyncAsk"); return b ? [b.querySelector("h3").textContent, b.querySelector("p").textContent, ...[...b.querySelectorAll("button")].map(x => x.textContent)] : []; });
    const said = await tell(page, { shown: true, line: "on", on: true, held: false, why: "", since: 0, say: "on" });
    await page.close();
    const want = ["Wyłączyć synchronizację?", "Opcja Wszędzie usuwa też zsynchronizowaną kopię; każdy komputer zachowuje własną.", "Wszędzie", "Ten komputer", "Anuluj"];
    const ok = r1 && r1.title === "Synchronizacja między komputerami" && r1.line === "Niedostępna na tym koncie: konto nie ma usługi OneDrive. Na tym komputerze wszystko działa jak dotąd."
      && JSON.stringify(q) === JSON.stringify(want)
      && said.text.replace(/Zamknij$/, "").trim() === "Własne katalogi, zmiany i ustawienia będą teraz dostępne na każdym komputerze, na którym nastąpi zalogowanie. Można to wyłączyć w Koncie.";
    check(ok, "m3 the row, the question and the bubble in the copywriter's Polish", ok ? undefined : { r1, q, said: said.text });
  }

  /* r1: storeRow. */
  {
    const now = Date.UTC(2026, 10, 20), D = 24 * 3600 * 1000;
    const row = o => ST.storeRow(Object.assign({ provider: "microsoft", pol: { on: true, held: false }, look: null, until: now + D, now, signinRefused: false, conflicts: 0, say: "" }, o));
    const cases = [
      [row({ provider: "" }).shown === false, "signed out"],
      [row({ provider: "lab" }).shown === false, "a provider with no folder"],
      [row({}).line === "on", "on"],
      [row({ pol: { on: false, held: false } }).line === "off", "turned off"],
      [row({ pol: { on: false, held: true } }).line === "org-off", "policy off"],
      [row({ look: { state: "unavailable", why: "offline" } }).line === "on", "offline says nothing"],
      [row({ look: { state: "unavailable", why: "no-drive" } }).why === "no-drive", "no drive"],
      [row({ conflicts: 2 }).line === "conflict", "a conflict"],
      [row({ until: now - 2 * D }).line === "on", "paused two days: not yet"],
      [row({ until: now - 3 * D }).line === "paused" && row({ until: now - 3 * D }).since === now - 3 * D, "paused three days"],
      [row({ until: now - 4 * D, signinRefused: true }).line === "on", "a sign-in refusal: the sign-in says it"],
      [row({ say: "on" }).say === "on" && row({ pol: { on: false, held: false }, say: "on" }).say === "", "the say rides on, never off"],
    ];
    const bad = cases.filter(c => !c[0]).map(c => c[1]);
    check(!bad.length, "r1 storeRow's line for each state", bad.length ? bad : undefined);
  }

  /* The plants. */
  const PAGE_PLANT = [") h.storeSaid();", ") void 0;"];
  if (PLANTS_OFF) skip("p c9a the page's word that it showed the bubble taken out turns c9a red");
  else {
    const n = PAGE.split(PAGE_PLANT[0]).length - 1;
    let detail = "the plant's anchor is there " + n + " times";
    if (n === 1) {
      fs.writeFileSync(path.join(lab, "planted.html"), PAGE.split(PAGE_PLANT[0]).join(PAGE_PLANT[1]));
      const r = await firstSignin("planted.html");
      detail = r ? "red: " + r : "still held";
      check(!c9a && !!r && /said again|after two more/.test(r), "p c9a the page's word that it showed the bubble taken out turns c9a red", detail);
    } else check(false, "p c9a the page's word that it showed the bubble taken out turns c9a red", detail);
  }
  if (PLANTS_OFF) skip("p c9d firstSay saying at a look that did not make the store turns c9d red");
  else {
    const before = sha(STORE), text = fs.readFileSync(STORE, "utf8"), from = 'say: look.made === true ? "on" : "", told: true }; /* plant:first-say */';
    let red = false, detail = "the plant's anchor is absent";
    if (text.split(from).length === 2) {
      const dir = path.join(lab, "store-plant");
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "store.cjs"), text.split(from).join('say: "on", told: true }; /* plant:first-say */'));
      try { red = !firstSayHolds(require(path.join(dir, "store.cjs"))); } catch (e) { red = true; }
      detail = red ? "red" : "still held";
    }
    check(red && sha(STORE) === before, "p c9d firstSay saying at a look that did not make the store turns c9d red, and the product file is never written", detail);
  }
}

try { await main(); }
catch (e) { check(false, "run crashed: " + (e && e.stack ? e.stack : e)); }
finally {
  if (browser) await browser.close();
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}
console.log("#counts checks=" + checks + " skipped=" + skipped + " failed=" + fails + " expected=" + EXPECTED);
console.log("RESULT checks=" + checks + " failed=" + fails);
process.exit(fails || checks + skipped !== EXPECTED ? 1 : 0);
