import { intentEl, list } from "./dom.js";
import { toast } from "./ui-lang.js";
import { cssEsc } from "./css-esc.js";
import { scheduleTabSave } from "./tabs.js";
import { scrollPageTop } from "./page-scroll.js";
import { railOrder, intentIdxs, setRailMarkUsed, setSemiKind, putEntrySel, entrySel, semiKind, railMarkUsed, railSel, railMarkIdx, railSettled, setRailSel, setRailMarkIdx } from "./app-state.js";
import { hooks } from "./hooks.js";
// THE MARK, which is one thing over two surfaces: the intent the panel offers Enter, or the
// copyable block the cards hold. Which surface has it, how it walks, and how it crosses.

/* The walk steps OVER picked rows, as the resting mark already does (the rail build and the
   pick tail both seek the first unpicked row): a chosen intent is a fact of the reply, not a
   candidate, and a mark on it would offer Enter as an undo. -1 when every row is picked. */
function railStep(from,step){
  const n=railOrder.length; let pos=from;
  for(let i=0;i<n;i++){ pos=((pos+step)%n+n)%n; if(intentIdxs.indexOf(railOrder[pos])<0) return pos; }
  return -1;
}

function kbdNav(on){ document.body.classList.toggle("e-kbdnav", !!on); }
/* The flag goes off on the first pointer move, so a mark left by the keyboard cannot sit
   under a hand that has taken the mouse. A module may not register this at load. */
function wireKbdNav(){
  addEventListener("mousemove",()=>{
    if(document.body.classList.contains("e-kbdnav")) kbdNav(false);
  },{passive:true});
}
function railQuery(){
  return (typeof intentEl!=="undefined" && intentEl) ? String(intentEl.value||"").trim() : "";
}

function copy(text,msg){
  // Copying consumes the semi-selection - every copy, click or keyboard, funnels through here.
  setRailMarkUsed(true); setSemiKind(null);
  hooks.railDecorate(false);
  const done=()=>toast(msg);
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).then(done,()=>fallback(text,done));
  } else fallback(text,done);
}
function fallback(text,cb){
  const ta=document.createElement("textarea");
  ta.value=text; ta.style.cssText="position:fixed;opacity:0";
  document.body.appendChild(ta); ta.select();
  try{document.execCommand("copy");cb();}catch(e){toast("The browser blocked the copy, so select the text yourself.");}
  ta.remove();
}
function setEntrySel(id, vi, opts){
  opts=opts||{};
  if(id==null){ putEntrySel(null); hooks.markEntrySel(); return; }
  putEntrySel({id:String(id), vi:+vi||0});
  hooks.markEntrySel();
  if(opts.scroll && list){
    const el=list.querySelector('.card[data-id="'+cssEsc(entrySel.id)+'"] .txt[data-v="'+entrySel.vi+'"]');
    if(el) el.scrollIntoView({block:opts.block||"nearest", behavior:opts.smooth===false?"auto":"smooth"});
  }
  scheduleTabSave();
}
/* The mark to the far end of its own surface - and, when it is already there, across to
   the other surface's matching end. That second press is the only way to reach the cards
   without accepting an intent, and it is symmetric: the same press comes back. A surface
   with nothing active refuses the crossing, because grey means inactive. */
/* WHERE THE MARK IS, by the same test the decorator paints by - semiKind alone is not
   the answer: the mark a query puts on the best intent claims no surface, so it reads as
   null while being plainly visible. */
function markSurface(){
  if(semiKind==="card" || entrySel) return entrySel?"card":null;
  if(railMarkUsed) return null;
  const idx = railSel>=0 && railSel<railOrder.length ? railOrder[railSel] : railMarkIdx;
  if(idx<0) return null;
  return (railSel>=0 || semiKind==="intent" || (railQuery() && railSettled)) ? "intent" : null;
}
function markEnd(dir){
  const endPos=railStep(dir>0?railOrder.length:-1, dir>0?-1:1);   // the last or first UNPICKED row
  const railHas=endPos>=0;
  const els=hooks.listEntryEls();
  const cardHas=els.length>0;
  const onIntent = markSurface()==="intent";
  const atEnd = onIntent
    ? (railHas && railOrder.indexOf(railSel>=0?railOrder[railSel]:railMarkIdx)===endPos)
    : (!!entrySel && els.length
        && els[dir>0?els.length-1:0].closest(".card[data-id]").dataset.id===entrySel.id
        && +els[dir>0?els.length-1:0].dataset.v===entrySel.vi);
  let toIntent = onIntent ? !atEnd : atEnd;
  if(toIntent && !railHas) return !!onIntent;     // nothing to cross to - stay put
  if(!toIntent && !cardHas) return !!onIntent;
  kbdNav(true);
  if(toIntent){
    setSemiKind("intent"); setRailMarkUsed(false);
    if(entrySel){ putEntrySel(null); hooks.markEntrySel(); }
    setRailSel(endPos);
    setRailMarkIdx(railOrder[railSel]);
    hooks.railDecorate(true);
  }else{
    setSemiKind("card"); setRailSel(-1);
    hooks.railDecorate(false);
    const el=els[dir>0?els.length-1:0];
    const card=el.closest(".card[data-id]");
    setEntrySel(card.dataset.id, +el.dataset.v, {scroll:dir>0, block:"nearest"});
    if(dir<0) scrollPageTop();
  }
  return true;
}
export {
  wireKbdNav,
  railStep,
  kbdNav,
  railQuery,
  setEntrySel,
  markSurface,
  markEnd,
  copy,
  fallback,
};
