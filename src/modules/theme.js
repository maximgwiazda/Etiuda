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
function paintTheme(next){
  const r=document.documentElement;
  r.classList.add("theme-swap");
  r.dataset.theme=next;
  void r.offsetHeight;
  r.classList.remove("theme-swap");
}
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
    const cur=document.documentElement.dataset.theme||systemTheme();
    const nx=cur==="dark"?"light":"dark";
    paintTheme(nx); lsSet("eTheme",nx);
    // Half a revolution per press, accumulating - see the #theme svg note in the stylesheet.
    const ic=document.querySelector("#theme svg");
    if(ic && !mgReduceMotion()){
      const turns=(+ic.dataset.eTurns||0)+1;
      ic.dataset.eTurns=turns;
      ic.style.transform="rotate("+(turns*180)+"deg)";
    }
  };
}

export {
  systemTheme,
  themeChoice,
  applyTheme,
  watchSystemTheme,
  wireThemeBtn
};
