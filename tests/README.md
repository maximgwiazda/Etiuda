# The harness

The tooling that judges the engine. It lives here because it kept living nowhere: three times in
two days a repair to it existed only in an ignored file on one disk, and a harness one disk from
gone is not an acceptance test.

Everything here runs against `engine/etiuda.html` and `src/`. Nothing here runs against
`Etiuda.html` at the root, which is the redirect stub and was what the harness had been reading.

## Running it

    node tests/engine-selftest.js                    no fixtures, no browser
    node tests/text-scan-selftest.js                 no fixtures, builds a toy tree twice
    node tests/i18n-scan.js                          no fixtures
    node tests/deadcode.js                           no fixtures
    node tests/build-fresh.mjs                       no fixtures, builds once
    node tests/test.js                               sections 1 to 3 without fixtures
    ETIUDA_FIXTURES=<folder> node tests/test.js      all five sections
    ETIUDA_FIXTURES=<folder> node tests/smoke.js     the acceptance run, Chrome
    ETIUDA_FIXTURES=<folder> node tests/smoke.js firefox

`npm test` runs the two self-tests, `build-fresh.mjs`, `test.js` and `i18n-scan.js`, none of which
needs a fixture or a browser. `npm run smoke` needs both.

`css-dead.js`, `ghosts.js` and `storage-keys.js` are reports rather than gates: they print and
exit 0, and a human reads the list. `i18n-scan.js` is a gate and exits non-zero when a language
is incomplete, when its table cannot be parsed, or when it can find no table at all.

## Which file a check reads, and why it is two files

`engine/etiuda.html` is built from `src/` by `tools/build.mjs`, and esbuild reprints every module
it bundles. The reprint is faithful as a program and unfaithful as text: a top-level `const` comes
back as `var`, comments are gone, and no declaration keeps its source spelling by contract. A
harness that slices declarations out of the artefact by their exact source text therefore stops
matching the moment a region moves into `src/modules/`, and the scans that read the file as prose
start reading generated prose.

So the rule is:

| The check reads the engine as | It reads |
|---|---|
| text - declarations, comments, strings, scans | `src/`, through `E.sourceDoc()` |
| a document - does it parse, do the CSS rules agree, does a browser like it | `engine/etiuda.html` |

`E.sourceDoc()` is the document as written: `src/template.html` with the app script's anchor
replaced by the modules, the entry and `src/monolith.js`. It is the same shape as the artefact,
so every scan applies to it unchanged, and `at()` turns an offset back into `src/<file>:<line>`,
which the artefact could never say.

**And here is every instrument in this folder under that rule, one line each.** The rule was
written before all of it obeyed: until 2026-09-13 four of the five text scans still read the
artefact, which is board item 253. A table nobody can check against the files is a wish, so the
third column is how to check this one.

| Instrument | Reads | Why that, and not the other |
|---|---|---|
| `i18n-scan.js` | `src/` | every rule is a text rule over JS as written, and the `UI_STRINGS` tables are found by their spelling |
| `deadcode.js` | `src/` | a declaration esbuild reprints indented inside the iife is a declaration a column-anchored census cannot see |
| `ghosts.js` | `src/` | comments **are** its subject and esbuild deletes every comment in every module |
| `storage-keys.js` | `src/` | a call site is JS, and an artefact line number names no file anyone can open |
| `css-dead.js` | `src/` | the stylesheet half is identical either way, but the evidence half is JS, and a report saying "delete this rule" must name a file that survives the next build |
| `test.js` sections 1, 3, 4, 5 as text | `src/` | `sourceText()`, `sourceAt()`, `sourceAtLine()` |
| `test.js` syntax, stacking, dark palettes | artefact | "does the shipped file parse" and "do these CSS rules agree" are questions about the shipped file |
| `test.js` `[2b/5]` | both | it is the tie: head, monolith and tail must reach the artefact byte for byte |
| `engine-selftest.js` | artefact | it asserts the engine is at `engine/etiuda.html` and is not the redirect stub |
| `build-fresh.mjs` | both | it runs the real build and compares, which is the only thing that can speak for the bundle |
| `smoke.js` | artefact | a browser opens the file that ships |
| `text-scan-selftest.js` | a toy tree | it proves the five rows above that say `src/` |

Check it in a minute: `grep -n "engineSource()\|sourceDoc()" tests/*.js`. Every `engineSource()`
there should be on a line this table calls an artefact reading.

### What made those four move, measured

Not argued. `tests/text-scan-selftest.js` builds a toy tree twice from one region of text - once
with the region at the end of `src/monolith.js`, once with the identical text in
`src/modules/region.js` - using this project's own esbuild options, and runs each scan over three
readings: `src/`, the artefact, and a doctored `sourceDoc()` with `src/modules/` left out. What it
found, and now holds:

- **`ghosts.js` was not quieter against the artefact, it was blind.** The bundler deletes module
  comments, so one ghost token reported while the region sat in the monolith reported as zero the
  moment the same text moved into a module.
- **`i18n-scan.js` turned green.** A table written `UI_STRINGS.pl={` comes back `UI_STRINGS.pl = {`
  and closed `  };` rather than `};`; the parser matched both literally, found no table, printed
  `No UI_STRINGS tables found` and **exited 0**. Two things changed with the subject: the spelling
  is now matched loosely, because requiring one spelling was an undeclared formatting contract on
  the source, and finding no table at all is now a failure.
- **`storage-keys.js` lost no key and every place.** Strings survive the reprint, so the key map
  was right; but one source line holding `lsGet("pbThing"); lsSet("pbThing", 1);` comes back as
  two lines of a generated file, and neither is a line anyone can open.
- **`css-dead.js` lost nothing at all**, and case 21 asserts that the two readings still agree, so
  that if they ever stop somebody finds out why. It moved for the place and for the subject.

The cases that matter most are 9 to 12: the same four scans over the reading with `src/modules/`
omitted, where every needle must vanish. Without them cases 5 to 8 would prove only that the
scans print something.

**What this does not answer** is whether the build dropped something `src/` has. That is a build
question: `build-fresh.mjs` and `tools/split-guard/` own it, and a name reached only through
`window[...]` is exactly `--scan`'s first rule.

**The two readings are tied together rather than trusted.** The artefact is
`head + bundle + monolith + tail`; three of those four are copied in verbatim, so `[2b/5]` of
`test.js` proves them equal by position in a millisecond. The fourth is the bundle, and only a
build can speak for it, which is `tests/build-fresh.mjs`: it runs `tools/build.mjs`, compares, and
puts the bytes back as it found them, so a failing run leaves the tree alone. A hand edit to
`engine/etiuda.html` is discarded by the next build, and between them these two say so out loud.

## The contracts a rename must not touch

`[3g/5]` of `test.js` holds three things the `PB_` to `E_` pass of 2026-09-13 deliberately left
standing, each invisible to every other instrument here:

- **The two globals that arrive from outside.** A catalog file declares `window.PB_CATALOG` and
  the sample declares `window.PB_SAMPLE`; one of them is written by a release already on people's
  machines. Rename either end and a catalog silently stops loading. The check asserts each
  contract inside the declaration that carries it, with comments blanked and strings kept.
- **The storage prefix.** `E_NS` is evaluated with `eEmbeddedCatalog` stubbed both ways and must
  answer `"pb"` with no catalog and start with `"pb"` with one; the boot script's Reset filter
  must clear keys by the same literal. Move one without the other and the app comes up empty and
  correct. This is expected to change at step 6 of spec section 8, deliberately and in one commit.
- **Every user-visible string.** A digest of the 747 interface pairs, both halves, sorted. It is a
  **ratchet**, like the comment budget: when the words change on purpose, `UI_STRINGS_COUNT` and
  `UI_STRINGS_SHA256` change in the same commit. When they change and nobody meant it, something
  mechanical has rewritten what people read.

Every one of these was proved by rejection before it was kept: eleven falsifiers, one mutation
each, all eleven failing the run, and one acceptance - the same strings in a different order,
which is not a change to what anybody reads and does not fire.

## The instruments that are not here

The structural gates live in `tools/` and have their own self-tests: `split-guard/guard.mjs` for
a name that no longer reaches across a module boundary, `split-guard/cycles.mjs` for a load-time
cycle the bundler would turn into a silent `undefined`, `same-program.mjs` for whether a rewrite
is the same program, and `bundler-probe/` for the build options this project depends on.
`npm run split-guard` runs both self-tests and then the sentinel itself against `src/`.

### The split guard is two instruments, and they answer different questions

    node tools/split-guard/guard.mjs
    node tools/split-guard/guard.mjs --scan src/main.js src/monolith.js src/modules/*.js

The first is **the sentinel**. It defines every name the source declares to `__PB_UNBOUND_<name>`
and lets esbuild's own scope analysis decide where that substitution lands: `define` is skipped
wherever the identifier is bound, by an import, a declaration or a parameter, so a sentinel
surviving into the bundle is by construction a reference that resolved to nothing local. It is
exhaustive over code paths, which no browser suite can be.

The second is **`--scan`**, two text rules over whatever files are named: a name reached through
`window[...]`, and a name declared at the top level of two modules. It takes its files
positionally and refuses an empty set. It says nothing whatever about bindings, so a report
quoting `0 dynamic global lookups, 0 duplicated top-level names, 0 global writes` is quoting
`--scan` and has not run the sentinel.

**The sentinel's verdicts are partitioned, and only one half is a failure.**

| Where the name is declared | Verdict | Why |
|---|---|---|
| the top level of `src/monolith.js` | `note`, exit unaffected | the monolith is spliced into the same `<script>` as the bundle's iife and at its top level, so the free reference resolves to its live binding |
| the top level of another module | `FAIL`, counted in the exit code | a module binding is reachable only by importing it; what makes such a reference work today is `src/main.js`'s `Object.assign` bridge, which copies a value once and goes stale the moment the declaring module reassigns it |

The exit code is the number of failures, so zero means every module holds the names it uses.
A refusal exits 78 and prints no tally, the same convention the smoke run keeps.

Both halves are proved by rejection in `selftest.mjs`, cases 22 to 33: one tree where the name is
still in the monolith, which must come back `note` and exit 0, and the same tree with the name
moved into a module it does not import, which must come back `FAIL` and exit 1.

**The names come from `src/`, never from `engine/etiuda.html`.** esbuild reprints a module's
declarations indented, inside the iife, where the census cannot see them, so an artefact-sourced
name list loses a name at the exact moment it moves into a module: measured by doing the
extraction, the forgotten reference stopped being reported and the run went from 17 findings to
16. A gate that grows quieter as the hazard arrives is worse than no gate.

What the sentinel does not see is a name deleted from `src/` altogether. The names it defines are
the names the source declares, so such a name takes its own sentinel with it. That class wants a
free-identifier census against a list of host globals, which is a different instrument.

## Where the content comes from

A catalog is somebody's content and this repository is public, so no catalog is here and none
ever will be. `ETIUDA_FIXTURES` names a folder outside this tree holding three files:

| File | What it is |
|------|------------|
| `etiuda-catalog.js` | the catalog the smoke run boots against |
| `sample-catalog.js` | the invented sample the engine offers when no catalog is beside it |
| `search-eval.js` | the search evaluation cases for `test.js` section 5 |

The harness never copies any of them into this tree. `engine.js` builds a run folder in the
system temp directory, puts the engine and the fixtures in it together, and removes it
afterwards, because the engine loads its catalog as a sibling of the HTML file. A fixtures
folder that resolves inside this repository is refused: the ignore file here is a blocklist held
up by a filename convention, and content kept in the tree is one forced add from publication.

There is no default and no search path. A harness that quietly finds a catalog somewhere is a
harness that can quietly find the wrong one.

## What a run says

A completed smoke run exits with the number of failed checks, so zero means every check passed.
**A run that could not start, or that stopped part way, exits 78 and says `SUITE DID NOT
COMPLETE`.** That number exists because of a real reading: with the catalog absent, `smoke.js`
used to die at the seventh intent row after 70 of its 119 checks, printing no failure and no
tally, and a caller reading the log saw seventy passes and nothing else.

So read the last line, not the count. A count without a verdict beside it is not a result.

## Fixtures are invented

A test catalog trimmed down from a real one is a real one with fewer rows. `sample-catalog.js`
is written from nothing and is the format's worked example.

## The 1.x scripts still at the root

`test.js`, `smoke.js` and their neighbours also sit at the root of this tree, ignored by git.
They are 1.x leftovers, they read the redirect stub, and they are not the harness. Run what is
in this folder.
