import { lsGet } from "./storage.js";

/* The Manage dialog grows and shrinks as sections open, and jumping straight to the new size is
   the jarring part - the eye loses its place because nothing connects the two states.
   Animating the CARD, not the section, is deliberate: the two disclosure mechanisms differ (the
   sections are native <details>, the category tree is a hidden div), the browsers disagree about
   how a closed <details> lays out its children, and `height:auto` is not animatable without
   `interpolate-size`, which Firefox does not have. The card is one element whose before and
   after heights can simply be measured, which works the same everywhere.

   `overflow:hidden` for the duration stops a scrollbar flickering in and out while the height
   passes through the max-height threshold; scrollTop is preserved because setting an explicit
   height on a scrolled container would otherwise reset it. Cleanup runs from a plain setTimeout
   as well as transitionend - rAF is paused in a background tab, and a card left with an inline
   height would then never resize again. */
let mgPendingH=null, mgPinTimer=null;
/* USER FIRST, THEN THE SYSTEM: this gated nine animation sites and asked only the
   OS - no way to calm the app on a machine whose OS says nothing. The preference can
   only ADD quiet, never remove it: a system asking for reduced motion is honoured even
   with the box unticked - an accessibility request is not ours to overrule. */
function mgReduceMotion(){
  try{
    if(lsGet("pbMotionOff")==="1") return true;
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }catch(e){ return false; }
}
/* PIN BEFORE THE STATE CHANGES: `toggle` fires asynchronously, so between the element
   opening and the handler running the browser has laid out AND PAINTED the full new
   height - snapping back then reads as expand-snap-animate, a stutter at the start of
   every open. Pinned first, the expanded state is never painted at all. */
function mgPinCard(){
  const card=modalCard;
  if(card==null || mgReduceMotion()) return null;
  const h=card.getBoundingClientRect().height;
  mgPendingH=h;
  card.style.transition="none";
  card.style.overflow="hidden";
  card.style.height=h+"px";
  /* Failsafe only. A pointerdown that never becomes a toggle (dragged off the summary, or the
     dialog re-rendered underneath) would otherwise leave the card stuck at a fixed height.
     Generous, because expiring early just restores the old jumpy behaviour for that one click. */
  clearTimeout(mgPinTimer);
  mgPinTimer=setTimeout(mgReleaseCard,1000);
  return h;
}
/* THE LIVE HEIGHT RUN, so a new one can kill the last. Every run arms two hooks - a
   transitionend listener and a failsafe timeout - and uncancelled they outlive the run that
   made them: toggle a second section inside the window and the FIRST run's failsafe fires
   part-way into the SECOND animation, mgReleaseCard clears height and transition, and the
   card jumps the rest of the way in a single frame. */
let mgHeightRun=null;
function mgStopHeightRun(){
  const r=mgHeightRun;
  if(!r) return;
  mgHeightRun=null;
  r.dead=true;                       // a start() still queued behind rAF gives up quietly
  clearTimeout(r.timer);
  if(r.onEnd) r.card.removeEventListener("transitionend", r.onEnd);
}
function mgReleaseCard(){
  clearTimeout(mgPinTimer);
  mgStopHeightRun();
  const card=modalCard;
  if(!card) return;
  card.style.transition=""; card.style.height=""; card.style.overflow="";
  mgPendingH=null;
}
/** Accordion: opening one section shuts its siblings - with two or three open, the one
 *  just expanded arrived below the fold. One open section keeps the dialog readable and
 *  usually scroll-free. Closes SILENTLY (`_accordion` guard) so the siblings' own toggle
 *  handlers do not each animate the height; the opener measures the finished state and
 *  animates once. */
function mgAccordion(opened, selector, scope){
  if(!opened || !opened.open) return;
  (scope||document).querySelectorAll(selector).forEach(d=>{
    if(d===opened || !d.open) return;
    d._accordion=true;
    d.open=false;
    d._accordion=false;
  });
}
function animateModalHeightFrom(before){
  const card=modalCard;
  if(card==null || before==null || mgReduceMotion()){ mgPendingH=null; return; }
  clearTimeout(mgPinTimer);
  mgStopHeightRun();                            // whatever was in flight is not this run
  // The card itself no longer scrolls - its middle section does. See mountModalBody().
  const scroller=card.querySelector(".modal-body");
  const keepScroll=scroller?scroller.scrollTop:0;
  /* Measure the target while pinned: release to auto, read, put the start height straight back.
     All three happen in one task with no yield, so nothing is painted in between - max-height
     still applies during the read, so `after` is the clamped height the card will really take. */
  card.style.height="auto";
  const after=card.getBoundingClientRect().height;
  card.style.height=before+"px";
  if(Math.abs(after-before)<2){ mgReleaseCard(); return; }
  void card.offsetHeight;                       // commit the start height before transitioning
  const run={dead:false, timer:null, card:card, onEnd:null};
  mgHeightRun=run;
  const done=()=>{
    if(run.dead) return;
    mgReleaseCard();                            // which stops this run, listener and timer both
    if(scroller) scroller.scrollTop=keepScroll;
  };
  /* THE CARD'S OWN HEIGHT, nothing else. transitionend BUBBLES, and the twisty rotating on
     an accordion row inside this card otherwise ends the run early - unnoticed, because the
     easing is front-loaded, but it leaves the failsafe armed with nothing left to guard. */
  run.onEnd=e=>{ if(e.target===card && e.propertyName==="height") done(); };
  /* Start on the NEXT frame: a shut <details>' content has never been laid out, so the
     first expand pays for all of it exactly where the transition should begin - the
     first frame lands late and the motion hitches. A frame's wait moves that work before
     the height starts changing; the card is pinned throughout. rAF pauses in a background
     tab, so a timeout runs the same guarded start. */
  let started=false;
  const start=()=>{
    if(started||run.dead) return;
    started=true;
    card.style.transition="height .2s "+E_EASE;
    card.style.height=after+"px";
    card.addEventListener("transitionend",run.onEnd);
    run.timer=setTimeout(done,320);             // counts from the real start, not from the pin
  };
  requestAnimationFrame(start);
  setTimeout(start,32);
}

/* The pin and the toggle are one handshake: mgPinCard records the card's height before the
   disclosure flips and this consumes it, so the next toggle cannot animate from a height
   measured before the last one. */
function animatePinnedHeight(){
  animateModalHeightFrom(mgPendingH);
  mgPendingH=null;
}

/* A click handler runs AFTER the browser has dropped :active, so anything slow inside it
   holds the PRESSED pixels on screen until it returns - the state is already gone from the
   DOM and no frame can say so. Measured on Save at 375ms with the CPU throttled fourfold,
   which is what "the button sticks" actually is. Two frames: one to schedule, one that runs
   after the released look has been painted. */
function afterPaint(fn){
  if(typeof requestAnimationFrame!=="function"){ fn(); return; }
  requestAnimationFrame(()=>requestAnimationFrame(fn));
}

export {
  mgReduceMotion,
  mgPinCard,
  mgAccordion,
  animateModalHeightFrom,
  animatePinnedHeight,
  afterPaint
};
