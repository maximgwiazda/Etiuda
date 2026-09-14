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
function wireColWidthWatch(){
  /* Where colAvailW comes from. Reading inside the callback is free - the observer fires
     after layout - and it also catches the widths a resize never reports: the panel docking,
     its drag, the shell's own animation. Re-deals only when the COUNT changes, so a render
     here cannot feed itself: dealing changes the list's height, never the box's width. */
  if(typeof ResizeObserver==="function" && list && list.parentNode){
    new ResizeObserver(()=>{
      const w=list.parentNode.clientWidth||0;
      if(w===colAvailW) return;
      colSetAvailW(w);
      if(colCount()!==colLastN) requestAnimationFrame(()=>render());
    }).observe(list.parentNode);
  }
}

/* Auto reads the available width, so a resized window can want a different count. Re-render
   rather than re-shuffle: render() is the only thing that knows the flat order. */
let colResizeT=null;
function wireColResize(){
  addEventListener("resize",()=>{
    clearTimeout(colResizeT);
    colResizeT=setTimeout(()=>{ if(colCount()!==colLastN) render(); },160);
  });
}

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
/* The FIRST render precedes layout, so the list measures zero wide, Auto resolves to
   one column, and nothing happens until the next redraw - wait a frame and ask again.
   Bounded: a genuinely zero-wide list (a hidden tab) would otherwise re-ask forever. */
let colTries=0;
function applyCardColumns(){
  if(!list) return;
  list.classList.remove("cols");
  list.style.removeProperty("--col-n");
  list.style.removeProperty("grid-template-rows");
  if(colMode()==="auto" && !colBoxWidth() && colTries<6){
    colTries++;
    requestAnimationFrame(applyCardColumns);
    return;
  }
  colTries=0;
  let n=colCount();
  colSetLastN(n);                    // what the WIDTH allows, which is what a resize compares
  if(n<2) return;

  /* THE FLAT ORDER, stamped before a single node moves: dealing puts the DOM into
     column order, so querySelectorAll no longer returns cards in the order the list
     means. Everything that walks the list in sequence reads this instead. */
  let ord=0;
  list.querySelectorAll(".card[data-id]").forEach(c=>{ c.dataset.ord=ord++; });

  const kids=[].slice.call(list.children);
  if(!kids.length) return;

  /* THE RESTRUCTURING HAPPENS OFF THE PAGE: attached, every node move invalidates style
     on a live list (160 of a 200ms render); detached, it is bookkeeping and one reflow on
     return. The list is put back before anything MEASURES it - a detached element has no
     geometry. */
  const _parent=list.parentNode, _next=list.nextSibling;
  if(_parent) _parent.removeChild(list);

  /* .e-span marks a SEMI-GROUP - a lifted set, not a shelf. Only the intent band wears it
     and spans the columns: it is an answer, not a home, and dealing an answer into one column
     buries it. The favourites block is a shelf like any category and is dealt with them. */
  const kinds=kids.map(el=>el.matches(".e-span") ? "bandsep"
                        : el.matches(COL_SEP) ? "sep"
                        : el.classList.contains("card") ? "card" : "other");
  const plan=colPlan(kinds,n);
  /* Put the list back before leaving: every exit between the detach and the reattach has to,
     or the card list simply stops existing. */
  if(plan.mode==="none" && !plan.band){ if(_parent) _parent.insertBefore(list,_next); return; }
  /* THE WIDTH SAYS HOW MANY FIT; THE PLAN SAYS HOW MANY THERE ARE. Asking only the width gave
     three columns to two things and left one empty, with both cards a third of the list wide
     for no reason - and a group is dealt whole, so two groups can never fill three columns
     however wide the window is. The band shares the columns, so it speaks for itself. ACROSS A
     DIVIDER each side is dealt from the first column on its own, so the wider side is what
     there is: counting both sides gave four columns to two and two, and filled two. */
  const _units = plan.mode==="groups" ? plan.runs.length
               : plan.divider>=0 ? Math.max(plan.before.length, plan.after.length)
               : (plan.cards||[]).length;
  const _band = plan.band ? plan.band.items.filter(i=>kinds[i]==="card").length : 0;
  n=Math.max(1,Math.min(n,Math.max(_units,_band)));
  if(n<2){ if(_parent) _parent.insertBefore(list,_next); return; }

  /* The band first and full width, with its own columns inside. Its heading spans those. */
  const boxes=[];
  const anchor=plan.trail.length?kids[plan.trail[0]]:null;
  for(let i=0;i<n;i++){
    const c=document.createElement("div");
    c.className="col";
    if(anchor) list.insertBefore(c,anchor); else list.appendChild(c);
    boxes.push(c);
  }

  /* THE BAND SHARES THE COLUMNS rather than sitting in a box of its own: a box is as
     tall as its TALLEST inner column, so the shorter band columns left dead space and
     every category below began at that line. Sharing means each column's categories start
     where its band cards ended; the heading still spans - it describes all of them. */
  let bandSepEl=null, bandShown=0;
  if(plan.band){
    const bandCards=[];
    for(let m=0;m<plan.band.items.length;m++){
      const el=kids[plan.band.items[m]];
      if(el.classList.contains("card")) bandCards.push(el);
      else { bandSepEl=el; list.insertBefore(el, boxes[0]); }
    }
    for(let m=0;m<bandCards.length;m++) boxes[m%n].appendChild(bandCards[m]);
    bandShown=bandCards.length;
    /* The heading's PLACEMENT waits until the end of this function: it measures the
       heading, and the top margin is only zeroed by a rule that needs it to be the list's
       first child - which it is not yet, with everything undealt still in front of it. */
  }

  if(plan.mode==="groups"){
    for(let i=0;i<plan.runs.length;i++){
      const g=document.createElement("div");
      g.className="cgroup";
      for(let m=0;m<plan.runs[i].items.length;m++) g.appendChild(kids[plan.runs[i].items[m]]);
      boxes[i%n].appendChild(g);
    }
  }else{
    /* Whatever is not a card - a lone category's separator, a spelling note - sits above the
       columns and spans them. */
    for(let i=0;i<plan.lead.length;i++) list.insertBefore(kids[plan.lead[i]],boxes[0]);
    if(plan.divider>=0){
      for(let i=0;i<plan.before.length;i++) boxes[i%n].appendChild(kids[plan.before[i]]);
      const div=kids[plan.divider];   // spans by the grid's own rule for anything that is not a column
      if(anchor) list.insertBefore(div,anchor); else list.appendChild(div);
      const below=[];
      for(let i=0;i<n;i++){
        const c=document.createElement("div");
        c.className="col";
        if(anchor) list.insertBefore(c,anchor); else list.appendChild(c);
        below.push(c);
      }
      for(let i=0;i<plan.after.length;i++) below[i%n].appendChild(kids[plan.after[i]]);
    }else{
      for(let i=0;i<plan.cards.length;i++) boxes[i%n].appendChild(kids[plan.cards[i]]);
    }
  }

  list.style.setProperty("--col-n",n);
  list.classList.add("cols");
  if(_parent) _parent.insertBefore(list,_next);   // back on the page, one reflow, before measuring

  /* THE HEADING'S PLACEMENT, last of all - once everything is dealt it is genuinely the
     first child and the grid is on, so what is measured is what paints. A heading spans
     ONLY the columns its cards fill; the columns past it span both rows and start level
     with it. k comes from the GROUP'S size, not the rendered count - a collapsed band
     renders none and must not claim the width. ROW ONE IS PINNED IN PIXELS: a spanning
     item contributes its intrinsic size to every track it covers, and min-content let a
     column of cards grow row one thousands of px tall. Safe to measure:
     align-items:start never stretches an item by its track. */
  if(bandSepEl){
    const badgeEl=bandSepEl.querySelector(".sep-n");
    const badge=badgeEl ? parseInt(badgeEl.textContent,10) : NaN;
    const total=isFinite(badge) ? badge : bandShown;
    const k=Math.min(Math.max(bandShown,total),n);
    if(k>0 && k<n){
      bandSepEl.style.gridColumn="1 / span "+k;
      bandSepEl.style.gridRow="1";
      for(let i=0;i<n;i++){
        boxes[i].style.gridColumn=String(i+1);
        boxes[i].style.gridRow = (i<k) ? "2" : "1 / span 2";
      }
      const sc=getComputedStyle(bandSepEl);
      const h=bandSepEl.getBoundingClientRect().height
             +(parseFloat(sc.marginTop)||0)+(parseFloat(sc.marginBottom)||0);
      list.style.gridTemplateRows=Math.ceil(h)+"px auto";
    }
  }
}

export {
  colSetLastN,
  remPx,
  colMode,
  colFloor,
  colSetAvailW,
  wireColWidthWatch,
  wireColResize,
  colBoxWidth,
  colCount,
  colPlan,
  applyCardColumns,
  COL_FLOOR_MIN,
  COL_FLOOR_MAX,
  COL_FLOOR_STEP,
  COL_SEP,
  COL_GAP,
  colLastN,
  colAvailW
};
