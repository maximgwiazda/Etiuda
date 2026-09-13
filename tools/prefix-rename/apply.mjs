/* Applies map.json to one file, and refuses rather than half-applies: every selected rename
 * entry must match at least once and every `once` entry exactly once, so a map that has
 * drifted from its source fails here instead of producing a plausible file.
 *   node tools/prefix-rename/apply.mjs <in> <out> [const|js|doc ...]
 * Named with no class it applies the whole map and then sweeps the result, where anything
 * still carrying the old prefix has to be on the map's keep list or the run fails. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(readFileSync(join(here, 'map.json'), 'utf8'));
const [inPath, outPath, ...want] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: node tools/prefix-rename/apply.mjs <in> <out> [const|js|doc ...]');
  process.exit(2);
}
const wanted = c => want.length === 0 || want.includes(c);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUL = String.fromCharCode(0);
const count = (hay, needle) => hay.split(needle).length - 1;

let src = readFileSync(inPath, 'utf8');
let fail = 0;

/* A frozen literal shares its spelling with an identifier that does move, so it is masked
   out of the way before the rename and put back after it. */
map.freezeStrings.forEach((lit, i) => {
  const n = count(src, lit);
  if (n === 0) { console.error('FREEZE ' + lit + ' matches nothing'); fail++; }
  console.log('freeze  ' + lit + '  ' + n);
  src = src.split(lit).join(NUL + 'F' + i + NUL);
});

for (const o of map.once) {
  if (!wanted(o.class)) continue;
  const n = count(src, o.find);
  if (n !== 1) { console.error('ONCE ' + n + ' matches for ' + JSON.stringify(o.find.slice(0, 60))); fail++; continue; }
  src = src.split(o.find).join(o.to);
  console.log('once    ' + o.class + '  1  ' + o.why);
}

const use = map.rename.filter(r => wanted(r.class));
const by = new Map(use.map(r => [r.from, r]));
const word = /[A-Za-z0-9_$]/;
const hits = new Map();
if (use.length) {
  const alt = use.map(r => r.from).sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).map(esc).join('|');
  src = src.replace(new RegExp(alt, 'g'), (m, at, whole) => {
    const before = at > 0 ? whole[at - 1] : ' ';
    const after = whole[at + m.length] || ' ';
    if (word.test(before) || word.test(after)) return m;
    hits.set(m, (hits.get(m) || 0) + 1);
    return by.get(m).to;
  });
}
for (const r of use) if (!hits.get(r.from)) { console.error('RENAME ' + r.from + ' matched nothing'); fail++; }

map.freezeStrings.forEach((lit, i) => { src = src.split(NUL + 'F' + i + NUL).join(lit); });

let total = 0;
for (const n of hits.values()) total += n;
console.log('rename  ' + use.length + ' entries, ' + total + ' substitutions'
  + (want.length ? '  [' + want.join(' ') + ']' : '  [whole map]'));

if (want.length === 0) {
  const ok = new Set(Object.keys(map.keep).concat(['clipboard', 'sepByBand']));
  const left = new Map();
  for (const m of src.matchAll(/[A-Za-z0-9_$-]*[Pp][Bb][A-Za-z0-9_$-]*/g)) {
    const whole = m[0];
    const pieces = ok.has(whole) ? [] : whole.split('-').filter(p => /[Pp][Bb]/.test(p));
    for (const p of pieces) if (!ok.has(p)) left.set(p, (left.get(p) || 0) + 1);
  }
  if (left.size) { console.error('SWEEP left behind: ' + JSON.stringify([...left])); fail++; }
  else console.log('sweep   nothing outside the keep list still carries the old prefix');
}

if (fail) { console.error('REFUSED: ' + fail + ' problem(s), nothing written'); process.exit(1); }
writeFileSync(outPath, src);
console.log('wrote   ' + outPath + '  ' + Buffer.byteLength(src) + ' bytes');
