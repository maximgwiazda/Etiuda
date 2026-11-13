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
const PLANTS = 7;
/* The floor: every check below runs, or the file says it did not complete. */
const EXPECTED = 9 + (PLANTS_OFF ? 0 : PLANTS);

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
  TEXT = [lineOf("let ORDER_PAGE ="), lineOf("const ORDER_PAGE_SHAPE ="), lineOf("const SIGNIN_CLIENT ="), lineOf("const SIGNIN_SECRET_SHAPE ="),
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
    signinView: () => ({ code: typeof opt.code === "function" ? opt.code() : opt.code || "" }),
  };
  const names = Object.keys(env);
  const body = "let SIGNIN_PROVIDERS = Object.freeze({ microsoft: Object.freeze({ clientId: \"\" }), google: Object.freeze({ clientId: \"\" }) }),"
    + " SIGNIN_SERVICE = \"\", SIGNOUT_SERVICE = \"\";\n" + text
    + "\nreturn { orderAddress, buyAddress, ORDER_PAGE_SHAPE, signinLabRead, signinLabUse, LINK_CLICK_MS, page: () => ORDER_PAGE };";
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
const ORDER = "https://etiuda.dev/order/desk";
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
    && [a, b, c, d].every(h => /data-row="code"|data-e-open="signin"/.test(h) && !/data-e-open="buy"/.test(h) && !/data-row="buy"/.test(h));
};
/* b2: an order page named (here by the sign-in lab, as a client id is filled) is offered, and nothing else is told; Account draws
   Buy signed in, its line saying the code is filled in; signed out too, its line saying the page asks for the code; neither while
   a sign-in waits; Polish too. */
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
    && words(inRow).indexOf("Licence for one person") >= 0 && words(inRow).indexOf("with your sign-in code filled in") >= 0
    && /data-e-open="buy">Buy</.test(outRow) && words(outRow).indexOf("asks for the sign-in code of the person the licence is for") >= 0
    && inRow.indexOf(CODE) < 0 && outRow.indexOf("http") < 0 && !/data-e-open="buy"/.test(busy)
    && /data-e-open="buy">Kup</.test(plIn) && words(plIn).indexOf("Licencja dla jednej osoby") >= 0 && words(plIn).indexOf("z wpisanym już kodem logowania") >= 0
    && /data-e-open="buy">Kup</.test(plOut) && words(plOut).indexOf("poprosi o kod logowania osoby") >= 0;
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
  return ok === true && !!u && S.opened[0] === ORDER + "#code=" + CODE && u.search === "" && u.hash === "#code=" + CODE
    && (u.pathname + u.search).indexOf(CODE) < 0 && u.origin === "https://etiuda.dev"
    && okOut === true && O.opened.length === 1 && O.opened[0] === ORDER && W.opened.length === 1 && W.opened[0] === ORDER;
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
const GOOD_PAGES = ["https://etiuda.dev/order", "https://etiuda.dev/", "https://etiuda.dev", "https://shop.etiuda.dev/order/desk/"];
const BAD_PAGES = ["http://etiuda.dev/order", "https://etiuda.dev.example.test/order", "https://example.test/etiuda.dev/order", "https://evil-etiuda.dev/order",
  "https://etiuda.dev:8443/order", "https://user@etiuda.dev/order", "https://etiuda.dev/order?ref=desk", "https://etiuda.dev/order#code=", "https://etiuda.dev/order desk",
  "https://ETIUDA.DEV/order", "", "javascript:alert(1)"];
CASES.shape = () => {
  const S = shellOf();
  const good = GOOD_PAGES.every(p => S.ORDER_PAGE_SHAPE.test(p) && S.orderAddress(p, CODE) === p + "#code=" + CODE);
  const bad = BAD_PAGES.every(p => !S.ORDER_PAGE_SHAPE.test(p) && S.orderAddress(p, CODE) === "" && S.signinLabRead(JSON.stringify(labWith({ order: p }))) === null);
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

/* ---- the run ---------------------------------------------------------------------------------------------------------- */
const LEGS = [
  ["b1", "absent", "as shipped, no order page: the shell offers nothing, a press hands nothing, and Account draws no Buy, signed in or out"],
  ["b2", "present", "an order page named (by the sign-in lab): offered, nothing else told; Account draws Buy signed in and signed out, not while a sign-in waits; Polish too"],
  ["b3", "address", "the address handed carries the code after the #, outside the query and the path; signed out, or a code not of its shape, the bare page"],
  ["b4", "nothingElse", "nothing else opens the browser: no click, another frame, a stale or spent click, a click for another address; only through openExternally"],
  ["b5", "shape", "the order page is etiuda.dev's over https with no port, user, query or fragment; a lab file naming another is refused whole"],
  ["b6", "preload", "the preload tells main of a trusted click on Buy alone; E_HOST asks the state and the open"],
  ["b7", "pagePress", "the page's Buy asks the shell's open and names no address"],
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
  await plant("bp4", ["if (!(d.order === undefined || (typeof d.order === \"string\" && ORDER_PAGE_SHAPE.test(d.order)))) return null; /* plant:lab-order */", ""], "shape",
    "lab-order cut: a lab file naming another address would be taken");
  await plant("bp5", ["if (!fromEngine(e)) return; /* plant:buy-click-frame */", ""], "nothingElse",
    "buy-click-frame cut: a click from another frame would let the page out");
  await plant("bp6", ["openExternally(u); /* plant:buy-open */", "handOut(u);"], "nothingElse",
    "buy-open past the link rule: an open with no click would reach the browser");
  await plant("bp7", ["let ORDER_PAGE = \"\";", "let ORDER_PAGE = \"" + ORDER + "\";"], "absent",
    "the control for b1: with an order page named in the tree, the shell offers Buy and a press hands it");
}

console.log((failed ? "FAIL" : "ok") + " desk-buy: " + (asserted - failed) + "/" + asserted + " checks"
  + (asserted !== EXPECTED ? " (expected " + EXPECTED + ": the run did not complete)" : ""));
process.exit(asserted !== EXPECTED ? Math.max(1, Math.min(failed, 63)) : Math.min(failed, 63));
