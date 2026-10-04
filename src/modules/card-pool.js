import { nextContentLang } from "./content-model.js";
import { cardBodyHtml } from "./card-body.js";
import { cardHitsAlwaysCat, cardHitsSelectedIntent } from "./card-intent.js";
import { holdFresh, parseCardHtml } from "./card-node.js";
import { findCard } from "./card-model.js";
import { displayBandKey } from "./card-order.js";
import { isFavourite, ePackEpoch } from "./pack.js";
import { cardFillKey } from "./rail-list.js";
import { t, uiLang } from "./ui-lang.js";
import { list, cardTpl } from "./dom.js";
import { cards, lang, intentIdxs, entrySel } from "./app-state.js";

/* Card nodes, kept by id between renders. Cleared wholesale when it outgrows the catalog, so
   ids that are gone cannot pile up; the ceiling follows the catalog, or a big one is rebuilt
   whole on every render. */
let cardPool=new Map();
function dropCardPool(){ cardPool=new Map(); }
/* Everything a PICK changes, and nothing else - the rest lives in the signature and forces a
   rebuild instead. It writes the bytes cardBodyHtml writes, which verifyPool checks. */
function patchCard(el,it){
  // className is assigned WHOLE: a class put on a card from outside the render dies at the next pick.
  el.className="card"+(it.hidden?" is-hidden":"")+(it.hit?" intent-hit":"")
    +(it.catHit?" cat-hit":"")+(it.dragging?" dragging":"");
  el.setAttribute("title",it.dragTip);
  el.setAttribute("data-i",it.i);
  el.setAttribute("data-rank",it.band);
  const head=el.querySelector(".chead");
  if(!head) return;
  /* THE TITLE IS THE ANCHOR, with the stamp that follows it, because the badges follow both in a
     rebuild - see card-body.js. The category's mark sits BEFORE the title now, so anchoring on it
     would file every badge between the mark and the words it marks. */
  const anchor=head.querySelector(".cstamp")||head.querySelector(".ctitle");
  if(!anchor) return;
  let hitB=head.querySelector(".cbadge.hit"), catB=head.querySelector(".cbadge.cat");
  if(it.hit && !hitB){ hitB=parseCardHtml(it.body().hitBadge); anchor.insertAdjacentElement("afterend",hitB); }
  else if(!it.hit && hitB){ hitB.remove(); hitB=null; }
  if(it.catHit && !catB){ catB=parseCardHtml(it.body().catBadge); (hitB||anchor).insertAdjacentElement("afterend",catB); }
  else if(!it.catHit && catB){ catB.remove(); }
}
/* A language flip changes every card's bytes but nothing structural, so the tail never
   calls render(): the screenful rebuilds in place, the rest follows in chunks, and the
   category separators swap their text. Each rebuilt card gets the exact signature a full
   render would write, so the pool stays honest and any interleaved render heals the rest. */
// Estimate rects are enough to shortlist: a card within a viewport of the screen is forced.
// Every rect is read before any card is held: a hold between two reads costs a layout each.
function settleFreshCards(){
  if(!list) return;
  const vh=window.innerHeight, margin=vh;
  const near=[];
  list.querySelectorAll(".card[data-id]").forEach(el=>{
    if(el.style.contentVisibility) return;
    const r=el.getBoundingClientRect();
    if(r.bottom<-margin || r.top>vh+margin) return;
    near.push(el);
  });
  near.forEach(holdFresh);
}
let eLangChunkR=0;
function cancelLangChunks(){
  if(eLangChunkR){ cancelAnimationFrame(eLangChunkR); eLangChunkR=0; }
}
/* `near` is read by the caller for the whole batch before any card is swapped: a rect read after
   the swap before it costs a layout per card. */
function rebuildCardInPlace(id,near){
  const m=findCard(id), el=cardPool.get(id);
  if(!m || !el || !el.isConnected) return;
  const renderKey=String(uiLang())+"|"+lang;   // render()'s, which says what it leaves out
  const b=cardBodyHtml(m, +el.getAttribute("data-i")||0,
    {hit:cardHitsSelectedIntent(m), catHit:cardHitsAlwaysCat(m), fav:isFavourite(m.id),
     band:displayBandKey(m), other:nextContentLang(lang),
     dragTip:t(intentIdxs.length
       ? "Drag header to reorder within the same highlight group"
       : "Drag header to reorder within the same highlight group; same category only")});
  const fresh=parseCardHtml(b.cardH);
  if(!fresh) return;
  fresh.__sig=ePackEpoch+"|"+renderKey+"|"+cardFillKey(m)
    +"|"+(entrySel&&entrySel.id===m.id?entrySel.vi:-1);
  const ord=el.getAttribute("data-ord");
  if(ord!=null) fresh.setAttribute("data-ord",ord);
  el.replaceWith(fresh);
  if(near) holdFresh(fresh);   // see the note at holdFresh()
  cardPool.set(id,fresh);
}
// Within a viewport of the screen, as rebuildCardInPlace() holds a fresh card real.
function cardsNear(ids){
  const vh=window.innerHeight;
  return ids.map(id=>{
    const el=cardPool.get(id);
    if(!el || !el.isConnected) return false;
    const r=el.getBoundingClientRect();
    return r.bottom>-vh && r.top<2*vh;
  });
}
function rebuildCardsInPlace(ids){
  const near=cardsNear(ids);
  ids.forEach((id,i)=>rebuildCardInPlace(id,near[i]));
}
function runLangChunks(ids){
  const step=()=>{
    eLangChunkR=0;
    rebuildCardsInPlace(ids.splice(0,28));
    if(ids.length) eLangChunkR=requestAnimationFrame(step);
  };
  cancelLangChunks();
  if(ids.length) eLangChunkR=requestAnimationFrame(step);
}
/* After a save that rewrote the markup of the named cards and of no other: every other kept node
   is re-signed with the new epoch, so the render that follows keeps it, and with it the size
   content-visibility remembers. window.__verifyPool proves the claim for a caller. */
function keepPoolAcross(was,ids){
  const pre=was+"|", now=ePackEpoch+"|";
  if(pre===now) return;
  cardPool.forEach((el,id)=>{
    if(ids.indexOf(id)<0 && typeof el.__sig==="string" && el.__sig.indexOf(pre)===0)
      el.__sig=now+el.__sig.slice(pre.length);
  });
}
/* Separators are rebuilt every render - there are a handful and they depend on their
   neighbours. Cards are kept unless their signature moved. */
function paintList(spellNote,items){
  if(cardPool.size>Math.max(2000, Math.ceil(cards.length*1.25))) cardPool=new Map();
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
      el=parseCardHtml(it.body().cardH);
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
    const fresh=parseCardHtml(it.body().cardH);
    if(fresh && normAttrOrder(fresh)!==normAttrOrder(el))
      bad.push({id:it.id,want:fresh.outerHTML,got:el.outerHTML});
  });
  window.__poolMismatch=bad;
}

export {
  dropCardPool,
  settleFreshCards,
  cancelLangChunks,
  rebuildCardsInPlace,
  runLangChunks,
  keepPoolAcross,
  paintList
};
