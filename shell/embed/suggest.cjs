/* THE EMBEDDED MODEL AS THE PICKER ASKS FOR IT. Settings' switch, whether the desk carries the model, and one worker
 * (shell/embed/worker.cjs) warmed for the catalog the page last described. rank() answers the model's five, or null,
 * and null always means the word-based suggestions stand: off, not installed, refused by its pin, still warming,
 * crashed, or slower than the budget. */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const core = require("./core.cjs");

const WORKER = path.join(__dirname, "worker.cjs");
/* A worker that fails or dies is started again at the next warm, this many times in a desk's life; then the words stand. */
const EMBED_RESTARTS = 3;

/* o.fork(file) starts the worker and returns {post(m), onMessage(fn), onExit(fn), kill()}; o.dir holds the model
   files, o.runtime the folder whose node_modules hold the runtime and the tokenizer. */
function createEmbedSuggest(o) {
  const pin = o.pin || core.MODEL_PIN;
  const later = o.setTimeout || setTimeout;
  let on = false, child = null, status = "idle", warmEpoch = null, asked = null, n = 0, crashes = 0;
  const waiting = new Map();

  function installed() {
    const has = o.exists || fs.existsSync;
    return !!o.dir && !!o.runtime && core.pinPresent(o.dir, pin) && !!has(path.join(o.runtime, "node_modules", "onnxruntime-node"));
  }
  function settle(id, rows) {
    const done = waiting.get(id);
    if (done) { waiting.delete(id); done(rows); }
  }
  function stop() {
    const c = child;
    child = null;
    asked = null;
    warmEpoch = null;
    if (status === "warming" || status === "ready") status = "idle";
    for (const id of [...waiting.keys()]) settle(id, null);
    if (c) { try { c.kill(); } catch (e) { /* already gone */ } }
  }
  function crashed() {
    stop();
    crashes++;
    status = crashes >= EMBED_RESTARTS ? "failed" : "idle";
  }
  function onMessage(c, m) {
    if (c !== child || !m || typeof m !== "object") return;
    if (m.kind === "ready") { status = "ready"; warmEpoch = m.epoch; }
    else if (m.kind === "ranked") settle(m.n, m.epoch === warmEpoch && Array.isArray(m.rows) ? m.rows : null);
    /* A refusal is for the life of this desk: the files do not change while it runs. */
    else if (m.kind === "refused") { stop(); status = "refused"; }
    else if (m.kind === "failed") crashed();
  }
  function onExit(c) {
    if (c !== child) return;
    child = null;
    crashed();
  }
  return {
    setOn(want) {
      on = !!want;
      if (!on) stop();
    },
    installed,
    /* Asked again for the same epoch, nothing happens; a new epoch embeds the new passages in the worker already up. */
    warm(passages, epoch) {
      if (!on || status === "refused" || status === "failed" || !installed()) return false; /* plant:embed-off */
      if (asked === epoch) return true;
      asked = epoch;
      if (!child) {
        let c = null;
        try { c = o.fork(WORKER); } catch (e) { status = "failed"; return false; }
        child = c;
        status = "warming";
        c.onMessage(m => onMessage(c, m));
        c.onExit(() => onExit(c));
        c.post({ kind: "load", dir: o.dir, runtime: o.runtime, passages, epoch });
      } else {
        status = "warming";
        child.post({ kind: "passages", passages, epoch });
      }
      return true;
    },
    readyFor(epoch) { return on && status === "ready" && child !== null && warmEpoch === epoch; },
    /* The five nearest intents for `text`, or null once `budget` ms pass. */
    rank(text, budget) {
      if (!on || status !== "ready" || !child) return Promise.resolve(null);
      const id = ++n;
      return new Promise(done => {
        waiting.set(id, done);
        later(() => settle(id, null), budget);
        try { child.post({ kind: "rank", n: id, text: String(text || "") }); } catch (e) { settle(id, null); }
      });
    },
    state() { return { on, status, epoch: warmEpoch, live: child !== null }; },
    stop
  };
}

module.exports = { createEmbedSuggest, WORKER, EMBED_RESTARTS, passagesKey: core.passagesKey };
