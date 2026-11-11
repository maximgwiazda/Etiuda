/* The organisation's own model on the desk, stage 1, offline: shell/desk-ai.cjs and where shell/main.js asks it.
 *
 *   node tests/desk-ai.mjs            exit code is the number of failed checks, capped at 63
 *
 * With deskAiConfig() null, nothing is fetched, by the main search or by the picker (da1). With a configuration, what is
 * fetched carries the query and the shortlist's texts and nothing planted beside them (da2). A late answer, and an
 * answer after the agent's key, are dropped (da3). Three failures in a row pause the asks for a minute (da4). INSTANT_FROM
 * gives the built-in model's strip or the words' at once, and the organisation's order then paints the strip again (da5).
 * Each service's request and answer hold their recorded shape, and the door refuses what is not its own (da6). The page
 * keeps the order for its query and generation only (da7). The window follows the median of the real answer times inside
 * its floor and ceiling, a median over the ceiling is said as slow and unsaid below it, and the door's answer and the
 * connection test carry their time (da8). Each guard
 * is lifted once, in a copy held in memory, and its leg must then fail. No leg reaches a network: every fetch is a
 * stand-in, and the global fetch throws.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHELL = path.join(ROOT, "shell");
const nodeRequire = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 35;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
/* A section that throws says so and stops there; the floor below then counts the checks it did not reach. */
async function block(fn) {
  try { await fn(); } catch (e) { failed++; console.log("  FAIL a section stopped: " + String(e && e.message || e).split(/\r?\n/)[0]); }
}
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(test, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (test()) return true; await tick(5); }
  return test();
}
let wallHits = 0;
globalThis.fetch = () => { wallHits++; throw new Error("no network in a leg"); };

/* ---- the module, and copies of it with one guard lifted ---------------------------------------------------------- */
const AI_SRC = fs.readFileSync(path.join(SHELL, "desk-ai.cjs"), "utf8");
function edited(src, from, to) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error("plant anchor found " + n + " times: " + from);
  return src.replace(from, to);
}
function aiFrom(src) {
  const mod = { exports: {} };
  new Function("require", "module", "exports", src)(nodeRequire, mod, mod.exports);
  return mod.exports;
}
const AI = aiFrom(AI_SRC);

/* A fetch from memory: `answer(url, init)` gives {status, text} or a promise of it, and every call is kept. */
function fetchOf(answer) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url: String(url), init });
    const a = await answer(url, init, calls.length);
    const bytes = Buffer.from(String(a.text == null ? "" : a.text), "utf8");
    return { status: a.status == null ? 200 : a.status, headers: { get: () => null }, arrayBuffer: async () => bytes };
  };
  f.calls = calls;
  return f;
}
const chatSaying = text => JSON.stringify({ choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }] });

/* ---- the shell, electron stubbed, a desk window and a picker made here --------------------------------------------- */
const MAIN_SRC = fs.readFileSync(path.join(SHELL, "main.js"), "utf8");
/* Each name of the stage is read only where main.js has it, so a tree without it says which legs fail rather than stopping. */
const MAIN_TAIL = "\n__test.setWindow = w => { theWindow = w; }; __test.embedSuggest = embedSuggest; __test.pickWithClip = pickWithClip;"
  + " __test.bumpPress = () => ++pickPress; __test.pickWin = () => pickWin;"
  + " __test.setConfig = f => { if (typeof deskAiConfig === 'function') deskAiConfig = f; };"
  + " __test.deskReorder = typeof deskReorder === 'undefined' ? { ask: async () => null } : deskReorder;"
  + " __test.orgSearch = typeof orgSearch === 'function' ? orgSearch : async () => {};"
  + " __test.deskAiTest = typeof deskAiTest === 'function' ? deskAiTest : async () => ({});";
const ENGINE = { sender: { id: 1, once: () => {} }, senderFrame: { parent: null, url: "file:///C:/lab/engine/etiuda.html" } };
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });

function loadMain(opts) {
  const o = opts || {};
  const UD = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-ai-"));
  const on = {}, handle = {}, made = [];
  function Win(wopts) {
    this.opts = wopts || {};
    this.visible = false;
    this.sends = [];
    this.wc = {};
    const self = this;
    this.webContents = {
      id: 100 + made.length,
      send: (ch, ...args) => self.sends.push({ ch, args }),
      on: (k, fn) => { (self.wc[k] = self.wc[k] || []).push(fn); },
      once: (k, fn) => { (self.wc[k] = self.wc[k] || []).push(fn); },
      setWindowOpenHandler: () => {}, getURL: () => "", blur: () => {},
    };
    made.push(this);
  }
  Win.prototype.on = function () {};
  Win.prototype.once = function () {};
  Win.prototype.isDestroyed = function () { return false; };
  Win.prototype.isVisible = function () { return this.visible; };
  Win.prototype.show = function () { this.visible = true; };
  Win.prototype.hide = function () { this.visible = false; };
  ["focus", "blur", "center", "setBounds", "loadURL", "loadFile", "destroy"].forEach(n => { Win.prototype[n] = function () {}; });
  Win.fromWebContents = () => inert;
  Win.getAllWindows = () => made;
  const fetch = o.fetch || fetchOf(() => ({ status: 500, text: "" }));
  const electron = {
    app: { getPath: () => UD, setPath: () => {}, requestSingleInstanceLock: () => false, quit: () => {}, on: () => {}, getVersion: () => "0.0.0",
      getLocale: () => "en", getPreferredSystemLanguages: () => ["en"], whenReady: () => new Promise(() => {}),
      commandLine: { appendSwitch: () => {}, hasSwitch: () => false }, setAppUserModelId: () => {}, getLoginItemSettings: () => ({ openAtLogin: false }),
      setLoginItemSettings: () => {} },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { handle[ch] = fn; } },
    BrowserWindow: Win, Menu: { setApplicationMenu: () => {}, buildFromTemplate: () => ({ popup() {} }) }, dialog: inert,
    net: { fetch: (u, init) => fetch(u, init) }, protocol: inert, session: inert, screen: inert, shell: inert,
    systemPreferences: inert, nativeTheme: { themeSource: "system" }, clipboard: inert, globalShortcut: inert,
    nativeImage: { createFromPath: p => ({ path: p, isEmpty: () => false }) }, Tray: function () {}, Notification: function () {},
    safeStorage: { isEncryptionAvailable: () => false, encryptString: () => { throw new Error("no"); }, decryptString: () => { throw new Error("no"); } },
    utilityProcess: inert,
  };
  const aiCopy = o.aiSrc ? aiFrom(o.aiSrc) : null;
  const fakeRequire = n => (n === "electron" ? electron : aiCopy && /desk-ai\.cjs$/.test(String(n)) ? aiCopy : nodeRequire(n));
  const T = {};
  const quiet = { log: () => {}, error: () => {}, warn: () => {}, info: () => {} };
  new Function("require", "__dirname", "__filename", "module", "exports", "console", "__test", (o.mainSrc || MAIN_SRC) + MAIN_TAIL)(
    fakeRequire, SHELL, path.join(SHELL, "main.js"), { exports: {} }, {}, quiet, T);
  /* The desk's window: it answers the shell's questions as the page would, through main's own answer handler. */
  const asked = [];
  const desk = new Win({});
  desk.answer = o.answer || (() => null);
  desk.webContents.send = (ch, ...args) => {
    desk.sends.push({ ch, args });
    if (ch !== "etiuda:pick-ask") return;
    const [n, op, arg] = args;
    asked.push({ op, arg: JSON.parse(arg) });
    setImmediate(() => on["etiuda:pick-answer"](ENGINE, n, JSON.stringify(desk.answer(op, JSON.parse(arg)))));
  };
  desk.touch = type => (desk.wc["input-event"] || []).forEach(fn => fn({}, { type }));
  T.setWindow(desk);
  return { on, handle, T, desk, asked, made, fetch, electron };
}

/* A small catalog's suggestion model, built by the page's own builder. */
const { buildSuggestModel } = await import(pathToFileURL(path.join(ROOT, "src", "modules", "clip-suggest.js")).href);
const CAT = {
  cards: [
    { id: "c1", title: { en: "Lamp care" }, body: { en: "Wipe the lantern glass and trim the wick before lighting." }, requests: ["t:lamp"] },
    { id: "c2", title: { en: "Tea service" }, body: { en: "The kettle brews tea for the guests at four." }, requests: ["t:tea"] },
    { id: "c3", title: { en: "Parcel post" }, body: { en: "A parcel goes by post within two days." }, requests: ["t:post"] },
  ],
  tags: [
    { kind: "request", id: "t:lamp", topic: { en: "Mending a lantern" }, clause: { en: "the lantern wick needs mending" } },
    { kind: "request", id: "t:tea", topic: { en: "Brewing tea" }, clause: { en: "the kettle brews tea" } },
    { kind: "request", id: "t:post", topic: { en: "Sending a parcel" }, clause: { en: "a parcel sent by post" } },
  ],
};
const MODEL = buildSuggestModel(CAT, { suggest: "Suggested", suggestTip: "" });
const MESSAGE = "Could you tell me how the kettle brews tea and whether the lantern wick needs mending, and also the parcel post?";
const openAnswer = (op) => op === "open" ? { profiles: MODEL, epoch: 1, ai: true, words: {}, look: {} } : op === "suggest-open" ? { ok: 1 } : null;
/* The built-in model, as the shell holds it, answering from memory; `ranks` counts its asks. */
function builtinFrom(T, rows) {
  const e = T.embedSuggest;
  e.ranks = 0; e.searchRanks = 0;
  e.installed = () => true; e.readyFor = () => true; e.warm = () => {}; e.setOn = () => {}; e.setSearchOn = () => {};
  e.prepareSearch = () => ({ ready: true });
  e.rank = () => { e.ranks++; return Promise.resolve(rows); };
  e.searchRank = () => { e.searchRanks++; return Promise.resolve({ cards: ["c3"], intents: [] }); };
  return e;
}
/* One opening of the picker, driven to its end: its window made and loaded, shown, and the organisation's order given time. */
async function openPicker(ctx, text, wait) {
  const press = ctx.T.bumpPress();
  ctx.T.pickWithClip(press, Promise.resolve(null), text);
  await until(() => ctx.T.pickWin(), 2000);
  const pw = ctx.T.pickWin();
  if (pw) (pw.wc["did-finish-load"] || []).splice(0).forEach(fn => fn());
  await until(() => pw && pw.visible, 2000);
  await tick(wait || 60);
  const opens = pw ? pw.sends.filter(s => s.ch === "etiuda:pick-open").map(s => JSON.parse(s.args[0]).suggest || []) : [];
  return { pw, opens: opens.map(list => list.map(r => r.id)) };
}
const CONFIG = { provider: "openai", endpoint: "", model: "plant-model", key: "sk-plant-key-0001", managed: {} };
const ROWS = [
  { surface: "card", id: "c1", text: "title: Lamp care | text: Wipe the lantern glass and trim the wick before lighting." },
  { surface: "card", id: "c2", text: "title: Tea service | text: The kettle brews tea for the guests at four." },
  { surface: "card", id: "c3", text: "title: PLANT-CATALOG-c3 | text: C:\\Users\\plant\\Documents\\Etiuda\\plant-desk.ec" },
  { surface: "intent", id: "t:lamp", text: "title: Mending a lantern | text: the lantern wick needs mending" },
];

/* ---- da1 the floor: no configuration, no request -------------------------------------------------------------- */
async function floorDrive(config) {
  const fetch = fetchOf(() => ({ status: 200, text: chatSaying("[2,1]") }));
  const ctx = loadMain({ fetch, answer: (op, a) => op === "search-shortlist" ? { q: a.q, gen: 1, cards: ["c1", "c2"], intents: [] } : openAnswer(op) });
  builtinFrom(ctx.T, [{ id: "t:lamp", score: 0.9 }]);
  if (config) ctx.T.setConfig(() => config);
  ctx.on["etiuda:search-set"](ENGINE, true);
  await ctx.handle["etiuda:search-prepare"](ENGINE, ROWS);
  for (const q of ["lantern", "lantern wick", "kettle tea"]) { await ctx.handle["etiuda:search-rank"](ENGINE, q); await tick(AI.SETTLE_MS + 60); }
  await ctx.T.orgSearch("parcel post");
  await ctx.T.deskReorder.ask("parcel post", ["a", "b"]);
  await openPicker(ctx, MESSAGE, 80);
  return { fetches: fetch.calls.length, shortlists: ctx.asked.filter(a => a.op === "search-shortlist").length, state: ctx };
}
await block(async () => {
  const off = await floorDrive(null);
  const aiState = (() => { const e = Object.assign({ returnValue: undefined }, ENGINE); off.state.on["etiuda:ai-state"](e); return e.returnValue; })();
  check(off.fetches === 0 && off.shortlists === 0 && aiState && aiState.org === false,
    "da1 with deskAiConfig() null nothing is fetched by the main search, an ask or the picker, and the page is asked for no shortlist: fetches "
    + off.fetches + ", shortlists " + off.shortlists + ", ai-state " + JSON.stringify(aiState));
  const onDrive = await floorDrive(CONFIG);
  check(onDrive.fetches >= 2,
    "da1c with a configuration the same drive does fetch, so the count above can see a request: fetches " + onDrive.fetches);
});

/* ---- da2 what leaves: the query and the shortlist's texts, nothing planted --------------------------------------- */
const PLANTS = ["PLANT-LICENCE-7731", "PLANT-TEAM-4410", "C:\\Users\\plant", "PLANT-CATALOG-c3", "plant-desk.ec"];
async function leavesDrive(aiSrc) {
  const fetch = fetchOf(() => ({ status: 200, text: chatSaying("[2,1,3]") }));
  const ctx = loadMain({ fetch, aiSrc, answer: (op, a) => op === "search-shortlist" ? { q: a.q, gen: 7, cards: ["c1", "c2"], intents: ["t:lamp"] } : null });
  builtinFrom(ctx.T, []);
  ctx.T.setConfig(() => Object.assign({ licence: PLANTS[0], team: PLANTS[1], folder: "C:\\Users\\plant\\Documents\\Etiuda" }, CONFIG));
  ctx.on["etiuda:search-set"](ENGINE, true);
  await ctx.handle["etiuda:search-prepare"](ENGINE, ROWS);
  const first = await ctx.handle["etiuda:search-rank"](ENGINE, "lantern wick");
  await until(() => ctx.asked.some(a => a.op === "search-reorder"), 2000);
  const call = fetch.calls[0] || { url: "", init: { headers: {}, body: Buffer.alloc(0) } };
  const body = Buffer.from(call.init.body || []).toString("utf8");
  const headers = call.init.headers || {};
  const all = call.url + "\n" + JSON.stringify(headers) + "\n" + body;
  const found = PLANTS.filter(p => all.split(p).length > 1 || body.split(JSON.stringify(p).slice(1, -1)).length > 1);
  const doc = (() => { try { return JSON.parse(body); } catch { return null; } })();
  const user = doc && doc.messages ? String(doc.messages[1] && doc.messages[1].content) : "";
  const reorder = ctx.asked.find(a => a.op === "search-reorder");
  return {
    first, call, found, user, reorder, fetches: fetch.calls.length,
    keyOnlyInAuth: body.indexOf(CONFIG.key) < 0 && call.url.indexOf(CONFIG.key) < 0 && headers.authorization === "Bearer " + CONFIG.key,
    holds: ["lantern wick", "Wipe the lantern glass", "The kettle brews tea", "the lantern wick needs mending"].every(s => user.indexOf(s) > -1),
    keys: Object.keys(doc || {}).sort().join(","),
  };
}
await block(async () => {
  const r = await leavesDrive();
  check(r.fetches === 1 && r.call.url === "https://api.openai.com/v1/chat/completions" && r.holds && r.found.length === 0 && r.keyOnlyInAuth
    && r.keys === "messages,model" && r.call.init.redirect === "error" && r.call.init.credentials === "omit",
    "da2 with a configuration the request goes to the service's address and carries the query and the shortlist's three texts, the key only "
    + "as its bearer, and none of " + PLANTS.length + " planted values (licence, team, path, a card not shortlisted): fetches " + r.fetches
    + ", url " + r.call.url + ", fields " + r.keys + ", found " + JSON.stringify(r.found));
  check(r.reorder && JSON.stringify(r.reorder.arg) === JSON.stringify({ q: "lantern wick", gen: 7, cards: ["c2", "c1"], intents: ["t:lamp"] })
    && r.first && Array.isArray(r.first.cards) && r.first.cards[0] === "c3",
    "da2b the built-in order answers first and the organisation's order of the shortlist goes back to the page once, for the same query and generation: "
    + JSON.stringify(r.reorder && r.reorder.arg));
  const lifted = await leavesDrive(edited(AI_SRC, "const text = orderText(query, items);",
    "const text = orderText(query, items) + JSON.stringify(config);"));
  check(lifted.found.length > 0, "da2p with the whole configuration put into the request, the leg above finds the plants: " + JSON.stringify(lifted.found));
});

/* ---- da3 a late answer and an answer after a key are dropped ---------------------------------------------------- */
async function lateLeg(aiSrc) {
  const A = aiSrc ? aiFrom(aiSrc) : AI;
  const fetch = fetchOf(() => tick(120).then(() => ({ status: 200, text: chatSaying("[2,1]") })));
  const r = A.createReorder({ config: () => CONFIG, fetch, windowMs: 50 });
  const t0 = Date.now();
  const order = await r.ask("q", ["a", "b"]);
  return { order, ms: Date.now() - t0, failures: r.state().failures, fetches: fetch.calls.length };
}
await block(async () => {
  const late = await lateLeg();
  check(late.order === null && late.failures === 1 && late.fetches === 1 && late.ms < 110,
    "da3 an answer after the window is dropped, counted as a failure, and the ask gives up at the window: order " + JSON.stringify(late.order)
    + ", failures " + late.failures + ", " + late.ms + " ms");
  const lifted = await lateLeg(AI_SRC.indexOf("done(null), windowMs)") > -1
    ? edited(edited(AI_SRC, "done(null), windowMs)", "done(null), 1e9)"), "if (!res || now() - began > windowMs) return failed();", "if (!res) return failed();")
    : edited(AI_SRC, "try { res = await door(o.fetch, req, windowMs); }", "try { res = await door(o.fetch, req, 1e9); }")
      .replace("if (now() - began > windowMs) return failed();", ""));
  check(lifted.order !== null, "da3p with the window lifted, the late answer is taken and the leg above fails: " + JSON.stringify(lifted.order));

  const fetch = fetchOf(() => ({ status: 200, text: chatSaying("[2,1]") }));
  const r = AI.createReorder({ config: () => CONFIG, fetch });
  const dropped = await r.ask("q", ["a", "b"], () => false);
  check(dropped === null && r.state().failures === 0, "da3b an answer the caller no longer wants is dropped, and is no failure: failures " + r.state().failures);
});
async function keyLeg(mainSrc) {
  let release = null;
  const gate = new Promise(done => { release = done; });
  const fetch = fetchOf(() => gate.then(() => ({ status: 200, text: chatSaying("[2,1,3]") })));
  const ctx = loadMain({ fetch, mainSrc, answer: (op, a) => op === "search-shortlist" ? { q: a.q, gen: 3, cards: ["c1", "c2"], intents: ["t:lamp"] } : null });
  ctx.T.setConfig(() => CONFIG);
  ctx.on["etiuda:search-set"](ENGINE, true);
  await ctx.handle["etiuda:search-prepare"](ENGINE, ROWS);
  await ctx.handle["etiuda:search-rank"](ENGINE, "lantern wick");
  await until(() => fetch.calls.length === 1, 2000);
  return { ctx, release, fetch };
}
await block(async () => {
  /* Driven through main's own countTouches on the desk's stand-in webContents, as createWindow wires it. */
  const MAIN_KEYED = edited(MAIN_SRC, "const deskReorder = deskAi.createReorder({",
    "if (typeof __test === \"object\") __test.wireDesk = w => countTouches(w.webContents, () => { deskTouches++; });\nconst deskReorder = deskAi.createReorder({");
  async function pressed(src) {
    const k = await keyLeg(src);
    k.ctx.T.wireDesk(k.ctx.desk);
    k.ctx.desk.touch("keyDown");
    k.release();
    await tick(80);
    return k.ctx.asked.filter(a => a.op === "search-reorder").length;
  }
  const afterKey = await pressed(MAIN_KEYED);
  const k2 = await keyLeg(MAIN_KEYED);
  k2.ctx.T.wireDesk(k2.ctx.desk);
  k2.ctx.desk.touch("mouseMove");
  k2.release();
  await until(() => k2.ctx.asked.some(a => a.op === "search-reorder"), 1000);
  const untouched = k2.ctx.asked.filter(a => a.op === "search-reorder").length;
  check(afterKey === 0 && untouched === 1,
    "da3c an order that answers after the agent's key is not sent to the page; with only the pointer passing, it is: after a key "
    + afterKey + ", pointer only " + untouched);
  const liftedCount = await pressed(edited(MAIN_KEYED, "() => deskTouches === touched", "() => true"));
  check(liftedCount === 1, "da3p with the touch check lifted, the order after the key reaches the page and the leg above fails: " + liftedCount);
});

/* ---- da4 three failures in a row pause the asks for a minute ------------------------------------------------------ */
async function pauseLeg(aiSrc) {
  const A = aiSrc ? aiFrom(aiSrc) : AI;
  let clock = 1000000;
  const states = [];
  const fetch = fetchOf(() => ({ status: 503, text: "{}" }));
  const r = A.createReorder({ config: () => CONFIG, fetch, now: () => clock, onState: s => states.push(s) });
  for (let i = 0; i < 4; i++) await r.ask("q", ["a", "b"]);
  const during = fetch.calls.length;
  const pausedState = states[states.length - 1];
  const activeDuring = r.active();
  clock += A.PAUSE_MS + 1;
  await r.ask("q", ["a", "b"]);
  return { during, after: fetch.calls.length, pausedState, activeDuring, activeAfter: r.active() };
}
await block(async () => {
  const p = await pauseLeg();
  check(p.during === 3 && p.after === 4 && p.activeDuring === false && p.pausedState && p.pausedState.ranking === "builtin"
    && p.pausedState.failures === 3 && p.pausedState.pausedUntil === 1000000 + AI.PAUSE_MS,
    "da4 three failures in a row stop the asks for " + AI.PAUSE_MS + " ms, the state says the built-in model ranks, and the next ask after "
    + "it is tried: fetches during " + p.during + ", after " + p.after + ", state " + JSON.stringify(p.pausedState));
  const lifted = await pauseLeg(edited(AI_SRC, "if (failures >= FAILS_TO_PAUSE)", "if (false)"));
  check(lifted.during === 4, "da4p with the pause lifted, the fourth ask is sent and the leg above fails: " + lifted.during);
  const fetch = fetchOf((u, init, n) => n === 1 ? { status: 500, text: "" } : { status: 200, text: chatSaying("[1,2]") });
  const states = [];
  const r = AI.createReorder({ config: () => CONFIG, fetch, onState: s => states.push(s) });
  await r.ask("q", ["a", "b"]);
  await r.ask("q", ["a", "b"]);
  check(states.length === 2 && states[0].ranking === "builtin" && states[0].failures === 1 && states[1].ranking === "organisation"
    && states[1].failures === 0, "da4b an answer after a failure resets the count and the state says the organisation's model ranks: "
    + JSON.stringify(states));
  const ctx = loadMain({ fetch: fetchOf(() => ({ status: 500, text: "" })) });
  ctx.T.setConfig(() => CONFIG);
  await ctx.T.deskReorder.ask("q", ["a", "b"]);
  const sent = ctx.desk.sends.filter(s => s.ch === "etiuda:ai-state").map(s => s.args[0]);
  check(sent.length === 1 && sent[0].ranking === "builtin" && sent[0].failures === 1 && "pausedUntil" in sent[0],
    "da4c the shell sends each outcome to the page on etiuda:ai-state: " + JSON.stringify(sent));
});

/* ---- da5 INSTANT_FROM: the strip the agent sees at once, then the organisation's order --------------------------- */
async function stripLeg(aiSrc, opts) {
  const o = opts || {};
  let release = null;
  const gate = new Promise(done => { release = done; });
  const fetch = fetchOf(() => gate.then(() => ({ status: 200, text: chatSaying("[3,2,1]") })));
  const ctx = loadMain({ fetch, aiSrc, answer: (op) => openAnswer(op) });
  const builtin = builtinFrom(ctx.T, [{ id: "t:post", score: 0.9 }]);
  ctx.T.setConfig(() => CONFIG);
  const press = ctx.T.bumpPress();
  ctx.T.pickWithClip(press, Promise.resolve(null), MESSAGE);
  await until(() => ctx.T.pickWin(), 2000);
  const pw = ctx.T.pickWin();
  (pw.wc["did-finish-load"] || []).splice(0).forEach(fn => fn());
  await until(() => pw.visible, 2000);
  if (o.touch) (pw.wc["input-event"] || []).forEach(fn => fn({}, { type: o.touch }));
  release();
  await until(() => pw.sends.filter(s => s.ch === "etiuda:pick-open").length > 1, o.touch ? 300 : 2000);
  const opens = pw.sends.filter(s => s.ch === "etiuda:pick-open").map(s => (JSON.parse(s.args[0]).suggest || []).map(r => r.id));
  return { opens, ranks: builtin.ranks, fetches: fetch.calls.length };
}
await block(async () => {
  const WORDS = edited(AI_SRC, "const INSTANT_FROM = \"builtin\";", "const INSTANT_FROM = \"words\";");
  const b = await stripLeg();
  const w = await stripLeg(WORDS);
  check(b.ranks === 1 && JSON.stringify(b.opens[0]) === JSON.stringify(["t:post"]) && w.ranks === 0
    && JSON.stringify(w.opens[0]) === JSON.stringify(["t:lamp", "t:tea", "t:post"]),
    "da5 INSTANT_FROM \"builtin\" opens on the built-in model's strip and \"words\" on the words' alone, the built-in model not asked: builtin "
    + JSON.stringify(b.opens[0]) + " (asked " + b.ranks + "), words " + JSON.stringify(w.opens[0]) + " (asked " + w.ranks + ")");
  check(b.opens.length === 2 && JSON.stringify(b.opens[1]) === JSON.stringify(["t:tea", "t:lamp", "t:post"])
    && w.opens.length === 2 && JSON.stringify(w.opens[1]) === JSON.stringify(["t:post", "t:tea", "t:lamp"]),
    "da5b under either value the organisation's order of the shortlist paints the strip once more when it comes: builtin then "
    + JSON.stringify(b.opens[1]) + ", words then " + JSON.stringify(w.opens[1]));
  const t = await stripLeg(null, { touch: "keyDown" });
  check(t.opens.length === 1 && t.fetches === 1, "da5c a key in the picker before the order comes leaves the strip as it opened: openings " + t.opens.length);
});

/* ---- da6 each service's recorded shape, and the door ---------------------------------------------------------------- */
await block(async () => {
  const items = ["first row", "second row"];
  const shape = (cfg) => {
    const req = AI.requestFor(cfg, "the query", items);
    return req ? { url: req.url, headers: Object.keys(req.headers).sort().join(","), doc: JSON.parse(req.body.toString("utf8")), auth: req.headers } : null;
  };
  const oa = shape({ provider: "openai", model: "m1", key: "k1" });
  const az = shape({ provider: "azure", endpoint: "https://example-resource.openai.azure.com/openai/v1/chat/completions", model: "dep", key: "k2" });
  const cp = shape({ provider: "compatible", endpoint: "https://gateway.example.test/llm/v1", model: "m3", key: "k3" });
  const an = shape({ provider: "anthropic", model: "m4", key: "k4" });
  const go = shape({ provider: "google", model: "m5", key: "k5" });
  const none = shape({ provider: "azure", model: "dep", key: "k2" });
  check(oa && oa.url === "https://api.openai.com/v1/chat/completions" && oa.headers === "authorization,content-type" && oa.auth.authorization === "Bearer k1"
    && oa.doc.model === "m1" && oa.doc.messages.length === 2 && oa.doc.messages[0].role === "system" && /Query: the query/.test(oa.doc.messages[1].content)
    && az && az.url === "https://example-resource.openai.azure.com/openai/v1/chat/completions" && az.headers === "api-key,content-type" && az.auth["api-key"] === "k2"
    && cp && cp.url === "https://gateway.example.test/llm/v1/chat/completions" && cp.auth.authorization === "Bearer k3" && none === null,
    "da6 the chat protocol's recorded shape: OpenAI's address, Azure's resource address with its own key header, a compatible gateway's "
    + "address, and no request for Azure without an address: " + [oa && oa.url, az && az.url, cp && cp.url, String(none)].join(" | "));
  check(an && an.url === "https://api.anthropic.com/v1/messages" && an.headers === "anthropic-version,content-type,x-api-key"
    && an.auth["anthropic-version"] === "2026-10-21" && an.doc.max_tokens > 0 && typeof an.doc.system === "string" && an.doc.messages[0].role === "user"
    && !("temperature" in an.doc),
    "da6b Anthropic's Messages shape: its address, x-api-key and the version header, max_tokens, the instruction as system: " + an.url + " " + an.headers);
  check(go && go.url === "https://generativelanguage.googleapis.com/v1/interactions" && go.headers === "content-type,x-goog-api-key"
    && go.doc.store === false && typeof go.doc.system_instruction === "string" && typeof go.doc.input === "string",
    "da6c Google's Interactions shape: its address, its key header, store false, system_instruction and input: " + go.url);
  const chat = AI.replyText("openai", 200, Buffer.from(chatSaying("[2, 1]")));
  const msgs = AI.replyText("anthropic", 200, Buffer.from(JSON.stringify({ content: [{ type: "text", text: "[1,2]" }], stop_reason: "end_turn" })));
  const inter = AI.replyText("google", 200, Buffer.from(JSON.stringify({ status: "completed", steps: [{ type: "thought", content: [{ type: "text", text: "[9]" }] },
    { type: "model_output", content: [{ type: "text", text: "[2,1]" }] }] })));
  const cut = AI.replyText("anthropic", 200, Buffer.from(JSON.stringify({ content: [{ type: "text", text: "[1," }], stop_reason: "max_tokens" })));
  const err = AI.replyText("openai", 401, Buffer.from("{}"));
  check(chat === "[2, 1]" && msgs === "[1,2]" && inter === "[2,1]" && cut === null && err === null,
    "da6d each protocol's recorded answer gives its text, a thought step is not the answer, and a cut answer or an error gives none: "
    + JSON.stringify([chat, msgs, inter, cut, err]));
  const orders = [AI.parseOrder("[2, 1]", 2), AI.parseOrder("Sure: [3,1]", 3), AI.parseOrder("[4,1]", 3), AI.parseOrder("none", 2), AI.parseOrder("[1,1,2]", 2)];
  check(JSON.stringify(orders) === JSON.stringify([[1, 0], [2, 0, 1], null, null, [0, 1]]),
    "da6e the order is read as indices, the ones it left out keeping their places after it, and a number outside the list refuses it: " + JSON.stringify(orders));

  async function doorRefuses(A) {
    const fetch = fetchOf(() => ({ status: 200, text: "{}" }));
    const body = Buffer.from("{}");
    const tries = [
      { url: "http://api.example.test/v1/chat/completions", headers: { "content-type": "application/json" }, body },
      { url: "https://user:pw@api.example.test/v1/chat/completions", headers: { "content-type": "application/json" }, body },
      { url: "https://api.example.test/v1/%2e%2e/chat/completions", headers: { "content-type": "application/json" }, body },
      { url: "https://api.example.test/v1/chat/completions", headers: { "content-type": "application/json", cookie: "a=b" }, body },
      { url: "https://api.example.test/v1/chat/completions", headers: { "content-type": "application/json" }, body: Buffer.alloc(A.SEND_MAX + 1) },
    ];
    let refused = 0;
    for (const t of tries) { try { await A.door(fetch, t, 1000); } catch { refused++; } }
    let big = false;
    try { await A.door(fetchOf(() => ({ status: 200, text: "x".repeat(A.ANSWER_MAX + 1) })), tries[3] && { url: tries[0].url.replace("http:", "https:"), headers: { "content-type": "application/json" }, body }, 1000); }
    catch { big = true; }
    return { refused, sent: fetch.calls.length, big, of: tries.length };
  }
  const d = await doorRefuses(AI);
  check(d.refused === d.of && d.sent === 0 && d.big,
    "da6f the door refuses before sending an http address, a user in the address, a dot segment, a header off its list and a body over "
    + AI.SEND_MAX + " bytes, and an answer over " + AI.ANSWER_MAX + " bytes: refused " + d.refused + " of " + d.of + ", sent " + d.sent + ", long answer refused " + d.big);
  const lifted = await doorRefuses(aiFrom(edited(AI_SRC, "  if (!ok) throw new Error(\"the organisation's model is reached at its https address only, with its own headers\");", "")));
  check(lifted.sent > 0, "da6p with the door's check lifted, the refused requests are sent and the leg above fails: sent " + lifted.sent);

  /* What the window has to hold beside a service's own time: the build, the door and the reading, timed over a stand-in. */
  const fast = fetchOf(() => ({ status: 200, text: chatSaying("[3,1,2,5,4,6,8,7,9,12,11,10]") }));
  const r = AI.createReorder({ config: () => CONFIG, fetch: fast });
  const twelve = Array.from({ length: 12 }, (_, i) => "row " + i + " " + "words ".repeat(60));
  const times = [];
  for (let i = 0; i < 200; i++) { const t0 = process.hrtime.bigint(); await r.ask("a query of a few words", twelve); times.push(Number(process.hrtime.bigint() - t0) / 1e6); }
  times.sort((a, b) => a - b);
  console.log("  info the stand-in ask, twelve rows of 400 characters, 200 runs: median " + times[100].toFixed(3) + " ms, p95 " + times[190].toFixed(3)
    + " ms, max " + times[199].toFixed(3) + " ms; the window starts at " + AI.REORDER_WINDOW_MS + " ms");
});

/* ---- da7 the page: its shortlist, the order taken once, and dropped once the query has moved ------------------- */
async function pageLeg(dir) {
  const M = n => pathToFileURL(path.join(dir, n)).href;
  const box = { value: "" };
  const prepared = [];
  globalThis.window = { addEventListener() {}, removeEventListener() {},
    E_HOST: { aiState: () => ({ model: false, org: true }), setSearchAi() {}, searchPrepare: async rows => { prepared.push(rows.length); return { ready: true }; },
      searchRank: async () => ({ cards: [], intents: [] }) } };
  globalThis.document = { querySelector: s => (s === "#intent" ? box : null), createElement: () => ({ getContext: () => ({}) }),
    createRange: () => ({}), addEventListener() {}, removeEventListener() {} };
  const SM = await import(M("search-meaning.js"));
  const D = await import(M("dom.js"));
  const A = await import(M("app-state.js"));
  const H = await import(M("hooks.js"));
  let renders = 0;
  H.hooks.render = () => { renders++; };
  H.hooks.drawIntentRail = () => {};
  D.grabDom();
  const cards = ["c1", "c2", "c3", "c4"].map(id => ({ id, t: "Card " + id, en: "Text of " + id, c: "x" }));
  A.setCards(cards);
  const type = async q => { box.value = q; SM.noteSearchTyping(); SM.searchOnSettle(); SM.scheduleSearchRank(); await tick(5); };
  await type("lantern wick");
  A.setShown(cards.slice(0, 3));
  const sl = SM.searchShortlist("lantern wick");
  const took = SM.searchReorder({ q: "lantern wick", gen: sl && sl.gen, cards: ["c3", "c1"], intents: [] });
  const order = (SM.mixCards(cards.slice(0, 3)) || []).map(m => m.id);
  const again = SM.searchReorder({ q: "lantern wick", gen: sl && sl.gen, cards: ["c2", "c1"], intents: [] });
  await type("lantern wi");
  const moved = SM.mixCards(cards.slice(0, 3));
  await type("lantern wick");
  const stale = SM.searchReorder({ q: "lantern wick", gen: sl && sl.gen, cards: ["c2", "c3"], intents: [] });
  return { prepared, sl, took, order, again, moved: moved && moved.map(m => m.id), stale, renders };
}
await block(async () => {
  const MODS = path.join(ROOT, "src", "modules");
  const p = await pageLeg(MODS);
  check(p.prepared.length >= 1 && p.sl && JSON.stringify(p.sl.cards) === JSON.stringify(["c1", "c2", "c3"]) && p.took.ok === 1
    && JSON.stringify(p.order) === JSON.stringify(["c3", "c2", "c1"]) && p.again.ok === 0 && p.renders >= 1,
    "da7 with only the organisation's model the page still sends its passages, gives the cards on screen as the shortlist, and takes the order once, "
    + "the cards it named trading places: shortlist " + JSON.stringify(p.sl && p.sl.cards) + ", order " + JSON.stringify(p.order) + ", a second order taken " + p.again.ok);
  check((p.moved === null || JSON.stringify(p.moved) === JSON.stringify(["c1", "c2", "c3"])) && p.stale.ok === 0,
    "da7b once the query is edited the order stops applying, and an order given for the earlier search is refused even when the same words come back: "
    + JSON.stringify(p.moved) + ", " + JSON.stringify(p.stale));
  /* The plant: the modules copied to a scratch folder, the generation check lifted there. */
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-ai-page-"));
  for (const f of fs.readdirSync(MODS)) if (f.endsWith(".js")) fs.copyFileSync(path.join(MODS, f), path.join(lab, f));
  fs.writeFileSync(path.join(lab, "search-meaning.js"), edited(fs.readFileSync(path.join(MODS, "search-meaning.js"), "utf8"),
    "o.q !== currentQuery() || o.gen !== orgGen) return { ok: 0 };", "o.q !== currentQuery()) return { ok: 0 };"));
  const lifted = await pageLeg(lab);
  check(lifted.stale.ok === 1, "da7p with the generation check lifted, the earlier search's order is taken and the leg above fails: " + JSON.stringify(lifted.stale));
});

/* ---- da8 the window from the real answer times, slow, and the time a call took --------------------------------- */
/* Asks whose stand-in answers take `ms` each on a clock the leg holds; the controller's own state after each. */
async function timesLeg(A, list) {
  let clock = 5000000;
  const states = [];
  const fetch = fetchOf(() => { clock += fetch.next; return { status: 200, text: chatSaying("[2,1]") }; });
  const r = A.createReorder({ config: () => CONFIG, fetch, now: () => clock, onState: s => states.push(s) });
  const windows = [];
  for (const step of list) {
    if (step === "rest") { clock += A.PAUSE_MS + 1; continue; }
    fetch.next = step;
    await r.ask("q", ["a", "b"]);
    windows.push(r.state().window);
  }
  return { windows, states, state: r.state(), fetches: fetch.calls.length };
}
await block(async () => {
  const W = AI.windowFor || (() => NaN);
  const planted = [[[], 2000], [[800, 800], 2000], [[800, 800, 800], 1200], [[100, 100, 100], 1000], [[3000, 3000, 3000], 4000],
    [[9000, 9000, 9000, 800, 800, 800, 800, 800, 800, 800, 800, 800], 1200], [[600, 900, 1500, 700, 800], 1200]];
  const got = planted.map(([t]) => W(t));
  check(JSON.stringify(got) === JSON.stringify(planted.map(p => p[1])),
    "da8 the window is " + AI.WINDOW_FACTOR + " times the median of the last " + AI.TIMES_KEPT + " answer times, " + AI.REORDER_WINDOW_MS
    + " ms before " + AI.TIMES_FIRST + " have come back, never under " + AI.WINDOW_FLOOR_MS + " nor over " + AI.WINDOW_CEILING_MS + " ms: "
    + JSON.stringify(got));
  const run = await timesLeg(AI, [800, 800, 800, 100, 100, 100, 100, 100]);
  check(JSON.stringify(run.windows) === JSON.stringify([2000, 2000, 1200, 1200, 1200, 1000, 1000, 1000]),
    "da8b the controller's window follows the times its own asks took, down to the floor: " + JSON.stringify(run.windows));
  const floorLifted = aiFrom(edited(AI_SRC, "Math.max(WINDOW_FLOOR_MS, ", "("));
  const ceilLifted = aiFrom(edited(AI_SRC, "Math.min(WINDOW_CEILING_MS, ", "("));
  check(floorLifted.windowFor([100, 100, 100]) !== 1000 && ceilLifted.windowFor([3000, 3000, 3000]) !== 4000,
    "da8p with the floor or the ceiling lifted, the legs above fail: " + floorLifted.windowFor([100, 100, 100]) + ", " + ceilLifted.windowFor([3000, 3000, 3000]));
});
await block(async () => {
  const run = await timesLeg(AI, [5000, 5000, 5000, "rest", 500, 500, 500]);
  const slowAt = run.states.findIndex(s => s.slow === true && s.failures === 3);
  const last = run.states[run.states.length - 1];
  check(slowAt > -1 && run.states[slowAt].pausedUntil > 0 && last && last.slow === false
    && last.ranking === "organisation" && run.states.every(s => typeof s.slow === "boolean"),
    "da8c three answers of 5000 ms, each late and timed, set slow with the pause as before; three of 500 ms bring the median under "
    + AI.WINDOW_CEILING_MS + " ms and clear it: " + JSON.stringify(run.states.map(s => [s.ranking, s.failures, s.slow])));
  const lifted = await timesLeg(aiFrom(edited(AI_SRC, "medianOf(kept) > WINDOW_CEILING_MS", "false")), [5000, 5000, 5000]);
  check(!lifted.states.some(s => s.slow === true), "da8p with slow lifted, the leg above fails: " + JSON.stringify(lifted.states.map(s => s.slow)));
});
await block(async () => {
  /* A late answer on the real clock: dropped at the window, then timed when it comes. */
  const fetch = fetchOf(() => tick(120).then(() => ({ status: 200, text: chatSaying("[2,1]") })));
  const r = AI.createReorder({ config: () => CONFIG, fetch, windowMs: 50 });
  const order = await r.ask("q", ["a", "b"]);
  const before = (r.state().times || []).length;
  await until(() => (r.state().times || []).length > 0, 1000);
  const t = (r.state().times || [])[0];
  check(order === null && before === 0 && t >= 100,
    "da8d a late answer is still timed when it comes back, at its real time: dropped at the window, then " + t + " ms kept");
  const slow = fetchOf(() => tick(40).then(() => ({ status: 200, text: chatSaying("ok") })));
  const req = AI.requestFor(CONFIG, "q", ["a", "b"]);
  const res = await AI.door(slow, req, 1000);
  const test = AI.connectionTest ? await AI.connectionTest(slow, CONFIG) : {};
  const sent = slow.calls[1] ? Buffer.from(slow.calls[1].init.body).toString("utf8") : "";
  const shell = await loadMain({ fetch: slow }).T.deskAiTest(CONFIG);
  check(res.ms >= 35 && test.ok === true && test.ms >= 35 && shell.ok === true && shell.ms >= 35 && sent.indexOf(AI.TEST_PROMPT) > -1 && sent.indexOf("Items:") < 0,
    "da8e the door's answer carries the time it took, and the connection test answers {ok, ms} after sending its fixed prompt "
    + "and nothing of a catalog, through the shell's deskAiTest too: door " + res.ms + " ms, test " + JSON.stringify(test) + ", shell " + JSON.stringify(shell));
});

check(wallHits === 0, "da0 no leg called the global fetch: " + wallHits);
const done = asserted === EXPECTED;
if (!done) console.log("  FAIL the file ran " + asserted + " checks, not the " + EXPECTED + " it declares");
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
console.log(failed === 0 && done ? "RESULT: ok " + asserted + " check(s)" : "RESULT: FAIL " + failed + " of " + asserted);
process.exit(Math.min(63, failed + (done ? 0 : 1)));
