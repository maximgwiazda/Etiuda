// The control run for hooks-coverage.mjs: boot the engine, answer the catalog offer, dismiss
// the invite, and stop. Nothing is driven, so a counter that is really counting must report
// strictly more unreached slots here than under the 149 checks - and one that is not counting
// reports the same set under both. Board 341.
//
// The boot sequence is copied from tests/smoke.js on purpose: goto, 2400ms, the load loop, the
// skip loop, Escape. If smoke's changes, this one is stale and the control is weaker, which is
// why the two are quoted rather than shared - smoke owns its own boot.
//
//   ETIUDA_FIXTURES=<folder> ETIUDA_HOOK_COVERAGE=<file> node tools/split-guard/hooks-coverage-boot.mjs
//
// The browser is closed in a finally. An orphaned headless browser wedges the desk.
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const require = createRequire(join(REPO, 'tests', 'engine.js'));
const puppeteer = require('puppeteer-core');
const E = require(join(REPO, 'tests', 'engine.js'));

const OUT = process.env.ETIUDA_HOOK_COVERAGE;
if (!OUT) { console.log('ETIUDA_HOOK_COVERAGE is not set; there is nowhere to write'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const RUN = E.runFolder('catalogV2', 'sampleV2');
let b;
try {
  b = await puppeteer.launch({ executablePath: E.browserPath('chrome'), headless: true, args: ['--hide-scrollbars'], protocolTimeout: 300000 });
  const p = await b.newPage();
  await p.setViewport({ width: 1500, height: 950 });
  p.on('dialog', d => d.accept());
  await p.evaluateOnNewDocument(() => {
    const real = Object.freeze;
    // The same carry as smoke.js's, and it has to be the same or the control is not a control:
    // answering the catalog offer ends in location.reload(), here as there.
    const CARRY = '__etiudaHookHits=';
    let seed = Object.create(null);
    try {
      const at = window.name.indexOf(CARRY);
      if (at >= 0) seed = JSON.parse(window.name.slice(at + CARRY.length)) || Object.create(null);
    } catch (x) {}
    window.__hookHits = Object.assign(Object.create(null), seed);
    window.__hookWrapped = [];
    addEventListener('beforeunload', () => { try { window.name = CARRY + JSON.stringify(window.__hookHits); } catch (x) {} });
    Object.freeze = function (o) {
      if (o && typeof o === 'object' && Object.getPrototypeOf(o) === null && !window.__hookWrapped.length) {
        const keys = Object.keys(o);
        if (keys.length >= 10 && keys.every(k => typeof o[k] === 'function')) {
          for (const k of keys) {
            const f = o[k];
            o[k] = function () { window.__hookHits[k] = (window.__hookHits[k] || 0) + 1; return f.apply(this, arguments); };
          }
          window.__hookWrapped = keys;
        }
      }
      return real(o);
    };
  });
  await p.goto(RUN.url, { waitUntil: 'load', timeout: 90000 });
  await sleep(2400);
  const click = re => p.evaluate(s => {
    const r = new RegExp(s, 'i');
    const el = [...document.querySelectorAll('button')].filter(x => x.offsetWidth > 0).find(x => r.test(x.textContent));
    if (el) { el.click(); return true; } return false;
  }, re.source);
  for (let i = 0; i < 4; i++) { if (!(await click(/^(load|yes|tak)([^a-z]|$)|load it|load the catalog|sample catalog|update/))) break; await sleep(1900); }
  for (let i = 0; i < 3; i++) { if (!(await click(/skip|not now|close|pomi/))) break; await sleep(500); }
  await p.keyboard.press('Escape'); await sleep(800);
  const got = await p.evaluate(() => ({ wrapped: window.__hookWrapped || [], hits: Object.assign({}, window.__hookHits), cards: document.querySelectorAll('.card').length }));
  writeFileSync(OUT, JSON.stringify({ wrapped: got.wrapped, hits: got.hits }));
  console.log('boot control: ' + got.cards + ' cards on screen, ' + got.wrapped.length + ' slots wrapped');
} finally {
  if (b) await b.close().catch(() => {});
  RUN.drop();
}
