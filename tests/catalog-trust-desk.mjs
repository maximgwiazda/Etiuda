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
 * markup the desk rendered at run time: the offer bubble's `.ec-trust` line, and the Library row's `.ec-key`.
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
  /* A press by the page's own code, as the offer's panel presses the bubble's buttons: the handler, and nothing a pointer adds. */
  click() { if (typeof this.onclick === "function") this.onclick({ type: "click", target: this, preventDefault() {}, stopPropagation() {} }); this.dispatch("click"); }
  getContext() { return {}; }
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
/* Compound selectors joined by descendant spaces or `>`, and `:scope >` at the head, and a `:not(...)` over one simple selector. Nothing else. */
const SIMPLE = String.raw`#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\]`;
const COMPOUND = new RegExp("^([a-zA-Z][\\w-]*|\\*)?((?:" + SIMPLE + "|:not\\((?:" + SIMPLE + ")\\))*)$");
function parts(sel) {
  const s = String(sel).trim();
  if (s.includes(",")) throw new Error("stub page: selector list " + s);
  return s.replace(/\s*>\s*/g, " > ").split(/\s+/);
}
function compound(el, c) {
  const m = COMPOUND.exec(c);
  if (!m) throw new Error("stub page: selector " + c);
  if (m[1] && m[1] !== "*" && el.localName !== m[1].toLowerCase()) return false;
  const bits = m[2].match(new RegExp(":not\\((?:" + SIMPLE + ")\\)|" + SIMPLE, "g")) || [];
  const one = b => b[0] === "#" ? el.id === b.slice(1)
    : b[0] === "." ? el.classList.contains(b.slice(1))
    : (() => { const q = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(b); return q[2] === undefined ? el.hasAttribute(q[1]) : el.getAttribute(q[1]) === q[2]; })();
  return bits.every(b => b.startsWith(":not(") ? !one(b.slice(5, -1)) : one(b));
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
  // The page's toast host, which a load of a new edition speaks through after the desk starts again.
  doc.body.appendChild(new El("div", doc)).id = "toast";
  doc.activeElement = doc.body;
  doc.createRange = () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) });
  doc.contains = n => doc.documentElement.contains(n);
  doc.getElementById = id => queryAll(doc.documentElement, "#" + id)[0] || null;
  doc.querySelector = sel => queryAll(doc.documentElement, sel)[0] || null;
  doc.querySelectorAll = sel => queryAll(doc.documentElement, sel);
  doc.addEventListener = (t, fn) => { (doc.listeners[t] = doc.listeners[t] || []).push(fn); };
  doc.removeEventListener = (t, fn) => { doc.listeners[t] = (doc.listeners[t] || []).filter(f => f !== fn); };
  doc.dispatch = t => (doc.listeners[t] || []).slice().forEach(fn => fn({ type: t }));
  return doc;
}

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
  decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
};

/* ================================================================================================
   ONE LAUNCH: the shell's main process and preload, the page's modules, then the acts in order.
   Prints one line, `#launch {...}`, with what the page showed.
   ================================================================================================ */
async function launch(plan) {
  const LAB = plan.lab, UD = path.join(LAB, "userdata"), SHELL = path.join(LAB, "shell");
  const obs = { errors: [], offers: [], library: [], bars: [], read: {}, reloaded: false, heldAtStart: null, heldAtEnd: null, tourDue: null };
  process.on("unhandledRejection", e => obs.errors.push("unhandled " + String(e && e.message || e).slice(0, 160)));
  process.on("uncaughtException", e => obs.errors.push("uncaught " + String(e && e.message || e).slice(0, 160)));
  const noop = () => {};
  const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
  const onHandlers = {}, invokeHandlers = {}, rendererOn = {};
  const pickBox = { answer: null };
  const pageWin = {
    isDestroyed: () => false, isMaximized: () => false,
    webContents: { id: 1, once: noop, send: (ch, ...args) => { (rendererOn[ch] || []).forEach(fn => fn({}, ...args)); } },
  };
  const electron = {
    app: { getPath: () => UD, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
           getVersion: () => "0.0.0", whenReady: () => new Promise(noop), isPackaged: false,
           commandLine: { appendSwitch: noop } },
    ipcMain: { on: (ch, fn) => { onHandlers[ch] = fn; }, handle: (ch, fn) => { invokeHandlers[ch] = fn; } },
    shell: { openPath: async () => "" },
    BrowserWindow: { fromWebContents: () => pageWin, getAllWindows: () => [] },
    Menu: inert,
    dialog: { showOpenDialog: async () => pickBox.answer || { canceled: true, filePaths: [] }, showSaveDialog: async () => ({ canceled: true }) },
    net: inert, protocol: inert, session: inert,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
    safeStorage,
  };
  const quiet = { log: noop, error: noop, warn: noop, info: noop };
  const shellSrc = f => (fs.existsSync(path.join(SHELL, f)) ? fs.readFileSync(path.join(SHELL, f), "utf8") : fs.readFileSync(path.join(ROOT, "shell", f), "utf8"));
  process.env.XDG_CURRENT_DESKTOP = "GNOME"; /* so the shell's Linux keyring switch (tests/shell-office.mjs 14) stays out, on any machine */
  /* A file main.js requires from beside itself is the tree's: the lab's shell folder holds its built-in catalogs alone. */
  const beside = n => (path.isAbsolute(n) && path.dirname(n) === SHELL ? path.join(ROOT, "shell", path.basename(n)) : n);
  const mockRelay = plan.mockRelay ? {
    createChannel: () => ({
      start: noop, stop: async () => {}, kick: noop, online: () => true,
      program: {
        state: () => ({
          sent: plan.mockRelay.sent || {},
          refused: plan.mockRelay.refused || {},
          pending: plan.mockRelay.pending || []
        })
      }
    })
  } : null;
  new Function("require", "__dirname", "__filename", "module", "exports", "console", shellSrc("main.js"))(
    n => {
      if (n === "electron") return electron;
      if (mockRelay && n.endsWith(path.join("relay", "channel.cjs"))) return mockRelay;
      return nodeRequire(beside(n));
    }, SHELL, path.join(SHELL, "main.js"), { exports: {} }, {}, quiet);

  const FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
  const ev = () => ({ sender: { id: 1, once: noop, send: noop }, senderFrame: FRAME, returnValue: undefined });
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
  /* The band's catalog name, where an edition left waiting wears its dot: only where a plan asks, since the scenarios
     before 74l were written against a page without it, and 72b, 72l and 72o go red with it there. */
  if (plan.band) { const band = doc.body.appendChild(new El("div", doc)); band.id = "catNow"; band.appendChild(new El("span", doc)).className = "cn-name"; }
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
  /* A QUESTION STANDING OVER THE DESK: a bubble that asks, not on its way out, and not the Undo. */
  const standing = () => doc.body.children.filter(n => n.classList.contains("bub-ask") && !n.classList.contains("e-gone") && n.id !== "eUndo").length;
  const restarted = () => {
    if (obs.reloaded) return;
    obs.reloaded = true;
    obs.askedAtRestart = standing();
    ["beforeunload", "pagehide", "unload"].forEach(t => (winListeners[t] || []).slice().forEach(fn => { try { fn({ type: t }); } catch (e) { obs.errors.push(t + " " + e.message); } }));
  };
  Object.defineProperty(globalThis, "location", { configurable: true, value: {
    href: FRAME.url, protocol: "file:", search: "", hash: "", pathname: "/C:/lab/engine/etiuda.html",
    reload: restarted } });
  const contextBridge = { exposeInMainWorld: (k, v) => { globalThis[k] = v; }, executeInMainWorld: o => o.func(...(o.args || [])) };
  new Function("require", shellSrc("preload.js"))(n => (n === "electron" ? { contextBridge, ipcRenderer, webUtils: {} } : nodeRequire(n)));

  const OFFER = await import(MOD("catalog-offer.js"));
  const CF = await import(MOD("catalog-file.js"));
  const TR = await import(MOD("catalog-trust.js"));
  const ST = await import(MOD("storage.js"));
  const TOUR = await import(MOD("tour.js"));
  const DOMM = await import(MOD("dom.js"));
  const PACK = await import(MOD("pack.js"));
  const BOOT = await import(MOD("catalog-boot.js"));
  const CAT = await import(MOD("catalog.js"));
  const DLG = await import(MOD("dialog.js"));
  const APP = await import(MOD("app-state.js"));
  /* THE APP-LEVEL ACTIONS the page's boot registers in hooks.js, none of them on the trust path:
     the sample's watermark and the unsaved notice repaint the rest of the page. Named one by one,
     so a slot this path starts calling is a TypeError in 0b rather than a silent stub. */
  const HOOKS = (await import(MOD("hooks.js"))).hooks;
  ["syncSampleMark", "syncSaveNotice", "flushPillState"].forEach(k => { HOOKS[k] = noop; });
  HOOKS.restartDesk = restarted;
  HOOKS.offerPickedCatalog = OFFER.eOfferPickedCatalog;
  obs.heldAtStart = TR.heldCatalogTrust();
  obs.fileAtStart = ST.nsGet("CatalogFile") || "";
  obs.tourDue = TOUR.tourDueAtBoot();

  const settle = ms => new Promise(r => setTimeout(r, ms || 300));
  const texts = (root, sel) => root.querySelectorAll(sel).map(n => n.textContent.trim());
  const readOffer = () => {
    const b = doc.getElementById("eCatalogOffer");
    return b ? { shown: true, trust: texts(b, ".ec-trust"), files: texts(b, ".ec-sub code"),
      warn: texts(b, ".ec-warn"), signer: texts(b, ".ec-signer"), roster: texts(b, ".ec-roster"), holds: texts(b, ".ec-holds"),
      title: texts(b, "#ecTitle")[0] || "",
      yes: texts(b, "#ecYes")[0] || "", no: texts(b, "#ecNo")[0] || "" }
      : { shown: false, trust: [], files: [], warn: [], signer: [], roster: [], holds: [], yes: "", no: "" };
  };
  const readLibrary = () => {
    const box = doc.getElementById("mgCatList");
    return box ? box.querySelectorAll(".ec-row").map(r => {
      const k = r.querySelector(".ec-key");
      return { name: (r.querySelector(".ec-name b") || { textContent: "" }).textContent,
               loaded: r.classList.contains("is-loaded"),
               key: (k && k.getAttribute("data-trust")) ? { state: k.getAttribute("data-trust"), word: k.getAttribute("aria-label"),
                 gold: k.classList.contains("on"), tip: k.getAttribute("data-tip") || "" } : null };
    }) : [];
  };
  const act = {
    boot: () => { OFFER.eOfferCatalogAtBoot(); OFFER.wireHostCatalogWatch(); },
    settle: () => settle(),
    offer: () => { obs.offers.push(readOffer()); },
    yes: () => { const y = doc.getElementById("ecYes"); if (!y) throw new Error("no Yes on screen"); obs.askedAtPress = standing(); y.onclick(); },
    /* YES THE MOMENT THE BUBBLE IS UP, one turn of the event loop at a time: the ring is asked in
       the turn that puts the bubble up and answers a turn later, so this press precedes the answer,
       and whether the bubble already carried its line when pressed is written down to show it. */
    yesAtOnce: async () => {
      for (let i = 0; i < 500 && !doc.getElementById("ecYes"); i++) await new Promise(r => setImmediate(r));
      const y = doc.getElementById("ecYes");
      if (!y) throw new Error("no Yes on screen");
      obs.lineAtPress = texts(doc.getElementById("eCatalogOffer"), ".ec-trust");
      obs.askedAtPress = standing();
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
    /* A host whose answer about the pinned leads never comes, as a shell that hangs would leave it. */
    hangleads: () => { globalThis.E_HOST.catalogLeads = () => new Promise(() => {}); },
    // The Library read once a row's own wait for its check (2 s) is over, and a little more.
    librarylate: async () => {
      if (!doc.getElementById("mgCatList")) { const l = doc.createElement("div"); l.id = "mgCatList"; doc.body.appendChild(l); }
      OFFER.paintCatalogList();
      await settle(2600);
      obs.library.push(readLibrary());
    },
    // The file picker's reading half, over a file anywhere: importCatalogText is where both import routes end.
    import: file => { CF.importCatalogText(fs.readFileSync(path.join(LAB, file), "utf8"), path.basename(file)); },
    load: name => { const b = doc.querySelector("button[data-ec-load=\"" + name + "\"]"); if (!b) throw new Error("no Load for " + name); b.onclick(); },
    // A colleague's file asked for by name and desk ("name,desk"), as Work from it asks once its row has been drawn.
    deskload: arg => { const [n, id] = String(arg).split(","); OFFER.loadCatalogFromFolder(n, 0, id); },
    /* THE TOP BAR'S NAME is catalogFileName(), which paintCatNow writes into the bar; the stub page has no bar to draw in. */
    bar: () => { obs.bars.push(CF.catalogFileName()); },
    /* THE SHELL'S SEND OF THE LISTING, as it reaches the page: the shell's own answer to the listing, handed to the listener the preload registered. */
    listing: async () => {
      const rows = await ipcRenderer.invoke("etiuda:catalog-files");
      (rendererOn["etiuda:catalog-listing"] || []).forEach(fn => fn({}, rows));
      await settle();
    },
    fsop: arg => {
      const [op, a, b] = String(arg).split(","), dir = path.join(LAB, "catalogs");
      if (op === "rename") fs.renameSync(path.join(dir, a), path.join(dir, b));
      else if (op === "copy") fs.copyFileSync(path.join(dir, a), path.join(dir, b));
      else throw new Error("fsop " + op);
    },
    watch: file => { const text = fs.readFileSync(path.join(LAB, file), "utf8");
      (rendererOn["etiuda:catalog-file"] || []).forEach(fn => fn({}, text, path.basename(file), path.join(LAB, "catalogs"), false, "", false)); },
    /* A double-click, as offerFile sends it: the page is asked, and it answers. */
    click: file => {
      const text = fs.readFileSync(path.join(LAB, file), "utf8");
      const at = path.join(LAB, file);
      (rendererOn["etiuda:catalog-file"] || []).forEach(fn => fn({}, text, path.basename(at), path.dirname(at), true, "", false));
    },
    /* The catalog-file listener, without the boot's offer. */
    wire: () => { OFFER.wireHostCatalogWatch(); },
    /* A double-click or a drop, through the shell's own offerFile, so the roster note is the shell's. */
    openpath: file => { ipcRenderer.send("etiuda:offer-dropped", path.resolve(path.join(LAB, file))); },
    /* Import's dialog, the shell's, pointed at one file. The offer or the load lands on a later turn. */
    pickpath: file => {
      pickBox.answer = { canceled: false, filePaths: [path.resolve(path.join(LAB, file))] };
      CF.importCatalogHere();
    },
    /* A kept version, opened from the history list the shell already holds. */
    hist: async () => {
      if (!doc.getElementById("modal")) {
        const m = doc.createElement("div"), card = doc.createElement("div");
        m.id = "modal"; m.hidden = true; card.id = "modalCard"; m.appendChild(card); doc.body.appendChild(m);
        DOMM.grabDom();
        const ask = card.querySelectorAll.bind(card);
        card.querySelectorAll = sel => (/^(\.mf input|\.ctitle,)/.test(sel) ? [] : ask(sel));
      }
      HOOKS.openManage = noop;
      const HIST = await import(MOD("catalog-history.js"));
      HIST.openHistory();
      for (let i = 0; i < 500 && !doc.querySelector("[data-eh-open]"); i++) await new Promise(r => setImmediate(r));
      const b = doc.querySelector("[data-eh-open]");
      if (!b) throw new Error("no version to open");
      b.onclick();
    },
    /* The cut pass needs the range grabDom takes. A refusal toast marks the toast host. */
    dom: () => { DOMM.grabDom(); },
    /* Wait until a Load's read has landed on a toast or an offer, then read the offer. */
    said: async () => {
      const host = doc.getElementById("toast");
      for (let i = 0; i < 500 && !(host && host.textContent) && !doc.getElementById("eCatalogOffer"); i++)
        await new Promise(r => setImmediate(r));
      obs.offers.push(readOffer());
    },
  };
  /* THE OFFER'S PANEL, driven as the desk drives it. `desk` is the page's own start in order, as restart.js runs it
     (the catalog applied, then the layer read), with the modal window the page has and this stub has not; the acts
     after it press the handlers the offer and the panel wired, and write down what then stood on the page. */
  const pressed = sel => doc.querySelectorAll(sel).map(n => n.getAttribute("aria-pressed"));
  const bubble = () => doc.getElementById("eCatalogOffer");
  const modalUp = () => { const m = doc.getElementById("modal"); return !!m && !m.hidden; };
  const cardRow = id => { const b = bubble(), li = b && b.querySelector("li[data-ec-id=\"" + id + "\"]"); return li ? li.textContent.trim() : null; };
  const bodyOf = (c, id) => { const m = ((c && c.cards) || []).find(x => x.id === id); return m ? String(m.en) : null; };
  const takes = () => pressed("[data-ed-take=\"1\"]").concat(pressed("[data-ed-take=\"0\"]"));
  Object.assign(act, {
    desk: () => {
      const m = doc.createElement("div"), card = doc.createElement("div");
      m.id = "modal"; m.hidden = true; card.id = "modalCard"; m.appendChild(card); doc.body.appendChild(m);
      DOMM.grabDom();
      /* The two sweeps the dialog makes over its card after wiring, which the stub's selectors cannot say (a list, and :not()),
         are the dressing of a form's text inputs and the fade of a cut line: neither is the panel's business, so each is
         answered with nothing found, and every other query still has to be one the stub knows. */
      const ask = card.querySelectorAll.bind(card);
      card.querySelectorAll = sel => (/^(\.mf input|\.ctitle,)/.test(sel) ? [] : ask(sel));
      BOOT.applyBootCatalog();
      PACK.loadPack();
      PACK.rebuildBaseCards();
      /* The cards the list would hold, as rebuild.js makes them, so the desk is not "empty" to the boot's offer (wholeThingEmpty). */
      const ov = PACK.pack.overrides || {};
      APP.setCards(PACK.BASE_M.filter(b => !b.retired).map(b => (ov[b.id] ? Object.assign({}, b, ov[b.id]) : Object.assign({}, b))));
    },
    override: () => { PACK.pack.overrides = Object.assign(PACK.pack.overrides || {}, { "c-b": plan.override }); PACK.savePack(); },
    readchange: () => {
      const b = bubble();
      obs.read.bubble = !b ? null : { hidden: b.hidden, change: b.querySelectorAll(".ec-change").length,
        counts: b.querySelectorAll(".ec-counts").map(n => ({ text: n.textContent.trim(), n: n.querySelectorAll(".ec-n").length })),
        n: texts(b, ".ec-n"), ids: b.querySelectorAll("[data-ec-id]").map(n => n.getAttribute("data-ec-id")), what: texts(b, ".ec-what")[0] || "", ed: texts(b, ".ec-ed"),
        diff: b.querySelectorAll("#ecDiff").length, own: cardRow("c-b") };
    },
    panel: () => {
      doc.getElementById("ecDiff").onclick();
      const card = doc.getElementById("modalCard"), g = card.querySelector("#edPane .ed-grid");
      obs.read.panel = { bubbleHidden: bubble().hidden, modal: modalUp(), cls: card.className, rows: card.querySelectorAll(".ed-row").length,
        current: texts(card, ".ed-row[aria-current=\"true\"]"), grid: g ? g.className : null, take: takes(), title: texts(card, ".modal-t")[0] || "" };
    },
    take: arg => {
      doc.querySelector("[data-ed-take=\"" + arg + "\"]").onclick();
      obs.read["take" + arg] = { take: takes(), row: texts(doc.getElementById("modalCard"), ".ed-row[aria-current=\"true\"]"), own: cardRow("c-b") };
    },
    edload: () => { doc.getElementById("edLoad").onclick(); obs.read.afterLoad = { modal: modalUp() }; },
    edkeep: () => { doc.getElementById("edKeep").onclick(); obs.read.afterKeep = { modal: modalUp() }; },
    no: () => { const n = doc.getElementById("ecNo"); if (!n) throw new Error("no decline on screen"); n.onclick(); },
    // The band's name as it stands: the dot, the words it says, where the keyboard is, and the offer's decline if one is up.
    readwait: () => {
      const at = doc.getElementById("catNow"), no = doc.getElementById("ecNo");
      (obs.read.wait = obs.read.wait || []).push({ waiting: at.classList.contains("is-waiting"), dot: !!at.querySelector(".cn-dot"),
        label: at.getAttribute("aria-label"), focus: (doc.activeElement && doc.activeElement.id) || "", offer: standing(),
        no: no ? no.textContent.trim() : null });
    },
    // The name's own handler: a waiting edition opened again, which is how a settled failure is offered a second time.
    reopen: () => {
      const at = doc.getElementById("catNow");
      if (!at || typeof at.onclick !== "function") throw new Error("the name is not waiting");
      at.onclick();
    },
    edback: () => {
      DLG.dismissModal();
      const b = bubble();
      obs.read.afterBack = { modal: modalUp(), bubble: !!b, hidden: !!b && b.hidden, focus: doc.activeElement && doc.activeElement.id };
    },
    readdesk: () => {
      const o = (PACK.pack.overrides || {})["c-b"], b = PACK.BASE_M.find(m => m.id === "c-b");
      obs.read.desk = { over: o ? JSON.parse(JSON.stringify(o)) : null, base: b ? String(b.en) : null, held: bodyOf(CAT.storedCatalog(), "c-b"),
        refused: ST.nsGet("CatalogNo") || "", standing: standing() };
    },
  });
  /* A COLLEAGUE'S FILE IN THE LIBRARY, and the panel behind its Look: each row as the list drew it, the desk's own place
     in the list (`at`) for the acts that press its buttons, and the hooks this path calls, counted rather than stubbed. */
  const readRows = () => {
    const box = doc.getElementById("mgCatList");
    return box ? box.querySelectorAll(".ec-row").map(r => {
      const b = r.querySelector(".ec-name b"), who = r.querySelector(".ec-who");
      return { name: b && b.childNodes[0] ? b.childNodes[0].textContent : "", desk: r.classList.contains("ec-desk"), alone: r.classList.contains("ec-alone"),
               loaded: r.classList.contains("is-loaded"), file: r.getAttribute("data-ec-file"), at: r.getAttribute("data-ec-desk"),
               fp: texts(r, ".ec-fp")[0] || "", tip: who ? (who.getAttribute("data-tip") || "").replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, m => ENT[m]) : "", mine: texts(r, ".ec-mine"),
               meta: texts(r, ".ec-meta")[0] || "", acts: r.querySelectorAll("button").map(x => x.getAttribute("aria-label") || x.id) };
    }) : [];
  };
  obs.rows = [];
  Object.assign(act, {
    rows: async () => {
      if (!doc.getElementById("mgCatList")) { const l = doc.createElement("div"); l.id = "mgCatList"; doc.body.appendChild(l); }
      OFFER.paintCatalogList();
      await settle();
      obs.rows.push(readRows());
    },
    look: async at => {
      obs.backs = 0; HOOKS.openManage = () => { obs.backs++; };
      const b = doc.querySelector("button[data-ec-look=\"" + at + "\"]");
      if (!b) throw new Error("no Look on row " + at);
      b.onclick();
      await settle();
      const card = doc.getElementById("modalCard");
      obs.read.look = !modalUp() ? null : { title: texts(card, ".modal-t")[0] || "", name: texts(card, ".modal-name")[0] || "",
        heads: texts(card, ".ed-head"), rows: card.querySelectorAll(".ed-row").length, mine: pressed("[data-ed-mine]"),
        mineWord: texts(card, "[data-ed-mine]"), keep: texts(card, "#edKeep")[0] || "", load: texts(card, "#edLoad")[0] || "", take: takes() };
    },
    mine: () => {
      obs.rebuilt = obs.rebuilt || 0; HOOKS.rebuildCards = () => { obs.rebuilt++; };
      const b = doc.querySelector("[data-ed-mine]");
      if (!b) throw new Error("no take on the panel");
      b.onclick();
      obs.read.mine = (obs.read.mine || []).concat([{ pressed: pressed("[data-ed-mine]"),
        row: texts(doc.getElementById("modalCard"), ".ed-row[aria-current=\"true\"]"),
        over: JSON.parse(JSON.stringify((PACK.pack.overrides || {})[plan.card] || null)), rebuilt: obs.rebuilt }]);
    },
    // The agent's own wording of the card, as an edit made before the Look, and put away again after it.
    ownedit: which => { PACK.pack.overrides = Object.assign(PACK.pack.overrides || {}, { [plan.card]: plan[which || "own"] }); PACK.savePack(); },
    // The desk starting again in place, which is where restart.js has Look forget what it kept.
    forgetlook: async () => { (await import(MOD("desk-look.js"))).forgetLookEdits(); },
    ownclear: () => { delete (PACK.pack.overrides || {})[plan.card]; PACK.savePack(); },
    edback2: () => { doc.getElementById("edKeep").onclick(); obs.read.back = { modal: modalUp(), backs: obs.backs }; },
    work: at => { const b = doc.querySelector("button[data-ec-work=\"" + at + "\"]"); if (!b) throw new Error("no Work on row " + at); b.onclick(); },
    over: () => { obs.read.over = JSON.parse(JSON.stringify(PACK.pack.overrides || {})); obs.read.heldId = String((CAT.storedCatalog() || {}).id || ""); },
    // A colleague's file landing while the Library is open, and the list read as it then stands, painted by nothing here.
    drop: () => { const at = path.join(LAB, "catalogs", plan.drop.rel); fs.mkdirSync(path.dirname(at), { recursive: true }); fs.writeFileSync(at, plan.drop.text, "utf8"); },
    holdbranch: async stem => {
      const dest = path.join(LAB, "catalogs", "desks", plan.ownDeskId, stem + ".ec");
      const bak = dest + ".bak";
      if (fs.existsSync(dest)) fs.renameSync(dest, bak);
      fs.mkdirSync(dest);
      try {
        const text = fs.existsSync(bak) ? fs.readFileSync(bak, "utf8") : "";
        await ipcRenderer.invoke("etiuda:branch-write", stem, text);
      } finally {
        fs.rmdirSync(dest);
        if (fs.existsSync(bak)) fs.renameSync(bak, dest);
      }
    },
    reread: async () => { await settle(); obs.rows.push(readRows()); },
  });
  for (const a of plan.acts) {
    if (obs.reloaded) break;
    const [name, arg] = String(a).split(":");
    try { await act[name](arg); } catch (e) { obs.errors.push(name + ": " + String(e && e.message || e).slice(0, 160)); }
  }
  if (obs.reloaded) await settle(50);
  obs.askedAtEnd = standing();
  obs.heldAtEnd = TR.heldCatalogTrust();
  obs.fileAtEnd = ST.nsGet("CatalogFile") || ""; obs.fromAtEnd = ST.nsGet("CatalogFrom") || "";
  obs.pinAtEnd = (() => { try { return JSON.parse(ST.lsGet("eCatalog") || "{}").pin || ""; } catch { return ""; } })();
  obs.heldRev = (() => { try { const d = JSON.parse(ST.lsGet("eCatalog") || "{}"); return d && d.rev != null ? d.rev : null; } catch { return null; } })();
  obs.heldId = (() => { try { return String(JSON.parse(ST.lsGet("eCatalog") || "{}").id || ""); } catch { return ""; } })();
  // The marks a loaded edition leaves on the cards it brought (edition-marks.js), counted by key.
  obs.editionMarks = ST.lsKeys().filter(k => /EditionMarks$/.test(k) && ST.lsGet(k)).length;
  obs.editionName = (() => { const k = ST.lsKeys().find(k => /EditionMarks$/.test(k) && ST.lsGet(k));
    try { const m = k ? JSON.parse(ST.lsGet(k)) : null; return m ? { e: m.e, r: m.r } : null; } catch { return null; } })();
  obs.toast = (doc.getElementById("toast") && doc.getElementById("toast").textContent) || "";
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
  const EXPECTED = 127;
  let asserted = 0, failed = 0;
  const check = (ok, line) => { asserted++; if (ok) console.log("  ok   " + line); else { failed++; console.log("  FAIL " + line); } };

  const V2 = await import(MOD("catalog-v2.js"));
  const pair = crypto.generateKeyPairSync("ed25519");
  const KEY_ID = "trust-desk-harness", ID = "lamp-shop";
  const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  /* A public key as the desk names it: the first 16 hex of the SHA-256 of the raw key, in fours. */
  const foursOf = hex => crypto.createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex").slice(0, 16).replace(/(.{4})(?=.)/g, "$1 ");
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
  const run = (lab, acts, carry, extra) => {
    const r = spawnSync(process.execPath, [SELF, "--launch", JSON.stringify(Object.assign({ lab, acts, session: carry ? session : {} }, extra || {}))],
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
  const said = r => (r && r.key) ? r.key.state + (r.key.gold ? " gold " : " grey ") + r.key.word + " \"" + r.key.tip + "\"" : "no key";
  const CHANGED = /changed since it was signed/, UNKNOWN_KEY = /does not know/;

  try {
    /* 1: THE BOOT'S OFFER. A file changed since it was signed, found in the folder on an empty desk. */
    const lab1 = scenario([["catalogs/lamp.ec", bend(sign(payload("2026-09-01")))], ["catalogs/etiuda-ring.json", ring]]);
    const b1 = run(lab1, ["boot", "settle", "offer", "yes", "settle"]);
    const o1 = b1.offers[0] || {};
    check(o1.shown && o1.trust.length === 1 && CHANGED.test(o1.trust[0]),
      "1a the boot's offer of a file changed since it was signed says so in its bubble: " + JSON.stringify(o1.trust || null));
    const b1b = run(lab1, ["library"], true);
    const r1 = row(b1b, "lamp.ec");
    check(b1.reloaded && !!r1 && r1.loaded && r1.key && r1.key.state === V2.V2_SIG_INVALID && !r1.key.gold && CHANGED.test(r1.key.tip),
      "1b accepted, the desk starts again with it and the Library's loaded row wears a grey key whose bubble says it was changed: " + said(r1));

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
      && !!r2 && r2.loaded && r2.key && r2.key.state === V2.V2_SIG_INVALID,
      "2c an edition loaded from the Library, Yes pressed before its check answered, is the state its row says: " + said(r2)
      + ", the bubble's line at the press " + JSON.stringify(c2b.lineAtPress === undefined ? null : c2b.lineAtPress));

    /* 6: AN OFFER'S YES TAKES ITS QUESTION DOWN BEFORE THE DESK STARTS AGAIN, on each route that ends
       in that one Yes: the boot's find (1), a Library row over a loaded catalog (2), and a file picked
       over a loaded catalog, here. One standing at the press is what shows the count can see one. */
    const p6 = run(lab2, ["import:lamp-3.ec", "settle", "offer", "yes", "settle"], true);
    const down = o => o.askedAtPress === 1 && o.reloaded && o.askedAtRestart === 0 && o.askedAtEnd === 0;
    const asked = o => JSON.stringify({ press: o.askedAtPress, start: o.askedAtRestart, end: o.askedAtEnd, started: o.reloaded });
    check(down(b1), "6a the boot's offer, answered Yes, is down before the desk starts again: " + asked(b1));
    check(down(c2b), "6b a Library row loaded over a catalog, answered Yes, is down before the desk starts again: " + asked(c2b));
    check(!!(p6.offers[0] || {}).shown && down(p6),
      "6c a file picked over a loaded catalog, answered Yes, is down before the desk starts again: " + asked(p6));

    /* 3: THE LIBRARY ON AN EMPTY DESK loads a file at once, without a question. An unsigned file that
       is not the folder's newest, so the Library's recheck of the newest cannot stand in for it. */
    const lab3 = scenario([["catalogs/lamp-u.ec", payload("2026-08-01")], ["catalogs/lamp-a.ec", sign(payload("2026-09-01"))],
      ["catalogs/etiuda-ring.json", ring]]);
    const d3 = run(lab3, ["boot", "library", "load:lamp-u.ec", "settle"]);
    const d3b = run(lab3, ["library"], true);
    const r3 = row(d3b, "lamp-u.ec");
    check(d3.reloaded && !!r3 && r3.loaded && r3.key && r3.key.state === V2.V2_SIG_NONE && !r3.key.gold
      && r3.key.word === "Unsigned" && r3.key.tip === "",
      "3a a file loaded at once from the Library on an empty desk wears a grey key named Unsigned on its row: " + said(r3));
    const r3a = row(d3b, "lamp-a.ec");
    check(!!r3a && !r3a.loaded && r3a.key && r3a.key.state === V2.V2_SIG_VALID && r3a.key.gold && r3a.key.word === "Signed"
      && r3a.key.tip === "This file is signed with the key " + foursOf(pubHex(pair.publicKey)) + ".",
      "3b a folder file nobody has loaded is checked as a load would check it: its row wears a gold key named Signed,"
      + " whose bubble names the key that signed it by the print of its public: " + said(r3a));

    /* 4: A RING PLACED AFTER LOADING. The key is unknown until the ring is there, and the next
       launch's Library reads it again. */
    const lab4 = scenario([["catalogs/lamp.ec", sign(payload("2026-09-01"))]]);
    const e4 = run(lab4, ["boot", "settle", "offer", "yes", "settle"]);
    const o4 = e4.offers[0] || {};
    check(o4.shown && o4.trust.length === 1 && UNKNOWN_KEY.test(o4.trust[0]),
      "4a with no ring, the boot's offer says the key is one this computer does not know: " + JSON.stringify(o4.trust || null));
    const e4b = run(lab4, ["library"], true);
    const r4 = row(e4b, "lamp.ec");
    check(e4.reloaded && !!r4 && r4.loaded && r4.key && r4.key.state === V2.V2_SIG_UNKNOWN && UNKNOWN_KEY.test(r4.key.tip),
      "4b and the loaded row wears the grey key whose bubble says the same, which is what 4c must see turn gold: " + said(r4));
    fs.writeFileSync(path.join(lab4, "catalogs", "etiuda-ring.json"), ring, "utf8");
    const e4c = run(lab4, ["library"]);
    const r4c = row(e4c, "lamp.ec");
    check(!!r4c && r4c.loaded && r4c.key && r4c.key.state === V2.V2_SIG_VALID && r4c.key.gold
      && e4c.heldAtStart === V2.V2_SIG_UNKNOWN && e4c.heldAtEnd === V2.V2_SIG_VALID,
      "4c the ring placed, a relaunched Library reads the loaded catalog again and its key turns gold: "
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
    check(launches.length === 12 && launches.every(o => o.tourDue === false),
      "0a no launch had the tour due, so no offer waited behind it: " + launches.map(o => o.tourDue).join(","));
    const errs = launches.flatMap(o => o.errors || []);
    check(!errs.length,
      "0b every launch ran its acts without an error" + (errs.length ? ": " + errs.length + ", first " + errs[0] : ""));

    /* 71: A CATALOG STORED BEFORE THE PIN EXISTED is pinned from the file the boot finds in use, where that file is
       the stored catalog unchanged, and from nothing else. The desk file is edited on disk between launches, as a
       build older than the pin left it. */
    const sha = b => crypto.createHash("sha256").update(b).digest("hex");
    const stored = (lab, change) => {
      const f = path.join(lab, "userdata", "desk.json"), d = JSON.parse(fs.readFileSync(f, "utf8"));
      const c = JSON.parse(d.keys.eCatalog); change(c); d.keys.eCatalog = JSON.stringify(c);
      fs.writeFileSync(f, JSON.stringify(d), "utf8");
      return c;
    };
    const first = sign(payload("2026-09-01"));
    const lab71 = scenario([["catalogs/lamp.ec", first], ["catalogs/etiuda-ring.json", ring]]);
    const a71 = run(lab71, ["boot", "settle", "offer", "yes", "settle"]);
    const wantPin = "sha256:" + sha(V2.v2SignedBytes(first));
    const held = stored(lab71, c => { delete c.pin; });
    const b71 = run(lab71, ["boot", "settle"], true);
    check(a71.reloaded && !held.pin && b71.pinAtEnd === wantPin,
      "71a a catalog stored with no pin is pinned at boot from the file in use, where that is the stored catalog unchanged: sha256 over the engine's signed bytes of the file ("
      + b71.pinAtEnd.slice(0, 15) + ", expected " + wantPin.slice(0, 15) + ")");
    const lab71b = scenario([["catalogs/lamp.ec", first], ["catalogs/etiuda-ring.json", ring]]);
    run(lab71b, ["boot", "settle", "offer", "yes", "settle"]);
    stored(lab71b, c => { delete c.pin; });
    const edited = JSON.parse(JSON.stringify(first)); edited.cards[0].title.en = "Warm opening, reworded"; delete edited.hash;
    fs.writeFileSync(path.join(lab71b, "catalogs", "lamp.ec"), JSON.stringify(sign(edited)), "utf8");
    const c71 = run(lab71b, ["boot", "settle", "offer"], true);
    check(c71.pinAtEnd === "" && (c71.offers[0] || {}).shown === true,
      "71b THE CONTROL: where the file in the folder is no longer the stored catalog (reworded since), nothing is pinned from it, and it is offered as the update it is (pin " + JSON.stringify(c71.pinAtEnd) + ")");
    const lab71c = scenario([["catalogs/lamp.ec", first], ["catalogs/etiuda-ring.json", ring]]);
    run(lab71c, ["boot", "settle", "offer", "yes", "settle"]);
    const planted = "sha256:" + "00".repeat(32);
    stored(lab71c, c => { c.pin = planted; });
    const d71 = run(lab71c, ["boot", "settle"], true);
    check(d71.pinAtEnd === planted && wantPin !== planted,
      "71c THE CONTROL: a catalog already pinned keeps the pin it has (" + d71.pinAtEnd.slice(0, 15) + ")");

    /* 72: THE LISTING THE SHELL SENDS, and what the page decides from it, over the catalog in use. */
    const sha8 = x => sha(Buffer.from(x)).slice(0, 8);
    const withRev = (doc, rev) => Object.assign({}, doc, { rev: rev });
    const later = (lab, name, secs) => { const f = path.join(lab, "catalogs", name); const t = Date.now() / 1000 + secs; fs.utimesSync(f, t, t); };
    const wanted = payload("2026-09-01");
    /* A desk's genuine file: its own key, its id from the key, the prefix over the engine's signed bytes. */
    const deskFile = (lab, doc, who, claim) => {
      const pr = crypto.generateKeyPairSync("ed25519");
      const raw = pr.publicKey.export({ type: "spki", format: "der" }).subarray(-32);
      const id = "k-" + sha(raw).slice(0, 16);
      const d = Object.assign({}, doc, { id: claim ? doc.id : id + "-" + sha8(doc.id), modified: true, desk: { id: id, name: who, key: raw.toString("hex"), box: "ef".repeat(32) } });
      d.sig = { alg: "Ed25519", keyId: id };
      d.sig.value = crypto.sign(null, Buffer.concat([Buffer.from("etiuda-desk-branch" + NL), Buffer.from(V2.v2SignedBytes(d))]), pr.privateKey).toString("hex");
      const dir = path.join(lab, "catalogs", "desks", id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "colleague.ec"), JSON.stringify(d), "utf8");
      return d;
    };
    const accepted = () => {
      const lab = scenario([["catalogs/lamp.ec", wanted], ["catalogs/etiuda-ring.json", ring]]);
      run(lab, ["boot", "settle", "offer", "yes", "settle"]);
      return lab;
    };

    const lab72 = accepted();
    const a72 = run(lab72, ["boot", "bar", "listing", "fsop:rename,lamp.ec,lamp-renamed.ec", "listing", "bar", "offer"], true);
    check(a72.bars[0] === "lamp.ec" && a72.bars[1] === "lamp-renamed.ec" && a72.fileAtEnd === "lamp-renamed.ec" && a72.fromAtEnd === "lamp-renamed.ec"
        && !(a72.offers[0] || {}).shown && !a72.reloaded,
      "72a the file in use renamed under a running desk: the top bar and the remembered name follow, with no offer and no start again (bar " + JSON.stringify(a72.bars) + ", remembered " + JSON.stringify(a72.fileAtEnd) + ")");
    const c72 = run(lab72, ["boot", "bar", "library"], true);
    const lib72 = row(c72, "lamp-renamed.ec");
    check(c72.fileAtStart === "lamp-renamed.ec" && c72.bars[0] === "lamp-renamed.ec" && !!lib72 && lib72.loaded,
      "72b and a restart after it shows the new name, in the bar and as the Library's loaded row (" + JSON.stringify(c72.bars) + ")");

    const lab72b = accepted();
    fs.renameSync(path.join(lab72b, "catalogs", "lamp.ec"), path.join(lab72b, "catalogs", "lamp-while-closed.ec"));
    const d72 = run(lab72b, ["boot", "bar", "listing", "bar", "offer"], true);
    check(d72.bars[0] === "lamp.ec" && d72.bars[1] === "lamp-while-closed.ec" && d72.fileAtEnd === "lamp-while-closed.ec" && !(d72.offers[0] || {}).shown && !d72.reloaded,
      "72c a rename made while the desk was closed is followed at boot, from the listing the shell sends then (" + JSON.stringify(d72.bars) + ")");

    const lab72c = accepted();
    const e72 = run(lab72c, ["boot", "listing", "fsop:copy,lamp.ec,lamp-copy.ec", "listing", "bar", "offer"], true);
    check(e72.fileAtEnd === "lamp.ec" && e72.bars[0] === "lamp.ec" && !(e72.offers[0] || {}).shown,
      "72d THE CONTROL: a copy beside the old file is not followed, and is not offered (remembered " + JSON.stringify(e72.fileAtEnd) + ")");

    const lab72d = accepted();
    fs.writeFileSync(path.join(lab72d, "catalogs", "lamp-v2.ec"), JSON.stringify(withRev(wanted, 2)), "utf8");
    later(lab72d, "lamp-v2.ec", -7200);
    const f72 = run(lab72d, ["boot", "listing", "offer"], true);
    const o72 = f72.offers[0] || {};
    check(o72.shown === true && o72.files.includes("lamp-v2.ec") && f72.fileAtEnd === "lamp.ec",
      "72e a higher edition of the catalog in use under another name and an older date is offered (" + JSON.stringify(o72.files || null) + ")");
    const lab72e = accepted();
    const reworded = JSON.parse(JSON.stringify(wanted)); reworded.cards[0].title.en = "Warm opening, reworded";
    fs.writeFileSync(path.join(lab72e, "catalogs", "lamp-same.ec"), JSON.stringify(reworded), "utf8");
    later(lab72e, "lamp-same.ec", -7200);
    const g72 = run(lab72e, ["boot", "listing", "offer"], true);
    check(!(g72.offers[0] || {}).shown,
      "72f THE CONTROL: the same edition number under another name, its words different, is no higher edition, so nothing is offered");

    const lab72f = accepted();
    deskFile(lab72f, withRev(wanted, 5), "Ala", true);
    const h72 = run(lab72f, ["boot", "listing", "offer"], true);
    const lib72f = run(lab72f, ["library"], true);
    check(!(h72.offers[0] || {}).shown && h72.fileAtEnd === "lamp.ec" && !((lib72f.library[0] || []).some(r => r.name === "colleague.ec")),
      "72g a colleague's file, genuine, claiming the id in use and of a higher edition, is never offered nor followed, and has no row in the Library (" + ((lib72f.library[0] || []).map(r => r.name).join(",")) + ")");

    /* A successor: grown from the catalog in use, valid under the ring. */
    const successor = id => { const d = JSON.parse(JSON.stringify(payload("2026-09-20"))); d.id = id; d.rev = 1;
      d.grew = { id: ID, rev: 1, sha: "sha256:" + "cd".repeat(32) }; return sign(d); };
    const ringWith = ids => JSON.stringify({ format: V2.V2_RING_FORMAT, kind: V2.V2_RING_KIND,
      keys: [ID].concat(ids).map(c => ({ catalog: c, keyId: KEY_ID, alg: V2.V2_SIG_ALG, public: pubHex(pair.publicKey) })) });
    const lab72g = accepted();
    fs.writeFileSync(path.join(lab72g, "catalogs", "lamp-next.ec"), JSON.stringify(successor("lamp-next")), "utf8");
    later(lab72g, "lamp-next.ec", -7200);
    fs.writeFileSync(path.join(lab72g, "catalogs", "etiuda-ring.json"), ringWith(["lamp-next"]), "utf8");
    const i72 = run(lab72g, ["boot", "listing", "settle", "offer"], true);
    check(((i72.offers[0] || {}).files || []).includes("lamp-next.ec"),
      "72h a file valid under the ring whose grown-from id names the catalog in use is offered (" + JSON.stringify((i72.offers[0] || {}).files || null) + ")");
    fs.writeFileSync(path.join(lab72g, "catalogs", "etiuda-ring.json"), ring, "utf8");
    const j72 = run(lab72g, ["boot", "listing", "settle", "offer"], true);
    check(!((j72.offers[0] || {}).files || []).includes("lamp-next.ec"),
      "72i THE CONTROL: the same file with no ring line for it is not offered");

    /* This desk's own file of the catalog in use: its identity is the public half in the envelope. */
    const lab72h = accepted();
    const rawPub = Buffer.alloc(32, 9), own = "k-" + sha(rawPub).slice(0, 16);
    const envFile = path.join(lab72h, "userdata", "desk.json"), env = JSON.parse(fs.readFileSync(envFile, "utf8"));
    env.branch = { sign: { pub: rawPub.toString("hex"), priv: "sealed" }, box: { pub: "ef".repeat(32), priv: "sealed" } };
    fs.writeFileSync(envFile, JSON.stringify(env), "utf8");
    const ownId = own + "-" + sha8(ID), theirs = "k-0123456789abcdef-" + sha8(ID);
    fs.writeFileSync(path.join(lab72h, "catalogs", "from-mine.ec"), JSON.stringify((() => { const d = successor("lamp-from-mine"); return d; })()), "utf8");
    const fromMine = JSON.parse(fs.readFileSync(path.join(lab72h, "catalogs", "from-mine.ec"), "utf8")); delete fromMine.sig; delete fromMine.hash;
    fromMine.grew.id = ownId;
    fs.writeFileSync(path.join(lab72h, "catalogs", "from-mine.ec"), JSON.stringify(sign(fromMine)), "utf8");
    fs.writeFileSync(path.join(lab72h, "catalogs", "etiuda-ring.json"), ringWith(["lamp-from-mine"]), "utf8");
    later(lab72h, "from-mine.ec", -7200);
    const k72 = run(lab72h, ["boot", "listing", "settle", "offer"], true);
    check(((k72.offers[0] || {}).files || []).includes("from-mine.ec"),
      "72j a file valid under the ring that grew from this desk's own file of the catalog in use is offered (" + JSON.stringify((k72.offers[0] || {}).files || null) + ")");
    fromMine.grew.id = theirs; delete fromMine.sig; delete fromMine.hash;
    fs.writeFileSync(path.join(lab72h, "catalogs", "from-mine.ec"), JSON.stringify(sign(fromMine)), "utf8");
    later(lab72h, "from-mine.ec", -7200);
    const l72 = run(lab72h, ["boot", "listing", "settle", "offer"], true);
    check(!((l72.offers[0] || {}).files || []).includes("from-mine.ec"),
      "72k THE CONTROL: one that grew from another desk's file of it is not");
    /* A file taken away and a higher edition under another name is no rename: the bytes are not the pin. */
    const lab72n = accepted();
    const reworded2 = JSON.parse(JSON.stringify(wanted)); reworded2.cards[0].title.en = "Warm opening, edited in place";
    fs.copyFileSync(path.join(lab72n, "catalogs", "lamp.ec"), path.join(lab72n, "catalogs", "lamp-kept.ec"));
    later(lab72n, "lamp-kept.ec", -7200);
    fs.writeFileSync(path.join(lab72n, "catalogs", "lamp.ec"), JSON.stringify(reworded2), "utf8");
    const n72 = run(lab72n, ["boot", "listing", "fsop:rename,lamp-kept.ec,lamp-kept2.ec", "listing"], true);
    check(n72.fileAtEnd === "lamp.ec",
      "72n THE CONTROL: the old file still there, edited in place, and a copy of its earlier bytes under another name is not followed (remembered " + JSON.stringify(n72.fileAtEnd) + ")");
    const lab72i = accepted();
    fs.unlinkSync(path.join(lab72i, "catalogs", "lamp.ec"));
    fs.writeFileSync(path.join(lab72i, "catalogs", "lamp-v2.ec"), JSON.stringify(withRev(wanted, 2)), "utf8");
    const m72 = run(lab72i, ["boot", "listing", "offer"], true);
    check(m72.fileAtEnd === "lamp.ec" && ((m72.offers[0] || {}).files || []).includes("lamp-v2.ec"),
      "72m THE CONTROL: the file in use gone and another edition of it under a new name is offered and not followed as a rename (remembered " + JSON.stringify(m72.fileAtEnd) + ")");
    /* A colleague's genuine file of this catalog, named by its stem as the design names it, beside the rename of the file in use. */
    const labP1 = accepted();
    deskFile(labP1, Object.assign({}, wanted, { id: ID + "-x" }), "Ola");
    const dd = path.join(labP1, "catalogs", "desks"), did = fs.readdirSync(dd)[0];
    fs.renameSync(path.join(dd, did, "colleague.ec"), path.join(dd, did, "lamp.ec"));
    const p1 = run(labP1, ["boot", "listing", "fsop:rename,lamp.ec,lamp-renamed.ec", "listing", "bar", "offer"], true);
    check(p1.fileAtEnd === "lamp-renamed.ec" && !(p1.offers[0] || {}).shown && !(p1.errors || []).length,
      "72o a rename of the file in use is followed while a colleague's genuine file of it, named by the same stem (desks/<id>/lamp.ec), sits in the folder: only the filter keeps its row from hiding the rename (remembered "
      + JSON.stringify(p1.fileAtEnd) + ")");
    const errs72 = [a72, c72, d72, e72, f72, g72, h72, lib72f, i72, j72, k72, l72, m72, n72, p1].flatMap(o => o.errors || []);
    check(!errs72.length, "72l those launches ran their acts without an error" + (errs72.length ? ": " + errs72.length + ", first " + errs72[0] : ""));
    /* 73: AN EMPTY DESK THAT MADE A CATALOG FROM NOTHING, and the lead's import of that file published beside a newer
       catalog, so the boot's newest-file offer is not the lineage's: the boot's offer is escaped, and then the listing. */
    const looseId = "c-made0here0on0it", rawLoose = Buffer.alloc(32, 5), ownLoose = "k-" + sha(rawLoose).slice(0, 16);
    const fromLoose = (from) => { const d = JSON.parse(JSON.stringify(payload("2026-09-21"))); d.id = "lamp-from-loose"; d.rev = 1;
      d.grew = { id: (from || ownLoose) + "-" + sha8(looseId), rev: 2, sha: "sha256:" + "ab".repeat(32) }; return sign(d); };
    const other = Object.assign(JSON.parse(JSON.stringify(payload("2026-09-22"))), { id: "lamp-other" });
    const emptyMaker = (withId, ringIds, from) => {
      const lab = scenario([["catalogs/from-loose.ec", fromLoose(from)], ["catalogs/other.ec", other], ["catalogs/etiuda-ring.json", ringWith(ringIds)]]);
      const envAt = path.join(lab, "userdata", "desk.json"), envD = JSON.parse(fs.readFileSync(envAt, "utf8"));
      envD.branch = { sign: { pub: rawLoose.toString("hex"), priv: "sealed" }, box: { pub: "ef".repeat(32), priv: "sealed" } };
      if (withId) envD.keys.eLooseId = looseId;
      fs.writeFileSync(envAt, JSON.stringify(envD), "utf8");
      return run(lab, ["boot", "settle", "offer", "escape", "settle", "listing", "settle", "offer"]);
    };
    const filesOf = (o, i) => (o.offers[i] || {}).files || [];
    const a73 = emptyMaker(true, ["lamp-from-loose"]);
    check(filesOf(a73, 0).includes("other.ec") && filesOf(a73, 1).includes("from-loose.ec"),
      "73a on an empty desk holding the id of the catalog it made, a file valid under the ring that grew from this desk's own file of it is offered from the listing (boot "
      + JSON.stringify(filesOf(a73, 0)) + ", listing " + JSON.stringify(filesOf(a73, 1)) + ")");
    const b73 = emptyMaker(true, []);
    check(filesOf(b73, 0).includes("other.ec") && !(b73.offers[1] || {}).shown,
      "73b THE CONTROL: the same file with no ring line for it is not offered (listing " + JSON.stringify(filesOf(b73, 1)) + ")");
    const c73 = emptyMaker(false, ["lamp-from-loose"]);
    check(filesOf(c73, 0).includes("other.ec") && !(c73.offers[1] || {}).shown,
      "73c THE CONTROL: an empty desk holding no such id offers its newest file at boot as before and nothing from the listing (listing "
      + JSON.stringify(filesOf(c73, 1)) + ")");
    const e73 = emptyMaker(true, ["lamp-from-loose"], "k-" + sha(Buffer.alloc(32, 6)).slice(0, 16));
    check(filesOf(e73, 0).includes("other.ec") && !(e73.offers[1] || {}).shown,
      "73e THE CONTROL: the same file, valid under the ring, grown from another desk's own file of the same made-from-nothing id is not offered (listing "
      + JSON.stringify(filesOf(e73, 1)) + ")");
    const errs73 = [a73, b73, c73, e73].flatMap(o => o.errors || []);
    check(!errs73.length, "73d those launches ran their acts without an error" + (errs73.length ? ": " + errs73.length + ", first " + errs73[0] : ""));
    const errs71 = [a71, b71, c71, d71].flatMap(o => o.errors || []);
    check(!errs71.length, "71d those launches ran their acts without an error" + (errs71.length ? ": " + errs71.length + ", first " + errs71[0] : ""));

    /* 74: THE OFFER OF A NEW EDITION, THE PANEL BEHIND IT AND THE LOAD THAT FOLLOWS, from the bubble to the next launch's
       desk file. Each leg of the chain is read from what the page showed or what the next launch read from desk.json, never
       from a variable: a Take keyed to a copy of the catalog, or a Load handed a re-parsed one, shows nowhere before the
       desk starts again, and then the lead's text is gone from the agent's desk or the agent's own words are. The desk
       holds edition 1 with an edit of this agent's on one card, two text fields of it (title and text). The folder holds
       edition 2, signed under the same key as edition 1: the lead changed that card's text, added one card, retired one, and left a note. */
    const BODY1 = "Good day, how can I help?", BODY2 = "Good day, how may I help you today?";
    const ed1 = () => { const d = payload("2026-09-01");
      d.cards = [{ id: "c-a", shelf: "t-op", bodyShape: "plain", title: { en: "Opening" }, body: { en: "Hello." } },
        { id: "c-b", shelf: "t-op", bodyShape: "plain", title: { en: "Greeting" }, body: { en: BODY1 } },
        { id: "c-r", shelf: "t-rt", bodyShape: "plain", title: { en: "Old offer" }, body: { en: "Ask about the old offer." } }];
      return d; };
    const ed2 = () => { const d = ed1(); d.rev = 2; d.date = "2026-09-20"; d.notes = { en: "A note from the lead." };
      d.cards[1].body.en = BODY2; d.cards[2].retired = true;
      d.cards.push({ id: "c-n", shelf: "t-op", bodyShape: "plain", title: { en: "Late opening" }, body: { en: "Thank you for waiting." } });
      return d; };
    const AGENT = { t: "My greeting", en: "Good day, how can I be of use?" };
    /* A desk that holds edition 1 and carries the agent's edit, the edit made by the page's own save, and edition 2 in the folder. */
    const editionDesk = (next, first) => {
      const lab = scenario([["catalogs/lamp.ec", sign((first || ed1)())], ["catalogs/etiuda-ring.json", ring]]);
      run(lab, ["boot", "settle", "offer", "yes", "settle"]);
      const s74 = run(lab, ["desk", "override", "settle"], false, { override: AGENT });
      fs.writeFileSync(path.join(lab, "catalogs", "lamp.ec"), JSON.stringify(sign((next || ed2)())), "utf8");
      return { lab: lab, setup: s74 };
    };
    const rd = (o, k) => (o && o.read && o.read[k]) || {};
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const ASK = ["desk", "boot", "settle"];
    const d74 = editionDesk();
    const A74 = run(d74.lab, ASK.concat(["readchange", "panel", "take:1", "edload", "settle"]));
    const B74 = run(d74.lab, ["desk", "readdesk"]);
    const bub = rd(A74, "bubble"), pan = rd(A74, "panel"), tk = rd(A74, "take1"), ld = rd(A74, "afterLoad"), dk = rd(B74, "desk");
    check(bub.change === 1 && !(bub.counts || []).some(c => c.n === 0 && /\d+ cards?\b/.test(c.text)),
      "74a the offer of a new edition carries the change block where the counts line stood, and the old counts line is gone: " + JSON.stringify(bub.counts || null));
    check(same(bub.n, ["1 changed", "1 new", "1 retired"]) && same(bub.ids, ["c-b", "c-n", "c-r"]) && bub.diff === 1,
      "74b the block counts 1 changed, 1 new and 1 retired, lists the cards in that order, and offers the differences: " + JSON.stringify(bub.n || null) + " " + JSON.stringify(bub.ids || null) + ", button " + bub.diff);
    check(pan.bubbleHidden === true && pan.modal === true && /\bed-modal\b/.test(pan.cls || "") && pan.rows === 3
      && (pan.current || []).length === 1 && /Greeting/.test(pan.current[0]) && /\bed-c3\b/.test(pan.grid || "") && same(pan.take, ["false", "true"]),
      "74c the differences button hides the bubble and stands the panel: three rows, the changed card's the current one, its pane in three columns, Keep mine the choice made: "
      + JSON.stringify(pan));
    check(same(tk.take, ["true", "false"]) && /your own version/.test(bub.own || "") && /team's new text/.test(tk.own || "") && /team's new text/.test((tk.row || [""])[0]),
      "74d Take presses, and the bubble's row for that card goes from your own version to the team's new text: " + JSON.stringify(bub.own || null) + " then " + JSON.stringify(tk.own || null));
    check(ld.modal === false && A74.reloaded === true && A74.askedAtRestart === 0,
      "74e the panel's Load closes the panel and the load runs, the desk starting again with the question already down: " + JSON.stringify({ panelUp: ld.modal, started: A74.reloaded, asked: A74.askedAtRestart }));
    check(same(dk.over, { t: AGENT.t }) && dk.base === BODY2,
      "74f THE POINT: the next launch's desk file holds edition 2 and the agent's title alone, the text they took from the team no longer an edit of theirs: " + JSON.stringify(dk.over) + ", text " + JSON.stringify(dk.base));
    const dKeep = editionDesk();
    const AK = run(dKeep.lab, ASK.concat(["panel", "take:1", "take:0", "edload", "settle"]));
    const BK = run(dKeep.lab, ["desk", "readdesk"]);
    check(AK.reloaded === true && same(rd(BK, "desk").over, AGENT) && rd(BK, "desk").base === BODY2,
      "74g THE CONTROL: the same offer with Keep mine chosen loads edition 2 and the next launch holds both of the agent's fields: " + JSON.stringify(rd(BK, "desk").over) + ", text " + JSON.stringify(rd(BK, "desk").base));
    const dNo = editionDesk();
    const AN = run(dNo.lab, ASK.concat(["panel", "edkeep", "settle", "readdesk"]));
    const CN = run(dNo.lab, ASK.concat(["readchange", "readdesk"]));
    check(rd(AN, "afterKeep").modal === false && !AN.reloaded && rd(AN, "desk").standing === 0 && rd(AN, "desk").refused !== "" && rd(AN, "desk").held === BODY1
      && CN.read && CN.read.bubble === null && rd(CN, "desk").held === BODY1,
      "74h THE CONTROL: Keep current in the panel loads nothing and records the refusal, which the next launch's boot honours, edition 1 still held: "
      + JSON.stringify({ closed: rd(AN, "afterKeep").modal === false, started: AN.reloaded, refused: rd(AN, "desk").refused !== "", held: rd(AN, "desk").held }));
    const dBack = editionDesk();
    const AB = run(dBack.lab, ASK.concat(["panel", "edback", "readdesk"]));
    const ab = rd(AB, "afterBack");
    check(ab.modal === false && ab.bubble === true && ab.hidden === false && ab.focus === "ecDiff" && !AB.reloaded && rd(AB, "desk").held === BODY1,
      "74i THE CONTROL: the panel's way back closes the panel, brings the bubble back with the differences button focused, and loads nothing: " + JSON.stringify(ab));
    const errs74 = [d74.setup, A74, B74, dKeep.setup, AK, BK, dNo.setup, AN, CN, dBack.setup, AB].flatMap(o => o.errors || []);
    check(!errs74.length, "74j those launches ran their acts without an error" + (errs74.length ? ": " + errs74.length + ", first " + errs74[0] : ""));
    /* A NEW EDITION'S MARKS, by the route it came: Import accepts after a promise (the watch's handle cleared or put first),
       the boot's offer at once. Read from the desk file the next launch reads: the edition held and the marks beside it. */
    const marksAfter = (route) => {
      const lab = scenario([["catalogs/lamp.ec", sign(ed1())], ["catalogs/etiuda-ring.json", ring]]);
      const first = run(lab, ["boot", "settle", "offer", "yes", "settle"]);
      let second;
      if (route === "import") {
        fs.mkdirSync(path.join(lab, "elsewhere"));
        fs.writeFileSync(path.join(lab, "elsewhere", "lamp-v2.ec"), JSON.stringify(sign(ed2())), "utf8");
        second = run(lab, ["desk", "import:elsewhere/lamp-v2.ec", "settle", "yes", "settle"]);
      } else {
        fs.writeFileSync(path.join(lab, "catalogs", "lamp.ec"), JSON.stringify(sign(ed2())), "utf8");
        second = run(lab, ASK.concat(["yes", "settle"]));
      }
      const keys = JSON.parse(fs.readFileSync(path.join(lab, "userdata", "desk.json"), "utf8")).keys || {};
      const mk = Object.keys(keys).filter(k => /~EditionMarks$/.test(k)), m = mk.length === 1 ? JSON.parse(keys[mk[0]]) : null;
      return { rev: (() => { try { return JSON.parse(keys.eCatalog || "{}").rev; } catch { return null; } })(), started: second.reloaded,
        marks: m && m.cards ? Object.keys(m.cards).sort().map(id => id + ":" + m.cards[id].k).join(" ") : null,
        errors: [first, second].flatMap(o => o.errors || []) };
    };
    const viaImport = marksAfter("import"), viaBoot = marksAfter("boot");
    check(viaImport.rev === 2 && viaImport.started === true && viaImport.marks === "c-b:changed c-n:new" && !viaImport.errors.length,
      "74k a new edition loaded by Import keeps its marks: the next launch's desk file holds edition 2 with the changed and the new card marked: " + JSON.stringify(viaImport));
    check(viaBoot.rev === 2 && viaBoot.started === true && viaBoot.marks === "c-b:changed c-n:new" && !viaBoot.errors.length,
      "74K THE CONTROL: the same edition through the boot's offer holds the same marks, so 74k reads a desk file that can hold them: " + JSON.stringify(viaBoot));
    /* THE OFFER OF A NEW EDITION NOBODY ASKED FOR takes no focus and waits at the name: up, after Escape, after Not now,
       and at the next launch with that refusal remembered. The control is the same desk with nothing newer in the folder. */
    const BAND = { band: true }, WAIT = /^Show rev 2 \(2026-09-20\), waiting to be loaded$/;
    const wr = (o, i) => ((o.read && o.read.wait) || [])[i] || {};
    const dW = editionDesk();
    const AW = run(dW.lab, ASK.concat(["readwait", "escape", "settle", "readwait"]), false, BAND);
    const dD = editionDesk();
    const BW = run(dD.lab, ASK.concat(["no", "settle", "readwait"]), false, BAND);
    const CW = run(dD.lab, ASK.concat(["readwait"]), false, BAND);
    const labL = scenario([["catalogs/lamp.ec", sign(ed1())], ["catalogs/etiuda-ring.json", ring]]);
    const LW0 = run(labL, ["boot", "settle", "offer", "yes", "settle"]);
    const LW = run(labL, ASK.concat(["readwait"]), false, BAND);
    const errsW = [dW.setup, AW, dD.setup, BW, CW, LW0, LW].flatMap(o => o.errors || []);
    const a0 = wr(AW, 0), a1 = wr(AW, 1), b0 = wr(BW, 0), c0 = wr(CW, 0), l0 = wr(LW, 0);
    check(a0.offer === 1 && a0.focus !== "ecYes" && a0.waiting && a0.dot && WAIT.test(a0.label || "") && a0.no === "Not now",
      "74l a new edition found at boot is offered without taking the keyboard, its decline reads Not now, and the name wears its dot and says it waits: " + JSON.stringify(a0));
    check(a1.offer === 0 && a1.waiting && a1.dot && WAIT.test(a1.label || ""),
      "74m after Escape the offer is down and the edition still waits at the name: " + JSON.stringify(a1));
    check(b0.offer === 0 && b0.waiting && b0.dot && c0.offer === 0 && c0.waiting && c0.dot && WAIT.test(c0.label || "") && !errsW.length,
      "74n after Not now it waits at the name, and at the next launch, the refusal remembered and nothing offered, it still does: "
      + JSON.stringify({ declined: b0, next: c0, errors: errsW.slice(0, 2) }));
    /* THE SAME EDITION WITH NO DATED EDITION OF ITS OWN: the name, the panel, the load's toast and the marks call it by its
       rev, where the dated one above reads its date. */
    const dR = editionDesk(() => { const d = ed2(); delete d.date; return d; });
    const RV = run(dR.lab, ASK.concat(["readwait", "panel", "edload", "settle"]), false, BAND), r0 = wr(RV, 0);
    check(r0.label === "Show rev 2, waiting to be loaded" && a0.label === "Show rev 2 (2026-09-20), waiting to be loaded"
      && rd(RV, "panel").title === "What is new in rev 2" && /^Rev 2 loaded: /.test(RV.toast || "")
      && JSON.stringify(RV.editionName) === '{"e":"","r":2}' && RV.reloaded === true && ![dR.setup, RV].flatMap(o => o.errors || []).length,
      "74r a new edition with no date is named by its rev at the name, on the panel, in the load's toast and in its marks, and the dated one by its date: "
      + JSON.stringify({ rev: r0.label, dated: a0.label, panel: rd(RV, "panel").title, toast: RV.toast, marks: RV.editionName,
        errors: [dR.setup, RV].flatMap(o => o.errors || []).slice(0, 2) }));
    /* AN EDITION WITH A REV AND A DATE, 74's own: the rev first and the date after it, in the bubble's dim smaller type beside
       the name, in parentheses where the words are plain: the held one's You have, the panel's title and the load's toast. */
    const bubA = rd(A74, "bubble"), haveA = ((bubA.counts || []).find(c => /^You have /.test(c.text)) || {}).text || "";
    check(/ · rev 2 2026-09-20/.test(bubA.what || "") && JSON.stringify(bubA.ed) === '["2026-09-20"]' && haveA === "You have rev 1 (2026-09-01)."
      && pan.title === "What is new in rev 2 (2026-09-20)" && /^Rev 2 \(2026-09-20\) loaded: /.test(A74.toast || ""),
      "74t an edition with a rev and a date is named by both, the rev first: beside the name the date in the dim smaller type, elsewhere in parentheses: "
      + JSON.stringify({ what: bubA.what, ed: bubA.ed, have: haveA, panel: pan.title, toast: A74.toast }));
    /* THE SAME TWO WITH A BARE NUMBER WHERE THE DATE GOES: the offer's name line, its "You have" and the Library's rows,
       the one in use and another catalog's file in the folder, name each by its rev. */
    const dB = editionDesk(() => Object.assign(ed2(), { date: "2" }), () => Object.assign(ed1(), { date: "1" }));
    const BN = run(dB.lab, ASK.concat(["readchange"]), false, BAND);
    // The other catalog lands after the offer was read, so the boot offers lamp's update and not a replacement.
    fs.writeFileSync(path.join(dB.lab, "catalogs", "pine.ec"), JSON.stringify(sign(Object.assign(ed1(), { id: "pine-shop", rev: 7, date: "7" }))), "utf8");
    const BL = run(dB.lab, ["desk", "rows"], true);
    BN.rows = BL.rows; BN.errors = (BN.errors || []).concat(BL.errors || []);
    const bnRows = (BN.rows[0] || []).map(r => (r.loaded ? "in use: " : "file: ") + r.meta);
    const bnHave = ((rd(BN, "bubble").counts || []).find(c => /^You have /.test(c.text)) || {}).text || "";
    check(/ · rev 2(?!\d)/.test(rd(BN, "bubble").what || "") && bnHave === "You have rev 1." && bnRows.some(r => /^in use: (.* · )?rev 1( · |$)/.test(r))
      && bnRows.some(r => /^file: (.* · )?rev 7( · |$)/.test(r)) && !/\bv[127]\b/.test(JSON.stringify([rd(BN, "bubble"), BN.rows])) && ![dB.setup, BN].flatMap(o => o.errors || []).length,
      "74s a catalog whose edition is a bare number is named by its rev on the offer's name line, in its You have and on the Library's rows, never v1, v2 or v7: "
      + JSON.stringify({ what: rd(BN, "bubble").what, have: bnHave, rows: bnRows, errors: [dB.setup, BN].flatMap(o => o.errors || []).slice(0, 2) }));
    check(l0.offer === 0 && l0.waiting === false && l0.dot === false && l0.label === null,
      "74L THE CONTROL: the same desk with no newer edition in the folder has no dot and no words at the name: " + JSON.stringify(l0));
    /* 75: A COLLEAGUE'S FILE IN THE LIBRARY, LOOK, AND WORK FROM IT. The folder holds the catalog in use (lamp.ec); two
       desks both called Ola, each with a file grown from that edition, the first rewording one card and adding one; Piotr's
       catalog made from nothing; Ala's file claiming the id in use; and this desk's own file, its key the one the desk
       envelope names. Each reading is of the markup the list drew or of desk.json at the next launch. */
    const lab75 = accepted();
    const envAt75 = path.join(lab75, "userdata", "desk.json");
    const pin75 = JSON.parse(JSON.parse(fs.readFileSync(envAt75, "utf8")).keys.eCatalog).pin;
    const deskOf = (doc, who, pr, inLab) => {
      const pair = pr || crypto.generateKeyPairSync("ed25519"), lab = inLab || lab75;
      const raw = pair.publicKey.export({ type: "spki", format: "der" }).subarray(-32), id = "k-" + sha(raw).slice(0, 16);
      const d = Object.assign({}, JSON.parse(JSON.stringify(doc)), { id: id + "-" + sha8(doc.id), modified: true, desk: { id: id, name: who, key: raw.toString("hex"), box: "ef".repeat(32) } });
      d.sig = { alg: "Ed25519", keyId: id };
      d.sig.value = crypto.sign(null, Buffer.concat([Buffer.from("etiuda-desk-branch" + NL), Buffer.from(V2.v2SignedBytes(d))]), pair.privateKey).toString("hex");
      fs.mkdirSync(path.join(lab, "catalogs", "desks", id), { recursive: true });
      fs.writeFileSync(path.join(lab, "catalogs", "desks", id, "lamp-" + sha8(doc.id) + ".ec"), JSON.stringify(d), "utf8");
      return { id: id, raw: raw, doc: d, four: id.slice(2, 6) };
    };
    const HERS = "Good day, and welcome.";
    const grown = (body, extra) => { const d = JSON.parse(JSON.stringify(wanted)); d.grew = { id: ID, rev: 1, sha: pin75 };
      d.cards[0].body.en = body; d.cards[0].firstOnly = true; if (extra) d.cards.push({ id: "c-hers", shelf: "t-op", bodyShape: "plain", title: { en: "Her own" }, body: { en: "Thank you." } }); return d; };
    const ola1 = deskOf(grown(HERS, true), "Ola"), ola2 = deskOf(grown("Good day to you."), "Ola");
    const piotr = deskOf(Object.assign(JSON.parse(JSON.stringify(wanted)), { id: "made-here" }), "Piotr");
    deskFile(lab75, withRev(wanted, 5), "Ala", true);
    const ownPair = crypto.generateKeyPairSync("ed25519"), ownDesk = deskOf(grown("Hello there."), "Max", ownPair);
    const sealPriv = k => safeStorage.encryptString(k.export({ type: "pkcs8", format: "der" }).toString("base64")).toString("base64");
    const env75 = JSON.parse(fs.readFileSync(envAt75, "utf8"));
    env75.branch = { sign: { pub: ownDesk.raw.toString("hex"), priv: sealPriv(ownPair.privateKey) }, box: { pub: "ef".repeat(32), priv: "sealed" } };
    fs.writeFileSync(envAt75, JSON.stringify(env75), "utf8");
    const grouped = id => id.slice(2).replace(/(.{4})(?=.)/g, "$1 ");
    const r75 = run(lab75, ["desk", "rows"], true);
    const rows75 = r75.rows[0] || [], deskRows = rows75.filter(r => r.desk);
    const rowOf = (rows, four) => rows.find(r => r.desk && r.fp === four) || {};
    const olaRow = rowOf(rows75, ola1.four), ola2Row = rowOf(rows75, ola2.four), p75 = rows75.find(r => r.name === "Piotr's desk") || {};
    check(same(rows75.map(r => r.name), ["lamp.ec", "Ola's desk", "Ola's desk", "Piotr's desk"]) && rows75[0].loaded
      && !olaRow.alone && !ola2Row.alone && p75.alone && deskRows.every(r => r.file === null) && same(olaRow.acts, ["See what changed", "Work from this file"]),
      "75a the colleagues' files hang under the catalog in use, the one grown from nothing stands alone at the foot, each with Look and Work from it; this desk's own file and one claiming the id in use have no row: "
      + JSON.stringify(rows75.map(r => [r.name, r.fp, r.alone, r.acts.join("/")])));
    check(olaRow.fp === ola1.four && ola2Row.fp === ola2.four && p75.fp === "" && olaRow.tip.indexOf(grouped(ola1.id)) > -1 && /^Signed by Ola's desk, key /.test(olaRow.tip),
      "75b two desks of one name each carry the first four of their key, and the desk's glyph names its key in four groups: " + JSON.stringify([olaRow.fp, ola2Row.fp, p75.fp, olaRow.tip]));
    check(same(rows75[0].mine, ["Your edits are with the team"]) && /^1 changed · 1 new · /.test(olaRow.meta) && /^A catalog of its own · /.test(p75.meta),
      "75c the loaded row says this desk's edits are in the folder under its desk's name; a hanging row says what that desk changed, and one grown from nothing says so: "
      + JSON.stringify([rows75[0].mine, olaRow.meta, p75.meta]));

    /* 75w1: folder write refused for access/held leaves edits kept on computer */
    const FOLDER_KEPT_LINE = "Your edits are kept on this computer and go to the team's folder the next time something in it changes or Etiuda starts. To hand them over now, Export saves them in a catalog file for the team's lead.";
    const RELAY_KEPT_LINE = "Your edits are kept on this computer and go to the team as soon as it can take them. To hand them over now, Export saves them in a catalog file for the team's lead.";
    const stem75 = "lamp-" + sha8(wanted.id);
    const L_w1 = run(lab75, ["holdbranch:" + stem75, "rows"], true, { ownDeskId: ownDesk.id });
    const rows_w1 = L_w1.rows[0] || [];
    check(same((rows_w1[0] || {}).mine, [FOLDER_KEPT_LINE]),
      "75w1 folder write refused for access/held: loaded row says edits are kept on this computer and go to the team's folder the next time something in it changes or Etiuda starts: "
      + JSON.stringify((rows_w1[0] || {}).mine));

    /* 75w2: relay upload refusal/owed leaves edits kept on computer */
    const lab75w2 = accepted();
    const envAt75w2 = path.join(lab75w2, "userdata", "desk.json");
    const relayLead = crypto.generateKeyPairSync("ed25519");
    const RELAY_LEAD = { keyId: "relay-lead", public: pubHex(relayLead.publicKey) };
    const RELAY_TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const RELAY_RT = "1".repeat(32);
    const ownDeskRelay = deskOf(grown("Hello there."), "Max", ownPair, lab75w2);
    const env75w2 = JSON.parse(fs.readFileSync(envAt75w2, "utf8"));
    env75w2.branch = { sign: { pub: ownDeskRelay.raw.toString("hex"), priv: sealPriv(ownPair.privateKey) }, box: { pub: "ef".repeat(32), priv: "sealed" } };
    env75w2.teamPins = { [RELAY_TEAM]: RELAY_LEAD };
    env75w2.teamPinFrom = { [RELAY_TEAM]: "invite" };
    env75w2.teamChannel = { [RELAY_TEAM]: { kind: "relay", rt: RELAY_RT, url: "https://relay.test/relay/v1" } };
    fs.writeFileSync(envAt75w2, JSON.stringify(env75w2), "utf8");
    // Place team mirror and desk branch file in userData/relay/<RELAY_RT>/desks/...
    const mirrorRt = path.join(lab75w2, "userdata", "relay", RELAY_RT);
    const mirrorDesk = path.join(mirrorRt, "desks", ownDeskRelay.id);
    fs.mkdirSync(mirrorDesk, { recursive: true });
    const deskBranchText = fs.readFileSync(path.join(lab75w2, "catalogs", "desks", ownDeskRelay.id, stem75 + ".ec"), "utf8");
    fs.writeFileSync(path.join(mirrorDesk, stem75 + ".ec"), deskBranchText, "utf8");
    fs.copyFileSync(path.join(lab75w2, "catalogs", "lamp.ec"), path.join(mirrorRt, "lamp.ec"));
    const relKey = ("desks/" + ownDeskRelay.id + "/" + stem75 + ".ec").toLowerCase();
    const L_w2 = run(lab75w2, ["rows"], true, { mockRelay: { sent: { [relKey]: { sha: "wrong-sha", owe: true } } } });
    const rows_w2 = L_w2.rows[0] || [];
    check(same((rows_w2[0] || {}).mine, [RELAY_KEPT_LINE]),
      "75w2 relay upload refused/owed: loaded row says edits are kept on this computer and go to the team as soon as it can take them: "
      + JSON.stringify((rows_w2[0] || {}).mine));

    /* 75w3: lifting plant:w1-folder-reached turns 75w1 red */
    {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:w1-folder-reached") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines[at] = "    reached = true; /* plant:w1-folder-reached */";
        const labScratch = fs.mkdtempSync(path.join(os.tmpdir(), "plant-w1-"));
        try {
          fs.cpSync(lab75, labScratch, { recursive: true });
          const tmpMain = path.join(labScratch, "shell", "main.js");
          fs.writeFileSync(tmpMain, lines.join("\n"), "utf8");
          const L_p = run(labScratch, ["holdbranch:" + stem75, "rows"], true, { ownDeskId: ownDesk.id });
          const rows_p = L_p.rows[0] || [];
          turned = same((rows_p[0] || {}).mine, ["Your edits are with the team"]);
          detail = turned ? "turned red: kept line replaced by reached" : "did not turn red";
        } finally {
          try { fs.rmSync(labScratch, { recursive: true, force: true }); } catch {}
        }
      }
      const sameFile = fs.readFileSync(mainPath).equals(before);
      check(turned && sameFile, "75w3 lifting plant:w1-folder-reached turns 75w1 red (FAIL 75w1: folder held not recognized): "
        + detail + ", sha " + (sameFile ? "restored" : "differs"));
    }

    /* 75w4: lifting plant:w1-relay-reached turns 75w2 red */
    {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:w1-relay-reached") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines[at] = "      reached = true; /* plant:w1-relay-reached */";
        const labScratch = fs.mkdtempSync(path.join(os.tmpdir(), "plant-w2-"));
        try {
          fs.cpSync(lab75w2, labScratch, { recursive: true });
          const tmpMain = path.join(labScratch, "shell", "main.js");
          fs.writeFileSync(tmpMain, lines.join("\n"), "utf8");
          const L_p = run(labScratch, ["rows"], true, { mockRelay: { sent: { [relKey]: { sha: "wrong-sha", owe: true } } } });
          const rows_p = L_p.rows[0] || [];
          turned = same((rows_p[0] || {}).mine, ["Your edits are with the team"]);
          detail = turned ? "turned red: kept line replaced by reached" : "did not turn red";
        } finally {
          try { fs.rmSync(labScratch, { recursive: true, force: true }); } catch {}
        }
      }
      const sameFile = fs.readFileSync(mainPath).equals(before);
      check(turned && sameFile, "75w4 lifting plant:w1-relay-reached turns 75w2 red (FAIL 75w2: relay owe/refusal not recognized): "
        + detail + ", sha " + (sameFile ? "restored" : "differs"));
    }

    const L2 = run(lab75, ["desk", "rows", "look:" + olaRow.at, "mine", "mine", "edback2"], true, { card: "c-warm" });
    const lk = rd(L2, "look"), m1 = ((L2.read || {}).mine || [])[0] || {}, m2 = ((L2.read || {}).mine || [])[1] || {};
    check(!!lk.title && lk.title === "Ola's desk" && lk.name === "lamp" && same(lk.heads, ["In the team's edition", "At Ola's desk"]) && lk.rows === 2
      && same(lk.mine, ["false"]) && same(lk.take, []) && lk.keep === "Back to the Library" && lk.load === "Work from this file",
      "75d Look stands the edition panel told it is a desk: its name, the catalog compared with, the two heads, the card changed and the one added, one take and no offer's pair: " + JSON.stringify(lk));
    check(same(m1.pressed, ["true"]) && same(m1.over, { en: HERS }) && m1.rebuilt === 1 && /Now in your edits/.test((m1.row || [""])[0]),
      "75e the take makes that desk's text of the changed field this desk's own edit at once, that field alone, and the cards are drawn again: " + JSON.stringify(m1));
    check(same(m2.pressed, ["false"]) && m2.over === null && rd(L2, "back").modal === false && rd(L2, "back").backs === 1,
      "75E THE CONTROL: pressed again, the edit is what it was before the take (none), and Back to the Library closes the panel and opens the Library: " + JSON.stringify([m2, rd(L2, "back")]));
    /* The earlier edit outlasts the panel (ruling 26b-B): taken, the panel shut and Look opened again, giving the take back
       returns the agent's own wording, where it used to return the team's text. With no edit before the take, it returns none. */
    const OWN = "My own wording.";
    const L2o = run(lab75, ["desk", "ownedit", "rows", "look:" + olaRow.at, "mine", "edback2", "look:" + olaRow.at, "mine", "mine", "ownclear", "settle"], true, { card: "c-warm", own: { en: OWN } });
    const w1 = ((L2o.read || {}).mine || [])[0] || {}, w2 = ((L2o.read || {}).mine || [])[1] || {}, w3 = ((L2o.read || {}).mine || [])[2] || {};
    check(same(w1.over, { en: HERS }) && same(w2.pressed, ["false"]) && same(w2.over, { en: OWN }) && same(w3.pressed, ["true"]) && same(w3.over, { en: HERS }),
      "75l an earlier edit of the agent's is given back by a take given back after the panel was shut and Look opened again, and the take can be made again: "
      + JSON.stringify([w1.over, w2.over, w3.over]));
    const L2p = run(lab75, ["desk", "rows", "look:" + olaRow.at, "mine", "edback2", "look:" + olaRow.at, "mine", "settle"], true, { card: "c-warm" });
    const w4 = ((L2p.read || {}).mine || [])[1] || {};
    check(same(w4.pressed, ["false"]) && w4.over === null,
      "75m THE CONTROL: with no edit before the take, giving it back after Look opened again leaves none: " + JSON.stringify(w4));
    /* The edit kept is the one before the take that is being given back: an edit made after a take, then Look opened and the
       text taken again, is the one that comes back. And once the desk starts again in place, nothing is kept. */
    const L2q = run(lab75, ["desk", "ownedit", "rows", "look:" + olaRow.at, "mine", "edback2", "ownedit:own2", "look:" + olaRow.at, "mine", "mine", "ownclear", "settle"], true, { card: "c-warm", own: { en: OWN }, own2: { en: "Another wording." } });
    const w5 = ((L2q.read || {}).mine || [])[2] || {};
    check(same(w5.pressed, ["false"]) && same(w5.over, { en: "Another wording." }),
      "75o an edit the agent made after a take is what a take made over it gives back, not the one before: " + JSON.stringify(w5));
    const L2r = run(lab75, ["desk", "ownedit", "rows", "look:" + olaRow.at, "mine", "edback2", "forgetlook", "look:" + olaRow.at, "mine", "ownclear", "settle"], true, { card: "c-warm", own: { en: OWN } });
    const w6 = ((L2r.read || {}).mine || [])[1] || {};
    check(same(w6.pressed, ["false"]) && w6.over === null,
      "75p forgetLookEdits, called as restartDesk calls it when the desk starts again in place, leaves nothing of the agent's earlier"
        + " edit for a take to give back; module-calls 26b1 holds the call itself: " + JSON.stringify(w6));
    const errs75o = [L2o, L2p, L2q, L2r].flatMap(o => o.errors || []);
    check(!errs75o.length, "75n those launches ran their acts without an error" + (errs75o.length ? ": " + errs75o.length + ", first " + errs75o[0] : ""));
    const L3 = run(lab75, ["desk", "rows", "look:" + olaRow.at, "mine", "settle"], true, { card: "c-warm" });
    const L4 = run(lab75, ["desk", "over"], true);
    check(same((rd(L4, "over") || {})["c-warm"], { en: HERS }),
      "75f and the take is on disk: the next launch holds it as this desk's own edit (" + JSON.stringify((rd(L4, "over") || {})["c-warm"]) + ")");
    const L5 = run(lab75, ["desk", "rows", "look:" + p75.at], true);
    const lk5 = rd(L5, "look");
    check(!!lk5.title && same(lk5.mine, []) && lk5.heads[0] === "At Piotr's desk" && lk5.rows === 3,
      "75g THE CONTROL: a file compared with no catalog in use is looked at and nothing of it can be taken: " + JSON.stringify(lk5));
    /* A file grown from another catalog in the folder, not the one in use: it hangs under that one, and its changed card cannot be taken. */
    const lab75g = accepted(), otherCat = Object.assign(JSON.parse(JSON.stringify(wanted)), { id: "lamp-other" });
    fs.writeFileSync(path.join(lab75g, "catalogs", "other.ec"), JSON.stringify(otherCat), "utf8");
    const fromOther = JSON.parse(JSON.stringify(otherCat)); fromOther.grew = { id: "lamp-other", rev: 1, sha: "sha256:" + sha(V2.v2SignedBytes(otherCat)) }; fromOther.cards[0].body.en = HERS;
    deskOf(fromOther, "Bo", null, lab75g);
    const G1 = run(lab75g, ["desk", "rows"], true), gRows = G1.rows[0] || [], gBo = gRows.find(r => r.name === "Bo's desk") || {};
    const G2 = run(lab75g, ["desk", "rows", "look:" + gBo.at], true), lkG = rd(G2, "look");
    check(gRows.map(r => r.name).join("|").indexOf("other.ec|Bo's desk") > -1 && !gBo.alone && !!lkG.title && lkG.name === "other"
      && same(lkG.heads, ["In the team's edition", "At Bo's desk"]) && same(lkG.mine, []) && same(lkG.take, []),
      "75G THE CONTROL: a file grown from a catalog in the folder that is not in use hangs under that catalog, is compared with it, and its changed card cannot be taken: "
      + JSON.stringify([gRows.map(r => r.name), lkG]));

    const L6 = run(lab75, ["desk", "rows", "work:" + olaRow.at, "settle", "yes", "settle"], true);
    const L7 = run(lab75, ["desk", "rows", "over"], true);
    const rows7 = L7.rows[0] || [], olaRow7 = rowOf(rows7, ola1.four);
    check(rd(L7, "over") && rd(L7, "heldId") === ola1.doc.id && L7.fileAtStart === "" && L7.fromAtEnd === "lamp-" + sha8(ID) + ".ec"
      && olaRow7.loaded && same(olaRow7.acts, ["See what changed", "Eject"]) && rows7.filter(r => r.loaded).length === 1 && !rows7[0].loaded
      && same(rows7[0].mine, ["Your edits to it come back when it is loaded again"]) && same(rd(L7, "over"), {}),
      "75h Work from it makes that desk's file the catalog in use, its row the loaded one and no other; no file of the folder is named in use, and the team's catalog says this desk's edits wait for it: "
      + JSON.stringify({ held: rd(L7, "heldId"), file: L7.fileAtStart, from: L7.fromAtEnd, rows: rows7.map(r => [r.name, r.loaded, r.mine]), over: rd(L7, "over") }));
    const L8 = run(lab75, ["desk", "rows", "load:lamp.ec", "settle", "yes", "settle"], true);
    const L9 = run(lab75, ["desk", "over"], true);
    check(rd(L9, "heldId") === ID && same((rd(L9, "over") || {})["c-warm"], { en: HERS }),
      "75i and loading the team's catalog again brings this desk's own edit of it back (" + JSON.stringify([rd(L9, "heldId"), (rd(L9, "over") || {})["c-warm"]]) + ")");
    /* The listing the shell sends is what repaints an open Library: a colleague's file written under it appears with no other paint. */
    const cyLab = lab75g, cyPair = crypto.generateKeyPairSync("ed25519"), cy = deskOf(grown("Good day, from Cy."), "Cy", cyPair, cyLab);
    const cyRel = path.join("desks", cy.id, "lamp-" + sha8(ID) + ".ec"), cyText = fs.readFileSync(path.join(cyLab, "catalogs", cyRel), "utf8");
    fs.rmSync(path.join(cyLab, "catalogs", "desks", cy.id), { recursive: true, force: true });
    const G3 = run(cyLab, ["desk", "boot", "settle", "rows", "drop", "listing", "reread"], true, { drop: { rel: cyRel, text: cyText } });
    const cyBefore = (G3.rows[0] || []).map(r => r.name), cyAfter = (G3.rows[1] || []).map(r => r.name);
    check(cyBefore.indexOf("Cy's desk") < 0 && cyAfter.indexOf("Cy's desk") > -1,
      "75k a colleague's file written while the Library is open appears in it once the shell's listing arrives, with no other paint (" + JSON.stringify([cyBefore, cyAfter]) + ")");
    const errs75 = [r75, L2, L3, L4, L5, L6, L7, L8, L9, G1, G2, G3].flatMap(o => o.errors || []);
    check(!errs75.length, "75j those launches ran their acts without an error" + (errs75.length ? ": " + errs75.length + ", first " + errs75[0] : ""));

    /* 76: THE PAGE'S FLOOR. It holds only where the catalog loaded now verified, and only for the
       key that signed it. An unsigned file accepted at a huge rev must not keep the genuine edition
       out. A Load or a double-click of an earlier genuine edition is offered, with the warning that it
       is older, and it loads on yes. The watch still does not offer an earlier signed file over a
       signed catalog. What the agent opens is offered whoever signed it, and a key other than the
       lead's is named. */
    const EARLIER = "This file is an earlier edition than the catalog loaded now.";
    const OLDER_WARN = "This edition is older than the one in use on this desk, so some of its replies may be out of date.";
    const OPEN_OLDER = "Open the older edition";
    const KEEP_NEWER = "Keep the newer one";
    const atRev = (rev, date) => Object.assign(payload(date), { rev: rev });
    const lab76 = scenario([["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))], ["catalogs/etiuda-ring.json", ring],
      ["huge.ec", atRev(1e15, "2026-08-01")]]);
    const boot76 = run(lab76, ["boot", "settle", "offer", "yes", "settle"]);
    const click76 = run(lab76, ["wire", "click:huge.ec", "settle", "offer", "yes", "settle"], true);
    fs.writeFileSync(path.join(lab76, "catalogs", "lamp-3.ec"), JSON.stringify(sign(atRev(3, "2026-09-20"))), "utf8");
    const watch76 = run(lab76, ["wire", "watch:catalogs/lamp-3.ec", "settle", "offer"], true);
    const offer76 = watch76.offers[0] || {};
    const errs76a = [boot76, click76, watch76].flatMap(o => o.errors || []);
    check(boot76.reloaded && boot76.heldAtEnd === V2.V2_SIG_VALID && click76.reloaded && click76.heldRev === 1e15
      && click76.heldAtEnd === V2.V2_SIG_NONE && offer76.shown === true && (offer76.files || []).includes("lamp-3.ec")
      && watch76.heldRev === 1e15 && watch76.reloaded === false && !errs76a.length,
      "76a an unsigned file at rev 1e15, double-clicked and accepted, does not keep the genuine rev 3 from being offered by the watch: "
      + JSON.stringify({ boot: boot76.heldAtEnd, accepted: click76.heldRev, trust: click76.heldAtEnd, offered: offer76.files || null,
        shown: offer76.shown, still: watch76.heldRev, errors: errs76a.slice(0, 2) }));

    const lab76b = scenario([["catalogs/lamp-1.ec", sign(atRev(1, "2026-08-01"))], ["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))],
      ["catalogs/etiuda-ring.json", ring]]);
    const boot76b = run(lab76b, ["boot", "settle", "offer", "yes", "settle"]);
    const ctrl76 = run(lab76b, ["wire", "watch:catalogs/lamp-1.ec", "settle", "offer"], true);
    const load76 = run(lab76b, ["dom", "library", "load:lamp-1.ec", "settle", "said", "yes", "settle"], true);
    const watchedOlder = ctrl76.offers[0] || {}, loadedOlder = load76.offers[load76.offers.length - 1] || {};
    const errs76c = [boot76b, ctrl76].flatMap(o => o.errors || []);
    const errs76b = (load76.errors || []);
    check(boot76b.heldAtEnd === V2.V2_SIG_VALID && ctrl76.heldAtStart === V2.V2_SIG_VALID && watchedOlder.shown === false
      && ctrl76.heldRev === 2 && ctrl76.toast !== EARLIER && (ctrl76.toast || "").indexOf("matches the catalog") < 0 && !errs76c.length,
      "76c a put-back older signed file is not offered by the watch over a signed held catalog: "
      + JSON.stringify({ held: ctrl76.heldAtStart, rev: ctrl76.heldRev, shown: watchedOlder.shown, toast: ctrl76.toast || "", errors: errs76c.slice(0, 2) }));
    check(loadedOlder.shown === true && (loadedOlder.warn || []).indexOf(OLDER_WARN) >= 0
      && loadedOlder.yes === OPEN_OLDER && loadedOlder.no === KEEP_NEWER
      && load76.toast !== EARLIER && load76.reloaded === true && load76.heldRev === 1 && !errs76b.length,
      "76b the Library's Load of an older genuine edition is offered with the warning, and yes loads it: "
      + JSON.stringify({ shown: loadedOlder.shown, warn: loadedOlder.warn || null, yes: loadedOlder.yes || "", no: loadedOlder.no || "",
        toast: load76.toast || "", rev: load76.heldRev, errors: errs76b.slice(0, 2) }));

    /* A desk that joined a team, its lead pinned in desk.json. In 76d the lead is somebody else; in 76e and 76f the
       lead is the key that signs the lamp catalog, so the folder's signed edition is the team's own. */
    const pinLead = (lab, pub) => {
      const at = path.join(lab, "userdata", "desk.json"), desk = JSON.parse(fs.readFileSync(at, "utf8"));
      desk.teamPins = { "t-aabbccddeeff0011": { keyId: "quay-lead", public: pub } };
      fs.writeFileSync(at, JSON.stringify(desk));
    };
    const leadPair = crypto.generateKeyPairSync("ed25519");
    const lab76d = scenario([["catalogs/lamp.ec", sign(payload("2026-09-01"))], ["catalogs/etiuda-ring.json", ring]]);
    pinLead(lab76d, pubHex(leadPair.publicKey));
    const open76d = run(lab76d, ["wire", "click:catalogs/lamp.ec", "settle", "offer", "yes", "settle"]);
    const named76 = open76d.offers[0] || {};
    const fours = crypto.createHash("sha256").update(Buffer.from(pubHex(pair.publicKey), "hex")).digest("hex").slice(0, 16)
      .replace(/(.{4})(?=.)/g, "$1 ");
    const signerLine = "This file is signed with the key " + fours + ", which is not the team lead's.";
    check(named76.shown === true && (named76.signer || []).length === 1 && named76.signer[0] === signerLine
      && open76d.reloaded === true && open76d.heldRev === 1 && open76d.heldId === ID && !(open76d.errors || []).length,
      "76d the same catalog, opened on purpose, is offered and names the key that signed it, and yes loads it: "
      + JSON.stringify({ shown: named76.shown, signer: named76.signer || null, rev: open76d.heldRev, id: open76d.heldId,
        errors: (open76d.errors || []).slice(0, 2) }));
    const lab76i = scenario([["catalogs/lamp.ec", bend(sign(payload("2026-09-01")))], ["catalogs/etiuda-ring.json", ring]]);
    pinLead(lab76i, pubHex(leadPair.publicKey));
    const open76i = run(lab76i, ["wire", "click:catalogs/lamp.ec", "settle", "offer"]);
    const bent76 = open76i.offers[0] || {};
    check(bent76.shown === true && (bent76.trust || []).some(l => CHANGED.test(l)) && !(bent76.signer || []).length
      && !(open76i.errors || []).length,
      "76i a file changed since it was signed, opened on a desk with its lead pinned, is offered and is not said to be signed by any key: "
      + JSON.stringify({ shown: bent76.shown, trust: bent76.trust || null, signer: bent76.signer || null, errors: (open76i.errors || []).slice(0, 2) }));

    const lab76e = scenario([["catalogs/lamp-own.ec", atRev(1, "2026-07-01")], ["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))],
      ["catalogs/etiuda-ring.json", ring]]);
    pinLead(lab76e, pubHex(pair.publicKey));
    const boot76e = run(lab76e, ["boot", "settle", "offer", "yes", "settle"]);
    const load76e = run(lab76e, ["dom", "library", "load:lamp-own.ec", "settle", "said", "yes", "settle"], true);
    const bootOffer = boot76e.offers[0] || {}, ownOffer = load76e.offers[load76e.offers.length - 1] || {};
    check(boot76e.heldRev === 2 && boot76e.heldAtEnd === V2.V2_SIG_VALID && bootOffer.shown === true && !(bootOffer.signer || []).length
      && ownOffer.shown === true && !(ownOffer.warn || []).length && ownOffer.title === "Replace catalog?"
      && load76e.reloaded === true && load76e.heldRev === 1 && load76e.heldId === ID && load76e.heldAtEnd === V2.V2_SIG_NONE
      && !(boot76e.errors || []).length && !(load76e.errors || []).length,
      "76e on a desk whose lead signs the catalog, the lead's edition boots naming no other key, and an unsigned variant of it, opened on purpose, is offered plainly and loads: "
      + JSON.stringify({ boot: boot76e.heldRev, bootSigner: bootOffer.signer || null, shown: ownOffer.shown, warn: (ownOffer.warn || []).length, title: ownOffer.title || "",
        rev: load76e.heldRev, trust: load76e.heldAtEnd, errors: (boot76e.errors || []).concat(load76e.errors || []).slice(0, 2) }));

    const lab76f = scenario([["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))], ["catalogs/etiuda-ring.json", ring]]);
    pinLead(lab76f, pubHex(pair.publicKey));
    const boot76f = run(lab76f, ["boot", "settle", "offer", "yes", "settle"]);
    const otherDoc = atRev(1, "2026-09-02");
    otherDoc.id = "other-shop";
    otherDoc.name = "Other Shop";
    fs.writeFileSync(path.join(lab76f, "catalogs", "other.ec"), JSON.stringify(otherDoc), "utf8");
    const load76f = run(lab76f, ["dom", "library", "load:other.ec", "settle", "said", "yes", "settle"], true);
    const otherOffer = load76f.offers[load76f.offers.length - 1] || {};
    check(boot76f.heldId === ID && otherOffer.shown === true && load76f.reloaded === true
      && load76f.heldId === "other-shop" && load76f.heldRev === 1 && !(load76f.errors || []).length,
      "76f a catalog with another id, opened on purpose, is offered and loads: "
      + JSON.stringify({ boot: boot76f.heldId, shown: otherOffer.shown, id: load76f.heldId, rev: load76f.heldRev,
        errors: (load76f.errors || []).slice(0, 2) }));

    /* The older edition words one card differently, so an edition's own marks would have something to count, and
       carries a later date than the held one, so only its rev says it is older. */
    const older76g = atRev(1, "2026-09-05");
    older76g.cards[0].body.en = "Good morning.";
    const lab76g = scenario([["catalogs/lamp-1.ec", sign(older76g)], ["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))],
      ["catalogs/etiuda-ring.json", ring]]);
    const boot76g = run(lab76g, ["boot", "settle", "offer", "yes", "settle"]);
    const click76g = run(lab76g, ["wire", "click:catalogs/lamp-1.ec", "settle", "offer", "yes", "settle"], true);
    const clicked = click76g.offers[0] || {};
    check(boot76g.heldRev === 2 && clicked.shown === true && (clicked.warn || []).indexOf(OLDER_WARN) >= 0
      && clicked.yes === OPEN_OLDER && clicked.no === KEEP_NEWER && click76g.reloaded === true && click76g.heldRev === 1
      && click76g.heldAtEnd === V2.V2_SIG_VALID && !/loaded:/.test(click76g.toast || "") && click76g.editionMarks === 0
      && !(boot76g.errors || []).length && !(click76g.errors || []).length,
      "76g an older genuine edition, double-clicked, is offered with the warning, yes loads it, and it is not announced as a new edition: "
      + JSON.stringify({ boot: boot76g.heldRev, shown: clicked.shown, warn: clicked.warn || null, yes: clicked.yes || "", no: clicked.no || "",
        rev: click76g.heldRev, trust: click76g.heldAtEnd, toast: click76g.toast || "", marks: click76g.editionMarks,
        errors: (boot76g.errors || []).concat(click76g.errors || []).slice(0, 2) }));

    /* A second key the ring lists for the same catalog: its lower rev is no edition of the held key's, so the page's floor
       does not hold it back, and the offer still says it is older. */
    const pair2 = crypto.generateKeyPairSync("ed25519");
    const sign2 = doc => { const o = JSON.parse(JSON.stringify(doc)); delete o.hash;
      o.sig = { alg: V2.V2_SIG_ALG, keyId: "trust-desk-second" };
      o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), pair2.privateKey).toString("hex"); return o; };
    const ring2 = JSON.stringify({ format: V2.V2_RING_FORMAT, kind: V2.V2_RING_KIND,
      keys: [{ catalog: ID, keyId: KEY_ID, alg: V2.V2_SIG_ALG, public: pubHex(pair.publicKey) },
             { catalog: ID, keyId: "trust-desk-second", alg: V2.V2_SIG_ALG, public: pubHex(pair2.publicKey) }] });
    const lab76h = scenario([["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))], ["catalogs/etiuda-ring.json", ring2],
      ["second-1.ec", sign2(atRev(1, "2026-08-01"))], ["first-1.ec", sign(atRev(1, "2026-08-02"))]]);
    const boot76h = run(lab76h, ["boot", "settle", "offer", "yes", "settle"]);
    const same76h = run(lab76h, ["wire", "watch:first-1.ec", "settle", "offer"], true);
    const other76h = run(lab76h, ["wire", "watch:second-1.ec", "settle", "offer"], true);
    const sameOffer = same76h.offers[0] || {}, otherOffer76 = other76h.offers[0] || {};
    check(boot76h.heldRev === 2 && boot76h.heldAtEnd === V2.V2_SIG_VALID && sameOffer.shown === false
      && otherOffer76.shown === true && !(otherOffer76.warn || []).length && otherOffer76.title === "Replace catalog?"
      && otherOffer76.yes === "Load it" && other76h.heldRev === 2
      && ![boot76h, same76h, other76h].some(o => (o.errors || []).length),
      "76h the page's floor holds a lower rev under the held key and not one under another key the ring lists, which is offered plainly, not as older: "
      + JSON.stringify({ boot: boot76h.heldRev, sameKey: sameOffer.shown, otherKey: otherOffer76.shown, warn: (otherOffer76.warn || []).length,
        title: otherOffer76.title || "", yes: otherOffer76.yes || "",
        still: other76h.heldRev, errors: [boot76h, same76h, other76h].flatMap(o => o.errors || []).slice(0, 2) }));

    /* The listing's own offer of a higher edition, on a desk whose lead signs the catalog: another key's higher rev
       is not offered, and the lead's next one is. */
    const lab76j = scenario([["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))], ["catalogs/etiuda-ring.json", ring2]]);
    pinLead(lab76j, pubHex(pair.publicKey));
    const boot76j = run(lab76j, ["boot", "settle", "offer", "yes", "settle"]);
    fs.writeFileSync(path.join(lab76j, "catalogs", "lamp-9.ec"), JSON.stringify(sign2(atRev(9, "2026-09-09"))), "utf8");
    const foreign76j = run(lab76j, ["wire", "listing", "settle", "offer"], true);
    fs.renameSync(path.join(lab76j, "catalogs", "lamp-9.ec"), path.join(lab76j, "lamp-9.ec"));
    fs.writeFileSync(path.join(lab76j, "catalogs", "lamp-3.ec"), JSON.stringify(sign(atRev(3, "2026-09-10"))), "utf8");
    const lead76j = run(lab76j, ["wire", "listing", "settle", "offer"], true);
    const foreignOffer = foreign76j.offers[0] || {}, leadOffer = lead76j.offers[0] || {};
    check(boot76j.heldRev === 2 && foreignOffer.shown === false && leadOffer.shown === true && (leadOffer.files || []).includes("lamp-3.ec")
      && ![boot76j, foreign76j, lead76j].some(o => (o.errors || []).length),
      "76j on a desk whose lead signs the catalog, the listing offers the lead's higher edition and not another key's: "
      + JSON.stringify({ boot: boot76j.heldRev, otherKey: foreignOffer.shown, lead: leadOffer.shown, files: leadOffer.files || null,
        errors: [boot76j, foreign76j, lead76j].flatMap(o => o.errors || []).slice(0, 2) }));

    /* OLDER IS A LOWER REV UNDER THE KEY THE HELD CATALOG VERIFIED UNDER. A Load of a lower rev of the held catalog's id, with
       what is held unverified, held under another key, held under the same key, and the same key id on a file that does not
       verify: only the third is called older. */
    const plainly = o => o.shown === true && !(o.warn || []).length && o.title === "Replace catalog?" && o.yes === "Load it";
    const said76 = o => JSON.stringify({ shown: o.shown, title: o.title || "", warn: (o.warn || []).length, yes: o.yes || "", trust: o.trust || null });
    const lab76l = scenario([["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))], ["catalogs/etiuda-ring.json", ring],
      ["huge.ec", atRev(1e15, "2026-08-01")]]);
    const boot76l = run(lab76l, ["boot", "settle", "offer", "yes", "settle"]);
    const take76l = run(lab76l, ["wire", "click:huge.ec", "settle", "offer", "yes", "settle"], true);
    const load76l = run(lab76l, ["wire", "click:catalogs/lamp-2.ec", "settle", "offer"], true);
    const o76l = load76l.offers[load76l.offers.length - 1] || {};
    check(take76l.heldAtEnd === V2.V2_SIG_NONE && take76l.heldRev === 1e15 && plainly(o76l)
      && ![boot76l, take76l, load76l].some(o => (o.errors || []).length),
      "76l with an unsigned catalog held at a higher rev, the genuine edition opened on purpose is offered plainly, not as older: " + said76(o76l) + ", errors " + JSON.stringify([boot76l, take76l, load76l].flatMap(o => o.errors || []).slice(0, 2)));

    const lab76m = scenario([["catalogs/lamp-1.ec", sign(atRev(1, "2026-08-01"))], ["catalogs/lamp-2.ec", sign2(atRev(2, "2026-09-01"))],
      ["catalogs/etiuda-ring.json", ring2]]);
    const boot76m = run(lab76m, ["boot", "settle", "offer", "yes", "settle"]);
    const load76m = run(lab76m, ["dom", "library", "load:lamp-1.ec", "settle", "said", "settle", "offer"], true);
    const o76m = load76m.offers[load76m.offers.length - 1] || {};
    check(boot76m.heldRev === 2 && boot76m.heldAtEnd === V2.V2_SIG_VALID && plainly(o76m)
      && ![boot76m, load76m].some(o => (o.errors || []).length),
      "76m with a catalog held verified under another key, a lower rev under this key, opened on purpose, is offered plainly, not as older: " + said76(o76m));

    const lab76n = scenario([["catalogs/lamp-1.ec", sign(atRev(1, "2026-08-01"))], ["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))],
      ["catalogs/etiuda-ring.json", ring]]);
    const boot76n = run(lab76n, ["boot", "settle", "offer", "yes", "settle"]);
    const load76n = run(lab76n, ["dom", "library", "load:lamp-1.ec", "settle", "said", "settle", "offer"], true);
    const o76n = load76n.offers[load76n.offers.length - 1] || {};
    check(boot76n.heldRev === 2 && o76n.shown === true && (o76n.warn || []).indexOf(OLDER_WARN) >= 0 && o76n.title === "Older catalog found"
      && o76n.yes === OPEN_OLDER && o76n.no === KEEP_NEWER && ![boot76n, load76n].some(o => (o.errors || []).length),
      "76n with a catalog held verified under the same key, a lower rev of it opened on purpose is offered as older, with the warning: " + said76(o76n));

    const lab76o = scenario([["catalogs/lamp-1.ec", bend(sign(atRev(1, "2026-08-01")))], ["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))],
      ["catalogs/etiuda-ring.json", ring]]);
    const boot76o = run(lab76o, ["boot", "settle", "offer", "yes", "settle"]);
    const load76o = run(lab76o, ["dom", "library", "load:lamp-1.ec", "settle", "said", "settle", "offer"], true);
    const o76o = load76o.offers[load76o.offers.length - 1] || {};
    check(boot76o.heldRev === 2 && plainly(o76o) && (o76o.trust || []).some(l => CHANGED.test(l))
      && ![boot76o, load76o].some(o => (o.errors || []).length),
      "76o a lower rev naming the held catalog's key id, whose signature then fails, is offered plainly once that is known: " + said76(o76o));

    /* AN UPDATE IS A HIGHER REV UNDER THE KEY THE HELD CATALOG VERIFIED UNDER. The higher file sits in a folder the
       shell does not scan, so the boot holds rev 2 and only a double-click offers rev 3. Unsigned, another key, an
       unverified catalog in use, and a file whose signature then fails are each offered plainly. The offer is still
       made, and the unsigned one still loads. */
    const UPDATE_FOUND = "Updated catalog found", LOAD_UPDATE = "Load the new edition", KEEP_CURRENT = "Keep current";
    const asUpdate = o => o.shown === true && !(o.warn || []).length && o.title === UPDATE_FOUND && o.yes === LOAD_UPDATE && o.no === "Not now";
    const plainKept = o => plainly(o) && o.no === KEEP_CURRENT;
    const higherLab = (file, ringText) => {
      const lab = scenario([["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))], ["catalogs/etiuda-ring.json", ringText]]);
      fs.mkdirSync(path.join(lab, "elsewhere"));
      fs.writeFileSync(path.join(lab, "elsewhere", "lamp-3.ec"), JSON.stringify(file), "utf8");
      return lab;
    };
    const lab76p = higherLab(sign(atRev(3, "2026-09-20")), ring);
    const boot76p = run(lab76p, ["boot", "settle", "offer", "yes", "settle"]);
    const open76p = run(lab76p, ["wire", "click:elsewhere/lamp-3.ec", "settle", "offer"], true);
    const o76p = open76p.offers[open76p.offers.length - 1] || {};
    check(boot76p.heldRev === 2 && boot76p.heldAtEnd === V2.V2_SIG_VALID && asUpdate(o76p)
      && ![boot76p, open76p].some(o => (o.errors || []).length),
      "76p with a catalog held verified under the same key, a higher rev of it opened on purpose is offered as an update: " + said76(o76p)
      + ", errors " + JSON.stringify([boot76p, open76p].flatMap(o => o.errors || []).slice(0, 2)));

    const lab76q = higherLab(atRev(3, "2026-09-20"), ring);
    const boot76q = run(lab76q, ["boot", "settle", "offer", "yes", "settle"]);
    const open76q = run(lab76q, ["wire", "click:elsewhere/lamp-3.ec", "settle", "offer", "yes", "settle"], true);
    const o76q = open76q.offers[0] || {};
    check(boot76q.heldRev === 2 && boot76q.heldAtEnd === V2.V2_SIG_VALID && plainKept(o76q)
      && open76q.reloaded === true && open76q.heldRev === 3 && open76q.editionMarks === 0
      && ![boot76q, open76q].some(o => (o.errors || []).length),
      "76q a higher rev unsigned, over a catalog held verified, is offered plainly and loads, and is not announced as a new edition: "
      + said76(o76q) + ", rev " + open76q.heldRev + ", marks " + open76q.editionMarks);

    const lab76r = higherLab(sign2(atRev(3, "2026-09-20")), ring2);
    const boot76r = run(lab76r, ["boot", "settle", "offer", "yes", "settle"]);
    const open76r = run(lab76r, ["wire", "click:elsewhere/lamp-3.ec", "settle", "offer"], true);
    const o76r = open76r.offers[open76r.offers.length - 1] || {};
    check(boot76r.heldRev === 2 && boot76r.heldAtEnd === V2.V2_SIG_VALID && plainKept(o76r)
      && ![boot76r, open76r].some(o => (o.errors || []).length),
      "76r a higher rev under another key, over a catalog held verified, is offered plainly: " + said76(o76r)
      + ", errors " + JSON.stringify([boot76r, open76r].flatMap(o => o.errors || []).slice(0, 2)));

    const lab76s = scenario([["catalogs/lamp-1.ec", atRev(1, "2026-09-01")], ["catalogs/etiuda-ring.json", ring]]);
    fs.mkdirSync(path.join(lab76s, "elsewhere"));
    fs.writeFileSync(path.join(lab76s, "elsewhere", "lamp-3.ec"), JSON.stringify(sign(atRev(3, "2026-09-20"))), "utf8");
    const boot76s = run(lab76s, ["boot", "settle", "offer", "yes", "settle"]);
    const open76s = run(lab76s, ["wire", "click:elsewhere/lamp-3.ec", "settle", "offer"], true);
    const o76s = open76s.offers[open76s.offers.length - 1] || {};
    check(boot76s.heldRev === 1 && boot76s.heldAtEnd === V2.V2_SIG_NONE && plainKept(o76s)
      && ![boot76s, open76s].some(o => (o.errors || []).length),
      "76s a higher rev opened over a catalog that did not verify is offered plainly: " + said76(o76s)
      + ", errors " + JSON.stringify([boot76s, open76s].flatMap(o => o.errors || []).slice(0, 2)));

    const lab76t = higherLab(bend(sign(atRev(3, "2026-09-20"))), ring);
    const boot76t = run(lab76t, ["boot", "settle", "offer", "yes", "settle"]);
    const open76t = run(lab76t, ["wire", "click:elsewhere/lamp-3.ec", "settle", "offer"], true);
    const o76t = open76t.offers[open76t.offers.length - 1] || {};
    check(boot76t.heldRev === 2 && plainKept(o76t) && (o76t.trust || []).some(l => CHANGED.test(l))
      && ![boot76t, open76t].some(o => (o.errors || []).length),
      "76t a higher rev naming the held catalog's key id, whose signature then fails, is offered plainly once that is known: " + said76(o76t));

    /* THE LATE CHECK TURNS A SAME-KEY UPDATE INTO A REPLACEMENT. Rev 2 is held verified, then the file in the
       folder is that catalog's next rev with the signature bent and one card's text changed, so a load that still
       thinks it is an edition writes a mark and a load that does not writes none. */
    const lab76u = scenario([["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))], ["catalogs/etiuda-ring.json", ring]]);
    const boot76u = run(lab76u, ["boot", "settle", "offer", "yes", "settle"]);
    const broken76u = bend(sign(atRev(3, "2026-09-20")));
    broken76u.cards.forEach(card => { if (card.id === "c-warm") card.body = { en: "Good day, later." }; });
    fs.writeFileSync(path.join(lab76u, "catalogs", "lamp-2.ec"), JSON.stringify(broken76u), "utf8");
    const found76u = run(lab76u, ["desk", "boot", "settle", "settle", "offer", "readwait", "yes", "settle"], true, { band: true });
    const o76u = found76u.offers[0] || {}, w76u = ((found76u.read && found76u.read.wait) || [])[0] || {};
    check(boot76u.heldRev === 2 && boot76u.heldAtEnd === V2.V2_SIG_VALID && plainKept(o76u)
      && !(o76u.holds || []).length && (o76u.trust || []).some(l => CHANGED.test(l))
      && w76u.waiting === false && w76u.dot === false
      && found76u.reloaded === true && found76u.heldRev === 3 && found76u.editionMarks === 0
      && ![boot76u, found76u].some(o => (o.errors || []).length),
      "76u a higher rev whose signature fails after the offer opened drops the carries-on line and the waiting dot, and Yes loads it as a replacement: "
      + said76(o76u) + ", holds " + JSON.stringify(o76u.holds || null) + ", wait " + JSON.stringify(w76u)
      + ", rev " + found76u.heldRev + ", marks " + found76u.editionMarks
      + ", errors " + JSON.stringify([boot76u, found76u].flatMap(o => o.errors || []).slice(0, 2)));

    /* THE SIGNATURE ALREADY FAILED when this offer was built. The first bubble is declined before the check
       returns, so the name still waits, and opening it again is the offer of that same file. */
    const lab76v = scenario([["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))], ["catalogs/etiuda-ring.json", ring]]);
    const boot76v = run(lab76v, ["boot", "settle", "offer", "yes", "settle"]);
    fs.writeFileSync(path.join(lab76v, "catalogs", "lamp-2.ec"), JSON.stringify(bend(sign(atRev(3, "2026-09-20")))), "utf8");
    const again76v = run(lab76v, ["desk", "boot", "escape", "settle", "settle", "reopen", "offer"], true, { band: true });
    const o76v = again76v.offers[0] || {};
    check(boot76v.heldRev === 2 && boot76v.heldAtEnd === V2.V2_SIG_VALID && plainKept(o76v)
      && (o76v.trust || []).some(l => CHANGED.test(l))
      && ![boot76v, again76v].some(o => (o.errors || []).length),
      "76v a higher rev whose signature has already failed when the offer opens is offered plainly: " + said76(o76v)
      + ", errors " + JSON.stringify([boot76v, again76v].flatMap(o => o.errors || []).slice(0, 2)));

    /* AN EQUAL REV IS NOT AN UPDATE UNLESS IT VERIFIED UNDER THE HELD KEY. Unsigned, with a later date, keeps
       the trust line and is offered as a replacement. The same key id, once its signature has failed, likewise. */
    const UNSIGNED_EDITION = /is signed, and this edition is not/;
    const lab76w = higherLab(atRev(2, "2026-10-01"), ring);
    const boot76w = run(lab76w, ["boot", "settle", "offer", "yes", "settle"]);
    const open76w = run(lab76w, ["wire", "click:elsewhere/lamp-3.ec", "settle", "offer", "readwait"], true, { band: true });
    const o76w = open76w.offers[0] || {}, w76w = ((open76w.read && open76w.read.wait) || [])[0] || {};
    check(boot76w.heldRev === 2 && boot76w.heldAtEnd === V2.V2_SIG_VALID && plainKept(o76w)
      && (o76w.trust || []).some(l => UNSIGNED_EDITION.test(l))
      && w76w.waiting === false && w76w.dot === false
      && ![boot76w, open76w].some(o => (o.errors || []).length),
      "76w an unsigned equal rev with a later date, over a catalog held verified, is offered plainly: " + said76(o76w)
      + ", trust " + JSON.stringify(o76w.trust || null) + ", wait " + JSON.stringify({ waiting: w76w.waiting, dot: w76w.dot })
      + ", errors " + JSON.stringify([boot76w, open76w].flatMap(o => o.errors || []).slice(0, 2)));

    const lab76x = higherLab(bend(sign(atRev(2, "2026-10-01"))), ring);
    const boot76x = run(lab76x, ["boot", "settle", "offer", "yes", "settle"]);
    const open76x = run(lab76x, ["wire", "click:elsewhere/lamp-3.ec", "settle", "offer"], true);
    const o76x = open76x.offers[open76x.offers.length - 1] || {};
    check(boot76x.heldRev === 2 && plainKept(o76x) && (o76x.trust || []).some(l => CHANGED.test(l))
      && ![boot76x, open76x].some(o => (o.errors || []).length),
      "76x an equal rev naming the held catalog's key id, whose signature then fails, is offered plainly once that is known: " + said76(o76x));

    /* The yes is what raises the mark for a file the agent opened: the shell's mark in desk.json, read after a Load declined
       and after the same Load taken. The file is a second catalog of the same key, dated before the first, so no boot chooses it
       and only the Load hands it over. */
    const ANNEX = "lamp-annex";
    const ringK = JSON.stringify({ format: V2.V2_RING_FORMAT, kind: V2.V2_RING_KIND,
      keys: [ID, ANNEX].map(c => ({ catalog: c, keyId: KEY_ID, alg: V2.V2_SIG_ALG, public: pubHex(pair.publicKey) })) });
    const lab76k = scenario([["catalogs/lamp-2.ec", sign(atRev(2, "2026-09-01"))], ["catalogs/etiuda-ring.json", ringK]]);
    const markIn = (lab, id) => { const d = JSON.parse(fs.readFileSync(path.join(lab, "userdata", "desk.json"), "utf8"));
      return ((d.catalogRevs || {})[id] || {})[pubHex(pair.publicKey)]; };
    const boot76k = run(lab76k, ["boot", "settle", "offer", "yes", "settle"]);
    const k0 = [markIn(lab76k, ID), markIn(lab76k, ANNEX)];
    const annex = Object.assign(atRev(3, "2026-09-10"), { id: ANNEX, name: "Lamp Annex" });
    const annexAt = path.join(lab76k, "catalogs", "annex.ec");
    fs.writeFileSync(annexAt, JSON.stringify(sign(annex)), "utf8");
    const long = Date.now() / 1000 - 86400;
    fs.utimesSync(annexAt, long, long);
    const no76k = run(lab76k, ["dom", "library", "load:annex.ec", "settle", "said", "no", "settle"], true);
    const k1 = [markIn(lab76k, ID), markIn(lab76k, ANNEX)];
    const yes76k = run(lab76k, ["dom", "library", "load:annex.ec", "settle", "said", "yes", "settle"], true);
    const k2 = [markIn(lab76k, ID), markIn(lab76k, ANNEX)];
    const declined = no76k.offers[no76k.offers.length - 1] || {};
    check(boot76k.heldRev === 2 && k0[0] === 2 && k0[1] === undefined && declined.shown === true && no76k.heldId === ID
      && k1[0] === 2 && k1[1] === undefined && yes76k.reloaded === true && yes76k.heldId === ANNEX && k2[0] === 2 && k2[1] === 3
      && ![boot76k, no76k, yes76k].some(o => (o.errors || []).length),
      "76k a Load the agent declines leaves the shell's marks where they were, and the same Load taken raises that catalog's to its rev: "
      + JSON.stringify({ boot: k0, offered: declined.shown, declined: k1, taken: k2, held: yes76k.heldId,
        errors: [boot76k, no76k, yes76k].flatMap(o => o.errors || []).slice(0, 2) }));

    /* 77: A COLLEAGUE'S FILE WHOSE DESK IS OFF THE TEAM'S ROSTER (board 889). The desk pins a team's lead and keeps the roster
       it accepted, written into desk.json as the shell writes them, with no team file in the folder. Asked for by name, as
       Work from it asks once a row was drawn before the roster changed, the file is offered with the note, and on an empty
       desk the offer stands where it would have loaded at once. In the Library only the roster's desks are drawn, and this
       desk's own file still says its edits are in the folder. */
    const lead77 = crypto.generateKeyPairSync("ed25519");
    const TEAM77 = "t-" + "7a".repeat(8), LEAD77 = { keyId: "roster-lead", public: pubHex(lead77.publicKey) };
    const onRoster = (lab, ids, branch, unpinned) => {
      const at = path.join(lab, "userdata", "desk.json"), env = JSON.parse(fs.readFileSync(at, "utf8"));
      env.teamPins = unpinned ? {} : { [TEAM77]: LEAD77 };
      env.teamEpochSeen = { [TEAM77]: 1 };
      env.teamRoster = { [TEAM77]: { epoch: 1, desks: ids } };
      if (branch) env.branch = { sign: { pub: branch.raw.toString("hex"), priv: "sealed" }, box: { pub: "ef".repeat(32), priv: "sealed" } };
      fs.writeFileSync(at, JSON.stringify(env), "utf8");
    };
    const alone77 = id => Object.assign(JSON.parse(JSON.stringify(wanted)), { id: id, name: "Kiosk " + id });
    const lab77 = scenario([]);
    const bo77 = deskOf(alone77("bo-kiosk"), "Bo", null, lab77), bo77File = "lamp-" + sha8("bo-kiosk") + ".ec";
    onRoster(lab77, ["k-" + "0".repeat(16)]);
    const off77 = run(lab77, ["deskload:" + bo77File + "," + bo77.id, "said", "settle"]);
    const o77 = off77.offers[0] || {};
    check(o77.shown === true && same(o77.roster, ["This file comes from a desk outside the team."]) && o77.yes === "Load catalog"
      && !off77.reloaded && off77.heldId === "" && !(off77.errors || []).length,
      "77a on an empty desk, a file asked for whose desk is off the team's roster is offered with the note rather than loaded at once: "
      + JSON.stringify({ shown: o77.shown, roster: o77.roster, yes: o77.yes, loaded: off77.reloaded, held: off77.heldId, errors: (off77.errors || []).slice(0, 2) }));
    const lab77A = scenario([]), bo77A = deskOf(alone77("bo-kiosk"), "Bo", null, lab77A);
    onRoster(lab77A, [bo77A.id]);
    const on77 = run(lab77A, ["deskload:" + bo77File + "," + bo77A.id, "said", "settle"]);
    check(on77.reloaded === true && on77.heldId === bo77A.doc.id && !(on77.offers[0] || {}).shown && !(on77.errors || []).length,
      "77A THE CONTROL: the same file, its desk on the roster, loads at once on the empty desk as before, with no offer and no note: "
      + JSON.stringify({ loaded: on77.reloaded, held: on77.heldId, offer: (on77.offers[0] || {}).shown, errors: (on77.errors || []).slice(0, 2) }));
    const lab77b = accepted();
    const pin77 = JSON.parse(JSON.parse(fs.readFileSync(path.join(lab77b, "userdata", "desk.json"), "utf8")).keys.eCatalog).pin;
    const grown77 = body => { const d = JSON.parse(JSON.stringify(wanted)); d.grew = { id: ID, rev: 1, sha: pin77 }; d.cards[0].body.en = body; return d; };
    const own77 = deskOf(grown77("Hello there."), "Max", crypto.generateKeyPairSync("ed25519"), lab77b);
    const ola77 = deskOf(grown77("Good day to you."), "Ola", null, lab77b), cy77 = deskOf(grown77("Good day, from Cy."), "Cy", null, lab77b);
    onRoster(lab77b, [ola77.id], own77);
    const r77 = run(lab77b, ["desk", "rows"], true), rows77 = r77.rows[0] || [];
    check(same(rows77.map(r => r.name), ["lamp.ec", "Ola's desk"]) && same((rows77[0] || {}).mine, ["Your edits are with the team"])
      && rows77.every(r => r.fp !== cy77.four) && !(r77.errors || []).length,
      "77b the Library draws the roster's desk and not the one off it, and this desk's own file, though the roster does not list it, still says its edits are with the team: "
      + JSON.stringify({ rows: rows77.map(r => [r.name, r.fp, r.mine]), errors: (r77.errors || []).slice(0, 2) }));
    /* The lead adds a desk at the epoch already accepted: the team file says so, under the pinned lead, and the roster kept
       at that epoch follows it. The file lands while the desk runs, after its boot has read the folder, so the listing
       itself heeds it. It lists desks only, with no key for anybody, so nothing is sealed or opened. */
    const team77 = { format: 1, kind: "etiuda-team", id: TEAM77, catalogs: [ID], lead: LEAD77, sealed: false, exportsSealed: false, epoch: 1,
      roster: [ola77, cy77].map(d => ({ desk: { id: d.id, key: d.raw.toString("hex"), box: "ef".repeat(32) } })) };
    team77.sig = { alg: "Ed25519", keyId: LEAD77.keyId };
    team77.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(team77)), lead77.privateKey).toString("hex");
    const r77c = run(lab77b, ["desk", "drop", "rows"], true, { drop: { rel: "etiuda-team.json", text: JSON.stringify(team77) } });
    const rows77c = r77c.rows[0] || [];
    check(same(rows77c.map(r => r.name).sort(), ["Cy's desk", "Ola's desk", "lamp.ec"]) && !(r77c.errors || []).length,
      "77c a desk the lead adds to the roster at the epoch already accepted is drawn at the next listing once the team file says so: "
      + JSON.stringify({ rows: rows77c.map(r => r.name), errors: (r77c.errors || []).slice(0, 2) }));
    fs.unlinkSync(path.join(lab77b, "catalogs", "etiuda-team.json"));
    const lab77d = accepted();
    const ola77d = deskOf(grown77("Good day to you."), "Ola", null, lab77d), cy77d = deskOf(grown77("Good day, from Cy."), "Cy", null, lab77d);
    onRoster(lab77d, [ola77d.id], null, true);
    const r77d = run(lab77d, ["desk", "rows"], true), rows77d = r77d.rows[0] || [];
    check(same(rows77d.map(r => r.name).sort(), ["Cy's desk", "Ola's desk", "lamp.ec"]) && cy77d.id !== ola77d.id && !(r77d.errors || []).length,
      "77d a roster kept for a team whose lead this desk no longer pins, as after the lead is forgotten, draws every desk as a desk with no team does: "
      + JSON.stringify({ rows: rows77d.map(r => r.name), errors: (r77d.errors || []).slice(0, 2) }));

    /* A file opened on purpose, through the shell: a drop and Import. The shell's one note is the sentence. An empty
       desk asks when the writer is off the roster, and a member's drop still asks, as a double-click does today. */
    const offPath = (who, file) => "catalogs/desks/" + who.id + "/" + file;
    const lab77e = scenario([]);
    const bo77e = deskOf(alone77("bo-kiosk"), "Bo", null, lab77e);
    onRoster(lab77e, ["k-" + "0".repeat(16)]);
    const dropOff = run(lab77e, ["wire", "openpath:" + offPath(bo77e, bo77File), "said"]);
    const dOff = dropOff.offers[0] || {};
    check(dOff.shown === true && same(dOff.roster, ["This file comes from a desk outside the team."]) && !dropOff.reloaded
      && dropOff.heldId === "" && !(dropOff.errors || []).length,
      "77e a drop of a file whose desk is off the roster is offered with the note, and an empty desk does not load it: "
      + JSON.stringify({ shown: dOff.shown, roster: dOff.roster, loaded: dropOff.reloaded, held: dropOff.heldId, errors: (dropOff.errors || []).slice(0, 2) }));
    const lab77f = scenario([]);
    const bo77f = deskOf(alone77("bo-kiosk"), "Bo", null, lab77f);
    onRoster(lab77f, [bo77f.id]);
    const dropOn = run(lab77f, ["wire", "openpath:" + offPath(bo77f, bo77File), "said"]);
    const dOn = dropOn.offers[0] || {};
    check(dOn.shown === true && same(dOn.roster, []) && !dropOn.reloaded && !(dropOn.errors || []).length,
      "77f THE CONTROL: a drop of a member's file is offered as a double-click is, with no note, and is not loaded at once: "
      + JSON.stringify({ shown: dOn.shown, roster: dOn.roster, loaded: dropOn.reloaded, errors: (dropOn.errors || []).slice(0, 2) }));
    const lab77g = scenario([]);
    const bo77g = deskOf(alone77("bo-kiosk"), "Bo", null, lab77g);
    onRoster(lab77g, ["k-" + "0".repeat(16)]);
    const impOff = run(lab77g, ["pickpath:" + offPath(bo77g, bo77File), "said"]);
    const iOff = impOff.offers[0] || {};
    check(iOff.shown === true && same(iOff.roster, ["This file comes from a desk outside the team."]) && !impOff.reloaded
      && impOff.heldId === "" && !(impOff.errors || []).length,
      "77g Import of a file whose desk is off the roster asks, with the note, and an empty desk does not load it: "
      + JSON.stringify({ shown: iOff.shown, roster: iOff.roster, loaded: impOff.reloaded, held: impOff.heldId, errors: (impOff.errors || []).slice(0, 2) }));
    const lab77h = scenario([]);
    const bo77h = deskOf(alone77("bo-kiosk"), "Bo", null, lab77h);
    onRoster(lab77h, [bo77h.id]);
    const impOn = run(lab77h, ["pickpath:" + offPath(bo77h, bo77File), "said"]);
    check(impOn.reloaded === true && impOn.heldId === bo77h.doc.id && !(impOn.offers[0] || {}).shown && !(impOn.errors || []).length,
      "77h THE CONTROL: Import of a member's file loads at once on the empty desk, with no offer and no note: "
      + JSON.stringify({ loaded: impOn.reloaded, held: impOn.heldId, offer: (impOn.offers[0] || {}).shown, errors: (impOn.errors || []).slice(0, 2) }));
    const lab77i = scenario([]);
    const bo77i = deskOf(alone77("bo-kiosk"), "Bo", null, lab77i);
    onRoster(lab77i, ["k-" + "0".repeat(16)]);
    run(lab77i, ["pickpath:" + offPath(bo77i, bo77File), "said", "settle"]);
    const histOff = run(lab77i, ["hist", "said"]);
    const hOff = histOff.offers[0] || {};
    check(hOff.shown === true && same(hOff.roster, ["This file comes from a desk outside the team."]) && !histOff.reloaded
      && !(histOff.errors || []).length,
      "77i a kept version of a file whose desk is off the roster is offered with the note, and an empty desk does not load it: "
      + JSON.stringify({ shown: hOff.shown, roster: hOff.roster, loaded: histOff.reloaded, errors: (histOff.errors || []).slice(0, 2) }));

    /* 78: A JOINED DESK'S KEY IS ITS PINNED LEAD'S (sense pass finding 5). The shell chooses an edition by the pin alone
       (catalogLeadOk), so the key the page draws says the same: gold for a file the pinned lead signed with no ring beside
       it, and not gold for a file and a ring both put on the share under another key, however well that ring vouches for
       it. A desk outside any team reads the ring alone, as before. The pin carries the lead's own key id, as a team file or
       an invitation writes it, and the other key borrows that id, as anyone writing the share could. */
    const pinAs = (lab, pub, keyId) => {
      const at = path.join(lab, "userdata", "desk.json"), desk = JSON.parse(fs.readFileSync(at, "utf8"));
      desk.teamPins = { ["t-" + "78".repeat(7) + "ab"]: { keyId: keyId, public: pub } };
      fs.writeFileSync(at, JSON.stringify(desk));
    };
    const forger = crypto.generateKeyPairSync("ed25519");
    const forge = doc => { const o = JSON.parse(JSON.stringify(doc)); delete o.hash;
      o.sig = { alg: V2.V2_SIG_ALG, keyId: KEY_ID }; o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), forger.privateKey).toString("hex"); return o; };
    const forgedRing = JSON.stringify({ format: V2.V2_RING_FORMAT, kind: V2.V2_RING_KIND,
      keys: [{ catalog: ID, keyId: KEY_ID, alg: V2.V2_SIG_ALG, public: pubHex(forger.publicKey) }] });
    const errs78 = (...os) => os.flatMap(o => o.errors || []).slice(0, 2);

    const lab78a = scenario([["catalogs/lamp.ec", sign(payload("2026-09-01"))]]);
    pinAs(lab78a, pubHex(pair.publicKey), KEY_ID);
    const boot78a = run(lab78a, ["boot", "settle", "offer", "yes", "settle"]);
    const lib78a = run(lab78a, ["library"], true);
    const o78a = boot78a.offers[0] || {}, r78a = row(lib78a, "lamp.ec");
    check(o78a.shown === true && same(o78a.trust, []) && boot78a.reloaded && boot78a.heldAtEnd === V2.V2_SIG_VALID
      && !!r78a && r78a.loaded && !!r78a.key && r78a.key.state === V2.V2_SIG_VALID && r78a.key.gold && r78a.key.word === "Signed"
      && !errs78(boot78a, lib78a).length,
      "78a on a desk whose pinned lead signed the catalog, with no ring beside it, the boot's offer says nothing against it, the desk holds it as signed and its row's key is gold: "
      + JSON.stringify({ trust: o78a.trust || null, held: boot78a.heldAtEnd, row: said(r78a), errors: errs78(boot78a, lib78a) }));

    const folder78 = () => scenario([["catalogs/lamp-lead.ec", sign(payload("2026-09-01"))], ["catalogs/lamp.ec", forge(atRev(2, "2026-09-02"))],
      ["catalogs/etiuda-ring.json", forgedRing]]);
    const lab78b = folder78();
    pinAs(lab78b, pubHex(pair.publicKey), KEY_ID);
    const lib78b = run(lab78b, ["library"]);
    const lead78b = row(lib78b, "lamp-lead.ec"), swap78b = row(lib78b, "lamp.ec");
    check(!!lead78b && !!lead78b.key && lead78b.key.state === V2.V2_SIG_VALID && lead78b.key.gold
      && !!swap78b && !!swap78b.key && swap78b.key.state === V2.V2_SIG_UNKNOWN && !swap78b.key.gold && UNKNOWN_KEY.test(swap78b.key.tip)
      && !errs78(lib78b).length,
      "78b on that desk, with a file and a ring both put on the share under another key, the lead's file is gold and the other is not, whatever the ring says: "
      + said(lead78b) + " / " + said(swap78b) + ", errors " + JSON.stringify(errs78(lib78b)));
    const lab78B = folder78();
    const lib78B = run(lab78B, ["library"]);
    const lead78B = row(lib78B, "lamp-lead.ec"), swap78B = row(lib78B, "lamp.ec");
    check(!!lead78B && !!lead78B.key && lead78B.key.state === V2.V2_SIG_INVALID && !lead78B.key.gold
      && !!swap78B && !!swap78B.key && swap78B.key.state === V2.V2_SIG_VALID && swap78B.key.gold && !errs78(lib78B).length,
      "78B THE CONTROL: the same folder on a desk outside any team reads the ring alone, as before: the file it vouches for is gold, and the lead's, under the key id the ring gives the other key, reads changed: "
      + said(lead78B) + " / " + said(swap78B) + ", errors " + JSON.stringify(errs78(lib78B)));

    const forgerFours = crypto.createHash("sha256").update(Buffer.from(pubHex(forger.publicKey), "hex")).digest("hex").slice(0, 16)
      .replace(/(.{4})(?=.)/g, "$1 ");
    const open78c = run(lab78b, ["wire", "click:catalogs/lamp.ec", "settle", "offer", "yes", "settle"]);
    const o78c = open78c.offers[0] || {};
    check(o78c.shown === true && same(o78c.signer, ["This file is signed with the key " + forgerFours + ", which is not the team lead's."])
      && same(o78c.trust, []) && open78c.reloaded === true && open78c.heldId === ID && open78c.heldAtEnd === V2.V2_SIG_UNKNOWN
      && !errs78(open78c).length,
      "78c that file, opened on purpose, is offered naming the key that signed it as not the lead's and saying nothing else of its signature, loads on yes, and is held as a key this desk does not know: "
      + JSON.stringify({ shown: o78c.shown, signer: o78c.signer || null, trust: o78c.trust || null, loaded: open78c.reloaded,
        held: open78c.heldAtEnd, errors: errs78(open78c) }));

    const lab78d = scenario([["catalogs/lamp.ec", bend(sign(payload("2026-09-01")))]]);
    pinAs(lab78d, pubHex(pair.publicKey), KEY_ID);
    const open78d = run(lab78d, ["wire", "click:catalogs/lamp.ec", "settle", "offer"]);
    const o78d = open78d.offers[0] || {};
    check(o78d.shown === true && (o78d.trust || []).length === 1 && CHANGED.test(o78d.trust[0]) && !(o78d.signer || []).length
      && !errs78(open78d).length,
      "78d a file naming the pinned lead's key that the lead's key does not verify, with no ring beside it, is offered as changed since it was signed: "
      + JSON.stringify({ shown: o78d.shown, trust: o78d.trust || null, signer: o78d.signer || null, errors: errs78(open78d) }));

    /* 79: THE CATALOG IN USE ANSWERS TO THE PINNED LEAD TOO, and a gold key is named by the public that verified it (the
       test architect's legs 79c, 79d and 79f from his verdict on e408e76, and 79g). A desk outside any team that took a file
       and a ring from the share holds that catalog as signed; once the desk pins a lead who did not sign it, the row of the
       catalog in use is not gold, whether the shell hands its file this load or not. */
    const keyOf = r => r && r.key ? { state: r.key.state, gold: !!r.key.gold, word: r.key.word } : null;
    const signAs = (doc, priv, kid, alg) => { const o = JSON.parse(JSON.stringify(doc)); delete o.hash;
      o.sig = { alg: alg || V2.V2_SIG_ALG, keyId: kid }; o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), priv).toString("hex"); return o; };
    // 79c the lead's key signs, but under an alg the shell would not verify: not gold, as the shell would not choose it
    const lab79c = scenario([["catalogs/lamp.ec", signAs(atRev(2, "2026-09-02"), pair.privateKey, KEY_ID, "ed25519")]]);
    pinAs(lab79c, pubHex(pair.publicKey), KEY_ID);
    const lib79c = run(lab79c, ["library"]);
    const a79 = row(lib79c, "lamp.ec");
    check(!!a79 && !!a79.key && !a79.key.gold,
      "79c a lead-signed file under an alg the shell refuses is not gold: " + JSON.stringify({ k: keyOf(a79), errors: errs78(lib79c) }));
    // 79d a desk that held a file as signed under a ring, then joined a team whose lead did not sign it: not gold after relaunch
    const lab79d = scenario([["catalogs/lamp.ec", forge(atRev(2, "2026-09-02"))], ["catalogs/etiuda-ring.json", forgedRing]]);
    const boot79d = run(lab79d, ["boot", "settle", "offer", "yes", "settle"]);
    const held79d = boot79d.heldAtEnd;
    pinAs(lab79d, pubHex(pair.publicKey), KEY_ID);
    const lib79d = run(lab79d, ["library"]);
    const d79 = row(lib79d, "lamp.ec");
    check(held79d === V2.V2_SIG_VALID && !!d79 && !!d79.key && !d79.key.gold,
      "79d held as signed under the ring before the pin, not gold once the lead is pinned: " + JSON.stringify({ held: held79d, loaded: d79 && d79.loaded, k: keyOf(d79), errors: errs78(boot79d, lib79d) }));
    // 79f as 79d, the relaunch booting first, as a real launch does
    const lab79f = scenario([["catalogs/lamp.ec", forge(atRev(2, "2026-09-02"))], ["catalogs/etiuda-ring.json", forgedRing]]);
    const boot79f = run(lab79f, ["boot", "settle", "offer", "yes", "settle"]);
    pinAs(lab79f, pubHex(pair.publicKey), KEY_ID);
    const lib79f = run(lab79f, ["boot", "settle", "offer", "library"]);
    const f79 = row(lib79f, "lamp.ec");
    check(boot79f.heldAtEnd === V2.V2_SIG_VALID && !!f79 && !!f79.key && !f79.key.gold,
      "79f held as signed under the ring before the pin, booted again with the lead pinned, not gold: " + JSON.stringify({ held0: boot79f.heldAtEnd, held1: lib79f.heldAtEnd, offer: lib79f.offers[0] || null, loaded: f79 && f79.loaded, k: keyOf(f79), errors: errs78(boot79f, lib79f) }));
    // 79g, read off launches above: the other key's file on 78B's desk outside any team, and 78a's lead catalog in use
    const forgerTip = "This file is signed with the key " + foursOf(pubHex(forger.publicKey)) + ".";
    const leadTip = "This file is signed with the key " + foursOf(pubHex(pair.publicKey)) + ".";
    check(!!swap78B && !!swap78B.key && swap78B.key.tip === forgerTip && !!r78a && r78a.loaded && !!r78a.key && r78a.key.tip === leadTip,
      "79g a gold key is named by the print of the public that verified the file, never the key id the file gives itself: the other key's file names that key though it borrowed the lead's id, and the pinned lead's catalog in use names the lead's: "
      + JSON.stringify([swap78B && swap78B.key && swap78B.key.tip, r78a && r78a.key && r78a.key.tip]));

    /* 80a, the test architect's leg from his verdict on d39a5f8 (Clement psi, 2026-10-15): the boot's offer on the first
       launch after the pin. The held catalog is another key's rev 3 under the lead's borrowed key id, held valid under a
       ring before the pin, and the lead's own rev 2 is beside it, which the shell hands this launch. The old valid made the
       floor hold the lead's edition back at that boot; once the held state answers to the pin, the offer is made again. */
    const lab80a = scenario([["catalogs/lamp.ec", forge(atRev(3, "2026-09-03"))], ["catalogs/lamp-lead.ec", sign(atRev(2, "2026-09-02"))],
      ["catalogs/etiuda-ring.json", forgedRing]]);
    const b80a0 = run(lab80a, ["boot", "settle", "offer", "yes", "settle"]);
    pinAs(lab80a, pubHex(pair.publicKey), KEY_ID);
    const b80a1 = run(lab80a, ["boot", "settle", "offer"]);
    const o80a = b80a1.offers[0] || {};
    check(b80a0.heldAtEnd === V2.V2_SIG_VALID && b80a0.heldRev === 3 && o80a.shown === true && (o80a.files || []).includes("lamp-lead.ec")
      && b80a1.heldAtEnd === V2.V2_SIG_UNKNOWN && !errs78(b80a0, b80a1).length,
      "80a on the first launch after the pin, the lead's own lower edition is offered at boot, the held state lowered from valid: "
      + JSON.stringify({ held0: b80a0.heldAtEnd, rev0: b80a0.heldRev, shown: o80a.shown, files: o80a.files || null, title: o80a.title || "",
        held1: b80a1.heldAtEnd, errors: errs78(b80a0, b80a1) }));

    /* 81a: THE LIBRARY DOES NOT WAIT ON A HOST THAT NEVER ANSWERS. The held signature's answer to a pinned lead is waited
       for as long as a row's own check is (2 s), and the list is drawn after that whatever the host says. */
    const lab81a = scenario([["catalogs/lamp.ec", sign(payload("2026-09-01"))], ["catalogs/etiuda-ring.json", ring]]);
    run(lab81a, ["boot", "settle", "offer", "yes", "settle"]);
    const hung81a = run(lab81a, ["hangleads", "librarylate"]);
    const r81a = row(hung81a, "lamp.ec");
    check(!!r81a && r81a.loaded && !errs78(hung81a).length,
      "81a with the host never answering about the pinned leads, the Library is still drawn once a row's wait is over, its catalog in use loaded: "
      + JSON.stringify({ rows: (hung81a.library[0] || []).map(r => [r.name, r.loaded]), errors: errs78(hung81a) }));
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
