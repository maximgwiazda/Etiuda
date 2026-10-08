/* The one-time carries a desk arrives with, driven in a browser: a 1.16.7 desk's stored keys
 * under this version's names, the layer a build wrote before its namespace was keyed by the
 * catalog's id, and the personal layer's own keys where they were positions.
 *
 *   node tests/storage-carry.js            Chrome
 *
 * WHY A BROWSER. eCarryOldKeys() reads and writes the real localStorage of a real file://
 * origin, and the claim being made is about a desk that already holds keys: a unit test over an
 * in-memory stand-in would prove the loop and nothing about the boot. So this seeds the old keys
 * BEFORE the first document script runs (evaluateOnNewDocument, which is the only hook ahead of
 * the template's own boot script), loads engine/etiuda.html from a run folder outside the tree,
 * and reads the storage back.
 *
 * WHAT IT PROVES, in this order:
 *   1  every seeded old key is readable under its new name, with the same value
 *   2  every seeded old key is STILL THERE - the carry copies, because a 1.x engine may open
 *      the same origin and a key it no longer finds is somebody's work gone
 *   3  the desk comes up as it was: theme, interface language and rail width all took effect
 *   4  a key that is not this engine's is untouched, and gains no copy
 *   5  a second pass moves nothing and overwrites nothing, so a change made after the first
 *      boot survives one
 *   6  the control: with no old key present the pass writes nothing but its own marker
 *
 * Then, over a desk holding a stored catalog and a layer keyed the way every desk was keyed before
 * 2.0.0, by the POSITION of an intent:
 *   7  where the catalog carries an id per request, every key that named an intent is re-keyed
 *      by tag id - override, hide, star, count, a personal card's link, the display order - and
 *      a second wake changes nothing
 *   8  where it carries none, nothing is guessed: the layer is set aside whole under its own
 *      key, the desk starts clean on what named an intent, and it is told once
 *
 * Exit code is the number of failed checks, capped at 63 (E.exitOf), 78 where the run produced no verdict at all.
 * The browser is closed in a finally: an orphaned headless browser wedges the Claude app. */
"use strict";
const puppeteer = require("puppeteer-core");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* A 1.16.7 desk, as `node tests/storage-keys.js` inventories it: preferences bare, this
   engine's own catalog layers under the bare prefix, and one more build's layers under a
   hashed one. Values are shaped like the real ones so that boot can actually use them. */
const OLD = {
  pbTheme: "dark",
  pbUiLang: "pl",
  pbLang: "pl",
  pbAgent: "Tester",
  pbRailW: "320",
  pbRailLock: "1",
  pbPills: "1",
  pbNoteHover: "0",
  pbCollapsed: '[":fav"]',
  pbFactsW: "420px",
  pbFactsH: "300px",
  pbShortcuts: '{"KeyJ":"down"}',
  pbTourDone_v1: "1",
  pbPack: '{"custom":[],"overrides":{},"hidden":[],"favourites":[]}',
  pbCatOrder: '["one","two"]',
  "pb1abc~Pack": '{"custom":[]}'          // a neighbouring build's layer, namespaced
};
/* Keys no version of this engine wrote. The shape rule must leave every one of them alone,
   which is the whole reason the sweeps match a shape rather than a letter. */
const FOREIGN = { editorDraft: "not ours", pb: "not ours", pblower: "not ours", e: "not ours" };
const MARKER = "e~carried";

/* ---- part two's helpers ----------------------------------------------------------------- */
/* The engine's own namespace arithmetic, written a second time on purpose: a gate that asked
   the page for the address it is checking would agree with itself whatever the page did. */
function nsFor(seed) {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (((h << 5) + h) ^ seed.charCodeAt(i)) >>> 0;
  return "e" + h.toString(36) + "~";
}
/* The key the active catalog is stored under: the bare prefix and "Catalog". */
const CATALOG_KEY = "eCatalog";
const readStore = pg => pg.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); }
  const el = document.getElementById("toast");
  return { store: out, ns: E_NS, toast: (el && el.classList.contains("show")) ? el.textContent : "" };
});
/* ---- part two's fixtures ------------------------------------------------------------------ */
/* Two editions of one invented catalog: the second carries an id per request, the first predates
   them. Three requests, because a leg that re-keys one cannot tell an id from a position. */
const REQ_IDS = ["r-a", "r-b", "r-c"];
function lamps(id, withIds) {
  const c = { format: 1, kind: "playbook-catalog", id: id, name: "Lamp Shop " + id,
              categories: { gen: "General" },
              intents: { en: ["Clause one", "Clause two", "Clause three"],
                         pl: ["Klauzula pierwsza", "Klauzula druga", "Klauzula trzecia"] },
              cards: [{ c: "gen", t: "A lamp arrived broken", en: "Sorry about the lamp.", intents: [0] }] };
  if (withIds) c.intentIds = REQ_IDS.slice();
  return c;
}
const TAGGED = lamps("lamp-tagged", true), PLAIN = lamps("lamp-plain", false);
/* A desk keyed the way every desk was keyed before 2.0.0: an override under a slot number, a
   hide and a star under two more, a count, and a personal card linking a built-in by index. */
const LAYER = { intentOverrides: { "i:0": { en: "my first clause" }, "i:1": { en: "my second clause" },
                                   "i:2": { en: "my third clause" } },
                intentHidden: ["i:1"], intentFavourites: ["i:2"], intentRemoved: [],
                intentCounts: { "i:0": 3 },
                custom: [{ id: "u1", c: "gen", t: "One of mine", en: "One of mine", intents: [1] }] };
const LAYER_ORDER = [2, 1, 0];
const ASIDE_NOTICE = "Your intent edits and stars are set aside: this catalog cannot say which intent each belongs to.";
/* What that layer is once it is keyed by tag id. Written out rather than derived, so the leg
   states the answer instead of computing it the way the code under test does. */
const REKEYED = { overrides: ["t:r-a", "t:r-b", "t:r-c"], hidden: ["t:r-b"], favourites: ["t:r-c"],
                  counts: ["t:r-a"], cardLinks: ["t:r-b"], order: ["t:r-c", "t:r-b", "t:r-a"] };
function layerSeed(ns) {
  const out = {};
  out[ns + "Pack"] = JSON.stringify(LAYER);
  out[ns + "IntentOrder"] = JSON.stringify(LAYER_ORDER);
  return out;
}
/* The stored layer as this leg reads it: the four id-bearing fields, the personal card's links
   and the display order, each as a plain list of keys. */
function layerOf(store, ns) {
  let pk = null, order = null, st = null;
  try { pk = JSON.parse(store[ns + "Pack"] || "null"); } catch (x) {}
  try { order = JSON.parse(store[ns + "IntentOrder"] || "null"); } catch (x) {}
  // The counts from their own key where the desk has one, the pack where not, as loadPack reads them.
  try { st = JSON.parse(store[ns + "Stats"] || "null"); } catch (x) {}
  if (!pk) return null;
  return { overrides: Object.keys(pk.intentOverrides || {}), hidden: (pk.intentHidden || []).slice(),
           favourites: (pk.intentFavourites || []).slice(), counts: Object.keys((st || pk).intentCounts || {}),
           countsIn: st ? "Stats" : "Pack",
           cardLinks: ((pk.custom || [])[0] || {}).intents || [], order: Array.isArray(order) ? order : null,
           keys: pk.intentKeys || "" };
}

let b; let fails = 0; let checks = 0; let reachedEnd = false;
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };

const RUN = E.runFolder();
const t0 = Date.now();

(async () => {
  b = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true,
                               args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  const p = await b.newPage();
  const errs = [];
  p.on("dialog", d => d.accept());
  p.on("pageerror", e => errs.push("pageerror: " + String(e.message || e)));
  p.on("console", m => { if (m.type() === "error" && !/ERR_FILE_NOT_FOUND/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });
  /* Before the template's boot script, which is itself before the app: this is the only way to
     hand the page a storage area that already holds a previous version's keys. */
  await p.evaluateOnNewDocument(seed => {
    try { for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]); } catch (x) {}
  }, Object.assign({}, OLD, FOREIGN));

  console.log("CHROME  " + RUN.url);
  console.log("  engine/etiuda.html sha256 " + RUN.engineSha + (RUN.engineSha === RUN.copySha ? "" : "  COPY DIFFERS: " + RUN.copySha));

  await p.goto(RUN.url, { waitUntil: "load", timeout: 90000 });
  await sleep(2000);
  const dump = () => p.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); }
    return { store: out, theme: document.documentElement.dataset.theme || null,
             htmlLang: document.documentElement.lang || null,
             rail: getComputedStyle(document.documentElement).getPropertyValue("--rail-max").trim() };
  });
  const after = await dump();

  const names = Object.keys(OLD);
  const carried = names.filter(k => after.store["e" + k.slice(2)] === OLD[k]);
  check(carried.length === names.length, carried.length + " of " + names.length
    + " old keys readable under the new name with the same value"
    + (carried.length === names.length ? "" : " - missing: " + names.filter(k => carried.indexOf(k) < 0).join(", ")));
  const kept = names.filter(k => after.store[k] === OLD[k]);
  check(kept.length === names.length, kept.length + " of " + names.length
    + " old keys still in place, untouched, for a 1.x engine on the same origin");
  check(after.store[MARKER] === "1", "the pass marked itself done under " + JSON.stringify(MARKER)
    + ", which no sweep of this engine's own keys matches");

  check(after.theme === "dark", "the desk came up in the theme it was left in (" + after.theme + ")");
  check(after.htmlLang === "pl", "and in the interface language it was left in (" + after.htmlLang + ")");
  check(after.rail === "320px", "and with the rail width it was left at (" + after.rail + ")");

  const foreignKept = Object.keys(FOREIGN).filter(k => after.store[k] === FOREIGN[k]);
  /* A copy is a key this pass could have made from a foreign one. "pb" itself would yield "e",
     which is seeded here as a foreign key in its own right, so a seeded target is not a copy. */
  const foreignCopied = Object.keys(FOREIGN).filter(k => k.slice(0, 2) === "pb"
    && !(("e" + k.slice(2)) in FOREIGN) && ("e" + k.slice(2)) in after.store);
  check(foreignKept.length === Object.keys(FOREIGN).length && foreignCopied.length === 0,
    "no key that is not this engine's was read or copied (" + foreignKept.length + " of "
    + Object.keys(FOREIGN).length + " intact, " + foreignCopied.length + " copied)");

  /* A second pass, forced by clearing the marker, against a value changed since the first: the
     rule that makes this idempotent is not the marker but the refusal to overwrite. */
  const again = await p.evaluate(m => {
    localStorage.setItem("eTheme", "light");
    localStorage.removeItem(m);
    const before = Object.keys(localStorage).filter(k => k !== m).sort().join("|");
    const moved = eCarryOldKeys();
    const now = Object.keys(localStorage).filter(k => k !== m).sort().join("|");
    return { moved, same: before === now, theme: localStorage.getItem("eTheme"), marker: localStorage.getItem(m) };
  }, MARKER);
  check(again.moved === 0 && again.same, "a second pass moves nothing and adds no key (moved "
    + again.moved + ", key set unchanged " + again.same + ")");
  check(again.theme === "light", "and a value written since the first pass survives it ("
    + again.theme + ", against " + OLD.pbTheme + " under the old name)");
  check(again.marker === "1", "and the marker goes back up");

  /* The control. Nothing of the old regime in the store at all: the pass must write its marker
     and not one key besides, or its silence above would mean nothing. */
  const control = await p.evaluate((m, foreign) => {
    localStorage.clear();
    for (const k of Object.keys(foreign)) localStorage.setItem(k, foreign[k]);
    const before = Object.keys(localStorage).sort().join("|");
    const moved = eCarryOldKeys();
    const now = Object.keys(localStorage).filter(k => k !== m).sort().join("|");
    return { moved, same: before === now, marker: localStorage.getItem(m), n: Object.keys(localStorage).length };
  }, MARKER, FOREIGN);
  check(control.moved === 0 && control.same && control.marker === "1",
    "the control: with no old key present the pass writes its marker and nothing else (moved "
    + control.moved + ", " + control.n + " keys, key set unchanged " + control.same + ")");

  check(errs.length === 0, "no page or console error over the run" + (errs.length ? " - " + errs.join(" | ") : ""));

  /* ---- part two: the personal layer, re-keyed from positions to tag ids -------------------
     Everything above is about which namespace a layer sits in; this is about what the layer's
     own keys mean. Driven at a boot for the same reason: the migration reads the catalog that
     eApplyCatalog has just applied, which is a boot rather than a function. */
  const wake = async (catalog, seed) => {
    const pg = await b.newPage();
    const bad = [];
    pg.on("dialog", d => d.accept());
    pg.on("pageerror", e => bad.push("pageerror: " + String(e.message || e)));
    pg.on("console", m => { if (m.type() === "error" && !/ERR_FILE_NOT_FOUND/.test(m.text())) bad.push("console: " + m.text().slice(0, 160)); });
    /* Cleared as well as seeded: every file:// page in this browser shares one storage area,
       and the part above has left its keys in it. The catalog is stored, as an imported one is. */
    await pg.evaluateOnNewDocument(sown => {
      try { localStorage.clear(); for (const k of Object.keys(sown)) localStorage.setItem(k, sown[k]); } catch (x) {}
    }, Object.assign({ [CATALOG_KEY]: JSON.stringify(catalog) }, seed));
    await pg.goto(RUN.url, { waitUntil: "load", timeout: 90000 });
    await sleep(2400);
    const got = await readStore(pg);
    return { pg, bad, store: got.store, toast: got.toast, ns: got.ns };
  };

  const tagNs = nsFor(TAGGED.id), plainNs = nsFor(PLAIN.id);
  const woke = await wake(TAGGED, layerSeed(tagNs));
  const now = layerOf(woke.store, tagNs);
  check(!!now && now.keys === "tag", "a desk whose catalog carries an id per request wakes keyed by tag ("
    + (now ? JSON.stringify(now.keys) : "no pack at all") + ")");
  check(!!now && JSON.stringify(now.overrides) === JSON.stringify(REKEYED.overrides),
    "its three overrides are under their tag ids " + (now ? JSON.stringify(now.overrides) : "-")
    + ", from " + JSON.stringify(Object.keys(LAYER.intentOverrides)));
  check(!!now && JSON.stringify([now.hidden, now.favourites, now.counts])
     === JSON.stringify([REKEYED.hidden, REKEYED.favourites, REKEYED.counts]),
    "and so are the hide, the star and the count " + (now ? JSON.stringify([now.hidden, now.favourites, now.counts])
    + ", the count read from " + now.countsIn : "-"));
  check(!!now && JSON.stringify(now.cardLinks) === JSON.stringify(REKEYED.cardLinks),
    "a personal card's link to a built-in intent is a tag id too " + (now ? JSON.stringify(now.cardLinks) : "-")
    + ", from " + JSON.stringify(LAYER.custom[0].intents));
  check(!!now && JSON.stringify(now.order) === JSON.stringify(REKEYED.order),
    "and the display order is the same order, by id " + (now ? JSON.stringify(now.order) : "-")
    + ", from " + JSON.stringify(LAYER_ORDER));
  check(woke.toast === "", "nothing is said to a desk that migrated exactly ("
    + JSON.stringify(woke.toast) + ")");
  await woke.pg.reload({ waitUntil: "load", timeout: 90000 });
  await sleep(2000);
  const twiceOver = layerOf((await readStore(woke.pg)).store, tagNs);
  check(JSON.stringify(twiceOver) === JSON.stringify(now), "a second wake changes nothing"
    + (JSON.stringify(twiceOver) === JSON.stringify(now) ? "" : " - " + JSON.stringify(twiceOver)));
  check(woke.bad.length === 0, "no page or console error over the re-keyed desk's run"
    + (woke.bad.length ? " - " + woke.bad.join(" | ") : ""));

  const blind = await wake(PLAIN, layerSeed(plainNs));
  const left = layerOf(blind.store, plainNs);
  /* The order is the one exception to "clean": the rail writes a fresh one at every boot, and
     with no id to key it by it is the slot numbers in their own order - the fallback this
     build keeps for exactly such a catalog. What matters is that it is no longer the user's. */
  const PLAIN_ORDER = ["i:0", "i:1", "i:2"];
  check(!!left && left.keys === "tag" && !left.overrides.length && !left.hidden.length
     && !left.favourites.length && !left.counts.length && !left.cardLinks.length
     && JSON.stringify(left.order) === JSON.stringify(PLAIN_ORDER),
    "a desk whose catalog has no request ids wakes clean of everything that named an intent "
    + (left ? JSON.stringify([left.overrides, left.hidden, left.favourites, left.counts, left.cardLinks, left.order]) : "no pack at all"));
  let aside = null;
  try { aside = JSON.parse(blind.store[plainNs + "IntentsAside"] || "null"); } catch (x) {}
  check(!!aside && JSON.stringify(Object.keys(aside.intentOverrides || {})) === JSON.stringify(Object.keys(LAYER.intentOverrides))
     && JSON.stringify(aside.IntentOrder) === JSON.stringify(LAYER_ORDER)
     && JSON.stringify((aside.cards || {}).u1) === JSON.stringify(LAYER.custom[0].intents),
    "because the layer was set aside whole under its own key, positions and all "
    + (aside ? JSON.stringify(Object.keys(aside)) : "nothing there"));
  check(blind.toast === ASIDE_NOTICE, "and that desk was told, once (" + JSON.stringify(blind.toast) + ")");
  check(blind.bad.length === 0, "no page or console error over the set-aside desk's run"
    + (blind.bad.length ? " - " + blind.bad.join(" | ") : ""));

  reachedEnd = true;
})().catch(e => {
  console.error("  FAIL " + String(e && e.stack || e));
  fails++;
}).finally(async () => {
  try { if (b) await b.close(); } catch (x) {}
  RUN.drop();
  console.log((reachedEnd ? "" : "  INCOMPLETE - ") + checks + " check(s), " + fails
    + " failed, " + Math.round((Date.now() - t0) / 1000) + "s");
  process.exit(reachedEnd ? E.exitOf(fails) : (fails ? E.exitOf(fails) : E.NO_VERDICT));
});
