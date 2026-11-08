/* Generated from src/modules/clip-suggest.js. Edit that file, then rebuild this copy. */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/modules/clip-suggest.js
var clip_suggest_exports = {};
__export(clip_suggest_exports, {
  MESSAGE_LETTER_SHARE: () => MESSAGE_LETTER_SHARE,
  MESSAGE_WORD_MIN: () => MESSAGE_WORD_MIN,
  SUGGEST_LIMIT: () => SUGGEST_LIMIT,
  SUGGEST_SCORE_FLOOR: () => SUGGEST_SCORE_FLOOR,
  buildSuggestModel: () => buildSuggestModel,
  intentPassages: () => intentPassages,
  messageWords: () => messageWords,
  readsLikeMessage: () => readsLikeMessage,
  scoreSuggestions: () => scoreSuggestions
});
module.exports = __toCommonJS(clip_suggest_exports);

// src/modules/words.js
var WORD_PREFIX_MIN = 5;
var FOLD = {
  "\u0105": "a",
  "\u0107": "c",
  "\u0119": "e",
  "\u0142": "l",
  "\u0144": "n",
  "\xF3": "o",
  "\u015B": "s",
  "\u017A": "z",
  "\u017C": "z",
  "\u0104": "a",
  "\u0106": "c",
  "\u0118": "e",
  "\u0141": "l",
  "\u0143": "n",
  "\xD3": "o",
  "\u015A": "s",
  "\u0179": "z",
  "\u017B": "z",
  "\xE0": "a",
  "\xE1": "a",
  "\xE2": "a",
  "\xE3": "a",
  "\xE4": "a",
  "\xE5": "a",
  "\xE8": "e",
  "\xE9": "e",
  "\xEA": "e",
  "\xEB": "e",
  "\xEC": "i",
  "\xED": "i",
  "\xEE": "i",
  "\xEF": "i",
  "\xF2": "o",
  "\xF4": "o",
  "\xF5": "o",
  "\xF6": "o",
  "\xF8": "o",
  "\xF9": "u",
  "\xFA": "u",
  "\xFB": "u",
  "\xFC": "u",
  "\xFD": "y",
  "\xFF": "y",
  "\xF1": "n",
  "\xE7": "c",
  "\u0161": "s",
  "\u017E": "z",
  "\u010D": "c",
  "\u0159": "r",
  "\u016F": "u",
  "\u011B": "e",
  "\u0165": "t",
  "\u010F": "d",
  "\u0148": "n",
  "\u0101": "a",
  "\u0113": "e",
  "\u012B": "i",
  "\u014D": "o",
  "\u016B": "u",
  "\xE6": "ae",
  "\u0153": "oe",
  "\xDF": "ss",
  "\u0111": "d",
  "\xFE": "th",
  "\xC0": "a",
  "\xC1": "a",
  "\xC2": "a",
  "\xC4": "a",
  "\xC8": "e",
  "\xC9": "e",
  "\xCA": "e",
  "\xCB": "e",
  "\xCD": "i",
  "\xCE": "i",
  "\xD2": "o",
  "\xD4": "o",
  "\xD6": "o",
  "\xD9": "u",
  "\xDA": "u",
  "\xDC": "u",
  "\xD1": "n",
  "\xC7": "c",
  "\u0160": "s",
  "\u017D": "z"
};
var FOLD_RE = new RegExp("[" + Object.keys(FOLD).join("") + "]", "g");
function foldDiacritics(s) {
  const t = String(s == null ? "" : s);
  for (let i = 0; i < t.length; i++) {
    if (t.charCodeAt(i) > 127) return t.replace(FOLD_RE, (ch) => FOLD[ch] || ch);
  }
  return t;
}
function splitWords(s) {
  return foldDiacritics(String(s == null ? "" : s).toLowerCase()).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
function sharedPrefixLen(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}
var WORD_STEM_MIN = 4;
function wordMatchesTerm(word, term) {
  if (!word || !term) return false;
  if (word.indexOf(term) === 0) return true;
  if (word.length >= WORD_STEM_MIN && term.indexOf(word) === 0) return true;
  if (term.length < WORD_PREFIX_MIN) return false;
  return sharedPrefixLen(word, term) >= WORD_PREFIX_MIN;
}

// src/modules/clip-suggest.js
var MESSAGE_WORD_MIN = 3;
var MESSAGE_LETTER_SHARE = 0.6;
var SUGGEST_SCORE_FLOOR = 2.5;
var SUGGEST_LIMIT = 5;
var AFFINITY_STOP = /* @__PURE__ */ new Set([
  "your",
  "with",
  "from",
  "this",
  "that",
  "they",
  "have",
  "been",
  "when",
  "what",
  "will",
  "into",
  "about",
  "twoje",
  "twojego",
  "twoja",
  "swoje",
  "oraz",
  "jest",
  "przez"
]);
var POLITE_STOP = /* @__PURE__ */ new Set([
  "please",
  "would",
  "could",
  "like",
  "know",
  "ask",
  "help",
  "question",
  "possible",
  "tell",
  "need",
  "want",
  "prosze",
  "chcialbym",
  "chcialabym",
  "moglbym",
  "moge",
  "mozna",
  "mozliwe",
  "pytanie",
  "sprawie",
  "zapytac",
  "dowiedziec",
  "pomoc",
  "potrzebuje"
]);
var GREET_STOP = /* @__PURE__ */ new Set(["hello", "hi", "hey", "witam", "czesc", "dzieki", "thanks", "thank"]);
var PL_TRANS = /[,;]?\s+(?:a\s+do\s+tego|a\s+także|a\s+takz[e]|oraz\s+czy|a\s+przy\s+okazji|dodatkowo|ponadto|i\s+jeszcze\s+jedno|mam\s+też\s+pytanie|mam\s+te[z]\s+pytanie|chciał(?:a)?bym\s+też|chcial(?:a)?bym\s+te[z]|czy\s+mogę\s+też|czy\s+moge\s+te[z]|a\s+co\s+z|i\s+jak\s+wygląda|i\s+jak\s+wyglada|a\s+druga)\b/i;
var EN_TRANS = /[,;]?\s+(?:and\s+also|and\s+I\s+also|also\s+can|plus\s+can|by\s+the\s+way|additionally|another\s+question|and\s+what\s+about|and\s+how\s+do\s+i)\b/i;
function isStopWord(w) {
  const folded = foldDiacritics(String(w || "").toLowerCase());
  return AFFINITY_STOP.has(folded) || POLITE_STOP.has(folded) || GREET_STOP.has(folded);
}
function messageWords(text) {
  const out = [];
  const parts = String(text == null ? "" : text).split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    const core = parts[i].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!core) continue;
    const letters = core.match(/\p{L}/gu);
    if (!letters || letters.length < 2) continue;
    if (/^[\p{L}]+(?:['-][\p{L}]+)*$/u.test(core)) out.push(core);
  }
  return out;
}
function letterShare(text) {
  const s = String(text == null ? "" : text).replace(/\s+/g, "");
  if (!s) return 0;
  const letters = s.match(/\p{L}/gu);
  return (letters ? letters.length : 0) / [...s].length;
}
function readsLikeMessage(text) {
  return messageWords(text).length >= MESSAGE_WORD_MIN && letterShare(text) >= MESSAGE_LETTER_SHARE;
}
function suggestEditDistance1(a, b) {
  if (a === b) return false;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}
function cardTexts(m) {
  const out = [];
  if (m) {
    if (m.title && typeof m.title === "object") out.push(...Object.values(m.title));
    else if (typeof m.title === "string") out.push(m.title);
    if (m.k) out.push(m.k);
    if (m.body && typeof m.body === "object") out.push(...Object.values(m.body));
    else if (typeof m.body === "string") out.push(m.body);
  }
  return out;
}
function tagTexts(t) {
  const out = [];
  if (t) {
    for (const f of ["topic", "clause", "action"]) {
      if (t[f] && typeof t[f] === "object") out.push(...Object.values(t[f]));
      else if (typeof t[f] === "string") out.push(t[f]);
    }
  }
  return out;
}
function buildCatalogVocab(catalog) {
  const vocab = /* @__PURE__ */ new Map();
  const cards = Array.isArray(catalog && catalog.cards) ? catalog.cards : [];
  for (const m of cards) {
    const seen = /* @__PURE__ */ new Set();
    for (const t of cardTexts(m)) {
      if (!t) continue;
      for (const w of splitWords(t)) if (w.length >= 4) seen.add(w);
    }
    for (const w of seen) vocab.set(w, (vocab.get(w) || 0) + 1);
  }
  const tags = Array.isArray(catalog && catalog.tags) ? catalog.tags : [];
  for (const t of tags) {
    if (!t || t.kind !== "request") continue;
    const seen = /* @__PURE__ */ new Set();
    for (const txt of tagTexts(t)) {
      if (!txt) continue;
      for (const w of splitWords(txt)) if (w.length >= 4) seen.add(w);
    }
    for (const w of seen) vocab.set(w, (vocab.get(w) || 0) + 1);
  }
  return vocab;
}
function suggestCorrectTerm(term, vocab, cache) {
  if (term.length < 5) return term;
  if (vocab.has(term)) return term;
  if (cache.has(term)) return cache.get(term);
  let bestW = term, bestN = 0;
  for (const [w, n] of vocab.entries()) {
    if (w.length < 5) continue;
    if (suggestEditDistance1(term, w) && n > bestN) {
      bestN = n;
      bestW = w;
    }
  }
  cache.set(term, bestW);
  return bestW;
}
function buildAffinityWordWeights(catalog) {
  const cards = Array.isArray(catalog && catalog.cards) ? catalog.cards : [];
  const total = Math.max(cards.length, 1);
  const cardDf = /* @__PURE__ */ new Map();
  for (const m of cards) {
    const seen = /* @__PURE__ */ new Set();
    for (const t of cardTexts(m)) {
      if (!t) continue;
      for (const w of splitWords(t)) seen.add(w);
    }
    for (const w of seen) cardDf.set(w, (cardDf.get(w) || 0) + 1);
  }
  const weights = /* @__PURE__ */ new Map();
  for (const [w, n] of cardDf) {
    const share = n / total;
    weights.set(w, share > 0.15 ? 0 : share > 0.08 ? 0.5 : 1);
  }
  return weights;
}
function intentName(tag) {
  if (!tag) return "";
  if (typeof tag.name === "string") return tag.name;
  const n = tag.name || {};
  return String(n.en || n.pl || Object.values(n)[0] || "");
}
function buildProfiles(catalog) {
  const cards = Array.isArray(catalog && catalog.cards) ? catalog.cards : [];
  const tags = (Array.isArray(catalog && catalog.tags) ? catalog.tags : []).filter((t) => t && t.kind === "request");
  const kwIntents = /* @__PURE__ */ new Map();
  const titleIntents = /* @__PURE__ */ new Map();
  for (const m of cards) {
    if (m.allIntents || m.requests === true || m.requests === "all") continue;
    const reqs = Array.isArray(m.requests) ? m.requests.map(String) : [];
    if (!reqs.length) continue;
    if (m.k) {
      for (const w of splitWords(m.k)) {
        let s = kwIntents.get(w);
        if (!s) {
          s = /* @__PURE__ */ new Set();
          kwIntents.set(w, s);
        }
        for (const id of reqs) s.add(id);
      }
    }
    const titles = m["title"] && typeof m["title"] === "object" ? Object.values(m["title"]) : typeof m["title"] === "string" ? [m["title"]] : [];
    for (const title of titles) {
      if (!title) continue;
      for (const w of splitWords(title)) {
        let s = titleIntents.get(w);
        if (!s) {
          s = /* @__PURE__ */ new Set();
          titleIntents.set(w, s);
        }
        for (const id of reqs) s.add(id);
      }
    }
  }
  const profiles = [];
  for (const req of tags) {
    const id = String(req.id || "");
    if (!id) continue;
    const tier1 = /* @__PURE__ */ new Set();
    const tier2 = /* @__PURE__ */ new Set();
    const tier3 = /* @__PURE__ */ new Map();
    const topicWords = [];
    const clauseWords = [];
    for (const f of ["topic", "clause", "action"]) {
      const texts = req[f] && typeof req[f] === "object" ? Object.values(req[f]) : typeof req[f] === "string" ? [req[f]] : [];
      for (const txt of texts) {
        if (!txt) continue;
        for (const w of splitWords(txt)) {
          tier1.add(w);
          if (f === "topic") topicWords.push(w);
          else if (f === "clause") clauseWords.push(w);
        }
      }
    }
    const linked = cards.filter((m) => !m.allIntents && m.requests !== true && (m.requests || []).map(String).indexOf(id) > -1);
    for (const m of linked) {
      if (m.k) {
        for (const w of splitWords(m.k)) {
          const reach = kwIntents.get(w) ? kwIntents.get(w).size : 0;
          if (reach <= 2 && !tier1.has(w)) tier2.add(w);
        }
      }
      const titles = m["title"] && typeof m["title"] === "object" ? Object.values(m["title"]) : typeof m["title"] === "string" ? [m["title"]] : [];
      for (const title of titles) {
        if (!title) continue;
        for (const w of splitWords(title)) {
          const reach = titleIntents.get(w) ? titleIntents.get(w).size : 0;
          if (reach <= 3 && !tier1.has(w)) tier2.add(w);
        }
      }
      if ((m.requests || []).length <= 2) {
        const bodies = m.body && typeof m.body === "object" ? Object.values(m.body) : typeof m.body === "string" ? [m.body] : [];
        for (const body of bodies) {
          if (!body) continue;
          for (const w of splitWords(body)) {
            if (tier1.has(w) || tier2.has(w)) continue;
            tier3.set(w, Math.max(tier3.get(w) || 0, 1));
          }
        }
      }
    }
    profiles.push({ id, name: intentName(req), tier1, tier2, tier3, topicWords, clauseWords });
  }
  return profiles;
}
function applyBodyFilter(profiles, weights) {
  for (const p of profiles) {
    const next = /* @__PURE__ */ new Map();
    for (const [w] of p.tier3) {
      const mult = weights.has(w) ? weights.get(w) : 1;
      if (mult > 0) next.set(w, mult);
    }
    p.tier3 = next;
  }
}
function intentPassages(catalog) {
  const tags = (Array.isArray(catalog && catalog.tags) ? catalog.tags : []).filter((t) => t && t.kind === "request");
  const out = [];
  for (const req of tags) {
    const id = String(req.id || "");
    if (!id) continue;
    const topic = req.topic && typeof req.topic === "object" ? req.topic : { "": req.topic };
    const clause = req.clause && typeof req.clause === "object" ? req.clause : { "": req.clause };
    const texts = [];
    for (const code of /* @__PURE__ */ new Set([...Object.keys(topic), ...Object.keys(clause)])) {
      const text = [topic[code], clause[code]].map((x) => String(x || "").trim()).filter(Boolean).join(" - ");
      if (text && texts.indexOf(text) < 0) texts.push(text);
    }
    if (texts.length) out.push({ id, texts });
  }
  return out;
}
function buildSuggestModel(catalog, labels) {
  const weights = buildAffinityWordWeights(catalog || {});
  const profiles = buildProfiles(catalog || {});
  applyBodyFilter(profiles, weights);
  const vocab = buildCatalogVocab(catalog || {});
  return {
    vocab: [...vocab.entries()],
    weights: [...weights.entries()],
    intents: profiles.map((p) => ({
      id: p.id,
      name: p.name,
      tier1: [...p.tier1],
      tier2: [...p.tier2],
      tier3: [...p.tier3.entries()],
      topic: p.topicWords,
      clause: p.clauseWords
    })),
    passages: intentPassages(catalog || {}),
    labels: {
      suggest: String(labels && labels.suggest || ""),
      suggestTip: String(labels && labels.suggestTip || "")
    }
  };
}
function segmentCustomerMessage(raw) {
  if (!raw || typeof raw !== "string") return [];
  if (raw.length < 4 || raw.length > 1500) return [];
  if (!/\p{L}/u.test(raw)) return [];
  const trimmed = raw.trim();
  if (/^[A-Z0-9]{6,8}$/i.test(trimmed)) return [];
  if (/^https?:\/\/\S+$/i.test(trimmed)) return [];
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return [];
  const lines = raw.split(/\r?\n/).map((line) => {
    let l = line.replace(/^\s*(?:\[\d{1,2}:\d{2}(?::\d{2})?\]|\(\d{1,2}:\d{2}(?::\d{2})?\))\s*(?:[^:]+:)?\s*/, "");
    l = l.replace(/^\s*\d{1,2}:\d{2}\s*-\s*/, "");
    l = l.replace(/^\s*>+\s*/, "");
    return l;
  });
  let cleanText = lines.join(" ").replace(/\s+/g, " ").trim();
  if (cleanText.length < 4) return [];
  let isPl = /[ąćęłńóśźż]/i.test(cleanText);
  if (!isPl) {
    const plCount = (cleanText.match(/\b(?:czy|jak|nie|jest|mam|prosze|proszę|lot|do|na|w|z)\b/gi) || []).length;
    const enCount = (cleanText.match(/\b(?:the|and|can|how|for|with|my|flight|is|to|in)\b/gi) || []).length;
    if (plCount > enCount) isPl = true;
  }
  const segLang = isPl ? "pl" : "en";
  let rawPieces;
  try {
    const segmenter = new Intl.Segmenter(segLang, { granularity: "sentence" });
    rawPieces = Array.from(segmenter.segment(cleanText)).map((s) => s.segment.trim()).filter(Boolean);
  } catch (e) {
    rawPieces = cleanText.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  }
  const stitched = [];
  const plAbbr = /\b(?:nr|ul|al|os|pl|im|dr|mgr|prof|tzn|np|itd|itp|tel|godz|min)\.$/i;
  const enAbbr = /\b(?:mr|mrs|ms|dr|prof|st|no|ref|etc|vs|inc|ltd|co)\.$/i;
  const dateDot = /\d+\.$/;
  for (let i = 0; i < rawPieces.length; i++) {
    let cur = rawPieces[i];
    while (i + 1 < rawPieces.length && (plAbbr.test(cur) || enAbbr.test(cur) || dateDot.test(cur))) cur += " " + rawPieces[++i];
    stitched.push(cur);
  }
  const splitClauses = [];
  for (const s of stitched) {
    let pieces = [];
    const parts = s.split(/\?\s+/);
    for (let k = 0; k < parts.length; k++) {
      let part = parts[k].trim();
      if (k < parts.length - 1 && !part.endsWith("?")) part += "?";
      if (part) pieces.push(part);
    }
    const sc = [];
    for (const p of pieces) for (const sp of p.split(/;\s+/)) if (sp.trim()) sc.push(sp.trim());
    pieces = sc;
    const trans = [];
    for (const p of pieces) {
      const match = (segLang === "pl" ? PL_TRANS : EN_TRANS).exec(p);
      if (match && match.index > 8 && match.index < p.length - 8) {
        const left = p.slice(0, match.index).trim();
        const right = p.slice(match.index).replace(/^[,;]\s*/, "").trim();
        if (left) trans.push(left);
        if (right) trans.push(right);
      } else trans.push(p);
    }
    splitClauses.push(...trans);
  }
  const salutation = /^(?:dzień\s+dobry|dzien\s+dobry|witam\s+serdecznie|witam|cześć|czesc|dobry\s+wieczór|dobry\s+wieczor|hello|good\s+morning|good\s+afternoon|good\s+evening|hi\s+there|hi|hey|dear\s+team)[,\.\s!\-]*/i;
  const signoff = /[,\.\s!\-]*(?:pozdrawiam\s+serdecznie|pozdrawiam|z\s+poważaniem|z\s+powazaniem|dzięki|dzieki|dziękuję|dziekuje|thanks\s+a\s+lot|thanks|thank\s+you|kind\s+regards|best\s+regards)[,\.\s!\-]*$/i;
  const substantive = [];
  for (let i = 0; i < splitClauses.length; i++) {
    let seg = splitClauses[i];
    if (i === 0) seg = seg.replace(salutation, "").trim();
    if (i === splitClauses.length - 1) seg = seg.replace(signoff, "").trim();
    if (!seg) continue;
    const content = splitWords(seg).filter((w) => !isStopWord(w));
    if (!content.length) continue;
    if (seg.replace(/[^\p{L}]/gu, "").length < 2) continue;
    substantive.push(seg);
  }
  return substantive.slice(0, 4).map((s) => s.slice(0, 240).trim());
}
function profilesFrom(model) {
  const out = /* @__PURE__ */ new Map();
  const list = model && Array.isArray(model.intents) ? model.intents : [];
  for (const p of list) {
    if (!p || !p.id) continue;
    out.set(String(p.id), {
      id: String(p.id),
      name: String(p.name || ""),
      tier1: new Set(p.tier1 || []),
      tier2: new Set(p.tier2 || []),
      tier3: new Map(p.tier3 || []),
      topicWords: p.topic || [],
      clauseWords: p.clause || []
    });
  }
  return out;
}
function scoreSegment(segText, profiles, vocab, weightOf, cache) {
  const corrected = splitWords(segText).filter((w) => !isStopWord(w)).map((w) => suggestCorrectTerm(w, vocab, cache));
  const results = [];
  for (const [id, p] of profiles.entries()) {
    const termMatches = [];
    const matched = /* @__PURE__ */ new Set();
    for (const term of corrected) {
      let base = 0;
      let tier = 0;
      if (p.tier1.has(term)) {
        base = 4;
        tier = 1;
      } else if (p.tier2.has(term)) {
        base = 2.5;
        tier = 2;
      } else if (p.tier3.has(term)) {
        base = 1 * p.tier3.get(term);
        tier = 3;
      } else {
        for (const w of p.tier1) if (wordMatchesTerm(w, term)) {
          base = 2.8;
          tier = 1;
          break;
        }
        if (!base) {
          for (const w of p.tier2) if (wordMatchesTerm(w, term)) {
            base = 1.8;
            tier = 2;
            break;
          }
        }
        if (!base) {
          for (const [w, mult] of p.tier3.entries()) if (wordMatchesTerm(w, term)) {
            base = 0.7 * mult;
            tier = 3;
            break;
          }
        }
      }
      if (base > 0) {
        const weight = tier === 3 && weightOf.has(term) ? weightOf.get(term) : 1;
        const score = base * weight;
        if (score > 0) {
          termMatches.push({ term, score });
          matched.add(term);
        }
      }
    }
    if (!termMatches.length) {
      results.push({ id, score: 0 });
      continue;
    }
    termMatches.sort((a, b) => b.score - a.score);
    let sum = 0;
    for (let k = 0; k < Math.min(3, termMatches.length); k++) sum += termMatches[k].score;
    let topicHits = 0, clauseHits = 0;
    for (const tw of p.topicWords) if (matched.has(tw) || [...matched].some((m) => wordMatchesTerm(tw, m))) topicHits++;
    for (const cw of p.clauseWords) if (matched.has(cw) || [...matched].some((m) => wordMatchesTerm(cw, m))) clauseHits++;
    if (topicHits >= 2 || clauseHits >= 2) sum += 1.5;
    results.push({ id, score: Number(sum.toFixed(4)) });
  }
  return results;
}
function scoreSuggestions(text, model) {
  if (!readsLikeMessage(text) || !model) return [];
  const profiles = profilesFrom(model);
  const vocab = new Map(model.vocab || []);
  const weightOf = new Map(model.weights || []);
  const cache = /* @__PURE__ */ new Map();
  const segs = segmentCustomerMessage(String(text));
  if (!segs.length) return [];
  const combined = /* @__PURE__ */ new Map();
  for (const seg of segs) {
    for (const row of scoreSegment(seg, profiles, vocab, weightOf, cache)) {
      const cur = combined.get(row.id) || 0;
      if (row.score > cur) combined.set(row.id, row.score);
    }
  }
  const out = [];
  for (const [id, score] of combined) {
    if (!(score > SUGGEST_SCORE_FLOOR)) continue;
    const p = profiles.get(id);
    out.push({ id, name: p && p.name ? p.name : id, score });
  }
  out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out.slice(0, SUGGEST_LIMIT);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MESSAGE_LETTER_SHARE,
  MESSAGE_WORD_MIN,
  SUGGEST_LIMIT,
  SUGGEST_SCORE_FLOOR,
  buildSuggestModel,
  intentPassages,
  messageWords,
  readsLikeMessage,
  scoreSuggestions
});
