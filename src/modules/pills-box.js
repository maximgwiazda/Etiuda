import { lsGet, lsSet, lsDel } from "./storage.js";
import { mgReduceMotion, E_EASE, M_MS } from "./motion.js";
import { toast } from "./ui-lang.js";
import { $, pills } from "./dom.js";
import { hooks } from "./hooks.js";

function pillsWanted(){ return lsGet("ePills")!=="0"; }
function pillsLocked(){ return lsGet("ePillsLock")==="1"; }
function syncLayoutPrefs(){
  document.documentElement.classList.remove("e-pills-off");   // the head script's early call
  document.body.classList.toggle("pills-off", !pillsWanted());
  /* NO WARNING RING for a hidden panel or bar: --warn flags something WRONG, and a chosen
     preference is not. --warn/--warn-bg are read by nothing - kept, like the retired --e-c5:
     a warning colour will be wanted again, and it must mean a real fault (a catalog that
     failed to parse), never a preference set on purpose. */
  hooks.syncSettingsMenu();
}
let pillsBoxTimer=null, pillsGhost=null;
/* LAYOUT SNAPS IN THIS TURN. Height is not a transition: gliding it lays the page out on
   every frame, and the lanes' top is that height. A fixed clone at the old rect carries
   the retreat on transform and opacity. The rail is written once, after the snap.
   `mutate` must land final geometry synchronously. The transition is not in the sheet. */
function slotBox(slot){
  const cs=getComputedStyle(slot);
  // A hidden slot is not a short slot: it reserves nothing, margin included.
  if(cs.display==="none") return {h:0,m:0,left:0,top:0,width:0};
  const r=slot.getBoundingClientRect();
  return {h:r.height, m:parseFloat(cs.marginTop)||0, left:r.left, top:r.top, width:r.width};
}
function clearPillsMotion(){
  clearTimeout(pillsBoxTimer); pillsBoxTimer=null;
  if(pillsGhost){ pillsGhost.remove(); pillsGhost=null; }
  const slot=pillsSlot();
  if(slot){
    slot.style.transition="none";
    slot.style.transform=""; slot.style.opacity=""; slot.style.clipPath="";
    // An inline height would pin the next show at the snapped value.
    if(slot.style.height) slot.style.height="";
    if(slot.style.marginTop) slot.style.marginTop="";
    slot.style.transition="";
  }
  document.body.classList.remove("e-pills-retreat");
}
function endPillsMotion(){ clearPillsMotion(); }
function armPillsRetreat(ms){
  document.body.classList.add("e-pills-retreat");
  clearTimeout(pillsBoxTimer);
  pillsBoxTimer=setTimeout(endPillsMotion, ms+20);
  if(pillsBoxTimer && pillsBoxTimer.unref) pillsBoxTimer.unref();
}
/* `shot` was cloned before mutate, so it still wears the bar the eye is leaving.
   Ids go, or the live slot stops being the one a query finds. Inline display, or a
   pills-off rule hides the clone along with the slot. */
function mountPillsGhost(shot, from){
  const g=shot;
  g.removeAttribute("id");
  g.querySelectorAll("[id]").forEach(n=>n.removeAttribute("id"));
  g.setAttribute("aria-hidden","true"); g.inert=true;
  g.style.display="block"; g.style.maxHeight="none"; g.style.overflow="hidden";
  g.style.position="fixed";
  g.style.left=from.left+"px"; g.style.top=from.top+"px";
  g.style.width=from.width+"px"; g.style.height=from.h+"px";
  g.style.margin="0"; g.style.zIndex="48"; g.style.pointerEvents="none";
  g.style.transform="none"; g.style.opacity="1"; g.style.transition="none";
  g.style.willChange="transform, opacity";
  document.body.appendChild(g);
  pillsGhost=g;
  return g;
}
function animatePillsBox(mutate,ms){
  ms=ms||M_MS.move;
  const slot=pillsSlot();
  if(!slot || mgReduceMotion()){
    // No ride, but the header still changed height and the fixed panel is pinned to it.
    clearPillsMotion();
    mutate();
    hooks.syncRailGeometry();
    return;
  }
  clearPillsMotion();
  const from=slotBox(slot);
  const leaving=from.h>=1;
  const shot=leaving ? slot.cloneNode(true) : null;
  slot.style.transition="none";
  mutate();
  const hidden=getComputedStyle(slot).display==="none";
  // One height write, the snap. A pinned zero has to leave before a shown bar can be measured.
  let to;
  if(hidden){ to={h:0,m:0,left:from.left,top:from.top,width:from.width}; slot.style.height="0px"; }
  else {
    if(slot.style.height) slot.style.height="";
    to=slotBox(slot);
  }
  hooks.syncRailGeometry();
  if(Math.abs(to.h-from.h)<1 && Math.abs(to.m-from.m)<1) return;
  const travel=Math.round(Math.abs((from.h+from.m)-(to.h+to.m)));
  const ease=ms+"ms "+E_EASE;
  if(hidden && leaving){
    const g=mountPillsGhost(shot, from);
    void g.offsetHeight;
    g.style.transition="transform "+ease+",opacity "+ease;
    g.style.transform="translateY(-"+Math.round(from.h+from.m)+"px)";
    g.style.opacity="0";
  } else if(!hidden && from.h<1){
    slot.style.transform="translateY(-"+Math.round(to.h+to.m)+"px)";
    slot.style.opacity="0";
    void slot.offsetHeight;
    slot.style.transition="transform "+ease+",opacity "+ease;
    slot.style.transform=""; slot.style.opacity="";
  } else if(to.h+1<from.h && leaving){
    const g=mountPillsGhost(shot, from);
    const cut=Math.max(0, Math.round(from.h-to.h));
    slot.style.opacity="0";
    g.style.clipPath="inset(0 0 0 0)";
    void g.offsetHeight;
    g.style.transition="clip-path "+ease;
    g.style.clipPath="inset(0 0 "+cut+"px 0)";
  } else if(to.h>from.h+1){
    const cut=Math.max(0, Math.round(to.h-from.h));
    slot.style.clipPath="inset(0 0 "+cut+"px 0)";
    void slot.offsetHeight;
    slot.style.transition="clip-path "+ease;
    slot.style.clipPath="inset(0 0 0px 0)";
  } else if(travel){
    const g=leaving ? mountPillsGhost(shot, from) : null;
    if(g){
      void g.offsetHeight;
      g.style.transition="transform "+ease+",opacity "+ease;
      g.style.transform="translateY(-"+travel+"px)";
      g.style.opacity="0";
    }
  }
  armPillsRetreat(ms);
}
function togglePills(){
  animatePillsBox(()=>{
    lsSet("ePills", pillsWanted() ? "0" : "1");
    syncLayoutPrefs();
    if(pillsWanted()) document.body.classList.remove("pills-peek");
    // Both ways: showing derives the clip, hiding clears it - see syncPillsCollapse().
    syncPillsCollapse();
  });
  toast(pillsWanted()?"Categories shown":"Categories hidden");
}
function togglePillsLock(){
  animatePillsBox(()=>{
    lsSet("ePillsLock", pillsLocked() ? "0" : "1");
    // Locking implies the category bar should be preferred on.
    if(pillsLocked() && !pillsWanted()) lsSet("ePills","1");
    syncLayoutPrefs();
    syncPillsCollapse();
  });
  toast(pillsLocked() ? "Categories stay fully expanded" : "Categories may auto-collapse");
}
// Ctrl/Cmd: pills peek/expand + intent rail overlay when not docked.
function pillsSlot(){ return $("#pillsSlot"); }
// The category bar's SHAPE: whether it is wanted, whether it is locked open, the slot's height
// as an animation, the two-line cap, and what the head script reserves on the next load.

/* How far the pills wrap, from their layout boxes: scrollHeight also counts a pill a running
   glide still holds on its old line, and a clip decided from that re-wraps the row mid-glide. */
function pillsWrapHeight(el){
  let h=0;
  for(const c of el.children) h=Math.max(h,c.offsetTop+c.offsetHeight);
  return h;
}
function pillsTwoLines(el){
  const first=el.querySelector(".pill");
  if(!first) return 0;
  const styles=getComputedStyle(el);
  const gap=parseFloat(styles.rowGap||styles.gap)||6;
  return first.getBoundingClientRect().height*2+gap;
}
// Cap the category bar at two lines of layout space; extra rows overlay when expanded.
// Skipped when locked (⚙ → Lock categories).
function syncPillsCollapse(){
  const el=pills;
  const slot=pillsSlot();
  if(!el||!slot) return;
  document.documentElement.style.removeProperty("--e-pills-h");   // the bar is drawn: the head script's reservation is done
  const keepExpand=slot.classList.contains("pills-expand")||document.body.classList.contains("pills-lines-expand");
  /* CLEARED BEFORE ANY EARLY RETURN: pills-overflow left on a switched-off bar let Ctrl
     peek a bar wearing clipped-bar geometry - the slot reserved two lines, the pills
     flowed three. A bar that is not on screen clips nothing; say so, and the peek needs
     no overrides at all. */
  slot.classList.remove("pills-overflow","pills-expand");
  // The lanes take the bar off screen as a hidden bar is, without touching the preference.
  if(!pillsWanted()||document.body.classList.contains("pills-off")||document.body.classList.contains("e-lanes")
    ||pillsLocked()                  // locked: always full height in flow (no 2-line clip / overlay expand)
    ||!el.querySelector(".pill")){
    slot.style.removeProperty("--pills-2line");
    slot.style.removeProperty("--pills-vw");
    return;
  }
  /* The slot's cap reads both variables: see .pills-slot in the sheet. --pills-2line is inherited by
     every pill, so it is written only when it changes; --pills-vw changes at every width, so it is
     not inherited, and it is set before the measure so that the measure's layout is the only one. */
  slot.style.setProperty("--pills-vw",getComputedStyle(slot).getPropertyValue("--pills-vw-now"));
  // Measure unconstrained height (overflow class removed → pills are in normal flow).
  void el.offsetHeight;
  const two=pillsTwoLines(el);
  const full=pillsWrapHeight(el);
  /* The open bar is a popover; nothing here needs to know where it sits inside the
     header any more. */
  slot.style.removeProperty("--pills-full");
  if(slot.style.getPropertyValue("--pills-2line")!==two+"px") slot.style.setProperty("--pills-2line",two+"px");
  if(full>two+1){
    slot.classList.add("pills-overflow");
    /* The open height must be a real length for the transition to run, and it can only be
       read with the open styles applied - padding and border are part of it. Measure with
       the transition suppressed, then hand the number to CSS. One forced layout, in a
       function already forcing one. */
    slot.classList.add("pills-measuring","pills-expand");
    const openH=el.getBoundingClientRect().height;
    slot.classList.remove("pills-expand");
    void el.offsetHeight;                    // land back on the closed height before animating
    slot.classList.remove("pills-measuring");
    slot.style.setProperty("--pills-full",openH+"px");
  }
  if(keepExpand) slot.classList.add("pills-expand");
}
let ePillsSettled=false;
/* A redraw clips in its own task once the boot's first measure has run; before it, the widths
   the measure waits for are not yet known. */
function syncPillsCollapseNow(){ if(ePillsSettled) syncPillsCollapse(); }
function schedulePillsCollapse(){
  // Wait for rail-on / max-width layout to settle before measuring wrap height.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    ePillsSettled=true;
    syncPillsCollapse();
    rememberPillsShape();
    hooks.scheduleRailGeometry();
  }));
}
/* THE CLIP FOLLOWS A NEW WIDTH IN THE FRAME THAT PAINTS IT: the resize pass waits two frames, and
   the first frame at a narrower width painted a third line in flow, the list with it. The observer
   runs after layout and before paint. It clips only a bar wrapped past two lines while the slot's cap
   holds it at two, so the clip resizes #pills alone, deeper than the probe it watches: a callback
   that resizes a box at or above that depth fails the observer's loop. The rest is the resize pass's. */
let pillsWidthSeen=-1;
function pillsClipDue(){
  const el=pills, slot=pillsSlot();
  if(!el||!slot||!pillsWanted()||pillsLocked()||document.body.classList.contains("pills-off")
    ||document.body.classList.contains("e-lanes")) return false;
  if(slot.classList.contains("pills-overflow")) return false;
  const two=pillsTwoLines(el);
  return !!two && pillsWrapHeight(el)>two+1 && Math.abs(slot.getBoundingClientRect().height-two)<0.5;
}
function wirePillsWidthWatch(){
  const probe=$("#pillsProbe");
  if(!probe || typeof ResizeObserver!=="function") return;
  new ResizeObserver(es=>{
    const w=Math.round(es[es.length-1].contentRect.width);
    if(w===pillsWidthSeen) return;
    const first=pillsWidthSeen<0;
    pillsWidthSeen=w;
    if(!first && ePillsSettled && pillsClipDue()) syncPillsCollapse();
  }).observe(probe);
}
/* What the head script reserves on the next load: the slot's height at rest, per window width.
   Written once the width has held for a moment, as the facts panel's size is: a drag is a new
   width every frame, and only the last is ever read. */
let pillsShapeT=0;
function rememberPillsShape(){
  if(document.body.classList.contains("e-lanes")) return;
  const slot=pillsSlot();
  const shape=(!slot||!pillsWanted()||document.body.classList.contains("pills-off")) ? null
    : window.innerWidth+"x"+(Math.round(slot.getBoundingClientRect().height*10)/10);
  clearTimeout(pillsShapeT);
  pillsShapeT=setTimeout(()=>{ if(shape==null) lsDel("eHdrPills"); else lsSet("eHdrPills",shape); },180);
}
export {
  pillsWanted,
  pillsLocked,
  syncLayoutPrefs,
  animatePillsBox,
  togglePills,
  togglePillsLock,
  pillsSlot,
  syncPillsCollapse,
  syncPillsCollapseNow,
  schedulePillsCollapse,
  wirePillsWidthWatch,
  rememberPillsShape,
};
