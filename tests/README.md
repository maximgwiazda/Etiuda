# The harness

The tooling that judges the engine. It lives here because it kept living nowhere: three times in
two days a repair to it existed only in an ignored file on one disk, and a harness one disk from
gone is not an acceptance test.

Everything here runs against `engine/etiuda.html`. Nothing here runs against `Etiuda.html` at the
root, which is the redirect stub and was what the harness had been reading.

## Running it

    node tests/engine-selftest.js                    no fixtures, no browser
    node tests/i18n-scan.js                          no fixtures
    node tests/deadcode.js                           no fixtures
    node tests/test.js                               sections 1 to 3 without fixtures
    ETIUDA_FIXTURES=<folder> node tests/test.js      all five sections
    ETIUDA_FIXTURES=<folder> node tests/smoke.js     the acceptance run, Chrome
    ETIUDA_FIXTURES=<folder> node tests/smoke.js firefox

`npm test` runs the self-test, `test.js` and `i18n-scan.js`, none of which needs a fixture or a
browser. `npm run smoke` needs both.

`css-dead.js`, `ghosts.js` and `storage-keys.js` are reports rather than gates: they print and
exit 0, and a human reads the list.

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
