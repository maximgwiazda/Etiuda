/* The handles on the document the whole app reads, taken once. A module body may not touch the
   DOM at load - the cycle gate loads this tree unbundled, where there is no document - so every
   handle is null until grabDom(), which boot() calls as its first act. */
const $=s=>document.querySelector(s);
let list=null, pax=null, intentEl=null;
/* Suggestions only - the list never constrains what can be typed, which is what lets a catalog
   ship a short list without boxing anyone in (a group booking running past the last suggestion
   was the original reason, and it generalises). The list itself comes from whoOptions(). */
let roleSel=null;
// The language segmented control, and the category pills the drag order is written into.
let seg=null, pills=null;
// The template stays behind: see the note at parseCardHtml().
let cardTpl=null;
// The modal window's own two elements, which every dialog is drawn into.
let modalEl=null, modalCard=null;
/* SUB-PIXEL, BECAUSE THE ELLIPSIS IS: scrollWidth and clientWidth are whole numbers, so a
   line overflowing by less than a pixel rounds to no overflow at all and the dots get drawn
   where nothing here can see them. A Range gives the text its true width, the rect less
   padding gives the box. Blink lays out in 64ths, so 0.01 is under anything real. */
let cutRange=null;
/* A PLACEHOLDER IS IN NO MEASUREMENT THE ELEMENT OFFERS. The Range cannot reach into an input
   at all, and scrollWidth ignores a placeholder entirely, so the canvas measures the same
   string in the same font: sub-pixel, and without a layout. One context for every field, so
   the spacing is written each time - "normal" is not a length it accepts, and the last real
   value would stand in its place. */
let cutInk=null;
/* AFTER A REPAINT, FOCUS THE CONTROL WITH THE SAME IDENTITY: its id, or else its first data attribute, with its tag
   and first class, read before the markup is rewritten and found again after. A control that is gone hands focus to
   the one at its place inside its nearest ancestor with an identity of its own, which is also where a name
   shared with other controls is looked for first. */
function focusKey(el,root){
  try{ return readFocusKey(el,root); }catch(e){ return null; }
}
function readFocusKey(el,root){
  if(!el || !el.getAttribute || !el.attributes || el===document.body || (root && !root.contains(el))) return null;
  const own=el=>{
    if(el.id) return {a:"id", v:el.id, tag:el.tagName, cls:el.classList[0]||""};
    const d=el.attributes && Array.prototype.find.call(el.attributes,x=>x.name.indexOf("data-")===0 && x.value);
    return d ? {a:d.name, v:d.value, tag:el.tagName, cls:el.classList[0]||""} : null;
  };
  const k=own(el);
  let up=el.parentElement;
  while(up && up!==root && !own(up)) up=up.parentElement;
  const holder=up && up!==root ? own(up) : null;
  const at=holder ? [...up.querySelectorAll(FOCUSABLE)].indexOf(el) : -1;
  let sel=null;
  try{ if(typeof el.selectionStart==="number") sel=[el.selectionStart, el.selectionEnd]; }catch(e){}
  return (k || holder) ? {k, holder, at, sel} : null;
}
const FOCUSABLE="button,a[href],input,select,textarea,[tabindex]:not([tabindex='-1'])";
function focusFind(root,k){
  if(!root || !k) return null;
  return [...root.querySelectorAll("["+k.a+"]")].find(e=>e.getAttribute(k.a)===k.v && e.tagName===k.tag
    && (!k.cls || e.classList.contains(k.cls))) || null;
}
function sameControl(root,key){
  if(!root || !key || typeof root.querySelectorAll!=="function") return null;
  try{
    const up=key.holder ? focusFind(root,key.holder) : null;
    return (up && focusFind(up,key.k)) || focusFind(root,key.k)
      || (up && key.at>=0 ? up.querySelectorAll(FOCUSABLE)[key.at]||null : null);
  }catch(e){ return null; }
}
function focusSame(root,key){
  const el=sameControl(root,key);
  if(el && typeof el.focus==="function"){ try{ el.focus({preventScroll:true}); }catch(e){ el.focus(); } }
  if(el && key.sel) try{ el.setSelectionRange(key.sel[0], key.sel[1]); }catch(e){}
  return el;
}
/* WHERE A BUBBLE ABOUT AN ACT HANGS, as a function asked at each placing: the control pressed while it stands; after a
   repaint, the control with its identity; where the act took it away, the control of its kind now in its place, else
   the last of its kind; else `fallback` (an element or a function). Its kind is `kind`, a selector, or else its tag and
   first data attribute: a class alone names too many. Read before the act, so the place is the one it had. */
function originOf(el, fallback, kind){
  const seen=e=>!!(e && e.isConnected && e.getClientRects().length && !e.closest(".e-gone,[hidden]"));
  const key=el ? focusKey(el,document.body) : null;
  const own=key && key.k;
  if(!kind && el && el.tagName){
    const d=el.attributes && Array.prototype.find.call(el.attributes,x=>x.name.indexOf("data-")===0);
    if(d) kind=el.tagName.toLowerCase()+"["+d.name+"]";
  }
  const all=()=>{ try{ return [...document.querySelectorAll(kind)].filter(seen); }catch(e){ return []; } };
  const at=kind && el ? all().indexOf(el) : -1;
  return ()=>{
    if(seen(el)) return el;
    const same=own ? focusFind(document.body,own) : null;
    if(seen(same)) return same;
    if(at>=0){ const now=all(); if(now.length) return now[Math.min(at,now.length-1)]; }
    const f=typeof fallback==="function" ? fallback() : fallback;
    return seen(f) ? f : null;
  };
}
/* The first of [selector, kind] that is on screen, as originOf reads it; with none, the origin is `last`. */
function originAmong(sels, last){
  for(const [sel,kind] of sels){
    let el=null;
    try{ el=document.querySelector(sel); }catch(e){ el=null; }
    if(el && el.getClientRects().length) return originOf(el, last, kind);
  }
  return originOf(null, last);
}
function grabDom(){
  list=$("#list"); pax=$("#pax"); intentEl=$("#intent");
  roleSel=$("#roleSel");
  seg=$("#seg"); pills=$("#pills");
  cardTpl=document.createElement("template");
  modalEl=$("#modal"); modalCard=$("#modalCard");
  cutRange=document.createRange();
  cutInk=document.createElement("canvas").getContext("2d");
}

export {
  $,
  list,
  pax,
  intentEl,
  roleSel,
  seg,
  pills,
  cardTpl,
  modalEl,
  modalCard,
  cutRange,
  cutInk,
  focusKey,
  focusSame,
  sameControl,
  originOf,
  originAmong,
  grabDom
};
