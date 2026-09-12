/* Ghost mentions, beside deadcode.js and css-dead.js. A comment that names
 * something the code no longer has is a stale contract, and six of the 2026-09 audit's findings
 * were exactly that. This lifts every code-shaped token out of the comments - camelCase names,
 * UPPER_SNAKE constants, --custom-properties, .class-names and #ids, name() calls - and reports
 * the ones that appear nowhere in the code, the markup or the stylesheet.
 *
 *   node ghosts.js
 *
 * A hit is a CANDIDATE: prose can look like code ("e.g." is not a class), and a name can live in
 * a sibling file (the harness, the build). Read before deleting. */
"use strict";
const src = require("./engine.js").engineSource();
const lines = src.split("\n");

/* Comments out, code kept - the opposite of deadcode.js's mask. Strings stay in the code half,
   because a class named in a template string is very much in use. */
const comments = [];
const codeOnly = src
  .replace(/\/\*[\s\S]*?\*\//g, m => { comments.push(m); return m.replace(/[^\n]/g, " "); })
  .replace(/<!--[\s\S]*?-->/g, m => { comments.push(m); return m.replace(/[^\n]/g, " "); })
  .replace(/(^|[^:\\"'])\/\/[^\n]*/g, (m, p) => { comments.push(m.slice(p.length)); return p + " ".repeat(m.length - p.length); });

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
    for (const m of c.matchAll(re)) {
      const tok = m[0];
      if (IGNORE.has(tok) || tok.length < 4) continue;
      const bare = tok.replace(/^[.#]/, "");
      /* present in code, markup or CSS? class and id names count if the bare word appears anywhere
         outside comments; custom properties and identifiers must appear as themselves */
      const needle = kind === ".class" || kind === "#id" ? bare : tok;
      const re2 = new RegExp("(^|[^A-Za-z0-9_$-])" + needle.replace(/[-$.]/g, "\\$&") + "(?![A-Za-z0-9_$-])");
      if (re2.test(codeOnly)) continue;
      if (!found.has(tok)) found.set(tok, { kind, at: new Set() });
      /* the line of the first occurrence of this comment */
      const idx = src.indexOf(c);
      found.get(tok).at.add(idx > -1 ? src.slice(0, idx).split("\n").length : 0);
    }
  });
});
const rows = [...found].sort((a, b) => a[1].kind.localeCompare(b[1].kind) || a[0].localeCompare(b[0]));
console.log(rows.length + " code-shaped tokens live only in comments (candidates - read each):");
rows.forEach(([tok, v]) => console.log("  " + v.kind.padEnd(7) + tok.padEnd(34) + " comment line(s) " + [...v.at].slice(0, 4).join(", ") + (v.at.size > 4 ? " ..." : "")));
