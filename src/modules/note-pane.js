import { placeBubble } from "./bubble.js";
import { findCard, noteFor, cardTitle } from "./card-model.js";
import { esc } from "./esc.js";
// The note beside a card: the family's bubble, and the hover that opens it.

/* THE NOTE IS A CALLOUT, NOT A BOX ON THE CARD: the family's bubble, placed by the family's
   routine with the whole card as its target. It closes on anything that moves the ground under
   it - a click elsewhere, Esc, a scroll, a resize, a render - so it can never be stale.
   BELOW THE CARD, NOT BESIDE IT: side-first always landed on the neighbouring column's card
   wherever the list has more than one, and below is the only side a three-column list leaves. */
/* THE NOTE'S VOICE IS ONE TOKEN, --note-voice in the sheet: `paper` for the catalog author's
   own words, which is what a note is and what the person asked to see, or `blue` for the
   program's own bubble. Read at open, so flipping the token and reopening the note shows the
   other. Everything else about the two is identical, which is the finding: one shape carries
   three voices and one colour does not. */
let notePaneEl=null, notePaneBtn=null;
function notePaneOpen(){ return !!notePaneEl; }
function closeNotePane(){
  if(notePaneEl){ notePaneEl.remove(); notePaneEl=null; }
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
  const voice=(getComputedStyle(document.documentElement).getPropertyValue("--note-voice")||"").trim();
  pane.className="tour-card bub note-pane"+(voice==="blue"?"":" paper");
  pane.id="notePane"; pane.setAttribute("role","note");
  // A token named in a note wears the chip the macro gives it, not its braces.
  pane.innerHTML='<h3>'+esc(cardTitle(m))+'</h3><p>'+esc(note).replace(/\{([A-Z_]+)\}/g,'<span class="fillmiss">$1</span>')+'</p>';
  document.body.appendChild(pane);
  // A few pixels of air around the card, so the pointer lands off its edge rather than on it.
  const pad=4, cr=card.getBoundingClientRect();
  placeBubble(pane, {top:cr.top-pad, left:cr.left-pad, width:cr.width+pad*2, height:cr.height+pad*2},
    {width:320});
  notePaneEl=pane; notePaneBtn=btn||null; if(btn) btn.setAttribute("aria-expanded","true");
  requestAnimationFrame(()=>{ if(notePaneEl===pane) pane.classList.add("in"); });
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
