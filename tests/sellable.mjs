/* WHETHER A BUILD CAN BE SOLD: tools/sellable.mjs, and tools/release.mjs asking it.
 *
 *   node tests/sellable.mjs            exit code is the number of failed checks, capped at 63
 *
 * Nothing here packages anything. The questions are asked of planted inputs, each refusal on a
 * fault put there for it and each pass on the same input with the fault taken out, and the
 * release itself is driven in a throwaway repository as far as its second gate, which is where
 * a customer build is stopped. What each leg holds:
 *   1  which version is a customer's, and why one is not
 *   2  a licence page with a bracketed placeholder is refused, one without is not, and no page at
 *      all is refused rather than read as clean
 *   3  signing is read out of the real electron-builder.js, so the block the build uses is judged
 *   4  when a signature is required, only Valid with a timestamp passes; when it is not, nothing
 *      a preview reads stops it
 *   5  what Windows says of a signed file, of the same file with one byte changed, and of an
 *      unsigned one, read by the same function the release calls, and the signature gate's
 *      whole body on those files as installer and as program
 *   6  tools/release.mjs stops a customer build at gate 2 and lets a preview through, driven
 *
 * The expected values below were written from the rule in tools/sellable.mjs before any run. */
process.removeAllListeners('warning');
process.on('warning', () => {});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { customerVersion, versionProblems, placeholders, licencePages, licenceProblems,
         signingConfigured, signatureProblems, readAuthenticode, signatureVerdict, beforeBuild } from '../tools/sellable.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 25;

let asserted = 0, failed = 0;
const notRun = [];
function check(ok, line) {
  asserted++;
  if (ok) console.log('  ok   ' + line);
  else { failed++; console.log('  FAIL ' + line); }
}
/* A leg that cannot run here is counted by how many legs it stands for, so the floor still holds. */
function skip(why, legs) { for (let i = 0; i < legs; i++) notRun.push(why); console.log('  NOT RUN ' + why); }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'etiuda-sellable-'));
const EN_FILE = path.join(ROOT, 'shell', 'license_en.txt');
const EN = fs.readFileSync(EN_FILE, 'utf8');
/* THE LICENCE TEXT TWO WAYS, whatever the tree holds today, so no leg here fights the day the
   seller is filled in: once with a placeholder planted on its own line, and once with every
   bracketed span replaced by invented words. */
const FILLED = EN.replace(/\[[^\]\r\n]*\]/g, 'Example Trading');
const HOLED = FILLED.replace(/\n/, '\n[Seller\'s legal name], [registered address]\n');
function pages(name, files) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), text);
  return dir;
}

try {
  /* ---- 1. the version ------------------------------------------------------------------- */
  const VERSIONS = { '2.0.0': true, '1.0.0': true, '10.2.3': true, '2.0.0-dev': false, '2.0.0-rc.1': false,
                     '2.0.0+7': false, '0.1.0': false, '0.9.9': false, '2.0': false, '': false };
  const wrong = Object.keys(VERSIONS).filter(v => customerVersion(v) !== VERSIONS[v]);
  check(!wrong.length, '1a a customer\'s version is a bare x.y.z with a major of 1 or more, over '
    + Object.keys(VERSIONS).length + ' versions' + (wrong.length ? '; wrong for ' + wrong.join(', ') : ''));
  const why = v => versionProblems(v).length;
  check(why('2.0.0') === 0 && why('2.0.0-dev') === 1 && why('0.1.0') === 1 && why('2.0') === 1,
    '1b a sellable version gives no reason and each preview shape gives one (2.0.0 ' + why('2.0.0')
    + ', 2.0.0-dev ' + why('2.0.0-dev') + ', 0.1.0 ' + why('0.1.0') + ', 2.0 ' + why('2.0') + ')');

  /* ---- 2. the licence page ---------------------------------------------------------------- */
  const holes = placeholders(HOLED);
  check(holes.length === 2 && holes[0].line === 2 && holes[0].text === '[Seller\'s legal name]',
    '2a a planted placeholder line is found by line and text: ' + JSON.stringify(holes.slice(0, 2)));
  const holedDir = pages('holed', { 'license_en.txt': HOLED, 'license_pl.txt': FILLED });
  const filledDir = pages('filled', { 'license_en.txt': FILLED, 'license_pl.txt': FILLED });
  const redL = licenceProblems(holedDir), greenL = licenceProblems(filledDir);
  check(redL.length === 1 && /license_en\.txt/.test(redL[0]) && greenL.length === 0,
    '2b the page carrying it is refused by name and the same pages filled pass: ' + redL.length
    + ' reason(s) against ' + greenL.length);
  const emptyDir = pages('empty', { 'readme.md': 'no licence here' });
  check(licenceProblems(emptyDir).length === 1,
    '2c a folder with no licence page is refused, not read as clean: ' + JSON.stringify(licenceProblems(emptyDir)));
  const found = licencePages(pages('names', { 'license_en.txt': 'a', 'LICENSE_PL.TXT': 'b', 'eula.txt': 'c',
    'license.rtf': 'd', 'license-notes.md': 'e', 'licence_en.txt': 'f' })).map(f => path.basename(f));
  check(found.join(',') === 'LICENSE_PL.TXT,eula.txt,license.rtf,license_en.txt',
    '2d the pages are the names the builder reads, in any case, and nothing else: ' + found.join(','));

  /* ---- 3. signing, as the real electron-builder.js configures it ---------------------------- */
  const builder = path.join(ROOT, 'electron-builder.js');
  const winWith = cert => {
    const was = process.env.ETIUDA_CERT;
    if (cert == null) delete process.env.ETIUDA_CERT; else process.env.ETIUDA_CERT = cert;
    delete require.cache[require.resolve(builder)];
    try { return require(builder).win; }
    finally { if (was == null) delete process.env.ETIUDA_CERT; else process.env.ETIUDA_CERT = was; delete require.cache[require.resolve(builder)]; }
  };
  const unsigned = signingConfigured(winWith(null)), signed = signingConfigured(winWith('C:/nowhere/etiuda.pfx'));
  check(!unsigned && signed && signingConfigured({ azureSignOptions: { endpoint: 'x' } }) && !signingConfigured({}),
    '3a the real builder with ETIUDA_CERT unset signs nothing (' + unsigned + ') and with it set signs ('
    + signed + '); Azure\'s options count as signing and an empty block does not');

  /* ---- 4. the judgement of a reading -------------------------------------------------------- */
  const r = (status, timestamped) => ({ file: 'C:/d/etiuda-9.9.9-setup.exe', status, timestamped });
  const BAD = ['HashMismatch', 'NotTrusted', 'UnknownError', 'NotSigned', 'NotSupportedFileFormat'];
  const missed = BAD.filter(s => signatureProblems([r(s, true)], true).length !== 1);
  check(signatureProblems([r('Valid', true)], true).length === 0 && !missed.length,
    '4a required: Valid with a timestamp passes and each of ' + BAD.join(', ') + ' is refused'
    + (missed.length ? '; passed ' + missed.join(', ') : ''));
  const noTs = signatureProblems([r('Valid', false)], true);
  check(noTs.length === 1 && /timestamp/.test(noTs[0]),
    '4b required: Valid with no timestamp is refused and says why: ' + JSON.stringify(noTs));
  check(BAD.every(s => signatureProblems([r(s, false)], false).length === 0),
    '4c not required, as for a preview with no certificate: no status stops it');
  check(signatureProblems([r('Valid', true), r('HashMismatch', true)], true).length === 1,
    '4d every file is judged, not only the first: the second of two, mismatched, is refused');

  /* ---- 5. what Windows says, read by the function the release calls ------------------------ */
  const SIGNED = path.join(ROOT, 'node_modules', '@electron', 'windows-sign', 'vendor', 'signtool.exe');
  const UNSIGNED = path.join(ROOT, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');
  if (process.platform !== 'win32') skip('5a-5h need Windows to answer for a signature', 8);
  else if (!fs.existsSync(SIGNED) || !fs.existsSync(UNSIGNED)) skip('5a-5h need ' + SIGNED + ' and ' + UNSIGNED, 8);
  else {
    /* One byte in the middle of a copy, which is code and not the signature at the end: the file
       still carries a signature, and the signature no longer matches what it signs. */
    const bent = path.join(TMP, 'signtool-bent.exe');
    const bytes = fs.readFileSync(SIGNED);
    bytes[bytes.length >> 1] ^= 0xff;
    fs.writeFileSync(bent, bytes);
    const read = readAuthenticode([SIGNED, bent, UNSIGNED]);
    const said = read.map(x => x.status + (x.timestamped ? '+ts' : '')).join(', ');
    check(read[0].status === 'Valid' && read[0].timestamped && read[1].status === 'HashMismatch' && read[2].status === 'NotSigned',
      '5a Windows reads a signed tool Valid and timestamped, a copy with one byte changed HashMismatch, and an unsigned one NotSigned: ' + said);
    check(signatureProblems([read[0]], true).length === 0 && signatureProblems([read[1]], true).length === 1
      && signatureProblems([read[2]], true).length === 1,
      '5b and a required signature passes the first and refuses the other two');

    /* THE GATE WHOLE, as tools/release.mjs calls it after a build, on planted files: the
       installer and the program are each given the good, the bent or the unsigned tool. */
    const quiet = [];
    const verdict = (setup, program, customer, win) =>
      signatureVerdict({ setup, program, customer, win: win || {}, log: s => quiet.push(s) });
    const CERT = { signtoolOptions: { certificateFile: 'C:/nowhere/etiuda.pfx' } };
    const v1 = verdict(bent, SIGNED, true);
    check(typeof v1 === 'string' && /signtool-bent\.exe reads Authenticode HashMismatch/.test(v1),
      '5c a customer build whose installer is mismatched is stopped by name: ' + v1);
    const v2 = verdict(SIGNED, bent, true);
    check(typeof v2 === 'string' && /signtool-bent\.exe/.test(v2),
      '5d and one whose PROGRAM is mismatched under a good installer, which reading the installer alone passed: ' + v2);
    const v3 = verdict(UNSIGNED, UNSIGNED, false);
    check(v3 === true && quiet.some(s => /NotSigned/.test(s)),
      '5e a preview with no certificate configured, unsigned, passes as it always has and is told NotSigned');
    const v4 = verdict(UNSIGNED, UNSIGNED, false, CERT);
    check(typeof v4 === 'string' && /NotSigned, not Valid/.test(v4),
      '5f a preview WITH a certificate configured that came out unsigned is stopped: ' + v4);
    const v5 = verdict(SIGNED, SIGNED, true);
    check(v5 === true, '5g a customer build with both files Valid and timestamped passes: ' + v5);
    const v6 = verdict(SIGNED, path.join(TMP, 'no-such', 'Etiuda.exe'), false);
    check(typeof v6 === 'string' && /is not there/.test(v6),
      '5h a program that is not where the gate looks is a stop, not a pass: ' + v6);
  }
  /* Off Windows nobody answers, and the reader says so with null. */
  const offWin = (customer, win) => signatureVerdict({ setup: EN_FILE, program: EN_FILE, customer, win: win || {},
    read: () => null, log: () => {} });
  const o1 = offWin(true), o2 = offWin(false);
  check(typeof o1 === 'string' && /^NOT RUN/.test(o1) && o2 === true,
    '5i with no reading, a build that requires a signature stops NOT RUN and a preview passes: ' + o1 + ' / ' + o2);

  /* ---- 6. the release, driven to its second gate ------------------------------------------- */
  /* A throwaway repository holding what the first two gates read: the real release script and
     this file's module, the real electron-builder.js and tests/engine.js, package.json, a one-line
     env.js with the version under test, and the licence pages. Gate 3 then finds no name list in
     the lab and stops NOT RUN with exit 3, which is how a leg tells "past gate 2" from "stopped at
     it" without running a single gate more. */
  const lab = (name, version, licence) => {
    const root = path.join(TMP, 'lab-' + name), dir = path.join(root, 'repo');
    for (const d of ['tools', 'tests', 'shell', path.join('src', 'modules')]) fs.mkdirSync(path.join(dir, d), { recursive: true });
    for (const f of ['tools/release.mjs', 'tools/sellable.mjs', 'tests/engine.js', 'electron-builder.js', 'package.json'])
      fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    fs.writeFileSync(path.join(dir, 'src', 'modules', 'env.js'), 'const E_VERSION="' + version + '";\n');
    fs.writeFileSync(path.join(dir, 'shell', 'license_en.txt'), licence);
    fs.writeFileSync(path.join(dir, 'shell', 'license_pl.txt'), licence);
    const git = (...a) => execFileSync('git', ['-c', 'user.name=sellable', '-c', 'user.email=sellable@invalid',
      '-c', 'core.autocrlf=false', ...a], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'lab');
    return { root, dir };
  };
  const release = (l, argv, cert) => {
    const env = { ...process.env, ETIUDA_RELEASE_HOME_ROOT: l.root };
    delete env.ETIUDA_CERT;
    if (cert) env.ETIUDA_CERT = cert;
    const res = spawnSync(process.execPath, ['tools/release.mjs', ...argv], { cwd: l.dir, env, encoding: 'utf8', timeout: 60000 });
    return { status: res.status, out: String(res.stdout || '') + String(res.stderr || '') };
  };
  const past2 = run => run.status === 3 && /\n\[3\] /.test(run.out);
  const stopped2 = run => run.status === 2 && !/\n\[3\] /.test(run.out);

  const a = release(lab('customer', '2.0.0', HOLED), []);
  check(stopped2(a) && /CUSTOMER build that cannot be sold/.test(a.out) && /license_en\.txt/.test(a.out) && /ETIUDA_CERT/.test(a.out),
    '6a a customer version with a placeholder and no certificate stops at gate 2, exit ' + a.status
    + ', naming the page and the certificate');
  const b = release(lab('preview', '2.0.0-dev', HOLED), []);
  check(past2(b) && /PREVIEW, not for a customer; as a customer build it would stop on 4:/.test(b.out),
    '6b the same tree as a preview passes gate 2 as it always did and is told its four reasons (the version,'
    + ' two pages, the certificate), exit ' + b.status);
  const c = release(lab('rehearsed', '2.0.0-dev', FILLED), ['--customer'], 'C:/nowhere/etiuda.pfx');
  check(stopped2(c) && /carries a prerelease/.test(c.out),
    '6c --customer asks a preview the customer\'s questions and its version is refused, exit ' + c.status);
  const d = release(lab('sellable', '2.0.0', FILLED), [], 'C:/nowhere/etiuda.pfx');
  check(past2(d) && /a CUSTOMER build, and nothing in the tree stops it being sold/.test(d.out),
    '6d a customer version with the page filled and a certificate configured passes gate 2, exit ' + d.status);
  /* The real tree as it stands, through the same function gate 2 calls: a preview today, and
     what stands between it and a sale is printed rather than asserted, so this leg does not
     redden on the day the seller or the certificate arrives. */
  const tree = beforeBuild({ version: /E_VERSION\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, 'src', 'modules', 'env.js'), 'utf8'))[1],
    customer: false, licenceDir: path.join(ROOT, 'shell'), win: winWith(process.env.ETIUDA_CERT) });
  console.log('  info this tree as it stands is ' + (tree.customer ? 'a CUSTOMER build' : 'a preview')
    + ', and as a customer build it would stop on ' + tree.problems.length + ': ' + tree.problems.join('; '));
} catch (e) {
  failed++;
  console.log('  FAIL ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* reported below */ }
  check(!fs.existsSync(TMP), '7a the temp folder is gone');
}

console.log('#counts checks=' + asserted + ' failed=' + failed + ' notRun=' + notRun.length + ' expected=' + EXPECTED);
if (asserted + notRun.length < EXPECTED) {
  console.log('SUITE DID NOT COMPLETE: ' + asserted + ' of ' + EXPECTED + ' checks ran');
  process.exit(78);
}
console.log(failed ? '  RESULT: FAIL ' + failed + ' of ' + asserted : '  RESULT: ok ' + asserted + ' check(s)');
process.exit(Math.min(failed, 63));
