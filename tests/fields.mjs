/* Fill-in fields and the clipboard on the agent's key, in bare node: the real src/modules over a
 * stand-in document. What a field is in the file, what a value may be, what a copy puts on the
 * clipboard, the question the desk asks at a copy, and what the picker's answers say.
 *
 *   node tests/fields.mjs          exit code is the number of failed checks, capped at 63
 *
 * THE ORACLES. The format's refusals are v2Problems' own lines, one planted fault each beside a
 * clean control. A copy is read as the text the clipboard would receive. The question is driven
 * through its own handlers on a stand-in that parses only the markup the question writes; how it
 * LOOKS is Maxim's to judge on the desk, and nothing here measures a pixel.
 *
 * NO CONTENT. The cards and fields below are invented here and hold nobody's words.
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
const EXPECTED = 44;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
const tick = ms => new Promise(r => setTimeout(r, ms || 0));

/* ---- a stand-in document: elements the question writes, parsed from its own markup -------- */
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
["railDecorate", "syncSampleMark", "markEntrySel", "render"].forEach(k => { HK.hooks[k] = () => {}; });
const Dom = await import(MOD("dom.js"));
Dom.grabDom();
const AS = await import(MOD("app-state.js"));
const PK = await import(MOD("pack.js"));
const ST = await import(MOD("storage.js"));
const FD = await import(MOD("fields.js"));
const IT = await import(MOD("intent-text.js"));
const FA = await import(MOD("field-ask.js"));
const CE = await import(MOD("copy-entry.js"));
const PICK = await import(MOD("pick.js"));
const TB = await import(MOD("tabs.js"));
const V2 = await import(MOD("catalog-v2.js"));
const RL = await import(MOD("rail-list.js"));
const LP = await import(MOD("list-pointer.js"));
ST.lsSet("eMotionOff", "1");
ST.lsSet("eNameAsked", "1");
ST.lsSet("eAgent", "Kate");
AS.putLang("en");

const FIELDS = [
  { id: "order", label: { en: "order number", pl: "numer zamówienia" }, kind: "pattern", pattern: "MRB-0000-00000" },
  { id: "track", label: { en: "tracking link", pl: "link do śledzenia" }, kind: "link" },
  { id: "kept", label: { en: "what was promised" }, kind: "text", required: false, skip: { en: "nothing yet" }, keep: "copy" },
];
const CARDS = [
  { id: "c-where", c: "orders", t: "Where it is", en: "Order {order number} left today: {tracking link}" },
  { id: "c-hand", c: "orders", t: "Handover", en: "Order {Order  Number}. Promised: {what was promised}." },
  { id: "c-plain", c: "orders", t: "Plain", en: "{GREET} {PAX}, a reply with {braces in prose} and no field." },
];
AS.setCards(CARDS.map(c => Object.assign({}, c)));
PK.pack.custom = [];
const card = id => AS.cards.find(c => c.id === id);

/* The desk's own keyboard copy of a block, with the clipboard caught rather than written. */
function deskCopy(id, vi) {
  let got = null;
  navigator.clipboard = { writeText: t => { got = t; return { then() {} }; } };
  AS.putEntrySel({ id: id, vi: vi || 0 });
  CE.copyEntrySel(false);
  navigator.clipboard = null;
  return got;
}
const asking = () => DOC.getElementById("eFieldAsk");
const inputs = () => asking() ? asking().querySelectorAll(".e-field-inp") : [];
const said = () => (asking() && asking().querySelector("#eFieldSaid") || {}).textContent || "";

try {
  console.log("[1/7] the format: what v2Problems takes and refuses under `fields`");
  const doc = extra => Object.assign({ format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 1,
    langs: [{ code: "en", label: "EN" }, { code: "pl", label: "PL" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-a", shelf: "t-op", bodyShape: "plain", title: { en: "A" }, body: { en: "Order {order number}." } }] }, extra || {});
  check(V2.v2Problems(doc({ fields: FIELDS })).length === 0 && V2.v2Problems(doc()).length === 0,
    "1a a catalog with three well-formed fields reads clean, and so does one with none: "
    + JSON.stringify(V2.v2Problems(doc({ fields: FIELDS }))));
  const one = (f, what) => V2.v2Problems(doc({ fields: [Object.assign({ id: "x", label: { en: "thing" }, kind: "text" }, f)] }));
  const planted = [
    [V2.v2Problems(doc({ fields: {} })), /^fields: not a list$/],
    [one({ id: "Bad Id" }), /^fields\[0\]\.id: malformed/],
    [V2.v2Problems(doc({ fields: [{ id: "x", label: { en: "a" }, kind: "text" }, { id: "x", label: { en: "b" }, kind: "text" }] })), /^field x: the id is claimed twice$/],
    [one({ label: { pl: "rzecz" } }), /^field x: no label in en, the primary language$/],
    [one({ label: { en: "a {b}" } }), /^field x: label\.en holds a brace/],
    [one({ label: { en: "Pax" } }), /^field x: label\.en spells \{PAX\}, which the desk fills itself$/],
    [one({ label: { en: "thing", de: "Ding" } }), /^field x: label\.de is a language this catalog does not declare$/],
    [V2.v2Problems(doc({ fields: [{ id: "a", label: { en: "same" }, kind: "text" }, { id: "b", label: { en: "SAME " }, kind: "text" }] })), /^field b: label\.en is also the label of field a$/],
    [one({ kind: "colour" }), /^field x: kind malformed, wanted one of text, link, date, amount, pattern$/],
    [one({ kind: "pattern" }), /^field x: pattern absent/],
    [one({ required: "yes" }), /^field x: required is not true or false$/],
    [one({ keep: "forever" }), /^field x: keep is not conversation or copy$/],
    [one({ skip: { de: "nichts" } }), /^field x: skip\.de is a language this catalog does not declare$/],
  ];
  const missed = planted.filter(([got, re]) => !(got.length === 1 && re.test(got[0]))).map(([got, re]) => String(re) + " got " + JSON.stringify(got));
  check(missed.length === 0, "1b each of " + planted.length + " planted faults is refused alone, by its own line: "
    + (missed.join("; ") || "all"));
  /* No label may spell a token the desk fills: the list in catalog-v2.js against the canary rail-list.js measures. */
  const src = fs.readFileSync(path.join(ROOT, "src", "modules", "rail-list.js"), "utf8");
  const canary = /const TOKEN_CANARY="([^"]*)"/.exec(src)[1];
  const named = [...new Set((canary.match(/\{([A-Z]+)/g) || []).map(t => t.slice(1)))].sort();
  const listed = /const V2_DESK_TOKENS=\[([^\]]*)\]/.exec(fs.readFileSync(path.join(ROOT, "src", "modules", "catalog-v2.js"), "utf8"))[1]
    .split(",").map(s => s.trim().replace(/"/g, "")).filter(n => n !== "WHO").sort();
  check(named.length >= 9 && named.join() === listed.join(),
    "1c the tokens a label may not spell are the canary's own, {WHO} besides: " + listed.join(" "));
  const read = V2.catalogFromV2(doc({ fields: FIELDS }));
  const back = V2.catalogToV2(read);
  check(JSON.stringify(read.fields) === JSON.stringify(FIELDS) && JSON.stringify(back.fields) === JSON.stringify(FIELDS)
    && !(read.ext && "fields" in read.ext) && !("fields" in V2.catalogFromV2(doc())),
    "1d the reader keeps the fields as a field of its own, not a stranger carried in ext, and the writer gives them back whole");

  console.log("\n[2/7] a value: what it may hold and what of a clipboard fits");
  const nb = String.fromCharCode(0xa0), zw = String.fromCharCode(0x200d);
  check(FD.fillFieldClean("  Jan\r\nKowalski\t" + zw + "{x}" + nb) === "Jan Kowalski x",
    "2a a value is one line: breaks and tabs become a space, invisible and hard spaces go, braces go: "
    + JSON.stringify(FD.fillFieldClean("  Jan\r\nKowalski\t" + zw + "{x}" + nb)));
  const fits = [
    [{ kind: "link" }, "Parcel: https://track.example/x?a=1). Thanks", "https://track.example/x?a=1"],
    [{ kind: "link" }, "no address here", null],
    [{ kind: "date" }, "Paid 129.00, sent 10.10.2026", "10.10.2026"],
    [{ kind: "date" }, "13.13", null],
    [{ kind: "amount" }, "Order 12345, to pay 1" + nb + "299,00 zł", "1 299,00"],
    [{ kind: "amount" }, "no number", null],
    [{ kind: "pattern", pattern: "MRB-0000-00000" }, "hello, order mrb-2024-10412 from Saturday", "MRB-2024-10412"],
    [{ kind: "pattern", pattern: "MRB-0000-00000" }, "MRB-2024-1041", null],
    [{ kind: "pattern", pattern: "MRB-0000-00000" }, "XMRB-2024-10412", null],
    [{ kind: "text" }, "  anything at all ", "anything at all"],
  ];
  const wrongFit = fits.filter(([f, s, want]) => { const got = FD.fillFieldFit(f, s); return want === null ? got !== null : !got || got.value !== want; });
  check(wrongFit.length === 0, "2b of " + fits.length + " clipboards, each kind keeps the part that fits and refuses where none does: "
    + (wrongFit.map(([f, s]) => f.kind + " " + JSON.stringify(s) + " -> " + JSON.stringify(FD.fillFieldFit(f, s))).join("; ") || "all"));
  check(FD.fillFieldOk(FIELDS[0], "MRB-2024-10412") && !FD.fillFieldOk(FIELDS[0], "see MRB-2024-10412")
    && FD.fillFieldOk(FIELDS[1], "https://a.example/b") && !FD.fillFieldOk(FIELDS[1], "a.example") && !FD.fillFieldOk(FIELDS[2], " "),
    "2c a typed value must fit whole, and an empty one never does");

  console.log("\n[3/7] the fill: what the card shows and what the clipboard receives");
  FD.setCatalogFillFields(FIELDS);
  AS.setFieldVals({});
  const where = card("c-where"), hand = card("c-hand"), plain = card("c-plain");
  const screen = IT.fill(where.en, where, true, "en"), clipEmpty = IT.fill(where.en, where, false, "en");
  check(screen.indexOf(IT.FILL_M_A + "order number" + IT.FILL_M_B) > -1 && screen.indexOf(IT.FILL_M_A + "tracking link" + IT.FILL_M_B) > -1
    && clipEmpty === "Order  left today: ",
    "3a an empty field is the named hole on the card, and nothing on the clipboard: " + JSON.stringify(clipEmpty));
  AS.setFieldVals({ order: "MRB-2024-10412", track: "https://t.example/1" });
  check(IT.fill(where.en, where, false, "en") === "Order MRB-2024-10412 left today: https://t.example/1"
    && IT.fill(where.en, where, true, "en").indexOf(IT.FILL_A + "MRB-2024-10412" + IT.FILL_B) > -1,
    "3b a value fills its field on the clipboard, and is fenced on the card as every filled value is");
  check(IT.fill(hand.en, hand, false, "en") === "Order MRB-2024-10412. Promised: nothing yet.",
    "3c the label is found whatever its case and spacing, and a skippable field left empty says the lead's words: "
    + JSON.stringify(IT.fill(hand.en, hand, false, "en")));
  AS.setFieldVals({ order: FD.fillFieldClean("{PAX} {GREET}") });
  check(IT.fill(where.en, where, false, "en").indexOf("Anna") < 0 && IT.fill(where.en, where, false, "en").startsWith("Order PAX GREET"),
    "3d a value can never be read back as a token: " + JSON.stringify(IT.fill(where.en, where, false, "en")));
  const plainWith = IT.fill(plain.en, plain, false, "en");
  FD.setCatalogFillFields(null);
  const plainWithout = IT.fill(plain.en, plain, false, "en");
  check(plainWith === plainWithout && plainWith.indexOf("{braces in prose}") > -1,
    "3e a brace that names no field is left as written, and a catalog with no fields fills exactly as before");
  FD.setCatalogFillFields(FIELDS);
  AS.setFieldVals({});
  const k1 = RL.cardFillKey(where); AS.setFieldVals({ order: "MRB-2024-10412" }); const k2 = RL.cardFillKey(where);
  check(k1 !== k2 && k1 !== "" && RL.cardFillKey(card("c-plain")) !== "",
    "3f a card holding a field is redrawn when the value changes, its key moving with it");

  console.log("\n[4/7] the question at the copy");
  AS.setFieldVals({ order: "MRB-2024-10412", track: "https://t.example/1" });
  const straight = deskCopy("c-where");
  check(straight === "Order MRB-2024-10412 left today: https://t.example/1" && !asking(),
    "4a with every field known the copy goes straight through and nothing is asked");
  AS.setFieldVals({});
  const before = deskCopy("c-where");
  check(before === null && !!asking() && inputs().length === 2,
    "4b with a field empty nothing is copied and the question opens, one box per field: " + inputs().length);
  inputs()[0].value = "MRB-2024-10412";
  asking().querySelector("#eFieldYes").onclick();
  check(!!asking() && /does not go without: tracking link/.test(said()) && inputs()[1].hasAttribute("aria-invalid") && !AS.fieldVals.order,
    "4c Copy with a required field empty is refused, naming it, and nothing is kept: " + JSON.stringify(said()));
  inputs()[1].value = "not a link";
  asking().querySelector("#eFieldYes").onclick();
  check(!!asking() && /Does not fit the field: tracking link/.test(said()),
    "4d a value that does not fit is refused the same way: " + JSON.stringify(said()));
  let got = null;
  navigator.clipboard = { writeText: t => { got = t; return { then() {} }; } };
  inputs()[1].value = "https://t.example/9";
  fire(inputs()[1], "keydown", { key: "Enter" });
  navigator.clipboard = null;
  check(got === "Order MRB-2024-10412 left today: https://t.example/9" && !asking()
    && AS.fieldVals.order === "MRB-2024-10412" && AS.fieldVals.track === "https://t.example/9",
    "4e filled, Enter in the last box copies the whole reply and the values stay with the conversation: " + JSON.stringify(got));
  AS.setFieldVals({});
  deskCopy("c-where");
  fire(inputs()[0], "keydown", { key: "Enter" });
  check(DOC.activeElement === inputs()[1] && !!asking(), "4f Enter in a box with an empty one after it walks to that box and copies nothing");
  fire(inputs()[0], "keydown", { key: "Escape" });
  check(!asking() && Object.keys(AS.fieldVals).length === 0, "4g Escape closes the question, copying and keeping nothing");

  /* The tab under the question is the one it answers for. */
  deskCopy("c-where");
  inputs()[0].value = "MRB-2024-10412"; inputs()[1].value = "https://t.example/2";
  const wasVals = AS.fieldVals;
  AS.setFieldVals({});
  check(!asking() && Object.keys(AS.fieldVals).length === 0 && Object.keys(wasVals).length === 0,
    "4h another conversation put on screen closes the question, and neither conversation is given its values");

  /* Alt+V: the host's read at the press; the part that fits; the first words where none does. */
  let host = "Hello, my order mrb-2024-10412 has not come";
  globalThis.window.E_HOST = { readClip: () => Promise.resolve(host) };
  AS.setFieldVals({});
  deskCopy("c-where");
  const altV = { key: "v", code: "KeyV", altKey: true, ctrlKey: false, metaKey: false };
  const ev = fire(inputs()[0], "keydown", altV);
  await tick(5);
  check(ev.defaultPrevented && inputs()[0].value === "MRB-2024-10412" && /Taken from the clipboard/.test(said()),
    "4i Alt+V in a box takes from the clipboard only the part that fits: " + JSON.stringify(inputs()[0].value));
  fire(inputs()[1], "keydown", altV);
  await tick(5);
  check(inputs()[1].value === "" && /It holds: Hello, my order mrb-2024-10412 has not come/.test(said()),
    "4j where nothing fits, nothing is put in and the clipboard's first words are shown: " + JSON.stringify(said()));
  host = "x ".repeat(80);
  fire(inputs()[1], "keydown", altV);
  await tick(5);
  check(said().length < 130 && /…$/.test(said()), "4k and a long clipboard is cut to its first words: " + said().length + " characters");
  const altGr = fire(inputs()[1], "keydown", Object.assign({}, altV, { ctrlKey: true }));
  check(!altGr.defaultPrevented, "4l AltGr+V, which Polish layouts type with, is left to the box");
  delete globalThis.window.E_HOST;
  fire(inputs()[1], "keydown", altV);
  await tick(5);
  check(/Ctrl\+V pastes/.test(said()), "4m with no host to read through, the browser's Ctrl+V is named: " + JSON.stringify(said()));
  fire(inputs()[0], "keydown", { key: "Escape" });

  /* A second copy while a question stands closes the first by its own close. */
  AS.setFieldVals({});
  deskCopy("c-where"); deskCopy("c-hand");
  const standing = DOC.body.kids.filter(k => k.attrs.id === "eFieldAsk");
  check(standing.length === 1 && inputs().length === 2 && /what was promised/.test(asking().innerHTML),
    "4o a second copy while a question stands leaves one question, the second reply's: " + standing.length);
  fire(inputs()[0], "keydown", { key: "Escape" });

  /* A field kept for one copy goes with it. */
  AS.setFieldVals({ order: "MRB-2024-10412", kept: "a refund" });
  const once = deskCopy("c-hand");
  check(once === "Order MRB-2024-10412. Promised: a refund." && !AS.fieldVals.kept && AS.fieldVals.order === "MRB-2024-10412",
    "4n a field kept for one copy is gone after it, and the conversation's own stays: " + JSON.stringify(AS.fieldVals));

  /* A click on a block, through list-pointer's own handler on a detached #list. The stand-in's
     matches() takes one simple selector, so the card and its block answer `.class[attr]` here. */
  class Hit extends El {
    get dataset() { const d = {}; for (const k in this.attrs) if (k.startsWith("data-")) d[k.slice(5)] = this.attrs[k]; return d; }
    matches(sel) { const m = /^\.([\w-]+)\[([\w-]+)\]$/.exec(sel); return m ? this.classList.contains(m[1]) && m[2] in this.attrs : super.matches(sel); }
  }
  const listEl = new El("div", { id: "list" });
  const block = listEl.appendChild(new Hit("div", { class: "card", "data-id": "c-where" })).appendChild(new Hit("p", { class: "txt", "data-v": "0" }));
  els["#list"] = listEl; Dom.grabDom(); LP.wireListPointer();
  const clickCopy = () => {
    let got = null;
    navigator.clipboard = { writeText: t => { got = t; return { then() {} }; } };
    fire(block, "click", { button: 0 });
    navigator.clipboard = null;
    return got;
  };
  AS.setFieldVals({ order: "MRB-2024-10412", track: "https://t.example/1" });
  const clicked = clickCopy(), askedKnown = !!asking();
  AS.setFieldVals({});
  const clickedEmpty = clickCopy();
  check(clicked === "Order MRB-2024-10412 left today: https://t.example/1" && !askedKnown
    && clickedEmpty === null && !!asking() && inputs().length === 2,
    "4p a click on a block copies straight through with every field known, and with one empty copies nothing and asks: "
    + JSON.stringify({ clicked, clickedEmpty, boxes: inputs().length }));
  if (asking()) fire(inputs()[0], "keydown", { key: "Escape" });
  delete els["#list"]; Dom.grabDom();

  console.log("\n[5/7] the picker's answers and where a value is kept");
  /* One conversation on screen, as the desk starts with, so a value has a tab to be kept with. */
  ["applyLangUI", "updateIntentPlaceholder", "drawIntentRail", "drawPillsCore", "drawTabsCore", "scheduleRailGeometry"]
    .forEach(k => { HK.hooks[k] = () => {}; });
  AS.setFieldVals({});
  TB.initTabs();
  const pa = (op, arg) => PICK.answerPick(op, JSON.stringify(arg || {}));
  const need = pa("copy", { id: "c-where", vi: 0 });
  check(!!need && !!need.need && need.need.fields.map(f => f.id + ":" + f.label).join() === "order:order number,track:tracking link" && !("text" in need),
    "5a the picker is answered with the fields to fill rather than a text: " + JSON.stringify(need && need.need && need.need.fields.map(f => f.id)));
  const wrong = pa("copy", { id: "c-where", vi: 0, values: { order: "MRB-2024-10412", track: "" } });
  check(!!wrong.need && wrong.need.at === 1 && /tracking link/.test(wrong.need.said) && !AS.fieldVals.order,
    "5b values that leave a required field empty are refused at that field, and none is kept: " + JSON.stringify(wrong.need && wrong.need.said));
  const ok5 = pa("copy", { id: "c-where", vi: 0, values: { order: "MRB-2024-10412", track: "https://t.example/5" } });
  check(ok5 && ok5.text === "Order MRB-2024-10412 left today: https://t.example/5" && AS.fieldVals.track === "https://t.example/5",
    "5c values that fit make the desk's own text and are kept for the conversation in front");
  const fitA = pa("fit", { id: "c-where", vi: 0, field: "order", text: "re: MRB-2024-10412" }), fitB = pa("fit", { id: "c-where", vi: 0, field: "nope", text: "x" });
  check(fitA && fitA.value === "MRB-2024-10412" && fitB === null,
    "5d the picker's clipboard is answered with the part that fits, and a field the reply does not hold with nothing");
  const SENT = "MRB-9999-77777";
  pa("copy", { id: "c-where", vi: 0, values: { order: SENT } });
  TB.saveTabSession();
  const local = ST.lsKeys().map(k => String(ST.lsGet(k))).join("\n");
  const sess = String(ST.ssGet(TB.TAB_KEY) || "");
  check(local.indexOf(SENT) < 0 && sess.indexOf(SENT) > -1,
    "5e a value is kept with the conversation's tab and nowhere in the desk's own storage, counts included (the tab's session holds it: "
    + (sess.indexOf(SENT) > -1) + ")");
  /* 5f a value stays with its own conversation through the real tab switch. */
  { const a = Object.assign({}, AS.fieldVals);
    TB.tabs.push({ id: "tprobe", lang: "en", pax: "", intentIdxs: [], cats: [], path: [], fields: {} }); TB.stepTab(1);
    const fresh = Object.assign({}, AS.fieldVals);
    pa("copy", { id: "c-where", vi: 0, values: { order: "MRB-1111-22222", track: "https://t.example/b" } });
    TB.stepTab(-1);
    const back = Object.assign({}, AS.fieldVals);
    TB.stepTab(1);
    const other = Object.assign({}, AS.fieldVals);
    check(a.order === SENT && Object.keys(fresh).length === 0 && back.order === SENT && other.order === "MRB-1111-22222",
      "5f a new conversation starts with no values, and each tab gets back its own: " + JSON.stringify({ a, fresh, back, other })); }

  console.log("\n[6/7] the lint: a declared field is a token the desk fills");
  const LT = nodeRequire(path.join(ROOT, "tests", "test.js"));
  const linted = extra => LT.lintCatalog(doc(extra)).warnings;
  /* One label of words and one that is a bare name, which the desk's own token rule would otherwise claim. */
  const base = linted({ fields: [FIELDS[0], { id: "amt", label: { en: "amount" }, kind: "amount" }],
    cards: [{ id: "c-a", shelf: "t-op", bodyShape: "plain", title: { en: "A" }, body: { en: "Order {order number}, {amount}." } }] });
  check(base.length === 0, "6a a card naming a declared field draws no warning, a one-word label included: " + JSON.stringify(base));
  const mis = linted({ fields: [FIELDS[0]], cards: [{ id: "c-a", shelf: "t-op", bodyShape: "plain", title: { en: "A" }, body: { en: "Order {order numbr}, {data}." } }] });
  check(mis.some(w => /\{order numbr\} in the EN body names no field this catalog declares/.test(w)) && mis.some(w => /\{data\} in the EN body is not a token the desk fills/.test(w))
    && mis.some(w => /field order is in no card's text/.test(w)),
    "6b a misspelt field and an undeclared name are each named, and a field no card uses is said: " + mis.length + " warning(s)");
  const none = LT.lintCatalog(doc({ cards: [{ id: "c-a", shelf: "t-op", bodyShape: "plain", title: { en: "A" }, body: { en: "A {thing in braces}." } }] })).warnings;
  check(none.length === 0, "6c control: a catalog that declares no field is linted as before, prose braces and all: " + JSON.stringify(none));
  console.log("\n[7/7] a copy through the field question still carries the card's stamp, on every route");
  /* The stamp (S4b) rides the copy's third argument into mark.js's copy() and on to toast(); the field
     question (C02) defers that copy until the question is answered. module-calls 814O reads the three
     calls as text and 814M the formatter alone, so nothing else sees the stamp arrive in the toast after
     a deferred copy. A card with commits:1 toasts stamped on the keyboard, click and picker-ask routes,
     and one without does not (the control). */
  { const hadGCS = globalThis.getComputedStyle;
    const toastEl = new El("div", { id: "toast" }); els["#toast"] = toastEl;
    toastEl.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
    globalThis.getComputedStyle = window.getComputedStyle = () => ({ getPropertyValue: () => "", borderLeftWidth: "0", borderRightWidth: "0", paddingLeft: "0", paddingRight: "0" });
    const stampShown = () => /t-stamp/.test(toastEl.innerHTML) && toastEl.classList.contains("stamped");
    FD.setCatalogFillFields(FIELDS);
    AS.setCards([
      { id: "c-sworn", c: "orders", t: "Sworn", en: "Order {order number} is promised today.", commits: 1 },
      { id: "c-loose", c: "orders", t: "Loose", en: "Order {order number} may go today." },
    ]);
    class Hit7 extends El {
      get dataset() { const d = {}; for (const k in this.attrs) if (k.startsWith("data-")) d[k.slice(5)] = this.attrs[k]; return d; }
      matches(sel) { const m = /^\.([\w-]+)\[([\w-]+)\]$/.exec(sel); return m ? this.classList.contains(m[1]) && m[2] in this.attrs : super.matches(sel); }
    }
    const list7 = new El("div", { id: "list" }), block7 = {};
    for (const id of ["c-sworn", "c-loose"]) block7[id] = list7.appendChild(new Hit7("div", { class: "card", "data-id": id })).appendChild(new Hit7("p", { class: "txt", "data-v": "0" }));
    els["#list"] = list7; Dom.grabDom(); LP.wireListPointer();
    /* One copy by one route; `asked` is whether the question stood with nothing copied yet. */
    const route = (how, id) => {
      const sink = {};
      AS.setFieldVals(how === "ask" ? { order: "MRB-2024-10412" } : {});
      toastEl.innerHTML = ""; toastEl.textContent = ""; toastEl.classList.remove("stamped"); toastEl.classList.remove("show");
      navigator.clipboard = { writeText: t => { sink.got = t; return { then(ok) { ok(); } }; } };
      if (how === "key") { AS.putEntrySel({ id, vi: 0 }); CE.copyEntrySel(false); }
      if (how === "click") fire(block7[id], "click", { button: 0 });
      if (how === "ask") PICK.answerPick("ask", JSON.stringify({ id, vi: 0 }));
      const asked = how === "ask" || (!!asking() && sink.got === undefined);
      if (how !== "ask" && asking()) { inputs()[0].value = "MRB-2024-10412"; fire(inputs()[0], "keydown", { key: "Enter" }); }
      navigator.clipboard = null;
      return { asked, copied: /MRB-2024-10412/.test(sink.got || ""), stamped: stampShown() };
    };
    const ok7 = (r, want) => r.asked && r.copied && r.stamped === want;
    try {
      const r = {
        a: route("key", "c-sworn"), b: route("click", "c-sworn"), c: route("ask", "c-sworn"),
        d: route("key", "c-loose"), e: route("click", "c-loose"), f: route("ask", "c-loose"),
      };
      check(ok7(r.a, true), "7a the keyboard copy of a card that commits asks, then copies, toast stamped: " + JSON.stringify(r.a));
      check(ok7(r.b, true), "7b the click copy of a card that commits asks, then copies, toast stamped: " + JSON.stringify(r.b));
      check(ok7(r.c, true), "7c the picker's ask copy of a card that commits, toast stamped: " + JSON.stringify(r.c));
      check(ok7(r.d, false), "7d control: the keyboard copy of a card that does not commit, toast not stamped: " + JSON.stringify(r.d));
      check(ok7(r.e, false), "7e control: the click copy of a card that does not commit, toast not stamped: " + JSON.stringify(r.e));
      check(ok7(r.f, false), "7f control: the picker's ask copy of a card that does not commit, toast not stamped: " + JSON.stringify(r.f));
    } finally {
      navigator.clipboard = null; if (asking()) fire(inputs()[0], "keydown", { key: "Escape" });
      delete els["#list"]; delete els["#toast"]; Dom.grabDom();
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
