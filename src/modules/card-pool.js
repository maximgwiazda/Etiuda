import { cardBodyHtml } from "./card-body.js";
import { cardHitsAlwaysCat, cardHitsSelectedIntent } from "./card-intent.js";
import { holdFresh, parseCardHtml } from "./card-node.js";
import { findCard } from "./card-model.js";
import { displayBandKey } from "./card-order.js";
import { isFavourite, ePackEpoch } from "./pack.js";
import { cardFillKey } from "./rail-list.js";
import { cardSearchTerms } from "./spell.js";
import { t, uiLang } from "./ui-lang.js";
import { list, cardTpl } from "./dom.js";

/* Card nodes, kept by id between renders. Cleared wholesale when it outgrows the list so a
   catalog swap cannot leave the old one's cards alive in here. */
let cardPool=new Map();
/* Everything a PICK changes, and nothing else - the rest lives in the signature and forces a
   rebuild instead. It writes the bytes cardBodyHtml writes, which verifyPool checks. */
function patchCard(el,it){
  el.className="card"+(it.hidden?" is-hidden":"")+(it.hit?" intent-hit":"")
    +(it.catHit?" cat-hit":"")+(it.dragging?" dragging":"");
  el.setAttribute("title",it.dragTip);
  el.setAttribute("data-i",it.i);
  el.setAttribute("data-rank",it.band);
  const head=el.querySelector(".chead");
  if(!head) return;
  const anchor=head.querySelector(".ccat");
  if(!anchor) return;
  let hitB=head.querySelector(".cbadge.hit"), catB=head.querySelector(".cbadge.cat");
  if(it.hit && !hitB){ hitB=parseCardHtml(it.hitBadge); anchor.insertAdjacentElement("afterend",hitB); }
  else if(!it.hit && hitB){ hitB.remove(); hitB=null; }
  if(it.catHit && !catB){ catB=parseCardHtml(it.catBadge); (hitB||anchor).insertAdjacentElement("afterend",catB); }
  else if(!it.catHit && catB){ catB.remove(); }
}
/* A language flip changes every card's bytes but nothing structural, so the tail never
   calls render(): the screenful rebuilds in place, the rest follows in chunks, and the
   category separators swap their text. Each rebuilt card gets the exact signature a full
   render would write, so the pool stays honest and any interleaved render heals the rest. */
// Estimate rects are enough to shortlist: a card within a viewport of the screen is forced.
function settleFreshCards(){
  if(!list) return;
  const vh=window.innerHeight, margin=vh;
  list.querySelectorAll(".card[data-id]").forEach(el=>{
    if(el.style.contentVisibility) return;
    const r=el.getBoundingClientRect();
    if(r.bottom<-margin || r.top>vh+margin) return;
    holdFresh(el);
  });
}
let eLangChunkR=0;
function cancelLangChunks(){
  if(eLangChunkR){ cancelAnimationFrame(eLangChunkR); eLangChunkR=0; }
}
function rebuildCardInPlace(id){
  const m=findCard(id), el=cardPool.get(id);
  if(!m || !el || !el.isConnected) return;
  const renderKey=String(uiLang())+"|"+lang+"|"+cardSearchTerms().join(" ");
  const b=cardBodyHtml(m, +el.getAttribute("data-i")||0,
    {hit:cardHitsSelectedIntent(m), catHit:cardHitsAlwaysCat(m), fav:isFavourite(m.id),
     band:displayBandKey(m), other:lang==="en"?"pl":"en",
     dragTip:t(intentIdxs.length
       ? "Drag header to reorder within the same highlight group"
       : "Drag header to reorder within the same highlight group; same category only")});
  const fresh=parseCardHtml(b.cardH);
  if(!fresh) return;
  fresh.__sig=ePackEpoch+"|"+renderKey+"|"+cardFillKey(m)
    +"|"+(entrySel&&entrySel.id===m.id?entrySel.vi:-1);
  const ord=el.getAttribute("data-ord");
  if(ord!=null) fresh.setAttribute("data-ord",ord);
  const was=el.getBoundingClientRect(), vh=window.innerHeight;
  el.replaceWith(fresh);
  if(was.bottom>-vh && was.top<2*vh) holdFresh(fresh);   // see the note at holdFresh()
  cardPool.set(id,fresh);
}
function runLangChunks(ids){
  const step=()=>{
    eLangChunkR=0;
    ids.splice(0,28).forEach(rebuildCardInPlace);
    if(ids.length) eLangChunkR=requestAnimationFrame(step);
  };
  cancelLangChunks();
  if(ids.length) eLangChunkR=requestAnimationFrame(step);
}
/* Separators are rebuilt every render - there are a handful and they depend on their
   neighbours. Cards are kept unless their signature moved. */
function paintList(spellNote,items){
  if(cardPool.size>2000) cardPool=new Map();
  const frag=document.createDocumentFragment();
  const add=html=>{ if(!html) return; cardTpl.innerHTML=html;
    while(cardTpl.content.firstChild) frag.appendChild(cardTpl.content.firstChild); };
  add(spellNote);
  for(let k=0;k<items.length;k++){
    const it=items[k];
    add(it.sepH);
    if(!it.id) continue;
    let el=cardPool.get(it.id);
    if(!el || el.__sig!==it.sig){
      el=parseCardHtml(it.cardH);
      if(!el) continue;
      el.__sig=it.sig;
      cardPool.set(it.id,el);
    }else{
      patchCard(el,it);
    }
    frag.appendChild(el);
  }
  /* Verification hook: with it on, every kept card is rebuilt and compared. Off in normal
     use - it exists so the probe can prove the pool rather than sample it. */
  if(window.__verifyPool) verifyPool(items);
  list.replaceChildren(frag);
}
/* setAttribute APPENDS on a kept node where the builder interleaves, so serialisation order
   differs while the attribute set does not. CSS and dataset are order-blind; compare sorted. */
function normAttrOrder(el){
  return el.outerHTML.replace(/<([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)(\s*\/?)>/g,
    (m,name,attrs,close)=>{
      /* data-ord is stamped by the column dealer AFTER paint, so a kept node carries it and a
         fresh parse does not. It is not part of what the builder wrote. */
      const got=((attrs||"").match(/[\w:-]+(?:="[^"]*")?/g)||[]).filter(a=>a.indexOf("data-ord")!==0);
      return "<"+name+(got.length?" "+got.sort().join(" "):"")+close+">";
    });
}
function verifyPool(items){
  const bad=[];
  items.forEach(it=>{
    if(!it.id) return;
    const el=cardPool.get(it.id);
    if(!el) return;
    const fresh=parseCardHtml(it.cardH);
    if(fresh && normAttrOrder(fresh)!==normAttrOrder(el))
      bad.push({id:it.id,want:fresh.outerHTML,got:el.outerHTML});
  });
  window.__poolMismatch=bad;
}

export {
  settleFreshCards,
  cancelLangChunks,
  rebuildCardInPlace,
  runLangChunks,
  paintList
};
