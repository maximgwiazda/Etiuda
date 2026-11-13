/* CUT TEXT FADES, NOTHING ENDS IN AN ELLIPSIS (Maxim, 2026-10-06 22:20): "All text must shorten with fade off,
 * as it does in Desk".
 *
 *   node tests/fade-off.mjs
 *
 * Node only, no window and no browser. What it holds:
 *   1. the sheet, src/template.html whole and in any letter case: no `text-overflow:ellipsis` and no `line-clamp`;
 *      every rule clipping one line (overflow hidden or clip, with white-space nowrap) is a box the cut pass
 *      measures (CUT_SEL in src/modules/cut-text.js), or is named below as the same box as one it measures, as no
 *      line of text, or as clipped without a fade and not yet measured; and every box of lines the pass cuts at its
 *      foot (CUT_FOOT) has a height of whole lines and a fade (.cut-b);
 *   2. the code: no string literal in src/ that is only an ellipsis or three dots (the shape of a cut written by
 *      code), none that names text-overflow, an ellipsis or a line clamp, and no code that builds one with
 *      fromCharCode(8230) or sets textOverflow or lineClamp; a label whose own words end in an ellipsis is typed,
 *      not cut, and stays;
 *   3. the pass itself, on laid-out numbers: a line whose ink runs past its box is marked on that side, a line
 *      that fits is not, and a box of lines that runs out is cut at its foot, one that holds its lines is not.
 * Each part has its control: what it must find, planted, is found, and a comment that only names it is not.
 * Exit code is the number of failed checks.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
let failures = 0, legs = 0;
function check(ok, what) { legs++; if (!ok) failures++; console.log((ok ? "  ok   " : "  FAIL ") + what); }

/* ---- 1. the sheet --------------------------------------------------------------------------------- */

const SHEET = read("src", "template.html");
const CUT = read("src", "modules", "cut-text.js");
const listOf = (src, name) => {
  const m = new RegExp("const " + name + "=([^;]+);").exec(src);
  return m ? vm.runInNewContext(m[1]).split(",").map(s => s.trim()) : null;
};
/* Comments out, CSS and HTML both, so a rule or a style attribute anywhere in the file counts and a note does not. */
const uncommentedHtml = h => h.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const cssOf = h => [...h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
const ELLIPSIS = /text-overflow\s*:\s*ellipsis/i, CLAMP = /line-clamp/i;
function rules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m; (m = re.exec(css));) out.push({ sel: m[1].trim().replace(/\s+/g, " ").split(",").map(x => x.trim()), d: m[2] });
  return out;
}
/* The same box as a line CUT_SEL names, under a longer selector. */
const SAME = {
  ".modal-card h2 .modal-name": ".modal-name",
  ".manage-row .mg-int-t": ".mg-int-t",
  ".sx.lm-lib .mg-intents .manage-row.mg-int .mg-int-t": ".mg-int-t",
  ".manage-row .mg-card-lab": ".mg-card-lab",
  ".mg-cat-body .mg-card-lab": ".mg-card-lab",
  ".sx.lm-lib .mg-intents .manage-row.mg-int.chips-open .lw-chip": ".mg-int.chips-open .lw-chip",
  ".sx.lm-lib .mg-intents .manage-row.mg-int .lw-date": ".lw-date",
};
/* Boxes that clip a line and are not a line a reader is meant to finish. */
const NOT_TEXT = {
  "#eSay": "the words a screen reader hears, one pixel square on purpose",
  ".e-vh": "the same, visually hidden",
  ".ln-sep": "the same, visually hidden",
  ".sx.lm-mt .mt-readings": "the same, visually hidden",
  ".sx.lm .screen-head .screen-name": "the same box as .screen-head .screen-name, hidden from sight on the Library's screen",
  ".cat-now": "a row of boxes; its line, .cat-now .cn-name, is measured",
  ".tab-label": "a row of boxes; its line, .tab-label>span, is measured",
  ".lk-ghost": "the card's ghost under the pointer while it is dragged, gone at the drop",
  ".lw-drum .p": "the drum's neighbours above and below, dimmed, each its own span under .lw-drum span, which is measured",
  ".lw-drum .q": "the same",
  ".lw-drum .c": "the same, the drum's word in front",
};
/* Clipped without a fade, and not measured: each named, so a new one is found. */
const UNFADED = {
  ".sgn-link input.sgn-link-f": "the sign-in link, a read-only field selected whole by a click; a field fades through wireCutFields, which does not listen to it",
};
function sheetFaults(html, cut) {
  const sel = listOf(cut, "CUT_SEL") || [], foot = listOf(cut, "CUT_FOOT") || [];
  const whole = uncommentedHtml(html), css = cssOf(html), all = rules(css);
  const f = [];
  if (ELLIPSIS.test(whole)) f.push("text-overflow:ellipsis");
  if (CLAMP.test(whole)) f.push("line-clamp");
  all.forEach(r => {
    if (!(/overflow(-x)?\s*:\s*(hidden|clip)/i.test(r.d) && /white-space\s*:\s*nowrap/i.test(r.d))) return;
    r.sel.forEach(one => {
      if (sel.includes(one) || (SAME[one] && sel.includes(SAME[one])) || NOT_TEXT[one] || UNFADED[one]) return;
      f.push("unmeasured " + one);
    });
  });
  foot.forEach(one => {
    const r = all.find(x => x.sel.includes(one));
    if (!r || !/overflow\s*:\s*hidden/i.test(r.d) || !/max-height\s*:\s*\d+lh/i.test(r.d)) f.push("foot without whole lines " + one);
  });
  if (foot.length && !all.some(x => x.sel.includes(".cut-b") && /mask-image/.test(x.d))) f.push("no .cut-b fade");
  return f;
}
const sel = listOf(CUT, "CUT_SEL"), foot = listOf(CUT, "CUT_FOOT");
check(!!sel && sel.length >= 30 && !!foot && foot.length >= 2,
  "1a cut-text.js names the lines its pass measures (CUT_SEL, " + (sel || []).length + ") and the boxes it cuts at their foot (CUT_FOOT: "
  + JSON.stringify(foot) + ")");
const now = sheetFaults(SHEET, CUT);
check(now.length === 0, "1b the sheet carries no ellipsis and no line clamp, every rule clipping one line is measured or named,"
  + " and every foot is whole lines with its fade: " + JSON.stringify(now));
const named = [SAME, NOT_TEXT, UNFADED].reduce((n, o) => n.concat(Object.keys(o)), []);
const css = cssOf(SHEET), present = rules(css).reduce((a, r) => a.concat(r.sel), []);
const stale = named.filter(k => !present.includes(k)).concat(Object.values(SAME).filter(v => !(sel || []).includes(v)));
check(stale.length === 0, "1c every selector named above is still a rule in the sheet, and each SAME box is in CUT_SEL, so the lists cannot"
  + " outlive their reasons: " + JSON.stringify(stale));
const planted = SHEET.replace("</style>", ".planted-a{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n"
  + ".planted-b{display:-webkit-box;-webkit-line-clamp:2}\n</style>");
const plantedF = sheetFaults(planted, CUT);
check(plantedF.join("|") === "text-overflow:ellipsis|line-clamp|unmeasured .planted-a",
  "1d CONTROL: a planted rule with an ellipsis and an unmeasured clip, and a planted clamp, are all three found: " + JSON.stringify(plantedF));
/* The markup the sheet ends on, where a planted element sits outside every style block and comment. */
const TAIL = "<script src=\"etiuda-catalog.js\"></script>";
if (!SHEET.includes(TAIL)) throw new Error("fade-off: the sheet no longer ends on its catalog script, so the plants below have no anchor");
const plants = {
  "capitals in a rule": h => h.replace("</style>", ".planted-c{TEXT-OVERFLOW:ELLIPSIS}\n</style>"),
  "a clamp in capitals": h => h.replace("</style>", ".planted-d{-WEBKIT-LINE-CLAMP:2}\n</style>"),
  "an ellipsis in a style attribute": h => h.replace(TAIL, '<div style="white-space:nowrap;text-overflow: ellipsis">x</div>' + TAIL),
  "a clamp in a style attribute": h => h.replace(TAIL, '<div style="-webkit-line-clamp:3">x</div>' + TAIL),
  "a foot without whole lines": h => h,
};
const footless = CUT.replace(/const CUT_FOOT=([^;]+);/, (m, v) => "const CUT_FOOT=" + v + "+\",.planted-foot\";");
const missed = Object.keys(plants).filter(k => sheetFaults(plants[k](SHEET), k === "a foot without whole lines" ? footless : CUT).length === 0);
const said = sheetFaults(SHEET.replace(TAIL, "<!-- text-overflow:ellipsis and line-clamp are not used here -->" + TAIL), CUT);
check(missed.length === 0 && said.length === 0, "1e CONTROL: " + Object.keys(plants).length + " more ways back are each found alone (not found: "
  + JSON.stringify(missed) + "), and an HTML comment that only names them is not: " + JSON.stringify(said));

/* ---- 2. the code ----------------------------------------------------------------------------------- */

/** The string literals of a JavaScript source, comments and regular expressions skipped; a template literal's
 *  text with its ${...} kept as written. A regex is told from a division by the token before it. */
function literals(src, comments) {
  const out = [];
  let i = 0, prev = "";
  const n = src.length;
  const regexOk = () => prev === "" || /[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /\b(return|typeof|case|of|in|do|else|void|delete|new|throw|yield|await)$/.test(prev);
  function readString(q) {
    let s = ""; i++;
    while (i < n && src[i] !== q) { if (src[i] === "\\") { s += src[i] + src[i + 1]; i += 2; continue; } s += src[i++]; }
    i++;
    return s;
  }
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { const from = i; while (i < n && src[i] !== "\n") i++; if (comments) comments.push([from, i]); continue; }
    if (c === "/" && d === "*") { const from = i, e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; if (comments) comments.push([from, i]); continue; }
    if (c === "'" || c === '"') { out.push(readString(c)); prev = "x"; continue; }
    if (c === "`") {
      let s = ""; i++;
      while (i < n && src[i] !== "`") {
        if (src[i] === "\\") { s += src[i] + src[i + 1]; i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") {
          i += 2; let depth = 1; const from = i;
          while (i < n && depth) {
            const ch = src[i];
            if (ch === "'" || ch === '"') { out.push(readString(ch)); continue; }
            if (ch === "{") depth++; else if (ch === "}") depth--;
            i++;
          }
          s += "${" + src.slice(from, i - 1) + "}";
          continue;
        }
        s += src[i++];
      }
      i++;
      out.push(s); prev = "x"; continue;
    }
    if (c === "/" && regexOk()) {
      i++; let cls = false;
      while (i < n) {
        const ch = src[i];
        if (ch === "\\") { i += 2; continue; }
        if (ch === "[") cls = true; else if (ch === "]") cls = false;
        else if (ch === "/" && !cls) break;
        else if (ch === "\n") break;
        i++;
      }
      i++;
      while (/[a-z]/.test(src[i] || "")) i++;
      prev = "x"; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[\w$]/.test(c)) { let w = ""; while (i < n && /[\w$]/.test(src[i])) w += src[i++]; prev = w; continue; }
    prev = c; i++;
  }
  return out;
}
const DOT = "(?:…|\\.\\.\\.|\\\\u2026|\\\\u\\{0*2026\\}|&hellip;|&#0*8230;|&#x0*2026;)";
/* A cut written by code: a literal that is only dots, around at most the pieces a template puts in. */
const ONLY_DOTS = new RegExp("^\\s*(?:\\$\\{[^}]*\\}\\s*)?" + DOT + "\\s*(?:\\$\\{[^}]*\\}\\s*)?$", "i");
const NAMES = /text-overflow|ellipsis|line-clamp/i;
const BUILT = [[/fromCharCode\s*\([^)]*\b(8230|0x2026)\b/i, "fromCharCode(8230)"], [/textOverflow/, "textOverflow"], [/[Ll]ineClamp/, "lineClamp"]];
function uncommented(src) {
  const comments = [];
  literals(src, comments);
  let out = "", at = 0;
  comments.forEach(([a, b]) => { out += src.slice(at, a) + " "; at = b; });
  return out + src.slice(at);
}
function codeFaults(file, src) {
  return literals(src).filter(s => ONLY_DOTS.test(s) || NAMES.test(s)).map(s => file + " " + JSON.stringify(s))
    .concat(BUILT.filter(([re]) => re.test(uncommented(src))).map(([, nm]) => file + " builds a cut with " + nm));
}
const SOURCES = ["src/main.js"].concat(fs.readdirSync(path.join(ROOT, "src", "modules")).filter(f => /\.(m?js)$/.test(f)).map(f => "src/modules/" + f));
const scripts = [...SHEET.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join("\n");
let scanned = 0;
const found = [];
SOURCES.forEach(f => { const s = read(f); scanned += literals(s).length; found.push(...codeFaults(f, s)); });
scanned += literals(scripts).length; found.push(...codeFaults("src/template.html <script>", scripts));
check(found.length === 0 && scanned > 10000, "2a no literal in src/ is a cut written by code or names an ellipsis or a clamp, and no code builds"
  + " one (" + (SOURCES.length + 1) + " sources, " + scanned + " literals read): " + JSON.stringify(found));
const APP = read("src", "modules", "render.js");
const codePlants = {
  "a cut with an ellipsis": 'const a = s => s.slice(0, 20) + "…";',
  "a cut with three dots in a template": "const a = s => `${s.slice(0, 9)}...`;",
  "a front cut": "const a = s => '…' + s.slice(-9);",
  "the escape": 'const a = s => s + "\\u2026";',
  "the braced escape": 'const a = s => s + "\\u{2026}";',
  "an entity": 'const a = s => s + "&hellip;";',
  "fromCharCode(8230)": "const a = String.fromCharCode(8230);",
  "fromCharCode(0x2026) among others": "const a = String.fromCharCode(0x2018, 0X2026);",
  "textOverflow set in code": "const a = el => { el.style.textOverflow = mode; };",
  "lineClamp set in code": "const a = el => { el.style.webkitLineClamp = 2; };",
  "a string that says ellipsis": 'const a = "text-overflow: Ellipsis";',
  "a string that says line-clamp": "const a = '-webkit-line-clamp:2';",
};
const codeMiss = Object.keys(codePlants).filter(k => codeFaults("render.js", APP + "\n" + codePlants[k] + "\n").length === 0);
const labels = codeFaults("render.js", APP + '\nconst a = t("Load catalog file…"), b = "Show tour…";\n');
const commentsOnly = codeFaults("render.js", APP + "\n// textOverflow, lineClamp, fromCharCode(8230), \\u2026 and ellipsis, said in a comment\n/* line-clamp and … */\n");
check(codeMiss.length === 0 && labels.length === 0 && commentsOnly.length === 0,
  "2b CONTROL: " + Object.keys(codePlants).length + " ways to cut with dots in code are each found alone (not found: " + JSON.stringify(codeMiss)
  + "); a label typed with its own ellipsis is not a cut (" + JSON.stringify(labels) + "), nor are the same words in a comment ("
  + JSON.stringify(commentsOnly) + ")");
check(literals('const r = /a\\.\\.\\.b/.test(x) ? "x" : 1 / 2; const y = "z";').join("|") === "x|z",
  "2c CONTROL: the reader skips a regular expression and a division, and reads the strings around them");

/* ---- 3. the pass, on laid-out numbers ------------------------------------------------------------------ */

const R = (l, r, t = 0, b = 20) => ({ left: l, right: r, top: t, bottom: b, width: r - l, height: b - t });
let inkOf = null;
const range = { selectNodeContents(el) { inkOf = el; }, getBoundingClientRect() { return inkOf.ink; } };
function box(rect, ink, text, more) {
  const cls = new Set(), attrs = {};
  return Object.assign({
    tagName: "SPAN", rect, ink, textContent: text, scrollHeight: 0, clientHeight: 0, parentNode: null,
    getBoundingClientRect: () => rect, closest: () => null,
    classList: { toggle(c, on) { if (on === undefined ? !cls.has(c) : on) cls.add(c); else cls.delete(c); }, contains: c => cls.has(c) },
    get title() { return attrs.title; }, set title(v) { attrs.title = v; },
    cls, attrs,
  }, more || {});
}
const lines = [box(R(0, 100), R(0, 140), "A long folder name"), box(R(0, 100), R(0, 90), "Short"),
  box(R(0, 100), R(-30, 100), "C:/a folder cut at its front")];
lines[0].cls.add("cut-peek");
const feet = [box(R(0, 100, 0, 40), R(0, 100), "Three lines and more", { scrollHeight: 60, clientHeight: 40 }),
  box(R(0, 100, 0, 40), R(0, 100), "Two lines", { scrollHeight: 40, clientHeight: 40 })];
feet[0].cls.add("cut-peek");
const zero = "0px";
Object.assign(globalThis, {
  document: {
    querySelector: () => null, querySelectorAll: () => [], body: { classList: { contains: () => false } },
    createRange: () => range, createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }) }) }),
  },
  getComputedStyle: () => ({ borderLeftWidth: zero, borderRightWidth: zero, paddingLeft: zero, paddingRight: zero }),
  innerHeight: 800, matchMedia: () => ({ matches: false }),
});
let C = null, D = null;
try {
  D = await import(pathToFileURL(path.join(ROOT, "src", "modules", "dom.js")).href);
  C = await import(pathToFileURL(path.join(ROOT, "src", "modules", "cut-text.js")).href);
  D.grabDom();
} catch (e) { console.log("  the modules did not load: " + e.message); }
check(!!C && typeof C.markCutText === "function" && typeof C.CUT_FOOT === "string", "3a cut-text.js loads in node and exports its pass and CUT_FOOT");
if (C) {
  const root = { querySelectorAll: s => (s === C.CUT_SEL ? lines : s === C.CUT_FOOT ? feet : []) };
  C.markCutText(root);
  const st = b => [...b.cls].sort().concat(b.attrs.title !== undefined ? ["title=" + JSON.stringify(b.attrs.title)] : []).join(" ");
  check(st(lines[0]) === 'cut-peek cut-r is-cut title="A long folder name"', "3b a line running past its right edge fades there: " + st(lines[0]));
  check(st(lines[1]) === "", "3c CONTROL: a line that fits is neither faded nor given a tooltip: " + JSON.stringify(st(lines[1])));
  check(st(lines[2]) === "cut-l is-cut", "3d a line whose ink starts before its box, a folder trimmed at its front, fades at its left: " + st(lines[2]));
  check(st(feet[0]) === 'cut-b cut-peek title="Three lines and more"' && st(feet[1]) === "",
    "3e a box of lines that runs out is cut at its foot, and one that holds its lines is not: " + st(feet[0]) + " / " + JSON.stringify(st(feet[1])));
  feet[0].scrollHeight = 40;
  C.markCutText(root);
  check(st(feet[0]) === 'cut-peek title=""', "3f a box that holds its lines again loses its fade, and its tooltip empties: " + st(feet[0]));
}

console.log(legs + " leg(s), " + failures + " failure(s)");
process.exit(failures ? 1 : 0);
