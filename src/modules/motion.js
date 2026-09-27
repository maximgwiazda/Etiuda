import { lsGet, ssMarkArrival } from "./storage.js";
import { modalCard } from "./dom.js";

/* THE ONE CURVE. Every move, fold and fade the script animates settles on it, and the sheet
   reads the same curve as --m-ease; a second curve anywhere would be a second opinion about how
   the interface moves. Durations vary by what is moving; the curve does not. */
const E_EASE="cubic-bezier(.2,.7,.3,1)";
/* THE SPRING is the exception to the curve: a settled search's cards and the tour's travel
   ride it, the sheet's as --m-spring. Damped (stiffness 520, damping 34), sampled at 60 Hz into
   linear() points: 98 per cent of the way at 148ms, 2 per cent over, still at 371ms. */
const E_SPRING="linear(0,0.0773,0.2255,0.3951,0.5568,0.6956,0.806,0.8883,0.9458,0.9832,1.0055,"
  +"1.0169,1.0212,1.0211,1.0186,1.0151,1.0115,1.0082,1.0054,1.0033,1.0018,1.0008,1.0001,1)";
/* THE TIERS, by what moves rather than how far. The sheet's :root carries the same numbers as
   --m-* for everything CSS runs, and tests/motion-tokens.js holds the two equal; gather and
   twinkle are the empty mark's, timed here alone because a canvas has no rule to read. */
const M_MS={tone:100, reveal:120, move:180, surface:180, scrim:160, resize:200, dismiss:80,
  travel:371, celebrate:420, wash:500, roll:300, nudge:2000, gather:1100, twinkle:66};
const E_SPRING_MS=M_MS.travel;

/* How many cards a FLIP may transform at once. Here beside the curve because two surfaces
   cap themselves by it and neither owns the other; the reasoning for the number itself is
   at flipCardsAround() in list-pointer.js. */
const CARD_MOVE_MAX=40;

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
const M_STILL_Q="(prefers-reduced-motion: reduce)";
function mgSystemStill(){
  try{ return matchMedia(M_STILL_Q).matches; }catch(e){ return false; }
}
/* USER FIRST, THEN THE SYSTEM: this gated nine animation sites and asked only the
   OS - no way to calm the app on a machine whose OS says nothing. The preference can
   only ADD quiet, never remove it: a system asking for reduced motion is honoured even
   with the box unticked - an accessibility request is not ours to overrule. */
function mgReduceMotion(){
  try{ if(lsGet("eMotionOff")==="1") return true; }catch(e){}
  return mgSystemStill();
}
/* THE ONE SWITCH: html.e-still zeroes every --m-* tier and halts every keyframe (the sheet, by
   the tiers), so what CSS runs and what a script asks mgReduceMotion() cannot disagree. The
   boot script sets it before the first paint from what it can read; this is the answer. */
function syncStill(){
  try{ document.documentElement.classList.toggle("e-still", mgReduceMotion()); }catch(e){}
}
function wireStill(){
  syncStill();
  try{
    const m=matchMedia(M_STILL_Q);
    if(m.addEventListener) m.addEventListener("change",syncStill);
    else if(m.addListener) m.addListener(syncStill);
  }catch(e){}
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
    card.style.transition="height var(--m-resize) var(--m-ease)";
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

/* THE DISMISS TIER: a surface that closes fades out on it, opacity only, while the state it showed
   is already gone. What fades is the removed node itself, or for a surface that stays in the page a
   copy of it placed after it, so a lookup by id still finds the original first; either way it is
   inert and nothing reaches it. A surface that opens ends every leave at once (cutLeaves), so two
   never cross-fade. Stilled, nothing leaves: a removed node goes at once and no copy is made. */
const dismissing=new Set();
function leaveNode(el){
  el.inert=true;
  el.setAttribute("aria-hidden","true");
  el.classList.add("e-gone");
  dismissing.add(el);
  const done=()=>{ dismissing.delete(el); el.remove(); };
  el.addEventListener("animationend",e=>{ if(e.target===el) done(); });
  setTimeout(done,M_MS.dismiss+120);
}
/* A node on its way out of the page. Its ids go with the state it showed: what asks the document
   for it afterwards is asking whether it is still open. */
function dismissNode(el){
  if(!el) return;
  if(mgReduceMotion() || !el.isConnected){ el.remove(); return; }
  el.removeAttribute("id");
  el.querySelectorAll("[id]").forEach(x=>x.removeAttribute("id"));
  leaveNode(el);
}
/* A surface that stays, closing: the copy carries what was typed and how far it was scrolled,
   which cloneNode does not. `into` takes it out of an ancestor that is about to hide, and `style`
   then says what that ancestor gave it. Called before the surface hides. */
function dismissCopy(el, style, into){
  if(!el || el.hidden || !el.isConnected || mgReduceMotion()) return;
  const c=el.cloneNode(true);
  const fa=el.querySelectorAll("input,textarea,select"), fb=c.querySelectorAll("input,textarea,select");
  for(let i=0;i<fa.length;i++){ fb[i].value=fa[i].value; fb[i].checked=fa[i].checked; }
  if(style) c.style.cssText+=";"+style;
  if(into) into.appendChild(c); else el.after(c);
  const sa=[el].concat(Array.prototype.slice.call(el.querySelectorAll("*"))),
        sb=[c].concat(Array.prototype.slice.call(c.querySelectorAll("*")));
  for(let i=0;i<sa.length;i++) if(sa[i].scrollTop) sb[i].scrollTop=sa[i].scrollTop;
  leaveNode(c);
}
function cutLeaves(){
  dismissing.forEach(el=>el.remove());
  dismissing.clear();
}

/* A RELOAD SOMEBODY WATCHES IS COVERED: what sits under the band leaves on the dismiss tier, and
   the next document holds its first paint until boot is done and brings it back on the surface
   tier (the boot guard in template.html, which reads the mark). Stilled, it reloads at once.
   MEASURE IT ON A COMPOSED WINDOW: a PrintWindow burst of an off-screen window can read a buffer
   mid-draw and show a torn or band-less frame here, as in any fade under load, which a
   Windows.Graphics.Capture of the same window, composed as a screen composes it, does not show. */
function reloadCovered(){
  ssMarkArrival();
  if(mgReduceMotion() || typeof document==="undefined"){ location.reload(); return; }
  document.documentElement.classList.add("e-leaving");
  // A frame past the fade, so the frame the next document holds is the one with nothing under the band.
  setTimeout(()=>location.reload(), M_MS.dismiss+34);
}

export {
  reloadCovered,
  dismissNode,
  dismissCopy,
  cutLeaves,
  E_EASE,
  E_SPRING,
  E_SPRING_MS,
  M_MS,
  M_STILL_Q,
  CARD_MOVE_MAX,
  mgSystemStill,
  mgReduceMotion,
  syncStill,
  wireStill,
  mgPinCard,
  mgAccordion,
  animateModalHeightFrom,
  animatePinnedHeight,
  afterPaint
};
