/* Board 974, C12, the desk's half. An admitted desk whose team lists a catalog the lead has not
 * published says so on the team row Settings already shows, and stops once that edition is in the mirror.
 *
 *     node tests/desk-first-edition.mjs
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createLab } from "./lab-owner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const nodeRequire = createRequire(import.meta.url);
const EXPECTED = 2;
const EN = "This desk waits for the team's lead to publish a first edition.";
const EN_HTML = "This desk waits for the team&#39;s lead to publish a first edition.";
const PL = "To stanowisko czeka na pierwsze wydanie od lidera zespołu.";

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = createLab("etiuda-desk-first-edition-");
const noop = () => {};
const inert = new Proxy(function () {}, {
  get: (target, prop) => {
    if (prop === "getBounds") return () => ({ x: 0, y: 0, width: 800, height: 600 });
    if (prop === "isDestroyed") return () => false;
    return inert;
  },
  set: () => true,
  apply: () => undefined
});
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

function loadDesk(ud) {
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop };
  const said = [];
  const on = {}, invoke = [];
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
      whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: inert,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
      decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8")
    }
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  const src = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console", src)(
    n => (n === "electron" ? electron : nodeRequire(n)),
    path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet);
  const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
  /* The lock stands aside in this lab, so the boot's own read does not run. The desk channel is that read. */
  const boot = eventFor();
  if (typeof on["etiuda:desk"] === "function") on["etiuda:desk"](boot);
  return { api, ask, said, ud };
}

const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const pair = crypto.generateKeyPairSync("ed25519");
const LEAD = { keyId: "lead-01", public: pubHex(pair.publicKey) };
const V2 = await import(pathToFileURL(path.join(ROOT, "src", "modules", "catalog-v2.js")).href);
const sign = (doc, key, keyId) => {
  const out = JSON.parse(JSON.stringify(doc));
  delete out.sig;
  out.sig = { alg: "Ed25519", keyId: keyId };
  out.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(out)), key).toString("hex");
  return out;
};
const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
const CATALOG = "wick-board";

function teamFile() {
  return sign({
    format: 1, kind: "etiuda-team", id: TEAM, catalogs: [CATALOG],
    lead: { keyId: LEAD.keyId, public: LEAD.public },
    sealed: true, epoch: 1, roster: []
  }, pair.privateKey, LEAD.keyId);
}
function edition() {
  return sign({
    format: 2, kind: "etiuda-catalog", id: CATALOG, rev: 1, name: "Wick Board", date: "2026-04-01",
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-wick", shelf: "t-op", bodyShape: "plain", title: { en: "Wick" }, body: { en: "A wick." } }]
  }, pair.privateKey, LEAD.keyId);
}

function pageReady() {
  const SYSTEM = ["en-US"];
  Object.defineProperty(globalThis, "navigator", { configurable: true,
    value: { get language() { return SYSTEM[0]; }, get languages() { return SYSTEM; }, clipboard: null } });
  const quietClass = { contains: () => false, add() {}, remove() {}, toggle() {} };
  globalThis.window = { innerWidth: 1280, innerHeight: 800, isSecureContext: true, addEventListener() {}, removeEventListener() {} };
  globalThis.document = {
    querySelector: () => null, getElementById: () => null, querySelectorAll: () => [],
    createElement: () => ({ getContext: () => ({}), style: {}, classList: quietClass, content: { firstChild: null } }),
    createDocumentFragment: () => ({ appendChild() {} }),
    createRange: () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }) }),
    documentElement: { dataset: {}, classList: quietClass },
    body: { classList: quietClass, appendChild: el => el },
    addEventListener() {}, removeEventListener() {}, visibilityState: "visible"
  };
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
  globalThis.cancelAnimationFrame = id => clearTimeout(id);
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
}

const HOOKS = [
  "runShortcut", "syncSampleMark", "syncSaveNotice", "importCatalogHere", "loadCatalogFromFolder",
  "offerPickedCatalog", "openManage", "mgCardsIn", "openCategoryEditor", "openIntentEditor",
  "segFolded", "applyLangUI", "clearSearchQuery", "updateIntentPlaceholder", "clearIntents",
  "pickIntent", "intentPickedLine", "onRailMQChange", "rebuildCards", "render",
  "closeSettingsMenu", "syncSettingsMenu", "endTour", "startTour", "tourActive",
  "openSettings", "cardOrderTouched", "railDecorate", "drawIntentRail", "syncRailGeometry",
  "scheduleRailGeometry", "setIntentHidden", "syncIntentOrder", "toggleIntentFavourite",
  "syncFavouritesMeta", "ensureCustomCat", "syncAddFab", "syncNextDock", "openCardEditor",
  "flushPillState", "markEntrySel", "listEntryEls", "hideCard", "captureRail", "railRelKeys",
  "railEchoRedraw", "capturePills", "drawPillsCore", "shedSnap", "shedStage", "shedAnimate",
  "shedHold", "shedHolding", "shedWordmarkW", "cardFillKey", "keepPoolAcross", "restartDesk"
];

async function paint(desk, lang) {
  window.E_HOST = {
    teamJoin: (op, file, name, check) => desk.ask("etiuda:team-join", op, file, name, check),
    onTeamJoin: () => {}
  };
  const HK = await import(MOD("hooks.js"));
  HOOKS.forEach(k => { HK.hooks[k] = () => {}; });
  const ST = await import(MOD("storage.js"));
  const TJ = await import(MOD("team-join.js"));
  const SET = await import(MOD("settings.js"));
  ST.lsSet("eUiLang", lang);
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 40));
  return SET.settingsBodyHtml();
}

async function main() {
  const ud = path.join(LAB, "desk");
  const own = path.join(LAB, "own");
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(own, { recursive: true });
  const mirror = path.join(ud, "folder-mirror", TEAM);
  fs.mkdirSync(mirror, { recursive: true });
  fs.writeFileSync(path.join(mirror, "etiuda-team.json"), JSON.stringify(teamFile()), "utf8");
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({
    kind: "etiuda-desk", schema: 1,
    keys: { eCatalogFolder: own, eUiLang: "en" },
    teamPins: { [TEAM]: LEAD },
    teamKeys: { [TEAM]: { "1": "kept" } },
    teamShown: { [TEAM]: { lead: "Ada Quay", folder: "D:\\Teams\\Ada" } }
  }), "utf8");

  let waiting = null, landed = null, en = "", pl = "", enAfter = "", plAfter = "", err = "";
  try {
    const desk = loadDesk(ud);
    waiting = await desk.ask("etiuda:team-join", "leads");
    pageReady();
    en = await paint(desk, "en");
    pl = await paint(desk, "pl");
    fs.writeFileSync(path.join(mirror, CATALOG + ".ec"), JSON.stringify(edition()), "utf8");
    landed = await desk.ask("etiuda:team-join", "leads");
    enAfter = await paint(desk, "en");
    plAfter = await paint(desk, "pl");
  } catch (e) {
    err = e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : String(e);
  }

  const row = waiting && Array.isArray(waiting.leads) ? waiting.leads.filter(l => l && l.team === TEAM)[0] : null;
  const shown = !!row && row.admitted === true && row.removed !== true && row.awaitsEdition === true
    && en.indexOf(EN_HTML) >= 0 && pl.indexOf(PL) >= 0;
  check(shown && !err,
    "974c12 an admitted desk whose listed catalog has no edition says it waits, in English and in Polish: "
    + "flag " + (row && row.awaitsEdition) + ", admitted " + (row && row.admitted)
    + ", en " + (en.indexOf(EN_HTML) >= 0) + ", pl " + (pl.indexOf(PL) >= 0)
    + (err ? " " + err : ""));

  const after = landed && Array.isArray(landed.leads) ? landed.leads.filter(l => l && l.team === TEAM)[0] : null;
  const gone = shown && !!after && after.awaitsEdition !== true
    && enAfter.indexOf(EN) < 0 && enAfter.indexOf(EN_HTML) < 0 && plAfter.indexOf(PL) < 0;
  check(gone && !err,
    "974c12 an edition of that catalog in the mirror takes the line away: "
    + "was shown " + shown + ", flag " + (after && after.awaitsEdition)
    + ", en " + (enAfter.indexOf(EN_HTML) >= 0) + ", pl " + (plAfter.indexOf(PL) >= 0)
    + (err ? " " + err : ""));

  if (asserted !== EXPECTED) {
    check(false, "completed " + asserted + " of " + EXPECTED + " checks");
  }
  console.log("desk-first-edition: " + (asserted - failed) + " passed, " + failed + " failed, " + asserted + " of " + EXPECTED);
  process.exit(Math.min(failed, 63));
}

main();
