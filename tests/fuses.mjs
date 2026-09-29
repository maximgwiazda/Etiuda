/* THE FUSES OF THE PACKAGED PROGRAM, read out of the binary: tools/fuses.mjs, and
 * tools/package.mjs refusing by it.
 *
 *   node tests/fuses.mjs               exit code is the number of failed checks, capped at 63
 *
 * tests/test.js [2f/5] holds what electron-builder.js asks for, and cannot see the program: a
 * build that lost a fuse on the way to Etiuda.exe stayed green there. Nothing here packages
 * anything. What each leg holds:
 *   1  the reader asks for the same four fuses [2f/5] holds
 *   2  CONTROL: the stock Electron binary, which ships all four the other way, reads wrong on each
 *   3  a wire lifted from that binary and flipped as electron-builder flips it reads as asked, and
 *      each fuse turned back alone is named, and only that one; a program holding a second wire is
 *      refused, whichever of the two is the wrong one
 *   4  the packaging step's question of a dist folder: a good program passes, a flipped one, a
 *      missing one, one with no wire, and an empty ask are each refused
 *   5  tools/package.mjs itself, with electron-builder stubbed to plant a program, exits 0 on a
 *      good one and 1 on a flipped or a missing one (Windows: the step runs through cmd.exe)
 *
 * The expected values below were written from the rule in tools/fuses.mjs before any run. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { wantedFuses, fuseProblems, packagedFuseProblems } from '../tools/fuses.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 14;

let asserted = 0, failed = 0;
const notRun = [];
function check(ok, line) {
  asserted++;
  if (ok) console.log('  ok   ' + line);
  else { failed++; console.log('  FAIL ' + line); }
}
function skip(why, legs) { for (let i = 0; i < legs; i++) notRun.push(why); console.log('  NOT RUN ' + why); }

const WANT = { runAsNode: false, enableNodeOptionsEnvironmentVariable: false,
               enableNodeCliInspectArguments: false, onlyLoadAppFromAsar: true };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'etiuda-fuses-'));
try {
  const want = wantedFuses();
  check(JSON.stringify(want) === JSON.stringify(WANT),
    '1a the reader asks for what electron-builder.js asks for, the four [2f/5] holds: ' + JSON.stringify(want));

  const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
  const stock = require('electron');
  let onStock;
  try { onStock = await fuseProblems(stock, want); } catch (e) { onStock = [String(e && e.message)]; }
  check(onStock.length === 4 && Object.keys(WANT).every(k => onStock.some(l => l.indexOf(k + ' is ') === 0)),
    '2a CONTROL: the stock Electron binary, which ships all four the other way, reads wrong on each: '
    + JSON.stringify(onStock));

  /* A PROGRAM IN MINIATURE: the stock binary's wire behind a few bytes, which is all the reader and
     electron-builder's flipper look for. */
  const SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX';
  const bytes = fs.readFileSync(stock), at = bytes.indexOf(SENTINEL);
  const wireLen = at < 0 ? 0 : bytes[at + SENTINEL.length + 1];
  const lifted = Buffer.concat([Buffer.from('MZ padding '), bytes.subarray(at, at + SENTINEL.length + 2 + wireLen)]);
  const byIndex = o => { const r = { version: FuseVersion.V1 };
    for (const [k, v] of Object.entries(o)) r[FuseV1Options[k.charAt(0).toUpperCase() + k.slice(1)]] = v; return r; };
  const program = async (name, flips) => {
    const f = path.join(TMP, name);
    fs.writeFileSync(f, lifted);
    for (const o of flips) await flipFuses(f, byIndex(o));
    return f;
  };
  const good = await program('good.exe', [WANT]);
  const onGood = await fuseProblems(good, want);
  check(at > 0 && wireLen >= 6 && onGood.length === 0,
    '3a the stock wire flipped as electron-builder flips it reads as asked: ' + JSON.stringify(onGood)
    + ', a wire of ' + wireLen);
  const oneEach = [];
  for (const k of Object.keys(WANT)) {
    const f = await program('one-' + k + '.exe', [WANT, { [k]: !WANT[k] }]);
    const bad = await fuseProblems(f, want);
    oneEach.push(bad.length === 1 && bad[0].indexOf(k + ' is ') === 0 ? 'named' : JSON.stringify(bad));
  }
  check(oneEach.every(x => x === 'named'),
    '3b each fuse turned back alone is named, and only that one: '
    + Object.keys(WANT).map((k, i) => k + ' ' + oneEach[i]).join(', '));

  /* Where the wire's sentinel occurs twice the reader would otherwise answer for the first. The twin is what
     electron-builder's flipper makes of two blocks (it flips the first and the last); the decoy is a good first
     wire ahead of a last one with node turned back on. */
  const twinBytes = Buffer.concat([lifted, Buffer.from('MZ second '), lifted.subarray(11)]);
  const twin = path.join(TMP, 'twin.exe');
  fs.writeFileSync(twin, twinBytes);
  await flipFuses(twin, byIndex(WANT));
  const decoy = path.join(TMP, 'decoy.exe');
  const decoyBytes = fs.readFileSync(twin);
  decoyBytes[decoyBytes.lastIndexOf(SENTINEL) + SENTINEL.length + 2 + FuseV1Options.RunAsNode] = 49;
  fs.writeFileSync(decoy, decoyBytes);
  const onTwin = await fuseProblems(twin, want), onDecoy = await fuseProblems(decoy, want);
  check(onTwin.length === 1 && onDecoy.length === 1 && /2 fuse blocks/.test(onTwin[0]) && /2 fuse blocks/.test(onDecoy[0]),
    '3c a program holding two fuse blocks is refused, the two good and the second one wrong alike: '
    + JSON.stringify(onTwin) + ' ' + JSON.stringify(onDecoy));

  /* ---- 4. the packaging step's question, of dist folders planted the way electron-builder lays one out */
  const dist = async (name, file) => {
    const d = path.join(TMP, name);
    fs.mkdirSync(path.join(d, 'win-unpacked'), { recursive: true });
    if (file) fs.copyFileSync(file, path.join(d, 'win-unpacked', 'Etiuda.exe'));
    return d;
  };
  const flipped = await program('flipped.exe', [WANT, { runAsNode: true }]);
  const plain = path.join(TMP, 'plain.exe');
  fs.writeFileSync(plain, 'MZ nothing that carries a fuse wire');
  const pGood = await packagedFuseProblems(await dist('d-good', good));
  const pFlipped = await packagedFuseProblems(await dist('d-flipped', flipped));
  const pMissing = await packagedFuseProblems(await dist('d-missing', null));
  const pPlain = await packagedFuseProblems(await dist('d-plain', plain));
  check(pGood.length === 0, '4a a dist whose program carries the four as asked passes: ' + JSON.stringify(pGood));
  check(pFlipped.length === 1 && /^runAsNode is on /.test(pFlipped[0]),
    '4b one whose program has node turned back on is refused, naming it: ' + JSON.stringify(pFlipped));
  check(pMissing.length === 1 && /is not there/.test(pMissing[0]),
    '4c one with no program at all is refused, not passed: ' + JSON.stringify(pMissing));
  check(pPlain.length === 1 && /sentinel/i.test(pPlain[0]),
    '4d one whose program carries no fuse wire is refused: ' + JSON.stringify(pPlain));
  const pEmpty = await packagedFuseProblems(await dist('d-empty', flipped), {});
  check(pEmpty.length === 1 && /asks for no fuse/.test(pEmpty[0]),
    '4e an ask of no fuses refuses rather than passing every program: ' + JSON.stringify(pEmpty));

  /* ---- 5. tools/package.mjs, driven. A lab holding the tree's own copy of the step, its config
     and a package.json whose build does nothing; node_modules/.bin, which the step puts first on
     PATH, holds an electron-builder that plants the given program and writes a fresh installer. */
  if (process.platform !== 'win32') skip('5a to 5c: tools/package.mjs runs its build through cmd.exe', 3);
  else {
    const LAB = path.join(TMP, 'lab');
    for (const d of ['tools', 'src/modules', 'node_modules/.bin']) fs.mkdirSync(path.join(LAB, d), { recursive: true });
    for (const f of ['tools/package.mjs', 'tools/fuses.mjs', 'electron-builder.js', 'src/modules/env.js'])
      fs.copyFileSync(path.join(ROOT, f), path.join(LAB, f));
    fs.writeFileSync(path.join(LAB, 'package.json'),
      JSON.stringify({ name: 'fuses-lab', version: '0.0.0', private: true, scripts: { build: 'node -e 0' } }));
    /* A junction, which rmSync below takes away without reaching what it points at (measured). */
    fs.symlinkSync(fs.realpathSync(path.join(ROOT, 'node_modules', '@electron')),
      path.join(LAB, 'node_modules', '@electron'), 'junction');
    fs.writeFileSync(path.join(LAB, 'stub.cjs'), [
      'const fs = require("fs"), p = require("path"), d = p.resolve(process.env.ETIUDA_DIST);',
      'fs.mkdirSync(p.join(d, "win-unpacked"), { recursive: true });',
      'if (process.env.FUSES_LAB_PROGRAM) fs.copyFileSync(process.env.FUSES_LAB_PROGRAM, p.join(d, "win-unpacked", "Etiuda.exe"));',
      'fs.writeFileSync(p.join(d, "etiuda-lab-setup.exe"), "a stub installer");'].join('\n'));
    fs.writeFileSync(path.join(LAB, 'node_modules', '.bin', 'electron-builder.cmd'), '@node "%~dp0..\\..\\stub.cjs" %*\r\n');
    const pack = (name, file) => {
      const env = { ...process.env, ETIUDA_DIST: path.join(TMP, 'out-' + name) };
      delete env.FUSES_LAB_PROGRAM;
      if (file) env.FUSES_LAB_PROGRAM = file;
      const r = spawnSync(process.execPath, [path.join(LAB, 'tools', 'package.mjs')],
        { cwd: LAB, env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
      return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
    };
    const a = pack('good', good), b = pack('flipped', flipped), c = pack('missing', null);
    check(a.status === 0 && /4 fuse\(s\) read back from .*Etiuda\.exe as asked/.test(a.out),
      '5a the step passes a program carrying the four as asked, and says so, exit ' + a.status);
    check(b.status === 1 && /runAsNode is on where electron-builder\.js asks for it off/.test(b.out),
      '5b the step refuses a program with node turned back on, naming the fuse, exit ' + b.status);
    check(c.status === 1 && /is not there, so no fuse was read/.test(c.out),
      '5c the step refuses a build that left no program to read, exit ' + c.status);
  }
} catch (e) {
  failed++;
  console.log('  FAIL ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* reported below */ }
  check(!fs.existsSync(TMP), '6a the temp folder is gone');
}

console.log('#counts checks=' + asserted + ' failed=' + failed + ' notRun=' + notRun.length + ' expected=' + EXPECTED);
if (asserted + notRun.length < EXPECTED) {
  console.log('SUITE DID NOT COMPLETE: ' + asserted + ' of ' + EXPECTED + ' checks ran');
  process.exit(78);
}
console.log(failed ? '  RESULT: FAIL ' + failed + ' of ' + asserted : '  RESULT: ok ' + asserted + ' check(s)');
process.exit(Math.min(failed, 63));
