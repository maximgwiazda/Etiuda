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
import { dirname, join, resolve } from 'node:path';
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
/* --tree, and the flag is the whole gate. Without it the hook reads the STAGED diff, which gate
   1 has just guaranteed is empty, so this gate passed on nothing every time it has ever run. */
/* NEITHER PATH IS SPELLED, because in a git worktree .git is a FILE and neither of them is under
   it. `git rev-parse --git-dir` answers the worktree's private directory, which is where
   tools/pre-commit looks for its list, and `--git-common-dir` answers the shared one, which is
   where the installed hooks are and where git itself would find them. In an ordinary checkout
   both answer `.git` and this is the same gate it always was. Either answer can come back
   relative to the current directory, so resolve() rather than join(): join(ROOT, 'C:/x') is
   ROOT + '/C:/x', which is the shape the old line failed in - it reported the list absent from a
   worktree where the list was in fact present in both directories, and stopped the release at
   gate 3. Measured 2026-09-15, exit 3 before this change and green after. */
gate('the name and quote scans over the tracked tree', () => {
  const gitDir = resolve(ROOT, sh('git rev-parse --git-dir'));
  const hook = join(resolve(ROOT, sh('git rev-parse --git-common-dir')), 'hooks', 'pre-commit');
  const names = join(gitDir, 'etiuda-names');
  if (!existsSync(names))
    return 'NOT RUN: ' + names + ' is absent, so the scan has nothing to look for. See tools/pre-commit.';
  if (!existsSync(hook))
    return 'NOT RUN: no installed hook at ' + hook + ', so this gate would judge nothing. See the head of tools/pre-commit.';
  /* QUOTED ONLY WHERE A SHELL WILL EAT THE QUOTES, board item 613. run() sets shell:true on
     Windows, where a path holding a space would otherwise be two arguments; off Windows there is
     no shell, so the quotation marks become part of the file name and bash reports a path that
     does not exist. The condition is the same one run() uses, read from the same place. */
  const quoted = process.platform === 'win32' ? '"' + hook + '"' : hook;
  return run('bash', [quoted, '--tree']) ? true : 'the scan refused the tree';
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
gate('the shell: npm run csp, npm run desk, npm run catalog-watch and npm run shell-smoke', () => {
  if (!npm('csp')) return 'npm run csp failed';
  if (!npm('desk')) return 'npm run desk failed';
  if (!npm('catalog-watch')) return 'npm run catalog-watch failed';
  return npm('shell-smoke') ? true : 'npm run shell-smoke failed: the packaged app is what ships, so this gate is not optional';
});

/* storage-carry beside smoke since 2026-09-24: the carries a desk arrives with (a 1.16.7 desk's
   keys, a layer under the catalog's name, positions re-keyed by tag id) are driven there in a
   browser against a real boot, and until then no chain called it. About 16 s. tests/engine-selftest.js
   31 holds every gate in tests/ to a chain. */
gate('the acceptance run: npm run smoke and npm run storage-carry', () => {
  if (!npm('smoke')) return 'npm run smoke failed';
  return npm('storage-carry') ? true : 'npm run storage-carry failed: a desk arriving from an earlier version is carried by that code';
});

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
    /* Written out rather than read from electron-builder.js, so that widening that list is
       refused here instead of followed. The same six are stated in the builder's `files` and
       in tests/reinstall.js 1c: all three move together or this gate stops the release. */
    const expected = ['engine/etiuda.csp.json', 'engine/etiuda.html', 'package.json',
                      'shell/main.js', 'shell/preload.js', 'shell/sample-catalog.ec'];
    console.log('  the asar holds ' + inside.length + ': ' + inside.join(', '));
    if (JSON.stringify(inside) !== JSON.stringify(expected)) return 'the asar is not the allowlist';
    return true;
  });

  /* The gate that follows the installer's build, and it drives the file that gate just made
     rather than building a second one: install silently into a scratch folder, write a key and a
     catalog through the running app, uninstall, install again and read both back, with the
     uninstall's four absences checked. About 50 s on top of a build that is already 8 minutes,
     which is why it is in the sequence rather than beside it. It is the only gate here that
     writes anywhere outside a temp folder: it borrows this machine's own user-data folder,
     parks the desk files it finds there and puts them back, because Electron ignores the APPDATA
     environment variable and a desk in a lab folder could not be said to have survived anything.
     See the header of tests/reinstall.js. */
  gate('the reinstall-survival loop: npm run reinstall, against the installer above', () => {
    const exe = readdirSync(DIST).filter(f => /-setup\.exe$/i.test(f));
    if (exe.length !== 1) return DIST + ' holds ' + exe.length + ' installers; expected 1';
    return run('npm', ['run', 'reinstall'], { ETIUDA_SETUP_EXE: join(DIST, exe[0]) })
      ? true : 'npm run reinstall failed: what a customer installs is what this gate drives';
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
