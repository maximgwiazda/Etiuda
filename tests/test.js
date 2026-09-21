/* Etiuda test harness + catalog linter. Zero dependencies beyond node.

     node tests/test.js                          sections 1 to 3, which need no content
     ETIUDA_FIXTURES=<folder> node tests/test.js  all five

   Also require()-able, and this line used to say the build calls it. It does not, measured
   2026-09-18: tools/build.mjs reads no catalog at all, and lintCatalog() has two callers in this
   tree, section 4 below and tests/log-hygiene-selftest.js, plus Studio, which lints an imported
   catalog through this file. What a bad catalog stops is a RELEASE - tools/release.mjs runs this
   suite with fixtures - and not a build. The claim came from build-integrated.js, which is in no
   commit of this repository.

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
const CATALOG_PATH = () => E.fixtures("catalogV2").catalogV2;
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
    /* catalogMacroCount counts the catalog's OWN primary body, so the slice needs the card
       table, the derived-column rule and the reader of a catalog's declared languages. */
    "const CONTENT_LANGS=",
    "const BUILT_IN_LANGS=",
    "function catalogLangs(",
    "const CARD_FIELD_KEY=",
    "function langColumn(",
    "function cardFieldKey(",
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
/* Produced by tools/catalog-v2/format.mjs, the converter's own contentHash, over the object
   named at the case that uses it. A constant is the only way two implementations in two
   module systems can be tied together from here. */
const V2_HASH_FIXED = "djb2:8aa7d521";
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

  /* And the catalog-side rule that {Z} exists for, board item 106. The live defect it was
     written from is one Polish body writing the letter by hand, which is right for the clauses
     that take z and wrong for every one that takes ze. */
  const bareBefore = t => plPrepositionsBeforeIntent(t).join(",");
  eq("bare z before the token",    bareBefore("W zwiazku z {INTENT} prosze o cierpliwosc."), "z");
  eq("bare ze before the token",   bareBefore("W zwiazku ze {INTENT} prosze o cierpliwosc."), "ze");
  eq("the wrong case, accusative", bareBefore("Pytasz o {INTENT}."), "o");
  eq("the token is not a bare word", bareBefore("W zwiazku {Z} {INTENT} prosze o cierpliwosc."), "");
  eq("punctuation is not a word",  bareBefore("Sprawa: {INTENT}."), "");
  eq("both bodies of one card",    bareBefore("z {INTENT} i o {INTENT}"), "z,o");
  eq("nothing in front of it",     bareBefore("{INTENT} - juz sie tym zajmuje."), "");
  eq("an English body is unaffected", bareBefore("I can help with {INTENT}."), "");

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
  eq("plVocative Marzena", F.plVocative("Marzena"), "Marzeno");
  /* THE MASCULINE RULE, one leg per branch of it, and the last three are what the rule costs
     and what still overrules it. A name the table used to carry is here on purpose: the table
     no longer holds the regular male names, so Jan and Piotr above are the rule answering. */
  eq("plVocative Tytus (hard stem, -ie)", F.plVocative("Tytus"), "Tytusie");
  eq("plVocative Jan (was table, now rule)", F.plVocative("Jan"), "Janie");
  eq("plVocative Albert (t -> cie)", F.plVocative("Albert"), "Albercie");
  eq("plVocative Orest (st -> scie)", F.plVocative("Orest"), "Oreście");
  eq("plVocative Dawid (d -> dzie)", F.plVocative("Dawid"), "Dawidzie");
  eq("plVocative Michał (l with a stroke -> le)", F.plVocative("Michał"), "Michale");
  eq("plVocative Maciej (soft stem, -u)", F.plVocative("Maciej"), "Macieju");
  eq("plVocative Eryk (velar, -u)", F.plVocative("Eryk"), "Eryku");
  eq("plVocative Jerzy (a vowel is left alone)", F.plVocative("Jerzy"), "Jerzy");
  eq("plVocative Kacper (fleeting e, still the table's)", F.plVocative("Kacper"), "Kacprze");
  /* Origin does not decide: an ending the rules print is declined, and one they do not
     is left as typed. The table still outranks the rules. */
  eq("plVocative John (hard n, -ie)", F.plVocative("John"), "Johnie");
  eq("plVocative Brian (hard n, -ie)", F.plVocative("Brian"), "Brianie");
  eq("plVocative Dennis (hard s, -ie)", F.plVocative("Dennis"), "Dennisie");
  eq("plVocative Alejandro (a vowel the rule does not decline)", F.plVocative("Alejandro"), "Alejandro");
  eq("plVocative Joe (ending fits no pattern)", F.plVocative("Joe"), "Joe");
  eq("plVocative Max (a consonant the rules do not print)", F.plVocative("Max"), "Max");
  eq("plVocative Emma (-a, origin aside)", F.plVocative("Emma"), "Emmo");
  eq("plVocative Brzeczyszczykiewicz (soft cz, -u)", F.plVocative("Brzeczyszczykiewicz"), "Brzeczyszczykiewiczu");
  eq("plVocative Kasia (a diminutive the table carries)", F.plVocative("Kasia"), "Kasiu");

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

  shellBridgeTests();
  policyTests();
  v2ValidationTests();
  lintCatalogTests();
  langAgnosticTests();
  libraryAwaitingTests();
  copyControlTests();
  catalogLangTests();
  catalogIdentityTests();
  nameNsAdoptionTests();
  deskStatsTests();
}

/* Section 2.5 of the specification and the body rules of 2.6, driven over the reader that
   enforces them. Extracted rather than run through the whole engine, because what is being
   asserted is a refusal and its wording. */
function v2Fns() {
  const src = sourceText();
  const decls = [
    "const V2_FORMAT=", "const DEFAULT_LANGS=",
    "function v2Str(", "function v2Codes(", "function isV2(",
    "function v2Canonical(", "function v2ContentHash(",
    "function v2SigFold(", "function v2SignedBytes(",
    "const V2_ID_RE=", "const V2_SHAPES=", "const V2_MARKER_RE=", "function v2IsBracketLine(",
    "const V2_GREET_PARTS=", "function v2BodyProblems(", "const V2_LANG_RE=", "function v2LangProblems(",
    "function v2Problems(",
    /* CARD_FLAGS is spelled out to its first member: card-fields.js declares the same name
       and comes first in the source document, so the bare marker slices the wrong one. */
    "const CARD_KEY=", "const REQ_KEY=", "const V2_RUNTIME_FIELD=", "function v2ColKey(",
    "const CAT_LABEL_KEY=", "function v2CatKey(",
    "const V2_GRAMMAR_LANGS=", "function v2GrammarNotices(",
    'const CARD_FLAGS=["firstOnly"',
    "function v2Mark(", "function v2Unmark(", "function v2AltLabel(", "function v2PartText(",
    "function catalogToV2(",
    "function catalogFromV2(",
  ].map(m => extractDecl(src, m)).join("\n");
  return new Function(decls + "\nreturn {isV2,v2Problems,v2GrammarNotices,v2ContentHash,v2SignedBytes,catalogToV2,catalogFromV2,v2Unmark,v2Mark,v2AltLabel,v2PartText,v2ColKey,v2CatKey,CARD_KEY,REQ_KEY};")();
}
function v2ValidationTests() {
  const V = v2Fns();
  const base = () => ({
    format: 2, kind: "etiuda-catalog", id: "toy-shop", name: "Toy shop", rev: 1,
    langs: [{ code: "en", label: "EN" }, { code: "pl", label: "PL" }],
    tags: [{ id: "t-open", kind: "shelf", label: { en: "Open" } },
           { id: "t-a-lamp", kind: "request", clause: { en: "a lamp", pl: "lampa" } }],
    cards: [{ id: "c-hello", shelf: "t-open", bodyShape: "plain",
              title: { en: "Hello" }, body: { en: "Hello there." }, requests: ["t-a-lamp"] }]
  });
  const bent = (f) => { const c = base(); f(c); return V.v2Problems(c); };
  const first = (f) => (bent(f)[0] || "none");

  eq("v2 a sound catalog has nothing to report", V.v2Problems(base()), []);
  eq("v2 a missing id is named", first(c => { delete c.id; }).slice(0, 11), "id: absent,");
  eq("v2 a malformed id is named", first(c => { c.id = "A"; }).slice(0, 14), "id: malformed,");
  eq("v2 a missing rev is named", first(c => { delete c.rev; }).slice(0, 12), "rev: absent,");
  eq("v2 a twice-claimed tag id is named",
     first(c => c.tags.push({ id: "t-open", kind: "shelf", label: { en: "Again" } })),
     "tag t-open: the id is claimed twice");
  eq("v2 a twice-claimed card id is named",
     first(c => c.cards.push(Object.assign({}, c.cards[0]))),
     "card c-hello: the id is claimed twice");
  eq("v2 a shelf naming no tag is named",
     first(c => { c.cards[0].shelf = "t-nowhere"; }), "card c-hello: shelf t-nowhere names no tag");
  eq("v2 a shelf that is a request is named",
     first(c => { c.cards[0].shelf = "t-a-lamp"; }), "card c-hello: shelf t-a-lamp is a request");
  eq("v2 a request link naming no tag is named",
     first(c => { c.cards[0].requests = ["t-ghost"]; }),
     "card c-hello: requests names t-ghost, which is no tag");
  eq("v2 a request link naming a shelf is named",
     first(c => { c.cards[0].requests = ["t-open"]; }),
     "card c-hello: requests names t-open, a shelf");
  eq("v2 a request with no clause in the primary is named",
     first(c => { delete c.tags[1].clause.en; }), "tag t-a-lamp: no clause in en, the primary language");
  /* The primary is langs[0], so the same file read with pl first refuses a different card. */
  eq("v2 the primary is the first declared language, not English",
     first(c => { c.langs = [{ code: "pl" }, { code: "en" }]; }),
     "card c-hello: no title in pl, the primary language");
  eq("v2 a card with no title in the primary is named",
     first(c => { delete c.cards[0].title.en; }), "card c-hello: no title in en, the primary language");
  eq("v2 a card with no body in the primary is named",
     first(c => { c.cards[0].body = { pl: "Dzien dobry." }; }).slice(0, 26), "card c-hello: no body in e");

  /* THE LANGUAGES, AND THE TWO TABLES THAT FOLLOW THEM. Since board 646 every code is read -
     the column is derived where the tables name none - so what is refused here is a code that
     cannot be a key at all. Having no GRAMMAR for a code is a notice, not a refusal, and the
     legs for the difference are in langAgnosticTests. */
  eq("v2 a catalog declaring no languages is named",
     first(c => { delete c.langs; }).slice(0, 13), "langs: absent");
  eq("v2 a language this build has no table for is READ rather than refused",
     V.v2Problems((() => { const c = base(); c.langs = [{ code: "en" }, { code: "sv" }];
       c.cards[0].title.sv = "Hej"; c.cards[0].body.sv = "Hej da."; return c; })()), []);
  eq("v2 a code that cannot be a key is named",
     first(c => { c.langs = [{ code: "en" }, { code: "s v" }]; }),
     'langs: "s v" is not usable as a language code, wanted a-z, then any hyphened parts of a-z'
     + ' and 0-9, as "en" or "pt-br"');
  eq("v2 a language declared twice is named",
     first(c => { c.langs = [{ code: "en" }, { code: "en" }]; }), "langs: en is declared twice");
  eq("v2 an entry with no code is named",
     first(c => { c.langs = [{ code: "en" }, { label: "PL" }]; }), "langs: an entry with no code");
  eq("v2 a sound greeting has nothing to report",
     bent(c => { c.greet = { en: ["a", "b", "c"] }; }), []);
  eq("v2 a greeting that does not cover the three parts of the day is named",
     first(c => { c.greet = { en: ["a", "b"] }; }),
     "greet.en: wanted 3 phrases, morning, afternoon and evening");
  eq("v2 a greeting with a blank phrase is named",
     first(c => { c.greet = { en: ["a", "", "c"] }; }).slice(0, 9), "greet.en:");
  eq("v2 a greeting in a language the catalog does not speak is named",
     first(c => { c.greet = { sv: ["a", "b", "c"] }; }),
     "greet.sv: a language this catalog does not declare");
  eq("v2 a sound stop list has nothing to report",
     bent(c => { c.stop = { pl: ["oraz"] }; }), []);
  eq("v2 a stop list that is not a list is named",
     first(c => { c.stop = { pl: "oraz" }; }), "stop.pl: not a list of words");
  eq("v2 a stop list in a language the catalog does not speak is named",
     first(c => { c.stop = { sv: ["dock"] }; }),
     "stop.sv: a language this catalog does not declare");

  // 2.6, the body rules
  eq("v2 an absent bodyShape is named",
     first(c => { delete c.cards[0].bodyShape; }), "card c-hello: bodyShape absent");
  eq("v2 an unknown bodyShape is named",
     first(c => { c.cards[0].bodyShape = "list"; }),
     'card c-hello: bodyShape "list" is not plain, steps or alts');
  eq("v2 plain with a marker in it is named",
     first(c => { c.cards[0].body.en = "[step]\nOne."; }),
     "card c-hello (en): bodyShape is plain and the body carries 1 marker(s)");
  eq("v2 a shaped body that does not open with a marker is named",
     first(c => { c.cards[0].bodyShape = "steps"; c.cards[0].body.en = "One.\n\n[step]\nTwo."; }),
     "card c-hello (en): bodyShape is steps and the body does not open with a marker");
  eq("v2 a shape disagreeing with the opening marker is named",
     first(c => { c.cards[0].bodyShape = "steps"; c.cards[0].body.en = "[alt]\nOne."; }),
     "card c-hello (en): bodyShape is steps and the body opens with [alt]");
  eq("v2 a bracket line that is not a marker is named",
     first(c => { c.cards[0].bodyShape = "steps"; c.cards[0].body.en = "[step]\nOne.\n\n[stpe]\nTwo."; }),
     "card c-hello (en): [stpe] is a line in brackets that is not a marker");
  eq("v2 a labelled step is named",
     first(c => { c.cards[0].bodyShape = "steps"; c.cards[0].body.en = "[step: first]\nOne."; }),
     "card c-hello (en): [step: first] labels a step, and only an alternative takes a label");
  eq("v2 an alternative may carry a label",
     bent(c => { c.cards[0].bodyShape = "alts"; c.cards[0].body.en = "[alt: gentle]\nOne.\n\n[alt]\nTwo."; }), []);
  /* Spec 2.6: the label reaches the runtime and the file, and a bare [alt] is unchanged. */
  const labelled = base();
  labelled.cards[0].bodyShape = "alts";
  labelled.cards[0].body.en = "[alt: by post]\nOne.\n\n[alt]\nTwo.";
  eq("v2 a labelled alternative has nothing to report", V.v2Problems(labelled), []);
  const loadedLab = V.catalogFromV2(labelled);
  eq("v2Unmark keeps the label where the alternative body can see it",
     loadedLab.cards[0].en, "[alt: by post]\nOne.\n\nTwo.");
  eq("and the copyable text does not carry the marker",
     V.v2PartText("[alt: by post]\nOne."), "One.");
  eq("and the copy control reads the label", V.v2AltLabel("[alt: by post]\nOne."), "by post");
  eq("catalogToV2 writes the labelled marker back",
     V.catalogToV2(loadedLab).cards[0].body.en, "[alt: by post]\nOne.\n\n[alt]\nTwo.");
  const bareAlt = base();
  bareAlt.cards[0].bodyShape = "alts";
  bareAlt.cards[0].body.en = "[alt]\nOne.\n\n[alt]\nTwo.";
  const loadedBare = V.catalogFromV2(bareAlt);
  eq("a bare alternative still drops the marker line", loadedBare.cards[0].en, "One.\n\nTwo.");
  eq("and writes a bare marker back",
     V.catalogToV2(loadedBare).cards[0].body.en, "[alt]\nOne.\n\n[alt]\nTwo.");
  const fmtSrc = fs.readFileSync(path.join(__dirname, "..", "tools", "catalog-v2", "format.mjs"), "utf8");
  const isMarkerLine = new Function(fmtSrc.replace(/\nexport \{[\s\S]*$/, "\nreturn isMarkerLine;"))();
  eq("isMarkerLine and v2Problems agree on [alt: by post]",
     [isMarkerLine("[alt: by post]"), V.v2Problems((() => { const c = base();
       c.cards[0].bodyShape = "alts"; c.cards[0].body.en = "[alt: by post]\nOne."; return c; })())],
     [true, []]);
  eq("isMarkerLine and v2Problems agree on [alt]",
     [isMarkerLine("[alt]"), V.v2Problems((() => { const c = base();
       c.cards[0].bodyShape = "alts"; c.cards[0].body.en = "[alt]\nOne."; return c; })())],
     [true, []]);
  eq("isMarkerLine and v2Problems agree [step: x] is a marker that labels a step",
     [isMarkerLine("[step: x]"), (V.v2Problems((() => { const c = base();
       c.cards[0].bodyShape = "steps"; c.cards[0].body.en = "[step: x]\nOne."; return c; })())[0] || "")
       .indexOf("not a marker") < 0],
     [true, true]);
  eq("v2 two languages disagreeing on block count is named",
     first(c => { c.cards[0].bodyShape = "steps";
                  c.cards[0].body.en = "[step]\nOne.\n\n[step]\nTwo.";
                  c.cards[0].body.pl = "[step]\nRaz."; }),
     "card c-hello (pl): 1 block(s) against 2 in en");
  eq("v2 a language the card does not carry is not compared",
     bent(c => { c.cards[0].bodyShape = "steps"; c.cards[0].body = { en: "[step]\nOne.\n\n[step]\nTwo." }; }), []);

  /* THE HASH IS THE ONE RULE WITH A SECOND IMPLEMENTATION, tools/catalog-v2/format.mjs, and a
     converter stamp this could not check would be a field that only looks like a guarantee.
     The constant was produced by that module over this exact object on 2026-09-14. */
  const stamped = { format: 2, kind: "etiuda-catalog", id: "toy-shop", rev: 1, cards: [] };
  eq("v2 the hash is the converter's, over one object", V.v2ContentHash(stamped), V2_HASH_FIXED);
  eq("v2 a hash that does not match the content is named",
     first(c => { c.hash = "djb2:0"; }), "hash: djb2:0 is not the hash of what the file holds");
  eq("v2 the file's own hash passes", bent(c => { c.hash = V.v2ContentHash(c); }), []);
  eq("v2 hash and sig do not hash themselves",
     V.v2ContentHash(Object.assign({ sig: "anything" }, stamped)), V2_HASH_FIXED);

  /* THE SIGNED BYTES, same canonical function the hash uses. Value off, alg and keyId on,
     hash off, keys sorted: a JSON round-trip or a key reorder must not move the signature. */
  const hexOf = u8 => Buffer.from(u8).toString("hex");
  const signedDoc = Object.assign({}, stamped, { sig: { alg: "Ed25519", keyId: "k1", value: "aa" } });
  const signedVal = Object.assign({}, stamped, { sig: { alg: "Ed25519", keyId: "k1", value: "bb" } });
  eq("v2 signed bytes ignore the signature value",
     hexOf(V.v2SignedBytes(signedDoc)), hexOf(V.v2SignedBytes(signedVal)));
  const algSwap = Object.assign({}, stamped, { sig: { alg: "RSA", keyId: "k1", value: "aa" } });
  eq("v2 signed bytes include the algorithm",
     hexOf(V.v2SignedBytes(signedDoc)) === hexOf(V.v2SignedBytes(algSwap)), false);
  const keySwap = Object.assign({}, stamped, { sig: { alg: "Ed25519", keyId: "k2", value: "aa" } });
  eq("v2 signed bytes include the key identifier",
     hexOf(V.v2SignedBytes(signedDoc)) === hexOf(V.v2SignedBytes(keySwap)), false);
  const reordered = { sig: signedDoc.sig, rev: 1, id: "toy-shop", kind: "etiuda-catalog",
                      format: 2, cards: [] };
  eq("v2 signed bytes survive a key reorder",
     hexOf(V.v2SignedBytes(signedDoc)), hexOf(V.v2SignedBytes(reordered)));
  eq("v2 signed bytes survive a JSON round-trip",
     hexOf(V.v2SignedBytes(signedDoc)),
     hexOf(V.v2SignedBytes(JSON.parse(JSON.stringify(signedDoc)))));
  const withHash = Object.assign({ hash: "djb2:dead" }, signedDoc);
  eq("v2 signed bytes ignore the hash stamp",
     hexOf(V.v2SignedBytes(signedDoc)), hexOf(V.v2SignedBytes(withHash)));
  eq("the harness test public key is 32-byte hex",
     /V2_HARNESS_TEST_PUB="[0-9a-f]{64}"/.test(sourceText()), true);

  /* THE EXPORT SIDE, section 5. The object catalogToV2 is handed is the format 1 runtime
     shape currentCatalog() builds, so these are spelled the way that function spells them. */
  const runtime = (extra) => Object.assign({
    format: 1, kind: "playbook-catalog", name: "Toy shop",
    categories: { "t-open": "Open" }, icons: {}, colors: {},
    intents: { en: ["a lamp"], pl: ["lampa"] },
    cards: [{ id: "c-hello", c: "t-open", t: "Hello", en: "Hello there.", intents: [0] }]
  }, extra || {});

  const mine = V.catalogToV2(runtime());
  eq("export of a catalog with no origin carries no modified flag", mine.modified, undefined);
  eq("export of a catalog with no origin leaves rev at 1", mine.rev, 1);
  const theirs = V.catalogToV2(runtime({ id: "toy-shop", rev: 7 }));
  eq("export of someone else's catalog says modified", theirs.modified, true);
  eq("and does not bump their rev", theirs.rev, 7);
  eq("and keeps their id, which is the personal layer's namespace", theirs.id, "toy-shop");
  /* The hash is over the finished payload, the modified flag included, so an exported file
     carries a hash of itself as written rather than of what it was before the stamp. */
  eq("the export stamps a hash of what it wrote",
     theirs.hash === V.v2ContentHash(theirs) && /^djb2:/.test(theirs.hash), true);
  eq("a bent export no longer matches its own hash",
     V.v2ContentHash(Object.assign({}, theirs, { name: "Bent" })) === theirs.hash, false);
  /* An export this engine would refuse to read back is the failure worth catching: the
     validator and the writer are two halves of one contract and nothing else compares them. */
  eq("an export passes the loader's own validation", V.v2Problems(theirs), []);

  /* THE REQUEST IDS. A request used to be renamed by every export, because the runtime links one
     by position and had no room for its id; a link stayed true and the id did not, so two desks
     exporting one catalog produced two files whose tags agreed about nothing. */
  const named = V.catalogToV2(runtime({ id: "toy-shop", intentIds: ["t-a-lamp"] }));
  eq("a request keeps the id it arrived with",
     named.tags.filter(t => t.kind === "request").map(t => t.id), ["t-a-lamp"]);
  eq("and the card's link still names it",
     named.cards[0].requests, ["t-a-lamp"]);
  const mixed = V.catalogToV2(runtime({ id: "toy-shop",
    intents: { en: ["a lamp", "a shade"], pl: ["lampa", "abazur"] },
    intentIds: ["t-a-lamp"] }));
  eq("an intent added at this desk takes a positional id",
     mixed.tags.filter(t => t.kind === "request").map(t => t.id), ["t-a-lamp", "t-r1"]);
  /* A minted id colliding with a declared one is a load error, so it steps along rather than
     merging two requests into one tag. */
  const clash = V.catalogToV2(runtime({ id: "toy-shop",
    intents: { en: ["a lamp", "a shade"], pl: ["lampa", "abazur"] },
    intentIds: ["t-r1"] }));
  eq("a minted id steps past one already claimed",
     clash.tags.filter(t => t.kind === "request").map(t => t.id), ["t-r1", "t-r2"]);
  eq("and the export still passes validation", V.v2Problems(clash), []);

  /* The greeting and the stop list leave in an export exactly as they arrived: they are the
     catalog author's words, and the modules honouring them hold them in the shape they use
     them in rather than the shape they came in. */
  const spoken = { greet: { en: ["Hi", "Hi there", "Evening"] }, stop: { pl: ["oraz"] } };
  const back = V.catalogToV2(runtime(Object.assign({ id: "toy-shop" }, spoken)));
  eq("an export gives the greeting back", back.greet, spoken.greet);
  eq("and the stop list", back.stop, spoken.stop);
  eq("and the file it wrote passes the loader's validation", V.v2Problems(back), []);
}

/* Spec 2.6 lines 399-401: where a label is present the copy control shows it in place of
   variant 1/2. altLabelAt is that reading; cardBodyHtml is the surface that paints it. */
function copyControlTests() {
  const src = sourceText();
  const decls = [
    "const CARD_FIELD_KEY=", "function langColumn(", "function cardFieldKey(", "function cardText(",
    "function splitPartsRaw(", "function v2Str(", "const V2_MARKER_RE=",
    "function v2AltLabel(", "function altLabelAt(",
  ].map(m => extractDecl(src, m)).join("\n");
  const F = new Function(decls + "\nreturn {altLabelAt};")();
  const m = { alt: 1, en: "[alt: by post]\nOne.\n\nTwo." };
  eq("the copy control shows the label in place of the variant index",
     F.altLabelAt(m, "en", 0), "by post");
  eq("and a bare alternative has no label", F.altLabelAt(m, "en", 1), "");
  eq("and a step does not take a label",
     F.altLabelAt({ alt: 1, seq: 1, en: "[alt: by post]\nOne." }, "en", 0), "");
  eq("cardBodyHtml paints that label",
     /altLabelAt\(/.test(extractDecl(src, "function cardBodyHtml(")), true);
}

/* THE THREE ENVELOPE FIELDS THE RUNTIME HONOURS RATHER THAN CARRIES. The catalog says which
   languages it speaks and in which order, and may bring the greeting phrases and the noise
   words for them. What is asserted here is the state of each table AFTER the catalog has
   spoken, since carrying a field and honouring it look identical at the file boundary. */
function catalogLangFns() {
  const src = sourceText();
  const decls = [
    "const CONTENT_LANGS=", "const BUILT_IN_LANGS=", "const INTENT_TEXT_FIELDS=",
    "const INTENT_FIELD_KEY=", "const SW_EN=", "const SW_PL=",
    "const SW_CMT=", "const SW_CMT_PL=", "const SW_TOPIC=", "const SW_TOPIC_PL=",
    "const SW_STORE=", "function langColumn(", "function intentFieldKey(",
    "function intentArr(", "function setContentLangs(",
    "let COMMENT_LANG=", "function setCommentLang(", "function commentLang(",
    "function intentStoreKeys(", "function intentFieldAt(",
    "const GREETINGS=", "function greetWordList(", "let CATALOG_GREETINGS=",
    "function greetTable(", "let GREET_WORDS=", "function setCatalogGreet(",
    "function dayPart(", "function greeting(",
    "const FOLD=", "function foldDiacritics(", "function splitWords(",
    "const AFFINITY_STOP=", "let CATALOG_STOP=", "function setCatalogStop(",
    "function affinityStop(",
  ].map(m => extractDecl(src, m)).join("\n");
  /* FOLD_RE the same way pureFns rebuilds it, and `lang` stands in for the interface toggle,
     which greeting() reads from another module: every case here names its language, so a
     fixed one proves nothing either way and leaving it out would only fail to parse. */
  const glue = `
    const FOLD_RE=new RegExp("["+Object.keys(FOLD).join("")+"]","g");
    let lang="en";
    return {CONTENT_LANGS,SW_STORE,setContentLangs,setCommentLang,commentLang,intentStoreKeys,
            intentFieldAt,SW_TOPIC,SW_TOPIC_PL,SW_CMT,SW_CMT_PL,
            dayPart,greeting,setCatalogGreet,
            greetWords:()=>GREET_WORDS,setCatalogStop,affinityStop};`;
  return new Function(decls + glue)();
}
function catalogLangTests() {
  const V = catalogLangFns();

  // langs: the order is the runtime's, and the first of them is primary wherever one is asked for
  eq("the built-in pair is en then pl", V.CONTENT_LANGS.slice(), ["en", "pl"]);
  V.setContentLangs(["pl", "en"]);
  eq("a catalog declaring Polish first is honoured", V.CONTENT_LANGS.slice(), ["pl", "en"]);
  eq("and every storage key follows that order",
     V.intentStoreKeys(), ["pl", "en", "cmtPl", "cmt", "topicPl", "topic"]);
  V.setContentLangs(["pl"]);
  eq("a catalog of one language names one language", V.CONTENT_LANGS.slice(), ["pl"]);
  eq("and the other language's keys are not in the store",
     V.intentStoreKeys(), ["pl", "cmtPl", "topicPl"]);
  /* BOARD 646: THERE IS NO SECOND WALL ANY MORE. A code the tables do not name gets a derived
     column and a store array of its own, so a catalog declaring it is carried rather than
     quietly stripped down to the pair - which is what this used to assert. */
  V.setContentLangs(["sv"]);
  eq("a language the tables do not name is accepted, and its columns are derived",
     [V.CONTENT_LANGS.slice(), V.intentStoreKeys(),
      ["clause:sv", "cmt:sv", "topic:sv"].every(k => Array.isArray(V.SW_STORE[k]))],
     [["sv"], ["clause:sv", "cmt:sv", "topic:sv"], true]);
  V.setContentLangs(["uk", "pl", "ru", "de"]);
  eq("and four at once, in the order declared, the founding pair keeping its legacy spelling",
     V.intentStoreKeys(),
     ["clause:uk", "pl", "clause:ru", "clause:de", "cmt:uk", "cmtPl", "cmt:ru", "cmt:de",
      "topic:uk", "topicPl", "topic:ru", "topic:de"]);
  V.setContentLangs([]);
  eq("and a catalog that declares none keeps the built-in pair", V.CONTENT_LANGS.slice(), ["en", "pl"]);

  // greet: one table, two readers - the clock and the search expander
  const built = ["Good morning", "Good afternoon", "Good evening"];
  eq("the clock reads the built-in greeting", V.greeting("en"), built[V.dayPart()]);
  eq("and the expander carries its words", V.greetWords().indexOf("Good morning") > -1, true);
  const mine = { en: ["Hi", "Hi there", "Evening"], pl: ["Czesc", "Czesc", "Dobry wieczor"] };
  V.setCatalogGreet(mine);
  eq("a catalog's greeting replaces the built-in", V.greeting("en"), mine.en[V.dayPart()]);
  eq("in every language it declares", V.greeting("pl"), mine.pl[V.dayPart()]);
  /* Both readers or neither: a phrase the clock composes and the expander does not know
     leaves the cards that use it unfindable by the search that expands the token. */
  eq("and the expander's words are the catalog's, each once",
     V.greetWords(), "Hi Hi there Evening Czesc Dobry wieczor");
  eq("with no built-in phrase left among them", V.greetWords().indexOf("Good morning") > -1, false);
  V.setCatalogGreet(null);
  eq("a catalog bringing none leaves the built-in standing", V.greeting("en"), built[V.dayPart()]);

  // stop: the noise words of a trade, per language
  eq("the built-in noise words stand where a catalog brings none", V.affinityStop("pl").oraz, 1);
  V.setCatalogStop({ pl: ["Oraz", "\u017Beby"] });
  eq("a catalog's list is folded and lowered like the word it is tested against",
     V.affinityStop("pl").zeby, 1);
  eq("and it stands in for the built-in in that language", V.affinityStop("pl").twoje, undefined);
  eq("while a language it leaves alone keeps the built-in", V.affinityStop("en").about, 1);
  V.setCatalogStop(null);
  eq("and dropping it puts the built-in back", V.affinityStop("pl").twoje, 1);

  /* Spec 2.1: the card language supplies the default; commentLang is the fallback. */
  eq("comment language defaults to the primary", V.commentLang(), "en");
  V.setCommentLang("pl");
  eq("a code the catalog speaks is honoured", V.commentLang(), "pl");
  V.setCommentLang("en");
  V.SW_TOPIC.length = 0; V.SW_TOPIC_PL.length = 0;
  V.SW_CMT.length = 0; V.SW_CMT_PL.length = 0;
  V.SW_TOPIC.push("alpha"); V.SW_TOPIC_PL.push("beta");
  V.SW_CMT.push("done-en"); V.SW_CMT_PL.push("");
  eq("a topic the card language carries stays in that language",
     V.intentFieldAt(0, "topic", "pl"), "beta");
  V.SW_TOPIC_PL[0] = "";
  eq("and a missing one falls back to the comment language",
     V.intentFieldAt(0, "topic", "pl"), "alpha");
  eq("and a missing action falls back the same way",
     V.intentFieldAt(0, "cmt", "pl"), "done-en");
  V.setContentLangs(["pl", "en"]);
  V.setCommentLang("en");
  eq("even when the comment language is not the primary",
     V.intentFieldAt(0, "topic", "pl"), "alpha");
  eq("eApplyCatalog hands the catalog's commentLang to that table",
     /setCommentLang\(c\.commentLang\)/.test(extractDecl(sourceText(), "function eApplyCatalog(")),
     true);
}

/* Same catalog or a different one, and which storage namespace a build writes. The file's own
   id decides when it is there; the name is the fallback, which is what these cases without an
   id still do. */
function deskStatsFns() {
  const src = sourceText();
  const decls = ["function statsYmd(", "function bumpUse(", "function bumpIntent(",
                 "function bumpMiss(", "function bumpLang(", "function statsDoc("]
    .map(m => extractDecl(src, m)).join("\n");
  return new Function(decls + "\nreturn {statsYmd,bumpUse,bumpIntent,bumpMiss,bumpLang,statsDoc};")();
}
function deskStatsTests() {
  const S = deskStatsFns();
  const pack = { useCounts: {}, useAt: {} };
  S.bumpUse(pack, "c-a", "2026-09-16");
  S.bumpUse(pack, "c-a", "2026-09-17");
  eq("bumpUse counts twice and last-used is the later day, not a list",
     [pack.useCounts["c-a"], pack.useAt["c-a"], Array.isArray(pack.useAt["c-a"])],
     [2, "2026-09-17", false]);
  S.bumpIntent(pack, "i:0");
  S.bumpIntent(pack, "i:0");
  eq("bumpIntent counts the same intent twice", pack.intentCounts["i:0"], 2);
  S.bumpMiss(pack);
  S.bumpMiss(pack);
  eq("bumpMiss counts twice", pack.searchMisses, 2);
  S.bumpLang(pack, "en");
  S.bumpLang(pack, "en");
  S.bumpLang(pack, "pl");
  S.bumpLang(pack, "de");
  S.bumpLang(pack, "a b");
  S.bumpLang(pack, "");
  /* Board 646: a desk speaking neither en nor pl counted nothing and reported two noughts.
     Any code is counted; something that could not be a language code is refused, because this
     map is written into a statistics document that leaves the machine. */
  eq("bumpLang counts every language the desk actually copies in, and refuses a key that is not"
     + " a code", [pack.langs, Object.keys(pack.langs).length], [{ en: 2, pl: 1, de: 1 }, 3]);
  const doc = S.statsDoc(
    { useCounts: { c: 1 }, useAt: { c: "2026-09-17" }, intentCounts: { "i:0": 2 },
      searchMisses: 3, langs: { en: 4, pl: 5, de: 6, it: 0 } },
    { engine: "2.0.0-dev", period: { from: "2026-09-01", to: "2026-09-17" },
      catalog: { id: "lamp-shop", rev: 2 } });
  eq("statsDoc names the nouns and not the agent",
     [doc.cards[0], doc.intents[0], doc.misses, doc.langs, doc.catalog, doc.engine, "agent" in doc],
     [{ id: "c", n: 1, at: "2026-09-17" }, { id: "i:0", n: 2 }, 3, { en: 4, pl: 5, de: 6 },
      { id: "lamp-shop", rev: 2 }, "2.0.0-dev", false]);
}

function catalogIdentityTests() {
  const src = sourceText();
  const I = new Function(extractDecl(src, "function isCatalogUpdate(")
    + "\nreturn {isCatalogUpdate};")();
  const same = { id: "lamp-shop", name: "Lamp Shop" };
  const renamed = { id: "lamp-shop", name: "Lamp Shop renamed" };
  const other = { id: "other-shop", name: "Lamp Shop" };
  eq("isCatalogUpdate same id different name is the same catalog",
     I.isCatalogUpdate(renamed, same), true);
  eq("isCatalogUpdate different ids same name are two catalogs",
     I.isCatalogUpdate(other, same), false);
  eq("isCatalogUpdate no id falls back to matching names",
     I.isCatalogUpdate({ name: "Lamp Shop" }, { name: "Lamp Shop" }), true);
  eq("isCatalogUpdate no id different names are different",
     I.isCatalogUpdate({ name: "Lamp Shop renamed" }, { name: "Lamp Shop" }), false);
  eq("isCatalogUpdate mixed case names without an id still match",
     I.isCatalogUpdate({ name: "Lamp Shop" }, { name: "lamp shop" }), true);
}

/* A desk that stored its layer under a hash of the catalog's NAME, opening a build that hashes
   its ID. The engine's own arithmetic, its own mover and its own strip are extracted and run
   over a store this supplies; what a real boot does with them is tests/storage-carry.js, which
   is where the Clear and the reload are. */
function nameNsAdoptionTests() {
  const src = sourceText();
  const decl = m => extractDecl(src, m);
  const nsFor = new Function(decl("function eNsFor(") + "\nreturn eNsFor;")();
  const keyRe = new Function(decl("const E_KEY_RE=") + "\nreturn E_KEY_RE;")();
  const mark = new Function(decl("const NS_ADOPTED=") + "\nreturn NS_ADOPTED;")();
  const dropped = new Function(decl("const NS_DROP_POSITIONAL=") + "\nreturn NS_DROP_POSITIONAL;")();
  const nsOf = new Function("eEmbeddedCatalog", "eNsFor", decl("const E_NS=") + "\nreturn E_NS;");
  const body = ["const NS_CARRY=", "const NS_DROP_POSITIONAL=", "function packWithoutPositional(",
                "function carryNsLayer(", "const NS_ADOPTED=", "function adoptNameNsLayer("]
                 .map(decl).join("\n") + "\nreturn adoptNameNsLayer();";
  const adopt = (catalog, store) => {
    const E_NS = nsOf(() => catalog, nsFor);
    const lsGet = k => (k in store) ? store[k] : null;
    const lsSet = (k, v) => { store[k] = String(v); return true; };
    const lsKeys = () => Object.keys(store);
    const nsKey = n => E_NS + n;
    const said = [];
    const took = new Function("eEmbeddedCatalog", "eNsFor", "E_NS", "lsGet", "lsSet", "lsKeys",
                              "nsGet", "nsKey", "t", "toast", "setTimeout", body)(
      () => catalog, nsFor, E_NS, lsGet, lsSet, lsKeys, n => lsGet(nsKey(n)), nsKey,
      s => s, s => said.push(s), fn => fn());
    return { took, said, ns: E_NS };
  };

  const NAMED = { name: "Lamp Shop" };
  const WITH_ID = { id: "lamp-shop", name: "Lamp Shop" };
  const SHARES_NAME = { id: "other-shop", name: "Lamp Shop" };
  const nameNs = nsOf(() => NAMED, nsFor), idNs = nsOf(() => WITH_ID, nsFor);
  const otherNs = nsOf(() => SHARES_NAME, nsFor);
  const FOUR = ["Pack", "CatOrder", "Cols", "Floor"];
  /* Both halves of a real pack: what is addressed by content travels, what is addressed by an
     intent's position is what the tag model now reads as a tag id, so it must not. */
  const OLD_PACK = JSON.stringify({ favourites: ["b:gen:One"], cardOrder: ["b:gen:One"],
    intentOverrides: { "i:2": { en: "theirs" } }, intentHidden: ["i:4"],
    intentFavourites: ["i:1"], intentRemoved: ["i:7"], baseCards: [{ id: "b:gen:One" }] });
  const seed = (store, ns, tag) => {
    store[ns + "Pack"] = OLD_PACK;
    store[ns + "CatOrder"] = '["' + tag + '"]';
    store[ns + "Cols"] = "3";
    store[ns + "Floor"] = "240";
    return store;
  };
  const layer = (store, ns) => FOUR.filter(n => store[ns + n] != null);

  const desk = seed({}, nameNs, "old");
  const first = adopt(WITH_ID, desk);
  eq("an id-bearing build finds the name-hash layer under its own namespace", layer(desk, idNs), FOUR);
  eq("and the columns and the floor arrive as they were", [desk[idNs + "Cols"], desk[idNs + "Floor"]], ["3", "240"]);
  eq("and the pack arrives with what is addressed by content",
     JSON.parse(desk[idNs + "Pack"]).favourites, ["b:gen:One"]);
  eq("and without one field addressed by an intent's position",
     dropped.filter(k => k in JSON.parse(desk[idNs + "Pack"])), []);
  eq("and the name-hash keys are still in place, for a build that still reads them",
     layer(desk, nameNs), FOUR);
  eq("and the desk is told once", first.said, ["Restored your cards and stars from an earlier build."]);
  eq("the marker is outside the shape every sweep of this engine's keys matches",
     keyRe.test(mark + nameNs), false);
  eq("and it is up", desk[mark + nameNs], "1");
  const snap = Object.keys(desk).sort().join("|");
  const again = adopt(WITH_ID, desk);
  eq("a second open adopts nothing", [again.took, again.said.length], [false, 0]);
  eq("and writes no key", Object.keys(desk).sort().join("|"), snap);

  /* A Clear deletes this namespace's own keys and nothing else - local-memory.js matches the
     CURRENT namespace by prefix - so the name-hash layer is still sitting there afterwards. */
  Object.keys(desk).filter(k => k.indexOf(idNs) === 0).forEach(k => { delete desk[k]; });
  const cleared = adopt(WITH_ID, desk);
  eq("after a Clear the layer the user cleared does not come back",
     [cleared.took, layer(desk, idNs).length], [false, 0]);

  const pair = seed({}, nameNs, "shared");
  adopt(WITH_ID, pair);
  adopt(SHARES_NAME, pair);
  eq("two ids one name: the first to open took the layer", layer(pair, idNs), FOUR);
  eq("two ids one name: the second finds the marker and stays empty", layer(pair, otherNs), []);

  const both = seed(seed({}, nameNs, "old"), idNs, "new");
  const kept = adopt(WITH_ID, both);
  eq("a namespace that already holds a layer keeps it", both[idNs + "CatOrder"], '["new"]');
  eq("and the name-hash layer is left where it is", both[nameNs + "CatOrder"], '["old"]');
  eq("and the marker goes up all the same, so a Clear cannot undo itself",
     [both[mark + nameNs], kept.took], ["1", false]);
  Object.keys(both).filter(k => k.indexOf(idNs) === 0).forEach(k => { delete both[k]; });
  eq("driven by that marker: after the Clear, nothing is adopted",
     [adopt(WITH_ID, both).took, layer(both, idNs).length], [false, 0]);

  const none = { editorDraft: "not ours" };
  adopt(WITH_ID, none);
  eq("with no name-hash layer to decide about, not even a marker is written",
     Object.keys(none), ["editorDraft"]);
  const noName = seed({}, nsFor("Lamp Shop"), "old");
  const noNameSnap = Object.keys(noName).sort().join("|");
  adopt({ name: "Lamp Shop" }, noName);
  eq("a build whose catalog carries no id is already in the name namespace and adopts nothing",
     Object.keys(noName).sort().join("|"), noNameSnap);
}

/* The Electron shell reads the catalog file itself and hands the payload to the page, so it is
   a SECOND reader of the format and nothing else in this harness looks at it. It spoke format 1
   for a day after the engine stopped, and the failure was silent: the shell printed a card count
   and the engine booted empty. */
function shellBridgeFns() {
  const src = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  const decls = ["function catalogPayload(", "function isV2("]
    .map(m => extractDecl(src, m)).join("\n");
  return new Function(decls + "\nreturn {catalogPayload,isV2};")();
}
function isSafeDeskIdFn() {
  const src = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  const pathMod = { basename: s => { const t = String(s); const i = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\")); return i < 0 ? t : t.slice(i + 1); } };
  const decls = ["const DESK_ID_RE =", "const DESK_ID_RESERVED =", "function isSafeDeskId("]
    .map(m => extractDecl(src, m)).join("\n");
  return new Function("path", decls + "\nreturn isSafeDeskId;")(pathMod);
}
function shellBridgeTests() {
  const S = shellBridgeFns();
  const V2 = { format: 2, kind: "etiuda-catalog", cards: [{ id: "c1", en: "one" }] };
  const V1 = { format: 1, kind: "playbook-catalog", cards: [{ id: "c1", en: "one" }] };
  const doc = JSON.stringify(V2);
  const took = (text) => { try { const r = S.catalogPayload(text); return S.isV2(r.data) ? r.data.cards.length : "refused-format"; }
                           catch (e) { return "refused-container"; } };

  eq("shell takes a .ec document", took(doc), 1);
  eq("shell takes the window.E_CATALOG script", took("window.E_CATALOG = " + doc + ";\n"), 1);
  eq("shell takes a BOM'd document", took("﻿" + doc), 1);
  eq("shell refuses format 1 JSON by format", took(JSON.stringify(V1)), "refused-format");
  const safe = isSafeDeskIdFn();
  eq("isSafeDeskId refuses a separator", safe("foo/bar"), false);
  eq("isSafeDeskId refuses a drive letter", safe("c:foo"), false);
  eq("isSafeDeskId refuses a NUL", safe("ab\0c"), false);
  eq("isSafeDeskId refuses a reserved device name", safe("con"), false);
  eq("isSafeDeskId accepts a minted id", safe("d" + "a".repeat(32)), true);
  eq("shell refuses the old PB_CATALOG script", took("window.PB_CATALOG = " + doc + ";\n"), "refused-container");
  eq("shell refuses an empty file", took("   "), "refused-container");
  /* The order of the two attempts, which is the only thing that can be got wrong quietly: a
     card whose body mentions the global name must not cut the document short. */
  const mentions = JSON.stringify({ format: 2, kind: "etiuda-catalog",
    cards: [{ id: "c1", en: "set window.E_CATALOG = something" }, { id: "c2", en: "two" }] });
  eq("shell parses a document that mentions the global", took(mentions), 2);
}

/* The shell's content security policy, in node. tests/csp.js drives the real thing in Electron
   and takes four seconds and a browser to do it; this is the half that can run in every suite:
   that the pin the build wrote is the artefact's own scripts, hashed here a second time by a
   different implementation, and that the policy the shell assembles from it still refuses what
   it is there to refuse. A pin that has drifted from the artefact is a window that will not
   start, and nothing but this says so before Electron is launched. */
function policyFns() {
  const src = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  return new Function(extractDecl(src, "function policyFor(") + "\nreturn {policyFor};")();
}
function policyTests() {
  const S = policyFns();
  const html = E.engineSource();
  /* A second implementation of the build's sum: its own regex over the artefact, its own
     hashing, and no import of tools/build.mjs, or the two would agree by construction. */
  const mine = [];
  const re = /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (/type\s*=\s*["']?application\/json/i.test(m[1])) continue;
    mine.push("'sha256-" + crypto.createHash("sha256").update(m[2], "utf8").digest("base64") + "'");
  }
  const pin = JSON.parse(fs.readFileSync(path.join(E.ROOT, "engine", "etiuda.csp.json"), "utf8"));
  eq("the pin says what it is", pin.kind + "/" + pin.schema, "etiuda-script-hashes/1");
  eq("the artefact holds two inline scripts, hashed here independently of the build", mine.length, 2);
  eq("the pin is those two hashes, in that order", pin.hashes.join(" "), mine.join(" "));

  const policy = S.policyFor(pin.hashes);
  const has = d => policy.split("; ").some(p => p === d || p.indexOf(d + " ") === 0);
  eq("default-src is none", has("default-src 'none'"), true);
  eq("script-src names the pinned hashes and nothing else",
    policy.split("; ").filter(p => p.indexOf("script-src") === 0).join(""), "script-src " + mine.join(" "));
  eq("no 'self' in the policy, so a sibling catalog script cannot run", /'self'/.test(policy), false);
  eq("no 'unsafe-eval' and no 'unsafe-inline' outside style-src",
    policy.replace(/style-src [^;]*/, "").indexOf("unsafe-"), -1);
  eq("the six directives are all there",
    ["default-src", "script-src", "style-src", "img-src", "base-uri", "form-action"].filter(has).length, 6);
  /* An unreadable pin must close the door rather than open it, and the refusal to name a
     permissive fallback is the whole of that promise. */
  eq("a policy built from the shell's own fallback runs no script at all",
    /script-src 'none'/.test(S.policyFor(["'none'"])), true);
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
  // The same reader section 4 uses, so this half cannot be looking at a file that one refused.
  const c = loadCatalog(CATALOG_PATH());
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
  "exported",     // a stamp of when the file was written - the importer has no use for it
  /* The shelf labels of every language past the primary. The whitelist DOES carry them and this
     check cannot see it: the key is derived from the catalog's own declared set (v2CatKey), so
     no literal `categoriesPl` survives in normaliseCatalog to be grepped for. Carried instead
     by langAgnosticTests, which drives the whitelist and reads the maps back - a stronger check
     than the substring it replaces, because it also covers the derived spelling. */
  "categoriesPl"
]);
function checkCatalogRoundTrip() {
  const src = sourceText();
  const exp = extractDecl(src, "function currentCatalog(");
  /* normaliseCatalog rather than parseCatalogFile since 2026-09-14: the whitelist moved there
     when parseCatalogFile became a format 2 reader, and the whitelist is what drops a field.
     The file boundary is a second pair, checked below. */
  const imp = extractDecl(src, "function normaliseCatalog(");
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
  const bothLoop = /cardStorageKeys\(/.test(exp2) && /cardStorageKeys\(/.test(imp2);
  /* THE FILE BOUNDARY, the third pair. catalogToV2 writes the envelope a catalog file carries
     and catalogFromV2 reads it; a key written by one and unread by the other is a field that
     leaves in an export and never comes back. isV2 and v2Problems count as readers: format,
     kind and hash are what they are for. `modified` is written and never read back on purpose,
     being a property of the export rather than of the catalog. */
  const FILE_ALLOW = new Set(["modified"]);
  const exp3 = extractDecl(src, "function catalogToV2(");
  const imp3 = extractDecl(src, "function catalogFromV2(") + extractDecl(src, "function isV2(")
             + extractDecl(src, "function v2Problems(");
  const at3 = exp3.indexOf("const out={");
  if (at3 < 0) throw new Error("catalogToV2 no longer builds `const out={`");
  let d3 = 0, e3 = at3;
  for (let i = exp3.indexOf("{", at3); i < exp3.length; i++) {
    if (exp3[i] === "{") d3++;
    else if (exp3[i] === "}") { d3--; if (!d3) { e3 = i; break; } }
  }
  const fileKeys = new Set();
  const keyRe3 = /[{,\n]\s*([A-Za-z_]\w*)\s*:/g;
  const lit3 = exp3.slice(at3, e3);
  while ((m = keyRe3.exec(lit3))) fileKeys.add(m[1]);
  const assignRe3 = /\bout\.([A-Za-z_]\w*)\s*=/g;
  while ((m = assignRe3.exec(exp3))) fileKeys.add(m[1]);
  const fileMissing = [...fileKeys].filter(f => !FILE_ALLOW.has(f) && imp3.indexOf("data." + f) < 0).sort();
  return { fields: written.size, missing: missing.sort(),
           cardFields: plain, cardMissing: cardMissing, bothLoop: bothLoop,
           fileFields: fileKeys.size, fileMissing: fileMissing };
}
/* ---- [3g/5] the three things the rename left standing -------------------------------------
   The PB_ to E_ pass of 2026-09-13 moved 158 names and deliberately did not move three, each
   for a different reason and each invisible to every other instrument here:

   THE TWO GLOBALS THAT ARRIVE FROM OUTSIDE. A catalog file on disk declares
   window.E_CATALOG and the sample declares window.E_SAMPLE. Both are written by files this
   engine does not own - by the converter in tools/catalog-v2, or by a desk - so renaming
   either end silently stops a catalog loading. The export wrapper and the importer's search
   for it are the same contract read the other way. They were PB_ until 2026-09-14; the clean
   break on the format took the old names with it, since nothing here reads format 1 at all.

   THE STORAGE PREFIX. E_NS answers "e" since D4, and the boot script's Reset filter matches
   the SHAPE that prefix makes, "e" plus a capital or "e<hash>~", because a one-letter prefix
   matched plainly would sweep a neighbouring file:// page's keys. Three things must agree: the
   prefix, the copy of the shape in storage.js, and the copy in the boot script, which imports
   nothing and so cannot share one. Disagreement loses either everything already saved or the
   ability to clear it, and neither shows as a failure: the app comes up empty and correct.
   The old keys are not swept, deliberately - a 1.x engine may still open the same origin.

   EVERY USER-VISIBLE STRING. A mechanical pass over identifiers has no business changing a
   sentence, and a whole-file census is the only thing that can say it did not. The digest is a
   RATCHET, like the comment budget above: it is expected to move when the interface's words
   move, and it is expected to move in a commit that says so.

   What this section is not: a claim that "e" is right. It is a claim that every place still
   agrees, so that a later move of the prefix moves them together or fails here. */
const UI_STRINGS_COUNT = 779;
const UI_STRINGS_SHA256 = "43c14deee0ac753970712bd4dea863a2545fdaf799c2c208b1201092ce4f71ef";

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

/** Every complete string literal naming a key of the pre-D4 regime. Comments are blank in the
 *  document this reads, so a "pb" written about rather than written is not one. */
function pbKeyLiterals(doc) {
  const out = [], re = /(["'])((?:__)?pb[A-Za-z0-9_~]*)\1/g;
  let m;
  while ((m = re.exec(doc))) out.push(m[2]);
  return out;
}

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
  holds("function eCatalog(", "window.E_CATALOG",
        "a catalog file declares window.E_CATALOG and this is where the engine reads it");
  holds("function exportCatalog(", '"window.E_CATALOG = "',
        "the wrapper this writes is what every reader of a format 2 catalog file parses");
  holds("function parseCatalogFile(", '"E_CATALOG"',
        "the importer finds the payload by that wrapper");
  holds("function sampleReady(", "typeof E_SAMPLE",
        "sample-catalog.js is published beside the engine and declares window.E_SAMPLE");
  holds("function loadSampleCatalog(", "E_SAMPLE",
        "the sample is read through the name its own file declares");

  /* The prefix is evaluated rather than matched, because what must agree is what the two
     sides COMPUTE: nsKey carries an identity ternary that a text search reads straight past. */
  let ns = null;
  try {
    ns = new Function("eEmbeddedCatalog",
      extractDecl(src, "function eNsFor(") + "\n"
      + extractDecl(src, "const E_NS=") + "\n"
      + extractDecl(src, "function nsKey(") + "\n"
      + "return { E_NS: E_NS, nsKey: nsKey };");
  } catch (e) { problems.push("the storage namespace no longer extracts: " + e.message); }
  let bare = null, named = null, withId = null;
  if (ns) {
    bare = ns(() => null);
    named = ns(() => ({ name: "a catalog with a name" }));
    withId = ns(() => ({ id: "lamp-shop", name: "Lamp Shop" }));
    const renamed = ns(() => ({ id: "lamp-shop", name: "Lamp Shop renamed" }));
    const otherId = ns(() => ({ id: "other-shop", name: "Lamp Shop" }));
    if (bare.E_NS !== "e")
      problems.push("E_NS answers " + JSON.stringify(bare.E_NS) + " with no catalog, wanted \"e\" - "
        + "D4 moved every stored key to that prefix and the boot migration copies the old ones under it");
    if (bare.nsKey("Cards") !== "e" + "Cards")
      problems.push("nsKey gives " + JSON.stringify(bare.nsKey("Cards")) + " with no catalog, wanted \"eCards\"");
    if (!/^e[0-9a-z]+~$/.test(named.E_NS))
      problems.push("E_NS answers " + JSON.stringify(named.E_NS) + " for a named catalog, which is not "
        + "\"e\" plus a base36 hash and a tilde, so no sweep built on the key shape would find its keys");
    /* Identity is the file's own id when present: a rename keeps the namespace, two ids
       under one name do not share one. A file with no id still hashes the name, above. */
    if (withId.E_NS !== renamed.E_NS)
      problems.push("E_NS for a renamed catalog carrying an id is " + JSON.stringify(renamed.E_NS)
        + " against the original " + JSON.stringify(withId.E_NS)
        + " - the id is the namespace, so a rename keeps it");
    if (withId.E_NS === otherId.E_NS)
      problems.push("E_NS for two catalogs with different ids and the same name is "
        + JSON.stringify(withId.E_NS) + ", wanted two namespaces");
    if (!/^e[0-9a-z]+~$/.test(withId.E_NS))
      problems.push("E_NS answers " + JSON.stringify(withId.E_NS) + " for a catalog with an id, which is not "
        + "\"e\" plus a base36 hash and a tilde");
  }
  /* The shape, in the two copies that cannot be one: the app's, and the boot script's, which is
     a separate <script> in the template and shares nothing with the app at all. Compared as
     text so a divergence is named, then RUN, so that agreeing on a wrong shape is still a
     failure. The foreign keys are the point of the exercise: on file:// they belong to
     somebody else's page, and a Reset that took them would be silent about it. */
  /* Read from the RAW source, because maskLiterals blanks a regex literal along with the
     comments: what is wanted here is the pattern itself. Each is anchored at its own site,
     so a shape written about somewhere cannot stand in for the shape being used. */
  const shapeOf = (re, text, why) => {
    const m = re.exec(text);
    if (!m) { problems.push(why); return null; }
    return m[1];
  };
  const raw = sourceText();
  const appShape = shapeOf(/const E_KEY_RE\s*=\s*(\/\^e(?:[^\/\n\\]|\\.)*\/)/, raw,
    "storage.js no longer declares E_KEY_RE as a key shape");
  const bootShape = shapeOf(/localStorage\.key\(i\)[\s\S]{0,120}?(\/\^e(?:[^\/\n\\]|\\.)*\/)\s*\.test\(k\)/,
    raw.slice(0, E.templateParts().head.length),
    "the boot script's Reset no longer filters localStorage by a key shape");
  if (appShape && bootShape && appShape !== bootShape)
    problems.push("Reset in the boot script matches " + bootShape + " and storage.js writes keys of shape "
      + appShape + " - one of the two has moved without the other");
  if (appShape && bootShape && bare) {
    const re = new RegExp(appShape.slice(1, -1));
    const mine = [bare.nsKey("Cards"), "eTheme", "eTourDone_v1", named.nsKey("Pack")]
      .concat(withId ? [withId.nsKey("Pack")] : []);
    const theirs = ["e", "etc", "editorDraft", "pbTheme", bare.nsKey("Cards").toLowerCase()];
    mine.filter(k => !re.test(k)).forEach(k => problems.push("the key shape " + appShape
      + " does not match " + JSON.stringify(k) + ", which this engine writes, so Reset would leave it behind"));
    theirs.filter(k => re.test(k)).forEach(k => problems.push("the key shape " + appShape + " matches "
      + JSON.stringify(k) + ", which is not this engine's - file:// pages share one storage area"));
  }
  /* THE OLD KEYS MUST NOT COME BACK. After D4 the only "pb" in src/ is the migration's own
     pattern, which is a regex and not a string, so no string literal in the engine names a
     pb key. Run against a doctored copy as well, because a rule that can only pass is not one. */
  const stale = [...new Set(pbKeyLiterals(src))].sort();
  if (stale.length)
    problems.push("src/ still writes " + stale.length + " key(s) of the old regime: " + stale.join(", ")
      + " - D4 moved every stored key to the \"e\" prefix, and the migration reads the old names by shape");
  const planted = pbKeyLiterals('lsSet("pbGhost","1"); lsGet(\'__pbprobe\');');
  if (planted.join(",") !== "pbGhost,__pbprobe")
    problems.push("the old-key rule no longer names a planted key (" + JSON.stringify(planted)
      + "), so its silence over src/ means nothing");

  const ui = uiStrings(src);
  if (ui.count !== UI_STRINGS_COUNT || ui.sha256 !== UI_STRINGS_SHA256)
    problems.push("the interface strings have moved: " + ui.count + " pairs, sha256 "
      + ui.sha256.slice(0, 16) + ", against " + UI_STRINGS_COUNT + " and " + UI_STRINGS_SHA256.slice(0, 16)
      + " - if the words changed on purpose, update UI_STRINGS_COUNT and UI_STRINGS_SHA256 in this "
      + "file in that commit; if they did not, something mechanical has rewritten what people read");
  return { problems: problems, ui: ui, prefix: bare ? bare.E_NS : "?", shape: appShape || "?" };
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
       the table, its flattening and the list itself - in that order, since each reads the one
       above it. The list is a `let` now: a catalog may bring its own phrases, and both readers
       have to move together when it does. */
    "const GREETINGS=",
    "function greetWordList(",
    "let GREET_WORDS=",
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
    "function langColumn(",
    "function intentFieldKey(",
    "function intentArr(",
    "const CARD_FIELD_KEY=",
    "const CARD_TEXT_FIELDS=",
    "const CARD_SHARED_FIELDS=",
    "function langColumn(",
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
    /* The affinity groups ask for one stop list per language now, because a catalog may
       bring its own for the languages it speaks. */
    "const AFFINITY_STOP=",
    "let CATALOG_STOP=",
    "function affinityStop(",
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
/* A CARD'S OWN ID WHERE IT HAS ONE. The derivation below is the format 1 scheme, and it is
   what a catalog with no ids gets; a format 2 file carries its own, and deriving over the top of
   it made the favourite cases in search-eval name cards the scorer could not recognise - one
   guard case regressed on a catalog whose text had not changed by a byte. */
function cardEvalId(m) { return (m && m.id) ? m.id : "b:" + (m && m.c) + ":" + (m && m.t); }

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

/* Spec 2.7 through lintCatalog: primary title and body stay errors; a declared non-primary
   language any card lacks is one awaiting finding, not one error per card. */
function lintCatalogTests() {
  const toy = () => ({
    format: 2, kind: "etiuda-catalog", id: "toy-shop", name: "Toy shop", rev: 1,
    langs: [{ code: "en", label: "EN" }, { code: "pl", label: "PL" }],
    tags: [{ id: "t-open", kind: "shelf", label: { en: "Open" } }],
    cards: [{ id: "c-hello", shelf: "t-open", bodyShape: "plain",
              title: { en: "Hello" }, body: { en: "Hello there." } }]
  });
  const enOnly = lintCatalog(toy());
  eq("lint a declared pl with no pl text is not an error", enOnly.errors, []);
  eq("and is one awaiting finding for pl, counting the cards that lack it",
     enOnly.awaiting, ["pl: 1 card(s) lacking text"]);
  /* BOARD 646, AND THIS IS THE LINT STUDIO CALLS. A catalog declaring neither founding code
     was refused by the engine's reader before it reached a rule here, so every rule below was
     written against a pair without anyone noticing. */
  const other = () => {
    const c = toy();
    c.langs = [{ code: "de", label: "DE" }, { code: "uk", label: "UK" }];
    c.tags[0].label = { de: "Offen" };
    c.cards[0].title = { de: "Hallo" };
    c.cards[0].body = { de: "Hallo da." };
    return c;
  };
  const off = lintCatalog(other());
  eq("646j lint a catalog declaring neither English nor Polish: no error, and the awaiting"
     + " finding names the language by its own code",
     [off.errors, off.awaiting], [[], ["uk: 1 card(s) lacking text"]]);
  const noPrimary = other();
  delete noPrimary.cards[0].body.de;
  eq("646k and a card with no body in ITS primary is still an error, named in that language"
     + " rather than in English - a format 2 file is refused by the reader first",
     [lintCatalog(noPrimary).errors,
      lintCatalog({ langs: [{ code: "de" }], cards: [{ "t:de": "Hallo" }] }).errors],
     [["card c-hello: no body in de, the primary language"],
      ['card 1 ("Hallo"): DE (body:de) is required']]);
  const filledUk = other();
  filledUk.cards[0].body.uk = "Pryvit.";
  eq("646l and filling it leaves nothing waiting",
     [lintCatalog(filledUk).errors.length, lintCatalog(filledUk).awaiting.length], [0, 0]);

  const noTitle = toy();
  delete noTitle.cards[0].title.en;
  eq("lint a card missing its primary title is still an error",
     lintCatalog(noTitle).errors.length, 1);
  const both = toy();
  both.cards[0].title.pl = "Witaj";
  both.cards[0].body.pl = "Dzien dobry.";
  const filled = lintCatalog(both);
  eq("lint both languages filled: no error and no awaiting",
     [filled.errors.length, filled.awaiting.length], [0, 0]);

  /* THE CASE THE WHOLE OF 505 IS FOR, and nothing pinned it, board item 511: a catalog that
     DECLARES one language. The legs above all declare two, so the list of declared codes could
     be hardcoded back to ["en", "pl"] - which is what it was before 505 and what the fallback
     for a missing langs list still is - and every one of them stayed green. This is the leg that
     goes red on that mutation, and it is the reader Maxim opens a one-language catalog in. */
  const solo = toy();
  solo.langs = [{ code: "en", label: "EN" }];
  const one = lintCatalog(solo);
  eq("lint a catalog declaring ONE language: no error and no awaiting at all",
     [one.errors.length, one.awaiting.length, one.awaiting.join("|")], [0, 0, ""]);

  /* AND THE BLOCK COUNTS, board item 511's other half. The rule compares the copies an alt card
     splits into, and it compared en against pl whatever the card carried, so a one-language card
     warned "1 EN blocks vs 0 PL blocks": the format 1 rule wearing the new format's clothes. A
     card with no text in that language has no second copy to diverge from. The pair below is the
     control: the same card WITH Polish of a different block count still warns, so this is a
     narrowing rather than the rule being switched off. */
  /* IN THE RUNTIME SHAPE, which is the only shape this rule can be reached in and was measured
     rather than assumed: handed the same card as format 2, the v2 validator errs first, "card
     c-hello (pl): 1 block(s) against 2 in en", and the warning below never runs. lintCatalog
     takes either - a format 2 file is mapped, anything else is already runtime - and Studio's
     importer, which classifies this finding by the substring "EN blocks vs", lints that shape.
     Written as a format 2 card at first, both arms answered 0 warnings and the control is what
     said so; a leg whose two arms agree has proved nothing. */
  const NL = String.fromCharCode(10);
  const altCard = pl => ({ langs: [{ code: "en", label: "EN" }, { code: "pl", label: "PL" }],
    cards: [{ t: "Hello", en: "First block." + NL + NL + "Second block.", pl: pl, alt: 1 }] });
  const blocksOf = r => r.warnings.filter(w => /blocks vs/.test(w));
  const altOne = lintCatalog(altCard(""));
  const altBoth = lintCatalog(altCard("Jeden blok."));
  eq("an alt card carrying no Polish is not a block-count warning, and one carrying Polish of"
     + " another length still is",
     [blocksOf(altOne).length, altOne.awaiting.join("|"), blocksOf(altBoth).length, blocksOf(altBoth)[0] || ""],
     [0, "pl: 1 card(s) lacking text", 1,
      'card 1 ("Hello"): 2 EN blocks vs 1 PL blocks - copies at the same index will diverge']);
}

/* BOARD 646: ANY SET OF DECLARED LANGUAGES, OF ANY SIZE AND ANY CODES.
 *
 * Maxim's ruling of 2026-09-21: the desk accepts a catalog declaring any set, including one
 * excluding English and Polish entirely, and a language the build has no grammar for is
 * carried rather than refused. The storage is open and the grammar is closed, and these legs
 * are what say the two have not been confused again.
 *
 * THE IDENTITY CONTROL IS THE HALF THAT MATTERS MOST: a catalog declaring the founding pair
 * must come through the derived-column path spelled exactly as it always was, or the change
 * has moved every desk.json on every desk.
 */
function langAgnosticTests() {
  const src = sourceText();
  const V = v2Fns();
  /* The two spellings of one rule, and they live in two files on purpose: catalog-v2.js
     imports nothing so the harness can slice it, so it writes the derived column out again.
     This is the leg that goes red the day they drift. */
  const K = new Function(extractDecl(src, "const CONTENT_LANGS=")
    + extractDecl(src, "function langColumn(")
    + extractDecl(src, "const CARD_FIELD_KEY=")
    + extractDecl(src, "function cardFieldKey(")
    + extractDecl(src, "const INTENT_FIELD_KEY=")
    + extractDecl(src, "function intentFieldKey(")
    + "\nreturn {cardFieldKey,intentFieldKey};")();
  const PAIRS = [["title", "t"], ["body", "body"], ["note", "note"]];
  const REQS = [["clause", "clause"], ["action", "cmt"], ["topic", "topic"]];
  const drift = [];
  ["de", "uk", "zxx", "qqq-x-invented"].forEach(code => {
    PAIRS.forEach(([fileField, runField]) => {
      const a = K.cardFieldKey(runField === "t" ? "t" : runField, code);
      const b = V.v2ColKey(V.CARD_KEY, fileField, code);
      if (a !== b || a !== runField + ":" + code) drift.push(fileField + "/" + code + " " + a + " vs " + b);
    });
    REQS.forEach(([fileField, runField]) => {
      const a = K.intentFieldKey(runField, code);
      const b = V.v2ColKey(V.REQ_KEY, fileField, code);
      if (a !== b || a !== runField + ":" + code) drift.push(fileField + "/" + code + " " + a + " vs " + b);
    });
  });
  eq("646a the derived column is one rule spelled twice, and the two spellings agree: the"
     + " runtime field name, a colon, the code", drift, []);
  eq("646b and the founding pair keeps its legacy spelling in both, which is what leaves an"
     + " existing desk.json valid",
     [K.cardFieldKey("t", "pl"), K.cardFieldKey("body", "en"), K.intentFieldKey("cmt", "pl"),
      V.v2ColKey(V.CARD_KEY, "title", "pl"), V.v2ColKey(V.REQ_KEY, "action", "pl")],
     ["tPl", "en", "cmtPl", "tPl", "cmtPl"]);

  /* An invented catalog carrying all seven language-keyed field kinds, written from nothing.
     `per` fills every declared code, so what comes back out says which kind was dropped. */
  const invent = codes => ({
    format: 2, kind: "etiuda-catalog", id: "probe-catalog", name: "Probe", rev: 3,
    langs: codes.map(c => ({ code: c, label: c.toUpperCase() })),
    commentLang: codes[0],
    tags: [{ id: "t-shelf", kind: "shelf", label: per(codes, "shelf") },
           { id: "t-req", kind: "request", clause: per(codes, "clause"),
             action: per(codes, "action"), topic: per(codes, "topic") }],
    cards: [{ id: "c-one", shelf: "t-shelf", bodyShape: "plain", requests: ["t-req"],
              title: per(codes, "title"), body: per(codes, "body"), note: per(codes, "note"),
              k: "kw" }],
    greet: perGreet(codes), stop: perStop(codes)
  });
  function per(codes, what) { const m = {}; codes.forEach(c => { m[c] = what + "-" + c; }); return m; }
  function perGreet(codes) { const m = {}; codes.forEach(c => { m[c] = ["m-" + c, "a-" + c, "e-" + c]; }); return m; }
  function perStop(codes) { const m = {}; codes.forEach(c => { m[c] = ["the-" + c]; }); return m; }

  /* SETS THIS BUILD REFUSED BEFORE THIS CHANGE, every one of them: a pair without Polish, a
     set of one, a set naming neither founding code, four at once, and a code nobody has heard
     of. The list is illustrations of the rule and not the rule - what is asserted is that
     EVERY set comes back whole. */
  const SETS = [["en", "pl"], ["en", "de"], ["de"], ["pl"], ["uk", "ru"],
                ["pl", "en", "de", "it"], ["zxx"], ["de", "en", "pl", "sv", "it", "uk", "ru", "es"]];
  const KINDS = ["title", "body", "note", "clause", "action", "topic", "shelf-label"];
  const carried = SETS.map(codes => {
    const cat = invent(codes);
    const problems = V.v2Problems(cat);
    if (problems.length) return codes.join(",") + " REFUSED: " + problems[0];
    const back = V.catalogToV2(V.catalogFromV2(cat));
    const t = back.tags.find(x => x.id === "t-shelf") || {};
    const r = back.tags.find(x => x.kind === "request") || {};
    const c = (back.cards || [])[0] || {};
    const lost = [];
    codes.forEach(code => {
      const got = [(c.title || {})[code], (c.body || {})[code], (c.note || {})[code],
                   (r.clause || {})[code], (r.action || {})[code], (r.topic || {})[code],
                   (t.label || {})[code]];
      KINDS.forEach((kind, i) => {
        const want = (kind === "shelf-label" ? "shelf" : kind) + "-" + code;
        if (got[i] !== want) lost.push(code + " " + kind);
      });
    });
    return codes.join(",") + " " + (codes.length * KINDS.length) + "/"
      + (codes.length * KINDS.length) + (lost.length ? " LOST " + lost.join(", ") : "");
  });
  eq("646c every declared language of every set comes back out whole, all seven language-keyed"
     + " field kinds, through the reader and the writer",
     carried,
     SETS.map(codes => codes.join(",") + " " + (codes.length * 7) + "/" + (codes.length * 7)));

  /* THE IDENTITY CONTROL. An en,pl catalog must hold exactly the legacy keys and no derived
     one: the day a `t:en` appears on a card, every desk's overrides have been orphaned. */
  const pairRuntime = V.catalogFromV2(invent(["en", "pl"]));
  eq("646d THE CONTROL: the founding pair's catalog carries the legacy keys and not one derived"
     + " column, so an existing desk's overrides still address the same fields",
     Object.keys(pairRuntime.cards[0]).sort().join(" "),
     "c en id intents k note notePl pl t tPl");

  /* The grammar is the closed half and it says so rather than pretending. */
  eq("646e a language the build has no grammar for is a NOTICE and not a problem with the"
     + " catalog, and the founding pair raises none",
     [V.v2Problems(invent(["en", "de"])).length, V.v2GrammarNotices(invent(["en", "de"])),
      V.v2GrammarNotices(invent(["en", "pl"]))],
     [0, ['langs: this build has no grammar for de, so its text is used as written - no'
          + ' vocative, no declension, and a joined list reads with the English "and"'], []]);
  const bad = codes => { const c = invent(["en"]); c.langs = codes.map(x => ({ code: x })); return V.v2Problems(c).filter(p => /^langs/.test(p)); };
  const notACode = s => "langs: " + JSON.stringify(s) + " is not usable as a language code,"
    + ' wanted a-z, then any hyphened parts of a-z and 0-9, as "en" or "pt-br"';
  eq("646f and a catalog that is actually malformed is still refused, told apart from the"
     + " notice above by the message alone",
     [bad(["en", "en"]), bad(["en", "a:b"]), bad(["en", "a b"]), bad([])],
     [["langs: en is declared twice"],
      [notACode("a:b")],
      [notACode("a b")],
      ["langs: absent, wanted the languages this catalog speaks, the first of them primary"]]);

  /* BOARD 696: THE DERIVED COLUMN IS A NAMING SCHEME, and what these legs assert is its
     criterion rather than a list of characters - no declared set may produce two columns for one
     language, a key that is not flat, or a name the catalog did not supply. The codes below are
     illustrations of that test; the day a new one slips through, the fault is in the shape rule
     and not in this list. */
  const acuteE = String.fromCharCode(0xe9), eThenAcute = "e" + String.fromCharCode(0x301);
  eq("696a a code that cannot be one flat column name is refused, whatever makes it so: case,"
     + " a separator, a letter spelled two ways, or a code too short to be a language at all",
     [bad(["en", "EN"]).length, bad(["en", "a.b"]).length, bad(["en", "a,b"]).length,
      bad(["en", "a/b"]).length, bad(["en", "a;b"]).length, bad(["en", acuteE]).length,
      bad(["en", eThenAcute]).length, bad(["en", "x"]).length, bad(["en", "toString"]).length,
      bad(["en", "-en"]).length, bad(["en", "en-"]).length],
     [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  eq("696b and it is a shape rather than a whitelist, so a region, a script and a private-use"
     + " tag are all codes and the founding pair is unmoved",
     [bad(["en", "pt-br"]), bad(["en", "zh-hant"]), bad(["en", "es-419"]),
      bad(["en", "qqq-x-invented"]), bad(["en", "pl"]), bad(["zxx"])],
     [[], [], [], [], [], []]);

  /* THE LOOKUP RATHER THAN THE VALIDATOR. The two tables are plain objects, so a bare read
     answers "toString" with an inherited function and would make that function the column name -
     the same key for the title, the body and the note of one language. */
  const borrowed = ["constructor", "toString", "hasOwnProperty", "valueOf", "__proto__"];
  eq("696c a code the tables do not name gets a DERIVED column and never one borrowed from the"
     + " table's prototype, so three fields of one language cannot land in one key",
     borrowed.map(c => [V.v2ColKey(V.CARD_KEY, "title", c), V.v2ColKey(V.CARD_KEY, "body", c),
                        V.v2ColKey(V.CARD_KEY, "note", c), V.v2CatKey(c, "en")].join(" ")),
     borrowed.map(c => "t:" + c + " body:" + c + " note:" + c + " categories:" + c));
  eq("696d and the runtime spelling agrees with it, which is 646a's rule holding for a name the"
     + " tables could have answered by accident",
     borrowed.map(c => [K.cardFieldKey("t", c), K.intentFieldKey("cmt", c)].join(" ")),
     borrowed.map(c => "t:" + c + " cmt:" + c));

  /* THE WHITELIST, which is a second reader and the one an Import goes through. It ran before
     setContentLangs, so it demanded `t` and `en` by name and refused every set without them -
     the defect the 649 commit found and left standing. Driven here on the runtime shape. */
  const WL = [
    "const CATS=", "const SW_EN=", "const SW_PL=", "const SW_CMT=", "const SW_CMT_PL=",
    "const SW_TOPIC=", "const SW_TOPIC_PL=", "const CONTENT_LANGS=", "const BUILT_IN_LANGS=",
    "function langColumn(", "function catalogLangs(", "const INTENT_TEXT_FIELDS=",
    "const INTENT_FIELD_KEY=", "function intentFieldKey(", "const SW_STORE=",
    "function intentStoreKeys(",
    "const CARD_FIELD_KEY=", "const CARD_TEXT_FIELDS=", "const CARD_PLAIN_FIELDS=",
    "const CARD_SHARED_FIELDS=", "const CARD_KEY_ALIAS=", "function cardFieldKey(",
    "function cardFieldKeys(", "function cardStorageKeys(", "function cardRequiredKeys(",
    "function truthyFlag(", "function isMacrosJsonKind(", "function parseMacrosData(",
    "function v2Str(", "const CAT_LABEL_KEY=", "function v2CatKey(",
    "function normaliseCatalog(",
  ].map(m => extractDecl(src, m)).join("\n");
  const whitelist = new Function("pack", "FACTS", "hueIsOffered", "normWhoList",
    WL + "\nreturn normaliseCatalog;")({ facts: null }, "facts", () => false, x => x);
  const runtimeOf = codes => V.catalogFromV2(invent(codes));
  const through = codes => whitelist(runtimeOf(codes));
  eq("646g the whitelist takes a catalog declaring no English at all, which it refused before"
     + " this - it asked the live language list before the catalog had set it",
     [through(["de"]).cards[0]["t:de"], through(["pl"]).cards[0].tPl,
      through(["uk", "ru"]).cards[0]["body:uk"]],
     ["title-de", "title-pl", "body-uk"]);
  eq("646h and it carries the shelf labels of every language past the primary, by the legacy"
     + " spelling for Polish and the derived one for the rest",
     [through(["en", "pl"]).categoriesPl["t-shelf"],
      through(["en", "de"])["categories:de"]["t-shelf"],
      through(["de", "en"])["categories:en"]["t-shelf"],
      through(["de", "en"]).categories["t-shelf"]],
     ["shelf-pl", "shelf-de", "shelf-en", "shelf-de"]);
  /* THE KEY ORDER IS A CONTRACT: a catalog's signature is a hash of this object's JSON, and a
     reshuffle asks every desk again whether to take the sibling it already has. */
  eq("646i and the intent block comes out of it in the order it has always had, for the"
     + " founding pair, which is what leaves every stored signature standing",
     Object.keys(through(["en", "pl"]).intents).join(" "),
     "en pl cat cmt topic topicPl cmtPl");
}

/* THE LIBRARY'S ROW AND THE LINTER COUNT ONE CLASS, board 505 node 6. The row's own counter is
   sliced out of src/ and driven over the very cards lintCatalog is handed, so a desk reading its
   Library and a lint of the same catalog cannot answer differently. Two mutations this goes red
   on: counting only the cards on screen (the put-away card below carries whitespace and is the
   third of three), and taking the declared languages as the built-in pair (the second leg
   declares one). */
function libraryAwaitingTests() {
  const src = sourceText();
  const live = new Function("CONTENT_LANGS", "cardFieldKey", "cards",
    extractDecl(src, "function liveAwaiting(") + "\nreturn liveAwaiting();");
  // The one row of CARD_FIELD_KEY this rule reads, supplied rather than sliced: what is under
  // test is the counting, and the table is pinned by the catalog round-trip legs already.
  const key = (field, l) => (field === "body" ? { en: "en", pl: "pl" }[l] : "") || "";
  const cards = [{ t: "A", en: "One.", pl: "Jeden." },
                 { t: "B", en: "Two." },
                 { t: "C", en: "Three.", pl: "   ", _hidden: 1 }];
  eq("the Library's awaiting count is the linter's, over every card the row counts",
     [live(["en", "pl"], key, cards), lintCatalog({ langs: [{ code: "en" }, { code: "pl" }], cards: cards }).awaiting],
     [[{ code: "pl", n: 2 }], ["pl: 2 card(s) lacking text"]]);
  eq("and a catalog declaring one language leaves the row nothing to say",
     [live(["en"], key, cards), lintCatalog({ langs: [{ code: "en" }], cards: cards }).awaiting],
     [[], []]);

  /* THE OTHER HALF OF THE SAME LIST. A row about a file in the folder is counted in the shell,
     off the file, and the row about the catalog in use is counted in the page, off the desk: one
     list, two implementations, and the rule is only kept by measuring them against each other and
     against the linter. Sliced out of shell/main.js the way shellBridgeTests slices the reader. */
  const shellSrc = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  /* The block counter is SUPPLIED, not sliced: what is under test here is the awaiting class, the
     macro count has legs of its own, and EC_MARKER cannot be sliced at all - extractDecl counts
     brackets, and that declaration is a regex whose brackets are escaped rather than paired. */
  const ecCounts = new Function("ecBlocks",
    extractDecl(shellSrc, "function ecCounts(") + "\nreturn ecCounts;")(() => 0);
  const file = { format: 2, kind: "etiuda-catalog", id: "toy-shop", name: "Toy shop", rev: 1,
    langs: [{ code: "en", label: "EN" }, { code: "pl", label: "PL" }],
    tags: [{ id: "t-open", kind: "shelf", label: { en: "Open" } }],
    cards: [{ id: "c-a", shelf: "t-open", bodyShape: "plain",
              title: { en: "A" }, body: { en: "One.", pl: "Jeden." } },
            { id: "c-b", shelf: "t-open", bodyShape: "plain",
              title: { en: "B" }, body: { en: "Two." } },
            { id: "c-c", shelf: "t-open", bodyShape: "plain",
              title: { en: "C" }, body: { en: "Three.", pl: "   " } }] };
  eq("the shell counts the same class off a file as the page counts off the desk",
     [ecCounts(file).awaiting, lintCatalog(file).awaiting],
     [[{ code: "pl", n: 2 }], ["pl: 2 card(s) lacking text"]]);
}

/* ---- catalog linter ----------------------------------------------------------------------- */
/* THE LINTER READS THE FILE THE ENGINE READS, AND THROUGH THE ENGINE'S OWN READER. Until
   2026-09-14 this ran the file as a script and took window.PB_CATALOG, which the engine had
   already stopped reading: the linter was the last thing in the tree that understood format 1,
   so a file the engine would refuse could pass a clean lint. What is sliced out of src/ here is
   the reader itself, so the two cannot drift; the rules below still read the runtime shape,
   which is what they were written for and what the join produces. */
let V2_READER = null;
function v2Reader() { return V2_READER || (V2_READER = v2Fns()); }
/* A payload the runtime can hold. A format 2 file is validated and mapped; anything else is
   already that shape, which is what Studio's importer lints and what the runtime-shape legs
   above hand in. */
function asRuntimeCatalog(c) {
  const V = v2Reader();
  if (!V.isV2(c)) return { cat: c, problems: [] };
  const problems = V.v2Problems(c);
  return { cat: problems.length ? c : V.catalogFromV2(c), problems };
}
function loadCatalog(file) {
  const text = fs.readFileSync(file, "utf8");
  // The byte order mark by its code point: this file stays typeable, and an invisible
  // character in a regex is a character nobody can see is missing.
  const raw = (text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text).trim();
  /* The container, taken the way parseCatalogFile takes it: a .ec document parses as it
     stands, and the wrapper is stripped only once that has failed. The order is the trap -
     searching for the name first cuts a file at a card that happens to mention it. */
  let data = null;
  try { data = JSON.parse(raw); }
  catch (e) {
    const at = raw.indexOf("E_CATALOG"), eq = at > -1 ? raw.indexOf("=", at) : -1;
    if (eq < 0) throw new Error("not a catalog document and no window.E_CATALOG in " + file);
    data = JSON.parse(raw.slice(eq + 1).trim().replace(/;\s*$/, ""));
  }
  if (!v2Reader().isV2(data)) throw new Error("not an Etiuda catalog (format 2): " + file);
  const r = asRuntimeCatalog(data);
  if (r.problems.length)
    throw new Error(r.problems[0] + (r.problems.length > 1 ? " (and " + (r.problems.length - 1) + " more)" : ""));
  return r.cat;
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
  // Mapped for the same reason lintCatalog maps: the counts below are of the runtime shape.
  if (c && typeof c === "object") c = asRuntimeCatalog(c).cat;
  const cards = (c && Array.isArray(c.cards)) ? c.cards.length : 0;
  const cats = (c && c.categories && typeof c.categories === "object") ? Object.keys(c.categories).length : 0;
  const intents = (c && c.intents && Array.isArray(c.intents.en)) ? c.intents.en.length : 0;
  /* The pair JSON-encoded, which is how this file already separates a category from a title
     twelve hundred lines below: no separator occurring inside either half can spoof a match,
     and unlike the raw NUL that lived there once it does not make git call the file binary. */
  const id = crypto.createHash("sha256")
    .update(JSON.stringify([String((c && c.name) == null ? "" : c.name), String((c && c.version) == null ? "" : c.version)]))
    .digest("hex").slice(0, 16);
  /* awaiting: one finding per declared non-primary language any card lacks; this count is
     of those findings, not of the cards named inside them. */
  const awaitingN = (r && Array.isArray(r.awaiting)) ? r.awaiting.length : 0;
  return "catalog " + id + " (sha256 of name+version, first 16 hex; the name itself is a"
    + " customer's and does not go in a log): " + cards + " cards, " + cats + " categories, "
    + intents + " intent(s) - " + r.errors.length + " error(s), " + r.warnings.length + " warning(s)"
    + ", " + awaitingN + " awaiting (one finding per absent language)";
}

/* THE ONLY PREPOSITION {INTENT} MAY FOLLOW IS {Z}. A Polish intent clause is written in the
   instrumental, which is the case z/ze governs, and {Z} is the token that alternates the two by
   what follows it. Any other preposition in front of the token governs a case the clause is not
   in; a hand-written z or ze is ungrammatical wherever the longer form is the right one. A
   {TOKEN} is never a bare word, so writing it the way the rule asks is what clears this. */
const PL_BARE_PREPOSITIONS = ["z", "ze", "o", "do", "na", "w", "we", "po", "przy", "przez",
  "od", "ode", "dla", "za", "u", "bez", "pod", "nad", "przed", "ku", "wobec", "obok"];
function plPrepositionsBeforeIntent(text) {
  const s = String(text == null ? "" : text), out = [];
  const re = /\{INTENT\}/g;
  let m;
  while ((m = re.exec(s))) {
    const w = (s.slice(0, m.index).match(/(\S+)\s+$/) || [])[1];
    if (!w || /[{}]/.test(w)) continue;
    const bare = w.toLowerCase().replace(/[^\p{L}]/gu, "");
    if (PL_BARE_PREPOSITIONS.indexOf(bare) > -1) out.push(bare);
  }
  return out;
}

/** Returns {errors, warnings, awaiting}. Errors are things the engine mishandles or that
 *  corrupt personal state (id collisions); warnings are things an author probably wants to
 *  know; awaiting is one finding per declared non-primary language any card lacks. */
function lintCatalog(c) {
  const errors = [], warnings = [], awaiting = [];
  const err = s => errors.push(s), warn = s => warnings.push(s);
  if (!c || typeof c !== "object") { err("catalog is not an object"); return { errors, warnings, awaiting }; }
  /* A format 2 payload is mapped before anything below reads it, so one linter serves the file
     and the runtime shape alike: a caller with a file in hand has the first, a caller holding a
     catalog the runtime has already read has the second. A file the ENGINE would refuse is
     reported as errors rather than linted, because every rule below would then describe a
     catalog nobody can load. */
  {
    const r = asRuntimeCatalog(c);
    if (r.problems.length) { r.problems.forEach(err); return { errors, warnings, awaiting }; }
    c = r.cat;
  }
  /* WHERE EVERY LANGUAGE-KEYED FIELD LIVES ON A RUNTIME CARD. The founding pair keeps its
     legacy spelling and every other code takes the derived column - the runtime field name, a
     colon, the code. Written out here rather than imported because this file is a harness the
     engine does not load; langColumn in content-model.js is the original and langAgnosticTests
     holds the two against each other. */
  const LEGACY = { t: { en: "t", pl: "tPl" }, body: { en: "en", pl: "pl" },
                   clause: { en: "en", pl: "pl" }, cmt: { en: "cmt", pl: "cmtPl" },
                   topic: { en: "topic", pl: "topicPl" } };
  const KEY = (field, code) => (LEGACY[field] || {})[code] || (field + ":" + code);
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
  const catLangs = (Array.isArray(c.langs) && c.langs.length)
    ? c.langs.map(l => String((l && l.code) || "")).filter(Boolean) : ["en", "pl"];
  catLangs.slice(1).forEach(code => {
    const name = code === "pl" ? "categoriesPl" : "categories:" + code;
    const map = c[name];
    if (map == null) return;
    if (typeof map !== "object" || Array.isArray(map)) {
      err(name + " must be an object keyed by category id");
      return;
    }
    Object.keys(map).forEach(k => {
      if (!cats[k]) err(name + ' names a category that does not exist: "' + k + '"');
      else if (typeof map[k] !== "string" || !map[k].trim())
        err(name + '["' + k + '"] is empty - drop the key instead');
    });
    const missing = catKeys.filter(k => !map[k]);
    if (missing.length && missing.length !== catKeys.length)
      warn(name + " covers " + (catKeys.length - missing.length) + " of " + catKeys.length
           + " categories; the rest fall back to " + catLangs[0].toUpperCase() + ": "
           + missing.join(", "));
  });

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
    const primaryClause = KEY("clause", (Array.isArray(c.langs) && c.langs.length
      && String((c.langs[0] || {}).code || "")) || "en");
    nIntents = Array.isArray(i[primaryClause]) ? i[primaryClause].length : 0;
    const columns = ["cat"];
    ((Array.isArray(c.langs) && c.langs.length)
      ? c.langs.map(l => String((l && l.code) || "")).filter(Boolean) : ["en", "pl"])
      .forEach(code => ["clause", "cmt", "topic"].forEach(f => {
        const k = KEY(f, code);
        if (k !== primaryClause && columns.indexOf(k) < 0) columns.push(k);
      }));
    columns.forEach(k => {
      const a = i[k];
      if (Array.isArray(a) && a.length !== nIntents)
        warn("intents." + k + " length " + a.length + " != intents." + primaryClause
          + " length " + nIntents
          + " (engine pads, but alignment is positional - check for a slipped row)");
    });
    /* One finding per intent that carries no clause in a language the catalog declares past
       the primary: it is invisible while that language is showing. Named by the code, because
       naming Polish was the pair talking. */
    ((Array.isArray(c.langs) && c.langs.length)
      ? c.langs.map(l => String((l && l.code) || "")).filter(Boolean).slice(1) : ["pl"])
      .forEach(code => {
        (i[KEY("clause", code)] || []).forEach((p, ix) => {
          if (!String(p == null ? "" : p).trim())
            warn("intent " + ix + ' ("' + ((i[primaryClause] || [])[ix] || "") + '") has no '
              + code.toUpperCase() + " clause - invisible in " + code.toUpperCase() + " mode");
        });
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
  /* langs[0] is primary (spec 2.7). A missing langs list is the historical en, pl pair, which
     is what the runtime columns are. The founding pair keeps its legacy spelling and every
     other code takes the derived column - the runtime field name, a colon, the code - which is
     langColumn in content-model.js and v2ColKey in catalog-v2.js. */
  const declared = (Array.isArray(c.langs) && c.langs.length)
    ? c.langs.map(l => String((l && l.code) || "")).filter(Boolean)
    : ["en", "pl"];
  const primary = declared[0] || "en";
  const BODY_OF = {}; declared.forEach(code => { BODY_OF[code] = KEY("body", code); });
  const lacking = Object.create(null);
  cards.forEach((m, ix) => {
    const title = m && m[KEY("t", primary)];
    const where = "card " + (ix + 1) + (title ? ' ("' + title + '")' : "");
    if (!m || typeof m !== "object") { err(where + ": not an object"); return; }
    if (!String(m[KEY("t", primary)] || "").trim())
      err(where + ": title (" + KEY("t", primary) + ") is required");
    if (!String(m[BODY_OF[primary]] || "").trim())
      err(where + ": " + primary.toUpperCase() + " (" + BODY_OF[primary] + ") is required");
    /* Spec 2.7: any language past the primary is optional; a card missing one speaks the
       primary instead. Counted here, reported once per language after the loop. */
    declared.forEach(code => {
      if (code === primary) return;
      const key = BODY_OF[code];
      if (!key) return;
      if (!String(m[key] || "").trim()) lacking[code] = (lacking[code] || 0) + 1;
    });
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
    /* By INDEX and never by title, unlike every other line here: this one fires on a catalog in
       daily use, whose content is its owner's to change, so the title would otherwise sit in
       every suite log from now until they change it. */
    const barePrep = plPrepositionsBeforeIntent(m.pl);
    if (barePrep.length)
      warn("card " + (ix + 1) + ': Polish body puts a bare "' + barePrep.join('", "')
        + '" in front of {INTENT}. The clause is in the instrumental, so the preposition is the'
        + " {Z} token, which alternates z and ze by what follows it");
    if (m.seq && !m.alt) warn(where + ": seq without alt does nothing (blocks only split when alt is set)");
    /* THE BLOCK COUNTS, AND ONLY WHERE THERE ARE TWO COPIES TO DIVERGE, spec 2.7 and board item
       511. This compared en against pl unconditionally, so a card carrying no Polish at all - the
       whole of what 505 made legal - warned "2 EN blocks vs 0 PL blocks", which is the format 1
       rule outliving its format one line below the place 505 fixed. A card missing a language
       speaks the primary whole; there is no second copy, nothing can diverge, and what is absent
       is the awaiting finding after the loop and not a warning here.
       THE WORDING IS LOAD-BEARING: Studio's importer classifies this finding by the substring
       "EN blocks vs" (src/studio.mjs), and for the en, pl pair these lines print exactly what they
       printed before. */
    if (m.alt) {
      const blocks = s => String(s || "").split(/\n\s*\n/).filter(x => x.trim()).length;
      const base = blocks(m[BODY_OF[primary] || "en"]);
      declared.forEach(code => {
        if (code === primary) return;
        const key = BODY_OF[code];
        if (!key || !String(m[key] || "").trim()) return;
        const n = blocks(m[key]);
        if (n !== base)
          warn(where + ": " + base + " " + primary.toUpperCase() + " blocks vs " + n + " "
            + code.toUpperCase() + " blocks - copies at the same index will diverge");
      });
    }
  });
  declared.forEach(code => {
    if (code === primary) return;
    const n = lacking[code] || 0;
    if (n) awaiting.push(code + ": " + n + " card(s) lacking text");
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
  return { errors, warnings, awaiting };
}

/* WHAT THE INSTALLER INCLUDE ACTUALLY DOES, board item 550, for leg 2e.
 *
 * The leg used to read three tokens out of shell/installer.nsh - the GUIINIT define,
 * UAC_IsInnerInstance and 0x408 - and call the skip proved. Four mutants of that file, each a
 * shipped regression, kept all three and stayed green on 2026-09-20: the press commented out (the
 * elevated copy shows the licence a second time), the condition inverted (no per-user install
 * shows the licence at all), the press moved out of its guard (no install shows it), and the
 * define struck out (the function is written and never called). A leg that reads source text
 * cannot see an ordering or a polarity, measured three times in this tree now.
 *
 * So this walks the include instead. A full-line comment is not code; the hook is whatever the
 * define names; the press is the SendMessage of 0x408 to $HWNDPARENT inside that function; and it
 * must sit under a positive test of UAC_IsInnerInstance and under nothing else. LogicLib's
 * negations are ${IfNot}, ${Unless} and the ${Else} of a positive test, so polarity is a stack
 * rather than a word. Returns { ok, why, presses, hook }.
 */
function readSkipHook(nsh) {
  const src = nsh.split(/\r?\n/).map(l => (/^\s*[#;]/.test(l) ? "" : l.trim()));
  const def = src.map(l => /^!define\s+MUI_CUSTOMFUNCTION_GUIINIT\s+(\S+)/.exec(l)).find(Boolean);
  if (!def) return { ok: false, why: "the include registers no MUI_CUSTOMFUNCTION_GUIINIT hook,"
    + " so nothing of it runs when the wizard starts", presses: 0, hook: null };
  const hook = def[1];
  const at = src.findIndex(l => new RegExp("^Function\\s+" + hook + "\\s*$", "i").test(l));
  if (at < 0) return { ok: false, why: "the GUIINIT hook is " + hook + ", which this file does"
    + " not define", presses: 0, hook: hook };
  const end = src.findIndex((l, i) => i > at && /^FunctionEnd\s*$/i.test(l));
  if (end < 0) return { ok: false, why: "Function " + hook + " is never closed", presses: 0, hook: hook };

  /* The polarity stack. Each frame remembers the condition as written and whether an ${Else} has
     turned it over, so a press is guarded by UAC_IsInnerInstance only where the one live frame
     tests it and is not negated. */
  const stack = [];
  const presses = [];
  const NEG = { IFNOT: 1, UNLESS: 1, ELSEIFNOT: 1 };
  for (let i = at + 1; i < end; i++) {
    const m = /^\$\{(If|IfNot|Unless|ElseIf|ElseIfNot|Else|EndIf|EndUnless)\}\s*(.*)$/i.exec(src[i]);
    if (m) {
      const word = m[1].toUpperCase();
      if (word === "ENDIF" || word === "ENDUNLESS") { stack.pop(); continue; }
      if (word === "ELSE") { if (stack.length) stack[stack.length - 1].negated = !stack[stack.length - 1].negated; continue; }
      const frame = { cond: m[2].trim(), negated: !!NEG[word] };
      if (word === "ELSEIF" || word === "ELSEIFNOT") { stack.pop(); }
      stack.push(frame);
      continue;
    }
    if (/^SendMessage\s+\$HWNDPARENT\s+0x408\b/i.test(src[i]))
      presses.push(stack.map(f => (f.negated ? "not " : "") + f.cond).join(" and "));
  }
  if (!presses.length) return { ok: false, why: "Function " + hook + " never presses the wizard's"
    + " next button (SendMessage $HWNDPARENT 0x408), so no page is consumed", presses: 0, hook: hook };
  const WANT = "${UAC_IsInnerInstance}";
  const wrong = presses.filter(p => p !== WANT);
  if (wrong.length) return { ok: false, why: "the press in " + hook + " is guarded by "
    + JSON.stringify(wrong[0] || "nothing at all") + " rather than by " + WANT
    + ", so the page it consumes is taken from the wrong run of the wizard", presses: presses.length,
    hook: hook };
  if (presses.length !== 1) return { ok: false, why: hook + " presses the next button "
    + presses.length + " times, which consumes " + presses.length + " pages", presses: presses.length,
    hook: hook };
  return { ok: true, why: "", presses: 1, hook: hook };
}

/* ---- main --------------------------------------------------------------------------------- */
if (require.main === module) {
  /* A COUNT RATHER THAN A FLAG, board item 550. The sections below set the verdict and the
     `#counts` line declared only the unit legs, so a tree without node_modules made section 2e
     throw and this gate handed the record `legs=265 failed=0` under RESULT: FAIL. Every site that
     used to set a boolean now raises this, and it is declared, so the count moves with the
     verdict. It stays truthy for every reader of `if (hardFail)`. */
  let hardFail = 0;
  /* The liveness twin: nothing in the result line witnessed the [2x/5] sections at all, so a run
     that died between two of them was indistinguishable from one that ran them. */
  let sections = 0;
  const section = label => { sections++; console.log("\n" + label); };
  const notRun = [];

  console.log("Etiuda test harness");
  console.log("  engine/etiuda.html sha256 " + E.sha256(ENGINE_PATH));
  console.log("  read as text from " + E.sourceDoc().files.join(", "));
  section("[1/5] unit tests (functions extracted from src/)");
  try { runUnitTests(); } catch (e) { FAIL++; console.error("  FAIL harness: " + e.message); }
  console.log("  " + PASS + " passed, " + FAIL + " failed");
  if (FAIL) hardFail++;

  section("[2/5] engine syntax check");
  let scripts = -1;
  try {
    scripts = checkEngineSyntax();
    console.log("  " + scripts + " inline script(s) parse cleanly");
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }

  section("[2b/5] the artefact is the splice of the source");
  try {
    const t = E.spliceTie();
    t.problems.forEach(x => console.error("  ERROR: " + x));
    if (t.problems.length) hardFail++;
    else console.log("  src/template.html reaches engine/etiuda.html verbatim; "
      + t.bundleBytes + " bytes of bundle over " + t.moduleFiles.length
      + " module file(s), in " + t.modules.length + " esbuild output part(s)");
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }

  section("[2c/5] the mark this app is stamped with");
  try {
    const ico = path.join(path.dirname(ENGINE_PATH), "..", "shell", "etiuda.ico");
    const got = crypto.createHash("sha256").update(fs.readFileSync(ico)).digest("hex");
    /* THE ICON IS BUILT WHERE THE MARK IS DRAWN AND COPIED HERE, so the only thing this tree can
       say about it is that the copy is still that build. A hash rather than a reading of the
       pixels: the other product that shares this mark reads its own icon pixel by pixel and takes
       this file as its control, so a second decoder here would be a second implementation of a
       claim nobody disputes. ETIUDA_ICON_SOURCE, where set, is the file it was copied from. */
    const want = "9e738d70894eb57b7a3808414c068d5e7d1caaa0ae11c40aae2302ec97cc5981";
    if (got !== want) { hardFail++;
      console.error("  ERROR: shell/etiuda.ico is sha256 " + got.slice(0, 16) + ", not the mark"
        + " this build ships (" + want.slice(0, 16) + ") - if the mark was rebuilt, move this hash"
        + " in that commit"); }
    else console.log("  shell/etiuda.ico is the mark as built, sha256 " + got.slice(0, 16)
      + ", " + fs.statSync(ico).size + " bytes");
    const from = process.env.ETIUDA_ICON_SOURCE || "";
    if (from && fs.existsSync(from)) {
      const src = crypto.createHash("sha256").update(fs.readFileSync(from)).digest("hex");
      if (src !== got) { hardFail++;
        console.error("  ERROR: the file it was copied from is sha256 " + src.slice(0, 16)
          + ", so one of the two has moved"); }
      else console.log("  and byte for byte the file it was copied from");
    }
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }

  section("[2d/5] the licence the installer shows");
  try {
    /* NOTHING IN THE PACKAGING CONFIG NAMES THESE FILES. electron-builder shows a licence page
       when its buildResources folder holds license_<lang>.<ext>, and its one option for naming a
       licence takes a single file, so the localised pair can only be found by name: a rename or a
       move drops the page with no error anywhere. The BOM is the other half - the build writes one
       into any file that lacks it, which leaves a dirty tree behind a release that wants a clean
       one. */
    const shell = path.join(__dirname, "..", "shell");
    const want = ["license_en.txt", "license_pl.txt"];
    const found = fs.readdirSync(shell)
      .filter(f => /^(license|eula)_[^.]+\.(txt|rtf|html)$/i.test(f)).sort();
    if (JSON.stringify(found) !== JSON.stringify(want)) { hardFail++;
      console.error("  ERROR: shell/ offers electron-builder [" + found.join(", ")
        + "] as licence pages, not [" + want.join(", ") + "]"); }
    else {
      const bad = [];
      const sizes = want.map(f => {
        const b = fs.readFileSync(path.join(shell, f));
        if (b[0] !== 0xef || b[1] !== 0xbb || b[2] !== 0xbf) bad.push(f + " has no BOM");
        if (b.includes(0x0d)) bad.push(f + " holds a CR");
        return f + " " + b.length + " bytes";
      });
      const cfg = fs.readFileSync(path.join(__dirname, "..", "electron-builder.js"), "utf8");
      if (!/buildResources:\s*"shell"/.test(cfg)) bad.push("buildResources is no longer shell/");
      bad.forEach(x => console.error("  ERROR: " + x));
      if (bad.length) hardFail++;
      else console.log("  the installer's licence page: " + sizes.join(", ")
        + ", both UTF-8 with a BOM, under buildResources");
    }
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }

  section("[2e/5] the licence page is shown once");
  try {
    /* THE ASSISTED INSTALLER RELAUNCHES ELEVATED for all-users. electron-builder puts the
       licence page before install-mode (assistedInstaller.nsh), so the inner copy starts the
       wizard on the licence again. The include cannot reorder those pages; it can skip the
       inner copy. This reads every page-inserting macro in that template, then the include,
       and builder-debug.yml when a package left one. */
    const root = path.join(__dirname, "..");
    const tplPath = path.join(root, "node_modules", "app-builder-lib", "templates", "nsis",
      "assistedInstaller.nsh");
    const nshPath = path.join(root, "shell", "installer.nsh");
    if (!fs.existsSync(tplPath)) throw new Error("assistedInstaller.nsh is not in app-builder-lib");
    const tpl = fs.readFileSync(tplPath, "utf8");
    const nsh = fs.readFileSync(nshPath, "utf8");
    /* Page shapes from the template itself: MUI_PAGE_* / MUI_UNPAGE_*, PAGE_*, and a
       name carrying Page except skip* (the PRE helper). !ifmacrodef counts only when
       the include, or electron-builder's licence macro, defines it. */
    const defined = Object.create(null);
    defined.licensePage = 1;
    nsh.split(/\r?\n/).forEach(line => {
      const m = line.trim().match(/^!macro\s+(\S+)/);
      if (m) defined[m[1]] = 1;
    });
    function isPageMacro(name) {
      if (/^MUI_PAGE_/.test(name) || /^MUI_UNPAGE_/.test(name) || /^PAGE_/.test(name))
        return true;
      return /Page/.test(name) && !/^skip/i.test(name);
    }
    const pages = [];
    const frames = [{ live: true }];
    function currentlyLive() {
      for (let i = 0; i < frames.length; i++) if (!frames[i].live) return false;
      return true;
    }
    tpl.split(/\r?\n/).forEach(line => {
      const t = line.trim();
      if (!t || t.charAt(0) === "#" || t.charAt(0) === ";") return;
      const ifmacro = t.match(/^!ifmacrodef\s+(\S+)/);
      if (ifmacro) { frames.push({ live: !!defined[ifmacro[1]] }); return; }
      if (/^!ifdef\b/.test(t) || /^!ifndef\b/.test(t) || /^!if\b/.test(t)) {
        frames.push({ live: true });
        return;
      }
      if (/^!else\b/.test(t)) {
        if (frames.length > 1) {
          let parentLive = true;
          for (let i = 0; i < frames.length - 1; i++) if (!frames[i].live) parentLive = false;
          frames[frames.length - 1].live = parentLive && !frames[frames.length - 1].live;
        }
        return;
      }
      if (/^!endif\b/.test(t)) {
        if (frames.length > 1) frames.pop();
        return;
      }
      if (!currentlyLive()) return;
      const ins = t.match(/^!insertmacro\s+(\S+)/);
      if (ins && isPageMacro(ins[1])) { pages.push(ins[1]); return; }
      if (/^(PageEx|Page|UninstPage)\b/i.test(t)) pages.push(t.split(/\s+/)[0]);
    });
    const licenseAt = pages.indexOf("licensePage");
    const modeAt = pages.indexOf("PAGE_INSTALL_MODE");
    const licenseBeforeMode = licenseAt >= 0 && modeAt >= 0 && licenseAt < modeAt;
    /* readSkipHook walks the include rather than reading tokens out of it; the four mutants that
       proved the token reading blind are named at its definition. */
    const skip = readSkipHook(nsh);
    const skipsInner = skip.ok;
    let debugPages = null;
    const dist = process.env.ETIUDA_DIST ? path.resolve(process.env.ETIUDA_DIST)
      : path.join(root, "dist");
    const debugFile = path.join(dist, "builder-debug.yml");
    if (fs.existsSync(debugFile)) {
      const debug = fs.readFileSync(debugFile, "utf8");
      if (!/!macro licensePage/.test(debug) || !/LicenseLangString MUILicense/.test(debug)
          || !/MUI_PAGE_LICENSE "\$\(MUILicense\)"/.test(debug))
        throw new Error("builder-debug.yml no longer carries Claudius's licence page macro");
      if (!/installer\.nsh/.test(debug) || !/!insertmacro customHeader/.test(debug))
        throw new Error("builder-debug.yml nsis.script no longer includes the skip hook");
      debugPages = "builder-debug.yml nsis.script";
    }
    const bad = [];
    if (licenseAt < 0) bad.push("assistedInstaller.nsh has no licence page");
    if (modeAt < 0) bad.push("assistedInstaller.nsh has no install-mode page");
    if (licenseAt > 0)
      bad.push("licence is not the first page (" + pages.join(", ")
        + "), so 0x408 skips the wrong page");
    if (licenseBeforeMode && !skipsInner)
      bad.push("licence page sits before install-mode (" + pages.join(", ")
        + ") and shell/installer.nsh does not skip it in the elevated inner copy: " + skip.why);
    bad.forEach(x => console.error("  ERROR: " + x));
    if (bad.length) hardFail++;
    else console.log("  page order " + pages.join(", ")
      + (licenseBeforeMode ? "; " + skip.hook + " presses next " + skip.presses
        + " time, under ${UAC_IsInnerInstance} and nothing else, so the elevated inner copy skips"
        + " the licence" : "; licence is not before install-mode")
      + (debugPages ? "; " + debugPages + " agrees" : ""));
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }

  section("[3/5] stacking invariants");
  try {
    const s = checkStacking();
    s.problems.forEach(p => console.error("  ERROR: " + p));
    if (s.problems.length) hardFail++;
    else console.log("  hit strip " + s.strip + " sits below the panel (peek "
      + s.peek + ", docked " + s.docked + ")");
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }
  try {
    const cc = checkCommentCeiling(sourceText());
    if (cc.over > 0) {
      hardFail++;
      console.error("  ERROR: " + cc.over + " more 7+ line comment(s) than the budget of "
        + COMMENT_ESSAY_BUDGET + " - trim one, or raise the budget deliberately. Longest:");
      cc.found.slice(0, 5).forEach(b => console.error("    " + b.n + " lines, " + sourceAtLine(b.line) + " - " + b.head));
    } else {
      console.log("  comment ceiling: " + cc.total + " blocks at 7+ lines, budget "
        + COMMENT_ESSAY_BUDGET + (cc.over < 0 ? " (LOWER the budget - " + (-cc.over) + " were pruned)" : ""));
    }
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }
  try {
    const u = checkDuplicateStrings(sourceText());
    u.problems.forEach(p => console.error("  ERROR: duplicate translation key - " + p));
    if (u.problems.length) hardFail++;
    else console.log("  no duplicate translation keys (" + u.keys + " strings)");
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }
  try {
    const g = checkGreetingsOnce(sourceText());
    g.problems.forEach(p => console.error("  ERROR: greeting vocabulary duplicated - " + p));
    if (g.problems.length) hardFail++;
    else console.log("  the greeting vocabulary lives once (" + g.phrases + " phrases)");
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }
  try {
    const d = checkDarkPalettes(engineSource());
    d.problems.forEach(p => console.error("  ERROR: dark palettes disagree - " + p));
    if (d.problems.length) hardFail++;
    else console.log("  the two dark palettes agree (" + d.tokens + " tokens)");
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }

  section("[3b/5] t() shadowing");
  try {
    const p = checkTShadow();
    p.forEach(x => console.error("  ERROR: " + x));
    if (p.length) hardFail++;
    else console.log("  no local shadows the translation function");
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }

  section("[3c/5] runtime attributes go through t()");
  try {
    const p = checkRawAttrs();
    p.forEach(x => console.error("  ERROR: " + x));
    if (p.length) hardFail++;
    else console.log("  no tooltip or placeholder is assigned raw English");
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }

  section("[3f/5] catalog export/import round trip");
  try {
    const r = checkCatalogRoundTrip();
    r.missing.forEach(f => console.error("  ERROR: export writes \"" + f
      + "\" and normaliseCatalog drops it - an imported catalog loses that field"));
    r.fileMissing.forEach(f => console.error("  ERROR: catalogToV2 writes \"" + f
      + "\" and catalogFromV2 never reads it - the field leaves and does not come back"));
    if (r.fileMissing.length) hardFail++;
    r.cardMissing.forEach(f => console.error("  ERROR: a card's \"" + f
      + "\" is exported and parseMacrosData never reads it - it is lost on import"));
    if (!r.bothLoop) console.error("  ERROR: export and import no longer walk the same card"
      + " translation table");
    if (r.missing.length || r.cardMissing.length || !r.bothLoop) hardFail++;
    else console.log("  all " + r.fields + " catalog field(s) and " + r.cardFields.length
      + " plain card field(s) survive an import, and all " + r.fileFields
      + " envelope field(s) survive the file");
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }
  section("[3g/5] the contracts a rename must not touch");
  try {
    const f = checkFrozenContracts();
    f.problems.forEach(x => console.error("  ERROR: " + x));
    if (f.problems.length) hardFail++;
    else console.log("  window.E_CATALOG and window.E_SAMPLE still read, storage namespaced "
      + JSON.stringify(f.prefix) + " and swept by " + f.shape + " in both copies, no key of the "
      + "old regime left in src/, " + f.ui.count + " interface strings at " + f.ui.sha256.slice(0, 16));
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }

  section("[3d/5] characters a keyboard cannot type");
  try {
    const p = checkTypeableChars();
    p.forEach(x => console.error("  ERROR: " + x));
    if (p.length) hardFail++;
    else console.log("  no untypeable character in the engine's interface"
      + (p.ran.catalog ? ", nor in anything a passenger receives" : "; the catalog half was NOT RUN"));
    if (!p.ran.catalog) notRun.push("3d's catalog half");
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }

  section("[3e/5] card list shapes");
  try {
    const p = checkColPlan();
    p.forEach(x => console.error("  ERROR: " + x));
    if (p.length) hardFail++;
    else console.log("  every list shape places every card, once, in the right column");
  } catch (e) { hardFail++; console.error("  FAIL: " + e.message); }

  section("[4/5] catalog lint (" + E.FIXTURE_FILE.catalogV2 + ")");
  let catalog = null;
  if (HAVE_FIXTURES) {
    try {
      const c = loadCatalog(CATALOG_PATH());
      catalog = c;
      const r = lintCatalog(c);
      r.warnings.forEach(w => console.warn("  warn:  " + w));
      (r.awaiting || []).forEach(a => console.log("  awaiting: " + a));
      r.errors.forEach(e => console.error("  ERROR: " + e));
      console.log("  " + catalogLintLine(c, r));
      if (r.errors.length) hardFail++;
    } catch (e) { hardFail++; console.error("  ERROR: " + e.message); }
  } else {
    notRun.push("4");
    console.log("  NOT RUN: ETIUDA_FIXTURES is unset, so no catalog was linted");
  }

  section("[5/5] search evaluation (" + E.FIXTURE_FILE.searchEval + ")");
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
      if (r.broken) { hardFail++; console.error("  " + r.broken + " case(s) name a card that does not exist"); }
      if (r.guardFails) { hardFail++; console.error("  " + r.guardFails + " guard case(s) regressed"); }
      if (!r.broken && !r.guardFails) console.log("  no broken cases, no guard regressions");
    } catch (e) { hardFail++; console.error("  ERROR: " + e.message); }
  }

  /* The RESULT line carries what was not run, because a verdict that leaves it to the reader to
     notice a NOT RUN twenty lines above is the shape of an early victory. */
  const left = notRun.length ? " - NOT RUN: " + notRun.join(", ") : "";
  /* WHAT A RUN OFF WINDOWS HAS NOT LOOKED AT, board items 613 and 629. This is the only gate of
     the `npm test` chain that gives a verdict a human reads, and since 629 that chain also runs
     on ubuntu-latest, where every Electron gate, the installer and every painted window are
     absent rather than passing. E.suiteVerdict says it for the two drivers that tally checks;
     this file tallies nothing, so it asks for the same lines from the same list. Nothing prints
     on Windows, where the `#counts` line and the RESULT line below are unchanged to the byte. */
  E.offWindowsNotice().forEach(l => console.log("  " + l));
  /* THE GATE'S OWN COUNTS, board item 529. This is the engine's largest suite and the record
     read it as 41 `lines`, which counts the times it printed something and not the times it
     checked something: the unit legs pass silently, so the number that matters never reached
     tools/gate-run.mjs at all. Declared here, before the RESULT line, because that runner takes
     a gate's last line as its verdict. `ok` and `fail` are the runner's reserved words - they
     mean checks in every gate's line - so the unit legs are `legs` and `failed`. */
  console.log("#counts legs=" + PASS + " failed=" + FAIL + " scripts=" + scripts
    + " notRun=" + notRun.length + " sections=" + sections + " sectionsFailed=" + hardFail);
  console.log((hardFail ? "\nRESULT: FAIL" : "\nRESULT: OK") + left);
  process.exit(hardFail ? 1 : 0);
}

module.exports = { lintCatalog, loadCatalog, catalogLintLine, checkEngineSyntax, checkStacking, checkTShadow, checkRawAttrs, checkTypeableChars,
                   searchFns, rankForQuery, runSearchEval };
