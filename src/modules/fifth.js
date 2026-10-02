/* THE FIFTH, TURNING: x = sin(3s + phi), y = sin(2s). phi starts at the standard figure and advances
   at 2 pi times a 0.007 Hz detune, one step per frame and each step capped, so a window that was
   hidden resumes where it stopped. Under either quiet switch nothing moves and every mark is the
   standard figure. */
import { mgReduceMotion } from "./motion.js";

const FIFTH_PHI0=Math.PI/4, FIFTH_W0=2*Math.PI*0.007, FIFTH_MAX_DT=1/30, FIFTH_PAINT_MS=50;
const FIFTH_A=96, FIFTH_R=10, FIFTH_SPACING=0.6, FIFTH_FINE=4000, FIFTH_INK=150, FIFTH_BOX=256;
const FIFTH_T0=3*Math.PI/4, FIFTH_T1=7*Math.PI/4;

/* The standard figure retraces itself between its two turning points, so one pass of it is the
   whole mark; at any other phase the second half of the loop is that pass mirrored across x. */
function fifthPass(phi){
  const fine=[];
  for(let i=0;i<=FIFTH_FINE;i++){
    const t=FIFTH_T0+(FIFTH_T1-FIFTH_T0)*i/FIFTH_FINE;
    fine.push([128+FIFTH_A*Math.sin(3*t+phi), 128+FIFTH_A*Math.sin(2*t)]);
  }
  const out=[fine[0]]; let acc=0;
  for(let i=1;i<fine.length;i++){
    acc+=Math.hypot(fine[i][0]-fine[i-1][0], fine[i][1]-fine[i-1][1]);
    if(acc>=FIFTH_R*FIFTH_SPACING){ out.push(fine[i]); acc=0; }
  }
  out.push(fine[fine.length-1]);
  return out;
}
// The standard figure's fit into the box, taken once and kept for every phase.
let fifthFitStd=null;
function fifthFit(){
  if(fifthFitStd) return fifthFitStd;
  const c=fifthPass(FIFTH_PHI0), r=FIFTH_R;
  const x1=Math.min(...c.map(p=>p[0]-r)), x2=Math.max(...c.map(p=>p[0]+r));
  const y1=Math.min(...c.map(p=>p[1]-r)), y2=Math.max(...c.map(p=>p[1]+r));
  const k=FIFTH_INK/Math.max(x2-x1,y2-y1);
  return fifthFitStd={k:k, ox:FIFTH_BOX/2-k*(x1+x2)/2, oy:FIFTH_BOX/2-k*(y1+y2)/2};
}
const fifthF2=v=>(Math.round(v*100)/100).toFixed(2).replace(/\.?0+$/,"");
// The small cut at a phase: one filled path of overlapping circles, in the header's own box.
function fifthCutPath(phi){
  const f=fifthFit(), pass=fifthPass(phi), pts=pass.slice();
  if(Math.abs(phi-FIFTH_PHI0)>1e-9) for(let i=pass.length-2;i>0;i--) pts.push([FIFTH_BOX-pass[i][0], pass[i][1]]);
  const r=FIFTH_R*f.k;
  return pts.map(p=>{
    const x=p[0]*f.k+f.ox, y=p[1]*f.k+f.oy;
    return "M"+fifthF2(x-r)+" "+fifthF2(y)+"a"+fifthF2(r)+" "+fifthF2(r)+" 0 1 0 "+fifthF2(2*r)+" 0a"+fifthF2(r)+" "+fifthF2(r)+" 0 1 0 "+fifthF2(-2*r)+" 0";
  }).join("")+"Z";
}
// The figure's point at parameter t and phase phi, in the header's box, written into out.
function fifthAt(t, phi, out){
  const f=fifthFit();
  out[0]=(128+FIFTH_A*Math.sin(3*t+phi))*f.k+f.ox;
  out[1]=(128+FIFTH_A*Math.sin(2*t))*f.k+f.oy;
}

/* DOTS THAT RIDE THE FIGURE: each takes the parameter of its nearest point on the standard pass and
   the offset from it, so at the standard phase it stands where it stood. Half take the mirrored
   parameter, the same point there and the loop's other half once it turns. `to` maps the header's
   box into the dots' units, in place. */
function fifthRide(dots, to){
  const N=1500, ts=[], xs=[], ys=[], o=[0,0];
  for(let i=0;i<=N;i++){
    const t=FIFTH_T0+(FIFTH_T1-FIFTH_T0)*i/N;
    fifthAt(t, FIFTH_PHI0, o); to(o);
    ts.push(t); xs.push(o[0]); ys.push(o[1]);
  }
  dots.forEach(p=>{
    let b=0, bd=Infinity;
    for(let i=0;i<=N;i++){
      const d=(p.x-xs[i])*(p.x-xs[i])+(p.y-ys[i])*(p.y-ys[i]);
      if(d<bd){ bd=d; b=i; }
    }
    p.t=Math.random()<0.5 ? ts[b] : 3*Math.PI/2-ts[b];
    p.ox=p.x-xs[b]; p.oy=p.y-ys[b];
  });
  return (p, phi, out)=>{
    fifthAt(p.t, phi, out); to(out);
    out[0]+=p.ox; out[1]+=p.oy;
  };
}

// ---- the one clock ----
const fifthClock={phi:FIFTH_PHI0, last:null};
function fifthStep(phi, dt){ return phi+FIFTH_W0*Math.max(0,Math.min(FIFTH_MAX_DT,dt)); }
function fifthTick(ms){
  const c=fifthClock;
  c.phi=fifthStep(c.phi, c.last===null ? 1/60 : (ms-c.last)/1000);
  c.last=ms;
}
function fifthPhase(){ return fifthClock.phi; }
function fifthRest(){ fifthClock.phi=FIFTH_PHI0; fifthClock.last=null; }

/* THE HEADER'S MARK turns on the page's frames, repainted every FIFTH_PAINT_MS, only while the page
   is shown and no quiet switch is on. The clock ticks on every frame, so the step cap only ever
   bites on a late one. */
function wireFifth(){
  const node=document.querySelector(".brand-tile svg path");
  if(!node) return;
  const std=node.getAttribute("d");
  let raf=0, painted=-Infinity;
  const frame=ms=>{
    raf=requestAnimationFrame(frame);
    fifthTick(ms);
    if(ms-painted<FIFTH_PAINT_MS) return;
    painted=ms;
    node.setAttribute("d", fifthCutPath(fifthPhase()));
  };
  const sync=()=>{
    const still=mgReduceMotion(), go=!still && !document.hidden;
    if(go && !raf){ fifthClock.last=null; raf=requestAnimationFrame(frame); }
    if(!go && raf){ cancelAnimationFrame(raf); raf=0; }
    if(still){ fifthRest(); if(node.getAttribute("d")!==std) node.setAttribute("d",std); }
  };
  document.addEventListener("visibilitychange",sync);
  new MutationObserver(sync).observe(document.documentElement,{attributes:true, attributeFilter:["class"]});
  sync();
}

export {
  FIFTH_PHI0,
  fifthAt,
  fifthCutPath,
  fifthPhase,
  fifthRide,
  wireFifth
};
