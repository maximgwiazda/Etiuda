import { ALWAYS_CATS } from "./cat-roles.js";
import { CATS } from "./content-model.js";
import { mgReduceMotion } from "./motion.js";
import { t } from "./ui-lang.js";
import { cardLinksIntent, normalizeCardIntents } from "./card-intent.js";
import { intentIdAt } from "./intent-id.js";

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
/* "Does this intent belong to this category", for floating matching intents to the top
   of the card editor's 42-entry list. Derived from card links like everything else - and
   the better answer: it floats at least as many intents per category as the declared
   field did, more for the busiest ones. */
function intentHasPrimaryCat(i, cat){
  return !!cat && categoriesForIntent(i).indexOf(cat)>-1;
}
// Categories the selected {INTENT}(s) touch: every category that
// has a card linked to that intent (so one intent can light up several green pills).

/* Green derives ENTIRELY from card links - a second declared source could disagree, and
   a category could ring green while every card inside stayed grey. Green means one thing:
   this category holds a card linked to this intent. */
function categoriesForIntent(i){
  const out=[], seen={};
  const add=k=>{ if(k&&!seen[k]&&CATS[k]){ seen[k]=1; out.push(k); } };
  const want=intentIdAt(i);
  (cards||[]).forEach(m=>{
    if(!m||!m.c) return;
    /* No exemption for SUPPORTING categories: green outranks blue, so a linked card greens
       its category even when it is marked supporting - otherwise card and pill disagree
       about the same intent. */
    if(cardLinksIntent(m,want)) add(m.c);
  });
  return out;
}
/* Picking a category RE-RANKS the panel, so a scrolled panel shows the middle of an
   order that has just been rewritten - the top is the only place the new ranking means
   anything. Smooth unless motion is turned down, by the app's usual test: a system asking
   for reduced motion is honoured whether or not the app's own box is ticked. */
function scrollRailTop(){
  const el=document.getElementById("intentRailList");
  if(!el || !el.scrollTop) return;
  try{ el.scrollTo({top:0, behavior: mgReduceMotion()?"auto":"smooth"}); }
  catch(e){ el.scrollTop=0; }
}
function intentCats(){
  if(!intentIdxs.length) return {specific:[],always:[]};
  const specific=[], seen={};
  intentIdxs.forEach(i=>{
    categoriesForIntent(i).forEach(k=>{
      if(!seen[k]){ seen[k]=1; specific.push(k); }
    });
  });
  /* No special case for the opener any more: it reaches this set as a real category link on
     each intent, the same way every other green category does. */
  return {specific, always:ALWAYS_CATS};
}

/* Ring band for pill ordering, same precedence as the ring classes in mk():
   1 intent-linked (green) · 2 supporting (blue) · 3 the rest. Numbering starts at 1 on
   purpose: it is a precedence, not a census. */
function pillBand(k, hc){
  if(!hc) return 3;
  if(hc.specific.indexOf(k)>-1) return 1;
  if(hc.always.indexOf(k)>-1) return 2;
  return 3;
}
/** Display order only - NEVER mutates catOrder, the drag order, which must survive
 *  intents, searches and clearing unchanged. WHILE A QUERY IS LIVE: empty categories sink,
 *  live ones order by the CARD SORT'S OWN aggregated keys - never by count, which cannot
 *  tell "about it" from "merely mentions it": bestTier, then the damped score sum.
 *  Dragged order stays the final tiebreak. The search band is the OUTER key, above the
 *  intent bands - while narrowing, a green category holding nothing is noise and a grey
 *  one holding five is where you are going. Stable, with `i` final. */
/* WHAT A SIGNAL IS WORTH, not which tier it lands in: points add, so a category BOTH
   linked and always-useful outranks one that is merely either - a tier had to pick.
   Behind the search tier: an asterisk cannot push a generically useful category over the
   one the query names. */
const CAT_PTS_INTENT=100;   // the selected intent links cards that live here
const CAT_PTS_ALWAYS=50;    // somebody marked this category useful in every chat
function catIntentPoints(k,hc){
  if(!hc) return 0;
  let p=0;
  if(hc.specific.indexOf(k)>-1) p+=CAT_PTS_INTENT;
  if(hc.always.indexOf(k)>-1)   p+=CAT_PTS_ALWAYS;
  return p;
}
function displayCatOrder(hc){
  const sc=searchCounts();
  if(!sc && !intentIdxs.length) return catOrder.slice();
  return catOrder
    .map((k,i)=>{
      const cr=sc ? searchCatRank() : null;
      const r=cr ? cr[k] : null;
      return {k, i,
        s:(sc && !(sc[k]||0)) ? 1 : 0,        // empty categories to the tail
        t:r?r.tier:9,                          // then the category your query is ABOUT
        /* Under an intent the search rank is absent, so the points carry the order. */
        v:r?r.rank:(intentIdxs.length?catIntentPoints(k,hc):0),
        b:pillBand(k,hc)};
    })
    .sort((a,b)=>(a.s-b.s) || (a.t-b.t) || (b.v-a.v) || (a.b-b.b) || (a.i-b.i))
    .map(o=>o.k);
}

export {
  primaryCatLabel,
  intentHasPrimaryCat,
  categoriesForIntent,
  scrollRailTop,
  intentCats,
  pillBand,
  displayCatOrder
};
