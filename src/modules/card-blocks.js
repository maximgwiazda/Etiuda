import { reorderMacroBlocks, reverseBlockIndex } from "./card-model.js";

// FLIP animation for alt/seq blocks - same feel as cards / pills / rail / tabs.
function animateTxtReorder(mid, fromVi, toVi){
  if(!list || mgReduceMotion()){
    return reorderMacroBlocks(mid, fromVi, toVi);
  }
  const cardSel='.card[data-id="'+cssEsc(mid)+'"]';
  const card=list.querySelector(cardSel);
  if(!card){
    return reorderMacroBlocks(mid, fromVi, toVi);
  }
  const before={};
  card.querySelectorAll(".txt[data-v]").forEach(p=>{
    before[String(p.dataset.v)]=p.getBoundingClientRect();
  });
  if(!reorderMacroBlocks(mid, fromVi, toVi)) return false;
  // Keep drag styling on the moved block after re-render
  if(txtDrag&&txtDrag.moved){
    const el=list.querySelector(cardSel+' .txt[data-v="'+toVi+'"]');
    if(el) el.classList.add("dragging");
  }
  const card2=list.querySelector(cardSel);
  if(!card2) return true;
  const moved=[];
  card2.querySelectorAll(".txt[data-v]").forEach(p=>{
    const newVi=+p.dataset.v;
    if(!Number.isInteger(newVi)) return;
    const oldVi=reverseBlockIndex(newVi, fromVi, toVi);
    const b=before[String(oldVi)];
    if(!b) return;
    const a=p.getBoundingClientRect();
    const dx=Math.round(b.left-a.left), dy=Math.round(b.top-a.top);
    if(!dx && !dy) return;
    p.style.transition="none";
    p.style.willChange="transform";     // see the note in flipPills
    p.style.transform="translate("+dx+"px,"+dy+"px)";
    moved.push(p);
  });
  if(!moved.length) return true;
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void list.offsetHeight;
  moved.forEach(p=>{
    p.style.transition="transform .18s "+E_EASE;
    p.style.transform="";
    setTimeout(()=>moved.forEach(p=>{ p.style.transition=""; p.style.transform=""; p.style.willChange=""; }),200);
  });
  return true;
}

export {
  animateTxtReorder
};
