/* The agent's default name from the sign-in ID token, its typed/cleared guard, odd name shapes,
 * and the one-time blue bubble in Settings, Account.
 *
 *   node tests/desk-agent-name.mjs      exit code is the number of failed checks, capped at 63
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { OPTIONS } from "../tools/bundler-probe/build.mjs";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const E = require("./engine.js");
const { seatedView } = require("./seat-page.js");
E.ensureOutputs();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const UI_LANG = fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8");
const SETTINGS_SRC = fs.readFileSync(path.join(ROOT, "src", "modules", "settings.js"), "utf8");
const ENGINE_URL = "file:///" + path.join(ROOT, "engine", "etiuda.html").replace(/\\/g, "/");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 41;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line, detail) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else {
    failed++;
    console.log("  FAIL " + line + (detail !== undefined ? " :: " + JSON.stringify(detail) : ""));
  }
}
function notRun(line) {
  skipped++;
  console.log("  NOT RUN " + line);
}

/* Copywriter's Section A words (state/briefs/words-desk-name-and-managed-2026-11-16.md). */
const COPY_EN = {
  "title": "The name on this desk",
  "initial": "{NAME} comes from your account: the first name and the first letter of the surname. Replies that sign with your name use it, and the team's lead sees this desk by it. It can be changed here at any time.",
  "whole": "{NAME} is the name on your account. Replies that sign with your name use it, and the team's lead sees this desk by it. It can be changed here at any time.",
  "close": "Done"
};
const COPY_PL = {
  "title": "Imię na tym stanowisku",
  "initial": "{NAME} pochodzi z konta: to imię i pierwsza litera nazwiska. Ta nazwa trafia do odpowiedzi podpisywanych imieniem, a lider zespołu widzi pod nią to stanowisko. Można ją zmienić tutaj w dowolnej chwili.",
  "whole": "{NAME} to nazwa z konta. Ta nazwa trafia do odpowiedzi podpisywanych imieniem, a lider zespołu widzi pod nią to stanowisko. Można ją zmienić tutaj w dowolnej chwili.",
  "close": "Gotowe"
};

const b64url = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = claims => b64url({ alg: "RS256", typ: "JWT" }) + "." + b64url(claims) + "." + b64url(crypto.randomBytes(16));

/* ---- Shell slices --------------------------------------------------------------------------- */
function decl(src, start) {
  const at = src.indexOf("\n" + start);
  if (at < 0 || src.indexOf("\n" + start, at + 1) >= 0) throw new Error("not in shell/main.js once: " + start);
  if (/^const /.test(start)) return src.slice(at + 1, src.indexOf("\n", at + 1));
  const end = src.indexOf("\n}", at + 1);
  return src.slice(at + 1, end + 2);
}

function loadShell(swap, opt) {
  const o = opt || {};
  const names = [
    "function signinClaims(",
    "const SIGNIN_NOSPACE_SCRIPT =",
    "function signinAgentNameFirstLetter(",
    "function signinAgentNameClean(",
    "function signinAgentNameFromClaims(",
    "function signinAccountNameFromClaims(",
    "function signinAgentAutoRead(",
    "function signinCanFillAgentName(",
    "function signinNameTake(",
    "function signinNameForget(",
  ];
  let body = names.map(d => decl(MAIN, d)).join("\n");
  if (swap) {
    if (body.split(swap[0]).length !== 2) throw new Error("plant anchor not in slice once: " + swap[0]);
    body = body.replace(swap[0], swap[1]);
  }
  const st = {
    deskKeys: o.desk ? Object.assign({}, o.desk) : {},
    saves: 0,
    tells: [],
    deskWritten: false,
  };
  const code = "let deskKeys = " + (o.desk === undefined ? "{}" : JSON.stringify(o.desk)) + ", deskWritten = false;\n"
    + body + "\n"
    + "return { signinClaims, signinAgentNameFromClaims, signinAccountNameFromClaims, signinCanFillAgentName, signinNameTake, signinNameForget, "
    + "getDesk: () => deskKeys, setDesk: d => { deskKeys = d; } };";
  const fn = new Function("readDesk", "saveDeskFile", "deskText", "deskSyncedTell", "console", code);
  const api = fn(
    () => Object.assign({}, st.deskKeys),
    txt => { st.saves++; st.deskKeys = JSON.parse(txt); },
    keys => JSON.stringify(keys),
    (keys, pre) => { st.tells.push({ keys, pre }); },
    { error() {} }
  );
  return { api, st };
}

/* ---- Build lifted HTML for src/ plants ------------------------------------------------------ */
async function buildLiftedHtml(relMod, tag, outPath) {
  const modPath = path.join(ROOT, relMod);
  const lines = fs.readFileSync(modPath, "utf8").split("\n");
  /* The whole name: "plant:desk-works" must not take "plant:desk-works-host" (fs4d lifted the wrong line, the test architect, 2026-11-22). */
  const whole = new RegExp("plant:" + tag + "(?![A-Za-z0-9_-])"); /* a tag is letters, digits and hyphens */
  const plantAt = lines.findIndex(l => whole.test(l));
  if (plantAt < 0) return -1;
  lines.splice(plantAt, 1);
  const liftedSource = lines.join("\n");
  const filterRe = new RegExp(relMod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "[\\\\/]") + "$");
  const built = await esbuild.build({
    ...OPTIONS,
    entryPoints: [path.join(ROOT, "src", "main.js")],
    plugins: [{
      name: "lift-plant-" + tag,
      setup(b) {
        b.onLoad({ filter: filterRe }, () => ({ contents: liftedSource, loader: "js" }));
      }
    }]
  });
  const js = built.outputFiles[0].text
    .split('"@E_BUILT@"').join('"2026-11-16"')
    .split('"@EULA_EN@"').join('""')
    .split('"@EULA_PL@"').join('""');
  const template = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  fs.writeFileSync(outPath, template.replace("/*@APP*/\n", () => js), "utf8");
  return plantAt;
}

/* ---- Part 1 & 2: Shell token extraction, odd shapes, and fill/typed/cleared logic ----------- */
let sh = null;
try { sh = loadShell(null); } catch (e) { sh = null; }

const parse = c => (sh ? sh.api.signinAgentNameFromClaims(c) : null);

/* Part 1 (Requirements 1 & 5): claims and odd shapes */
{
  const r = parse({ given_name: "Marek", family_name: "Zieli\u0144ski", name: "Zieli\u0144ski, Marek" });
  check(!!r && r.name === "Marek Z." && r.form === "initial",
    "an1a given_name and family_name claims are used when present", r);
}
{
  const r1 = parse({ given_name: "\u0141ucja", family_name: "\u015awiderska" });
  const r2 = parse({ name: "\u0141ucja S\u0301widerska" });
  check(!!r1 && r1.name === "\u0141ucja \u015a." && r1.form === "initial"
    && !!r2 && r2.name === "\u0141ucja \u015a." && r2.form === "initial",
    "an1b diacritics keep their diacritic on the initial (including NFD)", [r1, r2]);
}
{
  const r1 = parse({ name: "Alicja Bia\u0142a" });
  const r2 = parse({ name: "Tadeusz Piotr D\u0105browski" });
  check(!!r1 && r1.name === "Alicja B." && r1.form === "initial"
    && !!r2 && r2.name === "Tadeusz D." && r2.form === "initial",
    "an1c display name of two or more words takes first word and first letter of last word", [r1, r2]);
}
{
  const r1 = parse({ name: "Borys" });
  const r2 = parse({ given_name: "Borys" });
  check(!!r1 && r1.name === "Borys" && r1.form === "whole"
    && !!r2 && r2.name === "Borys" && r2.form === "whole",
    "an1d one word only is used whole with no initial invented", [r1, r2]);
}
{
  const r = parse({ name: "W\u00f3jcik, Tomasz" });
  check(!!r && r.name === "W\u00f3jcik, Tomasz" && r.form === "whole",
    "an1e Surname, First display name is kept whole rather than guessing a split", r);
}
{
  const r1 = parse({ name: "Klara Brzezi\u0144ska (Support)" });
  const r2 = parse({ name: "Cezary K\u0142os [IT]" });
  const r3 = parse({ name: "W\u00f3jcik, Tomasz (Helpdesk)" });
  const r4 = parse({ given_name: "Piotr", family_name: "D\u0105b (External)" });
  check(!!r1 && r1.name === "Klara B." && r1.form === "initial"
    && !!r2 && r2.name === "Cezary K." && r2.form === "initial"
    && !!r3 && r3.name === "W\u00f3jcik, Tomasz" && r3.form === "whole"
    && !!r4 && r4.name === "Piotr D." && r4.form === "initial",
    "an1f bracketed or parenthesised suffixes are not taken as a surname", [r1, r2, r3, r4]);
}
{
  const r1 = parse({ name: "\u5c71\u7530\u592a\u90ce" });
  const r2 = parse({ name: "\u5c71\u7530 \u592a\u90ce" });
  const r3 = parse({ name: "\u0e2a\u0e21\u0e0a\u0e32\u0e22 \u0e43\u0e08\u0e14\u0e35" });
  check(!!r1 && r1.name === "\u5c71\u7530\u592a\u90ce" && r1.form === "whole"
    && !!r2 && r2.name === "\u5c71\u7530 \u592a\u90ce" && r2.form === "whole"
    && !!r3 && r3.name === "\u0e2a\u0e21\u0e0a\u0e32\u0e22 \u0e43\u0e08\u0e14\u0e35" && r3.form === "whole",
    "an1g scripts written without spaces are used whole", [r1, r2, r3]);
}
{
  const r1 = parse(null);
  const r2 = parse({});
  const r3 = parse({ name: "" });
  const r4 = parse({ name: "   \t\n  " });
  const r5 = parse({ name: "(Support)" });
  check(r1 === null && r2 === null && r3 === null && r4 === null && r5 === null,
    "an1h empty or whitespace or suffix-only names fill nothing", [r1, r2, r3, r4, r5]);
}
{
  const gOpenid = parse({ iss: "https://accounts.google.com", sub: "1001" });
  const gProfile = parse({ iss: "https://accounts.google.com", sub: "1001", given_name: "Helena", family_name: "Kowalczyk" });
  const msScope = (/microsoft:\s*Object\.freeze\(\{[\s\S]{0,400}?scope:\s*"([^"]+)"/.exec(MAIN) || [])[1];
  const gScope = (/google:\s*Object\.freeze\(\{[\s\S]{0,400}?scope:\s*"([^"]+)"/.exec(MAIN) || [])[1];
  check(gOpenid === null && !!gProfile && gProfile.name === "Helena K." && gProfile.form === "initial"
    && msScope === "openid profile email offline_access" && gScope === "openid email profile",
    "an1i Google openid-only fills nothing today, fills once profile claims arrive, and provider scopes stay untouched",
    { gOpenid, gProfile, msScope, gScope });
}

/* Part 2: shell fill, renewal, typed/cleared preservation, and agent.js helpers */
{
  const s = sh ? loadShell(null, { desk: {} }) : null;
  const ok = !!s && s.api.signinNameTake(jwt({ given_name: "Marek", family_name: "Zieli\u0144ski" })) === true;
  const d = s ? s.api.getDesk() : {};
  const told = s && s.st.tells.length === 1 ? s.st.tells[0].keys : null;
  check(ok && d.eAgent === "Marek Z."
    && d.eAgentAuto === JSON.stringify({ name: "Marek Z.", form: "initial" })
    && s.st.saves === 1 && !!told && told.eAgent === "Marek Z.",
    "an2a sign-in fills empty desk name, records provenance, saves desk, and notifies renderer", { ok, d, told });
}
{
  const s = sh ? loadShell(null, { desk: { eAgent: "Zofia", eAccountName: "Marek Zieli\u0144ski" } }) : null;
  const took = s ? s.api.signinNameTake(jwt({ given_name: "Marek", family_name: "Zieli\u0144ski" })) : true;
  check(!!s && took === false && s.api.getDesk().eAgent === "Zofia" && s.st.saves === 0,
    "an2b pre-existing typed name without provenance is never replaced", s && s.api.getDesk());
}
{
  const s = sh ? loadShell(null, { desk: { eAgent: "Marek", eAgentAuto: "typed", eAccountName: "Alicja Bia\u0142a" } }) : null;
  const took = s ? s.api.signinNameTake(jwt({ given_name: "Alicja", family_name: "Bia\u0142a" })) : true;
  check(!!s && took === false && s.api.getDesk().eAgent === "Marek" && s.st.saves === 0,
    "an2c name edited by agent (marked typed) is never replaced on renewal or another account", s && s.api.getDesk());
}
{
  const s = sh ? loadShell(null, { desk: { eAgent: "", eAgentAuto: "typed", eAccountName: "Marek Zieli\u0144ski" } }) : null;
  const took = s ? s.api.signinNameTake(jwt({ given_name: "Marek", family_name: "Zieli\u0144ski" })) : true;
  check(!!s && took === false && s.api.getDesk().eAgent === "" && s.st.saves === 0,
    "an2d name cleared on purpose is not refilled at renewal or later sign-in", s && s.api.getDesk());
}
{
  const s = sh ? loadShell(null, { desk: { eAgent: "Marek Z.", eAgentAuto: JSON.stringify({ name: "Marek Z.", form: "initial" }) } }) : null;
  const took = s ? s.api.signinNameTake(jwt({ given_name: "Alicja", family_name: "Bia\u0142a" })) : false;
  check(!!s && took === true && s.api.getDesk().eAgent === "Alicja B."
    && s.api.getDesk().eAgentAuto === JSON.stringify({ name: "Alicja B.", form: "initial" }),
    "an2e untouched desk-filled name updates when signing in as another account", s && s.api.getDesk());
}
{
  /* Check full signinRenewNow wiring invokes signinNameTake when renewal succeeds */
  const renewNowSrc = (() => { try { return decl(MAIN, "async function signinRenewNow("); } catch { return ""; } })();
  const renewHeldSrc = (() => { try { return decl(MAIN, "async function signinRenewHeld("); } catch { return ""; } })();
  const signinHandler = MAIN.slice(MAIN.indexOf('ipcMain.handle("etiuda:signin"'), MAIN.indexOf('ipcMain.handle("etiuda:signin-again"'));
  check(renewHeldSrc.includes("idToken") && renewNowSrc.includes("signinNameTake") && signinHandler.includes("signinNameTake"),
    "an2f sign-in handler and quiet renewal both pass ID token to signinNameTake");
}
{
  /* Check agent.js helpers in Node */
  const A = await import(pathToFileURL(path.join(ROOT, "src", "modules", "agent.js")).href);
  const S = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const H = await import(pathToFileURL(path.join(ROOT, "src", "modules", "hooks.js")).href);
  H.hooks.render = () => {};
  for (const k of ["eAgent", "eAgentAuto", "eAgentNoteSeen", "eNameAsked"]) S.lsDel(k);
  const hasFns = typeof A.typeAgentName === "function" && typeof A.agentNameNote === "function" && typeof A.markAgentNameNoteSeen === "function";
  let ok = false;
  if (hasFns) {
    /* Desk fills name */
    S.lsSet("eAgent", "Marek Z.");
    S.lsSet("eAgentAuto", JSON.stringify({ name: "Marek Z.", form: "initial" }));
    const noteBefore = A.agentNameNote();
    /* Tour Next without editing keeps auto */
    A.keepAgentName("Marek Z.");
    const stillAuto = S.lsGet("eAgentAuto") === JSON.stringify({ name: "Marek Z.", form: "initial" });
    /* Editing in Settings or Tour marks typed */
    A.typeAgentName("Marek");
    const editedTyped = S.lsGet("eAgent") === "Marek" && S.lsGet("eAgentAuto") === "typed" && A.agentNameNote() === null;
    /* Typing back the original string stays typed */
    A.typeAgentName("Marek Z.");
    const backTyped = S.lsGet("eAgentAuto") === "typed";
    /* Clearing marks typed */
    A.typeAgentName("");
    const clearedTyped = S.lsGet("eAgent") === "" && S.lsGet("eAgentAuto") === "typed";
    /* "Later" in askAgentName when empty does not mark typed */
    S.lsDel("eAgent"); S.lsDel("eAgentAuto"); S.lsDel("eNameAsked");
    A.keepAgentName("");
    const laterNotTyped = S.lsGet("eAgentAuto") == null && S.lsGet("eNameAsked") === "1";
    ok = !!noteBefore && noteBefore.name === "Marek Z." && noteBefore.form === "initial"
      && stillAuto && editedTyped && backTyped && clearedTyped && laterNotTyped;
  }
  check(hasFns && ok, "an2g agent.js distinguishes desk-filled from typed/cleared and Later", { hasFns, ok });
}

/* Part 2b: the account's own name, in full, kept beside the customer-facing one and never taken from it */
{
  const s = sh ? loadShell(null, { desk: {} }) : null;
  const ok = !!s && s.api.signinNameTake(jwt({ given_name: "Marek", family_name: "Zieli\u0144ski" })) === true;
  const d = s ? s.api.getDesk() : {};
  const told = s && s.st.tells.length === 1 ? s.st.tells[0].keys : null;
  check(ok && d.eAccountName === "Marek Zieli\u0144ski" && d.eAgent === "Marek Z." && s.st.saves === 1
    && !!told && told.eAccountName === "Marek Zieli\u0144ski",
    "an5a sign-in keeps the account's full name beside the abbreviated reply name, in one save, and tells the page", { ok, d, told });
}
{
  const s = sh ? loadShell(null, { desk: { eAgent: "Marek", eAgentAuto: "typed" } }) : null;
  const took = s ? s.api.signinNameTake(jwt({ given_name: "Alicja", family_name: "Bia\u0142a" })) : true;
  const d = s ? s.api.getDesk() : {};
  check(!!s && took === false && d.eAgent === "Marek" && d.eAgentAuto === "typed" && d.eAccountName === "Alicja Bia\u0142a" && s.st.saves === 1,
    "an5b a typed reply name stays as typed while the account's full name is still kept", d);
}
{
  const s = sh ? loadShell(null, { desk: {} }) : null;
  const claims = [{ given_name: "Marek", family_name: "Zieli\u0144ski" }, { name: "Alicja Bia\u0142a (Support)" }, { name: "Borys" }, { iss: "x", sub: "1" },
    { given_name: "Piotr", family_name: "D\u0105b (External)" }];
  const got = s ? claims.map(c => s.api.signinAccountNameFromClaims(c)) : [];
  check(got.join("|") === "Marek Zieli\u0144ski|Alicja Bia\u0142a|Borys||Piotr D\u0105b",
    "an5c the account's name is the given and family names in full, else the display name, brackets dropped, empty where none arrives", got);
}
{
  const s = sh ? loadShell(null, { desk: { eAccountName: "Marek Zieli\u0144ski" } }) : null;
  const took = s ? s.api.signinNameTake(jwt({ given_name: "Marek", family_name: "Zieli\u0144ski" })) : false;
  const none = s ? s.api.signinNameTake(jwt({ iss: "x", sub: "1" })) : true;
  check(!!s && took === true && none === false && s.api.getDesk().eAccountName === "Marek Zieli\u0144ski" && s.st.saves === 1,
    "an5d a token with no name leaves the kept full name alone, and a name already kept is not written again", s && s.api.getDesk());
}
{
  const s = sh ? loadShell(null, { desk: { eAgent: "Marek Z.", eAccountName: "Marek Zieli\u0144ski" } }) : null;
  if (s) s.api.signinNameForget();
  const d = s ? s.api.getDesk() : {};
  const told = s && s.st.tells.length === 1 ? s.st.tells[0].keys : null;
  check(!!s && !("eAccountName" in d) && d.eAgent === "Marek Z." && !!told && told.eAccountName === null,
    "an5e leaving the account forgets its full name and leaves the reply name", { d, told });
}

/* Part 3: Copywriter's bytes & one-time blue bubble in Settings, Account */
{
  const hasUiStrings = UI_LANG.includes(JSON.stringify(COPY_EN.title) + ":" + JSON.stringify(COPY_PL.title))
    && UI_LANG.includes(JSON.stringify(COPY_EN.initial) + ":" + JSON.stringify(COPY_PL.initial))
    && UI_LANG.includes(JSON.stringify(COPY_EN.whole) + ":" + JSON.stringify(COPY_PL.whole))
    && UI_LANG.includes(JSON.stringify(COPY_EN.close) + ":" + JSON.stringify(COPY_PL.close));
  const hasSettingsStrings = SETTINGS_SRC.includes(JSON.stringify(COPY_EN.title))
    && SETTINGS_SRC.includes(JSON.stringify(COPY_EN.initial))
    && SETTINGS_SRC.includes(JSON.stringify(COPY_EN.whole))
    && SETTINGS_SRC.includes(JSON.stringify(COPY_EN.close));
  check(hasUiStrings && hasSettingsStrings,
    "an3a ui-lang.js and settings.js hold the copywriter's EN and PL strings byte for byte", { hasUiStrings, hasSettingsStrings });
}

async function launchDeskPage(browser, cfg) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: cfg.width || 1280, height: cfg.height || 860, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const seat = seatedView({ offered: ["microsoft"], signedIn: "microsoft" });
  await page.evaluateOnNewDocument((c, seat) => {
    window.__deskStore = Object.assign({
      eTourDone_v3: "1",
      eTourInvite_v3: "1",
      eFirstSigninSeen: "1",
    }, c.desk || {});
    window.__signinState = Object.assign({}, seat, c.signin || {});
    window.E_HOST = {
      shown: true,
      lang: c.lang || "en",
      deskRead: () => JSON.stringify(window.__deskStore),
      deskSave: txt => { window.__deskStore = JSON.parse(txt); return true; },
      signinState: () => window.__signinState,
      onSignin: () => () => {},
      onDeskSynced: fn => { window.__onDeskSynced = fn; },
    };
  }, cfg, seat);
  await page.goto(cfg.url || ENGINE_URL, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById("settingsBtn"), { timeout: 15000 });
  return { ctx, page };
}

const BUB_AT = `(() => {
  const bub = document.getElementById("eAgentNote");
  const ctl = document.getElementById("setAgentName");
  if (!bub) return { why: "no bubble" };
  const side = bub.getAttribute("data-side");
  const tip = bub.querySelector(":scope > .bub-tip");
  if (!tip || !tip.getClientRects().length) return { why: "no pointer", side };
  if (!ctl || !ctl.getClientRects().length) return { why: "no field", side };
  const t = tip.getBoundingClientRect(), c = ctl.getBoundingClientRect();
  let perp, along, lo, hi;
  if (side === "below") { perp = t.top - c.bottom; along = t.left + t.width / 2; lo = c.left; hi = c.right; }
  else if (side === "above") { perp = c.top - t.bottom; along = t.left + t.width / 2; lo = c.left; hi = c.right; }
  else if (side === "right") { perp = t.left - c.right; along = t.top + t.height / 2; lo = c.top; hi = c.bottom; }
  else if (side === "left") { perp = c.left - t.right; along = t.top + t.height / 2; lo = c.top; hi = c.bottom; }
  else return { why: "side " + side };
  const b = bub.getBoundingClientRect();
  const shown = b.top >= -1 && b.left >= -1 && b.bottom <= innerHeight + 1 && b.right <= innerWidth + 1;
  const ok = shown && perp >= -2 && perp <= 11 && along >= lo - 0.5 && along <= hi + 0.5;
  const h3 = bub.querySelector("h3"), p = bub.querySelector("p"), btn = bub.querySelector(".tour-actions button");
  const bg = getComputedStyle(bub).backgroundColor;
  return {
    ok, side, perp: Math.round(perp * 10) / 10, bg,
    isBlue: bub.classList.contains("bub") && !bub.classList.contains("paper"),
    title: h3 ? h3.textContent : "",
    line: p ? p.textContent : "",
    btn: btn ? btn.textContent : "",
    val: ctl.value,
  };
})()`;

const browser = await puppeteer.launch({
  executablePath: E.browserPath("chrome"),
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
});

try {
  /* an3b & an3c: EN initial bubble pointing at #setAgentName, shown once and never again */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      desk: { eUiLang: "en", eAgent: "Marek Z.", eAgentAuto: JSON.stringify({ name: "Marek Z.", form: "initial" }) }
    });
    await page.evaluate(() => { hooks.openSettings("account"); });
    await sleep(350);
    const info = await page.evaluate(BUB_AT);
    const seenMarked = await page.evaluate(() => window.__deskStore.eAgentNoteSeen === "1");
    check(info.ok && info.isBlue && info.val === "Marek Z."
      && info.title === COPY_EN.title
      && info.line === COPY_EN.initial.replace("{NAME}", "Marek Z.")
      && info.btn === COPY_EN.close
      && seenMarked,
      "an3b EN initial blue bubble points at #setAgentName with exact copy and marks seen", info);

    const wasOpen = await page.evaluate(() => !!document.getElementById("eAgentNote"));
    await page.click("#eAgentNoteDone").catch(() => {});
    await sleep(200);
    const gone = await page.evaluate(() => !document.getElementById("eAgentNote"));
    await page.evaluate(() => { hooks.openSettings("general"); });
    await sleep(150);
    await page.evaluate(() => { hooks.openSettings("account"); });
    await sleep(250);
    const reopened = await page.evaluate(() => !!document.getElementById("eAgentNote"));
    check(wasOpen && gone && !reopened, "an3c Done closes bubble and reopening Settings Account never shows it again", { wasOpen, gone, reopened });
    await ctx.close();
  }

  /* an3d: PL whole-name bubble */
  {
    const who = "W\u00f3jcik, Tomasz";
    const { ctx, page } = await launchDeskPage(browser, {
      desk: { eUiLang: "pl", eAgent: who, eAgentAuto: JSON.stringify({ name: who, form: "whole" }) }
    });
    await page.evaluate(() => { hooks.openSettings("account"); });
    await sleep(350);
    const info = await page.evaluate(BUB_AT);
    check(info.ok && info.isBlue && info.val === who
      && info.title === COPY_PL.title
      && info.line === COPY_PL.whole.replace("{NAME}", who)
      && info.btn === COPY_PL.close,
      "an3d PL whole-name blue bubble points at #setAgentName with exact Polish copy", info);
    await ctx.close();
  }

  /* an3e: EN whole-name bubble */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      desk: { eUiLang: "en", eAgent: "Borys", eAgentAuto: JSON.stringify({ name: "Borys", form: "whole" }) }
    });
    await page.evaluate(() => { hooks.openSettings("account"); });
    await sleep(350);
    const info = await page.evaluate(BUB_AT);
    check(info.ok && info.isBlue && info.val === "Borys"
      && info.title === COPY_EN.title
      && info.line === COPY_EN.whole.replace("{NAME}", "Borys")
      && info.btn === COPY_EN.close,
      "an3e EN whole-name blue bubble uses whole-name copy", info);
    await ctx.close();
  }

  /* an3f: editing and clearing #setAgentName in Settings, plus bubble cleanup on leaving Settings */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      desk: { eUiLang: "en", eAgent: "Marek Z.", eAgentAuto: JSON.stringify({ name: "Marek Z.", form: "initial" }) }
    });
    await page.evaluate(() => { hooks.openSettings("account"); });
    await sleep(300);
    const upAtOpen = await page.evaluate(() => !!document.getElementById("eAgentNote"));
    await page.evaluate(() => { hooks.openSettings("general"); });
    await sleep(200);
    const goneOnLeave = await page.evaluate(() => !document.getElementById("eAgentNote"));
    await page.evaluate(() => { hooks.openSettings("account"); });
    await sleep(200);
    await page.focus("#setAgentName");
    await page.evaluate(() => {
      const el = document.getElementById("setAgentName");
      el.value = "Marek";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(100);
    const afterEdit = await page.evaluate(() => ({ a: window.__deskStore.eAgent, auto: window.__deskStore.eAgentAuto }));
    await page.evaluate(() => {
      const el = document.getElementById("setAgentName");
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(100);
    const afterClear = await page.evaluate(() => ({ a: window.__deskStore.eAgent, auto: window.__deskStore.eAgentAuto }));
    check(upAtOpen && goneOnLeave
      && afterEdit.a === "Marek" && afterEdit.auto === "typed"
      && afterClear.a === "" && afterClear.auto === "typed",
      "an3f Settings field edits and clears as typed, and bubble closes when leaving Account",
      { upAtOpen, goneOnLeave, afterEdit, afterClear });
    await ctx.close();
  }

  /* an5f to an5h: the account card's heading is the account's own name in full; the field below it keeps the reply name, under its new label */
  {
    const { ctx, page } = await launchDeskPage(browser, {
      desk: { eUiLang: "en", eAgent: "Marek Z.", eAgentAuto: JSON.stringify({ name: "Marek Z.", form: "initial" }), eAccountName: "Marek Zieli\u0144ski", eAgentNoteSeen: "1" }
    });
    await page.evaluate(() => { hooks.openSettings("account"); });
    await sleep(350);
    const info = await page.evaluate(() => {
      const h = document.querySelector(".sgn-top .sgn-id b"), av = document.querySelector(".sgn-top .sgn-av");
      const row = document.querySelector('.set-row[data-row="name"] .set-label');
      return { head: h ? h.textContent : "", initial: av ? av.textContent : "", label: row ? row.textContent : "",
        field: (document.getElementById("setAgentName") || {}).value };
    });
    check(info.head === "Marek Zieli\u0144ski" && info.initial === "M" && info.field === "Marek Z.",
      "an5f the account card's heading is the account's full name while the reply name field keeps the abbreviated one", info);
    check(info.label === "Name customers see",
      "an5g the reply name field is labelled Name customers see", info);
    await ctx.close();
  }
  {
    const { ctx, page } = await launchDeskPage(browser, {
      desk: { eUiLang: "en", eAgent: "Marek Z.", eAgentAuto: "typed", eAgentNoteSeen: "1" }
    });
    await page.evaluate(() => { hooks.openSettings("account"); });
    await sleep(350);
    const head = await page.evaluate(() => { const h = document.querySelector(".sgn-top .sgn-id b"); return h ? h.textContent : ""; });
    check(head === "Marek Z.", "an5h with no account name kept the heading falls back to the reply name as before", head);
    await ctx.close();
  }

  /* Part 4: Plants for 1, 2, 5, and 6 */
  const shellPlants = [
    ["an4a plant agent-name-fill turns sign-in fill red", () => {
      const p = loadShell(["const next = Object.assign({}, deskKeys, { eAgent: picked.name, eAgentAuto: auto }); /* plant:agent-name-fill */", "const next = Object.assign({}, deskKeys, { eAgentAuto: auto });"], { desk: {} });
      p.api.signinNameTake(jwt({ given_name: "Marek", family_name: "Zieli\u0144ski" }));
      return p.api.getDesk().eAgent !== "Marek Z.";
    }],
    ["an4b plant agent-name-typed turns typed-preservation red", () => {
      const p = loadShell(["if (rawAuto === \"typed\") return false; /* plant:agent-name-typed */", "if (rawAuto === \"typed\") return true;"], { desk: { eAgent: "Marek", eAgentAuto: "typed" } });
      p.api.signinNameTake(jwt({ given_name: "Alicja", family_name: "Bia\u0142a" }));
      return p.api.getDesk().eAgent === "Alicja B.";
    }],
    ["an4c plant agent-name-cleared turns cleared-preservation red", () => {
      const p = loadShell(["if (!cur) return !rawAuto; /* plant:agent-name-cleared */", "if (!cur) return true;"], { desk: { eAgent: "", eAgentAuto: JSON.stringify({ name: "Marek Z.", form: "initial" }) } });
      p.api.signinNameTake(jwt({ given_name: "Marek", family_name: "Zieli\u0144ski" }));
      return p.api.getDesk().eAgent === "Marek Z.";
    }],
    ["an4d plant agent-name-brackets turns bracketed-suffix handling red", () => {
      const p = loadShell(["/* plant:agent-name-brackets */", "/* off */ return String(s || \"\").trim().replace(/\\s+/g, \" \");"], {});
      const r = p.api.signinAgentNameFromClaims({ name: "Klara Brzezi\u0144ska (Support)" });
      return !r || r.name !== "Klara B.";
    }],
    ["an4e plant agent-name-nospace turns no-space script handling red", () => {
      const p = loadShell(["if (SIGNIN_NOSPACE_SCRIPT.test(s)) return { name: s, form: \"whole\" }; /* plant:agent-name-nospace */", ""], {});
      const r = p.api.signinAgentNameFromClaims({ name: "\u5c71\u7530 \u592a\u90ce" });
      return !r || r.form !== "whole";
    }],
    ["an4f plant agent-name-comma turns comma handling red", () => {
      const p = loadShell(["if (s.indexOf(\",\") >= 0) return { name: s, form: \"whole\" }; /* plant:agent-name-comma */", ""], {});
      const r = p.api.signinAgentNameFromClaims({ name: "W\u00f3jcik, Tomasz" });
      return !r || r.form !== "whole";
    }],
    ["an4g plant agent-name-claims turns given/family claim priority red", () => {
      const p = loadShell(["if (given && family) { /* plant:agent-name-claims */", "if (false) {"], {});
      const r = p.api.signinAgentNameFromClaims({ given_name: "Marek", family_name: "Zieli\u0144ski", name: "Zieli\u0144ski, Marek" });
      return !r || r.name !== "Marek Z.";
    }],
  ];

  for (const [label, fn] of shellPlants) {
    if (PLANTS_OFF) notRun(label + " (ETIUDA_PLANTS=off)");
    else {
      let red = false;
      try { red = !!fn(); } catch { red = false; }
      check(red, label);
    }
  }

  const domPlants = [
    ["an4h lifting plant:agent-type-mark fails to mark Settings edit as typed", async lab => {
      const htmlPath = path.join(lab, "type-mark.html");
      if (await buildLiftedHtml("src/modules/agent.js", "agent-type-mark", htmlPath) < 0) return false;
      const { ctx, page } = await launchDeskPage(browser, {
        url: "file:///" + htmlPath.replace(/\\/g, "/"),
        desk: { eUiLang: "en", eAgent: "Marek Z.", eAgentAuto: JSON.stringify({ name: "Marek Z.", form: "initial" }) }
      });
      await page.evaluate(() => { hooks.openSettings("account"); });
      await sleep(250);
      await page.evaluate(() => {
        const el = document.getElementById("setAgentName");
        el.value = "Marek";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await sleep(100);
      const auto = await page.evaluate(() => window.__deskStore.eAgentAuto);
      await ctx.close();
      return auto !== "typed";
    }],
    ["an4i lifting plant:agent-note-show prevents bubble from appearing", async lab => {
      const htmlPath = path.join(lab, "note-show.html");
      if (await buildLiftedHtml("src/modules/settings.js", "agent-note-show", htmlPath) < 0) return false;
      const { ctx, page } = await launchDeskPage(browser, {
        url: "file:///" + htmlPath.replace(/\\/g, "/"),
        desk: { eUiLang: "en", eAgent: "Marek Z.", eAgentAuto: JSON.stringify({ name: "Marek Z.", form: "initial" }) }
      });
      await page.evaluate(() => { hooks.openSettings("account"); });
      await sleep(250);
      const shown = await page.evaluate(() => !!document.getElementById("eAgentNote"));
      await ctx.close();
      return !shown;
    }],
    ["an4j lifting plant:agent-note-once shows bubble again on second visit", async lab => {
      const htmlPath = path.join(lab, "note-once.html");
      if (await buildLiftedHtml("src/modules/settings.js", "agent-note-once", htmlPath) < 0) return false;
      const { ctx, page } = await launchDeskPage(browser, {
        url: "file:///" + htmlPath.replace(/\\/g, "/"),
        desk: { eUiLang: "en", eAgent: "Marek Z.", eAgentAuto: JSON.stringify({ name: "Marek Z.", form: "initial" }) }
      });
      await page.evaluate(() => { hooks.openSettings("account"); });
      await sleep(250);
      await page.click("#eAgentNoteDone").catch(() => {});
      await sleep(150);
      await page.evaluate(() => { hooks.openSettings("general"); });
      await sleep(100);
      await page.evaluate(() => { hooks.openSettings("account"); });
      await sleep(250);
      const shownAgain = await page.evaluate(() => !!document.getElementById("eAgentNote"));
      await ctx.close();
      return shownAgain === true;
    }],
    ["an4k lifting plant:agent-note-form breaks the whole-name form line", async lab => {
      const htmlPath = path.join(lab, "note-form.html");
      if (await buildLiftedHtml("src/modules/settings.js", "agent-note-form", htmlPath) < 0) return false;
      const { ctx, page } = await launchDeskPage(browser, {
        url: "file:///" + htmlPath.replace(/\\/g, "/"),
        desk: { eUiLang: "en", eAgent: "Borys", eAgentAuto: JSON.stringify({ name: "Borys", form: "whole" }) }
      });
      await page.evaluate(() => { hooks.openSettings("account"); });
      await sleep(250);
      const line = await page.evaluate(() => {
        const p = document.querySelector("#eAgentNote p");
        return p ? p.textContent : "";
      });
      await ctx.close();
      return line !== COPY_EN.whole.replace("{NAME}", "Borys");
    }],
  ];

  const plantLab = PLANTS_OFF ? "" : fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-agent-name-plant-"));
  try {
    for (const [label, fn] of domPlants) {
      if (PLANTS_OFF) notRun(label + " (ETIUDA_PLANTS=off)");
      else {
        let red = false;
        try { red = !!(await fn(plantLab)); } catch { red = false; }
        check(red, label);
      }
    }
  } finally {
    if (plantLab) try { fs.rmSync(plantLab, { recursive: true, force: true }); } catch (_) {}
  }
} finally {
  await browser.close();
}

console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log("\n" + asserted + " checks, " + failed + " failed");
process.exit(Math.min(63, failed));
