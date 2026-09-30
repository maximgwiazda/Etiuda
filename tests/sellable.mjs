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
 *   3  signing is read out of the real electron-builder.js, so the block the build uses is judged: each
 *      environment's route, the refusals, and signingConfigured against electron-builder's own code
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
         signingConfigured, signatureProblems, readAuthenticode, signatureVerdict, beforeBuild, SIGNING_VARS } from '../tools/sellable.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 29;

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
  /* Every variable that picks a route is cleared around each reading, so one set on the desk
     running this changes nothing here. */
  const builder = path.join(ROOT, 'electron-builder.js');
  const winWith = vars => {
    const was = {};
    for (const k of SIGNING_VARS) { was[k] = process.env[k]; delete process.env[k]; }
    Object.assign(process.env, vars || {});
    delete require.cache[require.resolve(builder)];
    try { return require(builder).win; }
    finally {
      for (const k of SIGNING_VARS) { if (was[k] == null) delete process.env[k]; else process.env[k] = was[k]; }
      delete require.cache[require.resolve(builder)];
    }
  };
  const PFX = 'C:/nowhere/etiuda.pfx', THUMB = '0123456789abcdef0123456789abcdef01234567', WHO = 'Example Publisher';
  const AZ = { ETIUDA_SIGNING_ENDPOINT: 'https://weu.codesigning.azure.net', ETIUDA_SIGNING_ACCOUNT: 'exampleaccount',
    ETIUDA_SIGNING_PROFILE: 'exampleprofile', ETIUDA_SIGNING_PUBLISHER: WHO };
  const routeOf = w => JSON.stringify({ signtoolOptions: w.signtoolOptions, azureSignOptions: w.azureSignOptions });
  const unsignedWin = winWith(null), pfxWin = winWith({ ETIUDA_CERT: PFX });
  const PFX_BEFORE = { signtoolOptions: { certificateFile: PFX, signingHashAlgorithms: ['sha256'],
    rfc3161TimeStampServer: 'http://timestamp.digicert.com' } };
  check(routeOf(unsignedWin) === '{}' && !signingConfigured(unsignedWin, {}) && signingConfigured(pfxWin, {})
    && routeOf(pfxWin) === JSON.stringify(PFX_BEFORE),
    '3a the real builder with no signing variable signs nothing, and with ETIUDA_CERT set signs from the .pfx by'
    + ' the block it always did, key for key: ' + routeOf(pfxWin));

  /* ELECTRON-BUILDER'S OWN ANSWER to "would this sign", asked of its code rather than restated: the
     schema it validates a configuration against, then WinPackager's signIf on a stub packager whose
     signtool run and PowerShell are replaced, so nothing is signed, installed or read from the real
     certificate store; the store it is shown holds one planted certificate. The one line restated is
     the constructor's choice of Artifact Signing whenever azureSignOptions is present. */
  const ABL = path.join(ROOT, 'node_modules', 'app-builder-lib', 'package.json');
  let EB = null, ebMissing = '';
  if (fs.existsSync(ABL)) {
    try {
      const abl = createRequire(ABL);
      abl('app-builder-lib');   /* the index first: winPackager.js loaded alone meets a class cycle */
      EB = { ...abl('./out/winPackager.js'), ...abl('./out/codeSign/windowsSignToolManager.js'),
             ...abl('./out/codeSign/windowsSignAzureManager.js'), ...abl('./out/util/config/config.js'),
             util: abl('builder-util') };
      for (const k of ['WinPackager', 'WindowsSignToolManager', 'WindowsSignAzureManager', 'validateConfiguration'])
        if (!EB[k]) throw new Error('app-builder-lib no longer exports ' + k + ' where this leg reads it');
      /* The Artifact Signing signer is run only while its one way out is the packager's vm, which is
         the stub below: it must never reach Azure, or a sign-in, from this desk. */
      if (!/this\.packager\.vm\.value/.test(String(EB.WindowsSignAzureManager.prototype.signFile)))
        throw new Error('the Artifact Signing signer no longer reaches PowerShell only through the packager\'s vm, so it is not run here');
    } catch (e) { EB = null; ebMissing = String(e.message).split('\n')[0]; }
  }
  const STORE = [{ Subject: 'CN=' + WHO, Thumbprint: THUMB.toUpperCase(),
    PSParentPath: 'Microsoft.PowerShell.Security\\Certificate::CurrentUser\\My' }];
  const LINK_VARS = ['CSC_LINK', 'WIN_CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_KEY_PASSWORD'];
  /* THE SIGNER IS SEALED WHILE IT RUNS. The check on its source text asks whether the vm is named, not
     whether it is the only way out: a signer that also starts a process, opens a connection or fetches
     would be run here against the real profile. So while signIf runs, everything that starts a process
     or reaches a network throws and is counted in ESCAPES, which 3b requires to be empty. The objects
     are CommonJS, and electron-builder looks its calls up at call time, so replacing them reaches it. */
  const ESCAPES = [];
  const SEALED = [['child_process', require('node:child_process'), ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']],
    ['http', require('node:http'), ['request', 'get']], ['https', require('node:https'), ['request', 'get']],
    ['net', require('node:net'), ['connect', 'createConnection']], ['net.Socket.prototype', require('node:net').Socket.prototype, ['connect']],
    ['tls', require('node:tls'), ['connect']],
    ['dns', require('node:dns'), ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'reverse']],
    ['dns.promises', require('node:dns').promises, ['lookup', 'resolve', 'resolve4', 'resolve6']], ['globalThis', globalThis, ['fetch']]];
  async function whileSealed(run) {
    const put = [];
    for (const [label, obj, names] of SEALED) for (const n of names) {
      const was = Object.getOwnPropertyDescriptor(obj, n);
      if (!was) continue;
      put.push([obj, n, was]);
      Object.defineProperty(obj, n, { configurable: true, writable: true, value: function () {
        ESCAPES.push(label + '.' + n);
        throw new Error('sealed: ' + label + '.' + n + ' was called while the signer ran');
      } });
    }
    try { return await run(); }
    finally { for (const [obj, n, was] of put.reverse()) Object.defineProperty(obj, n, was); }
  }
  async function wouldSign(win, env = {}) {
    const was = {};
    for (const k of LINK_VARS) { was[k] = process.env[k]; delete process.env[k]; if (env[k] != null) process.env[k] = env[k]; }
    const stream = EB.util.log.stream;
    EB.util.log.stream = { write: () => true };   /* its own progress lines, not this file's */
    const calls = [];
    try {
      try { await EB.validateConfiguration({ win }, { isEnabled: false }); }
      catch (e) { return { signs: false, calls, why: 'the schema refuses it' }; }
      const vm = { powershellCommand: { value: Promise.resolve('powershell.exe') }, toVmFile: f => f,
        exec: async (ps, args) => { calls.push(args.join(' ')); return JSON.stringify(STORE); } };
      const stub = Object.create(EB.WinPackager.prototype);
      Object.assign(stub, { platformSpecificBuildOptions: win, signingQueue: Promise.resolve(true),
        info: { config: {}, debugLogger: { isEnabled: false }, getWorkspaceRoot: async () => ROOT },
        appInfo: { productName: 'Etiuda', computePackageUrl: async () => null, type: 'app' },
        vm: { value: Promise.resolve(vm) } });
      const manager = win.azureSignOptions != null ? new EB.WindowsSignAzureManager(stub) : new EB.WindowsSignToolManager(stub);
      if (manager instanceof EB.WindowsSignToolManager) manager.doSign = async () => {};
      stub.signingManager = { value: Promise.resolve(manager) };
      try { return { signs: !!(await whileSealed(() => stub.signIf(path.join(TMP, 'etiuda-setup.exe')))), calls }; }
      catch (e) { return { signs: false, calls, why: 'it throws: ' + String(e.message).slice(0, 80) }; }
    } finally {
      EB.util.log.stream = stream;
      for (const k of LINK_VARS) { if (was[k] == null) delete process.env[k]; else process.env[k] = was[k]; }
    }
  }

  if (!EB) {
    if (ebMissing) check(false, '3b-3e electron-builder\'s own code could not be read: ' + ebMissing);
    else skip('3b-3e need app-builder-lib in node_modules to ask electron-builder itself', 4);
  } else {
    /* 3b: each environment picks its route, the block passes electron-builder's schema, and its own
       signing path signs with it; Artifact Signing's values reach the command it would run. */
    const ST = w => w.signtoolOptions || {}, AO = w => w.azureSignOptions || {};
    const ROUTES = [
      ['none', {}, w => !w.signtoolOptions && !w.azureSignOptions, false],
      ['.pfx', { ETIUDA_CERT: PFX }, w => ST(w).certificateFile === PFX && !w.azureSignOptions, true],
      ['thumbprint', { ETIUDA_CERT_SHA1: THUMB }, w => ST(w).certificateSha1 === THUMB
        && !ST(w).certificateFile && !ST(w).certificateSubjectName && !w.azureSignOptions, true],
      ['subject', { ETIUDA_CERT_SUBJECT: WHO }, w => ST(w).certificateSubjectName === WHO
        && !ST(w).certificateFile && !ST(w).certificateSha1 && !w.azureSignOptions, true],
      ['thumbprint and subject', { ETIUDA_CERT_SHA1: THUMB, ETIUDA_CERT_SUBJECT: WHO }, w => ST(w).certificateSha1 === THUMB
        && ST(w).certificateSubjectName === WHO && !ST(w).certificateFile && !w.azureSignOptions, true],
      ['Artifact Signing', AZ, w => !w.signtoolOptions && AO(w).endpoint === AZ.ETIUDA_SIGNING_ENDPOINT
        && AO(w).codeSigningAccountName === AZ.ETIUDA_SIGNING_ACCOUNT
        && AO(w).certificateProfileName === AZ.ETIUDA_SIGNING_PROFILE
        && AO(w).publisherName === WHO, true],
    ];
    const wrongRoute = [];
    for (const [name, vars, shape, signs] of ROUTES) {
      const w = winWith(vars), eb = await wouldSign(w);
      const timestamped = !w.signtoolOptions || w.signtoolOptions.rfc3161TimeStampServer === 'http://timestamp.digicert.com';
      const reached = name !== 'Artifact Signing' || (eb.calls.length === 1 && / -Command Invoke-TrustedSigning /.test(eb.calls[0])
        && ['ETIUDA_SIGNING_ENDPOINT', 'ETIUDA_SIGNING_ACCOUNT', 'ETIUDA_SIGNING_PROFILE'].every(k => eb.calls[0].includes("'" + AZ[k] + "'")));
      if (!shape(w) || eb.signs !== signs || signingConfigured(w, {}) !== signs || !timestamped || !reached)
        wrongRoute.push(name + ' (' + routeOf(w) + ', electron-builder ' + eb.signs + (eb.why ? ', ' + eb.why : '') + ')');
    }
    check(!wrongRoute.length && ESCAPES.length === 0, '3b each of ' + ROUTES.length + ' environments picks its route, which electron-builder\'s'
      + ' schema accepts and its signing path signs with (none signs nothing), and the signer, sealed while it ran, started no process and'
      + ' reached no network (' + ESCAPES.length + ' escape(s))' + (wrongRoute.length ? '; wrong: ' + wrongRoute.join('; ') : '')
      + (ESCAPES.length ? '; it reached for ' + [...new Set(ESCAPES)].join(', ') : ''));

    /* 3c: two routes at once, or Artifact Signing short of a field, refuses by name. */
    const refusal = vars => { try { winWith(vars); return ''; } catch (e) { return String(e.message); } };
    const { ETIUDA_SIGNING_PUBLISHER: _publisher, ...AZ_THREE } = AZ;
    const r1 = refusal({ ETIUDA_CERT: PFX, ETIUDA_CERT_SHA1: THUMB }), r2 = refusal({ ETIUDA_CERT: PFX, ...AZ });
    const r3 = refusal({ ETIUDA_CERT_SUBJECT: WHO, ...AZ }), r4 = refusal(AZ_THREE);
    check(/ETIUDA_CERT and ETIUDA_CERT_SHA1/.test(r1) && /ETIUDA_CERT and ETIUDA_SIGNING_\*/.test(r2)
      && /ETIUDA_CERT_SUBJECT and ETIUDA_SIGNING_\*/.test(r3) && /needs ETIUDA_SIGNING_PUBLISHER too$/.test(r4),
      '3c two routes at once refuse naming both, and Artifact Signing short of one field names it: ' + JSON.stringify([r1, r2, r3, r4]));

    /* 3d: signingConfigured says what electron-builder does, on planted blocks: the rehearsal's five
       first, then those that decide "and nothing else" and the certificate links it reads itself. */
    const LINK = path.join(TMP, 'planted.pfx');
    fs.writeFileSync(LINK, 'not a certificate');
    const TS = { signingHashAlgorithms: ['sha256'], rfc3161TimeStampServer: 'http://timestamp.digicert.com' };
    const AZ_BLOCK = { endpoint: AZ.ETIUDA_SIGNING_ENDPOINT, codeSigningAccountName: 'a', certificateProfileName: 'p', publisherName: WHO };
    const PLANTED = [
      ['pfx', { signtoolOptions: { certificateFile: PFX, ...TS } }],
      ['azure', { azureSignOptions: AZ_BLOCK }],
      ['sha1', { signtoolOptions: { certificateSha1: THUMB, ...TS } }],
      ['subject', { signtoolOptions: { certificateSubjectName: WHO, ...TS } }],
      ['none', {}],
      ['azure short of three fields', { azureSignOptions: { endpoint: 'x' } }],
      ['win.certificateFile', { certificateFile: PFX }],
      ['win.sign', { sign: './sign.js' }],
      ['a timestamp alone', { signtoolOptions: TS }],
      ['pfx with signExecutable false', { signtoolOptions: { certificateFile: PFX, ...TS }, signExecutable: false }],
      ['win.cscLink', { cscLink: LINK }],
      ['a sign hook', { signtoolOptions: { sign: async () => {} } }],
      ['none, CSC_LINK set', {}, { CSC_LINK: LINK }],
      ['none, WIN_CSC_LINK set', {}, { WIN_CSC_LINK: LINK }],
      ['none, WIN_CSC_LINK empty over CSC_LINK', {}, { WIN_CSC_LINK: '', CSC_LINK: LINK }],
      ['win.cscLink empty over CSC_LINK', { cscLink: '' }, { CSC_LINK: LINK }],
    ];
    const told = [];
    for (const [name, win, env] of PLANTED) told.push([name, signingConfigured(win, env || {}), (await wouldSign(win, env)).signs]);
    const differ = told.filter(t => t[1] !== t[2]);
    check(!differ.length && told.filter(t => t[2]).length === 8,
      '3d signingConfigured agrees with electron-builder on ' + (told.length - differ.length) + ' of ' + told.length
      + ' planted blocks, 8 of which it signs with: ' + told.slice(0, 5).map(t => t[0] + ' ' + t[1]).join(', ')
      + (differ.length ? '; DIFFER on ' + differ.map(t => t[0] + ' (ours ' + t[1] + ', electron-builder ' + t[2] + ')').join(', ') : ''));

    /* 3e, the control: the function as it stood before the token routes, judged by the same table,
       differs exactly where the rehearsal found it did among its five. */
    const BEFORE = win => { const w = win || {}, st = w.signtoolOptions || {};
      return !!(st.certificateFile || st.sign || w.azureSignOptions || w.certificateFile || w.sign); };
    const before = told.slice(0, 5).filter((t, i) => BEFORE(PLANTED[i][1]) !== t[2]).map(t => t[0]);
    check(before.join(',') === 'sha1,subject',
      '3e control: the function as it stood differs from electron-builder among the five on ' + (before.join(', ') || 'nothing'));
  }

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
    for (const f of ['tools/release.mjs', 'tools/sellable.mjs', 'tools/sbom.mjs', 'tests/engine.js', 'electron-builder.js', 'package.json'])
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
    for (const k of SIGNING_VARS) delete env[k];
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
    customer: false, licenceDir: path.join(ROOT, 'shell'), win: winWith(Object.fromEntries(SIGNING_VARS.filter(k => process.env[k] != null).map(k => [k, process.env[k]]))) });
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
