/* THE MOTION LEGS: what the eye sees while the list, the pills and the rail move, read frame by
 * frame from a real catalog.
 *
 *   ETIUDA_FIXTURES=<folder> node tests/motion.js            every leg, Chrome, at every scale
 *   ETIUDA_FIXTURES=<folder> node tests/motion.js m1 m3      those legs only, at every scale
 *   ETIUDA_FIXTURES=<folder> node tests/motion.js m11@150    one leg at one scale
 *
 * tests/smoke.js runs every leg in a context of its own at the end of its run; this file alone
 * is the quick way to watch one leg go red and green.
 *
 * HOW A LEG READS MOTION. Before the act, in the same task, every tracked element's box is read
 * and keyed (a card by its id, a pill by its category key, a rail row by its intent). The act
 * runs, then a requestAnimationFrame loop reads every box again once per frame. A card's top is
 * taken in page coordinates (the scroller's offset added), so a scroll is not read as the card
 * moving. The first frame an element carries a running animation, its animations are seeked to
 * their start for one read and put back: that read is where the glide begins, which is the
 * place the eye is shown first. Over the frames, an element on screen before and after:
 *   - that ends where it began must not move in any frame by more than 1px (a snap);
 *   - that ends elsewhere must be animated in at least one frame (else it jumped), and its glide
 *     must begin within 1px of where it was painted (else it jumped to the glide's start);
 *   - must be in the page in every frame (else it vanished for a frame);
 *   - that ends elsewhere must be painted, in every frame, near the straight line from where it
 *     was to where it lands (else it left its path: a glide whose layout changed under it), and
 *     never more than 12px past either end of that line (else it leapt along it, or overshot).
 * An element new to the screen must arrive animated where a leg asks for it, and one that leaves
 * the screen must leave animated: gliding out, or as the dismiss of a copy left where it was (a
 * card's copy carries data-leave). A card a leg names in `leaves` is judged that way wherever
 * it lands: its copy must fade where it was, and the card must arrive animated if it lands on
 * screen.
 *
 * SCALES. A leg that reads motion runs at 100, 125 and 150 per cent, each at the window a
 * 1920x1080 screen gives at that scale less its chrome, so the row of pills wraps as a desk's does:
 * at 100 per cent it rests on two lines, at 125 and 150 on three or more. Its id carries the scale,
 * m11@150. A leg about cost or a resize runs at 100 alone.
 */
"use strict";
const VIEW = { width: 1600, height: 900 };
const SCALES = [{ at: "", width: 1600, height: 900, deviceScaleFactor: 1 },
                { at: "@125", width: 1536, height: 816, deviceScaleFactor: 1.25 },
                { at: "@150", width: 1280, height: 680, deviceScaleFactor: 1.5 }];
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Installed in the page once. Kept free of the engine's names except where a leg asks for them,
   so a renamed function reddens the leg that needs it and not the tracker. */
function instrument() {
  const KINDS = {
    cards: { sel: "#list .card[data-id], #list .card[data-leave]", page: true,
             key: el => el.hasAttribute("data-id") ? "c:" + el.getAttribute("data-id") : "g:" + el.getAttribute("data-leave") },
    pills: { sel: "#pills .pill",
             key: el => el.dataset.k != null ? "k:" + el.dataset.k : (el.classList.contains("pill-add") ? "add" : null) },
    rail: { sel: "#intentRailList .rail-item[data-si]", key: el => "r" + el.dataset.si }
  };
  const GEO = /^(transform|translate|scale|width|minWidth|height|maxHeight|opacity|top|left)$/;
  const scroller = () => document.getElementById("pageScroll") || document.scrollingElement;
  const read = (kind, seen, first) => {
    const K = KINDS[kind], out = {}, dy = K.page ? scroller().scrollTop : 0;
    document.querySelectorAll(K.sel).forEach(el => {
      const k = K.key(el);
      if (k == null) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const o = { x: r.left, y: r.top + dy, w: r.width, top: r.top, bottom: r.bottom };
      const an = el.getAnimations ? el.getAnimations() : [];
      /* Only what moves or shows a box: a colour's .1s state change is not motion. */
      const running = an.filter(a => (a.playState === "running" || a.playState === "paused") && a.effect
        && a.effect.getKeyframes().some(f => Object.keys(f).some(n => GEO.test(n))));
      if (running.length) {
        o.anim = 1;
        if (first && !seen.has(k)) {
          seen.add(k);
          const was = running.map(a => a.currentTime);
          running.forEach(a => { a.currentTime = 0; });
          const s = el.getBoundingClientRect();
          running.forEach((a, i) => { a.currentTime = was[i]; });
          o.start = { x: s.left, y: s.top + dy, w: s.width };
        }
      }
      if (+getComputedStyle(el).opacity < 0.99) o.anim = 1;
      out[k] = o;
    });
    return out;
  };
  window.__mt = {
    /* One value per frame from window.__mtRead, the act run between the first read and the rest. */
    series: ms => new Promise(res => {
      const out = [window.__mtRead()];
      const t0 = performance.now();
      window.__mtAct();
      const f = () => {
        out.push(window.__mtRead());
        if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(out);
      };
      requestAnimationFrame(f);
    }),
    /* Snapshot, act, then one read per frame for `ms`. */
    run: (kind, ms) => new Promise(res => {
      const seen = new Set();
      const before = read(kind, seen, false);
      const t0 = performance.now();
      window.__mtAct();
      const frames = [];
      const f = () => {
        frames.push(read(kind, seen, true));
        if (performance.now() - t0 < ms) requestAnimationFrame(f); else res({ before, frames, vh: innerHeight });
      };
      requestAnimationFrame(f);
    })
  };
}

/* The verdict on one tracked run, in numbers. `top` is where the screen starts, `only` names the
   faults a leg judges, `wantArrivals` asks a box new to the screen to arrive animated. */
function judge(r, opts) {
  const o = Object.assign({ wantArrivals: false, wantLeaves: false, leaves: [], top: 0 }, opts || {});
  const vis = b => b && b.bottom > o.top && b.top < r.vh;
  const last = r.frames[r.frames.length - 1] || {};
  /* A card's id is a slug of its title and a category key is the catalog's own, so neither is
     printed: an element is named by its place in the order it was first met. */
  const names = new Map();
  const name = k => k === "add" ? "add" : k === "k:" ? "All" : (k[0] === "r" ? "row " : k[0] === "k" ? "pill " : "card ")
    + (names.has(k) ? names.get(k) : (names.set(k, names.size), names.size - 1));
  const bad = { snapped: [], jumped: [], startOff: [], offPath: [], pastEnd: [], vanished: [], popped: [], unled: [] };
  /* A glide's own bend is small: a neighbour's width tween moves a pill by a few px, a spring
     passes its end by 2 per cent. What is judged is a box painted well away from the line. */
  const offBy = (A, B, P) => { const T = [B.x - A.x, B.y - A.y], L2 = T[0] * T[0] + T[1] * T[1] || 1e-9;
    const t = Math.max(0, Math.min(1, ((P.x - A.x) * T[0] + (P.y - A.y) * T[1]) / L2));
    return Math.hypot(P.x - A.x - T[0] * t, P.y - A.y - T[1] * t); };
  /* Along the line, unclamped: how far past its start or its end a box is painted. The spring passes
     its end by 2.1 per cent by design; no leg here tracks what rides it, a settled search's cards. */
  const pastBy = (A, B, P) => { const T = [B.x - A.x, B.y - A.y], L = Math.hypot(T[0], T[1]);
    if (!L) return 0;
    const t = ((P.x - A.x) * T[0] + (P.y - A.y) * T[1]) / (L * L);
    return t < 0 ? -t * L : t > 1 ? (t - 1) * L : 0; };
  let moved = 0, still = 0, arrived = 0, left = 0;
  const ghosted = k => r.frames.some(f => f["g:" + k.slice(2)] && f["g:" + k.slice(2)].anim);
  for (const k of new Set([...Object.keys(r.before), ...Object.keys(last)])) {
    const b = r.before[k], e = last[k];
    if (k[0] === "g") continue;
    if (o.leaves.includes(k) && vis(b)) {
      left++;
      if (!ghosted(k)) bad.unled.push(name(k));
      if (vis(e) && !r.frames.some(f => f[k] && f[k].anim)) bad.popped.push(name(k));
      continue;
    }
    if (vis(b) && vis(e)) {
      if (r.frames.some(f => !f[k])) { bad.vanished.push(name(k)); continue; }
      const travel = Math.max(Math.abs(e.x - b.x), Math.abs(e.y - b.y), Math.abs(e.w - b.w));
      if (travel <= 1) {
        still++;
        const dev = Math.max(...r.frames.map(f => Math.max(Math.abs(f[k].x - b.x), Math.abs(f[k].y - b.y), Math.abs(f[k].w - b.w))));
        if (dev > 1) bad.snapped.push(name(k) + " " + Math.round(dev) + "px");
        continue;
      }
      moved++;
      if (!r.frames.some(f => f[k].anim)) { bad.jumped.push(name(k) + " " + Math.round(travel) + "px"); continue; }
      const s = (r.frames.find(f => f[k].start) || {})[k];
      const off = s && s.start ? Math.max(Math.abs(s.start.x - b.x), Math.abs(s.start.y - b.y), Math.abs(s.start.w - b.w)) : 0;
      if (off > 1) bad.startOff.push(name(k) + " " + Math.round(off) + "px");
      const far = Math.max(...r.frames.map(f => offBy(b, e, f[k])));
      if (far > 12 + 0.03 * travel) bad.offPath.push(name(k) + " " + Math.round(far) + "px");
      const past = Math.max(...r.frames.map(f => pastBy(b, e, f[k])));
      if (past > 12) bad.pastEnd.push(name(k) + " " + Math.round(past) + "px");
    } else if (!vis(b) && vis(e) && o.wantArrivals) {
      arrived++;
      if (!r.frames.some(f => f[k] && f[k].anim)) bad.popped.push(name(k));
    } else if (vis(b) && !vis(e) && o.wantLeaves) {
      left++;
      if (!ghosted(k) && !r.frames.some(f => f[k] && f[k].anim && vis(f[k]))) bad.unled.push(name(k));
    }
  }
  const faults = Object.entries(bad).filter(([n, v]) => v.length && !(o.only && !o.only.includes(n)));
  return { ok: faults.length === 0, moved, still, arrived, left,
           text: moved + " moved, " + still + " still" + (o.wantArrivals ? ", " + arrived + " arrived" : "")
             + (o.wantLeaves || o.leaves.length ? ", " + left + " left" : "")
             + (faults.length ? "; " + faults.map(([n, v]) => n + " " + v.length + " (" + v.slice(0, 3).join(", ") + ")").join("; ") : "") };
}

/* The card a leg acts on, from the cards on offer in list order as {id, top, left}: the first whose
   top lies in the middle band of the screen, and where a scale leaves that band empty, the one whose
   top is nearest the middle of the screen below the header, never the list's head, which a star
   leaves where it is, in the band or out of it (at 1280x680 the head's top lies inside the band).
   `top` is where the screen starts under the header. */
function middleCard(cards, vh, top) {
  const head = cards.reduce((h, c) => !h || c.top < h.top - 1 || (Math.abs(c.top - h.top) <= 1 && c.left < h.left) ? c : h, null);
  const band = cards.find(c => c !== head && c.top > vh * 0.3 && c.top < vh * 0.6);
  if (band) return band.id;
  const mid = (top + vh) / 2;
  const pool = cards.filter(c => c !== head && c.top >= top && c.top < vh - 80)
    .sort((a, b) => Math.abs(a.top - mid) - Math.abs(b.top - mid) || a.left - b.left);
  return pool.length ? pool[0].id : null;
}
/* The cards a leg may act on, read in the page: `sel` picks them, `need` names a control each must
   carry, `unstarred` leaves out a card already starred. */
async function offerCards(p, sel, need, unstarred) {
  return p.evaluate((sel, need, unstarred) => {
    const sc = document.getElementById("pageScroll") || document.scrollingElement;
    const top = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
    const cards = [...document.querySelectorAll(sel)].filter(el => el.querySelector(need) && !(unstarred && el.querySelector(".star-btn.on")))
      .map(el => { const r = el.getBoundingClientRect(); return { id: el.getAttribute("data-id"), top: r.top, left: r.left }; });
    return { cards, vh: innerHeight, top };
  }, sel, need, !!unstarred);
}

/* Back to the resting desk between legs: no query, no intent, no category, the top of the page. */
async function rest(p) {
  await p.evaluate(() => {
    const q = document.getElementById("intent");
    if (q && q.value) { q.value = ""; q.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  for (let i = 0; i < 4; i++) { await p.keyboard.press("Escape"); await sleep(120); }
  await p.evaluate(() => {
    const all = document.querySelector('#pills .pill[data-k=""]');
    if (all && !all.classList.contains("on")) all.click();
    (document.getElementById("pageScroll") || document.scrollingElement).scrollTop = 0;
  });
  await sleep(900);
}

const LEGS = [];
const leg = (id, what, fn, one) => LEGS.push({ id, what, fn, scales: one ? SCALES.slice(0, 1) : SCALES });

async function track(p, kind, ms, act) {
  await p.evaluate(act);
  return p.evaluate((k, m) => window.__mt.run(k, m), kind, ms);
}

/* A compact boot for the standalone run: through the offer and the tour to a page with cards. */
async function boot(p, url) {
  await p.goto(url, { waitUntil: "load", timeout: 90000 });
  await p.waitForFunction(() => document.querySelectorAll(".card").length > 0 || !!document.querySelector("#eCatalogOffer")
    || [...document.querySelectorAll("#tourRoot button")].some(x => x.offsetWidth > 0), { timeout: 30000 }).catch(() => {});
  const press = (rx, sc) => p.evaluate((r, sc) => {
    const el = [...document.querySelectorAll(sc + " button")].filter(x => x.offsetWidth > 0).find(x => new RegExp(r, "i").test(x.textContent));
    if (!el) return null; el.click(); return 1; }, rx, sc);
  for (const [sc, rx, n] of [["#tourRoot", "skip|not now|close|pomi", 1],
                             ["#eCatalogOffer", "^(load|yes|tak)([^a-z]|$)|load it|load the catalog|sample catalog|update", 4],
                             ["#tourRoot", "skip|not now|close|pomi", 3]]) {
    if (sc === "#eCatalogOffer") await p.waitForSelector(sc, { timeout: 2500 }).catch(() => {});
    for (let i = 0; i < n; i++) { if (!(await press(rx, sc))) break; await sleep(1200); }
  }
  await p.keyboard.press("Escape");
  await p.waitForFunction(() => document.querySelectorAll(".card").length > 100, { timeout: 30000 });
  await p.evaluate(() => { const m = document.getElementById("eAgentModal"); if (m) m.remove(); });
  await sleep(1500);
}

/* ---- THE LEGS ------------------------------------------------------------------------------ */

leg("m1", "a render that changes nothing moves no card on screen", async p => {
  const r = await track(p, "cards", 400, () => { window.__mtAct = () => render(); });
  return judge(r);
});

leg("m2", "an intent pick holds the pill bar's height: no frame taller or shorter than before and after", async p => {
  const out = [];
  let ok = true;
  for (const nth of [3, 8]) {
    await rest(p);
    await p.evaluate(n => {
      window.__mtRead = () => Math.round(document.getElementById("pillsSlot").getBoundingClientRect().height * 10) / 10;
      window.__mtAct = () => [...document.querySelectorAll("#intentRailList .rail-item[data-si]:not(.on)")][n].click();
    }, nth);
    const h = await p.evaluate(() => window.__mt.series(700));
    const lo = Math.min(h[0], h[h.length - 1]), hi = Math.max(h[0], h[h.length - 1]);
    const bad = h.filter(x => x > hi + 1 || x < lo - 1);
    if (bad.length) ok = false;
    out.push("row " + nth + ": " + h[0] + " to " + h[h.length - 1] + "px"
      + (bad.length ? ", " + bad.length + " frame(s) at " + [...new Set(bad)].join("/") + "px" : ""));
  }
  return { ok, text: out.join("; ") };
});

/* A query settles the pills: the counts and the order change, All's count and width with them. */
async function settleQuery(p, text) {
  await p.focus("#intent");
  await p.keyboard.type(text);
  await sleep(150);
  return track(p, "pills", 700, () => { window.__mtAct = () => railSettle(); });
}

leg("m3", "a search settle glides every pill that moves or changes width, All and the add button included", async p => {
  /* Two queries, each reordering the row: one letter moves the add button to another line, and
     a rare pair takes All's count from three digits to two. */
  const out = [];
  let ok = true;
  for (const q of ["e", "zz"]) {
    await rest(p);
    const r = await settleQuery(p, q);
    const j = judge(r, { only: ["jumped", "snapped", "vanished", "pastEnd"] }), last = r.frames[r.frames.length - 1];
    const d = (k, f) => r.before[k] && last[k] ? Math.round(f(last[k]) - f(r.before[k])) : "none";
    ok = ok && j.ok && j.moved > 0;
    out.push(JSON.stringify(q) + ": " + j.text + "; All's width " + d("k:", x => x.w) + "px, the add button "
      + d("add", x => x.x) + "px across and " + d("add", x => x.y) + "px down");
  }
  return { ok, text: out.join(" | ") };
});

leg("m4", "a pill's glide begins where it was painted, on a settle that changes widths and on a second pick", async p => {
  const out = [];
  let ok = true;
  const r1 = await settleQuery(p, "zz");
  const j1 = judge(r1, { only: ["startOff"] });
  ok = ok && j1.ok && j1.moved > 0;
  out.push("settle: " + j1.text);
  await rest(p);
  await p.evaluate(() => [...document.querySelectorAll("#intentRailList .rail-item[data-si]:not(.on)")][3].click());
  await sleep(1500);
  const r2 = await track(p, "pills", 900, () => { window.__mtAct = () =>
    [...document.querySelectorAll("#intentRailList .rail-item[data-si]:not(.on)")][5]
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })); });
  const j2 = judge(r2, { only: ["startOff"] });
  ok = ok && j2.ok && j2.moved > 0;
  out.push("Ctrl pick: " + j2.text);
  return { ok, text: out.join(" | ") };
});

leg("m5", "a category press and All glide every card that stays on screen, and the cards it brings rise in", async p => {
  /* The category of a card in the lower half of the screen, so that card stays and travels up. */
  const k = await p.evaluate(() => {
    const vh = innerHeight;
    const c = [...document.querySelectorAll("#list .card[data-id]")].find(el => {
      const r = el.getBoundingClientRect(); return r.top > vh * 0.5 && r.top < vh * 0.85; });
    const m = c && findCard(c.getAttribute("data-id"));
    return m ? String(m.c) : null;
  });
  if (k == null) return { ok: false, text: "no card in the lower half of the screen to follow" };
  const out = [];
  let ok = true;
  for (const [what, key] of [["the press", k], ["All", ""]]) {
    await p.evaluate(key => { window.__mtKey = key; }, key);
    const r = await track(p, "cards", 700, () => { window.__mtAct = () =>
      document.querySelector('#pills .pill[data-k="' + CSS.escape(window.__mtKey) + '"]').click(); });
    const j = judge(r, { wantArrivals: true });
    ok = ok && j.ok && j.moved > 0;
    out.push(what + ": " + j.text);
    await sleep(600);
  }
  return { ok, text: out.join(" | ") };
});

leg("m6", "an intent pick and its clear glide every card that stays on screen, across columns too", async p => {
  const out = [];
  let ok = true;
  for (const nth of [2, 6]) {
    await rest(p);
    await p.evaluate(n => { window.__mtN = n; }, nth);
    const r = await track(p, "cards", 1300, () => { window.__mtAct = () =>
      [...document.querySelectorAll("#intentRailList .rail-item[data-si]:not(.on)")][window.__mtN].click(); });
    const j = judge(r, { wantArrivals: true });
    ok = ok && j.ok && j.moved > 0;
    out.push("pick " + nth + ": " + j.text);
    await sleep(400);
    const c = await track(p, "cards", 900, () => { window.__mtAct = () => clearIntents(); });
    const k = judge(c, { wantArrivals: true });
    ok = ok && k.ok;
    out.push("clear: " + k.text);
  }
  return { ok, text: out.join(" | ") };
});

leg("m7", "a star and its removal glide every card that stays on screen, across columns too", async p => {
  const o = await offerCards(p, "#list .card[data-id]", '[data-act="fav"]');
  const id = middleCard(o.cards, o.vh, o.top);
  if (!id) return { ok: false, text: "no card in the middle of the screen to star" };
  await p.evaluate(id => { window.__mtId = id; }, id);
  const out = [];
  let ok = true;
  for (const what of ["star", "unstar"]) {
    const r = await track(p, "cards", 700, () => { window.__mtAct = () =>
      document.querySelector('#list .card[data-id="' + CSS.escape(window.__mtId) + '"] [data-act="fav"]').click(); });
    const j = judge(r, { wantArrivals: true });
    ok = ok && j.ok && j.moved > 0;
    out.push(what + ": " + j.text);
    await sleep(500);
  }
  return { ok, text: out.join(" | ") };
});

leg("m8", "a settle, a pick and a clear glide every rail row that stays in the panel, however far it travels", async p => {
  const out = [];
  let ok = true;
  for (const q of ["e", "zz", "a"]) {
    await rest(p);
    await p.focus("#intent");
    await p.keyboard.type(q);
    await sleep(150);
    const r = await track(p, "rail", 700, () => { window.__mtAct = () => railSettle(); });
    const top = await p.evaluate(() => document.getElementById("intentRailList").getBoundingClientRect().top);
    const bottom = await p.evaluate(() => document.getElementById("intentRailList").getBoundingClientRect().bottom);
    r.vh = bottom;
    const j = judge(r, { top, wantArrivals: true });
    ok = ok && j.ok;
    out.push(JSON.stringify(q) + ": " + j.text);
  }
  /* A pick sends its row to the top and a clear sends it home: on screen at both ends. */
  const panel = () => p.evaluate(() => { const b = document.getElementById("intentRailList").getBoundingClientRect(); return [b.top, b.bottom]; });
  for (const nth of [10, 14]) {
    await rest(p);
    const [top, bottom] = await panel();
    await p.evaluate(n => { window.__mtN = n; }, nth);
    const r = await track(p, "rail", 900, () => { window.__mtAct = () =>
      [...document.querySelectorAll("#intentRailList .rail-item[data-si]:not(.on)")][window.__mtN].click(); });
    r.vh = bottom;
    const j = judge(r, { top, wantArrivals: true });
    await sleep(900);
    const c = await track(p, "rail", 900, () => { window.__mtAct = () => clearIntents(); });
    c.vh = bottom;
    const k = judge(c, { top, wantArrivals: true });
    ok = ok && j.ok && k.ok;
    out.push("pick " + nth + ": " + j.text + "; clear: " + k.text);
  }
  return { ok, text: out.join(" | ") };
});

leg("m9", "a resize that changes the column count paints the new count in the frame that paints the new width", async p => {
  /* Read where the frame is decided: an observer made after the engine's is called after it, in
     the same frame, after layout and before paint, so what it reads is what that frame shows. */
  await p.evaluate(() => {
    window.__mtCols = [];
    window.__mtErr = [];
    addEventListener("error", e => window.__mtErr.push(String(e.message)));
    const L = document.getElementById("list");
    new ResizeObserver(() => {
      window.__mtCols.push({ dom: L.querySelectorAll(":scope>.col").length || 1, want: colCount() });
    }).observe(L.parentNode);
  });
  const out = [];
  for (const w of [1150, 1600, 900, 1600]) {
    await p.setViewport({ width: w, height: VIEW.height });
    await sleep(700);
  }
  const got = await p.evaluate(() => ({ cols: window.__mtCols, err: window.__mtErr }));
  const changed = got.cols.filter((c, i) => i && c.want !== got.cols[i - 1].want).length;
  const stale = got.cols.filter(c => c.dom !== c.want);
  out.push(got.cols.length + " observed frames, " + changed + " count changes, " + stale.length + " stale frame(s)"
    + (stale.length ? " (" + stale.map(c => c.dom + " columns where " + c.want + " fit").join(", ") + ")" : "")
    + ", " + got.err.length + " page error(s)" + (got.err.length ? ": " + got.err[0] : ""));
  await p.setViewport(VIEW);
  return { ok: stale.length === 0 && changed >= 2 && got.err.length === 0, text: out.join("") };
}, true);

/* Layouts the page ran, from the browser's own counter. A card read after the card before it was
   swapped costs a layout of its own, and the eye sees that as frames that do not come. */
async function layouts(p, metric) {
  const cdp = await p.target().createCDPSession();
  await cdp.send("Performance.enable");
  const read = async () => (await cdp.send("Performance.getMetrics")).metrics.find(m => m.name === (metric || "LayoutCount")).value;
  return { read, done: () => cdp.detach().catch(() => {}) };
}

leg("m10", "a language switch rebuilds the cards without a layout per card", async p => {
  const L = await layouts(p);
  const out = [];
  let ok = true;
  try {
    for (let i = 0; i < 2; i++) {
      await p.evaluate(() => {
        window.__mtGaps = [];
        let last = performance.now();
        const t0 = last;
        (function f(now) { window.__mtGaps.push(now - last); last = now; if (now - t0 < 1500) requestAnimationFrame(f); })(last);
      });
      const n0 = await L.read();
      await p.evaluate(() => [...document.querySelectorAll("#seg button")].find(b => !b.classList.contains("on")).click());
      await sleep(1700);
      const n = (await L.read()) - n0;
      const gap = await p.evaluate(() => Math.round(Math.max(...window.__mtGaps.slice(1))));
      const cards = await p.evaluate(() => document.querySelectorAll("#list .card[data-id]").length);
      ok = ok && n < 60;
      out.push("switch " + (i + 1) + ": " + n + " layouts for " + cards + " cards, longest frame " + gap + "ms");
    }
  } finally { await L.done(); }
  return { ok, text: out.join(" | ") };
}, true);

leg("m11", "a clear after a pick and a Ctrl pick glides every pill along its path, the row never wrapped another way", async p => {
  /* Rows counted among those wholly on screen, so the pick lands where a hand would put it. */
  const row = n => p.evaluate(n => {
    const rs = [...document.querySelectorAll("#intentRailList .rail-item[data-si]")].filter(e => {
      const r = e.getBoundingClientRect(); return r.width && r.top > 0 && r.bottom < innerHeight; });
    window.__mtEl = rs[n]; return !!rs[n]; }, n);
  const out = [];
  let ok = true;
  for (const [a, c] of [[1, 4], [2, 5], [3, 6]]) {
    await rest(p);
    if (!(await row(a))) return { ok: false, text: "no rail row " + a + " on screen" };
    await p.evaluate(() => window.__mtEl.click());
    await sleep(1400);
    if (!(await row(c))) return { ok: false, text: "no rail row " + c + " on screen" };
    await p.evaluate(() => window.__mtEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })));
    await sleep(1400);
    const r = await track(p, "pills", 900, () => { window.__mtAct = () => document.getElementById("intentRailClear").click(); });
    const j = judge(r, { only: ["jumped", "snapped", "startOff", "offPath", "pastEnd", "vanished"] });
    ok = ok && j.ok && j.moved > 0;
    out.push("rows " + a + " and " + c + ": " + j.text);
  }
  return { ok, text: out.join(" | ") };
});

leg("m12", "a star and a hide glide the cards that stay on screen at the top and deep in the list, the hidden card leaves with the dismiss, and the cards they bring rise in", async p => {
  const out = [];
  let ok = true;
  for (const depth of [0, 0.4]) {
    for (const act of ["fav", "hide"]) {
      await rest(p);
      await p.evaluate(d => { const s = document.getElementById("pageScroll") || document.scrollingElement;
        s.scrollTop = Math.round(d * (s.scrollHeight - s.clientHeight)); }, depth);
      await sleep(900);
      /* A card in the middle of the screen, neither starred nor put away. */
      const o = await offerCards(p, "#list .card[data-id]:not(.is-hidden)", '[data-act="' + act + '"]', true);
      const id = middleCard(o.cards, o.vh, o.top);
      if (!id) { ok = false; out.push(act + " at " + depth + ": no card in the middle of the screen"); continue; }
      await p.evaluate((id, act) => { window.__mtId = id; window.__mtActName = act; }, id, act);
      const r = await track(p, "cards", 700, () => { window.__mtAct = () =>
        document.querySelector('#list .card[data-id="' + CSS.escape(window.__mtId) + '"] [data-act="' + window.__mtActName + '"]').click(); });
      const j = judge(r, { wantArrivals: true, wantLeaves: true, leaves: act === "hide" ? ["c:" + id] : [] });
      /* A star moves cards on screen at either depth; a hide always leaves, and what closes its gap
         may come from below the screen. */
      ok = ok && j.ok && (act === "fav" ? j.moved > 0 : j.left > 0);
      out.push((act === "fav" ? "star" : "hide") + " at " + depth + ": " + j.text);
      /* Undone off the record, so the next act starts from the resting desk. */
      await sleep(400);
      await p.evaluate((id, act) => { if (act === "fav") toggleFavourite(id); else hideCard(id); }, id, act);
      await sleep(400);
    }
  }
  return { ok, text: out.join(" | ") };
});

leg("m13", "a category press recalculates style a handful of times, not once per rail row it echoes", async p => {
  /* The press's own task: every style pass there comes before the first frame of the glide, so
     the eye sees them as a late start. Counted by the browser. */
  const k = await p.evaluate(() => {
    const vh = innerHeight;
    const c = [...document.querySelectorAll("#list .card[data-id]")].find(el => {
      const r = el.getBoundingClientRect(); return r.top > vh * 0.5 && r.top < vh * 0.85; });
    const m = c && findCard(c.getAttribute("data-id"));
    return m ? String(m.c) : null;
  });
  if (k == null) return { ok: false, text: "no card in the lower half of the screen to follow" };
  const L = await layouts(p, "RecalcStyleCount");
  const out = [];
  let ok = true;
  try {
    for (const [what, key] of [["the press", k], ["All", ""]]) {
      await p.evaluate(key => { window.__mtKey = key; }, key);
      const n0 = await L.read();
      const ms = await p.evaluate(() => { const t = performance.now();
        document.querySelector('#pills .pill[data-k="' + CSS.escape(window.__mtKey) + '"]').click();
        return Math.round(performance.now() - t); });
      const n = (await L.read()) - n0;
      const rows = await p.evaluate(() => document.querySelectorAll("#intentRailList .rr-open, #intentRailList .rr-cont").length);
      /* Once per echoed row was 84 for 75 rows; the press must echo enough rows to have teeth. */
      ok = ok && n <= 30 && (key === "" || rows >= 20);
      out.push(what + ": " + n + " style recalculations in its task, " + rows + " rail rows in echo runs, task " + ms + "ms");
      await sleep(700);
    }
  } finally { await L.done(); }
  return { ok, text: out.join(" | ") };
}, true);

/* Every leg at every scale it runs at, grouped by scale so the window changes twice. */
const RUNS = SCALES.flatMap(s => LEGS.filter(L => L.scales.includes(s))
  .map(L => ({ id: L.id + s.at, what: L.what, fn: L.fn, view: s })));
/* The window a run wants, settled: a new scale re-lays the page, and the next leg's rest must not
   meet it half done. */
async function viewFor(p, run, now) {
  if (now === run.view) return now;
  await p.setViewport(run.view);
  await sleep(1200);
  return run.view;
}

module.exports = { LEGS, RUNS, SCALES, viewFor, judge, middleCard, instrument, rest, boot, VIEW };

if (require.main === module) {
  const os = require("os");
  try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) {}
  const E = require("./engine.js");
  const puppeteer = require("puppeteer-core");
  const want = process.argv.slice(2);
  (async () => {
    const RUN = E.runFolder("catalogV2", "sampleV2");
    const b = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true,
      args: ["--hide-scrollbars"], protocolTimeout: 180000 });
    let fails = 0, n = 0;
    try {
      const p = await b.newPage();
      await p.setViewport(VIEW);
      let view = SCALES[0];
      const errs = [];
      p.on("pageerror", e => errs.push(String(e.message || e)));
      await boot(p, RUN.url);
      console.log("engine sha256 " + RUN.engineSha.slice(0, 12) + ", " + await p.evaluate(() => document.querySelectorAll(".card").length) + " cards");
      await p.evaluate(instrument);
      for (const L of RUNS) {
        if (want.length && !want.includes(L.id) && !want.includes(L.id.replace(/@.*/, ""))) continue;
        view = await viewFor(p, L, view);
        await rest(p);
        let r;
        try { r = await L.fn(p); } catch (x) { r = { ok: false, text: "threw: " + (x && x.message || x) }; }
        n++; if (!r.ok) fails++;
        console.log((r.ok ? "  ok   " : "  FAIL ") + L.id + " " + L.what + ": " + r.text);
      }
      console.log("  page errors: " + (errs.length ? errs.join(" | ") : "none"));
    } finally {
      await b.close().catch(() => {});
      RUN.drop();
    }
    console.log("  " + (n - fails) + "/" + n + " motion legs passed");
    process.exitCode = fails ? 1 : 0;
  })().catch(e => { console.error(e); process.exitCode = 1; });
}
