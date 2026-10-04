import { eHost } from "./host.js";
import { wholeThingEmpty } from "./app-state.js";
import { cardSearchTerms } from "./spell.js";
import { rankedCards } from "./render.js";
import { pack } from "./pack.js";
import { statsRecentUse } from "./desk-stats.js";
import { cardInActiveCats } from "./card-counts.js";
import { altLabelAt, cardLang, cardTitle, findCard, parts } from "./card-model.js";
import { fill } from "./intent-text.js";
import { bumpUseCount, copiedToastMsg } from "./list-pointer.js";
import { eLastRecent, eNoteRecent } from "./recency.js";
import { wantsAgentName, withAgentName } from "./agent.js";
import { copy, noteCopy } from "./mark.js";
import { t, uiLang } from "./ui-lang.js";
import { fieldVals } from "./app-state.js";
import { fillFieldsIn, fillFieldLabel, fillFieldRequired, fillFieldTakesClip, fillFieldClean } from "./fields.js";
import { fieldsWanted, fieldRefusal, clipAnswer, spendFields } from "./field-ask.js";
import { scheduleTabSave } from "./tabs.js";
import { renderFillsSoon } from "./agent.js";
// The picker's answers: the desk's replies as a short list for the window the shell draws over the
// chat, found by the desk's own search and copied by the desk's own route.

const PICK_ROWS=9;
/* The desk's colours as its sheet computed them, sent at every opening so the picker wears the
   theme on screen now. */
const PICK_LOOK=["--panel","--panel-raised","--ink","--dim","--line","--line-strong","--accent",
  "--accent-soft","--field","--field-line","--field-edge","--sans","--mono","--radius-sm","--intent-type"];

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
  return {id:String(m.id), vi:vi, t:cardTitle(m), x:pickExcerpt(ps[vi],fill(ps[vi],m,0,l)), tag:tag};
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
          none:t("A different word may do better."),
          empty:wholeThingEmpty() ? t("Etiuda is ready for its first replies.") : t("Nothing here yet."),
          clip:t("from the clipboard"), paste:t("paste or type"),
          keys:t("Enter copies once the field is filled. Esc goes back to the list.")};
}
/* A REPLY WITH FIELDS STILL TO FILL opens them in the picker's own row: what each is, and what this
   conversation already holds for it. `said` and `at` name a refusal and the field it is about. */
function pickNeed(m,l,raw,vi,said,at){
  return {id:String(m.id), vi:vi, said:said||"", at:at==null?-1:at,
    fields:fillFieldsIn(raw).map(f=>({id:f.id, label:fillFieldLabel(f,l), clip:fillFieldTakesClip(f), value:fieldVals[f.id]||"",
      note:fieldVals[f.id] ? t("from this conversation") : (fillFieldRequired(f) ? "" : t("may be skipped"))}))};
}
/* The values the picker sends, checked as the desk's own question checks them, then kept for the
   conversation in front. Answers a need where one does not fit, else null. */
function pickTakeValues(m,l,raw,vi,values){
  const all=fillFieldsIn(raw);
  for(let i=0;i<all.length;i++){
    const v=Object.prototype.hasOwnProperty.call(values,all[i].id) ? values[all[i].id] : fieldVals[all[i].id];
    const no=fieldRefusal(all[i],l,v);
    if(no) return {need:pickNeed(m,l,raw,vi,no,i)};
  }
  all.forEach(f=>{
    if(!Object.prototype.hasOwnProperty.call(values,f.id)) return;
    const v=fillFieldClean(values[f.id]);
    if(v) fieldVals[f.id]=v; else delete fieldVals[f.id];
  });
  scheduleTabSave();
  renderFillsSoon();
  return null;
}
/* THE TEXT THE DESK'S OWN COPY WOULD MAKE, counted as the desk counts a copy: the fill of the block
   in the card's language, for the chat tab in front. The shell writes it to the clipboard. A reply
   signing with a name never given is handed back as `ask`, since the question needs the desk. */
function pickCopy(id,vi,values){
  const m=findCard(String(id||""));
  if(!m) return null;
  const l=cardLang(m), ps=parts(m,l);
  vi=vi|0;
  if(vi<0 || vi>=ps.length) return null;
  if(values && typeof values==="object"){
    const no=pickTakeValues(m,l,ps[vi],vi,values);
    if(no) return no;
  }
  if(fieldsWanted(ps[vi]).length) return {need:pickNeed(m,l,ps[vi],vi)};
  if(wantsAgentName(ps[vi])) return {ask:{id:String(m.id), vi:vi}};
  let text=null;
  withAgentName(ps[vi],()=>{
    bumpUseCount(m.id,l);
    eNoteRecent(m.id,vi);
    noteCopy();
    text=fill(ps[vi],m,0,l);
    spendFields(ps[vi]);
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
    bumpUseCount(m.id,l);
    eNoteRecent(m.id,vi);
    copy(fill(ps[vi],m,0,l), copiedToastMsg(m,l,vi,ps.length));
    spendFields(ps[vi]);
  },null);
  return {asked:true};
}
function answerPick(op,argText){
  let a={};
  try{ a=JSON.parse(String(argText||"{}"))||{}; }catch(e){ a={}; }
  if(op==="open") return {look:pickLook(), words:pickWords(), rows:pickRows(""), last:pickLastRow()};
  if(op==="find") return {rows:pickRows(a.q)};
  if(op==="copy"){
    if(!a.last) return pickCopy(a.id,a.vi,a.values);
    const r=eLastRecent();
    return r ? pickCopy(r.id,r.vi) : null;
  }
  /* The clipboard's text, read by the shell at the agent's Alt+V in the picker: the part that fits. */
  if(op==="fit"){
    const m=findCard(String(a.id||"")), l=m&&cardLang(m), ps=m?parts(m,l):[];
    const f=m && ps[a.vi|0]!=null ? fillFieldsIn(ps[a.vi|0]).find(x=>x.id===String(a.field||"")) : null;
    return f ? clipAnswer(f, typeof a.text==="string" ? a.text : null) : null;
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
