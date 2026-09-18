// Self-test for cycle-bounds.mjs. Board 318.
//
// A gate that has never rejected anything has not been tested, it has been written. Every case
// below is a thing the leg must REFUSE or a thing it must let through, and the ones marked
// (line rule) are where this rule and a column-0 line rule give different answers; they are the
// defence of the rule rather than decoration.
//
//   node tools/split-guard/cycle-bounds-selftest.mjs
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bareStatements, importsOf, loadTimeReads, evaluatedIdentifiers, membershipDelta, treeAt,
} from './cycle-bounds.mjs';
import { cycles } from './cycles.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(HERE, '..', '..', 'src', 'modules');
let pass = 0, fail = 0;

function is(what, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + what + '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
}

// --- A1: what runs at a module top level -------------------------------------------------
const bare = src => bareStatements(src).findings.map(f => f.line);

is('a declaration is not executable', bare('const a=1;\n'), []);
is('a call is executable', bare('foo();\n'), [1]);
is('an INDENTED call is executable (line rule: invisible, it is at no column 0)',
  bare('const a=1;\n  foo();\n'), [2]);
is('letters=1 is an assignment, not a let (line rule: begins with let)',
  bare('letters=1;\n'), [1]);
is('constFoo() is a call, not a const (line rule: begins with const)',
  bare('constFoo();\n'), [1]);
is('an IIFE is executable (line rule: first character is not a letter)',
  bare('(function(){ go(); })();\n'), [1]);
is('a bang-IIFE is executable (line rule: first character is not a letter)',
  bare('!function(){ go(); }();\n'), [1]);
is('try at column 0 is executable', bare('try{\n x();\n}catch(e){}\n'), [1]);
is('a closer is not a statement (two rules once differed by 249 lines here)',
  bare('const o = {\n  a: 1\n};\n'), []);
is('a function declaration is not executable, and its body is not top level',
  bare('function f(){\n  go();\n}\n'), []);
is('a call inside a template literal is text (raw grep: three such lines in one file)',
  bare('const T = `\nfoo();\n`;\n'), []);
is('a call inside a comment is text', bare('// foo();\n/* bar(); */\n'), []);
is('a brace and a semicolon inside a string are text', bare('const s = "};foo();";\n'), []);
is('a brace inside a regex literal is text', bare('const r = /[{]/;\nconst q = 1;\n'), []);
is('async function is a declaration', bare('async function f(){ await go(); }\n'), []);
is('asyncThing() is a call (line rule: begins with async)', bare('asyncThing();\n'), [1]);
is('await at top level is executable', bare('await go();\n'), [1]);
is('export const is a declaration', bare('export const a=1;\n'), []);
is('an export block is a declaration', bare('export { a, b };\n'), []);
is('export default function is a declaration', bare('export default function f(){}\n'), []);
is('export default of a call runs at load', bare('export default go();\n'), [1]);
is('ASI: a call on the next line is its own statement', bare('const a=1\nfoo()\n'), [2]);
is('a continued expression is one statement', bare('const a = 1 +\n  2;\n'), []);
is('a chained call over two lines is one statement', bare('const a = b\n  .c();\n'), []);
is('an empty statement is not a finding', bare(';\n;;\n'), []);
is('the scan reaches depth zero on a real module head',
  bareStatements('import { a } from "./x.js";\nexport function f(){ return a; }\n').unreadable, false);

// --- A2: what a top level READS ----------------------------------------------------------
const M = resolve(DIR, 'm.js');
const reads = src => loadTimeReads(src, importsOf(src, DIR)).map(h => h.name + '@' + h.line);

is('a top-level read of an imported binding is a load-time read',
  reads('import { E } from "./m.js";\nconst X = E;\n'), ['E@2']);
is('the same read inside an arrow body is not',
  reads('import { E } from "./m.js";\nconst f = () => E;\n'), []);
is('the same read inside a function body is not',
  reads('import { E } from "./m.js";\nfunction g(){ return E; }\n'), []);
is('the same read inside an arrow BLOCK body is not',
  reads('import { E } from "./m.js";\nconst f = (a) => { return E; };\n'), []);
is('the same read inside a method shorthand is not',
  reads('import { E } from "./m.js";\nconst o = { m(){ return E; } };\n'), []);
is('a body that is CALLED where it stands does run at load',
  reads('import { E } from "./m.js";\nconst X = (function(){ return E; })();\n'), ['E@2']);
is('an arrow that is called where it stands does run at load',
  reads('import { E } from "./m.js";\nconst X = (() => E)();\n'), ['E@2']);
is('a renamed import is read under its local name',
  reads('import { E as F } from "./m.js";\nconst X = F;\n'), ['F@2']);
is('a namespace import read at load is a read',
  reads('import * as ns from "./m.js";\nconst X = ns.thing;\n'), ['ns@2']);
is('a property that shares the name is not the binding',
  reads('import { E } from "./m.js";\nconst X = obj.E;\n'), []);
is('an object key that shares the name is not the binding',
  reads('import { E } from "./m.js";\nconst X = { E: 1 };\n'), []);
is('the object shorthand IS the binding',
  reads('import { E } from "./m.js";\nconst X = { E };\n'), ['E@2']);
is('a call of an imported function at load is a read',
  reads('import { make } from "./m.js";\nconst X = make();\n'), ['make@2']);
is('an import over several lines still binds (a start-of-line rule missed four in the tree)',
  reads('import {\n  A,\n  B\n} from "./m.js";\nconst X = B;\n'), ['B@5']);
is('a bare import binds nothing', [...importsOf('import "./m.js";\n', DIR).keys()], []);
is('a default import binds its own name',
  reads('import D from "./m.js";\nconst X = D;\n'), ['D@2']);
is('the import statement itself is not a read',
  reads('import { E } from "./m.js";\n'), []);
is('a function declaration that closes over the name is not a read',
  reads('import { E } from "./m.js";\nexport function f(){ return E(); }\n'), []);
is('importsOf resolves the specifier to a path',
  importsOf('import { E } from "./m.js";\n', DIR).get('E'), M);
is('an identifier in a nested arrow is not evaluated',
  reads('import { E } from "./m.js";\nconst f = () => { const g = () => E; return g; };\n'), []);
// The collector is deliberately raw - keywords included, filtered by NOT_A_READ one layer up -
// so that a name it cannot place is kept rather than dropped.
is('evaluatedIdentifiers drops the dotted property but keeps the object and the keyword',
  [...evaluatedIdentifiers('const X = win.E + Y;')].sort(), ['X', 'Y', 'const', 'win']);
is('and the keyword never reaches a finding',
  reads('import { E } from "./m.js";\nconst E2 = 1;\n'), []);

// --- bound 2: two components are two, and the leg reads that from the same Tarjan ---------
const twoComponents = new Map([
  ['a.js', ['b.js']], ['b.js', ['a.js']],
  ['c.js', ['d.js']], ['d.js', ['c.js']],
  ['e.js', ['a.js', 'c.js']],
]);
is('Tarjan finds both components', cycles(twoComponents).map(c => c.length).sort(), [2, 2]);
is('a tree with no cycle has none', cycles(new Map([['a.js', ['b.js']], ['b.js', []]])).length, 0);

// --- bound 3: the delta, and the baseline it needs ----------------------------------------
is('a jump of ten is a jump of ten',
  membershipDelta(['a', 'b'], ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']).delta, 10);
is('and it names who joined',
  membershipDelta(['a', 'b'], ['a', 'b', 'c']).joined, ['c']);
is('and who left', membershipDelta(['a', 'b'], ['a']).left, ['b']);
is('no movement is zero', membershipDelta(['a', 'b'], ['b', 'a']).delta, 0);

const good = treeAt('HEAD');
is('a baseline tree materialises from git', good.dir !== null && good.files > 10, true);
if (good.dir) (await import('node:fs')).rmSync(good.dir, { recursive: true, force: true });
is('a baseline that is not a revision is refused rather than assumed clean',
  treeAt('no-such-rev-318').dir, null);

/* THE GATE'S OWN COUNTS, board item 529. This selftest prints one line whatever it did, so
   the record read it as `lines: 1` and a run that checked nothing looked like a run that
   checked them all. Before the last line, which tools/gate-run.mjs takes as the verdict;
   `ok` and `fail` are that runner's reserved words, hence `cases` and `failed`. */
console.log('#counts cases=' + (pass + fail) + ' failed=' + fail);
console.log('cycle-bounds selftest  ' + pass + '/' + (pass + fail) + (fail ? '  ' + fail + ' FAILED' : ''));
process.exitCode = fail ? 1 : 0;
