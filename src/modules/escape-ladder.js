/* The first rung of Escape, and the question it asks. The ladder that climbs it is in
   tabs.js, beside the second rung. */
import { clearSearchQuery } from "./search-box.js";
import { toast } from "./ui-lang.js";
import { intentEl } from "./dom.js";
import { clearIntents } from "./intent-pick.js";

// Keep the header box showing whatever {INTENT} currently resolves to.
function intentIsSet(){
  // Clear buttons stay inactive on bare mode switch (/) until there is real content
  return intentIdxs.length>0
    || !!(intentText&&String(intentText).trim())
    /* .length on the visible box, while intentText stays trimmed: intentText is a
       resolved value, but the BOX is what the user is looking at, and spaces in it are
       characters they typed and can see. Trimming here disabled the × and made Escape a
       no-op on a field that was plainly not empty. */
    || !!(intentEl&&String(intentEl.value||"").length);
}
// Esc from INTENT box: leave search mode, wipe query, cancel all intents
/* Escape sheds ONE thing per press. It used to be nuclear - mode, query AND intents
   in one press, so recovering from a mis-typed mode cost the intents. Two steps now:
     1. in macro search -> leave it, intents survive
     2. otherwise      -> clear the intents (clearIntents owns that, and its toast)
   Returns false when there was nothing left to shed, so callers can fall through. */
function intentEscapeStep(){
  /* Escape also LEAVES the box: whatever else this press sheds, focus returns to the
     page so ←/→ resume walking the categories at once - the box holding on made the
     arrows dead exactly when you had just said "never mind" and reached for them. */
  if(typeof intentEl!=="undefined" && intentEl && document.activeElement===intentEl) intentEl.blur();
  if(String((intentEl&&intentEl.value)||"").trim()){
    clearSearchQuery();
    toast("Search cleared");
    return true;
  }
  /* intentIsSet answers false while searching, so ask the selection directly */
  if(intentIdxs.length || intentText){
    return clearIntents();
  }
  return false;
}

export {
  intentIsSet,
  intentEscapeStep
};
