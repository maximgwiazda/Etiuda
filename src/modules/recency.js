import { cssEsc } from "./css-esc.js";

/* Recency trace. The last three copied cards keep a short green tick (the CSS is in
   template.html), newest strongest. Session-only ON PURPOSE - it is a trace of this shift,
   not a record, so it lives in a variable and dies with the tab. render() re-applies the
   marks. */
var eRecentIds=[];
function eApplyRecency(){
  if(!eRecentIds) return;
  document.querySelectorAll("#list .card[data-erec]").forEach(c=>c.removeAttribute("data-erec"));
  eRecentIds.forEach((id,i)=>{
    const c=list.querySelector('.card[data-id="'+cssEsc(id)+'"]');
    if(c) c.setAttribute("data-erec",String(i+1));
  });
}
function eNoteRecent(id){
  if(!id) return;
  eRecentIds=eRecentIds.filter(x=>x!==id);
  eRecentIds.unshift(id);
  eRecentIds=eRecentIds.slice(0,3);
  eApplyRecency();
}

export {
  eApplyRecency,
  eNoteRecent
};
