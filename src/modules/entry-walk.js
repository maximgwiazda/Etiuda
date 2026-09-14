import { scrollPageTop } from "./page-scroll.js";
import { cssEsc } from "./css-esc.js";
import { list } from "./dom.js";

/** Cards in the order the LIST means, which is only document order while there is one
 *  column. See the stamping in applyCardColumns(). */
function listCardsOrdered(){
  if(!list) return [];
  const a=Array.prototype.slice.call(list.querySelectorAll(".card[data-id]"));
  if(!list.classList.contains("cols")) return a;
  return a.sort((x,y)=>(+x.dataset.ord||0)-(+y.dataset.ord||0));
}
/** All copyable blocks in list order (alts, steps, or single body). */
function listEntryEls(){
  const out=[];
  listCardsOrdered().forEach(c=>{
    Array.prototype.slice.call(c.querySelectorAll(".txt[data-v]")).forEach(t=>out.push(t));
  });
  return out;
}
function markEntrySel(){
  if(!list) return;
  list.querySelectorAll(".txt.sel").forEach(el=>el.classList.remove("sel"));
  if(!entrySel) return;
  const el=list.querySelector('.card[data-id="'+cssEsc(entrySel.id)+'"] .txt[data-v="'+entrySel.vi+'"]');
  if(el) el.classList.add("sel");
  else entrySel=null;
}
/** Navigate focus across every copyable block (not whole cards). */
function navEntry(dir){
  const els=listEntryEls();
  if(!els.length) return false;
  let i=els.findIndex(el=>{
    if(!entrySel) return false;
    const card=el.closest(".card[data-id]");
    return card&&card.dataset.id===entrySel.id && +el.dataset.v===entrySel.vi;
  });
  /* Wraps, like navPill - it used to CLAMP, a dead stop at both ends, and the two lists
     sat side by side behaving differently: the kind of inconsistency you feel long before
     you can name it. */
  if(i<0) i=dir>0?0:els.length-1;
  else i=((i+dir)%els.length+els.length)%els.length;
  const el=els[i];
  const card=el.closest(".card[data-id]");
  if(!card) return false;
  setEntrySel(card.dataset.id, +el.dataset.v, {scroll:i>0});
  if(i===0) scrollPageTop();
  return true;
}

export {
  listCardsOrdered,
  listEntryEls,
  markEntrySel,
  navEntry
};
