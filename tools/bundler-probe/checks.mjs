// Measures the artifact against spec section 9's three binding conditions and against the
// consequences of the file:// origin. Static only: what the file IS. `verify.mjs` drives it
// in a browser and measures what it DOES, and neither alone is enough.
//
//   node tools/bundler-probe/build.mjs && node tools/bundler-probe/checks.mjs
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { build, OUT_DIR, OUT_FILE } from './build.mjs';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const entries = readdirSync(OUT_DIR);
check('1 the output directory holds exactly one entry', entries.length === 1, `entries=${JSON.stringify(entries)}`);
check('2 it is ' + basename(OUT_FILE) + ' and over 500 bytes',
  statSync(OUT_FILE).isFile() && statSync(OUT_FILE).size > 500, `bytes=${statSync(OUT_FILE).size}`);

const buf = readFileSync(OUT_FILE);
const text = buf.toString('utf8');
const lines = text.split('\n');

check('3 no CRLF', !text.includes('\r'));
check('4 decodes as UTF-8 with no replacement character', !text.includes(String.fromCharCode(0xFFFD)));

const externalRefs = [
  ...text.matchAll(/<script[^>]*\ssrc\s*=/gi),
  ...text.matchAll(/<link[^>]*\shref\s*=/gi),
  ...text.matchAll(/<img[^>]*\ssrc\s*=\s*["'](?!data:)/gi),
].map(m => m[0]);
check('5 no external script, stylesheet or image reference', externalRefs.length === 0,
  `refs=${JSON.stringify(externalRefs)}`);
check('6 no type="module", which file:// would refuse', !/type\s*=\s*["']module["']/i.test(text));
check('7 no source map reference', !text.includes('sourceMappingURL'));

const styleBlocks = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]);
const css = styleBlocks.join('\n');
check('8 the stylesheet is inlined as CSS, not injected by script',
  styleBlocks.length === 1 && css.includes('.probe-banner') && css.includes('letter-spacing'),
  `blocks=${styleBlocks.length}`);
check('9 the svg asset arrived as a data URI', /url\(\s*["']?data:image\/svg\+xml/i.test(css));

const scripts = [...text.matchAll(/<script(?![^>]*\ssrc)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
check('10 the script element was not ended early by a closing tag in a string',
  scripts.length === 1 && scripts[0].includes('PROBE_MAIN_MARKER'), `blocks=${scripts.length}`);
check('11 both modules contributed',
  text.includes('PROBE_GREET_MARKER') && text.includes('PROBE_MAIN_MARKER'));
check('12 no import or export statement survives',
  scripts.join('\n').split('\n').filter(l => /^\s*(import|export)\b/.test(l)).length === 0);
check('13 the identifier greet was not renamed', /function greet\(/.test(text));
check('14 Polish is present as characters rather than escapes',
  /[ąćęłńóśźż]/.test(text) && !/\\u0[12]/.test(text));
check('15 no source comment survived into the artifact',
  !text.includes('must not reach the artifact') && !text.includes('here on purpose'));

// Readability is the property "never minify" exists to protect, and a data URI is data
// rather than code, so it is excluded from the line-length measure rather than pardoned.
const codeLines = lines.filter(l => !l.includes('data:'));
const longest = codeLines.reduce((m, l) => Math.max(m, l.length), 0);
check('16 readable: no code line over 160 characters', longest <= 160, `longest=${longest}`);

const before = createHash('sha256').update(buf).digest('hex');
const again = await build();
const after = createHash('sha256').update(readFileSync(OUT_FILE)).digest('hex');
check('17 a second build is byte-identical', before === after, `rebuild=${again.ms}ms`);

console.log(`\nbytes=${buf.length} lines=${lines.length} longestCodeLine=${longest} sha256=${before}`);
console.log(fail === 0 ? `PASS ${pass}/${pass + fail}` : `FAIL ${fail} of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
