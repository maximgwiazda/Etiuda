import { affinityWordWeight, intentAffinityGroups, cardIntentAffinity } from "./affinity.js";
import { FIELD_WEIGHT, Q_EXACT } from "./scoring.js";

/** Category order for grouping. */
const CAT_UNKNOWN=1e6;   // every category not in catOrder shares this, and sorts after all of them
/* The old fallback (1000 + charCodeAt) returned NaN for a missing category - and a NaN
   comparator makes the whole sort undefined - and collided unknowns sharing a first
   letter, interleaving their cards. One shared index plus the key tie-break fixes both. */
function catSortIdx(c){
  const k=c||"";
  if(typeof catOrder==="undefined"||!Array.isArray(catOrder)) return CAT_UNKNOWN;
  const i=catOrder.indexOf(k);
  return i>=0 ? i : CAT_UNKNOWN;
}
/**
 * Drag band key: only reorder within the same band.
 * Intent on → intentHitRank (green / blue / fav combos). No intent → same category + same fav class.
 */
function displayBandKey(m){
  // Hidden is part of the band, so a hidden card cannot be dragged above a visible one
  const h=(m&&m._hidden)?"|h":"";
  if(intentIdxs.length) return String(relevanceRank(m))+h;
  return String(m&&m.c||"")+"|"+(isFavourite(m&&m.id)?"1":"0")+h;
}
/* Memoised: the tiebreak runs hundreds of times per sort and rescanning was O(n^2 log n).
   Dropped by cardOrderTouched(), called by every pack.cardOrder mutation; the size guard
   catches adds and removes but NOT reorders - the explicit call is not optional. */
let eOrderPos=null;        // id -> position in pack.cardOrder
let eOrderCards=null;      // the `cards` array the sync last ran against
function cardOrderTouched(){ eOrderPos=null; }
function ensureCardOrder(){
  if(!Array.isArray(pack.cardOrder)){ pack.cardOrder=[]; cardOrderTouched(); }
  // Only a rebuilt `cards` can change which ids are alive; hiding and starring mutate in place.
  if(eOrderCards===cards && eOrderPos && eOrderPos.size===pack.cardOrder.length) return;
  const alive=new Set((cards||[]).map(m=>m&&m.id).filter(Boolean));
  const listed=new Set(pack.cardOrder);
  const kept=pack.cardOrder.filter(id=>alive.has(id));
  let changed=kept.length!==pack.cardOrder.length;
  (cards||[]).forEach(m=>{
    if(m&&m.id&&!listed.has(m.id)){ kept.push(m.id); listed.add(m.id); changed=true; }
  });
  if(changed) pack.cardOrder=kept;
  eOrderCards=cards;
  cardOrderTouched();
}
/** Positions, built once and reused until something moves. */
function cardOrderPos(){
  if(!eOrderPos || eOrderPos.size!==pack.cardOrder.length){
    eOrderPos=new Map();
    for(let i=0;i<pack.cardOrder.length;i++) eOrderPos.set(pack.cardOrder[i],i);
  }
  return eOrderPos;
}
/* Which cards moved = the complement of the LONGEST INCREASING SUBSEQUENCE against the
   catalog's order - "index differs" would brand the whole list edited to explain one
   drag. O(n log n), memoised until the order or the card list changes. */
let eMovedSet=null, eMovedKey=null;
function movedCardIds(){
  ensureCardOrder();
  const key=(pack.cardOrder||[]).length+"|"+((cards||[]).length)+"|"+(pack.cardOrder||[]).join("");
  if(eMovedKey===key && eMovedSet) return eMovedSet;
  const base=new Map();
  (cards||[]).forEach((m,i)=>{ if(m&&m.id) base.set(m.id,i); });
  const seq=[], ids=[];
  (pack.cardOrder||[]).forEach(id=>{ if(base.has(id)){ seq.push(base.get(id)); ids.push(id); } });
  const tails=[], tailAt=[], prev=new Array(seq.length).fill(-1);
  for(let i=0;i<seq.length;i++){
    let lo=0, hi=tails.length;
    while(lo<hi){ const mid=(lo+hi)>>1; if(tails[mid]<seq[i]) lo=mid+1; else hi=mid; }
    tails[lo]=seq[i]; tailAt[lo]=i;
    prev[i]= lo>0 ? tailAt[lo-1] : -1;
  }
  const still=new Set();
  let k=tails.length ? tailAt[tails.length-1] : -1;
  while(k>=0){ still.add(ids[k]); k=prev[k]; }
  const moved=new Set();
  ids.forEach(id=>{ if(!still.has(id)) moved.add(id); });
  eMovedKey=key; eMovedSet=moved;
  return moved;
}
/** True while the drag order still matches the order the catalog was built in. */
function cardOrderIsBase(){
  ensureCardOrder();
  const o=pack.cardOrder||[], c=cards||[];
  if(o.length!==c.length) return false;
  for(let i=0;i<c.length;i++) if(c[i] && c[i].id!==o[i]) return false;
  return true;
}
function cardOrderIdx(id){
  ensureCardOrder();
  const i=cardOrderPos().get(id);
  return i===undefined ? 1e9 : i;
}
/**
 * Display sort:
 * - Intent on: green(+fav) → blue always-cat(+fav) → rest, then cardOrder within band.
 * - No intent: favourites → category order → cardOrder.
 */
/* MEMOISED PER SELECTION: cmpCardDisplay runs O(n log n) times and cardIntentAffinity
   walks every term against every field - raw, it is the sort's own quadratic. Groups
   rebuild when the selection changes; scores cache against the card object, which
   rebuildCards replaces whenever content does. */
/* The cut-off is a FRACTION (0.40) of this selection's own ceiling - raw scores are not
   comparable between intents. Read off the measured distribution's cliff: below it, cards
   shared one common label word while being about something else. DESCRIBED, NOT QUOTED:
   the labels behind the numbers are the employer's content and this file is public. */
const AFFINITY_SORT_MIN=0.40;
let eAffGroups=null, eAffKey=null, eAffCeil=0;
/* `let`, reassigned rather than cleared - a WeakMap has no clear(), and the scores
   depend on which intents are selected. It must be the SAME binding the lookup reads; a
   first draft reset a second variable nothing consulted. */
let eAffScore=new WeakMap();
function affinityOf(m){
  if(!m || !intentIdxs.length) return 0;
  const key=intentIdxs.join(",");
  if(key!==eAffKey){
    eAffKey=key;
    eAffGroups=intentAffinityGroups();
    /* The ceiling for THIS selection: per group, every term exact (Q_EXACT) in the title.
       Recomputed with the groups, because it moves with them. */
    eAffCeil=0;
    (eAffGroups||[]).forEach(g=>{
      let c=0;
      g.terms.forEach(t=>{ c+=Q_EXACT*FIELD_WEIGHT.title*affinityWordWeight(t,g.lang); });
      if(c>eAffCeil) eAffCeil=c;
    });
    eAffScore=new WeakMap();
  }
  if(!eAffGroups || !eAffGroups.length) return 0;
  const hit=eAffScore.get(m);
  if(hit!==undefined) return hit;
  let v=cardIntentAffinity(m, eAffGroups);
  /* BELOW THE LINE IS NO LIFT, not a small one: zero falls straight through to cardOrder,
     the order the list already had. Only the DISPLAY sort is gated - search keeps the raw
     score: there the user typed something, so a weak signal is still evidence, and it is
     one term among several rather than the whole basis of the order. */
  if(eAffCeil>0 && v < eAffCeil*AFFINITY_SORT_MIN) v=0;
  eAffScore.set(m,v);
  return v;
}

export {
  catSortIdx,
  displayBandKey,
  cardOrderTouched,
  ensureCardOrder,
  movedCardIds,
  cardOrderIsBase,
  cardOrderIdx,
  affinityOf,
  CAT_UNKNOWN
};
