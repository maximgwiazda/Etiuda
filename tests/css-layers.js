/* THE CASCADE LAYERS, AND WHAT A LAYER MOVE CAN DO IN SILENCE. Board item 358.
 *
 *   node tests/css-layers.js            check
 *   node tests/css-layers.js --list     print every flip, not only the ones that can meet
 *
 * Since spec 11.6 the sheet declares `@layer base, components, states, overrides` and a rule's
 * layer, not its specificity, decides most contests. Moving a block from one layer to another
 * is a two-character edit that can reverse which declaration wins on a box, and until this file
 * nothing in tests/ held an opinion about that. The lead engineer's run `ad` measured what the
 * reach of one such move is: a `states` family that looked mechanical moved 296 of 816 top-level
 * blocks and reversed at least eight winners a person would see, hover by hover, and the
 * computed-style fingerprint that judged the commit could not see any of them, because a
 * fingerprint reads one document in one state and a state pseudo-class is not that state.
 *
 * THE METHOD. Parse `src/template.html`'s sheet into declarations, and for every PAIR of
 * declarations of the same property compute the winner twice: once under the cascade as it
 * would be with no layers at all (importance, then specificity, then source order), and once
 * under the declared layer order (importance, then layer rank with importance reversing it,
 * then specificity, then source order). A pair whose winner is the same under both cannot
 * change anything. A pair whose winner differs is a FLIP: the layer order, and nothing else,
 * decided it.
 *
 * Most flips are between rules that could never land on one box, so the gate fails only on a
 * flip whose two SUBJECT COMPOUNDS share a class or an id - the shape in which one element can
 * wear both rules. That narrowing is deliberately conservative and it has a named hole: a pair
 * like `.fab{transition:none}` against `button{transition:...}` can meet on a real box and
 * shares no name, so this gate would not see it. The hole is the price of a gate that needs no
 * browser, no document and no allowlist, and that reads 0 on the sheet as it stands.
 *
 * THE REMEDY WHEN IT FIRES is not to widen this file. A flip between two rules that can meet is
 * a change to what somebody sees, so it is either wrong, or it is a decision about appearance
 * that belongs to Maxim. If a flip is ever deliberate, the honest shape is a declared list
 * beside this file, written then, with a check that refuses an entry matching nothing - an
 * allowlist keyed by a name goes stale in silence, and an empty one written today would have
 * nothing keeping it honest.
 *
 * THE CONTROLS RUN ON EVERY INVOCATION, because a gate that has never rejected anything has not
 * been tested. Control A plants a real reversal into the real sheet: it takes a live base
 * declaration whose selector is more specific than its own subject compound, re-declares that
 * subject in `states` with a different value, and requires the gate to report exactly that pair
 * and one more offender than before. Control B removes the plant and requires the count back.
 * Controls C to F are six-line synthetic sheets for the rules the real sheet does not exercise:
 * that importance reverses the layer order, that it does so only between layers, that an
 * unlayered rule is refused, and that a pair with the same value on both sides is not a finding.
 *
 * Exit 0 clean, 1 a flip that can meet, 2 misuse, 3 the sheet could not be read or a control did
 * not fire, which is not a pass.
 */
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");

const TEMPLATE = "src/template.html";

/* ---------------------------------------------------------------- the parser */

/* Comments are blanked rather than deleted so every index is still an index into the sheet and
   a finding can name a line of src/template.html. */
const blank = m => m.replace(/[^\n]/g, " ");

function splitTop(s, sep) {
  const out = [];
  let d = 0, str = 0, start = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (str) { if (c === "\\") k++; else if (c === str) str = 0; continue; }
    if (c === '"' || c === "'") { str = c; continue; }
    if (c === "(" || c === "[") d++;
    else if (c === ")" || c === "]") d--;
    else if (c === sep && d === 0) { out.push(s.slice(start, k)); start = k + 1; }
  }
  out.push(s.slice(start));
  return out;
}

const selectorList = s => splitTop(s, ",").map(x => x.trim()).filter(Boolean);

/* The first top-level colon of a declaration. `background:url(a:b)` and `content:"a:b"` are why
   this is not indexOf(":"). */
function colonAt(t) {
  let d = 0, str = 0;
  for (let k = 0; k < t.length; k++) {
    const c = t[k];
    if (str) { if (c === "\\") k++; else if (c === str) str = 0; continue; }
    if (c === '"' || c === "'") { str = c; continue; }
    if (c === "(" || c === "[") d++;
    else if (c === ")" || c === "]") d--;
    else if (c === ":" && d === 0) return k;
  }
  return -1;
}

/* Specificity as the selectors spec defines it, including the functional pseudo-classes this
   sheet actually uses: :not, :has and :where. A pseudo-ELEMENT counts as an element. */
const PSEUDO_EL = /^::|^:(before|after|first-line|first-letter|placeholder|selection|backdrop|marker)\b/;
const TAKES_MAX = new Set(["not", "is", "has", "matches", "any"]);
const NTH = new Set(["nth-child", "nth-last-child", "nth-of-type", "nth-last-of-type"]);

function cmpSpec(x, y) { for (let k = 0; k < 3; k++) if (x[k] !== y[k]) return x[k] - y[k]; return 0; }

function specificity(sel) {
  let A = 0, B = 0, C = 0, k = 0;
  const s = sel;
  const balanced = (from, open, close) => {
    let d = 1, j = from + 1, str = 0;
    while (j < s.length && d > 0) {
      const e = s[j];
      if (str) { if (e === str) str = 0; }
      else if (e === '"' || e === "'") str = e;
      else if (e === open) d++;
      else if (e === close) d--;
      j++;
    }
    return j;
  };
  while (k < s.length) {
    const c = s[k];
    if (c === "#") { const m = /^#[-\w\\]+/.exec(s.slice(k)); A++; k += m ? m[0].length : 1; continue; }
    if (c === ".") { const m = /^\.[-\w\\]+/.exec(s.slice(k)); B++; k += m ? m[0].length : 1; continue; }
    if (c === "[") { B++; k = balanced(k, "[", "]"); continue; }
    if (c === ":") {
      const isEl = PSEUDO_EL.test(s.slice(k));
      const m = /^::?[-\w]+/.exec(s.slice(k));
      const name = m ? m[0].replace(/^::?/, "").toLowerCase() : "";
      let k2 = k + (m ? m[0].length : 1);
      let arg = null;
      if (s[k2] === "(") { const end = balanced(k2, "(", ")"); arg = s.slice(k2 + 1, end - 1); k2 = end; }
      if (isEl) C++;
      else if (name === "where") { /* contributes nothing, by the spec */ }
      else if (TAKES_MAX.has(name)) {
        if (arg) {
          let best = [0, 0, 0];
          for (const part of selectorList(arg)) {
            const p = specificity(part.replace(/^[>+~]\s*/, ""));
            if (cmpSpec(p, best) > 0) best = p;
          }
          A += best[0]; B += best[1]; C += best[2];
        }
      } else if (NTH.has(name)) {
        B++;
        if (arg && /\bof\b/.test(arg)) {
          let best = [0, 0, 0];
          for (const part of selectorList(arg.split(/\bof\b/)[1])) {
            const p = specificity(part);
            if (cmpSpec(p, best) > 0) best = p;
          }
          A += best[0]; B += best[1]; C += best[2];
        }
      } else B++;
      k = k2; continue;
    }
    if (/[A-Za-z*|_-]/.test(c)) { const m = /^[-\w\\|]+|\*/.exec(s.slice(k)); if (c !== "*") C++; k += m ? m[0].length : 1; continue; }
    k++;
  }
  return [A, B, C];
}

/* The subject compound: everything after the last top-level combinator. `.a .b:hover` is `.b:hover`. */
function subject(sel) {
  let d = 0, str = 0, last = 0;
  for (let k = 0; k < sel.length; k++) {
    const c = sel[k];
    if (str) { if (c === "\\") k++; else if (c === str) str = 0; continue; }
    if (c === '"' || c === "'") { str = c; continue; }
    if (c === "(" || c === "[") d++;
    else if (c === ")" || c === "]") d--;
    else if (d === 0 && (c === " " || c === ">" || c === "+" || c === "~")) last = k + 1;
  }
  return sel.slice(last);
}

/* The names the subject itself demands. A name inside :has() or :not() belongs to another
   element or to no element, so the functional arguments go first. */
function subjectNames(sel) {
  const bare = subject(sel).replace(/:[-\w]+\([^)]*\)/g, "");
  const cls = new Set(), ids = new Set();
  for (const m of bare.matchAll(/\.([-\w]+)/g)) cls.add(m[1]);
  for (const m of bare.matchAll(/#([-\w]+)/g)) ids.add(m[1]);
  return { cls, ids };
}

/* Parse a stylesheet into {order, rules, decls}. Throws a string on a shape it cannot read,
   because a scan that guesses is worse than one that stops. */
function parseSheet(css, lineAt) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, blank);
  const rules = [];
  const stack = [];
  let order = null;
  let i = 0;
  const n = text.length;
  const layerHere = () => { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].layer) return stack[k].layer; return null; };
  while (i < n) {
    const c = text[i];
    if (c === " " || c === "\n" || c === "\t" || c === "\r") { i++; continue; }
    if (c === "}") { if (!stack.length) throw "a closing brace with nothing open, at line " + lineAt(i); stack.pop(); i++; continue; }
    let j = i, d = 0, str = 0;
    while (j < n) {
      const e = text[j];
      if (str) { if (e === "\\") j++; else if (e === str) str = 0; j++; continue; }
      if (e === '"' || e === "'") { str = e; j++; continue; }
      if (e === "(") d++;
      else if (e === ")") d--;
      else if (d === 0 && (e === "{" || e === ";" || e === "}")) break;
      j++;
    }
    const prelude = text.slice(i, j).trim();
    const term = text[j];
    if (term === ";") {
      if (/^@layer\b/.test(prelude)) order = prelude.replace(/^@layer\s*/, "").split(",").map(s => s.trim()).filter(Boolean);
      i = j + 1; continue;
    }
    if (term !== "{") throw "a prelude with no body, at line " + lineAt(i) + ": " + prelude.slice(0, 40);
    if (/^@layer\b/.test(prelude)) { stack.push({ layer: prelude.replace(/^@layer\s*/, "").trim() || "(anonymous)" }); i = j + 1; continue; }
    if (/^@(media|supports|container|scope)\b/.test(prelude)) { stack.push({ cond: prelude }); i = j + 1; continue; }
    /* A keyframes body is not a cascade contest: its declarations are keyed by offset, and the
       25 names in this sheet are distinct, so a block riding into another layer costs nothing. */
    if (/^@(keyframes|font-face|page|property|counter-style)\b/.test(prelude)) {
      let d2 = 1, k = j + 1;
      while (k < n && d2 > 0) { if (text[k] === "{") d2++; else if (text[k] === "}") d2--; k++; }
      i = k; continue;
    }
    if (/^@/.test(prelude)) throw "an at-rule this scan does not know, at line " + lineAt(i) + ": " + prelude.slice(0, 40);
    let d2 = 1, k = j + 1;
    while (k < n && d2 > 0) { if (text[k] === "{") d2++; else if (text[k] === "}") d2--; k++; }
    const body = text.slice(j + 1, k - 1);
    if (body.includes("{")) throw "a nested rule, which this scan does not model, at line " + lineAt(i);
    rules.push({ sel: prelude, layer: layerHere(), line: lineAt(i), body: body });
    i = k;
  }
  if (stack.length) throw "the sheet ends with " + stack.length + " block(s) still open";

  const decls = [];
  let ord = 0;
  for (const r of rules) {
    const ds = [];
    for (const part of splitTop(r.body, ";")) {
      const t = part.trim();
      if (!t) continue;
      const ci = colonAt(t);
      if (ci < 0) continue;
      const prop = t.slice(0, ci).trim().toLowerCase();
      let val = t.slice(ci + 1).trim();
      const imp = /!\s*important\s*$/i.test(val);
      if (imp) val = val.replace(/!\s*important\s*$/i, "").trim();
      if (prop) ds.push({ prop: prop, val: val, imp: imp });
    }
    if (!ds.length) continue;
    for (const sel of selectorList(r.sel)) {
      const sp = specificity(sel);
      const nm = subjectNames(sel);
      for (const d of ds)
        decls.push({ prop: d.prop, val: d.val, imp: d.imp, sel: sel, layer: r.layer, line: r.line, spec: sp, names: nm, ord: ord++ });
    }
  }
  return { order: order, rules: rules, decls: decls };
}

/* ------------------------------------------------------------- the two cascades */

function winner(x, y, rank) {
  if (x.imp !== y.imp) return x.imp ? x : y;
  if (rank) {
    const rx = rank.get(x.layer), ry = rank.get(y.layer);
    if (rx !== ry) return x.imp ? (rx < ry ? x : y) : (rx > ry ? x : y);
  }
  const c = cmpSpec(x.spec, y.spec);
  if (c !== 0) return c > 0 ? x : y;
  return x.ord > y.ord ? x : y;
}

function canMeet(x, y) {
  for (const c of x.names.cls) if (y.names.cls.has(c)) return true;
  for (const c of x.names.ids) if (y.names.ids.has(c)) return true;
  return false;
}

/* Every pair of declarations of one property, judged twice. Returns the flips. */
function flipsOf(parsed) {
  const rank = new Map((parsed.order || []).map((nm, k) => [nm, k]));
  const byProp = new Map();
  for (const d of parsed.decls) {
    if (!byProp.has(d.prop)) byProp.set(d.prop, []);
    byProp.get(d.prop).push(d);
  }
  let pairs = 0;
  const flips = [];
  for (const list of byProp.values())
    for (let x = 0; x < list.length; x++)
      for (let y = x + 1; y < list.length; y++) {
        pairs++;
        const a = list[x], b = list[y];
        const wl = winner(a, b, rank), wf = winner(a, b, null);
        if (wl !== wf) flips.push({ a: a, b: b, layered: wl, flat: wf, same: a.val === b.val, meet: canMeet(a, b) });
      }
  return { pairs: pairs, flips: flips, offenders: flips.filter(f => !f.same && f.meet) };
}

function describe(f) {
  const one = d => "src/template.html:" + d.line + " {" + d.sel + "} " + d.prop + ": " + d.val.replace(/\s+/g, " ").slice(0, 60) + (d.imp ? " !important" : "") + " [" + d.layer + "]";
  return "  " + one(f.a) + "\n  " + one(f.b) +
         "\n    without layers line " + f.flat.line + " wins; under the declared order line " + f.layered.line + " wins.";
}

/* ------------------------------------------------------------------ the sheet */

function sheetOf(fileText) {
  const a = fileText.indexOf("<style>", 1000), b = fileText.indexOf("</style>", a);
  if (a < 0 || b < 0) return null;
  return { from: a + 7, to: b, css: fileText.slice(a + 7, b) };
}

/* --------------------------------------------------------------- the controls */

const OK = [], BAD = [];
const control = (name, got, want) => {
  if (got === want) OK.push(name + ": " + got);
  else BAD.push(name + ": read " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
};

function synth(css) {
  return flipsOf(parseSheet(css, () => 0));
}

function run() {
  const file = path.join(E.ROOT, TEMPLATE);
  if (!fs.existsSync(file))
    E.refuse("the sheet is not at " + TEMPLATE, "looked for " + file,
             "this gate reads the stylesheet as written, not the built artefact.");
  const raw = fs.readFileSync(file, "utf8");
  const sheet = sheetOf(raw);
  if (!sheet) E.refuse("no <style> block in " + TEMPLATE, "", "the gate cannot see the sheet, which is not a pass.");
  const head = raw.slice(0, sheet.from).split("\n").length - 1;
  const lineAt = i => head + sheet.css.slice(0, i).split("\n").length;

  let parsed, r;
  try {
    parsed = parseSheet(sheet.css, lineAt);
    r = flipsOf(parsed);
  } catch (x) {
    console.log("REFUSED: " + x);
    process.exit(3);
  }

  const order = parsed.order;
  const layers = new Set(parsed.decls.map(d => d.layer));
  console.log("the sheet: " + parsed.rules.length + " style rule(s), " + parsed.decls.length +
              " declaration(s) over " + new Set(parsed.decls.map(d => d.prop)).size + " propert(ies), " +
              r.pairs + " same-property pair(s) judged");
  console.log("the order: @layer " + (order ? order.join(", ") : "(none declared)") +
              "; declarations per layer " + [...layers].map(L => (L === null ? "(unlayered)" : L) + " " +
              parsed.decls.filter(d => d.layer === L).length).join(", "));
  console.log("flips: " + r.flips.length + " pair(s) the layer order decides, " +
              r.flips.filter(f => f.same).length + " of them the same value on both sides, " +
              r.offenders.length + " between selectors that can meet on one box");

  const hard = [];
  if (!order || order.join(",") !== "base,components,states,overrides")
    hard.push("the declared layer order is " + JSON.stringify(order) + ", not base, components, states, overrides");
  const outside = parsed.decls.filter(d => d.layer === null);
  if (outside.length)
    hard.push(outside.length + " declaration(s) sit outside every layer, and an unlayered rule beats every layered one; first at line " + outside[0].line);
  for (const L of layers) if (L !== null && !order.includes(L)) hard.push("layer " + L + " is used and not declared");

  /* Control A: a real reversal planted into the real sheet. The plant re-declares an existing
     selector's own subject compound in `states`, so the two share a class by construction, and
     the source it is derived from is more specific than that subject, so without layers the
     original still wins and only the layer order can reverse it. */
  const seed = parsed.decls.find(d => d.layer === "base" && !d.imp && d.names.cls.size &&
                                      cmpSpec(d.spec, specificity(subject(d.sel))) > 0 &&
                                      !/^--/.test(d.prop));
  if (!seed) {
    console.log("REFUSED: no declaration in the sheet could seed the control, so the gate proved nothing.");
    process.exit(3);
  }
  const plantVal = seed.val === "initial" ? "unset" : "initial";
  const plant = "\n@layer states{" + subject(seed.sel) + "{" + seed.prop + ":" + plantVal + "}}\n";
  const planted = flipsOf(parseSheet(sheet.css + plant, lineAt));
  /* The plant is appended, so every pre-existing declaration keeps its ordinal and the two runs
     are comparable pair by pair rather than by a count. */
  const was = new Set(r.offenders.map(f => f.a.ord + ":" + f.b.ord));
  const added = planted.offenders.filter(f => !was.has(f.a.ord + ":" + f.b.ord));
  const isPlant = d => d.layer === "states" && d.val === plantVal && d.prop === seed.prop;
  const fromPlant = added.filter(f => isPlant(f.a) || isPlant(f.b));
  const seedNamed = fromPlant.some(f => f.a.line === seed.line || f.b.line === seed.line);
  control("control A, a reversal planted in states on {" + subject(seed.sel) + "} " + seed.prop +
          ", " + added.length + " offending pair(s) added",
          (added.length ? "caught" : "MISSED") + ", " +
          (fromPlant.length === added.length ? "all from the plant" : "not all from the plant") + ", " +
          (seedNamed ? "the seed among them" : "the seed missing"),
          "caught, all from the plant, the seed among them");
  control("control B, the plant removed", flipsOf(parseSheet(sheet.css, lineAt)).offenders.length + " offender(s)",
          r.offenders.length + " offender(s)");

  /* Controls C to F: shapes the real sheet does not carry. */
  const impSheet = "@layer base,overrides;@layer base{.a.b{color:red !important}}@layer overrides{.a{color:blue !important}}";
  control("control C, importance reverses the layer order", synth(impSheet).offenders.length + " offender(s)", "0 offender(s)");
  const impFlip = "@layer base,overrides;@layer base{.a.b{color:red}}@layer overrides{.a{color:blue !important}}";
  control("control D, an important in a later layer still wins", synth(impFlip).offenders.length + " offender(s)", "0 offender(s)");
  const un = parseSheet("@layer base;.a{color:red}@layer base{.a.b{color:blue}}", () => 1);
  control("control E, an unlayered rule is seen as unlayered",
          un.decls.filter(d => d.layer === null).length + " unlayered", "1 unlayered");
  const same = "@layer base,overrides;@layer base{.a.b{color:red}}@layer overrides{.a{color:red}}";
  control("control F, the same value on both sides is not a finding",
          synth(same).flips.length + " flip(s), " + synth(same).offenders.length + " offender(s)",
          "1 flip(s), 0 offender(s)");

  for (const line of OK) console.log("  ok   " + line);
  for (const line of BAD) console.log("  FAIL " + line);

  if (process.argv.includes("--list"))
    for (const f of r.flips) console.log((f.meet ? "MEET " : f.same ? "same " : "     ") + describe(f).trim());

  if (BAD.length) {
    console.log("RESULT: the gate's own controls did not fire, so its silence means nothing.");
    process.exit(3);
  }
  if (hard.length) {
    for (const h of hard) console.log("FAIL " + h);
    process.exit(1);
  }
  if (r.offenders.length) {
    console.log("FAIL " + r.offenders.length + " flip(s) between selectors that can meet on one box:");
    for (const f of r.offenders) console.log(describe(f));
    console.log("A layer decides a contest specificity used to decide. If that is deliberate it is a");
    console.log("decision about what somebody sees; if it is not, the layer move is wrong.");
    process.exit(1);
  }
  console.log("RESULT: OK, the layer order reverses no winner between selectors that can meet.");
}

module.exports = { parseSheet, flipsOf, specificity, subject, subjectNames, canMeet, sheetOf, cmpSpec };

if (require.main === module) run();
