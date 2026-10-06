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
const COMMENT_ESSAY_BUDGET = 51;
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
  const table = extractDecl(src, "const VAR_GREETINGS=");
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
    /* A table's last pair ends `"` with no comma, and is read too (2026-10-04, as uiPairs): until
       then a key repeated on the table's last line was never compared. */
    const tail = t.endsWith('",') ? 2 : t.endsWith('"') ? 1 : 0;
    if (!tail || !t.startsWith('"')) return;
    const body = t.slice(1, -tail);
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
    "function catalogFileStem(",
    "function catalogNameOfFile(",
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
            agentParts,formatPaxName,catalogFileStem,catalogNameOfFile,catalogCardId,normWhoList,esc,
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
   ["szkoleniem", "ze"], ["szacunkiem", "z"],
   /* ze before the pronoun alone, not before every mn: "z mniejszym", "z mnóstwem"; ze before
      wz, as "ze wzorem"; and a quote or a bracket opening the clause is not what it meets */
   ["mnie", "ze"], ["mniejszym kosztem", "z"], ["mnóstwem", "z"],
   ["wzorem", "ze"], ["względu na to", "ze"], ["wyborem", "z"],
   ['"zmianą"', "ze"], ["(sprawą)", "ze"], ['"połączeniem"', "z"]
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

  /* EXPORT'S FILENAME IS THE LOADED FILE'S: the suggestion keeps its stem whole, capitals and
     diacritics included, and replaces only what Windows refuses in a filename. */
  eq("stem plain", F.catalogFileStem("Sample Chat"), "Sample Chat");
  eq("stem Polish", F.catalogFileStem("Zażółć"), "Zażółć");
  eq("stem refused characters", F.catalogFileStem('A/B: "C"?'), "A-B- -C--");
  eq("stem trailing dots", F.catalogFileStem("Catalog v2..."), "Catalog v2");
  eq("stem empty", F.catalogFileStem("  "), "Etiuda catalog");
  eq("name of file", F.catalogNameOfFile("Mirabelka spring.ec"), "Mirabelka spring");
  eq("name of file, other case", F.catalogNameOfFile("Zażółć.EC"), "Zażółć");
  eq("name of file keeps a dotted name", F.catalogNameOfFile("Build 3.08.2026.ec"), "Build 3.08.2026");

  /* A CARD ID IS AUTHORITATIVE WHEN IT EXISTS. The importer suffixes the second of two cards
     sharing a category and title; re-deriving hands both the first one's id, and activateCatalog
     then drops the second card's star, hide and position on every catalog load. */
  eq("cardId derives when absent", F.catalogCardId({c:"open",t:"Cold open"}), "b:open:Cold open");
  eq("cardId KEEPS an assigned id", F.catalogCardId({id:"b:open:Cold open~2",c:"open",t:"Cold open"}),
     "b:open:Cold open~2");
  eq("cardId falls back safely", F.catalogCardId({}), "b:open:Untitled");

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
  windowPlaceTests();
  shippedFileTests();
  railPlacementTests();
  recoveryTests();
  headPrefsTests();
  arrivalTests();
  markClockTests();
  fifthTests();
  emptyBandTests();
  menuWarmTests();
  ecTypeNameTests();
  pageWatchTests();
  recoveryWindowTests();
  shippedFlagTests();
  dismissTierTests();
  dialogFocusTests();
  activeStateTests();
  highContrastStateTests();
  pillWrapTests();
  pillsWidthWatchTests();
  pillsResizeCostTests();
  railLeaveTests();
  grownCardTests();
  motionJudgeTests();
  v2ValidationTests();
  formatPassTests();
  lintCatalogTests();
  langAgnosticTests();
  libraryAwaitingTests();
  libraryRowsTests();
  copyControlTests();
  copyNoticeTests();
  catalogLangTests();
  catalogIdentityTests();
  catalogNsTests();
  strandedAdoptionTests();
  langSegWiringTests();
  deskStatsTests();
  ejectUndoTests();
  tourActTests();
  emptyDeskTests();
  catNowTests();
  libraryHeadTests();
  lanePageKeyTests();
}

/* THE PAGE KEYS WHILE THE LANES SHOW: the document's keydown is sliced and run with the real page keys
   on a model of the two scrollers. Up, the lanes take the keys and the list keeps its place unseen; shut,
   the list takes them by the cards' own rule, and a caret in a field keeps Home and End. */
function lanePageKeyTests() {
  const src = f => fs.readFileSync(path.join(E.ROOT, "src", "modules", f), "utf8");
  const box = id => ({ id, scrollTop: 0, clientHeight: 600, scrollHeight: 5000,
    scrollBy(o) { this.scrollTop = Math.max(0, Math.min(this.scrollHeight - this.clientHeight, this.scrollTop + o.top)); } });
  const list = box("pageScroll"), lanesBox = box("lanes");
  const world = { open: false, active: null, listener: null };
  const doc = { getElementById: id => (id === "pageScroll" ? list : null), get activeElement() { return world.active; },
    body: {}, scrollingElement: null, documentElement: null };
  const off = () => false;
  const own = { document: doc, addEventListener: (k, fn) => { if (k === "keydown") world.listener = fn; },
    $: s => (s === "#lanes" ? lanesBox : null), scCaptureId: "", SC_DEFS: [], intentEl: null,
    tourActive: off, tourHasFocus: off, openCover: () => null, modalOpen: off, factsPanelOpen: off,
    eventMatchesAction: off, eHost: off, hooks: { runShortcut: off }, mgReduceMotion: off };
  Object.defineProperty(own, "lanesOn", { get: () => world.open });
  const scope = new Proxy({}, {
    has: (o, k) => typeof k === "string",
    get: (o, k) => k === Symbol.unscopables ? undefined : k in own ? own[k] : k in globalThis ? globalThis[k] : (() => { throw new ReferenceError(String(k) + " is not defined"); })(),
    set: (o, k, v) => { own[k] = v; return true; }
  });
  const decls = [["page-scroll.js", "function pageScroller("], ["page-scroll.js", "function pageKeyScroll("],
    ["keydown.js", "function typingInField("], ["keydown.js", "function wireGlobalKeydown("],
    ["lanes.js", "const lanesEl="], ["lanes.js", "function lanesOpen("], ["lanes.js", "function lanesPageScroller("]];
  let body = "";
  decls.forEach(d => { try { body += extractDecl(src(d[0]), d[1]) + "\n"; } catch (e) { /* a missing one shows as the keys' behaviour below */ } });
  try { new Function("scope", "with(scope){\n" + body + "wireGlobalKeydown();\n}")(scope); }
  catch (e) { eq("the keydown slice runs", e.message, "ran"); return; }
  if (!world.listener) { eq("the keydown slice registers its listener", "none", "registered"); return; }
  const press = key => { let held = false;
    world.listener({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, target: null, preventDefault() { held = true; } });
    return held; };
  const at = (open, active, listTop, lanesTop) => { world.open = open; world.active = active; list.scrollTop = listTop; lanesBox.scrollTop = lanesTop; };
  const field = { tagName: "INPUT", isContentEditable: false };

  at(true, null, 1000, 0);
  const pd = [press("PageDown"), lanesBox.scrollTop, list.scrollTop];
  press("PageUp");
  eq("with the lanes up, PageDown and PageUp scroll the lanes by the page and the list keeps its place",
    pd.concat([lanesBox.scrollTop, list.scrollTop]), [true, 540, 1000, 0, 1000]);
  at(true, null, 1000, 300);
  const end = [press("End"), lanesBox.scrollTop, list.scrollTop];
  press("Home");
  eq("with the lanes up, End and Home go to the foot and the top of the lanes, and the list keeps its place",
    end.concat([lanesBox.scrollTop, list.scrollTop]), [true, 4400, 1000, 0, 1000]);
  at(true, field, 1000, 300);
  eq("with the lanes up and a caret in a field, PageDown still scrolls the lanes, and Home is left to the field",
    [press("PageDown"), lanesBox.scrollTop, press("Home"), lanesBox.scrollTop, list.scrollTop], [true, 840, false, 840, 1000]);
  at(false, null, 1000, 300);
  eq("THE CONTROL: with the lanes shut, PageDown, End and Home scroll the list by the cards' rule and the lanes are not touched",
    [press("PageDown"), list.scrollTop, press("End"), list.scrollTop, press("Home"), list.scrollTop, lanesBox.scrollTop],
    [true, 1540, true, 4400, true, 0, 300]);
}

/* EJECT AND CLEAR HAPPEN AT ONCE AND IN PLACE, AND EACH UNDO PUTS BACK WHAT IT TOOK (Maxim, 2026-09-27
   and 2026-09-28): both acts, and both Undos, run in bare node over one storage model. Nothing
   reloads and nothing asks; the desk starts again in place once per act, and the round trip must
   put back every key the act took, byte for byte. With no session storage at all the Undo still
   stands, because what it gives back is held in memory. */
function ejectUndoTests() {
  const src = fs.readFileSync(path.join(E.ROOT, "src", "modules", "local-memory.js"), "utf8");
  const loose = extractDecl(fs.readFileSync(path.join(E.ROOT, "src", "modules", "catalog-file.js"), "utf8"), "const LOOSE_FIELDS=");
  const markers = ["function catalogKeep(", "const E_WIPE_KEEP=", "const SHARE_KEEP=", "const PACK_KEEP=", "const LAYER_KEEP=",
    "function packFileHalf(", "const E_PREF_KEYS=", "function eKeyIsPref(",
    "function eKeyIsMine(", "function keepKeys(", "function putBack(", "function clearLocalMemory(",
    "function ejectKeys(", "function ejectCatalog(", "function undoEject("];
  const OWN_PACK = JSON.stringify({ overrides: { c1: { t: "mine" } }, custom: [{ id: "u1" }], favourites: ["c1"], hidden: ["c2"],
    intentFavourites: ["i1"], intentHidden: ["i2"], intentKeys: "tag", editBases: { c1: "b" }, macroOrder: ["c1"], cardOrder: ["c1"] });
  const world = (ssOk, desk = true) => {
    const w = { ls: {}, ss: {}, restarts: 0, undo: null, said: null, reloads: 0 };
    const ns = k => "e" + k;
    const hooks = { flushPillState: () => {}, restartDesk: () => { w.restarts++; }, tourActive: () => false, endTour: () => {} };
    const ssGet = k => (ssOk && k in w.ss ? w.ss[k] : null);
    try {
      w.F = new Function("E_CATALOG_STORE", "E_CATALOG_KEY", "E_NS", "nsKey", "hooks", "flushStats", "clearTimeout", "tabSaveTimer",
        "saveTabSession", "ssGet", "ssSet", "ssDel", "TAB_KEY", "lsGet", "lsSet", "lsDel", "lsKeys", "eLayers",
        "eWatchGet", "eWatchClear", "eWatchPut", "offerUndo", "toastRefusal", "catalogStoreRefusal", "eDeskFileShown", "location", "eHasBranch",
        loose +"\n" + markers.map(m => extractDecl(src, m)).join("\n") + "\nreturn {ejectCatalog, clearLocalMemory};")(
        ns("Catalog"), ns("CatalogOk"), "e", ns, hooks, () => {}, () => {}, null, () => {},
        ssGet, (k, v) => { if (ssOk) w.ss[k] = String(v); }, k => { delete w.ss[k]; }, "eSessionTabs",
        k => (k in w.ls ? w.ls[k] : null), (k, v) => { w.ls[k] = String(v); return true; }, k => { delete w.ls[k]; },
        () => Object.keys(w.ls), () => ["eab12~"],
        () => Promise.resolve(null), () => Promise.resolve(), () => {},
        (said, fn) => { w.said = said; w.undo = fn; }, () => {}, () => "", () => "",
        { reload: () => { w.reloads++; } }, () => desk);
    } catch (e) { w.F = null; w.err = e.message; }
    w.ls = { eCatalog: "{\"cards\":[1]}", eCatalogOk: "sig", eSample: "1", eCatalogNo: "no", eCatalogFile: "shop.ec",
             eCatalogFileAt: "1700", eCatalogTrust: "valid", eCatalogFrom: "shop.ec", "eab12~Pack": OWN_PACK, ePack: "[\"loose\"]",
             "eab12~Stats": "{\"useCounts\":{\"c1\":4}}", "eab12~CatOrder": "[\"t2\",\"t1\"]", "eab12~LinksAside": "{}",
             "eab12~LooseId": "c-own", "eab12~SharedFile": "shop.ec", eLayers: "[\"eab12~\"]",
             eTheme: "dark", eAgent: "Ann", eCatalogFolder: "C:/cat", "e1zz~Pack": "a neighbour's", eTourDone_v3: "1" };
    w.ss = { eSessionTabs: "tabs-a" };
    return w;
  };
  const w = world(true);
  eq("local-memory.js carries the eject, the clear and their Undos", w.F ? true : w.err, true);
  if (!w.F) return;
  const sorted = m => JSON.stringify(Object.keys(m).sort().map(k => [k, m[k]]));
  const before = sorted(w.ls) + sorted(w.ss);
  w.F.ejectCatalog();
  eq("an eject asks nothing, reloads nothing and starts the desk again once, with the catalog and what names it gone"
    + " and every personal layer where it was",
    [w.reloads, w.restarts, ["eCatalog", "eCatalogOk", "eSample", "eCatalogNo", "eCatalogFile", "eCatalogFileAt", "eCatalogTrust", "eCatalogFrom"].filter(k => k in w.ls),
     w.ls["eab12~Pack"], w.ls.ePack, w.ls.eTheme, w.said], [0, 1, [], OWN_PACK, "[\"loose\"]", "dark", "Catalog ejected"]);
  if (w.undo) w.undo();
  eq("its Undo puts back every key the eject took and the conversations, byte for byte, and starts the desk again",
    [sorted(w.ls) + sorted(w.ss) === before, w.reloads, w.restarts], [true, 0, 2]);
  w.F.clearLocalMemory();
  eq("a clear forgets what lives only on this desk (the preferences, the counts, the orders, the asides, a pack with nothing a"
    + " file carries), keeps the catalog with what names it, the folder, a neighbour's keys, the name the desk's file is signed"
    + " with, the keys naming that file and the layer list, and starts the desk again once",
    [Object.keys(w.ls).sort(), w.reloads, w.restarts, w.said],
    [["e1zz~Pack", "eAgent", "eCatalog", "eCatalogFile", "eCatalogFileAt", "eCatalogFolder", "eCatalogFrom", "eCatalogNo", "eCatalogOk",
      "eCatalogTrust", "eLayers", "eSample", "eab12~LooseId", "eab12~Pack", "eab12~SharedFile"], 0, 3, "Local memory cleared"]);
  eq("and of a layer's pack it keeps what the desk's own file carries with the fields its ids are keyed by, and forgets the"
    + " stars and the hides (Maxim, 2026-10-05, 12c: only what is actually in the local memory)",
    JSON.parse(w.ls["eab12~Pack"] || "null"),
    { overrides: { c1: { t: "mine" } }, custom: [{ id: "u1" }], cardOrder: ["c1"], intentKeys: "tag", editBases: { c1: "b" }, macroOrder: ["c1"] });
  if (w.undo) w.undo();
  eq("its Undo puts back every key the clear took, byte for byte", [sorted(w.ls) + sorted(w.ss) === before, w.restarts], [true, 4]);
  const page = world(true, false);
  const pageBefore = sorted(page.ls) + sorted(page.ss);
  page.F.clearLocalMemory();
  eq("with no desk file (a browser), a clear forgets the own cards, edits and deletions with every layer's pack, the keys"
    + " naming a file, the name and the layer list, and keeps the catalog with what names it, the folder and a neighbour's keys"
    + " (12c: in a browser all of it is local memory)",
    [Object.keys(page.ls).sort(), page.restarts, page.said],
    [["e1zz~Pack", "eCatalog", "eCatalogFile", "eCatalogFileAt", "eCatalogFolder", "eCatalogFrom", "eCatalogNo", "eCatalogOk",
      "eCatalogTrust", "eSample"], 1, "Local memory cleared"]);
  if (page.undo) page.undo();
  eq("and its Undo puts every key back, byte for byte", sorted(page.ls) + sorted(page.ss) === pageBefore, true);
  const deaf = world(false);
  deaf.F.ejectCatalog();
  const took = !("eCatalog" in deaf.ls);
  if (deaf.undo) deaf.undo();
  eq("with no session storage the eject still happens at once and its Undo still loads the catalog back",
    [took, deaf.said, deaf.ls.eCatalog, deaf.reloads], [true, "Catalog ejected", "{\"cards\":[1]}", 0]);
}

/* THE TOUR'S WAYS ON (Maxim, 2026-09-28 22:20 and 22:22): Next on every step, held back only on the load
   step; only the name step asks for writing, and the steps that describe wait for no act; a step that opens
   a window moves on when the person opens it or when Next opens it for them; inside a window, Next closes it
   and moves on, and Back closes it and returns to the step that opens it. The step table and the functions
   that move the tour run in bare node inside one scope whose every free name is the page model below. */
function tourActTests() {
  const src = fs.readFileSync(path.join(E.ROOT, "src", "modules", "tour.js"), "utf8");
  const tpl = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
  const timers = [];
  /* The page: which window stands (`win`: the card editor, the Library or Settings), Quick facts, the Menu,
     and whether the controls a step presses are on screen. Each control opens what a person's click opens. */
  const page = { tourRunning: true, tourIdx: 0, target: {}, win: null, facts: false, menu: false, shown: true, moved: [], ends: [] };
  const control = (sel, open) => ({ matches: s => s === sel, getClientRects: () => (page.shown ? [{}] : []), click: open });
  const pencil = control('[data-act="edit"]', () => { page.win = "editor"; });
  const fab = control("#addCardFab", () => { page.win = "editor"; });
  const factsBtn = control("#factsBtn", () => { page.facts = true; });
  const rows = { manage: control('[data-act="manage"]', () => { page.menu = false; page.win = "library"; }),
    settings: control('[data-act="settings"]', () => { page.menu = false; page.win = "settings"; }) };
  const next = { hidden: false, disabled: false, textContent: "" };
  const own = {
    t: s => s, chordChips: () => "K", tourEls: () => ({ next }), resolveTourTarget: () => page.target,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: id => { if (id && timers[id - 1]) timers[id - 1].live = false; },
    showTourStep: i => { page.tourIdx = i; page.moved.push(T.TOUR_STEPS[i].id); }, endTour: done => { page.ends.push(done); },
    cardBtn: sel => (sel === '[data-act="edit"]' ? pencil : {}), $: sel => ({ "#addCardFab": fab, "#factsBtn": factsBtn, "#tourName": { value: "" } })[sel],
    menuOpen: () => page.menu, openSettingsMenu: () => { page.menu = true; },
    menuTarget: act => (page.menu ? rows[act] || {} : {}),
    modalOpen: () => !!page.win, closeModal: () => { page.win = null; },
    factsPanelOpen: () => page.facts, closeFactsPanel: () => { page.facts = false; },
    cardEditorOpen: () => page.win === "editor", libraryOpen: () => page.win === "library", settingsOpen: () => page.win === "settings",
    agentName: () => "", wholeThingEmpty: () => page.empty
  };
  const scope = new Proxy({}, {
    has: (o, k) => typeof k === "string",
    get: (o, k) => k === Symbol.unscopables ? undefined : k in own ? own[k] : k in page ? page[k]
      : k in globalThis ? globalThis[k] : () => undefined,
    set: (o, k, v) => { page[k] = v; return true; }
  });
  let T = null;
  try {
    T = new Function("scope", "with(scope){\n" + ["function tourPress(", "function tourPressRow(", "function shutTourWindow(",
      "function loadStepBody(", "const TOUR_STEPS=", "function stepOn(", "function onFrom(", "function nextHeld(", "function syncTourNext(",
      "const TOUR_ACT_MS=", "let tourActT=", "function tourActSoon(", "function tourActCheck(", "function tourFollowWindow(",
      "function tourNext(", "function tourOn(", "function tourPrev("]
      .map(m => extractDecl(src, m)).join("\n")
      + "\nreturn {TOUR_STEPS, nextHeld, syncTourNext, tourActSoon, TOUR_ACT_MS, tourNext, tourPrev};\n}")(scope);
  } catch (e) { T = null; eq("tour.js carries the step table and the functions that move the tour", e.message, "sliced"); }
  eq("the step counter is gone from the bubble and from the code that wrote it",
    [/tourStepLabel/.test(tpl), /tourStepLabel|Tour \{N\}/.test(src)], [false, false]);
  if (!T) return;
  const ids = T.TOUR_STEPS.map(s => s.id), at = id => ids.indexOf(id);
  const fire = () => { const live = timers.filter(x => x.live); timers.forEach(x => { x.live = false; }); live.forEach(x => x.fn()); return live.map(x => x.ms); };
  const reset = (id, state) => { Object.assign(page, { win: null, facts: false, menu: false, shown: true, empty: false, moved: [], ends: [] }, state || {}); page.tourIdx = at(id); };
  const where = () => ids[page.tourIdx] + (page.win ? " [" + page.win + "]" : "") + (page.facts ? " [facts]" : "") + (page.menu ? " [menu]" : "");

  const held = () => ids.filter((id, i) => { page.tourIdx = i; next.disabled = false; T.syncTourNext(); return next.disabled || next.hidden; });
  page.target = {};
  const heldOn = held();
  page.target = null;
  const heldOff = held();
  page.target = {};
  eq("Next stands on every step and is held back only on the load step, while its control is on screen",
    [heldOn, heldOff], [["load"], []]);

  /* The table's shape: the favourite, put-away and edit steps are one step that opens the editor, and the only
     steps that wait on the person are the load, the Menu (`done`) and the ones that open or stand in a window. */
  const waitsOn = s => !!(s.waits || s.done || s.opens || s.inside);
  eq("the steps are the table's, one card step for the star, the eye and the pencil, and every step between the name and the"
     + " window steps only describes, waiting for no act",
    [ids.join(","), T.TOUR_STEPS.filter(s => s.name).map(s => s.id), T.TOUR_STEPS.filter(s => !waitsOn(s) && !s.name).map(s => s.id),
     T.TOUR_STEPS.filter(s => "does" in s).map(s => s.id)],
    ["name,load,pax,search,rail,cards,pills,tabs,seg,buttons,editor,add,addIn,facts,factsIn,theme,menu,library,libraryIn,settings,settingsIn,done",
     ["name"], ["pax", "search", "rail", "cards", "pills", "tabs", "seg", "theme", "done"], []]);

  /* The person's act: on a step that describes, nothing they do moves the tour; the Menu step moves on once the
     Menu is open; a step that opens a window follows the window in. Each read once the act settles. */
  reset("rail"); T.tourActSoon(); const settled = fire();
  const stayed = where();
  reset("menu", { menu: true }); T.tourActSoon(); fire();
  const menuTo = where();
  reset("facts", { facts: true }); T.tourActSoon(); fire();
  const factsTo = where();
  eq("an act moves on only the steps that wait for one, read once it settles: the Menu opened, a window opened",
    [settled, stayed, menuTo, factsTo], [[350], "rail", "library [menu]", "factsIn [facts]"]);

  /* Next on each step that opens something: it opens it for the person and the tour goes in with it. */
  const opened = ["buttons", "add", "facts", "menu", "library", "settings"].map(id => { reset(id); T.tourNext(); return id + ">" + where(); });
  eq("Next on a step that opens a window opens it and goes inside, and on the Menu step opens the Menu for the Library step",
    opened, ["buttons>editor [editor]", "add>addIn [editor]", "facts>factsIn [facts]", "menu>library [menu]", "library>libraryIn [library]", "settings>settingsIn [settings]"]);
  const hidden = ["buttons", "add", "facts"].map(id => { reset(id, { shown: false }); T.tourNext(); return id + ">" + where(); });
  eq("and where its control is not on screen Next opens nothing and moves on past the window's own step",
    hidden, ["buttons>add", "add>facts", "facts>theme"]);

  /* Inside a window: Next closes it and moves on; Back closes it and returns to the step that opens it. */
  const inWin = { editor: { win: "editor" }, addIn: { win: "editor" }, factsIn: { facts: true }, libraryIn: { win: "library" }, settingsIn: { win: "settings" } };
  const nexts = Object.keys(inWin).map(id => { reset(id, inWin[id]); T.tourNext(); return id + ">" + where(); });
  const backs = Object.keys(inWin).map(id => { reset(id, inWin[id]); T.tourPrev(); return id + "<" + where(); });
  eq("inside a window Next closes it and moves on, and Back closes it and returns to the step that opens it",
    [nexts, backs], [["editor>add", "addIn>facts", "factsIn>theme", "libraryIn>settings", "settingsIn>done"],
      ["editor<buttons", "addIn<add", "factsIn<facts", "libraryIn<library", "settingsIn<settings"]]);

  /* The load step: Next does nothing while the desk is empty and its control stands, and Finish ends the tour done. */
  reset("load", { empty: true }); T.tourNext();
  const loadNext = where();
  reset("done"); T.tourNext();
  eq("Next on the load step does nothing while it is held back, and on the last step it ends the tour as done",
    [loadNext, page.ends], ["load", [true]]);

  /* THE SMOKE WALKS THIS TOUR, not a remembered one. tests/tour-walk.js says which way the walk takes on each step,
     and the smoke takes it; this holds its rows to the table above: the same ids in order, Next pressed only where
     the table does not hold it back, the same window opened by the same step, an act only where a step waits for
     one, and a way out of every window. Its teeth are five doctored tables, each of which must be named. */
  const TW = require("./tour-walk.js");
  const clone = () => T.TOUR_STEPS.map(x => Object.assign({}, x));
  const doctor = fn => { const st = clone(); fn(st); return TW.planProblems(st, s => !!s.waits, T.TOUR_ACT_MS); };
  const named = (probs, id) => probs.some(x => x.indexOf(id) === 0 || x.indexOf("order") === 0 && x.indexOf(id) > -1);
  const teeth = [
    named(doctor(st => { delete st.find(x => x.id === "facts").opens; }), "facts"),
    named(doctor(st => { st.splice(st.findIndex(x => x.id === "done"), 0, { id: "extra", sel: "#x", title: "", body: "" }); }), "extra"),
    named(doctor(st => { st.find(x => x.id === "menu").waits = true; }), "menu"),
    named(doctor(st => { const a = st.findIndex(x => x.id === "menu"), b = st[a - 1]; st[a - 1] = st[a]; st[a] = b; }), "menu"),
    named(doctor(st => { delete st.find(x => x.id === "libraryIn").inside; }), "libraryIn")
  ];
  eq("the smoke's walk of the tour has one row per step of the table, in its order, and takes a way each step offers",
    [TW.planProblems(T.TOUR_STEPS, T.nextHeld, T.TOUR_ACT_MS), teeth], [[], [true, true, true, true, true]]);

  /* EVERY WORD THE TOUR SHOWS IS IN THE POLISH TABLE, on every host it can meet: a function that composes its own key
     must hit on each t() it makes, and a string it returns bare must itself be a key, as showTourStep reads both. */
  const langSrc = fs.readFileSync(path.join(E.ROOT, "src", "modules", "ui-lang.js"), "utf8");
  const plAt = langSrc.indexOf("UI_STRINGS.pl={"), plEnd = langSrc.indexOf("\n};", plAt);
  const PL = new Function("const UI_STRINGS={};\n" + langSrc.slice(plAt, plEnd + 3) + "\nreturn UI_STRINGS.pl;")();
  const untranslated = [];
  [[true, "X", true], [true, "X", false], [false, "", true]].forEach(([host, dir, wheel]) => {
    Object.assign(own, { eHost: () => host, eCatalogFolderShort: () => dir, wheelShown: () => wheel, esc: s => s });
    T.TOUR_STEPS.forEach(s => ["title", "body"].forEach(k => {
      let calls = 0, missed = 0;
      own.t = x => { calls++; if (PL[x] == null) { missed++; return x; } return PL[x]; };
      const out = typeof s[k] === "function" ? s[k]() : s[k];
      if (calls ? missed : PL[out] == null) untranslated.push(s.id + "." + k + (host ? "" : " (browser)"));
    }));
  });
  own.t = s => s;
  eq("every title and body of the tour reads Polish, on the desk and in a browser, with and without the wheel",
    [...new Set(untranslated)], []);
  /* WHERE THE TOUR SAYS A PERSON'S THINGS STAY is where they stay on that host, in both languages: the desk keeps
     them on this computer and a browser in itself, so no step names the other host's place. */
  const misplaced = [], factsSays = [];
  [[true, "X", true], [true, "X", false], [false, "", true]].forEach(([host, dir, wheel]) => {
    Object.assign(own, { eHost: () => host, eCatalogFolderShort: () => dir, wheelShown: () => wheel, esc: s => s });
    const other = host ? /this browser|przegl/i : /this computer|komputer/i, mine = host ? /this computer|komputer/i : /this browser|przegl/i;
    [x => x, x => PL[x] == null ? x : PL[x]].forEach((tr, pl) => {
      own.t = tr;
      T.TOUR_STEPS.forEach(s => {
        const out = typeof s.body === "function" ? s.body() : tr(s.body);
        if (other.test(out)) misplaced.push(s.id + (pl ? " pl" : " en") + (host ? "" : " (browser)"));
        if (s.id === "factsIn") factsSays.push(mine.test(out));
      });
    });
  });
  own.t = s => s;
  eq("the tour names where a person's things stay as the host keeps them: the Quick facts step on each host and language, and no step the other host's place",
    [misplaced, factsSays], [[], [true, true, true, true, true, true]]);
  /* THE LOAD STEP NAMES NO SAMPLE BUTTON, because the empty desk draws none: asked on a desk, where the step once
     named one, in both languages. */
  Object.assign(own, { eHost: () => true, eCatalogFolderShort: () => "X", esc: s => s });
  const loadStep = T.TOUR_STEPS.find(s => s.id === "load");
  const loadSays = [x => x, x => PL[x] == null ? x : PL[x]].map(tr => { own.t = tr; return typeof loadStep.body === "function" ? loadStep.body() : ""; });
  own.t = s => s;
  eq("the tour's load step names Load and no sample button, on the desk, in English and in Polish",
    loadSays.map(b => /Load a catalog|wczytaj katalog/.test(b) && !/sample|przyk/i.test(b)), [true, true]);
}

/* THE EMPTY DESK OFFERS LOAD AND NO SAMPLE BUTTON: the sample is a file, and Load reaches it (Maxim,
   2026-09-28). The empty-desk markup is sliced out of render.js and drawn over a model of each host, in
   both languages. */
function emptyDeskTests() {
  const src = fs.readFileSync(path.join(E.ROOT, "src", "modules", "render.js"), "utf8");
  const langSrc = fs.readFileSync(path.join(E.ROOT, "src", "modules", "ui-lang.js"), "utf8");
  const plAt = langSrc.indexOf("UI_STRINGS.pl={"), plEnd = langSrc.indexOf("\n};", plAt);
  const PL = new Function("const UI_STRINGS={};\n" + langSrc.slice(plAt, plEnd + 3) + "\nreturn UI_STRINGS.pl;")();
  const own = { terms: [], list: { innerHTML: "" }, wholeThingEmpty: () => true, esc: s => String(s), E_CATALOG_SCRIPT: "etiuda-catalog.js" };
  const scope = new Proxy({}, {
    has: (o, k) => typeof k === "string",
    get: (o, k) => k === Symbol.unscopables ? undefined : k in own ? own[k] : k in globalThis ? globalThis[k] : () => undefined,
    set: (o, k, v) => { own[k] = v; return true; }
  });
  let draw = null;
  try {
    draw = new Function("scope", "with(scope){\n" + extractDecl(src, "const afterBtn=") + "\n"
      + extractDecl(src, "list.innerHTML=terms.length") + "\nreturn list.innerHTML;\n}");
  } catch (e) { eq("render.js carries the empty desk's markup", e.message, "sliced"); return; }
  const hosts = { desk: ["C:/X", "https:"], disk: ["", "file:"], link: ["", "https:"] };
  const wrong = [];
  Object.keys(hosts).forEach(h => ["en", "pl"].forEach(lang => {
    Object.assign(own, { eCatalogFolder: () => hosts[h][0], eCatalogFolderShort: () => "X", location: { protocol: hosts[h][1] },
      t: lang === "pl" ? x => (PL[x] == null ? x : PL[x]) : x => x });
    let p;
    try { p = draw(scope); } catch (e) { p = "threw " + e.message; }
    if (!/id="emptyLoad"/.test(p) || /emptySample|sample|przyk/i.test(p)) wrong.push(h + " " + lang);
  }));
  eq("the empty desk offers Load and no sample button on the desk, from a disk and over a link, in English and in Polish",
    wrong, []);
}

/* THE TOP BAR NAMES THE LOADED CATALOG'S FILE, extension and all. Maxim, 2026-09-28 17:06: "It's additional
   information for the user, so they recognize the file later on when they see it among their files." paintCatNow
   runs over a model of the bar and of what each load route recorded. */
function catNowTests() {
  const src = fs.readFileSync(path.join(E.ROOT, "src", "modules", "catalog-offer.js"), "utf8");
  const fileSrc = fs.readFileSync(path.join(E.ROOT, "src", "modules", "catalog-file.js"), "utf8");
  const el = cls => ({ cls, hidden: true, textContent: "", attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  let paint = null, importText = null;
  const world = { ns: {}, held: null, applied: false, opts: null };
  try {
    paint = new Function("document", "storedCatalog", "nsGet", "eLoadedCatalogFile", "markCut", "t", "catalogLoaded",
      extractDecl(fileSrc, "function catalogFileName(") + "\n" + extractDecl(src, "function paintCatNow(") + "\nreturn paintCatNow;");
    importText = new Function("catalogFromFileText", "hooks", "eWatchClear", "activateCatalog",
      extractDecl(fileSrc, "function importCatalogText(") + "\nreturn importCatalogText;")(
      () => ({ name: "Invented shop" }), { offerPickedCatalog: (c, name, accept) => accept() },
      () => ({ then: fn => fn() }), (c, opts) => { world.opts = opts; return true; });
  } catch (e) { eq("catalog-offer.js carries the top bar's painter", e.message, "sliced"); return; }
  const bar = (ns, held, applied, file) => {
    const own = el("cn-name"), none = el("cn-none");
    const doc = { getElementById: id => (id === "catNow" ? { querySelector: s => (s === ".cn-name" ? own : none) } : null) };
    paint(doc, () => held, k => (k in ns ? ns[k] : null), () => file, () => {}, s => s, () => applied)();
    return own.hidden ? (none.hidden ? "" : "none: " + none.textContent) : own.textContent;
  };
  const held = { name: "Invented shop", cards: [1] };
  /* The held catalog carries a name, the one field the bar must never show. */
  eq("the top bar shows the file the catalog was loaded from, wherever it lay, and never a name inside it: with no file named it is unnamed",
    [bar({ CatalogFrom: "sample-catalog.ec", CatalogFile: "sample-catalog.ec" }, held, true, "sample-catalog.ec"),
     bar({ CatalogFrom: "Spring team.ec", CatalogFile: "" }, held, true, ""),
     bar({ CatalogFile: "team.ec" }, held, true, "team.ec"),
     bar({ CatalogFrom: "", CatalogFile: "" }, held, true, ""),
     bar({ CatalogFrom: "", CatalogFile: "" }, null, true, ""),
     bar({}, null, false, "")],
    ["sample-catalog.ec", "Spring team.ec", "team.ec", "none: Unnamed catalog", "none: Unnamed catalog", "none: No catalog loaded"]);
  importText("{}", "Spring team.ec");
  eq("a catalog loaded through the file dialog records the file's name for the bar", (world.opts || {}).from, "Spring team.ec");

  /* AND activateCatalog, which every route ends in, writes what the route named: run whole in a scope whose every
     other free name is a no-op, over a store that takes the catalog. */
  const ns = {};
  const own = { storeCatalog: () => true, pack: {}, carryCardLayer: () => new Set(), catalogCardId: m => m.id, LAYER_KEYS: [],
    hooks: { restartDesk() {}, flushPillState() {} },
    nsSet: (k, v) => { ns[k] = v; }, nsDel: k => { delete ns[k]; }, nsGet: k => (k in ns ? ns[k] : null) };
  const scope = new Proxy({}, {
    has: (o, k) => typeof k === "string",
    get: (o, k) => k === Symbol.unscopables ? undefined : k in own ? own[k] : k in globalThis ? globalThis[k] : () => undefined,
    set: (o, k, v) => { own[k] = v; return true; }
  });
  let activate = null;
  try { activate = new Function("scope", "with(scope){\n" + extractDecl(fileSrc, "function activateCatalog(") + "\n"
      + extractDecl(fileSrc, "function takeCatalog(") + "\nreturn activateCatalog;\n}")(scope); }
  catch (e) { eq("catalog-file.js carries activateCatalog", e.message, "sliced"); return; }
  const wrote = opts => { ns.CatalogFrom = "stale.ec"; activate({ cards: [] }, opts); return ns.CatalogFrom; };
  eq("activateCatalog records the file a route names, its folder file where that is all it names, and blanks it for a route that names none",
    [wrote({ from: "Spring team.ec" }), wrote({ file: "team.ec" }), wrote({})],
    ["Spring team.ec", "team.ec", ""]);
}

/* THE LIBRARY'S HEADING NAMES THE FILE THE TOP BAR NAMES, never the name a stored copy still carries inside it, as
   a desk's store written before the name left the format does. The dialog's call is sliced out of manage.js and run
   in a scope where every free name it might read answers with that stored copy, name and all. */
function libraryHeadTests() {
  const src = fs.readFileSync(path.join(E.ROOT, "src", "modules", "manage.js"), "utf8");
  const fileSrc = fs.readFileSync(path.join(E.ROOT, "src", "modules", "catalog-file.js"), "utf8");
  const held = { name: "Invented shop", id: "invented-shop", cards: [1] };
  const anyHeld = () => held;
  Object.defineProperty(anyHeld, "name", { value: held.name });
  const marker = 'openDialog({\n    title: "Library",';
  const ns = {}, world = { file: "", opts: null };
  const own = { storedCatalog: () => held, catalogLoaded: () => true, nsGet: k => (k in ns ? ns[k] : null),
    eLoadedCatalogFile: () => world.file, openDialog: o => { world.opts = o; } };
  /* A read through the global object is a read of the same scope, the way a page's window is its globals: without
     this, `globalThis` resolved to Node's own and `window` to a bare function, so a guarded read such as
     `(window.storedCatalog && window.storedCatalog()).name` found nothing and fell back to the file, green (board 817).
     `top`, `parent`, `frames` and `document.defaultView` are the same object in a page, so they answer the same (a guarded
     read through `top` or `document.defaultView` stayed green in the lead engineer's read, 2026-09-29). */
  own.window = own.globalThis = own.self = own.top = own.parent = own.frames = new Proxy({}, { get: (o, k) => scope[k], has: () => true });
  own.document = new Proxy(anyHeld, { get: (o, k) => k === "defaultView" ? own.window : o[k] });
  const scope = new Proxy({}, {
    has: (o, k) => typeof k === "string",
    get: (o, k) => k === Symbol.unscopables ? undefined : k in own ? own[k] : k in globalThis ? globalThis[k] : anyHeld,
    set: (o, k, v) => { own[k] = v; return true; }
  });
  let open = null;
  try {
    if (src.split(marker).length !== 2) throw new Error("the Library's openDialog call is not there exactly once");
    open = new Function("scope", "with(scope){\n" + extractDecl(fileSrc, "function catalogFileName(") + "\n"
      + "return () => { " + extractDecl(src, marker) + " };\n}")(scope);
  } catch (e) { eq("manage.js carries the Library's dialog call", e.message, "sliced"); return; }
  const head = (from, file) => {
    Object.keys(ns).forEach(k => { delete ns[k]; });
    if (from != null) ns.CatalogFrom = from;
    world.file = file; world.opts = null;
    try { open(); } catch (e) { return "threw " + e.message; }
    const n = world.opts && world.opts.name;
    return typeof n === "function" ? n() : n;
  };
  eq("the Library's heading names the file the catalog was loaded from, as the top bar does, and never the name a stored copy carries inside it",
    [head("team.ec", "team.ec"), head("Spring team.ec", ""), head(null, "team.ec"), head("", "")],
    ["team.ec", "Spring team.ec", "team.ec", ""]);
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
    "const V2_SHA_RE=", "function v2Missing(", "function v2FlagProblem(", "function v2NextProblems(",
    "function v2HeaderProblems(", "function v2VarProblems(", "function v2Problems(",
    /* CARD_FLAGS is spelled out to its first member: card-fields.js declares the same name
       and comes first in the source document, so the bare marker slices the wrong one. */
    "const V2_CARD_NAMED=", "const V2_HEAD_NAMED=", "function v2Copy(", "function v2Put(",
    "function v2Extra(", "function v2Restore(",
    "const CARD_KEY=", "const REQ_KEY=", "const V2_RUNTIME_FIELD=", "function v2ColKey(",
    "const CAT_LABEL_KEY=", "function v2CatKey(",
    "const V2_GRAMMAR_LANGS=", "function v2GrammarNotices(",
    'const CARD_FLAGS=["firstOnly"',
    "function v2Mark(", "function v2Unmark(", "function v2AltLabel(", "function v2PartText(",
    "function catalogToV2(",
    "function catalogFromV2(",
  ].map(m => extractDecl(src, m)).join("\n");
  return new Function(decls + "\nreturn {isV2,v2Problems,v2GrammarNotices,v2ContentHash,v2SignedBytes,v2Canonical,catalogToV2,catalogFromV2,v2Unmark,v2Mark,v2AltLabel,v2PartText,v2ColKey,v2CatKey,CARD_KEY,REQ_KEY};")();
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
  /* A BLANK LINE TYPED AFTER A LABELLED MARKER. The desk splits a body on blank lines (parts() in
     card-model.js), so a label left on a block of its own became an alternative with no text. */
  const gapped = base();
  gapped.cards[0].bodyShape = "alts";
  gapped.cards[0].body.en = "[alt: by post]\n\nOne.\n\n[alt: by phone]\n  \n\nTwo.";
  eq("v2 a blank line after a labelled alternative has nothing to report", V.v2Problems(gapped), []);
  const loadedGap = V.catalogFromV2(gapped).cards[0].en;
  const deskParts = loadedGap.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  eq("and the desk reads two labelled alternatives, each with its text",
     [deskParts.map(V.v2PartText), deskParts.map(V.v2AltLabel)], [["One.", "Two."], ["by post", "by phone"]]);
  {
    const shellSrc = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
    const markerLine = shellSrc.split("\n").filter(l => l.indexOf("const EC_MARKER =") === 0);
    const ecBlocks = markerLine.length === 1
      ? new Function(markerLine[0] + "\n" + extractDecl(shellSrc, "function ecBlocks(") + "\nreturn ecBlocks;")()
      : null;
    eq("and the Library's count off the file agrees with the desk's",
       ecBlocks ? [ecBlocks(gapped.cards[0].body.en, "alts"), deskParts.length] : "no one EC_MARKER line in shell/main.js",
       [2, 2]);
  }
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

/* THE FORMAT PASS (board 834): the card fields retired, next and commits, the header fields notes,
   grew and desk, and a field this build does not name, which is carried whole. Each rule gives its
   line, and the carrying is held by a round trip over one file that holds every one of them. */
function formatPassTests() {
  const V = v2Fns();
  const HEX = c => c.repeat(64);
  const sound = () => ({
    format: 2, kind: "etiuda-catalog", id: "toy-shop", rev: 3,
    langs: [{ code: "en", label: "EN" }, { code: "pl", label: "PL" }],
    tags: [{ id: "t-open", kind: "shelf", label: { en: "Open" } }],
    cards: [{ id: "c-one", shelf: "t-open", bodyShape: "plain", title: { en: "One" }, body: { en: "One." } },
            { id: "c-two", shelf: "t-open", bodyShape: "plain", title: { en: "Two" }, body: { en: "Two." } }]
  });
  const bent = f => { const c = sound(); f(c); return V.v2Problems(c); };
  const first = f => (bent(f)[0] || "none");
  const rich = () => Object.assign(sound(), {
    notes: { en: "A note.", pl: "Uwaga." },
    grew: { id: "toy-shop", rev: 2, sha: "sha256:" + HEX("a") },
    desk: { id: "k-0123456789abcdef", name: "Ala", key: HEX("b"), box: HEX("c") },
    futureHeader: { list: [1, 2], text: "kept" }
  });
  const full = () => {
    const c = rich();
    Object.assign(c.cards[0], { retired: true, commits: true, next: [{ to: "c-two", label: "later" }],
      futureCard: { a: [1, { b: 2 }] } });
    return c;
  };
  const NOT_TABLE = "notes: not a table of text by language";

  eq("834a a catalog holding every new field has nothing to report", V.v2Problems(full()), []);
  eq("834b a catalog holding none of them has nothing to report", V.v2Problems(sound()), []);

  // The card rules.
  eq("834c retired: false is named, since the flag is true or absent",
     first(c => { c.cards[0].retired = false; }), "card c-one: retired is false, wanted true or absent");
  eq("834d retired: anything but true is named, null and a word among them",
     [null, "yes", 1].map(v => first(c => { c.cards[0].retired = v; })),
     ["null", "\"yes\"", "1"].map(v => "card c-one: retired is " + v + ", wanted true or absent"));
  eq("834e commits: false is named", first(c => { c.cards[1].commits = false; }),
     "card c-two: commits is false, wanted true or absent");
  eq("834f next: a value that is not a list is named",
     first(c => { c.cards[0].next = "c-two"; }), "card c-one: next is not a list");
  eq("834g next: an entry with no usable to is named",
     [{}, "c-two", { to: 7 }, null].map(e => first(c => { c.cards[0].next = [e]; })),
     [1, 2, 3, 4].map(() => "card c-one: next[0] is not an entry with a to"));
  eq("834h next: a card the file does not hold is named, and a link to a card LATER in the file is not one",
     [first(c => { c.cards[0].next = [{ to: "c-gone" }]; }),
      bent(c => { c.cards[0].next = [{ to: "c-two" }]; })],
     ["card c-one: next[0] names c-gone, which is no card", []]);
  eq("834i next: the card itself is named", first(c => { c.cards[0].next = [{ to: "c-one" }]; }),
     "card c-one: next[0] names the card itself");
  eq("834j next: a card named twice is named once, at the second entry",
     bent(c => { c.cards[0].next = [{ to: "c-two" }, { to: "c-two" }]; }),
     ["card c-one: next[1] names c-two a second time"]);
  eq("834k next: a name an object inherits is no card",
     first(c => { c.cards[0].next = [{ to: "constructor" }]; }),
     "card c-one: next[0] names constructor, which is no card");

  // The header rules.
  eq("834l notes: a value that is not a table is named",
     [null, "text", ["a"]].map(v => first(c => { c.notes = v; })), [NOT_TABLE, NOT_TABLE, NOT_TABLE]);
  eq("834m notes: a language the catalog does not declare, and a value that is not text, are named",
     [first(c => { c.notes = { sv: "Hej" }; }), first(c => { c.notes = { en: 3 }; })],
     ["notes.sv: a language this catalog does not declare", "notes.en: not text"]);
  eq("834n grew: each part is named when it is wrong, and so is a value that is no entry",
     [first(c => { c.grew = { id: "A", rev: 1, sha: "sha256:" + HEX("a") }; }),
      first(c => { c.grew = { id: "toy-shop", rev: "1", sha: "sha256:" + HEX("a") }; }),
      first(c => { c.grew = { id: "toy-shop", rev: 1, sha: HEX("a") }; }),
      first(c => { c.grew = { id: "toy-shop", rev: 1, sha: "sha256:" + HEX("A") }; }),
      first(c => { c.grew = "toy-shop"; }),
      first(c => { c.grew = { id: "toy-shop", rev: -1, sha: "sha256:" + HEX("a") }; }),
      first(c => { c.grew = { id: "toy-shop", rev: JSON.parse("1e400"), sha: "sha256:" + HEX("a") }; })],
     ["grew.id: malformed, wanted the id of the catalog it grew from",
      "grew.rev: malformed, wanted the edition number it grew from",
      "grew.sha: malformed, wanted sha256: and 64 lower-case hex characters",
      "grew.sha: malformed, wanted sha256: and 64 lower-case hex characters",
      "grew: not an entry",
      "grew.rev: malformed, wanted the edition number it grew from",
      "grew.rev: malformed, wanted the edition number it grew from"]);
  eq("834o grew: a part left out is absent, not malformed",
     first(c => { c.grew = { rev: 1, sha: "sha256:" + HEX("a") }; }),
     "grew.id: absent, wanted the id of the catalog it grew from");
  eq("834p desk: the id, the key, the box and the name are each named when wrong",
     [first(c => { c.desk = { id: "k-0123", name: "Ala", key: HEX("b"), box: HEX("c") }; }),
      first(c => { c.desk = { id: "x-0123456789abcdef", name: "Ala", key: HEX("b"), box: HEX("c") }; }),
      first(c => { c.desk = { id: "k-0123456789abcdef", name: "Ala", key: HEX("b").slice(1), box: HEX("c") }; }),
      first(c => { c.desk = { id: "k-0123456789abcdef", name: "Ala", key: HEX("b") }; }),
      first(c => { c.desk = { id: "k-0123456789abcdef", name: 5, key: HEX("b"), box: HEX("c") }; }),
      first(c => { c.desk = { id: "k-0123456789abcdef0", name: "Ala", key: HEX("b"), box: HEX("c") }; })],
     ["desk.id: malformed, wanted k- and 16 lower-case hex characters",
      "desk.id: malformed, wanted k- and 16 lower-case hex characters",
      "desk.key: malformed, wanted 64 lower-case hex characters",
      "desk.box: absent, wanted 64 lower-case hex characters",
      "desk.name: not text",
      "desk.id: malformed, wanted k- and 16 lower-case hex characters"]);
  eq("834q desk: a desk with no name is sound, the name being what the agent typed and may be nothing",
     bent(c => { c.desk = { id: "k-0123456789abcdef", key: HEX("b"), box: HEX("c") }; }), []);

  /* THE CARRYING. One file holding every new field and one unknown field on a card and in the
     header goes through catalogFromV2 and back out through catalogToV2, and every one of them
     comes out as it went in. Compared through v2Canonical, which sorts keys, because JSON key
     order is no part of a catalog. */
  const canon = V.v2Canonical;
  const back = V.catalogToV2(V.catalogFromV2(full()));
  const was = full();
  eq("834r every new field and both unknown ones come back out of an export as they went in",
     [back.cards[0], back.notes, back.grew, back.desk, back.futureHeader].map(canon),
     [was.cards[0], was.notes, was.grew, was.desk, was.futureHeader].map(canon));
  eq("834s and the second card, which holds none of them, gains none",
     canon(back.cards[1]), canon({ id: "c-two", shelf: "t-open", bodyShape: "plain",
       title: { en: "Two" }, body: { en: "Two." } }));
  eq("834t and what was written reads back clean, the validator and the writer being one contract",
     V.v2Problems(back), []);
  eq("834u a key named __proto__ is carried as a key and does not become a prototype",
     (() => {
       const c = sound();
       c.cards[0] = JSON.parse(JSON.stringify(c.cards[0]).slice(0, -1) + ",\"__proto__\":{\"x\":1}}");
       const out = V.catalogToV2(V.catalogFromV2(c));
       return [Object.keys(out.cards[0]).indexOf("__proto__") > -1,
               Object.getPrototypeOf(out.cards[0]) === Object.prototype];
     })(), [true, true]);
  eq("834v a field this build NAMES is never written from the carried copy, the runtime holding it or not",
     (() => {
       const rt = V.catalogFromV2(sound());
       rt.cards[0].ext = { bodyShape: "steps", futureCard: 1, retired: true };
       rt.ext = { id: "other", rev: 99, futureHeader: 2 };
       const out = V.catalogToV2(rt);
       return [out.cards[0].bodyShape, out.cards[0].futureCard, out.cards[0].retired, out.id, out.rev,
               out.futureHeader];
     })(), ["plain", 1, null, "toy-shop", 3, 2]);
  /* A carried bag made by hand (through parseMacrosData or normaliseCatalog, never by catalogFromV2) may hold
     keys the build names. Written back unchecked they make a file this build refuses: three problems. */
  const handMade = V.catalogFromV2(sound());
  handMade.cards[0].ext = { next: [{ to: "c-gone" }], retired: false };
  handMade.ext = { notes: 5 };
  const handOut = V.catalogToV2(handMade);
  eq("834D an export of a hand-made carried bag holding named keys reads back clean, and writes none of them",
     [V.v2Problems(handOut), "next" in handOut.cards[0], "retired" in handOut.cards[0], "notes" in handOut],
     [[], false, false, false]);
  eq("834w a catalog's name stays gone, and hash, sig and modified are made fresh rather than carried",
     (() => {
       const c = rich(); c.name = "Old"; c.modified = false; c.sig = { alg: "Ed25519", keyId: "k", value: "aa" };
       const out = V.catalogToV2(V.catalogFromV2(c));
       return ["name" in out, out.modified, out.hash === V.v2ContentHash(out), "sig" in out];
     })(), [false, true, true, false]);

  /* A LINK AN EXPORT WOULD BREAK IS LEFT OUT, because the file it writes is read back by v2Problems:
     a card removed at this desk, a link to itself and a repeat each leave no entry behind. */
  const runtime = V.catalogFromV2(sound());
  runtime.cards[0].next = [{ to: "c-one" }, { to: "c-two" }, { to: "c-two" }, { to: "c-removed" }, { to: 4 }, null];
  const mended = V.catalogToV2(runtime);
  eq("834x an export drops a link to itself, a repeat, a card no longer there and an entry with no to",
     mended.cards[0].next, [{ to: "c-two" }]);
  eq("834y and the file it wrote passes the loader", V.v2Problems(mended), []);
  runtime.cards[0].next = [{ to: "c-removed" }];
  eq("834z CONTROL: where nothing is left the card carries no next at all, not an empty list",
     "next" in V.catalogToV2(runtime).cards[0], false);

  /* THE CONTROL THAT MATTERS MOST: a catalog holding none of them is written as it was before this
     pass, the same keys in the same order on the header and on a card. */
  const plain = V.catalogToV2(V.catalogFromV2(sound()));
  const keysOf = o => Object.keys(o).join(",");
  eq("834A CONTROL: a catalog with none of the new fields writes none of them, on the header or on a card",
     [keysOf(plain), keysOf(plain.cards[0])],
     ["format,kind,id,rev,langs,commentLang,tags,cards,modified,hash", "id,shelf,title,body,bodyShape"]);

  /* THE TWO SITES NO NODE LEG CAN CALL, held as text like the rest of the editor and the export. The
     custom entry is replaced whole by a save, so it takes the fields no editor writes from the entry
     it replaces BEFORE the sweep that deletes empty ones. An export is a new catalog, so it takes the
     notes and the carried fields from the origin and leaves grew and desk, which describe a file. */
  const src = codeDoc();       // comments blanked: a call kept in a comment is no call
  const editor = extractDecl(src, "function openCardEditor(");
  const call = /carryUnwritten\(entry,\s*isNew\s*\?\s*null\s*:\s*pack\.custom\.find\(/.exec(editor);
  const sweepAt = editor.indexOf("CARD_BOOL_FLAGS.forEach(f=>{ if(!entry[f])");
  eq("834B the custom entry carries the unwritten fields over from the entry it replaces, before the sweep",
     [!!call, !!call && sweepAt > call.index], [true, true]);
  const exporter = extractDecl(src, "function currentCatalog(");
  eq("834C an export takes notes and the carried fields from the origin, and not grew or desk",
     ["out.notes=origin.notes", "out.ext=origin.ext", "out.grew", "out.desk"].map(x => exporter.indexOf(x) > -1),
     [true, true, false, false]);
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

/* THE COPY NOTICE SAYS WHAT HAPPENED. execCommand answers a refusal with false rather than a
   throw, so a refused copy must not reach the success words. The stub's thenable settles at
   once, which keeps the promise route synchronous here. */
function copyNoticeTests() {
  const src = sourceText();
  const decls = ["function noteCopy(", "function copy(", "function fallback("].map(m => extractDecl(src, m)).join("\n");
  const SAID = "Ready to paste: A card, EN";
  const HAND = "Selecting the text on the card and pressing Ctrl+C copies this one; the browser kept the clipboard closed.";
  const DESK = "Selecting the text on the card and pressing Ctrl+C copies this one; the clipboard would not take it just now.";
  const run = (secure, write, exec, host) => {
    const said = [];
    const ta = { style: {}, select() {}, remove() {} };
    const doc = { createElement: () => ta, body: { appendChild() {} }, execCommand: exec };
    const nav = write ? { clipboard: { writeText: () => ({ then: (ok, no) => (write === "ok" ? ok() : no()) }) } } : {};
    const copy = new Function("navigator", "window", "document", "toast", "TOAST_HAND_MS",
      "setRailMarkUsed", "setSemiKind", "hooks", "eHost", "t", decls + "\nreturn copy;")(
      nav, { isSecureContext: secure }, doc, m => said.push(m), 5000,
      () => {}, () => {}, { railDecorate() {} }, () => !!host, s => s);
    copy("text", SAID);
    return said;
  };
  eq("a clipboard the browser refuses, and a copy command it refuses too, never says ready to paste",
     run(true, "no", () => false), [HAND]);
  eq("and with no clipboard API at all, a refused copy command says the same",
     run(false, null, () => false), [HAND]);
  eq("and a copy command that throws says the same", run(false, null, () => { throw new Error("x"); }), [HAND]);
  eq("on the desk, which has no browser, the same refusal blames none",
     run(true, "no", () => false, true), [DESK]);
  eq("CONTROL: a clipboard that takes the text still says ready to paste", run(true, "ok", () => false), [SAID]);
  eq("CONTROL: and so does a copy command the browser carries out", run(false, null, () => true), [SAID]);
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
    /* The table and the clock's hours are variables.js's, which greeting.js reads. */
    "const VAR_GREETINGS=", "const VAR_DAYPARTS=", "const VAR_HOURS=", "function varMinutes(",
    "let VAR_CATALOG=", "function varHours(", "function varDayPart(",
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
  /* A language the table leaves out keeps its own built-in row, or its cards greet in the
     primary language; and the expander carries that row too, being the same table. */
  V.setCatalogGreet({ en: mine.en });
  eq("a language the catalog's table leaves out greets in its own built-in words",
     V.greeting("pl"), ["Dzie\u0144 dobry", "Dzie\u0144 dobry", "Dobry wiecz\u00f3r"][V.dayPart()]);
  eq("while the language it brings keeps the catalog's", V.greeting("en"), mine.en[V.dayPart()]);
  eq("and the expander knows both", [V.greetWords().indexOf("Hi there") > -1,
     V.greetWords().indexOf("Dobry wiecz\u00f3r") > -1], [true, true]);
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
  const decls = ["const STATS_DAYS_KEPT=", "const STATS_YMD=", "function statsYmd(",
                 "function statsDayBefore(", "function statsDay(", "const STATS_TOUCHED=", "function statsTouch(",
                 "function statsCompact(", "function statsIdAt(", "const STATS_FORGOT=",
                 "function bumpUse(", "function bumpIntent(", "function bumpMiss(",
                 "function bumpLang(", "function statsForgetCards(", "function statsDoc("]
    .map(m => extractDecl(src, m)).join("\n");
  return new Function(decls
    + "\nreturn {STATS_DAYS_KEPT,statsYmd,bumpUse,bumpIntent,bumpMiss,bumpLang,statsForgetCards,"
    + "statsDoc};")();
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
  /* Without a span the answer is the lifetime counters, all a desk could send before 521; a
     request always names a span, so this is the document's shape and not the channel's answer. */
  const doc = S.statsDoc(
    { useCounts: { c: 1 }, useAt: { c: "2026-09-17" }, intentCounts: { "i:0": 2 },
      searchMisses: 3, langs: { en: 4, pl: 5, de: 6, it: 0 } },
    { engine: "2.0.0-dev", catalog: { id: "lamp-shop", rev: 2 } });
  eq("statsDoc names the nouns and not the agent",
     [doc.cards[0], doc.intents[0], doc.misses, doc.langs, doc.catalog, doc.engine, "agent" in doc],
     [{ id: "c", n: 1, at: "2026-09-17" }, { id: "i:0", n: 2 }, 3, { en: 4, pl: 5, de: 6 },
      { id: "lamp-shop", rev: 2 }, "2.0.0-dev", false]);

  /* Board 521, 461 ruled: an answer covers the span the request names, summed from the days the
     desk counted, and says the day it began counting by day (ruled 2026-09-23). */
  const dp = { useCounts: {}, useAt: {} };
  S.bumpUse(dp, "c-aug", "2026-08-10");
  S.bumpUse(dp, "c-aug", "2026-08-11");
  S.bumpLang(dp, "pl", "2026-08-11");
  S.bumpUse(dp, "c-sep", "2026-09-22");
  S.bumpLang(dp, "en", "2026-09-22");
  S.bumpIntent(dp, "t:refund", "2026-09-22");
  S.bumpMiss(dp, "2026-09-22");
  const span = (from, to) => S.statsDoc(dp, { engine: "x", period: { from, to } });
  const sep = span("2026-09-01", "2026-09-30"), jan = span("2020-01-01", "2020-01-31");
  const both = span("2026-08-01", "2026-09-30");
  eq("a span answers the days inside it and nothing else: September, and January 2020 empty",
     [sep.cards, sep.intents, sep.misses, sep.langs, jan.cards, jan.intents, jan.misses, jan.langs],
     [[{ id: "c-sep", n: 1, at: "2026-09-22" }], [{ id: "t:refund", n: 1 }], 1, { en: 1 },
      [], [], 0, {}]);
  eq("CONTROL: a span over both months sums them by day, the last use inside the span as at",
     [both.cards, both.langs, both.misses],
     [[{ id: "c-aug", n: 2, at: "2026-08-11" }, { id: "c-sep", n: 1, at: "2026-09-22" }],
      { pl: 1, en: 1 }, 1]);
  eq("a span answer says the first day this desk counted by day, whatever the span",
     [sep.since, jan.since, both.since, "since" in doc],
     ["2026-08-10", "2026-08-10", "2026-08-10", false]);
  eq("the lifetime counters beside the days still count every copy, for the Library's figure",
     [dp.useCounts["c-aug"], dp.useCounts["c-sep"]], [2, 1]);
  S.statsForgetCards(dp, id => id !== "c-aug");
  eq("a card the catalog no longer has leaves the days with its tally, and the others stay",
     span("2026-08-01", "2026-09-30").cards.map(c => c.id + ":" + c.n), ["c-sep:1"]);
  /* The days are kept STATS_DAYS_KEPT back from the newest, and the first day moves with them,
     so an answer never claims a day the desk no longer holds. */
  const old = { useCounts: {}, useAt: {} };
  S.bumpUse(old, "c-old", "2025-01-01");
  S.bumpUse(old, "c-new", "2026-09-22");
  const kept = S.statsDoc(old, { engine: "x", period: { from: "2020-01-01", to: "2026-12-31" } });
  eq("a day older than the kept window is dropped and the first day moves to the window's start",
     [kept.cards.map(c => c.id), kept.since, S.STATS_DAYS_KEPT], [["c-new"], "2025-08-18", 400]);
}

function catalogIdentityTests() {
  const src = sourceText();
  const I = new Function(extractDecl(src, "function isCatalogUpdate(")
    + "\nreturn {isCatalogUpdate};")();
  eq("isCatalogUpdate same id is the same catalog",
     I.isCatalogUpdate({ id: "lamp-shop" }, { id: "lamp-shop" }), true);
  eq("isCatalogUpdate different ids are two catalogs",
     I.isCatalogUpdate({ id: "other-shop" }, { id: "lamp-shop" }), false);
  /* A name planted in both, the one field a reader of the old rule would have matched on. */
  eq("isCatalogUpdate reads no name: without an id on both sides two files are never one catalog",
     [I.isCatalogUpdate({ name: "Lamp Shop" }, { name: "Lamp Shop" }),
      I.isCatalogUpdate({ id: "lamp-shop", name: "Lamp Shop" }, { name: "Lamp Shop" })], [false, false]);
}

/* THE NAMESPACE IS THE CATALOG'S ID ALONE. A name planted in the catalog, the seed an earlier rule
   fell back to, must seed nothing: the build's namespace stays the shared one and so does the layer. */
function catalogNsTests() {
  const src = sourceText();
  const decl = m => extractDecl(src, m);
  const nsFor = new Function(decl("function eNsFor(") + "\nreturn eNsFor;")();
  const nsOf = c => new Function("eEmbeddedCatalog", "eNsFor", decl("const E_NS=") + "\nreturn E_NS;")(() => c, nsFor);
  const layerOf = c => new Function("eNsFor", "E_NS", decl("function layerNsOf(") + "\nreturn layerNsOf;")(nsFor, "e")(c);
  eq("a build's namespace is its catalog's id's, and a catalog with a name and no id seeds none",
     [nsOf({ id: "lamp-shop", name: "Lamp Shop" }) === nsFor("lamp-shop"), nsOf({ name: "Lamp Shop" })], [true, "e"]);
  eq("a catalog's layer is its id's, and one with a name and no id is the empty desk's",
     [layerOf({ id: "lamp-shop", name: "Lamp Shop" }) === nsFor("lamp-shop"), layerOf({ name: "Lamp Shop" })], [true, "e"]);
}

/* THE ADOPTIONS NEVER CARRY ONE CATALOG'S LAYER INTO ANOTHER'S. A build with a catalog inside it
   adopts a lone layer an earlier build of that catalog stranded; since each catalog keeps a layer of
   its own, a lone layer can be another catalog's. Both movers and the order loadPack runs them in,
   sliced out of pack.js over a store this supplies, with the layer in view and the desk's list of
   written layers supplied as storage.js keeps them. */
function strandedAdoptionTests() {
  const src = sourceText();
  const decl = m => extractDecl(src, m);
  const nsFor = new Function(decl("function eNsFor(") + "\nreturn eNsFor;")();
  const body = ["const NS_CARRY=", "const NS_DROP_POSITIONAL=", "function packWithoutPositional(",
                "function carryNsLayer(", "const NS_ADOPTED=", "function adoptStrandedPack("]
                 .map(decl).join("\n") + "\nadoptStrandedPack();";
  const EMBEDDED = { id: "lamp-shop" };
  const own = nsFor(EMBEDDED.id), other = nsFor("fern-shop"), stranger = nsFor("an older seed");
  const boot = (store, inView, written) => {
    const lsGet = k => (k in store) ? store[k] : null;
    new Function("eEmbeddedCatalog", "eNsFor", "E_NS", "lsGet", "lsSet", "lsKeys", "LAYER_KEYS", "eLayer", "eLayers",
                 "lyGet", "t", "toast", "setTimeout", body)(
      () => EMBEDDED, nsFor, own, lsGet, (k, v) => { store[k] = String(v); return true; }, () => Object.keys(store),
      ["Pack", "Stats", "Days", "CatOrder", "IntentOrder", "IntentsAside", "LinksAside", "RequestsAside", "Exported"],
      () => inView, () => written.slice(), n => lsGet(inView + n), s => s, () => {}, fn => fn());
    return store;
  };
  const PACK = tag => JSON.stringify({ favourites: [tag] });
  const under = (store, ns) => Object.keys(store).filter(k => k.indexOf(ns) === 0).sort();
  const marks = store => Object.keys(store).filter(k => k.indexOf("e~nsAdopted:") === 0).length;

  const s1 = boot({ [own + "Pack"]: PACK("an edit over the build's own catalog") }, other, [other]);
  eq("a catalog loaded over the build's own finds none of that catalog's layer in its own, and nothing is marked",
     [under(s1, other), marks(s1)], [[], 0]);
  const s2 = boot({ [other + "Pack"]: PACK("an edit over another catalog") }, own, [other]);
  eq("the build's own catalog back in view takes nothing from a layer this desk wrote for another catalog",
     [under(s2, own), marks(s2)], [[], 0]);
  const s3 = boot({ [stranger + "Pack"]: PACK("an edit under an older seed") }, other, [other]);
  const s3Other = under(s3, other), s3Marks = marks(s3);
  boot(s3, own, [other]);
  eq("a stranded layer waits while another catalog is in view, and reaches the build's own catalog when it is",
     [s3Other, s3Marks, JSON.parse(s3[own + "Pack"] || "{}").favourites], [[], 0, ["an edit under an older seed"]]);
  const s4 = boot({ [stranger + "Pack"]: PACK("an edit an earlier build stranded") }, own, [other]);
  eq("a lone stranded layer no catalog of this desk wrote is still adopted by the build's own catalog",
     JSON.parse(s4[own + "Pack"] || "{}").favourites, ["an edit an earlier build stranded"]);
}

/* EVERY LANGUAGE BUTTON THE HEADER HOLDS ANSWERS A PRESS, however it got there. The desk starts
   again in place (restart.js), which rebuilds the buttons for the new catalog's languages and does
   not run the boot's wiring again. The sync and the boot's wiring sliced out of lang-seg.js over a
   toy control; a press is the element's own handler called on it, as a click calls it. */
function langSegWiringTests() {
  const src = fs.readFileSync(path.join(E.ROOT, "src", "modules", "lang-seg.js"), "utf8");
  const names = ["function syncLangSeg(", "function wireLangSeg("].concat(src.indexOf("function segPress(") > -1 ? ["function segPress("] : []);
  const button = l => ({ dataset: { l: l }, removeAttribute() {}, onclick: null, disabled: false });
  const desk = (bootLangs, laterLangs) => {
    const LANGS = bootLangs.slice(), picked = [];
    let kids = [button("en"), button("pl")];
    const seg = { setAttribute() {}, querySelectorAll: () => kids.slice(), replaceChildren: (...k) => { kids = k; } };
    const doc = { createElement: () => button("") };
    const F = new Function("seg", "CONTENT_LANGS", "lang", "applyLangState", "setLang", "segFolded", "document",
      names.map(m => extractDecl(src, m)).join("\n") + "\nreturn {syncLangSeg, wireLangSeg};")(
      seg, LANGS, "en", () => {}, l => picked.push(l), () => false, doc);
    F.syncLangSeg(); F.wireLangSeg();
    LANGS.length = 0; laterLangs.forEach(l => LANGS.push(l));
    F.syncLangSeg();
    kids.forEach(b => { if (typeof b.onclick === "function") b.onclick.call(b, { currentTarget: b }); });
    return picked;
  };
  const run = (a, b) => { try { return desk(a, b); } catch (e) { return "lang-seg did not run: " + e.message; } };
  eq("a language a start in place brings to the header answers a press, as the ones boot saw do",
     run(["en", "pl"], ["en", "de"]), ["en", "de"]);
  eq("and a desk that booted speaking one language answers both presses once a second language arrives",
     run(["en"], ["en", "pl"]), ["en", "pl"]);
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

  /* A REQUEST FILE ON THE SHARE IS READ BEFORE ITS HASH IS CHECKED, and the hash recurses: one
     nested 5,000 deep threw RangeError in the main process (sense pass 3, item 10). */
  const R = requestFns();
  const req = { format: 1, kind: "etiuda-request", id: "req-one", issued: "2026-09-24",
    from: "2026-09-01", to: "2026-09-24", expires: "2099-01-01" };
  const good = R.parseRequest(JSON.stringify(Object.assign({ hash: R.channelHash(req) }, req)));
  eq("parseRequest takes a request whose hash is its own", good && good.id, "req-one");
  const deep = JSON.stringify(Object.assign({ hash: "djb2:0" }, req))
    .replace(/\}$/, ',"pad":' + "[".repeat(5000) + "]".repeat(5000) + "}");
  let deepGot;
  try { deepGot = R.parseRequest(deep); } catch (e) { deepGot = "threw " + e.name; }
  eq("parseRequest refuses a request nested 5,000 deep, and says so, without throwing",
     [deepGot, R.said.length === 1 && /nests deeper/.test(R.said[0])], [null, true]);
}
/* WHERE THE WINDOW OPENS (feel pass native-2), on the pure half: the rectangle a launch is given
   from what the last run saved and the displays there are now. The round trip through a real
   window is driven outside the suite, since a restored window is one on a display. */
function windowPlaceTests() {
  const src = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  const place = new Function(extractDecl(src, "function windowPlace(") + "\nreturn windowPlace;")();
  const SIZE = { width: 1280, height: 880 };
  const main = { x: 0, y: 0, width: 1920, height: 1032 }, left = { x: -1600, y: 100, width: 1600, height: 860 };
  const areas = [main, left];
  const inside = (r, a) => r.x >= a.x && r.y >= a.y && r.x + r.width <= a.x + a.width && r.y + r.height <= a.y + a.height;
  const J = JSON.stringify;
  eq("a first launch opens at the opening size, centred on the primary's work area",
    J(place(null, areas, main, SIZE)), J({ x: 320, y: 76, width: 1280, height: 880, maximized: false }));
  eq("a saved rectangle inside a work area comes back as it was, maximised included",
    J(place({ x: 40, y: 30, width: 1000, height: 700, maximized: true }, areas, main, SIZE)),
    J({ x: 40, y: 30, width: 1000, height: 700, maximized: true }));
  eq("a rectangle on the display to the left, at negative x, stays on that display",
    J(place({ x: -1500, y: 200, width: 900, height: 600, maximized: false }, areas, main, SIZE)),
    J({ x: -1500, y: 200, width: 900, height: 600, maximized: false }));
  const gone = place({ x: 6000, y: 6000, width: 1000, height: 700, maximized: true }, areas, main, SIZE);
  eq("a rectangle on a display that has gone opens centred on the primary, not maximised",
    J(gone), J({ x: 320, y: 76, width: 1280, height: 880, maximized: false }));
  const hanging = place({ x: 1700, y: 900, width: 1000, height: 700, maximized: false }, areas, main, SIZE);
  eq("a rectangle hanging off a work area's corner is moved wholly inside it",
    [inside(hanging, main), hanging.width, hanging.height], [true, 1000, 700]);
  const big = place({ x: -1700, y: 50, width: 2400, height: 1400, maximized: false }, areas, main, SIZE);
  eq("a rectangle larger than its work area is cut to it", J(big), J({ x: -1600, y: 100, width: 1600, height: 860, maximized: false }));
  const small = { x: 0, y: 0, width: 1366, height: 728 };
  eq("the opening size is cut to a small primary work area as well",
    J(place(null, [small], small, SIZE)), J({ x: 43, y: 0, width: 1280, height: 728, maximized: false }));
  eq("a file that is not a rectangle is read as no file",
    [place({ x: "a", y: 0, width: 10, height: 10 }, areas, main, SIZE).x, place({ x: 0, y: 0, width: -5, height: 10 }, areas, main, SIZE).x,
     place(["x"], areas, main, SIZE).x, place({ x: 0, y: 0, width: 800, height: 600, maximized: "yes" }, areas, main, SIZE).maximized],
    [320, 320, 320, false]);
}
/* THE SHIPPED SAMPLE'S FOLDER IS NEVER NAMED (feel pass, the offer's "app.asar\shell"): the shell
   hands the page no folder for a file it ships, and the page says in words where the file came
   from, in the offer and in About alike. */
function shippedFileTests() {
  const shell = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  const inAsar = "C:\\Users\\someone\\AppData\\Local\\Programs\\Etiuda\\resources\\app.asar\\shell";
  const own = "C:\\Users\\someone\\Documents\\Etiuda";
  let S = null;
  try {
    S = new Function("path", "BUILT_IN_DIR", ["function isBuiltIn(", "function folderShown("]
      .map(m => extractDecl(shell, m)).join("\n") + "\nreturn {isBuiltIn,folderShown};")(path.win32, inAsar);
  } catch (e) { S = null; }
  eq("the shell tells a shipped file from one in the catalog folder",
    S ? [S.isBuiltIn(inAsar + "\\sample-catalog.ec"), S.isBuiltIn(own + "\\sample-catalog.ec"), S.isBuiltIn("")] : "no isBuiltIn in shell/main.js",
    [true, false, false]);
  eq("the folder the page is handed is empty for a shipped file and the file's own folder otherwise",
    S ? [S.folderShown(inAsar + "\\sample-catalog.ec"), S.folderShown(own + "\\team.ec"), S.folderShown("")] : "no folderShown in shell/main.js",
    ["", own, ""]);
  eq("no send to the page names the loaded file's folder except through folderShown",
    (shell.match(/path\.dirname\(catalogFrom\)/g) || []).length, 0);
  const offer = fs.readFileSync(path.join(E.ROOT, "src", "modules", "catalog-offer.js"), "utf8");
  let found = null;
  try {
    found = new Function("t", "esc", "E_CATALOG_SCRIPT", "eCatalogFolder", "eCatalogFolderShort",
      extractDecl(offer, "function eFoundHtml(") + "\nreturn eFoundHtml;")(s => s, s => s, "etiuda-catalog.js", () => own, s => s);
  } catch (e) { found = null; }
  const said = found ? found("sample-catalog.ec", inAsar, true) : "";
  eq("the offer says a shipped file comes with Etiuda and names no folder, even one it is handed",
    [/comes with Etiuda/.test(said), said.indexOf("asar") < 0, said.indexOf("sample-catalog.ec") > -1], [true, true, true]);
  eq("a file from the catalog folder is still located in it",
    found ? /Located as .*sample-catalog\.ec.* in .*Documents/.test(found("sample-catalog.ec", own, false)) : "no eFoundHtml", true);
}
/* THE RAIL IS IN THE FIRST FRAME (feel pass, the rail arriving about 120 ms after the cards at
   launch): boot ends by placing the panel in its own task, after the last statement that moves the
   header, and the panel lands without its fade. The placement is sliced and run on stubs that log
   the order of what it does; the frame itself is the verifier's composed capture. */
function railPlacementTests() {
  const panel = fs.readFileSync(path.join(E.ROOT, "src", "modules", "rail-panel.js"), "utf8");
  const log = [];
  const rail = { style: { set transition(v) { log.push("transition=" + (v || "(sheet)")); }, get transition() { return ""; } } };
  const body = { ready: false };
  let place = null;
  try {
    place = new Function("$", "syncRailGeometry", "getComputedStyle",
      extractDecl(panel, "function placeRailNow(") + "\nreturn placeRailNow;")(
      sel => sel === "#intentRail" ? rail : null,
      () => { body.ready = true; log.push("geometry"); },
      el => { log.push("style read, ready " + body.ready); return { opacity: "1" }; });
  } catch (e) { place = null; }
  if (place) place();
  eq("the panel is placed in one task: transition off, geometry, a style read with the panel ready, transition back",
    place ? log : "no placeRailNow in rail-panel.js",
    ["transition=none", "geometry", "style read, ready true", "transition=(sheet)"]);
  const main = fs.readFileSync(path.join(E.ROOT, "src", "main.js"), "utf8");
  const at = s => main.indexOf(s);
  eq("boot places the panel after the chrome is translated and before it reports a boot",
    [at("railPanel.placeRailNow()") > at("uiLang.translateChrome()"), at("uiLang.translateChrome()") > -1,
     at("railPanel.placeRailNow()") > -1 && at("railPanel.placeRailNow()") < at("E_BOOT_OK();")],
    [true, true, true]);
}
/* A PAGE THAT STOPPED COMES BACK WHOLE (feel pass, the crash reload): every reload the shell makes
   after the page stopped is marked for the host answer, which says so once, and the boot guard then
   holds the first frame until boot has ended, as for a reload the page asks for itself. The guard is
   run here as it stands in the template, on stubs; the frames are the verifier's capture. */
function recoveryTests() {
  const shell = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  const reloads = shell.match(/\.reload\(\)/g) || [];
  eq("every reload the shell makes of the page goes through recover(), which marks it first",
    [reloads.length, /const recover = \(\) => \{ recovering\.add\(win\.webContents\.id\); win\.webContents\.reload\(\); \};/.test(shell)],
    [1, true]);
  eq("the host answer says so once, by taking the mark", /recovering: recovering\.delete\(e\.sender\.id\),/.test(shell), true);
  const preload = fs.readFileSync(path.join(E.ROOT, "shell", "preload.js"), "utf8");
  eq("the preload hands the page that answer", /recovering: !!host\.recovering,/.test(preload), true);
  eq("and the last loss's reason rides the same answer to the page, which Maintenance shows",
    [/lostPage: e\.sender\.etiudaLost \|\| null,/.test(shell), /lostPage: host\.lostPage \|\| null,/.test(preload)], [true, true]);
  const tpl = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
  const m = /<script>([\s\S]*?)<\/script>/.exec(tpl);
  const guard = m ? m[1] : "";
  const run = (host, arriving) => {
    const cls = new Set(), head = [];
    const store = arriving ? { eArriving: "1" } : {};
    const el = () => ({ style: { setProperty() {} }, setAttribute(k, v) { this[k] = v; },
      blocking: { supports: w => w === "render" }, appendChild() {} });
    const sb = {
      document: { documentElement: { classList: { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)),
        contains: c => cls.has(c) }, style: { setProperty() {} } },
        head: { appendChild: n => head.push(n) }, createElement: el, getElementById: () => null, querySelector: () => null },
      sessionStorage: { getItem: k => store[k] || null, removeItem: k => { delete store[k]; }, setItem: (k, v) => { store[k] = v; }, clear() {} },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
      matchMedia: () => ({ matches: false }), location: { hash: "", href: "file:///x/etiuda.html", protocol: "file:", origin: "null" },
      navigator: { languages: ["en-US"], language: "en-US", cookieEnabled: true },
      setTimeout: () => 0, requestAnimationFrame: () => 0, addEventListener() {}
    };
    sb.window = sb; sb.E_HOST = host; sb.self = sb; sb.top = sb;
    require("vm").runInNewContext(guard, sb);
    const hold = head.filter(n => n.rel === "expect" && n.blocking === "render");
    return [cls.has("e-arriving"), hold.length];
  };
  let got;
  try {
    got = [run({ recovering: true }, false), run({ recovering: false }, false), run(null, true), run(null, false)];
  } catch (e) { got = "the boot guard threw: " + e.message; }
  /* The page no longer reloads itself to change catalogs, so a session mark alone, which only that
     reload wrote, holds nothing: the third case is the one that changed. */
  eq("the guard holds the first frame for the shell's recovery, and for nothing else, a stray session mark included",
    got, [[true, 1], [false, 0], [false, 0], [false, 0]]);
}
/* THE FIRST PAINT READS THE SETTINGS WHERE THEY ARE KEPT: an installed Etiuda keeps them in its desk
   file and never in localStorage, so the head script reads the desk the shell hands it, once, and
   storage.js takes that copy rather than reading the file again. The head script runs in a VM on
   stubs, as recoveryTests runs it; what the first frame looks like is the verifier's. */
function headPrefsTests() {
  const tpl = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
  const m = /<script>([\s\S]*?)<\/script>/.exec(tpl);
  const guard = m ? m[1] : "";
  const run = (deskKeys, lsKeys, width) => {
    const cls = new Set(), props = {};
    let reads = 0;
    const host = deskKeys ? { deskRead: () => { reads++; return JSON.stringify(deskKeys); }, deskSave: () => true } : null;
    const sb = {
      document: { documentElement: { classList: { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)),
        contains: c => cls.has(c) }, style: { setProperty: (k, v) => { props[k] = v; } } },
        head: { appendChild() {} }, createElement: () => ({ setAttribute() {}, blocking: { supports: () => true } }),
        getElementById: () => null, querySelector: () => null },
      sessionStorage: { getItem: () => null, removeItem() {}, setItem() {}, clear() {} },
      localStorage: { getItem: k => (k in lsKeys ? lsKeys[k] : null), setItem() {}, removeItem() {}, key: () => null, length: 0 },
      matchMedia: () => ({ matches: false }), location: { hash: "", href: "file:///x/etiuda.html", protocol: "file:", origin: "null" },
      navigator: { languages: ["en-US"], language: "en-US", cookieEnabled: true }, innerWidth: width,
      setTimeout: () => 0, requestAnimationFrame: () => 0, addEventListener() {}
    };
    sb.window = sb; sb.self = sb; sb.top = sb; sb.E_HOST = host;
    require("vm").runInNewContext(guard, sb);
    return { still: cls.has("e-still"), off: cls.has("e-pills-off"), h: props["--e-pills-h"] || null, reads,
      handed: sb.eDeskAtBoot ? Object.keys(sb.eDeskAtBoot).length : null };
  };
  const kept = { eMotionOff: "1", ePills: "0", eHdrPills: "1500x37" };
  let got;
  try {
    got = [run(kept, {}, 1500), run(kept, kept, 1500), run(null, kept, 1500)]
      .map(r => [r.still, r.off, r.reads, r.handed]);
  } catch (e) { got = "the head script threw: " + e.message; }
  eq("on a desk the first paint is still and without the category bar as its desk file says, whatever localStorage holds; a browser reads localStorage as before",
    got, [[true, true, 1, 3], [true, true, 1, 3], [true, true, 0, null]]);
  try {
    const shown = { ePills: "1", eHdrPills: "1500x37" };
    got = [run(shown, {}, 1500).h, run(shown, {}, 1280).h, run({}, shown, 1500).h, run(null, shown, 1500).h];
  } catch (e) { got = "the head script threw: " + e.message; }
  eq("on a desk the category bar's last height is reserved from the desk file at the width it was measured at, and not from localStorage",
    got, ["37px", null, null, "37px"]);

  const store = fs.readFileSync(path.join(E.ROOT, "src", "modules", "storage.js"), "utf8");
  const take = handed => {
    let reads = 0;
    const win = { E_HOST: { deskRead: () => { reads++; return JSON.stringify({ eTheme: "dark", eRail: "1" }); }, deskSave: () => true } };
    if (handed !== undefined) win.eDeskAtBoot = handed;
    const desk = new Function("window", extractDecl(store, "function eHostDesk(") + "\nreturn eHostDesk();")(win);
    return [desk ? Object.keys(desk.map).sort().join(",") : null, reads, "eDeskAtBoot" in win];
  };
  try {
    got = [take({ eTheme: "light", eGlassOff: 1 }), take(undefined), take(null)];
  } catch (e) { got = "eHostDesk threw: " + e.message; }
  eq("storage.js takes the desk the head script read, once and without reading the file again, and reads it itself when none was handed",
    got, [["eGlassOff,eTheme", 0, false], ["eRail,eTheme", 1, false], ["eRail,eTheme", 1, false]]);
}
/* A COVERED ARRIVAL FADES FROM A FRAME ITS CONTENT WAS DRAWN IN (feel pass; the shell's recovery is
   what arrives covered now): the boot guard runs in a VM, E_BOOT_OK is called, and the frames and
   paint timing it waits on are handed to it by hand. What the eye sees is the verifier's composed frames. */
function arrivalTests() {
  const tpl = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
  const m = /<script>([\s\S]*?)<\/script>/.exec(tpl);
  const guard = m ? m[1] : "";
  const run = paintTiming => {
    const cls = new Set(), frames = [], seen = [], obs = [];
    const sb = {
      document: { documentElement: { classList: { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)),
        contains: c => cls.has(c) }, style: { setProperty() {} } }, body: { offsetWidth: 1 },
        head: { appendChild() {} }, createElement: () => ({ setAttribute() {}, blocking: { supports: () => true } }),
        getElementById: () => null, querySelector: () => null },
      sessionStorage: { getItem: () => null, removeItem() {}, setItem() {}, clear() {} },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
      matchMedia: () => ({ matches: false }), location: { hash: "", href: "file:///x/etiuda.html", protocol: "file:", origin: "null" },
      navigator: { languages: ["en-US"], language: "en-US", cookieEnabled: true },
      setTimeout: () => 0, requestAnimationFrame: fn => { frames.push(fn); return frames.length; }, addEventListener() {}
    };
    if (paintTiming) {
      sb.performance = { getEntriesByType: () => [] };
      sb.PerformanceObserver = class { constructor(cb) { this.cb = cb; obs.push(this); } observe() {} disconnect() {} };
    }
    sb.window = sb; sb.E_HOST = { recovering: true }; sb.self = sb; sb.top = sb;
    require("vm").runInNewContext(guard, sb);
    const step = what => { seen.push([what, frames.length, cls.has("e-arriving")]); };
    sb.E_BOOT_OK(); step("boot");
    if (paintTiming) { obs.forEach(o => o.cb({ getEntries: () => [] }, o)); step("painted"); }
    while (frames.length) { frames.shift()(); step("frame"); }
    return seen;
  };
  let got;
  try { got = [run(true), run(false)]; } catch (e) { got = "the boot guard threw: " + e.message; }
  eq("the arrival waits for its first frame to be presented, then fades from the next; without paint timing, two frames",
    got, [[["boot", 0, true], ["painted", 1, true], ["frame", 0, false]],
          [["boot", 1, true], ["frame", 1, true], ["frame", 0, false]]]);
  const rule = /html\.e-arriving #pillsSlot\{opacity:([.0-9]+)\}/.exec(tpl);
  eq("held, the content is drawn at a trace rather than not at all, so it is rasterised before its fade",
    rule ? +rule[1] > 0 && +rule[1] < 0.01 : "no e-arriving rule", true);
}
/* THE EMPTY MARK'S CLOCK, as smooth on a first launch as on any later one: empty-mark.js runs in a
   VM on a clock and a frame queue written here, with one dot flying from x 0 to x 100, so the x it
   is drawn at is the gather's progress. The tour's start and the boot repaint are sliced into the
   same VM and asked when they run. What the eye sees on a first launch is the verifier's frames. */
function markLab() {
  const read = f => fs.readFileSync(path.join(E.ROOT, "src", "modules", f), "utf8");
  const mark = read("empty-mark.js").replace(/^import[^\n]*\n/gm, "").replace(/export\s*\{[^}]*\};?\s*$/, "");
  const tour = read("tour.js"), open = read("on-open.js");
  const slices = [extractDecl(tour, "const TOUR_AUTO_MS="), extractDecl(tour, "function maybeStartTour("),
    extractDecl(open, "let eReadyDone="), extractDecl(open, "let lastGreet;"), extractDecl(open, "function markEReady("),
    extractDecl(open, "function wireOnOpen(")];
  let clock = 0, seq = 0, frames = [], timers = [], drawnX = null;
  const log = [], warms = [];
  const ctx = { setTransform() {}, clearRect() {}, beginPath() {}, fill() {}, moveTo() {}, arc(x) { drawnX = x; } };
  const sb = {
    M_MS: { gather: 1100, twinkle: 66 }, FIFTH_PHI0: Math.PI / 4, mgReduceMotion: () => !!sb.still,
    performance: { now: () => clock },
    requestAnimationFrame: fn => { frames.push({ id: ++seq, fn }); return seq; },
    cancelAnimationFrame: id => { frames = frames.filter(f => f.id !== id); },
    setTimeout: (fn, ms) => { timers.push({ id: ++seq, at: clock + (ms || 0), fn }); return seq; },
    clearTimeout: id => { timers = timers.filter(x => x.id !== id); },
    requestIdleCallback: fn => { timers.push({ id: ++seq, at: clock, fn }); return seq; },
    setInterval: () => 0, getComputedStyle: () => ({ color: "#fff" }), devicePixelRatio: 1,
    MutationObserver: class { observe() {} disconnect() {} },
    document: { querySelector: () => null, documentElement: {},
      createElement: () => ({ setAttribute() {}, getContext: () => ctx, isConnected: true, parentNode: null, remove() { this.parentNode = null; } }) },
    ssGet: () => null, TOUR_AT: "eTourAt", TOUR_STEPS: [], tourRunning: false, tourSeen: () => false, tourInviteDismissed: () => false,
    startTour: () => log.push(["tour", Math.round(clock)]),
    applyUiLang: () => log.push(["repaint", Math.round(clock)]),
    focusFirstEntryOnOpen: () => {}, greeting: () => "", render: () => {},
    warmMenu: () => warms.push(Math.round(clock))
  };
  sb.window = sb;
  require("vm").runInNewContext(mark + "\n" + slices.join("\n") + "\nfunction __mark(){ return eMark; }\nfunction __lay(f){ markLay = f; }\n", sb);
  sb.markDots = () => [{ x: 100, y: 0, sx: 0, sy: 0, ph: 0, sp: 1 }];
  const timersTo = t => {
    for (;;) {
      const due = timers.filter(x => x.at <= t).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      timers = timers.filter(x => x !== due);
      clock = Math.max(clock, due.at);
      due.fn();
    }
    clock = t;
  };
  const frame = t => { timersTo(t); const run = frames; frames = []; run.forEach(f => f.fn(t)); return drawnX; };
  const host = { firstChild: null, insertBefore(cv) { cv.parentNode = host; } };
  return { sb, log, warms, frame, timersTo, make: () => sb.syncEmptyMark(host), state: () => sb.__mark(), x: () => drawnX };
}
function markClockTests() {
  const hz = n => 1000 / n;
  let got;
  try {
    // Made 100 ms into the page, its first frame 500 ms later draws the dots where they start.
    const a = markLab(); a.timersTo(100); a.make();
    got = +a.frame(600).toFixed(2);
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("the gather's clock starts at its first frame, not when boot makes the mark", got, 0);

  try {
    // Two frames at 250 Hz, then one 200 ms late, against the same two and two more on time.
    const late = markLab(), even = markLab(); late.make(); even.make();
    [500, 500 + hz(250), 500 + 2 * hz(250), 700 + 2 * hz(250)].forEach(t => late.frame(t));
    [0, 1, 2, 3, 4].forEach(i => even.frame(500 + i * hz(250)));
    got = [+late.x().toFixed(4) === +even.x().toFixed(4), late.x() > 0];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("a frame 200 ms late moves the dots as far as two frames of the display, never the wall's 200 ms", got, [true, true]);

  try {
    got = [240, 60, 30].map(n => {
      const r = markLab(); r.make();
      let i = 0;
      while (r.frame(500 + i * hz(n)) < 100 && i < 2000) i++;
      const took = i * hz(n);
      return took >= 1100 - 0.01 && took < 1100 + hz(n) + 0.01;
    });
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("frames on time still gather in 1100 ms at 240, 60 and 30 Hz", got, [true, true, true]);

  try {
    // Formed at 250 Hz, then the twinkle's timer-paced frames: each moves the clock by the wall's step.
    const r = markLab(); r.make();
    let t = 500, i = 0;
    while (r.frame(t) < 100) t = 500 + ++i * hz(250);
    const at = r.state().ms;
    r.timersTo(t + 66); r.frame(t + 70);
    got = +(r.state().ms - at).toFixed(3);
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("the twinkle after the gather keeps the wall's time", got, 70);

  try {
    const r = markLab(), seen = [];
    r.sb.whenMarkFormed(() => seen.push("no mark, at once"));
    r.make();
    r.sb.whenMarkFormed(() => seen.push("formed " + Math.round(r.sb.performance.now())));
    let t = 400, i = 0;
    while (r.frame(t) < 100) { if (seen.length > 1) seen.push("early"); t = 400 + ++i * hz(250); }
    r.timersTo(t);
    const q = markLab(); q.make();
    q.sb.whenMarkFormed(() => seen.push("no frames, let go at " + Math.round(q.sb.performance.now())));
    q.timersTo(3000);
    got = seen;
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("a wait on the gather runs once it has formed, at once with no mark, and after 1 s without a frame",
    got, ["no mark, at once", "formed 1500", "no frames, let go at 1000"]);

  try {
    got = [];
    // A cold first frame 600 ms after boot, then 250 Hz; the same with no mark; no frames at all.
    const c = markLab(); c.make(); c.sb.maybeStartTour();
    let t = 600, i = 0;
    while (c.frame(t) < 100) t = 600 + ++i * hz(250);
    c.timersTo(4000);
    const n = markLab(); n.sb.maybeStartTour(); n.timersTo(4000);
    const q = markLab(); q.make(); q.sb.maybeStartTour(); q.timersTo(4000);
    got = [c.log, n.log, q.log];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("the first run's tour starts 200 ms after the mark has formed, never before 1300 ms, and a mark that draws nothing holds it no longer",
    got, [[["tour", 1900]], [["tour", 1300]], [["tour", 1300]]]);

  try {
    // A reload in the middle of the tour, parked on a step: the same cold launch, then no mark.
    const park = r => { r.sb.ssGet = () => "name"; r.sb.tourSeen = () => true; r.sb.TOUR_STEPS = [{ id: "load" }, { id: "name" }];
      r.sb.startTour = at => r.log.push(["tour", Math.round(r.sb.performance.now()), at]); };
    const c = markLab(); park(c); c.make(); c.sb.maybeStartTour();
    let t = 600, i = 0;
    while (c.frame(t) < 100) t = 600 + ++i * hz(250);
    c.timersTo(4000);
    const n = markLab(); park(n); n.sb.maybeStartTour(); n.timersTo(4000);
    got = [c.log, n.log];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("a tour resumed after a reload waits for the mark to form as a first run does, and without one comes at 300 ms as before",
    got, [[["tour", 1900, 1]], [["tour", 300, 1]]]);

  try {
    // The same cold launch; then no mark, where the second frame comes 20 ms after boot.
    const c = markLab(); c.make(); c.sb.wireOnOpen();
    let t = 600, i = 0;
    while (c.frame(t) < 100) t = 600 + ++i * hz(250);
    c.timersTo(4000);
    const n = markLab(); n.sb.wireOnOpen(); n.frame(10); n.frame(20); n.timersTo(4000);
    got = [c.log, n.log];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("the boot repaint waits for the mark to form, and without one comes on the second frame as before",
    got, [[["repaint", 1700]], [["repaint", 20]]]);

  try {
    // The same cold launch, then no mark: when boot draws the menu's warm copy.
    const c = markLab(); c.make(); c.sb.wireOnOpen();
    let t = 600, i = 0;
    while (c.frame(t) < 100) t = 600 + ++i * hz(250);
    c.timersTo(4000);
    const n = markLab(); n.sb.wireOnOpen(); n.frame(10); n.frame(20); n.timersTo(4000);
    got = [c.warms, n.warms];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("the menu's warm copy is drawn once, 900 ms after the mark has formed, and 900 ms after boot without one",
    got, [[2600], [900]]);
}
/* THE FIFTH TURNING: fifth.js runs in a VM on a frame queue written here, with a header path node that
   keeps what is written to it. The path the markup ships is held to the line the turn strokes, and
   the clock's three promises are measured: it moves, it holds under a quiet switch, and a late
   frame advances it by one capped step. */
function fifthLab(still) {
  const read = f => fs.readFileSync(path.join(E.ROOT, "src", "modules", f), "utf8");
  const src = read("fifth.js").replace(/^import[^\n]*\n/gm, "").replace(/export\s*\{[^}]*\};?\s*$/, "");
  const tpl = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
  const std = (/<span class="brand-tile"[^>]*><svg[^>]*><g[^>]*><path fill="currentColor" d="([^"]+)"/.exec(tpl) || [])[1] || "";
  let seq = 0, frames = [], watch = null;
  const node = { d: std, sets: 0, attrs: {}, getAttribute: n => (n === "d" ? node.d : node.attrs[n]),
    setAttribute(n, v) { if (n === "d") { node.d = v; node.sets++; } else node.attrs[n] = v; } };
  const doc = { hidden: false, documentElement: {}, querySelector: () => node, addEventListener() {} };
  const sb = {
    still: !!still, mgReduceMotion: () => sb.still, document: doc,
    requestAnimationFrame: fn => { frames.push({ id: ++seq, fn }); return seq; },
    cancelAnimationFrame: id => { frames = frames.filter(f => f.id !== id); },
    MutationObserver: class { constructor(cb) { watch = cb; } observe() {} }
  };
  require("vm").runInNewContext(src + "\nglobalThis.__f = { fifthLinePath, fifthRadius, fifthPhase, fifthStep, fifthBand, fifthLay, wireFifth, FIFTH_PHI0 };", sb);
  const f = sb.__f;
  return { f, node, std, sb, queued: () => frames.length, flip: v => { sb.still = v; watch(); },
    frame: ms => { const run = frames; frames = []; run.forEach(x => x.fn(ms)); } };
}
/* THE LINE, worked out again from the figure's definition and never from the code under test: the centreline
   x = sin(3t + phi), y = sin(2t) at amplitude 96 with a line 20 wide, fitted so the standard figure's ink spans 150
   of the 256 box, as a polyline of 6000 points, and its half width. */
function lineTruth(phi) {
  const A = 96, R = 10, K = 150 / (2 * (A + R)), line = [];
  for (let i = 0; i <= 6000; i++) { const t = i / 6000 * 2 * Math.PI; line.push([128 + K * A * Math.sin(3 * t + phi), 128 + K * A * Math.sin(2 * t)]); }
  return { line, h: R * K };
}
function lineGap(line, p) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.abs(p[0] - a[0]) > 12 || Math.abs(p[1] - a[1]) > 12) continue;
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy));
  }
  return best;
}
/* Points along a path of absolute M, L, C, A and Z, as the mark's set writes it: eight on each cubic, the end of each arc. */
function outlinePoints(d) {
  const tok = d.match(/[MLCAZ]|-?[\d.]+/g) || [], out = [];
  let i = 0, cmd = "", cur = [0, 0];
  const n = () => +tok[i++];
  while (i < tok.length) {
    if (/[MLCAZ]/.test(tok[i])) { cmd = tok[i++]; if (cmd === "Z") continue; }
    if (cmd === "M" || cmd === "L") { cur = [n(), n()]; out.push(cur); }
    else if (cmd === "C") {
      const c = [n(), n(), n(), n(), n(), n()];
      for (let k = 1; k <= 8; k++) { const u = k / 8, g = 1 - u;
        out.push([g * g * g * cur[0] + 3 * g * g * u * c[0] + 3 * g * u * u * c[2] + u * u * u * c[4],
          g * g * g * cur[1] + 3 * g * g * u * c[1] + 3 * g * u * u * c[3] + u * u * u * c[5]]); }
      cur = [c[4], c[5]];
    } else if (cmd === "A") { const a = [n(), n(), n(), n(), n(), n(), n()]; cur = [a[5], a[6]]; out.push(cur); }
    else return [];
  }
  return out;
}
function fifthTests() {
  const W0 = 2 * Math.PI * 0.007, PHI0 = Math.PI / 4;
  let got;
  try {
    const a = fifthLab(false), about = fs.readFileSync(path.join(E.ROOT, "src", "modules", "about.js"), "utf8");
    const aboutD = (/TILE_MARK='[^']*? d="([^"]+)"/.exec(about) || [])[1] || "";
    const tpl = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
    const fav = (/<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,([^"]+)"/.exec(tpl) || [])[1] || "";
    const favD = (/ d='([^']+)'/.exec(decodeURIComponent(fav)) || [])[1] || "";
    got = [a.std.length > 1000, aboutD === a.std, favD === a.std, a.f.FIFTH_PHI0 === PHI0];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("the header, About and the tab icon ship one path, byte for byte",
    got, [true, true, true, true]);

  try {
    const a = fifthLab(false), t = lineTruth(PHI0), out = outlinePoints(a.std), turn = a.f.fifthLinePath(PHI0);
    const atHalf = pts => pts.length > 500 && pts.every(p => Math.abs(lineGap(t.line, p) - t.h) <= 0.03);
    const reaches = pts => t.line.filter((p, i) => i % 20 === 0).every(q => pts.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) <= t.h + 1));
    const t1 = lineTruth(PHI0 + 1), turn1 = outlinePoints(a.f.fifthLinePath(PHI0 + 1));
    got = [atHalf(out), reaches(out), outlinePoints(turn).every(p => lineGap(t.line, p) <= 0.06),
      Math.abs(2 * a.f.fifthRadius() - 2 * t.h) < 0.01, !/Z$/.test(turn) && /Z$/.test(a.f.fifthLinePath(PHI0 + 1)),
      turn1.length > 500 && turn1.every(p => lineGap(t1.line, p) <= 0.06),
      t1.line.filter((p, i) => i % 20 === 0).every(q => turn1.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1)),
      atHalf(out.map(p => [p[0] + 0.5, p[1]])), reaches(out.filter(p => p[0] >= 128))];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("the path shipped is the turning line standing: every point of its outline lies half the line's width from the figure's centreline at pi/4 (within 0.03) and the outline reaches all of it; the turn's centreline at pi/4 lies on the figure's (within 0.06) at the same width, open there and closed at any other phase; at pi/4 + 1 the turn's centreline, both halves of the loop, lies on the figure's (within 0.06) and reaches every point of it (within 1); controls: moved half a unit, or with its left half gone, it is not",
    got, [true, true, true, true, true, true, true, false, false]);

  try {
    const a = fifthLab(false); a.f.wireFifth();
    for (let i = 0; i < 60; i++) a.frame(1000 + i * 1000 / 60);
    const adv = a.f.fifthPhase() - PHI0, segs = d => (d.match(/C/g) || []).length, at = a.node.attrs;
    got = [Math.abs(adv - W0) < 1e-9, a.node.d !== a.std, a.node.sets >= 15 && a.node.sets <= 21, a.queued(),
      segs(a.node.d) > 1.8 * segs(a.f.fifthLinePath(PHI0)) && /Z$/.test(a.node.d),
      [at.fill, at.stroke, at["stroke-linecap"], at["stroke-linejoin"], +at["stroke-width"] === Math.round(200 * a.f.fifthRadius()) / 100]];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("under motion the phase advances at 2 pi times 0.007 per second, the header's path turns, repaints stay at or under 20 a second, frames keep coming, and the turned path is the line stroked round both halves of the loop, at its width with round ends and joins",
    got, [true, true, true, 1, true, ["none", "currentColor", "round", "round", true]]);

  try {
    const a = fifthLab(true); a.f.wireFifth();
    for (let i = 0; i < 60; i++) a.frame(1000 + i * 1000 / 60);
    const held = [a.queued(), a.f.fifthPhase() === PHI0, a.node.d === a.std, a.node.sets, a.node.attrs.stroke];
    const b = fifthLab(false); b.f.wireFifth();
    for (let i = 0; i < 60; i++) b.frame(1000 + i * 1000 / 60);
    b.flip(true);
    got = [held, [b.queued(), b.f.fifthPhase() === PHI0, b.node.d === b.std, b.node.attrs.fill, b.node.attrs.stroke]];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("under a quiet switch nothing is asked for, the phase and the path stay the standard figure, and switching on mid-turn puts the standard figure back, filled and unstroked",
    got, [[0, true, true, 0, undefined], [0, true, true, "currentColor", "none"]]);

  try {
    const a = fifthLab(false); a.f.wireFifth();
    a.frame(1000); a.frame(1000 + 1000 / 60);
    const before = a.f.fifthPhase();
    a.frame(1000 + 1000 / 60 + 3600000);
    const step = a.f.fifthPhase() - before;
    got = [Math.abs(step - W0 / 30) < 1e-12, Math.abs(a.f.fifthStep(PHI0, 3600) - PHI0 - W0 / 30) < 1e-12, a.f.fifthStep(PHI0, -5) === PHI0];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("a frame an hour late advances the phase by one capped step, 1/30 s, and a negative interval by none",
    got, [true, true, true]);

  try {
    const a = fifthLab(false), at0 = a.f.fifthBand(PHI0), at1 = a.f.fifthBand(PHI0 + 1);
    const segs = d => (d.match(/C/g) || []).length, z1 = at1.map(p => p[2]);
    const pairs = at1.every((p, i) => i % 2 === 0 || (Math.abs(p[0] + at1[i - 1][0] - 256) < 1e-9 && Math.abs(p[1] - at1[i - 1][1]) < 1e-9 && Math.abs(p[2] + at1[i - 1][2]) < 1e-12));
    got = [at0.length === 2 * (segs(a.f.fifthLinePath(PHI0)) + 1), at1.length === segs(a.f.fifthLinePath(PHI0 + 1)) + 2,
      Math.min(...z1) < -0.99 && Math.max(...z1) > 0.99, pairs];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("the band holds both halves of the loop at every phase, the standard one included, and each mirrored centre is as far as its pass is near",
    got, [true, true, true, true]);

  try {
    const a = fifthLab(false), lat = { x0: 0.5, y0: 0.5, step: 1, nx: 40, ny: 40 }, out = new Float32Array(1600);
    const to = p => { p[0] = 0.25 * p[0] - 12; p[1] = 0.25 * p[1] - 12; };
    a.f.fifthLay(PHI0, to, 3, 0.5, lat, out);
    const lit = out.reduce((n, v) => n + (v > 0 ? 1 : 0), 0), top = Math.max(...out), dim = Math.min(...[...out].filter(v => v > 0));
    const again = new Float32Array(1600); a.f.fifthLay(PHI0, to, 3, 0.5, lat, again);
    const turned = new Float32Array(1600); a.f.fifthLay(PHI0 + 1.3, to, 3, 0.5, lat, turned);
    const litTurned = turned.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
    got = [lit > 100, top <= 1 && top > 0.9, dim > 0 && dim < 0.5, out.every((v, i) => v === again[i]), litTurned > 1.3 * lit];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("the band laid on a lattice lights the dots inside it, by depth and fading at the rim, the same twice, and more of them where the turned loop's two passes part",
    got, [true, true, true, true, true]);

  try {
    const run = still => {
      const m = markLab(); m.sb.still = still;
      m.sb.fifthPhase = () => 1;
      m.sb.markDots = () => [{ x: 100, y: 0, sx: 0, sy: 0, ph: 0, sp: 1, l: 0 }];
      m.sb.__lay((ds, phi) => { ds.forEach(p => { p.l = Math.abs(phi - 1) < 1e-9 ? 1 : 0; }); });
      m.make();
      let x = null;
      for (let i = 0; i < 150; i++) x = m.frame(500 + i * 1000 / 60);
      return x === null ? null : +x.toFixed(4);
    };
    got = [run(false), run(true)];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("the empty desk's dots are drawn where the band lights them at the clock's phase under motion, and at the standard figure's phase under a quiet switch",
    got, [100, null]);
}
/* THE EMPTY DESK'S MARK IS ONE SOLID, EVEN BAND AT EVERY PHASE OF THE TURN (Maxim, 2026-10-03 19:09: "Currently it's
   very thin and fragile/patchy looking."). empty-mark.js and fifth.js run in a VM over a canvas written here, which
   keeps every dot it is told to draw; its hit test is the circle test the figure's own path allows, so the lab needs
   no browser. The band's true centreline is worked out again from the figure's definition (x = sin(3s + phi),
   y = sin(2s), fitted to 150 of the 256 box, the header's group transform, the canvas scale), never from the code
   under test, and the dots are read against it:
   - FILL: around each of 240 points of the centreline, the dots drawn within 0.8 of the band's radius, over the
     number a full lattice of the desk's pitch holds in that disc (a disc entirely inside the band). A thin or
     patchy stretch is a low fill, a pile of dots a high one;
   - STRAYS: the share of dots farther from the centreline than the band's radius and a pixel. */
function bandLab(phi, still) {
  const read = f => fs.readFileSync(path.join(E.ROOT, "src", "modules", f), "utf8");
  const strip = s => s.replace(/^import[^\n]*\n/gm, "").replace(/export\s*\{[^}]*\};?\s*$/, "");
  const arcs = [], T = { a: 1.0581, b: 0, c: 0, d: 1.0581, e: -7.441, f: -7.441 };
  class Path2D {
    constructor(d) { this.circles = []; const re = /M(-?[\d.]+) (-?[\d.]+)a(-?[\d.]+) /g; let m;
      while ((m = re.exec(d))) this.circles.push([+m[1] + +m[3], +m[2], +m[3]]); }
  }
  const mkCtx = () => {
    let M = [1, 0, 0, 1, 0, 0];
    const ctx = { globalAlpha: 1, clearRect() {}, beginPath() {}, fill() {}, moveTo() {},
      arc(x, y, r) { arcs.push([x, y, r, ctx.globalAlpha]); },
      setTransform(...m) { M = m; },
      transform(a, b, c, d, e, f) { const [A, B, C, D, E_, F] = M;
        M = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E_, B * e + D * f + F]; },
      isPointInPath(path, x, y) { const [a, b, c, d, e, f] = M, det = a * d - b * c;
        const u = (d * (x - e) - c * (y - f)) / det, v = (-b * (x - e) + a * (y - f)) / det;
        return path.circles.some(k => Math.hypot(u - k[0], v - k[1]) <= k[2]); } };
    return ctx;
  };
  const glyph = { parentNode: { transform: { baseVal: { consolidate: () => ({ matrix: T }) } } } };
  const svg = { viewBox: { baseVal: { width: 256 } }, querySelector: () => glyph };
  glyph.parentNode.parentNode = svg;
  const sb = {
    M_MS: { gather: 1100, twinkle: 66 }, mgReduceMotion: () => !!still, Path2D,
    performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout: () => 1, clearTimeout() {}, getComputedStyle: () => ({ color: "#fff" }), devicePixelRatio: 1,
    MutationObserver: class { observe() {} disconnect() {} },
    document: { documentElement: {}, querySelector: sel => sel === ".brand svg" ? svg : null,
      createElement: () => { const ctx = mkCtx(); return { setAttribute() {}, getContext: () => ctx, isConnected: true,
        parentNode: null, remove() { this.parentNode = null; } }; } }
  };
  sb.window = sb;
  const seed = "Math.random = (() => { let s = 7; return () => (s = s * 16807 % 2147483647) / 2147483647; })();\n";
  require("vm").runInNewContext(seed + strip(read("fifth.js")) + "\n" + strip(read("empty-mark.js"))
    + "\nfunction __phase(p){ fifthClock.phi = p; }\nfunction __draw(ms){ drawMark(eMark, ms); }\n", sb);
  const host = { firstChild: null, insertBefore(cv) { cv.parentNode = host; } };
  if (!still) sb.__phase(phi);
  sb.syncEmptyMark(host);
  if (!still) { arcs.length = 0; sb.__draw(5000); }
  return arcs.map(a => [a[0], a[1], a[3]]);
}
/* The band's centreline in canvas pixels at a phase, 2400 points round the whole loop, and its radius. */
function bandTruth(phi) {
  const A = 96, R = 10, K = 150 / (2 * (A + R)), S = 280 / 256, G = 1.0581, T = -7.441, line = [];
  for (let i = 0; i < 2400; i++) {
    const t = i / 2400 * 2 * Math.PI, x = 128 + K * A * Math.sin(3 * t + phi), y = 128 + K * A * Math.sin(2 * t);
    line.push([S * (G * x + T), S * (G * y + T)]);
  }
  return { line, rad: R * K * G * S };
}
function bandStats(dots, phi) {
  const { line, rad } = bandTruth(phi), step = 3.5, rho = 0.8 * rad, full = Math.PI * rho * rho / (step * step);
  let min = Infinity, max = 0, strays = 0;
  for (let i = 0; i < line.length; i += 10) {
    let n = 0;
    for (const d of dots) if (Math.hypot(d[0] - line[i][0], d[1] - line[i][1]) <= rho) n++;
    min = Math.min(min, n / full); max = Math.max(max, n / full);
  }
  for (const d of dots) {
    let best = Infinity;
    for (const p of line) best = Math.min(best, Math.hypot(d[0] - p[0], d[1] - p[1]));
    if (best > rad + 1) strays++;
  }
  return { phi, dots: dots.length, min, max, strays: strays / Math.max(1, dots.length) };
}
function emptyBandTests() {
  const PHI0 = Math.PI / 4, r2 = v => Math.round(v * 100) / 100;
  const phases = [PHI0, 0.5, 1.2, 2, 2.8, 3.6, 4.5, 5.5], solid = s => s.min >= 0.7 && s.max <= 1.5 && s.strays <= 0.02;
  let got;
  try {
    const rows = phases.map(p => bandStats(bandLab(p, false), p)).concat([bandStats(bandLab(PHI0, true), PHI0)]);
    got = rows.filter(s => !solid(s)).map(s => [r2(s.phi), s.dots, r2(s.min), r2(s.max), r2(s.strays)]);
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("the empty desk's mark is one solid, even band at eight phases of the turn and standing still: around every point of its centreline the dots drawn fill 0.7 to 1.5 of a full lattice, and at most 2 per cent stand outside the band (phase, dots, least fill, most fill, strays of each that fails)",
    got, []);
  try {
    const t = bandTruth(2), base = [];
    for (let j = 0; j < 80; j++) for (let i = 0; i < 80; i++) {
      const x = 1.75 + 3.5 * i, y = 1.75 + 3.5 * j;
      if (t.line.some(p => Math.hypot(x - p[0], y - p[1]) < t.rad)) base.push([x, y, 1]);
    }
    const sparse = base.filter((d, i) => i % 2), moved = base.map(d => [d[0] + t.rad + 4, d[1], d[2]]);
    const piled = base.concat(base.map(d => [d[0] + 0.5, d[1] + 0.5, d[2]]));
    got = [solid(bandStats(base, 2)), solid(bandStats(sparse, 2)), solid(bandStats(moved, 2)), solid(bandStats(piled, 2))];
  } catch (e) { got = "the lab threw: " + e.message; }
  eq("the measure sees what it guards, control: an ideal band of lattice dots is solid, with every other dot gone it is not, shifted out of the band it is not, and with every dot doubled it is not",
    got, [true, false, false, false]);
}
/* THE .ec FILE TYPE IS NAMED IN THE INSTALLER'S LANGUAGE: electron-builder writes the English from
   fileAssociations, and shell/installer.nsh's customInstall writes the Polish over it when the
   installer runs in Polish. Read here against electron-builder's own templates and language table;
   what Explorer shows on a Polish Windows is Maxim's to see. */
/* WHAT A BUILD'S INSTALLER WRITES AROUND customInstall, as electron-builder's own makensis
   preprocesses it: the include, then registerFileAssociations only if the build declares a type,
   then installSection.nsh's own lines that insert both. Registry writes come back with the
   LogicLib conditions open around them; a string is a refusal, and so is a registry line the
   reader cannot parse, since a skipped write reads exactly like no write. */
function nsisInstallWrites(root, cfg) {
  const cp = require("child_process");
  const lib = path.join(root, "node_modules", "app-builder-lib");
  const assoc = [].concat(cfg.fileAssociations || [], (cfg.win || {}).fileAssociations || []);
  const include = path.resolve(root, (cfg.directories || {}).buildResources || "build", (cfg.nsis || {}).include || "installer.nsh");
  const sect = fs.readFileSync(path.join(lib, "templates", "nsis", "installSection.nsh"), "utf8");
  const from = sect.indexOf("!ifmacrodef registerFileAssociations"), ins = sect.indexOf("!insertmacro customInstall", from);
  const to = sect.indexOf("!endif", ins);
  if (from < 0 || ins < 0 || to < 0) return "installSection.nsh no longer inserts registerFileAssociations, then customInstall";
  const q = s => String(s).replace(/"/g, "$\\\"");
  const product = cfg.productName || require(path.join(root, "package.json")).productName;
  /* A preprocess-only run reads an include without a BOM in the system code page and refuses its
     Polish; the real compile reads it as UTF-8 under -INPUTCHARSET UTF8, so /CHARSET says so here. */
  const script = ["Unicode true", "!include LogicLib.nsh",
    "!define APP_INSTALLER_STORE_FILE \"etiuda-updater\\installer.exe\"",
    "!define UNINSTALL_REGISTRY_KEY \"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\app\"",
    "!include /CHARSET=UTF8 \"" + include + "\""]
    .concat(assoc.length ? ["!include \"" + path.join(lib, "templates", "nsis", "include", "FileAssociation.nsh") + "\"",
      "!macro registerFileAssociations"].concat([].concat(...assoc.map(a => [].concat(a.ext).map(x =>
        "!insertmacro APP_ASSOCIATE \"" + q(x) + "\" \"" + q(a.name || x) + "\" \"" + q(a.description || "") + "\" \"$appExe,0\" \"Open with "
        + q(product) + "\" \"$appExe $\\\"%1$\\\"\"")))).concat(["!macroend"]) : [])
    .concat(["Section", sect.slice(from, to + 6), "SectionEnd", ""]).join("\n");
  const where = cp.spawnSync(process.execPath, ["-e", "require(process.argv[1]).getMakeNsisPath(process.argv[2] || undefined)"
    + ".then(r => process.stdout.write(JSON.stringify(r)), e => { process.stderr.write(String(e)); process.exit(1); })",
    path.join(lib, "out", "toolsets", "windows.js"), (cfg.toolsets || {}).nsis || ""], { encoding: "utf8" });
  let mk;
  /* The answer is the last line: a first run downloads makensis and logs that on stdout above it. */
  try { mk = JSON.parse(String(where.stdout).trim().split(/\r?\n/).pop()); } catch (e) { return "electron-builder named no makensis: " + String(where.stderr).trim(); }
  const r = cp.spawnSync(mk.path, ["-INPUTCHARSET", "UTF8", "-OUTPUTCHARSET", "UTF8", "-SAFEPPO", "-"],
    /* Off Windows makensis prints in the locale's charset whatever -OUTPUTCHARSET says, and under C a Polish letter comes back "?". */
    { input: script, encoding: "utf8", env: Object.assign({}, process.env, process.platform === "win32" ? {} : { LC_ALL: "C.UTF-8" }, mk.env || {}) });
  if (r.status !== 0) return "makensis refused the script: " + String(r.stdout + r.stderr).trim().split(/\r?\n/).slice(-2).join(" / ");
  const open = [], writes = [];
  for (const line of r.stdout.split(/\r?\n/).map(l => l.trim())) {
    const c = /^StrCmp `([^`]*)` `([^`]*)` `` `([^`]+)`$/.exec(line);
    if (c) { open.push({ when: c[1] + "==" + c[2], label: c[3] }); continue; }
    if (open.length && line === open[open.length - 1].label + ":") { open.pop(); continue; }
    const w = /^((?:Write|Delete)Reg\w+) (\S+) (["'`])(.*?)\3(?: (["'`])(.*?)\5)?(?: (["'`])(.*?)\7)?$/.exec(line);
    if (w) writes.push({ op: w[1], root: w[2], key: w[4], name: w[6], value: w[8], when: open.map(o => o.when).join(" && ") });
    else if (/^(Write|Delete)Reg/i.test(line)) return "a registry line the reader cannot parse: " + line;
  }
  return { include, assoc: assoc.length, writes };
}
function ecTypeNameTests() {
  const root = E.ROOT, lib = path.join(root, "node_modules", "app-builder-lib");
  let got;
  let assoc = [];
  try {
    assoc = (require(path.join(root, "electron-builder.js")).fileAssociations || [])
      .filter(a => [].concat(a.ext).indexOf("ec") > -1);
    got = assoc.map(a => [a.name, a.description]);
  } catch (e) { got = "electron-builder.js threw: " + e.message; }
  eq("one .ec association, whose class and name are the English \"Etiuda catalog\"", got, [["Etiuda catalog", "Etiuda catalog"]]);
  try {
    const nsh = fs.readFileSync(path.join(root, "shell", "installer.nsh"), "utf8");
    const body = (/!macro customInstall\r?\n([\s\S]*?)!macroend/.exec(nsh) || [])[1] || "";
    const w = /\$\{If\} \$LANGUAGE == (\d+)\r?\n\s*WriteRegStr SHELL_CONTEXT "Software\\Classes\\([^"]+)" "" "([^"]+)"/.exec(body);
    const langs = require(path.join(lib, "out", "util", "langs.js"));
    const cfg = require(path.join(root, "electron-builder.js"));
    const asked = (cfg.nsis || {}).installerLanguages;
    const inInstaller = asked == null ? langs.bundledLanguages.indexOf("pl_PL") > -1
      : [].concat(asked).some(l => /^pl([_-]PL)?$/.test(l));
    const ui = fs.readFileSync(path.join(root, "src", "modules", "ui-lang.js"), "utf8");
    const pl = (/\n\s*"Etiuda catalog":"([^"]+)",/.exec(ui) || [])[1];
    got = w ? [+w[1] === langs.lcid.pl_PL, inInstaller, w[2] === (assoc[0] || {}).name, !!pl && w[3] === pl,
      /System::Call 'shell32::SHChangeNotify\(i 0x08000000, i 0, i 0, i 0\)'/.test(body.slice(w.index))]
      : "customInstall writes no name under $LANGUAGE";
  } catch (e) { got = "the installer's include could not be read: " + e.message; }
  eq("in Polish the installer writes the interface's own Polish for \"Etiuda catalog\" over the same class, under electron-builder's LCID for Polish, which the installer carries, and tells the shell",
    got, [true, true, true, true, true]);
  try {
    const sect = fs.readFileSync(path.join(lib, "templates", "nsis", "installSection.nsh"), "utf8");
    const fa = fs.readFileSync(path.join(lib, "templates", "nsis", "include", "FileAssociation.nsh"), "utf8");
    const reg = sect.indexOf("!insertmacro registerFileAssociations"), mine = sect.indexOf("!insertmacro customInstall");
    const un = /!macro APP_UNASSOCIATE [^\n]*\n([\s\S]*?)!macroend/.exec(fa);
    got = [reg > -1 && mine > reg, !!un && /DeleteRegKey SHELL_CONTEXT `Software\\Classes\\\$\{FILECLASS\}`/.test(un[1])];
  } catch (e) { got = "electron-builder's templates could not be read: " + e.message; }
  eq("electron-builder writes its English before customInstall runs, and its uninstaller takes the whole class back, Polish and all",
    got, [true, true]);
  /* The right-click entry: electron-builder's own verb, the English "Open with Etiuda", and in Polish
     the copywriter's words over it, in the same branch and before the shell is told. */
  try {
    const nsh = fs.readFileSync(path.join(root, "shell", "installer.nsh"), "utf8");
    const body = (/!macro customInstall\r?\n([\s\S]*?)!macroend/.exec(nsh) || [])[1] || "";
    const branch = (/\$\{If\} \$LANGUAGE == 1045\r?\n([\s\S]*?)\$\{EndIf\}/.exec(body) || [])[1] || "";
    const verb = /WriteRegStr SHELL_CONTEXT "Software\\Classes\\([^"\\]+)\\shell\\open" "" "([^"]+)"/.exec(branch);
    const fa = fs.readFileSync(path.join(lib, "templates", "nsis", "include", "FileAssociation.nsh"), "utf8");
    const assoc = /!macro APP_ASSOCIATE EXT [^\n]*\n([\s\S]*?)!macroend/.exec(fa);
    const target = fs.readFileSync(path.join(lib, "out", "targets", "nsis", "NsisTarget.js"), "utf8");
    const product = (require(path.join(root, "electron-builder.js")).productName) || require(path.join(root, "package.json")).productName;
    got = [!!assoc && /WriteRegStr SHELL_CONTEXT "Software\\Classes\\\$\{FILECLASS\}\\shell\\open" "" `\$\{COMMANDTEXT\}`/.test(assoc[1]),
      /const commandText = `"Open with \$\{[^`]*productName\)\}"`/.test(target), product,
      verb && verb[1], verb && verb[2], !!verb && branch.indexOf("SHChangeNotify") > branch.indexOf(verb[0])];
  } catch (e) { got = "the installer's include could not be read: " + e.message; }
  eq("the right-click entry for a .ec file is electron-builder's \"Open with Etiuda\" under the class's open verb, and a Polish installer writes \"Otwórz w Etiudzie\" there before telling the shell",
    got, [true, true, "Etiuda", "Etiuda catalog", "Otwórz w Etiudzie", true]);
  /* Read as makensis reads it: the desk's installer writes the Polish over its own type only when
     Polish, and a build that declares no type, which is how Studio includes this file, writes
     nothing under Classes in any language while customInstall's other work still runs. */
  const cfgNow = require(path.join(root, "electron-builder.js"));
  const own = new Set([].concat(...(cfgNow.fileAssociations || []).map(a => [].concat(a.ext).map(x => "." + x).concat([a.name]))));
  const classes = r => r.writes.filter(w => /^Software\\Classes(\\|$)/i.test(w.key) || /^(HKCR|HKEY_CLASSES_ROOT)(32|64)?$/i.test(w.root));
  const desk = nsisInstallWrites(root, cfgNow);
  got = typeof desk === "string" ? desk : [classes(desk).filter(w => w.when).map(w => [w.key, w.value, w.when]),
    classes(desk).every(w => own.has(w.key.split("\\")[2]))];
  eq("makensis reads the desk's installer writing only its own type's keys, and in Polish the name and the open verb",
    got, [[["Software\\Classes\\Etiuda catalog", "Katalog Etiudy", "$LANGUAGE==1045"],
      ["Software\\Classes\\Etiuda catalog\\shell\\open", "Otwórz w Etiudzie", "$LANGUAGE==1045"]], true]);
  const bare = nsisInstallWrites(root, Object.assign({}, cfgNow, { fileAssociations: [] }));
  got = typeof bare === "string" ? bare : [bare.assoc, classes(bare).map(w => [w.key, w.value, w.when]),
    bare.writes.some(w => w.name === "InstallLocation" && w.value === "$INSTDIR")];
  eq("the same include in a build that declares no file type writes nothing under Classes in any language, and still writes InstallLocation",
    got, [0, [], true]);
}
/* THE MENU'S FIRST OPEN IS PAID FOR BEFORE IT (E9): warmMenu is sliced out of header-menus.js with the
   one openSettingsMenu that marks the menu drawn, and run on a small element model written here; when
   boot asks for it is the mark lab's. Whether the first open now runs as smoothly as the second is a
   per-frame measurement in a window, the verifier's. */
function menuWarmTests() {
  const src = fs.readFileSync(path.join(E.ROOT, "src", "modules", "header-menus.js"), "utf8");
  class El {
    constructor(attrs, kids) {
      this.attrs = Object.assign({}, attrs); this.kids = kids || []; this.parent = null; this.inert = false;
      this.kids.forEach(k => { k.parent = this; });
      this.cls = new Set((this.attrs.class || "").split(" ").filter(Boolean)); delete this.attrs.class;
      const self = this;
      this.classList = { add: c => self.cls.add(c), remove: c => self.cls.delete(c), contains: c => self.cls.has(c) };
    }
    get hidden() { return "hidden" in this.attrs; }
    set hidden(v) { if (v) this.attrs.hidden = ""; else delete this.attrs.hidden; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    removeAttribute(k) { delete this.attrs[k]; }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    cloneNode() { const c = new El(Object.assign({ class: [...this.cls].join(" ") }, this.attrs), this.kids.map(k => k.cloneNode())); return c; }
    querySelectorAll() { const out = []; const walk = n => n.kids.forEach(k => { out.push(k); walk(k); }); walk(this); return out; }
    after(n) { const p = this.parent, i = p.kids.indexOf(this); p.kids.splice(i + 1, 0, n); n.parent = p; }
    remove() { const p = this.parent; if (p) { p.kids.splice(p.kids.indexOf(this), 1); this.parent = null; } }
  }
  const lab = () => {
    const item = t => new El({ type: "button", role: "menuitem", title: t, id: "m" + t });
    const menu = new El({ class: "menu", id: "settingsMenu", hidden: "", role: "menu" }, [item("a"), new El({ class: "menu-sep" }), item("b")]);
    const btn = new El({ id: "settingsBtn" });
    const wrap = new El({ id: "settingsWrap" }, [btn, menu]);
    let clock = 0, frames = [], timers = [];
    const sb = {
      $: sel => (sel === "#settingsMenu" ? menu : sel === "#settingsBtn" ? btn : null),
      requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
      setTimeout: (fn, ms) => { timers.push({ at: clock + ms, fn }); return timers.length; },
      closeFactsPanel() {}, cutLeaves() {}, syncSettingsMenu() {}, takeKeyboard() {}
    };
    require("vm").runInNewContext([extractDecl(src, "let menuDrawn="), extractDecl(src, "function warmMenu("),
      extractDecl(src, "function openSettingsMenu(")].join("\n"), sb);
    const frame = () => { const run = frames; frames = []; run.forEach(f => f()); };
    const to = t => { clock = t; timers.filter(x => x.at <= t).forEach(x => { timers.splice(timers.indexOf(x), 1); x.fn(); }); };
    const copies = () => wrap.kids.filter(k => k.cls.has("e-warm"));
    return { sb, menu, wrap, frame, to, copies };
  };
  let got;
  try {
    const r = lab();
    r.sb.warmMenu();
    const c = r.copies()[0], all = c ? [c].concat(c.querySelectorAll()) : [];
    const seen = [r.copies().length, r.wrap.kids.indexOf(c) === r.wrap.kids.indexOf(r.menu) + 1, c && !c.hidden,
      c && c.getAttribute("aria-hidden"), c && c.inert, c && c.cls.has("menu"),
      all.filter(n => ["id", "role", "title"].some(a => n.getAttribute(a) != null)).length,
      r.menu.hidden, r.menu.getAttribute("id"), r.menu.kids[0].getAttribute("id")];
    r.frame(); r.frame(); const after2 = r.copies().length; r.frame();
    got = [seen, after2, r.copies().length];
  } catch (e) { got = "the menu lab threw: " + e.message; }
  eq("warmMenu draws one copy of the menu beside it, shown, aria-hidden and inert, with no id, role or title, the menu itself untouched, and takes it away on the third frame",
    got, [[1, true, true, "true", true, true, 0, true, "settingsMenu", "ma"], 1, 0]);
  try {
    const q = lab(); q.sb.warmMenu(); q.to(999); const held = q.copies().length; q.to(1000);
    const twice = lab(); twice.sb.warmMenu(); twice.frame(); twice.frame(); twice.frame(); twice.sb.warmMenu();
    const opened = lab(); opened.sb.openSettingsMenu(false); opened.menu.hidden = true; opened.sb.warmMenu();
    const open = lab(); open.menu.hidden = false; open.sb.warmMenu();
    got = [held, q.copies().length, twice.copies().length, opened.copies().length, open.copies().length];
  } catch (e) { got = "the menu lab threw: " + e.message; }
  eq("without frames the copy goes at 1000 ms, and none is drawn a second time, after the menu has opened, or while it is open",
    got, [1, 0, 0, 0, 0]);
  const tpl = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
  const rule = /\n\.menu\.e-warm:not\(\[hidden\]\)\{([^}]*)\}/.exec(tpl);
  const op = rule && /opacity:([.0-9]+)/.exec(rule[1]);
  eq("the copy is drawn at a trace, never animated, never pressed, by a rule that outranks the menu's own entrance",
    rule ? [+op[1] > 0 && +op[1] < 0.01, /animation:none/.test(rule[1]), /pointer-events:none/.test(rule[1]),
      /\n\.menu\.e-warm \*\{pointer-events:none!important\}/.test(tpl)] : "no .menu.e-warm rule", [true, true, true, true]);
}
/* EVERY CLOSE FADES OUT ON THE DISMISS TIER (feel pass motion-9, ruled 2026-09-26 13:14): the three
   helpers are sliced out of motion.js and run on a small element model written here, and each
   surface's closer and opener is asked for its call. The fade itself is the verifier's frames. */
function dismissFakeDom() {
  class El {
    constructor(tag, attrs) {
      this.tag = tag; this.attrs = Object.assign({}, attrs || {}); this.kids = []; this.parent = null;
      this.cls = new Set((this.attrs.class || "").split(" ").filter(Boolean)); delete this.attrs.class;
      this.value = this.attrs.value || ""; this.checked = false; this.scrollTop = 0; this.hidden = false; this.inert = false;
      this.style = { cssText: "" }; this.heard = {};
      const self = this;
      this.classList = { add: c => self.cls.add(c), remove: c => self.cls.delete(c), contains: c => self.cls.has(c) };
    }
    add(...k) { k.forEach(x => { x.parent = this; this.kids.push(x); }); return this; }
    get className() { return [...this.cls].join(" "); }
    set className(v) { this.cls = new Set(String(v).split(" ").filter(Boolean)); }
    get firstChild() { return this.kids[0] || null; }
    get isConnected() { let n = this; while (n.parent) n = n.parent; return n.root === true; }
    all() { return this.kids.reduce((a, k) => a.concat([k], k.all()), []); }
    querySelectorAll(sel) {
      const all = this.all();
      if (sel === "*") return all;
      if (sel === "[id]") return all.filter(n => n.attrs.id != null);
      return all.filter(n => ["input", "textarea", "select"].indexOf(n.tag) > -1);
    }
    getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(t, fn) { (this.heard[t] = this.heard[t] || []).push(fn); }
    fire(t, target) { (this.heard[t] || []).forEach(fn => fn({ target: target || this })); }
    remove() { if (!this.parent) return; this.parent.kids.splice(this.parent.kids.indexOf(this), 1); this.parent = null; }
    appendChild(n) { n.remove(); n.parent = this; this.kids.push(n); return n; }
    after(n) { n.remove(); const p = this.parent; p.kids.splice(p.kids.indexOf(this) + 1, 0, n); n.parent = p; }
    cloneNode() {
      const c = new El(this.tag, Object.assign({}, this.attrs, { class: [...this.cls].join(" ") }));
      c.style.cssText = this.style.cssText;
      this.kids.forEach(k => c.add(k.cloneNode(true)));
      return c;
    }
  }
  const doc = new El("body"); doc.root = true;
  return { El, doc };
}
function dismissTierTests() {
  const motion = fs.readFileSync(path.join(E.ROOT, "src", "modules", "motion.js"), "utf8");
  const timers = [];
  let still = false, H = null;
  try {
    H = new Function("mgReduceMotion", "M_MS", "setTimeout",
      ["const dismissing=", "function leaveNode(", "function dismissNode(", "function dismissCopy(", "function cutLeaves("]
        .map(m => extractDecl(motion, m)).join("\n") + "\nreturn {dismissNode,dismissCopy,cutLeaves};")(
      () => still, { dismiss: 80 }, (fn, ms) => { timers.push([fn, ms]); return timers.length; });
  } catch (e) { H = null; }
  eq("motion.js carries dismissNode, dismissCopy and cutLeaves", !!H, true);
  if (H) dismissHelperTests(H, timers, v => { still = v; });
  still = false;
  if (H) menuScreenTests(H);
  if (H) leavingCopyTests(H);
  dismissWiringTests();
}
function dismissHelperTests(H, timers, setStill) {
  const { El, doc } = dismissFakeDom();

  // A node on its way out: ids gone with its state, inert, fading, and gone when its own fade ends.
  const btn = new El("button", { id: "ecYes" });
  const offer = new El("div", { id: "eCatalogOffer", class: "bub bub-ask" }).add(new El("p").add(btn));
  doc.add(offer);
  H.dismissNode(offer);
  eq("a closing surface stays in the page for its fade, inert, hidden from assistive technology, wearing e-gone",
    [offer.isConnected, offer.inert, offer.getAttribute("aria-hidden"), offer.classList.contains("e-gone")], [true, true, "true", true]);
  eq("and it answers to none of its ids, so a lookup asking whether it is open is told no",
    [offer.getAttribute("id"), btn.getAttribute("id")], [null, null]);
  offer.fire("animationend", btn);
  eq("a fade inside it that ends does not take it away", offer.isConnected, true);
  offer.fire("animationend");
  eq("its own fade ending does", offer.isConnected, false);
  eq("and a timer on the tier stands behind the fade, for a window that paints no frames",
    timers.length && timers[timers.length - 1][1], 200);

  // A surface that stays: a copy after it, with what was typed and scrolled, ids kept for the sheet.
  const inp = new El("input", { id: "factsEdit" }), list = new El("div", { class: "list" });
  const panel = new El("div", { id: "factsPanel", class: "facts-panel" }).add(inp, list);
  const wrap = new El("div", { class: "menu-wrap" }).add(panel, new El("span"));
  doc.add(wrap);
  inp.value = "typed"; list.scrollTop = 140;
  H.dismissCopy(panel);
  const copy = wrap.kids[1];
  eq("a surface that stays leaves as a copy placed straight after it, so a lookup by id finds the original first",
    [wrap.kids[0] === panel, copy !== panel && copy.classList.contains("e-gone"), copy.getAttribute("id")], [true, true, "factsPanel"]);
  eq("the copy carries what was typed and how far it was scrolled",
    [copy.kids[0].value, copy.kids[1].scrollTop], ["typed", 140]);
  const into = new El("div"); doc.add(into);
  const card = new El("div", { id: "tourCard", class: "tour-card bub" }); card.style.cssText = "top:10px";
  doc.add(new El("div", { id: "tourRoot" }).add(card));
  H.dismissCopy(card, "opacity:1", into);
  eq("a copy lifted out of a root that hides keeps its own place and takes what the root gave it",
    into.kids.length === 1 && into.kids[0].style.cssText, "top:10px;opacity:1");
  panel.hidden = true;
  const before = wrap.kids.length;
  H.dismissCopy(panel);
  eq("a surface already hidden leaves nothing behind", wrap.kids.length, before);

  // A surface opening ends every leave at once; stilled, nothing leaves at all.
  const sure = new El("div", { id: "eSure", class: "modal" }); doc.add(sure);
  H.dismissNode(sure);
  H.cutLeaves();
  eq("a surface that opens ends every leave in the same task", [sure.isConnected, copy.isConnected], [false, false]);
  setStill(true);
  const quiet = new El("div", { id: "notePane" }); doc.add(quiet);
  const menu = new El("div", { id: "moreMenu", class: "menu" }), mw = new El("div").add(menu); doc.add(mw);
  H.dismissNode(quiet); H.dismissCopy(menu);
  eq("stilled, a closing node goes at once and a staying one leaves no copy", [quiet.isConnected, mw.kids.length], [false, 1]);

}
function dismissWiringTests() {
  // Every surface's closer leaves on the tier and every opener cuts the leaves.
  const src = f => fs.readFileSync(path.join(E.ROOT, "src", "modules", f), "utf8");
  const has = (f, marker, needle) => { try { return extractDecl(src(f), marker).indexOf(needle) > -1; } catch (e) { return false; } };
  eq("each closer leaves on the dismiss tier: the dialog, the loose content's question, the undo, the name, the offer, the note, the menus, quick facts, the tour", [
    has("dialog.js", "function closeModal(", "leaveModal();"), has("dialog.js", "function leaveModal(", "dismissNode(g)"),
    has("catalog-file.js", "function askLoose(", "dismissNode(el)"), has("ui-lang.js", "function offerUndo(", "dismissNode(el)"),
    has("agent.js", "function askAgentName(", "dismissNode(wrap)"), has("catalog-offer.js", "function eOfferCatalogDialog(", "dismissNode(wrap)"),
    has("note-pane.js", "function closeNotePane(", "dismissNode(notePaneEl)"),
    has("header-menus.js", "function closeMoreMenu(", "dismissCopy(m)"), has("header-menus.js", "function closeSettingsMenu(", "dismissCopy(menu)"),
    has("facts.js", "function closeFactsPanel(", "dismissCopy(p)"), has("tour.js", "function endTour(", "dismissCopy(els.card")],
    [true, true, true, true, true, true, true, true, true, true, true]);
  eq("each opener ends the leaves first", [
    has("dialog.js", "function openDialog(", "cutLeaves()"), has("catalog-file.js", "function askLoose(", "cutLeaves()"),
    has("ui-lang.js", "function offerUndo(", "cutLeaves()"), has("agent.js", "function askAgentName(", "cutLeaves()"),
    has("catalog-offer.js", "function eOfferCatalogDialog(", "cutLeaves()"), has("note-pane.js", "function openNotePane(", "cutLeaves()"),
    has("header-menus.js", "function openMoreMenu(", "cutLeaves()"), has("header-menus.js", "function openSettingsMenu(", "cutLeaves()"),
    has("facts.js", "function openFactsPanel(", "cutLeaves()"), has("tour.js", "function startTour(", "cutLeaves()")],
    [true, true, true, true, true, true, true, true, true, true]);
  const tpl = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
  eq("the sheet fades e-gone on the dismiss tier, opacity only, and holds what is inside it still",
    [/\.e-gone\{animation:eLeave var\(--m-dismiss\) ease forwards!important;pointer-events:none!important\}/.test(tpl),
     /\.e-gone \*\{animation:none!important;transition:none!important\}/.test(tpl), /@keyframes eLeave\{to\{opacity:0\}\}/.test(tpl)],
    [true, true, true]);
  const q = [["dialog.js", "function openCover(", ":not(.e-gone)"], ["empty-mark.js", "function dialogStanding(", ":not(.e-gone)"],
             ["tour.js", "function syncTourBehind(", ".modal:not([hidden]):not(.e-gone)"], ["tour.js", "function syncTourBehind(", ".bub-ask:not(.e-gone)"]];
  eq("nothing that asks whether a window or a question is up counts one that is leaving", q.map(x => has(x[0], x[1], x[2])), [true, true, true, true]);
}
/* A SCREEN OPENED FROM A MENU ROW (feel pass motion-9, the one chain that cross-faded): it opens
   while the menu is up, so it keeps the Menu button as its opener, and the menu leaves no copy. */
function menuScreenTests(H) {
  const src = f => fs.readFileSync(path.join(E.ROOT, "src", "modules", f), "utf8");
  {
    const { El, doc } = dismissFakeDom();
    const hm = src("header-menus.js");
    const menu = new El("div", { id: "settingsMenu", class: "menu" }), wrap = new El("div").add(menu);
    doc.add(wrap);
    const btn = { classList: { remove() {} }, setAttribute() {} };
    let C = null, M = null;
    try {
      C = new Function("$", "heldMenu", "giveFocusBack", "dismissCopy",
        extractDecl(hm, "function closeSettingsMenu(") + "\nreturn closeSettingsMenu;")(
        s => s === "#settingsMenu" ? menu : s === "#settingsBtn" ? btn : null, () => null, () => {}, H.dismissCopy);
      M = new Function("closeSettingsMenu", extractDecl(hm, "function menuScreen(") + "\nreturn menuScreen;")(C);
    } catch (e) { M = null; }
    if (C) C();
    eq("closed on its own, the menu fades as a copy after it",
      C ? [menu.hidden, wrap.kids.length, !!wrap.kids[1] && wrap.kids[1].classList.contains("e-gone")] : "no closeSettingsMenu", [true, 2, true]);
    H.cutLeaves();
    menu.hidden = false;
    const saw = [];
    if (M) M(() => { saw.push(menu.hidden); H.cutLeaves(); });
    eq("a screen opened from a menu row opens while the menu is up, and the menu then goes with no fading copy",
      M ? [saw, menu.hidden, wrap.kids.length] : "no menuScreen in header-menus.js", [[false], true, 1]);
    let wire = "";
    try { wire = extractDecl(hm, "function wireHeaderMenus("); } catch (e) { wire = ""; }
    eq("each menu row that opens a screen goes through menuScreen",
      ["menuScreen(hooks.openSettings)", "menuScreen(hooks.openManage)", "menuScreen(hooks.startTour)", "menuScreen(openAbout)"]
        .map(s => wire.indexOf(s) > -1), [true, true, true, true]);
  }
}
/* THE HANG WINDOW'S RESTART (the "not responding" question): the page is ended first and reloaded
   once it has gone, marked like every reload after a stop. The shell's page watch is sliced and run
   on a window model whose recovery window answers at once; the recovery itself is the verifier's. */
function pageWatchTests() {
  const shell = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  const recovering = new Set(), log = [], answers = [], wcOn = {}, winOn = {};
  let clock = 1000000;
  const wc = { id: 7, on: (t, fn) => { wcOn[t] = fn; },
    reload() { log.push(recovering.delete(7) ? "reload marked" : "reload unmarked"); },
    forcefullyCrashRenderer() { log.push("kill"); } };
  const win = { webContents: wc, on: (t, fn) => { winOn[t] = fn; }, isDestroyed: () => false, close() { log.push("close"); } };
  const askInWindow = (w, message) => { log.push("asks " + message); const r = answers.shift(); return { then: fn => fn({ response: r }) }; };
  const words = { gone: "gone", hung: "hung", restart: "Restart", close: "Close", wait: "Wait" };
  // A system box, which the watch must not reach for, is logged as one so a regression reads plainly.
  const dialog = { showMessageBox: (w, o) => { log.push("system box " + o.message); const r = answers.shift(); return { then: fn => fn({ response: r }) }; } };
  let watch = null;
  try {
    watch = new Function("recovering", "askInWindow", "dialog", "PLACED_ASIDE", "shellWords", "console", "Date",
      extractDecl(shell, "function watchPage(") + "\nreturn watchPage;")(
      recovering, askInWindow, dialog, false, () => words, { error() {} }, { now: () => clock });
  } catch (e) { watch = null; }
  if (!watch) { eq("shell/main.js carries the page watch as watchPage(win)", false, true); return; }
  watch(win);
  const step = fn => { log.length = 0; fn(); return log.slice(); };
  const gone = reason => () => wcOn["render-process-gone"]({}, { reason: reason, exitCode: 1 });
  eq("the first loss reloads the page at once, marked", step(gone("crashed")), ["reload marked"]);
  eq("the loss is kept on the page for the host answer, with its reason, exit code and time",
    wc.etiudaLost, { reason: "crashed", exitCode: 1, at: clock });
  clock += 10000; answers.push(0);
  eq("a second loss within a minute asks in the recovery window, and its Restart reloads, marked",
    step(gone("crashed")), ["asks gone", "reload marked"]);
  clock += 10000; answers.push(1);
  eq("and its Close closes the window", step(gone("crashed")), ["asks gone", "close"]);
  answers.push(0);
  eq("the hang window's Wait leaves the page alone", step(() => winOn.unresponsive()), ["asks hung"]);
  answers.push(1);
  eq("the hang window's Restart ends the page and sends no reload while the old page is still going",
    step(() => winOn.unresponsive()), ["asks hung", "kill"]);
  eq("the reload comes once the old page has gone, marked, and that loss asks nothing", step(gone("killed")), ["reload marked"]);
  clock += 120000;
  eq("a loss a minute after the last counts as a first again", step(gone("crashed")), ["reload marked"]);
  eq("the shell asks nothing in a system message box any more", /showMessageBox/.test(shell), false);
}

/* THE RECOVERY WINDOW IS ETIUDA'S OWN: a small window with a renderer of its own, carrying a page
   with no script, in the desk's language and theme, whose links answer at will-navigate. Sliced out
   of the shell and run on a window model over a scratch folder; how it looks is Maxim's to see. */
function recoveryWindowTests() {
  const shell = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  const made = [], tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "etiuda-recovery-legs-"));
  class FakeWin {
    constructor(o) {
      const self = this;
      this.o = o; this.wcOn = {}; this.winOn = {}; this.file = ""; this.closed = false; this.shown = "";
      this.webContents = { on: (t, fn) => { self.wcOn[t] = fn; }, setWindowOpenHandler: fn => { self.opener = fn; } };
      made.push(this);
    }
    on(t, fn) { this.winOn[t] = fn; }
    once(t, fn) { this.winOn[t] = fn; }
    isDestroyed() { return this.closed; }
    close() { if (this.closed) return; this.closed = true; if (this.winOn.closed) this.winOn.closed(); }
    loadFile(f) { this.file = f; }
    show() { this.shown = "show"; }
    showInactive() { this.shown = "inactive"; }
  }
  class NowPromise { constructor(ex) { this.settled = false; ex(v => { if (!this.settled) { this.settled = true; this.value = v; } }); } }
  const EN = { lang: "en", gone: "Etiuda stopped unexpectedly.", restart: "Restart", close: "Close Etiuda" };
  const PL = { lang: "pl", gone: "Etiuda niespodziewanie się zatrzymała.", restart: "Uruchom ponownie", close: "Zamknij Etiudę" };
  const load = (words, dark, aside, fsUsed) => {
    try {
      return new Function("BrowserWindow", "nativeTheme", "shellWords", "PLACED_ASIDE", "OFFSCREEN", "OFFSCREEN_SHOWN",
        "offscreenAt", "console", "Promise", "fs", "path", "os", "process",
        ["function policyFor(", "function recoveryDoc(", "const RECOVERY_SIZE", "function askInWindow("]
          .map(m => extractDecl(shell, m)).join("\n") + "\nreturn { recoveryDoc, askInWindow };")(
        FakeWin, { shouldUseDarkColors: dark }, () => words, aside, aside, false, () => ({ x: 9000, y: 9000 }),
        { error() {} }, NowPromise, fsUsed || fs, path, { tmpdir: () => tmp }, { pid: 4242 });
    } catch (e) { return null; }
  };
  const R = load(PL, false, false);
  if (!R) { eq("shell/main.js carries recoveryDoc and askInWindow", false, true); return; }
  const parent = { getBounds: () => ({ x: 100, y: 100, width: 1200, height: 800 }) };
  const ask = (Rr, message, buttons, signal) => { made.length = 0; const p = Rr.askInWindow(parent, message, buttons, signal); return { p, w: made[0] }; };
  const doc = w => { try { return fs.readFileSync(w.file, "utf8"); } catch (e) { return ""; } };

  const a = ask(R, PL.gone, [PL.restart, PL.close]);
  const o = (a.w && a.w.o) || {}, wp = o.webPreferences || {};
  eq("a second stop opens a window of its own over the desk: modal to it, centred on it, frameless and fixed in size, with no script and a sandbox",
    [made.length, o.parent === parent, o.modal, o.frame, o.resizable, o.x, o.y, o.width, o.height, wp.javascript, wp.sandbox, wp.nodeIntegration],
    [1, true, true, false, false, 500, 444, 400, 112, false, true, false]);
  const d = doc(a.w);
  const links = [...d.matchAll(/<a href="\?answer-(\d)"( class="go" autofocus)?>([^<]*)<\/a>/g)].map(m => [+m[1], !!m[2], m[3]]);
  eq("its page is a file of the desk's language, carries no script under a policy refusing any, and asks in one line with the two choices as links, the leading one filled, focused and last",
    [a.w && a.w.file === path.join(tmp, "etiuda-recovery-4242.html"), /^<!DOCTYPE html>\n<html lang="pl">\n<meta charset="utf-8">/.test(d),
     /script-src 'none'/.test(d), /<script/i.test(d), (/<h1>([^<]*)<\/h1>/.exec(d) || [])[1], links],
    [true, true, true, false, PL.gone, [[1, false, PL.close], [0, true, PL.restart]]]);
  eq("the page keeps the arrow, cannot be selected, drags by its ground, and has a dark face and a high-contrast ring",
    [/body\{[^}]*cursor:default/.test(d), /a\{[^}]*cursor:default/.test(d), /user-select:none/.test(d), /-webkit-app-region:drag/.test(d),
     /@media \(prefers-color-scheme:dark\)/.test(d), /@media \(forced-colors:active\)/.test(d)],
    [true, true, true, true, true, true]);
  a.w.winOn["ready-to-show"]();
  const base = "file:///" + a.w.file.split(path.sep).join("/");
  const nav = url => { let prevented = false; a.w.wcOn["will-navigate"]({ preventDefault() { prevented = true; } }, url); return prevented; };
  const stopped = [nav("https://example.com/"), nav(base + "?answer-7")];
  const unsettled = !a.p.settled;
  const chose = nav(base + "?answer-1");
  eq("it shows when drawn, refuses every navigation and new window, passes over a query that is no choice, answers the chosen link's index, closes and takes its file away",
    [a.w.shown, stopped, a.w.opener && a.w.opener().action, unsettled, chose, a.p.value, a.w.closed, fs.existsSync(a.w.file)],
    ["show", [true, true], "deny", true, true, { response: 1 }, true, false]);

  const b = ask(R, PL.gone, [PL.restart, PL.close]);
  b.w.wcOn["before-input-event"]({ preventDefault() {} }, { type: "keyDown", key: "Escape" });
  const c = ask(R, PL.gone, [PL.restart, PL.close]);
  c.w.close();
  const ac = new AbortController(), h = ask(R, "hung", ["Wait", "Restart"], ac.signal);
  ac.abort();
  eq("Escape and a close both answer the first choice, and an abort closes the window unanswered",
    [b.p.value, b.w.closed, c.p.value, h.p.value, h.w.closed], [{ response: 0 }, true, { response: 0 }, { response: -1 }, true]);

  const D = load(EN, true, true), s = ask(D, 'a <b> & "c"', ["x", "y"]);
  s.w.winOn["ready-to-show"]();
  const sd = doc(s.w);
  eq("an English desk in dark gets an English page on the dark panel; the harness's placed-aside window gets a placed-aside one, never shown; words are escaped",
    [/<html lang="en">/.test(sd), s.w.o.backgroundColor, a.w.o.backgroundColor, s.w.o.focusable, s.w.o.x, s.w.shown,
     (/<h1>([^<]*)<\/h1>/.exec(sd) || [])[1]],
    [true, "#1d1f24", "#ffffff", false, 9000, "", "a &lt;b&gt; &amp; &quot;c&quot;"]);
  s.w.close();

  const N = load(EN, false, false, Object.assign({}, fs, { writeFileSync() { throw new Error("refused"); } }));
  const n = N ? ask(N, EN.gone, [EN.restart, EN.close]) : { p: {} };
  eq("where its page cannot be written no window opens and the first choice is taken at once",
    [made.length, n.p.value], [0, { response: 0 }]);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* the system cleans its own */ }
}

/* THE LEAVING COPIES KEEP THEIR LOOK AND PLACE: a dialog's copy wears the card's own classes and
   style, and the tour's copies leave the root that hides, on the element model above. */
function leavingCopyTests(H) {
  const src = f => fs.readFileSync(path.join(E.ROOT, "src", "modules", f), "utf8");
  {
    const { El, doc } = dismissFakeDom();
    const card = new El("div", { class: "modal-card about-modal" }), inside = new El("div", { class: "about-body" });
    card.style.cssText = "width:640px";
    card.add(inside);
    const modal = new El("div", { id: "modal", class: "modal" }).add(new El("div", { class: "modal-bg" }), card);
    doc.add(modal);
    let leave = null;
    try {
      leave = new Function("modalEl", "modalCard", "mgReduceMotion", "document", "dismissNode",
        extractDecl(src("dialog.js"), "function leaveModal(") + "\nreturn leaveModal;")(
        modal, card, () => false, { createElement: t => new El(t), body: doc }, H.dismissNode);
    } catch (e) { leave = null; }
    if (leave) leave();
    const g = doc.kids[doc.kids.length - 1], c = g && g.kids[1];
    eq("a closing dialog leaves as a copy wearing the card's own classes and style, holding what it showed",
      leave ? [g !== modal && g.classList.contains("e-gone"), c && c.className, c && c.style.cssText, !!c && c.kids[0] === inside, card.kids.length]
        : "no leaveModal in dialog.js",
      [true, "modal-card about-modal", "width:640px", true, 0]);
  }
  {
    const { El, doc } = dismissFakeDom();
    const card = new El("div", { id: "tourCard", class: "tour-card bub" }), hole = new El("div", { id: "tourHole" });
    card.style.cssText = "left:40px"; hole.style.cssText = "top:5px"; hole.style.display = "block";
    const root = new El("div", { id: "tourRoot", class: "on" }).add(card, hole);
    doc.add(root);
    let end = null;
    try {
      end = new Function("tourRunning", "tourIdx", "tourEls", "getComputedStyle", "dismissCopy", "document",
        "runTourStepUndo", "closeSettingsMenu", "clearTourFocus", "tourTargetRO", "markTourDone", "markTourInviteDismissed",
        "ssDel", "TOUR_AT", "toast", "focusIntentOnOpen", "tourAfter",
        extractDecl(src("tour.js"), "function endTour(") + "\nreturn endTour;")(
        true, 2, () => ({ root, card, hole, field: null, arrow: null }), () => ({ zIndex: "30" }), H.dismissCopy, { body: doc },
        () => {}, () => {}, () => {}, null, () => {}, () => {}, () => {}, "t", () => {}, () => {}, []);
    } catch (e) { end = null; }
    if (end) end(true);
    const lifted = doc.kids.filter(k => k.classList.contains("e-gone"));
    eq("the tour's bubble and ring leave as copies lifted out of the root that hides, at its height and fully shown",
      end ? [lifted.length, root.kids.filter(k => k.classList.contains("e-gone")).length,
             lifted.map(k => k.style.cssText.indexOf("z-index:30;opacity:1") > -1)] : "no endTour in tour.js",
      [2, 0, [true, true]]);
  }
}

/* THE SHIPPED FILE'S FLAG, end to end in node: the host answer computes it, the preload hands it to
   the page, and About and the offer read it. Each half is run, not read. */
function shippedFlagTests() {
  const shell = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  const B = String.fromCharCode(92);
  const inAsar = ["C:", "Users", "someone", "AppData", "Local", "Programs", "Etiuda", "resources", "app.asar", "shell"].join(B);
  const own = ["C:", "Users", "someone", "Documents", "Etiuda"].join(B);
  let S = null;
  try {
    S = new Function("path", "BUILT_IN_DIR", ["function isBuiltIn(", "function folderShown("]
      .map(m => extractDecl(shell, m)).join("\n") + "\nreturn {isBuiltIn,folderShown};")(path.win32, inAsar);
  } catch (e) { S = null; }
  const answer = (from) => {
    let handler = null;
    try {
      new Function("ipcMain", "fromEngine", "BrowserWindow", "process", "hostBackdrop", "catalogFolder",
        "path", "catalogFrom", "folderShown", "isBuiltIn", "catalogMtime", "openedWith",
        "openedRefused", "recovering", "deskFile", "os", "hostAccent",
        extractDecl(shell, 'ipcMain.on("etiuda:host",'))(
        { on: (ch, fn) => { handler = fn; } }, () => true, { fromWebContents: () => null }, { platform: "win32" }, () => null,
        () => own, path.win32, from, S.folderShown, S.isBuiltIn, () => 0, "",
        null, new Set(), () => "", { homedir: () => "" }, () => "");
    } catch (e) { return "the host answer did not run: " + e.message; }
    const ev = { sender: { id: 1 } };
    handler(ev);
    return [ev.returnValue.catalogBuiltIn, ev.returnValue.catalogIn];
  };
  eq("the host answer flags the shipped sample and hands no folder for it, and a folder file is unflagged with its folder",
    S ? [answer(inAsar + B + "sample-catalog.ec"), answer(own + B + "team.ec")] : "no isBuiltIn in shell/main.js",
    [[true, ""], [false, own]]);

  const preload = fs.readFileSync(path.join(E.ROOT, "shell", "preload.js"), "utf8");
  const bridge = (host) => {
    let exposed = null;
    const heard = {};
    const electron = {
      contextBridge: { exposeInMainWorld: (k, v) => { if (k === "E_HOST") exposed = v; }, executeInMainWorld() {} },
      ipcRenderer: { sendSync: ch => ch === "etiuda:host" ? host : null, send() {}, invoke() {}, on: (ch, fn) => { heard[ch] = fn; } },
      webUtils: {} };
    require("vm").runInNewContext(preload, { require: m => { if (m !== "electron") throw new Error(m); return electron; } });
    let handed = null;
    exposed.onCatalogFile((...a) => { handed = a[5]; });
    heard["etiuda:catalog-file"]({}, "{}", "sample-catalog.ec", "", false, "", true);
    return [exposed.catalogBuiltIn, exposed.recovering, handed];
  };
  let got;
  try { got = [bridge({ catalogBuiltIn: true, recovering: true }), bridge({})]; }
  catch (e) { got = "the preload did not run: " + e.message; }
  eq("the preload hands the page the shipped flag and the recovery mark as the shell answered them, and the watch's flag too",
    got, [[true, true, true], [false, false, true]]);

  const about = fs.readFileSync(path.join(E.ROOT, "src", "modules", "about.js"), "utf8");
  /* The credit under one interface language, with TRADEMARK, MAKER and STARDUST_URL read from their own lines in
     about.js, split at its line break. Two parts: the copyright with the notice, then the maker line. */
  const aboutParts = lang => {
    try {
      const konst = name => new Function("return " + extractDecl(about, "const " + name + "=").replace(/^[^=]*=|;$/g, ""))();
      const credit = new Function("esc", "TRADEMARK", "MAKER", "STARDUST_URL",
        extractDecl(about, "function aboutCredit(") + "\nreturn aboutCredit;")(
        s => s, konst("TRADEMARK"), konst("MAKER"), about.indexOf("const STARDUST_URL=") > -1 ? konst("STARDUST_URL") : "");
      return String(credit(lang)).split("<br>");
    } catch (e) { return "aboutCredit did not run: " + e.message; }
  };
  /* [part count, the last part]: the oracle's own copy of the anchor below, so a drift in the source is a difference. */
  const aboutTail = lang => { const p = aboutParts(lang); return typeof p === "string" ? p : [p.length, p[p.length - 1]]; };
  const STARDUST = '<a href="https://stardustengineering.dev" target="_blank" rel="noopener">Stardust</a>';
  eq("About puts the maker line under the trademark line, once, its Stardust a link to the company's address that opens outside the window: Made by Stardust. in English, Etiuda. Tworzy ją Stardust. in Polish, and English in a language with no key",
    [aboutTail("en"), aboutTail("pl"), aboutTail("de")],
    [[2, "Made by " + STARDUST + "."], [2, "Etiuda. Tworzy ją " + STARDUST + "."], [2, "Made by " + STARDUST + "."]]);
  eq("About's credit holds one link, to the company's address once, and the old Polish sentence is gone, in every language",
    ["en", "pl", "de"].map(l => { const p = aboutParts(l), all = String(p);
      return typeof p === "string" ? p : [all.split("<a ").length - 1, all.split("https://stardustengineering.dev").length - 1, all.indexOf("Gwiezdny") > -1]; }),
    [[1, 1, false], [1, 1, false], [1, 1, false]]);
  eq("control: the trademark line above the maker line is unchanged in each language, after the copyright",
    ["en", "pl", "de"].map(l => { const p = aboutParts(l); return typeof p === "string" ? p : p[p.length - 2]; }),
    ["© 2026 Maxim Gwiazda. Etiuda is a trademark of Maxim Gwiazda.", "© 2026 Maxim Gwiazda. Etiuda jest znakiem towarowym Maxima Gwiazdy.",
     "© 2026 Maxim Gwiazda. Etiuda is a trademark of Maxim Gwiazda."]);
  eq("About names no catalog file: it reads none of the host's catalog answers",
    ["eCatalogFile", "eCatalogIn", "eCatalogBuiltIn", "./host.js"].filter(n => about.indexOf(n) > -1), []);

  const offer = fs.readFileSync(path.join(E.ROOT, "src", "modules", "catalog-offer.js"), "utf8");
  const offers = (given, builtInHost, inHost, file, where, builtIn) => {
    const seen = {};
    try {
      const found = new Function("t", "esc", "E_CATALOG_SCRIPT", "eCatalogFolder", "eCatalogFolderShort",
        extractDecl(offer, "function eFoundHtml(") + "\nreturn eFoundHtml;")(s => s, s => s, "etiuda-catalog.js", () => own, s => s);
      new Function("eEmbeddedCatalog", "eCatalog", "storedCatalog", "eCatalogAccepted", "eCatalogFile", "eCatalogBuiltIn", "eHost",
        "eCatalogIn", "eCatalogFolder", "eOfferCatalogDialog", "eFoundHtml", "lsSet", "E_CATALOG_KEY", "activateCatalog",
        "eCatalogMtime", "eCatalogSignature", "toast",
        extractDecl(offer, "function eOfferCatalog(") + "\nreturn eOfferCatalog;")(
        () => false, () => ({ cards: [] }), () => null, () => false, () => "sample-catalog.ec", () => builtInHost, () => ({}),
        () => inHost, () => own, (c, o) => { seen.said = o.foundHtml; o.accept("sig"); return true; }, found, () => {}, "k",
        (c, o) => { seen.file = o.file; }, () => 5, () => "sig", () => {})(given, file, where, true, false, builtIn);
    } catch (e) { return "eOfferCatalog did not run: " + e.message; }
    return [/comes with Etiuda/.test(seen.said), seen.said.indexOf("Documents") > -1, seen.file];
  };
  eq("the offer of the shipped sample, at boot or from the watch, names no folder and marks no row of the catalog folder as loaded", [
    offers(null, true, "", "", "", false), offers({ cards: [] }, false, "", "sample-catalog.ec", inAsar, true)],
    [[true, false, ""], [true, false, ""]]);
  eq("a file found in the catalog folder is located in it and marks its row", offers(null, false, own, "team.ec", "", false),
    [false, true, "team.ec"]);

  const copyOf = f => {
    try { return new Function("t", "esc", extractDecl(offer, "function ecCopyHtml(") + "\nreturn ecCopyHtml;")(s => s, s => s)(f); }
    catch (e) { return "ecCopyHtml did not run: " + e.message; }
  };
  eq("a Library row names the copy Etiuda ships and says nothing of a folder's file of the same name, changed or not",
    [copyOf({ builtIn: true }), copyOf({ builtIn: false, replaces: true }), copyOf({})],
    ['<span class="ec-copy" data-ec-copy="builtin">comes with Etiuda</span>', "", ""]);

  const langSrc = fs.readFileSync(path.join(E.ROOT, "src", "modules", "ui-lang.js"), "utf8");
  const plAt = langSrc.indexOf("UI_STRINGS.pl={"), plEnd = langSrc.indexOf("\n};", plAt);
  const PLS = new Function("const UI_STRINGS={};\n" + langSrc.slice(plAt, plEnd + 3) + "\nreturn UI_STRINGS.pl;")();
  const rowOf = (o, tr) => {
    try {
      return new Function("t", "esc", "trustKeyHtml", "ecWatchHtml", "loadedTickHtml",
        "catalogEdited", "ICON_LOAD", "ICON_EJECT",
        extractDecl(offer, "function ecRowHtml(") + "\n" + extractDecl(offer, "function ecActHtml(") + "\nreturn ecRowHtml;")(
        tr, s => s, (s, id) => "<key " + s + "|" + id + ">", () => "", () => "", () => false, "<svg>load</svg>", "<svg>eject</svg>")(o);
    } catch (e) { return "ecRowHtml did not run: " + e.message; }
  };
  const sheet = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
  const glyph = (/\.ec-list\{--ec-glyph:(\d+)px\}/.exec(sheet) || [])[1];
  const sized = [/\.ec-tick\{[^}]*width:var\(--ec-glyph\);height:var\(--ec-glyph\)/, /\.ec-key\{[^}]*width:var\(--ec-glyph\);height:var\(--ec-glyph\)/,
    /\.ec-row \.ec-act \.ic\{width:var\(--ec-glyph\);height:var\(--ec-glyph\)\}/].map(re => re.test(sheet));
  eq("a Library row's glyphs, the loaded mark, the key and Load or Eject, share one size above a toolbar icon's 15px",
    [+glyph > 15, sized], [true, [true, true, true]]);
  const keyThenAct = html => ((/<key ([^>]*)><button[^>]*data-ec-(load|eject)/.exec(String(html)) || []).slice(1).join(" ")) || String(html).slice(0, 120);
  eq("a Library row's signature is a key beside its Load or Eject, carrying the state and the key's name the list hands it", [
    keyThenAct(rowOf({ name: "team.ec", mtime: 5, trust: "valid", keyId: "k1" }, s => s)),
    keyThenAct(rowOf({ name: "team.ec", loaded: true, trust: "none" }, s => s))], ["valid|k1 load", "none| eject"]);
  const acts = html => (String(html).match(/<button[^>]*>[\s\S]*?<\/button>/g) || []).map(b => {
    const at = n => ((new RegExp(" " + n + "=\"([^\"]*)\"")).exec(b) || [])[1] || "";
    return [at("aria-label"), at("title"), b.replace(/^<button[^>]*>|<\/button>$/g, "")];
  });
  const en = s => s, pl = s => PLS[s] || s;
  eq("a Library row's Load and Eject are glyph buttons keeping their word as tooltip and accessible name, in English and Polish", [
    acts(rowOf({ name: "team.ec", mtime: 5 }, en)), acts(rowOf({ name: "team.ec", loaded: true }, en)),
    acts(rowOf({ name: "team.ec", mtime: 5 }, pl)), acts(rowOf({ name: "team.ec", loaded: true }, pl))], [
    [["Load", "Load", "<svg>load</svg>"]], [["Eject", "Eject", "<svg>eject</svg>"]],
    [["Wczytaj", "Wczytaj", "<svg>load</svg>"]], [["Odłącz", "Odłącz", "<svg>eject</svg>"]]]);
}
/* A DIALOG TAKES THE KEYBOARD (feel pass, focus on open): openDialog and tabTargetIn are sliced out of
   dialog.js and run on a small tree written here. What a real key does there is the verifier's. */
function dialogFocusTests() {
  const dlg = fs.readFileSync(path.join(E.ROOT, "src", "modules", "dialog.js"), "utf8");
  const world = () => {
    const doc = { activeElement: null };
    class N {
      constructor(id, parent, wide) {
        this.id = id; this.parentNode = parent || null; this.hidden = false; this.className = ""; this.innerHTML = "";
        this.offsetWidth = wide ? 20 : 0; this.offsetHeight = 0; this.kids = [];
        if (parent) parent.kids.push(this);
      }
      contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
      closest(sel) { for (let x = this; x; x = x.parentNode) if ("#" + x.id === sel) return x; return null; }
      focus() { doc.activeElement = this; }
      querySelectorAll() { const out = []; const walk = n => n.kids.forEach(k => { if (k.offsetWidth) out.push(k); walk(k); }); walk(this); return out; }
    }
    const body = new N("body"); doc.body = body; doc.documentElement = new N("html"); doc.activeElement = body;
    const modalEl = new N("modal", body); modalEl.hidden = true;
    const modalCard = new N("modalCard", modalEl);
    const x = new N("modalX", modalCard, true), field = new N("field", modalCard, true), save = new N("save", modalCard, true);
    const tour = new N("tourCard", body), tourBtn = new N("tourNext", tour, true);
    const cover = new N("cover", body), coverBtn = new N("ecYes", cover, true), search = new N("intent", body, true);
    return { doc, N, modalEl, modalCard, x, field, save, tourBtn, cover, coverBtn, search, body };
  };
  const sliced = w => new Function("document", "modalEl", "modalCard", "cutLeaves", "setModalBack", "modalHead", "t",
    "refreshDialogReset", "translateTree", "dressDialogInputs", "markCutText", "openCover",
    "let modalOpener=null, modalOpenerKbd=false, modalNameFn=null, modalResetFn=null, modalResetOn=\"\", modalResetOff=\"\", lastInputWasKey=false;\n"
    + [extractDecl(dlg, "function openDialog("), extractDecl(dlg, "const MODAL_TABBABLE="), extractDecl(dlg, "function tabTargetIn(")].join("\n")
    + "\nreturn {openDialog, tabTargetIn};")(
    w.doc, w.modalEl, w.modalCard, () => {}, () => {}, () => "", s => s, () => {}, () => {}, () => {}, () => {},
    () => (w.coverOn ? w.cover : null));
  const open = (from, opts) => {
    const w = world(); Object.assign(w, opts || {});
    w.doc.activeElement = typeof from === "function" ? from(w) : w.body;
    let H;
    try { H = sliced(w); } catch (e) { return "openDialog did not slice: " + e.message; }
    try { H.openDialog({ title: "T", wire: w.wire ? () => w.wire(w) : null }); } catch (e) { return "openDialog threw: " + e.message; }
    return w.doc.activeElement.id;
  };
  eq("a dialog opened from the search field, from nothing, and one whose wiring focuses a field: the card, the card, the field",
    [open(w => w.search), open(), open(null, { wire: w => w.field.focus() })], ["modalCard", "modalCard", "field"]);
  eq("the tour's bubble and a cover standing over the dialog keep the keyboard they hold",
    [open(w => w.tourBtn), open(w => w.coverBtn, { coverOn: true })], ["tourNext", "ecYes"]);
  let tabs;
  try {
    const w = world(), H = sliced(w);
    w.doc.activeElement = w.modalCard;
    const fwd = H.tabTargetIn(w.modalCard, false), back = H.tabTargetIn(w.modalCard, true);
    w.doc.activeElement = w.field;
    tabs = [fwd && fwd.id, back && back.id, H.tabTargetIn(w.modalCard, false)];
  } catch (e) { tabs = "tabTargetIn did not run: " + e.message; }
  eq("from the card, Tab reaches its first control and Shift+Tab its last; from a control inside, the browser's own Tab stands",
    tabs, ["modalX", "save", null]);
}
/* A PILL GLIDES FROM WHERE IT WAS PAINTED TO WHERE IT LANDS (797 N1 and N3): a width tween that
   moves a row break carries a pill across the row mid-glide, and a width that snaps instead starts
   the pill at a size it was never painted at. flipPills and tweenPillWidths are sliced out and run
   on a wrapping row modelled here, flex's line breaking with margins included, and the glide is
   replayed on the one curve its widths, margins and offsets share. The painted frames are the verifier's. */
function pillRow(W, spec) {
  const GAP = 6, LINE = 37.5, kids = [];
  const lay = (ws, ms) => {
    let x = 0, line = 0;
    const at = new Map();
    kids.forEach((k, i) => {
      const w = ws ? ws[i] : k.w(), [l, r] = ms ? ms[i] : k.m();
      if (x > 0 && x + l + w + r > W) { line++; x = 0; }
      at.set(k, { x: x + l, y: line * LINE, w });
      x += l + w + r + GAP;
    });
    return { at, h: (line + 1) * LINE - GAP };
  };
  const px = v => v ? parseFloat(v) : null;
  const shift = t => { const m = /translate\((-?[0-9.]+)px,\s*(-?[0-9.]+)px\)/.exec(t || ""); return m ? [+m[1], +m[2]] : [0, 0]; };
  spec.forEach(([k, nat]) => {
    const p = { dataset: { k }, nat, anim: {}, classList: { contains: c => c === "pill-add" && k === null } };
    if (k === null) delete p.dataset.k;
    let tf = "", wd = "", tr = "", ml = "", mr = "";
    p.style = { willChange: "" };
    Object.defineProperty(p.style, "transition", { get: () => tr, set: v => { tr = v; } });
    Object.defineProperty(p.style, "transform", { get: () => tf,
      set: v => { if (/transform/.test(tr) && v !== tf) p.anim.transform = [tf, v]; tf = v; } });
    Object.defineProperty(p.style, "width", { get: () => wd,
      set: v => { if (/width/.test(tr) && v !== wd) p.anim.width = [px(wd) || p.nat, px(v) || p.nat]; wd = v; } });
    Object.defineProperty(p.style, "marginLeft", { get: () => ml,
      set: v => { if (/margin-left/.test(tr) && v !== ml) p.anim.ml = [px(ml) || 0, px(v) || 0]; ml = v; } });
    Object.defineProperty(p.style, "marginRight", { get: () => mr,
      set: v => { if (/margin-right/.test(tr) && v !== mr) p.anim.mr = [px(mr) || 0, px(v) || 0]; mr = v; } });
    p.w = () => px(wd) || p.nat;
    p.m = () => [px(ml) || 0, px(mr) || 0];
    Object.defineProperty(p, "offsetTop", { get: () => lay().at.get(p).y });
    p.getBoundingClientRect = () => { const a = lay().at.get(p), s = shift(tf);
      return { left: a.x + s[0], top: a.y + s[1], width: a.w, height: 31.5 }; };
    kids.push(p);
  });
  const row = { children: kids, clientWidth: W, querySelectorAll: () => kids.slice(),
    get offsetHeight() { return lay().h; }, get scrollHeight() { return lay().h; } };
  /* What getComputedStyle reads: the row's gap and padding, a pill's margins as its style holds them. */
  row.style = el => el === row ? { columnGap: GAP + "px", paddingLeft: "0px", paddingRight: "0px" }
    : { marginLeft: el.style.marginLeft || "0px", marginRight: el.style.marginRight || "0px" };
  /* Where each pill is painted at progress s of the one curve: widths, margins and offsets all from
     their start to their end, the layout taken again at those values. */
  const lerp = (a, s) => a[0] + (a[1] - a[0]) * s;
  row.at = s => {
    const ws = kids.map(k => k.anim.width ? lerp(k.anim.width, s) : k.w());
    const ms = kids.map(k => [k.anim.ml ? lerp(k.anim.ml, s) : k.m()[0], k.anim.mr ? lerp(k.anim.mr, s) : k.m()[1]]);
    const L = lay(ws, ms);
    return kids.map(k => { const a = L.at.get(k), d = k.anim.transform ? shift(k.anim.transform[0]) : shift(k.style.transform);
      return { k: k.dataset.k === undefined ? null : k.dataset.k, x: a.x + d[0] * (1 - s), y: a.y + d[1] * (1 - s), w: a.w,
        line: a.y }; });
  };
  return row;
}
/* The worst a glide does, over 200 steps: how far a pill is painted past either end of the line from
   where it was to where it lands, the longest single step against a smooth one's, how far from where
   it was painted, size included, it starts, and whether its layout changed line mid-glide. */
function pillGlideFaults(before, row) {
  const N = 200, frames = [];
  for (let i = 0; i <= N; i++) frames.push(row.at(i / N));
  const out = [];
  frames[0].forEach((p0, j) => {
    const b = before.get(p0.k), e = frames[N][j];
    if (!b) return;
    const T = [e.x - b.left, e.y - b.top], L = Math.hypot(T[0], T[1]);
    let past = 0, step = 0, lines = 0;
    frames.forEach((f, i) => {
      const P = f[j];
      if (L > 0) {
        const t = ((P.x - b.left) * T[0] + (P.y - b.top) * T[1]) / (L * L);
        past = Math.max(past, t < 0 ? -t * L : t > 1 ? (t - 1) * L : 0);
      }
      if (i) { step = Math.max(step, Math.hypot(P.x - frames[i - 1][j].x, P.y - frames[i - 1][j].y)); if (P.line !== frames[i - 1][j].line) lines++; }
    });
    const start = Math.max(Math.hypot(frames[0][j].x - b.left, frames[0][j].y - b.top), Math.abs(frames[0][j].w - b.width));
    if (past > 12 || step > Math.max(2, 4 * L / N) || start > 1 || lines) out.push((p0.k === null ? "add" : p0.k || "All")
      + " past " + Math.round(past) + " step " + Math.round(step) + " start " + Math.round(start) + (lines ? " relined" : ""));
  });
  return out;
}
/* WHICH TAB, LANGUAGE, CATEGORY AND INTENT IS ACTIVE, as a screen reader is told it: the drawing
   functions sliced out of their modules and run over a toy element that keeps its attributes. */
function activeStateTests() {
  const mod = f => fs.readFileSync(path.join(E.ROOT, "src", "modules", f), "utf8");
  class El {
    constructor(tag) { this.tagName = tag; this.attrs = {}; this.dataset = {}; this.kids = []; this.cls = new Set();
      this.style = { setProperty() {}, removeProperty() {} };
      const me = this;
      this.classList = { toggle(c, on) { if (on === undefined) on = !me.cls.has(c); if (on) me.cls.add(c); else me.cls.delete(c); return on; },
        add(...c) { c.forEach(x => me.cls.add(x)); }, remove(...c) { c.forEach(x => me.cls.delete(x)); }, contains(c) { return me.cls.has(c); } }; }
    set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get className() { return [...this.cls].join(" "); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    removeAttribute(k) { delete this.attrs[k]; }
    appendChild(c) { this.kids.push(c); c.parentElement = this; return c; }
    get firstChild() { return this.kids[0] || null; }
    set innerHTML(v) { this.html = v; if (v === "") this.kids = []; }
    get innerHTML() { return this.html || ""; }
    querySelectorAll() { return []; }
    focus() {}
  }
  const doc = { createElement: tag => new El(tag) };
  const slice = (f, marker) => extractDecl(mod(f), marker);

  let got;
  try {
    const bar = new El("div"); bar.parentElement = new El("div");
    const H = new Function("document", "$", "tabs", "activeTabId", "t", "tabLabel", "drawTabs", "bindTabScroll", "fitTabLabels",
      "requestAnimationFrame", "tabAddTitle", "ICON_TAB_X", "ICON_TAB_ADD", "tabDrag",
      slice("tabs.js", "function drawTabsCore(") + "\nreturn drawTabsCore;")(
      doc, s => (s === "#tabsBar" ? bar : null), [{ id: "a", pax: "Anna" }, { id: "b", pax: "" }], "b", s => s, tb => tb.pax || "Tab",
      {}, () => {}, () => {}, () => {}, () => "", "", "", null);
    H();
    got = bar.kids.map(k => [k.cls.has("on"), k.kids[0].getAttribute("role"), k.kids[0].getAttribute("aria-selected")]);
  } catch (e) { got = "drawTabsCore did not run: " + e.message; }
  eq("each tab's name is a tab to a screen reader, selected exactly where the tab is on",
    got, [[false, "tab", "false"], [true, "tab", "true"]]);

  const pillsAt = sel => {
    const pills = new El("div");
    const H = new Function("document", "pills", "cats", "CATS", "intentCats", "searchCounts", "catIconSvg", "esc", "t", "ICON_EDIT",
      "ICON_ALL", "ICON_PLUS", "catSlot", "dragState", "totalMacroCount", "counts", "displayCatOrder", "syncPillsCollapseNow",
      "schedulePillsCollapse",
      slice("pills-bar.js", "function drawPillsCore(") + "\nreturn drawPillsCore;")(
      doc, pills, sel, { a: "Alpha", b: "Beta" }, () => ({ specific: [], always: [] }), () => null, () => "", s => s, s => s, "",
      "", "", () => -1, null, () => 3, { a: 1, b: 2 }, () => ["a", "b"], () => {}, () => {});
    H();
    return pills.kids.map(k => [k.dataset.k === undefined ? "+" : k.dataset.k, k.getAttribute("role"), k.getAttribute("aria-pressed")]);
  };
  try { got = [pillsAt(["b"]), pillsAt([])]; } catch (e) { got = "drawPillsCore did not run: " + e.message; }
  eq("each category pill is a toggle pressed exactly while it filters, All while nothing does, and the + is neither",
    got, [[["", "button", "false"], ["a", "button", "false"], ["b", "button", "true"], ["+", null, null]],
          [["", "button", "true"], ["a", "button", "false"], ["b", "button", "false"], ["+", null, null]]]);

  try {
    const paint = new Function("catSlot", "railDrag", "railRelNow", "railRelGroup",
      slice("rail-list.js", "function railPaintRow(") + "\nreturn railPaintRow;")(() => -1, null, {}, {});
    const row = new El("button");
    paint(row, { idx: 1, picked: true }, []);
    const on = [row.cls.has("on"), row.getAttribute("aria-pressed")];
    paint(row, { idx: 1, picked: false }, []);
    got = [on, [row.cls.has("on"), row.getAttribute("aria-pressed")]];
  } catch (e) { got = "railPaintRow did not run: " + e.message; }
  eq("an intent row is pressed while its intent is chosen and let go when it is not",
    got, [[true, "true"], [false, "false"]]);

  try {
    const en = new El("button"), pl = new El("button"); en.dataset.l = "en"; pl.dataset.l = "pl";
    const seg = new El("div"); seg.querySelectorAll = () => [en, pl];
    const apply = new Function("seg", "CONTENT_LANGS", "lsSet", "noteActive",
      "let lang=\"en\"; function putLang(v){ lang=v; }\n" + slice("lang-seg.js", "function applyLangState(") + "\nreturn applyLangState;")(
      seg, ["en", "pl"], () => {}, () => {});
    apply("pl");
    got = [en.getAttribute("aria-pressed"), pl.getAttribute("aria-pressed"), pl.cls.has("on")];
  } catch (e) { got = "applyLangState did not run: " + e.message; }
  eq("the language on screen is the pressed one of its pair", got, ["false", "true", true]);
}
/* THE SAME FOUR IN HIGH CONTRAST, where a tint says nothing: each outline is weighed, by layer then
   specificity, against every rule in the sheet that sets outline to none on the same element, which
   is how the tour's ring was lost. A rule is matched by its subject compound against every class, id
   and attribute the element can wear, and every pseudo-class counts as reachable. */
function highContrastStateTests() {
  const L = require("./css-layers.js");
  const raw = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
  const sheet = L.sheetOf(raw);
  const lineAt = i => raw.slice(0, sheet.from + i).split("\n").length;
  const fcAt = raw.indexOf("@media (forced-colors:active){");
  const fcFrom = raw.slice(0, fcAt).split("\n").length, fcTo = raw.slice(0, raw.indexOf("\n}", fcAt)).split("\n").length + 1;
  const parsed = L.parseSheet(sheet.css, lineAt);
  const rank = l => parsed.order.indexOf(l);
  const feats = sel => {
    const s = L.subject(sel).replace(/:[-\w]+\((?:[^()]|\([^()]*\))*\)/g, "");
    if (/::|:(before|after|placeholder|marker|selection)\b/.test(s)) return null;
    const tag = (/^[a-zA-Z][-\w]*/.exec(s) || [""])[0].toLowerCase();
    return { tag: tag, cls: [...s.matchAll(/\.([-\w]+)/g)].map(m => m[1]), ids: [...s.matchAll(/#([-\w]+)/g)].map(m => m[1]),
      attrs: [...s.matchAll(/\[([^\]]+)\]/g)].map(m => m[1].replace(/["']/g, "").replace(/\s/g, "")) };
  };
  const fits = (f, el) => f && (!f.tag || f.tag === el.tag) && f.cls.every(c => el.cls.includes(c)) && f.ids.every(i => el.ids.includes(i))
    && f.attrs.every(a => el.attrs.includes(a) || el.attrs.some(x => x.split("=")[0] === a.split(/[~|^$*]?=/)[0] && !/=/.test(a)));
  let got;
  const ELS = [
    { name: "the chosen tab", state: "on", tag: "div", cls: ["tab", "on", "dragging"], ids: [], attrs: [] },
    { name: "the chosen category", state: "on", tag: "div", cls: ["pill", "on", "hint", "hint2", "pill-nohit"], ids: [], attrs: ["role=button", "data-k", "data-ec"] },
    { name: "the language on screen", state: "on", tag: "button", cls: ["on"], ids: [], attrs: ["type=button", "data-l", "data-alt"] },
    { name: "the tour's selected button", state: "tour-sel", tag: "button", cls: ["btn", "tour-sel", "tour-skip", "primary"], ids: ["tourSkip", "tourPrev", "tourNext"], attrs: ["type=button"] },
  ];
  const outlineOff = d => /^outline(-style|-width)?$/.test(d.prop) && /^(none|0)\b/.test(d.val);
  got = ELS.map(el => {
    const hc = parsed.decls.filter(d => d.line >= fcFrom && d.line <= fcTo && d.prop === "outline" && /Highlight/.test(d.val)
      && fits(feats(d.sel), el) && feats(d.sel).cls.includes(el.state));
    if (!hc.length) return el.name + ": no High Contrast outline";
    const best = hc[hc.length - 1];
    const lost = parsed.decls.filter(d => !(d.line >= fcFrom && d.line <= fcTo) && outlineOff(d) && fits(feats(d.sel), el))
      .filter(d => (d.imp && !best.imp) || rank(d.layer) > rank(best.layer)
        || (rank(d.layer) === rank(best.layer) && L.cmpSpec(best.spec, d.spec) <= 0));
    return lost.length ? el.name + ": loses to " + lost.map(d => d.sel + " (line " + d.line + ")").join(", ") : el.name + ": shown";
  });
  eq("in High Contrast the chosen tab, category and language and the tour's selected button wear the system highlight, and no rule takes it away",
    got, ELS.map(el => el.name + ": shown"));
}
function pillWrapTests() {
  const paint = fs.readFileSync(path.join(E.ROOT, "src", "modules", "paint.js"), "utf8");
  const state = fs.readFileSync(path.join(E.ROOT, "src", "modules", "pill-state.js"), "utf8");
  const opt = m => paint.indexOf(m) > -1 ? extractDecl(paint, m) : "";
  const lines = opt("function pillLines("), pin = opt("function pinPillLines(");
  const flip = (row, style) => new Function("pills", "E_EASE", "setTimeout", "getComputedStyle",
    extractDecl(paint, "function pillKey(") + "\n" + lines + "\n" + pin + "\n" + extractDecl(paint, "function flipPills(")
    + "\nreturn flipPills;")(row, "ease", () => 0, style || row.style);
  const tween = row => new Function("pills", "E_EASE", "mgReduceMotion", "requestAnimationFrame", "setTimeout", "clearTimeout", "getComputedStyle",
    extractDecl(paint, "function pillKey(") + "\n" + lines + "\n" + pin + "\n" + extractDecl(paint, "function flipPills(") + "\n"
    + extractDecl(state, "function tweenPillWidths(") + "\nreturn tweenPillWidths;")(
    row, "ease", () => false, f => f(), () => 0, () => {}, row.style);
  /* All's count gains a digit, 77px to 83px, and the pill that closed the first line at 296px no
     longer fits: the row keeps its two lines and trades a pill between them. At 280px it still fits.
     Then the other way: All loses the digit and the pill at 296px climbs back onto the first line. */
  const rest = [["a", 200], ["b", 200], ["c", 200]];
  for (const [what, last, from, to, trades] of [["a pill at the break", 296, 77, 83, true], ["a pill clear of it", 280, 77, 83, false],
    ["a pill climbing back over the break", 296, 83, 77, true]]) {
    const old = pillRow(1000, [["", from], ...rest, ["x", last], ["d", 200], ["e", 200], [null, 31]]);
    const before = new Map(old.children.map(p => [p.dataset.k === undefined ? null : p.dataset.k, p.getBoundingClientRect()]));
    const now = pillRow(1000, [["", to], ...rest, ["x", last], ["d", 200], ["e", 200], [null, 31]]);
    eq("the model trades a pill between lines only where it is meant to: " + what,
      old.children[4].offsetTop !== now.children[4].offsetTop, trades);
    let got;
    try { flip(now)(before); got = pillGlideFaults(before, now); } catch (e) { got = "flipPills threw: " + e.message; }
    eq("a settle that changes All's width glides every pill on its own path at its own size, " + what, got, []);
    eq("All's width tweens, " + what, !!now.children[0].anim.width, true);
    const counts = pillRow(1000, [["", to], ...rest, ["x", last], ["d", 200], ["e", 200], [null, 31]]);
    try { tween(counts)([counts.children[0]], [from], before); got = pillGlideFaults(before, counts); }
    catch (e) { got = "tweenPillWidths threw: " + e.message; }
    eq("a count written in place never carries a pill across the row nor snaps its width, " + what, got, []);
  }
  /* Where the pin cannot hold the row, here because the gap reads wider than it is, as a browser's
     rounding might, the widths snap as before and no pill changes line mid-glide. */
  const old = pillRow(1000, [["", 77], ...rest, ["x", 296], ["d", 200], ["e", 200], [null, 31]]);
  const before = new Map(old.children.map(p => [p.dataset.k === undefined ? null : p.dataset.k, p.getBoundingClientRect()]));
  const now = pillRow(1000, [["", 83], ...rest, ["x", 296], ["d", 200], ["e", 200], [null, 31]]);
  let got;
  try { flip(now, el => el === now ? Object.assign(now.style(el), { columnGap: "30px" }) : now.style(el))(before); got = pillGlideFaults(before, now); }
  catch (e) { got = "flipPills threw: " + e.message; }
  eq("where the pin cannot hold the row, the widths snap and no pill changes line mid-glide", got, ["All past 0 step 0 start 6"]);
}
/* THE CLIP FOLLOWS A NEW WIDTH IN THE FRAME THAT PAINTS IT (797 F4), AND MOVES NOTHING ABOVE THE BAR.
   One frame is modelled from the real syncPillsCollapse and width watch and the sheet's own cap on the
   slot: the slot's height as laid out is what every observer at the probe's depth or above was handed,
   so a callback that changes it fails the observer's loop with a page error, and a third line in flow
   is the drop. The frame itself is the verifier's. */
function pillsWidthWatchTests() {
  const src = fs.readFileSync(path.join(E.ROOT, "src", "modules", "pills-box.js"), "utf8");
  const tpl = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
  const LINE = 31.5, GAP = 6;
  /* The slot's max-height from the sheet, evaluated on the slot's own variables. An unset variable
     makes the declaration invalid at computed-value time, which leaves max-height at none. */
  const capRule = /\.pills-slot\{max-height:([^}]*)\}/.exec(tpl);
  const cap = (vars, vw) => {
    if (!capRule) return Infinity;
    let unset = false;
    const js = capRule[1].replace(/var\((--[a-z0-9-]+)\)/g, (m, name) => {
      if (!(name in vars)) { unset = true; return "0"; }
      return "(" + parseFloat(vars[name]) + ")";
    }).replace(/100vw/g, "(" + vw + ")").replace(/([0-9])px/g, "$1")
      .replace(/\bcalc\(/g, "(").replace(/\bmax\(/g, "Math.max(");
    return unset ? Infinity : Function("return " + js)();
  };
  const st = {}, cls = new Set(), vars = {};
  const natural = () => st.lines * LINE + (st.lines - 1) * GAP;
  const slotH = () => cls.has("pills-overflow") ? parseFloat(vars["--pills-2line"]) : Math.min(natural(), cap(vars, st.vw));
  const kids = () => Array.from({ length: 3 * st.lines }, (_, i) => ({ offsetTop: Math.floor(i / 3) * (LINE + GAP),
    offsetHeight: LINE, getBoundingClientRect: () => ({ height: LINE }) }));
  const bar = { get children() { return kids(); }, querySelector: () => kids()[0],
    get offsetHeight() { return natural(); }, getBoundingClientRect: () => ({ height: natural() }) };
  const slot = {
    classList: { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)), contains: c => cls.has(c) },
    style: { setProperty: (k, v) => { vars[k] = v; }, removeProperty: k => { delete vars[k]; }, getPropertyValue: k => k in vars ? vars[k] : "" },
    getBoundingClientRect: () => ({ height: slotH() }),
  };
  const doc = { documentElement: { style: { removeProperty() {} }, getBoundingClientRect: () => ({ width: st.vw }) },
    body: { classList: { contains: () => false } } };
  const probe = { id: "pillsProbe" };
  let heard = null, observed = null, calls = 0;
  class RO { constructor(fn) { heard = fn; } observe(el) { observed = el; } }
  // A fresh module per case, so the watch's last width is its own.
  const build = () => {
    const decls = ["let pillsWidthSeen=", "function pillsTwoLines(", "function pillsWrapHeight(", "function syncPillsCollapse(",
      "function pillsClipDue(", "function wirePillsWidthWatch("].map(m => extractDecl(src, m)).join("\n");
    return new Function("pills", "ResizeObserver", "$", "pillsSlot", "pillsWanted", "pillsLocked", "document",
      "getComputedStyle", "ePillsSettled", "counted",
      decls + "\nconst sync=syncPillsCollapse;\nsyncPillsCollapse=function(){ counted(); sync(); };" +
      "\nreturn { wire: wirePillsWidthWatch, sync };")(bar, RO, () => probe, () => slot, () => true, () => st.locked, doc,
      x => x === slot ? { getPropertyValue: k => pillsSlotComputed(tpl, k, st.vw) } : { rowGap: GAP + "px" }, true, () => { calls++; });
  };
  /* Boot at `from` with its clip decided, the observer's first delivery, then one frame at `to`:
     [clips in the observer, loop errors, the slot's height as painted]. */
  const frame = (from, to) => {
    cls.clear(); for (const k in vars) delete vars[k];
    Object.assign(st, { locked: false }, from);
    const m = build();
    m.wire(); m.sync();
    heard([{ contentRect: { width: st.probe, height: 0 } }]);
    Object.assign(st, to);
    const laid = slotH(), was = calls;
    heard([{ contentRect: { width: st.probe, height: 0 } }]);
    return [calls - was, slotH() !== laid ? 1 : 0, slotH()];
  };
  const rest = { vw: 1200, probe: 1172, lines: 2 };
  const cases = [
    ["a narrower window wraps the bar to a third line", rest, { vw: 1180, probe: 1152, lines: 3 }, [1, 0, 69]],
    ["a narrower window keeps two lines", rest, { vw: 1190, probe: 1162, lines: 2 }, [0, 0, 69]],
    ["one device pixel narrower at 125 per cent wraps a third line", rest, { vw: 1199.2, probe: 1171.2, lines: 3 }, [1, 0, 69]],
    ["a clipped bar widens to fit in two", { vw: 1180, probe: 1152, lines: 3 }, { vw: 1300, probe: 1272, lines: 2 }, [0, 0, 69]],
    ["a locked bar wraps a third line and grows", Object.assign({ locked: true }, rest), { vw: 1180, probe: 1152, lines: 3 }, [0, 0, 106.5]],
    ["at rest, the window a sixty-fourth under its measure, the cap is off", rest, { vw: 1200 - 1 / 64, probe: 1172, lines: 3 }, [0, 0, 106.5]],
  ];
  for (const [what, from, to, want] of cases) {
    let got;
    try { got = frame(from, to); } catch (e) { got = "threw: " + e.message; }
    eq("the width watch, " + what, got, want);
  }
  /* The slot narrowing under a window that keeps its width (the panel docking) is not capped, so
     the watch leaves it to the resize pass rather than move the header inside the observer. */
  let got;
  try { got = frame(rest, { vw: 1200, probe: 1000, lines: 3 }).slice(0, 2); } catch (e) { got = "threw: " + e.message; }
  eq("the width watch leaves a slot narrowing at the same window width to the resize pass", got, [0, 0]);
  eq("the width watch observes the probe, a box the clip it sets cannot resize", observed === probe, true);
  const rule = /\.pills-probe\{([^}]*)\}/.exec(tpl), slotRule = /\.pills-slot\{max-width:([^;]*);/.exec(tpl);
  eq("the probe sits outside the slot at the slot's width and no height",
    [/id="pills"[^>]*><\/div>\s*<\/div>\s*<div class="pills-probe" id="pillsProbe"/.test(tpl),
      !!rule && !!slotRule && rule[1].indexOf("max-width:" + slotRule[1]) > -1 && /height:0/.test(rule[1])],
    [true, true]);
  const boot = fs.readFileSync(path.join(E.ROOT, "src", "main.js"), "utf8");
  eq("boot wires the watch", /pillsBox\.wirePillsWidthWatch\(\);/.test(boot), true);
}
/* A custom property's computed value on the pill slot, read from the sheet: a length registered by
   @property and declared on .pills-slot in vw computes to px, rounded here to six significant figures
   as a browser may serialise it; an unregistered one keeps its tokens. */
function pillsSlotComputed(tpl, name, vw) {
  const decl = new RegExp("[.]pills-slot[{]" + name + ":([^;}]*)").exec(tpl);
  if (!decl) return "";
  const reg = new RegExp("@property " + name + "[{]([^}]*)[}]").exec(tpl);
  const n = /^([0-9.]+)vw$/.exec(decl[1].trim());
  if (!reg || !/syntax:"<length>"/.test(reg[1]) || !n) return decl[1].trim();
  return String(Number((parseFloat(n[1]) * vw / 100).toPrecision(6))) + "px";
}
/* WHAT ONE STEP OF A WINDOW DRAG COSTS THE PILL BAR (797 F4). The resize pass, schedulePillsCollapse
   with its frames run at once, is traced on stubs one step after the last decision, in each state: a
   layout read with anything written since the last layout is a layout, and a style or layout read
   after a write to a variable the pills inherit (any the sheet does not register inherits:false)
   restyles the whole bar, as does the frame if one is still pending. The drag is the verifier's. */
function pillsResizeCostTests() {
  const src = fs.readFileSync(path.join(E.ROOT, "src", "modules", "pills-box.js"), "utf8");
  const tpl = fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8");
  const own = new Set();
  for (const m of tpl.matchAll(/@property (--[a-z0-9-]+)[{]([^}]*)[}]/g)) if (/inherits:false/.test(m[2])) own.add(m[1]);
  const LINE = 31.5, GAP = 6;
  const st = { vw: 1200, lines: 2 }, vars = {}, cls = new Set();
  let pend = {}, layouts = 0, restyles = 0;
  const dirty = () => !!(pend.inh || pend.own || pend.cls || pend.lay);
  const styleRead = () => { if (pend.inh) restyles++; pend = { lay: dirty() }; };
  const layoutRead = () => { if (pend.inh) restyles++; if (dirty()) layouts++; pend = {}; };
  const touch = k => { pend[k.startsWith("--") ? (own.has(k) ? "own" : "inh") : "cls"] = true; };
  const natural = () => st.lines * LINE + (st.lines - 1) * GAP;
  const kids = () => Array.from({ length: 3 * st.lines }, (_, i) => ({
    get offsetTop() { layoutRead(); return Math.floor(i / 3) * (LINE + GAP); },
    get offsetHeight() { layoutRead(); return LINE; },
    getBoundingClientRect() { layoutRead(); return { height: LINE }; } }));
  const bar = { get children() { return kids(); }, querySelector: () => kids()[0],
    get offsetHeight() { layoutRead(); return natural(); }, getBoundingClientRect() { layoutRead(); return { height: natural() }; } };
  const slot = {
    classList: { add: (...c) => c.forEach(x => { if (!cls.has(x)) { cls.add(x); touch(x); } }),
      remove: (...c) => c.forEach(x => { if (cls.has(x)) { cls.delete(x); touch(x); } }), contains: c => cls.has(c) },
    style: { setProperty: (k, v) => { if (vars[k] !== v) { vars[k] = v; touch(k); } },
      removeProperty: k => { if (k in vars) { delete vars[k]; touch(k); } }, getPropertyValue: k => k in vars ? vars[k] : "" },
    getBoundingClientRect() { layoutRead(); return { height: 2 * LINE + GAP }; } };
  const doc = { documentElement: { style: { removeProperty() {} }, getBoundingClientRect() { layoutRead(); return { width: st.vw }; } },
    body: { classList: { contains: () => false } } };
  const computed = x => x === slot ? { getPropertyValue: k => { styleRead(); return pillsSlotComputed(tpl, k, st.vw); } }
    : { get rowGap() { styleRead(); return GAP + "px"; } };
  let got;
  try {
    const decls = ["let ePillsSettled=", "function pillsTwoLines(", "function pillsWrapHeight(", "function syncPillsCollapse(",
      "function schedulePillsCollapse(", "let pillsShapeT=", "function rememberPillsShape("].map(m => extractDecl(src, m)).join("\n");
    const pass = new Function("pills", "pillsSlot", "pillsWanted", "pillsLocked", "document", "getComputedStyle",
      "requestAnimationFrame", "hooks", "lsSet", "lsDel", "window", decls + "\nreturn schedulePillsCollapse;")(
      bar, () => slot, () => true, () => false, doc, computed, fn => fn(), { scheduleRailGeometry() {} }, () => {}, () => {},
      { innerWidth: 1200 });
    const step = lines => {
      cls.clear(); for (const k in vars) delete vars[k];
      Object.assign(st, { vw: 1202, lines });
      pass();
      st.vw = 1200; pend = { lay: true }; layouts = 0; restyles = 0;   // the next width, not yet laid out
      pass();
      if (pend.inh) restyles++;
      return [layouts, restyles];
    };
    got = [step(2), step(3)];
  } catch (e) { got = "threw: " + e.message; }
  eq("one step of a drag costs the pill bar, as [layouts, bar restyles], two lines then clipped", got, [[1, 0], [4, 2]]);
}
/* A RAIL ROW ON SCREEN THAT LEAVES THE WINDOW GLIDES TO ITS EDGE (797 F6): past the travel cap it
   used to be left where it landed, out of sight, which is a vanish. flipRail is sliced and run on a
   panel of stub rows; a row that stays on screen and one that arrives are the controls. */
function railLeaveTests() {
  const src = fs.readFileSync(path.join(E.ROOT, "src", "modules", "rail-list.js"), "utf8");
  const row = (si, y) => {
    const r = { dataset: { si }, offsetTop: y, offsetHeight: 34, classList: { contains: () => false }, log: [] };
    r.style = {};
    ["transform", "opacity", "transition", "willChange"].forEach(k => {
      let v = "";
      Object.defineProperty(r.style, k, { get: () => v, set: x => { v = x; if (k !== "transition" && k !== "willChange") r.log.push(k + " " + (x || "none")); } });
    });
    return r;
  };
  /* A 600px window at the top of the list: the leaver goes from 150 to 700, the stayer from 450 to
     100, the arrival from 800 to 200. The cap is half the window. */
  const rows = [row("7", 700), row("8", 100), row("9", 200)];
  const box = { clientHeight: 600, scrollTop: 0, offsetTop: 0, get offsetHeight() { return 600; }, querySelectorAll: () => rows };
  let flip = null;
  try {
    flip = new Function("$", "M_MS", "E_EASE", "setTimeout", "RAIL_FLIP_TRAVEL",
      extractDecl(src, "function flipRail(") + "\nreturn flipRail;")(() => box, { move: 180 }, "ease", () => 0, 0.5);
  } catch (e) { flip = null; }
  if (flip) flip({ 7: { y: 150, on: false }, 8: { y: 450, on: false }, 9: { y: 800, on: false } }, null);
  eq("a row that leaves the window past the cap glides from where it was to the window's edge",
    flip ? rows[0].log : "no flipRail", ["transform translateY(-550px)", "transform translateY(-100px)"]);
  eq("a row on screen at both ends still glides home, and one arriving from off screen still fades in",
    flip ? [rows[1].log, rows[2].log] : "no flipRail",
    [["transform translateY(350px)", "transform none"], ["opacity 0", "opacity none"]]);
}
/* A CARD WHOSE TEXT GREW OPENS TO ITS NEW HEIGHT (797 N5): a Ctrl pick fills the top card with the
   second intent and it grew 63px in one frame. glideSettle is sliced and run on stub cards: the
   grown card's clip runs from its old height to its own edge on the curve the card below glides on,
   so the gap between them, read at every step of that curve, stays what it was. */
function grownCardTests() {
  const src = fs.readFileSync(path.join(E.ROOT, "src", "modules", "paint.js"), "utf8");
  const card = (id, now) => ({ dataset: { id }, runs: [], getBoundingClientRect: () => now,
    animate(kf, o) { this.runs.push([Object.keys(kf[0]).join("+"), kf[0].clipPath || kf[0].transform || "",
      kf[1].clipPath || kf[1].transform || "", o.duration]); return { finish() {} }; } });
  const R = (top, h) => ({ left: 300, top, width: 400, height: h, bottom: top + h, right: 700 });
  const cards = [card("a", R(220, 344)), card("b", R(584, 200)), card("c", R(700, 300))];
  const list = { getBoundingClientRect: () => ({ top: 200 }), querySelectorAll: () => cards };
  let glide = null;
  try {
    glide = new Function("list", "window", "CARD_MOVE_MAX", "M_MS", "E_EASE", "E_SPRING_MS", "E_SPRING_OK", "E_SPRING", "eKickPump",
      "let eSettleRuns=[];\n" + extractDecl(src, "function glideSettle(") + "\nreturn glideSettle;")(
      list, { innerHeight: 900 }, 40, { move: 180, surface: 180 }, "ease", 371, false, "", () => {});
  } catch (e) { glide = null; }
  /* "a" stays put and grows 63px; "b" sits 20px below it and is pushed down by the growth; "c" was
     below the screen and is shorter than its estimate, which is not a growth anyone saw. */
  if (glide) glide({ a: R(220, 281), b: R(521, 200), c: R(1400, 220) }, "move");
  eq("a grown card opens from its old height to its own edge on the glide's curve; a card that only moved only glides",
    glide ? [cards[0].runs, cards[1].runs] : "no glideSettle",
    [[["clipPath", "inset(-24px -24px 63px -24px)", "inset(-24px -24px 0px -24px)", 180]],
      [["transform", "translate(0px,-63px)", "none", 180]]]);
  /* The grown card's edge is its box or its clip, whichever is higher; both runs share one curve, so
     one progress reads both. A clip that ends past the edge runs ahead of the card below. */
  let gap = "no clip on the grown card";
  const clip = cards[0].runs.find(r => r[0] === "clipPath"), move = cards[1].runs.find(r => r[0] === "transform");
  const bottomInset = v => { const m = /inset\(([^)]*)\)/.exec(v); if (!m) return null;
    const s = m[1].trim().split(/\s+/).map(parseFloat), b = s.length > 2 ? s[2] : s[0];
    return isNaN(b) ? null : b; };
  if (clip && move && bottomInset(clip[1]) != null && bottomInset(clip[2]) != null) {
    const b0 = bottomInset(clip[1]), b1 = bottomInset(clip[2]), dy = +/,(-?[0-9.]+)px/.exec(move[1])[1];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const p = i / 100, edge = Math.min(564, 564 - (b0 + (b1 - b0) * p)), next = 584 + dy * (1 - p);
      lo = Math.min(lo, next - edge); hi = Math.max(hi, next - edge);
    }
    gap = [Math.round(lo * 10) / 10, Math.round(hi * 10) / 10];
  }
  eq("the grown card's edge keeps its 20px gap to the card below at every step of the glide", gap, [20, 20]);
}
/* THE MOTION LEGS' JUDGE SEES A LEAP ALONG THE LINE OF TRAVEL (797 N4): N3's pill ran 47px the wrong
   way, was painted 35px past its end and glided back, all within the off-path margin. judge() from
   tests/motion.js is run on that track, rebuilt in numbers, and on a clean glide as the control. A
   motion.js without the export fails these legs rather than stopping the run. */
function motionJudgeTests() {
  let M = {};
  try { M = require("./motion.js"); } catch (e) { M = {}; }
  const box = (x, y) => ({ x, y, w: 110, top: y, bottom: y + 31.5 });
  const track = pts => ({ vh: 816, before: { "k:a": box(1233, 94) },
    frames: pts.map(([x, y], i) => ({ "k:a": Object.assign(box(x, y), { anim: 1 }, i ? {} : { start: box(1233, 94) }) }))
      .concat([{ "k:a": box(15, 132) }]) });
  const leap = track([[1280, 94], [-20, 132], [-6, 132], [8, 132], [15, 132]]);
  const clean = track([[900, 104], [500, 116], [200, 126], [40, 131], [15, 132]]);
  const only = ["jumped", "snapped", "startOff", "offPath", "pastEnd", "vanished"];
  let got = "no judge exported by tests/motion.js";
  if (typeof M.judge === "function") {
    const a = M.judge(leap, { only }), b = M.judge(clean, { only });
    got = [a.ok, /pastEnd 1/.test(a.text), /offPath/.test(a.text), b.ok];
  }
  eq("the motion judge fails a pill painted past either end of its glide, and passes a clean glide",
    got, [false, true, false, true]);
  eq("the motion legs run at 125 and 150 per cent as well as 100",
    (M.SCALES || []).map(s => s.deviceScaleFactor), [1, 1.25, 1.5]);
  /* THE CARD A LEG ACTS ON IS FOUND AT EVERY SCALE: at 1536x816 the first row's tops sit above the
     middle band and the second row's below it, so the band alone found nothing and m7 and m12 were
     never driven at 125. The band still decides where it has a card; the head of the list is never
     the pick, nor a card under the header, and nothing is picked from an empty screen. */
  const card = (id, top, left) => ({ id, top, left });
  const row125 = [card("h", 240, 300), card("p", 240, 700), card("q", 240, 1100), card("s", 560, 300), card("t", 600, 700), card("u", 580, 1100)];
  const at100 = [card("h", 220, 300), card("p", 220, 700), card("m", 300, 300), card("n", 520, 700)];
  const under = [card("h", 150, 300), card("p", 160, 700)];
  /* At 1280x680 (150 per cent) the head's top, 218, lies inside the band (204 to 408): measured
     2026-09-27, m7@150 and m12@150 acted on the head. The band's first card that is not the head. */
  const head150 = [card("h", 218, 20), card("p", 218, 430), card("q", 218, 840), card("s", 520, 20)];
  got = typeof M.middleCard === "function"
    ? [M.middleCard(row125, 816, 230), M.middleCard(at100, 900, 200), M.middleCard(under, 680, 230), M.middleCard([], 816, 230),
      M.middleCard([card("h", 240, 300)], 816, 230), M.middleCard(head150, 680, 150)]
    : "no middleCard exported by tests/motion.js";
  eq("the card a leg acts on is the band's first where the band has one, else the nearest to the screen's middle, never the head",
    got, ["s", "m", null, null, null, "p"]);
}
function requestFns() {
  const src = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  const decls = ["const DESK_ID_RE =", "function channelHash(", "function ymdOk(",
                 "function parseRequest("].map(m => extractDecl(src, m)).join("\n");
  const said = [];
  const quiet = { log: (s) => said.push(String(s)), error: (s) => said.push(String(s)) };
  return Object.assign(new Function("console", decls
    + "\nreturn {parseRequest, channelHash};")(quiet), { said });
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

   THE GLOBAL THAT ARRIVES FROM OUTSIDE. A catalog file on disk declares window.E_CATALOG,
   written by files this engine does not own - by the converter in tools/catalog-v2, or by a
   desk - so renaming either end silently stops a catalog loading. The export wrapper and the importer's search
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
const UI_STRINGS_COUNT = 973;
const UI_STRINGS_SHA256 = "4fa7a07daeeaa2a462d1fd29702de194bcc1c4795ce527773b67d242fbd9d840";

/* The same line rule as checkDuplicateStrings: the translation table is one quoted pair to a
   line. Sorted, so reordering the table is not a change to what anybody reads; both halves,
   so a Polish value cannot move unremarked either.

   THE ENGLISH ENDS AT ITS FIRST UNESCAPED QUOTE. Until 2026-09-28 it ended at the first `":"`
   and a line whose English held a quote was skipped whole: 10 of the table's lines, the tour's
   rail, pills, star and settings bodies among them, so a Polish value changed on one of them
   moved nothing here. Read escape by escape instead, the ten are in and every line the old rule
   took is taken byte for byte as before (measured over the source document: 810 kept, 0 lost,
   10 added).

   A TABLE'S LAST PAIR HAS NO COMMA. Until 2026-10-04 a line had to end `",`, so the last line of
   the table, which ends `"` above its `};`, was never read: at engine main 4e14085 that line's
   Polish value changed and this section stayed green, while the same change one line up went red.
   A line ending `"` is read too, its value one character shorter; every line the comma rule took
   is taken byte for byte as before. checkFrozenContracts runs this over a planted table as well,
   so a rule that drops a last pair again fails there and not only when somebody edits that line. */
function uiPairs(src) {
  const out = [];
  src.split(/\r?\n/).forEach(line => {
    const t = line.trim();
    const tail = t.endsWith('",') ? 2 : t.endsWith('"') ? 1 : 0;
    if (!tail || !t.startsWith('"')) return;
    let i = 1;
    while (i < t.length && t[i] !== '"') i += t[i] === "\\" ? 2 : 1;
    if (i < 2 || t.slice(i, i + 3) !== '":"') return;
    out.push(t.slice(1, i) + "\u0000" + t.slice(i + 3, -tail));
  });
  return out;
}
function uiStrings(src) {
  const out = uiPairs(src);
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
  holds("function exportCatalog(", "JSON.stringify(catalogToV2(",
        "an export is the .ec document itself, which every reader of a format 2 catalog parses as it stands");
  holds("function parseCatalogFile(", '"E_CATALOG"',
        "the importer finds the payload by that wrapper");

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
    if (!/^e[0-9a-z]+~$/.test(withId.E_NS))
      problems.push("E_NS answers " + JSON.stringify(withId.E_NS) + " for a catalog with an id, which is not "
        + "\"e\" plus a base36 hash and a tilde, so no sweep built on the key shape would find its keys");
    if (named.E_NS !== "e")
      problems.push("E_NS answers " + JSON.stringify(named.E_NS) + " for a catalog with a name and no id, wanted \"e\": "
        + "the id is the namespace and a name seeds none");
    /* Identity is the file's own id: a rename keeps the namespace, two ids under one name do not
       share one. */
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

  /* The census over a planted table, so that its silence over a last line is a measurement: two
     pairs, the second with no comma, and an object that is no pair at all. */
  const plantedUi = uiPairs('T={\n  "One":"Jeden",\n  "Two \\"2\\"":"Dwa"\n};\nU={ "n": 1 };');
  if (plantedUi.join("|") !== 'One\u0000Jeden|Two \\"2\\"\u0000Dwa')
    problems.push("the interface-string census no longer reads every pair of a planted table ("
      + JSON.stringify(plantedUi) + "), so a changed last pair would pass it unseen");
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
    "const VAR_GREETINGS=",
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
    "function cardLiveHay(",
    "function cardSearchFields(",
    "function cardSearchIndex(",
    "function sameTerms(",
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
    "let eVocabPart=",
    "function vocabAdd(",
    "function catalogVocab(",
    "function editDistance1(",
    "function termReachesSomething(",
    "function correctTerm(",
    "function cardSearchScore(",
    "function queryScore(",
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

  /* A TOKEN NO DESK FILLS IS COPIED AS WRITTEN. The known forms are listed here by hand rather
     than read from TOKEN_CANARY, which is what the rule reads, so a token dropped from the
     canary while fill() still fills it reddens the control instead of passing with the rule. */
  const tokens = (en, pl) => { const c = toy(); c.cards[0].title.pl = "Witaj";
    c.cards[0].body = { en: en, pl: pl }; return c; };
  const TOK_WARN = / is not a token the desk fills/;
  eq("lint a body carrying {FOO} warns once, naming the card, the language and the token",
     lintCatalog(tokens("Hello there.", "Dzien dobry {FOO}.")).warnings,
     ["card 1: {FOO} in the PL body is not a token the desk fills, so it is copied as written"]);
  eq("and so do the forms fill() leaves alone: a bare DAYPART, an argument on a bare token,"
     + " another case, while {WHO} is left to its own error",
     lintCatalog(tokens("{DAYPART} {INIT:x} {date} {WHO}.", "Dzien {FOO} {FOO} dobry.")).warnings,
     ["card 1: {DAYPART} in the EN body is not a token the desk fills, so it is copied as written",
      "card 1: {INIT:x} in the EN body is not a token the desk fills, so it is copied as written",
      "card 1: {date} in the EN body is not a token the desk fills, so it is copied as written",
      "card 1: {FOO} in the PL body is not a token the desk fills, so it is copied as written"]);
  const known = "{GREET} {PAX}, {AGENT} {INIT} {ROLE} {Z} {INTENT} {ACTION} {TOPIC}"
    + " {DAYPART:a|b} {DAYPART:a|b|c} [date] [order number].";
  const silent = lintCatalog(tokens(known, known));
  eq("CONTROL: every token the desk fills, and the square-bracket blanks, raise no warning",
     [silent.errors, silent.warnings.filter(w => TOK_WARN.test(w))], [[], []]);

  /* THE CATALOG'S VARIABLES. A team's own token is filled, so it is no unknown; an inline form short of
     its variable's rules says so, GENDER's nonbinary in its own words; a card overriding {PAX} under a
     team's address is listed. The control is the same catalog without the variables. */
  const withVars = (en, pl, more) => { const c = tokens(en, pl); Object.assign(c.cards[0], more || {});
    c.variables = { list: [{ name: "REPLYBY", rules: [{ when: [{ fact: "gender", op: "is", value: "m" }], write: { en: "a" } },
      { when: [{ fact: "gender", op: "is", value: "f" }], write: { en: "b" } }, { when: [], write: { en: "c" } }] },
      { name: "PAX", rules: [{ when: [], write: { en: "{@first}", pl: "{@first-voc}" } }] }] }; return c; };
  const VW = / gives \{| sets \{PAX\} by hand| is not a token the desk fills/;
  eq("a team's variable is a token the desk fills, bare and inline with a word per rule",
     lintCatalog(withVars("{REPLYBY} {REPLYBY:x|y|z}", "{REPLYBY}")).warnings.filter(w => VW.test(w)), []);
  eq("an inline form short of its variable's rules says so once, and GENDER's nonbinary in its own words",
     lintCatalog(withVars("{REPLYBY:x|y} {REPLYBY:x|y} {GENDER:Mr|Ms}", "{GREET:Dzień dobry} {GENDER:Pan}")).warnings.filter(w => VW.test(w)),
     ["card 1: This card gives {REPLYBY} fewer words than it has rules; the rest write the first.",
      "card 1: This card gives {GENDER} no words for nonbinary, so for a nonbinary customer the desk leaves that place to the agent.",
      "card 1: This card gives {GREET} fewer words than it has rules; the rest write the first.",
      "card 1: This card gives {GENDER} no words for nonbinary, so for a nonbinary customer the desk leaves that place to the agent.",
      "card 1: This card gives {GENDER} fewer words than it has rules; the rest write the first."]);
  eq("a card overriding {PAX} under the team's address is listed; one following it is not",
     [lintCatalog(withVars("Hi {PAX}", "Hej {PAX}", { paxOwn: 1 })).warnings.filter(w => VW.test(w)),
      lintCatalog(withVars("Hi {PAX}", "Hej {PAX}", { paxOwn: 0 })).warnings.filter(w => VW.test(w))],
     [["card 1: This card sets {PAX} by hand, apart from the catalog's address."], []]);
  const noVars = tokens("{REPLYBY} Hi {PAX}", "Hej {PAX}"); noVars.cards[0].paxOwn = 1;
  eq("CONTROL: without the variables a team's token is unknown and an override says nothing",
     lintCatalog(noVars).warnings.filter(w => VW.test(w)),
     ["card 1: {REPLYBY} in the EN body is not a token the desk fills, so it is copied as written"]);

  /* ONE CARD THE READER REFUSES HIDES NOTHING ELSE. The refused card comes first so that the
     rest's findings would name the wrong card if its positions were the rest's own. */
  const several = () => {
    const c = toy();
    c.cards = [
      { id: "c-empty", shelf: "t-open", bodyShape: "plain", title: { en: "Empty" }, body: { en: "" } },
      { id: "c-token", shelf: "t-open", bodyShape: "plain", title: { en: "Token" },
        body: { en: "Hello {FOO}." } },
      { id: "c-twin-a", shelf: "t-open", bodyShape: "plain", title: { en: "Twin" }, body: { en: "One." } },
      { id: "c-twin-b", shelf: "t-open", bodyShape: "plain", title: { en: "Twin" }, body: { en: "Two." } }];
    return c;
  };
  const all = lintCatalog(several());
  eq("lint a card the reader refuses is an error, and every other card is still linted, each"
     + " named by its place in the file",
     [all.errors, all.warnings, all.awaiting],
     [["card c-empty: no body in en, the primary language",
       'card 4 ("Twin"): same title as card 3 in this category, so at the desk the two are hard to tell apart; one needs a title of its own, or the two can become one card'],
      ["card 2: {FOO} in the EN body is not a token the desk fills, so it is copied as written"],
      ["pl: 3 card(s) lacking text"]]);
  const badHead = several();
  badHead.id = "X";
  const head = lintCatalog(badHead);
  eq("CONTROL: a file whose own id the reader refuses is reported and nothing more, because no"
     + " card of it can be read",
     [head.errors.length, /^id: malformed/.test(head.errors[0]), head.warnings, head.awaiting],
     [2, true, [], []]);

  /* C1, 2026-09-25: THE COLLISION KEY IS THE PRIMARY'S TITLE. It read `m.t`, which is the English
     title, so on a catalog whose primary is not English every card on a shelf keyed as one empty
     title and each collided with the card before it: Studio's Polish sample sheet linted 11 such
     errors over 15 cards holding 15 distinct ids. The twin is the half that keeps the rule. */
  const plShelf = titles => {
    const c = toy();
    c.langs = [{ code: "pl", label: "PL" }];
    c.tags[0].label = { pl: "Otwarte" };
    c.cards = titles.map((t, i) => ({ id: "c-pl-" + i, shelf: "t-open", bodyShape: "plain",
      title: { pl: t }, body: { pl: "Tekst " + i + "." } }));
    return c;
  };
  eq("C1 lint a shelf in a catalog whose primary is Polish: three titles are three cards, and a"
     + " title given twice is the one same-title error",
     [lintCatalog(plShelf(["Kot", "Pies", "Dom"])).errors,
      lintCatalog(plShelf(["Kot", "Pies", "Kot"])).errors],
     [[], ['card 3 ("Kot"): same title as card 1 in this category, so at the desk the two are hard to tell apart; one needs a title of its own, or the two can become one card']]);

  /* THE SAME-TITLE KEY IS THE TITLE AS rekeyOldCards BUCKETS IT: trimmed, case kept. Surrounding
     space is invisible at the desk and defeats rekeying; a case difference is visible and does not. */
  const enShelf = titles => {
    const c = toy();
    c.cards = titles.map((t, i) => ({ id: "c-en-" + i, shelf: "t-open", bodyShape: "plain",
      title: { en: t }, body: { en: "Text " + i + "." } }));
    return c;
  };
  eq("lint two titles on one shelf that differ only by surrounding space are the same title",
     [lintCatalog(enShelf(["Kot", "Kot "])).errors, lintCatalog(enShelf([" Kot", "Kot"])).errors],
     [['card 2 ("Kot "): same title as card 1 in this category, so at the desk the two are hard to tell apart; one needs a title of its own, or the two can become one card'],
      ['card 2 ("Kot"): same title as card 1 in this category, so at the desk the two are hard to tell apart; one needs a title of its own, or the two can become one card']]);
  eq("CONTROL: two titles that differ only in case are two titles",
     lintCatalog(enShelf(["Refund", "refund"])).errors, []);
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
    "const STARTER_CATS=", "const CATS=", "const SW_EN=", "const SW_PL=", "const SW_CMT=", "const SW_CMT_PL=",
    "const SW_TOPIC=", "const SW_TOPIC_PL=", "const CONTENT_LANGS=", "const BUILT_IN_LANGS=",
    "function langColumn(", "function catalogLangs(", "const INTENT_TEXT_FIELDS=",
    "const INTENT_FIELD_KEY=", "function intentFieldKey(", "const SW_STORE=",
    "function intentStoreKeys(",
    "const CARD_FIELD_KEY=", "const CARD_TEXT_FIELDS=", "const CARD_PLAIN_FIELDS=",
    "const CARD_SHARED_FIELDS=", "const CARD_KEY_ALIAS=", "function cardFieldKey(",
    "function cardFieldKeys(", "function cardStorageKeys(", "function cardRequiredKeys(",
    "function truthyFlag(", "function isMacrosJsonKind(", "function plainCopy(", "function parseMacrosData(",
    "function v2Str(", "const CAT_LABEL_KEY=", "function v2CatKey(",
    "function normaliseCatalog(",
  ].map(m => extractDecl(src, m)).join("\n");
  const whitelist = new Function("pack", "FACTS", "hueIsOffered", "normWhoList",
    WL + "\nreturn normaliseCatalog;")({ facts: null }, "facts", () => false, x => x);
  const runtimeOf = codes => V.catalogFromV2(invent(codes));
  const through = codes => whitelist(runtimeOf(codes));
  /* A name planted in a format 2 document, which the format no longer has: gone from the runtime
     catalog, from the whitelist's, and from the export made of either. */
  const namedIn = V.catalogFromV2(Object.assign(invent(["en"]), { name: "Invented shop" }));
  eq("a catalog's name is read by no reader and written by no writer",
     ["name" in namedIn, "name" in whitelist(namedIn), "name" in V.catalogToV2(namedIn),
      "name" in V.catalogToV2(whitelist(namedIn))], [false, false, false, false]);
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
/* THE LIBRARY'S OWN ROWS AND PANELS, sliced out of their modules and run on stubs: what each row is
   made of, in which order. How it looks is the smoke's and Maxim's. */
function libraryRowsTests() {
  const manageSrc = fs.readFileSync(path.join(E.ROOT, "src", "modules", "manage.js"), "utf8");
  const introw = (cat, n, hidden) => {
    try {
      return new Function("intentIdAt", "isIntentHiddenIdx", "isIntentFavourite", "esc", "t", "intentIsCustom",
        "intentIsOverridden", "ICON_EYE_SHUT", "ICON_EYE_OPEN", "ICON_TRASH", "catMarkHtml", "intentNavName", "ICON_EDIT",
        "ICON_STAR_ON", "ICON_STAR_OFF",
        extractDecl(manageSrc, "function mgIntentRow(") + "\nreturn mgIntentRow;")(
        () => "t:one", () => !!hidden, () => false, s => s, s => s, () => false, () => false, "", "", "",
        k => "<mark " + k + ">", () => "Refund", "", "", "")(0, new Map(cat ? [["t:one", cat]] : []), new Map(n ? [["t:one", n]] : []));
    } catch (e) { return "mgIntentRow did not run: " + e.message; }
  };
  const shape = h => {
    const m = /^<div class="manage-row mg-int( is-hidden)?"[^>]*>(<mark [^>]*>)<span class="mg-int-t cut-peek" data-i18n-skip>([^<]*)<\/span><span class="mg-int-n">(\d+)<\/span><span class="cacts">/.exec(String(h));
    return m ? [m[2], m[3], m[4], !!m[1]].join(" ") : String(h).slice(0, 200);
  };
  eq("a Library intent row is the rail's: one dominant category's mark at its head, the name that fades, and the count of cards linked to it",
    [shape(introw("billing", 7)), shape(introw("", 0)), shape(introw("billing", 3, true))],
    ["<mark billing> Refund 7 false", "<mark > Refund 0 false", "<mark billing> Refund 3 true"]);
  const cut = fs.readFileSync(path.join(E.ROOT, "src", "modules", "cut-text.js"), "utf8");
  eq("the Library intent's name is one of the lines the cut pass fades", /\.mg-int-t,/.test(extractDecl(cut, "const CUT_SEL=")), true);
  const pick = (/\n\.ic-pick\{[^}]*\}/.exec(fs.readFileSync(path.join(E.ROOT, "src", "template.html"), "utf8")) || [""])[0];
  eq("the category editor's icon grid shows whole, with no height cap and no scroll of its own",
    [!!pick, /max-height|overflow/.test(pick)], [true, false]);

  const mt = fs.readFileSync(path.join(E.ROOT, "src", "modules", "maintenance.js"), "utf8");
  const store = fs.readFileSync(path.join(E.ROOT, "src", "modules", "storage.js"), "utf8");
  const B = String.fromCharCode(92), HOME = "C:" + B + "Users" + B + "ann", DOCS = HOME + B + "Documents" + B + "Etiuda";
  const place = w => {
    try {
      return new Function("catalogLoaded", "storedCatalog", "eDeskHome", "nsGet", "eHost", "eCatalogAccepted", "eCatalog",
        "E_CATALOG_SCRIPT", "lsGet", "E_CATALOG_FOLDER_KEY", "eCatalogFolder", "eCatalogFile", "eCatalogBuiltIn", "eCatalogIn",
        [extractDecl(mt, "function mtSafe("), extractDecl(store, "function eHomeless("), extractDecl(mt, "function mtCatalogPlace(")].join("\n")
        + "\nreturn mtCatalogPlace;")(
        () => !!w.loaded, () => (w.held ? {} : null), () => HOME, k => (w.ns || {})[k], () => (w.host ? {} : null), () => !!w.accepted, () => ({}),
        "etiuda-catalog.js", k => (k === "eCatalogFolder" ? w.chosen || null : null), "eCatalogFolder", () => w.folder || DOCS,
        () => w.file || "", () => !!w.builtIn, () => w.in || "")();
    } catch (e) { return "mtCatalogPlace did not run: " + e.message; }
  };
  const P = o => (typeof o === "string" ? o : [o.file, o.copy, o.folder].join(" | "));
  eq("the Maintenance panel names where the catalog in use lies, which copy it is and its folder, on a desk and in a browser", [
    P(place({ host: true, loaded: true, ns: { CatalogFile: "team.ec" } })),
    P(place({ host: true, loaded: true, ns: { CatalogFile: "team.ec" }, chosen: "D:" + B + "shared", folder: "D:" + B + "shared" })),
    P(place({ host: true, loaded: true, ns: { CatalogFile: "" }, accepted: true, builtIn: true, file: "sample-catalog.ec" })),
    P(place({ host: true, loaded: true, ns: { CatalogFile: "" }, accepted: true, file: "team.ec", in: HOME + B + "Desktop" })),
    P(place({ host: true, loaded: true, ns: { CatalogFile: "", CatalogFrom: "mine.ec" } })),
    P(place({ loaded: true, accepted: true })), P(place({ loaded: true, held: true, ns: { CatalogFrom: "mine.ec" } })),
    P(place({ host: true }))], [
    "team.ec | Documents" + B + "Etiuda | %USERPROFILE%" + B + "Documents" + B + "Etiuda",
    "team.ec | the chosen catalog folder's | D:" + B + "shared",
    "sample-catalog.ec | the program's own | inside the program",
    "team.ec | found beside the program | %USERPROFILE%" + B + "Desktop",
    "mine.ec | a file opened by hand | -",
    "etiuda-catalog.js | beside this page | -", "mine.ec | imported into this browser | -",
    "- | (none loaded) | -"]);
  let report;
  try {
    report = new Function("mtReadings", "navigator", extractDecl(mt, "function mtReportText(") + "\nreturn mtReportText;")(
      () => [{ sec: "Catalog file" }, { k: "file", v: "team.ec", panelOnly: true }, { k: "copy", v: "Documents" }], { userAgent: "UA" })();
  } catch (e) { report = "mtReportText did not run: " + e.message; }
  // The stub above proves the filter only; the real mtReadings and the real list builder prove the wiring.
  let wired;
  try {
    const readings = new Function("mtCatalogPlace", "eSaveTrouble", "pack", "eDeskRefused", extractDecl(mt, "function mtSafe(") + "\n"
      + extractDecl(mt, "function mtReadings(") + "\nreturn mtReadings;")(
      () => ({ file: "team.ec", copy: "Documents", folder: "-" }), () => null, {}, () => []);
    wired = new Function("mtReadings", "navigator", extractDecl(mt, "function mtReportText(") + "\nreturn mtReportText;")(readings, { userAgent: "UA" })();
  } catch (e) { wired = "mtReadings did not run: " + e.message; }
  const lists = extractDecl(manageSrc, "function openManage(");
  eq("the copied report carries where the catalog lies and never its file's own name, which the panel alone shows",
    [/\nfile: /.test(report), /\ncopy: Documents\n/.test(report), /team\.ec/.test(wired), /\ncopy: Documents\n/.test(wired),
     /[\s,]linked=intentCardCounts\(\)[,;]/.test(lists) && /mgIntentRow\(i,catOf,linked\)/.test(lists)],
    [false, true, false, true, true]);
}
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
/* The tokens a desk fills, as TOKEN_CANARY in rail-list.js spells them: a name written bare is
   filled only bare, and one written with an argument only with one, which is what fill() does. */
const TOKEN_SHAPE = /\{([A-Za-z][A-Za-z0-9_]*)(:[^{}]*)?\}/g;
let FILLED_TOKENS = null;
function filledTokens() {
  if (FILLED_TOKENS) return FILLED_TOKENS;
  const canary = new Function(extractDecl(sourceText(), "const TOKEN_CANARY=") + "\nreturn TOKEN_CANARY;")();
  const bare = new Set(), arg = new Set();
  String(canary).replace(TOKEN_SHAPE, (raw, name, a) => { (a ? arg : bare).add(name); return raw; });
  if (!bare.size) throw new Error("TOKEN_CANARY in rail-list.js carries no token: " + canary);
  return (FILLED_TOKENS = { bare, arg, raw: String(canary) });
}
/* ETIUDA'S OWN VARIABLES AS RULES, and the override's reading, sliced out of src/ so the lint counts a
   variable's rules and reads a card's override exactly as the desk does. */
let VAR_RULES = null;
function varRules() {
  if (VAR_RULES) return VAR_RULES;
  const src = sourceText();
  const decls = ["const VAR_GREETINGS=", "function varText(", "function varIs(", "function varBuiltin(",
    "function paxVocOn(", "function paxOwnOn("].map(m => extractDecl(src, m)).join("\n");
  return (VAR_RULES = new Function(decls + "\nreturn { varBuiltin, paxOwnOn };")());
}
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
    .update(JSON.stringify([String((c && c.id) == null ? "" : c.id), String((c && c.version) == null ? "" : c.version)]))
    .digest("hex").slice(0, 16);
  /* awaiting: one finding per declared non-primary language any card lacks; this count is
     of those findings, not of the cards named inside them. */
  const awaitingN = (r && Array.isArray(r.awaiting)) ? r.awaiting.length : 0;
  return "catalog " + id + " (sha256 of id+version, first 16 hex; an id can be made of a customer's"
    + " name and does not go in a log): " + cards + " cards, " + cats + " categories, "
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

/* The format 2 file without every tag and card the reader refuses on its own, and `at`, each
   kept card's place in the file. Null where the refusal is the file's own (its id, rev or
   languages) or no card is left, since then nothing else can be linted. */
function lintableRest(data) {
  const V = v2Reader();
  const base = Object.assign({}, data, { tags: [], cards: [] });
  delete base.hash; delete base.sig;
  if (V.v2Problems(base).length) return null;
  const clean = part => !V.v2Problems(Object.assign({}, base, part)).length;
  const seen = {}, first = (x, list) => {
    const id = String((x && x.id) || "");
    if (!id || seen[list + id]) return false;
    return (seen[list + id] = true);
  };
  const tags = (Array.isArray(data.tags) ? data.tags : []).filter(t => first(t, "t") && clean({ tags: [t] }));
  const kept = {}; tags.forEach(t => { kept[t.id] = 1; });
  const at = [], cards = [];
  data.cards.forEach((c, i) => {
    const own = c && typeof c === "object" && Array.isArray(c.requests)
      ? Object.assign({}, c, { requests: c.requests.filter(r => kept[r]) }) : c;
    if (first(own, "c") && clean({ tags, cards: [own] })) { cards.push(own); at.push(i); }
  });
  const rest = Object.assign({}, base, { tags, cards });
  return cards.length && !V.v2Problems(rest).length ? { rest, at } : null;
}

/** Returns {errors, warnings, awaiting}. Errors are things the engine mishandles or that
 *  corrupt personal state (id collisions); warnings are things an author probably wants to
 *  know; awaiting is one finding per declared non-primary language any card lacks.
 *  `at` is internal: each card's place in the file, where the cards linted are fewer. */
function lintCatalog(c, at) {
  const errors = [], warnings = [], awaiting = [];
  const err = s => errors.push(s), warn = s => warnings.push(s);
  if (!c || typeof c !== "object") { err("catalog is not an object"); return { errors, warnings, awaiting }; }
  /* A format 2 payload is mapped before anything below reads it, so one linter serves the file
     and the runtime shape alike: a caller with a file in hand has the first, a caller holding a
     catalog the runtime has already read has the second. What the ENGINE would refuse is
     reported as errors first, and the rules below then run over what the reader can load, so
     one refused card does not hide every other finding. */
  {
    const r = asRuntimeCatalog(c);
    if (r.problems.length) {
      r.problems.forEach(err);
      const part = lintableRest(c);
      if (part) {
        const more = lintCatalog(part.rest, part.at);
        more.errors.forEach(err); more.warnings.forEach(warn);
        more.awaiting.forEach(a => awaiting.push(a));
      }
      return { errors, warnings, awaiting };
    }
    c = r.cat;
  }
  const place = ix => (at ? at[ix] : ix) + 1;
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
  /* The catalog's own variables are tokens the desk fills, bare and inline. An inline form gives a
     word per rule; GENDER's third is nonbinary, which the desk leaves to the agent when missing. */
  const VR = varRules();
  const varList = (c.variables && Array.isArray(c.variables.list)) ? c.variables.list : [];
  const catVar = name => varList.find(d => d && d.name === name) || null;
  const INLINE = /^(GENDER|GREET|PAX|NAME|INTENT|TOPIC|AGENT|ROLE)$/;
  const rulesOf = name => { const d = catVar(name) || (INLINE.test(name) ? VR.varBuiltin(name) : null);
    return d && Array.isArray(d.rules) ? d.rules.length : 0; };
  const lacking = Object.create(null);
  cards.forEach((m, ix) => {
    const title = m && m[KEY("t", primary)];
    const where = "card " + place(ix) + (title ? ' ("' + title + '")' : "");
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
    /* Format 2 ids differ, so two cards with one title on one shelf collide in nothing: they look
       alike at the desk, and a star, hide or edit an older desk carries by title reaches neither
       (rekeyOldCards). So the title is keyed as that function buckets it, trimmed and case kept. */
    // JSON-encoded pair, so no separator occurring inside a key or title can spoof a match.
    // A raw NUL separator lived here once and made git treat this whole file as binary.
    const key = JSON.stringify([String(m.c || ""), String(title || "").trim()]);
    if (seen[key]) err(where + ": same title as card " + seen[key] + " in this category, so at the desk the two are hard to tell apart; one needs a title of its own, or the two can become one card");
    seen[key] = place(ix);
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
      warn("card " + place(ix) + ': Polish body puts a bare "' + barePrep.join('", "')
        + '" in front of {INTENT}. The clause is in the instrumental, so the preposition is the'
        + " {Z} token, which alternates z and ze by what follows it");
    /* By index for the reason above: the deployment catalog carries one such token today. {WHO}
       in en or pl is the error further down, and is not said twice. */
    declared.forEach(code => {
      const key = BODY_OF[code], seen = new Set();
      String(m[key] == null ? "" : m[key]).replace(TOKEN_SHAPE, (raw, name, a) => {
        const T = filledTokens();
        if (seen.has(raw)) return raw;
        if (a && name !== "DAYPART" && rulesOf(name)) {
          seen.add(raw);
          const given = a.slice(1).split("|").length, n = rulesOf(name);
          if (name === "GENDER" && given < 3)
            warn("card " + place(ix) + ": This card gives {GENDER} no words for nonbinary, so for a nonbinary"
              + " customer the desk leaves that place to the agent.");
          if (given < n && !(name === "GENDER" && given === 2))
            warn("card " + place(ix) + ": This card gives {" + name + "} fewer words than it has rules;"
              + " the rest write the first.");
          return raw;
        }
        if ((a ? T.arg : T.bare).has(name) || (!a && catVar(name))) return raw;
        if (raw === "{WHO}" && (key === "en" || key === "pl")) return raw;
        seen.add(raw);
        warn("card " + place(ix) + ": " + raw + " in the " + code.toUpperCase()
          + " body is not a token the desk fills, so it is copied as written");
        return raw;
      });
    });
    if (m.seq && !m.alt) warn(where + ": seq without alt does nothing (blocks only split when alt is set)");
    if (catVar("PAX") && VR.paxOwnOn(m) && declared.some(code => String(m[BODY_OF[code]] || "").indexOf("{PAX}") > -1))
      warn("card " + place(ix) + ": This card sets {PAX} by hand, apart from the catalog's address.");
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
          legacy.push((m.t || m.id || "card " + (place(i) - 1)) + " (" + k + ")");
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
    const want = "ee6221554249010827c096678d7b110b2ddbd47aa3c4a269f57cc450e8628901";
    if (got !== want) { hardFail++;
      console.error("  ERROR: shell/etiuda.ico is sha256 " + got.slice(0, 16) + ", not the mark"
        + " this build ships (" + want.slice(0, 16) + ") - if the mark was rebuilt, move this hash"
        + " in that commit"); }
    else console.log("  shell/etiuda.ico is the mark as built, sha256 " + got.slice(0, 16)
      + ", " + fs.statSync(ico).size + " bytes");
    /* The frames the set's app icon carries; a size Windows asks for that is not among them is
       drawn from the next larger frame scaled down. */
    const icoBuf = fs.readFileSync(ico), wantSizes = [16, 24, 32, 48, 64, 128, 256];
    const sizes = [];
    for (let i = 0; i < icoBuf.readUInt16LE(4); i++) sizes.push(icoBuf.readUInt8(6 + 16 * i) || 256);
    if (sizes.join() !== wantSizes.join()) { hardFail++;
      console.error("  ERROR: shell/etiuda.ico holds frames of " + sizes.join(", ") + " px, not " + wantSizes.join(", ")); }
    else console.log("  and it holds the set's " + sizes.length + " frames: " + sizes.join(", "));
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
      /* EACH TEXT CLOSES ON THE TRADEMARK NOTICE About shows, read from its one line in about.js,
         so a registration that edits that line reddens here until both texts follow it. */
      const decl = extractDecl(sourceText(), "const TRADEMARK=");
      const mark = new Function("return " + decl.slice(decl.indexOf("=") + 1, -1))();
      want.forEach(f => {
        const line = mark[f.slice(8, 10)] || "";
        const paras = fs.readFileSync(path.join(shell, f), "utf8").replace(/^﻿/, "").trim()
          .split(/\n\s*\n/);
        if (!line || paras[paras.length - 1] !== line || paras.filter(p => p === line).length !== 1)
          bad.push(f + " does not close, once, on the notice " + JSON.stringify(line));
      });
      bad.forEach(x => console.error("  ERROR: " + x));
      if (bad.length) hardFail++;
      else console.log("  the installer's licence page: " + sizes.join(", ")
        + ", both UTF-8 with a BOM, under buildResources, each closing on its trademark notice");
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

  section("[2f/5] the fuses the executable is built with");
  try {
    /* ELECTRON-BUILDER COPIES ONLY THE FUSE NAMES IT KNOWS, so a misspelt key leaves that fuse at
       Electron's default with no error anywhere. Each wanted key is read as electron-builder
       reads it, in its own generateFuseConfig, and the value the config gives it is checked.
       This is the ask only; the built program is read by tools/package.mjs, held by tests/fuses.mjs. */
    const root = path.join(__dirname, "..");
    const want = { runAsNode: false, enableNodeOptionsEnvironmentVariable: false,
                   enableNodeCliInspectArguments: false, enableEmbeddedAsarIntegrityValidation: false,
                   onlyLoadAppFromAsar: true, grantFileProtocolExtraPrivileges: true };
    const cfg = require(path.join(root, "electron-builder.js")).electronFuses || {};
    const packager = fs.readFileSync(path.join(root, "node_modules", "app-builder-lib", "out",
      "platformPackager.js"), "utf8");
    const bad = [];
    Object.keys(cfg).forEach(k => { if (packager.indexOf("fuses." + k + " != null") < 0)
      bad.push(k + " is not a fuse electron-builder reads"); });
    Object.keys(want).forEach(k => { if (cfg[k] !== want[k])
      bad.push(k + " is " + JSON.stringify(cfg[k]) + ", wanted " + want[k]); });
    bad.forEach(x => console.error("  ERROR: " + x));
    if (bad.length) hardFail++;
    else console.log("  " + Object.keys(cfg).length + " fuses set, each one electron-builder reads: "
      + Object.keys(cfg).map(k => k + " " + cfg[k]).join(", "));
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
    else console.log("  window.E_CATALOG still read, storage namespaced "
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
                   searchFns, rankForQuery, runSearchEval, filledTokens };
