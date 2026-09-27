import { cardFieldKeys, CARD_SHARED_FIELDS } from "./card-fields.js";
import { CATS } from "./content-model.js";
import { fill, expandSearchPlaceholders } from "./intent-text.js";
import { foldDiacritics, splitWords, wordMatchesTerm } from "./words.js";
import { hooks } from "./hooks.js";

/* Search fields: title, keys, meta (the category label), body (raw + expanded EN/PL +
   the currently filled display text, so live {GREET}/{PAX} match; the note rides last in
   body - see below). Ranking needs WHERE a term matched; the old single blob survives as
   idx.hay and matching still runs against it, so the split changes the order of results,
   never which results appear. Built-ins, overrides and customs reach here as one flat
   object, so a missing field is an empty string, not a special case. */
const SEARCH_FIELDS=["title","keys","meta","body"];
function normHay(parts){
  // Folded here as well as in splitWords, because the substring paths test against the raw
  // field / hay text and would otherwise be matching a different alphabet from the words.
  return foldDiacritics(parts.map(x=>String(x==null?"":x)).join(" ").toLowerCase())
    .replace(/\s+/g," ").trim();
}
/* THE STATIC HALF OF A HAYSTACK, cached on OBJECT IDENTITY - rebuildCards hands out
   fresh card objects on every edit, so a changed card is a different key and no
   invalidation logic exists to go stale (a version stamp would have to cover pax, agent,
   role, language, intents and the clock; identity cannot miss). Only pure functions of
   the card are cached; the category label and live fills stay in the live half.
   expandSearchPlaceholders is pure - if it ever reads live state, it moves too. WeakMap,
   so nothing leaks into exported JSON. */
const cardStaticHayCache=new WeakMap();
function cardStaticHay(m){
  const hit=cardStaticHayCache.get(m);
  if(hit) return hit;
  const st={
    title: normHay(cardFieldKeys("t").map(k=>m[k])),
    keys:  normHay(CARD_SHARED_FIELDS.map(k=>m[k])),
    /* bodyA and bodyB straddle the live copies so the assembled body keeps the ORIGINAL
       part order - raw, expanded, filled, note. Any other split reorders the text and
       changes which substrings span a boundary, and hay.indexOf reads across boundaries. */
    bodyA: normHay([m.en, m.pl, expandSearchPlaceholders(m.en), expandSearchPlaceholders(m.pl)]),
    bodyB: normHay(cardFieldKeys("note").map(k=>m[k]))
  };
  cardStaticHayCache.set(m,st);
  return st;
}
/* THE LIVE HALF is kept on the static half's record against cardFillKey, the fill inputs the
   card pool signs its nodes with, so a card whose inputs did not move is not filled again on
   every pass. Where boot has not wired the key, as in the harnesses, it is filled every time. */
function cardLiveHay(m, st){
  let key=null;
  try{ key=hooks.cardFillKey(m); }catch(_){}
  if(key!=null && st.liveKey===key) return st.live;
  // Live filled copy (current time-of-day greeting, pax name, intent, …)
  const live=[];
  try{
    if(m.en) live.push(fill(m.en,m));
    if(m.pl) live.push(fill(m.pl,m));
  }catch(_){}
  const hay=normHay(live);
  if(key!=null){ st.liveKey=key; st.live=hay; }
  return hay;
}
function cardSearchFields(m, st, live, label){
  if(!m) return {title:"",keys:"",meta:"",body:""};
  /* THE NOTE IS BODY, NOT META. Notes are operating warnings, largely NEGATIONS, so a
     word's presence there often means the reverse of relevance - in meta it made cards
     tier-0 for the very thing their note forbids. Demoted, not deleted: queries exist
     whose ONLY hit is the note, so it stays findable at weight 1, tier 1, "merely
     mentions it". meta is the CATEGORY NAME alone - its tier-0 gateway is deliberate.
     bodyB keeps the note LAST in the assembled body. */
  return {
    title: st.title,
    keys:  st.keys,
    /* Live, not cached: a category rename changes this without changing the card object. */
    meta:  normHay([label]),
    /* Each group is already folded, collapsed and trimmed, so joining with single spaces
       reproduces the one-pass normHay byte for byte; filter(Boolean) keeps an empty group
       from introducing a double space. Verified against the pre-cache implementation. */
    body:  [st.bodyA, live, st.bodyB].filter(Boolean).join(" ")
  };
}
/* THE INDEX IS KEPT ON THE STATIC RECORD against the only two inputs the static half does not
   cover, the live half and the raw category label, so a card asked about five times in one
   settle (the list, its score, the counts, the category rank and its scores) builds and joins
   its haystack once. The live half comes back as the same string while cardFillKey holds, so
   the compare is a pointer, not a scan. */
function cardSearchIndex(m){
  let st=null, live="", label="";
  if(m){
    st=cardStaticHay(m);
    live=cardLiveHay(m, st);
    label=CATS[m.c]||m.c||"";
    if(st.idx && st.idxLive===live && st.idxLabel===label) return st.idx;
  }
  const fields=cardSearchFields(m, st, live, label);
  /* Plain join, not normHay: the four fields are already lowercased, collapsed and
     trimmed - re-running the regex over the body is a second full pass for nothing.
     Empties dropped so the join stays single-spaced, identical to the old single blob. */
  const hay=[fields.title,fields.keys,fields.meta,fields.body].filter(Boolean).join(" ");
  /* uniq, mTerms, match and sq are the per-query memos, one slot each: see cardMatchesSearch. */
  const idx={hay, fields, words:{}, allWords:splitWords(hay), uniq:null, mTerms:null, match:false, sq:null};
  SEARCH_FIELDS.forEach(f=>{ idx.words[f]=splitWords(fields[f]); });
  if(st){ st.idx=idx; st.idxLive=live; st.idxLabel=label; }
  return idx;
}
/** The same terms in the same order. Compared by value, never by the array's identity: a
    caller may build its terms afresh for every pass, or reuse one array and change it. */
function sameTerms(a, b){
  if(!a || !b || a.length!==b.length) return false;
  for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return false;
  return true;
}
/* Terms must arrive already lowercased AND diacritic-folded - cardSearchTerms() is the one
   place that produces them, and the index is folded, so an unfolded term silently matches
   nothing. Any new caller must fold first rather than passing raw input straight in. */
function cardMatchesSearch(m, terms){
  if(!terms||!terms.length) return true;
  const idx=cardSearchIndex(m);
  /* ONE ANSWER PER INDEX AND QUERY: a fresh index is a changed card, fill or label, so the
     memo cannot outlive what it was computed from. */
  if(sameTerms(idx.mTerms, terms)) return idx.match;
  const hay=idx.hay;
  // Same rule as the intent box: exact substring, or a word sharing enough of a prefix.
  let hit=terms.every(t=>hay.indexOf(t)!==-1);
  if(!hit){
    // Each language appears about three times over in the haystack, so its words are scanned once each.
    const uniq=idx.uniq||(idx.uniq=[...new Set(idx.allWords)]);
    hit=terms.every(t => hay.indexOf(t)!==-1 || uniq.some(w=>wordMatchesTerm(w,t)));
  }
  idx.mTerms=terms.slice(); idx.match=hit;
  return hit;
}

export {
  SEARCH_FIELDS,
  cardSearchIndex,
  cardMatchesSearch,
  sameTerms
};
