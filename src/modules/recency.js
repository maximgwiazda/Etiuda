import { cssEsc } from "./css-esc.js";
import { list } from "./dom.js";

/* Recency trace. The last three copied macros keep a short green spine (the CSS is in
   template.html), newest strongest; a macro is a card's block, so a card's other blocks keep
   their own hue. Session-only ON PURPOSE - it is a trace of this shift, not a record, so it
   lives in a variable and dies with the tab. render() re-applies the marks. */
var eRecent=[];
function eApplyRecency(){
  if(!list) return;
  list.querySelectorAll(".txt[data-erec]").forEach(b=>b.removeAttribute("data-erec"));
  eRecent.forEach((r,i)=>{
    const b=list.querySelector('.card[data-id="'+cssEsc(r.id)+'"] .txt[data-v="'+r.vi+'"]');
    if(b) b.setAttribute("data-erec",String(i+1));
  });
}
function eForgetRecency(){ eRecent=[]; }
/* The block copied last by any route, {id,vi}, or null: what the picker's repeat copies again. */
function eLastRecent(){ return eRecent[0]||null; }
function eNoteRecent(id,vi){
  if(!id) return;
  vi=vi|0;
  eRecent=eRecent.filter(r=>r.id!==id||r.vi!==vi);
  eRecent.unshift({id,vi});
  eRecent=eRecent.slice(0,3);
  eApplyRecency();
}
/* A block dragged within its card carries its trace with it: the entries are renumbered the way
   the splice renumbers the blocks, before the list is drawn again. */
function eMoveRecent(id,from,to){
  eRecent.forEach(r=>{
    if(r.id!==id) return;
    if(r.vi===from) r.vi=to;
    else if(from<to && r.vi>from && r.vi<=to) r.vi--;
    else if(from>to && r.vi>=to && r.vi<from) r.vi++;
  });
}

export {
  eApplyRecency,
  eMoveRecent,
  eNoteRecent,
  eForgetRecency,
  eLastRecent
};
