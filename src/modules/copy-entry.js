import { cardLang, findCard, parts } from "./card-model.js";
import { fill } from "./intent-text.js";
import { bumpUseCount, copiedToastMsg } from "./list-pointer.js";
import { eCopyFeedback } from "./pops.js";
import { t, toast } from "./ui-lang.js";
import { copy } from "./mark.js";
import { entrySel, shown } from "./app-state.js";

/** Copy the focused block (or other language at the same part index). */
function copyEntrySel(otherLang){
  if(!entrySel) return false;
  const m=findCard(entrySel.id)||shown.find(x=>x&&x.id===entrySel.id);
  if(!m) return false;
  /* The pinned language is what is on screen, so it is what a copy means - and what the
     other-language shortcut flips away from. */
  const shown_l=cardLang(m);
  const l=otherLang?(shown_l==="en"?"pl":"en"):shown_l;
  const ps=parts(m,l);
  if(!ps.length){ toast(t("No {LANG} version for this card").replace("{LANG}",l.toUpperCase())); return true; }
  const vi=Math.max(0, Math.min(ps.length-1, entrySel.vi|0));
  bumpUseCount(entrySel.id, l);
  copy(fill(ps[vi],m,0,l), copiedToastMsg(m, l, vi, ps.length));
  eCopyFeedback(entrySel.id);   // wash the selected block + recency trace, same as a click
  return true;
}

export {
  copyEntrySel
};
