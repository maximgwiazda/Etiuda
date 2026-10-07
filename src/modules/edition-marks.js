/* WHAT A LOADED EDITION BROUGHT, kept on the cards it changed or added until each is next copied: the mark
   a card wears, the pill that shows only those cards, and the words a changed card had before. Kept in
   the layer of the catalog it belongs to, as the rest of the desk's own state is; nothing leaves the
   machine. The comparison itself is edition-changes.js, made before the load. */
import { lsGet, lsSet, lsDel, lyGet, lySet, lyDel, eLayer, layerNsOf } from "./storage.js";
import { wordDiff } from "./edition-changes.js";
import { esc } from "./esc.js";
import { cards, editionView, setEditionView } from "./app-state.js";

const EDITION_MARKS="EditionMarks";
/** The marks an edition leaves: `v` the edition as the desk names it, and per card its kind and, for a
 *  changed one, the text of each body field it changed as it read before. Pure. */
function editionMarksFrom(held,changes,v){
  const was=new Map(((held&&held.cards)||[]).map(m=>[String(m.id),m]));
  const out={v:String(v||""), cards:{}};
  ((changes&&changes.items)||[]).forEach(it=>{
    if(it.kind!=="changed" && it.kind!=="new") return;
    const mark={k:it.kind};
    if(it.kind==="changed"){
      const b=was.get(it.id), body={};
      (it.fields||[]).filter(f=>f.field==="body").forEach(f=>{ body[f.key]=String(b && b[f.key]!=null ? b[f.key] : ""); });
      if(Object.keys(body).length) mark.was=body;
    }
    out.cards[it.id]=mark;
  });
  return Object.keys(out.cards).length ? out : null;
}
/* Read once per layer and kept: a render asks per card. */
let marksAt=null, marksNow=null;
function forgetEditionMarks(){ marksAt=null; marksNow=null; }
function editionMarks(){
  if(marksAt===eLayer()) return marksNow;
  marksAt=eLayer(); marksNow=null;
  try{
    const v=JSON.parse(lyGet(EDITION_MARKS)||"null");
    if(v && typeof v==="object" && v.cards && typeof v.cards==="object") marksNow=v;
  }catch(e){}
  return marksNow;
}
/** Written into the layer of the catalog `c` before it is loaded, so the desk's first paint after the
 *  load has them. Returns what stood there, for putting back should the load not land. */
function keepEditionMarks(c,marks){
  const key=layerNsOf(c)+EDITION_MARKS, was=lsGet(key);
  if(marks) lsSet(key,JSON.stringify(marks)); else lsDel(key);
  forgetEditionMarks();
  return was;
}
function putEditionMarksBack(c,was){
  const key=layerNsOf(c)+EDITION_MARKS;
  if(was==null) lsDel(key); else lsSet(key,was);
  forgetEditionMarks();
}
/** {k, v} for a card the edition marked, or null. */
function editionMarkOf(id){
  const all=editionMarks(), m=all && all.cards[String(id)];
  return m ? {k:m.k==="new"?"new":"changed", v:all.v} : null;
}
function editionWasText(id,key){
  const all=editionMarks(), m=all && all.cards[String(id)];
  return (m && m.was && Object.prototype.hasOwnProperty.call(m.was,key)) ? String(m.was[key]) : null;
}
/** What a card's markup owes the marks, for the card pool's signature: the kind, and whether the
 *  pill is showing the changed words. */
function editionMarkSig(id){
  const m=editionMarkOf(id);
  if(!m) return "";
  return m.k+(editionView && m.k==="changed" ? "+" : "");
}
/** The marked cards on the desk now, put-away ones left out as All leaves them out. */
function editionMarkedCount(){
  const all=editionMarks();
  if(!all) return 0;
  return (cards||[]).filter(m=>m && !m._hidden && all.cards[String(m.id)]).length;
}
/** A copy is a use: the card's mark goes, and with the last mark the record. Returns whether one went. */
function useEditionMark(id){
  const all=editionMarks(), k=String(id);
  if(!all || !all.cards[k]) return false;
  delete all.cards[k];
  if(Object.keys(all.cards).length) lySet(EDITION_MARKS,JSON.stringify(all)); else { lyDel(EDITION_MARKS); marksNow=null; }
  if(typeof document!=="undefined") editionMarkGone(k);
  return true;
}
/* IN PLACE, NEVER A REBUILD UNDER THE HAND THAT COPIED: the mark leaves the card and the pill counts one
   fewer. With the last one the pill goes and All stands; the list keeps what it shows until it is next
   drawn, and the card's signature has moved, so that draw rebuilds it. */
function editionMarkGone(id){
  const card=Array.prototype.find.call(document.querySelectorAll("#list .card[data-id]"),c=>c.getAttribute("data-id")===id);
  const badge=card && card.querySelector(".chead .cbadge.edn");
  if(badge) badge.remove();
  const pill=document.querySelector("#pills .pill-ed");
  if(!pill) return;
  const n=editionMarkedCount();
  if(n){ const b=pill.querySelector("b"); if(b) b.textContent=String(n); return; }
  setEditionView(false);
  pill.remove();
  const all=document.querySelector('#pills .pill[data-k=""]');
  if(all){ all.classList.add("on"); all.setAttribute("aria-pressed","true"); }
}
/** ONE BLOCK OF A CHANGED CARD, its words as they were struck and its words now marked, for the eye
 *  and, through the hidden words, for the ear. `was` and `now` are the block filled as the card shows
 *  it; `pairs` maps each fill marker to the markup it stands for, as escFilled() does; `words` are the
 *  hidden words before a struck and a marked span. A marked span is closed round every fill marker
 *  inside it, so the two kinds of span never cross. */
function editionDiffHtml(was,now,pairs,words){
  const marker=new Map(pairs||[]);
  const split=s=>{
    let text=""; const at=[];
    for(const ch of String(s==null?"":s)){ if(marker.has(ch)) at.push([text.length,marker.get(ch)]); else text+=ch; }
    return {text:text, at:at};
  };
  const a=split(was), b=split(now), INS='<ins class="e-ins">';
  let pos=0, k=0, html="", marked=false;
  const markersAt=p=>{ while(k<b.at.length && b.at[k][0]<=p){ html+=b.at[k][1]; k++; } };
  const run=(end,inside)=>{
    while(pos<end){
      if(k<b.at.length && b.at[k][0]===pos){
        if(inside) html+="</ins>";
        markersAt(pos);
        if(inside) html+=INS;
      }
      const next=k<b.at.length && b.at[k][0]<end ? b.at[k][0] : end;
      html+=esc(b.text.slice(pos,next)); pos=next;
    }
  };
  wordDiff(a.text,b.text).forEach(o=>{
    if(o.op==="del"){
      marked=true;
      html+='<del class="e-del"><span class="e-vh">'+esc(words.del)+'</span>'+esc(o.text)+'</del>';
      return;
    }
    const end=pos+o.text.length;
    if(o.op==="same"){ run(end,false); return; }
    marked=true;
    markersAt(pos);
    html+=INS+'<span class="e-vh">'+esc(words.ins)+'</span>';
    run(end,true);
    html+="</ins>";
  });
  markersAt(b.text.length);
  return marked ? html : null;
}
/* Heard and never seen, through the polite region the mark speaks in. Emptied first, so the same
   words said twice are said twice. */
function editionSay(words){
  const out=document.getElementById("eSay");
  if(!out) return;
  out.textContent="";
  setTimeout(()=>{ out.textContent=String(words||""); },60);
}

export {
  EDITION_MARKS,
  editionMarksFrom,
  editionMarks,
  forgetEditionMarks,
  keepEditionMarks,
  putEditionMarksBack,
  editionMarkOf,
  editionWasText,
  editionMarkSig,
  editionMarkedCount,
  useEditionMark,
  editionDiffHtml,
  editionSay
};
