import { CARD_MOVE_MAX } from "./list-pointer.js";
import { mgReduceMotion } from "./motion.js";
import { nsSet } from "./storage.js";
import { drawPills } from "./tabs.js";
import { intentCats, pillBand } from "./cat-relevance.js";

// What the app plays when something moves: the FLIP captures and their playback, the frame
// pump that keeps them ticking, and what a picked intent paints. Whether any of it runs at
// all is motion.js's.
/* ---- THE PAINT PUMP ---------------------------------------------------------------------
   Some Firefox setups do not produce frames for a running CSS transition. The transition itself
   is fine: it starts, it reports the right duration, and it fires transitionend at the right
   moment - a log of transitionrun/start/end on .rail-item showed clean pairs ending at 180, 207
   and 218ms, matching Chrome exactly. What never happens is the painting in between, so the row
   sits at its inverted start position and then appears at the destination. Everything about it
   reads as "the animation did not run" and none of it is true.
   What proved it: an empty requestAnimationFrame loop, running and doing nothing else, makes
   every animation in the app correct. Turn the loop off and they break again. Diagnosed on
   Firefox 153 against Chrome 151 on the same machine, both reporting prefers-reduced-motion
   false, identical transition durations, hardware acceleration on, and a display running at
   roughly 233Hz - which is the territory these refresh-driver faults live in. Present as far
   back as 1.3.0, so it has never worked there.
   So: whenever an animation starts, keep asking for frames until a little after the last one
   began. A no-op rAF callback is close to free, it only runs while something is animating, and
   on a browser that ticks itself properly it changes nothing at all.
   Deadline rather than a counter, deliberately. Counting starts against ends means one missing
   transitioncancel leaks a permanent loop; a deadline that each new event pushes forward cannot
   leak, and the worst case is 500ms of empty callbacks after the last animation.
   500ms because the longest thing here is 220ms and this only has to outlive it. */
let ePumpUntil=0, ePumping=false;
function ePumpFrame(){
  if(performance.now()>=ePumpUntil){ ePumping=false; return; }
  requestAnimationFrame(ePumpFrame);
}
function eKickPump(){
  ePumpUntil=performance.now()+500;
  if(!ePumping){ ePumping=true; requestAnimationFrame(ePumpFrame); }
}
/* Capture phase, on the document: transitionrun and animationstart both bubble, but capture
   catches them even where a handler stops propagation. Reduced motion needs no guard - it
   produces no animations, so no events, so no pump. */
function wirePumpKick(){
  ["transitionrun","animationstart"].forEach(function(t){
    document.addEventListener(t, eKickPump, true);
  });
}

/** The "invert and play" half. Call after the pills have been redrawn in their new order. */
/* READ EVERY POSITION FIRST, THEN WRITE EVERY TRANSFORM: a rect read after a style
   write forces a full layout PER PILL - interleaved, this was 25.6ms of a 180ms
   animation budget. Split, each pass is one layout. */
function flipPills(before){
  if(!before) return;
  const moved=[], deltas=[], wEls=[], wStarts=[];
  pills.querySelectorAll(".pill").forEach(p=>{
    const k=p.dataset.k, b=k&&before[k];
    if(!b) return;
    const a=p.getBoundingClientRect();
    /* Width changes ride the same flip - a selection bolds the name, a recount changes the
       digits, and either snapping while neighbours slide reads as a glitch. 1.5px floor:
       fractional DPRs round every pill differently on every pass. */
    if(Math.abs(b.width-a.width)>=1.5){ wEls.push(p); wStarts.push(b.width); p.dataset._eW=a.width; }
    // whole pixels only - fractional offsets put the text on a half-pixel and it blurs
    const dx=Math.round(b.left-a.left), dy=Math.round(b.top-a.top);
    if(!dx && !dy) return;
    moved.push(p); deltas.push(dx+"px,"+dy+"px");
  });

  /* WILL-CHANGE set with the INVERT - the forced reflow between the passes makes the
     layer exist before the animation starts; asked at animation time it buys nothing.
     Cleared with the transform: an idle layer is memory for nothing. Needed because this
     runs while the main thread is busy - Chrome composites animated transforms
     regardless, Firefox falls back to the main thread without the promotion. */
  moved.forEach((p,i)=>{
    p.style.transition="none";
    p.style.willChange="transform";
    p.style.transform="translate("+deltas[i]+")";
  });
  /* Width rides the SAME transition string as the slide - two tweens fighting over
     style.transition left whichever wrote last, and the other snapped. */
  const hNat=pills.scrollHeight;   // through the clip - see the note at tweenPillWidths
  wEls.forEach((p,i)=>{ if(moved.indexOf(p)<0) p.style.transition="none"; p.style.width=wStarts[i]+"px"; });
  if(!moved.length && !wEls.length) return;
  /* Commit the inverted position before attaching the transition. A frame is not a commitment:
     these elements were often created by the re-render a moment ago, and if the browser never
     computes a style with the transform applied it has no start value to animate from. Chrome
     happened to commit it inside the rAF and animated; Firefox did not, and the row simply
     appeared in its new place. One forced reflow, then attach and release in the same task -
     which also removes the rAF that a background tab would otherwise pause indefinitely. */
  void pills.offsetHeight;
  /* Height is the invariant - see tweenPillWidths. A rolled-back width still slides. */
  if(wEls.length && pills.scrollHeight!==hNat){
    wEls.forEach(p=>{ p.style.width=""; delete p.dataset._eW; });
    wEls.length=0;
  }
  const T=".18s "+E_EASE;
  moved.forEach(p=>{ p.style.transition="transform "+T+(wEls.indexOf(p)>=0?", width "+T:""); p.style.transform=""; });
  wEls.forEach(p=>{ if(moved.indexOf(p)<0) p.style.transition="width "+T; p.style.width=p.dataset._eW+"px"; });
  setTimeout(()=>{
    moved.forEach(p=>{ p.style.transition=""; p.style.transform=""; p.style.willChange=""; });
    wEls.forEach(p=>{ p.style.transition=""; p.style.width=""; delete p.dataset._eW; });
  },200);
}
function animateReorder(mutate){
  const before=capturePills();
  mutate();
  drawPills();
  flipPills(before);
}
/* FLIP for cards when an intent re-sorts them. Same two-half shape as the pills, but
   cards need guards the pills do not, because a card list is not a pill strip:
   - MEMBERSHIP must be identical. Macro search removes 175 of 199 entries; that is a filter,
     not a reorder, and there is nothing to interpolate for a card that no longer exists.
   - SIZE cap. In the All view an intent re-sort moves 197 cards a median of 1747px and a
     maximum of 42861px. A card crossing 42861px in a fifth of a second is a blur artifact,
     and it would mean 199 transform layers.
   - TRAVEL cap per card, for the same reason at the level of a single card.
   - VIEWPORT filter. Cards are ~274px tall, so about three are on screen; animating the rest
     is invisible work.
   - SCROLL-TOP only. pickIntent sets pendingScrollHit, and render() then smooth-scrolls to
     the first linked entry, which can be a 12000px journey. Animating card positions under a
     viewport travelling that far reads as chaos. Near the top that scroll is a no-op, which
     is exactly when the animation is worth having, so the two never run at once. */
/* No cap on how many cards are on the PAGE. The old 25-cap meant a real catalog never
   animated - the measurement was of the wrong thing: an intent pick moves ~200 cards,
   but only NINE are anywhere near the viewport. What has to be capped is TRANSFORMS,
   which the viewport filter and CARD_MOVE_MAX below already do - the same shape
   flipCardsAround() uses for star and hide. */
/* Travel cap at half a viewport (~1.5 cards): far enough to watch a card change
   places, not far enough to be mistaken for the page scrolling - long moves read as
   unwanted auto-scroll, never as swaps. */
const CARD_FLIP_TRAVEL_VH=0.5;
const CARD_FLIP_SCROLL_TOP=80;     // only when the auto-scroll will not move the view
function captureCards(){
  if(!list || mgReduceMotion() || pageScrollY()>CARD_FLIP_SCROLL_TOP) return null;
  const els=list.querySelectorAll(".card[data-id]");
  if(!els.length) return null;
  /* Positions for the cards near the viewport, plus the total count. The count is what
     tells a REORDER from a FILTER: a search removes most of the list, and there is
     nothing to interpolate for a card that no longer exists. The captured subset cannot
     say that - it is meant to be smaller than the list. */
  const margin=window.innerHeight;
  const tops={};
  let n=0;
  els.forEach(c=>{
    n++;
    const r=c.getBoundingClientRect();
    if(r.bottom>-margin && r.top<window.innerHeight+margin) tops[c.dataset.id]=r.top;
  });
  return {n:n, tops:tops};
}
function flipCards(before){
  if(!before || !list) return;
  const els=Array.prototype.slice.call(list.querySelectorAll(".card[data-id]"));
  // Identical membership only - a filter is not a reorder.
  if(!els.length || els.length!==before.n) return;
  /* Honest rects: the render that preceded this replaced every node, and
     content-visibility:auto resolves relevancy a frame later - a rect read now sees the
     220px estimate, not the card. Forcing the property on the watched cards makes their
     rects real; the scroll-top gate in captureCards() means nothing estimated sits above
     them, so real is also correct. Released with the transition cleanup, or on any bail. */
  const watched=[];
  els.forEach(c=>{ if(before.tops[c.dataset.id]!=null){ watched.push(c); c.style.contentVisibility="visible"; } });
  const release=()=>watched.forEach(c=>{ c.style.contentVisibility=""; });
  const limit=window.innerHeight*CARD_FLIP_TRAVEL_VH, margin=window.innerHeight;
  const moved=[], dys=[];
  watched.forEach(c=>{
    const b=before.tops[c.dataset.id];
    const r=c.getBoundingClientRect();
    if(r.bottom<-margin || r.top>window.innerHeight+margin) return;
    // whole pixels only - fractional offsets put the text on a half-pixel and it blurs
    const dy=Math.round(b-r.top);
    if(!dy || Math.abs(dy)>limit) return;
    moved.push(c); dys.push(dy);
  });
  if(!moved.length || moved.length>CARD_MOVE_MAX){ release(); return; }
  moved.forEach((c,i)=>{ c.style.transition="none"; c.style.willChange="transform";
                         c.style.transform="translateY("+dys[i]+"px)"; });
  const clear=()=>{ moved.forEach(c=>{ c.style.transition=""; c.style.transform=""; c.style.willChange=""; }); release(); };
  // Commit the invert before attaching the transition - see the note in flipPills().
  void list.offsetHeight;
  moved.forEach(c=>{ c.style.transition="transform .22s "+E_EASE; c.style.transform=""; });
  setTimeout(clear,280);
}
function movePill(from,to){
  animateReorder(()=>{ catOrder.splice(to,0,catOrder.splice(from,1)[0]); });
}

// Listeners live on the document, not the pill: drawPills() destroys and rebuilds the
// pills mid-drag, so anything bound to the element itself would die on the first swap.
function wirePillDrag(){
  addEventListener("pointermove",e=>{
    if(!dragState) return;
    if(!dragState.moved){
      if(Math.abs(e.clientX-dragState.x)+Math.abs(e.clientY-dragState.y)<5) return;
      dragState.moved=true;
      document.documentElement.classList.add("pilldrag");
      const el=pills.querySelector('.pill[data-k="'+dragState.key+'"]');
      if(el) el.classList.add("dragging");
    }
    // one swap at a time: without this the pill lands under the cursor again and the
    // two of them trade places over and over while the pointer sits still
    if(Date.now()-swapLock < 190) return;
    const under=document.elementFromPoint(e.clientX,e.clientY);
    const t=under && under.closest ? under.closest(".pill") : null;
    if(!t || !t.dataset.k || t.dataset.k===dragState.key) return;
    // With an intent selected the pills are grouped green → blue → rest, so only allow a
    // swap inside the same band. Across bands the pill would snap back to its group on the
    // next draw and the drop would look like it failed. (Same rule as card drag.)
    if(intentIdxs.length){
      const hc=intentCats();
      if(pillBand(dragState.key,hc)!==pillBand(t.dataset.k,hc)) return;
    }
    const from=catOrder.indexOf(dragState.key), to=catOrder.indexOf(t.dataset.k);
    if(from<0||to<0) return;
    swapLock=Date.now();
    movePill(from,to);                       // reorders live, each swap animated
  },{passive:true});

  addEventListener("pointerup",()=>{
    if(!dragState) return;
    if(dragState.moved){
      nsSet("CatOrder",JSON.stringify(catOrder));
      suppressClick=true;                    // don't let the release toggle the filter
      document.documentElement.classList.remove("pilldrag");
      pills.querySelectorAll(".pill").forEach(p=>p.classList.remove("dragging"));
    }
    dragState=null;
  });
  addEventListener("pointercancel",()=>{
    if(dragState && dragState.moved){
      document.documentElement.classList.remove("pilldrag");
      pills.querySelectorAll(".pill").forEach(p=>p.classList.remove("dragging"));
    }
    dragState=null;
  });
}
/* THE RINGS WITHOUT THE REORDER. Measured in Firefox: toggling these classes across every
   card costs 2ms, while re-ordering the same cards costs 34ms of forced layout - so the
   answer to "did my click land" is separable from the work of moving the list, and only the
   first has to happen in the click's own frame. Uses the renderer's own two predicates; only
   the class names are stated twice, and they pair with the .card markup in render(). */
/* The clicked row answers for itself, in its own frame. The rail is redrawn and re-ordered
   by the scheduled half, and these elements are replaced when it is - this only spares the
   row you just pressed from sitting unlit while that runs. Sticky stays inert here: the
   stacked `top` arrives with the redraw. */
function paintRailSelection(){
  const box=$("#intentRailList");
  if(!box) return;
  const sel=new Set(intentIdxs.map(String));
  box.querySelectorAll(".rail-item[data-si]").forEach(el=>{
    el.classList.toggle("on", sel.has(el.dataset.si));
  });
}
/* A RING ARRIVES WITH THE CLICK AND LEAVES WITH THE CARD. Additions only: the cards that
   answer the new intent are usually below the fold, so clearing the outgoing rings here
   empties the visible list of green for the length of the tail - a blackout, when what
   actually happened is a handover. The stale rings clear in render(), which rebuilds the
   markup anyway, in the same frame the cards re-sort out of view.
   Write only where it CHANGES: a dozen cards gain a ring on a pick and two hundred do not,
   and an unconditional toggle dirties every one of them - restyle and repaint stolen from
   the animation starting in the same breath. */
function paintIntentRings(){
  if(!list) return;
  list.querySelectorAll(".card[data-id]").forEach(el=>{
    const m=findCard(el.getAttribute("data-id"));
    if(!m) return;
    const green=el.classList.contains("intent-hit");
    if(cardHitsSelectedIntent(m)){
      if(!green) el.classList.add("intent-hit");
      el.classList.remove("cat-hit");        // green wins, and CSS order would say otherwise
    } else if(!green && !el.classList.contains("cat-hit") && cardHitsAlwaysCat(m)){
      el.classList.add("cat-hit");
    }
  });
}
/* A PICK IS THREE ACTS, AND THEY DO NOT SHARE A THREAD. The rings answer in the click's own
   frame; the panel and the bar redraw and glide in the next; the card list - the expensive
   one - waits for that glide to finish. Measured in Firefox: the rail animation alone runs
   twelve clean frames from 204px to 6px, and the same animation with the list rebuild beside
   it manages three, because a 100ms rebuild plus the paint of 253 cards eats the frames the
   transition needed. Chrome is fast enough that the overlap never showed.
   Cancelled by the next pick, so a Ctrl run renders once at the end. rAF with a timeout
   behind it: rAF does not run in a hidden tab, and a pick made just before a tab switch must
   still land - there the belt runs both acts back to back, which is the right answer when
   nothing is being watched. */
let ePickTailRAF=0, ePickTailT=0, ePickTailT2=0;
function schedulePickTail(paint, settle){
  cancelPickTail();
  let done=false;
  const run=()=>{
    if(done) return;
    done=true;
    if(ePickTailRAF) cancelAnimationFrame(ePickTailRAF);
    if(ePickTailT) clearTimeout(ePickTailT);
    ePickTailRAF=0; ePickTailT=0;
    const glideMs=paint()||0;
    ePickTailT2=setTimeout(()=>{ ePickTailT2=0; settle(); }, glideMs?glideMs+20:0);
  };
  ePickTailRAF=requestAnimationFrame(run);
  ePickTailT=setTimeout(run,32);
}
function cancelPickTail(){
  if(ePickTailRAF) cancelAnimationFrame(ePickTailRAF);
  if(ePickTailT) clearTimeout(ePickTailT);
  if(ePickTailT2) clearTimeout(ePickTailT2);
  ePickTailRAF=0; ePickTailT=0; ePickTailT2=0;
}

export {
  wirePumpKick, flipPills, animateReorder, captureCards, flipCards, wirePillDrag,
  paintRailSelection, paintIntentRings,
  schedulePickTail,
};