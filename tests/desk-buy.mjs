/* Buy in Account: the desk's half of the desk-only licence's order. Bare node, no window, no browser and no network.
 *
 *     node tests/desk-buy.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE CLAIM. Account offers Buy only where the shell names an order page (ORDER_PAGE, "" in this tree, so nothing is drawn); a
 * click on it hands the system's browser that page with the signed-in person's sign-in code after its # ("#code="), never in
 * its query, so no request a server logs carries the code; signed out it hands the bare page, whose typed field is the way to
 * buy for someone else; and nothing but a trusted click on Buy, from the engine's own frame, once, while it is fresh, opens it.
 *
 * THE SHELL'S HALF IS SLICED, as tests/update-offer.mjs slices the version note: the order page's two declarations and the
 * sign-in lab's read, which may name the page, from the sign-in's section; the order page's section; and the link rule it leaves
 * by. They are evaluated with stand-ins for ipcMain, the frame check, the clock, the sign-in's view and the browser.
 *
 * THE PAGE'S HALF is Account drawn by src/modules/settings.js over a stand-in host, and the preload over a stand-in window.
 *
 * EVERY GUARD IS SHOWN RED (b-plants): the line carrying its plant tag is put in another form in memory and the same case is
 * read again; nothing on disk is touched. Skipped under ETIUDA_PLANTS=off.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const PRELOAD = fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8");
const SETTINGS = fs.readFileSync(path.join(ROOT, "src", "modules", "settings.js"), "utf8");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const PLANTS = 14;
/* The floor: every check below runs, or the file says it did not complete. */
const EXPECTED = 13 + (PLANTS_OFF ? 0 : PLANTS);

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* ---- the slices ------------------------------------------------------------------------------------------------------- */
function once(src, a) {
  const at = src.indexOf(a);
  if (at < 0 || src.indexOf(a, at + 1) >= 0) throw new Error("not in shell/main.js once: " + a.slice(0, 60));
  return at;
}
const lineOf = start => { const at = once(MAIN, "\n" + start) + 1; return MAIN.slice(at, MAIN.indexOf("\n", at)); };
const fnOf = start => { const at = once(MAIN, "\n" + start) + 1; return MAIN.slice(at, MAIN.indexOf("\n}", at) + 2); };
const ORDER_HEAD = "/* ---- the order page (the desk-only licence)";
const LINK_HEAD = "/* A WEB ADDRESS LEAVES ONLY FOR A CLICK ON IT.";
const NOTE_HEAD = "/* ---- the version note (board 991)";
let TEXT = "", BUY = "", sliced = "";
try {
  BUY = MAIN.slice(once(MAIN, ORDER_HEAD), once(MAIN, LINK_HEAD));
  TEXT = [lineOf("let ORDER_PAGE ="), lineOf("const ORDER_PAGE_SHAPE ="), lineOf("const ORDER_ORIGIN_SHAPE ="), lineOf("const SIGNIN_CLIENT ="), lineOf("const SIGNIN_SECRET_SHAPE ="),
    fnOf("function signinLabAt("), fnOf("function signinLabService("), fnOf("function signinLabRead("), lineOf("let signinLabOn ="),
    fnOf("function signinLabUse("), BUY, MAIN.slice(once(MAIN, LINK_HEAD), once(MAIN, NOTE_HEAD))].join("\n");
} catch (e) { sliced = e.message; }

/* One shell: the slices evaluated, the standing plant's [from, to] put in place of the one line holding `from`; `code` the sign-in
   code the sign-in's view names now (a function, so a leg may sign out between a click and its open), and `lab` a lab file taken. */
let PLANT_SWAP = null;
function shellOf(o) {
  const opt = o || {}, swap = PLANT_SWAP;
  let text = TEXT;
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the slice once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const opened = [], on = {}, handle = {}, clock = { t: 1_800_000_000_000 };
  const env = {
    URL, console: { error: () => {}, log: () => {} },
    Date: { now: () => clock.t },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { handle[ch] = fn; } },
    fromEngine: e => !!(e && e.engine),
    shell: { openExternal: async u => { opened.push(u); } },
    shellWords: () => ({ lang: opt.lang || "en" }),
    signinView: () => ({ code: typeof opt.code === "function" ? opt.code() : opt.code || "", licenceManaged: opt.managed === true, signedIn: opt.signedIn === true ? "microsoft" : "" }),
    /* The held seat's own account of what it pays (board 1020): {provider, portal?} where a subscription pays the person's licence. */
    signinPaysNow: () => opt.pays || null,
  };
  const names = Object.keys(env);
  const body = "let SIGNIN_PROVIDERS = Object.freeze({ microsoft: Object.freeze({ clientId: \"\" }), google: Object.freeze({ clientId: \"\" }) }),"
    + " SIGNIN_SERVICE = \"\", SIGNOUT_SERVICE = \"\";\n" + text
    + "\nreturn { orderAddress, orderPageFor, buyAddress, ORDER_PAGE_SHAPE, signinLabRead, signinLabUse, LINK_CLICK_MS, page: () => ORDER_PAGE };";
  const api = new Function(...names, body)(...names.map(n => env[n]));
  if (opt.lab) api.taken = api.signinLabUse(api.signinLabRead(JSON.stringify(opt.lab)));
  /* A press of Buy as the shell hears it: the preload's click, then the page's open; each from the engine's frame unless told. */
  const click = (engine = true) => { const e = { engine }; on["etiuda:buy-click"](e); return e.returnValue; };
  const open = (engine = true) => handle["etiuda:buy-open"]({ engine });
  const state = (engine = true) => { const e = { engine }; on["etiuda:buy-state"](e); return e.returnValue; };
  return Object.assign(api, { opened, on, handle, clock, click, open, state });
}

/* ---- the stand-ins ---------------------------------------------------------------------------------------------------- */
/* Illustrations only: the order page's real address is etiuda.dev's to name, and the code is of the service's shape. */
const ORDER = "https://etiuda.dev";
const EN_PAGE = ORDER + "/en/order/desk/", PL_PAGE = ORDER + "/pl/zamowienie/stanowisko/";
const CODE = "ABCD2345EFGH6789";
const STAGING = "https://etiuda.dev/licence-staging/v1/";
const labWith = over => Object.assign({ service: STAGING }, over);
const signed = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, seat: "held", at: 1_800_000_000_000, reached: true };
const signedOut = { offered: ["microsoft", "google"] };
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
/* Settings, Account drawn as settings.js draws it over a host answering `v`, with desk-first-edition's empty document. */
async function acctOf(v, host) {
  const SET = await import(MOD("settings.js"));
  const quiet = { contains: () => false, add() {}, remove() {}, toggle() {} };
  globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {}, E_HOST: Object.assign({ signinState: () => v }, host || {}) };
  globalThis.document = { querySelector: () => null, getElementById: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, classList: quiet },
    body: { classList: quiet }, addEventListener() {}, removeEventListener() {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
  try { return SET.settingsPageHtml("account", ""); } finally { delete globalThis.window; delete globalThis.document; delete globalThis.getComputedStyle; }
}
const words = h => String(h).replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ");
/* Account's Buy row, or "" where it is not drawn. */
const buyRowOf = html => { const m = /<div class="set-row" data-row="buy">[\s\S]*?<\/button><\/div><\/div>/.exec(String(html)); return m ? m[0] : ""; };
const OFFER = { buyState: () => ({ offer: true }) }, NO_OFFER = { buyState: () => ({ offer: false }) };

/* ---- the cases -------------------------------------------------------------------------------------------------------- */
const CASES = {};
/* b1: as this tree ships, the order page is "", the shell offers nothing and a press hands nothing; Account draws no Buy, signed
   in or out, whether the host says no offer or knows no Buy at all (a browser). */
CASES.absent = async () => {
  const S = shellOf({ code: CODE });
  const st = S.state(), clicked = S.click(), opened = S.open();
  const a = await acctOf(signed, NO_OFFER), b = await acctOf(signedOut, NO_OFFER), c = await acctOf(signed), d = await acctOf(signed, { buyState: () => S.state() });
  return lineOf("let ORDER_PAGE =") === "let ORDER_PAGE = \"\";" && S.page() === "" && !!st && st.offer === false && Object.keys(st).join() === "offer"
    && clicked === null && opened === false && S.opened.length === 0
    && [a, b, c, d].every(h => /data-row="seat"|data-e-open="signin"/.test(h) && !/data-e-open="buy"/.test(h) && !/data-row="buy"/.test(h));
};
/* b2: an order page named (here by the sign-in lab, as a client id is filled) is offered, and nothing else is told; Account draws
   Buy signed in, its line saying the licence bought is this account's; signed out too, its line saying signing in comes first;
   neither while a sign-in waits; Polish too. Board 1017 moved the two lines, which once said the code is filled in and that the
   page asks for the code: no screen names a code now. */
CASES.present = async () => {
  const S = shellOf({ lab: labWith({ order: ORDER }) });
  const st = S.state(), other = S.state(false);
  const storage = await import(MOD("storage.js"));
  storage.lsSet("eUiLang", "en");
  const inRow = buyRowOf(await acctOf(signed, OFFER)), outRow = buyRowOf(await acctOf(signedOut, OFFER));
  const busy = await acctOf(Object.assign({}, signedOut, { busy: "microsoft" }), OFFER);
  storage.lsSet("eUiLang", "pl");
  let plIn = "", plOut = "";
  try { plIn = buyRowOf(await acctOf(signed, OFFER)); plOut = buyRowOf(await acctOf(signedOut, OFFER)); } finally { storage.lsSet("eUiLang", "en"); }
  return S.taken === true && S.page() === ORDER && !!st && st.offer === true && Object.keys(st).join() === "offer" && other === null
    && /<button type="button" class="btn" data-e-open="buy">Buy<\/button>/.test(inRow)
    && words(inRow).indexOf("Licence for one person") >= 0 && words(inRow).indexOf("The order page opens in the browser, and the licence bought there is this account's.") >= 0
    && /data-e-open="buy">Buy</.test(outRow) && words(outRow).indexOf("A licence is bought for the account signed in here, so signing in comes first.") >= 0
    && inRow.indexOf(CODE) < 0 && outRow.indexOf("http") < 0 && !/data-e-open="buy"/.test(busy)
    && /data-e-open="buy">Kup</.test(plIn) && words(plIn).indexOf("Licencja dla jednej osoby") >= 0 && words(plIn).indexOf("Strona zamówienia otworzy się w przeglądarce, a kupiona tam licencja będzie należeć do tego konta.") >= 0
    && /data-e-open="buy">Kup</.test(plOut) && words(plOut).indexOf("Licencję kupuje się dla konta zalogowanego na tym komputerze, więc najpierw trzeba się zalogować.") >= 0;
};
/* b3: a click on Buy hands the browser the order page with the code after its #: the request a browser makes of it (its path and
   query) holds no code. Signed out, or with a code not of its shape, the bare page. */
CASES.address = () => {
  const S = shellOf({ lab: labWith({ order: ORDER }), code: CODE });
  S.click(); const ok = S.open();
  const u = S.opened.length === 1 ? new URL(S.opened[0]) : null;
  const O = shellOf({ lab: labWith({ order: ORDER }), code: "" });
  O.click(); const okOut = O.open();
  const W = shellOf({ lab: labWith({ order: ORDER }), code: "ABCD2345EFGH678&" });
  W.click(); W.open();
  return ok === true && !!u && S.opened[0] === EN_PAGE + "#code=" + CODE && u.search === "" && u.hash === "#code=" + CODE
    && (u.pathname + u.search).indexOf(CODE) < 0 && u.origin === "https://etiuda.dev"
    && okOut === true && O.opened.length === 1 && O.opened[0] === EN_PAGE && W.opened.length === 1 && W.opened[0] === EN_PAGE;
};
/* b13: the order page is the desk-only one in the desk's language, and the handoff is what the site's order.js reads (a "#code=" of
   sixteen capitals and digits, nothing in the query): English /en/order/desk/, Polish /pl/zamowienie/stanowisko/, any other language the
   English; signed out the bare page of that language. Press by press, the browser is handed that one address and nothing else. */
CASES.language = () => {
  const run = (lang, code) => { const S = shellOf({ lab: labWith({ order: ORDER }), code, lang }); const st = S.state(); S.click(); const ok = S.open(); return { ok, st, opened: S.opened }; };
  const pl = run("pl", CODE), en = run("en", CODE), de = run("de", CODE), plOut = run("pl", ""), enOut = run("en", "");
  const u = pl.opened.length === 1 ? new URL(pl.opened[0]) : null;
  return pl.ok === true && pl.opened.length === 1 && pl.opened[0] === PL_PAGE + "#code=" + CODE
    && !!u && u.pathname === "/pl/zamowienie/stanowisko/" && u.search === "" && /^#code=[0-9A-Z]{16}$/.test(u.hash)
    && en.opened.length === 1 && en.opened[0] === EN_PAGE + "#code=" + CODE && de.opened.length === 1 && de.opened[0] === EN_PAGE + "#code=" + CODE
    && plOut.opened.length === 1 && plOut.opened[0] === PL_PAGE && enOut.opened.length === 1 && enOut.opened[0] === EN_PAGE
    && pl.st.offer === true && en.st.offer === true;
};
/* b4: nothing else opens the browser: no open without a click, a click or an open from another frame, a click gone stale, a click
   spent, a click that named another address (the person signed out between); the section calls the browser only through the link
   rule's openExternally, and the shell's files hold the browser call once (tests/links.js's floor, read here too). */
CASES.nothingElse = () => {
  let code = CODE;
  const S = shellOf({ lab: labWith({ order: ORDER }), code: () => code });
  const r = [];
  r.push(S.open());
  S.click(false); r.push(S.open());
  S.click(); r.push(S.open(false));
  S.clock.t += S.LINK_CLICK_MS + 1; r.push(S.open());
  S.click(); code = ""; r.push(S.open()); code = CODE;
  const none = S.opened.length;
  S.click(); const first = S.open(), spent = S.open();
  const calls = ((MAIN.match(/\bopenExternal\b/g) || []).length + (PRELOAD.match(/\bopenExternal\b/g) || []).length);
  return r.every(x => x === false) && none === 0 && first === true && spent === false && S.opened.length === 1
    && !/\bhandOut\b/.test(BUY) && !/\bopenExternal\b/.test(BUY) && (BUY.match(/\bopenExternally\(/g) || []).length === 1 && calls === 1;
};
/* b5: the order page is etiuda.dev's, https, with no port, no user, no query and no fragment of its own; a lab file naming any
   other is refused whole; one naming none leaves it "". */
const GOOD_PAGES = ["https://etiuda.dev", "https://shop.etiuda.dev"];
const BAD_PAGES = ["http://etiuda.dev", "https://etiuda.dev.example.test", "https://example.test/etiuda.dev", "https://evil-etiuda.dev",
  "https://etiuda.dev:8443", "https://user@etiuda.dev", "https://etiuda.dev/order", "https://etiuda.dev/", "https://etiuda.dev?ref=desk", "https://etiuda.dev#code=", "https://etiuda.dev desk",
  "https://ETIUDA.DEV", "", "javascript:alert(1)"];
/* The address itself, whatever builds it, is judged again: etiuda.dev's, https, no port, user, query or fragment of its own. */
const BAD_ADDRESSES = ["http://etiuda.dev/en/order/desk/", "https://example.test/en/order/desk/", "https://etiuda.dev.example.test/en/order/desk/", "https://evil-etiuda.dev/en/order/desk/",
  "https://etiuda.dev:8443/en/order/desk/", "https://user@etiuda.dev/en/order/desk/", "https://etiuda.dev/en/order/desk/?ref=desk", "https://etiuda.dev/en/order/desk/#code=", ""];
CASES.shape = () => {
  const S = shellOf();
  const good = GOOD_PAGES.every(p => S.orderPageFor(p, "en") === p + "/en/order/desk/" && S.orderPageFor(p, "pl") === p + "/pl/zamowienie/stanowisko/"
    && S.orderAddress(S.orderPageFor(p, "pl"), CODE) === p + "/pl/zamowienie/stanowisko/#code=" + CODE && S.signinLabRead(JSON.stringify(labWith({ order: p }))) !== null);
  const bad = BAD_PAGES.every(p => S.orderPageFor(p, "en") === "" && S.orderPageFor(p, "pl") === "" && S.signinLabRead(JSON.stringify(labWith({ order: p }))) === null)
    && BAD_ADDRESSES.every(a => S.orderAddress(a, CODE) === "");
  const none = S.signinLabRead(JSON.stringify(labWith({})));
  const N = shellOf({ lab: labWith({}) });
  return good && bad && !!none && none.order === "" && N.taken === true && N.page() === "" && N.state().offer === false
    && S.signinLabRead(JSON.stringify(labWith({ order: 7 }))) === null;
};
/* b6: the preload tells main of a trusted click on Buy alone, and E_HOST asks the state and the open by their channels. */
CASES.preload = () => {
  const pre = { sync: [], invoke: [], listeners: {} };
  const savedWindow = globalThis.window;
  globalThis.window = { addEventListener: (t, fn) => { pre.listeners[t] = fn; } };
  const bridge = {};
  try {
    new Function("require", "process", PRELOAD)(
      n => (n === "electron" ? {
        contextBridge: { exposeInMainWorld: (k, v) => { bridge[k] = v; }, executeInMainWorld: () => {} },
        ipcRenderer: { sendSync: ch => { pre.sync.push(ch); return ch === "etiuda:host" ? { platform: "win32" } : null; },
          invoke: ch => { pre.invoke.push(ch); return Promise.resolve(true); }, send: () => {}, on: () => {} },
        webUtils: { getPathForFile: () => "" } } : null),
      { argv: ["electron", "."] });
  } finally { globalThis.window = savedWindow; }
  const button = { localName: "button", dataset: { eOpen: "buy" } }, plainBtn = { localName: "button", dataset: {} };
  const fire = (type, trusted, nodes, btn) => pre.listeners[type] && pre.listeners[type]({ type, isTrusted: trusted, button: btn || 0, composedPath: () => nodes });
  const base = pre.sync.length;
  fire("click", false, [button]); fire("click", true, [plainBtn]); fire("auxclick", true, [button], 1);
  const quiet = pre.sync.length - base;
  fire("click", true, [{ localName: "span", dataset: {} }, button]);
  const heard = pre.sync.slice(base);
  const H = bridge.E_HOST || {};
  if (typeof H.buyState === "function") H.buyState();
  if (typeof H.openBuyPage === "function") H.openBuyPage();
  return quiet === 0 && heard.length === 1 && heard[0] === "etiuda:buy-click" && pre.sync[pre.sync.length - 1] === "etiuda:buy-state"
    && pre.invoke[pre.invoke.length - 1] === "etiuda:buy-open";
};
/* b7: the page's Buy asks the shell's open and names no address: its handler in Account's wiring calls openBuyPage, and nothing in
   settings.js opens a window or sets a location. */
CASES.pagePress = () => {
  const i = SETTINGS.indexOf("'[data-e-open=\"buy\"]'"), block = i < 0 ? "" : SETTINGS.slice(i, SETTINGS.indexOf("}; });", i));
  return !!block && /h\.openBuyPage\(\)/.test(block) && !/https?:|window\.open|location/.test(block) && !/window\.open\(|location\.href\s*=/.test(SETTINGS);
};

/* Board 1020: the account already pays (the service's "pays", deskOnly). A press of Buy goes to the subscription's portal, the provider's
   own address and no sign-in code after it, even where no order page is named; with no portal the shell offers nothing, so a second checkout
   is never reached, even where the order page is named; a managed tenant, or nobody signed in, is as before. */
const PORTAL = "https://billing.stripe.com/p/login/test_aB3dE5gH7jK9mN1pQ3rS5tU7";
CASES.paysPortal = () => {
  const lab = labWith({ order: ORDER });
  const S = shellOf({ lab, code: CODE, signedIn: true, pays: { provider: "stripe", portal: PORTAL } });
  const st = S.state(); S.click(); const ok = S.open();
  const bare = shellOf({ code: CODE, signedIn: true, pays: { provider: "stripe", portal: PORTAL } });
  const bst = bare.state(); bare.click(); const bok = bare.open();
  const N = shellOf({ lab, code: CODE, signedIn: true, pays: { provider: "paddle" } });
  const nst = N.state(); N.click(); const nok = N.open();
  const M = shellOf({ lab, code: CODE, signedIn: true, managed: true, pays: { provider: "stripe", portal: PORTAL } });
  const mst = M.state(); M.click(); const mok = M.open();
  const O = shellOf({ lab, code: "", signedIn: false, pays: { provider: "stripe", portal: PORTAL } });
  O.click(); O.open();
  const P = shellOf({ lab, code: CODE, signedIn: true });
  P.click(); P.open();
  return !!st && st.offer === true && ok === true && S.opened.length === 1 && S.opened[0] === PORTAL
    && !!bst && bst.offer === true && bok === true && bare.opened[0] === PORTAL && bare.page() === ""
    && !!nst && nst.offer === false && nok === false && N.opened.length === 0
    && !!mst && mst.offer === false && mok === false && M.opened.length === 0
    && O.opened.length === 1 && O.opened[0] === ORDER + "/en/order/desk/" && P.opened.length === 1 && P.opened[0] === ORDER + "/en/order/desk/#code=" + CODE; /* the order page by the desk's language (orderPageFor), as b3 reads it */
};
/* The page, Account over a stand-in host: the Buy row of a person who already pays says so, with its button only where there is a portal
   (the shell builds the address, never the page), in Polish too; and a held payment is one line with its kind, its provider and its day. */
const buyLineOf = html => { const m = /<div class="set-row" data-row="buy">[\s\S]*?<div class="set-ctl">[\s\S]*?<\/div><\/div>/.exec(String(html)); return m ? m[0] : ""; };
const heldLineOf = html => { const m = /<div class="set-row" data-row="payment">[\s\S]*?<div class="set-ctl">[\s\S]*?<\/div><\/div>/.exec(String(html)); return m ? m[0] : ""; };
CASES.paysPage = async () => {
  const storage = await import(MOD("storage.js"));
  const withPays = portal => Object.assign({}, signed, { buy: { pays: { provider: "stripe", portal } } });
  const heldAt = (kind, provider) => Object.assign({}, signed, { buy: { held: { kind, provider: provider || "stripe", at: Date.UTC(2026, 10, 22, 9) } } });
  storage.lsSet("eUiLang", "en");
  const yes = buyLineOf(await acctOf(withPays(true), OFFER)), no = buyLineOf(await acctOf(withPays(false), NO_OFFER));
  const plain = buyLineOf(await acctOf(signed, OFFER)), outRow = buyLineOf(await acctOf(Object.assign({}, signedOut, { buy: { pays: { provider: "stripe", portal: true } } }), OFFER));
  const day = (lang) => new Date(Date.UTC(2026, 10, 22, 9)).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });
  const lines = {};
  for (const k of ["already-pays", "managed", "review", "pending"]) lines[k] = words(heldLineOf(await acctOf(heldAt(k), OFFER)));
  const paddle = words(heldLineOf(await acctOf(heldAt("pending", "paddle"), OFFER)));
  const quiet = heldLineOf(await acctOf(signed, OFFER)), managedHeld = heldLineOf(await acctOf(Object.assign({}, heldAt("review"), { licenceManaged: true }), OFFER));
  storage.lsSet("eUiLang", "pl");
  let plYes = "", plNo = "", plHeld = "";
  try { plYes = buyLineOf(await acctOf(withPays(true), OFFER)); plNo = buyLineOf(await acctOf(withPays(false), NO_OFFER)); plHeld = words(heldLineOf(await acctOf(heldAt("review"), OFFER))); }
  finally { storage.lsSet("eUiLang", "en"); }
  return /data-e-open="buy">Add seats…</.test(yes) && words(yes).indexOf("This account already pays for its licence, so this opens its subscription at Stripe instead of a second order; seats are added there.") >= 0
    && no !== "" && !/data-e-open="buy"/.test(no) && !/<button/.test(no) && words(no).indexOf("This account already pays for its licence, and a licence holds one subscription, so no second order is taken.") >= 0
    && words(no).indexOf("{CONTACT}") < 0 && words(no).indexOf("Seats are added to the subscription") < 0
    && yes.indexOf("http") < 0 && yes.indexOf(CODE) < 0 && /data-e-open="buy">Buy</.test(plain) && /data-e-open="buy">Buy</.test(outRow) && outRow.indexOf("already pays") < 0
    && lines["already-pays"].indexOf("A second payment from this account, of " + day("en-GB") + ", is held: the licence it already pays for takes more seats at Stripe instead, and the second payment is refunded.") >= 0
    && lines.managed.indexOf("A payment from this account, of " + day("en-GB") + ", is held, because this account's organisation holds its Etiuda licence. It is refunded or attached by hand, and this line then goes by itself.") >= 0
    && lines.review.indexOf("A payment from this account, of " + day("en-GB") + ", is held for a look by hand. It is refunded or attached to a licence, and this line then goes by itself.") >= 0
    && lines.pending.indexOf("Stripe has not yet confirmed this account's payment of " + day("en-GB") + ". The licence comes by itself once it does.") >= 0
    && paddle.indexOf("Paddle has not yet confirmed") >= 0 && quiet === "" && managedHeld !== ""
    && /data-e-open="buy">Dodaj miejsca…</.test(plYes) && words(plYes).indexOf("To konto już płaci za licencję, więc ten przycisk otwiera jego subskrypcję w serwisie Stripe zamiast drugiego zamówienia; tam dodaje się miejsca.") >= 0
    && !/<button/.test(plNo) && words(plNo).indexOf("To konto już płaci za licencję, a jedna licencja ma jedną subskrypcję, więc drugiego zamówienia nie ma.") >= 0
    && plHeld.indexOf("Płatność z tego konta, z " + day("pl-PL") + ", jest wstrzymana do ręcznego sprawdzenia. Zostanie zwrócona albo przypisana do licencji, a wtedy ten wiersz sam zniknie.") >= 0;
};

/* b10: where the service said the account's organisation holds its licence (a managed tenant), on any computer, the shell offers no order
   page and a press opens nothing, and Account draws no Buy, signed in or out, saying instead that the organisation holds the licence;
   and why, where the person also bought one of their own (placeholder words, the copywriter's to write). */
CASES.managed = async () => {
  const S = shellOf({ lab: labWith({ order: ORDER }), code: CODE, managed: true });
  const st = S.state(); S.click(); const opened = S.open();
  const v = Object.assign({}, signed, { licenceManaged: true }), vo = Object.assign({}, signedOut, { licenceManaged: true });
  const a = await acctOf(v, OFFER), b = await acctOf(vo, OFFER);
  const own = await acctOf(Object.assign({}, v, { cause: "own-licence" }), OFFER), asg = await acctOf(Object.assign({}, v, { cause: "assigned" }), OFFER);
  const line = "Your organisation holds the Etiuda licence for this account, so there is nothing to buy here.";
  return !!st && st.offer === false && opened === false && S.opened.length === 0
    && [a, b].every(h => !/data-e-open="buy"/.test(h) && words(h).indexOf(line) >= 0)
    && words(own).indexOf("and this account has none, so it keeps its seat on the licence bought before.") >= 0
    && words(asg).indexOf("its seat on the licence bought before is not used meanwhile.") >= 0;
};

/* ---- the run ---------------------------------------------------------------------------------------------------------- */
const LEGS = [
  ["b1", "absent", "as shipped, no order page: the shell offers nothing, a press hands nothing, and Account draws no Buy, signed in or out"],
  ["b2", "present", "an order page named (by the sign-in lab): offered, nothing else told; Account draws Buy signed in and signed out, not while a sign-in waits; Polish too"],
  ["b3", "address", "the address handed carries the code after the #, outside the query and the path; signed out, or a code not of its shape, the bare page"],
  ["b4", "nothingElse", "nothing else opens the browser: no click, another frame, a stale or spent click, a click for another address; only through openExternally"],
  ["b5", "shape", "the order page is etiuda.dev's over https with no port, user, query or fragment; a lab file naming another is refused whole"],
  ["b13", "language", "the page is the desk-only one in the desk's language, English or Polish, with the fragment the site's order.js reads; signed out the bare page; the browser is handed that alone"],
  ["b6", "preload", "the preload tells main of a trusted click on Buy alone; E_HOST asks the state and the open"],
  ["b7", "pagePress", "the page's Buy asks the shell's open and names no address"],
  ["b11", "paysPortal", "a person who already pays: Buy goes to the subscription's portal alone, offers nothing where there is none, never an order page; managed, signed out and a non-payer as before"],
  ["b12", "paysPage", "Account says the person already pays, its button only with a portal, and draws a held payment as one line by kind, in English and Polish"],
  ["b10", "managed", "a managed tenant's account: no order page offered, a press opens nothing, Account draws no Buy but who holds the licence, and why"],
];
if (sliced) console.log("  (the slices did not load: " + sliced + ")");
for (const [id, name, line] of LEGS) {
  let ok = false;
  try { ok = !sliced && await CASES[name](); } catch (e) { console.log("    (" + id + " threw: " + e.message + ")"); ok = false; }
  check(ok === true, id + " " + line);
}
/* The tree's own order page stays "" until etiuda.dev's exists, so nothing is drawn or sent (b1 reads the line itself). */
check(!sliced && /plant:order-fragment/.test(BUY) && MAIN.indexOf("\nfunction fromEngine(") < MAIN.indexOf(ORDER_HEAD) && MAIN.indexOf(ORDER_HEAD) < MAIN.indexOf(LINK_HEAD), "b8 the order page's section is in shell/main.js once, between the frame check and the link rule");
check(!sliced && /"Buy":"Kup"/.test(fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8")), "b9 Buy's words have their Polish");

/* ---- the plants ------------------------------------------------------------------------------------------------------- */
/* Every shell the case makes while the plant stands carries the swap; an anchor not in the slice once throws, which reads as not red. */
async function plant(id, swap, name, line) {
  let red = false;
  PLANT_SWAP = swap;
  try { red = (await CASES[name]()) !== true && TEXT.split(swap[0]).length === 2; } catch { red = false; }
  finally { PLANT_SWAP = null; }
  check(red, id + " " + line);
}
if (!PLANTS_OFF && !sliced) {
  await plant("bp1", ["? \"#code=\" + code : \"\"); /* plant:order-fragment */", "? \"?code=\" + code : \"\");"], "address",
    "order-fragment put in the query: the code would reach the server's log");
  await plant("bp2", ["if (typeof page !== \"string\" || !ORDER_PAGE_SHAPE.test(page)) return \"\"; /* plant:order-page */", "if (typeof page !== \"string\") return \"\";"], "shape",
    "order-page with no shape check: any address would be handed");
  await plant("bp3", ["/^https:\\/\\/(?:[a-z0-9-]+\\.)*etiuda\\.dev(?:\\/[A-Za-z0-9._~-]+)*\\/?$/; /* plant:order-shape */", "/^https?:\\/\\/\\S+$/;"], "shape",
    "order-shape loosened to any http(s) address");
  await plant("bp4", ["if (!(d.order === undefined || (typeof d.order === \"string\" && ORDER_ORIGIN_SHAPE.test(d.order)))) return null; /* plant:lab-order */", ""], "shape",
    "lab-order cut: a lab file naming another address would be taken");
  await plant("bp5", ["if (!fromEngine(e)) return; /* plant:buy-click-frame */", ""], "nothingElse",
    "buy-click-frame cut: a click from another frame would let the page out");
  await plant("bp6", ["openExternally(u); /* plant:buy-open */", "handOut(u);"], "nothingElse",
    "buy-open past the link rule: an open with no click would reach the browser");
  await plant("bp9", ["if (pays) return pays.portal || \"\"; /* plant:buy-pays */", "if (pays && pays.portal) return pays.portal;"], "paysPortal",
    "buy-pays falling through to the order page where there is no portal: a second checkout");
  await plant("bp10", ["const pays = v && v.signedIn ? signinPaysNow() : null; /* plant:pays-signed */", "const pays = v ? signinPaysNow() : null;"], "paysPortal",
    "pays read with nobody signed in: a held seat's portal handed to another sign-in");
  await plant("bp8", ["if (buyManaged(v) || (v && v.licenceManaged)) return \"\"; /* plant:buy-managed */", "if (buyManaged(v)) return \"\";"], "managed",
    "the order page handed to a managed tenant's account turns b10 red");
  await plant("bp13", ["return origin + ORDER_PATHS[lang === \"pl\" ? \"pl\" : \"en\"]; /* plant:order-lang */", "return origin + ORDER_PATHS.en;"], "language",
    "order-lang cut: a Polish desk would be handed the English page");
  await plant("bp14", ["try { if (shellWords().lang === \"pl\") lang = \"pl\"; } catch { lang = \"en\"; }", "lang = \"en\";"], "language",
    "the desk's language ignored by Buy: a Polish desk would be handed the English page");
  await plant("bp15", ["if (typeof origin !== \"string\" || !ORDER_ORIGIN_SHAPE.test(origin)) return \"\"; /* plant:order-origin-use */", "if (typeof origin !== \"string\") return \"\";"], "shape",
    "order-origin-use cut: a page builder would not refuse an origin off etiuda.dev");
  await plant("bp16", ["/^https:\\/\\/(?:[a-z0-9-]+\\.)*etiuda\\.dev$/; /* plant:order-origin */", "/^https?:\\/\\/\\S+$/;"], "shape",
    "order-origin loosened to any http(s) address");
  await plant("bp7", ["let ORDER_PAGE = \"\";", "let ORDER_PAGE = \"" + ORDER + "\";"], "absent",
    "the control for b1: with an order page named in the tree, the shell offers Buy and a press hands it");
}

console.log((failed ? "FAIL" : "ok") + " desk-buy: " + (asserted - failed) + "/" + asserted + " checks"
  + (asserted !== EXPECTED ? " (expected " + EXPECTED + ": the run did not complete)" : ""));
process.exit(asserted !== EXPECTED ? Math.max(1, Math.min(failed, 63)) : Math.min(failed, 63));
