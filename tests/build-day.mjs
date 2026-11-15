/* The day the build stamps, and the record of what it built from.
 *
 *   node tests/build-day.mjs
 *
 * The build is run in a detached worktree, and in a shallow clone of that worktree, and in a
 * folder that is not a repository. The checkout this file lives in is only read. A pretended
 * clock is loaded with node --import from a file that sits outside every repository, so the
 * build itself never hears the variable that names the pretended day.
 *
 * ETIUDA_PLANTS=off skips the plant and says NOT RUN. The plant is not part of the count then.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INPUTS as BUILD_INPUTS } from '../tools/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLANTS = process.env.ETIUDA_PLANTS !== 'off';
const OUTPUT_RELS = ['engine/etiuda.html', 'engine/etiuda.csp.json', 'engine/bubble.css'];
const INPUT_RELS = [
  'src',
  'tools/build.mjs',
  'tools/bundler-probe/build.mjs',
  'shell/license_en.txt',
  'shell/license_pl.txt',
];
const OVERLAY = [
  'tools/build.mjs',
  '.gitignore',
  'shell/main.js',
  'package.json',
  'tools/release.mjs',
  'tools/ablate.mjs',
  '.github/workflows/verify.yml',
];
const BASE_EXPECTED = 21;
const EXPECTED = BASE_EXPECTED + (PLANTS ? 1 : 0);

let failed = 0;
let asserted = 0;
let complete = false;
let parent = '';
let scratch = '';
let shallow = '';
let norepo = '';
let clockFile = '';

function oneLine(s) {
  return String(s || '').replace(/[\u0000-\u001f]+/g, ' ').slice(0, 240);
}
function note(s) { console.log('.. ' + s); }
function check(name, ok, detail) {
  asserted++;
  if (ok) console.log('  ok ' + name);
  else {
    failed++;
    console.log('  FAIL ' + name + (detail ? ': ' + oneLine(detail) : ''));
  }
}
function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
function git(cwd, args) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
}
function fingerprint(dir) {
  return OUTPUT_RELS.map(rel => {
    const p = path.join(dir, rel);
    return fs.existsSync(p) ? sha256(fs.readFileSync(p)) : 'absent';
  }).join(',');
}
function stampOf(dir) {
  try {
    const html = fs.readFileSync(path.join(dir, 'engine', 'etiuda.html'), 'utf8');
    const m = /\bE_BUILT = "(\d{4}-\d{2}-\d{2})";/.exec(html);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}
function removeOutputs(dir) {
  for (const rel of OUTPUT_RELS) {
    const p = path.join(dir, rel);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}
function restoreOutputs(dir) {
  const r = git(dir, ['checkout', '--', ...OUTPUT_RELS]);
  if (r.status !== 0) throw new Error('checkout of the outputs failed: ' + oneLine(r.stderr || r.stdout));
}
function runBuild(dir, env) {
  const childEnv = Object.assign({}, process.env);
  delete childEnv.ETIUDA_BUILD_DAY;
  delete childEnv.ETIUDA_BUILD_COMMIT_DAY;
  delete childEnv.ETIUDA_PRETEND_TODAY;
  if (env) Object.assign(childEnv, env);
  const args = [];
  if (childEnv.ETIUDA_PRETEND_TODAY) args.push('--import', pathToFileURL(clockFile).href);
  args.push(path.join(dir, 'tools', 'build.mjs'));
  const r = spawnSync(process.execPath, args, {
    cwd: dir,
    env: childEnv,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  const err = (r.stderr || '') + (r.error ? String(r.error.message || r.error) : '');
  return { status: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: err };
}
function linkModules(dir) {
  const from = path.join(ROOT, 'node_modules');
  const to = path.join(dir, 'node_modules');
  if (!fs.existsSync(from)) throw new Error('node_modules is absent beside the checkout');
  if (!fs.existsSync(to)) fs.symlinkSync(from, to, 'junction');
}
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    if (ent.isSymbolicLink()) continue;
    const a = path.join(from, ent.name);
    const b = path.join(to, ent.name);
    if (ent.isDirectory()) copyDir(a, b);
    else if (ent.isFile()) fs.copyFileSync(a, b);
  }
}
function inputsFromSource(text) {
  const m = /export const INPUTS = \[([\s\S]*?)\];/.exec(text);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}
function dropJunction(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  const link = path.join(dir, 'node_modules');
  let there = false;
  try {
    fs.lstatSync(link);
    there = true;
  } catch (e) {
    if (!(e && e.code === 'ENOENT')) throw e;
  }
  if (!there) return;
  fs.rmdirSync(link);
  if (fs.existsSync(link)) throw new Error('junction remains at ' + link);
}
function cleanup() {
  const modules = path.join(ROOT, 'node_modules');
  const before = fs.existsSync(modules);
  const dirs = [scratch, shallow, norepo].filter(Boolean);
  let blocked = false;
  for (const dir of dirs) {
    try { dropJunction(dir); }
    catch (e) {
      blocked = true;
      console.log('  FAIL junction left in place: ' + oneLine(e.message));
    }
  }
  if (!blocked && scratch) {
    const removed = git(ROOT, ['worktree', 'remove', '--force', scratch]);
    if (removed.status !== 0) note('worktree remove: ' + oneLine(removed.stderr || removed.stdout));
  }
  if (!blocked) {
    for (const dir of [shallow, norepo, scratch, parent]) {
      try {
        if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        note('remove ' + oneLine(e.message));
      }
    }
  }
  if (before && !fs.existsSync(modules)) console.log('  FAIL the checkout node_modules is gone');
}

function sourceCases(buildSrc) {
  const named = inputsFromSource(buildSrc);
  check('the build names its inputs',
    !!named && named.join('\n') === INPUT_RELS.join('\n') && BUILD_INPUTS.join('\n') === INPUT_RELS.join('\n'),
    named ? named.join(' ') : 'INPUTS is absent');
  check('the build says the day does not depend on the time zone and a shallow clone agrees',
    buildSrc.includes('time zone') && buildSrc.includes('shallow clone'));
}

function clockCase() {
  const probe = path.join(parent, 'day-probe.mjs');
  fs.writeFileSync(probe, [
    'const d = new Date();',
    'const p = n => String(n).padStart(2, "0");',
    'console.log(d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()));',
    '',
  ].join('\n'));
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(clockFile).href, probe], {
    encoding: 'utf8',
    windowsHide: true,
    env: Object.assign({}, process.env, { ETIUDA_PRETEND_TODAY: '2033-04-05', TZ: 'Pacific/Kiritimati' }),
  });
  check('a pretended day is that calendar day',
    (r.stdout || '').trim() === '2033-04-05',
    oneLine((r.stdout || '') + ' ' + (r.stderr || '')));
}

function prepareScratch() {
  note('worktree ' + scratch);
  const added = git(ROOT, ['worktree', 'add', '--detach', scratch, 'HEAD']);
  if (added.status !== 0) throw new Error('worktree add failed: ' + oneLine(added.stderr || added.stdout));
  linkModules(scratch);
  const copied = [];
  for (const rel of OVERLAY) {
    const from = path.join(ROOT, rel);
    const to = path.join(scratch, rel);
    if (!fs.existsSync(from) || !fs.existsSync(to)) continue;
    const a = fs.readFileSync(from);
    const b = fs.readFileSync(to);
    if (a.equals(b)) continue;
    fs.writeFileSync(to, a);
    copied.push(rel);
  }
  if (!copied.length) {
    check('the scratch commit holds this tree\'s build', true);
  } else {
    note('scratch commit ' + copied.join(' '));
    const staged = git(scratch, ['add', '--', ...copied]);
    if (staged.status !== 0) throw new Error('git add failed: ' + oneLine(staged.stderr || staged.stdout));
    const committed = git(scratch, ['commit', '-m', 'The build takes a day the caller hands in.']);
    check('the scratch commit holds this tree\'s build', committed.status === 0,
      oneLine(committed.stderr || committed.stdout));
  }
  const porcelain = git(scratch, ['status', '--porcelain', '--untracked-files=all', '--', ...INPUT_RELS]);
  check('the scratch inputs are clean', porcelain.status === 0 && (porcelain.stdout || '').trim() === '',
    oneLine(porcelain.stdout || porcelain.stderr));
}

function sameBytes() {
  note('switch off, committed page');
  restoreOutputs(scratch);
  const before = OUTPUT_RELS.map(rel => fs.readFileSync(path.join(scratch, rel)));
  const r = runBuild(scratch, {});
  const after = OUTPUT_RELS.map(rel => fs.readFileSync(path.join(scratch, rel)));
  check('with the switch off the committed page is rebuilt to the same bytes',
    r.status === 0 && before.every((b, i) => b.equals(after[i])),
    'status=' + r.status + ' ' + oneLine(r.stderr));
}

function expectStamp(name, env, day) {
  note(name);
  restoreOutputs(scratch);
  const r = runBuild(scratch, env);
  check(name, r.status === 0 && stampOf(scratch) === day,
    'status=' + r.status + ' stamp=' + stampOf(scratch) + ' ' + oneLine(r.stderr));
}

function refuse(raw) {
  note('refuse ' + raw);
  restoreOutputs(scratch);
  const before = fingerprint(scratch);
  const r = runBuild(scratch, { ETIUDA_BUILD_DAY: raw });
  const after = fingerprint(scratch);
  const err = r.stderr + '\n' + r.stdout;
  check('a day of ' + raw + ' is refused and nothing is written',
    r.status !== 0 && err.includes('nothing was written') && !err.includes(raw) && after === before,
    'status=' + r.status + ' ' + oneLine(err));
}

function matrix() {
  note('two zones, two pretended days');
  const zones = ['Pacific/Kiritimati', 'Pacific/Honolulu'];
  const days = ['1999-01-02', '2033-04-05'];
  const shas = [];
  const stamps = [];
  const statuses = [];
  for (const tz of zones) {
    for (const day of days) {
      removeOutputs(scratch);
      const r = runBuild(scratch, {
        ETIUDA_BUILD_COMMIT_DAY: '1',
        ETIUDA_PRETEND_TODAY: day,
        TZ: tz,
      });
      statuses.push(r.status);
      stamps.push(stampOf(scratch));
      shas.push(fingerprint(scratch));
      if (r.status !== 0) note(oneLine(r.stderr));
    }
  }
  const cs = (git(scratch, ['log', '-1', '--format=%cs']).stdout || '').trim();
  const same = shas.every(s => s === shas[0]) && !shas[0].includes('absent');
  check('one commit built under two time zones and two pretended days is the same bytes',
    statuses.every(s => s === 0) && same && stamps.every(s => s === cs) && /^\d{4}-\d{2}-\d{2}$/.test(cs),
    'cs=' + cs + ' stamps=' + stamps.join(',') + ' statuses=' + statuses.join(','));
  return cs;
}

function mtimeCase(cs) {
  note('touch an input');
  const lic = path.join(scratch, 'shell', 'license_en.txt');
  const st = fs.statSync(lic);
  const bumped = new Date(st.mtimeMs + 120000);
  fs.utimesSync(lic, bumped, bumped);
  try {
    removeOutputs(scratch);
    const r = runBuild(scratch, {
      ETIUDA_BUILD_COMMIT_DAY: '1',
      ETIUDA_PRETEND_TODAY: '2033-04-05',
      TZ: 'Pacific/Kiritimati',
    });
    check('touching an input\'s time leaves the commit day',
      r.status === 0 && stampOf(scratch) === cs,
      'status=' + r.status + ' stamp=' + stampOf(scratch) + ' cs=' + cs);
  } finally {
    fs.utimesSync(lic, st.atime, st.mtime);
  }
}

function dirtyCase() {
  note('changed input');
  const lic = path.join(scratch, 'shell', 'license_en.txt');
  const orig = fs.readFileSync(lic);
  fs.writeFileSync(lic, Buffer.concat([orig, Buffer.from('\n')]));
  try {
    removeOutputs(scratch);
    const r = runBuild(scratch, {
      ETIUDA_BUILD_COMMIT_DAY: '1',
      ETIUDA_PRETEND_TODAY: '2033-04-05',
      TZ: 'Pacific/Honolulu',
    });
    check('a changed input takes the pretended day',
      r.status === 0 && stampOf(scratch) === '2033-04-05',
      'status=' + r.status + ' stamp=' + stampOf(scratch) + ' ' + oneLine(r.stderr));
  } finally {
    fs.writeFileSync(lic, orig);
  }
}

function shallowCase(cs) {
  note('shallow clone');
  const cloned = spawnSync('git', ['-c', 'core.autocrlf=false', 'clone', '--depth', '1', '--no-local', scratch, shallow], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (cloned.status !== 0) {
    check('a shallow clone stamps the same day as the full tree', false, oneLine(cloned.stderr || cloned.stdout));
    return;
  }
  linkModules(shallow);
  const isShallow = (git(shallow, ['rev-parse', '--is-shallow-repository']).stdout || '').trim();
  const shallowCs = (git(shallow, ['log', '-1', '--format=%cs']).stdout || '').trim();
  removeOutputs(shallow);
  const r = runBuild(shallow, {
    ETIUDA_BUILD_COMMIT_DAY: '1',
    ETIUDA_PRETEND_TODAY: '1999-01-02',
    TZ: 'Pacific/Kiritimati',
  });
  check('a shallow clone stamps the same day as the full tree',
    isShallow === 'true' && shallowCs === cs && r.status === 0 && stampOf(shallow) === cs,
    'shallow=' + isShallow + ' cs=' + cs + ' cloneCs=' + shallowCs + ' stamp=' + stampOf(shallow)
      + ' status=' + r.status + ' ' + oneLine(r.stderr));
}

function noRepoCase() {
  note('no repository');
  fs.mkdirSync(path.join(norepo, 'engine'), { recursive: true });
  fs.mkdirSync(path.join(norepo, 'shell'), { recursive: true });
  fs.mkdirSync(path.join(norepo, 'tools', 'bundler-probe'), { recursive: true });
  copyDir(path.join(scratch, 'src'), path.join(norepo, 'src'));
  fs.copyFileSync(path.join(scratch, 'tools', 'build.mjs'), path.join(norepo, 'tools', 'build.mjs'));
  fs.copyFileSync(path.join(scratch, 'tools', 'bundler-probe', 'build.mjs'),
    path.join(norepo, 'tools', 'bundler-probe', 'build.mjs'));
  fs.copyFileSync(path.join(scratch, 'shell', 'license_en.txt'), path.join(norepo, 'shell', 'license_en.txt'));
  fs.copyFileSync(path.join(scratch, 'shell', 'license_pl.txt'), path.join(norepo, 'shell', 'license_pl.txt'));
  linkModules(norepo);
  const todayBuild = runBuild(norepo, {
    ETIUDA_BUILD_COMMIT_DAY: '1',
    ETIUDA_PRETEND_TODAY: '2033-04-05',
    TZ: 'Pacific/Honolulu',
  });
  check('a tree with no repository takes the pretended day',
    todayBuild.status === 0 && stampOf(norepo) === '2033-04-05',
    'status=' + todayBuild.status + ' stamp=' + stampOf(norepo) + ' ' + oneLine(todayBuild.stderr));
  const handed = runBuild(norepo, {
    ETIUDA_BUILD_COMMIT_DAY: '1',
    ETIUDA_BUILD_DAY: '2001-02-03',
    ETIUDA_PRETEND_TODAY: '1999-01-02',
    TZ: 'Pacific/Kiritimati',
  });
  check('a tree with no repository takes the handed-in day',
    handed.status === 0 && stampOf(norepo) === '2001-02-03',
    'status=' + handed.status + ' stamp=' + stampOf(norepo) + ' ' + oneLine(handed.stderr));
}

function plantCase() {
  if (!PLANTS) {
    console.log('NOT RUN plant:build-day (ETIUDA_PLANTS=off)');
    return;
  }
  note('plant');
  const file = path.join(scratch, 'tools', 'build.mjs');
  const src = fs.readFileSync(file, 'utf8');
  const marker = '/* plant:build-day */';
  if (!src.includes(marker)) {
    check('lifting the refusal still writes nothing', false, 'marker absent');
    return;
  }
  const lifted = src.split('\n').filter(line => !line.includes(marker)).join('\n');
  fs.writeFileSync(file, lifted);
  try {
    restoreOutputs(scratch);
    const before = fingerprint(scratch);
    const r = runBuild(scratch, { ETIUDA_BUILD_DAY: '15/11/2026' });
    const after = fingerprint(scratch);
    const err = r.stderr + '\n' + r.stdout;
    check('lifting the refusal still writes nothing',
      r.status !== 0 && !err.includes('nothing was written') && err.includes('cannot be read back') && after === before,
      'status=' + r.status + ' ' + oneLine(err));
  } finally {
    fs.writeFileSync(file, src);
  }
}

try {
  const buildSrc = fs.readFileSync(path.join(ROOT, 'tools', 'build.mjs'), 'utf8');
  sourceCases(buildSrc);
  parent = fs.mkdtempSync(path.join(os.tmpdir(), 'bod-day-'));
  scratch = path.join(parent, 'full');
  shallow = path.join(parent, 'shallow');
  norepo = path.join(parent, 'norepo');
  clockFile = path.join(parent, 'clock.mjs');
  fs.writeFileSync(clockFile, [
    'const day = process.env.ETIUDA_PRETEND_TODAY;',
    'if (day) {',
    '  const Real = globalThis.Date;',
    '  class D extends Real {',
    '    constructor(...args) {',
    '      if (args.length === 0) super(day + "T12:00:00");',
    '      else super(...args);',
    '    }',
    '    static now() { return new Real(day + "T12:00:00").getTime(); }',
    '  }',
    '  globalThis.Date = D;',
    '}',
    '',
  ].join('\n'));
  clockCase();
  prepareScratch();
  sameBytes();
  expectStamp('a handed-in day is the stamp', {
    ETIUDA_BUILD_DAY: '2001-02-03',
    ETIUDA_PRETEND_TODAY: '2033-04-05',
    TZ: 'Pacific/Kiritimati',
  }, '2001-02-03');
  expectStamp('a handed-in day wins while the commit-day switch is on', {
    ETIUDA_BUILD_DAY: '2001-02-03',
    ETIUDA_BUILD_COMMIT_DAY: '1',
    ETIUDA_PRETEND_TODAY: '1999-01-02',
    TZ: 'Pacific/Honolulu',
  }, '2001-02-03');
  expectStamp('a leap day is a day', { ETIUDA_BUILD_DAY: '2024-02-29' }, '2024-02-29');
  restoreOutputs(scratch);
  const kept = stampOf(scratch);
  expectStamp('an empty handed day leaves the committed page', { ETIUDA_BUILD_DAY: '' }, kept);
  for (const raw of ['2026-02-31', '2026-99-99', '15/11/2026', '2026-1-1', '2025-02-29']) refuse(raw);
  const cs = matrix();
  mtimeCase(cs);
  dirtyCase();
  shallowCase(cs);
  noRepoCase();
  plantCase();
  complete = asserted === EXPECTED;
} catch (e) {
  failed++;
  console.log('  FAIL the leg stopped: ' + oneLine(e && e.stack || e));
} finally {
  cleanup();
}

console.log('#counts checks=' + asserted + ' failed=' + failed + ' expected=' + EXPECTED);
console.log(complete && !failed
  ? 'RESULT: ok ' + asserted + ' check(s)'
  : 'RESULT: FAIL ' + failed + ' failed' + (complete ? '' : ', and only ' + asserted + ' of ' + EXPECTED + ' ran'));
process.exit(complete && !failed ? 0 : Math.min(failed || 1, 63));
