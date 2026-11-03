import { lsGet, lsSet } from "./storage.js";
import { mgReduceMotion, M_MS } from "./motion.js";

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
/* One half-turn per press at the roll tier's rate. A press during a turn lengthens
   it from the angle already reached. The inline rotate() is the target, not the
   angle mid-turn: that one is the running transition. */
let rollFrom=0, rollTo=0;
function declaredAngle(ic){
  const m=/rotate\(\s*([-\d.]+)deg\)/.exec(ic.style.transform||"");
  return m ? Number(m[1]) : null;
}
function rollAngle(ic){
  const anims=typeof ic.getAnimations==="function" ? ic.getAnimations() : [];
  const anim=anims.filter(a=>a && a.transitionProperty==="transform" && a.playState!=="finished").pop();
  if(anim){
    const timing=anim.effect && anim.effect.getComputedTiming();
    const dur=Number(timing && timing.duration)||0;
    const ct=Number(anim.currentTime);
    const p=dur>0 && Number.isFinite(ct) ? Math.min(1, Math.max(0, ct/dur)) : 0;
    return rollFrom+(rollTo-rollFrom)*p;
  }
  const declared=declaredAngle(ic);
  return declared==null ? 0 : declared;
}
function noteRoll(){
  if(mgReduceMotion()) return;
  const ic=document.querySelector("#theme svg");
  if(!ic) return;
  const from=rollAngle(ic);
  const turns=(Number(ic.dataset.eTurns)||0)+1;
  const to=turns*180;
  ic.dataset.eTurns=String(turns);
  const delta=Math.max(0, to-from);
  const ms=Math.round(M_MS.roll*delta/180);
  rollFrom=from;
  rollTo=to;
  ic.style.transition="none";
  ic.style.transform="rotate("+from+"deg)";
  void ic.offsetWidth;
  ic.style.transition="transform "+ms+"ms linear";
  ic.style.transform="rotate("+to+"deg)";
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
