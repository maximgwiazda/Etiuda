/* Storage map, beside test.js. Every key the engine reads, writes or deletes
 * in localStorage, through its own helpers or directly, with where and how often; then the keys
 * that are read but never written (migrations from older versions, or stale readers), written but
 * never read (dead writes), and the keys the settings reset does not cover. Also every call whose
 * key is not a literal, since those cannot be mapped by text.
 *
 *   node storage-keys.js */
"use strict";
const src = require("./engine.js").engineSource();
const code = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")).replace(/(^|[^:\\"'])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
const lineOf = i => code.slice(0, i).split("\n").length;
const keys = new Map();
const dyn = [];
const note = (key, op, line) => { if (!keys.has(key)) keys.set(key, { get: [], set: [], del: [] }); keys.get(key)[op].push(line); };
const calls = /\b(lsGet|lsSet|lsDel|nsGet|nsSet|nsDel|localStorage\.getItem|localStorage\.setItem|localStorage\.removeItem)\(\s*([^,)]+)/g;
let m;
while ((m = calls.exec(code))) {
  const fn = m[1], raw = m[2].trim(), line = lineOf(m.index);
  const op = /Get|getItem/.test(fn) ? "get" : /Del|removeItem/.test(fn) ? "del" : "set";
  const lit = raw.match(/^["']([^"']+)["']$/);
  if (lit) note((fn.startsWith("ns") ? "ns:" : "") + lit[1], op, line);
  else dyn.push({ fn, raw: raw.slice(0, 60), line });
}
/* the reset list, if the engine keeps one as a literal array of key strings */
const resetSite = code.match(/\[\s*"pb[A-Za-z]+"(?:\s*,\s*"pb[A-Za-z]+")+\s*\]/);
const resetKeys = new Set(resetSite ? resetSite[0].match(/"pb[A-Za-z]+"/g).map(s => s.slice(1, -1)) : []);

const rows = [...keys].sort((a, b) => a[0].localeCompare(b[0]));
console.log(rows.length + " literal keys (ns: = namespaced per catalog)");
console.log("key".padEnd(30) + "reads  writes  deletes  lines");
rows.forEach(([k, v]) => console.log(k.padEnd(30) + String(v.get.length).padStart(5) + String(v.set.length).padStart(8) + String(v.del.length).padStart(9)
  + "  " + [...new Set([...v.get, ...v.set, ...v.del])].sort((a, b) => a - b).slice(0, 8).join(",")));
const readOnly = rows.filter(([, v]) => v.get.length && !v.set.length).map(([k]) => k);
const writeOnly = rows.filter(([, v]) => v.set.length && !v.get.length).map(([k]) => k);
console.log("\nread but never written (migrations or stale readers): " + (readOnly.join(", ") || "none"));
console.log("written but never read (dead writes): " + (writeOnly.join(", ") || "none"));
if (resetKeys.size) {
  const notReset = rows.map(([k]) => k).filter(k => !k.startsWith("ns:") && !resetKeys.has(k));
  console.log("\nsettings reset covers " + resetKeys.size + " keys; plain keys it does not touch: " + (notReset.join(", ") || "none"));
}
console.log("\n" + dyn.length + " calls with a non-literal key (map by hand):");
dyn.forEach(d => console.log("  line " + d.line + "  " + d.fn + "(" + d.raw + ")"));
