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
let pillsBoxTimer=null;
/* THE SLOT'S HEIGHT IS THE ANIMATION - it sits in the sticky header, so gliding it
   carries the whole page. Measured, not declared: the ends are display:none and auto,
   which CSS cannot interpolate. Same FLIP discipline as flipPills, forced reflow included.
   `mutate` must land FINAL geometry synchronously - an intermediate layout glides to the
   wrong height. The transition is NOT in the sheet: a standing one would animate every
   step of a resize drag. */
function animatePillsBox(mutate,ms){
  ms=ms||M_MS.move;
  const slot=pillsSlot();
  if(!slot || mgReduceMotion()){
    // No ride, but the header still changed height and the fixed panel is pinned to it.
    mutate();
    hooks.syncRailGeometry();
    return;
  }
  const box=()=>{
    const cs=getComputedStyle(slot);
    // A hidden slot is not a short slot: it reserves nothing, margin included.
    return cs.display==="none" ? {h:0,m:0}
      : {h:slot.getBoundingClientRect().height, m:parseFloat(cs.marginTop)||0};
  };
  const from=box();
  mutate();
  // Any override from a toggle still in flight has to go before the natural height can be read.
  slot.style.transition="none"; slot.style.height=""; slot.style.marginTop="";
  const to=box();
  const done=()=>{
    slot.classList.remove("pills-anim");
    slot.style.transition=""; slot.style.height=""; slot.style.marginTop="";
    hooks.syncRailGeometry();
  };
  clearTimeout(pillsBoxTimer);
  if(Math.abs(to.h-from.h)<1 && Math.abs(to.m-from.m)<1){ done(); return; }
  slot.classList.add("pills-anim");
  slot.style.height=from.h+"px"; slot.style.marginTop=from.m+"px";
  void slot.offsetHeight;                    // commit the start - see the note in flipPills
  slot.style.transition="height "+ms+"ms "+E_EASE+",margin-top "+ms+"ms "+E_EASE;
  slot.style.height=to.h+"px"; slot.style.marginTop=to.m+"px";
  /* The panel is fixed and positioned from the header's bottom edge - precisely the thing
     that is moving - so it is told every frame of the ride, not once. rAF stalls in a
     background tab, which is why the timer below has the last word either way. */
  const until=performance.now()+ms+20;
  const follow=()=>{
    hooks.syncRailGeometry();
    if(performance.now()<until) requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
  pillsBoxTimer=setTimeout(done,ms+20);
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
  if(!pillsWanted()||document.body.classList.contains("pills-off")
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
  if(!el||!slot||!pillsWanted()||pillsLocked()||document.body.classList.contains("pills-off")) return false;
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
// What the head script reserves on the next load: the slot's height at rest, per window width.
function rememberPillsShape(){
  const slot=pillsSlot();
  if(!slot||!pillsWanted()||document.body.classList.contains("pills-off")){ lsDel("eHdrPills"); return; }
  lsSet("eHdrPills", window.innerWidth+"x"+(Math.round(slot.getBoundingClientRect().height*10)/10));
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
