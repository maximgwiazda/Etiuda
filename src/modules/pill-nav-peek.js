import { scheduleRailGeometry } from "./rail-panel.js";
import { cssEsc } from "./css-esc.js";

/* Arrowing to a category you cannot see: opens the clipped bar while you keep arrowing,
   then lets it retract. It cannot reuse `pills-expand` - updateModifierPeek re-asserts
   that class from modifier state on every keydown/keyup, so the next keystroke would
   strip it; a separate class sharing the same CSS keeps two mechanisms off one flag.
   Only when it would help: the bar must be clipped (never shoved at a user who hid it on
   purpose) and the destination genuinely below the fold. Once open, later presses skip
   the test and re-arm the timer - by then everything IS visible and the test would let
   it shut mid-cycle. */
let pillNavPeekTimer=0;
const PILL_PEEK_MS=1700;
function endPillNavPeek(){
  const slot=pillsSlot();
  clearTimeout(pillNavPeekTimer); pillNavPeekTimer=0;
  if(slot && slot.classList.contains("pills-navpeek")){
    slot.classList.remove("pills-navpeek");
    scheduleRailGeometry();
  }
}
function peekPillsForKey(key){
  const slot=pillsSlot();
  if(!slot || !slot.classList.contains("pills-overflow")) return;   // nothing is being clipped
  if(slot.classList.contains("pills-expand")) return;               // Ctrl already holds it open
  if(!slot.classList.contains("pills-navpeek")){
    const el=pills && pills.querySelector('.pill[data-k="'+cssEsc(key||"")+'"]');
    if(!el) return;
    // Below the clipped edge? Then it is the reason you cannot see where you just moved.
    if(el.getBoundingClientRect().bottom <= slot.getBoundingClientRect().bottom + 1) return;
    slot.classList.add("pills-navpeek");
    scheduleRailGeometry();
  }
  clearTimeout(pillNavPeekTimer);
  pillNavPeekTimer=setTimeout(endPillNavPeek, PILL_PEEK_MS);
}

export {
  endPillNavPeek,
  peekPillsForKey
};
