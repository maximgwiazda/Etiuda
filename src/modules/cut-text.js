/* THE CUT PASS: which lines run off their own edge, and the fade that says so. A leaf on
   purpose - it imports one frame helper and nothing else, so every file that marks cut
   text reaches it without joining the import ring dialog.js sits in. */
import { afterPaint } from "./motion.js";
import { cutInk, cutRange, $ } from "./dom.js";

/* EVERY LINE THAT CAN BE CUT, and two rules holding the pass together. READ ALL, THEN WRITE
   ALL, as writePillCounts does, or each element costs its own layout. And NEVER REACH INSIDE
   A CARD THE PAGE HAS NOT LAID OUT: asking a title below the fold for its width forces the
   layout content-visibility:auto exists to skip, and at 261 cards a whole-list pass took a
   render from 17ms to 70ms. A card's own box is laid out either way, so its rect is cheap;
   the rest are measured when the scroll brings them in. */
const CUT_SEL=".ctitle,.ccat,.modal-name,.mg-card-lab,.mg-count,.acc-note,.mf-sum,"
  +"#toast,#intentPh,#roleDrum span,.tab-label>span,.fills input,"
  +".mf input:not([type]),.mf input[type=text],.rail-t,.rail-tag";
const CUT_MARGIN=400;
const CUT_EPS=.01;
/* A CARET'S WIDTH OF SLACK, for the scroll geometry alone: a field scrolled hard against its
   end still reports a pixel left to go, which is the room the caret is holding, and a cut
   narrower than the caret is nothing to fade. */
const CUT_SLACK=1.5;
/* WHICH SIDES ARE CUT. A field knows its own: it has scrolled exactly as far as the text is
   hidden, which is what puts the fade behind the caret instead of over it. Anything else is
   answered by where its ink LANDS against its content box, both edges read separately. */
function cutSides(el){
  const cs=getComputedStyle(el);
  const b=el.getBoundingClientRect();
  const boxL=b.left+parseFloat(cs.borderLeftWidth)+parseFloat(cs.paddingLeft);
  const boxR=b.right-parseFloat(cs.borderRightWidth)-parseFloat(cs.paddingRight);
  if(boxR-boxL<=0) return {l:false,r:false};   // display:none, or nothing laid out yet
  if(el.tagName==="INPUT"){
    /* The FIELD'S OWN numbers while it holds a value: scrollLeft rides exactly this overflow,
       and a second measurement of the same string lands a pixel off - enough to claim a fade
       on the side the text has not reached. A placeholder never scrolls, so it needs neither. */
    if(el.value){
      const max=el.scrollWidth-el.clientWidth;
      return {l:el.scrollLeft>CUT_SLACK, r:el.scrollLeft<max-CUT_SLACK};
    }
    cutInk.font=cs.fontStyle+" "+cs.fontWeight+" "+cs.fontSize+" "+cs.fontFamily;
    cutInk.letterSpacing=cs.letterSpacing==="normal"?"0px":cs.letterSpacing;
    return {l:false, r:cutInk.measureText(el.placeholder||"").width-(boxR-boxL)>CUT_EPS};
  }
  /* WHERE THE INK SITS, never how wide it is. A width against a width cannot see a line that has
     been pushed sideways, and the picked row in the intent panel pushes one: its tick is a
     ::before, which a Range does not cover, so a clause the tick had shoved three pixels off the
     edge measured as fitting and was clipped with no fade. Reading the two edges also settles the
     alignment without asking: centred ink overruns both ends and right-aligned ink the start. */
  cutRange.selectNodeContents(el);
  const ink=cutRange.getBoundingClientRect();
  return {l:boxL-ink.left>CUT_EPS, r:ink.right-boxR>CUT_EPS};
}
function applyCut(el,c){
  el.classList.toggle("is-cut", c.l||c.r);
  el.classList.toggle("cut-l", c.l);
  el.classList.toggle("cut-r", c.r);
  /* A line the reader cannot finish can be read on hover, and only then: a tooltip repeating a
     line that is whole on screen is noise. Empty rather than absent, or it would fly its
     ancestor's - see the note at the card's note. */
  if(el.classList.contains("cut-peek")) el.title=(c.l||c.r) ? el.textContent.trim() : "";
}
function markCut(el){
  if(el) applyCut(el,cutSides(el));
}
function markCutText(root){
  const all=(root||document).querySelectorAll(CUT_SEL);
  if(!all.length) return;
  const top=-CUT_MARGIN, bottom=innerHeight+CUT_MARGIN, live=[];
  for(let i=0;i<all.length;i++){
    const el=all[i], card=el.closest?el.closest(".card"):null;
    if(card){
      const r=card.getBoundingClientRect();
      if(r.bottom<top || r.top>bottom) continue;
    }
    live.push(el);
  }
  const cut=[];
  for(let i=0;i<live.length;i++) cut.push(cutSides(live[i]));
  for(let i=0;i<live.length;i++) applyCut(live[i],cut[i]);
}
/* One pass per frame however many callers ask, and a frame late on purpose: a card rebuilt in
   this task reports its estimated size until content-visibility resolves it. */
let cutScanT=0;
function scheduleCutScan(){
  if(cutScanT) return;
  cutScanT=1;
  const run=()=>{ cutScanT=0; markCutText(); };
  afterPaint(run);
}
/* A FIELD RE-MEASURES ON ITS OWN EVENTS. No rebuild follows a keystroke, and an input scrolls
   its own text, so which side is cut changes with nothing else on the page moving. focus
   catches the clear button, which ends by focusing the field it emptied. */
function wireCutFields(){
  ["#pax","#intent"].forEach(sel=>{
    const el=$(sel); if(!el) return;
    ["input","scroll","focus","blur"].forEach(t=>
      el.addEventListener(t,()=>markCut(el),{passive:true}));
  });
  // Dialog inputs come and go with their dialogs, so their events are taken at the document.
  ["input","scroll","focus","blur"].forEach(t=>
    document.addEventListener(t,e=>{ const el=e.target;
      if(el && el.matches && el.matches(".mf input:not([type]),.mf input[type=text]")) markCut(el);
    },{passive:true,capture:true}));
}

export {
  CUT_SEL, cutSides, applyCut, markCut, markCutText, scheduleCutScan, wireCutFields,
};
