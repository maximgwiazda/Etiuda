// Drives the artifact from a real file:// URL and reads the values back, because "one file"
// is a claim about what the page asks the disk for and reading the HTML cannot settle it.
// The two controls come first and must fail in the way they were built to fail: a harness
// that reports "one request" for a page which plainly fetches three would report success for
// anything.
//
//   node tools/bundler-probe/verify.mjs
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { OUT_FILE } from './build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTROL = join(HERE, '..', '..', 'dist', 'bundler-probe-control');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

rmSync(CONTROL, { recursive: true, force: true });
mkdirSync(CONTROL, { recursive: true });
writeFileSync(join(CONTROL, 'split.html'),
  '<!DOCTYPE html>\n<meta charset="utf-8">\n<link rel="stylesheet" href="./missing.css">\n'
  + '<div id="out"></div>\n<script src="./missing.js"></script>\n');
writeFileSync(join(CONTROL, 'mod.js'), 'window.__probe = { greeted: "module-ran" };\n');
writeFileSync(join(CONTROL, 'module.html'),
  '<!DOCTYPE html>\n<meta charset="utf-8">\n<div id="out"></div>\n'
  + '<script type="module" src="./mod.js"></script>\n');

async function drive(browser, file) {
  const page = await browser.newPage();
  const r = { requests: [], failed: [], consoleErrors: [], pageErrors: [] };
  page.on('request', q => r.requests.push(q.url()));
  page.on('requestfailed', q => r.failed.push(q.url().slice(-24) + ' :: ' + (q.failure()?.errorText || '?')));
  page.on('console', m => { if (m.type() === 'error') r.consoleErrors.push(m.text().slice(0, 60)); });
  page.on('pageerror', e => r.pageErrors.push(String(e.message).slice(0, 120)));
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  r.read = await page.evaluate(() => {
    const el = document.querySelector('.probe-banner');
    const cs = el ? getComputedStyle(el) : null;
    return {
      probe: window.__probe || null,
      out: (document.getElementById('out') || {}).textContent || null,
      letterSpacing: cs ? cs.letterSpacing : null,
      background: cs ? cs.backgroundImage.slice(0, 40) : null,
      bodyText: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 80),
      styleTags: document.querySelectorAll('style').length,
    };
  });
  // A data: URL counts as a request and fetches nothing, so what is measured is the requests
  // carrying a scheme that reaches a file.
  r.fromDisk = r.requests.filter(u => !u.startsWith('data:') && !u.startsWith('blob:'));
  await page.close();
  return r;
}

const show = (label, r) => {
  console.log(`\n--- ${label}`);
  console.log('  requests from disk', r.fromDisk.length, JSON.stringify(r.fromDisk.map(u => u.split('/').pop())));
  console.log('  failed            ', r.failed.length, JSON.stringify(r.failed));
  console.log('  console errors    ', r.consoleErrors.length);
  console.log('  window.__probe    ', JSON.stringify(r.read.probe));
  console.log('  #out              ', JSON.stringify(r.read.out));
  console.log('  letter-spacing    ', r.read.letterSpacing, '| background', r.read.background);
  console.log('  visible text      ', JSON.stringify(r.read.bodyText));
};

let browser, verdicts = [];
try {
  if (!existsSync(OUT_FILE)) throw new Error('no artifact at ' + OUT_FILE + '; run build.mjs first');
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

  const a = await drive(browser, join(CONTROL, 'split.html'));
  show('CONTROL A, a page that is deliberately three files', a);
  verdicts.push(['control A asks the disk for more than the document', a.fromDisk.length > 1]);
  verdicts.push(['control A reports its two missing subresources', a.failed.length === 2]);

  const b = await drive(browser, join(CONTROL, 'module.html'));
  show('CONTROL B, a module script on file://, the reason a bundler is forced at all', b);
  verdicts.push(['control B never ran its module', b.read.probe === null]);
  verdicts.push(['control B failed the module fetch', b.failed.length === 1]);

  const c = await drive(browser, OUT_FILE);
  show('ARTIFACT', c);
  verdicts.push(['the artifact asks the disk for nothing but itself', c.fromDisk.length === 1]);
  verdicts.push(['no failed request', c.failed.length === 0]);
  verdicts.push(['no console error', c.consoleErrors.length === 0]);
  verdicts.push(['nothing thrown', c.pageErrors.length === 0]);
  verdicts.push(['the bundled modules ran', !!(c.read.probe && c.read.probe.greeted)]);
  verdicts.push(['the DOM carries the greeting', /PROBE_GREET_MARKER/.test(c.read.out || '')]);
  verdicts.push(['the inlined CSS is in effect', c.read.letterSpacing === '0.64px']);
  verdicts.push(['the svg is in effect as a data URI', /data:image\/svg\+xml/.test(c.read.background || '')]);
  verdicts.push(['Polish survived the round trip', /[\u0105\u017C]/.test(JSON.stringify(c.read.probe))]);
  verdicts.push(['the closing tag in a string stayed inside the string',
    typeof c.read.probe?.hazard === 'string' && c.read.probe.hazard.includes('</script>')]);
  verdicts.push(['exactly one style element, so no tag was ended early', c.read.styleTags === 1]);
} finally {
  if (browser) await browser.close();
}

console.log('\n--- verdicts');
let bad = 0;
for (const [name, ok] of verdicts) { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); }
console.log(bad === 0 ? `\nPASS ${verdicts.length}/${verdicts.length}` : `\nFAIL ${bad} of ${verdicts.length}`);
process.exit(bad === 0 ? 0 : 1);
