import { cardCommits, cardLang, cardTitle, parts } from "./card-model.js";
import { pack } from "./pack.js";
import { lang } from "./app-state.js";
import { statsLearntAfter } from "./desk-stats.js";
import { dockList, dockNow, copyNextReply, foldNextDock, syncNextDock, watchNextDock } from "./next-dock.js";
import { formatActionChord } from "./shortcuts.js";
import { t, uiLang } from "./ui-lang.js";
import { esc } from "./esc.js";
import { catIconSvg, catSlot } from "./cat-identity.js";
import { fill } from "./intent-text.js";
import { markCutText } from "./cut-text.js";
import { stampHtml } from "./card-chain.js";
import { copyCardPart } from "./copy-entry.js";
import { animatePillsBox, syncPillsCollapse } from "./pills-box.js";
import { modalOpen, openCover } from "./dialog.js";
import { $, intentEl } from "./dom.js";

/* ---- The lanes: the conversation in front given the whole window. What it sent, the reply it sent last
   whole, and what can follow it, each with the batch after it. The list keeps its place and its scroll
   underneath, unseen; the header gives up only the category bar. */
const SENT_SHOWN=6;
const LN_DOT=" "+String.fromCharCode(0xb7)+" ";
let lanesOn=false, laneFresh=false, laneMark=-1, laneKey="", laneRO=null;
const lanesEl=()=>$("#lanes");

function lanesOpen(){ return lanesOn; }
/** Whether the lanes key may switch views: with nothing focused, or with the search box focused and
 *  empty. Anything else focused keeps the key: a field types it, a button is pressed by it. */
function lanesKeyFree(active, box, body){
  if(!active || active===body) return true;
  return !!box && active===box && !String(box.value||"");
}
// The lanes key: declined while something is being typed, so the press reaches what is focused.
function lanesKey(){
  if(!lanesKeyFree(document.activeElement, intentEl, document.body)) return false;
  toggleLanes();
  return true;
}
function toggleLanes(on){
  const want=on===undefined ? !lanesOn : !!on, el=lanesEl();
  if(want===lanesOn || !el || (want && (modalOpen() || openCover()))) return;
  lanesOn=want;
  laneFresh=want; laneMark=-1; laneKey="";
  const shell=document.querySelector("#pageScroll > .shell");
  if(shell) shell.inert=want;
  animatePillsBox(()=>{ document.body.classList.toggle("e-lanes", want); syncPillsCollapse(); });
  if(!want){ el.hidden=true; el.innerHTML=""; }
  syncNextDock();
}

// What the lanes show for the tab in front, and a key that changes whenever any of it would.
function laneState(){
  const now=dockNow(), live=now.live, path=now.path.map(String);
  const nowCard=now.from!=null ? live.get(String(now.from)) || null : null;
  const prior=path.slice(0,-1).filter(id=>live.has(id));
  const sent=prior.slice(-SENT_SHOWN);
  const after=now.rows.map(r=>dockList(r.id, live, statsLearntAfter(pack, r.id), new Set(path.concat(r.id))));
  const key=[now.tab, path.join(","), now.rows.map(r=>r.id+(r.learnt?"~":"")).join(","),
    after.map(a=>a.map(x=>x.id).join("+")).join("/"), lang, uiLang()].join("|");
  return {now:now, live:live, nowCard:nowCard, sent:sent, older:prior.length>sent.length, after:after, key:key};
}
function laneTitleHtml(m){
  return catIconSvg(m.c,"cat-ic")+'<span class="ctitle">'+esc(cardTitle(m))+'</span>'+(cardCommits(m) ? stampHtml("cstamp") : "");
}
function laneBody(m, k){
  const l=cardLang(m), ps=parts(m,l);
  return ps.length>k ? String(fill(ps[k],m,0,l)||"") : "";
}
function laneRowHtml(st, r, i){
  const m=st.live.get(r.id);
  if(!m) return "";
  const slot=catSlot(m.c), key=formatActionChord("nextCopy"+(i+1));
  const then=st.after[i].map(x=>{ const n=st.live.get(x.id); return n ? cardTitle(n) : ""; }).filter(Boolean);
  return '<div class="card ln-row'+(i===laneMark?" on":"")+'" data-k="'+i+'"'+(slot>=0 ? ' data-ec="'+slot+'"' : "")
    +(r.learnt ? ' data-learnt=""' : "")+'><div class="chead">'
    +(key&&key!=="-" ? '<kbd class="ln-key">'+esc(key)+'</kbd>' : "")+laneTitleHtml(m)
    +(r.learnt ? '<span class="nd-learnt" title="'+esc(t("Sent after this card {N} times in four weeks").replace("{N}",String(r.n)))+'">'
      +esc(t("learnt"))+'</span>' : "")
    +'</div><div class="txt ln-txt'+(i===laneMark?" sel":"")+'" role="button">'+esc(laneBody(m,0).replace(/\s+/g," ").trim())+'</div>'
    +(then.length ? '<div class="ln-then">'+esc(t("then: {LIST}").replace("{LIST}",then.join(LN_DOT)))+'</div>' : "")
    +'</div>';
}
function lanesHtml(st){
  const back=String(t("{KEY} back to the cards")).split("{KEY}");
  const head='<div class="ln-head"><span class="ln-title">'+esc(t("This conversation"))+'</span>'
    +'<span class="ln-hint">'+esc(back[0]||"")+'<kbd>'+esc(formatActionChord("lanes"))+'</kbd>'+esc(back.slice(1).join("{KEY}"))+'</span></div>';
  const m=st.nowCard;
  if(!m) return head+'<p class="ln-empty">'+esc(t("Each reply you send appears here, with what can follow it."))+'</p>';
  const k=st.sent.length, slot=catSlot(m.c), l=cardLang(m), blocks=parts(m,l).length;
  let blk="";
  for(let i=0;i<blocks;i++) blk+='<div class="txt ln-blk" role="button" data-b="'+i+'">'+esc(laneBody(m,i))+'</div>';
  const rows=st.now.rows.map((r,i)=>laneRowHtml(st,r,i)).join("");
  return head+'<div class="ln-cols" style="grid-template-rows:auto repeat('+k+',auto) auto 1fr">'
    +'<div class="ln-h ln-h1">'+esc(t("Sent"))+'</div><div class="ln-h ln-h2">'+esc(t("Now"))+'</div>'
    +'<div class="ln-h ln-h3">'+esc(t("Next"))+'</div>'
    +st.sent.map((id,i)=>{ const s=st.live.get(id);
      return '<div class="ln-sent'+(i===0&&st.older?" ln-older":"")+'" style="grid-row:'+(i+2)+'">'+laneTitleHtml(s)+'</div>'; }).join("")
    +'<div class="card ln-now"'+(slot>=0 ? ' data-ec="'+slot+'"' : "")+' style="grid-row:'+(k+2)+'"><div class="chead">'+laneTitleHtml(m)+'</div>'+blk+'</div>'
    +'<div class="ln-next" style="grid-row:2 / span '+(k+2)+'">'+rows+'</div>'
    +'<svg class="ln-wires" aria-hidden="true"></svg></div>';
}
/* The threads, drawn once the lanes are laid out: down through what was sent and into the reply now, then
   out of it to each reply that can follow, solid for the card's own list and dashed for what was learnt. */
function drawWires(){
  const el=lanesEl(), cols=el && el.querySelector(".ln-cols"), svg=cols && cols.querySelector(".ln-wires");
  if(!svg) return;
  const o=cols.getBoundingClientRect(), at=r=>({l:r.left-o.left, t:r.top-o.top, r:r.right-o.left, b:r.bottom-o.top});
  const now=cols.querySelector(".ln-now"), nh=now && now.querySelector(".chead");
  if(!now || !nh) return;
  const n=at(now.getBoundingClientRect()), h=at(nh.getBoundingClientRect()), hy=(h.t+h.b)/2;
  let d="", dots="";
  const sent=[...cols.querySelectorAll(".ln-sent")].map(e=>at(e.getBoundingClientRect()));
  if(sent.length){
    const x=sent[0].l+4, y0=(sent[0].t+sent[0].b)/2;
    d+='<path class="ln-w" d="M'+x+" "+y0+"V"+hy+"H"+(h.l-10)+'"/>';
    if(cols.querySelector(".ln-older")) d+='<path class="ln-w ln-w-learnt" d="M'+x+" "+(y0-18)+"V"+y0+'"/>';
    sent.forEach(r=>{ dots+='<circle class="ln-dot" cx="'+x+'" cy="'+((r.t+r.b)/2)+'" r="4"/>'; });
  }
  dots+='<circle class="ln-dot ln-dot-open" cx="'+(h.l-6)+'" cy="'+hy+'" r="4"/>';
  const rows=[...cols.querySelectorAll(".ln-row")];
  rows.forEach((row,i)=>{
    const rh=row.querySelector(".chead");
    if(!rh) return;
    const r=at(rh.getBoundingClientRect()), y1=(r.t+r.b)/2, x1=r.l-8;
    const y0=n.t+18+i*Math.min(14, Math.max(0,(n.b-n.t-36))/Math.max(1,rows.length-1)), x0=n.r;
    const dx=Math.max(12,(x1-x0)/2);
    d+='<path class="ln-w'+(row.hasAttribute("data-learnt")?" ln-w-learnt":"")+'" d="M'+x0+" "+y0+"C"+(x0+dx)+" "+y0+" "+(x1-dx)+" "+y1+" "+x1+" "+y1+'"/>';
    dots+='<circle class="ln-dot" cx="'+x1+'" cy="'+y1+'" r="3.5"/>';
  });
  svg.setAttribute("width", String(cols.scrollWidth));
  svg.setAttribute("height", String(cols.scrollHeight));
  svg.innerHTML=d+dots;
}
function drawLanes(arrived){
  const el=lanesEl();
  if(!el || !lanesOn) return;
  const st=laneState();
  if(st.key===laneKey && arrived!==true) return;
  if(st.key!==laneKey) laneMark=-1;
  laneKey=st.key;
  el.innerHTML='<div class="ln-wrap'+(laneFresh?" ln-open":"")+(arrived===true?" ln-step":"")+'">'+lanesHtml(st)+'</div>';
  laneFresh=false;
  el.hidden=false;
  el.setAttribute("role","region");
  el.setAttribute("aria-label", t("This conversation"));
  markCutText(el);
  drawWires();
}
// The mark walks the replies that can follow, and Enter copies the marked one.
function laneMarkTo(i){
  const el=lanesEl(), rows=el ? [...el.querySelectorAll(".ln-row")] : [];
  if(!rows.length) return false;
  laneMark=Math.max(0, Math.min(rows.length-1, i));
  rows.forEach((r,k)=>{ r.classList.toggle("on", k===laneMark); const x=r.querySelector(".ln-txt"); if(x) x.classList.toggle("sel", k===laneMark); });
  try{ rows[laneMark].scrollIntoView({block:"nearest"}); }catch(_){}
  return true;
}
function laneRowEl(k){ const el=lanesEl(); return el ? el.querySelector('.ln-row[data-k="'+k+'"]') : null; }
/** A copy from the lanes, by place: the question for its fields hangs from that reply. */
function laneCopy(k, other){ return copyNextReply(k, laneRowEl(k), other); }
/** The main screen's keys while the lanes show: they walk and copy the replies here, and those that would
 *  act on the hidden cards do nothing. Undefined for a key the lanes leave alone. */
function lanesShortcut(id){
  if(id==="navUp"||id==="navDown"){ laneMarkTo(laneMark<0 ? (id==="navDown" ? 0 : 1e9) : laneMark+(id==="navDown"?1:-1)); return true; }
  if(id==="markTop"||id==="markBottom"){ laneMarkTo(id==="markTop" ? 0 : 1e9); return true; }
  if(id==="copy"||id==="copyOther"){ laneCopy(Math.max(0,laneMark), id==="copyOther"); return true; }
  if(/^nextCopy[1-4]$/.test(id)) return laneCopy(+id.slice(8)-1);
  if(/^navPill/.test(id)) return true;
  return undefined;
}
function wireLanes(){
  const el=lanesEl(), fab=$("#nextFab");
  if(!el) return;
  watchNextDock(arrived=>{ if(lanesOn) drawLanes(arrived); });
  /* A pointer's click leaves the button unfocused, or Enter and Space would press it again in place of
     copying and switching; a keyboard's press keeps its focus. */
  if(fab) fab.addEventListener("click", e=>{ toggleLanes(); if(e && e.detail>0 && fab.blur) fab.blur(); });
  el.addEventListener("click", e=>{
    const at=e.target;
    if(!at || !at.closest) return;
    const blk=at.closest(".ln-blk");
    if(blk){ const m=dockNow(); if(m.from!=null) copyCardPart(m.from, +blk.dataset.b, blk); return; }
    const row=at.closest(".ln-row");
    if(row) laneCopy(+row.dataset.k);
  });
  // Typing in the search box is a search of the whole catalog, which the cards show.
  if(intentEl) intentEl.addEventListener("input", ()=>{ if(lanesOn && String(intentEl.value||"")) toggleLanes(false); });
  if(typeof ResizeObserver==="function"){ laneRO=new ResizeObserver(()=>{ if(lanesOn) drawWires(); }); laneRO.observe(el); }
}

export {
  SENT_SHOWN,
  lanesOpen,
  lanesKeyFree,
  lanesKey,
  toggleLanes,
  lanesShortcut,
  wireLanes
};
