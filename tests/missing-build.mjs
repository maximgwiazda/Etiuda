/* The page a fresh tree shows, and the script that builds it before the shell starts.
 *
 *   node tests/missing-build.mjs
 *
 * No window. The shell is the real shell/main.js, evaluated with electron stubbed, against a
 * copy of the shell whose engine files are whatever the case put there. npm start is not run:
 * a one-file package shows that prestart runs first, and npm run prestart is run in a detached
 * worktree where the three outputs were removed.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeRequire = createRequire(import.meta.url);
const EXPECTED = 17;
const OUTPUTS = ['engine/etiuda.html', 'engine/etiuda.csp.json', 'engine/bubble.css'];

let failed = 0, asserted = 0, complete = false;
const made = [];

function oneLine(s) {
  return String(s || '').replace(/[\u0000-\u001f]+/g, ' ').slice(0, 300);
}
function check(name, ok, detail) {
  asserted++;
  if (ok) console.log('  ok ' + name);
  else { failed++; console.log('  FAIL ' + name + (detail ? ': ' + oneLine(detail) : '')); }
}
function copyTree(from, to, skip) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip && skip.has(ent.name)) continue;
    if (ent.isSymbolicLink()) continue;
    const a = path.join(from, ent.name), b = path.join(to, ent.name);
    if (ent.isDirectory()) copyTree(a, b, null);
    else if (ent.isFile()) fs.copyFileSync(a, b);
  }
}
function dropJunction(dir) {
  const link = path.join(dir, 'node_modules');
  let there = false;
  try { fs.lstatSync(link); there = true; } catch (e) { if (!(e && e.code === 'ENOENT')) throw e; }
  if (!there) return;
  fs.rmdirSync(link);
  if (fs.existsSync(link)) throw new Error('junction remains at ' + link);
}
function git(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
}

function sourceCases() {
  const src = fs.readFileSync(path.join(ROOT, 'shell', 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  check('the framed line is the one the shell smoke reads',
    src.split('const framed = !!readPin().why;').length - 1 === 1);
  check('prestart is the build', pkg.scripts && pkg.scripts.prestart === 'node tools/build.mjs');
  check('start is still the shell', pkg.scripts && pkg.scripts.start === 'electron .');
  check('the build page is marked for the copywriter', src.includes('Waiting for the copywriter.'));
}

function orderCase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bod-order-'));
  made.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    scripts: { prestart: 'node pre.js', start: 'node start.js' },
  }));
  const marker = path.join(dir, 'marker.txt');
  fs.writeFileSync(path.join(dir, 'pre.js'), 'require("node:fs").appendFileSync(' + JSON.stringify(marker) + ', "pre\\n")\n');
  fs.writeFileSync(path.join(dir, 'start.js'), 'require("node:fs").appendFileSync(' + JSON.stringify(marker) + ', "start\\n")\n');
  const r = spawnSync('npm', ['start'], { cwd: dir, encoding: 'utf8', windowsHide: true, shell: true });
  const text = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '';
  check('npm start runs prestart and then start', r.status === 0 && text === 'pre\nstart\n',
    'status=' + r.status + ' marker=' + JSON.stringify(text) + ' ' + oneLine(r.stderr));
}

function loadShell(appDir) {
  const shellDir = path.join(appDir, 'shell');
  const opened = [];
  const quiet = { log: () => {}, error: () => {}, warn: () => {} };
  const proxy = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' || typeof k === 'symbol') ? undefined : proxy(),
    apply: () => proxy(),
    construct: () => proxy(),
  });
  const app = new Proxy({
    getPath: () => path.join(appDir, 'user-data'),
    setPath: () => {},
    isReady: () => false,
    isPackaged: false,
    getName: () => 'Etiuda',
    getVersion: () => '0.0.0',
    getLocale: () => 'en',
    getPreferredSystemLanguages: () => ['en'],
    requestSingleInstanceLock: () => true,
    quit: () => {},
    on: () => {},
    whenReady: () => new Promise(() => {}),
    commandLine: { appendSwitch: () => {}, hasSwitch: () => false, removeSwitch: () => {} },
    getLoginItemSettings: () => ({}),
  }, { get: (t, k) => (k in t ? t[k] : (k === 'then' || typeof k === 'symbol' ? undefined : () => {})) });
  function BrowserWindow(opts) {
    opened.push(['opts', opts]);
    return {
      isDestroyed: () => false,
      webContents: proxy(),
      loadFile: p => { opened.push(['loadFile', p]); },
      loadURL: u => { opened.push(['loadURL', u]); },
      setBounds: () => {},
      getBounds: () => ({ x: 0, y: 0, width: 1100, height: 720 }),
      once: () => {},
      on: () => {},
      isMaximized: () => false,
      isMinimized: () => false,
      focus: () => {},
      show: () => {},
      showInactive: () => {},
      maximize: () => {},
      close: () => {},
    };
  }
  BrowserWindow.getAllWindows = () => [];
  BrowserWindow.fromWebContents = () => null;
  const electron = new Proxy({
    app, BrowserWindow,
    Menu: { setApplicationMenu: () => {}, buildFromTemplate: () => ({ popup: () => {} }) },
    ipcMain: { on: () => {}, handle: () => {} },
    nativeTheme: { themeSource: 'system' },
  }, { get: (t, k) => (k in t ? t[k] : proxy()) });
  const cp = {
    execFileSync: () => { const e = new Error('missing'); e.status = 1; throw e; },
    execFile: (file, args, opts, cb) => {
      const fn = typeof opts === 'function' ? opts : cb;
      const e = new Error('missing'); e.status = 1; e.code = 1;
      setImmediate(() => fn && fn(e, '', ''));
    },
  };
  const own = {};
  const fakeRequire = n => {
    if (n === 'electron') return electron;
    if (n === 'fs' || n === 'node:fs') return fs;
    if (n === 'node:child_process' || n === 'child_process') return cp;
    if (typeof n === 'string' && path.isAbsolute(n) && n.endsWith('.cjs')) return ownModule(n);
    return nodeRequire(n);
  };
  function ownModule(n) {
    if (own[n]) return own[n];
    const m = { exports: {} };
    own[n] = m.exports;
    const body = fs.readFileSync(n, 'utf8');
    new Function('require', 'module', 'exports', '__dirname', '__filename', body)(
      fakeRequire, m, m.exports, path.dirname(n), n);
    return m.exports;
  }
  const main = path.join(shellDir, 'main.js');
  const api = new Function('require', '__dirname', '__filename', 'module', 'exports', 'console', 'setTimeout', 'clearTimeout',
    fs.readFileSync(main, 'utf8') + '\nreturn { startDocument: startDocument, createWindow: createWindow, pageNeedsBuild: pageNeedsBuild };')(
    fakeRequire, shellDir, main, { exports: {} }, {}, quiet, setTimeout, clearTimeout);
  return { api, opened };
}

function pinHash() {
  return "'sha256-" + 'a'.repeat(43) + "='";
}
function writePin(dir, text) {
  fs.mkdirSync(path.join(dir, 'engine'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'engine', 'etiuda.csp.json'), text);
}
function writePage(dir) {
  fs.mkdirSync(path.join(dir, 'engine'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'engine', 'etiuda.html'), '<!DOCTYPE html><title>Etiuda</title>\n');
}

function shellCases() {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bod-shell-'));
  made.push(appDir);
  copyTree(path.join(ROOT, 'shell'), path.join(appDir, 'shell'), new Set(['installer']));
  fs.mkdirSync(path.join(appDir, 'engine'), { recursive: true });
  fs.mkdirSync(path.join(appDir, 'user-data'), { recursive: true });
  let loaded;
  try { loaded = loadShell(appDir); }
  catch (e) {
    check('the shell loads', false, e && e.stack || e);
    return;
  }
  check('the shell loads', true);
  const doc = loaded.api.startDocument();
  const builds = doc.split('npm run build').length - 1;
  check('with nothing built the page names the command twice', builds === 2, 'count=' + builds);
  check('with nothing built the page says the program could not start', doc.includes('Etiuda could not start.'));
  check('with nothing built the page is not the install-again refusal', !doc.includes('Installing Etiuda again'));
  check('with nothing built the Polish line is there', doc.includes('Etiuda nie mogła się uruchomić.')
    && doc.includes('Polecenie npm run build'));
  writePage(appDir);
  const pageOnly = loaded.api.startDocument();
  check('a page without its pin names the command', pageOnly.split('npm run build').length - 1 === 2);
  writePin(appDir, 'not json');
  const bad = loaded.api.startDocument();
  check('a pin that cannot be read says to install again', bad.includes('Installing Etiuda again'));
  check('a pin that cannot be read is not the build page', !bad.includes('writes the page'));
  writePin(appDir, JSON.stringify({
    kind: 'etiuda-script-hashes', schema: 1, hashes: [pinHash()],
  }) + '\n');
  check('a readable pin and a page leave the start document empty', loaded.api.startDocument() === '');
  try {
    loaded.opened.length = 0;
    fs.rmSync(path.join(appDir, 'engine', 'etiuda.html'));
    fs.rmSync(path.join(appDir, 'engine', 'etiuda.csp.json'));
    loaded.api.createWindow();
    const urls = loaded.opened.filter(x => x[0] === 'loadURL').map(x => x[1]);
    const files = loaded.opened.filter(x => x[0] === 'loadFile');
    check('an absent page is loaded as the build refusal',
      urls.length === 1 && urls[0].includes('npm%20run%20build') && files.length === 0,
      JSON.stringify(loaded.opened.map(x => x[0])));
  } catch (e) {
    check('an absent page is loaded as the build refusal', false, e && e.stack || e);
  }
  try {
    loaded.opened.length = 0;
    writePage(appDir);
    writePin(appDir, JSON.stringify({
      kind: 'etiuda-script-hashes', schema: 1, hashes: [pinHash()],
    }) + '\n');
    loaded.api.createWindow();
    const files = loaded.opened.filter(x => x[0] === 'loadFile');
    const urls = loaded.opened.filter(x => x[0] === 'loadURL');
    check('a present page is loaded from its file', files.length === 1 && urls.length === 0,
      JSON.stringify(loaded.opened.map(x => x[0])));
  } catch (e) {
    check('a present page is loaded from its file', false, e && e.stack || e);
  }
}

function prestartCase() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'bod-pre-'));
  const scratch = path.join(parent, 'full');
  made.push(parent);
  const added = git(ROOT, ['worktree', 'add', '--detach', scratch, 'HEAD']);
  if (added.status !== 0) {
    check('prestart writes the page when it is absent', false, oneLine(added.stderr || added.stdout));
    return;
  }
  try {
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(scratch, 'node_modules'), 'junction');
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(scratch, 'package.json'));
    for (const rel of OUTPUTS) fs.rmSync(path.join(scratch, rel), { force: true });
    const r = spawnSync('npm', ['run', 'prestart'], {
      cwd: scratch, encoding: 'utf8', windowsHide: true, shell: true,
    });
    const there = OUTPUTS.every(rel => fs.existsSync(path.join(scratch, rel)));
    const record = fs.existsSync(path.join(scratch, 'engine', 'etiuda.build.json'));
    check('prestart writes the page when it is absent', r.status === 0 && there && record,
      'status=' + r.status + ' there=' + there + ' record=' + record + ' ' + oneLine(r.stderr));
  } finally {
    try { dropJunction(scratch); } catch (e) { console.log('  FAIL junction left in place: ' + oneLine(e.message)); }
    git(ROOT, ['worktree', 'remove', '--force', scratch]);
  }
}

function cleanup() {
  const modules = path.join(ROOT, 'node_modules');
  const before = fs.existsSync(modules);
  for (const dir of made) {
    try {
      if (fs.existsSync(path.join(dir, 'full'))) dropJunction(path.join(dir, 'full'));
    } catch { /* the prestart case already tried */ }
    try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch { /* named above */ }
  }
  if (before && !fs.existsSync(modules)) console.log('  FAIL the checkout node_modules is gone');
}

try {
  sourceCases();
  orderCase();
  shellCases();
  prestartCase();
  complete = asserted === EXPECTED;
} catch (e) {
  failed++;
  console.log('  FAIL the leg stopped: ' + oneLine(e && e.stack || e));
} finally {
  cleanup();
}

console.log('#counts checks=' + asserted + ' failed=' + failed + ' expected=' + EXPECTED);
console.log(complete && !failed
  ? 'RESULT: ok ' + asserted + ' check(s)'
  : 'RESULT: FAIL ' + failed + ' failed' + (complete ? '' : ', and only ' + asserted + ' of ' + EXPECTED + ' ran'));
process.exit(complete && !failed ? 0 : Math.min(failed || 1, 63));
