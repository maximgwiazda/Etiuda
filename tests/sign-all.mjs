/* EVERY FILE THE INSTALLER PUTS ON DISK THAT WINDOWS RUNS AS CODE IS SIGNED, AND READ BACK.
 *
 *   node tests/sign-all.mjs            exit code is the number of failed checks, capped at 63
 *
 * A publisher rule (AppLocker, Application Control) allows or refuses each program and library
 * by its own signature, so one unsigned DLL beside a signed Etiuda.exe is a desk that does not
 * start. Nothing here packages, signs or asks Windows anything. What each leg holds:
 *   1  electron-builder's own code, given the real electron-builder.js and a certificate, hands its signer
 *      every PE file of an app laid out as Electron's dist and the config's extra resources lay it out
 *      (the top-level DLLs, the caret helper, the model's runtime) except those its maker already signed,
 *      which the config's afterExtract door keeps from it: a Microsoft-signed DLL is never handed; with no
 *      certificate the door reads nothing; with plant:sign-exts, plant:sign-caret or plant:sign-keep
 *      lifted, the files each one brings in go unsigned, or the maker's DLLs go to the signer
 *   2  the signature gate (tools/sellable.mjs signatureVerdict) given that app reads every one of those
 *      files back through its replaceable reader: one unsigned DLL, top-level or nested, is named; all
 *      ours passes, and a DLL Microsoft signed passes beside them; one signed by a publisher not on the
 *      makers' list is named; a preview with no certificate passes and is told; a PE file under another
 *      name is read and a text file opening MZ is not; a file the reader leaves unanswered is refused;
 *      with plant:sign-walk, plant:sign-unread, plant:sign-header, plant:sign-unsigned or
 *      plant:sign-publisher lifted, the fault each catches passes
 *   3  tools/release.mjs gives the gate the unpacked app
 *
 * The expected values below were written from the rule in tools/sellable.mjs before any run. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { signatureVerdict, peFiles, SIGNING_VARS, signIo, MAKERS } from '../tools/sellable.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* Off in a merge's area run, which runs no planted fault. */
const PLANTS = process.env.ETIUDA_PLANTS !== 'off';
const require = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 16;

let asserted = 0, failed = 0;
const notRun = [];
function check(ok, line) {
  asserted++;
  if (ok) console.log('  ok   ' + line);
  else { failed++; console.log('  FAIL ' + line); }
}
function skip(why, legs) { for (let i = 0; i < legs; i++) notRun.push(why); console.log('  NOT RUN ' + why); }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'etiuda-sign-all-'));
const J = JSON.stringify;
const rel = (dir, f) => path.relative(dir, f).replace(/\\/g, '/');
/* The smallest file Windows would take for a PE image: MZ, the offset at 60, PE and two zero bytes there. */
const PE = () => { const b = Buffer.alloc(128); b.write('MZ', 0, 'latin1'); b.writeUInt32LE(64, 60); b.write('PE\0\0', 64, 'latin1'); return b; };
const put = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); return file; };

/* THE REAL electron-builder.js, or a copy of its text with one plant lifted, evaluated with every variable that adds a
   route or a resource cleared, so nothing on the desk running this changes what is read and no keyring is asked. */
const BUILDER = path.join(ROOT, 'electron-builder.js');
const BUILDER_TEXT = fs.readFileSync(BUILDER, 'utf8');
const QUIET = SIGNING_VARS.concat(['CSC_KEY_PASSWORD', 'WIN_CSC_KEY_PASSWORD', 'ETIUDA_GOOGLE_CLIENT_SECRET', 'ETIUDA_PACK_TEST_SERVICE',
  'ETIUDA_PACK_SELLER_ADDRESS']);
function config(text, out, cert) {
  const was = {};
  for (const k of QUIET.concat(['ETIUDA_DIST'])) { was[k] = process.env[k]; delete process.env[k]; }
  process.env.ETIUDA_DIST = out;
  if (cert) process.env.ETIUDA_CERT = 'C:/nowhere/etiuda.pfx';
  try {
    const m = { exports: {} };
    new Function('require', '__dirname', 'module', 'exports', text)(createRequire(BUILDER), ROOT, m, m.exports);
    return m.exports;
  } finally { for (const [k, v] of Object.entries(was)) { if (v == null) delete process.env[k]; else process.env[k] = v; } }
}
const lift = (marker, line) => {
  const t = BUILDER_TEXT.split('\n').map(l => l.includes('plant:' + marker) ? line + ' /* plant:' + marker + ' */' : l).join('\n');
  return t === BUILDER_TEXT ? null : t;
};

/* electron-builder's own Windows packager, as tests/sellable.mjs reads it. */
const ABL = path.join(ROOT, 'node_modules', 'app-builder-lib', 'package.json');
let EB = null, ebMissing = '';
if (fs.existsSync(ABL)) {
  try {
    const abl = createRequire(ABL);
    abl('app-builder-lib');
    EB = { ...abl('./out/winPackager.js'), ...abl('./out/fileMatcher.js') };
    for (const k of ['WinPackager', 'getFileMatchers', 'copyFiles'])
      if (!EB[k]) throw new Error('app-builder-lib no longer exports ' + k + ' where this leg reads it');
    for (const k of ['signApp', 'createTransformerForExtraFiles', 'shouldSignFile'])
      if (typeof EB.WinPackager.prototype[k] !== 'function') throw new Error('WinPackager no longer has ' + k);
  } catch (e) { EB = null; ebMissing = String(e.message).split('\n')[0]; }
}

/* WHILE electron-builder's code runs, nothing may start a process or reach a network: each such call throws and is
   counted, and every leg in 1 requires the count to be nought. */
const ESCAPES = [];
async function sealed(run) {
  const SEAL = [[require('node:child_process'), 'child_process', ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']],
    [require('node:http'), 'http', ['request', 'get']], [require('node:https'), 'https', ['request', 'get']],
    [require('node:net'), 'net', ['connect', 'createConnection']], [globalThis, 'globalThis', ['fetch']]];
  const put = [];
  for (const [obj, label, names] of SEAL) for (const n of names) {
    const was = Object.getOwnPropertyDescriptor(obj, n);
    if (!was) continue;
    put.push([obj, n, was]);
    Object.defineProperty(obj, n, { configurable: true, writable: true, value: function () { ESCAPES.push(label + '.' + n); throw new Error('sealed: ' + label + '.' + n); } });
  }
  try { return await run(); } finally { for (const [obj, n, was] of put.reverse()) Object.defineProperty(obj, n, was); }
}

/* AN APP LAID OUT AS THE BUILD LAYS IT OUT, into `app`: Electron's dist at the top (each file of it under its own name,
   electron.exe as Etiuda.exe, a PE stub where the real file is one), then the config's extra resources copied by
   electron-builder's own copier into resources/, from an output folder holding a planted caret helper and model.
   The packager's signIf records; the config's afterExtract (or `door`) narrows it first, as a build does, and the door
   asks Windows through signIo, which here answers MICROSOFT's names Valid under Microsoft and every other file NotSigned.
   Returns the files electron-builder handed its signer, relative to `app`, and how many readings the door asked for. */
const DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const RUNTIME = require(path.join(ROOT, 'tools', 'model-runtime.json'));
const MS_SUBJECT = 'CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US';
const MICROSOFT = ['d3dcompiler_47.dll', 'dxil.dll'].concat(RUNTIME.native.win32.map(f => path.basename(f.name)));
const atSignTime = files => files.map(f => MICROSOFT.includes(path.basename(f))
  ? { file: f, status: 'Valid', timestamped: true, subject: MS_SUBJECT } : { file: f, status: 'NotSigned', timestamped: false, subject: '' });
async function build(name, text, { cert = true, door = null } = {}) {
  const out = path.join(TMP, name + '-out'), app = path.join(out, 'win-unpacked');
  const cfg = config(text, out, cert);
  for (const f of fs.readdirSync(DIST)) {
    const at = path.join(DIST, f);
    if (!fs.statSync(at).isFile()) continue;
    const fd = fs.openSync(at, 'r'), head = Buffer.alloc(2);
    try { fs.readSync(fd, head, 0, 2, 0); } finally { fs.closeSync(fd); }
    const real = head.toString('latin1') === 'MZ';
    put(path.join(app, f === 'electron.exe' ? 'Etiuda.exe' : f), real ? PE() : 'not code');
  }
  put(path.join(app, 'resources', 'app.asar'), 'an archive, not code');
  put(path.join(out, '.caret', 'caret.exe'), PE());
  for (const f of RUNTIME.native.win32) put(path.join(out, '.embed', 'runtime', 'node_modules', f.name), PE());
  put(path.join(out, '.embed', 'runtime', 'node_modules', RUNTIME.common[0].name), 'module.exports = {};');
  put(path.join(out, '.embed', 'model', 'model.onnx'), 'weights, not code');
  const handed = [];
  const stub = Object.create(EB.WinPackager.prototype);
  Object.assign(stub, { platformSpecificBuildOptions: cfg.win, info: { config: cfg },
    appInfo: { productFilename: 'Etiuda' },
    signIf: async f => { handed.push(f); return true; },
    signAndEditResources: async function (f) { await this.signIf(f); } });
  let reads = 0;
  const io = { ...signIo };
  signIo.read = files => { reads += files.length; return atSignTime(files); };
  signIo.log = () => {};
  try {
    if (door) door(stub); else if (typeof cfg.afterExtract === 'function') await cfg.afterExtract({ packager: stub, electronPlatformName: 'win32', appOutDir: app });
  await sealed(async () => {
    const matchers = EB.getFileMatchers(cfg, 'extraResources', path.join(app, 'resources'),
      { macroExpander: s => s, customBuildOptions: cfg.win, globalOutDir: out, defaultSrc: ROOT }) || [];
    for (const m of matchers) m.computeParsedPatterns([], ROOT);
    await EB.copyFiles(matchers, stub.createTransformerForExtraFiles({ appOutDir: app }));
    await stub.signApp({ appOutDir: app }, true);
  });
  } finally { Object.assign(signIo, io); }
  return { app, out, reads, signed: [...new Set(handed.map(f => rel(app, f)))].sort(), pe: peFiles(app).map(f => rel(app, f)) };
}

try {
  /* ---- 1. the build signs every PE file ----------------------------------------------------------------------- */
  let real = null;
  if (!EB) {
    if (ebMissing) check(false, '1a-1e electron-builder\'s own code could not be read: ' + ebMissing);
    else skip('1a-1e need app-builder-lib in node_modules to ask electron-builder itself', 5);
  } else if (!fs.existsSync(DIST)) skip('1a-1e need Electron\'s dist in node_modules to lay the app out as it ships', 5);
  else {
    real = await build('real', BUILDER_TEXT);
    const isMs = f => MICROSOFT.includes(path.basename(f));
    const unsigned = real.pe.filter(f => !isMs(f) && !real.signed.includes(f)), msHanded = real.signed.filter(isMs);
    const top = real.pe.filter(f => /^[^/]+\.dll$/i.test(f));
    const native = RUNTIME.native.win32.map(f => 'resources/embed/runtime/node_modules/' + f.name);
    check(!unsigned.length && !msHanded.length && real.signed.every(f => real.pe.includes(f)) && top.some(f => !isMs(f)) && top.some(isMs)
      && real.pe.includes('resources/caret.exe') && native.every(f => real.pe.includes(f)) && real.pe.includes('Etiuda.exe')
      && real.reads === real.pe.length && ESCAPES.length === 0,
      '1a electron-builder, given the real electron-builder.js and a certificate, hands its signer ' + real.signed.length + ' of the ' + real.pe.length
      + ' PE files the gate\'s walk finds, each read once at the door (' + real.reads + '), ' + real.pe.filter(isMs).length
      + ' of them signed by their maker and to be kept from it, nothing escaping the seal (' + ESCAPES.length + '): signed ' + real.signed.join(', ')
      + (unsigned.length ? '; NOT HANDED: ' + unsigned.join(', ') : '') + (msHanded.length ? '; MICROSOFT\'S HANDED: ' + msHanded.join(', ') : ''));
    const bare = await build('no-cert', BUILDER_TEXT, { cert: false });
    check(bare.reads === 0 && J(bare.signed) === J(bare.pe) && ESCAPES.length === 0,
      '1b with no certificate configured the door asks Windows nothing (' + bare.reads + ' reading(s)) and passes every file on, as before: '
      + bare.signed.length + ' of ' + bare.pe.length);

    if (!PLANTS) skip('1c to 1e, plant:sign-exts, plant:sign-caret and plant:sign-keep lifted (ETIUDA_PLANTS=off)', 3);
    else {
      const noExts = lift('sign-exts', ''), fileCaret = lift('sign-caret', '    { from: CARET, to: "caret.exe" },');
      const a = noExts && await build('no-exts', noExts), b = fileCaret && await build('file-caret', fileCaret);
      const lost = r => r ? r.pe.filter(f => !isMs(f) && !r.signed.includes(f)) : null;
      const la = lost(a), lb = lost(b);
      check(!!la && la.length > 0 && la.every(f => /\.(dll|node)$/i.test(f)) && top.filter(f => !isMs(f)).every(f => la.includes(f))
        && ESCAPES.length === 0,
        '1c with plant:sign-exts lifted, the unsigned DLLs go unsigned, the programs still signed: ' + J(la));
      check(!!lb && J(lb) === J(['resources/caret.exe']) && fs.existsSync(path.join(b.app, 'resources', 'caret.exe')) && ESCAPES.length === 0,
        '1d with plant:sign-caret lifted to the lone file it was, caret.exe is still copied to resources/ and goes unsigned, electron-builder'
        + ' signing only what it copies from a folder: ' + J(lb));
      const keepText = fs.readFileSync(path.join(ROOT, 'tools', 'sellable.mjs'), 'utf8');
      const keepLift = keepText.split('\n').map(l => l.includes('plant:sign-keep') ? '      if (false) { /* plant:sign-keep */' : l).join('\n');
      for (const f of ['test-service.cjs', 'esigner.cjs']) fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(TMP, f));
      fs.writeFileSync(path.join(TMP, 'sellable-sign-keep.mjs'), keepLift);
      const pKeep = await import(pathToFileURL(path.join(TMP, 'sellable-sign-keep.mjs')).href);
      pKeep.signIo.read = atSignTime; pKeep.signIo.log = () => {};
      const k = await build('keep-lifted', BUILDER_TEXT, { door: stub => pKeep.keepMakersSignatures(stub) });
      check(keepLift !== keepText && k.signed.filter(isMs).length === k.pe.filter(isMs).length && k.pe.filter(isMs).length > 0,
        '1e with plant:sign-keep lifted, every DLL Microsoft signed goes to the signer: ' + J(k.signed.filter(isMs)));
    }
  }

  /* ---- 2. the gate reads every one back ---------------------------------------------------------------------- */
  /* The app above where it was built, else a smaller one of the same shape; then an installer beside it. */
  const app = real ? real.app : path.join(TMP, 'small', 'win-unpacked');
  if (!real) {
    for (const f of ['Etiuda.exe', 'ffmpeg.dll', 'resources/caret.exe', 'resources/embed/runtime/node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node'])
      put(path.join(app, f), PE());
    put(path.join(app, 'resources', 'app.asar'), 'an archive, not code');
  }
  const setup = put(path.join(path.dirname(app), 'etiuda-9.9.9-setup.exe'), PE());
  const program = path.join(app, 'Etiuda.exe');
  put(path.join(app, 'resources', 'helper.bin'), PE());
  put(path.join(app, 'resources', 'notes.txt'), 'MZ is how this note begins, and it is not code');
  const CERT = { signtoolOptions: { certificateFile: 'C:/nowhere/etiuda.pfx' } };
  /* A reader that answers each file as `say` says, by its path inside the app, and records what it was asked. */
  const reader = (say, asked) => files => { asked.push(...files); return files.map(f => ({ file: f, subject: 'CN=Example Publisher', ...(say(rel(app, f)) || { status: 'Valid', timestamped: true }) })); };
  const run = (mod, opts) => { const asked = [], log = [];
    const v = mod.signatureVerdict({ setup, program, app, customer: true, win: {}, log: s => log.push(s), ...opts, read: reader(opts.say || (() => null), asked) });
    return { v, asked: asked.map(f => path.isAbsolute(f) && !rel(app, f).startsWith('..') ? rel(app, f) : path.basename(f)), log }; };
  const SELL = { signatureVerdict };
  const walk = peFiles(app).map(f => rel(app, f));
  const dll = walk.find(f => /^[^/]+\.dll$/i.test(f)) || 'ffmpeg.dll';
  const nested = walk.find(f => /\.node$/i.test(f));

  const red = run(SELL, { say: f => f === dll ? { status: 'NotSigned', timestamped: false } : null });
  check(typeof red.v === 'string' && red.v === dll + ' reads Authenticode NotSigned, not Valid',
    '2a a customer build with one unsigned DLL among signed files is stopped naming it: ' + red.v);
  const deep = run(SELL, { say: f => f === nested ? { status: 'Valid', timestamped: false } : null });
  check(!!nested && typeof deep.v === 'string' && deep.v === nested + ' is signed with no timestamp, so its signature dies with the certificate',
    '2b a nested library, signed with no timestamp, is named by its path inside the app: ' + deep.v);
  const green = run(SELL, {});
  const wantAsked = ['etiuda-9.9.9-setup.exe'].concat(walk.filter(f => f !== 'Etiuda.exe'), ['Etiuda.exe']).sort();
  check(green.v === true && J(green.asked.slice().sort()) === J(wantAsked) && walk.includes('resources/helper.bin') && !walk.includes('resources/notes.txt')
    && !walk.includes('resources/app.asar'),
    '2c with every file Valid and timestamped it passes, having asked of the installer and the app\'s ' + walk.length + ' PE files and nothing'
    + ' else (a PE named helper.bin read, a note opening MZ and the archive not): ' + green.asked.length + ' asked');
  const preview = run(SELL, { customer: false, say: () => ({ status: 'NotSigned', timestamped: false }) });
  check(preview.v === true && preview.log.filter(s => /Authenticode: NotSigned/.test(s)).length === wantAsked.length
    && preview.log.some(s => /not required: a preview with no certificate/.test(s)),
    '2d a preview with no certificate, every file unsigned, passes and is told what Windows says of each of the '
    + preview.log.filter(s => /Authenticode: NotSigned/.test(s)).length);
  const withCert = run(SELL, { customer: false, win: CERT, say: f => f === dll ? { status: 'NotSigned', timestamped: false } : null });
  check(typeof withCert.v === 'string' && withCert.v.startsWith(dll + ' reads Authenticode NotSigned'),
    '2e a preview WITH a certificate configured and one DLL unsigned is stopped as a customer build is: ' + withCert.v);
  const lostOne = signatureVerdict({ setup, program, app, customer: true, win: {}, log: () => {},
    read: files => reader(() => null, [])(files.filter(f => !f.endsWith(dll))) });
  check(lostOne === dll + ' was not read, so its signature is not known',
    '2f a file the reader gave no answer for is refused, not passed: ' + lostOne);
  const gone = signatureVerdict({ setup, program, app: path.join(TMP, 'no-such'), customer: false, win: {}, read: () => [], log: () => {} });
  check(typeof gone === 'string' && /no-such is not there/.test(gone), '2g an app folder that is not there is a stop, not a pass: ' + gone);
  const VENDOR = 'CN=Example Vendor, O=Example Vendor Ltd, C=GB';
  const ms = run(SELL, { say: f => f === dll ? { status: 'Valid', timestamped: true, subject: MS_SUBJECT } : null });
  const stranger = run(SELL, { say: f => f === dll ? { status: 'Valid', timestamped: true, subject: VENDOR } : null });
  check(ms.v === true && MAKERS.some(m => m.organisation === 'Microsoft Corporation')
    && stranger.v === dll + ' is signed by Example Vendor Ltd, neither our publisher nor a maker on the list (Microsoft)',
    '2i a DLL Microsoft signed passes beside our files, and one Valid under a publisher not on the makers\' list is stopped naming it: ' + stranger.v);

  /* 2h, THE PLANTS: tools/sellable.mjs copied with each plant line put in another form and imported beside the two
     modules it requires; each lets through the fault its leg above refuses. */
  if (!PLANTS) skip('2h, plant:sign-walk, plant:sign-unread, plant:sign-header, plant:sign-unsigned and plant:sign-publisher lifted (ETIUDA_PLANTS=off)', 1);
  else {
    const sellText = fs.readFileSync(path.join(ROOT, 'tools', 'sellable.mjs'), 'utf8');
    for (const f of ['test-service.cjs', 'esigner.cjs']) fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(TMP, f));
    const planted = async (marker, line) => {
      const t = sellText.split('\n').map(l => l.includes('plant:' + marker) ? line + ' /* plant:' + marker + ' */' : l).join('\n');
      if (t === sellText) return null;
      const at = path.join(TMP, 'sellable-' + marker + '.mjs');
      fs.writeFileSync(at, t);
      return import(pathToFileURL(at).href);
    };
    const pWalk = await planted('sign-walk', '  void 0;');
    const pUnread = await planted('sign-unread', '  const unread = [];');
    const pHeader = await planted('sign-header', '    return false;');
    const wRed = pWalk && run(pWalk, { say: f => f === dll ? { status: 'NotSigned', timestamped: false } : null });
    const uRed = pUnread && pUnread.signatureVerdict({ setup, program, app, customer: true, win: {}, log: () => {},
      read: files => reader(() => null, [])(files.filter(f => !f.endsWith(dll))) });
    const hAsked = pHeader && run(pHeader, {}).asked;
    const pUnsigned = await planted('sign-unsigned', "    if (r.status !== 'Valid') continue;");
    const pPublisher = await planted('sign-publisher', '  const foreign = []; void own;');
    const sRed = pUnsigned && run(pUnsigned, { say: f => f === dll ? { status: 'NotSigned', timestamped: false } : null });
    const vRed = pPublisher && run(pPublisher, { say: f => f === dll ? { status: 'Valid', timestamped: true, subject: 'CN=Example Vendor, O=Example Vendor Ltd' } : null });
    check(!!wRed && wRed.v === true && !!pUnread && uRed === true && !!hAsked && !hAsked.includes('resources/helper.bin') && hAsked.includes(nested)
      && !!sRed && sRed.v === true && !!vRed && vRed.v === true,
      '2h with plant:sign-walk lifted the unsigned DLL passes (' + (wRed && wRed.v) + '), with plant:sign-unread lifted the unanswered file passes ('
      + uRed + '), with plant:sign-header lifted a PE under another name is not read, with plant:sign-unsigned lifted an unsigned DLL passes ('
      + (sRed && sRed.v) + '), and with plant:sign-publisher lifted a stranger\'s DLL passes (' + (vRed && vRed.v) + ')');
  }

  /* ---- 3. the release asks the gate of the unpacked app --------------------------------------------------------- */
  const relText = fs.readFileSync(path.join(ROOT, 'tools', 'release.mjs'), 'utf8');
  check(/signatureVerdict\(\{ setup: join\(DIST, [^\n]+\r?\n\s+program: join\(DIST, 'win-unpacked', 'Etiuda\.exe'\), app: join\(DIST, 'win-unpacked'\),/.test(relText),
    '3a tools/release.mjs gives the signature gate the unpacked app, win-unpacked, beside the installer and the program');
} catch (e) {
  failed++;
  console.log('  FAIL ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* reported below */ }
  check(!fs.existsSync(TMP), '4a the temp folder is gone');
}

console.log('#counts checks=' + asserted + ' failed=' + failed + ' notRun=' + notRun.length + ' expected=' + EXPECTED);
if (asserted + notRun.length < EXPECTED) {
  console.log('SUITE DID NOT COMPLETE: ' + asserted + ' of ' + EXPECTED + ' checks ran');
  process.exit(78);
}
console.log(failed ? '  RESULT: FAIL ' + failed + ' of ' + asserted : '  RESULT: ok ' + asserted + ' check(s)');
process.exit(Math.min(failed, 63));
