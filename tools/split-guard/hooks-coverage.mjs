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
//   ETIUDA_FIXTURES=<folder> node tools/split-guard/hooks-coverage.mjs         the whole run
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
// Exit 0 clean, 1 a slot outside the list below went unreached, or a listed one was reached, or
// the list names something SLOTS does not declare at all, 3 the run could not be read, which is
// not a pass.
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

/* THE DEBT LIST. Each line names the only place in src/ that reaches the slot, so that the
   reader can see what is not being driven rather than take the word "acceptable" for it, and an
   empty reason is not a reason.

   It is a ratchet in THREE directions. A slot that starts being reached must come off the list;
   a slot that stops being reached is a FAIL until somebody writes its line here; and a name on
   the list that SLOTS does not declare is a FAIL too, refused before the run by the check below.

   2026-09-14, board 341: 38 of 54 reached, 16 listed. Every one of those 16 was reachable by a
   hand and unreached only because tests/smoke.js drove the FEATURE through a global while the
   route through the valve stayed dead - the tour started by calling startTour() rather than by
   pressing the menu item is the case that names the shape.

   2026-09-14, board 344: smoke's drives were rerouted through the paths a person takes and the
   list fell from 16 to 1.

   2026-09-14, boards 346 and 347: the one left named deleteCustomCard, a route dead in the
   engine rather than undriven, and the lead engineer dropped the branch, the slot, the wiring
   and the function. The entry outlived its slot by four commits, and while it did, no branch
   below ever consulted it: nothing was excused, nothing could fail on it, and the ok line went
   on reporting a debt of 1 that did not exist. A verdict that cannot be wrong is not a verdict,
   which is why the staleness check exists and why this list is now EMPTY. An empty debt list is
   the only state in which the ok line below is a clean sheet, and it says so in those words. */
const UNREACHED_OK = new Map([]);

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

/* THE DEBT LIST IS CHECKED AGAINST SLOTS BEFORE ANY RUN, because it is a claim about
   src/modules/hooks.js and needs no browser to be wrong. A name here that SLOTS does not declare
   is invisible to every branch further down: it is never in `unreached`, never in `reached`, so
   it can neither excuse anything nor fail on anything, and the only trace of it left is the ok
   line counting it as debt that is not there. That is the failure this file was written to
   refuse, met in the file itself. Refused here, and exit 1 rather than 3, because the leg can
   see perfectly well - it is the list that is wrong. */
const stale = Array.from(UNREACHED_OK.keys()).filter(k => slots.indexOf(k) < 0);
if (stale.length) {
  console.log('split-guard hooks-coverage  ' + mode + ': REFUSED before the run - '
    + stale.length + ' name(s) on the debt list are not slots');
  for (const k of stale) console.log('  FAIL  ' + k + ' is on the debt list and SLOTS does not '
    + 'declare it, so it excuses nothing and nothing below consults it; take it off the list or '
    + 'put the slot back');
  console.log('  note  SLOTS declares ' + slots.length + ' name(s) in src/modules/hooks.js');
  process.exit(1);
}

const flag = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const from = flag('--from');
const save = flag('--save');
const argv = mode === 'boot'
  ? [join(HERE, 'hooks-coverage-boot.mjs')]
  : [join(REPO, 'tests', 'smoke.js')];
const got = from
  /* A saved file carries counts and nothing else, so this branch does not know how the run that
     wrote them ended and must not print a number as though it did: `status: null` reads back as
     "not known" in the line below, where `status: 0` said "it passed" about a run this process
     never saw. Found 2026-09-14 while controlling the leg against a planted tree. */
  ? { data: JSON.parse(readFileSync(from, 'utf8')), status: null, log: 'read from ' + from }
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
  + ' slot(s) called, ' + calls + ' call(s), '
  + (got.status === null ? 'from a saved file, so how that run ended is not known here'
                         : 'the run exited ' + got.status));
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
/* Two sentences, because one of them would be a lie in the other's state: with names on the list
   the run is a ratchet holding, and with the list empty it is a clean sheet. The wrong sentence
   printed over an empty list is what board 347 was. */
if (!failed) console.log('  ok    ' + (UNREACHED_OK.size
  ? 'no slot went unreached but the ' + UNREACHED_OK.size
    + ' on the debt list above, which is a ratchet holding and not a clean sheet: '
    + reached.length + ' of ' + slots.length + ' slots are exercised'
  : 'the debt list is empty and nothing is excused: all ' + reached.length + ' of '
    + slots.length + ' slots are reached by the acceptance run'));
const busiest = slots.slice().sort((a, b) => (hits[b] || 0) - (hits[a] || 0)).slice(0, 5);
console.log('  note  busiest: ' + busiest.map(k => k + ' ' + (hits[k] || 0)).join(', '));
if (got.status !== null && got.status !== 0) { console.log('  the run itself exited ' + got.status + ', so this coverage is of a run that did not pass'); process.exit(3); }
process.exit(failed ? 1 : 0);
