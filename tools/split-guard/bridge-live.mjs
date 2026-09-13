// The bridge, measured in a running browser rather than derived from the source.
//
// A LAB INSTRUMENT, NOT A GATE. `bridge.mjs` is the gate; nothing runs this one automatically
// and no script depends on it. It exists for two jobs: to confirm that the gate's static rule
// is faithful to what the page actually does, and to measure a write form the gate's text rules
// would miss - `eval`, a computed target, anything that reaches a binding without naming it.
//
// How. It builds a probe entry that imports `src/main.js` and then imports every module the
// entry imports a second time, hanging the namespace objects on `__NS`. A module namespace
// object's properties are the LIVE bindings, so `globalThis[name]` against `__NS[ns][name]` by
// `Object.is` is exactly the question the bridge exists to answer, with no heuristic anywhere.
// Re-importing costs nothing and changes nothing: an ES module is evaluated once.
//
//   ETIUDA_FIXTURES=<folder> node tools/split-guard/bridge-live.mjs
//   ETIUDA_FIXTURES=<folder> node tools/split-guard/bridge-live.mjs --src <a lab copy of src>
//
// WHY IT IS NOT THE GATE, measured 2026-09-13 with all thirteen accessors deleted: a page left
// at `load` with the adoption dialog unanswered reported 6 of the 13 names stale; the same page
// driven the way `smoke.js` boots it reported 12. The thirteenth, `eSpellFix`, diverges only
// after a misspelled search. The reach of a runtime check is the reach of its drive, and
// nothing checks the drive. The static rule sees all thirteen without a browser.
//
// It prints identifiers and counts. No cell, no reading and no catalog string is read or
// printed, and the page it writes goes to a temp folder that is removed in a finally, along
// with the browser - an orphan browser wedges this desk until it reboots.
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import * as esbuild from 'esbuild';
import { OPTIONS } from '../bundler-probe/build.mjs';

const require_ = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const NO_VERDICT = 78;
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const refuse = why => { console.error(why); process.exit(NO_VERDICT); };

const SRC = resolve(arg('--src', join(ROOT, 'src')));
const FIX = process.env.ETIUDA_FIXTURES || '';
if (!existsSync(join(SRC, 'main.js'))) refuse('no entry at ' + join(SRC, 'main.js'));
if (!FIX || !existsSync(FIX)) refuse('ETIUDA_FIXTURES names no folder; this probe boots against a catalog');

const { browserPath } = require_(join(ROOT, 'tests', 'engine.js'));
const puppeteer = require_('puppeteer-core');

// The probe entry is generated from the real entry's own import list, so it cannot go stale
// while modules are added.
const mainText = readFileSync(join(SRC, 'main.js'), 'utf8');
const mods = [...mainText.matchAll(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*"([^"]*)"/g)]
  .map(m => ({ ns: m[1], path: m[2] }));
if (!mods.length) refuse('the entry imports no module namespaces; there is nothing to measure');
const entry = 'import "./main.js";\n'
  + mods.map(m => 'import * as __' + m.ns + ' from "' + m.path + '";\n').join('')
  + 'globalThis.__NS = {' + mods.map(m => m.ns + ': __' + m.ns).join(', ') + '};\n';

const built = await esbuild.build({ ...OPTIONS, absWorkingDir: ROOT,
  stdin: { contents: entry, resolveDir: SRC, sourcefile: 'bridge-probe.js', loader: 'js' } });
const template = readFileSync(join(SRC, 'template.html'), 'utf8');
const monolith = readFileSync(join(SRC, 'monolith.js'), 'utf8');
const html = template.split('/*@APP*/\n').join(built.outputFiles[0].text + monolith);

const dir = mkdtempSync(join(tmpdir(), 'bridge-live-'));
const page = join(dir, 'etiuda.html');
writeFileSync(page, html, 'utf8');
for (const f of ['etiuda-catalog.js', 'sample-catalog.js']) copyFileSync(join(FIX, f), join(dir, f));

const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
  browser = await puppeteer.launch({ executablePath: browserPath('chrome'), headless: true,
    args: ['--hide-scrollbars'], protocolTimeout: 300000 });
  const p = await browser.newPage();
  await p.setViewport({ width: 1500, height: 950 });
  const errs = [];
  p.on('dialog', d => d.accept());
  p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 140)));
  await p.goto('file:///' + page.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 90000 });
  await sleep(2400);

  // The same adoption walk smoke.js does. Without it the page renders no card and the probe
  // measures a boot that never happened - which is how the 6-of-13 reading above was got.
  const click = re => p.evaluate(s => {
    const r = new RegExp(s, 'i');
    const el = [...document.querySelectorAll('button')].filter(x => x.offsetWidth > 0)
      .find(x => r.test(x.textContent));
    if (el) { el.click(); return true; } return false;
  }, re.source);
  for (let i = 0; i < 4; i++) {
    if (!(await click(/^(load|yes|tak)([^a-z]|$)|load it|load the catalog|sample catalog|update/))) break;
    await sleep(1900);
  }
  for (let i = 0; i < 3; i++) { if (!(await click(/skip|not now|close|pomi/))) break; await sleep(500); }
  await p.keyboard.press('Escape');
  await sleep(900);

  const read = () => p.evaluate(() => {
    const out = { total: 0, stale: [], absent: [] };
    for (const ns of Object.keys(globalThis.__NS)) {
      const m = globalThis.__NS[ns];
      for (const k of Object.keys(m)) {
        out.total++;
        if (!(k in globalThis)) { out.absent.push(ns + '.' + k); continue; }
        if (!Object.is(globalThis[k], m[k])) out.stale.push(ns + '.' + k);
      }
    }
    return out;
  });

  const cards = await p.evaluate(() => document.querySelectorAll('.card').length);
  const boot = await read();
  await p.setViewport({ width: 1200, height: 900 }); await sleep(900);
  await p.setViewport({ width: 1500, height: 950 }); await sleep(900);
  const driven = await read();

  console.log('bridge-live  ' + boot.total + ' exported names over ' + mods.length
    + ' modules, ' + cards + ' cards on screen, ' + errs.length + ' page errors');
  for (const n of driven.stale) console.log('  FAIL  ' + n + ' is stale: the global is not the live binding');
  for (const n of driven.absent) console.log('  FAIL  ' + n + ' never reached globalThis at all');
  const bad = driven.stale.length + driven.absent.length;
  console.log(bad
    ? '  FAIL  ' + bad + ' of ' + driven.total + ' names read stale after the drive, '
      + boot.stale.length + ' of them already at boot'
    : '  ok    every one of ' + driven.total + ' names read the live binding, at boot and after the drive');
  process.exitCode = bad;
} finally {
  if (browser) await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
