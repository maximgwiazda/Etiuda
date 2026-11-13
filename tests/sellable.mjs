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
 *   9  a test service build (tools/test-service.cjs) is never released: the variable stops any release at gate 2, a package
 *      carrying its file is refused, and in the release profile this tree's own package is read for it
 *  10  the eSigner route (tools/esigner.cjs), its effects replaced: unset it gives no block, the hook is handed each file once,
 *      the account's values reach the tool only through an argument file, the exit code is not the answer, and a demo-signed
 *      build is never released
 *
 * The expected values below were written from the rule in tools/sellable.mjs before any run. */
process.removeAllListeners('warning');
process.on('warning', () => {});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { customerVersion, versionProblems, placeholders, licencePages, licenceProblems,
         signingConfigured, signatureProblems, readAuthenticode, signatureVerdict, beforeBuild, SIGNING_VARS,
         customerReleaseProfileVerdict, readReleaseSummaries, testServiceProblems, TEST_SERVICE_VAR } from '../tools/sellable.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 56;

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

    /* 3f and 3g, THE SEAL'S OWN TEETH: two planted future signers, each still naming the packager's vm so
       that the source-text check passes, swapped onto the real prototype for one run each. F1 also starts a
       process; F4 also opens an HTTPS connection and swallows the refusal, so it still signs and only the
       count sees it. Counters set up under the seal count what the planted code itself got through, and both
       must read nought. The control is the same wrapper with no escape in it, which records nothing. */
    {
      const proto = EB.WindowsSignAzureManager.prototype, real = proto.signFile;
      const cp = require('node:child_process'), net = require('node:net'), https = require('node:https');
      let flag = false, started = 0, connected = 0;
      const exec = cp.execFileSync, conn = net.Socket.prototype.connect;
      cp.execFileSync = function () { if (flag) started++; return exec.apply(this, arguments); };
      net.Socket.prototype.connect = function () { if (flag) connected++; return conn.apply(this, arguments); };
      const trial = async act => {
        const mark = ESCAPES.length;
        started = 0; connected = 0;
        proto.signFile = async function (...a) { /* this.packager.vm.value */ flag = true; try { act(); } finally { flag = false; } return real.apply(this, a); };
        try { const r = await wouldSign(winWith(AZ)); return { r, seen: ESCAPES.splice(mark), started, connected }; }
        finally { proto.signFile = real; }
      };
      let f1, f4, none;
      try {
        f1 = await trial(() => cp.execFileSync(process.execPath, ['-e', '']));
        f4 = await trial(() => { try { https.get('https://signer.invalid/', () => {}).on('error', () => {}); } catch (e) { /* swallowed, as a signer might */ } });
        none = await trial(() => {});
      } finally { cp.execFileSync = exec; net.Socket.prototype.connect = conn; }
      check(f1.seen.includes('child_process.execFileSync') && f1.started === 0 && f1.r.signs === false,
        '3f a planted signer that names the vm and also starts a process is caught by the seal: it reached for ' + JSON.stringify([...new Set(f1.seen)])
        + ', started ' + f1.started + ' process(es), and its run failed (signs ' + f1.r.signs + ')');
      check(f4.seen.includes('https.get') && f4.connected === 0 && f4.r.signs === true && none.seen.length === 0 && none.r.signs === true,
        '3g a planted signer that names the vm and also opens an HTTPS connection, swallowing the refusal, is caught by the count alone: it reached for '
        + JSON.stringify([...new Set(f4.seen)]) + ', made ' + f4.connected + ' connection(s) and still signed (' + f4.r.signs + '); CONTROL: the same wrapper with no escape'
        + ' records ' + none.seen.length + ' and signs (' + none.r.signs + ')');
    }
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
  const lab = (name, version, licence, opts = {}) => {
    const root = path.join(TMP, 'lab-' + name), dir = path.join(root, 'repo');
    const runs = path.join(root, 'runs');
    fs.mkdirSync(runs, { recursive: true });
    for (const d of ['tools', 'tests', 'shell', path.join('src', 'modules')]) fs.mkdirSync(path.join(dir, d), { recursive: true });
    for (const f of ['tools/release.mjs', 'tools/sellable.mjs', 'tools/sbom.mjs', 'tests/engine.js', 'electron-builder.js', 'tools/signin-secret.cjs', 'tools/test-service.cjs', 'tools/seller-address.cjs', 'tools/esigner.cjs', 'package.json', 'shell/main.js'])
      fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    fs.writeFileSync(path.join(dir, 'src', 'modules', 'env.js'), 'const E_VERSION="' + version + '";\n');
    fs.writeFileSync(path.join(dir, 'shell', 'license_en.txt'), licence);
    fs.writeFileSync(path.join(dir, 'shell', 'license_pl.txt'), licence);
    const git = (...a) => execFileSync('git', ['-c', 'user.name=sellable', '-c', 'user.email=sellable@invalid',
      '-c', 'core.autocrlf=false', ...a], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'lab');
    const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: dir, encoding: 'utf8' }).trim();
    if (opts.greenSummary) {
      const summary = {
        kind: 'profile-summary',
        profile: 'release',
        gitTree: tree,
        commit: 'lab-commit',
        gates: {
          profile: ['unit', 'hygiene'],
          ran: ['unit', 'hygiene'],
          total: 2,
          completed: 2,
        },
        reds: { holds: [], warns: [] },
        holds: false,
        inherits: '',
        start: new Date().toISOString(),
        end: new Date().toISOString(),
        time: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(runs, 'release-summary-20261108T000000-000.json'), JSON.stringify(summary, null, 2) + '\n');
    }
    return { root, dir, runs, tree, git };
  };
  const release = (l, argv, cert, extraEnv = {}) => {
    const env = { ...process.env, ETIUDA_RELEASE_HOME_ROOT: l.root, ETIUDA_RUNS: l.runs };
    for (const k of SIGNING_VARS) delete env[k];
    Object.assign(env, extraEnv);
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
  const d = release(lab('sellable', '2.0.0', FILLED, { greenSummary: true }), [], 'C:/nowhere/etiuda.pfx');
  check(past2(d) && /a CUSTOMER build, and nothing in the tree stops it being sold/.test(d.out),
    '6d a customer version with the page filled and a certificate configured passes gate 2, exit ' + d.status);
  /* 6e and 6f, GATE 1 AND AN UNTRACKED FILE (board 830). A release is of a commit, so gate 1 refuses a tree with
     anything uncommitted, an untracked file included. git's own configuration can hide untracked files from
     `git status` (status.showUntrackedFiles=no, set globally or in the repository), and the gate then passed a tree
     that was not the commit. 6e is the control: a stray untracked file is refused with git's defaults, exit 1.
     6f plants the setting in the lab repository's own configuration and wants the same refusal. */
  const strayLab = (name, hide) => {
    const l = lab(name, '2.0.0-dev', HOLED);
    fs.writeFileSync(path.join(l.dir, 'stray-note.txt'), 'not committed\n');
    if (hide) execFileSync('git', ['config', 'status.showUntrackedFiles', 'no'], { cwd: l.dir });
    return l;
  };
  const stopped1 = run => run.status === 1 && /uncommitted changes; a release is of a commit/.test(run.out) && !/\n\[2\] /.test(run.out);
  const e = release(strayLab('stray', false), []);
  check(stopped1(e), '6e CONTROL: an untracked file in the tree is refused at gate 1 under git\'s defaults, exit ' + e.status);
  const f = release(strayLab('stray-hidden', true), []);
  check(stopped1(f), '6f the same untracked file is still refused at gate 1 with status.showUntrackedFiles=no in the repository\'s own'
    + ' configuration, exit ' + f.status + (stopped1(f) ? '' : ' (the gate went on as far as gate ' + ([...f.out.matchAll(/\n\[(\d+)\] /g)].pop() || [0, '?'])[1] + ')'));

  /* ---- 7. the release profile gate for customer builds (test-regimen.md rule 4, decisions 2026-11-05 11:43) -- */
  const putSummary = (runsDir, tree, opts = {}) => {
    const summary = {
      kind: 'profile-summary',
      profile: opts.profile || 'release',
      gitTree: tree,
      commit: opts.commit || 'lab-commit',
      gates: opts.gates || {
        profile: ['unit', 'hygiene'],
        ran: ['unit', 'hygiene'],
        total: 2,
        completed: 2,
      },
      reds: opts.reds || { holds: [], warns: [] },
      holds: opts.holds != null ? opts.holds : ((opts.reds && opts.reds.holds && opts.reds.holds.length > 0) || false),
      inherits: opts.inherits || '',
      start: new Date().toISOString(),
      end: new Date().toISOString(),
      time: opts.time || new Date().toISOString(),
    };
    const file = path.join(runsDir, 'release-summary-' + (opts.tag || '20261108T000000-000') + '.json');
    fs.writeFileSync(file, JSON.stringify(summary, null, 2) + '\n');
    return file;
  };

  /* 7a (leg 1): Customer version (2.0.0) with no summary in runs is refused before any test/build. */
  const l1 = lab('leg1-nosummary', '2.0.0', FILLED);
  const r1 = release(l1, [], 'C:/nowhere/etiuda.pfx');
  check(stopped2(r1) && /no release profile summary found/.test(r1.out) && /node tools\/gate-run\.mjs release/.test(r1.out) && !/\n\[3\] /.test(r1.out),
    '7a customer build with no summary for its tree is refused at gate 2 and names how to get it, exit ' + r1.status);

  /* 7b (leg 2): Summary for another tree is refused, naming that a different tree is not the same tree. */
  const l2 = lab('leg2-othertree', '2.0.0', FILLED);
  putSummary(l2.runs, '0123456789abcdef0123456789abcdef01234567');
  const r2 = release(l2, [], 'C:/nowhere/etiuda.pfx');
  check(stopped2(r2) && /a different tree is not the same tree/.test(r2.out) && !/\n\[3\] /.test(r2.out),
    '7b summary for another tree is refused at gate 2, exit ' + r2.status);

  /* 7c (leg 3): Summary with hold red is refused; summary with warn red alone is allowed. */
  const l3hold = lab('leg3-hold', '2.0.0', FILLED);
  putSummary(l3hold.runs, l3hold.tree, { reds: { holds: [{ gate: 'chain-split', class: 'hold' }], warns: [] }, holds: true });
  const r3hold = release(l3hold, [], 'C:/nowhere/etiuda.pfx');

  const l3warn = lab('leg3-warn', '2.0.0', FILLED);
  putSummary(l3warn.runs, l3warn.tree, { reds: { holds: [], warns: [{ gate: 'hygiene', class: 'warn' }] }, holds: false });
  const r3warn = release(l3warn, [], 'C:/nowhere/etiuda.pfx');

  check(stopped2(r3hold) && /red\(s\) of class hold: chain-split/.test(r3hold.out) && past2(r3warn),
    '7c summary with a hold red is refused at gate 2 (exit ' + r3hold.status + '), warn red alone is allowed past gate 2 (exit ' + r3warn.status + ')');

  /* 7d (leg 4): Green whole summary for tree allowed past gate 2 to gate 3. */
  const l4 = lab('leg4-green', '2.0.0', FILLED);
  putSummary(l4.runs, l4.tree);
  const r4 = release(l4, [], 'C:/nowhere/etiuda.pfx');
  check(past2(r4) && /its release profile is green for tree/.test(r4.out),
    '7d green whole summary for the tree passes gate 2, exit ' + r4.status);

  /* 7e (leg 5): Preview build with no summary at all is allowed past gate 2 to gate 3. */
  const l5 = lab('leg5-preview', '2.0.0-dev', FILLED);
  const r5 = release(l5, [], 'C:/nowhere/etiuda.pfx');
  check(past2(r5) && /PREVIEW, not for a customer/.test(r5.out),
    '7e preview build with no summary at all is allowed past gate 2, exit ' + r5.status);

  /* 7f (leg 6): Planted removal of the check in tools/release.mjs turns leg 1 red (passes gate 2). */
  const l6 = lab('leg6-plant', '2.0.0', FILLED);
  const relFile = path.join(l6.dir, 'tools', 'release.mjs');
  const relCode = fs.readFileSync(relFile, 'utf8');
  if (!relCode.includes('/* plant:customer-release-profile */')) {
    throw new Error('plant:customer-release-profile marker not found in ' + relFile);
  }
  const liftedCode = relCode.replace(
    /const profileVerdict = customerReleaseProfileVerdict\([^)]+\);\s*\/\* plant:customer-release-profile \*\//,
    'const profileVerdict = true; /* plant:customer-release-profile */'
  );
  fs.writeFileSync(relFile, liftedCode);
  l6.git('commit', '-am', 'lift plant:customer-release-profile');
  const r6 = release(l6, [], 'C:/nowhere/etiuda.pfx');
  check(!stopped2(r6) && past2(r6),
    '7f lifting plant:customer-release-profile turns leg 1 red: customer build with no summary passes gate 2, exit ' + r6.status);
  /* ---- 9. the test service build is never released ------------------------------------------------------------------ */
  /* A lab file the desk's reader takes, so with the refusal lifted the config packs it and the release goes on (9b). */
  fs.writeFileSync(path.join(TMP, 'any-lab.json'), JSON.stringify({ service: 'https://etiuda.dev/licence-staging/v1/', clientIds: { microsoft: '11111111-2222-3333-4444-555555555555' } }));
  const l9 = lab('test-service', '2.0.0-dev', FILLED);
  const r9 = release(l9, [], null, { [TEST_SERVICE_VAR]: path.join(TMP, 'any-lab.json') });
  check(stopped2(r9) && new RegExp(TEST_SERVICE_VAR + ' is set').test(r9.out),
    '9a a preview released with ' + TEST_SERVICE_VAR + ' set stops at gate 2, naming it, exit ' + r9.status);
  const l9p = lab('test-service-plant', '2.0.0-dev', FILLED);
  const rel9 = path.join(l9p.dir, 'tools', 'release.mjs'), rel9Code = fs.readFileSync(rel9, 'utf8');
  const lift9 = rel9Code.replace(/const testService = testServiceProblems\(\{ env: process\.env \}\); \/\* plant:release-ts-var \*\//,
    'const testService = []; /* plant:release-ts-var */');
  if (lift9 === rel9Code) throw new Error('plant:release-ts-var not found in tools/release.mjs');
  fs.writeFileSync(rel9, lift9);
  l9p.git('commit', '-am', 'lift plant:release-ts-var');
  const r9p = release(l9p, [], null, { [TEST_SERVICE_VAR]: path.join(TMP, 'any-lab.json') });
  check(past2(r9p), '9b lifting plant:release-ts-var lets the same release past gate 2, exit ' + r9p.status);
  const res9 = path.join(TMP, 'ts-resources'), clean9 = path.join(TMP, 'ts-clean');
  fs.mkdirSync(res9, { recursive: true }); fs.mkdirSync(clean9, { recursive: true });
  fs.writeFileSync(path.join(res9, 'test-service.json'), '{}\n');
  const said9 = testServiceProblems({ resources: res9 });
  /* A package whose asar carries the fields, packed by @electron/asar itself, and one whose asar does not. */
  const asar9 = async (name, pkg) => {
    const src = path.join(TMP, name + '-src'), res = path.join(TMP, name);
    fs.mkdirSync(src, { recursive: true }); fs.mkdirSync(res, { recursive: true });
    fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify(pkg));
    await require('@electron/asar').createPackage(src, path.join(res, 'app.asar'));
    return res;
  };
  const inAsar9 = await asar9('ts-asar', { name: 'etiuda', etiudaTestService: { service: 'https://etiuda.dev/licence-staging/v1/' } });
  const plainAsar9 = await asar9('ts-asar-plain', { name: 'etiuda' });
  const saidAsar9 = testServiceProblems({ resources: inAsar9 });
  check(said9.length === 1 && /test service build/.test(said9[0]) && testServiceProblems({ resources: clean9, env: {} }).length === 0
    && testServiceProblems({ env: { [TEST_SERVICE_VAR]: '' } }).length === 0,
    '9c a package whose resources carry test-service.json is refused, one without it and an empty variable are not: ' + JSON.stringify(said9));
  check(saidAsar9.length === 1 && /carries the test service fields/.test(saidAsar9[0]) && testServiceProblems({ resources: plainAsar9 }).length === 0,
    '9g a package whose asar carries the test service fields is refused, one whose asar does not is not: ' + JSON.stringify(saidAsar9));
  /* 9d, the file's refusal planted: tools/sellable.mjs copied with its plant line put in another form and imported. */
  const sell9 = fs.readFileSync(path.join(ROOT, 'tools', 'sellable.mjs'), 'utf8');
  const sellLift = sell9.split('\n').map(l => /plant:sell-ts-file/.test(l) ? '    if (false) out.push(""); /* plant:sell-ts-file */' : l).join('\n');
  const sellAt = path.join(TMP, 'sellable-planted.mjs');
  fs.writeFileSync(sellAt, sellLift);
  for (const f of ['test-service.cjs', 'esigner.cjs']) fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(TMP, f));
  const planted9 = await import(pathToFileURL(sellAt).href);
  const varLift = sell9.split('\n').map(l => /plant:sell-ts-var/.test(l) ? '    void 0; /* plant:sell-ts-var */' : l).join('\n');
  const varAt = path.join(TMP, 'sellable-planted-var.mjs');
  fs.writeFileSync(varAt, varLift);
  const plantedVar = await import(pathToFileURL(varAt).href);
  const asarLift = sell9.split('\n').map(l => /plant:sell-ts-asar/.test(l) ? '    void pkg; /* plant:sell-ts-asar */' : l).join('\n');
  const asarAt = path.join(TMP, 'sellable-planted-asar.mjs');
  fs.writeFileSync(asarAt, asarLift);
  const plantedAsar = await import(pathToFileURL(asarAt).href);
  check(sellLift !== sell9 && planted9.testServiceProblems({ resources: res9 }).length === 0
    && varLift !== sell9 && plantedVar.testServiceProblems({ env: { [TEST_SERVICE_VAR]: 'x' } }).length === 0
    && asarLift !== sell9 && plantedAsar.testServiceProblems({ resources: inAsar9 }).length === 0,
    '9d with plant:sell-ts-file, plant:sell-ts-var and plant:sell-ts-asar each put in another form, the loose file, the variable and the asar\'s fields each go unrefused, so 9c, 9a and 9g have teeth');
  /* 9e, structure: the installer's gate in tools/release.mjs asks the same question of the package it built (it cannot be
     driven here without packaging). */
  const relReal = fs.readFileSync(path.join(ROOT, 'tools', 'release.mjs'), 'utf8');
  const gateAt = relReal.indexOf("gate('the installer, built from this tree"), gateEnd = relReal.indexOf('\n  });', gateAt);
  check(gateAt > 0 && /testServiceProblems\(\{ resources: join\(DIST, 'win-unpacked', 'resources'\) \}\); \/\* plant:release-ts-file \*\/\r?\n\s+if \(testService\.length\) return/.test(relReal.slice(gateAt, gateEnd)),
    '9e the installer\'s gate refuses a built package carrying the file (read in its body, plant:release-ts-file)');
  /* 9f, the release profile: this tree's own package, where one is built, carries no test service file. */
  if (process.env.ETIUDA_PROFILE === 'release' || process.env.ETIUDA_PROFILE === 'nightly') {
    const own = path.join(path.resolve(ROOT, process.env.ETIUDA_DIST || 'dist'), 'win-unpacked', 'resources');
    const ownSaid = testServiceProblems({ resources: own });
    check(ownSaid.length === 0, '9f the release profile finds no test service package in ' + own + (ownSaid.length ? ': ' + ownSaid.join('; ') : ''));
  } else check(true, '9f outside the release profile, this tree\'s own package is not read (ETIUDA_PROFILE is not release or nightly)');
  /* ---- 10. the eSigner route (tools/esigner.cjs) ---------------------------------------------------------------------- */
  /* Its effects are replaced for every leg here (ES.io), so nothing is started, read from the keyring or reached. */
  const ES = require(path.join(ROOT, 'tools', 'esigner.cjs'));
  const IO = { ...ES.io };
  const U16 = s => Buffer.from(s, 'utf16le').toString('base64');
  /* Planted values, the password holding what an argument file must escape: a hash, a quote and a backslash. */
  const VAL = { username: 'planted-user', password: 'pl#nted"pa\\ss', 'credential-id': 'planted-credential', 'totp-secret': 'plantedTotpSecret+/=' };
  const THUMB10 = 'AB'.repeat(20), WHO10 = 'CN=Example Publisher';
  const calls10 = [], logs10 = [];
  let readBack = null;
  const TEMP10 = path.join(TMP, 'es-temp');
  fs.mkdirSync(TEMP10, { recursive: true });
  const fakeIo = {
    /* python-keyring's layout after storing the four in order: the last under the service, the rest under name@service. */
    readCredentials: targets => targets.map(t => t === ES.KEYRING_SERVICE ? ['totp-secret', U16(VAL['totp-secret'])]
      : /^(username|password|credential-id)@/.test(t) ? [t.split('@')[0], U16(VAL[t.split('@')[0]])] : null),
    run: (file, args, opts) => {
      const at = args.find(a => a[0] === '@'), arg = k => (args.find(a => a.startsWith(k + '=')) || '').slice(k.length + 1);
      calls10.push({ file, args, env: opts.env, argText: at && fs.existsSync(at.slice(1)) ? fs.readFileSync(at.slice(1), 'utf8') : null, argFile: at && at.slice(1) });
      if (args.includes('sign') && !process.env.ES_PLANT_NO_OUTPUT)
        fs.writeFileSync(path.join(arg('-output_dir_path'), path.basename(arg('-input_file_path'))), 'signed by the planted tool');
      return { status: 0, stdout: 'Code signed successfully', stderr: '' };
    },
    leaf: () => ({ thumbprint: THUMB10, subject: WHO10 }),
    readSignature: () => readBack || { status: 'Valid', timestamped: true, thumbprint: THUMB10, subject: WHO10 },
    /* A temporary folder of the legs' own, so the session's sweep (10j) never reaches the desk's real one. */
    tmp: () => TEMP10,
    now: (() => { let n = 0; return () => (n += 1000); })(),
    log: line => logs10.push(line),
  };
  Object.assign(ES.io, fakeIo);
  /* A planted CodeSignTool folder, pinned for these legs by its own files' hashes; 10f puts the real pins back on a copy. */
  const TOOL_ROOT = path.join(TMP, 'es-root', 'tree'), TOOL_AT = path.join(TMP, 'es-root', 'tools-external', ES.TOOL.folder);
  const realPins = { ...ES.TOOL.sha256 };
  for (const rel of [ES.TOOL.jar, ES.TOOL.java, 'conf/code_sign_tool.properties']) {
    fs.mkdirSync(path.dirname(path.join(TOOL_AT, rel)), { recursive: true });
    fs.writeFileSync(path.join(TOOL_AT, rel), 'planted ' + rel + '\n');
  }
  fs.mkdirSync(TOOL_ROOT, { recursive: true });
  for (const rel of Object.keys(ES.TOOL.sha256))
    ES.TOOL.sha256[rel] = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(TOOL_AT, rel))).digest('hex');
  const OUT10 = path.join(TMP, 'es-dist');
  const target = name => { const f = path.join(TMP, name); fs.writeFileSync(f, 'unsigned ' + name); return f; };
  const hookFor = kind => ES.esignerSigning({ ETIUDA_SIGN: kind }, TOOL_ROOT, OUT10).signtoolOptions.sign;
  const thrown = async run => { try { await run(); return ''; } catch (e) { return String(e.message); } };
  try {
    /* 10a: unset, electron-builder.js takes no block from the route; set, the block is the hook alone, sha256 once a file. The
       control is plant:esigner-default lifted on the same module, which then hands the unset build a block. */
    const unset10 = winWith(null), set10 = winWith({ ETIUDA_SIGN: 'esigner' }), st10 = set10.signtoolOptions || {};
    const esText = fs.readFileSync(path.join(ROOT, 'tools', 'esigner.cjs'), 'utf8');
    const esLift = esText.split('\n').map(l => /plant:esigner-default/.test(l) ? '  if (!kind) return { signtoolOptions: { signingHashAlgorithms: ["sha256"] } }; /* plant:esigner-default */' : l).join('\n');
    const esWas = ES.esignerSigning;
    const planted10 = new Function('require', '__dirname', 'module', esLift + '\nreturn module.exports;')(require, path.join(ROOT, 'tools'), { exports: {} });
    ES.esignerSigning = planted10.esignerSigning;
    let unsetPlanted;
    try { unsetPlanted = winWith(null); } finally { ES.esignerSigning = esWas; }
    check(routeOf(unset10) === '{}' && typeof st10.sign === 'function' && JSON.stringify(st10.signingHashAlgorithms) === '["sha256"]'
      && Object.keys(st10).length === 2 && !set10.azureSignOptions && signingConfigured(set10, {}) && !signingConfigured(unset10, {})
      && esLift !== esText && routeOf(unsetPlanted) !== '{}',
      '10a with ETIUDA_SIGN unset the real builder takes no block from the route and signs nothing; set to esigner its block is the hook'
      + ' alone, sha256 once a file; and with plant:esigner-default lifted the unset build would carry a block (' + routeOf(unsetPlanted) + ')');

    /* 10b: two routes at once, or a value the route does not know, refuse by name. */
    const refusal10 = vars => { try { winWith(vars); return ''; } catch (e) { return String(e.message); } };
    const e1 = refusal10({ ETIUDA_SIGN: 'esigner', ETIUDA_CERT: PFX }), e2 = refusal10({ ETIUDA_SIGN: 'esigner-demo', ...AZ });
    const e3 = refusal10({ ETIUDA_SIGN: 'esigner-live' });
    check(/ETIUDA_CERT and ETIUDA_SIGN are set/.test(e1) && /ETIUDA_SIGNING_\* and ETIUDA_SIGN are set/.test(e2) && /takes esigner or esigner-demo$/.test(e3),
      '10b ETIUDA_SIGN beside another route refuses naming both, and a value it does not know names the two it takes: ' + JSON.stringify([e1, e2, e3]));

    /* 10c: electron-builder's own signing path, sealed, hands the hook each file once; the file then holds what the tool wrote,
       read back where it stands; the session asked for the account's certificate once. */
    if (!EB) skip('10c needs app-builder-lib in node_modules to ask electron-builder itself', 1);
    else {
      const mark = ESCAPES.length, signsAt = calls10.length;
      const block = { signtoolOptions: { sign: hookFor('esigner'), signingHashAlgorithms: ['sha256'] } };
      const eb10 = await wouldSign(block);
      const setupAt = path.join(TMP, 'etiuda-setup.exe');
      const made = calls10.slice(signsAt);
      check(eb10.signs === true && ESCAPES.length === mark && made.map(c => c.args[3]).join() === 'get_certs,sign'
        && made[1].args.includes('-input_file_path=' + setupAt) && logs10.length === 1 && /signing 1 of this build/.test(logs10[0]),
        '10c electron-builder\'s signing path, sealed, hands the hook the file once (sha256 alone), which asks CodeSignTool for the'
        + ' account\'s certificate once and signs once, nothing escaping the seal: ' + made.map(c => c.args[3]).join(', ') + (eb10.why ? ' (' + eb10.why + ')' : ''));
    }

    /* 10d: the four values never on a command line or in an environment; each call's argument file held them, escaped for
       picocli, and was gone once the call returned. */
    const before10 = calls10.length;
    const f10 = target('probe-d.exe');
    await hookFor('esigner')({ path: f10 });
    const d10 = calls10.slice(before10), secrets = Object.values(VAL);
    const onLine = d10.some(c => c.args.some(a => secrets.some(s => a.includes(s))));
    const inEnv = d10.some(c => Object.values(c.env || {}).some(v => secrets.some(s => String(v).includes(s))));
    const escaped = d10.every(c => c.argText && c.argText.includes('-password\n"pl#nted\\"pa\\\\ss"\n') && c.argText.includes('-username\n"planted-user"\n'))
      && d10[1].argText.includes('-totp_secret\n"plantedTotpSecret+/="\n') && !d10[0].argText.includes('-totp_secret');
    check(!onLine && !inEnv && escaped && d10.every(c => !fs.existsSync(c.argFile)) && fs.readFileSync(f10, 'utf8') === 'signed by the planted tool',
      '10d no value is on a command line (' + onLine + ') or in an environment (' + inEnv + '); each call\'s argument file held them quoted,'
      + ' the hash, quote and backslash escaped (' + escaped + '), the TOTP secret only for sign, and every file was gone after its call');

    /* 10e: the exit code is not the answer. A file read back unsigned, untimestamped, by another certificate, or (for the live
       account) chained to no trusted root stops the build; the demo account's untrusted chain is its expected reading. */
    const refusals = [];
    for (const [name, reading, kind] of [['NotSigned', { status: 'NotSigned', timestamped: false, thumbprint: '', subject: '' }, 'esigner'],
      ['no timestamp', { status: 'Valid', timestamped: false, thumbprint: THUMB10, subject: WHO10 }, 'esigner'],
      ['another certificate', { status: 'Valid', timestamped: true, thumbprint: 'CD'.repeat(20), subject: WHO10 }, 'esigner'],
      ['UnknownError, live', { status: 'UnknownError', timestamped: true, thumbprint: THUMB10, subject: WHO10 }, 'esigner']]) {
      readBack = reading;
      refusals.push([name, await thrown(() => hookFor(kind)({ path: target('probe-e.exe') }))]);
    }
    readBack = null;
    process.env.ES_PLANT_NO_OUTPUT = '1';
    refusals.push(['exit 0, no file', await thrown(() => hookFor('esigner')({ path: target('probe-e.exe') }))]);
    delete process.env.ES_PLANT_NO_OUTPUT;
    const demoLeaf = ES.io.leaf;
    ES.io.leaf = () => ({ thumbprint: THUMB10, subject: 'C=US\nOU=Cloud Signing Demo\nO=Esigner LLC' });
    readBack = { status: 'UnknownError', timestamped: true, thumbprint: THUMB10, subject: 'OU=Cloud Signing Demo, O=Esigner LLC' };
    const demoOk = await thrown(() => hookFor('esigner-demo')({ path: target('probe-e.exe') }));
    const demoAsLive = await thrown(() => hookFor('esigner')({ path: target('probe-e.exe') }));
    ES.io.leaf = demoLeaf;
    readBack = null;
    const liveAsDemo = await thrown(() => hookFor('esigner-demo')({ path: target('probe-e.exe') }));
    check(refusals.every(r => /^signing: /.test(r[1])) && /reads Authenticode NotSigned/.test(refusals[0][1]) && /has no timestamp/.test(refusals[1][1])
      && /is signed by CDCD/.test(refusals[2][1]) && /reads Authenticode UnknownError/.test(refusals[3][1]) && /wrote no/.test(refusals[4][1])
      && demoOk === '' && /certificate is the demo one/.test(demoAsLive) && /certificate is not the demo one/.test(liveAsDemo),
      '10e with the tool saying success every time, the build stops on ' + refusals.map(r => r[0] + (r[1] ? '' : ' (PASSED)')).join(', ')
      + '; the demo account\'s untrusted chain passes as demo, and the demo certificate under esigner, or another under esigner-demo, stops the session');

    /* 10f: the keyring read by python-keyring's rule (10d read all four), a missing name named and no value printed; and the tool
       found only where its pinned files match, so a changed byte under the real pins is refused. */
    const realRead = ES.io.readCredentials;
    ES.io.readCredentials = targets => targets.map(t => /^password@/.test(t) ? null : fakeIo.readCredentials([t])[0]);
    const short = await thrown(() => ES.fromKeyring());
    ES.io.readCredentials = realRead;
    const got = ES.fromKeyring();
    Object.assign(ES.TOOL.sha256, realPins);
    const pin = await thrown(() => ES.findTool(TOOL_ROOT));
    check(JSON.stringify(got) === JSON.stringify(VAL) && /holds no password;/.test(short) && !secrets.some(s => short.includes(s))
      && /is not the pinned CodeSignTool file/.test(pin),
      '10f the keyring\'s four come back by python-keyring\'s rule, one missing is named with no value shown (' + short + '), and a tool folder'
      + ' whose files are not the pinned ones is refused (' + pin.split(' (')[0] + ')');

    /* 10g: a demo-signed build is never released: the variable, and a file carrying the demo certificate's subject even where
       Windows read it Valid; plant:sell-demo-var and plant:sell-demo-subject lifted each let it through. */
    const SELL10 = await import(pathToFileURL(path.join(ROOT, 'tools', 'sellable.mjs')).href);
    const demoRead = [{ file: 'C:/x/etiuda-setup.exe', status: 'Valid', timestamped: true, subject: 'CN=Esigner LLC, OU=Cloud Signing Demo, O=Esigner LLC' }];
    const fineRead = [{ file: 'C:/x/etiuda-setup.exe', status: 'Valid', timestamped: true, subject: WHO10 }];
    const asks = typeof SELL10.demoSigningProblems === 'function';
    const v10 = signatureVerdict({ setup: EN_FILE, program: EN_FILE, customer: false, win: {}, read: () => demoRead, log: () => {} });
    const v10ok = signatureVerdict({ setup: EN_FILE, program: EN_FILE, customer: true, win: {}, read: files => files.map(f => ({ ...fineRead[0], file: f })), log: () => {} });
    const sellText = fs.readFileSync(path.join(ROOT, 'tools', 'sellable.mjs'), 'utf8');
    const lift10 = (marker, line) => {
      const t = sellText.split('\n').map(l => l.includes('plant:' + marker) ? line + ' /* plant:' + marker + ' */' : l).join('\n');
      const at = path.join(TMP, 'sellable-' + marker + '.mjs');
      fs.writeFileSync(at, t);
      return t === sellText ? null : at;
    };
    const varAt10 = lift10('sell-demo-var', '  void 0;'), subjAt10 = lift10('sell-demo-subject', '  void 0;');
    const pv = varAt10 && await import(pathToFileURL(varAt10).href), ps = subjAt10 && await import(pathToFileURL(subjAt10).href);
    check(asks && SELL10.demoSigningProblems({ env: { ETIUDA_SIGN: 'esigner-demo' } }).length === 1 && SELL10.demoSigningProblems({ env: { ETIUDA_SIGN: 'esigner' } }).length === 0
      && typeof v10 === 'string' && /etiuda-setup\.exe is signed by SSL\.com's demo certificate/.test(v10) && v10ok === true
      && pv && pv.demoSigningProblems({ env: { ETIUDA_SIGN: 'esigner-demo' } }).length === 0 && ps && ps.demoSigningProblems({ readings: demoRead }).length === 0,
      '10g a demo-signed build is refused by the variable and, read Valid or not, by the demo certificate\'s subject (' + v10 + '), a real subject'
      + ' passes, and plant:sell-demo-var and plant:sell-demo-subject lifted each let it through');
    const l10 = lab('esigner-demo', '2.0.0-dev', FILLED);
    const r10 = release(l10, [], null, { ETIUDA_SIGN: 'esigner-demo' });
    check(stopped2(r10) && /ETIUDA_SIGN is esigner-demo/.test(r10.out),
      '10h a preview released with ETIUDA_SIGN=esigner-demo stops at gate 2, naming it, exit ' + r10.status);
    const l10p = lab('esigner-demo-plant', '2.0.0-dev', FILLED);
    const rel10 = path.join(l10p.dir, 'tools', 'release.mjs'), rel10Code = fs.readFileSync(rel10, 'utf8');
    const lift10r = rel10Code.replace(/const demoSigned = demoSigningProblems\(\{ env: process\.env \}\); \/\* plant:release-demo-var \*\//,
      'const demoSigned = []; /* plant:release-demo-var */');
    fs.writeFileSync(rel10, lift10r);
    l10p.git('commit', '-am', 'lift plant:release-demo-var');
    const r10p = release(l10p, [], null, { ETIUDA_SIGN: 'esigner-demo' });
    check(lift10r !== rel10Code && past2(r10p), '10i lifting plant:release-demo-var lets the same release past gate 2, exit ' + r10p.status);
    /* 10j: a packaging command killed mid-call leaves its argument folder behind; the next session removes this tool's own
       stale folders by their exact prefix, and nothing else in the temporary folder, which here is a planted one. */
    const TMP_ROOT = path.join(TMP, 'es-tmp'), hourAgo = new Date(Date.now() - 3600000);
    fs.mkdirSync(TMP_ROOT, { recursive: true });
    const plant = (name, dir, old) => {
      const at = path.join(TMP_ROOT, name);
      if (dir) { fs.mkdirSync(at, { recursive: true }); fs.writeFileSync(path.join(at, 'args'), '-password\n"planted"\n'); }
      else fs.writeFileSync(at, 'x');
      if (old) fs.utimesSync(at, hourAgo, hourAgo);
      return at;
    };
    const stale = plant('etiuda-esigner-stale1', true, true);
    const keep = [plant('etiuda-esigner-fresh1', true, false), plant('etiuda-esigner-file', false, true),
      plant('etiuda-esignerx-stale', true, true), plant('etiuda-sellable-stale', true, true), plant('xetiuda-esigner-stale', true, true)];
    for (const rel of Object.keys(ES.TOOL.sha256))   /* 10f put the real pins back */
      ES.TOOL.sha256[rel] = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(TOOL_AT, rel))).digest('hex');
    const tmpWas = ES.io.tmp;
    ES.io.tmp = () => TMP_ROOT;
    try { await hookFor('esigner')({ path: target('probe-j.exe') }); } finally { ES.io.tmp = tmpWas; }
    const left = fs.readdirSync(TMP_ROOT).sort();
    check(!fs.existsSync(stale) && keep.every(k => fs.existsSync(k)) && left.length === keep.length,
      '10j a stale etiuda-esigner- folder holding an argument file is gone once the next session starts, while a fresh folder of'
      + ' that prefix, a stale file of it, stale folders of other names and the session\'s own spent folders are as they should be: '
      + JSON.stringify(left));
  } finally {
    Object.assign(ES.io, IO);
    Object.assign(ES.TOOL.sha256, realPins);
  }

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
  check(!fs.existsSync(TMP), '8a the temp folder is gone');
}

console.log('#counts checks=' + asserted + ' failed=' + failed + ' notRun=' + notRun.length + ' expected=' + EXPECTED);
if (asserted + notRun.length < EXPECTED) {
  console.log('SUITE DID NOT COMPLETE: ' + asserted + ' of ' + EXPECTED + ' checks ran');
  process.exit(78);
}
console.log(failed ? '  RESULT: FAIL ' + failed + ' of ' + asserted : '  RESULT: ok ' + asserted + ' check(s)');
process.exit(Math.min(failed, 63));
