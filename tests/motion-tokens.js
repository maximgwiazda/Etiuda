/* THE MOTION VOCABULARY, HELD. `node tests/motion-tokens.js`, no fixture, no browser. It fails on
 * a rule keyed on prefers-reduced-motion alone, on a duration written as a number where a --m-*
 * tier belongs (the sheet, and the scripts' inline transitions and animate() calls), on a smooth
 * scroll or a tier the e-still switch does not reach, and on the sheet's tiers and M_MS disagreeing.
 * Exit 0 clean, 1 a finding, 3 the sources could not be read or a control did not fire. */
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const L = require("./css-layers.js");

const TEMPLATE = "src/template.html";
const MODULES = "src/modules";
const MOTION = "src/modules/motion.js";
/* Timed by a script and drawn on a canvas, so no rule in the sheet can run them. */
const SCRIPT_ONLY = new Set(["gather", "twinkle"]);
const TIMED = new Set(["transition", "transition-duration", "transition-delay",
                       "animation", "animation-duration", "animation-delay"]);

/* A time literal that is not zero: `.18s`, `260ms`, `2s`. A var() is taken out first, so a
   fallback inside one is not read as a literal of the rule's own. */
const TIME_RE = /(^|[\s,(:"'])(\d*\.\d+|\d+)(ms|s)(?![\w-])/g;
function times(text) {
  const out = [];
  let m;
  TIME_RE.lastIndex = 0;
  while ((m = TIME_RE.exec(text)) !== null) if (parseFloat(m[2]) !== 0) out.push(m[2] + m[3]);
  return out;
}
const unVar = v => v.replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, "");
const toMs = v => { const m = /^(\d*\.?\d+)(ms|s)$/.exec(String(v).trim()); return m ? parseFloat(m[1]) * (m[2] === "s" ? 1000 : 1) : null; };

/* ------------------------------------------------------------------ the sheet */
function sheetFindings(css, lineAt) {
  const bad = [];
  const blanked = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
  for (const m of blanked.matchAll(/@media[^{]*prefers-reduced-motion[^{]*\{/g))
    bad.push("line " + lineAt(m.index) + ": a rule keyed on prefers-reduced-motion alone; key it on :root.e-still");
  const parsed = L.parseSheet(css, lineAt);
  for (const d of parsed.decls) {
    if (TIMED.has(d.prop) && times(unVar(d.val)).length)
      bad.push("line " + d.line + ": {" + d.sel + "} " + d.prop + " writes " + times(unVar(d.val)).join(", ") + " where a --m-* tier belongs");
    if (/^--/.test(d.prop) && !/^--m-/.test(d.prop) && times(unVar(d.val)).length)
      bad.push("line " + d.line + ": " + d.prop + " holds a duration outside the --m-* tiers");
  }
  const tiers = new Map();
  for (const d of parsed.decls)
    if (d.sel === ":root" && /^--m-/.test(d.prop)) tiers.set(d.prop.slice(4), d.val);
  const still = new Map();
  for (const d of parsed.decls)
    if (d.sel === ":root.e-still" && /^--m-/.test(d.prop)) still.set(d.prop.slice(4), d.val);
  for (const [k, v] of tiers)
    if (toMs(v) !== null && toMs(still.get(k)) !== 0)
      bad.push("--m-" + k + " is not zeroed under :root.e-still, so the switch leaves it running");
  const halts = parsed.decls.some(d => /^:root\.e-still \*$/.test(d.sel) && d.prop === "animation" && d.val === "none" && d.imp);
  if (!halts) bad.push("no `:root.e-still *{animation:none!important}`, so a keyframe outlives the switch");
  return { bad, tiers, decls: parsed.decls.length };
}

/* ---------------------------------------------------------------- the scripts */
/* Strings and code, comments dropped, each string with its line. A slash is a regex where an
   operand cannot stand, which is enough for this tree's sources. */
function lexJs(src) {
  const strings = [], code = [];
  let i = 0, line = 1, prev = "";
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; code.push(c); i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); const body = src.slice(i, e < 0 ? n : e + 2); line += body.split("\n").length - 1; code.push(body.replace(/[^\n]/g, " ")); i += body.length; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1, s = "";
      while (j < n && src[j] !== c) { if (src[j] === "\\") { s += src[j] + src[j + 1]; j += 2; continue; } s += src[j]; j++; }
      strings.push({ text: s, line });
      line += s.split("\n").length - 1;
      code.push(c + s.replace(/[^\n]/g, " ") + c); i = j + 1; prev = "x"; continue;
    }
    if (c === "/" && /^$|[(,=:[!&|?{};+\-*%<>~^]$/.test(prev)) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== "\n") { if (src[j] === "\\") { j += 2; continue; } if (src[j] === "[") cls = true; else if (src[j] === "]") cls = false; else if (src[j] === "/" && !cls) break; j++; }
      code.push(src.slice(i, j + 1).replace(/[^\n]/g, " ")); i = j + 1; prev = "x"; continue;
    }
    if (!/\s/.test(c)) prev = c;
    code.push(c); i++;
  }
  return { strings, lines: code.join("").split("\n") };
}
const MOTION_LINE = /transition|animation|\bE_EASE\b|\bE_SPRING\b|\bease\b|cubic-bezier|linear\(/;
function scriptFindings(file, src) {
  const bad = [];
  const { strings, lines } = lexJs(src);
  for (const s of strings) {
    const ts = times(unVar(s.text));
    if (ts.length && (MOTION_LINE.test(lines[s.line - 1] || "") || MOTION_LINE.test(s.text)))
      bad.push(file + ":" + s.line + ": an inline motion writes " + ts.join(", ") + " where a --m-* tier belongs");
  }
  lines.forEach((l, k) => {
    if (/\bduration\s*:\s*\.?\d/.test(l)) bad.push(file + ":" + (k + 1) + ": animate() takes a number where M_MS belongs");
  });
  for (const s of strings)
    if (s.text === "smooth" && !/\bmgReduceMotion\(\)/.test(lines[s.line - 1] || ""))
      bad.push(file + ":" + s.line + ": a smooth scroll that does not ask mgReduceMotion()");
  if (file !== MOTION && strings.some(s => /prefers-reduced-motion/.test(s.text)))
    bad.push(file + ": reads prefers-reduced-motion itself; ask mgReduceMotion(), which also hears the Animations switch");
  return bad;
}

/* motion.js's M_MS and its two curves, read as text so the gate needs no module loader. */
function motionTiers(src) {
  const m = /const M_MS\s*=\s*\{([^}]*)\}/.exec(src);
  if (!m) return null;
  const ms = {};
  for (const p of m[1].matchAll(/(\w+)\s*:\s*(\d+)/g)) ms[p[1]] = +p[2];
  const str = name => { const r = new RegExp("const " + name + "\\s*=\\s*((?:\"[^\"]*\"\\s*\\+?\\s*)+);").exec(src);
    return r ? [...r[1].matchAll(/"([^"]*)"/g)].map(x => x[1]).join("") : null; };
  return { ms, ease: str("E_EASE"), spring: str("E_SPRING") };
}
function parityFindings(tiers, mt) {
  const bad = [];
  for (const [k, v] of tiers) {
    if (k === "ease") { if (v !== mt.ease) bad.push("--m-ease is " + v + ", E_EASE is " + mt.ease); continue; }
    if (k === "spring") { if (v.replace(/\s+/g, "") !== String(mt.spring).replace(/\s+/g, "")) bad.push("--m-spring and E_SPRING differ"); continue; }
    if (toMs(v) === null) continue;
    if (mt.ms[k] !== toMs(v)) bad.push("--m-" + k + " is " + v + ", M_MS." + k + " is " + mt.ms[k]);
  }
  for (const k of Object.keys(mt.ms))
    if (!SCRIPT_ONLY.has(k) && !tiers.has(k)) bad.push("M_MS." + k + " has no --m-" + k + " in the sheet");
  if (!tiers.has("ease") || !tiers.has("spring")) bad.push("the sheet does not publish --m-ease and --m-spring");
  return bad;
}

/* --------------------------------------------------------------- the controls */
const OK = [], BAD = [];
const control = (name, got, want) => (got === want ? OK : BAD).push(name + ": " + (got === want ? got : "read " + JSON.stringify(got) + ", wanted " + JSON.stringify(want)));
function controls() {
  const clean = ":root{--m-move:180ms;--m-ease:x}:root.e-still{--m-move:0s}:root.e-still *{animation:none!important}";
  const sf = css => sheetFindings(clean + css, () => 1).bad.length;
  control("control A, a clean sheet", sf(".a{transition:transform var(--m-move) var(--m-ease),visibility 0s var(--m-move)}"), 0);
  control("control B, a rule keyed on the system query alone", sf("@media (prefers-reduced-motion:reduce){.a{animation:none}}"), 1);
  control("control C, a literal in a transition", sf(".a{transition:opacity .2s ease}"), 1);
  control("control D, a literal in an animation, in ms", sf(".a{animation:k 260ms ease both}"), 1);
  control("control E, a duration in a custom property outside --m-*", sf(":root{--tour-spring:.629s linear(0,1)}"), 1);
  control("control F, a tier the switch leaves running", sheetFindings(":root{--m-move:180ms;--m-tone:100ms}:root.e-still{--m-move:0s}:root.e-still *{animation:none!important}", () => 1).bad.length, 1);
  control("control G, a comment mentioning a duration", sf("/* .18s transition */.a{color:red}"), 0);
  const js = src => scriptFindings("src/modules/x.js", src).length;
  control("control H, an inline transition with a literal", js('el.style.transition="transform .18s "+E_EASE;'), 1);
  control("control I, a literal built into a string beside the curve", js('const T=".18s "+E_EASE;'), 1);
  control("control J, animate() with a number", js("el.animate(k,{duration:160,easing:E_EASE});"), 1);
  control("control K, the system query read outside motion.js", js('matchMedia("(prefers-reduced-motion: reduce)")'), 1);
  control("control L, the tiers by name", js('el.style.transition="transform var(--m-move) var(--m-ease)"; el.animate(k,{duration:M_MS.move});'), 0);
  control("control P, a smooth scroll deaf to the switch", js('el.scrollTo({top:0,behavior:"smooth"});'), 1);
  control("control Q, a smooth scroll that asks", js('el.scrollTo({top:0,behavior:mgReduceMotion()?"auto":"smooth"});'), 0);
  control("control M, a comment and a regex", js('// transition .18s ease\nconst r=/"\\.5s"/; /* animation 2s */'), 0);
  const mt = { ms: { move: 180, gather: 1100 }, ease: "e", spring: "s" };
  control("control N, parity holds", parityFindings(new Map([["move", "180ms"], ["ease", "e"], ["spring", "s"]]), mt).length, 0);
  control("control O, parity broken", parityFindings(new Map([["move", ".19s"], ["ease", "e"], ["spring", "s"]]), mt).length, 1);
}

function run() {
  controls();
  const root = E.ROOT;
  const raw = fs.readFileSync(path.join(root, TEMPLATE), "utf8");
  const sheet = L.sheetOf(raw);
  if (!sheet) { console.log("REFUSED: no <style> block in " + TEMPLATE); process.exit(3); }
  const head = raw.slice(0, sheet.from).split("\n").length - 1;
  const lineAt = i => head + sheet.css.slice(0, i).split("\n").length;
  let s;
  try { s = sheetFindings(sheet.css, lineAt); } catch (x) { console.log("REFUSED: " + x); process.exit(3); }
  const files = fs.readdirSync(path.join(root, MODULES)).filter(f => f.endsWith(".js")).map(f => MODULES + "/" + f).concat(["src/main.js"]);
  const js = [];
  for (const f of files) js.push(...scriptFindings(f, fs.readFileSync(path.join(root, f), "utf8")));
  const mt = motionTiers(fs.readFileSync(path.join(root, MOTION), "utf8"));
  const parity = mt ? parityFindings(s.tiers, mt) : ["no `const M_MS={...}` in " + MOTION];
  console.log("read: " + s.decls + " declaration(s) in the sheet, " + s.tiers.size + " --m-* tier(s) on :root, " + files.length + " script(s)");
  for (const l of OK) console.log("  ok   " + l);
  for (const l of BAD) console.log("  FAIL " + l);
  const found = s.bad.concat(js, parity);
  console.log("#counts sheetFindings=" + s.bad.length + " scriptFindings=" + js.length + " parityFindings=" + parity.length);
  if (BAD.length) { console.log("RESULT: a control did not fire, so the gate's silence means nothing."); process.exit(3); }
  if (s.tiers.size === 0 && !found.length) { console.log("RESULT: no tier found on :root, which is not a pass."); process.exit(3); }
  for (const f of found) console.log("  FAIL " + f);
  if (found.length) { console.log("RESULT: FAIL, " + found.length + " finding(s) against the motion vocabulary."); process.exit(1); }
  console.log("RESULT: OK, every duration is a tier and the switch reaches all of them.");
}

module.exports = { times, lexJs, sheetFindings, scriptFindings, motionTiers, parityFindings };
if (require.main === module) run();
