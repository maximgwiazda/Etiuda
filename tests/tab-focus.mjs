/* Tab walks the desk's main screen, and the chat tabs move on their own chords.
 *
 *   node tests/tab-focus.mjs
 *
 * No window and no browser. Card markup and the shortcut table are the modules, called.
 * The note's place in the walk is read off the sheet, on a default desk.
 * The tab strip and the shell's chord are sliced out of the source and run here, the same
 * way tests/test.js runs a dialog's Tab. Every card word is invented.
 *
 * Exit code is the number of failed checks.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const LAYERS = require("./css-layers.js");

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MOD = n => pathToFileURL(join(ROOT, "src", "modules", n)).href;
const read = n => readFileSync(join(ROOT, n), "utf8");

const mem = new Map();
const store = {
  getItem: k => mem.has(k) ? mem.get(k) : null,
  setItem: (k, v) => mem.set(String(k), String(v)),
  removeItem: k => mem.delete(k)
};
const heard = [];
const byId = {};
function makeEl(id, extra) {
  const kids = [];
  const node = {
    id, tagName: "DIV", hidden: false, className: "", offsetWidth: 20, offsetHeight: 20,
    parentNode: null, kids, attrs: {}, tabbable: false, value: "",
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() { return false; } },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { kids.push(c); c.parentNode = this; return c; },
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; },
    querySelector(s) {
      if (s === ".modal-card") return kids.find(k => String(k.className).indexOf("modal-card") >= 0) || null;
      return null;
    },
    querySelectorAll(s) {
      const sel = String(s);
      if (sel.indexOf("button") >= 0 || sel.indexOf("tabindex") >= 0) return kids.filter(k => k.tabbable);
      return [];
    },
    focus() { globalThis.document.activeElement = this; },
    matches() { return false; },
    closest() { return null; },
    addEventListener() {},
    blur() {}
  };
  return Object.assign(node, extra || {});
}
const body = makeEl("body");
body.tagName = "BODY";
body.classList = { add() {}, remove() {}, contains() { return false; }, toggle() { return false; } };
const modal = makeEl("modal");
modal.hidden = true;
const modalCard = makeEl("modalCard");
modalCard.className = "modal-card";
modal.kids.push(modalCard); modalCard.parentNode = modal;
const first = makeEl("modalX", { tabbable: true, tagName: "BUTTON" });
const mid = makeEl("field", { tabbable: true, tagName: "INPUT" });
const last = makeEl("save", { tabbable: true, tagName: "BUTTON" });
[first, mid, last].forEach(k => { modalCard.kids.push(k); k.parentNode = modalCard; });
const cover = makeEl("cover");
cover.className = "modal";
const coverCard = makeEl("coverCard");
coverCard.className = "modal-card";
cover.kids.push(coverCard); coverCard.parentNode = cover;
const coverBtn = makeEl("ecYes", { tabbable: true, tagName: "BUTTON" });
coverCard.kids.push(coverBtn); coverBtn.parentNode = coverCard;
let covers = [];
globalThis.window = {
  innerWidth: 1280, innerHeight: 800, localStorage: store, E_HOST: null,
  addEventListener(type, fn, cap) { heard.push({ type, fn, cap }); },
  dispatchEvent(e) { (this._sent = this._sent || []).push(e); return true; }
};
globalThis.localStorage = store;
globalThis.addEventListener = (type, fn, cap) => { heard.push({ type, fn, cap }); };
globalThis.requestAnimationFrame = fn => 0;
globalThis.cancelAnimationFrame = () => {};
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language: "en-US", languages: ["en-US"] } });
class KE {
  constructor(type, init) { this.type = type; Object.assign(this, init || {}); }
}
globalThis.KeyboardEvent = KE;
globalThis.document = {
  body, documentElement: makeEl("html"), activeElement: body,
  querySelector(s) { return byId[s] || null; },
  getElementById(id) { return byId["#" + id] || null; },
  querySelectorAll(s) {
    if (s === "body > .modal:not(#modal):not(.e-gone)") return covers.slice();
    if (s === "kbd[data-sc]") return [];
    return [];
  },
  createElement() { return makeEl("", { getContext: () => ({}) }); },
  createRange() { return {}; },
  addEventListener() {},
  contains() { return false; }
};
Object.assign(byId, {
  "#modal": modal, "#modalCard": modalCard, "#intent": makeEl("intent", { tagName: "INPUT", value: "" }),
  "#pax": makeEl("pax", { tagName: "INPUT", value: "" }), "#roleSel": makeEl("roleSel"),
  "#settingsMenu": makeEl("settingsMenu", { hidden: true }), "#moreMenu": makeEl("moreMenu", { hidden: true }),
  "#factsPanel": makeEl("factsPanel", { hidden: true }), "#list": makeEl("list"), "#seg": null, "#pills": null
});

let pass = 0, fail = 0;
const check = (mod, name, fn) => {
  let ok = false, detail = "";
  try {
    const r = fn();
    ok = r === true;
    if (!ok) detail = typeof r === "string" ? r : "returned " + JSON.stringify(r);
  } catch (e) {
    detail = String(e && e.message || e).split("\n")[0].slice(0, 180);
  }
  (ok ? pass++ : fail++);
  console.log("  " + (ok ? "ok  " : "FAIL") + " " + mod + ": " + name + (ok ? "" : "  [" + detail + "]"));
};
const eq = (got, want) => got === want ? true : "got " + JSON.stringify(got) + " want " + JSON.stringify(want);

function extractDecl(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error("missing " + marker);
  let par = 0, brk = 0, brc = 0, saw = false;
  for (let i = at; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") par++; else if (ch === ")") par--;
    else if (ch === "[") brk++; else if (ch === "]") brk--;
    else if (ch === "{") { brc++; saw = true; }
    else if (ch === "}") { brc--; if (saw && !par && !brk && !brc) return src.slice(at, i + 1); }
  }
  throw new Error("unterminated " + marker);
}

const ST = await import(MOD("storage.js"));
const UL = await import(MOD("ui-lang.js"));
const H = await import(MOD("hooks.js"));
H.hooks.segFolded = () => false;
H.hooks.updateIntentPlaceholder = () => {};
H.hooks.tourActive = () => false;
H.hooks.endTour = () => {};
const Dom = await import(MOD("dom.js"));
Dom.grabDom();
const SC = await import(MOD("shortcuts.js"));
SC.loadShortcuts();
const CB = await import(MOD("card-body.js"));
const SL = await import(MOD("shortcuts-list.js"));
const KD = await import(MOD("keydown.js"));
const mark = heard.length;
KD.wireGlobalKeydown();
const pageKeys = heard.slice(mark).filter(h => h.type === "keydown").map(h => h.fn);
const ran = [];
H.hooks.runShortcut = id => { ran.push(id); return true; };

function press(partial) {
  ran.length = 0;
  const e = Object.assign({
    key: "", code: "", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, repeat: false,
    target: globalThis.document.activeElement, defaultPrevented: false,
    preventDefault() { e.defaultPrevented = true; }, stopPropagation() {}
  }, partial);
  pageKeys.forEach(fn => fn(e));
  return e;
}
function chordOf(id) {
  const d = SC.SC_DEFS.find(x => x.id === id);
  return d ? [d.def.code, d.def.key, d.def.ctrl, d.def.alt, d.def.shift, d.def.meta, d.inField ? 1 : 0].join(":") : "missing";
}
const card = {
  id: "c-lamp", c: "lamps", t: "Lamp shade", tPl: "Abazur",
  en: "The shade is warm.", pl: "Klosz jest cieply.",
  note: "Mind the cord.", notePl: "Pilnuj sznura."
};
const ctx = { hit: false, catHit: false, fav: false, band: "0", other: "pl", dragTip: "Move this card" };
function cardActs(lang) {
  if (lang) ST.lsSet("eUiLang", lang); else ST.lsDel("eUiLang");
  const html = CB.cardBodyHtml(card, 0, ctx).cardH;
  const buttons = [];
  const bre = /<button\b([^>]*)>/g;
  for (let m; (m = bre.exec(html)); ) buttons.push(m[1]);
  const attr = (s, n) => { const mm = new RegExp("\\s" + n + '="([^"]*)"').exec(s); return mm ? mm[1] : ""; };
  const acts = buttons.filter(s => /data-act=/.test(s)).map(s => attr(s, "data-act") + "|" + attr(s, "aria-label") + (/\stabindex\s*=\s*"?-1/.test(s) ? "|stop" : ""));
  const txt = [];
  const tre = /<div class="txt[^"]*"[^>]*>/g;
  for (let m; (m = tre.exec(html)); ) txt.push(m[0]);
  return { acts, txtStopped: txt.some(t => /tabindex/.test(t)), n: txt.length };
}

check("card-body.js", "810tf1 a card's note, edit, hide and star are buttons in that order, named in English and Polish, and the reply text is not a tab stop",
  () => {
    const en = cardActs("en"), pl = cardActs("pl");
    ST.lsDel("eUiLang");
    const sheet = read("src/template.html");
    const edge = [".cacts button:focus-visible{box-shadow:inset 0 0 0 1px var(--accent)}",
      ".cacts button.danger:focus-visible{box-shadow:inset 0 0 0 1px #c44}",
      ".cacts button.star-btn:focus-visible{box-shadow:inset 0 0 0 1px var(--fav)}"].every(s => sheet.indexOf(s) >= 0);
    return eq([en.acts.join(" ~ "), en.txtStopped, en.n > 0, pl.acts.join(" ~ "), pl.txtStopped, edge].join(" || "),
      ["note|Internal note ~ edit|Edit this card ~ hide|Put this card away: it greys out at the foot of this category ~ fav|Add to Favourites",
        false, true,
        "note|Notatka wewnętrzna ~ edit|Edytuj tę kartę ~ hide|Odłóż tę kartę: trafi, wyszarzona, na koniec swojej kategorii ~ fav|Dodaj do Ulubionych",
        false, true].join(" || "));
  });

/* A default desk has body.note-hover and a mouse, so a rule inside @media (hover:hover) applies
   and one inside (hover:none), (pointer:coarse), a width or height breakpoint, or forced-colors
   does not. A card control is out of the tab walk when display is none, visibility is hidden or
   collapse, or content-visibility is hidden, on the control or an ancestor: those skip it, so a
   :focus rule beside them never meets it on the way in. A zero box does not skip it. The note is
   that zero box at rest, so a pointer does not see it, and keyboard focus must give the box back.
   Enter is left for the button, which opens the note; Space still goes to the lanes. */
check("template.html", "810tf8 on a default desk the note, edit, hide and star stay in the tab walk, keyboard focus shows the note, and Enter opens it",
  () => {
    const raw = read("src/template.html");
    const sheet = styleBlock(raw);
    if (!sheet) return "no style block";
    let parsed;
    try { parsed = LAYERS.parseSheet(sheet.css, sheet.lineAt); }
    catch (e) { return "the sheet could not be read: " + String(e).split("\n")[0].slice(0, 160); }
    const tree = cactsTree();
    const badMatch = matcherSelfCheck(tree);
    if (badMatch) return badMatch;
    const spans = mediaSpans(sheet.css, sheet.lineAt);
    const onDesk = d => spans.filter(s => d.line >= s.from && d.line <= s.to).every(s => deskMedia(s.cond));
    const unread = [];
    const ask = (sel, el, focus) => {
      try { return selHits(sel, el, focus); }
      catch (e) {
        if (couldHit(sel)) unread.push(sel.slice(0, 80) + " (" + String(e.message || e).slice(0, 60) + ")");
        return false;
      }
    };
    const out = [];
    for (const el of tree.all) {
      const hit = takenOut(el, null, parsed.decls, onDesk, ask);
      if (hit) out.push((el.attrs["data-act"] || el.tag) + " " + hit);
    }
    if (unread.length) return "could not read a selector that might hide a control: " + unread.slice(0, 3).join(" | ");
    if (out.length) return "out of the walk at rest: " + out.join("; ");
    if (noteShown(tree.note, null, parsed.decls, onDesk, ask)) return "at rest the note still paints, so a pointer sees it";
    const focused = takenOut(tree.note, tree.note, parsed.decls, onDesk, ask);
    if (focused) return "keyboard focus takes the note out of the walk: " + focused;
    if (!noteShown(tree.note, tree.note, parsed.decls, onDesk, ask)) return "keyboard focus leaves the note with nothing a person can see";
    const lp = read("src/modules/list-pointer.js");
    if (lp.indexOf('else if(act==="note") toggleNotePane(actBtn, id);') < 0) return "the note's click does not open the pane";
    const saved = globalThis.document.activeElement;
    const btn = makeEl("noteKey", { tagName: "BUTTON" });
    btn.matches = sel => sel === "button:not([disabled]),summary,a[href],[role=menuitem]";
    let enter, space, enterRan, spaceRan;
    try {
      globalThis.document.activeElement = btn;
      enter = press({ key: "Enter", code: "Enter" });
      enterRan = ran.slice();
      space = press({ key: " ", code: "Space" });
      spaceRan = ran.slice();
    } finally { globalThis.document.activeElement = saved; }
    return eq([out.length, enter.defaultPrevented, enterRan.join("+"), space.defaultPrevented, spaceRan.join("+")].join("|"),
      "0|false||true|lanes");
  });

check("shortcuts.js", "810tf2 Tab matches no chat-tab chord, Ctrl+Tab runs the next tab, and Ctrl+Shift+Tab runs the previous",
  () => {
    covers = []; modal.hidden = true; globalThis.document.activeElement = body;
    const plain = press({ key: "Tab", code: "Tab" });
    const plainRan = ran.slice();
    const next = press({ key: "Tab", code: "Tab", ctrlKey: true });
    const nextRan = ran.slice();
    const prev = press({ key: "Tab", code: "Tab", ctrlKey: true, shiftKey: true });
    const prevRan = ran.slice();
    const shift = press({ key: "Tab", code: "Tab", shiftKey: true });
    return eq([
      chordOf("tabNext"), chordOf("tabPrev"),
      plain.defaultPrevented, plainRan.join("+"),
      next.defaultPrevented, nextRan.join("+"),
      prev.defaultPrevented, prevRan.join("+"),
      shift.defaultPrevented, ran.join("+")
    ].join(" | "),
    "Tab:Tab:1:0:0:0:1 | Tab:Tab:1:0:1:0:1 | false |  | true | tabNext | true | tabPrev | false | ");
  });

check("shortcuts.js", "810tf3 Ctrl+T opens a tab, which is what Shift+Tab used to do, and Shift+Tab itself runs nothing",
  () => {
    covers = []; modal.hidden = true; globalThis.document.activeElement = body;
    const open = press({ key: "t", code: "KeyT", ctrlKey: true });
    const opened = ran.slice();
    const shift = press({ key: "Tab", code: "Tab", shiftKey: true });
    const rs = read("src/modules/run-shortcut.js");
    const prevAt = rs.indexOf('if(id==="tabPrev"){ stepTab(-1); return true; }');
    const nextAt = rs.indexOf('if(id==="tabNext"){ stepTab(1); return true; }');
    const newAt = rs.indexOf('if(id==="tabNew"){ addTab(); return true; }');
    return eq([chordOf("tabNew"), open.defaultPrevented, opened.join("+") + "/" + shift.defaultPrevented,
      prevAt > nextAt && newAt > prevAt].join(" | "),
      "KeyT:t:1:0:0:0:1 | true | tabNew/false | true");
  });

check("keydown.js", "810tf4 a cover and a dialog still walk on Tab and Shift+Tab, and Ctrl+Tab moves neither",
  () => {
    const walk = (host, cardEl, from) => {
      globalThis.document.activeElement = from;
      const fwd = press({ key: "Tab", code: "Tab" });
      const atF = globalThis.document.activeElement.id;
      globalThis.document.activeElement = from;
      const back = press({ key: "Tab", code: "Tab", shiftKey: true });
      const atB = globalThis.document.activeElement.id;
      globalThis.document.activeElement = from;
      const chord = press({ key: "Tab", code: "Tab", ctrlKey: true });
      return [atF, fwd.defaultPrevented, atB, back.defaultPrevented, globalThis.document.activeElement.id, chord.defaultPrevented, ran.join("+")].join(",");
    };
    modal.hidden = true; covers = [cover];
    const covered = walk(cover, coverCard, coverCard);
    covers = []; modal.hidden = false;
    const dialog = walk(modal, modalCard, modalCard);
    modal.hidden = true;
    return eq(covered + " || " + dialog,
      "ecYes,true,ecYes,true,coverCard,false, || modalX,true,save,true,modalCard,false,");
  });

check("shortcuts-list.js", "810tf5 the shortcuts list shows Ctrl+Tab, Ctrl+Shift+Tab and Ctrl+T, in English and Polish",
  () => {
    const paint = () => { const b = { innerHTML: "", querySelectorAll: () => [] }; SL.wireShortcutsList(b, () => {}); return b.innerHTML; };
    const row = (html, id) => {
      const at = html.indexOf('data-sc="' + id + '"');
      const nxt = html.indexOf('data-sc="', at + 8);
      const chunk = html.slice(at, nxt < 0 ? html.length : nxt);
      const chord = (/data-slot="1"[^>]*>([^<]*)</.exec(chunk) || [])[1] || "";
      const label = (/class="sc-label">([^<]*)</.exec(chunk) || [])[1] || "";
      return label + "=" + chord;
    };
    ST.lsDel("eUiLang");
    const en = paint();
    ST.lsSet("eUiLang", "pl");
    const pl = paint();
    ST.lsDel("eUiLang");
    return eq([row(en, "tabNext"), row(en, "tabPrev"), row(en, "tabNew"), row(pl, "tabPrev"), row(pl, "tabNew")].join(" | "),
      "Next tab=Ctrl+Tab | Previous tab=Ctrl+Shift+Tab | New tab=Ctrl+T | Poprzednia rozmowa=Ctrl+Shift+Tab | Nowa rozmowa=Ctrl+T");
  });

check("tabs.js", "810tf6 each conversation's name is a tab stop, named as it reads, and Enter switches to it; Space is left alone"
  + " and passes on, as it is the lanes' key wherever the focus sits (board 883)",
  () => {
    const tabsSrc = read("src/modules/tabs.js");
    const labelOf = new Function("t", "tabs", extractDecl(tabsSrc, "function tabLabel(") + "\nreturn tabLabel;");
    class El {
      constructor() { this.attrs = {}; this.kids = []; this.cls = new Set(); this.dataset = {}; this.style = {}; }
      set className(v) { this.cls = new Set(String(v || "").split(/\s+/).filter(Boolean)); }
      get className() { return [...this.cls].join(" "); }
      setAttribute(k, v) { this.attrs[k] = String(v); }
      getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
      appendChild(c) { this.kids.push(c); return c; }
      set innerHTML(v) { if (v === "") this.kids = []; }
      querySelectorAll() { return []; }
    }
    const draw = (lang) => {
      if (lang) ST.lsSet("eUiLang", lang); else ST.lsDel("eUiLang");
      const tabs = [{ id: "a", pax: "Marta Lind" }, { id: "b", pax: "" }];
      const bar = new El();
      const wrap = new El();
      bar.parentElement = wrap;
      wrap.querySelectorAll = () => [];
      let switched = null;
      const fn = new Function("document", "$", "tabs", "activeTabId", "t", "tabLabel", "drawTabs", "bindTabScroll",
        "fitTabLabels", "requestAnimationFrame", "tabAddTitle", "ICON_TAB_X", "ICON_TAB_ADD", "tabDrag", "switchTab", "scrollTabIntoView", "closeTab",
        extractDecl(tabsSrc, "function drawTabsCore(") + "\nreturn drawTabsCore;");
      fn({ createElement: () => new El() }, s => (s === "#tabsBar" ? bar : s === "#tabsWrap" ? wrap : null),
        tabs, "a", UL.t, labelOf(UL.t, tabs), {}, () => {}, () => {}, () => {}, () => "", "", "", null,
        id => { switched = id; }, () => {}, () => {})();
      const row = el => {
        const name = el.kids[0];
        const shown = name.kids[0] && name.kids[0].textContent;
        const ev = { key: "", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, prevented: false, stopped: false,
          preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
        ev.key = "Enter"; name.onkeydown(ev);
        const entered = switched; switched = null;
        ev.key = " "; ev.prevented = false; ev.stopped = false; name.onkeydown(ev);
        const spaced = switched, spaceKept = ev.prevented || ev.stopped;
        ev.key = "Enter"; ev.ctrlKey = true; ev.prevented = false; switched = null; name.onkeydown(ev);
        return [name.tabIndex, name.getAttribute("role"), name.getAttribute("aria-label"), shown, entered, spaced, spaceKept, switched, ev.prevented].join("/");
      };
      return [row(bar.kids[0]), row(bar.kids[1]), wrap.kids.length].join(" || ");
    };
    const sheet = read("src/template.html");
    const face = sheet.indexOf(".tab:hover,.tab:focus-visible,.tab:focus-within{") >= 0
      && sheet.indexOf('id="tabsPrev" tabindex="-1"') >= 0 && sheet.indexOf('id="tabsNext" tabindex="-1"') >= 0;
    const en = draw("en"), pl = draw("pl");
    ST.lsDel("eUiLang");
    return eq([en, pl, face].join(" ## "),
      ["0/tab/Marta/Marta/a//false//false || 0/tab/Tab 2/Tab 2/b//false//false || 1",
        "0/tab/Marta/Marta/a//false//false || 0/tab/Rozmowa 2/Rozmowa 2/b//false//false || 1",
        true].join(" ## "));
  });

check("shell/main.js", "810tf7 the shell forwards Ctrl+Tab and Ctrl+Shift+Tab to the page and leaves every other chord alone",
  () => {
    const src = read("shell/main.js");
    const route = new Function(extractDecl(src, "function routeTabChord(") + "\nreturn routeTabChord;")();
    const pre = read("shell/preload.js");
    const host = read("src/modules/host.js");
    const on = src.indexOf('win.webContents.on("before-input-event"');
    const block = src.slice(on, src.indexOf("theWindow = win", on));
    const cases = [
      route({ type: "keyDown", control: true, alt: false, meta: false, shift: false, key: "Tab", code: "Tab" }),
      route({ type: "keyDown", control: true, alt: false, meta: false, shift: true, key: "Tab", code: "Tab", isAutoRepeat: true }),
      route({ type: "keyDown", control: true, alt: true, meta: false, shift: false, key: "Tab", code: "Tab" }),
      route({ type: "keyDown", control: false, alt: false, meta: false, shift: false, key: "Tab", code: "Tab" }),
      route({ type: "keyDown", control: true, alt: false, meta: false, shift: false, key: "t", code: "KeyT" }),
      route({ type: "keyUp", control: true, alt: false, meta: false, shift: false, key: "Tab", code: "Tab" }),
      route(null)
    ].map(v => v ? (v.shift ? "shift" : "next") : "-").join(",");
    const page = awaitHost(host);
    return eq([cases, block.indexOf("e.preventDefault()") > -1 && block.indexOf('send("etiuda:tab-chord"') > -1,
      pre.indexOf('ipcRenderer.on("etiuda:tab-chord"') > -1, page].join(" | "),
      "next,shift,-,-,-,-,- | true | true | Tab:true:true");
  });

function awaitHost(hostSrc) {
  const fn = new Function("window", extractDecl(hostSrc, "function dispatchTabChord(") + "\ndispatchTabChord(true);");
  const sent = [];
  fn({ dispatchEvent: e => { sent.push(e); return true; } });
  const e = sent[0] || {};
  return [e.key, e.ctrlKey, e.shiftKey].join(":");
}

function styleBlock(html) {
  const a = html.indexOf("<style>"), b = html.indexOf("</style>", a);
  if (a < 0 || b < 0) return null;
  const from = a + "<style>".length;
  const css = html.slice(from, b);
  const head = html.slice(0, from).split("\n").length - 1;
  return { css, lineAt: i => head + css.slice(0, i).split("\n").length };
}
function mediaSpans(css, lineAt) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
  const spans = [], stack = [];
  let i = 0, depth = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < text.length && text[i] !== q) { if (text[i] === "\\") i++; i++; }
      i++; continue;
    }
    if (text.startsWith("@media", i) && /[^A-Za-z0-9-]/.test(text[i + 6] || "{")) {
      let j = i + 6, d = 0, str = 0;
      while (j < text.length) {
        const e = text[j];
        if (str) { if (e === "\\") j++; else if (e === str) str = 0; j++; continue; }
        if (e === '"' || e === "'") { str = e; j++; continue; }
        if (e === "(") d++;
        else if (e === ")") d--;
        else if (d === 0 && e === "{") break;
        j++;
      }
      stack.push({ cond: text.slice(i, j).replace(/\s+/g, " ").trim(), from: lineAt(i), depth: depth + 1 });
      i = j; continue;
    }
    if (c === "{") { depth++; i++; continue; }
    if (c === "}") {
      depth--;
      const to = lineAt(i);
      while (stack.length && stack[stack.length - 1].depth > depth) spans.push(Object.assign(stack.pop(), { to }));
      i++; continue;
    }
    i++;
  }
  return spans;
}
/* A mouse desk at the sheet's ordinary width. A narrow window, a coarse pointer and forced colours are other desks. */
function deskMedia(cond) {
  const s = String(cond).toLowerCase().replace(/\s+/g, "");
  if (s.includes("hover:none")) return false;
  if (s.includes("pointer:coarse")) return false;
  if (s.includes("forced-colors")) return false;
  if (s.includes("prefers-reduced-motion") || s.includes("prefers-color-scheme")) return false;
  if (s.includes("max-width:") || s.includes("max-height:") || s.includes("min-width:") || s.includes("min-height:")) return false;
  return true;
}
function cactsNode(tag, o) {
  return { tag, id: (o && o.id) || "", classes: new Set((o && o.classes) || []), attrs: Object.assign({}, (o && o.attrs) || {}), parent: null, kids: [] };
}
function cactsAdd(p, c) { c.parent = p; p.kids.push(c); return c; }
function cactsTree() {
  const html = cactsNode("html"), body = cactsAdd(html, cactsNode("body", { classes: ["note-hover"] }));
  const list = cactsAdd(body, cactsNode("div", { id: "list" }));
  const card = cactsAdd(list, cactsNode("div", { classes: ["card"] }));
  const chead = cactsAdd(card, cactsNode("div", { classes: ["chead"] }));
  const cacts = cactsAdd(chead, cactsNode("span", { classes: ["cacts"] }));
  const note = cactsAdd(cacts, cactsNode("button", { attrs: { type: "button", "data-act": "note", "aria-expanded": "false" } }));
  const edit = cactsAdd(cacts, cactsNode("button", { attrs: { type: "button", "data-act": "edit" } }));
  const hide = cactsAdd(cacts, cactsNode("button", { classes: ["danger"], attrs: { type: "button", "data-act": "hide" } }));
  const star = cactsAdd(cacts, cactsNode("button", { classes: ["star-btn"], attrs: { type: "button", "data-act": "fav", "aria-pressed": "false" } }));
  return { note, edit, hide, star, all: [note, edit, hide, star] };
}
function couldHit(sel) {
  const s = String(sel).toLowerCase();
  if (/(^|[^-\w])\*(?![-\w])/.test(s)) return true;
  return ["button", "cacts", "card", "chead", "note-hover", "star-btn", "danger", "body", "html"].some(n => s.includes(n));
}
function balEnd(s, i, open, close) {
  let d = 0, str = 0;
  for (let j = i; j < s.length; j++) {
    const e = s[j];
    if (str) { if (e === "\\") { j++; continue; } if (e === str) str = 0; continue; }
    if (e === '"' || e === "'") { str = e; continue; }
    if (e === open) d++;
    else if (e === close) { d--; if (d === 0) return j + 1; }
  }
  throw new Error("unbalanced in " + s.slice(0, 40));
}
function splitSel(s) {
  const out = [];
  let d = 0, str = 0, start = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (str) { if (c === "\\") k++; else if (c === str) str = 0; continue; }
    if (c === '"' || c === "'") { str = c; continue; }
    if (c === "(" || c === "[") d++;
    else if (c === ")" || c === "]") d--;
    else if (c === "," && d === 0) { out.push(s.slice(start, k).trim()); start = k + 1; }
  }
  out.push(s.slice(start).trim());
  return out.filter(Boolean);
}
function readSimple(s, i) {
  const c = s[i];
  if (c === "*") return { end: i + 1, node: { t: "*" } };
  if (c === ".") {
    const m = /^\.[-\w\\]+/.exec(s.slice(i));
    if (!m) throw new Error("class");
    return { end: i + m[0].length, node: { t: "class", n: m[0].slice(1) } };
  }
  if (c === "#") {
    const m = /^#[-\w\\]+/.exec(s.slice(i));
    if (!m) throw new Error("id");
    return { end: i + m[0].length, node: { t: "id", n: m[0].slice(1) } };
  }
  if (c === "[") {
    const end = balEnd(s, i, "[", "]");
    const inner = s.slice(i + 1, end - 1).trim();
    const m = /^([-\w]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?$/.exec(inner);
    if (!m) throw new Error("attr " + inner.slice(0, 30));
    return { end, node: { t: "attr", n: m[1], op: m[2] || "", v: m[3] != null ? m[3] : m[4] != null ? m[4] : m[5] != null ? m[5] : "" } };
  }
  if (c === ":") {
    if (s[i + 1] === ":" || /^:(before|after|first-line|first-letter|placeholder|selection|backdrop|marker|highlight)\b/.test(s.slice(i))) {
      const m = /^::?-?[-\w]+/.exec(s.slice(i));
      let j = i + (m ? m[0].length : 2);
      if (s[j] === "(") j = balEnd(s, j, "(", ")");
      return { end: j, pseudoEl: true };
    }
    const m = /^:([-\w]+)/.exec(s.slice(i));
    if (!m) throw new Error("pseudo");
    let j = i + m[0].length, arg = null;
    if (s[j] === "(") { const end = balEnd(s, j, "(", ")"); arg = s.slice(j + 1, end - 1); j = end; }
    return { end: j, node: { t: "pseudo", n: m[1].toLowerCase(), arg } };
  }
  if (/[A-Za-z_]/.test(c)) {
    const m = /^[A-Za-z_][-\w]*/.exec(s.slice(i));
    return { end: i + m[0].length, node: { t: "tag", n: m[0].toLowerCase() } };
  }
  throw new Error("at '" + s.slice(i, i + 16) + "'");
}
function parseChain(sel) {
  const s = String(sel).trim();
  const chain = [];
  let i = 0, pending = null;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (chain.length && pending == null && /[>+~]/.test(s[i])) {
      pending = s[i++]; while (i < s.length && /\s/.test(s[i])) i++;
    } else if (chain.length && pending == null) pending = " ";
    const simples = [];
    let pseudoEl = false;
    if (i >= s.length) throw new Error("empty compound");
    while (i < s.length && !/\s/.test(s[i]) && !/[>+~]/.test(s[i])) {
      const sim = readSimple(s, i);
      i = sim.end;
      if (sim.pseudoEl) pseudoEl = true;
      else simples.push(sim.node);
    }
    chain.push({ comb: pending, simples, pseudoEl });
    pending = null;
  }
  if (!chain.length) throw new Error("empty selector");
  if (chain.some(c => c.pseudoEl)) return null;
  return chain;
}
function childIndex(el) {
  if (!el.parent) return 1;
  let i = 0;
  for (const k of el.parent.kids) { i++; if (k === el) return i; }
  return 0;
}
function focusWithin(el, focus) {
  if (!focus) return false;
  for (let n = focus; n; n = n.parent) if (n === el) return true;
  return false;
}
function matchSimple(node, el, focus) {
  if (node.t === "*") return true;
  if (node.t === "tag") return el.tag === node.n;
  if (node.t === "class") return el.classes.has(node.n);
  if (node.t === "id") return el.id === node.n;
  if (node.t === "attr") {
    const has = Object.prototype.hasOwnProperty.call(el.attrs, node.n);
    if (!node.op) return has;
    if (!has) return false;
    const v = String(el.attrs[node.n]), w = node.v;
    if (node.op === "=") return v === w;
    if (node.op === "~=") return v.split(/\s+/).includes(w);
    if (node.op === "|=") return v === w || v.startsWith(w + "-");
    if (node.op === "^=") return v.startsWith(w);
    if (node.op === "$=") return v.endsWith(w);
    if (node.op === "*=") return v.includes(w);
    return false;
  }
  if (node.t === "pseudo") {
    const n = node.n;
    if (n === "hover" || n === "active" || n === "checked" || n === "disabled" || n === "required") return false;
    if (n === "enabled") return true;
    if (n === "root") return el.tag === "html";
    if (n === "focus" || n === "focus-visible") return el === focus;
    if (n === "focus-within") return focusWithin(el, focus);
    if (n === "empty") return el.kids.length === 0;
    if (n === "first-child") return childIndex(el) === 1;
    if (n === "last-child") return !!el.parent && childIndex(el) === el.parent.kids.length;
    if (n === "only-child") return !!el.parent && el.parent.kids.length === 1;
    if (n === "nth-child" || n === "nth-of-type") {
      const arg = String(node.arg || "").trim();
      const idx = childIndex(el);
      if (arg === "n" || arg === "1n" || arg === "n+0") return true;
      if (/^\d+$/.test(arg)) return idx === +arg;
      throw new Error("nth " + arg);
    }
    if (n === "not") return !splitSel(node.arg || "").some(p => selHits(p, el, focus));
    if (n === "is" || n === "where") return splitSel(node.arg || "").some(p => selHits(p, el, focus));
    if (n === "has") return hasRelative(el, node.arg || "", focus);
    throw new Error(":" + n);
  }
  return false;
}
function hasRelative(el, arg, focus) {
  return splitSel(arg).some(part => {
    const rel = part.trim();
    const walk = (node, sel) => {
      for (const k of node.kids) if (selHits(sel, k, focus) || walk(k, sel)) return true;
      return false;
    };
    if (rel[0] === ">") {
      const inner = rel.slice(1).trim();
      return el.kids.some(k => selHits(inner, k, focus));
    }
    return walk(el, rel);
  });
}
function matchCompound(simples, el, focus) {
  for (const n of simples) if (!matchSimple(n, el, focus)) return false;
  return simples.length > 0;
}
function selHits(sel, el, focus) {
  const chain = parseChain(sel);
  if (!chain) return false;
  let i = chain.length - 1, cur = el;
  if (!matchCompound(chain[i].simples, cur, focus)) return false;
  while (i > 0) {
    const comb = chain[i].comb, pred = chain[i - 1];
    i--;
    if (comb === ">") {
      cur = cur.parent;
      if (!cur || !matchCompound(pred.simples, cur, focus)) return false;
    } else if (comb === " ") {
      let found = false;
      cur = cur.parent;
      while (cur) { if (matchCompound(pred.simples, cur, focus)) { found = true; break; } cur = cur.parent; }
      if (!found) return false;
    } else if (comb === "+" || comb === "~") {
      if (!cur.parent) return false;
      const sibs = cur.parent.kids;
      const at = sibs.indexOf(cur);
      const from = comb === "+" ? at - 1 : 0;
      const upto = comb === "+" ? at - 1 : at - 1;
      let found = false, hit = null;
      for (let s = upto; s >= from && s >= 0; s--) {
        if (matchCompound(pred.simples, sibs[s], focus)) { found = true; hit = sibs[s]; if (comb === "+") break; }
      }
      if (!found) return false;
      cur = hit;
    } else return false;
  }
  return true;
}
function matcherSelfCheck(tree) {
  const cases = [
    ["body.note-hover .cacts [data-act=note]", tree.note, null, true],
    ["body.note-hover .cacts [data-act=note]", tree.star, null, false],
    [".cacts button.star-btn", tree.star, null, true],
    [".cacts button.star-btn", tree.note, null, false],
    [".cacts button", tree.edit, null, true],
    ["body.note-hover .cacts [data-act=note]:is(:focus,:focus-visible)", tree.note, null, false],
    ["body.note-hover .cacts [data-act=note]:is(:focus,:focus-visible)", tree.note, tree.note, true],
    ["body.shed-segfold #seg button:not(.on)", tree.note, null, false],
    ["[hidden]", tree.note, null, false],
    ["html.e-veiled body", tree.note, null, false],
    ["button:not([disabled])", tree.hide, null, true]
  ];
  for (const [sel, el, focus, want] of cases) {
    let got;
    try { got = selHits(sel, el, focus); }
    catch (e) { return "matcher threw on " + sel + ": " + e.message; }
    if (got !== want) return "matcher " + sel + " got " + got + " want " + want;
  }
  return "";
}
function layerRank(d) {
  if (d.layer == null) return 4;
  const rank = { base: 0, components: 1, states: 2, overrides: 3 };
  return Object.prototype.hasOwnProperty.call(rank, d.layer) ? rank[d.layer] : 4;
}
function declBeats(a, b) {
  if (a.imp !== b.imp) return a.imp;
  const ra = layerRank(a), rb = layerRank(b);
  if (ra !== rb) return a.imp ? ra < rb : ra > rb;
  const c = LAYERS.cmpSpec(a.spec, b.spec);
  if (c !== 0) return c > 0;
  return a.ord > b.ord;
}
function winning(el, prop, focus, decls, onDesk, ask) {
  let best = null;
  for (const d of decls) {
    if (d.prop !== prop || !onDesk(d)) continue;
    if (!ask(d.sel, el, focus)) continue;
    if (!best || declBeats(d, best)) best = d;
  }
  return best;
}
function normCss(v) { return String(v || "").toLowerCase().replace(/\s+/g, " ").trim(); }
function isNoneWord(v) { return normCss(v) === "none"; }
function isHiddenVis(v) { const s = normCss(v); return s === "hidden" || s === "collapse"; }
function takenOut(el, focus, decls, onDesk, ask) {
  for (let n = el; n; n = n.parent) {
    const disp = winning(n, "display", focus, decls, onDesk, ask);
    if (disp && isNoneWord(disp.val)) return "display:none `" + disp.sel + "` line " + disp.line;
    const cv = winning(n, "content-visibility", focus, decls, onDesk, ask);
    if (cv && normCss(cv.val) === "hidden") return "content-visibility:hidden `" + cv.sel + "` line " + cv.line;
  }
  for (let n = el; n; n = n.parent) {
    const vis = winning(n, "visibility", focus, decls, onDesk, ask);
    if (vis) return isHiddenVis(vis.val) ? "visibility:" + normCss(vis.val) + " `" + vis.sel + "` line " + vis.line : null;
  }
  return null;
}
function zeroLen(v) {
  if (v == null) return false;
  return String(v).toLowerCase().trim().split(/\s+/).every(p => /^(0|0px|0em|0rem|0%)$/.test(p));
}
function axisShown(sizeDecl, minDecl) {
  const size = sizeDecl ? normCss(sizeDecl.val) : "auto";
  const min = minDecl ? normCss(minDecl.val) : "auto";
  if (zeroLen(size)) return !zeroLen(min) && min !== "auto" && min !== "initial" && min !== "unset";
  return true;
}
function noteShown(el, focus, decls, onDesk, ask) {
  const w = winning(el, "width", focus, decls, onDesk, ask);
  const mw = winning(el, "min-width", focus, decls, onDesk, ask);
  const h = winning(el, "height", focus, decls, onDesk, ask);
  const mh = winning(el, "min-height", focus, decls, onDesk, ask);
  const pad = winning(el, "padding", focus, decls, onDesk, ask);
  const border = winning(el, "border", focus, decls, onDesk, ask);
  const ov = winning(el, "overflow", focus, decls, onDesk, ask);
  const wide = axisShown(w, mw), tall = axisShown(h, mh);
  const padShows = pad ? !zeroLen(pad.val) : false;
  const borderShows = border ? !zeroLen(border.val) : false;
  if (wide || tall || padShows || borderShows) return true;
  const clip = ov ? normCss(ov.val) : "visible";
  return clip === "visible";
}

console.log("tab-focus: " + pass + " passed, " + fail + " failed");
process.exit(fail);
