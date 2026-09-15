/* TWO RULES THAT TIE, AND THE ONE THE MARKUP LETS BOTH LAND ON. Board item 365.
 *
 *   node tests/css-order.js                 check src/template.html
 *   node tests/css-order.js --file <path>   check another copy of the sheet (an old blob)
 *   node tests/css-order.js --list          print every tie considered, not only the offenders
 *   node tests/css-order.js --all           the same rule over every property, not only display
 *
 * THE FAULT THIS EXISTS FOR. Before commit fea0ca7 the sheet held `.win-g-restore{display:none}`
 * and, three hundred lines later, `.ic{display:block}`. Equal specificity, the same layer, no
 * name in common, and one <svg class="ic win-g-restore"> in the static markup wearing both. The
 * later rule won because it was later, and the maximise button drew both of its glyphs. Nothing
 * in tests/ could see it: tests/css-layers.js judges a pair only where the two subject compounds
 * SHARE a class or an id, which is exactly what this pair does not do, and a computed-style
 * fingerprint reads what the cascade decided rather than whether the decision was an accident.
 *
 * THE METHOD. Parse the sheet (through the parser in css-layers.js, so there is one opinion in
 * tests/ about what a declaration is), parse the static markup into a tree, and give every
 * selector the set of boxes it matches - an element, or an element's pseudo-element, since
 * `.a::before` and `.b::before` contest one box and `.a::before` and `.b` do not. Then take
 * every pair of DISPLAY declarations that
 *
 *   - have equal specificity,        so specificity does not separate them,
 *   - sit in the same cascade layer, so the layer order does not separate them either,
 *   - carry the same importance, since an `!important` on one side settles it and the sheet
 *     uses exactly that to make `[hidden]` win over four author rules it ties with,
 *   - share no class name and no id name anywhere in either selector, so the author did not
 *     write them as a pair,
 *   - both match one box of the static markup, so they land together, and
 *   - carry different values, since the same value on both sides changes nothing,
 *
 * and fail naming them. What is left deciding such a pair is source order alone, which is a
 * line number: a rule moved, a block re-indented or a file split reverses it in silence.
 *
 * WHAT IT IS BLIND TO, stated so a green is read for what it is. The markup is the static
 * document: a class the shell adds at runtime (`body.e-host`) is not there, so a selector
 * needing one matches nothing here and every pair through it is invisible. Dynamic
 * pseudo-classes go the other way - `:hover` is treated as satisfiable, because an element that
 * can wear the class can enter the state - so a tie that needs a hover IS judged. And a pair
 * whose selectors never meet in the static markup but would meet on a card the engine builds at
 * runtime is invisible too; this gate reads the document as it is written.
 *
 * THE MATCHER REFUSES WHAT IT CANNOT READ. A selector shape it does not model raises, and the
 * gate exits 3 naming the selector. "Could not look" must never come out as "nothing there",
 * which is the cheapest way for a gate to be green and wrong.
 *
 * THE CONTROLS RUN ON EVERY INVOCATION, because a gate that has never rejected anything has not
 * been tested. Control A plants the historical shape into the real sheet: it finds a real
 * element wearing two classes, takes a live display rule on one of them, re-declares the other
 * in the same layer with a different value, and requires exactly that pair back. Control B
 * requires the count to return when the plant is removed. Controls C to L are short synthetic
 * sheets with their own six-line markup, one for each clause of the rule above, so that each
 * clause is known to be doing work: a tie that does not meet, unequal specificity, a different
 * layer, a shared class name, the same value, a pseudo-element box, an unreadable selector, an
 * importance on one side, and the synthesised body.
 *
 * Exit 0 clean, 1 a tie decided by source order, 2 misuse, 3 the sheet or the markup could not
 * be read, or a control did not fire, which is not a pass.
 */
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const L = require("./css-layers.js");

const TEMPLATE = "src/template.html";

/* ------------------------------------------------------------------ the markup

   A small tree, not a browser. The template carries no <html>, <head> or <body> tag, so the
   three are synthesised the way a parser would: metadata elements to the head, everything else
   to the body. Every `body ...` selector in the sheet depends on that, so control L asserts it.
*/
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
                      "param", "source", "track", "wbr"]);
/* What may sit in <head>, and only until the first element that may not: after that the head is
   closed and a top-level <script> belongs to the body, which is what a browser does. Measured
   against Chrome on 2026-09-15: with this rule the element sequence in document order is
   identical on both sides, 228 elements; with `script` left out of the set it differed at
   position 5. */
const METADATA = new Set(["meta", "title", "link", "base", "style", "script", "noscript", "template"]);
const blankOut = m => m.replace(/[^\n]/g, " ");

function parseMarkup(html) {
  /* Comments, and the CONTENT of <style> and <script>, are blanked: a brace or a less-than in a
     script is not markup. The tags themselves stay, so the tree keeps its shape. */
  let text = html.replace(/<!--[\s\S]*?-->/g, blankOut);
  text = text.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, b, c) => a + blankOut(b) + c);
  text = text.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, a, b, c) => a + blankOut(b) + c);

  const nodes = [];
  const mk = (tag, attrs, parent) => {
    const n = { i: nodes.length, tag: tag, attrs: attrs, parent: parent, kids: [], sib: 0, typeSib: 0 };
    nodes.push(n);
    if (parent) { n.sib = parent.kids.length + 1; parent.kids.push(n); }
    return n;
  };
  const html_ = mk("html", new Map(), null);
  const head = mk("head", new Map(), html_);
  const body = mk("body", new Map(), html_);

  const TAG = /<(\/?)([a-zA-Z][-\w:]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g;
  const ATTR = /([-\w:@.]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const stack = [];
  let headOpen = true;
  let m;
  while ((m = TAG.exec(text))) {
    /* The attribute run is greedy and swallows the slash of `<path ... />`, so the self-closing
       mark is read off the end of it rather than from its own group. */
    const closing = m[1] === "/", tag = m[2].toLowerCase();
    const self = m[4] === "/" || /(^|["'\s])\/\s*$/.test(m[3]);
    if (closing) {
      let k = stack.length - 1;
      while (k >= 0 && stack[k].tag !== tag) k--;
      if (k < 0) throw "a </" + tag + "> closing nothing, at offset " + m.index;
      if (k !== stack.length - 1)
        throw "</" + tag + "> closes over " + stack.slice(k + 1).map(n => "<" + n.tag + ">").join("") +
              ", at offset " + m.index;
      stack.pop();
      continue;
    }
    const attrs = new Map();
    let a;
    ATTR.lastIndex = 0;
    while ((a = ATTR.exec(m[3]))) attrs.set(a[1].toLowerCase(), a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : "");
    if (!stack.length && !METADATA.has(tag)) headOpen = false;
    const parent = stack.length ? stack[stack.length - 1] : (headOpen && METADATA.has(tag) ? head : body);
    const n = mk(tag, attrs, parent);
    if (!(self || VOID.has(tag))) stack.push(n);
  }
  if (stack.length) throw "the markup ends with " + stack.map(n => "<" + n.tag + ">").join("") + " still open";

  for (const n of nodes) {
    n.cls = new Set(String(n.attrs.get("class") || "").split(/\s+/).filter(Boolean));
    n.id = n.attrs.get("id") || null;
    let t = 0;
    if (n.parent) for (const k of n.parent.kids) { if (k.tag === n.tag) t++; if (k === n) break; }
    n.typeSib = t;
  }
  return { nodes: nodes, root: html_, body: body };
}

/* --------------------------------------------------------------- the matcher */

/* Treated as satisfiable: an element that can wear the class can enter the state, so a tie that
   needs one is still a tie. Anything not in either list raises, by design. */
const DYNAMIC = new Set(["hover", "focus", "focus-visible", "focus-within", "active", "link",
  "visited", "any-link", "target", "target-within", "checked", "indeterminate", "disabled",
  "enabled", "default", "placeholder-shown", "autofill", "valid", "invalid", "user-valid",
  "user-invalid", "in-range", "out-of-range", "required", "optional", "read-only", "read-write",
  "defined", "modal", "popover-open", "fullscreen", "picture-in-picture", "open", "closed",
  "playing", "paused", "muted", "seeking", "buffering", "stalled", "current", "past", "future"]);
/* A word boundary sits before a hyphen, so `\b` after these names reads `:placeholder-shown` as
   the pseudo-ELEMENT `:placeholder`. The lookahead is the fix; css-layers.js has the `\b` form
   and mis-scores that selector, which is why specOf() below re-asks the question. */
const PSEUDO_ELEMENT = /^::|^:(before|after|first-line|first-letter|placeholder|selection|backdrop|marker)(?![-\w])/;

/* THE SPECIFICITY THIS GATE BUCKETS BY. It comes from css-layers.js so that tests/ has one
   opinion, with one repair: measured on 2026-09-15, L.specificity("#intent:placeholder-shown")
   reads [1,0,1] where the selectors spec says [1,1,0], because of the `\b` above. A pseudo-class
   whose name merely BEGINS with a pseudo-element's name is renamed before the question is asked.
   Control M holds this to an answer key and requires the shim to be doing work, so that the day
   css-layers.js is repaired this line is seen to be redundant rather than quietly wrong. */
const PC_LOOKALIKE = /:(before|after|first-line|first-letter|placeholder|selection|backdrop|marker)(-[-\w]+)/g;
const specOf = sel => L.specificity(sel.replace(PC_LOOKALIKE, ":pseudoclass$2"));

/* A compound: everything up to the next top-level combinator. */
function splitCompounds(sel) {
  const out = [];
  let d = 0, str = 0, start = 0, comb = " ";
  const push = (end, nextComb) => {
    const piece = sel.slice(start, end).trim();
    if (piece) out.push({ comb: comb, text: piece });
    comb = nextComb;
  };
  for (let k = 0; k < sel.length; k++) {
    const c = sel[k];
    if (str) { if (c === "\\") k++; else if (c === str) str = 0; continue; }
    if (c === '"' || c === "'") { str = c; continue; }
    if (c === "(" || c === "[") { d++; continue; }
    if (c === ")" || c === "]") { d--; continue; }
    if (d === 0 && (c === ">" || c === "+" || c === "~")) { push(k, c); start = k + 1; continue; }
    if (d === 0 && /\s/.test(c)) {
      /* a run of whitespace is a descendant combinator unless a real combinator follows */
      let j = k;
      while (j < sel.length && /\s/.test(sel[j])) j++;
      if (j < sel.length && (sel[j] === ">" || sel[j] === "+" || sel[j] === "~")) { k = j - 1; continue; }
      if (j >= sel.length) break;
      push(k, " ");
      start = j;
      k = j - 1;
      continue;
    }
  }
  push(sel.length, null);
  return out;
}

/* The simple selectors of one compound, with the pseudo-element separated out. */
function parseCompound(t) {
  const out = { tag: null, id: null, cls: [], attrs: [], pseudo: [], el: null };
  let k = 0;
  const balanced = (from, open, close) => {
    let d = 1, j = from + 1, str = 0;
    while (j < t.length && d > 0) {
      const e = t[j];
      if (str) { if (e === str) str = 0; }
      else if (e === '"' || e === "'") str = e;
      else if (e === open) d++;
      else if (e === close) d--;
      j++;
    }
    if (d > 0) throw "an unbalanced " + open + " in {" + t + "}";
    return j;
  };
  while (k < t.length) {
    const c = t[k];
    if (c === "*") { k++; continue; }
    if (c === "#") { const m = /^#([-\w]+)/.exec(t.slice(k)); if (!m) throw "an id this matcher cannot read in {" + t + "}"; out.id = m[1]; k += m[0].length; continue; }
    if (c === ".") { const m = /^\.([-\w]+)/.exec(t.slice(k)); if (!m) throw "a class this matcher cannot read in {" + t + "}"; out.cls.push(m[1]); k += m[0].length; continue; }
    if (c === "[") { const end = balanced(k, "[", "]"); out.attrs.push(t.slice(k + 1, end - 1)); k = end; continue; }
    if (c === ":") {
      const isEl = PSEUDO_ELEMENT.test(t.slice(k));
      const m = /^::?([-\w]+)/.exec(t.slice(k));
      if (!m) throw "a pseudo this matcher cannot read in {" + t + "}";
      let k2 = k + m[0].length, arg = null;
      if (t[k2] === "(") { const end = balanced(k2, "(", ")"); arg = t.slice(k2 + 1, end - 1); k2 = end; }
      if (isEl) { out.el = (out.el ? out.el + "," : "") + m[1].toLowerCase(); }
      else out.pseudo.push({ name: m[1].toLowerCase(), arg: arg });
      k = k2; continue;
    }
    if (/[A-Za-z]/.test(c)) { const m = /^[-\w]+/.exec(t.slice(k)); out.tag = m[0].toLowerCase(); k += m[0].length; continue; }
    throw "a character this matcher cannot read, " + JSON.stringify(c) + ", in {" + t + "}";
  }
  return out;
}

function attrTest(n, spec) {
  const m = /^\s*([-\w:@.]+)\s*(?:([~^$*|]?=)\s*("([^"]*)"|'([^']*)'|[^\s\]]+)\s*(?:([iIsS])\s*)?)?$/.exec(spec);
  if (!m) throw "an attribute selector this matcher cannot read, [" + spec + "]";
  const name = m[1].toLowerCase();
  if (!n.attrs.has(name)) return false;
  if (!m[2]) return true;
  let want = m[4] !== undefined ? m[4] : m[5] !== undefined ? m[5] : m[3];
  let have = String(n.attrs.get(name));
  if (m[6] && /i/i.test(m[6])) { want = want.toLowerCase(); have = have.toLowerCase(); }
  switch (m[2]) {
    case "=": return have === want;
    case "~=": return have.split(/\s+/).includes(want);
    case "^=": return want !== "" && have.startsWith(want);
    case "$=": return want !== "" && have.endsWith(want);
    case "*=": return want !== "" && have.includes(want);
    case "|=": return have === want || have.startsWith(want + "-");
  }
  throw "an attribute operator this matcher cannot read, " + m[2];
}

function nth(arg, index) {
  const s = String(arg).trim().toLowerCase();
  if (s === "odd") return index % 2 === 1;
  if (s === "even") return index % 2 === 0;
  const m = /^([+-]?\d*)n\s*([+-]\s*\d+)?$/.exec(s.replace(/\s+/g, ""));
  if (m) {
    const a = m[1] === "" || m[1] === "+" ? 1 : m[1] === "-" ? -1 : parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2].replace(/\s+/g, ""), 10) : 0;
    if (a === 0) return index === b;
    return (index - b) % a === 0 && (index - b) / a >= 0;
  }
  if (/^\d+$/.test(s)) return index === parseInt(s, 10);
  throw "an nth argument this matcher cannot read, (" + arg + ")";
}

/* Does one element satisfy one compound (its pseudo-element aside)? */
function compoundHits(tree, n, c) {
  if (c.tag && n.tag !== c.tag) return false;
  if (c.id && n.id !== c.id) return false;
  for (const x of c.cls) if (!n.cls.has(x)) return false;
  for (const a of c.attrs) if (!attrTest(n, a)) return false;
  for (const p of c.pseudo) {
    if (DYNAMIC.has(p.name)) continue;
    switch (p.name) {
      case "root": if (n.tag !== "html") return false; break;
      case "scope": break;
      case "empty": if (n.kids.length) return false; break;
      case "first-child": if (n.sib !== 1) return false; break;
      case "last-child": if (!n.parent || n.sib !== n.parent.kids.length) return false; break;
      case "only-child": if (!n.parent || n.parent.kids.length !== 1) return false; break;
      case "first-of-type": if (n.typeSib !== 1) return false; break;
      case "last-of-type": if (!n.parent || n.typeSib !== n.parent.kids.filter(k => k.tag === n.tag).length) return false; break;
      case "only-of-type": if (!n.parent || n.parent.kids.filter(k => k.tag === n.tag).length !== 1) return false; break;
      case "nth-child": if (!nth(p.arg, n.sib)) return false; break;
      case "nth-of-type": if (!nth(p.arg, n.typeSib)) return false; break;
      case "nth-last-child": if (!n.parent || !nth(p.arg, n.parent.kids.length - n.sib + 1)) return false; break;
      case "nth-last-of-type": {
        if (!n.parent) return false;
        const t = n.parent.kids.filter(k => k.tag === n.tag).length;
        if (!nth(p.arg, t - n.typeSib + 1)) return false;
        break;
      }
      case "not": {
        for (const part of splitList(p.arg)) if (hits(tree, n, part)) return false;
        break;
      }
      case "is": case "matches": case "any": case "where": {
        let any = false;
        for (const part of splitList(p.arg)) if (hits(tree, n, part)) { any = true; break; }
        if (!any) return false;
        break;
      }
      case "has": {
        let any = false;
        for (const part of splitList(p.arg)) if (hasRelative(tree, n, part)) { any = true; break; }
        if (!any) return false;
        break;
      }
      default: throw "a pseudo-class this matcher does not model, :" + p.name;
    }
  }
  return true;
}

function splitList(arg) {
  const out = [];
  let d = 0, str = 0, start = 0;
  const s = String(arg);
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (str) { if (c === "\\") k++; else if (c === str) str = 0; continue; }
    if (c === '"' || c === "'") { str = c; continue; }
    if (c === "(" || c === "[") d++;
    else if (c === ")" || c === "]") d--;
    else if (c === "," && d === 0) { out.push(s.slice(start, k).trim()); start = k + 1; }
  }
  const last = s.slice(start).trim();
  if (last) out.push(last);
  return out;
}

/* Does the element match the whole (pseudo-element-free) selector, right to left? */
function hits(tree, n, sel) {
  const parts = splitCompounds(sel).map(p => ({ comb: p.comb, c: parseCompound(p.text) }));
  if (!parts.length) return false;
  return walk(tree, n, parts, parts.length - 1);
}

function walk(tree, n, parts, k) {
  if (!compoundHits(tree, n, parts[k].c)) return false;
  if (k === 0) return true;
  const comb = parts[k].comb;
  if (comb === " ") {
    for (let p = n.parent; p; p = p.parent) if (walk(tree, p, parts, k - 1)) return true;
    return false;
  }
  if (comb === ">") return n.parent ? walk(tree, n.parent, parts, k - 1) : false;
  if (comb === "+") {
    if (!n.parent || n.sib < 2) return false;
    return walk(tree, n.parent.kids[n.sib - 2], parts, k - 1);
  }
  if (comb === "~") {
    if (!n.parent) return false;
    for (let j = 0; j < n.sib - 1; j++) if (walk(tree, n.parent.kids[j], parts, k - 1)) return true;
    return false;
  }
  throw "a combinator this matcher cannot read, " + JSON.stringify(comb);
}

/* :has(), relative to n. Only the descendant and child forms the sheet could carry. */
function hasRelative(tree, n, rel) {
  const s = rel.trim();
  const child = s[0] === ">";
  const inner = child ? s.slice(1).trim() : s;
  if (/^[+~]/.test(inner)) throw "a :has() sibling argument this matcher does not model, :has(" + rel + ")";
  const stack = [...n.kids];
  while (stack.length) {
    const x = stack.pop();
    if (hits(tree, x, inner)) return true;
    if (!child) for (const k of x.kids) stack.push(k);
  }
  return false;
}

/* The set of BOXES a selector matches: an element index, plus the pseudo-element if any, since
   `.a::before` and `.b` are two different boxes and cannot contest one declaration. */
function boxesOf(tree, sel) {
  const parts = splitCompounds(sel);
  if (!parts.length) throw "an empty selector";
  const lastCompound = parseCompound(parts[parts.length - 1].text);
  const suffix = lastCompound.el ? "::" + lastCompound.el : "";
  /* a pseudo-element on anything but the subject is not a selector this sheet writes */
  for (let k = 0; k < parts.length - 1; k++)
    if (parseCompound(parts[k].text).el) throw "a pseudo-element before a combinator, in {" + sel + "}";
  const use = lastCompound.el ? stripTrailingPseudoElement(sel) : sel;
  const out = new Set();
  for (const n of tree.nodes) if (hits(tree, n, use)) out.add(n.i + suffix);
  return out;
}

function stripTrailingPseudoElement(sel) {
  const parts = splitCompounds(sel);
  const last = parts[parts.length - 1];
  const t = last.text;
  let cut = t.length;
  let k = 0;
  const idx = [];
  while (k < t.length) {
    if (t[k] === ":" ) {
      const isEl = PSEUDO_ELEMENT.test(t.slice(k));
      const m = /^::?[-\w]+/.exec(t.slice(k));
      let k2 = k + (m ? m[0].length : 1);
      if (t[k2] === "(") { let d = 1; k2++; while (k2 < t.length && d > 0) { if (t[k2] === "(") d++; else if (t[k2] === ")") d--; k2++; } }
      if (isEl) idx.push([k, k2]);
      k = k2; continue;
    }
    if (t[k] === "[") { let d = 1; k++; while (k < t.length && d > 0) { if (t[k] === "[") d++; else if (t[k] === "]") d--; k++; } continue; }
    k++;
  }
  let text = t;
  for (let j = idx.length - 1; j >= 0; j--) text = text.slice(0, idx[j][0]) + text.slice(idx[j][1]);
  if (!text.trim()) text = "*";
  const head = sel.slice(0, sel.length - t.length);
  return head + text;
}

/* ------------------------------------------------------------------ the rule */

function namesOf(sel) {
  const cls = new Set(), ids = new Set();
  for (const m of sel.matchAll(/\.([-\w]+)/g)) cls.add(m[1]);
  for (const m of sel.matchAll(/#([-\w]+)/g)) ids.add(m[1]);
  return { cls: cls, ids: ids };
}
const sharesName = (a, b) => {
  for (const c of a.cls) if (b.cls.has(c)) return true;
  for (const c of a.ids) if (b.ids.has(c)) return true;
  return false;
};
const intersects = (a, b) => { for (const x of a) if (b.has(x)) return x; return null; };

/* Parse a sheet and a markup and return every tie source order decides. `prop` null means every
   property, which is the --all census and not the gate. */
function analyse(css, markup, prop, lineAt) {
  const parsed = L.parseSheet(css, lineAt || (() => 0));
  const tree = parseMarkup(markup);
  const decls = parsed.decls.filter(d => prop === null || d.prop === prop);
  const boxes = new Map();
  const unreadable = [];
  for (const d of decls) {
    if (boxes.has(d.sel)) continue;
    try { boxes.set(d.sel, boxesOf(tree, d.sel)); }
    catch (x) { unreadable.push({ sel: d.sel, why: String(x) }); boxes.set(d.sel, null); }
  }
  const byKey = new Map();
  for (const d of decls) {
    const k = d.prop + "|" + d.layer + "|" + (d.imp ? "!" : "") + specOf(d.sel).join(",");
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(d);
  }
  let pairs = 0, met = 0;
  const offenders = [], ties = [];
  for (const list of byKey.values())
    for (let x = 0; x < list.length; x++)
      for (let y = x + 1; y < list.length; y++) {
        const a = list[x], b = list[y];
        pairs++;
        if (sharesName(namesOf(a.sel), namesOf(b.sel))) continue;
        const ba = boxes.get(a.sel), bb = boxes.get(b.sel);
        if (!ba || !bb) continue;
        const box = intersects(ba, bb);
        if (box === null) continue;
        met++;
        const t = { a: a, b: b, box: box, same: a.val === b.val, later: a.ord > b.ord ? a : b };
        ties.push(t);
        if (!t.same) offenders.push(t);
      }
  return { parsed: parsed, tree: tree, decls: decls, boxes: boxes, unreadable: unreadable,
           pairs: pairs, met: met, ties: ties, offenders: offenders };
}

function boxName(tree, box) {
  const s = String(box).split("::");
  const n = tree.nodes[Number(s[0])];
  const desc = "<" + n.tag + (n.id ? " id=" + n.id : "") + (n.cls.size ? ' class="' + [...n.cls].join(" ") + '"' : "") + ">";
  return desc + (s[1] ? "::" + s[1] : "");
}

function describe(tree, t) {
  const one = d => "  line " + d.line + " {" + d.sel + "} " + d.prop + ": " + d.val.replace(/\s+/g, " ").slice(0, 50) + " [" + d.layer + "]";
  return one(t.a) + "\n" + one(t.b) + "\n    both land on " + boxName(tree, t.box) +
         "; only source order separates them, so line " + t.later.line + " wins.";
}

/* --------------------------------------------------------------- the controls */

const OK = [], BAD = [];
const control = (name, got, want) => {
  if (got === want) OK.push(name + " -> " + got);
  else BAD.push(name + ": read " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
};

const SYN_MARKUP = '<div class="w"><svg class="ic win-g-restore"></svg><b class="other"></b></div>';
const syn = (css, markup) => analyse(css, markup === undefined ? SYN_MARKUP : markup, "display");

/* ------------------------------------------------------------------- the run */

function run() {
  const argv = process.argv.slice(2);
  const known = ["--list", "--all", "--file"];
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === "--file") { k++; continue; }
    if (!known.includes(argv[k])) {
      console.log("usage: node tests/css-order.js [--file <sheet>] [--list] [--all]");
      process.exit(2);
    }
  }
  const fi = argv.indexOf("--file");
  const rel = fi >= 0 ? argv[fi + 1] : TEMPLATE;
  if (fi >= 0 && !rel) { console.log("--file wants a path"); process.exit(2); }
  const file = path.isAbsolute(rel) ? rel : path.join(E.ROOT, rel);
  if (!fs.existsSync(file))
    E.refuse("no sheet at " + rel, "looked for " + file,
             "this gate reads the stylesheet and the markup as written, not the built artefact.");
  const raw = fs.readFileSync(file, "utf8");
  const sheet = L.sheetOf(raw);
  if (!sheet) { console.log("REFUSED: no <style> block in " + rel); process.exit(3); }
  const head = raw.slice(0, sheet.from).split("\n").length - 1;
  const lineAt = i => head + sheet.css.slice(0, i).split("\n").length;
  const markup = raw.slice(0, sheet.from - 7) + raw.slice(sheet.to + 8);

  let r;
  try { r = analyse(sheet.css, markup, "display", lineAt); }
  catch (x) { console.log("REFUSED: " + x); process.exit(3); }

  const tree = r.tree;
  console.log("the sheet: " + rel + ", " + r.decls.length + " display declaration(s) over " +
              r.boxes.size + " distinct selector(s); " + r.pairs +
              " pair(s) tied on specificity within one layer, " + r.met + " of them landing on one box");
  console.log("the markup: " + tree.nodes.length + " element(s) (html, head and body synthesised), " +
              [...r.boxes.values()].filter(s => s && s.size === 0).length +
              " selector(s) match nothing static and are invisible to this gate");

  if (r.unreadable.length) {
    console.log("REFUSED: " + r.unreadable.length + " selector(s) this matcher cannot read, which is not a pass:");
    for (const u of r.unreadable) console.log("  {" + u.sel + "} " + u.why);
    process.exit(3);
  }

  /* Control A: the historical shape, planted into the real sheet. */
  let plantNote = "no element in the markup could seed it";
  let seeded = false;
  for (const d of r.decls) {
    const names = namesOf(d.sel);
    if (names.cls.size !== 1 || names.ids.size || d.imp) continue;
    const only = [...names.cls][0];
    if (d.sel.trim() !== "." + only) continue;
    const el = tree.nodes.find(n => n.cls.has(only) && [...n.cls].some(c => c !== only));
    if (!el) continue;
    const other = [...el.cls].find(c => c !== only);
    if (namesOf("." + other).cls.has(only)) continue;
    /* the planted value differs, so the pair is an offender and not merely a tie */
    const plantVal = d.val === "none" ? "block" : "none";
    const layerOpen = d.layer === null ? "" : "@layer " + d.layer + "{";
    const layerClose = d.layer === null ? "" : "}";
    const plant = "\n" + layerOpen + "." + other + "{display:" + plantVal + "}" + layerClose + "\n";
    const was = new Set(r.offenders.map(t => t.a.ord + ":" + t.b.ord));
    const p = analyse(sheet.css + plant, markup, "display", lineAt);
    const added = p.offenders.filter(t => !was.has(t.a.ord + ":" + t.b.ord));
    const isPlant = x => x.sel === "." + other && x.val === plantVal;
    const fromPlant = added.filter(t => isPlant(t.a) || isPlant(t.b));
    const seedNamed = fromPlant.some(t => t.a.line === d.line || t.b.line === d.line);
    control("control A, {." + only + "} against a planted {." + other + "} on " + boxName(tree, "" + el.i) +
            ", " + added.length + " offending pair(s) added",
            (added.length ? "caught" : "MISSED") + ", " +
            (added.length === fromPlant.length ? "all from the plant" : "not all from the plant") + ", " +
            (seedNamed ? "the seed among them" : "the seed missing"),
            "caught, all from the plant, the seed among them");
    control("control B, the plant removed",
            analyse(sheet.css, markup, "display", lineAt).offenders.length + " offender(s)",
            r.offenders.length + " offender(s)");
    plantNote = "." + other + " in layer " + d.layer;
    seeded = true;
    break;
  }
  if (!seeded) {
    console.log("REFUSED: control A could not be seeded (" + plantNote + "), so the gate proved nothing.");
    process.exit(3);
  }

  /* Controls C to H: one per clause of the rule, on synthetic sheets and markup. */
  const base = "@layer base,overrides;";
  control("control C, the historical pair itself",
          syn(base + "@layer base{.win-g-restore{display:none}.ic{display:block}}").offenders.length + " offender(s)",
          "1 offender(s)");
  control("control D, the same pair on selectors that never meet",
          syn(base + "@layer base{.win-g-restore{display:none}.nowhere-at-all{display:block}}").offenders.length + " offender(s)",
          "0 offender(s)");
  control("control E, unequal specificity is not a tie",
          syn(base + "@layer base{.win-g-restore{display:none}div .ic{display:block}}").offenders.length + " offender(s)",
          "0 offender(s)");
  control("control F, a different layer is not a tie",
          syn(base + "@layer base{.win-g-restore{display:none}}@layer overrides{.ic{display:block}}").offenders.length + " offender(s)",
          "0 offender(s)");
  control("control G, a shared class name is another gate's business",
          syn(base + "@layer base{.w .ic{display:none}.w .other{display:block}}").offenders.length + " offender(s)",
          "0 offender(s)");
  control("control H, the same value on both sides is not a finding",
          syn(base + "@layer base{.win-g-restore{display:none}.ic{display:none}}").ties.length + " tie(s), " +
          syn(base + "@layer base{.win-g-restore{display:none}.ic{display:none}}").offenders.length + " offender(s)",
          "1 tie(s), 0 offender(s)");
  control("control I, a pseudo-element is a box of its own",
          syn(base + "@layer base{.win-g-restore::before{display:none}.ic{display:block}}").offenders.length + " and " +
          syn(base + "@layer base{.win-g-restore::before{display:none}.ic::before{display:block}}").offenders.length,
          "0 and 1");
  let refused = "did not refuse";
  try { syn(base + "@layer base{.ic:hypothetical-state{display:none}.win-g-restore{display:block}}"); }
  catch (x) { refused = "refused"; }
  const unread = syn(base + "@layer base{.ic:hypothetical-state{display:none}.win-g-restore{display:block}}");
  control("control J, a selector the matcher cannot read is refused, not answered",
          unread.unreadable.length + " unreadable, " + unread.offenders.length + " offender(s)",
          "1 unreadable, 0 offender(s)");
  /* The sheet's own idiom, both ways round: `[hidden]{display:none!important}` ties with four
     author rules on specificity, layer, name and box, and the importance is the whole reason
     the attribute still wins. Take the importance away and the tie is an offender. */
  control("control K, an important on one side settles it",
          syn(base + "@layer base{[hidden]{display:none!important}.ic{display:block}}", '<svg class="ic" hidden></svg>').offenders.length + " with, " +
          syn(base + "@layer base{[hidden]{display:none}.ic{display:block}}", '<svg class="ic" hidden></svg>').offenders.length + " without",
          "0 with, 1 without");
  const key = [["#intent:placeholder-shown", [1, 1, 0]], [".x::before", [0, 1, 1]],
               [".a:hover", [0, 2, 0]], ["div .ic", [0, 1, 1]], [".ic", [0, 1, 0]]];
  control("control L, the synthesised body is an ancestor of the markup",
          syn(base + "@layer base{body .win-g-restore{display:none}.zz{display:block}}").decls.length + " decl(s), " +
          syn(base + "@layer base{body .ic{display:none}}").boxes.get("body .ic").size + " box(es) for {body .ic}",
          "2 decl(s), 1 box(es) for {body .ic}");
  control("control M, the specificity shim against an answer key, and doing work",
          key.filter(k => specOf(k[0]).join(",") === k[1].join(",")).length + " of " + key.length +
          " right, shim changes " + key.filter(k => L.specificity(k[0]).join(",") !== specOf(k[0]).join(",")).length,
          "5 of 5 right, shim changes 1");

  for (const line of OK) console.log("  ok   " + line);
  for (const line of BAD) console.log("  FAIL " + line);

  if (argv.includes("--all")) {
    const all = analyse(sheet.css, markup, null, lineAt);
    const byProp = new Map();
    for (const t of all.offenders) byProp.set(t.a.prop, (byProp.get(t.a.prop) || 0) + 1);
    console.log("--all: without the display cut the same rule reads " + all.offenders.length +
                " offending pair(s) over " + byProp.size + " propert(ies), from " + all.pairs +
                " tied pair(s) (" + all.unreadable.length + " selector(s) unreadable):");
    for (const [p, c] of [...byProp].sort((x, y) => y[1] - x[1])) console.log("    " + p + " " + c);
  }

  if (argv.includes("--list"))
    for (const t of r.ties) console.log((t.same ? "same " : "DIFF ") + describe(tree, t).trim());

  if (BAD.length) {
    console.log("RESULT: the gate's own controls did not fire, so its silence means nothing.");
    process.exit(3);
  }
  if (r.offenders.length) {
    console.log("FAIL " + r.offenders.length + " display tie(s) decided by source order alone:");
    for (const t of r.offenders) console.log(describe(tree, t));
    console.log("Give one of them a specificity the other cannot tie, or put it in a later layer.");
    console.log("Leaving it to the line number means the next reorder changes what draws.");
    process.exit(1);
  }
  console.log("RESULT: OK, no display tie in one layer is left to source order.");
}

module.exports = { parseMarkup, boxesOf, hits, analyse, splitCompounds, parseCompound };

if (require.main === module) run();
