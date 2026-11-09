/* THE EMBEDDED MODEL AS THE PICKER ASKS FOR IT, and as the main search asks for a ranking. Settings' two switches,
 * whether the desk carries the model, and one worker (shell/embed/worker.cjs). The picker warms the catalog's
 * intent passages. The search embeds its own passages in the background, one at a time so a picker's rank is not
 * held for the whole catalog, and keeps the vectors. rank() answers the model's five, or null, and null always
 * means the word-based suggestions stand. searchRank() answers the meaning order, or null, and null always means
 * the word search stands: off, not installed, still preparing, under three letters, or no answer. */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const core = require("./core.cjs");

const WORKER = path.join(__dirname, "worker.cjs");
/* A worker that fails or dies is started again at the next warm, this many times in a desk's life; then the words stand. */
const EMBED_RESTARTS = 3;

function searchRowsOf(rows) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || (r.surface !== "card" && r.surface !== "intent")) continue;
    const id = String(r.id || "");
    const text = String(r.text || "");
    if (!id || !text) continue;
    out.push({ surface: r.surface, id, text });
  }
  return out;
}

/* o.fork(file) starts the worker and returns {post(m), onMessage(fn), onExit(fn), kill()}; o.dir holds the model
   files, o.runtime the folder whose node_modules hold the runtime and the tokenizer. o.cacheRead, o.cacheWrite and
   o.cachePrune are the shell's, so this file never writes. */
function createEmbedSuggest(o) {
  const pin = o.pin || core.MODEL_PIN;
  const later = o.setTimeout || setTimeout;
  const cacheRead = typeof o.cacheRead === "function" ? o.cacheRead : (() => null);
  const cacheWrite = typeof o.cacheWrite === "function" ? o.cacheWrite : (() => {});
  const cachePrune = typeof o.cachePrune === "function" ? o.cachePrune : (() => {});
  let on = false, searchOn = false, child = null, status = "idle", warmEpoch = null, asked = null, n = 0, crashes = 0;
  let searchReady = false, searchKey = null, searchCards = null, searchIntents = null, prepKey = null, prepGen = 0;
  const waiting = new Map();
  const searchWaiting = new Map();

  function installed() {
    const has = o.exists || fs.existsSync;
    return !!o.dir && !!o.runtime && core.pinPresent(o.dir, pin) && !!has(path.join(o.runtime, "node_modules", "onnxruntime-node"));
  }
  function settle(id, rows) {
    const done = waiting.get(id);
    if (done) { waiting.delete(id); done(rows); }
  }
  function settleSearch(id, vec) {
    const done = searchWaiting.get(id);
    if (done) { searchWaiting.delete(id); done(vec); }
  }
  /* The worker goes. Passage vectors already in hand stay, unless clearSearch has said the search is off:
     a picker crash must not throw away a catalog the search has already embedded. */
  function dropChild() {
    const c = child;
    child = null;
    asked = null;
    warmEpoch = null;
    if (status === "warming" || status === "ready") status = "idle";
    for (const id of [...waiting.keys()]) settle(id, null);
    for (const id of [...searchWaiting.keys()]) settleSearch(id, null);
    if (c) { try { c.kill(); } catch (e) { /* already gone */ } }
  }
  function stop() {
    dropChild();
    clearSearch();
  }
  /* The picker stands down and the search keeps the worker. */
  function releasePicker() {
    asked = null;
    warmEpoch = null;
    if (status === "warming" || status === "ready") status = "idle";
    for (const id of [...waiting.keys()]) settle(id, null);
  }
  function clearSearch() {
    searchReady = false;
    searchKey = null;
    searchCards = null;
    searchIntents = null;
    prepKey = null;
    prepGen++;
    for (const id of [...searchWaiting.keys()]) settleSearch(id, null);
  }
  function crashed() {
    dropChild();
    crashes++;
    status = crashes >= EMBED_RESTARTS ? "failed" : "idle";
  }
  function onMessage(c, m) {
    if (c !== child || !m || typeof m !== "object") return;
    if (m.kind === "ready") { status = "ready"; warmEpoch = m.epoch; }
    else if (m.kind === "ranked") settle(m.n, m.epoch === warmEpoch && Array.isArray(m.rows) ? m.rows : null);
    else if (m.kind === "search-vector") settleSearch(m.n, Array.isArray(m.vec) ? Float32Array.from(m.vec) : null);
    /* A refusal is for the life of this desk: the files do not change while it runs. */
    else if (m.kind === "refused") { stop(); status = "refused"; }
    else if (m.kind === "failed") crashed();
  }
  function onExit(c) {
    if (c !== child) return;
    child = null;
    crashed();
  }
  function attach(c) {
    child = c;
    c.onMessage(m => onMessage(c, m));
    c.onExit(() => onExit(c));
  }
  /* The search opens the session alone when the picker has not. A child the picker already started is left as it is. */
  function ensureChild() {
    if (status === "refused" || status === "failed" || !installed()) return false;
    if (child) return true;
    let c = null;
    try { c = o.fork(WORKER); } catch (e) { status = "failed"; return false; }
    attach(c);
    c.post({ kind: "boot", dir: o.dir, runtime: o.runtime });
    return true;
  }
  function embedOne(kind, text) {
    if (!child && !ensureChild()) return Promise.resolve(null);
    const id = ++n;
    return new Promise(done => {
      searchWaiting.set(id, done);
      try { child.post({ kind, n: id, text: String(text || "") }); } catch (e) { settleSearch(id, null); }
    });
  }
  function storeTables(unpacked) {
    searchCards = unpacked.cards;
    searchIntents = unpacked.intents;
  }
  async function runPrep(list, key, gen) {
    if (!ensureChild()) return;
    const cards = [], intents = [];
    for (let i = 0; i < list.length; i++) {
      if (gen !== prepGen || !searchOn) return;
      const vec = await embedOne("search-doc", list[i].text);
      if (gen !== prepGen || !searchOn || !vec) {
        if (prepKey === key) prepKey = null;
        return;
      }
      (list[i].surface === "card" ? cards : intents).push([list[i].id, vec]);
    }
    if (gen !== prepGen || !searchOn) return;
    searchCards = cards;
    searchIntents = intents;
    searchKey = key;
    searchReady = true;
    try { cacheWrite(key, core.packSearchCache({ cards, intents })); } catch (e) { /* the words stand, and the next launch embeds again */ }
    try { cachePrune(core.SEARCH_CACHE_KEEP); } catch (e) { /* an old file left in place is only disk */ }
  }
  return {
    setOn(want) {
      on = !!want;
      if (!on) {
        if (searchOn) releasePicker();
        else stop();
      }
    },
    setSearchOn(want) {
      searchOn = !!want;
      if (!searchOn) {
        clearSearch();
        if (!on) stop();
      }
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
        attach(c);
        status = "warming";
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
    /* Starts the passages if they are not cached. Returns at once: ready when the vectors are in hand, otherwise
       the embedding carries on and a later query is the first to use it. */
    prepareSearch(rows) {
      if (!searchOn || !installed()) return { ready: false, skipped: true };
      const list = searchRowsOf(rows);
      const hash = core.catalogHashOf(list);
      const key = core.searchCacheKey(hash, pin, core.SEARCH_STYLE);
      if (searchReady && searchKey === key && searchCards && searchIntents) return { ready: true };
      let unpacked = null;
      try { unpacked = core.unpackSearchCache(cacheRead(key)); } catch (e) { unpacked = null; }
      if (unpacked && core.searchCacheFits(unpacked, list)) {
        storeTables(unpacked);
        searchKey = key;
        searchReady = true;
        ensureChild();
        return { ready: true };
      }
      if (prepKey !== key) {
        prepKey = key;
        const gen = ++prepGen;
        searchReady = false;
        searchCards = null;
        searchIntents = null;
        searchKey = null;
        runPrep(list, key, gen);
      }
      return { ready: false };
    },
    /* The meaning order, or null. Null posts nothing: off, not ready, or under three letters or digits. */
    searchRank(text) {
      if (!searchOn || !searchReady || !searchCards || !searchIntents) return Promise.resolve(null);
      if (core.searchAlnumLen(text) < 3) return Promise.resolve(null); /* plant:search-short */
      return embedOne("search-query", String(text || "")).then(vec => {
        if (!vec || !searchReady || !searchCards || !searchIntents) return null;
        return { cards: core.orderSurfaces(vec, searchCards), intents: core.orderSurfaces(vec, searchIntents) };
      });
    },
    state() { return { on, searchOn, status, epoch: warmEpoch, live: child !== null, searchReady }; },
    stop
  };
}

module.exports = { createEmbedSuggest, WORKER, EMBED_RESTARTS, passagesKey: core.passagesKey, cacheKeep: core.cacheKeep };
