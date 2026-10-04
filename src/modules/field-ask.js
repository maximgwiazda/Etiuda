import { fieldVals, watchFieldVals } from "./app-state.js";
import { fillFieldsIn, fillFieldLabel, fillFieldRequired, fillFieldOnce, fillFieldTakesClip, fillFieldClean, fillFieldFit, fillFieldOk } from "./fields.js";
import { fill, escFilled } from "./intent-text.js";
import { t, translateTree } from "./ui-lang.js";
import { esc } from "./esc.js";
import { placeBubble } from "./bubble.js";
import { cutLeaves, dismissNode } from "./motion.js";
import { eHost } from "./host.js";
import { renderFillsSoon } from "./agent.js";
import { scheduleTabSave } from "./tabs.js";
// The fill-in fields asked at the copy: the desk's own question bubble, hung from the reply.

/** The fields of `raw` this conversation has no value for. */
function fieldsWanted(raw){
  return fillFieldsIn(raw).filter(f=>!fieldVals[f.id]);
}
/* A FIELD KEPT FOR ONE COPY goes once that copy is made; the copy sites call this after theirs. */
function spendFields(raw){
  let gone=false;
  fillFieldsIn(raw).forEach(f=>{ if(fillFieldOnce(f) && fieldVals[f.id]){ delete fieldVals[f.id]; gone=true; } });
  if(gone){ scheduleTabSave(); renderFillsSoon(); }
}
/** Why a value cannot go, in the interface's words, or "" where it can: the bubble and the picker say the same. */
function fieldRefusal(f,l,raw){
  const v=fillFieldClean(raw);
  if(v && !fillFieldOk(f,v)) return t("Does not fit the field: {LABEL}").replace("{LABEL}",()=>fillFieldLabel(f,l));
  if(!v && fillFieldRequired(f)) return t("The reply does not go without: {LABEL}").replace("{LABEL}",()=>fillFieldLabel(f,l));
  return "";
}
/** What a clipboard's text gives a field: {value} where a part fits, else {said}. Nothing is kept. */
function clipAnswer(f,text){
  if(typeof text!=="string") return {said:t("The clipboard could not be read just now.")};
  const fit=fillFieldFit(f,text);
  if(fit) return {value:fit.value, said:t("Taken from the clipboard.")};
  const g=clipGlimpse(text);
  return {said:g ? t("Nothing on the clipboard fits this field. It holds: {TEXT}").replace("{TEXT}",()=>g) : t("The clipboard is empty.")};
}
/** The copy's gate: runs `go` now where every field of the reply has a value, else asks first.
 *  Escape answers nothing and copies nothing; a required field left empty refuses the copy. */
function withFields(raw,m,l,go,anchor){
  if(!fieldsWanted(raw).length){ go(); return; }
  askFields(raw,m,l,go,anchor);
}
/* WHAT THE CLIPBOARD HELD, as its first words, when none of it fits: shown in the bubble, never kept. */
function clipGlimpse(text){
  const s=fillFieldClean(text);
  return s.length>60 ? s.slice(0,60).replace(/\s+\S*$/,"")+"…" : s;
}
/* THE PREVIEW IS THE SENTENCE OF THE REPLY HOLDING THE FIRST FIELD ASKED, filled as it is typed. */
function fieldLine(raw,f,l){
  const lines=String(raw||"").split("\n");
  const lab=t => fillFieldsIn(t).indexOf(f)>-1;
  const line=(lines.find(lab)||"").trim();
  const one=line.split(/(?<=[.?!])\s+/).find(lab)||line;
  return (one!==line && line.indexOf(one)>0 ? "…" : "")+one;
}
function askFields(raw,m,l,go,anchor){
  const was=document.getElementById("eFieldAsk");
  if(was) was.remove();
  const all=fillFieldsIn(raw), mine=fieldVals;
  const wrap=document.createElement("div");
  wrap.className="bub bub-ask e-field-ask";
  wrap.id="eFieldAsk";
  wrap.setAttribute("role","dialog");
  wrap.setAttribute("aria-labelledby","eFieldTitle");
  const kept=all.some(f=>!fillFieldOnce(f));
  wrap.innerHTML='<h3 id="eFieldTitle">Fill in before copying</h3>'
    +all.map((f,i)=>{
      const had=mine[f.id]||"";
      const note=had ? '<span class="e-field-note">'+esc(t("from this conversation"))+'</span>'
        : (!fillFieldRequired(f) ? '<span class="e-field-note">'+esc(t("may be skipped"))+'</span>' : "");
      const clip=fillFieldTakesClip(f) ? '<span class="e-field-clip"><kbd>Alt+V</kbd> '+esc(t("from the clipboard"))+'</span>' : "";
      return '<label class="e-field-row"><span class="e-field-head"><span class="e-field-name" data-i18n-skip>'
        +esc(fillFieldLabel(f,l))+'</span>'+note+clip+'</span>'
        +'<input class="e-field-inp" data-i="'+i+'" autocomplete="off" spellcheck="false" placeholder="'
        +esc(t("paste or type"))+'" value="'+esc(had)+'"></label>';
    }).join("")
    +'<p class="e-greet e-field-prev" id="eFieldPrev" data-i18n-skip></p>'
    +'<p class="e-field-said" id="eFieldSaid" aria-live="polite"></p>'
    +(kept ? '<p>'+esc(t("What is filled in stays with this conversation, for every reply that needs it."))+'</p>' : "")
    +'<div class="tour-actions">'
    +'<button type="button" class="btn" id="eFieldNo">Cancel</button>'
    +'<button type="button" class="btn primary" id="eFieldYes">Copy</button>'
    +'</div>';
  cutLeaves();
  document.body.appendChild(wrap);
  translateTree(wrap);
  const inps=Array.prototype.slice.call(wrap.querySelectorAll(".e-field-inp"));
  const prev=wrap.querySelector("#eFieldPrev"), said=wrap.querySelector("#eFieldSaid");
  const first=all.find(f=>!mine[f.id])||all[0];
  const draft=()=>{ const d=Object.assign({},mine); all.forEach((f,i)=>{ const v=fillFieldClean(inps[i].value); if(v) d[f.id]=v; else delete d[f.id]; }); return d; };
  const sync=()=>{
    prev.innerHTML=escFilled(fill(fieldLine(raw,first,l),m,true,l,draft()));
    const go=wrap.querySelector("#eFieldYes");
    go.classList.toggle("e-waits", all.some((f,i)=>fillFieldRequired(f) && !fillFieldClean(inps[i].value)));
  };
  const say=(s,i)=>{
    said.textContent=s;
    inps.forEach((x,k)=>x.toggleAttribute("aria-invalid",k===i));
    if(i!=null && inps[i]) inps[i].focus();
  };
  const place=()=>{
    const r=(anchor && anchor.isConnected) ? anchor.getBoundingClientRect() : null;
    placeBubble(wrap, (r && r.width) ? {top:r.top, left:r.left, width:r.width, height:r.height}
      : {top:innerHeight/2, left:innerWidth/2, width:0, height:0}, {width:360});
  };
  place();
  addEventListener("resize",place);
  const close=()=>{ watchFieldVals(null); removeEventListener("resize",place); dismissNode(wrap); };
  /* The tab under the question is the one it answers for: another tab put on screen closes it. */
  watchFieldVals(()=>{ if(fieldVals!==mine) close(); });
  const submit=()=>{
    if(fieldVals!==mine){ close(); return; }
    for(let i=0;i<all.length;i++){
      const no=fieldRefusal(all[i],l,inps[i].value);
      if(no){ say(no,i); return; }
    }
    all.forEach((f,i)=>{ const v=fillFieldClean(inps[i].value); if(v) mine[f.id]=v; else delete mine[f.id]; });
    scheduleTabSave();
    renderFillsSoon();
    close();
    go();
  };
  /* ALT+V READS THE CLIPBOARD ONCE, AT THE PRESS, and keeps the part that fits; the shell answers
     only a read its own window saw the key for. Nothing else in the desk reads it. */
  const takeClip=i=>{
    const f=all[i], h=eHost();
    if(!fillFieldTakesClip(f)) return;
    if(!h || typeof h.readClip!=="function"){ say(t("Ctrl+V pastes into the field here."),i); return; }
    Promise.resolve(h.readClip()).then(text=>{
      if(!wrap.isConnected) return;
      const a=clipAnswer(f,text);
      if(a.value==null){ say(a.said,i); return; }
      inps[i].value=a.value;
      say(a.said);
      inps[i].focus();
      sync();
    },()=>{ if(wrap.isConnected) say(clipAnswer(f,null).said,i); });
  };
  wrap.addEventListener("input",()=>{ if(fieldVals!==mine){ close(); return; } said.textContent=""; sync(); });
  wrap.addEventListener("keydown",e=>{
    if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); close(); return; }
    const i=inps.indexOf(e.target);
    if(i<0) return;
    if(e.altKey && !e.ctrlKey && !e.metaKey && e.code==="KeyV"){ e.preventDefault(); e.stopPropagation(); takeClip(i); return; }
    if(e.key==="Enter"){
      e.preventDefault(); e.stopPropagation();
      /* Enter walks to the next box still empty, and copies from the last. */
      const next=inps.findIndex((x,k)=>k>i && !fillFieldClean(x.value));
      if(next>-1) inps[next].focus(); else submit();
    }
  });
  wrap.querySelector("#eFieldYes").onclick=submit;
  wrap.querySelector("#eFieldNo").onclick=close;
  sync();
  try{ inps[Math.max(0,all.indexOf(first))].focus(); }catch(e){}
}

export {
  fieldRefusal,
  clipAnswer,
  fieldsWanted,
  spendFields,
  withFields,
  askFields
};
