import { list } from "./dom.js";
import { mgReduceMotion, M_MS, E_EASE } from "./motion.js";
import { lsGet } from "./storage.js";
/* THE DECK: a card holding two or more replies rests as its first, the others tucked behind it
   with one bottom edge showing for each, three at most. The pointer resting on it, or the
   keyboard's mark on any of its replies, deals them down into the places they hold in the flat
   list; the card's own box keeps its resting height, so no other card moves. The front never
   travels, so a click on it copies at once. */
const DECK_PEEK=6, DECK_INSET=7, DECK_DEPTH=3, DECK_DWELL=70, DECK_GRACE=110, DECK_DIM=[1,.8,.64,.5];
const DECK_SLAB_PROPS=["--deck-dy","--deck-sx","--deck-clip","--deck-dim","--deck-z","--deck-k"];
/* THE SWITCH, a Layout row and the desk's own, on unless eDeckOff holds "1". Off, a card lays out every reply as it
   draws them: nothing below measures, deals, holds or fades, and the list's two watchers let go (syncDeck). */
function deckOn(){ return lsGet("eDeckOff")!=="1"; }

function deckSlabs(card){ return Array.from(card.querySelectorAll(":scope > .txt[data-v]")); }
function deckPx(n){ return Math.round(n*100)/100+"px"; }

/* Where a deck rests, from where its slabs stand dealt: each slab's top and height inside the
   card, the front's width, and the card's own height with nothing tucked. */
function deckLengths(tops, heights, width, natural){
  const n=tops.length, t0=tops[0], h0=heights[0];
  const rest=t0+h0+Math.min(n-1,DECK_DEPTH)*DECK_PEEK+10, restBottom=t0+h0+4;
  return {
    rest, restBottom, extra:Math.max(0,natural-restBottom-2), grow:Math.max(0,natural-rest),
    slabs:tops.map((top,k)=>{
      if(!k) return {z:n+1, k:0};
      const d=Math.min(k,DECK_DEPTH);
      return {z:n-k+1, k, dy:t0+h0+d*DECK_PEEK-(top+heights[k]), sx:1-2*d*DECK_INSET/width,
        clip:Math.max(0,heights[k]-h0-d*DECK_PEEK+2), dim:DECK_DIM[d]};
    })
  };
}

function deckReset(card){
  const id=card&&card.dataset&&card.dataset.id;
  if(id){ deckOpenIds.delete(id); deckRestHeld.delete(id); }
  card.classList.remove("deck","deck-open","deck-up","deck-moving","deck-return","deck-near");
  ["height","--deck-rest-bottom","--deck-extra"].forEach(p=>card.style.removeProperty(p));
  deckSlabs(card).forEach(s=>{ s.classList.remove("deck-back"); DECK_SLAB_PROPS.forEach(p=>s.style.removeProperty(p)); });
  clearTimeout(card._deckT); card._deckGrow=0;
}
let deckRaf=0, deckKbdCard=null, deckObs=null, deckListW=-1, deckPtr=null;
const deckOpenIds=new Set();
/* An open deck's resting height, by id, kept while it stays open: a redraw that brings a taller or
   shorter front reply moves nothing under it until it closes, and then the cards below glide (deckSettleRest). */
const deckRestHeld=new Map();
/* The deck's own classes on a card, for a redraw that assigns its class whole (patchCard): carried, the
   card under an open deck is never laid out unfaded between the redraw and the fade, which would replay the fade. */
function deckCarry(el){
  const own=el&&el.classList ? Array.from(el.classList).filter(k=>/^deck(-[a-z]+)?$/.test(k)) : [];
  return own.length ? " "+own.join(" ") : "";
}
/* Where the pointer last stood. A node drawn new under a still pointer is not :hover until the pointer
   moves again, so a deck held open is kept open by its box holding this point. */
function deckPointerIn(c){
  if(!deckPtr||typeof c.getBoundingClientRect!=="function") return false;
  const r=c.getBoundingClientRect();
  return deckPtr.x>=r.left && deckPtr.x<r.right && deckPtr.y>=r.top && deckPtr.y<r.bottom;
}
/* A deck whose own box sits more than one viewport outside the screen keeps the list's
   content-visibility. Inside that band it is measured, which is what deck-near records. */
function deckView(){
  const h=globalThis.innerHeight;
  return (typeof h==="number"&&h>0)?h:800;
}
function deckInRange(c){
  if(typeof c.getBoundingClientRect!=="function") return true;
  const r=c.getBoundingClientRect(), h=deckView();
  return r.bottom>=-h && r.top<=h+h;
}
function deckLive(c){
  const id=c.dataset&&c.dataset.id;
  return (id&&deckOpenIds.has(id))||c.classList.contains("deck-open")||c.classList.contains("deck-up")||deckInRange(c);
}
/* Every card in the band is measured afresh after any change in the list. A card's height is
   let go for all of them first, then every slab is read, then every length written, so the
   list costs one layout rather than one per card. A deck outside the band is not read. */
function deckMeasure(todo){
  if(!todo.length) return;
  const dragging=deckDragging();
  todo.forEach(c=>{
    c.style.removeProperty("height");
    c.classList.add("deck","deck-near");
  });
  const read=todo.map(c=>{
    const s=deckSlabs(c), id=c.dataset&&c.dataset.id;
    const L=deckLengths(s.map(e=>e.offsetTop), s.map(e=>e.offsetHeight), s[0].offsetWidth, c.offsetHeight);
    // Read with every reply in its place, which is where the dealt deck stands.
    const here=c.matches(":hover") || (!!id && deckOpenIds.has(id) && deckPointerIn(c));
    return {c, s, L, id, here};
  });
  read.forEach(({c,s,L,id,here})=>{
    if(!dragging && !here){ if(id) deckOpenIds.delete(id); }
    else if(c.classList.contains("deck-open") && id) deckOpenIds.add(id);
    if(deckKbdCard && id && deckKbdCard.dataset && deckKbdCard.dataset.id===id) deckKbdCard=c;
    const shouldOpen=(id&&deckOpenIds.has(id)&&(dragging||here)) || here || c===deckKbdCard;
    const held=shouldOpen && id ? deckRestHeld.get(id) : "";
    c._deckRest=L.rest;
    c.style.height=held||deckPx(L.rest);
    c.style.setProperty("--deck-rest-bottom",deckPx(L.restBottom));
    c.style.setProperty("--deck-extra",deckPx(L.extra));
    c._deckGrow=held ? Math.max(0,L.grow+L.rest-parseFloat(held)) : L.grow;
    s.forEach((e,k)=>{
      const v=L.slabs[k];
      e.style.setProperty("--deck-z",String(v.z)); e.style.setProperty("--deck-k",String(k));
      if(!k){ e.classList.remove("deck-back"); return; }
      e.classList.add("deck-back");
      e.style.setProperty("--deck-dy",deckPx(v.dy)); e.style.setProperty("--deck-sx",String(v.sx));
      e.style.setProperty("--deck-clip",deckPx(v.clip)); e.style.setProperty("--deck-dim",String(v.dim));
    });
    if(shouldOpen) deckSetOpen(c,true,true);
    else if(c.classList.contains("deck-open")) deckSetOpen(c,false,true);
  });
}
function deckScan(){
  deckRaf=0;
  if(!list||!deckOn()) return;
  deckInitIO();
  const todo=[];
  list.querySelectorAll(".card[data-id]").forEach(c=>{
    if(deckSlabs(c).length<2){ if(c.classList.contains("deck")) deckReset(c); return; }
    if(deckIO) deckIO.observe(c);
    if(!deckLive(c)){ c.classList.remove("deck-near"); return; }
    todo.push(c);
  });
  deckMeasure(todo);
}
function deckLater(){ if(!deckRaf&&deckOn()) deckRaf=requestAnimationFrame(deckScan); }
// A put-away card's leaving copy, coming or going, changes no card's shape.
function deckLeaving(r){
  const nodes=Array.from(r.addedNodes).concat(Array.from(r.removedNodes));
  return nodes.length>0 && nodes.every(n=>n.nodeType===1 && n.matches(".card[data-leave]"));
}
/* What the list's records ask for: a scan when its shape changed, and the fade on any change but the fade's own. */
function deckHeard(ms){
  let shape=false, fade=false;
  for(const r of ms){
    if(r.type==="childList"){ if(!deckLeaving(r)) shape=true; fade=true; }
    else if(!deckOwnChange(r.oldValue, r.target.getAttribute("class"))) fade=true;
  }
  return {shape, fade};
}
function deckHoldsCard(n){
  return n.nodeType===1 && (n.matches(".card[data-id]") || !!n.querySelector(".card[data-id]"));
}
/* A record the cards just made account for: it adds only them, or changes inside one of them, or
   touches no card at all, which leaves every deck's measure as it was. */
function deckDrawnBy(r, made){
  const added=Array.from(r.addedNodes);
  if(added.length && added.every(n=>made.indexOf(n)>-1)) return true;
  if(made.some(c=>c.contains(r.target))) return true;
  const t=r.target, inCard=!!(t.closest && t.closest(".card[data-id]"));
  return !inCard && !added.some(deckHoldsCard) && !Array.from(r.removedNodes).some(deckHoldsCard);
}
/* THE DECKS AT REST BEFORE ANYTHING READS THE LIST, for a caller that has just drawn into it: the
   observer's record of the drawing is taken, so no frame scans for it again. No `drawn`: the whole
   list. `drawn`: cards just drawn that the caller read as in the band, measured with no box read;
   `made`, every card it drew, is what the records are held against, `drawn` where it is left out. */
function deckSettle(drawn, made){
  if(!list||!deckOn()) return;
  deckInitIO();
  const ms=deckObs ? deckObs.takeRecords() : [];
  if(!drawn){
    if(deckRaf){ cancelAnimationFrame(deckRaf); deckRaf=0; }
    deckScan();
  }else{
    if(deckIO&&made) made.filter(c=>deckSlabs(c).length>1).forEach(c=>deckIO.observe(c)); /* plant:deck-io-rebuilt */
    deckMeasure(drawn.filter(c=>deckSlabs(c).length>1));
    if(ms.some(r=>r.type==="childList" && !deckDrawnBy(r, made||drawn))) deckLater();
  }
  if(deckHeard(ms).fade) deckFade();
}
/* Scroll only picks up a deck that has just entered the band. One already measured stays as it is. */
let deckApproachRaf=0;
function deckApproach(){
  if(!list||!deckOn()||typeof IntersectionObserver==="function") return;
  const todo=[];
  list.querySelectorAll(".card[data-id]:not(.deck-near)").forEach(c=>{
    if(deckSlabs(c).length<2||!deckInRange(c)) return;
    todo.push(c);
  });
  deckMeasure(todo);
}
function deckLaterApproach(){ if(!deckApproachRaf&&deckOn()) deckApproachRaf=requestAnimationFrame(()=>{ deckApproachRaf=0; deckApproach(); }); }

function deckMarkLive(){
  if(deckKbdCard) return true;
  if(!list) return false;
  if(typeof list.querySelector==="function") return !!list.querySelector(".card.deck.deck-open, .card.deck.deck-up");
  if(typeof list.querySelectorAll==="function") return list.querySelectorAll(".card.deck.deck-open, .card.deck.deck-up").length > 0;
  return false;
}

function deckSetOpen(card, open, instant){
  clearTimeout(card._deckT);
  const id=card&&card.dataset&&card.dataset.id;
  if(open){ if(id){ deckOpenIds.add(id); if(!deckRestHeld.has(id) && card.style.height) deckRestHeld.set(id,card.style.height); } }
  else if(id){ deckOpenIds.delete(id); if(deckRestHeld.delete(id)) deckSettleRest(card); }
  if(open===card.classList.contains("deck-open")) return;
  // Only a change cancels the deal's end: a repeated ask that did would leave deck-moving on, and the click guard holding.
  clearTimeout(card._deckM);
  const now=mgReduceMotion() || instant, travel=now?0:M_MS.travel, move=now?0:M_MS.move;
  if(open){
    card.classList.remove("deck-return");
    card.classList.add("deck-up","deck-open");
    if(travel){
      const n=deckSlabs(card).length;
      card.classList.add("deck-moving");
      card._deckM=setTimeout(()=>card.classList.remove("deck-moving"), travel+(n-1)*travel/9);
    }
  } else {
    // deck-return slides the tuck back and leaves with deck-up. The tuck itself has no transition: see the sheet.
    if(now) card.classList.remove("deck-return");
    else card.classList.add("deck-return");
    card.classList.remove("deck-open","deck-moving");
    card._deckM=setTimeout(()=>{ if(!card.classList.contains("deck-open")) card.classList.remove("deck-up","deck-return"); }, move+40);
  }
}
/* A deck closing takes the resting height its replies now give it, and what follows it in its column
   glides there on the house curve, as a card swap does (list-pointer.js animateCardReorder). */
function deckSettleRest(card){
  const want=card._deckRest ? deckPx(card._deckRest) : "";
  if(!want || card.style.height===want) return;
  const after=list ? deckSeqAfter(card, Array.from(list.querySelectorAll(".card[data-id], .list-sep"))) : [];
  if(mgReduceMotion() || !after.length || typeof card.getBoundingClientRect!=="function"){ card.style.height=want; return; }
  const h=deckView(), was=after.map(e=>e.getBoundingClientRect());
  card.style.height=want;
  const moved=[], dys=[];
  after.forEach((e,i)=>{
    const b=was[i];
    if(b.bottom<-h || b.top>h+h) return;
    const dy=Math.round(b.top-e.getBoundingClientRect().top);
    if(dy){ moved.push(e); dys.push(dy); }
  });
  if(!moved.length) return;
  moved.forEach((e,i)=>{ e.style.transition="none"; e.style.transform="translateY("+dys[i]+"px)"; });
  void card.offsetHeight;
  // The fade's own transitions ride along: the card is given back from under the deck in this same turn.
  moved.forEach(e=>{ e.style.transition="transform var(--m-move) "+E_EASE+",opacity var(--m-move) ease,filter var(--m-move) ease"; e.style.transform=""; });
  setTimeout(()=>moved.forEach(e=>{ e.style.transition=""; e.style.transform=""; }), M_MS.move+40);
}
function deckWant(card, open, ms){
  clearTimeout(card._deckT);
  if(!ms){ deckSetOpen(card,open); return; }
  card._deckT=setTimeout(()=>deckSetOpen(card,open), ms);
}
function deckAt(el){ return deckOn() && el && el.closest ? el.closest(".card.deck") : null; }

/* How far below its resting box an open deck reaches; nothing for a closed one. The note pane
   is placed by it, so a note opened on a dealt deck sits under the last reply. */
function deckReach(card){
  return card && card.classList.contains("deck-open") ? (card._deckGrow||0) : 0;
}

/* WHAT AN OPEN DECK REACHES OVER: the cards and rules in its column whose top lies under the
   dealt replies. A box is the rect's four edges; the reach runs from the card's top to its
   resting bottom plus what the deal adds. */
function deckCovers(reach, r){
  return r.top>reach.top && r.top<reach.bottom && r.left<reach.right-4 && r.right>reach.left+4;
}
/* An attribute change the fade made itself; the list's observer skips these, so the fade does
   not wake itself. */
function deckOwnChange(was, now){
  const strip=s=>String(s||"").replace(/\bdeck-(under|fresh)\b/g,"").trim().split(/\s+/).sort().join(" ");
  return strip(was)===strip(now);
}
/* THE FADE IS WORKED OUT AFRESH from the page as it stands after every change in the list, and
   never kept from the moment a deck opened: the desk redraws a card it selects, so a fade kept
   from the opening misses the new node and leaves the old one's behind. A node drawn new under
   an open deck arrives faded rather than fading in. */
const deckSeen=new WeakSet();
let deckFadeRaf=0;
/* The cards after this deck in its own column, document order. A list with no columns, which is
   also the stand-in, walks the flat list from the deck on. */
function deckSeqAfter(card, items){
  const col=typeof card.closest==="function"?card.closest(".col"):null;
  if(col&&typeof col.querySelectorAll==="function"){
    const nodes=Array.from(col.querySelectorAll(".card[data-id], .list-sep"));
    const i=nodes.indexOf(card);
    return i<0?[]:nodes.slice(i+1);
  }
  const i=items.indexOf(card);
  return i<0?[]:items.slice(i+1);
}
function deckTake(seq, reach, want){
  for(const e of seq){
    const r=e.getBoundingClientRect();
    const inline=r.left<reach.right-4 && r.right>reach.left+4;
    if(inline && r.top>=reach.bottom) return;
    if(deckCovers(reach, r)) want.add(e);
  }
}
/* Only when the dealt replies hang below the column: a sibling column beside this one is skipped
   after its own box, and a band below is walked until the reach ends. */
function deckPastColumn(card, reach, want){
  const col=typeof card.closest==="function"?card.closest(".col"):null;
  if(!col||typeof col.getBoundingClientRect!=="function") return;
  if(reach.bottom<=col.getBoundingClientRect().bottom+0.5) return;
  let n=col.nextElementSibling;
  while(n){
    if(n.classList&&n.classList.contains("col")){
      const cr=typeof n.getBoundingClientRect==="function"?n.getBoundingClientRect():null;
      const inline=!!(cr&&cr.left<reach.right-4&&cr.right>reach.left+4);
      if(inline&&cr.top>=reach.bottom) return;
      if(inline&&typeof n.querySelectorAll==="function")
        deckTake(Array.from(n.querySelectorAll(".card[data-id], .list-sep")), reach, want);
    }else if(typeof n.getBoundingClientRect==="function"&&n.matches&&n.matches(".card[data-id], .list-sep")){
      const r=n.getBoundingClientRect();
      if(r.left<reach.right-4&&r.right>reach.left+4&&r.top>=reach.bottom) return;
      if(deckCovers(reach, r)) want.add(n);
    }
    n=n.nextElementSibling;
  }
}
function deckFade(){
  if(!list||!deckOn()) return;
  const items=Array.from(list.querySelectorAll(".card[data-id], .list-sep")), want=new Set();
  list.querySelectorAll(".card.deck.deck-open").forEach(card=>{
    const c=card.getBoundingClientRect(), cs=card.style;
    const reach={top:c.top, left:c.left, right:c.right,
      bottom:c.top+(parseFloat(cs.getPropertyValue("--deck-rest-bottom"))||0)+(parseFloat(cs.getPropertyValue("--deck-extra"))||0)+2};
    deckTake(deckSeqAfter(card, items), reach, want);
    deckPastColumn(card, reach, want);
  });
  list.querySelectorAll(".deck-under").forEach(e=>{ if(!want.has(e)) e.classList.remove("deck-under"); });
  const fresh=[];
  want.forEach(e=>{
    if(e.classList.contains("deck-under")) return;
    if(!deckSeen.has(e)){ e.classList.add("deck-fresh"); fresh.push(e); }
    e.classList.add("deck-under");
  });
  items.forEach(e=>deckSeen.add(e));
  if(fresh.length) requestAnimationFrame(()=>requestAnimationFrame(()=>fresh.forEach(e=>e.classList.remove("deck-fresh"))));
}
function deckFadeLater(){ if(!deckFadeRaf&&deckOn()) deckFadeRaf=requestAnimationFrame(()=>{ deckFadeRaf=0; deckFade(); }); }

// The keyboard's mark on any of a deck's replies opens it; the first pointer move hands it back.
function deckKbdSync(){
  if(!list||!deckOn()) return;
  const sel=document.body.classList.contains("e-kbdnav") ? list.querySelector(".txt.sel") : null;
  const c=sel ? deckAt(sel) : null;
  if(deckKbdCard && deckKbdCard!==c && !deckKbdCard.matches(":hover")) deckSetOpen(deckKbdCard,false);
  deckKbdCard=c;
  if(!c) return;
  const was=c.classList.contains("deck-open");
  deckSetOpen(c,true);
  if(!was) setTimeout(()=>sel.scrollIntoView({block:"nearest", behavior:mgReduceMotion()?"auto":"smooth"}), mgReduceMotion()?0:200);
}

function deckDragging(){
  const cl=document.documentElement&&document.documentElement.classList;
  return !!(cl && (cl.contains("txtdrag")||cl.contains("carddrag")||cl.contains("pilldrag")||cl.contains("tabdrag")));
}

function deckDragEnd(){
  if(!list) return;
  list.querySelectorAll(".card.deck.deck-open").forEach(c=>{
    if(c!==deckKbdCard && !c.matches(":hover")) deckSetOpen(c,false);
  });
}

/* A module may not register a listener at load: boot calls this after the note pane's. */
function wireDeck(){
  if(!list) return;
  deckOpenIds.clear();
  deckRestHeld.clear(); deckPtr=null;
  document.addEventListener("pointermove",e=>{ deckPtr={x:e.clientX, y:e.clientY}; },{capture:true, passive:true});
  deckObs=new MutationObserver(ms=>{
    const h=deckHeard(ms);
    if(h.shape) deckLater();
    if(h.fade) deckFade();
  });
  /* Only the width changes what a deck measures. The list grows taller on every drawing and on the
     tuck itself; a scan for that would come a frame later, under whatever glide is running. */
  deckSizeObs=typeof ResizeObserver==="function" ? new ResizeObserver(es=>{
    const w=es.length ? es[es.length-1].contentRect.width : -1;
    if(w!==deckListW){ deckListW=w; deckLater(); }
    deckFadeLater();
  }) : null;
  deckWatching=false;
  deckClass(deckOn());
  deckWatch(deckOn());
  // A card caught mid-move, a fresh card's unfold or a slab still travelling, is read again once it lands.
  list.addEventListener("animationend",deckFadeLater); list.addEventListener("transitionend",deckFadeLater);
  document.addEventListener("scroll",()=>{ if(!deckMarkLive()) return; deckFadeLater(); },{capture:true, passive:true});
  addEventListener("resize",()=>{ deckLater(); deckFadeLater(); });

  // The pointer deals after a short rest, so a sweep across the desk deals nothing, and leaves
  // after a grace that covers the gap between two slabs.
  document.addEventListener("pointerover",e=>{
    if(deckDragging()) return;
    const c=deckAt(e.target), from=deckAt(e.relatedTarget);
    if(c && c!==from) deckWant(c,true,DECK_DWELL);
    if(from && from!==c) deckWant(from,false,DECK_GRACE);
  },true);
  document.addEventListener("pointerout",e=>{
    if(deckDragging()) return;
    if(!e.relatedTarget) deckPtr=null;
    const c=deckAt(e.target), to=deckAt(e.relatedTarget);
    if(c && c!==to && !e.relatedTarget) deckWant(c,false,DECK_GRACE);
  },true);
  document.addEventListener("pointerup",deckDragEnd,true);
  document.addEventListener("pointercancel",deckDragEnd,true);
  addEventListener("keydown",()=>setTimeout(deckKbdSync,0),true);
  addEventListener("mousemove",()=>{
    if(!deckKbdCard || document.body.classList.contains("e-kbdnav")) return;
    const c=deckKbdCard; deckKbdCard=null;
    if(!c.matches(":hover")) deckWant(c,false,DECK_GRACE);
  },{passive:true});
  /* A click on a tucked reply opens the deck and is not copied. One still travelling is held:
     what is copied is what was there when the hand aimed. */
  document.addEventListener("click",e=>{
    const t=e.target && e.target.closest ? e.target.closest(".txt.deck-back") : null, c=t && deckAt(t);
    if(!c) return;
    if(!c.classList.contains("deck-open")){ e.stopPropagation(); e.preventDefault(); deckWant(c,true,0); return; }
    if(c.classList.contains("deck-moving")){ e.stopPropagation(); e.preventDefault(); }
  },true);
  deckLater();
}

let deckSizeObs=null, deckWatching=false, deckIO=null;
function deckInitIO(){
  if(typeof IntersectionObserver!=="function"||deckIO) return;
  let ioOpts={root:null, rootMargin:"0px"};
  if(list&&list.closest) ioOpts={root:list.closest(".scroller"), rootMargin:"100% 0px"}; /* plant:deck-io-root */
  deckIO=new IntersectionObserver(entries=>{
    const todo=[];
    for(const entry of entries){
      const c=entry.target;
      if(entry.isIntersecting){
        if(!c.classList.contains("deck-near")){
          c.classList.add("deck-near");
          if(deckSlabs(c).length>=2) todo.push(c); /* plant:deck-io-measure */
        }
      }else{
        if(!c.classList.contains("deck-open")&&!c.classList.contains("deck-up")){
          c.classList.remove("deck-near");
        }
      }
    }
    if(todo.length) deckMeasure(todo);
  },ioOpts);
}
function deckUnobserve(el){
  if(deckIO&&el) deckIO.unobserve(el);
}
// The sheet's half of the switch: body.deck-off takes the fade's transition off every card.
function deckClass(on){ try{ document.body.classList.toggle("deck-off",!on); }catch(e){} }
function deckWatch(on){
  if(on===deckWatching) return;
  deckWatching=on;
  if(on){
    if(deckObs) deckObs.observe(list,{childList:true, subtree:true, attributes:true, attributeFilter:["class"], attributeOldValue:true});
    if(deckSizeObs) deckSizeObs.observe(list);
    deckInitIO();
  }else{
    if(deckObs) deckObs.disconnect();
    if(deckSizeObs) deckSizeObs.disconnect();
    if(deckIO){ deckIO.disconnect(); deckIO=null; }
  }
}
// Every deck laid flat and every faded card given back at once, with the frames and timers that would redraw them.
function deckFlat(){
  [deckRaf,deckFadeRaf,deckApproachRaf].forEach(id=>{ if(id) cancelAnimationFrame(id); });
  deckRaf=0; deckFadeRaf=0; deckApproachRaf=0; deckKbdCard=null;
  deckOpenIds.clear(); deckRestHeld.clear();
  if(deckIO){ deckIO.disconnect(); deckIO=null; }
  list.querySelectorAll(".card.deck").forEach(c=>{ clearTimeout(c._deckM); deckReset(c); });
  list.querySelectorAll(".deck-under, .deck-fresh").forEach(e=>e.classList.remove("deck-under","deck-fresh"));
}
/* The switch read again from the store, for Settings, Reset and its Undo, and a desk started again in place: on, every
   deck is tucked afresh without a reload; off, laid flat. */
function syncDeck(){
  const on=deckOn();
  deckClass(on);
  if(!list) return;
  deckWatch(on);
  if(on) deckSettle(); else deckFlat();
}

export {
  deckLengths,
  deckCovers,
  deckOwnChange,
  deckReach,
  deckCarry,
  deckFade,
  deckScan,
  deckSettle,
  deckUnobserve,
  deckOn,
  syncDeck,
  wireDeck,
  deckDragEnd,
};
