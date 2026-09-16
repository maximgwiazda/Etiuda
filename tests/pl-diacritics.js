/* A dropped Polish diacritic, which nothing else in the harness can see. Board item 386.
 *
 *   node tests/pl-diacritics.js            the self-tests, then src/ and shell/
 *   node tests/pl-diacritics.js --census   and the list's drift against the tree, in full
 *
 * WHY IT EXISTS. On 2026-09-15 Maxim read "Zamknij Etiude" on the refusal page where "Zamknij
 * Etiude" with an ogonek was meant. Nothing went red: the string is well formed, the pair is
 * present, i18n-scan counts it as covered, and the engine renders it. A missing tail is not a
 * missing string, and every instrument we had was counting strings.
 *
 * THE RULE, and it is narrow on purpose. A word whose ONLY Polish spelling carries a diacritic is
 * refused when it appears without one. "etiude" is refused because the interface spells that word
 * "Etiude" with an ogonek and no Polish word is spelt the bare way; "intencja" is NOT refused,
 * because it is a word in its own right beside "intencja" with a tail, and a rule that cannot
 * tell those apart is a rule that reddens honest Polish.
 *
 * WHERE THE LIST COMES FROM. The interface's own Polish: the right-hand side of every "en":"pl"
 * pair in src/, and every line of shell/ carrying a Polish letter, read once on 2026-09-15 and
 * frozen below. 775 strings gave 396 folds under four cuts:
 *
 *   - at least three letters, so a fold like "az" or "ze" cannot stand for a whole word
 *   - exactly one diacritic spelling in the interface, so "wlasna" is out: both "wlasna" and
 *     "wlasna" with a tail on the last vowel are written, and which is meant is grammar
 *   - the bare spelling occurs NOWHERE in src/ or shell/ today, which drops 27 including
 *     "karta", "nazwa", "intencje", "stale" and "male", every one of them a real word here
 *   - not from src/modules/polish.js, whose Polish is people's NAMES: "Michal" without the
 *     stroke is how a keyboard without Polish writes a real person's name, and refusing it
 *     would be this instrument telling somebody their name is a typo
 *
 * WHY THE LIST IS FROZEN AND NOT COMPUTED. The obvious design computes those cuts at run time
 * from the tree. It is blind to the one fault it exists to catch, and the blindness is exact: the
 * bare spelling appearing in the tree is what the fourth cut excludes, and a seat writing
 * "Zamknij Etiude" is the bare spelling appearing in the tree. The list would drop "etiude" in
 * the same pass that was meant to catch it. MEASURED, not argued: over a two-file tree holding
 * this repository's own shell/main.js with the ogonek taken off that label, the frozen list finds
 * it at main.js:726 and exits 1, and a copy of this file computing the same four cuts at run time
 * over the same tree reports 0 words and passes. Its list was three folds LONGER and "etiude" was
 * not one of them.
 *
 * So the list is data, and it goes stale in the safe direction: a new Polish word is not guarded
 * until somebody adds it. The census line every run prints says how far behind it is, and
 * --census names the words, so the staleness is visible rather than silent.
 *
 * WHAT IT READS. Every .js, .mjs, .css and .html under src/ and shell/, whole - not only string
 * literals. A Polish comment can drop a tail as easily as a label, this needs no parser, and by
 * construction the list has no hit anywhere in the tree today, so there is nothing to be noisy
 * about. HTML entities and JavaScript escapes are decoded first, because "Etiud&#281;" is the
 * spelling the refusal page actually uses and it is correct.
 *
 * Exit code is the number of failures, self-tests included.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const E = require("./engine.js");

const CENSUS = process.argv.indexOf("--census") > -1;
let fails = 0, cases = 0;
const ok = (good, what) => { cases++; console.log((good ? "  ok   " : "  FAIL ") + what); if (!good) fails++; };

/* ---- the letters, and folding one away ------------------------------------------------------ */

const LOWER = "ąćęłńóśźż";   /* a c e l n o s z z */
const UPPER = "ĄĆĘŁŃÓŚŹŻ";
const FOLD = { "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n",
               "ó": "o", "ś": "s", "ź": "z", "ż": "z" };
const WORD = new RegExp("[A-Za-z" + LOWER + UPPER + "]+", "g");
const HAS_DIACRITIC = new RegExp("[" + LOWER + UPPER + "]");
function fold(word) { return word.toLowerCase().replace(/./g, c => FOLD[c] || c); }

/* A LABEL WRITTEN AS AN ESCAPE IS STILL THE WORD IT SPELLS. shell/main.js writes the close link
   as "Etiud&#281;" because that document is assembled in a string, and an engine module may write
   "ę" for the same reason. Decoded before anything is tokenised, or this instrument reads
   "Etiud" followed by punctuation and calls a correct spelling a fault. */
function decode(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (m, h) => String.fromCodePoint(parseInt(h, 16)));
}

/* ---- the list ------------------------------------------------------------------------------- */

/* 396 folds. Every one of them is a word the interface spells with a diacritic and spells no
   other way, and not one of them occurs bare anywhere in src/ or shell/, measured 2026-09-15 by
   the four cuts in the header. To retire one, delete it here and say in the commit message which
   word made the bare spelling legitimate. To add the Polish of a new feature, run --census: it
   prints the words in the tree that this list does not guard. */
const REFUSED = new Set([
  "agentow angielska bedzie bezplatnie blekitu blokuja byc cala calkowicie calosc chipow chowac",
  "chowal czolo czynnosc czysci dokladnie dol domyslne domyslny dostepnych dowolna druga duzo",
  "dwoch dziala dziela edytowac etiude faktow filtrowac filtruja glowne glownych gora gore",
  "gorze grupe gwiazdke ida ikone imie inicjalami inicjaly inna istotna jednoczesnie jesli",
  "jezyk jezykach jezyki jezyku juz karte katalogow kazda kazde kazdej kazdy klikniecie",
  "kliknieciu kogos kolejna kolejnosc kolko kombinacje kompilacje koncu kontynuowac kopie",
  "kopiuja krawedz krotka krotki ktora ktore ktorego ktorej ktory ktorym laduje lewa lezacy",
  "lezy liste maja miedzy miesci moga mogla mowi mowia moze mozesz mozna nacisniecie nacisnij",
  "naglowek naglowkiem naglowku najedz najwezsza nakladka nakladke naleza nalezy narzedzi",
  "narzedzia nastepne nastepnej nastepnie nastepny nazwe niedostepne niektore nieobslugiwane",
  "niepowiazane nietkniete nietkniety niezaleznie niz notatke obrebie obserwowac obwodek",
  "obwodka obwodki odczytac odklada odkladanie odlacz odlaczyc odloz odlozenie odlozona",
  "odnosnik odnosniki odrzuc odrzucac odrzucic okolo okresla olowek omijajac oplat oplaty",
  "oproznione opuscic oryginal otwieraja otwierajaca otworz oznaczaja pamiec pamieci pamieta",
  "pasujace pasujacych pelne pelni pelny pierwotna plaskie poczatek podaza podazaja podejrzec",
  "podpisuja podswietlenia pojawiac pojawial pokaz pokazac pokazesz pokazywac pokretla",
  "pomijajac pomin pominac poniewaz ponizej porzadkuje powiazane powiazania powiazanie",
  "powiazanymi powiodl powstaly powtorzone powyzej pozostaja pozostale pozostalymi pozostana",
  "pozwol prog przechodza przeciagac przeciagaj przeciaganie przeciagnij przegladarce",
  "przegladarka przegladarki przejscia przelacz przelacza przelacznik przelacznika przelaczniki",
  "przelacznikiem przelaczyc przeladuje przenies przeniesc przestan przesuniecia przetrwaja",
  "przewin przyciskow przyklad przykladowy przywroc przywrocenia przywroci przywrocic",
  "przywrocona przywrocone przywrocono recznie rezerwujacy rozmowe rozwin rozwiniete rozwiniety",
  "rzad rzedy schowac sie skad skopiowac skrot skrotow skroty skryptow slowa spadaja sprawdz",
  "sprawiaja srodku srodowisku staja stala staly stamtad startowac strzalki swieci szarzeja",
  "szerokosc szerokosci szerokoscia takze tez tlo trafnosci tresc tresci twoj tytul udalo uklad",
  "uklada ukladaja ukladu ukryc ukrywaja uporzadkowanym uruchomic ustalona ustawien usun usunac",
  "usunieta usuniete usunieto usuniety utworz utworzyc uzyc uzyj uzyta uzytek uzytku uzywa",
  "waska waskich waskie waskim watpliwosci wczesniejsze wczesniejszej wczytac wedlug wersje",
  "wewnatrz wewnetrzne wewnetrzny wewnetrznych widza widziec wiec wiecej wlaczone wlasciciel",
  "wlasne wlasnie wlasny wlasnym wnetrza wolacz wolaczu wracaja wroci wrocisz wskaznik",
  "wskazowka wspierajacej wspolna wspolne wspominaja wybor wybrac wybrana wyczysc wyczyscic",
  "wyeksportowac wyglad wygladajacy wyjsc wyjsciowego wykonawce wyl wylacz wylacza wylacznie",
  "wylaczone wylaczony wypelnia wypelniaja wyrazenie wyroznia wyswietlanie wysylana zablokowala",
  "zachowac zachowuja zaden zadnej zakoncz zamknac zamkniecia zamkniete zamknieto zapamietany",
  "zapelniona zapisac zastapi zastepuje zastosowac zawieraja zaznaczona zbudowac zerknac",
  "zintegrowana zlota zmien zmieniac zmienic zmienil zmiesci znow zobaczyc zostaja zostal",
  "zostalo zostana zrodla zwezania zwijac zwijal zwin zwiniete zwykla zwykle zywo",
].join(" ").split(/\s+/).filter(Boolean));

/* ---- the scan ------------------------------------------------------------------------------- */

/* Every hit, and the spelling the tree itself uses where it has one, so a failure says what to
   write rather than only what is wrong. */
function scan(text, where, spellings) {
  const out = [];
  const lines = decode(text).split(/\r?\n/);
  lines.forEach((line, i) => {
    let m;
    WORD.lastIndex = 0;
    while ((m = WORD.exec(line))) {
      const w = m[0];
      if (HAS_DIACRITIC.test(w)) {
        if (spellings) {
          const k = fold(w);
          if (!spellings.has(k)) spellings.set(k, new Set());
          spellings.get(k).add(w);
        }
        continue;
      }
      const k = w.toLowerCase();
      if (REFUSED.has(k)) out.push({ where: where, line: i + 1, word: w, fold: k });
    }
  });
  return out;
}

function sourceFiles() {
  const out = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(js|mjs|css|html)$/.test(name)) out.push(p);
    }
  })(path.join(E.ROOT, "src"));
  (function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(js|mjs|css|html)$/.test(name)) out.push(p);
    }
  })(path.join(E.ROOT, "shell"));
  return out;
}

/* ---- the self-tests, which are what make the scan above worth reading ----------------------- */

console.log("\n[1/2] the rule, on text written to fail it");

/* THE CONTROL, and the case this instrument was written for. If this one ever passes, the list is
   empty or the fold is broken, and the scan below would be green over anything. */
const bad = scan('  "Close Etiuda":"Zamknij Etiude",', "a case");
ok(bad.length === 1 && bad[0].fold === "etiude",
   "the fault itself is refused: " + JSON.stringify("Zamknij Etiude") + " gives "
   + bad.length + " hit(s), " + JSON.stringify(bad.map(h => h.word).join(",")));

const good = scan('  "Close Etiuda":"Zamknij Etiudę",', "a case");
ok(good.length === 0,
   "and the correct spelling is not: the same line with the ogonek gives " + good.length + " hit(s)");

const entity = scan("Close Etiuda &middot; Zamknij Etiud&#281;", "a case");
ok(entity.length === 0,
   "an HTML entity is decoded before it is read, which is how shell/main.js writes that label: "
   + entity.length + " hit(s)");

/* The backslash is built rather than written, and the case asserts it is there: an editor or a
   tool that quietly turned this line's escape into the letter it spells would leave a case that
   passes having tested the line above it twice. */
const ESCAPED_TEXT = '"Zamknij Etiud' + String.fromCharCode(92) + 'u0119"';
const escaped = scan(ESCAPED_TEXT, "a case");
ok(escaped.length === 0 && ESCAPED_TEXT.indexOf(String.fromCharCode(92)) > -1
   && !HAS_DIACRITIC.test(ESCAPED_TEXT),
   "and so is a JavaScript escape, in text that really does hold a backslash and no Polish letter: "
   + escaped.length + " hit(s)");

const shouty = scan("ZAMKNIJ ETIUDE", "a case");
ok(shouty.length === 1, "case is folded away, so a shouted label is refused too: " + shouty.length + " hit(s)");

const inside = scan("etiudeczka etiudes", "a case");
ok(inside.length === 0,
   "a refused fold INSIDE a longer word is not a hit, because the rule is about words: "
   + inside.length + " hit(s)");

const second = scan("Wylacz podswietlenia", "a case");
ok(second.length === 2 && second[0].fold === "wylacz" && second[1].fold === "podswietlenia",
   "two words in one line are two hits, and the control is not the only entry that fires: "
   + JSON.stringify(second.map(h => h.word)));

/* THE RULE'S OWN BOUNDARY, written down as a case so that widening it is a deliberate act. */
const ambiguous = scan("intencja karta nazwa stale male", "a case");
ok(ambiguous.length === 0,
   "a bare spelling that is a word in its own right is NOT refused: " + ambiguous.length
   + " hit(s) over five of the 27 the list drops for that reason");

const english = scan("Close Etiuda. The list of scripts it is allowed to run.", "a case");
ok(english.length === 0, "and English is not Polish with the tails missing: " + english.length + " hit(s)");

ok(REFUSED.size > 300,
   "the list is not empty, which is the one way this whole file goes green having read nothing: "
   + REFUSED.size + " folds");

/* ---- and the tree --------------------------------------------------------------------------- */

console.log("\n[2/2] src/ and shell/");

const spellings = new Map();
const files = sourceFiles();
let hits = [], bytes = 0;
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  bytes += text.length;
  hits = hits.concat(scan(text, path.relative(E.ROOT, f).split(path.sep).join("/"), spellings));
}
for (const h of hits) {
  const said = spellings.get(h.fold);
  console.log("       " + h.where + ":" + h.line + "  " + JSON.stringify(h.word)
    + (said ? "  - the interface spells this word " + JSON.stringify([...said].join(" / ")) : "")
    + "  (the fold is " + h.fold + ")");
}
ok(hits.length === 0,
   hits.length + " word(s) in " + files.length + " file(s) of src/ and shell/ are spelt the bare"
   + " way where the only Polish spelling carries a diacritic, over " + bytes + " characters"
   + " with entities and escapes decoded");

/* THE CENSUS, so the list's staleness is a number in every run rather than a thing nobody looks
   at. A word form in the tree that the list does not guard is not a fault; it is coverage this
   file does not yet have, and the day somebody wonders why a typo got through, this is the line
   that answers. */
const guarded = [...spellings.keys()].filter(k => REFUSED.has(k));
const unguarded = [...spellings.keys()].filter(k => !REFUSED.has(k)).sort();
console.log("       census: " + spellings.size + " distinct word forms carrying a Polish diacritic"
  + " in src/ and shell/ today, " + guarded.length + " of them guarded by this list of "
  + REFUSED.size + ", " + unguarded.length + " not"
  + (CENSUS ? ":\n       " + unguarded.join(" ") : " (--census names them)"));

/* Board item 442: the run's own numbers, named, for tools/gate-run.mjs to record. Printed by
   the gate rather than parsed out of its prose, so a wording change cannot move a count, and
   printed BEFORE the last line, which by convention here leads with the verdict. */
console.log("#counts cases=" + cases + " fails=" + fails + " forms=" + spellings.size
  + " guarded=" + guarded.length + " unguarded=" + unguarded.length + " list=" + REFUSED.size);
console.log("\n  " + (cases - fails) + "/" + cases + " cases passed"
  + (fails ? " - " + fails + " FAILED" : ""));
process.exitCode = fails;
