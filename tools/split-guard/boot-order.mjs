// The boot order. Board 330.
//
// `boot()` in src/main.js is over two hundred lines, and its comment says the order IS the
// contract: a listener registered earlier runs earlier, and more than one line reads what an
// earlier one wrote. Until this leg, no gate in the repository read a single one of those
// lines. A statement moved, added or dropped changed the app's start-up order and every
// instrument stayed green, because nothing anywhere held an opinion about what that order was.
//
// So the order is declared, in tools/split-guard/boot-order.list, and this leg refuses a tree
// that departs from it. The remedy for a legitimate change is one line in the list, written
// deliberately, which is the whole point: the list is where somebody has to say out loud that
// the order changed.
//
//   node tools/split-guard/boot-order.mjs            check
//   node tools/split-guard/boot-order.mjs --write    rewrite the list from the tree
//
// A step is the callee path of a top-level statement of boot(), with #2, #3 where a callee
// repeats, and a shape tag where the statement is not a plain call. It is deliberately NOT the
// source text: a re-wrap or a comment edit must not be a finding, and a reorder must be. The
// self-test carries both directions.
//
// Exit 0 clean, 1 the order departs from the list, 2 misuse, 3 the scan could not see boot(),
// which is not a pass.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mask } from './cycle-bounds.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const LIST = join(HERE, 'boot-order.list');
const NL = String.fromCharCode(10);
const HASH = String.fromCharCode(35);

const isIdent = c => {
  if (!c) return false;
  const k = c.charCodeAt(0);
  return (k >= 48 && k <= 57) || (k >= 65 && k <= 90) || (k >= 97 && k <= 122) || c === '_' || c === '$';
};
const isIdentStart = c => {
  if (!c) return false;
  const k = c.charCodeAt(0);
  return (k >= 65 && k <= 90) || (k >= 97 && k <= 122) || c === '_' || c === '$';
};
const isSpace = c => c === ' ' || c === NL || c === String.fromCharCode(9) || c === String.fromCharCode(13);
const CONTINUES = new Set(['catch', 'finally', 'else', 'while']);

// The body of `function <name>(){ ... }`, as {from, to} indices into the source, or null.
export function bodyOf(src, name) {
  const m = mask(src);
  const head = 'function ' + name + '(';
  const at = m.indexOf(head);
  if (at < 0) return null;
  const ob = m.indexOf('{', at);
  if (ob < 0) return null;
  let d = 0;
  for (let i = ob; i < m.length; i++) {
    if (m[i] === '{') d++;
    else if (m[i] === '}') { d--; if (!d) return { from: ob + 1, to: i, mask: m }; }
  }
  return null;
}

// The top-level statements of a body, as {text, line}. A `}` that closes a block is the end of
// the statement UNLESS what follows continues it - which is the whole of why `try{}catch{}` is
// one statement and not two, and a line rule cannot say so.
export function statementsIn(src, from, to, m) {
  const out = [];
  let i = from;
  while (i < to) {
    while (i < to && (isSpace(m[i]) || m[i] === ';')) i++;
    if (i >= to) break;
    const start = i;
    let d = 0;
    while (i < to) {
      const c = m[i];
      if (c === '(' || c === '[' || c === '{') { d++; i++; continue; }
      if (c === ')' || c === ']') { d--; i++; continue; }
      if (c === '}') {
        d--; i++;
        if (d === 0) {
          let k = i; while (k < to && isSpace(m[k])) k++;
          let e = k; while (e < to && isIdent(m[e])) e++;
          if (CONTINUES.has(src.slice(k, e))) continue;
          break;
        }
        continue;
      }
      if (c === ';' && d === 0) { i++; break; }
      i++;
    }
    const text = src.slice(start, i);
    if (text.trim()) out.push({ text, mtext: m.slice(start, i), line: src.slice(0, start).split(NL).length });
  }
  return out;
}

// The callee path of a statement: the dotted name in front of the first `(` that is a call and
// not a control keyword's parenthesis. `try{ if(storage.lsGet("x")) ... }` is a call to
// storage.lsGet, and labelling it `if` says nothing, which is what the first cut of this file did.
//
// Every function below takes the RAW text and the MASKED text of the same slice, aligned index
// for index, because the two halves of a label live in different ones: structure is only safe to
// read from the mask, and a string literal is only readable in the raw.
const KEYWORD = new Set(['if', 'for', 'while', 'switch', 'catch', 'typeof', 'return', 'do', 'function', 'new', 'delete', 'void', 'await', 'in', 'of', 'else', 'try', 'finally']);

// The dotted path ending at `end`, read BACKWARDS and allowing whitespace between the segments.
// A call re-wrapped so that the dot begins the next line is still one call; the first cut of this
// file read `railPanel` and `.wireOverlapPointer(` as a bare statement, and the negative control
// in the self-test is what caught it.
function pathBefore(m, end, from) {
  const parts = [];
  let i = end;
  for (;;) {
    while (i > from && isSpace(m[i - 1])) i--;
    const e = i;
    while (i > from && isIdent(m[i - 1])) i--;
    if (i === e) return null;
    parts.unshift(m.slice(i, e));
    let j = i;
    while (j > from && isSpace(m[j - 1])) j--;
    if (j > from && m[j - 1] === '.') { i = j - 1; continue; }
    break;
  }
  if (!isIdentStart(parts[0][0])) return null;
  return parts.join('.');
}

function callOf(m, from) {
  for (let i = from; i < m.length; i++) {
    if (m[i] !== '(') continue;
    const name = pathBefore(m, i, from);
    if (!name) continue;
    if (KEYWORD.has(name) || KEYWORD.has(name.split('.').pop())) continue;
    return { name, paren: i };
  }
  return null;
}

// What the call is about: the leading dotted identifier of the first argument, or its first
// string literal. Three `try{ storage.lsGet("...") }` statements carry one callee between them
// and are told apart by nothing else, so without this a swap of two of them is invisible - and
// two bindFieldClear(...) calls in a row are the same case.
function argOf(r, m, paren) {
  let i = paren + 1;
  while (i < m.length && isSpace(m[i])) i++;
  if (m[i] === '"' || m[i] === "'") {
    let e = i + 1;
    while (e < m.length && m[e] !== m[i]) e++;
    return String.fromCharCode(34) + r.slice(i + 1, e) + String.fromCharCode(34);
  }
  if (!isIdentStart(m[i])) return '';
  let e = i;
  while (e < m.length && (isIdent(m[e]) || m[e] === '.')) e++;
  const head = m.slice(i, e);
  return KEYWORD.has(head) ? '' : head;
}

// The shape label for one statement, before disambiguation. `text` and `mtext` are the same
// slice, raw and masked.
export function labelOf(text, mtext) {
  const r = text, m = mtext;
  let a = 0; while (a < m.length && isSpace(m[a])) a++;
  let head = a; while (head < m.length && isIdent(m[head])) head++;
  const word = m.slice(a, head);
  const block = word === 'try' || word === 'if' || word === 'for' || word === 'while' || word === 'switch' || word === 'do';
  const call = callOf(m, block ? head : a);
  if (block) {
    if (!call) return word + ':?';
    return word + ':' + call.name + '(' + argOf(r, m, call.paren) + ')';
  }
  if (call && (call.name === 'addEventListener' || call.name.endsWith('.addEventListener'))) {
    // The event name is the identity here, not the callee: a resize listener and a scroll
    // listener are two different facts about the order.
    return 'addEventListener:' + (argOf(r, m, call.paren) || '?');
  }
  if (call) return call.name + '(' + argOf(r, m, call.paren) + ')';
  // No call at all: an assignment, or a bare declaration.
  const eq = m.indexOf('=', a);
  if (eq > a && m[eq + 1] !== '=' && m[eq - 1] !== '=' && m[eq - 1] !== '!' && m[eq - 1] !== '<' && m[eq - 1] !== '>') {
    return 'assign:' + m.slice(a, eq).trim();
  }
  return 'statement:' + m.slice(a).split(NL)[0].trim().slice(0, 40);
}

export function stepsOf(src) {
  const b = bodyOf(src, 'boot');
  if (!b) return { steps: [], why: 'no function boot() in the file' };
  const sts = statementsIn(src, b.from, b.to, b.mask);
  const seen = new Map();
  const steps = sts.map(s => {
    const base = labelOf(s.text, s.mtext);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { step: n > 1 ? base + HASH + n : base, line: s.line };
  });
  return { steps, why: null };
}

export function readList(txt) {
  return txt.split(NL).map(x => x.trim()).filter(x => x && x[0] !== HASH);
}

// --- the leg ---------------------------------------------------------------------------------
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const MAIN = join(REPO, 'src', 'main.js');
  const src = readFileSync(MAIN, 'utf8');
  const got = stepsOf(src);
  if (got.why) { console.log('split-guard boot-order  CANNOT SEE: ' + got.why); process.exit(3); }
  const names = got.steps.map(s => s.step);
  if (names.some(n => n.endsWith(':?'))) {
    for (const s of got.steps) if (s.step.endsWith(':?')) console.log('  FAIL  main.js:' + s.line + ' is a statement this scan cannot label: ' + s.step);
    console.log('split-guard boot-order  CANNOT SEE: ' + names.filter(n => n.endsWith(':?')).length + ' unlabelled statement(s)');
    process.exit(3);
  }

  if (process.argv.includes('--write')) {
    const head = [
      HASH + ' The declared boot order, board 330. One step per line, in the order boot() runs them.',
      HASH + ' A step is the callee path of a top-level statement of boot(), with ' + HASH + '2 where a callee',
      HASH + ' repeats and a shape tag where the statement is not a plain call. Regenerate with',
      HASH + '   node tools/split-guard/boot-order.mjs --write',
      HASH + ' and do that only when the order really changed, because the diff on this file is the',
      HASH + ' record that somebody meant it.',
      '',
    ];
    writeFileSync(LIST, head.concat(names).join(NL) + NL);
    console.log('split-guard boot-order  wrote ' + names.length + ' step(s) to ' + LIST);
    process.exit(0);
  }

  if (!existsSync(LIST)) { console.log('split-guard boot-order  CANNOT SEE: no boot-order.list'); process.exit(3); }
  const want = readList(readFileSync(LIST, 'utf8'));
  console.log('split-guard boot-order  ' + names.length + ' top-level statement(s) in boot(), ' + want.length + ' declared');

  let failed = 0;
  const n = Math.max(names.length, want.length);
  let first = -1;
  for (let i = 0; i < n; i++) if (names[i] !== want[i]) { first = i; break; }
  if (first >= 0) {
    const line = got.steps[first] ? ' (main.js:' + got.steps[first].line + ')' : '';
    console.log('  FAIL  step ' + (first + 1) + ' is ' + (names[first] || '(nothing, boot ends)') + line
      + ' and the list declares ' + (want[first] || '(nothing, the list ends)'));
    failed++;
    const added = names.filter(x => want.indexOf(x) < 0);
    const gone = want.filter(x => names.indexOf(x) < 0);
    if (added.length) console.log('        in boot() and not in the list: ' + added.join(' '));
    if (gone.length) console.log('        in the list and not in boot(): ' + gone.join(' '));
    if (!added.length && !gone.length) console.log('        the same steps in a different order, which is the case a set comparison would pass');
    console.log('        If the change was meant: node tools/split-guard/boot-order.mjs --write, and say why in the commit.');
  } else {
    console.log('  ok    boot() runs the declared steps in the declared order, ' + names.length + ' of ' + names.length);
  }

  // The valve is filled before anything can call through it, and that is an ordering fact like
  // any other, so it is checked here rather than nowhere.
  if (names[0].indexOf('hookSlots.wireHooks(') !== 0) {
    console.log('  FAIL  the first statement of boot() is ' + names[0] + ', not wireHooks; a slot could be called before it is filled');
    failed++;
  } else {
    console.log('  ok    wireHooks is the first statement of boot()');
  }

  process.exit(failed ? 1 : 0);
}
