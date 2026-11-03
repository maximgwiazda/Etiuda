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
/* THE RECORD Maintenance reads, newest last: a page the shell had to reload ("lost"). Kept by
   the moment it was written, since the record outlives the page. */
const TRACE_KEY="eTrace", TRACE_MAX=30;
function themeTrace(){
  try{ const a=JSON.parse(lsGet(TRACE_KEY)||"[]"); return Array.isArray(a) ? a : []; }
  catch(e){ return []; }
}
function traceNote(row){
  lsSet(TRACE_KEY, JSON.stringify(themeTrace().concat([[Date.now()].concat(row)]).slice(-TRACE_MAX)));
}
/* Half a revolution per press, accumulating. */
function noteRoll(){
  if(mgReduceMotion()) return;
  const ic=document.querySelector("#theme svg");
  if(!ic) return;
  const turns=(+ic.dataset.eTurns||0)+1;
  ic.dataset.eTurns=turns;
  ic.style.transform="rotate("+(turns*180)+"deg)";
}
/* THE THEME LANDS AT ONCE, as Studio's does: the attribute in the press's own task, and each control
   eases its own colours on the sheet's tiers. Nothing waits on the host. */
/* The flip starts no transition on the repeating rows: the sheet #eFlipHold is on for the press's
   own frame and the next, then off. A later press re-arms it; only the last lets go. */
let flipHeld=0;
function flipHoldSheet(){
  const el=typeof document.getElementById==="function" ? document.getElementById("eFlipHold") : null;
  return el && el.sheet ? el.sheet : null;
}
function holdFlip(){
  const sh=flipHoldSheet();
  if(!sh || typeof requestAnimationFrame!=="function") return;
  const n=++flipHeld;
  sh.disabled=false;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ if(n===flipHeld) sh.disabled=true; }));
}
function paintTheme(next){
  holdFlip();
  document.documentElement.dataset.theme=next; /* plant:theme-lands-at-once */
}
// The theme on screen, so a second press flips back whatever is still easing.
function shownTheme(){ return document.documentElement.dataset.theme || systemTheme(); }
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
  const sh=flipHoldSheet(); if(sh) sh.disabled=true;   // on until boot, so the first paint starts nothing
  const btn=document.querySelector("#theme");
  if(!btn) return;
  btn.onclick=()=>{
    /* Flips whatever is on screen, which on a first click means flipping away from the system.
       Storing the result is what pins it: from here the OS no longer moves this page. Reset
       clears eTheme with every other e* key, so a wiped Etiuda follows the system again. Under
       the shell the stored key is what turns the window's material, sent without waiting. */
    const nx=shownTheme()==="dark"?"light":"dark";
    paintTheme(nx);
    lsSet("eTheme",nx); /* plant:theme-choice-saved */
    noteRoll();
  };
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
