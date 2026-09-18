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

/* ---- THE SECOND ROW'S LADDER. The tools stand where the agent's name used to, and they retreat
   the way the band's chrome did: into the chevron, cheapest first. The covenant is 1.16.7's own
   and it is about FIELDS rather than tabs - the second row has no reservoir to negotiate with,
   its boxes simply shrink - so the question asked at every width is whether either field is
   below the floor the sheet gives it.
   THE FLOORS ARE READ, NEVER WRITTEN HERE: both are flex bases, which is the one thing
   getComputedStyle resolves to pixels, so `--paxrole-field` and the search box's own
   max(--name-field, --paxrole-field - 70px) reach this code as numbers without a copy of either
   living in it. The gap between the tools is read the same way.
   THE ROW IS ASKED, NOT MODELLED, for the reason the band's ladder was rewritten to: a summed
   model of the chrome ran 46px short of the real row. Each step applies its class and re-reads,
   so the next iteration sees the settled result, and every probe happens inside one synchronous
   pass, where nothing is painted. */
const ROW_SHED_ORDER=["shed-theme","shed-facts","shed-segfold","shed-seg"];
let eRowNat=null;   // the tools' natural widths, frozen while they are on screen
function measureRowNaturals(){
  const w=el=>el?Math.ceil(el.getBoundingClientRect().width):0;
  const seg=$("#seg"), segOn=$("#seg button.on")||$("#seg button"), other=$("#seg button:not(.on)");
  /* A reading is trusted only in the STATE the entry names. A folded seg measuring 40px "whole"
     once overwrote segFull's honest 78, and each pass corrupted the next until the row stripped
     itself bare. */
  const both=!!seg && w(seg)>0 && !!other && getComputedStyle(other).display!=="none";
  const m={
    theme: w($("#theme")),
    facts: w($("#factsBtn")),
    segFull: both ? w(seg) : 0,
    segFold: w(segOn)>0 ? w(segOn)+2 : 0,      // the fold keeps one button and the box's borders
    chevron: w($("#settingsBtn")),             // the same .btn.icbtn box as the chevron's own
  };
  /* Merge, never replace: 0 means "no valid reading this pass", not "zero pixels wide". Whole
     pixels only - a fractional natural is the fuel of a per-frame flip - and ceiling errs towards
     leaving a control in the chevron, which is the invisible failure. */
  if(!eRowNat){ eRowNat=m; return; }
  Object.keys(m).forEach(k=>{ if(m[k]>0) eRowNat[k]=m[k]; });
}
function rowBasis(el){ const v=parseFloat(getComputedStyle(el).flexBasis); return v>0?v:0; }
/* THE HEADROOM A RETURN MUST CLEAR. One band, so no width can satisfy both directions: a control
   leaves the moment its field is short and comes back only 14px clear of that, which is what
   keeps a drag across the threshold from ringing. */
const ROW_RETURN_CLEAR=14;
/* THE ROOM THE SEARCH BOX KEEPS, ruled 2026-09-17. The ladder used to wait until a field was
   UNDER its floor, which is a search box with nothing to spare and a PAX box already giving way,
   so the tools sat on the row some fifty pixels of window past the point they were costing
   anything. A control retreats while the search still has this much above its own floor, and the
   width the chevron frees lands in the box somebody is typing in. */
const ROW_SHED_ROOM=30;
function syncRowShed(){
  const row=$(".fills"); if(!row) return;
  const fills=row.querySelectorAll(":scope > .fill");
  const pax=fills[0], find=fills[1];
  if(!pax||!find||!$("#rowTools")) return;
  if(!eRowNat) measureRowNaturals();
  const N=eRowNat;
  const gap=parseFloat(getComputedStyle($("#rowTools")).columnGap)||0;
  let k=syncRowShed._k!=null?syncRowShed._k:0;
  const apply=()=>{ ROW_SHED_ORDER.forEach((c,i)=>document.body.classList.toggle(c, i<k)); };
  apply();   // the DOM agrees with _k before it is read: boot, or a class written elsewhere
  /* Below a floor by a whole pixel, not by a rounding error: both sides of this comparison are
     fractional, and a box sitting exactly on its floor measured 171.98 against 172 often enough
     to shed a control at a width where nothing was wrong. */
  const short=()=>Math.round(pax.getBoundingClientRect().width)+1 < Math.round(rowBasis(pax))
              || Math.round(find.getBoundingClientRect().width)+1
                 < Math.round(rowBasis(find))+ROW_SHED_ROOM;
  /* What is spare is whatever the search box holds above its own floor: the PAX box cannot grow
     past its basis, so every pixel of slack in this row is in that one box. */
  const spare=()=>find.getBoundingClientRect().width-rowBasis(find);
  /* THE CHEVRON NEVER OPENS ON A SINGLE ROW - a door is worth a doorway only when two things
     live behind it - so the two dwellers go as a PAIR and k=1 is not a resting state. The bump
     is upward: a step shed early is the invisible failure, a one-row chevron the visible one. */
  if(k===1){ k=2; apply(); }
  if(short()){
    while(k<ROW_SHED_ORDER.length && short()){ k++; apply(); }
    if(k===1){ k=2; apply(); }
    syncRowShed._k=k;
    return;
  }
  /* Returning, priced by what would come back. The pair's price is NET of the chevron: taking
     both back dismisses the door, so the row recovers its width too, and the gross sum held the
     pair behind it some fifty pixels of window longer than the truth. */
  while(k>0){
    const step=(k===2)?2:1;
    const cost=(k===2)?(N.theme+N.facts+2*gap-(N.chevron+gap))
              :(k===3)?(N.segFull-N.segFold)
              :(N.segFold+gap);
    /* The room as well as the clearance: a return that lands inside the room above would be shed
       again by the very next pass, and the veto below would only hide the flap. */
    if(spare()<cost+ROW_SHED_ROOM+ROW_RETURN_CLEAR) break;
    k-=step; apply();
    /* The veto, last and always: a return that leaves either field short goes straight back.
       The probe was never painted, so undoing it costs nothing anybody can see. */
    if(short()){ k+=step; apply(); break; }
  }
  syncRowShed._k=k;
}

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
/* The second row's four join the wordmark: a control that leaves fades where it stood rather
   than blinking out, and one arriving fades in. The chevron is in the list for both reasons. */
const SHED_CAST=[".brand-long","#tabsPrev","#tabsNext","#theme","#factsBtn","#seg","#moreBtn"];
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
  eShedNat, measureShedNaturals, eRowNat, measureRowNaturals, syncRowShed,
  shedSnap, shedStage, shedAnimate, shedHeld, shedHold, shedHolding, shedWordmarkW,
};
