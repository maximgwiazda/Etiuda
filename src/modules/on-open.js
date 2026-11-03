/* What boot does once the screen exists: the chrome in the saved interface language, the
   cursor on the first copyable block, and a greeting that cannot go stale. */
import { greeting } from "./greeting.js";
import { listEntryEls } from "./entry-walk.js";
import { render } from "./render.js";
import { setEntrySel } from "./mark.js";
import { applyUiLang } from "./repaint.js";
import { afterShown, dialogStanding, markCovered } from "./empty-mark.js";
import { warmMenu } from "./header-menus.js";
import { ssGet, ssSet } from "./storage.js";
import { mgReduceMotion } from "./motion.js";
import { launchMark, whenLaunchLanded } from "./launch-mark.js";
import { fifthPhase } from "./fifth.js";

let eReadyDone=false;
let lastGreet;

function markEReady(){
  if(eReadyDone) return;
  eReadyDone=true;
  /* A saved interface language repaints the chrome once the markup exists. The HTML ships
     English, so this is the only moment a Polish build stops looking English. */
  applyUiLang();
}

/* THE EMPTY DESK'S FOCUS is its one button: Load catalog takes it where the screen draws it, once nothing else holds the
   focus and no dialog stands. The search box takes none at open (it is hidden under the launch, and the first typed key
   reaches it by the page's own routing); a work hidden by the launch cannot take it, so the landing asks again. */
function focusEmptyLoadOnOpen(){
  try{
    const a=document.activeElement;
    if(a&&a!==document.body) return;
    if(document.body && document.body.classList && document.body.classList.contains("e-launch")) return;
    if(dialogStanding() || dialogShown()) return;
    const b=document.querySelector("#emptyLoad");
    if(b) b.focus({preventScroll:true});
  }catch(_){}
}

/* A dialog on screen that is not a .modal (Quick facts, the tour's card, a question's bubble) holds the desk too. */
function dialogShown(){
  try{
    return Array.prototype.some.call(document.querySelectorAll('[role="dialog"]'), d=>d.getClientRects && d.getClientRects().length>0);
  }catch(_){ return false; }
}

// On open: focus the first copyable entry so ↑↓ work immediately (no INTENT capture).
// INTENT still receives typing when the user starts typing (global keydown → intent field).
function focusFirstEntryOnOpen(){
  // An empty desk takes nothing from what holds the focus: Load catalog waits for the page itself to have it.
  const els=listEntryEls();
  if(!els.length){ focusEmptyLoadOnOpen(); return; }
  try{
    const a=document.activeElement;
    // Never out of a dialog: the first-run questions take the keyboard before this runs.
    if(a&&a!==document.body&&typeof a.blur==="function"&&!(a.closest&&a.closest(".modal"))) a.blur();
  }catch(_){}
  const el=els[0];
  const card=el.closest(".card[data-id]");
  if(!card) return;
  setEntrySel(card.dataset.id, +el.dataset.v, {scroll:false, smooth:false});
}

/* THE LAUNCH, once per window: the first boot the window's session has seen. A reload (a catalog accepted, the
   shell's recovery) is not a launch. The list is painted by the first frame after boot, and the work is ready on the
   first frame once the window is on screen. Over the empty desk the block takes the drawing at once, as Studio's
   empty screen does, so the work rises with the mark already in it; the figure there is the empty desk's own. */
function deskLaunch(){
  if(ssGet("eLaunched")) return null;
  ssSet("eLaunched","1");
  const region=document.querySelector("#dotField>div");
  if(!region) return null;
  const h=launchMark({app:"desk", region:region, still:mgReduceMotion, covered:markCovered,
    phase:fifthPhase, ready:new Promise(r=>afterShown(()=>requestAnimationFrame(()=>r())))});
  return h;
}

function wireOnOpen(){
  deskLaunch();
  /* The saved interface language is on the chrome before the first paint. The landing
     waits only for what must follow it: the menu's warm copy, drawn once nothing moves. */
  markEReady();
  const formed=fn=>whenLaunchLanded(fn);
  /* The menu's warm copy (header-menus.js, warmMenu) is drawn while nothing moves: once the mark has
     formed, MENU_WARM_MS on, when the page is idle. */
  const MENU_WARM_MS=900;
  formed(()=>setTimeout(()=>{
    if(typeof requestIdleCallback==="function") requestIdleCallback(warmMenu,{timeout:2000}); else warmMenu();
  },MENU_WARM_MS));
  focusFirstEntryOnOpen();
  // Re-assert after layout (paint / sticky chrome can steal focus)
  requestAnimationFrame(()=>requestAnimationFrame(focusFirstEntryOnOpen));
  /* Under a launch the Load button is hidden until the landing, which is when it takes the focus. */
  formed(focusEmptyLoadOnOpen);
  // A shift crosses 12:00 or 18:00 with the page still open - re-render on the boundary
  // so the greeting never goes stale mid-session.
  lastGreet=greeting();
  setInterval(()=>{ const g=greeting(); if(g!==lastGreet){ lastGreet=g; render(); } }, 30000);
}

export {
  focusFirstEntryOnOpen,
  wireOnOpen
};
