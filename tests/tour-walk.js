/* THE TOUR, WALKED AS A PERSON WALKS IT, for tests/smoke.js.
 *
 * Every step has Next but the load step, where it is held back until a catalog is loaded (Maxim,
 * 2026-09-28 22:20): a step that describes is left by Next; a step that opens a window is left by
 * the person's own click or by Next, which opens the window for them; a step inside a window is
 * left by closing it, by Next, which closes it, or by Back, which closes it and returns to the step
 * that opens it. This file holds one row per step, saying which of those ways the walk takes, and a
 * driver that takes it with the mouse and the keyboard at the place the step's ring is drawn. The
 * rows are chosen so that each way is walked at least once.
 *
 * THE PLAN IS DATA, AND tests/test.js HOLDS IT TO THE STEP TABLE. `planProblems` compares it with
 * TOUR_STEPS as sliced out of src/modules/tour.js: the same ids in the same order, Next pressed
 * only where the table does not hold it back, the same window opened by the same step, an act only
 * where the step watches for one, and a way out of every window. A step added, dropped or reordered
 * without this file following is a red unit leg, so the smoke cannot drift into walking a tour
 * that no longer exists.
 *
 * WHAT A ROW SAYS:
 *   next     Next is pressed (`type` first, where the step holds a field).
 *   type     click the field inside the ring and type into it.
 *   click    click these, in order, each at a point inside the ring that the page itself answers
 *            (elementFromPoint), so a bubble drawn over the thing asked for is a failure, not a
 *            click that lands anyway. More than one: the Menu first, then the row it opens.
 *   into     the window the step opens, by the click or by Next; the tour must follow it in.
 *   inside   the step stands inside a window; `close` is how the person closes it, where the row
 *            neither presses Next nor goes `back`.
 *   back     Back is pressed inside the window: the tour must return to the step that opens it.
 *   again    the row taken on the walk's second visit to the step, which a `back` makes.
 *   reload   the step is done by loading a catalog, which reloads the page; its caller does it.
 *
 * Words typed are invented, never catalog wording, and nothing the page shows is printed. */
"use strict";

const ACT_MS = 350; // what a step waits for an act to settle, TOUR_ACT_MS in tour.js, held by planProblems
const LATE_MS = 3000; // on top of a step's own settling, before a step that did not move is a finding

const PLAN = [
  { id: "name", next: true, type: { sel: "#tourName", text: "Invented Agent" } },
  { id: "load", reload: true },
  { id: "pax", next: true },
  { id: "search", next: true },
  { id: "rail", next: true },
  { id: "cards", next: true },
  { id: "pills", next: true },
  { id: "tabs", next: true },
  { id: "seg", next: true },
  { id: "buttons", click: ['#list .card [data-act="edit"]'], into: "editor" },
  { id: "editor", inside: true, next: true },
  { id: "add", next: true, into: "addIn" },
  { id: "addIn", inside: true, close: "#meCancel" },
  { id: "facts", click: ["#factsBtn"], into: "factsIn" },
  { id: "factsIn", inside: true, close: "#factsBtn" },
  { id: "theme", next: true },
  { id: "menu", next: true },
  { id: "library", click: ['#settingsMenu [data-act="manage"]'], into: "libraryIn", again: { next: true } },
  { id: "libraryIn", inside: true, back: true, again: { close: "#modalX" } },
  { id: "settings", click: ["#settingsBtn", '#settingsMenu [data-act="settings"]'], into: "settingsIn" },
  { id: "settingsIn", inside: true, next: true },
  { id: "done", next: true }
];

/** The row for a step, on the walk's `visit` to it (1 the first): a second visit takes `again`. */
function rowOf(id, visit) {
  const r = PLAN.find(x => x.id === id) || null;
  if (!r || !(visit > 1) || !r.again) return r;
  return Object.assign({ id: r.id, inside: r.inside, into: r.into }, r.again);
}

/** Where the tour should stand once the row is done: the step before it for a `back`, the window
 *  it opens, else the next row, passing over the load step on a desk that already holds a catalog.
 *  Null after the last. */
function after(id, loaded, visit) {
  const i = PLAN.findIndex(r => r.id === id), r = rowOf(id, visit);
  if (i < 0) return undefined;
  const on = j => !(loaded && PLAN[j].reload) && !PLAN[j].inside;
  if (r.back) { for (let j = i - 1; j >= 0; j--) if (on(j)) return PLAN[j].id; return null; }
  if (r.into) return r.into;
  for (let j = i + 1; j < PLAN.length; j++) if (!(loaded && PLAN[j].reload)) return PLAN[j].id;
  return null;
}

/** The steps the walk stands on, in order, visits included, from the first to the end. */
function route(loaded) {
  const seen = {}, out = [];
  let id = PLAN[0].id;
  while (id && out.length < PLAN.length * 2) {
    seen[id] = (seen[id] || 0) + 1;
    out.push(id);
    id = after(id, loaded, seen[id]);
  }
  return out;
}

/** Every way the plan disagrees with the step table, as sentences; empty when it walks this tour.
 *  `held` is tour.js's own nextHeld and `actMs` its TOUR_ACT_MS, both sliced by the caller. */
function planProblems(steps, held, actMs) {
  const out = [];
  const ids = steps.map(s => s.id), mine = PLAN.map(r => r.id);
  if (ids.join(",") !== mine.join(",")) out.push("order: the table has " + ids.join(",") + " and the walk " + mine.join(","));
  steps.forEach(s => {
    const first = rowOf(s.id, 1);
    if (!first) { out.push(s.id + ": no row in the walk"); return; }
    [first].concat(first.again ? [rowOf(s.id, 2)] : []).forEach((r, v) => {
      const at = s.id + (v ? " (again)" : "");
      const acts = !!(r.click || r.type && !r.next);
      if (r.next && held(s)) out.push(at + ": the walk presses Next where the table holds it back");
      if (acts && !s.opens && !s.done) out.push(at + ": the walk does an act the step does not wait for");
      if (!r.next && !acts && !r.inside && !r.reload) out.push(at + ": the walk neither presses Next nor does an act");
      if (!!r.inside !== !!s.inside) out.push(at + ": inside a window in " + (s.inside ? "the table" : "the walk") + " only");
      if ((r.into || null) !== (s.opens || null)) out.push(at + ": opens " + (s.opens || "nothing") + " in the table and " + (r.into || "nothing") + " in the walk");
      if (!!r.reload !== !!s.waits) out.push(at + ": done by a load in " + (s.waits ? "the table" : "the walk") + " only");
      if (s.inside && !r.close && !r.next && !r.back) out.push(at + ": no way out of its window in the walk");
      if (r.back && !s.inside) out.push(at + ": goes back from a step that stands in no window");
      if (s.name && !(r.type && r.type.sel === "#tourName")) out.push(at + ": holds the name field and the walk does not type into it");
    });
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
    next: shown(q("tourNext")), held: !!q("tourNext") && q("tourNext").disabled, back: shown(q("tourPrev")),
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
function AIM(sel, ringed) {
  const h = document.getElementById("tourHole");
  const hr = h && getComputedStyle(h).display !== "none" ? h.getBoundingClientRect() : null;
  const inRing = (x, y) => !!hr && hr.width > 0 && x >= hr.left - 2 && x <= hr.right + 2 && y >= hr.top - 2 && y <= hr.bottom + 2;
  const els = [...document.querySelectorAll(sel)];
  for (const el of els) {
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
async function press(pg, sel, ringed) {
  if (ringed) await pg.evaluate(RING_STILL);
  const a = await pg.evaluate(AIM, sel, !!ringed);
  if (a.x < 0) return { sel, ok: false, found: a.found };
  await pg.mouse.click(a.x, a.y);
  return { sel, ok: true, found: a.found };
}

/** Does one step as a person does it and reads where the tour went. The record is what the smoke
 *  asserts on: `look` as the step first stood, `aims` for each click (inside its ring or not),
 *  `want` where the tour should go and `to` where it went, `asked` a question bubble left
 *  standing after the act. `loaded` passes over the load step; `visit` counts the walk's visits
 *  to this step, 1 the first. */
async function walkStep(pg, id, opts) {
  const o = opts || {}, visit = o.visit || 1, r = rowOf(id, visit);
  if (!r) throw new Error("tour-walk: no row for step " + id);
  if (r.reload) throw new Error("tour-walk: the load step reloads the page, and its caller does it");
  const rec = { id, visit, want: after(id, o.loaded !== false, visit), to: undefined, aims: [], look: null, asked: false, ms: 0 };
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
    rec.aims.push(await press(pg, sel, true));
    await pause(350); // a menu opened by the first click is ringed on its next frames
  }
  if (r.back) rec.aims.push(await press(pg, "#tourPrev", false));
  if (r.close) rec.aims.push(await press(pg, r.close, false));
  const wait = ACT_MS + LATE_MS;
  if (rec.want === null) {
    await pg.waitForFunction(() => !sessionStorage.getItem("eTourAt") && document.getElementById("tourRoot").hidden,
      { timeout: wait, polling: 100 }).catch(() => {});
  } else {
    await pg.waitForFunction(w => sessionStorage.getItem("eTourAt") === w, { timeout: wait, polling: 100 }, rec.want).catch(() => {});
  }
  rec.to = await at(pg);
  rec.asked = await pg.evaluate(() => !!document.querySelector("body > .bub-ask:not(.e-gone)"));
  rec.ms = Date.now() - t0;
  return rec;
}

/** Walks from wherever the tour stands until it ends, or until a step does not move it. */
async function walkTour(pg, opts) {
  const recs = [], seen = {};
  for (let i = 0; i < PLAN.length * 2; i++) {
    const id = await at(pg);
    if (!id) break;
    seen[id] = (seen[id] || 0) + 1;
    const rec = await walkStep(pg, id, Object.assign({}, opts, { visit: seen[id] }));
    recs.push(rec);
    if (rec.to !== rec.want) break;
  }
  return recs;
}

module.exports = { PLAN, ACT_MS, rowOf, after, route, planProblems, walkStep, walkTour, at, LOOK, AIM, RING_STILL };
