/* THE MAIN SEARCH'S MEANING ORDER. Word matches stay in today's order. The model orders only the rows
   those matches missed, and only once the passages are ready. Under three letters the word order is the
   whole answer. An answer for an older query is dropped. */
import { cards, railOrder, shown } from "./app-state.js";
import { BASE_CATS, ePackEpoch, pack } from "./pack.js";
import { CAT_LABELS_PL } from "./icons.js";
import { expandSearchPlaceholders, intentFieldAt } from "./intent-text.js";
import { intentCount } from "./content-model.js";
import { intentIdAt } from "./intent-id.js";
import { intentEl } from "./dom.js";
import { eAiModel, eHost, eSearchOn, eTellSearch } from "./host.js";
import { hooks } from "./hooks.js";
import { t, toast } from "./ui-lang.js";

/* Letters and digits, the same count the shell uses. A space is not one. */
function searchAlnumLen(text) {
  const m = String(text == null ? "" : text).match(/\p{L}|\p{N}/gu);
  return m ? m.length : 0;
}

/* Word matches first, in the order already decided, then the meaning order of whatever those matches missed.
   No meaning list means the word list itself, the same array. */
function hybridIds(wordIds, meaningIds) {
  if (!Array.isArray(wordIds)) return [];
  if (!Array.isArray(meaningIds)) return wordIds;
  return wordIds.concat(meaningIds.filter(id => wordIds.indexOf(id) < 0));
}

/* An answer is painted only for the query that is still in the box, and only for the latest ask.
   The same words typed again are a later ask, and the earlier answer does not return. */
function acceptSearchAnswer(ticket, live) {
  if (!ticket || !live) return false;
  if (ticket.gen !== live.gen || ticket.query !== live.query) return false; /* plant:search-stale */
  return true;
}

let meaning = null, searchGen = 0, typed = null, boxDirty = false, askedQuery = null;
/* The organisation's order of the list's head, and the generation it was given for: a new catalog, a cleared search or an
   edited query moves orgGen, and the order then stops applying. */
let orgOrder = null, orgGen = 0;
const ORG_CARDS_MAX = 12, ORG_INTENTS_MAX = 6;
const SEARCH_RETRY_MS = 5000, SEARCH_RETRY_MAX = 30;
let retryQuery = null, retryCount = 0;
let cheapSeen = "", sentText = "", sending = "", toasted = "", modelKnown = null;

function currentQuery() {
  try { return intentEl ? String(intentEl.value || "").trim() : ""; } catch (e) { return ""; }
}
function modelHere() {
  if (modelKnown === null) {
    try { modelKnown = !!eAiModel(); } catch (e) { modelKnown = false; }
  }
  return modelKnown;
}
/* Asked again after ORG_READ_MS, since Settings can choose the organisation's model while the page is open, and every
   render asks whether the shell ranks. */
const ORG_READ_MS = 2000;
let orgKnown = false, orgReadAt = -Infinity;
function orgHere() {
  const now = Date.now();
  if (now - orgReadAt < ORG_READ_MS) return orgKnown;
  orgReadAt = now;
  try { const h = eHost(); const st = h && typeof h.aiState === "function" ? h.aiState() : null; orgKnown = !!(st && st.org); }
  catch (e) { orgKnown = false; }
  return orgKnown;
}
function shellRanks() { return modelHere() || orgHere(); }
function orgLive() {
  return !!(orgOrder && orgOrder.gen === orgGen && orgOrder.query === currentQuery());
}
/* The entries of `list` the order names keep the places they hold, filled in the order's sequence; the rest stay put. */
function orgOrdered(list, ids, idOf) {
  if (!orgLive() || !Array.isArray(list) || !Array.isArray(ids) || ids.length < 2) return null;
  const rank = new Map();
  for (let i = 0; i < ids.length; i++) if (!rank.has(ids[i])) rank.set(ids[i], i);
  const places = [], named = [];
  for (let i = 0; i < list.length; i++) {
    if (rank.has(idOf(list[i]))) { places.push(i); named.push(list[i]); }
  }
  if (named.length < 2) return null;
  named.sort((a, b) => rank.get(idOf(a)) - rank.get(idOf(b)));
  const out = list.slice();
  for (let i = 0; i < places.length; i++) out[places[i]] = named[i];
  return out;
}
function meaningLive() {
  return !!(eSearchOn() && meaning && meaning.gen === searchGen && meaning.query === currentQuery()
    && searchAlnumLen(currentQuery()) >= 3);
}

function catEnOf(key) {
  const over = pack.catLabels && pack.catLabels[key];
  if (over) return String(over).trim();
  return String(BASE_CATS[key] || "").trim();
}
function catPlOf(key) {
  const over = pack.catLabelsPl && pack.catLabelsPl[key];
  if (over) return String(over).trim();
  return String(CAT_LABELS_PL[key] || "").trim();
}
function joinParts(parts) {
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const s = String(parts[i] || "").trim();
    if (s) out.push(s);
  }
  return out.join("\n");
}

/* One row per passage the measurement embedded: a card in each language, then an intent in each language.
   English category names stay the canonical ones. The Polish name is added only where it differs. */
function searchPassages() {
  const out = [];
  const list = cards || [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (!m || m.id == null) continue;
    for (let pass = 0; pass < 2; pass++) {
      const pl = pass === 1;
      const title = String(pl ? (m.tPl || "") : (m.t || "")).trim();
      const body = expandSearchPlaceholders(pl ? m.pl : m.en);
      const note = String(pl ? (m.notePl || "") : (m.note || "")).trim();
      const keys = String(m.k || "").trim();
      const catEn = catEnOf(m.c);
      const catPl = catPlOf(m.c);
      const catOwn = pl && catPl && catPl !== catEn ? catPl : "";
      const classText = joinParts([title, keys, catEn, catOwn, body, note]);
      if (!classText) continue;
      const searchBody = joinParts([keys, catEn, catOwn, body, note]);
      out.push({
        surface: "card",
        id: String(m.id),
        text: "title: " + (title || "none") + " | text: " + searchBody
      });
    }
  }
  const n = intentCount();
  for (let i = 0; i < n; i++) {
    const id = String(intentIdAt(i));
    for (let pass = 0; pass < 2; pass++) {
      const lang = pass === 0 ? "en" : "pl";
      const topic = String(intentFieldAt(i, "topic", lang) || "").trim();
      const clause = String(intentFieldAt(i, "clause", lang) || "").trim();
      if (!topic && !clause) continue;
      out.push({
        surface: "intent",
        id,
        text: "title: " + (topic || "none") + " | text: " + clause
      });
    }
  }
  return out;
}

function mixHash(s, h) {
  const t = String(s || "");
  for (let i = 0; i < t.length; i++) h = Math.imul(h, 33) ^ t.charCodeAt(i);
  return h >>> 0;
}
function cheapStamp() {
  let n = 0, chars = 0, labels = 5381;
  const list = cards || [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (!m) continue;
    n++;
    chars += String(m.t || "").length + String(m.tPl || "").length + String(m.en || "").length
      + String(m.pl || "").length + String(m.k || "").length + String(m.note || "").length
      + String(m.notePl || "").length;
  }
  const keys = Object.keys(BASE_CATS);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    labels = mixHash(k, labels);
    labels = mixHash(BASE_CATS[k], labels);
    labels = mixHash(pack.catLabels && pack.catLabels[k], labels);
    labels = mixHash(pack.catLabelsPl && pack.catLabelsPl[k], labels);
    labels = mixHash(CAT_LABELS_PL[k], labels);
  }
  return String(ePackEpoch) + "|" + n + "|" + chars + "|" + labels.toString(16) + "|" + intentCount();
}
function textStamp(rows) {
  let h = 5381;
  for (let i = 0; i < rows.length; i++) {
    h = mixHash(rows[i].surface, h);
    h = mixHash(rows[i].id, h);
    h = mixHash(rows[i].text, h);
  }
  return h.toString(16);
}

/* The passages go to the shell when their text changes. A star changes the epoch and not the text, so it
   does not embed again. Until the shell has them, the search stays the word order. The query already on
   screen is not ranked again when the vectors arrive; the next one is. */
function noteCatalog() {
  if (!eSearchOn() || !shellRanks()) return;
  const cheap = cheapStamp();
  if (cheap === cheapSeen && (sentText || sending)) return;
  const rows = searchPassages();
  const stamp = textStamp(rows);
  if (stamp === sentText || stamp === sending) { cheapSeen = cheap; return; }
  const h = eHost();
  if (!h || typeof h.searchPrepare !== "function") return;
  sending = stamp;
  const mine = stamp;
  Promise.resolve(h.searchPrepare(rows)).then(res => {
    if (!res || res.skipped) { if (sending === mine) sending = ""; return; }
    sentText = mine;
    if (res.ready === false && toasted !== mine) {
      toasted = mine;
      try { toast(t("Preparing the catalog for search by meaning; word search works meanwhile.")); } catch (e) {}
    }
  }).catch(() => { if (sending === mine) sending = ""; });
  meaning = null;
  askedQuery = null;
  searchGen++;
  orgGen++;
  cheapSeen = cheap;
}

function meaningCards(wordHits, keep) {
  if (!meaningLive() || !Array.isArray(wordHits)) return null;
  const byId = new Map();
  const list = cards || [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m && m.id != null && !byId.has(m.id)) byId.set(m.id, m);
  }
  const seen = new Set();
  const tail = [];
  for (let i = 0; i < wordHits.length; i++) seen.add(wordHits[i].id);
  const order = hybridIds(wordHits.map(m => m.id), meaning.cards);
  for (let i = wordHits.length; i < order.length; i++) {
    const m = byId.get(order[i]);
    if (!m || seen.has(m.id)) continue;
    if (keep && !keep(m)) continue;
    seen.add(m.id);
    tail.push(m);
  }
  return wordHits.concat(tail);
}

/* The organisation's order moves word matches among themselves and the model's cards among themselves, so the line
   between the two still stands where it stood. */
function mixCards(wordHits, keep) {
  if (!Array.isArray(wordHits)) return null;
  const ids = orgOrder && orgOrder.cards;
  const idOf = m => String(m && m.id);
  const words = orgOrdered(wordHits, ids, idOf);
  const mixed = meaningCards(wordHits, keep);
  if (!mixed) return words;
  const tail = mixed.slice(wordHits.length);
  return (words || wordHits).concat(orgOrdered(tail, ids, idOf) || tail);
}

function mixIntentRows(rows) {
  if (!meaningLive() || !Array.isArray(rows)) return null;
  const byIdx = new Map();
  const byId = new Map();
  for (let i = 0; i < rows.length; i++) {
    byIdx.set(rows[i].idx, rows[i]);
    if (!byId.has(rows[i].id)) byId.set(rows[i].id, rows[i]);
  }
  const hits = [];
  const seen = new Set();
  for (let i = 0; i < railOrder.length; i++) {
    const row = byIdx.get(railOrder[i]);
    if (!row || seen.has(row.id)) continue;
    hits.push(row);
    seen.add(row.id);
  }
  const restIds = hybridIds(hits.map(r => r.id), meaning.intents);
  const tail = [];
  for (let i = hits.length; i < restIds.length; i++) {
    const row = byId.get(restIds[i]);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    tail.push(row);
  }
  const meant = orgOrdered(tail, orgOrder && orgOrder.intents, r => String(r.id)) || tail;
  for (let i = 0; i < rows.length; i++) {
    if (seen.has(rows[i].id)) continue;
    seen.add(rows[i].id);
    meant.push(rows[i]);
  }
  return hits.concat(meant);
}

/* The box moved. The settle paints the word order, then asks. */
function noteSearchTyping() {
  const q = currentQuery();
  if (typed !== null && q !== typed) boxDirty = true;
  typed = q;
}
function searchOnSettle() {
  const q = currentQuery();
  if (!eSearchOn()) { meaning = null; askedQuery = null; boxDirty = false; typed = q; return; }
  if (boxDirty) { meaning = null; askedQuery = null; boxDirty = false; orgGen++; }
  typed = q;
}

async function ask(q) {
  const gen = ++searchGen;
  const ticket = { gen, query: q };
  let ans = null;
  try {
    const h = eHost();
    if (h && typeof h.searchRank === "function") ans = await h.searchRank(q);
  } catch (e) { ans = null; }
  if (boxDirty) return;
  if (!acceptSearchAnswer(ticket, { gen: searchGen, query: currentQuery() })) return;
  if (!eSearchOn()) return;
  if (!ans || !Array.isArray(ans.cards) || !Array.isArray(ans.intents)) {
    /* No answer yet (the catalog is still being prepared): forget the ask, so the same query is asked again,
       on the next keystroke or after SEARCH_RETRY_MS, rather than keeping word order until the query is edited. */
    /* Capped per query, so a worker that broke, or a catalog that never finishes, is not asked every five seconds for
       as long as the query sits in the box; the catalog's preparation (about two minutes here) fits well inside. */
    if (retryQuery !== q) { retryQuery = q; retryCount = 0; }
    if (++retryCount > SEARCH_RETRY_MAX) return; /* plant:search-retry-cap */
    if (askedQuery === q) askedQuery = null;
    setTimeout(() => { if (currentQuery() === q) scheduleSearchRank(); }, SEARCH_RETRY_MS);
    return;
  }
  meaning = { gen, query: q, cards: ans.cards, intents: ans.intents };
  try { hooks.render(); } catch (e) {}
  try { hooks.drawIntentRail(); } catch (e) {}
}

/* Word order is painted by the caller. This asks for the meaning order when the switch is on and the
   query is long enough, and does not ask again for a query already asked or already answered. */
function scheduleSearchRank() {
  if (!eSearchOn() || !shellRanks()) return;
  noteCatalog();
  const q = currentQuery();
  if (searchAlnumLen(q) < 3) return;
  if (meaning && meaning.query === q && meaning.gen === searchGen) return;
  if (askedQuery === q) return;
  askedQuery = q;
  void ask(q);
}

function clearSearchMeaning() {
  meaning = null;
  askedQuery = null;
  boxDirty = false;
  searchGen++;
  orgGen++;
}

function armSearch() {
  try { eTellSearch(); } catch (e) {}
  if (!eSearchOn() || !shellRanks()) return;
  noteCatalog();
}

/* THE SHELL ASKS for the head of the list on screen, for the query still in the box only: the cards as shown, and the
   intents the model added after the matches, which the arrows do not walk. */
function searchShortlist(q) {
  if (!eSearchOn() || q !== currentQuery() || boxDirty || searchAlnumLen(q) < 3) return null;
  const cardIds = [];
  const list = Array.isArray(shown) ? shown : [];
  for (let i = 0; i < list.length && cardIds.length < ORG_CARDS_MAX; i++) if (list[i] && list[i].id != null) cardIds.push(String(list[i].id));
  const intentIds = [];
  if (meaningLive()) {
    const hit = new Set();
    for (let i = 0; i < railOrder.length; i++) hit.add(String(intentIdAt(railOrder[i])));
    for (let i = 0; i < meaning.intents.length && intentIds.length < ORG_INTENTS_MAX; i++) {
      const id = String(meaning.intents[i]);
      if (!hit.has(id) && intentIds.indexOf(id) < 0) intentIds.push(id);
    }
  }
  return { q, gen: orgGen, cards: cardIds, intents: intentIds };
}
/* The organisation's order, taken once, while the query and the generation are the ones the shortlist was given for. */
function searchReorder(a) {
  const o = a || {};
  if (!eSearchOn() || boxDirty || o.q !== currentQuery() || o.gen !== orgGen) return { ok: 0 };
  if (orgOrder && orgOrder.gen === orgGen && orgOrder.query === o.q) return { ok: 0 };
  orgOrder = { gen: orgGen, query: o.q, cards: (Array.isArray(o.cards) ? o.cards : []).map(String),
    intents: (Array.isArray(o.intents) ? o.intents : []).map(String) };
  try { hooks.render(); } catch (e) {}
  try { hooks.drawIntentRail(); } catch (e) {}
  return { ok: 1 };
}

export {
  searchAlnumLen,
  hybridIds,
  acceptSearchAnswer,
  searchPassages,
  mixCards,
  mixIntentRows,
  noteSearchTyping,
  searchOnSettle,
  scheduleSearchRank,
  clearSearchMeaning,
  armSearch,
  searchShortlist,
  searchReorder
};
