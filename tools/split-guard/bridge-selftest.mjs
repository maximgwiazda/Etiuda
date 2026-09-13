// The bridge guard is proved by watching it reject, not by reading it. A gate that has never
// rejected anything has not been tested, it has been written.
//
// Each case builds a two-module tree with its own entry in a temporary folder, runs the guard
// over it, and says what the guard must conclude. The sound tree must come back clean; every
// broken tree must be named exactly, and the two shapes measured in the engine on 2026-09-13 -
// a deleted `columns` accessor and a deleted `shortcuts` accessor - are cases 3 and 4 in the
// small.
//
// The masker gets its own cases, because it is the one piece here that has already cost this
// harness a whole reading twice: a regex holding a quote, and an apostrophe in prose.
//
//   node tools/split-guard/bridge-selftest.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { bridge, mask, deferredWrites, moduleExports, readEntry } from './bridge.mjs';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const root = mkdtempSync(join(tmpdir(), 'bridge-guard-'));
const CLI = join(dirname(fileURLToPath(import.meta.url)), 'bridge.mjs');

// A module whose two exports are of the two kinds that matter: `SAFE` is settled at the top
// level and never touched again, `LIVE` is replaced inside a function, which is the shape
// `scMap={}` inside `loadShortcuts` has.
const LIVE = `let LIVE = null;
const SAFE = 41;
function arm(){ LIVE = { a: 1 }; }
export { LIVE, SAFE, arm };
`;
const QUIET = `const QUIET = 7;
function ask(){ return QUIET; }
export { QUIET, ask };
`;
const ACC = n => 'Object.defineProperty(globalThis, "' + n + '", { get: () => live.' + n + ' });\n';
const ENTRY = accessors => `import * as live from "./live.js";
import * as quiet from "./quiet.js";
Object.assign(globalThis, live, quiet);
` + accessors;

function tree(label, files) {
  const dir = join(root, label), modules = join(dir, 'modules');
  mkdirSync(modules, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    if (name === 'main.js') writeFileSync(join(dir, name), body);
    else writeFileSync(join(modules, name), body);
  }
  return { entry: join(dir, 'main.js'), modulesDir: modules };
}
const run = t => bridge(t);
const names = r => r.findings.filter(f => f.verdict === 'fail').map(f => f.name).sort().join(',');

// ---------------------------------------------------------------------------------------
// 1. The sound tree. If this is not clean the guard is noise and nothing below means anything.
const sound = tree('sound', { 'live.js': LIVE, 'quiet.js': QUIET, 'main.js': ENTRY(ACC('LIVE')) });
{
  const r = run(sound);
  check('1 a sound bridge passes', r.failures === 0, 'failures=' + r.failures + ' ' + names(r));
  check('2 and it derives the requirement rather than counting accessors',
    r.needed === 1 && r.exports === 5 && r.accessors === 1,
    'needed=' + r.needed + ' exports=' + r.exports + ' accessors=' + r.accessors);
  check('3 with no note, so a clean tree is silent', r.notes === 0, 'notes=' + r.notes);
}

// 2. The measured failure, in the small: the accessor deleted and nothing else changed. This
// is the `columns` case of 2026-09-13 h and the `shortcuts` case of i.
{
  const r = run(tree('deleted', { 'live.js': LIVE, 'quiet.js': QUIET, 'main.js': ENTRY('') }));
  check('4 a deleted accessor is one failure, named', r.failures === 1 && names(r) === 'LIVE',
    'failures=' + r.failures + ' ' + names(r));
  check('5 and the finding points at the write site',
    /modules\/live\.js:3/.test(r.findings[0].why), r.findings[0].why);
}

// 3. The point of deriving rather than listing: a name nobody has ever written down starts
// being reassigned, and the gate asks for it the same day.
{
  const NEW = LIVE.replace('export {', 'let FRESH = 0;\nfunction bump(){ FRESH++; }\nexport { FRESH, bump,');
  const r = run(tree('fresh', { 'live.js': NEW, 'quiet.js': QUIET, 'main.js': ENTRY(ACC('LIVE')) }));
  check('6 a newly reassigned export is demanded without being listed anywhere',
    r.failures === 1 && names(r) === 'FRESH', 'failures=' + r.failures + ' ' + names(r));
}

// 4. And the release direction, so the rule is a rule in both directions: a name that stops
// being reassigned stops being required, and its accessor becomes a note rather than a pass.
{
  const STILL = LIVE.replace('function arm(){ LIVE = { a: 1 }; }', 'function arm(){ return LIVE; }');
  const r = run(tree('still', { 'live.js': STILL, 'quiet.js': QUIET, 'main.js': ENTRY(ACC('LIVE')) }));
  check('7 a name that stopped changing is released, with a note', r.failures === 0 && r.notes === 1,
    'failures=' + r.failures + ' notes=' + r.notes);
}

// 5. An accessor that exists and names nothing. Deleting the line is the loud way to break the
// bridge; a typo is the quiet one, and it reads as thirteen accessors either way.
{
  const r = run(tree('typo', { 'live.js': LIVE, 'quiet.js': QUIET,
    'main.js': ENTRY('Object.defineProperty(globalThis, "LIVE", { get: () => live.LIVEX });\n') }));
  check('8 an accessor reading a name the module does not export is one failure',
    r.failures === 1 && names(r) === 'LIVE', 'failures=' + r.failures + ' ' + names(r));
}
{
  const r = run(tree('wrongns', { 'live.js': LIVE, 'quiet.js': QUIET,
    'main.js': ENTRY('Object.defineProperty(globalThis, "LIVE", { get: () => quiet.LIVE });\n') }));
  check('9 an accessor reading the wrong module is one failure',
    r.failures === 1 && names(r) === 'LIVE', 'failures=' + r.failures + ' ' + names(r));
}
{
  const r = run(tree('unimported', { 'live.js': LIVE, 'quiet.js': QUIET,
    'main.js': ENTRY('Object.defineProperty(globalThis, "LIVE", { get: () => gone.LIVE });\n') }));
  check('10 an accessor reading a namespace the entry does not import is one failure',
    r.failures === 1, 'failures=' + r.failures + ' ' + names(r));
}
{
  const r = run(tree('renamed', { 'live.js': LIVE, 'quiet.js': QUIET,
    'main.js': ENTRY('Object.defineProperty(globalThis, "LIVELY", { get: () => live.LIVE });\n') }));
  check('11 an accessor binding one name to another is a failure, and LIVE is still unbridged',
    r.failures === 2, 'failures=' + r.failures + ' ' + names(r));
}

// 6. One edit must not be two numbers in the exit code. A broken accessor is also a missing
// one, and a gate that counts it twice cannot be read as a count of faults.
{
  const r = run(tree('once', { 'live.js': LIVE, 'quiet.js': QUIET,
    'main.js': ENTRY('Object.defineProperty(globalThis, "LIVE", { get: () => live.LIVEX });\n') }));
  check('12 one unsound accessor is one failure, not two', r.failures === 1, 'failures=' + r.failures);
}

// 7. A module imported and never spread reaches the monolith with none of its names.
{
  const r = run(tree('unspread', { 'live.js': LIVE, 'quiet.js': QUIET,
    'main.js': `import * as live from "./live.js";
import * as quiet from "./quiet.js";
Object.assign(globalThis, live);
` + ACC('LIVE') }));
  check('13 a module imported and not spread is a note naming it',
    r.notes === 1 && r.findings.some(f => f.verdict === 'note' && f.name === 'quiet'),
    'notes=' + r.notes + ' ' + JSON.stringify(r.findings.map(f => f.name)));
}

// 8. The other write forms. `scReady=true` is an assignment; a counter is not, and a gate that
// only knows `=` would pass a module that increments its own export for ever.
{
  const INC = `let TICK = 0;
function beat(){ TICK++; }
export { TICK, beat };
`;
  const r = run(tree('inc', { 'live.js': INC, 'quiet.js': QUIET, 'main.js': ENTRY('') }));
  check('14 a post-increment below the top level needs a live binding', names(r) === 'TICK', names(r));
}
{
  const DEC = `let TICK = 0;
function beat(){ --TICK; }
export { TICK, beat };
`;
  const r = run(tree('dec', { 'live.js': DEC, 'quiet.js': QUIET, 'main.js': ENTRY('') }));
  check('15 and a pre-decrement', names(r) === 'TICK', names(r));
}
{
  const CMP = `let TICK = 0;
function beat(){ TICK += 1; }
export { TICK, beat };
`;
  const r = run(tree('cmp', { 'live.js': CMP, 'quiet.js': QUIET, 'main.js': ENTRY('') }));
  check('16 and a compound assignment', names(r) === 'TICK', names(r));
}
{
  const DES = `let A = 0, B = 0;
function beat(o){ [A, B] = o; }
export { A, B, beat };
`;
  const r = run(tree('des', { 'live.js': DES, 'quiet.js': QUIET, 'main.js': ENTRY('') }));
  check('17 and a destructuring target, which names no operator at all',
    names(r) === 'A,B', names(r));
}

// 9. What must NOT fire, because a gate with false alarms is a gate somebody turns off.
{
  const SHADOW = `const SAFE = 1;
function f(){ let SAFE2 = 0; SAFE2 = 2; return SAFE + SAFE2; }
function g(o){ o.SAFE = 9; return o["SAFE"]; }
function h(){ return SAFE === 1; }
export { SAFE, f, g, h };
`;
  const r = run(tree('quiet2', { 'live.js': SHADOW, 'quiet.js': QUIET, 'main.js': ENTRY('') }));
  check('18 a property write, an equality test and a different local name are not writes',
    r.needed === 0 && r.failures === 0, 'needed=' + r.needed + ' ' + names(r));
}
{
  const TOP = `let SETTLED = 0;
SETTLED = 3;
function read(){ return SETTLED; }
export { SETTLED, read };
`;
  const r = run(tree('top', { 'live.js': TOP, 'quiet.js': QUIET, 'main.js': ENTRY('') }));
  check('19 a write at the module top level needs nothing: the copy is taken after it',
    r.needed === 0 && r.failures === 0, 'needed=' + r.needed + ' ' + names(r));
}
{
  const IDX = `const KEY = "k";
const bag = {};
function put(){ bag[KEY] = 1; }
export { KEY, put };
`;
  const r = run(tree('idx', { 'live.js': IDX, 'quiet.js': QUIET, 'main.js': ENTRY('') }));
  check('20 an index write does not read as a destructuring pattern', r.needed === 0,
    'needed=' + r.needed + ' ' + names(r));
}

// 10. The masker, on the two shapes that have already cost this harness a reading.
{
  const m = mask('const re = /[\'"]/;\nlet X = 0;\nfunction f(){ X = 1; }\n');
  check('21 a regex holding a quote does not run the masker away',
    m.includes('X = 1'), JSON.stringify(m.split('\n')[2]));
}
{
  const src = "/* it's a comment */\nlet X = 0;\nfunction f(){ X = 1; }\n";
  const names2 = new Set(['X']);
  check('22 an apostrophe in prose is not a string opener',
    deferredWrites(src, names2).has('X'), JSON.stringify([...deferredWrites(src, names2).keys()]));
}
{
  const src = 'let X = 0;\nfunction f(){ const s = "X = 1"; return s; }\n';
  check('23 a write inside a string literal is not a write',
    deferredWrites(src, new Set(['X'])).size === 0);
}
{
  const src = 'let X = 0;\nfunction f(){ /* X = 1 */ return X; }\n';
  check('24 a write inside a comment is not a write',
    deferredWrites(src, new Set(['X'])).size === 0);
}

// 11. The readers, so a change of shape in the entry is caught here rather than by silence.
{
  const e = readEntry(ENTRY(ACC('LIVE')));
  check('25 the entry reader finds the namespaces, the spread and the accessor',
    e.imports.size === 2 && e.assigned.size === 2 && e.accessors.length === 1
    && e.accessors[0].global === 'LIVE' && e.accessors[0].ns === 'live',
    JSON.stringify({ i: [...e.imports.keys()], a: [...e.assigned], acc: e.accessors }));
  check('26 an export block is read by its names, aliases included',
    [...moduleExports('const a=1;\nexport {\n  a as b\n};\n')][0] === 'b');
}

// 12. The command line is where the number is read, and the exit code is the whole point.
{
  const cli = (t, ...extra) => spawnSync(process.execPath,
    [CLI, '--entry', t.entry, '--modules', t.modulesDir, ...extra], { encoding: 'utf8' });
  const ok = cli(sound);
  check('27 a sound tree exits 0', ok.status === 0, 'exit ' + ok.status);
  check('28 and its last line leads with the verdict, not with a count',
    /^\s*(FAIL|ok)\b/.test(ok.stdout.trim().split('\n').pop()),
    JSON.stringify(ok.stdout.trim().split('\n').pop()));

  const bad = cli(tree('cli-bad', { 'live.js': LIVE, 'quiet.js': QUIET, 'main.js': ENTRY('') }));
  check('29 one missing accessor exits 1', bad.status === 1, 'exit ' + bad.status);
  check('30 and the failing run leads its last line with FAIL',
    /^\s*FAIL\b/.test(bad.stdout.trim().split('\n').pop()),
    JSON.stringify(bad.stdout.trim().split('\n').pop()));

  const note = cli(tree('cli-note', { 'live.js': QUIET.replace(/QUIET/g, 'LIVE'), 'quiet.js': QUIET,
    'main.js': ENTRY(ACC('LIVE')) }));
  check('31 notes alone exit 0 and are printed rather than swallowed',
    note.status === 0 && /note/.test(note.stdout), 'exit ' + note.status);

  const missing = spawnSync(process.execPath, [CLI, '--entry', join(root, 'nope', 'main.js')],
    { encoding: 'utf8' });
  check('32 an unreadable input exits 78 and prints no tally',
    missing.status === 78 && !/bridge-guard/.test(missing.stdout), 'exit ' + missing.status);
}

// 13. The census is the gate's reach, 2026-09-13. It read the FIRST `export { }` block of a
// module and nothing else, so a name in a second block, or exported inline, was a name no rule
// here could require an accessor for. Measured on a lab copy of `88e3a1e`: `labStale`, written
// below the top level of `src/modules/env.js`, was a FAIL from the module's one block and exit
// 0 from a second block two lines later, with the tally rising 415 names to 416 as it went
// blind. These cases are that control in the small; each fails against the guard of `88e3a1e`.
{
  // `moduleExports` answers null for a module it can see no export in, which is the answer the
  // blind rule gave; the fallback keeps that a FAIL here rather than an exception that would
  // stop the run before the cases below it.
  const ex = t => moduleExports(t) || new Set();
  check('33 a name in a second export block is an export too',
    ex('let a=1;\nexport { a };\nlet b=2;\nexport { b };\n').has('b'),
    [...ex('let a=1;\nexport { a };\nlet b=2;\nexport { b };\n')].join(','));
  check('34 and so is one exported inline, every declarator of it',
    ['A', 'B', 'C'].every(n => ex('export const A=1, B=2;\nexport function C(){}\n').has(n)),
    [...ex('export const A=1, B=2;\nexport function C(){}\n')].join(','));
  check('35 while a declaration that is not exported is not an export',
    !ex('const D=1;\nexport const A=1;\n').has('D'),
    [...ex('const D=1;\nexport const A=1;\n')].join(','));

  const second = tree('second-block', {
    'live.js': LIVE.replace('export { LIVE, SAFE, arm };',
      'export { SAFE, arm };\nlet LATE = null;\nfunction arm2(){ LATE = 1; }\nexport { LIVE, LATE, arm2 };'),
    'quiet.js': QUIET,
    'main.js': ENTRY(ACC('LIVE')),
  });
  const r = bridge({ entry: second.entry, modulesDir: second.modulesDir });
  check('36 a deferred write to a name declared in a second export block is a failure',
    r.findings.some(f => f.name === 'LATE' && f.verdict === 'fail'),
    JSON.stringify(r.findings.map(f => f.name + ':' + f.verdict)));

  const inline = tree('inline-export', {
    'live.js': `export let EARLY = null, LATE = null;\nexport function arm(){ LATE = 1; }\n`,
    'quiet.js': QUIET,
    'main.js': ENTRY(''),
  });
  const r2 = bridge({ entry: inline.entry, modulesDir: inline.modulesDir });
  check('37 and so is one exported inline, with no export block in the module at all',
    r2.findings.some(f => f.name === 'LATE' && f.verdict === 'fail'),
    JSON.stringify(r2.findings.map(f => f.name + ':' + f.verdict)));
  check('38 while the sibling nothing writes is not required to have one',
    !r2.findings.some(f => f.name === 'EARLY' && f.verdict === 'fail'),
    JSON.stringify(r2.findings.map(f => f.name + ':' + f.verdict)));
}

rmSync(root, { recursive: true, force: true });
console.log('  ' + pass + '/' + (pass + fail) + ' checks passed' + (fail ? '  - ' + fail + ' FAILED' : ''));
process.exitCode = fail;
