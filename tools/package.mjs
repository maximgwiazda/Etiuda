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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, process.env.ETIUDA_DIST || 'dist');

function installers(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => /-setup\.exe$/i.test(f)).map(name => {
    const s = statSync(join(dir, name));
    return name + '\t' + s.mtimeMs + '\t' + s.size;
  });
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
}
process.exit(r.status == null ? 1 : r.status);
