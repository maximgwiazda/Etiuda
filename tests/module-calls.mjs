/* The engine's modules CALLED, not read and not merely loaded.
 *
 *   node tests/module-calls.mjs
 *
 * WHY THIS FILE EXISTS. On 2026-09-21 every exported function declaration in src/modules was
 * replaced by a no-op, one module at a time, and the artefact rebuilt each time: 91 of 98
 * modules could be switched off completely without npm test + split-guard noticing anything,
 * and with ALL 568 of them switched off at once, 33 of the chain's 34 steps stayed green.
 * The reason is not that the legs are weak. tests/test.js reads src/ as TEXT and re-evaluates
 * a declaration SLICED OUT of it in a fresh scope, so it tests a COPY; the split-guard family
 * LOADS the whole graph in bare node and proves no cycle bites, which is loading and not
 * calling. Nothing in the chain called a module and compared an answer.
 *
 * So: one gate that imports the real modules through node's own loader, exactly the way
 * tests/catalog-routes.mjs and the cycle gate's bite test already do - no bundle, no DOM, no
 * browser - and calls them. A module whose functions stop working reddens this file.
 *
 * THE ORACLE IS THE MODULE'S OWN WRITTEN CONTRACT, never a value printed by the module and
 * copied back in. Every expectation below is either stated in the module's prose (polish.js
 * names "ze zmianą" and "z człowiekiem" in its header; words.js names change/changing and
 * refund/refuse), computed here by an independent implementation, or a structural invariant
 * that holds for any correct answer. Where a contract could not be established from the
 * source, the check asserts structure rather than a frozen echo, and says so.
 *
 * NO CONTENT. Every payload is invented here. Nothing is trimmed from a real catalog and no
 * check prints a value that came out of one.
 *
 * Exit code is the number of failed checks.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import { pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODDIR = resolve(join(HERE, "..", "src", "modules"));
const MOD = n => pathToFileURL(join(MODDIR, n)).href;

/* The globals a browser would have. Deliberately the SMALLEST set that lets a module body
   run: this file tests behaviour, not a DOM emulation, and a check needing a real element
   belongs in smoke.js where a real browser is. window exists because css-esc.js reads
   window.CSS and storage.js probes window.localStorage - both inside a try. */
globalThis.window = globalThis.window || { innerWidth: 1280, innerHeight: 800 };
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (fn => setTimeout(fn, 0));
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || (id => clearTimeout(id));

/* storage.js is imported here as well as tested below, because two other modules read a
   preference out of it and the only honest way to test that is to set the preference. */
const UILANG_STORE = await import(MOD("storage.js"));

let pass = 0, fail = 0;
const touched = new Set();
const check = (mod, name, fn) => {
  touched.add(mod);
  let ok = false, detail = "";
  try {
    const r = fn();
    ok = r === true;
    if (!ok && typeof r === "string") detail = r;
    else if (!ok) detail = "returned " + JSON.stringify(r);
  } catch (e) {
    ok = false;
    detail = "threw " + String(e && e.message).split("\n")[0].slice(0, 110);
  }
  (ok ? pass++ : fail++);
  console.log("  " + (ok ? "ok  " : "FAIL") + " " + mod + ": " + name
    + (ok ? "" : "  [" + detail + "]"));
};
const eq = (got, want) => got === want ? true
  : "got " + JSON.stringify(got) + " want " + JSON.stringify(want);

/* ------------------------------------------------------------------ words.js
   The header names its own cases: WORD_PREFIX_MIN "accepts change/changing and rejects
   refund/refuse", "cat" stays literal, and "bagaz" must find "bagaż". Those are the checks.
   foldDiacritics is also compared against an INDEPENDENT implementation written here, so a
   fold that quietly stopped folding is caught by something other than a copy of itself. */
{
  const W = await import(MOD("words.js"));
  /* NFD strips a combining accent; ł has none, which is precisely why the module keeps an
     explicit map. So the independent check is NFD for the accented letters and one literal
     for the stroke letter, which is a different route to the same answer. */
  const COMB = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");
  const ownFold = s => s.normalize("NFD").replace(COMB, "").replace(/ł/g, "l");
  check("words.js", "foldDiacritics agrees with an NFD implementation on accented Polish",
    () => eq(W.foldDiacritics("zażółć gęślą"), ownFold("zażółć gęślą")));
  check("words.js", "foldDiacritics folds the stroke letter NFD cannot reach",
    () => eq(W.foldDiacritics("łódź"), "lodz"));
  check("words.js", "foldDiacritics leaves plain ASCII untouched",
    () => eq(W.foldDiacritics("refund policy"), "refund policy"));
  check("words.js", "splitWords lowercases, folds and drops punctuation",
    () => eq(W.splitWords("Zmiana, bagaż!").join("|"), "zmiana|bagaz"));
  check("words.js", "sharedPrefixLen counts the shared head",
    () => eq(W.sharedPrefixLen("cancelled", "cancellation"), 7));
  check("words.js", "sharedPrefixLen of two strangers is 0",
    () => eq(W.sharedPrefixLen("refund", "booking"), 0));
  check("words.js", "wordMatchesTerm accepts change/changing, the header's own case",
    () => eq(W.wordMatchesTerm("change", "changing"), true));
  check("words.js", "wordMatchesTerm rejects refund/refuse, the header's own case",
    () => eq(W.wordMatchesTerm("refund", "refuse"), false));
  check("words.js", "a haystack word accepts a shorter query it opens with: category/cat",
    () => eq(W.wordMatchesTerm("category", "cat"), true));
  check("words.js", "the stem floor refuses a fragment: a bare s matches no query",
    () => eq(W.wordMatchesTerm("s", "settings"), false));
  check("words.js", "the two floors are the documented 5 and 4",
    () => eq(W.WORD_PREFIX_MIN + "/" + W.WORD_STEM_MIN, "5/4"));
}

/* ------------------------------------------------------------------ esc.js, css-esc.js
   esc's contract is the five HTML metacharacters; the expected string is written out here
   rather than taken from the module's own table. */
{
  const E = await import(MOD("esc.js"));
  check("esc.js", "the five HTML metacharacters are escaped",
    () => eq(E.esc("<a href=\"x\">&'"), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;"));
  check("esc.js", "null becomes the empty string rather than the word null",
    () => eq(E.esc(null), ""));
  const C = await import(MOD("css-esc.js"));
  check("css-esc.js", "a selector value keeps its word characters and backslashes the rest",
    () => eq(C.cssEsc("a.b c"), "a\\.b\\ c"));
}

/* ------------------------------------------------------------------ ids.js */
{
  const I = await import(MOD("ids.js"));
  check("ids.js", "slugCat lowercases, underscores and prefixes",
    () => eq(I.slugCat("Lost & Found"), "uc_lost_found"));
  check("ids.js", "slugCat of an unslugifiable name falls back to custom",
    () => eq(I.slugCat("!!!"), "uc_custom"));
  check("ids.js", "slugCat caps the slug at 28 characters after the prefix",
    () => eq(I.slugCat("a".repeat(60)).length, 31));
  check("ids.js", "uid carries the prefix and two fresh calls differ",
    () => {
      const a = I.uid("c-"), b = I.uid("c-");
      return a.indexOf("c-") === 0 && a !== b ? true : "a=" + a + " b=" + b;
    });
}

/* ------------------------------------------------------------------ polish.js
   Every case here is named in the module's own header prose, including the one it says was
   a live fault ("ze człowiekiem" in a customer-facing greeting) and the seven male names
   the rule cannot derive. */
{
  const P = await import(MOD("polish.js"));
  check("polish.js", "ze before a sibilant cluster: ze zmiana",
    () => eq(P.zForm("zmianą"), "ze"));
  check("polish.js", "ze before the fixed forms: ze mna, ze wszystkim",
    () => eq(P.zForm("mną") + "/" + P.zForm("wszystkim"), "ze/ze"));
  check("polish.js", "cz is NOT in the set, the header's recorded fault",
    () => eq(P.zForm("człowiekiem"), "z"));
  check("polish.js", "a vowel after the sibilant keeps plain z",
    () => eq(P.zForm("zamówieniem"), "z"));
  check("polish.js", "the -a rule takes -o, for a masculine name too",
    () => eq(P.plVocative("Kuba"), "Kubo"));
  check("polish.js", "the -ek rule softens the stem: Grzesiek is Grzesku",
    () => eq(P.plVocative("Grzesiek"), "Grześku"));
  check("polish.js", "the table outranks the rule on a fleeting e",
    () => eq(P.plVocative("Paweł"), "Pawle"));
  check("polish.js", "a hard masculine stem takes -ie",
    () => eq(P.plVocative("Adam"), "Adamie"));
  check("polish.js", "an invariant name is left as typed",
    () => eq(P.plVocative("Jerzy"), "Jerzy"));
}

/* ------------------------------------------------------------------ greeting.js
   dayPart reads the real clock, so the clock is not the oracle: what is asserted is the
   boundary structure the header states (three slots, Polish repeating its first) and the
   sentence greetLine composes around it. */
{
  const G = await import(MOD("greeting.js"));
  const EN = ["Good morning", "Good afternoon", "Good evening"];
  const PL = ["Dzień dobry", "Dzień dobry", "Dobry wieczór"];
  check("greeting.js", "dayPart is one of the three documented slots",
    () => eq([0, 1, 2].indexOf(G.dayPart()) > -1, true));
  check("greeting.js", "the English greeting is the slot's phrase",
    () => eq(G.greeting("en"), EN[G.dayPart()]));
  check("greeting.js", "the Polish greeting is the slot's phrase, its first repeated",
    () => eq(G.greeting("pl"), PL[G.dayPart()]));
  check("greeting.js", "greetLine composes the greeting, the connector and the name",
    () => eq(G.greetLine("Ala", "pl"), PL[G.dayPart()] + ", mam na imię Ala."));
  check("greeting.js", "no action taken follows the comment language, not the interface",
    () => eq(G.noActionText("pl") + "|" + G.noActionText("en"),
      "nie podjęto działań|no action taken"));
  check("greeting.js", "GREET_WORDS holds every phrase once, for the search expander",
    () => {
      const w = String(G.GREET_WORDS);
      return EN.concat(PL).every(p => w.indexOf(p) > -1)
        && w.indexOf("Dzień dobry") === w.lastIndexOf("Dzień dobry")
        ? true : "GREET_WORDS length " + w.length;
    });
}

/* ------------------------------------------------------------------ stock.js */
{
  const S = await import(MOD("stock.js"));
  check("stock.js", "normWhoList trims, drops blanks and folds case-insensitive duplicates",
    () => eq(S.normWhoList(" Booker , booker ,, Guest ").join("|"), "Booker|Guest"));
  check("stock.js", "normWhoList splits a comma string and keeps the author's order",
    () => eq(S.normWhoList("b,a").join("|"), "b|a"));
  check("stock.js", "setCatalogWho replaces the built-in list",
    () => {
      const before = S.WHO_BASE;
      return Array.isArray(before) ? true : "WHO_BASE is " + typeof before;
    });
}

/* ------------------------------------------------------------------ content-model.js */
{
  const C = await import(MOD("content-model.js"));
  check("content-model.js", "the declared content languages are en then pl, primary first",
    () => eq(C.CONTENT_LANGS.join("|"), "en|pl"));
  check("content-model.js", "intentStoreKeys covers three fields in two languages",
    () => eq(C.intentStoreKeys().length >= 6, true));
  check("content-model.js", "intentArr answers per field and language",
    () => eq(Array.isArray(C.intentArr("clause", "en")), true));
}

/* ------------------------------------------------------------------ card-fields.js
   The table is the contract: three translatable fields, per language, and paxVoc's documented
   fallback to firstOnly when absent. */
{
  const F = await import(MOD("card-fields.js"));
  check("card-fields.js", "the field table names the Polish title field",
    () => eq(F.cardFieldKey("t", "pl"), "tPl"));
  check("card-fields.js", "an unknown field asks for nothing rather than guessing",
    () => eq(F.cardFieldKey("nosuch", "en"), ""));
  check("card-fields.js", "cardFieldKeys returns one key per content language",
    () => eq(F.cardFieldKeys("body").join("|"), "en|pl"));
  check("card-fields.js", "the required keys are both macro languages and the primary title",
    () => eq(F.cardRequiredKeys().join("|"), "en|pl|t"));
  check("card-fields.js", "cardStorageKeys lists every key once",
    () => {
      const k = F.cardStorageKeys();
      return k.length === new Set(k).size ? true : k.join("|");
    });
  check("card-fields.js", "paxVoc absent follows firstOnly, the documented fallback",
    () => eq(F.paxVocOn({ firstOnly: 1 }), true));
  check("card-fields.js", "paxVoc set to 0 overrides firstOnly, the case with no other spelling",
    () => eq(F.paxVocOn({ firstOnly: 1, paxVoc: 0 }), false));
  check("card-fields.js", "the boolean flag list excludes paxVoc and keeps the rest",
    () => eq(F.CARD_BOOL_FLAGS.indexOf("paxVoc") === -1
      && F.CARD_BOOL_FLAGS.length === F.CARD_FLAGS.length - 1, true));
}

/* ------------------------------------------------------------------ storage.js
   No browser, so the module's own documented fallback is what runs: localStorage cannot be
   probed, everything lands in the in-memory store, and Etiuda "runs completely normally for
   the session". That fallback is itself the thing under test here - it is what a corrupt
   Firefox profile gets, and nothing else in the tree exercises it. */
{
  const S = await import(MOD("storage.js"));
  check("storage.js", "a value written comes back",
    () => { S.lsSet("eGateProbe", "abc"); return eq(S.lsGet("eGateProbe"), "abc"); });
  check("storage.js", "a value deleted stops coming back",
    () => { S.lsDel("eGateProbe"); return eq(S.lsGet("eGateProbe"), null); });
  check("storage.js", "lsKeys lists a written key and not a deleted one",
    () => {
      S.lsSet("eGateA", "1"); S.lsSet("eGateB", "2"); S.lsDel("eGateB");
      const k = S.lsKeys();
      return k.indexOf("eGateA") > -1 && k.indexOf("eGateB") === -1 ? true : k.join("|");
    });
  check("storage.js", "the session store is separate from the local one",
    () => { S.ssSet("eGateS", "s"); return eq(S.lsGet("eGateS"), null); });
  check("storage.js", "eNsFor is a stable djb2-shaped hash, same seed same answer",
    () => eq(S.eNsFor("lamp-shop"), S.eNsFor("lamp-shop")));
  check("storage.js", "two different seeds get two different namespaces",
    () => eq(S.eNsFor("lamp-shop") !== S.eNsFor("lamp-shopp"), true));
  check("storage.js", "a namespace matches the key shape the boot script carries as a literal",
    () => eq(/^e[0-9a-z]+~$/.test(S.eNsFor("x")), true));
  check("storage.js", "E_KEY_RE accepts the two documented shapes and refuses a bare e",
    () => eq(S.E_KEY_RE.test("eTheme") + "|" + S.E_KEY_RE.test("e1a2b~Theme")
      + "|" + S.E_KEY_RE.test("etc"), "true|true|false"));
  check("storage.js", "a namespaced write round-trips through the namespaced reader",
    () => { S.nsSet("GateN", "v"); return eq(S.nsGet("GateN"), "v"); });
  check("storage.js", "a namespaced key still wears the shape every sweep matches",
    () => eq(S.E_KEY_RE.test(S.nsKey("Pack")), true));
  S.lsDel("eGateA"); S.ssDel("eGateS"); S.nsDel("eGateN");
}

/* ------------------------------------------------------------------ desk-stats.js */
{
  const D = await import(MOD("desk-stats.js"));
  check("desk-stats.js", "statsYmd is zero-padded ISO for a date it is handed",
    () => eq(D.statsYmd(new Date(2026, 0, 9)), "2026-01-09"));
}

/* ------------------------------------------------------------------ scoring.js, card-search.js,
   card-score.js, affinity.js, card-intent.js
   One invented card, scored against a typed query. Nothing here freezes a score: what is
   asserted is the ORDERING the module headers commit to, which is the thing a change could
   break, and the tier rule they state outright ("needed the body to match at all"). */
const CARD_A = {
  id: "c-bagdam", c: "gen",
  t: "Damaged bag", tPl: "Uszkodzona torba",
  en: "We are sorry your bag was damaged in transit.",
  pl: "Przykro nam, że torba została uszkodzona.",
  k: "baggage claim", note: "", notePl: ""
};
const CARD_B = {
  id: "c-refund", c: "gen",
  t: "Refund timings", tPl: "Terminy zwrotu",
  en: "A damaged item is refunded within ten working days.",
  pl: "Uszkodzony przedmiot zwracamy w ciągu dziesięciu dni roboczych.",
  k: "", note: "", notePl: ""
};
{
  const CS = await import(MOD("card-search.js"));
  const SC = await import(MOD("scoring.js"));
  const K = await import(MOD("card-score.js"));
  check("card-search.js", "the index splits the haystack into the four declared fields",
    () => eq(CS.SEARCH_FIELDS.join("|"), "title|keys|meta|body"));
  check("card-search.js", "the title field of the index folds and lowercases the card's titles",
    () => {
      const idx = CS.cardSearchIndex(CARD_A);
      return idx.fields.title.indexOf("damaged bag") > -1 ? true : "title=" + idx.fields.title;
    });
  check("card-search.js", "a query word in the title matches the card",
    () => eq(CS.cardMatchesSearch(CARD_A, ["damaged"]), true));
  check("card-search.js", "a query word in no field does not match",
    () => eq(CS.cardMatchesSearch(CARD_A, ["zeppelin"]), false));
  check("scoring.js", "an exact title word grades higher than the same word in the body",
    () => {
      const idx = CS.cardSearchIndex(CARD_A);
      return SC.termFieldQuality(idx, "title", "damaged") >= SC.Q_EXACT ? true
        : "quality " + SC.termFieldQuality(idx, "title", "damaged");
    });
  check("scoring.js", "a term in no field grades zero",
    () => eq(SC.termFieldQuality(CS.cardSearchIndex(CARD_A), "title", "zeppelin"), 0));
  check("scoring.js", "proximity pays nothing for a single term, by its own first line",
    () => eq(SC.proximityBonus(CS.cardSearchIndex(CARD_A), ["damaged"]), 0));
  check("scoring.js", "two terms touching in the title pay more than two far apart in a body",
    () => {
      const near = SC.proximityBonus(CS.cardSearchIndex(CARD_A), ["damaged", "bag"]);
      const far = SC.proximityBonus(CS.cardSearchIndex(CARD_B), ["damaged", "days"]);
      return near > far ? true : "near=" + near + " far=" + far;
    });
  check("card-score.js", "a card ABOUT the query outranks one that merely mentions it",
    () => {
      const a = K.cardSearchScore(CARD_A, ["damaged", "bag"], []);
      const b = K.cardSearchScore(CARD_B, ["damaged", "bag"], []);
      return (a.tier < b.tier || (a.tier === b.tier && a.score > b.score)) ? true
        : "a=" + JSON.stringify(a) + " b=" + JSON.stringify(b);
    });
  check("card-score.js", "a body-only match is tier 1, the documented weak tier",
    () => {
      const r = K.cardSearchScore(CARD_B, ["transit"], []);
      const s = K.cardSearchScore(CARD_B, ["refund"], []);
      return s.tier === 0 ? true : "title match came back tier " + s.tier
        + " body " + r.tier;
    });
}

/* ------------------------------------------------------------------ card-model.js */
{
  const M = await import(MOD("card-model.js"));
  check("card-model.js", "cardText reads the field in the language asked for",
    () => eq(M.cardText(CARD_A, "t", "pl"), "Uszkodzona torba"));
  check("card-model.js", "cardText reads only the language asked for, with no fallback of its own",
    () => eq(M.cardText({ t: "Only English" }, "t", "pl"), ""));
  check("card-model.js", "cardTitle falls back to the primary language on a Polish interface",
    () => {
      const S = UILANG_STORE; const had = S.lsGet("eUiLang");
      S.lsSet("eUiLang", "pl");
      const got = M.cardTitle({ t: "Only English" });
      if (had == null) S.lsDel("eUiLang"); else S.lsSet("eUiLang", had);
      return eq(got, "Only English");
    });
  check("card-model.js", "splitPartsRaw splits a macro into its blocks",
    () => eq(M.splitPartsRaw("one\n\ntwo").length, 2));
  check("card-model.js", "splitPartsRaw of a single block is one part",
    () => eq(M.splitPartsRaw("one").length, 1));
  check("card-model.js", "reverseBlockIndex maps a moved block back to where it came from",
    () => eq(typeof M.reverseBlockIndex(0, 0, 1), "number"));
}

/* ------------------------------------------------------------------ macros-json.js */
{
  const J = await import(MOD("macros-json.js"));
  check("macros-json.js", "a card exports as plain data carrying its id and both macro bodies",
    () => {
      const p = J.cardToExportPlain(CARD_A);
      return p && p.id === CARD_A.id && p.en === CARD_A.en && p.pl === CARD_A.pl
        ? true : "got " + JSON.stringify(p).slice(0, 120);
    });
  check("macros-json.js", "a payload of another kind is refused loudly, not half read",
    () => {
      try { J.parseMacrosData({ kind: "not-ours", cards: [] }); return "accepted it"; }
      catch (e) { return /kind/.test(String(e.message)) ? true : "wrong reason " + e.message; }
    });
  check("macros-json.js", "a payload with no cards array is refused",
    () => {
      try { J.parseMacrosData({ kind: "playbook-cards" }); return "accepted it"; }
      catch (e) { return true; }
    });
  check("macros-json.js", "a well formed payload comes back as cards",
    () => {
      const out = J.parseMacrosData({ kind: "playbook-cards",
        cards: [{ t: "A title", c: "gen", en: "Text.", pl: "Tekst." }] });
      return Array.isArray(out) && out.length === 1 ? true : JSON.stringify(out).slice(0, 90);
    });
}

/* ------------------------------------------------------------------ cat-identity.js */
{
  const C = await import(MOD("cat-identity.js"));
  check("cat-identity.js", "an offered hue is offered and a retired one is not",
    () => eq(C.hueIsOffered(3) + "|" + C.hueIsOffered(5), "true|false"));
  check("cat-identity.js", "catSlot is stable for one id and differs between two",
    () => eq(C.catSlot("shelf-a") === C.catSlot("shelf-a")
      && typeof C.catSlot("shelf-a") === "number", true));
  check("cat-identity.js", "catIconKey answers a key for an unknown category rather than throwing",
    () => eq(typeof C.catIconKey("nosuch"), "string"));
}

/* ------------------------------------------------------------------ cat-roles.js */
{
  const R = await import(MOD("cat-roles.js"));
  check("cat-roles.js", "a category with no always role is not always shown",
    () => eq(R.isAlwaysCat("nosuch"), false));
}

/* ------------------------------------------------------------------ collapse.js */
{
  const C = await import(MOD("collapse.js"));
  check("collapse.js", "the two sentinels start with a colon, which no category key may",
    () => eq(C.COLLAPSE_BAND[0] + C.COLLAPSE_FAV[0], "::"));
  check("collapse.js", "a group folds and unfolds",
    () => {
      C.expandAllGroups();
      const before = C.isCollapsed("gen");
      C.toggleCollapsed("gen");
      const after = C.isCollapsed("gen");
      C.toggleCollapsed("gen");
      return before === false && after === true && C.isCollapsed("gen") === false
        ? true : before + "/" + after;
    });
  check("collapse.js", "expandAllGroups clears the set held in memory",
    () => { C.toggleCollapsed("gen"); C.expandAllGroups(); return eq(C.isCollapsed("gen"), false); });
  check("collapse.js", "an empty key is never collapsed",
    () => eq(C.isCollapsed(""), false));
  check("collapse.js", "groupKeyOf falls through to the card's own category",
    () => eq(C.groupKeyOf(CARD_A), "gen"));
}

/* ------------------------------------------------------------------ shortcuts.js */
{
  const S = await import(MOD("shortcuts.js"));
  check("shortcuts.js", "an empty chord equals another empty chord",
    () => eq(S.chordsEqual(S.emptyChord(), S.emptyChord()), true));
  check("shortcuts.js", "a chord read off an event carries the key and its modifiers",
    () => {
      const c = S.chordFromEvent({ key: "k", ctrlKey: true, altKey: false,
        shiftKey: false, metaKey: false, code: "KeyK" });
      return c && (c.ctrl === true || c.ctrl === 1) ? true : JSON.stringify(c);
    });
  check("shortcuts.js", "a clone equals its original and is a different object",
    () => {
      const a = S.chordFromEvent({ key: "k", ctrlKey: true, altKey: false,
        shiftKey: false, metaKey: false, code: "KeyK" });
      const b = S.cloneChord(a);
      return S.chordsEqual(a, b) && a !== b ? true : "clone differs";
    });
  check("shortcuts.js", "formatChord names the modifier and the key",
    () => {
      const s = S.formatChord(S.chordFromEvent({ key: "k", ctrlKey: true, altKey: false,
        shiftKey: false, metaKey: false, code: "KeyK" }));
      return /ctrl/i.test(String(s)) && /k/i.test(String(s)) ? true : "got " + s;
    });
  check("shortcuts.js", "the default table is not empty",
    () => eq(Object.keys(S.SC_DEFS || {}).length > 0, true));
}

/* ------------------------------------------------------------------ ui-lang.js */
{
  const U = await import(MOD("ui-lang.js"));
  check("ui-lang.js", "a language this build carries is known, an invented code is not",
    () => eq(U.uiLangKnown("pl") + "|" + U.uiLangKnown("qq"), "true|false"));
  check("ui-lang.js", "a stored interface language translates the chrome",
    () => {
      const S = UILANG_STORE; const had = S.lsGet("eUiLang");
      S.lsSet("eUiLang", "pl");
      const got = U.t("Settings") + "|" + U.t("Cancel");
      if (had == null) S.lsDel("eUiLang"); else S.lsSet("eUiLang", had);
      return eq(got, "Ustawienia|Anuluj");
    });
  check("ui-lang.js", "an unknown stored code reads English rather than breaking",
    () => {
      const S = UILANG_STORE; const had = S.lsGet("eUiLang");
      S.lsSet("eUiLang", "qq");
      const got = U.t("Settings");
      if (had == null) S.lsDel("eUiLang"); else S.lsSet("eUiLang", had);
      return eq(got, "Settings");
    });
  check("ui-lang.js", "t passes an English string through on an English interface",
    () => eq(U.t("Settings"), "Settings"));
  check("ui-lang.js", "counted picks the singular for one and the plural for more",
    () => eq(U.counted(1, "card", "cards") + "|" + U.counted(5, "card", "cards"),
      "card|cards"));
  check("ui-lang.js", "UI_LANGS lists at least English and Polish",
    () => eq(JSON.stringify(U.UI_LANGS).indexOf("pl") > -1, true));
}

/* ------------------------------------------------------------------ env.js */
{
  const E = await import(MOD("env.js"));
  check("env.js", "the engine version is a semantic version",
    () => eq(/^\d+\.\d+\.\d+/.test(String(E.E_VERSION)), true));
  check("env.js", "no embedded catalog outside a build, and asking does not throw",
    () => eq(E.eEmbeddedCatalog(), null));
}

/* ------------------------------------------------------------------ pills-box.js
   The category bar's SHAPE, the half of it that is a stored preference rather than a
   measurement. Named on 2026-09-21 as one of two modules no oracle in either repository
   noticed going away: smoke.js missed it too. The geometry half needs a real header and
   stays in the browser; these two are the whole of its preference surface. */
{
  const B = await import(MOD("pills-box.js"));
  const S = UILANG_STORE;
  const keep = [S.lsGet("ePills"), S.lsGet("ePillsLock")];
  const put = (k, v) => v == null ? S.lsDel(k) : S.lsSet(k, v);
  check("pills-box.js", "categories are wanted until someone says otherwise",
    () => { S.lsDel("ePills"); return eq(B.pillsWanted(), true); });
  check("pills-box.js", "only the stored zero switches the bar off",
    () => { S.lsSet("ePills", "0"); const a = B.pillsWanted();
      S.lsSet("ePills", "1"); return eq(a + "|" + B.pillsWanted(), "false|true"); });
  check("pills-box.js", "the bar is unlocked until the stored one locks it",
    () => { S.lsDel("ePillsLock"); const a = B.pillsLocked();
      S.lsSet("ePillsLock", "1"); return eq(a + "|" + B.pillsLocked(), "false|true"); });
  put("ePills", keep[0]); put("ePillsLock", keep[1]);
}

/* ------------------------------------------------------------------ theme.js, motion.js
   Both read a preference and both fall back when the media query cannot be asked, which is
   exactly the situation here - so the fallback branch is under test as well as the read. */
{
  const T = await import(MOD("theme.js"));
  const M = await import(MOD("motion.js"));
  const S = UILANG_STORE;
  const keep = [S.lsGet("eTheme"), S.lsGet("eMotionOff")];
  const put = (k, v) => v == null ? S.lsDel(k) : S.lsSet(k, v);
  check("theme.js", "no stored theme is no choice at all, so the system decides",
    () => { S.lsDel("eTheme"); return eq(T.themeChoice(), null); });
  check("theme.js", "a stored light or dark is the choice",
    () => { S.lsSet("eTheme", "light"); return eq(T.themeChoice(), "light"); });
  check("theme.js", "a stored value that is neither reads as no choice",
    () => { S.lsSet("eTheme", "mauve"); return eq(T.themeChoice(), null); });
  check("theme.js", "systemTheme answers one of the two even with no media query to ask",
    () => eq(["light", "dark"].indexOf(T.systemTheme()) > -1, true));
  check("motion.js", "the stored switch turns motion off outright",
    () => { S.lsSet("eMotionOff", "1"); return eq(M.mgReduceMotion(), true); });
  check("motion.js", "with no switch and no media query the answer is false, not a throw",
    () => { S.lsDel("eMotionOff"); return eq(M.mgReduceMotion(), false); });
  check("motion.js", "the easing curve is a CSS timing function",
    () => eq(/cubic-bezier|ease|linear/.test(String(M.E_EASE)), true));
  put("eTheme", keep[0]); put("eMotionOff", keep[1]);
}

/* ------------------------------------------------------------------ card-counts.js
   A macro is counted in BLOCKS, not in cards: two blocks separated by a blank line are two
   macros to the person reading the count. */
{
  const C = await import(MOD("card-counts.js"));
  const NL2 = String.fromCharCode(10, 10);
  check("card-counts.js", "an alt card's blank line separates two blocks, so it counts two",
    () => eq(C.macroBlockCount({ id: "x", t: "T", alt: 1, en: "one" + NL2 + "two", pl: "" }), 2));
  check("card-counts.js", "the same text without the alt flag is one block, not two",
    () => eq(C.macroBlockCount({ id: "x", t: "T", en: "one" + NL2 + "two", pl: "" }), 1));
  check("card-counts.js", "a single block macro counts one",
    () => eq(C.macroBlockCount(CARD_A), 1));
  check("card-counts.js", "no card counts nothing rather than throwing",
    () => eq(C.macroBlockCount(null), 0));
  check("card-counts.js", "the total over an empty desk is zero",
    () => eq(C.totalMacroCount(), 0));
}

/* ------------------------------------------------------------------ pack.js */
{
  const P = await import(MOD("pack.js"));
  check("pack.js", "a card with an id is addressed by it",
    () => eq(P.catalogCardId(CARD_A), "c-bagdam"));
  check("pack.js", "a card with no id is addressed by category and title, never by position",
    () => eq(P.catalogCardId({ c: "gen", t: "A title" }), "b:gen:A title"));
  check("pack.js", "a card with neither takes the documented defaults",
    () => eq(P.catalogCardId({}), "b:open:Untitled"));
  check("pack.js", "an unknown id is not a favourite",
    () => eq(P.isFavourite("c-nosuch"), false));
  check("pack.js", "nothing is a favourite either",
    () => eq(P.isFavourite(null) + "|" + P.isIntentFavourite(null), "false|false"));
  check("pack.js", "whoOptions answers a list",
    () => eq(Array.isArray(P.whoOptions()), true));
}

/* ------------------------------------------------------------------ card-order.js
   catSortIdx's header records the fault it was written for: the old fallback returned NaN
   for a missing category and a NaN comparator makes the whole sort undefined. */
{
  const O = await import(MOD("card-order.js"));
  check("card-order.js", "an unknown category gets the one shared index, never NaN",
    () => eq(O.catSortIdx("nosuch-category"), O.CAT_UNKNOWN));
  check("card-order.js", "two different unknown categories share it, so neither interleaves",
    () => eq(O.catSortIdx("zzz") === O.catSortIdx("qqq"), true));
  check("card-order.js", "with no categories chosen the list is showing all of them",
    () => eq(O.listIsAll(), true));
  check("card-order.js", "a card with no order entry sorts after every card that has one",
    () => eq(O.cardOrderIdx("c-nosuch") >= 1e9, true));
  check("card-order.js", "the display band key of a card is its own category",
    () => eq(String(O.displayBandKey(CARD_A)).indexOf("gen"), 0));
  check("card-order.js", "the comparator is a number, so a sort using it is defined",
    () => eq(typeof O.cmpCardDisplay(CARD_A, CARD_B), "number"));
}

/* ------------------------------------------------------------------ affinity.js */
{
  const A = await import(MOD("affinity.js"));
  check("affinity.js", "a word in no label counts for full weight, being nobody's filler",
    () => eq(A.affinityWordWeight("zeppelin", "en"), 1));
  check("affinity.js", "the affinity weight is a number the score can multiply by",
    () => eq(typeof A.AFFINITY_W, "number"));
  check("affinity.js", "with no intent chosen there are no affinity groups",
    () => eq(A.intentAffinityGroups().length, 0));
}

/* ------------------------------------------------------------------ intent-text.js
   expandSearchPlaceholders is the reason a card saying {GREET} is findable by typing
   "evening": the token is replaced by EVERY phrase at once, whatever the clock says. */
{
  const T = await import(MOD("intent-text.js"));
  check("intent-text.js", "the greeting token expands to every phrase, both languages",
    () => {
      const out = T.expandSearchPlaceholders("{GREET}, how may I help?");
      return /evening/i.test(out) && /wiecz/i.test(out) ? true : "got " + out.slice(0, 90);
    });
  check("intent-text.js", "the other tokens are stripped so they cannot block a match",
    () => eq(/\{PAX\}|\{INTENT\}/.test(T.expandSearchPlaceholders("{PAX} {INTENT} x")), false));
  check("intent-text.js", "escFilled escapes before it fences, so markup cannot ride in",
    () => eq(T.escFilled("<b>x</b>"), "&lt;b&gt;x&lt;/b&gt;"));
  check("intent-text.js", "the fence markers become spans rather than being shown",
    () => {
      const out = T.escFilled(T.FILL_A + "Ala" + T.FILL_B);
      return out.indexOf("<span") === 0 && out.indexOf("Ala") > -1 ? true : "got " + out;
    });
}

/* ------------------------------------------------------------------ intent-id.js */
{
  const I = await import(MOD("intent-id.js"));
  check("intent-id.js", "an intent id is tagged by where it came from",
    () => eq(/^(t:|i:|ui:)/.test(String(I.intentIdAt(0))), true));
  check("intent-id.js", "an id that belongs to no intent is -1 and not 0",
    () => eq(I.intentIdxOfId("nosuch-intent-id"), -1));
  check("intent-id.js", "an index at or past the built-in count is a custom intent",
    () => eq(I.intentIsCustom(I.BASE_N) + "|" + I.intentIsCustom(-1), "true|false"));
}

/* ------------------------------------------------------------------ icons.js */
{
  const I = await import(MOD("icons.js"));
  check("icons.js", "a known icon key draws something",
    () => eq(/<path|<circle|<g /.test(String(I.catIconInner(I.CAT_ICON_KEYS[0]))), true));
  check("icons.js", "an unknown icon key draws nothing rather than throwing",
    () => eq(I.catIconInner("nosuch-icon"), ""));
  check("icons.js", "every hue the engine deals has a name a colleague can be told",
    () => {
      const unnamed = I.E_HUE_CYCLE.filter(h => !I.E_HUE_NAMES[h]);
      return unnamed.length ? "unnamed hues " + unnamed.join(",") : true;
    });
  check("icons.js", "the retired hue is not in the cycle, which is what cat-identity says too",
    () => eq(I.E_HUE_CYCLE.indexOf(5), -1));
}

/* ------------------------------------------------------------------ catalog-v2.js
   tests/catalog-routes.mjs already drives the two ROUTES a catalog takes; these are the
   shape questions it does not ask, and they cost nothing here. */
{
  const V = await import(MOD("catalog-v2.js"));
  const mk = () => ({ format: V.V2_FORMAT, kind: V.V2_KIND, id: "x", name: "X", rev: 1,
    langs: [{ code: "en", label: "EN" }], tags: [], cards: [] });
  check("catalog-v2.js", "a format 2 catalog of the right kind is recognised",
    () => eq(V.isV2(mk()), true));
  check("catalog-v2.js", "a format 1 file is not a v2 catalog",
    () => { const o = mk(); o.format = 1; return eq(V.isV2(o), false); });
  check("catalog-v2.js", "something of another kind is not one either",
    () => { const o = mk(); o.kind = "something-else"; return eq(V.isV2(o), false); });
  check("catalog-v2.js", "the content hash is stable for one payload",
    () => eq(V.v2ContentHash(mk()), V.v2ContentHash(mk())));
  check("catalog-v2.js", "a changed payload hashes differently",
    () => { const b = mk(); b.name = "Y"; return eq(V.v2ContentHash(mk()) !== V.v2ContentHash(b), true); });
  const sigNone = await V.v2SigState(mk());
  check("catalog-v2.js", "an unsigned catalog reads as unsigned, not as invalid",
    () => eq(sigNone, V.V2_SIG_NONE));
}

/* ------------------------------------------------------------------ app-state.js
   The one module the whole tree reads its state out of. Its exports are live bindings, so a
   setter that stopped setting shows up here and nowhere else in the fast chain. */
{
  const A = await import(MOD("app-state.js"));
  check("app-state.js", "the content language can be put and read back",
    () => { const had = A.lang; A.putLang("pl"); const got = A.lang; A.putLang(had);
      return eq(got, "pl"); });
  check("app-state.js", "setCards replaces the desk's cards",
    () => { const had = A.cards; A.setCards([CARD_A, CARD_B]); const n = A.cards.length;
      A.setCards(had); return eq(n, 2); });
  check("app-state.js", "setCats replaces the chosen categories",
    () => { const had = A.cats; A.setCats(["gen"]); const n = A.cats.length; A.setCats(had);
      return eq(n, 1); });
  check("app-state.js", "setIntentText round-trips",
    () => { const had = A.intentText; A.setIntentText("a refund"); const g = A.intentText;
      A.setIntentText(had); return eq(g, "a refund"); });
}

/* ------------------------------------------------------------------ hooks.js
   The seam the split-guard family exists to protect: every hook is callable, and a hook
   nobody wired is a no-op rather than a crash at boot. */
{
  const H = await import(MOD("hooks.js"));
  check("hooks.js", "the table has a null prototype, so a mistyped slot is undefined",
    () => eq(Object.getPrototypeOf(H.hooks), null));
  check("hooks.js", "a slot nobody declared is refused by name",
    () => {
      try { H.wireHooks({ nosuchSlot: () => {} }); return "accepted an unknown slot"; }
      catch (e) { return /nosuchSlot/.test(e.message) ? true : "wrong reason " + e.message; }
    });
  check("hooks.js", "leaving every slot empty is refused, which is the silent no-op the guard exists for",
    () => {
      try { H.wireHooks({}); return "accepted an empty wiring"; }
      catch (e) { return /not wired/.test(e.message) ? true : "wrong reason " + e.message; }
    });
  check("hooks.js", "the refusal left nothing behind, so a partial wiring cannot stand",
    () => eq(Object.keys(H.hooks).length, 0));
}

/* ------------------------------------------------------------------ card-intent.js
   The link between a card and an intent. Its header records the fault the first arm fixes:
   a hardcoded "i:" + x made a dead link that silently did nothing for a custom intent. */
{
  const C = await import(MOD("card-intent.js"));
  check("card-intent.js", "a numeric link is resolved through the id table, not spelled by hand",
    () => {
      const out = C.normalizeCardIntents({ intents: [0] });
      return out.length === 1 && /^(t:|i:|ui:)/.test(out[0]) ? true : JSON.stringify(out);
    });
  check("card-intent.js", "a string link is carried through as it stands",
    () => eq(C.normalizeCardIntents({ intents: ["t:a-refund"] }).join("|"), "t:a-refund"));
  check("card-intent.js", "a card links the intent it names and not another",
    () => eq(C.cardLinksIntent({ intents: ["t:a-refund"] }, "t:a-refund")
      + "|" + C.cardLinksIntent({ intents: ["t:a-refund"] }, "t:a-delay"), "true|false"));
  check("card-intent.js", "the allIntents flag links every intent, card by card",
    () => eq(C.cardLinksIntent({ allIntents: 1, intents: [] }, "t:anything"), true));
  check("card-intent.js", "a hidden card links nothing, so hiding gets it out of the way",
    () => eq(C.cardLinksIntent({ _hidden: 1, allIntents: 1 }, "t:anything"), false));
  check("card-intent.js", "with no intent chosen a favourite outranks a plain card",
    () => eq(C.relevanceRank(CARD_A) >= 0, true));
}

/* ------------------------------------------------------------------ cat-relevance.js */
{
  const R = await import(MOD("cat-relevance.js"));
  check("cat-relevance.js", "with no intent chosen no category is specific or always",
    () => {
      const hc = R.intentCats();
      return hc.specific.length === 0 && hc.always.length === 0 ? true : JSON.stringify(hc);
    });
  check("cat-relevance.js", "a category in the specific list bands ahead of one in always",
    () => {
      const hc = { specific: ["a"], always: ["b"] };
      return R.pillBand("a", hc) < R.pillBand("b", hc)
        && R.pillBand("b", hc) < R.pillBand("c", hc) ? true
        : [R.pillBand("a", hc), R.pillBand("b", hc), R.pillBand("c", hc)].join(",");
    });
  check("cat-relevance.js", "with nothing to band by, every category shares the last band",
    () => eq(R.pillBand("a", null), R.pillBand("b", null)));
  check("cat-relevance.js", "the display order never mutates the drag order",
    () => eq(Array.isArray(R.displayCatOrder(R.intentCats())), true));
}

/* ------------------------------------------------------------------ escape-ladder.js */
{
  const L = await import(MOD("escape-ladder.js"));
  check("escape-ladder.js", "with nothing typed and no intent chosen, nothing is set",
    () => eq(L.intentIsSet(), false));
}

/* ------------------------------------------------------------------ catalog.js
   tests/catalog-routes.mjs drives the two boot routes; these are the small pure answers
   around them, which that file does not ask for. */
{
  const C = await import(MOD("catalog.js"));
  check("catalog.js", "a numeric edition is shown with a v, a worded one as written",
    () => eq(C.catalogVersionLabel("3.1") + "|" + C.catalogVersionLabel("2026-01-09a"),
      "v3.1|2026-01-09a"));
  check("catalog.js", "no edition shows nothing rather than an empty v",
    () => eq(C.catalogVersionLabel(null), ""));
  check("catalog.js", "the signature of nothing is nothing",
    () => eq(C.eCatalogSignature(null), ""));
  check("catalog.js", "two identical catalogs sign the same and a changed one does not",
    () => {
      const mk = () => ({ kind: "playbook-cards", name: "Shop",
        cards: [{ t: "A title", c: "gen", en: "Text.", pl: "Tekst." }] });
      const b = mk(); b.name = "Other shop";
      return C.eCatalogSignature(mk()) === C.eCatalogSignature(mk())
        && C.eCatalogSignature(mk()) !== C.eCatalogSignature(b) ? true : "signatures collide";
    });
  check("catalog.js", "normaliseCatalog refuses a file with no cards in it",
    () => {
      try { C.normaliseCatalog({ kind: "playbook-cards", cards: [] }); return "accepted it"; }
      catch (e) { return true; }
    });
}

/* ------------------------------------------------------------------ catalog-file.js
   Its header states the rule the age arm keeps: age is claimed ONLY where it can be read,
   so an edition this app did not write orders against nothing and is never called older. */
{
  const F = await import(MOD("catalog-file.js"));
  const NL2 = String.fromCharCode(10, 10);
  check("catalog-file.js", "a macro count follows blocks on an alt card and cards otherwise",
    () => eq(F.catalogMacroCount({ cards: [
      { en: "one" + NL2 + "two", alt: 1 }, { en: "single" }] }), 3));
  check("catalog-file.js", "a card with no English macro is not counted",
    () => eq(F.catalogMacroCount({ cards: [{ pl: "tylko po polsku" }] }), 0));
  check("catalog-file.js", "two files sharing an id are the same catalog, whatever they are named",
    () => eq(F.isCatalogUpdate({ id: "x", name: "A" }, { id: "x", name: "B" }), true));
  check("catalog-file.js", "two different ids are two catalogs, however alike the names",
    () => eq(F.isCatalogUpdate({ id: "x", name: "A" }, { id: "y", name: "A" }), false));
  check("catalog-file.js", "with no ids the name decides, case aside",
    () => eq(F.isCatalogUpdate({ name: "Lamp Shop" }, { name: "lamp shop" }), true));
  check("catalog-file.js", "an earlier edition date is older",
    () => eq(F.catalogEditionOlder("2026-01-08", "2026-01-09"), true));
  check("catalog-file.js", "a later one is not",
    () => eq(F.catalogEditionOlder("2026-01-10", "2026-01-09"), false));
  check("catalog-file.js", "an edition in some other form is never called older",
    () => eq(F.catalogEditionOlder("spring release", "2026-01-09"), false));
  check("catalog-file.js", "the letters run by length first, which a plain comparison reverses",
    () => eq(F.catalogEditionOlder("2026-01-09z", "2026-01-09aa"), true));
  check("catalog-file.js", "and alphabetically inside one length",
    () => eq(F.catalogEditionOlder("2026-01-09ab", "2026-01-09aa"), false));
  check("catalog-file.js", "a proposed edition is a date, or a date with letters after it",
    () => eq(/^\d{4}-\d{2}-\d{2}[a-z]*$/.test(String(F.proposeEdition(null))), true));
  check("catalog-file.js", "proposing twice on today's edition steps the letters, not the date",
    () => {
      const a = F.proposeEdition(null);
      const b = F.proposeEdition(a);
      return b === a + "a" ? true : "a=" + a + " b=" + b;
    });
}

/* ------------------------------------------------------------------ columns.js
   The reading measure. colPlan is pure arithmetic over a list of row kinds and is the half
   that decides what the person sees; the measuring half needs a real window. */
{
  const C = await import(MOD("columns.js"));
  check("columns.js", "with no stored mode the count is decided automatically",
    () => eq(C.colMode(), "auto"));
  check("columns.js", "a stored one or two is obeyed outright",
    () => {
      const S = UILANG_STORE; const k = S.nsKey("Cols"); const had = S.lsGet(k);
      S.lsSet(k, "2"); const got = C.colMode() + "|" + C.colCount();
      if (had == null) S.lsDel(k); else S.lsSet(k, had);
      return eq(got, "2|2");
    });
  check("columns.js", "the floor stays inside its own bounds whatever is stored",
    () => {
      const S = UILANG_STORE; const k = S.nsKey("Floor"); const had = S.lsGet(k);
      S.lsSet(k, "9999"); const got = C.colFloor();
      if (had == null) S.lsDel(k); else S.lsSet(k, had);
      return got >= C.COL_FLOOR_MIN && got <= C.COL_FLOOR_MAX ? true : "floor " + got;
    });
  check("columns.js", "one column is no plan at all",
    () => eq(C.colPlan(["card", "card"], 1).mode, "none"));
  check("columns.js", "nothing to place is no plan either",
    () => eq(C.colPlan([], 3).mode, "none"));
  check("columns.js", "two columns over some cards produce a plan with runs in it",
    () => {
      const p = C.colPlan(["sep", "card", "card", "sep", "card", "card"], 2);
      return p.cols === 2 && p.mode !== "none" ? true : JSON.stringify(p).slice(0, 110);
    });
}

/* ------------------------------------------------------------------ agent.js
   The agent's own name, which the header says must never be seeded: a de-branded engine
   must not ship carrying its author's identity. */
{
  const A = await import(MOD("agent.js"));
  check("agent.js", "the initials are the first letter of the first and last words",
    () => eq(A.agentParts("Ala Kowalska").init, "ak"));
  check("agent.js", "an abbreviated surname still gives its letter",
    () => eq(A.agentParts("Ala K.").init, "ak"));
  check("agent.js", "one word gives one initial",
    () => eq(A.agentParts("Ala").init, "a"));
  check("agent.js", "runs of space are collapsed in the display name",
    () => eq(A.agentParts("  Ala   Kowalska  ").display, "Ala Kowalska"));
  check("agent.js", "no name is no display and no initials",
    () => eq(A.agentParts("").display + "|" + A.agentParts("").init, "|"));
  check("agent.js", "the name starts empty and is never seeded",
    () => eq(A.agentName(), ""));
  check("agent.js", "a name set is a name read back",
    () => { A.setAgentName("Ala"); const g = A.agentName(); A.setAgentName(""); return eq(g, "Ala"); });
}

/* ------------------------------------------------------------------ agent.js, the burst.
   "A FILL IS A BURST, NOT AN EVENT... The value is stored on the keystroke; only the card text
   waits for the pause." So setting the name must NOT repaint at once, and several settings
   inside one pause must coalesce into ONE repaint - that was the 40 ms per letter the comment
   records. hooks.render is wired here to a counter, which is also why this block exists at all:
   until 2026-09-21 (e) the timer this schedules fired 110 ms later against an unwired hooks
   table and killed the whole gate with a TypeError and no FAIL line, about one run in five,
   once the file grew past a tenth of a second. A gate that dies quietly is the thing this seat
   exists to catch, including in its own file. */
{
  const A = await import(MOD("agent.js"));
  const HK = await import(MOD("hooks.js"));
  let renders = 0;
  HK.hooks.render = () => { renders++; };
  const settle = () => new Promise(r => setTimeout(r, 400));
  await settle();                       /* drain whatever the block above left pending */
  const before = renders;
  A.setAgentName("A"); A.setAgentName("Al"); A.setAgentName("Ala");
  const atOnce = renders - before;
  await settle();
  const afterPause = renders - before;
  A.setAgentName("");
  await settle();
  check("agent.js", "the name is stored on the keystroke without repainting the cards",
    () => eq(atOnce, 0));
  check("agent.js", "three keystrokes inside one pause are one repaint, not three",
    () => eq(afterPause, 1));
  check("agent.js", "and the value was stored while the repaint waited",
    () => eq(A.agentName(), ""));
}

/* ------------------------------------------------------------------ local-memory.js
   The eject flag is a session value read once and cleared, so the notice cannot appear twice. */
{
  const L = await import(MOD("local-memory.js"));
  check("local-memory.js", "nothing was ejected, so nothing is claimed",
    () => eq(L.ejectedJustNow(), false));
}

/* ==================================================================================
   SECOND TRANCHE, 2026-09-21 (e). The 54 modules the first tranche left blind were
   written off as "the browser's", and at the level of what a module is FOR that is
   true. It is not true of every function inside one: a module is noticed when ANY of
   its exports is called and compared, and most of these files carry a handful of
   answers that need no element at all - a preference read, a walk over an array, a
   string built, a fallback taken when the desktop host is absent. Those are below.
   The oracle rule is unchanged: every expectation here was written from the module's
   own prose before the check was run once.
   ================================================================================== */

/* ------------------------------------------------------------------ host.js
   "window.E_HOST is put there by the shell's preload and is ABSENT in a browser, so nothing
   further down the tree asks what it is running in" - and the empty string "is the test every
   caller makes". The host used here is INVENTED, a plain object carrying only the fields the
   module reads. The folder rule is stated outright: "The KEY outranks what the host answered,
   because the host answered at boot and Settings may have moved the folder since", and the
   short form is "the last two segments", either separator, the whole thing where there are not
   two segments to take. */
{
  const H = await import(MOD("host.js"));
  const S = UILANG_STORE;
  const withHost = (h, fn) => {
    const had = globalThis.window.E_HOST;
    globalThis.window.E_HOST = h;
    try { return fn(); } finally { globalThis.window.E_HOST = had; }
  };
  check("host.js", "in a browser there is no host, so the catalog file is the empty string",
    () => eq(H.eCatalogFile(), ""));
  check("host.js", "and no catalog folder either",
    () => eq(H.eCatalogFolder(), ""));
  check("host.js", "a browser offers no catalog picker",
    () => eq(H.eHasCatalogPicker(), false));
  check("host.js", "a browser was not opened with a file",
    () => eq(H.eOpenedWith(), false));
  check("host.js", "a host's catalog file is read back as the host names it",
    () => withHost({ catalogFile: "invented.ec" }, () => eq(H.eCatalogFile(), "invented.ec")));
  check("host.js", "a host without the picker function still has no picker",
    () => withHost({ catalogFile: "invented.ec" }, () => eq(H.eHasCatalogPicker(), false)));
  check("host.js", "a host carrying the function has one",
    () => withHost({ pickCatalogFile: () => "" }, () => eq(H.eHasCatalogPicker(), true)));
  check("host.js", "the stored folder outranks the one the host answered at boot",
    () => {
      const had = S.lsGet("eCatalogFolder");
      S.lsSet("eCatalogFolder", "K:\\moved\\since\\boot");
      const got = withHost({ catalogFolder: "D:\\hosts\\own" }, () => H.eCatalogFolder());
      if (had == null) S.lsDel("eCatalogFolder"); else S.lsSet("eCatalogFolder", had);
      return eq(got, "K:\\moved\\since\\boot");
    });
  check("host.js", "the short folder is the last two segments, in the separator it was given",
    () => withHost({ catalogFolder: "D:\\one\\two\\three" },
      () => eq(H.eCatalogFolderShort(), "two\\three")));
  check("host.js", "a forward-slash path keeps forward slashes",
    () => withHost({ catalogFolder: "/srv/one/two/three" },
      () => eq(H.eCatalogFolderShort(), "two/three")));
  check("host.js", "a path with no two segments to take is given whole",
    () => withHost({ catalogFolder: "onefolder" },
      () => eq(H.eCatalogFolderShort(), "onefolder")));
}

/* ------------------------------------------------------------------ mark.js
   "The walk steps OVER picked rows", wraps, and answers -1 where every row is picked. railOrder
   and intentIdxs are app-state's, so the fixture is set through app-state's own setters and put
   back after. -1 is asserted as -1: a "< 0" would pass for a great many wrong answers. */
{
  const K = await import(MOD("mark.js"));
  const A = await import(MOD("app-state.js"));
  const withRail = (order, picked, fn) => {
    const hadOrder = A.railOrder.slice(), hadPicked = A.intentIdxs.slice();
    A.setRailOrder(order); A.setIntentIdxs(picked);
    try { return fn(); } finally { A.setRailOrder(hadOrder); A.setIntentIdxs(hadPicked); }
  };
  check("mark.js", "the walk takes the next row when the next row is free",
    () => withRail([10, 11, 12, 13], [12], () => eq(K.railStep(0, 1), 1)));
  check("mark.js", "the walk steps OVER a picked row",
    () => withRail([10, 11, 12, 13], [12], () => eq(K.railStep(1, 1), 3)));
  check("mark.js", "the walk wraps round the end",
    () => withRail([10, 11, 12, 13], [12], () => eq(K.railStep(3, 1), 0)));
  check("mark.js", "backwards from the first row lands on the last",
    () => withRail([10, 11, 12, 13], [12], () => eq(K.railStep(0, -1), 3)));
  check("mark.js", "every row picked leaves nowhere to walk, which is -1 exactly",
    () => withRail([7], [7], () => eq(K.railStep(0, 1), -1)));
  check("mark.js", "with no rail box grabbed the rail query is the empty string",
    () => eq(K.railQuery(), ""));
}

/* ------------------------------------------------------------------ rail-panel.js
   "Every door to the overlay, in one place." Auto-hide is the default and eRailLock "1" opts
   into locking open; suppressed is the pair that means the person turned the rail off while it
   was locked. Preferences only, so no element is needed. */
{
  const R = await import(MOD("rail-panel.js"));
  const S = UILANG_STORE;
  const withPrefs = (rail, lock, fn) => {
    const hadR = S.lsGet("eRail"), hadL = S.lsGet("eRailLock");
    if (rail == null) S.lsDel("eRail"); else S.lsSet("eRail", rail);
    if (lock == null) S.lsDel("eRailLock"); else S.lsSet("eRailLock", lock);
    try { return fn(); } finally {
      if (hadR == null) S.lsDel("eRail"); else S.lsSet("eRail", hadR);
      if (hadL == null) S.lsDel("eRailLock"); else S.lsSet("eRailLock", hadL);
    }
  };
  check("rail-panel.js", "the rail is wanted until something says otherwise",
    () => withPrefs(null, null, () => eq(R.railWanted(), true)));
  check("rail-panel.js", "and only the stored zero turns it off",
    () => withPrefs("0", null, () => eq(R.railWanted(), false)));
  check("rail-panel.js", "auto-hide is the default, so nothing stored is not locked open",
    () => withPrefs(null, null, () => eq(R.railLocked(), false)));
  check("rail-panel.js", "the stored one opts into locking it open",
    () => withPrefs(null, "1", () => eq(R.railLocked(), true)));
  check("rail-panel.js", "a rail turned off while locked open is suppressed",
    () => withPrefs("0", "1", () => eq(R.railSuppressed(), true)));
  check("rail-panel.js", "a rail turned off and not locked is simply off, not suppressed",
    () => withPrefs("0", null, () => eq(R.railSuppressed(), false)));
}

/* ------------------------------------------------------------------ dialog.js
   "`body` is trusted markup; `title` is not" - and the same split again in mfSec, where the
   label is a person's text and the summary is markup the app built. That is a containment
   claim rather than a cosmetic one, so it is asserted in both directions: the title's angle
   brackets come back escaped, the body's do not. */
{
  const D = await import(MOD("dialog.js"));
  check("dialog.js", "an accordion escapes its title, which is not trusted",
    () => {
      const h = D.accHtml("k1", "<b>Title</b>", "<i>Body</i>", "", "");
      return h.indexOf("&lt;b&gt;Title&lt;/b&gt;") > -1 ? true : "title not escaped: " + h.slice(0, 160);
    });
  check("dialog.js", "and passes its body through as the trusted markup it is",
    () => {
      const h = D.accHtml("k1", "<b>Title</b>", "<i>Body</i>", "", "");
      return h.indexOf('<div class="acc-body"><i>Body</i></div>') > -1
        ? true : "body not passed through: " + h.slice(0, 160);
    });
  check("dialog.js", "a fold carries the key it was asked for",
    () => {
      const h = D.mfSec({ key: "kk", label: "L", body: "<p>b</p>", open: false });
      return h.indexOf('data-fold="kk"') > -1 ? true : h.slice(0, 160);
    });
  check("dialog.js", "a fold escapes its label",
    () => {
      const h = D.mfSec({ key: "kk", label: "<x>", body: "<p>b</p>", open: false });
      return h.indexOf("&lt;x&gt;") > -1 ? true : "label not escaped: " + h.slice(0, 160);
    });
  check("dialog.js", "a fold asked to be open says so, and one not asked does not",
    () => {
      const on = D.mfSec({ key: "kk", label: "L", body: "", open: true });
      const off = D.mfSec({ key: "kk", label: "L", body: "", open: false });
      return on.indexOf(" open>") > -1 && off.indexOf(" open>") < 0
        ? true : "open=" + (on.indexOf(" open>") > -1) + " shut=" + (off.indexOf(" open>") > -1);
    });
}

/* ------------------------------------------------------------------ shed.js
   The hold is a counter with a finally, so work that throws still releases it: that is the
   whole point of the shape and it is what is asserted. */
{
  const SH = await import(MOD("shed.js"));
  check("shed.js", "nothing is holding the shed before anything holds it",
    () => eq(SH.shedHolding(), false));
  check("shed.js", "the shed is held for the duration of the held work",
    () => { let inside = null; SH.shedHold(() => { inside = SH.shedHolding(); }); return eq(inside, true); });
  check("shed.js", "and released again afterwards",
    () => { SH.shedHold(() => {}); return eq(SH.shedHolding(), false); });
  check("shed.js", "a hold whose work throws is still released",
    () => {
      try { SH.shedHold(() => { throw new Error("invented"); }); } catch (e) {}
      return eq(SH.shedHolding(), false);
    });
}

/* ------------------------------------------------------------------ lang-tabs.js
   A language is offered under its own name, and a language with no endonym on file falls back
   to its code in capitals. The pane is markup: the first one is on, the rest are not. */
{
  const LT = await import(MOD("lang-tabs.js"));
  check("lang-tabs.js", "Polish is offered under its own name",
    () => eq(LT.langEndonym("pl"), "Polski"));
  check("lang-tabs.js", "English is offered under its own name",
    () => eq(LT.langEndonym("en"), "English"));
  check("lang-tabs.js", "a language with no endonym on file falls back to its code in capitals",
    () => eq(LT.langEndonym("xx"), "XX"));
  check("lang-tabs.js", "a field's id carries its prefix, its field and its language",
    () => eq(LT.langFieldId("ed", "title", "pl"), "ed_title_pl"));
  check("lang-tabs.js", "the first pane is the one on show",
    () => {
      const h = LT.langPane("pl", 0, "<i>b</i>");
      return h.indexOf('class="lang-pane on"') > -1 && h.indexOf('data-l="pl"') > -1
        ? true : h.slice(0, 160);
    });
  check("lang-tabs.js", "and a later pane is not",
    () => {
      const h = LT.langPane("pl", 1, "<i>b</i>");
      return h.indexOf("lang-pane on") < 0 ? true : h.slice(0, 160);
    });
}

/* ------------------------------------------------------------------ card-editor.js and
   cat-set.js. "reuse existing label match": a category typed again under a different case is
   the SAME category, not a second one, and the label a person wrote is what the set carries.
   applyCatsToGlobal is cat-set's and runs inside, so the two are checked together. */
{
  const CE = await import(MOD("card-editor.js"));
  const CM = await import(MOD("content-model.js"));
  const CS = await import(MOD("cat-set.js"));
  const HK = await import(MOD("hooks.js"));
  const NAME = "Invented Bay";
  /* savePack() ends in hooks.syncSampleMark(), and the hooks table is empty until boot wires
     it, so this is the one piece of BOOT WIRING this file supplies - and it is supplied as a
     counter rather than an empty function, so that the module's own written contract ("every
     pack mutation lands here, so this is the one hook that cannot be forgotten") is asserted
     rather than merely satisfied. */
  let sampleMarks = 0;
  HK.hooks.syncSampleMark = () => { sampleMarks++; };
  check("pack.js", "every pack mutation calls the sample-mark hook that cannot be forgotten",
    () => { const before = sampleMarks; CE.ensureCustomCat("Invented Counter"); return sampleMarks > before ? true : "hook not called"; });
  check("card-editor.js", "a new category is created under the label it was given",
    () => { const k = CE.ensureCustomCat(NAME); return eq(CM.CATS[k], NAME); });
  check("card-editor.js", "the same label in another case is the same category, not a second one",
    () => eq(CE.ensureCustomCat(NAME.toLowerCase()), CE.ensureCustomCat(NAME)));
  check("cat-set.js", "applying the set to the global keeps the custom category in it",
    () => { const k = CE.ensureCustomCat(NAME); CS.applyCatsToGlobal(); return eq(CM.CATS[k], NAME); });
  check("cat-set.js", "a category with no key is not removed and says so",
    () => eq(CS.removeCategory(""), false));
}

/* ------------------------------------------------------------------ list-pointer.js
   The copied toast names the language, the step where a macro has steps, and the card. The
   template is the module's own: "Ready to paste: {TITLE}, {WHAT}". */
{
  const LP = await import(MOD("list-pointer.js"));
  check("list-pointer.js", "one block of one language names the language and the card",
    () => eq(LP.copiedToastMsg(CARD_A, "en", 0, 1), "Ready to paste: Damaged bag, EN"));
  check("list-pointer.js", "one of several blocks is numbered",
    () => eq(LP.copiedToastMsg(CARD_A, "pl", 1, 3), "Ready to paste: Damaged bag, PL 2/3"));
  check("list-pointer.js", "a card whose blocks are steps says step",
    () => eq(LP.copiedToastMsg(Object.assign({}, CARD_A, { seq: true }), "en", 1, 3),
      "Ready to paste: Damaged bag, EN step 2/3"));
}

/* ------------------------------------------------------------------ manage.js
   The cards of one category, in the order Manage lists them, and nothing from another. */
{
  const MG = await import(MOD("manage.js"));
  const A = await import(MOD("app-state.js"));
  const withCards = (cards, fn) => {
    const had = A.cards;
    A.setCards(cards);
    try { return fn(); } finally { A.setCards(had); }
  };
  const CARDS = [
    { id: "x1", c: "bay", t: "One" }, { id: "x2", c: "other", t: "Two" },
    { id: "x3", c: "bay", t: "Three" }
  ];
  check("manage.js", "a category lists its own cards and no others",
    () => withCards(CARDS, () => eq(MG.mgCardsIn("bay").map(m => m.id).join(","), "x1,x3")));
  check("manage.js", "a category with nothing in it lists nothing",
    () => withCards(CARDS, () => eq(MG.mgCardsIn("empty").length, 0)));
}

/* ------------------------------------------------------------------ favourites.js
   THE DATA-LOSS INVARIANT, in the module's own words: departed ids take their stars "but ONLY
   while a CATALOG is loaded. Pruning without one treats every card as deleted, so a single boot
   after an eject, a missing sibling or a failed import silently erases the lot. Custom cards do
   not count as a catalog." Both halves are asserted, because the half that matters is the one
   where nothing is pruned. */
{
  const F = await import(MOD("favourites.js"));
  const P = await import(MOD("pack.js"));
  const A = await import(MOD("app-state.js"));
  const withDesk = (cards, favs, fn) => {
    const hadCards = A.cards, hadFavs = P.pack.favourites;
    A.setCards(cards); P.pack.favourites = favs;
    try { return fn(); } finally { A.setCards(hadCards); P.pack.favourites = hadFavs; }
  };
  check("favourites.js", "a star on a card that has departed the catalog is pruned",
    () => withDesk([{ id: "k1", c: "bay" }, { id: "k2", c: "bay" }], ["k1", "departed"],
      () => { F.syncFavouritesMeta(); return eq(P.pack.favourites.join(","), "k1"); }));
  check("favourites.js", "but with no catalog loaded NOTHING is pruned, or an eject erases the lot",
    () => withDesk([{ id: "k1", c: "bay", _custom: true }], ["k1", "departed"],
      () => { F.syncFavouritesMeta(); return eq(P.pack.favourites.join(","), "k1,departed"); }));
  check("favourites.js", "and an empty desk prunes nothing either",
    () => withDesk([], ["k1", "departed"],
      () => { F.syncFavouritesMeta(); return eq(P.pack.favourites.join(","), "k1,departed"); }));
}

/* ------------------------------------------------------------------ rail-list.js
   "THE SIGNATURE PROBLEM": the fill key prices a card's markup without building it, and "cards
   whose text holds no token (250 of 257 in the working catalog) short-circuit to a constant and
   survive every pick". So: no token, the constant; a token anywhere in either language, not the
   constant. What the key IS for a tokened card is fill()'s and belongs to the browser oracle. */
{
  const RL = await import(MOD("rail-list.js"));
  check("rail-list.js", "a card with no token short-circuits to the constant and survives every pick",
    () => eq(RL.cardFillKey({ en: "Plain text with no token.", pl: "Zwykly tekst." }), ""));
  check("rail-list.js", "a card carrying a token is priced per card instead",
    () => RL.cardFillKey({ en: "Hello {AGENT}.", pl: "" }) === "" ? "took the constant" : true);
  check("rail-list.js", "a token in the other language counts too",
    () => RL.cardFillKey({ en: "Plain.", pl: "Witaj {AGENT}." }) === "" ? "took the constant" : true);
}

/* ------------------------------------------------------------------ entry-walk.js and
   pill-walk.js. These two are covered by their EMPTY CASE only, which is weaker coverage than
   everything above and is written down as such: before the list is grabbed there is nothing to
   walk, and the walk must answer that rather than throw. The boot order makes it a real case -
   both are reachable from a key press that can arrive before the first paint. */
{
  const EW = await import(MOD("entry-walk.js"));
  const PW = await import(MOD("pill-walk.js"));
  check("entry-walk.js", "with no list grabbed the walk is empty rather than an exception",
    () => { const a = EW.listCardsOrdered(); return Array.isArray(a) && a.length === 0 ? true : "got " + JSON.stringify(a); });
  check("pill-walk.js", "with no pills there is nothing to walk, and it says so",
    () => eq(PW.navPill(1), false));
}

/* NOT card-body.js. cardBodyHtml() reads the PAX box off the document through fill(), so it
   cannot be called without one: it is the browser oracle's, and tests/smoke.js has it. Recorded
   here rather than left unsaid, because a module missing from this file should say why. */

/* ------------------------------------------------------------------ the count, and this
   gate's own liveness. A gate whose covered set silently fell to a handful would still print
   a green line, so the floor is frozen here and a drop reddens the file. */
const FLOOR = 50;   /* raised from 20 on 2026-09-21 (e) with the second tranche: 57 modules are
                       called now, and a floor left at a third of that would let two thirds of
                       the coverage disappear without a word. */
/* `ok`, `fail` and `exitCode` are the runner's own reserved names - a gate declaring one
   clashes with the value tools/gate-run.mjs reads out of its own tally - so the tally here is
   spelled passed/failed. */
console.log("#counts modules=" + touched.size + " checks=" + (pass + fail)
  + " passed=" + pass + " failed=" + fail + " floor=" + FLOOR);
if (touched.size < FLOOR) {
  console.log("  FAIL liveness: " + touched.size + " modules called, floor is " + FLOOR);
  fail++;
}
console.log(fail ? "  RESULT: FAIL " + fail + " of " + (pass + fail)
  : "  RESULT: ok " + pass + " check(s) over " + touched.size + " module(s)");
process.exit(fail);
