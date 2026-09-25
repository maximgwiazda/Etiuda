// The practice page for a website to frame: the built engine with the shipped sample and the
// practice switch baked in (ePractice, src/modules/env.js), so no address can undo either.
//   node tools/practice.mjs --out <file.html>
// Beside it, <file.html>.csp holds the Content-Security-Policy header's value, one line; the same
// policy less frame-ancestors is inside the page as a meta element.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scriptHashes } from './build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ENGINE = join(ROOT, 'engine', 'etiuda.html');
const PIN = join(ROOT, 'engine', 'etiuda.csp.json');
const SAMPLE = join(ROOT, 'shell', 'sample-catalog.ec');
const EMBED_SLOT = '<script type="application/json" id="eEmbedded"></script>';
const PRACTICE_SLOT = '<script type="application/json" id="ePractice"></script>';
const SIBLING_TAGS = ['<script src="etiuda-catalog.js"></script>', '<script src="sample-catalog.js"></script>'];
const CSP_ANCHOR = '<meta charset="utf-8">';

function die(msg) { console.error('practice: ' + msg); process.exit(2); }
function once(html, needle, what) {
  const n = html.split(needle).length - 1;
  if (n !== 1) die(what + ' matched ' + n + ' times in the engine, expected 1: ' + needle);
}

const at = process.argv.indexOf('--out');
const out = at > -1 ? process.argv[at + 1] : '';
if (!out) die('usage: node tools/practice.mjs --out <file.html>');

let html;
try { html = readFileSync(ENGINE, 'utf8'); } catch (e) { die('no built engine at ' + ENGINE + ' - run npm run build'); }
let pin;
try { pin = JSON.parse(readFileSync(PIN, 'utf8')); } catch (e) { die('the script hash pin could not be read: ' + e.message); }
if (!pin || pin.kind !== 'etiuda-script-hashes' || !Array.isArray(pin.hashes) || !pin.hashes.length)
  die('the script hash pin is not one this tool can read');
/* The pin must still describe the engine, or the page ships a policy that refuses its own app. */
const live = scriptHashes(html);
if (live.join(' ') !== pin.hashes.join(' ')) die('engine/etiuda.csp.json does not match engine/etiuda.html - run npm run build');

/* As data rather than by path: the module imports nothing, and a path would have node guess the
   file's module type out loud on every run. */
const V2_SRC = readFileSync(join(ROOT, 'src', 'modules', 'catalog-v2.js'), 'utf8');
const { catalogFromV2 } = await import('data:text/javascript,' + encodeURIComponent(V2_SRC));
const sample = catalogFromV2(JSON.parse(readFileSync(SAMPLE, 'utf8')));
if (!sample.sample) die('the shipped sample does not carry its sample flag');
// Inert text inside a script element: nothing in it may close the element or open a comment.
const inert = s => JSON.stringify(s).split('</').join('<\\/').split('<!--').join('\\u003c!--');

once(html, EMBED_SLOT, 'the embed slot');
once(html, PRACTICE_SLOT, 'the practice slot');
once(html, CSP_ANCHOR, 'the charset line');
for (const tag of SIBLING_TAGS) { once(html, tag, 'a sibling tag'); html = html.split(tag).join(''); }
html = html.split(EMBED_SLOT).join(EMBED_SLOT.replace('></script>', '>' + inert(sample) + '</script>'));
html = html.split(PRACTICE_SLOT).join(PRACTICE_SLOT.replace('></script>', '>' + inert({ practice: 1 }) + '</script>'));

const policy = ["default-src 'none'", 'script-src ' + pin.hashes.join(' '), "style-src 'unsafe-inline'",
  'img-src data:', "base-uri 'none'", "form-action 'none'"].join('; ');
html = html.split(CSP_ANCHOR).join(CSP_ANCHOR + '\n<meta http-equiv="Content-Security-Policy" content="' + policy + '">');
if (scriptHashes(html).join(' ') !== pin.hashes.join(' ')) die('baking the page moved a script hash');

const file = resolve(out);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, html);
const header = policy + "; frame-ancestors 'self'";
writeFileSync(file + '.csp', header + '\n');
console.log('practice: ' + file + ', ' + Math.round(html.length / 1024) + ' KB, the sample\'s ' + sample.cards.length + ' cards');
console.log('Content-Security-Policy: ' + header);
