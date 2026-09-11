// The 2.x build pipeline, proved on a toy source tree before a single module is extracted
// from the engine. Spec section 9 binds three conditions on it: never minify, esbuild rather
// than webpack, and an output that is genuinely one file. `checks.mjs` measures all three.
//
//   node tools/bundler-probe/build.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
// Output goes under the ignored /dist/, because a probe's artifact is not a release.
export const OUT_DIR = join(HERE, '..', '..', 'dist', 'bundler-probe');
export const OUT_FILE = join(OUT_DIR, 'etiuda.html');

// Every option here is load-bearing and the reason is on the line.
export const OPTIONS = {
  bundle: true,
  format: 'iife',          // file:// cannot load a module at all, so a module format is out
  minify: false,           // spec 9 condition 1, and the audit claim rests on it
  sourcemap: false,        // an external map is a second file, an inline one is dead weight
  write: false,            // esbuild writes nothing; this script writes exactly one file
  charset: 'utf8',         // the default escapes Polish to \u sequences and kills readability
  legalComments: 'none',
  loader: { '.svg': 'dataurl' },  // an asset left as a file is the second file condition 3 bars
  outdir: 'unused',        // esbuild insists on one when a build has several outputs
};

export async function build() {
  const t0 = Date.now();
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const result = await esbuild.build({ ...OPTIONS, entryPoints: [join(HERE, 'src', 'main.js')] });
  const js = result.outputFiles.find(f => f.path.endsWith('.js'));
  const css = result.outputFiles.find(f => f.path.endsWith('.css'));
  if (!js || !css) throw new Error('esbuild emitted ' + result.outputFiles.length + ' files, expected js and css');

  // Assert the anchor matches exactly once before writing anything through it.
  let html = readFileSync(join(HERE, 'src', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  for (const [anchor, replacement] of [
    ['<!--@STYLE-->', '<style>\n' + css.text + '</style>'],
    ['<!--@SCRIPT-->', '<script>\n' + js.text + '</script>'],
  ]) {
    const hits = html.split(anchor).length - 1;
    if (hits !== 1) throw new Error(anchor + ' matched ' + hits + ' times, expected 1');
    // The function form, because a bundle holding $& or $1 would otherwise be rewritten by
    // the replacement's own substitution rules.
    html = html.replace(anchor, () => replacement);
  }

  writeFileSync(OUT_FILE, html, 'utf8');
  return { bytes: Buffer.byteLength(html, 'utf8'), ms: Date.now() - t0 };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { bytes, ms } = await build();
  console.log(bytes + ' bytes, ' + ms + ' ms, ' + OUT_FILE);
}
