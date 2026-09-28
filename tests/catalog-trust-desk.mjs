/* THE TRUST CHECK'S WIRING INTO THE DESK, driven through the desk's own load path in bare node.
 *
 *   node tests/catalog-trust-desk.mjs     exit code is the number of failed checks, capped at 63
 *
 * WHY THIS FILE EXISTS. tests/catalog-trust.mjs proves the verifier as the desk calls it: a
 * catalog handed to src/modules/catalog-trust.js reads the state it should. It calls the module's
 * functions itself, so it cannot see whether the DESK still calls them. The verify of secure-0927
 * (2026-09-27) removed two call sites, the document kept by the boot's reader and the Library's
 * recheck, and every fast gate stayed green: the desk had stopped checking and nothing said so.
 *
 * WHAT IS DRIVEN. The same functions the page's boot and the Library call, in the order they call
 * them, over the real shell/main.js and shell/preload.js with electron stubbed, as
 * tests/catalog-trust.mjs does. The page is a small DOM written below, so that what is read is the
 * markup the desk rendered at run time: the offer bubble's `.ec-trust` line, and the Library row's.
 * Buttons are pressed by their own handlers, the catalog folder and the desk file are real files
 * in a temp folder, and nothing asserts on the engine's source text.
 *
 * A LAUNCH IS A PROCESS. The desk's module state (the boot's reader, the verification cache, the
 * once-a-load recheck) lives exactly one page long, and the stored state that outlives a page is
 * the desk file on disk. So each launch is this file run again as a child with `--launch`, and a
 * reload is a new child that keeps the session store, as a reload keeps sessionStorage. A relaunch
 * starts the session empty. Accepting a catalog starts the desk again in place (hooks.restartDesk),
 * and a launch ends there as it ended at the reload that did this before: what the next page reads
 * is only what reached desk.json.
 *
 * THE MAIN PROCESS SEES A SHELL FOLDER OF ITS OWN inside the temp folder, so the places it reads
 * a catalog from are the temp folder's and never the tree's root, where a desk may keep a real one.
 *
 * NO CONTENT. The catalog is invented here; its words are placeholders.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const nodeRequire = createRequire(import.meta.url);

/* ================================================================================================
   A PAGE SMALL ENOUGH TO READ: elements, text, a parser for the markup the desk writes, and the
   selectors the load path asks for. A selector it does not know THROWS, so a gap here is a red
   launch rather than a query that quietly finds nothing.
   ================================================================================================ */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&nbsp;": " " };
class TextNode {
  constructor(s) { this.nodeType = 3; this.data = String(s); this.parentNode = null; }
  get textContent() { return this.data.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, m => ENT[m]); }
  remove() { if (this.parentNode) this.parentNode._drop(this); }
}
class El {
  constructor(tag, doc) {
    this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.localName = String(tag).toLowerCase();
    this.ownerDocument = doc; this.childNodes = []; this.parentNode = null; this.attrs = new Map();
    this.listeners = {}; this.style = { setProperty() {}, removeProperty() {} };
    this.offsetWidth = 0; this.offsetHeight = 0; this.scrollTop = 0; this.scrollLeft = 0;
    const self = this;
    this.classList = {
      contains: c => self._classes().includes(c),
      add: (...cs) => { const s = self._classes(); cs.forEach(c => { if (!s.includes(c)) s.push(c); }); self.setAttribute("class", s.join(" ")); },
      remove: (...cs) => { self.setAttribute("class", self._classes().filter(c => !cs.includes(c)).join(" ")); },
      toggle: (c, on) => { const want = on === undefined ? !self.classList.contains(c) : !!on;
        if (want) self.classList.add(c); else self.classList.remove(c); return want; },
    };
  }
  _classes() { return String(this.attrs.get("class") || "").split(/\s+/).filter(Boolean); }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get firstElementChild() { return this.children[0] || null; }
  get id() { return this.attrs.get("id") || ""; }
  set id(v) { this.setAttribute("id", v); }
  get className() { return this.attrs.get("class") || ""; }
  set className(v) { this.setAttribute("class", v); }
  get hidden() { return this.attrs.has("hidden"); }
  set hidden(v) { if (v) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); }
  setAttribute(k, v) { this.attrs.set(String(k).toLowerCase(), String(v)); }
  getAttribute(k) { const v = this.attrs.get(String(k).toLowerCase()); return v === undefined ? null : v; }
  hasAttribute(k) { return this.attrs.has(String(k).toLowerCase()); }
  removeAttribute(k) { this.attrs.delete(String(k).toLowerCase()); }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument.documentElement; }
  appendChild(n) { if (n.parentNode) n.parentNode._drop(n); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n, ref) {
    if (n.parentNode) n.parentNode._drop(n);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    n.parentNode = this;
    if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
    return n;
  }
  _drop(n) { const i = this.childNodes.indexOf(n); if (i > -1) this.childNodes.splice(i, 1); n.parentNode = null; }
  remove() { if (this.parentNode) this.parentNode._drop(this); }
  contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  get textContent() { return this.childNodes.map(n => n.textContent).join(""); }
  set textContent(s) { this.childNodes.forEach(n => { n.parentNode = null; }); this.childNodes = []; if (String(s)) this.appendChild(new TextNode(s)); }
  get innerHTML() { return this.childNodes.map(serial).join(""); }
  set innerHTML(html) { this.childNodes.forEach(n => { n.parentNode = null; }); this.childNodes = []; parseInto(this, String(html)); }
  insertAdjacentHTML(where, html) {
    const box = new El("div", this.ownerDocument);
    parseInto(box, String(html));
    const nodes = box.childNodes.slice();
    const w = String(where).toLowerCase();
    if (w === "beforeend") nodes.forEach(n => this.appendChild(n));
    else if (w === "afterbegin") nodes.reverse().forEach(n => this.insertBefore(n, this.childNodes[0] || null));
    else if (w === "beforebegin") nodes.forEach(n => this.parentNode.insertBefore(n, this));
    else if (w === "afterend") {
      const p = this.parentNode, next = p.childNodes[p.childNodes.indexOf(this) + 1] || null;
      nodes.forEach(n => p.insertBefore(n, next));
    } else throw new Error("stub page: insertAdjacentHTML " + where);
  }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn); }
  dispatch(t, ev) { (this.listeners[t] || []).slice().forEach(fn => fn(Object.assign({ type: t, target: this,
    preventDefault() {}, stopPropagation() {} }, ev || {}))); }
  focus() { this.ownerDocument.activeElement = this; }
  blur() {}
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; }
  getClientRects() { return []; }
  closest(sel) { let n = this; while (n && n.nodeType === 1) { if (matches(n, sel, null)) return n; n = n.parentNode; } return null; }
  matches(sel) { return matches(this, sel, null); }
  querySelectorAll(sel) { return queryAll(this, sel); }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
  cloneNode() { throw new Error("stub page: cloneNode"); }
  animate() { return { finished: Promise.resolve(), cancel() {}, onfinish: null }; }
  getAnimations() { return []; }
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
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html))) {
    if (m.index > at) stack[stack.length - 1].appendChild(new TextNode(html.slice(at, m.index)));
    at = TAG.lastIndex;
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) {
      const name = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].localName === name) { stack.length = i; break; }
      continue;
    }
    const el = new El(m[2], root.ownerDocument);
    let a; ATTR.lastIndex = 0;
    while ((a = ATTR.exec(m[3] || ""))) el.setAttribute(a[1], (a[2] ?? a[3] ?? a[4] ?? "").replace(/&quot;/g, "\"").replace(/&amp;/g, "&"));
    stack[stack.length - 1].appendChild(el);
    if (!m[4] && !VOID.has(el.localName)) stack.push(el);
  }
  if (at < html.length) stack[stack.length - 1].appendChild(new TextNode(html.slice(at)));
}
/* Compound selectors joined by descendant spaces or `>`, and `:scope >` at the head. Nothing else. */
const COMPOUND = /^([a-zA-Z][\w-]*|\*)?((?:#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/;
function parts(sel) {
  const s = String(sel).trim();
  if (s.includes(",")) throw new Error("stub page: selector list " + s);
  return s.replace(/\s*>\s*/g, " > ").split(/\s+/);
}
function compound(el, c) {
  const m = COMPOUND.exec(c);
  if (!m) throw new Error("stub page: selector " + c);
  if (m[1] && m[1] !== "*" && el.localName !== m[1].toLowerCase()) return false;
  const bits = m[2].match(/#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\]/g) || [];
  return bits.every(b => b[0] === "#" ? el.id === b.slice(1)
    : b[0] === "." ? el.classList.contains(b.slice(1))
    : (() => { const q = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(b); return q[2] === undefined ? el.hasAttribute(q[1]) : el.getAttribute(q[1]) === q[2]; })());
}
function matches(el, sel, scope) {
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
    if (ps[i] === ":scope") throw new Error("stub page: :scope without >");
    let up = node.parentNode;
    while (up && up.nodeType === 1 && !compound(up, ps[i])) up = up.parentNode;
    if (!up || up.nodeType !== 1) return false;
    node = up;
  }
  return true;
}
function queryAll(root, sel) {
  const out = [];
  const walk = n => n.children.forEach(c => { if (matches(c, sel, root)) out.push(c); walk(c); });
  walk(root);
  return out;
}
function makeDocument() {
  const doc = { listeners: {}, visibilityState: "visible", hidden: false, readyState: "complete", activeElement: null };
  doc.createElement = t => new El(t, doc);
  doc.createElementNS = (_ns, t) => new El(t, doc);
  doc.createTextNode = s => new TextNode(s);
  doc.documentElement = new El("html", doc);
  doc.head = doc.documentElement.appendChild(new El("head", doc));
  doc.body = doc.documentElement.appendChild(new El("body", doc));
  doc.activeElement = doc.body;
  doc.getElementById = id => queryAll(doc.documentElement, "#" + id)[0] || null;
  doc.querySelector = sel => queryAll(doc.documentElement, sel)[0] || null;
  doc.querySelectorAll = sel => queryAll(doc.documentElement, sel);
  doc.addEventListener = (t, fn) => { (doc.listeners[t] = doc.listeners[t] || []).push(fn); };
  doc.removeEventListener = (t, fn) => { doc.listeners[t] = (doc.listeners[t] || []).filter(f => f !== fn); };
  doc.dispatch = t => (doc.listeners[t] || []).slice().forEach(fn => fn({ type: t }));
  return doc;
}

/* ================================================================================================
   ONE LAUNCH: the shell's main process and preload, the page's modules, then the acts in order.
   Prints one line, `#launch {...}`, with what the page showed.
   ================================================================================================ */
async function launch(plan) {
  const LAB = plan.lab, UD = path.join(LAB, "userdata"), SHELL = path.join(LAB, "shell");
  const obs = { errors: [], offers: [], library: [], reloaded: false, heldAtStart: null, heldAtEnd: null, tourDue: null };
  process.on("unhandledRejection", e => obs.errors.push("unhandled " + String(e && e.message || e).slice(0, 160)));
  process.on("uncaughtException", e => obs.errors.push("uncaught " + String(e && e.message || e).slice(0, 160)));
  const noop = () => {};
  const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
  const onHandlers = {}, invokeHandlers = {};
  const electron = {
    app: { getPath: () => UD, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
           getVersion: () => "0.0.0", whenReady: () => new Promise(noop), isPackaged: false },
    ipcMain: { on: (ch, fn) => { onHandlers[ch] = fn; }, handle: (ch, fn) => { invokeHandlers[ch] = fn; } },
    shell: { openPath: async () => "" },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
  };
  const quiet = { log: noop, error: noop, warn: noop, info: noop };
  const shellSrc = f => fs.readFileSync(path.join(ROOT, "shell", f), "utf8");
  new Function("require", "__dirname", "__filename", "module", "exports", "console", shellSrc("main.js"))(
    n => (n === "electron" ? electron : nodeRequire(n)), SHELL, path.join(SHELL, "main.js"), { exports: {} }, {}, quiet);

  const FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
  const ev = () => ({ sender: { id: 1, once: noop, send: noop }, senderFrame: FRAME, returnValue: undefined });
  const rendererOn = {};
  const ipcRenderer = {
    sendSync: (ch, ...args) => { const e = ev(); if (onHandlers[ch]) onHandlers[ch](e, ...args); return e.returnValue; },
    send: (ch, ...args) => { if (onHandlers[ch]) onHandlers[ch](ev(), ...args); },
    invoke: (ch, ...args) => new Promise((ok, no) => setImmediate(() => {
      try { ok(invokeHandlers[ch] ? invokeHandlers[ch](ev(), ...args) : undefined); } catch (e) { no(e); } })),
    on: (ch, fn) => { (rendererOn[ch] = rendererOn[ch] || []).push(fn); },
  };

  /* The page's world. window IS the global object, as in a browser, so a bare addEventListener and
     window.addEventListener are one list. */
  const doc = makeDocument();
  const winListeners = {};
  const session = new Map(Object.entries(plan.session || {}));
  Object.assign(globalThis, {
    document: doc, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); },
    removeEventListener: (t, fn) => { winListeners[t] = (winListeners[t] || []).filter(f => f !== fn); },
    requestAnimationFrame: fn => setTimeout(() => fn(Date.now()), 0), cancelAnimationFrame: id => clearTimeout(id),
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    sessionStorage: { getItem: k => (session.has(k) ? session.get(k) : null), setItem: (k, v) => { session.set(k, String(v)); },
                      removeItem: k => { session.delete(k); }, key: i => [...session.keys()][i] ?? null, get length() { return session.size; } },
  });
  globalThis.window = globalThis;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language: "en-US", languages: ["en-US"], platform: "Win32", userAgent: "node" } });
  /* THE DESK STARTED AGAIN, or a reload: the launch ends at the next act, its unload events fired,
     which is where a pending desk write is sent whole, as the page leaving at the end of a session. */
  const restarted = () => {
    if (obs.reloaded) return;
    obs.reloaded = true;
    ["beforeunload", "pagehide", "unload"].forEach(t => (winListeners[t] || []).slice().forEach(fn => { try { fn({ type: t }); } catch (e) { obs.errors.push(t + " " + e.message); } }));
  };
  Object.defineProperty(globalThis, "location", { configurable: true, value: {
    href: FRAME.url, protocol: "file:", search: "", hash: "", pathname: "/C:/lab/engine/etiuda.html",
    reload: restarted } });
  const contextBridge = { exposeInMainWorld: (k, v) => { globalThis[k] = v; }, executeInMainWorld: o => o.func(...(o.args || [])) };
  new Function("require", shellSrc("preload.js"))(n => (n === "electron" ? { contextBridge, ipcRenderer, webUtils: {} } : nodeRequire(n)));

  const OFFER = await import(MOD("catalog-offer.js"));
  const TR = await import(MOD("catalog-trust.js"));
  const TOUR = await import(MOD("tour.js"));
  /* THE APP-LEVEL ACTIONS the page's boot registers in hooks.js, none of them on the trust path:
     the sample's watermark and the unsaved notice repaint the rest of the page. Named one by one,
     so a slot this path starts calling is a TypeError in 0b rather than a silent stub. */
  const HOOKS = (await import(MOD("hooks.js"))).hooks;
  ["syncSampleMark", "syncSaveNotice", "flushPillState"].forEach(k => { HOOKS[k] = noop; });
  HOOKS.restartDesk = restarted;
  obs.heldAtStart = TR.heldCatalogTrust();
  obs.tourDue = TOUR.tourDueAtBoot();

  const settle = ms => new Promise(r => setTimeout(r, ms || 300));
  const texts = (root, sel) => root.querySelectorAll(sel).map(n => n.textContent.trim());
  const readOffer = () => {
    const b = doc.getElementById("eCatalogOffer");
    return b ? { shown: true, trust: texts(b, ".ec-trust"), files: texts(b, ".ec-sub code") } : { shown: false, trust: [], files: [] };
  };
  const readLibrary = () => {
    const box = doc.getElementById("mgCatList");
    return box ? box.querySelectorAll(".ec-row").map(r => {
      const t = r.querySelector(".ec-trust");
      return { name: (r.querySelector(".ec-name b") || { textContent: "" }).textContent,
               loaded: r.classList.contains("is-loaded"),
               trust: t ? { state: t.getAttribute("data-trust"), text: t.textContent.trim() } : null };
    }) : [];
  };
  const act = {
    boot: () => { OFFER.eOfferCatalogAtBoot(); OFFER.wireHostCatalogWatch(); },
    settle: () => settle(),
    offer: () => { obs.offers.push(readOffer()); },
    yes: () => { const y = doc.getElementById("ecYes"); if (!y) throw new Error("no Yes on screen"); y.onclick(); },
    /* YES THE MOMENT THE BUBBLE IS UP, one turn of the event loop at a time: the ring is asked in
       the turn that puts the bubble up and answers a turn later, so this press precedes the answer,
       and whether the bubble already carried its line when pressed is written down to show it. */
    yesAtOnce: async () => {
      for (let i = 0; i < 500 && !doc.getElementById("ecYes"); i++) await new Promise(r => setImmediate(r));
      const y = doc.getElementById("ecYes");
      if (!y) throw new Error("no Yes on screen");
      obs.lineAtPress = texts(doc.getElementById("eCatalogOffer"), ".ec-trust");
      y.onclick();
    },
    escape: () => { const b = doc.getElementById("eCatalogOffer"); if (!b) throw new Error("no bubble to escape");
      b.dispatch("keydown", { key: "Escape" }); },
    library: async () => {
      if (!doc.getElementById("mgCatList")) { const l = doc.createElement("div"); l.id = "mgCatList"; doc.body.appendChild(l); }
      OFFER.paintCatalogList();
      await settle();
      obs.library.push(readLibrary());
    },
    load: name => { const b = doc.querySelector("button[data-ec-load=\"" + name + "\"]"); if (!b) throw new Error("no Load for " + name); b.onclick(); },
    watch: file => { const text = fs.readFileSync(path.join(LAB, file), "utf8");
      (rendererOn["etiuda:catalog-file"] || []).forEach(fn => fn({}, text, path.basename(file), path.join(LAB, "catalogs"), false, "", false)); },
  };
  for (const a of plan.acts) {
    if (obs.reloaded) break;
    const [name, arg] = String(a).split(":");
    try { await act[name](arg); } catch (e) { obs.errors.push(name + ": " + String(e && e.message || e).slice(0, 160)); }
  }
  if (obs.reloaded) await settle(50);
  obs.heldAtEnd = TR.heldCatalogTrust();
  obs.session = Object.fromEntries(session);
  process.stdout.write("#launch " + JSON.stringify(obs) + "\n", () => process.exit(0));
}

if (process.argv[2] === "--launch") {
  await launch(JSON.parse(process.argv[3]));
} else {
  await parent();
}

/* ================================================================================================
   THE CHECKS: each scenario a temp folder of its own, a desk file, a catalog folder and launches.
   ================================================================================================ */
async function parent() {
  const EXPECTED = 13;
  let asserted = 0, failed = 0;
  const check = (ok, line) => { asserted++; if (ok) console.log("  ok   " + line); else { failed++; console.log("  FAIL " + line); } };

  const V2 = await import(MOD("catalog-v2.js"));
  const pair = crypto.generateKeyPairSync("ed25519");
  const KEY_ID = "trust-desk-harness", ID = "lamp-shop";
  const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const NL = String.fromCharCode(10);
  /* Invented, and nothing of a real catalog: two shelves and three cards. */
  const payload = (date, name) => ({
    format: 2, kind: "etiuda-catalog", id: ID, rev: 1, name: name || "Lamp Shop", date: date,
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }, { id: "t-rt", kind: "shelf", label: { en: "Returns" } }],
    cards: [
      { id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" }, body: { en: "Good day." } },
      { id: "c-steps", shelf: "t-rt", bodyShape: "steps", title: { en: "Refund steps" },
        body: { en: "[step]" + NL + "Ask." + NL + NL + "[step]" + NL + "Raise." } },
      { id: "c-close", shelf: "t-op", bodyShape: "plain", title: { en: "Closing" }, body: { en: "Goodbye." } },
    ],
  });
  const sign = doc => { const o = JSON.parse(JSON.stringify(doc)); delete o.hash;
    o.sig = { alg: V2.V2_SIG_ALG, keyId: KEY_ID }; o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), pair.privateKey).toString("hex"); return o; };
  const bend = doc => { const o = JSON.parse(JSON.stringify(doc)); o.name = o.name + " again"; return o; };
  const ring = JSON.stringify({ format: V2.V2_RING_FORMAT, kind: V2.V2_RING_KIND,
    keys: [{ catalog: ID, keyId: KEY_ID, alg: V2.V2_SIG_ALG, public: pubHex(pair.publicKey) }] });

  const labs = [];
  const scenario = files => {
    const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-trust-desk-"));
    labs.push(lab);
    ["userdata", "catalogs", "shell"].forEach(d => fs.mkdirSync(path.join(lab, d)));
    /* Motion off, so a reload and a dismissal happen at once; the tour marked as done, so the boot's
       offer is not waiting behind it (0a says whether it is). */
    fs.writeFileSync(path.join(lab, "userdata", "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
      keys: { eCatalogFolder: path.join(lab, "catalogs"), eUiLang: "en", eMotionOff: "1", eTourDone_v3: "1", eTourInvite_v3: "1" } }), "utf8");
    /* Oldest first: a file's age is its place in the folder's newest-first order. */
    let t = Date.now() / 1000 - 3600;
    files.forEach(([name, doc]) => { const f = path.join(lab, name); fs.writeFileSync(f, typeof doc === "string" ? doc : JSON.stringify(doc), "utf8"); fs.utimesSync(f, t, t); t += 60; });
    return lab;
  };
  const launches = [];
  let session = {};
  const run = (lab, acts, carry) => {
    const r = spawnSync(process.execPath, [SELF, "--launch", JSON.stringify({ lab, acts, session: carry ? session : {} })],
      { encoding: "utf8", timeout: 30000, windowsHide: true });
    const line = String(r.stdout || "").split(/\r?\n/).find(l => l.startsWith("#launch "));
    let obs = null;
    try { obs = line ? JSON.parse(line.slice(8)) : null; } catch { obs = null; }
    if (!obs) obs = { errors: ["no launch line, exit " + r.status + " " + String(r.stderr || "").split(/\r?\n/).slice(0, 3).join(" | ")],
                      offers: [], library: [], reloaded: false };
    session = obs.session || {};
    launches.push(obs);
    return obs;
  };
  const row = (obs, file, i) => ((obs.library[i || 0]) || []).find(r => r.name === file) || null;
  const said = r => (r && r.trust) ? r.trust.state + " \"" + r.trust.text + "\"" : "no line";
  const CHANGED = /changed since it was signed/, UNKNOWN_KEY = /does not know/, UNSIGNED = /^unsigned$/;

  try {
    /* 1: THE BOOT'S OFFER. A file changed since it was signed, found in the folder on an empty desk. */
    const lab1 = scenario([["catalogs/lamp.ec", bend(sign(payload("2026-09-01")))], ["catalogs/etiuda-ring.json", ring]]);
    const b1 = run(lab1, ["boot", "settle", "offer", "yes", "settle"]);
    const o1 = b1.offers[0] || {};
    check(o1.shown && o1.trust.length === 1 && CHANGED.test(o1.trust[0]),
      "1a the boot's offer of a file changed since it was signed says so in its bubble: " + JSON.stringify(o1.trust || null));
    const b1b = run(lab1, ["library"], true);
    const r1 = row(b1b, "lamp.ec");
    check(b1.reloaded && !!r1 && r1.loaded && r1.trust && r1.trust.state === V2.V2_SIG_INVALID && CHANGED.test(r1.trust.text),
      "1b accepted, the desk starts again with it and the Library's loaded row says it was changed: " + said(r1));

    /* 2: A SIGNED CATALOG HELD, then an unsigned edition handed by the watch, then an older edition
       loaded from the Library's list with Yes pressed before its check has answered. */
    const lab2 = scenario([["catalogs/lamp-1.ec", bend(sign(payload("2026-08-01")))], ["catalogs/lamp-2.ec", sign(payload("2026-09-01"))],
      ["catalogs/etiuda-ring.json", ring], ["lamp-3.ec", payload("2026-09-15")]]);
    const c2 = run(lab2, ["boot", "settle", "offer", "yes", "settle"]);
    const c2b = run(lab2, ["boot", "watch:lamp-3.ec", "settle", "offer", "escape", "library", "load:lamp-1.ec", "yesAtOnce", "settle"], true);
    const o2 = c2.offers[0] || {};
    check(o2.shown && o2.trust.length === 0 && c2.reloaded && c2b.heldAtStart === V2.V2_SIG_VALID,
      "2a a valid signature is said nowhere in the offer and is what the desk holds once it has started again: "
      + JSON.stringify(o2.trust || null) + ", held " + JSON.stringify(c2b.heldAtStart));
    const o2b = c2b.offers[0] || {};
    check(o2b.shown && o2b.trust.length === 1 && /is signed, and this edition is not/.test(o2b.trust[0]),
      "2b an unsigned edition the watch hands over a signed catalog is offered as undoing the signature: " + JSON.stringify(o2b.trust || null));
    const c2c = run(lab2, ["library"], true);
    const r2 = row(c2c, "lamp-1.ec");
    check(c2b.reloaded && Array.isArray(c2b.lineAtPress) && c2b.lineAtPress.length === 0
      && !!r2 && r2.loaded && r2.trust && r2.trust.state === V2.V2_SIG_INVALID,
      "2c an edition loaded from the Library, Yes pressed before its check answered, is the state its row says: " + said(r2)
      + ", the bubble's line at the press " + JSON.stringify(c2b.lineAtPress === undefined ? null : c2b.lineAtPress));

    /* 3: THE LIBRARY ON AN EMPTY DESK loads a file at once, without a question. An unsigned file that
       is not the folder's newest, so the Library's recheck of the newest cannot stand in for it. */
    const lab3 = scenario([["catalogs/lamp-u.ec", payload("2026-08-01")], ["catalogs/lamp-a.ec", sign(payload("2026-09-01"))],
      ["catalogs/etiuda-ring.json", ring]]);
    const d3 = run(lab3, ["boot", "library", "load:lamp-u.ec", "settle"]);
    const d3b = run(lab3, ["library"], true);
    const r3 = row(d3b, "lamp-u.ec");
    check(d3.reloaded && !!r3 && r3.loaded && r3.trust && r3.trust.state === V2.V2_SIG_NONE && UNSIGNED.test(r3.trust.text),
      "3a a file loaded at once from the Library on an empty desk is said unsigned on its row: " + said(r3));

    /* 4: A RING PLACED AFTER LOADING. The key is unknown until the ring is there, and the next
       launch's Library reads it again. */
    const lab4 = scenario([["catalogs/lamp.ec", sign(payload("2026-09-01"))]]);
    const e4 = run(lab4, ["boot", "settle", "offer", "yes", "settle"]);
    const o4 = e4.offers[0] || {};
    check(o4.shown && o4.trust.length === 1 && UNKNOWN_KEY.test(o4.trust[0]),
      "4a with no ring, the boot's offer says the key is one this computer does not know: " + JSON.stringify(o4.trust || null));
    const e4b = run(lab4, ["library"], true);
    const r4 = row(e4b, "lamp.ec");
    check(e4.reloaded && !!r4 && r4.loaded && r4.trust && r4.trust.state === V2.V2_SIG_UNKNOWN,
      "4b and the loaded row says the same, which is what 4c must see go: " + said(r4));
    fs.writeFileSync(path.join(lab4, "catalogs", "etiuda-ring.json"), ring, "utf8");
    const e4c = run(lab4, ["library"]);
    const r4c = row(e4c, "lamp.ec");
    check(!!r4c && r4c.loaded && !r4c.trust && e4c.heldAtStart === V2.V2_SIG_UNKNOWN && e4c.heldAtEnd === V2.V2_SIG_VALID,
      "4c the ring placed, a relaunched Library reads the loaded catalog again and its line goes: "
      + (r4c ? said(r4c) : "no row") + ", held " + e4c.heldAtStart + " then " + e4c.heldAtEnd);

    /* 5: THE BOOT'S READER REFUSES THE NEWEST FILE and the shell hands the next; the offer is about
       that one, and its signature is the one read. */
    const refused = sign(payload("2026-09-20"));
    refused.cards[0].shelf = "t-nowhere";
    const lab5 = scenario([["catalogs/lamp.ec", bend(sign(payload("2026-09-01")))], ["catalogs/lamp-new.ec", refused],
      ["catalogs/etiuda-ring.json", ring]]);
    const f5 = run(lab5, ["boot", "settle", "offer"]);
    const o5 = f5.offers[0] || {};
    check(o5.shown && o5.files.includes("lamp.ec") && o5.trust.length === 1 && CHANGED.test(o5.trust[0]),
      "5a a boot whose newest file is refused offers the next, with that file's signature: "
      + JSON.stringify(o5.files || null) + " " + JSON.stringify(o5.trust || null));

    /* 0: WHAT EVERY LAUNCH ABOVE RESTS ON. */
    check(launches.length === 11 && launches.every(o => o.tourDue === false),
      "0a no launch had the tour due, so no offer waited behind it: " + launches.map(o => o.tourDue).join(","));
    const errs = launches.flatMap(o => o.errors || []);
    check(!errs.length,
      "0b every launch ran its acts without an error" + (errs.length ? ": " + errs.length + ", first " + errs[0] : ""));
  } catch (e) {
    failed++;
    console.log("  FAIL " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    labs.forEach(l => { try { fs.rmSync(l, { recursive: true, force: true }); } catch { /* said below */ } });
    check(labs.length > 0 && labs.every(l => !fs.existsSync(l)),
      "0c the temp folders are gone");
  }

  console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
  if (asserted < EXPECTED) {
    console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
    process.exit(78);
  }
  console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
  process.exit(Math.min(failed, 63));
}
