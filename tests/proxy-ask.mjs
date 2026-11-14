/* A network proxy's question on the page: the preload's two ends of etiuda:proxy-ask and etiuda:proxy-answer, and the
 * bubble src/modules/proxy-ask.js shows. Bare node, no window and no network.
 *
 *     node tests/proxy-ask.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE PRELOAD (a) is the real shell/preload.js, evaluated over a stand-in ipcRenderer: the question reaches the page as a
 * plain object of four checked fields, and the answer leaves as an id and two strings.
 *
 * THE PAGE (b) is the real module over a stand-in document small enough to press its buttons, its host the preload's own
 * E_HOST from (a), so the question goes the whole way from the shell's channel to the shell's answer. What is typed is
 * answered once and goes nowhere else: no store, no other channel, no output line, and the fields are emptied on leaving.
 * The shell's half, the proxies and the asker, is tests/proxy-net.mjs.
 *
 * EVERY GUARD IS SHOWN RED (p): the line carrying its plant tag is cut from a copy in a scratch folder, or put in another
 * form, and this file runs its own part again over that copy. Skipped under ETIUDA_PLANTS=off.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const nodeRequire = createRequire(import.meta.url);
const MODULES = process.env.PROXY_ASK_MODULES || path.join(ROOT, "src", "modules");
const PRELOAD = process.env.PROXY_ASK_PRELOAD || path.join(ROOT, "shell", "preload.js");
const ONLY = process.env.PROXY_ASK_ONLY || "";
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const want = part => !ONLY || ONLY === part;
const PLANTS = [
  ["shell/preload.js", "plant:proxy-ask-clean", "a", "    const ask = q;"],
  ["shell/preload.js", "plant:proxy-answer-strings", "a",
    "  proxyAnswer: (id, username, password) => ipcRenderer.invoke(\"etiuda:proxy-answer\", id, username, password),"],
  ["src/modules/proxy-ask.js", "plant:proxy-ask-empty", "b", null],
  ["src/modules/proxy-ask.js", "plant:proxy-ask-escape", "b", null],
  ["src/modules/proxy-ask.js", "plant:proxy-ask-keyboard", "b", "  try{ user.focus(); }catch(e){}"],
  ["src/modules/proxy-ask.js", "plant:proxy-ask-name-first", "b",
    "  const proxySignIn=()=>answer(String(user.value||\"\").trim(), String(pass.value||\"\"));"],
  /* Put in another form: the same press also hands the password to the storage shim. */
  ["src/modules/proxy-ask.js", "plant:proxy-ask-name-first", "b",
    "  const proxySignIn=()=>{ const name=String(user.value||\"\").trim(), word=String(pass.value||\"\"); import(\"./storage.js\").then(S=>S.lsSet(\"eProxyKept\",word)); answer(name, name ? word : \"\"); };"],
];
/* The floor: every check below runs, or the file says it did not complete. */
const COUNTS = { a: 6, b: 27, p: PLANTS_OFF ? 0 : PLANTS.length };
const EXPECTED = ONLY ? COUNTS[ONLY] : COUNTS.a + COUNTS.b + COUNTS.p;

let ran = 0, failed = 0;
function check(ok, line) {
  ran++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
/* Every line this run writes, so (b) can show no password reached one. */
const OUT = [];
for (const s of [process.stdout, process.stderr]) {
  const w = s.write.bind(s);
  s.write = (c, ...a) => { OUT.push(String(c)); return w(c, ...a); };
}
const tick = () => new Promise(r => setImmediate(r));


/* ---- the preload, over a stand-in ipcRenderer ----------------------------------------------------------------------- */
const ipc = { on: {}, calls: [] };
const ipcRenderer = {
  on: (ch, fn) => { (ipc.on[ch] = ipc.on[ch] || []).push(fn); },
  invoke: (ch, ...args) => { ipc.calls.push({ how: "invoke", ch, args }); return Promise.resolve(ch === "etiuda:proxy-answer"); },
  send: (ch, ...args) => { ipc.calls.push({ how: "send", ch, args }); },
  sendSync: (ch, ...args) => { ipc.calls.push({ how: "sendSync", ch, args }); return ch === "etiuda:host" ? { platform: "win32" } : null; },
};
const shellAsks = v => (ipc.on["etiuda:proxy-ask"] || []).forEach(fn => fn({ sender: {} }, v));
const answers = () => ipc.calls.filter(c => c.ch === "etiuda:proxy-answer").map(c => c.args);
function loadPreload() {
  const world = {};
  const contextBridge = { exposeInMainWorld: (k, v) => { world[k] = v; }, executeInMainWorld: () => {} };
  new Function("require", fs.readFileSync(PRELOAD, "utf8"))(n => (n === "electron" ? { contextBridge, ipcRenderer, webUtils: {} } : nodeRequire(n)));
  return world.E_HOST || null;
}
const KEYS = o => (o && typeof o === "object" ? Object.keys(o).sort().join(",") : String(o));

async function partA() {
  const saved = { on: ipc.on, calls: ipc.calls };
  ipc.on = {}; ipc.calls = [];
  const H = loadPreload();
  check(!!H && typeof H.onProxyAsk === "function" && typeof H.proxyAnswer === "function",
    "a1 the preload's E_HOST carries onProxyAsk and proxyAnswer");
  if (!H || typeof H.onProxyAsk !== "function" || typeof H.proxyAnswer !== "function") {
    for (let i = 0; i < 5; i++) check(false, "a" + (i + 2) + " needs the two members");
    ipc.on = saved.on; ipc.calls = saved.calls;
    return;
  }
  const got = [];
  H.onProxyAsk(q => got.push(q));
  shellAsks({ id: 3, host: "proxy.example.test", port: 8080, again: true, extra: "from the shell", username: "kept" });
  const g = got[0] || {};
  check(got.length === 1 && KEYS(g) === "again,host,id,port" && g.id === 3 && g.host === "proxy.example.test" && g.port === 8080 && g.again === true,
    "a2 the shell's question reaches the page as {id, host, port, again} and nothing else: " + JSON.stringify(g));
  got.length = 0;
  shellAsks({ id: "3", host: { toString: () => "proxy.example.test" }, port: 70000, again: "yes" });
  shellAsks(null);
  shellAsks({ id: -1, host: 7, port: 3.5 });
  check(got.length === 3 && got.every(q => KEYS(q) === "again,host,id,port" && q.id === 0 && q.host === "" && q.port === 0 && q.again === false),
    "a3 a field of the wrong kind arrives as its empty value: " + JSON.stringify(got));
  let threw = false;
  H.onProxyAsk(() => { throw new Error("the page has gone"); });
  try { shellAsks({ id: 4, host: "proxy.example.test", port: 3128, again: false }); } catch { threw = true; }
  check(!threw, "a4 a page that throws on the question does not throw into the shell's channel");
  await H.proxyAnswer(4, "ann.example", "pw-plain");
  const a = answers()[0] || [];
  check(answers().length === 1 && a.length === 3 && a[0] === 4 && a[1] === "ann.example" && a[2] === "pw-plain",
    "a5 the answer leaves on etiuda:proxy-answer as the id and the two strings typed");
  ipc.calls.length = 0;
  await H.proxyAnswer("5", 7, null);
  await H.proxyAnswer(undefined);
  const b = answers();
  check(b.length === 2 && b[0][0] === 5 && b[0][1] === "7" && b[0][2] === "" && b[1][0] === 0 && b[1][1] === "" && b[1][2] === ""
    && b.every(x => typeof x[0] === "number" && typeof x[1] === "string" && typeof x[2] === "string"),
    "a6 an answer always crosses as a number and two strings: " + JSON.stringify(b));
  ipc.on = saved.on; ipc.calls = saved.calls;
}

/* ---- the page: a document small enough to press the bubble's buttons ------------------------------------------------ */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
class TextNode {
  constructor(s) { this.nodeType = 3; this.data = String(s); this.parentNode = null; }
  get textContent() { return this.data; }
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
    this.scrollTop = 0; this.scrollLeft = 0; this.scrollWidth = 0; this.clientWidth = 0; this.scrollHeight = 0;
    const self = this;
    this.classList = {
      contains: c => self._classes().includes(c),
      add: (...cs) => { const s = self._classes(); cs.forEach(c => { if (!s.includes(c)) s.push(c); }); self.setAttribute("class", s.join(" ")); },
      remove: (...cs) => { self.setAttribute("class", self._classes().filter(c => !cs.includes(c)).join(" ")); },
      toggle: (c, on) => { const want = on === undefined ? !self.classList.contains(c) : !!on; if (want) self.classList.add(c); else self.classList.remove(c); return want; },
    };
  }
  _classes() { return String(this.attrs.get("class") || "").split(/\s+/).filter(Boolean); }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get id() { return this.attrs.get("id") || ""; }
  set id(v) { this.setAttribute("id", v); }
  get className() { return this.attrs.get("class") || ""; }
  set className(v) { this.setAttribute("class", v); }
  get hidden() { return this.attrs.has("hidden"); }
  set hidden(v) { if (v) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); }
  get disabled() { return this.attrs.has("disabled"); }
  set disabled(v) { if (v) this.setAttribute("disabled", ""); else this.removeAttribute("disabled"); }
  get value() { return this._value !== undefined ? this._value : (this.attrs.get("value") || ""); }
  set value(v) { this._value = String(v); }
  setAttribute(k, v) { this.attrs.set(String(k).toLowerCase(), String(v)); }
  getAttribute(k) { const v = this.attrs.get(String(k).toLowerCase()); return v === undefined ? null : v; }
  hasAttribute(k) { return this.attrs.has(String(k).toLowerCase()); }
  removeAttribute(k) { this.attrs.delete(String(k).toLowerCase()); }
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
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn); }
  dispatchEvent(ev) { (this.listeners[ev && ev.type] || []).forEach(fn => fn(ev || {})); return true; }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  click() {
    const ev = { type: "click", target: this, preventDefault() {}, stopPropagation() {} };
    if (typeof this.onclick === "function") this.onclick(ev);
  }
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; }
  getContext() { return { font: "", letterSpacing: "", measureText: (t) => ({ width: String(t || "").length * 7 }) }; }
  closest(sel) { let n = this; while (n && n.nodeType === 1) { if (matches(n, sel, null)) return n; n = n.parentNode; } return null; }
  querySelectorAll(sel) { return queryAll(this, sel); }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
}
function serial(n) {
  if (n.nodeType === 3) return n.data;
  const a = [...n.attrs].map(([k, v]) => " " + k + "=\"" + v.replace(/"/g, "&quot;") + "\"").join("");
  return VOID.has(n.localName) ? "<" + n.localName + a + ">" : "<" + n.localName + a + ">" + n.innerHTML + "</" + n.localName + ">";
}
const TAG = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
function decode(s) {
  return String(s).replace(/&(#39|#x27|quot|lt|gt|amp);/gi, (c) => {
    const k = c.toLowerCase();
    if (k === "&#39;" || k === "&#x27;") return "'";
    if (k === "&quot;") return "\"";
    if (k === "&lt;") return "<";
    if (k === "&gt;") return ">";
    return "&";
  });
}
function parseInto(root, html) {
  const stack = [root];
  let at = 0, m;
  const tag = new RegExp(TAG.source, "g");
  while ((m = tag.exec(html))) {
    if (m.index > at) stack[stack.length - 1].appendChild(new TextNode(decode(html.slice(at, m.index))));
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
  if (at < html.length) stack[stack.length - 1].appendChild(new TextNode(decode(html.slice(at))));
}
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
function matches(el, sel, scope) { return String(sel).split(",").some(s => matchOne(el, s.trim(), scope)); }
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
  doc.createRange = () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) });
  doc.documentElement = new El("html", doc);
  doc.head = doc.documentElement.appendChild(new El("head", doc));
  doc.body = doc.documentElement.appendChild(new El("body", doc));
  doc.activeElement = doc.body;
  doc.getElementById = id => queryAll(doc.documentElement, "#" + id)[0] || null;
  doc.querySelector = sel => queryAll(doc.documentElement, sel)[0] || null;
  doc.querySelectorAll = sel => queryAll(doc.documentElement, sel);
  doc.contains = (n) => !!(n && doc.documentElement.contains(n));
  doc.addEventListener = (t, fn) => { (doc.listeners[t] = doc.listeners[t] || []).push(fn); };
  doc.removeEventListener = () => {};
  return doc;
}

/* A key pressed in a field, heard on its way up as the bubble hears it in a browser. */
const key = (el, k) => {
  let stopped = false;
  const ev = { type: "keydown", key: k, target: el, preventDefault() {}, stopPropagation() { stopped = true; } };
  for (let n = el; n && n.nodeType === 1 && !stopped; n = n.parentNode) n.dispatchEvent(ev);
};
const shown = doc => doc.querySelectorAll(".bub-ask");

async function partB() {
  const doc = makeDocument();
  const mem = new Map(), memS = new Map();
  const shelf = m => ({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(String(k), String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } });
  globalThis.document = doc;
  globalThis.window = globalThis;
  globalThis.localStorage = shelf(mem);
  globalThis.sessionStorage = shelf(memS);
  globalThis.innerWidth = 1280; globalThis.innerHeight = 880;
  globalThis.getComputedStyle = () => new Proxy({}, { get: () => "0px" });
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
  globalThis.cancelAnimationFrame = id => clearTimeout(id);
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.E_HOST = loadPreload();
  const mod = n => import(pathToFileURL(path.join(MODULES, n)).href);
  const S = await mod("storage.js");
  S.lsSet("eUiLang", "en");
  const P = await mod("proxy-ask.js");
  check(typeof P.wireProxyAsk === "function", "b1 src/modules/proxy-ask.js exports wireProxyAsk");
  P.wireProxyAsk();
  check((ipc.on["etiuda:proxy-ask"] || []).length === 1, "b2 wireProxyAsk listens on the shell's channel through the preload, once");

  /* One question: the bubble and what it carries. */
  shellAsks({ id: 1, host: "proxy.example.test", port: 8080, again: false });
  const w1 = doc.getElementById("eProxyAsk");
  check(shown(doc).length === 1 && !!w1 && w1.getAttribute("role") === "dialog" && w1.getAttribute("aria-labelledby") === "eProxyTitle"
    && w1.classList.contains("bub") && w1.classList.contains("bub-ask"),
    "b3 a question opens one bubble, a dialog labelled by its title");
  const at = w1 && w1.querySelector(".e-proxy-at");
  check(!!at && at.textContent === "proxy.example.test:8080" && !!at.closest("[data-i18n-skip]"),
    "b4 the proxy's host and port are shown as data, outside the translation sweep: " + (at ? at.textContent : "none"));
  const u1 = w1 && w1.querySelector("#eProxyUser"), p1 = w1 && w1.querySelector("#eProxyPass");
  check(!!u1 && u1.getAttribute("type") === "text" && u1.getAttribute("autocomplete") === "off" && u1.getAttribute("spellcheck") === "false",
    "b5 the user name field: text, autocomplete off, spellcheck off");
  check(!!p1 && p1.getAttribute("type") === "password" && p1.getAttribute("autocomplete") === "off",
    "b6 the password field: password, autocomplete off");
  const title = w1 && w1.querySelector("#eProxyTitle");
  const buttons = w1 ? w1.querySelectorAll("button").map(b => b.textContent) : [];
  check(!!title && title.textContent === "The network proxy asks for a sign-in" && buttons.join("|") === "Not now|Sign in"
    && w1.querySelectorAll("p").length === 1,
    "b7 the title, Not now and Sign in, and no line about an earlier answer: " + buttons.join("|"));
  check(doc.activeElement === u1, "b8 with no field in use, the keyboard goes to the user name");

  /* The same question sent again on a page load, and a second one behind it. */
  shellAsks({ id: 1, host: "proxy.example.test", port: 8080, again: false });
  shellAsks({ id: 2, host: "proxy.example.test", port: 8080, again: true });
  check(shown(doc).length === 1 && doc.getElementById("eProxyAsk") === w1 && answers().length === 0,
    "b9 a question already shown replaces nothing, and a second one waits");

  /* Sign in: what was typed, once, and the fields emptied. */
  u1.value = "ann.example"; p1.value = "pw-SECRET-1";
  w1.querySelector("#eProxyYes").click();
  await tick();
  let got = answers();
  check(got.length === 1 && got[0][0] === 1 && got[0][1] === "ann.example" && got[0][2] === "pw-SECRET-1",
    "b10 Sign in answers question 1 with the user name and the password typed");
  check(u1.value === "" && p1.value === "", "b11 both fields are emptied as the bubble closes");
  check(!w1.isConnected && !doc.documentElement.contains(w1), "b12 the answered bubble leaves");
  const w2 = doc.getElementById("eProxyAsk");
  check(shown(doc).length === 1 && !!w2 && w2 !== w1, "b13 the waiting question opens next");
  const again = w2 ? w2.querySelectorAll("p").map(p => p.textContent) : [];
  check(again.length === 2 && again[1] === "The proxy asked again, so the user name or password may need another look.",
    "b14 a question asked again says so");

  /* Escape: Not now, whatever was typed. */
  const u2 = w2.querySelector("#eProxyUser"), p2 = w2.querySelector("#eProxyPass");
  u2.value = "ann.example"; p2.value = "pw-SECRET-2";
  key(u2, "Escape");
  await tick();
  got = answers();
  check(got.length === 2 && got[1][0] === 2 && got[1][1] === "" && got[1][2] === "", "b15 Escape answers Not now, carrying nothing typed");
  check(u2.value === "" && p2.value === "", "b16 and empties both fields");
  check(shown(doc).length === 0 && doc.getElementById("eProxyAsk") === null, "b17 with no question left, no bubble stands");

  /* Sign in with no user name counts as Not now. */
  shellAsks({ id: 3, host: "proxy.example.test", port: 3128, again: false });
  const w3 = doc.getElementById("eProxyAsk");
  const u3 = w3 && w3.querySelector("#eProxyUser"), p3 = w3 && w3.querySelector("#eProxyPass");
  if (u3 && p3) { u3.value = "   "; p3.value = "pw-SECRET-3"; w3.querySelector("#eProxyYes").click(); }
  await tick();
  got = answers();
  check(got.length === 3 && got[2][0] === 3 && got[2][1] === "" && got[2][2] === "" && !!p3 && p3.value === "",
    "b18 Sign in with an empty user name is Not now, and the password goes nowhere");

  /* Not now, pressed. */
  shellAsks({ id: 4, host: "proxy.example.test", port: 3128, again: false });
  const w4 = doc.getElementById("eProxyAsk");
  const u4 = w4 && w4.querySelector("#eProxyUser"), p4 = w4 && w4.querySelector("#eProxyPass");
  if (u4 && p4) { u4.value = "ann.example"; p4.value = "pw-SECRET-4"; w4.querySelector("#eProxyNo").click(); }
  await tick();
  got = answers();
  check(got.length === 4 && got[3][0] === 4 && got[3][1] === "" && got[3][2] === "" && !!p4 && p4.value === "" && u4.value === "",
    "b19 Not now answers with an empty user name and empties both fields");

  /* Enter in the password field signs in; Enter on a button is the button's own. */
  shellAsks({ id: 5, host: "proxy.example.test", port: 3128, again: false });
  const w5 = doc.getElementById("eProxyAsk");
  const u5 = w5 && w5.querySelector("#eProxyUser"), p5 = w5 && w5.querySelector("#eProxyPass");
  if (u5 && p5) { u5.value = " ann.example "; p5.value = " pw-SECRET-5 "; key(w5.querySelector("#eProxyNo"), "Enter"); }
  await tick();
  check(answers().length === 4 && shown(doc).length === 1, "b20 Enter on a button answers nothing by itself");
  if (p5) key(p5, "Enter");
  await tick();
  got = answers();
  check(got.length === 5 && got[4][0] === 5 && got[4][1] === "ann.example" && got[4][2] === " pw-SECRET-5 ",
    "b21 Enter in the password field signs in: the user name trimmed, the password exactly as typed");

  /* A question arriving while a field is in use leaves the keyboard there. */
  const elsewhere = doc.body.appendChild(doc.createElement("input"));
  elsewhere.focus();
  shellAsks({ id: 6, host: "proxy.example.test", port: 3128, again: false });
  const w6 = doc.getElementById("eProxyAsk");
  check(!!w6 && doc.activeElement === elsewhere, "b22 a question arriving while a field is in use leaves the keyboard in that field");
  if (w6) w6.querySelector("#eProxyNo").click();
  await tick();

  /* The Polish words, the host untouched. */
  S.lsSet("eUiLang", "pl");
  shellAsks({ id: 7, host: "proxy.example.test", port: 8080, again: true });
  const w7 = doc.getElementById("eProxyAsk");
  const words = w7 ? [w7.querySelector("#eProxyTitle").textContent, ...w7.querySelectorAll("p").map(p => p.textContent),
    w7.querySelector("#eProxyUser").getAttribute("placeholder"), w7.querySelector("#eProxyPass").getAttribute("aria-label"),
    ...w7.querySelectorAll("button").map(b => b.textContent)] : [];
  check(words.length === 7 && words[0] === "Serwer proxy w sieci prosi o zalogowanie" && words[1] === "proxy.example.test:8080"
    && /^Serwer proxy zapytał ponownie/.test(words[2]) && words[3] === "Nazwa użytkownika" && words[4] === "Hasło"
    && words[5] === "Nie teraz" && words[6] === "Zaloguj się",
    "b23 in Polish every word is Polish and the host is as the shell sent it: " + words.join(" | "));
  if (w7) key(w7.querySelector("#eProxyUser"), "Escape");
  await tick();
  S.lsSet("eUiLang", "en");

  /* Nothing typed went anywhere but the answers above. */
  await new Promise(r => setTimeout(r, 60));
  const secrets = [1, 2, 3, 4, 5].map(n => "pw-SECRET-" + n);
  const holds = s => secrets.some(x => String(s).indexOf(x) >= 0);
  const stored = [...mem.values(), ...memS.values(), ...mem.keys(), ...memS.keys()];
  const desk = [];
  for (const k of ["eProxyKept"]) { const v = S.lsGet(k); if (v != null) desk.push(v); }
  check(!stored.some(holds) && !desk.some(holds), "b24 no store holds a password: " + (stored.length + desk.length) + " stored value(s) read");
  const others = ipc.calls.filter(c => c.ch !== "etiuda:proxy-answer");
  check(others.length > 0 && !others.some(c => holds(JSON.stringify(c.args))),
    "b25 no other call to the shell carries a password: " + others.length + " call(s) read, the desk's writes among them");
  const allowed = new Set([1, 5]);
  check(answers().every((a, i) => !holds(a[2]) || allowed.has(a[0])) && !OUT.some(holds),
    "b26 a password left only in the answers to Sign in, and in no line this run wrote");
  const src = fs.readFileSync(path.join(MODULES, "proxy-ask.js"), "utf8");
  const named = ["lsSet", "ssSet", "localStorage", "sessionStorage", "console", "indexedDB"].filter(n => new RegExp("\\b" + n + "\\b").test(src));
  check(named.length === 0, "b27 the module names no store and no log: " + (named.join(", ") || "none"));
}

/* ---- the plants: each guard cut from a copy in a scratch folder, its own part run there, and red expected ------------ */
async function partP() {
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-proxy-ask-"));
  try {
    const mods = path.join(lab, "modules");
    fs.cpSync(path.join(ROOT, "src", "modules"), mods, { recursive: true });
    const pre = path.join(lab, "preload.js");
    for (const [file, mark, part, form] of PLANTS) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      const lines = text.split("\n"), hit = lines.filter(l => l.indexOf(mark) >= 0).length;
      const planted = lines.flatMap(l => (l.indexOf(mark) < 0 ? [l] : form == null ? [] : [form])).join("\n");
      const into = file === "shell/preload.js" ? pre : path.join(mods, "proxy-ask.js");
      fs.copyFileSync(path.join(ROOT, "shell", "preload.js"), pre);
      fs.copyFileSync(path.join(ROOT, "src", "modules", "proxy-ask.js"), path.join(mods, "proxy-ask.js"));
      fs.writeFileSync(into, planted);
      const env = Object.assign({}, process.env, { PROXY_ASK_ONLY: part, PROXY_ASK_MODULES: mods, PROXY_ASK_PRELOAD: pre });
      const r = spawnSync(process.execPath, [SELF], { env, encoding: "utf8", timeout: 60000 });
      const reds = (String(r.stdout).match(/^ {2}FAIL /mg) || []).length;
      check(hit === 1 && r.status !== 0 && reds > 0,
        "p " + (form == null ? "lifting " : "turning ") + mark + " (" + hit + " line) turns " + part + " red: " + reds + " red");
    }
  } finally { fs.rmSync(lab, { recursive: true, force: true }); }
}

if (want("a")) { try { await partA(); } catch (e) { check(false, "a threw: " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")); } }
if (want("b")) { try { await partB(); } catch (e) { check(false, "b threw: " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")); } }
if (!ONLY && !PLANTS_OFF) { try { await partP(); } catch (e) { check(false, "p threw: " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")); } }
else if (!ONLY) console.log("  SKIP  p: ETIUDA_PLANTS=off");
if (!ONLY) console.log((failed === 0 && ran === EXPECTED ? "proxy-ask: ok" : "proxy-ask: FAIL") + ", ran " + ran + " of " + EXPECTED + ", red " + failed);
process.exit(Math.min(63, failed + (ran === EXPECTED ? 0 : 1)));
