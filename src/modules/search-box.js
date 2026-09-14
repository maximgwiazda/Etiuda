/* The search box: what a keystroke does, what the arrows and Enter do with the mark, and
   the two ways out of a query. */
import { flushPillState } from "./pill-state.js";
import { drawIntentRail, railDecorate, railScheduleSort, railSettle } from "./rail-list.js";
import { syncShortcutTitles } from "./shortcuts.js";
import { escapeLadderStep, scheduleTabSave } from "./tabs.js";
import { markEntrySel, navEntry } from "./entry-walk.js";
import { syncIntentClearBtns, syncIntentInput } from "./intent-clear.js";
import { intentEl, $ } from "./dom.js";
import { render } from "./render.js";
import { kbdNav, markSurface, railStep } from "./mark.js";
import { pickIntent } from "./intent-pick.js";

/* Dropping the query is the only "leaving" there is. Selected intents and the category
   filter are untouched; the rail un-sorts and un-greys. */
function clearSearchQuery(){
  if(intentEl) intentEl.value="";
  railSel=-1;
  clearTimeout(railSortT); railSortT=0;
  syncIntentInput();
  syncIntentClearBtns();
  syncShortcutTitles();
  drawIntentRail();
  render();
  flushPillState();
}
/* A keystroke paints NOTHING: rail order, pill row and the card list all land together at
   the settle - one statement about the finished query, nothing redrawn under the typing
   hand. Reaching for the arrows or Enter settles everything at once. */
function queueSearchSettle(){
  railSettled=false;
  railDecorate(false);
  railScheduleSort();
}
/* The caret lives at the end, where letters land. A bare click into the middle snaps
   back; a dragged SELECTION survives, because select-and-retype is a repair this box
   keeps. Deferred a tick: the browser sets the caret after these events fire. */
function pinSearchCaret(){
  if(!intentEl) return;
  const n=intentEl.value.length;
  if(intentEl.selectionStart===intentEl.selectionEnd && intentEl.selectionEnd!==n){
    try{ intentEl.setSelectionRange(n,n); }catch(_){}
  }
}
function wireSearchBox(){
  intentEl.oninput=()=>{
    // The query never alters selected intents; picking is Enter's job.
    intentEl.classList.toggle("set", !!String(intentEl.value||"").trim());
    syncIntentClearBtns();
    entrySel=null; markEntrySel(); railSel=-1; railMarkUsed=false; semiKind=null;
    kbdNav(true);
    queueSearchSettle();
    scheduleTabSave();
  };
  /* A QUERY MEANS "SHOW ME THIS, WHEREVER IT IS", so the category filter drops - it can hide
     every match, and strand you in a category the arrow walk will not even stop at. ARMED here,
     DROPPED at the settle with the cards and the numbers: the bar moving to All while the list
     under it still showed the category was two answers to one question. Only the keystroke that
     STARTS a query arms it - a pill clicked mid-search has to stick - and typing over the whole
     box starts one, since select-all-and-retype is how a second search is made. */
  intentEl.addEventListener("beforeinput",e=>{
    if(!cats.length) return;
    if(e.inputType && e.inputType.indexOf("insert")!==0) return;
    const q=String(intentEl.value||"");
    if(q.trim() && !(intentEl.selectionStart===0 && intentEl.selectionEnd===q.length)) return;
    catsDropArmed=true;
  });
  intentEl.addEventListener("mouseup",()=>setTimeout(pinSearchCaret,0));
  intentEl.addEventListener("focus",()=>setTimeout(pinSearchCaret,0));
  /* The box's own keydown, and stopImmediatePropagation keeps these keys from the document's
     shortcut handlers behind it. Down/Up walk the MATCHES from the mark - an arrow also
     settles a pending resort first, since reaching for the arrows says "I stopped typing".
     Enter takes the marked intent and hands the arrows to the cards; Ctrl+Enter takes it and
     keeps the box for the next name. Nothing marked - Enter releases focus to the cards. */
  intentEl.addEventListener("keydown",e=>{
    if(e.altKey || e.metaKey) return;
    // The box's door onto the escape ladder.
    if(e.key==="Escape"){ e.preventDefault(); e.stopImmediatePropagation(); escapeLadderStep(); return; }
    /* THE BOX HAS NO CARET KEYS - a query is a probe, not a document, so ←/→ steer the
       categories from inside it exactly as they do from outside, and focus stops mattering
       to the arrows at all. Repair is the clear button, Esc, or Ctrl+A and retyping. The
       modified variants are RESERVED, not free: Shift may yet mean something here, and Ctrl
       already means "several" on the pills themselves - so both fall dead, and Home/End die
       with the caret they served. */
    if(e.key==="ArrowLeft"||e.key==="ArrowRight"){
      e.preventDefault(); e.stopImmediatePropagation();
      if(e.ctrlKey) return;                       // still reserved
      if(e.shiftKey){ runShortcut(e.key==="ArrowRight"?"navPillLast":"navPillFirst"); return; }
      runShortcut(e.key==="ArrowRight"?"navPillRight":"navPillLeft");
      return;
    }
    if(e.key==="Home"||e.key==="End"){ e.preventDefault(); e.stopImmediatePropagation(); return; }
    const q=String(intentEl.value||"").trim();
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){
      if(e.ctrlKey) { e.preventDefault(); e.stopImmediatePropagation(); return; }   // reserved
      if(e.shiftKey){
        e.preventDefault(); e.stopImmediatePropagation();
        if(railSortT) railSettle();
        runShortcut(e.key==="ArrowDown"?"markBottom":"markTop");
        return;
      }
      /* By markSurface, not semiKind alone - the surface test the decorator paints by. A
         card mark can outlive its claim (plain pick, then refocus): still walkable here. */
      if(markSurface()==="card"){
        e.preventDefault(); e.stopImmediatePropagation();
        kbdNav(true);
        navEntry(e.key==="ArrowDown"?1:-1);
        return;
      }
      if(!q && semiKind!=="intent") return;
      e.preventDefault(); e.stopImmediatePropagation();
      kbdNav(true);
      if(railSortT) railSettle();
      /* An empty intent surface hands the arrows to the cards rather than eating them - a
         query can match no intent at all, and the cards are then the only answer there is. */
      if(!railOrder.length){ semiKind="card"; navEntry(e.key==="ArrowDown"?1:-1); return; }
      semiKind="intent";
      railMarkUsed=false;
      if(entrySel){ entrySel=null; markEntrySel(); }
      const n=railOrder.length;
      const step=e.key==="ArrowDown"?1:-1;
      const from = railSel>=0 ? railSel : (railMarkIdx>=0?railOrder.indexOf(railMarkIdx):-1);
      const to = railStep(from<0 ? (step>0?-1:n) : from, step);
      if(to<0){ semiKind="card"; navEntry(step); return; }   // every row is picked: the cards are the only answer
      railSel=to;
      railDecorate(true);
      return;
    }
    if(e.key==="Enter"){
      if(!q && semiKind!=="intent") return;
      e.preventDefault(); e.stopImmediatePropagation();
      kbdNav(true);
      if(railSortT) railSettle();       // Enter takes what the settle marks, never a stale best
      const idx = railSel>=0 && railSel<railOrder.length ? railOrder[railSel] : railMarkIdx;
      if(idx<0 || (railMarkUsed && railSel<0)){ try{ intentEl.blur(); }catch(_){} return; }
      /* Inside a run a plain Enter still ADDS, then closes the run by hand - the copy
         shortcut is Enter's alter ego and mirrors this; see runShortcut. */
      const run = !e.ctrlKey && pickRun && intentIdxs.length>0;
      pickIntent(idx, !!e.ctrlKey || run);   // clears the query - the pick reveals the full view
      if(run){ railMarkUsed=true; semiKind=null; pickRun=false; }
      railSel=-1;
      if(!e.ctrlKey){ try{ intentEl.blur(); }catch(_){} }
      return;
    }
  });
  const intentClearBtn=$("#intentClear");
  if(intentClearBtn){
    intentClearBtn.onclick=e=>{
      e.preventDefault(); e.stopPropagation();
      /* Erase only - the intents' own exits are Esc and the rail. The button greys while
         the box is empty, and spaces count as content, erased rather than ignored. */
      clearSearchQuery();   // the same leaving as Esc, so the rail un-sorts and un-greys with the box
      try{ intentEl.focus(); }catch(_){}
    };
  }
}

export {
  clearSearchQuery,
  wireSearchBox
};
