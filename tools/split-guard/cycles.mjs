// Load-time cycles in the module tree. Board 182.
//
// THE HAZARD, measured on 2026-09-12 and recorded as conditions 9 to 16 of
// tools/bundler-probe/constraints.mjs so that it fails the day it goes away:
//
//   Two modules importing each other, one reading the other's `export const` during its own
//   evaluation. esbuild builds it, reports zero errors and zero warnings at every log level
//   from verbose down, the artifact runs without throwing, and the binding reads `undefined`.
//   The same three modules through node's own loader, unbundled, throw
//   `ReferenceError: Cannot access 'A' before initialization`.
//
// The mechanism is that bundling rewrites every top-level `const` to `var` - unconditionally,
// measured on a single module with no cycle - so the temporal dead zone that makes this loud
// in the language is not present in the artifact at all. `esm` and `cjs` output flatten it the
// same way, and so does the `__esm()` wrapper path, so there is no second build that can serve
// as the oracle. Detection has to happen on the graph, or on the tree before it is bundled.
//
// NOT EVERY CYCLE IS A FAULT, and a gate that said so would be a false-alarm machine on a
// component the map already measures at fifty-odd modules. A cycle crossing only on function
// declarations is correct at load in both directions, measured. A cycle used only from
// functions called after load is correct. What bites is a binding READ DURING THE IMPORTING
// MODULE'S OWN EVALUATION that is not a hoisted function declaration.
//
// So this tool reports two different things and only one of them fails the build:
//
//   node tools/split-guard/cycles.mjs --entry src/main.js
//
//   - the cycle map, from esbuild's metafile, which is the only channel that mentions a cycle
//     at all. Reported as notes. Cycles are legal.
//   - the bite test: the entry loaded UNBUNDLED through node's own module loader, where the
//     dead zone is still alive and the language does the detection for us. A temporal dead
//     zone error here is a real load-time cycle, named, and it fails.
//
// If the bite test cannot run - the tree wants a DOM, or imports CSS, or anything else node
// refuses - the result is UNKNOWN and the exit code is still non-zero. A gate that cannot see
// must not report a pass; that is the whole reason this seat exists.
import { existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as esbuild from 'esbuild';
import { OPTIONS } from '../bundler-probe/build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------
// The graph. esbuild's metafile lists both directions of a cycle, including through a
// re-export, which was measured; nothing else in the toolchain mentions one.
export async function importGraph({ entry }) {
  const r = await esbuild.build({
    ...OPTIONS,
    entryPoints: [entry],
    metafile: true,
    write: false,
    logLevel: 'silent',
    outdir: join(dirname(entry), '.split-guard-unused'),
  });
  const edges = new Map();
  for (const [file, info] of Object.entries(r.metafile.inputs)) {
    edges.set(file, info.imports.filter(i => i.external !== true && i.path).map(i => i.path));
  }
  // An import of something outside the graph (a bare package) has no entry of its own.
  for (const list of edges.values()) for (const p of list) if (!edges.has(p)) edges.set(p, []);
  return edges;
}

// Tarjan. Sixty modules, so the recursion is not the risk; the risk would be missing a
// component, which is why this is the standard algorithm and not a hand-rolled walk.
export function cycles(edges) {
  let index = 0;
  const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], found = [];

  const strongconnect = v => {
    idx.set(v, index); low.set(v, index); index++;
    stack.push(v); onStack.add(v);
    for (const w of edges.get(v) || []) {
      if (!idx.has(w)) { strongconnect(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      const selfLoop = comp.length === 1 && (edges.get(comp[0]) || []).includes(comp[0]);
      if (comp.length > 1 || selfLoop) found.push(comp.sort());
    }
  };
  for (const v of edges.keys()) if (!idx.has(v)) strongconnect(v);
  return found;
}

// ---------------------------------------------------------------------------------------
// The bite test. Load the tree as real modules, in a child process so that a throw here is
// data rather than the end of this process, and so nothing the tree does at load can touch us.
const TDZ = /Cannot access '([^']+)' before initialization/;

export function biteTest({ entry }) {
  const url = pathToFileURL(entry).href;
  const runner =
    'import(' + JSON.stringify(url) + ')' +
    '.then(() => { console.log(JSON.stringify({ loaded: true })); })' +
    '.catch(e => { console.log(JSON.stringify({ loaded: false, name: e && e.constructor && e.constructor.name,' +
    ' message: String(e && e.message || e) })); });';
  const r = spawnSync(process.execPath, ['--input-type=module', '--eval', runner],
    { encoding: 'utf8', timeout: 60000 });

  const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
  let parsed = null;
  try { parsed = JSON.parse(line); } catch { /* fall through to unknown */ }

  if (!parsed) {
    return { verdict: 'UNKNOWN', why: 'the child said nothing a gate can read',
      detail: ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 300) };
  }
  if (parsed.loaded) return { verdict: 'CLEAN' };

  const m = TDZ.exec(parsed.message || '');
  if (m) return { verdict: 'BITES', binding: m[1], message: parsed.message };

  return { verdict: 'UNKNOWN', why: 'the tree would not load raw, for a reason that is not a cycle',
    detail: (parsed.name || '') + ': ' + (parsed.message || '').slice(0, 240) };
}

// ---------------------------------------------------------------------------------------
function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const entry = resolve(arg('--entry', join(HERE, '..', '..', 'src', 'main.js')));
  if (!existsSync(entry)) { console.error('no entry at ' + entry); process.exit(2); }
  const skipBite = process.argv.includes('--graph-only');

  const edges = await importGraph({ entry });
  const found = cycles(edges);
  const short = f => relative(dirname(entry), f).split('\\').join('/');

  console.log('split-guard cycles  ' + edges.size + ' modules reachable from ' + short(entry));
  if (!found.length) console.log('  note  no import cycle in the graph');
  for (const comp of found) {
    console.log('  note  cycle of ' + comp.length + ': ' + comp.map(short).join(' -> '));
  }
  console.log('  ' + found.length + ' cycles. A cycle is legal; what is not is reading across one at load.');

  if (skipBite) process.exit(0);

  const bite = biteTest({ entry });
  if (bite.verdict === 'CLEAN') {
    console.log('  ok    the tree loads unbundled, so nothing reads across a cycle at load time');
    process.exitCode = 0;
  } else if (bite.verdict === 'BITES') {
    console.log('  FAIL  a load-time cycle: ' + bite.message);
    console.log('        the binding is ' + bite.binding + '. Bundled, this would not throw - it');
    console.log('        would read undefined and carry on. See the cycle notes above for where.');
    process.exitCode = 1;
  } else {
    console.log('  UNKNOWN  the bite test could not run, so this gate has not checked anything.');
    console.log('        ' + bite.why);
    console.log('        ' + bite.detail);
    console.log('        Exiting non-zero on purpose: a gate that cannot see does not pass.');
    process.exitCode = 3;
  }
}
