/* Ghost mentions, beside deadcode.js and css-dead.js. A comment that names
 * something the code no longer has is a stale contract, and six of the 2026-09 audit's findings
 * were exactly that. This lifts every code-shaped token out of the comments - camelCase names,
 * UPPER_SNAKE constants, --custom-properties, .class-names and #ids, name() calls - and reports
 * the ones that appear nowhere in the code, the markup or the stylesheet.
 *
 *   node ghosts.js
 *
 * A hit is a CANDIDATE: prose can look like code ("e.g." is not a class), and a name can live in
 * a sibling file (the harness, the build). Read before deleting.
 *
 * WHAT IT READS: src/, through E.sourceDoc(), and it could never have read anything else.
 * Comments ARE the subject here, and esbuild deletes every comment in every module it bundles,
 * so against engine/etiuda.html this scan is blind to the whole of src/modules/ and goes quieter
 * with each extraction. Measured on a two-file tree: one ghost token in the source, reported
 * while the region sat in the monolith, reported as 0 the moment the same text moved into a
 * module. tests/text-scan-selftest.js holds that case. */
"use strict";
const DOC = require("./engine.js").sourceDoc();
const src = DOC.text;

/* Comments out, code kept - the opposite of deadcode.js's mask. Strings stay in the code half,
   because a class named in a template string is very much in use. Each comment carries the
   offset it was found at, so two mentions of the same ghost are two places and not one: the
   old code looked the comment text up with indexOf and every repeat pointed at the first. */
const comments = [];
const codeOnly = src
  .replace(/\/\*[\s\S]*?\*\//g, (m, at) => { comments.push({ text: m, at: at }); return m.replace(/[^\n]/g, " "); })
  .replace(/<!--[\s\S]*?-->/g, (m, at) => { comments.push({ text: m, at: at }); return m.replace(/[^\n]/g, " "); })
  .replace(/(^|[^:\\"'])\/\/[^\n]*/g, (m, p, at) => { comments.push({ text: m.slice(p.length), at: at + p.length }); return p + " ".repeat(m.length - p.length); });

const shapes = [
  [/\b[a-z]+[A-Z][A-Za-z0-9]*\b/g, "camel"],
  [/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g, "CONST"],
  [/--[a-z][a-z0-9-]+/g, "--prop"],
  [/(?<![\w"'`/])\.[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/g, ".class"],
  [/(?<![\w&"'`])#[a-z][A-Za-z0-9]{3,}\b/g, "#id"],
  [/\b[a-zA-Z_$][\w$]*(?=\(\))/g, "call()"],
];
const IGNORE = new Set(["e.g", "i.e"]);
const found = new Map();
comments.forEach(c => {
  shapes.forEach(([re, kind]) => {
    for (const m of c.text.matchAll(re)) {
      const tok = m[0];
      if (IGNORE.has(tok) || tok.length < 4) continue;
      const bare = tok.replace(/^[.#]/, "");
      /* present in code, markup or CSS? class and id names count if the bare word appears anywhere
         outside comments; custom properties and identifiers must appear as themselves */
      const needle = kind === ".class" || kind === "#id" ? bare : tok;
      const re2 = new RegExp("(^|[^A-Za-z0-9_$-])" + needle.replace(/[-$.]/g, "\\$&") + "(?![A-Za-z0-9_$-])");
      if (re2.test(codeOnly)) continue;
      if (!found.has(tok)) found.set(tok, { kind, at: new Set() });
      found.get(tok).at.add(c.at + m.index);
    }
  });
});
const rows = [...found].sort((a, b) => a[1].kind.localeCompare(b[1].kind) || a[0].localeCompare(b[0]));
console.log(rows.length + " code-shaped tokens live only in comments (candidates - read each):");
rows.forEach(([tok, v]) => {
  const at = [...v.at].sort((a, b) => a - b);
  console.log("  " + v.kind.padEnd(7) + tok.padEnd(34) + " in " + at.slice(0, 4).map(o => DOC.at(o)).join(", ") + (at.length > 4 ? " ..." : ""));
});
