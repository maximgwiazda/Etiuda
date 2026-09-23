/* THE EMPTY DESK'S MARK: the header's own glyph, drawn in dots like the ground it stands on,
   gathers out of scattered light when the empty desk appears and twinkles while it stays. A
   dialog standing over the desk holds the gathering until it closes, so it is seen. Under
   either quiet switch it is drawn once, gathered and still. */
import { mgReduceMotion } from "./motion.js";

const MARK_PX=280, MARK_STEP=3.5, GATHER_MS=1100, FRAME_MS=33, TWINKLE_MS=66, ALPHA_STEPS=16;
let eMark=null;

/* The glyph is read off the header's copy, never redrawn: its path and group transform, scaled
   from the viewBox to the canvas, sampled on a grid by isPointInPath. */
function markDots(){
  const svg=document.querySelector(".brand svg"), path=svg && svg.querySelector("path");
  if(!path) return [];
  const g=path.parentNode, probe=document.createElement("canvas").getContext("2d");
  const vb=svg.viewBox && svg.viewBox.baseVal, s=MARK_PX/((vb && vb.width)||256);
  probe.setTransform(s,0,0,s,0,0);
  const tf=g && g.transform && g.transform.baseVal.consolidate();
  if(tf){ const m=tf.matrix; probe.transform(m.a,m.b,m.c,m.d,m.e,m.f); }
  const shape=new Path2D(path.getAttribute("d")), dots=[];
  for(let y=MARK_STEP/2; y<MARK_PX; y+=MARK_STEP){
    for(let x=MARK_STEP/2; x<MARK_PX; x+=MARK_STEP){
      if(!probe.isPointInPath(shape,x,y)) continue;
      const a=Math.random()*6.2832, r=60+Math.random()*140;
      dots.push({x:x, y:y, sx:MARK_PX/2+Math.cos(a)*r, sy:MARK_PX/2+Math.sin(a)*r,
        ph:Math.random()*6.2832, sp:0.6+Math.random()*0.9});
    }
  }
  return dots;
}
// Dots are batched by alpha into a few fills a frame rather than one fill a dot.
function drawMark(k, now){
  const still=mgReduceMotion(), ctx=k.ctx;
  const t=(now-k.born)/1000, gather=still ? 1 : Math.min(1,(now-k.born)/GATHER_MS);
  const e=1-Math.pow(1-gather,3);
  const bins=[];
  k.dots.forEach(p=>{
    const tw=still ? 0.75 : 0.55+0.45*Math.sin(p.ph+t*p.sp*1.6);
    const a=Math.min(1, tw*(0.45+0.75*e));
    const b=Math.round(a*ALPHA_STEPS);
    if(b) (bins[b]||(bins[b]=[])).push(p);
  });
  ctx.clearRect(0,0,MARK_PX,MARK_PX);
  ctx.fillStyle=getComputedStyle(k.cv).color;
  bins.forEach((ps,b)=>{
    ctx.globalAlpha=b/ALPHA_STEPS;
    ctx.beginPath();
    ps.forEach(p=>{
      const x=p.sx+(p.x-p.sx)*e, y=p.sy+(p.y-p.sy)*e;
      ctx.moveTo(x+1.05,y); ctx.arc(x,y,1.05,0,6.2832);
    });
    ctx.fill();
  });
  ctx.globalAlpha=1;
}
/* Frames are asked for at the pace they are drawn, a timer between them, so a twinkling mark
   wakes the page fifteen times a second rather than sixty. */
function markFrame(now){
  const k=eMark;
  if(!k || !k.cv.isConnected){ stopEmptyMark(); return; }
  // A dialog arriving mid-gathering puts it back to the start, to play once the dialog is gone.
  if(now-k.born<GATHER_MS && dialogStanding()){
    k.ctx.clearRect(0,0,MARK_PX,MARK_PX);
    startMark(k);
    return;
  }
  drawMark(k, now);
  if(mgReduceMotion()) return;
  k.hold=setTimeout(()=>{ k.raf=requestAnimationFrame(markFrame); },
    now-k.born<GATHER_MS ? FRAME_MS : TWINKLE_MS);
}
function dialogStanding(){ return !!document.querySelector(".modal:not([hidden])"); }
function startMark(k){
  if(mgReduceMotion()){ drawMark(k, performance.now()); return; }
  if(dialogStanding()){ k.hold=setTimeout(()=>startMark(k),150); return; }
  k.born=performance.now();
  k.raf=requestAnimationFrame(markFrame);
}
function stopEmptyMark(){
  const k=eMark;
  if(!k) return;
  eMark=null;
  cancelAnimationFrame(k.raf); clearTimeout(k.hold);
  if(k.theme) k.theme.disconnect();
  if(k.cv.parentNode) k.cv.remove();
}
/* render() hands over the empty desk's block, or null for any other list. A re-render of the
   empty desk moves the same drawing into the new block: one gathering per appearance. */
function syncEmptyMark(host){
  if(!host){ stopEmptyMark(); return; }
  if(eMark){
    host.insertBefore(eMark.cv, host.firstChild);
    if(mgReduceMotion()) drawMark(eMark, performance.now());
    return;
  }
  const dots=markDots();
  if(!dots.length) return;
  const cv=document.createElement("canvas"), dpr=Math.min(window.devicePixelRatio||1,2);
  cv.className="e-empty-mark";
  cv.setAttribute("aria-hidden","true");
  cv.width=cv.height=Math.round(MARK_PX*dpr);
  host.insertBefore(cv, host.firstChild);
  const ctx=cv.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const k=eMark={cv:cv, ctx:ctx, dots:dots, born:0, raf:0, hold:0, theme:null};
  // A still mark has no frame to pick up a new theme's accent, so it is redrawn on the flip.
  k.theme=new MutationObserver(()=>{ if(mgReduceMotion()) drawMark(k, performance.now()); });
  k.theme.observe(document.documentElement,{attributes:true, attributeFilter:["data-theme"]});
  startMark(k);
}

export {
  syncEmptyMark
};
