// The guard is proved by watching it reject, not by reading it. A gate that has never
// rejected anything has not been tested, it has been written.
//
// Each case below builds a module tree in a temporary folder, runs the guard over it, and
// says what the guard must conclude. The sound tree must come back clean; every broken tree
// must be named exactly. The broken trees are the shapes measured in the engine on
// 2026-09-12: a forgotten import behind a typeof guard, a forgotten import called plainly, a
// name reached through window, a locally shadowed binding, a write routed through globalThis.
//
//   node tools/split-guard/selftest.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { guard, canary, windowLookups, shadowedBindings, engineNames } from './guard.mjs';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const root = mkdtempSync(join(tmpdir(), 'split-guard-'));

// A stand-in monolith, so the name list is derived the way it is in earnest: from the top
// level of one <script>. The names are the real ones this failure was found on.
const MONOLITH = `<!doctype html><html><body><script>
function render(){}
function drawPills(){}
function drawIntentRail(){}
function applyCatsToGlobal(){}
function setUiLang(l){}
const CATS = {};
let catOrder = [];
</script></body></html>`;
const monolith = join(root, 'monolith.html');
writeFileSync(monolith, MONOLITH);
check('0 the name list comes off the monolith', engineNames(monolith).size === 7,
  'names=' + [...engineNames(monolith)].join(','));

function tree(label, files) {
  const dir = join(root, label);
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return { dir, entry: join(dir, 'main.js'), files: readdirSync(dir).map(f => join(dir, f)) };
}

const RENDER = `export function render(){ return 1; }
export function drawPills(){ return 2; }
export function drawIntentRail(){ return 3; }
export function applyCatsToGlobal(){ return 4; }
`;

// ---------------------------------------------------------------------------------------
// 1. The sound tree. If this is not clean the guard is noise and nothing below means anything.
const sound = tree('sound', {
  'render.js': RENDER,
  'lang.js': `import { render, drawPills, drawIntentRail, applyCatsToGlobal } from "./render.js";
export function applyUiLang(){
  if (typeof applyCatsToGlobal === "function") applyCatsToGlobal();
  if (typeof drawIntentRail === "function") drawIntentRail();
  if (typeof drawPills === "function") drawPills();
  if (typeof render === "function") render();
  const shadow = (render) => render + 1;   /* a parameter, not the import */
  return shadow(1);
}
`,
  'main.js': `import { applyUiLang } from "./lang.js";\nglobalThis.go = applyUiLang;\n`,
});
{
  const r = await guard({ entry: sound.entry, monolith });
  check('1 the sound tree is clean', r.findings.length === 0,
    r.findings.map(f => f.module + ':' + f.name).join(' '));
  check('2 and a parameter of the same name is not mistaken for a free reference',
    !r.findings.some(f => f.name === 'render'));
}

// ---------------------------------------------------------------------------------------
// 2. The failure the engine actually carries: the import is forgotten and every use of the
// name is behind a typeof guard, so nothing throws at runtime and nothing is logged at build.
const forgotten = tree('forgotten-guarded', {
  'render.js': RENDER,
  'lang.js': `import { render, drawIntentRail, applyCatsToGlobal } from "./render.js";
export function applyUiLang(){
  if (typeof applyCatsToGlobal === "function") applyCatsToGlobal();
  if (typeof drawIntentRail === "function") drawIntentRail();
  if (typeof drawPills === "function") drawPills();      /* forgotten */
  if (typeof render === "function") render();
}
`,
  'main.js': `import { applyUiLang } from "./lang.js";\nglobalThis.go = applyUiLang;\n`,
});
{
  const r = await guard({ entry: forgotten.entry, monolith });
  const f = r.findings.find(x => x.name === 'drawPills');
  check('3 a forgotten import behind a typeof guard is rejected', !!f, JSON.stringify(r.findings));
  check('4 exactly that one name, and no other', r.findings.length === 1,
    r.findings.map(x => x.name).join(','));
  check('5 the module that lost it is named', !!f && /lang\.js$/.test(f.module), f && f.module);
  check('6 and the guard says the failure is a silent one', !!f && f.guarded === true);
}

// ---------------------------------------------------------------------------------------
// 3. Two names forgotten in two different modules, to prove attribution is per module rather
// than per bundle.
const two = tree('two-modules', {
  'render.js': RENDER,
  'lang.js': `export function applyUiLang(){ if (typeof drawPills === "function") drawPills(); }\n`,
  'tabs.js': `export function drawTabsish(){ if (typeof drawIntentRail === "function") drawIntentRail(); }\n`,
  'main.js': `import { applyUiLang } from "./lang.js";\nimport { drawTabsish } from "./tabs.js";\nglobalThis.go = [applyUiLang, drawTabsish];\n`,
});
{
  const r = await guard({ entry: two.entry, monolith });
  const byMod = Object.fromEntries(r.findings.map(x => [x.name, x.module.replace(/\\/g, '/').split('/').pop()]));
  check('7 both losses are found and attributed to their own module',
    byMod.drawPills === 'lang.js' && byMod.drawIntentRail === 'tabs.js', JSON.stringify(byMod));
}

// ---------------------------------------------------------------------------------------
// 4. An unguarded forgotten import. It throws at runtime, so it is the loud half of the
// class - but only on a path something walks, and the gate should not need the path.
const plain = tree('forgotten-plain', {
  'render.js': RENDER,
  'lang.js': `export function applyUiLang(){ drawPills(); }\n`,
  'main.js': `import { applyUiLang } from "./lang.js";\nglobalThis.go = applyUiLang;\n`,
});
{
  const r = await guard({ entry: plain.entry, monolith });
  const f = r.findings.find(x => x.name === 'drawPills');
  check('8 an unguarded forgotten import is rejected too', !!f);
  check('9 and is not reported as a silent one', !!f && f.guarded === false);
}

// ---------------------------------------------------------------------------------------
// 5. The name reached through window. No scope analyser can resolve a string, so this is a
// separate rule and it is a ban rather than a measurement.
const viaWindow = tree('via-window', {
  'render.js': RENDER,
  'lang.js': `export function applyUiLang(){
  ["drawPills","render"].forEach(fn => { if (typeof window[fn] === "function") window[fn](); });
}
`,
  'main.js': `import { applyUiLang } from "./lang.js";\nglobalThis.go = applyUiLang;\n`,
});
{
  const r = await guard({ entry: viaWindow.entry, monolith });
  check('10 the bundler cannot see a name reached through window, as expected',
    r.findings.length === 0, 'findings=' + r.findings.length);
  const w = windowLookups(viaWindow.files);
  check('11 so the second rule catches it instead', w.length === 1 && w[0].kind === 'dynamic',
    JSON.stringify(w.map(x => x.line)));
  check('12 and the sound tree trips no such rule', windowLookups(sound.files).length === 0);
}

// ---------------------------------------------------------------------------------------
// 6. The silent repair of a cross-boundary write: re-declare the name locally. esbuild is
// happy, nothing throws, and the real binding never changes.
const shadow = tree('shadowed', {
  'state.js': `export let catOrder = ["a"];\nexport function get(){ return catOrder; }\n`,
  'cats.js': `let catOrder = ["a"];\nimport { get } from "./state.js";\nexport function reorder(){ catOrder = ["b"]; return [catOrder, get()]; }\n`,
  'main.js': `import { reorder } from "./cats.js";\nglobalThis.go = reorder;\n`,
});
{
  const s = shadowedBindings(shadow.files);
  const d = s.dupes.find(x => x.name === 'catOrder');
  check('13 a name declared at the top level of two modules is reported', !!d,
    JSON.stringify(s.dupes.map(x => x.name)));
  check('14 and the sound tree has no such pair',
    shadowedBindings(sound.files).dupes.length === 0,
    JSON.stringify(shadowedBindings(sound.files).dupes.map(x => x.name)));
}

// ---------------------------------------------------------------------------------------
// 7. The other silent repair: route the write through globalThis.
const viaGlobal = tree('via-global', {
  'state.js': `export let catOrder = ["a"];\n`,
  'cats.js': `export function reorder(){ globalThis.catOrder = ["b"]; }\n`,
  'main.js': `import { reorder } from "./cats.js";\nglobalThis.go = reorder;\n`,
});
{
  const s = shadowedBindings(viaGlobal.files);
  check('15 a write routed through globalThis is reported',
    s.globalWrites.some(w => w.name === 'catOrder'), JSON.stringify(s.globalWrites.map(w => w.name)));
  // The sound tree is not clean of this rule and saying it was would be a lie: its entry
  // assigns `globalThis.go` on purpose. The rule reports writes; deciding which are wanted is
  // a reading, so what is asserted is the count and the name, not innocence.
  const sw = shadowedBindings(sound.files).globalWrites;
  check('16 the rule reports the sound tree\'s one deliberate global write and no other',
    sw.length === 1 && sw[0].name === 'go', JSON.stringify(sw.map(w => w.name)));
}

// ---------------------------------------------------------------------------------------
// 8. The allowlist has to work, or the gate will be turned off rather than narrowed.
{
  const r = await guard({ entry: forgotten.entry, monolith, extraAllow: ['drawPills'] });
  check('17 an allowlisted name is not a finding', r.findings.length === 0);
}

// ---------------------------------------------------------------------------------------
// 9. The command line, which the cases above go around. Every rule here is a count, so an
// empty file set makes all three read zero and the run exit 0 - a pass that means only that
// nothing was opened. That green reached a report, so the refusal is now a case.
{
  const cli = join(dirname(fileURLToPath(import.meta.url)), 'guard.mjs');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

  const bare = run('--scan');
  check('18 --scan with no files refuses instead of reporting', bare.status === 78,
    'exit ' + bare.status);
  check('19 the refusal prints no tally to be read as a verdict',
    !/dynamic global lookups/.test(bare.stdout + bare.stderr),
    JSON.stringify((bare.stdout + bare.stderr).trim().split('\n')[0]));

  const clean = join(root, 'cli-clean.js');
  writeFileSync(clean, 'function render(){}\n');
  const ok = run('--scan', clean);
  check('20 --scan with a clean file reports over it and exits 0',
    ok.status === 0 && /over 1 files/.test(ok.stdout),
    'exit ' + ok.status + ' ' + JSON.stringify(ok.stdout.trim().split('\n').pop()));

  const bad = join(root, 'cli-window.js');
  writeFileSync(bad, 'function go(fn){ window[fn](); }\n');
  const hit = run('--scan', bad);
  check('21 --scan names a window lookup and exits on it',
    hit.status === 1 && /indexes a global object/.test(hit.stdout),
    'exit ' + hit.status + ' ' + JSON.stringify(hit.stdout.trim().split('\n')[0]));
}

// ---------------------------------------------------------------------------------------
// 10. The partition. Not every free reference is a fault, and for as long as the monolith
// exists most of them are not: `src/monolith.js` is spliced into the same <script> as the
// bundle's iife and at its top level, so a name it still declares is on the scope chain of
// every module. The day that name moves into a module it is not, and the reference that has
// been fine all along becomes a forgotten import. The two look identical to the sentinel and
// have to be told apart by where the name is declared, or a gate that says 17 every night
// cannot say the eighteenth line is the one that matters.
const MONO2 = `<!doctype html><html><body><script>
function stillHere(){ return 1; }
function alsoHere(){ return 2; }
const E_EASEish = "x";
</script></body></html>`;
const monolith2 = join(root, 'monolith2.html');
writeFileSync(monolith2, MONO2);

// 10a. The benign half: the name is used free and is still declared in the monolith.
const benign = tree('benign-monolith', {
  'blocks.js': `export function draw(){ return stillHere(); }\n`,
  'main.js': `import { draw } from "./blocks.js";\nglobalThis.go = draw;\n`,
});
{
  const r = await guard({ entry: benign.entry, monolith: monolith2 });
  const f = r.findings.find(x => x.name === 'stillHere');
  check('22 a name still declared in the monolith is seen', !!f,
    JSON.stringify(r.findings.map(x => x.name)));
  check('23 and is a note rather than a failure', !!f && f.verdict === 'note', f && f.verdict);
  check('24 so the run has nothing to fail on', r.failures === 0 && r.notes === 1,
    'failures=' + r.failures + ' notes=' + r.notes);
}

// 10b. The broken half: the same reference, after the name has moved into a module that this
// module does not import. Nothing about the referencing line changed.
const moved = tree('moved-to-module', {
  'esc.js': `export function stillHere(){ return 1; }\n`,
  'blocks.js': `export function draw(){ return stillHere(); }\n`,
  'main.js': `import { draw } from "./blocks.js";\nimport * as esc from "./esc.js";\nObject.assign(globalThis, esc);\nglobalThis.go = draw;\n`,
});
{
  const r = await guard({ entry: moved.entry, monolith: monolith2 });
  const f = r.findings.find(x => x.name === 'stillHere');
  check('25 the same reference, after the name moves into a module, is a failure',
    !!f && f.verdict === 'fail', f && f.verdict);
  check('26 and the module that now holds the name is named in the finding',
    !!f && /esc\.js/.test(f.why), f && f.why);
  check('27 the run fails on it', r.failures === 1 && r.notes === 0,
    'failures=' + r.failures + ' notes=' + r.notes);
}

// 10c. Both in one tree, because a gate that can only do one at a time would have passed
// every night this one did.
const mixed = tree('mixed', {
  'esc.js': `export function alsoHere(){ return 2; }\n`,
  'blocks.js': `export function draw(){ return stillHere() + alsoHere(); }\n`,
  'main.js': `import { draw } from "./blocks.js";\nimport * as esc from "./esc.js";\nObject.assign(globalThis, esc);\nglobalThis.go = draw;\n`,
});
{
  const r = await guard({ entry: mixed.entry, monolith: monolith2 });
  check('28 a tree carrying one of each is split, not summed',
    r.failures === 1 && r.notes === 1 && r.findings.length === 2,
    JSON.stringify(r.findings.map(x => x.name + ':' + x.verdict)));
}

// 10e. The hole that `treeShaking: false` closes, 2026-09-13. The guard reads its sentinels out
// of esbuild's OUTPUT, and esbuild removes a function declaration nothing references before any
// of that output exists. So a forgotten import inside a function nothing calls was invisible:
// measured on a lab copy of the engine at `6bcecc1`, a module calling another module's
// `openCardEditor` from a dead function returned `ok  no module uses a name it cannot reach`,
// exit 0. This case fails the moment that option is dropped, which is the only thing holding it.
const dead = tree('dead-function', {
  'esc.js': `export function alsoHere(){ return 2; }\n`,
  'blocks.js': `function neverCalled(){ return alsoHere(); }\nexport function draw(){ return 1; }\n`,
  'main.js': `import { draw } from "./blocks.js";\nimport * as esc from "./esc.js";\nObject.assign(globalThis, esc);\nglobalThis.go = draw;\n`,
});
{
  const r = await guard({ entry: dead.entry, monolith: monolith2 });
  const f = r.findings.find(x => x.name === 'alsoHere');
  check('34 a forgotten import inside a function nothing calls is still found',
    !!f && f.verdict === 'fail', JSON.stringify(r.findings.map(x => x.name + ':' + x.verdict)));
  check('35 and it is attributed to the module that holds the dead function',
    !!f && /blocks\.js/.test(f.module), f && f.module);
}

// 10d. The command line is where the number is read, and the exit code is the whole point:
// notes must not colour it and a failure must.
{
  const cli = join(dirname(fileURLToPath(import.meta.url)), 'guard.mjs');
  const run = t => spawnSync(process.execPath, [cli, '--entry', t.entry, '--names', monolith2],
    { encoding: 'utf8' });

  const b = run(benign);
  check('29 notes alone exit 0', b.status === 0, 'exit ' + b.status);
  check('30 and the note is printed rather than swallowed', /note/.test(b.stdout),
    JSON.stringify(b.stdout.trim().split('\n').slice(-2)));

  const m = run(moved);
  check('31 one failure exits 1', m.status === 1, 'exit ' + m.status);
  check('32 and the last line leads with the verdict, not with a count',
    /^\s*(FAIL|ok)\b/.test(m.stdout.trim().split('\n').pop()),
    JSON.stringify(m.stdout.trim().split('\n').pop()));

  const x = run(mixed);
  check('33 a mixed tree exits on its failures alone', x.status === 1, 'exit ' + x.status);
}

// ---------------------------------------------------------------------------------------
// 10f. The census, and the line that declares more than one name. Until 2026-09-13 every name
// rule in the guard took the identifier after `const`, `let` or `var` and stopped, so
// `let counts={}, cardCounts={};` contributed one name of two and the other was defined to no
// sentinel at all, in the monolith half and the module half alike. Measured on a lab copy of
// `88e3a1e` with that very line moved into `src/modules/card-model.js`: the old guard printed
// `934 names (218 in the monolith, 716 over 53 module files)` and
// `ok  no module uses a name it cannot reach, 337 pairs resolving in the monolith, over 1105
// references`, exit 0, for the sound tree AND for the broken one - the same two lines to the
// byte, while `editors.js` and `manage.js` were reading a name they could no longer reach. The
// repaired guard exits 2 there and names both. These cases are that control in miniature.
const MULTI = `<!doctype html><html><body><script>
let counts={}, cardCounts={};
const $=s=>document.querySelector(s), list=$("#list"), pax=$("#pax"),
      agentEl=$("#agent");
const SEP=",", RE=/a,b/g, CALL=fn(1,2), TAIL=3;   // a, b, c
function recount(){}
</script></body></html>`;
const monolith3 = join(root, 'monolith3.html');
writeFileSync(monolith3, MULTI);
const monolith4 = join(root, 'monolith4.html');
writeFileSync(monolith4, MULTI.replace('let counts={}, cardCounts={};\n', ''));
{
  const n = engineNames(monolith3);
  const want = ['counts', 'cardCounts', '$', 'list', 'pax', 'agentEl', 'SEP', 'RE', 'CALL', 'TAIL', 'recount'];
  check('36 every declarator of a line is a name, not only the first',
    want.every(x => n.has(x)), 'missing ' + want.filter(x => !n.has(x)).join(',') || '');
  check('37 including one whose declaration runs onto the next line', n.has('agentEl'),
    [...n].join(','));
  check('38 and a comma inside a string, a regular expression, a call or a comment declares nothing',
    n.size === want.length, 'size=' + n.size + ' [' + [...n].join(',') + ']');
}

// The separating pair: the same reference, before and after the line moves. Under the old
// census neither of these produced a finding at all.
const stays = tree('later-declarator-in-monolith', {
  'blocks.js': `export function draw(){ return cardCounts["k"]; }\n`,
  'main.js': `import { draw } from "./blocks.js";\nglobalThis.go = draw;\n`,
});
{
  const r = await guard({ entry: stays.entry, monolith: monolith3 });
  const f = r.findings.find(x => x.name === 'cardCounts');
  check('39 a later declarator still in the monolith is a note rather than silence',
    !!f && f.verdict === 'note' && r.failures === 0,
    JSON.stringify(r.findings.map(x => x.name + ':' + x.verdict)));
}
const movedLine = tree('later-declarator-moved', {
  'counts.js': `export let counts = {}, cardCounts = {};\n`,
  'blocks.js': `export function draw(){ return cardCounts["k"]; }\n`,
  'main.js': `import { draw } from "./blocks.js";\nimport * as c from "./counts.js";\nObject.assign(globalThis, c);\nglobalThis.go = draw;\n`,
});
{
  const r = await guard({ entry: movedLine.entry, monolith: monolith4 });
  const f = r.findings.find(x => x.name === 'cardCounts');
  check('40 and the day that line moves into a module it is a failure',
    !!f && f.verdict === 'fail', JSON.stringify(r.findings.map(x => x.name + ':' + x.verdict)));
  check('41 named to the module that now holds it, which the module census also had to see',
    !!f && /counts\.js/.test(f.why), f && f.why);
  check('42 and the run exits on it', r.failures === 1, 'failures=' + r.failures);
}

// ---------------------------------------------------------------------------------------
// 11. THE GATE VOUCHING FOR ITSELF. Added 2026-09-14, after a control on the live tree.
//
// Every case above hands the guard a tree it should reject. None of them asks whether the guard
// can still see, and while the monolith existed nothing had to: the pass line carried `over 1151
// references`, so a run that had read nothing could not have printed it. The monolith went on
// 2026-09-14, the partition emptied, and a sound tree now yields no sentinel at all. Measured at
// that commit: with the define loop deleted outright - the gate gutted - guard.mjs printed
// BYTE-IDENTICAL lines to the sound run, the bundle size included, and exited 0. The canary is
// the repair and these cases are its teeth.
{
  const spelt = await canary({ zzz: '__PB_UNBOUND_zzz' });
  check('43 the canary comes back when the define carries the sentinel spelling',
    spelt.name === 'zzz' && spelt.seen === 1, JSON.stringify(spelt));
  // The control, so 43 is not a case that would pass on anything at all.
  const wrong = await canary({ zzz: '1' });
  check('44 and does not when the define carries something else - so 43 has teeth',
    wrong.seen === 0, JSON.stringify(wrong));
}
{
  /* A gutted guard, run as a command, because the refusal is a property of the CLI rather than of
     the function. The copy lives in the temp folder and not beside the original - a stray file in
     tools/ is one crash away from a commit - so its bare specifier for esbuild is rewritten to the
     absolute URL this process has already resolved. */
  const cliSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'guard.mjs'), 'utf8');
  const defineLoop = '  for (const n of names) define[n] = SENTINEL + n;';
  check('45 the define loop is where a gutting would land, and it is still one line',
    cliSrc.split(defineLoop).length - 1 === 1, String(cliSrc.split(defineLoop).length - 1));
  const gutted = join(root, 'guard-nodefine.mjs');
  writeFileSync(gutted, cliSrc
    .split('from "esbuild"'.split(String.fromCharCode(34)).join(String.fromCharCode(39)))
    .join('from ' + JSON.stringify(import.meta.resolve('esbuild')))
    .split(defineLoop).join('  // GUTTED BY THE SELFTEST: the gate defines nothing'));
  const out = spawnSync(process.execPath, [gutted, '--entry', sound.entry], { encoding: 'utf8' });
  check('46 a guard that defines nothing refuses with 78 rather than passing',
    out.status === 78, 'exit ' + out.status);
  check('47 and says so in a line a reader can act on',
    /did not answer its own canary/.test(out.stdout) && /SUITE DID NOT COMPLETE/.test(out.stdout),
    JSON.stringify((out.stdout + out.stderr).trim().split(String.fromCharCode(10))[0]));
}

// ---------------------------------------------------------------------------------------
// 12. NO NAME FILE, which is the tree as it stands since the monolith went. Until 2026-09-14 the
// CLI refused without one and guard() was never called without one, so the whole mode arrived
// uncovered: a throw planted in its branch left this file at 43/43 and exit 0, measured.
{
  const clean = await guard({ entry: sound.entry });
  check('48 with no name file a sound tree is still clean, and the canary still answered',
    clean.failures === 0 && clean.findings.length === 0 && !!clean.canary,
    'failures=' + clean.failures + ' canary=' + clean.canary);
  const lost = await guard({ entry: forgotten.entry });
  const f = lost.findings.find(x => x.name === 'drawPills');
  check('49 and a forgotten import is still a failure - so the mode has teeth',
    !!f && f.verdict === 'fail' && lost.failures === 1,
    JSON.stringify(lost.findings.map(x => x.name + ':' + x.verdict)));
  /* WHAT THE MODE ACTUALLY MEANS, and it is not what "every free reference is a failure" says.
     The sentinel can only see a name it defined, and with no name file the defined set is the
     module top levels alone. A name declared nowhere in the tree is therefore INVISIBLE rather
     than loud - the same blind spot the header has always named, now reaching every name the
     monolith used to hold. It costs nothing today because those names left with the file, and it
     is written here so the next reader does not have to rediscover it. */
  const gone = await guard({ entry: benign.entry });
  check('50 while a name held outside every module is invisible rather than a failure',
    gone.findings.length === 0 && gone.failures === 0 && gone.notes === 0,
    JSON.stringify(gone.findings.map(x => x.name)));
}
{
  const cli = join(dirname(fileURLToPath(import.meta.url)), 'guard.mjs');
  const none = spawnSync(process.execPath, [cli, '--entry', sound.entry], { encoding: 'utf8' });
  check('51 the command line with no --names exits 0 and says there is no name file',
    none.status === 0 && /no name file, so nothing can resolve outside a module/.test(none.stdout),
    'exit ' + none.status + ' ' + JSON.stringify(none.stdout.trim().split(String.fromCharCode(10)).pop()));
  check('52 and the canary it came back with is on the line a reader sees',
    /canary .* came back/.test(none.stdout),
    JSON.stringify(none.stdout.trim().split(String.fromCharCode(10))[0]));
  const absent = spawnSync(process.execPath,
    [cli, '--entry', sound.entry, '--names', join(root, 'no-such-file.html')], { encoding: 'utf8' });
  check('53 but a --names that was asked for and is not there is still a refusal, 78',
    absent.status === 78 && /no name file at /.test(absent.stderr + absent.stdout),
    'exit ' + absent.status);
}

rmSync(root, { recursive: true, force: true });
console.log('  ' + pass + '/' + (pass + fail) + ' checks passed' + (fail ? '  - ' + fail + ' FAILED' : ''));
/* CAPPED AT 63, ballot 4 of the fourth meeting (2026-09-23): an exit code is read modulo 256 by
   bash and by Linux, so a count used as one read 256 failures as success. 63 keeps a small count
   readable and stays below 78, which is NO VERDICT here. */
process.exitCode = Math.min(fail, 63);
