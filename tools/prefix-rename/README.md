# The prefix rename

Every `PB_` name in the engine became `E_` and every `pb` name became `e`, in one mechanical
pass, on 2026-09-13. `ES_` is reserved for Studio, so the engine takes the single letter. The
spec section is 9.1.

`map.json` is the whole change. It carries every name that moved, every name that deliberately
did not and why, the two sites the prefix rule could not express, and the boundary rule the
substitution used. `apply.mjs` applies it and refuses rather than half-applies: a rename entry
that matches nothing, or a `once` entry that matches other than exactly once, stops the run
before anything is written.

## Reproducing the pass

The map applies to `engine/etiuda.html` as it stood at `5251902`, so the baseline comes out of
git rather than off disk:

    git show 5251902:engine/etiuda.html > /tmp/baseline.html
    node tools/prefix-rename/apply.mjs /tmp/baseline.html /tmp/renamed.html
    cmp /tmp/renamed.html engine/etiuda.html

Naming one or more classes applies that part alone, which is how the three commits were made and
how each was checked on its own:

    node tools/prefix-rename/apply.mjs in.html out.html const
    node tools/prefix-rename/apply.mjs in.html out.html js
    node tools/prefix-rename/apply.mjs in.html out.html doc

The three in that order give the same bytes as the whole map in one pass, measured.

`tools/same-program.mjs` takes it from there: the mapped baseline against the committed engine
is the same program, which says the artifact in the tree is the map and nothing besides.

## What did not move, and why it would be a defect if it had

**STRUCK 2026-09-14. The two globals that arrive from outside the engine.** Every catalog in
existence declares `window.PB_CATALOG`, and a 1.x engine cannot write any other name, so renaming
the literal would strand the content; the new name arrives with the v1 reader, which reads both
and writes one. `window.PB_SAMPLE` is the same shape, declared by the sample catalog beside the
engine. The
census of both is `ALLOWED_GLOBAL` in `tools/split-guard/guard.mjs`, which is the list to read
before deciding that a name belongs to this engine.

> The reasoning above held while one engine had to read both formats. It stopped holding when
> the catalog format took a clean break: this engine reads format 2 only, a file of the older
> format is converted once by `tools/catalog-v2`, and the globals are now `window.E_CATALOG` and
> `window.E_SAMPLE`. The pass this document records did the right thing at the time, and the
> paragraph is struck rather than rewritten because the document is an account of that pass.

**STRUCK 2026-09-14, at D4. The storage prefix and every stored key.** A key is a promise to a
browser that has already written it. `E_NS` still answers `"pb"`, the Reset filter still matches
`pb`, and the twenty-six preference and session keys still spell themselves the old way. Spec
section 3 re-keys all of this as one deliberate act; doing half of it here would have cost a
person their settings for no gain.

> Taken as its own step rather than as part of this pass, which is what the paragraph asked for.
> `E_NS` answers `"e"`, every stored key spells itself the new way, and the promise to a browser
> that has already written one is kept by copying at boot rather than by standing still: the old
> keys are read once, written under the new names and LEFT WHERE THEY ARE, because a 1.x engine
> may open the same `file://` origin. The sweeps match a key SHAPE now, since a one-letter
> prefix matched plainly would take a neighbouring page''s keys.

**Anything a reader can see.** No user-facing string in either language contains the prefix, so
this exclusion cost nothing in the event. It is written down because the next pass may not be so
lucky.

One name is in both camps. `pbCollapsed` is a stored key and also a variable holding the same
set in memory; the variable moved and the literal stayed, which is what `freezeStrings` is for.
