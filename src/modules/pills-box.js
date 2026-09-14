import { lsGet, lsSet, lsDel } from "./storage.js";
import { mgReduceMotion, E_EASE } from "./motion.js";
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
  ms=ms||180;
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
  slot.style.removeProperty("--pills-2line");
  if(!pillsWanted()||document.body.classList.contains("pills-off")) return;
  // Locked: always full height in flow (no 2-line clip / overlay expand).
  if(pillsLocked()) return;
  const first=el.querySelector(".pill");
  if(!first) return;
  // Measure unconstrained height (overflow class removed → pills are in normal flow).
  void el.offsetHeight;
  const lineH=first.getBoundingClientRect().height;
  const styles=getComputedStyle(el);
  const gap=parseFloat(styles.rowGap||styles.gap)||6;
  const two=lineH*2+gap;
  const full=el.scrollHeight;
  /* The open bar is a popover; nothing here needs to know where it sits inside the
     header any more. */
  slot.style.removeProperty("--pills-full");
  if(full>two+1){
    slot.classList.add("pills-overflow");
    slot.style.setProperty("--pills-2line",two+"px");
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
function schedulePillsCollapse(){
  // Wait for rail-on / max-width layout to settle before measuring wrap height.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    syncPillsCollapse();
    rememberPillsShape();
    hooks.scheduleRailGeometry();
  }));
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
  schedulePillsCollapse,
  rememberPillsShape,
};
