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
 *      the file it is handed, the glob, and an updater's file put in; no tree and an empty ask refuse
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { debTreeProblems, linuxAsk } from '../tools/package-linux.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 15;

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
  const ask = linuxAsk();
  check(ask.product === 'Etiuda' && ask.exe === 'etiuda' && J(ask.types) === J([{ ext: 'ec', mime: 'application/x-etiuda-catalog' }]),
    '3a what the .deb is held to is read from electron-builder.js: ' + J(ask));
  const opt = 'opt/' + ask.product + '/';
  const GOOD = {
    [opt + 'resources/apparmor-profile']: 'abi <abi/4.0>,\ninclude <tunables/global>\n\nprofile "etiuda" "/opt/Etiuda/etiuda" flags=(unconfined) {\n  userns,\n}\n',
    [opt + 'chrome-sandbox']: '',
    'usr/share/applications/etiuda.desktop': '[Desktop Entry]\nName=Etiuda\nExec=/opt/Etiuda/etiuda %U\nType=Application\nMimeType=application/x-etiuda-catalog;\n',
    'usr/share/mime/packages/etiuda.xml': '<?xml version="1.0" encoding="utf-8"?>\n<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">\n'
      + '<mime-type type="application/x-etiuda-catalog">\n  <glob pattern="*.ec"/>\n</mime-type>\n</mime-info>',
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
  ];
  for (const [id, what, change, want] of MUTANTS) {
    const r = named(change, want);
    check(r.ok, id + ' ' + what + ' is named, and nothing else: ' + J(r.p));
  }
  const none = debTreeProblems(path.join(LAB, 'nowhere'), ask), empty = debTreeProblems(path.join(LAB, 'tree1'), { product: 'Etiuda', exe: 'etiuda', types: [] });
  check(none.length === 1 && /is not there/.test(none[0]) && empty.length === 1 && /no Linux program or no MIME type/.test(empty[0]),
    '3j no tree, and an ask naming no MIME type, are refused rather than passed: ' + J(none.concat(empty)));
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
