import { nextContentLang } from "./content-model.js";
import { cardCommits, cardLang, findCard, parts } from "./card-model.js";
import { fill } from "./intent-text.js";
import { bumpUseCount, copiedToastMsg } from "./list-pointer.js";
import { eCopyFeedback } from "./pops.js";
import { eNoteRecent } from "./recency.js";
import { t, toast } from "./ui-lang.js";
import { copy } from "./mark.js";
import { entrySel, shown } from "./app-state.js";
import { withAgentName } from "./agent.js";
import { withFields, spendFields } from "./field-ask.js";

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
  const id=entrySel.id, at=document.querySelector("#list .txt.sel");
  withFields(ps[vi],m,l,()=>withAgentName(ps[vi],()=>{
    bumpUseCount(id, l);
    copy(fill(ps[vi],m,0,l), copiedToastMsg(m, l, vi, ps.length), cardCommits(m));
    spendFields(ps[vi]);
    eCopyFeedback(id,vi);   // wash the selected block + recency trace, same as a click
  },at),at);
  return true;
}
/** Copy a card's block `vi` in the language it shows, from outside the list: a field question hangs
 *  from `anchor`, and the trace of recent copies is kept as a click would keep it. */
function copyCardPart(id, vi, anchor){
  const m=findCard(id);
  if(!m) return false;
  const l=cardLang(m), ps=parts(m,l);
  if(!ps.length){ toast(t("No {LANG} version for this card").replace("{LANG}",l.toUpperCase())); return true; }
  const k=Math.max(0, Math.min(ps.length-1, vi|0));
  withFields(ps[k],m,l,()=>withAgentName(ps[k],()=>{
    bumpUseCount(m.id, l);
    copy(fill(ps[k],m,0,l), copiedToastMsg(m, l, k, ps.length), cardCommits(m));
    spendFields(ps[k]);
    eNoteRecent(m.id,k);
  },anchor),anchor);
  return true;
}

export {
  copyCardPart,
  copyEntrySel
};
