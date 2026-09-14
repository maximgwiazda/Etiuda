// The hooks guard. Board 341.
//
// `src/modules/hooks.js` is the one-way valve the ring was cut with: a low module that wants an
// app-level action no longer imports its home, it calls `hooks.name()`, and `wireHooks` fills
// every slot as the first line of boot(). That moved eight import edges OUT of the graph the
// cycle gate reads, and the cycle gate is a graph of import statements. So the edges are real,
// the coupling is real, and after 2026-09-14 no gate in this repository could see any of it.
//
// This leg sees it. Five bounds, each of which has been made to fail:
//
//   1. SLOTS and the wireHooks literal agree, diffed BOTH WAYS. A slot declared and not filled
//      is a TypeError at the first call; a key filled and not declared is refused at boot. Both
//      are runtime facts today, and a runtime fact only bites on the path that reaches it.
//   2. Every value in the literal resolves: `ns.member` where `ns` is a namespace import of
//      main.js and `member` is a name that module actually exports. `shed.shedSnapp` is
//      `undefined`, and `undefined` fails wireHooks' type check only if boot is reached.
//   3. Every `hooks.X` lookup anywhere in src/ names a declared slot. This is the one the
//      runtime cannot give you early: the object is frozen with a null prototype, so
//      `hooks.typo` is `undefined` and stays silent until the day that line runs.
//   4. Every declared slot is looked up somewhere in src/. A slot nothing calls is dead weight
//      that still has to be wired, and the list is the contract's whole value.
//   5. hooks.js imports nothing. The claim that it can never join a ring rests on that and on
//      nothing else.
//
// It also refuses to pass when it cannot see: a module that aliases the import, a computed
// `hooks[expr]`, an unparsable literal. Exit 3, which is not a pass.
//
//   node tools/split-guard/hooks-guard.mjs
//
// What it does NOT cover: whether a slot is ever CALLED. That is a run, not a scan, and it is
// tools/split-guard/hooks-coverage.mjs.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mask } from './cycle-bounds.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const NL = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const CR = String.fromCharCode(13);

const isIdentStart = c => {
  if (!c) return false;
  const k = c.charCodeAt(0);
  return (k >= 65 && k <= 90) || (k >= 97 && k <= 122) || c === '_' || c === '$';
};
const isIdent = c => {
  if (!c) return false;
  const k = c.charCodeAt(0);
  return (k >= 48 && k <= 57) || (k >= 65 && k <= 90) || (k >= 97 && k <= 122) || c === '_' || c === '$';
};
const isSpace = c => c === ' ' || c === NL || c === TAB || c === CR;
const lineAt = (src, i) => src.slice(0, i).split(NL).length;

// Matched close for the bracket at `open`, over masked text, or -1. A fixed-width window
// cannot do this: 200 characters after a `forEach(` once caught the next line's calls.
function matchAt(m, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const shut = pairs[m[open]];
  if (!shut) return -1;
  let d = 0;
  for (let i = open; i < m.length; i++) {
    const c = m[i];
    if (c === m[open]) d++;
    else if (c === shut) { d--; if (!d) return i; }
  }
  return -1;
}

// --- the SLOTS list ------------------------------------------------------------------------
export function slotsOf(src) {
  const m = mask(src);
  const at = m.indexOf('const SLOTS');
  if (at < 0) return { slots: [], why: 'no `const SLOTS` declaration' };
  const open = m.indexOf('[', at);
  if (open < 0) return { slots: [], why: 'SLOTS is not an array literal' };
  const end = matchAt(m, open);
  if (end < 0) return { slots: [], why: 'the SLOTS array is not closed' };
  const slots = [];
  for (let i = open + 1; i < end; i++) {
    const c = m[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < end && m[j] !== c) j++;
      slots.push(src.slice(i + 1, j));
      i = j;
    }
  }
  return { slots, why: null };
}

// --- the wireHooks literal -----------------------------------------------------------------
export function wiredIn(src) {
  const m = mask(src);
  const call = m.indexOf('wireHooks(');
  if (call < 0) return { pairs: [], why: 'no wireHooks( call' };
  const open = call + 'wireHooks('.length - 1;
  const close = matchAt(m, open);
  if (close < 0) return { pairs: [], why: 'the wireHooks( call is not closed' };
  let ob = -1;
  for (let i = open + 1; i < close; i++) { if (isSpace(m[i])) continue; ob = m[i] === '{' ? i : -1; break; }
  if (ob < 0) return { pairs: [], why: 'wireHooks is not called with an object literal' };
  const cb = matchAt(m, ob);
  if (cb < 0 || cb > close) return { pairs: [], why: 'the object literal is not closed' };
  const pairs = [];
  let depth = 0;
  for (let i = ob + 1; i < cb; i++) {
    const c = m[i];
    if (c === '{' || c === '(' || c === '[') { depth++; continue; }
    if (c === '}' || c === ')' || c === ']') { depth--; continue; }
    if (depth !== 0) continue;
    if (!isIdentStart(c) || isIdent(m[i - 1]) || m[i - 1] === '.') continue;
    let j = i; while (j < cb && isIdent(m[j])) j++;
    const key = src.slice(i, j);
    let k = j; while (k < cb && isSpace(m[k])) k++;
    if (m[k] === ':') {
      // To the next comma at depth 0, not to the end of a dotted name: an arrow value's own
      // body would otherwise be read as further keys, and the self-test carries that case.
      let v = k + 1; while (v < cb && isSpace(m[v])) v++;
      let e = v, d2 = 0;
      while (e < cb) {
        const ch = m[e];
        if (ch === '(' || ch === '[' || ch === '{') d2++;
        else if (ch === ')' || ch === ']' || ch === '}') d2--;
        else if (ch === ',' && d2 === 0) break;
        e++;
      }
      pairs.push({ key, value: src.slice(v, e).trim(), line: lineAt(src, i) });
      i = e - 1;
    } else {
      pairs.push({ key, value: key, line: lineAt(src, i) });
      i = j - 1;
    }
  }
  return { pairs, why: null };
}

// --- `hooks.X` lookups ---------------------------------------------------------------------
// `local` is what the module bound the import to, because a scan for the literal word `hooks`
// is a scan that goes quietly blind the day somebody writes `import { hooks as h }`.
export function lookupsOf(src, local) {
  const m = mask(src);
  const names = [], computed = [];
  for (let i = 0; i < m.length; i++) {
    if (!isIdentStart(m[i])) continue;
    if (isIdent(m[i - 1]) || m[i - 1] === '.') { while (i < m.length && isIdent(m[i])) i++; continue; }
    let j = i; while (j < m.length && isIdent(m[j])) j++;
    if (src.slice(i, j) !== local) { i = j - 1; continue; }
    let k = j; while (k < m.length && isSpace(m[k])) k++;
    if (m[k] === '.') {
      let s = k + 1; while (s < m.length && isSpace(m[s])) s++;
      let e = s; while (e < m.length && isIdent(m[e])) e++;
      names.push({ name: src.slice(s, e), line: lineAt(src, i) });
      i = e - 1;
    } else if (m[k] === '[') {
      let s = k + 1; while (s < m.length && isSpace(m[s])) s++;
      if (m[s] === '"' || m[s] === "'") {
        let e = s + 1; while (e < m.length && m[e] !== m[s]) e++;
        names.push({ name: src.slice(s + 1, e), line: lineAt(src, i) });
        i = e;
      } else { computed.push({ line: lineAt(src, i) }); i = k; }
    } else i = j - 1;
  }
  return { names, computed };
}

// --- imports -------------------------------------------------------------------------------
// Read from the raw text, because mask() blanks the specifier, which is the half that says
// which module this is.
export function importOfHooks(src) {
  const lines = src.split(NL);
  for (let n = 0; n < lines.length; n++) {
    const L = lines[n];
    if (L.indexOf('import') !== 0) continue;
    if (L.indexOf('hooks.js') < 0) continue;
    const star = L.indexOf('* as ');
    if (star > 0) {
      let s = star + 5, e = s; while (e < L.length && isIdent(L[e])) e++;
      return { kind: 'namespace', local: L.slice(s, e), line: n + 1, raw: L };
    }
    const ob = L.indexOf('{');
    if (ob > 0) {
      const cb = L.indexOf('}', ob);
      const parts = L.slice(ob + 1, cb).split(',').map(x => x.trim()).filter(Boolean);
      for (const p of parts) {
        const bits = p.split(' ').filter(Boolean);
        if (bits[0] === 'hooks') return { kind: 'named', local: bits[bits.length - 1], line: n + 1, raw: L };
      }
      return { kind: 'named-other', local: null, line: n + 1, raw: L };
    }
    return { kind: 'unreadable', local: null, line: n + 1, raw: L };
  }
  return { kind: null, local: null, line: 0, raw: '' };
}

export function namespaceImports(src) {
  const out = new Map();
  for (const L of src.split(NL)) {
    if (L.indexOf('import * as ') !== 0) continue;
    let s = 12, e = s; while (e < L.length && isIdent(L[e])) e++;
    const q = L.indexOf('"', e) < 0 ? L.indexOf("'", e) : L.indexOf('"', e);
    if (q < 0) continue;
    const q2 = L.indexOf(L[q], q + 1);
    out.set(L.slice(s, e), L.slice(q + 1, q2));
  }
  return out;
}

export function exportedNames(src) {
  const m = mask(src);
  const out = new Set();
  for (let i = 0; i < m.length; i++) {
    if (!isIdentStart(m[i]) || isIdent(m[i - 1]) || m[i - 1] === '.') continue;
    let j = i; while (j < m.length && isIdent(m[j])) j++;
    if (src.slice(i, j) !== 'export') { i = j - 1; continue; }
    let k = j; while (k < m.length && isSpace(m[k])) k++;
    if (m[k] === '{') {
      const cb = matchAt(m, k);
      for (const p of src.slice(k + 1, cb < 0 ? src.length : cb).split(',')) {
        const bits = p.trim().split(' ').filter(Boolean);
        if (bits.length) out.add(bits[bits.length - 1]);
      }
      i = (cb < 0 ? m.length : cb);
      continue;
    }
    let w = k, we = k; while (we < m.length && isIdent(m[we])) we++;
    const kw = src.slice(w, we);
    if (kw === 'function' || kw === 'const' || kw === 'let' || kw === 'var' || kw === 'class' || kw === 'async' || kw === 'default') {
      let n = we; while (n < m.length && !isIdentStart(m[n])) n++;
      let ne = n; while (ne < m.length && isIdent(m[ne])) ne++;
      let nm = src.slice(n, ne);
      if (nm === 'function' || nm === 'class') { let p = ne; while (p < m.length && !isIdentStart(m[p])) p++; let pe = p; while (pe < m.length && isIdent(m[pe])) pe++; nm = src.slice(p, pe); }
      if (nm) out.add(nm);
      i = ne - 1;
      continue;
    }
    i = we - 1;
  }
  return out;
}

export function importCount(src) {
  let n = 0;
  for (const L of src.split(NL)) if (L.indexOf('import ') === 0 || L.indexOf('import{') === 0 || L.indexOf('import*') === 0) n++;
  return n;
}

// --- the leg -------------------------------------------------------------------------------
function short(p) { return relative(REPO, p).split(String.fromCharCode(92)).join('/'); }

async function main() {
  const SRC = join(REPO, 'src');
  const MODS = join(SRC, 'modules');
  const HOOKS = join(MODS, 'hooks.js');
  if (!existsSync(HOOKS)) { console.log('split-guard hooks  CANNOT SEE: no src/modules/hooks.js'); process.exit(3); }

  const hooksSrc = readFileSync(HOOKS, 'utf8');
  const mainSrc = readFileSync(join(SRC, 'main.js'), 'utf8');
  const s = slotsOf(hooksSrc);
  if (s.why) { console.log('split-guard hooks  CANNOT SEE: ' + s.why); process.exit(3); }
  const slots = s.slots;
  const w = wiredIn(mainSrc);
  if (w.why) { console.log('split-guard hooks  CANNOT SEE: ' + w.why); process.exit(3); }

  const files = [join(SRC, 'main.js')].concat(readdirSync(MODS).filter(f => f.endsWith('.js')).map(f => join(MODS, f)));
  let failed = 0, unreadable = 0;
  const early = [];   // printed after the header line, so the summary leads
  const used = new Map();      // slot name -> [file:line]
  const unknown = [];          // lookups naming no slot
  let readers = 0, sites = 0;

  for (const f of files) {
    if (f === HOOKS) continue;
    const src = readFileSync(f, 'utf8');
    const imp = importOfHooks(src);
    if (!imp.kind) continue;
    if (imp.kind === 'namespace' && f === join(SRC, 'main.js')) {
      // main.js holds the module namespace and calls wireHooks through it; its own lookups of
      // the frozen object, if any, go under the namespace and are read below.
    } else if (imp.kind !== 'named') {
      early.push('  FAIL  ' + short(f) + ':' + imp.line + ' imports hooks.js in a form this scan cannot read: ' + imp.raw.trim());
      unreadable++;
      continue;
    }
    const local = imp.kind === 'namespace' ? imp.local + '.hooks' : imp.local;
    const look = imp.kind === 'namespace' ? { names: [], computed: [] } : lookupsOf(src, local);
    if (imp.kind === 'named' && imp.local !== 'hooks') {
      early.push('  note  ' + short(f) + ':' + imp.line + ' binds hooks under the name ' + imp.local);
    }
    if (look.names.length) readers++;
    for (const n of look.names) {
      sites++;
      if (!used.has(n.name)) used.set(n.name, []);
      used.get(n.name).push(short(f) + ':' + n.line);
    }
    for (const c of look.computed) {
      early.push('  FAIL  ' + short(f) + ':' + c.line + ' reaches hooks by a computed key this scan cannot resolve');
      unreadable++;
    }
  }
  for (const [name, where] of used) if (slots.indexOf(name) < 0) unknown.push({ name, where });

  console.log('split-guard hooks  ' + slots.length + ' slot(s), ' + w.pairs.length + ' wired at boot, '
    + sites + ' lookup(s) over ' + readers + ' module(s)');
  for (const L of early) console.log(L);

  // --- bound 1: the contract and the boot literal agree, both ways.
  const wiredKeys = w.pairs.map(p => p.key);
  const notFilled = slots.filter(x => wiredKeys.indexOf(x) < 0);
  const notDeclared = wiredKeys.filter(x => slots.indexOf(x) < 0);
  const dupes = wiredKeys.filter((x, i) => wiredKeys.indexOf(x) !== i);
  if (notFilled.length || notDeclared.length || dupes.length) {
    for (const x of notFilled) console.log('  FAIL  slot ' + x + ' is declared in SLOTS and is not filled by wireHooks at boot');
    for (const x of notDeclared) console.log('  FAIL  wireHooks fills ' + x + ', which is in no slot');
    for (const x of dupes) console.log('  FAIL  wireHooks fills ' + x + ' more than once');
    failed += notFilled.length + notDeclared.length + dupes.length;
  } else {
    console.log('  ok    every slot is filled at boot and every key filled is a slot, ' + slots.length + ' both ways');
  }

  // --- bound 2: every value resolves to a name its module exports.
  const ns = namespaceImports(mainSrc);
  const cache = new Map();
  let bad2 = 0;
  for (const p of w.pairs) {
    const dot = p.value.indexOf('.');
    const shape = p.value.split('.').length === 2 && p.value.split('.').every(x => x.length && [...x].every(isIdent));
    if (!shape) { console.log('  FAIL  main.js:' + p.line + ' fills ' + p.key + ' with ' + JSON.stringify(p.value) + '. A slot is filled from namespace.member and nothing else, because that is the form this leg can check against the module that exports it'); bad2++; continue; }
    const who = p.value.slice(0, dot), what = p.value.slice(dot + 1);
    const spec = ns.get(who);
    if (!spec) { console.log('  FAIL  main.js:' + p.line + ' fills ' + p.key + ' from ' + who + ', which main.js does not import as a namespace'); bad2++; continue; }
    const file = resolve(SRC, spec);
    if (!existsSync(file)) { console.log('  FAIL  main.js:' + p.line + ' fills ' + p.key + ' from ' + spec + ', which is not a file'); bad2++; continue; }
    if (!cache.has(file)) cache.set(file, exportedNames(readFileSync(file, 'utf8')));
    if (!cache.get(file).has(what)) { console.log('  FAIL  main.js:' + p.line + ' fills ' + p.key + ' with ' + p.value + ', and ' + short(file) + ' exports no ' + what); bad2++; }
  }
  if (!bad2) console.log('  ok    every one of the ' + w.pairs.length + ' values names something its module exports');
  failed += bad2;

  // --- bound 3: every lookup names a declared slot.
  if (unknown.length) {
    for (const u of unknown) console.log('  FAIL  ' + u.where[0] + ' calls hooks.' + u.name + ', which is in no slot (silent: the frozen object returns undefined)');
    failed += unknown.length;
  } else {
    console.log('  ok    all ' + sites + ' lookup(s) name a declared slot');
  }

  // --- bound 4: no slot is dead.
  const dead = slots.filter(x => !used.has(x));
  if (dead.length) {
    for (const x of dead) console.log('  FAIL  slot ' + x + ' is declared and wired and nothing in src/ looks it up');
    failed += dead.length;
  } else {
    console.log('  ok    every slot is looked up somewhere in src/, ' + slots.filter(x => used.has(x)).length + ' of ' + slots.length);
  }

  // --- bound 5: hooks.js imports nothing.
  const n = importCount(hooksSrc);
  if (n) { console.log('  FAIL  hooks.js holds ' + n + ' import(s); it can join a ring and the valve argument fails'); failed++; }
  else console.log('  ok    hooks.js imports nothing, so it can never join a ring');

  if (unreadable) {
    console.log('  ' + unreadable + ' place(s) this scan could not read. A gate that cannot see does not pass.');
    process.exit(3);
  }
  if (failed) { console.log('  ' + failed + ' finding(s).'); process.exit(1); }
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
