/* Are the outputs on disk the build of src/, and can they always be made so?
 *
 *   node tests/build-fresh.mjs
 *
 * tests/test.js reads the engine as text from src/, because the artefact is generated and
 * esbuild's reprint is faithful as a program and not as text. That is only honest while the
 * artefact IS the build of those sources. [2b/5] in test.js proves three of the artefact's
 * four parts by position in a millisecond - the template's two halves and the monolith, all
 * three spliced in verbatim. The fourth is the bundle, and nothing but the build can speak
 * for it, so this runs the real one.
 *
 * THE CLAIM. Two builds of one source are byte for byte the same, and the outputs on disk are
 * this source's by the build's record (tools/build.mjs outputsCurrent()). Carried greens rest on
 * the first half: a page that is a pure function of its source and its build day. While the
 * outputs are tracked, the copy this runs in holds them, and the claim keeps its older half too:
 * what is committed equals what is built.
 *
 * THE HARNESS'S ONE PLACE. tests/engine.js ensureOutputs() makes the outputs current before any
 * leg reads them, once per process and under one lock, and tools/gate-run.mjs builds once before
 * its gates. Both are proved here, with the outputs and the record deleted: three legs starting at
 * once build once and read one page, an edit to the source alone is rebuilt, and gate-run builds
 * so that the leg it runs does not. Each has a plant.
 *
 * It runs tools/build.mjs rather than a second copy of the splice, because a check built on its
 * own idea of how the artefact is assembled would fail the day the assembly changed and would
 * blame the wrong thing. The run is a scratch copy of the tree (tests/plants-tree.mjs), so what it
 * deletes and plants never reaches the checkout.
 *
 * THE SUBJECT IS build.mjs's OWN LIST, not one written here, so a fourth output cannot be added
 * there and left outside this gate. */
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = b => createHash('sha256').update(b).digest('hex');
if (process.env.ETIUDA_PLANTS_COPY !== "1") {
  const { runInPlantsCopy } = await import("./plants-tree.mjs");
  const tree = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  process.exit(await runInPlantsCopy(tree, fileURLToPath(import.meta.url), "build-fresh"));
}
const { build, builtStamp, outputsCurrent, OUTPUTS, OUT_FILE, RECORD_FILE } = await import('../tools/build.mjs');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = p => relative(ROOT, p).split('\\').join('/');
const PLANTS = process.env.ETIUDA_PLANTS !== 'off';
const EXPECTED = 9 + (PLANTS ? 3 : 0);
const ENGINE_JS = join(ROOT, 'tests', 'engine.js');
const GATE_RUN = join(ROOT, 'tools', 'gate-run.mjs');
const BUILT_LINE = 'tests/engine.js: the built page was not this source\'s by its record; built once';
const GATE_LINE = 'gate-run: the built page was not this source\'s by the build\'s record, so it was built once';

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log('  ok   ' + line);
  else { failed++; console.log('  FAIL ' + line); }
}
const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 300);
const readAll = () => OUTPUTS.map(p => existsSync(p) ? readFileSync(p) : null);
const same = (a, b) => a.every((x, i) => x && b[i] && x.equals(b[i]));
function dropOutputs() {
  for (const p of [...OUTPUTS, RECORD_FILE]) if (existsSync(p)) unlinkSync(p);
}
/* A child's environment with no judgement inherited from a parent run, so it asks the record itself, and the first build's
   day handed in: a tree with no page to keep a day from stamps today, and the cases below compare bytes with that build. */
let DAY = '';
function freshEnv(extra) {
  const env = Object.assign({}, process.env);
  for (const k of ['ETIUDA_BUILD_DAY', 'ETIUDA_BUILD_COMMIT_DAY', 'ETIUDA_PRETEND_TODAY', 'ETIUDA_OUTPUTS_JUDGED']) delete env[k];
  return Object.assign(env, { ETIUDA_BUILD_DAY: DAY }, extra || {});
}
const READER = 'const E = require(' + JSON.stringify(ENGINE_JS) + ');'
  + 'const p = E.enginePath();'
  + 'process.stdout.write("sha " + require("crypto").createHash("sha256").update(require("fs").readFileSync(p)).digest("hex") + "\\n");';
function readerAt(code) {
  return new Promise(res => {
    const c = spawn(process.execPath, ['-e', code], { cwd: ROOT, env: freshEnv(), windowsHide: true });
    let out = '', err = '';
    c.stdout.on('data', d => { out += d; });
    c.stderr.on('data', d => { err += d; });
    c.on('close', code => res({ code, out, err, sha: (/^sha ([0-9a-f]{64})$/m.exec(out) || [])[1] || '' }));
  });
}
const readerNow = code => spawnSync(process.execPath, ['-e', code || READER], { cwd: ROOT, env: freshEnv(), encoding: 'utf8', windowsHide: true });
const builtLines = s => String(s).split('\n').filter(l => l.includes(BUILT_LINE)).length;

const committed = readAll();
const tracked = committed.every(Boolean);

/* 1 to 3: two builds of one source, the record, and while tracked the committed bytes. */
await build();
const first = readAll();
DAY = builtStamp(first[OUTPUTS.indexOf(OUT_FILE)].toString('utf8')) || '';
await build();
const second = readAll();
check(same(first, second), '1 two builds of one source are byte for byte the same: '
  + OUTPUTS.map((p, i) => rel(p) + ' ' + sha256(first[i]).slice(0, 12)).join(', '));
if (PLANTS) {
  /* Plant 0: a second build on another day is not the same source's build, and the comparison of case 1 says so. */
  const keep = process.env.ETIUDA_BUILD_DAY;
  process.env.ETIUDA_BUILD_DAY = DAY === '2001-02-03' ? '2001-02-04' : '2001-02-03';
  let other;
  try { await build(); other = readAll(); }
  finally { if (keep === undefined) delete process.env.ETIUDA_BUILD_DAY; else process.env.ETIUDA_BUILD_DAY = keep; }
  process.env.ETIUDA_BUILD_DAY = DAY;
  try { await build(); } finally { if (keep === undefined) delete process.env.ETIUDA_BUILD_DAY; else process.env.ETIUDA_BUILD_DAY = keep; }
  check(!same(first, other) && same(readAll(), first),
    'plant: a build stamped with another day differs from the first, so case 1 would go red, and the day handed back restores it');
}
check(outputsCurrent(), '2 the outputs on disk are this source\'s by the build\'s record (' + rel(RECORD_FILE) + ')');
if (tracked) {
  const stale = OUTPUTS.filter((p, i) => !committed[i].equals(first[i]));
  check(!stale.length, '3 the tracked outputs are the build of src/'
    + (stale.length ? ': ' + stale.map(p => rel(p) + ' committed ' + sha256(committed[OUTPUTS.indexOf(p)]).slice(0, 12)
      + ', rebuilt ' + sha256(first[OUTPUTS.indexOf(p)]).slice(0, 12)).join('; ')
      + '. A hand edit to one is discarded by the next build: change src/, run `node tools/build.mjs` and stage all three' : ''));
} else check(true, '3 the outputs are not tracked, so there is no committed copy to compare');

/* THE RELEASE GATE'S DASH RULE, HELD ON EVERY MERGE THAT BUILDS THE PAGE. tools/release.mjs gate 4 refuses an em or en
   dash in the artefact; for four days two stood in it (a character class in src/modules/manage.js, 2026-11-11 to fold 97)
   and no area leg said so, so no release could have been cut. The same characters, built from char codes for the reason
   release.mjs gives: a dash written into this tracked file would be the thing refused. Each hit is named by the module
   banner above it, which is where the source is (the test architect, 2026-11-15). */
{
  const DASHES = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']', 'g');
  const page = first[OUTPUTS.indexOf(OUT_FILE)].toString('utf8');
  const hits = [];
  for (let m; (m = DASHES.exec(page)); ) {
    const banner = page.lastIndexOf('// src/', m.index);
    const from = banner < 0 ? '(the template)' : page.slice(banner + 3, page.indexOf('\n', banner));
    hits.push(from + ' at byte ' + m.index);
  }
  check(!hits.length, '4 ' + rel(OUT_FILE) + ' holds no em or en dash, which release.mjs gate 4 refuses'
    + (hits.length ? ': ' + hits.length + ', ' + hits.slice(0, 5).join('; ')
      + '; write each as an escape (\\u2013, \\u2014) or reword it in src/, then build' : ''));
}

/* 5: three legs start at once over a tree with no outputs and no record. One builds; all read the same page, the build's. */
dropOutputs();
const three = await Promise.all([readerAt(READER), readerAt(READER), readerAt(READER)]);
const shas = new Set(three.map(r => r.sha));
const lines = three.reduce((n, r) => n + builtLines(r.err), 0);
check(three.every(r => r.code === 0) && shas.size === 1 && three[0].sha === sha256(first[0]) && lines === 1 && same(readAll(), first),
  '5 three legs starting at once with the outputs and the record deleted build once (' + lines + ' build line(s)) and read one page,'
  + ' the build\'s: exits ' + three.map(r => r.code).join(',') + ', ' + shas.size + ' digest(s)'
  + (three.some(r => r.code !== 0) ? ', ' + oneLine(three.map(r => r.out + r.err).join(' | ')) : ''));

/* 6: a reader after them takes the record's word and builds nothing. */
const after = readerNow();
check(after.status === 0 && builtLines(after.stderr) === 0, '6 a reader after them builds nothing: exit ' + after.status
  + ', ' + builtLines(after.stderr) + ' build line(s)');

/* 7: an edit to the source alone, the outputs untouched, is seen by the record and rebuilt; undone, it is rebuilt back. */
{
  const tpl = join(ROOT, 'src', 'template.html');
  const was = readFileSync(tpl, 'utf8');
  const probe = '<!-- build-fresh probe -->';
  writeFileSync(tpl, was + probe + '\n');
  let edited, back;
  try { edited = readerNow(); }
  finally { writeFileSync(tpl, was); }
  const page = readFileSync(OUT_FILE, 'utf8');
  back = readerNow();
  check(edited.status === 0 && builtLines(edited.stderr) === 1 && page.includes(probe) && back.status === 0
    && builtLines(back.stderr) === 1 && same(readAll(), first),
    '7 an edit to src/template.html alone is rebuilt before the next read (' + builtLines(edited.stderr) + ' build line(s), probe '
    + (page.includes(probe) ? 'in' : 'NOT in') + ' the page), and undone it is rebuilt to the first build\'s bytes ('
    + builtLines(back.stderr) + ')');
}

/* 8 and 9: gate-run over a tree with no outputs builds once before its gates, and the leg it runs builds nothing. */
const runs = mkdtempSync(join(tmpdir(), 'build-fresh-runs-'));
function gateRun() {
  return spawnSync(process.execPath, [GATE_RUN, 'file', 'tests/about.mjs'], {
    cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 26,
    env: freshEnv({ ETIUDA_RUNS: runs, ETIUDA_LISTED: 'off' }),
  });
}
try {
  dropOutputs();
  const g = gateRun();
  const said = g.stdout + g.stderr;
  check(g.status === 0 && said.includes(GATE_LINE) && builtLines(said) === 0 && same(readAll(), first),
    '8 gate-run builds once before its gates when the record says the outputs are not this source\'s, and its leg builds nothing:'
    + ' exit ' + g.status + ', gate-run line ' + said.includes(GATE_LINE) + ', leg build lines ' + builtLines(said)
    + (g.status !== 0 ? ', ' + oneLine(said.slice(-400)) : ''));
  const again = gateRun();
  check(again.status === 0 && !(again.stdout + again.stderr).includes(GATE_LINE),
    '9 and over a current tree it builds nothing: exit ' + again.status);

  if (PLANTS) {
    /* Plant 1: enginePath() without its ensureOutputs(). A leg over a tree with no outputs then finds no page. */
    const lib = readFileSync(ENGINE_JS, 'utf8');
    const libPlanted = lib.split('\n').filter(l => !l.includes('/* plant:ensure */')).join('\n');
    dropOutputs();
    writeFileSync(ENGINE_JS, libPlanted);
    let p1;
    try { p1 = readerNow('const E = require(' + JSON.stringify(ENGINE_JS) + '); E.enginePath(); console.log("READ");'); }
    finally { writeFileSync(ENGINE_JS, lib); }
    check(libPlanted !== lib && p1.status === 78 && !/READ/.test(p1.stdout),
      'plant: lifting enginePath()\'s ensureOutputs() leaves a tree with no outputs unreadable, so case 5 would go red: exit ' + p1.status);

    /* Plant 2: gate-run without its build. The leg then builds for itself, which case 8 refuses. */
    const tool = readFileSync(GATE_RUN, 'utf8');
    const toolPlanted = tool.split('\n').filter(l => !l.includes('/* plant:gate-run-builds */')).join('\n');
    dropOutputs();
    writeFileSync(GATE_RUN, toolPlanted);
    let p2;
    try { p2 = gateRun(); }
    finally { writeFileSync(GATE_RUN, tool); }
    const said2 = p2.stdout + p2.stderr;
    check(toolPlanted !== tool && !said2.includes(GATE_LINE) && builtLines(said2) === 1,
      'plant: lifting gate-run\'s build leaves the leg to build for itself, so case 8 would go red: gate-run line '
      + said2.includes(GATE_LINE) + ', leg build lines ' + builtLines(said2));
  } else console.log('NOT RUN the other-day plant, plant:ensure and plant:gate-run-builds (ETIUDA_PLANTS=off)');
} finally {
  rmSync(runs, { recursive: true, force: true });
}

/* THE GATE'S OWN COUNTS, board item 529. What it compares is the build's outputs, so the numbers are their sizes: a rebuild
   that silently shrank the page would move `bytes` while the gate stayed green about the pin. Before the last line, which
   tools/gate-run.mjs takes as the verdict. */
console.log('#counts checks=' + asserted + ' failed=' + failed + ' expected=' + EXPECTED + ' outputs=' + OUTPUTS.length
  + OUTPUTS.map((p, i) => ' ' + rel(p).replace(/[^A-Za-z0-9]/g, '_') + '=' + first[i].length).join(''));
if (asserted !== EXPECTED) {
  console.log('SUITE DID NOT COMPLETE: ' + asserted + ' of ' + EXPECTED + ' check(s)');
  process.exit(78);
}
if (failed) {
  console.log('build-fresh: ' + failed + ' of ' + asserted + ' check(s) failed');
  process.exit(1);
}
console.log(OUTPUTS.map(rel).join(', ') + ' are the build of src/, and the harness makes them so  ('
  + first[0].length + ' bytes, sha256 ' + sha256(first[0]).slice(0, 16) + ' for ' + rel(OUT_FILE) + ')');
process.exit(0);
