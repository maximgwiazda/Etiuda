/* Three one-shot overlays that answer a click where the finger is, each spawned fixed so
   it outlives the re-render underneath it and each taking itself away when it ends. */
import { _STAR } from "./icons.js";

let eEyePopN=0;
let eWashDownX=0,eWashDownY=0;

function eWashOver(el){
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r=el.getBoundingClientRect();
  const d=document.createElement("div");
  d.className="e-copy-wash";
  d.style.left=r.left+"px"; d.style.top=r.top+"px";
  d.style.width=r.width+"px"; d.style.height=r.height+"px";
  document.body.appendChild(d);
  d.addEventListener("animationend",()=>d.remove());
  setTimeout(()=>{ if(d.parentNode) d.remove(); },900);
}

/* Keyboard copies answer the same way - copyEntrySel calls this after a successful copy, so
   Enter (or any rebound copy key) washes the selected block exactly like a click. */
function eCopyFeedback(id){
  const sel=document.querySelector(".txt.sel");
  if(sel) eWashOver(sel);
  eNoteRecent(id);
}

function wirePops(){
  /* ---- Star pop. The moment a favourite turns ON, its own star blooms from the button and
     fades - _STAR, the same path the button draws, so the two can never drift apart. Wired on
     the CAPTURE phase: the button must be read before the app's own click handler toggles the
     state and re-renders the row, after which the node may already be replaced. The bloom is a
     fixed overlay for the same reason - it outlives the re-render. Turning a favourite OFF is
     not a celebration, and reduced motion never spawns one.
     MATCH THE STAR, DO NOT EXCLUDE ITS SIBLINGS: edit, hide and unhide all wear .rail-fav for
     the shared geometry, so a blacklist grows a bug every time one is added. data-fav-intent
     is carried by the star alone. */
  document.addEventListener("click",e=>{
    if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const b=e.target&&e.target.closest&&e.target.closest(".star-btn,.rail-fav[data-fav-intent]");
    if(!b||b.classList.contains("on")) return;
    const r=b.getBoundingClientRect();
    const d=document.createElement("div");
    d.className="e-star-pop";
    d.style.left=(r.left+r.width/2)+"px";
    d.style.top=(r.top+r.height/2)+"px";
    d.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true">'+_STAR+'</svg>';
    document.body.appendChild(d);
    d.addEventListener("animationend",()=>d.remove());
    setTimeout(()=>{ if(d.parentNode) d.remove(); },800);
  },true);

  /* ---- Eye pop: a hide closes an eye, a return opens one, in the buttons' own strokes and the
     button's colour, spawned like the star pop; a card's hide button says which way by its class,
     danger while the card is visible. READ ON THE NEAR SIDE, DRAWN AFTER THE PAINT: rect and
     colour are taken on the capture phase, before the row is replaced; the overlay is added two
     frames on, once the rebuilt list has painted, because the lid is a path animation on the main
     thread and Firefox drops its first frames under that paint. The star rides the compositor. */
  document.addEventListener("click",e=>{
    if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const b=e.target&&e.target.closest&&e.target.closest('[data-act="hide"],[data-hide-intent],[data-show-intent],[data-hide-card],[data-show-card]');
    if(!b) return;
    const opening=b.hasAttribute("data-show-intent")||b.hasAttribute("data-show-card")
      ||(b.getAttribute("data-act")==="hide" && !b.classList.contains("danger"));
    const r=b.getBoundingClientRect();
    const colour=getComputedStyle(b).color;
    /* The button's own small eye would show through the pop's open one and read as a second
       pupil under the lid, so it steps aside while the pop plays. The row usually re-renders
       the button before the pop ends; if this one survives, it comes back. */
    const ic=b.querySelector("svg"); if(ic) ic.style.visibility="hidden";
    requestAnimationFrame(()=>requestAnimationFrame(()=>{   // after the rebuilt frame has painted - see animateTabInsert
      const d=document.createElement("div");
      d.className="e-eye-pop"+(opening?" open":"");
      d.style.color=colour;
      d.style.left=(r.left+r.width/2)+"px";
      d.style.top=(r.top+r.height/2)+"px";
      const clip="eEyeClip"+(++eEyePopN);   // one clip per pop: two pops can be in flight
      d.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><clipPath id="'+clip+'"><path class="lid"/></clipPath>'
        +'<circle class="pupil" cx="10" cy="10" r="2.5" clip-path="url(#'+clip+')"/>'
        +'<path class="lid"/><g class="lashes"><path d="M3.5 12.07l-1.4 1.9"/><path d="M7.2 13.64l-0.7 2.3"/><path d="M12.8 13.64l0.7 2.3"/><path d="M16.5 12.07l1.4 1.9"/></g></svg>';
      document.body.appendChild(d);
      const done=()=>{ d.remove(); if(ic&&ic.isConnected) ic.style.visibility=""; };
      d.querySelector("svg").addEventListener("animationend",e=>{ if(e.target===e.currentTarget) done(); });
      setTimeout(()=>{ if(d.parentNode) done(); },1000);
    }));
  },true);

  /* ---- Copy wash. Clicking a macro washes THAT block success-green while the toast below
     carries the words - the WHERE at the fingertip, the WHAT where it always was. Click only:
     a keyboard copy already holds the selection ring on the very block it copies. The
     pointerdown distance check keeps a drag-reorder quiet - the app suppresses the copy on a
     drag, so the wash must not fire either. Bubble phase: the app's own handler goes first. */
  document.addEventListener("pointerdown",e=>{ eWashDownX=e.clientX; eWashDownY=e.clientY; },true);
  document.addEventListener("click",e=>{
    if(Math.hypot(e.clientX-eWashDownX,e.clientY-eWashDownY)>5) return;
    const t=e.target&&e.target.closest&&e.target.closest(".txt");
    if(!t) return;
    eWashOver(t);
    const card=t.closest(".card[data-id]");
    if(card) eNoteRecent(card.dataset.id);
  });
}

export {
  eCopyFeedback,
  wirePops
};
