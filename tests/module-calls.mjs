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
/* THE SYSTEM'S LANGUAGE IS PINNED, because the interface follows it where nothing is stored and
   node answers with this machine's own. English, as every check below that stores nothing
   expects; the checks of the rule itself set their own list and put this one back. */
const SYSTEM_LANGS = { list: ["en-US"] };
Object.defineProperty(globalThis, "navigator", { configurable: true,
  value: { get language() { return SYSTEM_LANGS.list[0]; }, get languages() { return SYSTEM_LANGS.list; } } });

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
  /* THE FORMAT'S RULE, written here rather than read from catalog-v2.js: 3 to 64 of a-z, 0-9 and the
     hyphen, the first not a hyphen. A thousand draws hold the shape and never repeat. */
  check("ids.js", "a new catalog id has the format's shape, and a thousand of them are all different",
    () => {
      const got = new Set(); let bad = "";
      for (let i = 0; i < 1000; i++) { const v = I.newCatalogId(); if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(v)) bad = v; got.add(v); }
      return bad ? "malformed: " + bad : eq(got.size, 1000);
    });
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
  check("card-fields.js", "the boolean flag list excludes paxVoc, keeps the rest of the boxed flags and adds the unboxed ones",
    () => eq(F.CARD_BOOL_FLAGS.indexOf("paxVoc") === -1
      && F.CARD_BOOL_FLAGS.length === F.CARD_FLAGS.length - 1 + F.CARD_UNBOXED_FLAGS.length
      && F.CARD_UNBOXED_FLAGS.every(f => F.CARD_BOOL_FLAGS.indexOf(f) > -1 && !(f in F.CARD_FLAG_BOX)), true));
  check("card-fields.js", "commits is a flag with no box in Advanced, so a caller that does not hold it has not unticked it",
    () => eq(F.CARD_UNBOXED_FLAGS.join(","), "commits"));
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
  /* THE ORBIT. The empty desk's layer is the build's namespace; a catalog's is a hash of its own id,
     and a name planted in it seeds nothing. */
  check("storage.js", "the empty desk's layer is the build's own namespace, a catalog's is its id's",
    () => eq([S.layerNsOf(null) === S.E_NS, S.layerNsOf({ id: "lamp-shop", name: "Lamp" }) === S.eNsFor("lamp-shop"),
      S.layerNsOf({ name: "Lamp" }) === S.E_NS, S.layerNsOf({ id: "a1" }) !== S.layerNsOf({ id: "a2" })].join(","),
      "true,true,true,true"));
  check("storage.js", "a desk from before the orbit has its one layer moved to the catalog loaded, once, and nothing after",
    () => {
      ["Pack", "CatOrder"].forEach(n => S.lsSet(S.E_NS + n, "old " + n));
      S.setLayer(S.eNsFor("orbit-probe"));
      const moved = S.orbitOldLayer();
      const there = [S.lyGet("Pack"), S.lyGet("CatOrder"), S.lsGet(S.E_NS + "Pack")];
      /* Once only, by its marker: the catalog's layer emptied (as a Clear would) and loose work made
         since, and a second start moves nothing. */
      S.lyDel("Pack"); S.lsSet(S.E_NS + "Pack", "made later");
      const again = S.orbitOldLayer();
      const listed = S.eLayers().indexOf(S.eNsFor("orbit-probe")) > -1;
      const out = [moved, there.join("|"), again, S.lsGet(S.E_NS + "Pack"), listed];
      S.lsDel(S.E_NS + "Pack"); S.lyDel("Pack"); S.lyDel("CatOrder"); S.setLayer(S.E_NS);
      return eq(JSON.stringify(out), JSON.stringify([2, "old Pack|old CatOrder|", 0, "made later", true]));
    });
  S.lsDel("eGateA"); S.ssDel("eGateS"); S.nsDel("eGateN");
}

/* ------------------------------------------------------------------ storage.js, whether a write
   landed. The contract is lsSet's own ("returns whether the value actually landed") and the
   notice's: while a write has failed, eSaveTrouble names when and where; a desk writes its whole
   map, so one good write settles every earlier failure; a browser settles key by key. A second
   instance of the module, by query string, is loaded against an invented host and store, because
   what the module decides at load is exactly what differs between a desk and a browser. */
{
  const saved = [];
  let refuse = false;
  window.E_HOST = { deskFile: "C:/lab/desk.json", deskRead: () => "{}",
                    deskSave: text => { if (refuse) return false; saved.push(text); return true; } };
  const D = await import(MOD("storage.js") + "?desk");
  delete window.E_HOST;
  check("storage.js", "2a THE CONTROL: a desk whose writes land reports no trouble",
    () => { D.lsSet("eGateOk", "1"); return eq(D.eSaveTrouble(), null); });
  refuse = true;
  check("storage.js", "2a a refused desk write is reported as refused, through nsSet as well as lsSet",
    () => eq(D.lsSet("eGateLost", "1") + "|" + D.nsSet("GateLostNs", "2"), "false|false"));
  check("storage.js", "2a and the trouble names when it began and the desk file it could not write",
    () => { const tr = D.eSaveTrouble();
            return tr && tr.since > 0 && tr.file === "C:/lab/desk.json" ? true : JSON.stringify(tr); });
  refuse = false;
  check("storage.js", "2a one write that lands settles it, and carries what was refused before it",
    () => { D.lsSet("eGateBack", "1");
            const map = JSON.parse(saved[saved.length - 1]);
            return D.eSaveTrouble() === null && map.eGateLost === "1" ? true
              : JSON.stringify([D.eSaveTrouble(), Object.keys(map)]); });
  /* AN OWN WRITE IS THE EXCEPTION: its caller speaks for its failure ("Could not save the catalog"),
     so a refused one must not ride the next write that lands, as the refused key above does. */
  refuse = true;
  check("storage.js", "2a an own write the desk refuses is taken back, and the next write that lands does not store it",
    () => { const own = D.lsSet("eGateOwn", "new", true), read = D.lsGet("eGateOwn");
            refuse = false; D.lsSet("eGateAfter", "1");
            const map = JSON.parse(saved[saved.length - 1]);
            return own === false && read === null && !("eGateOwn" in map) ? true
              : JSON.stringify([own, read, Object.keys(map)]); });
  check("storage.js", "2a a refused own write over a value leaves that value, and the same write lands once the desk takes it",
    () => { refuse = false; D.lsSet("eGateOwn2", "old", true);
            refuse = true; const r1 = D.lsSet("eGateOwn2", "new", true), kept = D.lsGet("eGateOwn2");
            refuse = false; const r2 = D.lsSet("eGateOwn2", "new", true);
            const map = JSON.parse(saved[saved.length - 1]);
            return r1 === false && kept === "old" && r2 === true && map.eGateOwn2 === "new" ? true
              : JSON.stringify([r1, kept, r2, map.eGateOwn2]); });
  refuse = false;

  const held = {};
  let full = false;
  const store = { setItem: (k, v) => { if (full && k !== "__eprobe") throw new Error("QuotaExceededError"); held[k] = String(v); },
                  getItem: k => (k in held ? held[k] : null), removeItem: k => { delete held[k]; } };
  window.localStorage = store; globalThis.localStorage = store;
  const B = await import(MOD("storage.js") + "?browser");
  full = true;
  check("storage.js", "2b a browser that refuses a key reports it, and a caller that speaks for itself is not counted",
    () => { const own = B.lsSet("eGateCat", "x", true), mine = B.eSaveTrouble() === null;
            B.lsSet("eGateStar", "1");
            const tr = B.eSaveTrouble();
            return own === false && mine && tr && tr.since > 0 && tr.file === "" ? true : JSON.stringify([own, mine, tr]); });
  full = false;
  check("storage.js", "2b another key landing does not settle it, and the refused key landing does",
    () => { B.lsSet("eGateOther", "1"); const still = B.eSaveTrouble() !== null;
            B.lsSet("eGateStar", "1");
            return still && B.eSaveTrouble() === null ? true : JSON.stringify([still, B.eSaveTrouble()]); });
  delete window.localStorage; delete globalThis.localStorage;

  /* The report is sent to whoever helps, so the desk path it shows carries no account name. */
  window.E_HOST = { deskFile: "C:\\Users\\Anna\\AppData\\Roaming\\etiuda\\desk.json", home: "c:\\users\\anna",
                    deskRead: () => "{}", deskSave: () => true };
  const H = await import(MOD("storage.js") + "?home");
  delete window.E_HOST;
  check("storage.js", "21a the desk path shown to a person writes the home folder as %USERPROFILE%, case-blind",
    () => eq(H.eDeskFileShown(), "%USERPROFILE%\\AppData\\Roaming\\etiuda\\desk.json"));
  check("storage.js", "21a THE CONTROL: a path outside the home folder, and a sibling account whose name begins with it, are shown whole",
    () => eq(H.eHomeless("D:\\desks\\desk.json", "C:\\Users\\Ann") + "|" + H.eHomeless("C:\\Users\\Anna\\desk.json", "C:\\Users\\Ann"),
             "D:\\desks\\desk.json|C:\\Users\\Anna\\desk.json"));
}

/* ------------------------------------------------------------------ desk-stats.js */
{
  const D = await import(MOD("desk-stats.js"));
  check("desk-stats.js", "statsYmd is zero-padded ISO for a date it is handed",
    () => eq(D.statsYmd(new Date(2026, 0, 9)), "2026-01-09"));
  /* THE LIFT, written out from the design's own formula: min(3, floor(log2(1 + n / 4))). */
  check("desk-stats.js", "22a a count lifts a search hit by 0, 1, 2 and 3 places for 3, 4, 12 and 28 copies, and by 3 for ten thousand",
    () => eq([3, 4, 12, 28, 10000].map(n => D.statsLift(n)).join(","), "0,1,2,3,3"));
  check("desk-stats.js", "22b and it is that formula at every count from 0 to 2000",
    () => {
      for (let n = 0; n <= 2000; n++) {
        const want = Math.min(3, Math.floor(Math.log2(1 + n / 4)));
        if (D.statsLift(n) !== want) return "n=" + n + " gave " + D.statsLift(n) + ", the formula " + want;
      }
      return true;
    });
  check("desk-stats.js", "22c a copy count nobody can read lifts nothing",
    () => eq([undefined, null, NaN, -5, "x"].map(n => D.statsLift(n)).join(","), "0,0,0,0,0"));
  /* 2026-10-01 less 27 days is 2026-09-04, and less 29 is 2026-09-02; the day between is
     the window's edge and is not asked. */
  const used = (pack, ymd, id, n) => { for (let i = 0; i < n; i++) D.bumpUse(pack, id, ymd); };
  check("desk-stats.js", "22d the recent use is this desk's copies over the 28 days ending today, summed from the day buckets",
    () => {
      const p = { useCounts: {}, useAt: {} };
      used(p, "2026-10-01", "c-a", 2); used(p, "2026-09-04", "c-a", 1); used(p, "2026-09-20", "c-b", 4);
      const u = D.statsRecentUse(p, "2026-10-01");
      return eq([u.get("c-a"), u.get("c-b"), u.size].join(","), "3,4,2");
    });
  check("desk-stats.js", "22e a day dated 29 days back counts for nothing, whatever it holds",
    () => {
      const p = { useCounts: {}, useAt: {} };
      used(p, "2026-09-02", "c-old", 50); used(p, "2026-10-01", "c-new", 1);
      const u = D.statsRecentUse(p, "2026-10-01");
      return eq([u.has("c-old"), u.get("c-new"), D.statsLift(u.get("c-old"))].join(","), "false,1,0");
    });
  check("desk-stats.js", "22f a copy dated after today is not this window's",
    () => {
      const p = { useCounts: {}, useAt: {} };
      used(p, "2026-10-09", "c-ahead", 5);
      return eq(D.statsRecentUse(p, "2026-10-01").size, 0);
    });
  /* NOTHING REORDERS UNDER THE HAND: the count is made once for a day and read until it turns. */
  check("desk-stats.js", "22g the count is held for the day it was made, so copies made since change nothing until the next day",
    () => {
      const p = { useCounts: {}, useAt: {} };
      used(p, "2026-10-01", "c-a", 2);
      const first = D.statsRecentUse(p, "2026-10-01").get("c-a");
      used(p, "2026-10-01", "c-a", 10);
      const same = D.statsRecentUse(p, "2026-10-01").get("c-a");
      const next = D.statsRecentUse(p, "2026-10-02").get("c-a");
      return eq([first, same, next].join(","), "2,2,12");
    });
  check("desk-stats.js", "22h a record loaded afresh (another pack object) is counted afresh, the same day",
    () => {
      const p = { useCounts: {}, useAt: {} }, q = { useCounts: {}, useAt: {} };
      used(p, "2026-10-01", "c-a", 2);
      D.statsRecentUse(p, "2026-10-01");
      used(q, "2026-10-01", "c-a", 7);
      return eq([D.statsRecentUse(p, "2026-10-01").get("c-a"), D.statsRecentUse(q, "2026-10-01").get("c-a")].join(","), "2,7");
    });
  check("desk-stats.js", "22i a pack that is not an object, or holds no days, gives no counts and does not throw",
    () => eq([null, undefined, 3, {}, { days: [] }, { days: { "2026-10-01": null } }].map(p => D.statsRecentUse(p, "2026-10-01").size).join(","), "0,0,0,0,0,0"));
  check("desk-stats.js", "22j a day dated 28 days back is outside the 28 days ending today, and 27 back is inside",
    () => {
      const p = { useCounts: {}, useAt: {} };
      used(p, "2026-09-03", "c-edge", 50); used(p, "2026-09-04", "c-in", 1);
      const u = D.statsRecentUse(p, "2026-10-01");
      return eq([u.has("c-edge"), u.get("c-in")].join(","), "false,1");
    });
  check("desk-stats.js", "22k called as the desk calls it, with no day named, the count is held through the day and made afresh when the clock turns",
    () => {
      const Real = globalThis.Date;
      let now = Real.UTC(2031, 2, 10, 11, 0, 0);
      globalThis.Date = class extends Real { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } };
      try {
        const p = { useCounts: {}, useAt: {} };
        used(p, "2031-03-10", "c-a", 2);
        const first = D.statsRecentUse(p).get("c-a");
        used(p, "2031-03-10", "c-a", 10);
        const same = D.statsRecentUse(p).get("c-a");
        now += 864e5;
        const next = D.statsRecentUse(p).get("c-a");
        return eq([first, same, next].join(","), "2,2,12");
      } finally { globalThis.Date = Real; }
    });
}

/* ------------------------------------------------------------------ desk-stats.js, B after A
   Board 814, ruled 2026-09-28 19:00: the desk learns "B after A" locally. The oracle is the
   module's own contract: a pair is counted per day by the places of both ids in dayIds, read
   back over STATS_PAIR_DAYS ending today, most often first, then the later day, then the id.
   The two CONTROLS hold on any tree: a day with no pair keeps its shape, and a desk that never
   counted one answers as it always did. The answer for a span carries the pairs counted inside
   it, as `pairs` [{from, to, n}], and an answer without a span carries none. */
{
  const D = await import(MOD("desk-stats.js"));
  const after = (p, from, today) => D.statsLearntAfter(p, from, today).map(o => o.id + ":" + o.n).join(",");
  const fresh = () => ({ useCounts: {}, useAt: {} });
  check("desk-stats.js", "814a a card copied straight after another is counted, and read back as the cards that follow it",
    () => {
      const p = fresh();
      for (let i = 0; i < 3; i++) D.bumpPair(p, "c-a", "c-b", "2026-10-01");
      D.bumpPair(p, "c-a", "c-c", "2026-09-30");
      D.bumpPair(p, "c-b", "c-a", "2026-10-01");
      return eq(after(p, "c-a", "2026-10-01") + "|" + after(p, "c-b", "2026-10-01") + "|" + after(p, "c-c", "2026-10-01"),
        "c-b:3,c-c:1|c-a:1|");
    });
  check("desk-stats.js", "814b equal counts put the pair met on the later day first, and a tie on both goes by id",
    () => {
      const p = fresh();
      D.bumpPair(p, "c-a", "c-old", "2026-09-20");
      D.bumpPair(p, "c-a", "c-new", "2026-09-29");
      D.bumpPair(p, "c-a", "c-z", "2026-09-25"); D.bumpPair(p, "c-a", "c-y", "2026-09-25");
      return eq(after(p, "c-a", "2026-10-01"), "c-new:1,c-y:1,c-z:1,c-old:1");
    });
  check("desk-stats.js", "814c a pair counts over the 28 days ending today: 27 days back is in, 28 back is out, after today is out",
    () => {
      const p = fresh();
      D.bumpPair(p, "c-a", "c-in", "2026-09-04");
      D.bumpPair(p, "c-a", "c-edge", "2026-09-03");
      D.bumpPair(p, "c-a", "c-ahead", "2026-10-02");
      return eq([after(p, "c-a", "2026-10-01"), D.STATS_PAIR_DAYS].join("|"), "c-in:1|28");
    });
  check("desk-stats.js", "814d a card after itself is no pair, and neither is one with an end missing",
    () => {
      const p = fresh();
      D.bumpPair(p, "c-a", "c-a", "2026-10-01"); D.bumpPair(p, "", "c-a", "2026-10-01"); D.bumpPair(p, "c-a", null, "2026-10-01");
      return eq([after(p, "c-a", "2026-10-01"), Object.keys(p.days || {}).length].join("|"), "|0");
    });
  check("desk-stats.js", "814e the oldest day going renumbers the ids, and the pairs follow their cards",
    () => {
      const p = fresh();
      D.bumpUse(p, "c-x", "2025-08-20");
      D.bumpUse(p, "c-a", "2026-09-20"); D.bumpUse(p, "c-b", "2026-09-20"); D.bumpPair(p, "c-a", "c-b", "2026-09-20");
      D.bumpUse(p, "c-a", "2026-10-01");
      return eq([p.dayIds.indexOf("c-x"), after(p, "c-a", "2026-10-01")].join("|"), "-1|c-b:1");
    });
  check("desk-stats.js", "814f an id a pair alone still names is kept when the day that counted its copy goes",
    () => {
      const p = fresh();
      D.bumpUse(p, "c-a", "2025-01-01");
      D.bumpUse(p, "c-b", "2025-01-02"); D.bumpPair(p, "c-a", "c-b", "2025-01-02");
      D.bumpUse(p, "c-z", "2026-02-06");
      return eq([Object.keys(p.days).sort().join(","), after(p, "c-a", "2025-01-02")].join("|"), "2025-01-02,2026-02-06|c-b:1");
    });
  check("desk-stats.js", "814g a card the catalog no longer has takes its pairs with it, from either end, and the rest stay",
    () => {
      const p = fresh();
      ["c-a", "c-b", "c-c", "c-d"].forEach(id => D.bumpUse(p, id, "2026-10-01"));
      D.bumpPair(p, "c-a", "c-b", "2026-10-01"); D.bumpPair(p, "c-a", "c-c", "2026-10-01"); D.bumpPair(p, "c-d", "c-a", "2026-10-01");
      D.statsForgetCards(p, id => id !== "c-c" && id !== "c-d");
      return eq([after(p, "c-a", "2026-10-01"), after(p, "c-d", "2026-10-01"), p.dayIds.join(",")].join("|"), "c-b:1||c-a,c-b");
    });
  check("desk-stats.js", "814o a pair met on several days counts all of them, and keeps its later day when the earlier one is counted after it",
    () => {
      const p = fresh();
      D.bumpPair(p, "c-a", "c-b", "2026-09-20"); D.bumpPair(p, "c-a", "c-b", "2026-09-25");
      D.bumpPair(p, "c-a", "c-c", "2026-10-01");
      D.bumpPair(p, "c-a", "c-d", "2026-09-30"); D.bumpPair(p, "c-a", "c-d", "2026-09-10");
      D.bumpPair(p, "c-a", "c-e", "2026-09-29"); D.bumpPair(p, "c-a", "c-e", "2026-09-29");
      return eq(after(p, "c-a", "2026-10-01"), "c-d:2,c-e:2,c-b:2,c-c:1");
    });
  check("desk-stats.js", "814H CONTROL: a day that has counted no pair keeps the shape it always had",
    () => {
      const p = fresh();
      D.bumpUse(p, "c-a", "2026-10-01");
      return eq(Object.keys(p.days["2026-10-01"]).sort().join(","), "c,i,l,m");
    });
  check("desk-stats.js", "814I the statistics answer for a span carries the pairs counted inside it, and an answer without a span carries none",
    () => {
      const p = fresh();
      D.bumpUse(p, "c-a", "2026-10-01"); D.bumpUse(p, "c-b", "2026-10-01");
      D.bumpPair(p, "c-a", "c-b", "2026-10-01");
      const span = { engine: "x", period: { from: "2026-09-01", to: "2026-10-31" } };
      return eq(JSON.stringify(D.statsDoc(p, span).pairs) + "|" + ("pairs" in D.statsDoc(p, { engine: "x" })),
        '[{"from":"c-a","to":"c-b","n":1}]|false');
    });
  check("desk-stats.js", "814q a span's pairs are summed over the days inside it by card id, a day outside is left out, and the most often counted comes first",
    () => {
      const p = fresh();
      D.bumpPair(p, "c-a", "c-b", "2026-09-10"); D.bumpPair(p, "c-a", "c-b", "2026-09-20"); D.bumpPair(p, "c-a", "c-b", "2026-10-20");
      D.bumpPair(p, "c-b", "c-a", "2026-09-15"); D.bumpPair(p, "c-a", "c-c", "2026-09-30");
      D.bumpPair(p, "c-a", "c-b", "2026-08-31"); D.bumpPair(p, "c-c", "c-d", "2026-11-01");
      const doc = D.statsDoc(p, { engine: "x", period: { from: "2026-09-01", to: "2026-10-31" } });
      const octo = D.statsDoc(p, { engine: "x", period: { from: "2026-10-01", to: "2026-10-31" } });
      return eq(doc.pairs.map(o => o.from + ">" + o.to + ":" + o.n).join() + "|" + JSON.stringify(octo.pairs),
        'c-a>c-b:3,c-a>c-c:1,c-b>c-a:1|[{"from":"c-a","to":"c-b","n":1}]');
    });
  check("desk-stats.js", "814r CONTROL: a desk that never counted a pair answers byte for byte as it did, spanned and not, with no pairs key",
    () => {
      const p = fresh();
      D.bumpUse(p, "c-a", "2026-10-01"); D.bumpUse(p, "c-b", "2026-10-01");
      const span = { engine: "x", period: { from: "2026-09-01", to: "2026-10-31" } };
      const was = JSON.stringify({ format: 1, kind: "etiuda-statistics", engine: "x",
        period: { from: "2026-09-01", to: "2026-10-31" }, since: "2026-10-01",
        cards: [{ id: "c-a", n: 1, at: "2026-10-01" }, { id: "c-b", n: 1, at: "2026-10-01" }],
        intents: [], misses: 0, langs: {} });
      const lifetime = JSON.stringify({ format: 1, kind: "etiuda-statistics", engine: "x",
        period: { from: "", to: "" },
        cards: [{ id: "c-a", n: 1, at: "2026-10-01" }, { id: "c-b", n: 1, at: "2026-10-01" }],
        intents: [], misses: 0, langs: {} });
      const withCounts = JSON.parse(JSON.stringify(p));
      withCounts.days["2026-10-01"].p = {};
      return eq(JSON.stringify(D.statsDoc(p, span)) + "|" + JSON.stringify(D.statsDoc(p, { engine: "x" }))
        + "|" + JSON.stringify(D.statsDoc(withCounts, span)), [was, lifetime, was].join("|"));
    });
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
      UILANG_STORE.lsDel("eCollapsed"); C.rereadCollapsed();
      const before = C.isCollapsed("gen");
      C.toggleCollapsed("gen");
      const after = C.isCollapsed("gen");
      C.toggleCollapsed("gen");
      return before === false && after === true && C.isCollapsed("gen") === false
        ? true : before + "/" + after;
    });
  check("collapse.js", "rereadCollapsed reads the folds from storage again: a stored fold stays, one taken out of storage goes",
    () => {
      C.toggleCollapsed("gen"); C.rereadCollapsed();
      const kept = C.isCollapsed("gen");
      UILANG_STORE.lsDel("eCollapsed"); C.rereadCollapsed();
      return eq(kept + "|" + C.isCollapsed("gen"), "true|false");
    });
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
  check("ui-lang.js", "an unknown stored code reads the system's language rather than breaking",
    () => {
      const S = UILANG_STORE; const had = S.lsGet("eUiLang");
      S.lsSet("eUiLang", "qq");
      const got = U.t("Settings");
      if (had == null) S.lsDel("eUiLang"); else S.lsSet("eUiLang", had);
      return eq(got, "Settings");
    });
  /* THE SYSTEM DECIDES WHERE NOTHING IS STORED, first code this build has words for, and a stored
     choice outranks it, English included, which is how English is kept on a Polish Windows. */
  const underSystem = (list, stored, fn) => {
    const S = UILANG_STORE, had = S.lsGet("eUiLang"), was = SYSTEM_LANGS.list;
    SYSTEM_LANGS.list = list;
    if (stored == null) S.lsDel("eUiLang"); else S.lsSet("eUiLang", stored);
    try { return fn(); }
    finally { SYSTEM_LANGS.list = was; if (had == null) S.lsDel("eUiLang"); else S.lsSet("eUiLang", had); }
  };
  check("ui-lang.js", "with nothing stored, a Polish system gets a Polish interface",
    () => underSystem(["pl-PL"], null, () => eq(U.uiLang() + "|" + U.t("Settings"), "pl|Ustawienia")));
  check("ui-lang.js", "the first code the build has words for wins, so German then English reads English",
    () => underSystem(["de-DE", "en-GB", "pl"], null, () => eq(U.uiLang() + "|" + U.t("Settings"), "en|Settings")));
  check("ui-lang.js", "English chosen and stored outranks a Polish system",
    () => underSystem(["pl-PL"], "en", () => eq(U.uiLang() + "|" + U.t("Settings"), "en|Settings")));
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
  /* movedCardIds is asked once per built card, so a call over an order that did not move must
     not read it through, or a whole rebuild is quadratic. Counted by a proxy over pack.cardOrder
     tallying index reads; the two CONTROLS are that a move is still seen, both ways it happens. */
  const PK = await import(MOD("pack.js"));
  const AS = await import(MOD("app-state.js"));
  const ORD = Array.from({ length: 200 }, (_, i) => "c-ord-" + i);
  const withOrder = fn => {
    const hadCards = AS.cards, hadOrder = PK.pack.cardOrder;
    let reads = 0;
    const order = new Proxy(ORD.slice(), { get(t, k, r) {
      if (typeof k === "string" && /^[0-9]+$/.test(k)) reads++;
      return Reflect.get(t, k, r); } });
    try {
      AS.setCards(ORD.map(id => ({ id, c: "gen" })));
      PK.pack.cardOrder = order; O.cardOrderTouched();
      return fn(order, () => reads, () => { reads = 0; });
    } finally { AS.setCards(hadCards); PK.pack.cardOrder = hadOrder; O.cardOrderTouched(); }
  };
  check("card-order.js", "a repeated movedCardIds reads no id of an order that did not move",
    () => withOrder((order, reads, zero) => {
      O.movedCardIds(); zero();
      for (let i = 0; i < 50; i++) O.movedCardIds();
      return eq(reads(), 0);
    }));
  check("card-order.js", "CONTROL: a move in place, announced by cardOrderTouched, is seen",
    () => withOrder(order => {
      const was = O.movedCardIds().size;
      order.splice(150, 0, order.splice(3, 1)[0]); O.cardOrderTouched();
      return eq(was + "|" + [...O.movedCardIds()].join(","), "0|c-ord-3");
    }));
  check("card-order.js", "CONTROL: a new order array is seen without the call",
    () => withOrder(() => {
      O.movedCardIds();
      const next = ORD.slice(); next.push(next.shift());
      PK.pack.cardOrder = next;
      return eq([...O.movedCardIds()].join(","), "c-ord-0");
    }));
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
  /* The control is one existing key pinned byte for byte, nudge included: the six join the
     roster without redrawing what a pack has already chosen. */
  check("icons.js", "parcel, truck, broken, receipt, brush and cup are offered and each draws its own figure",
    () => {
      const six = ["parcel", "truck", "broken", "receipt", "brush", "cup"];
      const bad = six.filter(k => I.CAT_ICON_KEYS.indexOf(k) < 0 || !/^(<g transform="translate\([-\d. ]+\)">)?<path /.test(I.catIconInner(k)));
      if (bad.length) return "not offered or not drawn: " + bad.join(",");
      if (new Set(six.map(I.catIconInner)).size !== 6) return "two keys draw the same figure";
      return eq(I.catIconInner("notehead"), '<g transform="translate(1.44 0.05)"><path d="M12.6 11.85A4.3 3.05 -20 1 0 4.51 14.79A4.3 3.05 -20 1 0 12.6 11.85Z"/><path d="M12.74 3.35V12.61"/></g>');
    });
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
  const AS = await import(MOD("app-state.js"));
  check("card-intent.js", "the Library's count of cards linked to an intent counts each card naming it once, whatever its category",
    () => {
      const had = AS.cards;
      AS.setCards([{ id: "a", c: "x", intents: ["t:one", "t:one", "t:two"] }, { id: "b", intents: ["t:one"] },
        { id: "c", allIntents: 1, intents: [] }]);
      let n;
      try { n = C.intentCardCounts(); } finally { AS.setCards(had); }
      return eq([n.get("t:one"), n.get("t:two"), n.size].join("|"), "2|1|2");
    });
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
  check("catalog.js", "two identical catalogs sign the same, a changed one does not, and a name inside one changes nothing",
    () => {
      const mk = () => ({ kind: "playbook-cards", name: "Shop",
        cards: [{ t: "A title", c: "gen", en: "Text.", pl: "Tekst." }] });
      const b = mk(); b.cards[0].en = "Other text.";
      const named = mk(); named.name = "Other shop";
      if (C.eCatalogSignature(mk()) !== C.eCatalogSignature(named)) return "a name moved the signature";
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
  check("catalog-file.js", "two files sharing an id are the same catalog",
    () => eq(F.isCatalogUpdate({ id: "x" }, { id: "x" }), true));
  check("catalog-file.js", "two different ids are two catalogs",
    () => eq(F.isCatalogUpdate({ id: "x" }, { id: "y" }), false));
  check("catalog-file.js", "with no ids no name decides: two files are never one catalog",
    () => eq(F.isCatalogUpdate({ name: "Lamp Shop" }, { name: "Lamp Shop" }), false));
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
  /* A new catalog's first edition is today, written here from the clock by hand: a second route to
     the same answer. */
  check("catalog-file.js", "a new catalog's first edition is today's date in the one orderable form",
    () => { const d = new Date(), p = v => String(v).padStart(2, "0");
      return eq(F.todayEdition(), d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())); });
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
   The two acts are the module's whole surface: nothing parks across a reload any more, so nothing
   else is exported. What they do is driven in tests/test.js and, in a browser, tests/swap.mjs. */
{
  const L = await import(MOD("local-memory.js"));
  check("local-memory.js", "the module exports the eject and the clear, and nothing else",
    () => eq(Object.keys(L).sort().join(","), "clearLocalMemory,ejectCatalog"));
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

/* ------------------------------------------------------------------ card-model.js, the block
   reorder. The indices a drag hands over count the blocks of the language the card SHOWS, so
   every content language with that many blocks moves with it and one with another count is left
   as written. A third language declared by the catalog is a content language like the other two. */
{
  const M = await import(MOD("card-model.js"));
  const CM = await import(MOD("content-model.js"));
  const AS = await import(MOD("app-state.js"));
  const P = await import(MOD("pack.js"));
  const HK = await import(MOD("hooks.js"));
  const hadLangs = CM.CONTENT_LANGS.slice(), hadLang = AS.lang, hadCards = AS.cards;
  HK.hooks.rebuildCards = () => {};
  CM.setContentLangs(["en", "pl", "de"]);
  const three = (a, b, c) => a + "\n\n" + b + "\n\n" + c;
  const own = extra => Object.assign({ id: "u:reorder", c: "gen", alt: 1, t: "Invented steps",
    en: three("E1", "E2", "E3"), pl: three("P1", "P2", "P3"), "body:de": three("D1", "D2", "D3") }, extra);
  const put = m => {
    P.pack.custom = [Object.assign({}, m)];
    AS.setCards([Object.assign({ _custom: 1 }, m)]);
  };
  const stored = k => P.pack.custom[0][k];
  try {
    check("card-model.js", "a reorder moves the third declared language with the other two",
      () => {
        AS.putLang("en"); put(own());
        M.reorderMacroBlocks("u:reorder", 0, 2);
        return eq([stored("en"), stored("pl"), stored("body:de")].join("|"),
          [three("E2", "E3", "E1"), three("P2", "P3", "P1"), three("D2", "D3", "D1")].join("|"));
      });
    check("card-model.js", "CONTROL: a language with another count of blocks is left as written",
      () => {
        AS.putLang("en"); put(own({ "body:de": "D1\n\nD2" }));
        M.reorderMacroBlocks("u:reorder", 0, 2);
        return eq([stored("en"), stored("body:de")].join("|"), [three("E2", "E3", "E1"), "D1\n\nD2"].join("|"));
      });
    check("card-model.js", "a drag on the Polish screen moves the Polish, and English of another count stays",
      () => {
        AS.putLang("pl"); put(own({ en: "E1\n\nE2" }));
        M.reorderMacroBlocks("u:reorder", 0, 2);
        return eq([stored("pl"), stored("en")].join("|"), [three("P2", "P3", "P1"), "E1\n\nE2"].join("|"));
      });
    check("card-model.js", "a catalog card's reorder stores the third language in its override too",
      () => {
        AS.putLang("en");
        const base = { id: "c-reorder", c: "gen", alt: 1, t: "Invented steps",
          en: three("E1", "E2", "E3"), pl: three("P1", "P2", "P3"), "body:de": three("D1", "D2", "D3") };
        P.BASE_M.push(base); P.pack.custom = [];
        AS.setCards([Object.assign({}, base)]);
        M.reorderMacroBlocks("c-reorder", 2, 0);
        const o = P.pack.overrides["c-reorder"] || {};
        P.BASE_M.splice(P.BASE_M.indexOf(base), 1); delete P.pack.overrides["c-reorder"];
        return eq(Object.keys(o).sort().join(",") + "|" + o["body:de"], "body:de,en,pl|" + three("D3", "D1", "D2"));
      });
  } finally {
    CM.setContentLangs(hadLangs); AS.putLang(hadLang); AS.setCards(hadCards);
    P.pack.custom = []; delete HK.hooks.rebuildCards;
  }
}

/* ------------------------------------------------------------------ the format pass (board 834),
   in card-model.js and macros-json.js: a chain and a seal on a card, carried through the override
   and through the plain export, with a field the build does not name riding along whole. */
{
  const M = await import(MOD("card-model.js"));
  const J = await import(MOD("macros-json.js"));
  const base = () => ({ id: "c-one", c: "gen", t: "One", en: "Body.", next: [{ to: "c-two" }] });
  const onto = extra => M.overrideAgainstBase(base(), Object.assign(base(), extra));
  check("card-model.js", "ticking commits on a card that lacks it is an override of commits alone",
    () => eq(JSON.stringify(M.overrideAgainstBase({ id: "c-one", c: "gen", t: "One", en: "Body." },
      { id: "c-one", c: "gen", t: "One", en: "Body.", commits: 1 })), "{\"commits\":1}"));
  check("card-model.js", "unticking it writes a 0, which is what lets the base's 1 be overridden",
    () => eq(JSON.stringify(M.overrideAgainstBase({ id: "c-one", c: "gen", t: "One", en: "Body.", commits: 1 },
      { id: "c-one", c: "gen", t: "One", en: "Body.", commits: 0 })), "{\"commits\":0}"));
  check("card-model.js", "CONTROL: a save that does not hold commits has not unticked it",
    () => eq(JSON.stringify(M.overrideAgainstBase({ id: "c-one", c: "gen", t: "One", en: "Body.", commits: 1 },
      { id: "c-one", c: "gen", t: "One", en: "Body." })), "{}"));
  check("card-model.js", "a chain that differs from the base's is stored whole, in order",
    () => eq(JSON.stringify(onto({ next: [{ to: "c-three" }, { to: "c-two" }] })),
      "{\"next\":[{\"to\":\"c-three\"},{\"to\":\"c-two\"}]}"));
  check("card-model.js", "the same chain in another order is a difference",
    () => eq(JSON.stringify(M.overrideAgainstBase({ id: "c-one", c: "gen", t: "One", en: "Body.", next: [{ to: "a" }, { to: "b" }] },
      { id: "c-one", c: "gen", t: "One", en: "Body.", next: [{ to: "b" }, { to: "a" }] })),
      "{\"next\":[{\"to\":\"b\"},{\"to\":\"a\"}]}"));
  check("card-model.js", "a chain emptied on purpose is stored as an empty list, which overrides the base's",
    () => eq(JSON.stringify(onto({ next: [] })), "{\"next\":[]}"));
  check("card-model.js", "CONTROL: a chain that differs only in a key a later build adds to an entry is no difference",
    () => eq(JSON.stringify(onto({ next: [{ to: "c-two", label: "later" }] })), "{}"));
  check("card-model.js", "CONTROL: a save that does not hold a chain says nothing about it",
    () => eq(JSON.stringify(M.overrideAgainstBase(base(), { id: "c-one", c: "gen", t: "One", en: "Body." })), "{}"));
  check("card-model.js", "CONTROL: a card with none of the new fields stores what it always stored, one reworded field",
    () => eq(JSON.stringify(M.overrideAgainstBase({ id: "c-one", c: "gen", t: "One", en: "Body." },
      { id: "c-one", c: "gen", t: "One", en: "Reworded." })), "{\"en\":\"Reworded.\"}"));

  const F2 = await import(MOD("card-fields.js"));
  const was = { id: "u:1", c: "gen", t: "Old", k: "old words", commits: 1, retired: 1, next: [{ to: "c-two" }], ext: { src: "x" } };
  check("card-fields.js", "814s a replaced custom entry takes retired and the carried fields from the one it replaces, and not commits or its chain, which the editor writes",
    () => eq(JSON.stringify(F2.carryUnwritten({ id: "u:1", c: "gen", t: "New" }, was)),
      "{\"id\":\"u:1\",\"c\":\"gen\",\"t\":\"New\",\"retired\":1,\"ext\":{\"src\":\"x\"}}"));
  check("card-fields.js", "CONTROL: a text field the save emptied is not brought back, and no entry to replace changes nothing",
    () => eq(JSON.stringify([F2.carryUnwritten({ id: "u:1", c: "gen", t: "New" }, was).k, F2.carryUnwritten({ id: "u:2" }, null)]),
      "[null,{\"id\":\"u:2\"}]"));
  const rich = { id: "c-one", c: "gen", t: "One", en: "Body.", retired: 1, commits: 1,
    next: [{ to: "c-two", label: "later" }], ext: { src: "a note", future: { a: [1] } } };
  const plain = J.cardToExportPlain(rich);
  check("macros-json.js", "a card's export carries retired, commits, its chain and the fields the build does not name",
    () => eq(JSON.stringify([plain.retired, plain.commits, plain.next, plain.ext]),
      JSON.stringify([1, 1, rich.next, rich.ext])));
  check("macros-json.js", "and reads them back, so an import loses none",
    () => {
      const back = J.parseMacrosData({ cards: [plain] })[0];
      return eq(JSON.stringify([back.retired, back.commits, back.next, back.ext]),
        JSON.stringify([1, 1, rich.next, rich.ext]));
    });
  check("macros-json.js", "what is carried is a copy, so a later edit of the export does not reach the card",
    () => { plain.ext.future.a.push(2); plain.next[0].to = "x"; return eq(JSON.stringify([rich.ext.future.a, rich.next[0].to]), "[[1],\"c-two\"]"); });
  check("macros-json.js", "an entry of a chain with no to is not read",
    () => eq(JSON.stringify(J.parseMacrosData({ cards: [Object.assign({}, J.cardToExportPlain({ id: "c-one", c: "gen", t: "One", en: "B." }),
      { next: [{}, { to: "" }, null, { to: "c-two" }] })] })[0].next), "[{\"to\":\"c-two\"}]"));
  check("macros-json.js", "CONTROL: a card with none of them exports and imports none of the keys",
    () => {
      const p = J.cardToExportPlain({ id: "c-one", c: "gen", t: "One", en: "B." });
      const back = J.parseMacrosData({ cards: [p] })[0];
      return eq(["retired", "commits", "next", "ext"].filter(k => k in p || k in back).join(","), "");
    });
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
  /* THE COMMITMENT COPY PASS (board 844, package 21, 32b-B): the toast of a card that commits opens on the word, in
     both languages, and a card that does not keeps the plain line above. */
  const COMMITS_A = Object.assign({}, CARD_A, { commits: 1 });
  const inPolish = fn => {
    const had = UILANG_STORE.lsGet("eUiLang");
    UILANG_STORE.lsSet("eUiLang", "pl");
    try { return fn(); } finally { if (had == null) UILANG_STORE.lsDel("eUiLang"); else UILANG_STORE.lsSet("eUiLang", had); }
  };
  check("list-pointer.js", "844A a card that commits toasts as a commitment, ready to paste",
    () => eq(LP.copiedToastMsg(COMMITS_A, "en", 0, 1), "A commitment, ready to paste: Damaged bag, EN"));
  check("list-pointer.js", "844B and in Polish the participle comes before the noun",
    () => inPolish(() => eq(LP.copiedToastMsg(COMMITS_A, "pl", 1, 3), "Gotowe do wklejenia zobowiązanie: Uszkodzona torba, PL 2/3")));
  check("list-pointer.js", "844C CONTROL: a card that does not commit keeps the plain line in Polish too",
    () => inPolish(() => eq(LP.copiedToastMsg(Object.assign({}, CARD_A, { commits: 0 }), "pl", 0, 1), "Gotowe do wklejenia: Uszkodzona torba, PL")));
  /* A COPY'S COUNT IS NOT A MARKUP CHANGE. ePackEpoch heads every card's pool signature, so a
     count that moved it rebuilt every shown card on the next render; the browser half, cards
     kept across a pick and a copy, is tests/smoke.js's. The CONTROL is that the count still
     lands in the stored pack; flushStats is looked up rather than called, so the leg runs
     against a tree that saves counts through savePack. */
  const P = await import(MOD("pack.js"));
  const ST = await import(MOD("storage.js"));
  check("list-pointer.js", "a copy's count leaves every card's pool signature standing",
    () => { const at = P.ePackEpoch; LP.bumpUseCount("c-counted-copy", "en"); return eq(P.ePackEpoch, at); });
  check("list-pointer.js", "CONTROL: and the count still reaches the stored pack",
    () => {
      if (typeof P.flushStats === "function") P.flushStats();
      let got = null;
      // The counts' own key where the tree keeps them beside the pack, the pack itself where not.
      try { got = JSON.parse(ST.nsGet("Stats") || ST.nsGet("Pack") || "null"); } catch (e) { got = null; }
      return eq(((got && got.useCounts) || {})["c-counted-copy"], 1);
    });
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
  /* The Library's row of a card that commits the firm wears the stamp after its title, and the row of a card
     that does not is what it was: the same row with the stamp cut out is the plain card's, to the byte. */
  const CH = await import(MOD("card-chain.js"));
  const sworn = MG.mgCardRow({ id: "x4", c: "bay", t: "Four", commits: 1 }), plain = MG.mgCardRow({ id: "x4", c: "bay", t: "Four" });
  const stampAt = sworn.indexOf(CH.stampHtml("mg-stamp"));
  check("manage.js", "28a1 the Library's row of a card that commits the firm wears the stamp straight after its title",
    () => eq([stampAt > sworn.indexOf("Four</span>"), sworn.slice(stampAt - 7, stampAt) === "</span>"].join(","), "true,true"));
  check("manage.js", "28a2 control: the row of a card that does not commit has no stamp, and is the stamped row less its stamp",
    () => eq([plain.indexOf("mg-stamp") < 0, sworn.replace(CH.stampHtml("mg-stamp"), "") === plain].join(","), "true,true"));
  /* THE SEAL'S WORDS (board 844, package 21, D1 and D2): a name for a screen reader and a tooltip that says what the
     seal means, the same pair on every card that wears it, in both languages. */
  const sealIn = l => {
    const had = UILANG_STORE.lsGet("eUiLang");
    if (l) UILANG_STORE.lsSet("eUiLang", l); else UILANG_STORE.lsDel("eUiLang");
    try { return CH.stampHtml("mg-stamp"); } finally { if (had == null) UILANG_STORE.lsDel("eUiLang"); else UILANG_STORE.lsSet("eUiLang", had); }
  };
  check("card-chain.js", "844D the seal is named Commitment and its tooltip says what it means, in English and in Polish",
    () => eq([sealIn("en").indexOf('role="img" aria-label="Commitment" title="Commitment: the customer can hold the firm to this."') > -1,
      sealIn("pl").indexOf('role="img" aria-label="Zobowiązanie" title="Zobowiązanie: klient może trzymać firmę za słowo."') > -1].join(","), "true,true"));
}

/* ------------------------------------------------------------------ manage.js, card-body.js
   WORDS THE LANGUAGE SWEEP CANNOT REACH: a sentence with a number in it, and anything in the card
   list, which no sweep covers. Under a stored Polish interface neither may carry the English it
   is built from; the English controls say the check reads the words it means to. */
{
  const MG = await import(MOD("manage.js"));
  const CB = await import(MOD("card-body.js"));
  const inLang = (l, fn) => {
    const S = UILANG_STORE, had = S.lsGet("eUiLang");
    S.lsSet("eUiLang", l);
    try { return fn(); } finally { if (had == null) S.lsDel("eUiLang"); else S.lsSet("eUiLang", had); }
  };
  check("manage.js", "THE CONTROL: on an English interface the copy count reads English, one and several",
    () => inLang("en", () => eq(MG.mgUsesTip(1) + "|" + MG.mgUsesTip(3),
      "Copied 1 time in this browser|Copied 3 times in this browser")));
  check("manage.js", "on a Polish interface the copy count keeps its number, drops the English, and one reads unlike five",
    () => inLang("pl", () => {
      const one = MG.mgUsesTip(1), few = MG.mgUsesTip(3), many = MG.mgUsesTip(5);
      const ok = [one, few, many].every(s => !/Copied|time/.test(s))
        && one.indexOf("1") > -1 && few.indexOf("3") > -1 && many.indexOf("5") > -1
        && one.replace("1", "") !== many.replace("5", "");
      return ok ? true : JSON.stringify([one, few, many]);
    }));
  check("card-body.js", "THE CONTROL: the in-card intent strip reads English on an English interface",
    () => inLang("en", () => {
      const h = CB.swapStripHtml([]);
      return h.indexOf('title="Click to pick') > -1 && h.indexOf("<b>Set {INTENT}</b>") > -1 ? true : h;
    }));
  check("card-body.js", "on a Polish interface neither the strip's tooltip nor its label is the English",
    () => inLang("pl", () => {
      const h = CB.swapStripHtml([]);
      return h.indexOf("Click to pick") < 0 && h.indexOf("Set {INTENT}") < 0 && h.indexOf("{INTENT}") > -1 ? true : h;
    }));

  /* THE REFUSAL'S CAUSE. A desk stores in one file, so a catalog it could not keep is refused by
     naming that file; blaming a browser's storage there points nowhere. Both languages, since the
     wrong cause was in both. */
  const C = await import(MOD("catalog.js"));
  const DESK = "%USERPROFILE%\\AppData\\Roaming\\etiuda\\desk.json";
  check("catalog.js", "THE CONTROL: with no desk file the catalog refusal is the browser's, in English and in Polish",
    () => {
      const en = inLang("en", () => C.catalogStoreRefusal("")), pl = inLang("pl", () => C.catalogStoreRefusal(""));
      return /browser/.test(en) && /przeglądar/.test(pl) ? true : JSON.stringify([en, pl]);
    });
  check("catalog.js", "a desk's catalog refusal names the file it could not write and no browser, in English and in Polish",
    () => {
      const en = inLang("en", () => C.catalogStoreRefusal(DESK)), pl = inLang("pl", () => C.catalogStoreRefusal(DESK));
      return en.indexOf(DESK) > -1 && pl.indexOf(DESK) > -1 && !/browser/i.test(en) && !/przeglądar/i.test(pl)
        && pl !== en ? true : JSON.stringify([en, pl]);
    });
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

  /* A RETIRED CARD IS ASLEEP (C07): in no list, yet alive for everything personal that follows a
     card. The two catalogs differ by the flag alone, so the flag is what each leg holds. */
  const CMD = await import(MOD("card-model.js"));
  const asleepDesk = (flag, fn) => {
    const hadBase = P.BASE_M.slice(), hadCounts = P.pack.useCounts, hadAt = P.pack.useAt, hadRemoved = P.pack.removed;
    P.BASE_M.length = 0;
    P.BASE_M.push({ id: "k1", c: "bay" }, Object.assign({ id: "k2", c: "bay" }, flag ? { retired: 1 } : {}));
    P.pack.useCounts = { k1: 2, k2: 5, departed: 3 }; P.pack.useAt = { k2: "2026-09-01" }; P.pack.removed = [];
    try { return withDesk([{ id: "k1", c: "bay" }], ["k1", "k2", "departed"], fn); }
    finally { P.BASE_M.length = 0; hadBase.forEach(m => P.BASE_M.push(m));
      P.pack.useCounts = hadCounts; P.pack.useAt = hadAt; P.pack.removed = hadRemoved; }
  };
  check("favourites.js", "a retired card keeps its star and its counts while it is in no list, and a departed one loses both",
    () => asleepDesk(true, () => {
      F.syncFavouritesMeta();
      return eq(P.pack.favourites.join(",") + "|" + JSON.stringify(P.pack.useCounts) + "|" + JSON.stringify(P.pack.useAt),
        'k1,k2|{"k1":2,"k2":5}|{"k2":"2026-09-01"}');
    }));
  check("favourites.js", "CONTROL: the same card with no flag is a departed one, and its star and counts go",
    () => asleepDesk(false, () => {
      F.syncFavouritesMeta();
      return eq(P.pack.favourites.join(",") + "|" + JSON.stringify(P.pack.useCounts) + "|" + JSON.stringify(P.pack.useAt),
        'k1|{"k1":2}|{}');
    }));
  check("favourites.js", "and its day counts, which the picker's 28 days are summed from, wait for it too, while a departed card's go",
    () => asleepDesk(true, () => {
      const hadIds = P.pack.dayIds, hadDays = P.pack.days;
      P.pack.dayIds = ["k1", "k2", "departed"]; P.pack.days = { "2026-09-30": { c: { 0: 1, 1: 4, 2: 2 } } };
      try {
        F.syncFavouritesMeta();
        const c = P.pack.days["2026-09-30"].c, of = id => { const at = P.pack.dayIds.indexOf(id); return at < 0 ? "-" : String(c[at]); };
        return eq(["k1", "k2", "departed"].map(of).join(","), "1,4,-");
      } finally { P.pack.dayIds = hadIds; P.pack.days = hadDays; }
    }));
  check("card-model.js", "a retired card is not found by id, so the picker and a recent copy treat it as absent",
    () => asleepDesk(true, () => eq(String(CMD.findCard("k2")) + "|" + (CMD.findCard("k1") || {}).id, "null|k1")));
  check("card-model.js", "CONTROL: the same card with no flag is found where the catalog holds it",
    () => asleepDesk(false, () => eq((CMD.findCard("k2") || {}).id, "k2")));
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

/* ------------------------------------------------------------------ rail-list.js, the echo.
   While a category is selected, every rail draw asks which intents it holds cards for. Asked
   intent by intent, that walked every card once per intent; the draw is to read each card's
   links a number of times that does not grow with the rail. Counted by a getter on each
   invented card's `intents`, over a rail of 5 intents and of 20. The CONTROL is the echo itself:
   the one intent a selected category's card links rises to the top. */
{
  const RL = await import(MOD("rail-list.js"));
  const CAT_REL = await import(MOD("cat-relevance.js"));
  const CM = await import(MOD("content-model.js"));
  const II = await import(MOD("intent-id.js"));
  const AS = await import(MOD("app-state.js"));
  const had = { en: CM.SW_STORE.en.slice(), pl: CM.SW_STORE.pl.slice(), ids: CM.SW_IDS.slice(),
    order: II.intentOrder, cards: AS.cards, cats: AS.cats };
  let reads = 0;
  const card = (id, c, links) => {
    const m = { id, c, t: id, en: "x" };
    Object.defineProperty(m, "intents", { get() { reads++; return links; }, enumerable: true });
    return m;
  };
  const drawn = n => {
    II.setIntentOrder(Array.from({ length: n }, (_, i) => i));
    reads = 0;
    const rows = RL.displayIntentRows();
    return { reads, first: rows[0] && rows[0].idx };
  };
  try {
    CM.SW_STORE.en.length = 0; CM.SW_STORE.pl.length = 0;
    for (let i = 0; i < 20; i++) { CM.SW_STORE.en.push("an invented request " + i); CM.SW_STORE.pl.push("pl " + i); }
    CM.setIntentIds(Array.from({ length: 20 }, (_, i) => "q" + i)); II.snapshotBaseIntents();
    CM.CATS["e-alpha"] = "Alpha"; CM.CATS["e-beta"] = "Beta";
    AS.setCards([card("k1", "e-alpha", ["t:q3"]), card("k2", "e-beta", [5]), card("k3", "e-alpha", []),
      card("k4", "e-beta", ["t:q3"])]);
    AS.setCats(["e-alpha"]);
    check("rail-list.js", "a rail draw reads each card's links as often for 20 intents as for 5",
      () => { const few = drawn(5), many = drawn(20); return eq(many.reads, few.reads); });
    check("rail-list.js", "CONTROL: the intent a selected category's card links rises to the top",
      () => {
        const byId = drawn(20).first;                         // k1 links "t:q3" by id
        AS.setCards([card("k2", "e-beta", [5])]); AS.setCats(["e-beta"]);
        const byPlace = drawn(20).first;                      // k2 links slot 5 by number
        return eq(byId + "|" + byPlace, "3|5");
      });
    check("cat-relevance.js", "CONTROL: the one-pass sets answer what categoriesForIntent answers, intent by intent",
      () => {
        const CR = CAT_REL;
        AS.setCards([card("k1", "e-alpha", ["t:q3"]), card("k2", "e-beta", [5]), card("k3", "e-alpha", []),
          Object.assign(card("k5", "e-alpha", ["t:q7"]), { _hidden: 1 }), Object.assign(card("k6", "e-beta", []), { allIntents: 1 }),
          card("k7", "e-none", ["t:q9"]), card("k8", "", ["t:q9"])]);
        const has = CR.intentCatSets(), bad = [];
        for (let i = 0; i < 20; i++) {
          const want = CR.categoriesForIntent(i);
          ["e-alpha", "e-beta", "e-none", ""].forEach(k => { if (has(i, k) !== (want.indexOf(k) > -1)) bad.push(i + ":" + k); });
        }
        return bad.length ? "disagree at " + bad.join(",") : true;
      });
  } finally {
    CM.SW_STORE.en.length = 0; had.en.forEach(v => CM.SW_STORE.en.push(v));
    CM.SW_STORE.pl.length = 0; had.pl.forEach(v => CM.SW_STORE.pl.push(v));
    CM.setIntentIds(had.ids); II.snapshotBaseIntents(); II.setIntentOrder(had.order);
    delete CM.CATS["e-alpha"]; delete CM.CATS["e-beta"];
    AS.setCards(had.cards); AS.setCats(had.cats);
  }
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

/* ------------------------------------------------------------------ card-carry.js, a desk's
   links at a catalog switch. Leaving a catalog whose requests carry no id, a link is a position,
   and what it meant is the request at that position in the catalog being put down. The module's
   own rule for cards is the oracle: exactly one match by exact wording, or nothing is guessed.
   And the criterion: nothing a person linked is dropped in silence. */
{
  const CC = await import(MOD("card-carry.js"));
  const CM = await import(MOD("content-model.js"));
  const II = await import(MOD("intent-id.js"));
  const P = await import(MOD("pack.js"));
  const ST = await import(MOD("storage.js"));
  const DS = await import(MOD("desk-stats.js"));
  const OLD_EN = ["the first request", "a request reworded later", "a request twice over",
    "the fourth request", "an old pair", "an old pair", "a seventh request"];
  const NEW = [["the new head request", "t-head"], ["the fourth request", "t-fourth"],
    ["the first request", "t-first"], ["a request reworded, now", "t-reworded"],
    ["a request twice over", "t-twice-a"], ["a request twice over", "t-twice-b"],
    ["an old pair", "t-pair"], ["a seventh request", "t-seventh"]];
  const arriving = cards => ({ cards: cards || [], categories: { gen: "General" },
    intents: { en: NEW.map(r => r[0]), pl: NEW.map(r => "pl " + r[0]) },
    intentIds: NEW.map(r => r[1]) });
  const applyOld = ids => {
    CM.SW_STORE.en.length = 0; CM.SW_STORE.pl.length = 0;
    OLD_EN.forEach(v => { CM.SW_STORE.en.push(v); CM.SW_STORE.pl.push("pl " + v); });
    CM.setIntentIds(ids || []); II.snapshotBaseIntents();
  };
  const clear = () => {
    Object.keys(CM.SW_STORE).forEach(k => { CM.SW_STORE[k].length = 0; });
    CM.setIntentIds([]); II.snapshotBaseIntents();
    P.BASE_M.length = 0; P.pack.custom = []; P.pack.overrides = {}; P.pack.favourites = [];
    Object.assign(P.pack, { intentOverrides: {}, intentFavourites: [], intentHidden: [], intentRemoved: [],
      intentCounts: {}, intentCustom: [], dayIds: [], days: {} });
    ST.nsDel("LinksAside"); ST.nsDel("RequestsAside"); ST.nsDel("IntentOrder"); ST.ssDel("eCarriedNow");
  };
  /* The arriving catalog applied, as the reload after a switch would apply it. */
  const applyNew = () => {
    CM.SW_STORE.en.length = 0; CM.SW_STORE.pl.length = 0;
    NEW.forEach(r => { CM.SW_STORE.en.push(r[0]); CM.SW_STORE.pl.push("pl " + r[0]); });
    CM.setIntentIds(NEW.map(r => r[1])); II.snapshotBaseIntents();
  };
  const layer = () => JSON.stringify([P.pack.intentOverrides, P.pack.intentFavourites, P.pack.intentHidden,
    P.pack.intentRemoved, P.pack.intentCounts, P.pack.dayIds, ST.nsGet("IntentOrder")]);
  const reqAside = () => { try { return JSON.parse(ST.nsGet("RequestsAside") || "null"); } catch (e) { return "unreadable"; } };
  const reqAsideAt = at => (Array.isArray(reqAside()) ? reqAside() : []).find(e => e && e.at === at) || {};
  const aside = () => { try { return JSON.parse(ST.nsGet("LinksAside") || "null"); } catch (e) { return "unreadable"; } };
  const asideEn = id => ((aside() || {})[id] || []).map(e => (e.clause || {}).en).join("|");
  const hadLangs = CM.CONTENT_LANGS.slice();
  CM.setContentLangs(["en", "pl"]);
  try {
    check("card-carry.js", "a link to a request the next catalog words the same, once, follows it to its id",
      () => {
        clear(); applyOld();
        P.BASE_M.push({ id: "c-stays", c: "gen", t: "Invented stays", en: "x" });
        P.pack.custom = [{ id: "u:own", c: "gen", t: "Invented own", en: "x", intents: [0, 1, 2, 3, 4] }];
        P.pack.overrides = { "c-stays": { intents: [3] } };
        CC.carryCardLayer(arriving([{ id: "c-stays", c: "gen", t: "Invented stays", en: "x" }]));
        return eq(P.pack.custom[0].intents.join(",") + "|" + P.pack.overrides["c-stays"].intents.join(","),
          "t:t-first,t:t-fourth|t:t-fourth");
      });
    check("card-carry.js", "a link that cannot be matched for certain is kept aside with the words it pointed at",
      () => eq(asideEn("u:own"), "a request reworded later|a request twice over|an old pair"));
    check("card-carry.js", "an edit whose card is gone carries its links into the own card it becomes",
      () => {
        clear(); applyOld();
        P.BASE_M.push({ id: "c-gone", c: "gen", t: "Invented gone", en: "x", intents: [0, 1] });
        P.pack.overrides = { "c-gone": { en: "an edit" } };
        CC.carryCardLayer(arriving());
        const own = P.pack.custom[0] || {};
        return eq((own.intents || []).join(",") + "|" + asideEn(own.id), "t:t-first|a request reworded later");
      });
    check("card-carry.js", "an own card rescued from a card that was retired is not born retired, and keeps its words",
      () => {
        clear(); applyOld();
        P.BASE_M.push({ id: "c-gone", c: "gen", t: "Invented gone", en: "x", retired: 1, commits: 1 });
        P.pack.overrides = { "c-gone": { en: "an edit" } };
        CC.carryCardLayer(arriving());
        const own = P.pack.custom[0] || {};
        return eq([P.pack.custom.length, /^u:/.test(own.id || ""), own.en, "retired" in own, own.commits].join("|"),
          "1|true|an edit|false|1");
      });
    check("card-carry.js", "CONTROL: an edition that keeps the card as retired makes no own card, and the edit, star and count stay where they were",
      () => {
        clear(); applyOld();
        P.BASE_M.push({ id: "c-gone", c: "gen", t: "Invented gone", en: "x", retired: 1 });
        Object.assign(P.pack, { overrides: { "c-gone": { en: "an edit" } }, favourites: ["c-gone"], useCounts: { "c-gone": 5 } });
        const alive = CC.carryCardLayer(arriving([{ id: "c-gone", c: "gen", t: "Invented gone", en: "x", retired: true }]));
        const got = [P.pack.custom.length, JSON.stringify(P.pack.overrides), P.pack.favourites.join(","), P.pack.useCounts["c-gone"],
          alive.has("c-gone")].join("|");
        P.pack.useCounts = {};
        return eq(got, '0|{"c-gone":{"en":"an edit"}}|c-gone|5|true');
      });
    check("card-carry.js", "and the links the edit itself chose are set aside under that own card too",
      () => {
        clear(); applyOld();
        P.BASE_M.push({ id: "c-gone", c: "gen", t: "Invented gone", en: "x", intents: [2] });
        P.pack.overrides = { "c-gone": { en: "an edit", intents: [3, 1] } };
        CC.carryCardLayer(arriving());
        const own = P.pack.custom[0] || {};
        return eq((own.intents || []).join(",") + "|" + asideEn(own.id) + "|" + Object.keys(aside() || {}).length,
          "t:t-fourth|a request reworded later|1");
      });
    /* A card's next links name other cards by id. The own card an edit becomes keeps those that name
       a card the edition or the desk still holds, in their order, and none that name the card it was. */
    const stays = { id: "c-stays", c: "gen", t: "Invented stays", en: "x" };
    const nextOf = o => JSON.stringify(o.next === undefined ? "absent" : o.next);
    check("card-carry.js", "an own card rescued from an edit keeps the links that name a card still alive, in order, and drops the rest",
      () => {
        clear(); applyOld();
        P.BASE_M.push({ id: "c-gone", c: "gen", t: "Invented gone", en: "x" });
        P.pack.custom = [{ id: "u:mine", c: "gen", t: "Invented mine", en: "x" }];
        P.pack.overrides = { "c-gone": { en: "an edit", next: [{ to: "u:mine" }, { to: "c-away" }, { to: "c-stays", cue: "extra" }] } };
        CC.carryCardLayer(arriving([stays]));
        const own = P.pack.custom[1] || {};
        return eq(nextOf(own), '[{"to":"u:mine"},{"to":"c-stays","cue":"extra"}]');
      });
    check("card-carry.js", "and it never links to itself, under its new id or the one it had",
      () => {
        clear(); applyOld();
        P.BASE_M.push({ id: "c-gone", c: "gen", t: "Invented gone", en: "x" });
        P.pack.overrides = { "c-gone": { en: "an edit", next: [{ to: "c-gone" }, { to: "c-stays" }] } };
        CC.carryCardLayer(arriving([stays]));
        const own = P.pack.custom[0] || {};
        const to = (own.next || []).map(e => e.to);
        return eq([/^u:/.test(own.id || ""), to.indexOf(own.id) > -1, to.indexOf("c-gone") > -1, to.join(",")].join("|"),
          "true|false|false|c-stays");
      });
    check("card-carry.js", "an own card whose every link is gone has no next at all, not an empty list",
      () => {
        clear(); applyOld();
        P.BASE_M.push({ id: "c-gone", c: "gen", t: "Invented gone", en: "x" });
        P.pack.overrides = { "c-gone": { en: "an edit", next: [{ to: "c-away" }, { to: "c-also-away" }] } };
        CC.carryCardLayer(arriving([stays]));
        const own = P.pack.custom[0] || {};
        return eq(P.pack.custom.length + "|" + nextOf(own), '1|"absent"');
      });
    check("card-carry.js", "the links the retired card itself held, which the edit did not touch, are kept to the same rule",
      () => {
        clear(); applyOld();
        P.BASE_M.push({ id: "c-gone", c: "gen", t: "Invented gone", en: "x", next: [{ to: "c-away" }, { to: "c-stays" }] });
        P.pack.overrides = { "c-gone": { en: "an edit" } };
        CC.carryCardLayer(arriving([stays]));
        const own = P.pack.custom[0] || {};
        return eq(nextOf(own), '[{"to":"c-stays"}]');
      });
    check("card-carry.js", "CONTROL: an edit that names no links leaves an own card with none",
      () => {
        clear(); applyOld();
        P.BASE_M.push({ id: "c-gone", c: "gen", t: "Invented gone", en: "x" });
        P.pack.overrides = { "c-gone": { en: "an edit" } };
        CC.carryCardLayer(arriving([stays]));
        const own = P.pack.custom[0] || {};
        return eq(P.pack.custom.length + "|" + nextOf(own), '1|"absent"');
      });
    check("card-carry.js", "CONTROL: a card the edition still holds keeps its edit, links to cards the edition lacks included, and no own card is made",
      () => {
        clear(); applyOld();
        P.BASE_M.push(stays);
        const ov = { "c-stays": { en: "an edit", next: [{ to: "c-away" }, { to: "c-stays" }] } };
        P.pack.overrides = JSON.parse(JSON.stringify(ov));
        CC.carryCardLayer(arriving([stays]));
        return eq(P.pack.custom.length + "|" + JSON.stringify(P.pack.overrides), "0|" + JSON.stringify(ov));
      });
    check("card-carry.js", "a request's rewording, star, hide, removal and count follow it to its id where the next catalog words it the same, once",
      () => {
        clear(); applyOld();
        Object.assign(P.pack, { intentOverrides: { "i:0": { en: "an invented rewording" } }, intentFavourites: ["i:0"],
          intentHidden: ["i:3"], intentRemoved: ["i:6"], intentCounts: { "i:0": 5, "i:3": 1 } });
        CC.carryCardLayer(arriving());
        return eq(JSON.stringify([P.pack.intentOverrides, P.pack.intentFavourites, P.pack.intentHidden,
          P.pack.intentRemoved, P.pack.intentCounts]),
          JSON.stringify([{ "t:t-first": { en: "an invented rewording" } }, ["t:t-first"], ["t:t-fourth"],
            ["t:t-seventh"], { "t:t-first": 5, "t:t-fourth": 1 }]));
      });
    check("card-carry.js", "the display order follows each request to its id, not to whatever sits at its old position",
      () => {
        clear(); applyOld();
        P.pack.intentCustom = [{ id: "u:mine", en: "an invented own request" }];
        ST.nsSet("IntentOrder", JSON.stringify(["i:3", "i:0", "u:mine"]));
        CC.carryCardLayer(arriving());
        applyNew();
        return eq(II.loadIntentOrder().map(i => i < II.BASE_N ? CM.SW_STORE.en[i] : "own").join("|"),
          "the fourth request|the first request|own");
      });
    check("card-carry.js", "a request's settings that cannot follow for certain are kept aside with its words, and no position is left for the next catalog to read",
      () => {
        clear(); applyOld();
        Object.assign(P.pack, { intentOverrides: { "i:1": { en: "an invented rewording" } }, intentFavourites: ["i:2"],
          intentHidden: ["i:4"], intentRemoved: ["i:5"], intentCounts: { "i:5": 2 } });
        ST.nsSet("IntentOrder", JSON.stringify(["i:1", "i:0"]));
        CC.carryCardLayer(arriving());
        if (/"i:[0-9]+"/.test(layer())) return "a position survived: " + layer();
        const rec = Array.isArray(reqAside()) ? reqAside() : [];
        const got = rec.slice().sort((a, b) => a.at - b.at).map(e => (e.clause || {}).en + "="
          + Object.keys(e).filter(k => k !== "at" && k !== "clause").sort().join(",")).join("|");
        return eq(got + "|" + JSON.stringify(reqAsideAt(1).intentOverrides) + "|" + (reqAsideAt(1).clause || {}).pl,
          "a request reworded later=intentOverrides,order|a request twice over=intentFavourites|an old pair=intentHidden"
          + '|an old pair=intentCounts,intentRemoved|{"en":"an invented rewording"}|pl a request reworded later');
      });
    check("card-carry.js", "a request's day counts follow it too, and those that cannot are kept aside by day rather than reported under the next catalog",
      () => {
        clear(); applyOld();
        Object.assign(P.pack, { intentCounts: { "i:0": 3, "i:1": 4 }, dayIds: ["c-stays", "i:0", "i:1"],
          days: { "2026-09-01": { c: { 0: 2 }, i: { 1: 3, 2: 4 }, m: 0, l: {} } } });
        CC.carryCardLayer(arriving());
        const doc = DS.statsDoc(P.pack, { period: { from: "2026-09-01", to: "2026-09-01" } });
        return eq(JSON.stringify(doc.intents) + "|" + JSON.stringify(doc.cards) + "|" + JSON.stringify(reqAsideAt(1).days),
          '[{"id":"t:t-first","n":3}]|[{"id":"c-stays","n":2,"at":"2026-09-01"}]|{"2026-09-01":4}');
      });
    check("card-carry.js", "where a request already holds an edit under its id, the one kept by position is set aside, neither written over it nor dropped",
      () => {
        clear(); applyOld();
        P.pack.intentOverrides = { "t:t-first": { en: "under its id" }, "i:0": { en: "by position" } };
        CC.carryCardLayer(arriving());
        return eq(JSON.stringify(P.pack.intentOverrides) + "|" + JSON.stringify(reqAsideAt(0).intentOverrides),
          '{"t:t-first":{"en":"under its id"}}|{"en":"by position"}');
      });
    check("card-carry.js", "CONTROL: leaving a catalog with ids, the requests' own layer is left as it was and nothing is set aside",
      () => {
        clear(); applyOld(["t-a", "t-b", "t-c", "t-d", "t-e", "t-f", "t-g"]);
        Object.assign(P.pack, { intentOverrides: { "t:t-b": { en: "an invented rewording" } }, intentFavourites: ["t:t-a"],
          intentHidden: ["t:t-e"], intentCounts: { "t:t-a": 2 }, dayIds: ["t:t-a"], days: { "2026-09-01": { c: {}, i: { 0: 2 }, m: 0, l: {} } } });
        ST.nsSet("IntentOrder", JSON.stringify(["t:t-d", "t:t-a"]));
        const was = layer();
        CC.carryCardLayer(arriving());
        return eq(layer() + "|" + JSON.stringify(reqAside()), was + "|null");
      });
    check("card-carry.js", "CONTROL: with no catalog under the desk, an own request's star and place stay as they were",
      () => {
        clear();
        P.pack.intentCustom = [{ id: "u:mine", en: "an invented own request" }];
        P.pack.intentFavourites = ["u:mine"];
        ST.nsSet("IntentOrder", JSON.stringify(["u:mine"]));
        CC.carryCardLayer(arriving());
        return eq(JSON.stringify(P.pack.intentFavourites) + "|" + ST.nsGet("IntentOrder") + "|" + JSON.stringify(reqAside()),
          '["u:mine"]|["u:mine"]|null');
      });
    check("card-carry.js", "CONTROL: leaving a catalog with ids pins every link by id and sets nothing aside",
      () => {
        clear(); applyOld(["t-a", "t-b", "t-c", "t-d", "t-e", "t-f"]);
        P.pack.custom = [{ id: "u:own", c: "gen", t: "Invented own", en: "x", intents: [0, 1, 4] }];
        CC.carryCardLayer(arriving());
        return eq(P.pack.custom[0].intents.join(",") + "|" + JSON.stringify(aside()), "t:t-a,t:t-b,t:t-e|null");
      });
    check("card-carry.js", "CONTROL: with no catalog under the desk a link to an own request stays as it was",
      () => {
        clear();
        P.pack.custom = [{ id: "u:own", c: "gen", t: "Invented own", en: "x", intents: ["u:my-request"] }];
        CC.carryCardLayer(arriving());
        return eq(P.pack.custom[0].intents.join(",") + "|" + JSON.stringify(aside()), "u:my-request|null");
      });
  } finally {
    clear(); CM.setContentLangs(hadLangs);
  }

  /* THE BOOT HALF (sense pass 3, item 6): a build carrying the next edition of its own catalog puts
     nothing down, so the card an edit was written against is gone before the boot sees the edit.
     The module's own contract is the oracle, stated at its head: "an edit whose card is gone becomes
     an own card". The desk's own save is what saw the card, so each leg saves before the edition
     moves; the toast is a timer, held here rather than run, since this file has no document. */
  const STK = await import(MOD("stock.js"));
  const EDITION_1 = [{ id: "c-kept", c: "gen", t: "Invented kept", en: "kept" },
    { id: "c-retired", c: "gen", t: "Invented retired", en: "the catalog's words", pl: "po polsku" }];
  const edition = cards => {
    STK.M.length = 0; cards.forEach(m => STK.M.push(Object.assign({}, m)));
    P.pack.baseCards = null; P.rebuildBaseCards();
  };
  const boot = cards => {
    edition(cards);
    const realTimer = globalThis.setTimeout, held = [];
    globalThis.setTimeout = fn => { held.push(fn); return 0; };
    try { CC.carryAtBoot(); } finally { globalThis.setTimeout = realTimer; }
    return held.length;
  };
  const deskEdits = () => {
    clear(); edition(EDITION_1);
    P.pack.overrides = { "c-retired": { en: "the desk's rewrite" }, "c-kept": { en: "kept, edited" } };
    P.pack.favourites = ["c-retired"];
    P.savePack();
  };
  try {
    check("card-carry.js", "the next edition of a build that retires an edited card keeps the edit as an own card, with the star, and says so",
      () => {
        deskEdits();
        const told = boot([EDITION_1[0]]);
        const own = (P.pack.custom || [])[0] || {};
        return eq([Object.keys(P.pack.overrides).join(","), own.en, own.pl, own.c,
          JSON.stringify(P.pack.favourites) === JSON.stringify([own.id]), told].join("|"),
          "c-kept|the desk's rewrite|po polsku|gen|true|1");
      });
    check("card-carry.js", "CONTROL: an edition that keeps the card keeps the edit as an edit",
      () => {
        deskEdits();
        const told = boot(EDITION_1);
        return eq(Object.keys(P.pack.overrides).sort().join(",") + "|" + (P.pack.custom || []).length + "|" + told,
          "c-kept,c-retired|0|0");
      });
    check("card-carry.js", "CONTROL: with no catalog under the desk (an Eject), an edit waits as an edit for its catalog to come back",
      () => {
        deskEdits();
        const told = boot([]);
        return eq(Object.keys(P.pack.overrides).sort().join(",") + "|" + (P.pack.custom || []).length + "|" + told,
          "c-kept,c-retired|0|0");
      });
    check("card-carry.js", "an edit rescued at boot keeps only the links that name a card still alive",
      () => {
        clear(); edition(EDITION_1);
        P.pack.overrides = { "c-retired": { en: "the desk's rewrite", next: [{ to: "c-kept" }, { to: "c-retired" }, { to: "c-vanished" }] } };
        P.savePack();
        boot([EDITION_1[0]]);
        const own = (P.pack.custom || [])[0] || {};
        return eq(JSON.stringify(own.next) + "|" + (own.next || []).some(e => e.to === own.id), '[{"to":"c-kept"}]|false');
      });
    /* The desk's own save keeps whole base cards (pack.js keepEditBases), so a flag the edition set
       rides into storage, and the edition after that drops the card and rescues from that copy. */
    check("card-carry.js", "an edit rescued at boot from the stored copy of a card that slept is an own card that is awake",
      () => {
        clear(); edition([EDITION_1[0], Object.assign({}, EDITION_1[1], { retired: 1 })]);
        P.pack.overrides = { "c-retired": { en: "the desk's rewrite" } };
        P.savePack();
        const stored = P.pack.editBases["c-retired"] || {};
        boot([EDITION_1[0]]);
        const own = (P.pack.custom || [])[0] || {};
        return eq([stored.retired, P.pack.custom.length, own.en, own.pl, "retired" in own].join("|"),
          "1|1|the desk's rewrite|po polsku|false");
      });
    /* The edition a build brings settles the desk's edits as one put down at a load does (settleEdits): a
       field it now holds as the agent wrote it is dropped, and an own card whose id it now holds becomes it. */
    check("card-carry.js", "the next edition of a build that holds an edit word for word drops it, and keeps a field the lead wrote otherwise",
      () => {
        clear(); P.pack.editBases = {}; edition(EDITION_1);
        P.pack.overrides = { "c-kept": { en: "kept, edited", t: "My title" } };
        P.savePack();
        boot([Object.assign({}, EDITION_1[0], { en: "kept, edited", t: "The lead's title" }), EDITION_1[1]]);
        return eq(JSON.stringify(P.pack.overrides), '{"c-kept":{"t":"My title"}}');
      });
    check("card-carry.js", "the next edition of a build that holds an own card's id makes it that card, listed once, with its star and what still differs",
      () => {
        clear(); P.pack.editBases = {}; edition(EDITION_1);
        P.pack.custom = [{ id: "c-grown", c: "gen", t: "Invented grown", en: "the desk's words" }];
        P.pack.favourites = ["c-grown"];
        P.savePack();
        boot(EDITION_1.concat([{ id: "c-grown", c: "gen", t: "Invented grown", en: "the team's words" }]));
        return eq([P.pack.custom.filter(m => m.id === "c-grown").length, P.BASE_M.filter(m => m.id === "c-grown").length,
          JSON.stringify(P.pack.overrides["c-grown"] || null), P.pack.favourites.join(",")].join("|"),
          "0|1|{\"en\":\"the desk's words\"}|c-grown");
      });
    check("card-carry.js", "CONTROL: a boot whose build brings the edition the desk already holds changes nothing in its layer",
      () => {
        clear(); P.pack.editBases = {}; edition(EDITION_1);
        P.pack.overrides = { "c-kept": { en: "kept, edited" } };
        P.pack.custom = [{ id: "u:own", c: "gen", t: "Invented own", en: "mine" }];
        P.pack.favourites = ["c-retired", "u:own"];
        P.savePack();
        const was = JSON.stringify(P.pack);
        const told = boot(EDITION_1);
        return eq((JSON.stringify(P.pack) === was) + "|" + told, "true|0");
      });
    check("card-carry.js", "814t the next edition keeps the agent's list and the catalog's ids it replaced, an empty list of them included",
      () => {
        clear(); P.pack.editBases = {}; edition(EDITION_1);
        P.pack.overrides = { "c-kept": { next: [{ to: "c-retired" }], nextWas: [] } };
        P.savePack();
        boot([Object.assign({}, EDITION_1[0], { en: "the lead's new words" }), EDITION_1[1]]);
        return eq(JSON.stringify(P.pack.overrides["c-kept"] || null), '{"next":[{"to":"c-retired"}],"nextWas":[]}');
      });
    check("card-carry.js", "814u an edit rescued as an own card keeps its list and drops the catalog's ids it replaced",
      () => {
        clear(); edition(EDITION_1);
        P.pack.overrides = { "c-retired": { en: "the desk's rewrite", next: [{ to: "c-kept" }], nextWas: ["c-kept", "c-gone"] } };
        P.savePack();
        boot([EDITION_1[0]]);
        const own = (P.pack.custom || [])[0] || {};
        return eq(JSON.stringify(own.next) + "|" + ("nextWas" in own), '[{"to":"c-kept"}]|false');
      });
  } finally {
    clear(); STK.M.length = 0; P.pack.baseCards = null; P.rebuildBaseCards();
  }
}

/* ------------------------------------------------------------------ tabs.js, what is active, said
   "Every tab save compares them with what was last said and, once the keys rest, speaks the
   difference": so a change reaches #eSay through scheduleTabSave, a change undone before the keys
   rest says nothing, a field a toast has said is not said again, and the same words twice are
   emptied first. The region is the one element faked here, recording every write; the timers are
   real, so each case waits out the rest. Category "gen" is content-model's own built-in. */
{
  const T = await import(MOD("tabs.js"));
  const A = await import(MOD("app-state.js"));
  const CM = await import(MOD("content-model.js"));
  const writes = [];
  const say = { _t: "", get textContent() { return this._t; }, set textContent(v) { this._t = v; writes.push(v); } };
  const hadDoc = globalThis.document;
  globalThis.document = { getElementById: id => (id === "eSay" ? say : null), querySelector: () => null, querySelectorAll: () => [] };
  const wasLangs = CM.CONTENT_LANGS.slice(), wasLang = A.lang, wasCats = A.cats.slice(), wasIdxs = A.intentIdxs.slice();
  const rest = () => new Promise(r => setTimeout(r, 320));
  const run = async (from, change) => {
    A.putLang(from.lang || "en"); A.setCats(from.cats || []); A.setIntentIdxs([]);
    say._t = from.said || ""; writes.length = 0;
    T.activeHeard();
    await change();
    await rest();
    return writes.join("|");
  };
  try {
    CM.setContentLangs(["en", "pl"]);
    const r1 = await run({}, () => { A.setCats(["gen"]); T.scheduleTabSave(); });
    check("tabs.js", "a category chosen after the last thing said is said by its name once the keys rest",
      () => eq(r1, "General"));
    const r2 = await run({}, () => { A.putLang("pl"); T.scheduleTabSave(); });
    check("tabs.js", "a language changed is said in the pair's own words",
      () => eq(r2, "Polish cards"));
    const r3 = await run({}, () => { A.setCats(["gen"]); T.scheduleTabSave(); A.setCats([]); T.scheduleTabSave(); });
    check("tabs.js", "a change undone before the keys rest says nothing",
      () => eq(r3, ""));
    const r4 = await run({}, () => { A.setCats(["gen"]); T.scheduleTabSave(); T.activeHeard("cats"); });
    check("tabs.js", "a change a toast has already said is not said again",
      () => eq(r4, ""));
    const r5 = await run({ cats: [], said: "General" }, () => { A.setCats(["gen"]); T.scheduleTabSave(); });
    check("tabs.js", "the same words as the region holds are emptied first, so they are spoken again",
      () => eq(r5, "|General"));
    A.putLang("pl"); A.setCats([]); A.setIntentIdxs([]);
    T.tabs.push({ id: "mc-b", pax: "Anna Nowak" });
    const was = { tab: "mc-a", lang: "en", intents: "", cats: "" }, now = { tab: "mc-b", lang: "pl", intents: "", cats: "" };
    check("tabs.js", "a tab switched to is said whole: the first name, then the language",
      () => eq(T.activeWords(was, now), "Anna. Polish cards"));
    check("tabs.js", "intents gone on the same tab are said as cleared",
      () => eq(T.activeWords({ tab: "x", lang: "pl", intents: "t:1", cats: "" }, { tab: "x", lang: "pl", intents: "", cats: "" }), "{INTENT} cleared"));
  } finally {
    T.tabs.splice(0, T.tabs.length);
    CM.setContentLangs(wasLangs); A.putLang(wasLang); A.setCats(wasCats); A.setIntentIdxs(wasIdxs);
    await rest();
    if (hadDoc === undefined) delete globalThis.document; else globalThis.document = hadDoc;
  }
}

/* ------------------------------------------------------------------ #eSay, one writer
   The polite region has four ways in: the mark (sayMark), what is active and the lanes (sayLive), the edition's
   (editionSay) and the card editor's margin (marginSay). The last two are sayLive's idiom, so words said by two of
   them close together are heard in the order they were said, and the same words twice are emptied between. The region
   is the one element faked here, recording every write; the timers are real. */
{
  const EM = await import(MOD("edition-marks.js"));
  const MG = await import(MOD("card-margin.js"));
  const writes = [];
  const say = { _t: "", get textContent() { return this._t; }, set textContent(v) { this._t = v; writes.push(v); } };
  const hadDoc = globalThis.document;
  globalThis.document = { getElementById: id => (id === "eSay" ? say : null), querySelector: () => null, querySelectorAll: () => [] };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const run = async go => { say._t = ""; writes.length = 0; await go(); await wait(160); return writes.slice(); };
  try {
    const first = await run(async () => { EM.editionSay("Edition 3 is waiting."); await wait(10); MG.marginSay("Finding 1 of 2."); });
    check("card-margin.js", "1007es1 words said by the edition and then by the margin close together end as the margin's, the words said last",
      () => eq(say._t === "Finding 1 of 2." && first[first.length - 1] === "Finding 1 of 2.", true));
    const back = await run(async () => { MG.marginSay("Finding 1 of 2."); await wait(10); EM.editionSay("Edition 3 is waiting."); });
    check("card-margin.js", "1007es1b the reverse order: words said by the margin and then by the edition end as the edition's, so either writer reverted alone goes red",
      () => eq(say._t === "Edition 3 is waiting." && back[back.length - 1] === "Edition 3 is waiting.", true));
    const same = await run(async () => { EM.editionSay("Finding 1 of 2."); await wait(10); MG.marginSay("Finding 1 of 2."); });
    check("card-margin.js", "1007es2 the same words said by both close together are emptied between, so the region speaks them twice",
      () => eq(JSON.stringify(same) + "|" + say._t, JSON.stringify(["Finding 1 of 2.", "", "Finding 1 of 2."]) + "|Finding 1 of 2."));
    const once = await run(async () => { MG.marginSay("Finding 1 of 2."); });
    check("card-margin.js", "1007es3 control: words said once are written once",
      () => eq(once.filter(w => w === "Finding 1 of 2.").length + "|" + say._t, "1|Finding 1 of 2."));
  } finally {
    if (hadDoc === undefined) delete globalThis.document; else globalThis.document = hadDoc;
  }
}

/* ------------------------------------------------------------------ tabs.js, the path of a conversation
   Board 814: each conversation tab keeps the replies sent in it (ruled 2026-10-01 10:34), and a
   card copied straight after another in the same tab is what the desk learns from. The tabs are
   drawn for real against a document that holds nothing and hooks that do nothing, so applyTab's
   own route sets the tab in front; every hook and global set here is put back. */
{
  const T = await import(MOD("tabs.js"));
  const H = await import(MOD("hooks.js"));
  const LP = await import(MOD("list-pointer.js"));
  const P = await import(MOD("pack.js"));
  const D = await import(MOD("desk-stats.js"));
  const ST = await import(MOD("storage.js"));
  const hadDoc = globalThis.document, hadAdd = globalThis.addEventListener;
  const STUBS = ["applyLangUI", "updateIntentPlaceholder", "drawPillsCore", "drawIntentRail", "render", "scheduleRailGeometry"];
  const hadHooks = STUBS.map(k => [k, Object.prototype.hasOwnProperty.call(H.hooks, k), H.hooks[k]]);
  const quiet = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
  globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    body: { classList: quiet }, documentElement: { style: { setProperty() {} }, classList: quiet } };
  if (typeof globalThis.addEventListener !== "function") globalThis.addEventListener = () => {};
  STUBS.forEach(k => { if (typeof H.hooks[k] !== "function") H.hooks[k] = () => {}; });
  const step = id => (typeof T.tabPathStep === "function" ? T.tabPathStep(id) : "no tabPathStep");
  try {
    ST.ssSet(T.TAB_KEY, JSON.stringify({ v: 1, activeTabId: "mc-p1",
      tabs: [{ id: "mc-p1", path: ["c-a", 5, "", null, "c-b"] }, { id: "mc-p2", path: "c-a" }] }));
    T.initTabs();
    check("tabs.js", "814m a restored session keeps each tab's path, and drops what cannot be a card's id",
      () => eq(T.tabs.map(t => (Array.isArray(t.path) ? t.path.join(",") : "none")).join("|"), "c-a,c-b|"));
    T.tabs.splice(0, T.tabs.length);
    ST.ssSet(T.TAB_KEY, "null");
    T.initTabs();
    const one = [step("c-a"), step("c-b"), step("c-b"), step("c-c")];
    check("tabs.js", "814j in the tab in front, the first copy follows nothing, the next names the one before, and a card copied again straight after itself is the same step",
      () => eq(JSON.stringify(one) + "|" + (T.tabs[0].path || []).join(","), "[null,\"c-a\",null,\"c-b\"]|c-a,c-b,c-c"));
    T.tabs.push({ id: "mc-p2", pax: "" });
    T.stepTab(1);
    const two = [step("c-x"), step("c-y")];
    T.stepTab(1);
    const back = step("c-d");
    check("tabs.js", "814k each tab keeps its own path: another conversation's first copy follows nothing, and coming back the first goes on from its own last",
      () => eq(JSON.stringify(two) + "|" + back + "|" + T.tabs.map(t => (t.path || []).join(",")).join("|"),
        "[null,\"c-x\"]|c-c|c-a,c-b,c-c,c-d|c-x,c-y"));
    T.tabs.splice(0, T.tabs.length);
    ST.ssSet(T.TAB_KEY, "null");
    T.initTabs();
    LP.bumpUseCount("c-mc-from", "en"); LP.bumpUseCount("c-mc-to", "en"); LP.bumpUseCount("c-mc-to", "pl");
    check("list-pointer.js", "814l the desk's copy route learns it: a reply copied after another in one tab is counted once, whatever the language",
      () => eq(typeof D.statsLearntAfter === "function"
        ? D.statsLearntAfter(P.pack, "c-mc-from").map(o => o.id + ":" + o.n).join(",") : "no statsLearntAfter", "c-mc-to:1"));
    T.tabs.splice(0, T.tabs.length);
    const was = (P.pack.useCounts || {})["c-mc-lone"] | 0;
    LP.bumpUseCount("c-mc-lone", "en"); LP.bumpUseCount("c-mc-after", "en");
    check("list-pointer.js", "814N CONTROL: with no tab in front a copy still counts, and follows nothing",
      () => eq([(P.pack.useCounts["c-mc-lone"] | 0) - was,
        typeof D.statsLearntAfter === "function" ? D.statsLearntAfter(P.pack, "c-mc-lone").length : 0].join(","), "1,0"));
    T.tabs.splice(0, T.tabs.length);
    ST.ssSet(T.TAB_KEY, "null");
    T.initTabs();
    const many = Array.from({ length: 45 }, (_, i) => "c-q" + i);
    many.slice(0, 41).forEach(id => step(id));
    const walked = (T.tabs[0].path || []).slice();
    T.tabs.splice(0, T.tabs.length);
    ST.ssSet(T.TAB_KEY, JSON.stringify({ v: 1, activeTabId: "mc-p1", tabs: [{ id: "mc-p1", path: many }] }));
    T.initTabs();
    const restored = ((T.tabs[0] && T.tabs[0].path) || []).slice();
    const ends = a => [a.length, a[0], a[a.length - 1]].join(",");
    check("tabs.js", "814p a path keeps its last 40 steps: 41 cards copied in one tab keep the 2nd to the 41st, and a restored 45 the 6th to the 45th",
      () => eq(ends(walked) + "|" + ends(restored), "40,c-q1,c-q40|40,c-q5,c-q44"));
  } finally {
    T.tabs.splice(0, T.tabs.length);
    hadHooks.forEach(([k, own, v]) => { if (own) H.hooks[k] = v; else delete H.hooks[k]; });
    if (hadAdd === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = hadAdd;
    if (hadDoc === undefined) delete globalThis.document; else globalThis.document = hadDoc;
  }
}

/* ------------------------------------------------------------------ card-chain.js, the editor's chain
   Board 814, S4b: the agent's own Next list replaces the catalog's whole, remembers the catalog's ids
   it replaced so the desk can say when the lead has changed them, and travels in an export without
   that memory; the stamp is a flag the desk sets or clears either way. Every card here is invented. */
{
  const CH = await import(MOD("card-chain.js"));
  const M = await import(MOD("card-model.js"));
  const J = await import(MOD("macros-json.js"));
  const AS = await import(MOD("app-state.js"));
  const CM = await import(MOD("content-model.js"));
  const P = await import(MOD("pack.js"));
  const HK = await import(MOD("hooks.js"));
  const UL = await import(MOD("ui-lang.js"));
  const fs = await import("node:fs");
  const NL = String.fromCharCode(10);
  const ids = l => (l || []).map(e => e.to).join(",");
  const LIVE = new Set(["c-a", "c-b", "c-c", "c-self"]);
  const to = (...xs) => xs.map(x => ({ to: x }));
  const base = (next, extra) => Object.assign({ id: "c-self", c: "gen", t: "Invented", en: "Body." }, next ? { next: next } : {}, extra || {});

  check("card-model.js", "814v the stamp is on for a catalog's true and an override's 1, and off for 0, absent, or no card",
    () => eq([{ commits: true }, { commits: 1 }, { commits: 0 }, {}, null].map(M.cardCommits).join(","), "true,true,false,false,false"));
  check("card-chain.js", "814w a list offers live cards only, never the card itself, never one twice, and keeps each entry whole",
    () => eq(JSON.stringify(CH.nextLive([{ to: "c-a", n: 2 }, { to: "c-gone" }, { to: "c-self" }, { to: "c-a" }, null, { to: 5 }, { to: "c-b" }], "c-self", LIVE)),
      '[{"to":"c-a","n":2},{"to":"c-b"}]'));
  check("card-chain.js", "814x the list is the catalog's while its ids are the catalog's live ones, a dead link in the catalog's set aside",
    () => {
      const b = base(to("c-a", "c-gone", "c-b"));
      const st = CH.nextFoldState(Object.assign({}, b), b, null, LIVE);
      return eq([st.own, st.changed, ids(st.rows), ids(st.catalog)].join("|"), "false|false|c-a,c-b|c-a,c-b");
    });
  check("card-chain.js", "814y the agent's list is theirs, and the catalog's has changed once its ids differ from the ones it replaced",
    () => {
      const b = base(to("c-a", "c-b"));
      const ov = { next: to("c-c"), nextWas: ["c-a"] }, same = { next: to("c-c"), nextWas: ["c-a", "c-b"] };
      const st = CH.nextFoldState(Object.assign({}, b, ov), b, ov, LIVE);
      const st2 = CH.nextFoldState(Object.assign({}, b, same), b, same, LIVE);
      return eq([st.own, st.changed, ids(st.rows), st2.own, st2.changed].join("|"), "true|true|c-c|true|false");
    });
  check("card-chain.js", "814z CONTROL: an own card has no catalog's list, so it is neither the catalog's nor changed",
    () => {
      const st = CH.nextFoldState({ id: "u:mine", next: to("c-a") }, null, null, LIVE);
      return eq([st.catalog, st.own, st.changed, ids(st.rows)].join("|"), "|false|false|c-a");
    });
  check("card-chain.js", "814A a save of the catalog's list says nothing about it, so the override drops a list replaced before",
    () => {
      const b = base(to("c-a", "c-b"));
      const f = CH.nextSaveFields(to("c-a", "c-b"), to("c-a", "c-b"), b, { next: to("c-c"), nextWas: ["c-a", "c-b"] }, true);
      const o = M.overrideAgainstBase(b, Object.assign({}, b, { en: "Reworded." }, f));
      return eq(JSON.stringify(f) + "|" + JSON.stringify(o), '{}|{"en":"Reworded."}');
    });
  check("card-chain.js", "814B a changed list is saved whole with the catalog's ids it replaced, and an untouched one keeps the ids it replaced before",
    () => {
      const b = base(to("c-a", "c-b"));
      const ov = { next: to("c-c"), nextWas: ["c-a"] };
      const touched = CH.nextSaveFields(to("c-b", "c-a"), to("c-a", "c-b"), b, ov, true);
      const kept = CH.nextSaveFields(to("c-c"), to("c-a", "c-b"), b, ov, false);
      return eq(JSON.stringify(touched) + "|" + JSON.stringify(kept),
        '{"next":[{"to":"c-b"},{"to":"c-a"}],"nextWas":["c-a","c-b"]}|{"next":[{"to":"c-c"}],"nextWas":["c-a"]}');
    });
  check("card-chain.js", "814C a list emptied on purpose is the agent's too, and an own card's list is handed on whole",
    () => eq(JSON.stringify(CH.nextSaveFields([], to("c-a"), base(to("c-a")), null, true)) + "|"
      + JSON.stringify(CH.nextSaveFields(to("c-b"), null, null, null, false)), '{"next":[],"nextWas":["c-a"]}|{"next":[{"to":"c-b"}]}'));
  {
    const hadCards = AS.cards;
    try {
      check("card-chain.js", "814R a save that never touched the fold hands the stored list on whole, a removed or retired card's link kept, and a catalog card without its own list says nothing",
        () => {
          AS.setCards([{ id: "c-a" }, { id: "c-b" }, { id: "c-self" }, { id: "u:1" }]);
          const b = base(to("c-a"));
          const save = (card, bs, ov) => JSON.stringify(CH.nextReplies(card, bs, ov).fields());
          const ovB = { next: to("c-b", "c-retired"), nextWas: ["c-a"] }, ovC = { next: to("c-a", "c-retired"), nextWas: ["c-a"] };
          return eq([save({ id: "u:1", next: to("c-a", "c-removed") }, null, null),
            save(Object.assign({}, b, ovB), b, ovB), save(Object.assign({}, b, ovC), b, ovC), save(Object.assign({}, b), b, null)].join("|"),
            '{"next":[{"to":"c-a"},{"to":"c-removed"}]}|{"next":[{"to":"c-b"},{"to":"c-retired"}],"nextWas":["c-a"]}|'
            + '{"next":[{"to":"c-a"},{"to":"c-retired"}],"nextWas":["c-a"]}|{}');
        });
    } finally { AS.setCards(hadCards); }
  }
  check("card-model.js", "814D the catalog's ids ride the override only beside a list it writes",
    () => {
      const b = base(to("c-a"));
      const w = M.overrideAgainstBase(b, Object.assign({}, b, { next: to("c-b"), nextWas: ["c-a"] }));
      const n = M.overrideAgainstBase(b, Object.assign({}, b, { next: to("c-a"), nextWas: ["c-a"] }));
      return eq(JSON.stringify(w) + "|" + JSON.stringify(n), '{"next":[{"to":"c-b"}],"nextWas":["c-a"]}|{}');
    });
  {
    const hadCards = AS.cards, hadLang = AS.lang;
    HK.hooks.rebuildCards = () => {};
    const b = { id: "c-chain", c: "gen", alt: 1, t: "Invented", en: ["E1", "E2"].join(NL + NL), pl: ["P1", "P2"].join(NL + NL), next: to("c-a") };
    try {
      check("card-model.js", "814E a block reorder on a card with its own list keeps the list and the catalog's ids it replaced",
        () => {
          AS.putLang("en"); P.BASE_M.push(b); P.pack.custom = [];
          P.pack.overrides["c-chain"] = { next: to("c-b"), nextWas: ["c-a"] };
          AS.setCards([Object.assign({}, b, P.pack.overrides["c-chain"])]);
          M.reorderMacroBlocks("c-chain", 0, 1);
          const o = P.pack.overrides["c-chain"] || {};
          return eq(JSON.stringify([o.next, o.nextWas]) + "|" + String(o.en).split(NL).join("/"), '[[{"to":"c-b"}],["c-a"]]|E2//E1');
        });
    } finally {
      const at = P.BASE_M.indexOf(b); if (at > -1) P.BASE_M.splice(at, 1);
      delete P.pack.overrides["c-chain"]; AS.setCards(hadCards); AS.putLang(hadLang); delete HK.hooks.rebuildCards;
    }
  }
  check("macros-json.js", "814F CONTROL: the catalog's ids a list replaced never leave the desk: a card holding them exports byte for byte as one without",
    () => {
      const card = base(to("c-a"), { commits: 1 });
      return eq(JSON.stringify(J.cardToExportPlain(Object.assign({}, card, { nextWas: ["c-b"] }))) === JSON.stringify(J.cardToExportPlain(card)), true);
    });
  {
    const hadCards = AS.cards, hadLangs = CM.CONTENT_LANGS.slice();
    const zolw = String.fromCharCode(0x17b, 0xf3, 0x142) + "w";
    CM.setContentLangs(["en", "pl"]);
    AS.setCards([
      { id: "c-self", c: "gen", t: "Firing self" },
      { id: "c-4", c: "gen", t: "Refiring a glaze" },
      { id: "c-1", c: "gen", t: "Order, pieces from one firing" },
      { id: "c-2", c: "gen", t: "Firing dates" },
      { id: "c-3", c: "gen", t: "Damaged, waiting for the next firing" },
      { id: "c-5", c: "gen", t: "Nothing alike", tPl: zolw },
      { id: "c-6", c: "gen", t: "Taken firing" }]);
    try {
      check("card-chain.js", "814G a find puts a title's start first, a word's start next, anywhere last, and offers neither the card itself nor one listed",
        () => eq(CH.nextHits("FIR", "c-self", new Set(["c-6"])).map(m => m.id).join(","), "c-2,c-1,c-3,c-4"));
      check("card-chain.js", "814J a find reads every language's title, folded as search folds it",
        () => eq(CH.nextHits("zolw", "", new Set()).map(m => m.id).join(","), "c-5"));
      check("card-chain.js", "814K the part found is bold and the rest escaped, and a title that folds to another length is left plain",
        () => eq([CH.nextHitHtml("A <b> firing", "fir"), CH.nextHitHtml("Stra" + String.fromCharCode(223) + "e firing", "fir")].join("|"),
          "A &lt;b&gt; <b>fir</b>ing|Stra" + String.fromCharCode(223) + "e firing"));
    } finally { AS.setCards(hadCards); CM.setContentLangs(hadLangs); }
  }
  check("card-chain.js", "814L the editor says when the desk's stamp differs from the catalog's, either way, and says nothing for an own card",
    () => {
      const on = CH.stampNoteHtml(true, { commits: 0 }), off = CH.stampNoteHtml(false, { commits: true });
      return eq([on.indexOf("Yours, not the catalog") > -1, off.indexOf("You took the stamp off") > -1,
        CH.stampNoteHtml(true, { commits: 1 }), CH.stampNoteHtml(false, {}), CH.stampNoteHtml(true, null)].join("|"), "true|true|||");
    });
  check("ui-lang.js", "814M a copy of a stamped card carries the stamp in the same words on every card, and a plain copy or a refusal does not",
    () => {
      const a = UL.toastHtml("Ready to paste: One, EN", false, true), b = UL.toastHtml("Ready to paste: Two, PL", false, true);
      const chip = h => h.slice(h.indexOf('<span class="t-stamp">'));
      return eq([chip(a) === chip(b), chip(a).indexOf("Commits the firm") > -1, a.indexOf("Ready to paste: One, EN") > -1,
        UL.toastHtml("Plain", false, false), UL.toastHtml("No", true, true).indexOf("t-stamp")].join("|"), "true|true|true||-1");
    });
  /* THE SITES NO NODE LEG CAN CALL, held as text: each needs a document. Every copy route hands the
     toast the card's stamp; the head puts the stamp after the title, and a patched card files its
     badges after the stamp as a rebuild does; the editor's two saves write the list and the stamp. */
  const src = f => fs.readFileSync(join(MODDIR, f), "utf8");
  check("list-pointer.js", "814O every copy route of a card hands the toast the card's stamp",
    () => eq(["list-pointer.js", "copy-entry.js", "pick.js"].map(f => {
      const s = src(f);
      return f + ":" + (s.split("copy(fill(").length - 1) + "/" + (s.split("), cardCommits(m));").length - 1);
    }).join(","), "list-pointer.js:1/1,copy-entry.js:2/2,pick.js:1/1"));
  check("card-body.js", "814P the stamp follows a card's title before its badges, and a patched card files its badges after the stamp",
    () => {
      const body = src("card-body.js"), pool = src("card-pool.js"), at = body.indexOf('stampHtml("cstamp")');
      return eq([at > body.indexOf('<span class="ctitle"'), at < body.indexOf("const hitBadge="),
        pool.indexOf('const anchor=head.querySelector(".cstamp")||head.querySelector(".ctitle");') > -1].join(","), "true,true,true");
    });
  check("card-editor.js", "814Q a save writes the stamp and the list: whole into a custom entry after the carry, through the override for a catalog card",
    () => {
      const ed = src("card-editor.js"), carry = ed.indexOf("carryUnwritten(entry,"), put = ed.indexOf("if(own&&own.length) entry.next=own; else delete entry.next;");
      return eq([carry > -1 && put > carry, ed.indexOf("intentTop,lockLang,commits,intents:intentsStored}") > -1,
        ed.indexOf("lockLang, commits}, nx.fields());") > -1].join(","), "true,true,true");
    });
  check("card-editor.js", "1007pa1 a save writes the forms the radios hold: read once, into a custom entry and through the override for a catalog card",
    () => {
      const ed = src("card-editor.js");
      return eq([ed.split("const addr=readMeAddress(m);").length - 1, ed.split("},text,addr,").length - 1,
        ed.split("out[key]=group ? (el?el.value:\"\")").length - 1].join(","), "1,2,1");
    });
  /* The desk starting again in place is where what Look kept of the agent's earlier edits is let go: a catalog loaded,
     or local memory cleared, must not leave an edit behind for a take to give back. restartDesk is not callable in node. */
  check("desk-look.js", "26b1 the desk starting again in place has Look forget the edits it kept, once, before the catalog is read",
    () => {
      const r = src("restart.js"), at = r.indexOf("  forgetLookEdits();");
      return eq([r.split("forgetLookEdits();").length - 1, at > r.indexOf("function restartDesk()"), at < r.indexOf("applyBootCatalog();")].join(","), "1,true,true");
    });
}

/* ------------------------------------------------------------------ next-dock.js, the action button
   Board 814, S5: after a reply is sent, the card's own list (the catalog's, or the agent's in its place)
   is offered first in its order, then what this desk learnt follows that card, most often first, up to
   four places, each learnt one marked (ledger, the night of 4 October). The button shows the count for
   the tab in front and pulses only when a step brings new replies (decisions 2026-10-01 10:29, 10:34).
   Every card here is invented; every global and hook set here is put back. */
{
  /* The stand-ins go up before the dock is first imported: loading a module lets the frames the path's
     legs above left waiting run, and they read the hooks and the document. */
  const T = await import(MOD("tabs.js"));
  const H = await import(MOD("hooks.js"));
  const AS = await import(MOD("app-state.js"));
  const hadDoc = globalThis.document, hadAdd = globalThis.addEventListener;
  const STUBS = ["applyLangUI", "updateIntentPlaceholder", "drawPillsCore", "drawIntentRail", "render", "scheduleRailGeometry", "segFolded"];
  const hadHooks = STUBS.map(k => [k, Object.prototype.hasOwnProperty.call(H.hooks, k), H.hooks[k]]);
  const hadCards = AS.cards;
  const quiet = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
  const ring = new Set(), badge = { textContent: "" };
  const fab = { hidden: true, title: "", attrs: {}, offsetWidth: 44, addEventListener() {},
    classList: { add: c => ring.add(c), remove: c => ring.delete(c), contains: c => ring.has(c), toggle() {} },
    querySelector: s => (s === ".fab-badge" ? badge : null), setAttribute(k, v) { this.attrs[k] = String(v); } };
  globalThis.document = { querySelector: s => (s === "#nextFab" ? fab : null), getElementById: () => null, querySelectorAll: () => [],
    addEventListener() {}, body: { classList: quiet }, documentElement: { style: { setProperty() {} }, classList: quiet, addEventListener() {} } };
  if (typeof globalThis.addEventListener !== "function") globalThis.addEventListener = () => {};
  STUBS.forEach(k => { if (typeof H.hooks[k] !== "function") H.hooks[k] = () => {}; });
  const ND = await import(MOD("next-dock.js"));
  const LP = await import(MOD("list-pointer.js"));
  const ST = await import(MOD("storage.js"));
  const SC = await import(MOD("shortcuts.js"));
  const CH = await import(MOD("card-chain.js"));
  const fs = await import("node:fs");
  const card = (id, next) => (next ? { id, c: "orders", en: "Body of " + id, t: "Title " + id, next: next.map(to => ({ to })) }
    : { id, c: "orders", en: "Body of " + id, t: "Title " + id });
  const liveOf = list => new Map(list.map(m => [m.id, m]));
  const said = rows => rows.map(r => r.id + (r.learnt ? "~" + r.n : "")).join(",");
  const said2 = rows => rows.map(r => r.id + (r.learnt ? "~" + r.n : r.used ? "+" + r.n : "")).join(",");
  const L1 = [card("c-nd-a", ["c-nd-b", "c-nd-gone", "c-nd-a", "c-nd-c"]), card("c-nd-b"), card("c-nd-c"), card("c-nd-d"),
    card("c-nd-e"), card("c-nd-f"), card("c-nd-g")];
  check("next-dock.js", "814S the card's own list comes first in its order, live cards only and never itself; learnt replies fill the places left, most often first, each marked, four in all",
    () => eq(said(ND.dockList("c-nd-a", liveOf(L1),
      [{ id: "c-nd-d", n: 5 }, { id: "c-nd-b", n: 9 }, { id: "c-nd-gone", n: 8 }, { id: "c-nd-e", n: 3 }, { id: "c-nd-f", n: 2 }], new Set())),
      "c-nd-b,c-nd-c,c-nd-d~5,c-nd-e~3"));
  check("next-dock.js", "814T a pair seen once is not yet learnt, and a learnt reply this conversation already sent is passed over, where the card's own list keeps one",
    () => eq(said(ND.dockList("c-nd-x", liveOf([card("c-nd-x", ["c-nd-y"]), card("c-nd-y"), card("c-nd-z"), card("c-nd-w"), card("c-nd-v")]),
      [{ id: "c-nd-v", n: 1 }, { id: "c-nd-z", n: 4 }, { id: "c-nd-w", n: 2 }], new Set(["c-nd-y", "c-nd-z"]))), "c-nd-y,c-nd-w~2"));
  check("next-dock.js", "814U CONTROL: a card with no list and nothing learnt offers nothing, an unknown card nothing, and a list of six live cards its first four and no learnt one",
    () => {
      const six = card("c-nd-6", ["c-nd-b", "c-nd-c", "c-nd-d", "c-nd-e", "c-nd-f", "c-nd-g"]);
      return eq([said(ND.dockList("c-nd-b", liveOf(L1), [], new Set())), said(ND.dockList("c-nd-none", liveOf(L1), [{ id: "c-nd-b", n: 9 }], new Set())),
        said(ND.dockList("c-nd-6", liveOf(L1.concat([six])), [{ id: "c-nd-a", n: 9 }], new Set()))].join("|"), "||c-nd-b,c-nd-c,c-nd-d,c-nd-e");
    });
  /* 8f (Maxim, 2026-10-05 18:26, "Fill with the desk's most-used cards"): what the list and the learnt replies
     leave is topped up by the desk's copies, most first, each such row marked as offered by use. */
  check("next-dock.js", "814S1 places the list and the learnt replies leave are topped up by use, most first: never the card itself, one already offered or sent, a hidden card, one gone or one not copied; four in all",
    () => {
      const L = [card("c-nd-m", ["c-nd-m1"]), card("c-nd-m1"), card("c-nd-m2"), card("c-nd-m3"), card("c-nd-m4"), card("c-nd-m5"), card("c-nd-m6"), card("c-nd-m7")];
      L[5]._hidden = 1;
      return eq(said2(ND.dockList("c-nd-m", liveOf(L), [{ id: "c-nd-m2", n: 3 }], new Set(["c-nd-m6"]),
        [{ id: "c-nd-m", n: 9 }, { id: "c-nd-m1", n: 8 }, { id: "c-nd-m5", n: 7 }, { id: "c-nd-m6", n: 6 }, { id: "c-nd-gone", n: 5 },
          { id: "c-nd-m3", n: 4 }, { id: "c-nd-m2", n: 3 }, { id: "c-nd-m7", n: 0 }, { id: "c-nd-m4", n: 1 }])),
        "c-nd-m1,c-nd-m2~3,c-nd-m3+4,c-nd-m4+1");
    });
  check("next-dock.js", "814V the unfolded dock keeps its place when clear, moves left past a question it would meet, keeps the gap, and stands down where the window has no room",
    () => {
      const want = { left: 628, top: 500, width: 640, height: 300 }, ask = { left: 928, top: 52, width: 340, height: 460 };
      return eq([ND.dockClear(want, [], 12), ND.dockClear(want, [ask], 12), ND.dockClear(want, [{ left: 928, top: 52, width: 340, height: 436 }], 12),
        ND.dockClear(want, [{ left: 600, top: 52, width: 340, height: 460 }], 12)].join(","), "628,276,628,");
    });
  check("next-dock.js", "814n the vicinity is the rect grown by its margin on every side, and no further",
    () => {
      const r = { left: 100, top: 100, width: 44, height: 44 };
      return eq([[52, 120], [192, 192], [51, 120], [120, 193]].map(([x, y]) => ND.dockNear(r, x, y, 48)).join(","), "true,true,false,false");
    });
  /* The button itself, against a stand-in that keeps what the dock writes; the tabs are drawn for real,
     as the path's own legs above do, and copies go through the desk's copy route. */
  const shown = () => [fab.hidden ? "hidden" : "shown", badge.textContent || "-", ring.has("nudge") ? "pulse" : "still"].join(" ");
  try {
    AS.setCards([card("c-nd-p", ["c-nd-q", "c-nd-r"]), card("c-nd-q", ["c-nd-p"]), card("c-nd-r"), card("c-nd-s")]);
    T.tabs.splice(0, T.tabs.length);
    ST.ssSet(T.TAB_KEY, "null");
    T.initTabs();
    ND.wireNextDock();
    const seen = [shown()];
    LP.bumpUseCount("c-nd-p", "en"); seen.push(shown());
    ND.syncNextDock(); seen.push(shown());
    T.tabs.push({ id: "mc-nd2", pax: "" }); T.stepTab(1); ND.syncNextDock(); seen.push(shown());
    LP.bumpUseCount("c-nd-q", "en"); seen.push(shown());
    T.stepTab(1); ND.syncNextDock(); seen.push(shown());
    check("next-dock.js", "814W the action button shows the tab in front's count: hidden before a copy, pulsing when one brings replies, still on a redraw, and per tab, a switch showing the digit without a pulse",
      () => eq(seen.join(" | "), "hidden - still | shown 2 pulse | shown 2 pulse | hidden - still | shown 1 pulse | shown 2 still"));
    /* Two copies of s straight after r teach the pair; a third tab sending r then offers the card's
       own none and the learnt one, and the count reaches the button. */
    T.tabs.push({ id: "mc-nd3", pax: "" }); T.stepTab(1);
    LP.bumpUseCount("c-nd-r", "en"); LP.bumpUseCount("c-nd-s", "en"); LP.bumpUseCount("c-nd-r", "en"); LP.bumpUseCount("c-nd-s", "en");
    T.tabs.push({ id: "mc-nd4", pax: "" }); T.stepTab(1); ND.syncNextDock();
    const before = shown();
    LP.bumpUseCount("c-nd-r", "en");
    const learntNow = said(ND.dockNow().rows.filter(r => !r.used));
    check("next-dock.js", "814X what the desk learnt reaches the button: a reply sent twice after another is offered after it in a fresh conversation, and it pulses",
      () => eq(before + " | " + (ring.has("nudge") ? "pulse" : "still") + " " + learntNow, "hidden - still | pulse c-nd-s~2"));
    /* 8f at the button: a reply with nothing on its list and nothing learnt is offered the desk's most-used cards and
       shows their count, and only a step bringing the list or a learnt reply pulses (the queue's "the pulse kept
       meaningful"). A pack of its own with invented days, the one before put back. */
    {
      const PK = await import(MOD("pack.js"));
      const DS = await import(MOD("desk-stats.js"));
      const held = JSON.stringify(PK.pack);
      try {
        PK.resetPack();
        const ids = ["c-nd-u1", "c-nd-u2", "c-nd-u3", "c-nd-u4"];
        PK.pack.dayIds = ids.slice();
        PK.pack.days = { [DS.statsYmd()]: { c: { 0: 6, 1: 4, 2: 2, 3: 1 }, i: {}, m: 0, l: {} } };
        AS.setCards([card("c-nd-bare"), card("c-nd-lead", ["c-nd-u4"])].concat(ids.map(id => card(id))));
        T.tabs.push({ id: "mc-nd5", pax: "" }); T.stepTab(1);
        LP.bumpUseCount("c-nd-bare", "en");
        const bare = shown() + " " + said2(ND.dockNow().rows);
        T.tabs.push({ id: "mc-nd6", pax: "" }); T.stepTab(1);
        LP.bumpUseCount("c-nd-lead", "en");
        const lead = shown() + " " + said2(ND.dockNow().rows);
        check("next-dock.js", "814X1 a reply with no list and nothing learnt is offered the desk's most-used cards, most first, and the button shows their count without a pulse; a reply with its own list pulses, its list first and the most-used after",
          () => eq(bare + " | " + lead, "shown 4 still c-nd-u1+6,c-nd-u2+4,c-nd-u3+2,c-nd-u4+1 | shown 4 pulse c-nd-u4,c-nd-u1+6,c-nd-u2+4,c-nd-u3+2"));
      } finally { PK.resetPack(); Object.assign(PK.pack, JSON.parse(held)); }
    }
    // A switch of tab finishes on the next frame, which reads hooks put back below.
    await new Promise(r => setTimeout(r, 20));
  /* The keys and the labels. Ctrl+1 to 4 are four rows of the shortcuts list like any other, read in the
     search box; the editor's fold names the key of each of its first four rows, and a rebind reaches it. */
  SC.loadShortcuts();
  check("shortcuts.js", "814Y Ctrl+1 to 4 copy the next replies: four rebindable rows on the digits, live in a field, each dispatched to its own place",
    () => {
      const rows = ["nextCopy1", "nextCopy2", "nextCopy3", "nextCopy4"].map(id => SC.SC_DEFS.find(d => d.id === id));
      const rs = fs.readFileSync(join(MODDIR, "run-shortcut.js"), "utf8");
      return eq([rows.map(d => d ? [d.def.code, d.def.ctrl, d.def.alt, d.inField, d.fixed ? 1 : 0].join(":") : "none").join(","),
        SC.formatActionChord("nextCopy3"),
        rs.indexOf("if(/^nextCopy[1-4]$/.test(id)) return copyNextReply(+id.slice(8)-1);") > -1,
        rs.indexOf("if(nextDockOpen()){ foldNextDock(); return true; }") > -1 && rs.indexOf("if(nextDockOpen())") < rs.indexOf("escapeLadderStep();")].join("|"),
        "Digit1:1:0:1:0,Digit2:1:0:1:0,Digit3:1:0:1:0,Digit4:1:0:1:0|Ctrl+3|true|true");
    });
  {
    const hadCards2 = AS.cards;
    const five = card("c-nd-k", ["c-nd-k1", "c-nd-k2", "c-nd-k3", "c-nd-k4", "c-nd-k5"]);
    AS.setCards([five].concat(["c-nd-k1", "c-nd-k2", "c-nd-k3", "c-nd-k4", "c-nd-k5"].map(id => card(id))));
    try {
      const keys = () => (CH.nextReplies(five, null, null).body().match(/<kbd class="nx-key">[^<]*<\/kbd>/g) || [])
        .map(k => k.replace(/<[^>]+>/g, "")).join(",");
      const was = keys();
      SC.scTake("nextCopy2", 1, { code: "KeyJ", key: "j", ctrl: 0, alt: 1, shift: 0, meta: 0 });
      const rebound = keys();
      check("card-chain.js", "814Z the editor's Next rows name the keys that copy them: the first four, the fifth none, and a rebind shows",
        () => eq(was + " | " + rebound, "Ctrl+1,Ctrl+2,Ctrl+3,Ctrl+4 | Ctrl+1,Alt+J,Ctrl+3,Ctrl+4"));
    } finally { AS.setCards(hadCards2); SC.loadShortcuts(); }
  }
  /* THE TWO BUBBLES IN ONE CORNER (ledger, the night of 4 October): the catalog's offer hangs from the name
     at the top and its list scrolls, so it ends above the round buttons' row; the action button keeps the
     corner, one step left of the clear door. Numbers read from the sheet and from bubble.js. */
  check("catalog-offer.js", "814h a long catalog offer ends above the round buttons with the bubble's gap to spare, and the action button sits one step left of the clear door",
    () => {
      const off = fs.readFileSync(join(MODDIR, "catalog-offer.js"), "utf8"), bub = fs.readFileSync(join(MODDIR, "bubble.js"), "utf8");
      const sheet = fs.readFileSync(join(MODDIR, "..", "template.html"), "utf8");
      const cap = +((/innerHeight-Math\.ceil\(r\.bottom\)-(\d+)\)/.exec(off) || [])[1]), gap = +((/gap:(\d+),/.exec(bub) || [])[1]);
      const fabRule = /\.fab\{position:fixed;right:(\d+)px;bottom:(\d+)px;z-index:\d+;width:(\d+)px;height:(\d+)px/.exec(sheet) || [];
      const right = sel => +((new RegExp("\\." + sel + "\\{right:(\\d+)px").exec(sheet) || [])[1]);
      const row = +fabRule[2] + +fabRule[4], step = right("fab-clear") - +fabRule[1];
      // The bubble's foot is the name's foot, the gap, and the list at its cap: vh - (cap - gap) from the top.
      return eq([cap - gap > row + gap, right("fab-next") - right("fab-clear") === step, step > +fabRule[3]].join(","), "true,true,true");
    });
  } finally {
    T.watchTabPath(null);
    T.tabs.splice(0, T.tabs.length);
    AS.setCards(hadCards);
    hadHooks.forEach(([k, own, v]) => { if (own) H.hooks[k] = v; else delete H.hooks[k]; });
    if (hadAdd === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = hadAdd;
    if (hadDoc === undefined) delete globalThis.document; else globalThis.document = hadDoc;
  }
}

/* ------------------------------------------------------------------ lanes.js, the cards or the lanes
   Board 814, S5: Space switches between the cards and the lanes while nothing is being typed (decisions
   2026-10-01 01:11), and so does a click on the action button (10:29). The lanes stand over the list and
   give it back whole. Driven through the desk's own route against stand-ins that keep what is written; every
   card is invented, and every global and hook set here is put back. */
{
  const T = await import(MOD("tabs.js"));
  const H = await import(MOD("hooks.js"));
  const AS = await import(MOD("app-state.js"));
  const Dom = await import(MOD("dom.js"));
  const hadDoc = globalThis.document, hadAdd = globalThis.addEventListener;
  const STUBS = ["applyLangUI", "updateIntentPlaceholder", "drawPillsCore", "drawIntentRail", "render", "scheduleRailGeometry",
    "segFolded", "syncRailGeometry", "rebuildCards", "syncSampleMark"];
  const hadHooks = STUBS.map(k => [k, Object.prototype.hasOwnProperty.call(H.hooks, k), H.hooks[k]]);
  const hadCards = AS.cards;
  const on = o => ({ add: c => o.add(c), remove: c => o.delete(c), contains: c => o.has(c),
    toggle: (c, f) => { const w = f === undefined ? !o.has(c) : !!f; if (w) o.add(c); else o.delete(c); return w; } });
  const bodyCls = new Set(), quiet = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
  const el = extra => Object.assign({ hidden: false, attrs: {}, innerHTML: "", style: {}, setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; }, querySelector: () => null, querySelectorAll: () => [],
    addEventListener(k, fn) { (this.heard = this.heard || {})[k] = (this.heard[k] || []).concat(fn); } }, extra || {});
  const badge = { textContent: "" };
  const fab = el({ hidden: true, offsetWidth: 44, classList: on(new Set()), querySelector: s => (s === ".fab-badge" ? badge : null) });
  const lanesBox = el({ hidden: true }), shell = el({ inert: false }), box = el({ value: "", tagName: "INPUT", classList: on(new Set()) });
  const byId = { "#nextFab": fab, "#lanes": lanesBox, "#pageScroll > .shell": shell, "#intent": box, "#modal": { hidden: true },
    "#pax": el({ value: "" }), "#roleSel": el({ value: "" }) };
  const body = { classList: on(bodyCls) };
  globalThis.document = { querySelector: s => byId[s] || null, getElementById: () => null, querySelectorAll: () => [],
    addEventListener() {}, createElement: () => el({ getContext: () => ({}) }), createRange: () => ({}), activeElement: null, body,
    documentElement: { style: { setProperty() {}, removeProperty() {} }, classList: quiet, addEventListener() {} } };
  globalThis.addEventListener = () => {};
  STUBS.forEach(k => { if (typeof H.hooks[k] !== "function") H.hooks[k] = () => {}; });
  Dom.grabDom();
  const LN = await import(MOD("lanes.js"));
  const ND = await import(MOD("next-dock.js"));
  const LP = await import(MOD("list-pointer.js"));
  const ST = await import(MOD("storage.js"));
  const SC = await import(MOD("shortcuts.js"));
  const fs = await import("node:fs");
  const card = (id, next) => (next ? { id, c: "orders", en: "Body of " + id, t: "Title " + id, next: next.map(to => ({ to })) }
    : { id, c: "orders", en: "Body of " + id, t: "Title " + id });
  const pax = el({ value: "Anna" }), full = el({ value: "x", tagName: "INPUT" });
  check("lanes.js", "814ln1 the lanes key is free with nothing focused or the search box focused and empty, and kept by a box holding text, another field or a button",
    () => eq([LN.lanesKeyFree(null, box, body), LN.lanesKeyFree(body, box, body), LN.lanesKeyFree(box, box, body),
      LN.lanesKeyFree(full, full, body), LN.lanesKeyFree(pax, box, body), LN.lanesKeyFree(el({ tagName: "BUTTON" }), box, body)].join(","),
      "true,true,true,false,false,false"));
  check("shortcuts.js", "814ln2 Space is the lanes' row, rebindable and live in a field; the dispatcher asks the lanes first, and Escape sheds them before the dock and the search",
    () => {
      const d = SC.SC_DEFS.find(x => x.id === "lanes"), rs = fs.readFileSync(join(MODDIR, "run-shortcut.js"), "utf8");
      const top = rs.indexOf('if(id==="lanes") return lanesKey();'), ask = rs.indexOf("lanesShortcut(id)");
      const shed = rs.indexOf("if(lanesOpen()){ toggleLanes(false); return true; }");
      return eq([d ? [d.def.code, d.def.key === " ", d.def.ctrl, d.def.alt, d.def.shift, d.inField, d.fixed ? 1 : 0].join(":") : "none",
        top > -1 && top < rs.indexOf('if(id==="navUp"'), ask > top && ask < rs.indexOf('if(id==="langToggle")'),
        shed > -1 && shed < rs.indexOf("if(nextDockOpen()){ foldNextDock(); return true; }") && shed < rs.indexOf("escapeLadderStep();")].join("|"),
        "Space:true:0:0:0:1:0|true|true|true");
    });
  check("lanes.js", "814ln3 while the lanes show, the keys that walk and copy cards stay in the lanes and the category keys do nothing; tabs, language and Escape pass",
    () => eq(["navDown", "navUp", "markTop", "markBottom", "copy", "copyOther", "navPillLeft", "navPillLast", "tabNext", "langToggle", "escape", "clearIntent"]
      .map(id => String(LN.lanesShortcut(id))).join(","), "true,true,true,true,true,true,true,true,undefined,undefined,undefined,undefined"));
  try {
    ST.lsSet("eMotionOff", "1");
    SC.loadShortcuts();
    AS.setCards([card("c-ln-a", ["c-ln-b", "c-ln-c"]), card("c-ln-b"), card("c-ln-c"), card("c-ln-d")]);
    T.tabs.splice(0, T.tabs.length);
    ST.ssSet(T.TAB_KEY, "null");
    T.initTabs();
    ND.wireNextDock();
    LN.wireLanes();
    ND.syncNextDock();
    const state = () => [bodyCls.has("e-lanes") ? "lanes" : "cards", shell.inert ? "inert" : "live", lanesBox.hidden ? "hidden" : "shown",
      fab.hidden ? "nofab" : "fab", fab.attrs["aria-pressed"] || "-"].join(" ");
    const click = () => ((fab.heard && fab.heard.click) || []).forEach(fn => fn({}));
    const seen = [state()];
    click(); seen.push(state());
    const empty = /class="ln-empty"/.test(lanesBox.innerHTML) && !/ln-now/.test(lanesBox.innerHTML);
    LP.bumpUseCount("c-ln-a", "en");
    const html = lanesBox.innerHTML;
    const drawn = [/class="card ln-now"/.test(html), (html.match(/class="card ln-row/g) || []).length, /Title c-ln-a/.test(html), /Ctrl\+2/.test(html)].join(",");
    box.value = "x"; ((box.heard && box.heard.input) || []).forEach(fn => fn({}));
    seen.push(state() + (lanesBox.innerHTML ? " kept" : " emptied"));
    document.activeElement = box;
    const typed = LN.lanesKey();
    box.value = ""; const opened = LN.lanesKey(); seen.push(state());
    document.activeElement = body; const closed = LN.lanesKey(); seen.push(state());
    // A reply with nothing after it leaves the button there, digitless, as the door to the lanes.
    LP.bumpUseCount("c-ln-d", "en"); seen.push(state() + " digit:" + (badge.textContent || "-"));
    check("lanes.js", "814ln4 the button and Space switch to the lanes and back: a line before the first reply, the reply now and its next after a copy, typing in the search box gives the cards back whole, and the button stays once a reply was sent",
      () => eq(seen.join(" | ") + " | " + [empty, drawn, typed, opened, closed].join(";"),
        "cards live hidden nofab false | lanes inert shown fab true | cards live hidden fab false emptied | lanes inert shown fab true | cards live hidden fab false"
        + " | cards live hidden fab false digit:-"
        + " | true;true,2,true,true;false;true;true"));
    /* A list edited in the lanes is written where the editor writes it: an own card's whole list in its entry,
       by the same rule (814ed1), and only the reply sent last is edited. */
    const P = await import(MOD("pack.js"));
    const hadCustom = P.pack.custom;
    try {
      const own = { id: "u:ln-own", c: "orders", en: "Body of own", t: "Title own", next: [{ to: "c-ln-b" }, { to: "c-ln-c" }] };
      P.pack.custom = [JSON.parse(JSON.stringify(own))];
      AS.setCards(AS.cards.concat([own]));
      document.activeElement = body; LN.lanesKey();
      LP.bumpUseCount("u:ln-own", "en");
      const shownFirst = /data-to="c-ln-b"[\s\S]*data-to="c-ln-c"/.test(lanesBox.innerHTML);
      const wrote = LN.writeLaneList(["c-ln-c", "c-ln-b", "c-ln-gone"]);
      const after = JSON.stringify(P.pack.custom[0].next);
      const emptied = LN.writeLaneList([]) && !("next" in P.pack.custom[0]);
      LN.toggleLanes(false);
      check("lanes.js", "814ed2 a reorder in the lanes writes the reply sent last's own list, live cards only, and an emptied list leaves no list",
        () => eq([shownFirst, wrote, after, emptied, LN.writeLaneList(["c-ln-b"])].join("|"),
          'true|true|[{"to":"c-ln-c"},{"to":"c-ln-b"}]|true|false'));
    } finally { P.pack.custom = hadCustom; }
    /* A catalog card's list is written to its override beside the ids it replaced, the catalog's own card is
       never touched, and Back to the catalog's, clicked in the lanes, offers the agent's list back. */
    const CMod = await import(MOD("card-model.js"));
    const hadOv = P.pack.overrides, hadMake = document.createElement, hadContains = lanesBox.contains;
    const cat = { id: "c-ln-cat", c: "orders", en: "Body of c-ln-cat", t: "Title c-ln-cat", next: [{ to: "c-ln-b" }, { to: "c-ln-c" }] };
    const base = JSON.parse(JSON.stringify(cat));
    let undoBtn = null;
    try {
      Object.assign(window, { E_CATALOG: { kind: "etiuda-catalog", format: 2, cards: [cat] } });
      P.pack.overrides = {}; P.BASE_M.push(base);
      AS.setCards(AS.cards.concat([Object.assign({}, base)]));
      document.createElement = () => el({ isConnected: false, remove() {}, removeAttribute() {},
        querySelector: s => (s === "#eUndoBtn" ? (undoBtn = {}) : null) });
      body.appendChild = () => {};
      lanesBox.contains = () => true;
      const kept = () => JSON.stringify([CMod.baseCard("c-ln-cat").next, window.E_CATALOG.cards[0].next]);
      const ov = () => JSON.stringify(P.pack.overrides["c-ln-cat"] || null);
      const catalogs = kept();
      document.activeElement = body; LN.lanesKey();
      LP.bumpUseCount("c-ln-cat", "en");
      const wrote = LN.writeLaneList(["c-ln-c", "c-ln-b", "c-ln-d"]), mine = ov(), kept1 = kept() === catalogs;
      const back = { closest: s => (s === ".ln-back" ? back : null) };
      ((lanesBox.heard && lanesBox.heard.click) || []).forEach(fn => fn({ target: back }));
      const given = ov(), kept2 = kept() === catalogs, offered = !!(undoBtn && undoBtn.onclick);
      if (offered) undoBtn.onclick();
      check("lanes.js", "814ed3 a catalog card's list edited in the lanes is written to its override with the ids it replaced, the catalog's card and E_CATALOG stay as they were, and Back to the catalog's offers Undo, which restores the override",
        () => eq([wrote, mine, kept1, given, kept2, offered, ov() === mine, kept() === catalogs].join("|"),
          'true|{"next":[{"to":"c-ln-c"},{"to":"c-ln-b"},{"to":"c-ln-d"}],"nextWas":["c-ln-b","c-ln-c"]}|true|null|true|true|true|true'));
    } finally {
      LN.toggleLanes(false);
      document.createElement = hadMake; delete body.appendChild;
      if (hadContains === undefined) delete lanesBox.contains; else lanesBox.contains = hadContains;
      const at = P.BASE_M.indexOf(base); if (at > -1) P.BASE_M.splice(at, 1);
      P.pack.overrides = hadOv; delete window.E_CATALOG;
    }
    /* Board 863, the lanes walk: what the action button offers by use alone is offered in the lanes too, marked
       often and never written into the list; each step says what it leaves to choose from; and what was sent is
       also a trail, which the sheet shows where three lanes would not fit. The day is moved on so the desk's
       counts of the day, held once read, are read afresh. */
    const RealDate = Date, hadById = document.getElementById, hadCustom2 = P.pack.custom, hadContains2 = lanesBox.contains, hadMake2 = document.createElement;
    const sayEl = { textContent: "" };
    try {
      globalThis.Date = class extends RealDate {
        constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + 3 * 864e5); }
        static now() { return RealDate.now() + 3 * 864e5; } };
      document.getElementById = id => (id === "eSay" ? sayEl : null);
      lanesBox.contains = () => true;
      document.createElement = () => el({ isConnected: false, remove() {}, removeAttribute() {}, querySelector: s => (s === "#eUndoBtn" ? {} : null) });
      body.appendChild = () => {};
      const own = { id: "u:ln-walk", c: "orders", en: "Body of walk", t: "Title walk", next: [{ to: "c-ln-b" }, { to: "c-ln-c" }] };
      P.pack.custom = [JSON.parse(JSON.stringify(own))];
      AS.setCards(AS.cards.concat([own]));
      const freshTab = () => { T.tabs.splice(0, T.tabs.length); ST.ssSet(T.TAB_KEY, "null"); T.initTabs(); };
      freshTab(); LP.bumpUseCount("c-ln-d", "en");
      freshTab(); document.activeElement = body; LN.toggleLanes(true);
      LP.bumpUseCount("u:ln-walk", "en");
      const html = lanesBox.innerHTML, saidFirst = sayEl.textContent;
      const rowOf = id => html.split('<div class="card ln-row').find(p => p.indexOf('data-to="' + id + '"') > -1) || "";
      const d = rowOf("c-ln-d"), b = rowOf("c-ln-b");
      const offered = [/data-used=""/.test(d), />often</.test(d), /class="ln-keep"/.test(d), /nx-grip/.test(d), /nx-grip/.test(b), /ln-trail/.test(html)].join(",");
      /* A drag reorders the list's own rows only: the lanes' pointer handlers run over rows that answer the drag's own
         selector, and what is written is the list without the reply offered by use alone. */
      const dragTags = [...html.matchAll(/<div class="card ln-row[^"]*"([^>]*)>/g)].map(m => m[1]);
      let dragOrder = [];
      const dragWrap = { insertBefore(r, ref) { dragOrder = dragOrder.filter(o => o !== r); const at = ref ? dragOrder.indexOf(ref) : -1; if (at > -1) dragOrder.splice(at, 0, r); else dragOrder.push(r); } };
      dragOrder = dragTags.map((tag, i) => { const r = { dataset: { to: /data-to="([^"]*)"/.exec(tag)[1] }, parentNode: dragWrap, classList: { add() {}, remove() {} },
        hasAttribute: a => tag.indexOf(" " + a + "=") > -1, getBoundingClientRect: () => ({ top: i * 50, height: 40 }), get nextSibling() { return dragOrder[dragOrder.indexOf(r) + 1] || null; } };
        return r; });
      const hadAll = lanesBox.querySelectorAll;
      lanesBox.querySelectorAll = sel => (sel.indexOf(".ln-row") === 0 ? dragOrder.filter(r => [...sel.matchAll(/:not\(\[([\w-]+)\]\)/g)].every(m => !r.hasAttribute(m[1]))) : []);
      const heard = k => (lanesBox.heard && lanesBox.heard[k]) || [];
      try {
        const grip = { closest: s => (s === ".ln-row" ? dragOrder[0] : null), setPointerCapture() {} };
        heard("pointerdown").forEach(fn => fn({ button: 0, pointerType: "mouse", pointerId: 1, clientY: 0, target: { closest: s => (s === ".nx-grip" ? grip : null) } }));
        heard("pointermove").forEach(fn => fn({ clientY: 110 }));
        heard("pointerup").forEach(fn => fn({}));
      } finally { lanesBox.querySelectorAll = hadAll; }
      const dragged = JSON.stringify(P.pack.custom[0].next);
      const lanesFirst = dragTags.slice(0, 4).map(tag => /data-to="([^"]*)"/.exec(tag)[1] + (tag.indexOf(" data-learnt=") > -1 ? "~" : tag.indexOf(" data-used=") > -1 ? "+" : ""));
      const dockFirst = ND.dockNow().rows.map(r => r.id + (r.learnt ? "~" : r.used ? "+" : ""));
      const keys = [lanesFirst.join(",") === dockFirst.join(","), dockFirst.length, dockFirst.some(k => k.endsWith("+"))].join(",");
      P.pack.custom[0].next = own.next.map(e => ({ to: e.to }));
      const rowEl = { dataset: { k: "0", to: "c-ln-b" } }, x = { closest: s => (s === ".nx-x" ? x : s === ".ln-row" ? rowEl : null) };
      ((lanesBox.heard && lanesBox.heard.click) || []).forEach(fn => fn({ target: x }));
      const written = JSON.stringify(P.pack.custom[0].next);
      check("lanes.js", "863w1 a reply offered by use alone is offered in the lanes, marked often, with the way to add it and no grip, and taking a reply off the list or dragging one never writes it in, and the first four rows are the action button's rows, in its order, so its keys copy the same replies",
        () => eq(offered + "|" + written + "|" + dragged + "|" + keys, 'true,true,true,false,true,false|[{"to":"c-ln-c"}]|[{"to":"c-ln-c"},{"to":"c-ln-b"}]|true,4,true'));
      LP.bumpUseCount("c-ln-c", "en");
      await new Promise(r => setTimeout(r, 80));
      const after = lanesBox.innerHTML, saidNext = sayEl.textContent;
      const rowsIn = h => (h.match(/<div class="card ln-row/g) || []).length;
      const crumbs = (after.match(/<span class="ln-crumb[^"]*" role="listitem">/g) || []).length;
      check("lanes.js", "863w2 each step says what it leaves to choose from, and what was sent stands as a trail named Sent, one crumb a reply",
        () => eq([saidFirst === "To choose from next: " + rowsIn(html) + ".", saidNext === "To choose from next: " + rowsIn(after) + ".", rowsIn(html) > 0 && rowsIn(after) > 0,
          /<div class="ln-trail" role="list" aria-label="Sent">/.test(after), crumbs].join("|") + " " + saidFirst + " / " + saidNext,
          "true|true|true|true|1 To choose from next: " + rowsIn(html) + ". / To choose from next: " + rowsIn(after) + "."));
      /* A step to a card with no list, nothing learnt and nothing used to offer leaves nothing to choose from, and
         says where a reply is added. It is the desk's only card here, so no row can be offered. */
      AS.setCards([card("c-ln-solo")]);
      freshTab(); sayEl.textContent = "";
      LP.bumpUseCount("c-ln-solo", "en");
      await new Promise(r => setTimeout(r, 80));
      check("lanes.js", "863w3 a step to a card with no list, nothing learnt and nothing used says what comes next is chosen with Add a reply",
        () => eq([rowsIn(lanesBox.innerHTML), sayEl.textContent].join("|"), "0|What comes next is chosen with Add a reply."));
    } finally {
      LN.toggleLanes(false);
      globalThis.Date = RealDate; document.getElementById = hadById; P.pack.custom = hadCustom2;
      document.createElement = hadMake2; delete body.appendChild;
      if (hadContains2 === undefined) delete lanesBox.contains; else lanesBox.contains = hadContains2;
    }
    await new Promise(r => setTimeout(r, 20));
  } finally {
    LN.toggleLanes(false);
    ND.watchNextDock(null);
    T.watchTabPath(null);
    T.tabs.splice(0, T.tabs.length);
    AS.setCards(hadCards);
    hadHooks.forEach(([k, own, v]) => { if (own) H.hooks[k] = v; else delete H.hooks[k]; });
    if (hadAdd === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = hadAdd;
    if (hadDoc === undefined) delete globalThis.document; else globalThis.document = hadDoc;
    if (hadDoc !== undefined) Dom.grabDom();
  }
}

/* ------------------------------------------------------------------ the path's beads on each conversation tab
   Board 814, S5 (decisions 2026-10-01 10:34): a filled bead for each reply sent along the conversation's chain
   and an open one while replies wait; a tab with no chain shows none. The chain is the run at the path's end in
   which each reply follows the one before on its card's list or by what the desk learnt. Invented cards only;
   every global set here is put back. */
{
  const T = await import(MOD("tabs.js"));
  const H = await import(MOD("hooks.js"));
  const AS = await import(MOD("app-state.js"));
  const hadDoc = globalThis.document, hadAdd = globalThis.addEventListener;
  const STUBS = ["applyLangUI", "updateIntentPlaceholder", "drawPillsCore", "drawIntentRail", "render", "scheduleRailGeometry"];
  const hadHooks = STUBS.map(k => [k, Object.prototype.hasOwnProperty.call(H.hooks, k), H.hooks[k]]);
  const hadCards = AS.cards;
  const quiet = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
  globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    body: { classList: quiet }, documentElement: { style: { setProperty() {} }, classList: quiet } };
  if (typeof globalThis.addEventListener !== "function") globalThis.addEventListener = () => {};
  STUBS.forEach(k => { if (typeof H.hooks[k] !== "function") H.hooks[k] = () => {}; });
  const ND = await import(MOD("next-dock.js"));
  const LP = await import(MOD("list-pointer.js"));
  const ST = await import(MOD("storage.js"));
  const fs = await import("node:fs");
  const card = (id, next) => (next ? { id, c: "orders", en: "Body of " + id, t: "Title " + id, next: next.map(to => ({ to })) }
    : { id, c: "orders", en: "Body of " + id, t: "Title " + id });
  const pairs = new Set(["a>b", "b>c", "c>d", "d>e"]), linked = (a, b) => pairs.has(a + ">" + b);
  const said = b => (b ? b.sent + (b.more ? "+" : "") + (b.open ? "o" : "") : "none");
  check("next-dock.js", "814bd1 the beads are the linked run at the path's end, at most three and a lead-in past them, an open one while replies wait, and none for a lone reply with nothing waiting",
    () => eq([ND.chainBeads([], linked, true), ND.chainBeads(["a"], linked, false), ND.chainBeads(["a"], linked, true),
      ND.chainBeads(["x", "a", "b", "c"], linked, false), ND.chainBeads(["a", "b", "c", "d", "e"], linked, true),
      ND.chainBeads(["a", "b", "z"], linked, false), ND.chainBeads(["a", "b", "z"], linked, true), ND.chainBeads(["a", "b"], linked, false)]
      .map(said).join(","), "none,none,1o,3,3+o,none,1o,2"));
  try {
    AS.setCards([card("c-bd-p", ["c-bd-q"]), card("c-bd-q"), card("c-bd-r"), card("c-bd-s"), card("c-bd-t", ["c-bd-q"])]);
    T.tabs.splice(0, T.tabs.length);
    ST.ssSet(T.TAB_KEY, "null");
    T.initTabs();
    const fresh = () => { T.tabs.push({ id: "mc-bd" + T.tabs.length, pax: "" }); T.stepTab(1); };
    // Once r then s: not yet learnt, so q, r, s holds no chain; twice, and r to s is a link.
    LP.bumpUseCount("c-bd-r", "en"); LP.bumpUseCount("c-bd-s", "en");
    const once = said(ND.pathBeads(["c-bd-q", "c-bd-r", "c-bd-s"]));
    fresh(); LP.bumpUseCount("c-bd-r", "en"); LP.bumpUseCount("c-bd-s", "en");
    const twice = said(ND.pathBeads(["c-bd-q", "c-bd-r", "c-bd-s"]));
    fresh(); LP.bumpUseCount("c-bd-t", "en");
    const front = said(ND.tabBeadsOf(T.tabs.find(t => t.id === T.tabPathNow().tab)));
    check("next-dock.js", "814bd2 a reply on the last card's list or learnt after it twice extends the chain, once does not, and a tab whose last card offers replies opens a bead",
      () => eq([said(ND.pathBeads(["c-bd-p", "c-bd-q"])), once, twice, front, said(ND.pathBeads(["c-bd-q"])), said(ND.tabBeadsOf({ id: "x" }))].join(","),
        "2,none,2,1o,none,none"));
    await new Promise(r => setTimeout(r, 20));
  } finally {
    T.tabs.splice(0, T.tabs.length);
    AS.setCards(hadCards);
    hadHooks.forEach(([k, own, v]) => { if (own) H.hooks[k] = v; else delete H.hooks[k]; });
    if (hadAdd === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = hadAdd;
    if (hadDoc === undefined) delete globalThis.document; else globalThis.document = hadDoc;
  }
  check("tabs.js", "814bd3 the beads are drawn filled then open, after every redraw of the strip and every sync of the button, between a tab's name and its close button",
    () => {
      const tabs = fs.readFileSync(join(MODDIR, "tabs.js"), "utf8"), dock = fs.readFileSync(join(MODDIR, "next-dock.js"), "utf8");
      return eq([T.tabBeadsHtml({ sent: 2, more: true, open: true }), T.tabBeadsHtml(null),
        tabs.indexOf("function drawTabs(){ const r=drawTabsCore.apply(this,arguments); syncTabAccent(); syncTabBeads(); return r; }") > -1,
        tabs.indexOf('el.insertBefore(bd, el.querySelector(".tab-x"));') > -1,
        dock.indexOf("  syncTabBeads();\n  if(dockWatch) dockWatch(arrived===true);") > -1, dock.indexOf("setTabBeads(tabBeadsOf);") > -1].join("|"),
        '<i class="bd-more"></i><i class="bd"></i><i class="bd"></i><i class="bd bd-open"></i>||true|true|true|true');
    });
}

/* ------------------------------------------------------------------ card-chain.js, a list edited outside the editor
   Board 814, S5: the lanes edit the reply sent last's list in the agent's own layer, as the editor's Next fold
   does on a save that touched it (decisions 2026-10-01 09:40). Invented ids; nothing global is set. */
{
  const CH = await import(MOD("card-chain.js"));
  const to = ids => ids.map(x => ({ to: x }));
  const live = new Set(["c-ed-a", "c-ed-b", "c-ed-c", "c-ed-self"]);
  const base = { id: "c-ed-self", t: "Self", next: to(["c-ed-a", "c-ed-b"]) };
  const merged = ov => Object.assign({}, base, ov || {});
  const w = (card, b, ov, ids) => JSON.stringify(CH.nextListWrite(card, b, ov, ids, live));
  check("card-chain.js", "814ed1 a list changed outside the editor writes what the editor's fold writes on a touched save: an own card's whole live list, a catalog card's list and the ids it replaced beside every other field kept, and nothing once it is the catalog's again",
    () => {
      const own = { id: "u:ed", next: to(["c-ed-a", "c-ed-b"]) };
      const ov1 = { t: "Mine" }, ov2 = { t: "Mine", next: to(["c-ed-c"]), nextWas: ["c-ed-a"] }, ov3 = { next: to(["c-ed-b"]), nextWas: ["c-ed-a", "c-ed-b"] };
      const same = JSON.stringify({ override: Object.assign({ t: "Mine" }, CH.nextSaveFields(to(["c-ed-c", "c-ed-a"]), to(["c-ed-a", "c-ed-b"]), base, ov2, true)) });
      return eq([w(own, null, null, ["c-ed-b", "c-ed-a", "c-ed-gone", "u:ed"]), w(merged(ov1), base, ov1, ["c-ed-b", "c-ed-a"]),
        w(merged(ov2), base, ov2, ["c-ed-c", "c-ed-a"]) === same, w(merged(ov3), base, ov3, ["c-ed-a", "c-ed-b"]),
        w(merged(ov2), base, ov2, ["c-ed-a", "c-ed-b"])].join("|"),
        '{"own":[{"to":"c-ed-b"},{"to":"c-ed-a"}]}|{"override":{"t":"Mine","next":[{"to":"c-ed-b"},{"to":"c-ed-a"}],"nextWas":["c-ed-a","c-ed-b"]}}'
        + '|true|{"override":null}|{"override":{"t":"Mine"}}');
    });
}

/* ------------------------------------------------------------------ card-editor.js, the title the browser oracle types into
   tests/smoke.js reaches the card editor's title by a selector and types into it, for the walk-away Undo and for a
   saved edit (data-2). The editor's markup comes from the real openCardEditor on a stand-in document that keeps it;
   every selector smoke uses for the editor's inputs must reach the first language's title before anything else. An
   invented card only; every global set here is put back, and nothing below awaits, so no frame runs under it. */
{
  const Dom = await import(MOD("dom.js"));
  const AS = await import(MOD("app-state.js"));
  const CE = await import(MOD("card-editor.js"));
  const CM = await import(MOD("content-model.js"));
  const fs = await import("node:fs");
  const hadDoc = globalThis.document, hadCards = AS.cards;
  const quiet = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
  const stub = () => ({ hidden: true, style: {}, classList: quiet, dataset: {}, setAttribute() {}, getAttribute() { return null; },
    removeAttribute() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, contains() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }, appendChild() {}, focus() {}, getContext() { return {}; } });
  let drawn = "";
  const els = { "#modalCard": Object.defineProperty(stub(), "innerHTML", { get() { return drawn; }, set(v) { drawn = String(v); } }) };
  const smoke = fs.readFileSync(join(HERE, "smoke.js"), "utf8");
  /* Read in any quoting (double, single, none) and through a descendant step ('#modalCard .mf input[...]'), within one
     string literal; a qualifier such as .mf is treated as absent, which errs towards red. Comments are read too. */
  const sites = [...smoke.matchAll(/#modalCard[^'"`\n]*?\binput\[id\^=["']?([^"'\]]*)["']?\]/g)].map(m => m[1]);
  try {
    globalThis.document = { querySelector: s => els[s] || (els[s] = stub()), getElementById: id => els["#" + id] || null, querySelectorAll: () => [],
      createElement: () => stub(), createRange: () => stub(), addEventListener() {}, activeElement: null,
      body: { classList: quiet }, documentElement: { style: { setProperty() {} }, classList: quiet } };
    Dom.grabDom();
    AS.setCards([{ id: "c-ti-a", c: "gen", t: "Invented title", en: "Invented body" }, { id: "c-ti-b", c: "gen", t: "Second", en: "Two" }]);
    CE.openCardEditor("c-ti-a");
    const inputs = [...drawn.matchAll(/<input\b[^>]*>/g)].map(m => m[0]);
    const idOf = tag => (tag.match(/\bid="([^"]*)"/) || [])[1] || "";
    const reach = p => { const tag = inputs.find(x => idOf(x).indexOf(p) === 0) || "";
      return idOf(tag) + (/\btype="(?!text")/.test(tag) || /\shidden\b/.test(tag) ? " not a text field" : ""); };
    check("card-editor.js", "814st1 every selector by which tests/smoke.js types into the card editor reaches the first language's title, a visible text field, before any other input",
      () => eq([sites.length >= 3, [...new Set(sites.map(reach))].join(",")].join("|"), "true|me_t_" + CM.CONTENT_LANGS[0]));
  } finally {
    AS.setCards(hadCards);
    if (hadDoc === undefined) delete globalThis.document; else globalThis.document = hadDoc;
    if (hadDoc !== undefined) Dom.grabDom();
  }
}

/* ------------------------------------------------------------------ card-editor.js, the override's examples
   Beside each form of address the override shows what it writes for two placeholder customers. The oracle is fill():
   a card given that form and those boxes, filled for each customer, whose gender the desk reads from the name. The
   markup is the real openCardEditor's on a stand-in document; the live pass is the editor's own sync, which runs at
   open, here against boxes that say something other than the card. An invented card only; every global set is put back. */
{
  const Dom = await import(MOD("dom.js"));
  const AS = await import(MOD("app-state.js"));
  const CE = await import(MOD("card-editor.js"));
  const IT = await import(MOD("intent-text.js"));
  const CF = await import(MOD("card-fields.js"));
  const hadDoc = globalThis.document, hadCards = AS.cards;
  const quiet = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
  const stub = () => ({ hidden: true, style: {}, classList: quiet, dataset: {}, setAttribute() {}, getAttribute() { return null; },
    removeAttribute() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, contains() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }, appendChild() {}, focus() {}, getContext() { return {}; },
    value: "" });
  const DOT = " " + String.fromCharCode(0xb7) + " ", NAMES = ["Jan Nowak", "Kasia Nowak"];
  const ORDER = L => CF.PAX_ADDRESS_FORMS[L].filter(k => k !== "none").concat([""], CF.PAX_ADDRESS_FORMS[L].filter(k => k === "none"));
  const card = { id: "c-px-a", c: "gen", t: "Invented", en: "Hello, {PAX}.", pl: "Dzień dobry, {PAX}.", paxOwn: 1, firstOnly: 1, paxVoc: 1 };
  /* What the card itself says in L under form k with these boxes, for each customer, joined as the editor joins them. */
  const says = (L, k, b) => NAMES.map(n => { Dom.pax.value = n;
    return IT.fill("{PAX}", Object.assign({}, card, b, { [CF.PAX_ADDRESS_KEY[L]]: k }), false, L); }).filter(Boolean).join(DOT);
  /* Opens the editor with the two boxes on screen ticked or not, and returns its markup's examples and the live ones. */
  const open = (ticked) => {
    let drawn = "";
    const live = ["pl", "en"].flatMap(L => ORDER(L).map(k => ({ dataset: { l: L, k }, textContent: "unset" })));
    const els = { "#modalCard": Object.defineProperty(stub(), "innerHTML", { get() { return drawn; }, set(v) { drawn = String(v); } }),
      "#meFirst": Object.assign(stub(), { checked: ticked }), "#meVoc": Object.assign(stub(), { checked: ticked }), "#pax": { value: "" } };
    globalThis.document = { querySelector: s => els[s] || (els[s] = stub()), getElementById: id => els["#" + id] || null,
      querySelectorAll: s => s === "#meOwnBody .mf-ex" ? live : [],
      createElement: () => stub(), createRange: () => stub(), addEventListener() {}, activeElement: null,
      body: { classList: quiet }, documentElement: { style: { setProperty() {} }, classList: quiet } };
    Dom.grabDom();
    CE.openCardEditor("c-px-a");
    const marked = {};
    [...drawn.matchAll(/<span class="mf-ex"[^>]*data-l="([a-z]+)" data-k="([A-Za-z]*)">([^<]*)<\/span>/g)].forEach(m => { marked[m[1] + ":" + m[2]] = m[3]; });
    return { drawn, marked, live: Object.fromEntries(live.map(e => [e.dataset.l + ":" + e.dataset.k, e.textContent])) };
  };
  try {
    AS.setCards([card]);
    /* Read once, inside the first check, so a throw is a red leg rather than the end of the file. */
    let got = null;
    const run = () => { if (got) return got;
      const want = b => Object.fromEntries(["pl", "en"].flatMap(L => ORDER(L).map(k => [L + ":" + k, says(L, k, b)])));
      return (got = { off: open(false), on: open(true), ticked: want({ firstOnly: 1, paxVoc: 1 }), unticked: want({ firstOnly: 0, paxVoc: 0 }) }); };
    const R = run;
    check("card-editor.js", "1007pl1 each form of the override is drawn beside what the card then says for Jan Nowak and Kasia Nowak, in both languages",
      () => eq(JSON.stringify(R().off.marked), JSON.stringify(R().ticked)));
    check("card-editor.js", "1007pl2 the words are fill()'s own: the titled forms follow each name's gender, the name is declined, no name writes nothing",
      () => { const w = R().ticked;
        return eq([w["pl:titleFirst"], w["pl:titleSurname"], w["pl:"], w["pl:none"], w["en:titleSurname"], w["en:"]].join("|"),
          ["Panie Janie", "Pani Kasiu"].join(DOT) + "|" + ["Panie Nowak", "Pani Nowak"].join(DOT) + "|" + ["Janie", "Kasiu"].join(DOT)
          + "||" + ["Mr Nowak", "Ms Nowak"].join(DOT) + "|" + ["Jan", "Kasia"].join(DOT)); });
    check("card-editor.js", "1007pl3 the examples follow the two boxes as they stand on screen, not as the card was saved",
      () => eq(JSON.stringify(R().off.live), JSON.stringify(R().unticked)));
    check("card-editor.js", "1007pl4 CONTROL: with the boxes as the card holds them, the live pass writes what the markup drew, and the two box states differ",
      () => eq([JSON.stringify(R().on.live) === JSON.stringify(R().on.marked), JSON.stringify(R().ticked) !== JSON.stringify(R().unticked)].join(","), "true,true"));
    /* The flags fill column-first over four rows, the pin and the override each two tall, so this order is the
       ruled arrangement; the forms must follow the override's row, or .mf-own.on+.mf-own-body never shows them. */
    check("card-editor.js", "1007pl5 the flags are drawn alternatives, steps and the pin, then the two intent boxes and the override last, its forms straight after it",
      () => { const h = R().on.drawn, at = id => h.indexOf('id="' + id + '"');
        const ids = ["meAlt", "meSeq", "meLockRow", "meAllIntents", "meIntentTop", "meOwnRow", "meOwnBody"].map(at);
        const re = /<\/?div\b/g; re.lastIndex = h.lastIndexOf("<div", at("meOwnRow")); let d = 0, m, end = -1;
        while ((m = re.exec(h))) { d += m[0] === "<div" ? 1 : -1; if (!d) { end = h.indexOf(">", m.index) + 1; break; } }
        return eq([ids.every((v, i) => v > -1 && (!i || v > ids[i - 1])), h.startsWith('<div class="mf-own-body"', end)].join(","), "true,true"); });
  } finally {
    AS.setCards(hadCards);
    if (hadDoc === undefined) delete globalThis.document; else globalThis.document = hadDoc;
    if (hadDoc !== undefined) Dom.grabDom();
  }
}

/* ------------------------------------------------------------------ card-margin.js, the card editor's margin
   The fields read as chips and the two things a desk can check alone (Claudette's words of 2026-10-07, section C).
   The oracles: fill() in intent-text.js for which fields are filled, read as text; an unescape written here for the
   mirror; the promises of the words for the findings. Invented text only. */
{
  const MG = await import(MOD("card-margin.js"));
  const fs = await import("node:fs");
  const fillSrc = fs.readFileSync(join(MODDIR, "intent-text.js"), "utf8");
  const body = fillSrc.slice(fillSrc.indexOf("function fill("), fillSrc.indexOf("function escFilled("));
  const zLine = (fillSrc.match(/const Z_TOKEN=.*$/m) || [""])[0];
  const bare = [...new Set([...(body + zLine).matchAll(/\\\{([A-Z]+)\\\}/g)].map(m => m[1]))].sort().join(",");
  const inline = (fillSrc.match(/const VAR_INLINE_BUILTIN=\/\^\(([A-Z|]+)\)\$\//) || ["", ""])[1].split("|");
  const args = [...new Set(inline.concat([...body.matchAll(/\\\{([A-Z]+):/g)].map(m => m[1])))].sort().join(",");
  check("card-margin.js", "1007mg1 the margin knows exactly the fields fill() writes, bare and with words of their own",
    () => eq([MG.MARGIN_BARE.slice().sort().join(","), MG.MARGIN_ARGS.slice().sort().join(",")].join("|"),
      [bare, args].join("|")));

  const ZW = String.fromCharCode(0x200b);
  const plain = html => html.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const known = MG.marginKnown({ list: [{ name: "CITY" }] });
  const texts = ["", "{GREET}, <b>&amp;</b> {PAX}. \"quoted\" 'it'", "{{PAX}} {PAX {PAXX} {CITY}\n", "line one\n\nline three {X}"];
  check("card-margin.js", "1007mg2 the mirror holds the box's text character for character, a closing line kept open",
    () => eq(texts.map(s => plain(MG.marginHtml(s, known)) === s + ((s === "" || s.endsWith("\n")) ? ZW : "")).join(","),
      "true,true,true,true"));
  check("card-margin.js", "1007mg3 a field the catalog fills is a chip, a catalog's own included, and nothing else is",
    () => eq([...MG.marginHtml("{GREET}, {PAX} {PAXX} {CITY} {city}", known).matchAll(/class="me-chip"[^>]*>(.*?)<\/span><\/span>/g)]
      .map(m => plain(m[1])).join("|"), "{GREET}|{PAX}|{CITY}"));

  const fieldsOf = fs2 => fs2.map(f => f.kind === "field" ? f.raw + ">" + (f.sug || "-") : "lang:" + f.l).join(" ");
  const one = (text, base, more) => MG.marginFindings(Object.assign({ text, base, others: [], known }, more || {}));
  check("card-margin.js", "1007mg4 a field the catalog does not fill is found, with a near field only where exactly one is near",
    () => eq([
      fieldsOf(one("Hi {PAXX}, {GRET} and {pax}.", "Hi {PAX}.")),
      fieldsOf(one("{X} and {ORDERREF}", "")),
      fieldsOf(MG.marginFindings({ text: "{PAZ}", base: "", others: [], known: MG.marginKnown({ list: [{ name: "PAY" }] }) })),
      fieldsOf(one("Mine: {ORDERREF}", "The catalog's: {ORDERREF}")),
      fieldsOf(one("{GENDR:a|b} {PXA} {DYPRT:a|b} {GRT}", "")),
    ].join(" / "), "{PAXX}>{PAX} {GRET}>{GREET} {pax}>{PAX} / {X}>- {ORDERREF}>- / {PAZ}>- /  / {GENDR:a|b}>- {PXA}>{PAX} {DYPRT:a|b}>{DAYPART:a|b} {GRT}>-"));
  const pl = (text, base) => ({ l: "pl", text, base });
  check("card-margin.js", "1007mg5 one language edited and the other not, measured against the catalog's card",
    () => eq([
      fieldsOf(one("Edited.", "Catalog.", { others: [pl("Katalog.", "Katalog.")] })),
      fieldsOf(one("Edited.", "Catalog.", { others: [pl("Zmienione.", "Katalog.")] })),
      fieldsOf(one("Edited.", "Catalog.", { others: [pl("", "")] })),
      fieldsOf(one("Edited.", null, { others: [pl("Katalog.", "Katalog.")] })),
      fieldsOf(one("Catalog.", "Catalog.", { others: [pl("Zmienione.", "Katalog.")] })),
      fieldsOf(one("Cata\nlog.", "Cata\r\nlog.", { others: [pl("Katalog.", "Katalog.")] })),
    ].join(" / "), "lang:pl" + " / ".repeat(5)));
  check("card-margin.js", "1007mg6 Leave it as it is silences a finding while what it is about stays as it was",
    () => {
      const silenced = { fields: { "{PAXX}": 1 }, langs: { pl: "Katalog." } };
      return eq([
        fieldsOf(one("Hi {PAXX}.", "", { silenced })),
        fieldsOf(one("Hi {PAXX} and {PAXX}.", "", { silenced })),
        fieldsOf(one("Edited.", "Catalog.", { silenced, others: [pl("Katalog.", "Katalog.")] })),
      ].join(" / "), " / {PAXX}>{PAX} {PAXX}>{PAX} / ");
    });
  check("card-margin.js", "1007mg7 Change it replaces that one occurrence and nothing else",
    () => {
      const text = "a {PAXX} b {PAXX}", f = one(text, "")[1];
      return eq(MG.marginReplace(text, f, f.sug), "a {PAXX} b {PAX}");
    });
  check("card-margin.js", "1007mg8 the bubble speaks Claudette's words in both languages, a tab named by its label in straight quotes",
    () => {
      const f = { kind: "lang", l: "pl" }, g = { kind: "field", raw: "{PAXX}", sug: "{PAX}" };
      const en = [MG.marginHeading(f), MG.marginHeading(g)].join(" | ");
      const had = UILANG_STORE.lsGet("eUiLang");
      UILANG_STORE.lsSet("eUiLang", "pl");
      let pl2 = "";
      try { pl2 = [MG.marginHeading(f), MG.marginHeading(g)].join(" | "); }
      finally { if (had == null) UILANG_STORE.lsDel("eUiLang"); else UILANG_STORE.lsSet("eUiLang", had); }
      return eq(en + " || " + pl2, '"Polski" still has the earlier text | Perhaps {PAX}, the customer\'s name?'
        + ' || W zakładce "Polski" jest jeszcze dawny tekst | Może chodzi o {PAX}, czyli imię klienta?');
    });
  check("card-margin.js", "1007mg11 a catalog's variable named like a place in the sentence is shown as typed: the heading and the bubble fill each place once, in both languages",
    () => {
      const own = n => MG.marginKnown({ list: [{ name: n }] });
      const g = n => ({ kind: "field", raw: "{" + n.slice(0, -1) + "}", sug: "{" + n + "}" });
      const say = n => [MG.marginHeading(g(n), own(n)), plain(MG.marginBubbleHtml(g(n), 1, 1, own(n)).split("</h3>")[0])].join(" ; ");
      const en = [say("WHAT"), say("CITY")].join(" | ");
      const had = UILANG_STORE.lsGet("eUiLang");
      UILANG_STORE.lsSet("eUiLang", "pl");
      let pl2 = "";
      try { pl2 = say("WHAT"); }
      finally { if (had == null) UILANG_STORE.lsDel("eUiLang"); else UILANG_STORE.lsSet("eUiLang", had); }
      return eq(en + " || " + pl2, "Perhaps {WHAT}, filled by this catalog? ; Perhaps {WHAT}, filled by this catalog? | Perhaps {CITY}, filled by this catalog? ; Perhaps {CITY}, filled by this catalog?"
        + " || Może chodzi o {WHAT}, czyli wypełnia je katalog? ; Może chodzi o {WHAT}, czyli wypełnia je katalog?");
    });
  check("card-margin.js", "1007mg10 two slips in the same words are two findings, each still itself after an edit before it, so F8 walks on",
    () => {
      const [a, b] = one("{PAXX} and {PAXX}", ""), [, b2] = one("Hi, {PAXX} and {PAXX}", "");
      return eq([MG.marginSame(a, b), MG.marginSame(b, b2), MG.marginSame(a, b2)].join(","), "false,true,false");
    });
  const ed = fs.readFileSync(join(MODDIR, "card-editor.js"), "utf8");
  check("card-margin.js", "1007mg9 the card editor's Macro box carries the mirror, hidden from the ear and the translation sweep, and wires the margin",
    () => eq([/<div class="me-macro"><textarea id="'\+id\("body"\)\+'"[^\n]*\n[^\n]*<\/textarea><div class="me-mirror" aria-hidden="true" data-i18n-skip><\/div><\/div>/.test(ed),
      /^[ \t]*wireCardMargin\(base\);[ \t]*$/m.test(ed)].join(","), "true,true"));
}

/* NOT cardBodyHtml(). It reads the PAX box off the document through fill(), so it cannot be
   called without one: it is the browser oracle's, and tests/smoke.js has it. card-body.js is
   called above only for its intent strip, which reads no document. */

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
/* CAPPED AT 63, ballot 4 of the fourth meeting (2026-09-23): an exit code is read modulo 256 by
   bash and by Linux, so a count used as one read 256 failures as success. 63 keeps a small count
   readable and stays below 78, which is NO VERDICT here. */
process.exit(Math.min(fail, 63));
