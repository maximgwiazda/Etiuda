// The cycle gate is proved by watching it reject, and just as hard by watching it accept.
//
// The accepting cases are not padding here. A cycle is legal, and the measured facts say two
// common shapes of cycle are correct at load: one crossing only on function declarations, and
// one used only after load. A gate that failed those would be turned off within a day, which
// is a worse outcome than not having it.
//
//   node tools/split-guard/cycles-selftest.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { importGraph, cycles, biteTest } from './cycles.mjs';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const root = mkdtempSync(join(tmpdir(), 'cycles-selftest-'));
const tree = (id, files) => {
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  for (const [n, b] of Object.entries(files)) writeFileSync(join(dir, n), b);
  return join(dir, 'main.js');
};

// ---------------------------------------------------------------------------------------
// 1. The control. No cycle, nothing to report, and the tree loads.
const acyclic = tree('acyclic', {
  'b.js': 'export const B = "B";\n',
  'a.js': 'import { B } from "./b.js";\nexport const A = "A+" + B;\n',
  'main.js': 'import { A } from "./a.js";\nglobalThis.OUT = A;\n',
});
{
  const g = await importGraph({ entry: acyclic });
  check('1 the acyclic control has three modules and no cycle',
    g.size === 3 && cycles(g).length === 0, `modules=${g.size} cycles=${cycles(g).length}`);
  check('2 and it loads clean, so the bite test agrees', biteTest({ entry: acyclic }).verdict === 'CLEAN');
}

// ---------------------------------------------------------------------------------------
// 2. The fault this gate exists for: a value read across a cycle during evaluation.
const biting = tree('biting', {
  'a.js': 'import { B } from "./b.js";\nexport const A = "A";\nglobalThis.OUT = B;\n',
  'b.js': 'import { A } from "./a.js";\nexport const B = "B(" + A + ")";\n',
  'main.js': 'import "./a.js";\n',
});
{
  const g = await importGraph({ entry: biting });
  const c = cycles(g);
  check('3 the cycle is found in the graph', c.length === 1 && c[0].length === 2,
    JSON.stringify(c.map(x => x.length)));
  const b = biteTest({ entry: biting });
  check('4 and the bite test rejects it', b.verdict === 'BITES', b.verdict);
  check('5 naming the binding that was read too early', b.binding === 'A', b.binding);
}

// ---------------------------------------------------------------------------------------
// 3. Must ACCEPT: a cycle crossing only on function declarations, called at load both ways.
// Measured correct, output "b(a)". A gate that failed this would be noise.
const fnCycle = tree('fn-cycle', {
  'a.js': 'import { b } from "./b.js";\nexport function a(){ return "a"; }\nglobalThis.OUT = b();\n',
  'b.js': 'import { a } from "./a.js";\nexport function b(){ return "b(" + a() + ")"; }\n',
  'main.js': 'import "./a.js";\n',
});
{
  const g = await importGraph({ entry: fnCycle });
  check('6 a function-only cycle is still reported in the graph', cycles(g).length === 1);
  check('7 but the bite test accepts it, because it is correct at load',
    biteTest({ entry: fnCycle }).verdict === 'CLEAN');
}

// ---------------------------------------------------------------------------------------
// 4. Must ACCEPT: a cycle touched only after load.
const deferred = tree('deferred', {
  'a.js': 'import { b } from "./b.js";\nexport function a(){ return "a"; }\nexport function go(){ return b(); }\n',
  'b.js': 'import { a } from "./a.js";\nexport function b(){ return "b(" + a() + ")"; }\n',
  'main.js': 'import { go } from "./a.js";\nglobalThis.LATER = go;\n',
});
{
  check('8 a cycle used only after load is reported', cycles(await importGraph({ entry: deferred })).length === 1);
  check('9 and accepted', biteTest({ entry: deferred }).verdict === 'CLEAN');
}

// ---------------------------------------------------------------------------------------
// 5. A three-module cycle, to prove the component is found whole rather than as a pair.
const three = tree('three', {
  'a.js': 'import { C } from "./c.js";\nexport const A = "A";\nglobalThis.OUT = C;\n',
  'b.js': 'import { A } from "./a.js";\nexport const B = "B(" + A + ")";\n',
  'c.js': 'import { B } from "./b.js";\nexport const C = "C(" + B + ")";\n',
  'main.js': 'import "./a.js";\n',
});
{
  const c = cycles(await importGraph({ entry: three }));
  check('10 a three-module cycle is one component of three, not three of two',
    c.length === 1 && c[0].length === 3, JSON.stringify(c.map(x => x.length)));
  check('11 and it is rejected', biteTest({ entry: three }).verdict === 'BITES');
}

// ---------------------------------------------------------------------------------------
// 6. A cycle hidden behind a re-export, which is the shape that looks innocent in review.
const reexport = tree('reexport', {
  'a.js': 'export { B } from "./b.js";\nexport const A = "A";\n',
  'b.js': 'import { A } from "./a.js";\nexport const B = "B(" + A + ")";\n',
  'main.js': 'import { B } from "./a.js";\nglobalThis.OUT = B;\n',
});
{
  check('12 a cycle through a re-export is still in the graph',
    cycles(await importGraph({ entry: reexport })).length === 1);
  check('13 and still rejected', biteTest({ entry: reexport }).verdict === 'BITES');
}

// ---------------------------------------------------------------------------------------
// 7. The verdict that matters most for honesty: a tree node cannot load for a reason that is
// not a cycle must come back UNKNOWN, never CLEAN. This is the early-victory case.
const undomable = tree('needs-dom', {
  'a.js': 'export const A = document.title;\n',
  'main.js': 'import { A } from "./a.js";\nglobalThis.OUT = A;\n',
});
{
  const b = biteTest({ entry: undomable });
  check('14 a tree that will not load raw is UNKNOWN, not CLEAN', b.verdict === 'UNKNOWN', b.verdict);
  check('15 and it says why, in terms a reader can act on',
    /document is not defined/.test(b.detail || ''), (b.detail || '').slice(0, 60));
}

// ---------------------------------------------------------------------------------------
// 8. The self-import, which Tarjan drops unless it is asked for. The first fixture written
// here was invalid and esbuild said so: a module importing a name from itself always collides
// with its own declaration of that name, and is refused at build time. That is worth a check
// of its own, because it means one shape of this fault is already loud. The bare form is the
// one that builds, and it is the one the self-loop branch exists for.
const selfBare = tree('self-bare', { 'main.js': 'import "./main.js";\nglobalThis.OUT = 1;\n' });
{
  const g = await importGraph({ entry: selfBare });
  const c = cycles(g);
  check('16 a bare self-import builds, and counts as a cycle of one',
    c.length === 1 && c[0].length === 1, JSON.stringify(c.map(x => x.length)));
}
const selfNamed = tree('self-named', {
  'main.js': 'import { X } from "./main.js";\nexport const X = 1;\nglobalThis.OUT = X;\n',
});
{
  let refused = null;
  try { await importGraph({ entry: selfNamed }); }
  catch (e) { refused = String(e.message); }
  check('17 a self-import that binds a name is refused at build, so that shape is already loud',
    refused !== null && /already been declared/.test(refused),
    (refused || 'built, which it should not have').split('\n').pop().slice(0, 70));
}

rmSync(root, { recursive: true, force: true });
console.log('  ' + pass + '/' + (pass + fail) + ' checks passed' + (fail ? '  - ' + fail + ' FAILED' : ''));
process.exitCode = fail;
