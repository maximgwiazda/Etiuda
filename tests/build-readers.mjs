/* The readers that need the built page, other than the shell.
 *
 *   node tests/build-readers.mjs
 *
 * verify.yml is read. The release dry run and the ablation restore run in a detached worktree,
 * where the name list is the checkout's, so the name scan can run. No window, no installer, no
 * network. --up-to page stops the release before the window wall.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkoutKnown, restoreAblation, dirty } from '../tools/ablate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLANTS = process.env.ETIUDA_PLANTS !== 'off';
const BASE_EXPECTED = 28;
const EXPECTED = BASE_EXPECTED + (PLANTS ? 1 : 0);
const OUTPUT_RELS = ['engine/etiuda.html', 'engine/etiuda.csp.json', 'engine/bubble.css'];
const OVERLAY = ['tools/release.mjs', 'tools/ablate.mjs'];
const DRY = 'dry run: stopped after the page, before the window wall';

let failed = 0, asserted = 0, complete = false;
let parent = '', scratch = '', d1 = '';

function oneLine(s) {
  return String(s || '').replace(/[\u0000-\u001f]+/g, ' ').slice(0, 300);
}
function note(s) { console.log('.. ' + s); }
function check(name, ok, detail) {
  asserted++;
  if (ok) console.log('  ok ' + name);
  else { failed++; console.log('  FAIL ' + name + (detail ? ': ' + oneLine(detail) : '')); }
}
function between(text, start, end) {
  const a = text.indexOf(start);
  const b = a < 0 ? -1 : text.indexOf(end, a + start.length);
  return a < 0 || b < 0 ? '' : text.slice(a, b);
}
function git(cwd, args) {
  return spawnSync('git', args, {
    cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
}
function dropJunction(dir) {
  const link = path.join(dir, 'node_modules');
  let there = false;
  try { fs.lstatSync(link); there = true; } catch (e) { if (!(e && e.code === 'ENOENT')) throw e; }
  if (!there) return;
  fs.rmdirSync(link);
  if (fs.existsSync(link)) throw new Error('junction remains at ' + link);
}
function releaseEnv(homeRoot) {
  const env = Object.assign({}, process.env, { ETIUDA_RELEASE_HOME_ROOT: homeRoot });
  delete env.ETIUDA_BUILD_DAY;
  delete env.ETIUDA_BUILD_COMMIT_DAY;
  delete env.ETIUDA_PRETEND_TODAY;
  return env;
}
function runRelease(dir, homeRoot) {
  note('release --up-to page in ' + path.basename(dir));
  const r = spawnSync(process.execPath, ['tools/release.mjs', '--up-to', 'page'], {
    cwd: dir, env: releaseEnv(homeRoot), encoding: 'utf8', windowsHide: true,
    maxBuffer: 64 * 1024 * 1024, timeout: 600000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  return { status: r.status === null ? -1 : r.status, out };
}
function filesThere(dir) {
  return OUTPUT_RELS.every(rel => fs.existsSync(path.join(dir, rel)));
}
/* Exit 4 is the line-endings gate refusing em or en dashes in the page the build just
   wrote. Exit 0 is that gate passing and the dry run stopping. Neither reaches the window wall. */
function releaseJudged(run, dir, absent) {
  const wall = run.out.includes('#refused window-wall') || /\n\[5\] /.test(run.out);
  const built = /engine\/etiuda\.html\s+\d+ bytes/.test(run.out);
  const dashStop = run.status === 4 && /em or en dash\(es\) in the artefact/.test(run.out);
  const dry = run.status === 0 && run.out.includes(DRY);
  const wrote = !absent || /was \(absent\)/.test(run.out);
  return !wall && built && wrote && filesThere(dir) && (dry || dashStop);
}
function removeOutputs(dir) {
  for (const rel of OUTPUT_RELS) {
    const p = path.join(dir, rel);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  const record = path.join(dir, 'engine', 'etiuda.build.json');
  if (fs.existsSync(record)) fs.rmSync(record);
}

function sourceCases() {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'verify.yml'), 'utf8');
  const ci = yml.indexOf('npm ci');
  const step = yml.indexOf('- run: npm run build');
  const legs = yml.indexOf('- name: legs');
  check('verify builds after npm ci and before the legs',
    ci > -1 && step > ci && legs > step && yml.indexOf('- run: npm run build', step + 1) === -1);

  const rel = fs.readFileSync(path.join(ROOT, 'tools', 'release.mjs'), 'utf8');
  const gateBody = between(rel, "gate('line endings and dashes'", 'windowWallRefusal');
  const buildAt = gateBody.indexOf("'tools', 'build.mjs'");
  const readAt = gateBody.indexOf("'engine', 'etiuda.html'");
  check('the line-endings gate builds before it reads the page',
    buildAt > -1 && readAt > buildAt && gateBody.includes("return 'the build did not write the page'"));
  const trackedAt = gateBody.indexOf('git status --porcelain -- engine/');
  const dashAt = gateBody.indexOf('em or en dash(es)');
  check('the gate refuses stale tracked engine outputs right after the build',
    buildAt > -1 && trackedAt > buildAt && dashAt > trackedAt && gateBody.includes('build and commit first'));
  const stopAt = rel.indexOf("args[args.indexOf('--up-to') + 1] === 'page'");
  const exitAt = rel.indexOf('process.exit(0)');
  const wallAt = rel.indexOf('windowWallRefusal');
  check('a dry run stops after the page and before the window wall',
    stopAt > -1 && exitAt > stopAt && wallAt > exitAt);

  const abl = fs.readFileSync(path.join(ROOT, 'tools', 'ablate.mjs'), 'utf8');
  const base = between(abl, "if (cmd === 'baseline')", "if (cmd === 'total')");
  check('baseline builds before it reads the page',
    base.indexOf('build()') > -1 && base.indexOf('build()') < base.indexOf('artefact()'));
  const total = between(abl, "if (cmd === 'total')", "if (cmd === 'changed')");
  const restoreFn = between(abl, 'function restore(', 'function artefact(');
  check('a restore checks out only paths git tracks',
    total.includes('restoreAblation(') && restoreFn.includes('restoreAblation(')
    && !total.includes("git(['checkout'") && !restoreFn.includes("git(['checkout'"));

  const pack = fs.readFileSync(path.join(ROOT, 'tools', 'package.mjs'), 'utf8');
  check('the Windows packager builds before it packages', pack.includes('npm run build && electron-builder'));
  const builder = fs.readFileSync(path.join(ROOT, 'electron-builder.js'), 'utf8');
  check('the packaged list names the page and the pin and not the build record',
    builder.includes('"engine/etiuda.html"') && builder.includes('"engine/etiuda.csp.json"')
    && !builder.includes('etiuda.build.json'));

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  check('the readers leg is on npm test', String(pkg.scripts.test).includes('node tests/build-readers.mjs'));
  const empty = checkoutKnown([]);
  check('checkout of no paths does nothing',
    empty.tracked.length === 0 && empty.skipped.length === 0 && typeof restoreAblation === 'function');
  check('this checkout\'s source and engine are clean', dirty() === '', dirty());
}

function copyRel(fromRoot, toRoot, rel) {
  const src = path.join(fromRoot, ...rel.split('/'));
  const dst = path.join(toRoot, ...rel.split('/'));
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
function writeLf(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.replace(/\r\n/g, '\n'), 'utf8');
}
function gitOk(cwd, args) {
  const r = git(cwd, args);
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + oneLine(r.stderr || r.stdout));
  return r.stdout;
}
function d1Cases(parentDir, homes) {
  d1 = path.join(parentDir, 'd1');
  fs.mkdirSync(path.join(d1, 'engine'), { recursive: true });
  gitOk(parentDir, ['init', d1]);
  gitOk(d1, ['config', 'user.name', 'test']);
  gitOk(d1, ['config', 'user.email', 'test@example.com']);
  gitOk(d1, ['config', 'core.autocrlf', 'false']);
  gitOk(d1, ['config', 'core.eol', 'lf']);
  fs.writeFileSync(path.join(d1, '.git', 'etiuda-names'), 'dummy\n', 'utf8');
  const hook = path.join(d1, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 0\n', 'utf8');
  try { fs.chmodSync(hook, 0o755); } catch {}
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(d1, 'node_modules'), 'junction');

  for (const rel of [
    'tools/release.mjs', 'tools/sellable.mjs', 'tools/sbom.mjs',
    'tools/esigner.cjs', 'tools/test-service.cjs', 'tools/signin-secret.cjs', 'tools/seller-address.cjs',
    'tools/build.mjs', 'tools/bundler-probe/build.mjs',
    'tests/engine.js', 'electron-builder.js',
  ]) copyRel(ROOT, d1, rel);

  writeLf(path.join(d1, '.gitignore'), 'engine/etiuda.build.json\nnode_modules/\n');
  writeLf(path.join(d1, 'package.json'), JSON.stringify({ name: 'etiuda', private: true, version: '0.0.0' }) + '\n');
  writeLf(path.join(d1, 'shell', 'license_en.txt'), 'Licence EN\n');
  writeLf(path.join(d1, 'shell', 'license_pl.txt'), 'Licence PL\n');
  writeLf(path.join(d1, 'src', 'modules', 'env.js'), 'export const E_VERSION = "2.0.0-dev";\nexport const MARK = 1;\n');
  writeLf(path.join(d1, 'src', 'main.js'), [
    'import { E_VERSION, MARK } from "./modules/env.js";',
    'var E_BUILT = "@E_BUILT@";',
    'var EULA = ["@EULA_EN@", "@EULA_PL@"];',
    'globalThis.__d1 = { E_VERSION, MARK, E_BUILT, EULA };',
    '',
  ].join('\n'));
  writeLf(path.join(d1, 'src', 'template.html'), [
    '<!DOCTYPE html>',
    '<meta charset="utf-8">',
    '<title>Etiuda</title>',
    '<style>',
    '/*@BUBBLE-BEGIN*/',
    '.bub { color: inherit; }',
    '.bub-tip { color: inherit; }',
    '/*@BUBBLE-END*/',
    '</style>',
    '<script>window.E_DATA = 1;</script>',
    '<script>',
    '/*@APP*/',
    '</script>',
    '',
  ].join('\n'));

  const built = spawnSync(process.execPath, ['tools/build.mjs'], {
    cwd: d1, env: releaseEnv(homes), encoding: 'utf8', windowsHide: true,
  });
  if (built.status !== 0) throw new Error('d1 build failed: ' + oneLine(built.stderr || built.stdout));
  gitOk(d1, ['add', '-A']);
  const initCommit = git(d1, ['commit', '-m', 'Initial tracked page.']);
  check('d1 scratch repo is ready', initCommit.status === 0, initCommit.stderr || initCommit.stdout);
  if (initCommit.status !== 0) return;

  const current = runRelease(d1, homes);
  check('a committed page that is current passes gate 4',
    current.status === 0 && current.out.includes(DRY) && !current.out.includes('build and commit first'),
    'exit ' + current.status + ' ' + oneLine(current.out));

  const committedHtml = gitOk(d1, ['show', 'HEAD:engine/etiuda.html']);
  writeLf(path.join(d1, 'src', 'modules', 'env.js'), 'export const E_VERSION = "2.0.0-dev";\nexport const MARK = 2;\n');
  gitOk(d1, ['add', 'src/modules/env.js']);
  gitOk(d1, ['commit', '-m', 'Source moved without rebuilding the page.']);

  const stale = runRelease(d1, homes);
  const headHtmlAfter = gitOk(d1, ['show', 'HEAD:engine/etiuda.html']);
  const staleStop = (stale.out.split(/\n/).find(l => l.includes('STOP:')) || '');
  check('a stale committed page stops release with build and commit first',
    stale.status !== 0 && stale.out.includes('build and commit first')
    && !stale.out.includes(DRY) && !stale.out.includes('#refused window-wall') && !/\n\[5\] /.test(stale.out),
    'exit ' + stale.status + ' ' + oneLine(staleStop || stale.out));
  check('the commit still holds the stale page bytes', headHtmlAfter === committedHtml);

  gitOk(d1, ['checkout', '--', ...OUTPUT_RELS]);

  if (!PLANTS) {
    console.log('NOT RUN plant:release-tracked-build (ETIUDA_PLANTS=off)');
  } else {
    const relPath = path.join(d1, 'tools', 'release.mjs');
    const relSrc = fs.readFileSync(relPath, 'utf8');
    const marker = '/* plant:release-tracked-build */';
    if (!relSrc.includes(marker)) {
      check('lifting the tracked-build check lets a stale page pass gate 4', false, 'marker absent');
    } else {
      const liftedSrc = relSrc.split('\n').filter(l => !l.includes(marker)).join('\n');
      fs.writeFileSync(relPath, liftedSrc, 'utf8');
      gitOk(d1, ['add', 'tools/release.mjs']);
      gitOk(d1, ['commit', '-m', 'Lift tracked-build check.']);
      const liftedRun = runRelease(d1, homes);
      check('lifting the tracked-build check lets a stale page pass gate 4',
        liftedRun.status === 0 && liftedRun.out.includes(DRY) && !liftedRun.out.includes('build and commit first'),
        'exit ' + liftedRun.status + ' ' + oneLine(liftedRun.out));
      fs.writeFileSync(relPath, relSrc, 'utf8');
      gitOk(d1, ['add', 'tools/release.mjs']);
      gitOk(d1, ['commit', '-m', 'Restore tracked-build check.']);
      gitOk(d1, ['checkout', '--', ...OUTPUT_RELS]);
    }
  }

  gitOk(d1, ['rm', '--cached', '-q', '--', ...OUTPUT_RELS]);
  removeOutputs(d1);
  gitOk(d1, ['commit', '-m', 'Outputs leave git.']);
  const untrackedRaw = runRelease(d1, homes);
  check('untracked unignored outputs pass gate 4',
    untrackedRaw.status === 0 && untrackedRaw.out.includes(DRY) && !untrackedRaw.out.includes('build and commit first'),
    'exit ' + untrackedRaw.status + ' ' + oneLine(untrackedRaw.out));

  removeOutputs(d1);
  writeLf(path.join(d1, '.gitignore'), 'engine/etiuda.build.json\nnode_modules/\n' + OUTPUT_RELS.join('\n') + '\n');
  gitOk(d1, ['add', '.gitignore']);
  gitOk(d1, ['commit', '-m', 'Ignore untracked outputs.']);
  const untrackedIgnored = runRelease(d1, homes);
  check('untracked ignored outputs pass gate 4',
    untrackedIgnored.status === 0 && untrackedIgnored.out.includes(DRY) && !untrackedIgnored.out.includes('build and commit first'),
    'exit ' + untrackedIgnored.status + ' ' + oneLine(untrackedIgnored.out));
}

async function scratchCases(parentDir, homes) {
  scratch = path.join(parentDir, 'full');
  note('worktree ' + scratch);
  const added = git(ROOT, ['worktree', 'add', '--detach', scratch, 'HEAD']);
  if (added.status !== 0) {
    check('the scratch worktree is the readers', false, added.stderr || added.stdout);
    return;
  }
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(scratch, 'node_modules'), 'junction');
  const copied = [];
  for (const rel of OVERLAY) {
    const from = path.join(ROOT, rel);
    const to = path.join(scratch, rel);
    const a = fs.readFileSync(from);
    const b = fs.readFileSync(to);
    if (a.equals(b)) continue;
    fs.writeFileSync(to, a);
    copied.push(rel);
  }
  if (copied.length) {
    note('scratch commit ' + copied.join(' '));
    const staged = git(scratch, ['add', '--', ...copied]);
    if (staged.status !== 0) throw new Error('git add failed: ' + oneLine(staged.stderr || staged.stdout));
    const committed = git(scratch, ['commit', '-m', 'The readers build the page before they read it.']);
    check('the scratch commit holds the readers', committed.status === 0,
      committed.stderr || committed.stdout);
    if (committed.status !== 0) return;
  } else {
    check('the scratch commit holds the readers', true);
  }

  const present = runRelease(scratch, homes);
  const presentStatus = git(scratch, ['status', '--porcelain', '--untracked-files=all']);
  const presentStop = (present.out.split(/\n/).find(l => l.includes('STOP:')) || '');
  note('release present exit ' + present.status + ' ' + oneLine(presentStop));
  check('release with the page present stops before the window wall',
    releaseJudged(present, scratch, false) && (presentStatus.stdout || '').trim() === '',
    'exit ' + present.status + ' ' + oneLine(presentStop)
    + ' status ' + oneLine(presentStatus.stdout));

  const api = (await import(pathToFileURL(path.join(scratch, 'tools', 'ablate.mjs')).href));
  const html = path.join(scratch, 'engine', 'etiuda.html');
  const beforeHtml = fs.readFileSync(html);
  fs.appendFileSync(html, '\n');
  let known = null;
  try { known = api.checkoutKnown(['src/modules', ...OUTPUT_RELS]); }
  catch (e) { check('tracked paths check out', false, e && e.message || e); }
  if (known) {
    check('tracked paths check out',
      known.skipped.length === 0 && known.tracked.length === 1 + OUTPUT_RELS.length
      && fs.readFileSync(html).equals(beforeHtml),
      'tracked=' + known.tracked.length + ' skipped=' + known.skipped.length);
  }

  const removed = git(scratch, ['rm', '--cached', '-q', '--', ...OUTPUT_RELS]);
  if (removed.status !== 0) throw new Error('git rm --cached failed: ' + oneLine(removed.stderr || removed.stdout));
  const untracked = git(scratch, ['commit', '-m', 'This copy makes the page by building.']);
  check('the scratch can commit the page out of the index', untracked.status === 0,
    untracked.stderr || untracked.stdout);
  if (untracked.status !== 0) return;

  const quiet = api.dirty();
  check('untracked outputs are not dirt', quiet === '', quiet);
  const extra = path.join(scratch, 'src', 'bod-extra.js');
  fs.writeFileSync(extra, 'not part of the build\n');
  const extraDirt = api.dirty();
  check('another untracked file is dirt',
    extraDirt.includes('src/bod-extra.js') && !extraDirt.includes('etiuda.html'), extraDirt);
  fs.rmSync(extra);
  const envFile = path.join(scratch, 'src', 'modules', 'env.js');
  const envBefore = fs.readFileSync(envFile);
  fs.appendFileSync(envFile, '\n');
  check('a tracked source edit is still dirt', api.dirty().includes('src/modules/env.js'));
  api.checkoutKnown(['src/modules/env.js']);
  check('the source edit is checked out',
    fs.readFileSync(envFile).equals(envBefore) && api.dirty() === '');

  /* Git reads excludes from the common directory, which this run must not write. The file
     sits outside the repository and is named only in this process's environment, so status
     here and in the release this process starts both hide the three outputs. */
  const excludeFile = path.join(parent, 'exclude');
  fs.writeFileSync(excludeFile, OUTPUT_RELS.join('\n') + '\n');
  process.env.GIT_CONFIG_COUNT = '1';
  process.env.GIT_CONFIG_KEY_0 = 'core.excludesFile';
  process.env.GIT_CONFIG_VALUE_0 = excludeFile.replace(/\\/g, '/');

  removeOutputs(scratch);
  let skipped = null;
  try { skipped = api.checkoutKnown(OUTPUT_RELS); }
  catch (e) { check('untracked outputs are skipped, not checked out', false, e && e.message || e); }
  if (skipped) {
    check('untracked outputs are skipped, not checked out',
      skipped.tracked.length === 0 && skipped.skipped.length === OUTPUT_RELS.length
      && !filesThere(scratch),
      'tracked=' + skipped.tracked.join(',') + ' skipped=' + skipped.skipped.join(','));
  }
  const restored = api.restoreAblation(OUTPUT_RELS);
  const afterRestore = git(scratch, ['status', '--porcelain', '--untracked-files=all']);
  check('a restore builds the outputs git does not track',
    restored.skipped.length === OUTPUT_RELS.length && filesThere(scratch)
    && (afterRestore.stdout || '').trim() === '' && api.dirty() === '',
    oneLine(afterRestore.stdout || afterRestore.stderr));

  removeOutputs(scratch);
  const absent = runRelease(scratch, homes);
  const absentStatus = git(scratch, ['status', '--porcelain', '--untracked-files=all']);
  const absentStop = (absent.out.split(/\n/).find(l => l.includes('STOP:')) || '');
  note('release absent exit ' + absent.status + ' ' + oneLine(absentStop));
  check('release writes an absent page and stops before the window wall',
    releaseJudged(absent, scratch, true) && (absentStatus.stdout || '').trim() === '',
    'exit ' + absent.status + ' ' + oneLine(absentStop)
    + ' status ' + oneLine(absentStatus.stdout));
}

function cleanup() {
  const modules = path.join(ROOT, 'node_modules');
  const before = fs.existsSync(modules);
  if (d1) {
    try { dropJunction(d1); }
    catch (e) { console.log('  FAIL d1 junction left in place: ' + oneLine(e.message)); return; }
  }
  if (scratch) {
    try { dropJunction(scratch); }
    catch (e) { console.log('  FAIL junction left in place: ' + oneLine(e.message)); return; }
    const removed = git(ROOT, ['worktree', 'remove', '--force', scratch]);
    if (removed.status !== 0) note('worktree remove: ' + oneLine(removed.stderr || removed.stdout));
  }
  try { if (parent && fs.existsSync(parent)) fs.rmSync(parent, { recursive: true, force: true }); }
  catch (e) { note('remove ' + oneLine(e.message)); }
  if (before && !fs.existsSync(modules)) console.log('  FAIL the checkout node_modules is gone');
}

try {
  sourceCases();
  parent = fs.mkdtempSync(path.join(os.tmpdir(), 'bod-readers-'));
  const homes = path.join(parent, 'homes');
  fs.mkdirSync(homes, { recursive: true });
  d1Cases(parent, homes);
  await scratchCases(parent, homes);
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
