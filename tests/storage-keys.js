/* Storage map, beside test.js. Every key the engine reads, writes or deletes
 * in localStorage, through its own helpers or directly, with where and how often; then the keys
 * that are read but never written (migrations from older versions, or stale readers), written but
 * never read (dead writes), and the keys the settings reset does not cover. Also every call whose
 * key is not a literal, since those cannot be mapped by text.
 *
 *   node storage-keys.js
 *
 * WHAT IT READS: src/, through E.sourceDoc(). The subject is a call site in JS, and a call site
 * in a module is reprinted by esbuild: measured on a two-file tree, one pair of calls on a single
 * source line came back on two lines of engine/etiuda.html once the region moved into a module,
 * so an artefact line number is a number nobody can open and it drifts with every build. The key
 * strings themselves survive the reprint, so no key was lost - what was lost is where it is.
 * A key mentioned only in a comment is not counted, here or anywhere: see ghosts.js. */
"use strict";
const DOC = require("./engine.js").sourceDoc();
const src = DOC.text;
/* Blanked rather than deleted, so an offset into `code` is still an offset into src and DOC.at()
   can turn it back into src/<file>:<line>. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")).replace(/(^|[^:\\"'])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
const keys = new Map();
const dyn = [];
const note = (key, op, at) => { if (!keys.has(key)) keys.set(key, { get: [], set: [], del: [] }); keys.get(key)[op].push(at); };
const calls = /\b(lsGet|lsSet|lsDel|nsGet|nsSet|nsDel|localStorage\.getItem|localStorage\.setItem|localStorage\.removeItem)\(\s*([^,)]+)/g;
let m;
while ((m = calls.exec(code))) {
  const fn = m[1], raw = m[2].trim(), at = m.index;
  const op = /Get|getItem/.test(fn) ? "get" : /Del|removeItem/.test(fn) ? "del" : "set";
  const lit = raw.match(/^["']([^"']+)["']$/);
  if (lit) note((fn.startsWith("ns") ? "ns:" : "") + lit[1], op, at);
  else dyn.push({ fn, raw: raw.slice(0, 60), at: at });
}
/* THE SETTINGS RESET, READ AT THE FUNCTION THAT PERFORMS IT.
 *
 * Until 2026-09-14 this took the first bracketed array of "pb..." literals ANYWHERE in the
 * document - a shape rather than a place. src/modules/ is read in filename order, so
 * local-memory.js's E_PREF_KEYS, nineteen names belonging to a different button, sorts ahead of
 * settings.js and was what this line reported; the count was out by eight and nothing said so.
 * Worse than being wrong, it has been right by accident: a cut that reorders the document moves
 * the intended array into first place and the line starts telling the truth for no reason.
 *
 * It now follows the NAME. resetAllSettings() is located, its body taken by brace match, and the
 * covered keys are the ones that body deletes. If the name is not there the section refuses out
 * loud and the exit code goes non-zero, because a section that quietly disappears is how a scan
 * reports green on a subject it can no longer see. Proved by control in text-scan-selftest.js:
 * a decoy array placed ahead of the function, which the old rule picks and this one does not. */
const RESET_FN = "resetAllSettings";

/* Brace match from the function's opening brace. Comments are already blank in `code`; string
   literals are stepped over here so a brace inside one cannot move the end. A regex literal
   holding an unbalanced brace would still fool it, so the result is CHECKED for over-run below
   rather than trusted. Offsets are into `code`, which is the same length as src. */
function bodyOf(text, name) {
  const at = text.search(new RegExp("\\bfunction\\s+" + name + "\\s*\\("));
  if (at < 0) return null;
  const start = text.indexOf("{", text.indexOf("(", at));
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1, closed = false;
      while (j < text.length) {
        if (text[j] === "\\") { j += 2; continue; }
        if (text[j] === c) { closed = true; break; }
        /* A ' or " cannot hold a raw newline: an unpartnered one is an apostrophe, not an
           opener. The same language fact deadcode.js's masker turns on. */
        if (text[j] === "\n" && c !== "`") break;
        j++;
      }
      if (closed) { i = j; continue; }
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return { at: start, text: text.slice(start, i + 1) };
  }
  return null;
}

/* The text inside the bracket pair that opens at `open`, by depth over that one bracket kind.
   Blind to strings, so a stray closer inside one would end it early; every caller below bounds
   the result and drops it rather than trusting a long or unbalanced one. */
function group(text, open) {
  const close = { "(": ")", "[": "]", "{": "}" }[text[open]];
  let d = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === text[open]) d++;
    else if (text[i] === close && --d === 0) return text.slice(open + 1, i);
  }
  return "";
}

const reset = bodyOf(code, RESET_FN);
const resetKeys = new Set();
let resetProblem = null;
if (!reset) {
  resetProblem = "there is no function " + RESET_FN + "() in this reading of the source";
} else if (/\nfunction\s/.test(reset.text)) {
  resetProblem = RESET_FN + "()'s body ran past its own closing brace - a brace inside a regex"
    + " literal will do that, and the keys below would be some other function's";
} else {
  /* Two shapes, both literal by construction. An array of key strings handed to forEach, where
     the callback says which store it deletes from; and a direct lsDel("k") / nsDel("k"). A key
     built at run time cannot be counted here and appears in the non-literal list at the foot of
     this report instead. An array whose callback deletes nothing is not a delete list and is
     ignored, so an unrelated forEach in the body cannot contribute keys. */
  for (const a of reset.text.matchAll(/\[([^\]]*)\]\s*\.forEach\(/g)) {
    /* The CALLBACK, not the next 200 characters: the line after this one in settings.js calls
       nsDel twice, so a fixed window saw both stores and could attribute neither. Paren-matched
       and bounded, and a callback too long or unbalanced is left unattributed rather than
       guessed at. */
    const cb = group(reset.text, a.index + a[0].length - 1);
    const ns = /\bnsDel\b/.test(cb), ls = /\blsDel\b/.test(cb);
    if (ns === ls || cb.length > 300) continue;   // neither, or both, or too big to read
    for (const s of a[1].match(/"[^"\\]*"|'[^'\\]*'/g) || []) resetKeys.add((ns ? "ns:" : "") + s.slice(1, -1));
  }
  for (const c of reset.text.matchAll(/\b(lsDel|nsDel)\(\s*["']([^"']+)["']\s*\)/g))
    resetKeys.add((c[1] === "nsDel" ? "ns:" : "") + c[2]);
  if (!resetKeys.size) resetProblem = RESET_FN + "() deletes no literal key - every key it removes is built at run time";
}

const rows = [...keys].sort((a, b) => a[0].localeCompare(b[0]));
console.log(rows.length + " literal keys (ns: = namespaced per catalog)");
console.log("key".padEnd(30) + "reads  writes  deletes  where");
rows.forEach(([k, v]) => console.log(k.padEnd(30) + String(v.get.length).padStart(5) + String(v.set.length).padStart(8) + String(v.del.length).padStart(9)
  /* Deduped on the rendered place, not on the offset: two calls on one line are one line. */
  + "  " + [...new Set([...v.get, ...v.set, ...v.del].sort((a, b) => a - b).map(o => DOC.at(o)))].slice(0, 8).join(" ")));
const readOnly = rows.filter(([, v]) => v.get.length && !v.set.length).map(([k]) => k);
const writeOnly = rows.filter(([, v]) => v.set.length && !v.get.length).map(([k]) => k);
console.log("\nread but never written (migrations or stale readers): " + (readOnly.join(", ") || "none"));
console.log("written but never read (dead writes): " + (writeOnly.join(", ") || "none"));
if (resetProblem) {
  /* Suppressed rather than guessed. The old rule answered from whatever array it met first, so
     the only way to see it was wrong was to know the answer already. */
  console.log("\nsettings reset: NOT READ - " + resetProblem);
  console.log("  no covered-key count is printed, because a count from the wrong array is worse than none.");
  process.exitCode = 1;
} else {
  const covered = [...resetKeys].sort();
  const all = rows.map(([k]) => k);
  const missPlain = all.filter(k => !k.startsWith("ns:") && !resetKeys.has(k));
  const missNs = all.filter(k => k.startsWith("ns:") && !resetKeys.has(k));
  const unknown = covered.filter(k => !keys.has(k));
  console.log("\nsettings reset covers " + covered.length + " key(s), taken from the body of " + RESET_FN
    + "() by brace match: " + covered.join(", "));
  console.log("  plain keys it does not touch:      " + (missPlain.join(", ") || "none"));
  console.log("  namespaced keys it does not touch: " + (missNs.join(", ") || "none"));
  /* A key the reset deletes that no other call site mentions is a stale entry in that list, or a
     key this scan cannot see. Either way somebody should look. */
  console.log("  keys it deletes that no other call site mentions: " + (unknown.join(", ") || "none"));
}
console.log("\n" + dyn.length + " calls with a non-literal key (map by hand):");
dyn.forEach(d => console.log("  " + DOC.at(d.at).padEnd(34) + d.fn + "(" + d.raw + ")"));
