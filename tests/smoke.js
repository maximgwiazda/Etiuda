/* Smoke run - the acceptance test. test.js guards invariants; this drives the interface, because
 * every bug the 2026-09 audit found was one nothing drove: dots under a fade, pinned rows
 * displaced by a drag, an eraser that left the panel stale. It boots engine/etiuda.html in a run
 * folder outside this tree with the fixtures beside it, collects every page and console error
 * from the first byte, and walks: every menu action, the tour, both interface languages, both
 * themes and glass off, the breakpoints for horizontal overflow and the cut-text rule, the intent
 * panel (pick, pin, wheel, drag, clear), the fields' fades, Quick facts, the search box's exits,
 * the three dialogs' folds and the editor's Save, the tab strip, and the public first run: a
 * folder holding nothing but the engine and the sample, in a fresh context.
 *
 *   ETIUDA_FIXTURES=<folder> node tests/smoke.js            Chrome
 *   ETIUDA_FIXTURES=<folder> node tests/smoke.js firefox    Firefox
 *
 * Exit code is the number of failed checks, so a caller can gate on it - and 78 where the run
 * produced no verdict at all, which is a different fact and reads as one. See tests/README.md.
 * Everything happens in the browser's own temporary profile: nothing here touches the desk's
 * storage. The browser is closed in a finally - an orphaned headless browser wedges the Claude
 * app (see the rulebook). */
"use strict";
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WHICH = (process.argv[2] || "chrome").toLowerCase();
/* THE DECLARED NUMBER OF CHECKS, and why a tally is not a verdict without one. A section that
   throws takes the rest of its checks with it, the catch writes one FAIL, and the line at the
   foot reads "159/160 checks passed" - a number that looks like a result and is really a
   different suite. That happened on 2026-09-14 and the tell was the total, 160 where 163 was
   normal, which nothing in this file was watching. It is watched now: the run says so when the
   count is not the declared one, in either direction, and exits without a verdict. The remedy
   for a legitimate change is this one line, written deliberately.
   Chrome only. Firefox has never been counted here and a number nobody measured is worse than
   no number, so that run says out loud that it has none. */
const EXPECTED = { chrome: 211 };
/* Hook coverage, board 341, opt-in and inert without the variable. The one-way valve's slots are
   CALLED and never imported, so no graph of import statements can say one was ever exercised.
   wireHooks freezes the object as its last act, so a driver that stands in front of
   Object.freeze is the one place every slot can be wrapped with a counter without a line of
   src/ changing. Read by tools/split-guard/hooks-coverage.mjs, which owns the verdict. */
const HOOKCOV = process.env.ETIUDA_HOOK_COVERAGE || "";
const hookCov = { wrapped: [], hits: {} };
const hookInject = () => {
  const real = Object.freeze;
  /* Carried across a reload in window.name, which is the one thing on a page that survives a
     same-tab navigation, is synchronous to write, and no line of this engine reads: measured
     2026-09-14, loading a catalog ends in location.reload(), the empty-catalog screen calls
     sampleReady eight times before it, and both a fresh-document counter and a pagehide flush
     through an exposed function reported zero - the flush never arrived, because the binding
     call is delivered asynchronously and the document was already gone. */
  const CARRY = "__etiudaHookHits=";
  let seed = Object.create(null);
  try {
    const at = window.name.indexOf(CARRY);
    if (at >= 0) seed = JSON.parse(window.name.slice(at + CARRY.length)) || Object.create(null);
  } catch (x) {}
  window.__hookHits = Object.assign(Object.create(null), seed);
  window.__hookWrapped = [];
  addEventListener("beforeunload", () => { try { window.name = CARRY + JSON.stringify(window.__hookHits); } catch (x) {} });
  Object.freeze = function (o) {
    if (o && typeof o === "object" && Object.getPrototypeOf(o) === null && !window.__hookWrapped.length) {
      const keys = Object.keys(o);
      if (keys.length >= 10 && keys.every(k => typeof o[k] === "function")) {
        for (const k of keys) {
          const f = o[k];
          o[k] = function () { window.__hookHits[k] = (window.__hookHits[k] || 0) + 1; return f.apply(this, arguments); };
        }
        window.__hookWrapped = keys;
      }
    }
    return real(o);
  };
};
const hookInstall = async pg => { if (HOOKCOV) await pg.evaluateOnNewDocument(hookInject); };
const hookMerge = got => {
  if (!got) return;
  for (const k of got.wrapped) if (hookCov.wrapped.indexOf(k) < 0) hookCov.wrapped.push(k);
  for (const k of Object.keys(got.hits)) hookCov.hits[k] = (hookCov.hits[k] || 0) + got.hits[k];
};
/* Drained from every page BEFORE it is closed: the public first run happens in its own browser
   context, closed inside its own finally, and a context closed is a document nobody read. */
const hookDrain = async (target, label) => {
  if (!HOOKCOV || !target) return;
  let pages = 0, names = 0, why = "";
  try {
    for (const pg of await target.pages()) {
      pages++;
      const got = await pg.evaluate(() => ({ wrapped: window.__hookWrapped || [], hits: Object.assign({}, window.__hookHits) })).catch(x => { why = String(x && x.message || x).slice(0, 60); return null; });
      if (got) { names += Object.keys(got.hits).length; hookMerge(got); }
    }
  } catch (x) { why = String(x && x.message || x).slice(0, 60); }
  /* A drain that silently drains nothing is the vacuous ok this whole leg exists to refuse, so
     it says what it got every time. */
  console.log("  hook coverage drained " + label + ": " + pages + " page(s), " + names + " slot name(s)" + (why ? " - " + why : ""));
};

/* Resolved before the browser starts, so a missing fixture costs nothing and is refused where
   the reason is still obvious. The run folder is the engine's only workable shape: it loads its
   catalog as a sibling, and no catalog may sit beside engine/etiuda.html in a public tree. */
const RUN = E.runFolder("catalogV2", "sampleV2");
const ENGINE = RUN.url;
const EXE = { chrome: () => E.browserPath("chrome"), firefox: () => E.browserPath("firefox") };

/* ---- ONE BOOT AND DISMISS, ON CONDITIONS, board item 630 -------------------------------------
 *
 * The dance that gets a fresh page from `goto` to a drawn catalog - take the offer to load the
 * sibling, skip the tour, press Escape, wait for cards - was written twice in this file: once
 * for the main page with four sleeps in it, and once inside the 571 helper, which 573 moved onto
 * conditions. Two copies of a dance drift, and the copy with the sleeps is the one that flakes
 * on a slow desk: 2.4 s after load, 1.9 s per offer, 0.5 s per skip, 0.8 s after Escape are a
 * guess at how fast this machine is.
 *
 * `waitForFunction` polls INSIDE the page, so each wait ends at the first moment its condition
 * holds. A timeout is recorded rather than thrown - the caller decides whether a thing that did
 * not arrive is a failure, and one of them, the catalog offer on a page that may never raise it,
 * is not - and every name that timed out travels back to the caller, so a slow desk reddens with
 * a sentence rather than reading a half-drawn page.
 *
 * WHAT THIS HELPER DOES NOT REACH is the rest of the file: the interactions after boot wait by
 * the clock in 150-odd places, because each of them is waiting for a different thing and the
 * condition has to be named one at a time. That is counted in the report rather than claimed.
 */
const until = async (pg, fn, what, late, ms) => {
  try { await pg.waitForFunction(fn, { timeout: ms || 20000, polling: 100 }); return true; }
  catch (e) { late.push(what); return false; }
};

/* ---- WAITING FOR A WIDTH, ON A CONDITION, board item 630 -------------------------------------
 *
 * THE FIRST BATCH OF THE SLEEPS, and the batches are carved in the report rather than guessed at
 * here: of 159 sleep calls in this file (sites, counted by `sleep(<digits>)` over the source and
 * excluding the helper's own definition; `grep -cE 'sleep\('` says 155 because it counts LINES
 * and four lines hold two), 9 sites follow a setViewport. They are the batch this helper closes,
 * and they are worth more than 9 suggests: two of them are inside loops, over eleven breakpoints
 * and over a sweep from 620px down in steps of two, so the run makes far more than nine of them.
 *
 * WHAT THE SLEEP WAS FOR. A viewport change raises one resize event, and src/main.js answers it
 * with one listener whose members are either cheap flags or requestAnimationFrame-debounced
 * geometry: the pill bar's two-line measure, the rail's top and dock threshold, the facts panel,
 * the tab labels, the cut-text scan. None of them is on a timer, so the settling is over in a
 * frame or two of the resize event - and 900 ms is not a measurement of that, it is a guess at
 * how fast this desk is, which is the definition of a flake on a slower one.
 *
 * THE CONDITION IS IN THREE PARTS, in order, and each is necessary:
 *   - the resize event was SEEN. The listener that counts it is installed by this file AFTER the
 *     engine's own, so same-phase order puts it second and a tick of the counter means the
 *     engine's listener has already run and scheduled its frames. Without this part, the two
 *     parts below are true of the page as it was BEFORE the resize, which is the whole family of
 *     conditions that are worse than the sleep they replaced.
 *   - the width the PAGE reports has moved, or is exactly the one asked for, since the driver's
 *     own promise resolves on the protocol's answer and not on the page's layout.
 *   - the GEOMETRY holds still: the rectangle of every element with an id, unchanged for six
 *     consecutive animation frames. SIX IS A MEASUREMENT AND NOT A HABIT, and the first attempt
 *     at this helper had it at two, which was wrong: sampling this engine's own frames after a
 *     resize, 1500px to 900px with the 258-card sample, the geometry differs at frames 13 to 19,
 *     then 21, 24, 27, 28, 32 to 35, 40, 41, 44, 45, 47 and 48, the last of them 316 ms in. The
 *     gaps INSIDE that are up to four quiet frames wide, so a loop that stopped at two quiet
 *     frames stopped at frame 30 and read a page with a third of its settling still to come.
 *     Six is four with margin, and 430px and 1500px settle by frames 17 and 18 respectively and
 *     are unaffected. THE SUITE CANNOT SEE THIS: with the wait removed altogether not one leg
 *     but this helper's own goes red, so the number is set by the measurement and there is no
 *     leg holding it. Re-measure it when the resize listener gains a member.
 *
 * THE CEILING IS THE SLEEP IT REPLACED, so no site here can be slower than it was, and a site
 * that does not settle inside its old budget is recorded BY NAME and asserted at the end of the
 * run. That check is what makes this a replacement rather than a hope: a condition that is wrong
 * in the never-settles direction reddens it, and a condition that is wrong in the ends-too-early
 * direction reddens the legs downstream, which is where the sleeps were load-bearing.
 */
/* Six consecutive unchanged frames, measured rather than picked; the note above says how. */
const QUIET_FRAMES = 6;
const VIEWPORT_WAITS = { n: 0, settled: 0, ms: 0, slept: 0, worst: 0, worstAt: "", out: [] };

/** setViewport, then wait for the page to have finished answering it. `cap` is the sleep this
 *  call stands in for, in milliseconds, and is the ceiling on the wait. */
async function sized(pg, width, height, label, cap) {
  const budget = cap || 900;
  const before = await pg.evaluate(() => {
    if (typeof window.__smokeResizeSeen !== "number") {
      window.__smokeResizeSeen = 0;
      addEventListener("resize", () => { window.__smokeResizeSeen++; }, { passive: true });
    }
    return { seen: window.__smokeResizeSeen, width: innerWidth };
  });
  const t0 = Date.now();
  await pg.setViewport({ width, height });
  /* A viewport set to the width it already has raises no resize event at all, so the counter is
     only required to move where the width did. */
  const r = await pg.evaluate(async (want, seenWas, widthWas, widthMoves, ms, quiet) => {
    const deadline = Date.now() + ms;
    const frame = () => new Promise(res => requestAnimationFrame(res));
    /* THE COUNTER IS THE SIGNAL and the width is the confirmation, not the other way round: a
       page with a classic scrollbar reports an innerWidth that is not the width the driver set,
       and a condition written on the equality alone would wait out its whole ceiling there and
       report a page that had in fact settled. So the width is asked to have MOVED, or to be
       exactly the one asked for, and the event is what says the engine has been told. */
    let sawResize = false;
    while (Date.now() <= deadline) {
      if ((!widthMoves || window.__smokeResizeSeen > seenWas)
          && (innerWidth === want || innerWidth !== widthWas || !widthMoves)) {
        sawResize = true;
        break;
      }
      await frame();
    }
    const shot = () => {
      const de = document.documentElement;
      let s = de.clientWidth + "x" + de.clientHeight + "/" + de.scrollWidth + "x" + de.scrollHeight;
      for (const el of document.querySelectorAll("[id]")) {
        const b = el.getBoundingClientRect();
        if (b.width || b.height) {
          s += "|" + el.id + " " + (b.x | 0) + "," + (b.y | 0) + "," + (b.width | 0) + "," + (b.height | 0);
        }
      }
      return s;
    };
    let last = null, same = 0, still = false, frames = 0;
    while (Date.now() <= deadline) {
      await frame();
      frames++;
      const now = shot();
      if (now === last) { if (++same >= quiet - 1) { still = true; break; } } else same = 0;
      last = now;
    }
    return { sawResize, still, frames };
  }, width, before.seen, before.width, before.width !== width, budget, QUIET_FRAMES);
  const ms = Date.now() - t0;
  VIEWPORT_WAITS.n++;
  VIEWPORT_WAITS.ms += ms;
  VIEWPORT_WAITS.slept += budget;
  if (r.sawResize && r.still) VIEWPORT_WAITS.settled++;
  else VIEWPORT_WAITS.out.push(label + " at " + width + "px"
    + (r.sawResize ? "" : ", the resize was never seen") + (r.still ? "" : ", the geometry never held still"));
  if (ms > VIEWPORT_WAITS.worst) { VIEWPORT_WAITS.worst = ms; VIEWPORT_WAITS.worstAt = label + " at " + width + "px"; }
  return ms;
}

const BOOT_OFFER = /^(load|yes|tak)([^a-z]|$)|load it|load the catalog|sample catalog|update/;
const BOOT_SKIP = /skip|not now|close|pomi/;

/** goto, through the offers and the tour, to a page with cards on it. Returns the names of the
 *  conditions that timed out, empty on a clean boot. */
async function bootAndDismiss(pg, url, label) {
  const late = [];
  await pg.goto(url, { waitUntil: "load", timeout: 90000 });
  /* The page is up when it has drawn something: either the cards, or the offer to load the
     sibling catalog. Whichever comes first ends the wait. */
  await until(pg, () => document.querySelectorAll(".card").length > 0
    || [...document.querySelectorAll("button")].some(x => x.offsetWidth > 0
         && /^(load|yes|tak)([^a-z]|$)|load it|load the catalog|sample catalog|update/i.test(x.textContent)),
    label + ": cards or the catalog offer", late, 30000);
  /* Returns the text of the button it pressed, so the wait after it can name that button and
     not its family. */
  const clickVisible = rx => pg.evaluate(r => {
    const el = [...document.querySelectorAll("button")].filter(x => x.offsetWidth > 0)
      .find(x => new RegExp(r, "i").test(x.textContent));
    if (!el) return null;
    const was = el.textContent.replace(/\s+/g, " ").trim();
    el.click();
    return was;
  }, rx.source);
  /* THE WAIT IS ON THE BUTTON THAT WAS PRESSED, not on every button that matches, and that
     distinction was measured rather than reasoned on 2026-09-20. The main page raises TWO offers
     at once - `#emptySample` "load a sample catalog" and `#ecYes` "Load catalog" - so a wait for
     the family to empty never ends after the first press, the loop broke, `#ecYes` was never
     pressed, and the run went on with the 29-card sample where the catalog has 258. Three legs
     downstream went red and the boot's own sentence said WAITED OUT: the catalog offer to close.
     The 571 lab raises one offer, which is why the copy this helper came from was right there and
     wrong here. Text rather than the element: `#ecYes` stays and changes its own words. */
  const goneText = (rx, was) => pg.waitForFunction((r, t) => ![...document.querySelectorAll("button")]
    .filter(x => x.offsetWidth > 0)
    .some(x => new RegExp(r, "i").test(x.textContent)
               && x.textContent.replace(/\s+/g, " ").trim() === t),
    { timeout: 20000, polling: 100 }, rx.source, was);
  /* Each press is followed by the disappearance of the words it pressed, which is the event the
     old 1.9 s was standing in for. The loop bound stays: an offer that reappears for ever is a
     fault and not something to wait on. */
  for (const step of [{ rx: BOOT_OFFER, n: 4, what: "the catalog offer to close" },
                      { rx: BOOT_SKIP, n: 3, what: "the tour to close" }]) {
    for (let i = 0; i < step.n; i++) {
      const was = await clickVisible(step.rx);
      if (was === null) break;
      let gone = true;
      await goneText(step.rx, was).catch(() => { gone = false; });
      if (!gone) { late.push(label + ": " + step.what + " (" + JSON.stringify(was) + ")"); break; }
    }
  }
  await pg.keyboard.press("Escape");
  /* The cards are the condition Escape was being given 0.8 s to produce. */
  await until(pg, () => document.querySelectorAll(".card").length > 0,
    label + ": the cards", late, 30000);
  return late;
}

let b; let fails = 0; let checks = 0; let reachedEnd = false;
const errs = [];
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const t0 = Date.now();

(async () => {
  b = await puppeteer.launch(WHICH === "firefox"
    ? { browser: "firefox", executablePath: EXE.firefox(), headless: true, protocolTimeout: 300000 }
    : { executablePath: EXE.chrome(), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 300000 });
  const p = await b.newPage();
  await p.setViewport({ width: 1500, height: 950 });
  p.on("dialog", d => d.accept());
  p.on("pageerror", e => errs.push("pageerror: " + String(e.message || e)));
  p.on("console", m => { if (m.type() === "error" && !/ERR_FILE_NOT_FOUND/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });
  await hookInstall(p);
  const since = () => { const n = errs.length; return () => errs.slice(n); };
  const clean = (e, what) => check(e().length === 0, what + " without errors" + (e().length ? " - " + e().join(" | ") : ""));

  /* Boot and adoption. */
  let e = since();
  const bootLate = await bootAndDismiss(p, ENGINE, "the main page");
  console.log(WHICH.toUpperCase() + "  " + ENGINE);
  console.log("  engine/etiuda.html sha256 " + RUN.engineSha + (RUN.engineSha === RUN.copySha ? "" : "  COPY DIFFERS: " + RUN.copySha));
  const boot = await p.evaluate(() => ({ v: typeof E_VERSION === "string" ? E_VERSION : null, cards: document.querySelectorAll(".card").length,
    rows: document.querySelectorAll("#intentRailList .rail-item").length, pills: document.querySelectorAll("#pills .pill").length }));
  /* A name that timed out is carried into the sentence rather than into a check of its own: a
     boot that did not finish reddens here already, and this says which wait it was. */
  check(!!boot.v, "engine " + boot.v + " booted"
    + (bootLate.length ? " - WAITED OUT: " + bootLate.join("; ")
                       : ", waited onto the screen by conditions and none timed out"));
  check(boot.cards > 0 && boot.rows > 0 && boot.pills > 0, "catalog on screen: " + boot.cards + " cards, " + boot.rows + " intents, " + boot.pills + " pills");
  clean(e, "boot and adoption");

  /* WHAT BOOT DOES ONCE THE SCREEN EXISTS, which nothing else in either repository asked.
     src/modules/on-open.js has two exported functions and both are wiring, so no unit gate can
     reach it: on 2026-09-21 it was switched off completely and npm test, split-guard and this
     file all stayed green. Its one visible act is the cursor - the first copyable block carries
     the mark on open, so the arrow keys work before anything is clicked. Read as the element
     rather than as a count: "one block is marked" is true of the wrong block too. */
  const onOpen = await p.evaluate(() => {
    const marked = Array.prototype.slice.call(document.querySelectorAll("#list .txt.sel"));
    const first = document.querySelector("#list .card[data-id] .txt[data-v]");
    return { n: marked.length, onFirst: marked.length === 1 && marked[0] === first,
      where: marked.length === 1 ? String(marked[0].dataset.v) : "" };
  });
  check(onOpen.onFirst, "on open the mark sits on the first copyable block, so the arrows work at once"
    + " (" + onOpen.n + " marked" + (onOpen.where ? ", block " + onOpen.where : "") + ")");

  /* THE TOOLS ROW STANDS AT ONE HEIGHT, board 452, and the switcher is the one that sets it:
     read as four boxes rather than as a rule, because the rule is padding and what was wrong
     was the height it produced. Tops to half a pixel - three of the four are centred inside a
     wrapper of their own. */
  const toolsH = await p.evaluate(() => {
    const out = {};
    ["seg", "factsBtn", "theme", "settingsBtn"].forEach(id => {
      const r = document.getElementById(id).getBoundingClientRect();
      out[id] = [+r.height.toFixed(2), +r.top.toFixed(2)];
    });
    return out;
  });
  const hs = Object.keys(toolsH).map(k => toolsH[k][0]), tops = Object.keys(toolsH).map(k => toolsH[k][1]);
  check(hs.every(h => h === hs[0]) && Math.max.apply(null, tops) - Math.min.apply(null, tops) <= 0.5,
    "the band's tools stand at the language switcher's height: " + JSON.stringify(toolsH));

  /* KEYBOARD FOCUS WEARS THE HOVER LOOK, board 452, and no ring - the browser's own included.
     Three reads of one button: at rest with the pointer away, under the pointer, and focused
     from the keyboard. The keyboard part is a key press before the focus() call, because
     Chromium decides :focus-visible from the last input it saw, and the element is asked
     whether it matches rather than trusted to. */
  const focusLook = async () => {
    const read = () => { const el = document.getElementById("theme"), c = getComputedStyle(el);
      return { bg: c.backgroundColor, ink: c.color, out: c.outlineStyle + " " + c.outlineWidth,
               fv: el.matches(":focus-visible") }; };
    const box = await p.evaluate(() => { const r = document.getElementById("theme").getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.mouse.move(4, 940);
    await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await sleep(260);
    const rest = await p.evaluate(read);
    await p.mouse.move(box.x, box.y); await sleep(320);
    const hover = await p.evaluate(read);
    await p.mouse.move(4, 940); await sleep(260);
    await p.keyboard.down("Shift"); await p.keyboard.up("Shift");
    await p.evaluate(() => document.getElementById("theme").focus());
    await sleep(320);
    const focus = await p.evaluate(read);
    await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    return { rest, hover, focus };
  };
  const look = await focusLook();
  check(look.focus.fv && look.focus.bg === look.hover.bg && look.focus.ink === look.hover.ink
        && look.hover.bg !== look.rest.bg && /^(none|hidden)/.test(look.focus.out),
    "a button focused from the keyboard wears its hover look and no ring: " + JSON.stringify(look));

  /* Every menu action once; the toggles a second time to put things back; the tour separately. */
  e = since();
  const acts = await p.evaluate(() => [...document.querySelectorAll("#settingsMenu [data-act]")].map(x => x.getAttribute("data-act")));
  const toggles = new Set(["rail", "pills"]);
  let opened = 0;
  for (const act of acts.filter(a => a !== "tour")) {
    await p.evaluate(a => { const x = document.querySelector('[data-act="' + a + '"]'); if (x) x.click(); }, act); await sleep(600);
    const modal = await p.evaluate(() => { const m = document.getElementById("modalCard"); return !!(m && m.offsetParent); });
    if (modal) opened++;
    await p.keyboard.press("Escape"); await sleep(350);
    if (toggles.has(act)) { await p.evaluate(a => { const x = document.querySelector('[data-act="' + a + '"]'); if (x) x.click(); }, act); await sleep(500); await p.keyboard.press("Escape"); await sleep(200); }
  }
  check(acts.length >= 6 && opened >= 2, acts.length + " menu actions exercised, " + opened + " opened a dialog");
  clean(e, "menu actions");

  /* The maintenance panel, which nothing above opens. It is not a menu item - the loop over
     [data-act] walks straight past it - and until 2026-09-13 no check in this file touched it:
     `grep -iE "mt-|maintenance"` over any smoke log returned nothing. F2 is the only way in
     that a person has, so F2 is the way in here.

     It earns its own checks for one reason. Every reading in the panel is wrapped in mtSafe,
     which turns any throw into the literal string "unavailable" and prints it in the cell.
     A reading that stops working therefore leaves a panel that is still readable, an app that
     still runs, and a suite that is still green - the same shape as the missing accessor of
     board item 258, and the reason that one went unseen twice.

     And this panel is the widest single reader of the module bridge in the app: mtReadings
     reaches five modules and about a dozen names the monolith still declares, in one pass and
     with no branch, so a name that stops crossing surfaces here before it surfaces anywhere a
     person would look.

     COUNTS AND VERDICTS ONLY. The readings name the catalog, its edition and its languages, and
     none of that text is read, printed or compared. The unavailable count is taken by asking
     the engine what its own word for it renders as in the current language and counting cells
     equal to that, so no wording is written down here either. */
  e = since();
  await p.keyboard.press("F2"); await sleep(800);
  const mt = await p.evaluate(() => {
    const m = document.getElementById("modalCard");
    const grid = m && m.offsetParent && m.querySelector(".mt-grid");
    if (!grid) return { open: false, secs: 0, rows: 0, unavailable: -1, blank: -1, controls: 0 };
    const word = (typeof tc === "function") ? tc("maintenance", "unavailable") : "unavailable";
    const vals = [...grid.querySelectorAll(".mt-row .v")].map(x => (x.textContent || "").trim());
    return { open: true,
      secs: grid.querySelectorAll(".mt-sec").length,
      rows: vals.length,
      unavailable: vals.filter(v => v === word).length,
      blank: vals.filter(v => v === "-").length,
      controls: ["mtShortcuts", "mtClear", "mtEject", "mtCopy", "mtClose"]
        .filter(id => !!document.getElementById(id)).length };
  });
  /* Floors rather than the measured 7 and 38: a reading added on purpose must not fail a run,
     and a section or a whole block of readings going missing must. */
  check(mt.open && mt.secs >= 6 && mt.rows >= 30,
    "maintenance panel opens on F2: " + mt.secs + " sections, " + mt.rows + " readings");
  /* The one that is the point. Zero, not a floor: mtSafe has exactly one way to print this. */
  check(mt.open && mt.unavailable === 0,
    "every maintenance reading answered: " + mt.unavailable + " unavailable, " + mt.blank + " blank");
  check(mt.controls === 5, "the panel's rescues and copy are wired: " + mt.controls + " of 5 controls");
  await p.keyboard.press("Escape"); await sleep(500);
  clean(e, "the maintenance panel");

  /* The tour, end to end on Enter, watched through the overlay a person sees rather than
     through the module's own bookkeeping.

     Until 2026-09-13 these lines read TOUR_STEPS and tourRunning off the page, two names
     tour.js exported for this check and for nothing else, and the check was
     `startTour existed && tourRunning went true && tourRunning went false`. That is the tour's
     own opinion that the tour ended. Measured against an engine whose endTour clears the flag
     and skips hiding the root - one `if(els.root)` turned to `if(false)`, everything else
     untouched: the old lines printed `ok tour of 20 steps walked on Enter (20 presses) and
     ended` with the coach-mark overlay still covering the whole viewport, 1500x950,
     display block, aria-hidden="false", and not one page or console error in the run.

     So: the overlay's own geometry, and the step counter it draws. #tourRoot is position:fixed,
     so offsetParent is null whether it is up or down, measured - display and width are what
     say. The counter is read as two numbers, `(\d+)\D+(\d+)`, never as words: its text goes
     through t("Tour {N} / {TOTAL}") and comparing the wording would be a translation contract
     this check has no business holding. The counter alone cannot say the tour ended either -
     it still reads 20 / 20 afterwards - which is why the last assertion is the overlay. */
  e = since();
  const tourShot = () => p.evaluate(() => {
    const r = document.getElementById("tourRoot");
    const lab = document.getElementById("tourStepLabel");
    const m = /(\d+)\D+(\d+)/.exec((lab && lab.textContent) || "");
    const w = r ? Math.round(r.getBoundingClientRect().width) : 0;
    return { up: !!(r && getComputedStyle(r).display !== "none" && w > 0), w,
             n: m ? +m[1] : 0, total: m ? +m[2] : 0 };
  });
  /* BOARD 344. Opened from the menu item, not by calling the global startTour(). The item at
     header-menus.js:29 is the only thing in src/ that reaches hooks.startTour, so the global
     call left that route dead while all three checks below passed - measured 2026-09-14,
     hooks-coverage read 38 of 54 slots with startTour and endTour among the 16 that were not.
     The menu loop above skips this act on purpose; here is where it is pressed. */
  const started = await p.evaluate(() => {
    const btn = document.getElementById("settingsBtn");
    if (btn) btn.click();
    const item = document.querySelector('#settingsMenu [data-act="tour"]');
    if (!item) return false;
    item.click();
    return true;
  });
  await sleep(700);
  const first = await tourShot();
  /* Bounded by the tour's own length and three spare, so a tour that will not close costs
     three presses rather than forty. */
  const cap = first.total > 0 ? first.total + 3 : 40;
  let pressed = 0, advanced = 0, seen = first.n;
  for (let i = 0; i < cap; i++) {
    if (!(await tourShot()).up) break;
    await p.keyboard.press("Enter"); pressed++; await sleep(260);
    const now = await tourShot();
    if (now.up && now.n === seen + 1) advanced++;
    if (now.n > seen) seen = now.n;
  }
  const tourAfter = await tourShot();
  check(started && first.up && first.n === 1 && first.total >= 10,
    "the tour opens its overlay on step " + first.n + " of " + first.total + " (" + first.w + "px wide)");
  check(advanced === first.total - 1 && pressed === first.total,
    "and Enter walks it one step at a time to the end (" + advanced + " advances over " + pressed + " presses)");
  check(!tourAfter.up, "and the overlay leaves the screen when it ends, rather than only being flagged done ("
    + tourAfter.w + "px wide)");
  /* BOARD 344, the second door out. Walking to the end ends the tour from inside tour.js;
     Escape ends it through header-menus.js:65, which is the only caller of hooks.endTour in
     src/. Without this the way out a person actually uses was never driven. */
  await p.evaluate(() => {
    const btn = document.getElementById("settingsBtn"); if (btn) btn.click();
    const item = document.querySelector('#settingsMenu [data-act="tour"]'); if (item) item.click();
  });
  await sleep(700);
  const tourAgain = await tourShot();
  await p.keyboard.press("Escape"); await sleep(500);
  const tourEsc = await tourShot();
  check(tourAgain.up && !tourEsc.up, "and Escape takes it down again from the menu's own route (step "
    + tourAgain.n + " of " + tourAgain.total + " up, " + tourEsc.w + "px after)");
  await p.keyboard.press("Escape"); await sleep(300);
  clean(e, "the tour");

  /* Interface language both ways, with the dialogs opened in Polish.

     The four chrome-side facts here - the flag, a translated chrome string, two dialogs that
     open clean, and English back - are necessary and not sufficient, and what they leave out
     is board item 146. applyUiLang redraws the catalog-derived surfaces through a loop of
     window[fn] lookups, and a top-level function in a module is not a property of window, so
     the module split kills that loop without an error. Measured on 2026-09-12 against a
     scratch engine with the loop dead: all four passed, this suite returned 106/106 and
     reported no page or console error, and not one pill, rail row, tab or card left English.

     So the ink is measured too. Six surfaces, one for each function in that loop, attributed
     by dropping each name from the loop in turn and seeing exactly one surface stop moving:
     CATS is applyCatsToGlobal's, the rail rows drawIntentRail's, the pills drawPills', the tab
     labels drawTabs', the role drum syncRoleDrum's and the card text render's. Each has to
     differ in Polish and come back in English. It holds with the sample catalog as well as
     with a deployment one, so a fresh clone passes it. Lengths and verdicts are printed and
     the text never is: the text is the catalog's. */
  e = since();
  const surfaces = () => p.evaluate(() => {
    const txt = sel => [...document.querySelectorAll(sel)].map(x => (x.textContent || "").trim()).join("\u0001");
    return { CATS: (typeof CATS !== "undefined" && CATS) ? JSON.stringify(CATS) : "",
      rail: txt("#intentRailList .rail-item"), pills: txt("#pills .pill"),
      tabs: txt("#tabsBar .tab-label"), roleDrum: txt("#roleDrum"), cards: txt(".card") };
  });
  const REPAINT = { CATS: "applyCatsToGlobal", rail: "drawIntentRail", pills: "drawPills",
    tabs: "drawTabs", roleDrum: "syncRoleDrum", cards: "render" };
  const en0 = await surfaces();
  const pl = await p.evaluate(async () => { setUiLang("pl"); await new Promise(r => setTimeout(r, 400));
    const l = uiLang(); const en = t("Settings"); return { l, translated: en !== "Settings" }; });
  await sleep(400);
  const plSurf = await surfaces();
  check(pl.l === "pl" && pl.translated, "interface switched to Polish and a chrome string followed");
  for (const k of Object.keys(REPAINT)) {
    check(en0[k].length > 0 && plSurf[k] !== en0[k], "and the " + k + " surface repainted, so "
      + REPAINT[k] + " ran (" + en0[k].length + " chars to " + plSurf[k].length + ")");
  }
  for (const act of ["settings", "manage"]) { await p.evaluate(a => document.querySelector('[data-act="' + a + '"]').click(), act); await sleep(700); await p.keyboard.press("Escape"); await sleep(300); }
  await p.evaluate(async () => { setUiLang("en"); await new Promise(r => setTimeout(r, 400)); });
  await sleep(400);
  const en1 = await surfaces();
  check(await p.evaluate(() => uiLang() === "en"), "and back to English");
  for (const k of Object.keys(REPAINT)) {
    check(en1[k] === en0[k], "and the " + k + " surface came back unchanged (" + en1[k].length + " chars)");
  }
  clean(e, "language switch");

  /* The theme through its own control. The block below sets data-theme by hand, which proves the
     stylesheet and says nothing about the switch: measured 2026-09-13 against an engine whose
     $("#theme").onclick returns at its first line, all three of its checks still passed. The
     button on the second row is the only route to it now, so this presses that,
     and what is read back is on screen or on disk - the attribute the stylesheet keys off, the
     key a reload reads, and the ground's own colour. The flip is what bites; the return is a
     second fact and passes on its own against a switch that does nothing, so it is never quoted
     alone. The stored key is put back as it was found, so nothing downstream inherits a pin. */
  e = since();
  const themeSnap = () => p.evaluate(() => ({ attr: document.documentElement.dataset.theme || null,
    key: localStorage.getItem("eTheme"), bg: getComputedStyle(document.body).backgroundColor }));
  const th0 = await themeSnap();
  await p.evaluate(() => document.getElementById("theme").click()); await sleep(700);
  const th1 = await themeSnap();
  await p.evaluate(() => document.getElementById("theme").click()); await sleep(700);
  const th2 = await themeSnap();
  await p.evaluate(k => { if (k === null) localStorage.removeItem("eTheme"); else localStorage.setItem("eTheme", k); }, th0.key);
  check(th1.attr !== th0.attr && (th1.attr === "dark" || th1.attr === "light"),
    "the theme control flips the theme (" + th0.attr + " to " + th1.attr + ")");
  check(th1.key === th1.attr, "and pins the choice where a reload reads it (" + th1.key + ")");
  check(th1.bg !== th0.bg, "and the ground repaints (" + th0.bg + " to " + th1.bg + ")");
  check(th2.attr === th0.attr && th2.bg === th0.bg, "and a second press returns both");
  clean(e, "the theme control");

  /* THE PALETTE LANDS IN ONE FRAME, board 452. Sampled per frame through a real press with the
     pointer resting on the tile, which is where the hold-over was loudest: every colour
     transition in the sheet is written for a state change, and a theme flip used to run all of
     them at once, so the tile kept its old colour for .1s over a ground that had already
     turned. The first frame wearing the new theme is the one that has to carry the new colour.
     The icon's own turn is asserted in the same breath, because switching a transition off is
     one line away from switching off the one that is wanted. */
  e = since();
  const tileR = await p.evaluate(() => document.getElementById("theme").getBoundingClientRect().toJSON());
  await p.mouse.move(tileR.x + tileR.width / 2, tileR.y + tileR.height / 2); await sleep(400);
  const flashRun = p.evaluate(() => new Promise(res => {
    const t0 = performance.now(), from = document.documentElement.dataset.theme, f = [];
    const motion = localStorage.getItem("eMotionOff") !== "1"
      && !matchMedia("(prefers-reduced-motion:reduce)").matches;
    const read = () => {
      f.push({ theme: document.documentElement.dataset.theme,
               bg: getComputedStyle(document.getElementById("theme")).backgroundColor,
               turn: getComputedStyle(document.querySelector("#theme svg")).transform });
      if (performance.now() - t0 < 420) requestAnimationFrame(read);
      else res({ motion, n: f.length, first: f.filter(x => x.theme !== from)[0] || null,
                 last: f[f.length - 1] });
    };
    requestAnimationFrame(read);
  }));
  await p.mouse.down(); await p.mouse.up();
  const flash = await flashRun;
  await p.mouse.move(4, 900); await sleep(200);
  check(!!flash.first && flash.first.bg === flash.last.bg
        && (!flash.motion || flash.first.turn !== flash.last.turn),
    "the theme lands in one frame, nothing holding the old palette: the tile reads "
    + (flash.first || {}).bg + " in the first frame of the new theme and " + flash.last.bg
    + " at rest, over " + flash.n + " frame(s), while the icon turns from "
    + (flash.first || {}).turn + " to " + flash.last.turn);
  await p.evaluate(() => document.getElementById("theme").click()); await sleep(500);
  await p.evaluate(k => { if (k === null) localStorage.removeItem("eTheme"); else localStorage.setItem("eTheme", k); }, th0.key);
  clean(e, "the theme flip");

  /* Themes and glass. */
  e = since();
  const themes = await p.evaluate(async () => {
    const bg = () => getComputedStyle(document.body).backgroundColor;
    document.documentElement.dataset.theme = "dark"; await new Promise(r => setTimeout(r, 150)); const d = bg();
    document.documentElement.dataset.theme = "light"; await new Promise(r => setTimeout(r, 150)); const l = bg();
    document.body.classList.add("glass-off"); await new Promise(r => setTimeout(r, 100));
    const off = getComputedStyle(document.body).getPropertyValue("--glass-mid-filter").trim();   // the docked panel is solid, so the token the switch sets on body is what to read
    openSettings(); await new Promise(r => setTimeout(r, 300));
    const scrimOff = getComputedStyle(document.querySelector(".modal-bg")).backdropFilter;
    document.body.classList.remove("glass-off"); await new Promise(r => setTimeout(r, 100));
    const scrimOn = getComputedStyle(document.querySelector(".modal-bg")).backdropFilter;
    dismissModal(); delete document.documentElement.dataset.theme;
    return { d, l, off, scrimOff, scrimOn, mark: getComputedStyle(document.documentElement).getPropertyValue("--mark-filter").trim() };
  });
  check(themes.d !== themes.l, "dark and light paint different grounds");
  check(themes.off === "none", "blur off removes the panel blur (" + themes.off + ")");
  check(themes.scrimOff === "none" && themes.scrimOn !== "none" && themes.mark !== "none", "and the dialog scrim's, which returns with it (" + themes.scrimOn + ")");
  clean(e, "themes");

  /* The About dialog's mark stands on nothing. It used to sit on a blue plate, which is a tile,
     and the plate is what a phone's icon wants rather than a desktop's. Both halves are read:
     that no ground element or fill is left, and that the drawing takes its colour from the theme
     - the thing a page can do and an .ico cannot, which is why the two diverged. */
  e = since();
  const aboutMark = await p.evaluate(async () => {
    const read = async theme => {
      document.documentElement.dataset.theme = theme; await new Promise(r => setTimeout(r, 150));
      openAbout(); await new Promise(r => setTimeout(r, 250));
      const el = document.querySelector(".about-tile"), svg = el.querySelector("svg");
      const out = { bg: getComputedStyle(el).backgroundColor,
        grounds: svg.querySelectorAll("rect,circle,ellipse,polygon").length,
        paths: svg.querySelectorAll("path").length,
        fill: getComputedStyle(svg.querySelector("path")).fill };
      dismissModal(); await new Promise(r => setTimeout(r, 200));
      return out;
    };
    const dark = await read("dark"), light = await read("light");
    delete document.documentElement.dataset.theme;
    return { dark, light };
  });
  const bare = m => (m.bg === "rgba(0, 0, 0, 0)" || m.bg === "transparent") && m.grounds === 0 && m.paths === 1;
  check(bare(aboutMark.dark) && bare(aboutMark.light), "the About mark stands on no plate in either theme (background "
    + aboutMark.dark.bg + ", ground elements " + aboutMark.dark.grounds + ", paths " + aboutMark.dark.paths + ")");
  check(aboutMark.dark.fill === "rgb(255, 255, 255)" && aboutMark.light.fill === "rgb(37, 99, 235)",
    "and takes the theme's own mark colour (dark " + aboutMark.dark.fill + ", light " + aboutMark.light.fill + ")");
  clean(e, "the About mark");

  /* Breakpoints: no horizontal overflow, and the cut-text rule at every width. */
  for (const w of [1600, 1400, 1200, 1000, 900, 800, 700, 600, 500, 430, 390]) {
    e = since();
    await sized(p, w, 950, "the breakpoint sweep", 900);
    const r = await p.evaluate(() => {
      const de = document.documentElement;
      const all = [...document.querySelectorAll(CUT_SEL)].filter(el => { if (!el.getClientRects().length) return false;
        const card = el.closest(".card"), b = (card || el).getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; });
      let dots = 0, bare = 0;
      all.forEach(el => { const cs = getComputedStyle(el); if (cs.textOverflow !== "clip") dots++;
        const c = cutSides(el); if ((c.l || c.r) && cs.maskImage === "none" && cs.webkitMaskImage === "none") bare++; });
      const fw = id => Math.round(document.getElementById(id).getBoundingClientRect().width);
      return { over: de.scrollWidth - de.clientWidth, dots, bare, n: all.length, pax: fw("pax"), search: fw("intent") };
    });
    check(r.over <= 0, w + "px: no horizontal overflow (" + r.over + "px)");
    check(r.dots === 0 && r.bare === 0, w + "px: " + r.n + " lines, none dotted, every cut one fades");
    check(r.search >= r.pax, w + "px: the search box is never the narrowest field (pax " + r.pax + ", search " + r.search + ")");
    clean(e, w + "px");
  }

  /* ---- THE FOOTER AND THE ADD BUTTON, board item 300 ---------------------------------------
     The centred line has no gutter of its own, so at a narrow window it runs under #addCardFab.
     The sheet keeps the clearance on the footer: the line's box, as the client rects of a Range
     over it, must not meet the button. 1500px is the control, where they never met; 390px is
     the narrowest this suite drives, below the shed floor. Polish is the longer line. */
  e = since();
  const footerGap = async (w, lang) => {
    await p.setViewport({ width: w, height: 950 });
    await p.evaluate(l => setUiLang(l), lang);
    await sleep(700);
    return p.evaluate(() => {
      const foot = document.querySelector("footer"), fab = document.getElementById("addCardFab");
      if (!foot || !fab || fab.hidden) return { hit: true, gap: null };
      foot.scrollIntoView({ block: "end" });
      const range = document.createRange();
      range.selectNodeContents(foot);
      let rgt = 0, lft = Infinity, bot = 0, top = Infinity;
      for (const r of range.getClientRects()) {
        if (!r.width && !r.height) continue;
        rgt = Math.max(rgt, r.right); lft = Math.min(lft, r.left);
        bot = Math.max(bot, r.bottom); top = Math.min(top, r.top);
      }
      const b = fab.getBoundingClientRect();
      const hit = rgt > b.left && lft < b.right && bot > b.top && top < b.bottom;
      return { hit, gap: +(b.left - rgt).toFixed(1) };
    });
  };
  const footWide = await footerGap(1500, "en");
  const footNarrow = await footerGap(390, "pl");
  await p.evaluate(() => setUiLang("en"));
  await sized(p, 1500, 950, "the footer and the add button", 700);
  check(!footWide.hit && footWide.gap > 0,
    "1500px: the footer line clears the add button (gap " + footWide.gap + "px)");
  check(!footNarrow.hit && footNarrow.gap >= 0,
    "390px: the footer line stays clear of the add button in Polish (gap " + footNarrow.gap + "px)");
  clean(e, "the footer and the add button");

  /* ---- THE SECOND ROW'S SHED, board item 459 -----------------------------------------------
     The covenant is the two fields' floors, and the floors are the sheet's own flex bases, so
     this leg reads them off the page rather than carrying numbers of its own: what is asserted
     is the RELATION between a field and its floor, which stays true if a token is retuned.
     The sweep is the measurement - the retreat width is wherever the ladder puts it - and the
     two readings either side of it are what the check is about. */
  e = since();
  const rowShed = () => p.evaluate(() => {
    const fills = [...document.querySelectorAll(".fills > .fill")];
    const basis = el => Math.round(parseFloat(getComputedStyle(el).flexBasis) || 0);
    const wide = el => Math.round(el.getBoundingClientRect().width);
    const shown = sel => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display !== "none"; };
    const de = document.documentElement;
    return {
      pax: wide(fills[0]), paxFloor: basis(fills[0]), find: wide(fills[1]), findFloor: basis(fills[1]),
      theme: shown("#theme"), facts: shown("#factsBtn"), seg: shown("#seg"),
      segBoth: [...document.querySelectorAll("#seg button")].every(b => getComputedStyle(b).display !== "none"),
      chevron: !document.querySelector("#moreWrap").hidden,
      rows: ["moreFacts", "moreTheme", "moreLang"].filter(id => !document.getElementById(id).hidden),
      over: de.scrollWidth - de.clientWidth,
    };
  });
  /* WIDE FIRST, and it is not a formality: the ladder has hysteresis - a control comes back only
     once the row can hold it with room to spare - so a sweep that starts where the last leg left
     the window (390px) reads a shed state at widths that are perfectly roomy on the way down.
     The subject is the retreat, so the sweep starts above every rung and walks down. */
  await sized(p, 1500, 950, "the second row's shed, wide first", 700);
  let shedAt = 0, roomy = null, pinch = null;
  for (let w = 620; w >= 470 && !shedAt; w -= 2) {
    await sized(p, w, 950, "the second row's shed sweep", 260);
    const r = await rowShed();
    if (r.theme && r.facts) roomy = Object.assign({ w }, r);
    else { shedAt = w; pinch = Object.assign({ w }, r); }
  }
  /* AND IT SHEDS WHILE THE SEARCH BOX STILL HAS ROOM, ruled 2026-09-17: the trigger is no longer
     a field UNDER its floor but one within a margin of it, so the width the chevron frees lands
     in the box somebody is typing in rather than arriving after it is already pinched. Read as
     the relation rather than as the margin: the last roomy width has room above the floor, and
     the retreat adds to it. */
  const roomOf = r => r.find - r.findFloor;
  check(!!shedAt && !!roomy && !pinch.theme && !pinch.facts && pinch.chevron
        && pinch.rows.join(",") === "moreFacts,moreTheme"
        && roomy.theme && roomy.facts && !roomy.chevron
        && roomy.pax >= roomy.paxFloor && pinch.pax >= pinch.paxFloor
        && pinch.find >= pinch.findFloor && pinch.over <= 0
        && roomOf(roomy) >= 20 && roomOf(pinch) >= roomOf(roomy) + 20,
    "the second row sheds at " + shedAt + "px, while the search box still has "
    + roomOf(roomy) + "px above the floor the sheet gives it: at " + roomy.w
    + "px both fields stand on their floors (pax " + roomy.pax
    + "/" + roomy.paxFloor + ", search " + roomy.find + "/" + roomy.findFloor + ") with nothing in"
    + " the chevron, and at " + shedAt + "px the theme and Quick facts are behind it as a pair ("
    + pinch.rows.join(", ") + "), the floors hold (pax " + pinch.pax + "/" + pinch.paxFloor
    + ", search " + pinch.find + "/" + pinch.findFloor + ", overflow " + pinch.over + ") and the"
    + " search box is " + roomOf(pinch) + "px above its floor");
  clean(e, "the second row's shed");

  /* And that a control behind the door is still the control. Each row delegates with .click() to
     a button that is display:none, so what is driven here is the chevron and what is read is the
     state the hidden control owns. 430px is below the last rung, where all three have retreated. */
  e = since();
  await sized(p, 430, 950, "a control behind the door", 600);
  const behindDoor = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const open = async () => { document.getElementById("moreBtn").click(); await wait(250); };
    const row = id => document.getElementById(id);
    const out = { hidden: ["#theme", "#factsBtn", "#seg"].every(s => getComputedStyle(document.querySelector(s)).display === "none"),
                  rows: ["moreFacts", "moreTheme", "moreLang"].filter(id => !row(id).hidden) };
    await open();
    out.menuUp = !document.getElementById("moreMenu").hidden;
    out.themeWas = document.documentElement.dataset.theme || null;
    row("moreTheme").click(); await wait(600);
    out.themeNow = document.documentElement.dataset.theme || null;
    out.closedAfter = document.getElementById("moreMenu").hidden;
    await open();
    row("moreFacts").click(); await wait(500);
    out.factsUp = !document.getElementById("factsPanel").hidden;
    document.getElementById("factsBtn").click(); await wait(300);
    await open();
    out.langWas = (document.querySelector("#seg button.on") || {}).dataset.l;
    out.badgeWas = document.getElementById("moreLangBadge").textContent;
    row("moreLang").click(); await wait(700);
    out.langNow = (document.querySelector("#seg button.on") || {}).dataset.l;
    return out;
  });
  check(behindDoor.hidden && behindDoor.menuUp && behindDoor.rows.length === 3
        && behindDoor.themeNow !== behindDoor.themeWas && behindDoor.closedAfter
        && behindDoor.factsUp && behindDoor.langNow !== behindDoor.langWas
        && behindDoor.badgeWas === String(behindDoor.langWas || "").toUpperCase(),
    "at 430px all three tools are behind the chevron and each still works from it: the theme went "
    + behindDoor.themeWas + " to " + behindDoor.themeNow + " and the menu shut behind it ("
    + behindDoor.closedAfter + "), Quick facts opened (" + behindDoor.factsUp + "), and the"
    + " language went " + behindDoor.langWas + " to " + behindDoor.langNow + " from a row whose"
    + " badge read " + behindDoor.badgeWas + ", the language it was in");
  clean(e, "the tools behind the chevron");

  /* THE PAX BOX'S OWN FLOOR, ruled 2026-09-17. It is the box that gives way, and below the last
     rung it had nothing to stop it: at 300px it was 59px wide and still narrowing with the
     window. THE CONTROL IS THE FLOOR SWITCHED OFF in the same window at the same width, which is
     what the box did yesterday, so this is a measurement of the rule and not of the layout. */
  e = since();
  await sized(p, 300, 950, "the PAX box's own floor", 600);
  const paxFloor = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const pax = document.querySelector(".fills > .fill");
    const find = document.querySelectorAll(".fills > .fill")[1];
    const wide = el => Math.round(el.getBoundingClientRect().width);
    const out = { min: Math.round(parseFloat(getComputedStyle(pax).minWidth) || 0),
                  searchFloor: Math.round(parseFloat(getComputedStyle(find).flexBasis) || 0),
                  on: wide(pax) };
    pax.style.minWidth = "0"; await wait(250);
    out.off = wide(pax);
    pax.style.minWidth = ""; await wait(250);
    out.back = wide(pax);
    return out;
  });
  check(paxFloor.min > 0 && paxFloor.min < paxFloor.searchFloor && paxFloor.on === paxFloor.min
        && paxFloor.off < paxFloor.min && paxFloor.back === paxFloor.min,
    "at 300px the PAX box stands on a floor of its own, a little under the search box's "
    + paxFloor.searchFloor + "px: " + paxFloor.on + "px against " + paxFloor.off
    + " with the floor switched off in the same window, and " + paxFloor.back + " with it back");
  clean(e, "the PAX box's floor");

  await sized(p, 1500, 950, "back to wide after the floor", 900);

  /* The intent panel: pick, add a second, pinned above the list, wheel over it, drag a plain row, clear. */
  e = since();
  await p.evaluate(() => [...document.querySelectorAll("#intentRailList .rail-item")][6].click()); await sleep(600);
  await p.evaluate(() => [...document.querySelectorAll("#intentRailList .rail-item:not(.on)")][2].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }))); await sleep(600);
  const rail = await p.evaluate(() => { const box = document.getElementById("intentRailList"), on = [...box.querySelectorAll(".rail-item.on")];
    const t0 = on[0] && on[0].getBoundingClientRect(), first = box.querySelector(".rail-item:not(.on)"), f = first && first.getBoundingClientRect();
    return { pinned: on.length, docked: document.body.classList.contains("rail-on"), aboveList: !!t0 && t0.bottom <= box.getBoundingClientRect().top + 0.5,
             plainInside: !!f && f.top >= box.getBoundingClientRect().top - 0.01, pos: on[0] && getComputedStyle(on[0]).position,
             x: t0 ? t0.left + t0.width / 2 : 0, y: t0 ? t0.top + t0.height / 2 : 0 }; });
  check(rail.pinned === 2 && rail.pos === "absolute" && rail.aboveList && rail.plainInside, "two picked intents pinned above the list, plain rows inside it");
  await p.mouse.move(rail.x, rail.y); await p.mouse.wheel({ deltaY: 120 }); await sleep(400);
  check((await p.evaluate(() => document.getElementById("intentRailList").scrollTop)) > 0, "wheel over a pinned row scrolls the list");
  await p.evaluate(() => { document.getElementById("intentRailList").scrollTop = 0; });
  const before = await p.evaluate(() => JSON.stringify(intentOrder));
  const rows = await p.evaluate(() => [...document.querySelectorAll("#intentRailList .rail-item:not(.on)")].slice(0, 3).map(el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
  await p.mouse.move(rows[0].x, rows[0].y); await p.mouse.down(); await sleep(120);
  for (let i = 1; i <= 8; i++) { await p.mouse.move(rows[0].x, rows[0].y + (rows[2].y - rows[0].y) * i / 8); await sleep(40); }
  await sleep(250); await p.mouse.up(); await sleep(600);
  check((await p.evaluate(() => JSON.stringify(intentOrder))) !== before, "dragging a plain row reorders the intents");
  /* The clear-intents door beside the add button: there while something is picked, gone after. */
  const fabOn = await p.evaluate(() => { const f = document.getElementById("clearIntentsFab"); const cs = getComputedStyle(f);
    return { on: f.classList.contains("on"), many: f.classList.contains("many"), n: f.querySelector(".fab-n").textContent, op: cs.opacity, vis: cs.visibility, title: f.title }; });
  check(fabOn.on && fabOn.many && fabOn.n === "2" && fabOn.op === "1" && fabOn.vis === "visible", "the clear-intents button shows for two picked intents with their count (" + JSON.stringify(fabOn.title) + ")");
  await p.evaluate(() => { document.getElementById("intentRailList").scrollTop = 400; });
  await p.evaluate(() => document.getElementById("clearIntentsFab").click()); await sleep(700);
  const fabOff = await p.evaluate(() => { const f = document.getElementById("clearIntentsFab"); return { on: f.classList.contains("on"), picked: document.querySelectorAll("#intentRailList .rail-item.on").length, vis: getComputedStyle(f).visibility, top: document.getElementById("intentRailList").scrollTop }; });
  check(!fabOff.on && fabOff.picked === 0 && fabOff.vis === "hidden", "clicking it clears the intents and it fades away");
  check(fabOff.top === 0, "and the clear scrolls the panel to its top (scrollTop " + fabOff.top + ")");
  await p.evaluate(() => { const rows = document.querySelectorAll("#intentRailList .rail-item[data-si]"); rows[0].click(); }); await sleep(700);
  await p.evaluate(() => { const rows = document.querySelectorAll("#intentRailList .rail-item[data-si]:not(.on)"); rows[0].dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true })); }); await sleep(900);
  await p.evaluate(() => document.getElementById("intentRailClear").click()); await sleep(500);
  check((await p.evaluate(() => document.querySelectorAll("#intentRailList .rail-item.on").length)) === 0, "the clear button unpins everything");
  clean(e, "the intent panel");

  /* The fields: a long name fades behind the caret, then on the other side when the caret goes home. */
  e = since();
  await p.evaluate(() => document.querySelector("#pax").focus());
  await p.keyboard.type("Wojciechowska-Nowakowska", { delay: 8 }); await sleep(400);
  const f1 = await p.evaluate(() => { const c = document.querySelector("#pax").classList; return { l: c.contains("cut-l"), r: c.contains("cut-r") }; });
  await p.keyboard.press("Home"); await sleep(400);
  const f2 = await p.evaluate(() => { const c = document.querySelector("#pax").classList; return { l: c.contains("cut-l"), r: c.contains("cut-r") }; });
  check(f1.l && !f1.r && f2.r && !f2.l, "PAX fades left while typing and right after Home");
  await p.evaluate(() => document.getElementById("paxClear").click()); await sleep(400);
  check(await p.evaluate(() => document.querySelector("#pax").value === ""), "the PAX eraser empties the field");
  clean(e, "the fields");

  /* Quick facts open and close. */
  e = since();
  await p.evaluate(() => document.getElementById("factsBtn").click()); await sleep(500);
  const facts = await p.evaluate(() => { const f = document.querySelector(".facts-panel"); return !!f && f.offsetParent !== null; });
  await p.keyboard.press("Escape"); await sleep(400);
  check(facts, "Quick facts opens and Escape closes it");
  clean(e, "Quick facts");

  /* Search: a query narrows the list and greys the panel; the eraser and Escape both leave it whole. */
  e = since();
  const all = await p.evaluate(() => document.querySelectorAll("#list .card").length);
  await p.evaluate(() => { document.getElementById("intentRailList").scrollTop = 240; document.querySelector("#intent").focus(); });
  await p.keyboard.type("refund", { delay: 10 }); await sleep(900);
  const q = await p.evaluate(() => { const box = document.getElementById("intentRailList"); const first = box.querySelector(".rail-item:not(.on)");
    return { cards: document.querySelectorAll("#list .card").length, grey: box.querySelectorAll(".rail-nohit").length, top: box.scrollTop, firstGrey: !!first && first.classList.contains("rail-nohit") }; });
  check(q.top === 0 && !q.firstGrey, "the settle scrolls the panel to the top, a match first (scrollTop " + q.top + ")");
  await p.evaluate(() => document.getElementById("intentClear").click()); await sleep(700);
  const after = await p.evaluate(() => ({ cards: document.querySelectorAll("#list .card").length, grey: document.querySelectorAll("#intentRailList .rail-nohit").length, v: document.querySelector("#intent").value }));
  check(q.cards < all && q.grey > 0, "a query narrows the list (" + all + " to " + q.cards + ") and greys " + q.grey + " rows");
  check(after.v === "" && after.grey === 0 && after.cards === all, "the eraser restores the list and un-greys the panel");
  /* BOARD 344, the OTHER way out of a query, and the one a hand reaches for. The eraser above
     is #intentClear; Escape from inside the box climbs the ladder at search-box.js:88 and
     sheds the query through hooks.clearSearchQuery (escape-ladder.js:31), a rung nothing in
     this file had ever stood on. One rung: the query goes and anything else survives. */
  await p.evaluate(() => document.querySelector("#intent").focus());
  await p.keyboard.type("refund", { delay: 10 }); await sleep(900);
  const qe0 = await p.evaluate(() => ({ v: document.querySelector("#intent").value, cards: document.querySelectorAll("#list .card").length }));
  await p.keyboard.press("Escape"); await sleep(900);
  const qe1 = await p.evaluate(() => ({ v: document.querySelector("#intent").value, cards: document.querySelectorAll("#list .card").length }));
  check(qe0.cards < all && qe1.v === "" && qe1.cards === all,
    "and Escape sheds the query by its own rung (" + all + " to " + qe0.cards + " to " + qe1.cards + ")");
  clean(e, "search");

  /* The dialogs' folds and the editor's Save. */
  e = since();
  await p.evaluate(() => document.querySelector('[data-act="settings"]').click()); await sleep(700);
  const acc = await p.evaluate(async () => { const ds = [...document.querySelectorAll("#modalCard details.acc")]; if (ds.length < 2) return { n: ds.length };
    const a = ds[0], c = ds[1]; const was = a.open; a.querySelector("summary").click(); await new Promise(r => setTimeout(r, 450));
    const t1 = a.open; c.querySelector("summary").click(); await new Promise(r => setTimeout(r, 450));
    return { n: ds.length, toggled: t1 !== was, cOpen: c.open, setOk: accOpen.has(c.getAttribute("data-acc")) === c.open && accOpen.has(a.getAttribute("data-acc")) === a.open }; });
  check(acc.n >= 2 && acc.toggled && acc.cOpen && acc.setOk, "Settings folds toggle, accordion, open-set true (" + acc.n + " folds)");
  /* WHAT THE SCREEN IS MADE OF, board 452: the sections it holds, in order, and the two rows the
     first of them merged. Read as a list rather than asserted one at a time, so a section
     arriving as well as a section leaving is a failure. */
  const setSecs = await p.evaluate(() => {
    const ds = [...document.querySelectorAll("#modalCard details.acc")];
    const first = ds[0], rows = first ? [...first.querySelectorAll(".set-row")] : [];
    const name = ((document.getElementById("setAgentName") || {}).value || "").trim();
    return { ids: ds.map(d => d.getAttribute("data-acc")),
             title: first ? first.querySelector(".acc-title").textContent : "",
             rows: rows.map(r => (r.querySelector("input,select") || {}).id || ""),
             note: first ? first.querySelector(".acc-note").textContent : "",
             want: name ? name + ", English" : "English" };
  });
  check(setSecs.ids.join(",") === "personal,appearance,layout,keys" && setSecs.title === "Personal"
        && setSecs.rows.join(",") === "setAgentName,setUiLang" && setSecs.note === setSecs.want,
    "Settings holds Personal, Appearance, Layout and Keyboard shortcuts, the name above the"
    + " language and nothing about catalogs: " + JSON.stringify(setSecs));
  await p.keyboard.press("Escape"); await sleep(400);
  /* Manage's folds. The toggle itself is <details>, which the browser does for nothing, so the
     fact worth asserting is the one the app owns: that the fold a person left open is still open
     when Manage is drawn again. This read mgOpen until 2026-09-13 - the module's own Set, reached
     off the page through the bridge - which is the module asserting its own opinion, board item
     264's fault. What is on screen is details[open] after a redraw, so that is what is read, and
     the section is put back the way it was found. */
  await p.evaluate(() => document.querySelector('[data-act="manage"]').click()); await sleep(900);
  const mgKey = await p.evaluate(async () => { const ds = [...document.querySelectorAll("#modalCard details[data-mg]")];
    const d = ds.find(x => !x.open); if (!d) return { n: ds.length, key: null };
    d.querySelector("summary").click(); await new Promise(r => setTimeout(r, 450));
    return { n: ds.length, key: d.getAttribute("data-mg"), toggled: d.open }; });
  const reopen = k => p.evaluate(async key => { dismissModal(); await new Promise(r => setTimeout(r, 400));
    document.querySelector('[data-act="manage"]').click(); await new Promise(r => setTimeout(r, 700));
    const d = document.querySelector('#modalCard details[data-mg="' + key + '"]');
    return d ? d.open : null; }, k);
  const mgAfter = mgKey.key === null ? null : await reopen(mgKey.key);
  if (mgKey.key !== null) await p.evaluate(async key => { const d = document.querySelector('#modalCard details[data-mg="' + key + '"]');
    if (d && d.open) d.querySelector("summary").click(); await new Promise(r => setTimeout(r, 400)); }, mgKey.key);
  const mgBack = mgKey.key === null ? null : await reopen(mgKey.key);
  check(mgKey.n > 0 && mgKey.key !== null && mgKey.toggled === true,
    "a closed Manage section opens on its summary (" + mgKey.n + " sections)");
  check(mgAfter === true, "and is still open when Manage is drawn again (details[open] " + mgAfter + ")");
  check(mgBack === false, "and closing it survives the same redraw (details[open] " + mgBack + ")");

  /* THE SAME LIST A DESK HAS, in a browser that has no folder to read: one row, the catalog this
     page is holding, marked and offering Eject. The file-backed rows are the host's, so what is
     asserted here is that there are none of them and that the one row is still drawn. */
  const mgList = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    dismissModal(); await wait(400);
    document.querySelector('[data-act="manage"]').click(); await wait(800);
    const d = document.querySelector('#modalCard details[data-mg="data"]');
    if (!d) return { step: "no data fold" };
    if (!d.open) d.querySelector("summary").click();
    await wait(800);
    const rows = [...document.querySelectorAll("#mgCatList .ec-row")];
    const out = { step: "open", n: rows.length,
                  open: !!document.getElementById("mgCatOpen"),
                  change: !!document.getElementById("mgCatFolder"),
                  name: rows[0] ? (rows[0].querySelector(".ec-name b") || {}).textContent : null,
                  loaded: !!rows[0] && rows[0].classList.contains("is-loaded"),
                  act: rows[0] ? [...rows[0].querySelectorAll("button.btn")].map(x => x.textContent).join("|") : null,
                  meta: rows[0] ? (rows[0].querySelector(".ec-meta") || {}).textContent : null,
                  held: (typeof E_CATALOG_NAME === "string" && E_CATALOG_NAME) || "" };
    /* EXPORT COMES WHEN THERE IS SOMETHING TO EXPORT, ruled 2026-09-17: nothing has been edited
       on top of this catalog, so the file it came from holds every word an export would write.
       One edit through the product's own save, and the row is asked again. */
    window.pack.who = "Ada"; window.savePack(); window.paintCatalogList();
    await wait(600);
    const after = [...document.querySelectorAll("#mgCatList .ec-row")][0];
    out.actEdited = after ? [...after.querySelectorAll("button.btn")].map(x => x.textContent).join("|") : null;
    delete window.pack.who; window.savePack(); window.paintCatalogList();
    await wait(400);
    dismissModal(); await wait(300);
    return out;
  });
  check(mgList.step === "open" && mgList.n === 1 && mgList.loaded && mgList.act === "Eject"
        && mgList.actEdited === "Export…|Eject"
        && mgList.name === mgList.held && !mgList.open && !mgList.change
        && /card/.test(mgList.meta || ""),
    "the Library lists the catalog this browser holds as its one row, marked and carrying Eject -"
    + " and Export beside it the moment there is an edit to export - with none of the host's file"
    + " rows and no folder on the title line ("
    + JSON.stringify({ n: mgList.n, loaded: mgList.loaded, act: mgList.act, meta: mgList.meta,
                       open: mgList.open, change: mgList.change }) + ")");

  /* THE AWAITING MARK ON THE LIBRARY ROW, board 571. A whole catalog never draws it. The
     catalog is the invented sample with every key named pl taken off, langs still declaring
     that language, written beside the engine in a temp folder the way a run folder is made,
     never into the tree. The control is the same sample left whole. */
  const sampleFile = path.join(RUN.dir, E.FIXTURE_FILE.sample);
  const sampleText = fs.readFileSync(sampleFile, "utf8");
  const sampleAt = sampleText.indexOf("E_SAMPLE");
  const sampleEq = sampleAt > -1 ? sampleText.indexOf("=", sampleAt) : -1;
  if (sampleEq < 0) throw new Error("no E_SAMPLE in the invented sample");
  const sampleData = JSON.parse(sampleText.slice(sampleEq + 1).trim().replace(/;\s*$/, ""));
  const stripNamed = (v, name) => {
    if (Array.isArray(v)) return v.map(x => stripNamed(x, name));
    if (v && typeof v === "object") {
      const o = {};
      Object.keys(v).forEach(k => { if (k !== name) o[k] = stripNamed(v[k], name); });
      return o;
    }
    return v;
  };
  const oneLangData = stripNamed(sampleData, "pl");
  delete oneLangData.hash;
  const asSibling = c => "window.E_CATALOG = " + JSON.stringify(c) + ";" + "\n";
  /* A CONDITION WITH A DEADLINE, NEVER A SLEEP, board item 573. This leg arrived waiting by the
     clock - 2.4 s after load, 1.9 s and 0.5 s guessing at buttons, 0.8 s between interactions -
     which is a guess at how fast this desk is and a flake on a slower one. waitForFunction polls
     inside the page, so each wait ends at the first moment its condition holds. The name travels
     with it and a timeout is recorded rather than thrown: the caller decides whether a thing
     that did not arrive is a failure, and one of them, the catalog offer on a page that may
     never raise it, is not. Every name that timed out reaches the leg's own message, so a slow
     desk reddens with a sentence instead of reading a half-drawn page. */
  const lateFor = [];
  /* The same wait as the shared helper's, bound to this leg's own list of names. */
  const untilHere = (pg, fn, what, ms) => until(pg, fn, what, lateFor, ms);
  const readLibraryAwaiting = async (body, label) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-571-"));
    let ctx = null;
    try {
      fs.copyFileSync(RUN.page, path.join(dir, "etiuda.html"));
      fs.writeFileSync(path.join(dir, E.FIXTURE_FILE.catalog), body);
      ctx = b.createBrowserContext ? await b.createBrowserContext()
        : await b.createIncognitoBrowserContext();
      const q = await ctx.newPage();
      await hookInstall(q);
      await q.setViewport({ width: 1500, height: 950 });
      q.on("dialog", d => d.accept());
      q.on("pageerror", x => errs.push("pageerror: " + String(x.message || x)));
      /* Board item 630: the boot dance is the shared helper's, the same one the main page
         uses, so the two copies cannot drift apart again. Whatever it waited out comes back
         here and reaches this leg's own sentence. */
      lateFor.push.apply(lateFor, await bootAndDismiss(q,
        "file:///" + path.join(dir, "etiuda.html").replace(/\\/g, "/"), label));
      /* Three steps, each waited on by what it produces. They were one evaluate with three
         sleeps inside it, where a slow desk read a modal that had not finished opening. */
      await q.evaluate(() => { if (typeof dismissModal === "function") dismissModal(); });
      /* THE THING THAT MOVES, measured rather than guessed on 2026-09-20: #modalCard is on the
         page from the first paint at offsetWidth 0, so waiting for it to go never ends, and the
         dialog dismissModal closes is #eCatalogModal. The door below is asked for by EXISTENCE
         and not by visibility, for the same reason: it sits in a menu that is closed until it is
         opened, so its offsetWidth is 0 on a page where clicking it works perfectly. Both wrong
         conditions were caught by this leg going red with a sentence naming the wait, which is
         what the change is for. */
      await untilHere(q, () => { const m = document.querySelector("#eCatalogModal");
                             return !m || m.offsetWidth === 0; },
                  label + ": the catalog dialog to close", 10000);
      const canManage = await untilHere(q, () => !!document.querySelector('[data-act="manage"]'),
                                    label + ": the Manage door", 20000);
      if (!canManage) return { step: "no manage" };
      await q.evaluate(() => document.querySelector('[data-act="manage"]').click());
      if (!await untilHere(q, () => !!document.querySelector('#modalCard details[data-mg="data"]'),
                       label + ": the data fold", 20000))
        return { step: "no data fold" };
      await q.evaluate(() => {
        const fold = document.querySelector('#modalCard details[data-mg="data"]');
        if (fold && !fold.open) fold.querySelector("summary").click();
      });
      await untilHere(q, () => document.querySelectorAll("#mgCatList .ec-row").length > 0,
                  label + ": a Library row", 20000);
      return await q.evaluate(() => {
        const row = document.querySelector("#mgCatList .ec-row.is-loaded")
          || document.querySelector("#mgCatList .ec-row");
        if (!row) return { step: "no row",
          n: document.querySelectorAll("#mgCatList .ec-row").length };
        const sel = 'svg circle[cx="12.5"][cy="12.5"][r="8"]';
        const mark = row.querySelector(sel);
        const svg = mark && mark.closest("svg");
        const box = svg ? svg.getBoundingClientRect() : null;
        const awaitEl = row.querySelector(".ec-await");
        return {
          step: "open",
          n: document.querySelectorAll("#mgCatList .ec-row").length,
          marks: row.querySelectorAll(sel).length,
          inAwait: !!(awaitEl && awaitEl.querySelector(sel)),
          w: box ? +box.width.toFixed(2) : 0,
          h: box ? +box.height.toFixed(2) : 0,
          meta: ((row.querySelector(".ec-meta") || {}).textContent || "")
            .replace(/\s+/g, " ").trim(),
          cards: (typeof cards !== "undefined" && cards && cards.length) || 0
        };
      });
    } finally {
      await hookDrain(ctx, label);
      if (ctx) await ctx.close().catch(() => {});
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const missingSecond = await readLibraryAwaiting(asSibling(oneLangData),
    "571 a catalog missing its second language");
  const wholeSample = await readLibraryAwaiting(asSibling(sampleData),
    "571 the whole sample");
  const awaitPhrase = /\d+ cards? awaiting PL/i;
  check(missingSecond.step === "open" && missingSecond.marks === 1 && missingSecond.inAwait
        && Math.round(missingSecond.w) === 14 && Math.round(missingSecond.h) === 14
        && awaitPhrase.test(missingSecond.meta || "")
        && missingSecond.cards === (sampleData.cards || []).length,
    "571a the Library row on a catalog missing its second language shows the awaiting count"
    + " with the approved mark at 14 px (" + JSON.stringify(missingSecond) + ")"
    + (lateFor.length ? " - WAITED OUT: " + lateFor.join("; ") : ", every step waited on a"
       + " condition and none timed out"));
  check(wholeSample.step === "open" && wholeSample.marks === 0 && !wholeSample.inAwait
        && !awaitPhrase.test(wholeSample.meta || ""),
    "571b the same row on the whole sample finds neither the count nor the mark ("
    + JSON.stringify(wholeSample) + ")");

  /* ---- ONE DECLARED LANGUAGE, board 649 ------------------------------------------------------
   *
   * The spec decided on 2026-09-04 that one declared language is legal and that the control does
   * not act: at one it is "the code, rendered in the same box, inert". The runtime did not do it -
   * the header's control was two static buttons in the markup and nothing ever rebuilt them, so a
   * catalog declaring one language got a button selecting a language with no text in it - and the
   * finding that said so was an exhaustive search of src/, which is a reading and not a
   * measurement. THIS IS THE MEASUREMENT, and it is the control on the fix.
   *
   * THE STORED LANGUAGE IS SEEDED BEFORE THE FIRST LINE OF THE ENGINE RUNS, because the question
   * is not only what the box shows: boot seeds the first tab from "eLang", so a desk that had a
   * bilingual catalog and loads a one-language one arrives holding a language the catalog does not
   * speak. Seeding it is what makes this leg ask that, and it is where the defect was worst - the
   * language was not only selectable, it was already selected and written back to storage.
   *
   * WHY EN IS THE SINGLE LANGUAGE HERE, and it is a finding rather than a preference. A catalog
   * declaring pl alone does not reach this screen at all: normaliseCatalog validates every card
   * through parseMacrosData, which requires the v1 flat keys `t` and `en` by name, while
   * setContentLangs has not run yet - so a pl-only catalog throws "card 1: title (t) is required"
   * inside eCatalog()'s try, the sibling becomes null and the desk shows the empty screen with no
   * word said. Measured 2026-09-21 in bare node and in a window. That is a defect of its own and
   * has a board row; the one this leg holds is the control, which is reachable today.
   */
  const enOnlyData = stripNamed(sampleData, "pl");
  enOnlyData.langs = (sampleData.langs || []).filter(l => l && l.code === "en");
  enOnlyData.commentLang = "en";
  delete enOnlyData.hash;
  /** Boot a lab on `body` with `seed` already written into "eLang", read the header's language
   *  control, press it, and read it again. */
  const readLangControl = async (body, label, seed) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-649-"));
    let ctx = null;
    try {
      fs.copyFileSync(RUN.page, path.join(dir, "etiuda.html"));
      fs.writeFileSync(path.join(dir, E.FIXTURE_FILE.catalog), body);
      ctx = b.createBrowserContext ? await b.createBrowserContext()
        : await b.createIncognitoBrowserContext();
      const q = await ctx.newPage();
      await hookInstall(q);
      await q.setViewport({ width: 1500, height: 950 });
      q.on("dialog", d => d.accept());
      q.on("pageerror", x => errs.push("pageerror: " + String(x.message || x)));
      await q.evaluateOnNewDocument(l => { try { localStorage.setItem("eLang", l); } catch (e) {} }, seed);
      lateFor.push.apply(lateFor, await bootAndDismiss(q,
        "file:///" + path.join(dir, "etiuda.html").replace(/\\/g, "/"), label));
      const read = () => q.evaluate(() => {
        const bs = [...document.querySelectorAll("#seg button")];
        const box = document.querySelector("#seg");
        return {
          codes: bs.map(x => x.dataset.l),
          text: bs.map(x => x.textContent.trim()),
          on: bs.filter(x => x.classList.contains("on")).map(x => x.dataset.l),
          declared: (typeof CONTENT_LANGS !== "undefined") ? CONTENT_LANGS.slice() : null,
          lang: (typeof lang !== "undefined") ? lang : null,
          eLang: (() => { try { return localStorage.getItem("eLang"); } catch (e) { return "?"; } })(),
          cards: document.querySelectorAll(".card").length,
          blocks: document.querySelectorAll(".card .txt").length,
          tinted: [...document.querySelectorAll(".card .txt")]
            .filter(x => x.classList.contains("plx")).length,
          w: box ? Math.round(box.getBoundingClientRect().width) : 0
        };
      });
      const before = await read();
      /* A REAL POINTER AT THE RECT'S CENTRE. el.click() fires no pointerdown and reaches through
         a scrim, so it is not the interaction being asked about. The target is the button that is
         NOT lit where there are two, and the only one there is where there is one. */
      const target = await q.evaluate(() => {
        const bs = [...document.querySelectorAll("#seg button")];
        const el = bs.find(x => !x.classList.contains("on")) || bs[0];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { l: el.dataset.l, x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (target) await q.mouse.click(target.x, target.y);
      /* THE ONE PLACE A CONDITION CANNOT BE WRITTEN, and it is said out loud rather than dressed
         up: half of what this leg asserts is that NOTHING happened, and an absence has no event to
         wait for. The budget is setLang's own deferred tail - 200 ms after the thumb's glide -
         with three times that as margin, so a switch that was going to happen has happened. */
      await sleep(700);
      const after = await read();
      return { before, after, target };
    } finally {
      await hookDrain(ctx, label);
      if (ctx) await ctx.close().catch(() => {});
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const one = await readLangControl(asSibling(enOnlyData),
    "649 a catalog declaring one language", "pl");
  const two = await readLangControl(asSibling(sampleData), "649 the whole sample", "pl");
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);
  check(same(one.before.declared, ["en"]) && same(one.before.codes, ["en"])
        && same(one.before.on, ["en"]) && one.before.cards > 0,
    "649a a catalog declaring one language shows that one code in the header and no other ("
    + JSON.stringify(one.before) + ")");
  check(one.before.lang === "en" && one.before.eLang === "en",
    "649b the language on screen is the declared one although this browser had stored the other"
    + " (lang " + JSON.stringify(one.before.lang) + ", eLang " + JSON.stringify(one.before.eLang) + ")");
  /* The button pressed is the one that is not lit where there are two, so at one language the
     target must BE the lit one: that clause is what gives this check teeth of its own rather
     than passing because 649a's two buttons happened to leave the desk where it started. */
  check(!!one.target && one.target.l === (one.before.on[0] || null)
        && one.after.lang === "en" && one.after.eLang === "en"
        && same(one.after.on, ["en"]) && one.after.cards === one.before.cards,
    "649c pressing that control does not act: " + JSON.stringify(one.target && one.target.l)
    + " pressed at its centre and " + JSON.stringify(one.after));
  check(same(two.before.declared, ["en", "pl"]) && same(two.before.codes, ["en", "pl"])
        && same(two.before.on, ["pl"]) && two.before.lang === "pl"
        && two.after.lang === "en" && same(two.after.on, ["en"]),
    "649d the control: two declared languages keep two codes, the stored one is honoured, and"
    + " pressing the other still switches (" + JSON.stringify([two.before.on, two.after.on]) + ")");

/* ---- ANY SET OF DECLARED LANGUAGES, board 646 ----------------------------------------------
   *
   * Maxim ruled on 2026-09-21 that the desk accepts a catalog declaring any set of languages, of
   * any size and any codes, including one that excludes English and Polish entirely. The runtime
   * read exactly `en` and `pl`, so English with German was refused as firmly as three languages
   * were; the columns are derived now, and this is the measurement in a window rather than in
   * bare node, on the same lab 649 uses.
   *
   * THE CODES ARE RENAMED RATHER THAN INVENTED, so the catalog under the desk is the shipped
   * sample in every other respect - the cards, the shelves, the requests and the block shapes
   * are a real catalog's, and what differs is the two letters naming each column.
   */
  const LANG_KEYED = new Set(["title", "body", "note", "label", "clause", "action", "topic",
                              "greet", "stop"]);
  const renameLangs = (data, map) => {
    const walk = (v, key) => {
      if (Array.isArray(v)) return v.map(x => walk(x, key));
      if (!v || typeof v !== "object") return v;
      const o = {};
      Object.keys(v).forEach(k => {
        o[(LANG_KEYED.has(key) && map[k]) ? map[k] : k] = walk(v[k], k);
      });
      return o;
    };
    const out = walk(JSON.parse(JSON.stringify(data)), null);
    out.langs = (data.langs || []).map(l => ({ code: map[l.code] || l.code,
                                               label: (map[l.code] || l.code).toUpperCase() }));
    out.commentLang = map[data.commentLang] || data.commentLang;
    (out.cards || []).forEach(c => { if (c.lockLang && map[c.lockLang]) c.lockLang = map[c.lockLang]; });
    delete out.hash;
    delete out.sig;
    return out;
  };
  const plOnlyData = stripNamed(sampleData, "en");
  plOnlyData.langs = (sampleData.langs || []).filter(l => l && l.code === "pl");
  plOnlyData.commentLang = "pl";
  delete plOnlyData.hash;
  const foreignData = renameLangs(sampleData, { en: "de", pl: "uk" });

  const solo = await readLangControl(asSibling(plOnlyData),
    "646 a catalog declaring Polish alone", "en");
  check(same(solo.before.declared, ["pl"]) && same(solo.before.codes, ["pl"])
        && solo.before.lang === "pl" && solo.before.cards > 0,
    "646m a catalog declaring Polish alone reaches the screen at all, which it did not: the"
    + " whitelist asked the live language list before the catalog had set it and threw on a"
    + " missing `t`, so the desk showed the empty screen with nothing said ("
    + JSON.stringify(solo.before) + ")");

  /* `two` above read the same sample under en and pl with "pl" stored, so it arrived showing pl
     and pressing took it to en. The renamed copy arrives showing de - the column en was renamed
     to - and pressing takes it to uk, which was pl. So the two runs are the same two views under
     different names, and the counts must match ACROSS the swap. */
  const foreign = await readLangControl(asSibling(foreignData),
    "646 a catalog declaring neither founding code", "en");
  check(same(foreign.before.declared, ["de", "uk"]) && same(foreign.before.codes, ["de", "uk"])
        && same(foreign.before.on, ["de"]) && foreign.before.cards === two.before.cards
        && foreign.before.blocks === two.after.blocks
        && foreign.after.blocks === two.before.blocks,
    "646n a catalog declaring neither English nor Polish loads whole and renders what the sample"
    + " it was renamed from renders: " + foreign.before.cards + " card(s), "
    + foreign.before.blocks + " block(s) showing de against " + two.after.blocks + " showing en,"
    + " and " + foreign.after.blocks + " showing uk against " + two.before.blocks + " showing pl."
    + " The header names its own two codes " + JSON.stringify(foreign.before.codes)
    + ". Before this the reader refused the catalog outright");
  /* THE TINT IS THE EYE'S HALF and it is measured rather than assumed: the spec's rule is that
     the primary is untinted and every other language shares the secondary tint, and it was
     written as "is it Polish", which tints nothing at all on a desk whose codes are de and uk. */
  check(foreign.before.tinted === 0 && foreign.after.on[0] === "uk" && foreign.after.tinted > 0
        && two.before.tinted > 0 && two.after.tinted === 0,
    "646o pressing the second code switches to it, and the body tint follows the PRIMARY rather"
    + " than Polish: " + foreign.before.tinted + " tinted of " + foreign.before.blocks
    + " showing de, " + foreign.after.tinted + " of " + foreign.after.blocks + " showing uk."
    + " THE CONTROL, the same catalog under its own names: " + two.before.tinted + " tinted"
    + " showing pl and " + two.after.tinted + " showing en");

  /* THE OFFER THAT REPLACES ONE CATALOG WITH ANOTHER, ruled 2026-09-17: it is the mirror of
     Load catalog? and carries no sentence under its heading, only the location line the other
     one has. Raised here rather than found, because a browser has no folder to find a second
     catalog in; the dialog is the same function all five channels end in, and Escape closes it
     without recording a refusal. The heading is checked against the pair for the language the
     run is in, which is what says the Polish half arrived with the English. */
  const HEAD_REPLACE = { en: "Replace catalog?", pl: "Zastąpić katalog?" };
  const offer2 = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const shown = eOfferCatalogDialog(
      { id: "probe-second-catalog", name: "Second catalog", cards: [],
        intents: { en: ["a"] }, categories: { gen: "General" } },
      { foundHtml: '<code>second.ec</code>', force: true, asked: true, accept: () => false });
    const card = document.querySelector("#eCatalogModal .modal-card");
    const out = { shown: shown, lang: document.documentElement.getAttribute("lang") || "",
                  h2: card ? card.querySelector("h2").textContent : "",
                  subs: card ? [...card.querySelectorAll("p.modal-sub")].map(x => x.textContent) : [],
                  acts: card ? [...card.querySelectorAll(".modal-actions .btn")].length : 0,
                  name: card ? (card.querySelector(".about-body b") || {}).textContent : "" };
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await wait(250);
    out.gone = !document.getElementById("eCatalogModal");
    return out;
  });
  check(offer2.shown && offer2.h2 === HEAD_REPLACE[offer2.lang] && offer2.subs.length === 1
        && offer2.subs[0].indexOf("second.ec") > -1 && offer2.acts === 2
        && offer2.name === "Second catalog" && offer2.gone,
    "a different catalog offered over the loaded one asks " + JSON.stringify(offer2.h2)
    + " in " + offer2.lang + " and says nothing else: " + offer2.subs.length
    + " paragraph(s) under it, " + JSON.stringify(offer2.subs) + ", the catalog named "
    + JSON.stringify(offer2.name) + " over its counts and " + offer2.acts + " buttons");
  /* THE PATH IS TRIMMED AT ITS FRONT, board 452, so the folder that identifies it stays readable.
     Only a desk has a folder, so the host is faked here for the width question alone - the answer
     is the stylesheet's, and the fake is removed before anything else reads it. The control is the
     same read with a short path, which must not be trimmed at all. */
  const trim = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const read = async (folder) => {
      window.E_HOST = { catalogFolder: folder, catalogFile: "", openCatalogFolder: () => true,
                        catalogFiles: () => [] };
      dismissModal(); await wait(350);
      document.querySelector('[data-act="manage"]').click(); await wait(800);
      const el = document.getElementById("mgCatFolderPath");
      if (!el) return null;
      const cs = getComputedStyle(el), card = document.querySelector(".modal-card");
      return { over: el.scrollWidth - Math.round(el.getBoundingClientRect().width),
               dir: cs.direction, ell: cs.textOverflow, txt: el.textContent,
               cardOver: card.scrollWidth - card.clientWidth };
    };
    const short = await read("C:\\Users\\x\\Documents\\Etiuda");
    const long = await read("C:\\Users\\x\\Documents\\Company catalogues and archives 2026 and later\\Etiuda live desk for the whole team");
    dismissModal(); await wait(300);
    delete window.E_HOST;
    return { short, long };
  });
  check(!!trim.long && trim.long.over > 0 && trim.long.dir === "rtl" && trim.long.ell === "ellipsis"
        && trim.long.cardOver === 0 && !!trim.short && trim.short.over === 0,
    "a folder too long for the title line is trimmed at its front and widens nothing: "
    + JSON.stringify(trim));
  await p.keyboard.press("Escape"); await sleep(300);
  await p.keyboard.press("Escape"); await sleep(400);
  const edit = await p.evaluate(() => { const btn = [...document.querySelectorAll(".card .cacts button")].find(x => /edit|edytuj|full editor/i.test((x.title || "") + " " + (x.getAttribute("aria-label") || ""))); if (!btn) return false; btn.click(); return true; });
  await sleep(900);
  const ed = await p.evaluate(async () => { const ds = [...document.querySelectorAll("#modalCard details.mf-fold")]; const d = ds.find(x => !x.open) || ds[0]; if (!d) return { n: 0 };
    const was = d.open; d.querySelector("summary").click(); await new Promise(r => setTimeout(r, 450)); const s = document.getElementById("meSave"); if (s) s.click(); await new Promise(r => setTimeout(r, 800));
    return { n: ds.length, toggled: d.open !== was, saved: !!s }; });
  check(edit && ed.n > 0 && ed.toggled && ed.saved, "the card editor opens, a fold toggles, Save runs (" + ed.n + " folds)");
  await p.keyboard.press("Escape"); await sleep(400);
  /* Board item 324. OPENING THE EDITOR IS NOT THE EDITOR FINDING THE CARD. openCardEditor falls
     back to an empty template when findCard() returns null, so every word of the check above is
     still true over a blank dialog: the folds are there, one toggles, Save runs. The negative
     control of stage 31 did exactly that - the editor opened with an empty field - and this file
     logged nothing. So what is read back here is the VALUE in a box, against the title the list
     drew in its own pass: two renderings of one fact, neither of them a module internal.
     Language is why it is a some() over the boxes rather than an equality on one. The list shows
     cardTitle(), which falls back to the primary content language; a title box holds that one
     language and nothing else, so the card whose title exists in one language only has an empty
     box in the other and both are right.
     NOTHING FROM THE CATALOG IS PRINTED. The title is a customer's wording, so the line carries
     its length and which box matched, never the text. */
  const fill = await p.evaluate(async () => {
    if (typeof dismissModal === "function") dismissModal();
    await new Promise(r => setTimeout(r, 400));
    const card = document.querySelector("#list .card[data-id]");
    if (!card) return { why: "no card in the list" };
    const ct = card.querySelector(".ctitle");
    const listTitle = (ct ? ct.textContent : "").trim();
    const btn = card.querySelector('[data-act="edit"]');
    if (!btn) return { why: "no edit button on the first card" };
    btn.click();
    await new Promise(r => setTimeout(r, 900));
    const boxes = [...document.querySelectorAll("#modalCard .mf input[id]")]
      .filter(i => /^me_t(_|$)/.test(i.id)).map(i => String(i.value).trim());
    const nm = document.querySelector("#modalCard .modal-name");
    return { listTitle, boxes, modalName: (nm ? nm.textContent : "").trim() };
  });
  const fillAt = fill.boxes ? fill.boxes.indexOf(fill.listTitle) : -1;
  check(!fill.why && fill.listTitle.length > 0 && fill.boxes.length > 0 && fillAt >= 0
        && fill.modalName.length > 0,
    "and it is filled from the card it was opened on: a title box holds the list's own title ("
    + (fill.why || (fill.boxes.length + " title box(es), box " + fillAt + " of them carries the "
       + fill.listTitle.length + " characters the list drew, dialog names a card: "
       + (fill.modalName.length > 0))) + ")");
  await p.keyboard.press("Escape"); await sleep(400);
  await p.evaluate(() => { const b = [...document.querySelectorAll("#modalCard button")].find(x => /discard|odrzu/i.test(x.textContent)); if (b) b.click(); }); await sleep(400);
  await p.keyboard.press("Escape"); await sleep(300);
  clean(e, "the dialogs");

  /* An editor's text input with a value longer than its box fades behind the caret, on a wrap
     that keeps the border and the fill. */
  e = since();
  await p.evaluate(() => document.querySelector('#list .card [data-act="edit"]').click()); await sleep(900);
  const inpSel = await p.evaluate(() => { const i = document.querySelector('#modalCard .mf input:not([type])'); i.id = i.id || "smokeInp"; return "#" + i.id; });
  await p.click(inpSel); await p.keyboard.down("Control"); await p.keyboard.press("KeyA"); await p.keyboard.up("Control");
  await p.keyboard.type("A title long enough to run past the end of any box on any screen, and then some more words after that", { delay: 3 }); await sleep(450);
  const fade = await p.evaluate(sel => { const i = document.querySelector(sel), w = i.parentElement, cs = getComputedStyle(i), ws = getComputedStyle(w);
    return { wrapped: w.classList.contains("field-wrap"), cut: i.classList.contains("is-cut") && i.classList.contains("cut-l"), masked: (cs.maskImage || cs.webkitMaskImage) !== "none", naked: cs.borderTopWidth === "0px" && cs.backgroundColor === "rgba(0, 0, 0, 0)", wrapBorder: ws.borderTopWidth === "1px" && ws.backgroundColor !== "rgba(0, 0, 0, 0)" }; }, inpSel);
  check(fade.wrapped && fade.cut && fade.masked && fade.naked && fade.wrapBorder, "an editor input fades its long value on a wrap that keeps the chrome (" + JSON.stringify(fade) + ")");
  await p.keyboard.press("Escape"); await sleep(400);
  await p.evaluate(() => { const b = [...document.querySelectorAll("#modalCard button")].find(x => /discard|odrzu/i.test(x.textContent)); if (b) b.click(); }); await sleep(400);
  await p.keyboard.press("Escape"); await sleep(300);
  clean(e, "the editor's fade");

  /* The internal note: an i on the cards that carry one, a callout beside the card with an
     arrow, closed by Escape. Then a dialog input with a long value fades instead of clipping. */
  e = since();
  /* Drive the scroller, and CONVERGE: the column count follows the window, so one scroll aimed
     at a list still settling lands nowhere near the card. Re-read and correct until it holds. */
  const noteBtn = await p.evaluate(() => !!document.querySelector('#list .card [data-act="note"]'));
  for (let i = 0; i < 6; i++) {
    const done = await p.evaluate(() => {
      const b = document.querySelector('#list .card [data-act="note"]');
      if (!b) return true;
      const card = b.closest(".card"), r = card.getBoundingClientRect();
      if (r.top > 60 && r.top < innerHeight - 120) return true;
      const sc = document.getElementById("pageScroll") || document.scrollingElement;
      sc.scrollTop += r.top - 90;
      return false;
    });
    if (done) break;
    await sleep(350);
  }
  await sleep(300);
  /* Hover first, the default: the pointer rests on a noted card and the note opens by itself; the
     i is not shown; leaving the card closes it. */
  const hoverOn = await p.evaluate(() => document.body.classList.contains("note-hover") && matchMedia("(hover:hover)").matches);
  await sleep(700);   // the scroll above is smooth; a rectangle read before it settles points at the wrong card
  /* LOOK FOR THE CARD, do not assume where it is: the column count follows the window and the
     floor, so a fixed offset from the top can land on the sticky separator above it. */
  const hc = await p.evaluate(() => { const c = document.querySelector('#list .card [data-act="note"]').closest(".card"), r = c.getBoundingClientRect();
    const x = r.left + r.width / 2;
    let y = 0, onCard = false;
    for (const dy of [10, 18, 26, 34, r.height / 2]) {
      const u = document.elementFromPoint(x, r.top + dy);
      if (u && u.closest(".card") === c) { y = r.top + dy; onCard = true; break; }
    }
    return { x, y: y || r.top + 10, onCard, btnShown: c.querySelector('[data-act="note"]').offsetWidth > 0 }; });
  await p.mouse.move(hc.x, hc.y); await sleep(600);
  const hovered = await p.evaluate(() => !!document.getElementById("notePane"));
  await p.mouse.move(5, 5); await sleep(300);
  const left = await p.evaluate(() => !document.getElementById("notePane"));
  check(hoverOn && hc.onCard && !hc.btnShown && hovered && left, "with notes on hover the pointer opens the note, the i is hidden, leaving closes it (" + JSON.stringify({ hoverOn, onCard: hc.onCard, hovered, left }) + ")");
  /* Then the switch off: the i returns and opens the note on a click. */
  await p.evaluate(() => { document.body.classList.remove("note-hover"); }); await sleep(100);
  check(await p.evaluate(() => document.querySelector('#list .card [data-act="note"]').offsetWidth > 0), "with the switch off the i is back");
  await p.evaluate(() => document.querySelector('#list .card [data-act="note"]').click()); await sleep(600);
  const np = await p.evaluate(() => { const pane = document.getElementById("notePane"), a = document.querySelector(".note-arrow"), card = document.querySelector('#list .card [data-act="note"]').closest(".card");
    const pr = pane && pane.getBoundingClientRect(), cr = card.getBoundingClientRect();
    const overlap = pr && !(pr.right < cr.left || pr.left > cr.right || pr.bottom < cr.top || pr.top > cr.bottom);
    return { pane: !!pane, title: pane && pane.querySelector("h3").textContent === card.querySelector(".ctitle").textContent, arrow: !!a && !!a.querySelector(".tour-shaft").getAttribute("d"), overlap, opacity: pane && getComputedStyle(pane).opacity, stroke: a && getComputedStyle(a.querySelector(".tour-shaft")).stroke }; });
  check(!!noteBtn && np.pane && np.title && np.arrow && !np.overlap && np.opacity === "1", "the i opens the note callout beside its card, titled and arrowed, clear of the card (" + JSON.stringify({ overlap: np.overlap, stroke: np.stroke }) + ")");
  await p.keyboard.press("Escape"); await sleep(300);
  check(await p.evaluate(() => !document.getElementById("notePane") && !document.querySelector(".note-arrow")), "Escape closes the callout and takes the arrow with it");
  clean(e, "the internal note");

  /* Tabs: add one, then the keys - Tab round the strip with the box's text travelling with its
     tab and focus staying put, slash for the language with nothing typed, Shift+Tab for a new tab -
     then back to where the strip started. */
  e = since();
  const n0 = await p.evaluate(() => document.querySelectorAll(".tab").length);
  await p.evaluate(() => document.querySelector(".tab-add").click()); await sleep(900);
  const n1 = await p.evaluate(() => document.querySelectorAll(".tab").length);
  const onIdx = () => p.evaluate(() => [...document.querySelectorAll(".tab")].findIndex(t => t.classList.contains("on")));
  await p.click("#intent"); await p.keyboard.type("probe", { delay: 20 }); await sleep(600);
  const i0 = await onIdx();
  await p.keyboard.press("Tab"); await sleep(700);
  const i1 = await onIdx();
  const away = await p.evaluate(() => ({ v: document.querySelector("#intent").value, focus: document.activeElement && document.activeElement.id }));
  await p.keyboard.press("Tab"); await sleep(700);
  const i2 = await onIdx();
  const back = await p.evaluate(() => document.querySelector("#intent").value);
  check(i0 === n1 - 1 && i1 === 0 && i2 === i0 && away.v === "" && away.focus === "intent" && back === "probe",
    "Tab steps round the strip (" + i0 + " > " + i1 + " > " + i2 + "), the query travels with its tab and focus stays in the box");
  const l0 = await p.evaluate(() => lang);
  await p.keyboard.press("Slash"); await sleep(500);
  const l1 = await p.evaluate(() => ({ l: lang, v: document.querySelector("#intent").value }));
  await p.keyboard.press("Slash"); await sleep(500);
  const l2 = await p.evaluate(() => lang);
  check(l1.l !== l0 && l2 === l0 && l1.v === "probe", "slash toggles the language from inside the box (" + l0 + " > " + l1.l + " > " + l2 + ") and types nothing");
  await p.keyboard.press("Backquote"); await sleep(500);
  const l3 = await p.evaluate(() => ({ l: lang, v: document.querySelector("#intent").value }));
  await p.keyboard.press("Backquote"); await sleep(500);
  const l4 = await p.evaluate(() => lang);
  const keyRows = await p.evaluate(() => { openSettings("keys"); return new Promise(r => setTimeout(() => { const altN =document.querySelectorAll("#setBody .sc-row .sc-bind.sc-alt").length, fixedN = document.querySelectorAll("#setBody .sc-row .sc-bind.fixed").length, tilde = [...document.querySelectorAll('#setBody .sc-row[data-sc="langToggle"] .sc-bind')].map(b => b.textContent.trim()); dismissModal(); r({ alt: altN, fixed: fixedN, tilde }); }, 400)); });
  check(l3.l !== l0 && l4 === l0 && l3.v === "probe" && keyRows.alt > 10 && keyRows.tilde.join(" ") === "/ ~", "the tilde is the language toggle's alternative, every rebindable row has an alternative slot (" + keyRows.alt + "), fixed rows none (" + keyRows.fixed + " fixed, " + JSON.stringify(keyRows.tilde) + ")");
  await p.keyboard.down("Shift"); await p.keyboard.press("Tab"); await p.keyboard.up("Shift"); await sleep(900);
  const n2 = await p.evaluate(() => document.querySelectorAll(".tab").length);
  await p.evaluate(() => openSettings("keys")); await sleep(600);
  const grab = await p.evaluate(() => {
    const b = document.querySelector('[data-bind="focusPax"][data-slot="1"]');
    if (!b || b.disabled) return null;
    b.click();
    return { armed: !!scCaptureId, before: JSON.stringify(scMap.focusPax) };
  });
  if (grab) {
    await p.keyboard.press("Enter"); await sleep(400);
    const kept = await p.evaluate(() => ({
      after: JSON.stringify(scMap.focusPax),
      still: !!scCaptureId,
      said: (document.getElementById("toast") || {}).textContent || ""
    }));
    check(grab.armed && kept.after === grab.before && kept.still && /fixed/i.test(kept.said),
      "a capture refuses a fixed key and says which (" + JSON.stringify(kept.said.slice(0, 40)) + ")");
    await p.keyboard.press("Escape"); await sleep(300);
  } else check(false, "the shortcuts list offered no capture to arm");
  await p.evaluate(() => dismissModal()); await sleep(500);

  check(n2 === n1 + 1, "Shift+Tab opens a tab (" + n1 + " > " + n2 + ")");
  for (let k = n2; k > n0; k--) {
    await p.evaluate(() => document.querySelectorAll(".tab")[0].click()); await sleep(300);
    await p.evaluate(() => { const tabs = document.querySelectorAll(".tab"); const x = tabs[tabs.length - 1].querySelector(".tab-x"); if (x) x.click(); }); await sleep(700);
  }
  const n3 = await p.evaluate(() => document.querySelectorAll(".tab").length);
  check(n1 === n0 + 1 && n3 === n0, "tabs added, switched away from and closed (" + n0 + " > " + n1 + " > " + n2 + " > " + n3 + ")");

  /* The tab's accent dot, which exists only because drawPills and drawTabs are reassigned at
     load to wrap themselves around syncTabAccent. Nothing else in the file calls syncTabAccent
     at all, and an imported binding is read-only, so a module split cannot keep that wrap - it
     is the one genuine load-time forward reference in the engine. Measured on 2026-09-12 with
     the two wrapping lines deleted: this suite returned 118/118 with no page or console error,
     and the active tab never took data-ec at all.

     So the attribute is read, and read against the engine's own answer rather than against a
     constant: with a category filtered the tab carries that category's slot number, and with
     the filter off it carries nothing. Which pill is which is never assumed - the first pill
     is the one that selects nothing, and an earlier draft of this check failed on the sound
     engine for assuming otherwise. The gradient needs two categories at once and is not
     asserted, because how many a catalog offers is the catalog's business. */
  const accent = await p.evaluate(async () => {
    const tab = () => document.querySelector(".tab.on") || document.querySelector(".tab");
    const ec = () => { const d = tab().dataset.ec; return d === undefined ? null : d; };
    const nCats = () => (typeof cats !== "undefined" && cats) ? cats.length : -1;
    const wait = () => new Promise(r => setTimeout(r, 600));
    const pills = [...document.querySelectorAll("#pills .pill")].filter(x => x.offsetWidth > 0);
    const out = { pills: pills.length, start: ec(), want: null, filtered: null, catsAfter: null, cleared: null };
    for (const pill of pills) { pill.click(); await wait(); if (nCats() > 0) break; }
    if (nCats() <= 0) return out;
    out.want = (typeof catSlot === "function") ? String(catSlot(cats[0])) : null;
    out.filtered = ec();
    for (const pill of pills) { pill.click(); await wait(); if (nCats() === 0) break; }
    out.catsAfter = nCats();
    out.cleared = ec();
    return out;
  });
  check(accent.want !== null && accent.filtered === accent.want
    && accent.catsAfter === 0 && accent.cleared === null,
    "a filtered category paints the tab's accent with its own slot and clearing it takes the accent off ("
    + JSON.stringify(accent) + ")");
  clean(e, "the tab strip");

  /* A tab drag, which nothing drove until 2026-09-13. The strip reorders on pointer events, not
     on HTML5 drag-and-drop, so the real pointer is what drives it here: down on a tab, past the
     five-pixel threshold, then across to three quarters of the way into a tab two along, which is
     past the quarter tabDragCheck asks for. A 120ms swap lock bounds the rate, so one traverse
     moves the tab one place and the assertion is that it lands PAST where it began rather than on
     any particular index.

     THE CONTROL CAME FIRST, and it is what says which of these four checks is worth anything.
     Against an engine whose moveTab returns at its first line - the drop handler dead, everything
     else alive - three of the four still pass: the root class, the .dragging class and the
     release all behave exactly as they do on a healthy engine, because they are the drag's own
     state and have nothing to do with the drop. Only the landing check falls, 0 to 0 of 3. So the
     landing is the check; the other three say the drag began and ended and are worth exactly
     that. Measured 2026-09-13. */
  e = since();
  const tabOrder = () => p.evaluate(() => [...document.querySelectorAll("#tabsBar .tab[data-tid]")].map(x => x.dataset.tid));
  const tabBox = tid => p.evaluate(t => { const el = document.querySelector('#tabsBar .tab[data-tid="' + t + '"]');
    const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, w: r.width }; }, tid);
  await p.evaluate(() => { addTab(); }); await sleep(900);
  await p.evaluate(() => { addTab(); }); await sleep(900);
  const o0 = await tabOrder();
  if (o0.length < 3) check(false, "three tabs to drag among (" + o0.length + ")");
  else {
    const ta = await tabBox(o0[0]), tc = await tabBox(o0[2]);
    await p.mouse.move(ta.x, ta.y);
    await p.mouse.down();
    await p.mouse.move(ta.x + 8, ta.y, { steps: 2 }); await sleep(120);
    const dragOn = await p.evaluate(t => ({ root: document.documentElement.classList.contains("tabdrag"),
      dragging: !!document.querySelector('#tabsBar .tab[data-tid="' + t + '"].dragging') }), o0[0]);
    await p.mouse.move(tc.l + tc.w * 0.75, tc.y, { steps: 12 }); await sleep(300);
    await p.mouse.up(); await sleep(700);
    const o1 = await tabOrder();
    const dragOff = await p.evaluate(t => ({ root: document.documentElement.classList.contains("tabdrag"),
      dragging: !!document.querySelector('#tabsBar .tab[data-tid="' + t + '"].dragging') }), o0[0]);
    check(dragOn.root && dragOn.dragging, "a press and a move put the strip into a drag (" + JSON.stringify(dragOn) + ")");
    check(o1.indexOf(o0[0]) > 0, "and the dragged tab lands past where it began (0 to "
      + o1.indexOf(o0[0]) + " of " + o1.length + ")");
    check(o1.length === o0.length && o1.slice().sort().join() === o0.slice().sort().join(),
      "with the same tabs in the strip (" + o1.length + ")");
    check(!dragOff.root && !dragOff.dragging, "and the release clears the drag (" + JSON.stringify(dragOff) + ")");
  }
  clean(e, "the tab drag");

  /* An empty category: its own icon over the message, the key named, the add button ringed, and
     the supporting flag reaching the editor. The category is made and removed here. */
  e = since();
  /* BOARD 344. The category is made from the pill strip's own + and chosen by clicking its
     pill, rather than by calling the globals ensureCustomCat, cats, drawPills and render.
     pills-bar.js:158 is the only line in src/ that reaches hooks.ensureCustomCat, and the
     global call left that route dead while every check below passed. The inline field returns
     no key, so the key is read as the data-k the strip did not carry a moment earlier. */
  const kBefore = await p.evaluate(() => [...document.querySelectorAll("#pills .pill[data-k]")].map(x => x.dataset.k));
  await p.evaluate(() => { const a = document.querySelector("#pills .pill-add"); if (a) a.click(); });
  await sleep(400);
  await p.evaluate(() => { const i = document.querySelector("#pills .pill-new input"); if (i) i.focus(); });
  await p.keyboard.type("Smoke shelf", { delay: 10 });
  await p.keyboard.press("Enter"); await sleep(1000);
  const emptyCat = await p.evaluate(before => {
    const now = [...document.querySelectorAll("#pills .pill[data-k]")].map(x => x.dataset.k);
    return now.find(k => before.indexOf(k) < 0) || null;
  }, kBefore);
  check(!!emptyCat, "the pill strip's own + adds a category (" + JSON.stringify(emptyCat) + ")");
  await p.evaluate(k => { const b = k && document.querySelector('#pills .pill[data-k="' + CSS.escape(k) + '"]'); if (b) b.click(); }, emptyCat);
  await sleep(900);
  const es = await p.evaluate(() => { const el = document.querySelector("#list .empty"), fab = document.getElementById("addCardFab");
    return { text: (el && el.textContent || "").replace(/\s+/g, " ").trim(), icon: !!(el && el.querySelector("svg.empty-ic")), before: el && getComputedStyle(el, "::before").content,
             key: el && [...el.querySelectorAll("kbd")].map(k => k.textContent).join("+"), nudge: fab.classList.contains("nudge"), ring: getComputedStyle(fab, "::after").animationName }; });
  check(es.icon && es.before === "none" && /empty/i.test(es.text) && es.key === "Alt+N" && es.nudge && es.ring === "fabNudge",
    "an empty category shows its own icon, names the key and rings the add button (" + JSON.stringify({ key: es.key, icon: es.icon, nudge: es.nudge }) + ")");
  const shut = await p.evaluate(() => !document.getElementById("modalCard").offsetParent);
  await p.keyboard.down("Alt"); await p.keyboard.press("KeyN"); await p.keyboard.up("Alt"); await sleep(700);
  const editorUp = await p.evaluate(() => { const m = document.getElementById("modalCard"); return { on: !!(m && m.offsetParent), title: m ? m.textContent.slice(0, 40) : "" }; });
  await p.keyboard.press("Escape"); await sleep(500);
  check(shut && editorUp.on, "Alt+N opens the card editor (" + JSON.stringify(editorUp.title.trim().slice(0, 20)) + ")");
  /* BOARD 344: the pencil inside the pill, not the global. pills-bar.js:82 is the only route
     in src/ to hooks.openCategoryEditor; clicking the pencil bubbles to the pill's own
     handler with the pencil as the target, which is what a Ctrl-held click lands on. */
  const pencil = await p.evaluate(k => { const b = k && document.querySelector('#pills .pill[data-k="' + CSS.escape(k) + '"] [data-editcat]');
    if (!b) return false; b.click(); return true; }, emptyCat);
  await sleep(900);
  const sup = await p.evaluate(k => { const c = document.getElementById("ceAlways"); if (!c) return { present: false };
    const was = isAlwaysCat(k);   // read BEFORE the save, or the check asserts nothing
    c.click(); const lit = c.classList.contains("on"); document.getElementById("ceSave").click();
    return { present: true, was, lit }; }, emptyCat);
  await sleep(700);
  check(pencil && sup.present && !sup.was && sup.lit && await p.evaluate(k => isAlwaysCat(k), emptyCat), "the pill's pencil opens the category editor, and its asterisk lights and saves");
  const round = await p.evaluate(() => {
    const m = cards.find(c => /\{GREET\}/.test(c.en || "") && /\{GREET\}/.test(c.pl || "")) || cards[0];
    const en = fill("{GREET}", m, 0, "en"), pl = fill("{GREET}", m, 0, "pl");
    const c = { format: 2, kind: "etiuda-catalog", id: "round-trip", name: "Round trip", rev: 1,
      langs: [{ code: "en", label: "EN" }, { code: "pl", label: "PL" }],
      tags: [{ id: "t-open", kind: "shelf", label: { en: "Open" } },
             { id: "t-r0", kind: "request", clause: { en: "one", pl: "jeden" } }],
      cards: [{ id: "c-open-english-only", shelf: "t-open", bodyShape: "plain",
                title: { en: "English only" }, body: { en: "Hello there." } }] };
    let imported = null;
    try { imported = (parseCatalogFile("window.E_CATALOG=" + JSON.stringify(c) + ";").cards || []).length; }
    catch (e) { imported = "threw: " + (e.message || e); }
    return { en, pl, imported };
  });
  check(round.en !== round.pl && !!round.en && !!round.pl, "a token fills in the language it is handed, not the one on screen (" + JSON.stringify([round.en, round.pl]) + ")");
  check(round.imported === 1, "a card with no Polish imports (" + JSON.stringify(round.imported) + ")");

  /* {Z} IS POLISH GRAMMAR AND NOTHING ELSE, board 649. The token alternates z and ze by what
     follows it, which is agreement in one language; it was applied with no language test at all,
     so an English card carrying it already rendered a Polish preposition. The engine's own rule
     for a language it has no grammar for is to do nothing, explicitly and visibly - the doctrine
     written beside {DAYPART}: the engine supplies the decision and the catalog every word.
     Driven rather than sliced: this calls the page's own fill() with the language handed in, so
     what is measured is the module the app is running and not a copy of its source. */
  const zTok = await p.evaluate(() => {
    const m = cards[0];
    return { en: fill("{Z} {INTENT}", m, 0, "en").trim(),
             pl: fill("{Z} {INTENT}", m, 0, "pl").trim() };
  });
  check(/^(z|ze)\b/.test(zTok.pl), "{Z} still governs the Polish clause ("
    + JSON.stringify(zTok.pl) + ")");
  check(!/^(z|ze)\b/.test(zTok.en), "{Z} gives a card that is not Polish no Polish preposition ("
    + JSON.stringify(zTok.en) + ")");

  /* The export, driven from the Manage button a person would use.

     Until 2026-09-13 the quick-facts rule was read off currentCatalog(), a name catalog-file.js
     exported for this check and for nothing else, which asserted the builder's opinion of what
     it would write. The rule is a property of the FILE, so the file is what this reads, and on
     the way it walks the one path nothing else in the suite touches: Manage, the export button,
     the name dialog, the header, the save route.

     The two save routes are stubbed at the PLATFORM boundary and neither of them is the
     engine's. Chrome on file:// does have showSaveFilePicker and saveCatalogFile takes that
     branch; measured without the stub, the picker never settles, no blob is ever made and the
     export simply hangs, which is what a save dialog nobody can click looks like. Firefox has
     no picker and falls to the anchor-and-blob path. Both are captured, so whichever route the
     browser under test takes, the bytes are read; and both are put back afterwards.

     COUNTS AND VERDICTS ONLY. What comes back is the catalog, so what is printed is a byte
     count, a card count, the type and length of one field, and whether it equals the built-in. */
  e = since();
  await p.evaluate(() => {
    window.__pbSaved = [];
    window.__pbRealBlobUrl = URL.createObjectURL.bind(URL);
    window.__pbRealPicker = window.showSaveFilePicker;
    URL.createObjectURL = b => { window.__pbSaved.push(b); return window.__pbRealBlobUrl(b); };
    window.showSaveFilePicker = o => Promise.resolve({ name: (o && o.suggestedName) || "catalog",
      createWritable: () => Promise.resolve({
        write: t => { window.__pbSaved.push(new Blob([t])); return Promise.resolve(); },
        close: () => Promise.resolve() }) });
  });
  const saveCatalog = async () => {
    const before = await p.evaluate(() => window.__pbSaved.length);
    await p.evaluate(() => document.querySelector('[data-act="manage"]').click()); await sleep(800);
    const btn = await p.evaluate(() => { const x = document.getElementById("mgExportCatalog");
      if (!x) return false; x.click(); return true; }); await sleep(700);
    /* The edition field is READ before the dialog is answered, and answered with whatever it
       proposed: that value is what the file below must carry, so the proposal and the stamp are
       the same measurement rather than two. */
    const named = await p.evaluate(() => { const i = document.getElementById("eNameInp"), y = document.getElementById("eNameYes");
      if (!i || !y) return false; i.value = "Smoke"; i.dispatchEvent(new Event("input"));
      const ed = document.getElementById("eEdInp");
      window.__pbEdition = ed ? ed.value : null;
      y.click(); return true; });
    await sleep(1600);
    const out = await p.evaluate(async n => {
      /* Named zeroes rather than an absent field: this is the branch a dead export button
         lands on, and a FAIL line reading "undefined bytes" says less than "0 bytes". */
      if (window.__pbSaved.length <= n)
        return { saved: 0, bytes: 0, cards: -1, factsType: "none", factsLen: -1, builtIn: false };
      const text = await window.__pbSaved[window.__pbSaved.length - 1].text();
      const WRAP = "window.E_CATALOG = ";
      const at = text.indexOf(WRAP);
      let facts = null, cards = -1, date = null, rev = null;
      try { const o = JSON.parse(text.slice(at + WRAP.length, text.lastIndexOf(";")));
            facts = o.facts; cards = (o.cards || []).length;
            date = o.date == null ? null : String(o.date); rev = o.rev == null ? null : +o.rev;
      } catch (err) { facts = null; cards = -2; }
      return { saved: window.__pbSaved.length - n, bytes: text.length, cards, date, rev,
               factsType: typeof facts, factsLen: typeof facts === "string" ? facts.length : -1,
               builtIn: typeof FACTS === "string" && facts === FACTS };
    }, before);
    await p.keyboard.press("Escape"); await sleep(400);
    await p.keyboard.press("Escape"); await sleep(400);
    const proposed = await p.evaluate(() => window.__pbEdition);
    return Object.assign({ btn, named, proposed }, out);
  };
  await p.evaluate(() => { window.__pbFactsKeep = pack.facts; pack.facts = ""; });
  const blankFile = await saveCatalog();
  await p.evaluate(() => { pack.facts = null; });
  const unsetFile = await saveCatalog();
  await p.evaluate(() => { pack.facts = window.__pbFactsKeep;
    URL.createObjectURL = window.__pbRealBlobUrl; window.showSaveFilePicker = window.__pbRealPicker; });
  check(blankFile.btn && blankFile.named && blankFile.saved === 1 && blankFile.cards > 0,
    "Manage > Export catalog names the file and writes it: " + blankFile.bytes + " bytes, "
    + blankFile.cards + " cards");
  check(blankFile.factsType === "string" && blankFile.factsLen === 0,
    "an emptied quick-facts exports empty (" + blankFile.factsType + ", " + blankFile.factsLen + " chars)");
  check(unsetFile.saved === 1 && unsetFile.builtIn && unsetFile.factsLen > 0,
    "and an unwritten one exports the built-in (" + unsetFile.factsLen + " chars, equal to FACTS: "
    + unsetFile.builtIn + ")");

  /* BOARD 406. Exporting is how a desk without Studio publishes, so the file that leaves carries
     a new edition and the next counter rather than a second copy of what arrived. Read against
     the catalog THIS page has loaded, so the arithmetic is checked rather than a constant. */
  const was = await p.evaluate(() => { const c = storedCatalog() || {};
    return { date: c.version == null ? null : String(c.version), rev: c.rev == null ? null : +c.rev }; });
  const today = (() => { const d = new Date(), q = v => String(v).padStart(2, "0");
    return d.getFullYear() + "-" + q(d.getMonth() + 1) + "-" + q(d.getDate()); })();
  check(/^[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]*$/.test(blankFile.proposed || "")
        && blankFile.date === blankFile.proposed
        && blankFile.proposed.indexOf(today) === 0,
    "the export dialog proposes an edition in the one orderable form and the file carries exactly"
    + " it: proposed " + JSON.stringify(blankFile.proposed) + ", written "
    + JSON.stringify(blankFile.date) + ", against this process's today " + JSON.stringify(today)
    + " and the loaded catalog's " + JSON.stringify(was.date));
  check(was.rev !== null && blankFile.rev === was.rev + 1 && unsetFile.rev === was.rev + 1,
    "and the edition counter moves with it, so a desk watching the folder reads an update rather"
    + " than a stranger: loaded rev " + was.rev + ", exported " + blankFile.rev
    + " (and " + unsetFile.rev + " on the second export, each being one past what is loaded)");

  /* The refusal, driven at the dialog: a value outside the dated form is not evidence of age to
     any reader, so it is caught here rather than becoming an undated catalog at the next desk. */
  const refused = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-act="manage"]').click(); await wait(800);
    document.getElementById("mgExportCatalog").click(); await wait(700);
    const ed = document.getElementById("eEdInp"), y = document.getElementById("eNameYes");
    if (!ed || !y) return { step: "no dialog" };
    ed.value = "spring release"; ed.dispatchEvent(new Event("input"));
    y.click(); await wait(500);
    const say = document.getElementById("eEdSay");
    const open = !!document.getElementById("eNameModal");
    const shown = !!say && !say.hidden, marked = ed.classList.contains("is-missing");
    const words = say ? say.textContent : "";
    /* And the same field put back inside the form is taken, even though it orders BEFORE the
       catalog loaded here: inside the form the author's value is the author's call. */
    ed.value = "2020-01-01"; ed.dispatchEvent(new Event("input"));
    const cleared = !!say && say.hidden;
    y.click(); await wait(500);
    return { step: "read", open, shown, marked, words, cleared,
             closed: !document.getElementById("eNameModal") };
  });
  await p.keyboard.press("Escape"); await sleep(400);
  await p.keyboard.press("Escape"); await sleep(400);
  check(refused.step === "read" && refused.open && refused.shown && refused.marked
        && refused.words.indexOf("2026-09-15") > -1 && refused.cleared && refused.closed,
    "an edition outside the dated form is refused at the dialog, which stays open, marks the box"
    + " and says the form (" + JSON.stringify(refused.words) + "); a value back inside it is"
    + " taken even where it orders before the loaded one: " + JSON.stringify(refused));
  clean(e, "the catalog export");

  const tip = await p.evaluate(k => {
    openCategoryEditor(k);
    const c = document.getElementById("ceAlways");
    const one = c.title; c.click();
    return { one, two: c.title };
  }, emptyCat); await sleep(500);
  check(!!tip.one && !!tip.two && tip.one !== tip.two, "the asterisk's tooltip follows the flag");
  await p.keyboard.press("Escape"); await sleep(400);

  /* A CATALOG category, not the one made above: only a category the catalog declared has a
     version to go back to, which is what Reset means here. */
  const baseCat = await p.evaluate(() => Object.keys(BASE_CATS)[0] || null);
  if (baseCat) {
    const roll = await p.evaluate(k => {
      const declared = CATALOG_ROLES.always.indexOf(k) > -1;
      openCategoryEditor(k);
      document.getElementById("ceAlways").click();
      document.getElementById("ceSave").click();
      return { declared, flipped: isAlwaysCat(k) };
    }, baseCat); await sleep(700);
    const back = await p.evaluate(k => {
      openCategoryEditor(k);
      const r = document.getElementById("ceReset");
      const offered = !!r && !r.disabled;
      if (offered) r.click();
      return { offered, role: !!((pack.catRoles || {})[k]), now: isAlwaysCat(k) };
    }, baseCat); await sleep(700);
    check(roll.flipped === !roll.declared && back.offered && !back.role && back.now === roll.declared,
      "Reset offers itself for the flag alone and puts the catalog's back (" + JSON.stringify({ declared: roll.declared, offered: back.offered, now: back.now }) + ")");
    await p.keyboard.press("Escape"); await sleep(400);
  } else check(false, "no catalog category to test Reset against");

  await p.evaluate(k => { removeCategory(k); cats = []; rebuildCards(); drawPills(); render(); }, emptyCat); await sleep(600);
  clean(e, "the empty category");

  /* The star, the hide and the removal - the three things a person does to a card that change
     what is on the desk, and until 2026-09-13 nothing in this file pressed any of them. The
     static suite has ordering tests, but tests/test.js supplies its OWN isFavourite over its own
     Set (see the note at its [5/5]), so what it proves is the comparator, not the app's state.

     Read from the screen throughout: aria-pressed and the classes on the star's own button, the
     card's index in #list, and the list's length. Nothing here reads pack, isFavourite or any
     other module name.

     It goes last of the blocks that share this context because the removal is the one thing in
     the file that cannot be undone: a removed catalog card is gone for the rest of the session.
     Everything above has finished with its counts, the created category is gone and cats is
     empty, so the list is whole. Controls, 2026-09-13, each against a rebuilt engine: with
     toggleFavourite returning at its first line the three star checks fail and the other five
     pass; with hideCard and removeCard returning likewise, the four below fail and the three
     above pass. */
  e = since();
  await p.keyboard.press("Escape"); await sleep(300);
  const pick = await p.evaluate(() => { const cs = [...document.querySelectorAll("#list .card")];
    const c = cs[Math.min(40, cs.length - 1)];
    return { id: c ? c.getAttribute("data-id") : null, n: cs.length }; });
  const readStar = id => p.evaluate(i => { const c = document.querySelector('#list .card[data-id="' + CSS.escape(i) + '"]');
    const b = c && c.querySelector('[data-act="fav"]');
    const cs = [...document.querySelectorAll("#list .card")];
    return { present: !!c, pressed: b && b.getAttribute("aria-pressed"), on: !!(b && b.classList.contains("on")),
      fill: !!(b && b.querySelector("svg.ic-fill")), idx: c ? cs.indexOf(c) : -1, n: cs.length }; }, id);
  const press = (id, act) => p.evaluate((i, a) => document.querySelector('#list .card[data-id="' + CSS.escape(i) + '"] [data-act="' + a + '"]').click(), id, act);
  const s0 = await readStar(pick.id);
  await press(pick.id, "fav"); await sleep(1200);
  const s1 = await readStar(pick.id);
  await press(pick.id, "fav"); await sleep(1200);
  const s2 = await readStar(pick.id);
  check(s0.pressed === "false" && s1.pressed === "true" && s2.pressed === "false",
    "a star reports itself pressed and unpressed (" + s0.pressed + " to " + s1.pressed + " to " + s2.pressed + ")");
  check(!s0.on && s1.on && s1.fill && !s2.on && !s2.fill, "and fills and empties its own icon");
  check(s0.idx > 0 && s1.idx === 0 && s2.idx === s0.idx,
    "and carries the card to the head of the list and back (" + s0.idx + " to " + s1.idx + " to " + s2.idx + ")");
  const h0 = await readStar(pick.id);
  await press(pick.id, "hide"); await sleep(1200);
  const h1 = await readStar(pick.id);
  check(h0.present && !h1.present && h1.n === h0.n - 1,
    "a hide takes the card off the desk (" + h0.n + " cards to " + h1.n + ")");
  /* Back through the Library, the only way back. Not the show-all button beside it: that one is
     a bulk unhide and would also raise cards the catalog itself put away. */
  const unhid = await p.evaluate(async i => {
    document.querySelector('[data-act="manage"]').click(); await new Promise(r => setTimeout(r, 900));
    const b = document.querySelector('#modalCard [data-show-card="' + CSS.escape(i) + '"]');
    if (!b) { dismissModal(); return { found: false }; }
    b.click(); await new Promise(r => setTimeout(r, 900));
    dismissModal(); await new Promise(r => setTimeout(r, 500));
    return { found: true }; }, pick.id);
  const h2 = await readStar(pick.id);
  check(unhid.found && h2.present && h2.n === h0.n, "and the Library puts it back (" + h2.n + " cards)");
  const r0 = await readStar(pick.id);
  const rm = await p.evaluate(async i => {
    document.querySelector('[data-act="manage"]').click(); await new Promise(r => setTimeout(r, 900));
    const b = document.querySelector('#modalCard [data-remove-card="' + CSS.escape(i) + '"]');
    if (!b) { dismissModal(); return { found: false }; }
    b.click(); await new Promise(r => setTimeout(r, 1200));
    const still = !!document.querySelector('#modalCard [data-remove-card="' + CSS.escape(i) + '"]');
    dismissModal(); await new Promise(r => setTimeout(r, 500));
    return { found: true, still }; }, pick.id);
  const r1 = await readStar(pick.id);
  check(rm.found && !rm.still, "a removal takes the card out of the Library too");
  check(r0.present && !r1.present && r1.n === r0.n - 1,
    "and off the desk (" + r0.n + " cards to " + r1.n + ")");
  clean(e, "the star, the hide and the removal");

  /* BOARD 344. THE ROUTES THE DRIVES ABOVE WALKED AROUND.

     Every slot in src/modules/hooks.js that the run below reaches is reachable from exactly one
     place in src/, and until this block the acceptance run reached the FEATURE by another door
     and left the valve's own route dead: measured 2026-09-14 by tools/split-guard/hooks-coverage.mjs,
     38 of 54 slots called, and startTour, endTour, openIntentEditor, setIntentHidden,
     toggleIntentFavourite, railDecorate, listEntryEls, mgCardsIn and capturePills were among the
     16 that were not. A route nothing drives can be deleted or broken and every gate in this
     repository stays green.

     Each drive here carries an assertion. A drive with no assertion raises the coverage number
     and proves nothing, which is exactly the shape this file exists to refuse.

     It sits last among the blocks that share this browser context because it stars an intent,
     hides another, reorders the categories and resizes the window, and nothing below reads any
     of those. The window is put back at the foot. */
  e = since();
  await p.keyboard.press("Escape"); await sleep(300);

  /* "+ Intent" at the foot of the panel, rail-list.js:488. The other route to
     hooks.openIntentEditor is a Ctrl-held click on a row's star, driven a few lines below. */
  const ieShut = await p.evaluate(() => !document.getElementById("modalCard").offsetParent);
  await p.evaluate(() => { const a = document.getElementById("railAddIntent"); if (a) a.click(); });
  await sleep(900);
  const ieUp = await p.evaluate(() => !!document.getElementById("modalCard").offsetParent);
  await p.keyboard.press("Escape"); await sleep(500);
  check(ieShut && ieUp, "the panel's own + opens the intent editor (" + ieShut + " to " + ieUp + ")");

  /* The rail row's star, plain and with Shift held. rail-list.js:632 reads the modifier off the
     click and swaps which slot of the row acts, so one element carries three actions; the edit
     and hide glyphs are display:none until the modifier is down, which is why the handler is
     asked for them rather than the pointer aiming at them. A real mouse with a real modifier,
     because e.shiftKey is what the branch reads. */
  const railStar = () => p.evaluate(() => {
    const row = document.querySelector("#intentRailList .rail-item:not(.on)");
    const b = row && row.querySelector("[data-fav-intent],[data-show-intent]");
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { id: b.getAttribute("data-fav-intent") || b.getAttribute("data-show-intent"),
      pressed: b.getAttribute("aria-pressed"), shown: !!b.getAttribute("data-show-intent"),
      x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  /* Scrolled into view before its box is read: hiding a row drops it to the foot of the panel's
     own scroller, and a box read without this is the box of a row that is not on screen, so the
     pointer lands on whatever is. Measured 2026-09-14 - without the scroll the way back was
     never pressed and the row stayed hidden. behavior is auto, so the rect below is the settled
     one and needs no wait. */
  const starAt = id => p.evaluate(i => { const b = document.querySelector('[data-fav-intent="' + CSS.escape(i) + '"],[data-show-intent="' + CSS.escape(i) + '"]');
    if (!b) return null;
    const row = b.closest(".rail-item") || b;
    row.scrollIntoView({ block: "center" });
    const r = b.getBoundingClientRect();
    return { pressed: b.getAttribute("aria-pressed"), shown: b.hasAttribute("data-show-intent"),
      x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }, id);
  const st0 = await railStar();
  if (!st0) check(false, "no plain rail row to drive the row's own slots from");
  else {
    await p.mouse.move(st0.x, st0.y); await sleep(200);
    await p.mouse.click(st0.x, st0.y); await sleep(1000);
    const st1 = await starAt(st0.id);
    await p.mouse.move(st1.x, st1.y); await sleep(200);
    await p.mouse.click(st1.x, st1.y); await sleep(1000);
    const st2 = await starAt(st0.id);
    check(st0.pressed === "false" && st1 && st1.pressed === "true" && st2 && st2.pressed === "false",
      "a rail row's own star reports itself pressed and unpressed (" + st0.pressed + " to "
      + (st1 && st1.pressed) + " to " + (st2 && st2.pressed) + ")");
    /* Shift turns the same click into the hide slot, and the hidden row then offers one thing
       only - "show again" - which is the second call of the same hook with the flag false. */
    const hs0 = await starAt(st0.id);
    await p.mouse.move(hs0.x, hs0.y); await sleep(200);
    await p.keyboard.down("Shift"); await sleep(150);
    await p.mouse.click(hs0.x, hs0.y);
    await p.keyboard.up("Shift"); await sleep(1000);
    const hs1 = await starAt(st0.id);
    if (hs1) { await p.mouse.move(hs1.x, hs1.y); await sleep(200); await p.mouse.click(hs1.x, hs1.y); await sleep(1000); }
    const hs2 = await starAt(st0.id);
    check(!hs0.shown && hs1 && hs1.shown && hs2 && !hs2.shown,
      "and Shift on the same click hides the intent, which then offers only its way back ("
      + JSON.stringify([hs0.shown, hs1 && hs1.shown, hs2 && hs2.shown]) + ")");
  }

  /* A COPYABLE BLOCK IS PRESSED, which until now nothing in this file had ever done - the one
     action the whole engine exists for. A grep for the text-block class over this file before
     2026-09-14 returned nothing but two fixture copies. mark.js:33 routes every copy, keyboard or pointer,
     through hooks.railDecorate, so the app's commonest action was also an undriven valve route.

     The clipboard itself is out of reach here: engine/etiuda.html is loaded over file://, so
     isSecureContext is false, navigator.clipboard is absent and copy() falls to the textarea
     and execCommand. So what is read back is the screen - the selection ring the click puts on
     that block and no other - and the claim is that the copy route ran, not that the bytes
     landed on a clipboard this driver cannot open. */
  const marked = () => p.evaluate(() => { const els = [...document.querySelectorAll("#list .txt.sel")];
    const cards = [...document.querySelectorAll("#list .card[data-id]")];
    const el = els[0], c = el && el.closest(".card[data-id]");
    return { n: els.length, idx: c ? cards.indexOf(c) : -1, v: el ? el.dataset.v : null, cards: cards.length }; });
  const firstTxt = await p.evaluate(() => { const el = document.querySelector("#list .card[data-id] .txt[data-v]");
    if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + Math.min(40, r.width / 2)), y: Math.round(r.top + r.height / 2) }; });
  if (!firstTxt) check(false, "no copyable block on the desk to press");
  else {
    await p.mouse.click(firstTxt.x, firstTxt.y); await sleep(900);
    const cp = await marked();
    check(cp.n === 1 && cp.idx === 0, "pressing a copyable block rings that block and no other ("
      + cp.n + " ringed, card " + cp.idx + " of " + cp.cards + ")");
    /* And the keyboard mark, which is the other half of mark.js: Shift+Down and Shift+Up run
       markEnd, the only caller of hooks.listEntryEls in src/. Fixed by the press above: the
       mark is on the first block, so Down must reach the foot and Up must come back. */
    await p.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    await p.keyboard.down("Shift"); await p.keyboard.press("ArrowDown"); await p.keyboard.up("Shift"); await sleep(900);
    const mk1 = await marked();
    await p.keyboard.down("Shift"); await p.keyboard.press("ArrowUp"); await p.keyboard.up("Shift"); await sleep(900);
    const mk2 = await marked();
    check(mk1.idx === mk1.cards - 1 && mk2.idx === 0 && mk1.n === 1 && mk2.n === 1,
      "and Shift+Down carries the mark to the foot of the list and Shift+Up to its head ("
      + mk1.idx + " then " + mk2.idx + " of " + mk1.cards + ")");
  }

  /* The full editor opened from the Library, card-editor.js:584. From the main screen the
     card-to-card arrows walk what is on screen; from the Library they walk that ONE category,
     and hooks.mgCardsIn is what supplies that list. What is read back is the pair of arrows at
     the list's edge: opened on the first card of a category holding two or more, Back must be
     dead and Next must not. */
  const mgNav = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-act="manage"]').click(); await wait(1000);
    const cat = [...document.querySelectorAll("#modalCard .mg-cat")].find(c => c.querySelectorAll("[data-edit-card]").length >= 2);
    if (!cat) { dismissModal(); return { found: false }; }
    const tw = cat.querySelector("[data-toggle]");
    if (tw && tw.getAttribute("aria-expanded") !== "true") { tw.click(); await wait(600); }
    const btns = [...cat.querySelectorAll("[data-edit-card]")];
    btns[0].click(); await wait(1000);
    const prev = document.getElementById("edPrev"), next = document.getElementById("edNext");
    return { found: true, n: btns.length, up: !!document.getElementById("modalCard").offsetParent,
      prev: prev ? prev.disabled : null, next: next ? next.disabled : null };
  });
  await p.keyboard.press("Escape"); await sleep(500);
  await p.keyboard.press("Escape"); await sleep(500);
  check(mgNav.found && mgNav.up && mgNav.prev === true && mgNav.next === false,
    "the Library's edit opens the card editor walking that category alone (" + JSON.stringify(mgNav) + ")");

  /* The pill strip reordered by hand, and put back by the double-click its own tooltip names.
     Both go through paint.js:109 animateReorder, the only caller of hooks.capturePills: the
     drag reaches it from movePill inside the pointermove swap, the double-click from
     pills-bar.js:117. The shape is the tab drag's, for the same reason - the strip reorders on
     pointer events, so a real pointer is what drives it. */
  const pillOrder = () => p.evaluate(() => [...document.querySelectorAll("#pills .pill[data-k]")].map(x => x.dataset.k).filter(k => k));
  const pillBox = k => p.evaluate(i => { const el = document.querySelector('#pills .pill[data-k="' + CSS.escape(i) + '"]');
    if (!el) return null; const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), l: r.left, w: r.width }; }, k);
  const po0 = await pillOrder();
  const dragPill = async (fromK, toK) => {
    const a = await pillBox(fromK), c = await pillBox(toK);
    if (!a || !c) return null;
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    await p.mouse.move(a.x + 8, a.y, { steps: 2 }); await sleep(120);
    await p.mouse.move(Math.round(c.l + c.w * 0.75), c.y, { steps: 12 }); await sleep(400);
    await p.mouse.up(); await sleep(900);
    return pillOrder();
  };
  if (po0.length < 5) check(false, "five categories to drag among (" + po0.length + ")");
  else {
    /* TWO PRESSES, NOT ONE PRESS CARRYING A COUNT. p.mouse.click(x, y, {clickCount: 2}) sends a
       single press and release whose count is two, and Chrome raises no dblclick for it at all:
       measured 2026-09-14 with a listener counting the event, 0 fired over two attempts, the
       handler present the whole time, and the order unchanged after each. The whole "reset"
       leg was driving nothing and would have passed on an engine that had no reset. A real
       first click followed by a second raises it, 1 fired, and the order moves. */
    const resetPills = async () => {
      const box = await p.evaluate(() => { const el = document.querySelector("#pills .pill"); const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
      await p.mouse.move(box.x, box.y);
      await p.mouse.down({ clickCount: 1 }); await p.mouse.up({ clickCount: 1 });
      await p.mouse.down({ clickCount: 2 }); await p.mouse.up({ clickCount: 2 });
      await sleep(1400);
      return pillOrder();
    };
    const d1 = await dragPill(po0[0], po0[2]);
    check(d1 && d1.indexOf(po0[0]) > 0 && d1.length === po0.length
      && d1.slice().sort().join() === po0.slice().sort().join(),
      "a category pill dragged along the strip lands past where it began (0 to " + (d1 && d1.indexOf(po0[0])) + ")");
    /* WHAT IS ASSERTED IS CONVERGENCE, not "the order changed". The reset goes to the catalog's
       own declared order, and a single drag can land on that order by accident - one pill moved
       one place from the head does exactly that here - so "the double-click changed something"
       reads false on a perfectly healthy engine. Two different hand-made orders reset to the
       same place is the property the control actually has: a reset that did nothing fails it,
       because the two hand-made orders differ, and one that shuffled fails it too. */
    const r1 = await resetPills();
    const d2 = await dragPill(po0[1], po0[4]);
    const r2 = await resetPills();
    check(d1 && d2 && d1.join() !== d2.join() && r1.join() === r2.join()
      && r1.slice().sort().join() === po0.slice().sort().join(),
      "and a double-click on All resets two different hand-made orders to the same one ("
      + (d1 && d2 && d1.join() !== d2.join()) + " apart, " + (r1.join() === r2.join()) + " together)");
  }

  /* The header shed, tabs.js:643 and :746. The wordmark leaves the band when the tab strip runs
     out of room, and hooks.shedHolding and hooks.shedAnimate are called only on the frame the
     strip CROSSES that threshold - which is why a run that never narrows the window with tabs
     open never touched either. The window is what a person changes, so the window is what
     changes here; body.strip-tight is the flag the crossing sets, read on the screen.

     420px, and the width is measured rather than picked. The tools left the band for the second
     row, so the strip's reservoir grew by about 216px and the crossing moved with it: with the
     three tabs this block inherits it is loose at 460 and tight at 430, so 420 sits clear of the
     edge on the side that must flip and 1500 is clear of it on the side that must flip back.
     Re-measured by walking 1500, 900, 800, 760, 700, 640, 600, 560, 520, 500, 460, 430, 400 and
     390 with three tabs open. */
  const tight = () => p.evaluate(() => document.body.classList.contains("strip-tight"));
  const tg0 = await tight();
  await sized(p, 420, 950, "the tab strip going tight", 1400);
  const tg1 = await tight();
  await sized(p, 1500, 950, "the tab strip coming back", 1400);
  const tg2 = await tight();
  check(!tg0 && tg1 && !tg2, "narrowing the window with tabs open sheds the wordmark and widening it brings it back ("
    + JSON.stringify([tg0, tg1, tg2]) + ")");
  clean(e, "the routes through the valve");

  /* BOARD 411: THE MENU FROM THE KEYBOARD. Enter was the copy key and Space an ordinary
     character typed into the search box, so both were taken before the browser could act on the
     control the keyboard had just walked to, and the Menu could be reached with Tab and not
     opened. EVERY PRESS HERE IS A REAL ONE through the protocol: a synthesised el.click() says
     nothing about what a key does, which is the whole subject. */
  e = since();
  const menuOpen = () => p.evaluate(() => {
    const m = document.getElementById("settingsMenu");
    return !!m && !m.hidden;
  });
  const menuShut = async () => {
    await p.evaluate(() => { closeSettingsMenu(); });
    await sleep(250);
  };
  await menuShut();
  await p.evaluate(() => document.getElementById("settingsBtn").focus());
  await p.keyboard.press("Enter"); await sleep(450);
  const byEnter = await menuOpen();
  await menuShut();
  await p.evaluate(() => document.getElementById("settingsBtn").focus());
  await p.keyboard.press("Space"); await sleep(450);
  const bySpace = await menuOpen();
  await menuShut();
  check(byEnter && bySpace,
    "411 Enter and Space act on the Menu button the keyboard is on, instead of copying a card"
    + " and typing a space into the search box (Enter " + byEnter + ", Space " + bySpace + ")");
  /* From the search box, which is where the caret spends the day and where a menu key has to
     work or it is not a menu key. */
  await p.evaluate(() => document.getElementById("intent").focus());
  await p.keyboard.press("F10"); await sleep(450);
  const byF10 = await menuOpen();
  await menuShut();
  await p.evaluate(() => document.body.click());
  await p.keyboard.press("F10"); await sleep(450);
  const byF10Anywhere = await menuOpen();
  await menuShut();
  check(byF10 && byF10Anywhere,
    "411b F10 opens the Menu from the search box and with nothing focused (" + byF10 + ", "
    + byF10Anywhere + ")");
  /* THE CONTROL. Only those two keys moved: an ordinary printable one still leaves a focused
     button and lands in the search box, which is the behaviour the two are carved out of. */
  await p.evaluate(() => { const i = document.getElementById("intent"); i.value = "";
    i.dispatchEvent(new Event("input", { bubbles: true })); });
  await sleep(400);
  await p.evaluate(() => document.getElementById("settingsBtn").focus());
  await p.keyboard.press("z"); await sleep(500);
  const sunk = await p.evaluate(() => ({
    v: document.getElementById("intent").value,
    focused: document.activeElement ? document.activeElement.id : null,
    open: !document.getElementById("settingsMenu").hidden }));
  await p.evaluate(() => { const i = document.getElementById("intent"); i.value = "";
    i.dispatchEvent(new Event("input", { bubbles: true })); });
  await sleep(600);
  check(sunk.v === "z" && sunk.focused === "intent" && !sunk.open,
    "411c control: an ordinary printable key still leaves the focused button for the search box,"
    + " so 411 is two keys carved out rather than the sink switched off: " + JSON.stringify(sunk));
  clean(e, "the Menu from the keyboard");

  /* BOARD 369: THE LADDER'S LAST RUNG. Escape sheds one thing per press, and once there is
     nothing left to shed the only thing still standing between a person and the beginning is how
     far down the cards they are. Driven through the door a person uses - real key presses into
     the page - and read back off the scroller's own scrollTop, never off a module's opinion.
     Placed last of the main walk because the deepest rung closes every tab. */
  e = since();
  const scrollNow = () => p.evaluate(() => {
    const el = document.getElementById("pageScroll");
    return el ? { top: Math.round(el.scrollTop), max: Math.round(el.scrollHeight - el.clientHeight) } : null;
  });
  const scrollDown = () => p.evaluate(() => {
    const el = document.getElementById("pageScroll");
    if (el) el.scrollTop = el.scrollHeight;            // clamps to the bottom
  });
  await scrollDown(); await sleep(500);
  const sc0 = await scrollNow();
  /* THE CONTROL, and it is a real press of a key the ladder does not own. Without it "it went to
     zero" says nothing about Escape: a list that re-rendered, or a reading taken at the wrong
     moment, would answer zero for reasons of its own. */
  await p.keyboard.press("F9"); await sleep(700);
  const sc1 = await scrollNow();
  check(!!sc0 && sc0.top > 0 && !!sc1 && sc1.top === sc0.top,
    "369 control: the cards scroll to " + (sc0 && sc0.top) + " of " + (sc0 && sc0.max)
    + " and a press of a key the ladder does not own leaves them exactly there ("
    + (sc1 && sc1.top) + ")");
  /* A query first, so the press that clears it is NOT the last rung and the view must survive it.
     This is what "the LAST step scrolls" means as a measurement rather than a description. */
  await p.evaluate(() => document.querySelector("#intent").focus());
  await p.keyboard.type("refund", { delay: 10 }); await sleep(900);
  await scrollDown(); await sleep(400);
  await p.keyboard.press("Escape"); await sleep(900);
  const sc2 = await p.evaluate(() => {
    const el = document.getElementById("pageScroll");
    return { v: document.querySelector("#intent").value, top: Math.round((el && el.scrollTop) || 0) };
  });
  check(sc2.v === "" && sc2.top > 0,
    "369a the rung that sheds the query is not the last one: the query is gone (" + JSON.stringify(sc2.v)
    + ") and the view is still at " + sc2.top);
  /* Held. Six presses is past the deepest rung - the query, the intents, the tab wipe's asking
     press and the wipe itself - so the ladder is empty well before the last of them. */
  for (let i = 0; i < 6; i++) { await p.keyboard.press("Escape"); await sleep(500); }
  const sc3 = await scrollNow();
  check(!!sc3 && sc3.top === 0,
    "369b and a held Escape ends at the very top of the cards, scrollTop " + (sc3 && sc3.top)
    + " of a scrollable " + (sc3 && sc3.max));
  clean(e, "the escape ladder's last rung");

  /* The public first run: a folder holding only the engine and the sample, as the README has a
     stranger start. The boot above never takes that path while the real catalog is beside this
     file, and a fresh context is what keeps the adopted catalog's storage out of it. */
  e = since();
  const pub = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-public-"));
  let ctx;
  /* Every step names itself, because this leg threw "Attempted to use detached Frame" once in
     three runs on 2026-09-14 and the log said only that: one line, no stack, no step, and the
     section's remaining checks silently not run. A flake nobody can place is a flake nobody can
     fix. */
  let at = "the start";
  const step = s => { at = s; };
  try {
    fs.copyFileSync(RUN.page, path.join(pub, "etiuda.html"));
    fs.copyFileSync(path.join(RUN.dir, E.FIXTURE_FILE.sample), path.join(pub, E.FIXTURE_FILE.sample));
    step("making the public context");
    ctx = b.createBrowserContext ? await b.createBrowserContext() : await b.createIncognitoBrowserContext();
    const q = await ctx.newPage();
    await hookInstall(q);
    await q.setViewport({ width: 1500, height: 950 });
    q.on("dialog", d => d.accept());
    q.on("pageerror", x => errs.push("pageerror: " + String(x.message || x)));
    q.on("console", m => { if (m.type() === "error" && !/ERR_FILE_NOT_FOUND/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });
    const missing = [];
    q.on("requestfailed", r => missing.push(r.url().split("/").pop()));
    step("loading the public copy");
    await q.goto("file:///" + path.join(pub, "etiuda.html").replace(/\\/g, "/"), { waitUntil: "load", timeout: 90000 });
    await sleep(2400);
    const offer = await q.evaluate(() => ({ cards: document.querySelectorAll(".card").length, real: typeof E_CATALOG !== "undefined",
      btn: ((document.querySelector("#emptySample") || {}).textContent || "").trim() }));
    /* BOARD 344: the Import button beside the sample one, render.js:128, the only route in src/
       to hooks.importCatalogHere - and it is pressed HERE, on the empty screen, because that is
       the only screen that draws it. Chrome on file:// has showOpenFilePicker, so that is the
       branch taken and a picker no driver can answer never settles. Stubbed at the PLATFORM
       boundary, as the two save routes already are, and stubbed to the cancel the engine
       documents: the picker rejects with an AbortError, which importCatalogPicked's catch reads
       as "changed their mind" and acts on by doing nothing. The whole route runs, the desk is
       left as it was, and that is what is read back. Put straight back afterwards. */
    step("the empty screen's Import, with the picker stubbed");
    const imp = await q.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const real = window.showOpenFilePicker;
      const native = typeof real === "function";
      let asked = 0;
      if (native) window.showOpenFilePicker = () => { asked++; const x = new Error("cancelled"); x.name = "AbortError"; return Promise.reject(x); };
      const btn = document.getElementById("emptyImport");
      if (btn) btn.click();
      await wait(800);
      if (native) window.showOpenFilePicker = real;
      return { btn: !!btn, native, asked, cards: document.querySelectorAll(".card").length };
    });
    check(imp.btn && imp.cards === 0 && (!imp.native || imp.asked === 1),
      "the empty screen's Import runs its own route and a cancelled picker leaves the desk empty (" + JSON.stringify(imp) + ")");
    /* ADOPTING THE SAMPLE RELOADS THE DOCUMENT - catalog-file.js ends on location.reload(),
       because a catalog arrives on a clean desk and the per-tab state has to go with it. The old
       shape here clicked through an evaluate and then went on driving whatever frame it had,
       which is a race against a navigation the instrument never mentioned. It is now waited for,
       and the wait is a check: the reload is the behaviour board 356 was about. */
    step("clicking the sample and waiting for the reload");
    const navigated = q.waitForNavigation({ waitUntil: "load", timeout: 30000 }).then(() => true, () => false);
    await q.click("#emptySample");
    const reloaded = await navigated;
    check(reloaded, "accepting the sample reloads the document, which is how a catalog arrives on a clean desk");
    step("waiting for the sample's cards after the reload");
    await q.waitForFunction(() => document.querySelectorAll(".card").length > 0, { timeout: 20000 }).catch(() => {});
    await sleep(1200);
    step("dismissing the tour");
    for (let i = 0; i < 3; i++) { const hit = await q.evaluate(() => { const el = [...document.querySelectorAll("button")].filter(x => x.offsetWidth > 0).find(x => /skip|not now|close|pomi/i.test(x.textContent));
      if (el) { el.click(); return true; } return false; }); if (!hit) break; await sleep(500); }
    step("reading the loaded sample back");
    const got = await q.evaluate(() => ({ cards: document.querySelectorAll(".card").length, rows: document.querySelectorAll("#intentRailList .rail-item").length, pills: document.querySelectorAll("#pills .pill").length }));
    check(!offer.real && offer.cards === 0 && /sample/i.test(offer.btn), "with no deployment catalog the empty screen offers the sample (" + JSON.stringify(offer.btn) + ")");
    check(got.cards > 0 && got.rows > 0 && got.pills > 0, "the sample loads: " + got.cards + " cards, " + got.rows + " intents, " + got.pills + " pills");
    check(missing.every(m => /^etiuda-catalog\.js/.test(m)), "nothing looked for and missing but the deployment catalog (" + [...new Set(missing)].join(", ") + ")");
  } catch (x) {
    const where = String((x && x.stack || "").split(String.fromCharCode(10))[1] || "").trim();
    check(false, "the public first run could not run, at " + at + ": " + (x && x.message || x)
      + (where ? " | " + where : ""));
  }
  finally { await hookDrain(ctx, "the public first run"); if (ctx) await ctx.close().catch(() => {}); fs.rmSync(pub, { recursive: true, force: true }); }
  clean(e, "the public first run");

  /* ---- THE COMMENT LANGUAGE IS WIRED IN THE RIGHT ORDER, board item 534 ---------------------
   *
   * A LEG ASSERTING SOURCE TEXT CANNOT SEE AN ORDERING FAULT. The wiring of setCommentLang was
   * guarded in tests/test.js by a regex for `setCommentLang(c.commentLang)` inside eApplyCatalog.
   * Moving that call ABOVE setContentLangs keeps the text exactly, and the suite stayed green
   * while the feature went; this is that claim driven instead.
   *
   * WHEN THE ORDER SHOWS, derived first and then measured, because a leg that cannot separate
   * the two orders is a leg about nothing. setContentLangs clears the comment language when the
   * new list does not hold it, and setCommentLang refuses a code the CURRENT list does not hold.
   * So the two orders differ on exactly one shape: the incoming commentLang is a language the
   * PREVIOUS catalog did not declare, the new one does, and it is not the new primary. Hence two
   * catalogs applied in turn - one declaring pl alone, then one declaring pl and en with
   * commentLang en - and one intent carrying a topic in en and none in pl.
   *
   * Measured 2026-09-18 against the artefact at 4c377cb and against a copy of it with the two
   * calls swapped: commentLang() "en" and topicAt(0,"pl") "Topic in English" as built, "pl" and
   * "" swapped. One catalog alone cannot tell them apart, which is why the fixtures are two.
   */
  e = since();
  let orderCtx = null;
  try {
    orderCtx = b.createBrowserContext ? await b.createBrowserContext() : await b.createIncognitoBrowserContext();
    const o = await orderCtx.newPage();
    await hookInstall(o);
    o.on("pageerror", x => errs.push("pageerror: " + String(x.message || x)));
    await o.goto(RUN.url, { waitUntil: "load", timeout: 90000 });
    const base = {
      format: 2, kind: "etiuda-catalog", rev: 1,
      tags: [{ id: "t-shelf", kind: "shelf", label: { pl: "Polka", en: "Shelf" } }],
    };
    const first = Object.assign({}, base, {
      id: "order-one", name: "One language",
      langs: [{ code: "pl", label: "PL" }],
      tags: base.tags.concat([{ id: "t-one", kind: "request", clause: { pl: "jednym" } }]),
      cards: [{ id: "c-one", shelf: "t-shelf", bodyShape: "plain",
                title: { pl: "Jeden" }, body: { pl: "Tresc." }, requests: ["t-one"] }],
    });
    const second = Object.assign({}, base, {
      id: "order-two", name: "Two languages", commentLang: "en",
      langs: [{ code: "pl", label: "PL" }, { code: "en", label: "EN" }],
      tags: base.tags.concat([{ id: "t-one", kind: "request",
        clause: { pl: "jednym", en: "one" }, topic: { en: "Topic in English" } }]),
      cards: [{ id: "c-one", shelf: "t-shelf", bodyShape: "plain",
                title: { pl: "Jeden", en: "One" }, body: { pl: "Tresc.", en: "Body." },
                requests: ["t-one"] }],
    });
    const seen = await o.evaluate((one, two) => {
      const out = {};
      window.eApplyCatalog(window.catalogFromV2(JSON.parse(JSON.stringify(one))));
      out.afterOne = window.commentLang();
      window.eApplyCatalog(window.catalogFromV2(JSON.parse(JSON.stringify(two))));
      out.afterTwo = window.commentLang();
      out.topicPl = window.topicAt(0, "pl");
      out.topicEn = window.topicAt(0, "en");
      return out;
    }, first, second);
    check(seen.afterOne === "pl" && seen.afterTwo === "en",
      "the comment language follows the catalog that arrived last, not the one before it: "
      + JSON.stringify(seen.afterOne) + " then " + JSON.stringify(seen.afterTwo)
      + ". Under the two calls swapped this reads \"pl\" twice");
    check(seen.topicPl === "Topic in English" && seen.topicEn === "Topic in English",
      "and a topic the card's language has not got falls back to it and not to empty: pl "
      + JSON.stringify(seen.topicPl) + ", en " + JSON.stringify(seen.topicEn)
      + ". Under the swap the pl reading is the empty string");
  } catch (x) {
    check(false, "the comment language's wiring could not be driven: " + (x && x.message || x));
  } finally {
    await hookDrain(orderCtx, "the comment language's wiring");
    if (orderCtx) await orderCtx.close().catch(() => {});
  }
  clean(e, "the comment language's wiring");

  /* THE VIEWPORT BATCH'S OWN LEG, board item 630. A batch of sleeps moved onto a condition is
     a change that can be wrong in two directions, and this covers the one the legs downstream
     cannot see: a condition that never comes true burns its whole ceiling and leaves the page
     exactly where the sleep left it, which is green everywhere and slower than before. The count
     is asserted to be non-zero as well, because a batch that stopped running is a batch whose
     leg passes for free. */
  check(VIEWPORT_WAITS.n > 0 && VIEWPORT_WAITS.out.length === 0,
    "every wait for a width ended on its condition and not on its ceiling: "
    + VIEWPORT_WAITS.settled + " of " + VIEWPORT_WAITS.n + " settled in "
    + VIEWPORT_WAITS.ms + " ms, where the sleeps they replace would have spent "
    + VIEWPORT_WAITS.slept + " ms; the slowest was " + VIEWPORT_WAITS.worst + " ms at "
    + VIEWPORT_WAITS.worstAt
    + (VIEWPORT_WAITS.out.length ? " - WAITED OUT: " + VIEWPORT_WAITS.out.join("; ") : ""));

  reachedEnd = true;
})()
  /* AN ABORT IS NOT A RESULT, and it used to read as one: a throw left the log holding a run of
     ok lines, no FAIL, no tally and no verdict, so anything counting lines saw a clean partial
     run. Measured 2026-09-12 with the catalog absent - 70 of 119, exit 1, nothing said. The
     summary now prints from the finally whatever happened, and says which of the two it was. */
  .catch(e => { check(false, "the run stopped before the end: " + String(e && e.message || e)); console.error(e); })
  .finally(async () => {
    if (HOOKCOV && b) {
      try {
        await hookDrain(b, "the main run");
        fs.writeFileSync(HOOKCOV, JSON.stringify(hookCov));
        console.log("  hook coverage written to " + HOOKCOV + ": " + Object.keys(hookCov.hits).length + " of " + hookCov.wrapped.length + " slots called");
      } catch (x) { console.log("  hook coverage could not be read: " + (x && x.message || x)); }
    }
    if (b) await b.close().catch(() => {});
    RUN.drop();
    console.log(errs.length ? "  ALL ERRORS: " + errs.join(" | ") : "  no page or console errors in the whole run");
    console.log("  " + (checks - fails) + "/" + checks + " checks passed in " + Math.round((Date.now() - t0) / 1000) + "s" + (fails ? " - " + fails + " FAILED" : ""));
    /* ONE BODY CALLED TWICE, board item 531. This rule used to live here and nowhere else, and
       tests/shell-smoke.js had no version of it at all; two copies of a rule this small are two
       copies that will differ. E.suiteVerdict holds it now, and tests/engine-selftest.js case 25
       puts it wrong on purpose, which is something an inline block here could never have. The
       sentences are the ones this file has always printed, less the words "in EXPECTED", which
       named a constant in a file the reader of a log does not have. */
    const v = E.suiteVerdict({ checks, fails, expected: EXPECTED[WHICH], reachedEnd });
    v.lines.forEach(l => console.log("  " + l));
    process.exitCode = v.exit;
  });
