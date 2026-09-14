/* The one-time carry of a 1.16.7 desk's stored keys, driven in a browser.
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
 * Exit code is the number of failed checks, 78 where the run produced no verdict at all.
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
  reachedEnd = true;
})().catch(e => {
  console.error("  FAIL " + String(e && e.stack || e));
  fails++;
}).finally(async () => {
  try { if (b) await b.close(); } catch (x) {}
  RUN.drop();
  console.log((reachedEnd ? "" : "  INCOMPLETE - ") + checks + " check(s), " + fails
    + " failed, " + Math.round((Date.now() - t0) / 1000) + "s");
  process.exit(reachedEnd ? fails : (fails || E.NO_VERDICT));
});
