/* What boot does once the screen exists: the chrome in the saved interface language, the
   cursor on the first copyable block, and a greeting that cannot go stale. */
import { greeting } from "./greeting.js";
import { listEntryEls } from "./entry-walk.js";
import { render } from "./render.js";
import { setEntrySel } from "./mark.js";
import { applyUiLang } from "./repaint.js";
import { whenMarkFormed, dialogStanding } from "./empty-mark.js";
import { warmMenu } from "./header-menus.js";
import { ssGet, ssSet } from "./storage.js";
import { mgReduceMotion } from "./motion.js";
import { launchMark, whenLaunchLanded } from "./launch-mark.js";

let eReadyDone=false;
let lastGreet;

function markEReady(){
  if(eReadyDone) return;
  eReadyDone=true;
  /* A saved interface language repaints the chrome once the markup exists. The HTML ships
     English, so this is the only moment a Polish build stops looking English. */
  applyUiLang();
}

// On open: focus the first copyable entry so ↑↓ work immediately (no INTENT capture).
// INTENT still receives typing when the user starts typing (global keydown → intent field).
function focusFirstEntryOnOpen(){
  try{
    const a=document.activeElement;
    // Never out of a dialog: the first-run questions take the keyboard before this runs.
    if(a&&a!==document.body&&typeof a.blur==="function"&&!(a.closest&&a.closest(".modal"))) a.blur();
  }catch(_){}
  const els=listEntryEls();
  if(!els.length) return;
  const el=els[0];
  const card=el.closest(".card[data-id]");
  if(!card) return;
  setEntrySel(card.dataset.id, +el.dataset.v, {scroll:false, smooth:false});
}

/* THE LAUNCH, once per window: the first boot the window's session has seen, and not over the empty desk, whose
   own mark is its arrival. A reload (a catalog accepted, the shell's recovery) is not a launch. The list is
   painted by the first frame after boot. */
function deskLaunch(){
  if(ssGet("eLaunched")) return null;
  ssSet("eLaunched","1");
  const region=document.querySelector("#dotField>div");
  if(!region || document.querySelector(".empty-desk")) return null;
  return launchMark({app:"desk", region:region, still:mgReduceMotion, covered:dialogStanding,
    ready:new Promise(r=>requestAnimationFrame(()=>r()))});
}

function wireOnOpen(){
  deskLaunch();
  const formed=fn=>whenLaunchLanded(()=>whenMarkFormed(fn));
  /* Boot is painted, so a saved interface language may repaint the chrome. Two frames, so the
     first paint and the frame that settles after it are both behind us. With a timeout behind
     THAT, because rAF DOES NOT RUN IN A HIDDEN TAB: restored into a background tab the class
     would never arrive - the same trap that kept schedulePillsCollapse's two-frame wait from
     ever firing there. First one wins, and neither lands inside the launch's arrival or the empty mark's gather. */
  requestAnimationFrame(()=>requestAnimationFrame(()=>formed(markEReady)));
  setTimeout(()=>formed(markEReady),300);
  /* The menu's warm copy (header-menus.js, warmMenu) is drawn while nothing moves: once the mark has
     formed, MENU_WARM_MS on, when the page is idle. */
  const MENU_WARM_MS=900;
  formed(()=>setTimeout(()=>{
    if(typeof requestIdleCallback==="function") requestIdleCallback(warmMenu,{timeout:2000}); else warmMenu();
  },MENU_WARM_MS));
  focusFirstEntryOnOpen();
  // Re-assert after layout (paint / sticky chrome can steal focus)
  requestAnimationFrame(()=>requestAnimationFrame(focusFirstEntryOnOpen));
  // A shift crosses 12:00 or 18:00 with the page still open - re-render on the boundary
  // so the greeting never goes stale mid-session.
  lastGreet=greeting();
  setInterval(()=>{ const g=greeting(); if(g!==lastGreet){ lastGreet=g; render(); } }, 30000);
}

export {
  focusFirstEntryOnOpen,
  wireOnOpen
};
