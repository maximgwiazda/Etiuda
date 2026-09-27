/* THE TOUR, WALKED AS A PERSON WALKS IT, for tests/smoke.js.
 *
 * The tour teaches by doing (Maxim, 2026-09-27 23:28): a step that teaches an act asks for it and
 * moves on when the act is done, Next stands only on a step that asks nothing, and there is no
 * step counter. So a walk by Enter or by Next reaches the second step and stops there, which is
 * what the smoke's old walk would have done had it run. This file is the other way round: one
 * entry per step, saying what a person does on it, and a driver that does exactly that with the
 * mouse and the keyboard at the place the step's ring is drawn.
 *
 * THE PLAN IS DATA, AND tests/test.js HOLDS IT TO THE STEP TABLE. `planProblems` compares it with
 * TOUR_STEPS as sliced out of src/modules/tour.js: the same ids in the same order, Next exactly
 * where the table asks nothing, the same window opened by the same step, an act for every step
 * that asks one, and a wait at least as long as the step's own settling. A step added, dropped,
 * reordered or turned from an act into a Next without this file following is a red unit leg, so
 * the smoke cannot drift into walking a tour that no longer exists.
 *
 * WHAT A ROW SAYS:
 *   next     the step asks nothing: its Next is pressed (`type` first, where it holds a field).
 *   type     click the field inside the ring and type into it.
 *   click    click these, in order, each at a point inside the ring that the page itself answers
 *            (elementFromPoint), so a bubble drawn over the thing asked for is a failure, not a
 *            click that lands anyway. More than one: the Menu first, then the row it opens.
 *   into     the window the click opens; the tour must follow the person into it.
 *   inside   the step stands inside a window; `close` is how the person closes it.
 *   reload   the step is done by loading a catalog, which reloads the page; its caller does it.
 *   settle   how long the step waits for typing to pause before it reads the act.
 *   then     a key pressed once the step has moved on, as the bubble itself teaches ("Esc clears
 *            the box"): the search is cleared so a word that matches nothing in the catalog on
 *            screen cannot leave the cards step with no card to copy.
 *
 * Words typed are invented, never catalog wording, and nothing the page shows is printed. */
"use strict";

const ACT_MS = 350; // what a step with no `settle` waits, TOUR_ACT_MS in tour.js, held by planProblems
const LATE_MS = 3000; // on top of a step's own settling, before a step that did not move is a finding

const PLAN = [
  { id: "name", next: true, type: { sel: "#tourName", text: "Invented Agent" } },
  { id: "load", reload: true },
  { id: "pax", type: { sel: "#pax", text: "Invented Customer" }, settle: 1200 },
  { id: "search", type: { sel: "#intent", text: "return" }, settle: 1200, then: "Escape" },
  { id: "rail", click: ["#intentRailList .rail-item[data-si]:not(.on) .rail-t"] },
  { id: "cards", click: ["#list .card[data-id] .txt[data-v]"] },
  { id: "pills", click: ["#pills .pill:not(.on):not(.pill-nohit) .pill-lab"], counted: true },
  { id: "tabs", click: ["#tabsWrap .tab-add"] },
  { id: "seg", click: ["#seg button:not(.on)"] },
  { id: "star", click: ["#list .card .star-btn"] },
  { id: "hide", click: ['#list .card [data-act="hide"]'] },
  { id: "edit", click: ['#list .card [data-act="edit"]'], into: "editor" },
  { id: "editor", inside: true, close: "#meCancel" },
  { id: "add", click: ["#addCardFab"], into: "addIn" },
  { id: "addIn", inside: true, close: "#meCancel" },
  { id: "facts", click: ["#factsBtn"], into: "factsIn" },
  { id: "factsIn", inside: true, close: "#factsBtn" },
  { id: "theme", click: ["#theme"] },
  { id: "menu", click: ["#settingsBtn"] },
  { id: "library", click: ['#settingsMenu [data-act="manage"]'], into: "libraryIn" },
  { id: "libraryIn", inside: true, close: "#modalX" },
  { id: "settings", click: ["#settingsBtn", '#settingsMenu [data-act="settings"]'], into: "settingsIn" },
  { id: "settingsIn", inside: true, close: "#modalX" },
  { id: "done", next: true }
];

const rowOf = id => PLAN.find(r => r.id === id) || null;

/** Where the tour should stand once `id` is done: the window it opens, else the next row, passing
 *  over the load step on a desk that already holds a catalog. Null after the last. */
function after(id, loaded) {
  const i = PLAN.findIndex(r => r.id === id);
  if (i < 0) return undefined;
  if (PLAN[i].into) return PLAN[i].into;
  for (let j = i + 1; j < PLAN.length; j++) if (!(loaded && PLAN[j].reload)) return PLAN[j].id;
  return null;
}

/** Every way the plan disagrees with the step table, as sentences; empty when it walks this tour.
 *  `asks` is tour.js's own tourAsks and `actMs` its TOUR_ACT_MS, both sliced by the caller. */
function planProblems(steps, asks, actMs) {
  const out = [];
  const ids = steps.map(s => s.id), mine = PLAN.map(r => r.id);
  if (ids.join(",") !== mine.join(",")) out.push("order: the table has " + ids.join(",") + " and the walk " + mine.join(","));
  steps.forEach(s => {
    const r = rowOf(s.id);
    if (!r) { out.push(s.id + ": no row in the walk"); return; }
    const acts = !!(r.click || r.type);
    if (!!r.next !== !asks(s)) out.push(s.id + ": the walk " + (r.next ? "presses Next" : "does an act") + " where the table " + (asks(s) ? "asks" : "asks nothing"));
    if (!!r.inside !== !!s.inside) out.push(s.id + ": inside a window in " + (s.inside ? "the table" : "the walk") + " only");
    if ((r.into || null) !== (s.opens || null)) out.push(s.id + ": opens " + (s.opens || "nothing") + " in the table and " + (r.into || "nothing") + " in the walk");
    if (!!r.reload !== !!s.waits) out.push(s.id + ": done by a load in " + (s.waits ? "the table" : "the walk") + " only");
    if (s.inside && !r.close) out.push(s.id + ": no way out of its window in the walk");
    if (asks(s) && !s.inside && !s.waits && !acts) out.push(s.id + ": asks for an act the walk does not do");
    if (s.name && !(r.type && r.type.sel === "#tourName")) out.push(s.id + ": holds the name field and the walk does not type into it");
    const need = (s.does && s.does.settle) || actMs, wait = r.settle || ACT_MS;
    if (s.does && wait < need) out.push(s.id + ": the step settles for " + need + " ms and the walk waits " + wait);
  });
  if (ACT_MS !== actMs) out.push("the walk's ACT_MS is " + ACT_MS + " and tour.js's TOUR_ACT_MS " + actMs);
  return out;
}

/* ---- In the page. Each is handed to evaluate() whole, so none may close over anything here. ---- */

/** What the step shows once it stands: its buttons, its stacking, what is open over the page. */
function LOOK() {
  const q = id => document.getElementById(id);
  const shown = el => !!el && !el.hidden && el.offsetWidth > 0;
  const root = q("tourRoot"), card = q("tourCard"), menu = q("settingsMenu");
  const m = menu && !menu.hidden ? menu.getBoundingClientRect() : null, c = card ? card.getBoundingClientRect() : null;
  const words = ["tourTitle", "tourNext", "tourPrev", "tourSkip"].map(id => (q(id) || {}).textContent || "").join(" ");
  return {
    up: !!root && !root.hidden && getComputedStyle(root).display !== "none" && root.getBoundingClientRect().width > 0,
    next: shown(q("tourNext")), back: shown(q("tourPrev")),
    z: root ? getComputedStyle(root).zIndex : "", behind: !!root && root.classList.contains("behind"),
    window: !!document.querySelector("body > .modal:not([hidden]):not(.e-gone)"),
    facts: shown(q("factsPanel")),
    menu: !!m,
    clear: !m || !c || c.right <= m.left || c.left >= m.right || c.bottom <= m.top || c.top >= m.bottom,
    /* The counter read as two numbers anywhere but the body, whose own words may show a "1/2". */
    counter: !!q("tourStepLabel") || /\d+\s*\/\s*\d+/.test(words)
  };
}

/** Waits for the ring to stop travelling (it moves on a spring), up to a second and a half. */
async function RING_STILL() {
  const h = document.getElementById("tourHole");
  if (!h) return false;
  const t0 = performance.now();
  let last = "", since = t0;
  while (performance.now() - t0 < 1500) {
    await new Promise(r => requestAnimationFrame(r));
    const r = h.getBoundingClientRect(), k = [r.left, r.top, r.width, r.height].map(Math.round).join(",");
    if (k !== last) { last = k; since = performance.now(); }
    else if (performance.now() - since >= 100) return true;
  }
  return false;
}

/** A point on the first element matching `sel` that the page answers with that element and, when
 *  `ringed`, that lies inside the ring. {x:-1} when there is none; `found` says how many matched. */
function AIM(sel, ringed, counted) {
  const h = document.getElementById("tourHole");
  const hr = h && getComputedStyle(h).display !== "none" ? h.getBoundingClientRect() : null;
  const inRing = (x, y) => !!hr && hr.width > 0 && x >= hr.left - 2 && x <= hr.right + 2 && y >= hr.top - 2 && y <= hr.bottom + 2;
  const els = [...document.querySelectorAll(sel)];
  for (const el of els) {
    if (counted) {
      const p = el.closest(".pill"), n = p && p.querySelector(".pill-r b");
      if (!n || !(+n.textContent > 0)) continue;
    }
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    for (const fy of [0.5, 0.3, 0.7]) for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      if (ringed && !inRing(x, y)) continue;
      const top = document.elementFromPoint(x, y);
      if (top && (top === el || el.contains(top))) return { x: Math.round(x), y: Math.round(y), found: els.length };
    }
  }
  return { x: -1, y: -1, found: els.length };
}

const at = pg => pg.evaluate(() => sessionStorage.getItem("eTourAt"));
const pause = ms => new Promise(r => setTimeout(r, ms));

/** Clicks what matches `sel` where a person would, and says whether it could. */
async function press(pg, sel, ringed, counted) {
  if (ringed) await pg.evaluate(RING_STILL);
  const a = await pg.evaluate(AIM, sel, !!ringed, !!counted);
  if (a.x < 0) return { sel, ok: false, found: a.found };
  await pg.mouse.click(a.x, a.y);
  return { sel, ok: true, found: a.found };
}

/** Does one step as a person does it and reads where the tour went. The record is what the smoke
 *  asserts on: `look` as the step first stood, `aims` for each click (inside its ring or not),
 *  `want` where the tour should go and `to` where it went, `asked` a question bubble left
 *  standing after the act. `loaded` passes over the load step. */
async function walkStep(pg, id, opts) {
  const o = opts || {}, r = rowOf(id);
  if (!r) throw new Error("tour-walk: no row for step " + id);
  if (r.reload) throw new Error("tour-walk: the load step reloads the page, and its caller does it");
  const rec = { id, want: after(id, o.loaded !== false), to: undefined, aims: [], look: null, asked: false, ms: 0 };
  const t0 = Date.now();
  await pause(450); // the step places its bubble on the next frame and again at 300 ms
  rec.look = await pg.evaluate(LOOK);
  if (r.type) {
    const a = await press(pg, r.type.sel, !r.next);
    rec.aims.push(a);
    if (a.ok) await pg.keyboard.type(r.type.text, { delay: 25 });
  }
  if (r.next) rec.aims.push(await press(pg, "#tourNext", false));
  for (const sel of r.click || []) {
    rec.aims.push(await press(pg, sel, true, r.counted));
    await pause(350); // a menu opened by the first click is ringed on its next frames
  }
  if (r.inside) rec.aims.push(await press(pg, r.close, false));
  const wait = (r.settle || ACT_MS) + LATE_MS;
  if (rec.want === null) {
    await pg.waitForFunction(() => !sessionStorage.getItem("eTourAt") && document.getElementById("tourRoot").hidden,
      { timeout: wait, polling: 100 }).catch(() => {});
  } else {
    await pg.waitForFunction(w => sessionStorage.getItem("eTourAt") === w, { timeout: wait, polling: 100 }, rec.want).catch(() => {});
  }
  rec.to = await at(pg);
  rec.asked = await pg.evaluate(() => !!document.querySelector("body > .bub-ask:not(.e-gone)"));
  if (r.then && rec.to === rec.want) await pg.keyboard.press(r.then);
  rec.ms = Date.now() - t0;
  return rec;
}

/** Walks from wherever the tour stands until it ends, or until a step does not move it. */
async function walkTour(pg, opts) {
  const recs = [];
  for (let i = 0; i < PLAN.length + 2; i++) {
    const id = await at(pg);
    if (!id) break;
    const rec = await walkStep(pg, id, opts);
    recs.push(rec);
    if (rec.to !== rec.want) break;
  }
  return recs;
}

module.exports = { PLAN, ACT_MS, rowOf, after, planProblems, walkStep, walkTour, at, LOOK, AIM, RING_STILL };
