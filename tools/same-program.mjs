/* Are these two files the same program?
 *
 * The question this answers is narrow and worth stating exactly. Given a file and a rewrite of
 * it, it says whether the two compile to identical code once a compiler has folded away
 * everything that was only ever going to have one value. It is an oracle for a rewrite that is
 * meant to change nothing: collapsing a guard that can only be true, lifting a block into a
 * function called where the block stood, deleting a branch nothing can reach. It is exhaustive
 * over code paths, which a browser suite can never be.
 *
 * It does NOT say the rewrite is correct. It says the rewrite and a control describe the same
 * program, so the burden moves onto the control, which is built by a substitution whose
 * correctness follows from a census rather than from reading. Pick a control that is obviously
 * right and let this prove the readable version equal to it.
 *
 * Two traps live in here and both are measured, on esbuild 0.28.2:
 *
 *   minifyIdentifiers must stay OFF. With it on, two files that differ anywhere rename their
 *   locals from different starting points and part company on a letter, which looks exactly
 *   like a real difference and is not one.
 *
 *   esbuild folds a `true` out of an `&&` chain only where the chain is a condition. In an
 *   `if` it removes every one of them; in a value position it removes a LEADING one and keeps
 *   the rest, so `var x = f() && true && g()` minifies to `f()&&!0&&g()`. A control carrying a
 *   `true` in the middle of an assigned chain therefore parts company with a subject that has
 *   none. This file makes that one fold by hand, `&&!0&&` to `&&`, which is sound whatever the
 *   operands are, and prints how often it was needed rather than waving it through. It leaves
 *   a TRAILING `&&!0` alone: `f() && true` yields true where `f()` yields what f returned, so
 *   that one is a real difference and folding it would hide a fault.
 *
 *   node tools/same-program.mjs <control> <subject>
 *
 * Either argument may be the engine's HTML or a bare script. In an HTML file the app script is
 * the last element, so the extractor takes the last line that is exactly `<script>` through the
 * last `</script>`; a file with no such line is read whole. Exit is 0 for the same program,
 * 1 for a difference, which is printed at the first byte where they part with enough either
 * side to read.
 */
import { readFileSync } from 'node:fs';
import * as esbuild from 'esbuild';

const script = f => {
  const all = readFileSync(f, 'utf8').split('\n');
  let open = -1;
  for (let i = all.length - 1; i >= 0; i--) if (all[i] === '<script>') { open = i; break; }
  if (open < 0) return all.join('\n');
  let close = -1;
  for (let i = all.length - 1; i > open; i--) if (all[i].trim() === '</script>') { close = i; break; }
  if (close < 0) throw new Error(f + ': found <script> at line ' + (open + 1) + ' and no </script> after it');
  return all.slice(open + 1, close).join('\n');
};

const squash = async (src, name) => {
  const r = await esbuild.transform(src, {
    minifySyntax: true, minifyWhitespace: true, minifyIdentifiers: false,
    charset: 'utf8', loader: 'js'
  });
  console.log(name + ': ' + r.code.length + ' bytes minified');
  return r.code;
};

const fold = s => { let n = 0; const out = s.replace(/&&!0&&/g, () => { n++; return '&&'; }); return [out, n]; };

const [control, subject] = process.argv.slice(2);
if (!control || !subject) { console.error('usage: node tools/same-program.mjs <control> <subject>'); process.exit(2); }

const [a, na] = fold(await squash(script(control), 'control'));
const [b, nb] = fold(await squash(script(subject), 'subject'));
console.log('mid-chain `&& true &&` folded by hand: control ' + na + ', subject ' + nb);

if (a === b) { console.log('SAME: the two minify to identical bytes'); process.exit(0); }
let i = 0; while (i < a.length && a[i] === b[i]) i++;
console.log('DIFFER at byte ' + i);
console.log('control: ' + JSON.stringify(a.slice(Math.max(0, i - 120), i + 160)));
console.log('subject: ' + JSON.stringify(b.slice(Math.max(0, i - 120), i + 160)));
process.exit(1);
