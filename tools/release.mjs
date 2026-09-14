/* The 2.x landing sequence as one command, spec 11.8.
 *
 *   node tools/release.mjs              every gate, and nothing that writes outside a temp folder
 *   node tools/release.mjs --package    the gates, then builds the Windows installer from the tree
 *   ETIUDA_DIST=<folder> ...            where --package puts it; dist/ when unset
 *
 * WHY THIS IS NOT THE release.js AT THE ROOT. That one is 1.x's, gitignored with the rest of the
 * 1.x tooling, and it speaks of five published files, PB_VERSION and a Pages build, none of which
 * 2.x has. This one is tracked, because the standing hazard of spec 11's closing note is tooling
 * that lives only in ignored files, and a release script is the last place to repeat it.
 *
 * THERE IS NO --tag AND NO --push, deliberately, so that their absence reads as a decision rather
 * than as an omission. A tag is a release and a push of main is Maxim's act, gated behind
 * ETIUDA_PUSH by a hook this script must not reach around. What the gates are for is to make the
 * moment he does it uneventful.
 *
 * Each gate stops the run and the exit code is its number, so a failure names itself. A gate that
 * cannot run says NOT RUN and fails: a skipped gate that prints nothing reads exactly like one
 * that passed, which is the mistake this harness has made before. */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const FIXTURES = process.env.ETIUDA_FIXTURES;
const DIST = process.env.ETIUDA_DIST || join(ROOT, 'dist');

let step = 0;
const gate = (title, fn) => {
  step++;
  process.stdout.write('\n[' + step + '] ' + title + '\n');
  let r;
  try { r = fn(); } catch (e) { r = String(e && e.message || e); }
  if (r !== true) { console.error('  STOP: ' + (r || 'failed')); process.exit(step); }
  console.log('  ok');
};
const sh = (cmd, opts) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...(opts || {}) }).trim();
const run = (cmd, argv, env) => spawnSync(cmd, argv, {
  cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
  env: { ...process.env, ...(env || {}) },
}).status === 0;
const npm = script => run('npm', ['run', script]);

gate('the tree is clean, and this is the commit a release would be of', () => {
  if (sh('git status --porcelain')) return 'uncommitted changes; a release is of a commit, not of a working tree';
  console.log('  ' + sh('git log -1 --oneline') + '   on ' + sh('git rev-parse --abbrev-ref HEAD'));
  return true;
});

gate('the version, read where the rulebook keeps it', () => {
  const m = readFileSync(join(ROOT, 'src', 'modules', 'env.js'), 'utf8').match(/E_VERSION\s*=\s*["']([^"']+)["']/);
  if (!m) return 'E_VERSION is not in src/modules/env.js';
  console.log('  E_VERSION ' + m[1] + ', and package.json stays at ' + JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version);
  return true;
});

/* The scan's own ammunition is not in this repository and no clone carries it, so this gate is
   the one that can honestly be absent. It fails rather than skips, and says why. */
gate('the name scan over the tracked tree', () => {
  const gitDir = sh('git rev-parse --git-dir');
  if (!existsSync(join(ROOT, gitDir, 'etiuda-names')))
    return 'NOT RUN: .git/etiuda-names is absent, so the scan has nothing to look for. See tools/pre-commit.';
  return run('bash', ['.git/hooks/pre-commit']) ? true : 'the scan refused the tree';
});

gate('line endings and dashes', () => {
  const files = sh('git ls-files').split(/\r?\n/).filter(f => /\.(js|mjs|html|json|md|css)$/.test(f));
  const crs = files.filter(f => readFileSync(join(ROOT, f), 'utf8').includes('\r'));
  if (crs.length) return crs.length + ' tracked file(s) hold a CR: ' + crs.slice(0, 5).join(', ');
  const engine = readFileSync(join(ROOT, 'engine', 'etiuda.html'), 'utf8');
  /* Built from char codes: an en dash written into this file would be the very thing
     the gate refuses, and this file is tracked in the same tree. */
  const DASHES = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']', 'g');
  const dashes = (engine.match(DASHES) || []).length;
  if (dashes) return dashes + ' em or en dash(es) in the artefact';
  console.log('  ' + files.length + ' tracked text file(s), all LF, and no em or en dash in the artefact');
  return true;
});

/* npm test carries build-fresh, so the artefact and its hash pin are proved to be the build of
   src/ inside this gate rather than beside it. */
gate('the harness: npm test' + (FIXTURES ? ' with fixtures' : ', WITHOUT fixtures'), () => {
  if (!FIXTURES) return 'NOT RUN in full: ETIUDA_FIXTURES is unset, so the catalog lint and the search evaluation would say NOT RUN and a release cannot be taken on that';
  return npm('test') ? true : 'npm test failed';
});

gate('the module gates: npm run split-guard', () => npm('split-guard') ? true : 'npm run split-guard failed');

/* Three instruments, and the third is the only one that drives what a customer installs.
   csp.js and desk.js start Electron on a throwaway folder of loose files, which is not the
   delivery: shell-smoke.js runs electron-builder --win --dir and drives win-unpacked/Etiuda.exe
   over the debugging port. Board 356 is why it is here. The packaged app could not load a
   catalog at all - 0 cards against a 258-card fixture, the offer back up - and every gate in
   this script was green over it, twice, because nothing in the sequence had ever started the
   built application. It costs about 115 s and it needs Windows, as csp.js and desk.js already
   do since both kill Electron through taskkill. */
gate('the shell: npm run csp, npm run desk and npm run shell-smoke', () => {
  if (!npm('csp')) return 'npm run csp failed';
  if (!npm('desk')) return 'npm run desk failed';
  return npm('shell-smoke') ? true : 'npm run shell-smoke failed: the packaged app is what ships, so this gate is not optional';
});

gate('the acceptance run: npm run smoke', () => npm('smoke') ? true : 'npm run smoke failed');

/* The asar is where the allowlist is either kept or quietly widened, so it is read rather than
   trusted: four bytes of pickle size, then the header's own length at offset 12, then the JSON.
   A file that reached a customer's machine without passing through electron-builder.js's list
   would show up here as a name nobody put there. */
function asarEntries(file) {
  const fd = readFileSync(file);
  const len = fd.readUInt32LE(12);
  const header = JSON.parse(fd.slice(16, 16 + len).toString('utf8'));
  const out = [];
  (function walk(node, at) {
    for (const name of Object.keys(node.files || {})) {
      const child = node.files[name];
      if (child.files) walk(child, at + name + '/');
      else out.push(at + name);
    }
  })(header, '');
  return out.sort();
}

if (flag('--package')) {
  gate('the installer, built from this tree into ' + DIST, () => {
    if (!run('npm', ['run', 'package'], { ETIUDA_DIST: DIST })) return 'electron-builder failed';
    const exe = readdirSync(DIST).filter(f => /-setup\.exe$/i.test(f));
    if (exe.length !== 1) return DIST + ' holds ' + exe.length + ' installers; expected 1';
    const file = join(DIST, exe[0]);
    const bytes = statSync(file).size;
    console.log('  ' + exe[0] + '  ' + bytes + ' bytes, sha256 '
      + createHash('sha256').update(readFileSync(file)).digest('hex'));
    const inside = asarEntries(join(DIST, 'win-unpacked', 'resources', 'app.asar'));
    const expected = ['engine/etiuda.csp.json', 'engine/etiuda.html', 'package.json', 'shell/main.js', 'shell/preload.js'];
    console.log('  the asar holds ' + inside.length + ': ' + inside.join(', '));
    if (JSON.stringify(inside) !== JSON.stringify(expected)) return 'the asar is not the allowlist';
    return true;
  });

  gate('the signature, which says NotSigned until there is a certificate', () => {
    const file = join(DIST, readdirSync(DIST).filter(f => /-setup\.exe$/i.test(f))[0]);
    if (process.platform !== 'win32') { console.log('  not Windows, so there is nothing to ask'); return true; }
    const status = sh('powershell -NoProfile -Command "(Get-AuthenticodeSignature \'' + file + '\').Status"');
    console.log('  Authenticode: ' + status
      + (status === 'NotSigned' ? '  (a log line reading "signing with signtool.exe" is the asar integrity edit, not a signature)' : ''));
    return true;
  });
}

console.log('\nGates green' + (flag('--package') ? ', and the installer is in ' + DIST : '')
  + '. Nothing was tagged and nothing was pushed: both are Maxim\'s, and this script has no flag for either.');
