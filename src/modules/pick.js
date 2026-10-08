import { eHost } from "./host.js";
import { wholeThingEmpty } from "./app-state.js";
import { cardSearchTerms } from "./spell.js";
import { rankedCards } from "./render.js";
import { pack } from "./pack.js";
import { statsRecentUse } from "./desk-stats.js";
import { cardInActiveCats } from "./card-counts.js";
import { altLabelAt, cardCommits, cardLang, cardTitle, findCard, parts } from "./card-model.js";
import { fill } from "./intent-text.js";
import { bumpUseCount, copiedToastMsg } from "./list-pointer.js";
import { eLastRecent, eNoteRecent } from "./recency.js";
import { wantsAgentName, withAgentName } from "./agent.js";
import { copy, noteCopy } from "./mark.js";
import { t, uiLang } from "./ui-lang.js";
// The picker's answers: the desk's replies as a short list for the window the shell draws over the
// chat, found by the desk's own search and copied by the desk's own route.

const PICK_ROWS=9;
/* The desk's colours as its sheet computed them, sent at every opening so the picker wears the
   theme on screen now. */
const PICK_LOOK=["--panel","--panel-raised","--ink","--dim","--line","--line-strong","--accent",
  "--accent-soft","--warn","--field","--field-line","--field-edge","--sans","--mono","--radius-sm","--intent-type"];

/* A put-away card is never offered, whatever is chosen: the list offers it at the foot of its own
   shelf, and the picker has no shelf to be at the foot of. A query searches every category, as the
   desk's own box does once its settle drops the chosen ones. */
function pickKeep(terms){
  return m=>!(m&&m._hidden) && (terms.length>0 || cardInActiveCats(m,terms));
}
/* A LINE OF TOKENS ALONE SAYS NOTHING ABOUT THE REPLY: the greeting and the name open most of
   them, so the excerpt starts at the first line holding a word of its own. */
function pickExcerpt(raw,filled){
  const rl=String(raw||"").split("\n"), fl=String(filled||"").split("\n");
  let from=0;
  if(rl.length===fl.length)
    while(from<rl.length-1 && !/\p{L}/u.test(rl[from].replace(/\x7b[^\x7d]*\x7d/g,""))) from++;
  return fl.slice(from).join(" ").replace(/\s+/g," ").trim().slice(0,240);
}
function pickRow(m,l,ps,vi){
  const n=ps.length;
  const tag=n<2 ? "" : m.seq ? t("step")+" "+(vi+1)+"/"+n : (altLabelAt(m,l,vi)||((vi+1)+"/"+n));
  const row={id:String(m.id), vi:vi, t:cardTitle(m), x:pickExcerpt(ps[vi],fill(ps[vi],m,0,l)), tag:tag};
  if(cardCommits(m)) row.commits=1;
  return row;
}
/* AT REST THE REPLIES THIS DESK COPIES LATELY COME FIRST, most copied first, the rest in the desk's
   order; equal counts keep it. With none counted the list is handed back as it came. */
function pickByUse(hits){
  const use=statsRecentUse(pack);
  if(!use.size) return hits;
  return hits.map((m,i)=>({m,i,n:use.get(String(m.id))|0})).sort((a,b)=>b.n-a.n||a.i-b.i).map(o=>o.m);
}
/** The first rows the desk's list would show for `q`: every copyable block of each card in turn. */
function pickRows(q){
  const terms=cardSearchTerms(String(q==null?"":q));
  const rows=[];
  const hits=rankedCards(terms,pickKeep(terms)).hits;
  for(const m of terms.length ? hits : pickByUse(hits)){
    const l=cardLang(m), ps=parts(m,l);
    for(let vi=0;vi<ps.length;vi++){
      rows.push(pickRow(m,l,ps,vi));
      if(rows.length>=PICK_ROWS) return rows;
    }
  }
  return rows;
}
/* The block copied last, by any route, as a row; null where there is none or it has gone. */
function pickLastRow(){
  const r=eLastRecent(), m=r&&findCard(r.id);
  if(!m) return null;
  const l=cardLang(m), ps=parts(m,l);
  return (r.vi>=0 && r.vi<ps.length) ? pickRow(m,l,ps,r.vi) : null;
}
function pickLook(){
  const out={theme:"", glass:true, still:false, vars:{}};
  try{
    const root=document.documentElement, cs=getComputedStyle(root);
    out.theme=root.dataset.theme||"";
    out.glass=!document.body.classList.contains("glass-off");
    out.still=root.classList.contains("e-still");
    PICK_LOOK.forEach(k=>{ const v=cs.getPropertyValue(k).trim(); if(v) out.vars[k]=v; });
  }catch(e){}
  return out;
}
function pickWords(){
  return {lang:uiLang(), search:t("search replies"), list:t("Replies"), again:t("The reply copied last"),
          none:t("A different word may do better."), stamp:t("Commits the firm"),
          empty:wholeThingEmpty() ? t("Etiuda is ready for its first replies.") : t("Nothing here yet.")};
}
/* THE TEXT THE DESK'S OWN COPY WOULD MAKE, counted as the desk counts a copy: the fill of the block
   in the card's language, for the chat tab in front. The shell writes it to the clipboard. A reply
   signing with a name never given is handed back as `ask`, since the question needs the desk. */
function pickCopy(id,vi){
  const m=findCard(String(id||""));
  if(!m) return null;
  const l=cardLang(m), ps=parts(m,l);
  vi=vi|0;
  if(vi<0 || vi>=ps.length) return null;
  if(wantsAgentName(ps[vi])) return {ask:{id:String(m.id), vi:vi}};
  let text=null;
  withAgentName(ps[vi],()=>{
    bumpUseCount(m.id,l,vi);
    eNoteRecent(m.id,vi);
    noteCopy();
    text=fill(ps[vi],m,0,l);
  },null);
  return text==null ? null : {text:text};
}
/* In the desk's window, which the shell has just focused: the desk's own question, then its own copy. */
function pickAsk(id,vi){
  const m=findCard(String(id||""));
  if(!m) return null;
  const l=cardLang(m), ps=parts(m,l);
  vi=vi|0;
  if(vi<0 || vi>=ps.length) return null;
  withAgentName(ps[vi],()=>{
    copy(fill(ps[vi],m,0,l), copiedToastMsg(m,l,vi,ps.length), cardCommits(m));
    bumpUseCount(m.id,l,vi);
    eNoteRecent(m.id,vi);
  },null);
  return {asked:true};
}
function answerPick(op,argText){
  let a={};
  try{ a=JSON.parse(String(argText||"{}"))||{}; }catch(e){ a={}; }
  if(op==="open") return {look:pickLook(), words:pickWords(), rows:pickRows(""), last:pickLastRow()};
  if(op==="find") return {rows:pickRows(a.q)};
  if(op==="copy"){
    if(!a.last) return pickCopy(a.id,a.vi);
    const r=eLastRecent();
    return r ? pickCopy(r.id,r.vi) : null;
  }
  if(op==="ask") return pickAsk(a.id,a.vi);
  return null;
}
function wirePick(){
  const h=eHost();
  if(!h || typeof h.onPickAsk!=="function") return;
  h.onPickAsk((op,arg)=>JSON.stringify(answerPick(String(op||""),arg)));
}

export {
  answerPick,
  pickExcerpt,
  pickRows,
  wirePick
};
