import { peekPillsForKey } from "./pill-nav-peek.js";
import { captureRail, railEchoRedraw, railRelKeys } from "./rail-list.js";
import { drawPills, scheduleTabSave } from "./tabs.js";
import { pills } from "./dom.js";
import { searchCounts } from "./card-counts.js";
import { render } from "./render.js";

/** Pill keys in on-screen order (All = "", then category order). [data-k] rather than
 *  .pill: the trailing "+" and the inline input are pills by class but not categories -
 *  mapped to "" they were indistinguishable from All (a real key), so ←/→ landed on the
 *  "+" and read as a dead press. Selecting on the attribute means a new control added to
 *  the strip cannot rejoin the keyboard cycle by accident. */
function listPillKeys(){
  if(!pills) return [];
  return Array.prototype.map.call(pills.querySelectorAll(".pill[data-k]"), el=>el.dataset.k);
}
/** ←/→ cycle category filter like a plain click (single pill; All clears filter). */
/* SHIFT IS THE SAME AXIS, ALL THE WAY - the compass's amplitude. The walkable set is
   navPill's own, so a search that hides empty categories hides them here too; All is
   skipped because "first category" means a category. */
function navPillEnd(dir){
  let keys=listPillKeys();
  if(!keys.length) return false;
  const sc=searchCounts();
  if(sc){
    const live=keys.filter(k=>!k || (sc[k]||0)>0);
    if(live.length>1) keys=live;
  }
  const real=keys.filter(Boolean);
  if(!real.length) return false;
  const k=dir>0?real[real.length-1]:real[0];
  if(cats.length===1 && cats[0]===k) return true;
  const railBefore=captureRail(), relBefore=railRelKeys();
  cats=[k];
  pendingScrollHit=!!intentIdxs.length;
  drawPills();
  render();
  railEchoRedraw(railBefore, relBefore);
  peekPillsForKey(k);
  scheduleTabSave();
  return true;
}
function navPill(dir){
  let keys=listPillKeys();
  if(!keys.length) return false;
  /* While a query is live, walk only the categories that contain matches - 25
     categories and a two-hit query meant pressing through twenty empty ones. All stays
     reachable always (empty key); the restriction drops if it would leave only All. */
  const sc=searchCounts();
  if(sc){
    const live=keys.filter(k=>!k || (sc[k]||0)>0);
    if(live.length>1) keys=live;
  }
  let i;
  if(!cats.length) i=0; // All
  else {
    i=keys.findIndex(k=>k && cats.indexOf(k)>-1);
    if(i<0) i=0;
  }
  const n=keys.length;
  i=((i+dir)%n+n)%n;
  const k=keys[i];
  // Captured before cats changes - see the pill click handler, same shape
  const railBefore=captureRail(), relBefore=railRelKeys();
  if(!k) cats=[];
  else cats=[k];
  pendingScrollHit=!!intentIdxs.length;
  drawPills();
  render();
  railEchoRedraw(railBefore, relBefore);
  // after drawPills, so the pill being measured is the one now on screen
  peekPillsForKey(k);
  /* The category walk moves the FILTER and nothing else - seeding the first block here
     minted a second mark and stole the surface from an intent mark the arrows were
     following. A card mark that survives the filter keeps working; one that does not is
     nulled by the render's own re-validation; with no mark, navEntry starts from the top
     on its own. */
  scheduleTabSave();
  return true;
}

export {
  listPillKeys,
  navPill,
  navPillEnd
};
