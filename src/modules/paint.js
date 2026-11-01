import { findCard } from "./card-model.js";
import { mgReduceMotion, E_EASE, E_SPRING, E_SPRING_MS, M_MS, CARD_MOVE_MAX } from "./motion.js";
import { lySet } from "./storage.js";
import { drawPills } from "./tabs.js";
import { intentCats, pillBand } from "./cat-relevance.js";
import { cardHitsAlwaysCat, cardHitsSelectedIntent } from "./card-intent.js";
import { pageScrollY } from "./page-scroll.js";
import { pills, list, $ } from "./dom.js";
import { catOrder, intentIdxs, dragState, swapLock, setSwapLock, setSuppressClick, setDragState } from "./app-state.js";
import { hooks } from "./hooks.js";

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
   500ms because the longest thing here is 371ms and this only has to outlive it. */
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

/* A pill's key in a capture: its category, "" for All, null for the add button, which has none;
   undefined for anything else in the row. */
function pillKey(p){ return p.dataset.k!=null ? p.dataset.k : p.classList.contains("pill-add") ? null : undefined; }
/* Which line every child of the row sits on. A width tween may run only where the old widths wrap
   the row as the new ones do: every width rides one curve from one start, so a row that wraps alike
   at both ends wraps alike throughout, and an equal height does not say so. */
function pillLines(){ let s=""; for(const c of pills.children) s+=c.offsetTop+","; return s; }
/* HOLDS THE ROW ON ITS NEW LINES AT THE OLD WIDTHS, where those widths wrap it another way: the first
   pill of each line takes the left margin that keeps it off the line before, and the last the
   negative right margin that keeps it on its own. Every width and margin then rides one curve from
   one start to its end, so each line is a straight sum of them and wraps alike throughout. `tops`
   are the children's lines at the new widths. Returns the pills it pinned. */
function pinPillLines(kids,tops){
  const cs=getComputedStyle(pills), gap=parseFloat(cs.columnGap||cs.gap)||0;
  const room=pills.clientWidth-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.paddingRight)||0);
  const box=kids.map(c=>{ const s=getComputedStyle(c);
    return {w:c.getBoundingClientRect().width, l:parseFloat(s.marginLeft)||0, r:parseFloat(s.marginRight)||0}; });
  const pin=new Map();
  let lead=0;
  for(let i=0;i<kids.length;){
    let j=i, sum=lead+box[i].l+box[i].w+box[i].r;
    while(j+1<kids.length && tops[j+1]===tops[i]){ j++; sum+=gap+box[j].l+box[j].w+box[j].r; }
    const tail=Math.min(0,room-1-sum);
    if(tail) pin.set(j,[pin.has(j)?pin.get(j)[0]:0,tail]);
    lead=0;
    if(j+1<kids.length){
      const n=box[j+1];
      lead=Math.max(0,room+1-(sum+tail)-gap-n.l-n.w-n.r);
      if(lead) pin.set(j+1,[lead,0]);
    }
    i=j+1;
  }
  const pinned=[];
  pin.forEach(([l,r],i)=>{
    const p=kids[i];
    p.style.transition="none";
    if(l) p.style.marginLeft=(box[i].l+l)+"px";
    if(r) p.style.marginRight=(box[i].r+r)+"px";
    pinned.push(p);
  });
  return pinned;
}
/** The "invert and play" half. Call after the pills have been redrawn in their new order. */
/* READ EVERY POSITION FIRST, THEN WRITE EVERY TRANSFORM: a rect read after a style
   write forces a full layout PER PILL - interleaved, this was 25.6ms of a 180ms
   animation budget. Split, each pass is one layout. */
function flipPills(before){
  if(!before) return;
  const els=[], bs=[], moved=[], deltas=[], wEls=[], wStarts=[];
  pills.querySelectorAll(".pill").forEach(p=>{
    const k=pillKey(p), b=k!==undefined && before.get(k);
    if(b){ els.push(p); bs.push(b); }
  });
  const kids=Array.prototype.slice.call(pills.children), tops=kids.map(c=>c.offsetTop);
  const lines=pillLines();
  /* Width changes ride the same flip - a selection bolds the name, a recount changes the
     digits, and either snapping while neighbours slide reads as a glitch. 1.5px floor:
     fractional DPRs round every pill differently on every pass. */
  els.forEach((p,i)=>{
    const w=p.getBoundingClientRect().width;
    if(Math.abs(bs[i].width-w)>=1.5){ wEls.push(p); wStarts.push(bs[i].width); p.dataset._eW=w; }
  });
  /* The old widths go back BEFORE the positions are read: each one shifts every pill after it
     in the row, so an offset read at the new widths starts the glide that far from the pill. */
  wEls.forEach((p,i)=>{ p.style.transition="none"; p.style.width=wStarts[i]+"px"; });
  /* The wrap is the invariant - see pillLines. Where the old widths move a line break, the row is
     pinned to its new lines; where even that fails, the widths snap and the row still slides. */
  let pinned=[];
  if(wEls.length && pillLines()!==lines){
    pinned=pinPillLines(kids,tops);
    if(pillLines()!==lines){
      pinned.forEach(p=>{ p.style.marginLeft=""; p.style.marginRight=""; p.style.transition=""; });
      pinned=[];
      wEls.forEach(p=>{ p.style.width=""; p.style.transition=""; delete p.dataset._eW; });
      wEls.length=0;
    }
  }
  els.forEach((p,i)=>{
    const a=p.getBoundingClientRect();
    // whole pixels only - fractional offsets put the text on a half-pixel and it blurs
    const dx=Math.round(bs[i].left-a.left), dy=Math.round(bs[i].top-a.top);
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
  if(!moved.length && !wEls.length) return;
  /* Commit the inverted position before attaching the transition. A frame is not a commitment:
     these elements were often created by the re-render a moment ago, and if the browser never
     computes a style with the transform applied it has no start value to animate from. Chrome
     happened to commit it inside the rAF and animated; Firefox did not, and the row simply
     appeared in its new place. One forced reflow, then attach and release in the same task -
     which also removes the rAF that a background tab would otherwise pause indefinitely. */
  void pills.offsetHeight;
  const T="var(--m-move) "+E_EASE;
  new Set(moved.concat(wEls,pinned)).forEach(p=>{
    const t=[];
    if(moved.indexOf(p)>=0) t.push("transform "+T);
    if(wEls.indexOf(p)>=0) t.push("width "+T);
    if(pinned.indexOf(p)>=0) t.push("margin-left "+T,"margin-right "+T);
    p.style.transition=t.join(", ");
  });
  moved.forEach(p=>{ p.style.transform=""; });
  wEls.forEach(p=>{ p.style.width=p.dataset._eW+"px"; });
  pinned.forEach(p=>{ p.style.marginLeft=""; p.style.marginRight=""; });
  setTimeout(()=>{
    moved.forEach(p=>{ p.style.transition=""; p.style.transform=""; p.style.willChange=""; });
    wEls.forEach(p=>{ p.style.transition=""; p.style.width=""; delete p.dataset._eW; });
    pinned.forEach(p=>{ p.style.transition=""; p.style.marginLeft=""; p.style.marginRight=""; });
  },200);
}
function animateReorder(mutate){
  const before=hooks.capturePills();
  mutate();
  drawPills();
  flipPills(before);
}
/* A PICK AND A CLEAR RE-SORT THE CARDS UNDER THE SETTLE'S PLAN (glideSettle below): a card on
   screen before and after glides both ways, across a column too, and one new to the screen rises
   in where it lands. SCROLL-TOP only: pickIntent sets pendingScrollHit, and render() then
   smooth-scrolls to the first linked entry, which can be a 12000px journey. Animating card
   positions under a viewport travelling that far reads as chaos. Near the top that scroll is a
   no-op, which is exactly when the animation is worth having, so the two never run at once. */
const CARD_FLIP_SCROLL_TOP=80;     // only when the auto-scroll will not move the view
function captureCards(){
  if(!list || mgReduceMotion() || pageScrollY()>CARD_FLIP_SCROLL_TOP) return null;
  return captureSettle();
}
function flipCards(before){
  glideSettle(before,"move");
}
/* THE SETTLE'S GLIDE: when a search settles, the cards on screen travel to their new places on
   the spring, and a card new to the screen rises in. A filter as well as a reorder, so matching
   is by id and membership may differ. Near the top only, for
   flipCardsAround()'s reason: deep in the list the new places ride on estimated cards. */
let eSettleRuns=[];
function captureSettle(){
  if(!list || mgReduceMotion()) return null;
  // A glide still running is ended first: its painted place is a moving value.
  eSettleRuns.forEach(a=>{ try{ a.finish(); }catch(_){} });
  eSettleRuns=[];
  const vh=window.innerHeight;
  if(list.getBoundingClientRect().top<=-vh*0.5) return null;
  const at={};
  list.querySelectorAll(".card[data-id]").forEach(el=>{
    const r=el.getBoundingClientRect();
    if(r.width && r.bottom>-200 && r.top<vh+200) at[el.dataset.id]=r;
  });
  return at;
}
const E_SPRING_OK=typeof CSS!=="undefined" && CSS.supports && CSS.supports("transition-timing-function","linear(0,1)");
/* `tier` "move" is a press's re-sort, on the 180ms curve; a settled search travels on the spring. */
function glideSettle(before,tier){
  if(!before || !list) return;
  const vh=window.innerHeight;
  if(list.getBoundingClientRect().top<=-vh*0.5) return;
  const plan=[];
  // READ every place, then WRITE every animation.
  for(const el of list.querySelectorAll(".card[data-id]")){
    if(plan.length>=CARD_MOVE_MAX) break;
    const r=el.getBoundingClientRect();
    if(!r.width || r.bottom<-100 || r.top>vh+100) continue;
    const o=before[el.dataset.id];
    // whole pixels only - a fractional offset puts the text on a half-pixel and it blurs
    const dx=o?Math.round(o.left-r.left):0, dy=o?Math.round(o.top-r.top):0;
    // Past half a screen only a card that began on screen travels; one from beyond the edge
    // rises in where it lands, like a card new to the screen.
    if(!o || (Math.abs(dy)>vh*0.5 && !(o.bottom>0 && o.top<vh))){ plan.push([el]); continue; }
    // A card whose text grew opens to its new height as the cards below it make room.
    const grew=o.bottom>0 && o.top<vh ? Math.round(r.height-o.height) : 0;
    if((dx||dy||grew>1) && Math.abs(dy)<=vh*1.2) plan.push([el,dx,dy,grew>1?grew:0]);
  }
  if(!plan.length) return;
  const glide=tier==="move" ? {duration:M_MS.move,easing:E_EASE}
    : {duration:E_SPRING_MS,easing:E_SPRING_OK?E_SPRING:E_EASE};
  plan.forEach(([el,dx,dy,grew])=>{
    if(dx==null){
      eSettleRuns.push(el.animate([{opacity:0,transform:"translateY(8px) scale(.985)"},{opacity:1,transform:"none"}],
        {duration:M_MS.surface,easing:E_EASE}));
      return;
    }
    if(dx||dy) eSettleRuns.push(el.animate([{transform:"translate("+dx+"px,"+dy+"px)"},{transform:"none"}],glide));
    /* The clip stands clear of the panels' rings and shadows on three sides; the fourth runs from
       the old height to the card's own edge, the growth alone, on the curve the cards below travel
       on, so the two edges keep their gap. Past the edge it would run ahead of the card below. */
    if(grew) eSettleRuns.push(el.animate([{clipPath:"inset(-24px -24px "+grew+"px -24px)"},{clipPath:"inset(-24px -24px 0px -24px)"}],glide));
  });
  eKickPump();   // no animationstart for a scripted animation, so the pump is asked by hand
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
    setSwapLock(Date.now());
    movePill(from,to);                       // reorders live, each swap animated
  },{passive:true});

  addEventListener("pointerup",()=>{
    if(!dragState) return;
    if(dragState.moved){
      lySet("CatOrder",JSON.stringify(catOrder));
      setSuppressClick(true);                    // don't let the release toggle the filter
      document.documentElement.classList.remove("pilldrag");
      pills.querySelectorAll(".pill").forEach(p=>p.classList.remove("dragging"));
    }
    setDragState(null);
  });
  addEventListener("pointercancel",()=>{
    if(dragState && dragState.moved){
      document.documentElement.classList.remove("pilldrag");
      pills.querySelectorAll(".pill").forEach(p=>p.classList.remove("dragging"));
    }
    setDragState(null);
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
    el.setAttribute("aria-pressed", sel.has(el.dataset.si)?"true":"false");
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
  wirePumpKick, eKickPump, E_SPRING_OK, pillKey, pillLines, flipPills, animateReorder, captureCards, flipCards, captureSettle, glideSettle,
  wirePillDrag,
  paintRailSelection, paintIntentRings,
  schedulePickTail,
};