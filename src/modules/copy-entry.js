import { nextContentLang } from "./content-model.js";
import { cardCommits, cardLang, findCard, parts } from "./card-model.js";
import { fill } from "./intent-text.js";
import { bumpUseCount, copiedToastMsg } from "./list-pointer.js";
import { eCopyFeedback } from "./pops.js";
import { eNoteRecent } from "./recency.js";
import { t, toast, uiLang } from "./ui-lang.js";
import { copy } from "./mark.js";
import { entrySel, shown } from "./app-state.js";
import { withAgentName } from "./agent.js";
import { eHost, eHotkey } from "./host.js";
import { nsGet, nsSet } from "./storage.js";

function manualToastMsg(m, l, vi, total){
  if(nsGet("PickerHint") !== "1"){
    const h = eHost(), hk = eHotkey();
    if(h && typeof h.openPicker === "function" && hk && hk.held){
      nsSet("PickerHint", "1");
      return uiLang() === "pl"
        ? "Skopiowano. Następnym razem Ctrl+Shift+Spacja otworzy odpowiedzi nad dowolnym oknem i wklei wybraną."
        : "Copied. Next time, Ctrl+Shift+Space opens the replies over any window and pastes the one chosen.";
    }
  }
  return copiedToastMsg(m, l, vi, total);
}

/** Copy the focused block (or other language at the same part index). */
function copyEntrySel(otherLang){
  if(!entrySel) return false;
  const m=findCard(entrySel.id)||shown.find(x=>x&&x.id===entrySel.id);
  if(!m) return false;
  /* The pinned language is what is on screen, so it is what a copy means - and what the
     other-language shortcut flips away from. */
  const shown_l=cardLang(m);
  const l=otherLang?nextContentLang(shown_l):shown_l;
  const ps=parts(m,l);
  if(!ps.length){ toast(t("No {LANG} version for this card").replace("{LANG}",l.toUpperCase())); return true; }
  const vi=Math.max(0, Math.min(ps.length-1, entrySel.vi|0));
  const id=entrySel.id;
  withAgentName(ps[vi],()=>{
    copy(fill(ps[vi],m,0,l), manualToastMsg(m, l, vi, ps.length), cardCommits(m));
    bumpUseCount(id, l, vi);
    eCopyFeedback(id,vi);   // wash the selected block + recency trace, same as a click
  },document.querySelector("#list .txt.sel"));
  return true;
}
/** Copy a card's block `vi` in the language it shows, or with `other` the next one, from outside the
 *  list: the question for the agent's name hangs from `anchor`, and the trace of recent copies is
 *  kept as a click would. */
function copyCardPart(id, vi, anchor, other){
  const m=findCard(id);
  if(!m) return false;
  const l=other ? nextContentLang(cardLang(m)) : cardLang(m), ps=parts(m,l);
  if(!ps.length){ toast(t("No {LANG} version for this card").replace("{LANG}",l.toUpperCase())); return true; }
  const k=Math.max(0, Math.min(ps.length-1, vi|0));
  withAgentName(ps[k],()=>{
    // The copy is made before the step, which the lanes and the action button answer with motion.
    copy(fill(ps[k],m,0,l), manualToastMsg(m, l, k, ps.length), cardCommits(m));
    bumpUseCount(m.id, l, k);
    eNoteRecent(m.id,k);
  },anchor);
  return true;
}

export {
  copyCardPart,
  copyEntrySel
};
