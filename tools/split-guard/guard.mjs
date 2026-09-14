// The split guard: after the engine becomes modules, does every module actually hold the
// names it uses?
//
// A forgotten import is the characteristic failure of this split and it is silent. An engine
// name that was never imported is simply not declared in that module, so
// `typeof render === "function"` is false rather than an error, the call is skipped, and
// nothing throws, nothing logs, and the bundler says nothing. Measured on 2026-09-12:
// esbuild 0.28.2 bundles such a module without a warning even at --log-level=warning, and
// the result runs and returns normally.
//
// The gate does not hand-roll a scope analyser. It uses esbuild's own, which is the same one
// that will build the release, by defining every engine name to a sentinel. esbuild's
// `define` is skipped wherever the identifier is bound - by an import, a declaration, a
// parameter - and applies only where the reference is free. So a sentinel that survives into
// the artifact is, by construction, a reference that resolved to nothing. Measured, with a
// module that imports one of two names and a parameter shadowing the third: only the
// genuinely free reference was substituted.
//
// This is exhaustive over code paths, which a browser suite can never be: it does not matter
// whether a test ever walks the line.
//
//   node tools/split-guard/guard.mjs --entry src/main.js --names src/monolith.js
//   node tools/split-guard/guard.mjs --scan engine/etiuda.html
//   node tools/split-guard/guard.mjs --scan src/main.js src/monolith.js src/modules/*.js
//
// THE TWO MODES ARE TWO INSTRUMENTS. No flag is the sentinel above; `--scan` is the pair of
// text rules further down and says nothing about bindings. A report quoting `0/0/5` is
// quoting `--scan`.
//
// --scan TAKES ITS FILES POSITIONALLY and has no default: written alone it has nothing to
// read, and a scan of nothing prints three zeroes, which reads as a pass. It refuses instead.
//
// Not every free reference is a fault. `src/monolith.js` is spliced into the same <script> as
// the bundle's iife and at its top level, so a name it still declares is on the scope chain of
// every module and the reference resolves. The same reference is a forgotten import the day
// that name moves into a module, and nothing about the line changes. So the sentinel is
// partitioned by where the name is declared: still in the monolith is a note, held by a module
// this one does not import is a failure.
//
// What it cannot see: a name deleted from the source tree outright. The names defined are the
// names the source declares, so a name that leaves the tree leaves the sentinel with it. That
// class wants a free-identifier census against a list of host globals, which is a different
// instrument.
//
// Exit code is the number of failures, notes excluded, so a release script can gate on it. A
// refusal must therefore not share a number with a count, and 78 is the one this project keeps.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const NO_VERDICT = 78;

// ---------------------------------------------------------------------------------------
// Reading the declarations, which is the whole census and was wrong until 2026-09-13.
//
// Every name rule in this file used to take the identifier straight after `const`, `let` or
// `var` and stop. A line declares as many names as it has declarators, so
// `let railSel=-1, railOrder=[], railMarkIdx=-1, railMatch=null;` contributed one name of four.
// Measured at `88e3a1e`: the monolith census returned 218 names where 244 are declared and the
// module census 716 where 757 are, so 67 names were defined to no sentinel at all and a
// forgotten import of any of them could not be seen. It is not a failure that grows slowly:
// these lines move into modules whole, and the module rule loses exactly the same declarators
// the monolith rule does, so the day a line moves the name is missing from both halves of the
// partition and the run stays silent and green.
//
// So the statement is read to its end rather than to the end of its first declarator. That
// needs the lexer below - strings, template literals, both comments and regular expressions
// all hold commas and semicolons, and a declaration may run over several lines, which is how
// `agentEl` hides in the `$`/`list`/`pax`/`intentEl` line.
//
// The direction of an error here matters and it is the safe one. A name invented by this
// scanner is defined to a sentinel, so if it is really a host global every reference to it in
// every module becomes a finding at once: the noise is deafening and immediate, where the old
// understatement was silent. Proved against a second implementation that does not share this
// code: esbuild's own scope analysis, asked which of every identifier-shaped token in a file is
// bound at that file's top level. Over `src/monolith.js`, `src/main.js` and the 52 modules at
// `88e3a1e` the two agree name for name, but for `module` and `exports`, which esbuild reserves.
const RESERVED = new Set(('break case catch class const continue debugger default delete do else enum export extends '
  + 'false finally for function if import in instanceof new null return super switch this throw true try typeof var '
  + 'void while with yield let static await arguments eval').split(' '));

// `exportedOnly` narrows it to the declarations the module also exports on the spot, which is
// what the bridge gate needs: an `export const a = 1, b = 2` names two of a module's exports
// and no `export { }` block mentions either.
export function declaredTopLevel(src, { exportedOnly = false } = {}) {
  const out = [];
  const re = /^(export\s+)?(?:const|let|var)\s/gm;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const { text, end } = statementFrom(src, start);
    if (!exportedOnly || m[1]) for (const n of declaratorNames(text)) out.push(n);
    re.lastIndex = Math.max(re.lastIndex, end);
  }
  for (const mm of src.matchAll(/^(export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/gm))
    if (!exportedOnly || mm[1]) out.push(mm[2]);
  for (const mm of src.matchAll(/^(export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+[^\n{]+)?\s*\{/gm))
    if (!exportedOnly || mm[1]) out.push(mm[2]);
  return out;
}

// From the first declarator to the end of the statement: a `;` at depth zero, or a line break
// at depth zero that no operator carries over. Comments, strings, template literals and regular
// expressions are blanked as they are passed, so that a comma inside one is not a declarator
// boundary. Regular expressions are recognised before division by what precedes the slash,
// which is the one place a lexer of this size can be wrong; it costs a statement, not a file,
// because each statement is scanned from its own column-0 keyword.
function statementFrom(js, start) {
  let i = start, depth = 0, prev = '=';
  const out = [];
  while (i < js.length) {
    const c = js[i];
    if (c === '/' && js[i + 1] === '/') { const j = js.indexOf('\n', i); i = j < 0 ? js.length : j; out.push(' '); continue; }
    if (c === '/' && js[i + 1] === '*') { const j = js.indexOf('*/', i + 2); i = j < 0 ? js.length : j + 2; out.push(' '); continue; }
    if (c === '"' || c === "'") { const j = skipString(js, i, c); out.push(' '.repeat(j - i)); i = j; prev = 'x'; continue; }
    if (c === '`') { const j = skipTemplate(js, i); out.push(' '.repeat(j - i)); i = j; prev = 'x'; continue; }
    if (c === '/' && '=(,:[!&|?{};+-*%~^<>'.includes(prev)) { const j = skipRegex(js, i); out.push(' '.repeat(j - i)); i = j; prev = 'x'; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth === 0) { i++; break; }
    if (c === '\n' && depth === 0 && !',=+-*/%?:.([{&|^~<>!'.includes(prev) && !continuesAfter(js, i)) { i++; break; }
    out.push(c);
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return { text: out.join(''), end: i };
}
function continuesAfter(js, i) {
  let j = i + 1;
  while (j < js.length && /\s/.test(js[j])) j++;
  return j < js.length && ',=+-*/%?:.([`<>&|!^~'.includes(js[j]);
}
function skipString(js, i, q) {
  let j = i + 1;
  while (j < js.length) { if (js[j] === '\\') { j += 2; continue; } if (js[j] === q) return j + 1; if (js[j] === '\n') return j; j++; }
  return j;
}
function skipTemplate(js, i) {
  let j = i + 1;
  while (j < js.length) {
    if (js[j] === '\\') { j += 2; continue; }
    if (js[j] === '`') return j + 1;
    if (js[j] === '$' && js[j + 1] === '{') { let d = 1; j += 2; while (j < js.length && d) { if (js[j] === '{') d++; else if (js[j] === '}') d--; j++; } continue; }
    j++;
  }
  return j;
}
function skipRegex(js, i) {
  let j = i + 1, cls = false;
  while (j < js.length) {
    if (js[j] === '\\') { j += 2; continue; }
    if (js[j] === '[') cls = true;
    else if (js[j] === ']') cls = false;
    else if (js[j] === '/' && !cls) { j++; while (j < js.length && /[a-z]/.test(js[j])) j++; return j; }
    else if (js[j] === '\n') return j;
    j++;
  }
  return j;
}
// The head of the statement and the head of every comma group at depth zero. A group's binding
// is what stands before its own `=`; where that is a pattern rather than a name, every binding
// position in the pattern is a declaration too.
function declaratorNames(text) {
  const groups = [''];
  let depth = 0;
  for (const c of text) {
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { groups.push(''); continue; }
    groups[groups.length - 1] += c;
  }
  const out = [];
  for (const grp of groups) {
    const eq = topLevelAssign(grp);
    const p = (eq === -1 ? grp : grp.slice(0, eq)).trim();
    if (!p) continue;
    if (/^[A-Za-z_$][\w$]*$/.test(p)) { if (!RESERVED.has(p)) out.push(p); continue; }
    if (/^[{[]/.test(p)) for (const n of patternNames(p)) out.push(n);
  }
  return out;
}
function topLevelAssign(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === '=' && depth === 0 && s[i + 1] !== '=' && !'=!<>'.includes(s[i - 1])) return i;
  }
  return -1;
}
// `const {a, b: c, ...rest} = x` binds a, c and rest: a key followed by a colon names the
// property, not the binding, and a default after `=` is a value.
function patternNames(p) {
  const out = [];
  const toks = p.replace(/=[^,{}[\]]*/g, '');
  for (const mm of toks.matchAll(/([A-Za-z_$][\w$]*)\s*(:)?/g)) {
    if (!mm[2] && !RESERVED.has(mm[1])) out.push(mm[1]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// The name list. The authority is the monolith: every binding declared at the top level of
// the engine's one script is a name that, after the split, has to reach its user by import.
// Reading it from the monolith rather than from a list in this folder means the list cannot
// go stale while the engine moves.
export function engineNames(monolithPath) {
  // No monolith, no partition: every free reference is then a failure, which is the end state.
  if (!monolithPath) return new Set();
  const src = readFileSync(monolithPath, 'utf8');
  const m = /<script>([\s\S]*)<\/script>/.exec(src);
  const js = m ? m[1] : src;
  return new Set(declaredTopLevel(js));
}

// The other half of the name list, and the half that makes the partition possible: what each
// module declares at its own top level. A name here is reachable only by importing it, so a
// free reference to one is the forgotten import this gate is named after.
export function topLevelNames(files) {
  const by = new Map();
  for (const f of files) {
    for (const n of declaredTopLevel(readFileSync(f, 'utf8'))) {
      if (!by.has(n)) by.set(n, []);
      if (!by.get(n).includes(f)) by.get(n).push(f);
    }
  }
  return by;
}

// The module set is the entry's own folder, read from disk rather than from the build, so a
// file that has stopped being imported still contributes its names. A name in an orphaned
// module is unreachable and the verdict is the same either way; only the sentence differs.
export function moduleFilesFor(entry, except = []) {
  const skip = new Set(except.map(p => resolve(p)));
  const out = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.m?js$/.test(e.name) && !skip.has(resolve(p))) out.push(p);
    }
  })(dirname(resolve(entry)));
  return out;
}

// Names that are meant to stay global after the split, each with the reason it is not a
// finding. An entry here is a decision; keep it short and keep the reason on the line.
export const ALLOWED_GLOBAL = new Map([
  ['PB_CATALOG', 'the deployment catalog is a separate <script> the page may or may not carry'],
  ['PB_SAMPLE', 'the sample catalog arrives the same way'],
]);

const SENTINEL = '__PB_UNBOUND_';

export async function guard({ entry, monolith, moduleFiles, extraAllow = [] }) {
  const mods = moduleFiles || moduleFilesFor(entry, [monolith].filter(Boolean));
  const monoNames = engineNames(monolith);
  const modNames = topLevelNames(mods);
  const names = new Set([...monoNames, ...modNames.keys()]);
  for (const n of [...ALLOWED_GLOBAL.keys(), ...extraAllow]) names.delete(n);

  const define = {};
  for (const n of names) define[n] = SENTINEL + n;

  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    minify: false,
    charset: 'utf8',
    write: false,
    logLevel: 'silent',
    // Tree shaking OFF, and it is a correctness option here rather than a size one. This gate
    // reads sentinels out of the OUTPUT, so anything the optimiser removes before the scan is
    // a region the gate never looked at. Measured 2026-09-13 on the tip of `dev`: a module
    // calling another module's name from a function nothing calls is shaken away whole, and
    // the gate printed `ok ... no module uses a name it cannot reach`, exit 0, over a tree
    // holding a real forgotten import. With this line it is a FAIL, named to the module.
    // It costs nothing to see the whole tree: on `src/main.js` the shaken and unshaken bundles
    // hold the same 36 module banners and the same 488 top-level names, and differ only in
    // whether `var a = 1, b = 2;` is emitted as one statement or two, 52 lines, 144 bytes.
    // Not for the reason five reports have carried: `tools/same-program.mjs` does not turn tree
    // shaking off and its header names `minifyIdentifiers`, not this; it calls
    // `esbuild.transform`, which does not bundle, so it never shook anything. This is the only
    // `treeShaking` in the tree, and it is here on the control above rather than by analogy.
    treeShaking: false,
    define,
  });
  // Without an outdir esbuild names the in-memory output `<stdout>`, so the extension is not
  // a safe way to pick it out; a bundle of one entry produces exactly one JS output.
  const js = result.outputFiles.find(f => /\.js$/.test(f.path)) || result.outputFiles[0];
  if (!js) throw new Error('esbuild produced no output for ' + entry);
  const text = js.text;

  // esbuild writes `// path/to/module.js` above each module's contribution, so a sentinel can
  // be attributed to the module that lost the name rather than only to the bundle.
  const findings = [];
  let where = '(entry)';
  for (const [i, line] of text.split('\n').entries()) {
    const mod = /^\s*\/\/ (\S+\.(?:js|mjs|ts))\s*$/.exec(line);
    if (mod) { where = mod[1]; continue; }
    for (const mm of line.matchAll(new RegExp(SENTINEL + '([A-Za-z_$][\\w$]*)', 'g'))) {
      const guarded = /typeof\s+__PB_UNBOUND_/.test(line);
      findings.push({ name: mm[1], module: where, line: i + 1, guarded, text: line.trim().slice(0, 120) });
    }
  }
  // One finding per name per module: 241 guards over 104 names would otherwise read as 241.
  const seen = new Set();
  const unique = findings.filter(f => {
    const k = f.module + '\u0000' + f.name;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  // The partition. A module declaring the name outranks the monolith declaring it, because a
  // module binding is the one that cannot be reached from here; a name in both places is a
  // defect on its own and the louder verdict is the right one for it.
  const show = p => relative(process.cwd(), resolve(p)).split('\\').join('/');
  for (const f of unique) {
    const here = resolve(process.cwd(), f.module);
    const holders = (modNames.get(f.name) || []).filter(p => resolve(p) !== here);
    if (holders.length) {
      f.verdict = 'fail';
      f.why = 'declared at the top level of ' + holders.map(show).join(' and ') + ', which this module does not import';
    } else if (monoNames.has(f.name)) {
      f.verdict = 'note';
      f.why = 'still declared at the top level of ' + show(monolith);
    } else {
      f.verdict = 'fail';
      f.why = 'declared at no top level the bundle can reach';
    }
  }
  const failures = unique.filter(f => f.verdict === 'fail').length;
  return { names: names.size, monolithNames: monoNames.size, moduleNames: modNames.size,
           moduleFiles: mods.length, findings: unique, failures, notes: unique.length - failures,
           occurrences: findings.length, bundleBytes: text.length };
}

// ---------------------------------------------------------------------------------------
// The second rule, which the first cannot see: a name reached through `window` is a string,
// not an identifier, so no scope analyser will ever resolve it. The monolith has exactly one
// such site and it is the hole this guard was written after. After the split, indexing
// `window` with an engine name is banned outright rather than measured.
export function windowLookups(files) {
  const hits = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const [i, line] of src.split('\n').entries()) {
      if (/^\s*(\/\/|\*)/.test(line)) continue;
      if (/\bwindow\s*\[/.test(line) || /\bglobalThis\s*\[/.test(line)) {
        hits.push({ file: f, line: i + 1, kind: 'dynamic', text: line.trim().slice(0, 120) });
      }
    }
  }
  return hits;
}

// The third rule, which exists because the loud failure has a silent repair. Writing to an
// imported binding is refused by esbuild outright - measured: `Cannot assign to import "x"`,
// and node throws `TypeError: Assignment to constant variable` - so nobody ships that. What
// they ship instead is one of the two things that make the error go away: re-declaring the
// name locally, which writes a shadow while the real binding keeps its old value, or routing
// the write through `globalThis`. Both are silent. Both are visible here.
export function shadowedBindings(files) {
  const top = new Map();      // name -> [files that declare it at top level]
  const globalWrites = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    // Same census as the sentinel's, so this rule cannot see a different set of names from the
    // one the gate is defining; before 2026-09-13 both read only a line's first declarator.
    for (const n of declaredTopLevel(src)) {
      if (!top.has(n)) top.set(n, []);
      top.get(n).push(f);
    }
    for (const [i, line] of src.split('\n').entries()) {
      const w = /\b(?:window|globalThis)\.([A-Za-z_$][\w$]*)\s*=(?!=)/.exec(line);
      if (w) globalWrites.push({ file: f, line: i + 1, name: w[1], text: line.trim().slice(0, 120) });
    }
  }
  const dupes = [...top].filter(([, fs]) => fs.length > 1).map(([name, fs]) => ({ name, files: fs }));
  return { dupes, globalWrites };
}

// ---------------------------------------------------------------------------------------
function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  // `--scan` runs the two text rules alone, over whatever files are named, so they can be
  // pointed at the monolith today rather than waiting for a module tree to exist. Against
  // engine/etiuda.html this prints the one window[] site the whole guard was written after.
  const scanAt = process.argv.indexOf('--scan');
  if (scanAt > 0) {
    const files = process.argv.slice(scanAt + 1).filter(a => !a.startsWith('--')).map(f => resolve(f));
    // No file set, no verdict. Both rules below count what they found, so an empty set makes
    // them print `0 dynamic global lookups, 0 duplicated top-level names, 0 global writes` and
    // exit 0 - a green that means only that nothing was read, and it reached a report as one.
    if (!files.length) {
      console.log('  FAIL  --scan was given no files to read');
      console.log('        name them after the flag, which takes them positionally:');
      console.log('        --scan src/main.js src/monolith.js src/modules/*.js');
      console.log('  SUITE DID NOT COMPLETE: --scan was given no files to read');
      process.exit(NO_VERDICT);
    }
    const w = windowLookups(files);
    const s = shadowedBindings(files);
    for (const h of w) console.log('  FAIL  ' + h.file + ':' + h.line + ' indexes a global object  [' + h.text + ']');
    for (const d of s.dupes) console.log('  FAIL  ' + d.name + ' is declared at the top level of ' + d.files.length + ' modules');
    for (const g of s.globalWrites) console.log('  note  ' + g.file + ':' + g.line + ' writes ' + g.name + ' onto a global object');
    console.log('  ' + w.length + ' dynamic global lookups, ' + s.dupes.length + ' duplicated top-level names, '
      + s.globalWrites.length + ' global writes, over ' + files.length + ' files');
    process.exitCode = w.length + s.dupes.length;
  } else {
  // The names come from src/, never from engine/etiuda.html. Measured: with one function cut
  // out of the monolith into a module and the artifact rebuilt, the artifact's census loses
  // that name - esbuild reprints a module's declarations indented, inside the iife - so the
  // forgotten reference stops being defined and the gate goes QUIETER at the one moment it is
  // meant to speak. Findings went 17 to 16 and the moved name vanished from the report.
  const entry = resolve(arg('--entry', join(HERE, '..', '..', 'src', 'main.js')));
  const named = arg('--names', null);
  const monolith = named ? resolve(named) : null;
  if (!existsSync(entry)) { console.error('no entry at ' + entry); process.exit(NO_VERDICT); }
  // A --names file that was asked for and is not there is a refusal: the caller wanted a
  // partition this run could not read. Asking for none is the tree as it stands since
  // 2026-09-14, where there is nothing left to be a note.
  if (named && !existsSync(monolith)) { console.error('no name file at ' + monolith); process.exit(NO_VERDICT); }

  const r = await guard({ entry, monolith });
  console.log('split-guard  ' + r.names + ' names (' + r.monolithNames + ' outside a module, '
    + r.moduleNames + ' over ' + r.moduleFiles + ' module files), bundle ' + r.bundleBytes + ' bytes');
  for (const f of r.findings) {
    console.log('  ' + (f.verdict === 'fail' ? 'FAIL' : 'note') + '  ' + f.module + ': ' + f.name
      + ' is not imported here; it is ' + f.why
      + (f.guarded ? ' (behind a typeof guard, so it fails silently)' : '') + '  [' + f.text + ']');
  }
  // The verdict leads the line. The same message text under a FAIL and an ok is how a count
  // gets quoted out of a failing run as though it were a passing one.
  const pairs = n => n + (n === 1 ? ' pair' : ' pairs');
  const tail = (monolith ? pairs(r.notes) + ' resolving in ' + relative(process.cwd(), monolith).split(String.fromCharCode(92)).join('/')
    : 'no name file, so nothing can resolve outside a module') + ', over ' + r.occurrences + ' references';
  console.log(r.failures
    ? '  FAIL  ' + pairs(r.failures) + ' out of reach, ' + tail
    : '  ok    no module uses a name it cannot reach, ' + tail);
  process.exitCode = r.failures;
  }
}
