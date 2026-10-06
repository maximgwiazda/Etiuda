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
    fine.push([128+FIFTH_A*Math.sin(3*t+phi), 128+FIFTH_A*Math.sin(2*t), t]);
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
/* The line's centreline at a phase, in the header's own box: Hermite cubics through the pass from the
   figure's own derivatives, open at the standard phase and closed by the mirrored pass at any other.
   Stroked at 2 fifthRadius() with round ends and joins, it paints the mark's one smooth line. */
function fifthLinePath(phi){
  const f=fifthFit(), pass=fifthPass(phi), n=pass.length, closed=Math.abs(phi-FIFTH_PHI0)>1e-9;
  const pt=(p,m)=>[(m ? FIFTH_BOX-p[0] : p[0])*f.k+f.ox, p[1]*f.k+f.oy];
  const vel=(t,m)=>[(m ? -3 : 3)*FIFTH_A*Math.cos(3*t+phi)*f.k, 2*FIFTH_A*Math.cos(2*t)*f.k];
  const seq=pass.map(p=>[p,false]);
  if(closed) for(let i=1;i<n;i++) seq.push([pass[i],true]);
  let d="M"+pt(seq[0][0],false).map(fifthF2).join(" ");
  for(let i=1;i<seq.length;i++){
    const a=seq[i-1], b=seq[i], dt=(b[0][2]-a[0][2]+Math.PI)%Math.PI;
    const p0=pt(a[0],a[1]), p1=pt(b[0],b[1]), v0=vel(a[0][2],a[1]), v1=vel(b[0][2],b[1]);
    d+="C"+[p0[0]+v0[0]*dt/3, p0[1]+v0[1]*dt/3, p1[0]-v1[0]*dt/3, p1[1]-v1[1]*dt/3, p1[0], p1[1]].map(fifthF2).join(" ");
  }
  return closed ? d+"Z" : d;
}
/* THE BAND AT A PHASE, for marks drawn in dots: the centres of the pass and its mirror, in the
   header's box, both halves of the loop whatever the phase (at the standard one they lie on one another).
   Each carries its depth, z from -1 (far) to 1 (near): the figure is the shadow of a curve on a turning
   cylinder, so the pass is at cos(3t + phi) and its mirror, half a turn on, at the opposite. */
function fifthBand(phi){
  const f=fifthFit(), pass=fifthPass(phi), out=[];
  pass.forEach(p=>{
    const z=Math.cos(3*p[2]+phi);
    out.push([p[0]*f.k+f.ox, p[1]*f.k+f.oy, z]);
    out.push([(FIFTH_BOX-p[0])*f.k+f.ox, p[1]*f.k+f.oy, -z]);
  });
  return out;
}
// The discs' radius in the header's box.
function fifthRadius(){ return FIFTH_R*fifthFit().k; }
// Light by depth, never gone: the far pass is FIFTH_FAR of the near one, eased between.
const FIFTH_FAR=0.6;
function fifthLight(z){
  const u=z*0.5+0.5;
  return FIFTH_FAR+(1-FIFTH_FAR)*u*u*(3-2*u);
}

/* THE BAND LAID ON A LATTICE: lat={x0,y0,step,nx,ny} is a grid of dots, `to` maps the header's box into the
   grid's units in place, rad is the disc radius in those units. Writes into out (nx*ny, row by row) each
   dot's light, 0 to 1: a dot inside a disc is lit by its pass's depth, fading over `feather` at the rim,
   and where passes cross the nearer one wins. A dot is lit when and only when it is inside the band, so
   the band is solid and even at every phase and the dots lit follow its area. */
function fifthLay(phi, to, rad, feather, lat, out){
  out.fill(0);
  const o=[0,0];
  fifthBand(phi).forEach(p=>{
    o[0]=p[0]; o[1]=p[1]; to(o);
    const lum=fifthLight(p[2]);
    const i0=Math.max(0,Math.ceil((o[0]-rad-lat.x0)/lat.step)), i1=Math.min(lat.nx-1,Math.floor((o[0]+rad-lat.x0)/lat.step));
    const j0=Math.max(0,Math.ceil((o[1]-rad-lat.y0)/lat.step)), j1=Math.min(lat.ny-1,Math.floor((o[1]+rad-lat.y0)/lat.step));
    for(let j=j0;j<=j1;j++){
      for(let i=i0;i<=i1;i++){
        const d=Math.hypot(lat.x0+i*lat.step-o[0], lat.y0+j*lat.step-o[1]);
        if(d>=rad) continue;
        const v=Math.min(1,(rad-d)/feather)*lum, k=j*lat.nx+i;
        if(v>out[k]) out[k]=v;
      }
    }
  });
  return out;
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
  let raf=0, painted=-Infinity, stroked=false;
  // The markup's path is the mark's filled outline, which no frame could remake: turning, the node
  // strokes the centreline instead, and standing it is the markup's again.
  const stroke=on=>{
    if(on===stroked) return;
    stroked=on;
    node.setAttribute("fill", on ? "none" : "currentColor");
    node.setAttribute("stroke", on ? "currentColor" : "none");
    if(on){ node.setAttribute("stroke-width", fifthF2(2*fifthRadius())); node.setAttribute("stroke-linecap","round"); node.setAttribute("stroke-linejoin","round"); }
  };
  const frame=ms=>{
    raf=requestAnimationFrame(frame);
    fifthTick(ms);
    if(ms-painted<FIFTH_PAINT_MS) return;
    painted=ms;
    stroke(true);
    node.setAttribute("d", fifthLinePath(fifthPhase()));
  };
  const sync=()=>{
    const still=mgReduceMotion(), go=!still && !document.hidden;
    if(go && !raf){ fifthClock.last=null; raf=requestAnimationFrame(frame); }
    if(!go && raf){ cancelAnimationFrame(raf); raf=0; }
    if(still){ fifthRest(); stroke(false); if(node.getAttribute("d")!==std) node.setAttribute("d",std); }
  };
  document.addEventListener("visibilitychange",sync);
  new MutationObserver(sync).observe(document.documentElement,{attributes:true, attributeFilter:["class"]});
  sync();
}

export {
  FIFTH_PHI0,
  fifthBand,
  fifthLinePath,
  fifthLay,
  fifthPhase,
  fifthRadius,
  wireFifth
};
