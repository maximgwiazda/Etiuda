// The three bounds on the closure-only import cycle. Board 318, Maxim's rule of 2026-09-14 07:23.
//
// THE RULING. The cycle may grow as the extraction finishes, under three bounds: exactly one
// component, never a second even of two; the raw-load bite test stays clean at every commit,
// which is `cycles.mjs` and is not repeated here; and a cut whose membership delta is tens is
// refused or rerouted. The property that makes the ring safe - nothing in a member runs at
// load - becomes this gate, so that it is measured by a tool rather than per commit by hand.
//
// WHAT "NOTHING RUNS AT LOAD" HAS TO MEAN, and it is not what a line rule can say. Two checks:
//
//   A1  no bare executable statement at a member's top level. `try{`, `foo();`, an IIFE.
//   A2  no top-level evaluation that READS A BINDING IMPORTED FROM ANOTHER MEMBER of the same
//       component. `const TAB_EASE = E_EASE;` is a declaration under A1 and under every line
//       rule written so far, and it is exactly the load-time cycle the whole gate exists for:
//       bundled it reads `undefined` in silence, unbundled it throws. A1 alone would pass it.
//
// A2 is what makes this a property of the CYCLE rather than a tidiness rule, and it is why the
// leg is not a grep. Its errors are on purpose in the loud direction: an identifier it cannot
// place is collected, so a finding may be a false alarm and a silence may not be a miss.
//
// WHY THE JUMP IS A NOTE AND NOT A FAILURE. A per-commit delta is evadable by splitting one cut
// over two commits, so failing on it buys little; and a legitimate reroute may legitimately
// pass through a wide intermediate commit - move `toast`, then reroute `markCut` - which a
// failure would block while the ruling allows it. So the delta, the baseline and the joining
// files are printed by name and the report quotes them, and a human applies Maxim's rule to a
// number that is in front of him. The absolute membership is printed too, because that is what
// a growth over four commits of +5 each would show and a per-commit delta would not.
//
//   node tools/split-guard/cycle-bounds.mjs [--entry src/main.js] [--against <rev>] [--no-jump]
//
// Exit 0 clean, 1 a bound failed, 2 misuse, 3 the scan could not see (a gate that cannot see
// does not pass).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { importGraph, cycles } from './cycles.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

// The most members the one component may hold. Board 328: the ring was 67 and was cut, so the
// number is a ratchet rather than a description - it only ever goes down.
const CEILING = 16;

// ---------------------------------------------------------------------------------------
// The lexer. Length-preserving, so every index into the masked text is an index into the
// source and a line number is a count of newlines in the source.
//
// Comment bodies keep their newlines, because a newline between two statements is a statement
// boundary whether or not a comment sits on it. String and template bodies LOSE theirs: a
// template literal spanning six lines is one token, and the three column-0 lines inside
// `stock.js`'s template are exactly the difference between a masked rule and a raw grep.
const REGEX_AFTER_WORD = new Set(('return typeof case in of instanceof do else new delete void yield await throw')
  .split(' '));

export function mask(js) {
  const out = js.split('');
  const body = (a, b) => { for (let k = a; k < b; k++) out[k] = ' '; };
  const comment = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0, prevCh = '', prevWord = '';
  while (i < js.length) {
    const c = js[i];
    if (c === '/' && js[i + 1] === '/') {
      let j = js.indexOf('\n', i); if (j < 0) j = js.length;
      comment(i, j); i = j; continue;
    }
    if (c === '/' && js[i + 1] === '*') {
      let j = js.indexOf('*/', i + 2); j = j < 0 ? js.length : j + 2;
      comment(i, j); i = j; continue;
    }
    if (c === '"' || c === "'") {
      // A quoted string cannot hold a raw newline. One apostrophe in a comment once blanked
      // 8,800 characters and two whole files, so the newline is the stop.
      let j = i + 1;
      while (j < js.length) {
        if (js[j] === (String.fromCharCode(92))) { j += 2; continue; }
        if (js[j] === c || js[j] === '\n') break;
        j++;
      }
      body(i + 1, Math.min(j, js.length));
      i = js[j] === c ? j + 1 : j; prevCh = c; prevWord = ''; continue;
    }
    if (c === '`') {
      let j = i + 1;
      while (j < js.length) {
        if (js[j] === (String.fromCharCode(92))) { j += 2; continue; }
        if (js[j] === '`') break;
        if (js[j] === '$' && js[j + 1] === '{') { let d = 1; j += 2; while (j < js.length && d) { if (js[j] === '{') d++; else if (js[j] === '}') d--; j++; } continue; }
        j++;
      }
      body(i + 1, Math.min(j, js.length));
      i = js[j] === '`' ? j + 1 : j; prevCh = '`'; prevWord = ''; continue;
    }
    // Regex before division, by what precedes the slash. The word list is what a punctuation
    // test alone cannot see: `return /x/.test(s)` holds a bracket and a quote often enough.
    if (c === '/' && (prevCh === '' || '=(,:[!&|?{};+-*%~^<>'.includes(prevCh) || REGEX_AFTER_WORD.has(prevWord))) {
      let j = i + 1, cls = false, closed = false;
      while (j < js.length) {
        if (js[j] === (String.fromCharCode(92))) { j += 2; continue; }
        if (js[j] === '[') cls = true;
        else if (js[j] === ']') cls = false;
        else if (js[j] === '/' && !cls) { closed = true; j++; while (j < js.length && /[a-z]/.test(js[j])) j++; break; }
        else if (js[j] === '\n') break;
        j++;
      }
      if (closed) { body(i + 1, j - 1); i = j; prevCh = '/'; prevWord = ''; continue; }
      // Not a regex after all; fall through and treat the slash as an operator.
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < js.length && /[A-Za-z0-9_$]/.test(js[j])) j++;
      prevWord = js.slice(i, j); prevCh = js[j - 1]; i = j; continue;
    }
    if (!/\s/.test(c)) { prevCh = c; prevWord = ''; }
    i++;
  }
  return out.join('');
}

// ---------------------------------------------------------------------------------------
// Top-level statements, by a walk rather than by a column-0 line rule.
//
// A line rule has to answer three questions it has no way to answer: an indented top-level
// call is at no column it looks at; `letters=1;` begins with `let`; and a closing `};` is not
// a statement at all, which is where two implementations of the same sentence differed by 249
// lines and neither was wrong. A walk answers all three by construction: a closer is consumed
// by the statement it closes, so it is never a statement head, and column is not consulted.
//
// A statement ends at a `;` at depth 0, or at a line break at depth 0 that no operator carries
// over. That is the same termination rule `guard.mjs` uses, deliberately, so that two gates in
// this directory do not disagree about where a statement ends.
const CONT_BEFORE = ',=+-*/%?:.([{&|^~<>!';
const CONT_AFTER = ',=+-*/%?:.([`<>&|!^~';

export function topLevelStatements(js) {
  const m = mask(js);
  const out = [];
  let depth = 0, start = -1, minDepth = 0;
  const prevMeaning = i => { let k = i - 1; while (k >= 0 && /\s/.test(m[k])) k--; return k >= 0 ? m[k] : ''; };
  const nextMeaning = i => { let k = i + 1; while (k < m.length && /\s/.test(m[k])) k++; return k < m.length ? m[k] : ''; };
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (/\s/.test(c)) {
      if (c === '\n' && depth === 0 && start >= 0
        && !CONT_BEFORE.includes(prevMeaning(i)) && !CONT_AFTER.includes(nextMeaning(i))) {
        out.push({ start, end: i }); start = -1;
      }
      continue;
    }
    if (start < 0) start = i;
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { depth--; if (depth < minDepth) minDepth = depth; }
    else if (c === ';' && depth === 0) { out.push({ start, end: i + 1 }); start = -1; }
  }
  if (start >= 0) out.push({ start, end: m.length });
  return { statements: out, masked: m, minDepth, endDepth: depth };
}

const DECL_HEAD = /^(import|export|const|let|var|function|class|async)(?![A-Za-z0-9_$])/;

export function lineOf(js, idx) {
  let n = 1;
  for (let i = 0; i < idx && i < js.length; i++) if (js[i] === '\n') n++;
  return n;
}

// A1. Every top-level statement whose head is not a declaration keyword, `async function`
// aside. An empty statement is not a finding; a closer cannot reach here.
export function bareStatements(js) {
  const { statements, masked, minDepth, endDepth } = topLevelStatements(js);
  const out = [];
  for (const s of statements) {
    const head = masked.slice(s.start, s.end).trim();
    if (!head || /^[;]+$/.test(head)) continue;
    const m = DECL_HEAD.exec(head);
    // `async` heads a declaration only in `async function`; `asyncThing()` is a call.
    if (m && m[1] === 'async' && !/^async\s+function(?![A-Za-z0-9_$])/.test(head)) {
      out.push({ line: lineOf(js, s.start), text: firstLine(js, s) });
      continue;
    }
    // `export default` is a declaration only when what follows is one: `export default go()`
    // runs at load exactly as `go()` does.
    if (m && m[1] === 'export' && /^export\s+default(?![A-Za-z0-9_$])/.test(head)
      && !/^export\s+default\s+(async\s+)?(function|class)(?![A-Za-z0-9_$])/.test(head)) {
      out.push({ line: lineOf(js, s.start), text: firstLine(js, s) });
      continue;
    }
    if (!m) out.push({ line: lineOf(js, s.start), text: firstLine(js, s) });
  }
  return { findings: out, statements, masked, unreadable: minDepth < 0 || endDepth !== 0 };
}

function firstLine(js, s) {
  return js.slice(s.start, s.end).split('\n')[0].trim().slice(0, 100);
}

// ---------------------------------------------------------------------------------------
// The imports of one file, local name to resolved absolute path. `import { a as b }` binds b;
// `import * as ns` binds ns; a default binds its own name; a bare `import "./x.js"` binds none.
export function importsOf(js, fileDir) {
  const { statements, masked } = topLevelStatements(js);
  const out = new Map();
  for (const s of statements) {
    const head = masked.slice(s.start, s.end).trim();
    if (!/^import(?![A-Za-z0-9_$])/.test(head)) continue;
    const raw = js.slice(s.start, s.end);
    const mraw = masked.slice(s.start, s.end);
    // The specifier is the last quoted run of the statement; the bodies are masked, so the
    // quotes are the only ones left and the source under them is the real text.
    const q = Math.max(mraw.lastIndexOf('"'), mraw.lastIndexOf("'"));
    const qc = mraw[q];
    const open = mraw.lastIndexOf(qc, q - 1);
    if (q < 0 || open < 0) continue;
    const spec = raw.slice(open + 1, q);
    const target = spec.startsWith('.') ? resolve(fileDir, spec) : null;
    const fromAt = mraw.lastIndexOf('from', open);
    const clause = fromAt > 0 ? raw.slice(raw.indexOf('import') + 6, fromAt) : '';
    for (const name of clauseNames(clause)) out.set(name, target);
  }
  return out;
}

function clauseNames(clause) {
  const names = [];
  const braceA = clause.indexOf('{'), braceB = clause.lastIndexOf('}');
  const outside = (braceA >= 0 ? clause.slice(0, braceA) + ' ' + clause.slice(braceB + 1) : clause);
  for (const mm of outside.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
    if (mm[0] === 'as' || mm[0] === 'from') continue;
    names.push(mm[0]);
  }
  // `* as ns` leaves `ns` in the outside text and that is the binding, which the loop took.
  if (braceA >= 0) {
    for (const part of clause.slice(braceA + 1, braceB).split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      const local = (bits[bits.length - 1] || '').trim();
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(local)) names.push(local);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------------------
// A2. The identifiers a top-level statement EVALUATES, which is every identifier outside a
// function body: a function expression and an arrow body run when they are called, not when
// the module is loaded, and every member of this component is nothing but those.
//
// Over-collection is the safe direction and is taken on purpose: a property name after a dot
// is dropped because `x.toast` is not the binding `toast`, and everything else is kept, so an
// object key or a getter shorthand that happens to share a name with an imported binding is a
// false alarm rather than a silence.
export function evaluatedIdentifiers(text) {
  const m = mask(text);
  const skip = new Array(m.length).fill(false);
  const back = i => { let k = i - 1; while (k >= 0 && /\s/.test(m[k])) k--; return k; };
  for (let i = 0; i < m.length; i++) {
    if (skip[i]) continue;
    let open = -1;
    // An arrow body, block or expression.
    if (m[i] === '=' && m[i + 1] === '>') {
      let k = i + 2; while (k < m.length && /\s/.test(m[k])) k++;
      const end = m[k] === '{' ? balanced(m, k) : expressionEnd(m, k);
      if (!invokedAfter(m, end)) { for (let q = i; q < end; q++) skip[q] = true; }
      i = end - 1;
      continue;
    }
    // A block whose `{` follows a `)`: a function declaration or expression, a method
    // shorthand, a getter. Everything with a parameter list and a body, in one rule.
    if (m[i] === '{' && m[back(i)] === ')') open = i;
    if (open >= 0) {
      const end = balanced(m, open);
      if (!invokedAfter(m, end)) { for (let q = open; q < end; q++) skip[q] = true; }
      i = end - 1;
    }
  }
  const names = new Set();
  for (let i = 0; i < m.length; i++) {
    if (skip[i]) continue;
    if (!/[A-Za-z_$]/.test(m[i])) continue;
    if (i > 0 && /[A-Za-z0-9_$]/.test(m[i - 1])) continue;
    let j = i; while (j < m.length && /[A-Za-z0-9_$]/.test(m[j])) j++;
    let p = i - 1; while (p >= 0 && /\s/.test(m[p])) p--;
    const isProp = p >= 0 && m[p] === '.' && !(p > 0 && m[p - 1] === '.');
    // An object-literal key names a property and reads nothing: `{ toast: 1 }`. The shorthand
    // `{ toast }` is a read and stays one, which is why the test is the colon and not the brace.
    let q = j; while (q < m.length && /\s/.test(m[q])) q++;
    const isKey = m[q] === ':' && (m[p] === '{' || m[p] === ',') && m[q + 1] !== ':';
    if (!isProp && !isKey) names.add(text.slice(i, j));
    i = j - 1;
  }
  return names;
}

// A body that is called where it stands runs at load after all: `(function(){ ... })()` and
// `(() => { ... })()`. The scan looks past the closing brace and any closing parens.
function invokedAfter(m, end) {
  let k = end;
  while (k < m.length && (/\s/.test(m[k]) || m[k] === ')')) k++;
  return m[k] === '(';
}

function balanced(m, open) {
  let d = 0;
  for (let i = open; i < m.length; i++) {
    if ('([{'.includes(m[i])) d++;
    else if (')]}'.includes(m[i])) { d--; if (!d) return i + 1; }
  }
  return m.length;
}
function expressionEnd(m, k) {
  let d = 0;
  for (let i = k; i < m.length; i++) {
    if ('([{'.includes(m[i])) d++;
    else if (')]}'.includes(m[i])) { if (!d) return i; d--; }
    else if (m[i] === ',' && !d) return i;
    else if (m[i] === ';' && !d) return i;
  }
  return m.length;
}

// The declaration keywords themselves, and the binding names a statement introduces, are not
// reads. Everything the statement evaluates is; the head keyword is stripped so that `const`
// is not mistaken for an identifier.
const NOT_A_READ = new Set(('import export const let var function class async await new typeof void delete in of'
  + ' instanceof return if else for while do switch case break continue try catch finally throw this null true'
  + ' false undefined yield static get set').split(' '));

export function loadTimeReads(js, interesting) {
  const { statements, masked } = topLevelStatements(js);
  const hits = [];
  for (const s of statements) {
    const raw = js.slice(s.start, s.end);
    const head = masked.slice(s.start, s.end).trim();
    if (!head) continue;
    if (/^(import|export\s+[{*])/.test(head)) continue;                 // binds, evaluates nothing
    if (/^(export\s+)?(async\s+)?function(?![A-Za-z0-9_$])/.test(head)) continue;
    if (/^(export\s+)?class(?![A-Za-z0-9_$])/.test(head)) continue;
    const names = evaluatedIdentifiers(raw);
    for (const n of names) {
      if (NOT_A_READ.has(n)) continue;
      if (interesting.has(n)) hits.push({ line: lineOf(js, s.start), name: n, from: interesting.get(n), text: firstLine(js, s) });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------------------
// The graph, from `cycles.mjs`, so that there is one import graph in this directory and not a
// second implementation of one. Members are the union of every component of size above one.
export async function componentsOf(entry) {
  const edges = await importGraph({ entry });
  const found = cycles(edges);
  return { components: found.map(c => c.map(f => resolve(f)).sort()), nodes: edges.size, edges };
}

// The control that runs on every invocation, because A2 is an intersection with the import
// list and an import list that silently parsed nothing would make the whole leg vacuous while
// it printed ok. `importsOf`'s targets are diffed BOTH WAYS against esbuild's own graph, which
// is a second implementation this tool does not own. A count would not have caught it: three
// faults in a neighbouring tool survived a matching count and none survived a set diff.
export function importCensusFaults(edges) {
  const out = [];
  let pairs = 0;
  for (const [file, list] of edges) {
    const abs = resolve(file);
    if (!abs.endsWith('.js') || !existsSync(abs)) continue;
    const mine = new Set([...importsOf(readFileSync(abs, 'utf8').split(String.fromCharCode(13) + '\n').join('\n'),
      dirname(abs)).values()].filter(Boolean));
    const theirs = new Set(list.map(p => resolve(p)));
    pairs += theirs.size;
    for (const m of theirs) if (!mine.has(m)) out.push({ file: abs, missing: m });
    for (const m of mine) if (!theirs.has(m)) out.push({ file: abs, extra: m });
  }
  return { faults: out, pairs };
}

export function membershipDelta(before, after) {
  const a = new Set(before), b = new Set(after);
  const joined = [...b].filter(x => !a.has(x));
  const left = [...a].filter(x => !b.has(x));
  return { joined, left, delta: b.size - a.size, before: a.size, after: b.size };
}

// The baseline tree, materialised from git so that the same `importGraph` reads both sides.
export function treeAt(rev) {
  const dir = mkdtempSync(join(tmpdir(), 'cycle-bounds-'));
  const r = spawnSync('git', ['-C', REPO, 'ls-tree', '-r', '--name-only', rev, '--', 'src'], { encoding: 'utf8' });
  if (r.status !== 0) { rmSync(dir, { recursive: true, force: true }); return { dir: null, why: (r.stderr || '').trim() }; }
  const files = r.stdout.split('\n').map(s => s.trim()).filter(Boolean);
  if (!files.length) { rmSync(dir, { recursive: true, force: true }); return { dir: null, why: 'no src/ at ' + rev }; }
  for (const f of files) {
    const blob = spawnSync('git', ['-C', REPO, 'show', rev + ':' + f], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
    if (blob.status !== 0) { rmSync(dir, { recursive: true, force: true }); return { dir: null, why: 'cannot read ' + f + ' at ' + rev }; }
    const dest = join(dir, f);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, blob.stdout);
  }
  return { dir, why: null, files: files.length };
}

function gitDirty(paths) {
  const r = spawnSync('git', ['-C', REPO, 'status', '--porcelain', '--', ...paths], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

// ---------------------------------------------------------------------------------------
function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const entry = resolve(arg('--entry', join(REPO, 'src', 'main.js')));
  if (!existsSync(entry)) { console.error('no entry at ' + entry); process.exit(2); }
  const short = f => relative(dirname(entry), f).split(String.fromCharCode(92)).join('/');

  const { components, nodes, edges } = await componentsOf(entry);
  const members = components.flat();
  console.log('split-guard cycle-bounds  ' + nodes + ' modules reachable from ' + short(entry)
    + ', ' + components.length + ' component(s) of size above one, ' + members.length + ' member(s)');

  let failed = 0, unreadable = 0;

  const census = importCensusFaults(edges);
  if (census.faults.length) {
    for (const f of census.faults.slice(0, 10)) {
      console.log('  UNKNOWN  ' + short(f.file) + ': import census '
        + (f.missing ? 'lacks ' + short(f.missing) : 'invents ' + short(f.extra)) + ' against esbuild');
    }
    unreadable++;
  } else {
    console.log('  ok    the import census matches the esbuild graph both ways, '
      + census.pairs + ' edges over ' + nodes + ' files');
  }

  // --- bound 1: the property, per member.
  const memberSet = new Set(members);
  let a1 = 0, a2 = 0;
  for (const f of members) {
    const js = readFileSync(f, 'utf8').split(String.fromCharCode(13) + '\n').join('\n');
    const bare = bareStatements(js);
    if (bare.unreadable) {
      console.log('  UNKNOWN  ' + short(f) + ' did not scan to depth zero, so this gate has not checked it');
      unreadable++;
      continue;
    }
    for (const b of bare.findings) {
      console.log('  FAIL  ' + short(f) + ':' + b.line + ' runs at load: ' + b.text);
      a1++;
    }
    const imports = importsOf(js, dirname(f));
    const fromMembers = new Map();
    for (const [name, target] of imports) if (target && memberSet.has(target)) fromMembers.set(name, target);
    for (const h of loadTimeReads(js, fromMembers)) {
      console.log('  FAIL  ' + short(f) + ':' + h.line + ' reads ' + h.name + ' from ' + short(h.from)
        + ' at load, across the cycle: ' + h.text);
      a2++;
    }
  }
  if (!a1 && !a2 && !unreadable) {
    console.log('  ok    every member holds 0 top-level executable statements and 0 load-time reads across the cycle');
  }
  failed += a1 + a2;

  // --- bound 2: exactly one component.
  if (components.length > 1) {
    console.log('  FAIL  ' + components.length + ' components, and the rule of 2026-09-14 07:23 allows one:');
    for (const c of components) console.log('        of ' + c.length + ': ' + c.map(short).join(' -> '));
    failed++;
  } else {
    console.log('  ok    ' + components.length + ' component(s), and the rule allows at most one');
  }

  // --- bound 3a: the ceiling. Board 328, Maxim 2026-09-14 11:15. The jump below stays a note
  // for the reasons at the head of this file; a CEILING is the other half and does fail, so the
  // ring cannot grow back one commit at a time while every delta stays small. Lower it whenever
  // a cut lands - the leg says so when the tree is already under it.
  if (members.length > CEILING) {
    console.log('  FAIL  ' + members.length + ' members, and the ceiling is ' + CEILING
      + '. The ring was cut to that on 2026-09-14 and is not to grow back.');
    failed++;
  } else if (members.length < CEILING) {
    console.log('  note  ' + members.length + ' members, under the ceiling of ' + CEILING
      + '. Lower CEILING in this file to ' + members.length + ' and the new floor holds.');
  } else {
    console.log('  ok    ' + members.length + ' member(s), at the ceiling of ' + CEILING + ' and not above it');
  }

  // --- bound 3: the membership jump, a note.
  if (!process.argv.includes('--no-jump')) {
    const dirty = gitDirty(['src']);
    const baseline = arg('--against', dirty ? 'HEAD' : 'HEAD~1');
    const t = treeAt(baseline);
    if (!t.dir) {
      console.log('  note  no baseline to compare against (' + baseline + '): ' + t.why);
    } else {
      try {
        const past = await componentsOf(join(t.dir, 'src', 'main.js'));
        const pastMembers = past.components.flat().map(f => short(join(dirname(entry), relative(join(t.dir, 'src'), f))));
        const nowMembers = members.map(short);
        const d = membershipDelta(pastMembers, nowMembers);
        const sign = d.delta > 0 ? '+' + d.delta : String(d.delta);
        console.log('  note  membership ' + d.before + ' at ' + baseline + ' to ' + d.after + ' here, ' + sign
          + (d.joined.length ? ', joining: ' + d.joined.join(' ') : '')
          + (d.left.length ? ', leaving: ' + d.left.join(' ') : ''));
        if (d.delta >= 10) {
          console.log('  note  A JUMP OF TEN OR MORE. Maxim 2026-09-14 07:23: refused or rerouted unless the delta');
          console.log('        is the files that must house the name. This leg does not fail on it, by Clement 2026-09-14:');
          console.log('        a per-commit delta is evaded by two commits, and a legitimate reroute may pass through a');
          console.log('        wide intermediate commit. The number is here so a person applies the rule to it.');
        }
      } finally {
        rmSync(t.dir, { recursive: true, force: true });
      }
    }
  }

  if (unreadable) {
    console.log('  Exiting non-zero on purpose: a gate that cannot see does not pass.');
    process.exitCode = 3;
  } else if (failed) {
    console.log('  ' + failed + ' finding(s). The ring is safe because nothing in a member runs at load; this says it does.');
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}
