/* Is engine/etiuda.html the build of src/?
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
 * and put back when they differ, so a failing run leaves the tree as it found it. Interrupt
 * it mid-build and the artefact is a rebuild of src/, which is what `npm run build` would
 * have made anyway, and git will say so. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { build, OUT_FILE } from '../tools/build.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const REL = 'engine/etiuda.html';

const before = readFileSync(OUT_FILE);
let after;
try {
  await build();
  after = readFileSync(OUT_FILE);
} finally {
  if (!after || !after.equals(before)) writeFileSync(OUT_FILE, before);
}

if (after.equals(before)) {
  console.log(REL + ' is the build of src/  (' + before.length + ' bytes, sha256 '
    + sha256(before).slice(0, 16) + ')');
  process.exit(0);
}

console.error('  FAIL ' + REL + ' is not the build of src/');
console.error('       committed ' + before.length + ' bytes, sha256 ' + sha256(before).slice(0, 16));
console.error('       rebuilt   ' + after.length + ' bytes, sha256 ' + sha256(after).slice(0, 16));
console.error('       the artefact has been left as it was found. A hand edit to it is');
console.error('       discarded by the next build, so make the change in src/ and run');
console.error('       `node tools/build.mjs`.');
process.exit(1);
