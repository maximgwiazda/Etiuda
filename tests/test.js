/* Etiuda test harness + catalog linter. Zero dependencies beyond node.

     node tests/test.js                          sections 1 to 3, which need no content
     ETIUDA_FIXTURES=<folder> node tests/test.js  all five

   Also require()-able: lintCatalog() is called before a build is written, so a broken catalog
   aborts the build instead of shipping.

   Sections 4 and 5 read a real catalog and the queries meant to reach its cards. Neither may
   live in this repository, so both come from ETIUDA_FIXTURES and, where it is unset, the
   sections say NOT RUN and the RESULT line repeats it. A section that says nothing reads as a
   section that passed, and this file used to skip both in one quiet line each.

   The unit tests reach the engine's pure functions by slicing their source out and evaluating
   them in isolation. Extraction is a dumb bracket-depth scan - good enough for the well-behaved
   declarations it targets, and it fails LOUDLY (thrown error, non-zero exit) if a refactor
   moves, renames or reshapes one, which is exactly the reminder to update this file.

   WHAT IT SLICES FROM, AND WHY IT IS NOT THE ARTEFACT. engine/etiuda.html is built now, and
   esbuild reprints every module it bundles: a top-level `const` comes back as `var`, comments
   are gone, and no declaration's source spelling survives by contract. Slicing by exact source
   text out of generated code would stop matching the moment a region moved into src/modules/,
   and it would stop matching silently for the scans, which do not name what they expect.
   So everything here that reads the engine AS TEXT reads src/ through E.sourceDoc(); what is
   read as a DOCUMENT - does it parse, do the CSS rules agree - reads the artefact, because that
   is the file a browser opens. [2b/5] ties the two together by position so that neither claim
   is about a file the other has left behind. */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const E = require("./engine.js");
const ENGINE_PATH = E.ENGINE_PATH;
const HAVE_FIXTURES = !!E.fixturesDir();
/* Resolved lazily: asking for a fixture is what makes engine.js refuse, and sections 1 to 3
   must run without one. */
const CATALOG_PATH = () => E.fixtures("catalog").catalog;
const EVAL_PATH = () => E.fixtures("searchEval").searchEval;

function engineSource() { return E.engineSource(); }
/* The engine as written, and where an offset in it came from. sourceAt turns the index a scan
   stopped at into `src/<file>:<line>`, which is more than the artefact could ever say. */
function sourceText() { return E.sourceDoc().text; }
function sourceAt(i) { return E.sourceDoc().at(i); }
function sourceAtLine(n) { return E.sourceDoc().atLine(n); }

/* THE DARK PALETTE IS WRITTEN TWICE and CSS cannot join them: one copy answers
   prefers-color-scheme, the other an explicit choice, and a media query cannot share a
   selector list with a plain rule. A token edited in one and not the other silently breaks
   whichever dark path the reader is not on. This is the only thing that would notice. */
/* A REPEATED TRANSLATION KEY IS SILENT - an object literal keeps the last one, so a second
   entry with a different value simply wins and nothing reports it. Cheap to check, and the
   failure mode is a string that changes meaning for no visible reason. */
/* THE COMMENT CEILING, which was the last rule in this repo held up by memory alone - the
   name and quote scans became a hook only after a check that relied on remembering turned out
   not to have been remembered. This guards the one checkable half: no NEW block of seven lines
   or more. The rest of the rule is judgement and is left to people.
   A RATCHET, not a list. Sixty is what the file carried at v1.12.1; the count may fall and the
   number should be lowered when it does, but it may never rise without a deliberate edit here,
   which is the conversation the rule asks for. Naming sixty blocks individually would put a
   catalogue of the file's prose in the test and make every reflow a diff.
   IT SCANS BLOCKS, NOT LINE STARTS: this file writes continuations without a leading star, so
   matching on the first character counted a ten-line comment as one and waved essays through. */
const COMMENT_ESSAY_BUDGET = 56;
function checkCommentCeiling(src) {
  const lines = src.split(/\r?\n/), found = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith("/*")) {
      const at = i + 1;
      let n = 0;
      while (i < lines.length) { n++; if (lines[i].indexOf("*/") > -1) break; i++; }
      if (n >= 7) found.push({ line: at, n: n, head: t.slice(0, 62) });
    } else if (t.startsWith("//")) {
      const at = i + 1;
      let n = 0;
      while (i < lines.length && lines[i].trim().startsWith("//")) { n++; i++; }
      if (n >= 7) found.push({ line: at, n: n, head: t.slice(0, 62) });
      continue;
    }
    i++;
  }
  found.sort((a, b) => b.n - a.n);
  return { found: found, total: found.length, over: found.length - COMMENT_ESSAY_BUDGET };
}
/* THE GREETING VOCABULARY LIVES ONCE. Held in two places, a phrase could be changed for the
   composer and not for the search that has to find the card composing it, and {GREET} cards
   would quietly stop matching. Reads the table, then insists no reader repeats a phrase of it. */
function checkGreetingsOnce(src) {
  const table = extractDecl(src, "const GREETINGS=");
  const phrases = (table.match(/"[^"]+"/g) || []).map(w => w.slice(1, -1)).filter(w => w.indexOf(" ") > 0);
  const readers = ["function expandSearchPlaceholders(", "function greeting("];
  const problems = [];
  readers.forEach(m => {
    const body = extractDecl(src, m);
    /* The bare phrase, not the quoted one: a second copy is likely to be several phrases
       inside ONE string, which is exactly the shape that made this worth guarding. */
    phrases.forEach(w => {
      if (body.indexOf(w) > -1) problems.push(m.trim() + " repeats " + JSON.stringify(w));
    });
  });
  return { phrases: phrases.length, problems: problems };
}

function checkDuplicateStrings(src) {
  const seen = new Map(), problems = [];
  src.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t.startsWith('"') || !t.endsWith('",')) return;
    const body = t.slice(1, -2);
    const at = body.indexOf('":"');
    if (at < 1) return;
    const en = body.slice(0, at), pl = body.slice(at + 3);
    if (en.indexOf('"') >= 0) return;
    const prev = seen.get(en);
    if (prev) problems.push(en.slice(0, 46) + ' (' + sourceAtLine(prev.line) + ' and ' + sourceAtLine(i + 1) + ')'
      + (prev.pl === pl ? '' : ' - AND THE VALUES DIFFER'));
    else seen.set(en, { line: i + 1, pl: pl });
  });
  return { problems: problems, keys: seen.size };
}
function checkDarkPalettes(src) {
  const grab = sel => {
    const at = src.indexOf(sel);
    if (at < 0) throw new Error("palette selector not found: " + sel);
    const open = src.indexOf("{", at), close = src.indexOf("}", open);
    const out = {};
    (src.slice(open + 1, close).match(/--[A-Za-z0-9-]+\s*:[^;]+;/g) || []).forEach(d => {
      const i = d.indexOf(":");
      out[d.slice(0, i).trim()] = d.slice(i + 1).replace(/;+$/, "").trim();
    });
    return out;
  };
  const a = grab(":root:not([data-theme=light])"), b = grab(":root[data-theme=dark]");
  const ka = Object.keys(a), kb = Object.keys(b), problems = [];
  ka.filter(k => !(k in b)).forEach(k => problems.push(k + " is in the media copy only"));
  kb.filter(k => !(k in a)).forEach(k => problems.push(k + " is in the data-theme copy only"));
  ka.filter(k => k in b && a[k] !== b[k]).forEach(k => problems.push(k + ": " + a[k] + " vs " + b[k]));
  return { problems: problems, tokens: ka.length };
}

/* Slice one declaration out of the source, starting at `marker`. Tracks (), [], {} depth;
   a `function` declaration ends at the brace closing its body, anything else at the first
   `;` on zero depth. Deliberately no string/comment awareness: the targeted declarations
   are known to keep their brackets balanced inside strings and comments, and a violation
   surfaces as a syntax error in the very next step rather than passing silently. */
function extractDecl(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error("extractDecl: marker not found in engine: " + marker);
  const isFn = /^function\b/.test(marker);
  let par = 0, brk = 0, brc = 0, sawBrace = false;
  for (let i = at; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") par++; else if (ch === ")") par--;
    else if (ch === "[") brk++; else if (ch === "]") brk--;
    else if (ch === "{") { brc++; sawBrace = true; }
    else if (ch === "}") {
      brc--;
      if (isFn && sawBrace && !par && !brk && !brc) return src.slice(at, i + 1);
    } else if (ch === ";" && !par && !brk && !brc && !isFn) return src.slice(at, i + 1);
  }
  throw new Error("extractDecl: unterminated declaration: " + marker);
}

/** The engine's pure functions, extracted and evaluated in a private scope. */
function pureFns() {
  const src = sourceText();
  const decls = [
    "const FOLD=",
    "function foldDiacritics(",
    "const WORD_PREFIX_MIN=",
    "const WORD_STEM_MIN=",
    "function sharedPrefixLen(",
    "function wordMatchesTerm(",
    "function splitWords(",
    "const PL_VOWELS",
    "function isVowelPL(",
    "function zForm(",
    "const PL_VOC_PAIRS",
    "function plVocative(",
    "function agentParts(",
    "function formatPaxName(",
    "function catalogFileSlug(",
    "function catalogCardId(",
    "function normWhoList(",
    "function esc(",
    "function splitPartsRaw(",
    "function catalogMacroCount(",
    "function reverseBlockIndex(",
    "function colPlan(",
    "function joinTopics(",
    "function mtBrowser(",
  ].map(m => extractDecl(src, m)).join("\n");
  /* FOLD_RE and the PL_VOC table are rebuilt here with the same two lines the engine uses -
     their engine declarations are statements, not clean declarations, and duplicating two
     lines of glue beats teaching the extractor about statement forms. */
  const glue = `
    const FOLD_RE=new RegExp("["+Object.keys(FOLD).join("")+"]","g");
    const PL_VOC={};
    PL_VOC_PAIRS.split(/\\s+/).forEach(p=>{ const i=p.indexOf(":"); if(i>0) PL_VOC[p.slice(0,i).toLowerCase()]=p.slice(i+1); });
    let navigator={userAgent:""};
    const browserFrom=ua=>{ navigator={userAgent:ua}; return mtBrowser(); };
    return {browserFrom,
            foldDiacritics,wordMatchesTerm,splitWords,sharedPrefixLen,zForm,plVocative,
            agentParts,formatPaxName,catalogFileSlug,catalogCardId,normWhoList,esc,
            splitPartsRaw,catalogMacroCount,reverseBlockIndex,colPlan,joinTopics};
  `;
  return new Function(decls + "\n" + glue)();
}

/* ---- [3e/5] the shapes the card list can take ---------------------------------------------
   Every column bug so far has been the placement code meeting a list shape nobody enumerated:
   an intent selection emits NO separators, a search emits exactly one, a category emits one
   plus a trailing button. Each was invisible in the view being looked at when the code was
   written, and each is decidable from the shape alone - so they belong here rather than in a
   browser.

   A case is a list of child kinds, a column count, and what should happen to them. */
function checkColPlan() {
  const plan = pureFns().colPlan;
  const P = (kinds, n) => plan(kinds, n);
  const bad = [];
  const S = "sep", C = "card", O = "other";

  const cases = [
    { why: "ALL: many categories, dealt as whole groups",
      kinds: [S,C,C, S,C,C, S,C], n: 2,
      mode: "groups", runs: 3, seps: 3 },

    { why: "INTENT SELECTED: no separators at all, cards dealt individually",
      kinds: [C,C,C,C,C], n: 2,
      mode: "cards", cards: 5, lead: 0 },

    { why: "SEARCH: one tier separator, cards dealt, separator left spanning",
      kinds: [S,C,C,C], n: 2,
      mode: "cards", cards: 3, lead: 1 },

    { why: "ONE CATEGORY: separator above, add-card button trailing",
      kinds: [S,C,C,C,O], n: 3,
      mode: "cards", cards: 3, lead: 1, trail: 1 },

    { why: "SPELLING NOTE leads and does not become a group",
      kinds: [O,S,C,C, S,C,C], n: 2,
      mode: "groups", runs: 2, seps: 2, lead: 1 },

    { why: "A TRAILING BUTTON IS NOT A SEPARATOR - counting it as one split a single "
         + "category into two groups and defeated the one-group fallback",
      kinds: [S,C,C,O], n: 2,
      mode: "cards", seps: 1 },

    { why: "INTENT BAND spans the columns instead of joining the deal, and the categories "
         + "below still deal as groups",
      kinds: ["bandsep",C,C,C, S,C,C, S,C,C], n: 3,
      mode: "groups", runs: 2, seps: 2, band: 3 },

    { why: "A BAND ON ITS OWN, with no categories under it",
      kinds: ["bandsep",C,C,C,C], n: 2,
      mode: "none", band: 4 },   // everything is in the band, so there is nothing left to deal

    { why: "ONE CARD: nothing to deal, so no columns",
      kinds: [S,C], n: 2, mode: "none" },

    { why: "NO CARDS: an empty category places nothing",
      kinds: [S,O], n: 2, mode: "none" },

    { why: "EMPTY LIST", kinds: [], n: 2, mode: "none" },

    { why: "ONE COLUMN never restructures anything",
      kinds: [S,C,C, S,C,C], n: 1, mode: "none" },
  ];

  cases.forEach(c => {
    const r = P(c.kinds, c.n);
    const tag = c.why.slice(0, 58);
    if (r.mode !== c.mode) bad.push(tag + " -> mode " + r.mode + ", wanted " + c.mode);
    if (c.runs != null && r.runs.length !== c.runs)
      bad.push(tag + " -> " + r.runs.length + " runs, wanted " + c.runs);
    if (c.seps != null && r.seps !== c.seps)
      bad.push(tag + " -> " + r.seps + " separators, wanted " + c.seps);
    if (c.cards != null && (r.cards || []).length !== c.cards)
      bad.push(tag + " -> " + (r.cards || []).length + " cards dealt, wanted " + c.cards);
    if (c.lead != null && r.lead.length !== c.lead)
      bad.push(tag + " -> " + r.lead.length + " leading, wanted " + c.lead);
    if (c.band != null) {
      const got = r.band ? r.band.items.filter(i => c.kinds[i] === "card").length : 0;
      if (got !== c.band) bad.push(tag + " -> band holds " + got + " cards, wanted " + c.band);
    }
    if (c.trail != null && r.trail.length !== c.trail)
      bad.push(tag + " -> " + r.trail.length + " trailing, wanted " + c.trail);
  });

  /* EVERY CARD MUST BE PLACED EXACTLY ONCE. The counting above would pass a plan that quietly
     dropped a card or dealt it twice, which is the failure that would be hardest to notice on
     screen: a list that looks right until the card you wanted is the one missing. */
  [[S,C,C,S,C,C,C,S,C], [C,C,C,C], [S,C,C,O], [O,S,C,S,C,C]].forEach(kinds => {
    [2,3,4].forEach(n => {
      const r = P(kinds, n);
      if (r.mode === "none") return;
      const seen = [];
      if (r.mode === "groups") r.runs.forEach(run => run.items.forEach(i => seen.push(i)));
      else { r.cards.forEach(i => seen.push(i)); r.lead.forEach(i => seen.push(i)); }
      r.trail.forEach(i => seen.push(i));
      if (r.mode === "groups") r.lead.forEach(i => seen.push(i));
      const want = kinds.map((_, i) => i);
      const sorted = seen.slice().sort((a, b) => a - b);
      if (sorted.length !== want.length || sorted.some((v, i) => v !== want[i]))
        bad.push("shape [" + kinds.join(",") + "] at n=" + n +
                 " placed indices " + sorted.join(",") + ", wanted " + want.join(","));
    });
  });

  /* THE DEAL IS ROUND ROBIN: group 1 left, group 2 right, group 3 left. Asserted rather than
     assumed, because the whole scheme rests on a category keeping the same column. */

  /* THE CLASSIFICATION ITSELF, which colPlan never sees - it is handed kinds already decided.
     That is exactly where the phantom-group bug lived while this was still a preview: "anything
     that is not a card" counted the "+ Add a card" button as a separator, which split a single
     category into two groups and defeated the one-group fallback. So assert the engine names
     its separators explicitly and classifies by that name rather than by negation. */
  const src = sourceText();
  const sepDecl = /const COL_SEP\s*=\s*"([^"]+)"/.exec(src);
  if (!sepDecl) bad.push("COL_SEP is not a plain string constant any more");
  else {
    ["list-sep", "e-catsep", "e-favsep"].forEach(cls => {
      if (sepDecl[1].indexOf(cls) < 0) bad.push("COL_SEP no longer names ." + cls);
    });
  }
  if (!/matches\(COL_SEP\)\s*\?\s*"sep"/.test(src))
    bad.push("the list is no longer classified by matches(COL_SEP) - check it did not revert "
           + "to treating every non-card as a separator");
  const rr = P([S,C, S,C, S,C, S,C, S,C], 2);
  const cols = rr.runs.map((_, i) => i % 2).join("");
  if (cols !== "01010") bad.push("round robin gave " + cols + ", wanted 01010");

  return bad;
}

/* ---- unit tests --------------------------------------------------------------------------- */
let PASS = 0, FAIL = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { PASS++; return; }
  FAIL++;
  console.error("  FAIL " + label + "\n       got  " + g + "\n       want " + w);
}

function runUnitTests() {
  const F = pureFns();

  // z / ze - Polish preposition euphony
  [["zmianą rezerwacji", "ze"], ["sprawą", "ze"], ["szkołą", "ze"], ["mną", "ze"],
   ["wszystkim", "ze"], ["zwrotem", "ze"],
   ["połączeniem", "z"], ["dodaniem", "z"], ["sytuacją", "z"], ["bagażem", "z"],
   ["rzeczą", "z"], ["", "z"],
   /* cz and rz are NOT ze-takers, though the sibilant rule reads as if they were. Caught when
      a Polish intent clause starting "członkostwem" produced "ze członkostwem" in an opener. */
   ["członkostwem w klubie", "z"], ["człowiekiem", "z"], ["czwartkiem", "z"],
   ["czasem", "z"], ["rznieciem", "z"],
   /* the sz branch must survive that fix */
   ["szkoleniem", "ze"], ["szacunkiem", "z"]
  ].forEach(([w, want]) => eq("zForm(" + w + ")", F.zForm(w), want));

  /* joinTopics - the conjunction {TOPIC} uses. It went in reading as a log ("A, B") because the
     token only ever fed internal comments; the moment it reached a customer-facing card, two
     selected intents produced an unfinished sentence. It was then English-only for as long as
     the topics were, and put "and" into a Polish sentence once topicPl existed. The card's
     language decides it now, so the fallback case is the one to keep: English topic strings in
     a Polish body still take "oraz", because the sentence around them is Polish. */
  eq("joinTopics none",     F.joinTopics([], "en"), "");
  eq("joinTopics one",      F.joinTopics(["the tax refund"], "en"), "the tax refund");
  eq("joinTopics two",      F.joinTopics(["the tax refund","the double charge"], "en"),
     "the tax refund and the double charge");
  eq("joinTopics three",    F.joinTopics(["a","b","c"], "en"), "a, b and c");
  eq("joinTopics pl one",   F.joinTopics(["zwrot"], "pl"), "zwrot");
  eq("joinTopics pl two",   F.joinTopics(["zwrot","zmiana lotu"], "pl"), "zwrot oraz zmiana lotu");
  eq("joinTopics pl three", F.joinTopics(["a","b","c"], "pl"), "a, b oraz c");
  /* No z/ze on the tail, which is where joinIntents differs: a preposition in front of a topic
     list belongs to the card body and governs the whole list. */
  eq("joinTopics pl no zForm", F.joinTopics(["zwrot","zmiana lotu"], "pl").indexOf(" z ") < 0, true);
  /* An unknown language reads as the default rather than losing the conjunction. */
  eq("joinTopics other lang", F.joinTopics(["a","b"], "de"), "a and b");

  /* THE ORDER IS THE WHOLE TABLE: Edge, Opera and Samsung all put Chrome in their string,
     and iPhone puts Mac OS X in it. A reading that names the wrong browser is worse than no
     reading, and no browser on this machine can prove the ones it is not. */
  [
   ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "Chrome 141 (Windows)"],
   ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.2623.63",
    "Edge 141 (Windows)"],
   ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/119.0.0.0",
    "Opera 119 (Windows)"],
   ["Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
    "Samsung Internet 23 (Android)"],
   ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
    "Firefox 143 (Windows)"],
   ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
    "Safari 18 (macOS)"],
   ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1",
    "Chrome 141 (iOS)"],
   ["",
    "unknown"]
  ].forEach(([ua, want]) => eq("mtBrowser " + (want || "empty"), F.browserFrom(ua), want));

  // Vocative - table hits, diminutives, the -a default, and leave-alone cases
  eq("plVocative Anna", F.plVocative("Anna"), "Anno");
  eq("plVocative Kasia", F.plVocative("Kasia"), "Kasiu");
  eq("plVocative Piotr", F.plVocative("Piotr"), "Piotrze");
  eq("plVocative Marek", F.plVocative("Marek"), "Marku");
  eq("plVocative John (unknown male)", F.plVocative("John"), "John");
  eq("plVocative Marzena", F.plVocative("Marzena"), "Marzeno");
  // Documents current behaviour: the -a default also declines foreign names ("Emmo").
  // A deliberate trade-off - see the evaluation doc - so a change here should be a decision.
  eq("plVocative Emma (foreign, -a default)", F.plVocative("Emma"), "Emmo");

  // Diacritic folding
  eq("fold bagaż", F.foldDiacritics("bagaż"), "bagaz");
  eq("fold Zażółć gęślą jaźń", F.foldDiacritics("Zażółć gęślą jaźń"), "Zazolc gesla jazn");
  eq("fold ascii passthrough", F.foldDiacritics("plain text"), "plain text");

  // Loose word matching (search)
  eq("match booking/book", F.wordMatchesTerm("booking", "book"), true);
  eq("match book/booking", F.wordMatchesTerm("book", "booking"), true);
  eq("match category/cat", F.wordMatchesTerm("category", "cat"), true);
  eq("match changing/change", F.wordMatchesTerm("changing", "change"), true);
  eq("no match refund/refuse", F.wordMatchesTerm("refund", "refuse"), false);
  eq("no match s/split", F.wordMatchesTerm("s", "split"), false);

  eq("splitWords PL", F.splitWords("Zmiana lotu, bagaż!"), ["zmiana", "lotu", "bagaz"]);

  // Agent identity
  eq("agentParts full name", F.agentParts("Max Gwiazda"), { display: "Max Gwiazda", init: "mg" });
  eq("agentParts short form", F.agentParts("  Max   G. "), { display: "Max G.", init: "mg" });
  eq("agentParts single word", F.agentParts("Max"), { display: "Max", init: "m" });
  eq("agentParts empty", F.agentParts(""), { display: "", init: "" });

  // PAX name casing
  eq("formatPaxName caps+hyphen", F.formatPaxName("MARY-JANE   doe"), "Mary-Jane Doe");
  eq("formatPaxName lower", F.formatPaxName("anna"), "Anna");

  // Filename slugs
  eq("slug plain", F.catalogFileSlug("Sample Chat"), "sample-chat");

  /* A CARD ID IS AUTHORITATIVE WHEN IT EXISTS. The importer suffixes the second of two cards
     sharing a category and title; re-deriving hands both the first one's id, and activateCatalog
     then drops the second card's star, hide and position on every catalog load. */
  eq("cardId derives when absent", F.catalogCardId({c:"open",t:"Cold open"}), "b:open:Cold open");
  eq("cardId KEEPS an assigned id", F.catalogCardId({id:"b:open:Cold open~2",c:"open",t:"Cold open"}),
     "b:open:Cold open~2");
  eq("cardId falls back safely", F.catalogCardId({}), "b:open:Untitled");
  eq("slug Polish", F.catalogFileSlug("Zażółć"), "zazolc");
  eq("slug empty-ish", F.catalogFileSlug("!!!"), "etiuda-catalog");
  // Apostrophes elide rather than separate, or "Max's" becomes "max-s"
  eq("slug possessive", F.catalogFileSlug("Max's Playbook Build 3.08.2026"),
     "maxs-playbook-build-3-08-2026");
  eq("slug curly apostrophe", F.catalogFileSlug("Max’s"), "maxs");
  // The default export name must slug to the one filename that auto-loads
  eq("slug default catalog name", F.catalogFileSlug("Etiuda catalog"), "etiuda-catalog");

  // No "-s-" anywhere: the possessive must not leave a stray separated letter
  eq("slug has no stray -s-",
     /-s-/.test(F.catalogFileSlug("Max's Playbook Build 3.08.2026")), false);
  eq("slug possessive ending in s", F.catalogFileSlug("Lukas's Build"), "lukass-build");

  // WHO list normalisation
  eq("normWhoList dedupe", F.normWhoList("booker, Booker , ,pax1"), ["booker", "pax1"]);
  eq("normWhoList array", F.normWhoList(["a", "A", "b"]), ["a", "b"]);

  // HTML escaping
  eq("esc", F.esc('<a "b" & \'c\'>'), "&lt;a &quot;b&quot; &amp; &#39;c&#39;&gt;");

  // Block splitting / counting
  eq("splitPartsRaw", F.splitPartsRaw("a\n\nb\n   \nc"), ["a", "b", "c"]);
  eq("catalogMacroCount", F.catalogMacroCount({ cards: [{ en: "x" }, { en: "a\n\nb", alt: 1 }, { pl: "only" }] }), 3);

  // Reorder index reversal
  eq("reverseBlockIndex to-slot", F.reverseBlockIndex(2, 0, 2), 0);
  eq("reverseBlockIndex shifted", F.reverseBlockIndex(0, 0, 2), 1);
  eq("reverseBlockIndex shifted2", F.reverseBlockIndex(1, 0, 2), 2);
  eq("reverseBlockIndex untouched", F.reverseBlockIndex(3, 0, 2), 3);
}

/* ---- engine syntax check ------------------------------------------------------------------ */
/* Compile (never run) every inline script in the file. For a no-build project this is the
   whole "does it even parse" gate - a stray brace or an unterminated comment in an 8000-line
   inline script otherwise only surfaces when somebody opens the page. */
function checkEngineSyntax() {
  const src = engineSource();
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = re.exec(src))) {
    if (/\bsrc\s*=/.test(m[1])) continue;                 // external - nothing inline to parse
    if (/application\/json/.test(m[1])) continue;         // the embedded-catalog slot is data
    new Function(m[2]);                                   // throws on a syntax error
    n++;
  }
  if (n < 2) throw new Error("expected at least 2 inline scripts (boot guard + app), found " + n);
  return n;
}

/* ---- stacking invariants -------------------------------------------------------------------
   One CSS relationship, checked here because breaking it is INVISIBLE and it has broken twice.
   #railHit is the transparent strip that summons the intent panel, and it widens to 300px the
   moment the panel peeks open. While it carried a z-index above the panel's, it covered the
   panel end to end: the panel rendered perfectly and could not be clicked, hovered or touched,
   because every pointer event landed on the strip. It was reported first as an iOS problem and
   then, months later, on a narrow desktop window - the same defect both times.
   Nothing else in the harness can see this. The syntax check parses the scripts and the unit
   tests call pure functions; this is a relationship between two numbers in two CSS rules, and
   it only shows up as behaviour in a browser at a window narrow enough to auto-hide. */
/* THE t-SHADOW GUARD (2026-08-20). `t()` is the translation function and is called from about
   four hundred places, so a local named `t` is not a style question: it breaks every translated
   string in its scope, and a `const t` breaks the ones ABOVE it too, through the temporal dead
   zone. Both shapes shipped once - a tab-strip tooltip that ran at boot, and an intent-chip
   toast - and neither could be caught by syntax checking or by the i18n scanner.
   Heuristic by necessity: strings and comments are masked, then each binding of `t` is matched
   to its innermost enclosing block. False positives are possible and cheap - rename the local. */
function checkTShadow() {
  const src = sourceText();
  const masked = maskLiterals(src);
  const BIND = /(?:^|[^\w.$])(?:const|let|var)\s+t\s*=|\(\s*t\s*(?:,|\)\s*=>)|(?:^|[^\w.$])t\s*=>/g;
  const CALL = /(?:^|[^\w.$])t\(/;
  const problems = [];
  let m;
  while ((m = BIND.exec(masked))) {
    const span = enclosingBlock(masked, m.index);
    if (!span) continue;
    const body = masked.slice(span[0], span[1]);
    if (!CALL.test(body)) continue;
    problems.push(sourceAt(m.index) + ": a local `t` shares the scope of a t() call - rename it");
  }
  return problems;
}
/* Blanks out comments and string literals, keeping newlines, so brace counting is not thrown
   by a { inside a tooltip or a regex-looking comment. */
/* Blank everything that is not executable script code: HTML outside <script>, and inside
   scripts every comment, string/template literal and regex literal. A real lexer rather than
   a character scan - an apostrophe in prose or a slash in a regex must not desync it (the old
   scan lexed the whole HTML as JS and drifted in and out of phantom strings, hiding whole
   stretches of code from the guards that read the mask). */
/* keepStrings leaves string literals in place and blanks only comments, which is what a
   check ABOUT a string literal needs. Everything else here is unchanged, so the regex and
   division heuristic below is one implementation serving both readings. */
function maskLiterals(src, keepStrings) {
  const out = src.split("").map(c => (c === "\n" ? "\n" : " "));
  const tag = /<script\b[^>]*>/gi;
  let m;
  while ((m = tag.exec(src))) {
    if (/type\s*=\s*"application\/json"/i.test(m[0])) continue;
    const start = m.index + m[0].length;
    const close = src.indexOf("</script>", start);
    maskJsInto(src, start, close < 0 ? src.length : close, out, keepStrings);
  }
  return out.join("");
}
function maskJsInto(src, start, end, out, keepStrings) {
  const keep = (a, b) => { if (keepStrings) for (let k = a; k < b && k < end; k++) out[k] = src[k]; };
  let i = start, prev = "";
  const word = /[A-Za-z0-9_$]/;
  const KW = new Set(["return","typeof","case","instanceof","in","of","new","delete","void","do","else"]);
  while (i < end) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { let j = src.indexOf("\n", i); if (j < 0 || j > end) j = end; i = j; continue; }
    if (c === "/" && d === "*") { let j = src.indexOf("*/", i + 2); i = (j < 0 || j + 2 > end) ? end : j + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < end && src[j] !== c) { if (src[j] === "\\") j++; j++; }
      keep(i, j + 1);
      i = j + 1; prev = "str"; continue;
    }
    if (c === "`") {
      let j = i + 1, depth = 0;
      while (j < end) {
        if (src[j] === "\\") { j += 2; continue; }
        if (depth === 0 && src[j] === "`") break;
        if (src[j] === "$" && src[j + 1] === "{") { depth++; j += 2; continue; }
        if (depth > 0 && src[j] === "{") depth++;
        else if (depth > 0 && src[j] === "}") depth--;
        j++;
      }
      keep(i, j + 1);
      i = j + 1; prev = "str"; continue;
    }
    if (c === "/") {
      // regex or division - decided by the last significant token, as a parser would
      let ok = !(prev === "str" || prev === "re" || prev === ")" || prev === "]" ||
                 (word.test(prev[0] || " ") && !KW.has(prev)));
      if (ok) {
        let j = i + 1, cls = false, valid = j < end && src[j] !== "*" && src[j] !== "/";
        while (valid && j < end) {
          const ch = src[j];
          if (ch === "\\") { j += 2; continue; }
          if (ch === "[") cls = true;
          else if (ch === "]") cls = false;
          else if (ch === "/" && !cls) break;
          else if (ch === "\n") { valid = false; break; }
          j++;
        }
        if (valid && j < end) {
          i = j + 1;
          while (i < end && /[gimsuyd]/.test(src[i])) i++;
          prev = "re"; continue;
        }
      }
      out[i] = "/"; prev = "/"; i++; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (word.test(c)) {
      let j = i;
      while (j < end && word.test(src[j])) j++;
      for (let k = i; k < j; k++) out[k] = src[k];
      prev = src.slice(i, j); i = j; continue;
    }
    out[i] = c; prev = c; i++;
  }
}
function enclosingBlock(masked, pos) {
  let depth = 0, i = pos;
  while (i > 0) {
    i--;
    if (masked[i] === "}") depth++;
    else if (masked[i] === "{") { if (!depth) break; depth--; }
  }
  if (masked[i] !== "{") return null;
  const start = i;
  depth = 0;
  for (let j = start; j < masked.length; j++) {
    if (masked[j] === "{") depth++;
    else if (masked[j] === "}") { depth--; if (!depth) return [start, j]; }
  }
  return null;
}
/* THE RAW-ATTRIBUTE GUARD (2026-08-20). A tooltip or placeholder ASSIGNED at runtime beats the
   translation sweep: the sweep translates what is in the document, and the next assignment puts
   English back. It cost the AGENT and PAX placeholders, and five tooltips that only appear in a
   state - locked panel, hidden categories - where a ternary had one translated arm and two
   without. Both are invisible to the i18n scanner, which reads keys rather than assignments.
   Heuristic: string literals inside t(...) or tc(...) are fine; a bare literal of two or more
   words is not. Single words (a chord, a class name, "px") are ignored - too many false hits. */
function checkRawAttrs() {
  const src = sourceText();
  const masked = maskLiterals(src);          // paren matching must ignore parens inside strings
  const problems = [];
  const ASSIGN = /\.(title|placeholder)\s*=/g;
  let m;
  while ((m = ASSIGN.exec(masked))) {
    const start = m.index + m[0].length;
    let end = masked.indexOf(";", start);
    if (end < 0) end = Math.min(start + 500, src.length);
    // Blank out every t(...) / tc(...) call in the statement, parens matched exactly. What is
    // left is the part of the expression that never went through the table.
    const chars = src.slice(start, end).split("");
    const CALL = /(?:^|[^\w.$])(t|tc)\(/g;
    const window_ = masked.slice(start, end);
    let c;
    while ((c = CALL.exec(window_))) {
      let i = c.index + c[0].length, depth = 1;
      while (i < window_.length && depth > 0) {
        if (window_[i] === "(") depth++;
        else if (window_[i] === ")") depth--;
        i++;
      }
      for (let k = c.index; k < i && k < chars.length; k++) chars[k] = " ";
    }
    const bare = chars.join("");
    /* A PLACEHOLDER is always words a user reads, so any literal counts - "name" and
       "class" are exactly the cases, and they are why this guard exists. A TITLE is often
       assembled from chords and class names, so there it takes two words to be worth it. */
    const isPh = m[1] === "placeholder";
    const lit = isPh
      ? bare.match(/"([^"\\]{2,}?)"|'([^'\\]{2,}?)'/)
      : bare.match(/"([^"\\]{8,}?\s[^"\\]*?)"|'([^'\\]{8,}?\s[^'\\]*?)'/);
    if (!lit) continue;
    const text = (lit[1] || lit[2]).trim();
    if (!isPh && !/[a-z]{2}\s+[a-z]/i.test(text)) continue;   // a title needs prose
    if (isPh && !/[a-z]{2}/i.test(text)) continue;             // a placeholder needs letters
    problems.push(sourceAt(m.index) + ": ." + m[1] + " assigned untranslated text - "
      + JSON.stringify(text.slice(0, 46)));
  }
  return problems;
}
/* WHAT A KEYBOARD CANNOT TYPE (2026-08-21, Maxim's reasoning). The em-dash ban is not a style
   preference: macro text is pasted into a live chat and has to read as though the agent typed it
   on the spot. There is no key for an em dash, so a passenger who sees one reads "this came out
   of a machine" - it is a well-known tell by now. The same argument covers every character you
   cannot reach from a keyboard: the ellipsis glyph, curly quotes, a no-break space.
   Scope is deliberately the text a PASSENGER receives - card bodies, the intent clauses that
   fill {INTENT}, the comment tokens, the ROLE list, quick facts. Engine comments are exempt:
   nobody outside this repository ever reads one. */
/* TWO HALVES, AND THE SECOND USED TO DEPEND ON THE FIRST. The catalog half needs content this
   repository does not hold; the engine half never did. A single early return above meant that
   with no catalog on disk the interface's own dash guard did not run either, and 3d reported
   clean. The caller is told which halves ran. */
function checkTypeableChars() {
  const NL = String.fromCharCode(10);
  const out = [];
  const ran = { catalog: false, engine: true };
  if (HAVE_FIXTURES) catalogHalf();
  function catalogHalf() {
  const w = {};
  new Function("window", fs.readFileSync(CATALOG_PATH(), "utf8"))(w);
  const c = w.PB_CATALOG;
  if (!c) return;
  ran.catalog = true;
  const SUS = {};
  SUS[String.fromCharCode(0x2014)] = "em dash";
  SUS[String.fromCharCode(0x2013)] = "en dash";
  SUS[String.fromCharCode(0x2026)] = "ellipsis glyph";
  SUS[String.fromCharCode(0x00a0)] = "no-break space";
  SUS[String.fromCharCode(0x201c)] = "curly quote";
  SUS[String.fromCharCode(0x201d)] = "curly quote";
  SUS[String.fromCharCode(0x2018)] = "curly quote";
  SUS[String.fromCharCode(0x2019)] = "curly apostrophe";
  const look = (label, s) => {
    for (const ch of String(s || "")) {
      if (SUS[ch]) { out.push(label + " contains a " + SUS[ch]); return; }
    }
  };
  (c.cards || []).forEach(m => {
    look('card "' + m.t + '" (EN)', m.en);
    look('card "' + m.t + '" (PL)', m.pl);
  });
  const it = c.intents || {};
  ["en", "pl", "cmt", "topic"].forEach(k =>
    (it[k] || []).forEach((s, i) => look("intent[" + i + "]." + k, s)));
  (c.who || []).forEach((s, i) => look("ROLE option " + i, s));
  look("quick facts", c.facts);
  }

  /* THE INTERFACE TOO, for the same reason one step removed: an agent who sees an em dash in
     their own tool reads the tool as machine-written, and the joke about which machine writes
     them is current. Narrower set than above - only the two dashes - because Polish UI copy
     legitimately uses typographic quotation marks that a passenger never receives.
     Comments are exempt: nobody outside this repository reads one. */
  const engine = sourceText();
  let code = "", i = 0;
  while (i < engine.length) {          // strip comments AND regex literals, keep the rest
    const a = engine[i], b = engine[i + 1];
    if (a === "/" && b === "/") { const j = engine.indexOf(NL, i); i = j < 0 ? engine.length : j; continue; }
    if (a === "/" && b === "*") { const j = engine.indexOf("*/", i + 2); i = j < 0 ? engine.length : j + 2; continue; }
    if (a === "/") {
      let k = code.length - 1;
      while (k >= 0 && /\s/.test(code[k])) k--;
      const prev = k >= 0 ? code[k] : "";
      if (prev === "" || "(,=:[!&|?{};".indexOf(prev) > -1) {
        let j = i + 1, cls = false;
        while (j < engine.length) {
          if (engine[j] === "\\") { j += 2; continue; }
          if (engine[j] === "[") cls = true;
          else if (engine[j] === "]") cls = false;
          else if (engine[j] === "/" && !cls) { j++; break; }
          else if (engine[j] === NL) break;
          j++;
        }
        i = j; continue;
      }
    }
    code += a; i++;
  }
  const UI_BAD = [[0x2014, "em dash"], [0x2013, "en dash"],
                  [0x201e, "curly quote"], [0x201c, "curly quote"], [0x201d, "curly quote"],
                  [0x2018, "curly apostrophe"], [0x2019, "curly apostrophe"]];
  UI_BAD.forEach(pair => {
    const ch = String.fromCharCode(pair[0]);
    let at = code.indexOf(ch), n = 0;
    while (at > -1 && n < 5) {
      out.push("engine UI has a " + pair[1] + ": ..."
        + code.slice(Math.max(0, at - 44), at + 22).replace(/\s+/g, " ") + "...");
      at = code.indexOf(ch, at + 1); n++;
    }
  });
  out.ran = ran;
  return out;
}
/* Export writes an object literal; import copies a WHITELIST. A field added to one and not
   the other is lost in silence, and the file says so in a comment that has now failed twice
   - the Polish intent topics, then the Polish category names. Comparing the two lists beats
   trusting the note that says to. */
const ROUNDTRIP_ALLOW = new Set([
  "exported"      // a stamp of when the file was written - the importer has no use for it
]);
function checkCatalogRoundTrip() {
  const src = sourceText();
  const exp = extractDecl(src, "function currentCatalog(");
  const imp = extractDecl(src, "function parseCatalogFile(");
  const written = new Set();
  // keys of the `out` object literal, which are indented exactly four spaces
  const litAt = exp.indexOf("const out={");
  if (litAt < 0) throw new Error("currentCatalog no longer builds `const out={`");
  let depth = 0, end = litAt;
  for (let i = exp.indexOf("{", litAt); i < exp.length; i++) {
    if (exp[i] === "{") depth++;
    else if (exp[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  const lit = exp.slice(litAt, end);
  let m;
  const keyRe = /\n {4}([A-Za-z_][\w]*)\s*:/g;
  while ((m = keyRe.exec(lit))) written.add(m[1]);
  const assignRe = /\bout\.([A-Za-z_][\w]*)\s*=/g;
  while ((m = assignRe.exec(exp))) written.add(m[1]);
  const missing = [];
  written.forEach(f => {
    if (ROUNDTRIP_ALLOW.has(f)) return;
    const carried = imp.indexOf("cat." + f) > -1
      // a key of the `cat` literal can share its line, so allow a brace or comma before it
      || new RegExp("[{,\\n]\\s*" + f + "\\s*:").test(imp);
    if (!carried) missing.push(f);
  });
  // Card fields travel through a SECOND pair of functions, and the top-level check cannot see
  // them: the language pin was exported and dropped on import for exactly that reason.
  const exp2 = extractDecl(src, "function cardToExportPlain(");
  const imp2 = extractDecl(src, "function parseMacrosData(");
  const plainList = (src.match(/const CARD_PLAIN_FIELDS=\[([^\]]*)\]/) || [, ""])[1];
  const plain = (plainList.match(/"([^"]+)"/g) || []).map(x => x.replace(/"/g, ""));
  // it must be ASSIGNED, not merely mentioned: reading rawM.lockLang and discarding it still
  // contains the name, which is exactly how a dropped field hides from a substring check
  const cardMissing = plain.filter(f => imp2.indexOf("entry." + f) < 0);
  // both sides must walk the same translation table, or a language is exported and lost
  const bothLoop = /cardStorageKeys\(\)/.test(exp2) && /cardStorageKeys\(\)/.test(imp2);
  return { fields: written.size, missing: missing.sort(),
           cardFields: plain, cardMissing: cardMissing, bothLoop: bothLoop };
}
/* ---- [3g/5] the three things the rename left standing -------------------------------------
   The PB_ to E_ pass of 2026-09-13 moved 158 names and deliberately did not move three, each
   for a different reason and each invisible to every other instrument here:

   THE TWO GLOBALS THAT ARRIVE FROM OUTSIDE. A catalog file on disk declares
   window.PB_CATALOG and the sample declares window.PB_SAMPLE. Both are written by files this
   engine does not own - one of them by a release already on people's machines - so renaming
   either end silently stops a catalog loading. The export wrapper and the importer's search
   for it are the same contract read the other way.

   THE STORAGE PREFIX. E_NS answers "pb", and the boot script's Reset filter looks for keys
   beginning "pb". Changing one and not the other loses either everything already saved or the
   ability to clear it, and neither shows as a failure: the app comes up empty and correct.

   EVERY USER-VISIBLE STRING. A mechanical pass over identifiers has no business changing a
   sentence, and a whole-file census is the only thing that can say it did not. The digest is a
   RATCHET, like the comment budget above: it is expected to move when the interface's words
   move, and it is expected to move in a commit that says so.

   What this section is not: a claim that "pb" is right. It is a claim that all four places
   still agree, so that the storage step of section 8 moves them together or fails here. */
const UI_STRINGS_COUNT = 746;
const UI_STRINGS_SHA256 = "67e5aa976fd36e01279df5daffdfd3c24c039a9dec40b76dffd1ac7ab2cca8f4";

/* The same line rule as checkDuplicateStrings: the translation table is one quoted pair to a
   line. Sorted, so reordering the table is not a change to what anybody reads; both halves,
   so a Polish value cannot move unremarked either. */
function uiStrings(src) {
  const out = [];
  src.split(/\r?\n/).forEach(line => {
    const t = line.trim();
    if (!t.startsWith('"') || !t.endsWith('",')) return;
    const body = t.slice(1, -2), at = body.indexOf('":"');
    if (at < 1) return;
    const en = body.slice(0, at);
    if (en.indexOf('"') >= 0) return;
    out.push(en + "\u0000" + body.slice(at + 3));
  });
  out.sort();
  return { count: out.length, sha256: crypto.createHash("sha256").update(out.join("\n"), "utf8").digest("hex") };
}

let CODE_DOC = null;
function codeDoc() { if (!CODE_DOC) CODE_DOC = maskLiterals(sourceText(), true); return CODE_DOC; }

function checkFrozenContracts() {
  /* Comments blanked, strings kept, offsets preserved. A rename that leaves the old name
     in a comment beside the new one is the shape this exists for, and the first control
     run against this section found it passing on exactly that. */
  const src = codeDoc();
  const problems = [];

  /* Each contract is asserted INSIDE the declaration that carries it, not anywhere in the
     file: a renamed site that left the old name in a comment would satisfy a whole-file
     search and satisfy nothing else. */
  const holds = (marker, needle, why) => {
    let body;
    try { body = extractDecl(src, marker); }
    catch (e) { problems.push(marker + " is gone from the engine, and it carried: " + why); return; }
    if (body.indexOf(needle) < 0)
      problems.push(marker + " no longer holds " + JSON.stringify(needle) + " - " + why);
  };
  holds("function eCatalog(", "window.PB_CATALOG",
        "a catalog file declares window.PB_CATALOG and this is where the engine reads it");
  holds("function exportCatalog(", '"window.PB_CATALOG = "',
        "the wrapper this writes is what every reader of a catalog file, including 1.x, parses");
  holds("function parseCatalogFile(", '"PB_CATALOG"',
        "the importer finds the payload by that wrapper");
  holds("function sampleReady(", "typeof PB_SAMPLE",
        "sample-catalog.js is published beside the engine and declares window.PB_SAMPLE");
  holds("function loadSampleCatalog(", "PB_SAMPLE",
        "the sample is read through the name its own file declares");

  /* The prefix is evaluated rather than matched, because what must agree is what the two
     sides COMPUTE: nsKey carries an identity ternary that a text search reads straight past. */
  let ns = null;
  try {
    ns = new Function("eEmbeddedCatalog",
      extractDecl(src, "const E_NS=") + "\n"
      + extractDecl(src, "function nsKey(") + "\n"
      + "return { E_NS: E_NS, nsKey: nsKey };");
  } catch (e) { problems.push("the storage namespace no longer extracts: " + e.message); }
  let bare = null;
  if (ns) {
    bare = ns(() => null);
    const named = ns(() => ({ name: "a catalog with a name" }));
    if (bare.E_NS !== "pb")
      problems.push("E_NS answers " + JSON.stringify(bare.E_NS) + " with no catalog, wanted \"pb\" - "
        + "every key already on disk starts with it, and re-keying storage is step 6 of section 8");
    if (bare.nsKey("Cards") !== "pb" + "Cards")
      problems.push("nsKey gives " + JSON.stringify(bare.nsKey("Cards")) + " with no catalog, wanted \"pbCards\"");
    if (named.E_NS.indexOf("pb") !== 0)
      problems.push("E_NS answers " + JSON.stringify(named.E_NS) + " for a named catalog, which no longer "
        + "starts with \"pb\", so the boot script's Reset would not find its keys");
  }
  /* The other half of the same fact, and the half that fails silently: the boot script is a
     separate <script> in the template and shares nothing with the app but this literal. */
  const boot = codeDoc().slice(0, E.templateParts().head.length);
  const filter = /localStorage\.key\(i\)[\s\S]{0,80}?indexOf\("([^"]+)"\)\s*===\s*0/.exec(boot);
  if (!filter) problems.push("the boot script's Reset no longer filters localStorage by a literal prefix");
  else if (bare && filter[1] !== bare.E_NS)
    problems.push("Reset clears keys beginning " + JSON.stringify(filter[1]) + " and E_NS writes "
      + JSON.stringify(bare.E_NS) + " - one of the two has moved without the other");

  const ui = uiStrings(src);
  if (ui.count !== UI_STRINGS_COUNT || ui.sha256 !== UI_STRINGS_SHA256)
    problems.push("the interface strings have moved: " + ui.count + " pairs, sha256 "
      + ui.sha256.slice(0, 16) + ", against " + UI_STRINGS_COUNT + " and " + UI_STRINGS_SHA256.slice(0, 16)
      + " - if the words changed on purpose, update UI_STRINGS_COUNT and UI_STRINGS_SHA256 in this "
      + "file in that commit; if they did not, something mechanical has rewritten what people read");
  return { problems: problems, ui: ui, prefix: bare ? bare.E_NS : "?" };
}
function checkStacking() {
  const src = engineSource();
  const zOf = sel => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // ^ anchored: `body.rail-peek…` must not match inside `body.rail-over-pills.rail-peek…`
    const m = src.match(new RegExp("^" + esc + "\\s*\\{([^}]*)\\}", "m"));
    if (!m) throw new Error("rule not found: " + sel);
    const z = m[1].match(/z-index\s*:\s*(-?\d+)/);
    if (!z) throw new Error("no z-index in rule: " + sel);
    return +z[1];
  };
  const strip  = zOf("#railHit");
  const peek   = zOf("body.rail-peek:not(.rail-on) #intentRail");
  const docked = zOf("body.rail-on #intentRail");
  const problems = [];
  if (!(strip < peek))
    problems.push("#railHit (z " + strip + ") must sit BELOW the peeked panel (z " + peek
      + ") - a hit strip above the panel swallows every click on it");
  if (!(strip < docked))
    problems.push("#railHit (z " + strip + ") must sit BELOW the docked panel (z " + docked + ")");
  return { strip, peek, docked, problems };
}

/* ---- search evaluation ---------------------------------------------------------------------
   Measures whether macro search puts the RIGHT card first, against queries written from real
   shifts. Without this, every change to a field weight or a bonus is unfalsifiable: it is easy
   to fix the query in front of you and quietly break four others, and nobody would know.

   It runs the ENGINE'S OWN scoring, sliced out of Etiuda.html exactly as the unit tests do -
   not a reimplementation, which would drift and start passing while the app failed.

   Cases live in `search-eval.js` beside this file (gitignored, like the catalog it names). It
   is measurement, not a gate: a fresh case set is expected to fail, and that failure is the
   data. Mark a case `guard:true` once it passes and should never regress, and only those fail
   the run. */
function searchFns() {
  const src = sourceText();
  const decls = [
    "const FOLD=",
    "function foldDiacritics(",
    "const WORD_PREFIX_MIN=",
    "const WORD_STEM_MIN=",
    "function sharedPrefixLen(",
    "function wordMatchesTerm(",
    "function splitWords(",
    "const SEARCH_FIELDS=",
    "function normHay(",
    /* The expander flattens the greeting table rather than repeating it, so the sandbox needs
       the table and its flattening - in that order, they are consts. */
    "const GREETINGS=",
    "const GREET_WORDS=",
    "function expandSearchPlaceholders(",
    /* The static-haystack cache must come with cardSearchFields, which now assembles its body
       from it. Keyed on card identity, so the harness gets the caching for free and correctly:
       it hands out the same card objects for the whole run. */
    /* The haystack indexes every language, so the sandbox needs the table that says where
       each one is stored. */
    "const CONTENT_LANGS=",
    /* The affinity weights read the intent labels through the field table now, so the sandbox
       needs the table and the store it addresses. */
    "const INTENT_TEXT_FIELDS=",
    "const INTENT_FIELD_KEY=",
    "const SW_STORE=",
    "function intentArr(",
    "const CARD_FIELD_KEY=",
    "const CARD_TEXT_FIELDS=",
    "const CARD_SHARED_FIELDS=",
    "function cardFieldKey(",
    "function cardFieldKeys(",
    "const cardStaticHayCache=",
    "function cardStaticHay(",
    "function cardSearchFields(",
    "const cardWordCache=",
    "function cardSearchIndex(",
    "function cardMatchesSearch(",
    "const FIELD_WEIGHT=",
    "const Q_EXACT=",
    "const SAME_FIELD_BONUS=",
    "const ADJACENT_BONUS=",
    "const TITLE_START_BONUS=",
    "function termWordQuality(",
    "function termFieldQuality(",
    "const AFFINITY_W=",
    "const AFFINITY_MIN_LEN=",
    "const AFFINITY_STOP=",
    "const AFFINITY_FIELDS=",
    "const AFFINITY_FULL_SHARE=",
    "const AFFINITY_MAX_SHARE=",
    "let eLabelStats=",
    "function affinityLabelStats(",
    "function affinityWordWeight(",
    "function intentAffinityGroups(",
    "function cardIntentAffinity(",
    "const PROX_BONUS=",
    "const PROX_FIELD=",
    "function termPositions(",
    "function minWindowSpan(",
    "function proximityBonus(",
    "const FAV_BONUS=",
    "const TYPO_MIN_LEN=",
    "let eVocab=",
    "let eTypoFix=",
    "function catalogVocab(",
    "function editDistance1(",
    "function termReachesSomething(",
    "function correctTerm(",
    "function cardSearchScore(",
  ].map(m => extractDecl(src, m)).join("\n");
  /* CATS first: cardSearchFields reads it for the meta field (the category NAME is searchable,
     which is deliberate - it is what makes a query naming a category surface that category).
     `fill` is intentionally left undefined: the engine guards it with typeof, so headless scoring
     sees the card as AUTHORED rather than as filled with a live PAX/AGENT. {GREET} is unaffected -
     expandSearchPlaceholders injects every greeting variant itself. */
  /* isFavourite is the app's, reading personal state this harness has none of - so it supplies
     its own, and a case can declare which cards are starred. Without this the FAV_BONUS would
     be unmeasurable here, which would leave its value a matter of taste again. */
  /* `cards` is the engine's live catalog array - catalogVocab() walks it to build the spelling
     vocabulary, so the harness owns one and hands it the same list it ranks. */
  /* SW_EN / SW_PL / intentIdxs are the app's intent state, which the affinity functions read
     directly. The harness owns its own so a case can select an intent - until now every case ran
     intent-free, which left the whole affinity path untested. */
  /* The six label arrays are CONST in the engine and mutated in place - SW_STORE holds
     references to them, so a harness that REPLACED one would leave the store pointing at
     the array it replaced. setIntents empties and refills, as the engine does. */
  const head = "let CATS={}, FAVS=new Set(), cards=[], intentIdxs=[];\n"
             + "const SW_EN=[], SW_PL=[], SW_CMT=[], SW_CMT_PL=[], SW_TOPIC=[], SW_TOPIC_PL=[];\n"
             + "function isFavourite(id){ return FAVS.has(id); }\n";
  const glue = `
    const FOLD_RE=new RegExp("["+Object.keys(FOLD).join("")+"]","g");
    return { setCats(c){ CATS=c||{}; }, setFavs(ids){ FAVS=new Set(ids||[]); },
             setCards(list){ cards=list||[]; eVocab=null; eTypoFix.clear(); },
             setIntents(en,pl){
               SW_EN.length=0; (en||[]).forEach(v=>SW_EN.push(v));
               SW_PL.length=0; (pl||[]).forEach(v=>SW_PL.push(v));
               eLabelStats=null; },
             setPicked(idxs){ intentIdxs=idxs||[]; },
             cardMatchesSearch, cardSearchScore, foldDiacritics, FAV_BONUS,
             cardSearchIndex, termFieldQuality, correctTerm, editDistance1, proximityBonus,
             intentAffinityGroups, cardIntentAffinity, affinityWordWeight };
  `;
  return new Function(head + decls + "\n" + glue)();
}

/** The card list's own order for a query, with no intent selected: tier, then score, then the
 *  catalog's order standing in for the user's drag order (which is personal state, not content). */
/* The engine derives a built-in card's id from category + title (snapshotStockBaseMacros), so
   the same derivation here lets isFavourite() and the case files speak about catalog cards. */
function cardEvalId(m) { return "b:" + (m && m.c) + ":" + (m && m.t); }

/** `intentIdx` selects an intent, exactly as clicking one in the panel does. The band that puts
 *  intent-LINKED cards first is reproduced from the catalog's own positional links, which is what
 *  cardHitsSelectedIntent resolves to at runtime; it is an approximation only for custom intents,
 *  which a case cannot select anyway. */
function rankForQuery(F, cards, query, intentIdx) {
  cards.forEach(m => { if (m && !m.id) m.id = cardEvalId(m); });
  F.setCards(cards);
  F.setPicked(intentIdx == null ? [] : [intentIdx]);
  const aterms = F.intentAffinityGroups();
  const linked = m => intentIdx == null ? false
    : !!(m && (m.allIntents || (Array.isArray(m.intents) && m.intents.indexOf(intentIdx) > -1)));
  /* Spell correction happens in cardSearchTerms() in the app, which needs the DOM. Applying the
     same per-term correction here keeps the eval ranking the query the app would actually run. */
  const terms = F.foldDiacritics(String(query || "").trim().toLowerCase()).split(/\s+/).filter(Boolean)
                 .map(t => F.correctTerm(t) || t);
  if (!terms.length) return [];
  const hits = [];
  cards.forEach((m, i) => { if (m && F.cardMatchesSearch(m, terms)) hits.push({ m, i }); });
  const sc = new Map();
  hits.forEach(h => sc.set(h.m, F.cardSearchScore(h.m, terms, aterms)));
  /* render()'s own key order: the intent band outranks everything, then tier, then score. */
  hits.sort((a, b) => {
    const ba = linked(a.m) ? 0 : 1, bb = linked(b.m) ? 0 : 1;
    if (ba !== bb) return ba - bb;
    const A = sc.get(a.m), B = sc.get(b.m);
    if (A.tier !== B.tier) return A.tier - B.tier;
    if (A.score !== B.score) return B.score - A.score;
    return a.i - b.i;
  });
  return hits.map(h => ({ t: h.m.t, c: h.m.c, tier: sc.get(h.m).tier, score: sc.get(h.m).score,
                          linked: linked(h.m) }));
}

/* A case names its expected card by TITLE, because that is what a human writing cases knows.
   "Category/Title" disambiguates when a title repeats across categories. An unknown or
   ambiguous name is an ERROR, never a silent miss - a typo'd expectation that quietly counts
   as a failure would poison the measurement it exists to provide. */
function resolveWant(cards, cats, spec) {
  const raw = String(spec || "").trim();
  const slash = raw.lastIndexOf("/");
  const wantCat = slash > 0 ? raw.slice(0, slash).trim().toLowerCase() : null;
  const wantTitle = (slash > 0 ? raw.slice(slash + 1) : raw).trim().toLowerCase();
  const hits = cards.filter(m => {
    if (String(m.t || "").trim().toLowerCase() !== wantTitle) return false;
    if (!wantCat) return true;
    const name = String(cats[m.c] || m.c || "").trim().toLowerCase();
    return name === wantCat || String(m.c || "").toLowerCase() === wantCat;
  });
  if (!hits.length) throw new Error('no card titled "' + raw + '"');
  if (hits.length > 1)
    throw new Error('"' + raw + '" matches ' + hits.length + ' cards - qualify it as "Category/Title"');
  return hits[0];
}

function runSearchEval(cards, cats, cases, intents) {
  intents = intents || { en: [], pl: [] };
  const F = searchFns();
  F.setCats(cats);
  cards.forEach(m => { if (m && !m.id) m.id = cardEvalId(m); });
  F.setCards(cards);
  F.setIntents(intents.en, intents.pl);
  const rows = [];
  let top1 = 0, top3 = 0, scored = 0, guardFails = 0, broken = 0;
  cases.forEach(cs => {
    /* A spelling case asserts the correction itself, not a ranking - it is the sturdier test of
       the feature, and `corrects: null` is how you freeze a word that must NEVER be corrected. */
    if ("corrects" in cs) {
      const term = F.foldDiacritics(String(cs.q).trim().toLowerCase()).split(/\s+/)[0];
      const got = F.correctTerm(term) || null;
      const wantFix = cs.corrects === null ? null : F.foldDiacritics(String(cs.corrects).toLowerCase());
      const ok = got === wantFix;
      if (!ok && cs.guard) guardFails++;
      rows.push({ q: cs.q, want: cs.corrects === null ? "(no correction)" : cs.corrects,
                  at: ok ? 0 : -1, ok: ok, guard: !!cs.guard, note: cs.note,
                  kind: "spelling, got " + (got || "(none)"), got: [], total: 0 });
      return;
    }
    const want = cs.top || cs.top3 || cs.absent || cs.minRank && cs.card;
    let card, favIds = [];
    try {
      card = resolveWant(cards, cats, want);
      favIds = (cs.favs || []).map(t => cardEvalId(resolveWant(cards, cats, t)));
    }
    catch (e) { rows.push({ q: cs.q, bad: e.message }); broken++; return; }
    F.setFavs(favIds);
    /* `intent` names one by its English label, the way the panel shows it. Unknown is an error,
       like an unknown card - a case that silently tested no intent would be worse than useless. */
    let intentIdx=null;
    if(cs.intent!=null){
      const want=String(cs.intent).trim().toLowerCase();
      intentIdx=(intents.en||[]).findIndex(s=>String(s||"").trim().toLowerCase()===want);
      if(intentIdx<0){
        const near=(intents.en||[]).findIndex(s=>String(s||"").toLowerCase().indexOf(want)>-1);
        if(near<0){ rows.push({q:cs.q, bad:'no intent labelled "'+cs.intent+'"'}); broken++; return; }
        intentIdx=near;
      }
    }
    const ranked = rankForQuery(F, cards, cs.q, intentIdx);
    const at = ranked.findIndex(r => r.t === card.t && r.c === card.c);
    let ok;
    if (cs.absent) ok = at < 0;
    /* "must be found, but no HIGHER than #N" - the shape a ceiling needs. A bonus that lifts
       near-ties is only correct if it also fails to lift a genuine mismatch, and that second
       half cannot be stated as a rank target. */
    else if (cs.minRank) ok = at >= (cs.minRank - 1);
    else if (cs.top3) ok = at >= 0 && at < 3;
    else ok = at === 0;
    /* An optional tier expectation. Rank alone cannot express "findable, but NOT claimed to be
       about my query" - the distinction the note demotion turns on - and that is exactly the
       kind of decision worth freezing in a guard. */
    const gotTier = at >= 0 ? ranked[at].tier : null;
    if (ok && cs.tier != null && gotTier !== cs.tier) ok = false;
    if (!cs.absent) { scored++; if (at === 0) top1++; if (at >= 0 && at < 3) top3++; }
    if (!ok && cs.guard) guardFails++;
    rows.push({ q: cs.q, want: want, at: at, ok: ok, guard: !!cs.guard, note: cs.note,
                kind: (cs.absent ? "absent" : (cs.top3 ? "top3" : "top1"))
                      + (cs.tier != null ? " tier" + cs.tier + (gotTier !== cs.tier ? " (got tier" + gotTier + ")" : "") : ""),
                got: ranked.slice(0, 3), total: ranked.length });
  });
  return { rows, top1, top3, scored, guardFails, broken };
}

/* ---- catalog linter ----------------------------------------------------------------------- */
function loadCatalog(file) {
  const w = {};
  new Function("window", fs.readFileSync(file, "utf8"))(w);
  if (!w.PB_CATALOG) throw new Error("no PB_CATALOG assigned by " + file);
  return w.PB_CATALOG;
}

/* THE VERDICT LINE FOR SECTION 4, AND WHY IT CARRIES NO NAME.
 *
 * Board item 286. Until 2026-09-14 this line was `(c.name || "unnamed") + " [" + c.version + "]"`
 * followed by the counts, and c.name is a customer's: the catalog is somebody's content, its
 * name says whose, and section 4 runs on every `npm test` that has a fixtures folder. So every
 * suite log on this machine carried that name and the organisation inside it, and a log is the
 * most-pasted artefact this harness produces. Nothing else in the suite's clean output does
 * this; measured over the 658 lines of a full run at c21c55f, that was the only line.
 *
 * A digest keeps everything the line was for. It still says whether the catalog under the
 * linter is the one you think it is, and it still changes when the catalog or its version
 * changes, which is all the old text ever proved. What it stops saying is whose it is.
 *
 * WHAT THIS DOES NOT COVER, stated so nobody reads the case in tests/log-hygiene-selftest.js as
 * a promise it is not making: a lint ERROR or WARNING still quotes card titles, category keys
 * and intent text, because that is how a person finds the row. Those print only when a catalog
 * is defective, never on a clean one; the case below records the behaviour rather than allowing
 * it, so a decision to change it starts from a measurement. Changing them is not this seat's:
 * a diagnostic that no longer names the row it failed on is a weakened check. */
function catalogLintLine(c, r) {
  const cards = (c && Array.isArray(c.cards)) ? c.cards.length : 0;
  const cats = (c && c.categories && typeof c.categories === "object") ? Object.keys(c.categories).length : 0;
  const intents = (c && c.intents && Array.isArray(c.intents.en)) ? c.intents.en.length : 0;
  /* The pair JSON-encoded, which is how this file already separates a category from a title
     twelve hundred lines below: no separator occurring inside either half can spoof a match,
     and unlike the raw NUL that lived there once it does not make git call the file binary. */
  const id = crypto.createHash("sha256")
    .update(JSON.stringify([String((c && c.name) == null ? "" : c.name), String((c && c.version) == null ? "" : c.version)]))
    .digest("hex").slice(0, 16);
  return "catalog " + id + " (sha256 of name+version, first 16 hex; the name itself is a"
    + " customer's and does not go in a log): " + cards + " cards, " + cats + " categories, "
    + intents + " intent(s) - " + r.errors.length + " error(s), " + r.warnings.length + " warning(s)";
}

/** Returns {errors, warnings}. Errors are things the engine mishandles or that corrupt
 *  personal state (id collisions); warnings are things an author probably wants to know. */
function lintCatalog(c) {
  const errors = [], warnings = [];
  const err = s => errors.push(s), warn = s => warnings.push(s);
  if (!c || typeof c !== "object") { err("catalog is not an object"); return { errors, warnings }; }
  if (c.format != null && +c.format !== 1) err("unsupported format version " + c.format);
  if (c.kind != null && c.kind !== "playbook-catalog" && c.kind !== "playbook-cards"
      && c.kind !== "playbook-quality-cards") warn("unexpected kind: " + c.kind);

  const cats = (c.categories && typeof c.categories === "object") ? c.categories : {};
  const catKeys = Object.keys(cats);
  if (!catKeys.length) warn("no categories declared");
  if (cats.fav != null) err('"fav" is a reserved category key (virtual Favourites)');

  /* categoriesPl is OPTIONAL and PARTIAL - a catalog may translate some categories and not
     others, and an absent entry falls back to the English label. What is not allowed is naming
     a category that does not exist: that is a typo whose only symptom is a label silently not
     appearing, which nobody notices until a Polish desk asks why one pill is still English. */
  if (c.categoriesPl != null) {
    if (typeof c.categoriesPl !== "object" || Array.isArray(c.categoriesPl)) {
      err("categoriesPl must be an object keyed by category id");
    } else {
      Object.keys(c.categoriesPl).forEach(k => {
        if (!cats[k]) err('categoriesPl names a category that does not exist: "' + k + '"');
        else if (typeof c.categoriesPl[k] !== "string" || !c.categoriesPl[k].trim())
          err('categoriesPl["' + k + '"] is empty - drop the key instead');
      });
      const missing = catKeys.filter(k => !c.categoriesPl[k]);
      if (missing.length && missing.length !== catKeys.length)
        warn("categoriesPl covers " + (catKeys.length - missing.length) + " of " + catKeys.length
             + " categories; the rest fall back to English: " + missing.join(", "));
    }
  }

  if (c.roles && typeof c.roles === "object") {
    (Array.isArray(c.roles.always) ? c.roles.always : []).forEach(k => {
      if (!cats[k]) err('roles.always names a category that does not exist: "' + k + '"');
    });
    if (c.roles.opener && !cats[c.roles.opener])
      err('roles.opener names a category that does not exist: "' + c.roles.opener + '"');
  }

  let nIntents = 0;
  if (c.intents && typeof c.intents === "object") {
    const i = c.intents;
    nIntents = Array.isArray(i.en) ? i.en.length : 0;
    ["pl", "cat", "cmt", "topic"].forEach(k => {
      const a = i[k];
      if (Array.isArray(a) && a.length !== nIntents)
        warn("intents." + k + " length " + a.length + " != intents.en length " + nIntents
          + " (engine pads, but alignment is positional - check for a slipped row)");
    });
    (i.pl || []).forEach((p, ix) => {
      if (!String(p == null ? "" : p).trim())
        warn("intent " + ix + ' ("' + (i.en[ix] || "") + '") has no Polish clause - invisible in PL mode');
    });
    (i.cat || []).forEach((k, ix) => {
      (Array.isArray(k) ? k : [k]).forEach(kk => {
        if (kk && !cats[kk]) warn("intent " + ix + ' points at unknown category "' + kk + '"');
      });
    });
  }

  const cards = Array.isArray(c.cards) ? c.cards : [];
  if (!cards.length) err("no cards");
  const seen = Object.create(null);
  cards.forEach((m, ix) => {
    const where = "card " + (ix + 1) + (m && m.t ? ' ("' + m.t + '")' : "");
    if (!m || typeof m !== "object") { err(where + ": not an object"); return; }
    if (!String(m.t || "").trim()) err(where + ": title (t) is required");
    if (!String(m.en || "").trim()) err(where + ": English (en) is required");
    if (!String(m.pl || "").trim()) err(where + ": Polish (pl) is required");
    if (m.c && catKeys.length && !cats[m.c]) err(where + ': unknown category "' + m.c + '"');
    /* Identity is category+title (the engine derives ids as b:<cat>:<title>), so a duplicate
       pair means hide/star/edit target whichever card comes first - personal state corrupts. */
    // JSON-encoded pair, so no separator occurring inside a key or title can spoof a match.
    // A raw NUL separator lived here once and made git treat this whole file as binary.
    const key = JSON.stringify([String(m.c || ""), String(m.t || "")]);
    if (seen[key]) err(where + ": duplicate category+title - card ids collide with card " + seen[key]);
    seen[key] = ix + 1;
    (Array.isArray(m.intents) ? m.intents : []).forEach(x => {
      if (typeof x === "number") {
        if (!Number.isInteger(x) || x < 0 || (nIntents && x >= nIntents))
          err(where + ": intent link " + x + " is out of range (0.." + (nIntents - 1) + ")");
      } else if (!/^(i:\d+|ui:)/.test(String(x))) {
        warn(where + ': intent link "' + x + '" is not numeric - fine locally, fragile in a distributed file');
      } else if (/^i:\d+$/.test(String(x)) && nIntents && +String(x).slice(2) >= nIntents) {
        err(where + ": intent link " + x + " is out of range");
      }
    });
    if (m.seq && !m.alt) warn(where + ": seq without alt does nothing (blocks only split when alt is set)");
    if (m.alt) {
      const en = String(m.en || "").split(/\n\s*\n/).filter(s => s.trim()).length;
      const pl = String(m.pl || "").split(/\n\s*\n/).filter(s => s.trim()).length;
      if (en !== pl) warn(where + ": " + en + " EN blocks vs " + pl + " PL blocks - copies at the same index will diverge");
    }
  });

  if (Array.isArray(c.who)) {
    const low = Object.create(null);
    c.who.forEach(w => {
      const k = String(w || "").trim().toLowerCase();
      if (k && low[k]) warn('who: duplicate entry "' + w + '"');
      low[k] = 1;
    });
  }

  /* {WHO} was renamed {ROLE} in 1.5.0; the engine resolved both until 2026-08-14, when the
     migration was declared complete and the shim removed. A catalog still carrying {WHO} now
     shows the literal token to whoever the macro is pasted at - which is exactly the class of
     thing errors exist for. */
  {
    const legacy = [];
    (c.cards || c.macros || []).forEach((m, i) => {
      if (!m) return;
      ["en", "pl"].forEach(k => {
        if (typeof m[k] === "string" && /\{WHO\}/.test(m[k]))
          legacy.push((m.t || m.id || "card " + i) + " (" + k + ")");
      });
    });
    if (legacy.length)
      err("{WHO} token in " + legacy.length + " place(s) - the engine no longer resolves it, "
          + "rename to {ROLE}: "
          + legacy.slice(0, 5).join(", ") + (legacy.length > 5 ? ", …" : ""));
  }

  if (typeof c.facts === "string") {
    const long = c.facts.split("\n").filter(l => l.length > 100).length;
    if (long) warn("facts: " + long + " line(s) over 100 chars - the panel is white-space:pre and will scroll sideways");
  }
  return { errors, warnings };
}

/* ---- main --------------------------------------------------------------------------------- */
if (require.main === module) {
  let hardFail = false;
  const notRun = [];

  console.log("Etiuda test harness");
  console.log("  engine/etiuda.html sha256 " + E.sha256(ENGINE_PATH));
  console.log("  read as text from " + E.sourceDoc().files.join(", "));
  console.log("\n[1/5] unit tests (functions extracted from src/)");
  try { runUnitTests(); } catch (e) { FAIL++; console.error("  FAIL harness: " + e.message); }
  console.log("  " + PASS + " passed, " + FAIL + " failed");
  if (FAIL) hardFail = true;

  console.log("\n[2/5] engine syntax check");
  try {
    const n = checkEngineSyntax();
    console.log("  " + n + " inline script(s) parse cleanly");
  } catch (e) { hardFail = true; console.error("  FAIL: " + e.message); }

  console.log("\n[2b/5] the artefact is the splice of the source");
  try {
    const t = E.spliceTie();
    t.problems.forEach(x => console.error("  ERROR: " + x));
    if (t.problems.length) hardFail = true;
    else console.log("  src/template.html and src/monolith.js reach engine/etiuda.html verbatim; "
      + t.bundleBytes + " bytes of bundle over " + t.modules.length + " module(s)");
  } catch (e) { hardFail = true; console.error("  FAIL: " + e.message); }

  console.log("\n[3/5] stacking invariants");
  try {
    const s = checkStacking();
    s.problems.forEach(p => console.error("  ERROR: " + p));
    if (s.problems.length) hardFail = true;
    else console.log("  hit strip " + s.strip + " sits below the panel (peek "
      + s.peek + ", docked " + s.docked + ")");
  } catch (e) { hardFail = true; console.error("  FAIL: " + e.message); }
  try {
    const cc = checkCommentCeiling(sourceText());
    if (cc.over > 0) {
      hardFail = true;
      console.error("  ERROR: " + cc.over + " more 7+ line comment(s) than the budget of "
        + COMMENT_ESSAY_BUDGET + " - trim one, or raise the budget deliberately. Longest:");
      cc.found.slice(0, 5).forEach(b => console.error("    " + b.n + " lines, " + sourceAtLine(b.line) + " - " + b.head));
    } else {
      console.log("  comment ceiling: " + cc.total + " blocks at 7+ lines, budget "
        + COMMENT_ESSAY_BUDGET + (cc.over < 0 ? " (LOWER the budget - " + (-cc.over) + " were pruned)" : ""));
    }
  } catch (e) { hardFail = true; console.error("  FAIL: " + e.message); }
  try {
    const u = checkDuplicateStrings(sourceText());
    u.problems.forEach(p => console.error("  ERROR: duplicate translation key - " + p));
    if (u.problems.length) hardFail = true;
    else console.log("  no duplicate translation keys (" + u.keys + " strings)");
  } catch (e) { hardFail = true; console.error("  FAIL: " + e.message); }
  try {
    const g = checkGreetingsOnce(sourceText());
    g.problems.forEach(p => console.error("  ERROR: greeting vocabulary duplicated - " + p));
    if (g.problems.length) hardFail = true;
    else console.log("  the greeting vocabulary lives once (" + g.phrases + " phrases)");
  } catch (e) { hardFail = true; console.error("  FAIL: " + e.message); }
  try {
    const d = checkDarkPalettes(engineSource());
    d.problems.forEach(p => console.error("  ERROR: dark palettes disagree - " + p));
    if (d.problems.length) hardFail = true;
    else console.log("  the two dark palettes agree (" + d.tokens + " tokens)");
  } catch (e) { hardFail = true; console.error("  FAIL: " + e.message); }

  console.log("\n[3b/5] t() shadowing");
  try {
    const p = checkTShadow();
    p.forEach(x => console.error("  ERROR: " + x));
    if (p.length) hardFail = true;
    else console.log("  no local shadows the translation function");
  } catch (e) { hardFail = true; console.error("  FAIL: " + e.message); }

  console.log("\n[3c/5] runtime attributes go through t()");
  try {
    const p = checkRawAttrs();
    p.forEach(x => console.error("  ERROR: " + x));
    if (p.length) hardFail = true;
    else console.log("  no tooltip or placeholder is assigned raw English");
  } catch (e) { hardFail = true; console.error("  FAIL: " + e.message); }

  console.log("\n[3f/5] catalog export/import round trip");
  try {
    const r = checkCatalogRoundTrip();
    r.missing.forEach(f => console.error("  ERROR: export writes \"" + f
      + "\" and parseCatalogFile drops it - an imported catalog loses that field"));
    r.cardMissing.forEach(f => console.error("  ERROR: a card's \"" + f
      + "\" is exported and parseMacrosData never reads it - it is lost on import"));
    if (!r.bothLoop) console.error("  ERROR: export and import no longer walk the same card"
      + " translation table");
    if (r.missing.length || r.cardMissing.length || !r.bothLoop) hardFail = true;
    else console.log("  all " + r.fields + " catalog field(s) and " + r.cardFields.length
      + " plain card field(s) survive an import");
  } catch (e) { hardFail = true; console.error("  FAIL: " + e.message); }
  console.log("\n[3g/5] the contracts a rename must not touch");
  try {
    const f = checkFrozenContracts();
    f.problems.forEach(x => console.error("  ERROR: " + x));
    if (f.problems.length) hardFail = true;
    else console.log("  window.PB_CATALOG and window.PB_SAMPLE still read, storage namespaced "
      + JSON.stringify(f.prefix) + " and cleared by the same prefix, " + f.ui.count
      + " interface strings at " + f.ui.sha256.slice(0, 16));
  } catch (e) { hardFail = true; console.error("  FAIL: " + e.message); }

  console.log("\n[3d/5] characters a keyboard cannot type");
  try {
    const p = checkTypeableChars();
    p.forEach(x => console.error("  ERROR: " + x));
    if (p.length) hardFail = true;
    else console.log("  no untypeable character in the engine's interface"
      + (p.ran.catalog ? ", nor in anything a passenger receives" : "; the catalog half was NOT RUN"));
    if (!p.ran.catalog) notRun.push("3d's catalog half");
  } catch (e) { hardFail = true; console.error("  FAIL: " + e.message); }

  console.log("\n[3e/5] card list shapes");
  try {
    const p = checkColPlan();
    p.forEach(x => console.error("  ERROR: " + x));
    if (p.length) hardFail = true;
    else console.log("  every list shape places every card, once, in the right column");
  } catch (e) { hardFail = true; console.error("  FAIL: " + e.message); }

  console.log("\n[4/5] catalog lint (" + E.FIXTURE_FILE.catalog + ")");
  let catalog = null;
  if (HAVE_FIXTURES) {
    try {
      const c = loadCatalog(CATALOG_PATH());
      catalog = c;
      const r = lintCatalog(c);
      r.warnings.forEach(w => console.warn("  warn:  " + w));
      r.errors.forEach(e => console.error("  ERROR: " + e));
      console.log("  " + catalogLintLine(c, r));
      if (r.errors.length) hardFail = true;
    } catch (e) { hardFail = true; console.error("  ERROR: " + e.message); }
  } else {
    notRun.push("4");
    console.log("  NOT RUN: ETIUDA_FIXTURES is unset, so no catalog was linted");
  }

  console.log("\n[5/5] search evaluation (" + E.FIXTURE_FILE.searchEval + ")");
  if (!catalog) {
    notRun.push("5");
    console.log("  NOT RUN: " + (HAVE_FIXTURES ? "section 4 produced no catalog" : "ETIUDA_FIXTURES is unset"));
  } else {
    try {
      const cases = require(EVAL_PATH());
      if (!Array.isArray(cases)) throw new Error("search-eval.js must module.exports an array");
      const r = runSearchEval(catalog.cards || [], catalog.categories || {}, cases,
                              { en: (catalog.intents || {}).en || [], pl: (catalog.intents || {}).pl || [] });
      r.rows.forEach(row => {
        if (row.bad) { console.error("  BROKEN case " + JSON.stringify(row.q) + ": " + row.bad); return; }
        if (row.ok) return;
        const where = row.at < 0 ? "not in results" : "at #" + (row.at + 1) + " of " + row.total;
        console.error("  MISS" + (row.guard ? " (guard)" : "") + " " + JSON.stringify(row.q)
          + " -> want " + JSON.stringify(row.want) + " " + row.kind + ", " + where);
        if (row.note) console.error("        note: " + row.note);
        row.got.forEach((g, i) => console.error("        #" + (i + 1) + " t" + g.tier
          + " " + g.score.toFixed(1) + "  " + g.t));
      });
      if (r.scored) {
        const pct = n => (100 * n / r.scored).toFixed(0) + "%";
        console.log("  " + r.scored + " ranked case(s): top-1 " + r.top1 + " (" + pct(r.top1)
          + "), top-3 " + r.top3 + " (" + pct(r.top3) + ")");
      }
      if (r.broken) { hardFail = true; console.error("  " + r.broken + " case(s) name a card that does not exist"); }
      if (r.guardFails) { hardFail = true; console.error("  " + r.guardFails + " guard case(s) regressed"); }
      if (!r.broken && !r.guardFails) console.log("  no broken cases, no guard regressions");
    } catch (e) { hardFail = true; console.error("  ERROR: " + e.message); }
  }

  /* The RESULT line carries what was not run, because a verdict that leaves it to the reader to
     notice a NOT RUN twenty lines above is the shape of an early victory. */
  const left = notRun.length ? " - NOT RUN: " + notRun.join(", ") : "";
  console.log((hardFail ? "\nRESULT: FAIL" : "\nRESULT: OK") + left);
  process.exit(hardFail ? 1 : 0);
}

module.exports = { lintCatalog, loadCatalog, catalogLintLine, checkEngineSyntax, checkStacking, checkTShadow, checkRawAttrs, checkTypeableChars,
                   searchFns, rankForQuery, runSearchEval };
