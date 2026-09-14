import { pills } from "./dom.js";
import { E_EASE } from "./motion.js";
/** Update the numbers already on screen without rebuilding the row - drawPills() replaces every
 *  node, which would restart the regroup FLIP and drop drag state on every keystroke. */
/* THE PILL ROW CHANGES AS ONE THING: numbers, dimming and order land together on the
   settle - two truths about one query must not arrive at different moments. Between
   keystrokes it holds the last complete statement; the card list lands on the same
   settle, the answer arriving beside its summary. */
function syncPillCounts(){
  if(!pills) return;
  schedulePillOrder();
}
/** The numbers and the dimmed state, written in place. Used when nothing has to move - drawPills
 *  writes both itself when the row is rebuilt, so a reorder never needs this as well.
 *  A count changing digits changes the pill's WIDTH, and a snap there reads as a glitch the
 *  row's own FLIP never allows - so widths tween. Reads batched before writes: interleaved,
 *  every pill costs a forced layout. */
function writePillCounts(){
  if(!pills) return;
  const sc=searchCounts();
  const els=Array.prototype.slice.call(pills.querySelectorAll(".pill[data-k]"));
  const w0=els.map(el=>el.getBoundingClientRect().width);
  els.forEach(el=>{
    const k=el.dataset.k, b=el.querySelector("b");
    if(!b) return;
    const n = sc ? (k==="" ? (sc.__all||0) : (sc[k]||0))
                 : (k==="" ? totalMacroCount() : (counts[k]||0));
    b.textContent=String(n);
    el.classList.toggle("pill-nohit", !!sc && !n && k!=="");
  });
  tweenPillWidths(els, w0);
}
/* FLIP for the horizontal axis: start at the old width, force one layout, release to the
   new. Inline width is the animation and must leave when it ends, or the pill stops
   following its own content. The 1.5px floor is for fractional DPRs, where rounding makes
   every pill "change" on every pass. HEIGHT IS THE INVARIANT: frozen start widths in the
   new order can flip a row break, doubling the bar for the tween's length - so if applying
   them moves the bar's height at all, the whole width tween rolls back and only snaps. */
function tweenPillWidths(els, w0){
  const grew=[];
  /* scrollHeight, never offsetHeight: the auto-hidden bar wears max-height plus
     overflow:hidden, which clamps offsetHeight to two lines on BOTH reads - the guard went
     blind exactly where the clip put the rewrap out of sight, and the tween played it. */
  const hNat=pills.scrollHeight;
  els.forEach((el,i)=>{
    const w1=el.getBoundingClientRect().width;
    if(Math.abs(w1-w0[i])<1.5) return;
    el.style.transition="none";
    el.style.width=w0[i]+"px";
    grew.push({el, w:w1});
  });
  if(!grew.length) return;
  void pills.offsetHeight;
  if(pills.scrollHeight!==hNat){
    grew.forEach(g=>{ g.el.style.transition=""; g.el.style.width=""; });
    return;
  }
  /* Attached two frames on, once the render this rides on has painted: width is a
     main-thread animation and loses its opening to that paint - see animateTabInsert. */
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    grew.forEach(g=>{
      g.el.style.transition="width .18s "+E_EASE;
      g.el.style.width=g.w+"px";
      clearTimeout(g.el._eWT);
      g.el._eWT=setTimeout(()=>{ g.el.style.transition=""; g.el.style.width=""; },220);
    });
  }));
}
/* Counts live, ORDER settles at 400ms: live ordering rebuilt the bar per character
   (73-337ms) under the typing hand. 400 clears a deliberate pace's inter-key gap and the
   180ms FLIP, so a settle cannot begin while the last one animates. Non-typing paths
   arrive as a single call and settle once. */
let ePillOrderT=0;
function schedulePillOrder(){
  clearTimeout(ePillOrderT);
  ePillOrderT=setTimeout(syncPillOrder,400);
}
/** Settle NOW. Entering or leaving macro search is a deliberate act with nothing following it,
 *  so the row should answer immediately rather than sit 400ms behind a decision already made. */
function flushPillState(){
  clearTimeout(ePillOrderT);
  syncPillOrder();
}

export {
  syncPillCounts,
  writePillCounts,
  flushPillState
};
