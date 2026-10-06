/* THE DESK'S BLUE AS DRAWN, AND THE RATIOS IT KEEPS. `node tests/kin-contrast.mjs`, no fixture, no browser.
 *
 * The sheet's four token blocks are read as written (:root, :root:not([data-theme=light]),
 * :root[data-theme=dark], :root[data-theme=light]) and the blue's tokens are held to the values the
 * product designer drew for the middle option, "M Kin", and to what that blue must still do on its
 * grounds. A ratio is WCAG's, from relative luminance, read to one decimal as the claims are written.
 *
 *   kc1  every block holds its blue's tokens exactly: the mark, the fill, the soft ground, the
 *        editor's mark and tint, and in light the ink of a mark and the band
 *   kc2  the ratios: a dark mark on a dark card 6.1:1 at least, white on a dark fill 5.1:1, light's
 *        blue on its card and white on it 5.1:1, white on light's band 8.3:1
 *   kc3  the bubbles' fill: the three theme blocks that dress a bubble say --bub, and it is the
 *        block's own --accent-fill, so a bubble is never a different blue from a button
 *   kc4  no blue M Kin retired, as hex or as an rgb triple, is written in shell/*.js, whose own pages
 *        (the recovery window, the picker's first frame) carry colours the sheet does not reach
 *
 * Every leg is run on a planted fault first and must find it; a leg that finds nothing there has no
 * say about the sheet. Exit 0 clean, 1 a finding, 3 the sources could not be read or a control did
 * not fire.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const L = require("./css-layers.js");

const TEMPLATE = "src/template.html";
const BLOCKS = {
  light: ":root[data-theme=light]",
  lightBase: ":root",
  dark: ":root[data-theme=dark]",
  darkUnset: ":root:not([data-theme=light])"
};
const DARK = ["dark", "darkUnset"], LIGHT = ["light", "lightBase"];

/* M Kin, as drawn: the tokens only. */
const KIN_DARK = { "--accent": "#409afc", "--accent-fill": "#136adc", "--accent-soft": "#16233a",
  "--ed": "#409afc", "--ed-soft": "rgba(64,154,252,.16)" };
const KIN_LIGHT = { "--accent": "#0e67d8", "--accent-fill": "#0e67d8", "--accent-soft": "#dde9fc", "--mark-ink": "#0e67d8",
  "--band": "#0f4c9d", "--ed": "#0e67d8", "--ed-soft": "rgba(14,103,216,.13)" };

const rgb = h => { const m = /^#([0-9a-f]{6})$/i.exec(String(h).trim()); return m ? [1, 3, 5].map(i => parseInt(m[1].slice(i - 1, i + 1), 16)) : null; };
const lum = c => c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); })
  .reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
function ratio(a, b) {
  const x = rgb(a), y = rgb(b);
  if (!x || !y) return null;
  const p = lum(x), q = lum(y);
  return Math.round((Math.max(p, q) + .05) / (Math.min(p, q) + .05) * 10) / 10;
}

/* The declarations of each block as {token: value}, the last one written winning. */
function readBlocks(css) {
  const parsed = L.parseSheet(css, () => 1);
  const out = {};
  for (const [k, sel] of Object.entries(BLOCKS)) {
    out[k] = {};
    for (const d of parsed.decls) if (d.sel === sel && /^--/.test(d.prop)) out[k][d.prop] = d.val;
  }
  return out;
}

function tokenFindings(b) {
  const bad = [];
  for (const [k, want] of [...DARK.map(k => [k, KIN_DARK]), ...LIGHT.map(k => [k, KIN_LIGHT])])
    for (const [t, v] of Object.entries(want))
      if (String(b[k][t] || "").toLowerCase() !== v) bad.push(BLOCKS[k] + " " + t + " is " + JSON.stringify(b[k][t] || null) + ", drawn " + v);
  return bad;
}

function ratioFindings(b) {
  const bad = [];
  const need = (what, got, floor) => { if (got === null || got < floor) bad.push(what + " reads " + got + ":1, wanted " + floor + ":1 or more"); };
  for (const k of DARK) {
    const x = b[k], tag = BLOCKS[k] + " ";
    need(tag + "a mark on a card", ratio(x["--accent"], x["--card-bg"]), 6.1);
    need(tag + "the editor's mark on a card", ratio(x["--ed"], x["--card-bg"]), 6.1);
    need(tag + "white on the fill", ratio("#ffffff", x["--accent-fill"]), 5.1);
  }
  for (const k of LIGHT) {
    const x = b[k], tag = BLOCKS[k] + " ";
    const card = /^#/.test(x["--card-bg"] || "") ? x["--card-bg"] : x["--panel"];
    need(tag + "a mark on a card", ratio(x["--accent"], card), 5.1);
    need(tag + "white on the fill", ratio("#ffffff", x["--accent-fill"]), 5.1);
    need(tag + "white on the band", ratio("#ffffff", x["--band"]), 8.3);
  }
  return bad;
}

function bubbleFindings(b) {
  const bad = [];
  for (const k of ["light", "dark", "darkUnset"])
    if (!b[k]["--bub"] || b[k]["--bub"].toLowerCase() !== String(b[k]["--accent-fill"]).toLowerCase())
      bad.push(BLOCKS[k] + " --bub is " + JSON.stringify(b[k]["--bub"] || null) + ", the fill is " + b[k]["--accent-fill"]);
  return bad;
}

/* The blues the M Kin change took out of the four blocks, with the mark's former app ink. A hex is matched by its
   first six digits, so an eight-digit one with alpha is the same blue. */
const RETIRED = ["#2563eb", "#7aa2f7", "#3b82f6", "#1d4ed8", "#60a5fa", "#1a4fa0", "#1b2231", "#dceafe"];
const retiredAt = h => new RegExp(h + "|[(][ ]*" + rgb(h).join("[ ,]+") + "[ ,)/]", "i");
function retiredFindings(files) {
  const bad = [];
  for (const [name, text] of files) text.split("\n").forEach((line, i) => {
    for (const h of RETIRED) if (retiredAt(h).test(line)) bad.push(name + ":" + (i + 1) + " writes " + h);
  });
  return bad;
}

const OK = [], BAD = [];
const control = (name, got, want) => (got === want ? OK : BAD).push(name + ": " + (got === want ? got : "read " + JSON.stringify(got) + ", wanted " + JSON.stringify(want)));
const clone = b => JSON.parse(JSON.stringify(b));
/* The controls run on the sheet's own grounds with the blue set as drawn, so a sheet that is red says so
   in the legs and never in the controls. */
function controls(read) {
  const b = clone(read);
  for (const k of DARK) Object.assign(b[k], KIN_DARK);
  for (const k of LIGHT) Object.assign(b[k], KIN_LIGHT);
  for (const k of ["light", "dark", "darkUnset"]) b[k]["--bub"] = b[k]["--accent-fill"];
  control("control A, the blue as drawn, kc1 findings", tokenFindings(b).length, 0);
  control("control A2, the blue as drawn, kc2 findings", ratioFindings(b).length, 0);
  control("control A3, the blue as drawn, kc3 findings", bubbleFindings(b).length, 0);
  const old = clone(b); old.darkUnset["--accent"] = "#7aa2f7"; old.light["--accent-fill"] = "#2563eb";
  control("control B, the former blues planted back (two tokens), kc1 findings", tokenFindings(old).length, 2);
  const dim = clone(b); dim.dark["--accent"] = "#2a5fb0";
  control("control C, a dark mark too deep for its card, kc2 findings", ratioFindings(dim).length > 0, true);
  const pale = clone(b); pale.darkUnset["--accent-fill"] = "#409afc";
  control("control D, the pale blue under white words, kc2 findings", ratioFindings(pale).length > 0, true);
  const band = clone(b); band.light["--band"] = "#3b7be0";
  control("control E, a light band too pale for white words, kc2 findings", ratioFindings(band).length > 0, true);
  const lost = clone(b); delete lost.dark["--bub"];
  control("control F, a block that stopped saying --bub, kc3 findings", bubbleFindings(lost).length, 1);
  const split = clone(b); split.light["--bub"] = "#2563eb";
  control("control G, a bubble in another blue than the fill, kc3 findings", bubbleFindings(split).length, 1);
  control("control H, a retired blue planted as hex and as an rgb triple, kc4 findings",
    retiredFindings([["a", "--fill:#2563EB;"], ["b", "--over:rgba(37, 99, 235,.3);"], ["c", "--x:rgb(220 234 254 / .5)"]]).length, 3);
  control("control I, M Kin's own blues and a near triple, kc4 findings",
    retiredFindings([["d", "--fill:#0e67d8;--over:rgba(14,103,216,.13);--edge:rgb(137,99,235)"]]).length, 0);
}

function run() {
  const file = path.join(E.ROOT, TEMPLATE);
  if (!fs.existsSync(file)) { console.log("REFUSED: the sheet is not at " + TEMPLATE); process.exit(3); }
  const raw = fs.readFileSync(file, "utf8");
  const sheet = L.sheetOf(raw);
  if (!sheet) { console.log("REFUSED: no <style> block in " + TEMPLATE); process.exit(3); }
  let b;
  try { b = readBlocks(sheet.css); } catch (x) { console.log("REFUSED: " + x); process.exit(3); }
  const empty = Object.entries(b).filter(([, v]) => !v["--accent"]).map(([k]) => BLOCKS[k]);
  if (empty.length) { console.log("REFUSED: no --accent read in " + empty.join(", ") + ", so nothing here was judged"); process.exit(3); }
  controls(b);
  for (const l of OK) console.log("  ok   " + l);
  for (const l of BAD) console.log("  FAIL " + l);
  if (BAD.length) { console.log("RESULT: a control did not fire, so the gate's silence means nothing."); process.exit(3); }
  const shellDir = path.join(E.ROOT, "shell");
  const shellFiles = (fs.existsSync(shellDir) ? fs.readdirSync(shellDir) : []).filter(f => /[.]js$/.test(f)).sort()
    .map(f => ["shell/" + f, fs.readFileSync(path.join(shellDir, f), "utf8")]);
  if (!shellFiles.length) { console.log("REFUSED: no shell/*.js read, so kc4 judged nothing"); process.exit(3); }
  const kc1 = tokenFindings(b), kc2 = ratioFindings(b), kc3 = bubbleFindings(b), kc4 = retiredFindings(shellFiles);
  console.log("read: " + Object.entries(b).map(([k, v]) => BLOCKS[k] + " " + Object.keys(v).length + " token(s)").join("; ")
    + "; " + shellFiles.map(([f]) => f).join(", "));
  console.log("#counts kc1=" + kc1.length + " kc2=" + kc2.length + " kc3=" + kc3.length + " kc4=" + kc4.length);
  for (const [id, f] of [["kc1", kc1], ["kc2", kc2], ["kc3", kc3], ["kc4", kc4]]) for (const m of f) console.log("  FAIL " + id + " " + m);
  const n = kc1.length + kc2.length + kc3.length + kc4.length;
  if (n) { console.log("RESULT: FAIL, " + n + " finding(s) against the desk's blue."); process.exit(1); }
  console.log("RESULT: OK, the blue is as drawn in all four blocks and keeps its ratios, and the shell writes none it retired.");
}

run();
