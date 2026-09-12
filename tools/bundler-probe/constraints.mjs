// What esbuild will and will not do, measured rather than remembered. These are facts about
// the tool that decide how the module split may be written, so they are a test rather than a
// note: if a future esbuild changes one, this says so on the day it changes.
//
//   node tools/bundler-probe/constraints.mjs
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { OPTIONS } from './build.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), 'src');

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

async function bundle(contents, extra = {}) {
  try {
    const r = await esbuild.build({
      ...OPTIONS, ...extra,
      // silent, because one case below is meant to fail and its banner reads as a fault
      logLevel: 'silent',
      stdin: { contents, resolveDir: SRC, loader: 'js' },
    });
    return { ok: true, files: r.outputFiles };
  } catch (e) {
    return { ok: false, error: String(e.message || e).replace(/\s+/g, ' ').slice(0, 160) };
  }
}

// 1. The one constraint on how 2.x source may be written. file:// cannot load a module, so
// the artifact must be an iife, and iife has no way to express a top-level await.
const tlaIife = await bundle('const v = await Promise.resolve(1);\nwindow.__v = v;\n');
const tlaEsm = await bundle('const v = await Promise.resolve(1);\nwindow.__v = v;\n', { format: 'esm' });
check('1 iife refuses top-level await', !tlaIife.ok && /[Tt]op-level await/.test(tlaIife.error));
check('2 the same source is accepted as esm, so it is the format and not the code', tlaEsm.ok);

// 2. Lazy loading stays available: a dynamic import is inlined rather than split out.
const dyn = await bundle('import("./greet.js").then(m => { window.__g = m.greet("x"); });\n');
const jsOutputs = dyn.ok ? dyn.files.filter(f => f.path.endsWith('.js')) : [];
check('3 a dynamic import produces no second chunk', dyn.ok && jsOutputs.length === 1,
  `outputs=${jsOutputs.length}`);
check('4 the dynamically imported module is inlined',
  dyn.ok && jsOutputs[0].text.includes('PROBE_GREET_MARKER'));

// 3. charset is not optional. The default would leave Polish as escapes, which still renders
// and makes the artifact unreadable in exactly the places a reviewer would look.
const pl = 'window.__p = "' + String.fromCharCode(0x17C, 0xF3, 0x142, 0x107) + '";\n';
const plUtf8 = await bundle(pl);
const plAscii = await bundle(pl, { charset: 'ascii' });
check('5 charset utf8 keeps non-ASCII literal',
  plUtf8.ok && plUtf8.files[0].text.includes(String.fromCharCode(0x17C)));
check('6 the ascii charset escapes it, which is what the default would do',
  plAscii.ok && /\\u017[Cc]/.test(plAscii.files[0].text));

// 4. "Never minify" and "a shipped build carries no comments" hold together, because esbuild
// drops comments whether or not it is minifying. The HTML shell is the exception: esbuild
// never sees it, so the comments in the template survive into the artifact.
const cmt = await bundle('// a line comment\n/* a block comment */\n/*! a legal comment */\nwindow.__c = 1;\n');
check('7 comments are dropped with minification off',
  cmt.ok && !cmt.files[0].text.includes('line comment') && !cmt.files[0].text.includes('legal comment'));

// 5. The inliner needs no escaping of its own, in either language.
const esc = await bundle('window.__s = "</scr' + 'ipt>";\n');
check('8 a closing script tag in a string is escaped by esbuild',
  esc.ok && esc.files[0].text.includes('<\\/script>'));

// 6. Load-time cycles, which is board 182 and the one that changes how the split may be cut.
//
// These conditions record a HAZARD rather than a capability, and they are written to fail the
// day it goes away. If esbuild starts warning, or stops flattening const to var, one of these
// turns red and the gate built on top of it can be relaxed on evidence rather than on hope.
//
// A tree rather than stdin, because a cycle needs two files that can see each other.
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const CYCROOT = mkdtempSync(join(tmpdir(), 'probe-cyc-'));
async function bundleTree(id, files, extra = {}) {
  const dir = join(CYCROOT, id);
  mkdirSync(dir, { recursive: true });
  for (const [n, b] of Object.entries(files)) writeFileSync(join(dir, n), b);
  try {
    const r = await esbuild.build({
      ...OPTIONS, ...extra, logLevel: 'silent',
      entryPoints: [join(dir, 'main.js')], outdir: join(dir, 'out'),
    });
    const f = r.outputFiles.find(x => /\.js$/.test(x.path)) || r.outputFiles[0];
    return { ok: true, text: f.text, warnings: r.warnings, errors: r.errors, dir, meta: r.metafile };
  } catch (e) {
    return { ok: false, error: String(e.message || e).replace(/\s+/g, ' ').slice(0, 200), dir };
  }
}
// Run an artifact and read a value back off it, rather than reasoning about what it would do.
function runFor(text) {
  const box = {};
  try { new Function('globalThis', '"use strict";' + text)(box); return { threw: null, out: box.OUT }; }
  catch (e) { return { threw: e.constructor.name + ': ' + e.message, out: box.OUT }; }
}

const VALUE_CYCLE = {
  'a.js': 'import { B } from "./b.js";\nexport const A = "A";\nglobalThis.OUT = B;\n',
  'b.js': 'import { A } from "./a.js";\nexport const B = "B(" + A + ")";\n',
  'main.js': 'import "./a.js";\n',
};
const vc = await bundleTree('value-cycle', VALUE_CYCLE);
check('9 a load-time value cycle still builds, with no error', vc.ok && vc.errors.length === 0);
check('10 and esbuild still says nothing about it at all', vc.ok && vc.warnings.length === 0,
  vc.ok ? `warnings=${vc.warnings.length}` : vc.error);
const vcRun = runFor(vc.text);
check('11 the artifact still runs rather than throwing', vcRun.threw === null, vcRun.threw || '');
check('12 and the cyclic binding is still read as undefined, which is the hazard',
  vcRun.out === 'B(undefined)', `OUT=${JSON.stringify(vcRun.out)}`);

// The reason it is silent: bundling flattens top-level const to var, so the temporal dead zone
// that would have thrown is not in the artifact. Unconditional, not a property of the cycle.
const single = await bundleTree('single-const', {
  'main.js': 'const A = "A";\nglobalThis.OUT = A;\nglobalThis.K = () => A;\n',
});
check('13 bundling rewrites a top-level const to var even with one module and no cycle',
  single.ok && /(?:^|\n)\s*var\s+A\s*=/.test(single.text),
  (/(?:^|\n)\s*(var|let|const)\s+A\s*=/.exec(single.text || '') || [, 'absent'])[1]);

// Which means no second build in another format can act as the oracle.
for (const format of ['esm', 'cjs']) {
  const f = await bundleTree('fmt-' + format, VALUE_CYCLE, { format });
  check(`14${format === 'esm' ? 'a' : 'b'} format ${format} flattens it the same way, so it is no oracle either`,
    f.ok && /(?:^|\n)\s*var\s+A\s*=/.test(f.text));
}

// Not every cycle is a fault, and a gate that said so would be noise. Function declarations
// hoist, so a cycle that only crosses on them is correct at load time in both directions.
const fnCycle = await bundleTree('fn-cycle', {
  'a.js': 'import { b } from "./b.js";\nexport function a(){ return "a"; }\nglobalThis.OUT = b();\n',
  'b.js': 'import { a } from "./a.js";\nexport function b(){ return "b(" + a() + ")"; }\n',
  'main.js': 'import "./a.js";\n',
});
const fnRun = runFor(fnCycle.text);
check('15 a cycle crossing only on function declarations is correct at load, both ways',
  fnRun.threw === null && fnRun.out === 'b(a)', `OUT=${JSON.stringify(fnRun.out)}`);

// And the one channel that does report the cycle, which is what the gate is built on.
const metaCyc = await bundleTree('meta-cycle', VALUE_CYCLE, { metafile: true });
const inputs = metaCyc.ok && metaCyc.meta ? metaCyc.meta.inputs : {};
const edge = (from, to) => Object.entries(inputs).some(([k, v]) =>
  k.endsWith(from) && v.imports.some(i => i.path.endsWith(to)));
check('16 the metafile carries both directions of the cycle, which nothing else does',
  edge('a.js', 'b.js') && edge('b.js', 'a.js'));

rmSync(CYCROOT, { recursive: true, force: true });

console.log(fail === 0 ? `\nPASS ${pass}/${pass + fail}` : `\nFAIL ${fail} of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
