import { intentIsSet } from "./escape-ladder.js";
import { captureCards, flipPills, flipCards, paintIntentRings, paintRailSelection, schedulePickTail } from "./paint.js";
import { $, intentEl } from "./dom.js";
import { captureRail, drawIntentRail, flipRail, railDecorate } from "./rail-list.js";
import { syncIntentInput } from "./intent-clear.js";
import { drawPills, scheduleTabSave } from "./tabs.js";
import { scrollPageTop } from "./page-scroll.js";
import { toast } from "./ui-lang.js";
import { markEntrySel } from "./entry-walk.js";
import { syncRailLayout } from "./rail-panel.js";
import { capturePills } from "./pills-bar.js";
import { setIntentIdxs, setIntentText, setRailSel, setRailMarkUsed, setPickRun, setSemiKind, entrySel, putEntrySel, intentIdxs, setCats, setPendingScrollHit, pickRun, railOrder, setRailMarkIdx } from "./app-state.js";
import { hooks } from "./hooks.js";
// Picking an intent and clearing the set: the two acts that reach the panel, the pills and the
// whole render at once, and the panel's own repaint when the dock threshold moves.

function clearIntents(){
  if(!intentIsSet()) return false;
  const pillsBefore=capturePills();   // bands collapse back to catOrder - animate the move
  const cardsBefore=captureCards();
  /* The list goes to its top before the capture, as a settled query does: the order it returns
     to begins there, and the glide is judged against the window the user will see. */
  const railBox=$("#intentRailList"); if(railBox) railBox.scrollTop=0;
  const railBefore=captureRail();     // panel returns to its dragged order
  setIntentIdxs([]); setIntentText("");
  setRailSel(-1); setRailMarkUsed(false); setPickRun(false);   // the selection goes and the offer re-opens; the QUERY stays
  syncIntentInput();
  drawPills();
  flipPills(pillsBefore);
  drawIntentRail();
  flipRail(railBefore);
  hooks.render();
  flipCards(cardsBefore);
  /* THE SAME ARRIVAL AS THE PICK, in reverse: the list re-sorts back to its resting order
     under a viewport parked wherever the intent's answer was, and that order begins at the
     top. The other two ways out of a selection do this too. */
  scrollPageTop();
  scheduleTabSave();
  toast("{INTENT} cleared");
  return true;
}

// ---- picking an intent: it reaches the rail, the pills and the whole render, so it stays here ----
// multi=true (ctrl held) toggles the clause in the set; otherwise it replaces it
function pickIntent(idx,multi){
  // A plain pick consumes the semi-selection and ends any run; Ctrl means "and more".
  if(!multi){ setRailMarkUsed(true); setSemiKind(null); setPickRun(false); }
  /* "And more" must be a CLAIM, not a leftover: the typed flow arrives surfaceless, and
     the card mark a render would then plant takes the arrows with it (markSurface reads a
     bare entrySel as card). Claimed the way railHoverClaim claims, so the rail walks on. */
  else{ setPickRun(true); setSemiKind("intent"); setRailMarkUsed(false);
        if(entrySel){ putEntrySel(null); markEntrySel(); } }
  const pillsBefore=capturePills();   // pills regroup into bands below - animate the move
  const cardsBefore=captureCards();   // cards re-sort too; guards inside decide if it animates
  const railBefore=captureRail();     // chosen intents rise to the top of the panel
  if(multi){
    const at=intentIdxs.indexOf(idx);
    // Preserve pick order for {INTENT} and comment {ACTION}/{TOPIC} (no re-sort)
    if(at>-1) intentIdxs.splice(at,1); else intentIdxs.push(idx);
  } else {
    setIntentIdxs([idx]);
  }
  setIntentText("");
  /* CATEGORY FILTER AND QUERY BOTH DROP - an intent's cards span categories, and both
     filters hide what was just asked for: the pick's meaning is "show me this intent's
     full view". A query that survives the pick shows a filtered sliver of the linked
     cards, which stings more than the lost text. */
  if(intentIdxs.length){
    setCats([]);
    if(intentEl && intentEl.value){ intentEl.value=""; setRailSel(-1); }
  }
  // Scroll to linked cards when the list already shows them (All, or the right cat).
  setPendingScrollHit(!!intentIdxs.length);
  syncIntentInput();
  /* THE ANSWER IN THIS FRAME, THE WORK IN THE NEXT, AND THE ANIMATIONS AFTER IT. The rings
     and the box are the click's receipt and cost 2ms, so they land immediately. Everything
     expensive is scheduled - and the three flips go WITH it, after the rebuild rather than
     before, because a transition started on this side of a 100ms rebuild spends its middle
     on a blocked thread and arrives looking like a jump. On the far side the thread is free
     and they play whole. The captures are still valid: nothing between the two frames moves
     a pill, a row or a card. */
  paintIntentRings(); paintRailSelection();
  schedulePickTail(()=>{
    drawPills(); drawIntentRail();
    if(multi && pickRun){
      // The resting mark for the next pick: the first unpicked row of the fresh order.
      let nm=-1;
      for(let i=0;i<railOrder.length;i++){ if(intentIdxs.indexOf(railOrder[i])<0){ nm=railOrder[i]; break; } }
      setRailMarkIdx(nm>=0 ? nm : (railOrder.length?railOrder[0]:-1));
      setRailSel(-1);
      railDecorate(true);
    }
    flipPills(pillsBefore);
    // The rows just selected must animate however far they came - see flipRail().
    return flipRail(railBefore,new Set(intentIdxs.map(String)));
  },()=>{ hooks.render(); flipCards(cardsBefore);
           // unpicking the last one is a clear - see clearIntents()
           if(!intentIdxs.length) scrollPageTop(); });
  scheduleTabSave();
}

// ---- the panel's repaint after a dock change: it reaches the rail's list and the whole
// render, so it stays here ----
/* Named, so rebuildRailMQ can move it to the new query. An anonymous listener could be added but
   never removed, and every resize would leave another one behind. */
function onRailMQChange(){
  syncRailLayout();
  drawIntentRail();
  hooks.render();
}
export {
  pickIntent,
  onRailMQChange,
  clearIntents,
};
