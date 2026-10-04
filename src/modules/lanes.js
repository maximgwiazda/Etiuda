import { CATS } from "./content-model.js";
import { baseCard, cardCommits, cardLang, cardTitle, parts } from "./card-model.js";
import { pack, savePack } from "./pack.js";
import { cards, lang } from "./app-state.js";
import { statsLearntAfter } from "./desk-stats.js";
import { dockList, dockNow, foldNextDock, pathBeads, syncNextDock, watchNextDock } from "./next-dock.js";
import { tabBeadsHtml } from "./tabs.js";
import { formatActionChord } from "./shortcuts.js";
import { offerUndo, t, uiLang } from "./ui-lang.js";
import { esc } from "./esc.js";
import { catIconSvg, catSlot } from "./cat-identity.js";
import { fill } from "./intent-text.js";
import { markCutText } from "./cut-text.js";
import { NEXT_KEYS, nextFoldState, nextHitHtml, nextHits, nextIdsOf, nextListWrite, stampHtml } from "./card-chain.js";
import { ICON_PLUS, ICON_X } from "./icons.js";
import { copyCardPart } from "./copy-entry.js";
import { animatePillsBox, syncPillsCollapse } from "./pills-box.js";
import { modalOpen, openCover } from "./dialog.js";
import { hooks } from "./hooks.js";
import { cssEsc } from "./css-esc.js";
import { $, intentEl } from "./dom.js";

/* ---- The lanes: the conversation in front given the whole window. What it sent, the reply it sent last
   whole, and what can follow it, each with the batch after it. The list keeps its place and its scroll
   underneath, unseen; the header gives up only the category bar. */
const SENT_SHOWN=6;
const LN_DOT=" "+String.fromCharCode(0xb7)+" ";
let lanesOn=false, laneFresh=false, laneMark=-1, laneKey="", laneRO=null;
let laneRows=[], laneFrom=null, laneFind=false, laneHits=[], laneHit=0, laneFocus=null, laneDrag=null;
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
  laneFresh=want; laneMark=-1; laneKey=""; laneFind=false; laneDrag=null;
  const shell=document.querySelector("#pageScroll > .shell");
  if(shell) shell.inert=want;
  animatePillsBox(()=>{ document.body.classList.toggle("e-lanes", want); syncPillsCollapse(); });
  if(!want){ el.hidden=true; el.innerHTML=""; laneRows=[]; laneFrom=null; }
  syncNextDock();
}

/* What the lanes show for the tab in front, and a key that changes whenever any of it would. Next is the
   card's whole list, the first four on the action button's keys, then what the button adds from what was
   learnt; every reply there carries the batch after it. */
function laneState(){
  const now=dockNow(), live=now.live, path=now.path.map(String);
  const nowCard=now.from!=null ? live.get(String(now.from)) || null : null;
  const prior=path.slice(0,-1).filter(id=>live.has(id));
  const sent=prior.slice(-SENT_SHOWN);
  const fold=nowCard ? nextFoldState(nowCard, baseCard(nowCard.id), pack.overrides && pack.overrides[nowCard.id], live) : null;
  const rows=(fold ? fold.rows.map(e=>({id:e.to, learnt:false, n:0})) : []).concat(now.rows.filter(r=>r.learnt));
  const after=rows.map(r=>dockList(r.id, live, statsLearntAfter(pack, r.id), new Set(path.concat(r.id))));
  const key=[now.tab, path.join(","), rows.map(r=>r.id+(r.learnt?"~":"")).join(","), fold && fold.own ? "own" : "",
    after.map(a=>a.map(x=>x.id).join("+")).join("/"), lang, uiLang()].join("|");
  return {now:now, live:live, nowCard:nowCard, sent:sent, older:prior.length>sent.length, rows:rows, fold:fold, after:after, key:key};
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
  const slot=catSlot(m.c), key=i<NEXT_KEYS ? formatActionChord("nextCopy"+(i+1)) : "";
  const then=st.after[i].map(x=>{ const n=st.live.get(x.id); return n ? cardTitle(n) : ""; }).filter(Boolean);
  const grip=r.learnt ? "" : '<button type="button" class="nx-grip" title="'+esc(t("Drag to reorder"))+'" aria-label="'+esc(t("Drag to reorder"))+'"></button>';
  const act=r.learnt
    ? '<button type="button" class="ln-keep" title="'+esc(t("Add it to the list"))+'" aria-label="'+esc(t("Add it to the list"))+'">'+ICON_PLUS+'</button>'
    : '<button type="button" class="nx-x" title="'+esc(t("Take it off the list"))+'" aria-label="'+esc(t("Take it off the list"))+'">'+ICON_X+'</button>';
  return '<div class="card ln-row'+(i===laneMark?" on":"")+'" data-k="'+i+'" data-to="'+esc(r.id)+'"'+(slot>=0 ? ' data-ec="'+slot+'"' : "")
    +(r.learnt ? ' data-learnt=""' : "")+'><div class="chead">'+grip
    +(key&&key!=="-" ? '<kbd class="ln-key">'+esc(key)+'</kbd>' : "")+laneTitleHtml(m)
    +(r.learnt ? '<span class="nd-learnt" title="'+esc(t("Sent after this card {N} times in four weeks").replace("{N}",String(r.n)))+'">'
      +esc(t("learnt"))+'</span>' : "")
    +'<span class="ln-acts">'+act+'</span>'
    +'</div><div class="txt ln-txt'+(i===laneMark?" sel":"")+'" role="button"><span class="ln-clamp">'+esc(laneBody(m,0).replace(/\s+/g," ").trim())+'</span></div>'
    +(then.length ? '<div class="ln-then">'+esc(t("then: {LIST}").replace("{LIST}",then.join(LN_DOT)))+'</div>' : "")
    +'</div>';
}
// Whose list it is, the way back to the catalog's, and the way to add a reply, as the editor's fold offers them.
function laneEditHtml(st){
  const own=st.fold && st.fold.own ? '<div class="ln-src"><span class="nx-who own">'+esc(t("Your list"))+'</span>'
    +'<button type="button" class="btn ln-back">'+esc(t("Back to the catalog's"))+'</button></div>' : "";
  const add=laneFind
    ? '<div class="ln-find"><input type="text" id="lnFind" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list"'
      +' aria-expanded="false" aria-controls="lnHits" aria-label="'+esc(t("Find a card to add"))+'" placeholder="'+esc(t("a card's title"))+'">'
      +'<div class="nx-hits" id="lnHits" role="listbox"></div></div>'
    : '<div class="ln-add"><button type="button" class="btn nx-add-btn ln-add-btn">'+ICON_PLUS+'<span>'+esc(t("Add a reply"))+'</span></button></div>';
  return own+add;
}
function lanesHtml(st){
  const back=String(t("{KEY} back to the cards")).split("{KEY}");
  const head='<div class="ln-head"><span class="ln-title">'+esc(t("This conversation"))+'</span>'
    +'<span class="tab-beads" aria-hidden="true">'+tabBeadsHtml(pathBeads(st.now.path))+'</span>'
    +'<span class="ln-hint">'+esc(back[0]||"")+'<kbd>'+esc(formatActionChord("lanes"))+'</kbd>'+esc(back.slice(1).join("{KEY}"))+'</span></div>';
  const m=st.nowCard;
  if(!m) return head+'<p class="ln-empty">'+esc(t("Each reply you send appears here, with what can follow it."))+'</p>';
  const k=st.sent.length, slot=catSlot(m.c), l=cardLang(m), blocks=parts(m,l).length;
  let blk="";
  for(let i=0;i<blocks;i++) blk+='<div class="txt ln-blk" role="button" data-b="'+i+'">'+esc(laneBody(m,i))+'</div>';
  const rows=st.rows.map((r,i)=>laneRowHtml(st,r,i)).join("");
  return head+'<div class="ln-cols" style="grid-template-rows:auto repeat('+k+',auto) auto 1fr">'
    +'<div class="ln-h ln-h1">'+esc(t("Sent"))+'</div><div class="ln-h ln-h2">'+esc(t("Now"))+'</div>'
    +'<div class="ln-h ln-h3">'+esc(t("Next"))+'</div>'
    +st.sent.map((id,i)=>{ const s=st.live.get(id);
      return '<div class="ln-sent'+(i===0&&st.older?" ln-older":"")+'" style="grid-row:'+(i+2)+'">'+laneTitleHtml(s)+'</div>'; }).join("")
    +'<div class="card ln-now"'+(slot>=0 ? ' data-ec="'+slot+'"' : "")+' style="grid-row:'+(k+2)+'"><div class="chead">'+laneTitleHtml(m)+'</div>'+blk+'</div>'
    +'<div class="ln-next" style="grid-row:2 / span '+(k+2)+'">'+rows+laneEditHtml(st)+'</div>'
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
  laneKey=st.key; laneRows=st.rows; laneFrom=st.nowCard ? String(st.nowCard.id) : null;
  el.innerHTML='<div class="ln-wrap'+(laneFresh?" ln-open":"")+(arrived===true?" ln-step":"")+'">'+lanesHtml(st)+'</div>';
  laneFresh=false;
  el.hidden=false;
  el.setAttribute("role","region");
  el.setAttribute("aria-label", t("This conversation"));
  markCutText(el);
  drawWires();
  if(laneFind) drawLaneHits();
  const f=laneFocus; laneFocus=null;
  const to=f && (f.sel==="#lnFind" ? el.querySelector("#lnFind")
    : el.querySelector('.ln-row[data-to="'+cssEsc(String(f.to))+'"] '+f.sel));
  if(to) try{ to.focus({preventScroll:true}); }catch(_){ to.focus(); }
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
function laneCopy(k, other){
  const r=laneRows[k];
  if(!r) return false;
  copyCardPart(r.id, 0, laneRowEl(k), other);
  return true;
}
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

/* ---- Editing the list in the lanes: the agent's own layer, written as the editor's Next fold writes it and
   applied at once; taking a reply off offers it back. */
const laneListIds=()=>laneRows.filter(r=>!r.learnt).map(r=>r.id);
function writeLaneList(ids, said){
  const id=lanesOn ? laneFrom : null, card=id!=null ? (cards||[]).find(m=>m&&String(m.id)===id) : null;
  if(!card) return false;
  const base=baseCard(card.id), entry=base ? null : (pack.custom||[]).find(x=>x&&String(x.id)===id);
  if(!base && !entry) return false;
  if(!pack.overrides) pack.overrides={};
  const was=base ? (pack.overrides[card.id] ? JSON.stringify(pack.overrides[card.id]) : null) : (entry.next ? JSON.stringify(entry.next) : null);
  const live=new Set((cards||[]).filter(m=>m&&m.id).map(m=>String(m.id)));
  const w=nextListWrite(card, base, base ? pack.overrides[card.id] : null, ids, live);
  if(base){ if(w.override) pack.overrides[card.id]=w.override; else delete pack.overrides[card.id]; }
  else if(w.own.length) entry.next=w.own; else delete entry.next;
  savePack(); hooks.rebuildCards();
  if(said) offerUndo(said, ()=>{
    if(base){ if(was) pack.overrides[card.id]=JSON.parse(was); else delete pack.overrides[card.id]; }
    else { const e=(pack.custom||[]).find(x=>x&&String(x.id)===id); if(e){ if(was) e.next=JSON.parse(was); else delete e.next; } }
    savePack(); hooks.rebuildCards();
  });
  return true;
}
function laneMove(k, to){
  const ids=laneListIds();
  if(to<0 || to>=ids.length || k===to) return;
  ids.splice(to,0,ids.splice(k,1)[0]);
  laneFocus={to:ids[to], sel:".nx-grip"};
  writeLaneList(ids);
}
function drawLaneHits(){
  const el=lanesEl(), box=el && el.querySelector("#lnHits"), q=el && el.querySelector("#lnFind");
  if(!box || !q) return;
  laneHits=nextHits(q.value, laneFrom, new Set(laneListIds()));
  if(laneHit>=laneHits.length) laneHit=0;
  box.innerHTML=laneHits.map((m,i)=>'<div class="nx-hit'+(i===laneHit?" on":"")+'" role="option" id="lnHit'+i+'" aria-selected="'+(i===laneHit?"true":"false")
    +'" data-to="'+esc(m.id)+'"><span>'+nextHitHtml(cardTitle(m),q.value)+'</span><small>'+esc(CATS[m.c]||"")+'</small></div>').join("");
  markCutText(box);
  q.setAttribute("aria-expanded", laneHits.length ? "true" : "false");
  if(laneHits.length) q.setAttribute("aria-activedescendant","lnHit"+laneHit); else q.removeAttribute("aria-activedescendant");
}
function laneFindOpen(on){
  laneFind=!!on; laneHit=0;
  if(on) laneFocus={sel:"#lnFind"};
  laneKey="";
  drawLanes();
}
function laneTake(id){
  if(!id) return;
  laneFind=true; laneFocus={sel:"#lnFind"};
  writeLaneList(laneListIds().concat(String(id)));
}
function wireLaneEdits(el){
  el.addEventListener("click", e=>{
    const at=e.target;
    if(!at || !at.closest || !el.contains(at)) return true;
    const row=at.closest(".ln-row"), k=row ? +row.dataset.k : -1;
    if(at.closest(".nx-x")){ writeLaneList(laneListIds().filter(x=>x!==row.dataset.to), "Taken off the list"); return true; }
    if(at.closest(".ln-keep")){ writeLaneList(laneListIds().concat(row.dataset.to)); return true; }
    if(at.closest(".nx-grip")) return true;
    if(at.closest(".ln-back")){ const st=laneState(); writeLaneList(st.fold && st.fold.catalog ? nextIdsOf(st.fold.catalog) : []); return true; }
    if(at.closest(".ln-add-btn")){ laneFindOpen(true); return true; }
    const hit=at.closest(".nx-hit");
    if(hit){ laneTake(hit.getAttribute("data-to")); return true; }
    return k<0 ? false : (laneCopy(k), true);
  });
  // A hit is pressed without the field losing focus, so its blur never closes the find first.
  el.addEventListener("pointerdown", e=>{ if(e.target && e.target.closest && e.target.closest(".nx-hit")) e.preventDefault(); });
  el.addEventListener("keydown", e=>{
    const g=e.target && e.target.closest && e.target.closest(".nx-grip");
    if(g && (e.key==="ArrowUp" || e.key==="ArrowDown")){
      e.preventDefault(); e.stopPropagation();
      const k=+g.closest(".ln-row").dataset.k;
      laneMove(k, k+(e.key==="ArrowUp" ? -1 : 1));
      return;
    }
    if(!e.target || e.target.id!=="lnFind") return;
    // The find's own keys, taken before the main screen's: its arrows walk the hits, Enter adds, Escape closes it.
    if(e.key==="ArrowDown" || e.key==="ArrowUp"){
      if(!laneHits.length) return;
      e.preventDefault(); e.stopPropagation();
      laneHit=(laneHit+(e.key==="ArrowDown" ? 1 : laneHits.length-1))%laneHits.length;
      drawLaneHits();
    } else if(e.key==="Enter"){
      e.preventDefault(); e.stopPropagation();
      if(laneHits[laneHit]) laneTake(laneHits[laneHit].id);
    } else if(e.key==="Escape"){
      e.preventDefault(); e.stopPropagation();
      laneFindOpen(false);
    }
  });
  el.addEventListener("input", e=>{ if(e.target && e.target.id==="lnFind"){ laneHit=0; drawLaneHits(); } });
  el.addEventListener("focusout", e=>{
    const q=e.target;
    if(!q || q.id!=="lnFind") return;
    setTimeout(()=>{ if(laneFind && document.activeElement!==q && !String(q.value||"").trim() && q.isConnected) laneFindOpen(false); }, 0);
  });
  // The drag: a reply follows the pointer among the list's own, and the order lands on release.
  el.addEventListener("pointerdown", e=>{
    const g=e.button===0 && e.pointerType!=="touch" && e.target && e.target.closest && e.target.closest(".nx-grip");
    if(!g) return;
    laneDrag={row:g.closest(".ln-row"), y:e.clientY, moved:false};
    try{ g.setPointerCapture(e.pointerId); }catch(_){}
  });
  el.addEventListener("pointermove", e=>{
    if(!laneDrag) return;
    if(!laneDrag.moved){ if(Math.abs(e.clientY-laneDrag.y)<4) return; laneDrag.moved=true; laneDrag.row.classList.add("ln-drag"); }
    const list=[...el.querySelectorAll(".ln-row:not([data-learnt])")], others=list.filter(r=>r!==laneDrag.row);
    let to=0;
    others.forEach(r=>{ const q=r.getBoundingClientRect(); if(e.clientY>q.top+q.height/2) to++; });
    if(list.indexOf(laneDrag.row)===to) return;
    const ref=others[to]||null;
    laneDrag.row.parentNode.insertBefore(laneDrag.row, ref || (others.length ? others[others.length-1].nextSibling : laneDrag.row));
    drawWires();
  });
  const up=()=>{
    const d=laneDrag; laneDrag=null;
    if(!d || !d.moved) return;
    d.row.classList.remove("ln-drag");
    const order=[...el.querySelectorAll(".ln-row:not([data-learnt])")].map(r=>r.dataset.to), ids=laneListIds();
    if(order.join("\n")!==ids.join("\n")) writeLaneList(order);
  };
  ["pointerup","pointercancel","lostpointercapture"].forEach(k=>el.addEventListener(k, up));
}
function wireLanes(){
  const el=lanesEl(), fab=$("#nextFab");
  if(!el) return;
  watchNextDock(arrived=>{ if(lanesOn) drawLanes(arrived); });
  /* A pointer's click leaves the button unfocused, or Enter and Space would press it again in place of
     copying and switching; a keyboard's press keeps its focus. */
  if(fab) fab.addEventListener("click", e=>{ toggleLanes(); if(e && e.detail>0 && fab.blur) fab.blur(); });
  el.addEventListener("click", e=>{
    const blk=e.target && e.target.closest && e.target.closest(".ln-blk");
    if(blk && laneFrom!=null) copyCardPart(laneFrom, +blk.dataset.b, blk);
  });
  wireLaneEdits(el);
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
  writeLaneList,
  wireLanes
};
