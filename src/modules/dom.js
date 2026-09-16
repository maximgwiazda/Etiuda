/* The handles on the document the whole app reads, taken once. A module body may not touch the
   DOM at load - the cycle gate loads this tree unbundled, where there is no document - so every
   handle is null until grabDom(), which boot() calls as its first act. */
const $=s=>document.querySelector(s);
let list=null, pax=null, intentEl=null;
/* Suggestions only - the list never constrains what can be typed, which is what lets a catalog
   ship a short list without boxing anyone in (a group booking running past the last suggestion
   was the original reason, and it generalises). The list itself comes from whoOptions(). */
let roleSel=null;
// The language segmented control, and the category pills the drag order is written into.
let seg=null, pills=null;
// The template stays behind: see the note at parseCardHtml().
let cardTpl=null;
// The modal window's own two elements, which every dialog is drawn into.
let modalEl=null, modalCard=null;
/* SUB-PIXEL, BECAUSE THE ELLIPSIS IS: scrollWidth and clientWidth are whole numbers, so a
   line overflowing by less than a pixel rounds to no overflow at all and the dots get drawn
   where nothing here can see them. A Range gives the text its true width, the rect less
   padding gives the box. Blink lays out in 64ths, so 0.01 is under anything real. */
let cutRange=null;
/* A PLACEHOLDER IS IN NO MEASUREMENT THE ELEMENT OFFERS. The Range cannot reach into an input
   at all, and scrollWidth ignores a placeholder entirely, so the canvas measures the same
   string in the same font: sub-pixel, and without a layout. One context for every field, so
   the spacing is written each time - "normal" is not a length it accepts, and the last real
   value would stand in its place. */
let cutInk=null;
function grabDom(){
  list=$("#list"); pax=$("#pax"); intentEl=$("#intent");
  roleSel=$("#roleSel");
  seg=$("#seg"); pills=$("#pills");
  cardTpl=document.createElement("template");
  modalEl=$("#modal"); modalCard=$("#modalCard");
  cutRange=document.createRange();
  cutInk=document.createElement("canvas").getContext("2d");
}

export {
  $,
  list,
  pax,
  intentEl,
  roleSel,
  seg,
  pills,
  cardTpl,
  modalEl,
  modalCard,
  cutRange,
  cutInk,
  grabDom
};
