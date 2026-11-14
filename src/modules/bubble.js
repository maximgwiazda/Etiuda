/* THE BUBBLE, one shape for every notice the program hangs off a control: a filled panel with a
   pointer on the edge that faces its target. The tour's card, a card's note, the catalog offer and
   the name question wear it - one idiom by construction rather than by resemblance,
   so the placement lives here instead of once in the tour and again in a copy of it.
   Imports nothing, so it can never join a cycle - and A SECOND PROGRAM IMPORTS THIS FILE from a
   pinned commit, so that has become a contract rather than a convenience: an import added here
   is one that program must be able to resolve. Its dress is engine/bubble.css, the marked span
   of src/template.html. */
const BUB={
  gap:10,        // between the target's edge and the pointer's point
  margin:12,     // and the least the bubble ever comes to the screen's edge
  tip:12,        // the pointer is a square of this, turned 45 degrees
  corner:22      // and never sits nearer the bubble's own corner than this
};
/* BELOW IF IT FITS, ELSE ABOVE, ELSE BESIDE, ELSE OVER IT WITH NO POINTER. `prefer` moves its
   own side to the front and leaves the rest in order, so every bubble on screen degrades the
   same way as the window shrinks - which is what makes this one rule rather than four. */
const BUB_ORDER={
  below:["below","above","right","left"],
  above:["above","below","right","left"],
  right:["right","left","below","above"],
  left:["left","right","below","above"]
};
const bubClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** Places `el` against `target` {top,left,width,height}, viewport coordinates, and says what it
 *  did. The pointer is a child element created on first use, so no caller owns markup for it.
 *  @returns {{side:string,top:number,left:number,tip:number|null,width:number,height:number}} */
function placeBubble(el, target, opts){
  opts=opts||{};
  const gap=opts.gap==null?BUB.gap:opts.gap, m=BUB.margin;
  const vw=innerWidth, vh=innerHeight;
  let tip=el.querySelector(":scope > .bub-tip");
  if(!tip){
    tip=document.createElement("i");
    tip.className="bub-tip"; tip.setAttribute("aria-hidden","true");
    el.appendChild(tip);
  }
  if(opts.width) el.style.width=Math.min(opts.width, vw-m*2)+"px";
  const w=el.offsetWidth, h=el.offsetHeight;
  const x=target.left, y=target.top, tw=target.width, th=target.height;
  const cx=x+tw/2, cy=y+th/2;
  const fits={
    below:y+th+gap+h<vh-m,
    above:y-gap-h>m,
    right:x+tw+gap+w<vw-m,
    left:x-gap-w>m
  };
  const side=(BUB_ORDER[opts.prefer]||BUB_ORDER.below).find(s=>fits[s])||"none";
  /* The pointer is centred on the target and then held off the corners, so a bubble clamped
     against the screen's edge still points AT the thing rather than out of its own corner. */
  let top, left, tx=null, ty=null;
  if(side==="below"||side==="above"){
    top=side==="below" ? y+th+gap : y-gap-h;
    left=bubClamp(cx-w/2, m, Math.max(m, vw-w-m));
    tx=bubClamp(cx-left, BUB.corner, Math.max(BUB.corner, w-BUB.corner));
  } else if(side==="right"||side==="left"){
    left=side==="right" ? x+tw+gap : x-gap-w;
    top=bubClamp(cy-h/2, m, Math.max(m, vh-h-m));
    ty=bubClamp(cy-top, BUB.corner, Math.max(BUB.corner, h-BUB.corner));
  } else {
    top=bubClamp(cy-h/2, m, Math.max(m, vh-h-m));
    left=bubClamp(cx-w/2, m, Math.max(m, vw-w-m));
  }
  el.style.top=top+"px"; el.style.left=left+"px";
  el.style.right="auto"; el.style.bottom="auto";
  el.setAttribute("data-side", side);
  /* Offset along ONE axis only; the other is cleared so the class for the side keeps it pinned
     to the edge. Half the square back, because the offset names the point, not its box. */
  tip.style.left = tx==null ? "" : (tx-BUB.tip/2)+"px";
  tip.style.top  = ty==null ? "" : (ty-BUB.tip/2)+"px";
  return {side:side, top:top, left:left, tip:tx==null?ty:tx, width:w, height:h};
}
/* HUNG FROM ITS ORIGIN FOR AS LONG AS IT STANDS: `origin` (an element, or a function answering one) is asked again
   at every placing, since a repaint replaces the control. Where it answers nothing the bubble stays where it last
   stood, or at its own resting place if it never stood anywhere. Call it once `el` is in the document. */
function hangBubble(el, origin, opts){
  if(!el || !el.isConnected) return ()=>{};
  let raf=0, placed=false;
  const box=()=>{
    let o=null;
    try{ o=typeof origin==="function" ? origin() : origin; }catch(e){ o=null; }
    if(!o || !o.isConnected) return null;
    const r=o.getBoundingClientRect();
    return (r.width || r.height) ? r : null;
  };
  const on=typeof addEventListener==="function" && typeof removeEventListener==="function";
  const drop=()=>{
    mo.disconnect();
    if(on){ removeEventListener("resize", again); removeEventListener("scroll", again, {capture:true}); }
    if(raf) cancelAnimationFrame(raf); raf=0;
  };
  const place=()=>{
    raf=0;
    if(!el.isConnected){ drop(); return; }
    const r=box();
    if(!r){ if(!placed) el.setAttribute("data-side","none"); return; }
    placeBubble(el, {top:r.top, left:r.left, width:r.width, height:r.height}, opts);
    placed=true;
  };
  const again=()=>{ if(!raf && typeof requestAnimationFrame==="function") raf=requestAnimationFrame(place); };
  const mo=typeof MutationObserver!=="function" ? {observe(){}, disconnect(){}} : new MutationObserver(rs=>{
    if(!el.isConnected){ drop(); return; }
    if(!rs.every(m=>el.contains(m.target))) again();
  });
  if(document.body) mo.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:["hidden","open","class","style"]});
  if(on){ addEventListener("resize", again, {passive:true}); addEventListener("scroll", again, {passive:true, capture:true}); }
  place();
  return drop;
}
export {
  placeBubble,
  hangBubble
};
