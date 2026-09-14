import { findCard, noteFor, cardTitle } from "./card-model.js";
import { esc } from "./esc.js";
import { tourArrowRoute, drawTourArrow } from "./tour.js";
// The note beside a card: a callout placed by the tour's rules, and the hover that opens it.

/* THE NOTE IS A CALLOUT, NOT A BOX ON THE CARD: the tour's card, placed by the tour's rules
   with the whole card as the spotlight and never over it, and the tour's arrow landing on the
   card's edge. It closes on anything that moves the ground under it - a click elsewhere, Esc,
   a scroll, a resize, a render - so it can never be stale. */
let notePaneEl=null, noteArrowEl=null, notePaneBtn=null;
function notePaneOpen(){ return !!notePaneEl; }
function closeNotePane(){
  if(notePaneEl){ notePaneEl.remove(); notePaneEl=null; }
  if(noteArrowEl){ noteArrowEl.remove(); noteArrowEl=null; }
  if(notePaneBtn){ notePaneBtn.setAttribute("aria-expanded","false"); notePaneBtn=null; }
}
function toggleNotePane(btn, id){
  if(notePaneBtn===btn){ closeNotePane(); return; }
  openNotePane(btn.closest(".card"), id, btn);
}
function openNotePane(card, id, btn){
  closeNotePane();
  const m=findCard(id), note=m&&noteFor(m);
  if(!card||!note) return;
  const pane=document.createElement("div");
  pane.className="tour-card note-pane"; pane.id="notePane"; pane.setAttribute("role","note");
  // A token named in a note wears the chip the macro gives it, not its braces.
  pane.innerHTML='<h3>'+esc(cardTitle(m))+'</h3><p>'+esc(note).replace(/\{([A-Z_]+)\}/g,'<span class="fillmiss">$1</span>')+'</p>';
  document.body.appendChild(pane);
  const vw=innerWidth, vh=innerHeight, pad=4, gap=44, cr=card.getBoundingClientRect();
  const hole={top:cr.top-pad,left:cr.left-pad,width:cr.width+pad*2,height:cr.height+pad*2};
  const w=Math.min(320,vw-28); pane.style.width=w+"px";
  const h=pane.offsetHeight;
  const clampX=x=>Math.max(14,Math.min(vw-w-14,x)), sideTop=Math.max(12,Math.min(vh-h-12,hole.top));
  const rightX=hole.left+hole.width+gap, leftX=hole.left-w-gap;
  let place, top, left;
  if(rightX+w<vw-10){ place="side"; left=rightX; top=sideTop; }
  else if(hole.top+hole.height+gap+h<vh-10){ place="below"; top=hole.top+hole.height+gap; left=clampX(hole.left+hole.width/2-w/2); }
  else if(hole.top-h-gap>10){ place="above"; top=hole.top-h-gap; left=clampX(hole.left+hole.width/2-w/2); }
  else if(leftX>=14){ place="side"; left=leftX; top=sideTop; }
  else { place="center"; top=Math.max(12,Math.min(vh-h-12,hole.top+40)); left=clampX(hole.left+hole.width/2-w/2); }
  pane.style.top=top+"px"; pane.style.left=left+"px";
  const route=place!=="center" ? tourArrowRoute({top,left,width:w,height:h},hole,place,0) : null;
  if(route){
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("class","tour-arrow note-arrow");
    svg.innerHTML='<path class="tour-shaft" pathLength="1"/><path class="tour-head"/>';
    document.body.appendChild(svg);
    drawTourArrow(svg,route,true);
    noteArrowEl=svg;
  }
  notePaneEl=pane; notePaneBtn=btn||null; if(btn) btn.setAttribute("aria-expanded","true");
  requestAnimationFrame(()=>{ if(notePaneEl===pane){ pane.classList.add("in"); if(noteArrowEl) noteArrowEl.classList.add("show"); } });
}
/* Hover opens the note where the switch is on and a hover exists; a rest of a third of a second,
   so a sweep across the list opens nothing. Leaving the card closes it unless the pointer went
   into the pane, and leaving the pane closes it unless it went back to the card. */
let noteHoverT=0, noteHoverCard=null;
function noteHoverOn(){ return document.body.classList.contains("note-hover") && matchMedia("(hover:hover)").matches; }
function noteHoverLeave(to){
  clearTimeout(noteHoverT); noteHoverT=0;
  if(to && ((to.closest && to.closest(".note-pane")) || (noteHoverCard && noteHoverCard.contains(to)))) return;
  noteHoverCard=null;
  if(notePaneEl && !notePaneBtn) closeNotePane();
}
/* Everything that moves the ground under the pane closes it, so it can never be stale.
   A module may not register a listener at load: boot calls this at the old position. */
function wireNotePane(){
  document.addEventListener("mouseover",e=>{
    if(!noteHoverOn()) return;
    const pane=e.target.closest(".note-pane");
    if(pane) return;
    const card=e.target.closest("#list .card[data-id]");
    if(!card){ noteHoverLeave(e.target); return; }
    if(card===noteHoverCard) return;
    noteHoverLeave(null);
    noteHoverCard=card;
    if(!card.querySelector('[data-act="note"]')) return;
    noteHoverT=setTimeout(()=>{ noteHoverT=0; if(noteHoverCard===card && noteHoverOn()) openNotePane(card, card.dataset.id, null); },300);
  });
  document.addEventListener("mouseout",e=>{
    if(!noteHoverCard && !notePaneEl) return;
    const to=e.relatedTarget;
    const from=e.target.closest(".note-pane") || e.target.closest("#list .card[data-id]");
    if(from && !(to && from.contains(to))) noteHoverLeave(to);
  });
  document.addEventListener("click",e=>{
    if(notePaneEl && !notePaneEl.contains(e.target) && !(notePaneBtn&&notePaneBtn.contains(e.target))) closeNotePane();
  },true);
  addEventListener("scroll",()=>{ if(notePaneEl) closeNotePane(); },true);
  addEventListener("resize",()=>{ if(notePaneEl) closeNotePane(); });
}
export {
  notePaneOpen,
  closeNotePane,
  toggleNotePane,
  openNotePane,
  wireNotePane,
};
