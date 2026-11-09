/* npm run package: build the engine, then the Windows installer, then refuse to
 * exit 0 unless a fresh installer is in ETIUDA_DIST (or dist/) and the program
 * beside it carries its fuses as electron-builder.js asks.
 *
 * WHY THIS IS A FILE RATHER THAN THE TWO-COMMAND SCRIPT. `npm run build &&
 * electron-builder --win`, launched detached through Win32_Process.Create (a
 * .cmd or powershell -File), runs only the build and exits 0. The check has to
 * live in the same process npm started, or it is skipped the same way. Board 416.
 *
 *   node tools/package.mjs
 *   ETIUDA_DIST=<folder>  where the installer goes; dist/ when unset
 *
 * The two commands below are the old script, spawned as one cmd.exe chain so a
 * run in this seat's own shell is unchanged. The listing is taken before they
 * run, so an installer already in the folder from an earlier run is not a pass.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packagedFuseProblems, wantedFuses } from './fuses.mjs';
import { prepareEmbed } from './model.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, process.env.ETIUDA_DIST || 'dist');

/* Pack the turning frames into solid 7z and generate turning.nsh at build time */
const turningTool = join(ROOT, 'tools', 'turning.mjs');
if (existsSync(turningTool)) {
  const { prepareTurning } = await import('./turning.mjs');
  await prepareTurning(ROOT, 'shell');
}

function installers(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => /-setup\.exe$/i.test(f)).map(name => {
    const s = statSync(join(dir, name));
    return name + '\t' + s.mtimeMs + '\t' + s.size;
  });
}

/* The built-in model, copied and checked before the installer is built. A missing model
   leaves the folder empty and the desk on words. A mismatched file stops the pack. */
try {
  await prepareEmbed({ dest: join(DIST, '.embed') });
} catch (e) {
  console.error('npm run package: the built-in model: ' + ((e && e.message) || e));
  process.exit(1);
}

const before = new Set(installers(DIST));
// cmd looks in its working directory before PATH unless NoDefaultCurrentDirectoryInExePath is set, and this tree's
// root holds electron-builder.js: with .JS in PATHEXT, a shell that leaves the variable unset (a Grok seat's, a
// WMI-started one) runs the config file instead of the tool, and the desk shows "Select an app to open this .js file"
// (Maxim's screen, 2026-10-09 22:35; the test architect's diagnosis the same afternoon). Set it for the chain.
const env = { ...process.env, NoDefaultCurrentDirectoryInExePath: '1', PATH: join(ROOT, 'node_modules', '.bin') + delimiter + (process.env.PATH || '') };
const r = spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm run build && electron-builder --win'], {
  cwd: ROOT,
  stdio: 'inherit',
  env,
  windowsVerbatimArguments: true,
});
const fresh = installers(DIST).filter(row => !before.has(row));
if (fresh.length === 0) {
  console.error('npm run package: no installer in ' + DIST);
  process.exit(1);
}
/* THE FUSES, read back out of the program this build wrote (tools/fuses.mjs), since
   tests/test.js can read only what electron-builder.js asks for. tests/fuses.mjs drives this
   step on planted programs. */
if (r.status === 0) {
  const bad = await packagedFuseProblems(DIST);
  if (bad.length) {
    console.error('npm run package: the fuses of the program in ' + DIST + ' are not as electron-builder.js asks:');
    for (const line of bad) console.error('  ' + line);
    process.exit(1);
  }
  console.log('npm run package: ' + Object.keys(wantedFuses()).length + ' fuse(s) read back from '
    + join(DIST, 'win-unpacked', 'Etiuda.exe') + ' as asked');
  /* THE TRAY'S PICTURE IS IN THE ASAR. The shell reads it from there at run time (shell/main.js trayIcon), so a build
     without it makes a desk with no tray, which quits on close whatever Settings say (Max's finding, 2026-11-09). */
  const asarAt = join(DIST, 'win-unpacked', 'resources', 'app.asar');
  let packed = [];
  try { packed = (await import('@electron/asar')).listPackage(asarAt).map(p => p.replace(/\\/g, '/')); } catch {}
  const trayMissing = ['/shell/etiuda.ico'].filter(p => packed.indexOf(p) < 0);
  if (trayMissing.length) {
    console.error('npm run package: ' + asarAt + ' lacks ' + trayMissing.join(', ') + ', so the desk would have no tray');
    process.exit(1);
  }
  console.log('npm run package: the tray\'s picture is in the asar');
  /* The caret helper is skipped where the C# compiler is missing, so an installer is refused without it. */
  const caret = join(DIST, 'win-unpacked', 'resources', 'caret.exe');
  if (!existsSync(caret)) {
    console.error('npm run package: ' + caret + ' is missing, so the picker would only copy');
    process.exit(1);
  }
}
process.exit(r.status == null ? 1 : r.status);
