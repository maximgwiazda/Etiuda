/* Is engine/ the build of src/?
 *
 *   node tests/build-fresh.mjs
 *
 * tests/test.js reads the engine as text from src/, because the artefact is generated and
 * esbuild's reprint is faithful as a program and not as text. That is only honest while the
 * artefact IS the build of those sources. [2b/5] in test.js proves three of the artefact's
 * four parts by position in a millisecond - the template's two halves and the monolith, all
 * three spliced in verbatim. The fourth is the bundle, and nothing but the build can speak
 * for it, so this runs the real one and compares.
 *
 * It runs tools/build.mjs rather than a second copy of the splice, because a check built on
 * its own idea of how the artefact is assembled would fail the day the assembly changed and
 * would blame the wrong thing. The cost is that build.mjs writes: the bytes are read first
 * and put back when any of them differ, so a failing run leaves the tree as it found it.
 * The run is a scratch copy of the tree, so a kill during the build leaves the checkout as it was.
 *
 * THE SUBJECT IS build.mjs's OWN LIST, not one written here. There are three outputs now - the
 * artefact, the policy pin whose absence is a window that will not start, and the bubble Studio
 * renders from - and a gate carrying its own copy of that list is a gate that goes quietly
 * blind the day a fourth is added. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, OUTPUTS, OUT_FILE } from '../tools/build.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
if (process.env.ETIUDA_PLANTS_COPY !== "1") {
  const { runInPlantsCopy } = await import("./plants-tree.mjs");
  const tree = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  process.exit(await runInPlantsCopy(tree, fileURLToPath(import.meta.url), "build-fresh"));
}
const rel = p => relative(ROOT, p).split('\\').join('/');

const before = OUTPUTS.map(p => readFileSync(p));
let after = null;
try {
  await build();
  after = OUTPUTS.map(p => readFileSync(p));
} finally {
  if (!after || after.some((b, i) => !b.equals(before[i])))
    OUTPUTS.forEach((p, i) => writeFileSync(p, before[i]));
}

const stale = OUTPUTS.map((p, i) => [p, i]).filter(([, i]) => !after[i].equals(before[i]));

/* THE RELEASE GATE'S DASH RULE, HELD ON EVERY MERGE THAT BUILDS THE PAGE. tools/release.mjs gate 4 refuses an em or en
   dash in the artefact; for four days two stood in it (a character class in src/modules/manage.js, 2026-11-11 to fold 97)
   and no area leg said so, so no release could have been cut. The same characters, built from char codes for the reason
   release.mjs gives: a dash written into this tracked file would be the thing refused. Each hit is named by the module
   banner above it, which is where the source is (the test architect, 2026-11-15). */
{
  const DASHES = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']', 'g');
  const page = before[OUTPUTS.indexOf(OUT_FILE)].toString('utf8');
  const hits = [];
  for (let m; (m = DASHES.exec(page)); ) {
    const banner = page.lastIndexOf('// src/', m.index);
    const from = banner < 0 ? '(the template)' : page.slice(banner + 3, page.indexOf('\n', banner));
    hits.push(from + ' at byte ' + m.index);
  }
  if (hits.length) {
    console.error('  FAIL ' + rel(OUT_FILE) + ' holds ' + hits.length + ' em or en dash(es), which release.mjs gate 4 refuses: '
      + hits.slice(0, 5).join('; '));
    console.error('       write each as an escape (\\u2013, \\u2014) or reword it in src/, then build.');
    process.exit(1);
  }
}

if (!stale.length) {
  /* THE GATE'S OWN COUNTS, board item 529. The record read this gate as one `line` whatever it
     did. What it compares is the build's outputs, so the numbers are their sizes: a rebuild
     that silently shrank the page would move `bytes` while the gate stayed green about the
     pin. Before the last line, which tools/gate-run.mjs takes as the verdict. */
  console.log('#counts outputs=' + OUTPUTS.length
    + OUTPUTS.map((p, i) => ' ' + rel(p).replace(/[^A-Za-z0-9]/g, '_') + '=' + before[i].length).join(''));
  console.log(OUTPUTS.map(rel).join(', ') + ' are the build of src/  ('
    + before[0].length + ' bytes, sha256 ' + sha256(before[0]).slice(0, 16)
    + ' for ' + rel(OUT_FILE) + ')');
  process.exit(0);
}

for (const [p, i] of stale) {
  console.error('  FAIL ' + rel(p) + ' is not the build of src/');
  console.error('       committed ' + before[i].length + ' bytes, sha256 ' + sha256(before[i]).slice(0, 16));
  console.error('       rebuilt   ' + after[i].length + ' bytes, sha256 ' + sha256(after[i]).slice(0, 16));
}
console.error('       every output has been left as it was found. A hand edit to one is');
console.error('       discarded by the next build, so make the change in src/, run');
console.error('       `node tools/build.mjs` and stage all three.');
process.exit(1);
