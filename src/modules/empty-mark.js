/* THE EMPTY DESK'S MARK is the launch's drawing (launch-mark.js), as Studio's empty Projects screen's is:
   its points arrive from across the empty desk's block onto the figure on the block's .e-fifth-spot, it
   turns with the header's clock, and under a quiet switch it is drawn landed and still. A launch giving
   way onto the empty desk hands its drawing over with its clock and its points. */
import { mgReduceMotion } from "./motion.js";
import { fifthPhase } from "./fifth.js";
import { syncLaunchMark } from "./launch-mark.js";

function dialogStanding(){ return !!document.querySelector(".modal:not([hidden]):not(.e-gone)"); }
/* THE WINDOW ON SCREEN: a host says whether it was when this load asked, and once when it is; a page
   with no host, or a host that never says, is on screen. The first ask listens, and boot asks. */
let eShown=null;
function windowShown(){
  if(eShown!==null) return eShown;
  const h=(typeof window!=="undefined" && window.E_HOST) || null;
  eShown=!h || typeof h.onShown!=="function" || !!h.shown;
  if(!eShown) try{ h.onShown(()=>{ eShown=true; }); }catch(e){ eShown=true; }
  return eShown;
}
// An opening waits under a dialog, and for a window not yet on screen, whose frames nobody sees.
function markCovered(){
  if(!windowShown()) return true; /* plant:mark-waits-shown */
  return dialogStanding();
}
// What every drawing of the mark on the desk is given: the quiet switch, the opening's wait, the header's clock.
function deskMarkOpts(){ return {still:mgReduceMotion, covered:markCovered, phase:fifthPhase}; }
/* render() hands over the empty desk's block, or null for any other list, which stops a drawing no launch
   stands on. A re-render of the empty desk moves the same drawing into the new block: one arrival per
   appearance. */
function syncEmptyMark(host){
  syncLaunchMark(host || null, deskMarkOpts()); /* plant:empty-desk-takes-launch */
}

export {
  dialogStanding,
  markCovered,
  syncEmptyMark
};
