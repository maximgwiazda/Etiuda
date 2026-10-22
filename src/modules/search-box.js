/* The search box: what a keystroke does, what the arrows and Enter do with the mark, and
   the two ways out of a query. */
import { flushPillState } from "./pill-state.js";
import { drawIntentRail, railDecorate, railScheduleSort, railSettle } from "./rail-list.js";
import { syncShortcutTitles } from "./shortcuts.js";
import { escapeLadderStep, scheduleTabSave, escapeHeld } from "./tabs.js";
import { markEntrySel, navEntry } from "./entry-walk.js";
import { syncIntentClearBtns, syncIntentInput } from "./intent-clear.js";
import { intentEl, $ } from "./dom.js";
import { render } from "./render.js";
import { kbdNav, markSurface, railStep } from "./mark.js";
import { pickIntent } from "./intent-pick.js";
import { copyEntrySel } from "./copy-entry.js";
import { t } from "./ui-lang.js";
import { setRailSel, railSortT, setRailSortT, setRailSettled, putEntrySel, setRailMarkUsed, setSemiKind, cats, setCatsDropArmed, semiKind, railOrder, entrySel, railSel, railMarkIdx, railMarkUsed, pickRun, intentIdxs, setPickRun } from "./app-state.js";
import { hooks } from "./hooks.js";

function updateIntentPlaceholder(){
  if(!intentEl) return;
  intentEl.placeholder=t("search intents and cards");
  const ph=$("#intentPh");
  if(ph) ph.innerHTML=t("search intents and cards · <kbd>Enter</kbd> selects the marked intent · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> for several");
}

/* Dropping the query is the only "leaving" there is. Selected intents and the category
   filter are untouched; the rail un-sorts and un-greys. */
function clearSearchQuery(){
  if(intentEl) intentEl.value="";
  setRailSel(-1);
  clearTimeout(railSortT); setRailSortT(0);
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
  setRailSettled(false);
  railDecorate(false);
  railScheduleSort();
}
function wireSearchBox(){
  intentEl.oninput=()=>{
    // The query never alters selected intents; picking is Enter's job.
    intentEl.classList.toggle("set", !!String(intentEl.value||"").trim());
    syncIntentClearBtns();
    putEntrySel(null); markEntrySel(); setRailSel(-1); setRailMarkUsed(false); setSemiKind(null);
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
    setCatsDropArmed(true);
  });
  /* The box's own keydown, and stopImmediatePropagation keeps these keys from the document's
     shortcut handlers behind it. Down/Up walk the MATCHES from the mark - an arrow also
     settles a pending resort first, since reaching for the arrows says "I stopped typing".
     Enter takes the marked intent and hands the arrows to the cards; Ctrl+Enter takes it and
     keeps the box for the next name. Nothing marked - Enter releases focus to the cards. */
  intentEl.addEventListener("keydown",e=>{
    if(e.altKey || e.metaKey) return;
    // The box's door onto the escape ladder.
    if(e.key==="Escape"){ e.preventDefault(); e.stopImmediatePropagation(); escapeHeld(e.repeat); escapeLadderStep(); escapeHeld(false); return; }
    /* Caret keys move inside a query; category navigation happens only at the matching edge
       or when the box is empty. Home and End move the caret natively. */
    if(e.key==="ArrowLeft"||e.key==="ArrowRight"){
      const v=intentEl.value||"";
      const atEdge=!v || (e.key==="ArrowLeft"
        ? (intentEl.selectionStart===0 && intentEl.selectionEnd===0)
        : (intentEl.selectionStart===v.length && intentEl.selectionEnd===v.length));
      if(atEdge){
        e.preventDefault(); e.stopImmediatePropagation();
        if(e.ctrlKey) return;                       // still reserved
        if(e.shiftKey){ hooks.runShortcut(e.key==="ArrowRight"?"navPillLast":"navPillFirst"); return; }
        hooks.runShortcut(e.key==="ArrowRight"?"navPillRight":"navPillLeft");
        return;
      }
    }
    const q=String(intentEl.value||"").trim();
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){
      if(e.ctrlKey) { e.preventDefault(); e.stopImmediatePropagation(); return; }   // reserved
      if(e.shiftKey){
        e.preventDefault(); e.stopImmediatePropagation();
        if(railSortT) railSettle();
        hooks.runShortcut(e.key==="ArrowDown"?"markBottom":"markTop");
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
      if(!railOrder.length){ setSemiKind("card"); navEntry(e.key==="ArrowDown"?1:-1); return; }
      setSemiKind("intent");
      setRailMarkUsed(false);
      if(entrySel){ putEntrySel(null); markEntrySel(); }
      const n=railOrder.length;
      const step=e.key==="ArrowDown"?1:-1;
      const from = railSel>=0 ? railSel : (railMarkIdx>=0?railOrder.indexOf(railMarkIdx):-1);
      const to = railStep(from<0 ? (step>0?-1:n) : from, step);
      if(to<0){ setSemiKind("card"); navEntry(step); return; }   // every row is picked: the cards are the only answer
      setRailSel(to);
      railDecorate(true);
      return;
    }
    /* CTRL+C COPIES THE MARKED REPLY from here too, where the arrows walk the cards; a selection in the box keeps the
       key's own meaning, and so does a box with no reply marked. */
    if(e.ctrlKey && !e.shiftKey && (e.code==="KeyC" || e.key==="c" || e.key==="C") && entrySel && markSurface()==="card"
       && intentEl.selectionStart===intentEl.selectionEnd){
      e.preventDefault(); e.stopImmediatePropagation();
      kbdNav(true);
      try{ intentEl.blur(); }catch(_){}
      copyEntrySel(false);
      return;
    }
    if(e.key==="Enter"){
      /* A card mark is copied, as Enter and Shift+Enter copy it anywhere else: the arrows above
         walk the cards from here, so the key that takes what they marked must work here too. */
      if(!e.ctrlKey && markSurface()==="card" && entrySel){
        e.preventDefault(); e.stopImmediatePropagation();
        kbdNav(true);
        try{ intentEl.blur(); }catch(_){}
        copyEntrySel(e.shiftKey);
        return;
      }
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
      if(run){ setRailMarkUsed(true); setSemiKind(null); setPickRun(false); }
      setRailSel(-1);
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
  updateIntentPlaceholder,
  clearSearchQuery,
  wireSearchBox
};
