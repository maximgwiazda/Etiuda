import { CATS, CONTENT_LANGS } from "./content-model.js";
import { cardText, cardTitle, cardCommits } from "./card-model.js";
import { cards } from "./app-state.js";
import { esc } from "./esc.js";
import { t } from "./ui-lang.js";
import { foldDiacritics } from "./words.js";
import { ICON_PLUS, ICON_STAMP, ICON_X } from "./icons.js";
import { modalResize } from "./dialog.js";
import { modalCard } from "./dom.js";
import { markCutText } from "./cut-text.js";
import { mgReduceMotion } from "./motion.js";
import { formatActionChord } from "./shortcuts.js";

/* ---- The card editor's chain: the replies a card offers next, and the stamp of a card that commits
   the firm. The agent's list replaces the catalog's whole, in the agent's own layer, and travels in
   what the desk exports; so does the stamp, either way. */

const NX_DOT=" "+String.fromCharCode(0xb7)+" ";
const NX_HITS=6;
// The places the action button offers, each on its own key: the first rows of a list are those keys.
const NEXT_KEYS=4;

// A chain is its ordered ids, as card-model.js compares it.
function nextIdsOf(list){
  return (Array.isArray(list)?list:[]).map(e=>String(e&&e.to!=null?e.to:"")).filter(Boolean);
}
function nextSameIds(a,b){ return a.length===b.length && a.every((x,i)=>x===b[i]); }
// What a desk can offer: a live card, never the card itself, never twice. Entries are kept whole.
function nextLive(list,self,live){
  const seen=new Set();
  return (Array.isArray(list)?list:[]).filter(e=>{
    const to=(e&&typeof e==="object"&&typeof e.to==="string")?e.to:"";
    if(!to||to===self||!live.has(to)||seen.has(to)) return false;
    seen.add(to); return true;
  });
}
/** The fold as it opens. `catalog` is null for a card the catalog has no version of. The list is the
 *  agent's while its ids differ from the catalog's, and `changed` while the catalog's ids differ from
 *  the ones it held when the agent's list replaced them (override.nextWas). */
function nextFoldState(card,base,ov,live){
  const self=String(card&&card.id||"");
  const catalog=base ? nextLive(base.next,self,live) : null;
  const rows=nextLive(card&&card.next,self,live);
  const own=!!catalog && !nextSameIds(nextIdsOf(rows),nextIdsOf(catalog));
  const changed=own && !!ov && Array.isArray(ov.next) && Array.isArray(ov.nextWas)
    && !nextSameIds(ov.nextWas.map(String),nextIdsOf(base.next));
  return {catalog:catalog, rows:rows, own:own, changed:changed};
}
/** What a save hands on: nothing while the list is the catalog's, so the override drops it; else the
 *  whole list, with the catalog's ids it replaced, kept from before unless the list was changed. */
function nextSaveFields(rows,catalog,base,ov,touched){
  if(!catalog) return {next:rows.slice()};
  if(nextSameIds(nextIdsOf(rows),nextIdsOf(catalog))) return {};
  const kept=!touched && !!ov && Array.isArray(ov.next) && Array.isArray(ov.nextWas);
  return {next:rows.slice(), nextWas:kept ? ov.nextWas.map(String) : nextIdsOf(base&&base.next)};
}
/** A save that never touched the fold hands on the list AS STORED. The fold draws live cards only, and
 *  `cards` leaves out a removed card (back on Reset) and a retired one (asleep, rebuild.js), so writing
 *  the drawn rows back would drop both on a title edit, where card-order.js and favourites.js keep a retired card's place. */
function nextStoredFields(card,catalog,base,ov){
  if(!catalog) return {next:Array.isArray(card&&card.next) ? card.next.slice() : []};
  if(!ov || !Array.isArray(ov.next)) return {};
  return {next:ov.next.slice(), nextWas:Array.isArray(ov.nextWas) ? ov.nextWas.map(String) : nextIdsOf(base&&base.next)};
}
/** What a change to a card's list made outside the editor writes, as the editor's fold writes it on a save that
 *  touched it: an own card's whole list (`own`), or a catalog card's override (`override`, null to drop it) with
 *  `next` and `nextWas` set or dropped and every other field kept. `ids` are the replies in their new order. */
function nextListWrite(card,base,ov,ids,live){
  const self=String(card&&card.id||"");
  const st=nextFoldState(card,base,ov,live), pool=st.rows.concat(st.catalog||[]);
  const rows=nextLive((Array.isArray(ids)?ids:[]).map(String).map(id=>pool.find(e=>e.to===id)||{to:id}),self,live);
  if(!base) return {own:rows};
  const o=Object.assign({},ov||{});
  delete o.next; delete o.nextWas;
  Object.assign(o,nextSaveFields(rows,st.catalog,base,ov,true));
  return {override:Object.keys(o).length ? o : null};
}
/* Every title of every live card, folded as search folds it: a prefix of the title first, then of a
   word in it, then anywhere, each in list order. */
function nextFold(s){ return foldDiacritics(String(s==null?"":s).toLowerCase()); }
function nextHits(q,self,taken,limit){
  const f=nextFold(q).trim();
  if(!f) return [];
  const ranked=[];
  (cards||[]).forEach((m,i)=>{
    if(!m||!m.id||m.id===self||taken.has(m.id)) return;
    let best=3;
    CONTENT_LANGS.forEach(l=>{
      const h=nextFold(cardText(m,"t",l)), at=h.indexOf(f);
      if(at<0) return;
      const rank=at===0 ? 0 : (h.indexOf(" "+f)>-1 ? 1 : 2);
      if(rank<best) best=rank;
    });
    if(best<3) ranked.push({m:m, rank:best, i:i});
  });
  ranked.sort((a,b)=>a.rank-b.rank||a.i-b.i);
  return ranked.slice(0,limit||NX_HITS).map(r=>r.m);
}
// The matched part in bold, where folding kept the title's length and the match is in the one shown.
function nextHitHtml(title,q){
  const f=nextFold(q).trim(), h=nextFold(title), at=f ? h.indexOf(f) : -1;
  if(at<0 || h.length!==title.length) return esc(title);
  return esc(title.slice(0,at))+"<b>"+esc(title.slice(at,at+f.length))+"</b>"+esc(title.slice(at+f.length));
}
function stampHtml(cls){
  return '<span class="'+cls+'" title="'+esc(t("Commits the firm"))+'">'+ICON_STAMP+'</span>';
}

/** One per editor open. `card` is the card as the desk holds it (null for a new one), `base` the
 *  catalog's version (null for an own card), `ov` the agent's override. */
function nextReplies(card,base,ov){
  const self=String(card&&card.id||"");
  const live=new Map((cards||[]).filter(m=>m&&m.id).map(m=>[m.id,m]));
  const st=nextFoldState(card,base,ov,new Set(live.keys()));
  const catalog=st.catalog, catIds=catalog ? nextIdsOf(catalog) : [];
  let rows=st.rows.slice(), touched=false, drag=null, marked=0, hits=[];
  const own=()=>!!catalog && !nextSameIds(nextIdsOf(rows),catIds);
  const changed=()=>st.changed && own() && !touched;
  const el=id=>modalCard && modalCard.querySelector("#"+id);
  const entryFor=id=>rows.concat(catalog||[],st.rows).find(e=>e.to===id)||{to:id};

  function sum(){
    const n=rows.length ? String(rows.length) : t("none");
    if(!catalog) return n;
    if(!own()) return (rows.length||catIds.length) ? n+NX_DOT+t("the catalog's") : n;
    return n+NX_DOT+t(changed() ? "yours; the catalog's has changed" : "yours");
  }
  function rowHtml(e,i){
    const m=live.get(e.to), added=own() && catIds.indexOf(e.to)<0, key=i<NEXT_KEYS ? formatActionChord("nextCopy"+(i+1)) : "";
    return '<li class="nx-row'+(added?" nx-new":"")+'" data-to="'+esc(e.to)+'">'
      +'<button type="button" class="nx-grip" title="'+esc(t("Drag to reorder"))+'" aria-label="'+esc(t("Drag to reorder"))+'"></button>'
      +(key&&key!=="-" ? '<kbd class="nx-key">'+esc(key)+'</kbd>' : "")
      +'<span class="nx-t">'+esc(m?cardTitle(m):e.to)+'</span>'
      +(m&&cardCommits(m) ? stampHtml("nx-stamp") : "")
      +(added ? '<span class="nx-tag">'+esc(t("added"))+'</span>' : "")
      +'<button type="button" class="nx-x" title="'+esc(t("Take it off the list"))+'" aria-label="'+esc(t("Take it off the list"))+'">'+ICON_X+'</button></li>';
  }
  function srcHtml(){
    if(!catalog) return "";
    return own()
      ? '<span class="nx-who own">'+esc(t("Your list"))+'</span><span class="nx-say">'
        +esc(t("Replaces the catalog's on this desk, and travels in your exports."))+'</span>'
        +'<button type="button" class="btn nx-back">'+esc(t("Back to the catalog's"))+'</button>'
      : '<span class="nx-who">'+esc(t("The catalog's list"))+'</span><span class="nx-say">'
        +esc(t("Change anything and this card follows your own list instead."))+'</span>';
  }
  function wasText(){
    if(!own()) return "";
    const names=catIds.map(id=>{ const m=live.get(id); return m?cardTitle(m):id; });
    const list=names.length ? names.join(NX_DOT) : t("none");
    return t(changed() ? "The catalog's list has changed since you made yours: {LIST}" : "The catalog's list: {LIST}")
      .replace("{LIST}",list);
  }
  function body(){
    return '<div class="nx" data-i18n-skip>'
      +'<input type="hidden" id="meNextIds" value="'+esc(JSON.stringify(nextIdsOf(rows)))+'">'
      +(catalog ? '<div class="nx-src" id="meNextSrc">'+srcHtml()+'</div>' : "")
      +'<ol class="nx-list" id="meNextList">'+rows.map(rowHtml).join("")+'</ol>'
      +'<div class="nx-add"><button type="button" class="btn nx-add-btn" id="meNextAdd">'+ICON_PLUS
        +'<span>'+esc(t("Add a reply"))+'</span></button></div>'
      +'<div class="nx-find" id="meNextFindBox" hidden><input type="text" id="meNextFind" autocomplete="off"'
        +' spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="meNextHits"'
        +' aria-label="'+esc(t("Find a card to add"))+'" placeholder="'+esc(t("a card's title"))+'">'
        +'<div class="nx-hits" id="meNextHits" role="listbox"></div></div>'
      +(catalog ? '<p class="nx-was" id="meNextWas" hidden>'+esc(wasText())+'</p>' : "")
      +'</div>';
  }
  /* Everything the list decides, redrawn from `rows`. The hidden field is what the dialog's own
     change tracking and its Undo of a walk away read, so it moves with every change. */
  function sync(focus){
    const list=el("meNextList");
    if(!list) return;
    list.innerHTML=rows.map(rowHtml).join("");
    const ids=el("meNextIds"); if(ids) ids.value=JSON.stringify(nextIdsOf(rows));
    const src=el("meNextSrc"); if(src) src.innerHTML=srcHtml();
    const was=el("meNextWas"); if(was){ was.textContent=wasText(); was.hidden=!own(); }
    const s=el("meNextSum"); if(s) s.textContent=sum();
    markCutText(list);
    if(focus) focus();
  }
  function change(mutate,focus){
    touched=true;
    modalResize(()=>{ mutate(); sync(focus); });
  }
  function focusRow(i,sel){
    const li=el("meNextList") && el("meNextList").children[i];
    const b=li ? li.querySelector(sel) : el("meNextAdd");
    if(b) b.focus();
  }
  function drawHits(){
    const box=el("meNextHits"), q=el("meNextFind");
    if(!box||!q) return;
    hits=nextHits(q.value,self,new Set(nextIdsOf(rows)));
    if(marked>=hits.length) marked=0;
    box.innerHTML=hits.map((m,i)=>'<div class="nx-hit'+(i===marked?" on":"")+'" role="option" id="meNextHit'+i+'"'
      +' aria-selected="'+(i===marked?"true":"false")+'" data-to="'+esc(m.id)+'"><span>'+nextHitHtml(cardTitle(m),q.value)+'</span>'
      +'<small>'+esc(CATS[m.c]||"")+'</small></div>').join("");
    markCutText(box);
    q.setAttribute("aria-expanded",hits.length?"true":"false");
    if(hits.length) q.setAttribute("aria-activedescendant","meNextHit"+marked); else q.removeAttribute("aria-activedescendant");
  }
  function openFind(on){
    const box=el("meNextFindBox"), q=el("meNextFind"), add=el("meNextAdd");
    if(!box||!q) return;
    modalResize(()=>{
      box.hidden=!on;
      if(add) add.parentNode.hidden=on;
      if(!on){ q.value=""; marked=0; drawHits(); }
    });
    (on?q:add).focus();
  }
  function take(id){
    if(!id || !live.has(id)) return;
    change(()=>{ rows.push(entryFor(id)); }, ()=>{ const q=el("meNextFind"); if(q){ q.value=""; marked=0; drawHits(); q.focus(); } });
  }
  function move(from,to){
    if(to<0||to>=rows.length||from===to) return;
    rows.splice(to,0,rows.splice(from,1)[0]);
  }
  // In a FLIP every position is read before any is written (ui-lessons, Motion).
  function slide(list,mutate){
    const kids=Array.from(list.children), was=kids.map(k=>k.getBoundingClientRect().top);
    mutate();
    if(mgReduceMotion()) return;
    const now=kids.map(k=>k.getBoundingClientRect().top);
    kids.forEach((k,i)=>{
      const d=was[i]-now[i];
      if(!d || k===(drag&&drag.li)) return;
      k.style.transition="none"; k.style.transform="translateY("+d+"px)";
    });
    void list.offsetHeight;
    kids.forEach(k=>{ if(k.style.transform){ k.style.transition=""; k.style.transform=""; } });
  }
  function wire(){
    const list=el("meNextList"), q=el("meNextFind"), root=list && list.closest(".nx");
    if(!list||!root) return;
    const was=el("meNextWas"); if(was) was.hidden=!own();
    // A shut fold lays nothing out, so the cut is read again as it opens.
    const fold=root.closest("details");
    if(fold) fold.addEventListener("toggle",()=>{ if(fold.open) markCutText(list); });
    root.addEventListener("click",e=>{
      const x=e.target.closest(".nx-x");
      if(x){
        const i=Array.from(list.children).indexOf(x.closest(".nx-row"));
        if(i>-1) change(()=>{ rows.splice(i,1); }, ()=>focusRow(Math.min(i,rows.length-1),".nx-x"));
        return;
      }
      if(e.target.closest(".nx-back")){ change(()=>{ rows=catalog.slice(); }, ()=>focusRow(-1)); return; }
      if(e.target.closest("#meNextAdd")){ openFind(true); return; }
      const hit=e.target.closest(".nx-hit");
      if(hit) take(hit.getAttribute("data-to"));
    });
    // A hit is pressed without the field losing focus, so the blur below never closes it first.
    root.addEventListener("pointerdown",e=>{ if(e.target.closest(".nx-hit")) e.preventDefault(); });
    root.addEventListener("keydown",e=>{
      const g=e.target.closest && e.target.closest(".nx-grip");
      if(!g || (e.key!=="ArrowUp"&&e.key!=="ArrowDown")) return;
      e.preventDefault(); e.stopPropagation();
      const i=Array.from(list.children).indexOf(g.closest(".nx-row")), to=i+(e.key==="ArrowUp"?-1:1);
      if(to<0||to>=rows.length) return;
      change(()=>move(i,to), ()=>focusRow(to,".nx-grip"));
    });
    if(q){
      q.addEventListener("input",()=>{ marked=0; modalResize(drawHits); });
      /* Inside a dialog, Enter and Escape are the dialog's own keys: both are taken and stopped here,
         as the category editor's new-chip field does. */
      q.addEventListener("keydown",e=>{
        if(e.key==="ArrowDown"||e.key==="ArrowUp"){
          if(!hits.length) return;
          e.preventDefault();
          marked=(marked+(e.key==="ArrowDown"?1:hits.length-1))%hits.length;
          drawHits();
        } else if(e.key==="Enter"){
          e.preventDefault(); e.stopPropagation();
          if(hits[marked]) take(hits[marked].id);
        } else if(e.key==="Escape"){
          e.preventDefault(); e.stopPropagation();
          openFind(false);
        }
      });
      q.addEventListener("blur",()=>{ setTimeout(()=>{ if(document.activeElement!==q && !q.value.trim() && !el("meNextFindBox").hidden) openFind(false); },0); });
    }
    const ids=el("meNextIds");
    if(ids) ids.addEventListener("input",()=>{
      let want=[];
      try{ want=JSON.parse(ids.value||"[]"); }catch(_){}
      change(()=>{ rows=nextLive((Array.isArray(want)?want:[]).map(String).map(entryFor),self,new Set(live.keys())); });
    });
    // The drag: a row follows the pointer slot by slot, the others slide aside, and the order lands on release.
    list.addEventListener("pointerdown",e=>{
      if(e.button!==0 || e.pointerType==="touch" || e.target.closest(".nx-x")) return;
      const li=e.target.closest(".nx-row");
      if(!li) return;
      drag={li:li, y:e.clientY, moved:false};
      try{ list.setPointerCapture(e.pointerId); }catch(_){}
    });
    list.addEventListener("pointermove",e=>{
      if(!drag) return;
      if(!drag.moved){
        if(Math.abs(e.clientY-drag.y)<4) return;
        drag.moved=true; drag.li.classList.add("nx-drag");
      }
      const kids=Array.from(list.children), at=kids.indexOf(drag.li);
      let to=0;
      kids.forEach(k=>{ if(k===drag.li) return; const r=k.getBoundingClientRect(); if(e.clientY>r.top+r.height/2) to++; });
      if(to===at) return;
      slide(list,()=>{ list.insertBefore(drag.li, kids.filter(k=>k!==drag.li)[to]||null); });
    });
    const onUp=()=>{
      if(!drag) return;
      const d=drag; drag=null;
      if(!d.moved) return;
      d.li.classList.remove("nx-drag");
      const order=Array.from(list.children).map(k=>k.getAttribute("data-to"));
      if(nextSameIds(order,nextIdsOf(rows))) return;
      change(()=>{ rows=order.map(entryFor); });
    };
    ["pointerup","pointercancel","lostpointercapture"].forEach(k=>list.addEventListener(k,onUp));
  }
  return {
    sum:sum, body:body, wire:wire,
    fields:()=>touched ? nextSaveFields(rows,catalog,base,ov,true) : nextStoredFields(card,catalog,base,ov)
  };
}

/* ---- The stamp in the editor: one hidden box holds it, so the dialog's change tracking reads it like
   any flag, and a toggle on every language's Title row shows and flips it. */
function stampToggleHtml(on){
  return '<button type="button" class="me-stamp" aria-pressed="'+(on?"true":"false")+'" data-i18n-skip>'
    +ICON_STAMP+'<span>'+esc(t("Commits the firm"))+'</span></button>';
}
// What differs from the catalog is said under the title; a card the catalog has no version of says nothing.
function stampNoteHtml(on,base){
  if(!base || on===cardCommits(base)) return "";
  return on
    ? "<b>"+esc(t("Yours, not the catalog's."))+"</b> "+esc(t("The catalog does not stamp this card; your desk and your exports will."))
    : "<b>"+esc(t("The catalog stamps this card."))+"</b> "+esc(t("You took the stamp off on this desk. Reset puts it back."));
}
function wireStampToggle(base){
  const box=modalCard && modalCard.querySelector("#meCommits");
  if(!box) return;
  const sync=()=>{
    const on=box.checked, note=stampNoteHtml(on,base);
    modalCard.querySelectorAll(".me-stamp").forEach(b=>b.setAttribute("aria-pressed",on?"true":"false"));
    modalCard.querySelectorAll(".me-stamp-note").forEach(p=>{ p.innerHTML=note; p.hidden=!note; });
  };
  modalCard.querySelectorAll(".me-stamp").forEach(b=>b.addEventListener("click",()=>{
    box.checked=!box.checked;
    box.dispatchEvent(new Event("change",{bubbles:true}));
  }));
  box.addEventListener("change",()=>modalResize(sync));
  sync();
}

export {
  NEXT_KEYS,
  nextIdsOf,
  nextLive,
  nextFoldState,
  nextSaveFields,
  nextListWrite,
  nextHits,
  nextHitHtml,
  nextReplies,
  stampHtml,
  stampToggleHtml,
  stampNoteHtml,
  wireStampToggle
};
