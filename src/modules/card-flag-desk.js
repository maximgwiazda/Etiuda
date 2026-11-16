/* THE FLAG ON THE DESK: the card's own button, its blue bubbles and the mark beside the card's name. card-flag.js keeps
   the facts and decides them; this file draws them and answers the clicks. */
import { flagOffered, flagCard, flagNote, unflagCard, cardFlag, flagSeen, flagEndedIds, flagFileList } from "./card-flag.js";
import { ICON_FLAG } from "./icons.js";
import { hangBubble } from "./bubble.js";
import { dismissNode, cutLeaves } from "./motion.js";
import { esc } from "./esc.js";
import { cssEsc } from "./css-esc.js";
import { t } from "./ui-lang.js";
import { hooks } from "./hooks.js";

/* WHETHER A FLAG CAN BE MADE costs the shell a look at the catalog in use and the share, so it is asked once and kept:
   asked again after the desk starts again, when the window comes back to the front, and after a press it refused. */
let offered=null, focusWired=false;
function flagOfferedNow(){
  if(offered===null){
    offered=!!flagOffered();
    if(!focusWired && typeof addEventListener==="function"){
      focusWired=true;
      addEventListener("focus",()=>{
        const was=offered;
        offered=null;
        if(flagOfferedNow()!==was) hooks.render();
      });
    }
  }
  return offered;
}
function forgetFlagOffered(){ offered=null; }
/* The card whose "Sent to the lead" stands, and the answer whose bubble stands: that answer's mark is still drawn to hang
   from, though opening it has already told the desk it was seen. */
let sentOpen="", answerOpen=null;
/* The cards with a flag or an outcome, read once per draw: every change to either draws again (card-flag.js, tell; an
   edition's take starts the desk again), so the others need no read of their own. */
let flagged=null;
function flagState(id){
  if(answerOpen && answerOpen.id===id) return {state:"answered", outcome:answerOpen.outcome};
  if(flagged && !flagged.has(id)) return null;
  const f=cardFlag(id);
  if(!f || (f.state==="answered" && f.outcome==="gone")) return null;
  return f;
}
/* What the card's markup depends on, for the render's signature. */
function flagSig(id){
  const f=flagState(id);
  return (flagOfferedNow()?"o":"")+(f?f.state+(f.outcome||""):"")+(sentOpen===id?"+":"");
}
function flagButtonHtml(id){
  if(!flagOfferedNow()) return "";
  const lit=!!flagState(id);
  const w=esc(t("This looks wrong"));
  return '<button type="button" class="flag-btn'+(lit?" on":"")+'" data-act="flag" title="'+w+'" aria-label="'+w+'" aria-pressed="'
    +(lit?"true":"false")+'" aria-expanded="'+(sentOpen===id?"true":"false")+'">'+ICON_FLAG+'</button>';
}
function flagMarkHtml(id){
  const f=flagState(id);
  if(!f) return "";
  if(f.state==="sent") return '<span class="cflag">'+ICON_FLAG+esc(t("With the lead"))+'</span>';
  return '<button type="button" class="cflag answered" data-act="flag-answer" aria-haspopup="dialog">'+ICON_FLAG+esc(t("Answered"))+'</button>';
}
const cardSel=id=>'#list .card[data-id="'+cssEsc(id)+'"]';
const markOf=id=>document.querySelector(cardSel(id)+' > .chead .cflag');
const buttonOf=id=>document.querySelector(cardSel(id)+' > .chead .cacts [data-act="flag"]');

let closeOpen=null;
/* "back" gives the focus to the card's own button, as a close from inside the bubble does. */
function closeFlagBubbles(back){ if(closeOpen) closeOpen(back?"back":undefined); }
/* A press on the card's own button or its mark is theirs to answer, never a press outside. */
function pressOnOwn(id, target){
  const b=buttonOf(id), m=markOf(id);
  return !!((b && b.contains(target)) || (m && m.contains(target)));
}
/* One bubble at a time. Esc, its own close and a press anywhere outside it close it; `after` runs once it has gone. */
function flagBubble(id, html, origin, width, after){
  closeFlagBubbles();
  const el=document.createElement("div");
  el.className="bub bub-ask e-flag-bub";
  el.setAttribute("role","dialog");
  el.setAttribute("data-side","none");
  el.setAttribute("aria-labelledby","eFlagT");
  el.innerHTML=html;
  cutLeaves();
  document.body.appendChild(el);
  hangBubble(el, origin, {width:width});
  const outside=e=>{ if(!el.contains(e.target) && !pressOnOwn(id, e.target)) close(true); };
  /* Closed from inside, the focus goes back to the card's own button. */
  const close=how=>{
    if(closeOpen!==close) return;
    closeOpen=null;
    const back=how==="back" || (!how && el.contains(document.activeElement));
    document.removeEventListener("pointerdown",outside,true);
    dismissNode(el);
    after();
    hooks.render();
    const to=back && buttonOf(id);
    if(to) try{ to.focus({preventScroll:true}); }catch(e){}
  };
  closeOpen=close;
  document.addEventListener("pointerdown",outside,true);
  el.addEventListener("keydown",e=>{
    if(e.key!=="Escape") return;
    e.preventDefault(); e.stopPropagation(); close();
  });
  el.querySelector('[data-flag="done"]').onclick=()=>close();
  return {el:el, close:close};
}
function showFlagSent(id){
  const hint=t("What looks wrong (optional), then Enter");
  const b=flagBubble(id,
    '<h3 id="eFlagT">'+esc(t("Sent to the lead"))+'</h3>'
    +'<p>'+esc(t("The lead will see it in Studio, and the answer comes with the team's next edition. If you know what is wrong, add it here; it is fine not to know."))+'</p>'
    +'<input type="text" class="e-flag-note" placeholder="'+esc(hint)+'" aria-label="'+esc(hint)+'" spellcheck="false" autocomplete="off">'
    +'<div class="tour-actions"><button type="button" class="btn" data-flag="back">'+esc(t("Take it back"))+'</button>'
    +'<button type="button" class="btn primary" data-flag="done">'+esc(t("Done"))+'</button></div>',
    ()=>buttonOf(id)||markOf(id), 360, ()=>{ if(sentOpen===id) sentOpen=""; });
  const note=b.el.querySelector(".e-flag-note");
  /* A note the flag refuses keeps the bubble and every typed character. */
  note.addEventListener("keydown",e=>{
    if(e.key!=="Enter" || e.isComposing) return;
    e.preventDefault();
    const got=flagNote(id, note.value);
    if(got && got.refused){ note.setAttribute("aria-invalid","true"); return; }
    b.close();
  });
  note.addEventListener("input",()=>note.removeAttribute("aria-invalid"));
  b.el.querySelector('[data-flag="back"]').onclick=()=>{ unflagCard(id); b.close(); };
  try{ note.focus({preventScroll:true}); }catch(e){}
}
/* THE ANSWER IS ITS OUTCOME ALONE. Opening it is the agent having seen it. A card that is gone has nowhere to show it. */
function showFlagAnswer(id){
  if(closeOpen && answerOpen && answerOpen.id===id){ closeFlagBubbles(true); return; }
  const f=cardFlag(id);
  if(!f || f.state!=="answered") return;
  if(f.outcome==="gone"){ flagSeen(id); return; }
  answerOpen={id:id, outcome:f.outcome};
  const b=flagBubble(id,
    '<h3 id="eFlagT">'+esc(t("The lead has answered"))+'</h3>'
    +'<p>'+esc(f.outcome==="changed" ? t("The card has been mended.") : t("Left as it is."))+'</p>'
    +'<div class="tour-actions"><button type="button" class="btn primary" data-flag="done">'+esc(t("Done"))+'</button></div>',
    ()=>markOf(id), 300, ()=>{ if(answerOpen && answerOpen.id===id) answerOpen=null; });
  const seen=flagSeen(id);
  try{ b.el.querySelector('[data-flag="done"]').focus({preventScroll:true}); }catch(e){}
  return seen;
}
/* The card's button: a press sends the flag first and then says so; on a lit flag it takes the flag back, or opens the
   answer where one has come. */
function flagPressed(id){
  /* While its bubble stands, the button closes it and does nothing else: taking the flag back is the bubble's own. */
  if(closeOpen && (sentOpen===id || (answerOpen && answerOpen.id===id))){ closeFlagBubbles(true); return; }
  const f=flagState(id);
  if(f && f.state==="answered"){ showFlagAnswer(id); return; }
  if(f){ closeFlagBubbles(); unflagCard(id); return; }
  sentOpen=id;
  const got=flagCard(id);
  if(!got || got.refused){
    sentOpen="";
    if(got && got.refused==="not-offered") offered=null;
    hooks.render();
    return;
  }
  showFlagSent(id);
}
/* An outcome whose card the edition took away is told as seen, after the draw that found it. */
let goneAsked=false;
function flagFrame(){
  let ended=[];
  try{
    ended=flagEndedIds();
    flagged=new Set(flagFileList().map(f=>f.card).concat(ended));
  }catch(e){ flagged=null; }
  if(goneAsked) return;
  const gone=ended.filter(id=>{ const f=cardFlag(id); return f && f.outcome==="gone"; });
  if(!gone.length) return;
  goneAsked=true;
  setTimeout(()=>{ goneAsked=false; gone.forEach(id=>flagSeen(id)); },0);
}

export {
  flagOfferedNow,
  forgetFlagOffered,
  flagSig,
  flagButtonHtml,
  flagMarkHtml,
  flagPressed,
  showFlagAnswer,
  closeFlagBubbles,
  flagFrame
};
