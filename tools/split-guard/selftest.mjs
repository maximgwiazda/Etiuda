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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { guard, windowLookups, shadowedBindings, engineNames } from './guard.mjs';

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

rmSync(root, { recursive: true, force: true });
console.log('  ' + pass + '/' + (pass + fail) + ' checks passed' + (fail ? '  - ' + fail + ' FAILED' : ''));
process.exitCode = fail;
