import { list } from "./dom.js";
import { mgReduceMotion, M_MS } from "./motion.js";
/* THE DECK: a card holding two or more replies rests as its first, the others tucked behind it
   with one bottom edge showing for each, three at most. The pointer resting on it, or the
   keyboard's mark on any of its replies, deals them down into the places they hold in the flat
   list; the card's own box keeps its resting height, so no other card moves. The front never
   travels, so a click on it copies at once. */
const DECK_PEEK=6, DECK_INSET=7, DECK_DEPTH=3, DECK_DWELL=70, DECK_GRACE=110, DECK_DIM=[1,.8,.64,.5];
const DECK_SLAB_PROPS=["--deck-dy","--deck-sx","--deck-clip","--deck-dim","--deck-z","--deck-k"];

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
  card.classList.remove("deck","deck-open","deck-up","deck-moving");
  ["height","--deck-rest-bottom","--deck-extra"].forEach(p=>card.style.removeProperty(p));
  deckSlabs(card).forEach(s=>{ s.classList.remove("deck-back"); DECK_SLAB_PROPS.forEach(p=>s.style.removeProperty(p)); });
  clearTimeout(card._deckT); card._deckGrow=0;
}
let deckRaf=0, deckKbdCard=null;
/* Every card is measured afresh after any change in the list. A card's height is let go for all
   of them first, then every slab is read, then every length written, so the list costs one
   layout rather than one per card. */
function deckScan(){
  deckRaf=0;
  if(!list) return;
  const todo=[];
  list.querySelectorAll(".card[data-id]").forEach(c=>{
    if(deckSlabs(c).length<2){ if(c.classList.contains("deck")) deckReset(c); return; }
    c.style.removeProperty("height"); c.classList.add("deck"); todo.push(c);
  });
  const read=todo.map(c=>{
    const s=deckSlabs(c);
    return {c, s, L:deckLengths(s.map(e=>e.offsetTop), s.map(e=>e.offsetHeight), s[0].offsetWidth, c.offsetHeight)};
  });
  read.forEach(({c,s,L})=>{
    c.style.height=deckPx(L.rest);
    c.style.setProperty("--deck-rest-bottom",deckPx(L.restBottom));
    c.style.setProperty("--deck-extra",deckPx(L.extra));
    c._deckGrow=L.grow;
    s.forEach((e,k)=>{
      const v=L.slabs[k];
      e.style.setProperty("--deck-z",String(v.z)); e.style.setProperty("--deck-k",String(k));
      if(!k){ e.classList.remove("deck-back"); return; }
      e.classList.add("deck-back");
      e.style.setProperty("--deck-dy",deckPx(v.dy)); e.style.setProperty("--deck-sx",String(v.sx));
      e.style.setProperty("--deck-clip",deckPx(v.clip)); e.style.setProperty("--deck-dim",String(v.dim));
    });
    if(c.matches(":hover") || c===deckKbdCard) deckSetOpen(c,true,true);
  });
}
function deckLater(){ if(!deckRaf) deckRaf=requestAnimationFrame(deckScan); }

function deckSetOpen(card, open, instant){
  clearTimeout(card._deckT);
  if(open===card.classList.contains("deck-open")) return;
  // Only a change cancels the deal's end: a repeated ask that did would leave deck-moving on, and the click guard holding.
  clearTimeout(card._deckM);
  const now=mgReduceMotion() || instant, travel=now?0:M_MS.travel, move=now?0:M_MS.move;
  if(open){
    card.classList.add("deck-up","deck-open");
    if(travel){
      const n=deckSlabs(card).length;
      card.classList.add("deck-moving");
      card._deckM=setTimeout(()=>card.classList.remove("deck-moving"), travel+(n-1)*travel/9);
    }
  } else {
    card.classList.remove("deck-open","deck-moving");
    card._deckM=setTimeout(()=>{ if(!card.classList.contains("deck-open")) card.classList.remove("deck-up"); }, move+40);
  }
}
function deckWant(card, open, ms){
  clearTimeout(card._deckT);
  if(!ms){ deckSetOpen(card,open); return; }
  card._deckT=setTimeout(()=>deckSetOpen(card,open), ms);
}
function deckAt(el){ return el && el.closest ? el.closest(".card.deck") : null; }

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
function deckFade(){
  if(!list) return;
  const items=Array.from(list.querySelectorAll(".card[data-id], .list-sep")), want=new Set();
  list.querySelectorAll(".card.deck.deck-open").forEach(card=>{
    const c=card.getBoundingClientRect(), cs=card.style;
    const reach={top:c.top, left:c.left, right:c.right,
      bottom:c.top+(parseFloat(cs.getPropertyValue("--deck-rest-bottom"))||0)+(parseFloat(cs.getPropertyValue("--deck-extra"))||0)+2};
    items.forEach(e=>{ if(e!==card && deckCovers(reach, e.getBoundingClientRect())) want.add(e); });
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
function deckFadeLater(){ if(!deckFadeRaf) deckFadeRaf=requestAnimationFrame(()=>{ deckFadeRaf=0; deckFade(); }); }

// The keyboard's mark on any of a deck's replies opens it; the first pointer move hands it back.
function deckKbdSync(){
  if(!list) return;
  const sel=document.body.classList.contains("e-kbdnav") ? list.querySelector(".txt.sel") : null;
  const c=sel ? deckAt(sel) : null;
  if(deckKbdCard && deckKbdCard!==c && !deckKbdCard.matches(":hover")) deckSetOpen(deckKbdCard,false);
  deckKbdCard=c;
  if(!c) return;
  const was=c.classList.contains("deck-open");
  deckSetOpen(c,true);
  if(!was) setTimeout(()=>sel.scrollIntoView({block:"nearest", behavior:mgReduceMotion()?"auto":"smooth"}), mgReduceMotion()?0:200);
}

/* A module may not register a listener at load: boot calls this after the note pane's. */
function wireDeck(){
  if(!list) return;
  new MutationObserver(ms=>{
    let shape=false, fade=false;
    for(const r of ms){
      if(r.type==="childList"){ shape=true; fade=true; }
      else if(!deckOwnChange(r.oldValue, r.target.getAttribute("class"))) fade=true;
    }
    if(shape) deckLater();
    if(fade) deckFade();
  }).observe(list,{childList:true, subtree:true, attributes:true, attributeFilter:["class"], attributeOldValue:true});
  if(typeof ResizeObserver==="function") new ResizeObserver(()=>{ deckLater(); deckFadeLater(); }).observe(list);
  // A card caught mid-move, a fresh card's unfold or a slab still travelling, is read again once it lands.
  list.addEventListener("animationend",deckFadeLater); list.addEventListener("transitionend",deckFadeLater);
  document.addEventListener("scroll",deckFadeLater,{capture:true, passive:true});
  addEventListener("resize",deckFadeLater);

  // The pointer deals after a short rest, so a sweep across the desk deals nothing, and leaves
  // after a grace that covers the gap between two slabs.
  document.addEventListener("pointerover",e=>{
    const c=deckAt(e.target), from=deckAt(e.relatedTarget);
    if(c && c!==from) deckWant(c,true,DECK_DWELL);
    if(from && from!==c) deckWant(from,false,DECK_GRACE);
  },true);
  document.addEventListener("pointerout",e=>{
    const c=deckAt(e.target), to=deckAt(e.relatedTarget);
    if(c && c!==to && !e.relatedTarget) deckWant(c,false,DECK_GRACE);
  },true);
  addEventListener("keydown",()=>setTimeout(deckKbdSync,0),true);
  addEventListener("mousemove",()=>{
    if(!deckKbdCard || document.body.classList.contains("e-kbdnav")) return;
    const c=deckKbdCard; deckKbdCard=null;
    if(!c.matches(":hover")) deckWant(c,false,DECK_GRACE);
  },{passive:true});
  // A click on a reply still on its way is held: what is copied is what was there when the hand aimed.
  document.addEventListener("click",e=>{
    const t=e.target && e.target.closest ? e.target.closest(".txt.deck-back") : null, c=t && deckAt(t);
    if(c && (c.classList.contains("deck-moving") || !c.classList.contains("deck-open"))){ e.stopPropagation(); e.preventDefault(); }
  },true);
  deckLater();
}

export {
  deckLengths,
  deckCovers,
  deckOwnChange,
  deckReach,
  deckFade,
  deckScan,
  wireDeck,
};
