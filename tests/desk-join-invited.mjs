/* No sign-in code on any desk screen, and a lead's invitation by address waiting with one Join (board 1017, the desk side).
 *
 *     node tests/desk-join-invited.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE CLAIMS. (dji1) No desk screen holds the sign-in code: the door panel, Account and the full door, drawn by the built page over a
 * stubbed view that carries one, and the preload hands the page no code at all. (dji2) The signin/desk answer's `invited` is read and
 * kept whole by the shell, handed to the page by place with no pseudonym or licence reference, and drawn as one row per invitation,
 * who invites and to which team, with one Join, in the panel, Account, the full door and a blue bubble from the account button.
 * (dji3) Join sends the licence service's existing ask, signed by the desk key over the service's own bytes (kind desk, the lead's
 * person, the team), through the service's door, and reads its answer. (dji4) A Join answered "waiting" (an invitation the provider
 * does not vouch) leaves the desk in the drawn waiting state with the copywriter's line for it. (dji5) A refused Join is said in one
 * line. (dji6) Buy's handoff to the order page is unchanged in shape: the fragment the shell builds from its own view. (dji7) No
 * paste field outside the empty desk: Settings, the Library and the Menu draw no Join a team, and no request card offers the paste.
 *
 * THE SHELL'S HALF IS SLICED from shell/main.js, as tests/desk-buy.mjs slices it; the page's half is imported, and drawn again by the
 * built page (engine/etiuda.html) in headless Chrome for dji1 and the bubble. No window, no provider, no service reached.
 *
 * EVERY GUARD IS SHOWN RED (dji-plants): the line carrying its plant tag is put in another form in memory and the same case is read
 * again; nothing on disk is touched. Skipped under ETIUDA_PLANTS=off.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const PRELOAD = fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8");
const DIR = pathToFileURL(path.join(ROOT, "src", "modules")).href + "/";
const SIGNIN = fs.readFileSync(path.join(ROOT, "src", "modules", "signin.js"), "utf8");
const SETTINGS = fs.readFileSync(path.join(ROOT, "src", "modules", "settings.js"), "utf8");
const TEAMJOIN = fs.readFileSync(path.join(ROOT, "src", "modules", "team-join.js"), "utf8");
const MANAGE = fs.readFileSync(path.join(ROOT, "src", "modules", "manage.js"), "utf8");
const MENUS = fs.readFileSync(path.join(ROOT, "src", "modules", "header-menus.js"), "utf8");
const TEMPLATE = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const SHELL_PLANTS = 8, PAGE_PLANTS = 7;
const EXPECTED = 9 + (PLANTS_OFF ? 0 : SHELL_PLANTS + PAGE_PLANTS);

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* ---- the stand-ins: illustrations, of the service's shapes ---------------------------------------------------------------- */
const CODE = "7K3MQ9TV2XRBHN4W", CODE_FOURS = "7K3M Q9TV 2XRB HN4W";
const LICENCE = "0123456789abcdef0123456789abcdef", LEAD_P = "ab".repeat(32), TEAM = "t-0123456789abcdef";
const NOW = 1_800_000_000_000, UNTIL = NOW + 30 * 86400000;
const ANSWER_INVITED = [
  { licence: LICENCE, lead: { person: LEAD_P, name: "Ada" }, team: TEAM, label: "Front desk", until: UNTIL },
  { licence: "f".repeat(32), lead: { person: "cd".repeat(32), name: "Bruno", admin: true }, team: null, label: null, until: UNTIL, confirm: true },
];
/* The page's view of the same two, as the shell hands it. */
const PAGE_INVITED = [{ n: 0, lead: "Ada", team: "Front desk", until: UNTIL }, { n: 1, lead: "Bruno", team: "", until: UNTIL, confirm: true }];
const has = (h, s) => String(h).indexOf(s) >= 0;
const codeFree = h => !has(h, CODE) && !has(h, CODE_FOURS);
const words = h => String(h).replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

/* ---- the shell's slices --------------------------------------------------------------------------------------------------- */
function once(src, a) {
  const at = src.indexOf(a);
  if (at < 0 || src.indexOf(a, at + 1) >= 0) throw new Error("not in shell/main.js once: " + a.slice(0, 60));
  return at;
}
const lineOf = start => { const at = once(MAIN, "\n" + start) + 1; return MAIN.slice(at, MAIN.indexOf("\n", at)); };
const fnOf = start => { const at = once(MAIN, "\n" + start) + 1; return MAIN.slice(at, MAIN.indexOf("\n}", at) + 2); };
let SHELL = "", sliced = "";
try {
  SHELL = [lineOf("const SIGNIN_HOLDING_ON ="), lineOf("const SIGNIN_INVITED_MAX ="), fnOf("function signinInvitedOf("), lineOf("const signinInvitedWords ="),
    fnOf("function signinInvitedView("), fnOf("function signinJoinWaitKept("), lineOf("const SIGNIN_ASK_LINE ="), fnOf("function signinJoinBytes("),
    fnOf("function signinJoinBody("), fnOf("function signinJoinOf("), fnOf("function signinJoinSettle("),
    lineOf("let SIGNIN_SERVICE ="), lineOf("let SIGNOUT_SERVICE ="), fnOf("function storeServiceAt("), fnOf("function signinServiceAsk("),
    lineOf("const SIGNIN_BODY_MAX ="), fnOf("function orderAddress("), lineOf("const ORDER_PAGE_SHAPE ="), fnOf("function buyAddress(")].join("\n");
} catch (e) { sliced = e.message; }
let SHELL_SWAP = null;
function shellOf(view) {
  let text = SHELL;
  if (SHELL_SWAP) {
    if (text.split(SHELL_SWAP[0]).length !== 2) throw new Error("plant anchor not in the slice once: " + SHELL_SWAP[0]);
    text = text.replace(SHELL_SWAP[0], SHELL_SWAP[1]);
  }
  const posted = [];
  const env = { Buffer, signinPost: (f, url, bytes) => { posted.push({ url, body: JSON.parse(bytes.toString("utf8")) }); return Promise.resolve({ status: 200, bytes: Buffer.from("{}") }); },
    signinView: () => view || {}, buyManaged: () => false, ORDER_PAGE: "https://etiuda.dev/order/desk", SIGNIN_SERVICE_MAX: 32 * 1024 };
  const names = Object.keys(env);
  const api = new Function(...names, text + "\nreturn { signinInvitedOf, signinInvitedWords, signinInvitedView, signinJoinWaitKept, signinJoinBytes, signinJoinBody, signinJoinOf,"
    + " signinJoinSettle, signinServiceAsk, storeServiceAt, orderAddress, buyAddress };")(...names.map(n => env[n]));
  return Object.assign(api, { posted });
}
const keys = crypto.generateKeyPairSync("ed25519");
const DESK = keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const sign = bytes => crypto.sign(null, bytes, keys.privateKey).toString("hex");
const verify = (bytes, sig) => crypto.verify(null, bytes, keys.publicKey, Buffer.from(sig, "hex"));
const res = (status, obj) => ({ status, bytes: Buffer.from(JSON.stringify(obj)) });

const CASES = {};
/* dji2, the shell's half: `invited` read whole (a bad row dropped, never mended), carried by the answer's words, and handed to the page
   by place with the lead's name and the team's name only. */
CASES.shellInvited = () => {
  const S = shellOf();
  const bad = [{ licence: "xyz", lead: { person: LEAD_P, name: "X" }, team: null, label: null, until: UNTIL },
    { licence: LICENCE, lead: { person: "nothex", name: "X" }, team: null, label: null, until: UNTIL },
    { licence: LICENCE, lead: { person: LEAD_P, name: "X" }, team: "team-1", label: null, until: UNTIL },
    { licence: LICENCE, lead: { person: LEAD_P, name: "<b>X" }, team: null, label: null, until: UNTIL }];
  const read = S.signinInvitedOf(ANSWER_INVITED.concat(bad));
  const view = S.signinInvitedView(read);
  return read.length === 3 && read[0].licence === LICENCE && read[0].lead.person === LEAD_P && read[1].confirm === true && read[0].confirm === undefined
    && read[2].lead.name === "" && S.signinInvitedOf("x").length === 0 && S.signinInvitedOf(null).length === 0
    && JSON.stringify(S.signinInvitedWords(read)) === JSON.stringify({ invited: read }) && JSON.stringify(S.signinInvitedWords([])) === "{}"
    && JSON.stringify(view.slice(0, 2)) === JSON.stringify(PAGE_INVITED) && !has(JSON.stringify(view), LEAD_P) && !has(JSON.stringify(view), LICENCE);
};
/* dji3: Join's body is the ask route's, signed by the desk key over the service's bytes (requests.mjs askBytes: the line, then kind,
   key, licence, lead, team or "-", t); the door takes the ask route beside its four; each answer read as the service gives it. */
CASES.join = async () => {
  const S = shellOf(), inv = S.signinInvitedOf(ANSWER_INVITED);
  const b = S.signinJoinBody(inv[0], DESK, NOW, sign), b2 = S.signinJoinBody(inv[1], DESK, NOW, sign);
  const bytes = Buffer.from(["etiuda-licence-ask", "desk", DESK, LICENCE, LEAD_P, TEAM, String(NOW)].join("\n"), "utf8");
  const bytes2 = Buffer.from(["etiuda-licence-ask", "desk", DESK, "f".repeat(32), "cd".repeat(32), "-", String(NOW)].join("\n"), "utf8");
  let sent = false;
  try { await S.signinServiceAsk(null, S.storeServiceAt("ask"), b); sent = true; } catch { sent = false; }
  let other = false;
  try { await S.signinServiceAsk(null, S.storeServiceAt("ask/refuse"), b); other = true; } catch { other = false; }
  const said = [S.signinJoinOf(res(200, { ok: true, state: "accepted" })), S.signinJoinOf(res(200, { ok: true, state: "waiting", until: UNTIL })),
    S.signinJoinOf(res(404, { ok: false, reason: "no-seat" })), S.signinJoinOf(res(409, { ok: false, reason: "full" })), S.signinJoinOf(null), S.signinJoinOf(res(403, { ok: false, reason: "stale" }))];
  return !!b && Object.keys(b).join() === "kind,key,licence,lead,team,t,sig" && b.kind === "desk" && b.key === DESK && b.licence === LICENCE && b.lead === LEAD_P && b.team === TEAM && b.t === NOW
    && verify(bytes, b.sig) && !!b2 && Object.keys(b2).join() === "kind,key,licence,lead,t,sig" && verify(bytes2, b2.sig)
    && S.signinJoinBody(inv[0], "nothex", NOW, sign) === null && S.signinJoinBody(inv[0], DESK, NOW, () => "") === null
    && sent && !other && S.posted.length === 1 && S.posted[0].url === "https://etiuda.dev/licence/v1/ask" && JSON.stringify(S.posted[0].body) === JSON.stringify(b)
    && said.join() === "accepted,waiting,refused,refused,unreached,refused";
};
/* dji4, the shell's half: a Join answered "waiting" takes the invitation off the list and keeps whom it waits on, beside the leads the
   answer named; one answered "accepted" or refused takes it off and waits on nobody; one unreached keeps the list as it was. The wait is
   kept across an answer only while that answer still names the lead. */
CASES.settle = () => {
  const S = shellOf(), inv = S.signinInvitedOf(ANSWER_INVITED), held = { invited: inv, asked: [] };
  const w = S.signinJoinSettle(held, 1, "waiting"), a = S.signinJoinSettle(held, 0, "accepted"), r = S.signinJoinSettle(held, 0, "refused"), u = S.signinJoinSettle(held, 0, "unreached");
  return w.invited.length === 1 && w.invited[0].licence === LICENCE && w.joinWait === "Bruno" && w.asked.join() === "Bruno"
    && a.invited.length === 1 && a.invited[0].lead.name === "Bruno" && !a.joinWait && r.invited.length === 1 && !r.joinWait
    && u.invited.length === 2 && held.invited.length === 2
    && S.signinJoinWaitKept({ joinWait: "Bruno" }, { asked: ["Bruno"] }) === "Bruno" && S.signinJoinWaitKept({ joinWait: "Bruno" }, { asked: [] }) === ""
    && S.signinJoinWaitKept({}, { asked: ["Bruno"] }) === "";
};
/* dji6: the order page's handoff is the fragment the shell builds from its own view, unchanged: the same value the old screens showed. */
CASES.handoff = () => {
  const S = shellOf({ code: CODE });
  return S.orderAddress("https://etiuda.dev/order/desk", CODE) === "https://etiuda.dev/order/desk#code=" + CODE && S.buyAddress() === "https://etiuda.dev/order/desk#code=" + CODE
    && shellOf({ code: "" }).buyAddress() === "https://etiuda.dev/order/desk";
};
/* dji1, the preload: every view the page is handed comes without the code; the Join press reaches its channel. */
let PRELOAD_SWAP = null;
CASES.preload = async () => {
  const text = PRELOAD_SWAP ? PRELOAD.replace(PRELOAD_SWAP[0], PRELOAD_SWAP[1]) : PRELOAD;
  if (PRELOAD_SWAP && PRELOAD.split(PRELOAD_SWAP[0]).length !== 2) throw new Error("plant anchor not in the preload once");
  const view = { offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "none" }, on = {}, invoked = [];
  const savedWindow = globalThis.window, bridge = {};
  globalThis.window = { addEventListener() {} };
  try {
    new Function("require", "process", text)(n => (n === "electron" ? {
      contextBridge: { exposeInMainWorld: (k, v) => { bridge[k] = v; }, executeInMainWorld: () => {} },
      ipcRenderer: { sendSync: ch => ch === "etiuda:host" ? { platform: "win32" } : ch === "etiuda:signin-state" ? Object.assign({}, view) : null,
        invoke: (ch, a) => { invoked.push([ch, a]); return Promise.resolve(Object.assign({}, view)); }, send: () => {}, on: (ch, fn) => { on[ch] = fn; } },
      webUtils: { getPathForFile: () => "" } } : null), { argv: ["electron", "."] });
  } finally { globalThis.window = savedWindow; }
  const H = bridge.E_HOST || {};
  let told = null;
  if (typeof H.onSignin === "function") H.onSignin(v => { told = v; });
  if (on["etiuda:signin"]) on["etiuda:signin"]({}, Object.assign({}, view));
  const got = [H.signinState(), await H.signIn("microsoft"), await H.signinOut(), await H.signinCheck(), told];
  const joined = typeof H.signinJoin === "function" ? await H.signinJoin(1) : null;
  return got.every(v => !!v && v.signedIn === "microsoft" && !("code" in v)) && !!joined && !("code" in joined)
    && invoked.some(([ch, a]) => ch === "etiuda:signin-join" && a === 1);
};

/* ---- the page's half, in bare node ---------------------------------------------------------------------------------------- */
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const quiet = { contains: () => false, add() {}, remove() {}, toggle() {} };
function hostOn(v, host) {
  globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {}, E_HOST: Object.assign({ signinState: () => v }, host || {}) };
  globalThis.document = { querySelector: () => null, getElementById: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, classList: quiet },
    body: { classList: quiet }, addEventListener() {}, removeEventListener() {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
}
function hostOff() { delete globalThis.window; delete globalThis.document; delete globalThis.getComputedStyle; }
function planted(text, swap, what) {
  if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in " + what + " once: " + swap[0]);
  return import("data:text/javascript;base64," + Buffer.from(text.replace(swap[0], swap[1]).replace(/from "\.\//g, 'from "' + DIR)).toString("base64"));
}
let storage = null, PG = null, SET = null;
try {
  storage = await import(MOD("storage.js"));
  PG = await import(MOD("signin.js"));
  SET = await import(MOD("settings.js"));
} catch (e) { sliced = sliced || "the page did not load: " + e.message; }
const SIGNED = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, reached: true, at: NOW, registered: true, online: true };
const VIEWS = {
  noteam: Object.assign({}, SIGNED, { seat: "held", works: true, now: NOW, until: UNTIL, holding: { on: "trial", ends: UNTIL }, trials: { desk: UNTIL } }),
  none: Object.assign({}, SIGNED, { seat: "none", works: false }),
  asklead: Object.assign({}, SIGNED, { seat: "held", askLead: true, works: true, now: NOW, until: UNTIL, trialUntil: UNTIL, holding: { on: "trial", ends: UNTIL }, trials: { desk: UNTIL } }),
  full: Object.assign({}, SIGNED, { seat: "none", refused: "full", works: false }),
};
/* The panel and Account for `v`, in `lang`; `pg` a planted signin.js where given (Account then still draws the real one). */
function drawn(v, lang, pg, host) {
  storage.lsSet("eUiLang", lang);
  hostOn(v, Object.assign({ buyState: () => ({ offer: true }) }, host || {}));
  try {
    const P = pg || PG, door = P.signinDoor(P.signinRead(v));
    return { door: door ? P.signinPanelHtml(door) : "", moment: door ? door.moment : "", acct: SET.settingsPageHtml("account", ""),
      full: P.firstSigninHtml(P.signinRead(v)) || "" };
  } finally { hostOff(); storage.lsSet("eUiLang", "en"); }
}
/* dji1, bare node: every moment that showed the code, and Account, hold none; English and Polish. */
CASES.pageCodeFree = (pg) => {
  for (const lang of ["en", "pl"]) for (const v of Object.values(VIEWS)) {
    const d = drawn(v, lang, pg);
    if (!codeFree(d.door + d.acct + d.full) || /data-signin-act="copy"/.test(d.door + d.acct + d.full)) return false;
  }
  return !("code" in PG.signinRead(VIEWS.none)) && !("code" in PG.signinParts(PG.signinRead(VIEWS.none)));
};
/* dji2, the page: each waiting invitation, who and which team, with one Join naming its place; in the panel, Account and the full door;
   Polish too. The view's other fields are not read for it. */
CASES.pageInvited = (pg) => {
  const P = pg || PG;
  const read = P.signinRead(Object.assign({}, VIEWS.noteam, { invited: PAGE_INVITED.concat([{ n: "x", lead: "Y", team: "Z" }]) }));
  if (!read.invited || read.invited.length !== 2) return false;
  const en = drawn(Object.assign({}, VIEWS.noteam, { invited: PAGE_INVITED }), "en", pg), pl = drawn(Object.assign({}, VIEWS.none, { invited: PAGE_INVITED }), "pl", pg);
  const joins = h => (String(h).match(/data-signin-act="join" data-signin-invite="(\d+)"/g) || []).map(s => s.replace(/\D+/g, "")).join();
  const enLine = "Ada invites this account to join Front desk.", plLine = "Ada zaprasza to konto do zespołu. Zespół: Front desk.";
  return joins(en.door) === "0,1" && joins(en.acct) === "0,1" && joins(pl.full) === "0,1"
    && has(words(en.door), enLine) && has(words(en.acct), enLine) && has(words(en.door), "Open until") && />Join</.test(en.door)
    && has(words(pl.full), plLine) && has(words(pl.acct), plLine) && />Dołącz</.test(pl.acct) && has(words(pl.acct), "Zaproszenie")
    && joins(drawn(VIEWS.noteam, "en", pg).door) === "";
};
/* dji3/dji5, the page's press: Join hands the shell the invitation's place and nothing else; a refusal is said in one line where it was
   pressed, and the next act clears it. */
CASES.pagePress = async (pg) => {
  const P = pg || PG, asked = [], line = "The invitation could not be taken, so nothing has changed. The team's lead can send a new one.";
  let answer = { refused: "join" };
  const v = Object.assign({}, VIEWS.noteam, { invited: PAGE_INVITED });
  hostOn(v, { signinJoin: n => { asked.push(n); return Promise.resolve(answer); } });
  storage.lsSet("eUiLang", "en");
  try {
    P.signinChanged(v, false);
    await P.signinAct("join", { getAttribute: k => k === "data-signin-invite" ? "1" : null });
    const refused = P.signinPanelHtml(P.signinDoor(P.signinNow()));
    answer = { joined: "accepted" };
    await P.signinAct("join", { getAttribute: k => k === "data-signin-invite" ? "0" : null });
    const after = P.signinPanelHtml(P.signinDoor(P.signinNow()));
    await P.signinAct("join", { getAttribute: () => "nope" });
    return asked.join() === "1,0" && has(words(refused), line) && words(refused).split(line).length === 2 && !has(words(after), line);
  } finally { hostOff(); }
};
/* dji4, the page: a Join waiting for the lead's confirm draws the waiting head and the copywriter's line naming the provider and the lead,
   in the panel and Account; English and Polish. */
CASES.pageWait = (pg) => {
  const v = Object.assign({}, VIEWS.noteam, { joinWait: "Bruno", asked: ["Bruno"] });
  const en = drawn(v, "en", pg), pl = drawn(v, "pl", pg);
  const enLine = "Microsoft does not vouch for this account's address, so Bruno, the team's lead, confirms it next; this computer then takes its seat by itself. Nothing is needed here meanwhile.";
  const plLine = "Microsoft nie poświadcza adresu tego konta, więc teraz potwierdza to lider zespołu: Bruno. Potem ten komputer sam zajmie miejsce; tutaj nic nie trzeba robić.";
  return has(words(en.door), "The request to join is waiting.") && has(words(en.door), enLine) && has(words(en.acct), enLine)
    && has(words(pl.door), "Prośba o dołączenie czeka.") && has(words(pl.door), plLine) && has(words(pl.acct), plLine)
    && (pg || PG).deskDoorState(Object.assign({}, VIEWS.none, { joinWait: "Bruno", asked: ["Bruno"], seat: "" })).waitingOnLead === true;
};
/* The door's and Account's words say how a seat comes now (the copywriter's, 22 November 2026). */
CASES.pageWords = (pg) => {
  const none = drawn(VIEWS.none, "en", pg), noBuy = (() => { storage.lsSet("eUiLang", "en"); hostOn(VIEWS.none, { buyState: () => ({ offer: false }) });
    try { const P = pg || PG, d = P.signinDoor(P.signinRead(VIEWS.none)); return P.signinPanelHtml(d); } finally { hostOff(); } })();
  const ask = drawn(VIEWS.asklead, "en", pg), full = drawn(VIEWS.full, "en", pg), out = drawn({ offered: ["microsoft", "google"] }, "en", pg);
  const team = drawn(Object.assign({}, VIEWS.noteam), "en", pg);
  return has(words(none.door), "A seat comes from a team's lead, by an invitation to this account's email address or a link, or from a purchase;")
    && has(words(noBuy), "A seat comes from a team's lead, by an invitation to this account's email address or a link; another account")
    && has(words(ask.door), "The team's lead invites this account by its email address, and the invitation appears here with one Join;")
    && has(words(full.door), "This computer takes a seat by itself as soon as one is free; nothing is needed here.")
    && has(words(team.acct), "No team has admitted this account yet. A lead can invite it by its email address or send a link; the catalog then arrives by itself.")
    && has(words(team.acct), "The order page opens in the browser, and the licence bought there is this account's.")
    && has(words(out.acct), "A licence is bought for the account signed in here, so signing in comes first.");
};
/* dji7: no paste field outside the empty desk: Settings, the Library and the Menu draw no Join a team, no request card offers it, and the
   paste's routine is called from the empty desk alone. */
CASES.noPaste = () => {
  const cardActs = (TEAMJOIN.match(/\["join",t\("Join a team"\)\]/g) || []).length;
  return !/setJoinTeam/.test(SETTINGS) && !/mgJoinTeam/.test(MANAGE) && !/id="menuJoin"/.test(TEMPLATE) && !/openJoinPaste/.test(MENUS) && !/openJoinPaste/.test(SETTINGS)
    && !/openJoinPaste|joinDoorButton/.test(MANAGE) && cardActs === 0;
};

/* ---- the built page, in headless Chrome ----------------------------------------------------------------------------------- */
async function builtPage() {
  const E = require("./engine.js");
  E.ensureOutputs();
  const { default: puppeteer } = await import("puppeteer-core");
  const url = "file:///" + path.join(ROOT, "engine", "etiuda.html").replace(/\\/g, "/");
  const browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: "new", args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = { free: [], bubble: null };
  try {
    const open = async v => {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await page.evaluateOnNewDocument(c => {
        window.__deskStore = { eTourSeen: "1" }; window.__signinState = c; window.__signinCbs = []; window.__joins = [];
        window.E_HOST = { shown: true, lang: "en", deskRead: () => JSON.stringify(window.__deskStore), deskSave: t => { window.__deskStore = JSON.parse(t); return true; },
          signinState: () => window.__signinState, onSignin: fn => { window.__signinCbs.push(fn); return () => {}; }, buyState: () => ({ offer: true }),
          signinJoin: async n => { window.__joins.push(n); window.__signinState = Object.assign({}, window.__signinState, { invited: undefined, joinWait: "Bruno", asked: ["Bruno"] });
            return { joined: "waiting" }; } };
      }, v);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await sleep(1500);
      return { ctx, page };
    };
    const allText = page => page.evaluate(() => document.documentElement.outerHTML + [...document.querySelectorAll("input,textarea")].map(f => f.value).join(" ")
      + (navigator.clipboard ? "" : ""));
    for (const v of [VIEWS.noteam, VIEWS.asklead, VIEWS.none, VIEWS.full]) {
      const { ctx, page } = await open(Object.assign({}, v, { invited: PAGE_INVITED }));
      const shots = [await allText(page)];
      await page.evaluate(() => { const b = document.getElementById("signinBtn"); if (b && b.getClientRects().length) b.click(); });
      await sleep(300);
      shots.push(await allText(page));
      await page.evaluate(() => { const b = document.querySelector('[data-signin-act="account"]'); if (b) b.click(); });
      await sleep(700);
      shots.push(await allText(page));
      out.free.push(shots.every(codeFree) && /Ada invites this account to join Front desk\./.test(shots.join(" ")));
      await ctx.close();
    }
    /* The blue bubble from the account button, its Join, and the waiting line after it. */
    {
      const { ctx, page } = await open(Object.assign({}, VIEWS.noteam, { invited: PAGE_INVITED }));
      const b = await page.evaluate(() => {
        const el = document.getElementById("eInviteAsk");
        const join = el ? el.querySelector('[data-signin-act="join"][data-signin-invite="1"]') : null;
        return { there: !!el && el.classList.contains("bub-ask") && !el.hidden, joins: el ? el.querySelectorAll('[data-signin-act="join"]').length : 0, text: el ? el.textContent : "",
          pressed: join ? (join.click(), true) : false };
      });
      await sleep(400);
      const after = await page.evaluate(() => {
        window.__signinCbs.forEach(fn => fn(window.__signinState));
        const btn = document.getElementById("signinBtn"); if (btn) btn.click();
        return new Promise(r => setTimeout(() => r({ joins: window.__joins.slice(), bubble: !!document.getElementById("eInviteAsk"),
          panel: (document.getElementById("signinPanel") || {}).textContent || "" }), 300));
      });
      out.bubble = b.there && b.joins === 2 && /Ada invites this account to join Front desk\./.test(b.text) && b.pressed
        && after.joins.join() === "1" && !after.bubble && /The request to join is waiting\./.test(after.panel) && /Bruno, the team's lead, confirms it next/.test(after.panel);
      await ctx.close();
    }
  } finally { await browser.close(); }
  return out;
}

/* ---- the run -------------------------------------------------------------------------------------------------------------- */
if (sliced) console.log("  (the slices did not load: " + sliced + ")");
const run = async (name, arg) => { try { return !sliced && (await CASES[name](arg)) === true; } catch (e) { console.log("    (" + name + " threw: " + e.message + ")"); return false; } };
let built = null;
try { built = sliced ? null : await builtPage(); } catch (e) { console.log("    (the built page threw: " + e.message + ")"); }
check(!!built && built.free.length === 4 && built.free.every(Boolean) && await run("pageCodeFree") && await run("preload"),
  "dji1 no desk screen holds the sign-in code (the built page's panel, Account and full door over a view carrying one; the same in bare node, Polish too), and the preload hands the page none");
check(await run("shellInvited") && await run("pageInvited"),
  "dji2 `invited` is read whole and handed by place without pseudonym or licence; each waiting invitation is drawn, who and which team, with one Join, in the panel, Account and the full door, Polish too");
check(!!built && built.bubble === true, "dji2b the built page hangs the invitations from the account button in a blue bubble; its Join reaches the shell, and the waiting line follows");
check(await run("join") && await run("pagePress"), "dji3 Join sends the existing ask, kind desk, the lead's person and the team, signed by the desk key over the service's bytes, through the service's door; the page hands only the place");
check(await run("settle") && await run("pageWait"), "dji4 a Join answered waiting leaves the desk in the drawn waiting state, with the line naming the provider and the lead, in the panel and Account");
check(await run("pagePress"), "dji5 a refused Join says so in one line, where it was pressed, until the next act");
check(await run("handoff"), "dji6 Buy's handoff to the order page is unchanged in shape: the fragment the shell builds from its own view");
check(await run("pageWords"), "dji6b the door's and Account's words say how a seat comes now: a lead's invitation to the address, a link, or a purchase where Buy is shown; signed out, Buy says signing in comes first");
check(await run("noPaste"), "dji7 no paste field outside the empty desk: Settings, the Library and the Menu draw no Join a team, and no request card offers the paste");

/* ---- the plants ----------------------------------------------------------------------------------------------------------- */
async function plantShell(id, swap, name, line) {
  let red = false;
  SHELL_SWAP = swap;
  try { red = SHELL.split(swap[0]).length === 2 && !(await run(name)); } finally { SHELL_SWAP = null; }
  check(red, id + " " + line);
}
async function plantPage(id, swap, name, line, src) {
  let red = false, why = "";
  try { const mod = await planted(src || SIGNIN, swap, "signin.js"); red = !(await run(name, mod)); } catch (e) { why = e.message; }
  check(red, id + " " + line + (why ? " (" + why + ")" : ""));
}
if (!PLANTS_OFF && !sliced) {
  await plantShell("djp1", ["if (!/^[0-9a-f]{64}$/.test(String(lead.person))) continue; /* plant:invited-person */", ""], "shellInvited", "invited-person cut: a row naming no pseudonym would be kept");
  await plantShell("djp2", ["const SIGNIN_ASK_LINE = \"etiuda-licence-ask\"; /* plant:ask-line */", "const SIGNIN_ASK_LINE = \"etiuda-licence-ask-status\";"], "join", "ask-line changed: the signature would be another route's");
  await plantShell("djp3", ["return Object.assign({ kind: \"desk\", key: String(desk), licence: inv.licence, lead: inv.lead.person }, inv.team ? { team: inv.team } : {}, { t: t, sig: sig }); /* plant:join-body */",
    "return { kind: \"desk\", key: String(desk), licence: inv.licence, lead: inv.lead.person, t: t, sig: sig };"], "join", "join-body without the team: the ask would name none");
  await plantShell("djp4", ["if (res.status === 200 && j && j.ok === true && (j.state === \"accepted\" || j.state === \"waiting\")) return j.state; /* plant:join-answer */",
    "if (res.status === 200 && j && j.ok === true) return \"accepted\";"], "join", "join-answer: a waiting answer would read as accepted");
  await plantShell("djp5", ["if (said === \"waiting\") Object.assign(out, { joinWait: lead, asked: asked.indexOf(lead) >= 0 ? asked : asked.concat([lead]).slice(0, 8) }); /* plant:join-wait */", ""],
    "settle", "join-wait cut: a confirm waiting would leave the desk saying nothing waits");
  await plantShell("djp6", ["storeServiceAt(\"ask\")].indexOf(String(url)) < 0", "].indexOf(String(url)) < 0"], "join", "the service's door without ask: the Join would never leave");
  await plantShell("djp7", ["return list.map((x, n) => Object.assign({ n: n, lead: x.lead.name, team: x.label || x.team || \"\", until: x.until }, x.confirm ? { confirm: true } : {})); /* plant:invited-view */",
    "return list.map((x, n) => Object.assign({ n: n, lead: x.lead.name, team: x.label || x.team || \"\", until: x.until, person: x.lead.person }, x.confirm ? { confirm: true } : {}));"],
    "shellInvited", "invited-view handing the pseudonym: the page would hold the lead's key");
  {
    let red = false;
    PRELOAD_SWAP = ["delete o.code; /* plant:page-view-code */", ""];
    try { red = !(await run("preload")); } finally { PRELOAD_SWAP = null; }
    check(red, "djp8 page-view-code cut in the preload: the page would be handed the code");
  }
  await plantPage("djp9", ["invited: signedIn ? signinInvitedRead(o.invited) : [], /* plant:read-invited */", "invited: [],"], "pageInvited", "read-invited cut: no invitation would be drawn");
  await plantPage("djp10", ["if(d.invited && d.invited.length) h+=signinInvitedHtml(d.invited, d.joinSaid); /* plant:panel-invited */", ""], "pageInvited", "panel-invited cut: the panel would draw no Join");
  await plantPage("djp11", ["return signinCall(\"signinJoin\", n).then(r=>{ signinJoinRefused=!!(r && r.refused); signinChanged(signinNow(), false); return r; }); /* plant:join-act */",
    "return Promise.resolve(null);"], "pagePress", "join-act cut: a press would ask the shell nothing");
  await plantPage("djp12", ["signinJoinRefused=!!(r && r.refused);", "signinJoinRefused=false;"], "pagePress", "the refusal unsaid: a refused Join would look like nothing happened");
  await plantPage("djp13", ["const waitingOnLead=!!(v.askLead || signinNoSeat(v) || v.joinWait); /* B-3a feeds this */ /* plant:door-waiting-noseat */",
    "const waitingOnLead=!!(v.askLead || signinNoSeat(v)); /* B-3a feeds this */ /* plant:door-waiting-noseat */"], "pageWait", "door-waiting without the Join's wait: the door would not wait on the lead");
  await plantPage("djp14", ["if(v.joinWait && !signinSeatTaken(ds)) return {moment:\"joinwait\", ident, say:signinJoinWaitWords(v), acts:[{act:\"check\", label:t(\"Check now\")}, acct]}; /* plant:joinwait-moment */", ""],
    "pageWait", "joinwait-moment cut: the panel would not say the request waits for the lead's confirm");
  await plantPage("djp15", ["return [t(\"No Etiuda licence has a seat for this account.\"), buyOffered() ? t(\"The sign-in worked. A seat comes from a team's lead, by an invitation to this account's email address or a link, or from a purchase; another account can be used meanwhile.\")",
    "return [t(\"No Etiuda licence has a seat for this account.\"), false ? t(\"The sign-in worked. A seat comes from a team's lead, by an invitation to this account's email address or a link, or from a purchase; another account can be used meanwhile.\")"],
    "pageWords", "the purchase named where Buy is not shown, or not where it is: the words would not follow Buy");
}

console.log((failed ? "FAIL" : "ok") + " desk-join-invited: " + (asserted - failed) + "/" + asserted + " checks"
  + (asserted !== EXPECTED ? " (expected " + EXPECTED + ": the run did not complete)" : ""));
process.exit(asserted !== EXPECTED ? Math.max(1, Math.min(failed, 63)) : Math.min(failed, 63));
