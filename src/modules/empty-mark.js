/* THE EMPTY DESK'S MARK: the header's own glyph, drawn in dots like the ground it stands on,
   gathers out of scattered light when the empty desk appears and twinkles while it stays. A
   dialog standing over the desk holds the gathering until it closes, so it is seen. Under
   either quiet switch it is drawn once, gathered and still. */
import { mgReduceMotion, M_MS } from "./motion.js";
import { FIFTH_PHI0, fifthBand, fifthLay, fifthPhase, fifthRadius } from "./fifth.js";

const MARK_PX=280, MARK_STEP=3.5, MARK_FEATHER=MARK_STEP/2, GATHER_MS=M_MS.gather, TWINKLE_MS=M_MS.twinkle, ALPHA_STEPS=16;
// A wait on the gather is let go once no frame has come for this long.
const MARK_QUIET_MS=1000;
let eMark=null, markWaiters=[], markLay=null;

/* THE DESK'S DOTS ARE A FIXED LATTICE and the figure is the band laid over it, as the hero's is: a dot is lit
   when it stands inside the band at the phase (fifth.js, fifthLay), so the band is one solid, even stretch of
   dots at every phase, the dots lit follow its area, and a dot at the rim fades rather than blinks. Depth is
   light only, the far pass dimmer, never gone. The lattice holds every dot the band can reach: the figure
   never leaves the standard one's square. The header's group transform, scaled to the canvas, takes the
   figure's box onto it; the figure comes from fifth.js, the header's own path may be mid-turn. */
function markDots(){
  const svg=document.querySelector(".brand svg"), path=svg && svg.querySelector("path");
  if(!path) return [];
  const g=path.parentNode;
  const vb=svg.viewBox && svg.viewBox.baseVal, s=MARK_PX/((vb && vb.width)||256);
  const tf=g && g.transform && g.transform.baseVal.consolidate();
  const m=tf ? tf.matrix : {a:1,b:0,c:0,d:1,e:0,f:0};
  const to=o=>{ const u=o[0], v=o[1]; o[0]=s*(m.a*u+m.c*v+m.e); o[1]=s*(m.b*u+m.d*v+m.f); };
  const rad=fifthRadius()*s*Math.hypot(m.a,m.b), o=[0,0];
  let x1=Infinity, x2=-Infinity, y1=Infinity, y2=-Infinity;
  fifthBand(FIFTH_PHI0).forEach(p=>{
    o[0]=p[0]; o[1]=p[1]; to(o);
    x1=Math.min(x1,o[0]); x2=Math.max(x2,o[0]); y1=Math.min(y1,o[1]); y2=Math.max(y2,o[1]);
  });
  const pad=rad+MARK_STEP, half=MARK_STEP/2;
  const i0=Math.max(0,Math.floor((x1-pad-half)/MARK_STEP)), i1=Math.min(Math.floor(MARK_PX/MARK_STEP)-1,Math.ceil((x2+pad-half)/MARK_STEP));
  const j0=Math.max(0,Math.floor((y1-pad-half)/MARK_STEP)), j1=Math.min(Math.floor(MARK_PX/MARK_STEP)-1,Math.ceil((y2+pad-half)/MARK_STEP));
  const lat={x0:half+i0*MARK_STEP, y0:half+j0*MARK_STEP, step:MARK_STEP, nx:i1-i0+1, ny:j1-j0+1}, dots=[];
  for(let j=0;j<lat.ny;j++){
    for(let i=0;i<lat.nx;i++){
      const a=Math.random()*6.2832, r=60+Math.random()*140;
      dots.push({x:lat.x0+i*MARK_STEP, y:lat.y0+j*MARK_STEP, sx:MARK_PX/2+Math.cos(a)*r, sy:MARK_PX/2+Math.sin(a)*r,
        ph:Math.random()*6.2832, sp:0.6+Math.random()*0.9, l:0});
    }
  }
  const light=new Float32Array(dots.length);
  markLay=(ds, phi)=>{
    fifthLay(phi, to, rad, MARK_FEATHER, lat, light);
    for(let n=0;n<ds.length;n++) ds[n].l=light[n];
  };
  return dots;
}
// Dots are batched by alpha into a few fills a frame rather than one fill a dot. `ms` is the
// mark's own clock (markFrame), never the wall's.
function drawMark(k, ms){
  const still=mgReduceMotion(), ctx=k.ctx;
  const t=ms/1000, gather=still ? 1 : Math.min(1,ms/GATHER_MS);
  const e=1-Math.pow(1-gather,3);
  const bins=[], phi=k.lay ? (still ? FIFTH_PHI0 : fifthPhase()) : 0;
  if(k.lay && k.laid!==phi){ k.lay(k.dots, phi); k.laid=phi; }
  k.dots.forEach(p=>{
    const lit=k.lay ? p.l : 1;
    if(!lit) return;
    const tw=still ? 0.75 : 0.55+0.45*Math.sin(p.ph+t*p.sp*1.6);
    const a=Math.min(1, tw*(0.45+0.75*e))*lit;
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
/* THE GATHER RUNS AT THE DISPLAY'S RATE: it is the first motion a new person sees. Its clock starts
   at its first frame and a frame moves it on by at most two of the shortest intervals seen (60 Hz's
   until one is), so a late frame holds the dots rather than jumping them. The twinkle after it asks
   for frames at its own pace, on the wall's clock, so a mark left standing wakes the page fifteen
   times a second rather than sixty. */
function markFrame(now){
  const k=eMark;
  if(!k || !k.cv.isConnected){ stopEmptyMark(); return; }
  // A dialog arriving mid-gathering puts it back to the start, to play once the dialog is gone.
  if(k.ms<GATHER_MS && dialogStanding()){
    k.ctx.clearRect(0,0,MARK_PX,MARK_PX);
    startMark(k);
    return;
  }
  if(k.last){
    const dt=Math.max(0, now-k.last);
    if(dt>0) k.gap=Math.max(2, Math.min(k.gap, dt));
    k.ms+=k.ms<GATHER_MS ? Math.min(dt, 2*k.gap) : dt;
  }
  k.last=now;
  drawMark(k, k.ms);
  if(k.ms>=GATHER_MS) markFormed(k);
  if(mgReduceMotion()){ markFormed(k); return; }
  if(k.ms<GATHER_MS){ k.raf=requestAnimationFrame(markFrame); return; }
  k.hold=setTimeout(()=>{ k.raf=requestAnimationFrame(markFrame); }, TWINKLE_MS);
}
function markFormed(k){
  if(k.formed) return;
  k.formed=true;
  releaseMarkWaiters();
}
// Each on a task of its own, so none of them is spent inside the frame that ends the gather.
function releaseMarkWaiters(){
  const w=markWaiters;
  markWaiters=[];
  w.forEach(fn=>setTimeout(fn,0));
}
/* WHAT WAITS FOR THE GATHER: run once the mark has formed or gone, at once where none is gathering,
   and let go after MARK_QUIET_MS without a frame, since rAF does not run in a hidden page. */
function whenMarkFormed(fn){
  const k=eMark;
  if(!k || k.formed){ fn(); return; }
  let done=false;
  const once=()=>{ if(!done){ done=true; fn(); } };
  markWaiters.push(once);
  const since=performance.now();
  const watch=()=>{
    if(done) return;
    const quiet=performance.now()-Math.max(k.last, since);
    if(quiet>=MARK_QUIET_MS || eMark!==k) once();
    else setTimeout(watch, MARK_QUIET_MS-quiet);
  };
  setTimeout(watch, MARK_QUIET_MS);
}
function dialogStanding(){ return !!document.querySelector(".modal:not([hidden]):not(.e-gone)"); }
function startMark(k){
  if(mgReduceMotion()){ drawMark(k, k.ms); markFormed(k); return; }
  if(dialogStanding()){ k.hold=setTimeout(()=>startMark(k),150); return; }
  k.ms=0; k.last=0;
  k.raf=requestAnimationFrame(markFrame);
}
function stopEmptyMark(){
  const k=eMark;
  if(!k) return;
  eMark=null;
  cancelAnimationFrame(k.raf); clearTimeout(k.hold);
  if(k.theme) k.theme.disconnect();
  if(k.cv.parentNode) k.cv.remove();
  releaseMarkWaiters();
}
/* render() hands over the empty desk's block, or null for any other list. A re-render of the
   empty desk moves the same drawing into the new block: one gathering per appearance. */
function syncEmptyMark(host){
  if(!host){ stopEmptyMark(); return; }
  if(eMark){
    host.insertBefore(eMark.cv, host.firstChild);
    if(mgReduceMotion()) drawMark(eMark, eMark.ms);
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
  const k=eMark={cv:cv, ctx:ctx, dots:dots, lay:markLay, laid:null, ms:0, last:0, gap:1000/60, formed:false, raf:0, hold:0, theme:null};
  // A still mark has no frame to pick up a new theme's accent, so it is redrawn on the flip.
  k.theme=new MutationObserver(()=>{ if(mgReduceMotion()) drawMark(k, k.ms); });
  k.theme.observe(document.documentElement,{attributes:true, attributeFilter:["data-theme"]});
  startMark(k);
}

export {
  dialogStanding,
  syncEmptyMark,
  whenMarkFormed
};
