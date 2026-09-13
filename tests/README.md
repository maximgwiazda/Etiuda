# The harness

The tooling that judges the engine. It lives here because it kept living nowhere: three times in
two days a repair to it existed only in an ignored file on one disk, and a harness one disk from
gone is not an acceptance test.

Everything here runs against `engine/etiuda.html` and `src/`. Nothing here runs against
`Etiuda.html` at the root, which is the redirect stub and was what the harness had been reading.

## Running it

    node tests/engine-selftest.js                    no fixtures, no browser
    node tests/i18n-scan.js                          no fixtures
    node tests/deadcode.js                           no fixtures
    node tests/build-fresh.mjs                       no fixtures, builds once
    node tests/test.js                               sections 1 to 3 without fixtures
    ETIUDA_FIXTURES=<folder> node tests/test.js      all five sections
    ETIUDA_FIXTURES=<folder> node tests/smoke.js     the acceptance run, Chrome
    ETIUDA_FIXTURES=<folder> node tests/smoke.js firefox

`npm test` runs the self-test, `build-fresh.mjs`, `test.js` and `i18n-scan.js`, none of which
needs a fixture or a browser. `npm run smoke` needs both.

`css-dead.js`, `ghosts.js` and `storage-keys.js` are reports rather than gates: they print and
exit 0, and a human reads the list.

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
| a document - does it parse, do the CSS rules agree | `engine/etiuda.html` |

`E.sourceDoc()` is the document as written: `src/template.html` with the app script's anchor
replaced by the modules, the entry and `src/monolith.js`. It is the same shape as the artefact,
so every scan applies to it unchanged, and `at()` turns an offset back into `src/<file>:<line>`,
which the artefact could never say.

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
`npm run split-guard` runs the two self-tests.

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
