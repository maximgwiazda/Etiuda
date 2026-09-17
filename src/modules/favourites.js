import { findCard } from "./card-model.js";
import { SW_EN } from "./content-model.js";
import { pack, savePack } from "./pack.js";
import { drawIntentRail } from "./rail-list.js";
import { ask, toast } from "./ui-lang.js";
import { drawPills, saveTabSession, tabs } from "./tabs.js";
import { intentIdAt, intentIdxFromId, intentIsCustom, intentOrder, isIntentHiddenIdx, saveIntentOrder, setIntentOrder } from "./intent-id.js";
import { recountMacros } from "./card-counts.js";
import { rebuildCards, refreshAfterIntents, rebuildIntents } from "./rebuild.js";
import { cards, setIntentIdxs, intentIdxs } from "./app-state.js";
import { hooks } from "./hooks.js";

// The acts a star, a hide or a removal performs on the desk's own lists, and the order
// invariant they all have to keep. Whether something IS starred is asked in pack.js.
// ---- favourites (★) ----------------------------------------------------------
function toggleFavourite(id){
  if(!id) return;
  if(!Array.isArray(pack.favourites)) pack.favourites=[];
  const i=pack.favourites.indexOf(id);
  if(i>-1){
    pack.favourites.splice(i,1);
    toast("Removed from Favourites");
  } else {
    pack.favourites.push(id);
    /* Hidden and favourite are mutually exclusive - hiding strips the star, so starring has to
       lift the hide, or a greyed, bottom-sorted entry could sit under the Favourites landmark
       at the top of the list. */
    if(Array.isArray(pack.hidden)){
      const h=pack.hidden.indexOf(id);
      if(h>-1){
        pack.hidden.splice(h,1);
        /* AND clear the runtime flag, exactly as hideCard does - it is derived in rebuildCards,
           so lifting the hide only in storage leaves the card grey for the session with an
           eye that hides it afresh. Read from `cards`, never findCard(): that falls back to
           BASE_M, and a display flag on a catalog entry outlives the pack that owns it. */
        const m=(cards||[]).find(x=>x&&x.id===id);
        if(m) delete m._hidden;
      }
    }
    /* Does NOT touch cardOrder - the one record of where a card sits, and a move there is
       not undoable. The sort already lifts favourites, so the visible jump happens anyway,
       and unstarring puts the card back exactly where it was. */
    toast("Added to Favourites");
  }
  savePack();
  /* Prune and recount without a full rebuild: a star changes no pill - not a count, not a
     ring - so redrawing the bar could only cost (a pill mid-drag, a FLIP mid-flight). */
  syncFavouritesMeta();
  hooks.render();
}
// ---- intent favourites (★) ---------------------------------------------------
/** Keep intentOrder as [favourites…, regulars…] so rail + dropdown match; optional pin to top of favs.
 *  Hidden intents stay in this order (greyed in Manage) - filtered out only when drawing the rail/combo. */
/* Normaliser only: every live intent exactly once, invalid entries dropped, order
   otherwise untouched. Favourites are a DISPLAY band (intentRows) - intentOrder is purely
   the user's drag order, so unstarring is a true undo with nothing to remember. */
function syncIntentOrder(){
  if(!Array.isArray(intentOrder)) setIntentOrder([]);
  const seen={}, out=[];
  function place(i){
    i=+i;
    if(!Number.isInteger(i)||i<0||i>=SW_EN.length||seen[i]) return;
    seen[i]=1; out.push(i);
  }
  intentOrder.forEach(place);
  for(let i=0;i<SW_EN.length;i++) place(i);
  setIntentOrder(out);
  saveIntentOrder();
}
/* Removal is the third state, below hidden: gone from the interface and from an export,
   recoverable by Reset because it lives in the pack and the catalog keeps the entry. A
   custom has nothing to recover from and is spliced for real - Reset wipes customs anyway,
   so "Reset brings it back" stays true either way. */
function removeCard(id){
  if(!id) return false;
  const m=findCard(id);
  const isCustom=!!(m&&m._custom);
  if(!ask(isCustom
    ? "Delete this custom card?\n\nIt disappears from Etiuda and from anything you export. The catalog has no version to restore."
    : "Delete this card?\n\nIt disappears from Etiuda and from anything you export. Reset restores it from the catalog.")) return false;
  if(isCustom) pack.custom=(pack.custom||[]).filter(x=>x&&x.id!==id);
  else {
    if(!Array.isArray(pack.removed)) pack.removed=[];
    if(pack.removed.indexOf(id)<0) pack.removed.push(id);
  }
  if(pack.overrides) delete pack.overrides[id];
  pack.hidden=(pack.hidden||[]).filter(x=>x!==id);
  pack.favourites=(pack.favourites||[]).filter(x=>x!==id);
  pack.cardOrder=(pack.cardOrder||[]).filter(x=>x!==id);
  hooks.cardOrderTouched();
  savePack(); rebuildCards();
  toast("Card deleted");
  return true;
}
/* No in-place title rename here - a card has a full editor, so there is one rename
   path. Its virtue, writing a partial override, lives on in overrideAgainstBase. */
/* CUSTOM INTENTS ARE ADDRESSED BY POSITION, so deleting one slides every later custom down
   a slot and every stored index above it points one intent to the right - a selection that
   silently becomes a DIFFERENT customer-facing clause, in this tab and in every other one.
   Only the custom branch needs this: a base intent is soft-removed and keeps its slot. */
function shiftIntentIdxAfterRemoval(at){
  const fix=a=>a.filter(i=>i!==at).map(i=>i>at?i-1:i);
  setIntentIdxs(fix(intentIdxs));
  setIntentOrder(fix(intentOrder));
  if(typeof tabs!=="undefined" && Array.isArray(tabs)){
    tabs.forEach(tb=>{ if(tb&&Array.isArray(tb.intentIdxs)) tb.intentIdxs=fix(tb.intentIdxs); });
    saveTabSession();
  }
  saveIntentOrder();
}
function removeIntent(id){
  if(!id) return false;
  const idx=intentIdxFromId(id);
  const isCustom=idx>=0 && intentIsCustom(idx);
  if(!ask(isCustom
    ? "Delete this custom intent?"
    : "Delete this intent?\n\nIt disappears from Etiuda and from anything you export. Reset restores it from the catalog.")) return false;
  if(isCustom){
    pack.intentCustom=(pack.intentCustom||[]).filter(x=>x&&x.id!==id);
    shiftIntentIdxAfterRemoval(idx);
  }
  else {
    if(!Array.isArray(pack.intentRemoved)) pack.intentRemoved=[];
    if(pack.intentRemoved.indexOf(id)<0) pack.intentRemoved.push(id);
  }
  if(pack.intentOverrides) delete pack.intentOverrides[id];
  pack.intentHidden=(pack.intentHidden||[]).filter(x=>x!==id);
  pack.intentFavourites=(pack.intentFavourites||[]).filter(x=>x!==id);
  savePack();
  refreshAfterIntents();
  toast("Intent deleted");
  return true;
}
/** Hidden intents stay in the panel, greyed and at the bottom, and drop out of every search
 *  surface. Shared by the panel and Manage so the rule cannot drift between them. */
function setIntentHidden(id, hidden){
  if(!id) return;
  if(!Array.isArray(pack.intentHidden)) pack.intentHidden=[];
  const at=pack.intentHidden.indexOf(id);
  if(hidden){
    if(at<0) pack.intentHidden.push(id);
    // hidden and favourite are mutually exclusive, same rule as cards
    pack.intentFavourites=(pack.intentFavourites||[]).filter(x=>x!==id);
  } else if(at>-1){
    pack.intentHidden.splice(at,1);
  }
  savePack();
  /* refreshAfterIntents() unpacked so the expensive third can be skipped: render()
     rebuilds every card, and hiding an intent changes the list only through the SELECTION,
     which rebuildIntents() has just settled. Hiding now costs what starring costs. */
  const selBefore=intentIdxs.join(",");
  rebuildIntents();
  drawPills();
  // The rail's hide button flips around this call - the redraw must land inside it.
  drawIntentRail();
  if(intentIdxs.join(",")!==selBefore) hooks.render();
  toast(hidden ? "Intent hidden - greyed and moved to the bottom" : "Intent shown again");
}
/* Starring and unstarring touch nothing but pack.intentFavourites. Because favourites are a
   display band, an unstarred intent simply stops being lifted and reappears exactly where it
   sits in intentOrder - no stored slot, no restore step, nothing to keep in sync. */
function toggleIntentFavourite(id){
  if(!id) return;
  if(!Array.isArray(pack.intentFavourites)) pack.intentFavourites=[];
  const i=pack.intentFavourites.indexOf(id);
  if(i>-1){
    pack.intentFavourites.splice(i,1);
    toast("Intent removed from Favourites");
  } else {
    pack.intentFavourites.push(id);
    // starring lifts a hide, so the two states can never both be true
    pack.intentHidden=(pack.intentHidden||[]).filter(x=>x!==id);
    toast("Intent added to Favourites");
  }
  // Drop ids that no longer exist
  const alive=new Set();
  for(let j=0;j<SW_EN.length;j++){
    if(!isIntentHiddenIdx(j)) alive.add(intentIdAt(j));
  }
  pack.intentFavourites=pack.intentFavourites.filter(x=>alive.has(x));
  savePack();
  drawIntentRail();
}
function syncFavouritesMeta(){
  /* Departed ids take their stars and their tallies - but ONLY while a CATALOG is loaded.
     Pruning without one treats every card as deleted, so a single boot after an eject, a
     missing sibling or a failed import silently erases the lot. Custom cards do not count as
     a catalog: after an eject they are all that is left, and pruning against just them drops
     every star the catalog will bring back. */
  const alive=new Set((cards||[]).map(m=>m&&m.id).filter(Boolean));
  const hasCatalog=(cards||[]).some(m=>m&&!m._custom);
  if(hasCatalog) pack.favourites=(pack.favourites||[]).filter(id=>alive.has(id));
  if(hasCatalog && pack.useCounts && typeof pack.useCounts==="object"){
    Object.keys(pack.useCounts).forEach(id=>{ if(!alive.has(id)) delete pack.useCounts[id]; });
  }
  /* No virtual "fav" category: it bought one pill and cost an "...except fav" in thirty
     places - it was never a category. A star is a mark ON a card: it lifts the card where
     it lives. Stored packs may still carry "fav" for one boot - rebuildCards filters both
     lists against CATS. */
  recountMacros();
}

export {
  toggleFavourite, toggleIntentFavourite, syncFavouritesMeta,
  syncIntentOrder, removeCard, removeIntent, setIntentHidden,
};
