/* A flag is one signed fact in the desk's own file. Bare node, no window, catalogs invented here.
 *
 *   node tests/card-flag.mjs
 *
 * The nine holdings: a flag with no edit writes a signed file and taking it back removes the file;
 * nothing in the entry is a time, and two desks that flagged the same cards in opposite orders
 * write the same list once r is fixed; a note of 500 is kept, 501 and a control are refused, an
 * empty note is omitted; a restart keeps the flag, another catalog shows none, and removing the
 * layer removes it; each ending; an export and a loaded file do not carry flags or answered; a
 * flag is refused where the file would not reach a lead; the 101st is refused; r is 32 hex and
 * differs between two flags. Each rule has a plant that rewrites a scratch copy. With
 * ETIUDA_PLANTS=off every plant prints NOT RUN and does not run.
 *
 * Exit code is the number of failed checks, capped at 63; 78 when the run did not finish.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 67;
const PLANT_CHECKS = 11;

let checks = 0, fails = 0, notRun = 0, done = false;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (!ok && detail !== undefined ? ": " + detail : ""));
  if (!ok) fails++;
};
const skip = (what) => { notRun++; console.log("  NOT RUN " + what); };
const sha256 = (s) => crypto.createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-card-flag-"));
const mem = Object.create(null);
const store = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
  key: (i) => Object.keys(mem)[i] || null,
  get length() { return Object.keys(mem).length; },
};
function el(tag) {
  const node = {
    tagName: String(tag || "div").toUpperCase(), className: "", id: "", textContent: "", innerHTML: "",
    style: {}, hidden: false, children: [], type: "", classList: null, value: "",
    setAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; },
    appendChild(c) { node.children.push(c); return c; }, removeChild(c) { return c; }, remove() {},
    addEventListener() {}, removeEventListener() {}, contains() { return false; },
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    focus() {}, click() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  };
  node.classList = { add() {}, remove() {}, contains() { return false; }, toggle() { return false; } };
  return node;
}
const toastEl = el("div");
globalThis.localStorage = store;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.getComputedStyle = () => ({ getPropertyValue() { return ""; }, fontStyle: "normal", fontWeight: "400", fontSize: "14px", fontFamily: "sans-serif", letterSpacing: "normal" });
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.document = {
  visibilityState: "visible", hidden: false, readyState: "complete",
  addEventListener() {}, removeEventListener() {},
  getElementById(id) { return id === "toast" ? toastEl : null; },
  querySelector(sel) { return sel === "#toast" ? toastEl : null; },
  querySelectorAll() { return []; },
  createElement: el, createTextNode(t) { return { textContent: String(t) }; },
  body: el("body"), activeElement: null, documentElement: el("html"),
};
globalThis.window = {
  addEventListener() {}, removeEventListener() {}, localStorage: store, document: globalThis.document,
  location: { href: "file:///C:/lab/engine/etiuda.html" }, getComputedStyle: globalThis.getComputedStyle,
};

const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(Buffer.from(String(s), "utf8").map((b) => b ^ 0x5a)),
  decryptString: (b) => Buffer.from(Buffer.from(b).map((x) => x ^ 0x5a)).toString("utf8"),
};
function bootShell(name, src) {
  const UD = path.join(BASE, "user-" + name);
  const DOCS = path.join(BASE, "docs-" + name);
  const FOLDER = path.join(DOCS, "Etiuda");
  fs.mkdirSync(FOLDER, { recursive: true });
  fs.mkdirSync(UD, { recursive: true });
  const on = {}, handle = {}, said = [];
  const quiet = { log: (s) => said.push(String(s)), error: (s) => said.push("ERR " + String(s)), warn: () => {} };
  const ipcMain = new Proxy({}, {
    get: (t, p) => {
      if (p === "on" || p === "once") return (ch, fn) => { on[ch] = fn; };
      if (p === "handle" || p === "handleOnce") return (ch, fn) => { handle[ch] = fn; };
      return () => {};
    },
  });
  const electron = {
    app: {
      getPath: (n) => (n === "documents" ? DOCS : UD), setPath: noop, requestSingleInstanceLock: () => false,
      quit: noop, exit: noop, on: noop, getVersion: () => "0.0.0", isPackaged: false,
      whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop },
    },
    ipcMain, BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert,
    screen: inert, shell: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
    safeStorage, Notification: inert, Tray: inert, nativeImage: inert, clipboard: inert,
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  new Function("require", "__dirname", "__filename", "module", "exports", "console", "__test", src)(
    (n) => (n === "electron" ? electron : nodeRequire(n)), path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"),
    { exports: {} }, {}, quiet, {});
  const frame = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
  const ev = { sender: { id: 1, once: noop }, senderFrame: frame };
  const sync = (ch, frameOver) => {
    const e = { sender: ev.sender, senderFrame: frameOver || frame, returnValue: undefined };
    on[ch](e);
    return e.returnValue;
  };
  return { UD, DOCS, FOLDER, on, handle, said, ask: (ch, ...a) => handle[ch](ev, ...a), sync };
}

let shell = null, shellErr = "";
try { shell = bootShell("desk", fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8")); }
catch (e) { shellErr = e && e.stack ? e.stack : String(e); }

let reachStub = false, writes = 0;
const host = {
  branchIdentity: (make) => Promise.resolve(shell ? shell.ask("etiuda:branch-identity", make !== false) : null),
  writeBranch: (stem, text) => { writes++; return Promise.resolve(shell ? shell.ask("etiuda:branch-write", stem, text) : { ok: false }); },
  branchReach: () => {
    if (reachStub) return true;
    return shell ? shell.sync("etiuda:branch-reach") === true : false;
  },
};
globalThis.window.E_HOST = host;

const mod = (n) => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const HK = await import(mod("hooks.js"));
Object.keys(HK.hooks).forEach((k) => { HK.hooks[k] = () => {}; });
const slotSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "hooks.js"), "utf8");
const slotNames = [...slotSrc.match(/const SLOTS = \[([\s\S]*?)\];/)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
slotNames.forEach((k) => { if (typeof HK.hooks[k] !== "function") HK.hooks[k] = () => {}; });
let scheduled = 0;
HK.hooks.scheduleDeskBranch = () => { scheduled++; };
HK.hooks.rebuildCards = () => {};
HK.hooks.restartDesk = () => {};

const F = await import(mod("card-flag.js"));
const V2 = await import(mod("catalog-v2.js"));
const ST = await import(mod("storage.js"));
const AS = await import(mod("app-state.js"));
const CT = await import(mod("catalog.js"));
const CF = await import(mod("catalog-file.js"));
const CB = await import(mod("catalog-boot.js"));
const PK = await import(mod("pack.js"));
HK.hooks.restartDesk = () => {
  CB.applyBootCatalog();
  const stored = CT.storedCatalog();
  AS.setCards((stored && stored.cards) || []);
  AS.putLang("en");
};

const SPKI = Buffer.from("302a300506032b6570032100", "hex");
const PREFIX = Buffer.from("etiuda-desk-branch\n");
const pubOf = (hex) => crypto.createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(hex, "hex")]), format: "der", type: "spki" });
const verifies = (d) => {
  try {
    return crypto.verify(null, Buffer.concat([PREFIX, Buffer.from(V2.v2SignedBytes(d))]), pubOf(d.desk.key), Buffer.from(d.sig.value, "hex"));
  } catch (e) { return false; }
};
const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return fs.statSync(f).isDirectory() ? walk(f) : [f];
  });
};
const deskFiles = () => shell ? walk(path.join(shell.FOLDER, "desks")).filter((f) => f.endsWith(".ec")) : [];

function wordsOf(card, code) {
  const shaped = card && card.alt ? (card.seq ? "steps" : "alts") : "plain";
  const key = (field) => {
    if (field === "t") return code === "en" ? "t" : code === "pl" ? "tPl" : "t:" + code;
    if (field === "body") return code === "en" ? "en" : code === "pl" ? "pl" : "body:" + code;
    return code === "en" ? "note" : code === "pl" ? "notePl" : "note:" + code;
  };
  const obj = {};
  const put = (name, field) => {
    const k = key(field);
    const v = String(card && card[k] != null ? card[k] : "").trim();
    if (!v) return;
    obj[name] = (field === "body" && shaped !== "plain") ? V2.v2Mark(v, shaped === "steps" ? "[step]" : "[alt]") : v;
  };
  put("title", "t"); put("body", "body"); put("note", "note");
  return obj;
}
const seenOf = (card, code) => sha256(V2.v2Canonical(wordsOf(card, code)));
const keysOf = (o) => Object.keys(o).sort().join(",");
const TIME_KEY = /at|date|time|when/i;

const origin = {
  format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 4, date: "2026-11-01",
  langs: [{ code: "en", label: "EN" }, { code: "pl", label: "PL" }], commentLang: "en",
  tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
  cards: [
    { id: "c-a", shelf: "t-op", bodyShape: "plain", title: { en: "Card A" }, body: { en: "Body A." } },
    { id: "c-b", shelf: "t-op", bodyShape: "plain", title: { en: "Card B", pl: "Karta B" }, body: { en: "Body B.", pl: "Tresc B." }, note: { en: "Note B." } },
    { id: "c-c", shelf: "t-op", bodyShape: "steps", title: { en: "Card C" }, body: { en: "[step]\nAsk.\n\n[step]\nRaise." } },
  ],
  flags: [{ card: "c-a", lang: "en", seen: "ab".repeat(32), r: "cd".repeat(16), note: "a stranger" }],
  answered: [{ f: "ef".repeat(32), o: "kept" }],
};
const plainCard = { id: "c-hello", t: "Hello", en: "Good day.", note: "" };
const stepsCard = { id: "c-steps", alt: 1, seq: 1, t: "Refund", en: "Ask.\n\nRaise.", note: "Say it once." };

function wipe() { ST.lyDel("Flags"); ST.lyDel("FlagEnds"); }
function home() { return ST.eLayer(); }

function rewriteLine(file, marker, edit) {
  const lines = fs.readFileSync(file, "utf8").split(/\n/);
  const at = lines.findIndex((l) => l.indexOf(marker) >= 0);
  if (at < 0) throw new Error("no " + marker + " in " + file);
  lines[at] = edit(lines[at]);
  fs.writeFileSync(file, lines.join("\n"));
}
let plantN = 0;
async function runPlants() {
  const names = ["plant:flag-holds", "plant:flag-sort", "plant:flag-note-cap", "plant:flag-note-control", "plant:flag-layer", "plant:flag-settle-words", "plant:flag-named", "plant:flag-no-answered", "plant:flag-reach", "plant:flag-full", "plant:flag-random"];
  if (PLANTS_OFF) { names.forEach(skip); return; }
  const dir = fs.mkdtempSync(path.join(BASE, "plant-"));
  fs.cpSync(path.join(ROOT, "src", "modules"), dir, { recursive: true });
  const href = (name) => pathToFileURL(path.join(dir, name)).href;
  const bump = () => "?p=" + (++plantN);
  const Flag0 = await import(href("card-flag.js"));
  const St0 = await import(href("storage.js"));
  const As0 = await import(href("app-state.js"));
  const Hk0 = await import(href("hooks.js"));
  Hk0.hooks.scheduleDeskBranch = () => {};
  Hk0.hooks.rebuildCards = () => {};
  St0.setLayer("eplant~");
  As0.putLang("en");
  As0.setCards([{ id: "c-a", t: "Hello", en: "Good day." }, { id: "c-b", t: "Card B", en: "Body B." }]);
  const held = Flag0.flagCard("c-a");
  rewriteLine(path.join(dir, "catalog-file.js"), "plant:flag-holds", (l) => l.replace("return flagHolds();", "return false;"));
  const Cf0 = await import(href("catalog-file.js") + bump());
  check(!!(held && held.r) && Flag0.flagHolds() === true && Cf0.deskBranchHolds() === false, "plant:flag-holds a flag alone no longer counts as held");

  const flagSrc = fs.readFileSync(path.join(dir, "card-flag.js"), "utf8");
  const loadFlag = async (marker, edit) => {
    fs.writeFileSync(path.join(dir, "card-flag.js"), flagSrc);
    rewriteLine(path.join(dir, "card-flag.js"), marker, edit);
    return import(href("card-flag.js") + bump());
  };
  const Sort = await loadFlag("plant:flag-sort", (l) => l.replace(".sort(byCardThenR)", ""));
  St0.setLayer("esort~");
  Sort.flagCard("c-b"); Sort.flagCard("c-a");
  check(Sort.flagFileList().map((f) => f.card).join(",") === "c-b,c-a", "plant:flag-sort leaving the sort off keeps the order the flags were made");

  const Cap = await loadFlag("plant:flag-note-cap", (l) => l.replace("s.length>NOTE_CAP", "false"));
  St0.setLayer("ecap~");
  Cap.flagCard("c-a");
  const longNote = Cap.flagNote("c-a", "n".repeat(501));
  check(!!(longNote && longNote.note) && longNote.note.length === 501, "plant:flag-note-cap a note past 500 is kept");

  const Ctrl = await loadFlag("plant:flag-note-control", (l) => l.replace("CONTROL.test(s)", "false"));
  St0.setLayer("ectrl~");
  Ctrl.flagCard("c-a");
  const nl = Ctrl.flagNote("c-a", "a\nb");
  check(!!nl && nl.note === "a\nb", "plant:flag-note-control a newline is kept");

  const Layer = await loadFlag("plant:flag-layer", (l) => l.replace("return lySet(LAYER_FLAGS,JSON.stringify(list),true)!==false;", "return true;"));
  St0.setLayer("elayer~");
  const ghost = Layer.flagCard("c-a");
  check(!!(ghost && ghost.r) && St0.lyGet("Flags") == null, "plant:flag-layer the flag is not written to the layer");

  const Settle = await loadFlag("plant:flag-settle-words", (l) => l.replace("flagWordsHash(card,rec.lang)!==rec.seen", "false"));
  St0.setLayer("esettle~");
  Settle.flagCard("c-a");
  check(Settle.settleFlags({ cards: [{ id: "c-a", t: "Hello", en: "Changed." }] }, null) === false && Settle.cardFlag("c-a").state === "sent", "plant:flag-settle-words a change of the words no longer ends the flag");

  const v2Src = fs.readFileSync(path.join(dir, "catalog-v2.js"), "utf8");
  const loadV2 = async (marker, edit) => {
    fs.writeFileSync(path.join(dir, "catalog-v2.js"), v2Src);
    rewriteLine(path.join(dir, "catalog-v2.js"), marker, edit);
    return import(href("catalog-v2.js") + bump());
  };
  const mini = {
    format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 1, langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-a", shelf: "t-op", bodyShape: "plain", title: { en: "Hello" }, body: { en: "Good day." } }],
    flags: [{ card: "c-a", lang: "en", seen: "ab".repeat(32), r: "cd".repeat(16) }],
    answered: [{ f: "ef".repeat(32), o: "kept" }],
  };
  const Named = await loadV2("plant:flag-named", (l) => l.replace('"flags","answered"', ""));
  const namedRuntime = Named.catalogFromV2(mini);
  const namedOut = Named.catalogToV2(namedRuntime);
  check(!!(namedRuntime.ext && namedRuntime.ext.flags) && Array.isArray(namedOut.flags) && namedOut.flags.length === 1, "plant:flag-named without the names, flags ride through");

  const Answered = await loadV2("plant:flag-no-answered", (l) => l.replace("out.flags=v2Copy(c.flags);", "out.flags=v2Copy(c.flags); if(c.answered) out.answered=v2Copy(c.answered);"));
  const ansOut = Answered.catalogToV2(Object.assign({}, V2.catalogFromV2(mini), { flags: mini.flags, answered: mini.answered }));
  check(!!(ansOut.answered && ansOut.answered[0] && ansOut.answered[0].o === "kept"), "plant:flag-no-answered the desk file would write answered");

  const mainLines = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8").split(/\n/);
  const reachAt = mainLines.findIndex((l) => l.indexOf("plant:flag-reach") >= 0);
  mainLines[reachAt] = mainLines[reachAt].replace("branchReach()", "true");
  let planted = null, reachErr = "";
  try { planted = bootShell("reach", mainLines.join("\n")); }
  catch (e) { reachErr = e && e.message ? e.message : String(e); }
  const reached = planted ? planted.sync("etiuda:branch-reach") : null;
  const strangerReach = planted ? planted.sync("etiuda:branch-reach", { parent: null, url: "https://example.com/etiuda.html" }) : null;
  check(reached === true && strangerReach === false, "plant:flag-reach the channel answers true off a team, and a stranger is still refused", reachErr);

  const Full = await loadFlag("plant:flag-full", (l) => l.replace("list.length>=FLAG_CAP", "false"));
  St0.setLayer("efull~");
  const crowd = [];
  for (let i = 0; i < 101; i++) crowd.push({ id: "n-" + i, t: "T", en: "B" });
  As0.setCards(crowd);
  let last = null;
  for (let i = 0; i < 101; i++) last = Full.flagCard(crowd[i].id);
  check(!!(last && last.r) && Full.flagFileList().length === 101, "plant:flag-full the 101st flag is kept");

  const Rand = await loadFlag("plant:flag-random", (l) => l.replace("crypto.getRandomValues(b);", "b.fill(4);"));
  St0.setLayer("erand~");
  As0.setCards([{ id: "c-a", t: "Hello", en: "Good day." }, { id: "c-b", t: "Card B", en: "Body B." }]);
  const one = Rand.flagCard("c-a"), two = Rand.flagCard("c-b");
  check(!!(one && two) && one.r === two.r && one.r === "04".repeat(16), "plant:flag-random a fixed fill makes both flags the same r");
}

try {
  check(!!shell && typeof shell.on["etiuda:branch-reach"] === "function" && !shellErr, "the shell answers etiuda:branch-reach", shellErr.split("\n")[0]);

  const savedHost = globalThis.window.E_HOST;
  globalThis.window.E_HOST = null;
  const beforeSched = scheduled;
  check(F.flagOffered() === false, "a browser is not offered a flag");
  check(F.flagCard("c-a").refused === "not-offered", "a browser refuses not-offered");
  check(scheduled === beforeSched, "a refusal does not schedule the desk file");
  globalThis.window.E_HOST = savedHost;

  reachStub = false;
  const beforeWrites = writes;
  check(shell.sync("etiuda:branch-reach") === false, "off a team the channel answers false");
  check(F.flagOffered() === false, "off a team the page is not offered a flag");
  check(F.flagCard("c-a").refused === "not-offered", "off a team flagCard refuses not-offered");
  check(writes === beforeWrites && deskFiles().length === 0, "a refused flag writes no file");
  const stranger = shell.sync("etiuda:branch-reach", { parent: null, url: "https://example.com/etiuda.html" });
  check(stranger === false, "a stranger frame is refused");

  reachStub = true;
  AS.putLang("en");
  const parsed = CT.parseCatalogFile(JSON.stringify(origin));
  const took = CF.activateCatalog(parsed, { file: "lamps.ec" });
  check(took === true, "the edition is taken", String(took));
  const stored = CT.storedCatalog();
  const pinWant = "sha256:" + crypto.createHash("sha256").update(Buffer.from(V2.v2SignedBytes(origin))).digest("hex");
  check(stored && stored.pin === pinWant && stored.id === "lamp-shop", "the edition is stored under its pin");
  check(!!stored && !stored.flags && !(stored.ext && stored.ext.flags) && !stored.answered, "a loaded file's flags and answered are not stored");
  const layer = home();
  check(F.flagOffered() === true, "the page asks the channel, and the stand-in says the file would travel");
  check(CF.deskBranchHolds() === false, "before any flag the desk holds nothing");

  check(F.flagCard("missing").refused === "no-such-card", "an unknown card is refused");
  const s0 = scheduled;
  const made = F.flagCard("c-b");
  check(scheduled === s0 + 1, "making a flag schedules the desk file");
  check(made && made.card === "c-b" && made.lang === "en" && made.seen === seenOf(AS.cards.find((m) => m.id === "c-b"), "en") && /^[0-9a-f]{32}$/.test(made.r) && !("note" in made),
    "a new flag is card, lang, seen and r, and an empty note is omitted");
  check(F.flagWordsHash(plainCard, "en") === seenOf(plainCard, "en") && F.flagWordsHash(stepsCard, "en") === seenOf(stepsCard, "en"),
    "seen is the sha256 of the canonical words");
  const again = F.flagCard("c-b");
  check(again.r === made.r && again.seen === made.seen && scheduled === s0 + 1, "a card already flagged answers the same flag");
  check(CF.deskBranchHolds() === true, "a flag alone is something the desk holds");

  const note500 = "n".repeat(500);
  const noted = F.flagNote("c-b", note500);
  check(noted && noted.note === note500, "a note of 500 is kept");
  const refusedLong = F.flagNote("c-b", "n".repeat(501));
  check(refusedLong && refusedLong.refused === "too-long" && F.cardFlag("c-b").note === note500, "a note of 501 is refused and the old note stays");
  check(F.flagNote("c-b", "a\nb").refused === "control" && F.cardFlag("c-b").note === note500, "a newline is refused");
  check(F.flagNote("c-b", "a\u007f").refused === "control", "a delete character is refused");
  const cleared = F.flagNote("c-b", "");
  check(cleared && !("note" in cleared), "an empty note is omitted");
  const s1 = scheduled;
  check(F.flagNote("c-a", "x") === null && scheduled === s1, "a note on a card with no flag does nothing");
  F.flagNote("c-b", "Looks wrong");

  ST.setLayer("eother~");
  check(F.cardFlag("c-b") === null && F.flagFileList().length === 0, "another catalog shows no flag");
  ST.setLayer(layer);
  check(F.cardFlag("c-b") && F.cardFlag("c-b").state === "sent" && F.cardFlag("c-b").note === "Looks wrong", "the catalog's own layer still has it");

  const freshDir = fs.mkdtempSync(path.join(BASE, "fresh-"));
  fs.cpSync(path.join(ROOT, "src", "modules"), freshDir, { recursive: true });
  const freshHref = pathToFileURL(path.join(freshDir, "card-flag.js")).href;
  const Fresh = await import(freshHref);
  const FreshSt = await import(pathToFileURL(path.join(freshDir, "storage.js")).href);
  FreshSt.setLayer(layer);
  const freshFlag = Fresh.cardFlag("c-b");
  check(freshFlag && freshFlag.state === "sent" && freshFlag.note === "Looks wrong", "a restart reads the flag from the layer");

  const wrote = await CF.writeDeskBranch();
  const files = deskFiles();
  const raw = files.length === 1 ? fs.readFileSync(files[0], "utf8") : "";
  let doc = null;
  try { doc = raw ? JSON.parse(raw) : null; } catch (e) { doc = null; }
  check(wrote === true && !!doc, "a flag with no edit writes the desk file", "wrote " + wrote + " files " + files.length + (shell ? " " + shell.said.slice(-4).join(" | ") : ""));
  check(!!doc && verifies(doc), "the file verifies under the desk prefix");
  check(!!doc && doc.hash === V2.v2ContentHash(doc), "the file's hash is the engine's own");
  const flag = doc && Array.isArray(doc.flags) ? doc.flags[0] : null;
  check(!!doc && doc.flags && doc.flags.length === 1 && keysOf(flag) === "card,lang,note,r,seen", "the file's flags entry is exactly the five fields");
  check(!!flag && flag.card === "c-b" && flag.lang === "en" && flag.note === "Looks wrong" && flag.r === made.r && flag.seen === made.seen, "the file carries this desk's flag");
  check(!!doc && !("answered" in doc) && Buffer.from(V2.v2SignedBytes(doc)).includes(Buffer.from("Looks wrong")), "answered is absent and the note is inside the signed bytes");
  check(!!doc && !JSON.stringify(doc.flags).match(/\d{4}-\d{2}-\d{2}/) && !(doc.flags || []).some((f) => "cd".repeat(16) === f.r), "the list has no date and the stranger's flag is not copied");
  check(!!doc && V2.v2Problems(doc).length === 0, "a desk file that carries flags still loads", doc && V2.v2Problems(doc).slice(0, 3).join("; "));
  const loadedBack = doc ? V2.catalogFromV2(doc) : {};
  check(!loadedBack.flags && !(loadedBack.ext && loadedBack.ext.flags), "reading that file does not put flags on the runtime");

  const other = F.flagCard("c-a");
  check(other && other.r !== made.r && /^[0-9a-f]{32}$/.test(other.r), "two flags get two different r values");
  const listed = F.flagFileList();
  check(listed.map((f) => f.card).join(",") === "c-a,c-b", "the file list is sorted by card id");
  check(listed.every((f) => !Object.keys(f).some((k) => TIME_KEY.test(k))), "nothing in a flag entry is a time");

  const goneWrite = F.unflagCard("c-b");
  F.unflagCard("c-a");
  const removed = await CF.writeDeskBranch();
  check(goneWrite === true && removed === true && deskFiles().length === 0 && CF.deskBranchHolds() === false, "taking the flags back removes the file");

  const standDir = fs.mkdtempSync(path.join(BASE, "stand-"));
  fs.cpSync(path.join(ROOT, "src", "modules"), standDir, { recursive: true });
  rewriteLine(path.join(standDir, "card-flag.js"), "plant:flag-random", (l) => l.replace("crypto.getRandomValues(b);", "b.fill(7);"));
  const Stand = await import(pathToFileURL(path.join(standDir, "card-flag.js")).href);
  const StandSt = await import(pathToFileURL(path.join(standDir, "storage.js")).href);
  const StandAs = await import(pathToFileURL(path.join(standDir, "app-state.js")).href);
  const StandHk = await import(pathToFileURL(path.join(standDir, "hooks.js")).href);
  StandHk.hooks.scheduleDeskBranch = () => {};
  StandHk.hooks.rebuildCards = () => {};
  StandAs.putLang("en");
  StandAs.setCards([{ id: "c-a", t: "Card A", en: "Body A." }, { id: "c-b", t: "Card B", en: "Body B." }]);
  StandSt.setLayer("edesk-a~");
  Stand.flagCard("c-b"); Stand.flagCard("c-a");
  const listA = JSON.stringify(Stand.flagFileList());
  StandSt.setLayer("edesk-b~");
  Stand.flagCard("c-a"); Stand.flagCard("c-b");
  const listB = JSON.stringify(Stand.flagFileList());
  const parsedA = JSON.parse(listA);
  check(listA === listB && parsedA[0].card === "c-a" && parsedA[1].card === "c-b" && parsedA[0].r === parsedA[1].r, "opposite order, with r fixed, writes the same list");
  ST.setLayer(layer);
  AS.setCards((stored && stored.cards) || []);

  const many = [];
  for (let i = 0; i < 101; i++) many.push({ id: "c-" + String(i).padStart(3, "0"), t: "T" + i, en: "B" + i });
  AS.setCards(many);
  for (let i = 0; i < 100; i++) F.flagCard(many[i].id);
  const full = F.flagCard(many[100].id);
  check(full && full.refused === "full" && F.flagFileList().length === 100, "the 101st flag is refused");
  ST.setLayer(layer); wipe();
  AS.setCards((stored && stored.cards) || []);

  F.flagCard("c-b");
  const cardB = AS.cards.find((m) => m.id === "c-b");
  const seenB = F.flagFileList()[0].seen;
  const changedCard = Object.assign({}, cardB, { en: "Body B, changed." });
  const atBefore = Date.now();
  check(F.settleFlags({ cards: [changedCard, AS.cards.find((m) => m.id === "c-a")] }, null) === true, "a change of the words ends the flag");
  const ended = F.cardFlag("c-b");
  check(ended && ended.state === "answered" && ended.outcome === "changed" && typeof ended.at === "number" && ended.at >= atBefore && ended.at <= Date.now(), "the outcome is changed, with the moment it was learned");
  const at1 = ended.at;
  check(F.settleFlags({ cards: [changedCard] }, null) === false && F.cardFlag("c-b").at === at1, "a second look does not move the moment");
  F.flagSeen("c-b");
  check(F.cardFlag("c-b") === null, "once the agent has seen the outcome, it goes");

  F.flagCard("c-b");
  const polish = Object.assign({}, cardB, { pl: "Inna tresc." });
  check(F.settleFlags({ cards: [polish] }, null) === false && F.cardFlag("c-b").state === "sent", "a change in another language does not end it");
  const retired = Object.assign({}, cardB, { retired: 1 });
  check(F.settleFlags({ cards: [retired] }, null) === false && F.cardFlag("c-b").state === "sent", "a card still in the edition, retired, is not gone");
  check(F.settleFlags({ cards: [] }, null) === true && F.cardFlag("c-b").outcome === "gone", "a card gone from the edition ends gone");
  F.flagSeen("c-b");

  F.flagCard("c-a"); F.flagCard("c-c");
  const fa = F.flagFileList().filter((f) => f.card === "c-a")[0];
  const fc = F.flagFileList().filter((f) => f.card === "c-c")[0];
  const answered = [
    { f: F.flagDigest(fa.r), o: "kept" },
    { f: F.flagDigest(fc.r), o: "changed" },
  ];
  check(F.flagDigest(fa.r) === sha256("etiuda-flag\n" + fa.r), "f is the sha256 of etiuda-flag, a line feed, and r");
  const cardsNow = (stored.cards || []).slice();
  check(F.settleFlags({ cards: cardsNow }, { answered: answered }) === true, "answered ends the flags it names");
  check(F.cardFlag("c-a").outcome === "kept" && F.cardFlag("c-c").outcome === "changed", "each outcome is the one answered gave");
  F.flagSeen("c-a"); F.flagSeen("c-c");

  F.flagCard("c-b");
  const mine = F.flagFileList()[0];
  check(F.settleFlags({ cards: cardsNow }, { answered: [{ f: "ab".repeat(32), o: "kept" }] }) === false && F.cardFlag("c-b").state === "sent", "a stranger's f does nothing");
  check(F.settleFlags({ cards: cardsNow }, { answered: "nope" }) === false && F.cardFlag("c-b").state === "sent", "an answered that is not a list is ignored");
  check(F.settleFlags({ cards: cardsNow }, { answered: [{ f: F.flagDigest(mine.r), o: "kept", extra: 1 }] }) === false, "an entry with an extra key is ignored whole");
  check(F.settleFlags({ cards: cardsNow }, { answered: [{ f: F.flagDigest(mine.r), o: "gone" }] }) === false && F.cardFlag("c-b").state === "sent", "an outcome the list does not name is ignored");
  const badDoc = JSON.parse(JSON.stringify(origin));
  badDoc.answered = { f: "nope" };
  badDoc.rev = 5;
  check(V2.v2Problems(badDoc).length === 0, "a bad answered does not make the edition unloadable");
  const badParsed = CT.parseCatalogFile(JSON.stringify(badDoc));
  let tookBad = false, takeErr = "";
  try { tookBad = CF.activateCatalog(badParsed, { file: "lamps.ec" }); }
  catch (e) { takeErr = e && e.message ? e.message : String(e); }
  check(tookBad === true && F.cardFlag("c-b").state === "sent", "the edition is still taken", takeErr);

  const moved = JSON.parse(JSON.stringify(origin));
  moved.rev = 6;
  moved.cards[1].body.en = "Body B, from the lead.";
  delete moved.answered;
  const movedParsed = CT.parseCatalogFile(JSON.stringify(moved));
  let tookMoved = false, movedErr = "";
  try { tookMoved = CF.activateCatalog(movedParsed, { file: "lamps.ec" }); }
  catch (e) { movedErr = e && e.message ? e.message : String(e); }
  const afterMove = F.cardFlag("c-b");
  check(tookMoved === true && afterMove && afterMove.state === "answered" && afterMove.outcome === "changed", "the lead's next edition, whose words changed, ends it", movedErr + " " + JSON.stringify(afterMove));
  const staleAt = afterMove && afterMove.at;
  F.flagCard("c-b");
  check(F.cardFlag("c-b").state === "sent", "a new flag replaces an outcome the agent has not opened");
  check(!!staleAt && F.cardFlag("c-b").state === "sent" && F.cardFlag("c-b").at === undefined, "the new flag is not the old outcome");
  F.unflagCard("c-b");

  const round = {
    format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 1,
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-a", shelf: "t-op", bodyShape: "plain", title: { en: "Hello" }, body: { en: "Good day." } }],
    flags: [{ card: "c-a", lang: "en", seen: "ab".repeat(32), r: "cd".repeat(16) }],
    answered: [{ f: "ef".repeat(32), o: "kept" }],
    futureHeader: { n: 1 },
  };
  const roundRuntime = V2.catalogFromV2(round);
  check(!roundRuntime.flags && !roundRuntime.answered && !(roundRuntime.ext && (roundRuntime.ext.flags || roundRuntime.ext.answered)) && roundRuntime.ext && roundRuntime.ext.futureHeader.n === 1,
    "flags and answered are not carried, and a future header still is");
  const roundOut = V2.catalogToV2(roundRuntime);
  check(!("flags" in roundOut) && !("answered" in roundOut) && roundOut.futureHeader && roundOut.futureHeader.n === 1, "an export of the runtime contains neither name");
  const withFlags = V2.catalogToV2(Object.assign({}, roundRuntime, {
    flags: [{ card: "c-a", lang: "en", seen: "ab".repeat(32), r: "cd".repeat(16), note: "Looks wrong" }],
    answered: [{ f: "ef".repeat(32), o: "kept" }],
  }));
  check(Array.isArray(withFlags.flags) && withFlags.flags.length === 1 && !("answered" in withFlags), "the desk file emits flags and never answered");
  ST.setLayer(home());
  wipe();
  AS.setCards((CT.storedCatalog() && CT.storedCatalog().cards) || []);
  F.flagCard("c-a");
  const whileHeld = V2.catalogToV2(roundRuntime);
  check(F.flagHolds() === true && !("flags" in whileHeld) && !("answered" in whileHeld), "a flag in the layer is not part of an export");
  F.unflagCard("c-a");

  console.log("EXAMPLE seen-plain " + F.flagWordsHash(plainCard, "en"));
  console.log("EXAMPLE canon-plain " + V2.v2Canonical(wordsOf(plainCard, "en")));
  console.log("EXAMPLE seen-steps " + F.flagWordsHash(stepsCard, "en"));
  console.log("EXAMPLE canon-steps " + V2.v2Canonical(wordsOf(stepsCard, "en")));
  console.log("EXAMPLE f " + F.flagDigest("00112233445566778899aabbccddeeff"));
  console.log("EXAMPLE f-text etiuda-flag\\n00112233445566778899aabbccddeeff");

  await runPlants();
  done = true;
} catch (e) {
  console.log("  FAIL suite stopped: " + (e && e.stack ? e.stack : e));
  fails++;
}

const want = PLANTS_OFF ? EXPECTED : EXPECTED + PLANT_CHECKS;
if (done && checks !== want) {
  check(false, "tally ran " + checks + " expected " + want);
}
console.log((fails ? "FAIL " : "PASS ") + "card-flag: " + (checks - fails) + "/" + checks + " checks" + (notRun ? ", " + notRun + " NOT RUN" : "") + (done ? "" : " - SUITE DID NOT COMPLETE"));
process.exit(done ? Math.min(fails, 63) : 78);
