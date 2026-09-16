import { mgReduceMotion, E_EASE } from "./motion.js";
import { $ } from "./dom.js";

// What the band gives up when the tab strip runs out of room, and the choreography the strip
// shares with it. ONE THING GOES: the wordmark. The decision is applyTabWidths' - it has to land
// in the same frame as the arrows - and this file holds the measurement it prices with and the
// movement it plays.

/* The wordmark's natural width, frozen. It is priced while it is ON SCREEN, because a control
   that is not drawn cannot be measured and the strip needs to know what putting it back would
   cost. Merge, never replace: 0 means "no valid reading this pass", not "zero pixels wide".
   Whole pixels only - a fractional natural is the fuel of a per-frame decision flip, and
   ceiling is the conservative direction, since overstating the wordmark sheds it a hair early
   and early is the invisible failure. */
let eShedNat=null;
function measureShedNaturals(){
  const el=$(".brand-long");
  const w=el?Math.ceil(el.getBoundingClientRect().width):0;
  if(!eShedNat){ eShedNat={wordmark:w}; return; }
  if(w>0) eShedNat.wordmark=w;
}
/* What the strip asks across the valve: 0 for a reading not taken yet, which is what its one
   caller already treated a missing measurement as. */
function shedWordmarkW(){ return (eShedNat && eShedNat.wordmark>0) ? eShedNat.wordmark : 0; }

/* ---- the choreography, the restrained layer. SURVIVORS GLIDE (FLIP; the strip rides as one
   box), LEAVERS FADE where they stand as position:fixed ghosts (the element is already
   display:none), ARRIVERS fade in. Two structural rules: the diff is scheduler ENTRY versus
   EXIT, never per-apply - a caller probing candidate states inside one synchronous pass must
   stay invisible and only the settled truth animates; and ghosts are fixed clones on <body>,
   transform and opacity only, so they cannot resize anything the strip measures and the
   ResizeObserver cannot hear them. */
/* The wordmark is MEASURED, so it may not transition for real - a width read mid-fade is input
   corruption; the cast animates a CLONE while the element goes display:none at frame one. The
   arrows are cast members for the same reason they share the wordmark's moment: a pop landing
   beside a fade is read as a second event. */
const SHED_CAST=[".brand-long","#tabsPrev","#tabsNext"];
function shedSnap(){
  const m={};
  SHED_CAST.concat(["#tabsWrap"]).forEach(sel=>{
    const el=$(sel); if(!el) return;
    const cs=getComputedStyle(el);
    m[sel]={ r:el.getBoundingClientRect(), vis:cs.display!=="none" && el.getBoundingClientRect().width>0 };
  });
  return m;
}
/* A CALLER HOLDING A SNAPSHOT SAYS SO, and applyTabWidths leaves the movement to it. Without
   this the wordmark moved twice on the paths that already choreograph and not at all on the
   paths that do not. */
let shedHeld=0;
/* The one way to raise it, so that a writer outside this module does not have to reach a
   binding a module namespace hands over read-only. */
function shedHold(fn){ shedHeld++; try{ fn(); } finally { shedHeld--; } }
function shedHolding(){ return shedHeld>0; }
function shedAnimate(before){
  const go=shedStage(before);
  if(!go) return;
  void document.body.offsetWidth;   // the from-state is committed before any transition attaches
  go();
}
/* STAGED AND RELEASED APART, so a caller with an animation of its own can start the movement in
   the SAME frame as it. The tab insert attaches its widths two frames late on purpose - a
   main-thread width animation loses its opening third otherwise - and a glide let go at the
   mutation ran 46ms ahead of the grow, which is long enough to read as the header moving first
   and the strip following. Staging still happens at the mutation: the from-state must be on
   screen before the row has been seen in its new shape. */
function shedStage(before){
  if(mgReduceMotion()) return null;
  const after=shedSnap();
  const EASE=E_EASE;
  const go=[];
  SHED_CAST.forEach(sel=>{
    const b=before[sel], a=after[sel], el=$(sel);
    if(!b||!a||!el) return;
    if(b.vis && !a.vis){
      const g=el.cloneNode(true);
      g.style.cssText="position:fixed;left:"+b.r.left+"px;top:"+b.r.top+"px;width:"+b.r.width
        +"px;height:"+b.r.height+"px;margin:0;z-index:200;pointer-events:none;opacity:1;"
        +"transition:opacity .16s ease";
      document.body.appendChild(g);
      go.push(()=>{ g.style.opacity="0"; setTimeout(()=>g.remove(), 200); });
    } else if(!b.vis && a.vis){
      el.style.transition="none";
      el.style.opacity="0";
      go.push(()=>{ el.style.transition="opacity .18s ease"; el.style.opacity="";
                    setTimeout(()=>{ el.style.transition=""; }, 220); });
    }
  });
  /* The survivor. */
  ["#tabsWrap"].forEach(sel=>{
    const b=before[sel], a=after[sel], el=$(sel);
    if(!b||!a||!el||!b.vis||!a.vis) return;
    const dx=b.r.left-a.r.left;
    if(Math.abs(dx)<1) return;
    el.style.transition="none";
    el.style.transform="translateX("+dx+"px)";
    go.push(()=>{ el.style.transition="transform .2s "+EASE; el.style.transform="";
                  setTimeout(()=>{ el.style.transition=""; }, 240); });
  });
  return go.length ? (()=>{ for(let i=0;i<go.length;i++) go[i](); }) : null;
}

export {
  eShedNat, measureShedNaturals,
  shedSnap, shedStage, shedAnimate, shedHeld, shedHold, shedHolding, shedWordmarkW,
};
