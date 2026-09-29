/* The search one settle runs (the list's filter and score, searchCounts, searchCatRank), over one
 * catalog, as a digest: an oracle for a change to search that is meant to change no result.
 *
 * THE DESK'S OWN ORDER IS HELD AGAINST IT. settle() below is this file's own copy of the list's
 * filter and sort, so a digest of it alone cannot see render.js: on 2026-09-29 three faults planted
 * there (bands inverted, tiers inverted, the category filter dropped) each printed SAME against the
 * parent. So at every record the tree's own route is run beside it, where the tree has one: render()
 * itself, as far as the list it hands over (`shown`), and rankedCards, the order the list and the
 * picker share. Either parting from settle() at any record is a FAIL of this tree alone, before any
 * comparison. A change to the order that is meant is a change to settle() in the same commit.
 *
 *   node tools/search-digest.mjs [--catalog <file>] [--against <src/modules>] [--time N] [--scale K]
 *
 * Exit 0 agreed, 1 differed, 78 no verdict. Prints counts and hashes only, never catalog text. */
process.removeAllListeners("warning");
process.on("warning", () => {});

import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : d; };
const CATALOG = resolve(opt("--catalog", join(ROOT, "shell", "sample-catalog.ec")));
const TIME = +opt("--time", 0), SCALE = Math.max(1, +opt("--scale", 1));
const NO_VERDICT = 78;
const NL = String.fromCharCode(10);

/* ---- The parent: this tree against another, each in a process of its own, dump for dump. */
if (!args.includes("--child")) {
  const self = fileURLToPath(import.meta.url);
  const run = dir => {
    const r = spawnSync(process.execPath, [self, "--child", "--modules", dir, "--catalog", CATALOG,
      "--time", String(TIME), "--scale", String(SCALE)], { encoding: "utf8", maxBuffer: 1 << 28 });
    if (r.status !== 0) { console.log("NO VERDICT: the run over " + dir + " failed" + NL + (r.stderr || "").split(NL).slice(0, 6).join(NL)); process.exit(NO_VERDICT); }
    const cut = r.stdout.indexOf(NL + "----" + NL);
    const head = r.stdout.slice(0, cut).split(NL);
    return { summary: head.filter(l => !/^#counts /.test(l)).join(NL), counts: head.filter(l => /^#counts /.test(l)).join(NL),
             dump: r.stdout.slice(cut + 6) };
  };
  const here = run(join(ROOT, "src", "modules"));
  if (here.counts) console.log(here.counts);            // gate-run's channel, before the verdict line
  console.log("this tree:    " + here.summary);
  if (/ FAIL /.test(here.summary)) process.exit(1);
  const other = opt("--against", "");
  if (!other) process.exit(0);
  const there = run(resolve(other));
  console.log("against:      " + there.summary);
  if (here.dump === there.dump) { console.log("SAME: the two dumps byte for byte, " + Buffer.byteLength(here.dump) + " bytes"); process.exit(0); }
  const a = here.dump.split(NL), b = there.dump.split(NL);
  const at = a.findIndex((l, i) => l !== b[i]);
  console.log("DIFFERENT: first at record " + at + " (phase " + (a[at] || b[at] || "").split("\t")[0] + ")");
  process.exit(1);
}

/* ---- A child: one tree's modules, loaded as tests/module-calls.mjs loads them, and driven. */
const MODDIR = resolve(opt("--modules", join(ROOT, "src", "modules")));
const MOD = n => pathToFileURL(join(MODDIR, n)).href;
globalThis.window = globalThis.window || { innerWidth: 1280, innerHeight: 800 };
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (fn => setTimeout(fn, 0));
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || (id => clearTimeout(id));
/* fill() reads the name and the role off their fields, so every handle is a field; nothing here
   draws, so nothing else of a document is needed. */
const FIELDS = {};
globalThis.document = {
  querySelector: s => FIELDS[s] || (FIELDS[s] = { value: "" }),
  createElement: () => ({ getContext: () => ({}) }),
  createRange: () => ({}),
};
const DOM = await import(MOD("dom.js"));
DOM.grabDom();
const HK = await import(MOD("hooks.js"));
const RL = await import(MOD("rail-list.js"));
{
  /* Every slot a no-op but the fill key, which boot wires and the live half is kept against. */
  const src = fs.readFileSync(join(MODDIR, "hooks.js"), "utf8");
  const list = src.slice(src.indexOf("const SLOTS"), src.indexOf("];", src.indexOf("const SLOTS")));
  const map = {};
  (list.match(/"([A-Za-z]+)"/g) || []).forEach(s => { map[s.slice(1, -1)] = () => {}; });
  map.cardFillKey = RL.cardFillKey;
  map.tourActive = () => false;
  HK.wireHooks(map);
}
const CAT = await import(MOD("catalog.js"));
const PK = await import(MOD("pack.js"));
const CSET = await import(MOD("cat-set.js"));
const AS = await import(MOD("app-state.js"));
const CC = await import(MOD("card-counts.js"));
const CS = await import(MOD("card-search.js"));
const SCORE = await import(MOD("card-score.js"));
const AFF = await import(MOD("affinity.js"));
const SP = await import(MOD("spell.js"));
const CO = await import(MOD("card-order.js"));
const CI = await import(MOD("card-intent.js"));
const CM = await import(MOD("content-model.js"));
/* A tree from before the shared order has no rankedCards; its render() is still held where it runs. */
let RENDER = null, RAS = null;
try { RENDER = await import(MOD("render.js")); } catch { RENDER = null; }
if (RENDER && typeof RENDER.render !== "function") RENDER = null;
const RANKED = !!RENDER && typeof RENDER.rankedCards === "function";
if (RENDER) {
  /* render() reads the root's font size first and draws into the list after handing it over;
     the drawing is not this file's question, so a throw past setShown is expected and read past. */
  globalThis.getComputedStyle = globalThis.getComputedStyle || (() => ({ fontSize: "16px", getPropertyValue: () => "" }));
  globalThis.location = globalThis.location || { protocol: "file:" };
  RAS = AS;
}
let rkChecked = 0, rkDiff = 0, rdChecked = 0, rdDiff = 0, ordering = !!RENDER;   // off while timing
const orderKey = (arr, map) => arr.map(m => { const x = map && map.get(m); return m.id + (x ? ":" + x.band + "/" + x.tier + "/" + x.score : ""); }).join(",");

CAT.eApplyCatalog(CAT.parseCatalogFile(fs.readFileSync(CATALOG, "utf8")));
PK.rebuildBaseCards();
CSET.applyCatsToGlobal();
const one = PK.BASE_M.map(b => Object.assign({}, b));
const cards = [];
for (let s = 0; s < SCALE; s++) one.forEach(b => cards.push(Object.assign({}, b, s ? { id: b.id + "~" + s } : {})));
AS.setCards(cards);
CC.recountMacros();

/* The queries are drawn from the catalog's own words by rule, so none is written here: title
   words, their prefixes and stems, body-only words, a transposition for the spell path, pairs. */
const tWords = new Set(), bWords = new Set();
one.forEach(m => { const x = CS.cardSearchIndex(m); x.words.title.forEach(w => tWords.add(w)); x.words.body.forEach(w => bWords.add(w)); });
const tw = [...tWords].filter(w => w.length >= 4).sort();
const bw = [...bWords].filter(w => w.length >= 6 && !tWords.has(w)).sort();
const pick = (arr, n) => { const out = [], step = Math.max(1, Math.floor(arr.length / n)); for (let i = 0; i < arr.length && out.length < n; i += step) out.push(arr[i]); return out; };
const Q = [];
pick(tw, 12).forEach(w => Q.push(w));
pick(tw, 8).forEach(w => Q.push(w.slice(0, 3)));
pick(tw.filter(w => w.length >= 7), 6).forEach(w => Q.push(w.slice(0, 5)));
pick(bw, 8).forEach(w => Q.push(w));
pick(tw.filter(w => w.length >= 6), 6).forEach(w => Q.push(w.slice(0, 2) + w[3] + w[2] + w.slice(4)));
const tp = pick(tw, 16);
for (let i = 0; i + 1 < tp.length; i += 2) Q.push(tp[i] + " " + tp[i + 1]);
pick(tw, 4).forEach((w, i) => Q.push(w + " " + (pick(bw, 4)[i] || "")));
Q.push("zqxjv", "a", "renamed shelf", "anna");        // nothing; one letter; what two phases bring in
{ const k = Object.keys(CM.CATS)[0]; const w = k ? CS.cardSearchIndex({ c: k }).words.meta[0] : ""; if (w) Q.push(w); }
const QUERIES = [...new Set(Q.map(q => q.trim()).filter(Boolean))];

/* One settle's search, in render's order: its filter, its score and sort, then the pill row's two. */
function settle(q) {
  FIELDS["#intent"].value = q;
  const terms = SP.cardSearchTerms();
  CO.ensureCardOrder();
  const hits = AS.cards.filter(m => CC.cardInActiveCats(m, terms) && CS.cardMatchesSearch(m, terms));
  const sc = new Map();
  if (terms.length) {
    const aterms = AFF.intentAffinityGroups();
    hits.forEach(m => {
      const s = SCORE.cardSearchScore(m, terms, aterms);
      s.band = (AS.intentIdxs.length && CI.cardHitsSelectedIntent(m)) ? 0 : 1;
      sc.set(m, s);
    });
    hits.sort((a, b) => {
      const A = sc.get(a), B = sc.get(b);
      if (A.band !== B.band) return A.band - B.band;
      if (A.tier !== B.tier) return A.tier - B.tier;
      if (A.score !== B.score) return B.score - A.score;
      return CO.cmpCardDisplay(a, b);
    });
  } else hits.sort(CO.cmpCardDisplay);
  if (ordering) {
    if (RANKED) {
      const rk = RENDER.rankedCards(terms, m => CC.cardInActiveCats(m, terms));
      rkChecked++;
      if (orderKey(rk.hits, rk.sc) !== orderKey(hits, sc)) rkDiff++;
    }
    RAS.setShown(null);
    try { RENDER.render(); } catch { /* the drawing, after the list was handed over */ }
    rdChecked++;
    if (!Array.isArray(RAS.shown) || orderKey(RAS.shown) !== orderKey(hits)) rdDiff++;
  }
  const counts = CC.searchCounts();
  return { terms, shown: hits, sc, counts, rank: counts ? CC.searchCatRank() : null };
}
const sorted = o => o == null ? o : Object.keys(o).sort().reduce((a, k) => (a[k] = o[k], a), {});
const lines = [];
let hits = 0, fails = 0, checked = 0;
function record(label, q) {
  const r = settle(q);
  hits += r.shown.length;
  lines.push(label + "\t" + JSON.stringify(r.terms) + "\t"
    + r.shown.map(m => { const s = r.sc.get(m); return m.id + (s ? ":" + s.band + "/" + s.tier + "/" + s.score : ""); }).join(",")
    + "\t" + JSON.stringify(sorted(r.counts)) + "\t" + JSON.stringify(sorted(r.rank)));
  return r;
}
/* WARM AGAINST COLD: after every change of state, each card's answer must equal a fresh copy's,
   which no cache has seen. A memo that outlives its inputs parts company with the copy here. */
function warmCold(label) {
  const aterms = AFF.intentAffinityGroups();
  const copies = AS.cards.map(m => Object.assign({}, m));   // made after the change, so cold to it
  QUERIES.forEach(q => {
    FIELDS["#intent"].value = q;
    const terms = SP.cardSearchTerms();
    if (!terms.length) return;
    AS.cards.forEach((m, i) => {
      const c = copies[i];
      const wm = CS.cardMatchesSearch(m, terms), cm = CS.cardMatchesSearch(c, terms);
      checked++;
      if (wm !== cm) { fails++; return; }
      if (!wm) return;                                     // only a match is ever scored
      const ws = SCORE.cardSearchScore(m, terms, aterms), cs = SCORE.cardSearchScore(c, terms, aterms);
      if (ws.tier !== cs.tier || ws.score !== cs.score) fails++;
    });
  });
  if (fails) console.log(" FAIL warm and cold part company after " + label);
}
function phase(label, change) {
  change();
  QUERIES.forEach(q => record(label, q));
  warmCold(label);
}
phase("plain", () => {});
phase("again", () => {});
QUERIES.slice().reverse().forEach(q => record("reverse", q));
phase("intents", () => { const n = CM.intentCount(); AS.setIntentIdxs(n > 1 ? [0, 1] : (n ? [0] : [])); });
phase("favs", () => { PK.pack.favourites = AS.cards.slice(0, 5).map(m => m.id); });
phase("rename", () => { const k = Object.keys(CM.CATS)[0]; if (k) CM.CATS[k] = "Renamed shelf"; });
phase("pax", () => { FIELDS["#pax"].value = "Anna Nowak"; });
/* The same query twice around a star, nothing else between the two settles. */
QUERIES.forEach(q => {
  const top = record("star1", q).shown[0];
  if (top) { const f = PK.pack.favourites, i = f.indexOf(top.id); if (i > -1) f.splice(i, 1); else f.push(top.id); }
  record("star2", q);
});
warmCold("star");
phase("hidden", () => { AS.cards.slice(5, 9).forEach(m => { m._hidden = 1; }); CC.recountMacros(); });
phase("cat", () => { const k = AS.cards[0] && AS.cards[0].c; AS.setCats(k ? [k] : []); });

let timing = "";
if (TIME) {
  ordering = false;                                      // a timed settle is the settle alone
  AS.setCats([]); AS.setIntentIdxs([]); PK.pack.favourites = [];
  QUERIES.forEach(q => settle(q));                       // a desk has built its caches already
  const per = [];
  for (let r = 0; r < TIME; r++) for (const q of QUERIES) {
    settle("");                                          // the box emptied: every memo moves on
    const t0 = process.hrtime.bigint();
    settle(q);
    per.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  per.sort((a, b) => a - b);
  timing = ", one settle over " + per.length + ": median " + per[per.length >> 1].toFixed(2)
    + " ms, p90 " + per[Math.floor(per.length * 0.9)].toFixed(2) + " ms";
}
const dump = lines.join(NL) + NL;
if (!hits || !checked) { console.error("no search reached a card: nothing was compared"); process.exit(NO_VERDICT); }
if (RENDER && ((RANKED && rkChecked !== lines.length) || rdChecked !== lines.length)) {
  console.error("the desk's order was not run at every settle: " + rkChecked + " of " + lines.length); process.exit(NO_VERDICT);
}
const own = !RENDER ? ", no render() in this tree"
  : (RANKED ? ", the desk's order against this copy " + (rkChecked - rkDiff) + "/" + rkChecked + (rkDiff ? " FAIL " : "") : ", no rankedCards in this tree")
    + ", render's list " + (rdChecked - rdDiff) + "/" + rdChecked + (rdDiff ? " FAIL " : "");
console.log(AS.cards.length + " cards, " + QUERIES.length + " queries, " + lines.length + " records, "
  + hits + " hits, digest " + crypto.createHash("sha256").update(dump).digest("hex").slice(0, 16)
  + ", warm against cold " + (checked - fails) + "/" + checked + (fails ? " FAIL " : "") + own + timing
  + NL + "#counts records=" + lines.length + " warmCold=" + checked + " warmColdDiffer=" + fails
  + (RANKED ? " order=" + rkChecked + " orderDiffer=" + rkDiff : "") + (RENDER ? " renderList=" + rdChecked + " renderListDiffer=" + rdDiff : "")
  + NL + "----" + NL + dump);
process.exit(0);
