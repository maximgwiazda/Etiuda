/* THE LAUNCH MARK: the desk's dotted mark at the band's half-width LAUNCH_R, arriving at each start of the
   program over its work area, and giving way to the work at max(LAUNCH_MIN_MS, the work ready). A key, a click
   or a wheel ends it at once; a key goes on where it was going. Under a quiet switch it is drawn once, landed and
   still, and stands as long as the moving one does. A SECOND PROGRAM IMPORTS THIS FILE from a pinned commit, so it
   imports nothing: the figure below is fifth.js's with R as an input, and test.js holds the two equal at R 10. */
const LAUNCH_R=7, LAUNCH_MIN_MS=1100, LAUNCH_OUT_MS=260, LAUNCH_QUICK_MS=140, LAUNCH_MAX_MS=4000;
const LM_TAU=Math.PI*2, LM_PHI0=Math.PI/4, LM_PHI1=LM_PHI0+Math.PI;
const LM_A=96, LM_SPACING=0.6, LM_FINE=4000, LM_INK=150, LM_BOX=256, LM_T0=3*Math.PI/4, LM_T1=7*Math.PI/4, LM_FAR=0.6;
const LM_PX=280, LM_STEP=3.5, LM_FEATHER=LM_STEP/2, LM_DOT=1.05, LM_ALPHA_STEPS=16, LM_W0=2*Math.PI*0.007;
// The header's group transform (template.html, .brand svg g), which the empty mark reads off the page.
const LM_G={a:1.0581, b:0, c:0, d:1.0581, e:-7.441, f:-7.441};

/* ---- the figure at a half-width R: fifth.js's pass, fit, band, light and lay ---- */
function launchFigure(R){
  function pass(phi){
    const fine=[];
    for(let i=0;i<=LM_FINE;i++){
      const t=LM_T0+(LM_T1-LM_T0)*i/LM_FINE;
      fine.push([128+LM_A*Math.sin(3*t+phi), 128+LM_A*Math.sin(2*t), t]);
    }
    const out=[fine[0]]; let acc=0;
    for(let i=1;i<fine.length;i++){
      acc+=Math.hypot(fine[i][0]-fine[i-1][0], fine[i][1]-fine[i-1][1]);
      if(acc>=R*LM_SPACING){ out.push(fine[i]); acc=0; }
    }
    out.push(fine[fine.length-1]);
    return out;
  }
  let fitStd=null;
  function fit(){
    if(fitStd) return fitStd;
    const c=pass(LM_PHI0);
    const x1=Math.min(...c.map(p=>p[0]-R)), x2=Math.max(...c.map(p=>p[0]+R));
    const y1=Math.min(...c.map(p=>p[1]-R)), y2=Math.max(...c.map(p=>p[1]+R));
    const k=LM_INK/Math.max(x2-x1,y2-y1);
    return fitStd={k:k, ox:LM_BOX/2-k*(x1+x2)/2, oy:LM_BOX/2-k*(y1+y2)/2};
  }
  function band(phi){
    const f=fit(), out=[];
    pass(phi).forEach(p=>{
      const z=Math.cos(3*p[2]+phi);
      out.push([p[0]*f.k+f.ox, p[1]*f.k+f.oy, z]);
      out.push([(LM_BOX-p[0])*f.k+f.ox, p[1]*f.k+f.oy, -z]);
    });
    return out;
  }
  const radius=()=>R*fit().k;
  const light=z=>{ const u=z*0.5+0.5; return LM_FAR+(1-LM_FAR)*u*u*(3-2*u); };
  function lay(phi, to, rad, feather, lat, out){
    out.fill(0);
    const o=[0,0];
    band(phi).forEach(p=>{
      o[0]=p[0]; o[1]=p[1]; to(o);
      const lum=light(p[2]);
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
  return {R:R, pass:pass, fit:fit, band:band, radius:radius, light:light, lay:lay};
}
// The lattice the figure is laid on, at LM_PX: empty-mark.js markDots without the page.
function launchLattice(F){
  const s=LM_PX/LM_BOX, m=LM_G;
  const to=o=>{ const u=o[0], v=o[1]; o[0]=s*(m.a*u+m.c*v+m.e); o[1]=s*(m.b*u+m.d*v+m.f); };
  const rad=F.radius()*s*Math.hypot(m.a,m.b), o=[0,0];
  let x1=Infinity, x2=-Infinity, y1=Infinity, y2=-Infinity;
  F.band(LM_PHI0).forEach(p=>{
    o[0]=p[0]; o[1]=p[1]; to(o);
    x1=Math.min(x1,o[0]); x2=Math.max(x2,o[0]); y1=Math.min(y1,o[1]); y2=Math.max(y2,o[1]);
  });
  const pad=rad+LM_STEP, half=LM_STEP/2;
  const i0=Math.max(0,Math.floor((x1-pad-half)/LM_STEP)), i1=Math.min(Math.floor(LM_PX/LM_STEP)-1,Math.ceil((x2+pad-half)/LM_STEP));
  const j0=Math.max(0,Math.floor((y1-pad-half)/LM_STEP)), j1=Math.min(Math.floor(LM_PX/LM_STEP)-1,Math.ceil((y2+pad-half)/LM_STEP));
  return {lat:{x0:half+i0*LM_STEP, y0:half+j0*LM_STEP, step:LM_STEP, nx:i1-i0+1, ny:j1-j0+1}, to:to, rad:rad};
}

/* ---- riders: every lit dot of the landed figure has an address on the band ---- */
// The centreline at t and phase phi in the mark's own px, with its unit tangent: o=[x, y, tx, ty].
function launchCurve(F){
  const f=F.fit(), s=LM_PX/LM_BOX, g=LM_G.a, kk=f.k*s*g;
  const ex=s*(g*f.ox+LM_G.e)+s*g*f.k*128, ey=s*(g*f.oy+LM_G.f)+s*g*f.k*128;
  return {at:(t, phi, o)=>{
    let dx=3*Math.cos(3*t+phi), dy=2*Math.cos(2*t), sp=Math.hypot(dx,dy);
    if(sp<1e-6){ dx=3*Math.cos(3*(t+1e-4)+phi); dy=2*Math.cos(2*(t+1e-4)); sp=Math.hypot(dx,dy); }
    o[0]=ex+kk*LM_A*Math.sin(3*t+phi); o[1]=ey+kk*LM_A*Math.sin(2*t);
    o[2]=dx/sp; o[3]=dy/sp; return o;
  }};
}
/* Riders for the figure landed at phi (LM_PHI1 unless given). The loop's two halves are the pass, t from T0 to T1,
   and its mirror, the next half turn of t. A lit dot gets a rider on each half that reaches it, keeping its t and its
   offset along (a) and across (b) the band there, so at phi its place is its dot by construction; the one lighting
   the dot lands with its light and the rest fade. At the standard figure the halves lie on one another, so every
   lit dot has two. NS samples per half, offset half a step off the tails. */
const LM_NS=2400;
function launchRiders(F, L, rest, rnd, phi){
  const C=launchCurve(F), o=[0,0,0,0], lat=L.lat, out=[], random=rnd||Math.random, at=phi==null ? LM_PHI1 : phi;
  const N=2*LM_NS, px=new Float64Array(N), py=new Float64Array(N), pt=new Float64Array(N), reach=L.rad+LM_FEATHER;
  for(let q=0;q<N;q++){ const t=LM_T0+(LM_T1-LM_T0)*(q+0.5)/LM_NS; C.at(t,at,o); px[q]=o[0]; py[q]=o[1]; pt[q]=t; }
  for(let j=0;j<lat.ny;j++) for(let i=0;i<lat.nx;i++){
    const n=j*lat.nx+i, lit=rest[n];
    if(!lit) continue;
    const x=lat.x0+i*LM_STEP, y=lat.y0+j*LM_STEP, half=[];
    for(let h=0;h<2;h++){
      let best=0, bd=Infinity;
      for(let q=h*LM_NS;q<(h+1)*LM_NS;q++){ const d=(px[q]-x)*(px[q]-x)+(py[q]-y)*(py[q]-y); if(d<bd){ bd=d; best=q; } }
      const t=pt[best], d=Math.sqrt(bd), z=Math.cos(3*t+at);
      half.push({t:t, d:d, z:z, v:Math.max(0,Math.min(1,(L.rad-d)/LM_FEATHER))*F.light(z)});
    }
    const lights=half[1].v>half[0].v || (half[1].v===half[0].v && half[1].z>half[0].z) ? 1 : 0;
    half.forEach((hf, h)=>{
      if(h!==lights && hf.d>=reach) return;
      C.at(hf.t,at,o);
      const ox=x-o[0], oy=y-o[1];
      out.push({n:n, t:hf.t, a:ox*o[2]+oy*o[3], b:-ox*o[3]+oy*o[2], hx:x, hy:y, rest:lit,
        feather:Math.min(1, lit/F.light(Math.abs(hf.z))), near:h===lights,
        r:0.8+random()*1.4, ph:0, sp:0, x:0, y:0, cx:0, cy:0});
    });
  }
  return {C:C, list:out};
}
function launchPlace(C, r, phi, o){
  C.at(r.t, phi, o);
  const x=o[0]+r.a*o[2]-r.b*o[3], y=o[1]+r.a*o[3]+r.b*o[2];
  o[0]=x; o[1]=y; return o;
}

/* ---- the drawing: one at a time, on a canvas over its host, the figure standing on the host's .e-fifth-spot ---- */
const LM_TURN_MS=900, LM_GATHER_MS=600, LM_PULL=0.16, LM_SETTLE_MS=700, LM_LANDED_MS=1000;
const LM_SPRITE=64, LM_CORE=9, LM_HALO=2.4, LM_GLOW=0.4, LM_A_MIN=0.35, LM_TWINKLE_MS=400;
const lmEase=u=>u<0.5 ? 2*u*u : 1-Math.pow(-2*u+2,2)/2;
const lmSmooth=u=>{ u=Math.max(0,Math.min(1,u)); return u*u*(3-2*u); };
// A program whose quiet switch is not html.e-still alone passes its own still().
const lmStillDefault=()=>document.documentElement.classList.contains("e-still");
let lmK=null, lmLandWait=[];

function lmLayout(k){
  const dpr=Math.min(window.devicePixelRatio||1,2), r=k.host.getBoundingClientRect();
  k.W=k.host.offsetWidth; k.H=k.host.offsetHeight;
  k.zoom=k.W ? r.width/k.W : 1;
  const sc=dpr*k.zoom;
  k.cv.width=Math.round(k.W*sc); k.cv.height=Math.round(k.H*sc);
  k.ctx.setTransform(sc,0,0,sc,0,0);
  const sr=k.spot.getBoundingClientRect();
  k.sx=(sr.left-r.left)/k.zoom; k.sy=(sr.top-r.top)/k.zoom;
  k.scale=Math.min(sr.width,sr.height)/k.zoom/LM_PX;
}
/* THE CLOCK the mark lands on and turns with: the program's phase() where it passes one, so the mark keeps the corner
   logo's phase, else the launch's own, landing on the standard figure. The arrival is the half turn ending on it. */
const lmClock=(k, ms)=>k.phase ? k.phase() : LM_PHI1+LM_W0*Math.max(0, ms-LM_LANDED_MS)/1000;
const lmPhaseAt=(k, ms)=>lmClock(k, ms)-Math.PI*(1-lmEase(Math.min(1, ms/LM_TURN_MS)));
// The riders for the phase the arrival lands on, a landing's time on at the clock's rate.
function lmRide(k){
  const at=k.phase ? k.phase()+LM_W0*LM_LANDED_MS/1000 : LM_PHI1;
  if(k.R && k.rode===at) return;
  k.F.lay(at, k.to, k.rad, LM_FEATHER, k.lat, k.rest);
  k.R=launchRiders(k.F, k, k.rest, null, at);
  // a dot twinkles the same before and after it lands
  k.R.list.forEach(p=>{ p.ph=k.dots[p.n].ph; p.sp=k.dots[p.n].sp; });
  k.rode=at;
}
// The landed figure on the lattice, the desk's own drawing: dots batched by alpha into a few fills a frame.
function lmPaintLattice(k, quiet, phi, t){
  if(k.laid!==phi){ k.F.lay(phi, k.to, k.rad, LM_FEATHER, k.lat, k.light); k.laid=phi; }
  const bins=[], sc=k.scale, r=LM_DOT*sc;
  for(let i=0;i<k.light.length;i++){
    const lit=k.light[i];
    if(!lit) continue;
    const d=k.dots[i], tw=quiet ? 0.75 : 0.55+0.45*Math.sin(d.ph+t*d.sp*1.6);
    const b=Math.round(Math.min(1,tw*1.2)*lit*LM_ALPHA_STEPS);
    if(b) (bins[b]||(bins[b]=[])).push(i);
  }
  k.ctx.clearRect(0,0,k.W,k.H);
  k.ctx.fillStyle=k.ink;
  bins.forEach((ix,b)=>{
    k.ctx.globalAlpha=b/LM_ALPHA_STEPS; k.ctx.beginPath();
    ix.forEach(n=>{ const x=k.sx+k.dots[n].hx*sc, y=k.sy+k.dots[n].hy*sc; k.ctx.moveTo(x+r,y); k.ctx.arc(x,y,r,0,LM_TAU); });
    k.ctx.fill();
  });
  k.ctx.globalAlpha=1;
}
function lmStamp(core, halo){
  const c=document.createElement("canvas"); c.width=c.height=LM_SPRITE;
  const g=c.getContext("2d"), m=LM_SPRITE/2, gr=g.createRadialGradient(m,m,LM_CORE*0.6,m,m,LM_CORE*LM_HALO);
  gr.addColorStop(0,halo); gr.addColorStop(1,"transparent");
  g.globalAlpha=LM_GLOW; g.fillStyle=gr; g.fillRect(0,0,LM_SPRITE,LM_SPRITE); g.globalAlpha=1;
  g.fillStyle=core; g.beginPath(); g.arc(m,m,LM_CORE,0,LM_TAU); g.fill();
  return c;
}
/* In flight a rider is a point of its own size with a soft halo and its own twinkle; folding onto its dot it
   shrinks to the lattice's dot and takes the desk's twinkle, so the landed frame is the lattice drawing. */
function lmPaintRiders(k, t){
  const e=lmSmooth(k.ms/LM_TURN_MS), w=lmSmooth((k.ms-LM_SETTLE_MS)/(LM_LANDED_MS-LM_SETTLE_MS));
  const sc=k.scale, ctx=k.ctx, phi=lmPhaseAt(k, k.ms), RS=k.R.list, bins=[], rDot=LM_DOT*sc;
  const key=k.ink+"|"+k.halo;
  if(k.stampKey!==key){ k.stamp=lmStamp(k.ink,k.halo); k.stampKey=key; }
  ctx.clearRect(0,0,k.W,k.H);
  for(let i=0;i<RS.length;i++){
    const p=RS[i], z=Math.cos(3*p.t+phi);
    const twF=LM_A_MIN+(1-LM_A_MIN)*(0.5+0.5*Math.sin(p.ph+k.ms/LM_TWINKLE_MS));
    const twD=Math.min(1,(0.55+0.45*Math.sin(p.ph+t*p.sp*1.6))*(0.45+0.75*e));
    const aF=twF*p.feather*k.F.light(z)*(1-w), aD=twD*(p.near ? p.rest : 0)*w;
    if(aF>0.004){
      const d=(p.r+(LM_DOT-p.r)*w)*sc/LM_CORE*LM_SPRITE;
      ctx.globalAlpha=Math.min(1,aF); ctx.drawImage(k.stamp, p.x-d/2, p.y-d/2, d, d);
    }
    const b=Math.round(aD*LM_ALPHA_STEPS);
    if(b) (bins[b]||(bins[b]=[])).push(p);
  }
  ctx.fillStyle=k.ink;
  bins.forEach((ps,b)=>{
    ctx.globalAlpha=b/LM_ALPHA_STEPS; ctx.beginPath();
    ps.forEach(p=>{ ctx.moveTo(p.x+rDot,p.y); ctx.arc(p.x,p.y,rDot,0,LM_TAU); });
    ctx.fill();
  });
  ctx.globalAlpha=1;
}
function lmPaint(k){
  const cs=getComputedStyle(k.cv);
  k.ink=cs.color; k.halo=cs.getPropertyValue("--fifth-halo").trim() || cs.color;
  if(k.still()){ lmPaintLattice(k, true, LM_PHI0, 0); return; }
  if(k.ms>=LM_LANDED_MS) lmPaintLattice(k, false, lmPhaseAt(k, k.ms), k.ms/1000);
  else lmPaintRiders(k, k.ms/1000);
}
// Each rider chases its address on the turning figure, the pull easing in, and folds onto it as it lands.
function lmStep(k, dt){
  const phi=lmPhaseAt(k, Math.min(k.ms, LM_LANDED_MS-1)), o=[0,0,0,0], sc=k.scale;
  const per=LM_PULL*lmSmooth(k.ms/LM_GATHER_MS), pull=1-Math.pow(1-per, dt/(1000/60));
  const w=lmSmooth((k.ms-LM_SETTLE_MS)/(LM_LANDED_MS-LM_SETTLE_MS)), RS=k.R.list;
  for(let i=0;i<RS.length;i++){
    const p=RS[i];
    launchPlace(k.R.C, p, phi, o);
    const tx=k.sx+o[0]*sc, ty=k.sy+o[1]*sc;
    p.cx+=(tx-p.cx)*pull; p.cy+=(ty-p.cy)*pull;
    p.x=p.cx+(tx-p.cx)*w; p.y=p.cy+(ty-p.cy)*w;
  }
}
function lmLanded(){
  const w=lmLandWait;
  lmLandWait=[];
  w.forEach(fn=>setTimeout(fn,0));
}
/* The arrival runs at the display's rate on its own clock, a late frame moving it by at most a frame and a half;
   once landed the slow turn asks for frames fifteen times a second. */
function lmFrame(now){
  const k=lmK;
  if(!k || !k.host.isConnected){ stopLaunchMark(true); return; }
  k.raf=0;
  if(k.still()){ k.ms=0; lmPaint(k); lmLanded(); return; }
  if(k.last==null) k.last=now;
  const dt=Math.min(k.gapMs+1000/30, Math.max(0, now-k.last));
  k.last=now;
  k.ms+=dt;
  if(k.ms<LM_LANDED_MS) lmStep(k, dt); else lmLanded();
  lmPaint(k);
  k.gapMs=k.ms<LM_LANDED_MS+200 ? 0 : 1000/15;
  k.hold=setTimeout(()=>{ k.hold=0; k.raf=requestAnimationFrame(lmFrame); }, k.gapMs);
}
function lmScatter(k){
  k.R.list.forEach(p=>{ p.cx=p.x=Math.random()*k.W; p.cy=p.y=Math.random()*k.H; });
}
// A cover standing when the arrival would start holds it until the cover is gone, so it is seen.
function lmStart(k){
  if(k.still()){ lmPaint(k); lmLanded(); return; }
  if(k.covered()){ k.hold=setTimeout(()=>{ k.hold=0; lmStart(k); }, 150); return; }
  k.ms=0; k.last=null; lmRide(k); lmScatter(k);
  k.raf=requestAnimationFrame(lmFrame);
}
// A drawing a launch stands on is the launch's to stop, unless `all`: a screen's null leaves it alone.
function stopLaunchMark(all){
  const k=lmK;
  if(!k || (k.launch && all!==true)) return;
  lmK=null;
  cancelAnimationFrame(k.raf); clearTimeout(k.hold);
  k.ro.disconnect(); k.mo.disconnect();
  if(k.cv.parentNode) k.cv.remove();
  lmLanded();
}
/* host: the block the canvas lies over, holding the .e-fifth-spot the figure stands on; null stops a drawing no
   launch stands on. A drawing already running moves into a new host with its clock and its points, so a repaint
   or a launch giving way onto the same mark plays one arrival. opts: R, still(), covered(), phase(). */
function syncLaunchMark(host, opts){
  if(!host){ stopLaunchMark(false); return; }
  const spot=host.querySelector(".e-fifth-spot");
  if(!spot) return;
  const k=lmK;
  if(k){
    if(k.host===host) return;
    const was=k.cv.getBoundingClientRect(), z=k.zoom||1;
    k.host=host; k.spot=spot; k.launch=false;
    host.insertBefore(k.cv, host.firstChild);
    k.ro.disconnect(); k.ro.observe(host);
    lmLayout(k);
    const now=k.cv.getBoundingClientRect(), dx=(was.left-now.left)/z, dy=(was.top-now.top)/z;
    k.R.list.forEach(p=>{ p.cx+=dx; p.cy+=dy; p.x+=dx; p.y+=dy; });
    lmPaint(k);
    return;
  }
  const o=opts||{}, F=launchFigure(o.R||LAUNCH_R), L=launchLattice(F), rest=new Float32Array(L.lat.nx*L.lat.ny);
  const dots=new Array(rest.length);
  for(let j=0, q=0;j<L.lat.ny;j++) for(let i=0;i<L.lat.nx;i++, q++)
    dots[q]={hx:L.lat.x0+i*LM_STEP, hy:L.lat.y0+j*LM_STEP, ph:Math.random()*LM_TAU, sp:0.6+Math.random()*0.9};
  const cv=document.createElement("canvas");
  cv.className="e-fifth";
  cv.setAttribute("aria-hidden","true");
  host.insertBefore(cv, host.firstChild);
  const nk=lmK={host:host, spot:spot, cv:cv, ctx:cv.getContext("2d"), F:F, lat:L.lat, to:L.to, rad:L.rad,
    light:new Float32Array(rest.length), laid:null, dots:dots, rest:rest, R:null, rode:null, phase:o.phase||null,
    ms:0, last:null, raf:0, hold:0, gapMs:0, launch:false,
    still:o.still||lmStillDefault, covered:o.covered||(()=>false)};
  lmLayout(nk); lmRide(nk); lmScatter(nk);
  // A resize clears the canvas, so it is painted again at once, moving or held.
  nk.ro=new ResizeObserver(()=>{ lmLayout(nk); lmPaint(nk); });
  nk.ro.observe(host);
  nk.mo=new MutationObserver(()=>{
    if(nk.still()){ cancelAnimationFrame(nk.raf); clearTimeout(nk.hold); nk.raf=0; nk.hold=0; nk.ms=0; lmPaint(nk); lmLanded(); }
    else if(!nk.raf && !nk.hold) lmStart(nk);
    else lmPaint(nk);
  });
  nk.mo.observe(document.documentElement,{attributes:true, attributeFilter:["class","data-theme"]});
  lmStart(nk);
}
/* WHAT WAITS FOR THE ARRIVAL: run once the mark has landed or gone, at once where none is arriving, and at
   LAUNCH_MAX_MS whatever, since frames do not come to a hidden page. */
function whenLaunchLanded(fn){
  const k=lmK;
  if(!k || k.still() || k.ms>=LM_LANDED_MS){ fn(); return; }
  let done=false;
  const once=()=>{ if(!done){ done=true; fn(); } };
  lmLandWait.push(once);
  setTimeout(once, LAUNCH_MAX_MS);
}

/* ---- the launch ---- */
let lmLast=null;
/* region: the element whose box the mark stands over, from its top to the window's foot. ready: a promise of the
   work painted. focus(): the field a first key should reach where the program routes no typing of its own, focused
   when the work is ready and nothing else holds the focus. phase(): the program's clock, as syncLaunchMark's. The
   body carries e-launch while it stands and e-launch-out while it gives way; the program's sheet says what those hide. */
function launchMark(opts){
  const o=opts||{}, body=document.body, t0=performance.now(), still=o.still||lmStillDefault;
  const minMs=o.minMs==null ? LAUNCH_MIN_MS : o.minMs, maxMs=o.maxMs==null ? LAUNCH_MAX_MS : o.maxMs;
  const veil=document.createElement("div");
  veil.className="e-launch-veil "+(o.app||"");
  veil.setAttribute("aria-hidden","true");
  const spot=document.createElement("div");
  spot.className="e-fifth-spot";
  veil.appendChild(spot);
  const place=()=>{
    const r=o.region.getBoundingClientRect();
    veil.style.left=r.left+"px"; veil.style.top=r.top+"px";
    veil.style.width=r.width+"px"; veil.style.height=Math.max(0, window.innerHeight-r.top)+"px";
  };
  place();
  body.appendChild(veil);
  body.classList.add("e-launch");
  stopLaunchMark(true);
  syncLaunchMark(veil, {R:o.R||LAUNCH_R, still:still, covered:o.covered, phase:o.phase});
  if(lmK && lmK.host===veil) lmK.launch=true;
  const state=lmLast={reason:"", ms:0, veil:veil};
  const off=[];
  const on=(el, ev, fn, opt)=>{ el.addEventListener(ev,fn,opt); off.push(()=>el.removeEventListener(ev,fn,opt)); };
  function giveWay(reason){
    if(state.reason) return;
    state.reason=reason; state.ms=Math.round(performance.now()-t0);
    off.forEach(f=>f());
    const quick=reason==="key" || reason==="click" || reason==="wheel" || still(), out=quick ? LAUNCH_QUICK_MS : LAUNCH_OUT_MS;
    body.style.setProperty("--e-launch-out", out+"ms");
    body.classList.add("e-launch-out");
    body.classList.remove("e-launch");
    veil.classList.add("e-going");
    setTimeout(()=>{
      if(lmK && lmK.host===veil) stopLaunchMark(true);
      veil.remove();
      body.classList.remove("e-launch-out");
      body.style.removeProperty("--e-launch-out");
    }, out);
  }
  // A key goes on where it was going: nothing here prevents it, unless the program routes no typing of its own and
  // its field is not painted yet; a character typed then is held and handed to the field. A click on the mark is
  // eaten, since it fell on the mark rather than on something seen; one anywhere else ends the launch and goes on.
  let held="";
  const loose=()=>{ const a=document.activeElement; return !a || a===body || a===document.documentElement; };
  const hold=e=>{
    const k=e.key, gr=!!(e.getModifierState && e.getModifierState("AltGraph"));
    if(typeof k==="string" && k.length===1 && (gr || !(e.ctrlKey || e.metaKey || e.altKey)) && !e.isComposing && loose()){ held+=k; e.preventDefault(); }
  };
  const unhold=()=>window.removeEventListener("keydown",hold,true);
  if(o.focus) window.addEventListener("keydown",hold,true);
  on(window,"keydown",()=>giveWay("key"),true);
  on(window,"pointerdown",e=>{
    if(e.target===veil || (veil.contains && veil.contains(e.target))){ e.preventDefault(); e.stopPropagation(); }
    giveWay("click");
  },true);
  on(window,"wheel",()=>giveWay("wheel"),{passive:true, capture:true});
  on(window,"resize",place);
  const ready=Promise.resolve(o.ready).then(()=>{
    unhold();
    const f=typeof o.focus==="function" ? o.focus() : o.focus;
    if(f && loose()){
      f.focus({preventScroll:true});
      if(held && typeof f.value==="string"){ f.value+=held; if(typeof Event==="function") f.dispatchEvent(new Event("input",{bubbles:true})); }
    }
    if(state.reason) return;
    // the mark went on to the screen that was ready, so the work comes in with it
    if(!lmK || lmK.host!==veil) giveWay("moved");
  });
  const wait=minMs;
  Promise.all([ready, new Promise(r=>setTimeout(r,wait))]).then(()=>giveWay("time"), ()=>{ unhold(); giveWay("time"); });
  setTimeout(()=>{ unhold(); giveWay("time"); }, Math.max(wait, maxMs));
  return {giveWay:giveWay, veil:veil, get reason(){ return state.reason; }, get ms(){ return state.ms; }};
}
// The last launch: why and when it gave way, for whoever reads the page.
function launchState(){ return lmLast ? {reason:lmLast.reason, ms:lmLast.ms} : null; }

export {
  LAUNCH_R,
  LAUNCH_MIN_MS,
  LAUNCH_MAX_MS,
  launchFigure,
  launchLattice,
  launchRiders,
  launchPlace,
  launchMark,
  launchState,
  syncLaunchMark,
  stopLaunchMark,
  whenLaunchLanded
};
