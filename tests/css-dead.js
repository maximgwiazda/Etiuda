/* Mechanical dead-CSS scan, the stylesheet half of what deadcode.js does for JS names. Textual,
   like deadcode.js: a class or id in a selector counts as alive if the word appears anywhere
   outside the stylesheet (markup, JS strings, classList calls); a custom property counts as read
   if var(--x) or getPropertyValue("--x") appears anywhere. Hits are CANDIDATES to read, not
   verdicts - names built by concatenation will show up here.
   Usage: node css-dead.js  (run in the etiuda folder)

   WHAT IT READS: src/, through E.sourceDoc(). Both halves want the source. The stylesheet half
   is src/template.html, which reaches engine/etiuda.html byte for byte, so that half is the same
   claim either way. The evidence half is the JS, and a mention of a class is only certainly
   the author's where the author wrote it: esbuild reprints every module it bundles, and a report
   that says "delete this rule" has to name a file somebody can open and edit. engine/etiuda.html
   is generated and a hand edit there is discarded by the next build.

   What this therefore does NOT answer is whether the build dropped a mention that src/ has.
   That is a build question and belongs to tests/build-fresh.mjs and tools/split-guard/. */
const DOC = require("./engine.js").sourceDoc();
const src = DOC.text;
const styleAt = src.indexOf("<style>", 1000), styleEnd = src.indexOf("</style>", styleAt);
const css = src.slice(styleAt + 7, styleEnd);
const rest = src.slice(0, styleAt) + src.slice(styleEnd);
/* Blanked rather than deleted, so every offset below is still an offset into src and DOC.at()
   can turn it back into src/<file>:<line>. Deleting shifted every line number after a comment. */
const blank = m => m.replace(/[^\n]/g, " ");
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, blank);
const cssCode = strip(css);
/* JS comments are prose: a class named only in a comment is not used. Strings stay. */
const restCode = rest.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:\\"'])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));

/* Selectors: everything before a '{' that is not an at-rule prelude or a declaration. */
const classes = new Map(), ids = new Map();
const selRe = /([^{}]+)\{/g; let m;
while ((m = selRe.exec(cssCode))) {
  const sel = m[1].trim();
  if (/^@/.test(sel) || /^\s*$/.test(sel) || /:\s*[^:]+;/.test(sel) && !/[.#\[]/.test(sel)) continue;
  /* a prelude like `@media (...)` was skipped above; nested rule bodies still yield their own selectors */
  const at = styleAt + 7 + m.index;
  for (const c of sel.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) if (!classes.has(c[1])) classes.set(c[1], at);
  for (const c of sel.matchAll(/#(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) if (!ids.has(c[1])) ids.set(c[1], at);
}
const word = (name, hay) => new RegExp("(^|[^A-Za-z0-9_-])" + name.replace(/[-]/g, "\\-") + "(?![A-Za-z0-9_-])").test(hay);
const deadClasses = [...classes].filter(([n]) => !word(n, restCode));
const deadIds = [...ids].filter(([n]) => !word(n, restCode));

/* Custom properties. */
const defined = new Map();
for (const d of src.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) if (!defined.has(d[1])) defined.set(d[1], d.index);
for (const d of src.matchAll(/setProperty\(\s*["'](--[A-Za-z0-9_-]+)["']/g)) if (!defined.has(d[1])) defined.set(d[1], d.index);
const read = new Set();
for (const u of src.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) read.add(u[1]);
for (const u of src.matchAll(/getPropertyValue\(\s*["'](--[A-Za-z0-9_-]+)["']/g)) read.add(u[1]);
const neverRead = [...defined].filter(([n]) => !read.has(n));
const neverDefined = [...read].filter(n => !defined.has(n));
/* var(--x) with no fallback and no definition anywhere is a bug, not dead code. */
const noFallback = neverDefined.filter(n => new RegExp("var\\(\\s*" + n + "\\s*\\)").test(src));

/* Classes that appear in exactly one place in the whole file: a state class toggled by JS that
   no rule styles, or a rule for a state nothing toggles. */
const allNames = new Set([...classes.keys()]);
for (const c of restCode.matchAll(/classList\.(?:add|toggle|remove|contains)\(\s*["']([A-Za-z_-][A-Za-z0-9_-]*)["']/g)) allNames.add(c[1]);
const once = [...allNames].filter(n => {
  const re = new RegExp("(^|[^A-Za-z0-9_-])" + n.replace(/[-]/g, "\\-") + "(?![A-Za-z0-9_-])", "g");
  const total = (strip(src.replace(/(^|[^:\\"'])\/\/[^\n]*/g, "$1")).match(re) || []).length;
  return total === 1;
});

const show = (title, list, f) => { console.log("\n=== " + title + " (" + list.length + ") ==="); list.forEach(x => console.log("  " + f(x))); };
console.log("selectors: " + classes.size + " classes, " + ids.size + " ids | custom properties: " + defined.size + " defined, " + read.size + " read");
show("classes styled but never mentioned outside the stylesheet", deadClasses, ([n, a]) => n.padEnd(28) + " " + DOC.at(a));
show("ids styled but never mentioned outside the stylesheet", deadIds, ([n, a]) => n.padEnd(28) + " " + DOC.at(a));
show("custom properties defined but never read", neverRead, ([n, a]) => n.padEnd(28) + " " + DOC.at(a));
show("custom properties read but never defined (fallback covers them unless listed below)", neverDefined, n => n);
show("read with NO fallback and no definition - bugs", noFallback, n => n);
show("class names that occur exactly once in the whole file", once, n => n);
