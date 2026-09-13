import { animateTxtReorder } from "./card-blocks.js";
import { openCardEditor, hideCard, deleteCustomCard } from "./card-editor.js";
import { cardLang, cardTitle, parts } from "./card-model.js";
import { moveCardOrder } from "./card-order.js";
import { isCollapsed, toggleCollapsed } from "./collapse.js";
import { intentFor, fill } from "./intent-text.js";
import { mgReduceMotion } from "./motion.js";
import { pack } from "./pack.js";
import { cardSearchTerms } from "./spell.js";
import { t } from "./ui-lang.js";
import { toggleFavourite } from "./favourites.js";

// ---- card drag-reorder (within same relevance band only) ----------------
let cardDrag=null, cardSwapLock=0, cardSuppressClick=false;
/* How far the pointer must travel AGAINST the last swap before that swap can be undone. Above
   pointer jitter (a +/-1px wobble must not release the lockout) and far below any movement made
   on purpose. See the partner lockout in the pointermove handler. */
const CARD_DRAG_REVERSE=8;
/* Star and hide MOVE a card, and without motion the acted-on card appears to vanish -
   the one thing an undoable action should never look like. The intent-pick FLIP cannot
   be reused: that one refuses above 25 cards because an intent reshuffles the whole
   list; this moves ONE card plus the neighbours closing its gap. So the cap here is on
   what gets TRANSFORMED: cards within half a screen, moves shorter than one viewport, at
   most CARD_MOVE_MAX of them. A card leaving for far off-screen is not animated - the
   gap closing behind it still says where it went. */
const CARD_MOVE_MAX=40;
function flipCardsAround(mutate,opts){
  if(!list || mgReduceMotion()){ mutate(); return; }
  const vh=window.innerHeight, margin=vh*0.5;
  /* clampTravel (the fold path only): everything below a folded group is one rigid
     block whose true travel is the group's height - one to five viewports, far past the
     teleport cap, so the glide never played and a fold just blinked. Clamping starts the
     block at most this many pixels from where it lands - the same settle the card swap
     plays, in the direction the shelf closed, never the full-distance blur the cap
     forbids. Star and hide pass nothing and keep the strict cap: their movers travel
     alone, and a lone card teleporting reads as scrolling. A clamped fold also CAPTURES
     the whole list: a collapse lands cards from a group-height below, and an arrival
     with no before-rect cannot animate. Capturing is one rect per card on the laid-out
     old tree - cheap; what must stay bounded is FORCING rects real after the re-render,
     so the estimate rects narrow the watch first and only cards that can land near the
     viewport get forced. */
  const clamp=opts&&opts.clampTravel;
  /* Only while the watched window reaches the columns' first cards. The re-render
     replaces every node and content-visibility resolves relevancy a frame later - a rect
     read straight afterwards is the 220px estimate. Forcing the watched cards real is not
     enough: their positions still ride on every estimated card ABOVE them in the column,
     and that offset has a hide's exact signature (one uniform card height). Near the top
     nothing sits above to estimate - and that is where star and hide are used: the
     favourites block. Scrolled deep, the honest options are a full layout (the exact
     cost content-visibility avoids) or no animation; the card takes its new place - the
     standing preference over animating from offsets that never existed. */
  if(list.getBoundingClientRect().top<=-margin){ mutate(); return; }
  const before={};
  // READ pass, then the mutation, then a READ pass and a WRITE pass - never interleaved.
  list.querySelectorAll(".card[data-id]").forEach(el=>{
    const r=el.getBoundingClientRect();
    if(clamp || (r.bottom>-margin && r.top<vh+margin)) before[el.dataset.id]=r.top;
  });
  mutate();                                   // the toggles mutate AND re-render
  const watched=[];
  list.querySelectorAll(".card[data-id]").forEach(el=>{
    if(before[el.dataset.id]==null) return;
    if(clamp){
      const r=el.getBoundingClientRect();     // estimate rect - only good enough to shortlist
      if(r.bottom<-1.5*vh || r.top>2.5*vh) return;
    }
    watched.push(el); el.style.contentVisibility="visible";
  });
  const release=()=>watched.forEach(el=>{ el.style.contentVisibility=""; });
  const moved=[], dys=[];
  watched.forEach(el=>{
    const b=before[el.dataset.id];
    const r=el.getBoundingClientRect();
    if(r.bottom<-margin || r.top>vh+margin) return;
    // whole pixels only - a fractional offset puts the text on a half-pixel and it blurs
    let dy=Math.round(b-r.top);
    if(!dy) return;
    if(Math.abs(dy)>vh && !clamp) return;
    if(clamp && Math.abs(dy)>clamp) dy=(dy>0?clamp:-clamp);
    moved.push(el); dys.push(dy);
  });
  if(!moved.length || moved.length>CARD_MOVE_MAX){ release(); return; }
  moved.forEach((el,i)=>{ el.style.transition="none"; el.style.willChange="transform";
                          el.style.transform="translateY("+dys[i]+"px)"; });
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. One forced reflow for
     the whole list, then attach and release in the same task. */
  void (list||document.body).offsetHeight;
  const clear=()=>{ moved.forEach(el=>{ el.style.transition=""; el.style.transform=""; el.style.willChange=""; }); release(); };
  moved.forEach(el=>{ el.style.transition="transform .18s "+E_EASE; el.style.transform=""; });
  setTimeout(clear,240);
}
/* Fold and unfold move: the survivors glide through flipCardsAround exactly as for a
   star or hide; the cards an unfold reveals are the ids the render added - no knowledge
   of the group needed - and rise in from their heading. A collapse adds nothing, so only
   the glide plays: the gap closing behind the group is the exit. The fresh chevron is
   handed an animation that finishes the turn from the old state. */
function animateFoldToggle(key){
  const had=new Set();
  if(list) list.querySelectorAll(".card[data-id]").forEach(el=>had.add(el.dataset.id));
  flipCardsAround(()=>{ toggleCollapsed(key); render(); },{clampTravel:180});
  if(!list || mgReduceMotion()) return;
  const fold=list.querySelector('.sep-fold[data-fold-key="'+cssEsc(key)+'"]');
  if(fold){
    const turn=isCollapsed(key)?"e-turn-shut":"e-turn-open";
    fold.classList.add(turn);
    setTimeout(()=>fold.classList.remove(turn),220);
  }
  const fresh=[];
  list.querySelectorAll(".card[data-id]").forEach(el=>{ if(!had.has(el.dataset.id)) fresh.push(el); });
  if(!fresh.length) return;
  fresh.forEach(el=>el.classList.add("e-unfolding"));
  setTimeout(()=>fresh.forEach(el=>el.classList.remove("e-unfolding")),260);
}
/* A swap during a drag no longer re-renders the list. Two bugs shared that root -
   "cards far from the drag wobble, and on Firefox nothing animates at all": render()
   replaces every node, and content-visibility:auto resolves relevancy a frame AFTER
   creation, so rects read straight after the rebuild are 220px estimates - on an
   adjacent swap, 251 of 253 cards reported a bogus delta and got a transform layer.
   Chrome showed distant wobble; Firefox dropped the animation whole. The re-render per
   crossing was also most of what made dragging heavy.
   So the swap MOVES THE DOM NODES exactly as far as the data order moved, and measures
   only the cards between the two positions - live elements, real geometry. THE MARKS
   make it dealing-agnostic: every affected card's current DOM position is marked and the
   rotated sequence poured back into the same marks - reproducing what a full re-deal
   would produce in every column shape without knowing which is on screen. dataset.ord
   follows the marks, so listCardsOrdered() stays truthful; the dragged card keeps its
   node, so .dragging survives without re-application. */
function animateCardReorder(fromId,toId){
  if(!moveCardOrder(fromId,toId)) return;
  if(!list || mgReduceMotion()){ render(); return; }
  const ordered=listCardsOrdered();
  let fromI=-1, toI=-1;
  ordered.forEach((el,i)=>{
    if(el.dataset.id===fromId) fromI=i;
    if(el.dataset.id===toId) toI=i;
  });
  if(fromI<0||toI<0||fromI===toI){ render(); return; }   // stale DOM - take the full path
  const lo=Math.min(fromI,toI), hi=Math.max(fromI,toI);
  const span=ordered.slice(lo,hi+1);
  const before=span.map(el=>el.getBoundingClientRect());
  const marks=span.map(el=>{
    const m=document.createComment("slot");
    el.parentNode.insertBefore(m,el);
    return m;
  });
  const seq=span.slice();
  seq.splice(toI-lo,0,seq.splice(fromI-lo,1)[0]);       // the same rotation the data order made
  const ords=span.map(el=>el.dataset.ord);
  seq.forEach((el,i)=>{ marks[i].parentNode.insertBefore(el,marks[i]); el.dataset.ord=ords[i]; });
  marks.forEach(m=>m.remove());
  // Read every position first, then write every transform: a rect read after a style write
  // forces a fresh layout to answer it, which is one full layout per card.
  const vh=window.innerHeight, margin=vh;
  const moved=[], deltas=[];
  span.forEach((el,i)=>{
    const b=before[i], a=el.getBoundingClientRect();
    if((b.bottom<-margin||b.top>vh+margin)&&(a.bottom<-margin||a.top>vh+margin)) return;
    const dx=Math.round(b.left-a.left), dy=Math.round(b.top-a.top);
    if(!dx && !dy) return;
    moved.push(el); deltas.push(dx+"px,"+dy+"px");
  });
  if(!moved.length || moved.length>CARD_MOVE_MAX) return;
  moved.forEach((p,i)=>{ p.style.transition="none"; p.style.willChange="transform";
                         p.style.transform="translate("+deltas[i]+")"; });
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void list.offsetHeight;
  moved.forEach(p=>{ p.style.transition="transform .18s "+E_EASE; p.style.transform=""; });
  setTimeout(()=>moved.forEach(p=>{ p.style.transition=""; p.style.transform=""; p.style.willChange=""; }),200);
}
// ---- alt/seq block drag-reorder (within one card) -----------------------
let txtDrag=null, txtSwapLock=0, txtSuppressClick=false;
function endCardDrag(){
  if(txtDrag){
    const didMove=!!txtDrag.moved;
    txtDrag=null;
    document.documentElement.classList.remove("txtdrag");
    if(list) list.querySelectorAll(".txt").forEach(p=>p.classList.remove("dragging"));
    if(didMove) txtSuppressClick=true;
    return;
  }
  if(!cardDrag) return;
  const didMove=!!cardDrag.moved;
  cardDrag=null;
  document.documentElement.classList.remove("carddrag");
  if(list) list.querySelectorAll(".card").forEach(p=>p.classList.remove("dragging"));
  if(didMove){
    cardSuppressClick=true;
    savePack();
  }
}
function wireListPointer(){
  if(list){
    list.addEventListener("pointerdown",e=>{
      if(e.button!==0) return;
      // Alt/seq block drag (only when multiple parts)
      const txt=e.target.closest(".txt[data-v]");
      if(txt){
        const card=txt.closest(".card[data-id]");
        if(card){
          const m=findCard(card.dataset.id);
          const n=m&&m.alt?parts(m,cardLang(m)).length:0;
          if(n>1){
            try{ e.preventDefault(); }catch(_){}
            txtSuppressClick=false;
            txtDrag={mid:card.dataset.id, vi:+txt.dataset.v, x:e.clientX, y:e.clientY, moved:false};
            return;
          }
        }
        return; // single-block txt: leave for click-to-copy; no card drag
      }
      // Card drag from header chrome only - not action buttons, copy blocks, or intent chips
      if(e.target.closest(".cacts, .txt, .swap, button, a, code, input, textarea, select")) return;
      const card=e.target.closest(".card[data-id]");
      if(!card) return;
      // Relevance-ranked list while searching: never start a card drag (see moveCardOrder)
      if(cardSearchTerms().length) return;
      if(!e.target.closest(".chead") && e.target.closest(".note")) return;
      // Avoid browser text-selection while preparing a drag (empty padding between blocks)
      try{ e.preventDefault(); }catch(_){}
      cardSuppressClick=false;
      // partner = the card most recently swapped with; it is refused a swap back while the pointer
      // is still inside it, which is what lets the swap fire at the target's edge without thrashing.
      cardDrag={key:card.dataset.id, rank:card.dataset.rank, x:e.clientX, y:e.clientY, moved:false,
                partner:null, partnerAxis:"y", partnerDir:0, partnerPos:0};
    });
  }
  addEventListener("pointermove",e=>{
    // --- alt/seq block reorder ---
    if(txtDrag){
      if(!txtDrag.moved){
        if(Math.abs(e.clientX-txtDrag.x)+Math.abs(e.clientY-txtDrag.y)<6) return;
        txtDrag.moved=true;
        document.documentElement.classList.add("txtdrag");
        try{ const s=window.getSelection&&window.getSelection(); if(s&&s.removeAllRanges) s.removeAllRanges(); }catch(_){}
        const el=list&&list.querySelector('.card[data-id="'+cssEsc(txtDrag.mid)+'"] .txt[data-v="'+txtDrag.vi+'"]');
        if(el) el.classList.add("dragging");
      }
      if(Date.now()-txtSwapLock<190) return;
      const under=document.elementFromPoint(e.clientX,e.clientY);
      const t=under&&under.closest?under.closest(".txt[data-v]"):null;
      if(!t) return;
      const card=t.closest(".card[data-id]");
      if(!card||card.dataset.id!==txtDrag.mid) return;
      const toVi=+t.dataset.v;
      if(!Number.isInteger(toVi)||toVi===txtDrag.vi) return;
      // Swap as soon as the pointer is over the other block (not midpoint). Lock avoids thrash.
      txtSwapLock=Date.now();
      const fromVi=txtDrag.vi;
      if(animateTxtReorder(txtDrag.mid, fromVi, toVi, txtDrag.moved)){
        txtDrag.vi=toVi;
        if(entrySel&&entrySel.id===txtDrag.mid&&entrySel.vi===fromVi) entrySel={id:txtDrag.mid, vi:toVi};
        markEntrySel();
      }
      return;
    }
    // --- whole-card reorder ---
    if(!cardDrag) return;
    if(!cardDrag.moved){
      if(Math.abs(e.clientX-cardDrag.x)+Math.abs(e.clientY-cardDrag.y)<6) return;
      cardDrag.moved=true;
      document.documentElement.classList.add("carddrag");
      try{ const s=window.getSelection&&window.getSelection(); if(s&&s.removeAllRanges) s.removeAllRanges(); }catch(_){}
      const el=list&&list.querySelector('.card[data-id="'+cssEsc(cardDrag.key)+'"]');
      if(el) el.classList.add("dragging");
    }
    if(Date.now()-cardSwapLock<190) return;
    const under=document.elementFromPoint(e.clientX,e.clientY);
    const t=under&&under.closest?under.closest(".card[data-id]"):null;
    if(!t||t.dataset.id===cardDrag.key) return;
    // Only swap within the same highlight band (green / blue / fav combos / regular)
    if(String(t.dataset.rank)!==String(cardDrag.rank)) return;
    /* Swap the moment the pointer touches the target, exactly as the intent panel does. A
       midpoint test stopped the thrash but charged ~121px of dragging before anything
       moved; a bare edge thrashed. What prevents thrash is not distance but refusing to
       swap BACK with the card just swapped - oscillation IS that pair trading places;
       block it and the edge is stable, and a genuine change of direction still resolves.
       Chosen over a direction lock, which keys off the sign of pointer movement and flaps
       on jittery input; this test is purely positional. The 190ms lock above stays: it
       covers the FLIP, so geometry is never read mid-transform.
       The lockout MUST release on a deliberate reversal, or it blocks undo: after a swap
       the pointer sits inside the partner, so putting a card straight back needed dragging
       clear of a whole card first. Moving CARD_DRAG_REVERSE px against the swap releases
       it; jitter never travels that far in one direction.
       THE AXIS IS PART OF THE LOCKOUT: the band deals round-robin, so order-neighbours sit
       side by side - a horizontal swap measured on clientY can never release, and a
       top/bottom "still inside" is true for the whole row. The swap's own geometry names
       the axis: whichever separates the two centres more. */
    const relPos=cardDrag.partnerAxis==="x"?e.clientX:e.clientY;
    if(cardDrag.partner!=null && cardDrag.partnerDir &&
       (relPos-cardDrag.partnerPos)*cardDrag.partnerDir < -CARD_DRAG_REVERSE){
      cardDrag.partner=null;
    }
    if(cardDrag.partner===t.dataset.id){
      const pr=t.getBoundingClientRect();
      const inside=cardDrag.partnerAxis==="x"
        ? (e.clientX>=pr.left && e.clientX<pr.right)
        : (e.clientY>=pr.top && e.clientY<pr.bottom);
      if(inside) return;   // still inside it - this is the swap back
    }
    /* Ordered, not document order: with columns on the two disagree, and a drag would then
       reorder against a sequence the user cannot see. */
    const cards=listCardsOrdered();
    const fromEl=list&&list.querySelector('.card[data-id="'+cssEsc(cardDrag.key)+'"]');
    const fromI=fromEl?cards.indexOf(fromEl):-1;
    const toI=cards.indexOf(t);
    if(fromI<0||toI<0||fromI===toI) return;
    const fromR=fromEl.getBoundingClientRect(), toR=t.getBoundingClientRect();
    const ddx=(toR.left+toR.width/2)-(fromR.left+fromR.width/2);
    const ddy=(toR.top+toR.height/2)-(fromR.top+fromR.height/2);
    const horiz=Math.abs(ddx)>Math.abs(ddy);
    cardSwapLock=Date.now();
    cardDrag.partner=t.dataset.id;
    cardDrag.partnerAxis=horiz?"x":"y";
    cardDrag.partnerDir=horiz?(ddx>0?1:-1):(ddy>0?1:-1);
    cardDrag.partnerPos=horiz?e.clientX:e.clientY;
    animateCardReorder(cardDrag.key, t.dataset.id);
  },{passive:true});
  addEventListener("pointerup",endCardDrag);
  addEventListener("pointercancel",endCardDrag);

  list.addEventListener("click",e=>{
    /* The fold control, before the drag guards below it. A separator takes no part in drag or
       focus logic, so a click here cannot be a suppressed drag and must not be swallowed by the
       checks that exist for cards. */
    const fold=e.target.closest(".sep-fold[data-fold-key]");
    if(fold){
      e.preventDefault(); e.stopPropagation();
      animateFoldToggle(fold.getAttribute("data-fold-key"));
      return;
    }
    if(cardSuppressClick){ cardSuppressClick=false; return; }
    if(txtSuppressClick){ txtSuppressClick=false; return; }
    const actBtn=e.target.closest(".cacts button");
    if(actBtn){
      e.preventDefault(); e.stopPropagation();
      const card=actBtn.closest(".card");
      const id=card && card.dataset.id;
      const act=actBtn.dataset.act;
      // Both of these move the card, so both animate the move - see flipCardsAround().
      if(act==="fav"){ if(id) flipCardsAround(()=>toggleFavourite(id)); }
      else if(act==="edit") openCardEditor(id);
      else if(act==="note") toggleNotePane(actBtn, id);
      else if(act==="hide") flipCardsAround(()=>hideCard(id));
      else if(act==="delete") deleteCustomCard(id);
      return;
    }
    const code=e.target.closest(".swap code");
    if(code){
      const si=+code.dataset.si;
      // Active chip (or its ✕): drop just that intent, keep any others.
      // Ctrl/Cmd+click on an inactive chip adds it; plain click on inactive replaces the set.
      if(e.ctrlKey||e.metaKey || intentIdxs.indexOf(si)>-1) pickIntent(si,true);
      else pickIntent(si,false);
      toast(intentIdxs.length ? t("{INTENT} set -")+" "+intentFor() : t("{INTENT} cleared"));
      return;
    }
    /* `txtEl`, not `t`: t() is the translation function, and a const of that name puts the
       whole scope - including the toast above - in its temporal dead zone. */
    const txtEl=e.target.closest(".txt[data-v]");
    if(!txtEl) return;
    const card=txtEl.closest(".card[data-id]");
    if(!card) return;
    const mid=card.dataset.id;
    const m=findCard(mid)||shown[+card.dataset.i];
    if(!m) return;
    /* WHAT IS SHOWN IS WHAT IS COPIED. Asking the toggle here copied the other language's
       text off a pinned card, which reads correctly on screen and lands wrong in the chat. */
    const cl=cardLang(m);
    const ps=parts(m,cl), vi=+txtEl.dataset.v;
    if(!ps.length||vi<0||vi>=ps.length) return;
    setEntrySel(mid, vi); // focus this block only - never rebuild the list under the cursor
    // Show the selection ring straight away even though the pointer is still on the block;
    // it answers hover again once the pointer leaves and comes back.
    txtEl.classList.add("just-picked");
    txtEl.addEventListener("pointerleave", ()=>txtEl.classList.remove("just-picked"), {once:true});
    bumpUseCount(mid);
    copy(fill(ps[vi],m), copiedToastMsg(m, cl, vi, ps.length));
  });
}

/* ONE SENTENCE, BUILT ONCE, for both copy routes: glued from fragments it stays English in
   a Polish interface however well toast() translates, and two gluings disagree about the
   same card. The language code is not translated: EN and PL name the card's language, not
   the interface's. */
function copiedToastMsg(m, lang, vi, total){
  const code=String(lang||"").toUpperCase();
  const where=m&&m.seq ? code+" "+t("step")+" "+(vi+1)+"/"+total
                       : code+(total>1 ? " "+(vi+1)+"/"+total : "");
  return t("Copied {WHAT} from {TITLE}").replace("{WHAT}",where).replace("{TITLE}",cardTitle(m));
}
/* Local copy counter: one integer per card id, stored in the pack, never exported and
   never sent anywhere (nothing in this file could send it). Answers two questions
   nothing else can: which phrases earn their place - a count on the Manage rows - and
   how often the tool is actually used, the honest denominator for any time-saved
   estimate. Reset clears it with everything else. */
function bumpUseCount(id){
  if(!id) return;
  if(!pack.useCounts||typeof pack.useCounts!=="object") pack.useCounts={};
  pack.useCounts[id]=(pack.useCounts[id]|0)+1;
  savePack();
}

export {
  bumpUseCount,
  cardDrag,
  CARD_MOVE_MAX,
  copiedToastMsg,
  wireListPointer
};
