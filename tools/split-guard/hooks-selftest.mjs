// Self-test for hooks-guard.mjs. Board 341.
//
// A gate that has never rejected anything has not been tested, it has been written. Every case
// below is either something the scan must SEE or something it must refuse to be fooled by, and
// the ones marked (grep) are where this scanner and a plain `grep -o "hooks\.[a-z]*"` give
// different answers - which is the whole reason the scanner exists.
//
//   node tools/split-guard/hooks-selftest.mjs
import {
  slotsOf, wiredIn, lookupsOf, importOfHooks, namespaceImports, exportedNames, importCount,
} from './hooks-guard.mjs';

const NL = String.fromCharCode(10);
const Q = String.fromCharCode(34);
let pass = 0, fail = 0;

function is(what, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + what + '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
}

// --- SLOTS ---------------------------------------------------------------------------------
const S = src => slotsOf(src).slots;

is('a plain slot list is read',
  S('const SLOTS = [' + NL + '  ' + Q + 'a' + Q + ',' + NL + '  ' + Q + 'b' + Q + ',' + NL + '];'),
  ['a', 'b']);
is('a quoted word inside a comment in the array is not a slot (grep: it is)',
  S('const SLOTS = [' + NL + '  // ' + Q + 'ghost' + Q + NL + '  ' + Q + 'a' + Q + ',' + NL + '];'),
  ['a']);
is('a block comment inside the array is not a slot',
  S('const SLOTS = [' + NL + '  /* ' + Q + 'ghost' + Q + ' */' + NL + '  ' + Q + 'a' + Q + ',' + NL + '];'),
  ['a']);
is('single quotes are slots too', S("const SLOTS = ['a','b'];"), ['a', 'b']);
is('a bracket inside a slot name does not end the array early',
  S('const SLOTS = [' + Q + 'a]b' + Q + ',' + Q + 'c' + Q + '];'), ['a]b', 'c']);
is('no SLOTS declaration is a reason, not an empty list',
  slotsOf('const OTHER = [];').why, 'no `const SLOTS` declaration');
is('an unclosed array is a reason', slotsOf('const SLOTS = [' + Q + 'a' + Q + ',').why,
  'the SLOTS array is not closed');

// --- the wireHooks literal ------------------------------------------------------------------
const W = src => wiredIn(src).pairs.map(p => p.key + '=' + p.value);

is('a flat literal is read',
  W('wireHooks({ a: x.a, b: y.b });'), ['a=x.a', 'b=y.b']);
is('a trailing comma is not a key', W('wireHooks({ a: x.a, });'), ['a=x.a']);
is('shorthand is a key filled from itself', W('wireHooks({ a, b: y.b });'), ['a=a', 'b=y.b']);
is('a key on its own line is read, and a comment between entries is not a key',
  W('wireHooks({' + NL + '  // the first one' + NL + '  a: x.a,' + NL + '  b: y.b,' + NL + '});'),
  ['a=x.a', 'b=y.b']);
is('a nested object value does not contribute its own keys (grep: it does)',
  W('wireHooks({ a: x.a, b: { inner: 1 }, c: y.c });'), ['a=x.a', 'b={ inner: 1 }', 'c=y.c']);
is('an arrow value is one value and contributes no keys of its own (found by this self-test: the'
  + ' first cut read x.a(evt) as a further key called x)',
  W('wireHooks({ a: (evt, how) => x.a(evt), b: y.b });'), ['a=(evt, how) => x.a(evt)', 'b=y.b']);
is('a wireHooks( inside a comment is not the call (grep: it is)',
  W('// wireHooks({ ghost: 1 });' + NL + 'wireHooks({ a: x.a });'), ['a=x.a']);
is('no call at all is a reason', wiredIn('const a = 1;').why, 'no wireHooks( call');
is('a call with no object literal is a reason',
  wiredIn('wireHooks(map);').why, 'wireHooks is not called with an object literal');

// --- hooks.X lookups -------------------------------------------------------------------------
const L = (src, local) => lookupsOf(src, local || 'hooks').names.map(n => n.name + '@' + n.line);
const C = src => lookupsOf(src, 'hooks').computed.map(c => c.line);

is('a plain call is a lookup', L('hooks.render();'), ['render@1']);
is('two on one line are two lookups', L('hooks.a(); hooks.b();'), ['a@1', 'b@1']);
is('a lookup in a comment is text (grep: a hit)', L('// hooks.ghost();' + NL + 'hooks.a();'), ['a@2']);
is('a lookup in a string is text (grep: a hit)',
  L('const s = ' + Q + 'hooks.ghost()' + Q + ';' + NL + 'hooks.a();'), ['a@2']);
is('a lookup in a template literal is text',
  L('const s = `hooks.ghost()`;' + NL + 'hooks.a();'), ['a@2']);
is('myhooks.render is a different name (grep: a hit)', L('myhooks.render();'), []);
is('a.hooks.render is a property of something else (grep: a hit)', L('a.hooks.render();'), []);
is('hooksLike.render is a different name', L('hooksLike.render();'), []);
is('the import statement itself is not a lookup',
  L('import { hooks } from ' + Q + './hooks.js' + Q + ';' + NL + 'hooks.a();'), ['a@2']);
is('a line break between the name and the dot is still a lookup',
  L('hooks' + NL + '  .render();'), ['render@1']);
is('a string key is a lookup this scan can resolve', L('hooks[' + Q + 'render' + Q + ']();'), ['render@1']);
is('a computed key is not resolvable and is reported as such', L('hooks[k]();'), []);
is('and it is reported on its line', C('const a = 1;' + NL + 'hooks[k]();'), [2]);
is('an alias is read when the alias is what was bound', L('hx.render();', 'hx'), ['render@1']);
is('and the word hooks is then NOT a lookup, which is the blindness this argument avoids',
  L('hooks.render();', 'hx'), []);

// --- the import clause ------------------------------------------------------------------------
const I = src => { const r = importOfHooks(src); return r.kind + ':' + r.local; };

is('a named import binds hooks', I('import { hooks } from ' + Q + './hooks.js' + Q + ';'), 'named:hooks');
is('an aliased import binds the alias',
  I('import { hooks as hx } from ' + Q + './hooks.js' + Q + ';'), 'named:hx');
is('hooks among others is still found',
  I('import { wireHooks, hooks } from ' + Q + './hooks.js' + Q + ';'), 'named:hooks');
is('a namespace import is a different kind',
  I('import * as hookSlots from ' + Q + './modules/hooks.js' + Q + ';'), 'namespace:hookSlots');
is('importing something else from hooks.js binds no hooks',
  I('import { wireHooks } from ' + Q + './hooks.js' + Q + ';'), 'named-other:null');
is('a file that does not import hooks.js at all', I('const a = 1;'), 'null:null');

is('namespace imports map the local name to the specifier',
  [...namespaceImports('import * as shed from ' + Q + './modules/shed.js' + Q + ';').entries()],
  [['shed', './modules/shed.js']]);

// --- exports ----------------------------------------------------------------------------------
const X = src => [...exportedNames(src)].sort();

is('an export block', X('export { a, b };'), ['a', 'b']);
is('an export block with an alias exports the alias',
  X('export { inner as outer };'), ['outer']);
is('a multi-line export block', X('export {' + NL + '  a,' + NL + '  b,' + NL + '};'), ['a', 'b']);
is('export function', X('export function go(){}'), ['go']);
is('export const', X('export const N = 1;'), ['N']);
is('export class', X('export class K {}'), ['K']);
is('a name only declared is not exported (grep for the word: it is)',
  X('function hidden(){}' + NL + 'export { shown };'), ['shown']);
is('the word export inside a comment exports nothing',
  X('// export { ghost };' + NL + 'export { a };'), ['a']);

is('a file with no import has none', importCount('const a = 1;'), 0);
is('two imports count two',
  importCount('import a from ' + Q + 'x' + Q + ';' + NL + 'import b from ' + Q + 'y' + Q + ';'), 2);
is('an import word inside a comment is not an import (it is not at column 0 of a line that starts with import)',
  importCount(' // import a from x' + NL), 0);

console.log('split-guard hooks-selftest  ' + pass + '/' + (pass + fail) + (fail ? '  ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
