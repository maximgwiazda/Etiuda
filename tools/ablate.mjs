/* THE NO-OP ABLATION: does a gate move when the thing it claims to check stops working?
 *
 *   node tools/ablate.mjs baseline
 *   node tools/ablate.mjs one <module.js> [noop|identity]
 *   node tools/ablate.mjs sweep [--mode noop] [--modules a.js,b.js] [--chains test,split-guard]
 *
 * WHY. A gate that reports green is the easiest thing here to be lied to by. Ma, Kereopa-Yorke
 * and Schultz (arXiv:2606.28430, 26 Jun 2026) measured the sharp form: with a hidden 222-test
 * oracle in the loop, an agent's score reached 221/222 while the library it claimed to have
 * written was never called by the artefact, and no-oping the claimed implementation left the
 * score at 29/29 -> 29/29. The same no-op on a wired-in implementation broke 12 of 29. Their
 * control is mechanical and it is the one this file automates: REMOVE THE BEHAVIOUR AND RERUN.
 * A gate whose numbers do not move never measured the thing.
 *
 * WHAT IS ABLATED, AND WHY AT THE BINDING RATHER THAN IN THE BODY. Every module in src/modules
 * ends in one `export { ... }` block (98 of 98, measured). A function declaration creates a
 * MUTABLE binding, so appending `f = __ablNoop();` after that block replaces what every importer
 * and every internal caller reaches, while leaving the whole source text of the module byte for
 * byte intact. That is the sharp instrument: the behaviour is gone and every string a
 * source-reading leg could match is still there. tests/test.js reads src/ AS TEXT by design, so
 * a body deletion would redden it for the wrong reason and tell us nothing.
 *
 * WHAT IS NOT ABLATED. An export that is data, or a function held in a `const`, cannot be
 * reassigned; those are counted as `unablatable` and a module with none ablated has NO VERDICT
 * here rather than a green one. This is stated per module in the record, because a count without
 * its method is an impression.
 *
 * THE CONTROL, WHICH IS WHAT MAKES THIS A MEASUREMENT. `identity` appends the same number of
 * lines in the same place through `__ablId(f)`, which returns the same function object. The
 * artefact is rebuilt and the same chain is run. ANY GATE THAT REDDENS UNDER `identity` IS
 * READING THE SHAPE OF THE EDIT, NOT THE BEHAVIOUR, and its reddening under `noop` proves
 * nothing. Run the control before believing the sweep.
 *
 * THE TREE. A mutation is written, the artefact rebuilt, the chain run, and the three touched
 * paths restored with `git checkout --`, which restores TO HEAD: this file must be committed
 * before the sweep or the sweep deletes it. The run refuses to start on a dirty src/ or engine/,
 * and refuses to continue if a restore leaves anything behind. Records go OUTSIDE the tree,
 * beside gate-run's, because a record of a run is not part of the tree it judges.
 *
 * THE READING IS A SECOND IMPLEMENTATION. The steps come from package.json split on `&&`, the
 * same rule tools/gate-run.mjs uses, but the counting here is this file's own: `baseline`
 * prints its numbers so they can be read against a gate-run record of the same tree. Two tools
 * agreeing is the only reason to trust either.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(ROOT, 'src', 'modules');
const OUT = path.resolve(process.env.ETIUDA_ABLATE_OUT
  || path.join(ROOT, '..', 'etiuda-runs', 'ablate'));
const LOGS = path.join(OUT, 'logs');
const TOUCHED = ['src/modules/__NAME__', 'engine/etiuda.html', 'engine/etiuda.csp.json'];

function die(msg, how) {
  console.log('  FAIL ' + msg);
  if (how) console.log('       ' + how);
  process.exit(2);
}
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}
function dirty() {
  return git(['status', '--porcelain', '--', 'src', 'engine']).trim();
}

/* ------------------------------------------------------------------ the mutation */

const escRe = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EXPORT_RE = /\nexport \{([^}]*)\}\s*;?\s*$/;

/* Which exported names are function DECLARATIONS, which is the only kind whose binding can be
   reassigned from below. Everything else is reported rather than silently skipped. */
export function plan(src) {
  const m = src.match(EXPORT_RE);
  if (!m) return null;
  const names = m[1].split(',').map(x => x.trim()).filter(Boolean)
    .map(x => x.split(/\s+as\s+/)[0].trim());
  const fn = [], other = [];
  for (const n of names) {
    if (new RegExp('^(async )?function ' + escRe(n) + '\\b', 'm').test(src)) fn.push(n);
    else other.push(n);
  }
  return { names, fn, other };
}

/* THE TWO SHAM MODES ARE THE RIG'S OWN CONTROLS, and they exist to be refused. `sham-identical`
   edits the module in a way the bundler erases, so the artefact comes back byte for byte and the
   rig must say so rather than reporting a quiet "not noticed". `sham-unmarked` moves the artefact
   without leaving the marker in it. A rig whose two refusals have never fired has not been
   tested, it has been written, so both are runnable: `node tools/ablate.mjs one <m> sham-identical`
   must print RIG REFUSED, and the day it prints NOT NOTICED the liveness floor is gone. */
export function mutate(src, mode) {
  const p = plan(src);
  if (!p) return null;
  if (!p.fn.length) return null;
  if (/__abl(Noop|Id)\b/.test(src)) return null;      /* refuse a name collision rather than shadow one */
  if (mode === 'sham-identical')
    return { text: src.replace(/\s*$/, '\n') + '/* a comment the bundler drops */\n', plan: p };
  if (mode === 'sham-unmarked')
    return { text: src.replace(/\s*$/, '\n')
      + 'if (globalThis.__ablShamNeverTrue) { globalThis.__ablShamSink = ' + p.fn[0] + '; }\n', plan: p };
  const head = mode === 'identity'
    ? '/*ablate:identity*/ const __ablId = f => f;'
    : '/*ablate:noop*/ const __ablNoop = () => function () {};';
  const body = p.fn.map(n => mode === 'identity'
    ? n + ' = __ablId(' + n + ');'
    : n + ' = __ablNoop();');
  return { text: src.replace(/\s*$/, '\n') + head + '\n' + body.join('\n') + '\n', plan: p };
}

/* ------------------------------------------------------------------ running the chain */

function stepsOf(chains) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const out = [];
  for (const name of chains) {
    const cmd = pkg.scripts && pkg.scripts[name];
    if (!cmd) die('package.json has no script called ' + JSON.stringify(name));
    for (const raw of cmd.split('&&')) {
      const step = raw.trim();
      if (!step) continue;
      const m = /^node\s+(\S+)\s*(.*)$/.exec(step);
      if (!m) die('a step of ' + name + ' is not a node gate: ' + JSON.stringify(step),
        'this file will not skip a step it cannot read');
      if (/gate-run|ablate/.test(m[1])) die('a step would run a runner: ' + JSON.stringify(step));
      out.push({ chain: name, file: m[1], args: m[2] ? m[2].split(/\s+/) : [] });
    }
  }
  return out;
}

/* `  ok` and `  FAIL` are what every driver in tests/ prints per check; `  FAIL:` is how
   tests/test.js reports a section that threw. `#counts` is a gate naming its own numbers. */
function read(text, exit) {
  let ok = 0, fail = 0, lines = 0;
  const counts = {};
  for (const line of text.split('\n')) {
    lines++;
    if (/^ {2}ok\b/.test(line)) ok++;
    else if (/^ {2}FAIL[ :]/.test(line)) fail++;
    const c = /^#counts\s+(.*)$/.exec(line.trim());
    if (c) for (const kv of c[1].split(/\s+/)) {
      const i = kv.indexOf('=');
      if (i > 0) counts[kv.slice(0, i)] = kv.slice(i + 1);
    }
  }
  return { exit, ok, fail, lines, counts };
}

function runChain(steps, stopOnFail) {
  const env = { ...process.env, ETIUDA_FIXTURES: process.env.ETIUDA_FIXTURES || '' };
  const res = [];
  for (const s of steps) {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [s.file, ...s.args],
      { cwd: ROOT, encoding: 'utf8', env, timeout: 15 * 60 * 1000 });
    const text = (r.stdout || '') + (r.stderr || '');
    const exit = r.status === null ? -1 : r.status;
    /* THE WHOLE OUTPUT IS KEPT, not only four FAIL lines. A ten-minute case whose evidence is
       a tail cannot be read a second time, and the second reading is where the interesting
       question lives - which checks passed against a tree that can do nothing, and which phase
       a driver died in. One file per gate run, beside the record that names it. */
    const log = path.join(LOGS, s.file.replace(/[\\/]/g, '-').replace(/\.[^.]+$/, '')
      + '-' + new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '') + '.log');
    fs.mkdirSync(LOGS, { recursive: true });
    fs.writeFileSync(log, text, 'utf8');
    res.push({ gate: s.file, ...read(text, exit), ms: Date.now() - t0, log,
      tail: exit === 0 ? '' : text.split('\n').filter(l => /^ {2}FAIL[ :]/.test(l)).slice(0, 4).join(' | ')
        || text.trim().split('\n').slice(-3).join(' | ') });
    if (exit !== 0 && stopOnFail) break;
  }
  return res;
}

function build() {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs')],
    { cwd: ROOT, encoding: 'utf8' });
  return { exit: r.status === null ? -1 : r.status,
    text: ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-2).join(' | ') };
}

/* ------------------------------------------------------------------ one case */

function restore(rel) {
  const paths = TOUCHED.map(p => p.replace('__NAME__', rel));
  git(['checkout', '--', ...paths]);
  const left = dirty();
  if (left) die('the tree did not come back after ' + rel + ': ' + left.replace(/\n/g, ' ; '),
    'nothing further is run; restore by hand before trusting anything');
}

/* THE RIG'S OWN LIVENESS FLOOR. "The gates did not notice" is worthless unless the ablated
   code actually reached the artefact they judge. esbuild could tree-shake the reassignment,
   the build could write nothing, the mutation could land in a file nothing imports. So the
   artefact is hashed and searched for the marker, and a case whose artefact did not move, or
   does not carry the marker, is a REFUSAL rather than a quiet "not noticed". */
function artefact() {
  const f = path.join(ROOT, 'engine', 'etiuda.html');
  const b = fs.readFileSync(f);
  return { sha: crypto.createHash('sha256').update(b).digest('hex').slice(0, 16),
    bytes: b.length, marker: /__abl(Noop|Id)\b/.test(b.toString('utf8')) };
}

function oneCase(file, mode, steps, stopOnFail, baseSha) {
  const abs = path.join(MODULES, file);
  const src = fs.readFileSync(abs, 'utf8');
  const mut = mutate(src, mode);
  if (!mut) return { file, mode, skipped: 'no reassignable exported function declaration' };
  const p = mut.plan;
  fs.writeFileSync(abs, mut.text);
  let out;
  try {
    const b = build();
    const art = artefact();
    if (b.exit !== 0) out = { file, mode, buildFailed: b.text, ablated: p.fn.length,
      unablatable: p.other.length, artefact: art, gates: [] };
    /* The sha is asked FIRST and the marker second, because in that order each clause has a
       sham that kills it: sham-identical moves no bytes, sham-unmarked moves bytes and leaves
       no marker. Asked the other way round the marker answers both and the sha clause is
       decoration that could rot unseen. */
    else if (art.sha === baseSha || !art.marker)
      out = { file, mode, ablated: p.fn.length, unablatable: p.other.length, artefact: art,
        refused: art.sha === baseSha ? 'the built artefact is byte-identical to the unablated one'
          : 'the built artefact does not carry the ablation marker', gates: [] };
    else out = { file, mode, ablated: p.fn.length, unablatable: p.other.length, artefact: art,
      gates: runChain(steps, stopOnFail) };
  } finally {
    restore(file);
  }
  return out;
}

/* ------------------------------------------------------------------ the verdicts */

function compare(base, run) {
  /* A gate NOTICED if its exit moved off zero, or its ok/fail counts moved. A byte count moving
     is not noticing: every edit moves bytes and a byte is not the behaviour. */
  const noticed = [], quiet = [], notRun = [];
  const byGate = Object.fromEntries(base.map(g => [g.gate, g]));
  const seen = new Set();
  for (const g of run) {
    seen.add(g.gate);
    const b = byGate[g.gate];
    if (!b) { noticed.push({ gate: g.gate, why: 'not in the baseline' }); continue; }
    if (g.exit !== b.exit) noticed.push({ gate: g.gate, why: 'exit ' + b.exit + ' -> ' + g.exit, tail: g.tail });
    else if (g.fail !== b.fail) noticed.push({ gate: g.gate, why: 'fail ' + b.fail + ' -> ' + g.fail });
    else if (g.ok !== b.ok) noticed.push({ gate: g.gate, why: 'ok ' + b.ok + ' -> ' + g.ok });
    else quiet.push(g.gate);
  }
  for (const b of base) if (!seen.has(b.gate)) notRun.push(b.gate);
  return { noticed, quiet, notRun };
}

/* ------------------------------------------------------------------ commands */

/* Importable without running: `plan` and `mutate` are what the selftest drives, and a tool that
   starts a sweep on import is the mistake this seat already made once with a release script. */
const RUN_AS_MAIN = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

const argv = RUN_AS_MAIN ? process.argv.slice(2) : ['--not-main'];
const cmd = argv[0];
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const CHAINS = flag('chains', 'test,split-guard').split(',').filter(Boolean);
const STOP = argv.includes('--stop-on-fail');
if (RUN_AS_MAIN) fs.mkdirSync(OUT, { recursive: true });

function head() {
  const d = dirty();
  if (d) die('src/ or engine/ is dirty, so a restore would not come back to a known tree',
    d.replace(/\n/g, ' ; '));
  return { commit: git(['rev-parse', 'HEAD']).trim(), when: new Date().toISOString(),
    chains: CHAINS, node: process.version };
}

if (cmd === 'baseline') {
  const h = head();
  const steps = stepsOf(CHAINS);
  const t0 = Date.now();
  const gates = runChain(steps, false);
  const rec = { ...h, kind: 'baseline', seconds: Math.round((Date.now() - t0) / 1000),
    artefact: artefact(), gates };
  const f = path.join(OUT, 'baseline.json');
  fs.writeFileSync(f, JSON.stringify(rec, null, 1));
  const red = gates.filter(g => g.exit !== 0);
  console.log('#counts gates=' + gates.length + ' ok=' + gates.reduce((a, g) => a + g.ok, 0)
    + ' fail=' + gates.reduce((a, g) => a + g.fail, 0) + ' red=' + red.length
    + ' seconds=' + rec.seconds);
  for (const g of red) console.log('  FAIL ' + g.gate + ' exit ' + g.exit + '  ' + g.tail);
  console.log(red.length ? '  RESULT: FAIL - the baseline is not green, so no ablation means anything'
    : '  ok baseline written to ' + f);
  process.exit(red.length ? 1 : 0);
}

/* THE WHOLE ENGINE AT ONCE, which is one run rather than ninety-eight and answers the only
   question that needs no sample: with EVERY exported function in src/modules replaced by a
   no-op, does this chain go red? A chain that stays green there has certified a build that
   cannot do anything, and no amount of per-module nuance softens that. It is also the cheapest
   way to ask an expensive oracle (smoke, shell-smoke) the same question. */
if (cmd === 'total') {
  const h = head();
  const baseFile = path.join(OUT, 'baseline.json');
  if (!fs.existsSync(baseFile)) die('no baseline at ' + baseFile, 'node tools/ablate.mjs baseline');
  const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
  if (base.commit !== h.commit) die('the baseline was taken at ' + base.commit.slice(0, 7)
    + ' and the tree is at ' + h.commit.slice(0, 7), 'take it again');
  if (base.chains.join(',') !== CHAINS.join(',')) die('the baseline ran ' + base.chains.join(',')
    + ' and this run wants ' + CHAINS.join(','));
  const mode = flag('mode', 'noop');
  const steps = stepsOf(CHAINS);
  const files = fs.readdirSync(MODULES).filter(f => f.endsWith('.js')).sort();
  let touched = 0, fns = 0, left = 0;
  const skipped = [];
  let out;
  try {
    for (const f of files) {
      const abs = path.join(MODULES, f);
      const mut = mutate(fs.readFileSync(abs, 'utf8'), mode);
      if (!mut) { skipped.push(f); continue; }
      fs.writeFileSync(abs, mut.text);
      touched++; fns += mut.plan.fn.length; left += mut.plan.other.length;
    }
    const b = build();
    const art = artefact();
    if (b.exit !== 0) out = { buildFailed: b.text, artefact: art, gates: [] };
    else if (art.sha === base.artefact.sha || !art.marker)
      out = { refused: art.sha === base.artefact.sha ? 'the artefact is byte-identical'
        : 'the artefact carries no marker', artefact: art, gates: [] };
    else out = { artefact: art, gates: runChain(steps, false) };
  } finally {
    git(['checkout', '--', 'src/modules', 'engine/etiuda.html', 'engine/etiuda.csp.json']);
    const l = dirty();
    if (l) die('the tree did not come back: ' + l.replace(/\n/g, ' ; '));
  }
  out = { ...h, kind: 'total', mode, modules: touched, functions: fns, unablatable: left,
    skipped, ...out };
  if (out.gates.length) out.verdict = compare(base.gates, out.gates);
  const f = path.join(OUT, 'total-' + mode + '-' + CHAINS.join('+')
    + '-' + new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '') + '.json');
  fs.writeFileSync(f, JSON.stringify(out, null, 1));
  if (out.buildFailed) console.log('  BUILD REFUSED  ' + out.buildFailed);
  else if (out.refused) console.log('  RIG REFUSED  ' + out.refused);
  else for (const n of out.verdict.noticed)
    console.log('  ok ' + n.gate + ' noticed: ' + n.why + (n.tail ? '  ' + n.tail : ''));
  console.log('#counts modules=' + touched + ' functions=' + fns + ' unablatable=' + left
    + ' skippedModules=' + skipped.length
    + ' noticed=' + (out.verdict ? out.verdict.noticed.length : -1)
    + ' quiet=' + (out.verdict ? out.verdict.quiet.length : -1));
  /* The two modes want opposite answers, and a control that prints FAIL when it passes will be
     misread by the first reader in a hurry. Under `noop` a gate SHOULD notice; under `identity`
     nothing should, because identity is the control that says the rig itself reddens nothing. */
  /* THE SIGNAL SAYS WHAT THE TEXT SAYS, ballot 4 of the fourth meeting (2026-09-23). This
     printed RESULT: FAIL and exited 0, and a rig that refused under `identity` printed OK,
     since no verdict reads as nothing noticed. A refusal is now exit 3 in either mode and a
     FAIL is exit 1; the RESULT line is unchanged except that a refusal is no longer OK. */
  const wanted = !out.refused && (mode === 'identity' ? !out.verdict || !out.verdict.noticed.length
    : out.verdict && out.verdict.noticed.length > 0);
  console.log('  RESULT: ' + (wanted ? 'OK' : 'FAIL')
    + ' - ' + f);
  process.exit(out.refused ? 3 : wanted ? 0 : 1);
}

/* THE MERGE-TIME FORM, which is the only affordable one. A full sweep is one chain run per
   module and an hour of wall; a branch touches one or two. So: ablate exactly the modules the
   branch changed, and REFUSE if the suite does not notice. That is the question a merge
   actually wants answered - "did the legs you added measure the thing you wrote" - and it is
   the one a pass rate cannot answer. A module with no reassignable exported function is NOT
   RUN with the reason, never a pass. */
if (cmd === 'changed') {
  const h = head();
  const against = flag('against', 'main');
  const baseFile = path.join(OUT, 'baseline.json');
  if (!fs.existsSync(baseFile)) die('no baseline at ' + baseFile, 'node tools/ablate.mjs baseline');
  const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
  if (base.commit !== h.commit) die('the baseline was taken at ' + base.commit.slice(0, 7)
    + ' and the tree is at ' + h.commit.slice(0, 7), 'take it again');
  if (base.chains.join(',') !== CHAINS.join(',')) die('the baseline ran ' + base.chains.join(',')
    + ' and this run wants ' + CHAINS.join(','));
  let names;
  try { names = git(['diff', '--name-only', against + '...HEAD', '--', 'src/modules']).trim(); }
  catch (e) { die('git could not diff against ' + JSON.stringify(against), String(e.message || e)); }
  const files = names ? names.split(/\r?\n/).map(x => path.basename(x.trim())).filter(Boolean) : [];
  const steps = stepsOf(CHAINS);
  const cases = [];
  for (const f of files) {
    if (!fs.existsSync(path.join(MODULES, f))) { cases.push({ file: f, skipped: 'deleted on this branch' }); continue; }
    const r = oneCase(f, 'noop', steps, false, base.artefact && base.artefact.sha);
    if (!r.skipped && !r.buildFailed && !r.refused) r.verdict = compare(base.gates, r.gates);
    cases.push(r);
  }
  const blind = cases.filter(c => c.verdict && !c.verdict.noticed.length);
  const notRun = cases.filter(c => c.skipped || c.refused || c.buildFailed);
  for (const c of cases) {
    if (c.skipped) console.log('  NOT RUN: ' + c.file + ' - ' + c.skipped);
    else if (c.refused) console.log('  NOT RUN: ' + c.file + ' - ' + c.refused);
    else if (c.buildFailed) console.log('  ok ' + c.file + ' - the build refuses it: ' + c.buildFailed);
    else if (c.verdict.noticed.length) console.log('  ok ' + c.file + ' - no-oped and '
      + c.verdict.noticed.length + ' gate(s) noticed: ' + c.verdict.noticed.map(n => n.gate).join(' '));
    else console.log('  FAIL ' + c.file + ' - ' + c.ablated + ' exported function(s) no-oped, '
      + c.unablatable + ' left standing, and every gate in ' + CHAINS.join('+') + ' stayed green');
  }
  const f = path.join(OUT, 'changed-' + new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '') + '.json');
  fs.writeFileSync(f, JSON.stringify({ ...h, kind: 'changed', against, cases }, null, 1));
  console.log('#counts modules=' + files.length + ' blind=' + blind.length
    + ' notRun=' + notRun.length + ' exitCode=' + (blind.length ? 1 : 0));
  console.log(blind.length
    ? '  RESULT: FAIL - ' + blind.length + ' changed module(s) can be turned off without the suite noticing'
    : '  RESULT: OK - ' + files.length + ' changed module(s), ' + notRun.length + ' not run');
  process.exit(blind.length ? 1 : 0);
}

if (cmd === 'one' || cmd === 'sweep') {
  const h = head();
  const baseFile = path.join(OUT, 'baseline.json');
  if (!fs.existsSync(baseFile)) die('no baseline at ' + baseFile, 'node tools/ablate.mjs baseline');
  const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
  if (base.commit !== h.commit) die('the baseline was taken at ' + base.commit.slice(0, 7)
    + ' and the tree is at ' + h.commit.slice(0, 7), 'take it again');
  if (base.chains.join(',') !== CHAINS.join(',')) die('the baseline ran ' + base.chains.join(',')
    + ' and this run wants ' + CHAINS.join(','));
  const mode = cmd === 'one' ? (argv[2] || 'noop') : flag('mode', 'noop');
  const only = flag('modules', '');
  const files = cmd === 'one' ? [argv[1]]
    : (only ? only.split(',') : fs.readdirSync(MODULES).filter(f => f.endsWith('.js')).sort());
  const steps = stepsOf(CHAINS);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  const f = path.join(OUT, 'sweep-' + mode + '-' + stamp + '.json');
  const cases = [];
  const t0 = Date.now();
  for (let i = 0; i < files.length; i++) {
    const r = oneCase(files[i], mode, steps, STOP, base.artefact && base.artefact.sha);
    if (!r.skipped && !r.buildFailed && !r.refused) r.verdict = compare(base.gates, r.gates);
    cases.push(r);
    fs.writeFileSync(f, JSON.stringify({ ...h, kind: 'sweep', mode, baseline: baseFile, cases }, null, 1));
    const v = r.skipped ? 'SKIPPED ' + r.skipped
      : r.refused ? 'RIG REFUSED  ' + r.refused
      : r.buildFailed ? 'BUILD REFUSED  ' + r.buildFailed
        : (r.verdict.noticed.length
          ? 'noticed by ' + r.verdict.noticed.length + ': ' + r.verdict.noticed.map(n => n.gate).join(' ')
          : 'NOT NOTICED  (' + r.ablated + ' functions no-oped, ' + r.unablatable + ' left)');
    console.log('  ' + (i + 1) + '/' + files.length + ' ' + files[i] + '  ' + v
      + '  [' + Math.round((Date.now() - t0) / 1000) + 's]');
  }
  const blind = cases.filter(c => c.verdict && !c.verdict.noticed.length);
  console.log('#counts cases=' + cases.length + ' skipped=' + cases.filter(c => c.skipped).length
    + ' buildRefused=' + cases.filter(c => c.buildFailed).length
    + ' rigRefused=' + cases.filter(c => c.refused).length
    + ' noticed=' + cases.filter(c => c.verdict && c.verdict.noticed.length).length
    + ' blind=' + blind.length + ' seconds=' + Math.round((Date.now() - t0) / 1000));
  /* A CASE THAT COULD NOT BE MEASURED EXITS 3, ballot 4 of the fourth meeting (2026-09-23):
     the rig refusing a case, or `one` skipping the one module it was asked about, printed
     RESULT: OK and exited 0. A sweep's skipped modules are the unablatable ones and stay a
     count rather than a refusal. */
  const unmeasured = cases.filter(c => c.refused || (cmd === 'one' && c.skipped)).length;
  console.log('  RESULT: ' + (unmeasured ? 'NOT RUN, ' + unmeasured + ' case(s) the rig could not measure' : 'OK')
    + ' - ' + f);
  process.exit(unmeasured ? 3 : 0);
}

if (RUN_AS_MAIN)
  die('no command',
    'baseline | one <module.js> <mode> | sweep [--mode noop|identity] | changed [--against main]');
