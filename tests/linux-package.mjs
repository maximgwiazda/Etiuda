/* THE UBUNTU DESK'S PACKAGES, as far as node can see them: electron-builder.js's Linux block, the icons
 * it copies out of the .ico, and tools/package-linux.mjs judging an unpacked .deb.
 *
 *   node tests/linux-package.mjs       exit code is the number of failed checks, capped at 63
 *
 * Nothing here packages anything or opens a window; tests/linux-desk.js launches what was built.
 * What each leg holds:
 *   1  the Linux block asks a .deb and an AppImage for x64, and the Windows target, its icon and the shared association are as they were
 *   2  before packing for Linux every entry of shell/etiuda.ico is written out byte for byte under its
 *      size, and before packing for Windows nothing is written
 *   3  a planted tree carrying everything passes, and each thing taken out of it alone is named: the
 *      profile's userns, the profile's program, chrome-sandbox, the MIME type on the .desktop entry,
 *      the file it is handed, the glob, and an updater's file put in; no tree and an empty ask refuse;
 *      a dictionary missing, a dictionary with other bytes and the notice missing (planted bytes, hashed here)
 *   5  the spelling dictionaries: the Linux block copies them into resources/dictionaries and Windows has no such
 *      step; the .deb is held to the five pinned files of tools/dictionaries.mjs and the tree's notice; the fetch
 *      keeps a whole file, writes only bytes of the pinned hash, falls to the second source, and refuses
 *      without writing when no source has them (a planted getter, so nothing reaches the network)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { debTreeProblems, linuxAsk } from '../tools/package-linux.mjs';
import { FILES, NOTICE_FILE, SOURCE, fetchDictionaries, sourcesOf } from '../tools/dictionaries.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 24;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log('  ok   ' + line);
  else { failed++; console.log('  FAIL ' + line); }
}
const J = JSON.stringify;
const LAB = fs.mkdtempSync(path.join(os.tmpdir(), 'etiuda-linux-package-'));

try {
  /* ---- 1. the asks ---- */
  const cfg = require('../electron-builder.js');
  check(J(cfg.linux.target) === J([{ target: 'deb', arch: ['x64'] }, { target: 'AppImage', arch: ['x64'] }])
      && cfg.linux.executableName === 'etiuda' && cfg.linux.publish === null,
    '1a the Linux block asks a .deb and an AppImage for x64, the program etiuda and no updater: ' + J(cfg.linux.target));
  check(J(cfg.win.target) === J([{ target: 'nsis', arch: ['x64'] }]) && cfg.win.icon === 'shell/etiuda.ico'
      && J(cfg.fileAssociations) === J([{ ext: 'ec', name: 'Etiuda catalog', description: 'Etiuda catalog', icon: 'shell/etiuda.ico', role: 'Editor' }]),
    '1b the Windows target, its icon and the association it registers are as they were, with no MIME type in it');

  /* ---- 2. the icons, from a fresh read of the config with its output in the lab ---- */
  const was = process.env.ETIUDA_DIST;
  process.env.ETIUDA_DIST = path.join(LAB, 'dist');
  delete require.cache[require.resolve('../electron-builder.js')];
  const fresh = require('../electron-builder.js');
  if (was === undefined) delete process.env.ETIUDA_DIST; else process.env.ETIUDA_DIST = was;
  const iconDir = fresh.linux.icon;
  fresh.beforePack({ electronPlatformName: 'win32' });
  check(!fs.existsSync(iconDir), '2a before packing for Windows nothing is written: ' + fs.existsSync(iconDir));
  fresh.beforePack({ electronPlatformName: 'linux' });
  const ico = fs.readFileSync(path.join(ROOT, 'shell', 'etiuda.ico'));
  const entries = [];
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const at = 6 + 16 * i;
    entries.push({ size: ico[at] || 256, bytes: ico.subarray(ico.readUInt32LE(at + 12), ico.readUInt32LE(at + 12) + ico.readUInt32LE(at + 8)) });
  }
  const written = fs.existsSync(iconDir) ? fs.readdirSync(iconDir).sort() : [];
  const same = entries.every(e => { try { return fs.readFileSync(path.join(iconDir, e.size + 'x' + e.size + '.png')).equals(e.bytes); } catch { return false; } });
  check(entries.length > 0 && written.length === entries.length && same,
    '2b before packing for Linux each of the ' + entries.length + ' entries of etiuda.ico is written out byte for byte under its size: ' + J(written));

  /* ---- 3. the unpacked .deb ---- */
  const real = linuxAsk();
  check(real.product === 'Etiuda' && real.exe === 'etiuda' && J(real.types) === J([{ ext: 'ec', mime: 'application/x-etiuda-catalog' }]),
    '3a what the .deb is held to is read from electron-builder.js: ' + J({ product: real.product, exe: real.exe, types: real.types }));
  /* The planted trees carry invented dictionary bytes, and the ask they are held to carries those bytes' hashes. */
  const sha = b => createHash('sha256').update(b).digest('hex');
  const SYN = [{ name: 'xx-XX-1-0.bdic', text: 'planted dictionary' }, { name: 'README_xx.txt', text: 'planted notice' }]
    .map(f => ({ name: f.name, size: f.text.length, sha256: sha(Buffer.from(f.text)), text: f.text }));
  const ask = Object.assign({}, real, { dictionaries: SYN, notice: Buffer.from('planted NOTICE') });
  const opt = 'opt/' + ask.product + '/';
  const GOOD = {
    [opt + 'resources/apparmor-profile']: 'abi <abi/4.0>,\ninclude <tunables/global>\n\nprofile "etiuda" "/opt/Etiuda/etiuda" flags=(unconfined) {\n  userns,\n}\n',
    [opt + 'chrome-sandbox']: '',
    'usr/share/applications/etiuda.desktop': '[Desktop Entry]\nName=Etiuda\nExec=/opt/Etiuda/etiuda %U\nType=Application\nMimeType=application/x-etiuda-catalog;\n',
    'usr/share/mime/packages/etiuda.xml': '<?xml version="1.0" encoding="utf-8"?>\n<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">\n'
      + '<mime-type type="application/x-etiuda-catalog">\n  <glob pattern="*.ec"/>\n</mime-type>\n</mime-info>',
    [opt + 'resources/dictionaries/xx-XX-1-0.bdic']: 'planted dictionary',
    [opt + 'resources/dictionaries/README_xx.txt']: 'planted notice',
    [opt + 'resources/dictionaries/NOTICE.txt']: 'planted NOTICE',
  };
  let n = 0;
  const plant = (change) => {
    const dir = path.join(LAB, 'tree' + (++n));
    const files = Object.assign({}, GOOD, change || {});
    for (const [rel, text] of Object.entries(files)) {
      if (text === null) continue;
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
    return debTreeProblems(dir, ask);
  };
  const good = plant();
  check(good.length === 0, '3b THE CONTROL: a tree carrying everything passes: ' + J(good));
  const named = (change, want) => { const p = plant(change); return { ok: p.length === 1 && p[0].indexOf(want) > -1, p }; };
  const prof = GOOD[opt + 'resources/apparmor-profile'];
  const desk = GOOD['usr/share/applications/etiuda.desktop'];
  const MUTANTS = [
    ['3c', 'a profile without userns', { [opt + 'resources/apparmor-profile']: prof.replace('  userns,\n', '') }, 'does not allow userns'],
    ['3d', 'a profile for another program', { [opt + 'resources/apparmor-profile']: prof.replace('/opt/Etiuda/etiuda', '/opt/Other/other') }, 'does not attach'],
    ['3e', 'no chrome-sandbox', { [opt + 'chrome-sandbox']: null }, 'chrome-sandbox is missing'],
    ['3f', 'a .desktop entry with no MIME type', { 'usr/share/applications/etiuda.desktop': desk.replace(/^MimeType=.*\n/m, '') }, 'does not name application/x-etiuda-catalog'],
    ['3g', 'a .desktop entry handing the program no file', { 'usr/share/applications/etiuda.desktop': desk.replace(' %U', '') }, 'passes no file'],
    ['3h', 'a MIME type with no glob', { 'usr/share/mime/packages/etiuda.xml': GOOD['usr/share/mime/packages/etiuda.xml'].replace('  <glob pattern="*.ec"/>\n', '') }, 'is not given to *.ec'],
    ['3i', "an updater's file", { [opt + 'resources/app-update.yml']: 'provider: generic\n' }, 'app-update.yml is there'],
    ['3k', 'a dictionary missing', { [opt + 'resources/dictionaries/xx-XX-1-0.bdic']: null }, 'resources/dictionaries: xx-XX-1-0.bdic is missing'],
    ['3l', 'a dictionary with other bytes', { [opt + 'resources/dictionaries/xx-XX-1-0.bdic']: 'planted dictionarY' }, 'xx-XX-1-0.bdic is not the pinned file'],
    ['3m', 'the notice missing', { [opt + 'resources/dictionaries/NOTICE.txt']: null }, 'NOTICE.txt is missing'],
  ];
  for (const [id, what, change, want] of MUTANTS) {
    const r = named(change, want);
    check(r.ok, id + ' ' + what + ' is named, and nothing else: ' + J(r.p));
  }
  const none = debTreeProblems(path.join(LAB, 'nowhere'), ask), empty = debTreeProblems(path.join(LAB, 'tree1'), { product: 'Etiuda', exe: 'etiuda', types: [] });
  check(none.length === 1 && /is not there/.test(none[0]) && empty.length === 1 && /no Linux program or no MIME type/.test(empty[0]),
    '3j no tree, and an ask naming no MIME type, are refused rather than passed: ' + J(none.concat(empty)));

  /* ---- 5. the spelling dictionaries ---- */
  const DIST = path.join(LAB, 'dist');
  check(J(fresh.linux.extraResources) === J([{ from: path.join(DIST, '.dictionaries'), to: 'dictionaries' }])
      && cfg.extraResources === undefined && cfg.win.extraResources === undefined && cfg.nsis.extraResources === undefined,
    '5a the Linux block copies the output folder\'s .dictionaries into resources/dictionaries, and nothing above it or in the'
    + ' Windows blocks copies a resource: ' + J(fresh.linux.extraResources));
  const shellFiles = (/files: (\[[^\]]*\])/.exec(fs.readFileSync(path.join(ROOT, 'shell', 'main.js'), 'utf8')) || [])[1] || '';
  check(real.dictionaries === FILES && J(FILES.map(f => f.name)) === J(['en-US-10-1.bdic', 'pl-PL-3-0.bdic', 'README_en_US.txt', 'README_pl_PL.txt', 'COPYING.MPL'])
      && shellFiles === '["en-US-10-1.bdic", "pl-PL-3-0.bdic"]'
      && FILES.every(f => /^[0-9a-f]{64}$/.test(f.sha256)) && real.notice.equals(fs.readFileSync(NOTICE_FILE))
      && /^https:\/\/chromium\.googlesource\.com\/chromium\/deps\/hunspell_dictionaries\/\+\/[0-9a-f]{40}\/$/.test(SOURCE),
    '5b the .deb is held to the five pinned files of tools/dictionaries.mjs, the two dictionaries in Chromium\'s casing and the'
    + ' two shell/main.js copies, and to'
    + ' shell/dictionaries-notice.txt: ' + J(FILES.map(f => f.name + ' ' + f.sha256.slice(0, 12))));
  const served = {};
  for (const f of SYN) served[sourcesOf(f.name)[0].url] = Buffer.from(Buffer.from(f.text).toString('base64'));
  const asked = [];
  const get = async u => { asked.push(u); if (served[u]) return served[u]; throw new Error(u + ' answered 404'); };
  const into = path.join(LAB, 'fetched');
  const first = await fetchDictionaries(into, { files: SYN, get, notice: 'planted NOTICE' });
  const whole = SYN.every(f => fs.readFileSync(path.join(into, f.name), 'utf8') === f.text) && fs.readFileSync(path.join(into, 'NOTICE.txt'), 'utf8') === 'planted NOTICE';
  check(J(first.fetched) === J(SYN.map(f => f.name)) && whole && asked.length === 2,
    '5c the fetch decodes what the commit\'s address sends and writes each file whose bytes are the pinned hash, and the notice: ' + J(first));
  asked.length = 0;
  const second = await fetchDictionaries(into, { files: SYN, get, notice: 'planted NOTICE' });
  check(J(second.kept) === J(SYN.map(f => f.name)) && asked.length === 0,
    '5d a folder already holding the pinned bytes is kept and nothing is asked: ' + J(second) + ', ' + asked.length + ' request(s)');
  const serverOnly = { [sourcesOf('xx-XX-1-0.bdic')[1].url]: Buffer.from('planted dictionary') };
  const viaServer = await fetchDictionaries(path.join(LAB, 'fetched2'), { files: SYN.slice(0, 1), notice: 'n',
    get: async u => { if (serverOnly[u]) return serverOnly[u]; throw new Error(u + ' answered 429'); } });
  check(J(viaServer.fetched) === J(['xx-XX-1-0.bdic']) && sourcesOf('xx-XX-1-0.bdic')[1].url === 'https://redirector.gvt1.com/edgedl/chrome/dict/xx-xx-1-0.bdic',
    '5e when the commit\'s address refuses, a dictionary is taken from Chromium\'s own server, asked for under the lowercased name: ' + J(viaServer));
  let said = '';
  const wrong = path.join(LAB, 'fetched3');
  try { await fetchDictionaries(wrong, { files: SYN, notice: 'n', get: async () => Buffer.from(Buffer.from('not the pinned bytes').toString('base64')) }); }
  catch (e) { said = String(e && e.message); }
  check(/no pinned copy of xx-XX-1-0\.bdic/.test(said) && /README_xx\.txt/.test(said) && fs.readdirSync(wrong).length === 0,
    '5f bytes of another hash from every source are refused, naming each file, and nothing is written, not even the notice: '
    + J(said.slice(0, 160)) + ', ' + fs.readdirSync(wrong).length + ' file(s) left');
} catch (e) {
  failed++;
  console.log('  FAIL ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  try { fs.rmSync(LAB, { recursive: true, force: true }); } catch { /* reported below */ }
  check(!fs.existsSync(LAB), '4a the lab is gone');
}

console.log('#counts checks=' + asserted + ' failed=' + failed + ' expected=' + EXPECTED);
if (asserted < EXPECTED) {
  console.log('SUITE DID NOT COMPLETE: ' + asserted + ' of ' + EXPECTED + ' checks ran');
  process.exit(78);
}
console.log(failed ? '  RESULT: FAIL ' + failed + ' of ' + asserted : '  RESULT: ok ' + asserted + ' check(s)');
process.exit(Math.min(failed, 63));
