/* Format 1 to format 2, the only direction that ships. It runs once per catalog, outside the
   engine, and its output is what the engine reads from then on. */

import { FORMAT, KIND, slug, tagId, cardId, idOk, contentHash } from "./format.mjs";

/* Format 1 stored a language in the key itself: a body lives in `en` and `pl`, a title in `t`
   and `tPl`, a note in `note` and `notePl`. Format 2 keys by language code, so every one of
   these tables is a rename of the same value and nothing here is a judgement. */
const CARD_MAP = {
  title: { en: "t", pl: "tPl" },
  body: { en: "en", pl: "pl" },
  note: { en: "note", pl: "notePl" }
};
const REQUEST_MAP = {
  clause: { en: "en", pl: "pl" },
  action: { en: "cmt", pl: "cmtPl" },
  topic: { en: "topic", pl: "topicPl" }
};
/* Card flags format 2 does not rename. They are engine behaviour rather than shape, they are
   spelled the same on both sides of the boundary, and renaming them would buy a second table
   to keep true. */
const CARD_FLAGS = ["firstOnly", "allIntents", "intentTop"];

function str(v) { return String(v == null ? "" : v); }
function nonEmpty(map) { return Object.keys(map).length ? map : undefined; }

/* A language is declared when the file actually speaks it. Declaring Polish over a catalog
   with no Polish in it would be a promise the Languages screen then has to explain away. */
function declaredLangs(v1) {
  const langs = [{ code: "en", label: "EN" }];
  const i = v1.intents || {};
  let pl = (i.pl || []).some(v => str(v).trim()) || (i.cmtPl || []).some(v => str(v).trim())
    || (i.topicPl || []).some(v => str(v).trim())
    || Object.keys(v1.categoriesPl || {}).length > 0;
  if (!pl) {
    for (const m of v1.cards || []) {
      if (str(m.pl).trim() || str(m.tPl).trim() || str(m.notePl).trim()) { pl = true; break; }
    }
  }
  if (pl) langs.push({ code: "pl", label: "PL" });
  return langs;
}

/* Blank lines were format 1's only structure, so they were structural everywhere and could
   never be a paragraph break. Every one of them becomes a marker line here, which is what
   hands the blank line back to the card. */
function bodyToMarkers(text, marker) {
  const blocks = str(text).split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  if (!blocks.length) return "";
  return blocks.map(b => marker + "\n" + b).join("\n\n");
}

function toV2(v1, opts) {
  const o = opts || {};
  const problems = [];
  const name = str(o.name || v1.name || "Etiuda catalog");
  const id = str(o.id || slug(name));
  if (!idOk(id)) problems.push("catalog id " + JSON.stringify(id) + " is not 3 to 64 of [a-z0-9-]");

  const langs = declaredLangs(v1);
  const codes = langs.map(l => l.code);
  const mapByLang = (src, table) => {
    const out = {};
    for (const code of codes) {
      const key = table[code];
      const v = key ? str(src[key]).trim() : "";
      if (v) out[code] = v;
    }
    return out;
  };

  const tags = [];
  const seen = new Map();
  const claim = (wanted, what) => {
    if (seen.has(wanted)) problems.push("id collision at " + what + ": two things claim one id");
    seen.set(wanted, what);
    return wanted;
  };

  const catKeys = Object.keys(v1.categories || {});
  const always = new Set((v1.roles && v1.roles.always) || []);
  const shelfOf = {};
  for (const k of catKeys) {
    const tid = claim(tagId(k), "shelf");
    shelfOf[k] = tid;
    const label = {};
    const en = str(v1.categories[k]).trim();
    if (en) label.en = en;
    const pl = str((v1.categoriesPl || {})[k]).trim();
    if (pl && codes.indexOf("pl") > -1) label.pl = pl;
    const tag = { id: tid, kind: "shelf", label };
    const icon = str((v1.icons || {})[k]).trim();
    if (icon) tag.icon = icon;
    const hue = parseInt((v1.colors || {})[k], 10);
    if (Number.isFinite(hue)) tag.hue = hue;
    if (always.has(k)) tag.supporting = true;
    tags.push(tag);
  }

  /* A request carries no label: what it shows is its clause, and a second field holding the
     same words is a second field to keep true. */
  const iv = v1.intents || {};
  const n = (iv.en || []).length;
  const requestAt = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    for (const f of Object.keys(REQUEST_MAP)) {
      const src = {};
      for (const code of codes) {
        const key = REQUEST_MAP[f][code];
        if (key && Array.isArray(iv[key])) src[key] = iv[key][i];
      }
      const m = mapByLang(src, REQUEST_MAP[f]);
      if (Object.keys(m).length) row[f] = m;
    }
    const primary = (row.clause && row.clause[codes[0]]) || "";
    if (!primary) { problems.push("request " + i + " has no clause in the primary language"); }
    const tid = claim(tagId(primary || ("request-" + i)), "request");
    requestAt.push(tid);
    tags.push(Object.assign({ id: tid, kind: "request" }, row));
  }

  const cards = [];
  let unresolved = 0;
  for (const m of v1.cards || []) {
    const cat = str(m.c).trim();
    const title = str(m.t).trim();
    const cid = claim(cardId(cat + "-" + title), "card");
    const card = { id: cid, shelf: shelfOf[cat] || tagId(cat) };
    if (!shelfOf[cat]) problems.push("card " + cid + " names a category the file does not declare");
    const links = [];
    for (const raw of (Array.isArray(m.intents) ? m.intents : [])) {
      const idx = (typeof raw === "number") ? raw : (/^\d+$/.test(str(raw)) ? +str(raw) : -1);
      if (idx >= 0 && idx < requestAt.length) links.push(requestAt[idx]);
      else unresolved++;
    }
    if (links.length) card.requests = links;
    for (const f of Object.keys(CARD_MAP)) {
      const map = nonEmpty(mapByLang(m, CARD_MAP[f]));
      if (map) card[f] = map;
    }
    if (!card.title || !card.title[codes[0]]) problems.push("card " + cid + " has no title in the primary language");
    if (!card.body || !card.body[codes[0]]) problems.push("card " + cid + " has no body in the primary language");
    const k = str(m.k).trim();
    if (k) card.k = k;
    card.bodyShape = m.alt ? (m.seq ? "steps" : "alts") : "plain";
    if (m.alt) {
      const marker = m.seq ? "[step]" : "[alt]";
      const body = {};
      for (const code of codes) {
        const was = card.body && card.body[code];
        if (was) body[code] = bodyToMarkers(was, marker);
      }
      card.body = body;
    }
    for (const f of CARD_FLAGS) { if (m[f]) card[f] = true; }
    if (m.paxVoc != null) card.paxVoc = (+m.paxVoc) ? 1 : 0;
    const lock = str(m.lockLang).trim();
    if (lock) {
      if (codes.indexOf(lock) > -1) card.lockLang = lock;
      else problems.push("card " + cid + " pins a language the catalog does not declare");
    }
    cards.push(card);
  }
  if (unresolved) problems.push(unresolved + " card-to-request link(s) name no request in this file");

  const out = {
    format: FORMAT,
    kind: KIND,
    id,
    name,
    rev: (o.rev != null) ? +o.rev : 1,
    langs,
    commentLang: "en",
    tags,
    cards
  };
  /* Format 1's `version` is a free-form label the desk reads to answer "is this current?", and
     in practice it is a date with an edition letter after it. It travels whole into `date`
     whenever it OPENS with a date, suffix included, because that label is what the screen has
     always shown; a label that is not a date at all answers the question with `rev` instead.
     A second conversion of a later edition passes --rev, or both files claim to be rev 1. */
  const date = str(o.date || v1.version).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) out.date = date;
  if (Array.isArray(v1.who) && v1.who.length) out.role = v1.who.map(str);
  /* The engine reads this one: a catalog that says it is the sample is remembered as the
     sample, so the offer does not keep proposing it. A boolean here, a 1 in format 1. */
  if (v1.sample) out.sample = true;
  if (str(v1.facts)) out.facts = str(v1.facts);
  out.minEngine = "2.0.0";
  out.hash = contentHash(out);
  return { catalog: out, problems };
}

export { toV2, bodyToMarkers, CARD_MAP, REQUEST_MAP, CARD_FLAGS };
