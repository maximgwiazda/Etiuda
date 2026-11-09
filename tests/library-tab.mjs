/* THE DESK'S LIBRARY AS A SCREEN TAB, driven through the desk's own modules in bare node.
 *
 *   node tests/library-tab.mjs     exit code is the number of failed checks, capped at 63
 *
 * The Library opens as a named tab through the screen tabs mechanism: the Menu's Library opens a tab
 * named Library, a second open fronts the one tab, an editor opened from it closes back onto it,
 * Earlier versions is a page inside it whose Back returns to the list, and the desk started again in
 * place (a catalog loaded, put down or cleared) comes back on the Library's tab.
 *
 * The page is a small DOM written below, with a parser for the markup the desk writes, so the buttons
 * pressed are the ones the Library rendered, by their own handlers. Two of the legs are proved on their
 * failure path as well: each plant is lifted in a scratch copy of src/, never in the tree, and the
 * same leg is run there by a child of this file, which must go red.
 *
 * No catalog and no content: the desk is the empty one, and the one saved copy is an invented name.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const argv = process.argv.slice(2);
const childAt = argv.indexOf("--child");
const SRC_ROOT = childAt >= 0 ? argv[childAt + 1] : path.join(ROOT, "src");
const ONLY = childAt >= 0 ? argv[childAt + 2] : "";
const MOD = n => pathToFileURL(path.join(SRC_ROOT, "modules", n)).href;

/* ================================================================================================
   A PAGE SMALL ENOUGH TO READ, as tests/catalog-trust-desk.mjs writes one: elements, text, a parser
   for the markup the desk writes, and compound selectors, here with selector lists as well.
   ================================================================================================ */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&nbsp;": " " };
class TextNode {
  constructor(s) { this.nodeType = 3; this.data = String(s); this.parentNode = null; }
  get textContent() { return this.data.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, m => ENT[m]); }
  set textContent(s) { this.data = String(s); }
  get nodeValue() { return this.data; }
  set nodeValue(s) { this.data = String(s); }
  remove() { if (this.parentNode) this.parentNode._drop(this); }
}
class El {
  constructor(tag, doc) {
    this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.localName = String(tag).toLowerCase();
    this.ownerDocument = doc; this.childNodes = []; this.parentNode = null; this.attrs = new Map();
    this.listeners = {}; this.style = { setProperty() {}, removeProperty() {} };
    this.offsetWidth = 0; this.offsetHeight = 0; this.scrollTop = 0; this.scrollLeft = 0; this.scrollHeight = 0;
    const self = this;
    this.classList = {
      contains: c => self._classes().includes(c),
      add: (...cs) => { const s = self._classes(); cs.forEach(c => { if (!s.includes(c)) s.push(c); }); self.setAttribute("class", s.join(" ")); },
      remove: (...cs) => { self.setAttribute("class", self._classes().filter(c => !cs.includes(c)).join(" ")); },
      toggle: (c, on) => { const want = on === undefined ? !self.classList.contains(c) : !!on;
        if (want) self.classList.add(c); else self.classList.remove(c); return want; },
    };
    this.dataset = new Proxy({}, {
      get: (o, k) => typeof k === "string" ? (self.getAttribute("data-" + k.replace(/[A-Z]/g, m => "-" + m.toLowerCase())) ?? undefined) : undefined,
      set: (o, k, v) => { self.setAttribute("data-" + String(k).replace(/[A-Z]/g, m => "-" + m.toLowerCase()), v); return true; },
    });
  }
  _classes() { return String(this.attrs.get("class") || "").split(/\s+/).filter(Boolean); }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get firstElementChild() { return this.children[0] || null; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get id() { return this.attrs.get("id") || ""; }
  set id(v) { this.setAttribute("id", v); }
  get className() { return this.attrs.get("class") || ""; }
  set className(v) { this.setAttribute("class", v); }
  get hidden() { return this.attrs.has("hidden"); }
  set hidden(v) { if (v) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); }
  get title() { return this.attrs.get("title") || ""; }
  set title(v) { this.setAttribute("title", v); }
  get type() { return this.attrs.get("type") || ""; }
  set type(v) { this.setAttribute("type", v); }
  get disabled() { return this.attrs.has("disabled"); }
  set disabled(v) { if (v) this.setAttribute("disabled", ""); else this.removeAttribute("disabled"); }
  get open() { return this.attrs.has("open"); }
  set open(v) { if (v) this.setAttribute("open", ""); else this.removeAttribute("open"); }
  get tabIndex() { return +(this.attrs.get("tabindex") || -1); }
  set tabIndex(v) { this.setAttribute("tabindex", v); }
  get value() { return this._value !== undefined ? this._value : (this.attrs.get("value") || ""); }
  set value(v) { this._value = String(v); }
  setAttribute(k, v) { k = String(k).toLowerCase(); const had = this.attrs.has(k); this.attrs.set(k, String(v)); if (!had) detailsToggle(this, k, "closed"); }
  getAttribute(k) { const v = this.attrs.get(String(k).toLowerCase()); return v === undefined ? null : v; }
  hasAttribute(k) { return this.attrs.has(String(k).toLowerCase()); }
  removeAttribute(k) { k = String(k).toLowerCase(); const had = this.attrs.has(k); this.attrs.delete(k); if (had) detailsToggle(this, k, "open"); }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument.documentElement; }
  appendChild(n) { if (n.parentNode) n.parentNode._drop(n); n.parentNode = this; this.childNodes.push(n); return n; }
  append(...ns) { ns.forEach(n => this.appendChild(typeof n === "string" ? new TextNode(n) : n)); }
  replaceChildren(...ns) { this.childNodes.forEach(n => { n.parentNode = null; }); this.childNodes = []; this.append(...ns); }
  insertBefore(n, ref) {
    if (n.parentNode) n.parentNode._drop(n);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    n.parentNode = this;
    if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
    return n;
  }
  _drop(n) { const i = this.childNodes.indexOf(n); if (i > -1) this.childNodes.splice(i, 1); n.parentNode = null; }
  removeChild(n) { this._drop(n); return n; }
  remove() { if (this.parentNode) this.parentNode._drop(this); }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const i = this.parentNode.childNodes.indexOf(this);
    return i >= 0 ? (this.parentNode.childNodes[i + 1] || null) : null;
  }
  /* A template's markup lives on content, which is where the card list reads a painted card. */
  get content() {
    if (this.localName !== "template") return undefined;
    if (!this._content) this._content = new El("div", this.ownerDocument);
    return this._content;
  }
  contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  get textContent() { return this.childNodes.map(n => n.textContent).join(""); }
  set textContent(s) { this.childNodes.forEach(n => { n.parentNode = null; }); this.childNodes = []; if (String(s)) this.appendChild(new TextNode(s)); }
  get innerHTML() {
    const box = this.localName === "template" && this._content ? this._content : this;
    return box.childNodes.map(serial).join("");
  }
  set innerHTML(html) {
    const box = this.localName === "template" ? this.content : this;
    box.childNodes.forEach(n => { n.parentNode = null; });
    box.childNodes = [];
    parseInto(box, String(html));
  }
  get outerHTML() { return serial(this); }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn); }
  dispatchEvent() { return true; }
  focus() { this.ownerDocument.activeElement = this; }
  blur() {}
  click() { if (typeof this.onclick === "function") this.onclick({ type: "click", target: this, preventDefault() {}, stopPropagation() {} }); }
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; }
  getClientRects() { return []; }
  closest(sel) { let n = this; while (n && n.nodeType === 1) { if (matches(n, sel, null)) return n; n = n.parentNode; } return null; }
  matches(sel) { return matches(this, sel, null); }
  querySelectorAll(sel) { return queryAll(this, sel); }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
  animate() { return { finished: Promise.resolve(), cancel() {}, onfinish: null }; }
  getAnimations() { return []; }
  scrollIntoView() {}
  getContext() { return { font: "", measureText: t => ({ width: String(t).length * 7 }) }; }
}
/* A details element's toggle, as the HTML standard queues it: on the open attribute added or removed,
   parsed markup included, fired a task later with any pending one folded in, so it sees the final state. */
function detailsToggle(el, k, was) {
  if (k !== "open" || el.localName !== "details") return;
  if (el._toggle) { was = el._toggle.was; clearImmediate(el._toggle.id); }
  const id = setImmediate(() => { el._toggle = null;
    (el.listeners.toggle || []).slice().forEach(fn => fn({ type: "toggle", target: el, oldState: was, newState: el.open ? "open" : "closed" })); });
  el._toggle = { id, was };
}
function serial(n) {
  if (n.nodeType === 3) return n.data;
  const a = [...n.attrs].map(([k, v]) => " " + k + "=\"" + v.replace(/"/g, "&quot;") + "\"").join("");
  return VOID.has(n.localName) ? "<" + n.localName + a + ">" : "<" + n.localName + a + ">" + n.innerHTML + "</" + n.localName + ">";
}
const TAG = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
function parseInto(root, html) {
  const stack = [root];
  let at = 0, m;
  const tag = new RegExp(TAG.source, "g");
  while ((m = tag.exec(html))) {
    if (m.index > at) stack[stack.length - 1].appendChild(new TextNode(html.slice(at, m.index)));
    at = tag.lastIndex;
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) {
      const name = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].localName === name) { stack.length = i; break; }
      continue;
    }
    const el = new El(m[2], root.ownerDocument);
    let a; const attr = new RegExp(ATTR.source, "g");
    while ((a = attr.exec(m[3] || ""))) el.setAttribute(a[1], (a[2] ?? a[3] ?? a[4] ?? "").replace(/&quot;/g, "\"").replace(/&amp;/g, "&"));
    stack[stack.length - 1].appendChild(el);
    if (!m[4] && !VOID.has(el.localName)) stack.push(el);
  }
  if (at < html.length) stack[stack.length - 1].appendChild(new TextNode(html.slice(at)));
}
/* Compound selectors joined by descendant spaces or `>`, `:scope >` at the head, `:not(...)` over one simple
   selector, and lists joined by commas. Anything else throws, so a gap here is a red leg, never a quiet miss. */
const SIMPLE = String.raw`#[\w-]+|\.[\w-]+|\[[\w-]+(?:=(?:"[^"]*"|[\w-]+))?\]`;
const COMPOUND = new RegExp("^([a-zA-Z][\\w-]*|\\*)?((?:" + SIMPLE + "|:not\\((?:" + SIMPLE + ")\\))*)$");
function parts(sel) { return String(sel).trim().replace(/\s*>\s*/g, " > ").split(/\s+/); }
function compound(el, c) {
  const m = COMPOUND.exec(c);
  if (!m) throw new Error("stub page: selector " + c);
  if (m[1] && m[1] !== "*" && el.localName !== m[1].toLowerCase()) return false;
  const bits = m[2].match(new RegExp(":not\\((?:" + SIMPLE + ")\\)|" + SIMPLE, "g")) || [];
  const one = b => b[0] === "#" ? el.id === b.slice(1)
    : b[0] === "." ? el.classList.contains(b.slice(1))
    : (() => { const q = /^\[([\w-]+)(?:=(?:"([^"]*)"|([\w-]+)))?\]$/.exec(b); const v = q[2] ?? q[3];
        return v === undefined ? el.hasAttribute(q[1]) : el.getAttribute(q[1]) === v; })();
  return bits.every(b => b.startsWith(":not(") ? !one(b.slice(5, -1)) : one(b));
}
function matchOne(el, sel, scope) {
  const ps = parts(sel);
  let i = ps.length - 1;
  if (!compound(el, ps[i])) return false;
  let node = el;
  for (i--; i >= 0; i--) {
    if (ps[i] === ">") {
      i--;
      node = node.parentNode;
      if (ps[i] === ":scope") { if (node !== scope) return false; continue; }
      if (!node || node.nodeType !== 1 || !compound(node, ps[i])) return false;
      continue;
    }
    let up = node.parentNode;
    while (up && up.nodeType === 1 && !compound(up, ps[i])) up = up.parentNode;
    if (!up || up.nodeType !== 1) return false;
    node = up;
  }
  return true;
}
function matches(el, sel, scope) { return String(sel).split(",").some(s => matchOne(el, s, scope)); }
function queryAll(root, sel) {
  const out = [];
  const walk = n => n.children.forEach(c => { if (matches(c, sel, root)) out.push(c); walk(c); });
  walk(root);
  return out;
}
function makeDocument() {
  const doc = { listeners: {}, visibilityState: "visible", hidden: false, readyState: "complete", activeElement: null };
  doc.createElement = t => new El(t, doc);
  doc.createDocumentFragment = () => new El("fragment", doc);
  doc.createElementNS = (_ns, t) => new El(t, doc);
  doc.createTextNode = s => new TextNode(s);
  doc.createTreeWalker = () => ({ nextNode: () => null });
  doc.documentElement = new El("html", doc);
  doc.head = doc.documentElement.appendChild(new El("head", doc));
  doc.body = doc.documentElement.appendChild(new El("body", doc));
  doc.activeElement = doc.body;
  doc.createRange = () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) });
  doc.contains = n => doc.documentElement.contains(n);
  doc.getElementById = id => queryAll(doc.documentElement, "#" + id)[0] || null;
  doc.querySelector = sel => queryAll(doc.documentElement, sel)[0] || null;
  doc.querySelectorAll = sel => queryAll(doc.documentElement, sel);
  doc.addEventListener = (t, fn) => { (doc.listeners[t] = doc.listeners[t] || []).push(fn); };
  doc.removeEventListener = (t, fn) => { doc.listeners[t] = (doc.listeners[t] || []).filter(f => f !== fn); };
  doc.elementFromPoint = () => null;
  return doc;
}

/* ================================================================================================
   THE DESK: the band's strip, the screen tabs' host, the shared pop-up, the Menu with its Library row.
   ================================================================================================ */
const doc = makeDocument();
const mem = new Map();
const store = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(String(k), String(v)),
  removeItem: k => mem.delete(k), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
const smem = new Map();
const sstore = { getItem: k => (smem.has(k) ? smem.get(k) : null), setItem: (k, v) => smem.set(String(k), String(v)),
  removeItem: k => smem.delete(k), key: i => [...smem.keys()][i] ?? null, get length() { return smem.size; } };
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.localStorage = store;
globalThis.sessionStorage = sstore;
globalThis.innerWidth = 1280; globalThis.innerHeight = 880;
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "", paddingRight: "0", paddingLeft: "0", overflowY: "visible" });
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
try { Object.defineProperty(globalThis, "navigator", { value: { language: "en", languages: ["en"], platform: "Win32", userAgent: "node" }, configurable: true }); } catch (e) {}

doc.body.innerHTML = '<header><div class="row"><div id="tabsWrap"><div id="tabsBar" class="tabs-bar" role="tablist"></div></div>'
  + '<div id="settingsWrap" class="menu-wrap"><button type="button" id="settingsBtn">Menu</button>'
  + '<div id="settingsMenu" hidden><button type="button" data-act="manage">Library</button>'
  + '<button type="button" data-act="settings">Settings</button></div></div>'
  + '<div id="moreWrap"><button type="button" id="moreBtn"></button><div id="moreMenu" hidden></div></div></div></header>'
  + '<div id="screenHost" class="screen-host" hidden></div>'
  + '<div class="fills"><input id="pax"><select id="roleSel"></select><input id="intent"></div>'
  + '<div id="seg"></div><div id="pills"></div>'
  + '<div class="stage" id="main"><div id="list"></div></div>'
  + '<div id="modal" class="modal" hidden><div id="modalCard" class="modal-card"></div></div>'
  + '<div id="toast"></div><div id="eSay"></div>';

const results = [];
function check(name, fn) {
  if (ONLY && name.split(" ")[0] !== ONLY) return;
  let r;
  try { r = fn(); } catch (e) { r = "threw " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e); }
  results.push({ name, ok: r === true, why: r === true ? "" : String(r) });
}
async function checkAsync(name, fn) {
  if (ONLY && name.split(" ")[0] !== ONLY) return;
  let r;
  try { r = await fn(); } catch (e) { r = "threw " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e); }
  results.push({ name, ok: r === true, why: r === true ? "" : String(r) });
}
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };

const H = await import(MOD("hooks.js"));
const Dom = await import(MOD("dom.js"));
const T = await import(MOD("tabs.js"));
const STAB = await import(MOD("screen-tabs.js"));
const MG = await import(MOD("manage.js"));
const ED = await import(MOD("editors.js"));
const HM = await import(MOD("header-menus.js"));
const R = await import(MOD("restart.js"));
const PK = await import(MOD("pack.js"));
const AS = await import(MOD("app-state.js"));
const CM = await import(MOD("content-model.js"));
const RB = await import(MOD("rebuild.js"));
const RD = await import(MOD("render.js"));

const STUBS = ["applyLangUI", "updateIntentPlaceholder", "drawPillsCore", "drawIntentRail", "render", "scheduleRailGeometry",
  "segFolded", "syncRailGeometry", "rebuildCards", "syncSampleMark", "markEntrySel", "railDecorate", "runShortcut",
  "shedWordmarkW", "openSettings", "startTour", "endTour", "tourActive", "closeSettingsMenu", "syncSettingsMenu",
  "syncAddFab", "syncNextDock", "syncFavouritesMeta", "flushPillState", "cardOrderTouched", "railEchoRedraw",
  "captureRail", "capturePills", "keepPoolAcross", "syncSaveNotice", "clearIntents", "onRailMQChange", "clearSearchQuery"];
/* Every slot the lower layer may call answers, inert unless named below: what is under test is the Library's tab. */
const SLOTS = [...fs.readFileSync(path.join(SRC_ROOT, "modules", "hooks.js"), "utf8")
  .match(/const SLOTS = \[([\s\S]*?)\];/)[1].matchAll(/"(\w+)"/g)].map(m => m[1]);
SLOTS.concat(STUBS).forEach(k => { H.hooks[k] = () => {}; });
H.hooks.listEntryEls = () => [];
H.hooks.railRelKeys = () => [];
H.hooks.tourActive = () => false;
H.hooks.shedWordmarkW = () => 0;
H.hooks.openManage = (...a) => MG.openManage(...a);
H.hooks.mgCardsIn = (...a) => MG.mgCardsIn(...a);
H.hooks.openIntentEditor = (...a) => ED.openIntentEditor(...a);
H.hooks.openCategoryEditor = (...a) => ED.openCategoryEditor(...a);
H.hooks.restartDesk = () => R.restartDesk();
Dom.grabDom();

/* The host keeps one saved copy, so the Library offers Earlier versions; it reads nothing else. */
const SAVED = [{ path: "C:/lab/invented.ec", sha: "aa11", name: "invented.ec", place: "other", dir: "C:/lab",
  first: 1767225600000, rev: 3, cards: 2, macros: 2, intents: 1, cats: 1, put: false, current: true }];
window.E_HOST = { historyList: () => SAVED, historyRead: () => null, historyPut: () => ({ ok: false }), catalogFolder: "C:/lab/catalogs" };

const $ = s => doc.querySelector(s);
const host = () => $("#screenHost");
const modal = () => $("#modal");
const libraryStrip = () => doc.querySelectorAll("#tabsBar .tab").filter(b => b.getAttribute("data-sid") === "library");
const pressMenuLibrary = () => {
  $("#settingsMenu").hidden = false;
  $("#settingsMenu").onclick({ target: $('#settingsMenu [data-act="manage"]'), stopPropagation() {} });
};
const conversations = () => doc.querySelectorAll("#tabsBar .tab").filter(b => !b.classList.contains("screen"));

ssSetTabs();
function ssSetTabs() {
  smem.clear();
  const tab = (id, who) => ({ id, pax: who, title: "", lang: "en", intentIdxs: [], intentText: "", intentBox: "", who: "", cats: [] });
  sstore.setItem("eSessionTabs", JSON.stringify({ v: 1, activeTabId: "t-a", tabs: [tab("t-a", "Anna"), tab("t-b", "Bartek")] }));
}

let wired = "";
try { T.initTabs(); HM.wireHeaderMenus(); } catch (e) { wired = "the desk did not start: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e); }

check("L1 the Menu's Library opens a tab named Library, in front, with the Library's lists in it", () => {
  if (wired) return wired;
  pressMenuLibrary();
  const strip = libraryStrip();
  const name = strip[0] ? strip[0].textContent.trim() : "";
  const page = host().querySelector(".lib-list");
  return STAB.screenOn === "library" && strip.length === 1 && name === "Library" && strip[0].classList.contains("on")
    && !host().hidden && doc.body.classList.contains("screen-on") && modal().hidden
    && !!page && !!host().querySelector("#mgCatList") && !!host().querySelector("#mgClose")
    && (host().querySelector(".screen-head h2") || {}).textContent === "Library"
    || JSON.stringify({ screenOn: STAB.screenOn, strip: strip.length, name, hostHidden: host().hidden, modalHidden: modal().hidden, page: !!page });
});

check("L2 a second open fronts the one tab: a conversation clicked in front of it, then the Menu's Library again", () => {
  if (wired) return wired;
  const conv = conversations()[0];
  if (!conv) return "no conversation tab";
  conv.click();
  const away = STAB.screenOn === "" && host().hidden;
  pressMenuLibrary();
  return away && STAB.screenOn === "library" && STAB.screens.filter(x => x === "library").length === 1 && libraryStrip().length === 1
    && !host().hidden && !!host().querySelector("#mgCatList")
    || JSON.stringify({ away, screenOn: STAB.screenOn, screens: STAB.screens, strip: libraryStrip().length });
});

check("L3 an editor opened from the Library is a pop-up over the tab, and closing it returns to the Library's tab", () => {
  if (wired) return wired;
  if (STAB.screenOn !== "library") MG.openManage();
  const before = host().querySelector(".lib-list");
  const add = host().querySelector("#mgAddIntent");
  if (!add) return "no New intent in the Library";
  add.click();
  const over = !modal().hidden && !!$("#ieCancel") && STAB.screenOn === "library" && !!host().querySelector("#mgCatList");
  $("#ieCancel").click();
  const after = host().querySelector(".lib-list");
  return over && modal().hidden && STAB.screenOn === "library" && !host().hidden && !!after && after !== before
    || JSON.stringify({ over, modalHidden: modal().hidden, screenOn: STAB.screenOn, repainted: !!after && after !== before });
});

await checkAsync("L4 Earlier versions opens as a page inside the Library's tab, and Back returns to the Library's list", async () => {
  if (wired) return wired;
  if (STAB.screenOn !== "library") MG.openManage();
  const door = host().querySelector("#mgHistory");
  if (!door) return "no Earlier versions door in the Library";
  door.click();
  await settle();
  const inTab = STAB.screenOn === "library" && modal().hidden && !!host().querySelector("#ehView")
    && !!host().querySelector("#ehView [data-eh-open]") && !host().querySelector("#mgCatList")
    && libraryStrip().length === 1 && (host().querySelector(".screen-head h2") || {}).textContent === "Saved copies";
  const back = host().querySelector("#ehClose");
  if (!back) return "no Back on the page: " + JSON.stringify({ inTab });
  const said = back.textContent.trim();
  back.click();
  await settle();
  return inTab && said === "Back to the Library" && STAB.screenOn === "library" && !!host().querySelector("#mgCatList")
    && !host().querySelector("#ehView") && modal().hidden
    || JSON.stringify({ inTab, said, screenOn: STAB.screenOn, list: !!host().querySelector("#mgCatList") });
});

check("L5 the desk started again in place (a catalog loaded, put down or cleared) comes back on the Library's tab", () => {
  if (wired) return wired;
  if (STAB.screenOn !== "library") MG.openManage();
  const before = host().querySelector(".lib-list");
  H.hooks.restartDesk();
  const after = host().querySelector(".lib-list");
  return STAB.screenOn === "library" && !host().hidden && !!after && after !== before && !!host().querySelector("#mgCatList")
    && libraryStrip().length === 1 && libraryStrip()[0].classList.contains("on")
    || JSON.stringify({ screenOn: STAB.screenOn, hostHidden: host().hidden, repainted: !!after && after !== before });
});

check("L6 its Close and its cross close the tab and return to the conversation in front before it", () => {
  if (wired) return wired;
  conversations()[1].click();
  MG.openManage();
  host().querySelector("#mgClose").click();
  const closed = STAB.screenOn === "" && !STAB.screens.includes("library") && host().hidden && libraryStrip().length === 0
    && conversations()[1].classList.contains("on");
  MG.openManage();
  const x = libraryStrip()[0] && libraryStrip()[0].querySelector(".tab-x");
  if (!x) return "no cross on the Library's tab";
  x.onclick({ stopPropagation() {} });
  return closed && STAB.screenOn === "" && !STAB.screens.includes("library") && libraryStrip().length === 0
    || JSON.stringify({ closed, screenOn: STAB.screenOn, screens: STAB.screens });
});

/* The section list is the page: four Library sections, one of them on screen, and a click swaps which. */
check("L7 the Library lists its sections and shows one page, and a section click shows that page", () => {
  if (wired) return wired;
  if (STAB.screenOn !== "library") MG.openManage();
  const root = host().querySelector(".sx.lm-lib");
  if (!root) return "no library shell";
  const secs = [...host().querySelectorAll(".sx.lm-lib .sx-sec")];
  if (secs.length !== 4) return "sections " + secs.length;
  const shown = [...host().querySelectorAll(".sx.lm-lib details.manage-sec")].filter(d => !d.hasAttribute("hidden"));
  if (shown.length !== 1) return "shown " + shown.length;
  const other = secs.find(b => b.getAttribute("data-lm") !== shown[0].getAttribute("data-mg"));
  if (!other) return "no other section";
  other.click();
  const shown2 = [...host().querySelectorAll(".sx.lm-lib details.manage-sec")].filter(d => !d.hasAttribute("hidden"));
  const title = host().querySelector("#libTitle");
  const want = (other.querySelector("span") || {}).textContent || "";
  return shown2.length === 1 && shown2[0].getAttribute("data-mg") === other.getAttribute("data-lm")
    && !!title && title.textContent === want
    || JSON.stringify({ n: shown2.length, mg: shown2[0] && shown2[0].getAttribute("data-mg"),
      lm: other.getAttribute("data-lm"), title: title && title.textContent, want });
});

/* Maintenance joins the same shell. The readings stay in the page; the click only changes which group is on screen. */
await checkAsync("L8 the Maintenance tab lists its sections and shows one page, and a section click shows that page", async () => {
  if (wired) return wired;
  const MT = await import(MOD("maintenance.js"));
  MT.openMaintenance();
  const root = host().querySelector(".sx.lm-mt");
  if (!root) return "no maintenance shell";
  const secs = [...root.querySelectorAll(".sx-sec")];
  if (secs.length < 6) return "sections " + secs.length;
  const other = secs.find(b => b.getAttribute("data-mt") !== root.getAttribute("data-page"));
  if (!other) return "no other page";
  other.click();
  const now = host().querySelector(".sx.lm-mt");
  const title = host().querySelector("#mtTitle");
  const want = (other.querySelector("span") || {}).textContent || "";
  const nsec = host().querySelectorAll(".mt-sec").length;
  return !!now && now.getAttribute("data-page") === other.getAttribute("data-mt")
    && !!title && title.textContent === want
    && !!host().querySelector(".mt-grid") && nsec >= 6
    && !!host().querySelector("#mtEject") && !!host().querySelector("#mtCopy")
    && !!host().querySelector("#mtClose") && !!host().querySelector("#mtMoved")
    || JSON.stringify({ page: now && now.getAttribute("data-page"), want: other.getAttribute("data-mt"),
      title: title && title.textContent, nsec });
});

/* Finding 2: Library search opens collapsed sections, reveals matching cards/categories, and shows empty state */
check("L9 searching in the Library opens matching sections, reveals cards, matches category names and shows empty state when nothing matches", () => {
  if (wired) return wired;
  if (STAB.screenOn !== "library") MG.openManage();
  const search = host().querySelector("#libSearch");
  if (!search) return "no #libSearch";

  /* 1. Type a query matching nothing */
  search.value = "xyz_no_match_here";
  search.oninput();
  const emptyP = host().querySelector("#libEmptySearch");
  const emptyText = emptyP ? emptyP.textContent.trim() : "";
  const allHidden = [...host().querySelectorAll("details.manage-sec")].every(d => d.hasAttribute("hidden"));
  const emptyOk = !!emptyP && emptyText.length > 0 && allHidden;

  /* 2. Clear search: restores sections and removes empty message */
  search.value = "";
  search.oninput();
  const emptyGone = !host().querySelector("#libEmptySearch");
  const shownCat = host().querySelector('details.manage-sec[data-mg="catmac"]');

  /* 3. Search for a category name */
  const catInput = host().querySelector(".mg-cat-lab2");
  const catName = catInput ? catInput.value : "Cat";
  search.value = catName.slice(0, 3);
  search.oninput();
  const catSec = host().querySelector('details.manage-sec[data-mg="catmac"]');
  const catSecOpen = catSec && catSec.open && !catSec.hasAttribute("hidden");
  const catBody = host().querySelector(".mg-cat-body");
  const catBodyExpanded = catBody && !catBody.hasAttribute("hidden");

  search.value = "";
  search.oninput();

  return emptyOk && emptyGone && catSecOpen && catBodyExpanded
    || JSON.stringify({ emptyOk, emptyText, allHidden, emptyGone, catSecOpen, catBodyExpanded });
});

/* Finding 6: Library actions keep scroll position in #libPage */
check("L10 every card or intent action in the Library tab preserves its scroll position in #libPage", () => {
  if (wired) return wired;
  if (STAB.screenOn !== "library") MG.openManage();
  const page = host().querySelector("#libPage");
  if (!page) return "no #libPage";
  page.scrollTop = 150;
  MG.mgRefreshAround(() => {});
  const nowPage = host().querySelector("#libPage");
  const kept = nowPage ? nowPage.scrollTop : -1;
  return kept === 150 || JSON.stringify({ kept, expected: 150 });
});

/* Finding 8: Saved copies preserves the Library navigation rail and returns cleanly to the list */
await checkAsync("L11 Saved copies preserves the Library navigation rail, and opening an earlier copy returns to the Library list", async () => {
  if (wired) return wired;
  if (STAB.screenOn !== "library") MG.openManage();
  const door = host().querySelector("#mgHistory");
  if (!door) return "no Earlier versions door";
  door.click();
  await settle();

  /* Left rail (#libSecs, #libSearch, #libMaint) must be preserved in .sx-nav */
  const nav = host().querySelector(".sx-nav");
  const secs = host().querySelector("#libSecs");
  const maint = host().querySelector("#libMaint");
  const railKept = !!nav && !!secs && !!maint;

  /* #ehView is present */
  const ehView = host().querySelector("#ehView");

  /* Back to the Library restores list */
  const back = host().querySelector("#ehClose");
  if (back) back.click();
  await settle();
  const listRestored = !!host().querySelector("#mgCatList") && !host().querySelector("#ehView");

  return railKept && !!ehView && listRestored
    || JSON.stringify({ railKept, hasEhView: !!ehView, listRestored });
});

/* Finding 13: Catalog & data shows folder path in non-collapsible bar and does not collapse card on click */
check("L12 Catalog & data shows folder path in non-collapsible row and has no duplicate collapsible summary bar", () => {
  if (wired) return wired;
  if (STAB.screenOn !== "library") MG.openManage();
  const dataBtn = host().querySelector('.sx-sec[data-lm="data"]');
  if (dataBtn) dataBtn.click();
  const sec = host().querySelector('details.manage-sec[data-mg="data"]');
  if (!sec) return "no data section";
  const dataBar = sec.querySelector(".mg-data-bar");
  const hasFolderPath = !!sec.querySelector("#mgCatFolderPath") || !!sec.querySelector(".ec-where");
  const summary = sec.querySelector("summary");
  /* template.html hides summary on data section when not searching */
  const tpl = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  const duplicateSummaryRule = tpl.includes('details.manage-sec[data-mg="data"]>summary');
  return !!dataBar && hasFolderPath && !duplicateSummaryRule
    || JSON.stringify({ hasDataBar: !!dataBar, hasFolderPath, duplicateSummaryRule });
});

/* The path is emitted on the data bar and again in the summary. One id, on the bar the page shows. */
check("L15 the Catalog and data page holds the folder path id once, on the data bar", () => {
  if (wired) return wired;
  if (STAB.screenOn !== "library") MG.openManage();
  const dataBtn = host().querySelector('.sx-sec[data-lm="data"]');
  if (dataBtn) dataBtn.click();
  const all = doc.querySelectorAll("#mgCatFolderPath");
  const inBar = all.filter(el => el.closest(".mg-data-bar"));
  const inSummary = all.filter(el => el.closest("summary"));
  return all.length === 1 && inBar.length === 1 && inSummary.length === 0
    || JSON.stringify({ n: all.length, inBar: inBar.length, inSummary: inSummary.length });
});

/* A category deleted while the Library is open leaves the snapshot from when it opened.
   Closing restores that snapshot. A category the catalog no longer has is not a filter,
   and the desk shows the cards the clear filter keeps. */
check("L14 closing the Library drops a filter whose category was deleted while it was open, and the desk shows its cards", () => {
  if (wired) return wired;
  const hadRebuild = H.hooks.rebuildCards;
  const hadRender = H.hooks.render;
  const hadCustom = PK.pack.custom.slice();
  const hadCats = Object.assign({}, PK.pack.customCats);
  const hadRemoved = (PK.pack.removedCats || []).slice();
  H.hooks.rebuildCards = RB.rebuildCards;
  H.hooks.render = RD.render;
  try {
    if (STAB.screenOn === "library") {
      const shut = host().querySelector("#mgClose");
      if (shut) shut.click();
    }
    PK.pack.customCats = Object.assign({}, hadCats, { shelf: "Shelf" });
    PK.pack.custom = hadCustom.concat([{ id: "u:desk-card", c: "gen", t: "Desk card", en: "A reply on the desk." }]);
    RB.rebuildCards();
    if (!CM.CATS.shelf) return "shelf was not a category after rebuild";
    const tid = T.getActiveTabId();
    const tab = () => T.tabs.find(x => x.id === tid);
    AS.setCats(["shelf"]);
    if (tab()) tab().cats = ["shelf"];
    MG.openManage();
    const opened = STAB.screenOn === "library";
    const snap = tab() ? tab().cats.slice() : [];
    const del = host().querySelector('[data-delcat="shelf"]');
    if (!del) return "no delete for shelf: " + JSON.stringify({ opened, snap, cats: Object.keys(CM.CATS) });
    del.click();
    const liveWhileOpen = AS.cats.slice();
    const storedWhileOpen = tab() ? tab().cats.slice() : [];
    const gone = !CM.CATS.shelf;
    const shut = host().querySelector("#mgClose");
    if (!shut) return "no Close";
    shut.click();
    const live = AS.cats.slice();
    const stored = tab() ? tab().cats.slice() : [];
    const cardThere = !!doc.querySelector('#list .card[data-id="u:desk-card"]');
    const held = snap.indexOf("shelf") >= 0 && storedWhileOpen.indexOf("shelf") >= 0 && liveWhileOpen.indexOf("shelf") < 0 && gone;
    const clear = STAB.screenOn === "" && live.length === 0 && stored.length === 0 && cardThere;
    return opened && held && clear
      || JSON.stringify({ opened, snap, liveWhileOpen, storedWhileOpen, gone, screen: STAB.screenOn, live, stored, cardThere });
  } finally {
    H.hooks.rebuildCards = hadRebuild;
    H.hooks.render = hadRender;
    PK.pack.custom = hadCustom;
    PK.pack.customCats = hadCats;
    PK.pack.removedCats = hadRemoved;
    try { RB.rebuildCards(); } catch (e) {}
    AS.setCats([]);
  }
});

/* Finding 14: .screen-actions uses var(--line) and #ehClose carries .btn.primary */
check("L13 .screen-actions uses var(--line) instead of var(--border) and #ehClose carries primary styling", () => {
  const tpl = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  const usesBorder = /\.screen-actions\s*\{[^}]*var\(--border\)/.test(tpl);
  const primaryStyled = /\.screen-actions\s+\.btn\.primary/.test(tpl);
  const histSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "catalog-history.js"), "utf8");
  const ehClosePrimary = histSrc.includes('id="ehClose"') && /class="btn\s+primary"\s+id="ehClose"|id="ehClose"\s+class="btn\s+primary"|class="btn\s+primary"[^>]*id="ehClose"/.test(histSrc);
  return !usesBorder && primaryStyled && ehClosePrimary
    || JSON.stringify({ usesBorder, primaryStyled, ehClosePrimary });
});

/* A page's fold has no summary on screen, so a page whose details element is shut shows its title and
   nothing under it: shown means not hidden AND open, and the toggle the stub page now fires is what shut
   them. Run last, because it puts a catalog on the desk. Invented: two shelves, two requests, two names. */
await checkAsync("L16 every Library page holds its content when reached from another page, Categories and cards included", async () => {
  if (wired) return wired;
  const CAT = await import(MOD("catalog.js"));
  const invented = {
    format: 2, kind: "etiuda-catalog", id: "harbour-lamps", rev: 1, name: "Harbour Lamps", date: "2026-01-09",
    langs: [{ code: "en", label: "EN" }, { code: "pl", label: "PL" }],
    tags: [
      { id: "t-op", kind: "shelf", label: { en: "Openers", pl: "Powitania" } },
      { id: "t-rt", kind: "shelf", label: { en: "Returns", pl: "Zwroty" } },
      { id: "t-wick", kind: "request", clause: { en: "a new wick", pl: "nowy knot" },
        action: { en: "sent a wick", pl: "wysłano knot" }, topic: { en: "the wick", pl: "knot" } },
      { id: "t-shade", kind: "request", clause: { en: "a shade swap", pl: "wymianę klosza" },
        action: { en: "swapped the shade", pl: "wymieniono klosz" }, topic: { en: "the shade", pl: "klosz" } },
    ],
    cards: [
      { id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening", pl: "Ciepłe powitanie" },
        body: { en: "Good day.", pl: "Dzień dobry." } },
      { id: "c-wick", shelf: "t-rt", bodyShape: "plain", requests: ["t-wick"], title: { en: "Wick", pl: "Knot" },
        body: { en: "A wick is on its way.", pl: "Knot jest w drodze." } },
      { id: "c-shade", shelf: "t-rt", bodyShape: "plain", requests: ["t-shade"], title: { en: "Shade", pl: "Klosz" },
        body: { en: "The shade is swapped.", pl: "Klosz wymieniony." } },
    ],
    role: ["Concierge", "Porter"],
  };
  if (!CAT.storeCatalog(CAT.parseCatalogFile(JSON.stringify(invented)))) return "the invented catalog was not stored";
  H.hooks.restartDesk();
  if (STAB.screenOn !== "library") MG.openManage();
  await settle();
  const holds = {
    catmac: d => d.querySelectorAll(".mg-cat").length >= 2,
    intents: d => d.querySelectorAll(".manage-row.mg-int").length === 2,
    who: d => /Concierge, Porter/.test((d.querySelector("#mgWho") || {}).value || ""),
    data: d => /3\scards[\s\S]*2\sintents/.test((d.querySelector("#mgCatList .ec-row.is-loaded") || {}).textContent || ""),
  };
  const seen = [];
  let all = true;
  for (const k of ["catmac", "intents", "catmac", "who", "catmac", "data", "intents", "who", "data", "catmac"]) {
    const b = host().querySelector('.sx-sec[data-lm="' + k + '"]');
    if (!b) return "no section " + k + " in the nav";
    b.click();
    await settle();
    const shown = host().querySelectorAll(".sx.lm-lib details.manage-sec").filter(d => !d.hasAttribute("hidden"));
    const page = shown.length === 1 && shown[0].getAttribute("data-mg") === k ? shown[0] : null;
    const ok = !!page && page.open && holds[k](page);
    if (!ok) all = false;
    seen.push(k + ":" + (page ? (page.open ? "open" : "shut") + (holds[k](page) ? "+content" : "-content")
      : "shown " + shown.map(d => d.getAttribute("data-mg")).join("|")));
  }
  return all || seen.join(" ");
});

/* ================================================================================================
   THE FAILURE PATHS: each plant lifted in a scratch copy of src/, the leg it guards run there by a child.
   ================================================================================================ */
const PLANTS = [
  { tag: "library-editor-closes-back", file: "manage.js", leg: "L3" },
  { tag: "restart-keeps-screen", file: "restart.js", leg: "L5" },
  { tag: "library-page-open", file: "manage.js", leg: "L16" },
];
if (childAt < 0) {
  for (const p of PLANTS) {
    check(p.leg + "-plant lifting plant:" + p.tag + " in a scratch copy turns " + p.leg + " red", () => {
      const file = path.join(ROOT, "src", "modules", p.file);
      const src = fs.readFileSync(file, "utf8");
      const lines = src.split("\n");
      const at = lines.findIndex(l => l.includes("plant:" + p.tag));
      if (at < 0) return "plant:" + p.tag + " is not in " + p.file;
      const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-library-tab-"));
      try {
        fs.cpSync(path.join(ROOT, "src"), path.join(scratch, "src"), { recursive: true });
        lines.splice(at, 1);
        fs.writeFileSync(path.join(scratch, "src", "modules", p.file), lines.join("\n"));
        const r = spawnSync(process.execPath, [SELF, "--child", path.join(scratch, "src"), p.leg], { encoding: "utf8", timeout: 120000 });
        const line = String(r.stdout || "").split("\n").find(l => l.startsWith("#child "));
        if (!line) return "the child said nothing: " + String(r.stderr || "").slice(0, 300);
        const got = JSON.parse(line.slice(7));
        const leg = got.find(x => x.name.split(" ")[0] === p.leg);
        if (!leg) return "the child did not run " + p.leg;
        return !leg.ok || "still green with the plant lifted";
      } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
      }
    });
  }
}

if (childAt >= 0) {
  console.log("#child " + JSON.stringify(results));
  process.exit(0);
}
let failed = 0;
for (const r of results) {
  console.log((r.ok ? "  ok   " : "  FAIL ") + r.name + (r.ok ? "" : ": " + r.why));
  if (!r.ok) failed++;
}
console.log("#counts checks=" + results.length + " passed=" + (results.length - failed) + " failed=" + failed);
console.log(failed ? "  RESULT: FAIL " + failed + " of " + results.length : "  RESULT: ok " + results.length + " check(s)");
process.exit(Math.min(failed, 63));
