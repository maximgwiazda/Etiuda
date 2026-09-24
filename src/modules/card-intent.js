import { isAlwaysCat } from "./cat-roles.js";
import { isFavourite } from "./pack.js";
import { intentIdAt } from "./intent-id.js";
import { CATS } from "./content-model.js";
import { intentIdxs, cards } from "./app-state.js";

// Card ↔ intent links. Built-ins store base indices (0..BASE_N-1); customs store
// stable ids ("i:4", "ui:…"). Matching always goes through intentIdAt().
function normalizeCardIntents(m){
  return (m&&m.intents?m.intents:[]).map(x=>{
    /* Resolve through intentIdAt, never hardcode "i:"+x: at or above BASE_N the intent is
       custom and its real id lives in pack.intentCustom - the literal made a dead link
       that silently did nothing. Below BASE_N the output is identical. Numeric links stay
       positional by nature; the editor writes string ids for exactly that reason. */
    if(typeof x==="number" && Number.isFinite(x)) return intentIdAt(x);
    return String(x);
  }).filter(Boolean);
}
/* THE definition of "this card belongs to this intent" - everything green derives from
   it. One function on purpose: two copies drifted the moment a third way of linking was
   added, and the pill and the cards inside it disagreed about the same intent. */
function cardLinksIntent(m,want){
  if(!m||m._hidden) return false;
  if(m.allIntents) return true;               // linked to every intent, card by card
  return normalizeCardIntents(m).indexOf(want)>-1;
}
function cardHitsSelectedIntent(m){
  if(!intentIdxs.length) return false;
  // A hidden entry is never ringed. It follows that it never sorts into a ring band either,
  // so hiding something genuinely gets it out of the way rather than only dimming it.
  return intentIdxs.some(i=>cardLinksIntent(m,intentIdAt(i)));
}
/* Blue: this card sits in a SUPPORTING category. ("Supporting" is the user-facing word;
   the stored key is `always`, kept for the format-1 contract - hence the identifiers.)
   Green wins: a card answering the question asked never also rings blue. */
function cardHitsAlwaysCat(m){
  return !!(intentIdxs.length && m && !m._hidden && isAlwaysCat(m.c) && !cardHitsSelectedIntent(m));
}
/* Lower rank sorts first: intentTop greens -> green+fav -> greens -> blue+fav -> blues
   -> rest. INTENT-TOP OUTRANKS A STAR inside the band: a star is a fact about the agent,
   intentTop is where this intent STARTS. The star still lifts within every band. NEVER
   key behaviour off catalog text - a rename must not move a card between bands. */
function intentHitRank(m){
  const hit=cardHitsSelectedIntent(m);
  if(hit){
    /* Star before "top of group", matching the band - see cmpCardDisplay. A filtered view has
       no band, so this is the same ruling reaching the same cards by the other path. */
    if(isFavourite(m&&m.id)) return 0;
    if(m&&m.intentTop) return 1;
    return 2;
  }
  if(cardHitsAlwaysCat(m)){
    if(isFavourite(m&&m.id)) return 3;
    return 4;
  }
  /* A star lifts within EVERY band - one undifferentiated rest-rank made starring an
     unlinked card move nothing while the star lit up. */
  if(isFavourite(m&&m.id)) return 5;
  return 6;
}
// Sort / drag band when an intent is on (numeric). When no intent, use displayBandKey.
function relevanceRank(m){
  if(intentIdxs.length) return intentHitRank(m);
  return isFavourite(m&&m.id) ? 0 : 1;
}

/* The one-line category tag under an intent's name (panel, card editor, Manage).
   OPENER-role categories are left out: the role links them to every intent, and a label
   identical everywhere says nothing while hiding the differences. They still show where
   they ARE information: the pill's green ring, the editor's ticked chip. */
/* Derived: it names what will actually ring green. Role categories are left out - the
   link role puts them on every intent, and a label identical everywhere says nothing. */
function intentTagCats(i){
  /* Only categories this intent reaches SPECIFICALLY. A card flagged linked-to-every-intent puts
     its category on every intent, so naming it here would repeat the same word under every row -
     and a label identical everywhere tells you nothing while hiding the real differences. */
  const want=intentIdAt(i), out=[], seen={};
  (cards||[]).forEach(m=>{
    if(!m||!m.c||!CATS[m.c]||seen[m.c]) return;
    if(normalizeCardIntents(m).indexOf(want)<0) return;
    seen[m.c]=1; out.push(m.c);
  });
  return out;
}
function primaryCatLabel(i){
  return intentTagCats(i).map(k=>CATS[k]||k).filter(Boolean).join(" · ");
}
/* THE ONE CATEGORY A ROW WEARS when an intent's cards span several: the one holding the most of
   them. A tie goes to the CATALOG's declared order and never to catOrder - the same authority
   catSlot reads for a colour, and for its reason: rearranging the pills must not change a mark.
   Same set of cards as intentTagCats, so the mark names what the words named. */
/* primaryCatKey for every intent in one pass over the cards, by intent id, same tie rule:
   asked per intent, each row of the rail walked the whole catalog. */
function primaryCatKeys(){
  const per=new Map();
  (cards||[]).forEach(m=>{
    if(!m||!m.c||!CATS[m.c]) return;
    new Set(normalizeCardIntents(m)).forEach(id=>{
      let n=per.get(id); if(!n){ n={}; per.set(id,n); }
      n[m.c]=(n[m.c]||0)+1;
    });
  });
  const keys=Object.keys(CATS), out=new Map();
  per.forEach((n,id)=>{
    let best="", most=0;
    keys.forEach(k=>{ if((n[k]||0)>most){ most=n[k]; best=k; } });
    out.set(id,best);
  });
  return out;
}
function primaryCatKey(i){
  const want=intentIdAt(i), n={};
  (cards||[]).forEach(m=>{
    if(!m||!m.c||!CATS[m.c]) return;
    if(normalizeCardIntents(m).indexOf(want)<0) return;
    n[m.c]=(n[m.c]||0)+1;
  });
  let best="", most=0;
  Object.keys(CATS).forEach(k=>{ if((n[k]||0)>most){ most=n[k]; best=k; } });
  return best;
}

export {
  intentTagCats,
  primaryCatLabel,
  primaryCatKey,
  primaryCatKeys,
  normalizeCardIntents,
  cardLinksIntent,
  cardHitsSelectedIntent,
  cardHitsAlwaysCat,
  relevanceRank
};
