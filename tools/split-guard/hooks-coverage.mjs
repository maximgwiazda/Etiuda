// Is a hook slot ever CALLED? Board 341.
//
// hooks-guard.mjs proves the contract holds on paper: every slot declared is filled, every
// lookup names a slot. It cannot prove a slot is ever reached, because a call through the valve
// is not an import and no static graph has it. A slot wired and never called would be frozen,
// silent and green at every gate in this repository.
//
// So this one runs the acceptance suite with the valve wrapped in counters and reads them back.
// The instrument is tests/smoke.js's opt-in block, which stands in front of Object.freeze:
// wireHooks freezes as its last act, so that is the one place a driver reaches every slot
// without a line of src/ changing.
//
//   ETIUDA_FIXTURES=<folder> node tools/split-guard/hooks-coverage.mjs         the 149 checks
//   ETIUDA_FIXTURES=<folder> node tools/split-guard/hooks-coverage.mjs boot    boot only
//   ... --save <file>    keep the counts
//   node tools/split-guard/hooks-coverage.mjs --from <file>    re-read counts, no browser
//
// --from is how the verdict half of this file is controlled without paying two minutes for a
// browser each time: the same counts, the list edited, and the leg has to change its mind.
//
// The second is the CONTROL, not a shortcut: a counter that is not really counting reports the
// same set under both, and a counter that is reports strictly more unreached slots under a run
// that drives nothing. Run it when the number below is ever in doubt.
//
// Exit 0 clean, 1 a slot outside the list below went unreached or a listed one was reached,
// 3 the run could not be read, which is not a pass.
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { slotsOf } from './hooks-guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const NL = String.fromCharCode(10);

/* THE DEBT LIST, measured 2026-09-14 against smoke at 149 checks: 38 of the 54 slots were
   called and these 16 were not. Each line names the only place in src/ that reaches the slot,
   so that the reader can see what is not being driven rather than take the word "acceptable"
   for it. None of these is acceptable in the sense of being fine; they are the surfaces the
   acceptance run does not touch, and closing them is work on smoke.js rather than on this file.

   It is a ratchet in both directions. A slot that starts being reached must come off the list,
   and a slot that stops being reached is a FAIL until somebody writes its line here. An empty
   reason is not a reason. */
const UNREACHED_OK = new Map([
  ['importCatalogHere', 'render.js:128, the empty screen\'s Import button. The run clicks the sample button beside it; Import opens the file picker, which a headless driver cannot answer'],
  ['mgCardsIn', 'card-editor.js:584, inside the Manage dialog. The run opens Manage and does not take this branch'],
  ['openCategoryEditor', 'pills-bar.js:82, the category pill\'s own menu'],
  ['openIntentEditor', 'rail-list.js:488 and :643, the intent rail row\'s edit route'],
  ['setIntentHidden', 'rail-list.js:654, the intent rail row\'s menu'],
  ['toggleIntentFavourite', 'rail-list.js:653, the same menu. The run drives the star from the card, which is a different route to the same idea'],
  ['ensureCustomCat', 'pills-bar.js:158'],
  ['clearSearchQuery', 'escape-ladder.js:31, one rung of the Escape ladder the run never stands on'],
  ['startTour', 'header-menus.js:29. The run drives the tour by calling the global startTour() at smoke.js:220, so the menu item is what goes untested, not the tour'],
  ['endTour', 'header-menus.js:65, the same menu, and the same reason'],
  ['railDecorate', 'mark.js:35, :93 and :96, the keyboard mark moving over the rail'],
  ['listEntryEls', 'mark.js:76, the same keyboard path'],
  ['deleteCustomCard', 'list-pointer.js:353'],
  ['capturePills', 'paint.js:110, inside the pill drag\'s pointermove'],
  ['shedAnimate', 'tabs.js:746, the header shed\'s animation'],
  ['shedHolding', 'tabs.js:643, the shed\'s re-entrancy question'],
]);

function readCoverage(argv, env) {
  const out = join(mkdtempSync(join(tmpdir(), 'hookcov-')), 'hits.json');
  const r = spawnSync(process.execPath, argv, {
    cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, env, { ETIUDA_HOOK_COVERAGE: out }),
  });
  const log = (r.stdout || '') + (r.stderr || '');
  if (!existsSync(out)) return { why: 'the run wrote no coverage file', status: r.status, log };
  const data = JSON.parse(readFileSync(out, 'utf8'));
  try { rmSync(dirname(out), { recursive: true, force: true }); } catch (e) {}
  return { data, status: r.status, log };
}

const mode = (process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : 'smoke').toLowerCase();
const slots = slotsOf(readFileSync(join(REPO, 'src', 'modules', 'hooks.js'), 'utf8')).slots;
if (!slots.length) { console.log('split-guard hooks-coverage  CANNOT SEE: no SLOTS'); process.exit(3); }

const flag = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const from = flag('--from');
const save = flag('--save');
const argv = mode === 'boot'
  ? [join(HERE, 'hooks-coverage-boot.mjs')]
  : [join(REPO, 'tests', 'smoke.js')];
const got = from
  ? { data: JSON.parse(readFileSync(from, 'utf8')), status: 0, log: 'read from ' + from }
  : readCoverage(argv, {});
if (save && got.data) writeFileSync(save, JSON.stringify(got.data));
if (got.why) {
  console.log('split-guard hooks-coverage  CANNOT SEE: ' + got.why + ' (exit ' + got.status + ')');
  console.log(got.log.split(NL).slice(-12).join(NL));
  process.exit(3);
}

const { wrapped, hits } = got.data;
// The identification control: the object the driver wrapped must BE the valve, and the only
// evidence of that available on this side is that its keys are exactly SLOTS. Anything else and
// the counters are counting something we have not named.
const extra = wrapped.filter(k => slots.indexOf(k) < 0);
const missing = slots.filter(k => wrapped.indexOf(k) < 0);
if (extra.length || missing.length) {
  console.log('split-guard hooks-coverage  CANNOT SEE: the wrapped object is not the valve - '
    + wrapped.length + ' keys wrapped, ' + extra.length + ' not in SLOTS, ' + missing.length + ' slots not wrapped');
  process.exit(3);
}

const reached = slots.filter(k => (hits[k] || 0) > 0);
const unreached = slots.filter(k => !(hits[k] > 0));
const calls = Object.keys(hits).reduce((n, k) => n + hits[k], 0);
console.log('split-guard hooks-coverage  ' + mode + ': ' + reached.length + ' of ' + slots.length
  + ' slot(s) called, ' + calls + ' call(s), the run exited ' + got.status);
// The child's own account of what it drained, carried through: a drain that got nothing is the
// one way this leg reports a clean sheet it never read.
for (const L of got.log.split(NL)) if (L.indexOf('hook coverage') >= 0) console.log('  ' + L.trim());

if (mode === 'boot') {
  console.log('  ' + unreached.length + ' unreached under boot alone: ' + unreached.join(' '));
  console.log('  This mode is the control for the other one. It asserts nothing.');
  process.exit(0);
}

let failed = 0;
for (const k of unreached) {
  if (UNREACHED_OK.has(k)) console.log('  note  ' + k + ' is not reached: ' + UNREACHED_OK.get(k));
  else { console.log('  FAIL  slot ' + k + ' is wired at boot and nothing in the acceptance run calls it'); failed++; }
}
for (const k of reached) {
  if (UNREACHED_OK.has(k)) { console.log('  FAIL  slot ' + k + ' is listed as unreachable and the run called it ' + hits[k] + ' time(s); take it off the list'); failed++; }
}
if (!failed) console.log('  ok    no slot went unreached but the ' + UNREACHED_OK.size
  + ' on the debt list above, which is a ratchet holding and not a clean sheet: '
  + reached.length + ' of ' + slots.length + ' slots are exercised');
const busiest = slots.slice().sort((a, b) => (hits[b] || 0) - (hits[a] || 0)).slice(0, 5);
console.log('  note  busiest: ' + busiest.map(k => k + ' ' + (hits[k] || 0)).join(', '));
if (got.status !== 0) { console.log('  the run itself exited ' + got.status + ', so this coverage is of a run that did not pass'); process.exit(3); }
process.exit(failed ? 1 : 0);
