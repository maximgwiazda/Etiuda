/* The one-time carries a desk arrives with, driven in a browser: a 1.16.7 desk's stored keys
 * under this version's names, and the layer a build wrote before its namespace was keyed by the
 * catalog's id.
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
 * Then, over a BUILD (the engine with a catalog in #eEmbedded, so the namespace is a hash of the
 * catalog's id) whose desk holds a layer under a hash of its NAME:
 *   7  the layer arrives under the id namespace, stripped of every field addressed by an
 *      intent's position, which this build's own keys are no longer read as
 *   8  the desk is told, in the words the sibling adoption uses
 *   9  a Clear the user asked for is not undone by the next boot re-adopting the same layer
 *
 * Exit code is the number of failed checks, 78 where the run produced no verdict at all.
 * The browser is closed in a finally: an orphaned headless browser wedges the Claude app. */
"use strict";
const puppeteer = require("puppeteer-core");
const fs = require("fs"), path = require("path"), os = require("os");
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

/* ---- part two's fixtures ---------------------------------------------------------------- */
/* A build is the engine with a catalog in #eEmbedded. Invented content, as every fixture here
   is: what the run turns on is that the file carries both an id and a name. */
const CATALOG = { format: 1, kind: "playbook-catalog", id: "lamp-shop", name: "Lamp Shop",
                  categories: { gen: "General" },
                  cards: [{ c: "gen", t: "A lamp arrived broken", en: "Sorry about the lamp." }] };
/* The engine's own namespace arithmetic, written a second time on purpose: a gate that asked
   the page for the address it is checking would agree with itself whatever the page did. */
function nsFor(seed) {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (((h << 5) + h) ^ seed.charCodeAt(i)) >>> 0;
  return "e" + h.toString(36) + "~";
}
const NAME_NS = nsFor(CATALOG.name), ID_NS = nsFor(CATALOG.id);
const NS_MARK = "e~nsAdopted:";
/* Both halves of a real layer. What is addressed by content travels; what addresses an intent
   by its position must not, because this build reads those keys as tag ids. */
const OLD_PACK = { favourites: ["b:gen:A lamp arrived broken"], cardOrder: ["b:gen:A lamp arrived broken"],
                   catLabels: { gen: "Lamps" }, intentOverrides: { "i:2": { en: "theirs" } },
                   intentHidden: ["i:4"], intentFavourites: ["i:1"], intentRemoved: ["i:7"],
                   baseCards: [{ id: "b:gen:A lamp arrived broken", c: "gen", t: "A lamp arrived broken", en: "x" }] };
const POSITIONAL = ["intentOverrides", "intentHidden", "intentFavourites", "intentRemoved", "baseCards"];
const NAME_LAYER = {};
NAME_LAYER[NAME_NS + "Pack"] = JSON.stringify(OLD_PACK);
NAME_LAYER[NAME_NS + "CatOrder"] = '["gen"]';
NAME_LAYER[NAME_NS + "Cols"] = "2";
NAME_LAYER[NAME_NS + "Floor"] = "30";
const CARRIED_NAMES = ["Pack", "CatOrder", "Cols", "Floor"];
const CARRY_NOTICE = "Restored your cards and stars from an earlier build.";
/* The run folder runFolder() makes is the engine under a plain name; this is that with the
   catalog baked in. The slot is matched as a whole element, so a template that stops carrying
   it fails here rather than producing a page with no catalog and a green run. */
const EMBED_SLOT = '<script type="application/json" id="eEmbedded"></script>';
function buildFolder(catalog) {
  const html = fs.readFileSync(E.enginePath(), "utf8");
  if (html.indexOf(EMBED_SLOT) < 0) throw new Error("no embed slot in the engine: " + EMBED_SLOT);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-build-"));
  const page = path.join(dir, "etiuda.html");
  const filled = EMBED_SLOT.replace("></script>", ">" + JSON.stringify(catalog) + "</script>");
  fs.writeFileSync(page, html.replace(EMBED_SLOT, filled));
  return { dir, page, url: "file:///" + page.replace(/\\/g, "/"),
           drop: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const readStore = pg => pg.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); }
  const el = document.getElementById("toast");
  return { store: out, ns: E_NS, toast: (el && el.classList.contains("show")) ? el.textContent : "" };
});

let b; let BUILD = null; let fails = 0; let checks = 0; let reachedEnd = false;
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

  /* ---- part two, over a build -------------------------------------------------------------
     The unit legs in tests/test.js supply their own store and their own namespace, so what they
     cannot see is whether a real boot reads a namespaced key before the adoption runs, and what
     a Clear does afterwards. Both are read back off the desk here. */
  BUILD = buildFolder(CATALOG);
  const q = await b.newPage();
  const qErrs = [];
  q.on("dialog", d => d.accept());                     // the Clear asks, and a native dialog blocks the page
  q.on("pageerror", e => qErrs.push("pageerror: " + String(e.message || e)));
  q.on("console", m => { if (m.type() === "error" && !/ERR_FILE_NOT_FOUND/.test(m.text())) qErrs.push("console: " + m.text().slice(0, 160)); });
  await q.evaluateOnNewDocument(seed => {
    try { for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]); } catch (x) {}
  }, Object.assign({}, NAME_LAYER, FOREIGN));
  console.log("BUILD   " + BUILD.url);
  console.log("  catalog " + JSON.stringify(CATALOG.id) + " / " + JSON.stringify(CATALOG.name)
    + ", desk seeded under " + NAME_NS + ", expected " + ID_NS);
  await q.goto(BUILD.url, { waitUntil: "load", timeout: 90000 });
  await sleep(2400);                                   // the notice is deferred to 1400ms and shows for 1700
  const built = await readStore(q);

  check(built.ns === ID_NS, "the build's namespace is a hash of the catalog's id ("
    + built.ns + (built.ns === ID_NS ? "" : ", wanted " + ID_NS) + ")");
  const landed = CARRIED_NAMES.filter(n => built.store[ID_NS + n] != null);
  check(landed.length === CARRIED_NAMES.length, landed.length + " of " + CARRIED_NAMES.length
    + " seeded keys arrived under the id namespace"
    + (landed.length === CARRIED_NAMES.length ? "" : " - missing: "
       + CARRIED_NAMES.filter(n => landed.indexOf(n) < 0).join(", ")));
  check(built.store[ID_NS + "CatOrder"] === NAME_LAYER[NAME_NS + "CatOrder"]
     && built.store[ID_NS + "Cols"] === "2" && built.store[ID_NS + "Floor"] === "30",
    "with the values they were left at (cols " + built.store[ID_NS + "Cols"]
    + ", floor " + built.store[ID_NS + "Floor"] + ", categories " + built.store[ID_NS + "CatOrder"] + ")");
  let got = null;
  try { got = JSON.parse(built.store[ID_NS + "Pack"] || "null"); } catch (x) {}
  const kept2 = got ? ["favourites", "cardOrder", "catLabels"].filter(k => JSON.stringify(got[k]) === JSON.stringify(OLD_PACK[k])) : [];
  const still = got ? POSITIONAL.filter(k => k in got) : POSITIONAL;
  check(kept2.length === 3 && still.length === 0, "the pack arrived with its "
    + kept2.length + " of 3 content-addressed fields and none of its " + POSITIONAL.length
    + " positional ones" + (still.length ? " - kept: " + still.join(", ") : ""));
  const heldBack = Object.keys(NAME_LAYER).filter(k => built.store[k] === NAME_LAYER[k]);
  check(heldBack.length === Object.keys(NAME_LAYER).length, heldBack.length + " of "
    + Object.keys(NAME_LAYER).length + " keys still under the name hash, for a build that reads them");
  check(built.store[NS_MARK + NAME_NS] === "1", "the adoption marked that layer taken, under "
    + JSON.stringify(NS_MARK + NAME_NS) + ", which no sweep of this build's keys matches");
  check(built.toast === CARRY_NOTICE, "the desk was told, in the sibling adoption's own words ("
    + JSON.stringify(built.toast) + ")");
  const twice = await q.evaluate(() => {
    const before = Object.keys(localStorage).sort().join("|");
    const took = adoptNameNsLayer();
    return { took, same: before === Object.keys(localStorage).sort().join("|") };
  });
  check(twice.took === false && twice.same, "a second pass adopts nothing and writes no key (took "
    + twice.took + ", key set unchanged " + twice.same + ")");

  /* The Clear the user asked for, driven as they drive it: it deletes this namespace's keys,
     leaves the name hash's alone, and reloads. The layer must not walk back in. */
  await q.evaluate(() => { clearLocalMemory(); }).catch(() => {});
  await sleep(3500);
  const after2 = await readStore(q);
  const walkedBack = CARRIED_NAMES.filter(n => after2.store[ID_NS + n] != null);
  check(walkedBack.length === 0, "after a Clear and the reload it performs, none of the "
    + CARRIED_NAMES.length + " keys came back" + (walkedBack.length ? " - back: " + walkedBack.join(", ") : ""));
  check(after2.store[NS_MARK + NAME_NS] === "1" && after2.store[NAME_NS + "Pack"] === NAME_LAYER[NAME_NS + "Pack"],
    "because the marker outlived the Clear, and so did the layer it points at");
  check(qErrs.length === 0, "no page or console error over the build's run" + (qErrs.length ? " - " + qErrs.join(" | ") : ""));
  reachedEnd = true;
})().catch(e => {
  console.error("  FAIL " + String(e && e.stack || e));
  fails++;
}).finally(async () => {
  try { if (b) await b.close(); } catch (x) {}
  RUN.drop();
  if (BUILD) BUILD.drop();
  console.log((reachedEnd ? "" : "  INCOMPLETE - ") + checks + " check(s), " + fails
    + " failed, " + Math.round((Date.now() - t0) / 1000) + "s");
  process.exit(reachedEnd ? fails : (fails || E.NO_VERDICT));
});
