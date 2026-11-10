/* THE DESK'S FOUR DRAWN VALUES, read from the sheet and from the built page.
 *
 *   node tests/desk-refined.mjs
 *
 * Proposal A's desk, and nothing of the Lanes or of Studio: the dot field, an empty fill as a
 * chip, and a light card's hairline and lift. The category pills stay fully round (Max, 2026-11-10 18:07). Dark cards, the ink
 * of the field, the intent panel's lift and the add pill's disc are held where they were.
 *
 * THE CONTROLS run on a synthetic sheet before the real one is read. Each plants one previous
 * value back and must be found; a control that finds nothing has no say about the sheet.
 *
 * Exit 0 clean, 1 a finding, 3 the sources could not be read or a control did not fire.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const E = require("./engine.js");
const L = require("./css-layers.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, "..", "src", "template.html");
const BUILT = path.join(HERE, "..", "engine", "etiuda.html");

const squash = s => String(s || "").replace(/\s+/g, "").toLowerCase();
const selOf = s => String(s || "").replace(/\s+/g, " ").trim();

const DOT = squash("radial-gradient(circle at center,var(--dots-ink) 0 .7px,color-mix(in srgb,var(--dots-ink) 0%,transparent) 1.2px)");
const LIFT = squash("0 1px 2px rgba(15,23,42,.05),0 4px 16px rgba(15,23,42,.06)");
const NEAR = squash("0 1px 2px rgba(15,23,42,.05)");
const INK_LIGHT = squash("color-mix(in srgb,var(--dim) 60%,transparent)");
const INK_DARK = squash("color-mix(in srgb,var(--dim) 30%,transparent)");
const SEAM = squash("rgba(255,255,255,.075)");

/* One declaration, the last of that selector and property. */
function last(decls, sel, prop) {
  const want = selOf(sel);
  let hit = null;
  for (const d of decls) if (selOf(d.sel) === want && d.prop === prop) hit = d;
  return hit;
}

function say(decls, sel, prop, want, what) {
  const d = last(decls, sel, prop);
  if (!d) return what + ": no " + prop + " on " + sel;
  if (squash(d.val) !== squash(want)) return what + ": " + sel + " " + prop + " is " + d.val.replace(/\s+/g, " ") + ", drawn " + want;
  return "";
}

/* What the drawing changes, and what it leaves. A string is a miss. */
function findings(css) {
  let parsed;
  try { parsed = L.parseSheet(css, () => 1); }
  catch (e) { return ["the sheet could not be parsed: " + e]; }
  const d = parsed.decls;
  const bad = [];
  const need = (sel, prop, want, what) => { const m = say(d, sel, prop, want, what); if (m) bad.push(m); };
  need(".dotfield>div", "background-size", "16px 16px", "dot field pitch");
  need(".dotfield>div", "background-image", DOT, "dot field");
  need(".txt .fillmiss", "background", "var(--accent-soft)", "empty fill");
  need(".txt .fillmiss", "color", "var(--accent)", "empty fill");
  need(".txt .fillmiss", "border", "0", "empty fill");
  need(".txt .fillmiss", "border-radius", "6px", "empty fill");
  need(".txt .fillmiss", "padding", "1px 5px", "empty fill");
  need(".txt .fillmiss", "font", "600 11px var(--sans)", "empty fill");
  need(".txt .fillmiss", "letter-spacing", ".2px", "empty fill");
  need(".pill", "border-radius", "999px", "category pill, fully round");
  need(".pill-add", "border-radius", "999px", "add pill");
  for (const sel of [":root", ":root[data-theme=light]"]) {
    need(sel, "--card-border", "var(--line)", "light card edge");
    need(sel, "--card-shadow", NEAR, "light card lift");
    need(sel, "--card-lift", LIFT, "intent panel lift");
    need(sel, "--dots-ink", INK_LIGHT, "dot field ink");
  }
  for (const sel of [":root:not([data-theme=light])", ":root[data-theme=dark]"]) {
    need(sel, "--card-border", SEAM, "dark card edge");
    need(sel, "--card-shadow", "var(--bevel)", "dark card shadow");
    need(sel, "--card-lift", "0 0 #0000", "dark card lift");
    need(sel, "--dots-ink", INK_DARK, "dot field ink");
  }
  need(".txt", "border", "1px solid var(--card-border,var(--line))", "card edge");
  need(".txt", "box-shadow", "var(--card-shadow,none)", "card lift");
  need(".txt::before", "width", "3px", "category spine");
  need("#intentRail", "box-shadow", "var(--bevel),var(--card-lift)", "intent panel");
  need(":root:not([data-theme=light]) .txt", "--card-shadow", "0 0 #0000", "dark card");
  return bad;
}

const GOOD = [
  ":root{--dots-ink:color-mix(in srgb,var(--dim) 60%,transparent);--card-border:var(--line);",
  "--card-shadow:0 1px 2px rgba(15,23,42,.05);--card-lift:0 1px 2px rgba(15,23,42,.05),0 4px 16px rgba(15,23,42,.06)}",
  ":root[data-theme=light]{--dots-ink:color-mix(in srgb,var(--dim) 60%,transparent);--card-border:var(--line);",
  "--card-shadow:0 1px 2px rgba(15,23,42,.05);--card-lift:0 1px 2px rgba(15,23,42,.05),0 4px 16px rgba(15,23,42,.06)}",
  ":root:not([data-theme=light]){--dots-ink:color-mix(in srgb,var(--dim) 30%,transparent);--card-border:rgba(255,255,255,.075);",
  "--card-shadow:var(--bevel);--card-lift:0 0 #0000}",
  ":root[data-theme=dark]{--dots-ink:color-mix(in srgb,var(--dim) 30%,transparent);--card-border:rgba(255,255,255,.075);",
  "--card-shadow:var(--bevel);--card-lift:0 0 #0000}",
  ".dotfield>div{background-image:radial-gradient(circle at center,var(--dots-ink) 0 .7px,color-mix(in srgb,var(--dots-ink) 0%,transparent) 1.2px);background-size:16px 16px}",
  ".txt .fillmiss{background:var(--accent-soft);color:var(--accent);border:0;border-radius:6px;padding:1px 5px;font:600 11px var(--sans);letter-spacing:.2px}",
  ".pill{border-radius:999px}",
  ".pill-add{border-radius:999px}",
  ".txt{border:1px solid var(--card-border,var(--line));box-shadow:var(--card-shadow,none)}",
  ".txt::before{width:3px}",
  "#intentRail{box-shadow:var(--bevel),var(--card-lift)}",
  ":root:not([data-theme=light]) .txt{--card-shadow:0 0 #0000}",
].join("");

const plants = [
  ["pitch 12px", GOOD.replace("background-size:16px 16px", "background-size:12px 12px")],
  ["pill not round", GOOD.replace(".pill{border-radius:999px}", ".pill{border-radius:9px}")],
  ["two-layer card shadow", GOOD.replaceAll("--card-shadow:0 1px 2px rgba(15,23,42,.05);", "--card-shadow:0 1px 2px rgba(15,23,42,.05),0 4px 16px rgba(15,23,42,.06);")],
  ["monospace fill", GOOD.replace("font:600 11px var(--sans)", "font:600 11px var(--mono)")],
  ["dark lift moved", GOOD.replaceAll("--card-lift:0 0 #0000", "--card-lift:0 1px 2px rgba(15,23,42,.05)")],
];

const controls = [];
const clean = findings(GOOD);
controls.push(["the drawn sheet", clean.length === 0, clean.join("; ")]);
for (const [name, css] of plants) {
  const got = findings(css);
  controls.push([name + " is refused", got.length > 0, got.length ? got[0] : "no finding"]);
}

let failed = 0;
for (const [name, ok, detail] of controls) {
  console.log((ok ? "  ok   " : "  FAIL ") + "control, " + name + (ok ? "" : ": " + detail));
  if (!ok) failed++;
}
if (failed) {
  console.log("RESULT: a control did not fire, so the gate's silence means nothing.");
  process.exit(3);
}

function readSheet(file, label) {
  if (!fs.existsSync(file)) return { bad: [label + " is not there"] };
  const raw = fs.readFileSync(file, "utf8");
  const sheet = L.sheetOf(raw);
  if (!sheet) return { bad: [label + " has no style block"] };
  return { bad: findings(sheet.css).map(m => label + ": " + m), rules: sheet.css.length };
}

const src = readSheet(TEMPLATE, "src/template.html");
const built = readSheet(BUILT, "engine/etiuda.html");
const misses = src.bad.concat(built.bad);
console.log("read: src/template.html " + (src.rules || 0) + " style chars, engine/etiuda.html " + (built.rules || 0) + " style chars");
console.log("findings: " + misses.length + ", counted as each drawn value that differs, in the source and in the built page");
for (const m of misses) console.log("  FAIL " + m);
if (misses.length) {
  console.log("RESULT: FAIL, " + misses.length + " drawn value(s) differ.");
  process.exit(1);
}
console.log("RESULT: OK, the four desk values are as drawn in the source and in the built page, and what the drawing leaves is unchanged.");
