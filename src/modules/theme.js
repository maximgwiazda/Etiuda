import { lsGet, lsSet } from "./storage.js";
import { mgReduceMotion } from "./motion.js";

/* Theme follows the SYSTEM until the user says otherwise; a stored choice always wins
   and is never overwritten - someone who picked light on a dark machine meant it. While
   nothing is stored the OS decides LIVE (sunset flips mid-shift). data-theme is always
   written explicitly - what lets the stylesheet's :not()/[data-theme] blocks stay as-is. */
function systemTheme(){
  try{ return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; }
  catch(e){ return "dark"; }
}
function themeChoice(){ const t=lsGet("eTheme"); return (t==="light"||t==="dark") ? t : null; }
/* THE WHOLE PALETTE LANDS IN ONE FRAME. The sheet's colour transitions are written for hover
   and for a press, and a theme flip changes every one of their inputs at once, so each control
   held its old colour for .1s over a page that had already turned - loudest on the tile the
   cursor is resting on. The class is carried through one forced reflow rather than a frame:
   rAF never runs in a background tab, and this must not be able to stick. */
function landTheme(next){
  const r=document.documentElement;
  r.classList.add("theme-swap");
  r.dataset.theme=next;
  void r.offsetHeight;
  r.classList.remove("theme-swap");
}
/* A FLIP ON SCREEN CROSSFADES THE WHOLE WINDOW AS ONE PICTURE (the sheet's ::view-transition
   rules), and the palette still lands whole underneath it. theme-swap comes off at `ready`, once
   the fade runs on the compositor: that second full restyle held its start back. `ready` settles
   whether the fade runs or is skipped. Boot, a hidden page and reduced motion land at once. */
/* A fade's callback runs a frame late and lands `themeWant`, the LATEST theme asked for: a second
   press in the same task would otherwise land first and be overwritten by the first. */
let fading=null, themeWant=null, fadeHolds=0, fadeLast=0, fadeVt=null, swapHeld=false, rollsDue=0, themePtr=false;
/* WHAT EACH FADE DID, and any page the shell had to reload, newest last, for Maintenance: the start
   is written before the fade can begin, so a page lost inside one leaves a start with no finish.
   A fade is keyed by the moment it started: the record outlives the page, and a count kept per load
   would file the next load's fades under the lost one's key. */
const TRACE_KEY="eTrace", TRACE_MAX=30;
function themeTrace(){
  try{ const a=JSON.parse(lsGet(TRACE_KEY)||"[]"); return Array.isArray(a) ? a : []; }
  catch(e){ return []; }
}
function traceNote(row, now){
  lsSet(TRACE_KEY, JSON.stringify(themeTrace().concat([[Date.now()].concat(row)]).slice(-TRACE_MAX)), !!now);
}
/* Half a revolution per press, accumulating. Held while theme-swap is on: that class cuts every
   transition, and the disc would snap instead of turn. */
function noteRoll(){
  if(mgReduceMotion()) return;
  rollsDue++;
  if(!swapHeld) flushRoll();
}
function flushRoll(){
  if(!rollsDue || mgReduceMotion()){ rollsDue=0; return; }
  const ic=document.querySelector("#theme svg");
  const n=rollsDue; rollsDue=0;
  if(!ic) return;
  const turns=(+ic.dataset.eTurns||0)+n;
  ic.dataset.eTurns=turns;
  ic.style.transform="rotate("+(turns*180)+"deg)";
}
/* The snapshots are already on their way. Walk them back from the frame they have reached, and
   put the page on the theme they are walking toward, so the reveal matches that frame's end. */
function turnBack(next, after){
  const r=document.documentElement;
  themeWant=next;
  fading=next;
  r.classList.add("theme-swap");
  r.dataset.theme=next;
  try{
    document.getAnimations().forEach(a=>{
      try{ if(a.effect && /^::view-transition/.test(a.effect.pseudoElement||"")) a.reverse(); }
      catch(e){}
    });
  }catch(e){}
  void r.offsetHeight;
  r.classList.remove("theme-swap");
  if(after) after();
}
function paintTheme(next, after){
  const r=document.documentElement, from=r.dataset.theme;
  /* A fade still running owns the screen. A press for the other theme turns it back now; a press
     for the theme it is already heading toward has nothing to do. */
  if(fadeVt){
    if((fading || from)!==next) turnBack(next, after);
    return;
  }
  themeWant=next;
  if(!from || (from===next && !fading) || typeof document.startViewTransition!=="function"
     || document.visibilityState!=="visible" || mgReduceMotion()){ landTheme(next); if(after) after(); return; }
  const n=fadeLast=Math.max(Date.now(), fadeLast+1);
  traceNote(["fade",n,"start",next], true);
  /* theme-fade holds every card real until the last fade ends: see the sheet's note on it. */
  r.classList.add("theme-fade"); fadeHolds++;
  let vt;
  try{ vt=document.startViewTransition(()=>{ r.classList.add("theme-swap"); r.dataset.theme=themeWant; }); }
  catch(e){ traceNote(["fade",n,"cancel"]); if(!--fadeHolds) r.classList.remove("theme-fade"); landTheme(next); if(after) after(); return; }
  fading=next;
  fadeVt=vt;
  swapHeld=true;
  const done=()=>{
    if(fading===next) fading=null;
    r.classList.remove("theme-swap");
    if(swapHeld){ swapHeld=false; flushRoll(); }
    /* A later press owns the theme. Storing this one would put the old choice back. */
    if(themeWant===next && after) after();
  };
  vt.ready.then(()=>{ traceNote(["fade",n,"ready"]); done(); }, ()=>{ traceNote(["fade",n,"cancel"]); done(); });
  /* A fade skipped before its callback ran (the page hidden) rejects ready first and runs the callback after,
     which turns theme-swap on again: the last fade to finish takes it off. */
  const end=()=>{
    traceNote(["fade",n,"finish"]);
    if(fadeVt===vt){ fadeVt=null; fading=null; }
    if(!--fadeHolds) r.classList.remove("theme-fade","theme-swap");
  };
  vt.finished.then(end, end);
}
// The theme the screen is on or already fading to, so a second press inside the fade turns back.
function shownTheme(){ return fading || document.documentElement.dataset.theme || systemTheme(); }
function applyTheme(){ paintTheme(themeChoice() || systemTheme()); }
// The OS keeps the last word while nothing is stored, so the watch stands for the whole session.
function watchSystemTheme(){
  try{
    const mq=matchMedia("(prefers-color-scheme: light)");
    const onSys=()=>{ if(!themeChoice()) applyTheme(); };
    if(mq.addEventListener) mq.addEventListener("change",onSys);
    else if(mq.addListener) mq.addListener(onSys);      // older Safari
  }catch(e){}
}
function wireThemeBtn(){
  const btn=document.querySelector("#theme");
  if(!btn) return;
  btn.onclick=()=>{
    /* Flips whatever is on screen, which on a first click means flipping away from the system.
       Storing the result is what pins it: from here the OS no longer moves this page. Reset
       clears eTheme with every other e* key, so a wiped Etiuda follows the system again. */
    const nx=shownTheme()==="dark"?"light":"dark";
    /* Stored as the fade begins: under the shell the write turns the window's material at once,
       and the material cannot fade. A press that turns the fade back stores at that press. */
    paintTheme(nx, ()=>{ lsSet("eTheme",nx); });
    noteRoll();
  };
  if(themePtr) return;
  themePtr=true;
  /* While the crossfade runs, the event's target is <html> (the sheet's note on the fade), so
     the button never hears it. A press whose point lies on the button is that button's press. */
  document.addEventListener("click", ev=>{
    if(!fadeVt || ev.button) return;
    const b=document.querySelector("#theme");
    if(!b || ev.target===b || (b.contains && b.contains(ev.target))) return;
    const box=b.getBoundingClientRect();
    if(ev.clientX>=box.left && ev.clientX<=box.right && ev.clientY>=box.top && ev.clientY<=box.bottom && b.onclick) b.onclick();
  }, true);
}

export {
  themeTrace,
  traceNote,
  systemTheme,
  themeChoice,
  applyTheme,
  watchSystemTheme,
  wireThemeBtn
};
