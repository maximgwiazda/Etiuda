/* npm run package:linux: build the engine, then the Ubuntu desk's .deb and AppImage, and refuse to
 * exit 0 unless both are fresh in ETIUDA_DIST (or dist/), the program beside them carries its fuses
 * as electron-builder.js asks, and the .deb carries what a Linux desk needs from it.
 *
 *   node tools/package-linux.mjs
 *   ETIUDA_DIST=<folder>  where the packages go; dist/ when unset
 *
 * The Windows installer is tools/package.mjs and is untouched by this file. tests/linux-package.mjs
 * drives debTreeProblems on planted trees.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fuseProblems, wantedFuses } from './fuses.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** What the .deb is checked against, read from electron-builder.js rather than restated. */
export function linuxAsk(cfg) {
  const c = cfg || require('../electron-builder.js');
  const linux = c.linux || {};
  return { product: c.productName, exe: linux.executableName,
    types: (linux.fileAssociations || []).filter(a => a.mimeType).map(a => ({ ext: a.ext, mime: a.mimeType })) };
}

/** One line per thing the unpacked .deb at `tree` lacks; [] when it has them all. A tree that is not
 *  there, or an ask naming no program or no type, is refused rather than passed. */
export function debTreeProblems(tree, ask) {
  const a = ask || linuxAsk();
  if (!a.product || !a.exe || !a.types.length) return ['electron-builder.js names no Linux program or no MIME type to check the .deb against'];
  if (!tree || !existsSync(tree)) return [String(tree) + ' is not there, so nothing in the .deb was read'];
  const read = rel => { try { return readFileSync(join(tree, rel), 'utf8'); } catch { return null; } };
  const opt = 'opt/' + a.product + '/', program = '/' + opt + a.exe;
  const out = [];
  /* Ubuntu 24.04 refuses an unprivileged user namespace to a program no profile allows it to, and
     Chromium's sandbox is one; electron-builder's after-install loads this profile where AppArmor runs. */
  const profile = read(opt + 'resources/apparmor-profile');
  if (profile === null) out.push(opt + 'resources/apparmor-profile is missing');
  else {
    if (!/^\s*userns,\s*$/m.test(profile)) out.push('the AppArmor profile does not allow userns');
    if (profile.indexOf('"' + program + '"') < 0) out.push('the AppArmor profile does not attach to ' + program);
  }
  if (!existsSync(join(tree, opt, 'chrome-sandbox'))) out.push(opt + 'chrome-sandbox is missing, which is the sandbox where no user namespace is allowed');
  const desktop = read('usr/share/applications/' + a.exe + '.desktop');
  if (desktop === null) out.push('usr/share/applications/' + a.exe + '.desktop is missing');
  else {
    const types = ((/^MimeType=(.*)$/m.exec(desktop) || [])[1] || '').split(';');
    for (const t of a.types) if (types.indexOf(t.mime) < 0) out.push('the .desktop entry does not name ' + t.mime);
    const exec = (/^Exec=(.*)$/m.exec(desktop) || [])[1] || '';
    if (exec.indexOf(program) < 0) out.push('the .desktop entry does not start ' + program);
    if (!/(^|\s)%[fFuU](\s|$)/.test(exec)) out.push('the .desktop entry passes no file to the program, so a double-clicked catalog opens nothing');
  }
  const mime = read('usr/share/mime/packages/' + a.exe + '.xml');
  if (mime === null) out.push('usr/share/mime/packages/' + a.exe + '.xml is missing');
  else for (const t of a.types) {
    const at = mime.indexOf('<mime-type type="' + t.mime + '">'), end = mime.indexOf('</mime-type>', at);
    if (at < 0 || end < 0) out.push('the MIME file does not declare ' + t.mime);
    else if (mime.slice(at, end).indexOf('<glob pattern="*.' + t.ext + '"/>') < 0) out.push(t.mime + ' is not given to *.' + t.ext);
  }
  /* No updater, as on Windows. */
  if (existsSync(join(tree, opt, 'resources', 'app-update.yml'))) out.push(opt + 'resources/app-update.yml is there, for an updater this product does not have');
  return out;
}

function packages(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => /\.(deb|AppImage)$/.test(f)).map(name => {
    const s = statSync(join(dir, name));
    return name + '\t' + s.mtimeMs + '\t' + s.size;
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const DIST = resolve(ROOT, process.env.ETIUDA_DIST || 'dist');
  const before = new Set(packages(DIST));
  const step = (what, args) => {
    const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) { console.error('npm run package:linux: ' + what + ' exited ' + r.status); process.exit(r.status == null ? 1 : r.status); }
  };
  step('the build', [join(ROOT, 'tools', 'build.mjs')]);
  step('electron-builder', [join(ROOT, 'node_modules', 'electron-builder', 'cli.js'), '--linux']);
  const fresh = packages(DIST).filter(row => !before.has(row)).map(row => row.split('\t')[0]);
  const bad = [];
  for (const ext of ['deb', 'AppImage'])
    if (!fresh.some(n => n.endsWith('.' + ext))) bad.push('no fresh .' + ext + ' in ' + DIST);
  const ask = linuxAsk();
  const exe = join(DIST, 'linux-unpacked', ask.exe);
  if (!existsSync(exe)) bad.push(exe + ' is not there, so no fuse was read from it');
  else for (const line of await fuseProblems(exe, wantedFuses())) bad.push('fuse: ' + line);
  const deb = fresh.find(n => n.endsWith('.deb'));
  if (deb) {
    const tree = mkdtempSync(join(tmpdir(), 'etiuda-deb-'));
    try {
      const x = spawnSync('dpkg-deb', ['-x', join(DIST, deb), tree], { encoding: 'utf8' });
      if (x.status !== 0) bad.push('dpkg-deb could not unpack ' + deb + ': ' + String(x.stderr || x.error || '').trim());
      else for (const line of debTreeProblems(tree, ask)) bad.push(deb + ': ' + line);
    } finally { rmSync(tree, { recursive: true, force: true }); }
  }
  if (bad.length) {
    console.error('npm run package:linux: refused:');
    for (const line of bad) console.error('  ' + line);
    process.exit(1);
  }
  console.log('npm run package:linux: ' + fresh.join(', ') + ' in ' + DIST + '; ' + Object.keys(wantedFuses()).length
    + ' fuse(s) read back from ' + exe + ' as asked; the .deb carries its AppArmor profile, its .desktop entry and its MIME type');
}
