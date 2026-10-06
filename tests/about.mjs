/* The About, as the program ships it: engine/etiuda.html's own app script run in a vm, its About
 * opened over a stand-in of the dialog, every screen read back as text in both languages.
 *
 *   node tests/about.mjs           exit code is the number of failed checks, capped at 63
 *
 * THE ORACLES. The words are the copywriter's draft, rows 1 to 17 and E1 to E5, copied into this
 * file by hand, so a change to a string on the screen is a difference here and not a new truth.
 * The date is formatted here from month tables of this file's own, never through Intl. The
 * agreement is read from shell/license_en.txt and shell/license_pl.txt, the installer's files. The
 * vm has no fetch, no XMLHttpRequest and no WebSocket, so a screen that reached for the network
 * would throw rather than show the text. How anything LOOKS is Maxim's to judge on the desk.
 *
 * THE ARTEFACT, NOT src/: the date is stamped and the agreement written in by tools/build.mjs, so
 * only the built page can show them. A stale artefact is tests/build-fresh.mjs's to catch.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/* The floor: every check below runs, or the file says it did not complete. */
const EXPECTED = 24;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* ---- the draft's rows, both languages ------------------------------------------------------ */
const ROWS = {
  en: {
    name: "Etiuda", x: "Close",
    cap: "the version on this computer", built: "Built on {DATE}",
    head: "New in this version",
    items: [
      ["The team's catalog in editions.", "When the catalog changes, the desk offers the new edition and shows, card by card, what changed, before anything is loaded."],
      ["Signed by the team's lead.", "A desk that joins a team keeps its lead's key and checks every later edition against it, and a file changed after signing never goes unnoticed."],
      ["The conversation's path.", "Space turns from the cards to the conversation in front: the replies it has sent and those that can follow. Space again brings the cards back."],
      ["Next replies on {KEY1} to {KEY4}.", "After each reply sent, up to four that can follow wait one key each: the catalog's own first, then those this desk has learnt."],
    ],
    licTitle: "Etiuda End-User Licence Agreement",
    terms: ["Free for your own affairs; at work, each person has a subscription of their own.",
            "At work, each person has a subscription of their own."],
    licButton: "Read the licence",
    credit: "\u00a9 2026 Maxim Gwiazda. Etiuda is a trademark of Maxim Gwiazda.",
    maker: "Made by Stardust.",
    earlier: "Earlier versions of Etiuda", close: "Close",
    e2: "{VERSION}, built on {DATE}",
    e4: ["Up to 1.16.7.", "Etiuda as a single file, opened in a web browser, under the MIT licence. The last of them, 1.16.7, still opens at etiuda.dev/v1."],
    back: "Back",
    reserve: "A program of its own.",
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  },
  pl: {
    name: "Etiuda", x: "Zamknij",
    cap: "wersja na tym komputerze", built: "z {DATE}",
    head: "Co nowego w tej wersji",
    items: [
      ["Nowe wydania katalogu.", "Gdy pojawi się nowe wydanie katalogu zespołu, stanowisko je proponuje i jeszcze przed wczytaniem pokazuje, karta po karcie, co się zmieniło."],
      ["Podpis lidera zespołu.", "Stanowisko, które dołącza do zespołu, zapamiętuje klucz lidera i według niego sprawdza każde kolejne wydanie, więc plik zmieniony po podpisaniu nie przejdzie niezauważony."],
      ["Ścieżka rozmowy.", "Spacja przenosi od kart do bieżącej rozmowy: widać, co już w niej wysłano i co może nastąpić dalej. Ponowna spacja wraca do kart."],
      ["Kolejne odpowiedzi pod {KEY1} do {KEY4}.", "Po każdej wysłanej odpowiedzi czekają do czterech następnych, każda pod własnym klawiszem: najpierw te z katalogu, potem te z praktyki tego stanowiska."],
    ],
    licTitle: "Umowa licencyjna Etiudy",
    terms: ["Do własnych spraw bezpłatnie; w pracy każda osoba ma własną subskrypcję.",
            "W pracy każda osoba ma własną subskrypcję."],
    licButton: "Przeczytaj umowę",
    credit: "\u00a9 2026 Maxim Gwiazda. Etiuda jest znakiem towarowym Maxima Gwiazdy.",
    maker: "Etiuda. Tworzy ją Stardust.",
    earlier: "Poprzednie wersje Etiudy", close: "Zamknij",
    e2: "{VERSION}, z {DATE}",
    e4: ["Do wersji 1.16.7.", "Etiuda w jednym pliku, otwierana w przeglądarce, na licencji MIT. Ostatnia z nich, 1.16.7, wciąż otwiera się pod adresem etiuda.dev/v1."],
    back: "Wróć",
    reserve: "Osobny program.",
    months: ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"],
  },
};
const dayOf = (iso, lang) => {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(iso || ""));
  return m ? (+m[3]) + " " + ROWS[lang].months[+m[2] - 1] + " " + m[1] : null;
};

/* ---- the program, loaded ------------------------------------------------------------------- */
const HTML = fs.readFileSync(path.join(ROOT, "engine", "etiuda.html"), "utf8");
const scripts = [];
{ const re = /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(HTML)) !== null) if (!/application\/json/i.test(m[1])) scripts.push(m[2]); }
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, setTimeout, clearTimeout, setInterval, clearInterval,
  navigator: { language: "en-US", languages: ["en-US"] }, addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  innerWidth: 1280, innerHeight: 800 };
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
let loaded = "";
try { vm.runInContext(scripts[scripts.length - 1], ctx, { filename: "engine/etiuda.html" }); }
catch (e) { loaded = String(e && e.message || e); }

/* ---- a stand-in of the dialog: the card keeps its markup as text, an id in it is an element -- */
class Stub {
  constructor(id) { this.id = id; this.attrs = {}; this.onclick = null; this.style = {}; this.hidden = false; this.disabled = false;
    this.classList = { add() {}, remove() {}, contains: () => false, toggle() {} }; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; } hasAttribute(k) { return k in this.attrs; }
  focus() { DOC.activeElement = this; } blur() {} querySelector() { return null; } querySelectorAll() { return []; }
  contains() { return false; } closest() { return null; } addEventListener() {} removeEventListener() {}
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
}
const card = new Stub("modalCard");
card.nodeType = 1; card.children = []; card.childNodes = []; card.firstChild = null; card.firstElementChild = null;
card.textContent = ""; card.className = "modal-card";
let markup = "", ids = {};
Object.defineProperty(card, "innerHTML", { get: () => markup, set: v => { markup = String(v); ids = {}; } });
card.querySelector = sel => {
  const m = /^#([\w-]+)$/.exec(sel);
  if (!m || markup.indexOf('id="' + m[1] + '"') < 0) return null;
  return ids[m[1]] || (ids[m[1]] = new Stub(m[1]));
};
card.contains = el => !!el && Object.values(ids).indexOf(el) > -1;
card.classList = { add() {}, remove() {}, contains: () => false, toggle() {} };
const modal = new Stub("modal"); modal.hidden = true;
const DOC = {
  activeElement: null, body: new Stub("body"), documentElement: new Stub("html"),
  querySelector: sel => sel === "#modal" ? modal : sel === "#modalCard" ? card : card.querySelector(sel),
  querySelectorAll: () => [], getElementById: id => DOC.querySelector("#" + id),
  createElement: () => new Stub(""), createRange: () => ({}), addEventListener() {}, removeEventListener() {},
};
DOC.documentElement.dataset = {};
DOC.createElement = () => { const s = new Stub(""); s.getContext = () => ({}); return s; };
ctx.document = DOC;

/* What a reader is given: the markup's words, blocks apart, entities read. A span counts as a block:
   the About sets its spans apart as flex items, and words running on inside a sentence are <b> and <a>. */
const BLOCK = /<\/?(?:p|div|li|ul|h2|h3|button|small|span|br)\b[^>]*>/gi;
const words = html => String(html)
  .replace(/<svg[\s\S]*?<\/svg>/gi, "").replace(BLOCK, " ").replace(/<[^>]+>/g, "")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
const inLang = lang => { ctx.lsSet("eUiLang", lang); };
const click = id => { const el = ids[id] || card.querySelector("#" + id); if (!el || typeof el.onclick !== "function") return false; el.onclick({ preventDefault() {} }); return true; };

const ready = !loaded && typeof ctx.openAbout === "function" && typeof ctx.grabDom === "function";
check(ready, "0a the program's app script runs in bare node and offers openAbout" + (loaded ? ": it threw " + loaded : ""));
if (ready) {
  try {
    ctx.grabDom();
    /* The bindings load and are ready before it repaints titles that live in the window. */
    try { ctx.loadShortcuts(); } catch (e) { /* those titles are the window's */ }
    const chord = id => String(ctx.formatActionChord(id));
    const keyed = s => s.split("{KEY1}").join(chord("nextCopy1")).split("{KEY4}").join(chord("nextCopy4"));
    const builtIso = ctx.E_BUILT;

    /* ---- 1. the About, row by row ---------------------------------------------------------- */
    const aboutIn = lang => {
      inLang(lang); ctx.openAbout();
      const r = ROWS[lang], day = dayOf(builtIso, lang);
      const want = terms => [r.name, String(ctx.E_VERSION), r.cap].concat(day ? [r.built.split("{DATE}").join(day)] : [])
        .concat([r.head]).concat(...r.items.map(it => [keyed(it[0]), it[1]]))
        .concat([r.licTitle, terms, r.licButton, r.credit, r.maker, r.earlier, r.close]).join(" ");
      const got = words(markup);
      const which = r.terms.findIndex(tm => want(tm) === got);
      return { got, which, want: want(r.terms[0]), x: (ids.modalX && ids.modalX.getAttribute("aria-label"))
        || ((/id="modalX"[^>]*aria-label="([^"]*)"/.exec(markup) || [])[1]) || null, html: markup };
    };
    const en = aboutIn("en"), pl = aboutIn("pl");
    for (const [a, lang, id] of [[en, "en", "1a"], [pl, "pl", "1b"]])
      check(a.which > -1, id + " About in " + lang + " says the draft's rows 1 and 3 to 17, in order and nothing else"
        + (a.which > -1 ? "" : ": got " + JSON.stringify(a.got.slice(0, 400)) + " against " + JSON.stringify(a.want.slice(0, 400))));
    check(en.x === ROWS.en.x && pl.x === ROWS.pl.x, "1c its corner X is named for a screen reader as row 2: " + JSON.stringify([en.x, pl.x]));
    check(en.which > -1 && en.which === pl.which, "1d row 12 is the drafted line or its alternative, the same in both languages: "
      + JSON.stringify([en.which, pl.which]));
    check(!!dayOf(builtIso, "en") && en.got.indexOf(ROWS.en.built.split("{DATE}").join(dayOf(builtIso, "en"))) > -1
      && pl.got.indexOf(ROWS.pl.built.split("{DATE}").join(dayOf(builtIso, "pl"))) > -1,
      "1e and row 5 carries the build's own day, " + JSON.stringify(builtIso) + ", as " + JSON.stringify([dayOf(builtIso, "en"), dayOf(builtIso, "pl")]));
    check(en.got.indexOf(ROWS.en.reserve) < 0 && pl.got.indexOf(ROWS.pl.reserve) < 0, "1f the entry held in reserve is not on the screen");

    /* ---- 2. Earlier versions of Etiuda, and back ------------------------------------------- */
    const earlierIn = lang => {
      inLang(lang); ctx.openAbout();
      const went = click("aboutEarlier");
      const r = ROWS[lang], got = words(markup), want = [r.earlier, r.e4[0], r.e4[1], r.back].join(" ");
      const back = ids.aboutBack ? (click("aboutBack"), words(markup)) : "";
      return { went, ok: got === want, got, want, back: back === aboutIn(lang).got && back.indexOf(r.head) > -1 };
    };
    const een = earlierIn("en"), epl = earlierIn("pl");
    for (const [e, lang, id] of [[een, "en", "2a"], [epl, "pl", "2b"]])
      check(e.went && e.ok, id + " its footer's left button opens Earlier versions of Etiuda in " + lang + ": rows E1, E4 and E5"
        + (e.ok ? "" : ": got " + JSON.stringify(e.got.slice(0, 300)) + " against " + JSON.stringify(e.want)));
    check(een.back && epl.back, "2c and its Back button returns to the About in both languages");
    {
      const dated = [{ v: "2.0.0", built: "2026-10-05", items: [{ title: "Signed by the team's lead.", body: "x" }] }];
      const got = l => { inLang(l); return typeof ctx.aboutEarlierHtml === "function" ? words(ctx.aboutEarlierHtml(dated)) : ""; };
      const want = l => ROWS[l].e2.split("{VERSION}").join("2.0.0").split("{DATE}").join(dayOf("2026-10-05", l));
      check(got("en").indexOf(want("en")) === 0 && got("pl").indexOf(want("pl")) === 0,
        "2d a version that moves there is headed as row E2: " + JSON.stringify([got("en").slice(0, 60), got("pl").slice(0, 60)]));
    }

    /* ---- 3. no shortcut list, and none of its keys ----------------------------------------- */
    const OLD = ["\u2191\u2193", "\u2190\u2192", "Enter", "Shift+Enter", "Esc"]
      .concat(["langToggle", "tabNext", "quickFacts", "toggleRail", "expandPills", "lanes"].map(chord));
    const outside = a => words(a.html.replace(/<ul class="about-new"[\s\S]*?<\/ul>/, " "));
    const named = a => OLD.filter(k => outside(a).indexOf(k) > -1);
    check(en.html.indexOf("<kbd") < 0 && pl.html.indexOf("<kbd") < 0, "3a About draws no key cap, in either language");
    check(!named(en).length && !named(pl).length,
      "3b and names none of the old list's " + OLD.length + " keys outside the draft's own entries: " + JSON.stringify([named(en), named(pl)]));
    check(OLD.every(k => k && k !== "-") && OLD.every(k => words("<p>" + OLD.join(" x ") + "</p>").indexOf(k) > -1),
      "3B control: the " + OLD.length + " names are read from the bindings, none empty, and the same scan finds each in a planted legend: " + JSON.stringify(OLD));
    check(!/Keyboard shortcuts|Skróty klawiszowe|Catalog file|Plik katalogu/.test(en.got + " " + pl.got),
      "3c and points nowhere else for them, and names no catalog file");
    check(typeof ctx.keysLegendHtml === "undefined", "3d the program no longer carries the legend's renderer");

    /* ---- 4. the build's own day ------------------------------------------------------------ */
    const iso = String(builtIso || ""), m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(iso);
    const real = !!m && new Date(Date.UTC(+m[1], m[2] - 1, +m[3])).toISOString().slice(0, 10) === iso;
    const now = new Date(), today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    check(real && iso <= today, "4a the program carries the day it was built, " + JSON.stringify(iso) + ", a calendar day not after today (" + today + ")");
    check(HTML.split('"' + iso + '"').length - 1 === 1 && !/@E_BUILT@|@EULA_[A-Z]+@/.test(HTML),
      "4b once, and no placeholder of the build's is left in the artefact");
    {
      let B = null;
      try { B = await import(pathToFileURL(path.join(ROOT, "tools", "build.mjs")).href); } catch (e) { B = null; }
      const at = d => "const E_BUILT = \"" + d + "\";";
      const keep = B && typeof B.stampFor === "function" ? B.stampFor(at("2026-01-02"), at, "2026-03-04") : null;
      const take = B && typeof B.stampFor === "function" ? B.stampFor(at("2026-01-02") + " changed", at, "2026-03-04") : null;
      const none = B && typeof B.stampFor === "function" ? B.stampFor("", at, "2026-03-04") : null;
      check(keep === "2026-01-02" && take === "2026-03-04" && none === "2026-03-04",
        "4c the build keeps the day it finds when nothing else would change, and takes today otherwise: " + JSON.stringify([keep, take, none]));
    }

    /* ---- 5. the agreement, from the file the installer carries ----------------------------- */
    const agreement = lang => {
      const raw = fs.readFileSync(path.join(ROOT, "shell", "license_" + lang + ".txt"), "utf8").replace(/^\ufeff/, "").replace(/\r\n/g, "\n");
      const paras = raw.split(/\n\s*\n/).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      return { title: paras[0], rest: paras.slice(1).join(" ") };
    };
    const licenceIn = lang => {
      inLang(lang); ctx.openAbout();
      const went = click("aboutLicence"), a = agreement(lang), html = markup;
      const title = words((/<span class="modal-t">([\s\S]*?)<\/span>/.exec(html) || [])[1] || "");
      const body = words(html.replace(/<h2[\s\S]*?<\/h2>/, "").replace(/<div class="modal-actions">[\s\S]*$/, ""));
      const back = ids.aboutBack ? (click("aboutBack"), words(markup).indexOf(ROWS[lang].head) > -1) : false;
      return { went, title, body, a, html, back };
    };
    const len = licenceIn("en"), lpl = licenceIn("pl");
    for (const [l, lang, id] of [[len, "en", "5a"], [lpl, "pl", "5b"]])
      check(l.went && l.title === l.a.title && l.body === l.a.rest,
        id + " Read the licence opens the agreement in " + lang + " inside the program, word for word shell/license_" + lang + ".txt: title "
        + JSON.stringify(l.title) + ", " + l.body.length + " characters against " + l.a.rest.length);
    check(![len.html, lpl.html].some(h => /<a\b|<iframe|<img|\ssrc=|\shref=/i.test(h.replace(/<h2[\s\S]*?<\/h2>/, "")))
      && typeof ctx.fetch === "undefined" && typeof ctx.XMLHttpRequest === "undefined" && typeof ctx.WebSocket === "undefined",
      "5c with no network to reach: the page holds no link, frame or image, and it was read where fetch, XMLHttpRequest and WebSocket do not exist");
    check(len.back && lpl.back, "5d and its Back button returns to the About");
    {
      let files = [];
      try { files = (await import(pathToFileURL(path.join(ROOT, "electron-builder.js")).href)).default.files || []; } catch (e) { files = []; }
      check(files.indexOf("engine/etiuda.html") > -1, "5e the page that carries it is one of the program's files: " + JSON.stringify(files));
    }
  } catch (e) {
    failed++;
    console.log("  FAIL the run threw: " + String(e && e.stack || e).split("\n").slice(0, 4).join(" | "));
  }
}

const complete = asserted >= EXPECTED;
console.log("\n#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
console.log(complete && !failed ? "RESULT: ok " + asserted + " check(s)"
  : "RESULT: FAIL " + failed + " failed" + (complete ? "" : ", and only " + asserted + " of " + EXPECTED + " ran"));
process.exit(Math.min(63, failed + (complete ? 0 : 1)));
