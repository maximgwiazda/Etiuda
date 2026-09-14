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

`[3g/5]` of `test.js` holds the contracts a mechanical pass over names must not break, each
invisible to every other instrument here:

- **The two globals that arrive from outside.** A catalog file declares `window.E_CATALOG` and
  the sample declares `window.E_SAMPLE`; both are written by files this engine does not own.
  Rename either end and a catalog silently stops loading. The check asserts each contract
  inside the declaration that carries it, with comments blanked and strings kept. They were
  `PB_` until 2026-09-14, when the clean break on the catalog format took the old names with
  it: nothing here reads format 1 at all.
- **The storage prefix, and the shape it makes.** `E_NS` is evaluated with `eEmbeddedCatalog`
  stubbed both ways and must answer `"e"` with no catalog and `"e<hash>~"` with one. The sweep
  is then checked as a shape rather than a letter, in the two copies that cannot be one:
  `E_KEY_RE` in `storage.js` and the literal in the boot script, which imports nothing. They
  must be the same text, and the shape is RUN over four keys this engine writes and five it does
  not, because on `file://` every local page shares one storage area and a bare `e` would sweep
  a neighbour. Move one without the other and the app comes up empty and correct.
- **No key of the old regime.** After D4 the only `pb` in `src/` is the boot migration's own
  pattern, which is a regex and not a string, so no string literal in the engine names a `pb`
  key. A planted `lsSet("pbGhost",...)` is run through the same rule in the same pass: a rule
  that can only pass is not a rule.
- **Every user-visible string.** A digest of the 747 interface pairs, both halves, sorted. It is a
  **ratchet**, like the comment budget: when the words change on purpose, `UI_STRINGS_COUNT` and
  `UI_STRINGS_SHA256` change in the same commit. When they change and nobody meant it, something
  mechanical has rewritten what people read.

Every one of these was proved by rejection before it was kept: eleven falsifiers, one mutation
each, all eleven failing the run, and one acceptance - the same strings in a different order,
which is not a change to what anybody reads and does not fire.

## The instruments that are not here

The structural gates live in `tools/` and have their own self-tests: `split-guard/guard.mjs` for
a name that no longer reaches across a module boundary, `split-guard/bridge.mjs` for a name that
reaches the monolith as a stale copy rather than a live binding, `split-guard/cycles.mjs` for a
load-time cycle the bundler would turn into a silent `undefined`, `split-guard/cycle-bounds.mjs`
for the three bounds the import cycle is allowed to grow under, `same-program.mjs` for whether a
rewrite is the same program, and `bundler-probe/` for the build options this project depends on.
`npm run split-guard` runs the four self-tests and then the sentinel, the bridge guard and the
cycle bounds against `src/`. `npm test` runs the cycle bounds too, next to the sentinel.

### The three bounds on the import cycle

    node tools/split-guard/cycle-bounds.mjs
    node tools/split-guard/cycle-bounds.mjs --against 56b87df
    node tools/split-guard/cycle-bounds.mjs --no-jump

Maxim's rule of 2026-09-14 07:23 lets the closure-only import cycle grow as the extraction
finishes, under three bounds: exactly one component, never a second even of two; the raw-load
bite test clean at every commit, which is `cycles.mjs` and is not repeated here; and a cut whose
membership delta is tens refused or rerouted. This gate holds the first and the third, and the
property underneath all of them: **nothing in a member runs at load.**

That property is two checks, because one of them is not what a line rule can say.

- **A1, no bare executable statement** at a member's top level. `foo();`, `try{`, an IIFE.
- **A2, no top-level evaluation that reads a binding imported from another member** of the same
  component. `const TAB_EASE = E_EASE;` is a declaration under A1 and under every line rule
  written for this, and it is exactly the load-time cycle the whole gate exists for. Bundled it
  reads `undefined` in silence; unbundled it throws, but only in the evaluation order that
  happens to put the reader first. Planted in one direction on 2026-09-14 the bite test caught
  it; planted in the other, the same fault, the bite test was clean and A2 was not.

Both are read from a walk of the top-level statements rather than from column-0 lines, because
an indented call is at no column a line rule looks at, `letters=1;` begins with `let`, and a
closing `};` is not a statement at all. The self-test carries each of those three as a case.

The third bound prints a **note** and does not fail. The delta, the baseline revision and the
joining files are named, and a person applies Maxim's rule to them. A per-commit delta is
evaded by splitting one cut over two commits, and a legitimate reroute may pass through a wide
intermediate commit, so failing on it would block work the ruling allows while not catching the
shape it forbids. The absolute membership is printed beside the delta, because four commits of
`+5` are what a per-commit rule would miss.

There is a fourth bound since board 328, and it does fail: **a CEILING on the membership.** The
ring was 67 members on 2026-09-14 and was cut to nothing; the constant at the head of the file
records where it was left, and a tree above it fails. The jump note alone could not hold that,
because a ring that grows by four at a time never trips it. While the constant was above zero the
instruction was to lower it whenever a cut landed, and the leg said which number to write.

**It now stands at 0, and three things follow that a reader should not have to derive.** The bound
is no longer a cap on how large one cycle may be; it refuses any cycle at all, including a module
that imports itself, which Tarjan here reports as a component of one. The lowering instruction is
spent: the branch that prints it is `members < CEILING`, and a membership below zero is not a
thing, so that line can never appear again and 0 is where the ratchet ends. And the three bounds
above it are now **vacuous**: they iterate over the members of the component and there are none, so
they print `ok` having measured nothing, and a gate table quoting those three lines as evidence is
quoting an empty loop. They are kept because they are what will speak the moment a cycle comes
back, not because they say anything today.

Proved both ways on 2026-09-14, and the second way is the one that matters. Giving the graph one
edge back - `motion.js` importing a name from `cut-text.js`, which already imports `motion.js` -
takes the leg to `FAIL 2 members` and exit 1 while the component bound above it still prints
`ok 1 component(s)`, so the ceiling is what is doing the work and not its neighbour. The same
planted tree, read by the blob at `6da8d06` where the constant was 26, prints a `note` and exits 0.

**What the ceiling does not cover is now larger than what it covers**, because the ring was cut by
moving calls off the import graph and onto a registry. The three legs below are what read that
registry and the order it is filled in.

The baseline is `HEAD~1` when `src/` is clean and `HEAD` when it is not, or whatever `--against`
names. The tree at that revision is materialised from git into a temporary directory and read by
the same graph builder as the working tree, so the two sides cannot disagree about method.

One control runs on every invocation: the import census this gate builds is diffed **both ways**
against esbuild's own graph, 463 edges over 76 files at `365753f`. A2 is an intersection with
that census, so a census that silently parsed nothing would make the leg vacuous while it
printed `ok`. A count would not have caught that; a set diff does.

Exit 0 clean, 1 a bound failed, 3 the scan could not see, which is not a pass.

### The hooks guard: the valve is on no graph

    node tools/split-guard/hooks-guard.mjs
    node tools/split-guard/hooks-selftest.mjs

`src/modules/hooks.js` is the one-way valve board 328 cut the ring with. A low module that wants
an app-level action no longer imports its home; it calls `hooks.name()`, and `wireHooks` fills
every slot as the first statement of `boot()`. That is a good remedy, and it has a cost this
folder has to carry: those calls are not imports, so **`cycle-bounds` cannot see one of them**. A
cycle of calls can exist with the import graph at zero, and eight edges that used to be visible
stopped being visible on the day the ring reached nothing.

This leg reads the registry itself. Five bounds:

| bound | what it refuses | why the runtime does not already refuse it |
|---|---|---|
| SLOTS against the `wireHooks` literal, diffed **both ways** | a slot declared and unfilled, a key filled and undeclared, a key filled twice | `wireHooks` throws on both, but only when boot runs; a scan says so without a browser |
| every value is `namespace.member`, and the module exports the member | `shed.shedSnapp` | it is `undefined`, and `undefined` reaches the type check only if boot is reached |
| every `hooks.X` anywhere in `src/` names a declared slot | `hooks.typo()` | **nothing refuses this.** The object is frozen with a null prototype, so the lookup is `undefined` and stays silent until the day that line runs |
| every declared slot is looked up somewhere | a slot nothing calls | nothing refuses it, and a contract nobody invokes is decoration |
| `hooks.js` imports nothing | the valve joining a ring | nothing refuses it, and the whole valve argument rests on it |

It exits **3**, which is not a pass, where it cannot see. A module that binds the import under
another name is a note and is still read correctly, because the scan follows the local binding
rather than the word; but `hooks[expr]` with a computed key, an unparsable literal, or an import
form it does not recognise stop the leg rather than pass it.

Check it in a minute: `node tools/split-guard/hooks-selftest.mjs` is 49/49, and every case marked
`(grep)` there is one where a plain grep for the word gives the other answer.

### Whether a slot is ever called, which is a run and not a scan

    ETIUDA_FIXTURES=<folder> npm run hook-coverage
    ETIUDA_FIXTURES=<folder> node tools/split-guard/hooks-coverage.mjs boot

The guard above proves the contract on paper. It cannot prove a slot is ever reached, and a slot
wired and never called is frozen, silent and green at every other instrument here. So this one
runs `smoke.js` with the valve wrapped in counters and reads them back.

The instrument is an opt-in block in `smoke.js`, inert without `ETIUDA_HOOK_COVERAGE`.
`wireHooks` freezes the object as its last act, so standing in front of `Object.freeze` is the one
place a driver can wrap all 54 slots without a line of `src/` changing. Two things it learned the
hard way, both measured on 2026-09-14. The identification is checked rather than assumed: the
wrapped object's keys must be exactly SLOTS or the leg exits 3, because otherwise it would be
counting some other frozen object and reporting it as the valve. And **the counters are carried
across a reload in `window.name`**: loading a catalog ends in `location.reload()`, the
empty-catalog screen calls `sampleReady` eight times before that, and without the carry it read as
zero. A flush through an exposed function on `pagehide` did not arrive, because the binding call is
delivered asynchronously and the document was already gone.

It is **in no script**, because it needs a browser and about two minutes, and because its list is
debt rather than a pass: the slots the acceptance run does not reach are named in the file with the
path nothing drives. A slot that starts being reached comes off that list, and a slot that stops
being reached is a FAIL, so it is a ratchet in both directions.

The `boot` argument is the **control**, not a shortcut. A counter that is not really counting
reports the same set under a run that drives nothing as under the whole suite; one that is counting
reports strictly more. Measured 2026-09-14 with the SAME instrument on both sides, which is the whole of the
control: 18 of 54 slots called under boot alone against 38 under the 149 checks, 36 unreached
against 16, and the 16 are a subset of the 36.

### The boot order, which no gate had ever read

    node tools/split-guard/boot-order.mjs
    node tools/split-guard/boot-order.mjs --write
    node tools/split-guard/boot-order-selftest.mjs

`boot()` in `src/main.js` is 82 top-level statements, and the comment above it says the order IS
the contract: a listener registered earlier runs earlier, and more than one line reads what an
earlier one wrote. Nothing in this folder held an opinion about what that order was, so a statement
moved, added or dropped changed the start-up sequence with every instrument green.

The order is declared in `tools/split-guard/boot-order.list`, one step per line, and the leg
refuses a tree that departs from it. **A step is not the source text**, and that is the whole
design: it is the callee path of the statement, with its first argument where there is one and a
shape tag where the statement is not a plain call. So `try{ if(storage.lsGet("eGlassOff")) ... }`
is `try:storage.lsGet("eGlassOff")`, and the three statements that read a stored flag are told
apart by the key each reads rather than by where each sits. A re-wrap or a rewritten comment must
not be a finding and a reorder must be; the self-test carries both directions, and the negative
one caught a real defect in the first cut of the leg.

The remedy for a change that was meant is `--write` and a sentence in the commit message. That is
the point rather than a nuisance: the diff on that file is where somebody has to say out loud that
the app's start-up order changed.

One bound is checked outside the list: `wireHooks` is the first statement of `boot()`. A slot
called before it is filled is `undefined`, so that single ordering fact carries the whole valve.

### The bridge guard, and why it holds no list of names

    node tools/split-guard/bridge.mjs

`src/main.js` hands the monolith its module names twice over and the two halves are not the same
promise. `Object.assign(globalThis, ...)` **copies** each export once, at load. That is right for
a name nothing ever reassigns and wrong for a name its own module replaces later: the global keeps
the load-time value for ever. One `Object.defineProperty(globalThis, "NAME", { get: () => ns.NAME })`
per such name is the repair, and a missing one is silent - measured twice on 2026-09-13, with the
two `columns` accessors deleted and then the three `shortcuts` ones, this suite reporting 119 of
119 both times while a browser read `colLastN` 0 and `colAvailW` 0 against 3 and 1476, and
`scReady` false with both chord maps empty against 29 keys.

The gate derives the requirement rather than keeping a list of the thirteen:

> An exported name written anywhere **below its module's own top level** needs an accessor,
> because the copy `Object.assign` takes is taken after the top level has run and before anything
> below it can run.

Brace depth over source with comments, strings and regex literals masked is how "below the top
level" is decided, and it over-approximates - a write inside a top-level `if` counts too. That
direction is deliberate: a false positive costs one harmless line in `src/main.js`, a false
negative costs a wrong reading on screen with a green suite.

**Why not a runtime check that reads the names back out of a booted page.** Because it is
coverage-dependent and nothing checks the coverage. Measured on 2026-09-13 with all thirteen
accessors deleted and a probe bundle exposing the live module namespaces beside the globals: a
page left at `load` with the adoption dialog unanswered sees **6 of 13** diverge; the same page
driven the way `smoke.js` boots it sees **12 of 13**. The thirteenth is `eSpellFix`, which
diverges only once a misspelled search has run. The static rule sees all thirteen in a fifth of a
second with no browser and no fixture.

That probe is committed, as `split-guard/bridge-live.mjs`, and wired into no script. It builds an
entry that imports `src/main.js` and then every module a second time, hangs the namespace objects
on `__NS`, boots the page through the same adoption walk `smoke.js` uses and compares
`globalThis[name]` with the live binding by `Object.is`. It is how the gate's text rules are
checked against the running program, and it is the only thing here that would see a write which
reaches a binding without naming it.

`bridge-selftest.mjs` proves it by rejection, thirty-two cases: the two measured deletions in the
small, an accessor that names a name its module does not export, one that names the wrong module,
one that binds a different name, a newly reassigned export nobody has written down anywhere, the
release direction where a name that stops changing becomes a note, the four write forms including
a destructuring target that names no operator, and four shapes that must **not** fire - a property
write, an equality test, a shadowed local and a write at the module top level.

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
ever will be. `ETIUDA_FIXTURES` names a folder outside this tree:

| File | What it is |
|------|------------|
| `etiuda-catalog-v2.js` | the catalog the smoke run boots against, format 2 |
| `sample-catalog-v2.js` | the invented sample the engine offers when no catalog is beside it |
| `etiuda-catalog.js` | the same catalog in format 1, which section 4's linter still reads |
| `sample-catalog.js` | the format 1 sample, kept beside it for the same reason |
| `search-eval.js` | the search evaluation cases for `test.js` section 5 |

**The name in the fixtures folder is not the name beside the engine.** A run folder gets the
format 2 file under the sibling name the engine looks for, `etiuda-catalog.js`, because that
name is written into the engine and one fixed name is what makes a sibling work with no
configuration. `engine.js` holds both tables, `FIXTURE_FILE` and `SIBLING_AS`.

**Section 4 of `test.js` is still a format 1 linter** and still reads the format 1 file, which
is why both are kept. The engine stopped reading that format on 2026-09-14; the linter follows
at the validation step, and until it does it lints a format nothing loads.

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

## The rules file a fresh clone arrives without

`CLAUDE.md` at the root is not part of this repository. It is copied in from its source, which
is kept privately outside this tree and is where it is edited, and `.gitignore` holds it back so
that the copy stays a copy. It is never committed and never `git add`ed, here or anywhere.

So a fresh clone has no copy, and the way to a current one is to ask for it. Writing a fresh one
from what the tree seems to imply is the failure this paragraph exists to prevent.
