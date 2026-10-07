/* The copy routes in bare node: the real src/modules over a stand-in document. A reply copied by the
 * keyboard, by a click, through the picker and from the action button, read as the text the clipboard
 * would receive and the toast it raises; and the action button's dock around a copy.
 *
 *   node tests/copy-routes.mjs     exit code is the number of failed checks, capped at 63
 *
 * THE ORACLES. A copy is read as the text the clipboard would receive. A bubble that asks is found by
 * its markup on a stand-in that parses only what a bubble writes; how anything LOOKS is Maxim's to judge
 * on the desk, and nothing here measures a pixel.
 *
 * NO CONTENT. The cards below are invented here and hold nobody's words.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const nodeRequire = createRequire(import.meta.url);
/* The floor: every check below runs, or the file says it did not complete. */
const EXPECTED = 21;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
const tick = ms => new Promise(r => setTimeout(r, ms || 0));

/* ---- a stand-in document: elements a bubble writes, parsed from its own markup ------------ */
const unq = s => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
class El {
  constructor(tag, attrs) {
    this.tagName = String(tag).toUpperCase(); this.nodeType = 1; this.attrs = Object.assign({}, attrs || {});
    this.kids = []; this.parent = null; this.style = {}; this.listeners = {}; this._text = ""; this._html = "";
    this.value = this.attrs.value != null ? unq(this.attrs.value) : ""; this.connected = false;
    const self = this;
    this.classList = {
      contains: c => (" " + (self.attrs.class || "") + " ").indexOf(" " + c + " ") > -1,
      add: c => { if (!self.classList.contains(c)) self.attrs.class = ((self.attrs.class || "") + " " + c).trim(); },
      remove: c => { self.attrs.class = (" " + (self.attrs.class || "") + " ").replace(" " + c + " ", " ").trim(); },
      toggle: (c, on) => { const want = on === undefined ? !self.classList.contains(c) : !!on; want ? self.classList.add(c) : self.classList.remove(c); return want; },
    };
  }
  get id() { return this.attrs.id || ""; } set id(v) { this.attrs.id = String(v); }
  get className() { return this.attrs.class || ""; } set className(v) { this.attrs.class = String(v); }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; } hasAttribute(k) { return k in this.attrs; }
  toggleAttribute(k, on) { if (on) this.attrs[k] = ""; else delete this.attrs[k]; return !!on; }
  get children() { return this.kids; }
  get textContent() { return this._text; } set textContent(v) { this._text = String(v); this.kids = []; }
  get innerHTML() { return this._html; }
  set innerHTML(h) {
    this._html = String(h); this.kids = [];
    const re = /<(input|p|button|span|label|h3|kbd|div|i)\b([^>]*)>([^<]*)/g; let m;
    while ((m = re.exec(this._html))) {
      const attrs = {}; let a; const ar = /([\w-]+)(?:="([^"]*)")?/g;
      while ((a = ar.exec(m[2]))) attrs[a[1]] = a[2] == null ? "" : a[2];
      const k = new El(m[1], attrs); k._text = unq(m[3]); k.parent = this; this.kids.push(k);
    }
  }
  all() { return this.kids.reduce((o, k) => o.concat([k], k.all()), []); }
  matches(sel) {
    if (sel === "*") return true;
    if (sel.startsWith("#")) return this.attrs.id === sel.slice(1);
    if (sel.startsWith(".")) return sel.slice(1).split(".").every(c => this.classList.contains(c));
    const at = /^\[([\w-]+)\]$/.exec(sel); if (at) return at[1] in this.attrs;
    return this.tagName === sel.toUpperCase();
  }
  querySelectorAll(sel) {
    if (sel.startsWith(":scope > ")) { const s = sel.slice(9); return this.kids.filter(k => k.matches(s)); }
    const parts = sel.split(",").map(s => s.trim());
    return this.all().filter(e => parts.some(s => e.matches(s)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { let e = this; while (e && e.matches) { if (e.matches(sel)) return e; e = e.parent; } return null; }
  appendChild(c) { c.parent = this; this.kids.push(c); c.connected = this.connected || this === DOC.body; c.all().forEach(x => { x.connected = c.connected; }); return c; }
  remove() { if (this.parent) this.parent.kids = this.parent.kids.filter(k => k !== this); this.connected = false; this.all().forEach(x => { x.connected = false; }); }
  get isConnected() { return this.connected; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {}
  focus() { DOC.activeElement = this; }
  get offsetWidth() { return 340; } get offsetHeight() { return 220; }
  getBoundingClientRect() { return { top: 100, left: 100, width: 300, height: 40 }; }
  getContext() { return {}; }
}
function fire(el, type, props) {
  const ev = Object.assign({ type, target: el, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} }, props || {});
  for (let e = el; e; e = e.parent) (e.listeners[type] || []).forEach(fn => fn(ev));
  return ev;
}
const box = v => { const e = new El("input"); e.value = v; return e; };
const els = { "#pax": box("Anna Nowak"), "#roleSel": box(""), "#intent": box("") };
const DOC = {
  body: null, activeElement: null, documentElement: { dataset: {}, classList: { contains: () => false } },
  getElementById: id => (DOC.body.all().find(e => e.attrs.id === id)) || els["#" + id] || null,
  querySelector: s => els[s] || (DOC.body.querySelector(s)), querySelectorAll: s => DOC.body.querySelectorAll(s),
  createElement: tag => new El(tag), createRange: () => ({}), addEventListener() {}, removeEventListener() {}, visibilityState: "visible",
};
DOC.body = new El("body"); DOC.body.connected = true;
DOC.body.classList.contains = () => false;
Object.defineProperty(globalThis, "navigator", { configurable: true,
  value: { language: "en-US", languages: ["en-US"], clipboard: null } });
globalThis.document = DOC;
globalThis.window = { innerWidth: 1280, innerHeight: 800, isSecureContext: true, addEventListener() {}, removeEventListener() {} };
globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);

const HK = await import(MOD("hooks.js"));
["railDecorate", "syncSampleMark", "markEntrySel", "render", "rebuildCards", "syncIntentOrder", "drawIntentRail",
 "syncFavouritesMeta", "drawPillsCore", "drawTabsCore", "applyLangUI", "updateIntentPlaceholder", "scheduleRailGeometry"]
  .forEach(k => { HK.hooks[k] = () => {}; });
const Dom = await import(MOD("dom.js"));
Dom.grabDom();
const AS = await import(MOD("app-state.js"));
const PK = await import(MOD("pack.js"));
const ST = await import(MOD("storage.js"));
const CE = await import(MOD("copy-entry.js"));
const PICK = await import(MOD("pick.js"));
const TB = await import(MOD("tabs.js"));
const V2 = await import(MOD("catalog-v2.js"));
const CT = await import(MOD("catalog.js"));
const LP = await import(MOD("list-pointer.js"));
ST.lsSet("eMotionOff", "1");
ST.lsSet("eNameAsked", "1");
ST.lsSet("eAgent", "Kate");
AS.putLang("en");
PK.pack.custom = [];

/* The desk's own keyboard copy of a block, with the clipboard caught rather than written. */
function deskCopy(id, vi) {
  let got = null;
  navigator.clipboard = { writeText: t => { got = t; return { then() {} }; } };
  AS.putEntrySel({ id: id, vi: vi || 0 });
  CE.copyEntrySel(false);
  navigator.clipboard = null;
  return got;
}
/* A card and its block that list-pointer's own click handler can take: the stand-in's matches() reads
   one simple selector, so the card and the block answer `.class[attr]` here. */
class Hit extends El {
  get dataset() { const d = {}; for (const k in this.attrs) if (k.startsWith("data-")) d[k.slice(5)] = this.attrs[k]; return d; }
  matches(sel) { const m = /^\.([\w-]+)\[([\w-]+)\]$/.exec(sel); return m ? this.classList.contains(m[1]) && m[2] in this.attrs : super.matches(sel); }
}
/* Every bubble that asks before a copy goes is a .bub-ask; none may stand after a copy below. */
const asking = () => DOC.body.all().filter(e => e.classList.contains("bub-ask")).length;

try {
  console.log("[1/3] a brace in a reply is copied as written, and nothing is asked");
  /* A catalog an older Studio wrote, while the format still had fill-in fields: one declared, and a card
     naming it in braces. The format no longer has the key, so the desk carries it as any key it does not
     name, and the brace is a brace. */
  const WHERE = "Order {order number} left today.";
  const older = extra => Object.assign({ format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 1,
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-orders", kind: "shelf", label: { en: "Orders" } }],
    cards: [{ id: "c-where", shelf: "t-orders", bodyShape: "plain", title: { en: "Where it is" }, body: { en: WHERE } }],
    fields: [{ id: "order", label: { en: "order number" }, kind: "text" }] }, extra || {});
  const read = V2.catalogFromV2(older()), back = V2.catalogToV2(read);
  const odd = V2.v2Problems(older({ fields: { any: "shape" } }));
  check(!("fields" in read) && !!read.ext && JSON.stringify(read.ext.fields) === JSON.stringify(older().fields)
    && JSON.stringify(back.fields) === JSON.stringify(older().fields) && odd.length === 0,
    "1a the format has no `fields` key: an older catalog's is carried as a key the desk does not name, written back"
    + " whole, and never checked: " + JSON.stringify({ named: "fields" in read, problems: odd }));
  const cat = CT.parseCatalogFile(JSON.stringify(older()));
  CT.eApplyCatalog(cat);
  AS.setCards(cat.cards.map(c => Object.assign({}, c)));
  const keyed = deskCopy("c-where"), keyAsked = asking();
  check(keyed === WHERE && !keyAsked, "1b the keyboard's copy puts the brace on the clipboard as written and asks nothing: "
    + JSON.stringify({ keyed, asking: keyAsked }));
  const listEl = new El("div", { id: "list" });
  const block = listEl.appendChild(new Hit("div", { class: "card", "data-id": "c-where" })).appendChild(new Hit("p", { class: "txt", "data-v": "0" }));
  els["#list"] = listEl; Dom.grabDom(); LP.wireListPointer();
  let clicked = null;
  navigator.clipboard = { writeText: t => { clicked = t; return { then() {} }; } };
  fire(block, "click", { button: 0 });
  navigator.clipboard = null;
  const clickAsked = asking();
  delete els["#list"]; Dom.grabDom();
  check(clicked === WHERE && !clickAsked, "1c and so does a click on the block: " + JSON.stringify({ clicked, asking: clickAsked }));
  const picked = PICK.answerPick("copy", JSON.stringify({ id: "c-where", vi: 0 }));
  check(!!picked && picked.text === WHERE && !("need" in picked),
    "1d the picker is answered with the text itself, never with anything to fill: " + JSON.stringify(picked));
  let askGot = null;
  navigator.clipboard = { writeText: t => { askGot = t; return { then() {} }; } };
  const viaAsk = PICK.answerPick("ask", JSON.stringify({ id: "c-where", vi: 0 }));
  navigator.clipboard = null;
  check(!!viaAsk && viaAsk.asked === true && askGot === WHERE && !asking(),
    "1e and the picker's ask copies it in the desk as written: " + JSON.stringify(askGot));
  CT.eResetCatalog();

  console.log("\n[2/3] a copy carries the card's stamp, on every route");
  /* The stamp (S4b) rides the copy's third argument into mark.js's copy() and on to toast(). module-calls
     814O reads the three calls as text and 814M the formatter alone, so this is where the stamp is seen to
     arrive in the toast. A card with commits:1 toasts stamped on the keyboard, click and picker-ask routes,
     and one without does not (the control). */
  { const hadGCS = globalThis.getComputedStyle;
    const toastEl = new El("div", { id: "toast" }); els["#toast"] = toastEl;
    toastEl.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
    globalThis.getComputedStyle = window.getComputedStyle = () => ({ getPropertyValue: () => "", borderLeftWidth: "0", borderRightWidth: "0", paddingLeft: "0", paddingRight: "0" });
    const stampShown = () => /t-stamp/.test(toastEl.innerHTML) && toastEl.classList.contains("stamped");
    AS.setCards([
      { id: "c-sworn", c: "orders", t: "Sworn", en: "The order is promised today.", commits: 1 },
      { id: "c-loose", c: "orders", t: "Loose", en: "The order may go today." },
    ]);
    const list7 = new El("div", { id: "list" }), block7 = {};
    for (const id of ["c-sworn", "c-loose"]) block7[id] = list7.appendChild(new Hit("div", { class: "card", "data-id": id })).appendChild(new Hit("p", { class: "txt", "data-v": "0" }));
    els["#list"] = list7; Dom.grabDom(); LP.wireListPointer();
    /* One copy by one route. */
    const route = (how, id) => {
      const sink = {};
      toastEl.innerHTML = ""; toastEl.textContent = ""; toastEl.classList.remove("stamped"); toastEl.classList.remove("show");
      navigator.clipboard = { writeText: t => { sink.got = t; return { then(ok) { ok(); } }; } };
      if (how === "key") { AS.putEntrySel({ id, vi: 0 }); CE.copyEntrySel(false); }
      if (how === "click") fire(block7[id], "click", { button: 0 });
      if (how === "ask") PICK.answerPick("ask", JSON.stringify({ id, vi: 0 }));
      navigator.clipboard = null;
      return { copied: /^The order /.test(sink.got || ""), stamped: stampShown() };
    };
    const ok7 = (r, want) => r.copied && r.stamped === want;
    try {
      const r = {
        a: route("key", "c-sworn"), b: route("click", "c-sworn"), c: route("ask", "c-sworn"),
        d: route("key", "c-loose"), e: route("click", "c-loose"), f: route("ask", "c-loose"),
      };
      check(ok7(r.a, true), "2a the keyboard copy of a card that commits copies, toast stamped: " + JSON.stringify(r.a));
      check(ok7(r.b, true), "2b the click copy of a card that commits copies, toast stamped: " + JSON.stringify(r.b));
      check(ok7(r.c, true), "2c the picker's ask copy of a card that commits, toast stamped: " + JSON.stringify(r.c));
      check(ok7(r.d, false), "2d control: the keyboard copy of a card that does not commit, toast not stamped: " + JSON.stringify(r.d));
      check(ok7(r.e, false), "2e control: the click copy of a card that does not commit, toast not stamped: " + JSON.stringify(r.e));
      check(ok7(r.f, false), "2f control: the picker's ask copy of a card that does not commit, toast not stamped: " + JSON.stringify(r.f));
    } finally {
      navigator.clipboard = null;
      delete els["#list"]; delete els["#toast"]; Dom.grabDom();
      globalThis.getComputedStyle = window.getComputedStyle = hadGCS;
    }
  }
  console.log("\n[3/3] the action button: its replies, and its dock around a copy");
  /* The action button's replies (board 814, S5): Ctrl+1 to 4 copy the reply at that place of the tab in
     front by the desk's own route, so a stamped one toasts stamped; a place holding nothing copies nothing
     and lets the key fall through. */
  { const ND = await import(MOD("next-dock.js"));
    const hadGCS = globalThis.getComputedStyle;
    const toastEl = new El("div", { id: "toast" }); els["#toast"] = toastEl;
    toastEl.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
    globalThis.getComputedStyle = window.getComputedStyle = () => ({ getPropertyValue: () => "", borderLeftWidth: "0", borderRightWidth: "0", paddingLeft: "0", paddingRight: "0" });
    const fabEl = DOC.body.appendChild(new El("button", { id: "nextFab", class: "fab fab-next" }));
    fabEl.getBoundingClientRect = () => ({ top: 760, left: 1106, width: 44, height: 44 });
    AS.setCards([
      { id: "c-from8", c: "orders", t: "From", en: "Opening.", next: [{ to: "c-sworn8" }, { to: "c-plain8" }] },
      { id: "c-sworn8", c: "orders", t: "Sworn", en: "The order is promised today.", commits: 1 },
      { id: "c-plain8", c: "orders", t: "Plain", en: "A reply with no field." },
    ]);
    TB.tabs.splice(0, TB.tabs.length); ST.ssSet(TB.TAB_KEY, "null"); TB.initTabs();
    const sink = {};
    const last = () => ((TB.tabs[0] && TB.tabs[0].path) || []).slice(-1)[0] || "";
    const stamped = () => /t-stamp/.test(toastEl.innerHTML) && toastEl.classList.contains("stamped");
    const fresh = () => { sink.got = undefined; toastEl.innerHTML = ""; toastEl.textContent = ""; toastEl.classList.remove("stamped"); };
    try {
      navigator.clipboard = { writeText: t => { sink.got = t; return { then(ok) { ok(); } }; } };
      LP.bumpUseCount("c-from8", "en");
      fresh();
      const r2 = ND.copyNextReply(1);
      const b = { ret: r2, copied: sink.got === "A reply with no field.", stamped: stamped(), last: last() };
      LP.bumpUseCount("c-from8", "en");
      fresh();
      const r1 = ND.copyNextReply(0);
      const a = { ret: r1, copied: sink.got === "The order is promised today.", stamped: stamped(), last: last(), asking: asking() };
      LP.bumpUseCount("c-from8", "en");
      fresh();
      const c = { ret: ND.copyNextReply(2), copied: sink.got !== undefined, last: last() };
      check(a.ret === true && a.copied && a.stamped && a.last === "c-sworn8" && !a.asking,
        "3a Ctrl+1 copies the first reply of the tab in front at once, toast stamped, and the conversation steps on: " + JSON.stringify(a));
      check(b.ret === true && b.copied && !b.stamped && b.last === "c-plain8",
        "3b Ctrl+2 copies the second, its toast plain: " + JSON.stringify(b));
      check(c.ret === false && !c.copied && c.last === "c-from8",
        "3c control: Ctrl+3 where nothing waits copies nothing, answers false so the key falls through, and the path stays: " + JSON.stringify(c));
      /* Board 863: the copy is made at the press, before the step the lanes walk and the button pulses on. */
      const order = [];
      navigator.clipboard = { writeText: () => { order.push("copy after " + last()); return { then(ok) { ok(); } }; } };
      TB.watchTabPath(() => order.push("step to " + last()));
      try { ND.copyNextReply(1); } finally { TB.watchTabPath(null); }
      check(order.join(", ") === "copy after c-from8, step to c-plain8",
        "3j the copy is made before the conversation steps on: " + JSON.stringify(order));
    } finally {
      navigator.clipboard = null;
      fabEl.remove(); delete els["#toast"];
      TB.tabs.splice(0, TB.tabs.length);
      globalThis.getComputedStyle = window.getComputedStyle = hadGCS;
    }
  }
  /* The action button after a copy (decisions 2026-10-01 10:29 and 10:34, 09:27): a step brings the digit and
     the pulse and never unfolds the dock; holding Ctrl does, and letting go folds it; a reply learnt after
     the last one that commits the firm is offered like any other, with its seal and its learnt mark. */
  { const ND = await import(MOD("next-dock.js"));
    const hadGCS = globalThis.getComputedStyle, hadAdd = globalThis.addEventListener, hadDE = DOC.documentElement.addEventListener;
    const on = {};
    globalThis.addEventListener = (k, fn) => { (on[k] = on[k] || []).push(fn); };
    DOC.documentElement.addEventListener = () => {};
    globalThis.getComputedStyle = window.getComputedStyle = () => ({ getPropertyValue: () => "", borderLeftWidth: "0", borderRightWidth: "0", paddingLeft: "0", paddingRight: "0" });
    const modal = new El("div", { id: "modal" }); modal.hidden = true; els["#modal"] = modal; const hadRange = DOC.createRange; DOC.createRange = () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }) }); Dom.grabDom();
    const fabEl = DOC.body.appendChild(new El("button", { id: "nextFab", class: "fab fab-next" }));
    fabEl.hidden = true;
    fabEl.getBoundingClientRect = () => ({ top: 760, left: 1106, width: 44, height: 44 });
    const key = (type, ctrl) => (on[type] || []).forEach(fn => fn({ type, key: "Control", ctrlKey: ctrl, metaKey: false }));
    AS.setCards([
      { id: "c-lead9", c: "orders", t: "Lead", en: "Opening." },
      { id: "c-sworn9", c: "orders", t: "Sworn", en: "It ships today.", commits: 1 },
    ]);
    const fresh = () => { TB.tabs.splice(0, TB.tabs.length); ST.ssSet(TB.TAB_KEY, "null"); TB.initTabs(); };
    try {
      navigator.clipboard = { writeText: () => ({ then(ok) { ok(); } }) };
      ND.wireNextDock();
      fresh(); ["c-lead9", "c-sworn9", "c-lead9", "c-sworn9"].forEach(id => LP.bumpUseCount(id, "en"));
      // A new conversation is drawn as the desk draws one, through render's sync of the button.
      fresh(); ND.syncNextDock();
      const before = { shown: !fabEl.hidden, open: ND.nextDockOpen() };
      LP.bumpUseCount("c-lead9", "en");
      const after = { shown: !fabEl.hidden, pulse: fabEl.classList.contains("nudge"), open: ND.nextDockOpen() };
      key("keydown", true);
      const held = { open: ND.nextDockOpen() };
      const dock = DOC.getElementById("nextDock"), html = dock ? dock.innerHTML : "";
      const row = (/<button[^>]*class="nd-row"[\s\S]*?<\/button>/.exec(html) || [""])[0];
      key("keyup", false);
      held.folded = !ND.nextDockOpen();
      check(!before.shown && !before.open && after.shown && after.pulse && !after.open && held.open && held.folded,
        "3d a copy shows the action button and pulses it and never unfolds the dock; holding Ctrl unfolds it and letting go folds it: " + JSON.stringify({ before, after, held }));
      check(/Sworn/.test(row) && /nd-stamp/.test(row) && /nd-learnt/.test(row),
        "3e a reply learnt after the last one that commits the firm is offered, with its seal and its learnt mark: " + JSON.stringify(row.replace(/<svg[\s\S]*?<\/svg>/g, "").slice(0, 200)));
    } finally {
      ND.foldNextDock(); TB.watchTabPath(null);
      navigator.clipboard = null;
      fabEl.remove(); const d = DOC.getElementById("nextDock"); if (d) d.remove();
      delete els["#modal"]; DOC.createRange = hadRange; Dom.grabDom();
      TB.tabs.splice(0, TB.tabs.length);
      globalThis.addEventListener = hadAdd; DOC.documentElement.addEventListener = hadDE;
      globalThis.getComputedStyle = window.getComputedStyle = hadGCS;
    }
  }
  /* A name cleared ends the conversation's path (ruling 8e-B): the tab is reused for the next customer, so the
     next copy is the first of a path, no pair is learnt across the two, the beads empty and the action button
     leaves with them. Only the step from a name to none does it. */
  { const ND = await import(MOD("next-dock.js")), DS = await import(MOD("desk-stats.js"));
    const hadGCS = globalThis.getComputedStyle, hadSync = HK.hooks.syncNextDock;
    globalThis.getComputedStyle = window.getComputedStyle = () => ({ getPropertyValue: () => "", borderLeftWidth: "0", borderRightWidth: "0", paddingLeft: "0", paddingRight: "0" });
    const fabEl = DOC.body.appendChild(new El("button", { id: "nextFab", class: "fab fab-next" }));
    fabEl.getBoundingClientRect = () => ({ top: 760, left: 1106, width: 44, height: 44 });
    HK.hooks.syncNextDock = () => ND.syncNextDock();
    AS.setCards([
      { id: "c-a9", c: "orders", t: "A", en: "First.", next: [{ to: "c-b9" }] },
      { id: "c-b9", c: "orders", t: "B", en: "Second.", next: [{ to: "c-c9" }] },
      { id: "c-c9", c: "orders", t: "C", en: "Third." },
    ]);
    const name = els["#pax"];
    const path = () => TB.tabPathNow().path.join(",");
    const learntAfterB = () => DS.statsLearntAfter(PK.pack, "c-b9").map(o => o.id).join(",");
    try {
      TB.tabs.splice(0, TB.tabs.length); ST.ssSet(TB.TAB_KEY, "null"); TB.initTabs();
      Dom.grabDom();
      name.value = "Anna Nowak"; TB.scheduleTabSave();
      LP.bumpUseCount("c-a9", "en"); LP.bumpUseCount("c-b9", "en");
      const before = { path: path(), beads: ND.pathBeads(TB.tabPathNow().path) };
      name.value = "Anna Now"; TB.scheduleTabSave();
      const typed = { path: path(), shown: !fabEl.hidden };
      name.value = "Anna Nowak"; TB.scheduleTabSave();
      name.value = ""; TB.scheduleTabSave();
      const cleared = { path: path(), beads: ND.pathBeads(TB.tabPathNow().path), shown: !fabEl.hidden };
      LP.bumpUseCount("c-c9", "en");
      const after = { path: path(), learnt: learntAfterB() };
      check(before.path === "c-a9,c-b9" && !!before.beads && before.beads.sent === 2 && typed.path === "c-a9,c-b9" && typed.shown,
        "3f typing over a name leaves the conversation's path and its beads as they were: " + JSON.stringify({ before, typed }));
      check(cleared.path === "" && cleared.beads === null && !cleared.shown,
        "3g clearing the name ends the path: nothing is left of it, the beads are empty and the action button leaves: " + JSON.stringify(cleared));
      check(after.path === "c-c9" && after.learnt === "",
        "3h the next copy starts at step 1, and no pair is learnt from the copy before the name was cleared: " + JSON.stringify(after));
      // A tab that never had a name: a save with the box empty is no clearing.
      TB.tabs.splice(0, TB.tabs.length); ST.ssSet(TB.TAB_KEY, "null"); TB.initTabs();
      name.value = ""; TB.scheduleTabSave();
      LP.bumpUseCount("c-a9", "en"); LP.bumpUseCount("c-b9", "en");
      TB.scheduleTabSave();
      check(path() === "c-a9,c-b9",
        "3i control: a conversation that never named the customer keeps its path through a save with the box empty: " + JSON.stringify(path()));
    } finally {
      ND.foldNextDock(); TB.watchTabPath(null);
      fabEl.remove(); HK.hooks.syncNextDock = hadSync;
      TB.tabs.splice(0, TB.tabs.length);
      globalThis.getComputedStyle = window.getComputedStyle = hadGCS;
    }
  }
} catch (e) {
  failed++;
  console.log("  FAIL the run threw: " + String(e && e.stack || e).split("\n").slice(0, 4).join(" | "));
}

const complete = asserted >= EXPECTED;
console.log("\n#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
console.log(complete && !failed ? "RESULT: ok " + asserted + " check(s)"
  : "RESULT: FAIL " + failed + " failed" + (complete ? "" : ", and only " + asserted + " of " + EXPECTED + " ran"));
process.exit(Math.min(63, failed + (complete ? 0 : 1)));
