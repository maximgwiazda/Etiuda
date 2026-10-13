/* THE LAUNCH MARK CLEARS BEFORE A WINDOW LEG ACTS, board 874.
 *
 * body.e-launch and body.e-launch-out cover the work for about 1.1 s at a launch, or less on a
 * key, click or wheel, and up to the mark's own ceiling after that. A click in that interval is
 * swallowed and a card under it is hidden, so a leg that opens a page and then acts goes red
 * for a reason that is the mark and not the act. One helper, called by every open in this tree.
 * A same-session reload is not a launch: callers do not ask again after one.
 *
 * The bound is 8 s. The mark's own ceiling is 4 s and its leaving class 260 ms, both read from
 * the product's launch mark and not copied into a second clock here beyond this one ceiling,
 * which also covers a connect that arrives before the document has a body. A body that is not
 * there yet is "no-body", which is not "gone": reading the mark as finished before it has
 * started is the early return this helper exists to refuse. "gone" is final only once the
 * document has booted. The default boot is document.readyState === "complete". A connect that
 * arrives on about:blank passes opts.ready "typeof window.E_VERSION === \"string\"", because
 * that blank page is already complete and has a body with no launch class.
 *
 * A navigation during the wait throws one of four phrases (the context was destroyed, the
 * context cannot be found, a detached frame, a frame detached while navigating). That costs
 * one read and the wait goes on. A disconnect is not one of those, and it is rethrown.
 * Anything else is a real throw. Past the bound, the error names the launch.
 */
"use strict";

const { pickWindow } = require("./engine.js");

function launchMarkState(doc) {
  const body = doc && doc.body;
  const list = body && body.classList;
  if (!list || typeof list.contains !== "function") return "no-body";
  if (list.contains("e-launch") || list.contains("e-launch-out")) return "up";
  return "gone";
}

function launchMarkExpr() {
  return "(" + launchMarkState.toString() + ")(document)";
}

/* The four phrases a navigation throws. "Navigation failed because browser has disconnected!"
   matches a bare "navigat" and must not be one of them. */
const CONTEXT_LOST = /Execution context was destroyed|Cannot find context|detached Frame|Navigating frame was detached/i;

const LAUNCH_WAIT_MS = 8000;

function waitReadExpr(readySrc) {
  const ready = readySrc || "document.readyState === \"complete\"";
  return "(() => ({ state: (" + launchMarkState.toString() + ")(document), ready: !!(" + ready + ") }))()";
}

async function waitLaunchGone(page, opts) {
  const o = opts || {};
  const who = o.who || "a window leg";
  const bound = o.boundMs == null ? LAUNCH_WAIT_MS : o.boundMs;
  const step = o.stepMs == null ? 50 : o.stepMs;
  const deadline = Date.now() + bound;
  let current = page;
  let navigated = 0;
  const expr = waitReadExpr(o.ready);
  for (;;) {
    let state = "up";
    let ready = false;
    try {
      const read = await current.evaluate(expr);
      state = read && read.state;
      ready = !!(read && read.ready);
    } catch (e) {
      const msg = String(e && e.message || e);
      if (!CONTEXT_LOST.test(msg)) throw e;
      navigated++;
      state = "navigated";
      if (typeof o.refresh === "function") {
        const next = await o.refresh();
        if (next) current = next;
      }
    }
    if (state === "gone" && ready) return { navigated: navigated };
    if (Date.now() >= deadline) {
      throw new Error(who + ": the launch is still on the page (body.e-launch or body.e-launch-out) after "
        + bound + " ms");
    }
    const pause = Math.min(step, Math.max(0, deadline - Date.now()));
    if (pause > 0) await new Promise(r => setTimeout(r, pause));
  }
}

/* ---- board 655: what shell-smoke 1g3 does with the window it owns ---------------------------
 *
 * The launch takes one sample straight after connect, before the wait and the sleep, and one
 * after. iconic is the window pickWindow chose, never another window of the same pid.
 *
 * FAIL, "the shell opened its window minimised", when the early window is already iconic.
 * NOT RUN only when the early window was on a display and not iconic, and the late window is
 * iconic. Every other wrong window is a FAIL. The NOT RUN is repeated on the verdict lines.
 */
function chosenIconic(facts) {
  const all = facts && Array.isArray(facts.all) ? facts.all : null;
  if (all && all.length) {
    const chosen = pickWindow(all, null);
    return !!(chosen.picked && chosen.picked.iconic === true);
  }
  return !!(facts && facts.iconic === true);
}

function onDisplayOpen(facts) {
  return !!(facts && facts.measured === true && facts.windows >= 1 && facts.windowsOnDisplay >= 1
    && !chosenIconic(facts));
}

function shownWindowReading(early, late) {
  if (chosenIconic(early)) {
    return { reading: "fail", reason: "the shell opened its window minimised" };
  }
  if (onDisplayOpen(early) && chosenIconic(late)) {
    return {
      reading: "not-run",
      reason: "the window this leg owns was on a display and was minimised afterwards by something other than the leg",
    };
  }
  if (chosenIconic(late)) {
    return { reading: "fail", reason: "the shell opened its window minimised" };
  }
  const s = late || {};
  const placed = s.measured === true && s.windows >= 1 && s.windowsOnDisplay >= 1 && s.winW > 0;
  if (!placed) {
    return {
      reading: "fail",
      reason: "the window is wrong for a reason other than being minimised by something else",
    };
  }
  return { reading: "ok", reason: "one visible window on a display, and it is not minimised" };
}

function notRunVerdictLines(notRun) {
  const names = Array.isArray(notRun) ? notRun : [];
  return names.indexOf("1g3") >= 0 ? ["NOT RUN 1g3"] : [];
}

module.exports = {
  LAUNCH_WAIT_MS: LAUNCH_WAIT_MS,
  CONTEXT_LOST: CONTEXT_LOST,
  launchMarkState: launchMarkState,
  launchMarkExpr: launchMarkExpr,
  waitLaunchGone: waitLaunchGone,
  shownWindowReading: shownWindowReading,
  notRunVerdictLines: notRunVerdictLines,
};
