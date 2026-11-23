/* Reset Etiuda on Maintenance, and the uninstaller's Remove my data.
 *
 *   node tests/desk-reset.mjs
 *
 * The Maintenance row opens a confirm that names what goes and what stays, says there is
 * no Undo, and keeps the press disabled until RESET is typed. The shell's reset, on a
 * stand-in folder, removes everything but the licence files, refuses a path outside the
 * desk's own folders, and leaves the shape a first run reads. The uninstaller script
 * carries the checkbox off by default, and /KEEP_APP_DATA or --updated never removes data.
 * Each plant is lifted in a scratch copy, never in the tree, and that copy must go the
 * wrong way. ETIUDA_PLANTS=off skips the lifts.
 *
 * Exit code is the number of failed checks, capped at 63.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD = (n) => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const PLANTS = process.env.ETIUDA_PLANTS !== "off";

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) {
  skipped++;
  console.log("  SKIP " + line);
}

const GOES = "Reset removes every catalog file in Etiuda's own folder, the team, the agent's name, settings, open conversations and every local change. Catalog files in any other folder stay, and so does the licence.";
const WARN = "There is no Undo. Joining the team again takes a new invitation from its lead.";
const ASK = "Type RESET to confirm.";
const ROW = "Returns this desk to a fresh install, keeping only the licence.";
const AGAIN = "Etiuda is starting again as freshly installed.";
const BOX_EN = "Remove my data";
const LINE_EN = "Also removes Etiuda's data on this computer: settings, conversations, the licence, own cards and stars, and this desk's place on its team, so a sealed catalog opens again only after a new invitation from the team's lead. The catalog files stay.";
const BOX_PL = "Usuń także dane z tego komputera";
const LINE_PL = "Usuwa również dane Etiudy z tego komputera: ustawienia, rozmowy, licencję, własne karty i gwiazdki oraz miejsce tego stanowiska w zespole, więc zapieczętowany katalog otworzy się dopiero po nowym zaproszeniu od lidera zespołu. Pliki katalogów zostają.";
const UNFINISHED = "The reset of Etiuda did not finish. Could not be removed, perhaps in use by another program or an open folder: {PATH}.";
const UNFINISHED_NEXT = "Trying again finishes it once they are closed; stopping it keeps this desk as it is now.";
const TRY_AGAIN = "Try again";
const STOP_RESET = "Stop the reset";
const UNFINISHED_PL = {
  [UNFINISHED]: "Reset Etiudy nie został dokończony. Nie udało się usunąć elementów, których być może używa inny program albo otwarty folder: {PATH}.",
  [UNFINISHED_NEXT]: "Ponowna próba dokończy reset po ich zamknięciu; przerwanie zostawi stanowisko w obecnym stanie.",
  [TRY_AGAIN]: "Spróbuj ponownie",
  [STOP_RESET]: "Przerwij reset"
};
const PL = {
  "Returns this desk to a fresh install, keeping only the licence.": "Przywraca stanowisko do stanu po świeżej instalacji; zostaje tylko licencja.",
  "Reset Etiuda?": "Zresetować Etiudę?",
  [GOES]: "Reset usuwa każdy plik katalogu z własnego folderu Etiudy, zespół, imię agenta, ustawienia, otwarte rozmowy i wszystkie zmiany lokalne. Pliki katalogów w każdym innym folderze zostają, podobnie jak licencja.",
  [WARN]: "Tego nie da się cofnąć. Ponowne dołączenie do zespołu wymaga nowego zaproszenia od lidera.",
  [ASK]: "Do potwierdzenia trzeba wpisać RESET.",
  [AGAIN]: "Etiuda uruchamia się ponownie jak po świeżej instalacji."
};

/* A page small enough to press the buttons Maintenance renders. */
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

function typeInto(el, text) {
  el.value = text;
  el.dispatchEvent({ type: "input", target: el });
}

async function uiLeg() {
  const doc = makeDocument();
  const mem = new Map();
  const store = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(String(k), String(v)), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
  /* Nothing stored follows the Windows display language. This leg asserts the English copy. */
  store.setItem("eUiLang", "en");
  globalThis.document = doc;
  globalThis.window = globalThis;
  globalThis.localStorage = store;
  globalThis.sessionStorage = store;
  globalThis.innerWidth = 1280; globalThis.innerHeight = 880;
  globalThis.getComputedStyle = () => new Proxy({}, { get: () => "0px" });
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
  globalThis.cancelAnimationFrame = id => clearTimeout(id);
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  let resets = 0;
  globalThis.E_HOST = { resetDesk: () => { resets++; return Promise.resolve({ ok: true }); } };
  doc.body.innerHTML = '<div id="screenHost" hidden></div><div id="list"></div><input id="pax"><input id="intent">'
    + '<select id="roleSel"></select><div id="seg"></div><div id="pills"></div>'
    + '<div id="modal" hidden><div id="modalCard"></div></div><div id="toast"></div>';
  let opened = false;
  try {
    const H = await import(MOD("hooks.js"));
    const Dom = await import(MOD("dom.js"));
    const slotSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "hooks.js"), "utf8");
    const slots = [...slotSrc.match(/const SLOTS = \[([\s\S]*?)\];/)[1].matchAll(/"(\w+)"/g)].map(m => m[1]);
    slots.forEach(k => { H.hooks[k] = () => {}; });
    Dom.grabDom();
    await import(MOD("maintenance.js"));
    const ST = await import(MOD("screen-tabs.js"));
    ST.openScreenTab("maintenance");
    opened = true;
    const host = doc.getElementById("screenHost");
    const row = host && host.querySelector("#mtReset");
    const storage = host && host.querySelector('[data-mt="storage"]');
    if (storage) storage.click();
    const page = host && host.querySelector(".sx.lm-mt");
    const text = host ? host.textContent : "";
    const sheet = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
    const pageSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "maintenance.js"), "utf8");
    check(!!row && text.indexOf(ROW) >= 0 && page && page.getAttribute("data-page") === "storage",
      "4d1 Maintenance's Storage page has Reset Etiuda and the fresh-install line: " + (row ? "row" : "no row"));
    check(/\.sx\.lm-mt:not\(\[data-page="storage"\]\) \.mt-reset\{display:none\}/.test(sheet),
      "4d1 the row is hidden off the Storage page");
    check(!/\b(unlink|rmSync|writeFileSync|rmdir)\b/.test(pageSrc),
      "4d1 the page does not delete; the shell does");
    if (row) row.click();
    const card = doc.getElementById("eResetAsk");
    const said = card ? card.textContent : "";
    const go = doc.getElementById("mtResetGo");
    const word = doc.getElementById("mtResetWord");
    check(said.indexOf("Reset Etiuda?") >= 0 && said.indexOf(GOES) >= 0 && said.indexOf(WARN) >= 0 && said.indexOf(ASK) >= 0
      && !(card && card.querySelector("#eUndoBtn")),
      "4d2 the confirm names what goes and what stays, says there is no Undo, and offers no way back");
    const lang = fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8");
    const plOk = Object.keys(PL).every(en => lang.indexOf(JSON.stringify(en) + ":" + JSON.stringify(PL[en])) >= 0);
    check(plOk, "4d2 the Polish is the copywriter's, both languages");
    check(!!go && go.disabled === true, "4d3 the press starts disabled");
    if (word && go) {
      typeInto(word, "no");
      check(go.disabled === true, "4d3 a wrong word leaves the press disabled");
      const before = resets;
      go.click();
      check(resets === before, "4d3 a disabled press does not ask the shell (" + resets + ")");
      typeInto(word, " reset ");
      check(go.disabled === false, "4d3 RESET in any case, with space around it, enables the press");
      typeInto(word, "RESET!");
      check(go.disabled === true, "4d3 anything but the word disables it again");
      typeInto(word, "ReSeT");
      go.click();
      await new Promise(r => setImmediate(r));
      const toast = doc.getElementById("toast");
      check(resets === before + 1 && toast && toast.textContent.indexOf(AGAIN) >= 0,
        "4d3 the enabled press asks the shell once and says the desk is starting again (" + resets + ")");
    } else check(false, "4d3 the confirm has no word field or press");
  } catch (e) {
    const why = e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : String(e);
    if (!opened) check(false, "Maintenance did not open: " + why);
    else check(false, "the confirm threw: " + why);
  }
}

function bytes(p) { return fs.readFileSync(p); }
function write(p, s) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); }
function gone(p) { try { fs.lstatSync(p); return false; } catch (e) { return e.code === "ENOENT"; } }

function shellLeg(mod) {
  if (!mod || typeof mod.commitReset !== "function") {
    check(false, "shell/desk-reset.cjs is not there to keep the licence");
    check(false, "a path outside the desk's folders is not refused, because the reset is not there");
    check(false, "the next start has no marker to honour");
    return;
  }
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-reset-"));
  const licence = Buffer.from("licence-bytes-stay\n");
  const revoked = Buffer.from("{\"revoked\":false}\n");
  try {
    const user = path.join(lab, "user");
    const docs = path.join(lab, "Documents", "Etiuda");
    const chosen = path.join(lab, "chosen");
    const outside = path.join(lab, "outside");
    fs.mkdirSync(user, { recursive: true });
    write(path.join(user, "desk.json"), "{\"keys\":{\"eCatalogFolder\":\"\"}}");
    write(path.join(user, "desk.bak1.json"), "{\"keys\":{}}");
    write(path.join(user, "desk.bak2.json"), "{\"keys\":{}}");
    write(path.join(user, "tabs.json"), "{\"tabs\":[1]}");
    write(path.join(user, "window.json"), "{}");
    write(path.join(user, "etiuda-license.js"), licence);
    write(path.join(user, "etiuda-revoked.json"), revoked);
    write(path.join(user, "Local Storage", "leveldb", "x"), "chrome");
    write(path.join(docs, "shop.ec"), "catalog");
    write(path.join(docs, "etiuda-ring.json"), "ring");
    write(path.join(docs, "etiuda-team.json"), "team");
    write(path.join(docs, "notes.txt"), "leave me");
    write(path.join(docs, "keep", "photo.txt"), "leave me too");
    write(path.join(chosen, "shop.ec"), "not ours");
    write(path.join(outside, "secret.txt"), "secret");
    let linked = false;
    try {
      fs.symlinkSync(outside, path.join(user, "leak"), "junction");
      linked = true;
    } catch (e) { linked = false; }

    const opts = { userData: user, catalogSetting: "", defaultCatalog: docs };
    const done = mod.commitReset(opts);
    check(done.ok === true && gone(path.join(user, "desk.json")) && gone(path.join(user, "desk.bak1.json"))
      && gone(path.join(user, "tabs.json")) && gone(path.join(user, "window.json"))
      && gone(path.join(user, "Local Storage"))
      && bytes(path.join(user, "etiuda-license.js")).equals(licence)
      && bytes(path.join(user, "etiuda-revoked.json")).equals(revoked)
      && mod.wouldStartNew(user) === true,
      "4d4 the stand-in loses the desk, the tabs and the window, keeps both licence files byte for byte, and would start as a first run");
    check(gone(path.join(docs, "shop.ec")) && gone(path.join(docs, "etiuda-team.json")) && gone(path.join(docs, "etiuda-ring.json"))
      && fs.readFileSync(path.join(docs, "notes.txt"), "utf8") === "leave me"
      && fs.readFileSync(path.join(docs, "keep", "photo.txt"), "utf8") === "leave me too",
      "4d5 the desk's own catalog folder loses only its desk files");
    const again = fs.mkdtempSync(path.join(lab, "user-chosen-"));
    write(path.join(again, "desk.json"), "{}");
    write(path.join(again, "etiuda-license.js"), licence);
    const kept = mod.commitReset({ userData: again, catalogSetting: chosen, defaultCatalog: docs });
    check(kept.ok === true && gone(path.join(again, "desk.json")) && fs.readFileSync(path.join(chosen, "shop.ec"), "utf8") === "not ours",
      "4d5 a folder the user chose is left entirely, catalog file included");
    if (linked) check(gone(path.join(user, "leak")) && fs.readFileSync(path.join(outside, "secret.txt"), "utf8") === "secret",
      "4d5 a link inside the desk is removed and the folder it pointed at stays");
    else skip("4d5 a link could not be made here, so that case was not run");

    const held = path.join(lab, "held");
    fs.mkdirSync(held, { recursive: true });
    write(path.join(held, "desk.json"), "stay");
    write(path.join(held, "etiuda-license.js"), licence);
    const refused = mod.applyReset({ ok: true, roots: [held], userData: held, remove: [path.join(held, "desk.json"), path.join(outside, "secret.txt")], keep: [] });
    check(refused.ok === false && refused.changed === false && fs.readFileSync(path.join(held, "desk.json"), "utf8") === "stay"
      && fs.readFileSync(path.join(outside, "secret.txt"), "utf8") === "secret",
      "4d5 a path outside the desk's folders is refused and nothing changes");

    const marked = path.join(lab, "marked");
    fs.mkdirSync(marked, { recursive: true });
    write(path.join(marked, "desk.json"), "go");
    write(path.join(marked, "tabs.json"), "go");
    write(path.join(marked, "etiuda-license.js"), licence);
    const staged = mod.stageReset({ userData: marked, catalogSetting: chosen, defaultCatalog: docs });
    check(staged.ok === true && fs.existsSync(path.join(marked, "desk.json")) && fs.existsSync(path.join(marked, mod.MARKER_NAME)),
      "4d6 staging writes the marker and deletes nothing while this copy is still running");
    const honoured = mod.honourPendingReset({ userData: marked, holdsLock: true });
    check(honoured.ok === true && gone(path.join(marked, "desk.json")) && gone(path.join(marked, "tabs.json"))
      && gone(path.join(marked, mod.MARKER_NAME)) && bytes(path.join(marked, "etiuda-license.js")).equals(licence)
      && mod.wouldStartNew(marked) === true && fs.readFileSync(path.join(chosen, "shop.ec"), "utf8") === "not ours",
      "4d6 the next start honours the marker, keeps the licence, and leaves a chosen folder alone");
    const bad = path.join(lab, "bad-marker");
    fs.mkdirSync(bad, { recursive: true });
    write(path.join(bad, "desk.json"), "stay");
    write(path.join(bad, mod.MARKER_NAME), "{not json");
    const badHonour = mod.honourPendingReset({ userData: bad, holdsLock: true });
    check(badHonour.changed === false && fs.readFileSync(path.join(bad, "desk.json"), "utf8") === "stay" && gone(path.join(bad, mod.MARKER_NAME)),
      "4d6 a marker that will not parse changes nothing else");
  } finally {
    fs.rmSync(lab, { recursive: true, force: true });
  }

  const main = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
  const pre = fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8");
  const honourAt = main.indexOf("honourPendingReset(");
  const lockAt = main.indexOf("app.requestSingleInstanceLock(");
  const between = lockAt >= 0 && honourAt > lockAt ? main.slice(lockAt, honourAt) : "";
  const call = honourAt >= 0 ? main.slice(honourAt, honourAt + 160) : "";
  check(lockAt > 0 && honourAt > lockAt && between.indexOf("!theOnlyOne") >= 0 && between.indexOf("app.quit()") >= 0
    && call.indexOf("holdsLock: true") >= 0,
    "4d6 the shell takes the single-instance lock, and only the process that holds it honours a pending reset");
  check(/ipcMain\.handle\(\s*"etiuda:desk-reset"[\s\S]{0,400}fromEngine\(/.test(main) && /resetDesk:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(\s*"etiuda:desk-reset"\s*\)/.test(pre),
    "4d6 the page asks the shell, and the shell answers only its own engine");
  lockLeg(mod);
}

const LOCK_NAMES = ["lockfile", "SingletonLock", "SingletonCookie", "SingletonSocket"];

function markerBody(dir) {
  return JSON.stringify({ v: 1, userData: dir, catalogSetting: "", defaultCatalog: "", attempts: 0 });
}

/* A process that does not hold the lock, a file that will not unlink, a marker
   already tried, and the lock's own names. */
function lockLeg(mod) {
  if (!mod || typeof mod.honourPendingReset !== "function") {
    check(false, "4d9 the reset is not there to leave a marker");
    return;
  }
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-reset-lock-"));
  const nodeFs = require("node:fs");
  const origUnlink = nodeFs.unlinkSync;
  try {
    const quiet = path.join(lab, "quiet");
    fs.mkdirSync(quiet);
    write(path.join(quiet, "desk.json"), "stay");
    write(path.join(quiet, mod.MARKER_NAME), markerBody(quiet));
    const untouched = mod.honourPendingReset({ userData: quiet });
    check(untouched && untouched.changed === false
      && fs.readFileSync(path.join(quiet, "desk.json"), "utf8") === "stay"
      && fs.readFileSync(path.join(quiet, mod.MARKER_NAME), "utf8") === markerBody(quiet),
      "4d9 a process without the lock leaves the marker and every file");

    const busy = path.join(lab, "busy");
    fs.mkdirSync(busy);
    write(path.join(busy, "desk.json"), "stay");
    write(path.join(busy, mod.MARKER_NAME), markerBody(busy));
    nodeFs.unlinkSync = function () {
      const err = new Error("busy");
      err.code = "EBUSY";
      throw err;
    };
    let first = null;
    try { first = mod.honourPendingReset({ userData: busy, holdsLock: true }); }
    finally { nodeFs.unlinkSync = origUnlink; }
    check(!!first && first.ok === false && first.changed === false
      && fs.readFileSync(path.join(busy, "desk.json"), "utf8") === "stay"
      && fs.existsSync(path.join(busy, mod.MARKER_NAME)),
      "4d9 a busy file on the first pass leaves the marker");
    mod.retryPendingReset({ userData: busy, holdsLock: true });
    const second = mod.honourPendingReset({ userData: busy, holdsLock: true });
    check(!!second && second.ok === true && gone(path.join(busy, "desk.json"))
      && gone(path.join(busy, mod.MARKER_NAME)),
      "4d9 the next pass with the file free finishes and drops the marker");

    const old = path.join(lab, "old");
    fs.mkdirSync(old);
    write(path.join(old, "desk.json"), "go");
    const oldBody = JSON.stringify({ v: 1, userData: old, catalogSetting: "", defaultCatalog: "", attempts: 4 });
    write(path.join(old, mod.MARKER_NAME), oldBody);
    const again = mod.honourPendingReset({ userData: old, holdsLock: true });
    check(!!again && again.ok === true && gone(path.join(old, "desk.json"))
      && gone(path.join(old, mod.MARKER_NAME)),
      "4d9 a marker that has already been tried still finishes when the files are free");

    const held = path.join(lab, "held");
    fs.mkdirSync(held);
    write(path.join(held, "desk.json"), "go");
    write(path.join(held, "etiuda-license.js"), "lic");
    LOCK_NAMES.forEach(name => write(path.join(held, name), name));
    write(path.join(held, mod.MARKER_NAME), markerBody(held));
    const kept = mod.honourPendingReset({ userData: held, holdsLock: true });
    const namesLeft = LOCK_NAMES.every(name => {
      try { return fs.readFileSync(path.join(held, name), "utf8") === name; }
      catch (e) { return false; }
    });
    const listed = Array.isArray(mod.LOCK_FILES) && mod.LOCK_FILES.length === LOCK_NAMES.length
      && LOCK_NAMES.every(name => mod.LOCK_FILES.indexOf(name) >= 0);
    check(listed && !!kept && kept.ok === true && gone(path.join(held, "desk.json"))
      && gone(path.join(held, mod.MARKER_NAME))
      && fs.readFileSync(path.join(held, "etiuda-license.js"), "utf8") === "lic"
      && namesLeft && mod.wouldStartNew(held) === true,
      "4d9 the lock's own files stay, with the licence, and the desk would start as a first run");
  } finally {
    nodeFs.unlinkSync = origUnlink;
    fs.rmSync(lab, { recursive: true, force: true });
  }
}

function lift(text, tag) {
  const lines = text.split(/\n/);
  const at = lines.findIndex(l => l.indexOf(tag) >= 0);
  if (at < 0) return null;
  lines.splice(at, 1);
  return lines.join("\n");
}
function macroBody(text, name) {
  const m = new RegExp("!macro " + name + "\\r?\\n([\\s\\S]*?)\\n!macroend").exec(text);
  return m ? m[1] : "";
}
function updateGuardHolds(text) {
  const body = macroBody(text, "customUnInstall");
  const plant = body.indexOf("plant:update-keeps-data");
  const data = body.indexOf("$APPDATA");
  if (plant < 0 || data < 0 || plant > data) return false;
  if (body.indexOf("/KEEP_APP_DATA") < 0 || body.indexOf("--updated") < 0) return false;
  if (body.indexOf("/KEEP_APP_DATA") > data || body.indexOf("--updated") > data) return false;
  return true;
}
function boxOff(text) {
  const page = macroBody(text, "customUnWelcomePage");
  const init = macroBody(text, "customUnInit");
  if (!/NSD_CreateCheckbox/.test(page)) return false;
  const createAt = page.indexOf("NSD_CreateCheckbox");
  const showAt = page.indexOf("nsDialogs::Show");
  const between = page.slice(createAt, showAt < 0 ? page.length : showAt);
  if (/BST_CHECKED/.test(between)) return false;
  return /StrCpy \$RemoveMyData "0"/.test(init);
}
/* The desk keeps its own Remove my data step. OWN_UNINSTALL_DATA_STEP is Studio's switch (it has a step of its own); the
   desk's script never defines it, and the step's lines stand only inside its !ifndef, so the desk's build emits them. */
function deskKeepsDataStep(text) {
  const t = String(text || "");
  if (/^[ \t]*!define[ \t]+OWN_UNINSTALL_DATA_STEP\b/m.test(t)) return false;
  const at = t.search(/^[ \t]*!ifndef[ \t]+OWN_UNINSTALL_DATA_STEP\b/m);
  const use = t.search(/^[ \t]*\$\{If\} \$RemoveMyData == "1"/m);
  return at > -1 && use > at;
}
/* makensis treats warning 6010 (an unreferenced function) as an error here, so un.ClearDeskFolder, which only the
   licence-keeping branch calls, is compiled only where that branch is: under !ifndef ETIUDA_REMOVE_LICENCE_WITH_DATA. */
function clearDeskOnlyWhenCalled(text) {
  const t = String(text || "");
  const fn = t.search(/^[ \t]*Function un\.ClearDeskFolder\b/m);
  if (fn < 0) return true;
  const head = t.slice(0, fn).split(/\r?\n/).filter(l => /^[ \t]*!(if|endif)/.test(l));
  let open = null, depth = 0;
  for (const l of head) {
    if (/^[ \t]*!if/.test(l)) { depth++; if (/!ifndef[ \t]+ETIUDA_REMOVE_LICENCE_WITH_DATA\b/.test(l)) open = depth; }
    else { if (open === depth) open = null; depth--; }
  }
  return open !== null;
}
/* The uninstaller's variables are declared only in its pass: the installer pass never reads them, and makensis's warning
   6001 for an unused variable fails the package. */
function unVarsOnlyUninstaller(text) {
  const t = String(text || "");
  return ["RemoveMyData", "RemoveDataBox"].every(name => {
    const at = t.search(new RegExp("^Var " + name + "\\b", "m"));
    if (at < 0) return false;
    const lines = t.slice(0, at).split(/\r?\n/).filter(l => /^[ \t]*!(if|endif)/.test(l));
    let open = null, depth = 0;
    for (const l of lines) {
      if (/^[ \t]*!if/.test(l)) { depth++; if (/^[ \t]*!ifdef[ \t]+BUILD_UNINSTALLER\b/.test(l)) open = depth; }
      else { if (open === depth) open = null; depth--; }
    }
    return open !== null;
  });
}
function licenceDefine(text) {
  return /^[ \t]*!define ETIUDA_REMOVE_LICENCE_WITH_DATA\b.*plant:uninstall-licence-goes/m.test(text);
}

function installLeg(decision) {
  let nsh = "";
  try { nsh = fs.readFileSync(path.join(ROOT, "shell", "installer.nsh"), "utf8"); } catch (e) { nsh = ""; }
  check(nsh.indexOf(BOX_EN) >= 0 && nsh.indexOf(LINE_EN) >= 0 && nsh.indexOf(BOX_PL) >= 0 && nsh.indexOf(LINE_PL) >= 0 && boxOff(nsh),
    "4d7 the checkbox is off by default and carries the copywriter's line in both languages");
  check(unVarsOnlyUninstaller(nsh) && !unVarsOnlyUninstaller(nsh.replace(/^!ifdef BUILD_UNINSTALLER\r?\n(Var RemoveMyData)/m, "$1")),
    "4d13 Var RemoveMyData and Var RemoveDataBox are declared only under !ifdef BUILD_UNINSTALLER, so the installer pass leaves makensis no unused variable (warning 6001 fails the package)");
  check(clearDeskOnlyWhenCalled(nsh) && !clearDeskOnlyWhenCalled(nsh.replace(/^([ \t]*)!ifndef ETIUDA_REMOVE_LICENCE_WITH_DATA\r?\n([ \t]*Function un\.ClearDeskFolder)/m, "$2")),
    "4d12 un.ClearDeskFolder is compiled only under !ifndef ETIUDA_REMOVE_LICENCE_WITH_DATA, so the licence switch leaves makensis no unreferenced function (warning 6010 fails the package)");
  check(deskKeepsDataStep(nsh) && !deskKeepsDataStep(nsh.replace(/^(!macro customUnInstall)/m, "!define OWN_UNINSTALL_DATA_STEP\n$1")),
    "4d11 the desk's script never defines OWN_UNINSTALL_DATA_STEP, so its own Remove my data step is emitted, and a define of it reads red");
  if (typeof decision !== "function") {
    check(false, "4d14 install-plan has no uninstallDataDecision, so the update path is unjudged");
    return;
  }
  const quiet = decision({ args: ["/S", "/currentuser"], box: false, removeLicence: true });
  const ticked = decision({ args: ["/S", "/currentuser"], box: true, removeLicence: true });
  const keep = decision({ args: ["/S", "/KEEP_APP_DATA", "/currentuser", "--updated"], box: true, removeLicence: true });
  const updated = decision({ args: ["/S", "--updated"], box: true, removeLicence: true });
  const flag = decision({ args: "/S /KEEP_APP_DATA /currentuser --updated _?=C:\\Etiuda", box: true, removeLicence: true });
  const keptLicence = decision({ args: ["/S"], box: true, removeLicence: false });
  check(quiet.remove === false && ticked.remove === true && ticked.licence === true
    && keep.remove === false && updated.remove === false && flag.remove === false
    && keptLicence.remove === true && keptLicence.licence === false,
    "4d15 unticked keeps today's behaviour, a ticked box removes data, and /KEEP_APP_DATA or --updated never does");
  check(licenceDefine(nsh) && updateGuardHolds(nsh),
    "4d16 the script defines the licence constant and guards the update before it touches app data");
  const withDefine = decision({ args: ["/S"], box: true, removeLicence: licenceDefine(nsh) });
  check(withDefine.licence === true && withDefine.remove === true,
    "4d17 the constant's default is that a ticked box takes the licence too");
}

function plantLeg(mod, decision) {
  if (!PLANTS) {
    skip("4d8 plants are off, so the lifts were not run");
    return;
  }
  const srcPath = path.join(ROOT, "shell", "desk-reset.cjs");
  let src = "";
  try { src = fs.readFileSync(srcPath, "utf8"); } catch (e) { src = ""; }
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-reset-plant-"));
  try {
    const dropped = lift(src, "plant:reset-keep-licence");
    const opened = lift(src, "plant:reset-confine");
    if (!mod || !dropped || !opened) {
      check(false, "4d8 the keep-licence or confine plant is not in shell/desk-reset.cjs");
    } else {
      const licence = Buffer.from("licence-bytes-stay\n");
      const dir = path.join(lab, "keep");
      fs.mkdirSync(dir, { recursive: true });
      write(path.join(dir, "desk.json"), "x");
      write(path.join(dir, "etiuda-license.js"), licence);
      const file = path.join(lab, "lifted-keep.cjs");
      fs.writeFileSync(file, dropped);
      const lifted = require(file);
      lifted.commitReset({ userData: dir, catalogSetting: path.join(lab, "nope"), defaultCatalog: path.join(lab, "nope") });
      check(gone(path.join(dir, "etiuda-license.js")),
        "4d8 lifting plant:reset-keep-licence removes the licence file");
      const held = path.join(lab, "held");
      const secret = path.join(lab, "secret.txt");
      fs.mkdirSync(held, { recursive: true });
      write(path.join(held, "desk.json"), "stay");
      write(secret, "secret");
      const file2 = path.join(lab, "lifted-confine.cjs");
      fs.writeFileSync(file2, opened);
      const wide = require(file2);
      const bad = wide.applyReset({ ok: true, roots: [held], userData: held, remove: [path.join(outsidePath(held), "..", "secret.txt")], keep: [] });
      check(bad.ok === true && gone(secret),
        "4d8 lifting plant:reset-confine deletes a path outside the desk's folders");
    }
    let nsh = "";
    try { nsh = fs.readFileSync(path.join(ROOT, "shell", "installer.nsh"), "utf8"); } catch (e) { nsh = ""; }
    const noUpdate = lift(nsh, "plant:update-keeps-data");
    const noDefine = lift(nsh, "plant:uninstall-licence-goes");
    check(!!noUpdate && updateGuardHolds(nsh) === true && updateGuardHolds(noUpdate) === false,
      "4d8 lifting plant:update-keeps-data drops the update guard");
    check(!!noDefine && licenceDefine(nsh) === true && licenceDefine(noDefine) === false && typeof decision === "function"
      && decision({ args: ["/S"], box: true, removeLicence: licenceDefine(noDefine) }).licence === false,
      "4d8 lifting plant:uninstall-licence-goes keeps the licence on a ticked uninstall");
  } finally {
    fs.rmSync(lab, { recursive: true, force: true });
  }
}
function outsidePath(held) { return held; }

/* A path that never unlinks, then a file written after that pass. The next start may finish
   only what the failed pass still owed. The notice travels the shell's channel to the page. */
async function unfinishedLeg(mod) {
  if (!mod || typeof mod.honourPendingReset !== "function") {
    check(false, "4d10 two starts after a failed pass with no press, and a file written at an owed path between them survives both");
    check(false, "4d10 the Try again press deletes nothing live, leaves an un-held marker, and asks for the relaunch");
    check(false, "4d10 the start after an un-holding removes the owed paths and nothing else (a file written elsewhere after the failed pass survives)");
    check(false, "4d10 Stop drops the marker and the next start removes nothing");
    return;
  }
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-reset-undone-"));
  const nodeFs = require("node:fs");
  const origUnlink = nodeFs.unlinkSync;
  const dir = path.join(lab, "desk");
  try {
    fs.mkdirSync(dir);
    write(path.join(dir, "desk.json"), "old");
    write(path.join(dir, "stuck.txt"), "held");
    write(path.join(dir, mod.MARKER_NAME), markerBody(dir));
    nodeFs.unlinkSync = function (p) {
      if (String(p).toLowerCase().endsWith("stuck.txt")) {
        const err = new Error("busy");
        err.code = "EBUSY";
        err.path = p;
        throw err;
      }
      return origUnlink.call(nodeFs, p);
    };
    const first = mod.honourPendingReset({ userData: dir, holdsLock: true });
    let recorded = false;
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, mod.MARKER_NAME), "utf8"));
      recorded = Array.isArray(doc.owed) && doc.owed.some(p => String(p).toLowerCase().endsWith("stuck.txt")) && doc.held === true;
    } catch (e) { recorded = false; }
    const names = first && Array.isArray(first.paths) ? first.paths : [];
    check(names.indexOf("stuck.txt") >= 0, "4d10 the pass names what is in the way: " + names.join(", "));

    /* (a) two starts after a failed pass with no press, and a file written at an owed path between them survives both */
    const start1 = mod.honourPendingReset({ userData: dir, holdsLock: true });
    const stuckPath = path.join(dir, "stuck.txt");
    write(stuckPath, "new stuck work");
    const start2 = mod.honourPendingReset({ userData: dir, holdsLock: true });
    let stuckSurvived = false;
    try { stuckSurvived = fs.readFileSync(stuckPath, "utf8") === "new stuck work"; } catch (e) { stuckSurvived = false; }
    check(!!first && first.ok === false && !!start1 && start1.ok === false && !!start2 && start2.ok === false
      && start1.changed === false && start2.changed === false && stuckSurvived && recorded,
      "4d10 two starts after a failed pass with no press, and a file written at an owed path between them survives both");

    /* (b) the Try again press deletes nothing live, leaves an un-held marker, and asks for the relaunch */
    const elsewhere = path.join(dir, "elsewhere.txt");
    write(elsewhere, "kept");
    const retried = mod.retryPendingReset({ userData: dir, holdsLock: true });
    let unheld = false;
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, mod.MARKER_NAME), "utf8"));
      unheld = doc.held === false;
    } catch (e) { unheld = false; }
    const mainSrc = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
    const retryRelaunches = /ipcMain\.handle\(\s*"etiuda:reset-retry"[\s\S]{0,300}relaunchAfterReset/.test(mainSrc);
    const liveKept = fs.existsSync(stuckPath) && fs.existsSync(elsewhere);
    check(!!retried && retried.ok === true && retried.changed === false && liveKept && unheld && retryRelaunches,
      "4d10 the Try again press deletes nothing live, leaves an un-held marker, and asks for the relaunch");

    /* (c) the start after an un-holding removes the owed paths and nothing else (a file written elsewhere after the failed pass survives) */
    nodeFs.unlinkSync = origUnlink;
    const start3 = mod.honourPendingReset({ userData: dir, holdsLock: true });
    let elsewhereSurvived = false;
    try { elsewhereSurvived = fs.readFileSync(elsewhere, "utf8") === "kept"; } catch (e) { elsewhereSurvived = false; }
    check(!!start3 && start3.ok === true && start3.changed === true && gone(stuckPath) && elsewhereSurvived && gone(path.join(dir, mod.MARKER_NAME)),
      "4d10 the start after an un-holding removes the owed paths and nothing else (a file written elsewhere after the failed pass survives)");

    /* (d) Stop drops the marker and the next start removes nothing */
    const stopDir = path.join(lab, "stop-desk");
    fs.mkdirSync(stopDir);
    const stopFile = path.join(stopDir, "stuck.txt");
    write(stopFile, "keep me");
    write(path.join(stopDir, mod.MARKER_NAME), JSON.stringify({ v: 1, userData: stopDir, catalogSetting: "", defaultCatalog: "", attempts: 1, owed: [stopFile], held: true }));
    const stopped = mod.stopPendingReset({ userData: stopDir, holdsLock: true });
    const nextStart = mod.honourPendingReset({ userData: stopDir, holdsLock: true });
    let stopKept = false;
    try { stopKept = fs.readFileSync(stopFile, "utf8") === "keep me"; } catch (e) { stopKept = false; }
    check(!!stopped && stopped.ok === true && gone(path.join(stopDir, mod.MARKER_NAME)) && nextStart.pending === false && nextStart.changed === false && stopKept,
      "4d10 Stop drops the marker and the next start removes nothing");
  } finally {
    nodeFs.unlinkSync = origUnlink;
    try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) { /* the temp folder */ }
  }
  await noticePage(mod);
}

async function noticePage(mod) {
  let maint = null;
  try { maint = await import(MOD("maintenance.js")); } catch (e) { maint = null; }
  const mainTxt = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
  const preTxt = fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8");
  const lang = fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8");
  const plOk = Object.keys(UNFINISHED_PL).every(en => lang.indexOf(JSON.stringify(en) + ":" + JSON.stringify(UNFINISHED_PL[en])) >= 0);
  const wired = mainTxt.indexOf("deliverResetNotice(") >= 0 && preTxt.indexOf("etiuda:reset-unfinished") >= 0;
  /* Since review 23's finding 5 the lock goes at will-quit, after before-quit's drain; 4r23d drives it. */
  const releases = /app\.on\("will-quit"[\s\S]{0,600}releaseSingleInstanceLock/.test(mainTxt) && /function relaunchAfterReset\(\) \{[\s\S]{0,400}app\.relaunch\(\)/.test(mainTxt);
  if (!mod || typeof mod.deliverResetNotice !== "function" || !maint || typeof maint.armResetNotice !== "function") {
    check(false, "4d10 the page does not carry the notice");
    check(plOk, "4d10 the notice is the copywriter's, both languages");
    check(wired, "4d10 the shell tells the page on its channel");
    check(releases, "4d10 a relaunch lets go of the single-instance lock before it asks again");
    return;
  }
  const heard = {};
  const invoked = [];
  const ipcRenderer = {
    /* The preload reads the host synchronously while it loads. A null answer throws before the page can hear the notice. */
    sendSync: (ch) => (ch === "etiuda:host"
      ? { platform: "win32", backdrop: null, maximized: false, shown: true }
      : null),
    send: (ch) => { invoked.push(ch); },
    invoke: (ch) => { invoked.push(ch); return Promise.resolve({ ok: true }); },
    on: (ch, fn) => { heard[ch] = fn; }
  };
  const contextBridge = {
    exposeInMainWorld: (k, v) => { globalThis[k] = v; },
    executeInMainWorld() {}
  };
  const preload = fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8");
  new Function("require", preload)(n => (n === "electron" ? { contextBridge, ipcRenderer } : require(n)));
  maint.armResetNotice();
  const win = { webContents: { send: (ch, payload) => { if (typeof heard[ch] === "function") heard[ch]({}, payload); } } };
  const sent = mod.deliverResetNotice(win, { paths: ["stuck.txt"] });
  const card = globalThis.document.getElementById("eResetAsk");
  const said = card ? card.textContent : "";
  check(sent === true && said.indexOf("The reset of Etiuda did not finish") >= 0 && said.indexOf("stuck.txt") >= 0
    && said.indexOf(UNFINISHED_NEXT) >= 0 && said.indexOf(TRY_AGAIN) >= 0 && said.indexOf(STOP_RESET) >= 0,
    "4d10 the page carries the notice through the shell's channel");
  const again = globalThis.document.getElementById("mtResetAgain");
  const stop = globalThis.document.getElementById("mtResetStop");
  if (again) again.click();
  if (stop) stop.click();
  await new Promise(r => setImmediate(r));
  check(invoked.indexOf("etiuda:reset-retry") >= 0 && invoked.indexOf("etiuda:reset-stop") >= 0,
    "4d10 Try again and Stop the reset ask the shell (" + invoked.join(", ") + ")");
  check(plOk, "4d10 the notice is the copywriter's, both languages");
  check(wired, "4d10 the shell tells the page on its channel");
  check(releases, "4d10 a relaunch lets go of the single-instance lock before it asks again");
  if (globalThis.localStorage) globalThis.localStorage.setItem("eUiLang", "pl");
  mod.deliverResetNotice(win, { paths: ["stuck.txt"] });
  const plCard = globalThis.document.getElementById("eResetAsk");
  const plSaid = plCard ? plCard.textContent : "";
  check(plSaid.indexOf("Reset Etiudy nie został dokończony") >= 0 && plSaid.indexOf("stuck.txt") >= 0
    && plSaid.indexOf(UNFINISHED_PL[TRY_AGAIN]) >= 0 && plSaid.indexOf(UNFINISHED_PL[STOP_RESET]) >= 0,
    "4d10 the Polish notice is the copywriter's, with the path");
  if (globalThis.localStorage) globalThis.localStorage.setItem("eUiLang", "en");
}

/* ---- Grok's review 23 of the desk's Reset and history: each case on stand-in folders in a lab of its own ---------- */
/* A copy of shell/desk-reset.cjs with the line holding `tag` replaced by `line`, required from the lab; null where the
   tag is not on exactly one line. */
function liftedReset(lab, tag, line) {
  let src = "";
  try { src = fs.readFileSync(path.join(ROOT, "shell", "desk-reset.cjs"), "utf8"); } catch (e) { return null; }
  const lines = src.split("\n"), at = lines.map((l, i) => (l.indexOf(tag) >= 0 ? i : -1)).filter(i => i >= 0);
  if (at.length !== 1) return null;
  lines[at[0]] = line;
  const file = path.join(lab, "lifted-" + tag.replace(/[^a-z0-9-]/gi, "") + "-" + Math.random().toString(16).slice(2) + ".cjs");
  fs.writeFileSync(file, lines.join("\n"));
  return require(file);
}
/* A desk folder and a default catalog folder under `lab/name`: the desk file `desk` (an object), the default holding a
   team's catalog, team file and ring. */
function deskPair(lab, name, desk) {
  const user = path.join(lab, name, "user"), docs = path.join(lab, name, "Documents", "Etiuda");
  write(path.join(user, "desk.json"), JSON.stringify(Object.assign({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: "" } }, desk || {})));
  write(path.join(user, "etiuda-license.js"), "lic");
  write(path.join(docs, "shop.ec"), "the team's catalog");
  write(path.join(docs, "etiuda-team.json"), "the team's file");
  write(path.join(docs, "etiuda-ring.json"), "the team's ring");
  return { user: user, docs: docs };
}
function sharesLeg(mod, M, lab, name) {
  /* 4r23a: the default folder is the team's share: its folder team names it, or machine policy does. */
  const team = deskPair(lab, name + "-team", { teamShown: { "t-0123456789abcdef": { folder: "", lead: "Lamp lead" } } });
  const env = JSON.parse(fs.readFileSync(path.join(team.user, "desk.json"), "utf8"));
  env.teamShown["t-0123456789abcdef"].folder = team.docs;
  write(path.join(team.user, "desk.json"), JSON.stringify(env));
  M.stageReset({ userData: team.user, catalogSetting: "", defaultCatalog: team.docs });
  const byTeam = M.honourPendingReset({ userData: team.user, holdsLock: true, defaultCatalog: team.docs });
  const policy = deskPair(lab, name + "-policy");
  M.stageReset({ userData: policy.user, catalogSetting: "", defaultCatalog: policy.docs });
  const byPolicy = M.honourPendingReset({ userData: policy.user, holdsLock: true, defaultCatalog: policy.docs, shares: () => [policy.docs] });
  const stays = d => ["shop.ec", "etiuda-team.json", "etiuda-ring.json"].every(n => fs.existsSync(path.join(d, n)));
  return { team: !!byTeam && byTeam.ok === true && gone(path.join(team.user, "desk.json")) && stays(team.docs),
    policy: !!byPolicy && byPolicy.ok === true && gone(path.join(policy.user, "desk.json")) && stays(policy.docs) };
}
function review23Leg(mod) {
  if (!mod) { check(false, "4r23 shell/desk-reset.cjs is not there"); return; }
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-reset-r23-"));
  try {
    const f4 = sharesLeg(mod, mod, lab, "f4");
    /* THE CONTROL: the same desk with no team and no policy loses the default folder's desk files, as 4d5 says. */
    const plain = deskPair(lab, "f4-plain");
    mod.stageReset({ userData: plain.user, catalogSetting: "", defaultCatalog: plain.docs });
    mod.honourPendingReset({ userData: plain.user, holdsLock: true, defaultCatalog: plain.docs });
    const control = gone(path.join(plain.docs, "shop.ec")) && gone(path.join(plain.docs, "etiuda-team.json"));
    check(f4.team && f4.policy && control, "4r23a a default folder that is the team's share, by its folder team or by machine policy, is"
      + " left whole by a reset that still takes the desk; the control, no team, loses its desk files: " + JSON.stringify({ f4: f4, control: control }));
    if (!PLANTS) skip("4r23a lifting plant:reset-share-root takes the share as a root again (ETIUDA_PLANTS=off)");
    else {
      const L = liftedReset(lab, "plant:reset-share-root", "    const onShare = false;");
      const lifted = L ? sharesLeg(mod, L, lab, "f4-lifted") : null;
      check(!!lifted && !lifted.team && !lifted.policy, "4r23a lifting plant:reset-share-root takes the share as a root again: " + JSON.stringify(lifted));
    }
    /* 4r23b (finding 1): a marker naming another folder as the default, or as the setting, roots nothing there. The next
       start roots only the default it computes itself and the setting the desk file holds. */
    const markerRoots = (M, name) => {
      const p = deskPair(lab, name);
      const other = path.join(lab, name, "other");
      write(path.join(other, "shop.ec"), "not the desk's");
      write(path.join(other, "etiuda-team.json"), "not the desk's");
      write(path.join(p.user, M.MARKER_NAME), JSON.stringify({ v: 1, userData: p.user, catalogSetting: "", defaultCatalog: other, attempts: 0 }));
      const done = M.honourPendingReset({ userData: p.user, holdsLock: true, defaultCatalog: p.docs });
      return { done: !!done && done.ok === true, desk: gone(path.join(p.user, "desk.json")),
        other: fs.existsSync(path.join(other, "shop.ec")) && fs.existsSync(path.join(other, "etiuda-team.json")),
        own: gone(path.join(p.docs, "shop.ec")) };
    };
    const f1 = markerRoots(mod, "f1");
    check(f1.done && f1.desk && f1.other && f1.own, "4r23b a marker naming another folder as the default roots nothing"
      + " there: the next start sweeps the default it computes and the desk file's setting, and the other folder stays: " + JSON.stringify(f1));
    if (!PLANTS) skip("4r23b lifting plant:reset-own-default takes the marker's default again (ETIUDA_PLANTS=off)");
    else {
      const L = liftedReset(lab, "plant:reset-own-default", "    defaultCatalog: doc.defaultCatalog, catalogSetting: doc.catalogSetting,");
      const lifted = L ? markerRoots(L, "f1-lifted") : null;
      check(!!lifted && !lifted.other, "4r23b lifting plant:reset-own-default takes the marker's default again: " + JSON.stringify(lifted));
    }
    /* 4r23c (finding 3): this desk's own folder under desks/ in the default folder, its catalog, its request and its
       invitations, goes with the rest the confirm names, for its key now and one kept aside; another desk's folder there,
       and anything that is not under desks/<own id>, stays. */
    const ownFolders = (M, name) => {
      const crypto = require("node:crypto");
      const idOf = pub => "k-" + crypto.createHash("sha256").update(Buffer.from(pub, "hex")).digest("hex").slice(0, 16);
      const now = "ab".repeat(32), old = "cd".repeat(32);
      const pair = pub => ({ sign: { pub: pub, priv: "x" }, box: { pub: "ef".repeat(32), priv: "y" } });
      const p = deskPair(lab, name, { branch: pair(now), branchOld: [pair(old)] });
      const mine = path.join(p.docs, "desks", idOf(now)), aside = path.join(p.docs, "desks", idOf(old));
      const theirs = path.join(p.docs, "desks", "k-0123456789abcdef");
      write(path.join(mine, "shop-0a0b0c0d.ec"), "mine");
      write(path.join(mine, "join.json"), "my request");
      write(path.join(mine, "invites", "i.json"), "my invitation");
      write(path.join(aside, "shop-0a0b0c0d.ec"), "mine, an older key");
      write(path.join(theirs, "shop-0a0b0c0d.ec"), "theirs");
      M.stageReset({ userData: p.user, catalogSetting: "", defaultCatalog: p.docs });
      const done = M.honourPendingReset({ userData: p.user, holdsLock: true, defaultCatalog: p.docs });
      return { done: !!done && done.ok === true, mine: gone(mine), aside: gone(aside), theirs: fs.existsSync(path.join(theirs, "shop-0a0b0c0d.ec")) };
    };
    const f3 = ownFolders(mod, "f3");
    check(f3.done && f3.mine && f3.aside && f3.theirs, "4r23c this desk's own folder under desks/ in the default folder goes, for its key"
      + " now and one kept aside, catalog, request and invitations alike, and another desk's folder there stays: " + JSON.stringify(f3));
    if (!PLANTS) skip("4r23c lifting plant:reset-own-desks leaves the desk's own folder under desks/ (ETIUDA_PLANTS=off)");
    else {
      const L = liftedReset(lab, "plant:reset-own-desks", "        const keepIt = true;");
      const lifted = L ? ownFolders(L, "f3-lifted") : null;
      check(!!lifted && !lifted.mine, "4r23c lifting plant:reset-own-desks leaves the desk's own folder under desks/: " + JSON.stringify(lifted));
    }
  } finally {
    fs.rmSync(lab, { recursive: true, force: true });
  }
}

/* 4r23d (Grok's review 23, finding 5): the shell's reset press, run in the real shell/main.js under a stand-in electron over a
   lab folder. The single-instance lock is let go only at will-quit, after before-quit has ended, so a new start cannot take
   it and honour the marker while this process still flushes; the relaunch and the quit are asked at once. */
async function lockHeldLeg(src, lab, name) {
  const ud = path.join(lab, name, "user"), docs = path.join(lab, name, "Documents");
  write(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eUiLang: "en" } }));
  fs.mkdirSync(docs, { recursive: true });
  const events = [], appOn = {}, handle = {};
  const noop = () => {};
  const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
  const electron = {
    app: { getPath: n => (n === "documents" ? docs : ud), setPath: noop, requestSingleInstanceLock: () => false, getVersion: () => "0.0.0",
      on: (k, fn) => { (appOn[k] = appOn[k] || []).push(fn); }, whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop, hasSwitch: () => false },
      quit: () => events.push("quit"), relaunch: () => events.push("relaunch"), releaseSingleInstanceLock: () => events.push("release"),
      setLoginItemSettings: noop, getLoginItemSettings: () => ({ openAtLogin: false }) },
    ipcMain: { on: noop, handle: (ch, fn) => { handle[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: inert, screen: inert,
    systemPreferences: inert, nativeTheme: { themeSource: "system" }, globalShortcut: { unregisterAll: noop },
    safeStorage: { isEncryptionAvailable: () => false, encryptString: () => { throw new Error("no"); }, decryptString: () => { throw new Error("no"); } },
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  new Function("require", "__dirname", "__filename", "module", "exports", "console", src)(
    n => (n === "electron" ? electron : require(n)), path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {},
    { log: noop, error: noop, warn: noop });
  events.length = 0;
  const ev = { sender: { id: 1, once: noop }, senderFrame: { parent: null, url: "file:///C:/lab/engine/etiuda.html" } };
  const staged = await Promise.resolve(handle["etiuda:desk-reset"](ev));
  await new Promise(r => setImmediate(r));
  const beforeQuit = events.slice();
  (appOn["before-quit"] || []).forEach(fn => fn({ preventDefault: noop }));
  const afterBeforeQuit = events.slice();
  (appOn["will-quit"] || []).forEach(fn => fn({ preventDefault: noop }));
  return { staged: !!staged && staged.ok === true, asked: beforeQuit, atBeforeQuit: afterBeforeQuit, atWillQuit: events.slice() };
}
async function lockLegs() {
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-reset-lock-held-"));
  try {
    const src = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
    let r = null;
    try { r = await lockHeldLeg(src, lab, "now"); } catch (e) { r = { error: String(e && e.message || e) }; }
    const ok = !!r && r.staged && r.asked.indexOf("relaunch") >= 0 && r.asked.indexOf("quit") >= 0 && r.atBeforeQuit.indexOf("release") < 0
      && r.atWillQuit.indexOf("release") >= 0;
    check(ok, "4r23d the reset press asks the relaunch and the quit, and lets the single-instance lock go only at will-quit, after"
      + " before-quit: " + JSON.stringify(r));
    if (!PLANTS) skip("4r23d lifting plant:reset-lock-late lets the lock go with the press again (ETIUDA_PLANTS=off)");
    else {
      const lines = src.split("\n"), at = lines.map((l, i) => (l.indexOf("plant:reset-lock-late") >= 0 ? i : -1)).filter(i => i >= 0);
      let lifted = null;
      if (at.length === 1) {
        lines[at[0]] = "      if (typeof app.releaseSingleInstanceLock === \"function\") app.releaseSingleInstanceLock();";
        try { lifted = await lockHeldLeg(lines.join("\n"), lab, "lifted"); } catch (e) { lifted = { error: String(e && e.message || e) }; }
      }
      check(!!lifted && Array.isArray(lifted.asked) && lifted.asked.indexOf("release") >= 0,
        "4r23d lifting plant:reset-lock-late lets the lock go with the press again: " + JSON.stringify(lifted));
    }
  } finally {
    fs.rmSync(lab, { recursive: true, force: true });
  }
}

/* 4r23e (Grok's review 23, finding 7): a folder in the desk folder that cannot be listed is a failed entry, not a throw. The
   pass records what it owes, says so, and the next start reads that list rather than throwing at the same folder; once the
   folder can be listed and the person tries again, the reset finishes. */
function unlistedLeg(M, lab, name) {
  const nodeFs = require("node:fs");
  const origReaddir = nodeFs.readdirSync;
  const dir = path.join(lab, name);
  write(path.join(dir, "desk.json"), "go");
  write(path.join(dir, "locked", "inside.txt"), "held");
  write(path.join(dir, M.MARKER_NAME), markerBody(dir));
  const locked = p => path.resolve(String(p)).toLowerCase() === path.join(dir, "locked").toLowerCase();
  nodeFs.readdirSync = function (p, ...rest) {
    if (locked(p)) { const e = new Error("EACCES: permission denied, scandir"); e.code = "EACCES"; e.path = String(p); throw e; }
    return origReaddir.call(this, p, ...rest);
  };
  const out = {};
  try {
    try { out.first = M.honourPendingReset({ userData: dir, holdsLock: true }); } catch (e) { out.threw = String(e && e.code || e); }
    let marker = null;
    try { marker = JSON.parse(fs.readFileSync(path.join(dir, M.MARKER_NAME), "utf8")); } catch (e) { marker = null; }
    out.owed = !!marker && Array.isArray(marker.owed) && marker.owed.some(p => locked(p));
    try { out.second = M.honourPendingReset({ userData: dir, holdsLock: true }); } catch (e) { out.threwAgain = String(e && e.code || e); }
  } finally { nodeFs.readdirSync = origReaddir; }
  M.retryPendingReset({ userData: dir, holdsLock: true });
  try { out.after = M.honourPendingReset({ userData: dir, holdsLock: true }); } catch (e) { out.after = { threw: String(e) }; }
  out.finished = gone(path.join(dir, "locked")) && gone(path.join(dir, M.MARKER_NAME));
  return out;
}
function unlistedLegs(mod) {
  if (!mod) return;
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-reset-unlisted-"));
  try {
    const r = unlistedLeg(mod, lab, "now");
    const ok = !r.threw && !r.threwAgain && !!r.first && r.first.notice === true && r.owed && !!r.second && r.second.notice === true
      && !!r.after && r.after.ok === true && r.finished;
    check(ok, "4r23e a folder that cannot be listed is a failed entry: the pass records it as owed and says so, the next start does"
      + " not throw, and once it can be listed and the person tries again the reset finishes: " + JSON.stringify(r));
    if (!PLANTS) skip("4r23e lifting plant:reset-unlisted throws at the folder again (ETIUDA_PLANTS=off)");
    else {
      const L = liftedReset(lab, "plant:reset-unlisted", "    names = namesOf(p);");
      let lifted = null;
      try { lifted = L ? unlistedLeg(L, lab, "lifted") : null; } catch (e) { lifted = { threw: String(e) }; }
      check(!!lifted && !!lifted.threw, "4r23e lifting plant:reset-unlisted throws at the folder again: " + JSON.stringify(lifted));
    }
  } finally {
    fs.rmSync(lab, { recursive: true, force: true });
  }
}

let mod = null, decision = null;
try { mod = require(path.join(ROOT, "shell", "desk-reset.cjs")); } catch (e) { mod = null; }
try { decision = require(path.join(ROOT, "tests", "install-plan.js")).uninstallDataDecision; } catch (e) { decision = null; }

await uiLeg();
shellLeg(mod);
await unfinishedLeg(mod);
review23Leg(mod);
await lockLegs();
unlistedLegs(mod);
installLeg(decision);
plantLeg(mod, decision);
console.log("desk-reset " + (failed ? "FAILED " + failed + " of " : "passed ") + asserted
  + (skipped ? ", " + skipped + " skipped" : ""));
process.exitCode = failed ? Math.min(failed, 63) : 0;
