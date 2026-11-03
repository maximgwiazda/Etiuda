/* THE OPENING (board 957, Claudia handover 2026-11-03, Max decisions 30 and 31):
 * First-round variant A, the desk's turn phiIcon 56 degrees (a-turning), ink #2881ea over window ground (theme token),
 * landing in the header's corner mark (.brand svg) with no jump, then the window arriving; nothing of UI before landing.
 * Under reduced motion: no opening; window shows as soon as ready, corner mark still. A key, click or wheel skips it. */
import { setFifthPhase } from "./fifth.js";

const LAUNCH_R = 7, LAUNCH_MIN_MS = 1100, LAUNCH_OUT_MS = 350, LAUNCH_QUICK_MS = 140, LAUNCH_MAX_MS = 4000;
const OPENING_INK = "#2881ea";
const PHI_ICON = 56 * Math.PI / 180; // the desk: 56 degrees (a-turning)
const W0 = 2 * Math.PI * 0.007; // 0.007 Hz detune rate in rad/s
const KF = 150 / 212;
const LW = 20 * KF;

const TIMING = {
  FADE_IN: 0.45,
  RISE: 0.70,
  GROW: 0.90,
  TURN: 2.05,
  STILL_UNTIL: 2.35,
  LAND: 2.90,
  ARRIVE: 3.25
};

/* THE PAGE IS NEVER LEFT HIDDEN (the test architect, 2026-11-03 03:04): whatever happens to the frames or to the page's
   ready, the window is given way 1.5 s after the opening would have arrived. A page shown before ready beats one never shown. */
const FAILSAFE_MS = Math.round(TIMING.ARRIVE * 1000) + 1500;
/* A gap shorter than a 240 Hz frame is a repeated stamp, not a display frame: counted, it would cap every later
   step at a few milliseconds and the opening would crawl to the failsafe. */
const SHORTEST_FRAME_MS = 1000 / 240;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, f) => a.map((v, i) => Math.round(v * f + b[i] * (1 - f)));
const rgb = (c) => "rgb(" + c.join(",") + ")";
const cl = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { const u = cl(x); return u * u * (3 - 2 * u); };
const eo = (x) => 1 - Math.pow(1 - cl(x), 3);
const eio = (x) => { const u = cl(x); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };

const WHITE = [255, 255, 255];
const INK_RGB = hex(OPENING_INK);

const pt = (t, phi) => [
  128 + 96 * KF * Math.sin(3 * t + phi),
  128 + 96 * KF * Math.sin(2 * t),
  Math.cos(3 * t + phi)
];

const lerpAt = (a, b, f) => ({
  cx: a.cx + (b.cx - a.cx) * f,
  cy: a.cy + (b.cy - a.cy) * f,
  k: a.k * Math.pow(b.k / a.k, f)
});

function cornerTarget() {
  const svg = (typeof document !== "undefined" && typeof document.querySelector === "function")
    && (document.querySelector(".brand-tile svg") || document.querySelector(".brand svg"));
  if (svg) {
    const r = svg.getBoundingClientRect();
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      k: (r.width / 256) * 1.0581,
      w: r.width,
      h: r.height
    };
  }
  return {
    cx: 14 + 12.5,
    cy: 6 + 12.5,
    k: (25 / 256) * 1.0581,
    w: 25,
    h: 25
  };
}

function bigTarget(W, H) {
  const w = W || 1280, h = H || 880;
  return { cx: w / 2, cy: h / 2 - 10, k: 300 / 150 };
}

function cornerPhase(t) {
  return PHI_ICON + W0 * (t - TIMING.STILL_UNTIL);
}

/** The figure position, scale, phase and colours across opening time t in seconds. */
function figureAt(t, W, H) {
  const big = bigTarget(W, H);
  const c0 = cornerTarget();

  if (t < TIMING.TURN) {
    const s = eio(t / TIMING.TURN);
    const phi = PHI_ICON - Math.PI * 0.85 * (1 - s);
    const alpha = ease(t / TIMING.FADE_IN);
    const yOff = 18 * (1 - eo(t / TIMING.RISE));
    const kScale = big.k * (0.9 + 0.1 * eo(t / TIMING.GROW));
    return {
      cx: big.cx,
      cy: big.cy + yOff,
      k: kScale,
      phi,
      depth: 1.0,
      ground: 1.0,
      colour: OPENING_INK,
      alpha,
      arc: 0
    };
  }

  if (t < TIMING.STILL_UNTIL) {
    return {
      cx: big.cx,
      cy: big.cy,
      k: big.k,
      phi: PHI_ICON,
      depth: 1.0,
      ground: 1.0,
      colour: OPENING_INK,
      alpha: 1.0,
      arc: 0
    };
  }

  if (t < TIMING.LAND) {
    const tau = (t - TIMING.STILL_UNTIL) / (TIMING.LAND - TIMING.STILL_UNTIL);
    const f = eio(tau);
    const geom = lerpAt(big, c0, f);
    const arc = Math.sin(Math.PI * f) * 40;
    const depth = 1 - ease(f * 3);
    const phi = cornerPhase(t);
    return {
      cx: geom.cx - arc * 0.3,
      cy: geom.cy - arc,
      k: geom.k,
      phi,
      depth,
      ground: 1.0,
      colour: OPENING_INK,
      alpha: 1.0,
      arc
    };
  }

  if (t < TIMING.ARRIVE) {
    const tau = (t - TIMING.LAND) / (TIMING.ARRIVE - TIMING.LAND);
    const ground = 1 - ease(tau);
    const phi = cornerPhase(t);
    const curColour = mix(INK_RGB, WHITE, ground);
    return {
      cx: c0.cx,
      cy: c0.cy,
      k: c0.k,
      phi,
      depth: 0,
      ground,
      colour: curColour,
      alpha: 1.0,
      arc: 0
    };
  }

  const phi = cornerPhase(t);
  return {
    cx: c0.cx,
    cy: c0.cy,
    k: c0.k,
    phi,
    depth: 0,
    ground: 0,
    colour: WHITE,
    alpha: 1.0,
    arc: 0
  };
}

function drawLine(ctx, phi, at, opt) {
  if (!ctx) return;
  const o = opt || {};
  const N = o.n || 520;
  const depth = o.depth == null ? 1 : o.depth;
  const far = o.far == null ? 0.4 : o.far;
  const near = Array.isArray(o.colour) ? o.colour : (typeof o.colour === "string" ? hex(o.colour) : INK_RGB);
  const bg = Array.isArray(o.bg) ? o.bg : (typeof o.bg === "string" ? hex(o.bg) : [247, 248, 250]);

  const segs = [];
  for (let j = 0; j < N; j++) {
    const a = (2 * Math.PI * j) / N, b = (2 * Math.PI * (j + 1)) / N;
    const p = pt(a, phi), q = pt(b, phi);
    segs.push([p, q, (p[2] + q[2]) / 2]);
  }
  if (depth > 0) segs.sort((u, v) => u[2] - v[2]);

  ctx.lineCap = "round";
  ctx.lineWidth = LW * at.k;

  for (const [p, q, z] of segs) {
    const u = z * 0.5 + 0.5;
    const L = far + (1 - far) * u * u * (3 - 2 * u);
    const f = 1 - depth * (1 - L);
    ctx.strokeStyle = rgb(mix(near, bg, f));
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.beginPath();
    ctx.moveTo(at.cx + (p[0] - 128) * at.k, at.cy + (p[1] - 128) * at.k);
    ctx.lineTo(at.cx + (q[0] - 128) * at.k, at.cy + (q[1] - 128) * at.k);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function getGroundRgb(doc) {
  if (doc && doc.documentElement) {
    const theme = typeof doc.documentElement.getAttribute === "function"
      ? doc.documentElement.getAttribute("data-theme")
      : (doc.documentElement.attrs && doc.documentElement.attrs["data-theme"]);
    if (theme === "dark") {
      return [15, 16, 19];
    }
  }
  return [247, 248, 250];
}

/* ---- Backward compatibility stubs for figure & lattice ---- */
const LM_A = 96, LM_FINE = 4000, LM_INK = 150, LM_BOX = 256, LM_T0 = 3 * Math.PI / 4, LM_T1 = 7 * Math.PI / 4, LM_FAR = 0.6;
const LM_SPACING = 0.6, LM_PX = 280, LM_STEP = 3.5, LM_FEATHER = LM_STEP / 2, LM_DOT = 1.05, LM_PHI0 = Math.PI / 4;
const LM_G = { a: 1.0581, b: 0, c: 0, d: 1.0581, e: -7.441, f: -7.441 };

function launchFigure(R) {
  function pass(phi) {
    const fine = [];
    for (let i = 0; i <= LM_FINE; i++) {
      const t = LM_T0 + (LM_T1 - LM_T0) * i / LM_FINE;
      fine.push([128 + LM_A * Math.sin(3 * t + phi), 128 + LM_A * Math.sin(2 * t), t]);
    }
    const out = [fine[0]]; let acc = 0;
    for (let i = 1; i < fine.length; i++) {
      acc += Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]);
      if (acc >= R * LM_SPACING) { out.push(fine[i]); acc = 0; }
    }
    out.push(fine[fine.length - 1]);
    return out;
  }
  let fitStd = null;
  function fit() {
    if (fitStd) return fitStd;
    const c = pass(LM_PHI0);
    const x1 = Math.min(...c.map(p => p[0] - R)), x2 = Math.max(...c.map(p => p[0] + R));
    const y1 = Math.min(...c.map(p => p[1] - R)), y2 = Math.max(...c.map(p => p[1] + R));
    const k = LM_INK / Math.max(x2 - x1, y2 - y1);
    return fitStd = { k: k, ox: LM_BOX / 2 - k * (x1 + x2) / 2, oy: LM_BOX / 2 - k * (y1 + y2) / 2 };
  }
  function band(phi) {
    const f = fit(), out = [];
    pass(phi).forEach(p => {
      const z = Math.cos(3 * p[2] + phi);
      out.push([p[0] * f.k + f.ox, p[1] * f.k + f.oy, z]);
      out.push([(LM_BOX - p[0]) * f.k + f.ox, p[1] * f.k + f.oy, -z]);
    });
    return out;
  }
  const radius = () => R * fit().k;
  const light = z => { const u = z * 0.5 + 0.5; return LM_FAR + (1 - LM_FAR) * u * u * (3 - 2 * u); };
  function lay(phi, to, rad, feather, lat, out) {
    out.fill(0);
    const o = [0, 0];
    band(phi).forEach(p => {
      o[0] = p[0]; o[1] = p[1]; to(o);
      const lum = light(p[2]);
      const i0 = Math.max(0, Math.ceil((o[0] - rad - lat.x0) / lat.step)), i1 = Math.min(lat.nx - 1, Math.floor((o[0] + rad - lat.x0) / lat.step));
      const j0 = Math.max(0, Math.ceil((o[1] - rad - lat.y0) / lat.step)), j1 = Math.min(lat.ny - 1, Math.floor((o[1] + rad - lat.y0) / lat.step));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot(lat.x0 + i * lat.step - o[0], lat.y0 + j * lat.step - o[1]);
          if (d >= rad) continue;
          const v = Math.min(1, (rad - d) / feather) * lum, k = j * lat.nx + i;
          if (v > out[k]) out[k] = v;
        }
      }
    });
    return out;
  }
  return { R, pass, fit, band, radius, light, lay };
}

function launchLattice(F) {
  const s = LM_PX / LM_BOX, m = LM_G;
  const to = o => { const u = o[0], v = o[1]; o[0] = s * (m.a * u + m.c * v + m.e); o[1] = s * (m.b * u + m.d * v + m.f); };
  const rad = F.radius() * s * Math.hypot(m.a, m.b), o = [0, 0];
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  F.band(LM_PHI0).forEach(p => {
    o[0] = p[0]; o[1] = p[1]; to(o);
    x1 = Math.min(x1, o[0]); x2 = Math.max(x2, o[0]); y1 = Math.min(y1, o[1]); y2 = Math.max(y2, o[1]);
  });
  const pad = rad + LM_STEP, half = LM_STEP / 2;
  const i0 = Math.max(0, Math.floor((x1 - pad - half) / LM_STEP)), i1 = Math.min(Math.floor(LM_PX / LM_STEP) - 1, Math.ceil((x2 + pad - half) / LM_STEP));
  const j0 = Math.max(0, Math.floor((y1 - pad - half) / LM_STEP)), j1 = Math.min(Math.floor(LM_PX / LM_STEP) - 1, Math.ceil((y2 + pad - half) / LM_STEP));
  return { lat: { x0: half + i0 * LM_STEP, y0: half + j0 * LM_STEP, step: LM_STEP, nx: i1 - i0 + 1, ny: j1 - j0 + 1 }, to, rad };
}

function launchPlace(C, r, phi, o) {
  C.at(r.t, phi, o);
  const x = o[0] + r.a * o[2] - r.b * o[3], y = o[1] + r.a * o[3] + r.b * o[2];
  o[0] = x; o[1] = y; return o;
}

function launchRiders(F, L, rest, rnd, phi) {
  return { C: { at: (t, p, o) => { o[0] = 0; o[1] = 0; o[2] = 1; o[3] = 0; return o; } }, list: [] };
}

let lmK = null;
let lmLandWait = [];
function lmLanded() {
  const w = lmLandWait;
  lmLandWait = [];
  w.forEach(fn => setTimeout(fn, 0));
}

function whenLaunchLanded(fn) {
  if (currentOpeningFig == null) { fn(); return; }
  let done = false;
  const once = () => { if (!done) { done = true; fn(); } };
  lmLandWait.push(once);
  setTimeout(once, LAUNCH_MAX_MS);
}

function stopLaunchMark(all) {
  const k = lmK;
  if (!k || (k.launch && all !== true)) return;
  if (k.cv && k.cv.parentNode) k.cv.remove();
  lmK = null;
  lmLanded();
}

function syncLaunchMark(host, opts) {
  if (!host) { stopLaunchMark(false); return; }
}

/* ---- The opening launch ---- */
let currentOpeningFig = null;
let launchStateRecord = { reason: "", ms: 0 };

function launchMark(opts) {
  const o = opts || {};
  const doc = typeof document !== "undefined" ? document : null;
  const win = typeof window !== "undefined" ? window : null;
  const body = doc && doc.body;
  const quiet = o.still || (() => (doc && doc.documentElement && doc.documentElement.classList.contains("e-still")) || false);
  const isStillMotion = typeof quiet === "function" ? quiet() : !!quiet;
  const isCovered = () => (typeof o.covered === "function" ? !!o.covered() : false);

  if (body && body.classList) {
    body.classList.add("e-launch");
  }

  const state = {
    reason: null,
    ended: false,
    skipped: false,
    ms: 0,
    isStill: isStillMotion
  };

  const t0 = (win && win.performance ? win.performance.now() : Date.now());
  let rafId = 0;
  let failsafeTimer = 0;
  let coverHoldTimer = 0;
  let veil = null;
  let canvas = null;
  let ctx = null;

  let openingMs = 0;
  let lastFrameTime = t0;
  let framed = false;
  let frameGap = 1000 / 60;

  const off = [];
  const on = (el, ev, fn, opt) => {
    if (el && el.addEventListener) {
      el.addEventListener(ev, fn, opt);
      off.push(() => el.removeEventListener(ev, fn, opt));
    }
  };

  let held = "";
  const loose = () => {
    const a = doc && doc.activeElement;
    return !a || a === body || a === (doc && doc.documentElement);
  };
  const hold = e => {
    const k = e.key, gr = !!(e.getModifierState && e.getModifierState("AltGraph"));
    if (typeof k === "string" && k.length === 1 && (gr || !(e.ctrlKey || e.metaKey || e.altKey)) && !e.isComposing && loose()) {
      held += k;
      e.preventDefault();
    }
  };
  const unhold = () => {
    if (win && win.removeEventListener) win.removeEventListener("keydown", hold, true);
  };
  if (o.focus && win && win.addEventListener) win.addEventListener("keydown", hold, true);

  const W = (win && win.innerWidth) || 1280;
  const H = (win && win.innerHeight) || 880;
  currentOpeningFig = isStillMotion ? { cx: 0, cy: 0, k: 0, phi: PHI_ICON } : figureAt(0, W, H);

  function syncCorner(phi) {
    setFifthPhase(phi);
  }

  function giveWay(reason) {
    if (state.ended) return;
    state.ended = true;
    state.reason = reason;
    launchStateRecord.reason = reason;
    if (reason === "key" || reason === "click" || reason === "wheel") {
      state.skipped = true;
    }
    off.forEach(f => f());
    unhold();
    if (failsafeTimer && typeof clearTimeout === "function") {
      clearTimeout(failsafeTimer);
      failsafeTimer = 0;
    }
    if (coverHoldTimer && typeof clearTimeout === "function") {
      clearTimeout(coverHoldTimer);
      coverHoldTimer = 0;
    }
    const now = (win && win.performance ? win.performance.now() : Date.now());
    state.ms = Math.round(now - t0);
    launchStateRecord.ms = state.ms;
    if (lmK && lmK.launch) lmK = null;

    if (rafId && win && win.cancelAnimationFrame) {
      win.cancelAnimationFrame(rafId);
      rafId = 0;
    }

    const finalPhi = isStillMotion
      ? PHI_ICON
      : (currentOpeningFig ? currentOpeningFig.phi : PHI_ICON);

    syncCorner(finalPhi);

    const brandTile = doc && typeof doc.querySelector === "function" && doc.querySelector(".brand-tile");
    if (!isStillMotion && brandTile && !brandTile.classList.contains("brand-turning")) {
      brandTile.classList.add("brand-turning");
    }

    const quick = reason === "key" || reason === "click" || reason === "wheel";
    const outMs = quick ? LAUNCH_QUICK_MS : (isStillMotion || reason === "still" ? 0 : 350);
    if (outMs === 0) {
      if (body && body.classList) {
        body.classList.remove("e-launch");
        body.classList.remove("e-launch-out");
      }
      if (body && body.style && body.style.removeProperty) {
        body.style.removeProperty("--e-launch-out");
      }
      if (veil && veil.remove) veil.remove();
    } else {
      if (body && body.style && body.style.setProperty) {
        body.style.setProperty("--e-launch-out", outMs + "ms");
      }
      if (body && body.classList) {
        body.classList.add("e-launch-out");
        body.classList.remove("e-launch");
      }
      if (veil) {
        if (veil.classList) veil.classList.add("e-going");
        setTimeout(() => {
          if (veil && veil.remove) veil.remove();
          if (body && body.classList) {
            body.classList.remove("e-launch-out");
          }
          if (body && body.style && body.style.removeProperty) {
            body.style.removeProperty("--e-launch-out");
          }
        }, outMs);
      } else {
        if (body && body.classList) {
          body.classList.remove("e-launch-out");
        }
      }
    }

    lmLanded();
  }

  const armFailsafe = () => {
    if (typeof setTimeout === "function") {
      failsafeTimer = setTimeout(() => giveWay("failsafe"), FAILSAFE_MS);
    }
  };

  const waitReady = (win && win.__stubNoFramesAndNeverReady)
    ? new Promise(() => {})
    : Promise.resolve(o.ready);

  waitReady.then(() => {
    unhold();
    const f = typeof o.focus === "function" ? o.focus() : o.focus;
    if (f && loose()) {
      if (f.focus) f.focus({ preventScroll: true });
      if (held && typeof f.value === "string") {
        f.value += held;
        const Ev = (win && win.Event) || (typeof Event !== "undefined" ? Event : null);
        if (typeof Ev === "function" && f.dispatchEvent) f.dispatchEvent(new Ev("input", { bubbles: true }));
      }
    }
  });

  on(win, "pointerdown", e => {
    if (e.target === veil || (veil && veil.contains && veil.contains(e.target))) {
      e.preventDefault();
      e.stopPropagation();
    }
    giveWay("click");
  }, true);
  on(win, "keydown", () => giveWay("key"), true);
  on(win, "wheel", () => giveWay("wheel"), { passive: true, capture: true });

  if (win) {
    win.__launchOpeningState = () => ({
      get cx() { return currentOpeningFig ? currentOpeningFig.cx : 0; },
      get cy() { return currentOpeningFig ? currentOpeningFig.cy : 0; },
      get size() { return currentOpeningFig ? currentOpeningFig.k * 256 : 0; },
      get phase() { return currentOpeningFig ? currentOpeningFig.phi : PHI_ICON; },
      get skipped() { return !!state.skipped; },
      get ended() { return !!state.ended; },
      get reason() { return state.reason; },
      get isStill() { return state.isStill; },
      get isFlightTurning() { return !state.isStill && !state.ended; }
    });
  }

  armFailsafe();

  if (isStillMotion) {
    /* NO OPENING UNDER REDUCED MOTION (Max, 2026-11-03 02:33): nothing is drawn over the
       window, which shows as soon as the page is ready, the corner mark still. */
    const stillVeil = doc && doc.createElement ? doc.createElement("div") : null;
    waitReady.then(() => giveWay("still"));
    return {
      giveWay,
      veil: stillVeil,
      get reason() { return state.reason; },
      get ended() { return state.ended; },
      get ms() { return state.ms; }
    };
  }

  if (doc && doc.createElement && body && body.appendChild) {
    veil = doc.createElement("div");
    veil.className = "e-launch-veil" + (o.app ? " " + o.app : "");
    canvas = doc.createElement("canvas");
    canvas.className = "e-opening";
    canvas.setAttribute("aria-hidden", "true");
    veil.appendChild(canvas);
    body.appendChild(veil);
    ctx = canvas.getContext ? canvas.getContext("2d") : null;
  }
  stopLaunchMark(true);
  lmK = { launch: true, host: veil, cv: canvas, ctx: ctx, ms: 0 };

  function renderFrame(now) {
    try {
      drawFrame(now);
    } catch (err) {
      giveWay("error");
    }
  }

  function drawFrame(now) {
    if (state.ended) return;
    const dt = Math.max(0, now - lastFrameTime);
    if (framed && dt >= SHORTEST_FRAME_MS) frameGap = Math.min(frameGap, dt);
    const step = Math.min(dt, 2 * frameGap);
    framed = true;
    lastFrameTime = Math.max(lastFrameTime, now);
    openingMs += step;
    if (lmK) lmK.ms = openingMs;
    const t = openingMs / 1000;
    const curW = (win && win.innerWidth) || 1280;
    const curH = (win && win.innerHeight) || 880;
    const fig = figureAt(t, curW, curH);
    currentOpeningFig = fig;

    if (t >= TIMING.STILL_UNTIL) {
      syncCorner(fig.phi);
    }

    if (ctx && canvas) {
      const dpr = (win && win.devicePixelRatio) || 1;
      if (canvas.width !== curW * dpr || canvas.height !== curH * dpr) {
        canvas.width = curW * dpr;
        canvas.height = curH * dpr;
        if (ctx.scale) ctx.scale(dpr, dpr);
      }
      const ground = getGroundRgb(doc);
      if (ctx.clearRect) ctx.clearRect(0, 0, curW, curH);
      if (fig.ground > 0 && ctx.fillStyle && ctx.fillRect) {
        ctx.fillStyle = rgb(ground);
        ctx.globalAlpha = fig.ground;
        ctx.fillRect(0, 0, curW, curH);
        ctx.globalAlpha = 1;
      }
      const curColour = Array.isArray(fig.colour) ? fig.colour : INK_RGB;
      drawLine(ctx, fig.phi, fig, {
        depth: fig.depth,
        far: 0.4,
        colour: curColour,
        bg: mix(ground, curColour, fig.ground),
        alpha: fig.alpha
      });
    }

    if (t >= TIMING.ARRIVE) {
      waitReady.then(() => giveWay("time"));
      return;
    }

    if (!state.ended && win && win.requestAnimationFrame) {
      rafId = win.requestAnimationFrame(renderFrame);
    }
  }

  function startOpening() {
    if (isCovered()) {
      coverHoldTimer = setTimeout(startOpening, 150);
      return;
    }
    lastFrameTime = (win && win.performance ? win.performance.now() : Date.now());
    if (win && !(win.__stubNoFramesAndNeverReady) && win.requestAnimationFrame) {
      rafId = win.requestAnimationFrame(renderFrame);
    }
  }
  startOpening();

  return {
    giveWay,
    veil,
    get reason() { return state.reason; },
    get ended() { return state.ended; },
    get ms() { return state.ms; }
  };
}

function launchState() {
  return launchStateRecord.reason ? { reason: launchStateRecord.reason, ms: launchStateRecord.ms } : null;
}

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
