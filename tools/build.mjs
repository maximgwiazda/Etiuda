// The 2.x build: modules in src/, one readable HTML file at engine/etiuda.html.
//
//   node tools/build.mjs
//
// Two sources go in. `src/template.html` is the document with the app script's body replaced
// by one anchor, and `src/main.js` is the module tree, bundled into that anchor. There is no
// third: the extraction finished on 2026-09-14 and src/monolith.js is gone, so the anchor now
// takes the bundle alone and the app starts on the bundle's last line.
//
// The build options are `bundler-probe`'s, unchanged, so the conditions spec 9 binds are proved
// by that probe rather than restated here.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { OPTIONS } from './bundler-probe/build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'src');
export const OUT_FILE = join(ROOT, 'engine', 'etiuda.html');
export const PIN_FILE = join(ROOT, 'engine', 'etiuda.csp.json');
const ANCHOR = '/*@APP*/\n';

const sha256 = s => createHash('sha256').update(s, 'utf8').digest('hex');

// The shell serves this artifact under a content security policy whose script-src names the
// inline scripts by hash. Hashing at SERVE time would hash whatever the file then held, so a
// script edited into the artifact would be hashed along with the rest and would run. Hashing
// here pins the list to what the build produced, and a later edit is a script the policy does
// not name. The embedded catalog slot is skipped: application/json is data the browser never
// runs, and a catalog changing it must not invalidate the pin.
export function scriptHashes(html) {
  const re = /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    if (/type\s*=\s*["']?application\/json/i.test(m[1])) continue;
    out.push("'sha256-" + createHash('sha256').update(m[2], 'utf8').digest('base64') + "'");
  }
  return out;
}

// LF in this tree. A CR reaching the artifact would report as every line changed in the next
// diff, so it is refused at the source rather than explained afterwards.
function read(name) {
  const text = readFileSync(join(SRC, name), 'utf8');
  if (text.includes('\r')) throw new Error('src/' + name + ' holds a CR byte; this tree is LF');
  return text;
}

export async function build() {
  const t0 = Date.now();
  // absWorkingDir pins the module banners esbuild writes above each module to paths relative to
  // this repository. Without it they are relative to the caller's directory, and this artifact
  // is published.
  const result = await esbuild.build({ ...OPTIONS, absWorkingDir: ROOT, entryPoints: [join(SRC, 'main.js')] });
  if (result.outputFiles.length !== 1)
    throw new Error('esbuild emitted ' + result.outputFiles.length + ' files; the artifact is one file');
  const bundle = result.outputFiles[0].text;
  if (bundle.includes('\r')) throw new Error('the bundle holds a CR byte');

  const template = read('template.html');
  const hits = template.split(ANCHOR).length - 1;
  if (hits !== 1) throw new Error(ANCHOR.trim() + ' matched ' + hits + ' times in the template, expected 1');

  // split/join rather than replace: the engine's own text holds `$&` and `$1`, which a
  // replacement string would substitute rather than copy.
  const html = template.split(ANCHOR).join(bundle);
  writeFileSync(OUT_FILE, html, 'utf8');
  const hashes = scriptHashes(html);
  if (hashes.length !== 2)
    throw new Error('the artifact holds ' + hashes.length + ' inline scripts; the policy expects 2');
  writeFileSync(PIN_FILE, JSON.stringify({ kind: 'etiuda-script-hashes', schema: 1, hashes }) + '\n', 'utf8');
  return { bytes: Buffer.byteLength(html, 'utf8'), bundleBytes: Buffer.byteLength(bundle, 'utf8'),
           sha256: sha256(html), hashes, ms: Date.now() - t0 };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const before = (() => { try { return sha256(readFileSync(OUT_FILE, 'utf8')); } catch { return '(absent)'; } })();
  const r = await build();
  console.log('engine/etiuda.html  ' + r.bytes + ' bytes, ' + r.bundleBytes + ' of them the bundle, ' + r.ms + ' ms');
  console.log('  was ' + before.slice(0, 16));
  console.log('  now ' + r.sha256.slice(0, 16));
  console.log('engine/etiuda.csp.json  ' + r.hashes.length + ' pinned script hash(es)');
}
