/* THE EMPTY DESK'S MARK is the launch's drawing (launch-mark.js), as Studio's empty Projects screen's is:
   its points arrive from across the empty desk's block onto the figure on the block's .e-fifth-spot, it
   turns with the header's clock, and under a quiet switch it is drawn landed and still. A launch giving
   way onto the empty desk hands its drawing over with its clock and its points. */
import { mgReduceMotion } from "./motion.js";
import { fifthPhase } from "./fifth.js";
import { syncLaunchMark } from "./launch-mark.js";

function dialogStanding(){ return !!document.querySelector(".modal:not([hidden]):not(.e-gone)"); }
/* THE WINDOW ON SCREEN: a host says whether it was when this load asked, and once when it is; a page
   with no host, or a host that never says, is on screen. The first ask listens, and boot asks.
   NOTHING WAITS ON THE WORD FOR EVER: the page counts as on screen SHOWN_BOUND_MS after its first frame, or
   SHOWN_LATEST_MS after the ask, or when it turns visible from hidden. Not merely visible: a hidden window
   whose page still paints reports visible, which is what the word is for. */
const SHOWN_BOUND_MS=1500, SHOWN_LATEST_MS=3000;
let eShown=null, shownWait=[];
function shownNow(){
  if(eShown) return;
  eShown=true;
  const w=shownWait; shownWait=[]; w.forEach(f=>f());
}
function windowShown(){
  if(eShown!==null) return eShown;
  const h=(typeof window!=="undefined" && window.E_HOST) || null;
  eShown=!h || typeof h.onShown!=="function" || !!h.shown;
  if(eShown) return eShown;
  try{ h.onShown(shownNow); }catch(e){ eShown=true; return eShown; }
  try{ requestAnimationFrame(()=>setTimeout(shownNow, SHOWN_BOUND_MS)); }catch(e){} /* plant:shown-has-a-bound */
  setTimeout(shownNow, SHOWN_LATEST_MS);
  try{ document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") shownNow(); }); }catch(e){}
  return eShown;
}
// What waits for the window on screen runs once it is, at once where it already is.
function afterShown(fn){ if(windowShown()) fn(); else shownWait.push(fn); }
// An opening waits under a dialog, and for a window not yet on screen, whose frames nobody sees.
function markCovered(){
  if(!windowShown()) return true; /* plant:mark-waits-shown */
  return dialogStanding();
}
/* The empty desk's figure is the desk's own fuller one, the header's R 10, where the launch over cards and Studio's
   draw R 7 (Max, 2026-11-01 18:19). */
const EMPTY_DESK_R=10;
// What every drawing of the mark on the empty desk is given: its figure, the quiet switch, the opening's wait, the header's clock.
function deskMarkOpts(){ return {R:EMPTY_DESK_R, still:mgReduceMotion, covered:markCovered, phase:fifthPhase}; }
/* render() hands over the empty desk's block, or null for any other list, which stops a drawing no launch
   stands on. A re-render of the empty desk moves the same drawing into the new block: one arrival per
   appearance. */
function syncEmptyMark(host){
  syncLaunchMark(host || null, deskMarkOpts()); /* plant:empty-desk-takes-launch */
}

export {
  EMPTY_DESK_R,
  afterShown,
  dialogStanding,
  markCovered,
  syncEmptyMark
};
