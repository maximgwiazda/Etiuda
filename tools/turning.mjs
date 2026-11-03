/* Pack the installer's turning frames into a solid 7z archive and generate turning.nsh
 * from turning.json at build time.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getPath7za } from 'app-builder-lib/out/toolsets/7zip.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

export async function prepareTurning(rootDir = ROOT, resDir = 'shell') {
  const turningDir = path.resolve(rootDir, resDir, 'installer', 'turning');
  const jsonPath = path.join(turningDir, 'turning.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error('turning.json not found at ' + jsonPath);
  }
  const cfg = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const frames = Number(cfg.frames);
  const intervalMs = Number(cfg.intervalMs);
  if (!frames || !intervalMs) {
    throw new Error('Invalid frames or intervalMs in ' + jsonPath);
  }

  // 1. Generate turning.nsh
  const nshPath = path.resolve(rootDir, resDir, 'installer', 'turning.nsh');
  const nshContent = `# Generated from turning.json at build time\n!define TURN_FRAMES ${frames}\n!define TURN_INTERVAL ${intervalMs}\n`;
  fs.writeFileSync(nshPath, nshContent, 'utf8');

  // 2. Resolve 7za
  const p7za = await getPath7za();
  if (!p7za || !fs.existsSync(p7za)) {
    throw new Error('7za executable not found via electron-builder toolsets');
  }

  // 3. Pack solid 7z
  const target7z = path.resolve(rootDir, resDir, 'installer', 'turning.7z');
  if (fs.existsSync(target7z)) {
    fs.unlinkSync(target7z);
  }

  const r = spawnSync(p7za, ['a', '-t7z', '-mx=9', '-ms=on', target7z, path.join(turningDir, '*.bmp')], {
    stdio: 'pipe',
  });
  if (r.status !== 0) {
    const err = String(r.stderr || r.stdout);
    throw new Error('7za packing failed: ' + err);
  }

  const stat = fs.statSync(target7z);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(target7z)).digest('hex');

  return {
    frames,
    intervalMs,
    target7z,
    nshPath,
    size7z: stat.size,
    sha256: hash,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  prepareTurning().then(res => {
    console.log(`turning: packed ${res.frames} frames into ${res.target7z} (${res.size7z} bytes, sha256 ${res.sha256.slice(0, 16)}...)`);
  }).catch(err => {
    console.error('turning failed:', err);
    process.exit(1);
  });
}
