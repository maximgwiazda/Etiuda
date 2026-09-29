/* THE SOFTWARE BILL OF MATERIALS: tools/sbom.mjs, and tools/release.mjs writing it.
 *
 *   node tests/sbom.mjs [--keep]      exit code is the number of failed checks, capped at 63
 *
 * Nothing here packages anything and nothing reaches the network. Each claim is driven through the
 * tool's own command line, and the release is driven in a throwaway repository with stub scripts
 * and a stub installer. What each leg holds:
 *   1  this tree: CycloneDX 1.5, the desk at E_VERSION, Electron at the version npm installed and
 *      the lockfile records, no devDependency, and the npm set the lockfile's own closure
 *   2  a dependency added to package.json appears with everything it pulls in, and not before
 *   3  a synthetic tree with frozen expected versions: nested, scoped, dev and optional cases, an optional
 *      dependency both absent and installed
 *   4  a declared dependency that is not installed refuses and writes no file
 *   5  given the packaged app, the archive is held against the list both ways, on the desk's own
 *      shape (six files, no node_modules) as well; no folder of the build machine is in the file
 *   6  given the installer, its SHA-256 is carried, against a frozen literal from sha256sum
 *   7  tools/release.mjs --package leaves the document beside the installer, and a refusal leaves
 *      none and stops the package gate
 */
process.removeAllListeners('warning');
process.on('warning', () => {});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'tools', 'sbom.mjs');
const KEEP = process.argv.indexOf('--keep') > -1;
const require = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 28;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log('  ok   ' + line);
  else { failed++; console.log('  FAIL ' + line); }
}

const JUNCTIONS = [];
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'etiuda-sbom-'));
function lab(name) { const d = path.join(SCRATCH, name); fs.mkdirSync(d, { recursive: true }); return d; }
function put(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n');
}
function run(argv) {
  const r = spawnSync(process.execPath, [TOOL].concat(argv), { encoding: 'utf8', timeout: 60000 });
  return { status: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}
function bomAt(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
/* The npm packages a BOM lists, as name@version, sorted: Electron counted apart. */
function npmSet(bom) {
  return ((bom && bom.components) || []).filter(c => /^pkg:npm\//.test(c.purl || '') && c.name !== 'electron')
    .map(c => (c.group ? c.group + '/' : '') + c.name + '@' + c.version).sort();
}
function comp(bom, name) { return ((bom && bom.components) || []).find(c => c.name === name) || null; }
const envJs = v => 'const E_VERSION="' + v + '";\n';

/* THE SECOND IMPLEMENTATION: npm's own record of what it resolved, walked from package.json's
   production dependencies with node's lookup over package-lock.json's paths rather than the disk,
   written apart from the tool so the two agree only if both are right. */
function lockClosure(pkg, lock) {
  const P = lock.packages || {};
  const out = new Set();
  const seen = new Set();
  function find(from, name) {
    let at = from;
    for (;;) {
      const cand = (at ? at + '/' : '') + 'node_modules/' + name;
      if (P[cand]) return cand;
      if (!at) return null;
      const i = at.lastIndexOf('/node_modules/');
      at = i < 0 ? '' : at.slice(0, i);
    }
  }
  function visit(from, deps) {
    for (const name of Object.keys(deps || {})) {
      const p = find(from, name);
      if (!p || seen.has(p)) continue;
      seen.add(p);
      out.add(name + '@' + P[p].version);
      visit(p, Object.assign({}, P[p].dependencies, P[p].optionalDependencies));
    }
  }
  visit('', Object.assign({}, pkg.dependencies, pkg.optionalDependencies));
  return [...out].sort();
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
const VERSION = (/E_VERSION\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, 'src', 'modules', 'env.js'), 'utf8')) || [])[1] || '';

async function main() {
  check(fs.existsSync(TOOL), '0 the tool is there: tools/sbom.mjs');
  if (!fs.existsSync(TOOL)) return;

  /* ---- 1. THIS TREE ------------------------------------------------------------------------ */
  const out1 = path.join(lab('tree'), 'tree.cdx.json');
  const r1 = run(['--root', ROOT, '--out', out1]);
  const b1 = bomAt(out1);
  check(r1.status === 0 && !!b1 && b1.bomFormat === 'CycloneDX' && b1.specVersion === '1.5'
    && /^urn:uuid:[0-9a-f-]{36}$/.test(b1.serialNumber || ''),
    '1a the tree gives a CycloneDX 1.5 document, exit ' + r1.status
    + (r1.status ? '; ' + r1.out.trim().split(/\r?\n/).slice(-2).join(' | ') : ''));
  const mc = b1 && b1.metadata && b1.metadata.component;
  check(!!mc && mc.name === pkg.name && mc.version === VERSION && VERSION !== '' && mc.version !== pkg.version && mc.type === 'application',
    '1b the subject is ' + JSON.stringify(mc && [mc.name, mc.version, mc.type]) + ': package.json\'s name '
    + JSON.stringify(pkg.name) + ' at src/modules/env.js\'s E_VERSION ' + JSON.stringify(VERSION)
    + ', not package.json\'s ' + JSON.stringify(pkg.version));
  /* Electron's version from two places the tool does not read: the version file inside the
     Electron npm unpacked, and the lockfile's record. Both must be the document's. */
  const distVersion = fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'dist', 'version'), 'utf8').trim();
  const lockV = (lock.packages['node_modules/electron'] || {}).version;
  const e1 = comp(b1, 'electron');
  check(/^\d+\.\d+\.\d+$/.test(distVersion) && !!e1 && e1.version === distVersion && e1.version === lockV
    && e1.purl === 'pkg:npm/electron@' + distVersion && e1.scope === 'required',
    '1c Electron is listed at ' + JSON.stringify(e1 && e1.version) + ' against node_modules/electron/dist/version '
    + JSON.stringify(distVersion) + ' and the lockfile\'s ' + JSON.stringify(lockV));
  const devNames = Object.keys(pkg.devDependencies || {}).filter(n => n !== 'electron');
  const devListed = devNames.filter(n => ((b1 && b1.components) || []).some(c => (c.group ? c.group + '/' : '') + c.name === n));
  check(devNames.length >= 3 && devListed.length === 0,
    '1d none of the ' + devNames.length + ' devDependencies but Electron is listed (' + JSON.stringify(devListed)
    + ' listed of ' + JSON.stringify(devNames) + ')');
  const want1 = lockClosure(pkg, lock);
  check(JSON.stringify(npmSet(b1)) === JSON.stringify(want1),
    '1e the npm packages listed, ' + JSON.stringify(npmSet(b1)) + ', are the lockfile\'s production closure '
    + JSON.stringify(want1));

  /* ---- 2. A DEPENDENCY ADDED TO package.json APPEARS ---------------------------------------- */
  /* The real package.json and the real node_modules through a junction, so the walk is over what
     npm installed; the addition is already installed as a dev tool, so no network is needed. */
  const ADD = '@electron/asar';
  function realLab(name, extra) {
    const d = lab(name);
    const p = JSON.parse(JSON.stringify(pkg));
    if (extra) p.dependencies = Object.assign({}, p.dependencies, extra);
    put(path.join(d, 'package.json'), p);
    put(path.join(d, 'src', 'modules', 'env.js'), envJs(VERSION));
    execFileSync('cmd.exe', ['/d', '/c', 'mklink', '/J', path.join(d, 'node_modules'), path.join(ROOT, 'node_modules')],
      { stdio: 'ignore', windowsHide: true });
    JUNCTIONS.push(path.join(d, 'node_modules'));
    return { d, p };
  }
  const before = realLab('real-before', null);
  const after = realLab('real-after', { [ADD]: lock.packages['node_modules/' + ADD].version });
  const r2a = run(['--root', before.d, '--out', path.join(before.d, 'bom.json')]);
  const r2b = run(['--root', after.d, '--out', path.join(after.d, 'bom.json')]);
  const b2a = bomAt(path.join(before.d, 'bom.json')), b2b = bomAt(path.join(after.d, 'bom.json'));
  const want2 = lockClosure(after.p, lock);
  const asarV = lock.packages['node_modules/' + ADD].version;
  check(r2a.status === 0 && !!b2a && !npmSet(b2a).some(s => s.indexOf(ADD + '@') === 0),
    '2a without the addition, ' + ADD + ' is not listed (exit ' + r2a.status + ', ' + npmSet(b2a).length + ' npm package(s))');
  check(r2b.status === 0 && npmSet(b2b).indexOf(ADD + '@' + asarV) > -1,
    '2b with ' + ADD + ' added to dependencies it is listed at ' + asarV + ', the lockfile\'s version (exit '
    + r2b.status + (r2b.status ? '; ' + r2b.out.trim().split(/\r?\n/).slice(-1)[0] : '') + ')');
  check(want2.length >= 4 && JSON.stringify(npmSet(b2b)) === JSON.stringify(want2),
    '2c and so is everything it pulls in: ' + npmSet(b2b).length + ' package(s) listed against the lockfile\'s '
    + want2.length + ' (' + want2.join(', ') + ')');
  const top = b2b && (b2b.dependencies || []).find(d => d.ref === (b2b.metadata.component || {})['bom-ref']);
  const asarNode = b2b && (b2b.dependencies || []).find(d => d.ref === 'pkg:npm/%40electron/asar@' + asarV);
  const asarDeps = Object.keys(lock.packages['node_modules/' + ADD].dependencies || {}).sort();
  check(!!top && top.dependsOn.indexOf('pkg:npm/%40electron/asar@' + asarV) > -1
    && !!asarNode && asarNode.dependsOn.map(r => /^pkg:npm\/([^@]+)@/.exec(r)[1]).sort().join(',') === asarDeps.join(','),
    '2d the graph says the desk depends on ' + ADD + ' and ' + ADD + ' on ' + JSON.stringify(asarNode && asarNode.dependsOn)
    + ', against the lockfile\'s ' + JSON.stringify(asarDeps));

  /* ---- 3. A SYNTHETIC TREE, THE EXPECTED LIST WRITTEN BEFORE THE TOOL RAN ------------------ */
  const syn = lab('synthetic');
  function synTree(d, extraDeps) {
    put(path.join(d, 'package.json'), { name: 'etiuda', version: '0.0.0',
      dependencies: Object.assign({ alpha: '^1.0.0', '@sc/beta': '2.x' }, extraDeps || {}),
      optionalDependencies: { gamma: '*' },
      devDependencies: { delta: '1.0.0', electron: '9.9.9' } });
    put(path.join(d, 'src', 'modules', 'env.js'), envJs('7.8.9'));
    const nm = path.join(d, 'node_modules');
    put(path.join(nm, 'alpha', 'package.json'), { name: 'alpha', version: '1.2.3', license: 'MIT', dependencies: { shared: '^1.0.0' } });
    put(path.join(nm, 'alpha', 'node_modules', 'shared', 'package.json'), { name: 'shared', version: '1.5.0', license: 'ISC' });
    put(path.join(nm, 'alpha', 'lib', 'package.json'), { type: 'module' });
    put(path.join(nm, '@sc', 'beta', 'package.json'), { name: '@sc/beta', version: '2.0.1', license: '(MIT OR Apache-2.0)', dependencies: { shared: '^2.0.0' } });
    put(path.join(nm, 'shared', 'package.json'), { name: 'shared', version: '2.0.0', license: 'ISC' });
    put(path.join(nm, 'delta', 'package.json'), { name: 'delta', version: '1.0.0', dependencies: { epsilon: '3' } });
    put(path.join(nm, 'epsilon', 'package.json'), { name: 'epsilon', version: '3.0.0' });
    put(path.join(nm, 'electron', 'package.json'), { name: 'electron', version: '9.9.9', license: 'MIT' });
  }
  synTree(syn);
  const r3 = run(['--root', syn, '--out', path.join(syn, 'bom.json')]);
  const b3 = bomAt(path.join(syn, 'bom.json'));
  const WANT3 = ['@sc/beta@2.0.1', 'alpha@1.2.3', 'shared@1.5.0', 'shared@2.0.0'];
  check(r3.status === 0 && JSON.stringify(npmSet(b3)) === JSON.stringify(WANT3),
    '3a the synthetic tree lists ' + JSON.stringify(npmSet(b3)) + ' against the frozen ' + JSON.stringify(WANT3)
    + ': nested and scoped kept, delta (dev), epsilon (dev\'s own) and gamma (optional, not installed) absent; exit ' + r3.status);
  const e3 = comp(b3, 'electron');
  check(!!e3 && e3.version === '9.9.9' && ((b3 && b3.metadata.component) || {}).version === '7.8.9',
    '3b Electron 9.9.9 and the desk 7.8.9, both the synthetic tree\'s');
  const alphaEdge = b3 && (b3.dependencies || []).find(d => d.ref === 'pkg:npm/alpha@1.2.3');
  const betaEdge = b3 && (b3.dependencies || []).find(d => d.ref === 'pkg:npm/%40sc/beta@2.0.1');
  check(!!alphaEdge && alphaEdge.dependsOn.join() === 'pkg:npm/shared@1.5.0'
    && !!betaEdge && betaEdge.dependsOn.join() === 'pkg:npm/shared@2.0.0',
    '3c each package depends on the copy node would load: alpha on ' + JSON.stringify(alphaEdge && alphaEdge.dependsOn)
    + ' (its nested 1.5.0), @sc/beta on ' + JSON.stringify(betaEdge && betaEdge.dependsOn) + ' (the top-level 2.0.0)');
  const beta = comp(b3, 'beta'), alpha = comp(b3, 'alpha');
  check(!!beta && beta.group === '@sc' && JSON.stringify(beta.licenses) === JSON.stringify([{ expression: '(MIT OR Apache-2.0)' }])
    && !!alpha && JSON.stringify(alpha.licenses) === JSON.stringify([{ license: { id: 'MIT' } }]),
    '3d licences carried from each package.json: alpha ' + JSON.stringify(alpha && alpha.licenses) + ', @sc/beta '
    + JSON.stringify(beta && beta.licenses));

  /* 3e AN OPTIONAL DEPENDENCY THAT IS INSTALLED IS LISTED, with its own dependency (board 819). Every
     arm above has gamma declared and absent, so a tool that never walked optionalDependencies at all
     passed all 27 checks (the test architect's plant of 2026-09-29). The same tree with gamma on the
     disk, and the expected list written here before the tool ran. */
  const synOpt = lab('synthetic-optional');
  synTree(synOpt);
  put(path.join(synOpt, 'node_modules', 'gamma', 'package.json'), { name: 'gamma', version: '0.4.0', license: 'MIT', dependencies: { theta: '1' } });
  put(path.join(synOpt, 'node_modules', 'theta', 'package.json'), { name: 'theta', version: '1.0.0', license: 'ISC' });
  const r3e = run(['--root', synOpt, '--out', path.join(synOpt, 'bom.json')]);
  const b3e = bomAt(path.join(synOpt, 'bom.json'));
  const WANT3E = ['@sc/beta@2.0.1', 'alpha@1.2.3', 'gamma@0.4.0', 'shared@1.5.0', 'shared@2.0.0', 'theta@1.0.0'];
  const top3e = b3e && (b3e.dependencies || []).find(d => d.ref === (b3e.metadata.component || {})['bom-ref']);
  check(r3e.status === 0 && JSON.stringify(npmSet(b3e)) === JSON.stringify(WANT3E)
    && !!top3e && top3e.dependsOn.indexOf('pkg:npm/gamma@0.4.0') > -1,
    '3e with the optional gamma installed it is listed, and theta with it: ' + JSON.stringify(npmSet(b3e))
    + ' against the frozen ' + JSON.stringify(WANT3E) + ', the desk depending on gamma ' + !!(top3e && top3e.dependsOn.indexOf('pkg:npm/gamma@0.4.0') > -1)
    + '; exit ' + r3e.status);

  /* ---- 4. DECLARED AND NOT INSTALLED REFUSES ----------------------------------------------- */
  const miss = lab('missing');
  synTree(miss, { zeta: '1.0.0' });
  const r4 = run(['--root', miss, '--out', path.join(miss, 'bom.json')]);
  check(r4.status === 1 && /zeta/.test(r4.out) && !fs.existsSync(path.join(miss, 'bom.json')),
    '4 a dependency declared and not installed refuses, exit ' + r4.status + ', names it (' + /zeta/.test(r4.out)
    + '), and writes no file (' + !fs.existsSync(path.join(miss, 'bom.json')) + ')');

  /* ---- 5. THE PACKAGED APP IS HELD AGAINST THE LIST ---------------------------------------- */
  /* The asar is made by Electron's own @electron/asar and read back by the tool's own reader. The
     base arm packs the synthetic tree's production packages (and alpha's lib/package.json, which
     is not a package); each mutant changes one thing. */
  const asar = require('@electron/asar');
  async function app(name, mutate) {
    const src = lab(name + '-src');
    const nm = path.join(syn, 'node_modules');
    put(path.join(src, 'package.json'), { name: 'etiuda', version: '0.0.0' });
    for (const rel of ['alpha/package.json', 'alpha/lib/package.json', 'alpha/node_modules/shared/package.json',
                       '@sc/beta/package.json', 'shared/package.json'])
      put(path.join(src, 'node_modules', rel), fs.readFileSync(path.join(nm, rel), 'utf8'));
    if (mutate) mutate(src);
    const unpacked = lab(name + '-win-unpacked');
    fs.mkdirSync(path.join(unpacked, 'resources'), { recursive: true });
    await asar.createPackage(src, path.join(unpacked, 'resources', 'app.asar'));
    return unpacked;
  }
  const appOk = await app('app-ok');
  const r5a = run(['--root', syn, '--app', appOk, '--out', path.join(syn, 'bom-app.json')]);
  const b5a = bomAt(path.join(syn, 'bom-app.json'));
  check(r5a.status === 0 && JSON.stringify(npmSet(b5a)) === JSON.stringify(WANT3),
    '5a the packaged app holding exactly the list passes, exit ' + r5a.status
    + (r5a.status ? '; ' + r5a.out.trim().split(/\r?\n/).slice(-1)[0] : ''));
  /* The document travels to customers, so the text is searched for the home folder and the lab,
     in both slash forms and JSON-escaped. */
  const b5aText = fs.existsSync(path.join(syn, 'bom-app.json')) ? fs.readFileSync(path.join(syn, 'bom-app.json'), 'utf8') : '';
  const homes = [os.homedir(), SCRATCH].flatMap(p => [p, p.replace(/\\/g, '/'), JSON.stringify(p).slice(1, -1)]);
  const leaked = homes.filter(h => b5aText.toLowerCase().indexOf(h.toLowerCase()) > -1);
  check(!!b5aText && leaked.length === 0 && /held against the packaged app/.test(b5aText),
    '5b no build-machine folder is in the document (' + leaked.length + ' of ' + homes.length
    + ' forms of the home and the lab found), and it says it was held against the packaged app');
  const appExtra = await app('app-extra', s => put(path.join(s, 'node_modules', 'kappa', 'package.json'), { name: 'kappa', version: '1.0.0' }));
  const r5c = run(['--root', syn, '--app', appExtra, '--out', path.join(syn, 'bom-extra.json')]);
  check(r5c.status === 1 && /kappa@1\.0\.0/.test(r5c.out) && !fs.existsSync(path.join(syn, 'bom-extra.json')),
    '5c a package in the asar the list lacks refuses and names kappa@1.0.0, exit ' + r5c.status);
  const appLess = await app('app-less', s => fs.rmSync(path.join(s, 'node_modules', '@sc'), { recursive: true, force: true }));
  const r5d = run(['--root', syn, '--app', appLess, '--out', path.join(syn, 'bom-less.json')]);
  check(r5d.status === 1 && /@sc\/beta@2\.0\.1/.test(r5d.out) && !fs.existsSync(path.join(syn, 'bom-less.json')),
    '5d a listed package the asar lacks refuses and names @sc/beta@2.0.1, exit ' + r5d.status);
  /* The desk's own shape: six files, no node_modules, and a tree that declares nothing. */
  const bare = lab('bare');
  put(path.join(bare, 'package.json'), { name: 'etiuda', version: '0.0.0', devDependencies: { electron: '9.9.9' } });
  put(path.join(bare, 'src', 'modules', 'env.js'), envJs('7.8.9'));
  put(path.join(bare, 'node_modules', 'electron', 'package.json'), { name: 'electron', version: '9.9.9' });
  const six = lab('six-src');
  for (const f of ['engine/etiuda.csp.json', 'engine/etiuda.html', 'package.json', 'shell/main.js', 'shell/preload.js', 'shell/sample-catalog.ec'])
    put(path.join(six, ...f.split('/')), f === 'package.json' ? { name: 'etiuda', version: '0.0.0' } : 'x\n');
  const sixApp = lab('six-win-unpacked');
  fs.mkdirSync(path.join(sixApp, 'resources'), { recursive: true });
  await asar.createPackage(six, path.join(sixApp, 'resources', 'app.asar'));
  const r5e = run(['--root', bare, '--app', sixApp, '--out', path.join(bare, 'bom.json')]);
  check(r5e.status === 0 && npmSet(bomAt(path.join(bare, 'bom.json'))).length === 0,
    '5e the desk\'s own shape, six files and nothing declared, passes with no npm package listed, exit ' + r5e.status);
  const declares = lab('declares');
  put(path.join(declares, 'package.json'), { name: 'etiuda', version: '0.0.0', dependencies: { alpha: '^1.0.0' } });
  put(path.join(declares, 'src', 'modules', 'env.js'), envJs('7.8.9'));
  put(path.join(declares, 'node_modules', 'alpha', 'package.json'), { name: 'alpha', version: '1.2.3' });
  put(path.join(declares, 'node_modules', 'electron', 'package.json'), { name: 'electron', version: '9.9.9' });
  const r5f = run(['--root', declares, '--app', sixApp, '--out', path.join(declares, 'bom.json')]);
  check(r5f.status === 1 && /alpha@1\.2\.3/.test(r5f.out) && !fs.existsSync(path.join(declares, 'bom.json')),
    '5f the same six-file app against a tree that declares alpha refuses, since alpha is listed and would not ship, exit '
    + r5f.status);

  /* ---- 6. THE INSTALLER'S HASH --------------------------------------------------------------- */
  /* printf 'stub-installer' | sha256sum, the fourteen bytes the release lab's stub writes. */
  const STUB_SHA256 = '37604a24d2a6fbd9e2bcfc6c6afd4d56a2a33e72cbacf4f50ec822ee7c8561d6';
  const exe = path.join(syn, 'etiuda-0.0.0-setup.exe');
  fs.writeFileSync(exe, 'stub-installer');
  const r6 = run(['--root', syn, '--installer', exe, '--out', path.join(syn, 'bom-exe.json')]);
  const b6 = bomAt(path.join(syn, 'bom-exe.json'));
  const dist = ((b6 && b6.metadata.component.externalReferences) || []).find(x => x.type === 'distribution');
  check(r6.status === 0 && !!dist && dist.url === 'etiuda-0.0.0-setup.exe'
    && JSON.stringify(dist.hashes) === JSON.stringify([{ alg: 'SHA-256', content: STUB_SHA256 }]),
    '6 the installer is named as the distribution with its SHA-256: ' + JSON.stringify(dist) + ' against ' + STUB_SHA256);

  /* ---- 7. THE RELEASE LEAVES ONE BESIDE THE INSTALLER --------------------------------------- */
  /* A throwaway repository with the real release script and its imports, stub npm scripts, and a
     stub package step that writes a fourteen-byte installer and a real six-file app.asar. Every
     gate then runs and the last two are the ones after the document is written. */
  const STUB_PACKAGE = [
    "import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';",
    "const asar = createRequire(import.meta.url)(process.env.ETIUDA_TEST_ASAR);",
    "const dist = process.env.ETIUDA_DIST; const src = path.join(dist, '..', 'stage');",
    "for (const f of ['engine/etiuda.csp.json', 'engine/etiuda.html', 'package.json', 'shell/main.js', 'shell/preload.js', 'shell/sample-catalog.ec']) {",
    "  fs.mkdirSync(path.dirname(path.join(src, f)), { recursive: true }); fs.writeFileSync(path.join(src, f), 'x\\n'); }",
    "fs.mkdirSync(path.join(dist, 'win-unpacked', 'resources'), { recursive: true });",
    "await asar.createPackage(src, path.join(dist, 'win-unpacked', 'resources', 'app.asar'));",
    "fs.writeFileSync(path.join(dist, 'win-unpacked', 'Etiuda.exe'), 'stub-program');",
    "fs.writeFileSync(path.join(dist, 'etiuda-0.0.0-setup.exe'), 'stub-installer');",
  ].join('\n') + '\n';
  function releaseLab(name, deps) {
    const root = lab('release-' + name), dir = path.join(root, 'repo');
    for (const d of ['tools', 'tests', 'shell', 'engine', path.join('src', 'modules')]) fs.mkdirSync(path.join(dir, d), { recursive: true });
    for (const f of ['tools/release.mjs', 'tools/sellable.mjs', 'tools/sbom.mjs', 'tests/engine.js', 'electron-builder.js'])
      if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    const ok = "node -e 0";
    const scripts = {};
    for (const s of ['test', 'split-guard', 'csp', 'desk', 'catalog-watch', 'shell-smoke', 'smoke', 'storage-carry', 'swap', 'reinstall']) scripts[s] = ok;
    scripts.package = 'node tools/stub-package.mjs';
    put(path.join(dir, 'package.json'), { name: 'etiuda', version: '0.0.0', scripts, dependencies: deps || undefined });
    put(path.join(dir, 'tools', 'stub-package.mjs'), STUB_PACKAGE);
    put(path.join(dir, 'src', 'modules', 'env.js'), envJs('2.0.0-dev'));
    put(path.join(dir, 'shell', 'license_en.txt'), 'licence\n');
    put(path.join(dir, 'shell', 'license_pl.txt'), 'licencja\n');
    put(path.join(dir, 'engine', 'etiuda.html'), '<html></html>\n');
    put(path.join(dir, 'node_modules', 'electron', 'package.json'), { name: 'electron', version: '9.9.9', license: 'MIT' });
    if (deps) put(path.join(dir, 'node_modules', 'alpha', 'package.json'), { name: 'alpha', version: '1.2.3' });
    const git = (...a) => execFileSync('git', ['-c', 'user.name=sbom', '-c', 'user.email=sbom@invalid',
      '-c', 'core.autocrlf=false', ...a], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'lab');
    const gitDir = path.join(dir, '.git');
    put(path.join(gitDir, 'etiuda-names'), 'nothing\n');
    put(path.join(gitDir, 'hooks', 'pre-commit'), '#!/bin/sh\nexit 0\n');
    return { root, dir, dist: path.join(root, 'dist') };
  }
  function release(l) {
    const env = { ...process.env, ETIUDA_RELEASE_HOME_ROOT: l.root, ETIUDA_DIST: l.dist, ETIUDA_FIXTURES: 'stub',
      ETIUDA_TEST_ASAR: path.join(ROOT, 'node_modules', '@electron', 'asar') };
    delete env.ETIUDA_CERT;
    const res = spawnSync(process.execPath, ['tools/release.mjs', '--package'], { cwd: l.dir, env, encoding: 'utf8', timeout: 400000 });
    return { status: res.status, out: String(res.stdout || '') + String(res.stderr || '') };
  }
  const sbomName = 'etiuda-0.0.0-sbom.cdx.json';
  const L7 = releaseLab('full', null);
  const full = release(L7);
  const sbomFile = path.join(L7.dist, sbomName);
  const sbomBytes = fs.existsSync(sbomFile) ? fs.readFileSync(sbomFile) : null;
  const sbomHash = sbomBytes ? createHash('sha256').update(sbomBytes).digest('hex') : '';
  let b7 = null;
  try { b7 = JSON.parse(String(sbomBytes)); } catch (e) { b7 = null; }
  const dist7 = ((b7 && b7.metadata && b7.metadata.component.externalReferences) || []).find(x => x.type === 'distribution');
  check(full.status === 0 && !!b7 && (comp(b7, 'electron') || {}).version === '9.9.9'
    && b7.metadata.component.version === '2.0.0-dev'
    && !!dist7 && dist7.hashes[0].content === STUB_SHA256,
    '7a a full release --package leaves the document beside the installer, exit ' + full.status + ': ' + !!b7
    + ', Electron ' + JSON.stringify((comp(b7, 'electron') || {}).version) + ', the desk at '
    + JSON.stringify(b7 && b7.metadata.component.version) + ', the installer\'s hash '
    + JSON.stringify(dist7 && dist7.hashes[0].content));
  const said = (/etiuda-0\.0\.0-sbom\.cdx\.json\s+\d+ bytes, sha256 ([0-9a-f]{64})\b/.exec(full.out) || [])[1] || '';
  check(!!sbomHash && said === sbomHash && full.out.indexOf('its bill of materials beside it, sha256 ' + sbomHash) > -1,
    '7b its SHA-256 is printed at the gate and again on the closing line: printed ' + JSON.stringify(said)
    + ', against the file\'s ' + sbomHash);

  /* The contradiction: alpha is a production dependency the six-file app would not carry, so the
     list is not what ships. The document a run left there earlier goes too, or it would read as
     this build's. */
  const L7b = releaseLab('refused', { alpha: '^1.0.0' });
  put(path.join(L7b.dist, sbomName), '{"left": "by an earlier run"}\n');
  const refused = release(L7b);
  check(refused.status === 9 && /the software bill of materials was not written/.test(refused.out)
    && /alpha@1\.2\.3/.test(refused.out),
    '7c a list that is not what ships stops the installer gate, exit ' + refused.status + ' (9 wanted), naming alpha@1.2.3');
  check(!fs.existsSync(path.join(L7b.dist, sbomName)) && refused.out.indexOf('[10]') < 0,
    '7d and no document is left beside that installer, the one an earlier run left included ('
    + !fs.existsSync(path.join(L7b.dist, sbomName)) + '), and no later gate ran (' + (refused.out.indexOf('[10]') < 0) + ')');
}

/* The junctions go first, by rmdir, which removes a junction and never what it points at: a
   recursive removal that followed one would take the real node_modules with it. */
function tidy() {
  for (const j of JUNCTIONS) if (fs.existsSync(j))
    spawnSync('cmd.exe', ['/d', '/c', 'rmdir', j], { stdio: 'ignore', windowsHide: true });
  if (JUNCTIONS.some(j => fs.existsSync(j))) { console.log('  a junction stayed; the scratch stays at ' + SCRATCH); return; }
  if (KEEP) { console.log('--keep: ' + SCRATCH); return; }
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch { /* reported below */ }
}

try {
  await main();
} catch (e) {
  failed++;
  console.log('  FAIL the suite threw: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  tidy();
  check(KEEP || !fs.existsSync(SCRATCH), '8 the scratch folder is gone');
}

console.log('#counts checks=' + asserted + ' failed=' + failed + ' notRun=0 expected=' + EXPECTED);
if (asserted < EXPECTED) {
  console.log('SUITE DID NOT COMPLETE: ' + asserted + ' of ' + EXPECTED + ' checks ran');
  process.exit(78);
}
console.log(failed ? '  RESULT: FAIL ' + failed + ' of ' + asserted : '  RESULT: ok ' + asserted + ' check(s)');
process.exit(Math.min(failed, 63));
