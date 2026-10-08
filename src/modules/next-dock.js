import { cardCommits, cardLang, cardTitle, parts } from "./card-model.js";
import { cards, lang } from "./app-state.js";
import { pack } from "./pack.js";
import { statsLearntAfter, statsRecentUse } from "./desk-stats.js";
import { setTabBeads, syncTabBeads, tabPathNow, watchTabPath } from "./tabs.js";
import { formatActionChord } from "./shortcuts.js";
import { t, uiLang } from "./ui-lang.js";
import { esc } from "./esc.js";
import { placeBubble } from "./bubble.js";
import { catIconSvg, catSlot } from "./cat-identity.js";
import { fill } from "./intent-text.js";
import { markCutText } from "./cut-text.js";
import { NEXT_KEYS, nextLive, stampHtml } from "./card-chain.js";
import { copyCardPart } from "./copy-entry.js";
import { modalOpen, openCover } from "./dialog.js";
import { $ } from "./dom.js";

/* ---- The dock: what the conversation in front can send next, behind the action button in the corner.
   The card's own list comes first, the catalog's or the one the agent put in its place; what this desk
   learnt fills the places left, and then the desk's most-used cards. */
const DOCK_MAX=NEXT_KEYS;
const DOCK_LEARNT_MIN=2;
const DOCK_W=640;
// Hover opens it after a short wait; it folds once the pointer has been away this long, this far out.
const DOCK_HOVER_MS=150, DOCK_LEAVE_MS=700, DOCK_NEAR=48, DOCK_GAP=12;

/** The replies offered after `from`, at most DOCK_MAX, as {id, learnt, n}. `live` maps an id to its card,
 *  `learnt` is statsLearntAfter's answer, and `sent` holds the ids this conversation has sent: a learnt
 *  reply already sent is passed over, the card's own list is kept whole. `used`, where given, is dockUsed's
 *  answer and tops up the places left, each such row marked `used`, passing over a hidden card as well. */
function dockList(from, live, learnt, sent, used){
  const m=from!=null && live ? live.get(String(from)) : null;
  if(!m) return [];
  const self=String(m.id);
  const out=nextLive(m.next, self, live).slice(0,DOCK_MAX).map(e=>({id:e.to, learnt:false, n:0}));
  const taken=new Set(out.map(o=>o.id));
  taken.add(self);
  (Array.isArray(learnt)?learnt:[]).forEach(o=>{
    const id=String(o&&o.id!=null?o.id:""), n=o ? o.n|0 : 0;
    if(out.length>=DOCK_MAX || !id || taken.has(id) || !live.has(id) || n<DOCK_LEARNT_MIN || (sent && sent.has(id))) return;
    taken.add(id);
    out.push({id:id, learnt:true, n:n});
  });
  (Array.isArray(used)?used:[]).forEach(o=>{
    const id=String(o&&o.id!=null?o.id:""), n=o ? o.n|0 : 0, c=id ? live.get(id) : null;
    if(out.length>=DOCK_MAX || !c || c._hidden || taken.has(id) || n<1 || (sent && sent.has(id))) return;
    taken.add(id);
    out.push({id:id, learnt:false, used:true, n:n});
  });
  return out;
}
/** The desk's cards by their copies over the days statsRecentUse counts, most first, then by id, as [{id, n}]. */
function dockUsed(){
  return [...statsRecentUse(pack)].map(([id,n])=>({id:id, n:n}))
    .sort((x,y)=>y.n-x.n || (x.id<y.id ? -1 : x.id>y.id ? 1 : 0));
}
// The replies sent along a chain show as at most this many beads; a longer chain shows a lead-in before them.
const BEADS_MAX=3;
/** A conversation's beads, or null where it has no chain. The chain is the run of replies at the path's end that
 *  each follow the one before by `linked`; `open` is whether replies wait after the last. A lone reply with
 *  nothing waiting is no chain. */
function chainBeads(path, linked, open){
  const p=Array.isArray(path) ? path.map(String) : [];
  if(!p.length) return null;
  let run=1;
  for(let i=p.length-1;i>0 && linked(p[i-1],p[i]);i--) run++;
  if(run<2 && !open) return null;
  return {sent:Math.min(run,BEADS_MAX), more:run>BEADS_MAX, open:!!open};
}
/** The beads of a path as the button offers: a reply follows another when it is on that card's own list or was
 *  learnt after it, and replies wait when the button would show a digit after the last. */
function pathBeads(path){
  const p=(Array.isArray(path) ? path : []).map(String);
  if(!p.length) return null;
  const live=new Map((cards||[]).filter(m=>m&&m.id).map(m=>[String(m.id),m]));
  const linked=(a,b)=>{
    const m=live.get(a);
    if(m && nextLive(m.next, a, live).some(e=>e.to===b)) return true;
    return statsLearntAfter(pack, a).some(o=>o && String(o.id)===b && (o.n|0)>=DOCK_LEARNT_MIN);
  };
  const last=p[p.length-1];
  return chainBeads(p, linked, dockList(last, live, statsLearntAfter(pack, last), new Set(p)).length>0);
}
const tabBeadsOf=tb=>pathBeads(tb && tb.path);
/** The left edge that keeps the unfolded dock off every rect in `avoid` by `gap`: its own when clear, else
 *  moved left past what it meets, or null where that would leave the window. Rects are {left,top,width,height}. */
function dockClear(want, avoid, gap){
  const g=gap|0, rs=(avoid||[]).filter(r=>r && r.width>0 && r.height>0);
  let left=want.left;
  for(let i=0;i<=rs.length;i++){
    const hit=rs.find(r=>left<r.left+r.width+g && left+want.width+g>r.left
      && want.top<r.top+r.height+g && want.top+want.height+g>r.top);
    if(!hit) return left;
    left=hit.left-g-want.width;
    if(left<g) return null;
  }
  return null;
}
// Whether a point lies within `d` of a rect.
function dockNear(r, x, y, d){
  return !!r && x>=r.left-d && x<=r.left+r.width+d && y>=r.top-d && y<=r.top+r.height+d;
}

let dockRows=[], dockFrom=null, dockLive=new Map(), dockKey="", dockEl=null;
let openBy={hover:false, ctrl:false}, dockHoverT=0, dockLeaveT=0, dockWatch=null;
const dockFab=()=>$("#nextFab");
// The lanes give the conversation the whole window, so the dock stands down while they show.
const lanesShown=()=>!!document.body && document.body.classList.contains("e-lanes");
/* One listener, the lanes: told after every sync of the button, with whether a step brought it, as the
   tabs tell the dock. */
function watchNextDock(fn){ dockWatch=fn||null; }

// What the tab in front offers now, from the last reply it sent.
function dockNow(){
  const now=tabPathNow(), path=now.path, from=path.length ? path[path.length-1] : null;
  const live=new Map((cards||[]).filter(m=>m&&m.id).map(m=>[String(m.id),m]));
  const rows=from==null ? [] : dockList(from, live, statsLearntAfter(pack, from), new Set(path), dockUsed());
  return {tab:now.tab, from:from, rows:rows, live:live, path:path, log:now.log||[], name:now.name||""};
}
/** The button's digit and its pulse, and the open dock's rows. `arrived` is a step just taken in the tab
 *  in front, which pulses where it brings the card's list or a learnt reply; a row only there by use counts in
 *  the digit and does not pulse. A switch of tab or any other redraw shows the digit still. */
function syncNextDock(arrived){
  const fab=dockFab();
  if(!fab) return;
  const now=dockNow(), n=now.rows.length;
  const key=[now.tab, now.from||"", now.rows.map(r=>r.id+(r.learnt?"~":r.used?"+":"")).join(","), lang, uiLang()].join("|");
  const changed=key!==dockKey;
  dockRows=now.rows; dockFrom=now.from; dockLive=now.live; dockKey=key;
  const lanes=lanesShown();
  // The button is the door to the lanes too, so it stays once the conversation has sent a reply.
  fab.hidden=!n && !now.path.length && !lanes;
  const badge=fab.querySelector(".fab-badge");
  if(badge) badge.textContent=n ? String(n) : "";
  fab.title=t(lanes ? "Back to the cards" : "Show the conversation's path");
  fab.setAttribute("aria-label", t("Next replies")+": "+n);
  fab.setAttribute("aria-pressed", lanes ? "true" : "false");
  if(arrived===true && now.rows.some(r=>!r.used)){ fab.classList.remove("nudge"); void fab.offsetWidth; fab.classList.add("nudge"); }
  else if(changed) fab.classList.remove("nudge");
  if(!n || lanes) foldNextDock();
  else if(nextDockOpen() && (changed || arrived===true)) drawDock();
  syncTabBeads();
  if(dockWatch) dockWatch(arrived===true);
}
function dockRowHtml(r, i){
  const m=dockLive.get(r.id);
  if(!m) return "";
  const l=cardLang(m), ps=parts(m,l);
  const body=ps.length ? String(fill(ps[0],m,0,l)||"").replace(/\s+/g," ").trim() : "";
  const key=formatActionChord("nextCopy"+(i+1));
  const slot=catSlot(m.c);
  return '<button type="button" class="nd-row" data-k="'+i+'"'+(slot>=0 ? ' data-ec="'+slot+'"' : "")+'>'
    +'<span class="nd-key">'+(key&&key!=="-" ? '<kbd>'+esc(key)+'</kbd>' : "")+'</span>'
    +'<span class="nd-main"><span class="nd-head">'+catIconSvg(m.c,"cat-ic nd-cat")
    +'<span class="nd-t">'+esc(cardTitle(m))+'</span>'
    +(cardCommits(m) ? stampHtml("nd-stamp") : "")
    +(r.learnt ? '<span class="nd-learnt" title="'+esc(t("Sent after this card {N} times in the last four weeks").replace("{N}",String(r.n)))+'">'
      +esc(t("learnt"))+'</span>' : "")
    +'</span><span class="nd-b">'+esc(body)+'</span></span></button>';
}
function drawDock(){
  if(!dockEl) return;
  const from=dockFrom!=null ? dockLive.get(String(dockFrom)) : null;
  dockEl.setAttribute("aria-label", t("Next replies"));
  dockEl.innerHTML='<div class="nd-top"><span class="nd-after">'+esc(t("Next after"))+'</span>'
    +'<span class="nd-from">'+esc(from ? cardTitle(from) : "")+'</span></div>'
    +'<div class="nd-rows">'+dockRows.map(dockRowHtml).join("")+'</div>';
  dockEl.hidden=false;
  placeDock();
  markCutText(dockEl);
}
/* Against the button, as the family's bubbles hang, then clear of any question standing on the page: moved
   left of it with no pointer, or not shown while the window has no room beside it. */
function placeDock(){
  const fab=dockFab();
  if(!dockEl || !fab || dockEl.hidden) return;
  const r=fab.getBoundingClientRect();
  const got=placeBubble(dockEl, {top:r.top, left:r.left, width:r.width, height:r.height}, {prefer:"above", width:DOCK_W});
  const avoid=[...document.querySelectorAll("body > .bub-ask")].map(b=>b.getBoundingClientRect());
  const left=dockClear({left:got.left, top:got.top, width:got.width, height:got.height}, avoid, DOCK_GAP);
  if(left===null){ dockEl.hidden=true; return; }
  if(left!==got.left){ dockEl.style.left=left+"px"; dockEl.setAttribute("data-side","none"); }
}
function nextDockOpen(){ return !!dockEl && !dockEl.hidden; }
function unfoldDock(by){
  if(!dockRows.length || lanesShown() || modalOpen() || openCover()) return;
  openBy[by]=true;
  if(!dockEl){
    dockEl=document.createElement("div");
    dockEl.id="nextDock";
    dockEl.className="bub paper nd";
    dockEl.setAttribute("role","group");
    dockEl.setAttribute("data-i18n-skip","");
    dockEl.hidden=true;
    dockEl.addEventListener("click", e=>{
      const b=e.target && e.target.closest && e.target.closest(".nd-row");
      if(b) copyNextReply(+b.dataset.k);
    });
    document.body.appendChild(dockEl);
  }
  if(dockEl.hidden) drawDock();
}
function settleDock(){
  if(!openBy.hover && !openBy.ctrl && dockEl) dockEl.hidden=true;
}
/** Folds the dock whatever opened it. */
function foldNextDock(){
  openBy={hover:false, ctrl:false};
  clearTimeout(dockHoverT); clearTimeout(dockLeaveT); dockHoverT=dockLeaveT=0;
  if(dockEl) dockEl.hidden=true;
}
/** Copies the reply at place `k` (0 to 3) of the tab in front, by its first block in the language it
 *  shows, or the other one; false when there is none, so the key falls through. A question for its
 *  fields hangs from `anchor`, the button where none is given. */
function copyNextReply(k, anchor, other){
  const r=dockNow().rows[k];
  if(!r) return false;
  copyCardPart(r.id, 0, anchor||dockFab(), other);
  return true;
}
function dockLeft(){
  if(dockLeaveT) return;
  dockLeaveT=setTimeout(()=>{ dockLeaveT=0; openBy.hover=false; settleDock(); }, DOCK_LEAVE_MS);
}
function onDockMove(e){
  if(!nextDockOpen()) return;
  // A Ctrl released outside the window sends no keyup; the next move tells.
  if(openBy.ctrl && !e.ctrlKey && !e.metaKey){ openBy.ctrl=false; settleDock(); }
  const near=[dockFab(), dockEl].some(el=>el && dockNear(el.getBoundingClientRect(), e.clientX, e.clientY, DOCK_NEAR));
  if(near){ clearTimeout(dockLeaveT); dockLeaveT=0; openBy.hover=true; }
  else dockLeft();
}
function onDockPress(e){
  if(!nextDockOpen()) return;
  const fab=dockFab(), at=e.target;
  if(at && ((fab && fab.contains(at)) || dockEl.contains(at))) return;
  openBy.hover=false;
  settleDock();
}
// Holding Ctrl shows the dock with the other folded things, and letting go folds what Ctrl alone opened.
function onDockKey(e){
  const held=!!(e.ctrlKey||e.metaKey);
  if(held && !openBy.ctrl && e.type==="keydown" && (e.key==="Control"||e.key==="Meta")) unfoldDock("ctrl");
  else if(!held && openBy.ctrl){ openBy.ctrl=false; settleDock(); }
}
function wireNextDock(){
  const fab=dockFab();
  if(!fab) return;
  watchTabPath(()=>syncNextDock(true));
  setTabBeads(tabBeadsOf);
  fab.addEventListener("pointerenter", ()=>{
    clearTimeout(dockLeaveT); dockLeaveT=0;
    if(nextDockOpen()){ openBy.hover=true; return; }
    clearTimeout(dockHoverT);
    dockHoverT=setTimeout(()=>{ dockHoverT=0; unfoldDock("hover"); }, DOCK_HOVER_MS);
  });
  fab.addEventListener("pointerleave", ()=>{ clearTimeout(dockHoverT); dockHoverT=0; });
  fab.addEventListener("click", ()=>{ clearTimeout(dockHoverT); dockHoverT=0; });
  addEventListener("keydown", onDockKey);
  addEventListener("keyup", onDockKey);
  addEventListener("blur", ()=>{ if(openBy.ctrl){ openBy.ctrl=false; settleDock(); } });
  document.addEventListener("pointermove", onDockMove, {capture:true, passive:true});
  document.addEventListener("pointerdown", onDockPress, true);
  document.documentElement.addEventListener("mouseleave", ()=>{ if(nextDockOpen()) dockLeft(); });
  addEventListener("resize", placeDock);
  syncNextDock();
}

export {
  DOCK_MAX,
  DOCK_LEARNT_MIN,
  BEADS_MAX,
  chainBeads,
  pathBeads,
  tabBeadsOf,
  dockList,
  dockUsed,
  dockClear,
  dockNear,
  dockNow,
  watchNextDock,
  syncNextDock,
  nextDockOpen,
  foldNextDock,
  copyNextReply,
  wireNextDock
};
