/* Per card and language, the counts a desk sends (board 948).
 *
 *     node tests/stats-card-lang.mjs
 *
 * A desk that copied card X twice in Polish and once in English writes exactly those counts
 * for X, none for a card it did not copy, and nothing but counts. The shell drops a phrase
 * planted under a card's languages. No window, no child process.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Desk from "../src/modules/desk-stats.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = 11;
const DAY = "2026-11-01";

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

function sliceDecl(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error("no " + JSON.stringify(marker));
  if (src.indexOf(marker, at + 1) >= 0) throw new Error(JSON.stringify(marker) + " is twice");
  let par = 0, brk = 0, brc = 0, sawBrace = false;
  for (let i = at; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") par++; else if (ch === ")") par--;
    else if (ch === "[") brk++; else if (ch === "]") brk--;
    else if (ch === "{") { brc++; sawBrace = true; }
    else if (ch === "}") {
      brc--;
      if (sawBrace && !par && !brk && !brc) return src.slice(at, i + 1);
    }
  }
  throw new Error("unterminated " + marker);
}

function strayText(doc) {
  const bad = [];
  const walk = (v, at) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, at + "[" + i + "]")); return; }
    if (v && typeof v === "object") {
      Object.keys(v).forEach(k => {
        if (/[\s:]/.test(k)) bad.push(at + "." + k);
        walk(v[k], at ? at + "." + k : k);
      });
      return;
    }
    if (typeof v === "number") { if (!Number.isFinite(v)) bad.push(at); return; }
    if (typeof v === "string") { if (/\s/.test(v)) bad.push(at); return; }
    bad.push(at);
  };
  walk(doc, "");
  return bad;
}

check(typeof Desk.bumpCardLang === "function", "the desk records a copy against its card and its language");

let doc = null, life = null, kept = null, left = null, recorded = "";
if (typeof Desk.bumpCardLang === "function") {
  try {
    const pack = { useCounts: {}, useAt: {} };
    Desk.bumpUse(pack, "card-x", DAY);
    Desk.bumpCardLang(pack, "card-x", "pl", DAY);
    Desk.bumpUse(pack, "card-x", DAY);
    Desk.bumpCardLang(pack, "card-x", "pl", DAY);
    Desk.bumpUse(pack, "card-x", DAY);
    Desk.bumpCardLang(pack, "card-x", "en", DAY);
    Desk.bumpCardLang(pack, "card-x", "good morning", DAY);
    Desk.bumpCardLang(pack, "card-x", "pl:note", DAY);
    const place = pack.dayIds.indexOf("card-x");
    const bucket = pack.days[DAY].k[place];
    bucket["good morning"] = 7;
    bucket.de = 0;
    const ask = { engine: "test", period: { from: DAY, to: "2026-11-09" } };
    doc = Desk.statsDoc(pack, ask);
    life = Desk.statsDoc(pack, { engine: "test" });
    const other = { useCounts: {}, useAt: {} };
    Desk.bumpUse(other, "card-y", DAY);
    Desk.bumpCardLang(other, "card-y", "de", DAY);
    Desk.bumpUse(other, "card-x", DAY);
    Desk.bumpCardLang(other, "card-x", "pl", DAY);
    Desk.bumpCardLang(other, "card-x", "pl", DAY);
    Desk.bumpCardLang(other, "card-x", "en", DAY);
    Desk.statsForgetCards(other, id => id !== "card-y");
    left = other;
    kept = Desk.statsDoc(other, ask);
  } catch (e) {
    recorded = e && e.message ? e.message : String(e);
  }
}

const card = doc && (doc.cards || []).find(c => c.id === "card-x");
check(!!card && card.n === 3 && JSON.stringify(card.langs) === JSON.stringify({ pl: 2, en: 1 }),
  "card X was copied twice in Polish and once in English: "
  + JSON.stringify(card && card.langs) + (recorded ? " (" + recorded + ")" : ""));
check(!!doc && !(doc.cards || []).some(c => c.id === "card-y"),
  "a card that was not copied is absent");
check(!!card && !("de" in (card.langs || {})) && JSON.stringify(doc || "").indexOf("good morning") < 0
  && JSON.stringify(doc || "").indexOf("pl:note") < 0,
  "a language with no copies, and a phrase, are not in the document");
check(!!doc && Object.keys(doc).sort().join(",") === "cards,engine,format,intents,kind,langs,misses,period,since",
  "the document gains no new top level field: " + (doc ? Object.keys(doc).sort().join(",") : recorded));
check(!!life && life.cards.some(c => c.id === "card-x") && !("langs" in life.cards.find(c => c.id === "card-x")),
  "a lifetime answer, which has no span, still omits per card languages");
const keptCard = kept && (kept.cards || []).find(c => c.id === "card-x");
check(!!keptCard && JSON.stringify(keptCard.langs) === JSON.stringify({ pl: 2, en: 1 })
  && !(kept.cards || []).some(c => c.id === "card-y")
  && !!left && left.dayIds.indexOf("card-y") < 0,
  "dropping another card leaves X's languages on X: " + JSON.stringify(keptCard && keptCard.langs));
check(!!doc && strayText(doc).length === 0, "the document holds counts, ids and codes, and no phrase: "
  + (doc ? strayText(doc).join(" ") : recorded));

const shell = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const pointer = fs.readFileSync(path.join(ROOT, "src", "modules", "list-pointer.js"), "utf8");
check(shell.indexOf("cards: cardCounts(data.cards)") >= 0 && /bumpCardLang\(pack,\s*id,\s*lang\)/.test(pointer),
  "a copy records the card's language and the statistics file is written through that count");

let cleaned = null, same = null, shellNote = "";
try {
  const fn = new Function(sliceDecl(shell, "function langCounts(") + "\n" + sliceDecl(shell, "function cardCounts(")
    + "\nreturn cardCounts;")();
  const bare = { id: "card-x", n: 3 };
  same = fn([bare])[0] === bare;
  cleaned = fn([{ id: "card-x", n: 3, langs: { pl: 2, en: 1, "good morning": 9, "pl:note": 1, de: 0 } }])[0];
} catch (e) {
  shellNote = e && e.message ? e.message : String(e);
}
check(same === true, "a card the page sent without languages is written unchanged" + (shellNote ? " (" + shellNote + ")" : ""));
check(!!cleaned && JSON.stringify(cleaned.langs) === JSON.stringify({ pl: 2, en: 1 })
  && JSON.stringify(cleaned).indexOf("good morning") < 0 && JSON.stringify(cleaned).indexOf("pl:note") < 0,
  "the file keeps the counts and drops a phrase: " + JSON.stringify(cleaned && cleaned.langs) + (shellNote ? " (" + shellNote + ")" : ""));

if (asserted !== EXPECTED) {
  failed++;
  console.log("  FAIL ran " + asserted + " checks, the floor is " + EXPECTED);
}
console.log((failed ? "FAIL" : "ok") + " stats-card-lang " + (asserted - failed) + "/" + asserted);
process.exit(Math.min(failed, 63));
