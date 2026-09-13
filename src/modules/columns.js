import { nsGet } from "./storage.js";

/* ---- Card columns -------------------------------------------------------------------------
   THE RULE: the first group goes in the first column, the second in the second, the
   third back in the first. A group is a separator and the cards beneath it, never split.
   With fewer than two groups the CARDS are dealt by the same rule instead - which also
   keeps a single-category view from filling one column and leaving the rest empty.
   DEALT, NOT BALANCED: multi-column would cut categories across columns and must lay out
   everything before placing anything. The cost is a ragged bottom, and it is worth
   paying: a category sits in the SAME column every time - adding a card to one category
   cannot move another to the other side, and stable position beats a level bottom for
   someone working against an idle timer. NOT a grid of groups either: aligned rows are
   as tall as the taller group in them - 22% of the rendered area measured empty. */
/* In rem, because the floor is a READING measure: how narrow a column may get before
   its text stops being prose. Shown in px - what a person can hold against their own
   window. The range is deliberately wider than anything sensible, so both ends can be
   FELT rather than argued about; half-rem steps - fine enough to find an edge, coarse
   enough that the slider does not wander. */
const COL_FLOOR_MIN=12.5, COL_FLOOR_MAX=50, COL_FLOOR_STEP=0.5, COL_FLOOR_DEFAULT=22.5;   // rem
const COL_SEP=".list-sep, .e-catsep, .e-favsep";
const COL_GAP=14;
let colLastN=0;
/* Written from the render pass, which is a long way from here and, since the dealer became a
   module, cannot assign this binding at all. Reading it is unchanged. */
function colSetLastN(n){ colLastN=n; }

/* A rem is 16px only while the root font-size is untouched - browser zoom, an OS text-size
   setting or a user stylesheet all move it. Reading it keeps the floor a READING measure rather
   than a pixel count that quietly means something else on someone else's machine, and it keeps
   the px figure beside the slider honest. */
function remPx(){
  const n=parseFloat(getComputedStyle(document.documentElement).fontSize);
  return (n>0 && isFinite(n)) ? n : 16;
}
function colMode(){ const v=nsGet("Cols"); return (v==="1"||v==="2")?v:"auto"; }
function colFloor(){
  const n=+(nsGet("Floor")||COL_FLOOR_DEFAULT);
  return (n>=COL_FLOOR_MIN && n<=COL_FLOOR_MAX) ? n : COL_FLOOR_DEFAULT;
}
/* Auto asks the reading measure how many fit, so the count follows the window rather than a
   number somebody has to keep right: one column on a laptop, two around 1920, three or four
   on an ultrawide, and never one too narrow to read. */
/* THE WIDTH IS PUBLISHED, NOT MEASURED HERE. Reading it inside render() lands on a list
   that was just rebuilt, so the read forces a full layout of every card - 45ms of a single
   Firefox intent pick, paid twice per render, for a number that changes with the window and
   the docked panel and never with a pick. An observer supplies it after layout, for free;
   this measures only before the first observation. Parent, not list - they agree. */
let colAvailW=0;
function colSetAvailW(w){ colAvailW=w; }        // see the note at colSetLastN
function colBoxWidth(){
  if(colAvailW>0) return colAvailW;
  const box=list && list.parentNode;
  return box ? (box.clientWidth || box.getBoundingClientRect().width || 0) : 0;
}
function colCount(){
  const m=colMode();
  if(m==="1") return 1;
  if(m==="2") return 2;
  const avail=colBoxWidth();
  if(!avail) return 1;
  const px=colFloor()*remPx();
  return Math.max(1, Math.floor((avail+COL_GAP)/(px+COL_GAP)));
}

/* Runs straight after the list is built, from the flat DOM render() just wrote. Nothing has to
   be undone first, which is why there is no unwrap here and no observer anywhere: the list is
   rebuilt from scratch on every change, so this always starts from the plain sequence. */
/* THE DECISION, pure and separate from the DOM: every column bug so far has lived
   here, and a browserless harness can feed it the shapes that are awkward to reach by
   hand (an intent: no separators; a search: exactly one; a category: one plus a trailing
   button). */
function colPlan(kinds,n){
  const out={mode:"none",runs:[],lead:[],trail:[],seps:0,cols:n,band:null};
  if(!kinds||!kinds.length||!(n>1)) return out;
  let lastCard=-1,i;
  for(i=0;i<kinds.length;i++) if(kinds[i]==="card") lastCard=i;
  if(lastCard<0) return out;                      // nothing to place
  let cur=null;
  for(i=0;i<kinds.length;i++){
    if(i>lastCard){ out.trail.push(i); continue; }
    /* THE BAND IS ITS OWN RUN AND NEVER JOINS THE DEAL. It spans the columns instead, so it is
       pulled out here rather than being counted as one more group to hand round. */
    if(kinds[i]==="bandsep"){ cur={band:1,items:[i]}; out.band=cur; }
    else if(kinds[i]==="sep"){ cur={sep:1,items:[i]}; out.runs.push(cur); out.seps++; }
    else if(cur) cur.items.push(i);
    /* A CARD WITH NOTHING ABOVE IT STILL OPENS A RUN. Only non-cards may lead: an intent
       selection produces a list with no separators whatsoever, and treating those cards as
       leading matter left nothing to place. */
    else if(kinds[i]==="card"){ cur={sep:0,items:[i]}; out.runs.push(cur); }
    else out.lead.push(i);
  }
  if(!out.runs.length && !out.band) return out;
  /* Two or more separator-led groups is the only case where keeping a group whole means
     anything. One group would fill the first column and leave the rest empty, so its cards are
     dealt individually instead, which is the condition it exists to satisfy. */
  out.mode = out.seps>=2 ? "groups" : "cards";
  if(out.mode==="cards"){
    /* ONE SEPARATOR WITH CARDS ON BOTH SIDES IS A DIVIDER, NOT A LEAD. A search draws exactly
       one, between the cards that answer and the cards that merely mention; hoisted above the
       columns it read as a heading over all of them. It keeps its place: the cards before it
       are dealt, it spans, the cards after it are dealt beneath. */
    const cards=[], before=[], after=[];
    out.divider=-1;
    for(i=0;i<out.runs.length;i++)
      for(let m=0;m<out.runs[i].items.length;m++){
        const k=out.runs[i].items[m];
        if(kinds[k]==="card"){ cards.push(k); (out.divider<0?before:after).push(k); }
        else if(kinds[k]==="sep" && out.divider<0 && before.length) out.divider=k;
        else out.lead.push(k);
      }
    out.cards=cards; out.before=before; out.after=after;
    if(cards.length<2){ out.mode="none"; }
  }
  return out;
}

export {
  colSetLastN,
  remPx,
  colMode,
  colFloor,
  colSetAvailW,
  colBoxWidth,
  colCount,
  colPlan,
  COL_FLOOR_MIN,
  COL_FLOOR_MAX,
  COL_FLOOR_STEP,
  COL_SEP,
  COL_GAP,
  colLastN,
  colAvailW
};
