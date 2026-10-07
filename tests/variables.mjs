/* The catalog's variables, the gender read from a name and the glyph that corrects it, the manual
 * override of {PAX}, and {NAME}, in bare node over the real src/modules.
 *
 *   node tests/variables.mjs     exit code is the number of failed checks, capped at 63; 78 where no
 *                                verdict was reached
 *
 * THE ORACLES. A rule is read through variables.js's own evaluator against facts set here; a card is
 * read as the text fill() gives the clipboard or the screen, and a card's own form of address the same way. The glyph is read as its accessible name
 * and state, which is what a screen reader hears; how it LOOKS is Maxim's to judge on the desk.
 *
 * THE OLD TEXT. Section 9 fills one grid of cards, names, flags, languages, intents and hours twice: with
 * this tree's fill() and with the fill() of BASE, the engine before variables, read out of git. A
 * catalog without variables must copy exactly what it copied there. Without git the section is not run
 * and the file says so.
 *
 * NO CONTENT. Every card, name and rule below is invented here.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const BASE = "e3fe06b";
const NO_VERDICT = 78;

/* ---- the grid, run as a child against a modules folder: prints the fills as JSON -------------- */
if (process.argv[2] === "--grid") {
  const dir = process.argv[3], withVars = process.argv[4] === "vars";
  const MODG = n => pathToFileURL(path.join(dir, n)).href;
  const boxes = new Map();
  globalThis.window = globalThis.window || { innerWidth: 1280, innerHeight: 800 };
  globalThis.document = {
    querySelector: sel => { if (!boxes.has(sel)) boxes.set(sel, { value: "" }); return boxes.get(sel); },
    createElement: () => ({ getContext: () => ({}) }), createRange: () => ({})
  };
  const RealDate = Date;
  let clock = [8, 0];
  globalThis.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else { super(2026, 9, 6, clock[0], clock[1]); } }
    static now() { return new RealDate(2026, 9, 6, clock[0], clock[1]).getTime(); }
  };
  const D = await import(MODG("dom.js")), S = await import(MODG("storage.js"));
  const A = await import(MODG("app-state.js")), I = await import(MODG("intent-text.js"));
  D.grabDom();
  if (withVars) {
    const V = await import(MODG("variables.js"));
    V.setCatalogVariables({ list: [{ name: "PAX", rules: V.varAddressRules("titleFirst", "titleSurname") }] });
  }
  const TEXTS = ["{GREET}, {PAX}. {Z} {INTENT}: {TOPIC}; {ACTION}. {AGENT} ({INIT}), {ROLE} {DAYPART:dnia|wieczoru} {DAYPART:a|b|c}",
    "Thanks, {PAX}", "{PAX}, {ROLE} will answer, {AGENT}."];
  const FLAGS = [{}, { firstOnly: 1 }, { firstOnly: 1, paxVoc: 0 }, { paxVoc: 1 }, { firstOnly: 1, paxVoc: 1 }, { paxVoc: 0 }];
  const NAMES = ["", "anna kowalska", "KUBA NOWAK", "Grzesiek", "Mary-Jane Smith", "Kim"];
  const out = [];
  for (const time of [[8, 0], [14, 30], [20, 15], [3, 59]]) for (const text of TEXTS) for (const f of FLAGS)
    for (const name of NAMES) for (const L of ["en", "pl"]) for (const mark of [false, true]) for (const full of [false, true]) {
      clock = time;
      D.pax.value = name; D.roleSel.value = full ? "Ops" : "";
      S.lsSet("eAgent", full ? "Jan Kowalski" : "");
      A.setIntentIdxs([]); A.setIntentText(full ? "zmianą rezerwacji" : "");
      const m = Object.assign({ en: text, pl: text }, f);
      out.push(I.fill(text, m, mark, L));
    }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const EXPECTED = 80;
let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
const noVerdict = why => {
  console.log("  FAIL no verdict: " + why);
  console.log("#counts checks=" + asserted + " failed=" + (failed + 1) + " expected=" + EXPECTED);
  console.log("RESULT: FAIL no verdict");
  process.exit(NO_VERDICT);
};

/* ---- the world fill() and the glyph read --------------------------------------------------- */
class Drum {
  constructor() { this.attrs = {}; this.dataset = {}; this.title = ""; this.track = { innerHTML: "", classList: { remove() {}, add() {} } };
    const cls = new Set(); this.classList = { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }, contains: c => cls.has(c) };
    this.listeners = {}; }
  querySelector(s) { return s === ".gd-track" ? this.track : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(k, f) { this.listeners[k] = f; }
  get offsetWidth() { return 0; }
}
const drum = new Drum();
const boxes = new Map([["#genderDrum", drum]]);
globalThis.window = globalThis.window || { innerWidth: 1280, innerHeight: 800 };
globalThis.document = {
  querySelector: sel => { if (!boxes.has(sel)) boxes.set(sel, { value: "" }); return boxes.get(sel); },
  querySelectorAll: () => [],
  createElement: () => ({ getContext: () => ({}) }), createRange: () => ({})
};
const RealDate = Date;
let clock = [10, 0, 2026, 9, 6];
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(clock[2], clock[3], clock[4], clock[0], clock[1]); }
  static now() { return new RealDate(clock[2], clock[3], clock[4], clock[0], clock[1]).getTime(); }
};

let D, S, A, I, V, G, F, C2, R, HK;
try {
  D = await import(MOD("dom.js")); S = await import(MOD("storage.js")); A = await import(MOD("app-state.js"));
  I = await import(MOD("intent-text.js")); V = await import(MOD("variables.js"));
  G = await import(MOD("gender-drum.js")); F = await import(MOD("card-fields.js"));
  C2 = await import(MOD("catalog-v2.js")); R = await import(MOD("rail-list.js"));
  HK = await import(MOD("hooks.js"));
  D.grabDom();
  S.lsSet("eUiLang", "en");
} catch (e) { noVerdict("the engine's modules did not load in bare node: " + String(e && e.message).split("\n")[0]); }
const world = (o) => {
  D.pax.value = o.name || ""; D.roleSel.value = o.role || "";
  S.lsSet("eAgent", o.agent || "");
  A.setIntentIdxs([]); A.setIntentText(o.intent || "");
  clock = o.clock || [10, 0, 2026, 9, 6];
};

try {
  /* ---- 1. every kind of condition, each comparison held and not held ------------------------- */
  const facts = { minutes: 17 * 60 + 20, weekday: "2", date: "10-06", daypart: "afternoon", lang: "pl",
    name: "Anna Kowalska", first: "Anna", gender: "f", intentIds: ["t-late", "t-gift"], intentSet: true, intents: 2,
    topic: "", agent: "Ola", role: "Tadek" };
  const H = (fact, op, value) => V.condHolds(value === undefined ? { fact, op } : { fact, op, value }, facts);
  const pairs = [
    ["time before", H("time", "before", "18:00"), H("time", "before", "17:20")],
    ["time after", H("time", "after", "17:20"), H("time", "after", "17:21")],
    ["weekday is", H("weekday", "is", 2), H("weekday", "is", 3)],
    ["weekday is not", H("weekday", "isnot", 3), H("weekday", "isnot", 2)],
    ["weekday is one of", H("weekday", "oneof", [6, 7, 2]), H("weekday", "oneof", [6, 7])],
    ["date is", H("date", "is", "10-06"), H("date", "is", "12-24")],
    ["date is not", H("date", "isnot", "12-24"), H("date", "isnot", "10-06")],
    ["date before", H("date", "before", "10-07"), H("date", "before", "10-06")],
    ["date after", H("date", "after", "10-05"), H("date", "after", "10-06")],
    ["time of day is", H("daypart", "is", "afternoon"), H("daypart", "is", "evening")],
    ["time of day is not", H("daypart", "isnot", "morning"), H("daypart", "isnot", "afternoon")],
    ["time of day is one of", H("daypart", "oneof", ["morning", "afternoon"]), H("daypart", "oneof", ["evening"])],
    ["language is", H("lang", "is", "pl"), H("lang", "is", "en")],
    ["language is one of", H("lang", "oneof", ["en", "pl"]), H("lang", "oneof", ["de"])],
    ["full name is, any case", H("name", "is", "anna kowalska"), H("name", "is", "Anna")],
    ["first name is not", H("first", "isnot", "Kuba"), H("first", "isnot", "ANNA")],
    ["first name is one of", H("first", "oneof", ["Ola", "Anna"]), H("first", "oneof", ["Ola"])],
    ["agent is set", H("agent", "set"), H("topic", "set")],
    ["topic is not set", H("topic", "unset"), H("agent", "unset")],
    ["gender is", H("gender", "is", "f"), H("gender", "is", "m")],
    ["gender is not", H("gender", "isnot", "n"), H("gender", "isnot", "f")],
    ["gender is one of", H("gender", "oneof", ["n", "f"]), H("gender", "oneof", ["m", "n"])],
    ["intent is", H("intent", "is", "t-gift"), H("intent", "is", "t-other")],
    ["intent is not", H("intent", "isnot", "t-other"), H("intent", "isnot", "t-late")],
    ["intent is one of", H("intent", "oneof", ["t-x", "t-late"]), H("intent", "oneof", ["t-x"])],
    ["intent is set", H("intent", "set"), H("intent", "unset")],
    ["number of intents is", H("intents", "is", 2), H("intents", "is", 1)],
    ["number of intents is more than", H("intents", "more", 1), H("intents", "more", 2)],
    ["number of intents is less than", H("intents", "less", 3), H("intents", "less", 2)],
    ["role is", H("role", "is", "tadek"), H("role", "is", "Zosia")],
  ];
  pairs.forEach(([n, yes, no]) => check(yes === true && no === false, "1 " + n + ": holds " + yes + ", and its opposite case " + no));
  check(H("weather", "is", "x") === false && H("time", "is", "17:20") === false && H("time", "before", "25:00") === false,
    "1 a fact or a comparison this build does not know, and a malformed hour, never hold");

  /* ---- 2. rules: the first that fits writes, joined by and or by or, Otherwise last ------------ */
  const def = { name: "REPLYBY", rules: [
    { name: "Courier", when: [{ fact: "intent", op: "oneof", value: ["t-late", "t-back"] }, { fact: "daypart", op: "is", value: "morning" }],
      write: { en: "as soon as the courier answers", pl: "gdy kurier odpowie" } },
    { name: "Weekend", join: "or", when: [{ fact: "weekday", op: "is", value: 6 }, { fact: "weekday", op: "is", value: 7 }, { fact: "intents", op: "more", value: 1 }],
      write: { en: "on Monday", pl: "w poniedziałek" } },
    { when: [], write: { en: "within the hour, {@first}", pl: "w ciągu godziny, {@first-voc}" } }] };
  check(V.varRuleAt(def, facts) === 1, "2a an and whose second condition fails falls through, and an or holds on its third condition: rule " + V.varRuleAt(def, facts));
  const f2 = Object.assign({}, facts, { intents: 0, intentIds: [] , firstVoc: "Anno", first: "Anna" });
  const r2 = V.varResolve(def, f2, "pl", "en");
  check(r2.rule === 2 && r2.text === "w ciągu godziny, Anno", "2b nothing else fits, so Otherwise writes, its desk words filled: " + JSON.stringify(r2));
  check(V.varResolve(def, f2, "de", "en").text === "within the hour, Anna", "2c a language the rule does not write falls back to the primary's words");
  check(V.varRuleAt({ rules: [{ when: [{ fact: "gender", op: "is", value: "m" }], write: {} }] }, facts) === -1,
    "2d a definition with no rule that holds writes nothing rather than guessing");

  /* ---- 3. the inline form ------------------------------------------------------------------ */
  const gdef = V.varBuiltin("GENDER");
  const pick = (g, parts) => V.varInlinePick("GENDER", gdef, parts, Object.assign({}, facts, { gender: g }));
  check(pick("m", ["otrzymał Pan", "otrzymała Pani", "otrzymali Państwo"]) === "otrzymał Pan"
    && pick("f", ["otrzymał Pan", "otrzymała Pani", "otrzymali Państwo"]) === "otrzymała Pani"
    && pick("n", ["otrzymał Pan", "otrzymała Pani", "otrzymali Państwo"]) === "otrzymali Państwo",
    "3a {GENDER:a|b|c} takes the male, female and nonbinary words in that order");
  check(pick("n", ["otrzymał Pan", "otrzymała Pani"]) === "" && pick("f", ["otrzymał Pan"]) === "otrzymał Pan",
    "3b a nonbinary customer given no words is left to the agent; any other missing rule takes the first");
  check(V.varInlinePick("REPLYBY", def, ["a", "b", "c"], facts) === "b", "3c a team's variable inline gives the card's own word to the rule that holds");

  /* ---- 4. the hours a catalog moves --------------------------------------------------------- */
  check(V.varDayPart(17 * 60 + 30) === 1 && V.varDayPart(18 * 60) === 2 && V.varDayPart(3 * 60 + 59) === 2 && V.varDayPart(4 * 60) === 0,
    "4a Etiuda's own hours: afternoon until 18:00, the evening runs on to 04:00");
  check(V.varDayPart(17 * 60 + 30, { hours: { morning: "05:00", afternoon: "12:00", evening: "17:00" } }) === 2
    && V.varDayPart(4 * 60 + 30, { hours: { morning: "05:00", afternoon: "12:00", evening: "17:00" } }) === 2,
    "4b a catalog's evening from 17:00 makes 17:30 evening, and a morning from 05:00 leaves 04:30 in the night");

  /* ---- 5. a gender read from a first name ---------------------------------------------------- */
  const want = { "Anna": "f", "Kuba": "m", "Kim": "n", "": "n", "Józef": "m", "Mary-Jane": "f", "Jerzy": "m",
    "Noemi": "f", "Nikola": "n", "Tomasz": "m", "Grzesiek": "m", "ola": "f", "Jean-Pierre": "m", "Zoe": "f" };
  const got = {}; Object.keys(want).forEach(n => { got[n] = V.nameGender(n); });
  check(JSON.stringify(got) === JSON.stringify(want), "5 the reading: -a female, a consonant male, the listed exceptions and nonbinary where the name leaves it open: " + JSON.stringify(got));

  /* ---- 6. the glyph: three states, read and by hand, and a new name read afresh ---------------- */
  const said = () => [drum.dataset.g, drum.attrs["aria-valuetext"], drum.title, drum.classList.contains("gd-hand")];
  world({ name: "" }); G.syncGenderGlyph();
  check(JSON.stringify(said()) === JSON.stringify(["n", "nonbinary, until a name is typed",
    "Gender, nonbinary while the name leaves it open. A click or the wheel changes it.", false]),
    "6a an empty box rests on nonbinary, read: " + JSON.stringify(said()));
  world({ name: "Anna Kowalska" }); G.syncGenderGlyph();
  check(said()[0] === "f" && said()[1] === "female, read from the name" && !said()[3], "6b Anna reads female, grey: " + JSON.stringify(said()));
  world({ name: "Kim Lee" }); G.syncGenderGlyph();
  check(said()[0] === "n" && said()[1] === "nonbinary, as the name leaves it open", "6c Kim reads nonbinary, the name leaving it open");
  world({ name: "Tomasz Nowak" }); G.syncGenderGlyph();
  check(said()[0] === "m" && said()[1] === "male, read from the name", "6d Tomasz reads male");
  const T = await import(MOD("gender-turn.js"));
  let renders = 0;
  HK.hooks.render = () => { renders++; };
  const turns = [];
  for (let i = 0; i < 3; i++) { T.stepGender(1); turns.push(said()[0] + ":" + said()[1]); }
  check(JSON.stringify(turns) === JSON.stringify(["f:female, set by hand", "n:nonbinary, set by hand", "m:male, set by hand"])
    && drum.classList.contains("gd-hand") && drum.title === "Gender, set by hand. A new name is read afresh." && renders === 3,
    "6e a click turns one notch, male to female to nonbinary and round, each set by hand: " + JSON.stringify(turns));
  T.stepGender(-1);
  check(said()[0] === "n", "6f the wheel the other way turns back a notch");
  D.pax.value = "Tomasz Kowalski"; G.syncGenderGlyph();
  check(said()[0] === "n" && said()[3], "6g the same first name with another surname keeps the hand's setting");
  D.pax.value = "Anna Nowak"; G.syncGenderGlyph();
  check(said()[0] === "f" && !said()[3], "6h another first name is read afresh, and the hand's setting is gone");
  G.setHandGender("m"); const snap = G.getHandGender(); G.putHandGender(null); const cleared = G.custGender().v;
  G.putHandGender(snap);
  check(snap && snap.v === "m" && snap.first === "anna" && cleared === "f" && G.custGender().hand,
    "6i a tab keeps its own setting: taken, cleared, and given back: " + JSON.stringify(snap));
  G.putHandGender(null);

  /* ---- 7. {NAME}, and {GENDER} in a card ----------------------------------------------------- */
  world({ name: "anna MARIA kowalska" });
  const card = t => ({ en: t, pl: t });
  check(I.fill("Note: {NAME} wrote.", card("x"), false, "en") === "Note: Anna Maria Kowalska wrote.", "7a {NAME} writes the full name, tidied");
  world({ name: "" });
  const missMark = I.fill("Note: {NAME} wrote.", card("x"), true, "en");
  check(I.fill("Note: {NAME} wrote.", card("x"), false, "en") === "Note:  wrote." && missMark.indexOf(I.FILL_M_A + "NAME" + I.FILL_M_B) > -1,
    "7b with no name it writes nothing to the clipboard and its marker on screen");
  world({ name: "Sasza Nowak" });
  const gt = "Czy {GENDER:otrzymał Pan|otrzymała Pani|otrzymali Państwo} wiadomość?";
  const kubaRead = I.fill(gt, card(gt), false, "pl");
  G.setHandGender("m");
  const kubaHand = I.fill(gt, card(gt), false, "pl");
  G.putHandGender(null);
  check(kubaRead === "Czy otrzymali Państwo wiadomość?" && kubaHand === "Czy otrzymał Pan wiadomość?",
    "7c Sasza is a name that leaves it open, and the glyph set to male puts the card right: " + JSON.stringify([kubaRead, kubaHand]));
  const keyRead = R.cardFillKey(card(gt)); G.setHandGender("m"); const keyHand = R.cardFillKey(card(gt)); G.putHandGender(null);
  check(keyRead !== keyHand && keyRead !== "", "7d the card's signature moves with the glyph, so the list redraws it");

  /* ---- 8. the team's address, and the manual override ---------------------------------------- */
  V.setCatalogVariables({ list: [{ name: "PAX", rules: V.varAddressRules("titleFirst", "titleSurname") }] });
  const both = Object.assign(card("Dzień dobry, {PAX}."), { firstOnly: 1 });
  world({ name: "Anna Kowalska" });
  const annaPl = I.fill("Dzień dobry, {PAX}.", both, false, "pl"), annaEn = I.fill("Hello, {PAX}.", both, false, "en");
  world({ name: "Kim Lee" });
  const kimPl = I.fill("Dzień dobry, {PAX}.", both, false, "pl"), kimEn = I.fill("Hello, {PAX}.", both, false, "en");
  world({ name: "Kuba" }); G.setHandGender("m");
  const kubaPl = I.fill("Dzień dobry, {PAX}.", both, false, "pl");
  G.putHandGender(null);
  check(annaPl === "Dzień dobry, Pani Anno." && annaEn === "Hello, Ms Kowalska." && kimPl === "Dzień dobry, Państwo."
    && kimEn === "Hello, Mx Lee." && kubaPl === "Dzień dobry, Panie Kubo.",
    "8a the team's address follows the gender: " + JSON.stringify([annaPl, annaEn, kimPl, kimEn, kubaPl]));
  world({ name: "Anna Kowalska" });
  const own = Object.assign({}, both, { paxOwn: 1 });
  check(I.fill("Dzień dobry, {PAX}.", own, false, "pl") === "Dzień dobry, Anno.", "8b the override on: the card's two boxes decide, not the team");
  const note = Object.assign(card("Pytanie od {PAX}."), { firstOnly: 1, paxVoc: 0 });
  check(F.paxOwnOn(note) && I.fill("Pytanie od {PAX}.", note, false, "pl") === "Pytanie od Anna.",
    "8c a card whose boxes say otherwise reads as overridden, so it keeps its sentence under the team's address");
  const off = Object.assign(card("Dzień dobry, {PAX}."), { paxOwn: 0 });
  check(I.fill("Dzień dobry, {PAX}.", off, false, "pl") === "Dzień dobry, Pani Anno.", "8d the override off with no boxes ticked: the team's address");
  V.setCatalogVariables({ list: [{ name: "PAX", rules: V.varAddressRules("none", "first") }] });
  check(I.fill("Dzień dobry, {PAX}.", both, false, "pl") === "Dzień dobry." && I.fill("Hello, {PAX}.", both, false, "en") === "Hello, Anna.",
    "8e a team writing no name takes the token and its comma away, as an empty box does");
  V.setCatalogVariables(null);
  check(I.fill("Dzień dobry, {PAX}.", off, false, "pl") === "Dzień dobry, Anno.", "8f the override off on a catalog with no address: Etiuda's own, the first name in the vocative");
  check(F.paxOwnShown(card("Hello.")) === false && F.paxOwnShown(card("Hi {PAX}")) === true && F.paxOwnShown(both) === false,
    "8g the editor's switch shows a derived override only on a card that uses {PAX}");

  /* ---- 10. a team's own variable in a card, nested, and one that names itself ------------------ */
  V.setCatalogVariables({ list: [def,
    { name: "SORRY", rules: [{ when: [{ fact: "gender", op: "is", value: "m" }], write: { pl: "Przepraszam, {GENDER:Panie|Pani} {@first-voc}." } },
      { when: [], write: { pl: "Przepraszamy za {REPLYBY}." } }] },
    { name: "LOOP", rules: [{ when: [], write: { en: "a {LOOP}" } }] }] });
  world({ name: "Anna Kowalska" });
  const sorry = I.fill("{SORRY}", card("{SORRY}"), false, "pl");
  world({ name: "Kuba Nowak" }); G.setHandGender("m");
  const sorryM = I.fill("{SORRY}", card("{SORRY}"), false, "pl"); G.putHandGender(null);
  check(sorry === "Przepraszamy za w ciągu godziny, Anno." && sorryM === "Przepraszam, Panie Kubo.",
    "10a a team's variable writes its rule's words with the other variables in them filled: " + JSON.stringify([sorry, sorryM]));
  check(I.fill("{LOOP}", card("{LOOP}"), false, "en") === "a a a a a ", "10b a variable naming itself stops at the depth, never loops");
  check(I.fill("{REPLYBY:soon|Monday|later}", card("x"), false, "en") === "later" && I.fill("{UNKNOWN}", card("x"), false, "en") === "{UNKNOWN}",
    "10c inline it takes the card's word for the rule that holds, and a name the catalog does not define is copied as written");
  V.setCatalogVariables(null);
  check(I.fill("{SORRY}", card("x"), false, "en") === "{SORRY}", "10d with the catalog's variables gone the token is copied as written");

  /* ---- 11. the format: written, read back, and refused where wrong ---------------------------- */
  const file = { format: 2, kind: "etiuda-catalog", id: "toy-shop", rev: 1, langs: [{ code: "en" }, { code: "pl" }],
    tags: [{ id: "t-open", kind: "shelf", label: { en: "Open" } }],
    cards: [{ id: "c-a", shelf: "t-open", bodyShape: "plain", title: { en: "A" }, body: { en: "Hi {PAX}" }, paxOwn: 1 }],
    variables: { hours: { morning: "05:00", afternoon: "12:00", evening: "17:00" }, list: [def] } };
  const back = C2.catalogToV2(C2.catalogFromV2(file));
  check(C2.v2Problems(file).length === 0 && back.cards[0].paxOwn === 1 && JSON.stringify(back.variables) === JSON.stringify(file.variables),
    "11a a catalog with variables and an overridden card passes the reader and comes back whole");
  const bad = v => C2.v2Problems(Object.assign({}, file, { variables: v }));
  const refusals = [
    bad({ list: [{ name: "lower", rules: [{ when: [], write: {} }] }] }),
    bad({ list: [{ name: "X", rules: [{ when: [{ fact: "gender", op: "is", value: "m" }], write: {} }] }] }),
    bad({ list: [{ name: "Z", rules: [{ when: [], write: {} }] }] }),
    bad({ list: [{ name: "X", rules: [{ when: [], write: { de: "x" } }] }] }),
    bad({ hours: { morning: "12:00", afternoon: "11:00", evening: "17:00" } }),
    bad({ list: [{ name: "X", rules: [{ when: [], write: {} }] }, { name: "X", rules: [{ when: [], write: {} }] }] }),
  ];
  check(refusals.every(r => r.length === 1), "11b refused, one problem each: a lower-case name, no Otherwise last, a fixed built-in, an undeclared language, hours out of order, a name twice: "
    + JSON.stringify(refusals.map(r => r[0])));
  check(C2.v2Problems(Object.assign({}, file, { cards: [Object.assign({}, file.cards[0], { paxOwn: true })] })).length === 1,
    "11c paxOwn is 0, 1 or absent");
  const vb = fs.readFileSync(path.join(ROOT, "src", "modules", "variables.js"), "utf8");
  const fixed = (fs.readFileSync(path.join(ROOT, "src", "modules", "catalog-v2.js"), "utf8").match(/V2_VAR_FIXED=\[([^\]]*)\]/) || [, ""])[1];
  const notEditable = V.VAR_BUILTIN_NAMES.filter(n => V.VAR_BUILTIN_EDITABLE.indexOf(n) < 0).concat(["Z"]).sort();
  check(JSON.stringify((fixed.match(/"[A-Z]+"/g) || []).map(x => x.slice(1, -1)).sort()) === JSON.stringify(notEditable) && vb.length > 0,
    "11d the reader's list of built-ins not set by rules is variables.js's: " + JSON.stringify(notEditable));

  /* ---- 12. the address choices are the rules they write, and read back ----------------------- */
  const choices = [];
  for (const pl of V.VAR_ADDRESS_PL) for (const en of V.VAR_ADDRESS_EN) {
    const back2 = V.varAddressOf({ rules: V.varAddressRules(pl, en) });
    choices.push(!!back2 && back2.pl === pl && back2.en === en);
  }
  const edited = V.varAddressRules("titleFirst", "first"); edited[0].write.pl = "Szanowny Panie {@surname}";
  check(choices.every(Boolean) && V.varAddressOf({ rules: edited }) === null, "12 every choice reads back as itself, and rules changed by hand as none");

  /* ---- 13. a card's own form of address under the override, and the glyph reaching it ---------- */
  const M = await import(MOD("macros-json.js"));
  const formed = (pl, en, more) => Object.assign(card("Dzień dobry, {PAX}."), { paxOwn: 1, firstOnly: 1 },
    pl ? { addressPl: pl } : {}, en ? { addressEn: en } : {}, more || {});
  const say = (m, L) => I.fill(L === "pl" ? "Dzień dobry, {PAX}." : "Hello, {PAX}.", m, false, L);
  const titled = formed("titleFirst", "titleSurname");
  world({ name: "Anna Kowalska" });
  const byGlyph = [say(titled, "pl"), say(titled, "en")];
  ["m", "n"].forEach(g => { G.setHandGender(g); byGlyph.push(say(titled, "pl"), say(titled, "en")); });
  G.putHandGender(null);
  check(JSON.stringify(byGlyph) === JSON.stringify(["Dzień dobry, Pani Anno.", "Hello, Ms Kowalska.",
    "Dzień dobry, Panie Anno.", "Hello, Mr Kowalska.", "Dzień dobry, Państwo.", "Hello, Mx Kowalska."]),
    "13a a card set to Pani or Pan with the first name, and to title and surname in English, follows the glyph: " + JSON.stringify(byGlyph));
  const boxed = formed("", "", { paxVoc: 0 });
  const boxF = say(boxed, "pl"); G.setHandGender("m"); const boxM = say(boxed, "pl"); G.putHandGender(null);
  check(boxF === boxM && boxF === "Dzień dobry, Anna.",
    "13b CONTROL: a card addressing by name has no word the glyph changes, so 13a sees the form and not the name");
  world({ name: "Tomasz Nowak" });
  check(say(formed("titleSurname", ""), "pl") === "Dzień dobry, Panie Nowak." && say(formed("titleSurname", ""), "en") === "Hello, Tomasz."
    && say(formed("none", ""), "pl") === "Dzień dobry." && say(formed("none", "", { paxVoc: 1 }), "en") === "Hello, Tomasz.",
    "13c Pani or Pan with the surname, and no name, in Polish; English addresses by the name the boxes shape");
  world({ name: "Anna Kowalska" });
  const derived = Object.assign(card("Dzień dobry, {PAX}."), { firstOnly: 1, addressPl: "titleSurname" });
  V.setCatalogVariables({ list: [{ name: "PAX", rules: V.varAddressRules("first", "first") }] });
  const underTeam = say(derived, "pl");
  const off2 = say(Object.assign({}, derived, { paxOwn: 0 }), "pl");
  V.setCatalogVariables(null);
  check(F.paxOwnOn(derived) && underTeam === "Dzień dobry, Pani Kowalska." && off2 === "Dzień dobry, Anno.",
    "13d a form with no paxOwn reads as overridden and beats the team's address; switched off, the team's: " + JSON.stringify([underTeam, off2]));
  check(say(formed("titleSecond", "first"), "pl") === "Dzień dobry, Anno." && F.paxAddressOf(formed("titleSecond", "first"), "en") === ""
    && F.paxAddressOf({ addressEn: "titleFirst" }, "en") === "",
    "13e a form this build does not know, or Studio's first, or a Polish form in English, addresses by name");
  const file2 = { format: 2, kind: "etiuda-catalog", id: "toy-shop", rev: 1, langs: [{ code: "en" }, { code: "pl" }],
    tags: [{ id: "t-open", kind: "shelf", label: { en: "Open" } }],
    cards: [{ id: "c-a", shelf: "t-open", bodyShape: "plain", title: { en: "A" }, body: { en: "Hi {PAX}" }, paxOwn: 1,
      address: { pl: "titleFirst", en: "titleSurname" } },
      { id: "c-b", shelf: "t-open", bodyShape: "plain", title: { en: "B" }, body: { en: "Hi {PAX}" }, address: { pl: "none" } }] };
  const rt = C2.catalogFromV2(file2), back3 = C2.catalogToV2(rt);
  check(C2.v2Problems(file2).length === 0 && rt.cards[0].addressPl === "titleFirst" && rt.cards[0].addressEn === "titleSurname"
    && !rt.cards[0].ext && JSON.stringify(back3.cards.map(c => c.address)) === JSON.stringify([{ en: "titleSurname", pl: "titleFirst" }, { pl: "none" }]),
    "13f the format carries a card's forms, read into the runtime and written back as they came: " + JSON.stringify(back3.cards.map(c => c.address)));
  const refused = [{ address: "titleFirst" }, { address: { de: "titleFirst" } }, { address: { pl: 1 } }]
    .map(x => C2.v2Problems(Object.assign({}, file2, { cards: [Object.assign({}, file2.cards[0], x)] })));
  check(refused.every(r => r.length === 1 && /address/.test(r[0])), "13g refused, one problem each: a form that is no object, a language with no forms, a form that is no word: "
    + JSON.stringify(refused.map(r => r[0])));
  const plain = M.cardToExportPlain(Object.assign({ id: "u:1", c: "open", t: "A" }, formed("titleSurname", "titleSurname")));
  const again = M.parseMacrosData({ format: 1, kind: "playbook-cards", cards: [plain] })[0];
  check(plain.addressPl === "titleSurname" && plain.addressEn === "titleSurname" && again.addressPl === "titleSurname" && again.addressEn === "titleSurname",
    "13h the cards file writes a card's forms and reads them back");
} catch (e) {
  failed++;
  console.log("  FAIL the run threw: " + String(e && e.stack || e).split("\n").slice(0, 4).join(" | "));
}

/* ---- 9. a catalog without variables copies exactly the text it copied before them -------------- */
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-vars-"));
  const git = (args, opts) => spawnSync("git", args, Object.assign({ cwd: ROOT, encoding: "buffer", maxBuffer: 1 << 26 }, opts || {}));
  const ls = git(["ls-tree", "-r", "--name-only", BASE, "src/modules"]);
  if (ls.status !== 0) {
    console.log("  NOT RUN 9: no git history here to read " + BASE + " from, so the old text was not compared");
  } else {
    for (const f of ls.stdout.toString("utf8").split("\n").filter(Boolean)) {
      const blob = git(["show", BASE + ":" + f]);
      fs.writeFileSync(path.join(tmp, path.basename(f)), blob.stdout);
    }
    const run = (dir, arg) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--grid", dir, arg || ""], { encoding: "utf8", maxBuffer: 1 << 28 });
    const was = run(tmp), now = run(path.join(ROOT, "src", "modules")), team = run(path.join(ROOT, "src", "modules"), "vars");
    let a = [], b = [], c = [];
    try { a = JSON.parse(was.stdout); b = JSON.parse(now.stdout); c = JSON.parse(team.stdout); } catch (e) { /* counted below */ }
    const diff = a.findIndex((x, i) => x !== b[i]);
    check(a.length > 1000 && a.length === b.length && diff < 0,
      "9a " + a.length + " fills of " + BASE + " and " + b.length + " of this tree, every one the same text"
      + (diff < 0 ? "" : ": the first to differ, " + JSON.stringify([a[diff], b[diff]])) + (was.stderr ? " " + was.stderr.slice(0, 200) : ""));
    const moved = a.filter((x, i) => x !== c[i]).length;
    check(moved > 0 && c.length === a.length, "9b CONTROL: the same grid under a team's address differs in " + moved + " fills, so 9a can see a change");
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

const complete = asserted >= EXPECTED;
console.log("\n#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
console.log(complete && !failed ? "RESULT: ok " + asserted + " check(s)"
  : "RESULT: FAIL " + failed + " failed" + (complete ? "" : ", and only " + asserted + " of " + EXPECTED + " ran"));
process.exit(Math.min(63, failed + (complete ? 0 : 1)));
