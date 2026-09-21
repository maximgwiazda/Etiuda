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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(ROOT, 'src', 'modules');
const OUT = path.resolve(process.env.ETIUDA_ABLATE_OUT
  || path.join(ROOT, '..', 'etiuda-runs', 'ablate'));
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

export function mutate(src, mode) {
  const p = plan(src);
  if (!p) return null;
  if (!p.fn.length) return null;
  if (/__abl(Noop|Id)\b/.test(src)) return null;      /* refuse a name collision rather than shadow one */
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
    res.push({ gate: s.file, ...read(text, exit), ms: Date.now() - t0,
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

function oneCase(file, mode, steps, stopOnFail) {
  const abs = path.join(MODULES, file);
  const src = fs.readFileSync(abs, 'utf8');
  const mut = mutate(src, mode);
  if (!mut) return { file, mode, skipped: 'no reassignable exported function declaration' };
  const p = mut.plan;
  fs.writeFileSync(abs, mut.text);
  let out;
  try {
    const b = build();
    if (b.exit !== 0) out = { file, mode, buildFailed: b.text, ablated: p.fn.length,
      unablatable: p.other.length, gates: [] };
    else out = { file, mode, ablated: p.fn.length, unablatable: p.other.length,
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
  const rec = { ...h, kind: 'baseline', seconds: Math.round((Date.now() - t0) / 1000), gates };
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
    const r = oneCase(files[i], mode, steps, STOP);
    if (!r.skipped && !r.buildFailed) r.verdict = compare(base.gates, r.gates);
    cases.push(r);
    fs.writeFileSync(f, JSON.stringify({ ...h, kind: 'sweep', mode, baseline: baseFile, cases }, null, 1));
    const v = r.skipped ? 'SKIPPED ' + r.skipped
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
    + ' noticed=' + cases.filter(c => c.verdict && c.verdict.noticed.length).length
    + ' blind=' + blind.length + ' seconds=' + Math.round((Date.now() - t0) / 1000));
  console.log('  RESULT: OK - ' + f);
  process.exit(0);
}

if (RUN_AS_MAIN)
  die('no command', 'baseline | one <module.js> [noop|identity] | sweep [--mode noop|identity]');
