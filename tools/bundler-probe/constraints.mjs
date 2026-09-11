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

console.log(fail === 0 ? `\nPASS ${pass}/${pass + fail}` : `\nFAIL ${fail} of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
