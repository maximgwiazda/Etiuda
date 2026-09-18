// Self-test for boot-order.mjs. Board 330.
//
// Two kinds of case, and the second kind is the one that makes this a gate rather than a
// checksum: things the leg must REFUSE (a reorder, an addition, a removal) and things it must
// LET THROUGH (a comment rewritten, a call re-wrapped over three lines, a string changed inside
// a call it is not about). A rule that fails on everything catches nothing, because the next
// person turns it off.
//
//   node tools/split-guard/boot-order-selftest.mjs
import { bodyOf, statementsIn, labelOf, stepsOf, readList } from './boot-order.mjs';
import { mask } from './cycle-bounds.mjs';

const NL = String.fromCharCode(10);
const Q = String.fromCharCode(34);
const HASH = String.fromCharCode(35);
let pass = 0, fail = 0;

function is(what, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + what + '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
}

const boot = body => 'function boot(){' + NL + body + NL + '}' + NL;
const steps = body => stepsOf(boot(body)).steps.map(s => s.step);
const label = text => labelOf(text, mask(text));

// --- the statement walk ------------------------------------------------------------------------
is('one call is one step', steps('  a.b();'), ['a.b()']);
is('two calls are two steps', steps('  a.b();' + NL + '  c.d();'), ['a.b()', 'c.d()']);
is('a try with a catch is ONE step, not two (a `}` rule: two)',
  steps('  try{ a.b(); }catch(e){}' + NL + '  c.d();'), ['try:a.b()', 'c.d()']);
is('an if with an else is one step',
  steps('  if(x){ a.b(); } else { c.d(); }'), ['if:a.b()']);
is('a listener with a callback body is one step, and its own body is not stepped',
  steps('  addEventListener(' + Q + 'resize' + Q + ',()=>{ a.b(); c.d(); });'),
  ['addEventListener:' + Q + 'resize' + Q]);
is('a nested function declaration inside a call does not leak steps',
  steps('  a.b(function(){ c.d(); });' + NL + '  e.f();'), ['a.b()', 'e.f()']);
is('a semicolon inside a string does not end a statement (a split on ; would: two)',
  steps('  a.b(' + Q + 'x;y' + Q + ');'), ['a.b(' + Q + 'x;y' + Q + ')']);
is('a brace inside a comment does not end a statement',
  steps('  a.b(); /* } */' + NL + '  c.d();'), ['a.b()', 'c.d()']);
is('boot() must exist', stepsOf('function other(){ a(); }').why, 'no function boot() in the file');

// --- labels ---------------------------------------------------------------------------------
is('a plain call', label('a.b();'), 'a.b()');
is('a call with an identifier argument keeps it', label('a.b(dom.pax);'), 'a.b(dom.pax)');
is('a call with a string argument keeps it', label('a.b(' + Q + 'k' + Q + ');'), 'a.b(' + Q + 'k' + Q + ')');
is('a try is named by what it calls, not by the word if (the first cut said try:if)',
  label('try{ if(s.lsGet(' + Q + 'k' + Q + ')) go(); }catch(e){}'), 'try:s.lsGet(' + Q + 'k' + Q + ')');
is('typeof does not look like a call', label('try{ if(typeof F===' + Q + 'function' + Q + ') F(); }catch(e){}'), 'try:F()');
is('an assignment with no call', label('dom.roleSel.value = ' + Q + Q + ';'), 'assign:dom.roleSel.value');
is('an equality test is not an assignment', label('if(a===b){ go(); }'), 'if:go()');
is('a listener is named by its event, not by addEventListener',
  label('addEventListener(' + Q + 'scroll' + Q + ',f);'), 'addEventListener:' + Q + 'scroll' + Q);

// --- what must be LET THROUGH ------------------------------------------------------------------
is('a call re-wrapped over three lines is the same step',
  label('railPanel' + NL + '  .wireOverlapPointer(' + NL + '  );'), 'railPanel.wireOverlapPointer()');
is('a comment above a call is not part of its label',
  steps('  // rewritten entirely' + NL + '  a.b();'), ['a.b()']);
is('a trailing comment is not part of its label',
  steps('  a.b();   // and this too'), ['a.b()']);
is('extra blank lines change nothing', steps('  a.b();' + NL + NL + NL + '  c.d();'), ['a.b()', 'c.d()']);

// --- what must be REFUSED ----------------------------------------------------------------------
is('a swap of two steps is a different list',
  steps('  a.b();' + NL + '  c.d();'), ['a.b()', 'c.d()']);
is('and the other order is the other list',
  steps('  c.d();' + NL + '  a.b();'), ['c.d()', 'a.b()']);
is('a repeated callee is numbered so a second one is not mistaken for the first',
  steps('  a.b();' + NL + '  a.b();'), ['a.b()', 'a.b()' + HASH + '2']);
is('two calls told apart by their first argument are not numbered',
  steps('  f.bind(dom.a);' + NL + '  f.bind(dom.b);'), ['f.bind(dom.a)', 'f.bind(dom.b)']);

// --- the list file -----------------------------------------------------------------------------
is('comments and blank lines are not steps',
  readList(HASH + ' a comment' + NL + NL + '  a.b()  ' + NL + 'c.d()'), ['a.b()', 'c.d()']);

/* THE GATE'S OWN COUNTS, board item 529. This selftest prints one line whatever it did, so
   the record read it as `lines: 1` and a run that checked nothing looked like a run that
   checked them all. Before the last line, which tools/gate-run.mjs takes as the verdict;
   `ok` and `fail` are that runner's reserved words, hence `cases` and `failed`. */
console.log('#counts cases=' + (pass + fail) + ' failed=' + fail);
console.log('split-guard boot-order-selftest  ' + pass + '/' + (pass + fail) + (fail ? '  ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
