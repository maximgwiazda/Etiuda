import { pills } from "./dom.js";
import { E_EASE, mgReduceMotion } from "./motion.js";
import { displayCatOrder, intentCats } from "./cat-relevance.js";
import { CATS } from "./content-model.js";
import { listPillKeys } from "./pill-walk.js";
import { drawPills } from "./tabs.js";
import { flipPills, pillLines } from "./paint.js";
import { searchCounts, totalMacroCount, counts } from "./card-counts.js";
import { capturePills } from "./pills-bar.js";
import { dragState } from "./app-state.js";

/* THE SETTLE: everything the row says about the query lands here - order moved = full
   drawPills rebuild (numbers and dimming ride along); order unchanged = numbers written
   in place. Never a half-updated row. The rebuild is gated on the order actually
   differing, compared as a joined string - typing moves counts every keystroke and order
   rarely. Never mid-drag: a rebuild is the one thing a drag visibly breaks. */
function syncPillOrder(){
  if(!pills || (typeof dragState!=="undefined" && dragState)) return;
  const want=displayCatOrder(intentCats()).filter(k=>CATS[k]);
  const have=listPillKeys().filter(Boolean);
  // Nothing drawn yet (a boot's first render): the ordinary drawPills is about to do this anyway.
  if(!have || !have.length || want.join(" ")===have.join(" ")){ writePillCounts(); return; }
  const before=capturePills();
  drawPills();
  flipPills(before);
}
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
  const before=capturePills();
  const w0=els.map(el=>el.getBoundingClientRect().width);
  els.forEach(el=>{
    const k=el.dataset.k, b=el.querySelector("b");
    if(!b) return;
    const n = sc ? (k==="" ? (sc.__all||0) : (sc[k]||0))
                 : (k==="" ? totalMacroCount() : (counts[k]||0));
    b.textContent=String(n);
    el.classList.toggle("pill-nohit", !!sc && !n && k!=="");
  });
  tweenPillWidths(els, w0, before);
}
let pillWidthT=0, pillWidthNodes=[];
/* A second count arrives while the first glide is still on the compositor. Drop that
   glide before the new widths are read, or the rects are the scaled boxes. */
function clearPillWidthMotion(){
  clearTimeout(pillWidthT); pillWidthT=0;
  pillWidthNodes.forEach(el=>{
    el.style.transition="none";
    el.style.transform="";
    el.style.willChange="";
    el.style.transformOrigin="";
    if(el.style.width) el.style.width="";
    el.style.transition="";
  });
  pillWidthNodes=[];
}
function armPillWidthMotion(nodes){
  pillWidthNodes=nodes.slice();
  pillWidthT=setTimeout(clearPillWidthMotion,220);
  if(pillWidthT && pillWidthT.unref) pillWidthT.unref();
}
/* THE WIDTH GLIDE IS A SCALE, NOT A WIDTH. Width is layout, so transitioning it measures
   the row on every frame. The new boxes are read first and the old widths go back in one
   pass. The 1.5px floor is for fractional DPRs, where rounding makes every pill "change"
   on every pass. THE WRAP IS THE INVARIANT: frozen start widths can move a row break, and
   a pill then leaps between lines mid-glide, so if applying them moves any pill to another
   line the row goes to flipPills from `before`, which holds it on its new lines. Otherwise
   the inline width leaves and each changed pill scales from its old width on its left edge,
   while a neighbour that shifted slides by translate. Both are one transform on one curve,
   so the gap between them holds. Inline width must be gone when the glide ends, or the pill
   stops following its own content. */
function tweenPillWidths(els, w0, before){
  if(mgReduceMotion()) return;
  clearPillWidthMotion();
  const lines=pillLines();
  const kids=Array.prototype.slice.call(pills.children);
  const end=new Map();
  kids.forEach(el=>{
    const r=el.getBoundingClientRect();
    end.set(el,{w:r.width, left:r.left});
  });
  const grew=new Map();
  els.forEach((el,i)=>{
    const box=end.get(el);
    if(!box || !(box.w>0) || Math.abs(box.w-w0[i])<1.5) return;
    el.style.transition="none";
    el.style.width=w0[i]+"px";
    grew.set(el,{w0:w0[i], w1:box.w});
  });
  if(!grew.size) return;
  if(pillLines()!==lines){
    grew.forEach((g,el)=>{ el.style.transition=""; el.style.width=""; });
    flipPills(before);
    return;
  }
  const startLeft=new Map();
  kids.forEach(el=>startLeft.set(el, el.getBoundingClientRect().left));
  grew.forEach((g,el)=>{ el.style.width=""; });
  const moves=[];
  kids.forEach(el=>{
    const box=end.get(el);
    if(!box) return;
    const dx=Math.round(startLeft.get(el)-box.left);
    const g=grew.get(el);
    if(!dx && !g) return;
    moves.push({el, dx, sx:g?g.w0/g.w1:1});
  });
  if(!moves.length){
    grew.forEach((g,el)=>{ el.style.transition=""; el.style.width=""; });
    return;
  }
  moves.forEach(m=>{
    m.el.style.transition="none";
    m.el.style.willChange="transform";
    m.el.style.transformOrigin="left center";
    const part=[];
    if(m.dx) part.push("translateX("+m.dx+"px)");
    if(Math.abs(m.sx-1)>0.001) part.push("scaleX("+m.sx+")");
    m.el.style.transform=part.join(" ");
  });
  // One reflow commits the inverted transform. A frame is not a commitment: see flipPills.
  void pills.offsetHeight;
  const ease="var(--m-move) "+E_EASE;
  moves.forEach(m=>{
    m.el.style.transition="transform "+ease;
    m.el.style.transform="";
  });
  armPillWidthMotion(moves.map(m=>m.el));
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
  syncPillOrder,
  syncPillCounts,
  writePillCounts,
  flushPillState
};
