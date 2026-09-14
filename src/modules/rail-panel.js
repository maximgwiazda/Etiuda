import { COL_GAP, colBoxWidth, colFloor, colMode, remPx } from "./columns.js";
import { scheduleCutScan } from "./cut-text.js";
import { syncFactsGeometry } from "./facts.js";
import { lsGet, lsSet } from "./storage.js";
import { t } from "./ui-lang.js";
import { pageScrollY, pageScroller } from "./page-scroll.js";

// The intent panel itself: whether the window is wide enough to dock it, where it then
// sits, and the two doors an undocked one opens by. The rows it shows are rail-list.js's.
// ---- intent side rail. pbRail "0" = prefer off; wanted docks if wide enough OR
// locked open, else auto-hide with left-edge hover / Ctrl reveal. Dock threshold: 2.5
// panel widths, derived from --rail-max so a width change moves it - the old hardcoded
// 1400px matched .shell's max and undocked on every 1366/1440 laptop.
/* The user's width, applied before the dock threshold is computed - the threshold IS
   2.5x the panel width, so it must see the width the user chose. Clamped at both ends
   because the threshold is derived: an unbounded panel would push the auto-hide point
   past any real window and never dock at all. */
const RAIL_W_MIN=200, RAIL_W_MAX=520;
function railStoredWidth(){
  const v=parseFloat(lsGet("pbRailW")||"");
  return (v>=RAIL_W_MIN && v<=RAIL_W_MAX) ? v : 0;
}
function applyRailWidth(px){
  document.documentElement.style.setProperty("--rail-max", Math.round(px)+"px");
}
function applyStoredRailWidth(){ const w=railStoredWidth(); if(w) applyRailWidth(w); }
function railMaxWidth(){
  const v=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--rail-max"));
  return v>0 ? v : 268;
}
/* THE THRESHOLD IS THE COLUMN THE PANEL WOULD COST. Docked, the panel and its gap come out of
   the card box, so there is a band of window widths where the panel is the only reason a second
   column will not fit. The threshold is the bottom of that band: dock while the columns still
   fit beside the panel, hide the moment they would not. Derived rather than a ratio, because
   every term is something the user can move - the panel is draggable, the column floor is a
   slider, and the rem follows zoom. Single-column mode asks for one column, not two. */
const RAIL_DOCK_COLS=2;
/* THE COUNT MUST NEVER RISE AS THE WINDOW NARROWS. Docking costs the panel's footprint, so there
   is a band where keeping it shows one column while hiding it would show two; dock above that
   band and the sequence only falls. Half that footprint was tried as slack and rejected the same
   day: it puts the panel back inside the band, and shrinking then took the list from one column
   up to two. The room left once the panel hides IS its footprint, so that room and the rise are
   one fact from two sides, and there is nothing here to tune. */
function railDockMin(){
  const cs=getComputedStyle(document.documentElement);
  const px=(name,fallback)=>{ const v=parseFloat(cs.getPropertyValue(name)); return v>0?v:fallback; };
  const n=(colMode()==="1") ? 1 : RAIL_DOCK_COLS;
  const floor=colFloor();
  const rem=remPx();
  const need=n*floor*rem + (n-1)*COL_GAP;              // the card box those columns want
  const cost=railMaxWidth() + px("--rail-gap",18);      // what docking takes out of it
  /* THE REST IS ASKED, NOT ADDED UP. Between the window edge and the card box sit the page
     padding and a stable scrollbar gutter, and the gutter is a number no sum can know - it is
     the platform's, and `scrollbar-gutter:stable` means it is reserved whether or not anything
     scrolls. Summing the terms we can name came out 10px short here, which put the panel back
     in the band it was meant to leave. Constant by that same rule, so measuring it once per
     rebuild is enough. */
  const box=colBoxWidth();
  const chrome = box ? (window.innerWidth - box + (railDocked() ? 0 : cost))
                     : (cost + 2*px("--app-pad",14));
  return Math.round(need + chrome);
}
/* BUILT AT BOOT, not here: the terms above are declared further down the file, and nothing
   reads the panel's dock state before rebuildRailMQ() runs. Null until then, which reads as
   "does not fit" - the same answer the invisible pre-ready panel is already giving. */
let RAIL_DOCK_MIN=0;
let RAIL_MQ=null;
function railWanted(){ return lsGet("pbRail")!=="0"; }
// Auto-hide is the default (pbRailLock "1" opts into locking open). Settings and the panel's
// pin lock it open; the threshold is railDockMin() above.
function railLocked(){ return lsGet("pbRailLock")==="1"; }
function railFits(){ return !!RAIL_MQ && RAIL_MQ.matches; }
function railDocked(){ return railWanted() && (railFits() || railLocked()); }
/* Peek-on-hover covers BOTH ways of not being docked: switched off in Settings used to
   kill the edge, leaving only Ctrl. Off-but-reachable is a state worth having - "not
   eating my width" is not "never show me this" - so anything not docked peeks, unless
   the lock says otherwise. */
function railAutoHide(){ return !railLocked() && (!railWanted() || !railFits()); }
/* Hidden AND locked means the panel never appears BY ITSELF: no column, no hover. Ctrl still
   shows it, deliberately - see applyRailPeek. That is what the lock's sentence actually says:
   THE PANEL STAYS AS IT IS, meaning it does not change on its own. Asking for it is not it
   changing. */
function railSuppressed(){ return !railWanted() && railLocked(); }
// True when the panel is visible in any form (docked column or overlay peek).
function railActive(){ return railDocked() || document.body.classList.contains("rail-peek"); }
// Bottom edge the fixed rail must clear: sticky header, plus expanded category
// pills (they overlay outside the header box on Ctrl/hover, so header height alone
// is not enough and the panel would cover the lower pill rows).
/* Which overlapping surface is in front follows the pointer; over BOTH or NEITHER,
   leave it exactly as it is - the shared strip is where flipping would change the answer
   under a still cursor, and leaving it alone is free hysteresis. GEOMETRY, not :hover:
   the covered surface receives no hover events, so the DOM can only ever name the one
   already in front. */
/* Rows, by distinct top edges, counted from the CHILDREN - a pill-size change cannot
   quietly turn four rows into five while the eye still sees four. Rounded to the pixel:
   flex-wrap aligns to a hair. The bar is clipped, not reflowed, when collapsed, so this
   reports the count the bar WOULD have open - which is the question. Called last, after
   the cheap rect test: it walks every pill. */
/* DOES THE BAR REACH THE INTENTS - asked of the GEOMETRY, not a row-count proxy that
   drifts with zoom. Not the head's lock/clear: chrome, and swapping the stack for it
   jumps the bar while nothing readable is hidden. Tested against the LIST CONTAINER, not
   the first row - the container's top IS where intents start and it is scroll-proof.
   Both axes, because the two always share rows. */
function railIntentsCovered(p){
  const box=document.getElementById("intentRailList");
  if(!box || box.offsetParent===null) return false;
  const b=box.getBoundingClientRect();
  if(!b.width || !b.height) return false;
  return b.top<p.bottom && b.bottom>p.top && b.left<p.right && b.right>p.left;
}
let overlapPt=null, overlapRAF=0;
function applyOverlapOrder(){
  const body=document.body;
  /* Either way the panel can be on screen: rail-on is DOCKED, rail-peek the Ctrl/edge
     overlay. Only the docked one was admitted here, so the arbitration returned on its
     first line in exactly the case it exists for - an unlocked panel, peeked open over an
     expanded bar. */
  if(!(body.classList.contains("rail-on") || body.classList.contains("rail-peek")) || !overlapPt) return;
  const rail=document.getElementById("intentRail");
  const pills=document.querySelector(".pills-slot .pills");
  if(!rail||!pills) return;
  const r=rail.getBoundingClientRect(), p=pills.getBoundingClientRect();
  /* They have to actually meet. A collapsed bar never reaches the panel, so this is also what
     stops a decision being taken when there is nothing to decide. Cheap, and checked first. */
  if(!(r.left<p.right && p.left<r.right && r.top<p.bottom && p.top<r.bottom)) return;
  /* AND it has to reach the intents themselves. Covering the panel's caption, hint or buttons is
     not a conflict worth shuffling the stack for - only a hidden intent is. */
  if(!railIntentsCovered(p)) return;
  const inR=overlapPt.x>=r.left&&overlapPt.x<=r.right&&overlapPt.y>=r.top&&overlapPt.y<=r.bottom;
  const inP=overlapPt.x>=p.left&&overlapPt.x<=p.right&&overlapPt.y>=p.top&&overlapPt.y<=p.bottom;
  if(inR&&!inP) body.classList.add("rail-over-pills");
  else if(inP&&!inR) body.classList.remove("rail-over-pills");
}
/* Coalesced to one frame: mousemove fires far faster than anything can be seen, and this reads two
   bounding boxes. */
function scheduleOverlapOrder(){
  if(overlapRAF) return;
  overlapRAF=requestAnimationFrame(()=>{ overlapRAF=0; applyOverlapOrder(); });
}
function wireOverlapPointer(){
  addEventListener("mousemove",e=>{
    overlapPt={x:e.clientX,y:e.clientY};
    scheduleOverlapOrder();
  },{passive:true});
}
/* AND WHENEVER THE BAR ITSELF MOVES: a peek is press-Ctrl, look, release - pointer
   perfectly still - and the one pass the keypress scheduled ran mid-transition, before
   the bar reached the intents, so "no conflict" stood for the whole peek. A
   ResizeObserver on the bar catches the transition's end and every other way the bar
   changes height, with nothing having to remember to call this. The last known pointer
   position is still the input; only the trigger is new. */
function watchPillBarHeight(){
  const bar=document.getElementById("pills");
  if(!bar || typeof ResizeObserver!=="function") return;
  new ResizeObserver(scheduleOverlapOrder).observe(bar);
}
function railClearanceTop(){
  let bottom=0;
  const header=document.querySelector("header");
  if(header) bottom=Math.max(bottom, header.getBoundingClientRect().bottom);
  /* The pill bar is deliberately NOT measured here: expanding it does not grow the
     header - the slot holds two lines and the pills overlay what is below, so the panel
     clears the header only and the expanded bar draws over it (docked sits one z below
     the pills; a peek stays above at 55). When they overlap, the cursor decides - see
     applyOverlapOrder. */
  return Math.ceil(bottom) + 8;
}
// Fixed rail geometry: clear header + any expanded pills (docked + peek).
// Docked also aligns left/width to .rail-slot so page scroll never shifts it.
function syncRailGeometry(){
  const root=document.documentElement;
  /* Until this has run once, --rail-top/left are unset and the CSS falls back to the
     window's own corner - the panel painted there and then jumped, exactly where the
     fade-in should be. rail-ready holds it invisible until a real position exists; the
     first appearance is in place, and it fades. */
  document.body.classList.add("rail-ready");
  const top=railClearanceTop();
  const h=Math.max(160, Math.round(window.innerHeight - top - 8));
  root.style.setProperty("--rail-top", top + "px");
  root.style.setProperty("--rail-h", h + "px");

  const slot=$("#railSlot")||document.querySelector(".rail-slot");
  const dockedNow=railDocked();
  if(slot && dockedNow){
    /* Only the LEFT edge is measured. The width was measured too and raced the column's
       animation - sampled half-open, the panel pinned to whatever width it caught. Nothing
       to measure any more: the column is exactly var(--rail-max), known rather than
       sampled. The left edge is safe at any moment - the first column starts at the
       shell's content-box edge whatever its width. */
    const slotRect=slot.getBoundingClientRect();
    root.style.setProperty("--rail-left", Math.round(slotRect.left) + "px");
  }
  /* --rail-x is "wherever the panel is right now" - the only left the BASE rule reads.
     Docked and peek sit at different x, and without this a dismissed peek snapped
     sideways the instant a state class dropped. Written only while the panel is VISIBLE:
     a panel already fading keeps the x it was using. */
  if(document.body.classList.contains("rail-on")||document.body.classList.contains("rail-peek")){
    root.style.setProperty("--rail-x", dockedNow
      ? (getComputedStyle(root).getPropertyValue("--rail-left").trim()||"10px")
      : "10px");
  }
  /* Deliberately no else clearing these: removing them mid-fade yanked the ground from a
     departing panel (the base rule reads them). Leaving the last values costs nothing -
     the peek overlay sets its own left and width. */
}
function scheduleRailGeometry(){
  // Two frames: wait for pills expand / header layout to settle first
  requestAnimationFrame(()=>requestAnimationFrame(syncRailGeometry));
  /* And a timeout that does not depend on rAF: rAF is paused in a background tab, and
     the panel is held invisible until this has run once - a background boot would have no
     intent panel until focus. Running twice is harmless; only derived values are written. */
  setTimeout(syncRailGeometry,60);
}
/* Holds a departing panel still for the frame that undocking spends relaying the list, then
   lets it fade - see body.rail-parting. The timeout is the same insurance scheduleRailGeometry
   carries: rAF does not run in a hidden tab, and a panel pinned for ever would be worse than
   an unanimated one. Idempotent, so both paths may fire. */
let railPartT=0;
function railPartHold(){
  document.body.classList.add("rail-parting");
  const go=()=>{ if(railPartT){ clearTimeout(railPartT); railPartT=0; }
                 document.body.classList.remove("rail-parting"); };
  /* Released on the first CHEAP frame rather than after a fixed count: the frame that relays
     the list is the long one and nobody knows in advance which it will be - two frames landed
     inside it and the fade still opened at 14%. A short gap from the frame before means the
     thread is free again. Five frames is the ceiling, so a busy tab still lets go. */
  let n=0, last=0;
  const wait=()=>{
    const now=performance.now();
    if(last && now-last<34){ go(); return; }
    last=now;
    if(++n>5){ go(); return; }
    requestAnimationFrame(wait);
  };
  requestAnimationFrame(wait);
  railPartT=setTimeout(go,140);
}
function syncRailLayout(){
  const wasVisible=document.body.classList.contains("rail-on")||document.body.classList.contains("rail-peek");
  const docked=railDocked();
  const autoHide=railAutoHide();
  document.body.classList.toggle("rail-on", docked);
  document.body.classList.toggle("rail-auto-hide", autoHide);
  if(docked){
    railEdgeHover=false;
    railTouchOpen=false;
  } else if(!autoHide){
    // Not auto-hide (settings-off, or locked handled above): edge hover does not apply
    railEdgeHover=false;
    railTouchOpen=false;
  }
  applyRailPeek();
  if(wasVisible && !(document.body.classList.contains("rail-on")
                     ||document.body.classList.contains("rail-peek"))) railPartHold();
  /* Coming back from hidden is the same problem as boot: rail-on lands immediately, the
     docked column exists a frame later, so the panel appeared at its fallback and jumped,
     drowning the fade. Dropping rail-ready holds it invisible for those two frames;
     scheduleRailGeometry() puts it back once there is a real position. */
  if(!wasVisible && (document.body.classList.contains("rail-on")||document.body.classList.contains("rail-peek"))){
    document.body.classList.remove("rail-ready");
  }
  const hit=$("#railHit");
  if(hit){
    hit.hidden=!autoHide;
    /* When neither applies the zone is hidden anyway, but the title still has to be true for the
       moment between states - and "Hold Ctrl" is a lie once the panel is locked away. */
    hit.title=t(autoHide
      ? "Hover here or hold Ctrl to show the intent panel"
      : "Hold Ctrl to show intents");
  }
  scheduleRailGeometry();
  syncRailPinBtn();
  syncSettingsMenu();
  schedulePillsCollapse();
  return docked;
}
/* Call after anything the threshold is derived from: the panel's width, the column floor, the
   column mode. Re-reading is cheap; churning a matchMedia is not, so nothing calls this per
   pointer-move - see the drag handle, which rebuilds on release. */
function rebuildRailMQ(){
  if(RAIL_MQ){ try{ RAIL_MQ.removeEventListener("change",onRailMQChange); }catch(e){} }
  RAIL_DOCK_MIN=railDockMin();
  RAIL_MQ=matchMedia("(min-width:"+RAIL_DOCK_MIN+"px)");
  RAIL_MQ.addEventListener("change",onRailMQChange);
}

/* The handle itself. Appended rather than written into the markup so the panel's HTML stays what
   it was; nothing else needs to know this exists. */
function syncRailResizeUI(){
  const rail=$("#intentRail");
  if(rail) rail.classList.toggle("rail-fixed", railLocked());
}
function buildRailResizer(){
  const rail=$("#intentRail");
  if(!rail) return;
  const h=document.createElement("div");
  h.className="rail-resize"; h.id="railResize"; h.setAttribute("aria-hidden","true");
  rail.appendChild(h);
  let startX=0, startW=0, dragging=false;
  h.addEventListener("pointerdown",e=>{
    if(railLocked()) return;
    dragging=true; startX=e.clientX; startW=railMaxWidth();
    try{ h.setPointerCapture(e.pointerId); }catch(_){}
    document.documentElement.classList.add("raildrag");
    e.preventDefault();
  });
  h.addEventListener("pointermove",e=>{
    if(!dragging) return;
    applyRailWidth(Math.min(RAIL_W_MAX, Math.max(RAIL_W_MIN, startW + (e.clientX-startX))));
  });
  /* The threshold is rebuilt on RELEASE, not on every move: matchMedia is cheap to read and not
     cheap to churn, and a half-dragged width is not a state anything should react to. */
  function end(e){
    if(!dragging) return;
    dragging=false;
    try{ h.releasePointerCapture(e.pointerId); }catch(_){}
    document.documentElement.classList.remove("raildrag");
    lsSet("pbRailW", String(Math.round(railMaxWidth())));
    rebuildRailMQ();
    syncRailLayout();
    scheduleRailGeometry();
  }
  h.addEventListener("pointerup",end);
  h.addEventListener("pointercancel",end);
  /* Double-click returns to the stylesheet's own width, which is the only way back to a default
     once it has been dragged - there is no reset control and this panel has no room for one. */
  h.addEventListener("dblclick",()=>{
    if(railLocked()) return;
    document.documentElement.style.removeProperty("--rail-max");
    lsSet("pbRailW","");
    rebuildRailMQ(); syncRailLayout();
    toast("Intent panel width reset");
  });
  syncRailResizeUI();
}
// Horizontal page shift (zoom, scrollbar appear) - keep left edge aligned
/* Elevated only while something is under it - see the header rule. Threshold 2px, so a
   resting page with sub-pixel scroll does not sit lit. Read from three places because
   which one moves depends on the layout; the greatest wins, so this survives a change. */
function syncHeaderElevation(){
  const y=Math.max(window.scrollY||0, pageScrollY());
  document.body.classList.toggle("e-scrolled", y>2);
}
/* BOUND TO THE SCROLLER, not the window: a scroll event fired at an element never reaches
   the window, so both of these go deaf the moment the page stops being the scroller. */
function wirePageScroll(){
  const el=pageScroller();
  const on=f=>{ if(el) el.addEventListener("scroll", f, {passive:true}); };
  on(syncHeaderElevation);
  on(()=>{ if(railDocked()) syncRailGeometry(); });
  on(scheduleCutScan);          // cards arriving from below have never been measured
  syncHeaderElevation();
}
/* Observed, not enumerated: the pill bar changes height without a resize (filtering
   and renames reflow the rows), and every explicit caller was a place someone
   remembered - the forgotten ones left --rail-top stale. The observer catches every
   cause, including ones added later. */
function wireRailObservers(){
  if(typeof ResizeObserver!=="function") return;
  // The header moving changes where the panel starts, so its headroom is recomputed with the rail's.
  const railRO=new ResizeObserver(()=>{ scheduleRailGeometry(); syncFactsGeometry(); });
  ["header","#pillsSlot","#pills"].forEach(sel=>{
    const el=document.querySelector(sel);
    if(el) railRO.observe(el);
  });
  /* WHAT IS CUT IS A QUESTION ABOUT WIDTH, and the panel's own width answers to a drag handle
     as well as to the window. Observed rather than hung off the drag, which is one of several
     ways it changes; the scan is rAF-coalesced, so a drag costs one pass per frame. */
  const listEl=document.getElementById("intentRailList");
  if(listEl) new ResizeObserver(()=>scheduleCutScan()).observe(listEl);
}
// Ctrl/Cmd+wheel on a scrollable would zoom the page; scroll that element instead.
function bindCtrlWheelScroll(el, opts){
  if(!el) return;
  const isActive=opts&&opts.isActive;
  const scrollEl=opts&&opts.scrollEl;
  const force=opts&&opts.force;
  el.addEventListener("wheel",e=>{
    if(!(e.ctrlKey||e.metaKey) && !(typeof force==="function" && force(e))) return;
    if(typeof isActive==="function" && !isActive()) return;
    const target=(typeof scrollEl==="function" ? scrollEl() : scrollEl) || el;
    if(!target) return;
    e.preventDefault();
    let dy=e.deltaY;
    if(e.deltaMode===1) dy*=16;          // lines → px
    else if(e.deltaMode===2) dy*=target.clientHeight||1; // pages
    target.scrollTop+=dy;
  },{passive:false});
}
// Intent side panel
function wireRailWheel(){
  bindCtrlWheelScroll($("#intentRail"),{
    isActive:()=>railActive(),
    scrollEl:()=>$("#intentRailList")||$("#intentRail"),
    /* A pinned row sits above the scroller, so a wheel over it reaches nothing that scrolls;
       forwarded, the list moves under the hand as it did when the row was inside it. */
    force:e=>!!(e.target&&e.target.closest&&e.target.closest(".rail-item.on"))
  });
}
// Left-edge hover (only while auto-hidden for space).
// Hit strip and panel are siblings, so keep peek while either is hovered
// (with a short leave delay so the pointer can move hit → panel).
function bindRailHit(){
  const hit=$("#railHit");
  const rail=$("#intentRail");
  if(!hit) return;
  let leaveT=0;
  function overRailZone(node){
    if(!node||node.nodeType!==1) return false;
    return hit===node||hit.contains(node)||(rail&&(rail===node||rail.contains(node)));
  }
  /* TOUCH GETS ITS OWN DOOR. Hover is a fiction on a touch screen: a tap synthesizes
     enter and leave in one burst and :hover sticks to the last tap - the overlay flapped
     and taps inside it died against hover bookkeeping. Touch pointers are excluded from
     the hover machinery and get a sticky state: tap the strip - open; tap outside -
     closed. Fine pointers keep the ambient hover unchanged. */
  function enterRailZone(e){
    if(e&&e.pointerType==="touch") return;
    if(!railAutoHide()) return;
    clearTimeout(leaveT);
    railEdgeHover=true;
    applyRailPeek();
  }
  function leaveRailZone(e){
    if(e&&e.pointerType==="touch") return;
    if(overRailZone(e.relatedTarget)) return;
    clearTimeout(leaveT);
    leaveT=setTimeout(()=>{
      // Still over hit or open panel? (covers relatedTarget=null gaps)
      if(hit.matches(":hover")||(rail&&rail.matches(":hover"))) return;
      railEdgeHover=false;
      applyRailPeek();
    }, 80);
  }
  hit.addEventListener("pointerenter",enterRailZone);
  hit.addEventListener("pointerleave",leaveRailZone);
  if(rail){
    rail.addEventListener("pointerenter",enterRailZone);
    rail.addEventListener("pointerleave",leaveRailZone);
  }
  // The sticky door. pointerup, so a scroll that merely starts on the strip does not toggle.
  hit.addEventListener("pointerup",e=>{
    if(e.pointerType!=="touch") return;
    if(!railAutoHide()) return;
    railTouchOpen=!railTouchOpen;
    applyRailPeek();
  });
  /* Outside-tap closes. Capture phase, so a handler inside the page stopping propagation
     cannot strand the panel open; the rail zone itself (strip included) never closes from
     here - the strip toggle above owns that. */
  addEventListener("pointerdown",e=>{
    if(e.pointerType!=="touch"||!railTouchOpen) return;
    if(overRailZone(e.target)) return;
    railTouchOpen=false;
    applyRailPeek();
  },true);
}

export {
  RAIL_DOCK_MIN, railDockMin, railMaxWidth, applyStoredRailWidth,
  railWanted, railLocked, railDocked, railSuppressed, railActive,
  applyOverlapOrder, wireOverlapPointer, watchPillBarHeight,
  syncRailGeometry, scheduleRailGeometry, syncRailLayout, rebuildRailMQ,
  syncRailResizeUI, buildRailResizer, syncHeaderElevation, wirePageScroll,
  wireRailObservers, wireRailWheel, bindRailHit,
};
