/* THE DESK STARTED AGAIN IN PLACE, held to a fresh start. Chrome, no fixtures.
 *
 *   node tests/swap.mjs
 *
 * Load, eject, clearing local memory and their Undos change the desk without reloading the page
 * (main.js, restartDesk). The oracle is the one Maxim's ruling states: a desk swapped from catalog
 * A to catalog B equals, in stored data and in the DOM, a desk freshly started with B, and A to the
 * empty desk and back to A equals a fresh A with the same personal layer. So every leg does the act
 * in place, takes a fingerprint, then starts the same page afresh from the same storage (the
 * session emptied, as a new launch has it) and takes another; the two must be equal. Any module
 * still holding a piece of A shows up as a difference, and a page that reloads to do the act fails
 * before any fingerprint is taken.
 *
 * THE FINGERPRINT has three parts, each compared whole:
 *   storage  every localStorage key and value, and every sessionStorage key and value
 *   state    every value the page exports on window (the bundle spreads every module export there),
 *            serialised to depth 6; a DOM node is written as its tag and id
 *   dom      document.body's markup, scripts and the passing surfaces removed (the toast, the Undo
 *            bubble, a leaving copy), style attributes kept
 * Tab ids are minted from the clock, so each part has them replaced by their place in the tab
 * list first. What else is volatile is named in VOLATILE with its reason, and nothing else is.
 *
 * THE MARKER. Every word catalog A brings starts "Qalpha" and every own card "Qown"; after the swap
 * to B the marker may appear only under A's own layer in storage, which is where the orbit keeps it.
 *
 * Catalogs A and B are the shipped sample rewritten here, so nothing in this file is content.
 * Exit code is the number of failed checks; 78 when the run could not complete.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

let fails = 0, checks = 0;
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- the two catalogs ------------------------------------------------------------------- */
const sample = JSON.parse(fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8"));
const clone = o => JSON.parse(JSON.stringify(o));
// The marker goes on every NAME (a title, a label, a clause) and never into a body, whose shape it would break.
function marked(doc, word, keepLangs) {
  const NAMES = ["title", "label", "clause", "action", "topic"];
  const walk = (o, named) => {
    if (!o || typeof o !== "object") return;
    if (named && typeof o.en === "string" && o.en) o.en = word + " " + o.en;
    if (!keepLangs && "pl" in o && "en" in o) delete o.pl;
    Object.keys(o).forEach(k => walk(o[k], NAMES.indexOf(k) > -1));
  };
  walk(doc.tags, false); walk(doc.cards, false);
  return doc;
}
const A = marked(Object.assign(clone(sample), { id: "swap-alpha", name: "Alpha" }), "Qalpha", true);
A.facts = "Qalpha facts\nfor the swap";
delete A.sample;
const B = marked(Object.assign(clone(sample), { id: "swap-beta", name: "Beta" }), "Qbeta", false);
B.langs = [{ code: "en", label: "EN" }];
delete B.sample; delete B.facts; delete B.greet; delete B.role; delete B.commentLang;
B.cards = B.cards.slice(0, 40);
{
  const used = new Set(B.cards.map(c => c.shelf));
  B.tags = B.tags.filter(t => t.kind !== "shelf" || used.has(t.id));
}
const ALPHA_NS_SEED = A.id;

/* ---- the page ---------------------------------------------------------------------------- */
const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-swap-"));
fs.copyFileSync(E.ENGINE_PATH, path.join(lab, "etiuda.html"));
const url = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");

/* WHAT IS VOLATILE AND WHY. Nothing else is excused. */
const VOLATILE = {
  ePackEpoch: "counts every save the page has made, so a restart that saved once more reads higher",
  toastSerial: "counts toasts shown since the page opened",
  eDeskSeen: "the moment of the last start",
  E_SELF: "the document as this page parsed it, the head script's classes of that load included",
  tabSaveTimer: "a timer's handle, a number the browser picks",
};

async function fingerprint(q) {
  return q.evaluate(vol => {
    const tabIds = (typeof tabs !== "undefined" && Array.isArray(tabs)) ? tabs.map(t => t.id) : [];
    const mask = s => { let o = String(s); tabIds.forEach((id, i) => { o = o.split(id).join("TAB" + i); }); return o; };
    const store = {};
    Object.keys(localStorage).sort().forEach(k => { store["ls:" + k] = mask(localStorage.getItem(k)); });
    Object.keys(sessionStorage).sort().forEach(k => { store["ss:" + k] = mask(sessionStorage.getItem(k)); });
    const seen = new WeakSet();
    const ser = (v, d) => {
      if (v === null || v === undefined) return String(v);
      const t = typeof v;
      if (t === "function") return "fn";
      if (t !== "object") return JSON.stringify(v);
      if (typeof Node !== "undefined" && v instanceof Node) return "<" + (v.nodeName || "") + (v.id ? "#" + v.id : "") + ">";
      if (seen.has(v)) return "[seen]";
      if (d > 6) return "[deep]";
      seen.add(v);
      let out;
      if (v instanceof Map) out = "Map{" + [...v.entries()].map(([k, x]) => ser(k, d + 1) + ":" + ser(x, d + 1)).join(",") + "}";
      else if (v instanceof Set) out = "Set{" + [...v].map(x => ser(x, d + 1)).join(",") + "}";
      else if (v instanceof WeakMap || v instanceof WeakSet || v instanceof Promise) out = "[weak]";
      else if (Array.isArray(v)) out = "[" + v.map(x => ser(x, d + 1)).join(",") + "]";
      else out = "{" + Object.keys(v).sort().map(k => k + ":" + ser(v[k], d + 1)).join(",") + "}";
      seen.delete(v);
      return out;
    };
    const state = {};
    (window.__swapNames || []).forEach(n => {
      if (vol[n]) return;
      let v;
      try { v = window[n]; } catch (e) { v = "[threw]"; }
      if (typeof v === "function") return;
      state[n] = mask(ser(v, 0));
    });
    /* The markup written canonically: attributes in name order and an empty style or class
       attribute as none, since neither the order a script sets them in nor an emptied attribute is
       a difference anybody sees. */
    const canon = n => {
      if (n.nodeType === 3) return n.data;
      if (n.nodeType !== 1) return "";
      const tag = n.nodeName.toLowerCase();
      if (tag === "script" || n.id === "toast" || n.id === "eUndo" || (n.classList && n.classList.contains("e-gone"))) return "";
      // A tour put away keeps its last step's placement on hidden markup until it next runs.
      if (n.id === "tourRoot" && n.hidden) return "<tourroot hidden>";
      const at = [...n.attributes].filter(a => !((a.name === "style" || a.name === "class") && !a.value.trim()))
        .map(a => a.name + "=" + JSON.stringify(a.value)).sort().join(" ");
      return "<" + tag + (at ? " " + at : "") + ">" + [...n.childNodes].map(canon).join("") + "</" + tag + ">";
    };
    return { store, state, dom: mask(canon(document.body)) };
  }, VOLATILE);
}
function diff(a, b) {
  const out = [];
  ["store", "state"].forEach(part => {
    const keys = new Set(Object.keys(a[part]).concat(Object.keys(b[part])));
    keys.forEach(k => {
      const x = String(a[part][k]), y = String(b[part][k]);
      if (x === y) return;
      let i = 0;
      while (i < x.length && x[i] === y[i]) i++;
      out.push(part + " " + k + " at " + i + ": " + JSON.stringify(x.slice(Math.max(0, i - 50), i + 60)) + " | " + JSON.stringify(y.slice(Math.max(0, i - 50), i + 60)));
    });
  });
  if (a.dom !== b.dom) {
    let i = 0;
    while (i < a.dom.length && a.dom[i] === b.dom[i]) i++;
    out.push("dom at " + i + ": " + JSON.stringify(a.dom.slice(Math.max(0, i - 60), i + 80)) + " | "
      + JSON.stringify(b.dom.slice(Math.max(0, i - 60), i + 80)));
  }
  return out;
}

let browser = null;
const t0 = Date.now();
const ctxs = [];
async function page() {
  const c = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  ctxs.push(c);
  const q = await c.newPage();
  await q.setViewport({ width: 1400, height: 900 });
  q.on("pageerror", x => errs.push("pageerror: " + String(x.message || x)));
  let navs = 0;
  q.on("framenavigated", f => { if (f === q.mainFrame()) navs++; });
  q.navs = () => navs;
  await q.goto(url, { waitUntil: "load", timeout: 60000 });
  await q.evaluate(() => {
    localStorage.setItem("eTourDone_v3", "1"); localStorage.setItem("eTourInvite_v3", "1");
    localStorage.setItem("eAgent", "Invented Agent"); localStorage.setItem("eNameAsked", "1");
  });
  await fresh(q, false);
  return q;
}
// A new launch of the page on what is stored: the session emptied, the names the app exports read.
async function fresh(q, keepSession) {
  if (!keepSession) await q.evaluate(() => sessionStorage.clear());
  await q.reload({ waitUntil: "load", timeout: 60000 });
  await settle(q);
}
async function settle(q) {
  await q.waitForFunction(() => typeof boot === "undefined" || document.getElementById("eBooted") || true, { timeout: 30000 });
  await sleep(1800);
  /* A desk that has forgotten its tour starts one by itself once the logo has formed: waited for,
     so both sides of a comparison are read with it standing. */
  await q.waitForFunction(() => (localStorage.getItem("eTourDone_v3") != null || localStorage.getItem("eTourInvite_v3") != null)
    || (typeof tourActive === "function" && tourActive()), { timeout: 8000 }).catch(() => {});
  await sleep(700);
  await q.evaluate(() => {
    if (!window.__swapBase) {
      const f = document.createElement("iframe"); document.body.appendChild(f);
      window.__swapBase = new Set(Object.getOwnPropertyNames(f.contentWindow)); f.remove();
    }
    window.__swapNames = Object.getOwnPropertyNames(window).filter(n => !window.__swapBase.has(n) && n.indexOf("__swap") !== 0).sort();
  });
}
// The act in place: it must not navigate, and the desk settles before it is read.
async function inPlace(q, fn, arg) {
  const before = q.navs();
  await q.evaluate(fn, arg);
  await settle(q);
  return q.navs() === before;
}
const load = doc => { const c = parseCatalogFile(doc); activateCatalog(c, { from: c.name.toLowerCase() + ".ec" }); };
const errs = [];

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true,
    args: ["--hide-scrollbars"], protocolTimeout: 180000 });

  /* 1. A TO B. A is loaded, a card of it is edited and another starred, and the page starts
     afresh; then B is loaded in place. */
  try {
    const q = await page();
    const stayed0 = await inPlace(q, load, JSON.stringify(A));
    await fresh(q, false);
    await q.evaluate(() => {
      const ids = cards.map(c => c.id);
      pack.overrides[ids[1]] = { t: "Qalpha edited title" }; savePack(); rebuildCards();
      toggleFavourite(ids[3]);
    });
    await fresh(q, false);
    const stayed = await inPlace(q, load, JSON.stringify(B));
    const got = await fingerprint(q);
    const leak = await q.evaluate(seed => {
      const alphaNs = eNsFor(seed);
      const bad = [];
      Object.keys(localStorage).forEach(k => {
        if (k.indexOf(alphaNs) === 0) return;
        if (/Qalpha/.test(localStorage.getItem(k))) bad.push("storage " + k);
      });
      if (/Qalpha/.test(document.body.innerHTML)) bad.push("dom");
      return bad;
    }, ALPHA_NS_SEED);
    const stateLeak = Object.keys(got.state).filter(k => /Qalpha/.test(got.state[k]));
    await fresh(q, false);
    const ref = await fingerprint(q);
    const d = diff(got, ref);
    check(stayed0 && stayed, "1a loading a catalog does not reload the page (A " + stayed0 + ", then B " + stayed + ")");
    check(d.length === 0, "1b a desk swapped from A to B equals a fresh start with B, in storage, exported state and DOM"
      + (d.length ? ": " + d.length + " difference(s): " + d.slice(0, 8).join(" ; ") : ""));
    check(leak.length === 0 && stateLeak.length === 0, "1c nothing of A is left in view after the swap, and A's words stay only in A's own layer"
      + (leak.length || stateLeak.length ? ": " + leak.concat(stateLeak.map(k => "state " + k)).slice(0, 8).join(", ") : ""));
    await q.close();
  } catch (x) { check(false, "the scenario stopped: " + String(x && x.message || x).split(String.fromCharCode(10))[0]); }

  /* 2. A TO THE EMPTY DESK AND BACK TO A, with a personal layer: an edit, a star, an own card. */
  try {
    const q = await page();
    await inPlace(q, load, JSON.stringify(A));
    await fresh(q, false);
    const made = await q.evaluate(() => {
      const ids = cards.map(c => c.id);
      pack.overrides[ids[1]] = { t: "Qalpha edited title" };
      pack.custom.push({ id: "u:swapown", c: cards[0].c, t: "Qown card", en: "Qown body", pl: "" });
      savePack(); rebuildCards();
      toggleFavourite(ids[3]);
      return { edited: ids[1], starred: ids[3] };
    });
    await fresh(q, false);
    const withLayer = await fingerprint(q);
    const ejected = await inPlace(q, () => ejectCatalog());
    const empty = await fingerprint(q);
    const emptyShows = await q.evaluate(() => ({ cards: cards.length, desk: !!document.querySelector(".empty-desk"),
      own: /Qown|Qalpha/.test(document.getElementById("list").innerHTML) }));
    await fresh(q, false);
    const emptyRef = await fingerprint(q);
    const dEmpty = diff(empty, emptyRef);
    check(ejected, "2a ejecting does not reload the page");
    check(dEmpty.length === 0 && emptyShows.cards === 0 && emptyShows.desk && !emptyShows.own,
      "2b the ejected desk equals a fresh empty desk and shows nothing of A's layer ("
      + JSON.stringify(emptyShows) + ")" + (dEmpty.length ? ": " + dEmpty.slice(0, 8).join(" ; ") : ""));
    const back = await inPlace(q, load, JSON.stringify(A));
    const again = await fingerprint(q);
    const shows = await q.evaluate(m => ({
      edit: !!document.querySelector('#list .card[data-id="' + m.edited + '"]') && /Qalpha edited title/.test(document.getElementById("list").innerHTML),
      star: isFavourite(m.starred), own: cards.some(c => c.id === "u:swapown") }), made);
    await fresh(q, false);
    const againRef = await fingerprint(q);
    const dBack = diff(again, againRef), dLayer = diff(againRef, withLayer);
    check(back && dBack.length === 0, "2c loading A again in place equals a fresh start with A"
      + (dBack.length ? ": " + dBack.slice(0, 8).join(" ; ") : ""));
    check(dLayer.length === 0 && shows.edit && shows.star && shows.own,
      "2d and it equals the fresh A the layer was made on: the edit, the star and the own card came back with the catalog ("
      + JSON.stringify(shows) + ")" + (dLayer.length ? ": " + dLayer.slice(0, 8).join(" ; ") : ""));

    /* 3. THE UNDOS. Eject, then its Undo, equals the fresh A with its layer; so does clearing local
       memory and its Undo. Cleared, the desk equals a fresh start from what the clear left. The
       empty desk's own loose layer is left out of the first comparison: a visit to the empty desk
       writes it, in place or fresh alike, and it is not A's. */
    const notLoose = f => { const o = { store: {}, state: f.state, dom: f.dom };
      Object.keys(f.store).forEach(k => { if (!/^ls:e(Pack|Stats|Days|CatOrder|IntentOrder|IntentsAside|LinksAside|RequestsAside|Exported)$/.test(k)) o.store[k] = f.store[k]; });
      return o; };
    await inPlace(q, () => ejectCatalog());
    const undone = await inPlace(q, () => { const b = document.getElementById("eUndoBtn"); if (b) b.click(); });
    const afterUndo = await fingerprint(q);
    const dUndo = diff(notLoose(afterUndo), notLoose(withLayer));
    check(undone && dUndo.length === 0, "3a Eject and its Undo, in place, leave the desk a fresh start with A and its layer"
      + (dUndo.length ? ": " + dUndo.slice(0, 8).join(" ; ") : ""));
    const cleared = await inPlace(q, () => clearLocalMemory());
    const clearedShows = await q.evaluate(() => ({ cards: cards.length, own: cards.some(c => c.id === "u:swapown"),
      agent: localStorage.getItem("eAgent"), undo: !!document.getElementById("eUndoBtn"), sure: !!document.querySelector(".modal:not([hidden]) #eSureYes") }));
    check(cleared && clearedShows.cards > 0 && !clearedShows.own && clearedShows.agent === null && clearedShows.undo && !clearedShows.sure,
      "3b clearing local memory happens at once, asks nothing, keeps the catalog and offers Undo (" + JSON.stringify(clearedShows) + ")");
    const unCleared = await inPlace(q, () => { const b = document.getElementById("eUndoBtn"); if (b) b.click(); });
    const afterClearUndo = await fingerprint(q);
    const dClearUndo = diff(notLoose(afterClearUndo), notLoose(withLayer));
    check(unCleared && dClearUndo.length === 0, "3c the clear's Undo gives back the desk it cleared, equal to the fresh A with its layer"
      + (dClearUndo.length ? ": " + dClearUndo.slice(0, 8).join(" ; ") : ""));
    await inPlace(q, () => clearLocalMemory());
    await q.evaluate(() => { const u = document.getElementById("eUndo");
      if (u) u.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await settle(q);
    const clearedFp = await fingerprint(q);
    await fresh(q, false);
    const clearedRef = await fingerprint(q);
    const dClear = diff(clearedFp, clearedRef);
    check(dClear.length === 0, "3d the cleared desk, its Undo let go, equals a fresh start from what the clear left"
      + (dClear.length ? ": " + dClear.slice(0, 8).join(" ; ") : ""));
    await q.close();
  } catch (x) { check(false, "the scenario stopped: " + String(x && x.message || x).split(String.fromCharCode(10))[0]); }

  /* 4. LOOSE CONTENT. An own card made on the empty desk; loading a catalog over it asks first. */
  try {
    const q = await page();
    await q.evaluate(() => {
      pack.custom.push({ id: "u:loose", c: "gen", t: "Qown loose", en: "Qown loose body", pl: "" });
      savePack(); rebuildCards();
    });
    await q.evaluate(load, JSON.stringify(A)); await sleep(600);
    const asked = await q.evaluate(() => ({ bubble: !!document.getElementById("eLoose"), loaded: !!storedCatalog(),
      loose: /Qown loose/.test(localStorage.getItem(eLayer() + "Pack") || "") }));
    const anyway = await inPlace(q, () => document.getElementById("eLooseLoad").click());
    const after = await q.evaluate(() => ({ loaded: (storedCatalog() || {}).id || null, own: cards.some(c => c.id === "u:loose"),
      looseKept: Object.keys(localStorage).some(k => /^e[A-Z]/.test(k) && /Qown loose/.test(localStorage.getItem(k))) }));
    check(asked.bubble && !asked.loaded && asked.loose, "4a loading a catalog over loose content never exported asks first, and nothing is loaded yet ("
      + JSON.stringify(asked) + ")");
    check(anyway && after.loaded === "swap-alpha" && !after.own && !after.looseKept,
      "4b Load anyway loads in place and erases the loose content (" + JSON.stringify(after) + ")");
    await q.evaluate(() => ejectCatalog()); await settle(q);
    await q.evaluate(() => {
      pack.custom.push({ id: "u:loose2", c: "gen", t: "Qown second", en: "Qown second body", pl: "" });
      savePack(); rebuildCards();
      window.__saved = [];
      window.showSaveFilePicker = o => Promise.resolve({ name: "Mine.ec",
        createWritable: () => Promise.resolve({ write: t => { window.__saved.push(String(t)); return Promise.resolve(); },
          close: () => Promise.resolve() }) });
    });
    await q.evaluate(load, JSON.stringify(A)); await sleep(600);
    const exported = await inPlace(q, () => document.getElementById("eLooseExport").click());
    const out = await q.evaluate(() => {
      const t = window.__saved[0]; let d = null; try { d = JSON.parse(t); } catch (e) {}
      return { saved: window.__saved.length, id: d && d.id, rev: d && d.rev, own: !!d && d.cards.some(c => /Qown second/.test(JSON.stringify(c.title))),
        loaded: (storedCatalog() || {}).id || null };
    });
    check(exported && out.saved === 1 && /^[a-z0-9][a-z0-9-]{2,63}$/.test(out.id || "") && out.id !== "swap-alpha" && out.rev === 1
          && out.own && out.loaded === "swap-alpha",
      "4c Export saves the loose cards as a new catalog, a random id of the format's shape and its first edition, and then loads ("
      + JSON.stringify(out) + ")");
    await q.close();
  } catch (x) { check(false, "the scenario stopped: " + String(x && x.message || x).split(String.fromCharCode(10))[0]); }
  /* 5. SETTINGS RESET happens at once with its Undo: two preferences set, the reset pressed as a
     person presses it, and the Undo gives both back, on screen as well as in storage. */
  try {
    const q = await page();
    await q.evaluate(() => { lsSet("eTheme", "light"); lsSet("eNoteHover", "0"); applyPrefs(); });
    await sleep(400);
    const had = await q.evaluate(() => document.documentElement.dataset.theme || "");
    await q.evaluate(() => openSettings()); await sleep(600);
    await q.evaluate(() => document.getElementById("setReset").click()); await sleep(600);
    const reset = await q.evaluate(() => ({ theme: lsGet("eTheme"), hover: document.body.classList.contains("note-hover"),
      undo: !!document.getElementById("eUndoBtn"), asked: !!document.querySelector(".modal-card[role=alertdialog]") }));
    await q.evaluate(() => { const b = document.getElementById("eUndoBtn"); if (b) b.click(); }); await sleep(600);
    const back = await q.evaluate(() => ({ theme: lsGet("eTheme"), hover: document.body.classList.contains("note-hover"),
      shown: document.documentElement.dataset.theme || "" }));
    check(reset.theme === null && reset.hover && reset.undo && !reset.asked && back.theme === "light" && !back.hover && back.shown === had,
      "5 resetting the settings happens at once with no window and offers Undo, which gives both preferences back on screen ("
      + JSON.stringify({ had, reset, back }) + ")");
    await q.close();
  } catch (x) { check(false, "the scenario stopped: " + String(x && x.message || x).split(String.fromCharCode(10))[0]); }
  check(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.slice(0, 4).join(" | ") : ""));
  console.log("\n" + (checks - fails) + "/" + checks + " checks passed in " + Math.round((Date.now() - t0) / 1000) + " s");
  console.log(fails ? "SWAP: " + fails + " FAILED" : "SWAP: ALL PASSED");
} catch (e) {
  console.log("  FAIL the run stopped: " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
  console.log("SUITE DID NOT COMPLETE");
  fails = 78;
} finally {
  for (const c of ctxs) { try { await c.close(); } catch (e) {} }
  if (browser) { try { await browser.close(); } catch (e) {} }
  E.removeLab(lab);
}
process.exit(fails === 78 ? 78 : E.exitOf(fails));
