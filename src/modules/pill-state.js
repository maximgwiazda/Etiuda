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
/* Width is layout, so the glide is a scale from the left edge and a translate for whoever
   that shifts. The scale is a registered property and the children counter-scale by it,
   so the letters keep their size. Reads land before the old widths go back. The 1.5px
   floor is fractional DPRs. If those old widths move a line, flipPills holds the row.
   The replay records a width only while a transition names one: the name is written and
   taken off before the reflow, and the frame that paints carries the transform. */
function tweenPillWidths(els, w0, before){
  if(mgReduceMotion()) return;
  // A second count must not read the scaled boxes of a glide still on the compositor.
  const drop=pills._eWN||[];
  clearTimeout(pills._eWT); pills._eWT=0;
  const clearScale=el=>{
    el.style.removeProperty("scale");
    el.style.removeProperty("--pill-sx");
    el.querySelectorAll(":scope > *").forEach(ch=>{
      ch.style.removeProperty("scale");
      ch.style.removeProperty("transform-origin");
    });
  };
  drop.forEach(el=>{
    el.style.transition="none";
    el.style.transform="";
    el.style.willChange="";
    el.style.transformOrigin="";
    clearScale(el);
    if(el.style.width) el.style.width="";
    el.style.transition="";
  });
  pills._eWN=[];
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
  const ease="var(--m-move) "+E_EASE;
  const named=["width", ease].join(" ");
  grew.forEach((g,el)=>{ el.style.transition=named; el.style.width=g.w1+"px"; });
  grew.forEach((g,el)=>{ el.style.transition="none"; el.style.width=""; });
  const moves=[];
  kids.forEach(el=>{
    const box=end.get(el);
    if(!box) return;
    const dx=Math.round(startLeft.get(el)-box.left);
    const g=grew.get(el);
    if(!dx && !g) return;
    moves.push({el, dx, sx:g?g.w0/g.w1:1});
  });
  if(!moves.length) return;
  moves.forEach(m=>{
    m.el.style.transition="none";
    m.el.style.willChange="transform";
    m.el.style.transformOrigin="left center";
    const part=[];
    if(m.dx) part.push("translateX("+m.dx+"px)");
    m.el.style.transform=part.join(" ");
    if(Math.abs(m.sx-1)>0.001){
      m.el.style.setProperty("--pill-sx", String(m.sx));
      m.el.style.setProperty("scale", "var(--pill-sx) 1");
      m.el.querySelectorAll(":scope > *").forEach(ch=>{
        ch.style.transformOrigin="left center";
        ch.style.setProperty("scale", "calc(1 / var(--pill-sx)) 1");
      });
    }
  });
  // One reflow commits the inverted transform. A frame is not a commitment: see flipPills.
  void pills.offsetHeight;
  moves.forEach(m=>{
    m.el.style.transition=Math.abs(m.sx-1)>0.001
      ? "transform "+ease+", --pill-sx "+ease
      : "transform "+ease;
    m.el.style.transform="";
    if(Math.abs(m.sx-1)>0.001) m.el.style.setProperty("--pill-sx", "1");
  });
  pills._eWN=moves.map(m=>m.el);
  const timer=setTimeout(()=>{
    const nodes=pills._eWN||[];
    pills._eWN=[];
    nodes.forEach(el=>{
      el.style.transition="";
      el.style.transform="";
      el.style.willChange="";
      el.style.transformOrigin="";
      clearScale(el);
      el.style.width="";
    });
  },220);
  pills._eWT=timer;
  if(timer && timer.unref) timer.unref();
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
