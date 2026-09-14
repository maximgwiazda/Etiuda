// The bridge guard: does every module name the monolith reads through `src/main.js` still
// reach the module's live binding?
//
// `src/main.js` hands the monolith its names twice over, and the two halves are not the same
// promise. `Object.assign(globalThis, ...)` COPIES each export once, at load. That is correct
// for a name nothing ever reassigns and wrong for a name its own module replaces later: the
// global keeps the load-time value for ever while the module moves on. The repair is one
// `Object.defineProperty(globalThis, "NAME", { get: () => ns.NAME })`, which reads the binding
// instead of a copy.
//
// A MISSING ACCESSOR IS SILENT, and measured twice. With both `columns` accessors deleted the
// whole suite still reported 119 of 119 while a browser read `colLastN` 0 and `colAvailW` 0
// against 3 and 1476 (lead engineer, 2026-09-13 h). With the three `shortcuts` accessors
// deleted, 119 of 119 again while `scReady` read false and both chord maps held 0 keys against
// 29 (the same seat, report i). Nothing throws, nothing logs, the build is clean, and the cost
// is a wrong answer rather than a stopped program - which is exactly why no check fails.
//
// THIS GATE HOLDS NO LIST OF NAMES. It derives the set that needs an accessor from the module
// sources, so a name that starts being reassigned tomorrow is required tomorrow, and a name that
// stops is released. The rule is one sentence:
//
//   An exported name that is written anywhere below the module's own top level needs an
//   accessor, because the copy `Object.assign` takes is taken after the top level has run and
//   before anything below it can run.
//
// Brace depth is how "below the top level" is decided, over source with comments, strings and
// regex literals masked. Depth is an over-approximation of "inside a function": a write inside
// a top-level `if` block counts too. That direction is deliberate. The gate's false positive
// costs one harmless line in `src/main.js`; its false negative costs a wrong reading on screen
// with a green suite, which is the thing this file exists to stop.
//
// It is also strict on purpose about a reassigned export the monolith does not happen to read
// today. Gating on "does the monolith mention it" would make the gate quieter the day somebody
// renames a call site, and a gate that grows quieter as the hazard arrives is worse than none.
//
//   node tools/split-guard/bridge.mjs
//   node tools/split-guard/bridge.mjs --entry src/main.js --modules src/modules
//
// Exit code is the number of failures, so zero means no bridged name can go stale. A run that
// could not read its inputs exits 78 and prints no tally, the convention this project keeps.
//
// What it does not see: a write that reaches the binding without naming it - `eval`, or a
// module reassigning its own export through a namespace import of itself. Neither exists in
// this tree and both are refused by other rules; `--scan`'s `window[...]` case is the nearest
// live one. Nor does it speak for the monolith's own names: that is the sentinel's half.
//
// One more, found 2026-09-13 and left open because the tree holds none: `export { a as b }`.
// The census takes `b`, which is the name the monolith reads, while the binding written below
// the top level is called `a`, so the write is not attributed and no accessor is required.
// Measured: 0 aliased exports over the 52 modules, by `grep -c " as "` inside the export blocks.
// Closing it wants the census to carry both names; opening an alias into this tree before that
// is done is the edit to refuse.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { declaredTopLevel } from './guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const NO_VERDICT = 78;

// ---------------------------------------------------------------------------------------
// The masker. Same rules as tests/deadcode.js and for the same measured reasons: regex
// literals are taken before strings, because a pattern holding a quote otherwise runs the
// masker to the next quote far below; and a ' or " string cannot hold a raw newline, so an
// unpartnered quote on its own line is an apostrophe in prose rather than a string opener.
// Both of those cost this harness a whole reading once.
export function mask(src) {
  let out = '', i = 0;
  const blank = s => s.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {
      const j = src.indexOf('\n', i), k = j < 0 ? src.length : j;
      out += blank(src.slice(i, k)); i = k; continue;
    }
    if (c === '/' && d === '*') {
      const j = src.indexOf('*/', i + 2), k = j < 0 ? src.length : j + 2;
      out += blank(src.slice(i, k)); i = k; continue;
    }
    if (c === '/') {
      let k = out.length - 1;
      while (k >= 0 && /\s/.test(out[k])) k--;
      const prev = k >= 0 ? out[k] : '';
      const word = out.slice(Math.max(0, k - 6), k + 1);
      const isRegex = prev === '' || '(,=:[!&|?{};+-*%~^'.indexOf(prev) > -1
        || /\b(return|typeof|case|in|of|new|delete|void)$/.test(word);
      if (isRegex) {
        let j = i + 1, cls = false;
        while (j < src.length) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') cls = true;
          else if (src[j] === ']') cls = false;
          else if (src[j] === '/' && !cls) { j++; break; }
          else if (src[j] === '\n') break;
          j++;
        }
        out += blank(src.slice(i, j)); i = j; continue;
      }
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1, closed = false;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) { j++; closed = true; break; }
        if (src[j] === '\n' && c !== '`') break;
        j++;
      }
      if (closed) { out += c + blank(src.slice(i + 1, j - 1)) + c; i = j; continue; }
    }
    out += c; i++;
  }
  return out;
}

// Brace, bracket and paren depth at every character of masked source. A closer lowers the
// depth of its own position, so the `}` that ends a function body reads as top level.
function depthMap(m) {
  const d = new Int32Array(m.length);
  let cur = 0;
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (c === '}' || c === ')' || c === ']') cur--;
    d[i] = cur;
    if (c === '{' || c === '(' || c === '[') cur++;
  }
  return d;
}

const lineAt = (src, idx) => src.slice(0, idx).split('\n').length;

// ---------------------------------------------------------------------------------------
// Every write site below the top level, by name. Three forms of write: a simple or compound
// assignment, an increment or decrement either side of the name, and a destructuring target.
const ASSIGN = /(?<![.\w$?])([A-Za-z_$][\w$]*)\s*(?:=(?![=>])|\+=|-=|\*=|\/=|%=|\*\*=|&&=|\|\|=|\?\?=|<<=|>>=|>>>=|&=|\|=|\^=)/g;
const INCPOST = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*(?:\+\+|--)/g;
const INCPRE = /(?:\+\+|--)\s*([A-Za-z_$][\w$]*)/g;
// A destructuring assignment, single line. The opener must not follow a value, or `obj[key]=1`
// reads as a pattern and demands an accessor for whatever `key` is called.
const DESTRUCT = /(?<![\w$)\]])([[{][^;\n]{0,300}?[\]}])\s*=(?![=>])/g;

// A TARGET THAT IS A MEMBER EXPRESSION IS NOT A REBINDING, and this is the whole of the repair
// for board item 302. Inside a destructuring pattern a target is either a bare identifier, which
// is rebound and needs a live binding, or a member expression, which writes a property and
// rebinds nothing: `[a[0], b.c] = xs` moves neither `a` nor `b`. In JavaScript `ident[` and
// `ident.` can only ever begin a member expression, so dropping such a head - and everything its
// subscript names - can turn a FAIL into an ok but can never turn a real write into silence.
//
// It matters because the opener's lookbehind was doing this job by accident and only for one
// spelling. `xs.forEach(k=>{ OBJ[k]=v; })` puts the write inside an arrow BODY, whose `{`
// follows `>` and is therefore allowed through, and the match `{ OBJ[k]` then read as an object
// pattern. Measured in the engine on 2026-09-14: BASE_STORE in src/modules/intent-id.js, a const
// object whose identity never changes, was reported as needing an accessor. The `function(k){}`
// spelling of the same loop was excluded, because `)` is in the lookbehind - so which of two
// identical programs the gate accepted turned on the shape of a callback.
//
// Offsets are preserved by blanking rather than deleting, because every hit is reported as a
// line number in the original source.
function blankMemberTargets(s) {
  const out = s.split('');
  const head = /(?<![.\w$])[A-Za-z_$][\w$]*/g;
  let m;
  while ((m = head.exec(s))) {
    let j = m.index + m[0].length, member = false;
    for (;;) {
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === '.') {
        j++;
        while (j < s.length && /\s/.test(s[j])) j++;
        const t = /^[A-Za-z_$][\w$]*/.exec(s.slice(j));
        if (!t) break;
        j += t[0].length; member = true; continue;
      }
      if (s[j] === '[') {
        let d = 0, k = j;
        for (; k < s.length; k++) {
          if (s[k] === '[') d++;
          else if (s[k] === ']' && --d === 0) { k++; break; }
        }
        if (d !== 0) break;                       // unclosed: leave the name alone
        j = k; member = true; continue;
      }
      break;
    }
    if (member) {
      for (let i = m.index; i < j; i++) if (out[i] !== '\n') out[i] = ' ';
      head.lastIndex = j;
    }
  }
  return out.join('');
}

export function deferredWrites(source, names) {
  const m = mask(source), d = depthMap(m);
  const hits = new Map();
  const note = (name, at) => {
    if (!names.has(name) || d[at] <= 0) return;
    if (!hits.has(name)) hits.set(name, []);
    hits.get(name).push(lineAt(source, at));
  };
  for (const re of [ASSIGN, INCPOST, INCPRE]) {
    re.lastIndex = 0;
    let x;
    while ((x = re.exec(m))) note(x[1], x.index + x[0].indexOf(x[1]));
  }
  DESTRUCT.lastIndex = 0;
  let x;
  while ((x = DESTRUCT.exec(m))) {
    const inner = blankMemberTargets(x[1]);
    const base = x.index + x[0].indexOf(x[1]);
    let y;
    const id = /(?<![.\w$])([A-Za-z_$][\w$]*)(?!\s*:)/g;
    while ((y = id.exec(inner))) note(y[1], base + y.index);
  }
  return hits;
}

// ---------------------------------------------------------------------------------------
// What the entry says. The imports, the namespaces `Object.assign` spreads, and the accessors.
export function readEntry(text) {
  const m = mask(text);
  const imports = new Map();
  for (const x of m.matchAll(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*["']([^"']*)["']/g)) {
    // The path was blanked by the masker, so take it from the unmasked text at the same offset.
    const raw = text.slice(x.index, x.index + x[0].length);
    const p = raw.match(/from\s*["']([^"']*)["']/);
    imports.set(x[1], p ? p[1] : '');
  }
  const assigned = new Set();
  const a = m.match(/Object\.assign\(\s*globalThis\s*,([^)]*)\)/);
  if (a) for (const n of a[1].split(',').map(s => s.trim()).filter(Boolean)) assigned.add(n);
  const accessors = [];
  for (const x of m.matchAll(
    /Object\.defineProperty\(\s*globalThis\s*,\s*["'][^"']*["']\s*,\s*\{\s*get\s*:\s*\(\)\s*=>\s*([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g)) {
    // The global's name is inside a string literal and therefore blanked; read it back raw.
    const raw = text.slice(x.index, x.index + x[0].length);
    const g = raw.match(/globalThis\s*,\s*["']([A-Za-z_$][\w$]*)["']/);
    accessors.push({ global: g ? g[1] : '', ns: x[1], prop: x[2], line: lineAt(text, x.index) });
  }
  return { imports, assigned, accessors };
}

// A module's exported names, and this census is the gate's whole reach: a name outside it is a
// name no rule below can require an accessor for. So it is taken three ways rather than one.
// Until 2026-09-13 it was `.match` on one shape, which read the FIRST `export { }` block and
// nothing else. Proved on a lab copy of `88e3a1e`: a name written below the top level of
// `src/modules/env.js` is a FAIL when it is listed in that module's one block and is SILENT,
// exit 0, when the same name is listed in a second block two lines later.
//
// THE TALLY DOES NOT MOVE WHILE THAT HAPPENS, and the first telling of this comment said it
// did. 415 names either way: the old census did not see a name in a second block as an export
// at all, so it was never in the total for the total to rise by. 416 belongs to the OTHER
// variant, the one that FAILS, where the name sits in the module's single block and 25 rather
// than 24 need a binding. Settled 2026-09-14 by importing `moduleExports` from the commit
// before this repair and running it on one module written both ways: three names with the
// export in a single block, two with the same name moved to a second block. A name the census
// cannot see was never in the total, so the total had nothing to rise by. The truth is worse
// than the sentence it replaces - a blind run was indistinguishable from a sound one rather
// than reading as a wider one, and there was no number at all for anybody to notice.
// Inline `export const a = 1, b = 2` is the same hole by another door: no block mentions either
// name. Neither shape is in the tree today; both are one edit away, and the gate now sees them.
export function moduleExports(text) {
  const m = mask(text);
  const names = new Set();
  for (const x of m.matchAll(/(?:^|\n)export\s*\{([^}]*)\}/g))
    for (const s of x[1].split(',').map(t => t.trim().split(/\s+as\s+/).pop()).filter(Boolean)) names.add(s);
  // The same census the sentinel defines its names from, narrowed to what is exported on the
  // spot, so the two gates cannot be looking at two different sets of names.
  for (const n of declaredTopLevel(text, { exportedOnly: true })) names.add(n);
  return names.size ? names : null;
}

// ---------------------------------------------------------------------------------------
export function bridge({ entry, modulesDir }) {
  const entryText = readFileSync(entry, 'utf8');
  const { imports, assigned, accessors } = readEntry(entryText);
  const files = readdirSync(modulesDir).filter(f => f.endsWith('.js')).sort();

  // ns name -> { file, exports }, keyed by the namespace the entry binds it to.
  const byNs = new Map();
  const byFile = new Map();
  let exportTotal = 0, missingBlock = [];
  for (const f of files) {
    const text = readFileSync(join(modulesDir, f), 'utf8');
    const ex = moduleExports(text);
    if (!ex) { missingBlock.push(f); continue; }
    exportTotal += ex.size;
    byFile.set(f, { text, exports: ex });
  }
  for (const [ns, spec] of imports) {
    const f = basename(spec);
    if (byFile.has(f)) byNs.set(ns, { file: f, ...byFile.get(f) });
  }

  const findings = [];
  // 1. Every deferred write needs an accessor.

  // The write sites first, so the two rules below can talk about the same set. `needs` is the
  // derived requirement: name -> the file and line of its first deferred write.
  const needs = new Map();
  for (const [f, { text, exports }] of byFile)
    for (const [name, lines] of deferredWrites(text, exports))
      if (!needs.has(name)) needs.set(name, { file: f, line: lines[0] });

  // 1. Every accessor must name something that exists, and one unsound accessor is one
  // failure: a broken accessor is also a missing one, and counting it twice would put two in
  // the exit code for one edit.
  const sound = new Map();
  for (const a of accessors) {
    const at = basename(entry) + ':' + a.line;
    const mod = byNs.get(a.ns);
    if (!mod)
      findings.push({ verdict: 'fail', name: a.global, why: 'the accessor at ' + at + ' reads '
        + a.ns + '.' + a.prop + ', and ' + a.ns + ' is not a module namespace this entry imports' });
    else if (!mod.exports.has(a.prop))
      findings.push({ verdict: 'fail', name: a.global, why: 'the accessor at ' + at + ' reads '
        + a.ns + '.' + a.prop + ', which ' + mod.file + ' does not export' });
    else if (a.global !== a.prop)
      findings.push({ verdict: 'fail', name: a.global, why: 'the accessor at ' + at + ' binds '
        + a.global + ' to ' + a.ns + '.' + a.prop + ', a different name' });
    else if (needs.has(a.global) && needs.get(a.global).file !== mod.file)
      findings.push({ verdict: 'fail', name: a.global, why: 'the accessor at ' + at + ' reads '
        + a.ns + '.' + a.prop + ' out of ' + mod.file + ', and the name that is written below a top level is '
        + needs.get(a.global).file + "'s" });
    else if (!needs.has(a.global))
      findings.push({ verdict: 'note', name: a.global, why: 'has an accessor and is never written '
        + "below its module's top level, so a copy would do" });
    else sound.set(a.global, a);
  }
  // 2. Every derived requirement must be met by a sound accessor. A name whose accessor was
  // just reported unsound is not reported again here.
  const claimed = new Set(accessors.map(a => a.global));
  for (const [name, where] of needs)
    if (!sound.has(name) && !claimed.has(name))
      findings.push({ verdict: 'fail', name, why: 'src/modules/' + where.file + ':' + where.line
        + ' writes it below the top level and no accessor bridges it; the monolith would read the'
        + ' load-time copy for ever' });
  // 3. A module imported and not spread is a module none of whose names reach the monolith.
  for (const ns of imports.keys()) {
    if (!assigned.has(ns)) findings.push({ verdict: 'note', name: ns,
      why: 'is imported by ' + basename(entry) + ' and not spread into globalThis, so the monolith sees none of its exports' });
  }
  for (const f of missingBlock) findings.push({ verdict: 'note', name: f,
    why: 'has no export block, so nothing in it is bridged' });

  findings.sort((p, q) => (p.verdict === q.verdict ? 0 : p.verdict === 'fail' ? -1 : 1)
    || p.name.localeCompare(q.name));
  const failures = findings.filter(f => f.verdict === 'fail').length;
  return { findings, failures, notes: findings.length - failures, modules: byFile.size,
           exports: exportTotal, needed: needs.size, accessors: accessors.length };
}

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const entry = resolve(arg('--entry', join(ROOT, 'src', 'main.js')));
  const modulesDir = resolve(arg('--modules', join(ROOT, 'src', 'modules')));
  if (!existsSync(entry)) { console.error('no entry at ' + entry); process.exit(NO_VERDICT); }
  if (!existsSync(modulesDir)) { console.error('no modules folder at ' + modulesDir); process.exit(NO_VERDICT); }
  const r = bridge({ entry, modulesDir });
  console.log('bridge-guard  ' + r.exports + ' exported names over ' + r.modules + ' modules, '
    + r.needed + ' written below a module top level, ' + r.accessors + ' accessors in the entry');
  for (const f of r.findings)
    console.log('  ' + (f.verdict === 'fail' ? 'FAIL' : 'note') + '  ' + f.name + ' ' + f.why);
  // The verdict leads the line: the same message text under a FAIL and an ok is how a count
  // gets quoted out of a failing run as though it were a passing one.
  const tail = r.needed + ' of ' + r.exports + ' names need a live binding, ' + r.notes
    + (r.notes === 1 ? ' note' : ' notes');
  console.log(r.failures
    ? '  FAIL  ' + r.failures + (r.failures === 1 ? ' name' : ' names') + ' would go stale, ' + tail
    : '  ok    every name that changes is bridged live, ' + tail);
  process.exitCode = r.failures;
}
