/* TOKEN_CANARY held to fill(), in both directions, over every name the engine could fill.
 *
 *   node tests/token-canary.mjs
 *
 * WHY THIS FILE EXISTS. TOKEN_CANARY in src/modules/rail-list.js is a hand-kept string naming
 * every token fill() fills. Three readers trust it: the card signature (cardFillKey fills it to
 * learn whether a card's text moved), the lint for unknown tokens (tests/test.js filledTokens(),
 * C1, 2026-09-24), and Studio's importer, which slices the same declaration. Nothing held it to
 * fill(). A token added to fill() and not to the canary makes the lint warn on a token the desk
 * fills and the signature miss a card whose text changed; a token in the canary that fill()
 * does not fill makes the lint pass a token that reaches the customer as written.
 *
 * THE CLASS, NOT THE INSTANCE. The check is not "these ten tokens": the canary is compared with
 * what fill() actually does, over a universe of candidate names nobody wrote down here:
 *   - every identifier-shaped word in the engine's source as the harness reads it
 *     (tests/engine.js sourceDoc: the template and every module), which is where any token a
 *     future fill() consumes must be spelled, whether in its own regex or in a lookup table;
 *   - every word in every pattern fill() hands to a String or RegExp method while it runs,
 *     captured by wrapping those methods for the length of each call, so a pattern built at
 *     run time from pieces is seen as well;
 *   - both cases of each captured word, and planted names that no fill() should ever take.
 * Each name is tried in two forms, bare `{N}` and with an argument `{N:a|b|c}`, because the
 * canary's form is part of what it says (a bare {DAYPART} is copied as written).
 *
 * WHAT "FILLS" MEANS, measured and never read from source: fill("x " + span + " y") no longer
 * contains the span. A form fill() takes in one state and leaves in another is a fault of its
 * own (the canary cannot express it and the lint would call it known), so every form the
 * canary names, every captured name and every plant is driven through EIGHT states: nothing
 * typed and everything typed, English and Polish, marked and plain. The source-word universe
 * is driven through two of them, the opposite corners, which keeps the run near a second.
 *
 * THE ORACLE IS fill() ITSELF, imported from src/ through node's loader and called, and the
 * canary as its readers read it: the lint's through tests/test.js filledTokens(), the
 * signature's through cardFillKey, whose output must equal fill() of the lint's copy. Nothing
 * here restates the canary.
 *
 * NO CONTENT. No catalog is read; every value typed below is invented here.
 *
 * Exit code is the number of failed checks, capped at 63; 78 where no verdict was reached.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const MODDIR = resolve(join(HERE, "..", "src", "modules"));
const MOD = n => pathToFileURL(join(MODDIR, n)).href;
const NO_VERDICT = 78;

let pass = 0, fail = 0;
const check = (id, name, ok, detail) => {
  (ok ? pass++ : fail++);
  console.log("  " + (ok ? "ok  " : "FAIL") + " " + id + " " + name + (ok ? "" : "  [" + detail + "]"));
};
const noVerdict = why => {
  console.log("  FAIL no verdict: " + why);
  console.log("#counts checks=" + (pass + fail) + " passed=" + pass + " failed=" + (fail + 1));
  process.exit(NO_VERDICT);
};

/* ---------------------------------------------------------------- the world fill() reads.
   The smallest document that lets grabDom() run: one object per selector, so the PAX box and
   the ROLE box are two boxes whose value this file sets. window for storage.js's probe. */
const boxes = new Map();
globalThis.window = globalThis.window || { innerWidth: 1280, innerHeight: 800 };
globalThis.document = {
  querySelector: sel => { if (!boxes.has(sel)) boxes.set(sel, { value: "" }); return boxes.get(sel); },
  createElement: () => ({ getContext: () => ({}) }),
  createRange: () => ({})
};

let D, S, A, I, R, CM, T, E;
try {
  D = await import(MOD("dom.js"));
  S = await import(MOD("storage.js"));
  A = await import(MOD("app-state.js"));
  CM = await import(MOD("content-model.js"));
  I = await import(MOD("intent-text.js"));
  R = await import(MOD("rail-list.js"));
  T = require("./test.js");
  E = require("./engine.js");
  D.grabDom();
} catch (e) {
  noVerdict("the engine's modules did not load in bare node: " + String(e && e.message).split("\n")[0]);
}
if (typeof I.fill !== "function" || typeof R.cardFillKey !== "function" || typeof T.filledTokens !== "function")
  noVerdict("fill, cardFillKey or filledTokens is not exported where this file looks for it");

/* Eight states: nothing typed or everything typed, the card in English or Polish, the screen's
   marked fill or the clipboard's plain one. The agent's name goes straight to storage because
   setAgentName schedules a redraw this file has no DOM for. */
const TYPED = { pax: "Anna Nowak", role: "Ops", agent: "Jan Kowalski", intent: "zmianą rezerwacji" };
function setWorld(full) {
  D.pax.value = full ? TYPED.pax : "";
  D.roleSel.value = full ? TYPED.role : "";
  S.lsSet("eAgent", full ? TYPED.agent : "");
  A.setIntentIdxs([]);
  A.setIntentText(full ? TYPED.intent : "");
}
const STATES = [];
for (const full of [false, true]) for (const lang of ["en", "pl"]) for (const mark of [false, true])
  STATES.push({ full, lang, mark, label: (full ? "typed" : "empty") + "/" + lang + "/" + (mark ? "marked" : "plain") });
const CORNERS = [STATES[0], STATES[STATES.length - 1]];

/* ---------------------------------------------------------------- the capture. Every pattern
   fill() hands to a String or RegExp method during one call is pushed, raw, onto a list; the
   words are taken out afterwards with the methods restored, so the recorder never records
   itself. */
const captured = [];
const WRAP = [
  [String.prototype, ["replace", "replaceAll", "split", "match", "matchAll", "search", "indexOf",
                      "lastIndexOf", "includes", "startsWith", "endsWith"], self => false],
  [RegExp.prototype, ["exec", "test"], self => true]
];
function withCapture(fn) {
  const saved = [];
  for (const [proto, names, isRe] of WRAP) for (const n of names) {
    const orig = proto[n];
    saved.push([proto, n, orig]);
    proto[n] = function (...args) {
      const a = isRe(this) ? this : args[0];
      if (a instanceof RegExp) captured.push(a.source);
      else if (typeof a === "string") captured.push(a);
      return orig.apply(this, args);
    };
  }
  try { return fn(); } finally { for (const [proto, n, orig] of saved) proto[n] = orig; }
}

const card = { en: "x", pl: "x" };
function fillIn(span, st, capture) {
  const body = "x " + span + " y";
  const run = () => I.fill(body, card, st.mark, st.lang);
  const out = capture ? withCapture(run) : run();
  return String(out).indexOf(span) < 0;
}

/* ---------------------------------------------------------------- the canary as its readers
   read it. The lint's copy through filledTokens(); the signature's through cardFillKey. */
let lint;
try { lint = T.filledTokens(); } catch (e) { noVerdict("filledTokens() threw: " + String(e && e.message).split("\n")[0]); }
const WORD = /[A-Za-z][A-Za-z0-9_]*/g;
const formsOf = t => [...t.bare].map(n => "{" + n + "}").concat([...t.arg].map(n => "{" + n + ":a|b|c}"));
const canaryForms = new Set(formsOf(lint));
const knows = (name, withArg) => (withArg ? lint.arg : lint.bare).has(name);

/* 0a: the preconditions of a verdict. */
check("0a", "the content languages carry en and pl, so the eight states are eight",
  CM.CONTENT_LANGS.indexOf("en") > -1 && CM.CONTENT_LANGS.indexOf("pl") > -1,
  "CONTENT_LANGS is " + JSON.stringify(CM.CONTENT_LANGS));

/* 0e: the typed world reaches fill(). Were it not to, "typed" would repeat "empty" and the eight
   states would be four, with every branch that needs a value untried. */
{
  const probe = "{PAX}|{ROLE}|{AGENT}|{INTENT}";
  setWorld(true); const typed = I.fill(probe, card, false, "en");
  setWorld(false); const empty = I.fill(probe, card, false, "en");
  const want = [TYPED.pax, TYPED.role, TYPED.agent, TYPED.intent];
  check("0e", "the typed world reaches fill() and the empty one does not",
    want.every(v => typed.indexOf(v) > -1) && want.every(v => empty.indexOf(v) < 0),
    "typed gave " + JSON.stringify(typed) + ", empty gave " + JSON.stringify(empty));
}

/* ---------------------------------------------------------------- the universe. */
const PLANTED = ["FOO", "DATE", "WHO", "pax", "greet", "Topic", "ZZ"];
const focus = new Set(PLANTED);
for (const n of lint.bare) focus.add(n);
for (const n of lint.arg) focus.add(n);
/* Seed the capture: one plain call per state over the canary itself. */
captured.length = 0;
for (const st of STATES) { setWorld(st.full); withCapture(() => I.fill(lint.raw, card, st.mark, st.lang)); }
const capturedCalls = captured.length;
const capturedWords = new Set();
for (const src of captured) for (const w of String(src).match(WORD) || []) capturedWords.add(w);
for (const w of capturedWords) { focus.add(w); focus.add(w.toUpperCase()); focus.add(w.toLowerCase()); }

const srcWords = new Set(String(E.sourceDoc().text).match(WORD) || []);
const wide = [...srcWords].filter(w => !focus.has(w));

/* 0b: the instrument saw fill() at work, and saw every name the canary spells. A name the canary
   spells that no captured pattern mentions is filled, if it is filled, by a path this capture
   cannot see, and then its silence about other names means nothing. */
check("0b", "the capture saw fill() hand patterns to the string methods (" + capturedCalls + " calls)",
  capturedCalls >= STATES.length, "only " + capturedCalls + " pattern(s) captured over " + STATES.length + " calls");
const unseen = [...lint.bare, ...lint.arg].filter(n => !capturedWords.has(n));
check("0c", "every name the canary spells appears in a pattern fill() used", unseen.length === 0,
  "not in any captured pattern: " + unseen.join(", "));
const WIDE_FLOOR = 2000;
check("0d", "the source universe is not empty (" + srcWords.size + " words, floor " + WIDE_FLOOR + ")",
  srcWords.size >= WIDE_FLOOR, "only " + srcWords.size + " identifier words read from the source");

/* ---------------------------------------------------------------- the measure. */
const filledIn = new Map();   // span -> array of state labels where fill() took it
function measure(span, states) {
  const where = [];
  for (const st of states) { setWorld(st.full); if (fillIn(span, st, false)) where.push(st.label); }
  filledIn.set(span, { where, of: states.length });
}
for (const n of focus) { measure("{" + n + "}", STATES); measure("{" + n + ":a|b|c}", STATES); }
for (const n of wide) { measure("{" + n + "}", CORNERS); measure("{" + n + ":a|b|c}", CORNERS); }
const nameOf = span => span.replace(/^\{/, "").replace(/(:a\|b\|c)?\}$/, "");
const hasArg = span => /:a\|b\|c\}$/.test(span);

/* 1a, direction one: every form the canary names is filled, in every state. */
for (const form of [...canaryForms].sort()) {
  const r = filledIn.get(form);
  check("1a", "fill() fills " + form + ", which the canary names, in all " + r.of + " states",
    r.where.length === r.of,
    r.where.length ? "left as written in " + STATES.filter(s => r.where.indexOf(s.label) < 0).map(s => s.label).join(", ")
                   : "left as written in every state");
}
/* 1b, direction two: no form the canary lacks is filled, in any state. */
const extra = [], partial = [];
for (const [span, r] of filledIn) {
  const inCanary = knows(nameOf(span), hasArg(span));
  if (!inCanary && r.where.length) extra.push(span + " (" + r.where.length + "/" + r.of + ")");
  if (inCanary) continue;
  if (r.where.length && r.where.length < r.of) partial.push(span);
}
check("1b", "fill() fills no form the canary lacks, over " + filledIn.size + " forms of "
  + (focus.size + wide.length) + " names", extra.length === 0,
  "filled but not in the canary: " + extra.slice(0, 12).join(", ") + (extra.length > 12 ? " and " + (extra.length - 12) + " more" : ""));
/* 1c: a form fill() takes in some states and leaves in others. Reported apart from 1b because it
   is a fault of fill() rather than of the list: no canary can say "sometimes". */
check("1c", "no form outside the canary is filled in some states and left in others", partial.length === 0,
  "partial: " + partial.slice(0, 12).join(", "));

/* ---------------------------------------------------------------- the signature's reader. */
setWorld(true);
const sig = { en: "{GREET}", pl: "{GREET}" };
const viaModule = R.cardFillKey(sig);
const viaLint = I.fill(lint.raw, sig);
check("2a", "cardFillKey fills the same canary the lint reads (equal output, everything typed)",
  viaModule === viaLint, "cardFillKey gave " + JSON.stringify(viaModule) + ", fill(lint's canary) gave " + JSON.stringify(viaLint));
/* 2b: every form fill() fills makes a card count as carrying a token. CARD_TOKEN_RE is a second
   hand-kept list, and a card whose only token it misses short-circuits to "" and is never
   redrawn when that token's value moves. */
const missed = [];
for (const [span, r] of filledIn) {
  if (!r.where.length) continue;
  const m = { en: "x " + span + " y", pl: "x " + span + " y" };
  if (R.cardFillKey(m) === "") missed.push(span);
}
check("2b", "cardFillKey sees a token in every card carrying a form fill() fills", missed.length === 0,
  "short-circuited to no token: " + missed.join(", "));

/* ---------------------------------------------------------------- counts and verdict. */
const filledForms = [...filledIn.values()].filter(r => r.where.length).length;
console.log("#counts checks=" + (pass + fail) + " passed=" + pass + " failed=" + fail
  + " canaryForms=" + canaryForms.size + " filledForms=" + filledForms + " focusNames=" + focus.size
  + " wideNames=" + wide.length + " captured=" + capturedCalls);
console.log(fail ? "  RESULT: FAIL " + fail + " of " + (pass + fail)
  : "  RESULT: ok " + pass + " check(s), " + canaryForms.size + " canary form(s) against " + filledIn.size + " measured");
process.exit(Math.min(fail, 63));
