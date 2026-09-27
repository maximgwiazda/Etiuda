/* THE MOTION LEGS: what the eye sees while the list, the pills and the rail move, read frame by
 * frame from a real catalog.
 *
 *   ETIUDA_FIXTURES=<folder> node tests/motion.js            every leg, Chrome, 1600x900
 *   ETIUDA_FIXTURES=<folder> node tests/motion.js m1 m3      those legs only
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
 *   - must be in the page in every frame (else it vanished for a frame).
 * An element new to the screen must arrive animated. Width is read for the pills only.
 */
"use strict";
const path = require("path");

const VIEW = { width: 1600, height: 900 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Installed in the page once. Kept free of the engine's names except where a leg asks for them,
   so a renamed function reddens the leg that needs it and not the tracker. */
function instrument() {
  const KINDS = {
    cards: { sel: "#list .card[data-id]", key: el => el.getAttribute("data-id"), page: true },
    pills: { sel: "#pills .pill", width: true,
             key: el => el.dataset.k != null ? "k:" + el.dataset.k : (el.classList.contains("pill-add") ? "add" : null) },
    rail: { sel: "#intentRailList .rail-item[data-si]", key: el => "r" + el.dataset.si }
  };
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
      const running = an.filter(a => a.playState === "running" || a.playState === "paused");
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

/* The verdict on one tracked run, in numbers. `area` says which boxes count as on screen. */
function judge(r, opts) {
  const o = Object.assign({ wantArrivals: false, top: 0 }, opts || {});
  const vis = b => b && b.bottom > o.top && b.top < r.vh;
  const last = r.frames[r.frames.length - 1] || {};
  /* A card's id is a slug of its title and a category key is the catalog's own, so neither is
     printed: an element is named by its place in the order it was first met. */
  const names = new Map();
  const name = k => k === "add" ? "add" : k === "k:" ? "All" : (k[0] === "r" ? "row " : "#")
    + (names.has(k) ? names.get(k) : (names.set(k, names.size), names.size - 1));
  const bad = { snapped: [], jumped: [], startOff: [], vanished: [], popped: [] };
  let moved = 0, still = 0, arrived = 0;
  for (const k of new Set([...Object.keys(r.before), ...Object.keys(last)])) {
    const b = r.before[k], e = last[k];
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
    } else if (!vis(b) && vis(e) && o.wantArrivals) {
      arrived++;
      if (!r.frames.some(f => f[k] && f[k].anim)) bad.popped.push(name(k));
    }
  }
  const faults = Object.entries(bad).filter(([, v]) => v.length);
  return { ok: faults.length === 0, moved, still, arrived,
           text: moved + " moved, " + still + " still" + (o.wantArrivals ? ", " + arrived + " arrived" : "")
             + (faults.length ? "; " + faults.map(([n, v]) => n + " " + v.length + " (" + v.slice(0, 3).join(", ") + ")").join("; ") : "") };
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
const leg = (id, what, fn) => LEGS.push({ id, what, fn });

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

module.exports = { LEGS, instrument, rest, boot, VIEW };

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
      const errs = [];
      p.on("pageerror", e => errs.push(String(e.message || e)));
      await boot(p, RUN.url);
      console.log("engine sha256 " + RUN.engineSha.slice(0, 12) + ", " + await p.evaluate(() => document.querySelectorAll(".card").length) + " cards");
      await p.evaluate(instrument);
      for (const L of LEGS) {
        if (want.length && !want.includes(L.id)) continue;
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
