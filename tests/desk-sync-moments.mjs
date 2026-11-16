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
 *       nothing; This computer and Everywhere go to the shell as such; On goes at once, unasked, and where the folder was never
 *       given it is the shell's storeConsent, from an On marked for the trusted click, with no bubble before the provider's page
 *   m3  the row and the question in Polish
 *   r1  storeRow's line for each state
 *   c9k a Start from my account that failed with something kept in the set-aside folder: its own notice, its button
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
const EXPECTED = 51;
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
    window.__st = { view: view, said: 0, sets: [], answers: [], openAsideCalls: [], openAsideResult: true, tell: null };
    window.__sgn = { offered: ["microsoft", "google"], signedIn: "microsoft", code: "7K3MQ9TV2XRBHN4W", seat: "held", at: Date.now(), reached: true };
    window.E_HOST = {
      signinState: () => window.__sgn,
      onSignin: fn => { window.__sgnTell = fn; },
      storeState: () => window.__st.view,
      storeSaid: () => { window.__st.said++; window.__st.view = Object.assign({}, window.__st.view, { say: "" }); },
      storeOpened: () => { window.__st.opened = (window.__st.opened || 0) + 1; },
      storeSet: async w => { window.__st.sets.push(w); return null; },
      storeAnswer: async c => {
        window.__st.answers.push(c);
        if (c === "later") window.__st.view = Object.assign({}, window.__st.view, { askNow: false });
        else if (c === "mine" || c === "start") window.__st.view = { shown: true, line: "on", on: true, held: false, why: "", since: 0, say: window.__st.sayAfter || "" };
        const res = { ok: true, choice: c, folder: c === "start" ? (window.__st.asideFolder || "C:\\Users\\Ada.User\\Set aside\\2026-11-15 18.10") : "", view: window.__st.view };
        setTimeout(() => { window.__st.tell && window.__st.tell(); }, 10);
        return res;
      },
      openSetAside: async (...args) => { window.__st.openAsideCalls.push(args); return window.__st.openAsideResult; },
      storeConsent: async () => { window.__st.sets.push("consent"); return "asked"; },
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

/* The Account row as drawn: its title, small line, and the control beside it. */
const rowOf = page => page.evaluate(() => {
  const r = document.querySelector('#setBody [data-row="sync"]');
  if (!r) return null;
  const btns = [...r.querySelectorAll(".set-seg button")], acts = [...r.querySelectorAll("button:not(.set-seg button)")];
  return { title: (r.querySelector(".set-label") || {}).firstChild ? r.querySelector(".set-label").firstChild.textContent : "", line: (r.querySelector("small") || {}).textContent || "",
    ctl: !btns.length ? (acts.length ? "button:" + acts.map(b => b.textContent).join("|") : "none") : btns.every(b => b.disabled) && r.querySelector(".sgn-lock") ? "fixed" : btns.some(b => b.disabled) ? "half" : "switch",
    on: (r.querySelector(".set-seg button.on") || {}).textContent || "" };
});
/* The row's lines where sync is not running: [what, view, English, Polish, control, provider]; {TIME} is read from the page's own clock. */
const AT = Date.UTC(2026, 10, 16, 13, 7, 41);
const TRUE_LINES = [
  ["a try set, the folder not reached", { line: "again", why: "offline", at: AT }, "Not syncing just now: this computer cannot reach the Microsoft account. Sync tries again at {TIME}, and nothing on this computer is lost.",
    "Synchronizacja chwilowo nie działa: ten komputer nie może połączyć się z kontem Microsoft. Ponowi próbę o {TIME}, a na tym komputerze nic nie ginie.", "switch"],
  ["a try set, the folder not reached, on Google", { line: "again", why: "offline", at: AT }, "Not syncing just now: this computer cannot reach the Google account. Sync tries again at {TIME}, and nothing on this computer is lost.",
    "Synchronizacja chwilowo nie działa: ten komputer nie może połączyć się z kontem Google. Ponowi próbę o {TIME}, a na tym komputerze nic nie ginie.", "switch", "google"],
  ["a try set, the service not reached", { line: "again", why: "unreached", at: AT }, "Not syncing just now: this computer cannot reach our service. Sync tries again at {TIME}, and nothing on this computer is lost.",
    "Synchronizacja chwilowo nie działa: ten komputer nie może połączyć się z naszą usługą. Ponowi próbę o {TIME}, a na tym komputerze nic nie ginie.", "switch"],
  ["a try set, the relay not reached", { line: "again", why: "relay", at: AT }, "Not syncing just now: this computer cannot reach our service. Sync tries again at {TIME}, and nothing on this computer is lost.",
    "Synchronizacja chwilowo nie działa: ten komputer nie może połączyć się z naszą usługą. Ponowi próbę o {TIME}, a na tym komputerze nic nie ginie.", "switch"],
  ["a try set, the service busy", { line: "again", why: "rate", at: AT }, "Not syncing just now: our service is busy. Sync tries again at {TIME}, and nothing on this computer is lost.",
    "Synchronizacja chwilowo nie działa: nasza usługa jest teraz zajęta. Ponowi próbę o {TIME}, a na tym komputerze nic nie ginie.", "switch"],
  ["a try set, its time not told", { line: "again", why: "unreached" }, "Not syncing just now: this computer cannot reach our service. Sync tries again by itself, and nothing on this computer is lost.",
    "Synchronizacja chwilowo nie działa: ten komputer nie może połączyć się z naszą usługą. Sama ponowi próbę, a na tym komputerze nic nie ginie.", "switch"],
  ["the tries spent, the folder not reached", { line: "spent", why: "offline" }, "Not syncing: this computer cannot reach the Microsoft account. Sync tries again within a day, and nothing on this computer is lost.",
    "Synchronizacja nie działa: ten komputer nie może połączyć się z kontem Microsoft. Ponowi próbę w ciągu doby, a na tym komputerze nic nie ginie.", "switch"],
  ["the tries spent, the service busy", { line: "spent", why: "rate" }, "Not syncing: our service is busy. Sync tries again within a day, and nothing on this computer is lost.",
    "Synchronizacja nie działa: nasza usługa jest teraz zajęta. Ponowi próbę w ciągu doby, a na tym komputerze nic nie ginie.", "switch"],
  ["a new store under policy", { line: "anew", held: true }, "Turned off everywhere from another computer. Your organisation keeps sync on for this computer, so a new synced copy starts from what is on it.",
    "Wyłączona wszędzie z innego komputera. Organizacja utrzymuje synchronizację na tym komputerze, więc nowa zsynchronizowana kopia powstaje z jego zawartości.", "fixed"],
  ["signing in refused", { line: "signin-refused" }, "Not syncing while signing in on this computer is refused. Sync runs once signing in works, and nothing on this computer is lost.",
    "Synchronizacja nie działa, dopóki logowanie na tym komputerze jest odrzucane. Ruszy, gdy logowanie się powiedzie, a na tym komputerze nic nie ginie.", "switch"],
  ["a lapse under three days", { line: "lapsed" }, "Not syncing just now. Sync resumes when this computer reaches our service, and nothing on this computer is lost.",
    "Synchronizacja chwilowo nie działa. Zostanie wznowiona, gdy komputer połączy się z naszą usługą, a na tym komputerze nic nie ginie.", "switch"],
  ["the dated pause", { line: "paused", since: Date.UTC(2026, 10, 11, 12) }, "Paused since 11 November. It resumes when this computer reaches our service.",
    "Wstrzymana od 11 listopada. Zostanie wznowiona, gdy komputer połączy się z naszą usługą.", "switch"],
  ["a look running, the first", { line: "first" }, "Connecting for the first time.", "Trwa pierwsze łączenie.", "switch"],
  ["a look running, after one had sync on", { line: "checking" }, "Checking for changes.", "Trwa sprawdzanie zmian.", "switch"],
  ["no look yet in this run", { line: "unconnected" }, "Not connected yet. Sync starts once this computer reaches our service.",
    "Jeszcze bez połączenia. Synchronizacja ruszy, gdy komputer połączy się z naszą usługą.", "switch"],
  ["no look yet in this run, one had sync on before", { line: "resuming" }, "Sync starts again shortly after Etiuda opens.", "Synchronizacja wznowi się chwilę po uruchomieniu Etiudy.", "switch"],
  ...[["signin", "a fresh sign-in"], ["store", "the folder's store"], ["relay", "the relay"]].map(([why, by]) => ["refused for " + by, { line: "refused", why },
    "Not syncing: our service turned down this computer's last request. Sync tries again within a day, and nothing on this computer is lost.",
    "Synchronizacja nie działa: nasza usługa odrzuciła ostatnią prośbę tego komputera. Ponowi próbę w ciągu doby, a na tym komputerze nic nie ginie.", "switch"]),
];
/* m4: every row of TRUE_LINES drawn in English (light) and Polish (dark); answers what differed. */
async function trueLines(pageName) {
  const bad = [];
  for (const [lang, theme] of [["en", "light"], ["pl", "dark"]]) {
    const page = await boot({ page: pageName, lang, theme, view: ON });
    try {
      for (const [name, part, en, pl, ctl, provider] of TRUE_LINES) {
        const view = Object.assign({}, ON, part);
        const time = await page.evaluate((v, p, lang) => {
          window.__sgn.signedIn = p; window.__st.view = v; openSettings("account");
          return v.at ? new Date(v.at).toLocaleTimeString(lang === "pl" ? "pl-PL" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
        }, view, provider || "microsoft", lang);
        await sleep(120);
        const r = await rowOf(page), want = (lang === "pl" ? pl : en).split("{TIME}").join(time);
        const title = lang === "pl" ? "Synchronizacja między komputerami" : "Sync across computers";
        if (!r || r.title !== title || r.line !== want || r.ctl !== ctl) bad.push({ lang, name, got: r && { line: r.line, ctl: r.ctl }, want });
      }
    } finally { await page.close(); }
  }
  return bad;
}

/* m6, answering what differed. */
const HELD_UNGIVEN = { shown: true, line: "ungiven-held", on: false, held: true, why: "", since: 0, say: "" };
async function allowRow(pageName) {
  const bad = [];
  for (const [lang, theme, line, label] of [["en", "light", "Your organisation has turned this on, and Microsoft has not yet let Etiuda use its folder in this account.", "Allow\u2026"],
    ["pl", "dark", "Organizacja włączyła tę funkcję, ale konto Microsoft nie zezwala jeszcze Etiudzie na użycie jej folderu na tym koncie.", "Zezwól\u2026"]]) {
    const page = await boot({ page: pageName, lang, theme, view: HELD_UNGIVEN });
    try {
      await page.evaluate(() => openSettings("account"));
      await sleep(150);
      const r = await rowOf(page);
      const shown = await page.evaluate(() => {
        const b = document.querySelector('#setBody [data-row="sync"] [data-sync-act="allow"]');
        return { sets: window.__st.sets.slice(), marked: !!b && b.getAttribute("data-e-open") === "store-on", type: b ? b.type : "", select: b ? getComputedStyle(b).userSelect : "" };
      });
      if (!r || r.line !== line || r.ctl !== "button:" + label) bad.push({ lang, row: r });
      if (shown.sets.length || !shown.marked || shown.type !== "button") bad.push({ lang, shown });
      if (lang !== "en" || shown.type !== "button") continue;
      const ring = () => page.evaluate(() => { const b = document.activeElement, c = getComputedStyle(b);
        return { visible: b.matches(":focus-visible"), look: [c.outlineStyle, c.outlineWidth, c.outlineColor, c.boxShadow, c.backgroundColor, c.color].join(" "), act: b.getAttribute("data-sync-act") || "" }; });
      const SEL = '#setBody [data-sync-act="allow"]';
      /* The provider's answer held, so the row is not drawn again and the button keeps the focus it was given. */
      await page.evaluate(() => { window.E_HOST.storeConsent = () => { window.__st.sets.push("consent"); return new Promise(() => {}); }; });
      await page.click(SEL);
      await page.mouse.move(2, 2);
      await sleep(200);
      const clicked = await ring();
      const afterClick = await page.evaluate(() => window.__st.sets.slice());
      await page.keyboard.press("Shift");
      await page.evaluate(sel => document.querySelector(sel).focus(), SEL);
      const keyed = await ring();
      await page.keyboard.press("Enter");
      await sleep(150);
      await page.keyboard.press("Space");
      await sleep(150);
      const pressed = await page.evaluate(() => window.__st.sets.slice());
      /* The desk's own ring, read the same way from the Decide button of the account question's row. */
      await page.evaluate(() => { window.__st.view = { shown: true, line: "ask", on: false, held: false, why: "", since: 0, say: "", askNow: false }; openSettings("account"); });
      await sleep(150);
      await page.keyboard.press("Shift");
      await page.evaluate(() => document.querySelector('#setBody [data-sync-act="decide"]').focus());
      const decide = await ring(), decideSelect = await page.evaluate(() => getComputedStyle(document.querySelector('#setBody [data-sync-act="decide"]')).userSelect);
      if (shown.select !== decideSelect) bad.push({ select: { allow: shown.select, decide: decideSelect } });
      if (JSON.stringify(afterClick) !== JSON.stringify(["consent"]) || JSON.stringify(pressed) !== JSON.stringify(["consent", "consent", "consent"])) bad.push({ presses: { afterClick, pressed } });
      if (clicked.visible || clicked.act !== "allow" || !keyed.visible || keyed.act !== "allow" || keyed.look === clicked.look || keyed.look !== decide.look) bad.push({ ring: { clicked, keyed, decide } });
    } finally { await page.close(); }
  }
  return bad;
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
    ["off everywhere, the end still owed", { ...ON, line: "ending", on: false }, "Off everywhere. The synced copy is deleted as soon as this computer reaches our service.", "switch"],
    ["org-off", { ...ON, line: "org-off", on: false, held: true, say: "" }, "Your organisation has not turned this on.", "none"],
    ["unavailable, no OneDrive", { ...ON, line: "unavailable", why: "no-drive" }, "Not available on this account: the account has no OneDrive. Everything works on this computer as before.", "none"],
    ["unavailable, the folder full", { ...ON, line: "unavailable", why: "full" }, "Not available on this account: the account's storage is full. Everything works on this computer as before.", "none"],
    ["unavailable, the organisation's refusal", { ...ON, line: "unavailable", why: "consent" }, "Not available on this account: your organisation has not allowed it; its IT department decides. Everything works on this computer as before.", "none"],
    ["the folder's consent never given", { ...ON, line: "ungiven", on: false }, "Off. Turning it on asks Microsoft to let Etiuda use its folder in this account.", "switch"],
    ["conflict", { ...ON, line: "conflict" }, "Changed on two computers: the newer change is in use, and the older one is kept, so nothing is lost.", "switch"],
    ["paused", { ...ON, line: "paused", since: Date.UTC(2026, 10, 11, 12) }, "Paused since 11 November. It resumes when this computer reaches our service.", "switch"],
    ["the store's room full", { ...ON, line: "full" }, "Sync is full, so new changes stay on this computer until something is removed.", "switch"],
    ["no seat", { ...ON, line: "noseat" }, "Waiting for a seat. Sync resumes when this account holds one again, and nothing on this computer is lost.", "switch"],
    ["held on", { ...ON, held: true }, "Your catalogs, edits and settings on every computer you sign in on.", "fixed"],
  ];
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
    if (!a.b || !a.at || !a.at.ok || a.title !== "Turn off sync?" || a.text !== "Everywhere also deletes the synced copy; each computer keeps its own. A computer signed in on later starts without what is here, unless another computer still syncs it."
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
    await page.evaluate(() => { window.__st.view = Object.assign({}, window.__st.view, { line: "ungiven", on: false }); openSettings("account"); });
    await sleep(150);
    await page.evaluate(() => document.querySelector('#setBody .set-seg[data-seg="sync"] button[data-val="on"]').click());
    await sleep(300);
    const sets2 = await page.evaluate(() => ({ sets: window.__st.sets.slice(), b: !!document.getElementById("eSyncAsk") || !!document.getElementById("eSyncSaid"),
      marked: !!document.querySelector('#setBody .set-seg[data-seg="sync"] button[data-val="on"][data-e-open="store-on"]') }));
    await page.evaluate(() => { window.__st.view = Object.assign({}, window.__st.view, { line: "off", on: false }); openSettings("account"); });
    await sleep(150);
    const plainOn = await page.evaluate(() => !!document.querySelector('#setBody [data-e-open="store-on"]'));
    if (!sets2.marked || plainOn) m2bad.push({ trustedClick: { ungivenMarked: sets2.marked, offMarked: plainOn } });
    if (JSON.stringify(sets2.sets) !== JSON.stringify(["here", "everywhere", "on", "consent"]) || sets2.b || sets.b) m2bad.push({ presses: sets2 });
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
    await page.evaluate(() => { const b = document.getElementById("eSyncSaid"); if (b) b.remove(); });
    const alone = await tell(page, { shown: true, line: "unavailable", on: true, held: false, why: "no-drive", since: 0, say: "no-drive" });
    await page.close();
    const want = ["Wyłączyć synchronizację?", "Opcja Wszędzie usuwa też zsynchronizowaną kopię; każdy komputer zachowuje własną. Komputer, na którym logowanie nastąpi później, zacznie bez tego, co jest tutaj, chyba że inny komputer nadal to synchronizuje.", "Wszędzie", "Ten komputer", "Anuluj"];
    const ok = r1 && r1.title === "Synchronizacja między komputerami" && r1.line === "Niedostępna na tym koncie: konto nie ma usługi OneDrive. Na tym komputerze wszystko działa jak dotąd."
      && JSON.stringify(q) === JSON.stringify(want)
      && said.text.replace(/Zamknij$/, "").trim() === "Własne katalogi, zmiany i ustawienia będą teraz dostępne na każdym komputerze, na którym nastąpi zalogowanie. Można to wyłączyć w Koncie."
      && alone.text.replace(/Zamknij$/, "").trim() === "Synchronizacja między komputerami jest niedostępna na tym koncie: konto nie ma usługi OneDrive. Na tym komputerze wszystko działa jak dotąd.";
    check(ok, "m3 the row, the question and both bubbles (said once, and not available standing alone) in the copywriter's Polish", ok ? undefined : { r1, q, said: said.text, alone: alone.text });
  }

  /* m4: the row's true lines where sync is not running, each in the copywriter's words in English and Polish, {TIME} the page's own clock
     reading of the try's time; with the switch, or what stands in its place. */
  const m4 = await trueLines("etiuda.html");
  check(!m4.length, "m4 the row's lines where sync is not running, in the copywriter's English and Polish, the switch or its stand-in beside each", m4.length ? m4 : undefined);

  /* m6: policy holds sync on and the folder was never allowed: the copywriter's line 6 with its Allow button, English and Polish; showing
     the row asks nothing; a click, Enter and Space each ask the provider once, as the switch's own On does (storeConsent, the button marked
     for the preload's trusted click); its text as selectable as the Decide button's, which is the desk's rule; under the keyboard it shows the
     desk's focus ring, the one the Decide button shows, and none after a click. */
  const m6 = await allowRow("etiuda.html");
  check(!m6.length, "m6 under a held switch with the folder never allowed: line 6 and its Allow button (EN, PL), nothing asked on showing, a click, Enter and Space each asking once, the desk's focus ring under the keyboard only, its text selectable as the desk's buttons are", m6.length ? m6 : undefined);

  /* c9e: account-change question bubble (#eSyncWhose), EN light & PL dark, 440px, hung from #signinBtn, waits while #signinPanel open. */
  const ASK_NOW = { shown: true, line: "ask", on: false, held: false, why: "", since: 0, say: "", askNow: true };
  {
    const bad = [];
    const readWhose = async page => page.evaluate(() => {
      const b = document.getElementById("eSyncWhose");
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const opts = [...b.querySelectorAll(".e-sync-opt")].map(x => ({ bold: (x.querySelector("b") || {}).textContent || "", text: x.textContent }));
      const btns = [...b.querySelectorAll("button")].map(x => ({ id: x.id, text: x.textContent, pri: x.classList.contains("primary") }));
      const lead = b.querySelector("p:not(.e-sync-opt)");
      return { width: Math.round(r.width), at: window.__bubAt(b, document.getElementById("signinBtn")),
        h: (b.querySelector("h3") || {}).textContent || "", p: lead ? lead.textContent : "", opts, btns, cls: b.className };
    });

    const pEn = await boot({ lang: "en", theme: "light", view: ON });
    await tell(pEn, ASK_NOW);
    const en = await readWhose(pEn);
    if (!en || Math.abs(en.width - 440) > 4 || !en.at || !en.at.ok || !/\bbub-ask\b/.test(en.cls)) bad.push({ enGeom: en });
    if (!en || en.h !== "Is what is on this desk yours?"
      || en.p !== "Another account was signed in here before, and its settings, edits and own cards are still on this desk. Nothing syncs until you choose."
      || JSON.stringify(en.opts) !== JSON.stringify([
        { bold: "It is mine", text: "It is mine: it joins what your account syncs." },
        { bold: "Start from my account", text: "Start from my account: this desk takes your account's content; what is here is set aside, not deleted." }
      ])
      || JSON.stringify(en.btns.map(b => [b.text, b.pri])) !== JSON.stringify([["It is mine", false], ["Start from my account", false], ["Not now", true]])) {
      bad.push({ enCopy: en });
    }
    /* Dismissing with Not now answers "later". */
    await pEn.evaluate(() => { const bs = [...document.querySelectorAll("#eSyncWhose button")]; if (bs.length) bs[bs.length - 1].click(); });
    await sleep(200);
    const afterLater = await pEn.evaluate(() => ({ b: !!document.getElementById("eSyncWhose"), answers: window.__st.answers.slice() }));
    if (afterLater.b || JSON.stringify(afterLater.answers) !== JSON.stringify(["later"])) bad.push({ enLater: afterLater });
    await pEn.close();

    /* PL + dark + waits while #signinPanel is open. */
    const pPl = await boot({ lang: "pl", theme: "dark", view: ON });
    await pPl.click("#signinBtn");
    await pPl.waitForFunction(() => { const p = document.getElementById("signinPanel"); return !!p && !p.hidden; }, { timeout: 5000 });
    await tell(pPl, ASK_NOW);
    const whileOpen = await pPl.evaluate(() => !!document.getElementById("eSyncWhose"));
    await pPl.keyboard.press("Escape");
    await sleep(300);
    const pl = await readWhose(pPl);
    if (whileOpen || !pl || Math.abs(pl.width - 440) > 4 || !pl.at || !pl.at.ok) bad.push({ plWait: { whileOpen, pl } });
    if (!pl || pl.h !== "Czy to, co jest na tym stanowisku, należy do tego konta?"
      || pl.p !== "Wcześniej było tu zalogowane inne konto, a jego ustawienia, zmiany i własne karty wciąż są na tym stanowisku. Do czasu wyboru nic nie jest synchronizowane."
      || JSON.stringify(pl.opts) !== JSON.stringify([
        { bold: "Dołącz do konta", text: "Dołącz do konta: to, co tu jest, trafi do synchronizacji konta." },
        { bold: "Zacznij od konta", text: "Zacznij od konta: stanowisko przejmie zawartość konta; obecna zostanie odłożona, nie usunięta." }
      ])
      || JSON.stringify(pl.btns.map(b => [b.text, b.pri])) !== JSON.stringify([["Dołącz do konta", false], ["Zacznij od konta", false], ["Nie teraz", true]])) {
      bad.push({ plCopy: pl });
    }
    await pPl.close();
    check(!bad.length, "c9e account-change bubble opens on askNow (440px, waits for sign-in panel, copywriter's EN light & PL dark)", bad.length ? bad : undefined);
  }

  /* c9f: Settings Account row ("ask") + Decide… button + Escape/Not now -> "later", Mine/Start choices. */
  const checkSettingsAsk = async (pageName) => {
    const p = await boot({ page: pageName, lang: "en", theme: "light", view: Object.assign({}, ASK_NOW, { askNow: false }) });
    const bad = [];
    try {
      await sleep(250);
      const autoOpened = await p.evaluate(() => !!document.getElementById("eSyncWhose"));
      if (autoOpened) bad.push({ autoOpenedOnAskNowFalse: true });
      await p.evaluate(() => openSettings("account"));
      await sleep(150);
      const rowEn = await p.evaluate(() => {
        const s = document.querySelector('#setBody [data-row="sync"]');
        const btn = s ? s.querySelector('[data-sync-act="decide"]') : null;
        return s ? {
          line: ((s.querySelector("small") || {}).textContent || ""),
          seg: !!s.querySelector(".set-seg"), btn: btn ? btn.textContent : ""
        } : null;
      });
      if (!rowEn || rowEn.seg || rowEn.btn !== "Decide\u2026"
        || rowEn.line !== "Waiting for your answer about what is on this desk. Nothing syncs until then.") {
        bad.push({ rowEn });
      }
      await p.evaluate(() => { const b = document.querySelector('#setBody [data-sync-act="decide"]'); if (b) b.click(); });
      await sleep(250);
      const fromRow = await p.evaluate(() => {
        const b = document.getElementById("eSyncWhose"), ctl = document.querySelector('#setBody [data-sync-act="decide"]');
        return { b: !!b, at: b ? window.__bubAt(b, ctl) : null };
      });
      if (!fromRow.b || !fromRow.at || !fromRow.at.ok) bad.push({ fromRow });
      await p.keyboard.press("Escape");
      await sleep(200);
      const esc = await p.evaluate(() => ({ b: !!document.getElementById("eSyncWhose"), answers: window.__st.answers.slice() }));
      if (esc.b || JSON.stringify(esc.answers) !== JSON.stringify(["later"])) bad.push({ esc });
      /* Click It is mine, then Start from my account. */
      await p.evaluate(() => { const b = document.querySelector('#setBody [data-sync-act="decide"]'); if (b) b.click(); });
      await sleep(200);
      await p.evaluate(() => { const bs = [...document.querySelectorAll("#eSyncWhose button")]; if (bs[0]) bs[0].click(); });
      await sleep(250);
      const afterMine = await p.evaluate(() => ({ b: !!document.getElementById("eSyncWhose"), answers: window.__st.answers.slice(),
        seg: !!document.querySelector('#setBody .set-seg[data-seg="sync"]') }));
      if (afterMine.b || JSON.stringify(afterMine.answers) !== JSON.stringify(["later", "mine"]) || !afterMine.seg) bad.push({ afterMine });
      await p.evaluate(() => { window.__st.view = Object.assign({}, { shown: true, line: "ask", on: false, held: false, why: "", since: 0, say: "", askNow: false }); openSettings("account"); });
      await sleep(150);
      await p.evaluate(() => { const b = document.querySelector('#setBody [data-sync-act="decide"]'); if (b) b.click(); });
      await sleep(200);
      await p.evaluate(() => { const bs = [...document.querySelectorAll("#eSyncWhose button")]; if (bs[1]) bs[1].click(); });
      await sleep(250);
      const afterStart = await p.evaluate(() => ({ b: !!document.getElementById("eSyncWhose"), answers: window.__st.answers.slice() }));
      if (afterStart.b || JSON.stringify(afterStart.answers) !== JSON.stringify(["later", "mine", "start"])) bad.push({ afterStart });
    } finally { await p.close(); }
    return bad;
  };
  {
    const bad = await checkSettingsAsk("etiuda.html");
    const pPl = await boot({ lang: "pl", theme: "dark", view: Object.assign({}, ASK_NOW, { askNow: false }) });
    await pPl.evaluate(() => openSettings("account"));
    await sleep(150);
    const rowPl = await pPl.evaluate(() => {
      const s = document.querySelector('#setBody [data-row="sync"]');
      const btn = s ? s.querySelector('[data-sync-act="decide"]') : null;
      return s ? { line: ((s.querySelector("small") || {}).textContent || ""), btn: btn ? btn.textContent : "" } : null;
    });
    await pPl.close();
    if (!rowPl || rowPl.btn !== "Zdecyduj\u2026"
      || rowPl.line !== "Czeka na decyzję w sprawie zawartości tego stanowiska. Do tego czasu nic nie jest synchronizowane.") {
      bad.push({ rowPl });
    }
    check(!bad.length, "c9f Account row Decide button opens bubble from row, Escape/Not now answers later, choices answer mine/start (EN & PL)", bad.length ? bad : undefined);
  }

  /* c9g: choice notices after "mine" and "start" (EN & PL, path with dots & angle brackets, ok:false shows none). */
  const checkChoiceNotices = async (pageName) => {
    const bad = [];
    const readNote = page => page.evaluate(() => {
      const n = document.getElementById("eSyncChoiceNote");
      if (!n) return null;
      const p = n.querySelector("p"), b = p ? p.querySelector("b") : null;
      const btns = [...n.querySelectorAll("button")].map(x => x.textContent);
      return { at: window.__bubAt(n, document.getElementById("signinBtn")), cls: n.className,
        lead: b ? b.textContent : "", full: p ? p.textContent : "", btns,
        tags: n.querySelectorAll("tag,script").length, overflowWrap: p ? getComputedStyle(p).overflowWrap : "" };
    });

    const pEn = await boot({ page: pageName, lang: "en", theme: "light", view: ASK_NOW });
    try {
      await sleep(350);
      await pEn.evaluate(() => { const bs = [...document.querySelectorAll("#eSyncWhose button")]; if (bs[0]) bs[0].click(); });
      await sleep(250);
      const mine = await readNote(pEn);
      if (!mine || !mine.at || !mine.at.ok || mine.full !== "Syncing now, with what was already on this desk."
        || mine.lead !== "Syncing now, with what was already on this desk." || JSON.stringify(mine.btns) !== JSON.stringify(["Dismiss"])) {
        bad.push({ mineEn: mine });
      }
      await pEn.evaluate(() => { const b = document.querySelector("#eSyncChoiceNote button"); if (b) b.click(); });
      await sleep(150);
      if (await pEn.evaluate(() => !!document.getElementById("eSyncChoiceNote"))) bad.push({ mineDismiss: true });

      const folder = "C:\\Users\\Ada.User\\Set aside\\<tag>\\2026-11-15 18.10\\Extra.Subfolder\\LongPathName";
      await pEn.evaluate(f => { window.__st.asideFolder = f; window.__st.view = { shown: true, line: "ask", on: false, held: false, why: "", since: 0, say: "", askNow: true }; window.__st.tell(); }, folder);
      await sleep(350);
      await pEn.evaluate(() => { const bs = [...document.querySelectorAll("#eSyncWhose button")]; if (bs[1]) bs[1].click(); });
      await sleep(250);
      const start = await readNote(pEn);
      if (!start || !start.at || !start.at.ok || start.tags !== 0
        || start.lead !== "This desk now has your account's content."
        || start.full !== "This desk now has your account's content. What was here before is kept on this computer, in Etiuda's \"Set aside\" folder, and is never uploaded."
        || start.full.includes(folder)
        || JSON.stringify(start.btns) !== JSON.stringify(["Open this folder", "Dismiss"])) {
        bad.push({ startEn: start });
      }
      /* Failed answer shows no notice. */
      await pEn.evaluate(() => {
        const prev = window.E_HOST.storeAnswer;
        window.E_HOST.storeAnswer = async c => ({ ok: false, choice: c, folder: "", view: { shown: true, line: "ask", on: false, held: false, why: "", since: 0, say: "", askNow: false } });
        window.__st._prev = prev;
        window.__st.view = { shown: true, line: "ask", on: false, held: false, why: "", since: 0, say: "", askNow: true };
        window.__st.tell();
      });
      await sleep(350);
      await pEn.evaluate(() => { const n = document.getElementById("eSyncChoiceNote"); if (n) n.remove(); const bs = [...document.querySelectorAll("#eSyncWhose button")]; if (bs[1]) bs[1].click(); });
      await sleep(200);
      if (await pEn.evaluate(() => !!document.getElementById("eSyncChoiceNote"))) bad.push({ failedShowed: true });
    } finally { await pEn.close(); }

    const pPl = await boot({ page: pageName, lang: "pl", theme: "dark", view: ASK_NOW });
    try {
      await sleep(350);
      await pPl.evaluate(() => { const bs = [...document.querySelectorAll("#eSyncWhose button")]; if (bs[0]) bs[0].click(); });
      await sleep(250);
      const minePl = await readNote(pPl);
      if (!minePl || !minePl.at || !minePl.at.ok || minePl.full !== "Synchronizacja trwa, razem z tym, co już było na tym stanowisku."
        || JSON.stringify(minePl.btns) !== JSON.stringify(["Zamknij"])) {
        bad.push({ minePl });
      }
      const plFolder = "D:\\Dane\\Jan.Kowalski\\Set aside\\2026-11-15 18.10";
      await pPl.evaluate(f => { window.__st.asideFolder = f; window.__st.view = { shown: true, line: "ask", on: false, held: false, why: "", since: 0, say: "", askNow: true }; window.__st.tell(); }, plFolder);
      await sleep(350);
      await pPl.evaluate(() => { const bs = [...document.querySelectorAll("#eSyncWhose button")]; if (bs[1]) bs[1].click(); });
      await sleep(250);
      const startPl = await readNote(pPl);
      if (!startPl || !startPl.at || !startPl.at.ok
        || startPl.lead !== "To stanowisko ma teraz zawartość tego konta."
        || startPl.full !== "To stanowisko ma teraz zawartość tego konta. Poprzednia zawartość jest zachowana na tym komputerze, w folderze Etiudy o nazwie Set aside, i nigdy nie jest wysyłana."
        || startPl.full.includes(plFolder)
        || JSON.stringify(startPl.btns) !== JSON.stringify(["Otwórz ten folder", "Zamknij"])) {
        bad.push({ startPl });
      }
    } finally { await pPl.close(); }
    return bad;
  };
  {
    const bad = await checkChoiceNotices("etiuda.html");
    check(!bad.length, "c9g choice notices after It is mine and Start from my account (EN light & PL dark, Open this folder button, no path in text)", bad.length ? bad : undefined);
  }

  /* c9h: if firstSay (eSyncSaid) fires while #eSyncChoiceNote is open, it hangs cleanly without overlapping it. */
  {
    const p = await boot({ lang: "en", theme: "light", view: ASK_NOW });
    await sleep(350);
    await p.evaluate(() => { window.__st.sayAfter = "on"; const bs = [...document.querySelectorAll("#eSyncWhose button")]; if (bs[1]) bs[1].click(); });
    await sleep(350);
    const stacked = await p.evaluate(() => {
      const n = document.getElementById("eSyncChoiceNote"), s = document.getElementById("eSyncSaid");
      if (!n || !s) return { hasNote: !!n, hasSaid: !!s };
      const rn = n.getBoundingClientRect(), rs = s.getBoundingClientRect();
      const overlap = !(rs.right <= rn.left || rs.left >= rn.right || rs.bottom <= rn.top || rs.top >= rn.bottom);
      return { hasNote: true, hasSaid: true, overlap, noteAt: window.__bubAt(n, document.getElementById("signinBtn")), saidAtNote: window.__bubAt(s, n) };
    });
    await p.evaluate(() => { const b = document.querySelector("#eSyncChoiceNote button.primary"); if (b) b.click(); });
    await sleep(200);
    const afterDismiss = await p.evaluate(() => {
      const n = document.getElementById("eSyncChoiceNote"), s = document.getElementById("eSyncSaid");
      return { note: !!n, said: !!s, saidAtBtn: s ? window.__bubAt(s, document.getElementById("signinBtn")) : null };
    });
    await p.close();
    const ok = stacked.hasNote && stacked.hasSaid && !stacked.overlap && stacked.noteAt && stacked.noteAt.ok
      && stacked.saidAtNote && stacked.saidAtNote.ok && !afterDismiss.note && afterDismiss.said && afterDismiss.saidAtBtn && afterDismiss.saidAtBtn.ok;
    check(ok, "c9h firstSay firing beside the choice notice stacks below it without overlap and re-anchors on Dismiss", ok ? undefined : { stacked, afterDismiss });
  }

  /* c9i: Open this folder calls E_HOST.openSetAside with no arguments, and shows a refusal toast when the folder is gone. */
  const checkOpenSetAside = async pageName => {
    const p = await boot({ page: pageName, lang: "en", theme: "light", view: ASK_NOW });
    try {
      await sleep(350);
      await p.evaluate(() => { const bs = [...document.querySelectorAll("#eSyncWhose button")]; if (bs[1]) bs[1].click(); });
      await sleep(250);
      await p.evaluate(() => { const b = document.querySelector("#eSyncChoiceNote button:not(.primary)"); if (b) b.click(); });
      await sleep(150);
      const calls = await p.evaluate(() => window.__st.openAsideCalls);
      await p.evaluate(() => { window.__st.openAsideResult = { ok: false, why: "gone" }; const b = document.querySelector("#eSyncChoiceNote button:not(.primary)"); if (b) b.click(); });
      await sleep(200);
      const refusal = await p.evaluate(() => {
        const el = document.getElementById("toast");
        return { shown: !!(el && el.classList.contains("show")), refusal: !!(el && el.classList.contains("refusal")), text: el ? (el.textContent || "").trim() : "", calls: window.__st.openAsideCalls.length };
      });
      return { calls, refusal };
    } finally { await p.close(); }
  };
  {
    const r = await checkOpenSetAside("etiuda.html");
    const ok = Array.isArray(r.calls) && r.calls.length === 1 && r.calls[0].length === 0
      && r.refusal.calls === 2 && r.refusal.shown && r.refusal.refusal && r.refusal.text.length > 0;
    check(ok, "c9i Open this folder calls openSetAside with no args and shows a refusal toast when the folder is gone", ok ? undefined : r);
  }

  /* c9j: Open this folder refusal toasts say the copywriter's words per reason (gone vs could-not-open) in EN and PL, never the team's-folder line. */
  const checkOpenSetAsideRefusal = async pageName => {
    const want = {
      en: {
        gone: "That folder is no longer where it was kept, so nothing was opened.",
        "could-not-open": "This computer did not open the folder just now. Pressing the button again tries again.",
      },
      pl: {
        gone: "Tego folderu nie ma już tam, gdzie go zachowano, więc niczego nie otwarto.",
        "could-not-open": "Ten komputer nie otworzył teraz folderu. Można spróbować ponownie, klikając przycisk jeszcze raz.",
      },
    };
    const bad = [];
    for (const [lang, theme] of [["en", "light"], ["pl", "dark"]]) {
      const p = await boot({ page: pageName, lang, theme, view: ASK_NOW });
      try {
        await sleep(350);
        await p.evaluate(() => { const bs = [...document.querySelectorAll("#eSyncWhose button")]; if (bs[1]) bs[1].click(); });
        await sleep(250);
        for (const why of ["gone", "could-not-open"]) {
          await p.evaluate(w => {
            const el = document.getElementById("toast");
            if (el) { el.className = "toast"; el.textContent = ""; }
            window.__st.openAsideResult = { ok: false, why: w };
            const b = document.querySelector("#eSyncChoiceNote button:not(.primary)");
            if (b) b.click();
          }, why);
          await sleep(200);
          const got = await p.evaluate(() => {
            const el = document.getElementById("toast");
            return { shown: !!(el && el.classList.contains("show")), refusal: !!(el && el.classList.contains("refusal")), text: el ? (el.textContent || "").trim() : "" };
          });
          if (!got.shown || !got.refusal || got.text !== want[lang][why]
            || /team's folder|folderu zespołu|same link|odnośnik/i.test(got.text)) {
            bad.push({ lang, why, got, expected: want[lang][why] });
          }
        }
      } finally { await p.close(); }
    }
    return bad;
  };
  {
    const bad = await checkOpenSetAsideRefusal("etiuda.html");
    check(!bad.length, "c9j Open this folder refusal lines distinguish gone and could-not-open in EN and PL without the team's-folder text", bad.length ? bad : undefined);
  }

  /* c9k: a Start from my account that failed with something kept in the set-aside folder: the notice of its own (three sentences), its
     Open this folder button calling openSetAside with no arguments, no path in the text (EN light & PL dark). */
  const checkKeptNotice = async pageName => {
    const want = {
      en: { lead: "Starting from your account did not finish, and nothing was lost.",
        text: "Starting from your account did not finish, and nothing was lost. What could not be put back is kept on this computer, in Etiuda's \"Set aside\" folder, and is never uploaded. The question about what is on this desk still waits for your answer.", btns: ["Open this folder", "Dismiss"] },
      pl: { lead: "Nie udało się dokończyć rozpoczęcia od konta, ale nic nie zginęło.",
        text: "Nie udało się dokończyć rozpoczęcia od konta, ale nic nie zginęło. To, czego nie dało się przywrócić, jest zachowane na tym komputerze, w folderze Etiudy o nazwie Set aside, i nigdy nie jest wysyłane. Pytanie o zawartość tego stanowiska nadal czeka na odpowiedź.", btns: ["Otwórz ten folder", "Zamknij"] },
    };
    const folder = "C:\\Users\\Ada.User\\Set aside\\2026-11-15 18.10";
    const bad = [];
    for (const [lang, theme] of [["en", "light"], ["pl", "dark"]]) {
      const p = await boot({ page: pageName, lang, theme, view: ASK_NOW });
      try {
        await sleep(350);
        await p.evaluate(f => {
          window.E_HOST.storeAnswer = async c => { window.__st.answers.push(c);
            return { ok: false, choice: c, folder: f, kept: true, view: { shown: true, line: "ask", on: false, held: false, why: "", since: 0, say: "", askNow: false } }; };
          const bs = [...document.querySelectorAll("#eSyncWhose button")]; if (bs[1]) bs[1].click();
        }, folder);
        await sleep(250);
        const got = await p.evaluate(() => {
          const n = document.getElementById("eSyncChoiceNote");
          if (!n) return null;
          const q = n.querySelector("p"), b = q ? q.querySelector("b") : null;
          return { at: window.__bubAt(n, document.getElementById("signinBtn")), lead: b ? b.textContent : "", full: q ? q.textContent : "",
            btns: [...n.querySelectorAll("button")].map(x => x.textContent), answers: window.__st.answers.slice() };
        });
        await p.evaluate(() => { const b = document.querySelector("#eSyncChoiceNote button:not(.primary)"); if (b) b.click(); });
        await sleep(150);
        const calls = await p.evaluate(() => window.__st.openAsideCalls);
        if (!got || !got.at || !got.at.ok || got.lead !== want[lang].lead || got.full !== want[lang].text || got.full.includes(folder)
          || JSON.stringify(got.btns) !== JSON.stringify(want[lang].btns) || JSON.stringify(got.answers) !== JSON.stringify(["start"])
          || !Array.isArray(calls) || calls.length !== 1 || calls[0].length !== 0) bad.push({ lang, got, calls });
      } finally { await p.close(); }
    }
    return bad;
  };
  {
    const bad = await checkKeptNotice("etiuda.html");
    check(!bad.length, "c9k a Start from my account that failed with something kept in the set-aside folder says its own notice (not finished, nothing lost, where it is, the question still waits), with Open this folder (EN & PL, no path in text)", bad.length ? bad : undefined);
  }

  /* c8o: the conflict's notice ends once opened. Account painted with the row on tells the shell nothing; painted with the conflict line, the
     line shown, it tells the shell once that the notice was opened, by its no-argument call. */
  const checkOpened = async name => {
    const p = await boot({ page: name, view: ON });
    try {
      await p.evaluate(() => openSettings("account"));
      await sleep(120);
      const quiet = await p.evaluate(() => window.__st.opened || 0);
      await p.evaluate(() => { window.__st.view = { shown: true, line: "conflict", on: true, held: false, why: "", since: 0, say: "" }; openSettings("account"); });
      await sleep(120);
      const r = await rowOf(p), told = await p.evaluate(() => window.__st.opened || 0);
      return { quiet, line: r && r.line, told, ok: quiet === 0 && !!r && r.line === "Changed on two computers: the newer change is in use, and the older one is kept, so nothing is lost." && told === 1 };
    } finally { await p.close(); }
  };
  {
    const r = await checkOpened("etiuda.html");
    check(r.ok, "c8o Account painted with the conflict line, the line shown, tells the shell once that the notice was opened; painted with the row on, nothing", r.ok ? undefined : r);
  }

  /* r1: storeRow, and roomNext. */
  const rowBad = ST => {
    const now = Date.UTC(2026, 10, 20), D = 24 * 3600 * 1000;
    const row = o => ST.storeRow(Object.assign({ provider: "microsoft", pol: { on: true, held: false }, look: { state: "on" }, ever: true, until: now + D, now, signinRefused: false, conflicts: 0, say: "" }, o));
    const cases = [
      [row({ provider: "" }).shown === false, "signed out"],
      [row({ provider: "lab" }).shown === false, "a provider with no folder"],
      [row({}).line === "on", "on"],
      [row({ pol: { on: false, held: false } }).line === "off", "turned off"],
      [row({ pol: { on: false, held: true } }).line === "org-off", "policy off"],
      [row({ pol: { on: false, held: false }, owed: true }).line === "ending" && row({ pol: { on: false, held: true }, owed: true }).line === "org-off", "off everywhere, the end owed"],
      [(r => r.line === "spent" && r.why === "offline" && !r.at && r.on === true)(row({ look: { state: "unavailable", why: "offline" } })), "the folder not reached, no try set: spent, its reason"],
      [(r => r.line === "again" && r.why === "offline" && r.at === now + 60e3)(row({ look: { state: "unavailable", why: "offline" }, again: now + 60e3 })), "the folder not reached, a try set: again, its reason and time"],
      [["unreached", "relay", "rate"].every(why => (r => r.line === "again" && r.why === why && r.at === now + 120e3)(row({ look: { state: "paused", why }, again: now + 120e3 }))
        && row({ look: { state: "paused", why } }).line === "spent"), "the service or the relay not reached, or busy: again while a try is set, else spent"],
      [[["signin", "signin"], ["store", "store"], ["seat-lapsed", "relay"], ["bad-signature", "relay"], ["unavailable", "relay"]].every(([why, told]) => (r => r.line === "refused" && r.why === told && !r.at && r.on === true)(row({ look: { state: "paused", why }, again: 0 }))),
        "refused by the service or the relay: refused, the relay's own reason told only as relay"],
      [(r => r.line === "first" && r.on === true)(row({ looking: true, ever: false, look: null, until: 0 })), "a look running, none had sync on here before: first"],
      [(r => r.line === "anew" && r.held === true && r.on === true)(row({ pol: { on: true, held: true }, anew: true })) && row({ anew: true, looking: true, look: null }).line === "anew"
        && row({ anew: true, look: { state: "paused", why: "unreached" } }).line === "spent", "a new store made over an ended mark under policy: anew while its look runs or is on, not once a look fails"],
      [row({ looking: true }).line === "checking" && row({ looking: true, look: { state: "paused", why: "unreached" } }).line === "checking", "a look running, one had sync on before: checking"],
      [row({ look: null, ever: false, until: 0 }).line === "unconnected" && row({ look: null, ever: false }).line === "unconnected" && row({ look: null }).line === "resuming" && row({ look: null, ever: true, until: 0 }).line === "resuming",
        "no look yet in this run: unconnected where none had sync on here, resuming where one had"],
      [row({ look: null, until: now - 4 * D }).line === "paused", "no look yet in this run, the certificate lapsed three days or more: the dated pause"],
      [row({ look: { state: "unavailable", why: "no-drive" } }).why === "no-drive", "no drive"],
      [row({ look: { state: "unavailable", why: "consent" } }).line === "unavailable", "the organisation's refusal: not available"],
      [(r => r.line === "ungiven" && r.on === false && r.say === "")(row({ look: { state: "unavailable", why: "ungiven" }, say: "ungiven" })), "the folder's consent never given: off with its switch, nothing said"],
      [(r => r.line === "ungiven-held" && r.on === false && r.held === true && r.say === "")(row({ pol: { on: true, held: true }, look: { state: "unavailable", why: "ungiven" }, say: "ungiven" })), "the folder's consent never given, policy holding sync on: ungiven-held, nothing said"],
      [row({ pol: { on: false, held: true }, look: { state: "unavailable", why: "ungiven" } }).line === "org-off", "the folder's consent never given, policy holding sync off: policy's off"],
      [row({ conflicts: 2 }).line === "conflict", "a conflict"],
      [row({ until: now - 2 * D }).line === "lapsed" && row({ until: now - 2 * D, look: null }).line === "lapsed", "a lapse under three days: lapsed, after a look or before one"],
      [row({ until: now - 3 * D }).line === "paused" && row({ until: now - 3 * D }).since === now - 3 * D, "paused three days"],
      [row({ until: now - 4 * D, signinRefused: true }).line === "signin-refused" && row({ signinRefused: true, look: null }).line === "signin-refused"
        && row({ signinRefused: true, look: { state: "unavailable", why: "offline" } }).line === "signin-refused", "signing in refused, no look on a current certificate: signin-refused"],
      [row({ signinRefused: true }).line === "on", "signing in refused, the look on and its certificate current: sync runs on it"],
      [row({ say: "on" }).say === "on" && row({ pol: { on: false, held: false }, say: "on" }).say === "", "the say rides on, never off"],
      [(r => r.line === "noseat" && r.on === true)(row({ seatless: true, signinRefused: true, until: now - 4 * D, conflicts: 1 })), "no seat: said over a conflict and a lapse, the switch on"],
      [row({ seatless: true, look: { state: "unavailable", why: "no-drive" } }).line === "unavailable" && row({ seatless: true, pol: { on: false, held: false } }).line === "off", "no seat: under a folder not reached and the person's own off"],
      [(r => r.line === "full" && r.on === true)(row({ full: true })), "the store's room full, the switch on"],
      [row({ full: true, conflicts: 1 }).line === "full" && row({ full: true, until: now - 3 * D }).line === "paused" && row({ full: true, pol: { on: false, held: false } }).line === "off", "full: over a conflict, under a pause and off"],
      [row({ conflicts: 1, until: now - 3 * D }).line === "paused" && row({ conflicts: 1, until: now - 2 * D }).line === "lapsed", "a conflict: under a pause of any length"],
      [((r) => r.line === "ask" && r.on === false && r.held === false && r.askNow === true)(row({ ask: true, askNow: true, pol: { on: false, held: false } })), "ask: waiting for account-change answer even with person off"],
      [row({ ask: true, askNow: true, pol: { on: false, held: true } }).line === "org-off", "ask: under policy off"],
      [ST.roomNext(false, "team-size") === true && ST.roomNext(true, "rate") === true && ST.roomNext(false, "rate") === false && ST.roomNext(true, "") === false, "roomNext: full at team-size, empty at a taken write, else as it was"],
    ];
    return cases.filter(c => !c[0]).map(c => c[1]);
  };
  {
    const bad = rowBad(ST);
    check(!bad.length, "r1 storeRow's line for each state, and the store's room", bad.length ? bad : undefined);
  }
  /* r2: the order the lines are said in, each pair as [what, the state with both, the line said, the same without the first, the line then
     said]; the copywriter's rule among them, that while sync is stopped the stopped line is said over a conflict or the room full. */
  const orderBad = ST => {
    const now = Date.UTC(2026, 10, 20), D = 24 * 3600 * 1000;
    const row = o => ST.storeRow(Object.assign({ provider: "microsoft", pol: { on: true, held: false }, look: { state: "on" }, ever: true, until: now + D, now, signinRefused: false, conflicts: 0, say: "" }, o));
    const offline = { look: { state: "unavailable", why: "offline" } }, again = Object.assign({ again: now + 60e3 }, offline);
    const pairs = [
      ["the person's off over a passing failure", Object.assign({ pol: { on: false, held: false } }, again), "off", again, "again"],
      ["no seat over a passing failure", Object.assign({ seatless: true }, again), "noseat", again, "again"],
      ["a passing failure over a conflict", Object.assign({ conflicts: 2 }, again), "again", { conflicts: 2 }, "conflict"],
      ["a passing failure over the room full", Object.assign({ full: true }, again), "again", { full: true }, "full"],
      ["spent over a conflict", Object.assign({ conflicts: 2 }, offline), "spent", { conflicts: 2 }, "conflict"],
      ["spent over the room full", Object.assign({ full: true }, offline), "spent", { full: true }, "full"],
      ["a passing failure over the dated pause", Object.assign({ until: now - 4 * D }, again), "again", { until: now - 4 * D }, "paused"],
      ["no seat over a new store under policy", { seatless: true, anew: true }, "noseat", { anew: true }, "anew"],
      ["a new store under policy over a look running", { anew: true, looking: true }, "anew", { looking: true }, "checking"],
      ["a new store under policy over a conflict", { anew: true, conflicts: 1 }, "anew", { conflicts: 1 }, "conflict"],
      ["a passing failure over a new store under policy", Object.assign({ anew: true }, again), "again", { anew: true }, "anew"],
      ["no seat over a look running", { seatless: true, looking: true }, "noseat", { looking: true }, "checking"],
      ["a look running over a passing failure", Object.assign({ looking: true }, again), "checking", again, "again"],
      ["a look running over a refusal", { looking: true, look: { state: "paused", why: "store" } }, "checking", { look: { state: "paused", why: "store" } }, "refused"],
      ["a look running over a conflict", { looking: true, conflicts: 1 }, "checking", { conflicts: 1 }, "conflict"],
      ["the dated pause over no look yet", { look: null, until: now - 4 * D }, "paused", { look: null }, "resuming"],
      ["no look yet over a conflict", { look: null, conflicts: 1 }, "resuming", { conflicts: 1 }, "conflict"],
      ["a look running over a refused sign-in", { looking: true, signinRefused: true, look: null }, "checking", { signinRefused: true, look: null }, "signin-refused"],
      ["a refused sign-in over a passing failure", Object.assign({ signinRefused: true }, again), "signin-refused", again, "again"],
      ["a refused sign-in over a refusal", { signinRefused: true, look: { state: "paused", why: "signin" } }, "signin-refused", { look: { state: "paused", why: "signin" } }, "refused"],
      ["a lapse over a conflict", { until: now - D, conflicts: 1 }, "lapsed", { conflicts: 1 }, "conflict"],
      ["a lapse over the room full", { until: now - D, full: true }, "lapsed", { full: true }, "full"],
      ["a lapse over no look yet", { until: now - D, look: null }, "lapsed", { look: null }, "resuming"],
      ["a passing failure over a lapse", Object.assign({ until: now - D }, again), "again", { until: now - D }, "lapsed"],
      ["the folder's consent never given under policy over no seat", { pol: { on: true, held: true }, seatless: true, look: { state: "unavailable", why: "ungiven" } }, "ungiven-held", { pol: { on: true, held: true }, seatless: true }, "noseat"],
      ["no seat over a refusal", { seatless: true, look: { state: "paused", why: "store" } }, "noseat", { look: { state: "paused", why: "store" } }, "refused"],
      ["a refusal over a conflict", { conflicts: 1, look: { state: "paused", why: "signin" } }, "refused", { conflicts: 1 }, "conflict"],
      ["a refusal over the room full", { full: true, look: { state: "paused", why: "seat-lapsed" } }, "refused", { full: true }, "full"],
      ["a refusal over the dated pause", { until: now - 4 * D, look: { state: "paused", why: "store" } }, "refused", { until: now - 4 * D }, "paused"],
    ];
    return pairs.filter(([, both, top, rest, next]) => row(both).line !== top || row(rest).line !== next).map(([what, both, , rest]) => what + ": " + row(both).line + " then " + row(rest).line);
  };
  {
    const bad = orderBad(ST);
    check(!bad.length, "r2 the lines' order, the stopped line said over a conflict and the room full", bad.length ? bad : undefined);
  }
  /* The row's lines, each lifted or moved in a copy of store.cjs, turn r1 red; the product file is never written. */
  for (const [tag, what] of [["row-ask", "the hold's question read as off"], ["row-noseat", "no seat read as on"], ["row-full", "the room full read as on"],
    ["row-conflict", "the conflict said first, over a pause and the room full"], ["row-passing", "a passing failure read as on"], ["row-refused", "a refusal read as on"], ["row-looking", "a look running read as on"],
    ["row-unconnected", "no look yet read as on"], ["row-resuming", "no look yet, after sync ran here, read as never connected"], ["row-no-date", "no certificate's end read as the first of January"],
    ["row-signin-refused", "a refused sign-in read as on"], ["row-lapsed", "a lapse under three days read as on"],
    ["row-ungiven", "the folder never allowed read alike whether or not policy holds the switch"], ["row-anew", "a new store under policy read as on"]]) {
    const line = "p r1 " + tag + " lifted in a copy of store.cjs turns r1 red (" + what + "), and the product file is never written";
    if (PLANTS_OFF) { skip(line); continue; }
    const before = sha(STORE), text = fs.readFileSync(STORE, "utf8"), lines = text.split("\n"), at = lines.findIndex(l => l.indexOf("/* plant:" + tag + " */") >= 0);
    let red = false, detail = "the plant's anchor is absent";
    if (at >= 0) {
      if (tag === "row-full") lines[at] = lines[at].replace('o.full === true ? "full" : "on"', '"on"');
      else if (tag === "row-ungiven") lines[at] = lines[at].replace('pol.held === true ? "ungiven-held" : "ungiven"', '"ungiven"');
      else if (tag === "row-no-date") lines[at] = lines[at].replace("Number(o.until) > 0 ? pausedLine({ until: o.until }, o.now, o.signinRefused) : null", "pausedLine({ until: o.until }, o.now, o.signinRefused)");
      else if (tag === "row-conflict") { const moved = lines.splice(at, 1)[0].replace(" && o.full !== true", ""); lines.splice(lines.findIndex(l => l.indexOf("const p = pausedLine(") >= 0), 0, moved); }
      else lines.splice(at, 1);
      const dir = path.join(lab, "store-plant-" + tag);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "store.cjs"), lines.join("\n"));
      try { red = rowBad(require(path.join(dir, "store.cjs"))).length > 0; } catch (e) { red = true; }
      detail = red ? "red" : "still held";
    }
    check(red && sha(STORE) === before, line, detail);
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
  if (PLANTS_OFF) skip("p c9f Escape or Not now leaving storeAnswer(\"later\") out turns c9f red");
  else {
    const LATER_PLANT = ['if (later) syncAnswer("later");', 'void 0;'];
    const n = PAGE.split(LATER_PLANT[0]).length - 1;
    let detail = "the plant's anchor is there " + n + " times";
    if (n === 1) {
      fs.writeFileSync(path.join(lab, "planted-whose.html"), PAGE.split(LATER_PLANT[0]).join(LATER_PLANT[1]));
      const bad = await checkSettingsAsk("planted-whose.html");
      const escHit = bad.some(x => x.esc);
      detail = escHit ? "red: " + JSON.stringify(bad.find(x => x.esc)) : "still held: " + JSON.stringify(bad);
      check(escHit, "p c9f Escape or Not now leaving storeAnswer(\"later\") out turns c9f red", detail);
    } else check(false, "p c9f Escape or Not now leaving storeAnswer(\"later\") out turns c9f red", detail);
  }
  if (PLANTS_OFF) skip("p c9g leaving choice notice out turns c9g red");
  else {
    const NOTE_PLANT = ['if (res && res.ok) syncChoiceNotice(res.choice);', 'void 0;'];
    const n = PAGE.split(NOTE_PLANT[0]).length - 1;
    let detail = "the plant's anchor is there " + n + " times";
    if (n === 1) {
      fs.writeFileSync(path.join(lab, "planted-note.html"), PAGE.split(NOTE_PLANT[0]).join(NOTE_PLANT[1]));
      const bad = await checkChoiceNotices("planted-note.html");
      detail = bad.length ? "red: " + JSON.stringify(bad[0]) : "still held";
      check(bad.length > 0, "p c9g leaving choice notice out turns c9g red", detail);
    } else check(false, "p c9g leaving choice notice out turns c9g red", detail);
  }
  if (PLANTS_OFF) skip("p c9i leaving eOpenSetAside out turns c9i red");
  else {
    const ASIDE_PLANT = ['onClick: () => eOpenSetAside()', 'onClick: () => {}'];
    const n = PAGE.split(ASIDE_PLANT[0]).length - 1;
    let detail = "the plant's anchor is there " + n + " times";
    if (n === 1) {
      fs.writeFileSync(path.join(lab, "planted-aside.html"), PAGE.split(ASIDE_PLANT[0]).join(ASIDE_PLANT[1]));
      const r = await checkOpenSetAside("planted-aside.html");
      const red = !(r.calls && r.calls.length);
      detail = red ? "red: calls=" + JSON.stringify(r.calls) : "still held";
      check(red, "p c9i leaving eOpenSetAside out turns c9i red", detail);
    } else check(false, "p c9i leaving eOpenSetAside out turns c9i red", detail);
  }
  if (PLANTS_OFF) skip("p c9j saying one refusal line for both reasons turns c9j red");
  else {
    const REFUSAL_PLANT = [
      'else if (why === "could-not-open") toastRefusal(t("This computer did not open the folder just now. Pressing the button again tries again."));',
      'else if (why === "could-not-open") toastRefusal(t("That folder is no longer where it was kept, so nothing was opened."));',
    ];
    const n = PAGE.split(REFUSAL_PLANT[0]).length - 1;
    let detail = "the plant's anchor is there " + n + " times";
    if (n === 1) {
      fs.writeFileSync(path.join(lab, "planted-aside-refusal.html"), PAGE.split(REFUSAL_PLANT[0]).join(REFUSAL_PLANT[1]));
      const bad = await checkOpenSetAsideRefusal("planted-aside-refusal.html");
      detail = bad.length ? "red: " + JSON.stringify(bad[0]) : "still held";
      check(bad.length > 0, "p c9j saying one refusal line for both reasons turns c9j red", detail);
    } else check(false, "p c9j saying one refusal line for both reasons turns c9j red", detail);
  }
  if (PLANTS_OFF) skip("p c9k leaving the kept answer's notice out turns c9k red");
  else {
    const KEPT_PLANT = ['if (res && !res.ok && res.kept === true) syncChoiceNotice("kept");', 'void 0;'];
    const n = PAGE.split(KEPT_PLANT[0]).length - 1;
    let detail = "the plant's anchor is there " + n + " times";
    if (n === 1) {
      fs.writeFileSync(path.join(lab, "planted-kept.html"), PAGE.split(KEPT_PLANT[0]).join(KEPT_PLANT[1]));
      const bad = await checkKeptNotice("planted-kept.html");
      detail = bad.length ? "red: " + JSON.stringify(bad[0]) : "still held";
      check(bad.length > 0, "p c9k leaving the kept answer's notice out turns c9k red", detail);
    } else check(false, "p c9k leaving the kept answer's notice out turns c9k red", detail);
  }
  if (PLANTS_OFF) skip("p m2 the turn-off question's third sentence taken out of the page turns m2 red");
  else {
    const Q_PLANT = [" A computer signed in on later starts without what is here, unless another computer still syncs it.\"))", "\"))"];
    const n = PAGE.split(Q_PLANT[0]).length - 1;
    let detail = "the plant's anchor is there " + n + " times";
    if (n === 1) {
      fs.writeFileSync(path.join(lab, "planted-question.html"), PAGE.split(Q_PLANT[0]).join(Q_PLANT[1]));
      const p = await boot({ page: "planted-question.html", view: ON });
      let text = "";
      try {
        await p.evaluate(() => openSettings("account"));
        await sleep(150);
        await p.evaluate(() => document.querySelector('#setBody .set-seg[data-seg="sync"] button[data-val="off"]').click());
        await sleep(400);
        text = await p.evaluate(() => { const b = document.getElementById("eSyncAsk"); return b ? b.querySelector("p").textContent : ""; });
      } finally { await p.close(); }
      const red = text !== "Everywhere also deletes the synced copy; each computer keeps its own. A computer signed in on later starts without what is here, unless another computer still syncs it.";
      detail = red ? "red: " + text : "still held";
      check(red, "p m2 the turn-off question's third sentence taken out of the page turns m2 red", detail);
    } else check(false, "p m2 the turn-off question's third sentence taken out of the page turns m2 red", detail);
  }
  if (PLANTS_OFF) skip("p c8o the page's word that the conflict line was opened taken out turns c8o red");
  else {
    const OPENED_PLANT = ["box.querySelector('[data-row=\"sync\"]')) syncOpened();", "box.querySelector('[data-row=\"sync\"]')) void 0;"];
    const n = PAGE.split(OPENED_PLANT[0]).length - 1;
    let detail = "the plant's anchor is there " + n + " times";
    if (n === 1) {
      fs.writeFileSync(path.join(lab, "planted-opened.html"), PAGE.split(OPENED_PLANT[0]).join(OPENED_PLANT[1]));
      const r = await checkOpened("planted-opened.html");
      detail = !r.ok ? "red: " + JSON.stringify(r) : "still held";
      check(!r.ok, "p c8o the page's word that the conflict line was opened taken out turns c8o red", detail);
    } else check(false, "p c8o the page's word that the conflict line was opened taken out turns c8o red", detail);
  }
  /* A page plant on the row's true lines: `from` once in the built page, put in another form, turns m4 red. */
  const truePlant = async (tag, from, to, what) => {
    const line = "p m4 " + tag + " in a copy of the built page turns m4 red (" + what + ")";
    if (PLANTS_OFF) { skip(line); return; }
    const n = PAGE.split(from).length - 1;
    let detail = "the plant's anchor is there " + n + " times";
    if (n === 1) {
      fs.writeFileSync(path.join(lab, "planted-" + tag + ".html"), PAGE.split(from).join(to));
      const bad = await trueLines("planted-" + tag + ".html");
      detail = bad.length ? "red: " + JSON.stringify(bad[0]) : "still held";
      check(!m4.length && bad.length > 0, line, detail);
    } else check(false, line, detail);
  };
  if (PLANTS_OFF) skip("p m6 the Allow button's press taken out turns m6 red");
  else {
    const ALLOW_PLANT = ['b.onclick = () => syncConsent().then(', 'b.onclick = () => Promise.resolve().then('];
    const n = PAGE.split(ALLOW_PLANT[0]).length - 1;
    let detail = "the plant's anchor is there " + n + " times";
    if (n === 1) {
      fs.writeFileSync(path.join(lab, "planted-allow.html"), PAGE.split(ALLOW_PLANT[0]).join(ALLOW_PLANT[1]));
      const bad = await allowRow("planted-allow.html");
      detail = bad.length ? "red: " + JSON.stringify(bad[0]) : "still held";
      check(!m6.length && bad.length > 0, "p m6 the Allow button's press taken out turns m6 red", detail);
    } else check(false, "p m6 the Allow button's press taken out turns m6 red", detail);
  }
  await truePlant("anew", 'if (s.line === "anew") return t(', 'if (false) return t(', "a new store under policy said as sync on");
  await truePlant("signin-refused", 'if (s.line === "signin-refused") return t(', 'if (false) return t(', "a refused sign-in said as sync on");
  await truePlant("resuming", 'if (s.line === "resuming") return t(', 'if (false) return t(', "a restart after sync ran here said as sync on");
  await truePlant("first", 'if (s.line === "first") return t(', 'if (false) return t(', "the first look said as sync on");
  await truePlant("refused", 'if (s.line === "again" || s.line === "spent" || s.line === "refused") return', 'if (s.line === "again" || s.line === "spent") return', "a refusal said as sync on");
  await truePlant("refused-clause", 'if (refused) return t(', 'if (false) return t(', "a refusal's clause lost, its line saying a passing failure's reason");
  await truePlant("lapsed", 'if (s.line === "lapsed") return t(', 'if (false) return t(', "a lapse said as sync on");
  await truePlant("passing", 'if (s.line === "again" || s.line === "spent" || s.line === "refused") return', 'if (s.line === "refused") return', "a passing failure said as sync on");
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
