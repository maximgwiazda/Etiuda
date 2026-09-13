/* Dead-code scan, beside test.js and i18n-scan.js. Reads the engine as TEXT, so it reads src/
 * through E.sourceDoc() and not the built artefact: esbuild puts every module inside the
 * bundle's iife, where a top-level declaration is indented and a `const` is reprinted `var`, and
 * a census anchored at column 0 stops seeing a name the moment it moves into src/modules/. The
 * headline would go on shrinking by exactly the number of names extracted and never say so.
 *
 * Finds top-level functions and consts that nothing else in the tree mentions. It counts
 * TEXTUAL references, not call graphs, which is deliberate: the engine reaches some functions by
 * name through window[...] (applyUiLang repaints that way) and some through markup attributes, so
 * a real call-graph would report those as dead and be wrong in the dangerous direction.
 *
 *   node tests/deadcode.js            names nothing references
 *   node tests/deadcode.js --once     names referenced exactly once (declaration plus one use)
 *
 * A hit is a CANDIDATE, not a verdict. Some names are kept on purpose - a catalog field that
 * must round-trip, a rescue path only a broken app reaches - and the comment above them usually
 * says so. Read before deleting.
 */
const DOC = require("./engine.js").sourceDoc();
const SRC = DOC.text;
const ONCE = process.argv.indexOf("--once") > -1;

/* Comments and strings are masked so a name mentioned only in prose does not look used. That is
   the whole question here: "referenced by code" is different from "written down somewhere". */
function mask(src) {
  let out = "", i = 0;
  const blank = s => s.replace(/[^\n]/g, " ");
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { const j = src.indexOf("\n", i); const k = j < 0 ? src.length : j;
      out += blank(src.slice(i, k)); i = k; continue; }
    if (c === "/" && d === "*") { const j = src.indexOf("*/", i + 2); const k = j < 0 ? src.length : j + 2;
      out += blank(src.slice(i, k)); i = k; continue; }
    /* REGEX LITERALS FIRST, and this is not a nicety. The engine is full of patterns like
       /['"]/ - a quote character inside a regex. Treated as the start of a string, the masker
       runs away to the next quote somewhere below and blanks whole functions, which is exactly
       how the first run of this script reported accApply as unreferenced while it is called
       twice, eight lines further down. A slash starts a regex when the last meaningful thing
       before it is an operator, a keyword or an opening bracket - never a value. */
    if (c === "/") {
      let k = out.length - 1;
      while (k >= 0 && /\s/.test(out[k])) k--;
      const prev = k >= 0 ? out[k] : "";
      const word = out.slice(Math.max(0, k - 6), k + 1);
      const isRegex = prev === "" || "(,=:[!&|?{};+-*%~^".indexOf(prev) > -1
        || /\b(return|typeof|case|in|of|new|delete|void)$/.test(word);
      if (isRegex) {
        let j = i + 1, cls = false;
        while (j < src.length) {
          if (src[j] === "\\") { j += 2; continue; }
          if (src[j] === "[") cls = true;
          else if (src[j] === "]") cls = false;
          else if (src[j] === "/" && !cls) { j++; break; }
          else if (src[j] === "\n") break;          // not a regex after all
          j++;
        }
        out += blank(src.slice(i, j)); i = j; continue;
      }
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1, closed = false;
      while (j < src.length) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === c) { j++; closed = true; break; }
        /* A ' or " string cannot hold a raw newline, so a quote with no partner on its own line
           is not a string at all - it is an apostrophe in prose, and src/template.html has one
           inside a markup comment. Without this the masker ran from there into the module
           sources and blanked the first three of them whole. A backtick may span lines. */
        if (src[j] === "\n" && c !== "`") break;
        j++;
      }
      if (!closed && c !== "`") { out += c; i++; continue; }
      // strings are kept as spaces EXCEPT we remember them separately, see stringRefs below
      out += blank(src.slice(i, j)); i = j; continue;
    }
    out += c; i++;
  }
  return out;
}

/* Import and export statements are the cost of a name having MOVED, not a use of it. Counted,
   an extraction would hand every name it carries a free reference - the declaration, the export
   list, the import in each module that wants it - and a name nothing calls would climb out of
   "referenced nowhere" into "referenced once" by being extracted. Blanking them is what makes a
   name in a module count as it counted in the monolith. Strings are already blank here, so the
   lazy reach to the first ; or } cannot run past the statement. */
function maskModulePlumbing(src) {
  const blank = s => s.replace(/[^\n]/g, " ");
  return src.replace(/^import\b[\s\S]*?;/gm, blank)
            .replace(/^export\s*\{[\s\S]*?\}\s*;?/gm, blank);
}

const masked = maskModulePlumbing(mask(SRC));
// names reached by name through a string: window["drawPills"], data-act="settings", etc.
const stringRefs = new Set();
SRC.replace(/["'`]([A-Za-z_$][\w$]*)["'`]/g, (m, n) => { stringRefs.add(n); return m; });

/* `export function f()` and `export const X =` are counted as the declarations they are. No
   module spells them that way today, and a census that missed the spelling would go blind in
   exactly the way this scan was repaired for. */
const names = [];
masked.replace(/^(?:export\s+)?(?:function\s+([A-Za-z_$][\w$]*)\s*\(|const\s+([A-Za-z_$][\w$]*)\s*=)/gm,
  (m, fn, cn, at) => { names.push({ n: fn || cn, kind: fn ? "function" : "const", at: at }); return m; });

const rows = [];
names.forEach(({ n, kind, at }) => {
  const re = new RegExp("(?:^|[^\\w$.])" + n.replace(/\$/g, "\\$") + "(?![\\w$])", "g");
  const uses = (masked.match(re) || []).length;      // includes the declaration itself
  const viaString = stringRefs.has(n);
  rows.push({ n, kind, uses, viaString, at });
});

const dead = rows.filter(r => r.uses <= 1 && !r.viaString);
const once = rows.filter(r => r.uses === 2 && !r.viaString);

console.log("top-level names: " + rows.length
  + " | referenced nowhere: " + dead.length
  + " | referenced once: " + once.length);
console.log("");
const show = ONCE ? once : dead;
console.log(ONCE ? "=== used exactly once ===" : "=== nothing references these ===");
show.sort((a, b) => a.n.localeCompare(b.n)).forEach(r => {
  console.log("  " + r.kind.padEnd(9) + r.n.padEnd(28) + DOC.at(r.at));
});
